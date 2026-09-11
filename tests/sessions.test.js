// Taak #127 — GET /api/sessions. Bewijst zowel de basiswerking (eigen
// sessies terugkrijgen, juiste velden) als de tenant-/therapeut-isolatie
// (nooit sessies van een collega of een andere praktijk) via de echte
// route/worker, niet enkel de db.js-helper (die staat al onder test in
// multi-tenancy.test.js).

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import { handleRegister, handleLogin } from "../src/routes/auth.js";
import { handleInviteUser } from "../src/routes/admin.js";
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

test("GET /api/sessions: zonder token -> 401", async () => {
  const env = makeEnv();
  const res = await worker.fetch(jsonRequest("https://x/api/sessions", "GET"), env);
  assert.equal(res.status, 401);
});

test("GET /api/sessions: geeft enkel de eigen sessies terug, met de juiste velden", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Sessies",
    email: "eigenaar-sessies@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  await savePatientSession(env.DB, {
    id: newId(),
    organizationId: practice.organizationId,
    therapistId: practice.userId,
    patientLabel: "Patiënt 1",
    role: "therapist",
    lang: "nl",
    answers: { q1: "ja" },
    clockHighlights: [],
    result: { top: "Lever-Qi stagnatie" },
  });
  await savePatientSession(env.DB, {
    id: newId(),
    organizationId: practice.organizationId,
    therapistId: practice.userId,
    patientLabel: "Patiënt 2",
    role: "therapist",
    lang: "nl",
    answers: { q1: "nee" },
    clockHighlights: [],
    result: { top: "Milt-Qi deficiëntie" },
  });

  const res = await worker.fetch(
    authedRequest("https://x/api/sessions", "GET", practice.token),
    env
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.sessions.length, 2);
  // Volgorde is ORDER BY created_at DESC (listPatientSessions in db.js) —
  // niet apart hertest hier: created_at heeft in SQLite seconde-resolutie,
  // dus twee sessies binnen dezelfde testrun kunnen gelijke created_at
  // hebben. We toetsen enkel dat beide labels aanwezig zijn.
  assert.deepEqual(
    data.sessions.map((s) => s.patientLabel).sort(),
    ["Patiënt 1", "Patiënt 2"]
  );
  // enkel de bedoelde, niet-gevoelige velden — nooit answers/result hier
  assert.deepEqual(Object.keys(data.sessions[0]).sort(), [
    "createdAt",
    "id",
    "lang",
    "patientLabel",
    "role",
  ]);
});

test("GET /api/sessions: lege lijst (nog geen sessie) is gewoon een lege array, geen fout", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Leeg",
    email: "eigenaar-leeg@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const res = await worker.fetch(
    authedRequest("https://x/api/sessions", "GET", practice.token),
    env
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.sessions, []);
});

test("GET /api/sessions: praktijk B ziet nooit sessies van praktijk A", async () => {
  const env = makeEnv();
  const orgA = await registerPractice(env, {
    name: "Praktijk A Sessies",
    email: "eigenaar-a-sessies@example.com",
    ownerName: "Eigenaar A",
    password: "correcthorsebattery",
  });
  const orgB = await registerPractice(env, {
    name: "Praktijk B Sessies",
    email: "eigenaar-b-sessies@example.com",
    ownerName: "Eigenaar B",
    password: "correcthorsebattery",
  });

  await savePatientSession(env.DB, {
    id: newId(),
    organizationId: orgA.organizationId,
    therapistId: orgA.userId,
    patientLabel: "Enkel voor A",
    role: "therapist",
    lang: "nl",
    answers: {},
    clockHighlights: [],
    result: {},
  });

  const resB = await worker.fetch(authedRequest("https://x/api/sessions", "GET", orgB.token), env);
  assert.equal(resB.status, 200);
  const dataB = await resB.json();
  assert.deepEqual(dataB.sessions, []);
});

test("GET /api/sessions: therapeut binnen dezelfde praktijk ziet niet de sessies van een collega", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Collega's",
    email: "eigenaar-collegas@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  // Eigenaar nodigt een tweede therapeut uit (taak #73-route), en die
  // therapeut logt vervolgens zelf in (het uitnodigings-e-mailflow zelf
  // valt buiten deze test — enkel het multi-tenancy-effect telt hier).
  const inviteRes = await handleInviteUser(
    authedRequest("https://x/api/admin/users", "POST", owner.token, {
      name: "Collega",
      email: "collega@example.com",
      password: "correcthorsebattery",
      role: "therapist",
    }),
    env,
    { session: { organizationId: owner.organizationId, userId: owner.userId, role: "owner" } }
  );
  assert.equal(inviteRes.status, 201);

  const loginRes = await handleLogin(
    jsonRequest("https://x/api/auth/login", "POST", {
      email: "collega@example.com",
      password: "correcthorsebattery",
    }),
    env
  );
  assert.equal(loginRes.status, 200);
  const collega = await loginRes.json();

  await savePatientSession(env.DB, {
    id: newId(),
    organizationId: owner.organizationId,
    therapistId: owner.userId,
    patientLabel: "Sessie van de eigenaar",
    role: "therapist",
    lang: "nl",
    answers: {},
    clockHighlights: [],
    result: {},
  });

  const resCollega = await worker.fetch(
    authedRequest("https://x/api/sessions", "GET", collega.token),
    env
  );
  assert.equal(resCollega.status, 200);
  const dataCollega = await resCollega.json();
  assert.deepEqual(dataCollega.sessions, []);
});

