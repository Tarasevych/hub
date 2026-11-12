> 🌐 **Taal:** [Українська](05-БЕЗПЕКА.uk.md) · **Nederlands** | [Hoofddocument](../ONTWERP-HUIS-20261110.nl.md)

# Zone 5. Beveiliging en camera's / Безпека

Taak HUIS-001 · fase 0 · 10.11.2026 · status: ter goedkeuring bij de eigenaar

Bronnen: plan HUIS-001 (§1, §3, §3.8, §4) en de [ontwerptaal ‘Живий дім / Levend huis’](../ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ-20261110.uk.md) (hierna: OT). Namen van tokens, componenten, toestanden en profielen komen uit OT; de eigen componenten van de zone staan in §15.

## 0. Wat er is veranderd

- **‘Levend huis’.** Een stille hemel onder de held, gegevens op papier, glas alleen voor de kop, de navigatie, de omhulling van het blad en Opdracht; het verbod op glas, hemel en kleurverlopen is opgeheven. Een alarm zet de hemel op alle schermen uit (`.is-nood`).
- **Toestemmingen** (plan §3.8): elke actie heeft een `hv-stand` voor elke uitvoerder, standaard ‘Uit’, elke stand naar keuze van de eigenaar. Geschrapt zijn de plafonds, de varianten A/B, onbeschikbare segmenten, acht harde verboden, ‘een huisstand kan het alarm nooit uitschakelen’, ‘vanaf het paneel slechts twee kritieke acties’ en ‘vanaf de telefoon kan niet worden gedempt’. Het ritueel voor de mens blijft (§5).
- **Afgestemd op OT:** `hv-risico` (gevoelig — `Eye`), `/instellingen/risico`, `&deel=`, «стан припущено / toestand verondersteld», «виконується / bezig», het teken met ritueel.
- **Fasen** volgen de schaal 0–12 van plan §4 (§16). **Volledigheid:** een bedieningsblad voor elke klasse van de zone en de volledige set hulpmiddelen voor agenten (§6).

## 1. Opzet en grenzen

- **De grens van de hub wordt benoemd.** De hub is geen gecertificeerd alarmsysteem en vervangt het geluid van een melder niet: de chip «Не сертифікована система / Geen gecertificeerd alarmsysteem» en het blok «Хто що охороняє / Wie bewaakt wat» — ‘het apparaat zelf’ (sirene, geluid van de melder) en ‘de hub’ (meldingen, licht, Logboek). In de huidige adapter voor Home Assistant is de sirene alleen-lezen — het blok zegt dat.
- **Zonder optimisme:** een slot meldt «заклинило / klemt». **Spanning:** rust zonder kleur; ‘aandacht’ — driehoek en woord; `--fout` alleen voor het kritieke en `hv-nood`.
- **Elke sessie geldt als sessie op afstand:** ‘in huis’ is alleen de sessie van een gekoppeld paneel.
- **Grenzen.** De zone schrijft de bladen van slot, poort en garagedeur, kleppen, sirene, alarmsysteem, camera, deurbel en beveiligingssensoren (het bladenregister wordt gedeeld met ‘Apparaten’). De laag ‘Beveiliging’ uit het plan hoort bij ‘Kamers’; rollen en termijnen bij de zone Mensen; het toestemmingenregister bij ‘Systeem’; de alarmregels bij ‘Automatisering’.

## 2. Weergave in de zone

- **Held.** De beveiligingszin volgt de regels van OT §11 (een verouderde toestand in de verleden tijd: «О 22:41 охорону було поставлено / Om 22:41 werd het alarm ingeschakeld»); ervoor staat een schild met een woord (`ShieldOff` · `ShieldHalf` · `ShieldEllipsis` · `ShieldCheck`, bij alarm `ShieldAlert`); eronder papieren chips van 28 px «захист послаблено / bescherming verlaagd», «відчинено 2 / 2 open».
- **Tegels** (OT §7): slot, poort, klep, sirene, sensor — 2×1; camera — 4×2; op ‘Thuis’ de kaart ‘Beveiliging’ van 2×2. Deze klassen dragen geen toon: de toestand zit in het pictogram (`LockKeyhole` / `LockKeyholeOpen`, `DoorClosed` / `DoorOpen`) en in het woord.
- **Een teken met ritueel** in plaats van een cirkel waar de volgende actie gevaarlijk of kritiek is: een vergrendeld slot, een ingeschakeld alarm, een gesloten poort, een dichtgedraaide gaskraan. Aanraken opent `hv-gevaar`; bij een veronderstelde of verouderde toestand verschijnt de vorm van het hogere niveau.

