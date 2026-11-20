> 🌐 **Taal:** [Українська](03-ПРИСТРОЇ.uk.md) · **Nederlands** | [Hoofddocument](../ONTWERP-HUIS-20261110.nl.md)

# Zone 3. Apparaten, klimaat, media, apparatuur / Пристрої

Taak HUIS-001 · fase 0 · 10.11.2026 · status: ter goedkeuring bij de eigenaar

Bronnen: plan HUIS-001 (§1, §3, §3.8, §4) en de [ontwerptaal ‘Живий дім / Levend huis’](../ONTWERPTAAL-LEVEND-HUIS-20261110.nl.md) (hierna: OT).

## 0. Wat er is veranderd

- **‘Levend huis’.** Een stille hemel achter de pagina's, alles met getallen op papier, glas voor de kop, de onderbalk, de omhulling van het blad en «Команда / Opdracht»; het verbod op glas en kleurverlopen is opgeheven.
- **Toestemmingen.** Elke actie heeft drie standen voor elke uitvoerder, standaard ‘Uit’; plafonds, onbeschikbare segmenten en verplichte termijnen zijn geschrapt.
- **Fasen** volgen de schaal 0–12; **volledigheid** betekent een blad voor elke klasse (§6) en de volledige set hulpmiddelen voor agenten (§8).
- **Afgestemd op OT:** `hv-risico` (`Eye`, `Triangle`, `Octagon`), twaalf toestanden met de toestanden ‘bezig’, ‘niet uitgevoerd’ en ‘toestand verondersteld’, een teken met ritueel, `&deel=`, het model `hardware` → `apparaat`, subpagina's via `?weergave=`.

## 1. Grenzen en gedeelde regels

De zone beheert de lijst met apparaten, de bladen van alle klassen, ‘Apparatuur’, klimaat en media. De bladen van slot, sirene, camera en deurbel schrijft ‘Beveiliging’, die van het laadpunt ‘Energie’, die van vervoer en drones ‘Garage’; het bladenregister en de lijst zijn gedeeld.

- **Model.** `hardware` is het fysieke apparaat (model, firmware, hub, paspoort); `apparaat` is de functie op een tegel (namen in beide talen, aliassen, klasse, rol, kamer); de tabel `huis_hardware` ligt boven `huis_apparaten` (plan §4). Een mogelijkheid → een actie met een schema, een richting en `omkeerbaar`; één schema voedt de tegel, het blad, Opdracht en de agenten; de bedieningselementen worden gekozen op basis van de mogelijkheid, niet van het merk.
- **Klasselabels:** `ingang`, `klep_water`, `klep_gas`, `kritieke_voeding`, `beveiligingssensor`; het niveau berekent `shared/huis-gevaar.ts` uit ‘klasse + mogelijkheid × richting’.
- **Adressen:** `/apparaten`, `/apparaten/<id>`, `/klimaat`, `/media`; blad `?blad=apparaat:<id>&deel=bediening|geschiedenis|instellingen`; `?dialoog=`, `?weergave=`, `?filter=`, `?groep=`, `?t=`.
- **Actualiteit** staat één keer per scherm (`hv-versheid`, `hv-sim`); drempels per klasse (plan §4).

## 2. De tegel en het verloop van een opdracht

