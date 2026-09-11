// Kernlogica van de TCM 10+2 anamnese — taak #71.
//
// Dit bestand bevat de PURE logica (geen DOM, geen browser-state) die
// voorheen alleen client-side leefde in tcm_10plus2_chatbot.html: de vragen-
// flow met gating (welke vraag komt hierna, welke secties/vragen worden
// overgeslagen), de patroon-score-opbouw ("tally"), en de therapieplan-
// opzoeking. Geport 1-op-1 vanuit extracted.js (buildFlow, requiresSatisfied,
// applyAnswerToState, showResults, lookupTherapiePlan) — zelfde gedrag,
// enkel losgekoppeld van de chat-UI zodat het op de server kan draaien.
//
// Architectuurkeuze: de server is STATELESS tussen requests (idiomatisch
// voor een Cloudflare Worker — er is geen "sessie" in het geheugen). In
// plaats daarvan stuurt de client bij elke aanroep de volledige antwoorden-
// set tot nu toe mee, en herberekent de server alles vanaf nul. Dat is
// precies hetzelfde patroon als het bestaande "Vorige vraag"-mechanisme
// (goToPreviousQuestion in extracted.js), dat ook altijd de volledige
// geschiedenis opnieuw toepast in plaats van deltas terug te draaien.
//
// Vragen/opties hebben in SECTIONS/SECTIONS_EN geen eigen ID — enkel secties
// hebben er een (bv. "s3"). Om een antwoord toch stabiel te kunnen
// aanspreken over requests heen, gebruiken we een samengestelde sleutel
// "sectionId:questionIndex" (bv. "s3:2") en verwijzen we naar het gekozen
// antwoord via zijn positie in question.options. Beide zijn deterministisch
// voor eenzelfde (taal, context) combinatie, dus stabiel genoeg.

import { SECTIONS_NL } from "./sectionsNl.js";
import { SECTIONS_EN } from "./sectionsEn.js";
import { THERAPIEPLAN_MAPPING } from "./therapyPlanData.js";
import { CONTRADICTION_PAIRS, CONTRADICTION_IMPLEMENTATION_NOTE } from "./contradictionData.js";
import { staticSafetyChecklist } from "./redFlagData.js";

export function getSections(lang) {
  return lang === "en" ? SECTIONS_EN : SECTIONS_NL;
}

export function flowKey(sectionId, questionIndex) {
  return `${sectionId}:${questionIndex}`;
}

// Bouwt de platte, geordende vragenlijst voor een gegeven context — 1-op-1
// gedrag van buildFlow() in extracted.js, inclusief dezelfde drie
// sectie-niveau gates (onlyIf:"female"/"pediatric", therapistOnly) en het
// optionele instellingenpaneel-filter (disabledSectionIds, taak #23).
export function buildFlow(sections, context, disabledSectionIds) {
  const disabled = new Set(disabledSectionIds || []);
  const flow = [];
  sections.forEach((sec) => {
    if (disabled.has(sec.id)) return;
    if (sec.onlyIf === "female" && context.female !== true) return;
    if (sec.onlyIf === "pediatric" && context.pediatric !== true) return;
    if (sec.therapistOnly && context.role !== "therapeut") return;
    sec.questions.forEach((question, questionIndex) => {
      flow.push({
        key: flowKey(sec.id, questionIndex),
        sectionId: sec.id,
        sectionTitle: sec.title,
        questionIndex,
        isNewSection: questionIndex === 0,
        question,
      });
    });
  });
  return flow;
}

function applyGate(gates, opt) {
  if (!opt || !opt.gate) return;
  const { key, value } = opt.gate;
  // Zelfde OR-logica als applyAnswerToState: eenmaal "true" ergens gezet,
  // blijft true over meerdere vragen heen; enkel "false" als er nog geen
  // "true" was.
  if (value === true) {
    gates[key] = true;
  } else if (gates[key] !== true) {
    gates[key] = false;
  }
}

function isRequiresSatisfied(question, gates) {
  if (!question.requires) return true;
  return question.requires.every((k) => gates[k] === true);
}

