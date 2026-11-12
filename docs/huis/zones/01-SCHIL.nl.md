> 🌐 **Taal:** [Українська](01-КАРКАС.uk.md) · **Nederlands** | [Hoofddocument](../ONTWERP-HUIS-20261110.nl.md)

# Zone 1. Schil en aanpasbare weergave / Каркас

Taak HUIS-001 · fase 0 · 10.11.2026 · status: ter goedkeuring bij de eigenaar

De schil is alles wat de inhoud van de zones omringt: lagen, kop en navigatie, adressen, schermprofielen, wijzerplaten van kleine schermen, de gegevensstroom, de eerste start, de app en meldingen op het apparaat. De zones leveren inhoud aan in vakken; het aantal vakken, hun volgorde en hun gedrag horen bij de schil. Normatieve bronnen: plan HUIS-001 (§1, §3, §3.8, §4) en de ontwerptaal ‘Живий дім / Levend huis’ (hierna: OT).

## 0. Wat er is veranderd ten opzichte van de vorige versie

- De schil is herschreven voor ‘Levend huis’: een hemel die de fasen van de dag volgt, de huiszin en de doorsnede; glas alleen voor de kop, de navigatie, de omhulling van bladen en Opdracht. De zijbalk is vervangen door een glazen kop met zes secties (OT §7).
- Toestemmingen volgens het besluit van de eigenaar (plan §3.8): drie standen voor elke actie en elke uitvoerder, standaard ‘Uit’, alleen de eigenaar wijzigt ze; de schil voegt geen plafonds en geen termijnen toe.
- De toestanden van een opdracht zijn afgestemd op de twaalf gedeelde toestanden van OT §9, de stroom op plan §4, de fasen op de schaal 0–12.

**Houvast in de code.** `resolve()` in `public/canonical-service.js` leest het eerste segment en de parameter `tab`; `replaceLegacy()` leidt bij `tab`, `service` of `lang` om naar een adres met één segment, waardoor een dieper pad verloren gaat (oplossing — §18). De maquette toont een herbevestiging van de aanmelding volgens het doel van OT §10: elke keer opnieuw, zonder onthouden; hoe de huidige code werkt — §18, punt 1.

## 1. Lagen van de schil

| Laag | Wat van de schil erop ligt |
|---|---|
| 0. Hemel `hv-hemel` | achtergrond van de pagina: op ‘Thuis’ volledig, met de held `hv-held`, elders ‘stil’ (zonder gloed en penseelstreek) |
| 1. Papier `--panel` | alles met getallen: tegels, chips, blokken in bladen, regels van Opdracht, wijzerplaten van kleine schermen, `hv-gevaar` |
| 2. Glas `--hv-glas` | kop `hv-kop`, onderbalk `hv-onderbalk`, omhulling `hv-laag` en `hv-opdracht` |
| 3. Nood `hv-nood` | 2–3 grote acties op `--fout-zacht` |

Een getal op glas staat alleen in een papieren chip. De effen terugvalweergave schakelt zichzelf in (OT §2); «Полегшений вигляд / Zuinige weergave» (`.is-licht`) staat standaard uit: alleen de eigenaar zet het aan in de registratie van het scherm (§6), of het paneel doet het zelf bij trage beelden (OT §2); in «Мій вигляд / Mijn weergave» zit er geen schakelaar voor. De volgorde van de lagen volgt de tokens `--hv-z-*` (OT §8), allemaal in één wortel `hv-lagen`. Een simulatie wordt aangeduid met de vaste chip `hv-sim`; de hemel volgt daarin de huistijd, met het onderschrift «небо за часом дому / hemel volgt huistijd».

## 2. Omhulling en navigatie

```
BUREAU 1280 px
┌ glas · kop 56 px (één regel) ────────────────────────────────────────────┐
│ [Thuis ▾] Thuis Kamers Energie Beveiliging Garage Automatisering         │
│                           [Opdracht] [×60]     [● live] [!2] [bel 3] [⚙] │
└──────────────────────────────────────────────────────────────────────────┘
  hemel: Thuis is het warm en rustig. Er branden  ╱╲    huis in doorsnede
  vier lampen, deur op slot. [Avond] [8 °C]      │■ ▢│  huistijd 17:42
┌ papier ───────────────────────────────────┐ ┌ glas: blad 400 px ─────┐
│ [Nu] Plattegrond Apparaten Klimaat Media  │ │ Bediening              │
│ 12 kolommen: hv-tegel, hv-blok            │ │ Geschiedenis …         │
└───────────────────────────────────────────┘ └────────────────────────┘

TELEFOON 390 px
┌ glas · kop 48 px ────────────────────┐
│ (Avond · 17:42)    [▲2] [●] [!2] [3] │
│ hv-sim 28 px: ×60                    │
│ hemel volgt huistijd                 │
└──────────────────────────────────────┘
  hemel ≤ 25svh: zin op 2 regels, chips ⟶
  Nu belangrijk · Scènes · Favorieten · Doorsnede
  [melding over de volle breedte]
  [ondervak: Drone 1 · 61 % · Naar huis]
                               [Opdracht]
┌ glas · onderbalk 56 px ──────────────┐
│ Thuis Kamers Energie Beveiliging Meer│
└──────────────────────────────────────┘
```

