> 🌐 **Taal:** [Українська](09-АРХІТЕКТУРА.uk.md) · **Nederlands** | [Hoofddocument](../ONTWERP-HUIS-20261110.nl.md)

# Zone 9. Technische architectuur en fasen / Архітектура

Taak HUIS-001 · fase 0 · 10.11.2026 · status: ter goedkeuring bij de eigenaar

De zone is de enige bron voor de getallen van de directe gegevens, de termijnen, de opslag, het paspoort van de demowoning, het register van scenario's en de volgorde van de fasen; ze beheert ook de sectie «Система / Systeem». Bronnen: plan HUIS-001 (§1, §3, §3.8, §4) en de [ontwerptaal ‘Живий дім / Levend huis’](../ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ-20261110.uk.md) (hierna: OT). De grammatica van de adressen komt uit de zone [‘Schil’](01-SCHIL.nl.md): blad `?blad=<soort>:<id>`, dialoog `?dialoog=`, moment `?t=`. De schaal van de fasen is 0–12 (§16).

## 0. Wat er is veranderd ten opzichte van de vorige versie

- **‘Levend huis’** in plaats van ‘Warme precisie’: de verboden op glas, hemel en kleurverlopen zijn opgeheven. De pagina's van Systeem staan op een stille hemel, alles met getallen staat op papier `--panel`, glas `--hv-glas` is er alleen voor de kop, de navigatie, de omhulling van de bladen en «Команда / Opdracht».
- **Toestemmingen** (plan §3.8): de matrix `shared/huis-gevaar.ts` bepaalt alleen het niveau van de actie en het ritueel voor de mens. Geschrapt zijn: plafonds, ‘de hoogste toestemming’, een uitgeschakeld ‘Altijd’ voor kritieke acties, ‘een stand schakelt het alarm nooit uit’, ‘kritiek op een paneel — alleen bekijken’ en de termijn van 30 dagen voor ‘Altijd’.
- **Volgorde van de fasen** — plan §4; de verwijzingen zijn omgezet, de gevolgen staan in §16. **Alle bedieningsinstrumenten** staan in de schaal: bladen van alle klassen — fase 2, instrumenten van agenten — fase 5; de volledigheid controleert de bouwstap (§4).
- **Afgestemd op OT:** `/paneel/<profiel>/<id>`; de toestanden ‘wacht → bezig → niet uitgevoerd’; looptijd per klasse; schakelaars van Systeem hebben een ‘i’, geen ‘!’; `?dialoog=stoppen`, `?dialoog=start`; de vlag `huis-levend`; de namen van de instrumenten komen uit de zone [‘Assistent en agenten’](08-ASSISTENT-EN-AGENTEN.nl.md).

## 1. Weergave van de zone

De sectie ‘Systeem’ opent met de kaart `hv-systeemkaart`: de groepstitels staan op de stille hemel (`--text`, 20/700), de groepen zijn papieren `hv-blok` die inklappen. Simulator, ‘Wereld’, diagnose en de tabellen met termijnen zijn papieren blokken. In de simulatie volgt de hemel de huistijd, met het onderschrift «небо за часом дому / hemel volgt huistijd»; een alarm (`.is-nood`) schakelt hemel en glas uit. Makerstekens komen uit het alfabet `hv-maker`: simulator `FlaskConical`, systeem `Cpu`, optimalisator `Gauge`.

## 2. Contract van de adapter (`shared/huis-adapter.ts`)

```ts
interface HuisAdapter {
  manifest: { id; naam; herkomst: 'echt'|'simulatie'; pad; configSchema;
              wachtMs;                              // eerste antwoord, ≤ 10 000
              looptijdMs: Record<Klasse, number> }; // looptijd van de klasse
  start(ctx: { woningId; klok; geheim(); meld(g) }); stop();
  ontdek(); koppel(stap, invoer);   // koppelstappen: ‘fysieke handeling, N s’
  stuur({ opdrachtId; bronId; mogelijkheid; waarde; deadline }): { aanvaard; fout? };
  gezondheid(): { stand: 'goed'|'verzwakt'|'auth_vereist'|'limiet'|'offline'; detail } }
// meld: toestand | voorval | beschikbaarheid | ontdekt | verdwenen
```
De adapter schrijft niet in de database en kent geen mensen. De enige ontvanger, `backend/huis/inname.ts`, houdt de schaduw ‘gewenst / waargenomen’ bij, de geschiedenis en de bus met auteur. `stuur` neemt alleen aan; de bevestiging is de gebeurtenis `toestand`. De adapter van Home Assistant wordt in het contract verpakt zonder dat zijn gedrag verandert.

