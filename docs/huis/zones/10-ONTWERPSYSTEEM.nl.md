> 🌐 **Taal:** [Українська](10-ДИЗАЙН-СИСТЕМА.uk.md) · **Nederlands** | [Hoofddocument](../ONTWERP-HUIS-20261110.nl.md)

# Zone 10. Ontwerpsysteem en maquette / Дизайн-система

Taak HUIS-001 · fase 0 · 10.11.2026 · status: ter goedkeuring bij de eigenaar

Het ontwerpsysteem is de uitvoeringslaag van de ontwerptaal: een register van tokens en componentnamen, een gedeelde toestandsmatrix, de vormen van risico en ritueel, tekstsjablonen, controles bij het bouwen en een klikbare maquette. De zones zeggen wat er op het scherm staat; deze zone zegt hoe het gebouwd is, zodat dertien profielen en tien zones één taal spreken. Normatieve bronnen: plan HUIS-001 (§1 besluiten van de eigenaar, §3 ontwerp, §3.8 toestemmingen, §4 architectuur en fasen, §5.3 maquette) en de ontwerptaal ‘Живий дім / Levend huis’ (hierna: OT). Getallen voor kleuren, maten en contrast worden hier niet herhaald: die staan in de OT en in `docs/huis/maquette/stijl/hv-tokens.json`.

## 0. Wat er is veranderd ten opzichte van de vorige versie

- **‘Levend huis’ in plaats van ‘Warme precisie’.** De verboden op glas, hemel en kleurverlopen zijn opgeheven: drie lagen ‘hemel → papier → glas’, glas alleen op de kop, de navigatie, de omhulling van bladen en Opdracht; de hemel volgens de fasen van de dag, de huiszin en de doorsnede van het huis zijn onderdeel van de bibliotheek geworden (`hv-hemel`, `hv-held`, `hv-doorsnede`).
- **Geen eigen waarden.** De tabel met hexadecimale waarden uit de vorige versie is geschrapt: er is één bron, `hv-tokens.json`. De vroegere `--hv-fase-*` zijn vervangen door de onderste hemelpunten `-onder`; er zijn tokens bijgekomen voor glas, hemel, ‘gewenst’ (`--hv-wens`), regelhoogten en duur.
- **Toestemmingen volgens plan §3.8.** Geschrapt zijn: de kolom ‘hoogst toegestane stand’, de varianten A/B voor kritieke acties, ‘harde verboden’ met een onbereikbaar segment, de termijn van 30 dagen voor ‘Altijd’, de regel ‘een bewoner mag alleen strenger kiezen’ en ‘een huisstand schakelt het alarm nooit uit’. Nu zijn voor elke actie en elke uitvoerder alle drie de standen beschikbaar, standaard ‘Uit’, en de keuze ligt bij de eigenaar.
- **Fasenschaal 0–12** in plaats van 0–8; alle verwijzingen zijn omgezet.
- **Namen en adressen afgestemd op de definitieve zones:** het tabblad van een blad is `&deel=` (niet `&tab=`), een scherm is `/paneel/<profiel>/<id>` (niet `/scherm/…`), het profiel heet `klein` (niet `paneel`); de componentnamen zijn die welke de zones al gebruiken (§7).
- **Tekens en toestanden:** een mens is `User`, een fysieke knop `Hand`; de niveaus zijn `Triangle` en `Octagon` zonder uitroepteken erin; op de tegel van een gevaarlijke actie staat een vierkant teken met dubbele rand in plaats van een cirkel; de twaalfde gedeelde toestand is «виконується / bezig».
- **De maquette bestaat al:** de bronnen staan in `docs/huis/maquette/`, de bouwer is `scripts/huis-maquette.mjs`; het pakket `lucide-react` 0.469.0 in `node_modules` is gecontroleerd.

## 1. Bronnen van waarheid

| Wat | Waar het staat | Wie het wijzigt |
|---|---|---|
| waarden van kleuren, maten en duur | `hv-tokens.json` (fase 0) → `src/ontwerp/tokens.css` en `src/thema/paletten.ts` (fase 1) | deze zone via de OT |
| doel van de tokens en gebruiksregels | OT §2–§8 | OT |
| namen van `hv-*`-componenten en gedeelde toestanden | §5 en §7 van deze zone | deze zone; de zones doen voorstellen |
| actieniveau ‘mogelijkheid × richting → niveau’ | `shared/huis-gevaar.ts` (fase 2), in de maquette `kern/gevaar.js` | de zones doen voorstellen, de eigenaar keurt goed samen met de codewijziging |
| teksten, woordenlijst van toestanden en acties | `tekst.ts`, in de maquette `kern/tekst.js`; woordenlijst — OT §11 | de zones leveren de inhoud |
| adressen | grammatica van de schil (zone 1, §4) | schil |

