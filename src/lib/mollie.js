// Dunne wrapper rond de Mollie REST API via fetch — geen SDK-dependency nodig,
// wat in een Cloudflare Worker sowieso de eenvoudigste en lichtste aanpak is.
// Documentatie: https://docs.mollie.com/reference/v2

const MOLLIE_API_BASE = "https://api.mollie.com/v2";

async function mollieRequest(env, path, options = {}) {
  const res = await fetch(`${MOLLIE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.MOLLIE_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Mollie-fout (${res.status}): ${body.detail || body.title || "onbekend"}`);
  }
  return body;
}

// Maakt een Mollie-klant aan voor een praktijk (nodig voor recurring payments).
export async function createMollieCustomer(env, { name, email }) {
  return mollieRequest(env, "/customers", {
    method: "POST",
    body: JSON.stringify({ name, email }),
  });
}

// Start de eerste betaling ("first payment"), die het mandaat voor
// automatische afschrijvingen vestigt. Na succesvolle betaling maak je
// het eigenlijke abonnement aan (zie createSubscription hieronder).
export async function createFirstPayment(env, { customerId, amount, description, redirectUrl, webhookUrl, metadata }) {
  return mollieRequest(env, "/payments", {
    method: "POST",
    body: JSON.stringify({
      amount, // { currency: "EUR", value: "29.00" }
      description,
      customerId,
      sequenceType: "first",
      redirectUrl,
      webhookUrl,
      // metadata komt ongewijzigd terug op het payment-object wanneer je het
      // later opvraagt (bv. in de webhook via getPayment) — hier gebruikt om
      // organizationId + gekozen plan te onthouden tussen checkout-start en
      // webhook-afhandeling, zonder een aparte "pending payments"-tabel nodig
      // te hebben.
      metadata,
    }),
  });
}

export async function createSubscription(env, { customerId, amount, interval, description, webhookUrl }) {
  return mollieRequest(env, `/customers/${customerId}/subscriptions`, {
    method: "POST",
    body: JSON.stringify({
      amount, // { currency: "EUR", value: "29.00" }
      interval, // bv. "1 month"
      description,
      webhookUrl,
    }),
  });
}

export async function getPayment(env, paymentId) {
  return mollieRequest(env, `/payments/${paymentId}`);
}

export async function cancelSubscription(env, { customerId, subscriptionId }) {
  return mollieRequest(env, `/customers/${customerId}/subscriptions/${subscriptionId}`, {
    method: "DELETE",
  });
}
