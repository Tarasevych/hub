> 🌐 **Taal:** [Українська](02-ДІМ-І-КІМНАТИ.uk.md) · **Nederlands** | [Hoofddocument](../ONTWERP-HUIS-20261110.nl.md)

# Zone 2. Thuis, kamers, plattegrond / Дім і кімнати

Taak HUIS-001 · fase 0 · 10.11.2026 · status: ter goedkeuring bij de eigenaar

Bronnen: plan HUIS-001 (§1, §3, §3.8, §4) en de [ontwerptaal ‘Живий дім / Levend huis’](../ONTWERPTAAL-LEVEND-HUIS-20261110.nl.md). De zone omvat de secties 1, 3, 5, 14, 20 en 22 van de catalogus: het hoofdscherm, kamers en plattegrond, tegels, aanwezigheid, het Nederlandse huishouden en personalisatie. De bedieningselementen van elk type beschrijft de zone ‘Apparaten’; deze zone geeft elke functie een plek en een weg naar haar blad.

## 1. Gemeenschappelijke regels

- **Adressen.** Pagina `/<sectie>[/<tabblad>][/<object>]`; blad `?blad=<soort>:<id>`, een deel ervan `&deel=bediening|geschiedenis|instellingen`; dialoogvenster `?dialoog=`; moment in het verleden `?t=`. De woorden `plattegrond`, `bewerken`, `versies`, `nieuw` en `buiten` zijn gereserveerd — zo kan een kamer in het adres niet heten.
- **Model.** `hardware` staat voor het fysieke apparaat, `apparaat` voor de functie; de kamer en de plek op de plattegrond erft de functie van het apparaat.
- **Huisstanden:** Вдома / Thuis · Не вдома / Afwezig · Ніч / Nacht · Відпустка / Vakantie · Гості / Gasten. De beveiliging is een aparte `hv-alarmstand` met een schild en een woord: «Охорона: знято / Alarm: uit».
- **Drie lagen:** hemel `hv-hemel` — de achtergrond; papier `--panel` — alles met getallen; glas `--hv-glas` — alleen de kop, de navigatie, de bladen en «Команда / Opdracht». Op de hemel staan alleen de zin, de datum, koppen en de onderschriften van de doorsnede, in de kleur `--text`. Actualiteit en simulatie worden één keer getoond; op een element staat alleen een afwijking.

## 2. Дім / Thuis — `/overzicht`

### 2.1 Schetsen

Telefoon, 390 px. `( )` — een rond schakelvlak, `[▣]` — een vierkant teken met ritueel, `[ ]` — een knop of pil.

```
┌ glas ─────────────────────────────┐
│[Avond · 17:42]  [△ 2] [●] [bel 3] │
│kolf Simulatie ×60 · hemel huistijd│
├ hemel: schemer, regen ────────────┤
│In de slaapkamer staat het raam    │
│42 min open; de verwarming is aan. │
│[Thuis][OT thuis][8 °C regen][Morg→│
├ Nu belangrijk · 2 ────────────────┤
│△ Slaapkamerraam 42 min, cv aan    │
│          [Zet op 15 °C]        ⋯  │
│? Agent: wasmachine om 02:00       │
│    [Eén keer goedkeuren][Afwijzen]│
├ Scènes ───────────────────────────┤
│[Avond] [Film] [Welterusten]    →  │
├ Favorieten ───────────────────────┤
│( ) Vloerlamp · 60 % · 2 min   60 %│
│ −  ▓▓▓▓▓▓▓░░░░░░░░░░  +           │
│[▣] Voordeur · op slot             │
├ Huis in doorsnede ────────────────┤
│Zolder ░░░ niet waargenomen        │
│1e     [▢ slaapk.] [■ kinderk.]    │
│BG     [■ woonk.][■ keuken][▢ hal] │
│Erf    [tuin] [oprit]              │
├ Samenvatting ─────────────────────┤
│Energie −1,2 kW · € 0,24 · Beveil. │
│Alarm: uit · Garage: auto 64 %     │
├ glas ────────────────── [Opdracht]┤
│Thuis · Kamers · Energie · Beveil. │
└───────────────────────────────────┘
```

Computer, `bureau`, 12 kolommen:

