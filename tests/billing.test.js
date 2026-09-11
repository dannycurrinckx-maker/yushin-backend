// Taak #70 — Mollie-integratie. Draait tegen de echte productiecode
// (src/routes/billing.js, src/lib/mollie.js, src/lib/plans.js) en een echte
// SQLite-engine (fake-d1.js), maar met een NEP `fetch` in plaats van een
// echte Mollie-API-call — er is in deze sandbox geen netwerktoegang tot
// Mollie en geen echte API-key. De nep-fetch bootst Mollie's response-vorm
// exact na, zodat de échte mollie.js-wrapper en billing.js-logica getest
// worden, enkel het netwerk zelf is vervangen.

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

function makeEnv(extra = {}) {
  return { DB: createFakeD1(), APP_ENV: "test", MOLLIE_API_KEY: "test_dummykey", ...extra };
}

// Installeert een nep-fetch die enkel reageert op api.mollie.com-paden, en
// verder gewoon de echte fetch gebruikt voor alles anders (hier niet nodig,
// maar zo blijft het veilig als dat ooit wel gebeurt). Geeft een `calls`-array
// terug zodat een test kan verifiëren WELKE data daadwerkelijk naar Mollie
// verstuurd zou zijn (bv. het bedrag).
function installFakeMollie(responses) {
  const original = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const path = url.replace("https://api.mollie.com/v2", "");
    const method = options.method || "GET";
    const parsedBody = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method, body: parsedBody });

    let handler = responses[`${method} ${path}`];
    if (!handler) {
      // Probeer een pattern-match met ":id" voor paden zoals /payments/tr_123.
      for (const pattern of Object.keys(responses)) {
        const [pMethod, pPath] = pattern.split(" ");
        if (pMethod !== method) continue;
        const regex = new RegExp("^" + pPath.replace(/:id/g, "[^/]+") + "$");
        if (regex.test(path)) {
          handler = responses[pattern];
          break;
        }
      }
    }

    if (!handler) {
      return new Response(JSON.stringify({ title: "Not stubbed", detail: `${method} ${path}` }), { status: 404 });
    }
    const result = typeof handler === "function" ? handler(parsedBody, path) : handler;
    return new Response(JSON.stringify(result), { status: 200 });
  };

  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

async function registerOwner(env, overrides = {}) {
  const res = await handleRegister(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: "Praktijk Billing",
      contactEmail: "owner@example.com",
      ownerName: "Owner",
      password: "correcthorsebattery",
      ...overrides,
    }),
    env
  );
  assert.equal(res.status, 201);
  return res.json();
}

test("checkout: legt correct bedrag vast bij Mollie op basis van het PLAN, niet op basis van client-input", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env);
  const fake = installFakeMollie({
    "POST /customers": (body) => ({ id: "cst_test123", name: body.name, email: body.email }),
    "POST /payments": (body) => ({
      id: "tr_test123",
      customerId: body.customerId,
      amount: body.amount,
      _links: { checkout: { href: "https://mollie.example/checkout/tr_test123" } },
    }),
  });

  try {
    const res = await worker.fetch(
      authedRequest("https://x/api/billing/checkout", "POST", reg.token, {
        plan: "solo",
        redirectUrl: "https://app.example.com/klaar",
        // Poging tot manipulatie: een client die toch een bedrag meestuurt.
        // Dit veld bestaat niet in de API en moet gewoon genegeerd worden.
        amount: { currency: "EUR", value: "0.01" },
      }),
      env,
      {}
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.checkoutUrl, "https://mollie.example/checkout/tr_test123");

    const paymentCall = fake.calls.find((c) => c.path === "/payments");
    assert.ok(paymentCall);
    // Het bedrag dat ECHT naar Mollie verstuurd is, moet de server-side
    // planprijs zijn (8.95, taak #113 — bijgewerkt volgens
    // Yushin_Prijsstrategie_Concurrentieanalyse_2026.pdf) — niet de 0.01 die
    // de client probeerde mee te sturen.
    assert.deepEqual(paymentCall.body.amount, { currency: "EUR", value: "8.95" });
    assert.equal(paymentCall.body.metadata.plan, "solo");
  } finally {
    fake.restore();
  }
});