## 3. Adressen en kaart

Grammatica van de schil: pagina — pad; blad — `?blad=<soort>[:<id>]` met het tabblad `&deel=`; dialoog — `?dialoog=`; moment — `?t=`. `hv-gevaar`, `hv-nood` en `hv-pincode` openen niet via een adres. De dienstwoorden van de zone (`controle`, `incident`, `gebeurtenissen`, `zones`, `codes`, `bezoekers`) staan op de lijst met verboden identificatoren.

| Tabblad, adres | Blokken (inklapbaar) | Subpagina's | Bladen, dialogen |
|---|---|---|---|
| Стан / Status `/beveiliging` | zin · ‘Nu belangrijk’ · alarm · deuren en sloten · zones · camera's · noodsensoren · ‘Wie bewaakt wat’ · «Здоров'я системи / Systeemgezondheid» · dagstrook · Logboek | `/controle/avond`, `/controle/vertrek`, `/incident/<id>` | `?blad=alarm`, `?blad=zone:<id>` |
| Камери / Camera's `/beveiliging/cameras` | raster 1/4/9 · gebeurtenissen | `/<id>?t=`, `/<id>/zones`, `/gebeurtenissen` | `?blad=apparaat:<id>&deel=instellingen`, `?blad=cameratoegang`, `?dialoog=meekijken` |
| Доступ / Toegang `/beveiliging/toegang` | sloten · poorten · deurbel · codes | `/codes`, `/bezoekers` | `?blad=apparaat:<id>`, `/codes?dialoog=gast` |
| Датчики / Sensoren `/beveiliging/sensoren` | per soort · «Тест і покриття / Test en dekking» | — | `?blad=apparaat:<id>` |

## 4. Status / Стан

```
TELEFOON 390 · stille hemel · glas: kop, onderbalk
┌ glas ─────────────────────────────┐
│ Beveiliging      ▲2   •   !1  bel3│
├───────────────────────────────────┤
│ kolf Simulatie ×60 · 22:58        │
└───────────────────────────────────┘
 Status │ Camera's │ Toegang │ Sensoren
 schild Alarm: nachtstand. 1 open:
 slaapkamerraam op kiepstand.
 (bescherming verlaagd) (camera's 4)
┌ Nu belangrijk · 2 ── papier ──────┐
│▲ Slaapkamerraam overbrugd [Sluiten│
│▲ Rook, zolder: stil 26 u  [Wat…]  │
└───────────────────────────────────┘
 Alarm  i
┌───────────────────────────────────┐
│ ShieldOff       uit               │
│ ShieldHalf      schil             │
│✓ShieldEllipsis  nacht 22:41 Olena │
│ ShieldCheck     volledig          │
└───────────────────────────────────┘
 Deuren en sloten ▸ 4   Camera's ▸ 4
 [ Avondcontrole ]
┌ glas ─────────────────────────────┐
│ Thuis Kamers Energie ▌Bev.  Meer  │
└─────────────────────────[Opdracht]┘
COMPUTER 1280 · glazen kop 56 px · blad rechts 400 px
┌ glas ───────────────────────────────────────────────────────────────┐
│Thuis Kamers Energie ▌Beveiliging Garage Autom. [Opdracht] ×60•!1 bel│
├─────────────────────────────────────────────┬ blad (glas) ──────────┤
│ Status │ Camera's │ Toegang │ Sensoren      │ Voordeur              │
│ schild Alarm: nachtstand. 1 open:           │ Bediening│Gesch.│Inst.│
│ slaapkamerraam op kiepstand.  22:58         │ ┌ papier ───────────┐ │
│ ┌Nu belangrijk 2─┐ ┌Alarm──────────────────┐│ │ ▣ op slot · 2 s   │ │
│ │▲ slaapkamerraam│ │[Uit][Schil][✓Nacht]   ││ │ batt. 62 % ≈ 40 d │ │
│ │▲ rook, zolder  │ │[Volledig] uitloop —   ││ │ [Ontgrendelen… ▣] │ │
│ ├Deuren, sloten 4┤ ├Wie bewaakt wat────────┤│ │ Autom. op slot  i │ │
│ │▣ Voord. op slot│ │hub 2 kan. · waakhond ▲││ └───────────────────┘ │
│ │○ Achter ontgr. │ │rook: geluid melder    ││ Toestemming: Scènes   │
│ └────────────────┘ └───────────────────────┘│ [Uit][Vragen][Altijd]!│
└─────────────────────────────────────────────┴───────────────────────┘
```

