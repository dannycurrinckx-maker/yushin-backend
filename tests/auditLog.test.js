// Taak #133 — GET /api/admin/audit-log, en de logregels die ontstaan als
// bijeffect van bestaande acties (inloggen, sessie bekijken, teamlid
// uitnodigen/deactiveren). Test zowel het leesscherm zelf (auth, tenant-
// isolatie) als de daadwerkelijke schrijf-hooks in auth.js/sessions.js/
// admin.js — via de echte route/worker, net als sessions.test.js.

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import { handleRegister, handleLogin } from "../src/routes/auth.js";
import { handleInviteUser, handleRemoveUser } from "../src/routes/admin.js";
import worker from "../src/index.js";
import { savePatientSession, newId } from "../src/lib/db.js";

function jsonRequest(url, method, body) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function authedRequest(url, method, token, body) {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeEnv() {
  return { DB: createFakeD1(), APP_ENV: "test" };
}

async function registerPractice(env, { name, email, ownerName, password }) {
  const res = await handleRegister(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: name,
      contactEmail: email,
      ownerName,
      password,
    }),
    env
  );
  assert.equal(res.status, 201);
  const data = await res.json();
  return { token: data.token, organizationId: data.organization.id, userId: data.user.id };
}

async function getAuditLog(env, token) {
  const res = await worker.fetch(authedRequest("https://x/api/admin/audit-log", "GET", token), env);
  return { status: res.status, data: res.status === 200 ? await res.json() : null };
}

test("GET /api/admin/audit-log: zonder token -> 401", async () => {
  const env = makeEnv();
  const res = await worker.fetch(jsonRequest("https://x/api/admin/audit-log", "GET"), env);
  assert.equal(res.status, 401);
});

test("GET /api/admin/audit-log: therapeut (niet-eigenaar) -> 403", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Audit 403",
    email: "eigenaar-audit-403@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const inviteRes = await handleInviteUser(
    authedRequest("https://x/api/admin/users", "POST", owner.token, {
      name: "Collega",
      email: "collega-audit-403@example.com",
      password: "correcthorsebattery",
      role: "therapist",
    }),
    env,
    { session: { organizationId: owner.organizationId, userId: owner.userId, role: "owner" } }
  );
  assert.equal(inviteRes.status, 201);

  const loginRes = await handleLogin(
    jsonRequest("https://x/api/auth/login", "POST", {
      email: "collega-audit-403@example.com",
      password: "correcthorsebattery",
    }),
    env
  );
  const collega = await loginRes.json();

  const res = await worker.fetch(authedRequest("https://x/api/admin/audit-log", "GET", collega.token), env);
  assert.equal(res.status, 403);
});

test("Inloggen (via de echte /api/auth/login-route) schrijft een 'ingelogd'-logregel weg", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Audit Login",
    email: "eigenaar-audit-login@example.com",
    ownerName: "Eigenaar Login",
    password: "correcthorsebattery",
  });

  // Registratie zelf logt NIET (er is geen expliciete /api/auth/login-call
  // tijdens registreren, zie handleRegister) — pas een echte login-poging
  // via de route hieronder zou een regel moeten opleveren.
  const { data: beforeLogin } = await getAuditLog(env, owner.token);
  assert.deepEqual(beforeLogin.entries.filter((e) => e.action === "ingelogd"), []);

  const loginRes = await worker.fetch(
    jsonRequest("https://x/api/auth/login", "POST", {
      email: "eigenaar-audit-login@example.com",
      password: "correcthorsebattery",
    }),
    env
  );
  assert.equal(loginRes.status, 200);

  const { data } = await getAuditLog(env, owner.token);
  const loginEntries = data.entries.filter((e) => e.action === "ingelogd");
  assert.equal(loginEntries.length, 1);
  assert.equal(loginEntries[0].actorLabel, "Eigenaar Login");
  assert.equal(loginEntries[0].targetType, "user");
  assert.equal(loginEntries[0].targetId, owner.userId);
});

test("Een teamlid uitnodigen schrijft een 'gebruiker_uitgenodigd'-logregel weg, met naam+rol in detail", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Audit Invite",
    email: "eigenaar-audit-invite@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const inviteRes = await worker.fetch(
    authedRequest("https://x/api/admin/users", "POST", owner.token, {
      name: "Nieuwe Collega",
      email: "nieuwe-collega-audit@example.com",
      password: "correcthorsebattery",
      role: "therapist",
    }),
    env
  );
  assert.equal(inviteRes.status, 201);
  const invited = await inviteRes.json();

  const { data } = await getAuditLog(env, owner.token);
  const entry = data.entries.find((e) => e.action === "gebruiker_uitgenodigd");
  assert.ok(entry, "verwacht een 'gebruiker_uitgenodigd'-regel");
  assert.equal(entry.targetId, invited.user.id);
  assert.equal(entry.detail, "Nieuwe Collega (therapist)");
  assert.equal(entry.actorLabel, "Eigenaar");
});

