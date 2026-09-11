import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleRequestPasswordReset,
  handleResetPassword,
} from "../src/routes/auth.js";
import worker from "../src/index.js";

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

test("register: succesvolle registratie geeft token + user + organization terug", async () => {
  const env = makeEnv();
  const res = await handleRegister(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: "Praktijk Danny",
      contactEmail: "danny@example.com",
      ownerName: "Danny",
      password: "correcthorsebattery",
    }),
    env
  );
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.ok(data.token && data.token.length === 64);
  assert.equal(data.user.role, "owner");
  assert.equal(data.organization.name, "Praktijk Danny");
});

test("register: duplicaat e-mailadres geeft 409", async () => {
  const env = makeEnv();
  const payload = {
    organizationName: "Praktijk A",
    contactEmail: "dup@example.com",
    ownerName: "A",
    password: "correcthorsebattery",
  };
  const first = await handleRegister(jsonRequest("https://x", "POST", payload), env);
  assert.equal(first.status, 201);

  const second = await handleRegister(
    jsonRequest("https://x", "POST", { ...payload, organizationName: "Praktijk B" }),
    env
  );
  assert.equal(second.status, 409);
});

test("register: ongeldig e-mailadres geeft 400", async () => {
  const env = makeEnv();
  const res = await handleRegister(
    jsonRequest("https://x", "POST", {
      organizationName: "X",
      contactEmail: "geen-email",
      ownerName: "X",
      password: "correcthorsebattery",
    }),
    env
  );
  assert.equal(res.status, 400);
});

test("register: te kort wachtwoord geeft 400", async () => {
  const env = makeEnv();
  const res = await handleRegister(
    jsonRequest("https://x", "POST", {
      organizationName: "X",
      contactEmail: "kort@example.com",
      ownerName: "X",
      password: "kort",
    }),
    env
  );
  assert.equal(res.status, 400);
});

test("login: correcte gegevens geven token terug, verkeerd wachtwoord geeft 401", async () => {
  const env = makeEnv();
  await handleRegister(
    jsonRequest("https://x", "POST", {
      organizationName: "Praktijk Login",
      contactEmail: "login@example.com",
      ownerName: "Login Tester",
      password: "correcthorsebattery",
    }),
    env
  );

  const ok = await handleLogin(
    jsonRequest("https://x", "POST", { email: "login@example.com", password: "correcthorsebattery" }),
    env
  );
  assert.equal(ok.status, 200);
  const okData = await ok.json();
  assert.ok(okData.token);

  const wrongPw = await handleLogin(
    jsonRequest("https://x", "POST", { email: "login@example.com", password: "helemaal-fout" }),
    env
  );
  assert.equal(wrongPw.status, 401);

  const unknownEmail = await handleLogin(
    jsonRequest("https://x", "POST", { email: "bestaat-niet@example.com", password: "correcthorsebattery" }),
    env
  );
  assert.equal(unknownEmail.status, 401);
  // Zelfde foutmelding voor onbekend e-mailadres als voor fout wachtwoord —
  // geen informatie lekken over welke accounts bestaan.
  assert.deepEqual(await wrongPw.json(), await unknownEmail.json());
});

test("logout via de echte router: token werkt niet meer op een beveiligde route na uitloggen", async () => {
  const env = makeEnv();
  const regRes = await worker.fetch(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: "Praktijk Router",
      contactEmail: "router@example.com",
      ownerName: "Router Tester",
      password: "correcthorsebattery",
    }),
    env,
    {}
  );
  const { token } = await regRes.json();

  // Token werkt op een beveiligde route (leeg verzoek geeft 400 "ongeldige
  // aanvraag" terug — sinds taak #71 is flow.js geen stub meer — maar
  // cruciaal: GEEN 401 — dat bewijst dat de sessie geldig is).
  const before = await worker.fetch(authedRequest("https://x/api/flow/next", "POST", token), env, {});
  assert.equal(before.status, 400);

  const logoutRes = await worker.fetch(authedRequest("https://x/api/auth/logout", "POST", token), env, {});
  assert.equal(logoutRes.status, 200);

  const after = await worker.fetch(authedRequest("https://x/api/flow/next", "POST", token), env, {});
  assert.equal(after.status, 401);
});

test("wachtwoord-reset: volledige flow (aanvragen -> token gebruiken -> oud wachtwoord werkt niet meer -> sessies ingetrokken)", async () => {
  const env = makeEnv();
  const regRes = await handleRegister(
    jsonRequest("https://x", "POST", {
      organizationName: "Praktijk Reset",
      contactEmail: "reset@example.com",
      ownerName: "Reset Tester",
      password: "origineel-wachtwoord",
    }),
    env
  );
  const { token: oldSessionToken } = await regRes.json();

  // Aanvraag geeft altijd {ok:true} terug, ook al bestaat het e-mailadres niet.
  const reqUnknown = await handleRequestPasswordReset(
    jsonRequest("https://x", "POST", { email: "bestaat-niet@example.com" }),
    env
  );
  assert.equal(reqUnknown.status, 200);
  assert.deepEqual(await reqUnknown.json(), { ok: true });

  const reqKnown = await handleRequestPasswordReset(
    jsonRequest("https://x", "POST", { email: "reset@example.com" }),
    env
  );
  assert.equal(reqKnown.status, 200);

  // Het token zelf wordt bewust NIET teruggegeven in de API-response (zou
  // een lek zijn) — voor deze test lezen we het rechtstreeks uit de
  // (test-)database, wat neerkomt op "de e-mail die de gebruiker zou
  // ontvangen zodra de e-mailkoppeling er is".
  const row = await env.DB
    .prepare("SELECT token FROM password_reset_tokens ORDER BY created_at DESC LIMIT 1")
    .bind()
    .first();
  assert.ok(row && row.token);

  const resetRes = await handleResetPassword(
    jsonRequest("https://x", "POST", { token: row.token, newPassword: "nieuw-wachtwoord-123" }),
    env
  );
  assert.equal(resetRes.status, 200);

  // Oud wachtwoord werkt niet meer, nieuw wachtwoord wel.
  const loginOld = await handleLogin(
    jsonRequest("https://x", "POST", { email: "reset@example.com", password: "origineel-wachtwoord" }),
    env
  );
  assert.equal(loginOld.status, 401);

  const loginNew = await handleLogin(
    jsonRequest("https://x", "POST", { email: "reset@example.com", password: "nieuw-wachtwoord-123" }),
    env
  );
  assert.equal(loginNew.status, 200);

  // De oude sessie (van vóór de reset) moet ingetrokken zijn.
  const oldSessionCheck = await worker.fetch(
    authedRequest("https://x/api/flow/next", "POST", oldSessionToken),
    env,
    {}
  );
  assert.equal(oldSessionCheck.status, 401);

  // Hergebruik van hetzelfde reset-token moet nu falen (al verbruikt).
  const reuseRes = await handleResetPassword(
    jsonRequest("https://x", "POST", { token: row.token, newPassword: "nog-een-wachtwoord-456" }),
    env
  );
  assert.equal(reuseRes.status, 400);
});

