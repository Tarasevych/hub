> 🌐 **Taal:** [Українська](ДИЗАЙН-ДІМ-20261110.uk.md) · **Nederlands** | **Hoofddocument** · [Documentatie-index](../INDEX.nl.md)

# Ontwerp van de slimme-woninghub ‘Живий дім / Levend huis’

Taak HUIS-001 · fase 0 · 10-11-2026 · status: ter goedkeuring bij de eigenaar

Het enige toegangspunt tot het ontwerp van `huis.tarasevych.com` voor de eigenaar en voor wie het werk uitvoert. Rangorde van de bronnen: besluiten van de eigenaar (plan HUIS-001 §1) → [ontwerptaal](ONTWERPTAAL-LEVEND-HUIS-20261110.nl.md) en `docs/huis/maquette/stijl/hv-tokens.json` — alle waarden → zonespecificaties `zones/` — het gedrag van een zone → dit document — de samenvatting. Bij een verschil geldt de bron en wordt de samenvatting gecorrigeerd. Een **uitvoerder** is een scène, een automatisering, de optimalisatie of een agent die handelt zonder dat er een mens voor het scherm staat.

## 1. Wat het is en waarom

`huis.tarasevych.com` wordt het centrale bedieningspaneel van het thuisecosysteem van het platform ‘Mijn Ruimte’: licht, klimaat, media, energie, beveiliging en camera's, huishoudelijke apparatuur, vervoer, drones en robots — met mogelijkheden op het niveau van Home Assistant, maar als kant-en-klaar product. De basis is er al: de module ‘Huis vNext’ achter de uitgeschakelde vlag `huis-vnext` (`shared/huis-model.ts`, 11 tabellen `app.huis_*`, 13 tabbladen). Die bouwen we verder uit in plaats van opnieuw te beginnen; negen oude fouten worden in fase 0 met afzonderlijke vastleggingen hersteld.

**Besluiten van de eigenaar (9–10 november 2026):**

1. Eerst het ontwerp en de **simulator**; echte apparaten volgen later, via hetzelfde adaptermodel.
2. Reikwijdte: licht, stopcontacten en sensoren, energie, beveiliging, klimaat en media, overige apparatuur, **vervoer, camera's, drones**.
3. Schermen: telefoon, wandpaneel, computer, televisie, **smalle en gespecialiseerde externe schermen**.
4. Visuele basis — **‘Levend huis’**: een sfeervolle hemel, diepte, glas op lagen.
5. **Toestemmingen:** alle standen zijn beschikbaar voor elke actie; standaard ‘Uit’; alleen de eigenaar zet ze aan en uit, zonder opgelegde plafonds of termijnen; een agent kan zijn rechten niet uitbreiden en ook niet inperken; het Logboek is verplicht; wat een mens kiest, wordt precies zo uitgevoerd.
6. Na goedkeuring — **maquette en specificatie, daarna een pauze** voor beoordeling, zonder nieuwe bedieningsfuncties in de code van de site; de maquette zelf staat als aparte statische pagina op de site (§12).
7. Hoger op de lijst komen Garage, Automatisering en AI-agenten, en Schermen. **De uitgave bevat alle bedieningsinstrumenten, zonder uitzondering.**

## 2. Concept ‘Живий дім / Levend huis’

Een gewoon bedieningspaneel beantwoordt de vraag ‘welke apparaten heb ik’, dit paneel de vraag **‘hoe is het nu thuis’**. Boven de pagina staat de **hemel**, berekend uit de zonnestand boven het adres, het weer en de huisstand; daarop staan de **huiszin** («Удома тепло й спокійно. Світяться чотири лампи, двері замкнено. / Thuis is het warm en rustig. Er branden vier lampen, de deuren zijn op slot.») en de **doorsnede van het huis**, waarin een raam alleen oplicht als het licht bevestigd brandt. De sfeer draagt de context, de getallen liggen op ondoorzichtig papier. Structuur en technische eerlijkheid komen van de jurywinnaar ‘Precisie-instrument’, schil en dichtheid uit de vorige versie van de ontwerptaal.

| Vraag | Home Assistant, Apple Home, Google Home | ‘Levend huis’ |
|---|---|---|
| Bedieningspaneel | stelt de gebruiker zelf samen, of een vast raster | stelt zichzelf samen uit de registers; ‘Mijn weergave’ bewaart alleen de afwijkingen |
| Hoofdscherm | raster van gelijke kaarten | zin, ‘Nu belangrijk’, doorsnede, scènes, favorieten |
| Onbekende toestand | lijkt vaak op ‘uit’ | ‘onbereikbaar’, ‘verouderd’ en ‘toestand verondersteld’ hebben een eigen vorm en een eigen woord |
| Vóór de actie | niets | het gevolg «Що станеться · Пов'язано з · Як повернути / Wat er gebeurt · Hangt samen met · Terugdraaien»; wat gevaarlijk is, krijgt een houdrail |
| AI | een aparte chat of niets | een deelnemer met een eigen kolom toestemmingen, een auteursteken en een vermelding in het Logboek |
| Toestemmingen | gebruikersrechten | ‘Uit · Vragen · Altijd’ voor elke actie en elke uitvoerder |
| Vervoer, drones, schermen | apps van fabrikanten, uitbreidingen van derden | Garage en 13 schermprofielen in één taal |
| Simulator | geen | een volledig demohuis, altijd gemarkeerd |

Wat we bewust niet worden: een gecertificeerd alarmsysteem, een vervanging van de afstandsbediening van de dronefabrikant, een bouwdoos voor willekeurige bedieningspanelen.

## 3. De beeldtaal in het kort

De volledige beschrijving staat in de [ontwerptaal](ONTWERPTAAL-LEVEND-HUIS-20261110.nl.md); 48 nieuwe kleurtokens en 201 contrastparen in drie thema's doorstaan de controle.