**Secties.** Vanaf 700 px staan er zes in de kop: «Дім / Thuis · Кімнати / Kamers · Енергія / Energie · Безпека / Beveiliging · Гараж / Garage · Автоматика / Automatisering»; de bel leidt naar het Logboek, het tandwiel naar Systeem. Telefoon: «Дім · Кімнати · Енергія · Безпека · Ще / Thuis · Kamers · Energie · Beveiliging · Meer»; in het blad ‘Meer’ staan Garage, Automatisering, Systeem, «Екран / Paneel», «Мій вигляд / Mijn weergave» en «Встановити застосунок / App installeren». Garage heeft op de telefoon een samenvatting op ‘Thuis’ en schuift naar het ondervak zodra er iets vliegt, rijdt of laadt.

**De kop op de computer** van links naar rechts: `hv-huisstand` (de naam van de woning staat in `aria-label`), zes secties (een streep `--accent` onder de actieve — het enige accent op glas), «Команда / Opdracht» met de sneltoets `Ctrl K`, `hv-sim`, `hv-versheid`, ‘! N’ (alleen als ‘Altijd’ geldt voor een gevaarlijke of kritieke actie), de bel en het tandwiel; tijdens een pauze verschijnt de chip «Самостійні дії зупинено / Zelfstandige acties gestopt». **Breedtebudget:** op 1100–1439 px toont de huisstand een pictogram en een woord, `hv-versheid` alleen een pictogram, `hv-sim` ‘×60’ en Opdracht geen sneltoets (≈ 1080 px in het Oekraïens); passen de Nederlandse sectienamen niet, dan gaan ze in 12/600 onder het pictogram staan. Een waarde wordt nooit afgekapt; controle in beide talen op 1100, 1280 en 1440 px.

**De kop op de telefoon** is 48 px: links de naam van de sectie of de ingeklapte regel van de held (drie stappen — OT §7), rechts tot vier doelen van 44 px — de chip ‘belangrijk’, `hv-versheid`, ‘! N’ en de bel; daaronder de regel `hv-sim` van 28 px.

**De onderzone van de telefoon** van onder naar boven: de balk van 56 px plus `env(safe-area-inset-bottom)` → één ondervak `hv-onderslot` (vluchtbalk `hv-vluchtbalk` > selectiebalk `hv-selectiebalk` > minispeler; wat verliest, wordt een regel in het blad ‘Status van het huis’) → rechts het vierkant ‘Opdracht’ van 56 px (geen cirkel: het leidt dieper) → daarboven zwevende meldingen over de volle breedte. Op bredere schermen staan meldingen rechtsonder, 360 px breed, hoogstens drie; daarna volgt de regel «Ще N / Nog N» in `hv-meldingen`.

**Tweede niveau.** Het eerste tabblad is de huidige toestand van de sectie: «Зараз / Nu» (in Beveiliging «Стан / Status», in Automatisering «Правила / Regels»). Een derde niveau bestaat niet — daarvoor zijn er opgeslagen filters of een blad. Tabbladen met een eigen adres (`/apparaten`, `/klimaat`, `/media`, `/scenes`, `/assistent`) markeren hun eigen sectie.

**Het blad «Стан дому / Status van het huis»** (`?blad=status`) opent via de chip ‘belangrijk’ op elke pagina behalve ‘Thuis’ (daar scrolt de chip naar ‘Nu belangrijk’): alle uitzonderingsregels in de volgorde van de ladder uit §3, elk met één actie («Повернутися додому / Naar huis», «Відкрити запит / Verzoek openen», «Показати в реєстрі / In register tonen»); «Зупинити самостійні дії / Zelfstandige acties stoppen» met de vinkjes ‘automatiseringen · optimalisator · agenten’; «Тривають / Lopend» en de verbindingsketen ‘browser — tunnel — server — bron’ (die ook opengaat met een tik op `hv-versheid`).

## 3. Uitzonderingsladder

Eén rangorde voor alle profielen: ze ordent ‘Status van het huis’ en bepaalt de inhoud van de ingeklapte regel van de held en de tijdelijke wijzerplaten van kleine schermen.