```
┌ glas 56 px ─────────────────────────────────────────────────────────┐
│Thuis Kamers Energie Beveil. Garage Automat. [Opdracht] ×60 ● bel 3  │
└─────────────────────────────────────────────────────────────────────┘
 hemel; held ≤ min(320px, 40svh)                          ╱╲
 Thuis is het warm en rustig. Vier lampen aan,          ╱ ░░ ╲ zolder
 deuren op slot, de auto laadt tot 21:10.               │ ■  ▢ │ 1e
 maandag 9 november · 17:42                             │ ■■ ▢ │ bg
 [Thuis][OT thuis][8 °C regen][€ 0,24][Morgen: papier]  └──────┘ erf
┌ Nu belangrijk (8 kolommen) ────────────┐ ┌ Kamers · BG (4) ──────┐
│△ Slaapkamerraam 42 min [Zet op 15 °C]  │ │[Kaarten | Plattegrond]│
└────────────────────────────────────────┘ │Woonkamer 21,5° ( )−/+ │
┌ Scènes ────────┐┌ Favorieten ──────────┐ └───────────────────────┘
│[Avond] [Film]  ││Vloerlamp · Deur [▣]  │ ┌ Energie 4×2 ──────────┐
└────────────────┘└──────────────────────┘ └───────────────────────┘
┌ Samenvatting · Dagstrook −18…+6 uur ┃nu ────────────────────────────┐
```

- **Volgorde op de telefoon:** kop → hemel met zin en chips → «Зараз важливо / Nu belangrijk» → «Сцени / Scènes» → «Обране / Favorieten» → «Дім у розрізі / Huis in doorsnede» → «Зведення / Samenvatting». ‘Kamers’ en «Стрічка доби / Dagstrook» zijn hier standaard verborgen en worden in ‘Mijn weergave’ ingeschakeld.
- **Computer:** de doorsnede staat in de held; rechts staan de kamers van de verdieping met de schakelaar «Картки / Kaarten · План / Plattegrond» en de energie. `breed` — de plattegrond staat altijd rechts, `ultrabreed` — een aparte zone van 720 px. **`wand`:** aanraakdoelen van 56 px; op `/paneel/wand/<id>` een rustscherm met de hemel en na 5 min terug naar ‘Thuis’.

### 2.2 Hemel en huiszin

- **De hemel** is alleen op ‘Thuis’ volledig, elders is hij stil. De fase berekent de server uit de zonnestand boven het adres van het huis; bewolking is een bijmenging van `--surface2`, neerslag een stilstaande arcering buiten de tekst. ‘Afwezig’ en ‘Vakantie’ halen de kleur weg, ‘Nacht’ geeft de nachtfase, een alarm schakelt de hemel uit.
- **Held `hv-held`:** de zin (`--hv-zin`), op computer en wandscherm de datum en de huistijd, daarna papieren chips van 28 px; de naam van een persoon staat er niet in. Telefoon — niet hoger dan `25svh`, de chips scrollen opzij. Bij het scrollen krimpt de held tot een pil in de kop: «Вечір · 2 важливі · 17:42 / Avond · 2 aandachtspunten · 17:42».
- **De zin** wordt alleen uit waargenomen feiten opgebouwd, met volledige sjablonen: de belangrijkste uitzondering → licht → deuren en beveiliging → de eerstvolgende gebeurtenis. «Спокійно / rustig» wordt niet gebruikt zolang ‘Nu belangrijk’ een regel bevat; verouderde gegevens staan in de verleden tijd; de korte vorm telt tot 36 tekens. Een kamer komt erin via de vorm «Де / Waar» (§4.3), de eigen naam van een apparaat alleen in de grondvorm (nominatief) na een dubbele punt; een test bij het bouwen laat de sjablonen draaien op de namen «Бюро Олени», «Горище» en «Schuur». Rook, gas en water gaan via `hv-nood`, niet via de zin.

| Toestand | Oekraïens | Nederlands |
|---|---|---|
| rust | Удома спокійно: світло в трьох кімнатах, двері замкнено. | Thuis is het rustig: licht aan in drie kamers, deuren op slot. |
| uitzondering | У спальні відчинено вікно 42 хв, а опалення гріє. | In de slaapkamer staat het raam 42 min open terwijl de verwarming aan is. |
| verouderd | О 18:12 було спокійно, двері були замкнені. | Om 18:12 was het rustig en waren de deuren op slot. |
| geen gegevens | Немає свіжих даних із дому. | Geen recente gegevens van het huis. |

- **Chips van de held** (een tik opent een blad, een lege chip verdwijnt): huisstand, aanwezigheid, weer (pictogram uit het woordenboek en temperatuur); daarna, naar risico, open ramen en deuren, «Завтра: папір / Morgen: papier», de prijs van dit moment, batterijen onder 15 % (naar `/activiteit/onderhoud`). Bredere schermen tonen tot zes chips en «+N».
- **Doorsnede `hv-doorsnede`:** een verdieping is een rij, een kamer een vakje dat als knop werkt en niet kleiner is dan `--hv-tik`, tot vijf per verdieping en «+N»; een raam licht op in `--hv-aan-vlak` alleen bij bevestigd licht; het erf — «сад / tuin», «під'їзд / oprit». Een tik opent het snelle blad van de kamer; er is «Показати списком / Als lijst tonen». Ingeklapt is het een pil «4 вікна світяться · 2 поверхи / 4 ramen aan · 2 verdiepingen».

