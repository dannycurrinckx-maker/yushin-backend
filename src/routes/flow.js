// Vraag-flow-routes (taak #71) — kernlogica van de TCM 10+2 anamnese, nu op
// de server (src/lib/flowEngine.js). De server is stateless: elke aanroep
// stuurt de client de volledige stand van zaken mee ({lang, context,
// answers}), en de server herberekent alles vanaf nul (zie flowEngine.js
// voor de motivatie).
//
// LET OP — wijziging t.o.v. het oorspronkelijke routesschema: /api/flow/next
// en /api/flow/result staan in src/index.js nu op POST i.p.v. GET, omdat
// beide een JSON-body nodig hebben (de antwoordenset kan te groot/complex
// zijn voor querystring-parameters, en GET-met-body wordt door de Fetch API
// niet ondersteund).
//
// De vier "intro"-vragen (taal, rol, geslacht, pediatrisch) horen NIET bij
// deze routes: die blijven client-side (de client kent zijn eigen
// STRINGS_BY_LANG-tabel al voor de UI-teksten) en het resultaat ervan
// (lang/role/female/pediatric) wordt als `context` meegestuurd zodra het
// bekend is. De server begint pas te tellen vanaf de echte 78
// anamnese-vragen.

import { jsonResponse, readJsonBody } from "../lib/http.js";
import { newId, savePatientSession, getOrganizationById, countPatientSessionsForOrganization } from "../lib/db.js";
import { isTrialLimitReached, trialLimitMessage } from "../lib/trial.js";
import {
  getSections,
  buildFlow,
  findNextQuestion,
  computeResultState,
  rankPatterns,
  lookupTherapiePlan,
  detectContradictions,
  CONTRADICTION_IMPLEMENTATION_NOTE,
  getStaticSafetyChecklist,
  suggestDiscriminatingQuestions,
} from "../lib/flowEngine.js";

// Geëxporteerd (taak #134): src/routes/patientIntake.js hergebruikt exact
// deze functie voor de publieke wachtkamer-QR-routes, i.p.v. de validatie-
// en flow-opbouwlogica te dupliceren. De publieke routes forceren
// body.context.role naar "patient" VOORDAT ze dit aanroepen (zie
// patientIntake.js) — dat gebeurt dus bewust bij de aanroeper, niet hier,
// zodat deze functie voor beide callers exact hetzelfde blijft doen.
export function isValidContext(context) {
  if (!context || typeof context !== "object") return false;
  if (context.role !== "therapeut" && context.role !== "patient") return false;
  if (typeof context.female !== "boolean" && context.female !== null) return false;
  if (typeof context.pediatric !== "boolean" && context.pediatric !== null) return false;
  return true;
}

function isValidAnswers(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;
  return Object.values(answers).every((v) => Number.isInteger(v) && v >= 0);
}

// Valideert en verrijkt een AL INGELEZEN request-body naar de gedeelde vorm
// {lang, context, answers, disabledSectionIds, flow} — gebruikt door alle
// drie de routes hieronder. Neemt bewust een reeds-geparste `body` aan i.p.v.
// zelf request.json() aan te roepen: de Request-body kan maar EENMAAL
// gelezen worden, en handleSubmitAnswer heeft naast deze gedeelde velden ook
// nog {key, optionIndex} uit datzelfde object nodig.
// Geëxporteerd (taak #134) — zie de toelichting bij isValidContext hierboven.
export function parseFlowRequest(body) {
  if (!body) return { error: "Ongeldige aanvraag." };
  const lang = body.lang === "en" ? "en" : "nl";
  if (!isValidContext(body.context)) {
    return { error: "Ongeldige of ontbrekende context (role/female/pediatric)." };
  }
  const answers = body.answers || {};
  if (!isValidAnswers(answers)) {
    return { error: "Ongeldige antwoordenset." };
  }
  const disabledSectionIds = Array.isArray(body.disabledSectionIds) ? body.disabledSectionIds : [];
  const sections = getSections(lang);
  const flow = buildFlow(sections, body.context, disabledSectionIds);
  return { lang, context: body.context, answers, disabledSectionIds, flow, patientLabel: body.patientLabel };
}