‘▣’ is het teken met ritueel, ‘○’ een gewone schakelaar; de volgorde van de blokken volgt §3, ‘Nu belangrijk’ is een filter op de ene gedeelde lijst, hoogstens 3 regels.

- **Alarm** (`hv-alarmstand`): «Охорона: знято / Alarm: uit · периметр / schil · нічна / nachtstand · повна / volledig» — tot 699 px een lijst van vier regels, vanaf 700 px een segmentknop; elke regel heeft `hv-gevolg`. ‘Vakantie’ is een huisstand die de escalatie verlengt; ‘Eigen’ is uitgesteld.
- **Inschakelen:** het blad `?blad=alarm` «Не готово: 2 відчинені / Niet gereed: 2 open»; een raam is зачинено / dicht · на провітрюванні / kiepstand · відчинено / open; «Обійти й поставити… / Overbruggen en inschakelen…» → de uitloopring `hv-aftel` van 60 s; tot die is afgelopen, kan het inschakelen nog worden geannuleerd. Mislukt het, dan volgt ‘niet uitgevoerd’ met de reden: «Не вдалося поставити: відчинено вікно у спальні / Inschakelen lukt niet: slaapkamerraam staat open».
- **Binnenkomst:** een ring van 30 s en `hv-pincode`; zonder code volgt een alarm: `hv-nood` met de reden en momentopnamen, «Відбій… / Afmelden…», de eerste 30 s «Хибна тривога / Vals alarm».
- **Herstart terwijl het alarm aan staat** is een gebeurtenis ‘belangrijk’: «Сервер перезапущено о 03:12; охорону відновлено / Server herstart om 03:12; alarm hersteld».
- **Zones** (`?blad=zone:<id>`): schil, binnen, 24 uur per dag; vertraging, stil alarm, sirene tot 3 min, kruiscontrole door twee sensoren. **Paniekknop** «Тривога / Noodknop»: 1,2 s ingedrukt houden of een aftelling van 3 s, voor alle rollen, ook op een vergrendeld paneel; het licht en de momentopnamen die hij in gang zet, volgen de toestemmingen van de regel.
- **Controle** (`hv-controle`): «Вечірня перевірка / Avondcontrole», «Перед виходом / Vertrekcontrole»; de groepen ‘Herstel ik zelf · Doe het zelf · Onbekend’ en de actie «Виправити все можливе / Alles herstellen wat kan» — een opdracht van een mens krijgt het ritueel van de hoogste stap; gestart door een regel of een agent volgt ze de toestemming van die uitvoerder.

## 5. Actieniveaus en het ritueel voor de mens

Het niveau bepaalt alleen het teken `hv-risico` en het ritueel voor de mens; toestemmingen beperkt het niet (OT §10). De definitieve matrix ‘mogelijkheid × richting → niveau’ staat in `shared/huis-gevaar.ts`, fase 2.

| Niveau | Acties van de zone | Persoonlijk apparaat | Paneel (`wand`, `vierkant`, `rond`, `klein`, `deur`) | `tv`, `horloge`, `strook`, `inkt` |
|---|---|---|---|---|
| gewoon | vergrendelen; water of gas dichtdraaien; de sirene uitzetten; «Я займаюся / Ik pak het op» | direct | direct | direct |
| gevoelig `Eye` | het alarm inschakelen; een zone één cyclus overbruggen; de poort sluiten; tijdelijk meekijken via een binnencamera; een clip of het controlespoor exporteren | ‘Ongedaan maken’ 10 s; waar terugdraaien onmogelijk is — een knop met een aftelling van 3 s | hetzelfde | een bevestigingsstap |
| gevaarlijk `Triangle` | de poort openen; de waterklep openen; de sirene of de sirenetest aanzetten | `hv-gevaar`: houdrail met het gevolg | houdrail | knop met een aftelling van 3 s |
| kritiek `Octagon` | ontgrendelen; het alarm uitschakelen; een alarm afmelden; gas openen; openen tijdens een oproep; een gastcode uitgeven; rookmeldingen 10 min dempen; een beveiligingssensor of camera langer dan één cyclus uitschakelen | houdrail en een bevestiging van de aanmelding op het platform | houdrail en `hv-pincode` met de persoonlijke code van wie handelt | «Підтвердьте на телефоні / Bevestig op je telefoon» |

