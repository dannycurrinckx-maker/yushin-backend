// Taak #141b — sessielimiet voor gratis testaccounts (migratie 0007:
// organizations.trial_session_limit / access_codes.session_limit). Dit is
// een AANVULLING op de bestaande trial.test.js (die enkel het bestaande,
// simpelere "trialing = altijd geblokkeerd" gedrag test): hier testen we
// specifiek de nieuwe, optionele harde limiet die een 'free'-toegangscode
// kan meegeven, zodat een testpraktijk na N gratis analyses weer op slot
// gaat i.p.v. voor altijd onbeperkt toegang te houden.

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import { handleRegister } from "../src/routes/auth.js";
import worker from "../src/index.js";
import { isTrialLimitReached, trialLimitMessage } from "../src/lib/trial.js";

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
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeEnv() {
  return { DB: createFakeD1(), APP_ENV: "test" };
}

async function registerOwner(env, contactEmail) {
  const res = await handleRegister(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: "Praktijk Sessielimiet",
      contactEmail,
      ownerName: "Owner",
      password: "correcthorsebattery",
    }),
    env
  );
  return res.json();
}

async function walkFullFlow(env, token, context, { maxSteps = 300 } = {}) {
  const answers = {};
  for (let i = 0; i < maxSteps; i++) {
    const nextRes = await worker.fetch(
      authedRequest("https://x/api/flow/next", "POST", token, { lang: "nl", context, answers }),
      env,
      {}
    );
    const nextData = await nextRes.json();
    if (nextRes.status !== 200) return { blockedAt: "next", status: nextRes.status, data: nextData };
    if (nextData.done) return { answers, done: true };
    const answerRes = await worker.fetch(
      authedRequest("https://x/api/flow/answer", "POST", token, { lang: "nl", context, answers, key: nextData.key, optionIndex: 0 }),
      env,
      {}
    );
    if (answerRes.status !== 200) return { blockedAt: "answer", status: answerRes.status, data: await answerRes.json() };
    answers[nextData.key] = 0;
  }
  throw new Error("walkFullFlow: geen 'done' bereikt binnen maxSteps");
}

async function completeOneAnalysis(env, token) {
  const context = { role: "therapeut", female: false, pediatric: false };
  const { answers } = await walkFullFlow(env, token, context);
  const res = await worker.fetch(
    authedRequest("https://x/api/flow/result", "POST", token, { lang: "nl", context, answers }),
    env,
    {}
  );
  return res;
}

async function redeemFreeCodeWithLimit(env, token, code, sessionLimit) {
  await env.DB
    .prepare(
      "INSERT INTO access_codes (id, code, kind, max_uses, note, session_limit) VALUES (?, ?, 'free', NULL, 'test', ?)"
    )
    .bind("ac-" + code, code, sessionLimit)
    .run();
  const res = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", token, { code }),
    env,
    {}
  );
  assert.equal(res.status, 200);
  return res.json();
}

// --- Unit-tests op isTrialLimitReached met sessionCount -------------------

test("isTrialLimitReached: met sessionLimit geblokkeerd zodra sessionCount de limiet bereikt", () => {
  const org = { subscription_status: "active", trial_session_limit: 5 };
  assert.equal(isTrialLimitReached(org, 4), false);
  assert.equal(isTrialLimitReached(org, 5), true);
  assert.equal(isTrialLimitReached(org, 6), true);
});

test("isTrialLimitReached: zonder trial_session_limit (null) nooit geblokkeerd op basis van sessionCount", () => {
  const org = { subscription_status: "active", trial_session_limit: null };
  assert.equal(isTrialLimitReached(org, 999), false);
});

test("trialLimitMessage: vermeldt het aantal gratis analyses wanneer de limiet bereikt is", () => {
  const org = { trial_session_limit: 5 };
  const msg = trialLimitMessage(org, 5);
  assert.match(msg, /5/);
});

// --- Router-level end-to-end tests ----------------------------------------

