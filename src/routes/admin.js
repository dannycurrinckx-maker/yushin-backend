// Beheerroutes (per praktijk) — taak #73.
// Enkel toegankelijk voor role === "owner" binnen de eigen organisatie
// (afgedwongen in src/index.js via auth: "owner", vóór deze handlers
// draaien). Elke query/mutatie hieronder is scoped op
// ctx.session.organizationId — nooit op een ID uit de request body/query —
// zie de multi-tenancy-afspraak in het architectuurdocument en taak #69.

import { jsonResponse, readJsonBody } from "../lib/http.js";
import { hashPassword } from "../lib/auth.js";
import { isValidEmail, isValidPassword, isNonEmptyString } from "../lib/validation.js";
import { getPlan } from "../lib/plans.js";
import {
  newId,
  getUserByEmail,
  getUserById,
  getUserInOrganization,
  listUsersForOrganization,
  createUser,
  countActiveOwnersForOrganization,
  countActiveUsersForOrganization,
  getOrganizationById,
  setUserActiveStatus,
  deleteAllAuthSessionsForUser,
  recordAuditLogEntry,
} from "../lib/db.js";

const VALID_ROLES = ["owner", "therapist"];

// Auditlog-hulpfunctie (taak #133) — zelfde try/catch-principe als elders
// (nooit een falende logregel de eigenlijke beheersactie laten blokkeren).
// Zie sessions.js voor de toelichting waarom de actor hier apart wordt
// opgezocht (ctx.session bevat enkel het ID, geen naam).
async function logAdminAudit(env, ctx, { action, targetId, detail }) {
  try {
    const actor = await getUserById(env.DB, ctx.session.userId);
    await recordAuditLogEntry(env.DB, {
      organizationId: ctx.session.organizationId,
      actorUserId: ctx.session.userId,
      actorLabel: actor ? actor.name : "onbekend",
      action,
      targetType: "user",
      targetId,
      detail,
    });
  } catch (err) {
    console.error("Kon auditlog-regel niet wegschrijven (admin):", err);
  }
}

export async function handleListUsers(request, env, ctx) {
  const users = await listUsersForOrganization(env.DB, ctx.session.organizationId);
  // is_active komt uit SQLite als 0/1 — voor de client expliciet naar boolean.
  return jsonResponse({
    users: users.map((u) => ({ ...u, is_active: !!u.is_active })),
  });
}

