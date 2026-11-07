> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./ZOEKEN.uk.md) · **🇳🇱 Nederlands** ([origineel](./ZOEKEN.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Globaal zoeken «/zoek» — architectuur, index, API, rangschikking

Stand: 22-10-2026 (release «zoek-kern-2»).
Bijbehorende documenten in deze map: [`ZOEK-BEVEILIGING.nl.md`](./ZOEK-BEVEILIGING.nl.md) (isolatie en beveiliging), [`ZOEK-BEHEER.nl.md`](./ZOEK-BEHEER.nl.md) (monitoring, herstel, migraties,
uitrol, terugdraaien, prestaties), [`ZOEK-UITBREIDEN.nl.md`](./ZOEK-UITBREIDEN.nl.md) (hoe een nieuwe bron of nieuw objecttype toe te voegen), [`ZOEK-TESTEN.nl.md`](./ZOEK-TESTEN.nl.md) (tests, evaluatieset).

## 1. Wat het is en wat het doet

De pagina `hub.<domein>/zoek` (menu «Zoeken») biedt één zoekfunctie over alles wat voor de mens toegankelijk is in de huidige ruimte:

| Groep | Bronnen (`bron`) | Waar het vandaan komt |
|---|---|---|
| Site-interface | `pagina`, `ui`, `instelling`, `hulp` | interfacecatalogus `backend/zoek/catalogus-ui.ts`: pagina's/tabbladen (`shared/menu-model.ts`, `src/dienst-tab-labels.ts`), knoppen/koppen/dialogen (`shared/zoek-ui-knoppen.generated.ts`, gegenereerd uit `src/**/*.tsx` door het script `scripts/zoek-ui-catalogus.mjs`), instellingen met «?»-uitleg (`shared/hulp-register.ts`), AI-rechten (`shared/connector-v2/catalogus.ts`), integraties (`shared/integraties-catalogus.ts`, `shared/mail-aanbieders.ts`) |
| Post | `mail`, `bijlage` | projectie `mail_items_v1` (Gmail REST; IMAP — zie beperkingen), bijlagen via Gmail API → tekstextractie Z3 |
| Bestanden | `cloud`, `drive` | eigen opslag `cloud_items_v1` + `storage`, Google Drive (projectie + export) |
| Agenda | `agenda` | Google Calendar (projectie), ICS/CalDAV (`app.agenda_externe_gebeurtenis`) |
| Bord | `bord` | `app.mcp_console_items` (taken, notities) |
| GitHub | `github` | repositories (≤60), README, issues/PR's |
| Contacten, apparaten | `contact`, `apparaat` | gereserveerd in het model; op 22-10-2026 **niet geïndexeerd** |

De gebruiker hoeft de exacte naam van een functie niet te kennen: exacte treffers, prefixen (aanvullen), volledige tekst, normalisatie (hoofd-/kleine letters,
diacritica, Cyrillisch ↔ Latijn), lichte morfologie, benaderend zoeken (trigrammen, typefouten van 1–2 letters), synoniemen en meertalige
equivalenten (`uk`, `nl`, `de`, `fr`, `pl`, `ro`, `bg`), spreektaal/transliteratie (`poshta`, «налаштування пошти») en de beschrijving van het doel van een knop werken allemaal.
Elke resultaatkaart legt uit **waarom** ze is gevonden (`uitleg`), toont het pad, een fragment met markering, een overeenkomstpercentage
(0–100, methodiek hieronder) en een veilige navigatie (`route`: uitsluitend diensthost + pad, nooit een willekeurige URL).

## 2. Architectuur (lagen)

```
browser  src/zoek/ZoekPagina.tsx (+ ZoekVeld, ZoekKaart, ZoekFilters, zoek-api.ts, zoek-logica.ts, zoek-kern.ts)
   │  POST /api/owner/zoek            {q, bronnen, soorten, formaten, talen, sinds, tot, sorteer, pagina, perPagina, facets}
   │  POST /api/owner/zoek/suggesties {prefix, bronnen}
   │  POST /api/owner/zoek/stand      → status van elke bron
   │  POST /api/owner/zoek/geschiedenis/{lijst,open,bewaren,wis,wis-alles}
   ▼
eigenaarssessie (backend/index.ts, ownerRequireSession) → identiteit UITSLUITEND van de server
   ▼
ruimtepoort (backend/ruimte-projecties.ts → projectieLaden / gegevensRuimteVeilig): voor elke dienst een lade {userId, ruimte}
   │  gesloten dienst → de bijbehorende bronnen worden niet doorzocht en staan in `gesloten` met uitleg in uk/nl
   ▼
kern (backend/zoek-index.ts): zoek(lade, vraag) / zoekInLaden(...) / suggesties(...) — één SQL per lade, onder alsGebruiker()
   ▼
PostgreSQL 16: app.zoek_objecten (FTS simple + stemmer + trigram, GIN), RLS 0094, app.zoek_geschiedenis (0103), app.zoek_bron_stand
   ▲
indexering (backend/zoek/bronnen.ts + adapters.ts + wachtrij.ts): wachtrij app.zoek_wachtrij, cron `zoek-index` (cron.json / systemd-timer),
   tekstextractie en OCR (backend/zoek/tekst-extractie.ts, tekst-kern.ts in worker_thread, ocr-engines.ts), archieven (archief.ts),
   maskeren van geheimen (shared/geheim-patronen.ts) VÓÓR het schrijven naar de index
```

Principes:
- **Één index** (`app.zoek_objecten`) voor alle bronnen; de tabel `app.zoek_document` (0096) is verouderd en wordt niet gebruikt.
- **Lade van de server.** `userId` + `ruimte` worden nooit uit de aanvraaginhoud gelezen. De poort is dezelfde als voor post/cloud/agenda.
- **Niets wordt tijdens het zoeken gescand.** Zoeken leest uitsluitend de index; OCR, archieven en het doorlopen van bronnen gebeuren in de achtergrondwachtrij.
- **Geen externe diensten.** Alles draait op de server van de eigenaar: PostgreSQL (`pg_trgm`, `unaccent`, ingebouwde stemmers), Node en optioneel `tesseract`.
- **Terugval.** Als de index voor een lade leeg is (`aantalInLade = 0`, bijv. eerste start vóór de `cron`), retourneert `/api/owner/global-search`
  resultaten uit het geheugen (zoals vóór 22-10-2026) met `bron:'live'`, `index:false`; `/api/owner/zoek` toont eerlijk de bronstatus «indexeert».

## 3. Indexschema (`migrations/0100_zoek_kern.sql` breidt 0093 uit)

| Kolom | Type | Doel |
|---|---|---|
| `user_id`, `ruimte` | `text` verplicht | lade; voorwaarde `ruimte IN ('prive','technisch')`; RLS 0094: `user_id = app.huidige_gebruiker()` voor rol `mijnruimte_app` |
| `bron` | `text` `~ '^[a-z_]{2,32}$'` | bron (`ZOEK_BRONNEN` in `shared/zoek-model.ts`) |
| `bron_id` | `text` ≤700 | stabiele id in de bron (id van e-mail, bestand, `pagina:mail/inbox`, `hulp:tech.duur` …) |
| `soort`, `formaat`, `taal` | `text` | type (`ZOEK_SOORTEN`), bestandsformaat (facet), taal van de inhoud (`uk nl de fr pl ro bg` of `''`) |
| `titel`, `titels` (`jsonb`) | `text` | canonieke titel + titels per taal (`uk`/`nl` voor de interface); alle vormen hebben gewicht A |
| `omschrijving` | `text` | wat een knop/pagina doet; gewicht C |
| `tekst` | `text` ≤200 000 | volledige inhoud (e-mail, artikel, OCR); gewicht D |
| `trefwoorden` | `text` | trefwoorden/alternatieve namen, samengevoegd met ` ; `; gewicht B |
| `pad`, `route` (`jsonb`) | | pad voor op de kaart («Instellingen › Talen»); veilige navigatie `{host, pad, hash?, params?}` |
| `extra` (`jsonb` ≤8 KiB) | | metadata (afzender, MIME, omvang, repo, PDF-pagina …). **Zonder geheimen** |
| `versie` | `text` | `sha256` van de inhoud of versie van de bron → herindexering van een ongewijzigd object wordt overgeslagen |
| `titel_norm`, `trefwoorden_norm`, `omschrijving_norm`, `tekst_norm`, `stam_norm` | `text` | genormaliseerde vormen, **berekend in Node** (`zoekNorm`, `lichteStam`) — de SQL-functie `app.zoek_norm` uit 0093 is verwijderd omdat zij faalde bij `datctype = C` |
| `zoek_vector` | `tsvector GENERATED` | `simple` op `*_norm` met gewichten A/B/C/D |
| `zoek_stam` | `tsvector GENERATED` | PostgreSQL-stemmer per `taal` op de originele inhoud; voor `uk`/`bg`/`pl` — `simple` op `stam_norm` |
| `aangemaakt_op`, `bijgewerkt_op` | `timestamptz` | brondatums (versheid als ondersteunend signaal) |

Indexen: GIN(`zoek_vector`), GIN(`zoek_stam`), GIN trigram(`titel_norm`), btree(`user_id`,`ruimte`,`bron`,`bijgewerkt_op DESC`).
Uniciteit: `(user_id, ruimte, bron, bron_id)`.

Bijbehorende tabellen: `app.zoek_bron_stand` (bronstatus per lade: `niet_gekoppeld | indexeert | gedeeltelijk | fout | klaar`, `voortgang` 0–100,
`documenten`, laatste poging/succes/fout), `app.zoek_wachtrij` (indexeringswachtrij: `wachtend/bezig/klaar/fout/geannuleerd`, claimtijd,
exponentiële herhalingen), `app.zoek_ocr_tekst` (0102: OCR-cache **per gebruiker en ruimte**), `app.zoek_geschiedenis` (0103: geschiedenis per
lade — alleen `(bron,id)` van het gevondene, zonder titels/tekst), `app.zoek_synoniemen_eigenaar` (eigen woordenboek van de eigenaar, zonder UI op 22-10-2026).

## 4. API (contract `scratchpad/zoek-API.md` → code `shared/zoek-model.ts`)

Alle routes gebruiken POST, JSON en een eigenaarssessie; in de aanvraag zijn `service` en `tabContext` verplicht (zoals bij alle eigenaarsroutes; zonder deze velden volgt 403
`OWNER_SESSION_CONTEXT_REQUIRED`).

### `POST /api/owner/zoek` — aanvraag `ZoekVraag`
`{ q, bronnen?, soorten?, formaten?, talen?, sinds?, tot?, sorteer?: 'relevantie'|'nieuwste'|'oudste'|'titel', pagina? (1…), perPagina? (1–100, standaard 20), vaag? (true), synoniemen? (true), facets? (true) }`
Antwoord `ZoekAntwoord` + `gesloten: ProjectieGesloten[]` + `laden: {bron → ruimte}`:
`{ q, qNorm, items: ZoekTreffer[], facets?: {bron, soort, formaat, taal → aantal}, suggesties: ZoekSuggestie[], totaal, pagina, perPagina, bron: 'index'|'live', duurMs, versie: 'zoek-kern-2' }`
`ZoekTreffer = { id, bron, soort, titel, titels, omschrijving, pad, route, taal, formaat, bijgewerktOp, extra, integratie, score, percent (0–100), uitleg: [{code, uk, nl}], fragment: {tekst, bron, posities:[[van,tot]]} }`.
Onbekende filterwaarden (`bronnen:['*']`, `sorteer:'user_id'`) worden genegeerd of geven 400 — ze verruimen de selectie nooit.

### `POST /api/owner/zoek/suggesties` — `{ prefix, bronnen? }` → `{ suggesties: ZoekSuggestie[] }`
`ZoekSuggestie = { soort: 'aanvulling'|'functie'|'pagina'|'categorie'|'correctie'|'synoniem', tekst, label?, bron?, id?, route?, aantal? }`.
De bronnen voor suggesties komen uitsluitend uit de lade van de gebruiker (woordaanvullingen uit `titel_norm`, functies/pagina's, categorieën met tellers,
correcties via `similarity` op woorden in de lade + ingebouwde synoniemen). Een correctie **vervangt** de zoekopdracht niet stilzwijgend: de UI toont «Bedoelde u misschien» en laat beide keuzes toe.

### `POST /api/owner/zoek/stand` → `{ standen: ZoekBronStand[], gesloten }`
`ZoekBronStand = { bron, stand, voortgang, aantal (werkelijke telling), laatsteOk, laatstePoging, fout, versie, bijgewerktOp }`.

### `POST /api/owner/zoek/geschiedenis/lijst|open|bewaren|wis|wis-alles` (Z4, 0103)
Geschiedenisitem: zoekopdracht, genormaliseerde zoekopdracht, filters, datum, versies van algoritme/index, `(bron,id)` van de resultaten (≤200), `totaal`, status
`vers|verouderd|vernieuwd|fout`. Bij opnieuw openen voert de client de zoekopdracht opnieuw uit en geeft de server `nieuw`/`weg` (nieuw / verdwenen) terug —
zonder duplicaten, terwijl de datum wordt bijgewerkt. Er staan geen titels of teksten in de tabel.

### `POST /api/owner/zoek/index/starten|stand|stoppen|geschiedenis` (zone D, technisch profiel)
Handmatige volledige of gedeeltelijke indexering van de eigen laden met directe voortgang — zie `ZOEK-BEHEER.nl.md` §5. Alleen beschikbaar met een actieve technische tabbladactivering
(`backend/tech-profiel.ts` → `actieveActivatie`), anders `403 ZOEK_INDEX_TECH_PROFIEL_VEREIST`.

### `POST /api/owner/global-search` (oude route; tevens AI-hulpmiddel `site_search`)
Hetzelfde antwoordformaat als voorheen (`groups[{source, items[{id, title, subtitle, excerpt, relevance …}]}]`), nu boven op de index
(`mode:'zoek_kern_2'`); valt terug op geheugen als de index van de lade leeg is (`index:false`).

## 5. Normalisatie, talen, synoniemen (`shared/zoek-normalisatie.ts`, `shared/zoek-synoniemen.ts`)

- `zoekNorm(s)`: NFC → kleine letters → Cyrillisch → Latijn (één tabel: х→kh, г→g, ґ→g, и→y, і→i, ї→yi, є→ye, щ→shch, ю→yu,
  я→ya; zacht teken en apostrof → ∅) → ł/ß/ø/æ/œ/đ/ı → NFKD zonder diacritica → alleen `\p{L}\p{N}@._-` → enkele spaties. Geen fonetische
  samenvoeging (`Jan de Wijk` blijft `jan de wijk`). Identiek op server en client.
- `zoekTokens(s)`: unieke tokens ≥2 tekens (splitst ook op `-_.@`), ≤12. Stopwoorden worden alleen verwijderd wanneer er andere tokens overblijven.
- `varianten(token)` (alleen voor de **zoekopdracht**): transliteratie — `y↔i`, `kh↔h`, `g↔h`, `ts↔c`, `ye↔e`, `yi↔i`, `iu↔yu`, `ia↔ya`, `w↔v`,
  `j↔y`, `shch↔sch↔sht`, `ii→i`; tot 8 varianten, elk als OR-alternatief met prefix `:*`.
- `lichteStam(token)`: gesloten lijst van achtervoegsels (in Latijnse schrijfwijze: `-amy -ami -akh -iv -oyu -ovi -ykh -ymy -oho -omu
  -ty -la -sia …`, éénletterige `-a -y -i -u -o -e` voor woorden ≥5). **Grenzen**: geen stamwisseling (кінь/коня), geen voorvoegsels, geen woordenboek.
  Voor West-Europese talen draait de ingebouwde PostgreSQL-stemmer (`zoek_stam`).
- `taalRaden(s)`: Cyrillisch (`і/ї/є/ґ` → `uk`), Latijn — stemming op basis van stopwoorden `nl/de/fr/pl/ro`.
- Synoniemen: `SYNONIEM_GROEPEN` ≥120 groepen `{canoniek, taal:'multi', domein, synoniemen[]}` met leden in meerdere talen («пошта/post/courrier/poczta/poștă/поща», «налаштування/instellingen/Einstellungen/paramètres/ustawienia/setări» …).
  In `tsquery` gaan synoniemen **zonder** prefix `:*` (zodat `post` geen `postcode` vangt); letterlijke zoektokens en hun varianten krijgen wel een prefix.
  Identificatoren, bestandsnamen en productnamen (`mijn-ruimte`, `passkey`, `Claude`) worden niet vertaald.
- Woordenboek van de eigenaar: `app.zoek_synoniemen_eigenaar` (RLS; `eigenSynoniemen(lade)`, `eigenSynoniemZetten`) wordt tijdens de zoekopdracht
  toegevoegd aan het ingebouwde woordenboek. **Het ingebouwde woordenboek uitbreiden**: voeg een groep toe in `SYNONIEM_GROEPEN` (`canoniek` in Latijns schrift, leden in alle benodigde
  talen, Cyrillisch laten staan zoals het is — normalisatie maakt er Latijn van) en draai `zoek-kern-*` (controleert op afwezigheid van ongewenste samenvoegingen).

## 6. Rangschikking en «Overeenkomst met zoekopdracht» (`shared/zoek-rangschikking.ts` + SQL in `backend/zoek-index.ts`)

```
score = dekking² · ( 1.0·rank_simple + 0.6·rank_stam )            rank_* = ts_rank_cd(gewichten {D:0.1, C:0.3, B:0.6, A:1.0}, …, 32) ∈ [0,1)
      + 3.0·exacte_titel + 1.2·volledige_zin + 0.6·voorvoegsel + 0.5·titelwoorden
      + 0.3·handeling   (soort ∈ ACTIE_SOORTEN en zoekopdracht ≤ 3 tokens: «taal wijzigen» → instelling boven e-mail)
      + 0.08·exp(−leeftijd/90 dagen)                                  (versheid is ondersteunend)
      + 0.5·vaag·(word_similarity(q, titel_norm) − 0.6)⁺             alleen als FTS niets opleverde (fuzzy rijen zonder dekking)
dekking = aandeel OR-groepen van de zoekopdracht dat aanwezig is in zoek_vector; rijen met dekking < ½ vallen af bij ≥ 2 groepen
percent = round(100 · (score / max_score_in_deze_zoekopdracht)^0.75), minimaal 1
```
Kortom: exacte titel > volledige zin > prefix > woorden in titel > tekst > synoniem/normalisatie > fuzzy treffer; versheid breekt alleen
gelijke standen. Het percentage is een monotone normalisatie ten opzichte van het beste resultaat **binnen dezelfde zoekopdracht** (de beste heeft altijd 100), identiek
voor alle bronnen; geen willekeurig getal en geen «waarschijnlijkheid». `uitleg[]` wordt uit dezelfde signalen opgebouwd (SQL levert `exacte_titel` /
`volledige_zin` / `voorvoegsel` / `titelwoorden` / `dekking` / `rank_*` / `vaag` / `handeling` / `vers`; Node voegt `synoniem` / `vertaling` / `translit` toe).
Sortering `relevantie`: `score DESC, bijgewerkt_op DESC`; `nieuwste/oudste/titel` — op de betreffende kolom.

## 7. Indexering, cache, vertragingen

- **Initieel**: cron `zoek-index` (vermelding in `cron.json`; systemd-timer `mijn-ruimte-zoek-index.timer`) elke 5 min: voor elke
  goedgekeurde gebruiker en elke door de poort geopende lade — bronnen detecteren (`koppelFeit`), een volledige scan in de wachtrij plaatsen als
  het laatste succes ouder is dan 15 min of de bronversie is gewijzigd; N wachtrij-items verwerken (limiet per run, `FOR UPDATE SKIP LOCKED`,
  lease 5 min, herhalingen 30 s → 6 uur, ≤6 pogingen; onomkeerbare fouten zonder herhaling). De interfacecatalogus wordt per lade geïndexeerd met versie
  `ui-<hash>`: bij gewijzigde UI-code worden alleen gewijzigde objecten overschreven.
- **Incrementeel**: aanmaken/wijzigen → upsert op `versie` (sha256 van inhoud of bronversie; ongewijzigd wordt overgeslagen); verwijderen →
  `verwijder`; dienst ontkoppelen / integratie intrekken → `verwijderBron` + status `niet_gekoppeld`; opnieuw autoriseren → volledige scan.
- **Tussen herstarts** blijft de index bewaard in PostgreSQL; zoeken leest nooit rechtstreeks uit de bronnen.
- **OCR** — afzonderlijke wachtrijtaken (`soort:'ocr'`), ≤1 parallel per proces, cache `app.zoek_ocr_tekst` op `(user_id, ruimte, sha256, pagina,
  engine, talen)`: een ongewijzigd document wordt niet voor een tweede keer herkend.
- **Vertragingen (reëel, geen loze beloften)**: nieuwe pagina/knop — na uitrol + eerste cron (≤5 min); bericht/bestand/afspraak — eerstvolgende cron na
  verschijnen in de projectie (projecties worden bijgewerkt door hun eigen synchronisaties: post via push/poll, Drive/Calendar via hun eigen timers), dus doorgaans 5–20 min;
  bijlagen/OCR — afhankelijk van de wachtrijlengte (één document ≤ 60 s voor extractie + ≤45 s per OCR-pagina); GitHub — tot 15 min + API-limieten.
  De status en tijd van de laatste update van elke bron zijn te vinden via `/api/owner/zoek/stand` en het paneel «Stand van bronnen» op de pagina.

## 7a. Interface `/zoek` (Z4 + zone D, 22-10-2026)

- **Kaarten** (`src/zoek/ZoekKaart.tsx`): gekleurde icoontegel per bron (tokens: interface/instellingen — info, post — ok,
  bestanden — accent, agenda — warn, GitHub — neutraal, bord — gemengd), voor een bericht de foto/het logo van de afzender (`src/afzenders/AfzenderFoto`
  → `app.afzender_beeld`, net als in post; zonder afbeelding initialen), voor een bestand het formaat in de tegel (PDF, DOCX…), voor GitHub/Drive het officiële
  logo uit `src/merk` (nooit een zelfgetekend icoon). Daarna: titel (link naar de echte route), bron › pad, fragment met markering op basis van
  serverposities, tags, datum, «Overeenkomst N%», actie per type, «Waarom relevant».
- **Ordening** «Op relevantie» / «Per bron»: de tweede optie groepeert resultaten per categorie met een scheidingskop (icoon, naam,
  teller) in een vaste categorievolgorde (`groepeerPerCategorie`, `src/zoek/zoek-logica.ts`); de volgorde binnen een groep blijft zoals de server die gaf.
- **Lijst / raster**: schakelaar in de resultaatbalk; raster = tegels (verticale kaarten, `.zk-lijst.is-raster`), op telefoon één kolom.
  De keuze wordt alleen in deze browser bewaard (`localStorage`, `mr.zoek.weergave.v1`) — gebruiksgemak, geen gebruikersdata.
- **Categoriechips en filters** tonen tellers uit de serverfacetten (geen verzonnen getallen); «Recente zoekopdrachten» toont rijen met een pijl,
  de zoekopdracht en een relatieve tijd («2 u geleden», «gisteren»; ouder dan 7 dagen — datum).
- **Technisch profiel**: strook «U zoekt in de technische ruimte…» met een link naar zoeken in de persoonlijke ruimte (nieuw tabblad), in
  «Stand van bronnen» bij elke bron de lade (persoonlijk/technisch), en de knop «Indexeren…» → zwevend venster voor handmatige indexering
  (`ZOEK-BEHEER.nl.md` §5). Voor een gewone gebruiker wordt niets hiervan getoond.
- Bij meer dan twee niet-beschikbare diensten in deze ruimte (in het technisch profiel zonder keuze zijn dat er zeven) verschijnt één inklapbaar blok «Niet-beschikbare
  diensten in deze ruimte (N): …», met daarbinnen dezelfde uitleg en knop als elders op de site (`RuimteGeslotenVlak`).
- Filters op telefoon/tablet (≤ 900 px) openen als onderblad (`role=dialog`, `aria-modal`). Dit leeft in het werkgebied, terwijl het sitemenu
  (rail/dock), de knoppen rechtsboven en «naar boven» in een hogere laag liggen; daarom worden menu en «naar boven» verborgen zolang het onderblad open is en begint het onderblad
  onder de bovenbalk (op 768 px lagen de selectievakjes voorheen onder de menurail en waren ze niet aanklikbaar).
- Donker thema werkt via tokens (`src/ontwerp/tokens.css`), 390 px zonder horizontale scroll, tapdoelen ≥ 44 px; axe 0 op de pagina en in het venster
  (testopstelling `zoek-axe`, `zoek-index-venster`).
- Miniaturen van afbeeldingen/bestanden worden op kaarten **niet** getoond: in de cloud bestaat geen miniatuurroute en het openen van bestandsbytes enkel voor zoekresultaten
  is onveilig (zie §8); in plaats daarvan staat het formaat in de tegel.

## 8. Beperkingen en bekende punten (eerlijk overzicht)

- `contact` en `apparaat` zitten in het model, maar worden nog niet geïndexeerd. IMAP-post wordt alleen geïndexeerd als de projectie `mail_items_v1` gevuld is;
  IMAP-bijlagen worden niet geïndexeerd (alleen Gmail REST). Microsoft-post evenmin.
- Morfologie voor uk/bg/pl is lichtgewicht (achtervoegsels), zonder woordenboek; `кінь/коня` matchen niet. Semantisch (vector)zoeken is er niet — alles
  werkt zonder taalmodel, zoals de specificatie vereist.
- OCR vereist een geïnstalleerde `tesseract` (+ traineddata) op de server van de eigenaar (`mijn-ruimte-installeer ocr-talen`); zonder dit pakket toont de bron
  «OCR niet beschikbaar» en worden documenten alleen op naam en tekstlaag geïndexeerd.
- Archieven: zip (stored/deflate), tar, tar.gz, gz; zip64, versleutelde zip, 7z en rar → «niet ondersteund» (eerlijk vermeld in `problemen`).
- Eén cron-proces per server; bij duizenden berichten duurt de eerste volledige doorgang enkele uren (itemlimiet per run — zie `ZOEK-BEHEER.nl.md`).
- Het woordenboek van de eigenaar heeft nog geen UI (alleen kernfuncties).
- `app.zoek_document` (0096) blijft leeg in het schema aanwezig voor eventueel terugdraaien.

## 9. Bestanden

`shared/zoek-model.ts`, `shared/zoek-normalisatie.ts`, `shared/zoek-synoniemen.ts`, `shared/zoek-rangschikking.ts`, `shared/zoek-formaten.ts`,
`shared/geheim-patronen.ts`, `shared/zoek-ui-knoppen.generated.ts` (+ `scripts/zoek-ui-catalogus.mjs`); `backend/zoek-index.ts`,
`backend/globaal-zoek.ts`, `backend/zoek-geschiedenis.ts`, `backend/zoek/{bronnen,adapters,wachtrij,stand,catalogus-ui,tekst-extractie,
tekst-kern,tekst-werker,ocr,ocr-engines,inhoud,archief,beheer}.ts` (beheer = handmatige indexering, zone D); `src/zoek/*` (waaronder `ZoekIndexVenster.tsx`, `zoek-index-{api,logic}.ts`, `ZoekCategorieIcoon.ts`), `shared/zoek-hulp.ts`; `migrations/0100_zoek_kern.sql`, `0101_*` (Z2), `0102_zoek_ocr_tekst.sql`,
`0103_zoek_geschiedenis.sql`, `0104_zoek_gin_lade.sql`; `tests/eenheid/zoek-*.test.ts` (handmatige indexering: `zoek-index-beheer-20261022`), `tests/eenheid/hulp/zoek-evaluatie.json`, testopstelling `tests/e2e/hulp/stand-zoek.ts`.
