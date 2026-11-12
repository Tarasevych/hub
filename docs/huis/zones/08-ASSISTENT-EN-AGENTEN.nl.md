> 🌐 **Taal:** [Українська](08-ПОМІЧНИК-І-АГЕНТИ.uk.md) · **Nederlands** | [Hoofddocument](../ONTWERP-HUIS-20261110.nl.md)

# Zone 8. AI-assistent, agenten, rollen / Помічник і агенти

Taak HUIS-001 · fase 0 · 10.11.2026 · status: ter goedkeuring bij de eigenaar

Bronnen: plan HUIS-001 (§1, §3, §3.8, §4) en de [ontwerptaal ‘Живий дім / Levend huis’](../ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ-20261110.uk.md) (hierna: OT). Namen van tokens, componenten, toestanden en profielen komen uit OT; de grammatica van adressen komt uit de zone [‘Schil’](01-SCHIL.nl.md); de nieuwe componenten staan in §16.

## 0. Wat er is veranderd

- **‘Levend huis’.** De zone staat op de stille hemel van de rubriek «Автоматика / Automatisering»: op de hemel staan alleen de zin en de bloktitels in `--text`; gesprek, wachtrij, tabellen en kaarten staan op papier `--panel`; glas `--hv-glas` is er voor de kop, de navigatie, de omhulling van bladen en «Команда / Opdracht». Het verbod op glas, hemel en kleurverlopen is opgeheven.
- **Toestemmingen** (plan §3.8). Elke actie heeft een `hv-stand` «Вимкнено / Uit · Питати / Vragen · Завжди / Altijd», afzonderlijk voor elke uitvoerder, ook voor elke agent en voor de ingebouwde ‘Huisassistent’; standaard ‘Uit’; de eigenaar kan elke stand kiezen. Geschrapt zijn: plafonds, ‘hoogstens Vragen’, grijze segmenten, de verboden Ж1–Ж6, de uren 07:00–23:00 en 60 acties per dag als standaard, de termijn ‘tot 30 dagen’, verplicht ‘Vragen’ na vreemde tekst, ‘alleen lezen tijdens een alarm’ en het eigenmachtig pauzeren door een agent. Dit zijn nu **optionele kaders** die de eigenaar zelf inschakelt.
- **Gebleven:** het ritueel van de mens (de houdrail, de persoonlijke code op het paneel, de bevestiging van de aanmelding), het verplichte Logboek en geen enkel hulpmiddel om toestemmingen te wijzigen.
- **Afgestemd op OT:** het niveauteken `hv-risico` (gevoelig — `Eye`); «змішано / gemengd»; `hv-verzoek` — «Схвалити раз / Eén keer goedkeuren» zonder opgelegde termijn; `hv-voorstel` — «було → стане / was → wordt»; de soorten meldingen `huis.agent` en `huis.toegang`; `hv-gevaar` opent niet via een adres; de parameter `tab` is gereserveerd — de tabbladen van een agent lopen via `deel`.
- **Fasen** volgen de schaal 0–12 (§17). **Volledigheid:** de volledige set hulpmiddelen voor agenten voor alle klassen van apparaten (§7).

## 1. Opzet en grenzen

De zone beantwoordt: wat doet AI in huis, wie heeft dat toegestaan en hoe zet je het stop.

- **Помічник дому / Huisassistent** — een ingebouwde agent met dezelfde kolom toestemmingen als de externe agenten, zonder verborgen rechten.
- **Externe agenten** worden gekoppeld via de groep `huis` van de koppeling (MCP). De platformpagina `mcp.tarasevych.com/agenten` schakelt alleen de groep zelf in; de standen van de acties staan in de matrix van het huis en worden daar alleen-lezen getoond, met een link.
- **Het gesprek omzeilt het ritueel niet.** Een actie die een mens met een knop in de kaart van de assistent heeft bevestigd, is een actie van de mens, met het ritueel van het niveau van die actie en de auteur `User`. De toestemming van de Assistent geldt alleen voor wat hij zelf doet.
- **Grenzen.** De matrix `/instellingen/toestemmingen` en het register `/instellingen/risico` zijn gedeelde pagina's van Systeem; de zone levert er de kolommen van de agenten voor. De regeleditor hoort bij ‘Automatisering’; sleutels en sessies bij `id.tarasevych.com`.
- **De bevestiging van de aanmelding** geldt nu 5 min per sessie (`STAP_OP_MS`). Zolang er geen eenmalige bevestiging is (plan §7), zeggen de dialoogvensters: «Підтвердження діє 5 хв для цього сеансу / Bevestiging geldt 5 min voor deze sessie».

## 2. Uiterlijk

