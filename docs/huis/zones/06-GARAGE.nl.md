> 🌐 **Taal:** [Українська](06-ГАРАЖ.uk.md) · **Nederlands** | [Hoofddocument](../ONTWERP-HUIS-20261110.nl.md)

# Zone 6. Garage: vervoer, drones, robots / Гараж

Taak HUIS-001 · fase 0 · 10.11.2026 · status: ter goedkeuring bij de eigenaar

Bronnen: plan HUIS-001 (§1, §3, §3.8, §4) en de [ontwerptaal ‘Живий дім / Levend huis’](../ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ-20261110.uk.md) (hierna: OT). Namen van tokens, componenten, toestanden en profielen komen uit OT; de nieuwe componenten van de zone en de aanvullingen op OT staan in §15.

## 0. Wat er is veranderd

- **‘Levend huis’.** De pagina's van Garage staan op een stille hemel (OT §3): op de hemel staan alleen de garagezin, de datum en de huistijd en de bloktitels in `--text`. Telemetrie, kaart, controle en cockpit staan op papier `--panel`; glas is er voor de kop, de tabbladen, de onderbalk, de omhulling van het blad en «Команда / Opdracht». Het verbod op glas, hemel en kleurverlopen is opgeheven.
- **Toestemmingen** (plan §3.8). Elke actie — van ‘Vergrendelen’ tot opstijgen en de motor — heeft een `hv-stand` «Вимкнено / Uit · Питати / Vragen · Завжди / Altijd» voor elke uitvoerder; standaard ‘Uit’; de eigenaar kan elke stand kiezen. Geschrapt zijn: ‘de hoogste toestemming’, ‘hoogstens Vragen’ voor missies, ‘niet beschikbaar’ voor ontgrendelen, ‘nooit’ voor de motor, onbeschikbare segmenten, harde verboden en ‘alleen een voorstel aan de piloot’.
- **Het ritueel van de mens blijft:** de houdrail, de persoonlijke code op het paneel, de bevestiging van de aanmelding op een persoonlijk apparaat en de controle vóór de vlucht.
- **Afgestemd op OT:** `?blad=voertuig:<id>&deel=…` in plaats van `&tab=`; `hv-gevaar` opent niet via een adres; «Зависнути / Zweven · Повернутися додому / Naar huis · Сісти зараз / Nu landen» zijn veiligheidsacties zonder ritueel; de toestanden «у базі / in het dock», «у польоті / in de lucht», «стан припущено / toestand verondersteld», «виконується / bezig»; het teken met ritueel; laden zoals in ‘Energie’; de soorten meldingen komen uit OT; schermen zijn `/paneel/<profiel>/<id>`.
- **Fasen** volgen de schaal 0–12 van plan §4 (§16). **Volledigheid:** een bedieningsblad voor elke klasse van de zone (auto, fiets, step, brommer, motorfiets, drone, dock van de drone, accu van de drone, stofzuiger, maaier) en de volledige set hulpmiddelen voor agenten (§10).

## 1. Opzet en grenzen

Garage beantwoordt: is het vervoer klaar, waar is het, wat is er in de lucht en op het perceel.

- **Drones zijn een simulatie** met het stempel «Лише симуляція / Alleen simulatie»: een open besturing van consumentendrones bestaat niet (§17.1). Model, controle, cockpit en toestemmingen worden volledig uitgewerkt, zodat een echte adapter het uiterlijk niet verandert.
- **Eerlijk over de hub.** Een noodstop van de dronemotoren zit niet in de hub (de drone zou neerstorten) — die blijft op de afstandsbediening van de fabrikant, en de cockpit zegt dat ook; dit is een bewuste uitzondering op de volledige set bedieningselementen, voorgelegd aan de eigenaar (§17, punt 7). De vliegzone controleert de hub niet — de gegevens zijn ter informatie. Het stopcontact van de fiets schakelt uit bij 45 °C, maar dat is geen brandbeveiliging.
- **De bevestiging van de aanmelding** toont de maquette volgens het doel van OT §10: elke keer opnieuw, zonder onthouden; hoe de huidige code werkt — §17, punt 2.
- **Grenzen.** Het laadpunt hoort bij ‘Energie’ (Garage bouwt `hv-laadplan` en `hv-werkmodus` ongewijzigd in); de garagedeur — ‘Beveiliging › Toegang’; geozones — de zone mensen (hier een kaartlaag); termijnen — `/activiteit/onderhoud`; de beeldspeler wordt gedeeld met de camera's; de bladen van robots — het register van ‘Apparaten’, kaart en schema schrijft Garage.
- **Пілот / Piloot** — een blok op de pagina van de persoon `/instellingen/mensen/<id>`: bewijs van bekwaamheid (A1/A3, A2), geldigheidsduur, exploitantnummer (RDW); het kenmerk zet de eigenaar.

