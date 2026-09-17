// Platform-beheer — toegangscodes aanmaken/overzien (taak #141b).
//
// Bewust een APART soort beveiliging dan de rest van dit bestandje-per-route-
// patroon: de andere "beheer"-routes (admin.js, hierboven) checken enkel of
// iemand `role === 'owner'` is BINNEN zijn eigen organisatie — dat is
// correct voor "beheer je eigen praktijk", maar totaal onvoldoende hier. Het
// aanmaken van een gratis-toegangscode is een platform-brede bevoegdheid: als
// dit enkel "auth: owner" zou zijn, zou elke betalende klant zichzelf (of
// iedereen die hun link kent) een gratis-code kunnen laten aanmaken. Vandaar
// "auth: platformAdmin" in index.js (requirePlatformAdmin), die het
// e-mailadres van de ingelogde gebruiker vergelijkt met de vaste lijst in
// env.PLATFORM_ADMIN_EMAILS (wrangler.toml) — volledig los van elke
// organisatierol.

import { jsonResponse, readJsonBody } from "../lib/http.js";
import { isNonEmptyString } from "../lib/validation.js";
import {
  newId,
  createAccessCode,
  listAccessCodes,
  accessCodeExists,
  getAccessCodeById,
  deactivateAccessCode,
} from "../lib/db.js";

const VALID_KINDS = ["free", "discount"];

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export async function handleCreateAccessCode(request, env, ctx) {
  const body = await readJsonBody(request);
  if (!body || !isNonEmptyString(body.code, 100)) {
    return jsonResponse({ error: "Code is verplicht." }, 400);
  }
  const kind = body.kind;
  if (!VALID_KINDS.includes(kind)) {
    return jsonResponse({ error: `kind moet één van de volgende zijn: ${VALID_KINDS.join(", ")}.` }, 400);
  }

  let discountPercent = null;
  if (kind === "discount") {
    if (!isPositiveInteger(body.discountPercent) || body.discountPercent > 99) {
      return jsonResponse({ error: "discountPercent moet een geheel getal tussen 1 en 99 zijn." }, 400);
    }
    discountPercent = body.discountPercent;
  }

  let maxUses = null;
  if (body.maxUses !== undefined && body.maxUses !== null && body.maxUses !== "") {
    if (!isPositiveInteger(body.maxUses)) {
      return jsonResponse({ error: "maxUses moet een positief geheel getal zijn, of leeg voor onbeperkt." }, 400);
    }
    maxUses = body.maxUses;
  }

  // sessionLimit (taak #141b, migratie 0007) — enkel geldig bij 'free': een
  // kortingscode ontgrendelt sowieso niets rechtstreeks (zie accessCodes.js),
  // een sessielimiet zou daar dus geen enkele betekenis hebben.
  let sessionLimit = null;
  if (body.sessionLimit !== undefined && body.sessionLimit !== null && body.sessionLimit !== "") {
    if (kind !== "free") {
      return jsonResponse({ error: "sessionLimit is enkel geldig bij kind 'free'." }, 400);
    }
    if (!isPositiveInteger(body.sessionLimit)) {
      return jsonResponse(
        { error: "sessionLimit moet een positief geheel getal zijn, of leeg voor onbeperkte toegang." },
        400
      );
    }
    sessionLimit = body.sessionLimit;
  }

  const code = body.code.trim();
  if (await accessCodeExists(env.DB, code)) {
    return jsonResponse({ error: "Deze code bestaat al (hoofdletterongevoelig)." }, 409);
  }

  const id = newId();
  await createAccessCode(env.DB, {
    id,
    code,
    kind,
    discountPercent,
    maxUses,
    sessionLimit,
    note: isNonEmptyString(body.note, 500) ? body.note.trim() : null,
  });

  return jsonResponse({ ok: true, id, code, kind, discountPercent, maxUses, sessionLimit }, 201);
}

export async function handleListAccessCodes(request, env, ctx) {
  const rows = await listAccessCodes(env.DB);
  return jsonResponse({
    codes: rows.map((r) => ({
      id: r.id,
      code: r.code,
      kind: r.kind,
      discountPercent: r.discount_percent,
      maxUses: r.max_uses,
      sessionLimit: r.session_limit,
      useCount: r.use_count,
      active: !!r.active,
      note: r.note,
      createdAt: r.created_at,
    })),
  });
}

// Taak #142 — code intrekken (active=0), NIET hard verwijderen: de rij blijft
// bestaan zodat use_count/note/wanneer-aangemaakt zichtbaar blijft in de
// lijst (audit trail), maar getAccessCodeByCode (accessCodes.js) filtert al
// op active=1 dus de code werkt vanaf nu nergens meer bij het redeemen.
// Idempotent: nogmaals intrekken van een al-inactieve code is geen fout.
export async function handleDeactivateAccessCode(request, env, ctx, params) {
  const existing = await getAccessCodeById(env.DB, params.id);
  if (!existing) {
    return jsonResponse({ error: "Toegangscode niet gevonden." }, 404);
  }
  await deactivateAccessCode(env.DB, params.id);
  return jsonResponse({ ok: true, id: params.id });
}