// --- Sessiedetail (taak #129) ---

test("GET /api/sessions/:id: zonder token -> 401", async () => {
  const env = makeEnv();
  const res = await worker.fetch(jsonRequest("https://x/api/sessions/abc", "GET"), env);
  assert.equal(res.status, 401);
});

test("GET /api/sessions/:id: eigen sessie -> volledige detail (answers/clockHighlights/result geparsed)", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Detail",
    email: "eigenaar-detail@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const sessionId = newId();
  await savePatientSession(env.DB, {
    id: sessionId,
    organizationId: practice.organizationId,
    therapistId: practice.userId,
    patientLabel: "Patiënt Detail",
    role: "therapist",
    lang: "nl",
    answers: { s0safety_q1: 0, s1_q1: 2 },
    clockHighlights: ["lever", "milt"],
    result: {
      patterns: [{ pattern: "Lever Qi stagnatie", count: 4, group: "Hout", confidence: "strong" }],
      topPattern: "Lever Qi stagnatie",
    },
  });

  const res = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}`, "GET", practice.token),
    env
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.session.id, sessionId);
  assert.equal(data.session.patientLabel, "Patiënt Detail");
  assert.deepEqual(data.session.answers, { s0safety_q1: 0, s1_q1: 2 });
  assert.deepEqual(data.session.clockHighlights, ["lever", "milt"]);
  assert.equal(data.session.result.topPattern, "Lever Qi stagnatie");
  assert.equal(data.session.result.patterns.length, 1);
});

test("GET /api/sessions/:id: onbestaand ID -> 404", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Detail 404",
    email: "eigenaar-detail-404@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const res = await worker.fetch(
    authedRequest("https://x/api/sessions/does-not-exist", "GET", practice.token),
    env
  );
  assert.equal(res.status, 404);
});

test("GET /api/sessions/:id: sessie van andere praktijk -> 404 (nooit 403, geen bevestiging dat het ID bestaat)", async () => {
  const env = makeEnv();
  const orgA = await registerPractice(env, {
    name: "Praktijk Detail A",
    email: "eigenaar-detail-a@example.com",
    ownerName: "Eigenaar A",
    password: "correcthorsebattery",
  });
  const orgB = await registerPractice(env, {
    name: "Praktijk Detail B",
    email: "eigenaar-detail-b@example.com",
    ownerName: "Eigenaar B",
    password: "correcthorsebattery",
  });

  const sessionId = newId();
  await savePatientSession(env.DB, {
    id: sessionId,
    organizationId: orgA.organizationId,
    therapistId: orgA.userId,
    patientLabel: "Enkel voor A",
    role: "therapist",
    lang: "nl",
    answers: {},
    clockHighlights: [],
    result: {},
  });

  const res = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}`, "GET", orgB.token),
    env
  );
  assert.equal(res.status, 404);
});

test("GET /api/sessions/:id: sessie van een collega binnen dezelfde praktijk -> 404", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Detail Collega",
    email: "eigenaar-detail-collega@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const inviteRes = await handleInviteUser(
    authedRequest("https://x/api/admin/users", "POST", owner.token, {
      name: "Collega",
      email: "collega-detail@example.com",
      password: "correcthorsebattery",
      role: "therapist",
    }),
    env,
    { session: { organizationId: owner.organizationId, userId: owner.userId, role: "owner" } }
  );
  assert.equal(inviteRes.status, 201);

  const loginRes = await handleLogin(
    jsonRequest("https://x/api/auth/login", "POST", {
      email: "collega-detail@example.com",
      password: "correcthorsebattery",
    }),
    env
  );
  const collega = await loginRes.json();

  const sessionId = newId();
  await savePatientSession(env.DB, {
    id: sessionId,
    organizationId: owner.organizationId,
    therapistId: owner.userId,
    patientLabel: "Sessie van de eigenaar",
    role: "therapist",
    lang: "nl",
    answers: {},
    clockHighlights: [],
    result: {},
  });

  const res = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}`, "GET", collega.token),
    env
  );
  assert.equal(res.status, 404);
});
