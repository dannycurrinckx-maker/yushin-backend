// Taak #118 — /api/access-code/redeem. De "blijkt een 'free'-code
// ontgrendelt / een 'discount'-code niet" gedragingen staan al in
// trial.test.js (samen met de toegangsafdwinging zelf); dit bestand test de
// route zelf verder in detail: hoofdletterongevoeligheid, ongeldige/
// ingetrokken/verbruikte codes, en dat enkel de eigenaar mag inwisselen.

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import { handleRegister, handleLogin } from "../src/routes/auth.js";
import worker from "../src/index.js";
import { newId, createUser } from "../src/lib/db.js";
import { hashPassword } from "../src/lib/auth.js";

function jsonRequest(url, method, body, headers = {}) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function authedRequest(url, method, token, body) {
  return jsonRequest(url, method, body, { Authorization: `Bearer ${token}` });
}

function makeEnv() {
  return { DB: createFakeD1(), APP_ENV: "test" };
}

async function registerOwner(env, contactEmail) {
  const res = await handleRegister(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: "Praktijk Codes",
      contactEmail,
      ownerName: "Owner",
      password: "correcthorsebattery",
    }),
    env
  );
  assert.equal(res.status, 201);
  return res.json();
}

async function insertCode(env, row) {
  await env.DB
    .prepare(
      "INSERT INTO access_codes (id, code, kind, discount_percent, max_uses, note) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(row.id, row.code, row.kind, row.discountPercent ?? null, row.maxUses ?? null, row.note ?? null)
    .run();
}

test("redeem: hoofdletterongevoelig — code met andere lettering dan opgeslagen werkt gewoon", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "codes-case@example.com");
  await insertCode(env, { id: "c1", code: "Zomer2026", kind: "free" });

  const res = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", reg.token, { code: "zOMER2026" }),
    env,
    {}
  );
  assert.equal(res.status, 200);
});

test("redeem: onbekende code geeft 400, organisatie blijft 'trialing'", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "codes-onbekend@example.com");

  const res = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", reg.token, { code: "bestaat-niet" }),
    env,
    {}
  );
  assert.equal(res.status, 400);

  const org = await env.DB.prepare("SELECT subscription_status FROM organizations WHERE id = ?").bind(reg.organization.id).first();
  assert.equal(org.subscription_status, "trialing");
});

test("redeem: een ingetrokken code (active=0) wordt geweigerd, ook al is de tekst correct", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "codes-ingetrokken@example.com");
  await insertCode(env, { id: "c2", code: "OUD2025", kind: "free" });
  await env.DB.prepare("UPDATE access_codes SET active = 0 WHERE id = 'c2'").run();

  const res = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", reg.token, { code: "OUD2025" }),
    env,
    {}
  );
  assert.equal(res.status, 400);
});

test("redeem: max_uses wordt afgedwongen — de code werkt niet meer zodra het maximum bereikt is", async () => {
  const env = makeEnv();
  await insertCode(env, { id: "c3", code: "EENMALIG", kind: "free", maxUses: 1 });

  const reg1 = await registerOwner(env, "codes-eenmalig-1@example.com");
  const res1 = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", reg1.token, { code: "EENMALIG" }),
    env,
    {}
  );
  assert.equal(res1.status, 200);

  const reg2 = await registerOwner(env, "codes-eenmalig-2@example.com");
  const res2 = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", reg2.token, { code: "EENMALIG" }),
    env,
    {}
  );
  assert.equal(res2.status, 400);

  const org2 = await env.DB.prepare("SELECT subscription_status FROM organizations WHERE id = ?").bind(reg2.organization.id).first();
  assert.equal(org2.subscription_status, "trialing");
});

test("redeem: enkel de eigenaar mag een code inwisselen, een gewone therapeut krijgt 403", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "codes-nietowner@example.com");
  await insertCode(env, { id: "c4", code: "OWNERONLY", kind: "free" });

  const therapistId = newId();
  await createUser(env.DB, {
    id: therapistId,
    organizationId: reg.organization.id,
    name: "Therapeut",
    email: "therapeut-codes@example.com",
    passwordHash: await hashPassword("correcthorsebattery"),
    role: "therapist",
  });
  const loginRes = await handleLogin(
    jsonRequest("https://x", "POST", { email: "therapeut-codes@example.com", password: "correcthorsebattery" }),
    env
  );
  const loginData = await loginRes.json();

  const res = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", loginData.token, { code: "OWNERONLY" }),
    env,
    {}
  );
  assert.equal(res.status, 403);

  const org = await env.DB.prepare("SELECT subscription_status FROM organizations WHERE id = ?").bind(reg.organization.id).first();
  assert.equal(org.subscription_status, "trialing");
});

test("redeem: lege/ontbrekende code geeft 400", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "codes-leeg@example.com");

  const res = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", reg.token, { code: "   " }),
    env,
    {}
  );
  assert.equal(res.status, 400);
});