In stijlen staan alleen `var(--…)` en klassen met `hv-`. Een nieuw token verschijnt eerst in `hv-tokens.json`, samen met de contrastparen, daarna in de OT en pas dan in de code.

## 2. Tokens en controles

| Familie | Tokens |
|---|---|
| glas | `--hv-glas`, `--hv-glas-rand`, `--hv-glas-filter`; controletoken `--hv-glas-grens` |
| hemel | `--hv-hemel-<fase>-boven/-onder/-gloed` voor `nacht`, `dageraad`, `dag`, `schemer`; werktokens `--hv-hemel-boven/-onder/-gloed`; `--hv-hemel-einde`, `--hv-hemel-neerslag`; controletoken `--hv-hemel-grens` |
| toestandstinten | `--hv-aan`, `--hv-aan-vlak`, `--hv-op-aan`, `--hv-warm`, `--hv-koud`, `--hv-zon`, `--hv-net-in`, `--hv-net-uit`, `--hv-batterij`, `--hv-auto` (met `-zacht`); ‘klasse → tint’ — OT §4 |
| lijnen en arcering | `--hv-omtrek`, `--hv-arcering`, `--hv-op-toon`, `--hv-wens`, `--hv-wens-rand`, `--hv-warmte-1…5` |
| aliassen | `--hv-rust`, `--hv-let-op`, `--hv-alarm`, `--hv-gevaar`, `--hv-sim`, `--hv-oud`, `--hv-put` — naar de bestaande `--ok`, `--warn`, `--fout`, `--info`, `--muted`, `--surface` |
| maten, tijd, lagen | `--hv-teken`, `--hv-tik`, `--hv-rij`, `--hv-kier`, `--hv-rand`, `--hv-schaal`, `--hv-getal-*`, `--hv-regel-*`, `--hv-icoon-*`; `--hv-duur-*`; `--hv-z-glas` … `--hv-z-nood` |

**Controles** (fase 1 — een uitbreiding van `scripts/kleur-contrast-controle.mjs`; tot dan doet `node scripts/huis-maquette.mjs --controle` hetzelfde): het contrast van alle paren in drie thema's; 24 hemelpunten en het doorlopen van de werkelijke mengingen; ‘of — of’-paren (de rand van het niveau, het streepje van ‘gewenst’); verboden combinaties (`--text` en `--muted` op de vulling ‘aan’, `--muted` en `--faint` op de hemel, welke tekst dan ook op arcering); afstanden tussen tinten en tussen hemelfasen; zuiverheid van het kleurverloop; een lettergrootte van minstens 12 px; namen van pictogrammen tegen `lucide-react` 0.469.

**De werktokens van de hemel** zijn geregistreerd via `@property` (`syntax: '<color>'`), zodat de wijziging eens per minuut echt vloeiend verloopt; zonder `@property` zijn het twee lagen die in elkaar overvloeien. ‘Thuis’ heeft de volledige hemel, de overige pagina's een stille hemel (zonder gloed en zonder neerslagarcering).

## 3. Lagen in de code

- **Eén wortel voor de lagen.** Het huidige `HuisLaag.tsx` zet een blad via een portaal in `document.body`, waardoor dichtheid, profiel en thema het niet bereiken. Besluit: een wortel `hv-lagen` binnen de wortel van de module voor `hv-laag`, `hv-opdracht`, `hv-oproep`, `hv-gevaar`, de bevestiging van de aanmelding, `hv-toost` en `hv-nood`, in de volgorde van `--hv-z-*`. Test: in de profielen `wand`, `tv` en `inkt` komen de berekende `--hv-tik`, `--hv-rij` en het thema van de laag overeen met de pagina.
- **Glas** — alleen `hv-kop`, `hv-onderbalk`, de omhulling van `hv-laag` en `hv-opdracht`; een getal op glas staat in een papieren chip; een dekking onder 80 % (donker thema — 84 %) is verboden; de inhoud van een blad en van Opdracht ligt op papieren blokken.
- **De effen terugvalweergave** schakelt zichzelf in: `prefers-reduced-transparency`, geen `backdrop-filter`, profiel `tv`, `prefers-contrast: more`, palet `puur`, inktthema, klasse `.is-nood`. «Полегшений вигляд / Zuinige weergave» (`.is-licht`) zet de eigenaar aan in de schermgegevens, of het paneel doet het zelf als drie opeenvolgende framemetingen langer duren dan 32 ms.
- **Inktthema** — de klasse `theme-inkt` op de wortel van `/paneel/inkt/*`, los van het algemene thema op `html`; het teken ‘aan’, de selectie en de noodlaag zijn daar omgekeerd.

