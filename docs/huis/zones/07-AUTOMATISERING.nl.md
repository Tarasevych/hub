> 🌐 **Taal:** [Українська](07-АВТОМАТИКА.uk.md) · **Nederlands** | [Hoofddocument](../ONTWERP-HUIS-20261110.nl.md)

# Zone 7. Automatisering, scènes, standen en Logboek / Автоматика

Taak HUIS-001 · fase 0 · 10.11.2026 · status: ter goedkeuring bij de eigenaar

Bronnen: plan HUIS-001 (§1, §3, §3.8, §4) en de [ontwerptaal ‘Живий дім / Levend huis’](../ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ-20261110.uk.md) (hierna: OT). Namen van tokens, componenten, toestanden en profielen komen uit OT; wat nieuw is, staat in §16.

## 0. Wat er is veranderd

- **‘Levend huis’.** De pagina's van de zone staan op een stille hemel (OT §3); op de hemel staan alleen de zin van de zone, de datum en de huistijd en de bloktitels in `--text`. Regels, stappen, scènes en vermeldingen staan op papier `--panel`; glas is er voor de kop, de subtabbladen, de onderbalk, de omhulling van de bladen en Opdracht. Het verbod van ‘Warme precisie’ op glas, hemel en kleurverlopen is opgeheven.
- **Toestemmingen** (plan §3.8): elke actie van de zone heeft een `hv-stand` voor scènes, automatiseringen, de optimalisator en elke agent; standaard ‘Uit’; de eigenaar kan elke stand kiezen. Geschrapt zijn: ‘een stand schakelt het alarm nooit uit en ontgrendelt nooit’, ‘een bewoner alleen in strengere richting’, ‘„Altijd” alleen tegen de simulator’, harde verboden, ‘niemand’ voor het dempen van een rookmelding en de verplichte verzoektermijn van 10 min.
- **Namen uit OT:** `hv-risico` in plaats van `hv-gevaarniveau`, `hv-meldingen` in plaats van `hv-meldcentrum`, `hv-scene` en `hv-tegel--scene` in plaats van `hv-scenetegel`, `&deel=` in plaats van `&tab=`, ‘!’ — vijf regels, «до відома / ter informatie», de toestand «виконується / bezig».
- **Fasen** volgen de schaal 0–12 van plan §4.

## 1. Opzet en grenzen

De zone beantwoordt de vraag ‘wat doet het huis vanzelf, waarom en namens wie’. Het onderdeel ‘Automatisering’ (`automations`): automatiseringen, recepten, reeksen, begrenzingen, de agenda en «Сцени й режими / Scènes en standen». Het onderdeel ‘Logboek’ (`activity`): meldingen, geschiedenis, onderhoud en bezorgregels. Agenten en de wachtrij ‘Wacht op jou’ horen bij de zone ‘AI en agenten’; hier staan hun acties, hun wijzigingen in regels en hun verzoeken. De motor `backend/huis/motor.ts` handelt namens de persoon die de regel heeft aangezet en omzeilt RLS niet.

## 2. Weergave

- **Held** op de stille hemel — een zin met alleen waargenomen feiten: «Діють 12 правил; одне працює неповно. О 22:30 — сцена „Ніч“. / 12 regels actief; één werkt deels. Om 22:30 — scène ‘Nacht’.» De tellers staan in papieren `hv-chip` eronder. Op de telefoon beslaat de held ≤ ¼ van het scherm en krimpt hij tot een regel in de kop.
- **Papier:** `hv-regel` (`--hv-rij`), de stapkaart, scènetegels, `hv-bericht`, `hv-verzoek`, `hv-gevaar`. Blokken zijn `hv-blok`; een leeg blok verdwijnt samen met zijn titel, alleen de pagina heeft `hv-leeg`.
- **Glas:** de bladen van stap, stand en ‘Waarom?’, het meldingencentrum, Opdracht; de inhoud van een blad bestaat uit papieren blokken.
- **Vorm:** een cirkel zet een regel aan of start een scène, een rechthoek leidt dieper; een gevaarlijke of kritieke actie in de huidige richting heeft een teken met ritueel (een vierkant met dubbele rand `--warn` / `--fout-vlak`); aanraken opent `hv-gevaar`.
- **Makers** `hv-maker`: automatisering `Diamond`, agent — een vierkant met een afgesneden hoek, optimalisator `Gauge`, fysieke knop `Hand`, mens `User`, systeem `Cpu`. Een scène heeft geen teken: in `hv-bericht` staat «через сцену „Вечір“ / via scène ‘Avond’».

## 3. Adressen