- Poorten met het label `ingang` zijn kritiek. Rolrechten voor kritieke acties horen bij de zone Mensen; de eigenaar voert elke actie uit met het ritueel van het bijbehorende niveau.
- **Een tegengestelde actie erft het niveau van haar eigen richting:** na vergrendelen, inschakelen, dichtdraaien of sluiten is er geen ‘Ongedaan maken’; «Повернути все / Alles ongedaan maken» zegt: «Пропущено 2 кроки: відімкнути двері, відкрити клапан — це окремі дії з підтвердженням / 2 stappen overgeslagen — aparte acties met bevestiging».
- **Verzwakt toezicht** (overbrugging, uitgeschakelde camera, dempen) krijgt de chip ‘bescherming verlaagd’; de termijn kiest de mens. **Meldingen op het apparaat** hebben alleen de knoppen «Замкнути / Vergrendelen», «Поставити на охорону / Inschakelen» en ‘Ik pak het op’; al het andere — «Відкрити / Openen».
- **Bevestiging van de aanmelding.** In de huidige code: Google of TOTP, geldig 5 min per sessie (`STAP_OP_MS`); tot er een eenmalig mechanisme is (plan §7), zegt de dialoog «Підтвердження діє 5 хв для цього сеансу / Bevestiging geldt 5 min voor deze sessie». De maquette toont het doel van OT: elke keer opnieuw.
- **Особистий код / Persoonlijke code** (`hv-pincode`, 4–8 cijfers, aanbevolen 6) identificeert de persoon; «Код панелі / Paneelcode» bevestigt geen enkele actie: ze ontgrendelt alleen de weergave van een doorgangsscherm of een scherm dat van buiten te zien is (schil §6). De controle gebeurt op de server; na 3 fouten gaat er een melding naar de volwassenen, na 5 volgt een pauze van 5 min, daarna 30 min, daarna een blokkering tot de eigenaar ingrijpt; beheer — `/instellingen/mensen/<persoon>/code`.

## 6. Toestemmingen van uitvoerders

Elke actie van de zone heeft een `hv-stand` «Вимкнено / Uit · Питати / Vragen · Завжди / Altijd», apart voor scènes, automatiseringen, de optimalisator en elke agent. Standaard ‘Uit’; de eigenaar kan voor elke actie elke stand kiezen; termijn, kamers, uren en budget zijn optionele kaders die alleen hij instelt. Een agent kan rechten verruimen noch inperken — niet die van zichzelf en niet die van anderen. Elke wijziging van een toestemming en elke actie op grond daarvan is een vermelding in het Logboek en een melding `huis.alarm` of `huis.toegang`; bij gevaarlijke en kritieke acties staat ‘!’, bij ‘Altijd’ een blijvende markering en ‘! N’ in de kop.

- **Doorsnede van het register** `/instellingen/toestemmingen?filter=beveiliging`: de groepen ‘Alarm’, ‘Deuren en poorten’, ‘Kleppen’, ‘Camera's’, ‘Codes en gasten’ en ‘Sensoren’ met een groeps-`hv-stand` «Для всієї групи / Voor de hele groep»; het apparaatblad toont dezelfde `hv-stand` onder ‘Instellingen’ en «Показати в реєстрі / In register tonen».
- **Huisstand:** inschakelen, uitschakelen van het alarm en de sloten zijn aparte stappen met een eigen toestemming; bij ‘Uit’ doet de huisstand alleen een voorstel: «Усі пішли. Поставити на охорону? / Iedereen is weg. Inschakelen?». ‘Altijd’ voor uitschakelen op basis van aanwezigheid is mogelijk — met een blijvend ‘!’.
- **Spraak** is de uitvoerder ‘externe dienst’ met een eigen `hv-stand`; het risico van een nagebootste stem wordt in het ‘!’ benoemd. **Een beeld dat aan een agent wordt doorgegeven,** is onbetrouwbare invoer: in `hv-voorstel` en `hv-verzoek` staat de beschrijving ervan tussen aanhalingstekens.
- **Hulpmiddelen voor agenten** (groep `huis` van de connector): alarm, zones, sloten, sensoren, batterijen, cameragebeurtenissen en bezoekers lezen; het alarm in- en uitschakelen, een zone overbruggen, een alarm afmelden, de sirene testen; vergrendelen, ontgrendelen, poorten openen en sluiten; kleppen dichtdraaien en openen; gebeurtenissen, momentopname, video, clip, maskers; een gastcode uitgeven en intrekken; een oproep beantwoorden of de deur openen; een controle starten; rook dempen, een sensor uitschakelen; scenario's van de simulator. Elk hulpmiddel valt onder een eigen `hv-stand`; een hulpmiddel om toestemmingen te wijzigen bestaat niet.
- **Pauze** «Зупинити самостійні дії / Zelfstandige acties stoppen» verandert de standen niet; alleen de eigenaar kan hervatten.

## 7. Alarmbezorging / Доставка тривог