- **Vorm** (OT §7): in de lijst 2×1 met een niveaustreep van 4 px; in ‘Favorieten’ en in een kamer 2×2 vanaf 224 px, anders 4×2; het streepje `--hv-wens` is de gewenste waarde. De cirkel schakelt (toon — OT §4), het lichaam opent het blad; een gevaarlijke of kritieke richting krijgt een vierkant teken met ritueel dat `hv-gevaar` opent.
- **Toestanden** zijn de twaalf gedeelde; de zone voegt alleen woorden toe. О (‘wacht’) bij slapende apparaten: «застосується після пробудження, до 14:32 / wordt toegepast na ontwaken, uiterlijk 14:32»; Р (‘bezig’): richting en percentage; В (‘niet uitgevoerd’): zowel «заклинило / klemt» als de eigen beveiliging van het apparaat (‘wind 14 m/s’) met de actie «Обійти раз / Eén keer omzeilen»; П (‘toestand verondersteld’): twee actiecirkels en «Виправити стан / Toestand corrigeren»; Б (‘geblokkeerd’): alleen de rol of de bron. «Несправність / storing» is een regel `hv-apparaatstoring` (code, «Що робити / Wat te doen») plus ‘aandacht’ in ‘Nu belangrijk’; «на обслуговуванні до 16:00 / in onderhoud tot 16:00» is een stille chip.
- **Opdracht:** verzonden (О, tot 10 s) → ontvangen (Р) → bevestigd | niet uitgevoerd (В), via de stroom `POST /api/huis/stroom`. Voor een onbereikbaar apparaat is er geen wachtrij.
- **Een groep** is één bewerking: «9 з 14 виконано / 9 van 14 uitgevoerd» en een verslag; gevaarlijke en kritieke stappen gaan samen door één `hv-gevaar` met een overzicht.
- **«Повернути / Ongedaan maken»** alleen als de vorige waarde actueel is, anders «Повернути не можна: попередній стан 3 ламп невідомий / Ongedaan maken kan niet: de vorige toestand van 3 lampen is onbekend»; onomkeerbare gevoelige acties krijgen een aftelling van 3 s. Dit is het ritueel voor de mens: voor uitvoerders voegt het systeem geen vertraging toe (§8).
- **Onbereikbaar:** «востаннє: увімкнено, 14:02 / laatst: aan, 14:02»; in het blad «Що перевірити / Wat te controleren» (stappen per klasse), `hv-verbindingsketen` met de verbroken schakel en «Перевірити зараз / Nu controleren».

## 3. De lijst `/apparaten`

```
TELEFOON                         COMPUTER (bureau)
┌ glas: Apparaten    ● !1 bel3 ┐ ┌ glas: kop ─────────────────────────────────┐
├ Simulatie ×10 · 14:30 ───────┤ │ Apparaten [64]  [Tegels|Tabel]   │ glas:   │
│ [zoeken…]         [Filter 2] │ │ Alle·Batterijen 3·Updates 2·…    │ Vloerl.×│
│ ▾ Woonkamer [9]              │ │ ▾ Woonkamer [9]                  │ Bedien│…│
│ (●) Vloerlamp  60 % · 2 s    │ │ [(●)Vloerlamp 60%][(○)Tv-stopc.] │ (●) 60 %│
│ (○) Tv-stopcontact uit       │ │ [┆?┆Rolluik][▣ Poort dicht]      │ − ██░ + │
│ ┆?┆ Rolluik laatst 40 %      │ │ ▸ Keuken [12] ▸ Zonder kamer [2] │ 2 s·sim.│
│ ▣  Poort  dicht              │ └──────────────────────────────────┴─────────┘
└ glas: Thuis Kamers Energie Beveiliging Meer ┘ [Opdracht]
```

- **Filters** `?filter=`: Усі / Alle · Батарейки / Batterijen · Оновлення / Updates · Сигнал / Signaal · Обслуговування / Onderhoud; `?groep=kamer|soort|hub`; «Плитки / Tegels» of «Таблиця / Tabel» met namen die ter plekke te bewerken zijn.
- **Selectie** via `hv-selectiebalk`: Aanzetten · Uitzetten · Kamer… · Label… · Firmware bijwerken….
- **Batterijen:** een voorspelling, ‘3 dagen stil’, «Замінено сьогодні / Vandaag vervangen»; rook-, CO-, gas- en lekkagemelders staan altijd in ‘Nu belangrijk’.
- **Weergaven:** Apparatuur `?weergave=apparatuur` · Групи / Groepen · Допоміжні величини / Hulpwaarden · Порядок / Opschonen · Кошик / Prullenbak.

## 4. Apparatuur / Техніка — `?weergave=apparatuur`

```
▾ Loopt nu [2]               ◔ Wasmachine nog 38 min · € 0,21
▾ Klaar [1]                  ✓ Droger 14:05            [Opgeruimd]
▾ Wacht op goedkoop uur [1]  Wasmachine 2 → 02:00 · € 0,09
▾ Te lang aan [1]            Strijkijzer 2 u 10 min    [Uitzetten]
▸ Zonder stroom · Sluipverbruik [4] · Elektronica
```