Blad — `?blad=<soort>:<id>&deel=`; dialoog — `?dialoog=`; moment — `?t=`; `van`, `tot`, `entiteit`, `filter`. Dienstwoorden (`bewerken`, `proef`, `verloop`, `versies`, `recepten`, `reeksen`, `agenda`, `feestdagen`, `begrenzingen`, `standen`, `dagdeel`, `nieuw`) zijn nooit identificatoren.

| Tabblad | Adres |
|---|---|
| Автоматизації / Automatiseringen | `/automatiseringen`, `…/<id>`, `…/<id>/bewerken`, `/proef`, `/verloop[/<run>]`, `/versies` |
| Рецепти / Recepten · Послідовності / Reeksen | `/automatiseringen/recepten[/<recept>]`, `…/reeksen[/<id>]` |
| Обмеження / Begrenzingen | `/automatiseringen/begrenzingen` |
| Порядок дня / Agenda | `/automatiseringen/agenda[/feestdagen]` — zonder nieuwe id: `agenda` heeft de kalender van de Hub |
| Сцени й режими / Scènes en standen | `/scenes`, `/scenes/<id>`, `/scenes/dagdeel`, `/scenes/standen[/<stand>]` |
| Журнал / Logboek: Сповіщення / Meldingen · Історія / Geschiedenis · Обслуговування / Onderhoud · Правила / Regels | `/activiteit`, `…/geschiedenis[/grafieken\|/tabel]`, `…/onderhoud` (was `…/aandacht`, met doorverwijzing), `…/regels` |

Dialogen en bladen: `?dialoog=nieuw`, `conflict`, `starten`, `vertrek`, `corrigeren`; `?blad=stap:<n>`, `waarom:<vermelding>`, `huisstand`, `meldingen`, `apparaat:<id>&deel=gebruik`.

## 4. Lijst `/automatiseringen`

Blokken (lege verdwijnen): «Зараз виконується / Loopt nu» met «Зупинити / Stoppen» → «Несправні / Met problemen» → «Пропозиції / Voorstellen» (concepten van agenten en gewoonten met bewijs, hooguit drie) → alle regels.

**Rij `hv-regel`:** een cirkel ‘aan / uit’ of een teken met ritueel (§10); een navertellende zin `hv-zin`; de laatste uitvoering met haar ouderdom; het teken van de maker; `hv-risico` van de hoogste stap met een woord; een toestandschip; een blijvende ‘!’ als een stap op ‘Altijd’ staat voor een gevaarlijke of kritieke actie.

**Toestand:** het pad uit OT «Чернетка / Concept · Спостереження / Meekijken · Увімкнено / Aan» (`simulatie` in de database wordt `meekijken`, fase 5). Een ingeschakelde regel heeft de chip `hv-chip--logica`: «працює / actief» · «призупинено до 07:00 · Олена / gepauzeerd tot 07:00 · Olena» · «працює неповно / werkt deels» met de reden · «на карантині / in quarantaine» (drie storingen op rij of een lus). Een uitgeschakelde cirkel: «вимкнено / uit».

**Filters:** kamer, toestand, maker, niveau, ‘namens wie’, ‘staat op „Altijd”’. Groepsactie «Призупинити до… / Pauzeren tot…». De algemene stop — «Зупинити самостійні дії / Zelfstandige acties stoppen» — staat in Opdracht, in de noodlaag en in Systeem. Een lege pagina toont `hv-leeg` «Тут з'являться правила дому / Hier verschijnen de regels van het huis» met de actie «Вибрати рецепт / Recept kiezen».

```
TELEFOON · /automatiseringen
[glas] Automatisering    ● live  ! 1  bel 3
 stille hemel: 12 regels actief; één werkt deels.
 [12 actief] [1 deels]
┌ Loopt nu · 1
│ ◆ Ochtend · stap 3 van 5 · gordijnen 40 % open
│                                     [Stoppen]
┌ Met problemen · 1
│ (●) Nachtlicht ◆ werkt deels: lamp onbereikbaar   ›
┌ Alle regels                     [Filter] [+ Nieuw]
│ (●) Tuin sproeien ◆ actief · 06:00                ›
│ [▣] ! Evacuatie bij rook ◆ kritiek · Altijd       ›
│ ( ) Koffie om 7:00 ◆ uit                          ›
[glas] Thuis · Kamers · Energie · Beveil. · Meer [Opdracht]
```

## 5. Editor «Коли / Якщо / Тоді — Wanneer / Als / Dan»

`/automatiseringen/<id>` — bekijken; `…/bewerken` — bewerken; een stap — `?blad=stap:<n>`, een nieuwe stap — `stap:nieuw`.

