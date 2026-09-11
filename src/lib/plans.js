// Abonnementsplannen — bewust hier centraal en SERVER-SIDE vastgelegd.
//
// Belangrijk beveiligingsprincipe: het bedrag dat aan Mollie wordt
// doorgegeven mag NOOIT rechtstreeks van de client komen (een cliënt zou
// anders een lager bedrag kunnen meesturen dan afgesproken). De route
// (`src/routes/billing.js`) mag enkel een planNAAM van de client aannemen,
// en zoekt hier zelf het bijbehorende bedrag bij op.
//
// Prijzen bijgewerkt naar Yushin_Prijsstrategie_Concurrentieanalyse_2026.pdf
// (taak #113) — verlaagt de eerdere C.6-prijzen (€14,95/€29,95) naar het
// scherpere marktadvies uit die concurrentieanalyse. De interne sleutels
// ("solo"/"team") zijn NIET hernoemd naar "professional"/"practice" om twee
// redenen: (1) ze zijn pure interne identifiers, nergens client-facing
// getoond (er bestaat nog geen plan-kiezer in de UI), en (2)
// tests/billing.test.js verwijst er meermaals hardcoded naar; hernoemen zou
// die tests onnodig moeten meeveranderen voor een zuiver cosmetische
// wijziging. Het klantgerichte label ("Yushin Professional"/"Yushin
// Practice") staat wel al correct in `label`.
//
// Jaarfacturatie (taak #113, deel van de concurrentieanalyse) staat nu als
// aparte plansleutel ("solo_yearly"/"team_yearly") met interval "12 months"
// — Mollie behandelt elk interval/bedrag als een eigen abonnementsvorm, dus
// een aparte sleutel is hier eenvoudiger dan de bestaande sleutels een extra
// "interval"-keuze te laten dragen. LET OP: er bestaat nog GEEN plan-kiezer
// in de client (maand vs. jaar, of Professional vs. Practice) — dit maakt
// enkel de server-side prijs/interval-combinatie beschikbaar; iemand moet
// `body.plan` met de juiste sleutel aanroepen (nu enkel mogelijk via een
// rechtstreekse API-call, bv. tijdens een handmatig/telefonisch
// verkoopgesprek, niet via de UI).
//
// `maxSeats` (taak #115, seat-limiet) staat bewust ENKEL op de team-plannen.
// Professional/"solo" krijgt hier expliciet GEEN limiet (blijft dus
// ongewijzigd t.o.v. de bestaande, al langer geteste uitnodigingslogica in
// admin.js) — de concurrentieanalyse noemt "1 gebruiker" voor Professional,
// maar dat nu ook technisch afdwingen zou het bestaande gedrag van
// solo/trialing-organisaties veranderen (zie tests/admin.test.js, dat er nu
// van uitgaat dat een net-geregistreerde praktijk zonder limiet mag
// uitnodigen) zonder dat dit expliciet gevraagd was. Enkel Practice is nu
// technisch afgedwongen op max. 3 actieve gebruikers.
//
// Education-laag (taak #116) — na overleg bewust ZO LICHT MOGELIJK
// gehouden: volledig manuele aanmelding (jij maakt/activeert het account)
// en facturatie BUITEN Mollie om (factuur/overschrijving per
// academiejaar), niet via de gewone checkout-flow. Deze drie plannen dienen
// daarom enkel als NAAMGEVING/PRIJSREFERENTIE voor `organizations.plan` —
// zet je een organisatie handmatig op een van deze sleutels (zie het
// runbook hieronder), dan toont elke plek die getPlan() gebruikt gewoon het
// juiste label. `manualOnly: true` sluit deze sleutels expliciet uit van
// /api/billing/checkout (zie billing.js) — zonder die vlag zou een
// eventuele toekomstige client die per ongeluk deze sleutel meestuurt een
// ECHTE Mollie-betaling triggeren voor een bedrag dat helemaal niet via
// Mollie geïnd hoort te worden.
//
// HANDMATIG ACTIVEREN (runbook): laat de student/school gewoon normaal
// registreren via /api/auth/register (of registreer zelf voor hen), en
// werk daarna de organisatie bij in de database:
//   UPDATE organizations
//   SET subscription_status = 'active', plan = 'education_student'
//   WHERE contact_email = '<e-mailadres van de registratie>';
// (vervang 'education_student' door 'education_founding' of
// 'education_graduate' waar van toepassing). subscription_status='active'
// is nodig zodat de proefperiode-afdwinging (taak #114, src/lib/trial.js)
// deze organisatie nooit blokkeert — zonder deze stap blijft het gewoon een
// normale 'trialing'-organisatie met de 14-dagen/5-analyses-limiet.
//
// Toegangscode-systeem (taak #118) — vervangt de automatische proefperiode
// (taak #114) door een harde poort: een organisatie in status 'trialing'
// heeft nu GEEN toegang meer. Ontgrendelen kan via een echte Mollie-betaling
// (-> 'active') of een geldige toegangscode. Een code van het type 'free'
// (zie src/routes/accessCodes.js) zet de organisatie op onderstaand
// "free"-plan — bewust net als de Education-plannen `manualOnly: true` en
// NUL bedrag: dit plan dient enkel als NAAMGEVING (voor labels/facturatie-
// overzichten), niet als iets dat via de gewone checkout gekozen kan worden.
export const PLANS_FREE_CODE_KEY = "free";

