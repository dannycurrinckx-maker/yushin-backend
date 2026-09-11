// Organisatie-info (taak #74, zelfregistratie/onboarding-flow).
//
// Bewust een aparte, kleine route i.p.v. dit in de auth-routes te proppen:
// zowel login als registratie geven nu enkel account-gegevens terug (token +
// user), niet de organisatie-status. De client vraagt die apart op zodra hij
// ze nodig heeft (bv. voor het onboarding-scherm of een proefperiode-badge)
// — hetzelfde "server is bron van waarheid, client haalt op" patroon als de
// vraag-flow (taak #71).
//
// Geeft BEWUST geen bedragen/prijzen terug — enkel de plan-SLEUTEL
// ("solo"/"team") en de abonnementstatus. Prijzen zijn een apart, nog
// openstaand onderwerp (zie src/lib/plans.js) en horen niet in deze route.

import { jsonResponse } from "../lib/http.js";
import { getOrganizationById } from "../lib/db.js";

export async function handleGetOrganization(request, env, ctx) {
  // Altijd ctx.session.organizationId — nooit een ID uit de request — zie
  // de multi-tenancy-afspraak (taak #69).
  const org = await getOrganizationById(env.DB, ctx.session.organizationId);
  if (!org) {
    // Zou niet moeten kunnen gebeuren (een geldige sessie hoort altijd bij
    // een bestaande organisatie), maar defensief afgehandeld.
    return jsonResponse({ error: "Organisatie niet gevonden." }, 404);
  }

  return jsonResponse({
    organization: {
      id: org.id,
      name: org.name,
      plan: org.plan,
      subscriptionStatus: org.subscription_status,
      createdAt: org.created_at,
      // Taak #118: percentage (indien een 'discount'-toegangscode is
      // ingewisseld), enkel voor WEERGAVE in de client (bv. "20% korting" bij
      // de prijs tonen). Het bedrag dat effectief geïnd wordt blijft altijd
      // server-side berekend in billing.js (applyDiscount) — dit veld is
      // puur informatief.
      discountPercent: org.discount_percent || null,
    },
  });
}
