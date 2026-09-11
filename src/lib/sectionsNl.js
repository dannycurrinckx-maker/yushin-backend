// Vraag/antwoorddata voor de TCM 10+2 anamnese — Nederlandse basisversie.
// Verbatim overgenomen uit de client-side tool (tcm_10plus2_chatbot.html /
// extracted.js, const SECTIONS) voor taak #71 (kernlogica naar de server).
// GEEN inhoudelijke wijzigingen — enkel de declaratie is aangepast naar een
// ES-module export. Structuur per sectie: {id, title, intro?, onlyIf?,
// therapistOnly?, questions:[{text, requires?, options:[{label, patterns,
// gate?, clockSeg?}]}]}.

// MDR-veilig-lanceren (04/09, launch-blocker): de sectie "s0safety" (13
// alarmsymptomen) stond hier voorheen als interactieve vragenreeks — elk
// antwoord kon via `redFlag:"..."` een automatische NOODSIGNAAL/ALARM-melding
// triggeren (Spoor 1.4, taak #104/#105). Dat is functioneel geautomatiseerde
// medische triage op patiëntantwoorden, wat de niet-medische positionering
// (taak #111) ondergraaft. Beslissing Danny: deze koppeling met `answers` is
// losgemaakt. De inhoud van de checklist is NIET verdwenen — ze bestaat nu
// als statische, taalbewuste referentielijst (zie redFlagData.js →
// staticSafetyChecklist(), opgehaald via getStaticSafetyChecklist() in
// flowEngine.js en getoond als niet-blokkerend paneel in de client), volledig
// losgekoppeld van welke antwoorden een therapeut/patiënt ook invult.
export const SECTIONS_NL = [
{ id:"s1", title:"1. Koorts en rillingen", intro:"Eerst iets over koorts en rillingen.",
  questions:[
    { text:"Welke combinatie van koorts/rillingen past het best?", options:[
      {label:"Milde koorts + erge rillingen + geen zweten", patterns:["EPF Wind-Koude (WK)"]},
      {label:"Erge koorts + milde rillingen + rood gelaat + dorst", patterns:["EPF Wind-Hitte (WH)"]},
      {label:"Milde koorts + afkeer van wind + spontaan zweten", patterns:["EPF (Wei) Qi xu"]},
      {label:"Koorts en rillingen + zwaarte + pijn + dorst + irritatie", patterns:["EPF Zomerhitte"]},
      {label:"Koorts en rillingen + zwaarte + pijn + vol gevoel in de borst", patterns:["EPF Damp"]},
      {label:"Koorts en rillingen + droge keel + hoest", patterns:["EPF Droogte"]},
      {label:"Geen koorts of rillingen aanwezig", patterns:[]}
    ]}
  ]
},
{ id:"s2", title:"2. Zweten",
  questions:[
    { text:"Extern beeld: is er zweten (of net niet) i.c.m. koorts/rillingen?", options:[
      {label:"Niet zweten + erge rillingen + milde koorts + hoofdpijn", patterns:["EPF Wind-Koude (WK)"], gate:{key:"zweten", value:false}},
      {label:"Zweten + koorts + afkeer van wind", patterns:["EPF Wind"], gate:{key:"zweten", value:true}},
      {label:"Zweten + hoge koorts + hoofdpijn + keelpijn", patterns:["EPF Wind-Hitte (WH)"], gate:{key:"zweten", value:true}},
      {label:"Niet van toepassing", patterns:[]}
    ]},
    { text:"Intern beeld: hoe zou je het zweten omschrijven?", options:[
      {label:"Spontaan zweten overdag + afkeer van koude + vermoeidheid", patterns:["Yang xu"], gate:{key:"zweten", value:true}},
      {label:"Nachtzweten + blos op de wangen + namiddagkoorts", patterns:["Yin xu"], gate:{key:"zweten", value:true}},
      {label:"Overvloedig, continu zweten + rood gelaat + dorst", patterns:["EPF Wind-Hitte (WH)","Interne Hitte"], gate:{key:"zweten", value:true}},
      {label:"Overvloedig koud zweten met parels + koude handen/voeten (acuut)", patterns:["Yang collaps"], gate:{key:"zweten", value:true}},
      {label:"Geen van deze, patiënt zweet niet opvallend", patterns:[], gate:{key:"zweten", value:false}}
    ]},
    { text:"Op welk tijdstip is het zweten het meest uitgesproken?", requires:["zweten"], options:[
      {label:"Overdag", patterns:["Yang xu"]},
      {label:"'s Nachts", patterns:["Yin xu"]},
      {label:"Geen duidelijk tijdstip", patterns:[]}
    ]},
    { text:"Waar op het lichaam zweet de patiënt het meest?", requires:["zweten"], options:[
      {label:"Op het hoofd", patterns:["ST Hitte","Damp-Hitte Middelste Warmer"]},
      {label:"Olieachtig zweet op het voorhoofd", patterns:["Yang collaps"]},
      {label:"Armen en benen", patterns:["ST + SP xu"]},
      {label:"Handen", patterns:["LU Qi xu","Nervositeit"]},
      {label:"Heel het lichaam", patterns:["LU Qi xu"]},
      {label:"5 palmen (handpalmen/voetzolen/borst)", patterns:["Yin xu"]},
      {label:"Geen specifieke lokalisatie", patterns:[]}
    ]}
  ]
},
{ id:"s3", title:"3. Hoofd en lichaam",
  questions:[
    { text:"Heeft de patiënt hoofdpijn? Zo ja, hoe begon deze?", options:[
      {label:"Ja — plots en van korte duur", patterns:["EPF Wind-Koude (WK)"], gate:{key:"hoofdpijn", value:true}},
      {label:"Ja — gradueel en langdurig", patterns:["Interne oorzaak"], gate:{key:"hoofdpijn", value:true}},
      {label:"Nee, geen hoofdpijn", patterns:[], gate:{key:"hoofdpijn", value:false}}
    ]},
    { text:"Hoofdpijn — op welk tijdstip erger?", requires:["hoofdpijn"], options:[
      {label:"Overdag", patterns:["Qi xu of Yang xu"]},
      {label:"'s Nachts", patterns:["Bloed xu of Yin xu"]},
      {label:"Geen duidelijk tijdstip", patterns:[]}
    ]},
    { text:"Hoofdpijn — waar precies?", requires:["hoofdpijn"], options:[
      {label:"Occipitaal (achterhoofd)", patterns:["EPF WK of KI xu"]},
      {label:"Voorhoofd", patterns:["ST Hitte of Bloed xu"]},
      {label:"Temporaal / lateraal", patterns:["EPF WK/WH of LR-GB Vuur"]},
      {label:"Kruin", patterns:["LR Bloed xu"]},
      {label:"Heel het hoofd", patterns:["EPF Wind-Koude (WK)"]},
      {label:"Geen duidelijke lokalisatie", patterns:[]}
    ]},
    { text:"Hoofdpijn — hoe voelt de pijn aan?", requires:["hoofdpijn"], options:[
      {label:"Zwaartegevoel", patterns:["Damp of Flegma"]},
      {label:"Pijn 'zit in' het hoofd", patterns:["KI xu"]},
      {label:"Kloppend, distensiegevoel", patterns:["LR Yang stijgt op"]},
      {label:"Borend, alsof er een nagel in het hoofd zit", patterns:["Bloed stase"]},
      {label:"Geen van deze", patterns:[]}
    ]},
    { text:"Hoofdpijn — wat maakt het erger of beter?", requires:["hoofdpijn"], options:[
      {label:"Erger bij wind/koude", patterns:["EPF"]},
      {label:"Erger bij koude", patterns:["Koude (exces of xu)"]},
      {label:"Erger bij warmte", patterns:["Hitte (exces of xu)"]},
      {label:"Erger bij vermoeidheid, beter bij rust", patterns:["Qi xu"]},
      {label:"Geen duidelijk verband", patterns:[]}
    ]},
    { text:"Heeft de patiënt vertigo/duizeligheid? Zo ja, hoe ernstig?", options:[
      {label:"Ja — ernstige vertigo + evenwichtsverlies", patterns:["Interne Wind"], gate:{key:"vertigo", value:true}},
      {label:"Ja — lichte vertigo + zwaar hoofd", patterns:["Flegma"], gate:{key:"vertigo", value:true}},
      {label:"Ja — lichte vertigo, erger bij vermoeidheid", patterns:["Qi xu"], gate:{key:"vertigo", value:true}},
      {label:"Nee, geen vertigo", patterns:[], gate:{key:"vertigo", value:false}}
    ]},
    { text:"Vertigo — hoe trad dit op?", requires:["vertigo"], options:[
      {label:"Plots", patterns:["Exces-type"]},
      {label:"Gradueel", patterns:["Xu-type (deficiëntie)"]},
      {label:"Onbekend", patterns:[]}
    ]},
    { text:"Pijn over het hele lichaam?", options:[
      {label:"Plots + koude rillingen + koorts", patterns:["EPF Wind-Koude (WK)"]},
      {label:"Algemene pijn + vermoeidheid", patterns:["Qi xu of Bloed xu"]},
      {label:"Bij vrouwen na bevalling — doffe pijn", patterns:["Bloed xu"]},
      {label:"Bij vrouwen na bevalling — scherpe pijn", patterns:["Bloed stase"]},
      {label:"Pijn in armen/schouders bij lopen", patterns:["LR Qi stagnatie"]},
      {label:"Pijn in alle spieren + warm hoofd", patterns:["ST Hitte"]},
      {label:"Pijn + zwaartegevoel", patterns:["Damp in spieren"]},
      {label:"Geen lichaamspijn", patterns:[]}
    ]},
    { text:"Pijn in de gewrichten (Bi-syndroom)?", options:[
      {label:"Verspringt van gewricht naar gewricht", patterns:["Bi-syndroom Wind"]},
      {label:"Vast en zeer pijnlijk", patterns:["Bi-syndroom Koude"]},
      {label:"Vast, met zwelling en doof gevoel", patterns:["Bi-syndroom Damp"]},
      {label:"Geen gewrichtspijn", patterns:[]}
    ]},
    { text:"Pijn in de rug?", options:[
      {label:"Continu, dof", patterns:["KI xu"]},
      {label:"Recent, intens, stijf", patterns:["Bloed stase"]},
      {label:"Intense pijn, erger door koude en vocht", patterns:["EPF Koude en Damp in meridianen"]},
      {label:"Borende pijn + onmogelijk te roteren", patterns:["Bloed stase"]},
      {label:"Pijn met uitstraling naar schouders", patterns:["EPF"]},
      {label:"Geen rugpijn", patterns:[]}
    ]},
    { text:"Doof gevoel in ledematen?", options:[
      {label:"Bilateraal thv armen/benen of handen", patterns:["Bloed xu"]},
      {label:"Unilateraal thv vingers/elleboog/arm", patterns:["Interne Wind en Damp"]},
      {label:"Geen doof gevoel", patterns:[]}
    ]}
  ]
},
{ id:"s4", title:"4. Thorax en abdomen",
  questions:[
    { text:"Thoraxpijn?", options:[
      {label:"Thoraxpijn (algemeen)", patterns:["HT Bloed stase (a.g.v. Yang xu)"]},
      {label:"Thoraxpijn + hoest met geel slijm", patterns:["LU Hitte"]},
      {label:"Distensie/volgevoel thv de hypochondria", patterns:["LR Qi stagnatie"]},
      {label:"Idem, + intense pijn", patterns:["LR Qi stagnatie","LR Bloed stase"]},
      {label:"Geen thoraxpijn", patterns:[]}
    ]},
    { text:"Epigastrische pijn (maagstreek)?", options:[
      {label:"Epigastrische pijn (algemeen)", patterns:["Voedselretentie ST of ST Hitte"]},
      {label:"Zeer doffe, lichte pijn", patterns:["Koude xu in maag"]},
      {label:"Pijn vermindert door eten", patterns:["Xu-type"]},
      {label:"Pijn verergert door eten", patterns:["Exces-type"]},
      {label:"Volheidsgevoel in epigastrium", patterns:["SP xu of Damp"]},
      {label:"Geen epigastrische pijn", patterns:[]}
    ]},
    { text:"Lage abdominale pijn?", options:[
      {label:"Beter na defecatie", patterns:["Exces-type"]},
      {label:"Erger na defecatie", patterns:["Xu-type"]},
      {label:"Lage abdominale pijn (algemeen)", patterns:["Interne Koude / LR Qi stagnatie / LR Bloed stase / Damp-Hitte / Bloed stase in Darmen of Uterus"]},
      {label:"Hypogastrische pijn", patterns:["Damp-Hitte in Blaas","LR Vuur tot aan Blaas"]},
      {label:"Geen abdominale pijn", patterns:[]}
    ]}
  ]
},
{ id:"s5", title:"5. Voedsel en smaak",
  questions:[
    { text:"Reageert de klacht op voedselinname?", options:[
      {label:"Erger door voedselabsorptie", patterns:["Exces-type"]},
      {label:"Beter door voedselabsorptie", patterns:["Xu-type"]},
      {label:"Geen duidelijk verband", patterns:[]}
    ]},
    { text:"Eetlust en voorkeur?", options:[
      {label:"Gebrek aan eetlust", patterns:["SP Qi xu"]},
      {label:"Altijd honger hebben", patterns:["ST Hitte"]},
      {label:"Volheid/distensiegevoel na eten", patterns:["Voedselretentie"]},
      {label:"Voorkeur voor warm voedsel", patterns:["Koude syndroom"]},
      {label:"Voorkeur voor koud voedsel", patterns:["Hitte syndroom"]},
      {label:"Geen bijzonderheden", patterns:[]}
    ]},
    { text:"Is er een afwijkende smaak in de mond?", options:[
      {label:"Bittere smaak (algemeen)", patterns:["Hitte in LR of HT"]},
      {label:"Constant bittere smaak", patterns:["LR Vuur"]},
      {label:"Bittere smaak 's morgens + insomnia", patterns:["HT Vuur"]},
      {label:"Zoete smaak", patterns:["SP xu of Damp-Hitte"]},
      {label:"Zure smaak", patterns:["Voedselretentie / disharmonie LR-ST"]},
      {label:"Zoute smaak", patterns:["KI Yin xu"]},
      {label:"Gebrek aan smaak", patterns:["SP xu"]},
      {label:"Pikante/scherpe smaak", patterns:["LU Hitte"]},
      {label:"Geen afwijkende smaak", patterns:[]}
    ]},
    { text:"Is er braken? Zo ja, hoe?", options:[
      {label:"Zuur braaksel", patterns:["LR valt ST aan"]},
      {label:"Bitter braaksel", patterns:["Hitte in LR en GB"]},
      {label:"Helder en waterig braaksel", patterns:["Koude in ST + vloeistofretentie"]},
      {label:"Braken direct na eten, luid en plots", patterns:["Hitte exces-syndroom"]},
      {label:"Braken direct na eten, traag en stil", patterns:["Lege Hitte"]},
      {label:"Geen braken", patterns:[]}
    ]}
  ]
},
{ id:"s6", title:"6. Stoelgang en urine",
  questions:[
    { text:"Is er constipatie?", options:[
      {label:"Erger na defecatie", patterns:["Xu-type"]},
      {label:"Beter na defecatie", patterns:["Exces-type"]},
      {label:"Acute constipatie + dorst + droog geel tongbeslag", patterns:["Hitte in ST en Darmen"]},
      {label:"Constipatie bij ouderen of na bevalling", patterns:["Bloed xu"]},
      {label:"Constipatie met keutelvormige stoelgang", patterns:["LR Qi stagnatie of Hitte in Darmen"]},
      {label:"Moeilijke defecatie zonder droge stoelgang", patterns:["LR Qi stagnatie"]},
      {label:"Constipatie + abdominale pijn", patterns:["Interne Koude en Yang xu"]},
      {label:"Constipatie + droge ontlasting zonder dorst", patterns:["KI en/of ST Yin xu"]},
      {label:"Afwisselend constipatie en diarree", patterns:["LR valt SP aan"]},
      {label:"Geen constipatie", patterns:[]}
    ]},
    { text:"Is er diarree?", options:[
      {label:"Diarree met pijn", patterns:["LR of Hitte"]},
      {label:"Diarree met vieze geur", patterns:["Hitte"]},
      {label:"Diarree zonder vieze geur", patterns:["Koude"]},
      {label:"Chronische diarree", patterns:["SP Yang xu en/of KI Yang xu"]},
      {label:"Chronische, dagelijkse ochtenddiarree", patterns:["KI Yang xu"]},
      {label:"Diarree + abdominale pijn", patterns:["Interne Koude in darmen"]},
      {label:"Diarree + mucus in ontlasting", patterns:["Damp in darmen"]},
      {label:"Diarree + mucus + bloed", patterns:["Damp-Hitte in darmen"]},
      {label:"Malse (zachte) stoelgang + onverteerd voedsel", patterns:["SP Qi xu"]},
      {label:"Branderig anaal gevoel tijdens defecatie", patterns:["Hitte"]},
      {label:"Niet-malse ontlasting, moeilijk op te houden", patterns:["ST en SP Qi xu, instorting SP Qi"]},
      {label:"Borborygmi (rommelende darmen) + malse stoelgang", patterns:["SP xu"]},
      {label:"Borborygmi + abdominale distensie", patterns:["LR Qi stagnatie"]},
      {label:"Geen diarree", patterns:[]}
    ]},
    { text:"Is er flatulentie?", options:[
      {label:"Flatulentie met vieze geur", patterns:["Damp-Hitte in SP of ST Hitte"]},
      {label:"Flatulentie zonder vieze geur", patterns:["Interne Koude door SP Yang xu"]},
      {label:"Geen flatulentie", patterns:[]}
    ]},
    { text:"Is er bloedverlies bij de stoelgang?", options:[
      {label:"Zwarte, donkere stoelgang", patterns:["Bloed stase"]},
      {label:"Bloed spat eerst naar alle kanten", patterns:["Damp-Hitte in darmen"]},
      {label:"Bloed met pijnlijke anus", patterns:["Bloed hitte"]},
      {label:"Eerst stoelgang, daarna bloed", patterns:["SP Qi xu"]},
      {label:"Geen bloedverlies", patterns:[]}
    ]},
    { text:"Hoe is de mictie (plassen)?", options:[
      {label:"Enuresis of incontinentie", patterns:["KI xu"]},
      {label:"Urineretentie", patterns:["Damp-Hitte in Blaas"]},
      {label:"Moeilijke mictie", patterns:["Damp-Hitte in Blaas of KI xu"]},
      {label:"Frequente en overvloedige mictie", patterns:["KI Yang xu"]},
      {label:"Frequente en weinig overvloedige mictie", patterns:["Qi xu"]},
      {label:"Geen bijzonderheden", patterns:[]}
    ]},
    { text:"Is er pijn bij het plassen?", options:[
      {label:"Pijn vóór het plassen", patterns:["Qi stagnatie in Onderste Warmer"]},
      {label:"Pijn tijdens het plassen", patterns:["Hitte in Blaas"]},
      {label:"Pijn na het plassen", patterns:["Qi xu"]},
      {label:"Geen pijn bij plassen", patterns:[]}
    ]},
    { text:"Welke kleur heeft de urine?", options:[
      {label:"Bleek", patterns:["Koude in Blaas en KI"]},
      {label:"Donker", patterns:["Hitte"]},
      {label:"Troebel en vuil", patterns:["Damp in Blaas"]},
      {label:"Overvloedig, helder, bleek (bij hoge koorts)", patterns:["EPF WH/WK → interne uitputting"]},
      {label:"Normale kleur", patterns:[]}
    ]},
    { text:"Hoeveel urine wordt er geproduceerd?", options:[
      {label:"Veel", patterns:["KI Yang xu"]},
      {label:"Weinig", patterns:["KI Yin xu"]},
      {label:"Normale hoeveelheid", patterns:[]}
    ]}
  ]
},
{ id:"s7", title:"7. Slaap & orgaanklok", intro:"Nu een uitgebreid blok over slaap, gekoppeld aan de klassieke TCM-orgaanklok — het tijdstip waarop klachten optreden geeft vaak een extra aanwijzing.",
  questions:[
    { text:"Is er slapeloosheid (insomnia)?", options:[
      {label:"Moeilijk inslapen, daarna goed slapen", patterns:["HT Bloed xu"]},
      {label:"Frequent wakker worden", patterns:["KI Yin xu"]},
      {label:"Droomverstoorde slaap", patterns:["LR Vuur of HT Vuur"]},
      {label:"Geagiteerde slaap + veel dromen", patterns:["Voedselretentie"]},
      {label:"Zeer vroeg wakker worden", patterns:["GB xu"]},
      {label:"Geen slaapproblemen", patterns:[]}
    ]},
    { text:"Is er overmatige slaperigheid (somnolentie)?", options:[
      {label:"In slaap vallen na het eten", patterns:["SP Qi xu"]},
      {label:"Algemeen slaperig gevoel + zwaarte", patterns:["Damp accumulatie"]},
      {label:"Idem + vertigo", patterns:["Flegma"]},
      {label:"Extreme lethargie + moe + koud gevoel", patterns:["KI Yang xu"]},
      {label:"Geen overmatige slaperigheid", patterns:[]}
    ]},
    { text:"Hoe verloopt het inslapen zelf, tussen 21:00-23:00 (Pericard-tijd)?", options:[
      {label:"Ik val binnen ~20 minuten vlot in slaap", patterns:[]},
      {label:"Ik lig vaak langer dan 30 minuten wakker", patterns:["HT/Pericard Shen-onrust","Yin xu"], clockSeg:"21-23"},
      {label:"Mijn hoofd blijft malen van gedachten", patterns:["LR Qi-stagnatie","Shen-onrust"], clockSeg:"21-23"},
      {label:"Ik voel me al gespannen zodra ik ga slapen", patterns:["LR Qi-stagnatie"], clockSeg:"21-23"}
    ]},
    { text:"Word je 's nachts wakker?", options:[
      {label:"Nooit / zelden", patterns:[], gate:{key:"nachtwaker", value:false}},
      {label:"Soms", patterns:[], gate:{key:"nachtwaker", value:true}},
      {label:"Regelmatig", patterns:["Shen-onrust"], gate:{key:"nachtwaker", value:true}}
    ]},
    { text:"Rond welk tijdstip word je meestal wakker? (orgaanklok)", requires:["nachtwaker"], options:[
      {label:"23:00–01:00 (Galblaas-tijd)", patterns:["GB Qi-stagnatie (besluiteloosheid, Shao Yang)"], clockSeg:"23-01"},
      {label:"01:00–03:00 (Lever-tijd)", patterns:["LR Qi-stagnatie of LR Vuur"], clockSeg:"01-03"},
      {label:"03:00–05:00 (Long-tijd)", patterns:["LU Qi xu","Yin xu"], clockSeg:"03-05"},
      {label:"05:00–07:00 (Dikke Darm-tijd)", patterns:["Dikke Darm disharmonie (eliminatie/loslaten)"], clockSeg:"05-07"},
      {label:"Wisselend, geen vast tijdstip", patterns:[]}
    ]},
    { text:"Lukt het daarna om weer in slaap te vallen?", requires:["nachtwaker"], options:[
      {label:"Ja, onmiddellijk", patterns:[]},
      {label:"Moeilijk", patterns:["Yin xu","HT Bloed xu"]},
      {label:"Nee, ik blijf lang wakker liggen", patterns:["Yin xu","HT Bloed xu","Shen-onrust"]}
    ]},
    { text:"Hoe voel je je 's ochtends bij het wakker worden?", options:[
      {label:"Fris en uitgerust", patterns:[]},
      {label:"Vermoeid", patterns:["SP Qi xu"]},
      {label:"Moeilijk uit bed te komen", patterns:["Yang xu of KI Yang xu"]},
      {label:"Alsof ik helemaal niet geslapen heb", patterns:["KI Qi xu","HT Bloed xu"]}
    ]},
    { text:"Is er een duidelijke namiddagdip in energie?", options:[
      {label:"Nee", patterns:[]},
      {label:"Rond 13 uur (Dunne Darm-tijd)", patterns:["SP Qi xu","Bloed xu"], clockSeg:"13-15"},
      {label:"Rond 15 uur (Blaas-tijd)", patterns:["SP Qi xu","Maag Qi xu"], clockSeg:"15-17"},
      {label:"Elke dag, uitgesproken", patterns:["SP Qi xu","Bloed xu","Maag Qi xu"], clockSeg:["13-15","15-17"]}
    ]},
    { text:"Wanneer ben je over het algemeen het meest vermoeid?", options:[
      {label:"'s Ochtends, moeilijk op gang komen", patterns:["Yang xu of KI Yang xu"]},
      {label:"Rond de middag (9-11u, Milt-tijd)", patterns:["SP Qi xu"], clockSeg:"09-11"},
      {label:"'s Avonds laat", patterns:["Shen-onrust","Yin xu"]},
      {label:"De hele dag door", patterns:["Qi xu (algemeen)"]}
    ]},
    { text:"Hoe zit het met dromen tijdens het slapen?", options:[
      {label:"Bijna nooit / weinig herinnering", patterns:[]},
      {label:"Af en toe", patterns:[]},
      {label:"Heel veel, levendige dromen", patterns:["HT Vuur of LR Vuur","Shen-onrust"]},
      {label:"Regelmatig nachtmerries", patterns:["Shen-onrust","Yin xu"]}
    ]},
    { text:"Is er nachtzweten?", options:[
      {label:"Nee", patterns:[]},
      {label:"Soms", patterns:["Yin xu"]},
      {label:"Vaak", patterns:["Yin xu","Lege Hitte"]}
    ]},
    { text:"Hoe voel je je doorgaans tussen 15:00-17:00 (Blaas-tijd)?", options:[
      {label:"Veel energie", patterns:[]},
      {label:"Vermoeid", patterns:["BL/KI xu"], clockSeg:"15-17"},
      {label:"Dorst", patterns:["KI Yin xu"], clockSeg:"15-17"},
      {label:"Lage rugpijn", patterns:["KI xu"], clockSeg:"15-17"}
    ]},
    { text:"Hoe voel je je doorgaans tussen 17:00-19:00 (Nier-tijd)?", options:[
      {label:"Goed", patterns:[]},
      {label:"Koude voeten", patterns:["KI Yang xu"], clockSeg:"17-19"},
      {label:"Uitgeput", patterns:["KI Qi xu","Jing xu"], clockSeg:"17-19"},
      {label:"Veel plassen", patterns:["KI Yang xu","Jing xu"], clockSeg:"17-19"}
    ]}
  ]
},
{ id:"s8", title:"8. Ogen en oren",
  questions:[
    { text:"Is er tinnitus (oorsuizen)?", options:[
      {label:"Plots begin", patterns:["LR Vuur / LR Wind"]},
      {label:"Gradueel begin", patterns:["KI xu"]},
      {label:"Verergert bij druk op het oor", patterns:["Exces-type"]},
      {label:"Verbetert bij druk op het oor", patterns:["Xu-type"]},
      {label:"Hard, hoog geluid (fluitje)", patterns:["LR Yang / LR Vuur / LR Wind"]},
      {label:"Lage toon (geluid van golven)", patterns:["KI xu"]},
      {label:"Geen tinnitus", patterns:[]}
    ]},
    { text:"Is er doofheid/gehoorverlies?", options:[
      {label:"Plots begin", patterns:["Exces-type"]},
      {label:"Gradueel begin", patterns:["Xu-type"]},
      {label:"Chronische doofheid", patterns:["KI xu / HT Bloed xu / Qi xu / Yang xu"]},
      {label:"Geen gehoorproblemen", patterns:[]}
    ]},
    { text:"Zijn er oogklachten?", options:[
      {label:"Pijn zoals naaldenprikken + rode ogen", patterns:["Toxisch Vuur in HT-meridiaan"]},
      {label:"Rood + pijnlijk + gezwollen", patterns:["EPF Wind-Hitte of LR Vuur"]},
      {label:"Wazig zicht", patterns:["LR Bloed xu"]},
      {label:"Fotofobie (lichtschuwheid)", patterns:["LR Bloed xu"]},
      {label:"Gevoel van druk in de ogen", patterns:["KI Yin xu"]},
      {label:"Droge ogen", patterns:["LR Yin xu en/of KI Yin xu"]},
      {label:"Geen oogklachten", patterns:[]}
    ]}
  ]
},
{ id:"s9", title:"9. Dorst en dranken",
  questions:[
    { text:"Hoe zit het met dorst en drinkgedrag?", options:[
      {label:"Dorst met verlangen naar grote hoeveelheden", patterns:["Hitte exces (eender welk orgaan)"]},
      {label:"Geen dorst", patterns:["Koude thv ST of SP"]},
      {label:"Dorst zonder verlangen naar drinken", patterns:["Damp-Hitte"]},
      {label:"Dorst met verlangen naar kleine slokjes", patterns:["ST of KI Yin xu"]},
      {label:"Voorkeur voor koude dranken", patterns:["Hitte syndroom"]},
      {label:"Voorkeur voor warme dranken", patterns:["Koude syndroom"]},
      {label:"Normaal dorstgevoel", patterns:[]}
    ]}
  ]
},
{ id:"s10", title:"10. Pijn — algemeen",
  questions:[
    { text:"Heeft de patiënt op dit moment ergens pijnklachten die nog verder gekarakteriseerd moeten worden (hoofd/lichaam/buik hierboven al meegenomen)?", options:[
      {label:"Ja, er is nog pijn te karakteriseren", patterns:[], gate:{key:"pijn_algemeen", value:true}},
      {label:"Nee, geen bijkomende pijn", patterns:[], gate:{key:"pijn_algemeen", value:false}}
    ]},
    { text:"Past de pijn eerder bij het 'exces'-type of het 'leegte'-type?", requires:["pijn_algemeen"], options:[
      {label:"Exces-type pijn", patterns:["EPF / Interne Koude of Hitte / Qi- of Bloedstase / Flegma-obstructie / Voedselretentie"]},
      {label:"Leegte-type pijn", patterns:["Qi- en Bloed xu / Jin Ye-uitputting door Yin xu"]},
      {label:"Onduidelijk", patterns:[]}
    ]},
    { text:"Hoe voelt de pijn aan qua karakter/lokalisatie?", requires:["pijn_algemeen"], options:[
      {label:"Distensiegevoel zonder exacte locatie", patterns:["Qi stagnatie"]},
      {label:"Intense, borende pijn met exacte locatie", patterns:["Bloed stase"]},
      {label:"Niet van toepassing", patterns:[]}
    ]},
    { text:"Reageert de pijn op druk?", requires:["pijn_algemeen"], options:[
      {label:"Verlicht door druk", patterns:["Leegte-type"]},
      {label:"Verergert door druk", patterns:["Exces-type"]},
      {label:"Geen effect / onbekend", patterns:[]}
    ]},
    { text:"Reageert de pijn op eten?", requires:["pijn_algemeen"], options:[
      {label:"Verlicht door eten", patterns:["Leegte-type"]},
      {label:"Verergert door eten", patterns:["Exces-type"]},
      {label:"Geen effect / onbekend", patterns:[]}
    ]},
    { text:"Welk type pijn is het?", requires:["pijn_algemeen"], options:[
      {label:"Doffe, langdurige pijn", patterns:["Leegte-type"]},
      {label:"Acute pijn", patterns:["Exces-type"]},
      {label:"Krampachtige pijn", patterns:["Koude-type"]},
      {label:"Branderige pijn", patterns:["Hitte-type"]},
      {label:"Geen van deze", patterns:[]}
    ]},
    { text:"Reageert de pijn op temperatuur?", requires:["pijn_algemeen"], options:[
      {label:"Verlicht door warmte", patterns:["Koude-type"]},
      {label:"Verlicht door koude", patterns:["Hitte-type"]},
      {label:"Geen effect / onbekend", patterns:[]}
    ]},
    { text:"Reageert de pijn op defecatie?", requires:["pijn_algemeen"], options:[
      {label:"Verergert na defecatie", patterns:["Leegte-type","Koude-type"]},
      {label:"Verbetert na defecatie", patterns:["Exces-type","Hitte-type"]},
      {label:"Geen effect / onbekend", patterns:[]}
    ]},
    { text:"Welke houding verlicht de pijn?", requires:["pijn_algemeen"], options:[
      {label:"Liggende houding", patterns:["Leegte-type"]},
      {label:"Zittende houding", patterns:["Exces-type"]},
      {label:"Geen duidelijke voorkeur", patterns:[]}
    ]},
    { text:"Hoe trad de pijn op?", requires:["pijn_algemeen"], options:[
      {label:"Traag, gradueel", patterns:["Leegte-type"]},
      {label:"Plots", patterns:["Exces-type"]},
      {label:"Onbekend", patterns:[]}
    ]},
    { text:"Reageert de pijn op braken?", requires:["pijn_algemeen"], options:[
      {label:"Verergert door braken", patterns:["Leegte-type","Koude-type"]},
      {label:"Verbetert door braken", patterns:["Exces-type","Hitte-type"]},
      {label:"Niet van toepassing", patterns:[]}
    ]},
    { text:"Reageert de pijn op rust/beweging?", requires:["pijn_algemeen"], options:[
      {label:"Beter bij rust", patterns:["Leegte-type"]},
      {label:"Beter bij beweging (maar erger bij koude)", patterns:["Exces-type of Koude-type"]},
      {label:"Erger bij beweging", patterns:["Hitte-type"]},
      {label:"Geen effect / onbekend", patterns:[]}
    ]}
  ]
},
{ id:"s11", title:"11. Gynaecologie", onlyIf:"female",
  questions:[
    { text:"Heeft de patiënt momenteel menstruatie(cyclus)? Zo ja, hoe is die?", options:[
      {label:"Ja — komt altijd te vroeg", patterns:["Bloed hitte of Qi xu"], gate:{key:"menstruatie", value:true}},
      {label:"Ja — komt altijd te laat", patterns:["Bloed xu / Bloed stase / Koude stase"], gate:{key:"menstruatie", value:true}},
      {label:"Ja — onregelmatige cyclus", patterns:["LR Qi stagnatie / LR Bloed stase / SP xu"], gate:{key:"menstruatie", value:true}},
      {label:"Ja — regelmatige cyclus", patterns:[], gate:{key:"menstruatie", value:true}},
      {label:"Nee (zwangerschap, menopauze, of n.v.t.)", patterns:[], gate:{key:"menstruatie", value:false}}
    ]},
    { text:"Hoeveelheid bloedverlies?", requires:["menstruatie"], options:[
      {label:"Overvloedig", patterns:["Bloed Hitte","Qi xu"]},
      {label:"Weinig", patterns:["Bloed xu of Bloed stase / Koude stase"]},
      {label:"Normale hoeveelheid", patterns:[]}
    ]},
    { text:"Kleur van het menstruatiebloed?", requires:["menstruatie"], options:[
      {label:"Donkerrood of helderrood", patterns:["Bloed hitte"]},
      {label:"Bleek", patterns:["Bloed xu"]},
      {label:"Zeer donker", patterns:["Bloed stase of Koude stase"]},
      {label:"Vers bloed (bij lege hitte)", patterns:["Lege hitte door Yin xu"]},
      {label:"Normale kleur", patterns:[]}
    ]},
    { text:"Consistentie van het bloed?", requires:["menstruatie"], options:[
      {label:"Gestold, met klonters", patterns:["Bloed stase of Koude stase"]},
      {label:"Waterig", patterns:["Bloed xu of Yin xu"]},
      {label:"Troebel", patterns:["Bloed hitte / Koude stase"]},
      {label:"Normale consistentie", patterns:[]}
    ]},
    { text:"Is er pijn i.f.v. de menstruatie?", requires:["menstruatie"], options:[
      {label:"Pijn vóór de menstruatie", patterns:["Qi stase / Bloed stase"]},
      {label:"Pijn tijdens de menstruatie", patterns:["Bloed hitte / Koude stase / Bloed stase"]},
      {label:"Pijn na de menstruatie", patterns:["Bloed xu"]},
      {label:"Geen menstruatiepijn", patterns:[]}
    ]},
    { text:"Is er abnormaal vaginaal verlies? Welke kleur?", options:[
      {label:"Wit", patterns:["SP Yang xu / KI Yang xu / EPF Damp-Koude / LR Qi stagnatie"], gate:{key:"afscheiding", value:true}},
      {label:"Geel", patterns:["Damp-Hitte in Onderste Warmer"], gate:{key:"afscheiding", value:true}},
      {label:"Groenachtig", patterns:["Damp-Hitte in LR-meridiaan"], gate:{key:"afscheiding", value:true}},
      {label:"Rood en wit gemengd", patterns:["Damp-Hitte"], gate:{key:"afscheiding", value:true}},
      {label:"Geel + pus + bloed (tijdens menopauze)", patterns:["Toxische Damp-Hitte in uterus"], gate:{key:"afscheiding", value:true}},
      {label:"Geen abnormaal verlies", patterns:[], gate:{key:"afscheiding", value:false}}
    ]},
    { text:"Consistentie van het vaginaal verlies?", requires:["afscheiding"], options:[
      {label:"Waterig", patterns:["Damp-Koude"]},
      {label:"Dik", patterns:["Damp-Hitte"]},
      {label:"Onbekend", patterns:[]}
    ]},
    { text:"Zijn er bijzonderheden rond zwangerschap/bevalling?", options:[
      {label:"Onvruchtbaarheid / steriliteit", patterns:["Bloed xu / KI Jing xu / Damp-Hitte in Onderste Warmer / Bloed stase in uterus"]},
      {label:"Braken tijdens zwangerschap", patterns:["ST xu","Chong Mai xu"]},
      {label:"Miskraam vóór maand 3", patterns:["Bloed xu","KI Jing xu"]},
      {label:"Miskraam na maand 3", patterns:["LR Bloed xu","instorting SP Qi"]},
      {label:"Nausea en ernstige bloeding na bevalling", patterns:["Uitputting Chong Mai"]},
      {label:"Zweten en koorts na bevalling", patterns:["Qi- en Bloed-uitputting"]},
      {label:"Postnatale depressie", patterns:["Bloed xu → HT Bloed xu"]},
      {label:"Geen van deze", patterns:[]}
    ]}
  ]
},
{ id:"s12", title:"12. Pediatrie / voorgeschiedenis geboorte", onlyIf:"pediatric",
  questions:[
    { text:"Waren er schokken/trauma's tijdens de zwangerschap, of gebruik van alcohol, medicatie of tabak?", options:[
      {label:"Ja, shock/trauma tijdens zwangerschap", patterns:["Mogelijke invloed op constitutie"]},
      {label:"Ja, alcohol/medicatie/tabak tijdens zwangerschap", patterns:["Negatieve invloed op gezondheid"]},
      {label:"Nee, geen van beide", patterns:[]}
    ]},
    { text:"Was er een moeilijke geboorte (keizersnede, langdurige bevalling)?", options:[
      {label:"Ja", patterns:["LU-aantasting"]},
      {label:"Nee", patterns:[]}
    ]},
    { text:"Werd het kind te vroeg gespeend?", options:[
      {label:"Ja", patterns:["Voedselretentie en huidziekten"]},
      {label:"Nee / niet van toepassing", patterns:[]}
    ]},
    { text:"Kinderziektes doorgemaakt (kinkhoest, mazelen)?", options:[
      {label:"Ja", patterns:["Verzwakte LU"]},
      {label:"Nee", patterns:[]}
    ]}
  ]
},
{ id:"s13", title:"13. Polsdiagnose", therapistOnly:true,
  questions:[
    { text:"Snelheid van de pols?", options:[
      {label:"Normaal (~4 slagen per ademhaling)", patterns:[]},
      {label:"Snel (Shuo)", patterns:["Hitte"]},
      {label:"Langzaam (Chi)", patterns:["Koude"]}
    ]},
    { text:"Diepte van de pols?", options:[
      {label:"Normaal, op middendruk goed voelbaar", patterns:[]},
      {label:"Oppervlakkig (Fu) — voelbaar bij lichte druk", patterns:["Exterieur-patroon"]},
      {label:"Diep (Chen) — pas voelbaar bij stevige druk", patterns:["Interieur-patroon"]}
    ]},
    { text:"Kracht van de pols?", options:[
      {label:"Normaal, krachtig maar niet hard", patterns:[]},
      {label:"Vol/krachtig (Shi)", patterns:["Exces-patroon (Shi)"]},
      {label:"Leeg/zwak (Xu)", patterns:["Qi xu (algemeen)"]}
    ]},
    { text:"Breedte/vorm van de pols?", options:[
      {label:"Normaal van breedte", patterns:[]},
      {label:"Dun/dradderig (Xi)", patterns:["Bloed xu of Yin xu"]},
      {label:"Breed/glijdend (Hua)", patterns:["Damp of Flegma"]},
      {label:"Gespannen als een snaar (Xian)", patterns:["LR Qi-stagnatie"]}
    ]},
    { text:"Ritme van de pols?", options:[
      {label:"Regelmatig", patterns:[]},
      {label:"Onregelmatig met vaste tussenpozen (Dai)", patterns:["HT Qi xu of Bloed-stase"]},
      {label:"Onregelmatig, wisselend onregelmatig (Cu/Jie)", patterns:["Hitte met stagnatie of HT-disharmonie"]}
    ]},
    { text:"Bijzondere polskwaliteit die opvalt?", options:[
      {label:"Geen bijzondere kwaliteit", patterns:[]},
      {label:"Ruw/schurend (Se)", patterns:["Bloed-stase of Bloed xu"]},
      {label:"Zacht en drijvend (Ru)", patterns:["Qi xu of Damp"]},
      {label:"Vast/verborgen (Fu, diep verscholen)", patterns:["Interne blokkade of hevige Koude"]}
    ]}
  ]
}
];
