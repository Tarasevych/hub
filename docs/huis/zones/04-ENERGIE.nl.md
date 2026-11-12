> 🌐 **Taal:** [Українська](04-ЕНЕРГІЯ.uk.md) · **Nederlands** | [Hoofddocument](../ONTWERP-HUIS-20261110.nl.md)

# Zone 4. Energie / Енергія

Taak HUIS-001 · fase 0 · 10.11.2026 · status: ter goedkeuring bij de eigenaar

Bronnen: plan HUIS-001 (§1, §3, §3.8, §4) en de [ontwerptaal ‘Живий дім / Levend huis’](../ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ-20261110.uk.md) (hierna: OT). Namen van tokens, componenten, toestanden en profielen komen uit OT; de nieuwe componenten van de zone staan in §11.

## 0. Wat er is veranderd

- **‘Levend huis’.** De pagina's staan op een stille hemel (OT §3); op de hemel staan alleen de energiezin, de datum en de huistijd en de bloktitels in `--text`. Stromen, prijzen, grafieken en tegels staan op papier `--panel`; glas is er voor de kop, de tabbladen, de onderbalk, de omhulling van het blad en Opdracht. Het verbod op glas, hemel en kleurverlopen is opgeheven; de zonne-opwek kleurt de hemel niet.
- **Toestemmingen** (plan §3.8): elke actie heeft een `hv-stand` voor elke uitvoerder, standaard ‘Uit’, en alleen de eigenaar wijzigt die. Geschrapt zijn: het onbeschikbare ‘Slim’, ‘Altijd’ pas nadat een veilige toestand is vastgelegd, ‘agenten — nee’, ‘bewoner — alleen strenger’, een termijn van 30 dagen, de verzoektermijn 21:00 en de tabel met harde verboden. De maquette toont de bevestiging van de aanmelding volgens het doel van OT §10: elke keer opnieuw; de huidige 5 min per sessie beschrijven alleen de code tot het besluit van de eigenaar (hoofddocument, §13, punt 1).
- **Opdracht van een mens:** ‘Slim’, door een mens gekozen, wordt precies zo uitgevoerd binnen diens methode, doel en tijd; toestemming voor de optimalisatie is alleen nodig buiten die grenzen (§5.3).
- **Fasen** volgen de schaal 0–12 van plan §4 (§12). **Volledigheid:** een blad voor elke energieklasse (§5.6) en de volledige set hulpmiddelen voor agenten (§6).
- **Afgestemd op OT:** `?blad=…&deel=` in plaats van `&tab=`; `hv-gevaar` opent niet via een adres; «стан припущено / toestand verondersteld»; de tekens `Gauge` en `Cloud` staan al in OT; een stippellijn in een grafiek betekent alleen ‘geschat’, dus het fasedoel is een streepje `--hv-wens` geworden en het dagplan een omtrek.

## 1. Opzet, grenzen, uiterlijk

Het eerste scherm beantwoordt zonder scrollen: waar de energie nu heen stroomt, wat ze kost en wanneer het goedkoper is, en hoeveel er vandaag is verbruikt.