// Loopt de flow in structurele volgorde (nooit de door de client opgegeven
// volgorde van `answers` — die vertrouwen we niet) en bouwt de gates
// cumulatief op uit de al beantwoorde vragen, exact zoals askNext() dat
// client-side deed via requiresSatisfied(). `answers` is een object
// { [flowKey]: optionIndex }.
export function findNextQuestion(flow, answers) {
  const gates = {};
  for (const item of flow) {
    if (!isRequiresSatisfied(item.question, gates)) continue; // automatisch overgeslagen, telt niet mee

    const optionIndex = answers[item.key];
    if (optionIndex === undefined) {
      return {
        done: false,
        key: item.key,
        sectionId: item.sectionId,
        sectionTitle: item.sectionTitle,
        isNewSection: item.isNewSection,
        question: {
          text: item.question.text,
          // Enkel het label gaat naar de client — patterns/gate/clockSeg zijn
          // interne scoring-metadata, geen vraaginhoud (data-minimalisatie,
          // en voorkomt dat de volledige scoretabel via de API te oogsten is).
          options: item.question.options.map((o, idx) => ({ index: idx, label: o.label })),
        },
      };
    }

    const opt = item.question.options[optionIndex];
    applyGate(gates, opt);
  }
  return { done: true };
}

// Herberekent tally/gates/clockHighlights vanaf nul door de volledige
// antwoordenset toe te passen in structurele flow-volgorde — zelfde aanpak
// als goToPreviousQuestion() client-side. Ongeldige/onbeantwoorde/niet-
// bereikbare posities worden stil overgeslagen (nooit een crash op basis van
// client-input): er staat voor de gebruiker niets op het spel bij een
// geknoeide TCM-score, dus we kiezen hier voor robuustheid boven strikte
// afwijzing (in tegenstelling tot bv. het Mollie-bedrag, waar afwijzen wél
// de juiste keuze was).
export function computeResultState(flow, answers) {
  const tally = {}; // pattern -> {count, evidence:[]}
  const gates = {};
  const clockHighlights = new Set();

  for (const item of flow) {
    if (!isRequiresSatisfied(item.question, gates)) continue;

    const optionIndex = answers[item.key];
    if (optionIndex === undefined) continue;
    const opt = item.question.options[optionIndex];
    if (!opt) continue;

    (opt.patterns || []).forEach((p) => {
      if (!tally[p]) tally[p] = { count: 0, evidence: [] };
      tally[p].count += 1;
      tally[p].evidence.push(`${item.question.text} → ${opt.label}`);
    });

    applyGate(gates, opt);

    if (opt.clockSeg) {
      const segs = Array.isArray(opt.clockSeg) ? opt.clockSeg : [opt.clockSeg];
      segs.forEach((s) => clockHighlights.add(s));
    }
  }

  return {
    tally,
    gates,
    clockHighlights: Array.from(clockHighlights),
  };
}

function groupLabel(count) {
  // Semantische sleutel i.p.v. vertaalde tekst (bv. "Sterk"/"Strong") — de
  // client (taak #72) vertaalt dit zelf via zijn eigen STRINGS_BY_LANG-tabel,
  // net zoals voorheen groupLabel()/t("groupStrong") dat deed. Zo hoeft deze
  // server geen kopie van de volledige UI-string-tabel bij te houden.
  if (count >= 3) return "strong";
  if (count === 2) return "moderate";
  return "light";
}

// Spoor 1.1 (taak #101) — semantische confidence-sleutel i.p.v. vertaalde
// tekst, zelfde principe als groupLabel(): de client vertaalt dit zelf.
// Gebaseerd op de score-AFSTAND tot het volgstende patroon in de ranglijst
// (gapBelow), niet enkel de absolute count — een patroon met 8 punten
// voorsprong op nummer 2 is een andere uitspraak dan een patroon dat er met
// 1 punt bovenuit steekt (zie Verbeterplan, Spoor 1.1).
function confidenceLabel(gapBelow) {
  if (gapBelow >= 3) return "strong";
  if (gapBelow >= 1) return "moderate";
  return "weak"; // gapBelow === 0: gelijke stand met het volgende patroon
}

// 1-op-1 gedrag van showResults()'s ranking: aflopend op aantal treffers,
// nu aangevuld met een confidence-label per patroon (Spoor 1.1).
export function rankPatterns(tally) {
  const sorted = Object.entries(tally).sort((a, b) => b[1].count - a[1].count);
  return sorted.map(([pattern, data], idx) => {
    const nextCount = idx + 1 < sorted.length ? sorted[idx + 1][1].count : 0;
    const gapBelow = data.count - nextCount;
    return {
      pattern,
      count: data.count,
      group: groupLabel(data.count),
      confidence: confidenceLabel(gapBelow),
      evidence: data.evidence,
    };
  });
}