- **Працює зараз / Loopt nu** (`hv-cyclus`; «визначено за споживанням / afgeleid uit verbruik») · **Завершено / Klaar** (tot «Забрано / Opgeruimd» of 12 uur) · **Чекає дешевої години / Wacht op goedkoop uur**: het plan van de optimalisatie, «Запустити зараз / Nu starten».
- **Увімкнено надто довго / Te lang aan** (`hv-telang`; de drempel per klasse wijzigt de eigenaar; ‘Uitzetten’ met één tik) · **Без живлення / Zonder stroom** (`kritieke_voeding` op 0 W geeft ‘alarm’).
- **Режим очікування / Sluipverbruik**: «Вимикати вночі / 's Nachts uit» maakt een automatisering aan met de toestemming ‘Uit’; de besparing staat er met het teken ‘≈’ bij · **Електроніка / Elektronica**.

## 5. Blad en pagina van een apparaat

Het blad `hv-laag` is een glazen omhulling met papieren blokken; `/apparaten/<id>` toont hetzelfde over de volle breedte.

```
LICHT                           THERMOSTAAT
┌ glas ──────────────────────┐ ┌ glas ──────────────────────┐
│ Vloerlamp · Woonkamer    × │ │ Woonkamer · klimaat      × │
│ Bediening│Gesch.│Instell.  │ │      ╭ 21,5 °C ╮  verwarmt │
│ (●) aan                    │ │  [−]  doel 21,0  [+]       │
│ [−] ██████░│░░  60 %  [+]  │ │ [Uit│Verwarmen│Auto]       │
│ [warm][zacht][daglicht]    │ │ [Comfort][Slaap][Eco]      │
│ Timer [15][30][60][23:00]  │ │ pauze: raam staat open     │
│ Aan: ‘Avond’ ← beweging    │ │ 21,5 °C · 14 s · ● Olena   │
└────────────────────────────┘ └────────────────────────────┘
```

- **Керування / Bediening**: bedieningselementen uit primitieven, elk met ‘−/+’, een numeriek alternatief en een toetsenbordalternatief; vegen gaat over de niveaustreep (op `wand` over de hele tegel); een regel `hv-waarom`. Voorinstellingen van de thermostaat: «Комфорт / Comfort · Сон / Slaap · Економно / Eco · Посилено / Boost».
- **Історія / Geschiedenis**: een daglint, een grafiek, vermeldingen met auteur. **Налаштування / Instellingen**: namen, kamer, labels, grenzen van instelwaarden, drempels, `hv-stand` van elke actie; de blokken «Де вживається / Waar gebruikt», «Діагностика / Diagnose», «Паспорт / Paspoort», «Для агентів / Voor agenten», «Небезпечна зона / Gevarenzone».
- **Захист послаблено / Bescherming verlaagd.** Een beveiligingssensor, slot of sirene verbergen, in onderhoud zetten, uitschakelen, verwijderen of vervangen is een kritieke actie: de houdrail en een bevestiging van de aanmelding. De termijn kiest de eigenaar (‘2 uur · tot 16:00 · tot intrekking’); zolang die loopt, staat `hv-verzwakt` in de held, op de tegel en in het Logboek.

## 6. Klasse → tegel → blad

Het niveau geldt voor de mens en hangt af van de richting (OT §9–10); uitvoerders hebben overal drie standen, standaard ‘Uit’.