- **Held** ≤ ¼ van het scherm op de telefoon; hij krimpt tot een regel van de kop. De zin bevat alleen het waargenomene: «Claude чекає на ваше рішення; Помічник виконав 6 дій / Claude wacht op je besluit; de Assistent voerde 6 acties uit». Daaronder staan papieren chips van 28 px: «2 запити / 2 verzoeken», «! 1».
- **Auteur** — `hv-maker` «ШІ-агент / AI-agent» (een vierkant met een afgesneden hoek, 12 px) met de naam. Een merklogo uit `src/merk/` staat alleen in de `hv-agentkaart` van een werkelijk gekoppelde agent; in de simulatie staan alleen het teken en de naam. Het tabblad ‘Wat de agent ziet’ heeft geen oogpictogram: `Eye` betekent alleen het gevoelige niveau.
- **‘!’** — een knop van 24 px naast de `hv-stand` van een gevaarlijke en een kritieke actie; bij ‘Altijd’ een blijvende gevulde markering `--hv-risico-merk` (op de plaats van de knop, in de linkerbovenhoek van de tegel en in de kop als ‘! N’ met een overgang naar `/instellingen/risico`), die niet weg te klikken is.
- **Een tegel onder beheer van een agent** toont het auteursteken gedurende 10 min na een wijziging en de toestanden «очікує / wacht» en «виконується / bezig». Het teken met ritueel op een tegel geldt voor de mens; een agent met ‘Altijd’ handelt zonder houdrail.
- **Accent** — slechts één hoofdknop (‘Eén keer goedkeuren’ in een verzoek).

## 3. Schermen met adressen

De zone registreert de soorten bladen `agent`, `verzoek`, `waarom`, `assistent`, `verzending`, `niet-ik`, de tabbladen `deel` van een agent `gereedschap`, `kaders`, `acties`, `zicht` en de dialoogvensters `agent-toevoegen`, `stoppen`, `overnemen`, `uitnodigen`.

| Scherm | Adres |
|---|---|
| Помічник / Assistent: gesprek, overzicht, ‘Wacht op jou’, ‘Suggesties’, ‘Ongewoon’ | `/assistent`; vanuit Opdracht — `?blad=assistent` |
| Instellingen: «Модель і бюджет / Model en budget · Правила дому / Huisregels · Що знає помічник / Wat de assistent weet · Не зрозумів / Niet begrepen · Голос / Spraak» | `/assistent/instellingen` |
| Агенти й погодження / Agenten en goedkeuringen | `/assistent/agenten` |
| Pagina van een agent: Інструменти / Gereedschap · Рамки / Kaders · Дії / Acties · Що бачить агент / Wat de agent ziet | `/assistent/agenten/<agent>?deel=…`; als blad — `?blad=agent:<id>&deel=…` |
| Verzoek; «Чому це сталося / Waarom gebeurde dit»; «Що буде надіслано / Wat wordt verzonden» | `?blad=verzoek:<id>`, `waarom:<gebeurtenis>`, `verzending` |
| Stappenplannen: «Додати агента / Agent toevoegen», «Перенести з симуляції / Overnemen uit simulatie»; ‘Zelfstandige acties stoppen’ | `?dialoog=agent-toevoegen`, `overnemen`, `stoppen` |
| Люди й доступ / Mensen en toegang; uitnodiging | `/instellingen/mensen`, `/<persoon>`, `?dialoog=uitnodigen` |
| Приватність / Privacy | `/instellingen/privacy` |
| Kolom van een agent in de matrix | `/instellingen/toestemmingen?filter=agent:<id>` |
| Logboek van de agenten; audit | `/activiteit?filter=agenten`; `/activiteit/geschiedenis?filter=audit` |
| «Це не я / Dat was ik niet» | `?blad=niet-ik:<melding>` |

Een adres of een melding opent alleen een weergave: het goedkeuren van een kritiek verzoek vraagt ter plekke de houdrail en de bevestiging van de aanmelding.

## 4. Assistent `/assistent`

```
┌ Assistent   ● gereed     ◩ 2 ┐   telefoon 390
│ [Wacht 2][Overzicht][Meer]   │
│ Jij: licht beneden uit       │
│ ◩ Ik begreep dit als: begane │
│   grond, licht  [Corrigeren] │
│ ┌ Voorstel · 5 lampen ─────┐ │
│ │ Staande lamp   aan → uit │ │
│ │ Garage   niet bereikbaar │ │
│ │ [Uitvoeren] [Wijzigen]   │ │
│ │ [Afwijzen]               │ │
│ └ bronnen: toestand · 2 s ─┘ │
│ [kamer: Woonkamer ✕][Vraag…] │
└──────────────────────────────┘
```