- Vermogen (kW) en energie (kWh) delen geen grafiek. Gemeten: een doorgetrokken lijn van 2 px; geschat en voorspeld: een stippellijn 4/4 en ‘≈’, een voorspelling bovendien met een onzekerheidsband; verouderd: arcering `--hv-arcering` in het vrije deel van het vlak en de ouderdom.
- Het prijsniveau is een woord, het teken ‘prijstrap’ en de vorm van de staaf, geen kleur: kleur hoort alleen bij toestand en risico.
- De woorden van de rekening staan in het Oekraïens met het origineel tussen haakjes bij de eerste vermelding: взаємозалік (saldering), плата за віддачу (terugleverkosten), аванси (termijnbedragen); op ‘Contract’ en ‘Rekening’ altijd.
- Actualiteit en ‘Simulatie’ staan één keer per scherm (`hv-versheid`, `hv-sim`); op een element alleen afwijkingen. Het protocol en de verbindingsketen staan in het blad «Стан джерел / Staat van bronnen».
- **Grenzen.** Energie schrijft de bladen van laadpunt, batterij, omvormer en meter in het gedeelde register `?blad=apparaat:<id>`; in het blad van warmtepomp en boiler (zone ‘Apparaten’) voegt ze het blok «Режим роботи / Werkmodus» toe; ‘Garage’ bouwt `hv-laadplan` in de autokaart in; begrenzingen bewaart ‘Automatisering’, toestemmingen ‘Systeem’.
- **Held:** een stille hemel tot de hoogte van de held, op de telefoon ≤ ¼ van het scherm. «Речення енергії / Energiezin» volgt de regels van de huiszin (OT §11): alleen het waargenomene, verouderd in de verleden tijd («О 12:38 з мережі брали 3,0 кВт / Om 12:38 kwam er 3,0 kW van het net»), kort tot 36 tekens; daaronder papieren chips voor prijs, zon en batterij. Een doorsnede is er hier niet: de energielaag van doorsnede en plattegrond hoort bij de zone ‘Thuis’.
- **Tonen en markeringen** (OT §4, §6): import `--hv-net-in` ■, export `--hv-net-uit` □, zon `--hv-zon` ○, batterij `--hv-batterij` ◐, auto `--hv-auto` ✕, warmte `--hv-warm` —. Het teken ‘aan’: laden — `--hv-auto`, batterij — `--hv-batterij`, warmtepomp en boiler — `--hv-warm`.
- **Beweging:** stromen zijn de enige beweging uit zichzelf (streepjes 4/8, 24 px/s); bij verminderde beweging en op inkt: pijlen met getallen. De tegels van batterij, laadpunt en warmtepomp zijn 4×2 met `hv-werkmodus` en `hv-regie`; aan ‘Thuis’ levert de zone een kaart met de ring `--hv-ring`.

## 2. Adressen en kaart

De grammatica van de schil: een pagina is een pad; een blad `?blad=<soort>[:<id>]`, een tabblad `&deel=`; een dialoog `?dialoog=`; een moment `?t=`.

| Tabblad, adres | Blokken | Subpagina's (vanaf het tabblad) | Bladen, dialogen |
|---|---|---|---|
| Зараз / Nu `/energie` | zin, stromen, prijs, vandaag, fasen, ‘Nu belangrijk’, «Поради / Advies», wie stuurt, dagstrook | — | `fasen`, `bronnen`, `optimalisatie`, `verzoek:<id>`; `?dialoog=tekencontrole` |
| Тариф / Tarief `/energie/tarief` | prijsstrook 48 u, dagindeling | `/contract`, `/salderen` | `uur:<tijdstip>`, `planblok:<id>`, `tarieven` |
| Сонце й батарея / Zon en batterij `/energie/opwek` | opwek, ringen, batterij | — | `apparaat:<batterij>`, `apparaat:<omvormer>` |
| Зарядка / Laden `/energie/laden` | laadpunt, plan, auto | `/sessies` | `apparaat:<laadpunt>`; `?dialoog=laadplan-instellen` |
| Тепло / Warmte `/energie/warmte` | warmtepomp, warm water | `/gas`, `/water` | `apparaat:<warmtepomp>`, `apparaat:<boiler>` |
| Звіти / Rapporten `/energie/rapporten` | periode, bronnen, stromen, budget | `/verbruikers`, `/gewoonten`, `/rekening`, `/export` | — |

Parameters van de schil: `t`, `periode`, `datum`, `filter`, `entiteit`; van Energie: `vergelijk=vorige|jaar|geen`, `eenheid=euro|kwh|m3`, `basis=volledig|beurs` (standaard `volledig`), `stap=15|60` (60 op de telefoon, 15 vanaf `bureau`). Een tabblad zonder bron toont `hv-leeg` «Джерело не під'єднано / Bron niet gekoppeld» met de actie «Під'єднати / Koppelen».

## 3. Schermschetsen

Telefoon, ‘Nu’ (huistijd 9-11-2026, 12:40):
```
┌ glas: Energie       ▲1  ●  !1  bel 3 ┐
├ kolf Simulatie ×1 · hemel volgt tijd ┤
│ stille hemel                         │
│ Goedkoop uur: auto en batterij       │
│ laden, van het net 3,0 kW.           │
│ [▁▃ goedkoop] [○ 1,4 kW] [◐ 62 %] ›  │
├ glas: Nu · Tarief · Zon · Laden ────›┤
├ Actuele stromen, kW ─────────────────┤
│ ○ Zon 1,4 ───┐       ┌─▶ ✕ Auto 2,1  │
│ ■ Net 3,0 ───┼▶ Huis ┼─▶ Pomp 0,9    │
│ ◐ Batterij ◀─┘  3,6  └─▶ Rest 0,6    │
├ Prijs nu ────────────────────────────┤
│ € 0,21 per kWh voorbeeld · goedkoop  │
│ ▃▅▆▅▃▂▁▁┃▁▂▃▆█▇▅▃▂ ░░ morgen ≈ 13:00 │
│ Goedkoop tot 15:00, dan 02:00–05:00  │
├ Vandaag ─────────────────────────────┤
│ € 3,10 voorbeeld · 14,6 kWh          │
│ eigen 91 % · saldering nog 53 dagen ›│
├ ▸ Fasen [L1 10,1 A]  ▸ Advies [2]    │
└ glas: Thuis Kamers Energie Bev. Meer ┘ [Opdracht]
```