| Klasse | Tegel | Blad | Niveau |
|---|---|---|---|
| Licht, groep | niveau, ‘3 van 5’ | helderheid, kleurtemperatuur, kleur, effecten | gewoon; stroboscoop — gevoelig |
| Schakelaar, stopcontact | teken, W | kanalen, automatisch uit, kWh | gewoon; `kritieke_voeding` — gevaarlijk |
| Gordijnen, rolluiken, zonnescherm | positie ▲ ■ ▼ | doek, lamellenhoek, kalibratie | gewoon; ‘Eén keer omzeilen’ — gevoelig |
| Poort, garagedeur | loop, percentage | camerabeeld van de zone, obstakel, aftelling 5 s | openen — gevaarlijk (`ingang` — kritiek); sluiten — gevoelig |
| Thermostaat, radiator, vloerverwarming, airco | huidig → doel | `hv-wijzer`, standen, `hv-weekrooster` | gewoon |
| Warmtepomp, cv-ketel, boiler, kachel | aanvoer, COP, vat | `hv-kringloop`, warm water, tijdslimiet | gevoelig; uitzetten bij vorst — gevaarlijk |
| Ventilatie, luchtbevochtiger, luchtreiniger | snelheid, doel | ‘boost 15 min’, filter, reservoir | gewoon; ventilatie uitzetten — gevoelig |
| Luidspreker, televisie | ▶ ⏸, bron | `hv-speler`, `hv-afstand`, ‘Omroepen’ | gewoon; boven het plafond — gevoelig |
| Stofzuiger, maaier | toestand, lading | kaart, zones, schema | gewoon; maaier — gevaarlijk |
| Besproeiing | zones | duur, ‘overgeslagen: regen’ | gevoelig |
| Water-, gasklep | ‘Sluiten’ | test, geschiedenis | sluiten — gewoon; water openen — gevaarlijk, gas — kritiek |
| Wasmachine, droger, vaatwasser | voortgang | programma, ‘Goedkoopste tijd’ | starten — gevoelig |
| Oven, kookplaat | temperatuur | stand, kernthermometer | opwarmen — gevaarlijk |
| Koelkast, koffiemachine, strijkijzer | temperaturen | deurtje, programma | gewoon; opwarmen — gevoelig |
| Computer, printer, opslag, UPS | aan, schijven | slaap, volumes, wachtrij | uitzetten — gevoelig; server — gevaarlijk |
| Router | verbonden apparaten | gastnetwerk | herstarten — gevaarlijk |
| Infraroodafstandsbediening, knop | laatste signaal | `hv-knopschema` | volgens het doel |
| Sensoren | getal, trend | grafiek, drempels | alleen-lezen |
| Slot, sirene, camera, deurbel | teken met ritueel | zone ‘Beveiliging’ | ontgrendelen — kritiek |
| Laadpunt, vervoer, drone | `hv-telemetrie` | zones ‘Energie’, ‘Garage’ | opstijgen — kritiek |
| Onbekende klasse | universele regel | `hv-formulier` | gevoelig |

## 7. Klimaat `/klimaat` en media `/media`

```
┌ Kamers │ Lucht │ Weekschema ──────────┐ ┌ Woonkamer+Keuken ┐
│ Binnen 20,8° · 2 verwarmen · buiten 6°│ │ ▶ ⏸ ⏭  32 %  − + │
│ [Woonk. 21,5→21 verw.][Keuken ⏸ raam] │ │ [Waar?][Wachtrij]│
└───────────────────────────────────────┘ └──────────────────┘
```

**Klimaat:** `hv-zones` ‘huidig → doel’ (achtergrond `--hv-warm-zacht` alleen tijdens verwarmen), ‘Overal 1° lager’, «Відпустка до… / Vakantie tot…», «Тижневий розклад / Weekschema», «Повітря / Lucht» op basis van CO₂ en luchtvochtigheid. **Media:** «Зараз грає / Speelt nu», «Де грає / Waar speelt het», de wachtrij, de minispeler `hv-speler--mini` van 56 px in de sectie ‘Kamers’.

## 8. Toestemmingen in de zone

Elke actie van elke klasse heeft een `hv-stand` «Вимкнено / Uit · Питати / Vragen · Завжди / Altijd», afzonderlijk voor de scène, de automatisering, de optimalisatie en elke agent; standaard ‘Uit’, de eigenaar kan elke stand kiezen (OT §10). Termijn, kamers, uren en budget zijn optionele kaders van de eigenaar. Alleen de eigenaar wijzigt een toestemming; een agent kan rechten niet uitbreiden en niet inperken — niet de eigen en niet die van anderen. Elke wijziging van een toestemming en elke actie op grond daarvan levert een vermelding in het Logboek en een melding op: een actie met een apparaat van de zone heeft de soort `huis.apparaat`, een wijziging van een toestemming `huis.systeem`; het belang bepaalt de gebeurtenis, niet de soort — volgens de gezamenlijke tabel ‘gebeurtenis → soort → belang’ ([‘Architectuur’](09-ARCHITECTUUR.nl.md) §10). Naast gevaarlijke en kritieke acties staat een ‘!’ met uitleg, bij ‘Altijd’ een blijvende ‘!’.