// MDR-veilig-lanceren (04/09, launch-blocker) — vervangt de vroegere
// buildRedFlagsPayload(), die de veiligheidsmeldingen berekende uit de
// ingevulde antwoorden (sectie "s0safety"). Die koppeling is losgemaakt (zie
// redFlagData.js/flowEngine.js): dit geeft nu altijd dezelfde statische
// checklist terug, ongeacht `answers` — geen automatische beoordeling van
// patiëntdata meer, enkel een vaste, taalbewuste referentielijst. Blijft
// enkel therapeut-facing, zelfde dataminimalisatie-principe als
// evidence/therapyPlan hieronder.
// Geëxporteerd (taak #134) — zie de toelichting bij isValidContext hierboven.
export function buildSafetyChecklistPayload(lang, isTherapist) {
  if (!isTherapist) return [];
  return getStaticSafetyChecklist(lang);
}

// Taak #134 — kern van handleNextQuestion, losgetrokken van het Request/ctx-
// object zodat src/routes/patientIntake.js (publieke wachtkamer-QR-routes,
// geen ctx.session) exact dezelfde trial-check + gating + redFlags-logica
// hergebruikt i.p.v. ze te dupliceren (met het reële risico dat de twee
// paden ooit uit elkaar zouden lopen). `organizationId` komt bij de
// authenticated route uit ctx.session, bij de publieke route uit het
// opgeloste token — zie de aanroepers van deze functie.
export async function computeNextQuestionPayload(env, { body, organizationId }) {
  const parsed = parseFlowRequest(body);
  if (parsed.error) return { status: 400, payload: { error: parsed.error } };

  // Taak #118 (toegangscode-systeem, vervangt taak #114's proefperiode) —
  // enkel bij het STARTEN van een gloednieuwe sessie (nog geen enkel
  // antwoord) controleren, niet bij elke /flow/next-aanroep tijdens een
  // reeds bezig zijnde sessie: iemand die begon toen de organisatie nog
  // toegang had, mag die ene sessie altijd afronden (zie ook de defensieve
  // herhaling van deze check in handleGetResult hieronder, vlak voor het
  // persisteren). Dit voorkomt ook dat iemand pas na alle 78 vragen tegen de
  // muur aanloopt.
  if (Object.keys(parsed.answers).length === 0) {
    const organization = await getOrganizationById(env.DB, organizationId);
    // Taak #141b — sessieteller enkel hier opgevraagd (niet bij elke
    // /flow/next-aanroep tijdens een reeds bezig zijnde sessie), zelfde
    // motivatie als de bestaande "enkel bij een NIEUWE sessie"-check
    // hierboven: één extra COUNT-query per gestarte sessie, niet per vraag.
    const sessionCount = await countPatientSessionsForOrganization(env.DB, organizationId);
    if (isTrialLimitReached(organization, sessionCount)) {
      return { status: 402, payload: { error: trialLimitMessage(organization, sessionCount), trialLimitReached: true } };
    }
  }

  const isTherapist = parsed.context.role === "therapeut";
  const safetyChecklist = buildSafetyChecklistPayload(parsed.lang, isTherapist);

  const next = findNextQuestion(parsed.flow, parsed.answers);
  if (next.done) {
    return { status: 200, payload: { done: true, safetyChecklist } };
  }
  const answeredCount = Object.keys(parsed.answers).length;
  return {
    status: 200,
    payload: {
      done: false,
      key: next.key,
      sectionId: next.sectionId,
      sectionTitle: next.sectionTitle,
      isNewSection: next.isNewSection,
      question: next.question,
      progress: { answered: answeredCount, total: parsed.flow.length },
      safetyChecklist,
    },
  };
}

export async function handleNextQuestion(request, env, ctx) {
  const body = await readJsonBody(request);
  const { status, payload } = await computeNextQuestionPayload(env, {
    body,
    organizationId: ctx.session.organizationId,
  });
  return jsonResponse(payload, status);
}

// Valideert dat {key, optionIndex} op dit moment daadwerkelijk de
// eerstvolgende legitieme vraag/keuze is — nuttig voor directe UI-feedback
// (bv. een vraag die intussen door een gewijzigde context niet meer bereikbaar
// is). Dit is GEEN vervanging voor de robuustheidscontroles in
// computeResultState (die blijven ook gelden als deze route wordt
// overgeslagen) — zie de toelichting in flowEngine.js.
// Taak #134 — zelfde reden als computeNextQuestionPayload hierboven. Deze
// functie gebruikte al GEEN ctx/env-afhankelijke gegevens (puur validatie op
// de meegestuurde body), dus de publieke route kan dit zelfs zonder enige
// aanpassing hergebruiken.
export function computeAnswerValidation(body) {
  const parsed = parseFlowRequest(body);
  if (parsed.error) return { status: 400, payload: { error: parsed.error } };

  if (!body || typeof body.key !== "string" || !Number.isInteger(body.optionIndex)) {
    return { status: 400, payload: { error: "key en optionIndex zijn verplicht." } };
  }

  const next = findNextQuestion(parsed.flow, parsed.answers);
  if (next.done || next.key !== body.key) {
    return { status: 409, payload: { error: "Deze vraag is momenteel niet de eerstvolgende in de flow." } };
  }
  const optionCount = next.question.options.length;
  if (body.optionIndex < 0 || body.optionIndex >= optionCount) {
    return { status: 400, payload: { error: "Ongeldige antwoordoptie." } };
  }

  return { status: 200, payload: { ok: true } };
}