| Trede | Wat het inneemt | Hoe lang |
|---|---|---|
| 1. Rook, gas, water | `hv-nood`: op kleine schermen en `tv` het hele scherm, op bredere een strook bovenaan | tot het is bevestigd en de sensor rustig is |
| 2. Inbraakalarm | hetzelfde; `.is-nood` schakelt hemel en glas uit | tot het alarm is uitgeschakeld of bevestigd |
| 3. Oproep van de deur `hv-oproep` | laag `--hv-z-oproep`; wijzerplaat `deurbel` | 60 s of tot er wordt opgenomen |
| 4. Dronevlucht | het ondervak, wijzerplaat `drone` | de vlucht en 30 s na de landing |
| 5. Verzoek `hv-verzoek` | de chip ‘belangrijk’, wijzerplaat `verzoek` | tot er een besluit is of tot ‘Wacht tot’ |
| 6. ‘Lopend’ | een regel in het blad | zolang het duurt |
| 7. Gekozen wijzerplaten | hun eigen vakken | — |

Na een trede keert het scherm terug naar wat gekozen was; de treden 4–6 raken tijd, saldo en stromen niet aan, een lagere trede geeft ‘+N’.

## 4. Adressen

Een pagina is `/<sectie>[/<tabblad>][/<object>]`; al het andere zijn parameters; ankers met `#` bestaan niet.

| Parameter | Waarde |
|---|---|
| `blad` | `<soort>:<id>` (`apparaat`, `kamer`, `agent`, `voertuig`) of `meldingen`, `status`, `verbinding`, `meer`, `huisstand`, `alarm`; de soort registreert de zone |
| `deel` | tabblad van een blad: `bediening`, `geschiedenis`, `instellingen`, `kaders` |
| `dialoog` | `opdracht`, `nieuw`, `delen`, `sneltoetsen`, `start`, `koppelen` |
| `t` | moment in huistijd → «Перегляд минулого / Terugblik» |
| `van`, `tot`, `periode`, `datum`, `filter`, `entiteit`, `verdieping`, `kaartlaag` | parameters van de zones |

- Gereserveerd door het platform: `tab`, `service`, `lang`, `state`, `code`, `error` — daarom heet het tabblad van een blad `deel`. Identificatoren zijn stabiel; dienstwoorden (`nieuw`, `plattegrond`) zijn als identificator verboden.
- Secties: `/overzicht`, `/kamers`, `/energie`, `/beveiliging`, `/garage`, `/automatiseringen`, het Logboek `/activiteit`, Systeem `/instellingen/…` (`/integraties`, `/showroom`, `/planner` zijn omleidingen), het risicoregister `/instellingen/risico`, toestemmingen `/instellingen/toestemmingen`, schermen `/instellingen/schermen`, het scherm zelf `/paneel/<profiel>/<id>`. Nieuwe id's van het platform: `garage`, `climate`, `media`, `panel` — in één wijziging, samen met een test op overeenkomsten in `SLUG_TO_ID`. Een onbekend adres of tabblad, of een adres zonder rechten, geeft «Не знайдено / Niet gevonden» met een link naar ‘Thuis’.
- **Koude overgang.** Een adres, snelkoppeling, melding, QR-code of NFC-label opent alleen een weergave; `hv-gevaar` gaat niet open via een adres (OT §10) — je ziet de pagina met de betreffende tegel gemarkeerd. Een parameter `actie` bestaat niet. Dit is een regel van het menselijke ritueel, niet van de toestemmingen: uitvoerders met ‘Altijd’ handelen zoals de eigenaar heeft gekozen.

## 5. Schermprofielen

Een gewoon adres kiest op basis van de breedte `telefoon` (320–699), `wand` (700–1099), `bureau`, `breed` of `ultrabreed`; de overige profielen alleen via `/paneel/<profiel>/<id>`. Levering: **B** — browser, **A** — afbeelding van de server, **G** — gegevens voor firmware (§6). Hemel, glas, dichtheid en ritueel van elk profiel staan in OT §7.

| Profiel | Lev. | Getoond | Bediening |
|---|---|---|---|
| `horloge` 200–400 | G, A | 3 wijzerplaten en 1 tijdelijke | tik, ‘‹ ›’ |
| `telefoon` 320–699 | B | alles; bladen van onderen | tik, Opdracht |
| `wand` 700–1099 | B | Thuis, Kamers, Energie, Beveiliging, Garage; zonder Systeem en zonder bewerken | doelen van 56 px, paneelcode |
| `bureau` 1100–1799 | B | alles; blad rechts, 400 px | muis, toetsenbord |
| `breed` 1800–2399 | B | plattegrond of kaart ernaast (6 van de 16 kolommen) | idem |
| `ultrabreed` vanaf 2400 | B | plattegrond 720 │ inhoud │ blad en het Logboek live | grenzen zijn met een greep te verslepen |
| `tv` | B | hemel over het hele scherm, een rij kaarten, schaal 1,5 | afstandsbediening, focusring |
| `strook` vanaf 3:1 | B, A | tijd │ saldo en prijs │ stromen │ uitzonderingen │ favorieten; daglint | tik |
| `vierkant`, `rond` 480–720 | B, A, G | wijzerplaat van een kamer: `hv-wijzer` of een boog langs de rand | tik, ‘−/+’ |
| `klein` 800×480 | B, A | 2 wijzerplaten, tot 4 knoppen | tik |
| `deur` staand | B | vóór de code: tijd, weer, oproep; daarna «Йду / Ik ga weg», «Я вдома / Ik ben thuis» | code |
| `inkt` | A, G | zin, uitzonderingen, 4–8 tegels; verversen hoogstens 1/min | genummerde knoppen |

