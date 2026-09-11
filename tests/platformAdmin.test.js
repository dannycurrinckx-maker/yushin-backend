// Taak #141b — platform-brede beheerbevoegdheid: toegangscodes aanmaken/
// overzien via /api/platform-admin/access-codes, LOS van elke
// organisatie-eigenaarsrol (zie requirePlatformAdmin in src/index.js en
// PLATFORM_ADMIN_EMAILS in wrangler.toml). Test zowel de gate zelf (owner
// van de eigen praktijk ≠ platform-admin) als de validatie in
// handleCreateAccessCode (platformAdmin.js).

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

function authedRequest(url, method, token, body) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeEnv(platformAdminEmails) {
  return { DB: createFakeD1(), APP_ENV: "test", PLATFORM_ADMIN_EMAILS: platformAdminEmails };
}

async function registerOwner(env, contactEmail) {
  const res = await handleRegister(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: "Praktijk Platformbeheer",
      contactEmail,
      ownerName: "Owner",
      password: "correcthorsebattery",
    }),
    env
  );
  assert.equal(res.status, 201);
  return res.json();
}

// --- Gate zelf --------------------------------------------------------------

test("POST /api/platform-admin/access-codes: zonder token -> 401", async () => {
  const env = makeEnv("admin@example.com");
  const res = await worker.fetch(
    jsonRequest("https://x/api/platform-admin/access-codes", "POST", { code: "X", kind: "free" }),
    env
  );
  assert.equal(res.status, 401);
});

test("POST /api/platform-admin/access-codes: gewone praktijkeigenaar (owner in eigen org) -> 403, ondanks 'owner'-rol", async () => {
  const env = makeEnv("platformbeheer@yushin.example");
  const reg = await registerOwner(env, "gewone-eigenaar@example.com");

  const res = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "POST", reg.token, {
      code: "ZELFGEMAAKT", kind: "free",
    }),
    env
  );
  assert.equal(res.status, 403);
});

test("GET /api/platform-admin/access-codes: gewone praktijkeigenaar -> 403", async () => {
  const env = makeEnv("platformbeheer@yushin.example");
  const reg = await registerOwner(env, "gewone-eigenaar-get@example.com");

  const res = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "GET", reg.token),
    env
  );
  assert.equal(res.status, 403);
});

test("POST/GET /api/platform-admin/access-codes: e-mail op de PLATFORM_ADMIN_EMAILS-lijst -> toegelaten", async () => {
  const env = makeEnv("platformbeheer@yushin.example");
  const reg = await registerOwner(env, "platformbeheer@yushin.example");

  const createRes = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "POST", reg.token, {
      code: "PLATFORMTEST", kind: "free",
    }),
    env
  );
  assert.equal(createRes.status, 201);

  const listRes = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "GET", reg.token),
    env
  );
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.codes.length, 1);
  assert.equal(listData.codes[0].code, "PLATFORMTEST");
});

test("PLATFORM_ADMIN_EMAILS: hoofdletterongevoelig en kommagescheiden lijst met meerdere adressen", async () => {
  const env = makeEnv("iemand-anders@example.com, PlatformBeheer@Yushin.Example ,derde@example.com");
  const reg = await registerOwner(env, "platformbeheer@yushin.example");

  const res = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "GET", reg.token),
    env
  );
  assert.equal(res.status, 200);
});

test("PLATFORM_ADMIN_EMAILS niet gezet (env var ontbreekt) -> iedereen krijgt 403, nooit stilzwijgend toegelaten", async () => {
  const env = { DB: createFakeD1(), APP_ENV: "test" };
  const reg = await registerOwner(env, "wie-dan-ook@example.com");

  const res = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "GET", reg.token),
    env
  );
  assert.equal(res.status, 403);
});

// --- Validatie in handleCreateAccessCode ------------------------------------

test("POST /api/platform-admin/access-codes: code ontbreekt -> 400", async () => {
  const env = makeEnv("admin@example.com");
  const reg = await registerOwner(env, "admin@example.com");

  const res = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "POST", reg.token, { kind: "free" }),
    env
  );
  assert.equal(res.status, 400);
});