export async function handleSubmitAnswer(request, env) {
  const body = await readJsonBody(request);
  const { status, payload } = computeAnswerValidation(body);
  return jsonResponse(payload, status);
}

// Taak #134 — kern van handleGetResult, losgetrokken van env/ctx zodat
// src/routes/patientIntake.js exact dezelfde berekening (dataminimalisatie
// evidence/contradicties/therapyPlan/vervolgvragen inbegrepen) hergebruikt
// voor de publieke wachtkamer-sessie i.p.v. deze vrij complexe rol-gating
// logica te dupliceren — een duplicaat zou bij een toekomstige wijziging
// hier stilzwijgend uit sync kunnen raken. Neemt enkel `parsed` aan (het
// resultaat van parseFlowRequest) en doet zelf geen DB-I/O; persisteren
// blijft de verantwoordelijkheid van de aanroeper (zie hieronder).
export function buildResultPayload(parsed) {
  const { tally, clockHighlights } = computeResultState(parsed.flow, parsed.answers);
  const ranked = rankPatterns(tally);
  const top = ranked.slice(0, 8);
  const isTherapist = parsed.context.role === "therapeut";

  // Onderbouwing (welk antwoord tot welk patroon leidde) blijft therapeut-only
  // — nu als echte server-side dataminimalisatie i.p.v. enkel een UI-keuze:
  // een patiënt-sessie krijgt de evidence-array simpelweg nooit toegestuurd.
  // Confidence (Spoor 1.1) is GEEN gevoelige onderbouwing, maar een korte
  // samenvattende classificatie zoals `group` — daarom, net als `group`,
  // altijd meegestuurd, ook aan de patiëntrol.
  const patterns = top.map((p) => ({
    pattern: p.pattern,
    count: p.count,
    group: p.group,
    confidence: p.confidence,
    ...(isTherapist ? { evidence: p.evidence } : {}),
  }));

  const safetyChecklist = buildSafetyChecklistPayload(parsed.lang, isTherapist);

  // Contradictiedetectie (Spoor 1.3) gebruikt letterlijke Nederlandse
  // patroon-sleutels (zie contradictionData.js) — net als het therapieplan
  // hieronder werkt dit enkel betrouwbaar voor NL-sessies, omdat de Engelse
  // sectiedata vertaalde patroonnamen gebruikt die niet overeenkomen met
  // deze sleutels. Daarom dezelfde `lang === "nl"`-gate als therapyPlan.
  const contradictions =
    isTherapist && parsed.lang === "nl" ? detectContradictions(tally) : [];

  // Vervolgvragen-detectie (Spoor 1.2): enkel therapeut-facing, zelfde
  // dataminimalisatie-redenering als evidence hierboven.
  const suggestedQuestions = isTherapist
    ? suggestDiscriminatingQuestions(getSections(parsed.lang), tally, parsed.answers)
    : [];

  // Therapieplan-voorstel: enkel therapeut-rol + Nederlandstalige sessies,
  // zelfde beperking als addTherapyPlanOffer() client-side (de brondata is
  // enkel in het Nederlands klinisch nagekeken).
  //
  // LET OP (bugfix): dit itereert bewust over `top` (dezelfde 8 patronen die
  // hierboven als `patterns` naar de client gaan), NIET over de volledige
  // `ranked`-lijst. Voorheen liep dit over `ranked`, waardoor de
  // Yushin-assistent-pop-up therapieplan-voorstellen kon aanbieden voor
  // patronen die helemaal niet in het rapport (`patterns`) stonden — een
  // patroon buiten de top-8 kreeg dan toch een titel in het keuzemenu. De
  // assistent mag enkel voorstellen doen voor patronen die de therapeut ook
  // effectief in het rapport ziet.
  //
  // MDR-veilig-lanceren (04/09, launch-blocker): `data` uit
  // lookupTherapiePlan() bevat ook `punten` (concrete acupunctuurpunten) en
  // `kruiden`/`leefstijl` (behandel-/leefstijladvies) — dat is het duidelijkste
  // automatisch gegenereerde "behandeladvies" in de hele app. Beslissing
  // Danny: enkel de algemene, educatieve toelichting (`mei_zin`) blijft
  // zichtbaar; punten/kruiden/leefstijl worden hier, server-side, uit de
  // respons gehaald (dataminimalisatie, niet enkel client-side verbergen —
  // zo kunnen ze ook niet via devtools/de rauwe API-respons afgelezen worden).
  let therapyPlan = null;
  if (isTherapist && parsed.lang === "nl" && top.length) {
    const matched = [];
    let unmatchedCount = 0;
    top.forEach((p) => {
      const data = lookupTherapiePlan(p.pattern);
      if (data) matched.push({ pattern: p.pattern, mei_zin: data.mei_zin || null });
      else unmatchedCount += 1;
    });
    therapyPlan = { matched, unmatchedCount };
  }

  const result = {
    patterns,
    topPattern: ranked[0]?.pattern || null,
    secondPattern: ranked[1]?.pattern || null,
    clockHighlights,
    therapyPlan,
    safetyChecklist,
    contradictions,
    contradictionNote: contradictions.length ? CONTRADICTION_IMPLEMENTATION_NOTE : null,
    suggestedQuestions,
    generatedAt: new Date().toISOString(),
  };

  // Let op de vertaling hieronder: flowEngine.js/de client gebruiken bewust
  // dezelfde interne waarde als het oorspronkelijke client-side script
  // ("therapeut", Nederlands — 1-op-1 overgenomen gedrag), terwijl het
  // patient_sessions-schema (nieuwe SaaS-infrastructuur, zie migraties) de
  // Engelse waarden 'therapist'/'patient' verwacht, consistent met
  // users.role. Deze functie is de enige plek waar dat verschil overbrugd
  // wordt.
  const dbRole = parsed.context.role === "therapeut" ? "therapist" : "patient";

  return { result, dbRole };
}