- In fase 0 worden `horloge`, `rond`, `vierkant` en `inkt` alleen in een browservenster gecontroleerd, met de aanduiding ‘browser’ of ‘beeld van de server’; horloges krijgen alleen gegevens. `strook`: aantal cellen = breedte ÷ 320; onder 360 px hoogte zonder daglint.
- `wand` op een gewoon adres: zes secties, gewone dichtheid; paneelcode, rustbeeld (na 2 min) en terugkeer naar ‘Thuis’ (na 5 min) alleen via `/paneel/wand/<id>`; de termijnen wijzigt de eigenaar in de registratie van het scherm.
- **Televisie.** Ik raad een mediaspeler met Chromium vanaf versie 108 in kioskmodus aan (`/paneel/tv/<id>`). De ingebouwde browser (webOS, Tizen, vanaf Chromium 79) krijgt «Обмежений телевізійний режим / Beperkte tv-modus» (niet te verwarren met de ‘Zuinige weergave’ `.is-licht`): zonder plattegrond, live grafieken en camera's, peiling elke 30 s, een raster zonder `@container`. Toetsen: pijltoetsen, `OK` (13), ‘Terug’ (461 webOS, 10009 Tizen, `Escape`, `Backspace`) — sluit op het hoogste niveau de pagina niet; ‘Menu’ — `ContextMenu` of lang indrukken van `OK`. Rustbeeld na 10 min zonder afstandsbediening; op OLED geen stilstaande lichte stroken.
- Controles van de maquette: de formaten uit plan §6 en daarnaast 3440×1440, 5120×1440, 1920×360 en 480×1920; drie thema's en twee talen.

## 6. Wijzerplaten en externe schermen als apparaten

**Обличчя / Wijzerplaat** (anatomie — OT §7). De schil beheert de vakken en de limiet, de zones leveren de inhoud.

| Wijzerplaat | Zone | Actie |
|---|---|---|
| `toestand` «Стан / Toestand» | Thuis | huisstand |
| `energie`, `prijs`, `laden` | Energie, Garage | «Зупинити зарядку / Laden stoppen» |
| `alarmen` «Тривоги / Alarmen» | Beveiliging | «Показати / Tonen» |
| `kamer` | Kamers | ‘−/+’, licht |
| `actie`, `media`, `beveiliging` (alleen op privéschermen) | Automatisering, Media, Beveiliging | scène; pauze en volume; «Замкнути все / Alles vergrendelen» |
| tijdelijk: `deurbel`, `drone`, `verzoek` | Beveiliging, Garage, AI | «Відповісти / Opnemen»; «Повернутися додому / Naar huis»; «Відкрити / Openen» |

Een scène met een gevaarlijke stap wordt op een klein scherm uitgevoerd met het ritueel van het profiel. Wijzerplaten kies je in `hv-indeling` met de knoppen «Вгору / Omhoog» en «Вниз / Omlaag»: horloge — 3, `vierkant` en `rond` — de kamer en 2, `strook` — 4 of 2, `klein` — 2.

**Sessie ‘scherm’, geen rol.** Gekoppeld aan een rij in `huis_schermen`, geldt alleen voor de dienst huis en kan geen aanmelding bevestigen; de server houdt per profiel een lijst van routes bij en weigert alles daarbuiten; kamers en rollen zitten in het serverfilter en in de RLS-tests. De sessie verloopt niet vanzelf: ze geldt tot ‘Intrekken’ of tot een termijn die de eigenaar instelt.

**Aansluiting:** browser — `/paneel/…` en de stroom; afbeelding — `GET /api/huis/scherm/<id>/beeld` (dezelfde wijzerplaat, uit een SVG-sjabloon omgezet naar een rasterbeeld: 1 bit, 4 grijstinten of kleur, met ingebrande «Симуляція / Simulatie»); gegevens — `GET /api/huis/scherm/<id>/gezicht` (beknopte `JSON`: waarde, eenheid, toestand, ouderdom, actienummers) voor firmware zoals ESPHome. Een druk op een knop bij A en G is een ondertekend verzoek met een actienummer en een teller tegen herhaling; de auteur is «фізична кнопка / wandknop»; het ritueel is zoals op `inkt`.