## 4. Vorm, tekens, beweging

**Vorm codeert de actie.** Een cirkel schakelt (`hv-schakel`), een rechthoek leidt dieper (het lichaam van een tegel, een regel, een kaart), een dubbele rand betekent gevaar: de rail `hv-rail` in een dialoog en het **teken met ritueel** op een tegel — een vierkant `--hv-teken` met straal `--hv-straal-rail` en een rand van 2 + 2 + 2 px (`--warn` — gevaarlijke actie, `--fout-vlak` — kritieke actie). Een aanraking voert niets uit, maar opent alleen `hv-gevaar`. De vorm volgt de richting en de waargenomen toestand: een vergrendeld slot is een vierkant (‘ontgrendelen’ is kritiek), een ontgrendeld slot een cirkel (‘vergrendelen’ is gewoon); is de toestand verondersteld of verouderd, dan geldt de vorm van het hoogste van beide niveaus.

**Vier tekenalfabetten die elkaar niet overlappen** (OT §6): de maker `hv-maker` (`User`, `Hand`, `Diamond`, een eigen teken voor de AI-agent, `FlaskConical`, `Cloud`, `Gauge`, `Cpu`; 12 px, alleen naast een naam); het niveau `hv-risico` (gewoon zonder teken, `Eye`, `Triangle`, `Octagon`; altijd met een woord); grafiekmarkeringen van 8 px (vierkant, leeg vierkant, cirkel, halve cirkel, kruis, streepje); actualiteit — alleen in `hv-versheid` (punt, `RefreshCw`, `WifiOff`). Een fout en ‘niet uitgevoerd’ zijn `CircleX`, nooit ‘!’. Emoji staan nergens; in de schetsen hieronder zijn pictogrammen met woorden benoemd.

**Vasthouden** bestaat alleen op `hv-rail`: 1,2 s, in de toegankelijkheidsinstellingen 2 s; ernaast staat altijd een gelijkwaardige knop «Підтвердити / Bevestigen» met een aftelling van 3 s. Er is geen aparte railvariant voor de noodknop: die opent «Справді тривога? / Echt alarm?» met een knop met een aftelling (zone 1). Het contextmenu is de knop ‘meer’ en de rechtermuisklik, geen lang indrukken.

**Beweging.** Indrukken 120 ms, de vulling van het niveau en het getal na een handeling van een mens 200 ms, blad en Opdracht 280 ms, inzoomen op de plattegrond 480 ms. De omtrek van een tegel pulseert met 0,8 Hz, alleen zolang ‘wacht’ duurt. De hemel verandert eens per minuut, lineair en onopvallend. De enige beweging uit zichzelf zijn de streepjes van de energiestromen, 24 px/s; op een verborgen tabblad staan ze stil. Bij beperkte beweging en inkt: alles direct, stromen worden pijlen met getallen, wachten wordt een stilstaande stippellijn en `Hourglass`, de rail een aftelling in cijfers. Het aankondigingsgebied `hv-aankondiging` spreekt niet vaker dan eens per 5 s; een alarm direct.

## 5. Toestandsmatrix

Twaalf gedeelde toestanden (OT §9); een zone voegt alleen woorden toe, geen nieuwe weergaven.

| Toestand | Weergave | Opmaak |
|---|---|---|
| С rust | `--panel`, rand 1 px `--line` | — |
| Н aanwijzen | `--surface`, alleen bij `@media (hover: hover)` | — |
| Ф focus | ring `--focus` 2 px, afstand 2 (`tv` — 3 en 4) | `:focus-visible` |
| Т indrukken | `--surface2` 120 ms; de actie volgt bij loslaten, verschuiven annuleert | `:active` |
| О wacht | pulserende stippellijn 6/4; «очікує / wacht»; tot 10 s | `aria-busy` |
| Р bezig | klassen met een looptijd: doorgetrokken omtrek, het woord voor de richting en een percentage; de termijn komt uit het manifest van de adapter (gordijnen 60 s, poort 90 s, klep 30 s, slot 15 s) | `aria-valuetext` |
| В niet uitgevoerd | waargenomen waarde, omtrek 2 px `--fout`, `CircleX`, «Не виконано / Niet uitgevoerd»; aanraken toont de reden van de weigering; 60 s of tot de volgende actie | `role="status"` |
| З verouderd | waarde `--muted`, ouderdom vet; arcering `--hv-arcering` alleen in het vrije deel van het vlak | `.is-verouderd` |
| Х onbereikbaar | onderbroken stippellijn 12/6, `Unplug`; in plaats van bediening «Що перевірити / Wat te controleren» | `.is-onbereikbaar` |
| П toestand verondersteld | de ring van het teken gestippeld 2/3 en de woorden «стан припущено / toestand verondersteld» | — |
| М simulatie | chip `hv-sim` eenmaal per scherm; de kolf op een element — alleen in een gemengd huis | `data-hv-sim` |
| Б geblokkeerd | `--muted`, `Lock`, reden: «немає доступу / geen toegang» (rol) of «лише читання / alleen-lezen» (bron); zonder doorzichtigheid | `aria-disabled`, de focus blijft |