// Taak #113 (jaarfacturatie) — de "_yearly"-plansleutels zijn gewone
// PLANS-items zoals elk ander plan; deze test bevestigt dat het juiste
// jaarbedrag (89.00) én het juiste interval ("12 months") daadwerkelijk bij
// het aanmaken van het terugkerende abonnement (na een geslaagde eerste
// betaling) bij Mollie terechtkomen — niet enkel bij de eerste betaling.
test("checkout + webhook: jaarplan (solo_yearly) gebruikt 89.00/12 months, niet de maandprijs", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, { contactEmail: "jaarplan@example.com" });
  const fake = installFakeMollie({
    "POST /customers": (body) => ({ id: "cst_jaar", name: body.name, email: body.email }),
    "POST /payments": (body) => ({
      id: "tr_jaar",
      customerId: body.customerId,
      amount: body.amount,
      _links: { checkout: { href: "https://mollie.example/checkout/tr_jaar" } },
    }),
    "GET /payments/:id": {
      id: "tr_jaar",
      customerId: "cst_jaar",
      status: "paid",
      sequenceType: "first",
      metadata: { organizationId: reg.organization.id, plan: "solo_yearly" },
    },
    "POST /customers/:id/subscriptions": (body) => ({
      id: "sub_jaar",
      amount: body.amount,
      interval: body.interval,
      nextPaymentDate: "2027-08-27",
    }),
  });

  try {
    const checkoutRes = await worker.fetch(
      authedRequest("https://x/api/billing/checkout", "POST", reg.token, {
        plan: "solo_yearly",
        redirectUrl: "https://app.example.com/klaar",
      }),
      env,
      {}
    );
    assert.equal(checkoutRes.status, 200);

    const paymentCall = fake.calls.find((c) => c.path === "/payments");
    assert.deepEqual(paymentCall.body.amount, { currency: "EUR", value: "89.00" });
    assert.equal(paymentCall.body.metadata.plan, "solo_yearly");

    const webhookRes = await worker.fetch(
      new Request("https://x/api/billing/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "id=tr_jaar",
      }),
      env,
      {}
    );
    assert.equal(webhookRes.status, 200);

    const subCall = fake.calls.find((c) => c.path === "/customers/cst_jaar/subscriptions");
    assert.ok(subCall, "createSubscription had aangeroepen moeten worden");
    assert.deepEqual(subCall.body.amount, { currency: "EUR", value: "89.00" });
    assert.equal(subCall.body.interval, "12 months");

    const org = await env.DB
      .prepare("SELECT plan, subscription_status FROM organizations WHERE id = ?")
      .bind(reg.organization.id)
      .first();
    assert.equal(org.plan, "solo_yearly");
    assert.equal(org.subscription_status, "active");
  } finally {
    fake.restore();
  }
});

// Taak #116 (Education-laag) — deze plannen worden bewust manueel/buiten
// Mollie om gefactureerd (zie het runbook in src/lib/plans.js) en mogen
// dus NOOIT via deze route een echte betaling triggeren.
test("checkout: een manualOnly-plan (education_student) wordt geweigerd, geen Mollie-call", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, { contactEmail: "education-checkout@example.com" });
  const fake = installFakeMollie({});

  try {
    const res = await worker.fetch(
      authedRequest("https://x/api/billing/checkout", "POST", reg.token, {
        plan: "education_student",
        redirectUrl: "https://app.example.com/klaar",
      }),
      env,
      {}
    );
    assert.equal(res.status, 400);
    assert.equal(fake.calls.length, 0, "er mag helemaal geen Mollie-aanroep gebeurd zijn");
  } finally {
    fake.restore();
  }
});

test("checkout: onbekend plan geeft 400, geen Mollie-call", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env);
  const fake = installFakeMollie({});
  try {
    const res = await worker.fetch(
      authedRequest("https://x/api/billing/checkout", "POST", reg.token, {
        plan: "goud-platina-vip",
        redirectUrl: "https://app.example.com/klaar",
      }),
      env,
      {}
    );
    assert.equal(res.status, 400);
    assert.equal(fake.calls.length, 0);
  } finally {
    fake.restore();
  }
});

test("checkout: enkel de owner mag afrekenen, een gewone therapeut krijgt 403", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, { contactEmail: "owner2@example.com" });

  // Simuleer een therapeut-account binnen dezelfde organisatie (handleInviteUser
  // is nog een stub — taak #73 — dus we voegen de user hier rechtstreeks toe
  // via db.js, net zoals in de multi-tenancy-tests).
  const therapistId = newId();
  await createUser(env.DB, {
    id: therapistId,
    organizationId: reg.organization.id,
    name: "Therapeut",
    email: "therapeut@example.com",
    passwordHash: await hashPassword("correcthorsebattery"),
    role: "therapist",
  });

  const loginRes = await handleLogin(
    jsonRequest("https://x", "POST", { email: "therapeut@example.com", password: "correcthorsebattery" }),
    env
  );
  const loginData = await loginRes.json();

  const fake = installFakeMollie({});
  try {
    const res = await worker.fetch(
      authedRequest("https://x/api/billing/checkout", "POST", loginData.token, {
        plan: "solo",
        redirectUrl: "https://app.example.com/klaar",
      }),
      env,
      {}
    );
    assert.equal(res.status, 403);
    assert.equal(fake.calls.length, 0);
  } finally {
    fake.restore();
  }
});