Computer (`bureau`): links het gesprek `hv-gesprek` met bovenaan het dagoverzicht, rechts de papieren blokken «Чекає на вас / Wacht op jou», «Пропозиції / Suggesties» en «Незвичне / Ongewoon».

- **Opdracht → actie.** De kaart `hv-voorstel` tekent de server uit een proefuitvoering — dezelfde als in `hv-opdracht` en `/api/huis/gevolg`. Daarna hangt het af van de stand van de Assistent voor deze actie: ‘Altijd’ — hij voert zelf uit, met auteursteken en `hv-toost` met «Повернути / Ongedaan maken» gedurende 10 s; ‘Vragen’ of ‘Uit’ — de knop «Виконати / Uitvoeren» voor de mens, met het ritueel van het niveau van de actie (gevaarlijk en kritiek — `hv-gevaar`). Bij ‘Uit’ staat onder de kaart: «Помічник цього сам не робить; ви можете виконати / De Assistent doet dit niet zelf; jij kunt het uitvoeren».
- **Beschrijving → automatisering.** Een concept in de editor van ‘Automatisering’ met een samenvatting in eigen woorden en de schatting «спрацювало б 14 разів за 30 днів / zou 14 keer zijn afgegaan in 30 dagen»; de regel begint als «Чернетка / Concept», en inschakelen is een aparte actie met een eigen `hv-stand`.
- **Vragen aan het huis** — beantwoord met tekst, live tegels of `hv-grafiek` met bronchips `hv-bron`; zonder bron geen getal.
- **‘Waarom gebeurde dit’** — `hv-waarom` «Що запустило / Aanleiding → Умова / Voorwaarde → Дія / Actie» uit het Logboek, zonder model; bereikbaar vanuit het gesprek, het blad van een apparaat en het Logboek.
- **Verduidelijking** — `hv-chip--keuze`; **context** — `hv-chip--context`; **gemengde taal en Latijns schrift** — «Я зрозумів це як… / Ik begreep dit als…» met «Виправити / Corrigeren».
- **Підсумок дня / Dagoverzicht** om 07:30 en 21:30 — volgens een sjabloon, zonder AI. **Suggesties** — met bewijs en «Створити / Maken · Не зараз / Niet nu · Ніколи / Nooit». **Ongewoon** — een grafiek en «Це нормально / Dit is normaal».
- **Spraak** — het stempel «пізніше / later» tot het besluit over de microfoon (plan §7). Spraak is een actie van de mens: gevaarlijk en kritiek opent `hv-gevaar` op het scherm, want een houdrail kun je niet met je stem vasthouden.
- **Toestanden:** «готовий / gereed · думає / denkt na · чекає вашого рішення / wacht op je besluit · бюджет вичерпано / budget op · недоступний / niet bereikbaar · лише перегляд / alleen bekijken». Een onbereikbare Assistent blokkeert niets: Opdracht, scènes en ‘Waarom gebeurde dit’ werken zonder hem.

## 5. Agenten en goedkeuringen `/assistent/agenten`

```
 hemel·Automatisering›Agenten  [Zelfstandige acties stoppen] [+ Agent toevoegen]
┌ Agenten ────────┐ ┌ ◩ Claude · actief · 14 acties vandaag          [Pauzeren] ┐
│ ◩ Huisassistent │ │ Gereedschap · [Kaders] · Acties · Wat de agent ziet       │
│ ◩ Claude     !  │ │ Kaders: zonder kaders                  [Kaders wijzigen]  │
│ ◩ Gemini        │ │ ▾ Licht en stopcontacten · 31 acties · Altijd: 0          │
│   gepauzeerd    │ │   Voor de hele groep             gemengd                  │
├ Nu bezig ───────┤ │   Licht aanzetten             [Uit][✓Vragen][Altijd]    i │
│ Claude: laden   │ │ ▾ Sloten en alarm · 8 acties · Altijd: 1                  │
│ bezig      Stop │ │   Deur ontgrendelen  ⬣! krit. [Uit][Vragen][✓Altijd]      │
└─────────────────┘ │   Alarm uitzetten   [!] krit. [✓Uit][Vragen][Altijd]      │
                    └───────────────────────────────────────────────────────────┘
```

Telefoon: wachtrij → kaarten `hv-agentkaart` → pagina van de agent; in ‘Kaders’ staan de naam van de actie, `hv-risico` en ‘!’ op de eerste regel en `hv-stand` over de volle breedte op de tweede.

