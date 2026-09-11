// Taak #141b — ingebouwde feedbackstap (POST /api/sessions/:id/feedback,
// migratie 0008). Test zowel de happy-path (opslaan + teruglezen via GET
// /api/sessions/:id) als de validatie- en eigenaarschapsregels van
// handleSubmitSessionFeedback (sessions.js).

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import { handleRegister, handleLogin } from "../src/routes/auth.js";
import { handleInviteUser } from "../src/routes/admin.js";
import worker from "../src/index.js";
import { savePatientSession, newId } from "../src/lib/db.js";

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

async function makeSession(env, practice, label) {
  const sessionId = newId();
  await savePatientSession(env.DB, {
    id: sessionId,
    organizationId: practice.organizationId,
    therapistId: practice.userId,
    patientLabel: label,
    role: "therapist",
    lang: "nl",
    answers: {},
    clockHighlights: [],
    result: {},
  });
  return sessionId;
}

test("POST /api/sessions/:id/feedback: zonder token -> 401", async () => {
  const env = makeEnv();
  const res = await worker.fetch(jsonRequest("https://x/api/sessions/abc/feedback", "POST", { rating: 5 }), env);
  assert.equal(res.status, 401);
});

test("POST /api/sessions/:id/feedback: opslaan + teruglezen via GET /api/sessions/:id", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Feedback",
    email: "eigenaar-feedback@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });
  const sessionId = await makeSession(env, practice, "Patiënt Feedback");

  const res = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}/feedback`, "POST", practice.token, {
      rating: 4,
      wouldRecommend: true,
      comment: "  Werkt vlot, duidelijke uitleg.  ",
    }),
    env
  );
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);

  const detailRes = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}`, "GET", practice.token),
    env
  );
  assert.equal(detailRes.status, 200);
  const detailData = await detailRes.json();
  assert.deepEqual(detailData.session.feedback, {
    rating: 4,
    wouldRecommend: true,
    comment: "Werkt vlot, duidelijke uitleg.",
    createdAt: detailData.session.feedback.createdAt,
  });
  assert.ok(detailData.session.feedback.createdAt);
});

test("GET /api/sessions/:id: sessie zonder feedback -> feedback is null", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Geen Feedback",
    email: "eigenaar-geen-feedback@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });
  const sessionId = await makeSession(env, practice, "Patiënt Zonder Feedback");

  const detailRes = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}`, "GET", practice.token),
    env
  );
  assert.equal(detailRes.status, 200);
  const detailData = await detailRes.json();
  assert.equal(detailData.session.feedback, null);
});

test("POST /api/sessions/:id/feedback: opnieuw indienen overschrijft de vorige feedback (geen dubbele rij)", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Feedback Overschrijven",
    email: "eigenaar-feedback-overschrijven@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });
  const sessionId = await makeSession(env, practice, "Patiënt Overschrijven");

  await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}/feedback`, "POST", practice.token, { rating: 2 }),
    env
  );
  const res2 = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}/feedback`, "POST", practice.token, {
      rating: 5,
      wouldRecommend: false,
    }),
    env
  );
  assert.equal(res2.status, 200);

  const { results } = await env.DB
    .prepare("SELECT * FROM session_feedback WHERE patient_session_id = ?")
    .bind(sessionId)
    .all();
  assert.equal(results.length, 1);
  assert.equal(results[0].rating, 5);
  assert.equal(results[0].would_recommend, 0);
});

test("POST /api/sessions/:id/feedback: rating buiten 1-5 -> 400", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Feedback Validatie",
    email: "eigenaar-feedback-validatie@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });
  const sessionId = await makeSession(env, practice, "Patiënt Validatie");

  for (const rating of [0, 6, 3.5, "5", null]) {
    const res = await worker.fetch(
      authedRequest(`https://x/api/sessions/${sessionId}/feedback`, "POST", practice.token, { rating }),
      env
    );
    assert.equal(res.status, 400, `rating ${JSON.stringify(rating)} had geweigerd moeten worden`);
  }
});

test("POST /api/sessions/:id/feedback: wouldRecommend anders dan true/false/leeg -> 400", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Feedback WouldRecommend",
    email: "eigenaar-feedback-wouldrecommend@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });
  const sessionId = await makeSession(env, practice, "Patiënt WouldRecommend");

  const res = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}/feedback`, "POST", practice.token, {
      rating: 3,
      wouldRecommend: "misschien",
    }),
    env
  );
  assert.equal(res.status, 400);
});

test("POST /api/sessions/:id/feedback: lange comment wordt afgekapt op 2000 tekens", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Feedback Lang",
    email: "eigenaar-feedback-lang@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });
  const sessionId = await makeSession(env, practice, "Patiënt Lang");

  const longComment = "x".repeat(3000);
  const res = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}/feedback`, "POST", practice.token, {
      rating: 3,
      comment: longComment,
    }),
    env
  );
  assert.equal(res.status, 200);

  const row = await env.DB
    .prepare("SELECT comment FROM session_feedback WHERE patient_session_id = ?")
    .bind(sessionId)
    .first();
  assert.equal(row.comment.length, 2000);
});

test("POST /api/sessions/:id/feedback: onbestaand sessie-ID -> 404", async () => {
  const env = makeEnv();
  const practice = await registerPractice(env, {
    name: "Praktijk Feedback 404",
    email: "eigenaar-feedback-404@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const res = await worker.fetch(
    authedRequest("https://x/api/sessions/does-not-exist/feedback", "POST", practice.token, { rating: 5 }),
    env
  );
  assert.equal(res.status, 404);
});

test("POST /api/sessions/:id/feedback: sessie van een collega binnen dezelfde praktijk -> 404 (enkel eigen sessies)", async () => {
  const env = makeEnv();
  const owner = await registerPractice(env, {
    name: "Praktijk Feedback Collega",
    email: "eigenaar-feedback-collega@example.com",
    ownerName: "Eigenaar",
    password: "correcthorsebattery",
  });

  const inviteRes = await handleInviteUser(
    authedRequest("https://x/api/admin/users", "POST", owner.token, {
      name: "Collega",
      email: "collega-feedback@example.com",
      password: "correcthorsebattery",
      role: "therapist",
    }),
    env,
    { session: { organizationId: owner.organizationId, userId: owner.userId, role: "owner" } }
  );
  assert.equal(inviteRes.status, 201);

  const loginRes = await handleLogin(
    jsonRequest("https://x/api/auth/login", "POST", {
      email: "collega-feedback@example.com",
      password: "correcthorsebattery",
    }),
    env
  );
  const collega = await loginRes.json();

  const sessionId = await makeSession(env, owner, "Sessie van de eigenaar");

  const res = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}/feedback`, "POST", collega.token, { rating: 5 }),
    env
  );
  assert.equal(res.status, 404);
});

test("POST /api/sessions/:id/feedback: sessie van een andere praktijk -> 404", async () => {
  const env = makeEnv();
  const orgA = await registerPractice(env, {
    name: "Praktijk Feedback A",
    email: "eigenaar-feedback-a@example.com",
    ownerName: "Eigenaar A",
    password: "correcthorsebattery",
  });
  const orgB = await registerPractice(env, {
    name: "Praktijk Feedback B",
    email: "eigenaar-feedback-b@example.com",
    ownerName: "Eigenaar B",
    password: "correcthorsebattery",
  });

  const sessionId = await makeSession(env, orgA, "Enkel voor A");

  const res = await worker.fetch(
    authedRequest(`https://x/api/sessions/${sessionId}/feedback`, "POST", orgB.token, { rating: 5 }),
    env
  );
  assert.equal(res.status, 404);
});
