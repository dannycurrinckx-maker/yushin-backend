// Contradictieparen — Spoor 1.3 van het Verbeterplan (taak #103).
//
// Bron: Danny's ingevuld invuldocument ("Yushin_Fase2_Contradicties_RedFlags_
// Ingevuld.xlsx"), tabblad "1.3 Contradicties". Elke rij daar kreeg een
// klinisch oordeel (Ja/Nee/Aanpassen) + toelichting. Belangrijke
// architectuurkeuze die Danny daar expliciet vastlegde (zie zijn
// "Implementatieregel"-rij onderaan het document):
//
//   Contradicties zijn KLINISCHE REVIEW-SIGNALEN, GEEN automatische
//   uitsluiting. Enkel gebruiken wanneer patronen dezelfde locatie,
//   dimensie en hetzelfde tijdstip beschrijven. Gemengde patronen
//   (bv. gecombineerd Yin/Yang-tekort) moeten mogelijk blijven.
//
// Daarom is dit bewust GEEN "patroon A sluit patroon B uit"-regel, maar een
// lijst van paren die — als ze allebei dominant scoren — een waarschuwing
// tonen aan de therapeut ("controleer dit, mogelijk gemengd beeld of
// tegenstrijdige antwoorden"), nooit een harde blokkade.
//
// tier "conflict"  = Danny's "Ja"-rijen: sterke, letterlijke tegenstelling.
// tier "nuance"     = Danny's "Aanpassen"-rijen: kan samen voorkomen, maar wel
//                      het signaleren waard bij dubbele dominante score.
//
// Zijn "Nee"-rijen (LR Yin xu/LR Yang stijgt op, LU Yin xu/LU Qi xu, SP Yang
// xu zonder tegenhanger, LR Vuur zonder "LR Koude"-patroon, Hitte
// exces-syndroom/Lege hitte door Yin xu) zijn BEWUST NIET opgenomen — hij gaf
// aan dat dit geen contradicties zijn.
//
// Zijn 7 zelf toegevoegde generieke paren (Qi stagnatie/Qi xu, Bloedstase/
// Bloed xu, Damp-Phlegm/Yin-vloeistof xu, Extern/Intern patroon, Biao/Li,
// Volle hitte/Volle koude, Lege hitte/Deficiëntiekoude) zijn nagekeken —
// bron: "Yushin_Fase2_Losse_Eindjes_Aangevuld_Nagekeken.xlsx", tabblad
// "1. Generieke contradicties". Uitkomst, klinisch onderbouwd per paar:
//
//   - Volle hitte/Volle koude EN Lege hitte/Deficiëntiekoude → al gedekt
//     door bestaande concrete paren hierboven (resp. ST Hitte/Koude in ST +
//     vloeistofretentie, en ST Yin xu/Koude xu in maag). Geen nieuwe entry
//     nodig; expliciet NIET veralgemenen naar een globale "alle hitte ↔ alle
//     koude"-regel over andere organen/lagen heen.
//   - Qi stagnatie/Qi xu, Bloedstase/Bloed xu, Damp-Phlegm/Yin-vloeistof xu,
//     Extern/Intern patroon, Biao/Li → bewust NIET gekoppeld. Reden telkens:
//     ofwel geen unieke Yushin-patroonsleutel (Extern/Intern en Biao/Li zijn
//     laagindelingen, geen patroonnamen; "Bloed xu"/"Yin-vloeistof xu" dekken
//     meerdere afzonderlijke sleutels), ofwel kunnen beide leden gewoon
//     samen voorkomen (stagnatie/deficiëntie, stase/deficiëntie) en is een
//     contradictiesignaal daar klinisch niet gepast.
//
// Dit punt is hiermee afgesloten — geen nieuwe generieke paren toegevoegd.

export const CONTRADICTION_PAIRS = [
  // --- Danny's "Ja"-rijen: directe, letterlijke tegenstelling ---
  {
    a: "ST Yin xu",
    b: "Koude xu in maag",
    tier: "conflict",
    note: "Tegengestelde thermische/deficiëntiebeelden van de Maag. Bij beide hoog: koude- versus Yin-xu/hittekenmerken controleren.",
  },
  {
    a: "ST Hitte",
    b: "Koude xu in maag",
    tier: "conflict",
    note: "Maag-hitte versus Maag-koude/deficiëntiekoude. Sterke gelijktijdige score vraagt hercontrole.",
  },
  {
    a: "ST Hitte",
    b: "Koude in ST + vloeistofretentie",
    tier: "conflict",
    note: "Thermisch tegengesteld; mixed presentation mogelijk, dus review.",
  },
  {
    a: "Damp-Hitte",
    b: "Damp-Koude",
    tier: "conflict",
    note: "Damp-Hitte en Damp-Koude verschillen primair in thermische kwaliteit. Markeer als conflict wanneer beide dominant zijn.",
  },
  {
    a: "Hitte in Blaas",
    b: "Koude in Blaas en KI",
    tier: "conflict",
    note: "Blaas-hitte versus Koude in Blaas/KI: thermisch tegengesteld. Bij dubbele score context/ziektefase controleren.",
  },

  // --- Danny's "Aanpassen"-rijen: nuance, mogelijk gemengd beeld ---
  {
    a: "KI Yin xu",
    b: "KI Yang xu",
    tier: "nuance",
    note: "Geen harde contradictie. Kunnen samen voorkomen — signaal 'gemengd Yin/Yang-tekort — herbeoordelen' wanneer beide hoog scoren.",
  },
  {
    a: "Yin xu",
    b: "Yang xu",
    tier: "nuance",
    note: "Als algemene hoofdclassificaties tegengesteld, maar gecombineerde Yin/Yang-deficiëntie bestaat. Waarschuwen bij sterke dubbele score; niet blokkeren.",
  },
  {
    a: "Hitte (exces of xu)",
    b: "Koude (exces of xu)",
    tier: "nuance",
    note: "Te breed als globale regel. Hitte en Koude kunnen in verschillende organen/levels tegelijk voorkomen — enkel binnen hetzelfde klinische domein vergelijken.",
  },
  {
    a: "Hitte-type",
    b: "Koude-type",
    tier: "nuance",
    note: "Alleen als 'type' dezelfde dimensie en casuslaag beschrijft. Niet globaal over verschillende organen toepassen.",
  },
  {
    a: "Hitte syndroom",
    b: "Koude syndroom",
    tier: "nuance",
    note: "Alleen als beide syndromen dezelfde locatie/laag betreffen. Mixed hot/cold presentations bestaan.",
  },
  {
    a: "Exces-patroon (Shi)",
    b: "Xu-type (deficiëntie)",
    tier: "nuance",
    note: "Exces en leegte zijn tegengestelde principes maar kunnen samen voorkomen (root deficiency + branch excess). Toon 'gemengd Xu/Shi', geen fout.",
  },
  {
    a: "Exces-type",
    b: "Leegte-type",
    tier: "nuance",
    note: "Zelfde nuance als Exces-patroon/Xu-type: bruikbaar als mixed-pattern/conflictsignaal, niet als wederzijdse uitsluiting.",
  },
];

// Algemene implementatieregel (Danny's eigen tekst, letterlijk overgenomen)
// — getoond aan de therapeut als context bij elke gemelde contradictie.
export const CONTRADICTION_IMPLEMENTATION_NOTE =
  "Contradicties zijn klinische review-signalen, geen automatische uitsluiting. Enkel sterke conflicten tonen wanneer patronen dezelfde locatie, dimensie en hetzelfde tijdstip beschrijven. Gemengde patronen blijven mogelijk.";