test("Een teamlid deactiveren schrijft een 'gebruiker_gedeactiveerd'-logregel weg", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Audit Remove",
    email: "eigenaar-audit-remove@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const inviteRes = await worker.fetch(
    authedRequest("https://x/api/admin/users", "POST", owner.token, {
      name: "Te Verwijderen",
      email: "te-verwijderen-audit@example.com",
      password: "correcthorsebattery",
      role: "therapist",
    }),
    env
  );
  const invited = await inviteRes.json();

  const removeRes = await worker.fetch(
    authedRequest(`https://x/api/admin/users?userId=${invited.user.id}`, "DELETE", owner.token),
    env
  );
  assert.equal(removeRes.status, 200);

  const { data } = await getAuditLog(env, owner.token);
  const entry = data.entries.find((e) => e.action === "gebruiker_gedeactiveerd");
  assert.ok(entry, "verwacht een 'gebruiker_gedeactiveerd'-regel");
  assert.equal(entry.targetId, invited.user.id);
  assert.equal(entry.detail, "Te Verwijderen (te-verwijderen-audit@example.com)");
});

test("Een sessiedetail bekijken schrijft een 'session_bekeken'-logregel weg — ZONDER klinische inhoud in detail/targetType-velden", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Audit Sessie",
    email: "eigenaar-audit-sessie@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const sessionId = newId();
  await savePatientSession(env.DB, {
    id: sessionId,
    organizationId: owner.organizationId,
    therapistId: owner.userId,
    patientLabel: "Uiterst gevoelig dossiernummer 42",
    role: "therapist",
    lang: "nl",
    answers: { s0safety_q1: 0 },
    clockHighlights: [],
    result: { patterns: [{ pattern: "Lever Qi stagnatie", count: 3, confidence: "strong" }] },
  });

  const detailRes = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}`, "GET", owner.token),
    env
  );
  assert.equal(detailRes.status, 200);

  const { data } = await getAuditLog(env, owner.token);
  const entry = data.entries.find((e) => e.action === "session_bekeken");
  assert.ok(entry, "verwacht een 'session_bekeken'-regel");
  assert.equal(entry.targetId, sessionId);
  assert.equal(entry.targetType, "patient_session");
  // Kern van taak #133: nooit de patiëntlabel/resultaten in de auditlog.
  assert.equal(entry.detail, null);
  assert.ok(!JSON.stringify(entry).includes("Lever Qi stagnatie"));
  assert.ok(!JSON.stringify(entry).includes("dossiernummer"));
});

test("De sessielijst (GET /api/sessions) opvragen schrijft GEEN logregel weg — enkel het detail wel", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Audit Lijst",
    email: "eigenaar-audit-lijst@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  await savePatientSession(env.DB, {
    id: newId(),
    organizationId: owner.organizationId,
    therapistId: owner.userId,
    patientLabel: "Patiënt X",
    role: "therapist",
    lang: "nl",
    answers: {},
    clockHighlights: [],
    result: {},
  });

  const listRes = await worker.fetch(authedRequest("https://x/api/sessions", "GET", owner.token), env);
  assert.equal(listRes.status, 200);

  const { data } = await getAuditLog(env, owner.token);
  assert.deepEqual(data.entries.filter((e) => e.action === "session_bekeken"), []);
});

test("GET /api/admin/audit-log: praktijk B ziet nooit de logregels van praktijk A (tenant-isolatie)", async () => {
  const env = makeEnv();
  const orgA = await registerPractice(env, {
    name: "Praktijk Audit A",
    email: "eigenaar-audit-a@example.com",
    ownerName: "Eigenaar A",
    password: "correcthorsebattery",
  });
  const orgB = await registerPractice(env, {
    name: "Praktijk Audit B",
    email: "eigenaar-audit-b@example.com",
    ownerName: "Eigenaar B",
    password: "correcthorsebattery",
  });

  // Genereert minstens één logregel bij praktijk A (het uitnodigen hierboven).
  await worker.fetch(
    authedRequest("https://x/api/admin/users", "POST", orgA.token, {
      name: "Collega A",
      email: "collega-audit-a@example.com",
      password: "correcthorsebattery",
      role: "therapist",
    }),
    env
  );

  const { data: dataB } = await getAuditLog(env, orgB.token);
  // Praktijk B heeft zelf enkel de eigen registratie/login-achtige activiteit
  // (hier: geen, want registreren zelf logt niet) — de kern van de test is
  // dat praktijk A's regel er zeker niet tussen staat.
  assert.ok(!dataB.entries.some((e) => e.detail && e.detail.includes("Collega A")));
  assert.ok(dataB.entries.every((e) => true)); // sanity: geen crash op een lege/lijst-response
});

test("GET /api/admin/audit-log: lege lijst (nog geen enkele gelogde actie) is gewoon een lege array", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Audit Leeg",
    email: "eigenaar-audit-leeg@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const { status, data } = await getAuditLog(env, owner.token);
  assert.equal(status, 200);
  assert.deepEqual(data.entries, []);
});