- **`hv-agentkaart`:** teken, naam, toestand, actieteller, ‘!’ bij ‘Altijd’ voor een gevaarlijke of kritieke actie, «Призупинити / Pauzeren» ↔ «Відновити / Hervatten». Een bedieningselement om toestemmingen te wijzigen heeft de kaart niet.
- **Gereedschap** (`hv-gereedschaplijst`) — de groepen van §7 met beschrijving, niveaus en de geldende stand in woorden. Een grijze regel ‘niet beschikbaar’ bestaat niet.
- **Kaders** — zoals OT §10 voorschrijft, wijzigt de eigenaar hier de toestemmingen: de `hv-stand` van elke actie, het groepsbedieningselement «Для всієї групи / Voor de hele groep», de teller «Завжди: N / Altijd: N», en daarboven de kaders (§6). Andere rollen zien de stand als tekst en «Змінює лише власник / Alleen de eigenaar kan dit wijzigen».
- **Acties** — `hv-bericht`: wat · woorden van de agent · «було → стало / was → werd» · «дозволено через / toegestaan via» · resultaat · model; «Повернути все / Alles ongedaan maken» voor een uitvoering die terug te draaien is.
- **«Зараз працює / Nu bezig»** — `hv-agentstappen`: de stappen van een uitvoering met de toestanden van de opdracht en «Стоп / Stop» (stopt de uitvoering en verandert geen standen).
- **Stappenplan ‘Agent toevoegen’** (`hv-gids`, alleen voor de eigenaar): wie → beginset → kaders → verbinding (adres, toestemming via OAuth) → proefaanroep in de simulatie → samenvatting. De sets zijn alleen een startkeuze van de eigenaar: «Усе вимкнено / Alles uit» (standaard) · «Лише читання / Alleen lezen» · «Помічник / Assistent» (lezen — ‘Altijd’, gewone en gevoelige bediening — ‘Vragen’, de rest — ‘Uit’, met het kader ‘Na vreemde tekst vragen’). Elk ‘Altijd’ voor een gevaarlijke of kritieke actie in de samenvatting vraagt één bevestiging van de aanmelding, met een lijst van de acties.

## 6. Toestemmingen van agenten

- **Een toestemming hoort bij een actie** (‘mogelijkheid × richting × apparaat of klasse’), niet bij een hulpmiddel: één aanroep met meerdere acties gaat voor elke actie afzonderlijk door de poorten.
- **‘Uit’** — de actie wordt niet aan de agent aangeboden; een aanroep geeft «не виконано / niet uitgevoerd» met de naam van de poort. **‘Vragen’** — een verzoek `hv-verzoek` (§8). **‘Altijd’** — de actie wordt uitgevoerd binnen de kaders van de eigenaar, met auteursteken, `hv-toost` en een vermelding in het Logboek.
- **Poorten op de server** (schil §7): bron («лише читання / alleen-lezen») → de rol van de mens namens wie de agent handelt (de eigenaar die hem heeft toegevoegd) → pauze → stand → kaders. Het risiconiveau houdt de agent niet tegen — het bepaalt alleen het ritueel voor de mens.
- **Alleen de eigenaar wijzigt**, op een persoonlijk apparaat en met de bevestiging van de aanmelding van het platform voor ‘Altijd’ bij gevaarlijke en kritieke acties; op `/paneel/*` en `tv` staat de stand als tekst. Een agent kan rechten niet uitbreiden en niet inperken — niet de eigen en niet die van anderen.
- **Kaders zijn optioneel, standaard «без рамок / zonder kaders»:** termijn, kamers, uren, actiebudget, en verder «Після чужого тексту — питати / Na vreemde tekst vragen», «Під час тривоги — лише читання / Tijdens alarm alleen lezen» en «Хто отримує запити / Wie krijgt verzoeken» (standaard alle eigenaren). Is de termijn verstreken, dan gaat de stand terug naar ‘Uit’ met de chip «строк минув / termijn verlopen».
- **Het Logboek is verplicht:** elke wijziging van een toestemming en elke actie op grond daarvan levert een `hv-bericht` en een vermelding in `hv-meldingen` op; de audit kent alleen toevoegen; niemand kan dit uitzetten.

## 7. Volledige set hulpmiddelen

De groep `huis` van de koppeling (fase 5); elke actie staat onder een eigen `hv-stand`, standaard ‘Uit’. De niveaus zijn voorbeelden uit de matrix `shared/huis-gevaar.ts` (fase 2).

**De tabel is het enige register van de namen van hulpmiddelen**; de groepen zijn dezelfde als in `hv-gereedschaplijst`. De maquette toont alle namen, behalve die met de aanduiding ‘buiten de maquette’: die komen in hun eigen fase (§17). De zones [‘Garage’](06-GARAGE.nl.md) §10 en [‘Automatisering’](07-AUTOMATISERING.nl.md) §10 voegen de hulpmiddelen van hun eigen onderdeel toe; voor een actie die in deze tabel staat, geldt de naam uit deze tabel. In de koppeling krijgt de naam het achtervoegsel van de agent en het adres: `bedienen_licht_claude_huis_tarasevych_com_gebruiker`.