## 3. Simulator en demowoning

- **Herkomst is een eigenschap van de woning** (`huis_woningen.herkomst`). De eerste start (`/overzicht?dialoog=start`) maakt «Демо-дім / Demowoning» aan; een echt huis begint leeg. De server koppelt geen adapter `echt` aan de demowoning en omgekeerd: een gemengd huis bestaat niet, dus de simulatie wordt gemarkeerd door de chip `hv-sim`, het stempel, de hoek van de grafiek, de melding en het Logboek, niet door een kolf op het element. De zin ‘er is geen echt apparaat gewijzigd’ is altijd waar.
- **Externe kanalen** van de demowoning blokkeert de server totdat de eigenaar «Зовнішні сповіщення / Externe meldingen» aanzet (met ‘i’).
- **Overstap:** het stappenplan «Перенести налаштування / Instellingen overnemen» (`hv-vervang`): kamers, plattegrond, scènes en automatiseringen gaan over als concepten in de stand «Спостереження / Meekijken»; toestemmingen, codes en geschiedenis niet: in een echt huis begint elke toestemming op ‘Uit’.
- **Kern** — pure functies `shared/huis-sim/`: `f(kiem, huistijd, logboek van opdrachten en handmatige waarden)`; het afgelopen etmaal rekent de kiem opnieuw uit, zodat de dagstrook in fase 1 werkt zonder geschiedenis. De referentie voor de tests is de hash van het dagspoor.
- **Світ / Wereld:** een handmatige waarde (sensor, persoon, plaats van de auto, wind, uurprijs) is een gebeurtenis van de auteur ‘simulator’ met het label «ручне / handmatig» tot «Повернути до сценарію / Terug naar scenario». «Додати віртуальний пристрій / Virtueel apparaat toevoegen» — elk type uit de zone [‘Apparaten’](03-APPARATEN.nl.md), zodat het blad van elke klasse uit te proberen is. **Траси / Sporen:** opnemen, afspelen, opslaan als scenario. **Storingen** zijn gewone schakelaars, geen `hv-stand`.

**Twee klokken** (in een echt huis lopen ze gelijk). Echte tijd: «Повернути / Ongedaan maken» 10 s, wachten en de looptijd van de klasse, de schermbeveiliging na 2 min en de terugkeer naar ‘Thuis’ na 5 min, het vergrendelen van `deur` 30 s, de codepauze 5 min, sessies en elke termijn die de eigenaar heeft ingesteld (bij ×600 zou een termijn van 30 dagen in 72 minuten verlopen). Huistijd: schema's, tarieven, grafieken, stille uren, het dagoverzicht, de kaders ‘uren’ en ‘actiebudget’, escalatie, ritten en vluchten. Vanaf ×10 zwijgen de externe kanalen; een nieuwe `hv-verzoek` zet de snelheid op ×1 met een uitleg in `hv-sim`; ×600 pauzeert na 30 huisdagen.

**Paspoort** (`paspoort.ts`): ‘Demowoning · Wilgenlaan 12’, Utrecht; het referentiemoment is maandag 9 november 2026, 14:30. 14 kamers, tuin, schuur; ongeveer 120 apparaten — een exemplaar van elk type, en telkens één ‘onbereikbaar’, ‘toestand aangenomen’, ‘verouderd’ en ‘niet uitgevoerd’; P1 op drie fasen, zon 4,2 kW, batterij 10 kWh, warmtepomp, tarief voor 48 uur; vier bewoners en een gast. Garage: elektrische auto, auto, twee elektrische fietsen, step, brommer, twee drones met basisstation, stofzuiger, grasmaaier. Camera's: 4, het beeld is een SVG van de server, elke 2 s. De maquette: 10 kamers, 48 apparaten, de garage volledig. **Scenario's** (`scenarios.ts`): 36 — achtergrond 3, energie 8, beveiliging 7, garage 11, agenten 3, systeem 4; de maquette gebruikt er 15.

## 4. Register, risicomatrix, poorten