**Registratie van een scherm:** aansluiting, profiel, kamer, plaats (privé · doorgang · zichtbaar van buiten), wijzerplaten, dichtheid, thema, taal, nachtelijk dimmen, helderheid, «Полегшений вигляд / Zuinige weergave», termijnen voor rustbeeld en terugkeer, «Перезавантажити / Herstarten», «Показати текст / Tekst tonen», laatste contact en ‘Intrekken’. Koppelen gaat met een code van 6 cijfers en een QR-code op het scherm; de eigenaar bevestigt in `?dialoog=koppelen` met de aanmelding van het platform.

**Codes op gedeelde schermen** (`hv-pincode`; na vijf fouten een pauze van 5 min en een vermelding in het Logboek). Het ritueel van een menselijke actie volgt OT §10: een code is alleen nodig waar de actie een bevestiging van de aanmelding vraagt of waar het Logboek moet weten ‘wie’. De paneelcode bevestigt geen enkele actie: ze ontgrendelt alleen de weergave op een doorgangsscherm of een scherm dat van buiten te zien is (zie ‘Privacy’).

| Actie van een mens op `/paneel/*` | Wat er nodig is |
|---|---|
| gewoon | niets: direct |
| gevoelig (‘Nacht’, ‘Afwezig’, het alarm inschakelen) | niets: direct, «Повернути / Ongedaan maken» 10 s; waar terugdraaien onmogelijk is, een knop die 3 s aftelt |
| gevaarlijk | de houdrail; op `tv` `OK` vasthouden of een knop met aftelling, op `horloge`, `strook` en `inkt` een knop die 3 s aftelt |
| kritiek | persoonlijke code als bevestiging van de aanmelding en de houdrail; op `tv`, `horloge`, `strook` en `inkt`: «Підтвердьте на телефоні / Bevestig op je telefoon» |
| goedkeuring van een `hv-verzoek` | persoonlijke code en het ritueel van het niveau van de actie |
| wijziging van `hv-stand` | alleen de eigenaar, op een persoonlijk apparaat |

`deur` accepteert een persoonlijke code of een gastcode, geen paneelcode, en vergrendelt na 30 s.

**Privacy.** Doorgangsschermen en schermen die van buiten te zien zijn, tonen vóór de paneelcode of een persoonlijke code alleen tijd, weer en oproep. De schakelaar «Показувати присутність, режим і замки / Aanwezigheid, stand en sloten tonen» staat standaard uit. Gasten en kinderen zien «вдома хтось є / er is iemand thuis», zonder namen. Het gebied van het codetoetsenbord wordt op binnencamera's gemaskeerd.

**Kiosk:** zonder platformomlijsting (modus `CanonicalChrome`); het scherm gaat niet slapen; 's nachts donker thema en gedimd beeld, een tik wekt het voor 30 s; herstart om 04:00; zwijgt de stroom 2 min, dan «немає зв'язку / geen verbinding». `hv-nood` dekt alles af, en de knop ‘Zelfstandige acties stoppen’ daarin mag iedereen indrukken. De paniekknop opent «Справді тривога? / Echt alarm?» met een knop die 3 s aftelt en «Скасувати / Annuleren».

## 7. Toestemmingen in de schil

Het model volgt plan §3.8 en OT §10; de schil geeft het een plaats en voegt geen beperkingen toe.
- Elke actie heeft een `hv-stand` «Вимкнено / Uit · Питати / Vragen · Завжди / Altijd», afzonderlijk voor elke uitvoerder: scène, automatisering, optimalisator en elke agent. Standaard ‘Uit’; de eigenaar kan voor elke actie elke stand kiezen. De kaders ‘termijn · kamers · uren · actiebudget’ zijn optioneel en alleen de eigenaar stelt ze in.
- Alleen de eigenaar wijzigt een toestemming, op een persoonlijk apparaat (`telefoon`, `bureau`, `breed`, `ultrabreed`, `wand` op een gewoon adres) en met bevestiging van de aanmelding van het platform; op `/paneel/*` en `tv` staan de stand als tekst en een aanduiding. Een agent kan rechten niet uitbreiden en niet inperken — niet de eigen en niet die van anderen: daarvoor bestaat geen bedieningselement en geen hulpmiddel.
- ‘! N’ in de kop telt de geldende ‘Altijd’ voor gevaarlijke en kritieke acties, heeft de vorm van het hoogste niveau en leidt naar `/instellingen/risico`; sluiten kan niet. Naast elke zulke `hv-stand` staat een ‘!’ met vijf regels over het risico.
- De pauze ‘Zelfstandige acties stoppen’ verandert geen standen; alleen de eigenaar hervat.
- Poorten die een weigering noemt: bron («лише читання / alleen-lezen») → rol («немає доступу / geen toegang») → voor een uitvoerder: pauze → stand → kaders van de eigenaar. Het risiconiveau houdt een mens niet tegen — het bepaalt alleen het ritueel.
- Elke wijziging van een toestemming en elke actie op basis daarvan levert een vermelding in het Logboek op, ‘wie · wat · waarom · was → werd · via welke toestemming’, en een melding via `emitCanonicalNotice`; niemand kan dit uitschakelen.

