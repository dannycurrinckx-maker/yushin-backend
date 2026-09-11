// Wachtkamer-QR-intake (taak #134) — een patiënt scant een QR-code die bij
// de therapeut/praktijk hangt (bv. in de wachtkamer), en vult de volledige
// anamnese zelf in op zijn EIGEN toestel, zonder account en zonder in te
// loggen. Het resultaat verschijnt nadien vanzelf in het Sessiedashboard van
// de therapeut van wie de QR-code was (exact dezelfde weg als een sessie die
// een patiënt vandaag al invult op een geleend, ingelogd toestel — zie de
// bestaande `role: "patient"`-afhandeling in flow.js/db.js).
//
// Dit bestand bevat twee, bewust duidelijk gescheiden groepen routes:
//
// 1) TOKEN-BEHEER (auth: "required", zie src/index.js) — een ingelogde
//    therapeut beheert zijn EIGEN deelbare link/QR-code:
//    handleGetPatientIntakeToken / handleCreatePatientIntakeToken /
//    handleRevokePatientIntakeToken.
//
// 2) DE PUBLIEKE WACHTKAMER-FLOW ZELF (auth: "none") — een willekeurige,
//    niet-ingelogde bezoeker met een geldig token: handlePublicIntakeNext /
//    handlePublicIntakeAnswer / handlePublicIntakeResult. Dit zijn de enige
//    drie routes in de hele applicatie die ZONDER Bearer-sessietoken
//    patiëntdata mogen aanmaken — daarom gelden hier EXTRA
//    beveiligingsregels, strenger dan overal elders in de codebase:
//
//    a) organizationId/therapistId komen ALTIJD uit het opgeloste
//       patient_intake_token (getUserByPatientIntakeToken), NOOIT uit de
//       request-body — dit is dezelfde multi-tenancy-afspraak (taak #69)
//       als overal elders, enkel met het token i.p.v. ctx.session als bron.
//    b) De rol wordt hier ALTIJD hard geforceerd naar "patient", ongeacht
//       wat de aanroeper in body.context.role meestuurt (zie
//       forcePatientRole hieronder). Zonder deze forcering zou iemand die
//       een publieke QR-link onderschept een crafted request met
//       role:"therapeut" kunnen sturen en zo therapeut-only velden
//       (evidence/contradicties/therapieplan-tekst/vervolgvragen/
//       veiligheidssignalen-detail) kunnen buitmaken — exact de
//       dataminimalisatie die flow.js voor een patiëntrol al garandeert,
//       hier dus verplicht, niet optioneel. Zie de test
//       "publieke route negeert role:'therapeut' uit de body" in
//       tests/patientIntake.test.js voor de vergrendeling hiervan.
//    c) Geen enkele van deze routes geeft iets terug waarmee een bezoeker
//       bestaande sessies van de praktijk zou kunnen opvragen — het token
//       geeft uitsluitend het recht om ÉÉN NIEUWE sessie te starten/af te
//       ronden (schrijftoegang), nooit leestoegang tot bestaande data. Het
//       sessionId wordt bewust niet teruggegeven aan de patiënt-client (zie
//       handlePublicIntakeResult) — dat heeft voor een patiënt zonder
//       account toch geen functie.

import { jsonResponse, readJsonBody } from "../lib/http.js";
import {
  newId,
  getUserById,
  getOrganizationById,
  savePatientSession,
  setUserPatientIntakeToken,
  clearUserPatientIntakeToken,
  getUserByPatientIntakeToken,
  recordAuditLogEntry,
  countPatientSessionsForOrganization,
} from "../lib/db.js";
import { isTrialLimitReached } from "../lib/trial.js";
import { findNextQuestion } from "../lib/flowEngine.js";
import {
  parseFlowRequest,
  computeNextQuestionPayload,
  computeAnswerValidation,
  buildResultPayload,
} from "./flow.js";