Een filter van het Logboek, `/activiteit/regels?filter=alarm`; de inhoud bouwt deze zone: de keten ‘wie · na hoeveel tijd · via welk kanaal’, ключотримачі / sleutelhouders; «Я займаюся / Ik pak het op» stopt de escalatie.

| Kanaal (`hv-kanaal`) | Eerlijke stand van zaken |
|---|---|
| Open tabblad | fase 2; alleen zolang het tabblad open is |
| Melding op het apparaat | fase 6; op de iPhone alleen met de geïnstalleerde app, komt niet door ‘Niet storen’ heen |
| E-mail van het platform | fase 9; traag, maakt niet wakker |
| Geluid van het paneel | fase 6; toestemming met een aanraking tijdens het koppelen; «Програти тестовий сигнал / Testtoon afspelen» |
| Licht | actie van de alarmregel (100 %, knipperen tot 1 Hz) volgens haar eigen toestemming, standaard ‘Uit’ |
| Trillen | alleen Android in de geopende app |
| Telefoongesprek, sms of berichtenapp | ontbreekt; nieuwe dienst; voorwaarde voor echte rookmelders |
| Externe waakhond ‘huis stil 5 min’ | voorwaarde voor een echt alarmsysteem |

- Voor rook, CO, gas en water geven minder dan twee actieve kanalen een blijvend ‘!’. Zolang er geen extern kanaal is, zegt het blad van de rookmelder: «Хаб не замінює звук датчика й не будить / De hub vervangt het geluid van de melder niet en maakt je niet wakker».
- Urgentie: до відома / ter informatie · важливо / belangrijk · тривога / alarm; in een simulatie toont de kaart de bezorging via elk kanaal.

## 8. Camera's / Камери

- **Videopad.** Eerst momentopnamen via de server: één ‘live’ camera elke seconde, de rest elke 5 s, stilgezet op een verborgen tabblad; daarna een HLS-stroom (nodig voor de iPhone). De speler meldt «наживо · 3 с / live · 3 s» of «знімки · 5 с / beelden · 5 s».
- **Opname:** tot het besluit over de opslag «Записів немає / Geen opnamen» en «копії поза домом немає / geen kopie buitenshuis»; 4 camera's die 14 dagen onafgebroken opnemen, vragen meer dan 1 TB, dus standaard alleen clips van gebeurtenissen, met een quotum.
- Raster 1/4/9 (`hv-cameraraster`; tv — 1/4, telefoon — kolom); chips «людина / persoon · авто / auto · тварина / dier · пакунок / pakket · дзвінок / bel»; gebeurtenissen — `hv-dagstrook` en `hv-tabel`, moment — `?t=`.
- **Приватність удома / Privé thuis:** binnencamera's staan uit zolang er iemand thuis is (schakelaar van de eigenaar); vervangend beeld «Вимкнено, бо хтось удома / Uit, want er is iemand thuis». Tijdelijk meekijken is een gevoelige actie, standaard 30 min; `hv-bekeken` «вас зараз бачать / je wordt nu bekeken» op het paneel en op de kamerkaart; een vermelding in «Хто дивився / Wie keek mee».
- **Maskers** (`hv-masker`): privacy- en detectiemaskers, met als toetsenbordalternatief een lijst met coördinaten; sabotage — ‘referentie / nu’. **AVG-hulp** (`hv-avg-hulp`) voor straatcamera, deurbel en drone: masker over de straat, 14 dagen, geluid uit, een bordje; meer dan 28 dagen — ‘!’ met uitleg, zonder blokkering.
- **Bescherming:** adres en wachtwoord van de camera staan in ‘Geheimen’; de stroom loopt alleen via de server, binnen een sessie. **Toegang voor mensen** — `hv-tabel` ‘rol × camera’ (`?blad=cameratoegang`): geen · gebeurtenissen · momentopnamen · video; voor uitvoerders — `hv-stand` (§6).

## 9. Toegang / Доступ