test("webhook: geslaagde eerste betaling activeert het abonnement en maakt de recurring subscription aan", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, { contactEmail: "webhook1@example.com" });

  const fake = installFakeMollie({
    "POST /customers": () => ({ id: "cst_abc" }),
    "POST /payments": (body) => ({
      id: "tr_abc",
      customerId: "cst_abc",
      metadata: body.metadata,
      _links: { checkout: { href: "https://mollie.example/checkout/tr_abc" } },
    }),
    "GET /payments/:id": () => ({
      id: "tr_abc",
      status: "paid",
      sequenceType: "first",
      customerId: "cst_abc",
      metadata: { organizationId: reg.organization.id, plan: "solo" },
    }),
    "POST /customers/cst_abc/subscriptions": (body) => ({
      id: "sub_xyz",
      customerId: "cst_abc",
      amount: body.amount,
      interval: body.interval,
      nextPaymentDate: "2026-09-21",
    }),
  });

  try {
    // Eerst checkout starten zodat organizations.mollie_customer_id gezet is.
    const checkoutRes = await worker.fetch(
      authedRequest("https://x/api/billing/checkout", "POST", reg.token, {
        plan: "solo",
        redirectUrl: "https://app.example.com/klaar",
      }),
      env,
      {}
    );
    assert.equal(checkoutRes.status, 200);

    // Mollie roept nu de webhook aan (form-encoded, enkel een id — geen auth).
    const webhookReq = new Request("https://x/api/billing/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "id=tr_abc",
    });
    const webhookRes = await worker.fetch(webhookReq, env, {});
    assert.equal(webhookRes.status, 200);
    assert.deepEqual(await webhookRes.json(), { ok: true });

    const subCall = fake.calls.find((c) => c.path === "/customers/cst_abc/subscriptions");
    assert.ok(subCall, "createSubscription had aangeroepen moeten worden");
    assert.deepEqual(subCall.body.amount, { currency: "EUR", value: "8.95" });

    const org = await env.DB
      .prepare("SELECT subscription_status, plan, mollie_customer_id FROM organizations WHERE id = ?")
      .bind(reg.organization.id)
      .first();
    assert.equal(org.subscription_status, "active");
    assert.equal(org.plan, "solo");

    const subRow = await env.DB
      .prepare("SELECT * FROM subscriptions WHERE organization_id = ?")
      .bind(reg.organization.id)
      .first();
    assert.ok(subRow);
    assert.equal(subRow.mollie_subscription_id, "sub_xyz");
    assert.equal(subRow.status, "active");
  } finally {
    fake.restore();
  }
});

test("webhook: mislukte terugkerende afschrijving zet de organisatie op past_due", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, { contactEmail: "webhook2@example.com" });

  // Zet de organisatie manueel al in "active" staat met een gekoppelde
  // Mollie-klant, alsof een eerdere betaling al succesvol was.
  await env.DB
    .prepare("UPDATE organizations SET mollie_customer_id = ?, subscription_status = 'active', plan = 'solo' WHERE id = ?")
    .bind("cst_recurring", reg.organization.id)
    .run();
  await env.DB
    .prepare(
      "INSERT INTO subscriptions (id, organization_id, mollie_subscription_id, status, plan) VALUES (?, ?, ?, 'active', 'solo')"
    )
    .bind(newId(), reg.organization.id, "sub_recurring")
    .run();

  const fake = installFakeMollie({
    "GET /payments/:id": () => ({
      id: "tr_fail",
      status: "failed",
      sequenceType: "recurring",
      customerId: "cst_recurring",
      subscriptionId: "sub_recurring",
    }),
  });

  try {
    const webhookReq = new Request("https://x/api/billing/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "id=tr_fail",
    });
    const webhookRes = await worker.fetch(webhookReq, env, {});
    assert.equal(webhookRes.status, 200);

    const org = await env.DB
      .prepare("SELECT subscription_status FROM organizations WHERE id = ?")
      .bind(reg.organization.id)
      .first();
    assert.equal(org.subscription_status, "past_due");

    const sub = await env.DB
      .prepare("SELECT status FROM subscriptions WHERE mollie_subscription_id = ?")
      .bind("sub_recurring")
      .first();
    assert.equal(sub.status, "past_due");
  } finally {
    fake.restore();
  }
});