### 2.3 Huisstand `hv-huisstand`

- **Blad** `?blad=huisstand`: een knop die zich naar de situatie richt, «Йду / Ik ga weg» of «Я вдома / Ik ben thuis», daaronder vijf standen met `hv-gevolg`, na de keuze «Повернути / Ongedaan maken» gedurende 10 s. Hetzelfde staat in ‘Opdracht’ en op het scherm `deur`.
- **Een stand is een reeks stappen**, net als een scène: licht, klimaat, media en, als de eigenaar dat zo heeft ingesteld, beveiliging en sloten. De regel «Охорона / Alarm» zegt wat de stand doet wanneer een mens omschakelt: «Охорона: режим поставить „периметр“ / Alarm: de stand schakelt ‘schil’ in», en als de stand geen beveiligingsstap heeft — «Охорона: режим не змінює / Alarm: de stand verandert het niet».
- **Wie omschakelt, doorloopt de controle.** Schakelt een mens om, dan zijn alle stappen diens eigen acties met het ritueel van de hoogste stap; toestemming van uitvoerders is niet nodig. Zitten er stappen tussen die de beveiliging uitschakelen of een slot openen (kritiek), dan volgt `hv-gevaar` met een opsomming, de houdrail en een bevestiging van de aanmelding, met daarnaast «Виконати без критичних кроків / Zonder kritieke stappen uitvoeren». Een uitvoerder — een automatisering, de optimalisatie of een agent — schakelt om met zijn eigen toestemming voor «Змінити режим дому / Huisstand wijzigen», en elke stap volgt de toestemming in de kolom «Сцени / Scènes»: ‘Uit’ — de stap wordt overgeslagen met een vermelding in het Logboek, zonder vraag («5 із 7 кроків; 2 вимкнено дозволом / 5 van 7 stappen; 2 uit door toestemming»); ‘Vragen’ — een verzoek `hv-verzoek`; ‘Altijd’ — uitgevoerd.
- **Automatisch wisselen op aanwezigheid** is een regel van ‘Automatisering’, standaard ‘Uit’: het huis wisselt niets en vraagt niets. ‘Vragen’ — een verzoek `hv-verzoek` «Усі пішли 10 хв тому. Перемкнути на „Не вдома“? / Iedereen is 10 min geleden vertrokken. Overschakelen naar ‘Afwezig’?»; ‘Altijd’ — het huis wisselt zelf, met een vermelding en ‘Ongedaan maken’ gedurende 10 s. Ook dan volgen de stappen van de stand de toestemming in de kolom ‘Scènes’.

### 2.4 «Зараз важливо / Nu belangrijk» `hv-nu`

Eén lijst van de server; de blokken van ‘Energie’, ‘Beveiliging’ en ‘Garage’ zijn er filters op. Tot drie regels `--hv-rij` ‘teken · feit · actie’ met het menu «⋯»: «Відкласти на годину / Een uur uitstellen», «Це нормально / Dit is normaal», «Відкрити пристрій / Apparaat openen»; de vierde regel — «Ще N у Журналі / Nog N in het logboek» (`/activiteit/meldingen?filter=nu`). Toestanden: «увага / let op», «тривога / alarm gaat af», «запит / verzoek» (`hv-verzoek` met «Схвалити раз / Eén keer goedkeuren» en «Відхилити / Afwijzen»). Volgorde: te lang open → deurbel → een kritieke sensor die zwijgt → KNMI → verzoeken → huishouden → «Поки вас не було / Terwijl je weg was». ‘Dit is normaal’ verbergt zulke kaarten van het apparaat voor een termijn die de persoon zelf kiest; het verborgene blijft zichtbaar in het Logboek en als chip «приховано: 1 / verborgen: 1» in de samenvatting van ‘Beveiliging’.

### 2.5 Scènes, favorieten, samenvatting, groepsacties

- **`hv-scene`** — een pil vanaf 96 px: pictogram en naam. Een tik voert de scène uit; het gevolg staat in de «i» van het blok en in de melding «Сцена „Вечір“: 6 дій / Scène ‘Avond’: 6 acties» met ‘Ongedaan maken’ gedurende 10 s; gedeeltelijk — «5 із 7, 2 недоступні / 5 van 7, 2 niet bereikbaar». Een gevaarlijke stap opent `hv-gevaar`. De pagina van de scène opent via «Відкрити сцену / Scène openen» in de kaart «i».
- **Favorieten:** functies, scènes, kamers; de set staat los per persoon en per scherm. Tot de eerste wijziging geldt «Зібрано автоматично / Automatisch samengesteld» (hoofdverlichting, thermostaat, voordeur, laadpunt).
- **Samenvatting** (`hv-tegel--som`): Licht «3 увімкнено / 3 aan», Klimaat, Beveiliging, Media, Garage; Energie — 4×2 met een ring van stromen.
- **Groepsacties** werken in één richting; het niveau is het hoogste van de betrokken functies, onbereikbare worden overgeslagen en bij naam genoemd. «Вимкнути все світло / Alle lampen uit» is gewoon; «Вимкнути все в домі / Alles in huis uit» is gevaarlijk, met houdrail.
- **«Перші кроки / Eerste stappen»:** adres, bewoners, aanwezigheidsbronnen, plattegrond, favorieten, toestemming voor automatisch wisselen — met de voortgang «2 з 6 / 2 van 6». De server stelt ‘Thuis’ en de kamers zelf samen uit de registers; ‘Mijn weergave’ bewaart alleen het verschil.

