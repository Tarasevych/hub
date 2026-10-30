// WERKBLAD (zone F, 22.10.2026): de zuivere regels van shared/werkblad-indeling.ts en de aansluiting in de pagina.
// Gecontroleerd: catalogus (eerlijkheid: «klaar» noemt een echte route, «binnenkort» niet plaatsbaar), normalisatie (stabiel,
// rechten per lade, enkel-widgets), toevoegen/weghalen/verplaatsen/formaat, plaatsing zonder overlap op 12/6/1 kolommen,
// neerzetten bij slepen, overzetting van het oude bureaublad en de oude blokken (zonder verlies), de standaard per lade,
// de hulp-items, de opmaak (alleen tokens, geen hex, drie rasters) en App.tsx (werkblad op «Огляд», oude blokken niet dubbel).
import { readFileSync } from 'node:fs';
import {
  ACHTERGRONDEN, BUREAU_NAAR_WERKBLAD, HELP_WERKBLAD, KOLOMMEN, MAX_ITEMS, RIJEN, TID, WERKBLAD_CATEGORIEEN, WERKBLAD_WIDGETS, WERKBLAD_WIDGET_IDS,
  STANDAARD_BLOKKEN, blokAangepast, blokInst, eersteWerkblad, formaat, gelijkWerkblad, heeftOverlap, kolommenBij, leegIs, leegWerkblad, neerzetIndex, nieuweTid, normaliseerWerkblad, plaatsen, schuif,
  stapFormaat, standaardWerkblad, toegestaan, vanBlokken, vanBureau, verplaats, verwijder, voegToe, werkbladWidget, zetAchtergrond, zetInst,
  type OudBlok, type WerkbladContext, type WerkbladIndeling,
} from '../../shared/werkblad-indeling';
import { BUREAU_WIDGETS, normaliseerBureau } from '../../shared/bureau-indeling';
import { hulpGebreken, hulpVan } from '../../shared/hulp-register';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const ids = (ind: WerkbladIndeling) => ind.items.map((t) => t.id).join(',');
const P: WerkbladContext = { ruimte: 'prive' }, T: WerkbladContext = { ruimte: 'technisch', eigenaar: true };