- **Kop:** naam in het Oekraïens en het Nederlands; `hv-zin`; «Зараз спрацювала б: ні — умова „режим Ніч“ хибна / Zou nu afgaan: nee — ‘stand Nacht’ klopt niet»; `hv-namens` «Працює від імені: Тарас · версія 7 / Werkt namens: Taras · versie 7»; het pad `hv-traject`.
- **Een stap vanuit de bedoeling** «Що сталося? / Wat gebeurde er?»: tijd en zon, aanwezigheid, apparaten, energie en prijs, stand en scène, knop, vervoer en geozone, cameragebeurtenis, «не сталося / bleef uit», groep. Het doel is de chip `hv-doel`.
- **Actuele voorwaarde:** «істинно / waar · хибно / niet waar · невідомо / onbekend»; verouderd — arcering en ouderdom, nooit ‘niet waar’. Groepen ‘alle / een van / geen’.
- **‘Dan’:** een actie op een doel van elke klasse — met dezelfde bedieningselementen als in het bedieningsblad van het apparaat, zonder uitzonderingen; scène; reeks; huisstand; melding met acties; ‘vragen en wachten’; wachten met een grens; als–anders; stop. «Розширений крок / Uitgebreide stap»: herhalen voor elk, ‘zolang’, parallelle takken, variabelen. «У разі помилки / Bij een fout»: herhalen, reserveactie, doorgaan.
- **Starten:** ‘niet vaker dan’, ‘stabiel gedurende’, «Після простою / Na uitval» (§6).
- **«Проблеми / Problemen»:** leeg doel, verwijderd apparaat, wachten zonder grens, lus, een stap die verder gaat dan de rol van degene namens wie de regel werkt. Een stap met toestemming ‘Uit’ krijgt de waarschuwing «Крок буде пропущено, доки власник не змінить дозвіл / Stap wordt overgeslagen zolang de eigenaar de toestemming niet wijzigt». Een conflict opent `?dialoog=conflict`.

**Stap en toestemming.** Op de stapkaart staan de chip met de stand van de uitvoerder ‘Automatiseringen’ voor deze actie en een ‘!’ bij een gevaarlijke of kritieke actie. De eigenaar klapt op een persoonlijk apparaat in het stapblad `hv-stand` open; de wijziging geldt voor alle automatiseringen, tenzij hij het kader «лише ці автоматизації / alleen deze automatiseringen» instelt (§16). Anderen zien een tekst met een slot: «Змінює лише власник / Alleen de eigenaar kan dit wijzigen».
- **Uit:** de stap wordt overgeslagen, de uitvoering loopt door; chip ‘werkt deels’; vermelding ‘overgeslagen: toestemming „Uit”’.
- **Vragen:** `hv-verzoek` aan degene namens wie de regel werkt; standaard wacht het verzoek zonder termijn — ‘Wacht tot’ staat er alleen als de stap zelf of een kader van de eigenaar een grens heeft. Doorsturen (‘na 2 min — naar de volwassenen thuis’) stelt de eigenaar in onder `/activiteit/regels`. Tijdens de stille uren zonder geluid. Goedkeuren doet een persoon wiens rol de actie toestaat, met het ritueel van het niveau van de actie.
- **Altijd:** de stap wordt uitgevoerd; teken van de maker, `hv-toost`, vermelding; bij een gevaarlijke en kritieke actie een blijvende ‘!’ op de stap, in de rij en ‘! N’ in de kop.

**Rechten en versies.**
1. Poorten van een stap: bron (‘alleen-lezen’) → rol van de persoon namens wie de regel werkt (‘geen toegang’) → pauze → toestemmingsstand → kaders van de eigenaar → begrenzingen (§6). Een weigering noemt de poort; het risiconiveau houdt de uitvoerder niet tegen.
2. Een wijziging door een persoon wiens rol alle stappen dekt, wordt een nieuwe versie namens die persoon; de vorige persoon krijgt een melding. Een stap die verder gaat dan de rol van de bewerker, staat onder ‘Problemen’.
3. Verliest een persoon de toegang, dan gaat de regel naar ‘Meekijken’; «Перебрати на себе / Overnemen».
4. Een wijziging door een agent is de actie ‘Automatisering wijzigen’ met diens `hv-stand`: ‘Uit’ — weigering; ‘Vragen’ — een concept met vergelijking en verzoek; ‘Altijd’ — de versie geldt meteen, namens dezelfde persoon. De stappen gaan nog steeds door de poorten: een wijziging verandert geen enkele toestemming.
5. Scène en reeks liggen vast per versie: «Сцену змінила Олена — правило вживає версію 3 / Olena heeft de scène gewijzigd — de regel gebruikt versie 3».