// Patiëntvriendelijke variant van trial.js' TRIAL_LIMIT_MESSAGE: die
// oorspronkelijke boodschap ("Rond een abonnement af of voer een geldige
// toegangscode in") is voor de PRAKTIJKEIGENAAR bedoeld en zou een patiënt
// in de wachtkamer alleen maar verwarren over facturatie die hem niet
// aangaat. Vervangt het bericht enkel bij het teruggeven aan de publieke
// client — de onderliggende `trialLimitReached`-vlag en de logica zelf
// blijven exact dezelfde (computeNextQuestionPayload hieronder).
const PUBLIC_TRIAL_LIMIT_MESSAGE =
  "Deze praktijk kan momenteel geen nieuwe wachtkamer-intake ontvangen. Meld dit even aan de balie.";

const INVALID_TOKEN_MESSAGE =
  "Deze QR-code of link is niet (meer) geldig. Vraag een nieuwe aan bij de balie.";

async function logPatientIntakeTokenAudit(env, ctx, { action, detail }) {
  try {
    const actor = await getUserById(env.DB, ctx.session.userId);
    await recordAuditLogEntry(env.DB, {
      organizationId: ctx.session.organizationId,
      actorUserId: ctx.session.userId,
      actorLabel: actor ? actor.name : "onbekend",
      action,
      targetType: "user",
      targetId: ctx.session.userId,
      detail,
    });
  } catch (err) {
    // Zelfde principe als elders (sessions.js/admin.js): een falende
    // logregel mag het aanmaken/intrekken van een QR-code nooit blokkeren.
    console.error("Kon auditlog-regel niet wegschrijven (patientIntake):", err);
  }
}

// --- 1) Token-beheer (ingelogde therapeut, zijn eigen account) ------------

export async function handleGetPatientIntakeToken(request, env, ctx) {
  const user = await getUserById(env.DB, ctx.session.userId);
  return jsonResponse({ token: (user && user.patient_intake_token) || null });
}

// Genereert (of vervangt) de eigen deelbare token. Bewust geen "owner"-only
// route: elke therapeut in een team-praktijk mag zijn EIGEN wachtkamer-QR
// beheren, net zoals elke therapeut ook enkel zijn eigen sessies ziet
// (handleListSessions in sessions.js) — consistent met die bestaande
// scope-afspraak.
export async function handleCreatePatientIntakeToken(request, env, ctx) {
  const token = newId();
  await setUserPatientIntakeToken(env.DB, ctx.session.organizationId, ctx.session.userId, token);
  await logPatientIntakeTokenAudit(env, ctx, { action: "wachtkamer_qr_aangemaakt" });
  return jsonResponse({ token });
}

// Intrekken is het enige "een gelekte/kwijtgeraakte QR-code ongeldig maken"-
// mechanisme dat deze functie nodig heeft (zie migratie 0006): na intrekken
// faalt elke public/intake-aanroep met die oude token meteen op
// getUserByPatientIntakeToken (geeft null terug zodra de kolom NULL is).
export async function handleRevokePatientIntakeToken(request, env, ctx) {
  await clearUserPatientIntakeToken(env.DB, ctx.session.organizationId, ctx.session.userId);
  await logPatientIntakeTokenAudit(env, ctx, { action: "wachtkamer_qr_ingetrokken" });
  return jsonResponse({ ok: true });
}

// --- 2) Publieke wachtkamer-flow (geen account, geen Bearer-token) --------

async function resolveTherapistByToken(env, token) {
  if (typeof token !== "string" || !token) return null;
  return getUserByPatientIntakeToken(env.DB, token);
}

// Bouwt een NIEUW body-object met context.role hard op "patient" gezet,
// ongeacht wat de aanroeper meestuurde — zie de beveiligingstoelichting
// bovenaan dit bestand (punt b). Wordt bij ALLE drie de publieke routes
// hieronder toegepast, vlak na het opzoeken van het token en vóór
// parseFlowRequest/computeAnswerValidation.
function forcePatientRole(body) {
  return { ...(body || {}), context: { ...((body && body.context) || {}), role: "patient" } };
}