## 2. Uiterlijk in de zone

- **Held.** De stille hemel is samengedrukt tot de hoogte van de held; op de telefoon niet hoger dan een kwart van het scherm, bij scrollen krimpt hij tot een regel van de kop. De garagezin volgt de regels van de huiszin (OT §11): alleen het waargenomene; verouderd in de verleden tijd: «Електромобіль востаннє бачили вдома о 19:40 / Elektrische auto voor het laatst thuis gezien om 19:40». Onder de zin staan papieren chips van 28 px: «Дрон у базі · 96 % / Drone in het dock · 96 %».
- **Tegels** (OT §7): `hv-telemetrie` — 4×2 (lading, actieradius, drie getallen, silhouet); fiets, step, brommer, robot, drone aan de grond — 2×1; drone in de lucht — 4×2 met beeld. Op ‘Thuis’ — een kaart ‘Garage’ 2×2.
- **Tonen** (OT §4): de lading van het vervoer — `--hv-batterij`, het laden van de auto — `--hv-auto`, robots — `--hv-aan-vlak` met de rand `--hv-aan`; slot, alarm en drone dragen geen toon.
- **Teken met ritueel.** Een vergrendelde auto toont een vierkant met dubbele rand `--fout-vlak` (ontgrendelen is kritiek): een tik opent `hv-gevaar`. Een ontgrendelde auto — een gewone cirkel (‘vergrendelen’ is gewoon). Een drone aan de grond — een vierkant `--fout-vlak` (opstijgen is kritiek); in de lucht — de balk `hv-vluchtbalk` zonder ritueel. Bij een veronderstelde of verouderde toestand — de vorm van het hogere niveau.
- **Pictogrammen:** de rubriek en de auto — `Car`, fiets — `Bike`, laadpunt — `PlugZap`; step, brommer, drone, stofzuiger, maaier — een eigen SVG van 24×24 met lijndikte 2 (niet `Bot`).

## 3. Schermen met adressen

De grammatica van de schil: een pagina is een pad; een blad `?blad=<soort>:<id>` met het tabblad `&deel=bediening|geschiedenis|instellingen|kaders`; een dialoog `?dialoog=`; een moment `?t=`. Vervoer en drones hebben de soort `voertuig`, robots de soort `apparaat`. De dienstwoorden `voertuigen`, `drones`, `robots`, `missies`, `vluchten`, `vliegregels`, `kaart`, `laden`, `ritten`, `onderhoud`, `vlucht` zijn opgenomen in de verboden identificatoren.

| Tabblad, adres | Inhoud | Subpagina's, bladen, dialogen |
|---|---|---|
| Зараз / Nu `/garage` | zin, ‘Nu belangrijk’, stroken voor vervoer, drones en robots, kleine kaart | `?blad=voertuig:<id>` |
| Транспорт / Voertuigen `/garage/voertuigen` | lijst; kaart `/<id>` | `/<id>/laden`, `/<id>/ritten`, `/<id>/onderhoud`; `?dialoog=gestolen`, `?dialoog=zichtbaarheid` |
| Безпілотники / Drones `/garage/drones` | vloot, accu's, dock; kaart `/<id>` | cockpit `/<id>/vlucht`; `?dialoog=voorvlucht`; Місії / Missies `/garage/missies`, `/<id>`, `?dialoog=nieuw`; Польоти / Vluchten `/garage/vluchten`, `/<id>`; Правила й зони / Regels en zones `/garage/vliegregels` |
| Роботи / Robots `/garage/robots` | lijst; kaart `/<id>` | robotkaart `/<id>/kaart`; `?blad=apparaat:<id>` |
| Мапа / Kaart `/garage/kaart` | «Ділянка / Perceel» en «Околиці / Omgeving» | `?schaal=perceel\|omgeving&kaartlaag=voertuigen,geozones,vliegzones,routes,mensen&t=` |

Een adres, een melding of een snelkoppeling opent alleen een weergave: de controle vóór de vlucht toont via een adres de regels, maar de houdrail verschijnt pas na een tik op «Злетіти… / Opstijgen…».

## 4. Model en stroom