- **Slot, poort** — het blad `?blad=apparaat:<id>&deel=bediening`: toestand, «замикається / vergrendelt» of «відчиняється / gaat open», het blok «Якщо замок розрядився / Als het slot leeg is» (`hv-noodstroom`: ‘62 % ≈ 40 dagen’, mechanische sleutel, externe voeding), automatisch vergrendelen met een hint. ‘Ontgrendelen…’ → `hv-gevaar` met het gevolg → houdrail of ‘Bevestigen (3)’ · «Скасувати / Annuleren» → bevestiging van de aanmelding.
- **Codes en gasten** (`hv-toegangscode`): de wizard `?dialoog=gast` — wie → deur → wanneer (standaard 24 u; de eigenaar stelt elke termijn in, of ‘zonder termijn’ met een blijvend ‘!’) → «Що про вас записується / Wat er over je wordt vastgelegd» met het vinkje ‘aan de persoon getoond’ → gevolg → bevestiging van de aanmelding. De sjablonen «Візит майстра / Bezoek monteur» en «Обслуга / Hulp» hebben dezelfde stap; bij ‘Hulp’ neemt de camera bij de ingang tijdens het bezoek standaard niet op.
- **Oproep van de deur** (`hv-oproep`; op de tv alleen bekijken): beeld, «Відповісти / Opnemen», snelle antwoorden «Залиште біля дверей / Zet het maar bij de deur» en «Зараз підійду / Ik kom eraan», «Відчинити / Openen» via `hv-gevaar`, «Відхилити / Weigeren»; toestanden дзвонить / belt aan · розмова / in gesprek · пропущено / gemist. Logboek «Відвідувачі / Bezoekers».

## 10. Sensoren / Датчики en de noodlaag

Regel van 2×1: toestand, ouderdom, batterij (drempel 15 %), laatste test; «Тест і покриття / Test en dekking» — vervanging na 10 jaar, onbedekte verdiepingen. Veroudering: slot en alarm — 5 min, contacten — 15 min, rook — hartslag 24 u. Beveiligingsgebeurtenissen in de stroom `/api/huis/stroom` zijn dringend.

`hv-nood` verschijnt in elke modus, in beide talen, uit de cache en zonder internet; op de telefoon en bredere schermen als balk bovenaan, op kleine profielen over het hele scherm.

```
ECHT · --fout-zacht, rand 4 px --fout-vlak, knoppen 64 px
┌────────────────────────────────────────────────┐
│ AlarmSmoke Дим: кухня / Rook: keuken 2 mld·40 s│
│ Вийдіть надвір. / Ga naar buiten.              │
│ Наберіть 112 з телефона / Bel 112 met je       │
│ telefoon        Lindelaan 12 · 3581 AB Utrecht │
│ [ Усі в безпеці / Iedereen veilig ]   2 van 3  │
│ [ Приглушити 10 хв… / 10 min dempen… ▣ ]       │
│ [ Зупинити самостійні дії / … stoppen ]        │
└────────────────────────────────────────────────┘
OEFENING · simulatie, --info-zacht
┌────────────────────────────────────────────────┐
│ kolf Навчальна тривога / Oefenalarm            │
│ Rook: keuken                                   │
│ Справжньої небезпеки немає / Geen echt gevaar  │
│ [ Завершити / Stoppen ] [ Aan iedereen tonen… ]│
└────────────────────────────────────────────────┘
```

- **112.** Op de telefoon de link «Подзвонити 112 / Bel 112», op andere schermen een regel; daaronder het adres uit ‘Systeem → Thuis’; zonder adres verschijnt een regel in ‘Systeemgezondheid’: «Адресу не задано: аварійний шар її не покаже / Geen adres ingesteld: het noodscherm toont het niet».
- **Oefenalarm:** zonder 112, met een verzonnen adres dat als zodanig is gemarkeerd; alleen op de schermen van wie het start, op andere pas na «Показати всім / Aan iedereen tonen»; een zachter signaal. Het woord ‘Simulatie’ in `hv-sim` verdwijnt bij geen enkele breedte.
- **Dempen** is een kritieke actie met het ritueel van het profiel; 10 min, met een timer op alle schermen; een tweede melder of CO brengt het alarm terug; «Приглушує сповіщення хаба, не сам датчик / Dempt de meldingen van de hub, niet de melder zelf».
- **CO, gas:** «Вийдіть надвір, не торкайтеся вимикачів / Ga naar buiten, raak geen schakelaars aan». **Water:** de sjabloonregel ‘Lekkage → water dichtdraaien’ wordt voorgesteld bij het instellen van de sensor; zolang de toestemming op ‘Uit’ staat, zegt het blad: «Клапан сам не перекриється: дозвіл вимкнено / De klep sluit niet vanzelf: toestemming staat uit».
- Appèl «вдома / thuis · вийшов / weg · невідомо / onbekend»; de vluchtroute op de plattegrond.

## 11. Schermprofielen

