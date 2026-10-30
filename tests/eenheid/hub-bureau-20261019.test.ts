// Punt 12 van de eigenaar (19.10.2026): het BUREAUBLAD van de hub (/overzicht).
// Gecontroleerd: de zuivere regels van de indeling (normaliseren, toevoegen, verplaatsen, formaat, grens),
// de catalogus van tegels met hun categorieën, de eerlijkheidsregel («binnenkort» kan niet op het bureaublad),
// de lege toestand, het bewaren per gebruiker op de server (route + rechten) en de aansluiting in de pagina.
import { readFileSync } from 'node:fs';
import {
  BUREAU_CATEGORIEEN, BUREAU_WIDGETS, BUREAU_WIDGET_IDS, EERSTE_SUGGESTIE, KOLOMMEN, MAX_TEGELS, RASTER_KOLOMMEN, RIJEN, TID,
  bureauTekst, bureauWidget, formaatTegel, gelijkBureau, kolommenBij, leegBureau, leegIs, neerzetIndex, nieuweTid, normaliseerBureau,
  plaatsbaar, schuifTegel, stapFormaat, verplaatsTegel, verwijderTegel, voegTegelToe, type BureauIndeling, type BureauWidgetId,
} from '../../shared/bureau-indeling';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const ids = (ind: BureauIndeling) => ind.tegels.map((t) => t.id).join(',');
const tids = (ind: BureauIndeling) => ind.tegels.map((t) => t.tid).join(',');