| Niveau | Acties van de zone | Ritueel voor de mens |
|---|---|---|
| gewoon | licht, stopcontacten, gordijnen, instelwaarden, media, een klep sluiten, een robot stoppen | direct |
| gevoelig | wassen, besproeien, boiler, pomp, ‘Eén keer omzeilen’, de poort sluiten | ‘Ongedaan maken’ 10 s of een aftelling van 3 s |
| gevaarlijk | ‘Alles in huis uitzetten’, `kritieke_voeding`, oven, maaier, water na een storing, router, server, firmware, de poort openen | houdrail met het gevolg |
| kritiek | `ingang` openen, gas openen, de beveiliging verzwakken | houdrail en bevestiging van de aanmelding |

- Een poort zonder obstakelsensor: sluiten wordt gevaarlijk, de houdrail toont het camerabeeld van de zone en een aftelling van 5 s. Het niveau in het register `/instellingen/risico` kan de eigenaar alleen verhogen: het niveau bepaalt het ritueel voor de mens, niet de toestemming.
- **Agenten hebben de volledige set hulpmiddelen van de zone** (groep `huis` van de koppeling): apparaten, toestanden, geschiedenis, diagnose, batterijen en verbruik lezen; elke actie van elke klasse uitvoeren, groepsacties, timers, voorinstellingen, het plan voor het goedkope uur, ‘Eén keer omzeilen’, onderhoud, de beveiliging verzwakken, firmware; kamers, labels en namen wijzigen. Elk hulpmiddel valt onder een eigen `hv-stand`: ‘Vragen’ levert een `hv-verzoek` op, ‘Altijd’ betekent directe uitvoering binnen de kaders van de eigenaar, met een auteursteken, `hv-toost` en een vermelding in het Logboek. Een hulpmiddel om toestemmingen te wijzigen bestaat niet.

## 9. Toelichtingen en teksten

Vaste teksten komen uit het register; berekende uit `POST /api/huis/gevolg`.

- **Gevolg.** «Що станеться: мережеве сховище втратить живлення; копія о 02:00 не відбудеться. Пов'язано з: 3 камери пишуть на цей диск. Як повернути: увімкніть розетку — запуск 4 хв.» / «Wat er gebeurt: de NAS verliest stroom; de back-up van 02:00 gaat niet door. Hangt samen met: 3 camera's nemen op naar deze schijf. Terugdraaien: zet de stekker weer aan — opstarten duurt 4 min.»
- **Weigering.** «Чому ні: вітер 14 м/с, межа 10. Що перевірити: за прогнозом вітер спаде близько 17:00. Що можна натомість: „Обійти раз“ — полотно може пошкодитися.» / «Waarom niet: wind 14 m/s, grens 10. Wat te controleren: volgens de verwachting neemt de wind rond 17:00 af. Wat wel kan: ‘Eén keer omzeilen’ — het doek kan beschadigen.»
- **Risico ‘!’, oven, ‘Altijd’.** «Що може статися: духовка гріється, коли на кухні нікого немає. Пов'язано з: витяжка сама не вмикається. Як повернути: „Вимкнути“ на плитці. Хто зможе це запускати: автоматизація „Вечеря“, години 17–20. Як вимкнути: „Вимкнено“ чи „Питати“ тут або в реєстрі.» / «Wat er kan gebeuren: de oven warmt op terwijl er niemand in de keuken is. Hangt samen met: de afzuigkap gaat niet vanzelf aan. Terugdraaien: ‘Uit’ op de tegel. Wie dit kan starten: automatisering ‘Avondeten’, 17–20 uur. Uitzetten: ‘Uit’ of ‘Vragen’ hier of in het register.»

## 10. Schermen en adressen