Computer (`bureau`), onder de glazen kop en de rij tabbladen:
```
hemel: Goedkoop uur: auto en batterij laden, van het net 3,0 kW.  ma 9-11 · 12:40
┌ Actuele stromen, kW ────────────────┬ Prijs nu ────────────────────┐
│ ○ Zon 1,4 ────┐       ┌─▶ ✕ Auto 2,1│ € 0,21 per kWh vb. · goedkoop│
│ ■ Net 3,0 ────┼▶ Huis ┼─▶ Pomp 0,9  │ ▃▅▆▅▃▂▁▁┃▁▂▃▆█▇▅ ░░░ ▂▁▁▃▅   │
│ ◐ Batterij ◀──┘  3,6  └─▶ Rest 0,6  │ tot 15:00, dan 02:00–05:00   │
├ Fasen · ┃ doel 20 A │ zekering 25 A ┼ Vandaag € 3,10 voorbeeld ────┤
│ L1 ▓▓▓▓▓▓▓▓░░░░░┃░░│ 10,1 A         │ 14,6 kWh · eigen 91 %        │
│ L2 ▓▓▓▓░░░░░░░░░┃░░│  4,7 A         ├ Wie stuurt wat ──────────────┤
│ L3 ◂▓░░░░░░░░░░░┃░░│ −1,8 A         │ Batterij · optimalis. tot 15 │
├ Nu belangrijk (1) · Advies (2) ─────┴──────────────────────────────┤
│ Optimalisatie vraagt een nachtplan · wacht tot 02:00  [Bekijken]   │
└ Dagstrook: prijs · zon · modus · makers ───────────────────────────┘
```

Blad van het laadpunt `?blad=apparaat:oprit&deel=bediening`; dezelfde `hv-laadplan` staat in de autokaart in ‘Garage’:
```
┌ glas: Laadpunt ‘Oprit’                     X ┐
│ Bediening · Geschiedenis · Instellingen      │
├ papier ──────────────────────────────────────┤
│ Werkmodus  [Pauze│✓ Slim│Snel]  (i)          │
│  (●) goedkope uren   ( ) alleen zon          │
│ Klaar om 07:30 op 80 %      [−] ━━━━┃━ [+]   │
│ ▆█▇▅▃▂▁[▁▁▁]▂▃  02:00–05:00 · 8,4 kWh        │
│ Grens laadpunt 16 A · zonder verbinding 6 A  │
│ Opdracht: Olena · goedkope uren tot 07:30    │
│ Toestemming: optim. — Vragen; Assistent — ›  │
│ [Nu laden]  + € 0,84 voorbeeld         (i)   │
└──────────────────────────────────────────────┘
Na het tikken: «Laden met 11 kW tot 80 %, ≈ 45 min; plan voor 02:00
geschrapt. [Ongedaan maken] 10 s»
```
Blad ‘Optimalisatie’ `?blad=optimalisatie` — een uitsnede van de toestemmingsmatrix (OT §10); `◉` — `Eye` (gevoelig), `△` — `Triangle` (gevaarlijk):
```
┌ glas: Оптимізація / Optimalisatie         X ┐
│ [Scènes][Automat.][✓ Optimalis.][Assistent] │
├ ▾ Gevoelig · Altijd: 1 ─────────────────────┤
│ Voor de hele groep     змішано / gemengd    │
│ ◉ Nu laden         [Uit│Vragen│✓Altijd]     │
│ ◉ Batterijmodus    [Uit│✓Vragen│Altijd]     │
├ ▾ Gevaarlijk · Altijd: 0 ───────────────────┤
│ △ gevaarlijk · Teruglevering begrenzen  [!] │
│                    [✓Uit│Vragen│Altijd]     │
│ kaders: без рамок / zonder kaders           │
│ [Optimalisatie pauzeren]   In register ›    │
└─────────────────────────────────────────────┘
```
Op de telefoon staan de naam van de actie, het niveauteken en ‘!’ op de eerste regel, het segment over de volle breedte op de tweede en de kaders als chip daaronder. Op `/paneel/*` en `tv` alleen de modus als tekst en de vaste markering.