export async function main(): Promise<number> {
  const { check, einde } = checker('hub-bureau-20261019');

  // ---------------------------------------------------------------- catalogus van tegels
  check('catalogus: id\'s uniek, kebab-case, en bevroren',
    new Set(BUREAU_WIDGET_IDS).size === BUREAU_WIDGETS.length
    && BUREAU_WIDGET_IDS.every((id) => /^[a-z][a-z0-9-]*$/.test(id))
    && Object.isFrozen(BUREAU_WIDGETS) && Object.isFrozen(BUREAU_CATEGORIEEN));
  check('catalogus: elke tegel heeft een uk- én nl-titel en uitleg',
    BUREAU_WIDGETS.every((w) => w.titel[0] && w.titel[1] && w.uitleg[0].length > 8 && w.uitleg[1].length > 8));
  check('catalogus: de acht categorieën van de eigenaar bestaan en elke categorie heeft minstens één tegel',
    BUREAU_CATEGORIEEN.map((c) => c.id).join(',') === 'post,agenda,bestanden,taken,notities,github,diensten,ai'
    && BUREAU_CATEGORIEEN.every((c) => BUREAU_WIDGETS.some((w) => w.cat === c.id))
    && BUREAU_WIDGETS.every((w) => BUREAU_CATEGORIEEN.some((c) => c.id === w.cat)));
  check('catalogus: standaardformaat binnen het raster en nooit kleiner dan het eigen minimum',
    BUREAU_WIDGETS.every((w) => KOLOMMEN.includes(w.k as never) && RIJEN.includes(w.r as never) && w.k >= w.minK && w.r >= w.minR && w.minK >= 1 && w.minR >= 1 && w.k <= RASTER_KOLOMMEN));

  // ---- eerlijkheid: «klaar» noemt een echte route, «binnenkort» noemt wat ontbreekt en heeft géén bron
  const klaar = BUREAU_WIDGETS.filter((w) => w.stand === 'klaar');
  const binnenkort = BUREAU_WIDGETS.filter((w) => w.stand === 'binnenkort');
  check('eerlijk: elke «klaar»-tegel noemt een route (POST /api/…) en heeft geen «ontbreekt»',
    klaar.length > 0 && klaar.every((w) => /^POST \/api\/[a-z0-9/_-]+$/.test(w.bron) && !w.ontbreekt));
  check('eerlijk: elke «binnenkort»-tegel heeft géén bron en zegt in beide talen wat ontbreekt',
    binnenkort.length > 0 && binnenkort.every((w) => w.bron === '' && w.ontbreekt && w.ontbreekt[0].length > 20 && w.ontbreekt[1].length > 20));
  check('eerlijk: alleen «klaar» is plaatsbaar op het bureaublad',
    klaar.every((w) => plaatsbaar(w.id)) && binnenkort.every((w) => !plaatsbaar(w.id)) && !plaatsbaar('bestaat-niet'));
  // De genoemde routes bestaan echt in de backend (geen verzonnen adres).
  const backend = lees('backend/index.ts') + lees('backend/mcp-console.ts') + lees('backend/beheer-diagnostiek.ts') + lees('backend/hub-blok-gegevens.ts');
  check('eerlijk: elke genoemde route komt werkelijk voor in de backend',
    klaar.every((w) => backend.includes(w.bron.replace('POST ', ''))));
  // De hub mag die routes ook echt aanroepen.
  check('eerlijk: de bordroutes staan open voor de dienst hub, de GitHub-route niet (daarom is die tegel «binnenkort»)',
    /BORD_DIENSTEN = \["mcp", "hub"\]/.test(lees('backend/mcp-console.ts'))
    && /auth\.service !== 'github'/.test(lees('backend/github-platform.ts'))
    && bureauWidget('github-activiteit')!.stand === 'binnenkort'
    && bureauWidget('ai-toegang')!.stand === 'binnenkort');

  // ---------------------------------------------------------------- lege toestand
  const leeg = leegBureau();
  check('leeg: een nieuw bureaublad is werkelijk leeg (niets wordt stilletjes neergelegd)', leegIs(leeg) && leeg.tegels.length === 0 && leeg.v === 1);
  check('leeg: het voorstel voor de eerste tegels bestaat en is volledig «klaar»',
    EERSTE_SUGGESTIE.length === 3 && EERSTE_SUGGESTIE.every((id) => plaatsbaar(id)));
  let eerste = leeg;
  for (const id of EERSTE_SUGGESTIE) eerste = voegTegelToe(eerste, id);
  check('leeg: het voorstel legt precies die drie tegels neer, elk met een eigen id',
    ids(eerste) === EERSTE_SUGGESTIE.join(',') && new Set(eerste.tegels.map((t) => t.tid)).size === 3);

  // ---------------------------------------------------------------- normaliseren (zelfde functie in browser én server)
  check('normaliseren: onzin geeft een leeg bureaublad',
    [null, undefined, 'x', 42, [], {}, { tegels: 'nee' }, { tegels: [null, 7, 'x', {}] }].every((r) => leegIs(normaliseerBureau(r))));
  const vuil = normaliseerBureau({
    tegels: [
      { tid: 't1', id: 'post-laatste', k: 7, r: 99 },        // formaat buiten het raster
      { tid: 't1', id: 'taken-volgende', k: 4, r: 3 },       // dubbel id → nieuw id
      { tid: 'ONGELDIG!', id: 'notities-laatste', k: 4, r: 2 }, // ongeldig id → nieuw id
      { id: 'github-activiteit', k: 6, r: 3 },               // «binnenkort» → eruit
      { id: 'bestaat-niet', k: 6, r: 3 },                    // onbekend → eruit
      { tid: 't9', id: 'post-tellers', k: -5, r: 0 },        // onzinformaat → minimum
    ],
  });
  const post = vuil.tegels.find((t) => t.id === 'post-laatste')!;
  const tellers = vuil.tegels.find((t) => t.id === 'post-tellers')!;
  check('normaliseren: onbekende en nog niet werkende tegels vallen weg',
    vuil.tegels.length === 4 && !vuil.tegels.some((t) => t.id === 'github-activiteit'));
  check('normaliseren: formaten worden op toegestane waarden gezet, nooit onder het minimum',
    KOLOMMEN.includes(post.k as never) && RIJEN.includes(post.r as never) && post.k >= bureauWidget('post-laatste')!.minK
    && tellers.k === 3 && tellers.r === 1);
  check('normaliseren: id\'s zijn uniek en geldig (dubbel of onzin wordt vervangen)',
    new Set(vuil.tegels.map((t) => t.tid)).size === 4 && vuil.tegels.every((t) => TID.test(t.tid)));
  check('normaliseren: dezelfde tegel mag twee keer op het bureaublad liggen (twee instanties)',
    normaliseerBureau({ tegels: [{ tid: 't1', id: 'post-laatste' }, { tid: 't2', id: 'post-laatste' }] }).tegels.length === 2);
  const teveel = normaliseerBureau({ tegels: Array.from({ length: MAX_TEGELS + 9 }, () => ({ id: 'post-tellers' })) });
  check(`normaliseren: nooit meer dan ${MAX_TEGELS} tegels`, teveel.tegels.length === MAX_TEGELS);
  check('normaliseren: is stabiel (tweede keer verandert niets)', gelijkBureau(normaliseerBureau(vuil), vuil));
  check('normaliseren: nieuweTid geeft het eerste vrije id', nieuweTid(leeg) === 't1' && nieuweTid(vuil) !== '' && !tids(vuil).split(',').includes(nieuweTid(vuil)));

  // ---------------------------------------------------------------- toevoegen, weghalen, verplaatsen, formaat
  check('toevoegen: een onbekende of nog niet werkende tegel wordt geweigerd (zelfde object terug)',
    voegTegelToe(leeg, 'bestaat-niet' as BureauWidgetId) === leeg && voegTegelToe(leeg, 'github-activiteit') === leeg);
  let vol = leeg;
  for (let i = 0; i < MAX_TEGELS + 3; i += 1) vol = voegTegelToe(vol, 'post-tellers');
  check('toevoegen: stopt bij de grens', vol.tegels.length === MAX_TEGELS);
  check('weghalen: een onbekend id verandert niets', verwijderTegel(eerste, 'bestaat-niet') === eerste);
  check('weghalen: haalt precies die ene tegel weg', verwijderTegel(eerste, 't2').tegels.map((t) => t.tid).join(',') === 't1,t3');
  check('verplaatsen: naar voren en naar achteren', ids(verplaatsTegel(eerste, 't3', 0)) === 'taken-volgende,post-laatste,agenda-komend'
    && ids(verplaatsTegel(eerste, 't1', 99)) === 'agenda-komend,taken-volgende,post-laatste');
  check('verplaatsen: onbekend id of dezelfde plek verandert niets', verplaatsTegel(eerste, 'xx', 0) === eerste && verplaatsTegel(eerste, 't1', 0) === eerste);
  check('schuiven: één plek op en neer, en nooit voorbij de rand',
    ids(schuifTegel(eerste, 't1', 1)) === 'agenda-komend,post-laatste,taken-volgende'
    && schuifTegel(eerste, 't1', -1) === eerste && schuifTegel(eerste, 't3', 1) === eerste);
  const groot = formaatTegel(eerste, 't1', 12, 4);
  check('formaat: zet breedte en hoogte op toegestane waarden', groot.tegels[0].k === 12 && groot.tegels[0].r === 4);
  const klein = formaatTegel(eerste, 't1', 1, 1);
  const defPost = bureauWidget('post-laatste')!;
  check('formaat: nooit onder het minimum van de tegel', klein.tegels[0].k === defPost.minK && klein.tegels[0].r === defPost.minR);
  check('formaat: onbekend id of gelijk formaat verandert niets', formaatTegel(eerste, 'xx', 6) === eerste && formaatTegel(eerste, 't1', eerste.tegels[0].k, eerste.tegels[0].r) === eerste);
  check('formaat: stappen blijven binnen de toegestane waarden',
    stapFormaat(6, KOLOMMEN, 3, 1) === 8 && stapFormaat(12, KOLOMMEN, 3, 1) === 12 && stapFormaat(4, KOLOMMEN, 4, -1) === 4 && stapFormaat(1, RIJEN, 1, 1) === 2);
  check('raster: een tegel is nooit breder dan het raster (telefoon = 1 kolom)',
    kolommenBij({ tid: 't1', id: 'post-laatste', k: 12, r: 2 }, 1) === 1 && kolommenBij({ tid: 't1', id: 'post-laatste', k: 12, r: 2 }, 6) === 6);
  check('tekst: tweetalig kiezen werkt', bureauTekst(defPost.titel, 'uk') === defPost.titel[0] && bureauTekst(defPost.titel, 'nl') === defPost.titel[1]);

  // ---------------------------------------------------------------- slepen: waar komt de tegel terecht
  const vakken = [{ left: 0, top: 0, width: 100, height: 100 }, { left: 100, top: 0, width: 100, height: 100 }, { left: 0, top: 100, width: 100, height: 100 }];
  check('slepen: links van het midden van de eerste tegel → plek 0', neerzetIndex(vakken, 10, 50) === 0);
  check('slepen: rechts van het midden van de eerste, links van het midden van de tweede → plek 1', neerzetIndex(vakken, 120, 50) === 1);
  check('slepen: onder alles → achteraan', neerzetIndex(vakken, 190, 500) === vakken.length);
  check('slepen: een leeg bureaublad geeft altijd plek 0', neerzetIndex([], 50, 50) === 0);

  // ---------------------------------------------------------------- bewaren per gebruiker op de server
  const route = lees('backend/hub-bureau.ts');
  // De naam van de tabel (de «sleutel») staat in precies één sjabloon; die mag nooit die van de blokvoorkeuren zijn.
  const tabelNamen = [...route.matchAll(/`([a-z_0-9]+):\$\{/g)].map((m) => m[1]);
  check('server: eigen sleutel, los van de oude blokvoorkeuren',
    tabelNamen.join(',') === 'hub_bureau_v1'
    && [...lees('backend/hub-indeling-voorkeuren.ts').matchAll(/`([a-z_0-9]+):\$\{/g)].map((m) => m[1]).join(',') === 'hub_layout_preferences_v1');
  // 0086: de rij wordt niet meer met de hand op `ownerUserId` vergeleken maar met `hoortBij(rij, lade)` — dat is dezelfde
  // eis PLUS de gegevenslade (persoonlijk of technisch), dus strikt strenger. Een rij van iemand anders valt er nog altijd
  // buiten, en nu ook een rij uit de andere lade van dezelfde mens.
  check('server: per gebruiker (gehashte tabel), per gegevenslade, en nooit een rij van iemand anders',
    /createHash\('sha256'\)\.update\(owner\)/.test(route)
    && /hoortBij\(r, lade\)/.test(route)
    && /from '\.\.\/shared\/ruimte-scheiding'/.test(route));
  check('server: alleen een goedgekeurde hub-sessie mag lezen én schrijven',
    (route.match(/auth\.service !== 'hub' \|\| auth\.user\.status !== 'approved'/g) || []).length === 2
    && (route.match(/OWNER_HUB_BUREAU_REQUIRED', 403/g) || []).length === 2);
  check('server: de server vertrouwt de browser niet — de invoer gaat door dezelfde zuivere normalisatie',
    /from '\.\.\/shared\/bureau-indeling'/.test(route) && (route.match(/normaliseerBureau\(/g) || []).length >= 3);
  check('server: te grote invoer wordt geweigerd vóór het ontleden', /OWNER_HUB_BUREAU_TOO_LARGE', 413/.test(route));
  const index = lees('backend/index.ts');
  check('server: de routes zijn aangesloten met dezelfde sessiecontrole als de andere hub-routes',
    index.includes("import {createHubBureauRoutes} from './hub-bureau';")
    && index.includes('...wrapFactoryMutations(createHubBureauRoutes((event,body)=>ownerRequireSession(event,body)),(event,body)=>ownerRequireSession(event,body)),'));
  const klant = lees('src/bureau/api.ts');
  check('browser: de klant praat met dezelfde twee routes en normaliseert het antwoord',
    klant.includes('/api/owner/hub/bureau/load') && klant.includes('/api/owner/hub/bureau/save') && klant.includes('normaliseerBureau'));

  // ---------------------------------------------------------------- de pagina zelf
  const bureau = lees('src/bureau/Bureau.tsx');
  check('pagina: de tegels gebruiken de bestaande vensterafhandeling (geen tweede, eigen vensterstijl)',
    bureau.includes("import '../platform/vensters.css'") && /className=\{`venster bureau-tegel/.test(bureau)
    && bureau.includes('venster-kop') && bureau.includes('venster-grootte') && bureau.includes("import { Venster } from '../platform/vensters'"));
  check('pagina: slepen werkt met pointer-events (dus ook met pen en aanraken), niet met HTML5-drag',
    bureau.includes('onPointerDown') && bureau.includes('onPointerMove') && bureau.includes('setPointerCapture') && !bureau.includes('onDragStart'));
  check('pagina: toetsenbord kan verplaatsen, formaat wijzigen en weghalen',
    bureau.includes('schuifTegel(indeling') && bureau.includes('stapFormaat(') && /e\.key === 'Delete'/.test(bureau));
  check('pagina: de catalogus «Додати блок» bestaat, met filters per categorie en de stand per tegel',
    bureau.includes("data-bureau-catalogus='open'") && bureau.includes('data-bureau-cat=') && bureau.includes('data-bureau-stand=')
    && bureau.includes('bureau-ontbreekt') && /disabled=\{!klaar/.test(bureau));
  check('pagina: de lege toestand legt uit wat er kan en biedt de eerste blokken aan',
    bureau.includes("data-bureau-leeg='1'") && bureau.includes("data-bureau-leeg-eerste='1'") && bureau.includes('EERSTE_SUGGESTIE'));
  check('pagina: elke wijziging gaat eerst door de zuivere regels en dan naar de server',
    /const schoon = normaliseerBureau\(volgende\);/.test(bureau) && /bewaarBureau\(schoon\)/.test(bureau));
  const tegels = lees('src/bureau/Tegels.tsx');
  check('pagina: een tegel zonder echte bron komt er nooit in, en een fout wordt gemeld in plaats van verzonnen',
    /def\.stand !== 'klaar'/.test(tegels) && tegels.includes('bureau-tegel-fout') && !/Math\.random/.test(tegels));
  const app = lees('src/App.tsx');
  // Zone F (22.10.2026): op «Огляд» staat nu het WERKBLAD (src/werkblad), dat het oude bureaublad bij het eerste openen overzet
  // (shared/werkblad-indeling.ts vanBureau); de regels en de routes van het bureaublad blijven bestaan en worden hier nog getest.
  check('aansluiting: op «Огляд» staat het werkblad (dat het bureaublad overzet) en de oude «lege werkruimte» verschijnt daar niet meer',
    app.includes("{hubTab==='overview'&&state==='authorized'&&<Suspense fallback={<section className='werkblad' data-werkblad='laden' aria-busy='true'/>}><Werkblad lang={lang} ownerUserId={user?.id||''}")
    && /filteredVisible\.length===0&&hubTab!=='overview'&&hubTab!=='calendar'&&hubTab!=='notes'&&(hubTab!=='photos'&&)?<section className='empty-workspace'/.test(app)); // UI-002: ook niet op het tabblad «Фото» (alleen bereikbaar met vlag foto-dienst)
  const css = lees('src/bureau/bureau.css');
  check('opmaak: een raster van 12 kolommen dat op een tablet 6 en op een telefoon 1 kolom wordt',
    /grid-template-columns:repeat\(12,1fr\)/.test(css) && /@media \(max-width:1100px\)/.test(css) && /@media \(max-width:700px\)/.test(css)
    && /grid-column:1\/-1/.test(css));
  check('opmaak: geen externe bron (geen CDN, alles zelf gehost)', !/https?:\/\//.test(css) || !/(cdn|fonts\.googleapis|unpkg|jsdelivr)/.test(css));

  return einde();
}