- **Register.** `huis_apparaten` (0128) is de tabel van entiteiten en wordt niet hernoemd; daarboven komt de nieuwe `huis_hardware`. Toegevoegd worden `hardware_id`, `domein`, `klasse`, `naam_uk`, `naam_nl`, `aliassen`, `aangenomen`; aan `huis_toestanden` — `gewenst`, `oorzaak`. Migraties vanaf 0200, RLS alleen via `app.huis_is_lid()`.
- **Volledigheid.** Het register van bladen `src/huis/bladen/`: klasse → «Керування / Bediening · Історія / Geschiedenis · Налаштування / Instellingen». De test faalt als een klasse geen blad heeft, een mogelijkheid geen regel in de matrix of een actie geen instrument in de connector.
- **Risicomatrix** `shared/huis-gevaar.ts`: ‘mogelijkheid × richting → niveau → ritueel voor de mens’; vervangt `KRITIEKE_SOORTEN` en voedt het teken met ritueel, `hv-risico`, `hv-gevaar` en het register `/instellingen/risico`. Ze beperkt de toestemmingen niet. Het besluit komt in `orchestratie/BESLUITEN.md` met de code van fase 2.
- **Toestemmingen** — `huis_beleid`: (actie × uitvoerder) → stand en optionele kaders van de eigenaar. Geen regel — ‘Uit’.
- **Poorten** (interface, motor, Opdracht, connector): bron («лише читання / alleen-lezen») → rol («немає доступу / geen toegang») → voor een mens het ritueel van het niveau; voor een uitvoerder pauze → stand → kaders. Een weigering noemt de poort: «Не виконано: дію вимкнено для сцен / Niet uitgevoerd: actie staat uit voor scènes».
- **Proefdraaien** `POST /api/huis/gevolg`: wat er geraakt wordt, ‘wat er gebeurt’, ‘hangt samen met’, ‘terugdraaien’ en de geldende stand van de uitvoerder; dit tonen `hv-gevolg`, `hv-opdracht`, `hv-gevaar` en `hv-voorstel`. De bouwstap weigert een bedieningselement zonder toelichting.

## 5. Toestemmingen op de server

- **Standen** (OT §10): «Вимкнено / Uit» — wordt niet uitgevoerd en niet aan de agent aangeboden; «Питати / Vragen» — `hv-verzoek` zonder opgelegde termijn; «Завжди / Altijd» — wordt uitgevoerd binnen de kaders van de eigenaar, met makersteken en `hv-toost`. Apart voor scènes, automatiseringen, de optimalisator en elke agent; standaard ‘Uit’; de eigenaar kan voor elke actie elke stand kiezen.
- **Alleen de eigenaar wijzigt**, op een persoonlijk apparaat; ‘Altijd’ voor een gevaarlijke of kritieke actie vraagt een bevestiging van de aanmelding bij het platform (een identiteitscontrole, geen beperking). Op `/paneel/*` en `tv` alleen lezen. Alleen deze functie schrijft in `huis_beleid`; de controle staat in `rechten.sql`.
- **Een agent** heeft geen route of instrument dat toestemmingen, kaders, pauze, rollen of geheimen wijzigt — niet de eigen en niet die van anderen.
- **Logboek verplicht:** elke wijziging (bij een groepselement een vermelding per actie) en elke actie op grond van een toestemming — ‘wie · wat · waarom · was → werd · via welke toestemming’ in `huis_handelingen` en `emitCanonicalNotice`; alleen toevoegen.
- **‘!’** bij `hv-stand` van een gevaarlijke of kritieke actie licht het risico toe; bij ‘Altijd’ staat een vaste markering die niet te sluiten is. **‘! N’** telt de server in de momentopname: de geldende ‘Altijd’ voor gevaarlijke en kritieke acties en het hoogste niveau. **Pauze** (`huis_pauze`, `?dialoog=stoppen`) wijzigt de standen niet; alleen de eigenaar heft haar op. **Een termijn van de eigenaar** verloopt in echte tijd — de stand wordt ‘Uit’, met een vermelding van de auteur ‘systeem’.
- **Goedkeuring van een verzoek** is een menselijke actie met het ritueel van het niveau: bij kritiek een rail en een bevestiging van de aanmelding ter plaatse.

## 6. Directe gegevens