- **Nieuwe mogelijkheden:** `locatie`, `actieradius`, `laden`, `voorklimaat`, `ramen`, `kofferbak`, `motor`, `bandenspanning`, `vlucht`, `missie`, `robot`, `signaal`, `gps`; slot en alarm van het vervoer zijn de bestaande `vergrendeld` en `alarm`. De niveaus staan in de matrix `shared/huis-gevaar.ts` (fase 2) in plaats van `KRITIEKE_SOORTEN`.
- **Stroom** `POST /api/huis/stroom`: een drone in de lucht — elke seconde; een rijdende auto — eens per 10–30 s; in rust — periodiek opvragen; een slapende auto maakt de hub niet uit zichzelf wakker. ‘Verouderd’: een drone in de lucht — na 10 s (arcering en ouderdom), na 20 s — «втрата сигналу / signaal kwijt» met de laatste plek en wat de drone zelf doet; een rijdende auto — 2 min, een geparkeerde — 30 min.
- **Het leven van een opdracht** (OT §9): «очікує / wacht» (tot 10 s) → «виконується / bezig» → waargenomen of «не виконано / niet uitgevoerd». De tijd tot ‘niet uitgevoerd’ komt uit het manifest van de adapter en wordt in de tekst genoemd: «авто не відповіло за 40 с / de auto reageerde niet binnen 40 s». Een baken zonder terugkoppeling — «стан припущено / toestand verondersteld».
- **Poorten op de server:** het schrijfrecht van de bron → de rol → het ritueel van de mens of de stand `hv-stand` van de uitvoerder → de kaders van de eigenaar; ‘niet uitgevoerd’ noemt de stap.
- **Meldingen** (`emitCanonicalNotice`): `huis.voertuig` — vervoer en drones (signaalverlies tijdens de vlucht is ‘alarm’ voor de piloot); `huis.apparaat` — robots; `huis.energie` — laden. Begrenzingen (‘Automatisering’): het hoogteplafond van een missie van 120 m en de windgrens van de drone.
- **«Зупинити самостійні дії / Zelfstandige acties stoppen»** stopt het laadplan, het schema van de robots en de missies van uitvoerders en verandert geen standen. Een vlucht die al loopt, wordt niet afgebroken: de drone blijft zweven en wacht op de piloot, en ‘Naar huis’ is beschikbaar voor elke bewoner.

## 5. Зараз / Nu

```
TELEFOON 390 · stille hemel · glas: kop, onderbalk
┌ glas ─────────────────────────────┐
│ Garage             ▲1  •  !1  bel2│
├───────────────────────────────────┤
│ kolf Simulatie ×1 · 07:05         │
└───────────────────────────────────┘
 Nu │ Voertuigen │ Drones │ ›
 Beide auto's thuis. Elektrische
 auto laadt, klaar om 07:30.
 (Drone: dock · 96 %) (Maaier: regen)
┌ Nu belangrijk · 1 ── papier ──────┐
│▲ Band linksachter:       [Verder] │
│  1,9 bar, norm 2,5                │
└───────────────────────────────────┘
 Voertuigen  6 ˅                   i
┌ hv-telemetrie 4×2 ── papier ──────┐
│ Elektrische auto        ⌂ thuis   │
│ 64 % ▓▓▓▓▓▓▓░░┊░         310 km   │
│ laadt 7,4 kW → 80 % om 07:30      │
│ ▣ vergrendeld  [Klimaat]    [⋯]   │
└───────────────────────────────────┘
 Drones 2 ›   in het dock · 96 %
 Robots 2 ›   maaier: pauze, regen
┌ glas ─────────────────────────────┐
│ Thuis Kamers Energie Beveil. ▌Meer│
└─────────────────────────[Opdracht]┘
```

«▣» is het teken met ritueel, «┊» het laaddoel, `▲` ‘let op’ als driehoek met woord. Op de telefoon woont Garage in «Ще / Meer»; vanaf 700 px in de kop.

- Volgorde: zin → ‘Nu belangrijk’ (een filter op de ene gedeelde lijst, tot 3 regels: band, oververhitte accu, signaalverlies, vastgelopen robot) → Voertuigen → Drones → Robots → kleine kaart → ‘Onderhoud’ als regel. Actualiteit en simulatie staan één keer, in de kop; op een tegel alleen afwijkingen (‘slaapt’, ‘verouderd’).
- Zolang de drone in de lucht is, staat in de kop de chip «Дрон у польоті · 61 % / Drone in de lucht · 61 %», die naar de cockpit leidt; op kleine schermen — trede 4 van de voorrangsvolgorde van de schil (wijzerplaat `drone`).

## 6. Транспорт / Voertuigen

De kaart op de computer bestaat uit drie papieren kolommen boven de dagstrook: (1) lading, actieradius, laadmodus, slot; (2) het silhouet `hv-silhouet` (wat niet gemeten is, is gearceerd; het tekstequivalent is een lijst); (3) een kleine kaart met de bereikring en het klimaat in de auto. Op de telefoon staan dezelfde blokken onder elkaar; het blad `?blad=voertuig:<id>` heeft alle bedieningselementen van de kaart in het tabblad «Керування / Bediening».