| Groep | Hulpmiddelen | Niveaus van acties |
|---|---|---|
| Читання / Lezen | `tonen_huis_overzicht`, `lezen_apparaat`, `zoeken_apparaten`, `lezen_geschiedenis`, `uitleggen_waarom`, `lezen_logboek`, `lezen_energie`, `lezen_weer`, `tonen_aanwezigheid`, `tonen_wie_thuis`; buiten de maquette: `tonen_gevolg` (proefuitvoering), `tonen_locatie_personen` | gewoon — gevoelig (aanwezigheid en locatie van personen) |
| Світло / Licht | `bedienen_licht`, `schakelen_kamerlicht`, `uitzetten_alle_lampen`, `starten_stroboscoop` | gewoon — gevoelig |
| Клімат і штори / Klimaat en zonwering | `instellen_kamerdoel`, `bedienen_klimaat`, `uitzetten_ventilatie`, `instellen_warmtepomp`, `uitzetten_warmtepomp`, `bedienen_boiler`, `bedienen_zonwering` | gewoon — gevaarlijk |
| Медіа / Media | `bedienen_media`, `omroepen_bericht`, `zetten_volume_boven_plafond` | gewoon — gevoelig |
| Техніка й роботи / Apparatuur en robots | `schakelen_stekker`, `starten_programma`, `bedienen_apparatuur`, `aanzetten_oven`, `zetten_koffie`, `uitzetten_computer`, `uitzetten_voeding`, `herstarten_router`, `uitzetten_alles`, `bedienen_robot`, `starten_maaier`, `starten_beregening`; buiten de maquette: `bedienen_groep`, `instellen_timer`, `instellen_voorkeuze`; robots verder — de zone ‘Garage’ §10 | gewoon — gevaarlijk |
| Сцени й режими / Scènes en standen | `tonen_scenes`, `starten_scene`, `wijzigen_huisstand`, `maken_scene_concept`; verder — de zone ‘Automatisering’ §10 | gewoon — gevoelig |
| Автоматизації / Automatiseringen | `tonen_automatiseringen`, `maken_regel_concept`, `proefdraaien_regel`, `aanzetten_regel`, `uitzetten_regel`; verder — de zone ‘Automatisering’ §10 | gewoon — gevaarlijk |
| Енергія / Energie | `lezen_tarief`, `starten_laden`, `instellen_laadstand`, `instellen_laaddoel`, `instellen_batterij`, `begrenzen_teruglevering`; buiten de maquette: `voorstellen_dagplan` | gewoon — gevaarlijk |
| Безпека й замки / Beveiliging en sloten | `vergrendelen_deur`, `ontgrendelen_deur`, `inschakelen_alarm`, `uitschakelen_alarm`, `openen_ingang`, `sluiten_ingang`, `lezen_melders`, `testen_melder`, `maken_gastcode`, `dempen_melder`; buiten de maquette: `overbruggen_zone`, `bedienen_klep`, `testen_sirene`, `uitschakelen_sensor`, `beantwoorden_oproep` | gewoon — kritiek |
| Камери / Camera's | `lezen_camera_gebeurtenissen`, `maken_camerabeeld`, `starten_opname`, `bekijken_live`; buiten de maquette: `instellen_maskers` | gevoelig — kritiek (live meekijken) |
| Транспорт / Voertuigen | `lezen_voertuigen`, `tonen_locatie_voertuig`, `instellen_klimaat_auto`, `vergrendelen_voertuig`, `ontgrendelen_voertuig`, `starten_voertuig`; verder — de zone ‘Garage’ §10 | gewoon — kritiek |
| Безпілотники / Drones | `lezen_drones`, `lezen_vluchtlog`, `voorstellen_missie`, `opstijgen_drone`, `zweven_drone`, `terugkeren_drone`, `landen_drone`; verder — de zone ‘Garage’ §10 | gewoon — kritiek |
| Симулятор / Simulator | `lezen_simulator`, `instellen_snelheid`, `starten_scenario`, `starten_noodscenario`; buiten de maquette: `instellen_wereld` | gewoon — gevaarlijk (noodscenario) |
| Техніка й обслуговування / Techniek en onderhoud (buiten de maquette) | `tonen_ontdekt`, `toevoegen_apparaat`, `instellen_onderhoud`, `bijwerken_firmware` | gewoon — gevaarlijk |

Er zijn geen hulpmiddelen voor toestemmingen, kaders, rollen, uitnodigingen, geheimen, verbindingen van agenten en audit: dat is beheer van rechten, niet van het huis.

