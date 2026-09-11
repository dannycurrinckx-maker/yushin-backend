# Yushin SaaS (taak #67 t/m #77 — volledige oplevering)

Dit is de multi-tenant SaaS-versie van de Yushin TCM-intaketool op Cloudflare
Worker + D1 + Mollie, gebouwd volgens `../Yushin_SaaS_Architectuur.md`.
Alles hieronder is lokaal geschreven en getest (echte SQLite-engine, echte
productiecode, 38 server-tests + 2 client-tests, zie "Testen" hieronder),
maar nog **niet gedeployed** — dat vereist jouw eigen Cloudflare-account, wat
ik vanuit deze sandbox niet kan/mag doen. Zie "Zelf deployen" hieronder voor
de exacte stappen.

## Status van oplevering (taak #77)

| Onderdeel | Status |
|---|---|
| Architectuur & datamodel | Klaar (`../Yushin_SaaS_Architectuur.md`) |
| Cloudflare Worker + D1-schema | Klaar, lokaal getest |
| Authenticatie | Klaar, getest |
| Multi-tenancy | Klaar, getest |
| Mollie-integratie | Klaar qua logica; **prijzen zijn placeholders** (zie taak #70) — op jouw verzoek geparkeerd, vervang `src/lib/plans.js` vóór een echte klant betaalt |
| Kernlogica (78 vragen, patronen, therapieplan) op de server | Klaar, verbatim geport, getest |
| Nieuwe client | Klaar, getest (met een gedocumenteerde lacune, zie "Testen") |
| Beheerpaneel | Klaar, getest |
| Zelfregistratie/onboarding | Klaar, getest |
| Testreeks | Geconsolideerd, `npm run test:all` |
| Juridische checklist | Diepgaande EU+VS-analyse ontvangen, zie `../Yushin_Global_Legal_Regulatory_Checklist_EU_USA_v2.md` — conclusie: **commerciële release NIET vrijgegeven** voor EU én VS (zie hieronder) |
| Deploy | **Nog te doen door jou** — vereist jouw Cloudflare-account/betaalgegevens |

**⚠️ Juridische status (belangrijk, lees dit voor je live gaat):**
Een uitgebreide, expert-opgestelde juridische/regulatoire analyse
(`../Yushin_Global_Legal_Regulatory_Checklist_EU_USA_v2.md`, opvolger van
`../Yushin_Juridische_Checklist.md`) concludeert expliciet dat commerciële
release **op dit moment niet is vrijgegeven** voor zowel de EU als de VS,
o.a. vanwege mogelijke classificatie als medisch hulpmiddel (EU MDR Rule 11)
resp. clinical decision support software (US FDA), ontbrekende DPIA, en
ontbrekende verwerkersovereenkomst. Vijf kritieke vervolgacties staan met
naam genoemd in dat document (MDR Rule 11-memo, FDA CDS-memo, DPIA, Clinical
Content Register, security-assessment). Dit is geen juridisch advies van mij
— raadpleeg een advocaat/regulatory consultant voordat je live gaat.

**Zelf al in orde gebracht (22 aug 2026), ter voorbereiding op de externe
stappen hierboven:**
- `../Yushin_Clinical_Content_Register_v1.xlsx` — de 78 vragen en 161
  patroon-/therapieplanregels gestructureerd volgens §11.1 van het
  EU-masterdossier, met wat automatisch afleidbaar was al ingevuld en de
  rest duidelijk geel gemarkeerd als "nog in te vullen" (rationale,
  reviewer, testcases, release-status).
- `../Yushin_IP_Audit_en_Retentiematrix_v1.xlsx` — voorlopige
  IP-classificatie per patroon (§18.1) + een concept-retentiematrix
  (§8), met expliciete open vragen die enkel Danny kan beantwoorden.
- `../Yushin_Technisch_Bewijs_Beveiliging_v1.docx` — koppelt de 38
  server-tests + 2 client-tests aan de security-baseline-tabel uit §9,
  en zegt eerlijk welke controles (MFA, rate limiting, externe pentest)
  nog ontbreken.
- `../Yushin_Concept_DPA_Privacyverklaring_SaaS_Voorwaarden_v1.docx` —
  niet-bindende conceptteksten opgebouwd uit reeds genomen beslissingen
  in §6-7-13-14, met expliciete "[JURIST VULT AAN]"-markeringen waar
  het masterdossier zelf al zei dat een jurist dit moet afronden
  (aansprakelijkheid, termijnen, toepasselijk recht).

**Bewust nog open blijvend, en waarom dat oké is voor nu:**
- De prijzen/plannen liggen niet vast (jouw beslissing, zie
  `Yushin_SaaS_Architectuur.md` sectie 8) — `src/lib/plans.js` bevat
  duidelijk gemarkeerde placeholder-bedragen.
- Toegangsblokkade bij een mislukte/opgezegde betaling (`past_due`/`canceled`)
  is nog niet in de router afgedwongen — hangt samen met bovenstaand punt,
  zie taak #74 in de sectielijst hieronder.
- Frans (taak #40) staat nog open, bewust uitgesteld tot na EN-review.
- Spraak, PDF-export, het instellingenpaneel en de vervolgconsult-vergelijking
  uit de oude client-side tool zijn nog niet teruggebouwd op de nieuwe
  client/server-architectuur (taak #72) — kan incrementeel later.

## Wat werkt al

- `GET /api/health` — echte werkende route, geeft `{ok: true}` terug.
- Router met multi-tenancy-hooks: elke route die authenticatie vereist,
  weigert correct zonder geldig sessietoken (401); owner-only routes ook (403
  zodra er wel een token is maar de rol niet klopt).
- Wachtwoord-hashing (PBKDF2 via Web Crypto, OWASP-conform) — getest, werkt.
- D1-schema (`migrations/0001_init.sql`, `0002_password_reset.sql`) —
  gevalideerd tegen een lokale SQLite, inclusief foreign keys en
  CHECK-constraints.
- **Authenticatie (taak #68) — volledig werkend en getest** (`src/routes/auth.js`):
  registreren (nieuwe praktijk + eigenaar-account), inloggen, uitloggen,
  wachtwoord-reset aanvragen + effectief resetten. 8 geautomatiseerde tests
  in `tests/auth.test.js`, draaien tegen een echte SQLite-engine
  (`node:sqlite`) met het echte migratieschema — zie `npm test`.
  - Enige ontbrekende stukje: het **versturen** van de reset-e-mail. Dat
    vereist een aparte e-maildienst (bv. Resend/Postmark) met een eigen
    API-key — de token-logica zelf is al af, enkel de bezorging niet.
- **Multi-tenancy (taak #69) — expliciet getest, met een extra waarborg**
  (`src/lib/db.js`, `tests/multi-tenancy.test.js`, 4 tests):
  - Bewezen: patiëntsessies van praktijk A zijn onzichtbaar voor praktijk B,
    ook als B het (geraden/gelekte) session-ID van A kent.
    `getPatientSession` geeft dan gewoon `null` terug in plaats van de data
    van de andere praktijk.
  - Bewezen: gebruikerslijsten (`listUsersForOrganization`) bevatten nooit
    accounts van een andere organisatie.
  - Nieuwe waarborg toegevoegd: `assertUserBelongsToOrganization(db, userId,
    organizationId)` — een centrale guard die controleert of een therapeut
    écht bij de opgegeven praktijk hoort. `savePatientSession` roept dit nu
    zelf aan vóór het schrijven, dus een bug ergens hogerop (verkeerd
    organizationId doorgegeven) kan nooit meer stil data aan de verkeerde
    praktijk koppelen — de database-laag weigert het expliciet met een
    duidelijke fout.
  - Belangrijk voor later (taken #71/#73): elke nieuwe route die
    patiëntdata/gebruikers opvraagt of schrijft, moet `ctx.session.organizationId`
    gebruiken (nooit een ID uit de request body/query) — dat principe staat
    ook als TODO-comment in `src/routes/admin.js` en `flow.js`.

- **Mollie-integratie / abonnementen (taak #70) — volledig werkend en getest**
  (`src/routes/billing.js`, `src/lib/mollie.js`, `src/lib/plans.js`, 6 tests
  in `tests/billing.test.js`): eigenaar start een checkout (`POST
  /api/billing/checkout`, enkel toegankelijk voor `role=owner`), Mollie-klant
  wordt aangemaakt/hergebruikt, een "eerste betaling" vestigt het
  incasso-mandaat. Na succesvolle betaling verwerkt de webhook (`POST
  /api/billing/webhook`, zonder auth — Mollie kan geen sessietoken
  meesturen) dit en maakt het echte terugkerende abonnement aan; een
  mislukte terugkerende afschrijving zet de organisatie op `past_due`.
  - **Kernwaarborg, expliciet getest:** het te betalen bedrag komt altijd uit
    de server-side plannentabel (`src/lib/plans.js`), nooit van de client —
    een test stuurt bewust een gemanipuleerd bedrag mee en bevestigt dat dit
    genegeerd wordt.
  - ⚠️ **PLACEHOLDER-PRIJZEN**: `src/lib/plans.js` bevat nu testprijzen
    (Solo €29/maand, Team €59/maand) zodat de betaalflow end-to-end getest
    kon worden. Dit was expliciet nog een open beslissing in
    `Yushin_SaaS_Architectuur.md` — **vervang deze bedragen voor er ooit een
    echte klant mee betaalt.**
  - Getest met een neppe `fetch` in plaats van een echte Mollie-API-call (er
    is hier geen netwerktoegang tot Mollie en geen echte API-key) — de
    productielogica zelf is ongewijzigd, enkel het netwerkantwoord is
    gesimuleerd. Vóór een echte livegang: minstens één keer handmatig
    doorlopen met een echte (test-mode) Mollie-API-key.

- **Kernlogica op de server (taak #71) — volledig werkend en getest**
  (`src/lib/flowEngine.js`, `sectionsNl.js`, `sectionsEn.js`,
  `therapyPlanData.js`, `src/routes/flow.js`, 8 tests in `tests/flow.test.js`):
  de volledige TCM 10+2-anamnese (78 vragen × NL/EN, gating/skip-logica,
  patroon-score-opbouw, orgaanklok-highlights, en de 161 door Danny
  klinisch gecontroleerde therapieplan-patronen) draait nu op de server,
  geport 1-op-1 vanuit de client-side tool — de vraag/antwoord- en
  therapieplan-data is **verbatim** overgenomen (byte-exact geknipt uit
  `extracted.js`, niet herschreven), zodat er geen risico is op fouten in
  medische inhoud.
  - **Architectuur**: de server is stateless tussen requests. De client
    stuurt bij elke aanroep de volledige stand van zaken mee ({lang,
    context, answers}); de server herberekent alles vanaf nul — hetzelfde
    patroon als het bestaande "Vorige vraag"-mechanisme.
  - **Routewijziging t.o.v. het oorspronkelijke schema**: `/api/flow/next`
    en `/api/flow/result` staan nu op **POST** (niet GET), omdat beide een
    JSON-body nodig hebben.
  - **Dataminimalisatie, nu ook server-side afgedwongen**: onderbouwing
    (welk antwoord tot welk patroon leidde) en het therapieplan-voorstel
    worden voor een patiënt-sessie nooit in de response opgenomen — dit was
    voorheen enkel een UI-keuze, nu een echte server-side filtering.
  - De vier "intro"-vragen (taal, rol, geslacht, pediatrisch) horen bewust
    NIET bij deze routes — die blijven client-side (taak #72) en hun
    resultaat wordt als `context` meegestuurd.
  - Elke afgeronde sessie wordt gepersisteerd via `savePatientSession`,
    altijd gescoped op de ingelogde therapeut/organisatie (multi-tenancy,
    taak #69) — nooit op basis van een ID uit de request body.

- **Nieuwe client (taak #72) — werkend, getest tegen de echte server-routes**
  (`client/index.html`, `strings.js`, `organClock.js`, `app.js`,
  `styles.css`): een nieuwe, single-purpose webclient die uitsluitend met de
  server-API praat — er leeft hier GEEN vraag/antwoorddata of scoring-logica
  meer, enkel UI. Dekt: inloggen/registreren, de vier intro-stappen (taal,
  rol, geslacht, pediatrisch — puur UI, geen klinische data), de volledige
  vraag-voor-vraag interviewweergave via `/api/flow/next` +
  `/api/flow/answer`, en het resultatenscherm (patroonkaarten, orgaanklok,
  therapieplan) via `/api/flow/result`.
  - `strings.js` en `organClock.js` zijn **verbatim** overgenomen uit de
    oorspronkelijke client-side tool (dezelfde herkomst-garantie als de
    servervragen/therapieplan-data in taak #71) — dus de volledige,
    al-vertaalde NL/EN-teksten en de bestaande orgaanklok-SVG-rendering
    blijven behouden.
  - **Getest op twee niveaus**, beide via `node`, zonder browser (er is in
    deze sandbox geen npm-registrytoegang, dus `wrangler dev` kan hier niet
    draaien — zie hieronder):
    1. `client/smoke-test.mjs` — een minimale eigen DOM-shim die bevestigt
       dat de app foutloos laadt, het auth-scherm en de volledige
       intro-flow correct rendert, en een onbereikbare server netjes opvangt
       (geen crash).
    2. `client/integration-test.mjs` — dezelfde DOM-shim, maar met `fetch`
       doorgestubt naar de ECHTE Worker-router (`src/index.js`) tegen een
       echte SQLite-gebaseerde D1 (`tests/fake-d1.js`): de client doorloopt
       zo de volledige 78-vragen-anamnese via de daadwerkelijke
       auth/flow-routes en komt uit op een correct gerenderd
       resultatenscherm, inclusief therapieplan. Dit is de sterkste
       geautomatiseerde garantie die hier mogelijk is dat client en server
       elkaars contract kloppen.
  - Uitvoeren: `node client/smoke-test.mjs` en `node client/integration-test.mjs`
    vanuit de `yushin-saas`-map.
  - **Bewust nog niet meegenomen** t.o.v. de oude client-side tool (kan
    incrementeel bovenop dezelfde API teruggebouwd worden): spraak/voorlezen,
    PDF-export, het instellingenpaneel (secties aan/uit), de "Vorige
    vraag"-knop, en de vervolgconsult-vergelijking.
  - **Nog niet getest**: een echte browser tegen een echt draaiende
    `wrangler dev` — dat vereist dat jij zelf `npm install` +
    `wrangler dev` draait (zie "Zelf deployen" hierboven) en de
    `client/index.html` opent (of serveert) met het juiste server-adres
    ingevuld.

- **Beheerpaneel (taak #73) — volledig werkend en getest**
  (`src/routes/admin.js`, `migrations/0003_user_deactivation.sql`, 8 tests
  in `tests/admin.test.js`, plus een aangepaste multi-tenancy-test): de
  praktijkeigenaar (`role === "owner"`) kan collega's uitnodigen en
  verwijderen, altijd gescoped op de eigen organisatie.
  - `GET /api/admin/users` — ledenlijst van de eigen praktijk.
  - `POST /api/admin/users` — nieuw lid aanmaken (naam, e-mail, wachtwoord,
    rol `owner`/`therapist`); het e-mailadres moet platform-breed uniek zijn
    (zelfde regel als bij registratie).
  - `DELETE /api/admin/users?userId=...` — een lid **deactiveren** (geen
    hard `DELETE`!). `userId` gaat bewust als query-parameter mee, niet in
    een DELETE-body — dat vermijdt de klasse bugs die taak #71 al blootlegde
    (een Request-body kan maar één keer gelezen worden).
  - **Bewuste ontwerpkeuze — deactiveren i.p.v. hard verwijderen**:
    `patient_sessions.therapist_id` verwijst met `ON DELETE CASCADE` naar
    `users.id` (zie `migrations/0001_init.sql`). Een therapeut-account hard
    verwijderen zou dus stilzwijgend ALLE historische patiëntsessies van die
    therapeut meeslepen. In plaats daarvan voegt
    `migrations/0003_user_deactivation.sql` een `is_active`-kolom toe:
    "verwijderen" zet dit op `false`, met behoud van de patiëntdata.
  - Een gedeactiveerd account kan niet meer inloggen (`403`, met duidelijke
    melding), en elke nog geldige sessietoken van dat account wordt meteen
    ingetrokken (`deleteAllAuthSessionsForUser`) — plus een extra
    defensie-in-diepte-check (`AND users.is_active = 1`) in
    `getAuthSession` zelf, zodat dit nooit van één enkele plek afhangt.
  - **Waarborg tegen jezelf buitensluiten**: de laatste actieve `owner` van
    een organisatie kan niet verwijderd worden (`400`) — anders zou een
    praktijk zichzelf onbeheerbaar kunnen maken.
  - Multi-tenancy (taak #69) geldt hier onverkort: een owner kan enkel leden
    van de EIGEN organisatie zien/uitnodigen/verwijderen — geverifieerd met
    een expliciete cross-org-test (probeert het account van een andere
    praktijk te verwijderen via het eigen token → `404`, nooit een stille
    no-op of, erger, succes).
  - **Client-kant**: `client/app.js` heeft nu een "Team beheren"-scherm
    (enkel zichtbaar/bereikbaar voor `role === "owner"`, via een knop in de
    topbalk) met een uitnodigingsformulier en een ledenlijst met
    actief/gedeactiveerd-status en een verwijderknop per (nog actief) lid.
    Dit scherm zelf is **nog niet** meegenomen in
    `client/smoke-test.mjs`/`integration-test.mjs` (die dekken enkel de
    patiënt-intakeflow) — het praat via dezelfde `api()`-helper en hetzelfde
    `el()`-renderpatroon als de rest van de client, dus het risico is beperkt,
    maar dit is een eerlijke, expliciete lacune.
  - ⚠️ **Migratiescript-kanttekening**: `npm run db:migrate:remote` voert nu
    alle drie de migratiebestanden na elkaar uit. Dat werkt probleemloos op
    een VERSE database. Als 0001/0002 al eerder op een bestaande remote D1
    zijn toegepast, is opnieuw uitvoeren van 0001/0002 onschadelijk
    (`CREATE TABLE IF NOT EXISTS`), maar `0003`'s `ALTER TABLE ADD COLUMN`
    zou dan een fout geven als je het per ongeluk twee keer draait. Dit
    project heeft (bewust, om afhankelijkheden op nul te houden) geen
    migratie-trackingtabel — voer bij een bestaande database dus enkel het
    NIEUWE migratiebestand handmatig uit, niet de hele reeks opnieuw.

- **Zelfregistratie/onboarding-flow (taak #74) — volledig werkend en getest**
  (`src/routes/organization.js`, 4 tests in `tests/organization.test.js`):
  zelfregistratie zelf bestond al sinds taak #68 (`POST /api/auth/register`
  + het registratiescherm in de client) — een nieuwe praktijk start meteen in
  `subscription_status = 'trialing'`, zonder dat er iets met Mollie hoeft te
  gebeuren. Wat deze taak toevoegt is de eerste-keer-ervaring ERNA:
  - Nieuwe route `GET /api/organization` — geeft naam, plan-sleutel en
    abonnementstatus van de EIGEN organisatie terug (`ctx.session.organizationId`,
    multi-tenancy zoals overal), toegankelijk voor élk ingelogd lid (niet
    enkel de owner) — bewust géén bedragen/prijzen in deze response, dat
    blijft een apart, nog openstaand onderwerp (zie `src/lib/plans.js`,
    en de instructie om Mollie/prijzen voorlopig te parkeren).
  - **Client-kant**: direct na een NIEUWE registratie (niet na een gewone
    login) toont `client/app.js` nu eerst een welkomstscherm
    ("Welkom bij Yushin, ⟨naam⟩!") met twee vervolgstappen: meteen een eerste
    anamnese starten, of eerst collega's uitnodigen via het beheerpaneel
    (taak #73). Zo landt een gloednieuwe praktijk niet zomaar midden in de
    vragenlijst-flow zonder enig kader.
  - Een kleine "Proefperiode"-badge in de topbalk (zichtbaar zodra
    `subscriptionStatus === "trialing"`, wat voor elke nieuwe praktijk het
    geval is totdat er ooit een betaalstatus bijkomt) — opnieuw bewust zonder
    prijs erbij.
  - **Nog niet meegenomen (bewust, hangt samen met de parkering van
    Mollie/prijzen)**: het architectuurdocument noemt expliciet dat toegang
    geblokkeerd moet worden bij `past_due`/`canceled` (zie
    `Yushin_SaaS_Architectuur.md`, sectie 6.3). Die toegangsblokkade is nog
    NERGENS in de router afgedwongen — dit is een bewuste, met opzet
    onafgewerkte plek, niet iets dat ik over het hoofd heb gezien: zodra de
    prijzen/plannen wél vastliggen (taak #70's placeholder-waarschuwing),
    hoort deze toegangscontrole er in één moeite mee bij.

## Testen (taak #75)

Elke server-taak (#68 t/m #74) kreeg zijn eigen testbestand terwijl die taak
gebouwd werd — geen los "schrijf nu tests"-project achteraf, maar
meegegroeid, met steeds dezelfde opzet: een echte SQLite-engine
(`tests/fake-d1.js`) met het echte migratieschema, en de ECHTE productiecode
(router + `db.js`) — geen losse mocks die de logica dupliceren. Taak #75
("testreeks herbouwen") betekende in de praktijk vooral: dit consolideren
tot één overzichtelijke, herhaalbare aanroep — zie hieronder.

**Volledige testreeks in één keer draaien:**

```bash
npm run test:all      # server (38 tests) + beide client-tests
```

Of afzonderlijk:

| Commando | Wat het test | Tests |
|---|---|---|
| `npm test` | Alle serverroutes + `lib/`-logica, tegen echte SQLite | 38 |
| `node client/smoke-test.mjs` | Client laadt/rendert foutloos (DOM-shim, geen echte server) | — |
| `node client/integration-test.mjs` | Client tegen de ECHTE router + D1 (volledige 78-vragen-flow) | — |

Server-testbestanden (`tests/*.test.js`, elk gekoppeld aan de taak die het
dekt): `auth.test.js` (#68), `multi-tenancy.test.js` (#69), `billing.test.js`
(#70), `flow.test.js` (#71), `admin.test.js` (#73), `organization.test.js`
(#74).

**Bewuste keuze — geen aparte unit-tests voor triviale helpers**
(`src/lib/http.js`'s `jsonResponse`/`readJsonBody`, `src/lib/plans.js`'s
`getPlan`): die worden al impliciet op elke regel geraakt door de
router-niveau-tests hierboven. Losse tests daarvoor zouden enkel het
testaantal opblazen zonder extra zekerheid.

**Nog niet geautomatiseerd getest** (bewust, zie de betreffende taken
hierboven voor waarom): het beheerpaneel-scherm en het onboarding-scherm in
de client (taken #73/#74) zelf — enkel de bijbehorende serverroutes zijn
volledig getest. Een echte browser tegen een echt draaiende `wrangler dev`
kan in deze sandbox niet (zie "Zelf deployen").

## Zelf deployen (wanneer je zover bent)

**Update 22 aug 2026 — D1-database staat al klaar.** Via de gekoppelde
Cloudflare-connector is de echte D1-database `yushin-db` al aangemaakt
(regio West-Europa/Amsterdam) en zijn alle drie migraties er al op
uitgevoerd. `wrangler.toml` bevat hierboven al de echte `database_id` —
daar hoef je zelf niets meer aan te passen.

**Wat ik bewust NIET heb gedaan en ook niet zal doen:** de Mollie API-key
en de `SESSION_SECRET` invullen. Dit zijn geheimen/inloggegevens — die vul
ik principieel nooit zelf in, ook niet als erom gevraagd wordt (zie ook
`wrangler.toml`: "NIET hier invullen, wel via CLI zetten"). Jij voert dit
zelf uit met `npx wrangler secret put MOLLIE_API_KEY`, wat je key vraagt
via een prompt die nergens wordt gelogd of opgeslagen door mij.

Vereist een Cloudflare-account en de `wrangler` CLI. De volledige
projectmap staat als `yushin-saas-v3.zip` klaar (met de al ingevulde
database_id) — pak die uit en volg de resterende stappen hieronder.

```bash
cd yushin-saas
npm install          # installeert wrangler
npx wrangler login   # opent een browser om in te loggen op jouw account

# D1-database aanmaken
npx wrangler d1 create yushin-db
# -> kopieer de "database_id" uit de output naar wrangler.toml

# Schema toepassen
npm run db:migrate:remote

# Geheimen instellen (nooit in wrangler.toml zetten!)
npx wrangler secret put MOLLIE_API_KEY
npx wrangler secret put SESSION_SECRET

# Lokaal testen
npm run dev

# Live zetten
npm run deploy
```

## Projectstructuur

```
yushin-saas/
  wrangler.toml            Cloudflare-configuratie (D1-binding, env-vars)
  package.json
  migrations/
    0001_init.sql             Databaseschema
    0002_password_reset.sql     Wachtwoord-reset-tokens (taak #68)
    0003_user_deactivation.sql    users.is_active — "verwijderen" = deactiveren (taak #73)
  src/
    index.js                 Router + auth-middleware
    lib/
      db.js                  D1-helpers (altijd org-gescoped)
      auth.js                 Wachtwoord-hashing + sessietokens
      mollie.js                Mollie API-wrapper
      plans.js                  Server-side abonnementsplannen + prijzen
      http.js                   Kleine response-helpers
      validation.js              Dependency-vrije input-validatie
      flowEngine.js                Vraag-flow-kernlogica (gating, scoring, therapieplan-lookup)
      sectionsNl.js                 78 anamnese-vragen, NL (verbatim geport)
      sectionsEn.js                  78 anamnese-vragen, EN (verbatim geport)
      therapyPlanData.js              161 therapieplan-patronen (verbatim geport)
    routes/
      auth.js, flow.js, billing.js, admin.js, organization.js    (allemaal volledig werkend)
  client/
    index.html                Client-entrypoint (taak #72)
    strings.js                  i18n-teksten NL/EN/(FR), verbatim geport
    organClock.js                 Orgaanklok-data + SVG-rendering, verbatim geport
    styles.css                      Yushin-huisstijl
    app.js                            Applicatielogica (auth, intro, interview, resultaat, beheerpaneel)
    smoke-test.mjs                      DOM-shim smoke-test (geen browser nodig)
    integration-test.mjs                  Client tegen de ECHTE serverroutes
  tests/
    fake-d1.js                D1-shim bovenop node:sqlite (echte migraties + echte productiecode)
    auth.test.js                 Taak #68
    multi-tenancy.test.js          Taak #69
    billing.test.js                  Taak #70
    flow.test.js                       Taak #71
    admin.test.js                        Taak #73
    organization.test.js                   Taak #74
```
