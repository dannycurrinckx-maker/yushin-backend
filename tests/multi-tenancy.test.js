// Taak #69 — Multi-tenancy: bewijst dat twee praktijken (organisaties) elkaars
// gegevens nooit kunnen zien, zelfs niet bij verkeerd/kwaadwillig gebruik van
// ID's. Draait tegen dezelfde echte SQLite-engine + echte productiecode als
// tests/auth.test.js (zie fake-d1.js) — geen losse mock van de isolatielogica.

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import { handleRegister } from "../src/routes/auth.js";
import worker from "../src/index.js";
import {
  savePatientSession,
  listPatientSessions,
  getPatientSession,
  listUsersForOrganization,
  assertUserBelongsToOrganization,
  newId,
} from "../src/lib/db.js";

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

// Helper: registreert een praktijk en geeft token + organizationId + userId terug.
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

test("multi-tenancy: patiëntsessies van praktijk A zijn onzichtbaar voor praktijk B", async () => {
  const env = makeEnv();

  const orgA = await registerPractice(env, {
    name: "Praktijk A",
    email: "eigenaar-a@example.com",
    ownerName: "Eigenaar A",
    password: "correcthorsebattery",
  });
  const orgB = await registerPractice(env, {
    name: "Praktijk B",
    email: "eigenaar-b@example.com",
    ownerName: "Eigenaar B",
    password: "correcthorsebattery",
  });

  assert.notEqual(orgA.organizationId, orgB.organizationId);

  const sessionA = {
    id: newId(),
    organizationId: orgA.organizationId,
    therapistId: orgA.userId,
    patientLabel: "Patiënt A1",
    role: "therapist",
    lang: "nl",
    answers: { q1: "ja" },
    clockHighlights: ["lever"],
    result: { top: "Lever-Qi stagnatie" },
  };
  const sessionB = {
    id: newId(),
    organizationId: orgB.organizationId,
    therapistId: orgB.userId,
    patientLabel: "Patiënt B1",
    role: "therapist",
    lang: "nl",
    answers: { q1: "nee" },
    clockHighlights: ["long"],
    result: { top: "Long-Qi zwakte" },
  };

  await savePatientSession(env.DB, sessionA);
  await savePatientSession(env.DB, sessionB);

  // Praktijk A ziet enkel haar eigen sessie in de lijst.
  const listForA = await listPatientSessions(env.DB, orgA.organizationId, orgA.userId);
  assert.equal(listForA.length, 1);
  assert.equal(listForA[0].patient_label, "Patiënt A1");

  const listForB = await listPatientSessions(env.DB, orgB.organizationId, orgB.userId);
  assert.equal(listForB.length, 1);
  assert.equal(listForB[0].patient_label, "Patiënt B1");

  // Kwaadwillig scenario: praktijk B raadt/kent het session-ID van praktijk A
  // (bv. via een sequentieel ID of een gelekt ID) en probeert het rechtstreeks
  // op te vragen met háár EIGEN organizationId. Dit moet altijd null geven —
  // nooit de data van praktijk A.
  const leaked = await getPatientSession(env.DB, orgB.organizationId, sessionA.id);
  assert.equal(leaked, null);

  // Ter controle: met het juiste organizationId werkt het wel.
  const correct = await getPatientSession(env.DB, orgA.organizationId, sessionA.id);
  assert.ok(correct);
  assert.equal(correct.patient_label, "Patiënt A1");
});

test("multi-tenancy: gebruikerslijst van praktijk A bevat nooit gebruikers van praktijk B", async () => {
  const env = makeEnv();

  const orgA = await registerPractice(env, {
    name: "Praktijk C",
    email: "eigenaar-c@example.com",
    ownerName: "Eigenaar C",
    password: "correcthorsebattery",
  });
  const orgB = await registerPractice(env, {
    name: "Praktijk D",
    email: "eigenaar-d@example.com",
    ownerName: "Eigenaar D",
    password: "correcthorsebattery",
  });

  const usersA = await listUsersForOrganization(env.DB, orgA.organizationId);
  const usersB = await listUsersForOrganization(env.DB, orgB.organizationId);

  assert.equal(usersA.length, 1);
  assert.equal(usersA[0].email, "eigenaar-c@example.com");
  assert.equal(usersB.length, 1);
  assert.equal(usersB[0].email, "eigenaar-d@example.com");

  // Geen enkele user van B mag in de lijst van A voorkomen, en omgekeerd.
  const emailsA = usersA.map((u) => u.email);
  const emailsB = usersB.map((u) => u.email);
  assert.ok(!emailsA.includes("eigenaar-d@example.com"));
  assert.ok(!emailsB.includes("eigenaar-c@example.com"));
});

test("multi-tenancy: savePatientSession weigert een therapist/organisatie-combinatie die niet klopt", async () => {
  const env = makeEnv();

  const orgA = await registerPractice(env, {
    name: "Praktijk E",
    email: "eigenaar-e@example.com",
    ownerName: "Eigenaar E",
    password: "correcthorsebattery",
  });
  const orgB = await registerPractice(env, {
    name: "Praktijk F",
    email: "eigenaar-f@example.com",
    ownerName: "Eigenaar F",
    password: "correcthorsebattery",
  });

  // Poging om een sessie op te slaan met de therapist van praktijk A, maar
  // gekoppeld aan het organizationId van praktijk B (bv. door een bug of
  // manipulatie ergens hogerop) — moet hard falen, niet stil slagen.
  await assert.rejects(
    () =>
      savePatientSession(env.DB, {
        id: newId(),
        organizationId: orgB.organizationId,
        therapistId: orgA.userId,
        patientLabel: "Zou nooit mogen bestaan",
        role: "therapist",
        lang: "nl",
        answers: {},
        clockHighlights: [],
        result: {},
      }),
    /Multi-tenancy-schending geweigerd/
  );

  // En de directe guard-functie zelf moet hetzelfde onderscheid maken.
  await assertUserBelongsToOrganization(env.DB, orgA.userId, orgA.organizationId); // mag niet falen
  await assert.rejects(() => assertUserBelongsToOrganization(env.DB, orgA.userId, orgB.organizationId));
});

test("multi-tenancy: sessietoken van praktijk A geeft geen toegang tot beheerroutes van praktijk B (routerniveau)", async () => {
  const env = makeEnv();

  const regA = await worker.fetch(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: "Praktijk G",
      contactEmail: "eigenaar-g@example.com",
      ownerName: "Eigenaar G",
      password: "correcthorsebattery",
    }),
    env,
    {}
  );
  const dataA = await regA.json();

  const regB = await worker.fetch(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: "Praktijk H",
      contactEmail: "eigenaar-h@example.com",
      ownerName: "Eigenaar H",
      password: "correcthorsebattery",
    }),
    env,
    {}
  );
  await regB.json();

  // /api/admin/users is een owner-only route. Het token van praktijk A is
  // geldig en A is owner van HAAR EIGEN organisatie, dus de route-guard laat
  // door (geen 401/403) — en de handler (taak #73, nu volledig geïmplementeerd
  // in src/routes/admin.js) gebruikt ctx.session.organizationId om te bepalen
  // welke users getoond worden, nooit een ID uit de request. Deze test legt
  // vast dat A via deze route uitsluitend haar eigen (ene) gebruiker terugkrijgt
  // — nooit de eigenaar van praktijk B.
  const res = await worker.fetch(authedRequest("https://x/api/admin/users", "GET", dataA.token), env, {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.users.length, 1);
  assert.equal(body.users[0].email, "eigenaar-g@example.com");
  assert.ok(!body.users.some((u) => u.email === "eigenaar-h@example.com"));
});
