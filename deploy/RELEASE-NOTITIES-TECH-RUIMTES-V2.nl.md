> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./RELEASE-NOTITIES-TECH-RUIMTES-V2.uk.md) · **🇳🇱 Nederlands** ([origineel](./RELEASE-NOTITIES-TECH-RUIMTES-V2.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Release-notities — Technische ruimtes v2

**BRON-COMMIT:** zie het bestand `BRON-COMMIT` in het archief (master, /workspace/werkblad-v3). **Niet uitgerold.** Productie is niet
aangeraakt; geen enkel verzoek naar *.tarasevych.com (alle tests liepen lokaal, Chrome met host-mapping naar 127.0.0.1, 0 externe verzoeken).

## Samenvatting
Twee parallelle ruimtes van één account: «Звичайний простір» en «Технічний простір». Wisselen zonder opnieuw aan te melden
(terug naar Звичайний = **pauze**), drie duidelijke termijnen: «На час (до HH:MM)», «До завершення технічного сеансу»,
«До виходу з акаунта на сайті». Uitloggen van de site sluit altijd ook de technische sessie; «Вийти з технічного сеансу» logt nooit uit
van de site; uitloggen in één tabblad laat lange extensie-ontgrendelingen («1 рік», «без обмеження») staan — alleen afmelden van de site of
«Вийти всюди» trekt ze in. Eén beslisfunctie (`shared/ruimte-toegang.ts`) voor site, AI/MCP en extensie; AI-toegang gebruikt dezelfde
drie termijnen. Niet-beschikbare termijnen blijven zichtbaar, uitgegrijsd, met reden. Nieuw venster «Доступ і терміни» (6 tabbladen),
drie uitlogkeuzes met gevolg. Contract: `docs/ontwerp/TECH-RUIMTES-API.md`. Runbooks: `deploy/RUNBOOK-VEILIGE-UITROL.md` §17 en
`deploy/RUNBOOK-TECH-RUIMTES-UI.md`.

## Vlag — standaard UIT
- `tech-ruimtes-v2` (standaard **uit**): uit = exact het oude gedrag (oude menu «Технічний профіль · …», oud activeringsvenster).
- `tech-ruimtes-v2-schaduw` (uit) of env `TECH_RUIMTES_V2_SCHADUW=1`: **schaduwmodus** — gedrag blijft oud, verschillen met de nieuwe
  regel komen in het logboek als `owner.tech.schaduw.verschil` (zie §17.2).

## Migratie
`npm run migrate` voert `0115_tech_ruimtes_v2` uit (idempotent). Controle:
`SELECT sleutel, aan FROM app.feature_flags WHERE sleutel LIKE 'tech-ruimtes-v2%';` → twee rijen, beide `false`.

## Aanzetten (eerst alleen voor de eigenaar)
1. Uitrollen + `npm run migrate`. Er verandert niets.
2. (Aanbevolen) enkele dagen schaduwmodus (§17.2).
3. In de site: accountmenu → «Технічний профіль» → oude technische profiel aanzetten (met bevestiging) → venster «Прапорці» →
   `tech-ruimtes-v2` → «Тест: так» (alleen voor u, tot 03:00 / einde technisch profiel), **of** «Змінити» → hoofdschakelaar aan met
   alleen uw account in de lijst. Alternatief in SQL:
   `UPDATE app.feature_flags SET aan = true, gebruikers = ARRAY['<user-id eigenaar>'] WHERE sleutel = 'tech-ruimtes-v2';`
4. Pagina herladen (Ctrl+F5). Het accountmenu toont nu de wisselknop «Звичайний простір | Технічний простір» en «Доступ і терміни».
   Lopende OUDE activeringen tellen niet meer: technisch opnieuw starten via de wisselknop (vraagt bevestiging).

## Terugdraaien
`UPDATE app.feature_flags SET aan = false, gebruikers = '{}' WHERE sleutel = 'tech-ruimtes-v2';` (of «Тест» uit) → binnen 3 s het oude
gedrag. Tabellen `app.tech_ruimte_*` blijven staan en worden niet gelezen. Vorige archief terugzetten volgens het runbook is ook mogelijk
(migratie 0115 hoeft niet teruggedraaid te worden).

## Integratie (deze release)
- Samengevoegd: `t-backend` (contract, migratie 0115, kern + routes, haken, 58 tests, RUNBOOK §17) en `t-ui` (wisselknop, startvenster,
  «Доступ і терміни», uitlogkeuzes, 33 eenheid + 56 e2e met nepserver). Geen conflicten.
- **Fout 1 (gevonden met de echte E2E, hersteld):** op hub.* vroeg de UI de vlag met `service:'ai'` (techBody vóór het laden van de
  zijbalk) → 401 `OWNER_SESSION_CONTEXT_REQUIRED` → vlag bleef stil UIT voor de hele pagina én werd in sessionStorage als «uit» onthouden.
  Nu: sessiedienst van de host; een fout wordt niet meer onthouden.
- **Fout 2 (hersteld):** een klik op «Технічний простір» vóórdat de technische laag (TechLaag, laadt ná de app) klaar was, ging verloren
  (er gebeurde niets). Nu wordt de vraag 10 s bewaard en bij het laden overgenomen — alleen met de vlag aan.
- Nieuwe echte E2E: `scripts/lokaal-e2e/tech-ruimtes-v2-integratie.mjs` (echte backend + PostgreSQL, echte TOTP-bevestiging in het venster).

## Testresultaten (lokaal, 27.10.2026)
- Typecheck: alleen de bekende 20 fouten (backend/index.ts 10, backend/mail-afzenders.ts 10). `npm run build` geslaagd.
- Nieuw: `tech-ruimtes-v2` 58/58 (echte router + PG), `tech-ruimtes-ui` 36/36.
- Regressie (per bestand): tech-sessies 18/18, tech-tabbladen 36/36, tech-ruimte-pagina 56/56, ai-ruimte 18/18, extensie-ontgrendeling
  82/82 en overige extensie-suites (crypto 19, vergrendeling 114, site 98, ui 83, native 56, profielen 42, …) allemaal groen;
  werkblad-suites 53+69+34+29+37+52 groen. Bekende fouten, identiek op de basis f8c9ed3: extensie-beheer 5/7, ruimte-ai 38/40,
  ssh-ca-beheer 0/1; ssh-ca en ssh-ca-site stoppen ook op de basis met dezelfde fout.
- E2E nepserver (UI-contract): 56/56.
- **E2E echt** (lokale server + PostgreSQL 17, Chrome): **33/33**, twee keer na elkaar groen. Gedekt: vlag uit = oude UI en 409 op
  nieuwe routes; vlag aan: wisselknop; drie termijnen gestart via het venster met echte TOTP-bevestiging; pauze en terug zonder
  bevestiging (bevestigingsrecords gewist); termijn bijtellen (+1 u) en vervangen (15 min); «Доступ і терміни» (6 tabs) en AI-toegang
  met dezelfde termijnen (DB gecontroleerd); drie uitlogkeuzes; «Вийти з технічного сеансу» laat de site-sessie en «1 рік»-ontgrendeling
  staan; tweede tabblad deelt de sessie zonder bevestiging; één tabblad uitloggen laat «1 рік»/«без обмеження» en de sessie
  «до виходу з акаунта на сайті» staan; «Вийти з акаунта на сайті» (met bevestiging) beëindigt site + technisch en trekt ontgrendelingen in;
  «Вийти всюди» leidt naar Безпека → Сесії; rol met plafond 60 min: 5 termijnen uitgegrijsd met reden; NL en 390 px zonder overloop.

## Wat NIET geverifieerd is
- Aanmelden met Google en bevestigen met passkey/Google (lokaal niet mogelijk): de site-sessie is in de DB gezaaid; bevestiging liep
  via een echte TOTP-code in het echte venster (authenticator in de DB gezaaid).
- Uitloggen in één tabblad is aangeroepen met hetzelfde API-verzoek als de client (`logout-current`) via fetch in de pagina; het hub-menu
  zelf heeft alleen «Вийти з цього акаунту» (hele browser).
- «Вийти всюди» zelf (de bevestigde knop op Безпека → Сесії) is niet doorgeklikt; alleen de doorverwijzing.
- Echte browserextensie en echte MCP-client: ontgrendelingen en een MCP-verbinding zijn in de DB gezaaid; MCP-poortgedrag alleen in de
  eenheidstest (58).
- Schaduwmodus alleen in de eenheidstest; adminpagina's met afdwinging (`beheer-alleen-tech`) niet in de browser getest.
- Andere subdomeinen dan hub.* (mail, id, …) niet in de echte E2E; dark modus alleen met de nepserver.
- Geen test tegen productie of de productiedatabase.

## Bekende grenzen
- Pauze geldt per aanmelding (alle tabbladen van die browser-aanmelding samen), niet per tabblad.
- AI-instelling per verbinding wordt per account toegepast; zonder MCP-verbinding is de AI-tab leeg (geen «alle AI»-regel in de UI,
  de API kent wel `*`).
- Kleine cosmetica: het (?)-knopje naast «На час» is op 390 px ovaal in plaats van rond.