// Zoekt de therapieplan-data voor een patroonnaam op, met dezelfde
// alias-resolutie via _meta.spelling_varianten als lookupTherapiePlan() in
// extracted.js (bv. "LR Qi-stagnatie" -> "LR Qi stagnatie").
export function lookupTherapiePlan(patternName) {
  const alias = THERAPIEPLAN_MAPPING._meta.spelling_varianten[patternName];
  const key = alias || patternName;
  return THERAPIEPLAN_MAPPING.patronen[key] || null;
}

// Spoor 1.3 (taak #103) — contradictiedetectie. BEWUST géén uitsluiting:
// levert enkel een lijst review-signalen op voor paren die Danny als
// (mogelijke) contradictie beoordeelde, wanneer BEIDE patronen dominant
// scoren (>= dominantThreshold treffers — standaard 2, d.w.z. minstens
// "moderate" in groupLabel-termen). Zie contradictionData.js voor de
// brondata en Danny's expliciete implementatieregel.
export function detectContradictions(tally, dominantThreshold = 2) {
  const results = [];
  for (const pair of CONTRADICTION_PAIRS) {
    const a = tally[pair.a];
    const b = tally[pair.b];
    if (a && b && a.count >= dominantThreshold && b.count >= dominantThreshold) {
      results.push({
        patternA: pair.a,
        countA: a.count,
        patternB: pair.b,
        countB: b.count,
        tier: pair.tier, // "conflict" | "nuance"
        note: pair.note,
      });
    }
  }
  return results;
}

export { CONTRADICTION_IMPLEMENTATION_NOTE };

// MDR-veilig-lanceren (04/09, launch-blocker) — vervangt de vroegere
// resolveRedFlags(redFlagIds, lang), die de ruwe redFlagIds uit
// computeResultState (afgeleid van de ingevulde antwoorden) vertaalde naar
// meldingen. Die koppeling met `answers` is bewust losgemaakt (zie
// redFlagData.js voor de volledige toelichting): de veiligheidschecklist
// wordt niet langer berekend op basis van patiëntdata, maar blijft bestaan
// als vaste, statische referentielijst die de therapeut zelf raadpleegt.
export function getStaticSafetyChecklist(lang) {
  return staticSafetyChecklist(lang);
}

// Spoor 1.2 (taak #102) — "onvoldoende informatie"-detectie. Wanneer de
// top-patronen dicht bij elkaar liggen (score-afstand <= gapThreshold),
// zoekt dit de vragen op die BEIDE patronen als mogelijke uitkomst hebben
// (dus zouden discrimineren) maar die niet beantwoord zijn in de huidige
// sessie — typisch omdat een sectie via het instellingenpaneel is
// uitgeschakeld (taak #23) of omdat een `requires`-gate ze onbereikbaar
// maakte. Doorzoekt bewust ALLE secties (niet enkel de actieve `flow`), want
// een uitgeschakelde sectie zit niet in `flow`.
export function suggestDiscriminatingQuestions(sections, tally, answers, gapThreshold = 1) {
  const ranked = rankPatterns(tally);
  if (ranked.length < 2) return [];

  // Enkel de "geconteste top" bekijken: opeenvolgende paren vanaf de kop
  // van de ranglijst met een klein scoreverschil. Zodra het gat groter
  // wordt dan gapThreshold, stopt de vergelijking (verder naar beneden is
  // het al duidelijk minder relevant dan de koppositie).
  const contested = [];
  for (let i = 0; i < ranked.length - 1; i++) {
    if (ranked[i].count - ranked[i + 1].count <= gapThreshold) {
      contested.push([ranked[i].pattern, ranked[i + 1].pattern]);
    } else {
      break;
    }
  }
  if (!contested.length) return [];

  const suggestions = [];
  const seenKeys = new Set();
  sections.forEach((sec) => {
    sec.questions.forEach((q, idx) => {
      const key = flowKey(sec.id, idx);
      if (answers[key] !== undefined) return; // al beantwoord — niet nuttig als "ontbrekend"
      if (seenKeys.has(key)) return;

      for (const [a, b] of contested) {
        const optA = q.options.find((o) => (o.patterns || []).includes(a));
        const optB = q.options.find((o) => (o.patterns || []).includes(b));
        if (optA && optB && optA !== optB) {
          suggestions.push({
            key,
            sectionId: sec.id,
            sectionTitle: sec.title,
            questionText: q.text,
            discriminatesBetween: [a, b],
          });
          seenKeys.add(key);
          break;
        }
      }
    });
  });
  return suggestions;
}
