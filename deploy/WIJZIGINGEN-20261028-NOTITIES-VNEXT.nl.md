> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261028-NOTITIES-VNEXT.uk.md) · **🇳🇱 Nederlands** ([origineel](./WIJZIGINGEN-20261028-NOTITIES-VNEXT.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

## Notities vNext — hub.tarasevych.com/notities (28-10-2026)

Implementatie van het pakket `Mijn_Ruimte_Notes_vNext` (bestek van 28-10-2026) in het bestaande project. Basis: archief **`mijn-ruimte-20261028-224316`** (`herstel technische modules`, tak `fix-technische-modules`, commit `9d157545528b`) — de branch `notities-vnext` is hierop gerebased nadat de eigenaar een tussentijdse update had uitgebracht. **Productie is niet gewijzigd en niet uitgerold.**

> **Gerebased op 29-10-2026:** de basis is nu **`mijn-ruimte-20261028-233308`** (pagina "Terugdraaien", tak `fix-technische-modules`, commit `f7eafb075585`) — een tussentijdse release van een andere agent. Er is geen overlap in bestanden (die release wijzigde terugdraaien/overzicht/gezondheid, deze wijzigt notities/huis); de rebase is schoon, zonder enige wijziging in de bestanden van dit pakket. Opnieuw gecontroleerd op de nieuwe basis: `huis-vnext` 53/53, `notities-vnext` 62/62, `terugdraai-controle` 25/25, e2e `huis` 49/49, e2e `notities` 39/39, `npm run build` PASS, `tsc` 3/20 (basis).


Aanpassing aan de tussentijdse update (28-10, 22:43): de eigenaar heeft `migrations/0126_tech_assets_ruimtes_v2.sql` toegevoegd en `backend/tech-bundels.ts` en `tests/eenheid/tech-bundels-ruimtes-v2.test.ts` gewijzigd. Geen van mijn bestanden overlapt daarmee; het enige conflict is **migratienummer 0126**. Mijn migratie is hernoemd naar **`0127_notities_vnext.sql`** (alle verwijzingen in code, tests, documentatie en het terugdraaiscript zijn bijgewerkt). De migratie 0126 van de eigenaar blijft ongewijzigd en wordt als eerste uitgevoerd. Voor wie mijn eerdere pakket `20261028-222128` al had toegepast (niet gebeurd — het is niet geïnstalleerd): daarin werden de tabellen aangemaakt door `0126_notities_vnext`; in `app.schema_migrations` wordt die versie niet meer herkend, maar 0127 is idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) en wordt er gewoon zonder gegevensverlies overheen uitgevoerd.

### Wat er is gerealiseerd (P0 volgens bestek)

| Module | Status | Waar |
|---|---|---|
| Aparte notitieopslag (title 300, Markdown tot 200.000 tekens, 24 tags incl. Oekraïense, mappen, vastpinnen, archief, prullenbak 30 dagen, versie, revisies) | **implemented** | `migrations/0127_notities_vnext.sql`, `backend/notities-vnext.ts` |
| Overzetten van oude hub-notities (`mcp_console_items`, `kind=note`, tag `hub`) zonder verlies — **dezelfde id**, ruimte, datums, sha256 in `herkomst` | **implemented** | 0127 (`ON CONFLICT DO NOTHING`, zonder UPDATE/DELETE van oude rijen) |
| Spiegel naar het oude bord (dezelfde id's; title ≤ 160, body ≤ 4000, ≤ 8 tags volgens de oude regel) — daardoor blijven `manage_hub_notes`, `/api/mcp/board*`, de oude pagina en het terugdraaien naar een oude release ongewijzigd werken | **implemented** | `backend/notities-vnext.ts` (`spiegelSchrijf`/`spiegelWis`), hooks in `backend/mcp-console.ts` |
| API `/api/notities/*` (`lijst` met paginering/filters/zoeken, `een`, `nieuw`, `wijzig` met 409 `VERSIE_VEROUDERD`, `actie`, `revisies`, `revisie-herstel`, `mappen`, `import/voorbeeld`, `import/uitvoeren`, `export`) via **dezelfde draaischijf van het bord** (`bordLade`: ruimte `prive/technisch` vanuit het tabblad, RLS via `alsGebruiker`) | **implemented** | `backend/notities-vnext.ts`, registratie in `backend/index.ts` |
| React-UI achter de vlag `notities-vnext` (uitgeschakeld): zijbalk (alle/vandaag/vastgepind/checklists/archief/prullenbak/integraties, mappen, tags), kaarten/lijst, chips, zoeken, kolom "Vandaag" (minikalender, checklists), Markdown-editor (zijpaneel rechts / volledig scherm op telefoon, werkbalk, voorbeeld, checklists, type/kleur/map/tags/vastpinnen, concept in browser, 409-conflict met vergelijking, geschiedenis met herstel), import met voorbeeldweergave en duplicaten, export JSON/Markdown, onderste balk + "+" op telefoon | **implemented** | `src/notities/*`, schakelaar in `src/HubNotities.tsx` |
| uk/nl, toetsenbord (`/`, Ctrl+N, Ctrl+S, Esc, Tab-trap), aria, tikdoelen ≥ 44 px, safe-area, licht/donker thema via tokens | **implemented** | `src/notities/notities-vnext.css` |
| Veilige Markdown-weergave (alles wordt geëscaped, alleen `https`-links, DOMPurify als tweede laag) | **implemented** | `shared/notities-vnext-model.ts` → `markdownNaarHtml`, `src/notities/NotitieKaart.tsx` |
| Scherm "Integraties" met eerlijke statussen (`beschikbaar` alleen bestanden; `alleen-invoer`; `beperkt`; `gepland`) — geen enkele "Koppelen"-knop zonder connector | **implemented** | `shared/notities-vnext-model.ts` → `NOTITIE_BRONNEN`, `src/notities/NotitiesBronnen.tsx` |

Integratiematrix: Markdown/TXT/JSON — **implemented**; Obsidian, Apple Notities, HONOR/HUAWEI, Samsung — **import-only** (via dezelfde bestanden); Google Behouden — **restricted** (Workspace); Google Calendar-koppeling, OneNote Graph, Evernote (MCP/ENEX), Notion, ColorNote — **planned** (geen connectoren, geen knoppen). Bijlagen, backlinks, herinneringen, OCR/spraak, AI, gezamenlijk bewerken, PWA offline — **niet geïmplementeerd** (P1/P2 volgens bestek).

### Gedrag van het oude pad na 0127

* `POST /api/mcp/board` `kind=note` met tag `hub` → maakt een notitie aan in `app.notities` + spiegel; antwoord in het oude formaat.
* `PATCH … kind=edit` → werkt vNext bij (revisie blijft behouden). Als `body` **ongewijzigd afgekapt** (≤ 4000) binnenkomt, wordt de volledige lange inhoud niet afgekapt.
* `PATCH … kind=delete` → **prullenbak** (30 dagen, te herstellen), in plaats van directe verwijdering; de spiegelrij verdwijnt van het bord.
* Tags die niet binnen de oude regel (`[a-z0-9:_-]{1,32}`) passen, blijven alleen in vNext; in de spiegel verschijnt bovendien de tag `archief` voor gearchiveerde notities.
* Als de tabellen van 0127 ontbreken, gedraagt het bord zich zoals voorheen (detectie op foutcode `42P01`).

### Controles (echte cijfers, deze omgeving)

Omgeving: Node v22.22.0 (de repository vraagt ≥ 24; `npm ci` met EBADENGINE), PostgreSQL 16 lokaal (`127.0.0.1:55432`), Chromium (Playwright 1194), zelfondertekend certificaat voor `*.tarasevych.com` (`ignoreHTTPSErrors` alleen in e2e).

| Testset | Resultaat |
|---|---|
| `tests/eenheid/notities-vnext-20261028.test.ts` (migratie 0 verlies ×2 idempotent, spiegel, oude pad, ruimtes/RLS, 409, revisies, archief/mappen/zoeken/vandaag/paginering, import/export/duplicaten/XSS, model, catalogus) | **62/62 PASS** |
| `tests/e2e/notities-vnext.e2e.ts` (echte server + Postgres + nep-Google; vlag uit/aan, aanmaken Ctrl+N/Ctrl+S, voorbeeld met `<script>` als tekst, versieconflict, `/`-zoeken, archief, prullenbak/herstel, import met voorbeeldweergave, integraties, 320/390/768/1024/1440 × licht/donker zonder horizontale scroll, mobiele editor op volledig scherm, tikdoelen 44 px, 0 console-/pagina-/4xx-fouten of externe verzoeken) | **39/39 PASS** |
| `ruimte-bord-github-20261020`, `hub-agenda-notities-20261019`, `dev-rechten-media-github-20261021` (regressie van bord/oude pagina) | 45/45, 64/64, 67/67 PASS |
| `npm run build` (kaart-controle, plaatsing-controle, zoek-ui-catalogus, l002-audit, mail-slimme-inbox-audit, kleur-contrast-controle, vite, tech-bundels, extensie, server) | **PASS** (exit 0) |
| `tsc -p tsconfig.server.json`, `tsc -p tsconfig.json` | 20 / 3 fouten — **dezelfde als in het basisarchief** (mail-afzenders, index.ts gmail*, cloud/React unused); 0 in nieuwe bestanden |
| Volledige `eenheidstests.mjs` zonder filter | **loopt in deze omgeving niet tot het einde door**: `ai-beleid` (vereist root-vingerafdruk van OPA/beleid), `ai-toegang-beheer` (`CANONICAL_SERVICE_RUNTIME_MISSING`) — randvoorwaarden van de omgeving, niet de notitiecode. Dit was vóór de wijzigingen al zo. |
| Regressie van aangrenzende sets: `mcp-console-c2` 19/19, `mcp-spiegel` 11/11, `mcp-acties` 12/12, `site-hulpmiddelen` 27/27, `hulpmiddelen-tweetalig` 25/25, `plaatsing-20261025` 68/68, `zoek-ui-20261022` 61/61, `ai-agent-bord` 20/20, `connector-v2` 49/49, `mcp-connector` 74/74 | PASS |
| `ontwerp-fundament` 31/34, `vlaggen` 53/54, `tech-bundels` 33/34, `account-wissen` 19/20 | **dezelfde 4 fouten op het basisarchief zonder mijn wijzigingen** (ruimtes.css/werkblad CSS, app-rol vlaggen, TechLaag, `cloud_provider_policy_audit_m6`) — geen enkele raakt de notitiebestanden |
| Terugdraaien (`deploy/notities-vnext-terugdraaien.sql`) | SOURCE-ONLY: niet uitgevoerd op een live DB; logica: prullenbak → bord, DROP van drie tabellen, verwijderen van vlag en migratie-item 0127 |

NIET TESTED: externe integraties (zijn niet aanwezig in de code), RLS met de rollen `mijnruimte_app/system` (in deze omgeving één superrol; policies zijn identiek aan 0019), screenreader, zoom 400 %, belasting.

### Terugdraaiplan

1. Normaal: `mijn-ruimte-installeer` → vorige release. De tabellen uit 0127 blijven staan; de oude code leest de spiegel in `app.mcp_console_items` (alle hub-notities, dezelfde id). Verlies: niets zichtbaars voor de oude code; lange teksten worden in de oude UI afgekapt op 4000 tekens getoond (de volledige tekst blijft bewaard in `app.notities`).
2. Alleen de nieuwe pagina uitschakelen: vlag `notities-vnext` → UIT (Functieschakelaars). De gegevens worden gedeeld.
3. Tabellen verwijderen: `deploy/notities-vnext-terugdraaien.sql` na `pg_dump` van de drie tabellen (instructie in het bestand).

### Gewijzigde/nieuwe bestanden

Nieuw: `migrations/0127_notities_vnext.sql`, `shared/notities-vnext-model.ts`, `backend/notities-vnext.ts`, `src/notities/{NotitiesPagina,NotitieKaart,NotitieBewerker,NotitiesImport,NotitiesBronnen,Laag}.tsx`, `src/notities/{notities-client,notities-vlag,tekst}.ts`, `src/notities/notities-vnext.css`, `tests/eenheid/notities-vnext-20261028.test.ts`, `tests/e2e/notities-vnext.e2e.ts`, `deploy/notities-vnext-terugdraaien.sql`, dit bestand.
Gewijzigd: `backend/mcp-console.ts` (hooks voor hub-notities), `backend/index.ts` (registratie van routes), `src/HubNotities.tsx` (schakelaar op vlag; oude pagina ongewijzigd), `shared/vlaggen.ts` (toelichting vlag), `migrations/rechten.sql` (GRANT voor `mijnruimte_app`), `scripts/plaatsing-vaste-elementen.json` (toestemming voor `.vn-laag` en `.vn-onderbalk`).

### Bevindingen tijdens het werk (opgelost)

* Ctrl+K is bezet door het globale zoeken van de chrome — op de notitiepagina krijgt het zoekveld focus met de toets `/`.
* `position:fixed` binnen `.canonical-workspace` (z-index 1) belandt onder de bovenbalk (z-index 220) — lagen worden via een portal in `<body>` gerenderd met z-index 230.
* DOMPurify met een eigen `ALLOWED_URI_REGEXP` verwijderde `type="checkbox"` — `ADD_URI_SAFE_ATTR` is toegevoegd.
* Globale stijlen voor `footer`/`h3` (`index.css`) braken de kaarten — expliciet gereset in `notities-vnext.css`.
* Esc sloot een laag niet wanneer de aangeklikte knop verdween (focus in `body`) — Esc werkt nu ook op vensterniveau voor de bovenste laag.

**Uitrol uitsluitend na de afzonderlijke zin van de eigenaar `DEPLOY ПІДТВЕРДЖЕНО` en goedkeuring met passkey op de site.**