- **Drie lagen** (ontwerptaal §2): hemel — de achtergrond; papier `--panel` — alles met getallen; glas `--hv-glas` — **alleen** de kop, de navigatie, de bladen en ‘Opdracht’; boven alles de noodlaag `hv-nood`. Een effen terugvalweergave schakelt zichzelf in (minder doorzichtigheid, verhoogd contrast, televisie, inkt, alarm).
- **Hemel** (ontwerptaal §3): nacht · dageraad · dag · schemer in het lichte en het donkere thema, onderscheiden door tint en niet door lichtheid. Bewolking is een bijmenging van `--surface2`, neerslag een stilstaande arcering; ‘Afwezig’ haalt de kleur weg, een alarm schakelt de hemel uit. Volledig alleen op ‘Thuis’, elders stil.
- **Toestandskleur** (ontwerptaal §4): `--hv-aan`, `--hv-warm`, `--hv-koud`, `--hv-zon`, `--hv-net-in`, `--hv-net-uit`, `--hv-batterij`, `--hv-auto`, arcering `--hv-arcering`; een toestand is altijd ook een pictogram en een woord; het accent is alleen de streep bij een sectie en één hoofdknop.
- **Typografie, vorm, beweging** (ontwerptaal §5, §6, §8): systeemschreefloos, getallen 64/40/28 met decimale komma; een cirkel schakelt, een rechthoek leidt dieper, een dubbele rand betekent gevaar; indrukken 120 ms, blad 280, vasthouden 1200; de enige beweging uit zichzelf zijn de energiestromen.
- **Dichtheid en tekst** (ontwerptaal §7, §11): compact · gewoon · ruim naargelang het profiel; zinnen alleen uit wat is waargenomen, het verouderde in de verleden tijd; opschriften in paren «українська / Nederlands».

## 4. Productkaart

Adressen (zone 1 §4): pagina `/<sectie>[/<tabblad>][/<object>]`; blad `?blad=<soort>:<id>&deel=`; dialoogvenster `?dialoog=`; moment `?t=`. Een adres opent alleen een weergave — het dialoogvenster van een gevaarlijke actie opent niet via een adres.

| Sectie | Adres (id) | Tabbladen en belangrijkste schermen |
|---|---|---|
| Дім / Thuis | `/overzicht` (`overview`) | hemel, zin, doorsnede, «Зараз важливо / Nu belangrijk», scènes, favorieten, samenvatting, dagstrook; eerste start |
| Кімнати / Kamers | `/kamers` (`rooms`) | Зараз / Nu · План / Plattegrond `/plattegrond` · Пристрої / Apparaten `/apparaten` · Клімат / Klimaat `/klimaat` · Медіа / Media `/media`; kamer `/kamers/<kamer>` |
| Енергія / Energie | `/energie` (`energy`) | Nu · Тариф / Tarief `/tarief` · Сонце й батарея / Zon en batterij `/opwek` · Зарядка / Laden `/laden` · Тепло / Warmte `/warmte` · Звіти / Rapporten `/rapporten` |
| Безпека / Beveiliging | `/beveiliging` (`security`) | Стан / Status · Камери / Camera's `/cameras` · Доступ / Toegang `/toegang` · Датчики / Sensoren `/sensoren` |
| Гараж / Garage | `/garage` (`garage`) | Nu · Транспорт / Voertuigen · Безпілотники / Drones (cockpit `/<id>/vlucht`, missies) · Роботи / Robots · Мапа / Kaart |
| Автоматика / Automatisering | `/automatiseringen` (`automations`) | Правила / Regels (bewerker, proefdraaien, versies) · Сцени й режими / Scènes en standen `/scenes` · Порядок дня / Agenda `/automatiseringen/agenda` · Помічник / Assistent `/assistent` · Агенти й погодження / Agenten en goedkeuringen `/automatiseringen/agenten` |
| Журнал / Logboek | `/activiteit` (`activity`) | Сповіщення / Meldingen · Історія / Geschiedenis · Обслуговування / Onderhoud · Правила / Regels |
| Система / Systeem | `/instellingen` (`settings`) | Дім / Woning · Люди й доступ / Mensen en toegang · Приватність / Privacy · Дозволи й небезпечні дії / Toestemmingen en gevaarlijke acties `/toestemmingen` · Ризики / Risico's `/risico` · Екрани / Schermen · Інтеграції / Integraties · Симулятор / Simulator · Діагностика / Diagnose · Вітрина / Toonzaal · Калькулятор / Planner en andere |
| Екран / Paneel | `/paneel/<profiel>/<id>` (`panel`) | kiosk van een extern scherm zonder de omlijsting van het platform; koppelen |
| Команда / Opdracht | `?dialoog=opdracht` | zoeken en acties met het gevolg vóór de uitvoering; zes grote werkwoorden |

Het korte adres van een tabblad wordt gelezen vanaf de sectie (`/tarief` — `/energie/tarief`); `/apparaten`, `/klimaat`, `/media`, `/scenes` en `/assistent` zijn eigen wortels. **Navigatie** (zone 1 §2): vanaf 700 px een glazen kop met zes secties (zonder Logboek en Systeem), ‘Opdracht’, de simulatiechip, ‘! N’, een bel (Logboek) en een tandwiel (Systeem). Telefoon — een onderbalk «Дім · Кімнати · Енергія · Безпека · Ще / Thuis · Kamers · Energie · Beveiliging · Meer» en daarboven een vierkante ‘Opdracht’ van 56 px; Garage schuift naar het onderste vak zodra er iets vliegt of laadt.

**Wat er met de 13 bestaande tabbladen gebeurt.** Vijf blijven sectie: `overview` → ‘Thuis’, `rooms` → ‘Kamers’, `energy`, `security`, `automations` → ‘Automatisering’. Zes worden een tweede niveau: `devices` → Kamers › Apparaten (`/apparaten`), `scenes` → Automatisering › Scènes en standen (`/scenes`), `assistant` → Automatisering › Assistent (`/assistent`), `integrations`, `showroom` en `planner` → Systeem (`/instellingen/integraties`, `/showroom`, `/planner`; de oude wortels worden doorgestuurd). Twee verhuizen: `activity` «Події / Gebeurtenissen» wordt «Журнал / Logboek» achter de bel, `settings` «Налаштування / Instellingen» wordt «Система / Systeem» achter het tandwiel. De nieuwe id's `garage`, `climate`, `media` en `panel` worden in één snede toegevoegd, met een test op overeenstemming in `SLUG_TO_ID`.

## 5. Hoofdscherm

Volledige schetsen — zone 2 §2.1 en zone 1 §2. Tekens: `( )` — schakelcirkel, `[▣]` — teken met ritueel, `[ ]` — knop of pil.

**Computer** (`bureau`, 12 kolommen; de held niet hoger dan `min(320px, 40svh)`):