- **Levensloop van een opdracht:** ‘wacht’ → bij klassen met een looptijd ‘bezig’ → waargenomen waarde of ‘niet uitgevoerd’; een apparaat zonder terugkoppeling — ‘toestand verondersteld’. Er is geen wachtrij voor opdrachten: zonder netwerk is de laatste momentopname te zien met de aanduiding ‘alleen bekijken’.
- **Б ontstaat nooit door het risiconiveau of de toestemmingsstand:** de eigenaar voert een actie altijd uit met het ritueel van haar niveau. Daarom wordt de regel `.hv button:disabled { opacity: .55 }` geschrapt.
- Actualiteit en simulatie worden eenmaal per scherm getoond; op een element alleen een afwijking. Het stempel `hv-stempel`: waarde · ouderdom · bron; protocol, maker en verbindingsketen staan in de uitklapweergave.

## 6. Toestemmingen, risico en ritueel

Het niveau van een actie bepaalt alleen het teken en het ritueel van de **mens**; het beperkt de toestemmingen van uitvoerders niet.

| Niveau | Teken | Ritueel van de mens |
|---|---|---|
| звичайна / gewoon | — | direct; bij een groepsactie «Повернути / Ongedaan maken» 10 s |
| чутлива / gevoelig | `Eye` | direct en ‘Ongedaan maken’ 10 s; waar terugdraaien onmogelijk is — een knop met een aftelling van 3 s |
| небезпечна / gevaarlijk | `Triangle`, `--warn` | `hv-gevaar`: een zin over het gevolg en de rail |
| критична / kritiek | `Octagon`, `--fout` | rail en bevestiging van de aanmelding |

**`hv-stand` — «Дозвіл / Toestemming»:** segmenten «Вимкнено / Uit · Питати / Vragen · Завжди / Altijd» met hoogte `--hv-tik` en een breedte die de inhoud volgt; het gekozen segment — `--surface2`, omtrek 2 px `--text`, `Check`.
1. Staat bij **elke** actie afzonderlijk, voor elke uitvoerder: scène, automatisering, optimalisator, elke agent. Standaard ‘Uit’.
2. De eigenaar heeft voor elke actie alle drie de standen tot zijn beschikking — ook voor het ontgrendelen van de deur, het uitschakelen van het alarm, de poort, het gas en het opstijgen van een drone. Er zijn geen plafonds, geen verplichte termijnen en geen onbereikbare segmenten. De kaders «строк / termijn · кімнати / kamers · години / uren · бюджет дій / actiebudget» zijn optioneel en worden alleen door de eigenaar ingesteld; zonder kaders staat er de chip «без рамок / zonder kaders».
3. Alleen de eigenaar zet een stand aan of uit, op een persoonlijk apparaat; ‘Altijd’ voor een gevaarlijke of kritieke actie vraagt om een bevestiging van de aanmelding op het platform — een controle dat het echt de eigenaar is die de wijziging doet, geen beperking van de keuze. Op `/paneel/*` en `tv` alleen de stand als tekst met een aanduiding; andere rollen zien «Змінює лише власник / Alleen de eigenaar kan dit wijzigen» met een slot.
4. Een agent kan rechten niet uitbreiden of inperken — niet de eigen en niet die van anderen: daar is geen bedieningselement en geen gereedschap voor.
5. Elke wijziging van een toestemming en elke actie die erop steunt is een `hv-bericht`-regel «Хто · Що · Чому · Було → стало · Дозволено через / Wie · Wat · Waarom · Was → werd · Toegestaan via» in het Logboek en in `hv-meldingen`; de audit kan alleen worden aangevuld en niemand kan hem uitschakelen.
6. ‘Vragen’ maakt een `hv-verzoek` aan voor wie de regel heeft ingeschakeld; het systeem legt er geen eigen termijn op.
7. Tien toestanden: de drie standen; «чекає підтвердження входу / wacht op aanmelding»; «збережено / opgeslagen»; «не збережено / niet opgeslagen»; «лише перегляд / alleen bekijken»; «змішано / gemengd»; «призупинено / gepauzeerd»; «строк минув / termijn verlopen». Een toestand ‘onbereikbaar segment’ bestaat niet.