## 8. Wachtrij «Чекає на вас / Wacht op jou»

`hv-verzoek` met als inhoud `hv-voorstel`: «Хто / Wie · Що / Wat · Чому / Waarom · Чекає до / Wacht tot»; het niveauteken, de samenstelling ‘was → wordt’ (meerdere stappen — één kaart en één transactie), «Слова агента / Woorden van de agent» met `hv-chip--wantrouw` als er vreemde tekst in staat. ‘Wacht tot’ wordt bepaald door het verzoek zelf (bijvoorbeeld het begin van het goedkope venster) of door een kader van de eigenaar; het systeem legt geen termijn op.

```
┌ Wacht op jou · 1 ────────────┐   telefoon, blad ?blad=verzoek:<id>
│ ◩ Claude · 3 min geleden     │
│ Auto laden om 02:00          │
│ gevoelig · Wacht tot 01:55   │
│ was → wordt                  │
│  Laden    pauze → 02:00–05:10│
│  Doel     64 % → 80 %        │
│ Waarom: om 02:00 € 0,08/kWh  │
│ Woorden van de agent · geen  │
│ vreemde tekst                │
│ [Afwijzen]                   │
│        [Eén keer goedkeuren] │
└──────────────────────────────┘
```

- **Antwoorden:** «Схвалити раз / Eén keer goedkeuren» en «Відхилити / Afwijzen». Goedkeuren is een actie van de mens, met de rechten van diens rol en het ritueel van het niveau: gewoon — direct; gevoelig — met ‘Ongedaan maken’ gedurende 10 s; gevaarlijk — de houdrail; kritiek — de houdrail en de bevestiging van de aanmelding; op het paneel — de persoonlijke code. Een kind en een gast keuren niet goed.
- **Wie ontvangt:** de mensen uit het kader ‘Wie krijgt verzoeken’. In een melding op het apparaat kun je gewone en gevoelige verzoeken direct goedkeuren, gevaarlijke en kritieke alleen «Відкрити / Openen». Een antwoord van een mens in het gesprek met de agent is geen goedkeuring: goedgekeurd wordt alleen in de hub.
- **Na 10 gelijke goedkeuringen** ziet de eigenaar de regel «Ви схвалили це 10 разів / Je hebt dit 10 keer goedgekeurd» met een link naar de `hv-stand` van deze actie — zonder aanwijzing welke stand hij moet kiezen.
- **Toestanden:** «чекає / wacht · схвалено / goedgekeurd · відхилено / afgewezen · минув / verlopen · виконано / uitgevoerd · не виконано / niet uitgevoerd».

## 9. Pauze, Logboek, meldingen

- **«Зупинити самостійні дії / Zelfstandige acties stoppen»** (`?dialoog=stoppen`, noodlaag, Systeem) — vinkjes ‘automatiseringen · optimalisator · agenten’. Verandert geen standen; stoppen kan de eigenaar of een bewoner, op `hv-nood` iedereen; hervatten alleen de eigenaar. Een agent pauzeert en hervat zichzelf niet. Een ongewone frequentie van acties van een agent levert een melding op met de knop ‘Pauzeren’, geen eigenmachtige pauze.
- **`huis.agent`** — elke actie van een agent en elk verzoek. **`huis.toegang`** («Доступ до дому / Toegang tot het huis», belang ‘belangrijk’, niet te dempen, voor alle eigenaren): een agent gekoppeld of kaders gewijzigd; een actie op ‘Altijd’ gezet; een nieuwe persoon, een gewijzigde rol, een gastcode; een overname uit de simulatie; zelfstandige acties hervat. Elke kaart heeft «Це не я / Dat was ik niet»: zelfstandige acties stoppen, de agent ontkoppelen, een uitnodiging of code intrekken, overal afmelden (`id.tarasevych.com`).

## 10. Vreemde tekst en gegevens naar buiten

- **Vreemde tekst** is alles wat niet is geschreven door een mens met een rol in het huis: titels van nummers, namen van apparaten in het netwerk, cameragebeurtenissen, de agenda, namen van missies, woorden van een andere agent. Zulke tekst kan verborgen instructies bevatten en zit daarom standaard niet in de momentopname voor de agent.
- **‘Wat de agent ziet’** (`hv-gezien`): de momentopname, geheimen als ‘••••’, «Вилучено: 14 назв треків… / Weggelaten: 14 tracktitels…» met de schakelaar «Додавати / Meesturen» per soort (standaard uit, met ‘!’).
- **Model in de cloud:** vóór de eerste verzending en bij elke nieuwe soort gegevens verschijnt het blad ‘Wat wordt verzonden’. Exacte aanwezigheid, locatie en camerabeelden zijn aparte soorten, elk met een eigen schakelaar van de eigenaar.