export async function handlePublicIntakeNext(request, env) {
  const rawBody = await readJsonBody(request);
  if (!rawBody || typeof rawBody.token !== "string") {
    return jsonResponse({ error: "Ontbrekende toegangscode." }, 400);
  }
  const user = await resolveTherapistByToken(env, rawBody.token);
  if (!user) return jsonResponse({ error: INVALID_TOKEN_MESSAGE }, 401);

  const body = forcePatientRole(rawBody);
  const { status, payload } = await computeNextQuestionPayload(env, {
    body,
    organizationId: user.organization_id,
  });
  if (status === 402) {
    return jsonResponse({ ...payload, error: PUBLIC_TRIAL_LIMIT_MESSAGE }, 402);
  }
  return jsonResponse(payload, status);
}

export async function handlePublicIntakeAnswer(request, env) {
  const rawBody = await readJsonBody(request);
  if (!rawBody || typeof rawBody.token !== "string") {
    return jsonResponse({ error: "Ontbrekende toegangscode." }, 400);
  }
  const user = await resolveTherapistByToken(env, rawBody.token);
  if (!user) return jsonResponse({ error: INVALID_TOKEN_MESSAGE }, 401);

  const { status, payload } = computeAnswerValidation(forcePatientRole(rawBody));
  return jsonResponse(payload, status);
}

export async function handlePublicIntakeResult(request, env) {
  const rawBody = await readJsonBody(request);
  if (!rawBody || typeof rawBody.token !== "string") {
    return jsonResponse({ error: "Ontbrekende toegangscode." }, 400);
  }
  const user = await resolveTherapistByToken(env, rawBody.token);
  if (!user) return jsonResponse({ error: INVALID_TOKEN_MESSAGE }, 401);

  const body = forcePatientRole(rawBody);
  const parsed = parseFlowRequest(body);
  if (parsed.error) return jsonResponse({ error: parsed.error }, 400);

  const next = findNextQuestion(parsed.flow, parsed.answers);
  if (!next.done) {
    return jsonResponse({ error: "De vragenlijst is nog niet volledig ingevuld." }, 409);
  }

  // Defensieve herhaling van de trial-check, exact dezelfde reden als in
  // handleGetResult (flow.js): een sessie die START terwijl de praktijk nog
  // toegang had, maar pas AFROND nadat die toegang intussen wegviel, mag
  // niet alsnog stilzwijgend opgeslagen worden.
  const organization = await getOrganizationById(env.DB, user.organization_id);
  // Taak #141b — zelfde sessieteller als flow.js's handleGetResult, anders
  // zou een gelimiteerd testaccount zijn quotum kunnen omzeilen via de
  // publieke wachtkamer-QR-link.
  const sessionCount = await countPatientSessionsForOrganization(env.DB, user.organization_id);
  if (isTrialLimitReached(organization, sessionCount)) {
    return jsonResponse({ error: PUBLIC_TRIAL_LIMIT_MESSAGE, trialLimitReached: true }, 402);
  }

  const { result, dbRole } = buildResultPayload(parsed);
  // dbRole is hier ALTIJD "patient": buildResultPayload leidt dit af uit
  // parsed.context.role, en die is hierboven al hard geforceerd.

  const sessionId = newId();
  await savePatientSession(env.DB, {
    id: sessionId,
    organizationId: user.organization_id,
    therapistId: user.id,
    patientLabel: typeof parsed.patientLabel === "string" ? parsed.patientLabel.slice(0, 200) : null,
    role: dbRole,
    lang: parsed.lang,
    answers: parsed.answers,
    clockHighlights: result.clockHighlights,
    result,
  });

  // Bewust GEEN sessionId teruggeven (in tegenstelling tot het
  // therapeut-facing /api/flow/result): dat ID heeft voor een patiënt zonder
  // account geen enkele functie en hoeft niet onnodig te lekken. Het
  // volledige `result` wel — de patiënt moet zijn eigen rapport meteen op
  // zijn telefoon kunnen zien, net als vandaag al gebeurt bij een sessie op
  // een geleend, ingelogd toestel.
  return jsonResponse({ result });
}