## 8. Bediening zonder uitzondering

Het bedieningsblad van elke apparaatklasse (plan §3.5, OT §9) opent als `?blad=apparaat:<id>&deel=bediening` vanuit een tegel, de plattegrond, Opdracht, zoeken, een melding en een adres; het contextmenu `hv-menu` biedt dezelfde acties. Een nieuwe klasse wordt toegevoegd met een vermelding in het bladenregister, zonder de schil te wijzigen. Agenten krijgen de volledige set hulpmiddelen (lezen, bediening van alle klassen, scènes, regels, energie, camera's, vervoer, drones, simulator) via de groep `huis` van de koppeling; elk hulpmiddel gaat door de poorten van §7 en laat een auteursteken, een melding en een vermelding in het Logboek achter.

## 9. Команда / Opdracht

Eén palet: het platformbrede `ZoekGlobaal` met de aanbieder ‘Thuis’; in de module zet `Ctrl K` die aanbieder vooraan. Er wordt op de server gezocht (`/api/huis/zoek`), met inachtneming van de rechten: beide talen, Latijns schrift, een verkeerde toetsenbordindeling, tikfouten en aliassen. Een lege zoekvraag toont «Недавні / Recent», «Часті / Vaak» en de zes werkwoorden van OT. De eerste `Enter` toont het gevolg van een proefuitvoering (`/api/huis/gevolg`), de tweede voert uit; gevaarlijke en kritieke acties openen `hv-gevaar`.

## 10. Directe gegevens en verbinding

- Stroom `POST /api/huis/stroom` via `fetch`: momentopname → wijzigingen, dringende meteen, de rest eens per 250 ms; de server filtert op rechten. Eén stroom voor alle tabbladen (`Web Locks`, `BroadcastChannel`), met terugvalpeiling elke 30 s. De drempel ‘verouderd’ hangt af van de klasse (P1 60 s … drone 10 s).
- Toestanden van een opdracht (OT §9): «очікує / wacht» tot 10 s → bij klassen met een verloop «виконується / bezig» → de waargenomen waarde of «не виконано / niet uitgevoerd»; zonder terugkoppeling «стан припущено / toestand verondersteld».
- Zonder netwerk: de laatste momentopname en de strook «Показано стан на 14:32 · лише перегляд / Stand van 14:32 · alleen bekijken»; een wachtrij voor opdrachten bestaat niet. De strook `hv-verbinding` noemt de oorzaak: apparaat, tunnel of server; zwijgt een bron, dan staat dat alleen op haar eigen tegels. `?veilig=1` of twee mislukte starts geven «Скинути й оновити / Wissen en vernieuwen».

## 11. Laden en eerste start

Start: omhulling uit de cache → `hv-skelet` → momentopname met ouderdom → stroom; lege toestanden tonen `hv-leeg`. Eerste start `?dialoog=start`: (1) naam van het huis en «Відновити з копії / Herstellen uit back-up»; (2) «Де дім? / Waar staat het huis?» — in de simulatie «Утрехт (приклад) / Utrecht (voorbeeld)», voor een echt huis postcode en huisnummer, huistijd Europe/Amsterdam; (3) «Запустити симулятор / Simulator starten», als tweede keuze «Під'єднати джерело / Bron koppelen»; (4) «Що це за екран? / Welk scherm is dit?». Daarna volgt het blok «Перші кроки / Eerste stappen»: «Запросити мешканців / Bewoners uitnodigen» en «Увімкнути сповіщення на цьому пристрої / Meldingen op dit apparaat aanzetten».

## 12. App en meldingen op het apparaat

Manifest van het knooppunt huis («Дім / Thuis»), een installatiebanner en een handleiding voor iOS. Meldingen op het apparaat komen van de eigen server, toestemming wordt na een tik gevraagd; controle: geïnstalleerd · toegestaan · testmelding aangekomen. Op het vergrendelscherm standaard zonder details: «Дім: потрібна ваша увага / Thuis: aandacht gevraagd». Knoppen alleen voor acties waarvan het ritueel daar mogelijk is (gewone en gevoelige: «Приглушити дзвінок / Bel dempen», «Замкнути / Vergrendelen», «Відхилити / Afwijzen»); bij gevaarlijke en kritieke acties alleen «Відкрити / Openen». Rook en lekkage hebben een reservekanaal nodig.

## 13. Toegankelijkheid, taal, snelheid

- «Перейти до вмісту / Naar de inhoud», oriëntatiepunten, terugkeer van de focus; focusring `--focus` van 2 px (`tv` — 3 px, afstand 4); het tegelraster is één `Tab`-stop met pijltoetsen; sneltoetsen op basis van `event.code` zijn opnieuw toe te wijzen.
- Vasthouden 1,2 s (instelbaar tot 2 s), ernaast een knop die 3 s aftelt; `hv-stand` is een knoppengroep met `aria-pressed`.
- Eén aankondigingsgebied `hv-aankondiging`: beleefd — hoogstens eens per 5 s, dwingend — alleen bij alarm. Zoom 200 % op 320 px; «Простий режим / Eenvoudige modus» — 6–8 tegels.
- Het bouwproces controleert `tr()` op beide talen; `Intl`, `meervoud()`. `LCP` ≤ 2,5 s, `INP` ≤ 200 ms, `CLS` ≤ 0,1. De twee laatste versies van Chrome, Edge, Safari en Firefox; iOS 16.4+; oudere krijgen «Цей браузер застарий / Deze browser is te oud».

## 14. Toelichting op gevolgen en weigeringen

De teksten zijn sjablonen in `tekst.ts` (vaste teksten uit het register van bedieningselementen, berekende uit `/api/huis/gevolg`); het bouwproces zoekt bedieningselementen zonder toelichting.

- **‘i’ bij ‘Alle lampen uit’.** «Що станеться: вимкнеться 14 ламп у 6 кімнатах. Пов'язано з: сцена „Вечір“ перестане діяти. Як повернути: „Повернути“ 10 с у сповіщенні.» / «Wat er gebeurt: 14 lampen in 6 kamers gaan uit. Hangt samen met: scène ‘Avond’ is niet meer actief. Terugdraaien: ‘Ongedaan maken’ 10 s in de melding.»
- **‘i’ bij het tonen van aanwezigheid op een gedeeld scherm.** «Що станеться: з коридору чи вулиці буде видно, чи є хтось удома, режим дому й замки. Пов'язано з: усі, хто бачить екран, зокрема гості. Як повернути: цей самий перемикач.» / «Wat er gebeurt: vanaf de gang of de straat is te zien of er iemand thuis is, de huisstand en de sloten. Hangt samen met: iedereen die het scherm ziet, ook gasten. Terugdraaien: dezelfde schakelaar.»
- **‘!’ bij ‘Altijd’ voor ‘Voordeur ontgrendelen’ door een agent.** «Що може статися: агент відімкне двері без вашого схвалення. Пов'язано з: охорона периметра. Як повернути: „Замкнути“. Хто зможе це запускати: агент „Помічник“. Як вимкнути: обрати „Вимкнено“ тут або в реєстрі ризиків.» / «Wat er kan gebeuren: de agent ontgrendelt de deur zonder jouw goedkeuring. Hangt samen met: alarm schil. Terugdraaien: ‘Vergrendelen’. Wie dit kan starten: agent ‘Assistent’. Uitzetten: kies hier ‘Uit’ of in het risicoregister.»
- **Weigering op de tv.** «Чому ні: зняття охорони потребує підтвердження входу, а телевізор його не приймає. Що перевірити: чи з вами телефон. Що можна натомість: підтвердити на телефоні — запит уже там.» / «Waarom niet: het alarm uitzetten vraagt om opnieuw aanmelden en de tv kan dat niet. Wat te controleren: of je telefoon bij je is. Wat wel kan: bevestigen op je telefoon — het verzoek staat er al.»

Op `tv` is de ‘i’ een apart focuselement; op de wand een doel van 56 px; op `horloge`, `strook` en `inkt` een bevestigingsstap.

## 15. Schermen van de zone met adressen

- Omhulling voor computer, telefoon en `ultrabreed`: `/overzicht`, `/kamers`, `/energie`, `/beveiliging`, `/garage`, `/automatiseringen`.
- De bladen ‘Meer’, ‘Status van het huis’, de verbindingsketen en het meldingencentrum: `?blad=meer`, `status`, `verbinding`, `meldingen`; de bladen van apparaat, kamer, huisstand en beveiliging: `?blad=apparaat:<id>&deel=…`, `kamer:<id>`, `huisstand`, `alarm`; het Logboek: `/activiteit`.
- Opdracht, «Копіювати посилання / Link kopiëren» met QR-code en de sneltoetsen: `?dialoog=opdracht`, `delen`, `sneltoetsen`; ‘Terugblik’: `?t=`; de eerste start: `/overzicht?dialoog=start`.
- Schermen: `/instellingen/schermen`, `…/<id>`, `…/<id>/indeling`, `?dialoog=koppelen`; koppelen op het apparaat: `/paneel`; 13 profielen: `/paneel/<profiel>/<id>`.
- Systeem van de schil: `/instellingen/risico`, `/toestemmingen`, `/meldingen`, `/tunnel`, `/toegankelijkheid`.
- Zonder eigen adres: ‘Niet gevonden’, `?veilig=1`, verouderde browser, rustbeeld, `hv-nood`, `hv-pincode`, ‘Echt alarm?’, koude overgang, strook zonder netwerk, bijwerken van de client.

## 16. Onderdelen

- **Nieuw in de schil:** `hv-schil` (wortel met profiel en dichtheid, vervangt `useSmal(760)`), `hv-kop`, `hv-onderbalk`, `hv-onderslot`, `hv-subtabs` (op basis van `TabsRij`), `hv-statusblad`, `hv-verbinding`, `hv-verbindingsketen`, `hv-meer`, `hv-menu`, `hv-selectiebalk`, `hv-scherm`, `hv-gezicht`, `hv-indeling`, `hv-sluimer`, `hv-koppel`, `hv-schermkaart`, `hv-sneltoetsen`, `hv-installeer`, `hv-aankondiging`, `hv-eerste-stappen`.
- **Uit de bibliotheek van OT, door de schil geplaatst:** `hv-hemel`, `hv-held`, `hv-lagen`, `hv-laag`, `hv-versheid`, `hv-sim`, `hv-opdracht`, `hv-meldingen`, `hv-toost`, `hv-nood`, `hv-pincode`, `hv-gevaar`, `hv-rail`, `hv-stand`, `hv-gevolg`, `hv-leeg`, `hv-skelet`, `hv-huisstand`, `hv-vluchtbalk`, `hv-oproep`.
- **Geen onderdelen:** de opslag `huis-stroom`; de routes `/api/huis/stroom`, `/scherm/<id>/beeld`, `/scherm/<id>/gezicht`, `/gevolg`, `/zoek` en de ondertekende schermactie.

## 17. Gedekt en uitgesteld

**Gedekt in fase 0** (specificatie en maquette): alles uit de hoofdstukken 1–16 van dit document.

**Per fase:** 1 — `hv-schil`, kop, onderbalk, adressen, stroom, hemel, ‘Thuis’, ‘Kamers’, daglint; 2 — bladen voor alle klassen, `hv-stand`, het risicoregister en ‘! N’, pauze, meldingencentrum, audit, `hv-nood`; 3 — Opdracht en zoeken; 4 — `hv-vluchtbalk` in het ondervak; 5 — `hv-verzoek`, wijzerplaat `verzoek`, hulpmiddelen voor agenten; 6 — `/paneel/*`, kiosk, koppelen, app en meldingen op het apparaat, wijzerplaten, afbeelding en gegevens; 7 — ‘Terugblik’; 8 — rollen en privacy van gedeelde schermen; 9 — oproep van de deur, paniekknop, cameramaskers; 10 — minispeler; 11 — «Обслуговування / Onderhoud», ontdekken van apparaten; 12 — echte bronnen, controle van firmware en televisies.

**Later op de schaal:** spraak in Opdracht — fase 5, samen met de Huisassistent, na het besluit over de microfoon in de browser (§18, punt 5); tot dan neemt Opdracht tekst en aanraking aan.

**Buiten de schaal** (geen bedieningsinstrumenten): meerdere panelen in één bewerkingsscherm; Engels als terugvaltaal (taalwet); inbedden in andere pagina's en elementen op het startscherm.

## 18. Besluiten voor de eigenaar

1. Bevestiging van de aanmelding: de huidige code houdt die 5 min per sessie vast (`STAP_OP_MS` in `backend/stap-op.ts`); zo laten of eenmalig maken per kritieke actie en per wijziging van een toestemming (plan §7). De maquette toont al het doel van OT: elke keer opnieuw.
2. Wijzigingen in gedeelde platformcode in één goedkeuring: `canonicalUrl` en `replaceLegacy` behouden het pad; id's `garage`, `climate`, `media`, `panel`; modus `CanonicalChrome`; manifest van het knooppunt huis; sessie ‘scherm’.
3. Schermen zonder browser: een nieuwe afhankelijkheid voor het omzetten van SVG naar rasterbeelden en een apparaatsleutel in plaats van een `cookie` in fase 6 — of alleen schermen met een actuele Chromium.
4. Een lokaal pad zonder tunnel voor panelen (gesplitste DNS, lokaal certificaat).
5. Camera, microfoon en locatie in de browser voor het knooppunt huis — daar hangen spraak en scannen van af.
6. Een reservekanaal voor alarmen bij rook en lekkage.
7. Welke televisies er in huis zijn — daarvan hangt af of de ‘Beperkte tv-modus’ nodig is.
