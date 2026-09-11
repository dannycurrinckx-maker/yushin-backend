// Dunne wrapper rond de Resend REST API via fetch — geen SDK-dependency
// nodig, zelfde aanpak als mollie.js. Documentatie: https://resend.com/docs/api-reference/emails/send-email
//
// Taak #118: gebruikt om Danny een meldings-mail te sturen telkens iemand
// een nieuwe praktijk registreert (zie handleRegister in routes/auth.js).
// Bewust géén ander gebruik (geen wachtwoord-reset-mails e.d.) — dat blijft
// een aparte, nog niet gebouwde TODO (zie auth.js).
//
// Sandbox-afzenderadres "onboarding@resend.dev" vereist GEEN domeinverificatie
// bij Resend, maar levert daardoor ENKEL af aan het e-mailadres waarmee het
// Resend-account zelf geregistreerd is — precies wat hier nodig is, want de
// enige beoogde ontvanger is Danny zelf (env.NOTIFY_EMAIL).

const RESEND_API_BASE = "https://api.resend.com";

// Gooit NOOIT een fout naar de aanroeper door — een mislukte melding mag een
// registratie nooit blokkeren (zie de try/catch rond de aanroep in
// auth.js). Geeft in plaats daarvan { ok: false, error } terug zodat de
// aanroeper het eventueel kan loggen.
export async function sendEmail(env, { to, from, subject, html }) {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY ontbreekt (env-secret niet ingesteld)." };
  }
  try {
    const res = await fetch(`${RESEND_API_BASE}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to, from, subject, html }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `Resend-fout (${res.status}): ${body.message || "onbekend"}` };
    }
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}