```
COMPUTER · …/nachtlicht/bewerken              ↶ ↷  versie 7 ▾
‘Beweging in gang, als donker en „Nacht” — 20 % voor 2 min’
Zou nu afgaan: nee · Werkt namens: Taras  i
(Concept)──(Meekijken)──(● Aan)
┌ WANNEER Beweging · [Gang · 2 sensoren ▾] [glas] STAP 2: Donker
├ ALS   ● waar      Donker                 ondergang 16:56 · ◠ dagboog
│       ○ niet waar Stand ‘Nacht’          Verschuiving [−] 0 min [+]
│       ▨ onbekend  Raam · 14 min          PROBLEMEN · 1
├ DAN   1 Licht [Gang · 3] 20 %            stap 1: lamp onbereikbaar →
│         Toestemming: Altijd
│       2 2 min wachten zonder beweging
[Proefdraaien] [Stel dat…] [Verloop] [Versies]     [Opslaan]

TELEFOON: ← Nachtlicht ⋮ │ Nu: nee · namens: Taras
WANNEER ▾ Beweging · Gang (2) │ ALS ▾ ● Donker ○ ‘Nacht’
DAN ▾ 1 Licht 20 % · Altijd │ [Problemen 1] [Proef] [+ Stap]
```

## 6. Controle, verloop, versies, begrenzingen

- **Proefdraaien** `…/proef`: `hv-wasword` «було → стане / was → wordt», daarna «Виконати насправді / Echt uitvoeren»; «Уявімо, що… / Stel dat…» stelt tijd, stand en aanwezigheid in.
- **Meekijken:** echte gebeurtenissen, acties alleen in het verloop: ‘zou 14 keer zijn afgegaan in 7 dagen’.
- **Verloop** `…/verloop/<run>`: de editor alleen ter inzage; bij een stap ‘wacht · bezig · uitgevoerd · overgeslagen · niet uitgevoerd · gestopt door begrenzing’ en de waarden op het moment van de uitvoering; wordt 30 dagen bewaard.
- **«Чому? / Waarom?»** `?blad=waarom:<vermelding>` — `hv-waarom` ‘Wat het startte → Voorwaarde → Actie’.
- **Versies** `…/versies`: een tijdlijn met het teken van de maker, vergelijking per stap; «Відновити / Herstellen» maakt een nieuwe versie met controle van de rol.
- **Begrenzingen** `hv-begrenzing` (‘boiler ≤ 65 °C’) stelt de eigenaar in; het systeem voegt er zelf geen toe. De controle gebeurt bij de uitgang naar de adapter, met een teller van wat is tegengehouden. Alleen de eigenaar wijzigt ze, net als de toestemmingen. Hier staan ook «Аварійні плани / Noodplannen» en «Навчальна тривога / Oefenalarm».
- **Na uitval** — een keuze op de regel: «пропустити / overslaan» (standaard voor gevoelige en hogere stappen), «виконати із запізненням до N хв / tot N min te laat uitvoeren» (standaard voor gewone), «запитати / vragen»; de eigenaar kan alle drie kiezen voor elke regel.
- **Een lus** zet de motor in quarantaine. «Де вживається / Waar gebruikt» is een tabblad van het apparaatblad `?blad=apparaat:<id>&deel=gebruik`.

## 7. Recepten en reeksen

- **Recepten** `…/recepten/<recept>`: 3–4 vragen → «Що зробить цей рецепт / Wat dit recept doet»; hetzelfde scherm toont een concept van een agent. Het recept «Евакуація під час диму / Evacuatie bij rook» ontgrendelt de deuren en zet het licht aan: de toestemming voor de stap ‘ontgrendelen’ is standaard ‘Uit’, de stand kiest de eigenaar, het risico wordt uitgelegd door de ‘!’.
- **Reeksen** `…/reeksen/<id>`: ‘Dan’ zonder ‘Wanneer’, velden (getal, keuze, kamer, duur) met grenzen. Starten gaat via `hv-formulier` (`?dialoog=starten`) met het gevolg, een tegel 2×1 «Запустити / Starten» in ‘Favorieten’, een stap van een regel, Opdracht of een hulpmiddel van een agent. Het niveau is dat van de gevaarlijkste stap; de reeks handelt namens wie haar start.

## 8. Scènes `/scenes`