- `wand`: alarm, aftelring, `hv-pincode`, oproep, paniekknop vanaf het vergrendelde scherm. `deur`: vóór de code — tijd, weer, «Подзвонити / Aanbellen», «Ввести код / Code invoeren»; erna — «Йду / Ik ga weg», «Я вдома / Ik ben thuis», aftelring.
- `vierkant`, `rond`, `klein`: de wijzerplaat «Тривоги / Alarmen» en een tijdelijke `deurbel`; op `rond` loopt de aftelling als boog langs de rand. `strook`: schild en woord van het alarm, ‘N open’; oproep en alarm over de hele strook.
- `tv`: alleen bekijken — toestand, raster 1/4, oproep. `horloge`: ‘Status’ in één woord, «Замкнути все / Alles vergrendelen» op een persoonlijk horloge. `inkt`: toestand, wat er open staat, tijdstip van bijwerken, zonder video.

## 12. Privacy, AVG, controlespoor

- De privacypagina's horen bij de zone Mensen; Beveiliging levert daarvoor «Хто дивився / Wie keek mee», het videopad voor «Куди йдуть дані / Waar gaan gegevens heen» en de standaardtermijnen (§17, punt 5); incidenten blijven bewaard tot de eigenaar ze verwijdert.
- **Аудит / Controlespoor** — `/activiteit/geschiedenis?filter=audit`, alleen toevoegen, 2 jaar (plan §4): ‘Claude vroeg de poort te openen — Taras weigerde’; zonder overbodige details over aanwezigheid; exporteren is een gevoelige actie met de waarschuwing «файл розкриває розпорядок родини / het bestand toont het dagritme van het gezin».

## 13. Hints en teksten

Gevoelige acties en alarmstanden hebben `hv-gevolg` (berekend door `/api/huis/gevolg`); gevaarlijke en kritieke acties hebben de kaart ‘!’.

- **‘i’ bij ‘Nacht’.** «Що станеться: охороняються периметр і перший поверх. Пов'язано з: вікно спальні на провітрюванні буде обійдено. Як повернути: „Повернути“ 10 с.» / «Wat er gebeurt: de schil en de begane grond worden bewaakt. Hangt samen met: het slaapkamerraam op kiepstand wordt overbrugd. Terugdraaien: ‘Ongedaan maken’ 10 s.»
- **‘!’ bij ‘Altijd’ voor ‘Poort openen’ door een automatisering.** «Що може статися: ворота відчиняться, коли вдома нікого немає. Пов'язано з: охорона периметра. Як повернути: „Зачинити“. Хто зможе це запускати: автоматизація „Приїзд додому“, без запиту. Як вимкнути: „Вимкнено“ тут або „Зупинити самостійні дії“.» / «Wat er kan gebeuren: de poort gaat open terwijl niemand thuis is. Hangt samen met: alarm schil. Terugdraaien: ‘Sluiten’. Wie dit kan starten: automatisering ‘Thuiskomst’, zonder te vragen. Uitzetten: ‘Uit’ hier of ‘Zelfstandige acties stoppen’.»
- **‘!’ bij ‘Altijd’ voor ‘Camerabeeld’ door een agent.** «Що може статися: агент бачить дім і двір, а напис у кадрі може підштовхнути його до хибної дії. Пов'язано з: „Приватність удома“. Як повернути: побаченого не повернути, кожен перегляд є в „Хто дивився“. Хто зможе це запускати: агент „Помічник“. Як вимкнути: „Вимкнено“ тут.» / «Wat er kan gebeuren: de agent ziet huis en tuin, en tekst in beeld kan hem tot een verkeerde actie verleiden. Hangt samen met: ‘Privé thuis’. Terugdraaien: niet mogelijk, elke weergave staat in ‘Wie keek mee’. Wie dit kan starten: agent ‘Assistent’. Uitzetten: ‘Uit’ hier.»
- **Weigering op het paneel.** «Чому ні: особистий код не підійшов тричі. Що перевірити: чи це ваш код, а не код панелі. Що можна натомість: зніміть охорону з телефона.» / «Waarom niet: de persoonlijke code klopte drie keer niet. Wat te controleren: of dit je eigen code is en niet de paneelcode. Wat wel kan: zet het alarm uit met je telefoon.»

## 14. Overige schermen en scenario's

Naast §3 en §12: ‘Alarmbezorging’ `/activiteit/regels?filter=alarm`; batterijen `/activiteit/onderhoud?filter=beveiliging`; de persoonlijke code `/instellingen/mensen/<persoon>/code`; een scherm koppelen met de stap «Увімкнути звук тривоги на цьому екрані / Alarmgeluid op dit scherm aanzetten» — `/instellingen/schermen?dialoog=koppelen`; de doorsnede van toestemmingen `/instellingen/toestemmingen?filter=beveiliging`; verzoeken van agenten — `/assistent/agenten`. In de maquette openen de noodlaag en de oproep via `?dialoog=nood`, `oefenalarm`, `oproep`.