## 4. Grafieken (`hv-grafiek`, eigen SVG)

Gemeenschappelijk (OT §9): tot 5 reeksen met een markering en een direct label; hoogte 160 px (in een blok 120); een cursor met getal, eenheid, kwaliteit en ouderdom; «Таблиця / Tabel»; dagen van 23 en 25 uur zijn als zodanig gemarkeerd; in de simulatie staat bij elk bedrag en elke prijs in euro «приклад / voorbeeld».

1. **Actuele stromen** `--stroom`: bronnen → huis → verbruikers, de dikte in vier stappen; bij smalle breedte de banden «Звідки / Waar vandaan» en «Куди / Waarheen».
2. **Saldo**: een ring en een lijn over 10 min, het getal `--hv-getal-xl` met het woord «беремо / afname» of «віддаємо / teruglevering».
3. **Fasen** `--fase`: L1–L3 vanaf nul, links teruglevering; het doel van de optimalisatie — een streepje `--hv-wens`, de hoofdzekering — een doorgetrokken lijn `--text` (ter informatie); spanning 207–253 V.
4. **Prijsstrook** `--prijs`: staven `--hv-net-in` per uur of kwartier; het goedkope venster — een ondergrond `--surface2` en een accolade met label; het duurste kwartier van de dag — een dikke streep `--text` en «дорого / duur»; een negatieve prijs — onder de as; ‘nu’ — `--accent` 2 px; morgen vóór de publicatie — arcering en «з'являться близько 13:00 / komen rond 13:00»; een voorspelling van 2–7 dagen — ‘≈’, standaard uit.
5. **Dagindeling** `--plan`: banen voor zon, batterij, auto, water en apparatuur; uitgevoerd — vulling `-zacht` met rand, gepland — omtrek zonder vulling, verzoek — omtrek, `Hourglass` en «чекає / wacht»; het teken van de maker op het blok.
6. **Prijsopbouw** `--waterval`: beurs → opslag → belasting → btw → vaste kosten → korting → teruglevering → totaal.
7. **Bronnen per uur** `--spiegel`: staven rond nul; vergelijking — ‘spook’staven als omtrek `--hv-omtrek` en de chip «+12 % до минулого тижня / t.o.v. vorige week».
8. **Stromen over een periode** `--sankey`; «невиміряне / niet gemeten» — een lijn `--faint` en het woord.
9. **Verbruikers** `--staaf`, `--boom`: de tien grootste, kamers, de boom ‘stopcontact — groep — fase’, basisverbruik.
10. **Gewoonten**: een warmtekaart 7×24 in de stappen `--hv-warmte-1…5`.
11. **Budget, zon, batterij, na saldering, laden, warmte**: voorspelling en verwachte lading — stippellijn ‘≈’; een reserveband; de ringen «Власне споживання / Eigen verbruik» en «Самозабезпечення / Zelfvoorzienend»; het jaarsaldo ‘vóór / na 1 januari 2027’; het rendementsgetal van de warmtepomp (COP); gas en water — dagstaven `--text`, het nachtelijke minimum van water als teken van een lek.

## 5. Bediening

**5.1 Werkmodus `hv-werkmodus`** — «Пауза / Pauze · Розумно / Slim · Швидко / Snel» voor laden, batterij en warm water; het tweede niveau van ‘Slim’ is de methode: «дешеві години / goedkope uren», «лише сонце / alleen zon», «мінімум + сонце / minimum + zon», voor de batterij «нуль на лічильнику / nul op de meter» en «резерв / reserve». Het woord ‘Uit’ staat hier niet, zodat de modus niet met een toestemming wordt verward. Toestanden uit OT: Н Ф Т О В Х Б; Б alleen bij ‘geen toegang’ of ‘alleen-lezen’, nooit door een toestemming.

**5.2 Laadplan `hv-laadplan`** — één component, die ‘Garage’ ongewijzigd inbouwt; toestanden «план / gepland · заряджається / laadt · готово / klaar». De eerste keer ‘Slim’ opent een stappenplan: stroomgrens van het laadpunt, gedrag zonder verbinding, vertrektijd, doel. Het stappenplan raadt aan de grens en het gedrag zonder verbinding vast te leggen, maar blokkeert niets: zonder die gegevens vertelt de toelichting ‘i’ naast ‘Slim’ wat er gebeurt als de verbinding wegvalt.