- **`hv-tegel--scene`** 2×1: de cirkel start (bij een gevaarlijke stap een teken met ritueel), het lichaam van de tegel leidt naar de scène; eenkleurige staafjes van de niveaus; de chips «діє / actief» en «змінено вручну: 2 / handmatig gewijzigd: 2» met ‘Opnieuw toepassen’. Op ‘Thuis’ staan pillen `hv-scene`. De echte kleur van een lamp verschijnt als staal `hv-kleur`, alleen in de stap.
- **«Зберегти поточне / Huidige stand opslaan»** `?dialoog=nieuw`: vinkjes voor apparaten en eigenschappen; het verouderde en het veronderstelde zijn gearceerd — ‘toestand onbekend — wordt niet opgenomen’.
- **«Перегляд наживо / Live proberen»** `/scenes/<id>`: ‘nu → straks’, de bedoeling op de plattegrond als streepje `--hv-wens`; zonder opslaan keert de vorige toestand terug. **Dagdeelscène** `/scenes/dagdeel`: nogmaals drukken bladert door de dagdelen.
- **Na het starten:** één `hv-toost` «Сцена „Вечір“: 10 із 12 підтверджено / Scène ‘Avond’: 10 van 12 bevestigd»; stappen met beweging tonen «виконується / bezig» tot de termijn van hun klasse (gordijnen 60 s, poort 90 s, slot 15 s); ‘Herhalen voor de rest’, ‘Ongedaan maken’ 10 s.
- **Wie start.** Een mens: elke stap geldt als diens eigen actie, met diens rol en het ritueel van de hoogste stap; wat een mens kiest, wordt precies zo uitgevoerd. Een automatisering, de optimalisator, een agent, de agenda of een fysieke knop: de starter heeft toestemming nodig voor ‘Scène starten’, en elke stap volgt de toestemming in de kolom ‘Scènes’; bij ‘Uit’ wordt de stap overgeslagen: «5 із 7 кроків; 2 вимкнено дозволом / 5 van 7 stappen; 2 uit door toestemming».

## 9. Huisstanden `/scenes/standen`

«Вдома / Thuis · Не вдома / Afwezig · Ніч / Nacht · Відпустка / Vakantie · Гості / Gasten»; de chip `hv-huisstand` opent `?blad=huisstand` met `hv-gevolg` voor elke stand.
- **Een stand is een set stappen**, net als een scène: licht, klimaat, media en, als de eigenaar dat instelt, beveiliging (`hv-alarmstand`: «знято / uit · периметр / schil · нічна / nachtstand · повна / volledig») en sloten. Elke stap volgt zijn toestemming; bij ‘Uit’ stelt de stand de stap alleen voor, op een aparte regel.
- **Pagina van een stand:** `hv-matrix` ‘automatisering × stand’; «Переходи / Overgangen» in zinnen (‘iedereen weg → na 10 min „Afwezig”’ is een regel, standaard ‘Uit’); «Зафіксувати до… / Vastzetten tot…». «Їдемо у відпустку / We gaan op vakantie» (`?dialoog=vertrek`): data, beveiliging, aanwezigheidsimulatie, zuinig klimaat.
- **`hv-regie`** «Керує зараз: вручну до 22:00 / Stuurt nu: handmatig tot 22:00», «Повернути автоматику / Automatiek hervatten». Rangorde: veiligheid > handmatig > stand > comfort > besparing.

```
TELEFOON · ?blad=huisstand        [glas, inhoud op papier]
(●) Thuis ( ) Afwezig ( ) Nacht ( ) Vakantie… ( ) Gasten…
Wat er verandert in ‘Afwezig’: 9 lampen en 3 contacten uit;
4 regels gaan op pauze
Schild · Beveiliging: uit → toestemming ‘Vragen’: huis vraagt i
[Annuleren]                            [Naar ‘Afwezig’]
```

## 10. Actieniveaus en toestemmingen

Het niveau bepaalt alleen het teken `hv-risico` en het ritueel van de mens (OT §10); de matrix staat in `shared/huis-gevaar.ts`, fase 2.

| Niveau | Acties van de zone | Ritueel van de mens |
|---|---|---|
| gewoon | al het licht uit; een uitvoering overslaan; een gewone regel pauzeren; ‘Gedaan’ | meteen |
| gevoelig `Eye` | stand wisselen; scène opslaan of wijzigen; regel uitzetten; waarde corrigeren; exporteren | ‘Ongedaan maken’ 10 s |
| gevaarlijk `Triangle` | ‘Alles in huis uit’; een regel met het label ‘veiligheid’ uitzetten of pauzeren | `hv-gevaar`, rail |
| kritiek `Octagon` | scène of stand met de stap ‘ontgrendelen’, ‘alarm uitschakelen’, ‘gas openen’ | rail en bevestiging van de aanmelding |

Scène, stand, reeks en het aanzetten van een regel krijgen het niveau van de hoogste stap. De maquette toont de bevestiging van de aanmelding volgens het doel van OT §10: elke keer opnieuw; hoe de huidige code werkt — §18, punt 1.