- **Stroom** `POST /api/huis/stroom` (`fetch`, `ReadableStream`; de inhoud van het verzoek is de sessiecontext en `laatsteId`) — een aparte verwerker vóór de router, omdat die antwoorden buffert.
- **Pakketten:** `momentopname` → `delta` → `opnieuw` → `rechten` → `afgemeld`; `spoed` (alarm, toestand van een opdracht, verzoek, pauze) gaat meteen, de rest elke 250 ms; levenssignaal elke 15 s; inhalen uit de ringbuffer (2000 pakketten of 5 min). De momentopname bevat de fase van de hemel, ‘! N’ en de pauze. Terugval: na drie mislukkingen of 45 s stilte wordt elke 30 s opgevraagd. Grenzen: 6 stromen per persoon, 1 per scherm, 24 schermen per woning.
- **Toestanden van een opdracht** (OT §9): de servermachine (`verzonden → aangenomen → bevestigd | geweigerd | verlopen`) is intern; de interface toont «очікує / wacht» tot 10 s → voor klassen met looptijd «виконується / bezig» tot de tijd van de klasse (gordijnen 60 s, poort en garagedeur 90 s, klep 30 s, slot 15 s, overige 60 s) → waargenomen of «не виконано / niet uitgevoerd»; zonder terugkoppeling ‘toestand aangenomen’.
- **Verouderd na:** P1 60 s; slot, alarminstallatie 5 min; netwerkapparaten 15 min; sensoren op batterij twee meldintervallen; vervoer 2 min in beweging, 30 min geparkeerd; drone tijdens de vlucht 10 s.

## 7. Geschiedenis, Logboek, audit

De bus staat in het geheugen; gebeurtenissen in `huis_gebeurtenissen` (opschonen gebeurt in het nachtelijke onderhoud); audit in `huis_handelingen`: voor `mijnruimte_app` alleen INSERT, met de hash van de vorige vermelding.

| Gegevens | Echt huis | Demowoning |
|---|---|---|
| ruwe metingen | 14 dagen | ≤ 200.000; vanaf ×10 niet opgeslagen |
| samenvattingen per 5 min / uur / dag | 90 dagen / 10 jaar / onbeperkt | ≤ 500.000 |
| toestandsgeschiedenis, gebeurtenissenlogboek | 400 dagen | ≤ 200.000; ≤ 50.000 |
| audit van acties en toestemmingen | 2 jaar | ≤ 20.000 |
| uitvoeringssporen; routes | 30 dagen | laatste 20; ≤ 30 huisdagen |

≈ 130.000 rijen per dag, < 1,5 GB. Geen partitionering van tabellen: BRIN en nachtelijk verwijderen in porties.

## 8. Motor zonder sessie van een mens

- `backend/huis/motor.ts` draait in het serverproces; de kern (fase 2) bestaat uit de planner, `huis_timers`, de poorten, de sporen `huis_runs` en de quarantaine van lussen; bewerker en versies volgen in fase 5.
- Een automatisering handelt namens de persoon die haar heeft aangezet (`alsGebruiker`, RLS wordt niet omzeild); verliest die persoon de toegang, dan pauzeert de regel. Elke stap gaat door `hv-stand` van de uitvoerder en door de kaders.
- Een huisstand is een scène: de stap ‘alarm uitschakelen’ daarin wordt uitgevoerd op grond van de toestemming voor scènes (standaard ‘Uit’), net als elke andere stap.
- De optimalisator is een aparte uitvoerder; tot fase 7 werkt hij in de schaduwstand (‘zou hebben gedaan’).
- **Bevestiging van de aanmelding** geldt nu 300 s per sessie (`STAP_OP_MS`). Voorstel: eenmalig, gekoppeld aan de hash van de actie; tot het besluit zeggen de teksten «Підтвердження діє 5 хв для цього сеансу / Bevestiging geldt 5 min voor deze sessie».

## 9. Schermen, koppeling, lokale route

- `huis_schermen`: profiel, kamer, plaatsing, dichtheid, thema, `indeling` (JSON met versie), kiosk. Adres: `/paneel/<profiel>/<id>`; afbeelding en gegevens voor firmware: `/api/huis/scherm/<id>/beeld` en `/gezicht` (schil §6).
- **Koppeling:** een code van 6 cijfers en een QR-code maken een sessie ‘scherm’ zonder persoon; de eigenaar bevestigt in `?dialoog=koppelen` met de aanmelding bij het platform. De sessie bevestigt geen aanmelding en wijzigt geen toestemmingen; ze geldt tot «Відкликати / Intrekken» of tot de termijn van de eigenaar.
- **Menselijke acties op een paneel** (OT §10, schil §6): gewoon — meteen; gevoelig — meteen, met ‘Ongedaan maken’ 10 s, zonder code; gevaarlijk — rail; kritiek — persoonlijke code als bevestiging van de aanmelding en rail, op `tv`, `horloge`, `strook`, `inkt` — «Підтвердьте на телефоні / Bevestig op je telefoon». Daarom horen persoonlijke codes bij fase 6.
- **Lokale route:** in het thuisnetwerk leidt `huis.tarasevych.com` naar de VM (lokale DNS, certificaat via DNS-controle). Het blad ‘Verbinding’ (`?blad=verbinding`, `hv-verbindingsketen`) toont «локально / lokaal» of «через тунель / via tunnel»; `hv-versheid` houdt de drie toestanden uit OT. Zonder lokale route is er geen knop ‘Lokaal proberen’, en bij ‘Beveiliging’ staat «Без інтернету панелі не покажуть тривогу / Zonder internet tonen panelen geen alarm».

