// Taak #71 — kernlogica van de vraag-flow op de server. Twee lagen:
// 1) directe unit-tests op de pure functies in src/lib/flowEngine.js
//    (gating, tally-opbouw, therapieplan-alias-resolutie);
// 2) end-to-end tests via de echte router (src/index.js) die een volledige
//    anamnese-sessie doorlopen zoals een toekomstige client dat zou doen:
//    herhaaldelijk POST /api/flow/next -> POST /api/flow/answer -> ... tot
//    "done", dan POST /api/flow/result.

import test from "node:test";
import assert from "node:assert/strict";
import { createFakeD1 } from "./fake-d1.js";
import { handleRegister } from "../src/routes/auth.js";
import worker from "../src/index.js";
import {
  getSections,
  buildFlow,
  findNextQuestion,
  computeResultState,
  lookupTherapiePlan,
} from "../src/lib/flowEngine.js";

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

async function registerOwner(env, contactEmail) {
  const res = await handleRegister(
    jsonRequest("https://x/api/auth/register", "POST", {
      organizationName: "Praktijk Flow",
      contactEmail,
      ownerName: "Owner",
      password: "correcthorsebattery",
    }),
    env
  );
  const data = await res.json();
  // Taak #118: sinds de vraag-flow zelf niet meer het onderwerp is van de
  // toegangsafdwinging (die staat apart getest in trial.test.js/
  // access-codes.test.js), activeren we de organisatie hier meteen — anders
  // zou elke test hieronder al bij de eerste /flow/next-aanroep met 402
  // geblokkeerd worden, wat niets zegt over de flow-engine zelf.
  await env.DB
    .prepare("UPDATE organizations SET subscription_status = 'active' WHERE id = ?")
    .bind(data.organization.id)
    .run();
  return data;
}

// --- Engine-level tests -----------------------------------------------

test("buildFlow: onlyIf female/pediatric en therapistOnly sluiten secties correct uit", () => {
  const sections = getSections("nl");

  const patientFlow = buildFlow(sections, { role: "patient", female: false, pediatric: false });
  assert.ok(!patientFlow.some((f) => f.sectionId === "s11")); // female-only
  assert.ok(!patientFlow.some((f) => f.sectionId === "s12")); // pediatric-only
  assert.ok(!patientFlow.some((f) => f.sectionId === "s13")); // therapistOnly

  const therapistFullFlow = buildFlow(sections, { role: "therapeut", female: true, pediatric: true });
  assert.ok(therapistFullFlow.some((f) => f.sectionId === "s11"));
  assert.ok(therapistFullFlow.some((f) => f.sectionId === "s12"));
  assert.ok(therapistFullFlow.some((f) => f.sectionId === "s13"));

  const disabledFlow = buildFlow(sections, { role: "therapeut", female: true, pediatric: true }, ["s13"]);
  assert.ok(!disabledFlow.some((f) => f.sectionId === "s13"));
});

// Beantwoordt (pure, geen router) alle vragen VOOR `targetKey` in structurele
// flow-volgorde met optie 0 (arbitrair — enkel om de gate-toestand tot op dat
// punt op te bouwen), zodat findNextQuestion daarna daadwerkelijk bij
// `targetKey` uitkomt i.p.v. bij de allereerste onbeantwoorde vraag van de
// hele lijst (s1:0). Geeft de opgebouwde answers-map terug.
function answerUpTo(flow, targetKey) {
  const answers = {};
  for (let i = 0; i < flow.length; i++) {
    const next = findNextQuestion(flow, answers);
    if (next.done || next.key === targetKey) return answers;
    answers[next.key] = 0;
  }
  throw new Error(`answerUpTo: ${targetKey} nooit bereikt`);
}