**Toestemmingen.** Elke actie — voor scènes, automatiseringen, de optimalisator en elke agent — heeft «Вимкнено / Uit · Питати / Vragen · Завжди / Altijd», standaard ‘Uit’; alleen de eigenaar wijzigt dit, op een persoonlijk apparaat; termijn, kamers, uren en budget zijn optionele kaders van de eigenaar. Een agent kan rechten verruimen noch beperken — niet die van zichzelf en niet die van anderen; begrenzingen en de pauze van zelfstandige acties wijzigt ook alleen een mens. Elke wijziging van een toestemming en elke actie op grond daarvan wordt een vermelding in het Logboek en in `hv-meldingen`. Doorsnede van het register: `/instellingen/toestemmingen?filter=automatisering`, met de groepen ‘Scènes’, ‘Standen’, ‘Regels’, ‘Reeksen’ en ‘Logboek’ en een `hv-stand` per groep.

**Hulpmiddelen voor agenten** (groep `huis`, fase 5), elk onder een eigen `hv-stand`: `tonen_automatiseringen`, `maken_automatisering`, `wijzigen_automatisering`, `aanzetten_automatisering`, `uitzetten_automatisering`, `pauzeren_automatisering`, `proefdraaien_automatisering`, `verwijderen_automatisering`, `tonen_verloop`; `tonen_scenes`, `starten_scene`, `opslaan_scene`, `wijzigen_scene`; `tonen_huisstand`, `wisselen_huisstand`, `vastzetten_huisstand`; `starten_reeks`, `wijzigen_reeks`; `tonen_agenda`, `overslaan_run`; `tonen_logboek`, `tonen_waarom`, `tonen_geschiedenis`, `corrigeren_waarde`, `exporteren_geschiedenis`; `tonen_onderhoud`, `afvinken_onderhoud`; `sturen_melding`; `tonen_begrenzingen`. Hulpmiddelen om toestemmingen, begrenzingen of de pauze te wijzigen zijn er niet.

## 11. Agenda `/automatiseringen/agenda`

`hv-agenda` «Сьогодні й завтра / Vandaag en morgen»: geplande uitvoeringen met «Пропустити раз / Eén keer overslaan», de kalender, afval (‘Morgen papier — vóór 07:30’), onderhoud, goedkope uren; dezelfde uitvoeringen staan op de strook ‘makers’ van `hv-dagstrook`. Het weekschema van het klimaat: doorgaan naar `/klimaat/weekschema`. Feestdagen: «як у неділю / als zondag». Kalender en lijsten worden alleen gelezen uit de Hub.

## 12. Logboek `/activiteit`

Elke toestandswijziging gaat door één schrijfmodule (maker, reden, soort `huis.*`, belang); de bouw controleert dat elke route, elke actie van de motor en elke periodieke taak die module aanroept. Vermeldingen worden alleen toegevoegd en niemand kan ze uitzetten; het Logboek wordt 400 dagen bewaard, de audit 2 jaar (plan §4). De soort legt het belang niet vast — dat bepaalt de gebeurtenis; de ene tabel ‘gebeurtenis → soort → belang’ voor alle zones staat in [‘Architectuur’](09-ARCHITECTUUR.nl.md) §10, hieronder staat de doorsnede voor deze zone.

| Gebeurtenis | Melding in beeld | Belang | Soort |
|---|---|---|---|
| scène, groep, stand door een mens | ja | ter informatie | volgens apparaat |
| uitvoering van een regel, van de optimalisator | één per uitvoering | ter informatie | `.automatisering`, `.energie` |
| actie van een agent | ja | ter informatie; gevaarlijk — belangrijk | `.agent` |
| verzoek ‘Vragen’ | blijft staan | belangrijk | `.automatisering`, `.agent` |
| wijziging van een toestemming of kader | ja | ter informatie; ‘Altijd’ voor een gevaarlijke of kritieke actie — belangrijk | `.systeem` |
| wijziging van een begrenzing; pauze van zelfstandige acties | ja | belangrijk | `.systeem` |
| overgeslagen, tegengehouden, lus, quarantaine | samengevat | belangrijk | `.automatisering` |
| rook, gas, water, inbraak | `hv-nood` | alarm | `.alarm` |

De pagina: «Тривають / Lopend» → «Чекають рішення / Wachten op besluit» → dagen; gelijksoortige vermeldingen binnen 60 s worden samengevouwen. Filters: maker, belang, soort, «для мене / voor mij». `hv-bericht`: ‘Wie · Wat · Waarom · Was → werd · Toegestaan via’.