```
┌ glas 56 px ───────────────────────────────────────────────────────────┐
│[Thuis▾] Thuis Kamers Energie Beveil. Garage Autom. [Opdracht] ×60 ● 3 │
└───────────────────────────────────────────────────────────────────────┘
 hemel: schemer, regen                                ╱╲    zolder
 Thuis is het warm en rustig. Vier lampen aan,      │■ ▢│   1e
 deuren op slot, de auto laadt tot 21:10.           │■■▢│   bg
 [Thuis] [OT thuis] [8 °C regen] [€ 0,24] [Morgen: papier]  erf
┌ Nu belangrijk · 2 ────────────────────┐ ┌ Kamers · bg ────────────────┐
│△ Slaapkamerraam 42 min open, cv aan   │ │[Kaarten | Plattegrond]      │
│                      [Zet op 15 °C] ⋯ │ │Woonkamer 21,5 °C ( ) − +    │
│? Agent: laden 02:00 [1× goedkeuren]   │ └─────────────────────────────┘
└───────────────────────────────────────┘ ┌ Energie ────────────────────┐
┌ Scènes ─────────┐ ┌ Favorieten ───────┐ │stromenring · −1,2 kW        │
│[Avond] [Film]   │ │( ) Vloerlamp 70 % │ │goedkoper vanaf 23:00        │
└─────────────────┘ │[▣] Voordeur       │ └─────────────────────────────┘
                    └───────────────────┘
┌ Samenvatting · Dagstrook −18…+6 uur ┃nu ──────────────────────────────┐
```

**Telefoon** (390 px; de held is hoogstens ¼ van het scherm en krimpt tot een pil in de kop «Вечір · 17:42 / Avond · 17:42»; de teller van aandachtspunten is een aparte chip):

```
┌ glas 48 ─────────────────────────┐
│(Avond · 17:42)  [△2] [●] [bel 3] │
│kolf Simulatie ×60 · huistijd     │
├ hemel ───────────────────────────┤
│In de slaapkamer staat het raam   │
│42 min open; de cv is aan.        │
│[Thuis][8 °C regen][Morgen papier]│
├ Belangrijk · Scènes · Favorieten ┤
├ Doorsnede · Samenvatting ────────┤
│                       [Opdracht] │
├ glas 56 ─────────────────────────┤
│ Thuis Kamers Energie Beveil. Meer│
└──────────────────────────────────┘
```

**Strookscherm** (`strook` 1920×480; raster 16×4, zonder scrollen en zonder navigatie):

```
┌ 1–3 ──────────┬ 4–6 ─────────┬ 7–9 ─────┬ 10–12 ─────┬ 13–16 ──────────┐
│ 17:42         │ −1,2 kW      │ ring van │ △ raam     │ [Lamp] [Avond]  │
│ Thuis warm    │ € 0,24 nu    │ stromen  │   slaapk.  │ [Deur] [Nacht]  │
│ en rustig.    │ lager v.a. 23│          │ ? agent    │                 │
├ dagstrook 64 px: aanwezigheid · deuren · prijs · stand ┃nu ────────────┤
```

## 6. Zones

Elke zone heeft een paar bestanden (Oekraïens en Nederlands); hier staat de kern.

**Zone 1. Каркас / Schil** — [01-SCHIL](zones/01-SCHIL.nl.md). Lagen, kop, onderbalk, onderste vak, het blad «Стан дому / Status van het huis». De uitzonderingsladder — één volgorde voor alle schermen: rook, gas, water → alarm → oproep van de deur → vlucht → verzoek → «Тривають / Lopend». Adresgrammatica, 13 profielen, wijzerplaten van kleine schermen, levering via de browser, als beeld van de server of als gegevens voor de firmware. Sessie ‘scherm’ in plaats van een rol, koppelen met een code en een QR-code, persoonlijke codes op gedeelde schermen, kiosk, televisie met afstandsbediening, toegankelijkheid.

**Zone 2. Дім і кімнати / Thuis en kamers** — [02-THUIS-EN-KAMERS](zones/02-THUIS-EN-KAMERS.nl.md). De huiszin uit sjablonen, alleen met waargenomen feiten; de chips van de held; de doorsnede `hv-doorsnede`. De standen «Вдома · Не вдома · Ніч · Відпустка · Гості / Thuis · Afwezig · Nacht · Vakantie · Gasten» als een reeks stappen; de beveiliging is een aparte `hv-alarmstand`; automatisch omschakelen op aanwezigheid staat standaard op ‘Uit’. ‘Nu belangrijk’ is één lijst van de server. Kamerpagina: klimaat → scènes → licht → media → de rest → «Що тут діє само / Wat hier vanzelf gebeurt». Plattegrond met vijf lagen en ‘Terugblik’; aanwezigheid, afval, ‘Mijn weergave’.

**Zone 3. Пристрої / Apparaten** — [03-APPARATEN](zones/03-APPARATEN.nl.md). Het model ‘apparaat (`hardware`) → functie (`apparaat`) → mogelijkheid → actie’; de bedieningselementen kiest de mogelijkheid, niet het merk. Tegel: de cirkel schakelt, het lichaam opent het blad «Керування · Історія · Налаштування / Bediening · Geschiedenis · Instellingen»; de vulling is het waargenomene, de streep het gewenste. Een opdracht aan het apparaat: verzonden → ontvangen → bevestigd of ‘niet uitgevoerd’. **Bedieningsblad voor elke klasse**: licht, stopcontacten, gordijnen en poorten, klimaat en warmte, ventilatie, media, robots, besproeiing, sensoren, huishoudelijke apparaten, computers en netwerk, afstandsbedieningen. Een onbereikbaar apparaat toont «Що перевірити / Wat te controleren»; klimaat `/klimaat` en media `/media`.

**Zone 4. Енергія / Energie** — [04-ENERGIE](zones/04-ENERGIE.nl.md). Het eerste scherm: waar de energie heen stroomt, wat ze kost en wanneer het goedkoper wordt. Stromen live (ring `--hv-ring`), fasen L1–L3, een prijsstrook over 48 uur met goedkope vensters en negatieve prijs, laadplan `hv-laadplan`, de modus «Пауза · Розумно · Швидко / Pauze · Slim · Snel», warmtepomp, gas, water, rapporten en de rekening; 2027 zonder saldering. Gemeten — doorgetrokken, geschat — gestippeld en ‘≈’; het prijsniveau is een woord en een vorm, geen kleur. De hoofdzekering wordt voorlopig alleen bewaakt.

**Zone 5. Безпека / Beveiliging** — [05-BEVEILIGING](zones/05-BEVEILIGING.nl.md). Een eerlijke grens: «Не сертифікована система / Geen gecertificeerd alarmsysteem» en het blok «Хто що охороняє / Wie bewaakt wat». Beveiliging «знято · периметр · нічна · повна / uit · schil · nacht · volledig»; de noodlaag voor rook, gas en water is op alle schermen gelijk. Camera's: beelden via de server, «Приватність удома / Privé thuis», het spoor «Хто дивився / Wie keek mee». Toegang: sloten, poorten, deurbel, persoonlijke en gastcodes met een termijn, oproep van de deur. Een alarm op de panelen is tot fase 9 een oefening.