**5.3 Opdracht van een mens.** Wie ‘Slim’ kiest, draagt het apparaat over aan de optimalisatie binnen de eigen methode, het eigen doel en de eigen tijd; een plan binnen die grenzen wordt precies zo uitgevoerd (plan §1, besluit 5). De kaart toont «Доручення: Олена · дешеві години до 07:30 / Opdracht: Olena · goedkope uren tot 07:30»; de vermelding in het Logboek krijgt het teken `Gauge` en «Дозволено через / Toegestaan via: доручення людини / opdracht van een mens». Een ander apparaat, een andere modus, ontladen onder de reserve, verschuiven tot na het vertrek of een plan zonder opdracht is een zelfstandige actie onder `hv-stand`.

**5.4 Toestemmingen** (plan §3.8, OT §10, schil §7).
- Elke actie uit 5.5 heeft een `hv-stand` voor elke uitvoerder: scènes, automatiseringen, de optimalisatie en elke agent. Standaard ‘Uit’; de eigenaar kan voor elke actie elke modus kiezen. De kaders ‘termijn · kamers · uren · actiebudget’ (voor Energie ook in euro) zijn optioneel en worden alleen door de eigenaar ingesteld.
- ‘Uit’ — de uitvoerder doet niets; de schakelaar «Показувати, що зробив би / Schaduwplan tonen» tekent diens plan als omtrek, met de mogelijke besparing.
- ‘Vragen’ — `hv-verzoek` met als inhoud `hv-voorstel` (‘was → wordt’, bedrag, niveau); bij een dagplan een verzoek per blok en een gezamenlijk ‘Eén keer goedkeuren’. ‘Wacht tot’ is het begin van het eerste blok; daarna «минув / verlopen», er wordt niets uitgevoerd en er komt een vermelding in het Logboek.
- ‘Altijd’ — het teken van de maker, `hv-toost`, een vermelding in het Logboek en in `hv-meldingen` (`huis.energie`); voor een gevaarlijke en kritieke actie een vaste ‘!’ en een bevestiging van de aanmelding van de eigenaar bij het inschakelen.
- Alleen de eigenaar wijzigt dit, op een persoonlijk apparaat; anderen zien «Змінює лише власник / Alleen de eigenaar kan dit wijzigen». Een agent kan rechten verruimen noch beperken, niet de eigen en niet die van anderen. Het Logboek legt elke wijziging en elke actie vast en kan alleen worden aangevuld.
- Het blad `optimalisatie` is een uitsnede van de matrix `/instellingen/toestemmingen` met «Показати в реєстрі / In register tonen», «Призупинити оптимізатор / Optimalisatie pauzeren» (wijzigt geen modi; hervatten doet de eigenaar), doelen, voorrangsregels voor zonne-overschot en een logboek van beslissingen en besparingen.

**5.5 Actieniveaus** (regels voor `shared/huis-gevaar.ts`; het niveau bepaalt alleen het teken en het ritueel voor een mens).

| Actie | Niveau | Ritueel voor een mens |
|---|---|---|
| ‘Pauze’; terug naar het plan; stroom verlagen; reserve verhogen; stromen, prijzen en rapporten lezen | gewoon | direct |
| ‘Nu laden’, ‘Snel’; modus van batterij of water; warmte verschuiven; apparatuur starten; doel en vertrektijd; ‘Wie stuurt’; een tarief in de tarievenlijst; gedetailleerd verbruiksprofiel; export | gevoelig | ‘Ongedaan maken’ 10 s of een aftelling van 3 s |
| teruglevering begrenzen of uitschakelen; ontladen onder de reserve of naar het net; de legionellaverwarming uitschakelen; doelen, begrenzingen en de lijst «Не чіпати / Niet aankomen» wijzigen | gevaarlijk | `hv-gevaar`: gevolg in kW en euro, rail |
| een apparaat met het label `kritieke_voeding` spanningsloos maken om een fase te ontlasten | kritiek | rail en bevestiging van de aanmelding |

