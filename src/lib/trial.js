// Toegangsafdwinging (taak #118) — VERVANGT de eerdere automatische
// 14-dagen/5-analyses-proefperiode (taak #114).
//
// Nieuwe, veel eenvoudigere regel: een organisatie in status 'trialing'
// heeft GEEN toegang, punt — geen gratis periode, geen gratis aantal
// verkenningen. Ontgrendelen (-> subscription_status 'active') kan enkel
// via:
//   (a) een geslaagde Mollie-betaling (zie src/routes/billing.js), of
//   (b) een geldige toegangscode van het type 'free'
//       (zie src/routes/accessCodes.js).
//
// Bestaande resultaten (patient_sessions) blijven gewoon leesbaar/opvraagbaar
// — enkel het STARTEN of AFRONDEN van een NIEUWE patroonverkenning wordt
// geblokkeerd (zie src/routes/flow.js).
//
// Taak #141b (gelimiteerde testtoegang, migratie 0007) — kleine, bewust
// ACHTERWAARTS-COMPATIBELE uitbreiding: naast de bestaande "trialing =
// geblokkeerd"-regel wordt nu ook gecontroleerd of een organisatie een
// `trial_session_limit` heeft (enkel gezet als ze een gelimiteerde 'free'-
// code inwisselden, zie activateOrganizationWithFreeCode in db.js) én dat
// aantal al bereikt heeft. `sessionCount` komt van de aanroeper
// (countPatientSessionsForOrganization, al bestaand) — deze functie houdt
// zelf bewust geen aparte verbruiksteller bij, om nooit uit sync te kunnen
// raken met de werkelijke patient_sessions-rijen.
export function isTrialLimitReached(organization, sessionCount = 0) {
  if (!organization) return false;
  if (organization.subscription_status === "trialing") return true;
  if (organization.trial_session_limit != null && sessionCount >= organization.trial_session_limit) {
    return true;
  }
  return false;
}

export const TRIAL_LIMIT_MESSAGE =
  "Deze praktijk heeft nog geen toegang. Rond een abonnement af of voer een geldige toegangscode in om te starten.";

// Kiest het juiste bericht: een gelimiteerd testaccount dat zijn quotum
// verbruikte, krijgt een duidelijkere reden dan de generieke
// TRIAL_LIMIT_MESSAGE hierboven (die blijft gelden voor elke andere
// blokkade — nooit geactiveerd, betaling verlopen, enz.).
export function trialLimitMessage(organization, sessionCount = 0) {
  if (organization && organization.trial_session_limit != null && sessionCount >= organization.trial_session_limit) {
    return `Je gratis testperiode (${organization.trial_session_limit} gratis analyses) is verbruikt. Neem contact op met Yushin voor een abonnement.`;
  }
  return TRIAL_LIMIT_MESSAGE;
}
