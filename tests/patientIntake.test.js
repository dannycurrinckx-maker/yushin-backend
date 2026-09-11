// Wachtkamer-QR-intake (taak #134). Twee lagen, net als flow.test.js:
// 1) Token-beheer via de echte router (GET/POST/DELETE /api/patient-intake/token),
//    ingelogd als therapeut/owner.
// 2) De publieke wachtkamer-flow zelf (/api/public/intake/next|answer|result),
//    ZONDER Bearer-token — enkel het patient_intake_token in de body, exact
//    zoals een anonieme patiënt-client dat zou doen na het scannen van een
//    QR-code.

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import { handleRegister } from "../src/routes/auth.js";
import worker from "../src/index.js";

function jsonRequest(url, method, body) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function authedRequestImpl(url, method, token, body) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeEnv() {
  return { DB: createFakeD1(), APP_ENV: "test" };
}

async function registerOwner(env, contactEmail, { active = true } = {}) {
  const res = await handleRegister(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: "Praktijk Wachtkamer",
      contactEmail,
      ownerName: "Owner",
      password: "correcthorsebattery",
    }),
    env
  );
  const data = await res.json();
  // Taak #118 — zelfde reden als in flow.test.js: de meeste scenario's hier
  // gaan niet over toegangsafdwinging zelf, dus activeren we de organisatie
  // meteen, tenzij een test expliciet het trial-geblokkeerde pad wil testen.
  if (active) {
    await env.DB
      .prepare("UPDATE organizations SET subscription_status = 'active' WHERE id = ?")
      .bind(data.organization.id)
      .run();
  }
  return data;
}

async function createToken(env, ownerToken) {
  const res = await worker.fetch(
    authedRequestImpl("https://x/api/patient-intake/token", "POST", ownerToken),
    env,
    {}
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.token);
  return data.token;
}

// Loopt de volledige publieke flow af tot "done", telkens optie 0 kiezend —
// zelfde deterministische aanpak als walkFullFlow in flow.test.js, maar dan
// via het token in de body i.p.v. een Authorization-header.
async function walkFullPublicFlow(env, patientToken, context, { maxSteps = 300 } = {}) {
  const answers = {};
  for (let i = 0; i < maxSteps; i++) {
    const nextRes = await worker.fetch(
      jsonRequest("https://x/api/public/intake/next", "POST", {
        token: patientToken,
        lang: "nl",
        context,
        answers,
      }),
      env,
      {}
    );
    assert.equal(nextRes.status, 200, `unexpected status on /public/intake/next: ${nextRes.status}`);
    const nextData = await nextRes.json();
    if (nextData.done) return { answers, stepsTaken: i };

    const optionIndex = 0;
    const answerRes = await worker.fetch(
      jsonRequest("https://x/api/public/intake/answer", "POST", {
        token: patientToken,
        lang: "nl",
        context,
        answers,
        key: nextData.key,
        optionIndex,
      }),
      env,
      {}
    );
    assert.equal(answerRes.status, 200, `unexpected status on /public/intake/answer voor ${nextData.key}: ${answerRes.status}`);

    answers[nextData.key] = optionIndex;
  }
  throw new Error("walkFullPublicFlow: geen 'done' bereikt binnen maxSteps");
}

// --- Token-beheer --------------------------------------------------------

test("token-beheer: aanmaken, opvragen, intrekken en opnieuw genereren", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "qr-token@example.com");

  const getEmpty = await worker.fetch(
    authedRequestImpl("https://x/api/patient-intake/token", "GET", reg.token),
    env,
    {}
  );
  assert.equal(getEmpty.status, 200);
  assert.equal((await getEmpty.json()).token, null);

  const token1 = await createToken(env, reg.token);

  const getAfterCreate = await worker.fetch(
    authedRequestImpl("https://x/api/patient-intake/token", "GET", reg.token),
    env,
    {}
  );
  assert.equal((await getAfterCreate.json()).token, token1);

  // Opnieuw genereren overschrijft de vorige token stilzwijgend (het
  // intrekkingsmechanisme voor een verloren/gelekte QR-code).
  const token2 = await createToken(env, reg.token);
  assert.notEqual(token1, token2);

  const revokeRes = await worker.fetch(
    authedRequestImpl("https://x/api/patient-intake/token", "DELETE", reg.token),
    env,
    {}
  );
  assert.equal(revokeRes.status, 200);

  const getAfterRevoke = await worker.fetch(
    authedRequestImpl("https://x/api/patient-intake/token", "GET", reg.token),
    env,
    {}
  );
  assert.equal((await getAfterRevoke.json()).token, null);
});

test("token-beheer: vereist een ingelogde sessie (401 zonder Bearer-token)", async () => {
  const env = makeEnv();
  const res = await worker.fetch(jsonRequest("https://x/api/patient-intake/token", "GET"), env, {});
  assert.equal(res.status, 401);
});

// --- Publieke wachtkamer-flow ---------------------------------------------

