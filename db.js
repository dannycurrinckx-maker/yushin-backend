// Kleine helpers rond de D1-binding, met multi-tenancy als uitgangspunt:
// elke functie die patiëntdata of accounts opvraagt vereist een organizationId
// en filtert daar altijd op — nooit enkel op een client-aangeleverd ID.

export function newId() {
  // Werkt in de Workers-runtime (Web Crypto API is beschikbaar).
  return crypto.randomUUID();
}

export async function getOrganizationById(db, organizationId) {
  return db
    .prepare("SELECT * FROM organizations WHERE id = ?")
    .bind(organizationId)
    .first();
}

export async function getUserByEmail(db, email) {
  return db
    .prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first();
}

export async function getUserById(db, userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
}

export async function listUsersForOrganization(db, organizationId) {
  const { results } = await db
    .prepare("SELECT id, name, email, role, is_active, created_at, last_login_at FROM users WHERE organization_id = ? ORDER BY created_at ASC")
    .bind(organizationId)
    .all();
  return results;
}

// Scoped op organizationId, net als getPatientSession — een owner mag enkel
// leden van de eigen praktijk opvragen/wijzigen (taak #73, beheerpaneel).
export async function getUserInOrganization(db, organizationId, userId) {
  return db
    .prepare("SELECT * FROM users WHERE id = ? AND organization_id = ?")
    .bind(userId, organizationId)
    .first();
}

export async function countActiveOwnersForOrganization(db, organizationId) {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n FROM users WHERE organization_id = ? AND role = 'owner' AND is_active = 1"
    )
    .bind(organizationId)
    .first();
  return row ? row.n : 0;
}

// Taak #115 (Practice seat-limiet) — telt ALLE actieve gebruikers (owner +
// therapeuten samen), niet enkel owners zoals countActiveOwnersForOrganization
// hierboven (die dient een ander doel: bewaken dat de laatste owner niet
// verwijderd wordt). Gebruikt in admin.js om een uitnodiging te weigeren
// zodra een Practice-organisatie haar planlimiet (zie src/lib/plans.js,
// `maxSeats`) al bereikt heeft.
export async function countActiveUsersForOrganization(db, organizationId) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE organization_id = ? AND is_active = 1")
    .bind(organizationId)
    .first();
  return row ? row.n : 0;
}

// "Verwijderen" = deactiveren, nooit een hard DELETE — zie de toelichting
// bovenaan migrations/0003_user_deactivation.sql (patient_sessions.therapist_id
// heeft ON DELETE CASCADE, dus een hard DELETE zou historische patiëntdata
// stilzwijgend meeslepen).
export async function setUserActiveStatus(db, organizationId, userId, isActive) {
  await db
    .prepare("UPDATE users SET is_active = ? WHERE id = ? AND organization_id = ?")
    .bind(isActive ? 1 : 0, userId, organizationId)
    .run();
}

export async function createOrganization(db, { id, name, contactEmail }) {
  await db
    .prepare(
      "INSERT INTO organizations (id, name, contact_email, subscription_status, plan) VALUES (?, ?, ?, 'trialing', 'solo')"
    )
    .bind(id, name, contactEmail)
    .run();
}

