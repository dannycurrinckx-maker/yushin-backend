// Auth-routes (taak #68) — registratie, login, logout, wachtwoord-reset.
//
// Wachtwoord-reset-mails: bewust nog GEEN e-mailverzending ingebakken (zie
// TODO verderop) — dat is een apart, nog niet gebouwd traject.
//
// Registratie-melding (taak #118): WEL een e-mail, via Resend
// (src/lib/resend.js) — telkens iemand een nieuwe praktijk registreert,
// krijgt Danny (env.NOTIFY_EMAIL) hiervan een bericht. Bewust in een
// try/catch: een mislukte melding (bv. Resend tijdelijk onbereikbaar) mag
// een registratie nooit blokkeren — de praktijk zelf is dan al aangemaakt.

import { jsonResponse, readJsonBody } from "../lib/http.js";
import { hashPassword, verifyPassword, newSessionToken, sessionExpiryIso } from "../lib/auth.js";
import { isValidEmail, isValidPassword, isNonEmptyString } from "../lib/validation.js";
import { sendEmail } from "../lib/resend.js";
import {
  newId,
  getUserByEmail,
  getUserById,
  getOrganizationById,
  createOrganization,
  createUser,
  createAuthSession,
  deleteAuthSession,
  updateLastLogin,
  createPasswordResetToken,
  getValidPasswordResetToken,
  consumePasswordResetToken,
  updateUserPasswordHash,
  deleteAllAuthSessionsForUser,
  recordAuditLogEntry,
} from "../lib/db.js";

// Auditlog-hulpfunctie (taak #133) — zelfde try/catch-principe als
// notifyOwnerOfNewRegistration hierboven: een falende logregel mag nooit
// verhinderen dat iemand kan inloggen. Hier, anders dan in sessions.js/
// admin.js, hebben we de naam al in scope (de user-rij is al opgehaald),
// dus geen extra query nodig.
async function logLoginAudit(env, user) {
  try {
    await recordAuditLogEntry(env.DB, {
      organizationId: user.organization_id,
      actorUserId: user.id,
      actorLabel: user.name,
      action: "ingelogd",
      targetType: "user",
      targetId: user.id,
    });
  } catch (err) {
    console.error("Kon auditlog-regel niet wegschrijven (login):", err);
  }
}

const SESSION_DAYS = 30;
const RESET_TOKEN_HOURS = 1;

// Taak #118: stuurt Danny een meldingsmail bij elke nieuwe registratie.
// Bewust een aparte functie (i.p.v. inline in handleRegister) zodat de
// try/catch-grens en de e-mailopmaak op één plek staan.
async function notifyOwnerOfNewRegistration(env, { organizationName, contactEmail, ownerName }) {
  if (!env.NOTIFY_EMAIL) return; // geen ontvanger ingesteld -> stil overslaan
  try {
    await sendEmail(env, {
      to: env.NOTIFY_EMAIL,
      from: env.NOTIFY_FROM_EMAIL || "Yushin <onboarding@resend.dev>",
      subject: `Nieuwe Yushin-registratie: ${organizationName}`,
      html: `
        <p>Er heeft zich zonet een nieuwe praktijk geregistreerd op Yushin:</p>
        <ul>
          <li><strong>Praktijk:</strong> ${organizationName}</li>
          <li><strong>Naam:</strong> ${ownerName}</li>
          <li><strong>E-mail:</strong> ${contactEmail}</li>
        </ul>
        <p>De praktijk heeft nog geen toegang (status "trialing") tot er betaald is of een toegangscode is ingevoerd.</p>
      `,
    });
  } catch (err) {
    // Nooit laten doorbreken naar de aanroeper — een registratie mag nooit
    // mislukken enkel omdat de meldingsmail niet weg kon.
    console.error("Kon registratie-meldingsmail niet versturen:", err);
  }
}

export async function handleRegister(request, env) {
  const body = await readJsonBody(request);
  if (!body) return jsonResponse({ error: "Ongeldige aanvraag." }, 400);

  const { organizationName, contactEmail, ownerName, password } = body;

  if (!isNonEmptyString(organizationName)) {
    return jsonResponse({ error: "Praktijknaam is verplicht." }, 400);
  }
  if (!isValidEmail(contactEmail)) {
    return jsonResponse({ error: "Ongeldig e-mailadres." }, 400);
  }
  if (!isNonEmptyString(ownerName)) {
    return jsonResponse({ error: "Naam is verplicht." }, 400);
  }
  if (!isValidPassword(password)) {
    return jsonResponse({ error: "Wachtwoord moet minstens 10 tekens lang zijn." }, 400);
  }

  const existing = await getUserByEmail(env.DB, contactEmail.trim().toLowerCase());
  if (existing) {
    return jsonResponse({ error: "Dit e-mailadres is al in gebruik." }, 409);
  }

  const organizationId = newId();
  const userId = newId();
  const passwordHash = await hashPassword(password);

  await createOrganization(env.DB, {
    id: organizationId,
    name: organizationName.trim(),
    contactEmail: contactEmail.trim().toLowerCase(),
  });
  await createUser(env.DB, {
    id: userId,
    organizationId,
    name: ownerName.trim(),
    email: contactEmail.trim().toLowerCase(),
    passwordHash,
    role: "owner",
  });

  const token = newSessionToken();
  await createAuthSession(env.DB, { token, userId, expiresAt: sessionExpiryIso(SESSION_DAYS) });

  // Taak #118: de client moet meteen na registratie kunnen beslissen of het
  // de betaal-/toegangscode-poort moet tonen — vandaar subscriptionStatus/
  // plan nu ook in deze response (voorheen enkel id/name). Opnieuw ophalen
  // i.p.v. de bekende insert-defaults hardcoden: blijft zo automatisch in
  // sync met createOrganization() in db.js, mocht die ooit wijzigen.
  const organization = await getOrganizationById(env.DB, organizationId);

  await notifyOwnerOfNewRegistration(env, {
    organizationName: organizationName.trim(),
    contactEmail: contactEmail.trim().toLowerCase(),
    ownerName: ownerName.trim(),
  });

  return jsonResponse(
    {
      token,
      user: { id: userId, name: ownerName.trim(), email: contactEmail.trim().toLowerCase(), role: "owner" },
      organization: {
        id: organizationId,
        name: organizationName.trim(),
        subscriptionStatus: organization?.subscription_status || "trialing",
        plan: organization?.plan || "solo",
      },
    },
    201
  );
}