**Zone 6. Гараж / Garage** — [06-GARAGE](zones/06-GARAGE.nl.md). ‘Is het vervoer klaar, waar is het, wat is er in de lucht en op het perceel.’ De telemetriekaart `hv-telemetrie`: lading, actieradius, drie getallen, silhouet. Auto's, elektrische fietsen, een step, een brommer. Drones — alleen in simulatie, met stempel: vloot, accu's, controle vóór het opstijgen, cockpit met beeld en telemetrie, «Зависнути · Повернутися додому · Сісти зараз / Zweven · Naar huis · Nu landen», missies, vliegzones ter informatie. Een noodstop van de motoren heeft de hub niet — de cockpit zegt dat ook. Robots op de kaart van het perceel.

**Zone 7. Автоматика / Automatisering** — [07-AUTOMATISERING](zones/07-AUTOMATISERING.nl.md). ‘Wat gebeurt er vanzelf, waarom en namens wie.’ De bewerker «Коли / Якщо / Тоді — Wanneer / Als / Dan» vanuit een bedoeling, een voorwaarde live ‘waar · onwaar · onbekend’, «Зараз спрацювала б: ні — … / Zou nu afgaan: nee — …». Het pad «Чернетка → Спостереження → Увімкнено / Concept → Meekijken → Aan», proefdraaien, verloop, versies; de motor handelt namens de persoon die de regel heeft ingeschakeld. Een stap met de toestemming ‘Uit’ wordt overgeslagen en vastgelegd. Scènes uit een momentopname van de toestand, standen, agenda, het Logboek ‘wie · wat · waarom · was → werd · via welke toestemming’.

**Zone 8. Помічник і агенти / Assistent en agenten** — [08-ASSISTENT-EN-AGENTEN](zones/08-ASSISTENT-EN-AGENTEN.nl.md). De Huisassistent is een ingebouwde agent met dezelfde kolom toestemmingen als de externe. Opdracht → een kaart met de bedoeling ‘was → wordt’ uit een droge proefrun; een actie die een mens bevestigt, is een actie van die mens, met diens ritueel. Agentpagina: «Інструменти · Рамки · Дії · Що бачить агент / Hulpmiddelen · Kaders · Acties · Wat de agent ziet». De wachtrij «Чекає на вас / Wacht op jou», «Чому це сталося / Waarom gebeurde dit», «Зупинити самостійні дії / Zelfstandige acties stoppen». De volledige set MCP-hulpmiddelen; een hulpmiddel om toestemmingen te wijzigen bestaat niet. Rollen: eigenaar, bewoner, kind, gast.

**Zone 9. Архітектура / Architectuur** — [09-ARCHITECTUUR](zones/09-ARCHITECTUUR.nl.md). Het adaptercontract, de simulator en het paspoort van het demohuis, het register en de risicomatrix, de controle van toestemmingen op de server, de stroom, geschiedenis en controlespoor, de motor zonder sessie van een mens, schermen, de koppeling en meldingen, de pagina's van ‘Systeem’, fasen 0–12, tests en risico's.

**Zone 10. Дизайн-система / Ontwerpsysteem** — [10-ONTWERPSYSTEEM](zones/10-ONTWERPSYSTEEM.nl.md). Bronnen van waarheid, tokens en controles bij het bouwen (contrast, punten van de hemel, taalwet), lagen in de code, de gemeenschappelijke toestandsmatrix, vormen van risico en ritueel, het componentenregister, tekstsjablonen (`meervoud()`), de klikbare maquette en de acceptatie ervan.

## 7. Matrix van de 13 schermprofielen

Een gewoon adres kiest de eerste vijf profielen op breedte; de overige alleen via `/paneel/<profiel>/<id>` (ontwerptaal §7, zone 1 §5).

| Profiel | Afmeting | Hemel · glas · dichtheid | Getoond | Bediening | Gevaarlijke actie |
|---|---|---|---|---|---|
| `horloge` | 200–400 | stil · geen · gewoon | drie wijzerplaten: toestand, energie, alarmen | aanraken, ‘‹ ›’ | knop met aftellen; kritiek — op de telefoon |
| `telefoon` | 320–699 | volledig · ja · gewoon | alles; bladen van onderen; onderbalk | aanraken, Opdracht | rail |
| `wand` | 700–1099 | volledig · ja · ruim | Thuis, Kamers, Energie, Beveiliging, Garage; rustscherm | doelen van 56 px, paneelcode | rail; kritiek — rail en persoonlijke code |
| `bureau` | 1100–1799 | volledig · ja · compact | alles; blad rechts van 400 px | muis, toetsenbord | rail |
| `breed` | 1800–2399 | volledig · ja · compact | plattegrond of kaart steeds ernaast | hetzelfde | rail |
| `ultrabreed` | vanaf 2400 | volledig · ja · compact | plattegrond │ inhoud │ blad en Logboek live | zonegrenzen zijn versleepbaar | rail |
| `tv` | 1920×1080 | schermvullend · geen · ruim | rij kaarten, schaal 1,5 | afstandsbediening, focusring | `OK` vasthouden; kritiek — op de telefoon |
| `strook` | 1920×480, 1280×400 | stil · geen · gewoon | dagstrook als scherm, 4 (2) tegels | aanraken | knop met aftellen; kritiek — op de telefoon |
| `vierkant` | 480–720 | stil · geen · gewoon | wijzerplaat van een kamer met draaiknop | aanraken, ‘−/+’ | rail |
| `rond` | 480–720 | stil · geen · gewoon | één wijzerplaat, boog langs de rand | aanraken, ‘−/+’ | rail |
| `klein` | 800×480 | stil · geen · gewoon | twee wijzerplaten, tot 4 knoppen | aanraken | rail |
| `deur` | 480×800 | stil · geen · ruim | vóór de code: tijd, weer, oproep; daarna «Йду / Ik ga weg», «Я вдома / Ik ben thuis» | code | rail |
| `inkt` | elke | geen · geen · gewoon | zin, uitzonderingen, 4–8 tegels; zwart en wit | genummerde knoppen | knoppen 1 en 2 met aftellen; kritiek — op de telefoon |

Een toestemming wijzigen kan alleen op een persoonlijk toestel van de eigenaar (`telefoon`, `bureau`, `breed`, `ultrabreed`, `wand` via het gewone adres); de overige tonen de stand als tekst, met de markering ‘!’.

