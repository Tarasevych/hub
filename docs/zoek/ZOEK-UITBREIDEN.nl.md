> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./ZOEK-UITBREIDEN.uk.md) · **🇳🇱 Nederlands** ([origineel](./ZOEK-UITBREIDEN.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Zoeken «/zoek» — een nieuw objecttype of een nieuwe bron toevoegen

Stand: 22-10-2026. Stap voor stap, met bestandsnamen. Regel: een nieuwe bron verzint **nooit** een eigen zoekfunctie of eigen tabel — zij levert
uitsluitend `ZoekObject`-items aan de centrale kern en doorloopt dezelfde ruimtepoort.

## A. Nieuw objecttype (`soort`) in een bestaande bron

1. `shared/zoek-model.ts` → `ZOEK_SOORTEN`: voeg de naam toe (a–z). Als het een «actie/instelling/pagina» betreft (waarbij korte opdrachtvragen
   een bonus moeten krijgen), voeg de naam dan ook toe aan `ACTIE_SOORTEN`.
2. Bronadapter (`backend/zoek/adapters.ts` of `catalogus-ui.ts`): geef objecten terug met het nieuwe `soort`.
3. UI: `src/zoek/ZoekKaart.tsx` — icoon en typelabel (uk + nl), navigatieactie; `src/zoek/zoek-logica.ts` — het filter «Type» haalt zijn waarden uit
   `ZOEK_SOORTEN`, zodat de nieuwe naam vanzelf verschijnt, maar het uk/nl-label moet wel worden toegevoegd.
4. Tests: `tests/eenheid/zoek-kern-*.test.ts` (model), en voeg 1–2 zoekvragen toe aan `tests/eenheid/hulp/zoek-evaluatie.json` met het verwachte `soort`.
5. Een migratie is **niet nodig** (`soort` is vrije `text`).

## B. Nieuwe bron (`bron`), bijv. «contacten» of «apparaten»

1. **Model** — `shared/zoek-model.ts`:
   - `ZOEK_BRONNEN`: voeg de naam toe (`^[a-z_]{2,32}$` — dit is de CHECK-constraint in 0100; geen migratie nodig);
   - `DIENST_VAN_BRON`: bij welke deelbare dienst de bron hoort (`mail | cloud | agenda | contacten | ai | bord | github`) of `null`
     (ligt in de basislade van het tabblad). Dit bepaalt **welke poort** over de toegang beslist;
   - `BRON_NAAM` (uk/nl), `SOORT_VAN_BRON`.
2. **Adapter** — `backend/zoek/adapters.ts`: functie `xxxObject(rij, lade): ZoekObject` → `{ id (stabiel in de bron), bron, soort, titel,
   titels?, omschrijving?, tekst?, trefwoorden?, pad, route {host, pad, hash?, params?} (alleen diensthost van de site), taal, formaat, bijgewerktOp,
   versie (inhoudshash of bronversie), extra (≤8 KiB, zonder geheimen), rechten: {userId, ruimte} }`. Tekst uit bestanden altijd via
   `tekstUit()` (`backend/zoek/tekst-extractie.ts`), nooit met een eigen parser. Geheimen worden door de kern/`maskeerGeheimen` gemaskeerd — maar zet
   ze ook nooit in `extra`.
3. **Lezen van de bron** — `backend/zoek/bronnen.ts`:
   - `koppelFeit(bron, lade, besluit)`: of de bron voor deze lade gekoppeld is (echte controle, geen aanname) en de bijbehorende foutcode;
   - in `volledigeScan`/`verwerk` (namen zoals in het bestand): lees rijen **uitsluitend via `projectieLade` + `hoortBij`** (of `alsGebruiker`), nooit
     met een filter op alleen `ownerUserId`; geef ze door aan `indexeer(lade, objecten)`; verwijderde items → `verwijder`; ontkoppeld → `verwijderBron`;
   - respecteer `kluisStand(lade)`: als de bron een DEK nodig heeft (OAuth-tokens), geef bij `gesloten` direct `KLUIS_GESLOTEN` terug zonder pogingen.
4. **Bronstatus**: roep `standZetten(lade, bron, {...})` aan bij de start (`indexeert`, `voortgang`) en aan het einde (`klaar`/`gedeeltelijk`/`fout`, `laatsteOk`).
5. **Incrementeel bijwerken**: waar de bron events heeft (webhook, push, projectiesynchronisatie) — plaats een item in de wachtrij (`zoekMelden` in `wachtrij.ts`)
   in plaats van te wachten op een volledige scan; gebruik anders een periodieke volledige scan (documenteer de werkelijke vertraging in `ZOEKEN.md` §7).
6. **UI**: `src/zoek/zoek-logica.ts` (categorie, teller wordt alleen getoond wanneer de bron gekoppeld is), `ZoekKaart.tsx` (icoon, actie),
   statuspaneel (naam uit `BRON_NAAM`).
7. **Synoniemen**: als de bron eigen termen heeft — voeg een groep toe in `shared/zoek-synoniemen.ts` (9 talen) of via `trefwoorden` op het object.
8. **Tests** (verplicht vóór release):
   - `tests/eenheid/zoek-bronnen-*.test.ts`: adapter op voorbeeldrijen (zonder netwerk — mocks `hulp/nep-google.ts`/`nep-github.ts`);
   - `tests/eenheid/zoek-isolatie-20261022.test.ts`: voeg een document van de nieuwe bron toe in `docs()` voor A en B (dezelfde titel) — de test
     controleert automatisch dat er geen kruising optreedt; als de bron bij een dienst hoort, neem dan ook het scenario «gesloten dienst» mee;
   - `tests/eenheid/hulp/zoek-evaluatie.json`: ≥3 zoekvragen (exact, met typefout, in een andere taal) met `verwacht:[{bron:'xxx', id:…}]`.
9. **Documentatie**: voeg een rij toe aan de bronnentabel in `ZOEKEN.md` §1 en de vertraging in §7; werk `ZOEK-BEHEER.md` §2 bij (hoe de status te controleren).

## C. Nieuwe bron in de interfacecatalogus (nieuwe pagina/knop/instelling)

Er is geen extra actie nodig als: de pagina/het tabblad is gedeclareerd in `shared/menu-model.ts` + `src/dienst-tab-labels.ts`; de knop gewone
JSX met uk/nl-tekst in `src/**/*.tsx` is (de generator `scripts/zoek-ui-catalogus.mjs` verzamelt ze in `shared/zoek-ui-knoppen.generated.ts` tijdens
`npm run build`; de test `zoek-bronnen-*` controleert de actualiteit); de instelling `data-hulp='<sleutel>'` heeft én een vermelding in `shared/hulp-register.ts`
(diezelfde sleutel is ook `route.params.focus`, waar de pagina naartoe scrolt). Nieuwe AI-rechten staan in `shared/connector-v2/catalogus.ts`; integraties in
`shared/integraties-catalogus.ts`. Na uitrol overschrijft de eerste cron alleen de gewijzigde objecten (versie `ui-<hash>:<id>`).

## D. Nieuwe zoektaal

`shared/zoek-normalisatie.ts`: transliteratie (bij een nieuw alfabet), `STOPWOORDEN`, `taalRaden`; `shared/zoek-model.ts` → `ZOEK_TALEN`,
`PG_STEMMER` (alleen stemmers die **bestaan** in PG: `select cfgname from pg_ts_config`); `0100` → CHECK `zoek_objecten_taal_check` (migratie
`01xx`: `DROP CONSTRAINT`/`ADD CONSTRAINT`) en een tak in `zoek_stam`; vul de synoniemgroepen aan met vormen in de nieuwe taal; voeg vragen toe aan de evaluatieset.
