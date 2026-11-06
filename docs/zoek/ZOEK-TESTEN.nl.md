> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./ZOEK-TESTEN.uk.md) · **🇳🇱 Nederlands** ([origineel](./ZOEK-TESTEN.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Zoeken «/zoek» — testen

Stand: 22-10-2026. Alle tests staan in `tests/eenheid/*.test.ts` en worden gestart met `node scripts/eenheidstests.mjs <naamfilter>` met
`DATABASE_URL` (PostgreSQL 16 met toegepaste migraties), `OWNER_EMAIL`, `TOTP_ENCRYPTION_KEY_V1`, `RECOVERY_CODE_PEPPER` en `AUDIT_IP_PEPPER`.
RLS-variant (rol `app`): aanvullend `DATABASE_URL_APP=postgres://mijnruimte_app@…` en `DATABASE_URL_SYSTEM`. Er gaat niets het netwerk op: Google,
GitHub en OCR-engines zijn gemockt (`tests/eenheid/hulp/nep-*.ts`).

| Test | Zone | Wat wordt gecontroleerd | Vereist |
|---|---|---|---|
| `zoek-kern-*` | Z1 | normalisatie (meertalig, transliteratie, spreektaalvarianten), stamvorming, synoniemen (en ongewenste samenvoegingen), rangschikking/percentage (TS ↔ SQL op actuele rijen), `tsquery` zonder operatoren uit invoer, kernisolatie; eigen synthetische set `hulp/zoek-evaluatie-kern.json` (`P@1`, `Hit@3`, `MRR`) | DB |
| `zoek-bronnen-*` | Z2 | adapters van elke bron op voorbeeldrijen, UI-catalogus (actualiteit van het gegenereerde bestand, toegang `iedereen/profiel/technisch`), wachtrij (claimtijd, herhalingen, onomkeerbare fouten), bronstatus, `kluisStand`, maskeren van geheimen | DB, nabootsingen Google/GitHub |
| `zoek-tekst-*` / `zoek-ocr-*` / `zoek-archief-*` | Z3 | tekstextractie (txt/pdf/docx/xlsx/pptx/html/eml), OCR-plan en cache per gebruiker, archieven (`zip slip`, zip-bom, diepte, limieten, symbolische koppeling), achtergrondproces met tijdslimiet/geheugenlimiet | — |
| `zoek-etap-d-*` / `zoek-ui-*` | Z4 | pagina: toestanden, filters/facetten/paginering vanaf de server, aanvullen ARIA/toetsenbord, geschiedenis op de server (0103), mobiel 360/390, 44 px | DB |
| `zoek-isolatie-20261022` | Z5 | **aanvalsscenario's**: 2 gebruikers × 3 laden via echte routering en sessies; kruising van resultaten/facetten/suggesties/correcties/geschiedenis; `userId` in aanvraag; technisch ↔ persoonlijk; gesloten dienst; verwijderen/ontkoppelen; 18 filteromzeilingen en injecties; geheimen in index/fragmenten/suggesties; logboeken; RLS via directe `SELECT` (rol `app`); OCR-cache/wachtrij; gesloten sleutelkluis | DB (+ rol `app` voor RLS-blok) |
| `zoek-evaluatie-20261022` | Z5 | **kwaliteit**: 82 zoekopdrachten uit `hulp/zoek-evaluatie.json` op een gezaaide index (echte UI-catalogus + 18 bestanden + dezelfde bij gebruiker B + technisch bestand + e-mail met geheim); metrieken `P@k`, `MRR`, `Recall@20` per categorie; drempels `P@5 ≥ 0,80`, `MRR ≥ 0,75`, `Recall@20 ≥ 0,85`, 0 lekken | DB |
| `zoek-prestaties-20261022` | Z5 | 10 000 objecten via `indexeer`: obj./s, zoeken p50/p95 (met/zonder facetten), suggesties, paginering, `EXPLAIN ANALYZE` (of GIN wordt gebruikt); ruwe drempels 1 000/400 ms, doelen 300/100 ms | DB |

## Evaluatieset (`tests/eenheid/hulp/zoek-evaluatie.json`)

Vraagformaat: `{ q, taal, soort, verwacht: [{bron, id} | {bron, titelRegex}], nietVerwacht?: [...], top, opmerking }`.
`bron:'ui'` = elk van `ui/pagina/instelling/hulp`. Categorieën (`soort`): `exact` 8, `typefout` 7, `synoniem` 6, `meertalig` 15 (uk↔nl↔de↔fr↔pl↔ro↔bg),
`translit` 4, spreektaalvarianten 12 («poshta», «налаштування пошти», «де змінити мову», «taal wijzigen», «змінити пароль», «passkey», «вийти з усіх пристроїв»,
«підключити claude», «темна тема», «згорнуті вікна»), `prefix` 5, `doel` 8 (beschrijving van het doel in plaats van de naam), `bijlage` 4 (woorden alleen binnenin
een bijlage), `ocr` 2, `inhoud` 7, `onbereikbaar` 3 (vreemd/technisch item mag niet verschijnen), `geheim` 1.

Metrieken: `P@k = |relevant ∩ top-k| / min(k, |relevant|)` (bij één relevant item — hit@k), `MRR = mean(1/rang van eerste relevante treffer)`,
`Recall@20`. De test print de totaalcijfers, de cijfers per categorie en voor elke mislukte vraag wat er daadwerkelijk in de top-5 stond (zodat direct zichtbaar is waarom).

Een vraag toevoegen: voeg een regel toe in `vragen` (uk/nl-toelichting in `opmerking`); als een nieuw document nodig is, voeg het toe in `zaai.docs` (id `eval-…`; de test maakt zelf
een `-B`-kopie aan voor de tweede gebruiker). Drempels staan in `drempels`.

## Regressie na wijzigingen in zoeken

`beveiliging-review-20261021`, `ruimte-scheiding-20261020`, `ruimte-projecties-20261020`, `zoek-kern-*`, `zoek-bronnen-*`, `zoek-isolatie-*`,
`zoek-evaluatie-*`, plus `tsc -p tsconfig.server.json` en `tsc -p tsconfig.json` (beide).