Scenario's van de simulator: «Нічне вторгнення / Nachtelijke inbraak», «Дим на кухні / Rook in de keuken», «Протікання під мийкою / Lekkage onder het aanrecht», «Кур'єр дзвонить / Bezorger belt aan», «Датчик замовк / Sensor zwijgt», «Замок заклинило / Slot klemt», «Агент просить відчинити ворота / Agent vraagt de poort te openen», «Сервер перезапущено під охороною / Server herstart tijdens alarm».

## 15. Componenten

- **Uit OT:** `hv-alarmstand`, `hv-aftel` (ook de grote uitloop- en inloopring), `hv-pincode`, `hv-oproep`, `hv-nood` (rook, CO, gas, water, inbraak, paniekknop; de oefenvariant — `--info-zacht`), `hv-gevaar`, `hv-rail`, `hv-risico`, `hv-stand`, `hv-gevolg`, `hv-verzoek`, `hv-tegel` met het teken met ritueel.
- **Nieuw in de zone:** `hv-bewaking` ‘Wie bewaakt wat’; `hv-kanaal` — bezorgkanaal met test; `hv-camera` — tegel en speler (momentopname of stroom, ouderdom van het beeld, privacyvervanging, ‘Geen opnamen’); `hv-cameraraster`; `hv-masker`; `hv-avg-hulp`; `hv-controle`; `hv-toegangscode`; `hv-noodstroom`; `hv-bekeken`; `hv-incident` — tijdlijn, momentopnamen, handelingen van mensen.

## 16. Gedekt en uitgesteld

| Fase | Wat uit deze zone |
|---|---|
| 0 | alle schermen in de maquette; het uitgestelde met de stempel «пізніше / later» |
| 1 Schil en demohuis | sloten, poorten, kleppen, sirene, sensoren, 4 camera's en de deurbel van het demohuis; de kaart ‘Beveiliging’ op ‘Thuis’ |
| 2 Bediening | bladen van alle klassen van de zone, teken met ritueel, `hv-gevaar`, `hv-stand` voor elke actie, `hv-nood`, `huis.alarm` en `huis.toegang`, controlespoor |
| 3 Opdracht | ‘Wat staat er open?’, ‘Camera's’, ‘Alles vergrendelen’ |
| 5 Automatisering en agenten | hulpmiddelen van de zone, alarmregels en -reacties, alarmstappen in huisstanden |
| 6 Schermen | profielen van de zone, codes op het paneel, koppelen, paneelgeluid, meldingen op het apparaat |
| 7 Geschiedenis | sporen van alarm en camera's, gebeurtenissen, incident |
| 8 Mensen | ‘rol × camera’, rolrechten, ‘Privé thuis’, ‘Wie keek mee’, termijnen |
| 9 Beveiliging en camera's | alarmmotor en escalatie, volledige noodlaag, momentopnamen van camera's, maskers, AVG-hulp, gasten, oproep, paniekknop, scenario's |
| 11 Techniek | batterijen, test en dekking, ‘Systeemgezondheid’ |
| 12 Bronnen | echte sensoren, sloten en sirene (na het externe kanaal, de waakhond en de eenmalige bevestiging), echte camera's, daarna HLS en opnamen |

Buiten de schaal: livebeeld met korte vertraging en geluid in twee richtingen; een kopie van clips buitenshuis; de stand ‘Eigen’; een dwangcode, NL-Alert; zoeken in beelden en camera's draaien — na de opslag voor opnamen; ONVIF, SIP, koppelingen met alarmcentrales.

## 17. Besluiten voor de eigenaar

1. **Extern alarmkanaal** (telefoongesprek, sms of berichtenapp) en de plek van de externe waakhond buiten de VM in huis — voorwaarde voor echte rookmelders en een echt alarmsysteem (plan §7).
2. **Eenmalige bevestiging per actie** in plaats van 5 min per sessie (plan §7).
3. **Videopad:** conversiedienst, voorwaarden van de tunnel voor video, schijf en quotum voor opnamen, kopie buitenshuis (plan §7).
4. **Camera en microfoon in de browser** voor het knooppunt huis — daarvan hangt het gesprek in twee richtingen met de deur af (plan §7).
5. **Bewaartermijnen** van de zone: clips 14 dagen, momentopnamen van bezoekers 14, gebeurtenissen 90, ‘Wie keek mee’ 90 (plan §7).
6. **Gezichts- en kentekenherkenning** (biometrie van derden, AVG): niet leveren, of leveren met een toestemmingsschakelaar die standaard uit staat.