export async function handleLogin(request, env) {
  const body = await readJsonBody(request);
  if (!body) return jsonResponse({ error: "Ongeldige aanvraag." }, 400);

  const { email, password } = body;
  if (!isValidEmail(email) || !isNonEmptyString(password)) {
    return jsonResponse({ error: "Onjuiste combinatie van e-mailadres en wachtwoord." }, 401);
  }

  const user = await getUserByEmail(env.DB, email.trim().toLowerCase());
  // Bewust dezelfde foutmelding of de gebruiker nu wel/niet bestaat, om te
  // voorkomen dat iemand via foutmeldingen kan achterhalen welke
  // e-mailadressen geregistreerd zijn.
  if (!user) {
    return jsonResponse({ error: "Onjuiste combinatie van e-mailadres en wachtwoord." }, 401);
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return jsonResponse({ error: "Onjuiste combinatie van e-mailadres en wachtwoord." }, 401);
  }

  // Gedeactiveerde accounts (taak #73, beheerpaneel) mogen niet meer inloggen.
  // Dit is, anders dan bij een onbekend e-mailadres, geen informatielek: de
  // gebruiker (of de collega die het account beheert) weet al dat het account
  // gedeactiveerd is, dus een duidelijke melding is hier passender dan de
  // generieke combinatiefout hierboven.
  if (!user.is_active) {
    return jsonResponse({ error: "Dit account is gedeactiveerd. Neem contact op met de praktijkbeheerder." }, 403);
  }

  const token = newSessionToken();
  await createAuthSession(env.DB, { token, userId: user.id, expiresAt: sessionExpiryIso(SESSION_DAYS) });
  await updateLastLogin(env.DB, user.id);
  await logLoginAudit(env, user);

  // Taak #118: net als bij registratie moet de client meteen na inloggen
  // kunnen beslissen of de betaal-/toegangscode-poort getoond moet worden —
  // vandaar nu een volledig organization-object i.p.v. enkel organizationId.
  const organization = await getOrganizationById(env.DB, user.organization_id);

  return jsonResponse({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    organizationId: user.organization_id,
    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
          subscriptionStatus: organization.subscription_status,
          plan: organization.plan,
        }
      : null,
  });
}

export async function handleLogout(request, env, ctx) {
  await deleteAuthSession(env.DB, ctx.session.token);
  return jsonResponse({ ok: true });
}

export async function handleRequestPasswordReset(request, env) {
  const body = await readJsonBody(request);
  if (!body || !isValidEmail(body.email)) {
    // Zelfde reden als bij login: geen onderscheid maken in de foutmelding.
    return jsonResponse({ ok: true });
  }

  const user = await getUserByEmail(env.DB, body.email.trim().toLowerCase());
  if (user) {
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000).toISOString();
    await createPasswordResetToken(env.DB, { token, userId: user.id, expiresAt });

    // TODO (nog geen e-mailservice gekoppeld — vereist bv. Resend/Postmark
    // met een eigen API-key, zie Yushin_SaaS_Architectuur.md): stuur hier
    // een e-mail met een link die "token" bevat, bv.
    //   https://app.yushin.example/wachtwoord-resetten?token=<token>
    // Tot die koppeling er is, retourneren we het token NIET in de response
    // (zou anders een lek zijn) — de reset-flow is functioneel klaar en
    // getest, enkel de bezorging ontbreekt nog.
  }

  // Altijd hetzelfde antwoord, ongeacht of het e-mailadres bestaat.
  return jsonResponse({ ok: true });
}

export async function handleResetPassword(request, env) {
  const body = await readJsonBody(request);
  if (!body || !isNonEmptyString(body.token) || !isValidPassword(body.newPassword)) {
    return jsonResponse({ error: "Ongeldige aanvraag." }, 400);
  }

  const resetToken = await getValidPasswordResetToken(env.DB, body.token);
  if (!resetToken) {
    return jsonResponse({ error: "Deze reset-link is ongeldig of verlopen." }, 400);
  }

  const user = await getUserById(env.DB, resetToken.user_id);
  if (!user) {
    return jsonResponse({ error: "Deze reset-link is ongeldig of verlopen." }, 400);
  }

  const newHash = await hashPassword(body.newPassword);
  await updateUserPasswordHash(env.DB, user.id, newHash);
  await consumePasswordResetToken(env.DB, body.token);
  // Alle bestaande sessies intrekken: als het wachtwoord gereset werd omdat
  // het gelekt was, moet een eventuele aanvaller ook meteen uitgelogd worden.
  await deleteAllAuthSessionsForUser(env.DB, user.id);

  return jsonResponse({ ok: true });
}