export async function handleGetResult(request, env, ctx) {
  const body = await readJsonBody(request);
  const parsed = parseFlowRequest(body);
  if (parsed.error) return jsonResponse({ error: parsed.error }, 400);

  const next = findNextQuestion(parsed.flow, parsed.answers);
  if (!next.done) {
    return jsonResponse({ error: "De vragenlijst is nog niet volledig ingevuld." }, 409);
  }

  // Taak #118 — defensieve herhaling van de check uit handleNextQuestion,
  // vlak vóór het persisteren van een NIEUWE patient_sessions-rij. Dit is de
  // plek die er echt toe doet (hier wordt de analyse pas effectief
  // opgeslagen); de eerdere check in handleNextQuestion is enkel een
  // UX-verbetering om iemand niet pas na 78 vragen tegen de muur te laten
  // lopen. Zonder deze herhaling zou een sessie die START terwijl de
  // organisatie nog toegang had, maar pas AFROND nadat de toegang intussen
  // (bv. via een verlopen/ingetrokken situatie) wegviel, toch nog stilzwijgend
  // een resultaat opslaan.
  const organizationForTrialCheck = await getOrganizationById(env.DB, ctx.session.organizationId);
  const sessionCountForTrialCheck = await countPatientSessionsForOrganization(env.DB, ctx.session.organizationId);
  if (isTrialLimitReached(organizationForTrialCheck, sessionCountForTrialCheck)) {
    return jsonResponse(
      { error: trialLimitMessage(organizationForTrialCheck, sessionCountForTrialCheck), trialLimitReached: true },
      402
    );
  }

  const { result, dbRole } = buildResultPayload(parsed);

  // Persisteren als afgeronde patiëntsessie, altijd gescoped op de sessie
  // van de ingelogde therapeut (organizationId/therapistId komen NOOIT uit
  // de request body — zie multi-tenancy-afspraak, taak #69).
  const sessionId = newId();
  await savePatientSession(env.DB, {
    id: sessionId,
    organizationId: ctx.session.organizationId,
    therapistId: ctx.session.userId,
    patientLabel: typeof parsed.patientLabel === "string" ? parsed.patientLabel.slice(0, 200) : null,
    role: dbRole,
    lang: parsed.lang,
    answers: parsed.answers,
    clockHighlights: result.clockHighlights,
    result,
  });

  return jsonResponse({ sessionId, result });
}