## 8. Simulator en demohuis

Een aparte woning **«Демо-дім · Wilgenlaan 12 / Demowoning · Wilgenlaan 12»** (Utrecht; referentiemoment — maandag 9 november 2026, 14:30): 14 kamers, een tuin, een schuur, ongeveer 120 apparaten — een exemplaar van elk type en telkens één ‘onbereikbaar’, ‘toestand verondersteld’, ‘verouderd’ en ‘niet uitgevoerd’. P1 voor drie fasen, zonnepanelen van 4,2 kW, een batterij van 10 kWh, een laadpaal, een warmtepomp, een tarief over 48 uur, 4 camera's, een elektrische auto, een gewone auto, twee elektrische fietsen, een step, een brommer, twee drones met een dronedock, een robotstofzuiger, een robotmaaier, vier bewoners en een gast.

- **Herkomst is een eigenschap van de woning.** De server mengt echte en gesimuleerde bronnen niet, dus ‘er is geen enkel echt apparaat gewijzigd’ is altijd waar. De externe kanalen van het demohuis staan uit tot de eigenaar ze zelf inschakelt.
- **De kern** — zuivere functies in `shared/huis-sim/` op basis van de kiem, de huistijd en het logboek van opdrachten; het afgelopen etmaal wordt uit de kiem opnieuw berekend, zodat de dagstrook al in fase 1 werkt.
- **Twee klokken:** de echte (ongedaan maken, wachten, codes, termijnen) en de ‘huistijd’ (schema's, tarieven, ritten) met een snelheid van ×1 / ×10 / ×60 / ×600; vanaf ×10 zwijgen de externe kanalen, een nieuw verzoek zet de snelheid terug op ×1.
- **Register van 36 scenario's**; de schermen «Світ / Wereld» (handmatige waarden en virtuele apparaten) en «Траси / Sporen» (opnemen en afspelen); storingen zijn gewone schakelaars.
- **Markering:** de vaste chip `hv-sim` met een kolf, het meetstempel, de hoek van de grafiek, de kolf in meldingen en in het Logboek, bedragen in euro met het woord ‘voorbeeld’.
- **Uitstappen:** de wizard «Перенести налаштування / Instellingen overnemen» neemt kamers, plattegrond, scènes en automatiseringen over als concept; toestemmingen, codes en geschiedenis gaan niet mee — in een echt huis begint elke toestemming op ‘Uit’.

Volledig — zone 9 §3.

## 9. Toestemmingen en gevaarlijke acties

Het model — besluit nr. 5 (plan §3.8, ontwerptaal §10). Twee onafhankelijke dimensies: het **niveau van een actie** bepaalt alleen het teken en het ritueel voor de mens voor het scherm; de **toestemming** bepaalt wat uitvoerders mogen doen. Het niveau beperkt de toestemmingen niet.

- **Standen voor elke actie, zonder uitzondering:** «Вимкнено / Uit · Питати / Vragen · Завжди / Altijd» (`hv-stand`), afzonderlijk voor scène, automatisering, de optimalisatie, de Huisassistent en elke externe agent. Standaard — ‘Uit’.
- **Alleen de eigenaar zet ze aan en uit**, op een persoonlijk toestel. Plafonds, opgelegde termijnen en onbeschikbare segmenten zijn er niet: kiest de eigenaar ‘Altijd’ voor het ontgrendelen van deuren, het uitschakelen van de beveiliging, poorten, gas of het opstijgen van een drone, dan werkt het ook zo. Termijn, kamers, uren en een actiebudget zijn optionele kaders die de eigenaar zelf instelt; standaard «без рамок / zonder kaders».
- ‘Altijd’ voor een gevaarlijke of kritieke actie vraagt een bevestiging van de aanmelding van de eigenaar — een controle dat hij het zelf is die de toestemming wijzigt, geen beperking van zijn keuze. Daarna staat bij de actie, op de tegel en in de kop (‘! N’) een vaste, gevulde markering ‘!’.
- **Een agent wijzigt geen toestemmingen** — niet uitbreiden en niet inperken, niet de eigen en niet die van anderen: zo'n bedieningselement en zo'n MCP-hulpmiddel bestaan niet. Andere rollen zien de stand als tekst met een slot: «Змінює лише власник / Alleen de eigenaar kan dit wijzigen».
- **Het Logboek is verplicht:** elke wijziging van een toestemming en elke actie op grond van een toestemming levert een vermelding ‘wie · wat · waarom · was → werd · via welke toestemming’ op in het Logboek en in het meldingencentrum; het controlespoor kent alleen toevoegen, en niemand kan het uitschakelen.
- **‘Vragen’** maakt een verzoek `hv-verzoek` aan: «Схвалити раз / Eén keer goedkeuren · Відхилити / Afwijzen»; de goedkeuring doorloopt het ritueel van het niveau van de actie.
- **De pauze** «Зупинити самостійні дії / Zelfstandige acties stoppen» verandert de standen niet: wat gekozen is, blijft gekozen, er wordt alleen niets uitgevoerd. Stoppen kan de eigenaar of een bewoner, op de noodlaag iedereen voor het scherm; hervatten alleen de eigenaar.
- **De pagina** `/instellingen/toestemmingen` — een matrix ‘actie × uitvoerder’ met groepen en het groepsbrede «Для всієї групи / Voor de hele groep»; het register van niveaus staat op `/instellingen/risico`. In de maquette zijn beide samengevoegd tot één tabblad (§12).

| Actie (voorbeelden uit zones 3–6) | Niveau | Ritueel van de mens | Standaardstand van uitvoerders |
|---|---|---|---|
| licht, stopcontacten, gordijnen, instelwaarden, media; deur of auto op slot doen; water of gas afsluiten; ‘Naar huis’ van een drone; laden stoppen | gewoon | meteen | standaard Uit, de eigenaar kiest elke stand |
| de standen ‘Nacht’ en ‘Afwezig’; beveiliging inschakelen; poort sluiten; ‘Nu laden’; wassen, besproeien, boiler; tijdelijk meekijken met een binnencamera | gevoelig `Eye` | meteen, met «Повернути / Ongedaan maken» 10 s; waar terugdraaien onmogelijk is — knop met aftellen 3 s | standaard Uit, de eigenaar kiest elke stand |
| poort openen; waterklep openen; sirene; oven; maaier; autoramen; «Вимкнути все в домі / Alles in huis uit» | gevaarlijk `Triangle` | `hv-gevaar`: houdrail van 1,2 s met een zin over het gevolg (of knop met aftellen 3 s) | standaard Uit, de eigenaar kiest elke stand |
| deur, auto of kofferbak ontgrendelen; beveiliging uitschakelen; alarm afzetten; gas openen; gastcode uitgeven; motor starten; opstijgen en missie van een drone; poorten met het label `ingang` | kritiek `Octagon` | rail en bevestiging van de aanmelding (op panelen — persoonlijke code; op `tv`, `horloge`, `strook`, `inkt` — «Підтвердьте на телефоні / Bevestig op je telefoon»); opstijgen — bovendien de controle vóór het opstijgen | standaard Uit, de eigenaar kiest elke stand |

De definitieve matrix ‘mogelijkheid × richting → niveau → ritueel’ komt in `shared/huis-gevaar.ts` (fase 2), in plaats van de starre `KRITIEKE_SOORTEN`; het besluit wordt samen met de codewijziging vastgelegd in `orchestratie/BESLUITEN.md`. Een omgekeerde actie erft het niveau van haar eigen richting. Het teken ‘!’ heeft twee betekenissen: de uitlegknop «Що може статися · Хто зможе це запускати · Як вимкнути / Wat er kan gebeuren · Wie dit kan starten · Uitzetten» en de vaste markering van een ingeschakeld ‘Altijd’.

## 10. Componentenbibliotheek `hv-*`

49 basisonderdelen (ontwerptaal §9; toestanden — zone 10 §5, register — zone 10 §7). Elk heeft twaalf gemeenschappelijke toestanden: rust, aanwijzen, focus, indrukken, wacht, bezig, niet uitgevoerd, verouderd, onbereikbaar, toestand verondersteld, simulatie, alleen bekijken.

**Basis:**

- `hv-hemel` — hemel van de sectie
- `hv-held` — held met de zin
- `hv-doorsnede` — doorsnede van het huis
- `hv-tegel` — tegel van een apparaat
- `hv-kamerkaart` — tegel van een kamer
- `hv-telemetrie` — kaart van een auto, drone of robot
- `hv-laag` — glazen blad
- `hv-blok` — inklapbaar blok van een pagina
- `hv-chip` — papieren pil
- `hv-nu` — ‘Nu belangrijk’
- `hv-leeg` — lege toestand
- `hv-skelet` — laden in de vorm van de inhoud

**Tijd en gegevens:**

- `hv-dagstrook` — dagstrook −18…+6 uur
- `hv-grafiek` — eigen SVG (lijn, vlak, kolommen, toestandsbanden, warmtekaart, stromenring)
- `hv-tabel` — tabelvariant van grafiek en plattegrond
- `hv-plan` — plattegrond met vijf lagen
- `hv-landkaart` — schema van perceel en zones
- `hv-stempel` — stempel ‘waarde · ouderdom · bron’
- `hv-versheid` — actualiteit en gegevensweg
- `hv-sim` — simulatiechip
- `hv-maker` — auteursteken
- `hv-waarom` — keten ‘aanleiding → voorwaarde → actie’

**Bediening:**

- `hv-schakel` — schakelcirkel
- `hv-schuif` — schuifregelaar
- `hv-wijzer` — draaiknop van de thermostaat
- `hv-kleur` — kleurkeuze
- `hv-aftel` — aftellen van de timer
- `hv-werkmodus` — «Пауза · Розумно · Швидко / Pauze · Slim · Snel»
- `hv-laadplan` — laadplan
- `hv-scene` — scèneknop
- `hv-huisstand` — huisstand
- `hv-alarmstand` — beveiligingsstand

**Risico:**

- `hv-risico` — niveauteken met een woord
- `hv-stand` — toestemming «Вимкнено · Питати · Завжди / Uit · Vragen · Altijd»
- `hv-gevaar` — dialoogvenster voor een gevaarlijke actie
- `hv-rail` — houdrail
- `hv-gevolg` — gevolgtip
- `hv-nood` — noodlaag
- `hv-pincode` — codetoetsenbord

**Activiteit en AI:**

- `hv-toost` — opduikende melding met ‘Ongedaan maken’
- `hv-bericht` — vermelding in het Logboek
- `hv-meldingen` — meldingencentrum
- `hv-opdracht` — ‘Opdracht’
- `hv-voorstel` — voorstel van een agent ‘was → wordt’
- `hv-verzoek` — verzoek in de stand ‘Vragen’
- `hv-agentkaart` — agentkaart met pauze
- `hv-regel` — regel van een automatisering
- `hv-vluchtbalk` — vluchtbalk
- `hv-oproep` — oproep van de deur

Hulponderdelen worden geregistreerd in de sectie ‘Componenten’ van de zone die ze invoert: `hv-kop`, `hv-onderbalk` en `hv-onderslot` — zone 1 §16, `hv-traject` — zone 7 §16, `hv-gesprek` — zone 8 §16. Het register van zone 10 §7 bevat de 49 basisonderdelen en de onderdelen van zones die door meerdere zones worden gebruikt (`hv-matrix`, `hv-regie`, `hv-begrenzing`, `hv-onderhoud` en andere); de onderdelen van de schil herhaalt het niet, het verwijst daarvoor naar zone 1 §16.

## 11. Architectuur in het kort

Volledig — zone 9; in fase 0 wordt hiervan niets gebouwd.

- **Adaptercontract** `shared/huis-adapter.ts`: `manifest`, `start/stop`, `ontdek`, `koppel`, `stuur`, `gezondheid`; een adapter schrijft niet in de database. De simulator is de eerste adapter; de bestaande Home Assistant-adapter wordt zonder gedragswijziging in het contract verpakt.
- **Register:** een nieuwe tabel `huis_hardware` boven `huis_apparaten`, migraties vanaf 0200, RLS alleen via `app.huis_is_lid()`.
- **Live:** `POST /api/huis/stroom` — een momentopname, daarna wijzigingen (dringende meteen, de rest eens per 250 ms), terugvalbevraging elke 30 s; drempels voor ‘verouderd’ per klasse (P1 60 s … drone 10 s).
- **Geschiedenis:** ruwe gegevens 14 dagen, samenvattingen per 5 min / uur / etmaal, Logboek 400 dagen, controlespoor 2 jaar.
- **Motor** `backend/huis/motor.ts` handelt namens de persoon die de regel heeft ingeschakeld; RLS wordt niet omzeild.
- **MCP:** de groep `huis` van de koppeling met de volledige set hulpmiddelen, zonder hulpmiddel om toestemmingen te wijzigen. **Meldingen** `huis.*` in het meldingencentrum van het platform. **Vlaggen** `huis-levend`, `huis-simulator`, `huis-stroom`, `huis-motor`, `huis-mcp`.

| Nr. | Fase | Inhoud | Dagen |
|---|---|---|---|
| 0 | **Maquette en specificatie** | dit pakket, de maquette, herstel van negen oude fouten; daarna een pauze | 8–10 |
| 1 | Schil en demohuis | register, contract, kern van de simulator, stroom, hemel, ‘Thuis’, ‘Kamers’, dagstrook | 18 |
| 2 | Bediening — alle apparaatklassen | bladen van alle typen, toestemmingsmatrix, kern van de motor, scènes, standen, meldingencentrum, controlespoor | 20 |
| 3 | Opdracht en zoeken | `hv-opdracht`, zoeken | 6 |
| 4 | Garage | vervoer, drones, robots, kaart | 12 |
| 5 | Automatisering en AI-agenten | bewerker, versies, goedkeuringen, volledige set MCP-hulpmiddelen | 18 |
| 6 | Schermen en panelen | 13 profielen, kiosk, koppelen, persoonlijke codes, app, plattegrondbewerker | 14 |
| 7 | Geschiedenis en energie | grafieken, ‘Terugblik’, de optimalisatie | 16 |
| 8 | Mensen, rollen, privacy | uitnodigingen, rollen, toestemmingsverklaringen, meldingsregels | 14 |
| 9 | Beveiliging en camera's | beveiliging, gastcodes, camera's, echte noodlaag | 12 |
| 10 | Klimaat en media | themapagina's, weekschema's | 7 |
| 11 | Apparatuur, ontdekken, onderhoud | wizard voor een nieuw apparaat, vervanging | 8 |
| 12 | Echte bronnen en uitstappen uit de demo | Home Assistant-brug, «Перенести налаштування / Instellingen overnemen», eigen adapters | vanaf 12 |

Fasen 1–11 — ongeveer 145 dagen. Tot fase 8 handelen agenten en automatiseringen namens de eigenaar; een alarm op de panelen is tot fase 9 een oefening.

## 12. Klikbare maquette

- **Waar:** de bronnen — `docs/huis/maquette/` (`stijl/` met `hv-tokens.json`, `gegevens/` — paspoort van het demohuis, tarief en scenario's, `kern/` — minisimulator en schil, `schermen/` — schermen, `volgorde.json` — volgorde van samenvoegen); de bouwer — `scripts/huis-maquette.mjs`; het resultaat — één op zichzelf staand bestand `docs/huis/maquette/huis-maquette.html` zonder externe afhankelijkheden.
- **Bouwen en openen:** `node scripts/huis-maquette.mjs` → `huis-maquette.html` openen in een willekeurige moderne browser (een server is niet nodig); `--controle` — statische controles zonder browser; `--artefact <pad>` — variant voor een privépagina ter inzage; `node scripts/huis-maquette-rook.mjs --uit <map>` — rookproef in de browser.
- **Op de site:** `node scripts/huis-maquette.mjs --site <map>` bouwt drie bestanden — `index.html`, `maquette.css` en `maquette.js` — zonder ingebedde stijlen en scripts, omdat het inhoudsbeveiligingsbeleid van de site dat eist; de bouw van de site (`npm run build`) zet ze na `vite build` in `dist/huis-maquette/`. Het adres is `huis.tarasevych.com/huis-maquette/`; de ingang is de knop «Відкрити макет / Maquette openen» op het tabblad «Вітрина / Toonzaal», en zolang de vlag `huis-vnext` uit staat op de huidige pagina van het slimme huis. De maquette opent in een nieuw tabblad en bedient niets: geen enkele actie daarin bereikt de apparaten of verandert de woning.
- **Wat erin zit:** een minisimulator met een vaste kiem — elke actie gaat door de poorten ‘verbinding → bereikbaarheid → rol → ritueel → toestemming van de uitvoerder’ en laat een vermelding in het Logboek en een melding achter. Een bedieningspaneel buiten het canvas: thema (licht, donker, inkt), taal, 13 profielen in echte pixels, dichtheid, rol, toestand van de gegevens, 15 scenario's, tijdsnelheid. Klikbaar zijn alle secties en tabbladen, het blad van elk apparaattype, de toestemmingen met een werkende `hv-stand` en ‘!’, de agentpagina, de regelbewerker, Opdracht, de vluchtcockpit, de Simulator, de noodlaag en «Складники / Onderdelen». Met het stempel ‘later’: plattegrondbewerker, cameramaskers, koppelwizards.
- **Bekende verschillen tussen de maquette en de specificatie** (zie ook zone 10 §10). De maquette gaat precies zo de uitgave in; de specificatie blijft de norm tot de eigenaar de keuze van de maquette overneemt:
  - **‘Opdracht’ op de telefoon:** in de maquette het middelste punt van de onderbalk; volgens de specificatie (ontwerptaal §9) een vierkant van 56 px boven de balk.
  - **Volgorde van de blokken van ‘Thuis’ op de telefoon:** in de maquette «Зараз важливо / Nu belangrijk» → «Дім у розрізі / Huis in doorsnede» → scènes → favorieten → kamers → samenvatting → dagstrook; volgens de specificatie (ontwerptaal §7, de schets in §5) «Зараз важливо / Nu belangrijk» → scènes → favorieten → «Дім у розрізі / Huis in doorsnede» → samenvatting.
  - **Toestemmingen:** in de maquette zijn de matrix ‘actie × uitvoerder’ en het register van niveaus samengevoegd tot één tabblad «Дозволи й небезпечні дії / Toestemmingen en risicovolle acties» op het adres `/instellingen/risico`; het adres `/instellingen/toestemmingen` en een apart tabblad «Ризики / Risico's» heeft de maquette niet. De Nederlandse naam volgens de specificatie is ‘Toestemmingen en gevaarlijke acties’.
  - **Adressen:** in de maquette `/energie/zon`, `/automatiseringen/dagorde`, `/instellingen/gegevens`; volgens de specificatie `/energie/opwek`, `/automatiseringen/agenda`, `/instellingen/opslag`. Het tabblad «Агенти й погодження / Agenten en goedkeuringen» heeft het adres van de maquette, `/automatiseringen/agenten` (§4).
  - **Namen van tabbladen** (maquette — specificatie): «Стан / Stand» — «Стан / Status»; «Порядок дня / Dagorde» — «Порядок дня / Agenda»; «Калькулятор / Rekenhulp» — «Калькулятор / Planner»; «Дані / Gegevens» — «Дані й зберігання / Gegevens en opslag».
  - **Niet in de maquette:** de pagina's «Тунель і локальний шлях / Tunnel en lokale route» en «Для знавців / Expertweergave» (zone 9).

## 13. Besluiten vóór de volgende fasen

Ze blokkeren fase 0 niet; de belangrijkste eerst. Bronnen — de secties ‘Besluiten voor de eigenaar’ van de zones en plan §7.

1. **Bevestiging van de aanmelding:** eenmalig voor elke kritieke actie van een mens en voor elke keer dat ‘Altijd’ wordt aangezet voor een gevaarlijke of kritieke actie, in plaats van de huidige 5 min per sessie (`STAP_OP_MS`); andere wijzigingen van een toestemming vragen geen bevestiging van de aanmelding. Tot het besluit schrijven de dialoogvensters eerlijk «Підтвердження діє 5 хв для цього сеансу / De bevestiging geldt 5 min voor deze sessie». Vóór fase 2.
2. **Wijzigingen in de gedeelde platformcode met één goedkeuring:** de nieuwe id's `garage`, `climate`, `media`, `panel`; geneste adressen in `public/canonical-service.js`; een modus zonder omlijsting voor `/paneel/*`; de sessie ‘scherm’; de verwerker van de stroom. Vóór fase 1.
3. **Een extern alarmkanaal** (telefoongesprek, sms, berichtendienst of e-mail) en een bewaker buiten de VM van het huis — voorwaarde voor echte rookmelders en echte beveiliging. Vóór fase 9.
4. **Camera, microfoon en locatie in de browser** (`Permissions-Policy`) — daarvan hangen spraak, het gesprek met de deur, de controle van de piloot en de volger af.
5. **Privacy en bewaartermijnen:** locatie, ritsporen, clips en «Хто дивився / Wie keek mee», zichtbaarheid van acties van anderen voor bewoners, toestemming van andere volwassenen om gegevens aan een cloudmodel door te geven. Vóór fase 8.
6. **Videopad en camera-opnamen:** omzetdienst, tunnel, schijf en quotum, beeldtussenpersoon. Vóór fase 9.
7. **Een lokaal pad zonder tunnel** voor panelen; schermen zonder browser (rasteren van SVG, apparaatsleutel) — vóór fase 6.
8. **Het model van de Huisassistent** (lokaal, in de cloud of beide) en het maandbudget; de rol van kind en gast. Vóór fase 5.
9. **Niveaus:** het label `ingang` maakt poorten kritiek; de hoofdzekering wordt tot fase 12 alleen bewaakt.
10. **Gezichts- en kentekenherkenning** — niet leveren, of leveren met een toestemmingsschakelaar die standaard uit staat.
11. **Echte bronnen** (fase 12): energieleverancier, wagenpark, droneadapter, bronnen voor kaarten, vliegzones en weer.
12. **Ontwerpsysteem:** het lettertype `Inter` met cyrillisch of een systeemschreefloze; een contrastuitzondering voor nabije tinten; een proef van lampkleuren; automatische vergelijking van schermafdrukken.

**Besloten:**

- De simulator vóór echte apparaten.
- Volledige reikwijdte, met vervoer, camera's en drones.
- 13 schermprofielen.
- Visuele basis ‘Levend huis’.
- Toestemmingen: elke stand voor elke actie, standaard ‘Uit’, alleen de eigenaar wijzigt ze, een agent wijzigt geen rechten, het Logboek is verplicht.
- Na fase 0 — een pauze voor beoordeling.
- Hoger op de lijst: Garage, Automatisering en AI-agenten, Schermen.
- Een uitgave met alle bedieningsinstrumenten, zonder uitzondering.

## 14. Documenten van het pakket

| Document | Українська | Nederlands |
|---|---|---|
| Hoofddocument (dit document) | [ДИЗАЙН-ДІМ](ДИЗАЙН-ДІМ-20261110.uk.md) | [ONTWERP-HUIS](ONTWERP-HUIS-20261110.nl.md) |
| Ontwerptaal ‘Levend huis’ | [ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ](ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ-20261110.uk.md) | [ONTWERPTAAL-LEVEND-HUIS](ONTWERPTAAL-LEVEND-HUIS-20261110.nl.md) |
| Zone 1. Schil | [01-КАРКАС](zones/01-КАРКАС.uk.md) | [01-SCHIL](zones/01-SCHIL.nl.md) |
| Zone 2. Thuis en kamers | [02-ДІМ-І-КІМНАТИ](zones/02-ДІМ-І-КІМНАТИ.uk.md) | [02-THUIS-EN-KAMERS](zones/02-THUIS-EN-KAMERS.nl.md) |
| Zone 3. Apparaten | [03-ПРИСТРОЇ](zones/03-ПРИСТРОЇ.uk.md) | [03-APPARATEN](zones/03-APPARATEN.nl.md) |
| Zone 4. Energie | [04-ЕНЕРГІЯ](zones/04-ЕНЕРГІЯ.uk.md) | [04-ENERGIE](zones/04-ENERGIE.nl.md) |
| Zone 5. Beveiliging | [05-БЕЗПЕКА](zones/05-БЕЗПЕКА.uk.md) | [05-BEVEILIGING](zones/05-BEVEILIGING.nl.md) |
| Zone 6. Garage | [06-ГАРАЖ](zones/06-ГАРАЖ.uk.md) | [06-GARAGE](zones/06-GARAGE.nl.md) |
| Zone 7. Automatisering | [07-АВТОМАТИКА](zones/07-АВТОМАТИКА.uk.md) | [07-AUTOMATISERING](zones/07-AUTOMATISERING.nl.md) |
| Zone 8. Assistent en agenten | [08-ПОМІЧНИК-І-АГЕНТИ](zones/08-ПОМІЧНИК-І-АГЕНТИ.uk.md) | [08-ASSISTENT-EN-AGENTEN](zones/08-ASSISTENT-EN-AGENTEN.nl.md) |
| Zone 9. Architectuur | [09-АРХІТЕКТУРА](zones/09-АРХІТЕКТУРА.uk.md) | [09-ARCHITECTUUR](zones/09-ARCHITECTUUR.nl.md) |
| Zone 10. Ontwerpsysteem | [10-ДИЗАЙН-СИСТЕМА](zones/10-ДИЗАЙН-СИСТЕМА.uk.md) | [10-ONTWERPSYSTEEM](zones/10-ONTWERPSYSTEEM.nl.md) |
| Handleiding bij de maquette | [ЧИТАЙ](maquette/ЧИТАЙ.uk.md) | [LEESMIJ](maquette/LEESMIJ.nl.md) |