- **Slot:** «Замкнути / Vergrendelen» — een cirkel, één tik. «Відімкнути… / Ontgrendelen…» — het teken met ritueel → `hv-gevaar` met een zin over het gevolg → de houdrail ‘1,2 s vasthouden’ of ‘Bevestigen (3)’ → de bevestiging van de aanmelding. De kofferbak en het uitschakelen van het alarm — net zo.
- **Laden** (ingebouwd uit ‘Energie’): `hv-werkmodus` «Пауза / Pauze · Розумно / Slim · Швидко / Snel» met de methode «дешеві години / goedkope uren» of «лише сонце / alleen zon», het doel in procenten, de vertrektijd, `hv-laadplan` en de chip «керує: план зарядки до 07:30 / stuurt: laadplan tot 07:30». «Зарядити зараз / Nu laden» toont de prijs van de beslissing: «+ € 0,84 проти плану / + € 0,84 t.o.v. plan».
- **Клімат салону / Voorklimaat:** doel en tijdstip van gereedheid; de ramen zijn een apart bedieningselement. **«Запустити двигун… / Motor starten…»** (waar de auto dat ondersteunt) is kritiek; `hv-gevaar` toont de plek van de auto, de CO-melder in de garage en ‘slaat na 10 min af’ (de termijn wijzigt de eigenaar); ‘auto in een gesloten garage’ is ‘let op’ met uitleg over koolmonoxide, zonder verbod.
- **Поїздки / Ritten:** afstand, verbruik, «€ 3,10 на 100 км / € 3,10 per 100 km», het spoor op de kaart. **Обслуговування / Onderhoud:** regels `hv-onderhoud` (APK, banden, ruitenwissers, maaimessen).
- **De plek is de plek van een mens:** «Хто бачить місце / Wie ziet de locatie» (standaard de eigenaar van het voertuig), «Пауза відстеження / Volgen pauzeren», sporen 30 dagen (§17).
- **Fiets, step, brommer, motorfiets** — dezelfde kaart zonder silhouet: baken, slot, alarm, «Позначити викраденим / Markeer als gestolen» (vaker de plek, een melding aan de volwassenen), «Заряджати до 80 % / Laden tot 80 %» via een slim stopcontact.

## 7. Безпілотники / Drones

- **Vloot:** de chip «готовий / klaar» of «не готовий: 2 причини / niet klaar: 2 redenen»; accu's (lading, cycli, gezondheid); dock (klep, laden).
- **Missies:** «Обліт ділянки / Rondje perceel», «Огляд даху / Dakinspectie», «Огляд сонячних панелей / Zonnepanelen bekijken». De route `hv-missie` op het schema van het perceel: punten met hoogte, duur, benodigde lading; punten versleep je of bewerk je met getallen; een punt buiten het perceel krijgt het niveauteken ‘gevaarlijk’ met woord.
- **Regels en zones:** klasse (C0–C4), massa, subcategorie (A1/A2/A3), Remote ID, plafond 120 m; een zonekaart met de datum van de gegevens en de regel «Довідково. Перед польотом перевірте офіційну карту / Ter informatie. Controleer vóór de vlucht de officiële kaart».
- **Vluchten:** piloot, wie de start gaf, missie, duur, hoogte, lading, weer, overgeslagen controleregels met reden; afspelen via `?t=`; uitvoer als CSV.

**Controle vóór de vlucht** `?dialoog=voorvlucht` (`hv-voorvlucht`, telefoon):
```
┌ glas: omhulling ── papier ───┐
│ Controle vóór de vlucht  [×] │
│ ‘Kleintje’ vliegt in 9 min   │
│ over het dak op max. 35 m    │
│ en keert terug naar het dock.│
│ ✓ Accu 96 %, nodig 48 %      │
│ ✓ GPS: 17 satellieten        │
│ ✓ Remote ID aan              │
│ ✓ Bewijs geldig tot 03.2029  │
│ ▲ let op Aangemeld via tunnel│
│ ▲ let op Wind 7, vlagen 11;  │
│   grens drone 10,7 m/s       │
│ — Vliegzone: niet door hub   │
│   gecontroleerd; data 08.11  │
│ ☐ Drone in zicht (verklaring)│
│ [ ⬣ Opstijgen… ] [Annuleren] │
└──────────────────────────────┘
```
- Toestanden van een regel — met teken en woord (in `aria-label`): «в порядку / in orde · увага / let op · не готово / niet klaar · хаб не перевіряє / niet gecontroleerd door de hub». ‘Niet klaar’ klapt uit tot ‘Waarom niet · Wat te controleren · Wat wel kan’.
- «Злетіти… / Opstijgen…» (`Octagon`, kritiek) opent `hv-gevaar`: het gevolg, de lijst van regels ‘let op’ en ‘niet klaar’ die de piloot overslaat, een veld voor de reden (verplicht als er ook maar één regel wordt overgeslagen), de houdrail → de bevestiging van de aanmelding (elke keer opnieuw, OT §10). **Elke** regel mag worden overgeslagen — de beslissing van de mens wordt precies zo uitgevoerd; de hub legt het overslaan en de reden vast in het vluchtverslag en in het Logboek.
- **Wie opstijgt, is een mens met het kenmerk ‘piloot’:** op een persoonlijk apparaat — de houdrail en de bevestiging van de aanmelding, op `wand` — de eigen persoonlijke code, op `tv`, `horloge`, `strook`, `inkt` — «Підтвердьте на телефоні / Bevestig op je telefoon». ‘Ik zie de drone’ is een verklaring van de piloot, geen controle; ‘Aangemeld via tunnel’ is alleen ter informatie.