## 3. Tegel `hv-tegel` in de zone

- **Vorm volgt inhoud:** schakelaar — 2×1 (in een kamer met zes of meer functies — 1×1); een element met een niveau in ‘Favorieten’ en in de kamer — «−» · `hv-schuif` · «+», 2×2 vanaf 224 px, anders 4×2; elders — 2×1 met een niveaubalk. De vulling toont het waargenomene, het streepje `--hv-wens` het gewenste.
- **De cirkel schakelt, het lichaam opent** `?blad=apparaat:<id>&deel=bediening`. Een gevaarlijke of kritieke actie in de huidige richting heeft een vierkant teken met ritueel en een dubbele rand; een tik opent `hv-gevaar`. Een vergrendeld slot is een vierkant, een ontgrendeld slot een cirkel.
- **Toestanden** — alle twaalf, waaronder «виконується / bezig» met het woord voor de richting en een percentage, en «не виконано / niet uitgevoerd» met een uitleg van de weigering.
- **Aftellen `hv-aftel`:** «Вимкнути через 15 / 30 / 60 хв · о 23:00 / Uit over 15 / 30 / 60 min · om 23:00»; op de tegel een ring en «ще 14 хв / nog 14 min». Het auteursteken staat in de rechterbovenhoek, het blijvende ‘!’ linksboven. Het gevolg `hv-gevolg` berekent `POST /api/huis/gevolg` met dezelfde `droogloop()` als ‘Opdracht’.
- **Volledigheid.** Elke functie van elke klasse heeft een tegel en een volledig blad; zonder kamer staat ze onder «Ще без кімнати / Nog zonder kamer».

## 4. Кімнати / Kamers — `/kamers`

### 4.1 Lijst en verdiepingen

- Tabbladen: Nu `/kamers` · Plattegrond `/kamers/plattegrond` · Apparaten `/apparaten` · Klimaat `/klimaat` · Media `/media`. Boven de lijst staat «Світло в кімнатах: 4 / Licht aan in kamers: 4».
- `hv-kamerkaart` 2×2 per verdieping: naam, ‘21,5 °C · 2 min’, lichtteken, «−/+» voor het doel (stap 0,5 °C), tot drie chips met uitzonderingen; wat niet gemeten is, toont «—» en «невідомо / onbekend».
- **Verdiepingen `hv-verdieping`:** het niveau staat alleen in het adres (`?verdieping=0`), op de chips staat de naam: «Перший поверх / Begane grond», «Другий поверх / 1e verdieping», «Горище / Zolder», «Підвал / Kelder», «Надворі / Buiten». Blad `?blad=verdiepingen`: namen, ‘Waar’, pictogram, volgorde met de knoppen «Вгору / Omhoog» en «Вниз / Omlaag».

### 4.2 Kamerpagina `/kamers/<kamer>`

De naam in het adres komt van de Nederlandse naam. Kop `hv-kamerkop`: ‘← Woonkamer · Begane grond · doel 21 °C’, een uitsnede van de plattegrond en chips van de belangrijkste sensoren. Blokken: Klimaat → Scènes (met «Зберегти поточний стан як сцену / Huidige stand als scène bewaren») → Licht ‘2 van 4’ en «Усе вимкнути / Alles uit» → Media → Overige → Sensoren (ingeklapt) → «Що тут діє само / Wat hier vanzelf gebeurt». Een leeg blok verdwijnt; een kamer zonder functies toont `hv-leeg`.

**`hv-zelf`:** automatiseringen, scènes volgens schema en agenten die in de kamer handelen — laatste uitvoering, auteursteken, de toestemmingsstand in woorden. De eigenaar klapt op een persoonlijk toestel `hv-stand` onder de vermelding uit; anderen zien «Змінює лише власник / Alleen de eigenaar kan dit wijzigen»; ‘Altijd’ voor een gevaarlijke of kritieke actie krijgt een blijvend ‘!’.

### 4.3 Snel blad en formulier