```
COMPUTER · /activiteit                [Alles gelezen] [Regels]
[alle] [Automat.] [Agenten] [Beveil.] [Energie] [nog 5 ▾]
LOPEN NOG △ aandacht · Slaapkamerraam 42 min open        [Waarom?]
WACHTEN   ■ Agent: poort dicht [Eén keer goedkeuren] [Afwijzen]
VANDAAG   ◆ 22:30 Scène ‘Nacht’ · 10 van 12 bevestigd       ▾
          Toegestaan via: Scènes — Altijd · namens: Taras
          Was → werd: Woonkamer 60 % → 0 %     [Ongedaan maken]
```

## 13. Bezorging, geschiedenis, onderhoud

- **Eén bel.** De bezorging regelt het platform (`shared/meldingen-v2`) via `emitCanonicalNotice`; de module heeft geen eigen bel en geen eigen ‘gelezen’; op het knooppunt huis opent de bel `?blad=meldingen` met ‘voor mij’. Ter informatie → `stil`, belangrijk → `normaal`, alarm → de beveiligde `prioriteit`. `/activiteit/regels` is een doorsnede van de platformregels: `hv-escalatie` (‘0 min — wie thuis is → 2 min — volwassenen → 5 min — sleutelhouder’), stille uren, «Надіслати перевірку / Test versturen»; de alarmkanalen staan in ‘Beveiliging’ §7. ‘Simulatie naar externe kanalen’ staat standaard uit.
- **Geschiedenis** `/activiteit/geschiedenis`: ‘Tijdlijn | Grafieken | Tabel’; `?t=` is «Перегляд минулого / Terugblik»; `hv-grafiek` met hooguit vier reeksen, het geschatte als stippellijn 4/4 met ‘≈’, een gat gearceerd; «Виправити значення / Waarde corrigeren» met een reden; CSV; de audittabel `?filter=agent`.
- **Onderhoud** `/activiteit/onderhoud`: ‘Nu’ (batterijen onder 15 %, onbereikbare apparaten, quarantaine) en ‘Binnenkort’ (filters, ketel, rookmelders) — `hv-onderhoud` met «Зроблено / Gedaan» en «Відкласти / Uitstellen».

## 14. Toelichtingen

Sjablonen staan in `tekst.ts`; berekende toelichtingen komen uit `/api/huis/gevolg`, dezelfde droge proefrun als in Opdracht en `hv-gevaar`.
- **‘i’ bij ‘Pauzeren tot 07:00’.** «Що станеться: „Нічне світло“ не спрацює до 07:00. Пов'язано з: у режимі „Ніч“ коридор лишиться темним. Як повернути: „Продовжити“.» / «Wat er gebeurt: ‘Nachtlicht’ gaat tot 07:00 niet af. Hangt samen met: in stand ‘Nacht’ blijft de gang donker. Terugdraaien: ‘Hervatten’.»
- **‘!’ bij ‘Altijd’ voor ‘Poort openen’ door automatiseringen.** «Що може статися: ворота відчиняться, коли вдома нікого. Пов'язано з: присутність, дані 2 хв тому. Як повернути: „Зачинити“. Хто зможе це запускати: 2 автоматизації. Як вимкнути: „Вимкнено“ тут або „Зупинити самостійні дії“.» / «Wat er kan gebeuren: de poort gaat open terwijl er niemand thuis is. Hangt samen met: aanwezigheid, gegevens van 2 min geleden. Terugdraaien: ‘Sluiten’. Wie dit kan starten: 2 automatiseringen. Uitzetten: ‘Uit’ hier of ‘Zelfstandige acties stoppen’.»
- **Weigering.** «Чому ні: джерело лише для читання. Що перевірити: право запису в інтеграції. Що можна натомість: пробний прогін.» / «Waarom niet: de bron is alleen-lezen. Wat te controleren: schrijfrechten in de integratie. Wat wel kan: proefdraaien.»

## 15. Profielen, simulator, toestanden

- **Profielen.** `wand` (`/paneel/wand/<id>`) en `tv`: scènes, stand, ‘Lopend’; zonder editor en zonder het wijzigen van toestemmingen; een regel pauzeren met een persoonlijke code. `deur`: ‘Ik ga weg’ en ‘Ik ben thuis’ met het gevolg in één zin. `klein`: hooguit 4 scènes. `horloge`: alarmen en verzoeken; het kritieke met ‘Bevestig op de telefoon’. `inkt`: agenda en scènes met genummerde knoppen. `ultrabreed`: het doorlopende Logboek in de derde zone.
- **Simulator** — groep ‘Automatisering’: ‘Agent vraagt goedkeuring’, ‘Regel zit in een lus’, ‘Apparaat verdwenen uit regel’, ‘Uitval van 40 min’, ‘Feestdag’; vermeldingen met een kolf, meldingen in beeld vanaf ×60 samengevat.
- **Toestanden:** de twaalf gedeelde uit OT; het pad van een regel; een verzoek ‘wacht · goedgekeurd · afgewezen · verlopen · uitgevoerd · niet uitgevoerd’; de tien toestanden van `hv-stand`. Zonder adres: `hv-toost`, `hv-gevaar`, `hv-nood`.