## 10. Connector, meldingen, zoeken

- **Connector:** `'huis'` in `Subdomein` en een groep in `shared/connector-v2/catalogus.ts`; naam `<essentie>_<agent>_huis_tarasevych_com_gebruiker`. De volledige set staat in de zone ‘Assistent en agenten’ §7 en in [‘Garage’](06-GARAGE.nl.md) §10: lezen, alle apparaatklassen, groepen, scènes, regels, energie, beveiliging, camera's, vervoer, drones, robots, apparatuur, simulator. Instrumenten voor toestemmingen, kaders, pauze, rollen, geheimen en audit bestaan niet.
- **Twee schakelaars, allebei van de eigenaar:** de groep `huis` op de pagina van de connector en `hv-stand` van de agent per actie. ‘Uit’ — de actie wordt niet aangeboden, een aanroep geeft ‘niet uitgevoerd’ met de naam van de poort. Apparaatnamen zijn onbetrouwbare gegevens.
- **Meldingen** (`emitCanonicalNotice`): `huis.alarm` — alarm; `.toegang`, `.integratie`, `.automatisering`, `.agent` — belangrijk; `.apparaat`, `.energie`, `.voertuig`, `.systeem`, `.simulatie` — ter informatie.
- **Zoeken** `POST /api/huis/zoek` met inachtneming van de rechten; weer, feestdagen en kaart zijn serverbronnen met een cache, in de demowoning levert de simulator ze.

## 11. «Система / Systeem» — alles onder `/instellingen/…`

```
▾ Дім / Woning  adres · tijdzone · valuta · eenheden  [Instellingen overnemen]
▸ Люди й доступ / Mensen en toegang     ▸ Приватність / Privacy
▸ Дозволи й небезпечні дії / Toestemmingen en gevaarlijke acties   ! 2
▸ Сповіщення / Meldingen   ▸ Екрани / Schermen   ▸ Інтеграції / Integraties [3]
▸ Симулятор / Simulator    ▸ Дані й зберігання / Gegevens en opslag
▸ Секрети / Geheimen       ▸ Діагностика / Diagnose
▸ Тунель і локальний шлях / Tunnel en lokale route
▸ Доступність / Toegankelijkheid   ▸ Для знавців / Expertweergave
▸ Вітрина / Toonzaal       ▸ Калькулятор / Planner
Platform: Kopieën ▸ Bijwerken ▸ Hoofdsleutel ▸ (koppelingen met eerlijke status)
```
De oude wortels `/integraties`, `/simulator`, `/schermen`, `/showroom` en `/planner` worden doorverwezen. ‘Geheimen’ toont naam, datum en waar het geheim wordt gebruikt, zonder waarden. Camera, microfoon en locatie zijn drie schakelaars onder ‘Privacy’, standaard ‘Uit’, met ‘i’.

## 12. Register van entiteiten

Entiteit — tabellen `huis_…` — fase: woning, apparaat, entiteit — woningen+, hardware, apparaten+ — 1 · logboek, audit, simulator, sporen — gebeurtenissen, handelingen, sim_stand, sim_sporen — 1–2 · scènes, huisstanden, groepen, timers, uitvoeringssporen; toestemmingen, kaders, pauze — scenes+, groepen, timers, runs; beleid, kaders, pauze — 2 · favorieten — voorkeuren — 1–3 · vervoer, ritten, zones, missies, vluchten — voertuigen, ritten, zones, missies, vluchten — 4 · automatiseringen, versies, hulpwaarden, goedkeuringen — automatiseringen+, versies, hulpwaarden, voorstellen+ — 5 · schermen, persoonlijke codes, plattegrondversies — schermen, codes, plan_versies — 6 · tarieven, contracten, plannen van de optimalisator — tarieven, contracten, plannen — 7 · mensen, uitnodigingen, instemmingen, meldregels — leden+, uitnodigingen, toestemmingen, meldregels — 8 · gastcodes, incidenten, camera's — codes, incidenten, camera_beleid — 9 · weekschema's — weekschemas — 10 · ontdekte apparaten, onderhoud — ontdekt, onderhoud — 11 · API-tokens — api_tokens — 12.