export async function handleInviteUser(request, env, ctx) {
  const body = await readJsonBody(request);
  if (!body) return jsonResponse({ error: "Ongeldige aanvraag." }, 400);

  const { name, email, password } = body;
  const role = body.role || "therapist";

  if (!isNonEmptyString(name)) {
    return jsonResponse({ error: "Naam is verplicht." }, 400);
  }
  if (!isValidEmail(email)) {
    return jsonResponse({ error: "Ongeldig e-mailadres." }, 400);
  }
  if (!isValidPassword(password)) {
    return jsonResponse({ error: "Wachtwoord moet minstens 10 tekens lang zijn." }, 400);
  }
  if (!VALID_ROLES.includes(role)) {
    return jsonResponse({ error: `Rol moet één van de volgende zijn: ${VALID_ROLES.join(", ")}.` }, 400);
  }

  // Taak #115 (Practice seat-limiet) — vóór de e-mail-uniciteitscheck
  // hieronder, zodat iemand die de limiet al bereikt heeft niet eerst een
  // ander, verwarrend foutbericht over een dubbel e-mailadres krijgt.
  // `maxSeats` staat enkel op de Practice-plannen (zie src/lib/plans.js) —
  // Professional/"solo" heeft hier bewust geen limiet, dat bestaande gedrag
  // blijft ongewijzigd.
  const organization = await getOrganizationById(env.DB, ctx.session.organizationId);
  const planConfig = organization ? getPlan(organization.plan) : null;
  if (planConfig && planConfig.maxSeats) {
    const activeCount = await countActiveUsersForOrganization(env.DB, ctx.session.organizationId);
    if (activeCount >= planConfig.maxSeats) {
      return jsonResponse(
        {
          error: `Dit abonnement (${planConfig.label}) staat maximaal ${planConfig.maxSeats} actieve gebruikers toe. Verwijder eerst een teamlid, of upgrade je abonnement om meer plaatsen vrij te maken.`,
        },
        403
      );
    }
  }

  // E-mailadres is platform-breed uniek (zelfde regel als bij registratie,
  // src/routes/auth.js) — niet enkel binnen de eigen organisatie, want
  // inloggen gebeurt op e-mailadres zonder dat de organisatie al bekend is.
  const existing = await getUserByEmail(env.DB, email.trim().toLowerCase());
  if (existing) {
    return jsonResponse({ error: "Dit e-mailadres is al in gebruik." }, 409);
  }

  const userId = newId();
  const passwordHash = await hashPassword(password);

  await createUser(env.DB, {
    id: userId,
    // Bewust ctx.session.organizationId, nooit iets uit de request body —
    // anders zou een owner (met een aangepaste client) een gebruiker aan een
    // ANDERE organisatie kunnen koppelen. Zie taak #69.
    organizationId: ctx.session.organizationId,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role,
  });

  // Taak #133 — detail bevat bewust enkel de naam (geen wachtwoord/e-mail in
  // de logregel zelf hoeft niet strikt geheim te blijven zoals een
  // wachtwoord, maar meer dan nodig loggen is nooit het uitgangspunt).
  await logAdminAudit(env, ctx, {
    action: "gebruiker_uitgenodigd",
    targetId: userId,
    detail: `${name.trim()} (${role})`,
  });

  return jsonResponse(
    {
      user: { id: userId, name: name.trim(), email: email.trim().toLowerCase(), role, is_active: true },
    },
    201
  );
}

export async function handleRemoveUser(request, env, ctx) {
  // Bewust een query-parameter i.p.v. een DELETE-body: een Request-body kan
  // maar één keer gelezen worden (readJsonBody consumeert de stream), en
  // deze route heeft verder geen ander body-veld nodig — dat maakt een
  // query-param hier eenvoudiger en robuuster dan de aanpak in flow.js
  // (waar wél een body-parser nodig was, zie de bugfix bij taak #71).
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  if (!isNonEmptyString(userId, 100)) {
    return jsonResponse({ error: "userId (query-parameter) is verplicht." }, 400);
  }

  const target = await getUserInOrganization(env.DB, ctx.session.organizationId, userId);
  if (!target) {
    return jsonResponse({ error: "Gebruiker niet gevonden in deze praktijk." }, 404);
  }

  if (target.role === "owner" && target.is_active) {
    const activeOwners = await countActiveOwnersForOrganization(env.DB, ctx.session.organizationId);
    if (activeOwners <= 1) {
      return jsonResponse(
        { error: "Kan de laatste actieve praktijkbeheerder niet verwijderen — wijs eerst een andere eigenaar aan." },
        400
      );
    }
  }

  // "Verwijderen" = deactiveren (geen hard DELETE), zie de toelichting
  // bovenaan migrations/0003_user_deactivation.sql: een therapeut-account
  // hard verwijderen zou via ON DELETE CASCADE stilzwijgend ook al hun
  // historische patiëntsessies wissen.
  await setUserActiveStatus(env.DB, ctx.session.organizationId, userId, false);
  // Eventuele nog geldige sessietokens van dit account meteen intrekken —
  // zelfde principe als bij een wachtwoord-reset (auth.js).
  await deleteAllAuthSessionsForUser(env.DB, userId);

  // Taak #133 — target.name/target.email komen uit de rij die we hierboven al
  // ophaalden (getUserInOrganization), geen extra query nodig.
  await logAdminAudit(env, ctx, {
    action: "gebruiker_gedeactiveerd",
    targetId: userId,
    detail: `${target.name} (${target.email})`,
  });

  return jsonResponse({ ok: true });
}