**Het teken ‘!’** heeft twee betekenissen: de uitlegknop met vijf risicoregels naast de `hv-stand` van een gevaarlijke en een kritieke actie, en een blijvende aanduiding zolang ‘Altijd’ geldt — een gevulde driehoek `--warn-vlak` of achthoek `--fout-vlak` van 24 px op de plaats van de knop, in de hoek van de tegel en in de kop als ‘! N’ (leidt naar `/instellingen/risico`); wegklikken kan niet.

**De matrix ‘actie × uitvoerder’** — `hv-matrix` op `/instellingen/toestemmingen`: filterpillen voor de uitvoerders; vanaf `bureau` een tabel waarin een cel `hv-stand` openklapt; groepen `hv-blok` per niveau en klasse met de teller ‘Altijd: N’; een groepsbediening «Для всієї групи / Voor de hele groep» met de toestand ‘gemengd’; elke wijziging is een afzonderlijke regel per actie.

**De pauze** «Зупинити самостійні дії / Zelfstandige acties stoppen» verandert de standen niet; alleen de eigenaar heft haar op. **Poorten van weigering:** bron → rol → voor de uitvoerder: pauze → stand → kaders van de eigenaar; een weigering noemt de poort. **Een huisstand** is een reeks stappen; een alarmstap, als de eigenaar die heeft toegevoegd, heeft een eigen `hv-stand`. **Bevestiging van de aanmelding:** zolang de huidige code 5 min per sessie geeft (`STAP_OP_MS`), schrijft de maquette «Підтвердження діє 5 хв для цього сеансу / Bevestiging geldt 5 min voor deze sessie».

## 7. Componentenregister

- **Basis:** `hv-hemel`, `hv-held`, `hv-doorsnede`, `hv-tegel` (1×1 ‘teken’, 2×1 ‘regel’, 2×2 ‘instrument’, 4×2 ‘blok’; de vorm volgt de inhoud), `hv-kamerkaart`, `hv-telemetrie`, `hv-lagen`, `hv-laag`, `hv-blok`, `hv-chip`, `hv-nu`, `hv-leeg`, `hv-skelet`; componenten van de schil — zone 1, §16.
- **Tijd en gegevens:** `hv-dagstrook`, `hv-grafiek`, `hv-tabel`, `hv-plan`, `hv-landkaart`, `hv-stempel`, `hv-versheid`, `hv-sim`, `hv-maker`, `hv-waarom`.
- **Bediening:** `hv-schakel` en het teken met ritueel, `hv-schuif`, `hv-stapper`, `hv-segment`, `hv-wijzer`, `hv-kleur` («Заготовки / Voorkeuzes · Повзунки / Schuifregelaars · Коло / Kleurenwiel»), `hv-aftel`, `hv-werkmodus`, `hv-laadplan`, `hv-scene`, `hv-huisstand`, `hv-alarmstand`, `hv-weekrooster`, `hv-speler`, `hv-regie`.
- **Risico en toestemmingen:** `hv-risico`, `hv-stand`, `hv-matrix`, `hv-gevaar`, `hv-rail`, `hv-gevolg`, `hv-nood`, `hv-pincode`, `hv-begrenzing`.
- **Activiteit en AI:** `hv-toost`, `hv-bericht`, `hv-meldingen`, `hv-opdracht`, `hv-voorstel`, `hv-wasword`, `hv-verzoek`, `hv-agentkaart`, `hv-agentstappen`, `hv-gereedschaplijst`, `hv-regel`, `hv-verloop`, `hv-gids`, `hv-vluchtbalk`, `hv-oproep`, `hv-onderhoud`, `hv-apparaatstoring`.

**Afstemming van namen.** De vorige versie koos `hv-keuzebalk`, `hv-versheid__keten`, `hv-uitvoering`, `hv-live`, `hv-storing`; de definitieve zones gebruiken al `hv-selectiebalk`, `hv-verbindingsketen`, `hv-agentstappen`, `hv-aankondiging`, `hv-apparaatstoring` — het register neemt die over. Dubbelingen zijn geschrapt: `hv-meldcentrum` → `hv-meldingen`, `hv-gevaarniveau` → `hv-risico`, `hv-scenetegel` → `hv-tegel--scene`, `hv-grens` → een deelweergave van `hv-begrenzing`, `hv-demo-label` → `hv-sim`.