Elke migratie heeft een controle in `rechten.sql` en een test ‘twee keer achter elkaar’ onder `mijnruimte_app`. Vlaggen: `huis-levend`, `huis-simulator`, `huis-stroom`, `huis-motor`, `huis-mcp`. Server: `backend/huis/{register,inname,bus,stroom,beleid,gevolg,zoek,historie,motor,schermen,mcp}.ts`.

## 13. Schermschetsen

**Simulator, computer — `/instellingen/simulator`**
```
┌ Simulator [Tijd en scenario's][Wereld][Sporen] kolf ×60 · huistijd ma 14:30 · echt 09:12 ┐
│ [⏸][×1][×10][×60][×600] [Gelijkzetten met de klok]                                     │
├ SCENARIO'S ────────┬ STORINGEN ──────────────┬ HUIS ─────────────────────────┤
│ ● Werkdag  06:10   │ Vertraging   [0 s −/+]  │ Demowoning · Wilgenlaan 12    │
│ ○ Rook keuken   [▶]│ Geen antwoord      (○ ) │ Externe meldingen (○ ) i      │
│ ○ Internet weg  [▶]│ Adapterstatus[in orde▾] │ [Simulatie terugzetten]       │
└ STROOM  14:30:05 kolf keuken · beweging   14:30:07 ruit ‘Avond’ → 3 lampen ────┘
```
**Wereld — `/instellingen/simulator/wereld`**
```
[+ Virtueel apparaat] [Terug naar scenario]          handmatige waarden: 2
WEER   wind [4 m/s −/+]  bewolking [60 % ━○━]  prijs 15:00 [€ 0,24 −/+]
MENSEN Olena [thuis ▾]  Marko [school ▾]   AUTO [op de oprit ▾]
```
**Telefoon 320** (regel `hv-sim` van 28 px onder de glazen kop)
```
Systeem ‹                              ● ! 2 bel 2
kolf ×60 · ma 14:30 huistijd · hemel volgt huistijd
[Tijd en scenario's][Wereld][Sporen]   [⏸][×1][×10][×60][×600]
▸ Scenario's · 1 loopt   ▸ Storingen   ▸ Huis   ▸ Stroom
```
**Nieuw apparaat:** de banner «Знайдено 3 нові пристрої / 3 nieuwe apparaten gevonden [Toevoegen]»; het stappenplan `/instellingen/integraties?dialoog=nieuw`
```
①Bron ─ ②Koppeling ─ ③Wat is gevonden ─ ④Kamer en namen ─ ⑤Wat ermee doen?
② ring hv-aftel 24 s: Натисніть кнопку на мості / Druk op de knop van de bridge
③ Stopcontact — gewone acties · Klep: openen — kritiek ⬣
④ Kamer [Keuken ▾]  Naam [Чайник] / [Waterkoker]  Aliassen [+]
⑤ ☐ Uitzetten als niemand thuis is  ☐ Toevoegen aan ‘Nacht’   Toestemmingen uitvoerders: alle ‘Uit’
```

## 14. Toelichtingen, weigeringen, toestanden

- **Laatste stap van het stappenplan.** «Що станеться: пристрій з'явиться в кімнаті „Кухня“ і в зведенні енергії. Пов'язано з: дозволи всіх виконавців — „Вимкнено“, змінює їх лише власник. Як повернути: сторінка пристрою → „Вилучити“.» / «Wat er gebeurt: het apparaat verschijnt in ‘Keuken’ en in het energieoverzicht. Hangt samen met: de toestemmingen staan voor alle uitvoerders op ‘Uit’, alleen de eigenaar wijzigt ze. Terugdraaien: apparaatpagina → ‘Verwijderen’.»
- **‘i’ bij ‘Externe meldingen’.** «Що станеться: сповіщення симуляції підуть на телефон і в пошту з позначкою „Симуляція“. Пов'язано з: від ×10 вони знову мовчать. Як повернути: цей самий перемикач.» / «Wat er gebeurt: meldingen uit de simulatie gaan naar je telefoon en mail met het label ‘Simulatie’. Hangt samen met: vanaf ×10 zwijgen ze weer. Terugdraaien: dezelfde schakelaar.»
- **Weigering door een poort.** «Чому ні: „Відкрити ворота“ для автоматизацій вимкнено. Що перевірити: режим у „Дозволах і небезпечних діях“. Що можна натомість: відкрити самому або обрати інший режим (лише власник).» / «Waarom niet: ‘Poort openen’ staat uit voor automatiseringen. Wat te controleren: de stand onder ‘Toestemmingen en gevaarlijke acties’. Wat wel kan: zelf openen of een andere stand kiezen (alleen de eigenaar).»
- **Niet uitgevoerd binnen de tijd van de klasse.** «Чому ні: ворота не відповіли за 90 с. Що перевірити: живлення приводу й зв'язок моста. Що можна натомість: спробувати ще раз або відкрити вручну.» / «Waarom niet: de poort reageerde niet binnen 90 s. Wat te controleren: de voeding van de aandrijving en de verbinding met de bridge. Wat wel kan: opnieuw proberen of handmatig openen.»
- **‘Simulatie terugzetten’** is een gevaarlijke menselijke actie: `hv-gevaar` met rail en het gevolg ‘de demowoning keert terug naar 9 november, 14:30; het Logboek blijft bestaan’.

