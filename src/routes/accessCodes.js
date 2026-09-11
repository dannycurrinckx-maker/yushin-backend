// Toegangscode-route — taak #118.
//
// Vervangt de automatische proefperiode: een organisatie in status
// 'trialing' is geblokkeerd (zie src/lib/trial.js) tot ze ofwel echt betaald
// heeft via Mollie (billing.js), ofwel hier een geldige code invoert.
//
// Twee soorten codes (zie migrations/0004_access_codes.sql):
//   - kind: 'free'     -> ontgrendelt de organisatie ONMIDDELLIJK
//                          (subscription_status -> 'active'), nooit betalen.
//   - kind: 'discount' -> ontgrendelt NIETS op zichzelf. Onthoudt enkel een
//                          kortingspercentage dat automatisch wordt
//                          toegepast bij de eerstvolgende echte checkout
//                          (zie applyDiscount() in billing.js).
//
// Bewust "auth: owner" in index.js (net als /api/billing/checkout): enkel de
// praktijkeigenaar mag de organisatie-brede toegangs-/betaalstatus wijzigen,
// niet elk uitgenodigd teamlid.

import { jsonResponse, readJsonBody } from "../lib/http.js";
import { isNonEmptyString } from "../lib/validation.js";
import { getPlan, PLANS_FREE_CODE_KEY } from "../lib/plans.js";
import {
  getAccessCodeByCode,
  incrementAccessCodeUseCount,
  activateOrganizationWithFreeCode,
  applyOrganizationDiscount,
  getOrganizationById,
} from "../lib/db.js";

export async function handleRedeemAccessCode(request, env, ctx) {
  const body = await readJsonBody(request);
  if (!body || !isNonEmptyString(body.code, 100)) {
    return jsonResponse({ error: "Voer een geldige code in." }, 400);
  }

  // organizationId komt altijd uit de sessie, nooit uit de request body —
  // zie multi-tenancy-afspraak (taak #69).
  const organization = await getOrganizationById(env.DB, ctx.session.organizationId);
  if (!organization) {
    return jsonResponse({ error: "Organisatie niet gevonden." }, 404);
  }

  const accessCode = await getAccessCodeByCode(env.DB, body.code.trim());
  if (!accessCode) {
    return jsonResponse({ error: "Ongeldige of niet langer geldige code." }, 400);
  }
  if (accessCode.max_uses != null && accessCode.use_count >= accessCode.max_uses) {
    return jsonResponse({ error: "Deze code is al het maximaal aantal keer gebruikt." }, 400);
  }

  if (accessCode.kind === "free") {
    // Taak #141b — accessCode.session_limit is NULL voor elke code die vóór
    // migratie 0007 bestond (of gewoon zonder limiet werd aangemaakt): dan
    // blijft dit exact het oude, permanente gedrag.
    await activateOrganizationWithFreeCode(
      env.DB,
      organization.id,
      PLANS_FREE_CODE_KEY,
      accessCode.code,
      accessCode.session_limit ?? null
    );
    await incrementAccessCodeUseCount(env.DB, accessCode.id);
    const plan = getPlan(PLANS_FREE_CODE_KEY);
    return jsonResponse({
      ok: true,
      kind: "free",
      subscriptionStatus: "active",
      plan: PLANS_FREE_CODE_KEY,
      planLabel: plan?.label || PLANS_FREE_CODE_KEY,
      sessionLimit: accessCode.session_limit ?? null,
    });
  }

  // kind === "discount" (het enige andere toegestane type — zie CHECK-
  // constraint in de migratie, dus geen aparte "onbekend type"-tak nodig).
  await applyOrganizationDiscount(env.DB, organization.id, accessCode.discount_percent, accessCode.code);
  await incrementAccessCodeUseCount(env.DB, accessCode.id);
  return jsonResponse({
    ok: true,
    kind: "discount",
    discountPercent: accessCode.discount_percent,
    // De organisatie blijft bewust 'trialing' (dus geblokkeerd) — de klant
    // moet nu alsnog naar /api/billing/checkout, maar dan tegen het
    // verlaagde bedrag.
    subscriptionStatus: organization.subscription_status,
  });
}