// Taak #118 — een 'discount'-toegangscode verlaagt het bedrag dat naar
// Mollie gaat, zowel bij de eerste betaling als bij het daaropvolgende
// terugkerende abonnement (createSubscription in de webhook). Rekent hier
// bewust met een plan/percentage-combinatie die geen ronde centen oplevert
// zonder de Math.round-afronding in applyDiscount() (plans.js): 8.95 * 0.7 =
// 6.265 -> moet afgerond worden naar 6.27 (niet 6.26 of 6.25).
test("checkout + webhook: een 'discount'-toegangscode verlaagt het bedrag bij Mollie, zowel eerste als terugkerende betaling", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, { contactEmail: "korting@example.com" });
  await env.DB
    .prepare(
      "INSERT INTO access_codes (id, code, kind, discount_percent, note) VALUES ('acb1', 'DERTIGKORTING', 'discount', 30, 'test')"
    )
    .run();
  const redeemRes = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", reg.token, { code: "DERTIGKORTING" }),
    env,
    {}
  );
  assert.equal(redeemRes.status, 200);

  const fake = installFakeMollie({
    "POST /customers": (body) => ({ id: "cst_korting", name: body.name, email: body.email }),
    "POST /payments": (body) => ({
      id: "tr_korting",
      customerId: body.customerId,
      amount: body.amount,
      _links: { checkout: { href: "https://mollie.example/checkout/tr_korting" } },
    }),
    "GET /payments/:id": {
      id: "tr_korting",
      customerId: "cst_korting",
      status: "paid",
      sequenceType: "first",
      metadata: { organizationId: reg.organization.id, plan: "solo" },
    },
    "POST /customers/:id/subscriptions": (body) => ({
      id: "sub_korting",
      amount: body.amount,
      interval: body.interval,
      nextPaymentDate: "2026-09-27",
    }),
  });

  try {
    const checkoutRes = await worker.fetch(
      authedRequest("https://x/api/billing/checkout", "POST", reg.token, {
        plan: "solo",
        redirectUrl: "https://app.example.com/klaar",
      }),
      env,
      {}
    );
    assert.equal(checkoutRes.status, 200);

    const paymentCall = fake.calls.find((c) => c.path === "/payments");
    // 8.95 * (1 - 0.30) = 6.265 -> afgerond naar 6.27 (zie applyDiscount).
    assert.deepEqual(paymentCall.body.amount, { currency: "EUR", value: "6.27" });

    const webhookRes = await worker.fetch(
      new Request("https://x/api/billing/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "id=tr_korting",
      }),
      env,
      {}
    );
    assert.equal(webhookRes.status, 200);

    const subCall = fake.calls.find((c) => c.path === "/customers/cst_korting/subscriptions");
    assert.ok(subCall, "createSubscription had aangeroepen moeten worden");
    // Zelfde verlaagde bedrag ook bij de TERUGKERENDE afschrijving — niet
    // enkel bij de eerste betaling.
    assert.deepEqual(subCall.body.amount, { currency: "EUR", value: "6.27" });

    const org = await env.DB
      .prepare("SELECT subscription_status, plan, discount_percent FROM organizations WHERE id = ?")
      .bind(reg.organization.id)
      .first();
    assert.equal(org.subscription_status, "active");
    assert.equal(org.discount_percent, 30);
  } finally {
    fake.restore();
  }
});

test("webhook: onbekende Mollie-klant of ontbrekend id crasht niet en geeft altijd ok:true / 400", async () => {
  const env = makeEnv();
  const fake = installFakeMollie({
    "GET /payments/:id": () => ({ id: "tr_ghost", status: "paid", sequenceType: "first", customerId: "cst_ghost" }),
  });

  try {
    const withUnknownCustomer = new Request("https://x/api/billing/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "id=tr_ghost",
    });
    const res1 = await worker.fetch(withUnknownCustomer, env, {});
    assert.equal(res1.status, 200);
    assert.deepEqual(await res1.json(), { ok: true });

    const withoutId = new Request("https://x/api/billing/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    });
    const res2 = await worker.fetch(withoutId, env, {});
    assert.equal(res2.status, 400);
  } finally {
    fake.restore();
  }
});