test("router: een 'free'-code met session_limit blokkeert opnieuw zodra de limiet bereikt is", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "sessielimiet-blokkeert@example.com");
  const redeemData = await redeemFreeCodeWithLimit(env, reg.token, "TESTCODE5", 2);
  assert.equal(redeemData.sessionLimit, 2);

  // De eerste twee analyses moeten gewoon lukken...
  for (let i = 0; i < 2; i++) {
    const res = await completeOneAnalysis(env, reg.token);
    assert.equal(res.status, 200, `analyse ${i + 1} had moeten lukken binnen de limiet`);
  }

  // ...en de derde poging (zelfs de allereerste /flow/next-aanroep ervan)
  // moet meteen geblokkeerd worden, VOORDAT er een nieuwe patiëntsessie
  // bijkomt.
  const context = { role: "therapeut", female: false, pediatric: false };
  const blockedRes = await worker.fetch(
    authedRequest("https://x/api/flow/next", "POST", reg.token, { lang: "nl", context, answers: {} }),
    env,
    {}
  );
  assert.equal(blockedRes.status, 402);
  const blockedData = await blockedRes.json();
  assert.equal(blockedData.trialLimitReached, true);
  assert.match(blockedData.error, /2/);

  const { results } = await env.DB
    .prepare("SELECT id FROM patient_sessions WHERE organization_id = ?")
    .bind(reg.organization.id)
    .all();
  assert.equal(results.length, 2, "de geblokkeerde poging mag geen derde sessie hebben aangemaakt");
});

test("router: /api/flow/result blokkeert defensief als de sessielimiet ondertussen (andere tab) bereikt raakte", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "sessielimiet-defensief@example.com");
  await redeemFreeCodeWithLimit(env, reg.token, "TESTCODE1", 1);

  const context = { role: "therapeut", female: false, pediatric: false };
  const { answers } = await walkFullFlow(env, reg.token, context);

  // Simuleer dat de limiet ondertussen al bereikt is (bv. een andere sessie
  // in een ander tabblad rondde net af) vóór dit resultaat opgevraagd wordt.
  await env.DB
    .prepare(
      "INSERT INTO patient_sessions (id, organization_id, therapist_id, patient_label, role, lang, answers_json, clock_highlights_json, result_json) VALUES (?, ?, ?, 'Andere sessie', 'therapist', 'nl', '{}', '[]', '{}')"
    )
    .bind("other-session-1", reg.organization.id, reg.user.id)
    .run();

  const resultRes = await worker.fetch(
    authedRequest("https://x/api/flow/result", "POST", reg.token, { lang: "nl", context, answers }),
    env,
    {}
  );
  assert.equal(resultRes.status, 402);
  const data = await resultRes.json();
  assert.equal(data.trialLimitReached, true);
});

test("router: een 'free'-code ZONDER session_limit (leeg = onbeperkt) blokkeert nooit op aantal analyses", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "sessielimiet-onbeperkt@example.com");
  const redeemData = await redeemFreeCodeWithLimit(env, reg.token, "TESTCODEONBEPERKT", null);
  assert.equal(redeemData.sessionLimit, null);

  for (let i = 0; i < 3; i++) {
    const res = await completeOneAnalysis(env, reg.token);
    assert.equal(res.status, 200, `analyse ${i + 1} had moeten lukken zonder sessielimiet`);
  }
});

test("router: een organisatie met status 'active' via echte betaling wordt NOOIT geblokkeerd door trial_session_limit (die kolom is dan sowieso NULL)", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "sessielimiet-betalend@example.com");
  await env.DB
    .prepare("UPDATE organizations SET subscription_status = 'active', plan = 'solo' WHERE id = ?")
    .bind(reg.organization.id)
    .run();

  for (let i = 0; i < 3; i++) {
    const res = await completeOneAnalysis(env, reg.token);
    assert.equal(res.status, 200);
  }
});
