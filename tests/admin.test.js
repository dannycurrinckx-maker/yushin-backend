// Taak #73 — Beheerpaneel: leden opvragen, uitnodigen (aanmaken) en
// verwijderen (deactiveren), altijd scoped op de eigen organisatie van de
// ingelogde owner. Draait tegen dezelfde echte SQLite-engine + echte
// productiecode (router + db.js) als de andere testbestanden — zie fake-d1.js.

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
  const data = await res.json();
  return { token: data.token, organizationId: data.organization.id, userId: data.user.id };
}

async function inviteUser(env, ownerToken, { name, email, password, role }) {
  return worker.fetch(
    authedRequest("https://x/api/admin/users", "POST", ownerToken, { name, email, password, role }),
    env,
    {}
  );
}

async function listUsers(env, ownerToken) {
  return worker.fetch(authedRequest("https://x/api/admin/users", "GET", ownerToken), env, {});
}

async function removeUser(env, ownerToken, userId) {
  return worker.fetch(
    authedRequest(`https://x/api/admin/users?userId=${encodeURIComponent(userId)}`, "DELETE", ownerToken),
    env,
    {}
  );
}

test("beheerpaneel: owner kan een therapeut uitnodigen en die verschijnt in de ledenlijst", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Beheer 1",
    email: "eigenaar-beheer1@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const inviteRes = await inviteUser(env, owner.token, {
    name: "Nieuwe Therapeut",
    email: "therapeut1@example.com",
    password: "correcthorsebattery",
  });
  assert.equal(inviteRes.status, 201);
  const inviteData = await inviteRes.json();
  assert.equal(inviteData.user.role, "therapist"); // default rol
  assert.equal(inviteData.user.is_active, true);

  const listRes = await listUsers(env, owner.token);
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.users.length, 2); // owner + nieuwe therapeut
  const emails = listData.users.map((u) => u.email);
  assert.ok(emails.includes("therapeut1@example.com"));
  assert.ok(listData.users.every((u) => typeof u.is_active === "boolean"));
});

test("beheerpaneel: een niet-owner (therapeut) krijgt geen toegang tot beheerroutes", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Beheer 2",
    email: "eigenaar-beheer2@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });
  await inviteUser(env, owner.token, {
    name: "Therapeut Zonder Rechten",
    email: "therapeut2@example.com",
    password: "correcthorsebattery",
  });

  const loginRes = await worker.fetch(
    jsonRequest("https://x/api/auth/login", "POST", {
      email: "therapeut2@example.com",
      password: "correcthorsebattery",
    }),
    env,
    {}
  );
  const loginData = await loginRes.json();

  const res = await listUsers(env, loginData.token);
  assert.equal(res.status, 403);
});

test("beheerpaneel: uitnodigen met dubbel e-mailadres wordt geweigerd (409)", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Beheer 3",
    email: "eigenaar-beheer3@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const first = await inviteUser(env, owner.token, {
    name: "Therapeut A",
    email: "dubbel@example.com",
    password: "correcthorsebattery",
  });
  assert.equal(first.status, 201);

  const second = await inviteUser(env, owner.token, {
    name: "Therapeut B",
    email: "dubbel@example.com",
    password: "anderwachtwoord123",
  });
  assert.equal(second.status, 409);
});

test("beheerpaneel: uitnodigen met een ongeldige rol wordt geweigerd (400)", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Beheer 4",
    email: "eigenaar-beheer4@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const res = await inviteUser(env, owner.token, {
    name: "Therapeut C",
    email: "ongeldigerol@example.com",
    password: "correcthorsebattery",
    role: "superadmin",
  });
  assert.equal(res.status, 400);
});

test("beheerpaneel: verwijderen (deactiveren) van een therapeut werkt en logt die therapeut meteen uit", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Beheer 5",
    email: "eigenaar-beheer5@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });
  const inviteRes = await inviteUser(env, owner.token, {
    name: "Therapeut D",
    email: "therapeut5@example.com",
    password: "correcthorsebattery",
  });
  const inviteData = await inviteRes.json();
  const therapistId = inviteData.user.id;

  // De therapeut logt zelf in en heeft dus een geldig token vóór verwijdering.
  const loginRes = await worker.fetch(
    jsonRequest("https://x/api/auth/login", "POST", {
      email: "therapeut5@example.com",
      password: "correcthorsebattery",
    }),
    env,
    {}
  );
  const loginData = await loginRes.json();
  assert.equal(loginRes.status, 200);

  const removeRes = await removeUser(env, owner.token, therapistId);
  assert.equal(removeRes.status, 200);

  // Diens bestaande sessietoken is nu meteen ongeldig (auth_sessions ingetrokken
  // + getAuthSession's "is_active = 1"-check) — een authenticated call moet 401 geven.
  const afterRemovalRes = await worker.fetch(
    authedRequest("https://x/api/auth/logout", "POST", loginData.token),
    env,
    {}
  );
  assert.equal(afterRemovalRes.status, 401);

  // En een nieuwe inlogpoging met het juiste wachtwoord wordt nu geweigerd
  // met een duidelijke "gedeactiveerd"-melding (403), niet de generieke 401.
  const reLoginRes = await worker.fetch(
    jsonRequest("https://x/api/auth/login", "POST", {
      email: "therapeut5@example.com",
      password: "correcthorsebattery",
    }),
    env,
    {}
  );
  assert.equal(reLoginRes.status, 403);

  // De ledenlijst toont de therapeut nog steeds (historiek/audit), maar met is_active: false.
  const listRes = await listUsers(env, owner.token);
  const listData = await listRes.json();
  const removed = listData.users.find((u) => u.id === therapistId);
  assert.ok(removed);
  assert.equal(removed.is_active, false);
});