**5.6 Bladen per klasse** (alle hulpmiddelen): laadpunt — `hv-laadplan`, stroom, ‘1f / 3f’, sessies; batterij — modus, reserve, laden van het net, ontladen onder de reserve; omvormer — «Обмежити віддачу / Teruglevering begrenzen», uitschakelen; meter — fasen, spanning, tekencontrole, vervanging; warmtepomp en boiler — ‘Werkmodus’, warmte verschuiven, «Підігріти зараз / Nu opwarmen», legionellaverwarming; apparatuur — «Запустити в дешеву годину / In goedkoop uur starten»; gas en water — alleen lezen.

**5.7 Doelen en begrenzingen** staan in ‘Automatisering → «Обмеження / Begrenzingen»’ (`hv-begrenzing`); hier staat een uitsnede: de minimale lading van de batterij, de compressorcyclus, de legionellaverwarming en de lijst ‘Niet aankomen’ (door de eigenaar ingesteld, standaard leeg). De fasestroom is een «ціль оптимізатора / doel van de optimalisatie»: die spreidt de belasting in de tijd. Een vaste regel: «Хаб не захищає запобіжник: показ лічильника надходить раз на 1–10 с, команда йде довше. Захищають автомат у щитку й межа струму станції / De hub beveiligt de hoofdzekering niet; dat doen de groepenkast en de stroomlimiet van de laadpaal».

**5.8 Overige.** `hv-regie`: «керує: оптимізатор до 15:00 / stuurt: optimalisatie tot 15:00»; bij een conflict met de app van de fabrikant of met de leverancier — «Хто керує / Wie stuurt» (teken `Cloud`). Handmatig ingrijpen geeft een aftelling `hv-aftel` met de prijs, waarna het plan terugkeert. ‘Nu belangrijk’ en ‘Advies’ (`hv-advies`: euro per jaar en één actie) — tot drie regels. Stoppen gaat via het gedeelde «Зупинити самостійні дії / Zelfstandige acties stoppen».

## 6. Agenten

De volledige set hulpmiddelen (groep `huis` van de koppeling, fase 5), elk onder een eigen `hv-stand`, standaard ‘Uit’: stromen, fasen, prijzen, dagindeling, rapporten en het gedetailleerde profiel lezen; laden (modus, doel, ‘Nu laden’, pauze), batterij (modus, reserve, ontladen), warm water en warmtepomp, apparatuur starten, teruglevering begrenzen, ‘Wie stuurt’, doelen en begrenzingen, de tarievenlijst, export; een dagplan voorstellen. Bij ‘Vragen’ wordt een actie een `hv-verzoek`. Een hulpmiddel om toestemmingen te wijzigen bestaat niet.

## 7. Toestanden

| Toestand | Wat je ziet | Actie |
|---|---|---|
| de meter zwijgt langer dan 60 s | stromen gearceerd, getallen met ouderdom, de zin in de verleden tijd | «Що перевірити / Wat te controleren» |
| prijzen voor morgen ontbreken of zijn verouderd | arcering en ‘komen rond 13:00’; de optimalisatie verschuift niets | ‘Staat van bronnen’ |
| de balans klopt niet | ‘waarschijnlijk is het teken van de batterij omgedraaid’ | «Перевірити знак / Teken controleren» |
| de meter is vervangen | de reeksen worden na bevestiging aan elkaar gekoppeld | ‘Vervanging bevestigen’ |
| de besturing van de batterij is verloren | modus «невідомо / onbekend», niet ‘Pauze’ | ‘Wat te controleren’ |
| opdracht | ‘wacht’ tot 10 s → waarde of «не виконано / niet uitgevoerd»; zonder terugmelding ‘toestand verondersteld’ | ‘Opnieuw proberen’ |
| tarieven 90 dagen niet gecontroleerd | chip ‘tarieven gecontroleerd op 12-07’ bij de bedragen | ‘Tarieven controleren’ |
| een gat in de gegevens | arcering, schatting ‘≈’, filter «лише виміряне / alleen gemeten» | — |

## 8. Toelichtingen