// NOG NIET GEÏMPLEMENTEERD (bewust, apart traject):
//   - Flex/pay-per-use (€1,95/analyse) — expliciet "later/optioneel" volgens
//     de concurrentieanalyse zelf; volledig ander (metered i.p.v.
//     abonnements-)billingmodel, nog niet gebouwd.
//   - Automatisering van de Education-laag (zelfregistratie met
//     schoolmail-check, partnerschool-codes, een geldig-tot-datum) — bewust
//     uitgesteld tot er een concrete partnerschool is; nu is alles manueel.
export const PLANS = {
  solo: {
    label: "Yushin Professional",
    amount: { currency: "EUR", value: "8.95" },
    interval: "1 month",
  },
  solo_yearly: {
    label: "Yushin Professional (jaarlijks)",
    amount: { currency: "EUR", value: "89.00" },
    interval: "12 months",
  },
  team: {
    label: "Yushin Practice",
    amount: { currency: "EUR", value: "19.95" },
    interval: "1 month",
    maxSeats: 3,
  },
  team_yearly: {
    label: "Yushin Practice (jaarlijks)",
    amount: { currency: "EUR", value: "199.00" },
    interval: "12 months",
    maxSeats: 3,
  },
  education_student: {
    label: "Yushin Education — Student",
    amount: { currency: "EUR", value: "49.00" },
    interval: "12 months", // ter referentie; niet gebruikt (manualOnly)
    manualOnly: true,
  },
  education_founding: {
    label: "Yushin Education — Founding Education Partner",
    amount: { currency: "EUR", value: "39.00" },
    interval: "12 months",
    manualOnly: true,
  },
  education_graduate: {
    label: "Yushin Education — Graduate (eerste jaar)",
    amount: { currency: "EUR", value: "69.00" },
    interval: "12 months",
    manualOnly: true,
  },
  free: {
    label: "Yushin — Gratis toegang (code)",
    amount: { currency: "EUR", value: "0.00" },
    interval: null,
    manualOnly: true,
  },
};

export function getPlan(planKey) {
  return PLANS[planKey] || null;
}

// Past een kortingspercentage toe op een plan-bedrag (taak #118, discount-
// toegangscodes). Rekent in centen om drijvendekomma-afrondingsfouten te
// vermijden (bv. 8.95 EUR * 0.5 in gewone floats kan 4.474999... geven).
// Math.round rondt op de dichtstbijzijnde cent (standaard "round half up"
// hier omdat percentages/bedragen altijd positief zijn).
//
// `discountPercent` komt uit de DB-kolom `organizations.discount_percent` — kan
// null/undefined/0 zijn (dan gewoon het volle bedrag), of 1-99.
export function applyDiscount(amount, discountPercent) {
  if (!discountPercent || discountPercent <= 0) return amount;
  const cents = Math.round(parseFloat(amount.value) * 100);
  const discountedCents = Math.round((cents * (100 - discountPercent)) / 100);
  return { currency: amount.currency, value: (discountedCents / 100).toFixed(2) };
}