test("beheerpaneel: de laatste actieve eigenaar kan niet verwijderd worden", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Beheer 6",
    email: "eigenaar-beheer6@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const res = await removeUser(env, owner.token, owner.userId);
  assert.equal(res.status, 400);

  // Met een tweede, actieve owner erbij mag de eerste wél verwijderd worden.
  const secondOwnerRes = await inviteUser(env, owner.token, {
    name: "Mede-eigenaar",
    email: "mede-eigenaar6@example.com",
    password: "correcthorsebattery",
    role: "owner",
  });
  assert.equal(secondOwnerRes.status, 201);

  const res2 = await removeUser(env, owner.token, owner.userId);
  assert.equal(res2.status, 200);
});

test("beheerpaneel: multi-tenancy — een owner kan geen gebruiker van een andere praktijk verwijderen", async () => {
  const env = makeEnv();
  const ownerA = await registerPractice(env, {
    name: "Praktijk Beheer 7A",
    email: "eigenaar-beheer7a@example.com",
    ownerName: "Eigenaar A",
    password: "correcthorsebattery",
  });
  const ownerB = await registerPractice(env, {
    name: "Praktijk Beheer 7B",
    email: "eigenaar-beheer7b@example.com",
    ownerName: "Eigenaar B",
    password: "correcthorsebattery",
  });

  // Eigenaar A probeert (bv. via een geraden/gelekt ID) het account van
  // eigenaar B te verwijderen via HAAR EIGEN sessietoken.
  const res = await removeUser(env, ownerA.token, ownerB.userId);
  assert.equal(res.status, 404); // "niet gevonden in deze praktijk", niet 200

  // Ter controle: B is nog steeds gewoon actief en kan nog inloggen.
  const loginRes = await worker.fetch(
    jsonRequest("https://x/api/auth/login", "POST", {
      email: "eigenaar-beheer7b@example.com",
      password: "correcthorsebattery",
    }),
    env,
    {}
  );
  assert.equal(loginRes.status, 200);
});

test("beheerpaneel: userId ontbreken bij verwijderen geeft 400, onbekend userId geeft 404", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Beheer 8",
    email: "eigenaar-beheer8@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const noIdRes = await worker.fetch(
    authedRequest("https://x/api/admin/users", "DELETE", owner.token),
    env,
    {}
  );
  assert.equal(noIdRes.status, 400);

  const unknownRes = await removeUser(env, owner.token, "does-not-exist");
  assert.equal(unknownRes.status, 404);
});

// Taak #115 — Practice seat-limiet (max 3 actieve gebruikers, zie
// src/lib/plans.js `maxSeats` op het "team"-plan).
test("beheerpaneel: Practice-organisatie (plan 'team') kan max. 3 actieve gebruikers hebben — de 4de uitnodiging wordt geweigerd (403)", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Beheer 9 (Practice)",
    email: "eigenaar-beheer9@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });
  // Simuleer een afgerond abonnement op het Practice-plan (in de echte flow
  // gebeurt dit via de Mollie-webhook, zie billing.js) — enkel org.plan is
  // relevant voor deze check, subscription_status doet er hier niet toe.
  await env.DB.prepare("UPDATE organizations SET plan = 'team' WHERE id = ?").bind(owner.organizationId).run();

  // Owner telt al mee als 1 actieve gebruiker -> nog 2 plaatsen vrij.
  const first = await inviteUser(env, owner.token, {
    name: "Therapeut Seat 1",
    email: "seat1@example.com",
    password: "correcthorsebattery",
  });
  assert.equal(first.status, 201);

  const second = await inviteUser(env, owner.token, {
    name: "Therapeut Seat 2",
    email: "seat2@example.com",
    password: "correcthorsebattery",
  });
  assert.equal(second.status, 201);

  // Nu zijn er 3 actieve gebruikers (owner + 2) -> de limiet is bereikt.
  const third = await inviteUser(env, owner.token, {
    name: "Therapeut Seat 3",
    email: "seat3@example.com",
    password: "correcthorsebattery",
  });
  assert.equal(third.status, 403);
  const thirdData = await third.json();
  assert.ok(thirdData.error.includes("3"));

  // Na het deactiveren van één therapeut is er weer een vrije plaats.
  const secondData = await second.json();
  const removeRes = await removeUser(env, owner.token, secondData.user.id);
  assert.equal(removeRes.status, 200);

  const fourth = await inviteUser(env, owner.token, {
    name: "Therapeut Seat 4",
    email: "seat4@example.com",
    password: "correcthorsebattery",
  });
  assert.equal(fourth.status, 201);
});

test("beheerpaneel: Professional-organisatie (plan 'solo', standaard) heeft GEEN seat-limiet — bestaand gedrag blijft ongewijzigd", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Beheer 10 (Professional)",
    email: "eigenaar-beheer10@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  // Standaard plan na registratie is 'solo' (zie createOrganization in
  // db.js) — meerdere uitnodigingen moeten hier gewoon blijven lukken,
  // want maxSeats staat bewust enkel op het team-plan (zie plans.js).
  for (let i = 1; i <= 3; i++) {
    const res = await inviteUser(env, owner.token, {
      name: `Therapeut Solo ${i}`,
      email: `solo${i}@example.com`,
      password: "correcthorsebattery",
    });
    assert.equal(res.status, 201, `uitnodiging ${i} had moeten lukken voor plan 'solo'`);
  }
});