## 11. Mensen, rollen, privacy

| Gebied | Власник / Eigenaar | Мешканець / Bewoner | Дитина / Kind | Гість / Gast |
|---|---|---|---|---|
| Licht, klimaat, media, scènes | alles | alles | eigen kamers, toegestane scènes | gekozen kamers en scènes |
| Energie, garage, camera's | alles | ziet en bedient | ziet energie | — |
| Sloten, alarm | ritueel van het niveau | ritueel van het niveau | — | deuren volgens schema |
| Toestemmingen `hv-stand`, agenten | wijzigt | ziet als tekst | — | — |
| Verzoeken van agenten | keurt goed | keurt goed als hij is opgenomen in ‘Wie krijgt verzoeken’ | — | — |

- **Uitnodiging** (`?dialoog=uitnodigen`): wie → rol → kamers → termijn en «Що побачить Марта / Wat Marta ziet». De pagina van een persoon: rol, kamers, termijn `hv-aftel`, instemmingen, een link naar de sessies in `id.tarasevych.com`. De laatste eigenaar kan niet worden verwijderd. `installateur` en `ondersteuning` zijn technische rollen zonder goedkeuringen en zonder toestemmingen.
- **Privacy:** «Мої дані / Mijn gegevens» (instemmingen, «Експортувати / Exporteren», «Видалити / Verwijderen», «Хто дивився мої дані / Wie keek naar mijn gegevens»), «Куди йдуть дані / Waar gegevens heen gaan» (`hv-grafiek--stroom` zonder beweging), «Приватна кімната / Privékamer» — die zien andere rollen en agenten niet.

## 12. Simulatie en echte woning

Toestemmingen, kaders en ingeschakelde automatiseringen horen bij een woning. De echte woning begint overal met ‘Uit’; overnemen gaat via het stappenplan `?dialoog=overnemen`: alle punten staan uitgevinkt, de eigenaar vinkt de gewenste aan, en alle ‘Altijd’ voor gevaarlijke en kritieke acties vragen samen één bevestiging van de aanmelding, met een lijst. Persoonlijke codes en codes van panelen worden niet overgenomen: dat zijn geheimen van mensen. Scenario's van de simulator: «Агент просить схвалення / Agent vraagt goedkeuring», «Вказівки в назві треку / Instructies in een tracktitel», «Агент вичерпав бюджет / Agent heeft budget op».

## 13. Schermprofielen

`wand` — de wachtrij en ‘Eén keer goedkeuren’ met de persoonlijke code; `tv` — de wachtrij om te bekijken, bij kritiek «Підтвердьте на телефоні / Bevestig op je telefoon»; `horloge` — de wijzerplaat `verzoek` met ‘Afwijzen’ en «Відкрити на телефоні / Openen op je telefoon»; `strook` — ‘N verzoeken van agenten’ in de uitzonderingszone; `inkt` — het dagoverzicht. Toestemmingen worden alleen op persoonlijke apparaten van de eigenaar gewijzigd.

## 14. Toelichtingen

Berekende teksten komen uit `/api/huis/gevolg`, sjablonen uit `tekst.ts`.

- **`hv-stand` voor licht, ‘Altijd’.** «Що станеться: Claude вмикатиме й вимикатиме світло без запиту. Пов'язано з: кожна дія має запис у Журналі з „Повернути“. Як повернути: „Питати“ — діє одразу.» / «Wat er gebeurt: Claude zet het licht aan en uit zonder te vragen. Hangt samen met: elke actie staat in het logboek met ‘Ongedaan maken’. Terugdraaien: ‘Vragen’ — werkt direct.»
- **‘!’ — deur ontgrendelen, ‘Altijd’.** «Що може статися: двері відімкнуться, коли нікого немає вдома. Пов'язано з: агент читає чужий текст, що може містити сховані вказівки. Як повернути: „Замкнути“. Хто зможе це запускати: Claude сам, без вашого схвалення. Як вимкнути: „Вимкнено“ тут або „Зупинити самостійні дії“.» / «Wat er kan gebeuren: de deur gaat van het slot terwijl niemand thuis is. Hangt samen met: de agent leest vreemde tekst die verborgen instructies kan bevatten. Terugdraaien: ‘Vergrendelen’. Wie dit kan starten: Claude zelf, zonder je goedkeuring. Uitzetten: ‘Uit’ hier of ‘Zelfstandige acties stoppen’.»
- **Weigering aan een agent bij ‘Uit’** (vermelding in ‘Acties’). «Чому ні: дозвіл „Вимкнути все в домі“ для Claude — „Вимкнено“. Що перевірити: рамки й режим у вкладці „Рамки“. Що можна натомість: виконати власноруч через Команду.» / «Waarom niet: de toestemming ‘Alles in huis uit’ staat voor Claude op ‘Uit’. Wat te controleren: kaders en stand op het tabblad ‘Kaders’. Wat wel kan: zelf uitvoeren via Opdracht.»
- **Verlopen verzoek.** «Що станеться: дію не виконано, запис лишається в Журналі. Пов'язано з: дешеве вікно почалося о 02:00. Як повернути: попросіть агента подати запит знову.» / «Wat er gebeurt: de actie is niet uitgevoerd, de vermelding blijft in het logboek. Hangt samen met: het goedkope venster begon om 02:00. Terugdraaien: vraag de agent het verzoek opnieuw in te dienen.»