**Opbouw van de gedeelde componenten van de zones.** `hv-regie` — de regel «Керує зараз: … до … / Stuurt nu: … tot …» met de maker en de actie «Повернути автоматику / Automatiek hervatten». `hv-onderhoud` — de regel ‘wat · termijn of resterend · actie’, drempel voor de batterij 15 %; gedeeld door Garage en Logboek. `hv-matrix` — een tabel met een knopcel van `--hv-tik`; varianten ‘actie × uitvoerder’, ‘automatisering × stand’, rollen. `hv-begrenzing` — de opslag van beperkingen die de eigenaar instelt (boiler ≤ 65 °C); Energie toont een deelweergave.

## 8. Teksten

De sjablonen zijn `gevolgTekst`, `risicoTekst` en `weigerTekst` in `tekst.ts`; de zones leveren alleen de inhoud. Aanhalingstekens «…» in het Oekraïens, ‘…’ in het Nederlands; in het Oekraïens met de beleefdheidsvorm ‘ви’, in het Nederlands met `je`; meervoud via `meervoud()` op basis van `Intl.PluralRules`.

| Sjabloon | In het Oekraïens | In het Nederlands |
|---|---|---|
| gevolg ‘i’, ‘Alle lampen uit’ | Що станеться: вимкнуться 7 ламп у 4 кімнатах; 2 недоступні пропущено. Пов'язано з: сцена «Вечір» перестане діяти. Як повернути: «Повернути» протягом 10 с, далі — у записі Журналу. | Wat er gebeurt: 7 lampen in 4 kamers gaan uit; 2 niet-bereikbare worden overgeslagen. Hangt samen met: scène ‘Avond’ is niet meer actief. Terugdraaien: ‘Ongedaan maken’ binnen 10 s, daarna in het logboek. |
| gevolg, stand ‘Afwezig’ | Що станеться: вимкнуться світло й медіа, клімат перейде на 17 °C. Пов'язано з: крок «Охорона: периметр» стоїть на «Питати» — дім спитає вас. Як повернути: оберіть «Вдома». | Wat er gebeurt: licht en media gaan uit, het klimaat gaat naar 17 °C. Hangt samen met: de stap ‘Alarm: schil’ staat op ‘Vragen’ — het huis vraagt het je. Terugdraaien: kies ‘Thuis’. |
| risico ‘!’, ‘Altijd’ voor de poort | Що може статися: ворота відчиняться, коли вдома нікого немає. Пов'язано з: охорона периметра. Як повернути: «Зачинити». Хто зможе це запускати: автоматизація «Приїзд», без запиту. Як вимкнути: оберіть тут «Питати» або «Вимкнено». | Wat er kan gebeuren: de poort gaat open terwijl niemand thuis is. Hangt samen met: alarm schil. Terugdraaien: ‘Sluiten’. Wie dit kan starten: automatisering ‘Aankomst’, zonder te vragen. Uitzetten: kies hier ‘Vragen’ of ‘Uit’. |
| weigering, ‘niet uitgevoerd’ | Чому ні: штора зупинилася на 40 % і не завершила хід за 60 с. Що перевірити: чи ніщо не заважає полотну й чи є живлення. Що можна натомість: повторити. | Waarom niet: het gordijn stopte op 40 % en was na 60 s niet klaar. Wat te controleren: of niets het doek hindert en of er stroom is. Wat wel kan: opnieuw proberen. |

- **Een hulptekst hebben:** de `hv-stand` van een gewone en een gevoelige actie, elke gevoelige actie, huisstanden en alarmstanden, scènes, groepsacties en de schakelaars van Systeem; één ‘i’ per blokkop. Een gevaarlijke en een kritieke actie hebben één knop ‘!’ in plaats van ‘i’. Op `tv` is ‘i’ een apart focuselement; op `horloge`, `strook` en `inkt` een bevestigingsstap.
- **Bronnen:** vaste teksten — `shared/hulp-register.ts` op de identificatie van het bedieningselement; berekende teksten — `/api/huis/gevolg` (dezelfde proefuitvoering als in `hv-opdracht` en `hv-gevaar`); basis — het huidige `HulpVraag`. De bouwcontrole (`scripts/hulp-vraagtekens-controle.mjs`) zoekt bedieningselementen zonder hulptekst, teksten die het knoplabel herhalen en gevaarlijke acties zonder `gevolg` en `risico`.

## 9. Schetsen

