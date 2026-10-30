// /zoek — INTERFACE (zone Z4, 22.10.2026). Draaien: node scripts/eenheidstests.mjs zoek-ui-20261022
//   A. zuivere logica (src/zoek/zoek-logica.ts, zoek-kern.ts): filters → serververzoek, URL heen-en-terug, geschiedenisfilters,
//      momentopname ⇄ actueel (nieuw / niet meer beschikbaar, geen dubbels), markering uit posities (geen innerHTML), route → URL.
//   B. structuur (renderToStaticMarkup): kaart (ronde icoon, pad, fragment met <mark>, percent, actie, uitleg), combobox/listbox-ARIA,
//      filterpaneel (kolom én onderblad role=dialog), bron zonder dangerouslySetInnerHTML, CSS zonder hex/prefers-color-scheme.
//   C. geschiedenis op de server (migratie 0103, backend/zoek-geschiedenis.ts) via de ECHTE routes (handler + sessiecookie):
//      twee gebruikers zien elkaars geschiedenis niet (lijst, open, wis), prive ≠ technisch (lade uit de poort), bewaren = upsert met
//      nieuw/weg, alleen bron+id (geen titel/tekst), 'fout' laat de momentopname staan, wis-alles raakt alleen de eigen lade.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';
import { tabHash } from '../../backend/tech-profiel';
import { filtersSchonen, samenvoegen, treffersSchonen } from '../../backend/zoek-geschiedenis';
import { LEEG_FILTER, bouwVraag, effectieveBronnen, filterLokaal, filtersUitGeschiedenis, filtersVoorGeschiedenis, leesUrl, markeerTegenMomentopname, nietsGeindexeerd, schrijfUrl, zichtbareCategorieen, categorieTelling } from '../../src/zoek/zoek-logica';
import type { ZoekBronStand, ZoekTreffer } from '../../shared/zoek-model';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');
const HOST = 'id.tarasevych.com';
const lees = (f: string) => readFileSync(f, 'utf8');

