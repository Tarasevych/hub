> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./ZOEK-BEHEER.uk.md) · **🇳🇱 Nederlands** ([origineel](./ZOEK-BEHEER.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Zoeken «/zoek» — beheer: monitoring, herstel, migraties, uitrol, terugdraaien, prestaties

Stand: 22-10-2026. Voor de BYOS-servereigenaar. Alles draait op de eigen server; geen externe diensten.

## 1. Wat te installeren (BYOS)

| Component | Verplicht? | Waarvoor | Hoe |
|---|---|---|---|
| PostgreSQL 16+ met `pg_trgm`, `unaccent` (contrib) | ja | index, fuzzy zoeken | al vereist door de site; extensies worden aangemaakt door migratie 0093/0100 (`CREATE EXTENSION IF NOT EXISTS`) |
| Node 24 | ja | tekstextractie (pdfjs-dist, officeparser/fflate in `worker_thread`) | al aanwezig |
| `tesseract` (CLI) + traineddata `ukr nld eng rus` | nee (aanbevolen) | OCR van scans/afbeeldingen | `mijn-ruimte-installeer ocr-talen` (installeert pakket en talen in `/srv/mijn-ruimte/ocr/tessdata`) — zie `deploy/installeer-app.sh`; zonder dit pakket is de status «OCR niet beschikbaar» |
| `pdftoppm` (poppler-utils) | nee (aanbevolen) | rasteriseren van PDF-pagina's voor OCR | dezelfde stap; zonder dit hulpmiddel valt het systeem terug op `pdfjs-afbeelding` (langzamer) |

Omgevingsvariabelen (allemaal optioneel; volledig overzicht in `ENV-VARS.md`, sectie «Zoeken»): `ZOEK_TEKST_MAX_BYTES` (25 MiB),
`ZOEK_TEKST_TIMEOUT_MS` (60 000), `ZOEK_TEKST_WERKER_MB` (512), `ZOEK_PDF_MAX_PAGINAS` (500), `ZOEK_OCR_MAX_PAGINAS` (50),
`ZOEK_OCR_MAX_BYTES` (20 MiB), `ZOEK_OCR_PAGINA_TIMEOUT_MS` (45 000), `ZOEK_OCR_PARALLEL` (1), `ZOEK_OCR_ENGINE` (`auto|tesseract-cli|tesseract-js|platform-ai|uit`),
`ZOEK_OCR_TALEN` (`ukr+nld+eng+rus`), `ZOEK_OCR_TALEN_MAP`, `ZOEK_OCR_TESSERACT_PAD`, `ZOEK_OCR_PDFTOPPM_PAD`, `ZOEK_ARCHIEF_MAX_*`,
indexeringlimieten Z2 (`ZOEK_INDEX_*`, zie `backend/zoek/bronnen.ts`). De oude vlag `ZOEK_INDEX=aan` is **verwijderd** — de index staat altijd aan.

## 2. Waar de status te bekijken

- **Op de site**: `/zoek` → paneel «Stand van bronnen» (gekoppeld / indexeert / gedeeltelijk / fout / niet gekoppeld, voortgang, tijdstip van
  laatste succes, laatste fout, aantal objecten — **echte count**, geen schatting).
- **API**: `POST /api/owner/zoek/stand` (eigenaarssessie).
- **Database** (rol `system`):
  ```sql
  SELECT user_id, ruimte, bron, stand, voortgang, documenten, laatste_succes_op, laatste_poging_op, laatste_fout FROM app.zoek_bron_stand ORDER BY laatste_poging_op DESC;
  SELECT status, count(*) FROM app.zoek_wachtrij GROUP BY 1;                       -- wachtrij: wachtend/bezig/klaar/fout/geannuleerd
  SELECT bron, soort, attempts, last_error, run_after FROM app.zoek_wachtrij WHERE status='fout' ORDER BY updated_at DESC LIMIT 50;
  SELECT user_id, ruimte, bron, count(*) FROM app.zoek_objecten GROUP BY 1,2,3;     -- omvang van de index
  SELECT * FROM app.cron_runs WHERE name='zoek-index' ORDER BY started_at DESC LIMIT 10;  -- cron-runs
  ```
- **systemd**: `systemctl status mijn-ruimte-zoek-index.timer`, `journalctl -u mijn-ruimte-cron@zoek-index -n 100`. In het logboek staan alleen codes,
  tellers en duur; **nooit** documenttekst.
- **Serverdiagnostiek** (`admin → Diagnostiek`): controle `zoek` toont de timer, wachtrijlengte, aantal `fout` en aanwezigheid van OCR.

## 3. Veelvoorkomende fouten en herstel

| Symptoom | Oorzaak | Actie |
|---|---|---|
| «Indexeert» verandert urenlang niet | timer draait niet / cron faalt | `systemctl start mijn-ruimte-zoek-index.timer`; `journalctl -u mijn-ruimte-cron@zoek-index`; handmatig starten met `systemctl start mijn-ruimte-cron@zoek-index.service` |
| bron meldt «Fout: GOOGLE_… / GITHUB_…» | ingetrokken token, API-limiet | integratie opnieuw autoriseren op de site; status werkt bij met de volgende cron |
| «OCR niet beschikbaar» | `tesseract`/talen ontbreken | `mijn-ruimte-installeer ocr-talen`; cron controleert beschikbaarheid opnieuw bij de volgende volledige scan |
| wachtrij-items op `fout` met `TIJDSLIMIET`/`GEHEUGENLIMIET` | groot/beschadigd bestand | niets doen nodig: het document wordt alleen op naam geïndexeerd; verhoog zo nodig `ZOEK_TEKST_TIMEOUT_MS`/`ZOEK_TEKST_WERKER_MB` |
| `KLUIS_GESLOTEN` in `laatste_fout` | sleutel van de mens is gesloten (mens niet ingelogd) | normaal: indexeren van post/Drive gaat verder na inloggen |
| zoekopdracht retourneert `bron:'live'` (terugval) | index van de lade is leeg | wacht op cron, klik op «Index vernieuwen» (`POST /api/owner/zoek/bronnen/vernieuwen`) of start handmatige indexering vanuit het technisch profiel (§5) |
| volledige herindexering nodig (wijziging in normalisatie/synoniemen) | nieuwe kernversie | `UPDATE app.zoek_bron_stand SET versie=''` voor de betreffende laden (of `TRUNCATE app.zoek_objecten` — veilig: de index is afgeleide data); de cron bouwt opnieuw op; `app.zoek_geschiedenis.stand` wordt `verouderd` |
| wachtrij «hangt» op `bezig` | proces afgebroken tijdens verwerking | lease van 5 min verloopt vanzelf; item keert terug naar `wachtend` |

De index bestaat uit **afgeleide gegevens**: hij kan volledig worden gewist (`TRUNCATE app.zoek_objecten, app.zoek_wachtrij; UPDATE app.zoek_bron_stand SET versie=''`)
zonder verlies van één enkel bericht of bestand; ook de OCR-cache (`app.zoek_ocr_tekst`) kan worden geleegd (kost alleen een nieuwe OCR-run).

## 4. Migraties (volgorde, idempotentie, terugdraaien)

| Nr. | Bestand | Wat het doet | Terugdraaien |
|---|---|---|---|
| 0093 | `0093_zoek_index.sql` | `app.zoek_objecten` (initieel), `app.zoek_norm` | verouderde basis; niet afzonderlijk terugdraaien |
| 0094 | `0094_zoek_rls.sql` | RLS op `zoek_objecten` | `ALTER TABLE app.zoek_objecten DISABLE ROW LEVEL SECURITY; DROP POLICY zoek_objecten_eigen` (niet aanbevolen) |
| 0096 | `0096_zoek_bronnen_index.sql` | `zoek_document` (verouderd), `zoek_wachtrij`, `zoek_ocr_cache` (oud), `zoek_bron_stand` | `DROP TABLE app.zoek_document, app.zoek_wachtrij, app.zoek_ocr_cache, app.zoek_bron_stand` |
| 0100 | `0100_zoek_kern.sql` (Z1) | één index: nieuwe kolommen, `*_norm` vanuit Node, `zoek_stam`, verwijderen van `app.zoek_norm`, `bron` via regex, `zoek_bron_stand.stand/voortgang/versie`, `zoek_synoniemen_eigenaar` | stapsgewijs in de bestandskop (DROP nieuwe kolommen, terug hernoemen, 0093 opnieuw uitvoeren); `TRUNCATE` is toegestaan — gegevens zijn afgeleid |
| 0101 | `0101_*` (Z2) | indexering/wachtrij (zie bestandskop) | in de bestandskop |
| 0102 | `0102_zoek_ocr_tekst.sql` (Z3) | OCR-cache per gebruiker/ruimte, RLS | `DROP TABLE app.zoek_ocr_tekst` (opnieuw OCR uitvoeren) |
| 0103 | `0103_zoek_geschiedenis.sql` (Z4) | geschiedenis per lade, RLS | `DROP TABLE app.zoek_geschiedenis` |
| 0104 | `0104_zoek_gin_lade.sql` (Z1) | extensie `btree_gin` + samengestelde GIN-indexen `(user_id, ruimte, zoek_vector)` en `(user_id, ruimte, zoek_stam)`: lade én volledige tekst in één index | `DROP INDEX IF EXISTS app.zoek_objecten_lade_vector_idx, app.zoek_objecten_lade_stam_idx` (extensie mag blijven) |

Alle migraties zijn idempotent (`IF NOT EXISTS`, `DROP … IF EXISTS` vóór `ADD CONSTRAINT`) en worden toegepast door `dist-server/migrate.mjs` tijdens
`mijn-ruimte-installeer installeren` **na het maken van een back-up**. Geen enkele migratie wijzigt of verwijdert gegevens uit de bronnen zelf.

## 5. Handmatig indexeren vanuit het technisch profiel (zone D, 22-10-2026)

Waarom: niet wachten op de cron (5 min) en direct zien wat de indexeerder doet — volledige of gedeeltelijke herindexering met live voortgang en resultaat.

**Waar**: `/zoek` → knop «Indexeren…» (alleen zichtbaar wanneer in dit tabblad het technisch profiel actief is; een gewone gebruiker ziet de knop niet en de server
antwoordt `403 ZOEK_INDEX_TECH_PROFIEL_VEREIST`). Er opent een zwevend venster (`src/zoek/ZoekIndexVenster.tsx` op het gedeelde venstersysteem
`src/platform/vensters.tsx`): verslepen aan de titelbalk, «Minimaliseren» naar het dock, «Maximaliseren», sluiten, positie en grootte worden onthouden;
op telefoon (< 560 px) vult het venster het volledige scherm en keert men terug via het dock. `modaal=false`: de zoekpagina blijft bruikbaar terwijl de indexering op de server doorloopt.

**Wat wordt geïndexeerd** — exact wat dit tabblad doorzoekt (`backend/globaal-zoek.ts` → `ladeGroepen`): in een technisch tabblad de technische lade
(interface altijd) plus de persoonlijke lade voor diensten die op «gedeeld» staan; diensten op «eigen gegevens» gebruiken de technische lade. Nooit andere gebruikers:
de wachtrij wordt uitsluitend voor de eigen laden gelezen (`zoekOphalen(…, { userId, ruimtes })`), en tellers komen alleen uit gebeurtenissen van deze persoon.

| Modus | Wat het doet | Hoe |
|---|---|---|
| Volledig | alle bronnen vanaf nul; verdwenen objecten worden verwijderd | waterlijn van de bron wordt gereset (`waterlijn 0`, `volledig_op 0`, voor `ui` — `versie ''`) + stap `volledig` in de wachtrij; de kern slaat ongewijzigde versies over (`overgeslagen`) |
| Gedeeltelijk | geselecteerde bronnen (interface, post, bijlagen, cloud, Drive, agenda, bord, GitHub): zonder datum — **volledig**; met datum «alleen gewijzigd sinds …» — alleen wat na die datum is gewijzigd | stap alleen voor geselecteerde bronnen; zonder datum `waterlijn 0`; met datum `waterlijn = min(huidig, datum)` — terug in de tijd, nooit vooruit, en een bron die nog nooit is gescand (`waterlijn 0`) blijft 0 (anders zouden oudere rijen nooit in de index komen) — `nieuweWaterlijn()`; hetzelfde voor `cursor.externWaterlijn` (ICS/CalDAV); «Bijlagen» = postscan (bijlagen komen voort uit e-mails) |

**Eén indexeerder tegelijk**: dezelfde Postgres advisory lock als de cron (`cron:zoek-index`, `server/cron.ts`, `backend/sleutelkluis-achtergrond.ts`).
Als de lock bezet is (cron/achtergrondronde/handmatige run van iemand anders), **sluit de handmatige run aan** (status `aangesloten`): hij volgt de wachtrij
van de eigen laden en probeert de lock telkens opnieuw; zodra die vrijkomt, verwerkt hij zelf verder.

**Limieten** (ENV, `ENV-VARS.md`): `ZOEK_BEHEER_RUN_MS` (10 min) en `ZOEK_BEHEER_ITEMS` (2000). Daarna wordt de status `tijd`/`limiet` en werkt de cron de rest af.
«Stoppen» stopt na het huidige item + annuleert **geplande scanstappen** van deze laden (`status geannuleerd`, `last_error HANDMATIG_GESTOPT`;
individuele bijlage-/inhoudstaken blijven staan — de cron werkt die zelf af en plant scanstappen sowieso opnieuw in).

**Wat het venster toont**: voortgang (verwerkt / in wachtrij / fouten / duur), huidige stap (bron → scan of object → % van bron), tabel per
bron (status, verwerkt, nieuw/bijgewerkt/verwijderd, OCR, fouten), eindresultaat (`klaar|gestopt|tijd|limiet|fout`) met foutenlijst en codes
(definitief / herhaling gepland), en het journaal: uw handmatige runs + cron-runs (`app.cron_runs`: `zoek-index`, `zoek-index@server`, handmatig — `zoek-index@handmatig`,
`detail` met tellers, zonder titels/tekst). Gegevens komen uitsluitend van de server, met polling elke 1,5 s tijdens uitvoering en elke 10 s in rust.

**API** (eigenaarssessie + actieve technische tabbladactivering; `backend/zoek/beheer.ts`):
`POST /api/owner/zoek/index/starten {modus:'volledig'|'gedeeltelijk', bronnen?, sinds?}` → `{ok, run, bestond}`;
`POST …/stand` → `{run, bronnen, wachtrij, laden, cron, limieten, nu}`; `POST …/stoppen` → `{ok, run, geannuleerd}`; `POST …/geschiedenis` → `{eigen, runs}`.
Audit: `zoek.index.starten` / `zoek.index.stoppen` (type `beheer`, details: modus, bronnen, laden, run-id).

**Venstercode — technische bundel**: `src/zoek/ZoekIndexVenster.tsx`, `zoek-index-api.ts` en `zoek-index-logica.ts` beginnen met `// @tech-asset`
(`shared/tech-bundels.ts`) → worden gebundeld in `dist/assets/tech/`, die de server alleen uitlevert met de cookie van een actieve technische activering; zonder die cookie (profiel
verlopen, nieuwe versie) toont de pagina een melding «niet geladen — ververs de pagina» in plaats van te crashen. De zoek-UI-catalogus
(`scripts/zoek-ui-catalogus.mjs`, prefix `search/ZoekIndex` → «technisch») toont noch het venster noch zijn «?»-uitleg (`zoek.index.*`)
in de persoonlijke ruimte — uitsluitend in de technische ruimte.

Wanneer het venster geminimaliseerd is, toont het dock de voortgang: «Indexering zoeken — 45 %». Een achtergebleven rij `running` in het journaal (server halverwege een run herstart,
rij ouder dan 2 uur) wordt getoond als «afgebroken»; de rij zelf wordt niet aangepast.

**Controle**: `tests/eenheid/zoek-index-beheer-20261022.test.ts` (routes, lock bezet → aangesloten, stoppen, twee gebruikers, audit,
`nieuweWaterlijn` en `plannen` op een echte DB, catalogus, technische bundel), testopstelling `zoek-index-venster` (390/768/1280, licht/donker, nl, axe).

## 6. Uitrol

Zoals elke release: archief `mijn-ruimte-<datum>.tar.gz` + SHA-256 → `mijn-ruimte-installeer installeren` (databaseback-up → migraties 0100–0104 →
build → omzetten van `current` → herstart → `/__gezondheid`). Extra in deze release:
1. `inrichten`/`installeren` voegt de timer `mijn-ruimte-zoek-index.timer` toe (`TIMERS` in `deploy/installeer-app.sh`) en het item `zoek-index` in `cron.json`.
2. Optioneel: `mijn-ruimte-installeer ocr-talen` voor OCR.
3. De eerste cron vult de index; tot die tijd toont `/zoek` «indexeert» en werkt `global-search` vanuit het geheugen (zoals voorheen).
4. Controle na uitrol: `POST /api/owner/zoek/stand` (alle gekoppelde bronnen → `klaar` binnen ~15 min), `SELECT count(*) FROM app.zoek_objecten`,
   `journalctl -u mijn-ruimte-cron@zoek-index`.

## 7. Terugdraaien

1. `mijn-ruimte-installeer terugdraaien` (vorige `current`): code van vóór 22-10-2026 **leest geen** nieuwe kolommen en heeft ze niet nodig; de oude
   `/api/owner/global-search` werkt vanuit het geheugen (`ZOEK_INDEX` niet ingesteld → index wordt niet gelezen). De pagina `/zoek` van de oude versie blijft werken.
2. Stop de timer `mijn-ruimte-zoek-index.timer` (`systemctl disable --now`), anders vindt de oude `cron.mjs` simpelweg geen handler (foutmelding in het logboek, zonder schade).
3. Migraties terugdraaien is **niet verplicht** (nieuwe kolommen/tabellen zitten de oude code niet in de weg). Indien volledig terugdraaien gewenst is: volgorde 0104 → 0103 → 0102 → 0101 → 0100 volgens de bestandskoppen.
4. Brongegevens worden nooit aangeraakt.

## 8. Prestaties: doelen en metingen

Doelen (gedocumenteerd voor verificatie op de server van de eigenaar): zoeken p95 < 300 ms bij 10 000 objecten in een lade; suggesties p95 < 100 ms;
paginering (pagina van 20) — constant; indexering ≥ 500 objecten/s voor objecten zonder tekstextractie; OCR/extractie op de achtergrond, nooit tijdens het HTTP-verzoek.

Feitelijk gemeten (test-PG16 op 55432; `tests/eenheid/zoek-prestaties-20261022.test.ts`: 10 000 objecten in één lade, 1 000 met tekst van ~400 woorden,
woordenboek van 34 «warme» + 3 000 zeldzame woorden, zoekopdracht matcht 1–15 % van de rijen; «voorheen» = script `rapporten/z5-perf/perf-0093.mjs` op index 0093 met
woordenboek van 30 woorden). Twee runs op kern `zoek-kern-2`: de eerste (~09:30, vóór Z1-optimalisaties) en de tweede (~09:45, na tweefasige Z1-SQL):

| Meting | «Voorheen» (0093, zoeken in SQL zonder synoniemen/stammen) | zoek-kern-2, eerste run | zoek-kern-2, na Z1-optimalisatie | Doel |
|---|---|---|---|---|
| zoeken, 20 per pagina, zonder facetten, p50 / p95 | 65 / 69 ms | 376 / 1 069 ms | **96 / 463 ms** | p95 < 300 ms |
| zoeken met facetten p50 / p95 | — | 616 / 1 909 ms | 98 / 470 ms | p95 < 500 ms ✓ |
| slechtste geval (woord in ~30 % van de rijen, totaal ≈ 4 200) | — | 2 300 ms | 500 ms | < 1 000 ms ✓ |
| suggesties p50 / p95 | 1,3 / 1,9 ms (LIKE) · 3,4 / 5,1 ms (trigram) | 51 / 106 ms | 49 / 69 ms | p95 < 100 ms ✓ |
| paginering (pagina's 1 / 5 / 25 / 50) | 40 → 45 ms | 2 200 → 3 000 ms | 500 / 820 / 240 / 320 ms | constant, < 300 ms (niet gehaald) |
| indexering (`indexeer`, zonder tekstextractie) | ≈ 4 900 obj./s (ruwe INSERT) | 1 744 obj./s | 1 863 obj./s | ≥ 500 obj./s ✓ |
| herindexering van 500 gewijzigde objecten | — | 222 ms | 212 ms | — |
| omvang tabel / GIN vector / GIN stam / trgm bij 10k | 11 / 5 / — / 5 MB | 23 / 6 / 5,8 / 7,5 MB | 9 / 12 / 12 / 14 MB | — |

Conclusie uit `EXPLAIN (ANALYZE, BUFFERS)` van de echte kern-SQL (onderschept door de test, eerste run): de planner liep via
`zoek_objecten_lade_soort_idx` → **alle 10 000 rijen van de lade**, het filter viel slechts ~1 500 rijen af; GIN-indexen (vector/stam/trgm) **werden niet gebruikt**,
omdat de voorwaarde `… OR $q <% titel_norm` (fuzzy in dezelfde WHERE) en de combinatie met de lade niet door één index werden gedekt; voor ~3 500 kandidaten werden
6 tsquery-controles, `word_similarity` en `to_tsvector('simple', titel_norm)` berekend en werd `left(tekst, 20000)` meegenomen in de sortering. Na de Z1-optimalisatie
(CTE met alleen id + signalen, tekst pas voor de huidige pagina) daalde p95 met een factor drie, maar de scan van de volledige lade bleef: het doel van 300 ms p95 bij 10k was **nog niet
gehaald** (463 ms). Derde stap (Z1, migratie **0104**): `btree_gin` + samengestelde GIN-indexen `(user_id, ruimte, zoek_vector)` en `(user_id, ruimte, zoek_stam)` —
lade en volledige tekst lopen nu via één index, zodat alleen rijen van deze lade worden gelezen die de woorden daadwerkelijk bevatten; fuzzy (`<%`) blijft een tweede
fase die alleen draait wanneer FTS weinig oplevert. **Eindrun op de definitieve boom (22-10, 13:20, dezelfde test-PG16, 10 000 objecten):** zoeken zonder
facetten **p50 116 / p95 209 ms** (doel 300 ✓), met facetten 119 / 207 ms ✓, slechtste geval (totaal ≈ 4 200) 329 ms ✓, suggesties
p50 68 / p95 83 ms ✓, indexering 1 635 obj./s ✓. Paginering wordt door dezelfde test gemeten; controleer op de server van de eigenaar met een gevulde
database via `tests/eenheid/zoek-prestaties-20261022` (ENV `ZOEK_PRESTATIE_N` voor een andere N). Openstaand: `titelwoorden` via gewichtslabel `:*A`
op `zoek_vector` (kleine optimalisatie, geen blokkade).

## 9. Resourcelimieten van achtergrondindexering

- Tekstextractie — afzonderlijke `worker_thread` met `--max-old-space-size=ZOEK_TEKST_WERKER_MB` en time-out; bij overschrijding → `fout`, terwijl het cron-proces in leven blijft.
- OCR — `ZOEK_OCR_PARALLEL` (1) tegelijk; `tesseract` draait als extern proces, tijdelijke bestanden staan in een eigen tmp-map (`PrivateTmp=yes` in
  `mijn-ruimte-cron@.service`, modus 0600, altijd opgeruimd).
- Archieven — streaming, limieten op totale grootte/aantal/diepte/compressieverhouding (zip-bommen), verbod op symlinks en pad-traversal buiten de map (zip slip).
- Eén cron-run verwerkt een beperkt aantal items (limiet in `backend/zoek/bronnen.ts`); bij grote postvakken duurt de eerste volledige doorgang
  enkele uren — dit is normaal en zichtbaar als voortgang in «Stand van bronnen».
- `TimeoutStartSec=15min` in `mijn-ruimte-cron@.service`: één run duurt nooit langer; onafgewerkte items blijven in de wachtrij staan.
