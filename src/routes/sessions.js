// Patiëntsessies — lijst-/detailweergave (taak #127, eerste stap van
// "app-shell koppelen aan live sessiedata").
//
// Bewust een aparte, kleine route i.p.v. dit in flow.js te proppen: flow.js
// gaat over het ÍNVULLEN van een nieuwe sessie (taak #71), deze route gaat
// over het TERUGLEZEN van al afgeronde sessies — ander doel, andere auth-
// overwegingen (hier puur leeswerk, geen trial-limietcontrole nodig).
//
// Scope (bewust): enkel de EIGEN sessies van de ingelogde therapeut, niet de
// volledige praktijk. Dit hergebruikt listPatientSessions(db, organizationId,
// therapistId) uit db.js zoals die al bestond — organizationId ALLEEN was
// hier onvoldoende geweest voor de dataminimalisatie-lijn die de rest van
// deze codebase al volgt (bv. evidence/therapyPlan die ook nooit breder dan
// nodig gedeeld worden). Een "alle sessies van de praktijk"-weergave voor de
// praktijkeigenaar is een bewust latere uitbreiding (zie openstaande-
// puntentracker), niet dit endpoint.

import { jsonResponse, readJsonBody } from "../lib/http.js";
import {
  listPatientSessions,
  getPatientSession,
  getUserById,
  recordAuditLogEntry,
  newId,
  saveSessionFeedback,
  getSessionFeedbackForSession,
} from "../lib/db.js";

// Auditlog-hulpfunctie (taak #133): nooit laten doorbreken naar de
// aanroeper — een falende logregel mag een therapeut nooit het bekijken van
// een sessie beletten. Zelfde try/catch-principe als
// notifyOwnerOfNewRegistration in auth.js.
//
// ctx.session bevat enkel token/userId/organizationId/role (zie buildContext
// in index.js) — geen naam. Eén extra opzoek op primaire sleutel per
// gelogde actie is de prijs voor een leesbare actor_label in het logboek
// (zie migrations/0005_audit_log.sql); dat weegt hier niet op tegen de kost
// van elke route ctx op voorhand te laten opblazen met een user-lookup die de
// meeste routes niet nodig hebben.
async function logSessionAudit(env, ctx, { action, targetId, detail }) {
  try {
    const actor = await getUserById(env.DB, ctx.session.userId);
    await recordAuditLogEntry(env.DB, {
      organizationId: ctx.session.organizationId,
      actorUserId: ctx.session.userId,
      actorLabel: actor ? actor.name : "onbekend",
      action,
      targetType: "patient_session",
      targetId,
      detail,
    });
  } catch (err) {
    console.error("Kon auditlog-regel niet wegschrijven (session):", err);
  }
}

// Bewust NIET gelogd in de auditlog: het opvragen van de LIJST (enkel
// niet-klinische metadata: id/label/rol/taal/datum, zie hieronder) gebeurt
// bij elke keer dat de Sessies-pagina in de app-shell geopend wordt — dat
// zou het logboek onbruikbaar veel laten aangroeien. Enkel het openen van
// één specifieke sessie (handleGetSessionDetail hieronder) wordt gelogd,
// want dát is het moment waarop de inhoud van een patiëntdossier écht wordt
// ingezien.
export async function handleListSessions(request, env, ctx) {
  // Altijd ctx.session.organizationId/userId — nooit iets uit de request —
  // zie de multi-tenancy-afspraak (taak #69). Dit is de enige plek waar deze
  // twee samen de WHERE-clausule vormen (zie db.js), dus er is geen manier
  // waarop deze route data van een andere praktijk of collega kan tonen.
  const rows = await listPatientSessions(
    env.DB,
    ctx.session.organizationId,
    ctx.session.userId
  );

  const sessions = rows.map((row) => ({
    id: row.id,
    patientLabel: row.patient_label,
    role: row.role,
    lang: row.lang,
    createdAt: row.created_at,
  }));

  return jsonResponse({ sessions });
}

