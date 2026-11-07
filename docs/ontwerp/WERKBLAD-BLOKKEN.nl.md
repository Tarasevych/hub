> 🌐 **Taal / Мова:** [Українська](БЛОКИ-РОБОЧОГО-АРКУША.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Werkblad — Blokken (blok in blok), vrije maten en plekken

> **Kort voor de Eigenaar.** Momenteel wordt de grootte van pictogrammen in «Snel toegang» en andere vensters automatisch berekend op basis van de vensterbreedte, en lopen pictogrammen vanzelf om naar nieuwe regels. De nieuwe modus «Blokken» maakt het mogelijk om: voor elk pictogram afzonderlijk plaats, grootte, kleur, vorm en bijschrift in te stellen; pictogrammen in een rij, kolom, raster of vrij te plaatsen; een «blok in een blok» met eigen afmetingen te maken; en pictogrammen te slepen tussen blokken, naar het werkblad, naar het menu of naar een pagina. Alles zit achter de vlag `werkblad-blokken`, die standaard uitgeschakeld is zodat alles precies werkt zoals nu. «Auto» blijft de standaard voor elke eigenschap, en de knop «Herstellen» («Скинути») zet auto terug. Er zijn 3 beslissingen van u nodig (onderaan), elk met een aanbeveling.

## 1. Huidige toestand (audit, master 83a0c9f)

| Plek | Wat bepaalt de maat nu | Bestand:regel |
|---|---|---|
| «Швидкий доступ» (widget `snel-toegang`) | 12 vaste tegels uit `TEGELS`, gefilterd op rechten; geen per-tegel instelling | `src/werkblad/widgets/Start.tsx:44`, `:58-84` |
| idem, raster | `grid-template-columns:repeat(auto-fill,minmax(84px,1fr))`, `grid-auto-rows:minmax(68px,1fr)` → automatisch omlopen | `src/werkblad/werkblad.css:155` |
| idem, icoon | vast 36px kader / 20px tekening | `src/werkblad/werkblad.css:159-160` |
| idem, smal blok | `@container (max-width:380px)` → 70px cellen, 28px icoon, 16px tekening | `src/werkblad/werkblad.css:233` (container op `.wb-tegel-inhoud`, `:72`) |
| idem, telefoon | `@media (max-width:700px)` → minmax(96px) ; `:89` rijhoogte auto | `src/werkblad/werkblad.css:307`, `:89` |
| Widget krijgt alleen `kolommen` (12/6/1 per apparaat), geen eigen maat-instelling | | `src/werkblad/WerkbladV3.tsx:260`, `:59-80` |
| Map (`kind:'folder'`) | kinderen met `parent`, **één niveau** (`maxMapNiveaus:1`); paneel = auto-fill 88px | `shared/werkblad-v3-types.ts:16,40`; `src/werkblad/WerkbladV3.tsx:174-204,264`; `src/werkblad/bibliotheek/bibliotheek.css:59,62` |
| Canvas verbergt kinderen van een map | `items.filter(e => !e.parent)` | `src/werkblad/canvas/kern.ts:48`, `Canvas.tsx:170` |
| Snelkoppeling-maat | register 96×104, min 72×80, max 192×208 (alleen het kader, icoon schaalt niet mee) | `shared/werkblad-register.ts:101` |
| Opslag | per item kolommen; `config` alleen plat (string/number/boolean) → een boom past er NIET in | `backend/werkblad-v3.ts:39-61`; `shared/werkblad-v3.ts:13` |
| Iconenkiezer | auto-fill 44px | `src/werkblad/bibliotheek/bibliotheek.css:41` |
| Zijbalk/menu (ingeklapt) | vaste 44px/36px ronde knoppen | `src/menu-v2.css:113,118,139` |
| Zijbalk-keuze, hub-blokken, recent | auto-fit 240/200/340px; compacte feed auto-fit 140px | `src/menu-v2.css:148,156`; `src/hub-functioneel-blokken.css:1`; `src/hub-recent.css:2` |
| Menu slepen | bestaande eigen sleeplogica (muis 5px, aanraken 450ms, Alt=kopie, Esc) — hergebruiken | `src/menu-slepen.ts:1-12` |

Conclusie: er is geen enkele plek waar de gebruiker icoongrootte of positie per onderdeel kiest; alles is CSS auto-fill + container/media queries.

## 2. Model

- **Blok** = container met `indeling` (modus `vrij` | `rij` | `kolom` | `raster`; tussenruimte, binnenrand, uitlijning hoofd/dwars, omloop, richting, rasterkolommen of auto) en `kinderen`.
- **Onderdeel** = één aanklikbaar ding (register-`itemId`; doel komt altijd uit het register, nooit een vrije URL).
- Elke knoop: `afmeting` (breedte/hoogte als `auto` | `px` | `procent` | `deel`, plus min/max), `positie` (alleen in `vrij`), `volgorde`, `rasterSpan`, `uiterlijk` (achtergrond-, icoon-, tekst-, randkleur als thematoken of #rrggbb; randdikte, vorm, straal, doorzichtigheid, schaduw), `apparaten` (tonen/verbergen per computer/tablet/telefoon), `vergrendeld`.
- Onderdeel extra: `icoon` (grootte, stijl, vervangicoon-id), `label` (tonen ja/nee/auto, plaats onder/rechts/boven/links, grootte, eigen tekst).
- Blok extra: `standaardOnderdeel` = stijl voor alle kinderen zonder eigen waarde (één klik «alle значки 48px»).
- Diepte max 4, max 60 onderdelen per blok, kring onmogelijk (`beoordeelNeerzetting` → `kring`).
- **Standaard is overal `auto`** = exact de huidige CSS-rekenregels (84px cel, 36→28px icoon). Contract: `shared/werkblad-blokken.ts`.

### Plekken
`Plek` = waar iets mag staan: `canvas`, `blok`, `menu`, `pagina` (vak op een pagina), `zijbalk`, `werkbalk`. Elke plek zegt wat ze aanvaardt (onderdeel/blok/widget), max diepte/aantal en toegestane maten (menu = alleen klein). Omzettingen: onderdeel → canvas wordt een gewone snelkoppeling (stijl blijft); onderdeel → menu wordt een menu-item (via bestaande menuvoorkeuren, alleen register-items); technische items alleen in de technische ruimte.

### Slepen en neerzetten
- Muis: start na 5px. Aanraken/pen: lang indrukken 450ms (zoals `menu-slepen.ts`). Esc = annuleren, Alt/Ctrl = kopie.
- Tijdens slepen: doelplek licht op; ongeldige plek toont de reden in tekst («Тут не можна: блок не можна покласти сам у себе»).
- Toetsenbord (gelijkwaardig alternatief): onderdeel kiezen → «Перемістити в…» → lijst van plekken → pijltjes voor volgorde → Enter. Geen native prompts.
- Ongedaan/opnieuw: één geschiedenis per laag (max 50), ook over plekken heen; Ctrl+Z / Ctrl+Shift+Z en knoppen.

### Opslag, migratie, terugdraaien
- WerkbladV3 blijft `v:3`; additief optioneel veld `blok?: BlokInhoud` op een DesktopEntry (widget of map).
- Migratie 0116: kolom `blok jsonb NULL` op `app.werkblad_items`, plus menu/pagina-plekken in een nieuwe tabel `app.werkblad_plekken` (RLS, zelfde versie-per-laag en 409 `WERKBLAD_V3_VEROUDERD`).
- Lui: een widget zonder `blok` wordt pas bij de eerste bewerking omgezet (`blokUitWidget`, `bron:'widget-standaard'`). Mappen blijven mappen tot ze een tweede niveau krijgen; `mapUitBlok` maakt het verliesvrij terug.
- Vlag uit → kolom wordt genegeerd (niet gewist), oude weergave. Oud release terug → oude code leest de kolom niet; **risico**: oude code schrijft items opnieuw (VERWIJDEREN+INSERT) en zou `blok` dan verliezen → stroom A bewaart vóór elke schrijf een kopie in `werkblad_v3_lade.blokken_backup` en de knop «Відновити блоки» zet die terug.
- Server valideert met dezelfde `valideerBlok` (limieten, kleurvorm, itemIds uit register, ruimte).

## 3. Eigenschappenpaneel
Klein zijpaneel (telefoon: onderblad) naast de selectie; tabbladen «Grootte» («Розмір»), «Weergave» («Вигляд»), «Indeling» («Розташування»), «Apparaten» («Пристрої»). Elke optie: duidelijke naam, (?)-uitleg, direct voorbeeld, «Herstellen» («Скинути») per eigenschap (terug naar automatisch). Bovenaan voorinstellingen: «Automatisch (zoals nu)», «Grote pictogrammen», «Compacte rij», «Kolom», «Vrij». Eenheden altijd zichtbaar («pixels», «% van blokbreedte», «aandeel vrije ruimte»). Elke handeling toont «Opslaan…» → «Opgeslagen» of een duidelijke foutmelding met «Opnieuw proberen».

## 4. Vijf hoofdgevallen (stap voor stap)
1. **Grotere pictogrammen:** «Werkblad bewerken» → klik op «Snelle toegang» → paneel «Weergave» → «Grote pictogrammen» (of «Pictogramgrootte: 56 pixels») → direct zichtbaar → «Opgeslagen».
2. **Één pictogram groter, andere kleiner:** klik in de bewerkingsmodus op «Post» → «Pictogramgrootte» 72 → «Breedte: 2 cellen» → de overige veranderen niet.
3. **Blok in een blok:** selecteer «Post», «Agenda», «Taken» (Shift+klik) → «Groeperen» → «Kolom» → nieuw binnenblok, breedte «30 %»; de rest blijft een raster.
4. **Pictogram uit een blok naar het werkblad of een ander blok slepen:** sleep «GitHub» (telefoon: lang indrukken) buiten het blok → het werkblad licht op → laat los → het is nu een afzonderlijke snelkoppeling met hetzelfde uiterlijk. Zonder muis: «Verplaatsen naar…» → «Werkblad».
5. **Pictogram naar de zijbalk of naar een pagina:** sleep «Notities» naar de zijbalk → gemarkeerde plek → laat los → onderdeel in de zijbalk met klein pictogram. Of via «Verplaatsen naar…» → «Zijbalk» / «Pagina Post, bovenbalk». «Ongedaan maken» (`Ctrl+Z`) zet alles terug.

## 5. Parallelle stromen (bestandseigendom)
| Stroom | Inhoud | Eigen bestanden (alleen deze stroom wijzigt) |
|---|---|---|
| A — gegevens | `valideerBlok`, blokUitWidget/Map, boombewerkingen, migratie 0116, API `/api/owner/hub/werkblad/v3/blokken/*`, plekken-tabel, reservekopie/herstel, vlag in register | `shared/werkblad-blokken.ts` (contract), `shared/werkblad-blokken-boom.ts`, `backend/werkblad-blokken.ts`, `backend/migraties/0116_*`, `src/werkblad/blokken/api.ts` |
| B — rekenmachine | `bereken`, `icoonPx`, geneste maten, doelzones berekenen (puur) + weergave-component | `shared/werkblad-blokken-rekenen.ts`, `src/werkblad/blokken/BlokWeergave.tsx`, `src/werkblad/blokken/blokken.css` |
| C — eigenschappenpaneel | paneel, voorinstellingen, (?)-uitleg, «Herstellen», voortgang | `src/werkblad/blokken/Eigenschappen*.tsx`, `src/werkblad/blokken/eigenschappen.css`, teksten in `shared/werkblad-blokken-teksten.ts` |
| D — slepen en plekken | `beoordeelNeerzetting`, sleepregelaar over blok/canvas/zijbalk/pagina, toetsenbord «Verplaatsen naar…», aanraken; koppeling met `menu-slepen.ts` via een adapter (niet erin schrijven) | `shared/werkblad-plekken.ts`, `src/werkblad/blokken/slepen.ts`, `src/werkblad/blokken/PlekKiezer.tsx`, `src/werkblad/blokken/menu-adapter.ts` |
| E — tests en release | eenheidstests per pure functie, E2E (1280/390, donker/licht, vlag aan/uit = oude weergave pixelgelijk), archief .tar.gz+.sha256+BRON-COMMIT | `tests/eenheid/werkblad-blokken-*.test.ts`, `tests/e2e/werkblad-blokken*.spec.ts`, releasenotities |

Integratie (één persoon, laatste): kleine haken in `src/werkblad/WerkbladV3.tsx` (widget met `blok` → `BlokWeergave`) en `src/werkblad/widgets/Start.tsx` (`SnelToegang` levert zijn tegels als itemIds). Niemand anders raakt die twee bestanden aan.

## 6. Risico's
- Terugdraaien naar een oude release kan `blok` overschrijven → backupkolom + herstelknop (A).
- Prestatie bij diepe bomen op telefoon → limieten (diepte 4, 400 knopen), berekening gememoriseerd per blok (B).
- Slepen over grenzen menu/pagina/canvas is het complexste deel; menu heeft al een eigen sleepregelaar → adapter, geen tweede systeem (D).
- Rechten: onderdeel uit technische ruimte mag niet in privé-menu → `niet-toegestaan-in-ruimte`, server controleert opnieuw.
- Kleuren/contrast: vrije kleur kan onleesbaar worden → paneel waarschuwt bij contrast < 4,5:1.

## 7. Beslissingen voor Pavlo (max 3)
1. **Waar mag een onderdeel heen buiten het werkblad?** Aanbevolen: eerst canvas + blokken + zijmenu; pagina-vakken in een tweede stap.
2. **Per apparaat apart of overal hetzelfde?** Aanbevolen: indeling per apparaat (zoals v3 nu), kleur/icoon gedeeld over alle apparaten.
3. **Vrije modus («вільно») overlappen toestaan?** Aanbevolen: nee, onderdelen schuiven opzij (zoals het canvas nu), met een schakelaar «Дозволити накладання» voor wie wil.