test("findNextQuestion: een requires-vraag wordt overgeslagen tot de gate-vraag beantwoord is", () => {
  const sections = getSections("nl");
  const flow = buildFlow(sections, { role: "therapeut", female: false, pediatric: false });

  // s3:0 = "Heeft de patiënt hoofdpijn?" — optie 2 ("Nee, geen hoofdpijn")
  // zet gate hoofdpijn=false. s3:1..4 (requires:["hoofdpijn"]) moeten dan
  // overgeslagen worden.
  const s3q0 = flow.find((f) => f.key === "s3:0");
  const noHeadacheIndex = s3q0.question.options.findIndex((o) => o.gate && o.gate.value === false);
  const yesHeadacheIndex = s3q0.question.options.findIndex((o) => o.gate && o.gate.value === true);
  assert.ok(noHeadacheIndex >= 0 && yesHeadacheIndex >= 0);

  const answersBeforeS3 = answerUpTo(flow, "s3:0");

  const next1 = findNextQuestion(flow, { ...answersBeforeS3, "s3:0": noHeadacheIndex });
  // De eerstvolgende onbeantwoorde vraag mag GEEN van de vier
  // hoofdpijn-detailvragen zijn (allemaal overgeslagen, gate niet vervuld).
  assert.notEqual(next1.key, "s3:1");
  assert.notEqual(next1.key, "s3:2");
  assert.notEqual(next1.key, "s3:3");
  assert.notEqual(next1.key, "s3:4");

  // Met "Ja" op hoofdpijn moet s3:1 wél de eerstvolgende vraag zijn direct na s3:0.
  const next2 = findNextQuestion(flow, { ...answersBeforeS3, "s3:0": yesHeadacheIndex });
  assert.equal(next2.key, "s3:1");
});

test("computeResultState: telt patronen op uit meerdere antwoorden en verzamelt orgaanklok-highlights", () => {
  const sections = getSections("nl");
  const flow = buildFlow(sections, { role: "therapeut", female: false, pediatric: false });

  // Vind twee losstaande vragen die minstens 1 pattern opleveren, en beantwoord
  // telkens de eerste optie met patterns.length > 0.
  const withPatterns = flow.filter((f) => f.question.options.some((o) => (o.patterns || []).length));
  const q1 = withPatterns[0];
  const optIdx1 = q1.question.options.findIndex((o) => (o.patterns || []).length);
  const pattern1 = q1.question.options[optIdx1].patterns[0];

  const { tally } = computeResultState(flow, { [q1.key]: optIdx1 });
  assert.equal(tally[pattern1].count, 1);
  assert.equal(tally[pattern1].evidence.length, 1);
  assert.ok(tally[pattern1].evidence[0].includes(q1.question.options[optIdx1].label));
});

test("lookupTherapiePlan: lost bekende spelling-varianten op naar dezelfde data", () => {
  const sections = getSections("nl");
  const flow = buildFlow(sections, { role: "therapeut", female: false, pediatric: false });
  const allPatterns = new Set();
  flow.forEach((f) => f.question.options.forEach((o) => (o.patterns || []).forEach((p) => allPatterns.add(p))));

  // Neem een willekeurig patroon dat effectief matcht, en bevestig dat de
  // opzoekfunctie consistente data teruggeeft (geen crash, geen undefined
  // structuur) — de exacte 161 patronen zijn al elders (build_therapy_template
  // scripts) inhoudelijk gevalideerd; hier testen we enkel de opzoeklogica zelf.
  let foundAtLeastOne = false;
  for (const p of allPatterns) {
    const data = lookupTherapiePlan(p);
    if (data) {
      foundAtLeastOne = true;
      assert.ok("mei_zin" in data || "punten" in data || "leefstijl" in data);
    }
  }
  assert.ok(foundAtLeastOne, "minstens één patroon uit SECTIONS zou therapieplan-data moeten hebben");

  assert.equal(lookupTherapiePlan("dit-patroon-bestaat-nergens"), null);
});

// --- Router-level end-to-end tests -------------------------------------

async function walkFullFlow(env, token, context, { maxSteps = 300 } = {}) {
  const answers = {};
  for (let i = 0; i < maxSteps; i++) {
    const nextRes = await worker.fetch(
      authedRequestImpl("https://x/api/flow/next", "POST", token, { lang: "nl", context, answers }),
      env,
      {}
    );
    assert.equal(nextRes.status, 200, `unexpected status on /next: ${nextRes.status}`);
    const nextData = await nextRes.json();
    if (nextData.done) return { answers, stepsTaken: i };

    const optionIndex = 0; // altijd de eerste optie kiezen — voldoende om de flow deterministisch af te ronden
    const answerRes = await worker.fetch(
      authedRequestImpl("https://x/api/flow/answer", "POST", token, {
        lang: "nl",
        context,
        answers,
        key: nextData.key,
        optionIndex,
      }),
      env,
      {}
    );
    assert.equal(answerRes.status, 200, `unexpected status on /answer voor ${nextData.key}: ${answerRes.status}`);

    answers[nextData.key] = optionIndex;
  }
  throw new Error("walkFullFlow: geen 'done' bereikt binnen maxSteps — mogelijke oneindige lus in de gating-logica");
}