`/apparaten` (`?weergave=tegels|tabel|apparatuur|groepen|hulpwaarden|opschonen|prullenbak`, `?groep=`, `?filter=batterijen|updates|signaal|onderhoud`) · `/apparaten/<id>` · `?blad=apparaat:<id>&deel=…` · `/klimaat`, `/klimaat/lucht`, `/klimaat/weekschema` · `/media`, `?blad=media:waar`, `?blad=media:wachtrij` · `?dialoog=groepsactie|bescherming|omzeilen|toestand|onderhoud|vervangen|verwijderen|update|kalibreren|goedkoop-starten|omroepen|klimaat-vakantie|labels|nieuw` · `hv-gevaar` (zonder adres) · `/instellingen/risico?entiteit=<id>`.

## 11. Onderdelen

**Uit OT:** `hv-tegel`, `hv-laag`, `hv-blok`, `hv-tabel`, `hv-grafiek`, `hv-stempel`, `hv-waarom`, `hv-schakel`, `hv-schuif`, `hv-wijzer`, `hv-kleur`, `hv-aftel`, `hv-risico`, `hv-stand`, `hv-gevaar`, `hv-rail`, `hv-gevolg`, `hv-verzoek`, `hv-toost`.

**Eigen** (ter goedkeuring): `hv-selectiebalk`, `hv-apparaatkop`, `hv-bediening`, `hv-segment`, `hv-stapper`, `hv-voortgang`, `hv-afstand`, `hv-speler`, `hv-weekrooster`, `hv-zones`, `hv-kringloop`, `hv-knopschema`, `hv-verbindingsketen`, `hv-apparaatstoring`, `hv-waargebruikt`, `hv-verzwakt`, `hv-cyclus`, `hv-telang`, `hv-paspoort`, `hv-formulier`.

## 12. Gedekt en uitgesteld

| Fase | Wat uit deze zone |
|---|---|
| 0 | alle schermen; het uitgestelde met de stempel «пізніше / later» |
| 1 Schil en demohuis | `huis_hardware`, lijst, tegel, omhulling van het blad, 120 apparaten in het demohuis |
| 2 Bediening | bladen voor alle klassen uit §6, een matrix in plaats van `KRITIEKE_SOORTEN`, `hv-stand` van elke actie, het verloop van een opdracht, groepen, verzwakte beveiliging, meldingen, audit |
| 3 Opdracht | apparaatacties, aliassen |
| 4 Garage | kaart van stofzuiger en maaier |
| 5 Automatisering en agenten | hulpmiddelen van de zone, ‘Voor agenten’, voorinstellingen |
| 6 Schermen | bladen op `wand`, `tv`, `strook` |
| 7 Geschiedenis en energie | geschiedenis, verbruik, goedkoopste tijd |
| 8 Mensen | bedieningselementen per rol |
| 9 Beveiliging | camerabeeld van de poortzone |
| 10 Klimaat en media | `/klimaat`, `/media`, ‘Waar speelt het’, wachtrij |
| 11 Apparatuur | ‘Apparatuur’, batterijen, firmware, vervanging, paspoort |
| 12 Bronnen | echte adapters, storingscodes, infrarood leren |

Buiten de schaal: telefoon en computer als sensoren, samenvoegen van dubbele apparaten, mediabibliotheek.

## 13. Besluiten voor de eigenaar

1. **Bevestiging van de aanmelding** voor kritieke acties van de zone: het doel is een eenmalige bevestiging, een aparte voor elke kritieke actie en voor elke keer dat ‘Altijd’ voor een gevaarlijke of kritieke actie wordt aangezet; of die de huidige 5 min per sessie (`STAP_OP_MS`) vervangt, beslist de eigenaar (plan §7; hoofddocument, §13, punt 1). Tot dat besluit houdt de maquette, net als de code van het platform, de bevestiging 5 min per sessie vast (OT §10).
2. **Het label `ingang`** tilt het openen van poort en garagedeur van gevaarlijk (OT §9) naar kritiek — goedkeuren.
3. **Een kleurstaal van de lamp** op de tegel — een uitzondering op de regel ‘kleur alleen voor toestand en risico’.
4. **Een tussenserver voor afbeeldingen** voor hoezen en het camerabeeld van de poort (`img-src 'self'`) — samen met de videobeelden van de camera's (plan §7).