Statische teksten komen uit het register van bedieningselementen, berekende uit `/api/huis/gevolg`. Een toelichting hebben `hv-werkmodus`, ‘Nu laden’, ‘Wie stuurt’, de schakelaar ‘Volledige prijs │ Beurs’ en elke `hv-stand` van een gewone en gevoelige actie; een gevaarlijke actie heeft alleen ‘!’. Op `tv` is ‘i’ een apart focuselement, op de wand een doel van 56 px, op `horloge`, `strook` en `inkt` een bevestigingsstap.
- **‘i’ naast ‘Slim’.** «Що станеться: авто заряджатиметься в найдешевші години до виїзду о 07:30; зараз зарядка зупиниться. Пов'язано з: план батареї зсунеться на 03:00, щоб не збігтися із зарядкою на L1. Як повернути: „Швидко“ на картці станції.» / «Wat er gebeurt: de auto laadt in de goedkoopste uren vóór vertrek om 07:30; het laden stopt nu. Hangt samen met: het batterijplan schuift naar 03:00 om niet samen te vallen met laden op L1. Terugdraaien: ‘Snel’ op de laadpaalkaart.»
- **‘!’ naast ‘Altijd’ voor ‘Ontladen onder de reserve’ door de optimalisatie.** «Що може статися: за відключення мережі батарея буде порожня. Пов'язано з: резерв 20 %. Як повернути: „Підняти резерв“. Хто зможе це запускати: оптимізатор. Як вимкнути: „Вимкнено“ тут чи в реєстрі або „Зупинити самостійні дії“.» / «Wat er kan gebeuren: bij een stroomstoring is de batterij leeg. Hangt samen met: reserve 20 %. Terugdraaien: ‘Reserve verhogen’. Wie dit kan starten: de optimalisatie. Uitzetten: ‘Uit’ hier of in het register, of ‘Zelfstandige acties stoppen’.»
- **Weigering.** «Чому ні: станція — лише читання. Що перевірити: доступ до керування в „Інтеграціях“. Що можна натомість: застосунок виробника.» / «Waarom niet: de laadpaal is alleen-lezen. Wat te controleren: de bedieningsrechten bij ‘Integraties’. Wat wel kan: de app van de fabrikant.»

## 9. Andere schermen en gegevens

- `strook`: tijd │ saldo │ ‘draad’ van de stromen │ prijs en goedkoop venster │ ladingen; de prijsstrook in de onderste 64 px. `horloge`: wijzerplaat ‘Energie’ — kosten van vandaag en saldo, actie ‘Laden pauzeren’. `rond`, `vierkant`: prijsniveau en de boog van de dag. `inkt`: prijsstrook van 24 u, het goedkoopste venster in een kader. `wand`, `tv`: ‘Nu’ en de prijsstrook, acties met ritueel volgens OT §7; toestemming alleen als tekst.
- Simulator ‘Demohuis · Wilgenlaan 12’: P1 voor drie fasen 3×25 A, zon 4,2 kW, batterij 10 kWh, reserve 20 %, fasedoel 20 A, laadpunt, warmtepomp, tarief voor 48 u. Scenario's: negatieve prijs, samenvallende belasting in de winter, de meter zwijgt, geen prijzen, een dag van 25 uur, vervanging van de meter, stroomstoring, 1 januari 2027.
- Stroom `POST /api/huis/stroom` (elke 250 ms), terugvalbevraging elke 30 s. Ruwe meetwaarden 14 dagen, samenvattingen per 5 min/uur/dag (een kwartier uit drie vijfminutenwaarden); de kosten volgen een momentopname van de prijs van het interval. Tarievenlijst `?blad=tarieven`: tarief, geldig vanaf, bron, ‘gecontroleerd: datum, door wie’ — bevestigd door de eigenaar.
- Externe gegevens: feestdagen en schoolvakanties bepalen het ‘soort dag’ voor vergelijkingen en de voorspelling; de zonvoorspelling komt van KNMI en Buienradar; een KNMI-waarschuwing geeft het advies «Підняти резерв батареї перед штормом / Batterijreserve verhogen vóór de storm».

## 10. Schermen met adressen

Zes tabbladen en de subpagina's uit §2; de bladen `fasen`, `bronnen`, `optimalisatie`, `verzoek:<id>`, `uur:<tijdstip>`, `planblok:<id>`, `tarieven`, `apparaat:<id>&deel=bediening|geschiedenis|instellingen`; de dialogen `tekencontrole`, `laadplan-instellen`; «Перегляд минулого / Terugblik» — `?t=`; wijzerplaten `/paneel/<profiel>/<id>`; zonder adres: `hv-gevaar` ‘Teruglevering begrenzen’ en ‘Ontladen onder de reserve’, de toestanden uit §7.

## 11. Componenten