test("POST /api/platform-admin/access-codes: ongeldige kind -> 400", async () => {
  const env = makeEnv("admin@example.com");
  const reg = await registerOwner(env, "admin@example.com");

  const res = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "POST", reg.token, {
      code: "X", kind: "gratisvoormij",
    }),
    env
  );
  assert.equal(res.status, 400);
});

test("POST /api/platform-admin/access-codes: kind='discount' zonder geldig discountPercent -> 400", async () => {
  const env = makeEnv("admin@example.com");
  const reg = await registerOwner(env, "admin@example.com");

  for (const discountPercent of [0, 100, -5, "20", undefined]) {
    const body = { code: "KORTING-" + String(discountPercent), kind: "discount" };
    if (discountPercent !== undefined) body.discountPercent = discountPercent;
    const res = await worker.fetch(
      authedRequest("https://x/api/platform-admin/access-codes", "POST", reg.token, body),
      env
    );
    assert.equal(res.status, 400, `discountPercent ${JSON.stringify(discountPercent)} had geweigerd moeten worden`);
  }
});

test("POST /api/platform-admin/access-codes: sessionLimit is enkel geldig bij kind='free'", async () => {
  const env = makeEnv("admin@example.com");
  const reg = await registerOwner(env, "admin@example.com");

  const res = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "POST", reg.token, {
      code: "KORTING-MET-LIMIET",
      kind: "discount",
      discountPercent: 20,
      sessionLimit: 5,
    }),
    env
  );
  assert.equal(res.status, 400);
});

test("POST /api/platform-admin/access-codes: kind='free' met geldige sessionLimit -> 201, correct opgeslagen", async () => {
  const env = makeEnv("admin@example.com");
  const reg = await registerOwner(env, "admin@example.com");

  const res = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "POST", reg.token, {
      code: "GRATIS-MET-LIMIET",
      kind: "free",
      sessionLimit: 5,
      note: "voor tester",
    }),
    env
  );
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.sessionLimit, 5);

  const row = await env.DB
    .prepare("SELECT * FROM access_codes WHERE LOWER(code) = LOWER(?)")
    .bind("GRATIS-MET-LIMIET")
    .first();
  assert.equal(row.session_limit, 5);
  assert.equal(row.note, "voor tester");
});

test("POST /api/platform-admin/access-codes: dubbele code (hoofdletterongevoelig) -> 409", async () => {
  const env = makeEnv("admin@example.com");
  const reg = await registerOwner(env, "admin@example.com");

  const first = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "POST", reg.token, {
      code: "DUBBELE-CODE", kind: "free",
    }),
    env
  );
  assert.equal(first.status, 201);

  const second = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "POST", reg.token, {
      code: "dubbele-code", kind: "free",
    }),
    env
  );
  assert.equal(second.status, 409);
});

test("POST /api/platform-admin/access-codes: ongeldige maxUses -> 400", async () => {
  const env = makeEnv("admin@example.com");
  const reg = await registerOwner(env, "admin@example.com");

  const res = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "POST", reg.token, {
      code: "MAXUSES-ONGELDIG", kind: "free", maxUses: -1,
    }),
    env
  );
  assert.equal(res.status, 400);
});

// --- End-to-end: door platformbeheer aangemaakte code werkt echt -----------

test("een door platformbeheer aangemaakte 'free'-code met sessionLimit werkt bij een ANDERE praktijk via het gewone /api/access-code/redeem", async () => {
  const env = makeEnv("admin@yushin.example");
  const admin = await registerOwner(env, "admin@yushin.example");
  const tester = await registerOwner(env, "testpraktijk@example.com");

  const createRes = await worker.fetch(
    authedRequest("https://x/api/platform-admin/access-codes", "POST", admin.token, {
      code: "TESTERSCODE", kind: "free", sessionLimit: 3,
    }),
    env
  );
  assert.equal(createRes.status, 201);

  const redeemRes = await worker.fetch(
    authedRequest("https://x/api/access-code/redeem", "POST", tester.token, { code: "TESTERSCODE" }),
    env
  );
  assert.equal(redeemRes.status, 200);
  const redeemData = await redeemRes.json();
  assert.equal(redeemData.sessionLimit, 3);
});