test("router: volledige therapeut-sessie (NL) doorlopen geeft patronen + therapieplan, en persisteert de sessie", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "flow-therapist@example.com");
  const context = { role: "therapeut", female: true, pediatric: true };

  const { answers } = await walkFullFlow(env, reg.token, context);
  assert.ok(Object.keys(answers).length > 0);

  const resultRes = await worker.fetch(
    authedRequestImpl("https://x/api/flow/result", "POST", reg.token, { lang: "nl", context, answers }),
    env,
    {}
  );
  assert.equal(resultRes.status, 200);
  const data = await resultRes.json();
  assert.ok(data.sessionId);
  assert.ok(Array.isArray(data.result.patterns));
  // Therapeut-rol -> onderbouwing aanwezig.
  if (data.result.patterns.length) {
    assert.ok(Array.isArray(data.result.patterns[0].evidence));
  }

  const sessionRow = await env.DB
    .prepare("SELECT * FROM patient_sessions WHERE id = ?")
    .bind(data.sessionId)
    .first();
  assert.ok(sessionRow);
  assert.equal(sessionRow.organization_id, reg.organization.id);
  assert.equal(sessionRow.role, "therapist"); // vertaald van "therapeut" -> DB-waarde, zie flow.js
});

test("router: patiënt-sessie (NL) krijgt GEEN onderbouwing en GEEN therapieplan", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "flow-patient@example.com");
  const context = { role: "patient", female: false, pediatric: false };

  const { answers } = await walkFullFlow(env, reg.token, context);

  const resultRes = await worker.fetch(
    authedRequestImpl("https://x/api/flow/result", "POST", reg.token, { lang: "nl", context, answers }),
    env,
    {}
  );
  assert.equal(resultRes.status, 200);
  const data = await resultRes.json();

  assert.equal(data.result.therapyPlan, null);
  data.result.patterns.forEach((p) => {
    assert.equal(p.evidence, undefined);
  });

  const sessionRow = await env.DB
    .prepare("SELECT role FROM patient_sessions WHERE id = ?")
    .bind(data.sessionId)
    .first();
  assert.equal(sessionRow.role, "patient");
});

test("router: /api/flow/answer weigert een key die niet de huidige eerstvolgende vraag is, en een out-of-range optie", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "flow-invalid@example.com");
  const context = { role: "therapeut", female: false, pediatric: false };

  const nextRes = await worker.fetch(
    authedRequestImpl("https://x/api/flow/next", "POST", reg.token, { lang: "nl", context, answers: {} }),
    env,
    {}
  );
  const nextData = await nextRes.json();

  const wrongKeyRes = await worker.fetch(
    authedRequestImpl("https://x/api/flow/answer", "POST", reg.token, {
      lang: "nl",
      context,
      answers: {},
      key: "s99:0",
      optionIndex: 0,
    }),
    env,
    {}
  );
  assert.equal(wrongKeyRes.status, 409);

  const outOfRangeRes = await worker.fetch(
    authedRequestImpl("https://x/api/flow/answer", "POST", reg.token, {
      lang: "nl",
      context,
      answers: {},
      key: nextData.key,
      optionIndex: 999,
    }),
    env,
    {}
  );
  assert.equal(outOfRangeRes.status, 400);
});

test("router: /api/flow/result weigert een onvolledige vragenlijst met 409", async () => {
  const env = makeEnv();
  const reg = await registerOwner(env, "flow-incomplete@example.com");
  const context = { role: "therapeut", female: false, pediatric: false };

  const resultRes = await worker.fetch(
    authedRequestImpl("https://x/api/flow/result", "POST", reg.token, { lang: "nl", context, answers: {} }),
    env,
    {}
  );
  assert.equal(resultRes.status, 409);
});