- **Snel blad** `?blad=kamer:<kamer>`: lichtniveau «−/+», tegels, «Відкрити кімнату / Kamer openen».
- **Formulier** «Нова кімната / Nieuwe kamer» (`/kamers?dialoog=nieuw`), «Змінити кімнату / Kamer bewerken» (`?dialoog=bewerken`): namen in twee talen; het veld «Де / Waar» `hv-waarveld` voor elke taal («у вітальні» / «in de woonkamer») met automatische suggestie en een levend voorbeeld «У майстерні відчинено вікно 12 хв / In de werkplaats staat het raam 12 min open»; het veld is niet verplicht — leeg geeft het «Майстерня: відчинено вікно / Werkplaats: raam open»; verder pictogram, verdieping, belangrijkste sensoren, andere namen voor zoeken en spraak.
- **«Прибрати кімнату / Kamer weghalen»** (`?dialoog=weghalen`): «7 functies gaan naar ‘Nog zonder kamer’, 2 scènes verliezen een stap», ‘Ongedaan maken’ gedurende 10 s.

## 5. План / Plattegrond — `/kamers/plattegrond`

De toestand staat in het adres: `?verdieping=1&laag=klimaat&t=`. De plattegrond `hv-plan` ligt op papier, het blad is van glas.

```
┌────────────────────────────────────────────┬ glas ─────────┐
│[Begane grond][1e verd.][Zolder][Buiten]    │WOONKAMER    X │
│(Licht)(Klimaat●)(Beveil.)(Aanwez.)(Energie)│21,5 °C · 48 % │
│┌─────────────╥───────────┐ °C 16 ░▒▓█ 24   │Licht −/+ 60 % │
││ Woonkamer   ║ Keuken    │ ▨ niet gemeten  │( ) Vloerlamp  │
││ 21,5 °C ( ) ║ 20,0 °C   │ ┆ doel (schim)  │Thermostaat −/+│
│├──◜──┬───────╨──┬────────┤ [−][+][Alles]   │[Openen]       │
│└─[▣]─┴─Toilet ▨─┴─Berging┘ kamerlijst      │[Plan bewerken]│
│Dagstrook ◂ 14:00 ▸ [Terugblik]             │               │
└────────────────────────────────────────────┴───────────────┘
```

- **Lagen** zijn filterchips, er is er één tegelijk actief; ‘Beveiliging’ legt zich over elke andere laag. Світло / Licht — cirkelvormige markeringen en vulling; Клімат / Klimaat — warmtekaart `--hv-warmte-1…5` met een getal, sublaag temperatuur / vochtigheid / CO₂, het doel als ‘schim’; Безпека / Beveiliging — deuren, ramen, sloten, kijkkegels van camera's, de plek van het alarm met een dubbele rand en een woord, zonder knipperen; Присутність / Aanwezigheid — ‘beweging 4 min geleden’, zonder namen; Енергія / Energie — vulling naar vermogen. Kleur is nooit de enige drager: in de kamer staat een getal of woord, onder de plattegrond een lijst van de laag.
- Een tik op een kamer zoomt in 480 ms in en opent het snelle blad; kleine markeringen smelten samen tot een teller; zoomen gaat met knoppen, het toetsenbord met Tab, pijltjestoetsen en Enter. Telefoon: plattegrond tot 45 % van de hoogte, de lijst eronder.
- **«Перегляд минулого / Terugblik»** — de cursor van de strook (`?t=`), de bediening is uitgeschakeld. **‘Buiten’** — tuin, oprit, maaier, laadpunt, kijkvelden van camera's.
- **Bewerker** `/kamers/plattegrond/bewerken` (`hv-planbewerker`): gereedschappen │ tekenvlak met een raster van 0,25 m en «Не розміщено / Niet geplaatst» │ inspecteur. Een kamer is een rechthoek (een samengestelde kamer — tot vier delen), verder deuren, ramen en de plaatsing van functies; alles wat slepen doet, kan ook met velden, verschuifknoppen en pijltjestoetsen. Wijzigingen gaan naar een concept `hv-concept`: teller, «Опублікувати / Publiceren», versies met auteurs (`/kamers/plattegrond/versies`), vergelijking bij een conflict.

## 6. Aanwezigheid