Telefoon 390 px, ‘Thuis’ (`/overzicht`); (●) — cirkel ‘aan’, (○) — ‘uit’, [▣] — teken met ritueel:
```
┌ glas · kop 48 ───────────────────────┐
│ (Avond · 17:42)  [▲2] [●] [!1] [bel3]│
│ kolf ×60 · hemel volgt huistijd      │
└──────────────────────────────────────┘
  hemel: Thuis is het warm. De garagepoort
  staat 12 min open. [Avond ▾] [Alarm: uit]
┌ papier · Nu belangrijk · 2 ──────────┐
│ ▲ Poort 12 min open [Sluiten]        │
│ agent: auto laden om 02:00           │
│ [Eén keer goedkeuren] [Afwijzen]     │
├ Favorieten ──────────────────────────┤
│ (●) Vloerlamp · 60 % · 2 min [−]━○[+]│
│ (○) Keuken    [▣] Voordeur: op slot  │
└──────────────────────────────────────┘
  Huis in doorsnede · 4 ramen verlicht
┌ Thuis Kamers Energie Beveiliging Meer┐
└ glas ────────────────── [Opdracht] ──┘
```
Computer, kamer met een blad (`/kamers/woonkamer?blad=apparaat:torsher&deel=bediening`):
```
┌ glas ─ Thuis Kamers Energie Beveiliging Garage Automatisering ┐
│ [Thuis▾]  [Opdracht]  ×60  ● live  !1  bel 3  tandwiel        │
└───────────────────────────────────────────────────────────────┘
  stille hemel · Woonkamer       ┌ glas · blad 400 ───────────┐
┌ papier · Licht · 3 ─── i ┐     │ Vloerlamp              [X] │
│ (●) Vloerl. │ (○) Plafond│     │ Bediening·Gesch.·Instell.  │
│ 60 % · 2 min│ ┄ wacht ┄  │     │ (●) aan · 60 %             │
│ [−]━━○──[+] │            │     │ Voorkeuzes·Schuifr.·Wiel   │
└──────────────────────────┘     │ 2 min · kolf Simulator     │
                                 └────────────────────────────┘
```
`hv-stand` op de telefoon (`/instellingen/toestemmingen`, uitvoerder — de agent «Помічник / Assistent»):
```
│ Voordeur ontgrendelen [! achthoek] kritiek        │
│ [ Uit ] [ Vragen ] [✓ Altijd ]  tot 01.12         │
│ Voordeur vergrendelen             gewoon     [i]  │
│ [✓ Uit ] [ Vragen ] [ Altijd ]  zonder kaders     │
```

## 10. Klikbare maquette

- **Bouwen:** `node scripts/huis-maquette.mjs` neemt `stijl/`, `gegevens/`, `kern/`, `schermen/` en `volgorde.json` uit `docs/huis/maquette/` en levert één zelfstandig `huis-maquette.html`: kleuren alleen uit `hv-tokens.json`, pictogrammen als ingebouwde contouren van `lucide-react` 0.469. `--controle` — controles zonder browser, `--artefact` — een variant voor een privéweergavepagina. Handleiding — `ЧИТАЙ.uk.md` / `LEESMIJ.nl.md`.
- **Minisimulator** met een vaste beginwaarde: elke actie loopt via `HV.doe()` met de poorten ‘verbinding → bereikbaarheid → rol → ritueel → toestemming van de uitvoerder’ en laat een Logboekregel met het teken van de maker en een melding achter. `HV.gevaar.zetStand()` werkt alleen voor de rol ‘eigenaar’; voor een agent bestaat zo'n functie niet.
- **Bedieningspaneel buiten het tekenvlak:** thema (licht, donker, inkt), palet, taal, 13 profielen in werkelijke pixels, dichtheid, rol, toestand van de gegevens (live, verouderd, geen verbinding), 15 scenario's uit plan §5.3, snelheid ×1 / ×10 / ×60 / ×600. Het demohuis is ‘Wilgenlaan 12’ (plan §3.7), bedragen in euro met het woord ‘voorbeeld’.
- **In de verbeterronde in lijn brengen met de OT:** ‘Opdracht’ op de telefoon is een vierkant van 56 px boven de onderbalk, niet het middelste item ervan; de adressen `/energie/zon`, `/automatiseringen/dagorde`, `/automatiseringen/agenten` → `/energie/opwek`, `/automatiseringen/agenda`, `/assistent/agenten`.
- **Acceptatie** (plan §6): afmetingen van 200×200 tot 2560×1080, drie thema's, twee talen; geen horizontaal scrollen en geen afgekapte waarden; tekst ≥ 12 px; doelen ≥ 44 px; volledig met het toetsenbord te doorlopen; elk bedieningsblad verandert de toestand en laat een regel achter; `hv-stand` schakelt alle drie de standen voor een kritieke actie en toont ‘!’.