export async function main(): Promise<number> {
  const { check, einde } = checker('werkblad-indeling-20261022');

  // ---------------------------------------------------------------- catalogus
  check('catalogus: id\'s uniek, kebab-case, bevroren', new Set(WERKBLAD_WIDGET_IDS).size === WERKBLAD_WIDGETS.length && WERKBLAD_WIDGET_IDS.every((id) => /^[a-z][a-z0-9-]*$/.test(id)) && Object.isFrozen(WERKBLAD_WIDGETS));
  check('catalogus: elke widget heeft uk- én nl-titel en uitleg, en een bestaande categorie',
    WERKBLAD_WIDGETS.every((w) => w.titel[0] && w.titel[1] && w.uitleg[0].length > 8 && w.uitleg[1].length > 8 && WERKBLAD_CATEGORIEEN.some((c) => c.id === w.cat)));
  check('catalogus: standaardformaat op toegestane waarden en nooit onder het eigen minimum',
    WERKBLAD_WIDGETS.every((w) => KOLOMMEN.includes(w.k as never) && RIJEN.includes(w.r as never) && w.k >= w.minK && w.r >= w.minR && w.k <= 12));
  const klaar = WERKBLAD_WIDGETS.filter((w) => w.stand === 'klaar'), binnenkort = WERKBLAD_WIDGETS.filter((w) => w.stand === 'binnenkort');
  check('eerlijk: elke «klaar»-widget met bron noemt een route (POST /api/… of GET /__…) en geen «ontbreekt»', klaar.every((w) => (w.bron === '' || /^(POST \/api\/[a-z0-9/_-]+|GET \/__[a-z]+)$/.test(w.bron)) && !w.ontbreekt));
  check('eerlijk: «binnenkort» (GitHub) heeft geen bron, zegt in beide talen wat ontbreekt en is nergens plaatsbaar',
    binnenkort.length === 1 && binnenkort[0].id === 'github' && binnenkort[0].bron === '' && binnenkort[0].ontbreekt![0].length > 20 && !toegestaan('github', P) && !toegestaan('github', T));
  const backend = lees('backend/index.ts') + lees('backend/mcp-console.ts') + lees('backend/beheer-diagnostiek.ts') + lees('backend/hub-blok-gegevens.ts') + lees('backend/zoek-geschiedenis.ts') + lees('backend/werkblad.ts') + lees('server/start.ts');
  check('eerlijk: elke genoemde route bestaat echt in de backend', klaar.filter((w) => w.bron).every((w) => backend.includes(w.bron.replace(/^(POST|GET) /, ''))));
  check('eerlijk: de GitHub-route accepteert nog steeds alleen de dienst github (daarom «binnenkort»)', /auth\.service !== 'github'/.test(lees('backend/github-platform.ts')));
  check('weer: er is GEEN weerwidget (geen externe cloud); «systeem» vervangt het en zegt dat in de uitleg', !WERKBLAD_WIDGET_IDS.some((id) => /weer|weather|pogoda/.test(id)) && /погоди/.test(werkbladWidget('systeem')!.uitleg[0]));
  check('rechten: technische widgets alleen in de technische lade; gewone in beide', ['tech-server', 'tech-updates', 'tech-diagnostiek'].every((id) => !toegestaan(id, P) && toegestaan(id, T)) && ['post', 'agenda', 'taken', 'zoek-recent', 'systeem'].every((id) => toegestaan(id, P) && toegestaan(id, T)));
  check('rechten: onbekend id nooit toegestaan', !toegestaan('bestaat-niet', P) && !toegestaan(null, T));

  // ---------------------------------------------------------------- normaliseren
  check('normaliseren: onzin geeft een leeg werkblad met de standaardachtergrond', [null, 'x', 42, [], {}, { items: 'nee' }, { items: [null, 7, {}] }].every((r) => leegIs(normaliseerWerkblad(r, P)) && normaliseerWerkblad(r, P).achtergrond === 'nacht'));
  const vuil = normaliseerWerkblad({ achtergrond: 'zee', items: [
    { tid: 'w1', id: 'post', k: 7, r: 99, inst: { weergave: 'tellers', 'slecht sleutel': 1, lang: 'x'.repeat(5000), diep: { a: 1 } } },
    { tid: 'w1', id: 'taken', k: 4, r: 3 }, { tid: 'ONGELDIG!', id: 'notities' },
    { id: 'github' }, { id: 'bestaat-niet' }, { id: 'tech-server' },
    { tid: 'w9', id: 'begroeting' }, { tid: 'w10', id: 'begroeting' },
    { tid: 'w11', id: 'snelkoppeling', k: -5, r: 0, inst: { url: 'https://voorbeeld.test', titel: 'X' } },
  ] }, P);
  const post = vuil.items.find((t) => t.id === 'post')!, sk = vuil.items.find((t) => t.id === 'snelkoppeling')!;
  check('normaliseren: onbekend, «binnenkort», technisch-in-prive en dubbele enkel-widgets vallen weg', ids(vuil) === 'post,taken,notities,begroeting,snelkoppeling');
  check('normaliseren: formaten op toegestane waarden, nooit onder het minimum', KOLOMMEN.includes(post.k as never) && post.k === 7 && post.r === 6 && sk.k === 2 && sk.r === 1);
  check('normaliseren: instellingen plat en begrensd (slechte sleutel en object weg, tekst ≤ 1600)', post.inst?.weergave === 'tellers' && !('slecht sleutel' in (post.inst || {})) && !('diep' in (post.inst || {})) && String(post.inst?.lang).length === 1600);
  check('normaliseren: id\'s uniek en geldig; achtergrond overgenomen', new Set(vuil.items.map((t) => t.tid)).size === 5 && vuil.items.every((t) => TID.test(t.tid)) && vuil.achtergrond === 'zee');
  check('normaliseren: stabiel (tweede keer verandert niets)', gelijkWerkblad(normaliseerWerkblad(vuil, P), vuil));
  check(`normaliseren: nooit meer dan ${MAX_ITEMS}`, normaliseerWerkblad({ items: Array.from({ length: MAX_ITEMS + 9 }, () => ({ id: 'post' })) }, P).items.length === MAX_ITEMS);
  check('normaliseren: ongeldige achtergrond → nacht; eigen blijft eigen', normaliseerWerkblad({ achtergrond: 'http://x' }, P).achtergrond === 'nacht' && normaliseerWerkblad({ achtergrond: 'eigen' }, P).achtergrond === 'eigen' && ACHTERGRONDEN.includes('eigen'));
  check('normaliseren: de technische lade mag de technische widgets wél', ids(normaliseerWerkblad({ items: [{ id: 'tech-server' }, { id: 'tech-updates' }] }, T)) === 'tech-server,tech-updates');

  // ---------------------------------------------------------------- bewerkingen
  const leeg = leegWerkblad();
  let w = voegToe(voegToe(voegToe(leeg, 'post', P), 'agenda', P), 'taken', P);
  check('toevoegen: drie widgets, elk met een eigen id (w1,w2,w3)', ids(w) === 'post,agenda,taken' && w.items.map((t) => t.tid).join(',') === 'w1,w2,w3' && nieuweTid(w) === 'w4');
  check('toevoegen: geweigerd — onbekend, «binnenkort», technisch in prive, tweede «enkel» → zelfde object', voegToe(w, 'x', P) === w && voegToe(w, 'github', P) === w && voegToe(w, 'tech-server', P) === w && voegToe(voegToe(w, 'begroeting', P), 'begroeting', P).items.length === 4);
  check('toevoegen: op een plek (index 0) en met instellingen', ids(voegToe(w, 'begroeting', P, undefined, 0)) === 'begroeting,post,agenda,taken' && voegToe(w, 'snelkoppeling', P, { url: 'https://a.test', titel: 'A' }).items[3].inst?.url === 'https://a.test');
  let vol = leeg; for (let i = 0; i < MAX_ITEMS + 3; i += 1) vol = voegToe(vol, 'post', P);
  check('toevoegen: stopt bij de grens', vol.items.length === MAX_ITEMS);
  check('weghalen: precies die ene; onbekend verandert niets', ids(verwijder(w, 'w2')) === 'post,taken' && verwijder(w, 'x') === w);
  check('verplaatsen/schuiven: naar voren, naar achteren, nooit voorbij de rand', ids(verplaats(w, 'w3', 0)) === 'taken,post,agenda' && ids(verplaats(w, 'w1', 99)) === 'agenda,taken,post' && verplaats(w, 'w1', 0) === w && ids(schuif(w, 'w1', 1)) === 'agenda,post,taken' && schuif(w, 'w1', -1) === w);
  const groot = formaat(w, 'w1', 12, 5), klein = formaat(w, 'w1', 1, 1);
  check('formaat: toegestane waarden, nooit onder het minimum, gelijk formaat → zelfde object', groot.items[0].k === 12 && groot.items[0].r === 5 && klein.items[0].k === werkbladWidget('post')!.minK && klein.items[0].r === werkbladWidget('post')!.minR && formaat(w, 'w1', w.items[0].k, w.items[0].r) === w);
  check('formaat: stappen', stapFormaat(6, KOLOMMEN, 3, 1) === 7 && stapFormaat(7, KOLOMMEN, 3, -1) === 6 && stapFormaat(12, KOLOMMEN, 3, 1) === 12 && stapFormaat(3, KOLOMMEN, 3, -1) === 3 && stapFormaat(2, KOLOMMEN, 2, 1) === 3);
  check('instellingen: zetInst voegt samen en schoont', zetInst(w, 'w1', { weergave: 'tellers' }).items[0].inst?.weergave === 'tellers' && zetInst(w, 'x', { a: 1 }) === w);
  check('achtergrond: zetAchtergrond', zetAchtergrond(w, 'woud').achtergrond === 'woud' && zetAchtergrond(w, 'nacht') === w && zetAchtergrond(w, 'onzin').achtergrond === 'nacht');

  // ---------------------------------------------------------------- plaatsing (collisies)
  const s = standaardWerkblad(P);
  for (const kol of [12, 6, 1]) {
    const pl = plaatsen(s.items, kol);
    check(`plaatsen ${kol}: elke tegel één plek, geen overlap, binnen het raster, volgorde bewaard`,
      pl.length === s.items.length && !heeftOverlap(pl) && pl.every((p) => p.x >= 0 && p.x + p.k <= kol && p.k >= 1 && p.r >= 1) && pl.map((p) => p.tid).join(',') === s.items.map((t) => t.tid).join(','));
  }
  const dicht = plaatsen([{ tid: 'a', id: 'post', k: 8, r: 2 }, { tid: 'b', id: 'post', k: 4, r: 1 }, { tid: 'c', id: 'post', k: 4, r: 1 }, { tid: 'd', id: 'post', k: 12, r: 1 }], 12);
  check('plaatsen: vult gaten (4+4 naast de 8-brede, de 12-brede eronder)', JSON.stringify(dicht.map((p) => [p.x, p.y])) === '[[0,0],[8,0],[8,1],[0,2]]');
  check('plaatsen: op de tablet (6) is een widget de helft of de hele breedte (geen gaten van één kolom); op 1 kolom alles breedte 1', kolommenBij(12, 6) === 6 && kolommenBij(8, 6) === 6 && kolommenBij(6, 6) === 3 && kolommenBij(3, 6) === 3 && kolommenBij(7, 6) === 3 && kolommenBij(8, 1) === 1 && plaatsen(s.items, 1).every((p) => p.k === 1 && p.x === 0));
  check('plaatsen: willekeurige invoer (fuzz 200×) nooit overlap', Array.from({ length: 200 }, (_, i) => plaatsen(Array.from({ length: 1 + (i % 9) }, (_, j) => ({ tid: `t${j}`, id: 'post' as const, k: KOLOMMEN[(i * 7 + j * 3) % KOLOMMEN.length], r: RIJEN[(i + j) % RIJEN.length] })), [12, 6, 1][i % 3])).every((pl) => !heeftOverlap(pl)));
  const vakken = [{ left: 0, top: 0, width: 100, height: 100 }, { left: 100, top: 0, width: 100, height: 100 }, { left: 0, top: 100, width: 100, height: 100 }];
  check('neerzetten: vóór de tegel waarvan het midden voorbij de aanwijzer ligt; achteraan als niets past', neerzetIndex(vakken, 20, 50) === 0 && neerzetIndex(vakken, 80, 50) === 1 && neerzetIndex(vakken, 180, 50) === 2 && neerzetIndex(vakken, 40, 150) === 2 && neerzetIndex(vakken, 150, 150) === 3 && neerzetIndex([], 5, 5) === 0);

  // De standaard van beide laden vult het raster van 12 kolommen zonder één leeg vak (het voorbeeld van de eigenaar, geen gaten).
  const zonderGaten = (ind: WerkbladIndeling, kol: number) => {
    const pl = plaatsen(ind.items, kol), hoogte = Math.max(...pl.map((p) => p.y + p.r)), bezet = new Set<string>();
    for (const p of pl) for (let y = p.y; y < p.y + p.r; y += 1) for (let x = p.x; x < p.x + p.k; x += 1) bezet.add(`${x},${y}`);
    return { leeg: hoogte * kol - bezet.size, hoogte };
  };
  const gP = zonderGaten(standaardWerkblad(P), 12), gT = zonderGaten(standaardWerkblad(T), 12);
  check('standaard: op 12 kolommen geen enkel leeg vak (persoonlijk 11 rijen, technisch 7 rijen)', gP.leeg === 0 && gT.leeg === 0 && gP.hoogte === 11 && gT.hoogte === 7, `prive ${JSON.stringify(gP)} technisch ${JSON.stringify(gT)}`);
  check('standaard: rechterkolom zoals het voorbeeld — systeem (in plaats van weer) rechtsboven naast de begroeting', (() => { const pl = plaatsen(standaardWerkblad(P).items, 12); const id = (tid: string) => standaardWerkblad(P).items.find((t) => t.tid === tid)?.id; const sys = pl.find((p) => id(p.tid) === 'systeem')!; const beg = pl.find((p) => id(p.tid) === 'begroeting')!; return sys.x === 9 && sys.y === 0 && beg.x === 0 && beg.y === 0 && beg.k === 9; })());

  // ---------------------------------------------------------------- standaard per lade
  check('standaard prive: begint met begroeting, systeem en snelle toegang, bevat post/agenda/taken/zoek/opslag/systeem/tip, geen technische', ids(s).startsWith('begroeting,systeem,snel-toegang') && ['post', 'agenda', 'taken', 'zoek-recent', 'opslag', 'systeem', 'tip'].every((id) => s.items.some((t) => t.id === id)) && !s.items.some((t) => t.id.startsWith('tech-')));
  const st = standaardWerkblad(T);
  check('standaard technisch: eigen indeling met server/updates/diagnostiek', ['tech-server', 'tech-updates', 'tech-diagnostiek'].every((id) => st.items.some((t) => t.id === id)) && !gelijkWerkblad(s, st));

  // ---------------------------------------------------------------- overzetting van het oude bureaublad
  check('overzetting: elke oude bureau-tegel heeft een bestemming', BUREAU_WIDGETS.filter((b) => b.stand === 'klaar').every((b) => BUREAU_NAAR_WERKBLAD[b.id] && werkbladWidget(BUREAU_NAAR_WERKBLAD[b.id].id)));
  const oud = normaliseerBureau({ tegels: [{ tid: 't1', id: 'post-tellers', k: 3, r: 1 }, { tid: 't2', id: 'agenda-vandaag', k: 4, r: 2 }, { tid: 't3', id: 'taken-volgende', k: 4, r: 3 }, { tid: 't4', id: 'notities-vast', k: 4, r: 2 }, { tid: 't5', id: 'diensten-stand', k: 6, r: 3 }] });
  const vb = vanBureau(oud, P);
  check('overzetting bureau: 5 tegels → 5 widgets in volgorde met formaat en instellingen (tellers/vandaag/vast)',
    ids(vb) === 'post,agenda,taken,notities,diensten' && vb.items[0].inst?.weergave === 'tellers' && vb.items[0].k === 3 && vb.items[0].r === 1 && vb.items[1].inst?.filter === 'vandaag' && vb.items[3].inst?.filter === 'vast' && vb.items[4].k === 6);
  check('overzetting bureau: onzin → leeg', leegIs(vanBureau(null, P)) && leegIs(vanBureau({ tegels: [{ id: 'github-activiteit' }] }, P)));

  // ---------------------------------------------------------------- overzetting van de oude blokken
  const blokken: OudBlok[] = [
    { id: 'b3', kind: 'calendar', title: 'Календар', visible: true, position: 3, size: 'small', presentation: 'list', itemLimit: 8, showMeta: false },
    { id: 'b1', kind: 'mail', title: 'Пошта', visible: true, position: 1, size: 'wide' },
    { id: 'b2', kind: 'custom', title: 'Мій сайт', description: 'посилання', url: 'https://voorbeeld.test/', visible: true, position: 2 },
    { id: 'b4', kind: 'files', title: 'Файли', visible: false, position: 4 },
    { id: 'b5', kind: 'custom', title: 'Без адреси', url: '', visible: true, position: 5 },
    { id: 'b6', kind: 'custom', title: 'http-link', url: 'http://onveilig.test', visible: false, position: 6 },
  ];
  const vbl = vanBlokken(blokken, P);
  check('overzetting blokken: zichtbare in volgorde van position (mail → oud-blok 8 breed, link → snelkoppeling, agenda → oud-blok met presentatie/limiet)',
    ids(vbl.indeling) === 'oud-blok,snelkoppeling,oud-blok' && vbl.indeling.items[0].k === 8 && vbl.indeling.items[0].inst?.blokId === 'b1' && vbl.indeling.items[0].inst?.soort === 'mail'
    && vbl.indeling.items[1].inst?.url === 'https://voorbeeld.test/' && vbl.indeling.items[1].r === 1 && vbl.indeling.items[2].inst?.presentation === 'list' && vbl.indeling.items[2].inst?.itemLimit === 8 && vbl.indeling.items[2].inst?.showMeta === false);
  check('overzetting blokken: verborgen blokken komen NIET op het werkblad maar blijven beschikbaar (niets verloren); kale/onveilige blokken vallen weg',
    vbl.verborgen.map((b) => b.id).join(',') === 'b4' && blokInst(blokken[4]) === null && blokInst(blokken[5]) === null);

  // ---------------------------------------------------------------- eerste keer
  const e1 = eersteWerkblad({ bureau: oud, blokken }, P), e2 = eersteWerkblad({ bureau: null, blokken }, P), e3 = eersteWerkblad({}, P), e4 = eersteWerkblad({ bureau: oud }, T);
  check('eerste keer: bureaublad gaat voor (herkomst bureau), met begroeting en snelle toegang vooraan en de linkblokken erbij',
    e1.herkomst === 'bureau' && ids(e1.indeling).startsWith('begroeting,snel-toegang,post,agenda,taken,notities,diensten') && e1.indeling.items.some((t) => t.id === 'snelkoppeling') && !e1.indeling.items.some((t) => t.id === 'oud-blok') && e1.verborgen.length === 1);
  const stdIds = ids(standaardWerkblad(P)).split(',');
  const verwacht = [...stdIds.slice(0, stdIds.indexOf('tip')), 'oud-blok', 'snelkoppeling', 'oud-blok', 'tip'].join(',');
  check('eerste keer: zonder bureaublad → de standaard mét de zelf ingestelde oude blokken vóór de tip-strook (herkomst blokken, formaat bewaard)',
    e2.herkomst === 'blokken' && ids(e2.indeling) === verwacht && e2.indeling.items.find((t) => t.inst?.blokId === 'b1')?.k === 8, ids(e2.indeling));
  // De zes blokken die de server in elke nieuwe werkruimte zet, zijn GEEN instelling: een verse gebruiker krijgt de standaard.
  const vers: OudBlok[] = STANDAARD_BLOKKEN.map(([kind, title, description, size], i) => ({ id: `d${i}`, kind, title, description, size, visible: true, position: i, custom: false }));
  const eV = eersteWerkblad({ bureau: null, blokken: vers }, P);
  check('eerste keer: onaangeroerde standaardblokken → gewoon de standaard (herkomst standaard), niets in «Старі блоки»', eV.herkomst === 'standaard' && gelijkWerkblad(eV.indeling, standaardWerkblad(P)) && eV.verborgen.length === 0 && vers.every((b) => !blokAangepast(b)));
  const half = vers.map((b) => (b.kind === 'mail' ? { ...b, title: 'Моя пошта' } : b.kind === 'files' ? { ...b, visible: false } : b));
  const eH = eersteWerkblad({ bureau: null, blokken: half }, P);
  check('eerste keer: alleen het hernoemde blok gaat mee (met zijn naam), het verborgen blok staat in de catalogus, de rest is standaard',
    eH.herkomst === 'blokken' && eH.indeling.items.filter((t) => t.id === 'oud-blok').length === 1 && eH.indeling.items.find((t) => t.id === 'oud-blok')?.inst?.titel === 'Моя пошта' && eH.verborgen.map((b) => b.kind).join(',') === 'files');
  check('blokAangepast: eigen blok, adres, formaat, weergave, kleur → aangepast',
    [{ custom: true }, { url: 'https://x.test' }, { size: 'wide' }, { presentation: 'list' }, { itemLimit: 8 }, { showMeta: false }, { blockTheme: 'dark' }, { backgroundColor: '#123456' }].every((x) => blokAangepast({ ...vers[1], ...x })));
  const bron = lees('backend/index.ts'), m = /const defaults = \[([\s\S]*?)\] as const;/.exec(bron);
  const uitBackend = m ? [...m[1].matchAll(/\['([a-z]+)', '([^']*)', '([^']*)', '([a-z]+)'\]/g)].map((x) => [x[1], x[2], x[3], x[4]].join('|')) : [];
  check('STANDAARD_BLOKKEN is gelijk aan de standaardblokken van de server (backend/index.ts)', uitBackend.length === 6 && uitBackend.join('\n') === STANDAARD_BLOKKEN.map((d) => d.join('|')).join('\n'), uitBackend.join(' / '));
  check('eerste keer: zonder iets → standaard (nooit een lege pagina)', e3.herkomst === 'standaard' && gelijkWerkblad(e3.indeling, standaardWerkblad(P)));
  check('eerste keer: in de technische lade blijft de overzetting binnen de regels van die lade', e4.herkomst === 'bureau' && e4.indeling.items.every((t) => toegestaan(t.id, T)));

  // ---------------------------------------------------------------- hulp
  const hulpFouten = Object.entries(HELP_WERKBLAD).flatMap(([k, h]) => hulpGebreken(k, h));
  check('hulp: werkblad.instellen / .achtergrond / .terugzetten volledig (4 lagen, uk/nl) en geregistreerd', hulpFouten.length === 0 && ['werkblad.instellen', 'werkblad.achtergrond', 'werkblad.terugzetten'].every((k) => hulpVan(k)), hulpFouten.join('\n'));
  const pagina = lees('src/werkblad/Werkblad.tsx');
  check('hulp: naast de knoppen van de instelmodus staat een «?» voor elke sleutel', ['werkblad.instellen', 'werkblad.achtergrond', 'werkblad.terugzetten'].every((k) => pagina.includes(`<HulpVraag k='${k}'`)));

  // ---------------------------------------------------------------- opmaak en aansluiting
  const css = lees('src/werkblad/werkblad.css');
  check('opmaak: geen hex-kleuren (alleen tokens), drie rasters (12/6/1), expliciete plaatsing', !/#[0-9a-f]{3,8}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')) && /repeat\(12,minmax\(0,1fr\)\)/.test(css) && /max-width:1100px\)\{\.wb-raster\{grid-template-columns:repeat\(6/.test(css) && /max-width:700px\)/.test(css) && /prefers-reduced-motion/.test(css));
  check('opmaak: tikvlak ≥ 44 px op de telefoon (tik-hoogte-mobiel) en geen externe bron', /--tik-hoogte-mobiel/.test(css) && !/https?:\/\//.test(css));
  const app = lees('src/App.tsx');
  check('aansluiting: het werkblad staat (lui geladen) op «Огляд» met de oude blokken en de rechten als invoer; het oude Bureau niet meer',
    /const Werkblad=lazyZoek\(\(\)=>import\('\.\/werkblad\/Werkblad'\)\)/.test(app) && app.includes("<Werkblad lang={lang} ownerUserId={user?.id||''} naam={user?.name||''} magBewerken={ownerMode} rechten={accountRechten(user)} oudeBlokken={blocks}") && !app.includes('<Bureau '));
  check('aansluiting: de oude blokken staan op «Огляд» niet meer los onder het werkblad (geen dubbel), wel nog op «Останні»', /filteredVisible = visible\.filter\(\(block\) => \(\/\*[^*]*\*\/ hubTab === 'recent' \|\|/.test(app));
  const index = lees('backend/index.ts');
  check('aansluiting: de routes zijn geregistreerd met dezelfde sessiecontrole als de rest', /createWerkbladRoutes\(\(event,body\)=>ownerRequireSession\(event,body\)\)/.test(index));
  check('widgets: elke widget-id heeft een inhoud in Werkblad.tsx (switch) en een icoon', WERKBLAD_WIDGET_IDS.filter((id) => id !== 'github').every((id) => pagina.includes(`case '${id}'`)) && WERKBLAD_WIDGET_IDS.every((id) => new RegExp(`(^|[^a-z-])'?${id}'?: `).test(pagina)));
  check('widgets: geen Math.random / nagemaakte gegevens in de widgets', ['Post', 'Agenda', 'Taken', 'Bestanden', 'Overig', 'Start'].every((f) => !/Math\.random/.test(lees(`src/werkblad/widgets/${f}.tsx`))));
  check('widgets: merklogo\'s alleen via src/merk (MerkLogo), geen eigen svg-paden', /from '\.\.\/\.\.\/merk\/MerkLogo'/.test(lees('src/werkblad/widgets/Bestanden.tsx')) && !/<path d=/.test(lees('src/werkblad/widgets/Bestanden.tsx') + lees('src/werkblad/widgets/Start.tsx')));
  check('lui laden: de zware widgets zijn aparte chunks (React.lazy) en elke tegel laadt pas in beeld (useZichtbaar)', (pagina.match(/lazy\(\(\) => import\('\.\/widgets\//g) || []).length >= 4 && pagina.includes('useZichtbaar<HTMLElement>()'));

  // ---------------------------------------------------------------- bediening (stand 23.10: slepen verloor het loslaten)
  check('slepen: tijdens het slepen verandert alleen een VOORBEELD van de plaatsen (DOM-volgorde blijft tot het loslaten), met vangnet op window',
    /const \[voorbeeld, setVoorbeeld\] = useState<WerkbladIndeling \| null>\(null\)/.test(pagina) && /plaatsen\(zicht\.items, kolommen\)/.test(pagina)
    && /addEventListener\('pointerup', op\)/.test(pagina) && /eindSleep\(e\.type !== 'pointercancel'\)/.test(pagina) && !/setIndeling\(\(huidig\) => \{ const doel/.test(pagina));
  check('toegankelijkheid: verplaatsen/formaat wordt aangekondigd (aria-live) en de focus blijft op hetzelfde element van dezelfde tegel',
    /aria-live='polite' data-wb-melding/.test(pagina) && /naVerplaatsen\(tid, volgende, '\.wb-tegel-titel'/.test(pagina) && /role='list'/.test(pagina) && /role='listitem'/.test(pagina));
  check('telefoon/tablet: omhoog/omlaag-knoppen onder 12 kolommen; formaatgreep niet op de telefoon', /kolommen < 12 \?/.test(pagina) && /instellen && kolommen > 1 && !KAAL\.has\(item\.id\)/.test(pagina));
  check('hulp: de bedieningselementen van de instelmodus dragen data-hulp (achtergrond = role=radio, instellen, terugzetten) en src/werkblad valt onder de hulp-scanner',
    /role='radio' data-hulp='werkblad\.achtergrond'/.test(pagina) && /data-hulp='werkblad\.instellen'/.test(pagina) && /data-hulp='werkblad\.terugzetten'/.test(pagina) && /'src\/werkblad'/.test(lees('tests/eenheid/hulp-register.test.ts')));
  check('opmaak: telefoon zonder vaste rijhoogtes (tegels groeien mee), container queries voor smalle tegels', /\.wb-tegel\{grid-column:1 \/ -1!important;grid-row:auto!important/.test(css) && /container-type:inline-size/.test(css) && /@container \(max-width:380px\)/.test(css));

  return einde();
}