- Een persoon heeft **bronnen** met ouderdom en gewicht (sterk of zwak). De server geeft een toestand en een **betrouwbaarheidslabel**: «певно / zeker» — een verse sterke bron; «ймовірно / waarschijnlijk» — alleen een zwakke, een verouderde sterke of bronnen die elkaar tegenspreken; «невідомо / onbekend» — geen verse bronnen of een pauze.
- **`hv-aanwezig`** (chip, blad `?blad=thuis`, scherm `deur`, appel in `hv-nood`): cirkels met initialen, ‘thuis sinds 17:05 · zeker’, reden en ouderdom; ‘waarschijnlijk’ — stippellijn, ‘onbekend’ — arcering, en geen van beide lijkt op ‘afwezig’.
- **De voorwaarde ‘iemand thuis’** heeft een drempel die de eigenaar kiest: «лише певно / alleen zeker» of «певно чи ймовірно / zeker of waarschijnlijk» (standaard). Bij ‘onbekend’ is niet aan de voorwaarde voldaan, en de uitleg van de weigering zegt dat.
- `/instellingen/mensen/<persoon>/aanwezigheid` — «Як дім знає, що я вдома / Hoe weet het huis dat ik thuis ben»: ‘Nu: thuis sinds 17:05 · zeker, want de telefoon was 2 min geleden in het netwerk’, bronnen met gewicht, «Хто бачить моє місце / Wie ziet mijn locatie» (`hv-locatiezicht`, de persoon kiest dat zelf), meldingen bij thuiskomst en «Пауза / Pauzeren» (geeft ‘onbekend’ met het onderschrift «на паузі / gepauzeerd»). Stappenplan `?dialoog=bron`: manier → instellingen → controle ‘signaal 12 s geleden ontvangen’; het netwerk meldt pas na 10 min ‘afwezig’.
- Wat elke agent ziet, bepaalt de eigenaar in het tabblad «Що бачить агент / Wat de agent ziet» (standaard ‘iemand thuis: ja / nee / onbekend’). De simulator laat mensen volgens een schema komen en gaan.

## 7. Weer, afval, «Дім / Woning»

- **Weer** `?blad=weer` (`hv-weer`): regen voor de komende 2 uur, 24 uur op `hv-grafiek`, de week; «Надворі / Buiten» — pollen, uv-index en luchtkwaliteit in woord en getal. Waarschuwingen van het KNMI verschijnen als regel in ‘Nu belangrijk’.
- **Afval** (`hv-afval`): de chip ‘Morgen: papier’ vanaf 16:00 de dag ervoor; 's avonds een regel in ‘Nu belangrijk’ met de actie «Виставлено / Buiten gezet». De ophaalkalender komt uit de open bron van de gemeente, anders uit een handmatige tabel.
- **`/instellingen/woning`:** postcode en huisnummer (de coördinaten zoekt de server op), huistijd, valuta, eenheden, vakantieregio en feestdagen als ‘soort dag’, afval, weerbron. Het demohuis is gemarkeerd met een kolf. De geozone ‘Thuis’ wordt ingesteld met velden en ‘±50 m’ op `/garage/kaart?blad=zone:thuis`. NL-Alert: de regel «Попередження влади сюди не надходять / Overheidswaarschuwingen komen hier niet binnen».

## 8. «Мій вигляд / Mijn weergave» — `?blad=weergave`

`hv-aanpassen`: favorieten met grootte en volgorde via de knoppen «Вгору / Omhoog» en «Вниз / Omlaag»; blokken ‘getoond / verborgen’ (de held en ‘Nu belangrijk’ zijn niet te verbergen); dichtheid, thema, «Тема за сонцем / Thema volgt de zon». «Полегшений вигляд / Zuinige weergave» staat hier niet: die hoort bij het scherm, en alleen de eigenaar zet hem aan in de registratie van het scherm (schil §6, OT §2). Bovenaan staan «Для: Цей екран / Dit scherm · Усі мої екрани / Al mijn schermen · Дім / Huis» (het laatste alleen voor de eigenaar) en «Переглянути як / Bekijken als». Lagen huis → persoon → scherm; `hv-erfenis` toont de bron, «Скинути / Standaard herstellen» zet het overgeërfde terug. Op `/paneel/wand/<id>` hoort de set bij het scherm en verandert die pas na een persoonlijke code. **Paneelbewerker** `/instellingen/schermen/<scherm>/paneel`: secties, tegelcatalogus `?blad=tegels`, voorwaardelijke zichtbaarheid `?blad=zichtbaarheid`, panelen per rol, concept en versies.

## 9. Toestemmingen in de zone

Elke actie van de zone heeft voor elke uitvoerder — scènes, automatiseringen, de optimalisatie, elke agent — drie standen «Вимкнено / Uit · Питати / Vragen · Завжди / Altijd», standaard ‘Uit’. Alleen de eigenaar zet ze aan en uit; termijn, kamers, uren en een budget aan acties zijn optionele kaders die hij zelf instelt. Een agent kan rechten verruimen noch beperken — niet die van zichzelf en niet die van anderen. Elke wijziging van een toestemming en elke actie op grond daarvan levert een vermelding op in het Logboek en in het meldingencentrum. ‘Altijd’ voor een gevaarlijke of kritieke actie krijgt een blijvend ‘!’.

