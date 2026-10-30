# Werkblad — Blokken (blok in blok), vrije maten en plekken

> **Коротко для Власника (українською).** Зараз розмір значків у «Швидкому доступі» та інших вікнах рахується автоматично від ширини вікна, а значки самі переносяться в рядки. Новий режим «Блоки» дозволить: для кожного значка окремо задати місце, розмір, колір, форму, підпис; ставити значки в ряд, колонкою, сіткою або вільно; робити «блок у блоці» з власними розмірами; перетягувати значки між блоками, на робочий стіл, у меню або на сторінку. Усе за прапорцем `werkblad-blokken`, він спершу вимкнений, і тоді все працює точно як зараз. «Авто» лишається стандартом для кожного параметра, а кнопка «Скинути» повертає авто. Від вас потрібні 3 рішення (внизу), для кожного є рекомендація.

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
- Vlag uit → kolom wordt genegeerd (niet gewist), oude weergave. Oud release terug → oude code leest de kolom niet; **risico**: oude code schrijft items opnieuw (DELETE+INSERT) en zou `blok` dan verliezen → stroom A bewaart vóór elke schrijf een kopie in `werkblad_v3_lade.blokken_backup` en de knop «Відновити блоки» zet die terug.
- Server valideert met dezelfde `valideerBlok` (limieten, kleurvorm, itemIds uit register, ruimte).

## 3. Eigenschappenpaneel
Klein zijpaneel (telefoon: onderblad) naast de selectie; tabbladen «Розмір», «Вигляд», «Розташування», «Пристрої». Elke optie: gewone Oekraïense naam, (?)-uitleg, live voorbeeld, «Скинути» per eigenschap (terug naar авто). Bovenaan voorinstellingen: «Автоматично (як зараз)», «Великі значки», «Компактний ряд», «Колонка», «Вільно». Eenheden altijd zichtbaar («пікселів», «% ширини блоку», «частка вільного місця»). Elke handeling toont «Зберігаю…» → «Збережено» of een duidelijke fout met «Спробувати знову».

## 4. Vijf hoofdgevallen (klik voor klik)
1. **Значки більші:** «Редагувати стіл» → клік на «Швидкий доступ» → панель «Вигляд» → «Великі значки» (або «Розмір значка: 56 пікселів») → видно одразу → «Збережено».
2. **Один значок більший, інші менші:** у режимі редагування клік на «Пошта» → «Розмір значка» 72 → «Ширина: 2 клітинки» → інші не змінюються.
3. **Блок у блоці:** виділити «Пошта», «Календар», «Завдання» (Shift+клік) → «Згрупувати» → «Колонка» → новий внутрішній блок, ширина «30 %»; решта лишається сіткою.
4. **Перетягнути значок з блоку на стіл / в інший блок:** потягнути «GitHub» (телефон: довге натискання) за межі блоку → підсвічується стіл → відпустити → став окремим ярликом того ж вигляду. Без миші: «Перемістити в…» → «Робочий стіл».
5. **Значок у меню або на сторінку:** потягнути «Нотатки» на бічне меню → підсвічене місце → відпустити → пункт меню з малим значком. Або «Перемістити в…» → «Меню» / «Сторінка Пошта, верхня панель». «Скасувати» (Ctrl+Z) повертає назад.

## 5. Parallelle stromen (bestandseigendom)
| Stroom | Inhoud | Eigen bestanden (alleen deze stroom wijzigt) |
|---|---|---|
| A — data | `valideerBlok`, blokUitWidget/Map, boombewerkingen, migratie 0116, API `/api/owner/hub/werkblad/v3/blokken/*`, plekken-tabel, backup/herstel, vlag in register | `shared/werkblad-blokken.ts` (contract), `shared/werkblad-blokken-boom.ts`, `backend/werkblad-blokken.ts`, `backend/migraties/0116_*`, `src/werkblad/blokken/api.ts` |
| B — rekenmachine | `bereken`, `icoonPx`, geneste maten, doelzones berekenen (puur) + weergave-component | `shared/werkblad-blokken-rekenen.ts`, `src/werkblad/blokken/BlokWeergave.tsx`, `src/werkblad/blokken/blokken.css` |
| C — eigenschappenpaneel | paneel, voorinstellingen, (?)-uitleg, Скинути, voortgang | `src/werkblad/blokken/Eigenschappen*.tsx`, `src/werkblad/blokken/eigenschappen.css`, teksten in `shared/werkblad-blokken-teksten.ts` |
| D — slepen en plekken | `beoordeelNeerzetting`, sleepregelaar over blok/canvas/menu/pagina, toetsenbord «Перемістити в…», aanraken; koppeling met `menu-slepen.ts` via een adapter (niet erin schrijven) | `shared/werkblad-plekken.ts`, `src/werkblad/blokken/slepen.ts`, `src/werkblad/blokken/PlekKiezer.tsx`, `src/werkblad/blokken/menu-adapter.ts` |
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