export async function createUser(db, { id, organizationId, name, email, passwordHash, role }) {
  await db
    .prepare(
      "INSERT INTO users (id, organization_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, organizationId, name, email, passwordHash, role)
    .run();
}

export async function createAuthSession(db, { token, userId, expiresAt }) {
  await db
    .prepare("INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expiresAt)
    .run();
}

export async function getAuthSession(db, token) {
  // "AND users.is_active = 1" is defensie-in-diepte (taak #73): het
  // deactiveren van een account trekt elders (handleRemoveUser) ook meteen
  // al zijn actieve sessies in, maar deze check zorgt dat een sessietoken
  // van een gedeactiveerd account hoe dan ook nooit geldig is, ongeacht of
  // die intrekking ooit gefaald of iets gemist zou hebben.
  // "users.email AS user_email" (taak #141b) — nodig voor de
  // platform-admin-gate in index.js (requirePlatformAdmin), die het
  // e-mailadres van de ingelogde gebruiker vergelijkt met
  // env.PLATFORM_ADMIN_EMAILS. Loutere toevoeging aan een bestaande SELECT
  // *, geen ander gedrag hier gewijzigd.
  return db
    .prepare(
      "SELECT auth_sessions.*, users.organization_id AS user_organization_id, users.role AS user_role, users.email AS user_email FROM auth_sessions JOIN users ON users.id = auth_sessions.user_id WHERE token = ? AND expires_at > datetime('now') AND users.is_active = 1"
    )
    .bind(token)
    .first();
}

export async function deleteAuthSession(db, token) {
  await db.prepare("DELETE FROM auth_sessions WHERE token = ?").bind(token).run();
}

// Multi-tenancy-waarborg (taak #69): controleert dat een user écht bij de
// opgegeven organisatie hoort, VOOR er iets met die combinatie gebeurt.
// Elke route die later (taken #71-73) data schrijft/leest gekoppeld aan een
// therapistId + organizationId, moet dit gebruiken — zo hangt de isolatie
// tussen praktijken niet enkel af van "de aanroepende code deed het correct",
// maar wordt ze hier op één centrale plek afgedwongen.
export async function assertUserBelongsToOrganization(db, userId, organizationId) {
  const row = await db
    .prepare("SELECT id FROM users WHERE id = ? AND organization_id = ?")
    .bind(userId, organizationId)
    .first();
  if (!row) {
    throw new Error(
      `Multi-tenancy-schending geweigerd: user ${userId} hoort niet bij organisatie ${organizationId}.`
    );
  }
}

// Patiëntsessies — altijd gescoped op organizationId, zoals afgesproken in
// het architectuurdocument (multi-tenancy).
export async function savePatientSession(db, session) {
  // Verifieer eerst de organisatie-therapeut-combinatie, zodat een bug
  // ergens hogerop (verkeerd organizationId/therapistId doorgegeven) nooit
  // stil een sessie aan de verkeerde praktijk kan koppelen.
  await assertUserBelongsToOrganization(db, session.therapistId, session.organizationId);

  await db
    .prepare(
      `INSERT INTO patient_sessions
        (id, organization_id, therapist_id, patient_label, role, lang, answers_json, clock_highlights_json, result_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      session.id,
      session.organizationId,
      session.therapistId,
      session.patientLabel || null,
      session.role,
      session.lang,
      JSON.stringify(session.answers || {}),
      JSON.stringify(session.clockHighlights || []),
      JSON.stringify(session.result || {})
    )
    .run();
}

export async function listPatientSessions(db, organizationId, therapistId) {
  const { results } = await db
    .prepare(
      "SELECT id, patient_label, role, lang, created_at FROM patient_sessions WHERE organization_id = ? AND therapist_id = ? ORDER BY created_at DESC"
    )
    .bind(organizationId, therapistId)
    .all();
  return results;
}

// Taak #114 (proefperiode-afdwinging) — telt hoeveel patroonverkenningen
// (= afgeronde patient_sessions-rijen) deze organisatie ooit heeft
// afgerond. Bewust GEEN datumfilter hier: zolang subscription_status
// 'trialing' blijft, is elke bestaande sessie er één die tijdens de proef is
// gemaakt (er is nog geen upgrade/downgrade-scenario waarbij een organisatie
// terug naar 'trialing' zou kunnen gaan na ooit betaald te hebben). Zie
// src/lib/trial.js voor de eigenlijke limietlogica.
export async function countPatientSessionsForOrganization(db, organizationId) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM patient_sessions WHERE organization_id = ?")
    .bind(organizationId)
    .first();
  return row ? row.n : 0;
}

export async function getPatientSession(db, organizationId, sessionId) {
  // organizationId zit altijd in de WHERE-clausule: dit is de kern van de
  // multi-tenancy-bescherming voor deze tabel.
  return db
    .prepare("SELECT * FROM patient_sessions WHERE id = ? AND organization_id = ?")
    .bind(sessionId, organizationId)
    .first();
}

// Taak #141b — ingebouwde feedbackstap (migratie 0008). ON CONFLICT DO UPDATE
// i.p.v. gewoon INSERT: patient_session_id is UNIQUE, dus opnieuw indienen
// (bv. de therapeut past de score nog aan) overschrijft de vorige poging
// i.p.v. een tweede rij aan te maken — er is maar één "de" feedback per
// sessie relevant voor Danny.
export async function saveSessionFeedback(db, { id, patientSessionId, organizationId, rating, wouldRecommend, comment }) {
  const wouldRecommendValue =
    wouldRecommend === null || wouldRecommend === undefined ? null : wouldRecommend ? 1 : 0;
  await db
    .prepare(
      `INSERT INTO session_feedback (id, patient_session_id, organization_id, rating, would_recommend, comment)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(patient_session_id) DO UPDATE SET
         rating = excluded.rating,
         would_recommend = excluded.would_recommend,
         comment = excluded.comment,
         created_at = datetime('now')`
    )
    .bind(id, patientSessionId, organizationId, rating, wouldRecommendValue, comment ?? null)
    .run();
}

export async function getSessionFeedbackForSession(db, patientSessionId) {
  return db.prepare("SELECT * FROM session_feedback WHERE patient_session_id = ?").bind(patientSessionId).first();
}

export async function updateLastLogin(db, userId) {
  await db
    .prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?")
    .bind(userId)
    .run();
}

export async function updateUserPasswordHash(db, userId, passwordHash) {
  await db
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(passwordHash, userId)
    .run();
}

export async function createPasswordResetToken(db, { token, userId, expiresAt }) {
  await db
    .prepare(
      "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)"
    )
    .bind(token, userId, expiresAt)
    .run();
}

export async function getValidPasswordResetToken(db, token) {
  return db
    .prepare(
      "SELECT * FROM password_reset_tokens WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')"
    )
    .bind(token)
    .first();
}

export async function consumePasswordResetToken(db, token) {
  await db
    .prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE token = ?")
    .bind(token)
    .run();
}

// Verwijdert ALLE actieve login-sessies van een gebruiker — gebruikt na een
// wachtwoordwijziging/reset, zodat een eventueel gestolen sessietoken meteen
// ongeldig wordt.
export async function deleteAllAuthSessionsForUser(db, userId) {
  await db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(userId).run();
}

// --- Billing / Mollie (taak #70) ---
// Ook hier: alles gescoped op organizationId, en het bedrag komt NOOIT uit
// deze laag van de client — dat wordt afgedwongen in de route (billing.js)
// via src/lib/plans.js.

export async function setOrganizationMollieCustomerId(db, organizationId, mollieCustomerId) {
  await db
    .prepare("UPDATE organizations SET mollie_customer_id = ? WHERE id = ?")
    .bind(mollieCustomerId, organizationId)
    .run();
}

export async function getOrganizationByMollieCustomerId(db, mollieCustomerId) {
  return db
    .prepare("SELECT * FROM organizations WHERE mollie_customer_id = ?")
    .bind(mollieCustomerId)
    .first();
}

export async function updateOrganizationSubscriptionStatus(db, organizationId, status, plan) {
  await db
    .prepare("UPDATE organizations SET subscription_status = ?, plan = ? WHERE id = ?")
    .bind(status, plan, organizationId)
    .run();
}

export async function createSubscriptionRecord(db, { id, organizationId, mollieSubscriptionId, status, plan, currentPeriodEnd }) {
  await db
    .prepare(
      `INSERT INTO subscriptions (id, organization_id, mollie_subscription_id, status, plan, current_period_end)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, organizationId, mollieSubscriptionId, status, plan, currentPeriodEnd || null)
    .run();
}

export async function getSubscriptionByMollieId(db, mollieSubscriptionId) {
  return db
    .prepare("SELECT * FROM subscriptions WHERE mollie_subscription_id = ?")
    .bind(mollieSubscriptionId)
    .first();
}

export async function getActiveSubscriptionForOrganization(db, organizationId) {
  return db
    .prepare(
      "SELECT * FROM subscriptions WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(organizationId)
    .first();
}

export async function updateSubscriptionStatus(db, mollieSubscriptionId, status, currentPeriodEnd) {
  await db
    .prepare("UPDATE subscriptions SET status = ?, current_period_end = ? WHERE mollie_subscription_id = ?")
    .bind(status, currentPeriodEnd || null, mollieSubscriptionId)
    .run();
}

// --- Toegangscodes (taak #118) ---
// Vervangt de automatische proefperiode: een organisatie wordt pas 'active'
// (of krijgt korting) via een geldige code hier, of via een echte betaling
// (functies hierboven). Zie src/routes/accessCodes.js voor de route-logica
// en migrations/0004_access_codes.sql voor het schema.

// Enkel voor tests/eventueel toekomstig zelfbedieningsscherm — Danny maakt
// codes in de praktijk manueel aan via een SQL-commando in het
// Cloudflare-dashboard (zie het runbook dat bij deze taak geleverd is).
export async function createAccessCode(db, { id, code, kind, discountPercent, maxUses, note, sessionLimit }) {
  // sessionLimit (taak #141b, migratie 0007) — enkel zinvol bij kind='free';
  // handleCreateAccessCode (platformAdmin.js) forceert dit al naar null bij
  // 'discount', dit hier is enkel de opslag.
  await db
    .prepare(
      `INSERT INTO access_codes (id, code, kind, discount_percent, max_uses, note, session_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, code, kind, discountPercent ?? null, maxUses ?? null, note ?? null, sessionLimit ?? null)
    .run();
}

// Taak #141b — vóór het aanmaken van een nieuwe code gebruikt (case-
// insensitief, net als getAccessCodeByCode), zodat een dubbele code een
// nette 409 oplevert i.p.v. tegen de UNIQUE-index aan te knallen.
export async function accessCodeExists(db, code) {
  const row = await db
    .prepare("SELECT id FROM access_codes WHERE LOWER(code) = LOWER(?)")
    .bind(code)
    .first();
  return !!row;
}

// Taak #141b — overzicht voor de platform-adminpagina (alle codes, actief en
// ingetrokken, meest recente eerst).
export async function listAccessCodes(db) {
  const { results } = await db.prepare("SELECT * FROM access_codes ORDER BY created_at DESC").all();
  return results;
}

// "LOWER(code) = LOWER(?)" i.p.v. code genormaliseerd opslaan: zo maakt het
// niet uit met welke hoofdlettering Danny de code in de database aanmaakt of
// een klant hem intikt.
export async function getAccessCodeByCode(db, code) {
  return db
    .prepare("SELECT * FROM access_codes WHERE LOWER(code) = LOWER(?) AND active = 1")
    .bind(code)
    .first();
}

export async function incrementAccessCodeUseCount(db, accessCodeId) {
  await db
    .prepare("UPDATE access_codes SET use_count = use_count + 1 WHERE id = ?")
    .bind(accessCodeId)
    .run();
}

// Taak #142 — code intrekken zonder de rij te verwijderen (audit trail met
// use_count/note blijft bewaard). Zet enkel active=0: getAccessCodeByCode
// filtert al op "active = 1", dus een ingetrokken code werkt vanaf nu nergens
// meer bij /api/access-code/redeem, ook al staat hij nog in de lijst.
export async function getAccessCodeById(db, accessCodeId) {
  return db.prepare("SELECT * FROM access_codes WHERE id = ?").bind(accessCodeId).first();
}

export async function deactivateAccessCode(db, accessCodeId) {
  await db.prepare("UPDATE access_codes SET active = 0 WHERE id = ?").bind(accessCodeId).run();
}

// Een 'free'-code ontgrendelt de organisatie DIRECT (subscription_status ->
// 'active'), zonder dat er ooit via Mollie betaald wordt — vandaar het aparte
// "free"-plan in plans.js (manualOnly, €0) als label.
// sessionLimit (taak #141b, migratie 0007) — optioneel vijfde argument,
// bewust met default null: elke bestaande aanroep die dit niet meegeeft
// (er was er vóór deze taak maar één, in accessCodes.js) blijft exact het
// oude, onbeperkte gedrag geven.
export async function activateOrganizationWithFreeCode(db, organizationId, plan, code, sessionLimit = null) {
  await db
    .prepare(
      "UPDATE organizations SET subscription_status = 'active', plan = ?, redeemed_code = ?, trial_session_limit = ? WHERE id = ?"
    )
    .bind(plan, code, sessionLimit, organizationId)
    .run();
}

// Een 'discount'-code ontgrendelt NIETS op zichzelf — de organisatie blijft
// 'trialing' (dus geblokkeerd) tot er alsnog via /api/billing/checkout
// afgerekend wordt; dan past billing.js (applyDiscount uit plans.js) dit
// percentage automatisch toe op zowel de eerste betaling als het
// terugkerende abonnementsbedrag.
export async function applyOrganizationDiscount(db, organizationId, discountPercent, code) {
  await db
    .prepare("UPDATE organizations SET discount_percent = ?, redeemed_code = ? WHERE id = ?")
    .bind(discountPercent, code, organizationId)
    .run();
}

// --- Wachtkamer-QR-intake (taak #134) ---
// Zie migrations/0006_patient_intake_tokens.sql en src/routes/patientIntake.js
// voor de volledige toelichting. Kort samengevat: één deelbare token per
// therapeut-account, die een ongeauthenticeerde patiënt-client (via QR/link)
// omzet naar de juiste organizationId/therapistId — nooit andersom.

export async function setUserPatientIntakeToken(db, organizationId, userId, token) {
  await db
    .prepare("UPDATE users SET patient_intake_token = ? WHERE id = ? AND organization_id = ?")
    .bind(token, userId, organizationId)
    .run();
}

export async function clearUserPatientIntakeToken(db, organizationId, userId) {
  await db
    .prepare("UPDATE users SET patient_intake_token = NULL WHERE id = ? AND organization_id = ?")
    .bind(userId, organizationId)
    .run();
}

// GEEN organizationId-parameter (in tegenstelling tot vrijwel alle andere
// functies in dit bestand): dit IS net de opzoekstap die bepaalt tot welke
// organisatie/therapeut een binnenkomend, ongeauthenticeerd
// wachtkamer-verzoek behoort — er is op dit punt nog geen organizationId
// bekend om op te filteren. "is_active = 1": een gedeactiveerd account mag
// nooit nog nieuwe patiëntsessies via een oude, vergeten QR-code ontvangen.
export async function getUserByPatientIntakeToken(db, token) {
  return db
    .prepare("SELECT * FROM users WHERE patient_intake_token = ? AND is_active = 1")
    .bind(token)
    .first();
}

// Auditlog (taak #133). Bewust een "fire and forget vanuit het perspectief
// van de aanroepende route"-helper: schrijft altijd, maar de aanroeper (zie
// de hooks in sessions.js/admin.js/auth.js) vangt fouten op zodat een falende
// logregel NOOIT de eigenlijke actie (inloggen, een sessie bekijken, een
// teamlid uitnodigen) mag blokkeren — net zoals notifyOwnerOfNewRegistration
// in auth.js dat al deed voor de registratiemail.
//
// actorLabel wordt bewust apart van actorUserId meegegeven i.p.v. steeds
// opnieuw opgezocht: blijft zo leesbaar ("Jan Peeters") ook nadat een account
// ooit gedeactiveerd/verwijderd is (zie ON DELETE SET NULL in de migratie).
export async function recordAuditLogEntry(db, { organizationId, actorUserId, actorLabel, action, targetType, targetId, detail }) {
  await db
    .prepare(
      `INSERT INTO audit_log (id, organization_id, actor_user_id, actor_label, action, target_type, target_id, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newId(),
      organizationId,
      actorUserId || null,
      actorLabel || "onbekend",
      action,
      targetType || null,
      targetId || null,
      detail || null
    )
    .run();
}

// Meest recente eerst — dit is een logboek, niet een werklijst; de laatste
// gebeurtenis is vrijwel altijd waar de praktijkbeheerder als eerste naar
// kijkt. LIMIT hier hardcoded op 200: dit is een leesscherm in de app-shell,
// geen export-functionaliteit (die is bewust nog niet gebouwd, zie de
// toelichting in migrations/0005_audit_log.sql).
export async function listAuditLogForOrganization(db, organizationId, limit = 200) {
  const { results } = await db
    .prepare(
      "SELECT * FROM audit_log WHERE organization_id = ? ORDER BY created_at DESC, id DESC LIMIT ?"
    )
    .bind(organizationId, limit)
    .all();
  return results;
}