**Toestanden:** adapter «справний / in orde · послаблений / verzwakt · потрібен вхід / aanmelden nodig · ліміт / limiet · недоступний / niet bereikbaar»; simulatie «іде / loopt · пауза / pauze»; «ручне / handmatig»; voor andere rollen «лише перегляд / alleen bekijken»; lege toestanden: `hv-leeg`.

## 15. Schermen met adressen

Systeem `/instellingen`; Woning `/instellingen/woning`, `?dialoog=overnemen`; Toestemmingen `/instellingen/toestemmingen` en het register `/instellingen/risico` (weergave volgens de zones ‘Beveiliging’ en ‘Assistent en agenten’); Gegevens en opslag `/instellingen/opslag`; Geheimen `/instellingen/geheimen`; Diagnose `/instellingen/diagnose`; Tunnel `/instellingen/tunnel`; Integraties `/instellingen/integraties`, `?blad=adapter:<id>`, `?dialoog=nieuw`; Simulator `/instellingen/simulator`, `…/wereld` (`?dialoog=virtueel`), `…/sporen`, `?blad=scenario:<id>`; Schermen `/instellingen/schermen`, `?blad=scherm:<id>`, `?dialoog=koppelen`, `/paneel/<profiel>/<id>`; ‘Verbinding’ `?blad=verbinding`; pauze `?dialoog=stoppen`; uitvoeringsspoor `/automatiseringen/<id>/verloop/<run>`; geschiedenis `/activiteit/geschiedenis?entiteit=<id>`; eerste start `/overzicht?dialoog=start`. Zonder adres: `hv-gevaar`, ‘Geen verbinding’ per oorzaak, verouderde browser.

## 16. Fasen

| Nr. | Fase | Architectuur van de fase | Dagen |
|---|---|---|---|
| 0 | Maquette en specificatie | dit document, maquette | 8–10 |
| 1 | Schil en demowoning | register, contract, kern van de simulator, paspoort, stroom, hemel, eerste start, ‘Thuis’, ‘Kamers’, dagstrook, Logboek om te lezen | 18 |
| 2 | Bediening — alle klassen | bladen van alle klassen, toestanden van een opdracht, `huis-gevaar.ts`, `huis_beleid`, poorten, `gevolg`, kern van de motor, scènes, huisstanden, pauze, meldingencentrum, audit, ‘Wereld’, ‘Sporen’ | 20 |
| 3 | Opdracht en zoeken | `/api/huis/zoek`, `hv-opdracht` | 6 |
| 4 | Garage | tabellen voor vervoer en vluchten, beeld van de server voor de cockpit | 12 |
| 5 | Automatisering en AI-agenten | bewerker, versies, `hv-verzoek`, kolommen voor agenten, volledige set instrumenten | 18 |
| 6 | Schermen en panelen | `/paneel/*`, sessie ‘scherm’, persoonlijke codes, kiosk, lokale route, bewerker voor de indeling | 14 |
| 7 | Geschiedenis en energie | tabellen uit §7, grafieken, ‘Terugblik’, optimalisator | 16 |
| 8 | Mensen, rollen, privacy | uitnodigingen, rollen, instemmingen, meldregels | 14 |
| 9 | Beveiliging en camera's | alarminstallatie, gastcodes, camera's, echte `hv-nood`, alarmkanaal | 12 |
| 10 | Klimaat en media | themapagina's, weekschema's | 7 |
| 11 | Apparatuur, ontdekking, onderhoud | stappenplan voor een nieuw apparaat, vervanging | 8 |
| 12 | Echte bronnen | brug naar Home Assistant, ‘Instellingen overnemen’, eigen adapters | vanaf 12 |