## 15. Toestanden

De twaalf gedeelde toestanden (OT §9), de toestanden van `hv-stand` (tien), van `hv-verzoek` en van `hv-agentkaart` («працює / actief · призупинено / gepauzeerd»). **Aan OT toe te voegen:** agent — «не під'єднано / niet gekoppeld · виконується / bezig»; `hv-voorstel` — «виконується / bezig · виконано / uitgevoerd · не виконано / niet uitgevoerd · повернуто / ongedaan gemaakt»; assistent — de zes toestanden uit §4.

## 16. Componenten

**Uit OT:** `hv-voorstel`, `hv-verzoek`, `hv-agentkaart`, `hv-waarom`, `hv-maker`, `hv-risico`, `hv-stand`, `hv-gevaar`, `hv-rail`, `hv-gevolg`, `hv-pincode`, `hv-aftel`, `hv-toost`, `hv-bericht`, `hv-meldingen`, `hv-nood`, `hv-tabel`, `hv-leeg` («Запитів немає / Geen verzoeken», «Агентів ще не додано / Nog geen agenten»). **Nieuw:** `hv-gesprek` (gesprek, als blad en als pagina), `hv-bron` (bronchip), `hv-agentstappen`, `hv-gereedschaplijst`, `hv-gezien`, `hv-rolmatrix`, `hv-gids` (stappenplan met samenvatting), `hv-niet-ik`; de chipvarianten `--keuze`, `--context`, `--wantrouw`.

## 17. Gedekt en uitgesteld

| Fase | Wat uit deze zone |
|---|---|
| 0 | specificatie en schets: assistent, agentpagina met de volledige lijst, wachtrij, `hv-stand` van elke actie |
| 1 | ‘Huisassistent’ in het demohuis, auteursteken in het Logboek |
| 2 | kolommen van agenten in de matrix, poorten, `huis.agent`, `huis.toegang`, audit |
| 3 | gesprek vanuit Opdracht, ‘Ik begreep dit als…’, kaart uit de proefuitvoering |
| 4 | regels van Garage in de lijst met hulpmiddelen en in de matrix |
| 5 | `/assistent`, `/assistent/agenten`, wachtrij, stappenplan, pauze, ‘Waarom gebeurde dit’, suggesties, beschrijving → automatisering, volledige set hulpmiddelen |
| 6 | wijzerplaat `verzoek`, wachtrij op `wand`, `tv`, `strook`, `inkt` |
| 7 | ‘Ongewoon’, dagoverzicht met geschiedenis en energie |
| 8 | mensen, rollen, uitnodigingen, privacy, ‘Wat de agent ziet’ |
| 9 | hulpmiddelen voor camera's en beveiliging, beelden voor het model |
| 10 | klimaat en media; titels van nummers als vreemde tekst |
| 11 | hulpmiddelen voor techniek, herkenning en onderhoud |
| 12 | echte agenten, overname, afstemming op de MCP-specificatie |

**Uitgesteld:** spraak — tot het besluit over de microfoon; meldingen op het apparaat — samen met het platform.

## 18. Besluiten voor de eigenaar

1. **Eenmalige bevestiging van de aanmelding** (plan §7) in plaats van 5 min per sessie.
2. **Microfoon in de browser** (plan §7): zonder microfoon kan spraak alleen via aparte apparaten.
3. **Model van de Huisassistent:** lokaal, in de cloud of beide; maandbudget.
4. **Instemming van andere volwassenen** (AVG) met het doorgeven van hun exacte aanwezigheid, locatie en camerabeelden aan een model in de cloud — is die naast de toestemming van de eigenaar nodig of niet.
5. **Kind:** de rol `kind` (wijziging van de beperking in `huis_leden`), of het kind de assistent gebruikt en of zijn gesprek wordt bewaard.
6. **Gast:** alleen met een account op het platform of ook via een link met een code.