test("wachtwoord-reset: ongeldig/onbestaand token geeft 400", async () => {
  const env = makeEnv();
  const res = await handleResetPassword(
    jsonRequest("https://x", "POST", { token: "dit-bestaat-niet", newPassword: "geldig-genoeg-123" }),
    env
  );
  assert.equal(res.status, 400);
});

// --- Taak #118: organization-object in register/login-response ----------

test("register: response bevat organization.subscriptionStatus ('trialing') en .plan ('solo')", async () => {
  const env = makeEnv();
  const res = await handleRegister(
    jsonRequest("https://x", "POST", {
      organizationName: "Praktijk Poort",
      contactEmail: "poort-register@example.com",
      ownerName: "Owner",
      password: "correcthorsebattery",
    }),
    env
  );
  const data = await res.json();
  assert.equal(data.organization.subscriptionStatus, "trialing");
  assert.equal(data.organization.plan, "solo");
});

test("login: response bevat een volledig organization-object (niet enkel organizationId)", async () => {
  const env = makeEnv();
  await handleRegister(
    jsonRequest("https://x", "POST", {
      organizationName: "Praktijk Poort Login",
      contactEmail: "poort-login@example.com",
      ownerName: "Owner",
      password: "correcthorsebattery",
    }),
    env
  );
  const res = await handleLogin(
    jsonRequest("https://x", "POST", { email: "poort-login@example.com", password: "correcthorsebattery" }),
    env
  );
  const data = await res.json();
  assert.ok(data.organizationId); // bestaand veld blijft behouden
  assert.equal(data.organization.subscriptionStatus, "trialing");
  assert.equal(data.organization.plan, "solo");
  assert.equal(data.organization.id, data.organizationId);
});

// --- Taak #118: registratie-meldingsmail (Resend) ------------------------

test("register: stuurt een meldingsmail via Resend zodra RESEND_API_KEY/NOTIFY_EMAIL ingesteld zijn", async () => {
  const env = makeEnv();
  env.RESEND_API_KEY = "re_test_dummykey";
  env.NOTIFY_EMAIL = "danny@example.com";
  env.NOTIFY_FROM_EMAIL = "Yushin <onboarding@resend.dev>";

  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null });
    return new Response(JSON.stringify({ id: "email_test123" }), { status: 200 });
  };

  try {
    const res = await handleRegister(
      jsonRequest("https://x", "POST", {
        organizationName: "Praktijk Meldingsmail",
        contactEmail: "meldingsmail@example.com",
        ownerName: "Owner",
        password: "correcthorsebattery",
      }),
      env
    );
    assert.equal(res.status, 201);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(calls[0].body.to, "danny@example.com");
    assert.ok(calls[0].body.html.includes("Praktijk Meldingsmail"));
    assert.ok(calls[0].body.html.includes("meldingsmail@example.com"));
  } finally {
    globalThis.fetch = original;
  }
});

test("register: een mislukte Resend-aanroep blokkeert de registratie NIET (try/catch, non-blocking)", async () => {
  const env = makeEnv();
  env.RESEND_API_KEY = "re_test_dummykey";
  env.NOTIFY_EMAIL = "danny@example.com";

  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("simuleer netwerkfout richting Resend");
  };

  try {
    const res = await handleRegister(
      jsonRequest("https://x", "POST", {
        organizationName: "Praktijk MailFout",
        contactEmail: "mailfout@example.com",
        ownerName: "Owner",
        password: "correcthorsebattery",
      }),
      env
    );
    // De registratie zelf moet gewoon lukken, ondanks de mislukte e-mail.
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
  } finally {
    globalThis.fetch = original;
  }
});

test("register: zonder NOTIFY_EMAIL wordt er geen Resend-aanroep gedaan (stil overgeslagen)", async () => {
  const env = makeEnv(); // geen RESEND_API_KEY/NOTIFY_EMAIL ingesteld

  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async (...args) => {
    called = true;
    return original(...args);
  };

  try {
    const res = await handleRegister(
      jsonRequest("https://x", "POST", {
        organizationName: "Praktijk GeenMelding",
        contactEmail: "geenmelding@example.com",
        ownerName: "Owner",
        password: "correcthorsebattery",
      }),
      env
    );
    assert.equal(res.status, 201);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});
