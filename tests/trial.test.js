// Taak #118 — toegangsafdwinging (VERVANGT de eerdere automatische
// 14-dagen/5-analyses-proefperiode, taak #114 — zie de git-geschiedenis van
// dit bestand voor de oude tests). Nieuwe, veel simpelere regel: een
// organisatie in status 'trialing' heeft GEEN toegang, punt — geen gratis
// periode, geen gratis aantal verkenningen. Twee lagen: 1) pure unit-tests op
// src/lib/trial.js, 2) end-to-end tests via de echte router die bevestigen
// dat /api/flow/next en /api/flow/result daadwerkelijk blokkeren zolang de
// organisatie 'trialing' is, en dat een organisatie die al betaalt (of een
// 'free'-toegangscode heeft ingewisseld) nooit geblokkeerd wordt.

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import { handleRegister } from "../src/routes/auth.js";
import worker from "../src/index.js";
import { isTrialLimitReached } from "../src/lib/trial.js";

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
      organizationName: "Praktijk Trial",
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

// --- Unit-tests op src/lib/trial.js -------------------------------------

test("isTrialLimitReached: true voor een 'trialing'-organisatie", () => {
  assert.equal(isTrialLimitReached({ subscription_status: "trialing" }), true);
});

test("isTrialLimitReached: false voor 'active'/'past_due'/'canceled'", () => {
  assert.equal(isTrialLimitReached({ subscription_status: "active" }), false);
  assert.equal(isTrialLimitReached({ subscription_status: "past_due" }), false);
  assert.equal(isTrialLimitReached({ subscription_status: "canceled" }), false);
});

test("isTrialLimitReached: false zonder organisatie (defensief)", () => {
  assert.equal(isTrialLimitReached(null), false);
  assert.equal(isTrialLimitReached(undefined), false);
});

// --- Router-level end-to-end tests --------------------------------------

test("router: een gloednieuwe (dus 'trialing') organisatie wordt meteen geblokkeerd, zelfs bij de allereerste /flow/next-aanroep", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "trial-meteen@example.com");

  const context = { role: "therapeut", female: false, pediatric: false };
  const res = await worker.fetch(
    authedRequest("https://x/api/flow/next", "POST", reg.token, { lang: "nl", context, answers: {} }),
    env,
    {}
  );
  assert.equal(res.status, 402);
  const data = await res.json();
  assert.equal(data.trialLimitReached, true);

  // Er mag ook helemaal niets in patient_sessions terechtgekomen zijn.
  const { results } = await env.DB
    .prepare("SELECT id FROM patient_sessions WHERE organization_id = ?")
    .bind(reg.organization.id)
    .all();
  assert.equal(results.length, 0);
});

test("router: /api/flow/result blokkeert defensief zelfs als de organisatie ondertussen (bv. andere tab) geblokkeerd raakte", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "trial-defensief@example.com");
  const context = { role: "therapeut", female: false, pediatric: false };

  // Eerst toegang geven zodat de sessie kan starten...
  await env.DB
    .prepare("UPDATE organizations SET subscription_status = 'active', plan = 'solo' WHERE id = ?")
    .bind(reg.organization.id)
    .run();
  const { answers } = await walkFullFlow(env, reg.token, context);

  // ...en die toegang dan weer intrekken vóórdat het resultaat opgevraagd
  // wordt (simuleert bv. een verlopen/ingetrokken abonnement tijdens een
  // lopende sessie).
  await env.DB
    .prepare("UPDATE organizations SET subscription_status = 'trialing' WHERE id = ?")
    .bind(reg.organization.id)
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

test("router: een organisatie met status 'active' wordt NOOIT geblokkeerd, ongeacht het aantal analyses", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "trial-actief@example.com");
  await env.DB
    .prepare("UPDATE organizations SET subscription_status = 'active', plan = 'solo' WHERE id = ?")
    .bind(reg.organization.id)
    .run();

  for (let i = 0; i < 3; i++) {
    const res = await completeOneAnalysis(env, reg.token);
    assert.equal(res.status, 200, `analyse ${i + 1} had moeten lukken voor een actief abonnement`);
  }
});

test("router: een 'free'-toegangscode ontgrendelt een 'trialing'-organisatie meteen, zonder ooit te betalen", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "trial-vrijcode@example.com");
  await env.DB
    .prepare(
      "INSERT INTO access_codes (id, code, kind, max_uses, note) VALUES ('ac1', 'LANCERING2026', 'free', NULL, 'test')"
    )
    .run();

  const redeemRes = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", reg.token, { code: "lancering2026" }),
    env,
    {}
  );
  assert.equal(redeemRes.status, 200);
  const redeemData = await redeemRes.json();
  assert.equal(redeemData.kind, "free");
  assert.equal(redeemData.subscriptionStatus, "active");

  const org = await env.DB
    .prepare("SELECT subscription_status, plan FROM organizations WHERE id = ?")
    .bind(reg.organization.id)
    .first();
  assert.equal(org.subscription_status, "active");
  assert.equal(org.plan, "free");

  const res = await completeOneAnalysis(env, reg.token);
  assert.equal(res.status, 200);
});

test("router: een 'discount'-toegangscode ontgrendelt NIET — de organisatie blijft geblokkeerd tot een echte betaling", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "trial-kortingscode@example.com");
  await env.DB
    .prepare(
      "INSERT INTO access_codes (id, code, kind, discount_percent, note) VALUES ('ac2', 'HALFPRIJS', 'discount', 50, 'test')"
    )
    .run();

  const redeemRes = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", reg.token, { code: "HALFPRIJS" }),
    env,
    {}
  );
  assert.equal(redeemRes.status, 200);
  const redeemData = await redeemRes.json();
  assert.equal(redeemData.kind, "discount");
  assert.equal(redeemData.discountPercent, 50);
  assert.equal(redeemData.subscriptionStatus, "trialing");

  // Nog steeds geblokkeerd — enkel het bedrag bij de volgende checkout ligt
  // nu lager (getest in billing.test.js).
  const context = { role: "therapeut", female: false, pediatric: false };
  const res = await worker.fetch(
    authedRequest("https://x/api/flow/next", "POST", reg.token, { lang: "nl", context, answers: {} }),
    env,
    {}
  );
  assert.equal(res.status, 402);
});
