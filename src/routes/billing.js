// Billing-routes (Mollie) — taak #70.
//
// Kernprincipe (herhaald uit src/lib/plans.js): het te betalen bedrag komt
// NOOIT van de client. De client kiest enkel een planNAAM ("solo"/"team");
// het bijbehorende bedrag wordt hier server-side opgezocht.
//
// Flow:
//   1. handleStartCheckout: eigenaar kiest een plan -> Mollie-klant
//      aanmaken/hergebruiken -> "eerste betaling" starten (vestigt het
//      mandaat voor automatische afschrijvingen) -> checkout-URL teruggeven.
//   2. Klant betaalt op Mollie's hosted checkout-pagina.
//   3. Mollie roept handleMollieWebhook aan (enkel een payment-ID, geen
//      sessie/auth mogelijk — Mollie kan geen Bearer-token meesturen).
//   4. Bij succesvolle eerste betaling: het eigenlijke terugkerende
//      abonnement aanmaken (createSubscription) en de organisatie op
//      "active" zetten.

import { jsonResponse, readJsonBody } from "../lib/http.js";
import { getPlan, applyDiscount } from "../lib/plans.js";
import {
  newId,
  getOrganizationById,
  setOrganizationMollieCustomerId,
  getOrganizationByMollieCustomerId,
  updateOrganizationSubscriptionStatus,
  createSubscriptionRecord,
  updateSubscriptionStatus,
} from "../lib/db.js";
import { createMollieCustomer, createFirstPayment, createSubscription, getPayment } from "../lib/mollie.js";

function webhookUrlFor(request) {
  return `${new URL(request.url).origin}/api/billing/webhook`;
}

export async function handleStartCheckout(request, env, ctx) {
  const body = await readJsonBody(request);
  if (!body) return jsonResponse({ error: "Ongeldige aanvraag." }, 400);

  const planConfig = getPlan(body.plan);
  if (!planConfig) {
    return jsonResponse({ error: "Onbekend abonnement." }, 400);
  }
  // Taak #116 (Education-laag) — deze plannen worden bewust BUITEN Mollie om
  // gefactureerd (manueel per academiejaar, zie het runbook in plans.js) en
  // mogen dus nooit een echte Mollie-betaling triggeren via deze route.
  if (planConfig.manualOnly) {
    return jsonResponse(
      { error: "Dit abonnement wordt niet via de gewone checkout afgehandeld — neem contact op." },
      400
    );
  }

  // redirectUrl is waar Mollie de klant naar terugstuurt NA het betalen (niet
  // waar het geld heen gaat — dat bepaalt enkel Mollie zelf). Als
  // env.APP_BASE_URL is ingesteld, staan we enkel redirects naar het eigen
  // domein toe; zonder die instelling (bv. lokaal ontwikkelen) valideren we
  // enkel dat het een niet-lege string is. TODO (taak #72, als de definitieve
  // clientdomeinnaam vastligt): env.APP_BASE_URL altijd instellen zodat deze
  // check overal actief is.
  const redirectUrl = typeof body.redirectUrl === "string" ? body.redirectUrl : "";
  if (!redirectUrl) {
    return jsonResponse({ error: "redirectUrl is verplicht." }, 400);
  }
  if (env.APP_BASE_URL && !redirectUrl.startsWith(env.APP_BASE_URL)) {
    return jsonResponse({ error: "redirectUrl moet naar het eigen domein wijzen." }, 400);
  }

  // organizationId komt altijd uit de sessie, nooit uit de request body —
  // zie multi-tenancy-afspraak (taak #69).
  const organization = await getOrganizationById(env.DB, ctx.session.organizationId);
  if (!organization) {
    return jsonResponse({ error: "Organisatie niet gevonden." }, 404);
  }

  let mollieCustomerId = organization.mollie_customer_id;
  if (!mollieCustomerId) {
    const customer = await createMollieCustomer(env, {
      name: organization.name,
      email: organization.contact_email,
    });
    mollieCustomerId = customer.id;
    await setOrganizationMollieCustomerId(env.DB, organization.id, mollieCustomerId);
  }

  // Taak #118: een 'discount'-toegangscode zet organizations.discount_percent
  // — als dat gezet is, wordt het bedrag hier server-side verlaagd (nooit op
  // basis van iets dat de client meestuurt) voordat het naar Mollie gaat.
  const amount = applyDiscount(planConfig.amount, organization.discount_percent);

  const payment = await createFirstPayment(env, {
    customerId: mollieCustomerId,
    amount,
    description: `Yushin abonnement — ${planConfig.label}`,
    redirectUrl,
    webhookUrl: webhookUrlFor(request),
    // Onthouden welke organisatie + welk plan dit betreft, zodat de webhook
    // (die enkel een payment-ID krijgt) straks weet welk abonnement het moet
    // aanmaken — zonder een aparte "pending payments"-tabel nodig te hebben.
    metadata: { organizationId: organization.id, plan: body.plan },
  });

  const checkoutUrl = payment?._links?.checkout?.href;
  if (!checkoutUrl) {
    return jsonResponse({ error: "Mollie gaf geen checkout-URL terug." }, 502);
  }

  return jsonResponse({ checkoutUrl, paymentId: payment.id });
}