## 11. Schermen met adressen

**Klikbaar (plan §5.3):** alle secties en tabbladen — `/overzicht`; `/kamers`, `/kamers/<kamer>`, `/kamers/plattegrond`, `/apparaten`, `/klimaat`, `/media`; `/energie` (`/tarief`, `/opwek`, `/laden`, `/warmte`, `/rapporten`); `/beveiliging` (`/cameras`, `/toegang`, `/sensoren`); `/garage` (`/voertuigen`, `/drones`, `/robots`, `/kaart`) en de cabine `/garage/drones/<id>/vlucht`; `/automatiseringen`, `/scenes`, `/automatiseringen/agenda`, `/assistent`, `/assistent/agenten/<agent>` met de volledige lijst van gereedschappen; `/activiteit` (`/geschiedenis`, `/onderhoud`, `/regels`); `/instellingen/…`, waaronder `/risico`, `/toestemmingen`, `/simulator` en «Складники / Onderdelen» `/onderdelen` (component × toestand × thema, controlegetal van de tokens). Het bedieningsblad van **elk** apparaattype — `?blad=apparaat:<id>&deel=bediening|geschiedenis|instellingen`; verder `?blad=meldingen|status|verbinding|huisstand|alarm`, `?dialoog=opdracht|start|koppelen|voorvlucht`, `?t=`, `/paneel/<profiel>/demo`. Zonder adres: `hv-gevaar`, de bevestiging van de aanmelding, `hv-nood`, `hv-oproep`, `hv-pincode`.

**Schets met het stempel «пізніше / later»:** de plattegrondeditor, cameramaskers, de stappenplannen voor het koppelen van bronnen.

## 12. Gedekt en uitgesteld

**Fase 0:** specificatie, `hv-tokens.json`, maquette van alle schermen uit §11, ‘Onderdelen’, statische controles.
- **1** — tokens in `tokens.css` en `paletten.ts`, `@property`, controles van contrast en hemel, `hv-lagen`, `theme-inkt`, basis, `hv-dagstrook`;
- **2** — het teken met ritueel, `hv-stand`, `hv-matrix`, `hv-gevaar`, `hv-rail`, `hv-gevolg`, bedieningsbladen voor alle klassen, `hv-toost` via `emitCanonicalNotice`, `hv-meldingen`, `hv-nood`, controle van de hulpteksten;
- **3** — `hv-opdracht`; **4** — `hv-telemetrie`, `hv-vluchtbalk`, `hv-landkaart`, eigen pictogrammen voor vervoer;
- **5** — `hv-verzoek`, `hv-voorstel`, `hv-agentkaart`, `hv-agentstappen`, `hv-gereedschaplijst`, `hv-regel`, `hv-verloop`, `hv-gids`;
- **6** — 13 profielen, wijzerplaten, `zoom` voor `tv`, controle van het teken ‘aan’ op drie meter afstand op een echt paneel;
- **7** — `hv-grafiek` volledig, `hv-tabel`, `hv-laadplan`, «Перегляд минулого / Terugblik»; **8** — toestanden van rollen; **9** — `hv-oproep`, camerabeelden en cameramaskers;
- **10** — `hv-weekrooster`, `hv-speler`; **11** — `hv-onderhoud`, `hv-apparaatstoring`; **12** — merklogo's alleen met echte adapters (HomeWizard, Matter, Zigbee — naar `src/merk/`).

**Buiten de schaal:** geluid en trillingsterugkoppeling, spraak, automatische vergelijking van schermafdrukken.

## 13. Besluiten voor de eigenaar

1. **Bevestiging van de aanmelding:** 5 min per sessie behouden of eenmalig maken voor elke kritieke actie (plan §7).
2. **Contrast van tinten:** de uitzondering ‘onderling contrast lager dan 1,3’ voor een deel van de tintparen aanvaarden of het criterium beperken tot `ΔE2000` (OT §4); aan de waarden verandert dat niets.
3. **Lettertype:** de systeemschreefloze behouden of een deelverzameling van `Inter` met cyrillisch tegelijk in het product en de maquette inbouwen (plan §7).
4. **Nieuwe afhankelijkheden:** automatische vergelijking van schermafdrukken; de ICU-bibliotheek, als `meervoud()` tekortschiet.
5. **‘Onderdelen’:** alleen in de maquette of ook in het product onder «Для знавців / Expertweergave».
6. **Tekstgrootte voor de bewoner** 100 / 115 / 130 %: alleen voor huis of voor het hele platform.
7. **Kleurstaal van een lamp** op de tegel — een uitzondering op de regel ‘kleur alleen voor toestand en risico’ (ook zone 3).