| Actie in de zone | Niveau | Ritueel voor een mens |
|---|---|---|
| huisstand wisselen | gevoelig | direct, ‘Ongedaan maken’ 10 s; kritieke stap — houdrail en bevestiging van de aanmelding |
| scène starten | volgens de hoogste stap | gewoon — direct; gevaarlijk — houdrail |
| ‘Alle lampen uit’ | gewoon | direct |
| ‘Alles in huis uit’ | gevaarlijk | houdrail met een zin over het gevolg |
| ‘Dit is normaal’, kamer weghalen, plattegrond publiceren | gevoelig | ‘Ongedaan maken’ 10 s |
| favorieten, weergave, paneel, kamer, verdieping | gewoon | direct |

**Agenten hebben de volledige set hulpmiddelen van de zone:** de zin, ‘Nu belangrijk’, kamers, de plattegrond met lagen en verleden, aanwezigheid binnen ‘Wat de agent ziet’, weer en afval lezen; de stand wisselen, scènes en groepsacties starten, favorieten, weergave, kamers en het concept van de plattegrond wijzigen — elk onder een eigen `hv-stand`. Bij ‘Vragen’ wordt een actie een verzoek `hv-verzoek`, een wijziging van weergave of plattegrond een concept ter goedkeuring. Een hulpmiddel om toestemmingen te wijzigen bestaat niet.

## 10. Toestanden en teksten

- Leeg huis — `hv-leeg`: «Дім ще порожній — додайте кімнати або запустіть симуляцію / Het huis is nog leeg — voeg kamers toe of start de simulatie». Verouderd — de zin in de verleden tijd, arcering en ouderdom op de tegels, de vulling van de laag weggehaald. «Немає зв'язку з домом з 18:31 / Geen verbinding met het huis sinds 18:31» — de bediening is uitgeschakeld, er is geen wachtrij. «Вдома: невідомо / Thuis: onbekend». Alarm — `hv-nood`.
- **‘Ik ga weg’.** «Що станеться: світло й медіа вимкнуться, опалення знизиться до 17 °C. Пов'язано з: охорону буде поставлено на „периметр“; двері лишаться як є. Як повернути: „Я вдома“ або „Повернути“ протягом 10 с.» / «Wat er gebeurt: licht en media gaan uit, de verwarming zakt naar 17 °C. Hangt samen met: het alarm gaat aan in de stand ‘schil’; deuren blijven zoals ze zijn. Terugdraaien: ‘Ik ben thuis’ of ‘Ongedaan maken’ binnen 10 s.»
- **‘!’ — de stand ‘Thuis’ schakelt de beveiliging uit bij ‘Altijd’.** «Що може статися: охорону буде знято, якщо дім помилково вирішить, що ви прийшли. Пов'язано з: присутність „певно“ від телефона в мережі. Як повернути: поставити охорону знову. Хто зможе це запускати: правило „Автоперемикання режиму“. Як вимкнути: „Вимкнено“ тут або „Зупинити самостійні дії“.» / «Wat er kan gebeuren: het alarm gaat uit als het huis ten onrechte denkt dat je thuiskomt. Hangt samen met: aanwezigheid ‘zeker’ via de telefoon in het netwerk. Terugdraaien: het alarm opnieuw inschakelen. Wie dit kan starten: de regel ‘Huisstand automatisch wisselen’. Uitzetten: ‘Uit’ hier of ‘Zelfstandige acties stoppen’.»
- **Weigering.** «Чому ні: дім не знає, чи хтось удома — останній сигнал 3 год тому. Що перевірити: джерела присутності. Що можна натомість: „Я вдома“ на дверному екрані.» / «Waarom niet: het huis weet niet of er iemand thuis is — laatste signaal 3 uur geleden. Wat te controleren: de aanwezigheidsbronnen. Wat wel kan: ‘Ik ben thuis’ op het deurscherm.»

## 11. Schermen en componenten

**Schermen:** `/overzicht` (profielen `telefoon`, `wand`, `bureau`, `breed`, `ultrabreed`, `tv`; toestanden rust, uitzondering, verouderd, geen verbinding, leeg huis, aanwezigheid onbekend) met de bladen `?blad=huisstand|thuis|weer|weergave`; `/kamers`, `/kamers/<kamer>`, `/kamers/plattegrond` en `/kamers/plattegrond/bewerken|versies` met de hierboven genoemde bladen en dialoogvensters; `/instellingen/mensen/<persoon>/aanwezigheid`; `/instellingen/woning`; `/instellingen/schermen/<scherm>/paneel`; `hv-gevaar` en `hv-nood` boven alle schermen van de zone.