function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'matchMedia', 'navigator', 'CSS'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://hub.tarasevych.com/zoek?q=пошта');
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = { hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null, addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } } };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  Object.defineProperty(g, 'navigator', { value: { platform: 'Linux', userAgent: 'eenheid' }, configurable: true, writable: true });
  g.CSS = { escape: (s: string) => s };
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}
const treffer = (p: Partial<ZoekTreffer>): ZoekTreffer => ({ id: 'x', bron: 'mail', soort: 'bericht', titel: 'Titel', titels: {}, omschrijving: '', pad: '', route: null, taal: '', formaat: '', bijgewerktOp: 1_800_000_000_000, extra: {}, integratie: '', score: 1, percent: 50, uitleg: [], fragment: { tekst: '', bron: 'tekst', posities: [] }, ...p });

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-ui-20261022');
  const stil = console.error; console.error = () => {};
  try {
    // ================================================================ A. zuivere logica
    const stand: ZoekBronStand[] = [
      { bron: 'mail', stand: 'klaar', voortgang: 100, aantal: 12, laatsteOk: 1, laatstePoging: 1, fout: '', versie: 'v', bijgewerktOp: 1 },
      { bron: 'cloud', stand: 'indexeert', voortgang: 40, aantal: 3, laatsteOk: 0, laatstePoging: 1, fout: '', versie: 'v', bijgewerktOp: 1 },
      { bron: 'github', stand: 'niet_gekoppeld', voortgang: 0, aantal: 0, laatsteOk: 0, laatstePoging: 0, fout: '', versie: '', bijgewerktOp: 0 },
      { bron: 'instelling', stand: 'klaar', voortgang: 100, aantal: 40, laatsteOk: 1, laatstePoging: 1, fout: '', versie: 'v', bijgewerktOp: 1 },
    ];
    check('A categorieën: alleen gekoppelde bronnen (github niet, cloud wel al indexeert het), «Усе» altijd', JSON.stringify(zichtbareCategorieen(stand)) === '["all","mail","files","instellingen"]');
    check('A tellers alleen uit facets van de server (zonder facets: undefined, geen 0)', categorieTelling('mail', undefined) === undefined && categorieTelling('mail', { bron: { mail: 4, bijlage: 2 }, soort: {}, formaat: {}, taal: {} }) === 6 && categorieTelling('all', { bron: { mail: 4, cloud: 1 }, soort: {}, formaat: {}, taal: {} }) === 5);
    check('A effectieve bronnen = categorie ∩ bronfilter; lege doorsnede → categorie', JSON.stringify(effectieveBronnen('files', { bronnen: ['drive', 'mail'], indexStand: 'alle' })) === '["drive"]' && JSON.stringify(effectieveBronnen('files', { bronnen: ['mail'], indexStand: 'alle' })) === '["cloud","drive"]' && effectieveBronnen('all', { bronnen: [], indexStand: 'alle' }).length === 0);
    check('A indexStand=klaar beperkt tot bronnen met stand klaar; niets klaar in beeld → nietsGeindexeerd', JSON.stringify(effectieveBronnen('all', { bronnen: [], indexStand: 'klaar' }, stand)) === '["instelling","mail"]' && nietsGeindexeerd('files', { bronnen: [], indexStand: 'klaar' }, stand) === true && nietsGeindexeerd('mail', { bronnen: [], indexStand: 'klaar' }, stand) === false);
    const nu = 1_800_000_000_000;
    const v = bouwVraag('  налаштування пошти ', 'mail', { ...LEEG_FILTER, soorten: ['bericht'], formaten: ['pdf'], talen: ['uk'], datum: 'd7', minPercent: 50, sorteer: 'nieuwste' }, 2, stand, nu);
    check('A bouwVraag: elk filter gaat ECHT mee (bronnen, soorten, formaten, talen, sinds, sorteer, pagina, perPagina 20, facets)', v.q === 'налаштування пошти' && JSON.stringify(v.bronnen) === '["mail","bijlage"]' && v.soorten?.[0] === 'bericht' && v.formaten?.[0] === 'pdf' && v.talen?.[0] === 'uk' && v.sinds === nu - 7 * 864e5 && v.sorteer === 'nieuwste' && v.pagina === 2 && v.perPagina === 20 && v.facets === true && !('tot' in v));
    const ve = bouwVraag('x', 'all', { ...LEEG_FILTER, datum: 'eigen', van: '2026-01-01', tot: '2026-01-31' }, 1, null, nu);
    check('A eigen periode → sinds/tot (tot = einde van de dag)', ve.sinds === Date.parse('2026-01-01') && ve.tot === Date.parse('2026-01-31') + 864e5 - 1);
    const f1 = { ...LEEG_FILTER, bronnen: ['cloud', 'mail'] as never, soorten: ['bestand'] as never, datum: 'd30' as const, minPercent: 75 as const, indexStand: 'klaar' as const, sorteer: 'titel' as const };
    const url = schrijfUrl('https://hub.tarasevych.com/zoek?lang=nl&focus=weg', 'rapport', 'files', f1); const terug = leesUrl(url.slice(url.indexOf('?')));
    check('A URL heen-en-terug (q, cat, bron, soort, datum, min, index, sorteer; focus eruit)', url.startsWith('/zoek?') && !url.includes('focus') && terug.q === 'rapport' && terug.cat === 'files' && terug.f.bronnen.join() === 'cloud,mail' && terug.f.soorten[0] === 'bestand' && terug.f.datum === 'd30' && terug.f.minPercent === 75 && terug.f.indexStand === 'klaar' && terug.f.sorteer === 'titel');
    check('A URL negeert onbekende waarden', leesUrl('?bron=evil,mail&soort=<x>&datum=zzz&cat=nope&min=33&sorteer=hack&focus=a"b').f.bronnen.join() === 'mail' && leesUrl('?soort=<x>').f.soorten.length === 0 && leesUrl('?cat=nope').cat === 'all' && leesUrl('?min=33').f.minPercent === 0 && leesUrl('?focus=a"b').focus === 'a"b'.slice(0, 120));
    const g1 = filtersVoorGeschiedenis('files', f1); const g2 = filtersUitGeschiedenis(g1);
    check('A geschiedenisfilters: alleen gevulde sleutels, gesorteerd, en terug', JSON.stringify(g1) === '{"cat":"files","bronnen":["cloud","mail"],"soorten":["bestand"],"datum":"d30","minPercent":75,"indexStand":"klaar","sorteer":"titel"}' && g2.cat === 'files' && JSON.stringify(g2.f) === JSON.stringify(f1));
    check('A filtersVoorGeschiedenis zonder filters = {}', JSON.stringify(filtersVoorGeschiedenis('all', LEEG_FILTER)) === '{}');
    const m = markeerTegenMomentopname([{ bron: 'mail', id: '1' }, { bron: 'mail', id: '2' }, { bron: 'mail', id: '2' }, { bron: 'cloud', id: '9' }], [treffer({ id: '2' }), treffer({ id: '3' }), treffer({ id: '3' }), treffer({ id: '1', bron: 'bijlage' })]);
    check('A momentopname ⇄ actueel: nieuw (3, bijlage:1), gebleven (mail:2), weg (mail:1, cloud:9), geen dubbels', m.items.map(x => `${x.bron}:${x.id}=${x.markering}`).join() === 'mail:2=gebleven,mail:3=nieuw,bijlage:1=nieuw' && m.weg.map(w => `${w.bron}:${w.id}`).join() === 'mail:1,cloud:9');
    const s = samenvoegen([{ bron: 'mail', id: '1' }, { bron: 'mail', id: '2' }], [{ bron: 'mail', id: '2' }, { bron: 'mail', id: '3' }]);
    check('A server samenvoegen (backend) = dezelfde uitkomst als de client', s.nieuw.map(x => x.id).join() === '3' && s.weg.map(x => x.id).join() === '1' && s.gebleven.map(x => x.id).join() === '2');
    check('A treffersSchonen: alleen bron+id, titel/tekst vallen weg, dubbels weg, max 200', (() => { const t = treffersSchonen([{ bron: 'mail', id: 'a', titel: 'GEHEIM', tekst: 'x' }, { bron: 'mail', id: 'a' }, { bron: 'Mail!', id: 'b' }, { id: 'zonder' }, ...Array.from({ length: 300 }, (_, i) => ({ bron: 'cloud', id: `c${i}` }))]); return t.length === 200 && JSON.stringify(t[0]) === '{"bron":"mail","id":"a"}' && t[1].bron === 'mail' && t[1].id === 'b'; })());
    check('A filtersSchonen: vaste vorm (gesorteerd, leeg weg, onbekende sleutels weg)', JSON.stringify(filtersSchonen({ zzz: ['b', 'a', 'a'], cat: 'mail', leeg: [], nul: 0, aan: true, uit: false, 'x-y': 1, __proto__: { q: 1 } })) === '{"aan":true,"cat":"mail","zzz":["a","b"]}');
    check('A filterLokaal: -woord en minimale overeenkomst (serverwaarde percent)', filterLokaal([treffer({ id: '1', percent: 90, titel: 'Factuur juli' }), treffer({ id: '2', percent: 40 }), treffer({ id: '3', percent: 80, fragment: { tekst: 'concept', bron: 'tekst', posities: [] } })], { minPercent: 50 }, ['concept']).map(x => x.id).join() === '1');

    const herstel = nepBrowser(); // zoek-core → canonical-service leest window.__TSV_CANONICAL_SERVICE__ bij het laden
    const { highlightParts, stukkenUitPosities, oudeGeschiedenisOpruimen, OUDE_GESCHIEDENIS_SLEUTEL } = await import('../../src/zoek/zoek-kern');
    const st = stukkenUitPosities('налаштування пошти', [[0, 12], [13, 18], [5, 14], [50, 60], [3, 1]]);
    check('A posities van de server → stukken: overlap samengevoegd, buiten de tekst genegeerd, omgekeerd genegeerd', st.map(p => `${p.hit ? '*' : ''}${p.t}`).join('|') === '*налаштування пошти');
    const st2 = stukkenUitPosities('abc def ghi', [[4, 7]]);
    check('A posities: alleen het aangewezen woord', st2.map(p => `${p.hit ? '*' : ''}${p.t}`).join('|') === 'abc |*def| ghi');
    const parts = highlightParts('<img src=x> factuur', ['factuur']);
    check('A lokale markering: ruwe tekst blijft tekst (geen HTML), regex-tekens veilig', parts.some(p => p.hit && p.t === 'factuur') && parts.some(p => !p.hit && p.t.includes('<img')) && highlightParts('a+b (c)', ['(c)', 'a+b']).length > 0);
    const opslag = new Map<string, string>([[OUDE_GESCHIEDENIS_SLEUTEL, '[{"query":"geheim"}]']]);
    check('A oude localStorage-geschiedenis (zonder gebruiker) wordt gewist, nooit meer geschreven', oudeGeschiedenisOpruimen({ getItem: k => opslag.get(k) ?? null, removeItem: k => { opslag.delete(k); } }) === true && !opslag.has(OUDE_GESCHIEDENIS_SLEUTEL) && oudeGeschiedenisOpruimen({ getItem: () => null, removeItem: () => undefined }) === false && !lees('src/zoek/zoek-kern.ts').includes('localStorage.setItem'));

    // ================================================================ B. structuur
    const { routeUrl, githubUrl } = await import('../../src/zoek/zoek-kern');
    check('B routeUrl: host → dienst, pad, params, lang, focus=hulp-sleutel; onveilig pad → /; onbekende host → \'\'',
      routeUrl({ host: 'id', pad: '/instellingen', params: { focus: 'taal.kiezer', lang: 'xx' } }, 'nl') === 'https://id.tarasevych.com/instellingen?focus=taal.kiezer&lang=nl'
      && routeUrl({ host: 'mail', pad: '/postvak-in', params: { open_message_id: 'm1' }, hash: 'x' }, 'uk') === 'https://mail.tarasevych.com/postvak-in?open_message_id=m1&lang=uk#x'
      && routeUrl({ host: 'hub', pad: '//evil.example/x' }, 'uk') === 'https://hub.tarasevych.com/?lang=uk' && routeUrl({ host: 'hub', pad: '/a/../b' }, 'uk') === 'https://hub.tarasevych.com/?lang=uk' && routeUrl({ host: 'evil' as never, pad: '/' }, 'uk') === '' && routeUrl(null, 'uk') === '');
    check('B githubUrl: alleen https://github.com', githubUrl({ url: 'https://github.com/a/b' }) === 'https://github.com/a/b' && githubUrl({ url: 'https://evil.com/github.com' }) === '' && githubUrl({ url: 'javascript:alert(1)' }) === '');
    const Kaart = (await import('../../src/zoek/ZoekKaart')).default;
    const r1 = treffer({ id: 'm-1', bron: 'instelling', soort: 'instelling', titel: 'Налаштування пошти', titels: { nl: 'E-mailinstellingen' }, pad: 'Налаштування › Пошта', percent: 98, taal: 'uk', bijgewerktOp: Date.UTC(2026, 9, 12),
      route: { host: 'id', pad: '/instellingen', params: { focus: 'mail.koppelen' } }, fragment: { tekst: '<img src=x onerror=alert(1)> тут ви можете налаштувати параметри пошти', bron: 'omschrijving', posities: [[43, 54], [65, 70]] },
      uitleg: [{ code: 'exacte_titel', uk: 'Точний збіг назви', nl: 'Exacte titel' }, { code: 'synoniem', uk: 'Синонім: mail → пошта', nl: 'Synoniem' }], extra: { tags: ['Пошта'] } });
    const k = renderToStaticMarkup(createElement(Kaart, { r: r1, lang: 'uk', terms: ['налаштування'] }));
    check('B kaart: artikel met bron/soort-klassen, ronde icoon aria-hidden, titel als h3-link naar de echte route (lang + focus)', /<article class="zk-kaart kaart bron-instelling soort-instelling"/.test(k) && k.includes('class="zk-kaart-ic" aria-hidden="true"') && k.includes('<h3 class="zk-kaart-titel"><a href="https://id.tarasevych.com/instellingen?focus=mail.koppelen&amp;lang=uk"') && !k.includes('<span> пошти</span>'));
    check('B kaart: fragment markeert de posities van de SERVER met <mark>, ruwe HTML blijft tekst (geen innerHTML)', k.includes('<mark>налаштувати</mark>') && k.includes('<mark>пошти</mark>') && k.includes('&lt;img src=x onerror=alert(1)&gt;') && !k.includes('<img'));
    check('B kaart: pad «Налаштування › Пошта» (bron niet dubbel), percent als pil met schermlezertekst, actie per soort («Відкрити налаштування»), datum, tags, uitleg uitklapbaar', k.includes('<p class="zk-kaart-pad"><span>Налаштування</span><span><span aria-hidden="true" class="zk-pad-sep"> › </span>Пошта</span></p>') && k.includes('class="pil pil-ok zk-pct"') && k.includes('Відповідність запиту: </span>98%') && k.includes('aria-label="Відкрити налаштування: Налаштування пошти"') && k.includes('<time dateTime="2026-10-12T00:00:00.000Z"') && k.includes('<li class="pil pil-stil">Пошта</li>') && k.includes('<details class="zk-uitleg"><summary>Чому релевантно</summary><ul><li>Точний збіг назви</li><li>Синонім: mail → пошта</li></ul>'));
    const kn = renderToStaticMarkup(createElement(Kaart, { r: r1, lang: 'nl', terms: [] }));
    check('B kaart nl: titel per taal (titels.nl), labels nl', kn.includes('>E-mailinstellingen<') && kn.includes('Instelling openen') && kn.includes('Waarom relevant'));
    const r2 = treffer({ id: 'gh', bron: 'github', soort: 'issue', titel: 'Bug #12', percent: 12, route: null, extra: { url: 'https://github.com/o/r/issues/12' } });
    const k2 = renderToStaticMarkup(createElement(Kaart, { r: r2, lang: 'uk', terms: [] }));
    check('B kaart zonder route: externe GitHub-link (noopener, nieuw tabblad), lage overeenkomst = pil-stil', k2.includes('href="https://github.com/o/r/issues/12"') && k2.includes('rel="noopener noreferrer"') && k2.includes('class="pil pil-stil zk-pct"'));
    const k3 = renderToStaticMarkup(createElement(Kaart, { r: treffer({ id: 'z', route: null }), lang: 'uk', terms: [], markering: 'nieuw' }));
    check('B kaart zonder enige route: geen link, «Без переходу»; markering «нове» als pil', k3.includes('Без переходу') && !k3.includes('<a ') && k3.includes('class="pil pil-info zk-nieuw">нове</span>') && k3.includes('is-nieuw'));
    // zone D (22.10.2026): gekleurde tegels, afzenderfoto, formaat, raster, groepen «за джерелами», weergavekeuze, relatieve tijd
    const km = renderToStaticMarkup(createElement(Kaart, { r: treffer({ id: 'm9', bron: 'mail', soort: 'bericht', titel: 'Factuur', extra: { afzender: 'olena@example.test', afzenderNaam: 'Olena Koval' } }), lang: 'uk', terms: [] }));
    check('D kaart brief: tegel = foto/logo van de afzender (AfzenderFoto, app.afzender_beeld) met beginletters als terugval, data-zoek-bron', km.includes('data-zoek-icoon="afzender"') && km.includes('class="afz-foto"') && km.includes('>OK<') && km.includes('data-zoek-bron="mail"'));
    const kf = renderToStaticMarkup(createElement(Kaart, { r: treffer({ id: 'c9', bron: 'cloud', soort: 'bestand', titel: 'plan.pdf', formaat: 'pdf' }), lang: 'uk', terms: [], weergave: 'raster' }));
    check('D kaart bestand in het raster: formaat in de tegel (PDF), klasse is-tegel', kf.includes('data-zoek-icoon="formaat"') && kf.includes('<span class="zk-kaart-formaat">PDF</span>') && kf.includes('is-tegel'));
    check('D kaart GitHub/Drive: officieel merklogo via het Merk-component (src/merk; bij het renderen zonder tabel de terugval-icoon), nooit een eigen tekening', k2.includes('data-zoek-icoon="merk"') && lees('src/zoek/ZoekKaart.tsx').includes("<Merk merk={merk} vorm='rond'") && !lees('src/zoek/ZoekKaart.tsx').includes('<path'));
    const { groepeerPerCategorie, categorieVanBron, leesWeergave, bewaarWeergave, WEERGAVE_SLEUTEL } = await import('../../src/zoek/zoek-logica');
    const gr = groepeerPerCategorie([treffer({ id: '1', bron: 'cloud' }), treffer({ id: '2', bron: 'mail' }), treffer({ id: '3', bron: 'instelling' }), treffer({ id: '4', bron: 'bijlage' }), treffer({ id: '5', bron: 'github' })]);
    check('D groepeerPerCategorie: vaste categorievolgorde, bron + bijlage samen onder «Пошта», volgorde binnen een groep blijft, lege groepen weg', gr.map(g => `${g.categorie}:${g.items.map(x => x.id).join('+')}`).join() === 'mail:2+4,files:1,instellingen:3,github:5' && categorieVanBron('hulp') === 'paginas' && categorieVanBron('apparaat') === 'overig');
    const wOpslag = new Map<string, string>();
    bewaarWeergave({ weergave: 'raster', ordening: 'bron' }, { setItem: (k, v) => { wOpslag.set(k, v); } });
    check('D weergavekeuze: bewaard per browser (localStorage, alleen gemak), onbekend → standaard', wOpslag.has(WEERGAVE_SLEUTEL) && JSON.stringify(leesWeergave({ getItem: k => wOpslag.get(k) ?? null })) === '{"weergave":"raster","ordening":"bron"}' && JSON.stringify(leesWeergave({ getItem: () => '{"weergave":"evil","ordening":1}' })) === '{"weergave":"lijst","ordening":"relevantie"}' && leesWeergave(null).weergave === 'lijst');
    const { relatiefTijd } = await import('../../src/zoek/zoek-kern');
    const nuT = 1_800_000_000_000;
    check('D relatiefTijd uk/nl: щойно, хв, год, вчора, дні/днів; ouder dan 7 dagen → \'\' (datum)', relatiefTijd(nuT - 10_000, 'uk', nuT) === 'щойно' && relatiefTijd(nuT - 5 * 60_000, 'nl', nuT) === '5 min geleden' && relatiefTijd(nuT - 2 * 3_600_000, 'uk', nuT) === '2 год тому' && relatiefTijd(nuT - 26 * 3_600_000, 'uk', nuT) === 'вчора' && relatiefTijd(nuT - 3 * 864e5, 'uk', nuT) === '3 дні тому' && relatiefTijd(nuT - 5 * 864e5, 'uk', nuT) === '5 днів тому' && relatiefTijd(nuT - 9 * 864e5, 'nl', nuT) === '' && relatiefTijd(0, 'uk', nuT) === '');
    const Veld = (await import('../../src/zoek/ZoekVeld')).default;
    const vh = renderToStaticMarkup(createElement(Veld, { lang: 'uk', value: 'пош', onChange: () => undefined, onSubmit: () => undefined, suggesties: [{ soort: 'functie', tekst: 'Пошта: підключити акаунт', route: { host: 'mail', pad: '/accounts' } }, { soort: 'correctie', tekst: 'пошта' }, { soort: 'geschiedenis', tekst: 'пошта від Ірини', id: 'g1', aantal: 3 }], placeholder: 'Що шукаємо?', label: 'Пошук', groot: true }));
    check('B combobox-ARIA: role=combobox, aria-expanded, aria-controls=listbox-id, aria-autocomplete=list, label, listbox met role=option', (() => { const id = /aria-controls="([^"]+)"/.exec(vh)?.[1]; return !!id && vh.includes('role="combobox"') && vh.includes('aria-expanded="false"') && vh.includes('aria-autocomplete="list"') && vh.includes(`<ul id="${id}" role="listbox" aria-label="Підказки пошуку" class="zk-pop" hidden=""`) && (vh.match(/role="option"/g) || []).length === 3 && vh.includes('<label for="') && vh.includes('class="zk-sr">Пошук</label>'); })());
    check('B suggesties: soortlabel per rij (Функція, Виправлення, Нещодавній пошук · 3), markering van het getypte, status-regio (role=status, leeg bij start)', vh.includes('>Функція</span>') && vh.includes('>Виправлення</span>') && vh.includes('Нещодавній пошук · 3') && vh.includes('<mark>Пош</mark>') && vh.includes('role="status" aria-live="polite" class="zk-sr"></p>'));
    const Filters = (await import('../../src/zoek/ZoekFilters')).default;
    const facets = { bron: { mail: 3 }, soort: { bericht: 3 }, formaat: { pdf: 1 }, taal: { uk: 3 } };
    const fk = renderToStaticMarkup(createElement(Filters, { lang: 'uk', f: { ...LEEG_FILTER, bronnen: ['mail'] }, setF: () => undefined, facets, stand, mobiel: false, open: false, onClose: () => undefined, openerRef: { current: null } }));
    check('B filterkolom: aside met kop, groepen bron/type/formaat/taal/datum/min/index/sortering, tellers uit facets, niet-gekoppelde bron uitgeschakeld met stand als hint',
      fk.startsWith('<aside') && fk.includes('data-zoek-filters="kolom"') && ['bron', 'soort', 'formaat', 'taal', 'datum', 'min', 'index', 'sorteer'].every(g => fk.includes(`class="zk-groep zk-groep-${g}"`)) && fk.includes('<span class="zk-vink-n">3</span>') && /class="zk-vink is-uit"><input type="checkbox"[^>]*disabled=""[^>]*\/><span class="zk-vink-tekst">GitHub/.test(fk) && fk.includes('Індексується 40%') && fk.includes('class="pil pil-info zk-filter-n">1<'));
    const fm = renderToStaticMarkup(createElement(Filters, { lang: 'uk', f: LEEG_FILTER, setF: () => undefined, facets, stand, mobiel: true, open: true, onClose: () => undefined, openerRef: { current: null } }));
    const fmDicht = renderToStaticMarkup(createElement(Filters, { lang: 'uk', f: LEEG_FILTER, setF: () => undefined, facets, stand, mobiel: true, open: false, onClose: () => undefined, openerRef: { current: null } }));
    check('B telefoon: onderblad role=dialog aria-modal met scrim, sluitknop en «Показати результати»; dicht = niets in de DOM', fm.includes('class="zk-scrim"') && fm.includes('role="dialog" aria-modal="true"') && fm.includes('data-zoek-filters="onderblad"') && fm.includes('aria-label="Закрити фільтри"') && fm.includes('Показати результати') && fmDicht === '');
    herstel();
    const bronnen = ['src/zoek/ZoekPagina.tsx', 'src/zoek/ZoekKaart.tsx', 'src/zoek/ZoekVeld.tsx', 'src/zoek/ZoekFilters.tsx', 'src/zoek/ZoekGlobaal.tsx', 'src/zoek/ZoekIndexVenster.tsx', 'src/GlobaalZoekPaneel.tsx'].map(lees).join('\n');
    check('B geen dangerouslySetInnerHTML/innerHTML in de zoekinterface', !/dangerouslySetInnerHTML|\.innerHTML/.test(bronnen));
    const pagina = lees('src/zoek/ZoekPagina.tsx');
    check('B debounce 250 ms, AbortController (één lopend verzoek), perPagina 20, «показати ще», skelet, correcties nooit stil (origineel blijft)', pagina.includes('DEBOUNCE_MS = 250') && pagina.includes('ctl.current?.abort(); const ac = new AbortController()') && lees('src/zoek/zoek-logica.ts').includes('PER_PAGINA = 20') && pagina.includes('zk-skelet') && pagina.includes('t.origineel(serverQ)') && pagina.includes("soort === 'correctie'"));
    check('D pagina: groepen met kop per categorie (icoon + naam + teller), lijst/raster-knoppen (aria-pressed), ordening-select, technische strook + indexknop alleen bij techActief', pagina.includes("className={`zk-groep-sectie cat-${g.categorie}`}") && pagina.includes('<h3 id={`${uid}-g-${g.categorie}`} className=\'zk-groep-kop\'>') && pagina.includes("aria-pressed={wk.weergave === 'lijst'}") && pagina.includes("data-hulp-vrij='sortering'") && pagina.includes("{techAan && <p className='melding melding-info zk-tech-strook'") && pagina.includes("{techAan && <button type='button' className='knop knop-secundair is-klein zk-indexknop'"));
    check('B staten in de bron: begin, laden, resultaten, niets, fout, geenRecht, momentopname, nietsGeindexeerd, live, indexeert, deels, gesloten, geenBronnen', ['data-zoek-staat=', "'laden'", "'begin'", "'momentopname'", "'niets'", "'resultaten'", 'geenRecht', 'nietsGeindexeerd(cat, f, stand)', "antwoord?.bron === 'live'", 'indexeert.length > 0', 'deels.length > 0', 'data-zoek-gesloten', 'geenBronnen &&'].every(x => pagina.includes(x)));
    check('B SearchPage/SearchSuggest (kapot: fetch zonder service → 403; relevancePercent = score*10) zijn weg; GlobalSearchPanel is een schil over het palet', !existsSync('src/zoek/SearchPage.tsx') && !existsSync('src/zoek/SearchSuggest.tsx') && lees('src/GlobaalZoekPaneel.tsx').includes('openZoekPalet()') && !lees('src/CloudFunctioneelWeergave.tsx').includes("from './search/SearchPage'"));
    const css = lees('src/zoek/zoek.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const pxBreed = [...css.matchAll(/(?:^|[;{\s])(?:width|min-width|max-width|flex-basis)\s*:\s*([^;}]+)/g)].map(m => m[1]).filter(w => /(\d+)px/.test(w) && Number(/(\d+)px/.exec(w)![1]) > 360);
    const kleineLetter = [...css.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1])).filter(n => n < 12);
    check('B zoek.css: geen hex, geen prefers-color-scheme, geen px-breedte > 360, geen letter < 12px, wel prefers-reduced-motion', !/#[0-9a-f]{3,8}\b/i.test(css) && !css.includes('prefers-color-scheme') && pxBreed.length === 0 && kleineLetter.length === 0 && css.includes('prefers-reduced-motion'));
    const chrome = lees('src/CanoniekOmlijsting.tsx');
    check('B bovenbalk: ZoekGlobaal (veld-knop + palet ⌘K) op computer én telefoon; focus-doel gestart', chrome.includes("<ZoekGlobaal lang={lang} dienst={current}/>") && chrome.includes('<ZoekGlobaal lang={lang} mobiel dienst={current}/>') && chrome.includes('focusDoelStarten()'));
    const palet = lees('src/zoek/ZoekGlobaal.tsx');
    check('B palet: ⌘K/Ctrl+K, role=dialog aria-modal, houdTab, Escape → sluiten + focus terug, Enter zonder keuze → /zoek?q=', palet.includes("(e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && (e.key === 'k'") && palet.includes("role='dialog' aria-modal='true'") && palet.includes('houdTab(e, focusbaar(paneel.current)') && palet.includes('focusTerug(vorigeFocus.current)') && palet.includes('location.assign(zoekPaginaUrl(lang, tekst))'));

    // ================================================================ C. geschiedenis op de server (0103) via de echte routes
    const pool = getPool('systeem');
    const idx = await import('../../backend/index');
    const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identity');
    const mig = lees('migrations/0103_zoek_geschiedenis.sql');
    await getPool('migratie').query(mig); await getPool('migratie').query(mig);
    check('C 0103 draait twee keer zonder fout; RLS aan; policy aanwezig; geen tekstkolom voor titels/fragmenten', (await pool.query(`SELECT relrowsecurity FROM pg_class WHERE oid = 'app.zoek_geschiedenis'::regclass`)).rows[0]?.relrowsecurity === true
      && (await pool.query(`SELECT 1 FROM pg_policies WHERE schemaname='app' AND tablename='zoek_geschiedenis' AND policyname='zoek_geschiedenis_eigen'`)).rows.length === 1
      && !(await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='zoek_geschiedenis'`)).rows.some(r => /titel|tekst|fragment/.test(String(r.column_name))));
    const sfx = randomBytes(4).toString('hex');
    const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved', name: email }]); return { id, email }; };
    const A = await mk(`zoek-a-${sfx}@eenheid.test`), B = await mk(`zoek-b-${sfx}@eenheid.test`);
    const sessies: string[] = [];
    const sessie = async (uid: string) => {
      const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
      const rec = { tokenHash: sha(token), userId: uid, service: 'identity', sourceOrigin: `https://${HOST}`, tabHash: sha('ecosystem'), grantId: '', createdAt: now - 3_600_000, authenticatedAt: now - 3_600_000, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.9', userAgent: 'eenheid' };
      await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]); sessies.push(id);
      return { cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
    };
    const roep = async (pad: string, s: { cookie: string } | null, body: Record<string, unknown>, tabContext: string) => {
      const evt = { headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', ...(s ? { cookie: s.cookie } : {}), 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'identity', tabContext, sourceOrigin: `https://${HOST}`, ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
      const r = await idx.handler(evt as never); let data: Record<string, unknown> = {}; try { data = JSON.parse(String(r.body || '{}')); } catch { /* leeg */ } return { status: r.statusCode, data };
    };
    const sA = await sessie(A.id), sB = await sessie(B.id); const tA = tab(), tB = tab(), tD = tab();
    const G = '/api/owner/zoek/geschiedenis';
    try {
      check('C zonder sessie: 403 (geen lijst)', (await roep(`${G}/lijst`, null, {}, tA)).status === 403);
      const b1 = await roep(`${G}/bewaren`, sA, { vraag: 'Налаштування пошти', filters: { cat: 'mail', bronnen: ['mail'] }, treffers: [{ bron: 'mail', id: 'm1', titel: 'GEHEIM' }, { bron: 'instelling', id: 'mail.koppelen' }], totaal: 2, algoritmeVersie: 'zoek-kern-2', indexVersie: 'index' }, tA);
      const item1 = b1.data.item as Record<string, unknown>;
      check('C bewaren (A, prive): rij met genormaliseerde vraag, filters, 2 treffers (alleen bron+id), stand vers, ruimte prive', b1.status === 200 && b1.data.ruimte === 'prive' && b1.data.bestond === false && item1?.vraag === 'Налаштування пошти' && String(item1?.vraagNorm).length > 0 && JSON.stringify(item1?.treffers) === '[{"bron":"mail","id":"m1"},{"bron":"instelling","id":"mail.koppelen"}]' && item1?.stand === 'vers' && !JSON.stringify(b1.data).includes('GEHEIM'), JSON.stringify(b1.data).slice(0, 300));
      const ruw = (await pool.query(`SELECT treffers::text AS t FROM app.zoek_geschiedenis WHERE id=$1`, [item1.id])).rows[0];
      check('C in de database staat geen titel/tekst, alleen bron+id', !!ruw && !ruw.t.includes('GEHEIM') && ruw.t.includes('"m1"'));
      const b2 = await roep(`${G}/bewaren`, sA, { vraag: 'налаштування   ПОШТИ', filters: { bronnen: ['mail'], cat: 'mail' }, treffers: [{ bron: 'mail', id: 'm1' }, { bron: 'mail', id: 'm7' }], totaal: 2, algoritmeVersie: 'zoek-kern-2', indexVersie: 'index' }, tA);
      const item2 = b2.data.item as Record<string, unknown>;
      check('C bewaren opnieuw (zelfde vraag na normalisatie + zelfde filters in andere volgorde) = UPSERT: zelfde id, aantal 2, stand vernieuwd, nieuw [m7], weg [mail.koppelen], momentopname = actueel', b2.data.bestond === true && item2?.id === item1.id && item2?.aantalKeer === 2 && item2?.stand === 'vernieuwd' && JSON.stringify(b2.data.nieuw) === '[{"bron":"mail","id":"m7"}]' && JSON.stringify(b2.data.weg) === '[{"bron":"instelling","id":"mail.koppelen"}]' && JSON.stringify(item2?.treffers) === '[{"bron":"mail","id":"m1"},{"bron":"mail","id":"m7"}]', JSON.stringify(b2.data).slice(0, 300));
      const b3 = await roep(`${G}/bewaren`, sA, { vraag: 'налаштування пошти', filters: {}, treffers: [], totaal: 0, algoritmeVersie: 'zoek-kern-2', indexVersie: 'index' }, tA);
      check('C andere filters = andere rij', (b3.data.item as Record<string, unknown>)?.id !== item1.id && b3.data.bestond === false);
      const bf = await roep(`${G}/bewaren`, sA, { vraag: 'налаштування пошти', filters: { cat: 'mail', bronnen: ['mail'] }, treffers: [], totaal: 0, algoritmeVersie: 'zoek-kern-2', indexVersie: '', stand: 'fout' }, tA);
      check('C stand fout: de momentopname blijft staan (m1, m7), stand = fout', (bf.data.item as Record<string, unknown>)?.stand === 'fout' && JSON.stringify((bf.data.item as Record<string, unknown>)?.treffers) === '[{"bron":"mail","id":"m1"},{"bron":"mail","id":"m7"}]');
      const lA = await roep(`${G}/lijst`, sA, {}, tA); const lB = await roep(`${G}/lijst`, sB, {}, tB);
      check('C lijst A: 2 rijen, nieuwste eerst; lijst B: leeg (twee gebruikers zien elkaars geschiedenis niet)', lA.status === 200 && (lA.data.items as unknown[]).length === 2 && lB.status === 200 && (lB.data.items as unknown[]).length === 0, JSON.stringify(lB.data).slice(0, 200));
      const oB = await roep(`${G}/open`, sB, { id: item1.id }, tB);
      check('C open door B van een rij van A: null (niet 403 met uitleg, niet de rij)', oB.status === 200 && oB.data.item === null && oB.data.fout === 'ZOEK_GESCHIEDENIS_ONBEKEND');
      const wB = await roep(`${G}/wis`, sB, { id: item1.id }, tB);
      check('C wis door B van een rij van A: ok=false en de rij staat er nog', wB.data.ok === false && (await pool.query(`SELECT 1 FROM app.zoek_geschiedenis WHERE id=$1`, [item1.id])).rows.length === 1);
      await roep(`${G}/bewaren`, sB, { vraag: 'налаштування пошти', filters: { cat: 'mail', bronnen: ['mail'] }, treffers: [{ bron: 'mail', id: 'b-eigen' }], totaal: 1, algoritmeVersie: 'zoek-kern-2', indexVersie: 'index' }, tB);
      const oA = await roep(`${G}/open`, sA, { id: item1.id }, tA);
      check('C dezelfde vraag bij B is een eigen rij; A opent de eigen rij met de eigen momentopname (m1, m7), niet die van B', JSON.stringify((oA.data.item as Record<string, unknown>)?.treffers) === '[{"bron":"mail","id":"m1"},{"bron":"mail","id":"m7"}]' && (await pool.query(`SELECT count(*)::int AS n FROM app.zoek_geschiedenis WHERE vraag_norm = $1`, [(oA.data.item as Record<string, unknown>).vraagNorm])).rows[0].n >= 2);
      const waB = await roep(`${G}/wis-alles`, sB, {}, tB);
      check('C wis-alles door B wist alleen B (1), A houdt 2', waB.data.aantal === 1 && (await roep(`${G}/lijst`, sA, {}, tA)).data.items && ((await roep(`${G}/lijst`, sA, {}, tA)).data.items as unknown[]).length === 2);
      // technische lade: tabblad met geldige activering → ruimte technisch, eigen geschiedenis; zonder activering → prive
      await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['beheerder'],60,'test')`, [A.id, `tech-${randomBytes(6).toString('hex')}`]);
      const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [A.id])).rows[0].profiel_id);
      await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['beheerder'],'eenheidstest zoek', now() + interval '60 minutes')`, [A.id, pid, tabHash(tD)]);
      const bT = await roep(`${G}/bewaren`, sA, { vraag: 'diagnose', filters: {}, treffers: [{ bron: 'pagina', id: 'admin/diagnostiek' }], totaal: 1, algoritmeVersie: 'zoek-kern-2', indexVersie: 'index' }, tD);
      const lT = await roep(`${G}/lijst`, sA, {}, tD); const lP = await roep(`${G}/lijst`, sA, {}, tA);
      check('C lade uit de poort: technisch tabblad → ruimte technisch, eigen rij; persoonlijk tabblad ziet die rij niet (en omgekeerd)', bT.data.ruimte === 'technisch' && lT.data.ruimte === 'technisch' && (lT.data.items as Array<{ vraag: string }>).map(x => x.vraag).join() === 'diagnose' && lP.data.ruimte === 'prive' && !(lP.data.items as Array<{ vraag: string }>).some(x => x.vraag === 'diagnose'), JSON.stringify({ bT: bT.data.ruimte, lT: lT.data.items, lP: (lP.data.items as unknown[]).length }).slice(0, 300));
      const bNep = await roep(`${G}/bewaren`, sB, { vraag: 'diagnose', filters: {}, treffers: [], totaal: 0, algoritmeVersie: 'x', indexVersie: 'x', ruimte: 'technisch', userId: A.id }, tB);
      check('C de client kan ruimte/userId niet opdringen (velden genegeerd: ruimte prive, eigen rij)', bNep.data.ruimte === 'prive' && (await pool.query(`SELECT user_id, ruimte FROM app.zoek_geschiedenis WHERE id=$1`, [(bNep.data.item as Record<string, unknown>).id])).rows[0].user_id === B.id);
      const wA = await roep(`${G}/wis`, sA, { id: item1.id }, tA);
      check('C wis door A zelf: ok, rij weg; onzinnig id → ok=false', wA.data.ok === true && (await pool.query(`SELECT 1 FROM app.zoek_geschiedenis WHERE id=$1`, [item1.id])).rows.length === 0 && (await roep(`${G}/wis`, sA, { id: 'x; DROP TABLE' }, tA)).data.ok === false);
      check('C RLS: als app-rol met app.user_id = B ziet de app-rol geen rij van A (0103-policy)', await (async () => {
        const { appRolActief } = await import('../../server/platform/pg');
        if (!appRolActief()) return true; // lokaal zonder aparte app-rol (DATABASE_URL_APP): policy bestaat (hierboven gecontroleerd), gedrag niet te meten
        const { alsGebruiker } = await import('../../backend/ai-toestemmingen');
        const n = await alsGebruiker(B.id, async q => Number((await q(`SELECT count(*)::int AS n FROM app.zoek_geschiedenis WHERE user_id = $1`, [A.id])).rows[0].n));
        return n === 0;
      })());
    } finally {
      await pool.query(`DELETE FROM app.zoek_geschiedenis WHERE user_id = ANY($1)`, [[A.id, B.id]]).catch(() => undefined);
      await pool.query(`DELETE FROM app.tech_activaties WHERE user_id=$1`, [A.id]).catch(() => undefined);
      await pool.query(`DELETE FROM app.tech_profielen WHERE user_id=$1`, [A.id]).catch(() => undefined);
      for (const id of sessies) await pool.query(`DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id=$1`, [id]).catch(() => undefined);
      await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [[A.id, B.id]]).catch(() => undefined);
    }
  } finally { console.error = stil; }
  return einde();
}