## 16. Componenten

**Uit OT:** `hv-hemel`, `hv-held`, `hv-blok`, `hv-chip`, `hv-leeg`, `hv-tegel`, `hv-schakel` en het teken met ritueel, `hv-scene`, `hv-huisstand`, `hv-alarmstand`, `hv-kleur`, `hv-dagstrook`, `hv-grafiek`, `hv-tabel`, `hv-plan`, `hv-versheid`, `hv-sim`, `hv-maker`, `hv-waarom`, `hv-laag`, `hv-risico`, `hv-stand`, `hv-gevaar`, `hv-rail`, `hv-gevolg`, `hv-nood`, `hv-pincode`, `hv-toost`, `hv-bericht`, `hv-meldingen`, `hv-verzoek`, `hv-voorstel`, `hv-regel`.
**Nieuw:** `hv-zin`, `hv-traject`, `hv-namens`, `hv-stap`, `hv-doel`, `hv-kiezer`, `hv-formulier`, `hv-wasword`, `hv-verloop`, `hv-versies`, `hv-regie`, `hv-begrenzing` (`hv-grens` van ‘Energie’ is daar een doorsnede van), `hv-tegel--scene`, `hv-chip--logica`, `hv-matrix`, `hv-agenda`, `hv-escalatie`, `hv-tijdlijn`, `hv-onderhoud` (gedeeld met ‘Garage’); de schrijfmodule op de server.
**Voor OT:** het kader «лише ці автоматизації / сцени — alleen deze automatiseringen / scènes»; de toestanden «пропущено / overgeslagen» en «спинено обмеженням / gestopt door begrenzing». **Voor de schil:** de bladsoorten `stap` en `waarom`. De tabbladnaam «Обслуговування / Onderhoud» gebruikt de schil al (§17).

## 17. Gedekt en uitgesteld

| Fase | Wat uit deze zone |
|---|---|
| 0 | specificatie en maquette van alle schermen |
| 1 | schrijfmodule voor gebeurtenissen van de simulator, de strook ‘makers’ |
| 2 | kern van de motor (poorten, begrenzingen, lussen, quarantaine, uitval), lijst, recepten, proefdraaien; scènes en standen; `hv-stand` voor elke actie; Logboek, `huis.*`, audit |
| 3 | in Opdracht: scènes, standen, ‘Regel pauzeren’, ‘Wat werkt vanzelf?’ |
| 4 | vervoer en geozones als ‘Wanneer’ |
| 5 | volledige editor, uitgebreide stappen, reeksen, versies, verloop, verzoeken, eigen standen, wijzigingen en hulpmiddelen van agenten |
| 6 | `wand`, `tv`, `deur`, `inkt`, `horloge`; meldingsknoppen op het apparaat |
| 7 | Geschiedenis, grafieken, ‘Waarde corrigeren’, CSV, gewoonten, prijs als ‘Wanneer’ |
| 8 | wie de acties van anderen ziet, rollen voor de pauze, escalatie via mensen |
| 9 | cameragebeurtenissen als ‘Wanneer’, noodplannen, oefenalarm |
| 10 | klimaatschema, mediastappen |
| 11 | ‘Onderhoud’ |
| 12 | echte apparaten, import van regels uit Home Assistant, scènes op apparaten, echte afvalkalender |

**Buiten de schaal:** weergave van regels als graaf en als code, MQTT, NFC, spraakopdracht.

## 18. Besluiten voor de eigenaar

1. **Bevestiging van de aanmelding** (plan §7): de huidige code (`STAP_OP_MS`) houdt die 5 min per sessie vast — zo laten of eenmalig maken voor elke kritieke actie. De maquette toont al het doel van OT: elke keer opnieuw.
2. **Wijzigingen in het platform:** geluid door ‘Niet storen’ heen voor `huis.alarm` en een schema voor stille uren in `shared/meldingen-v2`.
3. **Externe ingangen:** beveiligde webhooks en het importeren van recepten via een adres vragen om een extern oppervlak via een tunnel.
4. **Privacy** (fase 8, AVG): welke bewoners de acties van anderen zien; de termijnen van 400 dagen en 2 jaar.
5. **Externe kanalen** en een sleutelhouder buiten huis — samen met ‘Beveiliging’.
6. **Bron van de afvalkalender** na de simulator.