test("publieke flow: volledige sessie via token geeft resultaat en persisteert als patiëntsessie", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "qr-flow@example.com");
  const token = await createToken(env, reg.token);

  const context = { role: "patient", female: false, pediatric: false };
  const { answers } = await walkFullPublicFlow(env, token, context);
  assert.ok(Object.keys(answers).length > 0);

  const resultRes = await worker.fetch(
    jsonRequest("https://x/api/public/intake/result", "POST", { token, lang: "nl", context, answers }),
    env,
    {}
  );
  assert.equal(resultRes.status, 200);
  const data = await resultRes.json();

  // Geen sessionId naar de patiënt-client (zie toelichting in patientIntake.js).
  assert.equal(data.sessionId, undefined);
  assert.ok(Array.isArray(data.result.patterns));

  // Dataminimalisatie: exact hetzelfde als een reguliere patiënt-sessie.
  assert.equal(data.result.therapyPlan, null);
  assert.deepEqual(data.result.contradictions, []);
  assert.deepEqual(data.result.suggestedQuestions, []);
  data.result.patterns.forEach((p) => assert.equal(p.evidence, undefined));

  const sessionRow = await env.DB
    .prepare("SELECT * FROM patient_sessions WHERE organization_id = ?")
    .bind(reg.organization.id)
    .first();
  assert.ok(sessionRow);
  assert.equal(sessionRow.organization_id, reg.organization.id);
  assert.equal(sessionRow.therapist_id, reg.user.id);
  assert.equal(sessionRow.role, "patient");
});

test("publieke flow: negeert role:'therapeut' uit de body en forceert altijd 'patient'", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "qr-security@example.com");
  const token = await createToken(env, reg.token);

  // Een kwaadwillige client die de publieke route probeert te misbruiken
  // door zich als therapeut voor te doen.
  const spoofedContext = { role: "therapeut", female: true, pediatric: true };
  const { answers } = await walkFullPublicFlow(env, token, spoofedContext);

  const resultRes = await worker.fetch(
    jsonRequest("https://x/api/public/intake/result", "POST", {
      token,
      lang: "nl",
      context: spoofedContext,
      answers,
    }),
    env,
    {}
  );
  assert.equal(resultRes.status, 200);
  const data = await resultRes.json();

  // Ondanks role:"therapeut" in de body, blijft dit server-side een
  // patiëntsessie: geen evidence, geen therapieplan, geen contradicties.
  assert.equal(data.result.therapyPlan, null);
  assert.deepEqual(data.result.contradictions, []);
  data.result.patterns.forEach((p) => assert.equal(p.evidence, undefined));

  const sessionRow = await env.DB
    .prepare("SELECT role FROM patient_sessions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(reg.organization.id)
    .first();
  assert.equal(sessionRow.role, "patient");
});

test("publieke flow: ongeldig of ontbrekend token geeft 401/400, nooit een sessie", async () => {
  const env = makeEnv();
  await registerOwner(env, "qr-invalid@example.com");
  const context = { role: "patient", female: false, pediatric: false };

  const missingTokenRes = await worker.fetch(
    jsonRequest("https://x/api/public/intake/next", "POST", { lang: "nl", context, answers: {} }),
    env,
    {}
  );
  assert.equal(missingTokenRes.status, 400);

  const bogusTokenRes = await worker.fetch(
    jsonRequest("https://x/api/public/intake/next", "POST", {
      token: "dit-bestaat-nergens",
      lang: "nl",
      context,
      answers: {},
    }),
    env,
    {}
  );
  assert.equal(bogusTokenRes.status, 401);
});

test("publieke flow: een ingetrokken token werkt niet meer", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "qr-revoked@example.com");
  const token = await createToken(env, reg.token);

  await worker.fetch(authedRequestImpl("https://x/api/patient-intake/token", "DELETE", reg.token), env, {});

  const res = await worker.fetch(
    jsonRequest("https://x/api/public/intake/next", "POST", {
      token,
      lang: "nl",
      context: { role: "patient", female: false, pediatric: false },
      answers: {},
    }),
    env,
    {}
  );
  assert.equal(res.status, 401);
});

test("publieke flow: geblokkeerd met een patiëntvriendelijke boodschap zolang de praktijk geen toegang heeft", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "qr-trial@example.com", { active: false });
  const token = await createToken(env, reg.token);

  const res = await worker.fetch(
    jsonRequest("https://x/api/public/intake/next", "POST", {
      token,
      lang: "nl",
      context: { role: "patient", female: false, pediatric: false },
      answers: {},
    }),
    env,
    {}
  );
  assert.equal(res.status, 402);
  const data = await res.json();
  assert.equal(data.trialLimitReached, true);
  // Bewust NIET de eigenaarsgerichte boodschap uit trial.js (die spreekt
  // over abonnementen/toegangscodes — niet relevant voor een patiënt).
  assert.ok(!data.error.includes("abonnement"));
});
