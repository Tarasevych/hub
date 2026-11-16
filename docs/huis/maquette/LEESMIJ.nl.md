> 🌐 **Taal / Мова:** [Українська](ЧИТАЙ.uk.md) | **Nederlands**

# Maquette ‘Levend huis’ — handleiding voor schermmakers

De klikbare maquette van `huis.tarasevych.com` (HUIS-001, fase 0): één zelfstandig HTML-bestand op een ingebouwde minisimulator.
Normatief zijn `docs/huis/ДИЗАЙН-МОВА-ЖИВИЙ-ДІМ-20261110.uk.md` en `stijl/hv-tokens.json` (de enige bron van kleuren).

## 1. Opbouw

| Map | Inhoud |
|---|---|
| `stijl/` | `hv-tokens.json` → de samensteller maakt er het tokenblok van; `basis.css` (reset, tonen, knoppen, papier), `schil.css` (bediening, kop, navigatie), `onderdelen.css` (onderdelen `hv-*`), `hemel.css` (hemel, held, doorsnede, ‘Thuis’), `bladen.css` (bladen, dialogen, noodlaag), `gezichten.css` (speciale profielen) |
| `gegevens/` | `paspoort.js` (demohuis), `tarief.js` (prijzen voor 48 uur), `scenarios.js` (15 scenario's) |
| `kern/` | `tekst.js`, `opslag.js`, `staat.js`, `gevaar.js`, `handeling.js`, `onderdelen.js`, `grafiek.js`, `hemel.js`, `blad.js`, `schil.js`, `lagen.js`, `pult.js` |
| `schermen/` | `nog-niet.js` (stompjes voor alle routes), `thuis.js`, `kamers.js`, `bladen-licht.js`, `gezichten.js` — de voorbeeldmodules; zet je eigen bestand hier |
| `volgorde.json` | volgorde van samenstellen; `schermen/*` pakt een nieuw bestand vanzelf mee |

Namen van bestanden, functies, klassen en sleutels zijn Nederlands; commentaar is Oekraïens of Nederlands.
Elk bestand is `(function (HV) { 'use strict'; … })(window.HV = window.HV || {});` en registreert bij het laden alleen (geen DOM).

## 2. Registreren

Een latere registratie met hetzelfde `id` **vervangt** het stompje; tabbladen worden op `id` samengevoegd.

```js
HV.scherm({ id, sectie, titel:[uk,nl], icoon, adres, tabs:[{ id, titel:[uk,nl], adres, render(ctx), verborgen? }], render(ctx) });
HV.tab(schermId, { id, titel:[uk,nl], adres, render(ctx) });           // één tabblad van een bestaand scherm
HV.blad({ soort, past(apparaat), titel(apparaat), delen:{ bediening(ctx,a), geschiedenis(ctx,a), instellingen(ctx,a) } });
HV.blad({ soort, vrij:true, titel:[uk,nl] | (ctx,id)=>…, icoon, sub(ctx,id), render(ctx,id) });   // vrij blad
HV.gezicht({ id, profiel, titel:[uk,nl], render(ctx) });               // wijzerplaat van een speciaal profiel
HV.actie(naam, (ctx, gegevens, element, gebeurtenis) => …, { kijk | muteert }?); // delegatie op data-actie; derde argument — §4.2
HV.zijzone(sectie, (ctx) => html);                                     // eigen inhoud voor de zone ‘plattegrond’ op brede schermen (§4.2)
```

- Het `id` van een scherm, tabblad of apparaat en de `soort` van een blad bestaan alleen uit kleine letters en cijfers (het zijn delen van `location.hash`).
- `ctx`: `{ t, h, p, staat, profiel, rol, taal, dichtheid, route, open(adres), blad(id), meld(…), doe(…) }`.
- `render` geeft een **HTML-tekenreeks** terug; haal gegevens door `HV.h`. De sleutel van een knoop is `data-k="…"` (het hertekenen bewaart knopen, focus en scrollpositie).
- Route: `ctx.open('energie-tarief')`, `ctx.open('kamers-kamer-woonkamer')`; blad: `ctx.blad('apparaat:torsher')`, `ctx.blad('meldingen')`, `ctx.blad(null)`.
  Het adres op de echte site (`/energie/tarief?blad=apparaat:torsher&deel=…`) staat vanzelf boven het doek — uit het `adres` van scherm en tabblad.
- Blad van een apparaat: het laatst geregistreerde blad waarvan `past(a)` `true` geeft. Delen die je niet levert, tekent het geraamte (`HV.bladDelen.geschiedenis`, `.instellingen`, `.algemeen`).
- Kleine schermtoestand (filter, gekozen tab): `HV.ui.lees(naam, standaard)` / `HV.ui.zet(naam, waarde)`; in de opmaak `data-actie="ui" data-naam="…" data-waarde="…"`.

## 3. Toestand en acties

- Lezen: `ctx.staat` (de wereld) en `HV.kijk.*` — `alle(filter)`, `inKamer(id, filter)`, `soort(s)`, `isAan(a)`, `lampenAan(kamer?)`, `open()`, `temperatuur(kamer)`, `thuis()`, `leeftijd(a)`.
  Apparaat: `{ id, soort, kamer, naam:[uk,nl], mog:[…], st:{…}, beschikbaar:'ok'|'onbereikbaar'|'verouderd'|'verondersteld'|'slaapt', wacht?, maker? }`.
- **De enige plek voor een actie** is `HV.doe({ doel, mogelijkheid, waarde, door?, stil? })` → `Promise<{ ok, reden?, ongewijzigd? }>` (`ongewijzigd` — de opdracht veranderde niets, zie 4.3).
  `doel`: id van een apparaat | `'huis'` | `'alle'` | `'scene:<id>'` | `'kamer:<id>'`. Poorten: verbinding → bereikbaarheid → rol → risiconiveau (ritueel) → toestemming van de uitvoerder. De regel in het logboek, het makerteken en de melding komen vanzelf.
- Gewenste waarde tijdens het wachten: `HV.gewenst(a, 'helderheid')`; een waarde in woorden: `HV.beschrijf(a, mogelijkheid, waarde)`.
- Niveaus en toestemmingen: `HV.gevaar.vind(doel, mogelijkheid, waarde)` → `{ sleutel, niveau, naam, gevolg, risico }`; `HV.gevaar.stand(uitvoerder, sleutel)`; wijzigen kan alleen met `HV.gevaar.zetStand(…)` (werkt alleen voor de rol ‘eigenaar’; voor een agent bestaat zo'n functie niet). Een nieuwe gevaarlijke of kritieke actie komt in `kern/gevaar.js` **met** `gevolg` en `risico` — zonder slaagt de controle niet.
- Schuif: `data-schuif="naam"` → de afhandeling krijgt `{ waarde, fase:'sleep'|'klaar' }`; tijdens het slepen wordt het scherm niet opnieuw getekend, stuur de opdracht bij `klaar`.
- Melding: `HV.meld({ titel, tekst, gewicht:'info'|'belangrijk'|'alarm', maker, icoon, terug })`; logboek: `HV.logboek.voegToe({ maker, wat:[uk,nl], waarom, was, werd, soort:'huis.*' })`.

## 4. Onderdelen `HV.o.*` (geven HTML terug)

`knop({tekst,icoon,actie,gegevens,soort:'hoofd'|'gewoon'|'stil',klein,uit,gedrukt})` · `icoonknop({icoon,aria,actie,gegevens,teller})` · `chip({icoon,tekst|html,toon,actie,gegevens,filter,gekozen})` ·
`tegel(apparaat,{vorm:'1x1'|'2x1'|'2x2'|'4x2',metKamer,bediening})` · `beeld(apparaat)` · `kamerkaart(kamer)` · `telemetrie({id,icoon,naam,stand,lading,doel,bereik,getallen,actie})` · `scene(scene,actief)` ·
`blok({id,titel,teller,inhoud,uitleg,extra,vast,samenvatting,dicht})` · `held({datum,zin,kort,chips,rechts})` · `nu(items)` · `leeg({icoon,titel,tekst,actie})` · `skelet(vorm,aantal)` ·
`schakel({aan,icoon,toon,staat,ritueel,actie,gegevens,aria})` · `schuif({label,waarde,min,max,stap,eenheid,toon,actie,gegevens,gewenst,uit})` · `wijzer({doel,gemeten,toon,bezig,actie,gegevens})` ·
`kleur({tint,verzadiging,wijze,actie,gegevens})` · `aftel({rest,totaal,icoon,klaar})` · `segment({label,opties:[{id,label,icoon}],waarde,actie,gegevens})` · `werkmodus({waarde,actie,gegevens})` · `stapper({actie,gegevens,stap,label,waarde})` ·
`stand({uitvoerder,actie,rol})` · `risico(niveau)` · `gevolg(tekst,{soort:'i'|'uitroep',kop})` · `stempel({waarde,leeftijd,bron,staat})` · `versheid(w)` · `sim(w)` · `maker(maker)` ·
`zoneheld({id,icoon,toon,boven,zin,sub,tellers:[{waarde,label,toon,actie}],actie,extra,stempel})` · `toost(x,{meer})` · `bericht(regel,{open,zonderSim})` · `rij({icoon,naam,sub,waarde,actie,gegevens})` · `kaart({titel,inhoud})` · `getal({maat,label,waarde,sub,toon})` · `later(tekst)`.

Grafieken `HV.grafiek.*`: `lijn`, `staven`, `toestanden` (een baan mag `rechts` hebben — HTML rechts in het spoor), `warmtekaart`, `ring`, `vonk` (eigen SVG, merktekens, ‘Als tabel tonen’; de buitenste labels van de X-as liggen tegen de rand). Tekst en getallen: `HV.t(uk,nl)`, `HV.p([uk,nl])`, `HV.getal(n,dec)`, `HV.maat(n,eenheid,dec)`, `HV.euro`, `HV.tijd`, `HV.duur`, `HV.oud`, `HV.meervoud`. Tonen: de klasse `hv-toon-aan|warm|koud|zon|net-in|net-uit|batterij|auto|neutraal`.

### 4.1. Tegels, actieteken, toestanden (ronde 2)

- **De inhoud bepaalt de vorm.** `o.tegel(a, { bediening: true })` — voor ‘Favorieten’ en de kamerpagina: een apparaat met een niveauorgaan (`HV.niveauOrgaan(a)`: helderheid, doeltemperatuur, gordijnen, volume) wordt een tegel met bediening «−» · `hv-schuif` · «+». Het rooster `hv-tegels` geeft haar de vorm 2×2 alleen als de kolom minstens 224 px breed is (vanaf een doek van 700 px zijn de kolommen dat altijd); op de telefoon beslaat ze de hele rij (4×2) en toont ze rechts het getal `--hv-getal-m` (container `tegel`, vanaf 300 px). `vorm:'2x2'` zonder niveauorgaan wordt 2×1 getekend — geen hoge lege tegel meer. `vorm:'4x2'` beslaat altijd de hele rij. De schuif van de tegel stuurt de opdracht bij `klaar` (actie `tegel-schuif`).
- **De regel ‘waarde · leeftijd’** bestaat uit ondeelbare stukken (`.hv-nb`): de punt hoort bij het volgende stuk en verdwijnt aan het begin van een regel; de naam krijgt tot twee regels zonder puntjes. Voor eigen tegels: `HV.tegelWaardeRegel([{ html, klas }])`.
- **Teken met ritueel.** `o.schakel({ ritueel:'gevaarlijk'|'kritiek', actie, … })` — een vierkant met dubbele rand in plaats van een cirkel; aanraken voert zelf niets uit: `HV.doe` opent `hv-gevaar`. Het niveau in de huidige richting geeft `HV.ritueelVan(a, beeld.schakel)` (verondersteld of verouderd — de vorm van het hoogste van beide richtingen). `o.tegel` doet dit zelf: een vergrendeld slot is een vierkant, een ontgrendeld een cirkel. Het oude `kritiek:true` met `actie` betekent `ritueel:'kritiek'`, zonder `actie` een passief teken (de achthoek bestaat niet meer).
- **Toestanden.** `staat:'bezig'` — ‘bezig’: klassen met een slag (`HV.gangKlassen`: gordijnen, jaloezieën, poort, garagedeur, slot, klep) tonen na het eerste antwoord het richtingwoord en het waargenomen percentage (`a.wacht.fase==='bezig'`, `a.wacht.voortgang`); de tijd tot ‘niet uitgevoerd’ is `a.wacht.grens` per klasse (`maten.gedrag.wachtPerKlasse`). ‘Niet uitgevoerd’ — `HV.mislukt(a)` (rand 2 px `--fout`, `CircleX`, 60 s of tot de volgende actie).
- **De held** is een eigen container `held`: tot 600 px de korte zin, 600–999 de volle zin in één kolom, vanaf 1000 px zin en doorsnede. Het doorsnedeblok van ‘Thuis’ verschijnt vanzelf als de held geen doorsnede toont (container `thuis`). Andere containers van de kern: `doorsnede`, `nurij` (regel van ‘Nu belangrijk’), `kamer`, `kamerlijst`, `tegel`.
- **De hemel** is samengedrukt tot de held (`--hv-hemel-einde`) en vervaagt daaronder naar papier; op andere pagina's een stille hemel (een zweem van de fase bovenaan, daarna `--bg`). De neerslagarcering leeft in de held. Op de hemel alleen `--text` (de statische controle vangt `--muted` in hemelselectoren).
- **Schil.** ‘Opdracht’ is het middelste punt van de onderbalk op de telefoon (geen zwevende knop meer). Op de telefoon staat onder de kop de rij `hv-sim` van 28 px; in de kop een papieren pil met de ingeklapte heldregel en de chip ‘belangrijk’ (actie `naar-nu`). `o.sim(w)` toont geen tijd meer. `HV.dagstrook(ctx, { kort, makers })` — de baan van makers alleen met `makers:true`.

### 4.2. Zoneheld, verbinding, meldingen, brede schermen (ronde 3)

- **Eén zoneheld voor alle zones: `o.zoneheld({ id, icoon, toon, boven, zin, sub, tellers:[{ waarde, label, toon, actie }], actie, extra, stempel })`.** Een papieren kaart zonder verloop: het bovenschrift `boven`, de zin `zin` (HTML), tot vier tellers in **één vorm** (getal 28/600 en bijschrift 12/600; `toon` kleurt alleen het getal; met `actie` wordt de teller een knop) en één hoofdactie `actie` (zoals `o.knop`). De toon van de zone zit alleen in het teken en de dunne bovenlijn. Eigen container `zoneheld`: smal — tellers als raster onder de zin, vanaf 720 px — rechts op één rij. Maak geen eigen helden met verloop of eigen tellervormen in schermbestanden — voorbeeld: ‘Kamers → Nu’ (`schermen/kamers.js`).
- **‘Geen verbinding’ betekent ‘alleen bekijken’ voor alles, niet alleen voor `HV.doe`.** De kern kent de soort van elke actie: `kijk` — toont alleen (filter, tabblad, zoom) en werkt altijd; `muteert` — verandert het huis of schrijft in het logboek: zonder verbinding krijgt het orgaan `aria-disabled="true" data-reden="verbinding"` (dat doen `o.knop`, `o.icoonknop`, `o.chip`, `o.schakel`, `o.segment`, `o.stapper`, `o.schuif`, `o.scene`, `o.stand`), de actie start niet en een tik toont ‘Niet uitgevoerd: geen verbinding met het huis’. Zeg de soort zelf: `HV.actie('naam', fn, { kijk: true })` of `{ muteert: true }`. Zonder markering geldt een actie die zelf `.doe(` of `logboek.voegToe(` aanroept als wijzigend; de rest draait ‘op proef’ — probeerde ze in het logboek te schrijven, dan gaan wereld en toestemmingen terug naar de momentopname en verdwijnen haar meldingen. Voor eigen opmaak: `HV.orgaanDood(actie)`, `HV.zonderVerbinding()`, `HV.meldZonderVerbinding()`. Uitzondering: de maquettepagina’s ‘Systeem → Simulator’, ‘Toonzaal’ en ‘Onderdelen’ (`HV.vrijeTabs`) bedienen de maquette en werken altijd. De dialogen `HV.schil.gevaar` en `herbevestig` openen niet zonder verbinding; `HV.gevaar.zetStand` weigert.
- **Verzoek ‘Vragen’.** `HV.verzoek(id, true)` haalt het verzoek pas uit ‘Nu belangrijk’ na `{ ok: true }` van het huis; is de actie niet uitgevoerd, dan blijft het verzoek `wacht`, ziet de mens de reden en staat in het logboek ‘Niet uitgevoerd: …’. Tijdens het uitvoeren is `stand === 'bezig'`.
- **Meldingen.** Er staat er één (alarm eerst, anders de nieuwste) met de teller ‘+N’ die naar het meldingencentrum leidt; geen stapel. Met ‘Ongedaan maken’ blijft ze 10 s staan, een belangrijke 6 s, een gewone 4 s (`duur` in `HV.meld` wijzigt dat); dezelfde melding komt er niet twee keer bij. `titel`, `tekst`, `hoe` — een tekst of een paar `[uk, nl]`. ‘Ongedaan maken’ staat onder de tekst. Op de telefoon met een open blad is de melding één regel boven het blad.
- **Houdrail.** De korte tekst van de rail is het veld `houd:[uk,nl]` van de actie in `kern/gevaar.js` (‘Houd vast om te ontgrendelen’); zonder dat veld — ‘Houd vast om te bevestigen’. De tekst is altijd één regel.
- **Toetsenbord en geschiedenis.** Modale lagen (noodlaag, gevaarlijke actie, Opdracht, uitleg, blad op de telefoon) houden de focus zelf vast; de noodlaag zet de focus op ‘Gezien — sirene dempen’. Vanaf 900 px is het blad niet modaal (`aria-modal="false"`). Een blad sluiten is een stap ‘terug’ in de browsergeschiedenis, geen nieuwe regel; ‘terug’ onder een dialoog sluit alleen de dialoog. Bij een taalwissel sluiten uitleg en meldingen en volgt `<html lang>` de taal.
- **Brede schermen.** De profielen `breed` (vanaf 1800 px) en `ultrabreed` (vanaf 2400 px) krijgen zijzones van de kern: ‘huis in doorsnede’ en ‘logboek live’ (de laatste 8 regels) rechts, en vanaf 2400 px drie zones ‘plattegrond en kamers | inhoud | logboek’. De grenzen verschuif je met de muis of de pijltoetsen (breedtes in `HV.opslag 'zone-breed'`); een blad komt op de plek van de rechterzone. Eigen inhoud voor de zone ‘plattegrond’ geeft een onderdeel met `HV.zijzone('garage', ctx => html)` (een compacte plattegrond of kaart in `<section class="hv-zijkaart">`); zonder toont de kern de doorsnede met een link naar plattegrond of kaart. Het doek heeft dan de klassen `heeft-zij` en `heeft-zij-links`.
- **Klein.** De hemel van ‘Thuis’ scrolt mee met de held. Scrollende stroken (`hv-tabs`, `hv-held__chips`, `hv-scenes`, `hv-segment--rol`) zetten het actieve punt zelf in beeld en vervagen de rand waarachter nog inhoud staat. `HV.huiszin(ctx).toon` heeft een vierde waarde `'alarm'`. In `HV.grafiek.toestanden` volgt de naamkolom het langste bijschrift (56–96 px, daarna twee regels); het bijschrift ‘nu’ blijft binnen de kaart. ‘−/+’ naast `o.schuif` volgen de stap van de schuif en staan uit op de grens. Zet in het raster `hv-tegels` twee rijtegels naast een tegel met bediening in `<div class="hv-tegels__stapel">` (`HV.tegelMetBediening(a)` zegt of de tegel hoog wordt).

### 4.3. Verzoeken en toestemmingen, ‘Is al zo’, logboekregel, taal (ronde 4)

- **Een verzoek bestaat alleen bij ‘Vragen’.** Zet de eigenaar de toestemming van een actie voor een uitvoerder om (`HV.gevaar.zetStand`), dan handelt de kern de wachtende verzoeken zelf af (`HV.verzoekenNaStand(uitvoerder, sleutel, waarde)`): bij ‘Uit’ vervallen ze (stand `verlopen`, `v.vervallen = { reden: 'stand-uit', tijd }`, een regel ‘Verzoek vervallen: …’ met de reden ‘toestemming uitgezet’, weg uit ‘Nu belangrijk’ en uit de wachtrijen); bij ‘Altijd’ worden ze uitgevoerd op de nieuwe toestemming (de regel van de actie met ‘Toegestaan door: toestemming ‘Altijd’’, `v.viaStand = 'altijd'`). Een verzoek goedkeuren bij ‘Uit’ kan vanaf geen enkele knop: `HV.verzoek(id, true)` geeft `{ ok: false, reden: 'stand-uit' }` en laat het verzoek vervallen; `goedgekeurd: true` in `HV.doe` gaat nooit over ‘Uit’ heen. Is de toestemming langs een andere weg ‘Uit’ geworden (`zetStandStil`, een verlopen termijn), dan vervalt het verzoek in het volgende beeld volgens dezelfde regel. Teken eigen verzoekkaarten op `v.stand`: `wacht` · `bezig` · `goedgekeurd` · `afgewezen` · `verlopen` (vervallen als `v.vervallen` bestaat). Een scenario dat een verzoek zaait, zet zelf de toestemming: `HV.gevaar.zetStandStil(uitvoerder, sleutel, 'vragen')`. Hetzelfde verzoek (uitvoerder, actie, doel, waarde) ontstaat geen tweede keer — `HV.doe` geeft het `verzoek` van het bestaande terug.
- **‘Is al zo / Уже так’.** Een opdracht die niets verandert (het waargenomene is al gelijk aan het gewenste) schrijft geen regel en toont geen ‘was → werd’ met gelijke waarden: `HV.doe` geeft `{ ok: true, ongewijzigd: true }`; een mens ziet de korte melding ‘Is al zo’ (en krijgt geen ritueel), een uitvoerder zonder mens niets (bij ‘Vragen’ ontstaat geen verzoek; bij ‘Uit’ laat de poging zoals altijd ‘Niet uitgevoerd’ achter). Dit geldt alleen voor toestanden die de kern zeker kent (`aan`, `laden`, `open`, `vergrendeld`, `alarmstand`, `helderheid`, `kleurtemp`, `kleur`, `positie`, `kantel`, `doel`, `volume`, `programma`, `robot`, bekende woorden van `modus`/`stand`/`effect`/`ventilator`/`bron`, de huisstand, doel en licht van een kamer, ‘alle lampen’); eigen mogelijkheden van een zone, eenmalige opdrachten, een apparaat zonder terugmelding en een scène worden altijd uitgevoerd. Schrijf je na `HV.doe` een eigen melding of pas je de logboekregel aan, doe dat dan alleen als `!r.ongewijzigd`.
- **‘Ongedaan maken’ is een actie van de mens.** Terugdraaien vanuit de melding doet wie erop tikt, niet de uitvoerder van de actie: bij ‘Vragen’ wordt het terugdraaien van een agentactie geen nieuw verzoek.
- **Logboekregel zonder dubbele waarde.** `o.bericht` toont de naam en één wijzigingschip: `o.berichtKop(regel)` → `{ naam, delta }` (de waarde aan het eind van de naam verdwijnt als ‘was → werd’ ernaast staat; gelijke ‘was’ en ‘werd’ is geen wijziging, `delta === null`), `o.deltaChip(delta)` is de chip zelf. Gebruik die voor een eigen gebeurtenissenstroom in plaats van `was + ' → ' + werd` te plakken.
- **Een huis zonder verleden.** Een scenario met `w.logboekVanaf` (het moment waarop het huis is aangemaakt; zo doet ‘Eerste start’ het) heeft geen logboekregels van daarvoor: de schil haalt ze weg vóór en na elk tekenen (`HV.staat.snoeiLogboek()`), welke module ze ook heeft gezaaid. Het scenarioveld `zonderRegel: true` — de start van het scenario schrijft geen eigen regel.
- **Focus in een laag** wordt direct na het tekenen van de laag gezet (wachtrij in `kern/lagen.js`), niet met een timer: een laat beeld laat de focus niet meer buiten het dialoogvenster.
- **Taal.** Reken tekst nooit één keer uit: niet bij het laden van de module (`var X = t(…)` op het hoogste niveau, ook `HV.p`, `HV.woord.*`, `HV.meervoud`, `HV.datum`), niet in een cache en niet in de toestand — hij wisselt dan niet mee met de taal. Bewaar het paar `[uk, nl]` en roep `t()`/`HV.p()` aan in `render`. De statische controle vangt een aanroep tijdens het laden (bestand:regel; uitzondering — `taal-toegestaan.json` → `"laadtijdToegestaan": ["bestand:regel"]`), de rookproef vangt Cyrillisch in de Nederlandse stand op elke route, ook na de wissel uk → nl in dezelfde sessie. Bewust Oekraïense tekst in de Nederlandse stand (de naam van de taal, het veld ‘Naam in het Oekraïens’) zet je in een element met `lang="uk"` — alleen dat laat de proef door.

### 4.4. Poort van het besluit, tijd van een verzoek, intrekken, tekst van de actie (ronde 5)

Alles hieronder is aan de kern toegevoegd zonder bestaande aanroepen te wijzigen: oude aanroepen werken als voorheen.

- **Een besluit over een verzoek loopt alleen via `HV.verzoek(id, ja, opties?)`; de poort staat daar zelf in**, dus geen enkele knop gaat eromheen (‘Nu belangrijk’, de kaart in het logboek, de wachtrij van de agenten): verbinding → **wie beslist** (`HV.gevaar.magBeslissen(rol, niveau | actie)`: gevaarlijk en kritiek — alleen de eigenaar; gewoon en gevoelig — de eigenaar of een bewoner; een kind en een gast nooit; afwijzen mag de eigenaar en een bewoner) → de geldende toestemming → **het ritueel van het niveau** (een gevaarlijke actie — de rail, een kritieke — de rail en een bevestiging van de aanmelding; ‘Is al zo’ — zonder ritueel). Weigering op rol — de melding ‘De eigenaar beslist’, `{ ok: false, reden: 'rol' }`, het verzoek blijft `wacht`; een geannuleerd ritueel — `{ ok: false, reden: 'geannuleerd' }`. Roep vóór `HV.verzoek` niet zelf `HV.schil.gevaar` aan — dat geeft twee rituelen. Het besluit van de mens schrijft de kern als aparte regel (‘Eén keer goedgekeurd: …’); de stand en de uitkomst van het verzoek (`v.stand`, `v.uitkomst`: `uitgevoerd` · `alzo` · `niet`) zet ze zelf; een verzoek zonder apparaatopdracht (`v.mcp`) sluit ze ook zelf. `opties.naPoort(v)` wordt aangeroepen als alle poorten gepasseerd zijn, vóór het uitvoeren (zo schrijft de assistent ‘Goedgekeurd tot einde dag’). Toon in een eigen kaart voor een rol zonder beslisrecht een slotregel in plaats van knoppen (‘De eigenaar beslist’); `o.nu` doet dat zelf.
- **Goedgekeurd is uitgevoerd: de tijd van een verzoek.** Een verzoek mag zijn eigen uitvoertijd noemen — het veld `om` (huistijd): ‘De auto om 02:00 laden’. Na ‘Eén keer goedkeuren’ wordt het niet meteen uitgevoerd: stand `goedgekeurd`, `v.gepland = { om, tijd, wie }`, de melding ‘Goedgekeurd: wordt uitgevoerd om 02:00’, en de huisklok voert de actie uit zodra het `om` is (de regel van de actie met ‘één keer goedgekeurd: <wie goedkeurde>’). De toestemming omzetten naar ‘Altijd’ doet hetzelfde (`v.viaStand = 'altijd'`, de regel ‘Verzoek ingepland: …’). ‘Uit’ laat ook een goedgekeurd verzoek vervallen dat nog op zijn tijd wacht.
- **Een termijn noemt alleen het verzoek zelf.** De kern zet geen termijn: een verzoek uit `HV.doe` heeft geen veld `tot`. De uitvoerder mag zeggen tot wanneer het verzoek zin heeft: `HV.doe({ …, door, tot })` (het einde van het goedkope venster) of het veld `tot` in een eigen verzoek van een scenario. Is die tijd daar, dan sluit de kern het verzoek: stand `verlopen`, `v.vervallen = { reden: 'tijd', tijd }`, de regel ‘Verzoek verlopen: …’. ‘Tijd verstreken’ naast een levende knop bestaat niet; toon ‘Wacht tot’ niet bij een gesloten verzoek.
- **Een verzoek dat zijn zin verliest, verdwijnt.** De kern laat elk beeld een wachtend verzoek vervallen als het apparaat al zeker in die toestand is (`reden: 'alzo'`, de regel ‘Verzoek vervallen: … / is al zo: …’). De maker trekt zijn eigen verzoek zelf in: **`HV.verzoekIntrekken(id, [uk, nl])`** → `true` als het is ingetrokken (stand `verlopen`, `v.vervallen = { reden: 'ingetrokken', tijd, tekst }`, de regel ‘Verzoek ingetrokken: …’ namens de maker; geldt voor een wachtend verzoek en voor een goedgekeurd verzoek dat nog op zijn tijd wacht). Zo trekt de optimalisatie een startverzoek in als de kabel is losgekoppeld of het plan is gewijzigd, en het scenario ‘Avond’ als de auto al geladen is.
- **De stand van een verzoek in woorden — `HV.verzoekWoord(v)` → `[uk, nl]`**: ‘wacht’, ‘wordt uitgevoerd’, ‘goedgekeurd · wordt om 02:00 uitgevoerd’, ‘goedgekeurd · uitgevoerd’, ‘goedgekeurd · was al zo’, ‘uitgevoerd met toestemming ‘Altijd’’, ‘vervallen: toestemming uitgezet’, ‘vervallen: was al zo’, ‘ingetrokken: <reden van de maker>’, ‘verlopen om 01:55’, ‘afgewezen’. Gebruik dit voor kaarten en lijsten ‘beslist’ in plaats van een eigen tabel op `v.stand`: een vervallen verzoek is niet ‘verlopen’ en wat door ‘Altijd’ is uitgevoerd, heeft niemand ‘goedgekeurd’.
- **De tekst van een verzoek komt uit de waarde.** `HV.actieZin(doel, mogelijkheid, waarde)` → `[uk, nl]`: ‘Het laden van de auto starten’ / ‘Het laden van de auto stoppen’, ‘Staande lamp: aanzetten’, ‘Thermostaat: 20,5 °C’, ‘Deur ontgrendelen: Slot voordeur’. Een verzoek uit `HV.doe` neemt die zelf (`v.wat`, de regel in ‘Nu belangrijk’, de regels ‘Verzoek: …’ en ‘Niet uitgevoerd: …’). Eigen woorden van een actie — het veld `doen(a, v)` in `kern/gevaar.js`. `HV.alZo(doel, mogelijkheid, waarde)` zegt of een opdracht niets zou veranderen.
- **‘Is al zo’ geldt alleen voor een toestand die het huis zeker weet** (`beschikbaar === 'ok'`, geen opdracht onderweg): bij een verouderde of veronderstelde toestand en bij een slapend apparaat gaat de opdracht altijd weg en laat ze een regel achter. Controleer eigen mogelijkheden van een zone zelf (voorbeeld — `doe` in `schermen/klimaat-media.js`: dezelfde waarde → ‘Is al zo’ zonder `HV.doe`; eenmalige opdrachten zijn altijd een actie).
- **Melding zonder dubbele waarde.** `HV.meld({ titel:[uk,nl], was:[uk,nl], werd:[uk,nl], … })` — `o.toost` toont de naam zonder waarde en één wijzigingschip (dezelfde `o.berichtKop` en `o.deltaChip` als in de logboekregel): ‘Staande lamp’ en ‘55 % → 35 %’, niet ‘Staande lamp: 35 %’ en ‘55 % → 35 %’. Plak geen `was + ' → ' + werd` in `tekst`.
- **De lange naam van een niveau** is een kant-en-klaar paar `HV.gevaar.niveaus[n].lang` (‘небезпечна дія / gevaarlijke actie’); `o.risico(n, { lang: true })` neemt dat zelf. Plak het bijvoeglijk naamwoord niet aan ‘actie’: in het Nederlands wordt het verbogen.
- **‘Altijd’ en wachtende verzoeken.** `HV.verzoekenBijAltijd(uitvoerder, sleutel)` → `[uk, nl]` of `null`: wat ‘Altijd’ doet met de verzoeken die nu wachten. `o.stand` toont die regel onder de segmenten, het dialoogvenster voor de bevestiging van de aanmelding bij een gevaarlijke of kritieke actie boven de knoppen (`HV.schil.herbevestig({ …, noot, altijdOpnieuw })`).

## 5. Werkend voorbeeld

`schermen/energie-tarief.js` — vervangt het stompje van het tabblad ‘Tarief’:

```js
(function (HV) {
  'use strict';
  var t = HV.t, h = HV.h, o = HV.o;
  function render(ctx) {
    var w = ctx.staat, nu = HV.tarief.prijs(w.tijd);
    var staven = HV.tarief.venster(w.tijd).map(function (x) {
      return { label: HV.tijd(x.tijd), waarde: x.prijs, toon: 'net-in', nu: w.tijd >= x.tijd && w.tijd < x.tijd + 3600000 };
    });
    return o.blok({ id: 'tarief', titel: t('Ціна на 48 годин', 'Prijs voor 48 uur'), inhoud:
      o.kaart({ inhoud: o.getal({ maat: 'l', label: t('Зараз', 'Nu'), waarde: HV.euro(nu), sub: h(t('за кВт·год · приклад', 'per kWh · voorbeeld')) }) +
        HV.grafiek.staven({ id: 'tarief48', titel: t('Ціна за годинами', 'Prijs per uur'), eenheid: '€', decimalen: 2, tikken: 6, staven: staven,
          samenvatting: t('Від’ємна ціна стоїть під нулем.', 'Een negatieve prijs staat onder de nul.') }) +
        o.knop({ tekst: t('Заряджати авто зараз', 'De auto nu laden'), actie: 'tarief-laad' }) }) });
  }
  HV.tab('energie', { id: 'tarief', titel: ['Тариф', 'Tarief'], adres: '/energie/tarief', render: render });
  HV.actie('tarief-laad', function () { HV.doe({ doel: 'laadpaal', mogelijkheid: 'laden', waarde: true }); });
})(window.HV = window.HV || {});
```

## 6. Iconen

Een lucide-icoon (ISC) komt er vanzelf bij: gebruik de naam in kebab-case als tekenreeks — `HV.icoon('sun')` of `icoon: 'sun'`; de samensteller zet het symbool in het bestand. Een eigen teken is een regel in `HV.eigenIconen` (`kern/onderdelen.js`). Nergens emoji.

## 7. Bouwen en controleren

```
node scripts/huis-maquette.mjs                      # docs/huis/maquette/huis-maquette.html
node scripts/huis-maquette.mjs --artefact <pad>     # variant ‘alleen inhoud’ voor een artefactpagina
node scripts/huis-maquette.mjs --controle           # statische controles (exit 1 bij fouten)
node scripts/huis-maquette-rook.mjs --uit <map>     # rookproef in de browser; --snel is de korte ronde
```

Statisch: unieke `id`'s; elk navigatiepunt heeft een scherm; elk paar `t()` heeft beide talen; de taalwet; geen taalafhankelijke aanroep (`t`, `p`, `meervoud`, `telwoord`, `datum`, `datumKort`) tijdens het laden van een module; geen kleur in de CSS buiten het tokenblok en geen `@media` op breedte; `font-weight` alleen 400/500/600/700 of een token; geen tekst kleiner dan 12 px; geen `--muted`/`--faint` in hemelselectoren; elke gevaarlijke en kritieke actie heeft een gevolgtekst.
Rookproef: alle routes × 6 profielen × 3 thema's × 2 talen — consolefouten, horizontaal scrollen, aanraakdoelen ≥ 44 px, afhandelingen van `data-actie`, in de Nederlandse stand geen Cyrillisch buiten `lang="uk"`; de taalwissel uk → nl op alle routes; een klikproef met lamp, schuif, scène, huisstand, scenario, houdrail, toestemmingen en verzoeken (‘Uit’ laat vervallen, ‘Altijd’ voert uit; een verzoek met eigen tijd wordt op die tijd uitgevoerd en verloopt op zijn eigen termijn; een gast keurt niets goed, de eigenaar keurt kritiek alleen met de rail goed), ‘Is al zo’, het lege logboek van ‘Eerste start’ en de noodlaag.

## 8. Regels voor tekst en stijl

- Interfaceteksten staan altijd als paar `t('українська', 'nederlands')`; in gegevens als `[uk, nl]`. In Oekraïense teksten mag alleen Latijn uit de toegestane lijst (`taal-toegestaan.json` vult de lijst uit `tests/eenheid/hulp/taalcontrole.ts` aan).
- In de CSS alleen `var(--…)` en klassen `hv-`; responsief met `@container doek (…)`, niet met `@media`; gebruik `cqh` in plaats van `svh`.
- Alles met getallen ligt op papier (`--panel`); glas is er alleen voor de kop, de navigatie, de schil van bladen en de Opdracht; op de hemel staat alleen `--text` (`--muted` alleen op glas en papier).
- Een aanraakdoel is ≥ 44 px (`--hv-tik`); elke actie met een gevolg heeft de uitleg `o.gevolg(…)`: ‘Wat er gebeurt · Hangt samen met · Terugdraaien’.
- Geen `alert/confirm/prompt`, geen externe adressen, `localStorage` alleen via `HV.opslag`.
