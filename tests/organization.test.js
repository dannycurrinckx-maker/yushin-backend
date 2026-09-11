// Taak #74 — Zelfregistratie/onboarding: GET /api/organization geeft de
// eigen organisatie-status terug (voor het onboarding-scherm / de
// proefperiode-badge), altijd gescoped op de ingelogde sessie. Draait tegen
// dezelfde echte SQLite-engine + echte productiecode als de andere
// testbestanden — zie fake-d1.js.

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import worker from "../src/index.js";

function jsonRequest(url, method, body) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function authedRequest(url, method, token) {
  return new Request(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
}

function makeEnv() {
  return { DB: createFakeD1(), APP_ENV: "test" };
}

async function registerPractice(env, { name, email, ownerName, password }) {
  const res = await worker.fetch(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: name,
      contactEmail: email,
      ownerName,
      password,
    }),
    env,
    {}
  );
  assert.equal(res.status, 201);
  return res.json();
}

test("organisatie-info: een nieuw geregistreerde praktijk start in 'trialing' status, zonder prijs/bedrag in de response", async () => {
  const env = makeEnv();
  const data = await registerPractice(env, {
    name: "Praktijk Onboarding 1",
    email: "eigenaar-onboarding1@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const res = await worker.fetch(authedRequest("https://x/api/organization", "GET", data.token), env, {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.organization.name, "Praktijk Onboarding 1");
  assert.equal(body.organization.subscriptionStatus, "trialing");
  assert.equal(body.organization.plan, "solo"); // DB-default, geen prijs
  assert.ok(!("amount" in body.organization));
  assert.ok(!("price" in body.organization));
});

test("organisatie-info: vereist authenticatie (401 zonder token)", async () => {
  const env = makeEnv();
  const res = await worker.fetch(new Request("https://x/api/organization", { method: "GET" }), env, {});
  assert.equal(res.status, 401);
});

test("organisatie-info: multi-tenancy — praktijk A ziet enkel haar eigen organisatienaam, nooit die van praktijk B", async () => {
  const env = makeEnv();
  const dataA = await registerPractice(env, {
    name: "Praktijk Onboarding A",
    email: "eigenaar-onboardinga@example.com",
    ownerName: "Eigenaar A",
    password: "correcthorsebattery",
  });
  const dataB = await registerPractice(env, {
    name: "Praktijk Onboarding B",
    email: "eigenaar-onboardingb@example.com",
    ownerName: "Eigenaar B",
    password: "correcthorsebattery",
  });

  const resA = await worker.fetch(authedRequest("https://x/api/organization", "GET", dataA.token), env, {});
  const bodyA = await resA.json();
  assert.equal(bodyA.organization.name, "Praktijk Onboarding A");
  assert.notEqual(bodyA.organization.id, dataB.organization.id);

  const resB = await worker.fetch(authedRequest("https://x/api/organization", "GET", dataB.token), env, {});
  const bodyB = await resB.json();
  assert.equal(bodyB.organization.name, "Praktijk Onboarding B");
});

test("organisatie-info: ook een therapeut (niet enkel de owner) mag de eigen organisatie-info opvragen", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Onboarding 2",
    email: "eigenaar-onboarding2@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const inviteRes = await worker.fetch(
    new Request("https://x/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({
        name: "Therapeut",
        email: "therapeut-onboarding2@example.com",
        password: "correcthorsebattery",
      }),
    }),
    env,
    {}
  );
  assert.equal(inviteRes.status, 201);

  const loginRes = await worker.fetch(
    jsonRequest("https://x/api/auth/login", "POST", {
      email: "therapeut-onboarding2@example.com",
      password: "correcthorsebattery",
    }),
    env,
    {}
  );
  const loginData = await loginRes.json();

  const res = await worker.fetch(authedRequest("https://x/api/organization", "GET", loginData.token), env, {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.organization.name, "Praktijk Onboarding 2");
});