**Cockpit** `/garage/drones/<id>/vlucht` (computer):
```
┌ glas ────────────────────────────────────────────────────────┐
│ Garage › Drones › ‘Kleintje’ › Vlucht    kolf ×1 • !1 bel    │
├──────────────────────────────┬─────────────────── papier ────┤
│ BEELD (gesimuleerd) · papier │ Hoogte    32 m ▕▓░░░▏ 120     │
│ rechtstreeks · 0,4 s         │ Snelheid  4,2 m/s             │
│ ▒ buurperceel afgeschermd   ▒│ Accu 61 % · 11 min            │
│               ○ opname uit   │ terugkeer 2 min: genoeg       │
├──────────────────────────────┤ Signaal 92 % · GPS 17         │
│ PERCEEL  ⌂dock ─●─ ─ ─ ┐     │ Wind 5, vlagen 8 m/s          │
│ punt 4 van 9 · nog 5 min     │ telemetrie: rechtstreeks 1 s  │
├──────────────────────────────┴───────────────────────────────┤
│ hv-vluchtbalk: [Zweven] [⌂ Naar huis] [Nu landen]            │
└──────────────────────────────────────────────────────────────┘
```
- `hv-vluchtbalk` staat vast onderaan op alle schermen en wordt niet door bladen bedekt; de drie veiligheidsacties worden meteen uitgevoerd, `hv-toost` heeft de regel «Як повернути / Terugdraaien». Telefoon: beeld → getallen → balk.
- De piloot bestuurt, de rest kijkt mee; ‘Naar huis’ is er voor elke bewoner (niet voor gasten), ook op tv, horloge en paneel. Beeldopname staat standaard uit, buurpercelen zijn gemaskeerd, de bewaartermijn is 7 dagen (§17).

## 8. Robots en kaart

- **Robot:** de toestanden «прибирає / zuigt · косить / maait · у базі / in het dock · повертається / keert terug · пауза / pauze · застряг / vast · несправність / storing»; de knoppen ▶ ⏸ ⌂ en ‘Zoeken’. Stofzuiger — kamers kiezen op `hv-plan` met een tik of via een lijst. Maaier — zones van het perceel, een weekschema, de pauzechips «дощ / regen», «темно / donker», «хтось у саду / iemand in de tuin». Een storingscode klapt uit tot «Що робити / Wat te doen».
- **Kaart** `hv-landkaart`: ‘Perceel’ (huis, tuin, dock van de drone, vlieggrens, maaizones, routes) en ‘Omgeving’ (wegenschema van de server, vervoer, geozones, bereikring). «Перегляд минулого / Terugblik» — `?t=`; een verouderde plek — een gearceerde cirkel en de ouderdom; het tekstequivalent — `hv-tabel` «Що де / Wat is waar».

## 9. Niveaus van acties en het ritueel van de mens

De regels van Garage voor de matrix `shared/huis-gevaar.ts`. Het niveau bepaalt alleen het teken en het ritueel van de mens; de toestemmingen van uitvoerders beperkt het niet (§10).

| Actie | Niveau | Ritueel van de mens |
|---|---|---|
| Vervoer vergrendelen; het alarm inschakelen; ‘Zweven’, ‘Naar huis’, ‘Nu landen’; een robot naar het dock sturen of pauzeren; het laden stoppen; de auto wekken; ‘Zoeken’; de stofzuiger starten; laadmodus en laaddoel | gewoon | direct |
| Voorklimaat; ‘Nu laden’; de fiets overdag laden; video opnemen; ‘Markeer als gestolen’; volgen pauzeren; een missie binnen het perceel bewerken | gevoelig (`Eye`) | ‘Ongedaan maken’ 10 s; waar terugdraaien niet kan — een knop met een aftelling van 3 s |
| Autoramen; de fiets 's nachts laden; de maaier starten; het slot van fiets, step of brommer ontgrendelen; een missiepunt buiten het perceel | gevaarlijk (`Triangle`) | `hv-gevaar`, houdrail met het gevolg |
| Auto of kofferbak ontgrendelen; het alarm van het vervoer uitschakelen; opstijgen en een missie starten; de motor starten | kritiek (`Octagon`) | houdrail en bevestiging van de aanmelding; bij opstijgen ook de controle vóór de vlucht |