export async function handleMollieWebhook(request, env) {
  // Mollie stuurt hier POST application/x-www-form-urlencoded met enkel een
  // "id" veld — geen JSON, en geen manier om een sessietoken mee te sturen.
  // Daarom staat deze route in de router bewust op auth:"none".
  let paymentId;
  try {
    const form = await request.formData();
    paymentId = form.get("id");
  } catch {
    return jsonResponse({ error: "Ongeldige aanvraag." }, 400);
  }
  if (!paymentId) {
    return jsonResponse({ error: "Ontbrekend payment-ID." }, 400);
  }

  const payment = await getPayment(env, paymentId);

  // We vertrouwen voor het koppelen aan een organisatie NIET op de metadata
  // (die wordt door Mollie ongewijzigd teruggegeven, maar de bron van
  // waarheid hier is customerId: dat veld kan een aanroeper niet vervalsen,
  // want getPayment haalt de data rechtstreeks bij Mollie op met ONZE eigen
  // API-key — Mollie geeft nooit gegevens van een ander Mollie-account
  // terug). De metadata gebruiken we enkel om te weten WELK plan gekozen was.
  if (!payment || !payment.customerId) {
    // Niets om aan te koppelen — toch 200 teruggeven zodat Mollie niet
    // blijft herhalen voor iets wat we sowieso nooit kunnen verwerken.
    return jsonResponse({ ok: true });
  }

  const organization = await getOrganizationByMollieCustomerId(env.DB, payment.customerId);
  if (!organization) {
    return jsonResponse({ ok: true });
  }

  const planKey = payment.metadata?.plan && getPlan(payment.metadata.plan) ? payment.metadata.plan : organization.plan;

  if (payment.status === "paid") {
    if (payment.sequenceType === "first") {
      // De eerste betaling is geslaagd -> het mandaat staat -> nu pas het
      // eigenlijke terugkerende abonnement aanmaken bij Mollie. Dezelfde
      // korting (indien van toepassing, taak #118) geldt ook hier — anders
      // zou de eerste betaling verlaagd zijn maar elke volgende afschrijving
      // weer op de volle prijs staan.
      const planConfig = getPlan(planKey);
      const amount = applyDiscount(planConfig.amount, organization.discount_percent);
      const subscription = await createSubscription(env, {
        customerId: payment.customerId,
        amount,
        interval: planConfig.interval,
        description: `Yushin abonnement — ${planConfig.label}`,
        webhookUrl: webhookUrlFor(request),
      });

      await createSubscriptionRecord(env.DB, {
        id: newId(),
        organizationId: organization.id,
        mollieSubscriptionId: subscription.id,
        status: "active",
        plan: planKey,
        currentPeriodEnd: subscription.nextPaymentDate || null,
      });
      await updateOrganizationSubscriptionStatus(env.DB, organization.id, "active", planKey);
    } else {
      // Een terugkerende (automatische) afschrijving is geslaagd — dit kan
      // ook een herstel zijn na een eerder mislukte afschrijving, dus zet de
      // status expliciet weer op "active".
      await updateOrganizationSubscriptionStatus(env.DB, organization.id, "active", planKey);
      if (payment.subscriptionId) {
        await updateSubscriptionStatus(env.DB, payment.subscriptionId, "active", null);
      }
    }
  } else if (["failed", "expired", "canceled"].includes(payment.status)) {
    if (payment.sequenceType === "recurring") {
      // Een terugkerende afschrijving is mislukt: de praktijk loopt achter
      // met betalen, maar het abonnement wordt niet stilzwijgend stopgezet —
      // Mollie blijft zelf enkele keren opnieuw proberen. Wij markeren enkel
      // de status zodat dit zichtbaar is (bv. later in het beheerpaneel,
      // taak #73).
      await updateOrganizationSubscriptionStatus(env.DB, organization.id, "past_due", organization.plan);
      if (payment.subscriptionId) {
        await updateSubscriptionStatus(env.DB, payment.subscriptionId, "past_due", null);
      }
    }
    // Als de EERSTE betaling mislukt is er nog nooit een abonnement
    // aangemaakt — de organisatie blijft gewoon "trialing", niets te doen.
  }
  // Status "open"/"pending": nog geen definitieve uitkomst, wachten op een
  // volgende webhook-aanroep van Mollie.

  return jsonResponse({ ok: true });
}