// Sessiedetail (taak #129). getPatientSession(db.js) scoped enkel op
// organizationId, niet op therapistId — dat is bewust zo in db.js (die
// helper wordt ook door andere, bredere flows gebruikt). Hier, waar het wél
// om de "enkel je eigen sessies"-lijn gaat (dezelfde als handleListSessions
// hierboven), doen we die therapeut-check zelf: een sessie die wél in de
// juiste praktijk zit maar van een collega is, bestaat voor deze aanvrager
// niet — zelfde 404 als een sessie die helemaal niet bestaat, om nooit per
// ongeluk te bevestigen dat een bepaald ID wél ergens bestaat.
export async function handleGetSessionDetail(request, env, ctx, params) {
  const row = await getPatientSession(env.DB, ctx.session.organizationId, params.sessionId);
  if (!row || row.therapist_id !== ctx.session.userId) {
    return jsonResponse({ error: "Sessie niet gevonden." }, 404);
  }

  // Taak #133 — het compliance-masterdossier vereist dat het "vinden"/
  // bekijken van een patiëntsessie gelogd wordt. Bewust ENKEL het ID als
  // target, nooit patient_label of iets uit answers/result: dat zou net de
  // klinische inhoud zijn die de auditlog volgens datzelfde dossier niet mag
  // dupliceren.
  await logSessionAudit(env, ctx, {
    action: "session_bekeken",
    targetId: row.id,
  });

  // answers_json/clock_highlights_json/result_json zijn al bij het opslaan
  // (flow.js, handleGetResult) op de juiste rol-gebaseerde detailgraad
  // gebracht — bv. evidence/therapyPlan zaten er toen al niet in voor een
  // patiënt-zelfinvulsessie. Hier dus gewoon teruggeven wat is opgeslagen,
  // geen aparte filtering meer nodig.
  //
  // Taak #141b — feedback (indien ooit ingediend, zie
  // handleSubmitSessionFeedback hieronder) hoort bij de sessiedetail, niet
  // in een apart endpoint: dashboard.js toont het gewoon als extra veld op
  // dit scherm.
  const feedback = await getSessionFeedbackForSession(env.DB, row.id);

  return jsonResponse({
    session: {
      id: row.id,
      patientLabel: row.patient_label,
      role: row.role,
      lang: row.lang,
      createdAt: row.created_at,
      answers: JSON.parse(row.answers_json || "{}"),
      clockHighlights: JSON.parse(row.clock_highlights_json || "[]"),
      result: JSON.parse(row.result_json || "null"),
      feedback: feedback
        ? {
            rating: feedback.rating,
            wouldRecommend: feedback.would_recommend === null ? null : !!feedback.would_recommend,
            comment: feedback.comment,
            createdAt: feedback.created_at,
          }
        : null,
    },
  });
}

// Taak #141b — ingebouwde feedbackstap. "required" (niet "owner", zie
// index.js): elke therapeut mag feedback achterlaten op zijn EIGEN zonet
// afgeronde sessie, zelfde scope-afspraak als handleListSessions/
// handleGetSessionDetail hierboven — vandaar dezelfde eigenaarschapscheck
// (row.therapist_id === ctx.session.userId) vóór er iets weggeschreven
// wordt.
export async function handleSubmitSessionFeedback(request, env, ctx, params) {
  const row = await getPatientSession(env.DB, ctx.session.organizationId, params.sessionId);
  if (!row || row.therapist_id !== ctx.session.userId) {
    return jsonResponse({ error: "Sessie niet gevonden." }, 404);
  }

  const body = await readJsonBody(request);
  const rating = body && body.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonResponse({ error: "rating moet een geheel getal tussen 1 en 5 zijn." }, 400);
  }
  let wouldRecommend = null;
  if (body.wouldRecommend === true || body.wouldRecommend === false) {
    wouldRecommend = body.wouldRecommend;
  } else if (body.wouldRecommend !== undefined && body.wouldRecommend !== null) {
    return jsonResponse({ error: "wouldRecommend moet true, false, of leeg zijn." }, 400);
  }
  const comment =
    typeof body.comment === "string" && body.comment.trim().length > 0 ? body.comment.trim().slice(0, 2000) : null;

  await saveSessionFeedback(env.DB, {
    id: newId(),
    patientSessionId: row.id,
    organizationId: ctx.session.organizationId,
    rating,
    wouldRecommend,
    comment,
  });

  return jsonResponse({ ok: true });
}
