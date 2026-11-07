> 🌐 **Taal / Мова:** [Українська](БЕЗПЕКА-ПОШУКУ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Zoeken «/zoek» — isolatie en beveiliging

Stand: 22-10-2026. Gebaseerd op specificatie §9 («kritiek»). Bewijs: aanvalstests in `tests/eenheid/zoek-isolatie-20261022.test.ts`
(twee gebruikers, drie laden, echte router en sessies, live PostgreSQL) en `zoek-evaluatie-20261022.test.ts` (lekcontroles in de evaluatieset).

## 1. Grenzen: de lade, niet de gebruiker

De eenheid van isolatie is de **lade** `{userId, ruimte}` (`shared/ruimte-scheiding.ts`), niet enkel de gebruiker: één persoon heeft een persoonlijke ruimte
(`prive`) en, indien voorzien van een technisch profiel, een afzonderlijke technische ruimte (`technisch`). Een dienst kan in de technische ruimte «gedeeld» zijn
(leest de persoonlijke lade), «eigen» (afzonderlijke technische lade) of «uitgeschakeld/bevroren» (niets). Zoeken **herhaalt het besluit van de poort
van elke dienst**: `projectieLaden(herkomst, DEELBARE_DIENSTEN)` → voor elke bron een eigen lade of een weigering met code en uitleg.
Bronnen zonder dienst (interfacecatalogus: `ui/pagina/instelling/hulp`) liggen in de basislade van het tabblad (`gegevensRuimteVeilig`); technische
interface-objecten (beheerpagina's, root-schakelaars) worden **uitsluitend in de technische lade** geïndexeerd, zodat ze zonder actieve technische
activering zelfs niet in de suggesties zichtbaar zijn.

## 2. Identiteit uitsluitend van de server

- `userId` komt uit de eigenaarssessie (`ownerRequireSession`, cookie + `tabContext`), nooit uit de request-body. Velden als `userId`, `ownerUserId`,
  `lade`, `rechten` en `ruimte` in de request-body worden genegeerd (test «userId in body wordt genegeerd»).
- `ruimte` komt uit de live status van het technisch profiel / de tabbladactivering (`gegevensRuimteVeilig`); een tabblad kan de ruimte alleen **inperken**.
- AI-verzoeken (`site_search` via de connector) doorlopen dezelfde poort met de `aiRuimte` van de grant.

## 3. Autorisatie op databaseniveau (RLS) + expliciete WAAR

- `app.zoek_objecten` (0094), `app.zoek_geschiedenis` (0103), `app.zoek_ocr_tekst` (0102), `app.zoek_wachtrij` / `app.zoek_bron_stand`
  (0096/0100): policy `USING (current_user <> 'mijnruimte_app' OR user_id = app.huidige_gebruiker())` + `WITH CHECK`.
- Elke zoekopdracht van de kern draait onder `alsGebruiker(userId)` (rol `mijnruimte_app`, `set_config('app.user_id')`) **én** bevat
  `user_id = $1 AND ruimte = $2` — dubbel beveiligd, zodat ook de systeemrol (`BYPASSRLS`, cron) nooit laden doorkruist.
- Een directe `SELECT` vanuit de rol `app` met `app.user_id = B` op rijen van A levert 0 rijen op; `UPDATE` → 0; `INSERT` met andermans `user_id` → geweigerd (RLS-test,
  uitgevoerd via `run-test-rls.sh` met `DATABASE_URL_APP`).
- De database kent `ruimte` niet als aparte RLS-policy — dit wordt afgedwongen door de verplichte `ruimte = $2` in de kerncode (gecontroleerd met een test op de SQL-tekst
  in `zoek-kern-*` en gedragsmatig in `zoek-isolatie`).

## 4. Controle vóór schrijven en vóór openen

- `indexeer(lade, objecten)`: een object met `rechten` van een andere lade geeft `ZOEK_LADE_MISMATCH` vóór elke SQL-uitvoering.
- Navigatie vanaf een resultaatkaart gebruikt `route {host, pad, hash?, params?}`: uitsluitend een diensthost van de site, nooit een willekeurige URL; de doelpagina (bericht, bestand,
  afspraak) doorloopt opnieuw haar eigen poort en RLS, zodat een ingetrokken recht daar in 404 resulteert in plaats van oude tekst uit de index te tonen.
- De geschiedenis bewaart alleen `(bron, id)`; bij opnieuw openen worden de id's nogmaals door `/api/owner/zoek` gehaald → vreemde/verdwenen id's
  komen terug als `weg`, zonder titels.

## 5. Verwijderen, ontkoppelen, intrekken

| Gebeurtenis | Wat er gebeurt |
|---|---|
| document verwijderd in de bron | volgende scan: `verwijder(lade, bron, [id])`; OCR-cache van het document: `ocrCacheWissen(sleutel, sha256)` |
| dienst ontkoppeld in de technische ruimte (`ontkoppel`) / bevroren | de poort sluit de lade → de bron wordt direct niet meer doorzocht (nog vóór herindexering) en vermeld in `gesloten`; cron: `verwijderBron` + `niet_gekoppeld` |
| integratie ingetrokken (Google/GitHub) | `koppelFeit` → `verbonden:false` → `verwijderBron`, status `niet_gekoppeld` |
| account geblokkeerd/verwijderd | sessie ongeldig → geen enkele route toegankelijk; rijen blijven onder RLS totdat de eigenaar ze opruimt |
| sleutel van de mens gesloten (sleutelkluis `gesloten`) | achtergrondindexering van post/Drive slaat de lade over met code `KLUIS_GESLOTEN` (leest geen versleutelde data, schrijft niets, zonder 6 nutteloze herhaalpogingen) |

## 6. Geen lekken via suggesties, correcties, facetten, geschiedenis of logs

- Aanvullingen en correcties komen uitsluitend uit `titel_norm`/synoniemen van **de eigen lade** (dezelfde `alsGebruiker` + WAAR); woorden uit het lexicon van een andere
  gebruiker worden nooit voorgesteld (getest met een uniek woord van gebruiker B).
- Facetten en `totaal` worden berekend over exact dezelfde selectie als de zoekresultaten.
- De geschiedenis staat per lade in de database (0103); `localStorage` wordt niet meer gebruikt voor zoekgeschiedenis (voorkomt lekken tussen accounts in dezelfde browser).
- Serverlogs (`console.*`) bevatten tijdens indexeren en zoeken geen titels of teksten van documenten — alleen codes, tellers en duur
  (test onderschept `console`).
- Foutmeldingen van tekstextractie (`fout`) zijn ≤120 tekens lang en bevatten nooit bestandsinhoud.

## 7. Geheimen worden niet geïndexeerd

`shared/geheim-patronen.ts` (`maskeerGeheimen`): PEM-blokken van privésleutels, tokens van GitHub (`ghp_`, `github_pat_` …), AWS, Anthropic,
OpenAI, Slack, Google API, Stripe (`sk_live_`/`sk_test_`), JWT, `Bearer …`, verbindingsstrings met wachtwoord, `password=…`/`пароль: …`,
`api_key=…`, Google-app-wachtwoorden. De waarde wordt vervangen door `[geheim]` **vóór** opslag in `tekst`/`omschrijving`/`trefwoorden`; `extra` bevat
volgens het contract geen geheimen. Zoeken op de waarde van een geheim levert niets op; het fragment en de suggesties tonen het niet. Dezelfde
lijst (het strikte deel) wordt gebruikt door de pre-deploy pakketcontrole (`backend/uitrol-voorcontrole.ts`).

## 8. Filteromzeiling en injecties

- Alle SQL-queries zijn geparametriseerd; `tsquery` wordt opgebouwd uit tokens `[a-z0-9]` en als parameter doorgegeven; `sorteer` komt uitsluitend uit een witte lijst
  (`relevantie|nieuwste|oudest|titel`), `bronnen/soorten/talen/formaten` accepteren alleen waarden uit `ZOEK_BRONNEN`/`ZOEK_SOORTEN`/…, de rest
  wordt genegeerd (`['*']` betekent niet «alles van iedereen», maar «niets extra's»); `pagina`/`perPagina` worden begrensd op 1…/1–100; `q` ≤300 tekens,
  NUL- en stuurtekens worden gestript. 18 aanvallen in de test (`'; DROP`, `) OR 1=1`, `\`, tsquery-operatoren, 10 000 tekens, RTL/zero-width, rommel in
  filters) → 200 of 400, nooit 500, geen enkele vreemde rij, tabel blijft intact.
- Zonder `service` → 403; zonder sessie → 401/403.

## 9. Wat als restrisico overblijft (en waarom dat aanvaardbaar is)

- De systeempool (`getPool('systeem')`, `BYPASSRLS`) wordt door de cron-indexering gebruikt om te schrijven; de bescherming daar bestaat uit expliciete `user_id/ruimte` in
  elke zoekopdracht + `ZOEK_LADE_MISMATCH` in de kern. Lezen voor gebruikersroutes gebeurt altijd onder de rol `app`.
- De index bewaart **platte** tekst van documenten onder RLS (net als de projecties van post en cloud); de DEK van de sleutelkluis beschermt tokens en instellingen,
  niet de rijen zelf. De servereigenaar met databasetoegang ziet de index op dezelfde manier als de projecties. Volledige versleuteling van de index met de sleutel van de mens
  zou zoeken zonder geopende sleutelkluis onmogelijk maken — dit is in deze release bewust niet geïmplementeerd en gedocumenteerd als beperking.
- De oude cache `app.zoek_ocr_cache` (0096, zonder `user_id`) is leeg en wordt niet gebruikt; hij blijft alleen aanwezig voor terugdraaien.
