// Red-flag / safety-laag — Spoor 1.4 van het Verbeterplan (taak #104).
//
// Bron: Danny's ingevuld invuldocument, tabblad "1.4 Red-flags" + zijn
// antwoord op de blokkeer-vraag (chat, 2026-08-26):
//
//   "idd noodsignaal is stop, alarm en/of waarschuwing moet duidelijk
//    gemaakt worden maar therapeut kan wel verderwerken als hij dit wenst,
//    hij moet duidelijk kiezen dat hij de alarm en/of waarschuwing gelezen
//    heeft"
//
// Dat geeft TWEE gedragsniveaus (`tier`), ook al gebruikt de meldingstekst
// zelf drie tekstuele labels (NOODSIGNAAL/ALARM/WAARSCHUWING — bewaard in
// `label` voor weergave/kleurcodering):
//
//   tier "hard" (NOODSIGNAAL)      → harde stop: de flow/het advies blijft
//                                     geblokkeerd tot de therapeut dit actief
//                                     bevestigt (zie client-laag, taak #105).
//   tier "soft" (ALARM/WAARSCHUWING) → duidelijk tonen, niet blokkerend voor
//                                     de flow zelf, maar de therapeut moet
//                                     expliciet "gelezen"/"begrepen"
//                                     aanvinken/bevestigen voor hij verder
//                                     kan met het therapieplan.
//
// Verder vastgelegd door Danny:
//   - Enkel zichtbaar voor de therapeut-rol (niet de patiëntrol) — zie
//     handleGetResult in flow.js voor de rolgate.
//   - Vaste, versiebeheerste teksten — geen AI-gegenereerde tekst.
//
// Alle 13 symptomen waren in zijn document gemarkeerd als "nieuw" (geen
// bestaande vraag dekte ze) — vandaar de nieuwe veiligheidssectie in
// sectionsNl.js/sectionsEn.js (taak #104) die naar deze ids verwijst via
// opt.redFlag.
//
// messageEn is de door Danny/collega's NAGEKEKEN en GOEDGEKEURDE finale
// EN-tekst (bron: "Yushin_Fase2_Losse_Eindjes_Aangevuld_Nagekeken.xlsx",
// tabblad "2. EN red-flag review", reviewstatus "GOEDGEKEURD — finale EN"
// voor alle 13 rijen). Elke correctie is klinisch onderbouwd met een
// bronverwijzing (grotendeels nhs.uk) die in dat document is opgenomen.
// Dit vervangt de eerdere, ongereviewde eigen vertaling.