**Uit OT:** `hv-held`, `hv-hemel`, `hv-blok`, `hv-chip`, `hv-nu`, `hv-leeg`, `hv-dagstrook`, `hv-grafiek`, `hv-tabel`, `hv-stempel` (met de toestand «оцінено / geschat» en ‘≈’), `hv-versheid`, `hv-sim`, `hv-maker`, `hv-tegel`, `hv-schakel`, `hv-schuif`, `hv-aftel`, `hv-werkmodus`, `hv-laadplan`, `hv-risico`, `hv-stand`, `hv-gevaar`, `hv-rail`, `hv-gevolg`, `hv-pincode`, `hv-toost`, `hv-bericht`, `hv-meldingen`, `hv-voorstel`, `hv-verzoek`, `hv-laag`. **Nieuw:** `hv-regie`, `hv-advies`, `hv-periode`, `hv-eenheid`, `hv-chip--prijs` («дуже дешево / heel goedkoop · дешево / goedkoop · звично / normaal · дорого / duur · дуже дорого / heel duur» met het teken ‘prijstrap’), de varianten van `hv-grafiek` `--stroom`, `--fase`, `--prijs`, `--plan`, `--waterval`, `--spiegel`, `--sankey`, `--boom`; de uitsnede `hv-begrenzing` uit ‘Automatisering’. **Aanvulling op OT:** het teken ‘prijstrap’ — een eigen SVG van 16 px uit vijf staafjes (geen punthaak: een punthaak betekent ‘uitklappen’); grafieken van gas en water met één reeks krijgen in de legenda het pictogram `Flame` of `Droplet` in plaats van een markering; de parameters `vergelijk`, `eenheid`, `basis` en `stap` komen in de parametertabel van de schil.

## 12. Gedekt en uitgesteld

| Fase | Wat uit deze zone |
|---|---|
| 0 | specificatie en maquette van alle schermen |
| 1 | energie van het demohuis, de kaart ‘Energie’ op ‘Thuis’, actuele stromen, de prijsbaan |
| 2 | bladen van laadpunt, batterij, omvormer en meter, het blok voor warmtepomp en boiler; `hv-werkmodus`, `hv-laadplan`, opdracht van een mens, `hv-stand` van alle acties, niveaus, Logboek |
| 3 | ‘Auto laden tot 80 % vóór 07:30’ in Opdracht |
| 4 | `hv-laadplan` in de autokaart |
| 5 | hulpmiddelen voor agenten, `hv-verzoek`, `hv-voorstel` |
| 6 | `strook`, `horloge`, `rond`, `vierkant`, `inkt`, `wand` |
| 7 | tarief, dagindeling, optimalisatie, rapporten, rekening, gewoonten, export |
| 8 | wie rapporten en profiel ziet, ‘Wat de agent ziet’ |
| 9 | geen wijzigingen in de zone |
| 10 | warmte en comfort samen met de klimaatpagina |
| 11 | apparatuur in het goedkope uur, herkenning van meter en omvormer, slijtage van de batterij, handmatige correctie van statistieken |
| 12 | P1, omvormers, batterijen, laadpunten, echte prijzen en KNMI, controle van de tarieven bij RVO, ACM en Belastingdienst |

**Uitgesteld:** een lamp voor het prijsniveau — fase 5 (als automatisering); echte belastingverdeling, een groepenkast die groepen uitschakelt, stekkerbatterijen en oude meters — fase 12; Matter 1.5, S2, EEBUS en bidirectioneel laden — na fase 12, zodra er apparaten voor zijn; herkenning van apparaten aan hun verbruikscurve, vergelijking met soortgelijke huishoudens en advies over de aansluitwaarde — na 12 maanden echte metingen; controle tegen de rekening in pdf, subsidies, ERE, de auto van de zaak en de terugverdientijd — na fase 12. **Buiten de schaal:** België en onbalansprijzen; het nettarief van 2029 (het besluit van de ACM is niet definitief); koolstofintensiteit (zou de prijsstrook overladen).

## 13. Besluiten voor de eigenaar

1. **Hoofdzekering.** De catalogus vraagt om dynamische stroombegrenzing; de zone beperkt dat tot het bewaken van de fasen en het doel van de optimalisatie, en verschuift echte belastingverdeling met een snel lokaal pad en zonder het woord ‘beveiliging’ naar fase 12. Akkoord?
2. **Privacy van het profiel** (fase 8): voorstel — rapporten en profiel zijn zichtbaar voor volwassen bewoners, niet voor gasten; een exportkoppeling blijft 7 dagen geldig.
3. **Het echte huis** (fase 12): soort contract en leverancier, aansluiting, aanwezigheid van zon, batterij, laadpunt en warmtepomp; en of coördinaten mogen worden doorgegeven aan externe diensten voor voorspellingen van zon en prijzen.