De niveaus zijn afgestemd op ‘Apparaten’ (maaier — gevaarlijk) en ‘Energie’ (‘Nu laden’ — gevoelig).

## 10. Toestemmingen van uitvoerders en hulpmiddelen voor agenten

Elke actie uit §9 en uit de bladen heeft een eigen `hv-stand` voor de scène, de automatisering, de optimalisator en elke agent; standaard ‘Uit’; de eigenaar kan elke stand kiezen, ook ‘Altijd’ voor het ontgrendelen van de auto, de motor, opstijgen en missies. Termijn, kamers, uren en budget zijn optionele kaders van de eigenaar. Een agent kan rechten niet uitbreiden en niet inperken — niet de eigen en niet die van anderen. Elke wijziging van een toestemming en elke actie op grond daarvan levert een vermelding in het Logboek en in `hv-meldingen` op; naast gevaarlijke en kritieke acties staat een ‘!’, bij ‘Altijd’ een blijvende markering en ‘! N’ in de kop.

- **Doorsnede van het register:** `/instellingen/toestemmingen?filter=garage`, met de groepen «Транспорт: стан / Voertuigen: status», «Транспорт: місце / Voertuigen: locatie» (het verzoek gaat naar de eigenaar van het voertuig), «Замки й сигналізація / Sloten en alarm», «Зарядка й клімат / Laden en voorklimaat», «Двигун / Motor», «Безпілотники: стан / Drones: status», «Безпілотники: безпека польоту / Drones: vliegveiligheid», «Зліт і місії / Opstijgen en missies», «Роботи / Robots»; een groeps-`hv-stand` «Для всієї групи / Voor de hele groep». Het blad toont dezelfde `hv-stand` in het tabblad ‘Instellingen’ met de koppeling «Показати в реєстрі / In register tonen».
- **‘Vragen’** levert een `hv-verzoek` op met als inhoud een `hv-voorstel`. Een verzoek om op te stijgen gaat naar de piloot; ‘Eén keer goedkeuren’ opent dezelfde controle en hetzelfde ritueel van een kritieke actie. Vermelding: auteur — de agent, ‘goedgekeurd door: Olena, piloot’.
- **‘Altijd’** voor opstijgen: de hub doorloopt de controle zelf; regels ‘niet klaar’ stoppen de missie van de uitvoerder, tenzij de eigenaar in de kaders heeft toegestaan ze over te slaan («Обходити рядки перевірки / Controleregels overslaan» — standaard geen enkele). Het teken van de auteur op de drone, `hv-toost`, een blijvende ‘!’.
- **De volledige set hulpmiddelen voor agenten** (groep `huis` van de koppeling, fase 5), elk onder een eigen `hv-stand`: `tonen_voertuigen`, `tonen_voertuig_locatie`, `tonen_ritten`, `vergrendelen_voertuig`, `ontgrendelen_voertuig`, `instellen_voertuigalarm`, `wekken_voertuig`, `instellen_laden`, `instellen_voorklimaat`, `bedienen_ramen`, `starten_motor`, `stoppen_motor`, `markeren_gestolen`, `pauzeren_volgen`; `tonen_drones`, `tonen_vluchten`, `bewerken_missie`, `starten_missie`, `zweven_drone`, `terugroepen_drone`, `landen_drone`, `instellen_opname_drone`; `tonen_robots`, `bedienen_robot`, `instellen_robotzones`, `instellen_maairooster`; `starten_scenario` (scenario's van de groep ‘Garage’). Een hulpmiddel om toestemmingen te wijzigen bestaat niet.

## 11. Toelichtingen

De berekende teksten levert `/api/huis/gevolg`. Een toelichting `hv-gevolg` hebben: de `hv-stand` van een gewone en een gevoelige actie, elke gevoelige actie en elke controleregel; een gevaarlijke en een kritieke actie hebben alleen de ‘!’. Op tv is de ‘i’ een apart focuselement.

1. **Auto ontgrendelen** (de zin in `hv-gevaar`). «Що станеться: авто відімкнеться для кожного, хто стоїть поруч. Пов'язано з: авто на під'їзді, дані 4 хв тому; удома нікого. Як повернути: „Замкнути“; авто замкнеться саме за 2 хв, якщо дверей не відчинять.» / «Wat er gebeurt: de auto gaat open voor iedereen die ernaast staat. Hangt samen met: de auto staat op de oprit, gegevens van 4 min geleden; er is niemand thuis. Terugdraaien: ‘Vergrendelen’; de auto vergrendelt na 2 min vanzelf als geen deur opengaat.»
2. **De regel ‘Accu’ is niet klaar.** «Чому ні: заряд 41 %, місія з поверненням потребує 48 %. Що перевірити: батарея Б2 у базі має 96 %. Що можна натомість: „Обліт ділянки“ потребує 30 %.» / «Waarom niet: accu 41 %, de missie met terugkeer vraagt 48 %. Wat te controleren: accu B2 in het dock heeft 96 %. Wat wel kan: ‘Rondje perceel’ vraagt 30 %.»
3. **‘Altijd’ voor opstijgen door een agent (‘!’).** «Що може статися: дрон злетить без пілота поруч, над людьми в саду. Пов'язано з: політ без пілота виходить за відкриту категорію EASA. Як повернути: „Повернутися додому“. Хто зможе це запускати: агент „Помічник“, 10–16 год. Як вимкнути: „Вимкнено“ тут.» / «Wat er kan gebeuren: de drone stijgt op zonder piloot in de buurt, boven mensen in de tuin. Hangt samen met: vliegen zonder piloot valt buiten de open categorie van EASA. Terugdraaien: ‘Naar huis’. Wie dit kan starten: agent ‘Assistent’, 10–16 uur. Uitzetten: ‘Uit’ hier.»

## 12. Simulator

- **De vloot van het demohuis:** een elektrische auto (77 kWh), een benzineauto, twee elektrische fietsen, een elektrische step, een brommer; de drones «Малий / Kleintje» (249 g, C0) en «Оглядовий / Verkenner» (895 g, C1) met een dock en vier accu's; een stofzuiger en een maaier; zonder modelnamen en logo's. Het beeld is een schema van het perceel van de server met een kolf en het woord ‘Simulatie’.
- **Scenario's van de groep «Гараж / Garage»:** «Ранковий виїзд / Ochtendrit», «Повернення й зарядка / Thuiskomst en laden», «Авто спить / Auto slaapt», «Низький тиск шини / Bandenspanning laag», «Велосипед рушив / Fiets beweegt», «Батарея гріється / Accu te warm», «Огляд даху / Dakinspectie», «Порив вітру / Windvlaag», «Втрата сигналу / Signaalverlies», «Заряду замало / Accu te laag», «Косарка застрягла / Maaier vast», «Двигун у зачиненому гаражі / Motor in gesloten garage». Een mislukte opdracht — de schakelaar «Не підтверджувати команду / Opdracht niet bevestigen».

## 13. Schermprofielen

- `wand` (`/paneel/wand/<id>`): de samenvatting ‘Nu’, de veiligheidsacties en ‘Vergrendelen’ met één tik; het ritueel volgt OT §10 en schil §6: gewoon en gevoelig — zonder code, direct (gevoelig met ‘Ongedaan maken’ 10 s); gevaarlijk — de houdrail; kritiek — de houdrail en de persoonlijke code; opstijgen — de houdrail, de persoonlijke code van de piloot en de controle vóór de vlucht.
- `tv`: de cockpit om mee te kijken en ‘Naar huis’; kritiek — «Підтвердьте на телефоні / Bevestig op je telefoon». Toestemmingen worden hier niet gewijzigd.
- `horloge`, `rond`, `vierkant`, `klein`: de wijzerplaat «Авто / Auto» (lading en ‘klaar om 07:30’) en de tijdelijke wijzerplaat `drone` (lading, ‘Naar huis’). `strook`: een draad ‘hoogte │ lading │ signaal’ in de uitzonderingszone. `inkt`: een tabel ‘wat staat waar en met hoeveel lading’ zonder hemel.

## 14. Toestanden

OT: «у базі / in het dock · в дорозі / onderweg · повертається / keert terug · заряджається / laadt · на землі / aan de grond · у польоті / in de lucht · сідає / landt · низький заряд / accu bijna leeg · втрата сигналу / signaal kwijt», de twaalf gedeelde toestanden (О Р В З Х П). **Aan OT toe te voegen:** спить / slaapt · готовий / klaar · не готовий / niet klaar · злітає / stijgt op · зависає / zweeft · прибирає / zuigt · косить / maait · пауза / pauze · застряг / vast · несправність / storing; de toestanden van een controleregel (§7).

## 15. Componenten

**Uit OT** (behalve de basis en de lagen): `hv-telemetrie` (varianten `--voertuig`, `--drone`, `--robot`), `hv-vluchtbalk`, `hv-landkaart`, `hv-plan`, `hv-dagstrook` (sporen ‘ritten’, ‘laden’, ‘vluchten’, ‘robots’), `hv-werkmodus`, `hv-laadplan`, het teken met ritueel, `hv-risico`, `hv-stand`, `hv-gevaar`, `hv-rail`, `hv-gevolg`, `hv-pincode`, `hv-verzoek`, `hv-voorstel`, `hv-toost`, `hv-bericht`. **Nieuw:** `hv-silhouet` (eigen SVG van bovenaf: deuren, ramen, kofferbak, laadpoort, bandenspanning); `hv-voorvlucht` (controleregels, een veld voor de reden van het overslaan); `hv-missie` (route, duur, benodigde lading, hoogte); `hv-onderhoud` (een ring ‘resterend’ en een datum). **Voor de schil:** de parameter `schaal` en de dienstwoorden uit §3; **voor ‘Beveiliging’:** de speler voor de drone.

## 16. Gedekt en uitgesteld

| Fase | Wat uit deze zone |
|---|---|
| 0 | specificatie en schets van alle schermen: cockpit, controle, `hv-stand` van elke actie |
| 1 | gesimuleerde vloot in het demohuis, de kaart ‘Garage’ op ‘Thuis’ |
| 2 | bedieningsbladen van alle klassen van de zone, de regels van de matrix uit §9, `hv-stand` van elke actie, het leven van een opdracht, `huis.voertuig`, audit |
| 3 | in Opdracht: ‘Laad de auto tot 80 % vóór 07:30’, ‘Waar is de auto?’, ‘Stuur de drone naar huis’ |
| 4 | de rubriek Garage: tabbladen, controle, cockpit, missies, vluchten, robots, kaart, ritten |
| 5 | hulpmiddelen voor agenten uit §10, verzoeken om op te stijgen, robotschema's als automatiseringen |
| 6 | `wand`, `tv`, de wijzerplaten `drone` en ‘Auto’, `strook`, `inkt` |
| 7 | geschiedenis van ritten, vluchten en laadbeurten, verbruik per 100 km |
| 8 | het kenmerk ‘piloot’, het blok ‘Piloot’, ‘Wie ziet de locatie’, bewaartermijnen van sporen |
| 9 | dronebeeld in de cameraspeler, maskers |
| 10 | voorklimaat op de klimaatpagina |
| 11 | ‘Onderhoud’, herkenning van vervoer en robots, gezondheid van accu's |
| 12 | echte auto's, robots en laadpunten via Home Assistant, daarna eigen adapters |

**Uitgesteld:** de editor voor robotzones — samen met de editor van de plattegrond (fase 6); V2H, V2G, OCPP — ‘Energie’; bakens voor spullen — de zone mensen (fase 8). **Buiten de schaal tot §17.1:** echte drones en rechtstreeks beeld.

## 17. Besluiten voor de eigenaar

1. **Echte drones.** Is er ooit een adapter nodig (alleen open platforms met MAVLink of professionele docks)? Tot het besluit blijven drones een simulatie.
2. **Eenmalige bevestiging van de aanmelding** (gedeeld voor het hele platform, plan §7). De huidige code (`STAP_OP_MS`) houdt die 5 min voor de hele sessie vast; de maquette toont al het doel van OT: elke keer opnieuw.
3. **Locatie in de browser** (plan §7): daarmee krijgt de controle de regel ‘telefoon van de piloot binnen 150 m van de startplek’; zonder blijft ‘Ik zie de drone’ een verklaring.
4. **Privacy** (fase 8): sporen van het vervoer 30 dagen en zichtbaarheid ‘eigenaar van het voertuig, de rest met diens toestemming’; dronebeeld 7 dagen, standaard zonder opname. Termijnen bevestigen of wijzigen.
5. **Bronnen voor kaart, vliegzones en weer** (fase 12): PDOK, OpenStreetMap, de officiële zonekaart, KNMI of Open-Meteo — wat is toegestaan; tot dan een gesimuleerd schema.
6. **Echte vloot** (fase 12): welke auto's en diensten van fabrikanten worden gekoppeld en hoe vaak ze worden opgevraagd.
7. **Noodstop van de dronemotoren** — een bewuste uitzondering op ‘alle bedieningsinstrumenten, zonder uitzondering’: de hub biedt die niet, want de drone zou neerstorten en de verbinding via de tunnel loopt achter. Voorstel: op de afstandsbediening van de fabrikant laten. Wil de eigenaar toch een bedieningselement, dan wordt het een kritieke actie met houdrail en bevestiging van de aanmelding in fase 12, samen met de echte adapter (punt 1), en alleen waar die adapter het ondersteunt.