export const RED_FLAGS = {
  red_verlamming_spraak: {
    tier: "hard",
    label: "NOODSIGNAAL",
    ernstniveau: "dringend",
    messageNl:
      "NOODSIGNAAL: plots krachtsverlies/verlamming, spraakstoornis of een scheve mond kan wijzen op een beroerte. Tijd is cruciaal: onmiddellijk 112/spoedhulp inschakelen.",
    messageEn:
      "EMERGENCY: sudden facial droop, arm weakness or paralysis, or speech difficulty may indicate a stroke. Time is critical: call emergency services immediately (112 in the EU).",
  },
  red_borstpijn_uitstraling: {
    tier: "hard",
    label: "NOODSIGNAAL",
    ernstniveau: "dringend",
    messageNl:
      "NOODSIGNAAL: borstpijn met uitstraling en/of kortademigheid kan passen bij een acute hart- of longaandoening. Stop de beoordeling en adviseer onmiddellijk spoedhulp / 112.",
    messageEn:
      "EMERGENCY: chest pain that spreads to the arm(s), jaw, neck or back and/or is accompanied by shortness of breath may indicate an acute heart or lung condition. Stop the assessment and call emergency services immediately (112 in the EU).",
  },
  red_benauwdheid_cyanose: {
    tier: "hard",
    label: "NOODSIGNAAL",
    ernstniveau: "dringend",
    messageNl:
      "NOODSIGNAAL: plots ernstige benauwdheid, blauwe verkleuring of tekenen van zuurstoftekort vereisen onmiddellijke spoedhulp / 112.",
    messageEn:
      "EMERGENCY: sudden severe shortness of breath, blue/grey discoloration of the lips or skin, or other signs of oxygen deprivation require immediate emergency care. Call emergency services immediately (112 in the EU).",
  },
  red_allergische_reactie: {
    tier: "hard",
    label: "NOODSIGNAAL",
    ernstniveau: "dringend",
    messageNl:
      "NOODSIGNAAL: zwelling van tong/keel of ademhalingsproblemen kan passen bij anafylaxie. Onmiddellijk spoedhulp / 112.",
    messageEn:
      "EMERGENCY: sudden swelling of the tongue or throat and/or difficulty breathing may indicate anaphylaxis. Call emergency services immediately (112 in the EU).",
  },
  red_flauwvallen_verwardheid: {
    tier: "hard",
    label: "NOODSIGNAAL",
    ernstniveau: "dringend",
    messageNl:
      "NOODSIGNAAL: nieuw bewustzijnsverlies, ernstige verwardheid of verminderd bewustzijn kan een acute medische oorzaak hebben. Stop de beoordeling en schakel dringende medische hulp in.",
    messageEn:
      "EMERGENCY: new loss of consciousness, severe confusion, or a reduced level of consciousness may have an acute medical cause. Stop the assessment and seek immediate emergency medical care; call emergency services if the person is unresponsive or rapidly deteriorating.",
  },
  red_zwangerschap_bloedverlies: {
    tier: "hard",
    label: "NOODSIGNAAL",
    ernstniveau: "dringend",
    messageNl:
      "NOODSIGNAAL: hevige buikpijn en/of bloedverlies tijdens zwangerschap vereist urgente medische/verloskundige beoordeling. Stop de behandeling en verwijs onmiddellijk volgens de lokale spoedprocedure.",
    messageEn:
      "EMERGENCY: severe abdominal pain and/or vaginal bleeding during pregnancy requires urgent medical/obstetric assessment. Stop treatment and refer immediately according to the local emergency pathway; call emergency services for severe pain, heavy bleeding, fainting or collapse.",
  },
  red_suicidaal: {
    tier: "hard",
    label: "NOODSIGNAAL",
    ernstniveau: "dringend",
    messageNl:
      "NOODSIGNAAL: mogelijke suïcidaliteit of acute psychische crisis vereist onmiddellijke veiligheidsbeoordeling en professionele crisishulp. Laat de persoon niet alleen bij acuut gevaar en schakel de lokale spoed-/crisisdienst in.",
    messageEn:
      "EMERGENCY: possible suicidality or an acute mental health crisis requires immediate safety assessment and professional crisis support. If there is immediate danger, do not leave the person alone and contact local emergency/crisis services.",
  },

  red_bloed_ontlasting_urine: {
    tier: "soft",
    label: "ALARM",
    ernstniveau: "dringend",
    messageNl:
      "ALARM: zichtbaar bloed in ontlasting of urine moet medisch beoordeeld worden. Bij veel bloed, zwarte teerachtige ontlasting, duizeligheid/flauwvallen, hevige pijn of algemene achteruitgang: dringende medische hulp.",
    messageEn:
      "ALERT: visible blood in stool or urine requires medical assessment. Seek urgent medical care for heavy bleeding, black or tarry stools, dizziness or fainting, severe pain, or general deterioration.",
  },
  red_trombose_kuit: {
    tier: "soft",
    label: "ALARM",
    ernstniveau: "dringend",
    messageNl:
      "ALARM: acute eenzijdige zwelling/pijn van een been kan een trombose zijn; in combinatie met borstpijn of kortademigheid is spoedbeoordeling noodzakelijk. Niet behandelen vóór medische evaluatie.",
    messageEn:
      "ALERT: acute one-sided leg swelling and/or pain may indicate deep vein thrombosis (DVT). If accompanied by chest pain, severe shortness of breath or fainting, call emergency services immediately. Do not treat until medically evaluated.",
  },
  red_plotse_hevige_pijn: {
    tier: "soft",
    label: "ALARM",
    ernstniveau: "dringend",
    messageNl:
      "ALARM: plots ontstane, zeer hevige of ongekende pijn kan een acute medische oorzaak hebben. Stop de TCM-beoordeling en laat dit eerst dringend medisch beoordelen; bij ernstige of snel verslechterende klachten: spoedhulp.",
    messageEn:
      "ALERT: sudden-onset, very severe, or unfamiliar pain can have an acute medical cause. Pause the TCM assessment and arrange urgent medical evaluation; if the pain is severe or rapidly worsening, seek emergency care.",
  },
  red_koorts_aanhoudend: {
    tier: "soft",
    label: "WAARSCHUWING",
    ernstniveau: "dringend",
    messageNl:
      "WAARSCHUWING: aanhoudende of hoge koorts kan wijzen op een infectie of andere medische aandoening. Adviseer medische beoordeling; bij ernstige ziekteverschijnselen, sufheid, benauwdheid of snelle achteruitgang: dringende hulp.",
    messageEn:
      "WARNING: persistent or high fever can indicate an infection or another medical condition. Advise medical assessment, especially if it is not improving or is worsening. Seek urgent help for severe illness, drowsiness/confusion, breathing difficulty, or rapid deterioration.",
  },
  red_zwelling_knobbel: {
    tier: "soft",
    label: "WAARSCHUWING",
    ernstniveau: "dringend",
    messageNl:
      "WAARSCHUWING: een nieuwe of snel groeiende zwelling/knobbel moet medisch beoordeeld worden. Bij luchtwegproblemen, ernstige pijn, koorts of snelle uitbreiding: dringende hulp.",
    messageEn:
      "WARNING: a new or rapidly growing lump/swelling should be medically assessed. Seek urgent care if it is associated with breathing problems, severe pain, fever, redness/heat, or rapid progression.",
  },
  red_gewichtsverlies: {
    tier: "soft",
    label: "WAARSCHUWING",
    ernstniveau: "informatief",
    messageNl:
      "WAARSCHUWING: onbedoeld of onverklaard gewichtsverlies verdient medische evaluatie, zeker wanneer het aanhoudt of samengaat met andere alarmsymptomen. Overweeg verwijzing naar een arts.",
    messageEn:
      "WARNING: unintentional or unexplained weight loss warrants medical evaluation, especially if it persists or occurs with other concerning symptoms. Advise referral to a physician or GP.",
  },
};

