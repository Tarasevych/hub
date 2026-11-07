> 🌐 **Taal / Мова:** [Українська](РОБОЧИЙ-АРКУШ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Werkblad · Робочий стіл (hub.*/overzicht)

Zone F, 22-10-2026.

## Wat het is

Het «Werkblad» is de hoofdpagina van de hub (`/overzicht`): een raster van widgets die **alleen echte gegevens** lezen uit al bestaande serverroutes. De gebruiker sleept widgets, wijzigt hun formaat, voegt nieuwe toe uit de catalogus en kiest een achtergrond. De indeling wordt **op de server bewaard, afzonderlijk per lade** (persoonlijke ruimte / technische ruimte) en lokaal gecachet voor een directe eerste weergave.

## Architectuur

| Laag | Bestand | Wat het doet |
|---|---|---|
| Zuivere regels | `shared/werkblad-indeling.ts` | Widgetcatalogus, indelingstype `{v:2, items:[{tid,id,k,r,inst?}], achtergrond}`, `normaliseerWerkblad` (browser **én** server), rechten (`toegestaan` — technische widgets alleen in de technische lade, «binnenkort» nergens), `plaatsen` (plaatsing zonder overlap op 12/6/1 kolommen), `neerzetIndex` (waar een versleepte widget landt), overzetting van het oude bureaublad (`vanBureau`) en de oude blokken (`vanBlokken`), `eersteWerkblad`, `standaardWerkblad`, «?»-teksten (`HELP_WERKBLAD`). |
| Database | `migrations/0112_werkblad_indeling.sql` | `app.werkblad_indeling` — één rij per `(user_id, ruimte)`, `indeling jsonb`, `achtergrond_eigen` (data-URL ≤ 400 kB), `herkomst`, `versie`. RLS: `user_id = app.huidige_gebruiker()`; rechten in `migrations/rechten.sql`. |
| Server | `backend/werkblad.ts` | `POST /api/owner/hub/werkblad/laden · bewaren · terugzetten · tech`. De lade komt uit `gegevensRuimteVeilig(userId, {tabContext})` — nooit uit de request-body. Elke zoekopdracht draait onder `alsGebruiker()` (RLS) **plus** een expliciete `WHERE user_id = $1 AND ruimte = $2`. `bewaren` normaliseert voor **deze** lade en houdt `versie` bij (oudere client → 409 `WERKBLAD_VEROUDERD` + actuele rij). `/tech` werkt alleen in de technische lade met een actief technisch profiel in dit tabblad (of de eigenaar): samenvatting uit `admin-diagnostiek.overzicht()`, `uitrol-runs.runsLijst()`, `release-info` en `os` — zonder serverpaden. |
| Client | `src/werkblad/Werkblad.tsx` | Schil: laden (cache → server → overzetten van oud bij eerste opening), modus «Aanpassen», slepen/formaat wijzigen via pointer-events, toetsenbord (pijltjes / Shift+pijltjes / Verwijderen), knoppen «hoger/lager» op telefoon, catalogus en achtergrond in `<Venster>`. |
| | `src/werkblad/api.ts` | Routes + lokale cache `localStorage['tsv:werkblad-v2:<user>:<profiel>']`. |
| | `src/werkblad/gegevens.ts` | Laders met cache (60 s): hergebruikt `src/bureau/gegevens.ts` (hub/blocks/data, board/list, mijn-diensten) + zoekgeschiedenis, `/__gezondheid`, `/tech`; `useBron` (skelet/fout/herladen), `useZichtbaar` (lazy loading — pas wanneer de tegel in beeld komt). |
| | `src/werkblad/widgets/*` | Widgetinhoud: `Start.tsx` (begroeting, snelle toegang, snelle acties, tip, AI — in de hoofdchunk omdat ze de LCP vormen), `Post`, `Agenda`, `Taken` (taken/notities/bord), `Bestanden` (bestanden/opslag), `Overig` (zoekopdrachten, diensten, systeem, technisch, oude blokken) — lazy chunks via `React.lazy`. `Vlak.tsx` — gedeelde toestanden: skelet, leeg, fout met code, «niet gekoppeld → Koppelen» met de juiste link, gesloten lade. |
| | `src/werkblad/werkblad.css` | Uitsluitend tokens uit `src/ontwerp/tokens.css` (geen enkele hex). Raster 12/6/1, `--wb-rij: 96px`, glaskaarten, verloopachtergronden uit tokens (`.wb-achtergrond-*`), eigen achtergrond via `--wb-eigen`. |
| Aansluiting | `src/App.tsx` | Op «Overzicht» staat `<Werkblad>` (lazy); oude blokken worden op «Overzicht» niet meer los gerenderd (ze zitten erin als `oud-blok` / `snelkoppeling`), op «Recent» zoals voorheen. |

## Raster, telefoon, tablet

- **Pc (12 kolommen)**: widgetbreedte 2…12 kolommen, hoogte 1…6 rijen van 96 px. `plaatsen()` plaatst widgets op volgorde op de eerst beschikbare plek (linksboven) — zonder overlap; de standaardindeling vult het raster **zonder één lege cel** (eenheidstest).
- **Tablet (6 kolommen, ≤ 1100 px)**: een widget neemt de halve breedte (< 8 van 12) of de volledige breedte (≥ 8) in — een rustig tweekolomsraster zonder «gaten» van één kolom. In plaats van ±-knoppen (die op een tablet niets zouden veranderen) zijn er knoppen «hoger/lager»; de formaatgreep blijft beschikbaar.
- **Telefoon (≤ 700 px)**: één kolom in lijstvoogorde, hoogte van elke tegel = de inhoud ervan (geen vaste rijen, niets afgekapt), verplaatsen via knoppen «hoger/lager» (≥ 44 px), geen formaatgreep, geen horizontale scroll.
- Het aantal regels in een widget wordt berekend door `regelsVoor(r, kolommen, …)` (op telefoon — 5); smalle tegels passen zich aan via container zoekopdrachten (`container-type: inline-size` op de tegelinhoud: taaklabels verbergen, tegels voor snelle toegang verkleinen).
- **Slepen**: tijdens het bewegen verandert alleen het *voorbeeld* van de plaatsing (`voorbeeld` → rasterposities), de DOM-volgorde pas na het loslaten (anders verplaatst React de knoop met pointer-capture en gaat het loslaten verloren). Vangnet-handler op `window` (`pointerup`/`pointercancel`/`blur`). Na verplaatsen met toetsenbord of knoppen blijft de focus op hetzelfde element van dezelfde tegel en wordt de wijziging aangekondigd in `aria-live`.
- **Tellers**: een widget meldt een getal in de tegelkop (`zetTeller`): ongelezen berichten, openstaande taken; dezelfde getallen verschijnen op de tegels «Post» en «Taken» in «Snelle toegang».

## Standaardindeling (naar het voorbeeld van de eigenaar)

Persoonlijke ruimte (12 kolommen): begroeting 9×1 | **«Systeeminformatie» 3×2 rechtsboven (op de plek van het weer)**; «Snelle toegang» 5×3, «Agenda» 4×3, rechts «Recente zoekopdrachten» 3×3; «Post» 5×3, «Taken» 4×3, rechts «Snelle acties» 3×2; rij «Recente bestanden» / «Cloudopslag» / «AI voor u» / «Status van diensten» elk 3×3; onderaan tipstrook 12×1 («Mijn widgets» + «Aanpassen»).
Technische ruimte: begroeting, «Systeeminformatie», «Snelle toegang», «Server», «Diagnostiek», «Updates», «Status van diensten», «Recente zoekopdrachten».

## Laden (persoonlijke / technische ruimte)

De server bepaalt de lade uit de sessie en `tabContext` (technisch tabblad met actief profiel → `technisch`). Elke lade heeft **haar eigen rij** en haar eigen standaardindeling (`standaardWerkblad(ctx)`): persoonlijk — begroeting, snelle toegang, agenda, post, taken, zoekopdrachten, snelle acties, bestanden, opslag, AI, diensten, systeem, tip; technisch — begroeting, snelle toegang, server, updates, diagnostiek, diensten, zoekopdrachten, systeem. Technische widgets in de persoonlijke lade worden door `normaliseerWerkblad` zowel op de client als op de server geweigerd.

## Overzetten van oude indeling (F5)

Eerste opening zonder rij op de server → `eersteWerkblad({bureau, blokken}, ctx)`:
1. het oude bureaublad (`hub_bureau_v1`, `src/bureau/api.ts haalBureau`) heeft tegels → elke tegel wordt een widget (`BUREAU_NAAR_WERKBLAD`, formaat en instellingen blijven behouden), plus snelkoppelingsblokken; `herkomst: 'bureau'`;
2. anders — standaardindeling **plus** oude blokken uit `App.tsx` die de mens **zelf heeft aangepast** (`blokAangepast`: eigen blok, andere naam/omschrijving/adres/grootte/weergave/kleur of verborgen): zichtbare `mail/files/calendar` → widget `oud-blok` (dezelfde `HubBlockWidget` met `presentation`/`itemLimit`/`showMeta`), blokken met https-adres → `snelkoppeling`, vóór de tipstrook; `herkomst: 'blokken'`.
   De zes blokken die de server in ELKE nieuwe ruimte plaatst (`STANDAARD_BLOKKEN` = `backend/index.ts const defaults`, gecontroleerd door eenheidstest) zijn ongewijzigd geen menselijke aanpassing: hun inhoud (post, bestanden, agenda) zit al als standaardwidgets in de indeling;
3. anders de standaardindeling.

Verborgen oude blokken worden **niet** op het werkblad geplaatst, maar blijven in de catalogus (categorie «Oude blokken»). Oude tabellen worden niet gewijzigd en niet verwijderd.

## Een widget toevoegen

1. `shared/werkblad-indeling.ts`: voeg de id toe aan `WerkbladWidgetId` en een item in `WERKBLAD_WIDGETS` — `titel`/`uitleg` uk+nl, `k/r/minK/minR`, `stand: 'klaar'` **alleen** met een echte `bron` (de route moet in de backend bestaan — eenheidstest controleert dit), `ruimtes`, zo nodig `enkel`.
2. Als gegevens nodig zijn: voeg een lader toe in `src/werkblad/gegevens.ts` (via `viaBak`, zodat meerdere tegels niet tegelijk dezelfde route aanroepen).
3. Component in `src/werkblad/widgets/` (props `WidgetProps`: `item`, `acties`, `zichtbaar`, `kolommen`, `zetTeller`, `weg`, …); aantal regels via `regelsVoor(item.r, kolommen, …)`, zodat de inhoud zonder interne scroll in de tegel past. Toestanden via `Vlak.tsx`: skelet zolang `!zichtbaar || bezig`, `Fout` met servercode, `NietGekoppeld` met de juiste link, `Leeg`. Navigatie uitsluitend via `acties` (`hubTab`, `dienst`, `zoek`), nooit `location.*` in een widget.
4. `src/werkblad/Werkblad.tsx`: `WIDGET_ICOON[id]` en een `case` in `Inhoud` (lazy import voor zware widgets).
5. Tests: `tests/eenheid/werkblad-indeling-20261022.test.ts` (catalogus/rechten/overzetten), zo nodig een stap in `tests/e2e/hulp/stand-werkblad.ts`.
6. Geen verzonnen logo's: alleen `src/merk/MerkLogo` (officieel), anders een lucide-icoon.

## Weer

Er is bewust geen weerwidget: er is geen toegestane lokale bron zonder externe cloud. In plaats daarvan staat de widget «Systeeminformatie» (`/__gezondheid`, tijd/tijdzone, online, taal/thema).

## Tests

`werkblad-indeling-20261022` (69), `werkblad-routes-20261022` (28; met `run-test-rls.sh` — 29, incl. RLS), `hub-bureau-20261019` (54, regel over `App.tsx` bijgewerkt), `hulp-register` (17; `src/werkblad` valt nu onder de scanner), `hub-agenda-notities-20261019` (64).
Testopstelling: `tests/e2e/hulp/stand-werkblad.ts` (`werkblad-*`: leeg, gevuld + LCP, instellen, catalogus, sleep, toetsenbord, telefoon, axe, tech).
