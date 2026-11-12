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
HV.actie(naam, (ctx, gegevens, element, gebeurtenis) => …);            // delegatie op data-actie
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
- **De enige plek voor een actie** is `HV.doe({ doel, mogelijkheid, waarde, door?, stil? })` → `Promise<{ ok, reden? }>`.
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
`toost(x)` · `bericht(regel,{open,zonderSim})` · `rij({icoon,naam,sub,waarde,actie,gegevens})` · `kaart({titel,inhoud})` · `getal({maat,label,waarde,sub,toon})` · `later(tekst)`.

Grafieken `HV.grafiek.*`: `lijn`, `staven`, `toestanden` (een baan mag `rechts` hebben — HTML rechts in het spoor), `warmtekaart`, `ring`, `vonk` (eigen SVG, merktekens, ‘Als tabel tonen’; de buitenste labels van de X-as liggen tegen de rand). Tekst en getallen: `HV.t(uk,nl)`, `HV.p([uk,nl])`, `HV.getal(n,dec)`, `HV.maat(n,eenheid,dec)`, `HV.euro`, `HV.tijd`, `HV.duur`, `HV.oud`, `HV.meervoud`. Tonen: de klasse `hv-toon-aan|warm|koud|zon|net-in|net-uit|batterij|auto|neutraal`.

### 4.1. Tegels, actieteken, toestanden (ronde 2)

- **De inhoud bepaalt de vorm.** `o.tegel(a, { bediening: true })` — voor ‘Favorieten’ en de kamerpagina: een apparaat met een niveauorgaan (`HV.niveauOrgaan(a)`: helderheid, doeltemperatuur, gordijnen, volume) wordt een tegel met bediening «−» · `hv-schuif` · «+». Het rooster `hv-tegels` geeft haar de vorm 2×2 alleen als de kolom minstens 224 px breed is (vanaf een doek van 700 px zijn de kolommen dat altijd); op de telefoon beslaat ze de hele rij (4×2) en toont ze rechts het getal `--hv-getal-m` (container `tegel`, vanaf 300 px). `vorm:'2x2'` zonder niveauorgaan wordt 2×1 getekend — geen hoge lege tegel meer. `vorm:'4x2'` beslaat altijd de hele rij. De schuif van de tegel stuurt de opdracht bij `klaar` (actie `tegel-schuif`).
- **De regel ‘waarde · leeftijd’** bestaat uit ondeelbare stukken (`.hv-nb`): de punt hoort bij het volgende stuk en verdwijnt aan het begin van een regel; de naam krijgt tot twee regels zonder puntjes. Voor eigen tegels: `HV.tegelWaardeRegel([{ html, klas }])`.
- **Teken met ritueel.** `o.schakel({ ritueel:'gevaarlijk'|'kritiek', actie, … })` — een vierkant met dubbele rand in plaats van een cirkel; aanraken voert zelf niets uit: `HV.doe` opent `hv-gevaar`. Het niveau in de huidige richting geeft `HV.ritueelVan(a, beeld.schakel)` (verondersteld of verouderd — de vorm van het hoogste van beide richtingen). `o.tegel` doet dit zelf: een vergrendeld slot is een vierkant, een ontgrendeld een cirkel. Het oude `kritiek:true` met `actie` betekent `ritueel:'kritiek'`, zonder `actie` een passief teken (de achthoek bestaat niet meer).
- **Toestanden.** `staat:'bezig'` — ‘bezig’: klassen met een slag (`HV.gangKlassen`: gordijnen, jaloezieën, poort, garagedeur, slot, klep) tonen na het eerste antwoord het richtingwoord en het waargenomen percentage (`a.wacht.fase==='bezig'`, `a.wacht.voortgang`); de tijd tot ‘niet uitgevoerd’ is `a.wacht.grens` per klasse (`maten.gedrag.wachtPerKlasse`). ‘Niet uitgevoerd’ — `HV.mislukt(a)` (rand 2 px `--fout`, `CircleX`, 60 s of tot de volgende actie).
- **De held** is een eigen container `held`: tot 600 px de korte zin, 600–999 de volle zin in één kolom, vanaf 1000 px zin en doorsnede. Het doorsnedeblok van ‘Thuis’ verschijnt vanzelf als de held geen doorsnede toont (container `thuis`). Andere containers van de kern: `doorsnede`, `nurij` (regel van ‘Nu belangrijk’), `kamer`, `kamerlijst`, `tegel`.
- **De hemel** is samengedrukt tot de held (`--hv-hemel-einde`) en vervaagt daaronder naar papier; op andere pagina's een stille hemel (een zweem van de fase bovenaan, daarna `--bg`). De neerslagarcering leeft in de held. Op de hemel alleen `--text` (de statische controle vangt `--muted` in hemelselectoren).
- **Schil.** ‘Opdracht’ is het middelste punt van de onderbalk op de telefoon (geen zwevende knop meer). Op de telefoon staat onder de kop de rij `hv-sim` van 28 px; in de kop een papieren pil met de ingeklapte heldregel en de chip ‘belangrijk’ (actie `naar-nu`). `o.sim(w)` toont geen tijd meer. `HV.dagstrook(ctx, { kort, makers })` — de baan van makers alleen met `makers:true`.

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

Statisch: unieke `id`'s; elk navigatiepunt heeft een scherm; elk paar `t()` heeft beide talen; de taalwet; geen kleur in de CSS buiten het tokenblok en geen `@media` op breedte; `font-weight` alleen 400/500/600/700 of een token; geen tekst kleiner dan 12 px; geen `--muted`/`--faint` in hemelselectoren; elke gevaarlijke en kritieke actie heeft een gevolgtekst.
Rookproef: alle routes × 6 profielen × 3 thema's × 2 talen — consolefouten, horizontaal scrollen, aanraakdoelen ≥ 44 px, afhandelingen van `data-actie`; een klikproef met lamp, schuif, scène, huisstand, scenario, houdrail en noodlaag.

## 8. Regels voor tekst en stijl

- Interfaceteksten staan altijd als paar `t('українська', 'nederlands')`; in gegevens als `[uk, nl]`. In Oekraïense teksten mag alleen Latijn uit de toegestane lijst (`taal-toegestaan.json` vult de lijst uit `tests/eenheid/hulp/taalcontrole.ts` aan).
- In de CSS alleen `var(--…)` en klassen `hv-`; responsief met `@container doek (…)`, niet met `@media`; gebruik `cqh` in plaats van `svh`.
- Alles met getallen ligt op papier (`--panel`); glas is er alleen voor de kop, de navigatie, de schil van bladen en de Opdracht; op de hemel staat alleen `--text` (`--muted` alleen op glas en papier).
- Een aanraakdoel is ≥ 44 px (`--hv-tik`); elke actie met een gevolg heeft de uitleg `o.gevolg(…)`: ‘Wat er gebeurt · Hangt samen met · Terugdraaien’.
- Geen `alert/confirm/prompt`, geen externe adressen, `localStorage` alleen via `HV.opslag`.