// Volgorde waarin tiers gesorteerd worden bij weergave: hard (noodsignaal)
// altijd eerst, zodat de blokkerende melding nooit onder een zachte
// waarschuwing verstopt zit.
export const RED_FLAG_TIER_ORDER = { hard: 0, soft: 1 };

// --- Ontkoppeling van patiëntantwoorden (MDR-veilig-lanceren, 04/09) -------
//
// Voorheen (taak #104/#105) werd elk van deze 13 symptomen gekoppeld aan een
// specifieke antwoordoptie in de veiligheidssectie (s0safety, zie
// sectionsNl.js/sectionsEn.js): de server berekende op basis van de
// ingevulde antwoorden welke red flags actief waren (resolveRedFlags in
// flowEngine.js) en de client blokkeerde de hele flow met een NOODSIGNAAL-
// overlay zodra een "hard"-tier symptoom herkend werd. Functioneel is dat
// een geautomatiseerd triage-/screeningsalgoritme op patiëntdata — precies
// het soort automatisme dat de niet-medische positionering (taak #111,
// Yushin_DPA_Privacy_SaaS_NietMedische_Positionering_PreLegal_v2.xlsx) wil
// vermijden. Beslissing Danny (04/09, launch-blocker): de inhoud van deze
// checklist blijft behouden (waardevolle, klinisch onderbouwde informatie),
// maar wordt NIET MEER automatisch tegen de ingevulde antwoorden gecheckt en
// triggert dus ook geen blokkerende pop-up meer op basis van patiëntdata.
// In plaats daarvan geeft deze functie de volledige checklist terug als
// statische, taalbewuste referentielijst — onafhankelijk van welke sessie of
// welke antwoorden er zijn. De server-side koppeling met `answers` (via
// opt.redFlag/computeResultState) is verwijderd, zie flowEngine.js.
export function staticSafetyChecklist(lang) {
  return Object.entries(RED_FLAGS)
    .map(([id, def]) => ({
      id,
      tier: def.tier,
      label: def.label,
      ernstniveau: def.ernstniveau,
      message: lang === "en" ? def.messageEn : def.messageNl,
    }))
    .sort((x, y) => RED_FLAG_TIER_ORDER[x.tier] - RED_FLAG_TIER_ORDER[y.tier]);
}