Fasen 1–11 samen: ongeveer 145 dagen. **Gevolgen van de volgorde:** ritten en vluchten hebben vanaf fase 4 eigen tabellen, laadgrafieken worden tot fase 7 uit de kiem berekend; tot fase 8 handelen agenten en automatiseringen namens de eigenaar, daarna beperken rollen via RLS wat iemand ziet, zonder wijzigingen aan de motor; persoonlijke codes komen in fase 6, omdat een paneel zonder die codes geen kritieke actie uitvoert; het alarm op panelen is tot fase 9 een oefenalarm.

## 17. Tests en risico's

- **Moduletests** (rol `mijnruimte_app`): hash van het spoor; volledigheid ‘klasse → blad → regel in de matrix → instrument’; de motor op een handmatige klok; twee klokken; verbod op `echt` in de demowoning; audit zonder UPDATE en DELETE; een agent zonder route naar `huis_beleid`; standaard ‘Uit’.
- **Ketentests:** de profielen uit OT §7, tv met pijltjestoetsen, `theme-inkt`, beide thema's en beide talen; `hv-stand` schakelt alle drie de standen voor een kritieke actie; het contrast van de punten op de hemel; de dekking van de toelichtingen; fase 6 — een rookalarm bereikt het paneel zonder extern kanaal.
- **Risico's:** de tunnel verbreekt de stroom; zonder lokale route zijn panelen blind zonder internet; 5 min bevestiging opent alle kritieke acties van de sessie; de motor deelt het proces met de site; de ontvanger omzeilt RLS; misleiding via apparaatnamen.

## 18. Componenten

- **Uit OT:** `hv-sim`, `hv-versheid`, `hv-stempel`, `hv-tegel`, `hv-toost`, `hv-meldingen`, `hv-bericht`, `hv-maker`, `hv-gevolg`, `hv-opdracht`, `hv-gevaar`, `hv-rail`, `hv-stand`, `hv-risico`, `hv-aftel`, `hv-grafiek`, `hv-dagstrook`, `hv-tabel`, `hv-blok`, `hv-chip`, `hv-leeg`, `hv-skelet`, `hv-pincode`, `hv-nood`.
- **Nieuw in de zone** (voorstel voor OT §9): `hv-klok`, `hv-scenario`, `hv-simstoring`, `hv-wereld`, `hv-spoorrecorder`, `hv-nieuw-banner`, `hv-koppelwizard`, `hv-vervang`, `hv-systeemkaart`, `hv-opslagtabel`, `hv-stroomlog`, `hv-gezondheid`, `hv-lijst-virtueel`, `hv-verloop`, `hv-geen-verbinding`, `hv-verbindingsketen` (gedeeld met de schil).

## 19. Gedekt en uitgesteld

**Gedekt in fase 0:** specificatie §1–18; in de maquette: Simulator, ‘Wereld’, de kaart van Systeem en het blad van elke klasse.

**Per fase** (catalogus): hfst. 19 — contract en wachtrij 1–2, toestand van adapters 2, ontdekking en stappenplan 11, lokale toegang 6, protocollen, OAuth, webhooks, API-tokens 12; hfst. 26 — systeemtoestand, tunnel, diagnose 1–2; hfst. 27 — verplicht 1–2, centrum voor achtergrondtaken 12; hfst. 31 — skeletten 1, virtualisatie van het Logboek 2 en van lijsten 11, budgetten voor grafieken 7, panelen die dag en nacht aanstaan 6.

**Uitgesteld** (geen enkel punt is een bedieningsinstrument): prullenbak, massaal hernoemen, compatibiliteitscatalogus — 12; virtuele apparaten in een echt huis; een externe bewaker buiten het huis.

## 20. Besluiten voor de eigenaar

1. Een eenmalige bevestiging van de aanmelding, gekoppeld aan een actie of aan een wijziging van een toestemming, in plaats van 5 min per sessie.
2. Wijzigingen in gedeelde code van het platform: de verwerker van de stroom in `server/start.ts`, de sessie ‘scherm’, de brugdienst op de VM (fase 12).
3. Een lokale route zonder tunnel voor panelen.
4. Welke bewoners routes en locatie zien; de termijnen uit §7.
5. Camera, microfoon en locatie in de browser (`Permissions-Policy`).
6. Een reservekanaal voor echte alarmen: telefoonoproep, sms of mail.
7. De weg van rechtstreeks videobeeld en de opname van camera's.
8. Een eigen lettertypebestand Inter voor visuele tests.