**Uit de ontwerptaal:** `hv-hemel`, `hv-held`, `hv-doorsnede`, `hv-tegel`, `hv-kamerkaart`, `hv-blok`, `hv-chip`, `hv-nu`, `hv-leeg`, `hv-dagstrook`, `hv-grafiek`, `hv-tabel`, `hv-plan`, `hv-landkaart`, `hv-versheid`, `hv-sim`, `hv-maker`, `hv-schakel`, `hv-schuif`, `hv-aftel`, `hv-scene`, `hv-huisstand`, `hv-alarmstand`, `hv-risico`, `hv-stand`, `hv-gevaar`, `hv-rail`, `hv-gevolg`, `hv-nood`, `hv-pincode`, `hv-toost`, `hv-verzoek`, `hv-laag`. **Nieuwe componenten van de zone** (voor de bibliotheek): `hv-favorieten`, `hv-tegel--som`, `hv-eerste-stappen`, `hv-kamerkop`, `hv-zelf`, `hv-waarveld`, `hv-verdieping`, `hv-planbewerker`, `hv-concept`, `hv-aanwezig`, `hv-aanwezigheidsbron`, `hv-locatiezicht`, `hv-weer`, `hv-afval`, `hv-aanpassen`, `hv-erfenis`.

**Voor de bouw:** `Verdieping` en `Ruimte` krijgen tweetalige namen en ‘Waar’; nieuwe tabellen met RLS via `app.huis_is_lid()` — weergave, aanwezigheidsbronnen, locatiezicht, afval, geozones, versies van de plattegrond. De zin, de hemelfase, de gevolgen en de aanwezigheid berekent de server.

## 12. Gedekt en uitgesteld

| Fase | Wat uit deze zone |
|---|---|
| 1 Schil en demohuis | ‘Thuis’ (hemel, zin, doorsnede, belangrijk, favorieten, samenvatting, dagstrook); kamers, verdiepingen, kamerpagina, snel blad en formulier van een kamer; plattegrond met de lagen licht, klimaat, beveiliging en aanwezigheid; ‘Terugblik’ op de simulator; weer, afval, «Дім / Woning» van het demohuis |
| 2 Bediening | bladen van alle klassen, teken met ritueel, toestanden, aftellen; scènes, standen met stappen, ‘Ik ga weg / Ik ben thuis’, groepsacties; toestemmingen voor elke actie van de zone, `hv-zelf`, Logboek en meldingen |
| 3 Opdracht en zoeken | ‘Ik ga weg’, ‘Ik ben thuis’, ‘Alle lampen uit’; andere namen van kamers |
| 4 Garage | geozone ‘Thuis’, het gebied ‘Buiten’ |
| 5 Automatisering en agenten | automatisch wisselen van de huisstand, volledige set hulpmiddelen van de zone, ochtendsamenvatting |
| 6 Schermen en panelen | `/paneel/*`, rustscherm, ‘Mijn weergave’ voor scherm en huis, paneelbewerker, plattegrondbewerker met concept |
| 7 Geschiedenis en energie | energielaag, echte geschiedenis in ‘Terugblik’, voorstellen op basis van gewoonten |
| 8 Mensen, rollen, privacy | aanwezigheidspagina, stappenplan voor bronnen, betrouwbaarheidslabel, locatiezicht, pauze, meldingen bij thuiskomst |
| 9 Beveiliging en camera's | kijkkegels van camera's, appel tijdens een alarm |
| 10 Klimaat en media | sublagen CO₂ en vochtigheid, pollen, uv-index, luchtkwaliteit |
| 11 Techniek, ontdekken, onderhoud | ‘Nog zonder kamer’ voor ontdekte apparaten, batterijen |
| 12 Echte bronnen | echt adres, afval, KNMI, netwerk en volgapparaat, bouwtekening als onderlegger en vrije contouren, foto's van kamers |

Afgewezen: een driedimensionale digitale tweeling, tegels met code van derden, vrije accentkleuren, een themabewerker. NL-Alert wacht op een bron voor de server.

## 13. Besluiten voor de eigenaar

1. **Privacy van de locatie en bewaartermijnen** (plan §7). Voorstel: iedereen ziet alleen ‘thuis / afwezig’, de naam van de zone zien volwassenen met instemming van de persoon, de exacte locatie en de geschiedenis alleen de persoon zelf; de aanwezigheidstoestand wordt 30 dagen bewaard, locatiepunten 7 dagen; postcode, huisnummer en coördinaten worden in de database bewaard voor hemel, weer, afval en geozone.
2. **Inkomend adres voor het volgapparaat** via een tunnel met sleutel en ‘Locatie in de browser’ (`Permissions-Policy`, gezamenlijk besluit over ‘camera, microfoon en locatie’). Netwerk, knoppen en auto werken zonder deze twee.
3. **Geneste adressen** (`/kamers/<kamer>`, `/kamers/plattegrond/bewerken`, `/instellingen/mensen/<persoon>/aanwezigheid`) vereisen een wijziging van het gedeelde `public/canonical-service.js` op platformniveau.
