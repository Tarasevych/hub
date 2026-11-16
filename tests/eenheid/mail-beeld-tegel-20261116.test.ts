// MAILBEELD-002 (16.11.2026). Павло про знімки «Зовнішні зображення»: «що це за зображення, чому все так жахливо виглядає?»
// Zonder de wijziging faalt deze test: src/mail/beeld-tegel.ts bestond niet (verborgen externe beelden stonden in de brief als het
// «kapotte beeld» van de browser met kale alt-tekst), het paneel «Вигляд» verdween in «Макет» onder de brief (de kop met glas was een
// stapelcontext zonder eigen laag), de knopinfo «Вигляд» bleef bij het open paneel staan, en het blad «Ще» liet op aanraakschermen de
// tekst van de brief door. Bewaakt vooral: voor een verborgen beeld gaat er NIETS naar buiten (het <img> krijgt geen bron) en de
// tegel is weer spoorloos weg zodra het beeld getoond mag worden.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const { check, einde } = checker('mail-beeld-tegel-20261116');
const T = await import('../../src/mail/beeld-tegel');

// ---------------------------------------------------------------- 1. maat (puur)
{
  const m = T.tegelMaat({ breedteAttr: '600', hoogteAttr: '300', stijlBreedte: '', alt: 'Held' });
  check('maat: width én height → dezelfde verhouding, breedte uit het attribuut', m.verhouding === '600 / 300' && m.breedte === '600px' && m.hoogte === '' && m.schatH === 300, JSON.stringify(m));
  const s = T.tegelMaat({ breedteAttr: '640', hoogteAttr: null, stijlBreedte: '100%', alt: 'Held' });
  check('maat: breedte uit de stijl blijft van de stijl (niets overschrijven), zonder hoogte 16:9 tot 168 px', s.breedte === '' && s.verhouding === '16 / 9' && s.maxHoogte === '168px', JSON.stringify(s));
  check('maat: bij een verhouding nooit een minimumhoogte (die wordt een minimumbreedte en rekt tabelkolommen op)', s.minHoogte === '' && T.tegelMaat({ alt: 'x' }).minHoogte === '');
  const p = T.tegelMaat({ breedteAttr: '100%', hoogteAttr: '', stijlBreedte: '', alt: '' });
  check('maat: width="100%" → procent', p.breedte === '100%' && p.verhouding === '16 / 9', JSON.stringify(p));
  const h = T.tegelMaat({ breedteAttr: null, hoogteAttr: '48', stijlBreedte: '', alt: 'Logo' });
  check('maat: alleen een hoogte → die hoogte, 2,5× zo breed', h.hoogte === '48px' && h.breedte === '120px' && h.verhouding === '', JSON.stringify(h));
  const pixel = T.tegelMaat({ breedteAttr: '1', hoogteAttr: '1', stijlBreedte: '', alt: '' });
  check('maat: volgpixel 1×1 houdt 1×1', pixel.breedte === '1px' && pixel.verhouding === '1 / 1' && pixel.schatH === 1, JSON.stringify(pixel));
  const vrij = T.tegelMaat({ alt: 'Foto' }), kaal = T.tegelMaat({ alt: '  ' });
  check('maat: niets bekend → met alt 220 px, zonder alt een blokje van 40 × 40', vrij.breedte === '220px' && vrij.verhouding === '16 / 9' && kaal.breedte === '40px' && kaal.hoogte === '40px', `${JSON.stringify(vrij)} ${JSON.stringify(kaal)}`);
  check('maat: onzin in de attributen (javascript, negatief) telt niet als maat', T.tegelMaat({ breedteAttr: 'calc(1px)', hoogteAttr: '-5', alt: '' }).breedte === '40px');
}

// ---------------------------------------------------------------- 2. vorm en inkt (puur)
check('vorm: volgpixel en afstandhouder → leeg (geen vlak, geen pictogram)', T.tegelVorm(1, 1, '') === 'leeg' && T.tegelVorm(600, 8, 'x') === 'leeg');
check('vorm: klein of zonder alt → alleen het pictogram', T.tegelVorm(24, 24, 'Facebook') === 'pictogram' && T.tegelVorm(400, 200, ' ') === 'pictogram');
check('vorm: laag en breed met vaste breedte → pictogram en tekst naast elkaar; zonder vaste breedte alleen het pictogram', T.tegelVorm(120, 40, 'Logo', true) === 'rij' && T.tegelVorm(120, 40, 'Logo', false) === 'pictogram');
check('vorm: ruimte genoeg → pictogram boven de alt-tekst', T.tegelVorm(197, 111, 'Hut aan de Lesse') === 'volledig');
check('inkt: rgb en rgba uit de berekende stijl, onbekend → neutraal grijs', T.inktVan('rgb(34, 34, 59)').join() === '34,34,59' && T.inktVan('rgba(231, 233, 238, 0.9)').join() === '231,233,238' && T.inktVan('color(srgb 0 0 0)').join() === '127,127,127');

// ---------------------------------------------------------------- 3. tegel in een nagebootst document: geen bron, spoorloos terug
{
  // kleine nep-DOM: precies wat beeld-tegel.ts aanraakt (geen jsdom in de repo)
  const stijl = (begin = '') => {
    const d = new Map<string, { v: string; p: string }>();
    const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const api = {
      setProperty: (k: string, v: string, p = '') => { d.set(k, { v, p }); },
      getPropertyValue: (k: string) => d.get(k)?.v ?? '',
      getPropertyPriority: (k: string) => d.get(k)?.p ?? '',
      removeProperty: (k: string) => { d.delete(k); },
      get cssText() { return [...d].map(([k, x]) => `${k}:${x.v}${x.p ? ' !important' : ''}`).join(';'); },
      set cssText(t: string) { d.clear(); for (const deel of t.split(';')) { const i = deel.indexOf(':'); if (i > 0) d.set(deel.slice(0, i).trim(), { v: deel.slice(i + 1).replace(/!important/i, '').trim(), p: /!important/i.test(deel) ? 'important' : '' }); } },
    };
    api.cssText = begin;
    return new Proxy(api as Record<string, unknown>, {
      get: (o, k) => (typeof k === 'string' && !(k in o) ? d.get(kebab(k))?.v ?? '' : o[k as string]),
      set: (o, k, v) => { if (k === 'cssText') o.cssText = v; else d.set(kebab(String(k)), { v: String(v), p: '' }); return true; },
    });
  };
  type El = Record<string, any>;
  const maak = (tag: string, attrs: Record<string, string> = {}): El => {
    const a = new Map(Object.entries(attrs)); const el: El = { tagName: tag.toUpperCase(), children: [] as El[], parentElement: null as El | null, dataset: {} as Record<string, string>, style: stijl(attrs.style || ''), textContent: '', title: '', offsetWidth: 0, offsetHeight: 0 };
    el.getAttribute = (n: string) => (n === 'style' ? el.style.cssText || null : a.get(n) ?? null);
    el.setAttribute = (n: string, v: string) => { if (n === 'style') el.style.cssText = v; else a.set(n, v); };
    el.heeft = (n: string) => a.has(n);
    el.appendChild = (k: El) => { k.parentElement = el; el.children.push(k); return k; };
    el.before = (k: El) => { const p = el.parentElement!; k.parentElement = p; p.children.splice(p.children.indexOf(el), 0, k); };
    el.remove = () => { const p = el.parentElement; if (p) p.children.splice(p.children.indexOf(el), 1); el.parentElement = null; };
    el.replaceChildren = () => { for (const k of el.children) k.parentElement = null; el.children.length = 0; };
    el.closest = (sel: string) => { for (let x: El | null = el; x; x = x.parentElement) if (x.tagName === sel.toUpperCase()) return x; return null; };
    Object.defineProperty(el, 'isConnected', { get: () => { for (let x: El | null = el; x; x = x.parentElement) if (x === body) return true; return false; } });
    return el;
  };
  const body: El = maak('body');
  const doc = { createElement: (t: string) => Object.assign(maak(t), { ownerDocument: null }), createElementNS: (_: string, t: string) => maak(t), defaultView: { getComputedStyle: (e: El) => { meet.stijl += 1; return { display: e.style.getPropertyValue('display') || (e.zweef ? 'block' : e.tagName === 'IMG' ? 'inline' : 'block'), color: e.kleur || 'rgb(34, 34, 59)', float: e.zweef || 'none', verticalAlign: e.lijn || 'baseline', getPropertyValue: (k: string) => (e.marges && e.marges[k]) || '0px' }; } } };
  const meet = { stijl: 0 };
  const beeld = (attrs: Record<string, string>, ouder: El = body) => { const i = maak('img', attrs); i.ownerDocument = doc; ouder.appendChild(i); return i; };
  const tekst = { naam: (alt: string) => `Зображення приховано: ${alt}`, uitleg: (alt: string) => `uitleg ${alt}` };
  const zet = (i: El) => T.zetBeeldTegel(i as unknown as HTMLImageElement, tekst), wis = (i: El) => T.wisBeeldTegel(i as unknown as HTMLElement);

  const held = beeld({ width: '640', alt: 'Najaar in de Ardennen', style: 'display:block;width:100%;height:auto;border-radius:14px', 'data-mail-resource-src': 'https://voorbeeld.invalid/held.jpg' });
  const voor = held.style.cssText;
  zet(held);
  const tegel = body.children[0];
  check('tegel: staat vóór het beeld, het beeld zelf is verborgen en heeft GEEN bron gekregen (geen verzoek, geen «load»)', body.children.length === 2 && body.children[1] === held && held.style.getPropertyValue('display') === 'none' && !held.heeft('src') && !held.heeft('srcset'));
  check('tegel: blok zoals het beeld, breedte en afronding van het beeld, verhouding 16:9', tegel.style.getPropertyValue('display') === 'flex' && tegel.style.getPropertyValue('width') === '100%' && tegel.style.getPropertyValue('border-radius') === '14px' && tegel.style.getPropertyValue('aspect-ratio') === '16 / 9', tegel.style.cssText);
  check('tegel: inkt uit de tekstkleur van de brief (vlak 7 %, rand 14 %, tekst 70 %) — geen vaste kleur', tegel.style.getPropertyValue('background-color') === 'rgba(34, 34, 59, 0.07)' && /rgba\(34, 34, 59, 0\.14\)/.test(tegel.style.getPropertyValue('border')) && tegel.style.getPropertyValue('color') === 'rgba(34, 34, 59, 0.7)');
  check('tegel: naam voor de schermlezer, uitleg als knopinfo, niet meevertalen', tegel.getAttribute('role') === 'img' && tegel.getAttribute('aria-label') === 'Зображення приховано: Najaar in de Ardennen' && tegel.title === 'uitleg Najaar in de Ardennen' && tegel.dataset.mailTranslationSkip === 'true');
  check('tegel: onmeetbaar (dicht blok) → schatting: pictogram en alt-tekst', tegel.dataset.mailBeeldTegel === 'volledig' && tegel.children.length === 2 && tegel.children[0].tagName === 'SVG' && tegel.children[1].textContent === 'Najaar in de Ardennen');
  check('tegel: de alt-regel telt niet mee voor de kleinste breedte (width:0 + min-width:100%)', tegel.children[1].style.getPropertyValue('width') === '0' && tegel.children[1].style.getPropertyValue('min-width') === '100%');
  zet(held);
  check('tegel: twee keer zetten = één tegel', body.children.length === 2);
  wis(held); wis(held);
  check('tegel weg: geen tegel meer en de stijl van het beeld is exact als ervoor', body.children.length === 1 && body.children[0] === held && held.style.cssText === voor, held.style.cssText);

  const weg = beeld({ alt: '', style: 'display:none', 'data-mail-resource-src': 'https://voorbeeld.invalid/t.gif' });
  zet(weg);
  check('een beeld dat de brief zelf verbergt (display:none) krijgt geen tegel', body.children.length === 2 && weg.style.cssText === 'display:none');

  const donker = maak('td'); donker.kleur = 'rgb(231, 233, 238)'; body.appendChild(donker);
  const logo = beeld({ width: '120', height: '40', alt: 'Logo', style: 'max-width:100%;height:auto;background-color:#f3f4f6;border-radius:4px' }, donker);
  zet(logo);
  const lt = donker.children[0];
  check('donkere weergave: het lichte logoplaatje (4 px) wordt in de tegel vervangen door de zachte tint, lichte inkt, afronding 12 px', lt.style.getPropertyValue('background-color') === 'rgba(231, 233, 238, 0.07)' && lt.style.getPropertyValue('border-radius') === '12px' && lt.style.getPropertyValue('display') === 'inline-flex', lt.style.cssText);
  check('donkere weergave: laag en breed met vaste breedte → pictogram en tekst naast elkaar', lt.dataset.mailBeeldTegel === 'rij' && lt.style.getPropertyValue('flex-direction') === 'row' && lt.children.length === 2);
  wis(logo);
  check('donkere weergave: na het wissen heeft het beeld zijn logoplaatje terug', logo.style.getPropertyValue('background-color') === '#f3f4f6' && logo.style.getPropertyValue('display') === '');

  const pixel = beeld({ width: '1', height: '1', alt: '', style: 'max-width:100%;height:auto' });
  zet(pixel);
  const pt = body.children[body.children.indexOf(pixel) - 1];
  check('volgpixel: lege tegel zonder vlak, rand of pictogram (niets te zien, plaats blijft)', pt.dataset.mailBeeldTegel === 'leeg' && pt.children.length === 0 && pt.style.getPropertyValue('background-color') === 'transparent' && pt.style.getPropertyValue('border') === '0');
  // Рев'ю 16.11.2026: порожня плитка (піксель стеження, розпірка) не оголошується читачем екрана й не має підказки.
  check('volgpixel: voor de schermlezer bestaat de lege tegel niet (aria-hidden, geen role/naam/knopinfo) — tientallen spacer.gif gaven anders tientallen «Зображення приховано»',
    pt.getAttribute('aria-hidden') === 'true' && pt.getAttribute('role') === null && pt.getAttribute('aria-label') === null && pt.title === '');
  check('de zichtbare regel staat in volle inkt (de tegel zelf 70 %: genoeg voor het pictogram, te licht voor 12 px tekst)', tegel.children[1].style.getPropertyValue('color') === 'rgba(34, 34, 59, 1)');

  // tekst wisselen op een bestaande tegel: verborgen → wordt geladen → niet geladen (zelfde tegel, andere naam, regel en pictogram)
  const foto = beeld({ width: '300', height: '150', alt: 'Foto', style: 'max-width:100%;height:auto' });
  zet(foto);
  const ft = body.children[body.children.indexOf(foto) - 1];
  const laden = { soort: 'laden' as const, naam: (alt: string) => `Зображення завантажується: ${alt}`, uitleg: () => 'laden' };
  const mislukt = { soort: 'mislukt' as const, naam: (alt: string) => `Зображення не завантажилось: ${alt}`, regel: (alt: string) => alt || 'Зображення не завантажилось', onder: (alt: string) => (alt ? 'Зображення не завантажилось' : ''), uitleg: () => 'mislukt' };
  const eerstePad = ft.children[0].children.map((d: El) => d.tagName).join(), aantalVoor = body.children.length;
  T.zetBeeldTegel(foto as unknown as HTMLImageElement, laden);
  check('laden: dezelfde tegel (geen tweede, geen sprong), naam «завантажується», pictogram «beeld» in plaats van «beeld verborgen», regel blijft de alt-tekst',
    body.children[body.children.indexOf(foto) - 1] === ft && body.children.length === aantalVoor && ft.getAttribute('aria-label') === 'Зображення завантажується: Foto' && ft.title === 'laden'
    && ft.children.length === 2 && ft.children[0].children.map((d: El) => d.tagName).join() === 'RECT,CIRCLE,PATH' && eerstePad === 'LINE,PATH,LINE,LINE,PATH,PATH' && ft.children[1].textContent === 'Foto', `${ft.children[0].children.map((d: El) => d.tagName).join()} / ${eerstePad}`);
  T.zetBeeldTegel(foto as unknown as HTMLImageElement, mislukt);
  check('niet geladen: eigen pictogram («let op»), de alt-tekst en eronder de eigen korte tekst «Зображення не завантажилось» (ook in de naam); nog steeds geen bron op het beeld',
    ft.getAttribute('aria-label') === 'Зображення не завантажилось: Foto' && ft.title === 'mislukt' && ft.children.length === 3 && ft.children[0].children.map((d: El) => d.tagName).join() === 'CIRCLE,LINE,LINE' && ft.children[1].textContent === 'Foto' && ft.children[2].textContent === 'Зображення не завантажилось'
    && ft.children[2].style.getPropertyValue('color') === 'rgba(34, 34, 59, 1)' && !foto.heeft('src') && foto.style.getPropertyValue('display') === 'none');
  const laag = beeld({ width: '200', height: '60', alt: 'Laag', style: '' });
  T.zetBeeldTegel(laag as unknown as HTMLImageElement, mislukt);
  check('niet geladen, lage tegel: geen plaats voor de tweede regel — pictogram «let op» en de alt-tekst', body.children[body.children.indexOf(laag) - 1].children.length === 2 && body.children[body.children.indexOf(laag) - 1].children[1].textContent === 'Laag');
  wis(laag);
  const kaal = beeld({ width: '300', height: '150', alt: '', style: '' });
  T.zetBeeldTegel(kaal as unknown as HTMLImageElement, mislukt);
  const kt = body.children[body.children.indexOf(kaal) - 1];
  check('niet geladen zonder alt: de eigen tekst telt als regel (niet alleen een pictogram)', kt.dataset.mailBeeldTegel === 'volledig' && kt.children[1].textContent === 'Зображення не завантажилось' && kt.getAttribute('aria-label') === 'Зображення не завантажилось: ');
  // Afwerking 2 (16.11.2026, na de controle): in een tegel van 200 px zonder alt brak «Зображення не завантажилось» af op «…завантажи…».
  // De melding staat nu in de kleine letter van de tweede regel; hoog genoeg → hooguit twee regels; laag en te smal → alleen het pictogram.
  const kr = kt.children[1].style;
  check('niet geladen zonder alt: de melding in de kleine letter (11 px, gewoon gewicht) en in een hoge tegel over hooguit twee regels — niet afgekapt; de regel telt nog steeds niet mee voor de kleinste breedte',
    kr.getPropertyValue('font-size') === '11px' && kr.getPropertyValue('font-weight') === '400' && kr.getPropertyValue('white-space') === 'normal' && kr.getPropertyValue('display') === '-webkit-box'
    && kr.getPropertyValue('-webkit-line-clamp') === '2' && kr.getPropertyValue('-webkit-box-orient') === 'vertical' && kr.getPropertyValue('width') === '0' && kr.getPropertyValue('min-width') === '100%', kr.cssText);
  check('met alt blijft de regel de alt-tekst: 12 px van de tegel, één regel met «…» (geen kleine letter, geen tweede regel tekst erin)',
    ft.children[1].style.getPropertyValue('font-size') === '' && ft.children[1].style.getPropertyValue('white-space') === 'nowrap' && ft.children[2].style.getPropertyValue('font-size') === '11px');
  const tegelVan = (i: El) => body.children[body.children.indexOf(i) - 1];
  const smalLaag = beeld({ width: '130', height: '60', alt: '', style: '' }), breedLaag = beeld({ width: '210', height: '60', alt: '', style: '' }), smalHoog = beeld({ width: '130', height: '110', alt: '', style: '' });
  for (const i of [smalLaag, breedLaag, smalHoog]) T.zetBeeldTegel(i as unknown as HTMLImageElement, mislukt);
  check('niet geladen zonder alt, lage tegel: past de melding niet op één regel, dan alleen het pictogram «let op» (geen afgekapte tekst; naam en knopinfo zeggen het volledig); past ze wel, dan één regel',
    tegelVan(smalLaag).dataset.mailBeeldTegel === 'pictogram' && tegelVan(smalLaag).children.length === 1 && tegelVan(smalLaag).children[0].children.map((d: El) => d.tagName).join() === 'CIRCLE,LINE,LINE'
    && tegelVan(smalLaag).getAttribute('aria-label') === 'Зображення не завантажилось: ' && tegelVan(smalLaag).title === 'mislukt'
    && tegelVan(breedLaag).dataset.mailBeeldTegel === 'volledig' && tegelVan(breedLaag).children[1].textContent === 'Зображення не завантажилось' && tegelVan(breedLaag).children[1].style.getPropertyValue('white-space') === 'nowrap' && tegelVan(breedLaag).children[1].style.getPropertyValue('font-size') === '11px',
    `${tegelVan(smalLaag).dataset.mailBeeldTegel} / ${tegelVan(breedLaag).dataset.mailBeeldTegel}`);
  check('niet geladen zonder alt, smalle hoge tegel (130 × 110): de melding over twee regels', tegelVan(smalHoog).dataset.mailBeeldTegel === 'volledig' && tegelVan(smalHoog).children[1].style.getPropertyValue('-webkit-line-clamp') === '2');
  wis(smalLaag); wis(breedLaag); wis(smalHoog);
  wis(foto); wis(kaal);

  // align/hspace zijn presentatie-attributen: niet in de stijl, wel in de berekende stijl — de tegel neemt ze over (geen sprong bij «Показати»)
  const rechts = beeld({ width: '200', height: '120', alt: 'Rechts', align: 'right', style: 'max-width:100%;height:auto' });
  rechts.zweef = 'right'; rechts.marges = { 'margin-left': '12px', 'margin-bottom': '4px' };
  zet(rechts);
  const rt = body.children[body.children.indexOf(rechts) - 1];
  check('align="right" hspace: de tegel zweeft en houdt de marges van het beeld (uit de berekende stijl); wat de stijl zelf al zegt, blijft',
    rt.style.getPropertyValue('float') === 'right' && rt.style.getPropertyValue('margin-left') === '12px' && rt.style.getPropertyValue('margin-bottom') === '4px' && rt.style.getPropertyValue('margin-top') === '' && rt.style.getPropertyValue('display') === 'flex', rt.style.cssText);
  const midden = beeld({ width: '24', height: '24', alt: 'i', style: 'margin-left:3px' }); midden.lijn = 'middle'; midden.marges = { 'margin-left': '3px' };
  zet(midden);
  const mt = body.children[body.children.indexOf(midden) - 1];
  check('align="middle": de tegel houdt de uitlijning van het beeld; zonder eigen uitlijning blijft het «bottom»', mt.style.getPropertyValue('vertical-align') === 'middle' && mt.style.getPropertyValue('margin-left') === '3px' && lt.style.getPropertyValue('vertical-align') === 'bottom', mt.style.cssText);
  wis(rechts); wis(midden);

  // in één keer voor de hele brief: eerst alles lezen, dan alles schrijven, dan één keer meten — niet per beeld opnieuw opmaken
  const veel = Array.from({ length: 40 }, (_, i) => beeld({ width: '120', height: '80', alt: `Beeld ${i}`, style: 'max-width:100%;height:auto' }));
  const volgorde: string[] = [];
  for (const b of veel) { const oudBefore = b.before; b.before = (k: El) => { volgorde.push('schrijf'); Object.defineProperty(k, 'offsetWidth', { get: () => { volgorde.push('meet'); return 0; } }); oudBefore(k); }; }
  meet.stijl = 0;
  T.zetBeeldTegels(veel.map((b) => [b as unknown as HTMLImageElement, tekst] as const));
  const eersteMeting = volgorde.indexOf('meet'), laatsteSchrijf = volgorde.lastIndexOf('schrijf');
  check('veel beelden: alle tegels staan er, en geen enkele meting vóór de laatste tegel geplaatst is (lezen → schrijven → meten: twee keer opmaken in plaats van één keer per beeld)',
    veel.every((b) => body.children[body.children.indexOf(b) - 1]?.dataset.mailBeeldTegel === 'volledig') && volgorde.filter((v) => v === 'schrijf').length === 40 && eersteMeting > laatsteSchrijf && meet.stijl === 80, `${eersteMeting} > ${laatsteSchrijf}; stijl ${meet.stijl}`);
  for (const b of veel) wis(b);
}

// ---------------------------------------------------------------- 4. bron: leesvenster, kop, paneel, blad
{
  const bt = readFileSync('src/MailBerichtTekst.tsx', 'utf8');
  // Afwerking 16.11.2026: de tegels worden in één keer gezet, vóór de werkers (en dus vóór de voorraad-poging): een verborgen extern
  // <img> krijgt «приховано»; wat nu geladen wordt «завантажується» (toon() haalt de tegel weg — geen sprong, geen «kapot beeld»
  // tijdens het laden); wat niet te laden is «не завантажилось». De oude regel «else wisBeeldTegel(node)» is daarmee weg.
  check('brieftekst: tegels in één keer voor de hele brief, vóór de voorraad-poging; verborgen extern <img> → «приховано», anders «завантажується» of (niet te laden) «не завантажилось»',
    bt.includes("zetBeeldTegels(nodes.filter(node=>node.dataset.mailResourceSrc&&node.tagName==='IMG').map(node=>{const img=node as HTMLImageElement,source=node.dataset.mailResourceSrc||'';if(!externToestaan&&/^https:/i.test(source)&&!inlineVan(source)){")
    && bt.includes("return[img,inlineVan(source)?teksten.ladenEigen:/^https:/i.test(source)?teksten.laden:teksten.mislukt]as const}))}let cursor=0;const worker=async()=>{")
    && bt.indexOf('zetBeeldTegels(nodes.filter(') < bt.indexOf('const blob=await remoteBlob(context,accountId,source,true)') && !bt.includes('else wisBeeldTegel(node)'));
  // Afwerking 1: een beeld uit de brief zelf (cid:-bijlage) komt niet van de server — de tegel «завантажується» zegt dat dan ook niet
  check('brieftekst: «завантажується» voor een beeld uit de brief zelf noemt de server niet (eigen tekst), voor een extern beeld wel',
    bt.includes("ladenEigen:{soort:'laden',naam:alt=>alt?t(`Зображення з листа завантажується: ${alt}`,`Afbeelding uit het bericht wordt geladen: ${alt}`):t('Зображення з листа завантажується','Afbeelding uit het bericht wordt geladen'),uitleg:()=>t('Це зображення вкладене в сам лист: назовні нічого не запитується.','Deze afbeelding zit in het bericht zelf: er wordt niets van buiten opgehaald.')}")
    && bt.includes("laden:{soort:'laden',naam:alt=>alt?t(`Зображення завантажується: ${alt}`,`Afbeelding wordt geladen: ${alt}`):t('Зображення завантажується','Afbeelding wordt geladen'),uitleg:()=>t('Зображення завантажує ваш сервер, а не браузер.','Uw server haalt de afbeelding op, niet uw browser.')}"));
  check('brieftekst: een beeld dat weer verborgen wordt, verliest zijn oude bron; was het in deze brief al via de server geladen, dan zegt de tegel dat (niet «не завантажено»)',
    bt.includes("if(img.hasAttribute('src'))img.removeAttribute('src');return[img,node.dataset.mailBeeldGeladen?(dicht?teksten.opnieuwDicht:teksten.opnieuw):(dicht?teksten.verborgenDicht:teksten.verborgen)]as const}")
    && bt.includes("if(stand==='loaded'&&/^https:/i.test(source)&&!inlineVan(source))node.dataset.mailBeeldGeladen='1';") && bt.includes('Зображення знову приховано. Раніше в цьому листі його вже завантажував ваш сервер') && bt.includes('Afbeelding weer verborgen. Eerder in dit bericht heeft uw server die al opgehaald'));
  check('brieftekst: niet te laden (http, relatief pad, cid zonder bijlage, fout van de server) → geen «kapot beeld» maar de tegel «Зображення не завантажилось» — alleen DOM, geen verzoek',
    bt.includes("catch{if(cancelled)return;node.dataset.mailResourceState='blocked';/* niet te laden: geen «kapot beeld», maar de tegel met een eigen tekst (alleen DOM, geen verzoek) */if(node.dataset.mailResourceSrc&&node.tagName==='IMG')zetBeeldTegel(node as HTMLImageElement,tegelRef.current.teksten.mislukt)}resize()")
    && bt.includes("regel:alt=>alt||t('Зображення не завантажилось','Afbeelding niet geladen'),onder:alt=>alt?t('Зображення не завантажилось','Afbeelding niet geladen'):'',") && bt.includes('З вашого браузера запит не надсилався.') && bt.includes('Uw browser heeft niets opgevraagd.'));
  check('brieftekst: is de strook boven de brief verborgen, dan wijst de knopinfo van de tegel naar de knop in de kop — bijgewerkt zonder opnieuw te laden (eigen effect, niet in de lijst van het laad-effect)',
    bt.includes("props.strookDicht=dicht;") && bt.includes('Показати його можна кнопкою з перекресленим зображенням у шапці листа, поруч з ⓘ.') && bt.includes('Tonen kan met de knop met de doorgestreepte afbeelding in de kop van het bericht, naast ⓘ.')
    && /zetBeeldTegels\(Array\.from\(doc\.querySelectorAll<HTMLImageElement>\('img\[data-mail-resource-state="verborgen"\]'\)\)[^;]*\},\[strookDicht,tegelTeksten\]\);/.test(bt)
    && bt.includes('context.sourceOrigin,externToestaan,uitVoorraad,donkerAan]);'));
  check('strook boven de brief: natuurlijke zin over wie de beelden laadt (uk + nl)',
    bt.includes("'Так відправник не дізнається, що лист відкрито. Якщо покажете, їх завантажить ваш сервер, а не браузер.','Zo weet de afzender niet dat het bericht geopend is. Als u ze toont, haalt uw server ze op, niet uw browser.'") && !bt.includes('Показані — завантажує'));
  { // Afwerking 1: dezelfde zin in het contextpaneel («Безпека») — daar stond nog de houterige vorm «Показані завантажує ваш сервер»
    const cp = readFileSync('src/mail/ContextPaneel.tsx', 'utf8');
    check('contextpaneel «Безпека»: dezelfde natuurlijke zin als in de strook (uk + nl)',
      cp.includes('приховано, доки ви їх не покажете (смуга над листом). Якщо покажете, їх завантажить ваш сервер, а не браузер.`') && cp.includes('verborgen tot u ze toont (strook boven het bericht). Als u ze toont, haalt uw server ze op, niet uw browser.`')
      && !cp.includes('Показані завантажує') && !cp.includes('Getoond haalt uw server'));
  }
  check('brieftekst: het echte beeld haalt eerst de tegel weg', bt.includes('const toon=(blob:Blob,stand:string)=>{const url=URL.createObjectURL(blob);urls.push(url);wisBeeldTegel(node);'));
  check('brieftekst: verborgen blijft verborgen — de regel zonder verzoek staat er ongewijzigd', bt.includes("if(!externToestaan&&/^https:/i.test(source)&&!inlineVan(source)){node.dataset.mailResourceState='verborgen';verborgen+=1;continue}"));
  check('brieftekst: naam en uitleg van de tegel in beide talen', bt.includes('`Зображення приховано: ${alt}`,`Afbeelding verborgen: ${alt}`') && bt.includes("t('Зображення приховано','Afbeelding verborgen')") && /відправник не дізнається, що лист відкрито\. Показати його можна у смузі над листом\./.test(bt) && /de afzender weet niet dat het bericht geopend is\. Tonen kan in de strook boven het bericht\./.test(bt));
  const tegel = readFileSync('src/mail/beeld-tegel.ts', 'utf8');
  const code = tegel.split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');
  check('tegel: de code zet nergens een bron of achtergrondbeeld en maakt geen <style> (CSP: alleen stijl-attributen)', !/\.src\s*=|setAttribute\('src|srcset|url\(|createElement\('style'\)|fetch\(|new Image/.test(code));

  const zc = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const mq = zc(readFileSync('src/mail/mail-lezer-opstel-maquette.css', 'utf8'));
  check('«Макет»: de kop met glas heeft een eigen laag (die van de werkbalk), zodat «Вигляд» en ⋮ boven de brief liggen',
    /html\.palet-maquette body \.google-mail-reader > header \{\s*position: relative;\s*z-index: 700;[^}]*backdrop-filter: blur\(20px\) saturate\(135%\);/.test(mq)
    && /\.mail-reader-toolbar\{position:relative;z-index:700;/.test(readFileSync('src/mail-lezer-werkbalk.css', 'utf8')));
  check('«Макет» op aanraakschermen: glas van «Ще»/«Вигляд»/sneltoetsen op het dekkende oppervlak van het thema; mobiele laag als laatste in het bestand',
    /@media \(pointer: coarse\) \{\s*html\.palet-maquette body :is\(\s*\.mail-reader-overflow-panel,\s*\.lz-weergave-paneel,\s*\.lz-hulp\s*\) \{\s*background: linear-gradient\(var\(--mq-popover-glas\), var\(--mq-popover-glas\)\), var\(--mq-oppervlak\);\s*\}\s*(?:html\.palet-maquette\[data-maquette-stijl="klassiek"\] body \.mail-reader-overflow-panel \{\s*--lz-blad-onder: 61px;\s*\}\s*)?\}\s*$/.test(mq) && mq.lastIndexOf('\n@media (pointer: coarse) {') === mq.lastIndexOf('\n@media'));
  // Рев'ю 16.11.2026: і на ПК крізь панель «Вигляд» у «Макеті» просвічував текст листа (шапка сама має скло, тож розмиття панелі до листа не дістає).
  check('«Макет», ook op de pc: «Вигляд» en ⋮ (panelen uit de kop met glas) op het dekkende oppervlak van het thema',
    /html\.palet-maquette body :is\(\s*\.mail-reader-overflow-panel,\s*\.lz-weergave-paneel\s*\) \{\s*background: linear-gradient\(var\(--mq-popover-glas\), var\(--mq-popover-glas\)\), var\(--mq-oppervlak\);\s*\}/.test(mq.slice(0, mq.lastIndexOf('\n@media (pointer: coarse)'))));
  check('«Макет»: het groepskopje in het blad «Ще» haalt 4,5:1 (--mq-gedempt, niet --mq-stil)', /html\.palet-maquette body \.mail-reader-overflow-groep-kop \{\s*color: var\(--mq-gedempt\);/.test(mq));
  // Oude fout, gevonden bij de afwerking (eigen commit): smal venster met muis in «Макет» — het blad «Ще» is position: fixed en hangt in
  // de kop; het glas van de kop (backdrop-filter) maakte de kop het ankervlak, dus het blad stond boven het scherm (onbereikbaar).
  check('«Макет», smal venster met muis: in de telefoonvorm heeft de kop geen vervaging (anders staat het blad «Ще» boven het scherm); aanraakschermen en «Класичний» ongemoeid',
    /@media not all and \(pointer: coarse\) \{\s*html\.palet-maquette:not\(\[data-maquette-stijl="klassiek"\]\) body \.google-mail-reader-backdrop\[data-lees-modus="telefoon"\] \.google-mail-reader > header \{\s*background: linear-gradient\(var\(--mq-bovenbalk-glas\), var\(--mq-bovenbalk-glas\)\), var\(--mq-oppervlak\);\s*backdrop-filter: none;\s*-webkit-backdrop-filter: none;\s*\}\s*\}/.test(mq)
    && /html\.palet-maquette body \.google-mail-reader > header \{[^}]*backdrop-filter: blur\(20px\) saturate\(135%\);/.test(mq));
  check('aanraakschermen in «Макет» hebben geen vervaging (de reden voor het dekkende oppervlak)', /@media \(pointer: coarse\) \{\s*:root\.palet-maquette:not\(#_\) \*,[\s\S]*?backdrop-filter: none !important;/.test(zc(readFileSync('src/thema/wissel-rust.css', 'utf8'))));
  const go = zc(readFileSync('src/mail/gesprek-opmaak.css', 'utf8'));
  check('«Вигляд» open: geen knopinfo meer (CSS, zonder de knopinfo-laag)', go.includes('.mail-reader-weergave[open]>summary[data-tooltip]::after,.mail-reader-weergave[open]>summary[data-tooltip]::before{display:none}'));
  // Afwerking 1: het blad staat óp de onderbalk (58 px; «Класичний» 61 px) — in de kier van 8 px en onder de ronde onderhoeken was de brief nog te zien
  // Afwerking 2: «Класичний» met muis (smal venster) hield 1 px kier — daar meet het blad vanaf de binnenkant van de vensterrand (60 px);
  // 61 px geldt alleen op aanraakschermen (geen vervaging → het blad meet vanaf de schermrand), in de aanraaklaag onderaan het bestand
  check('blad «Ще» op de telefoon: sluit aan op de onderbalk (geen kier: was ±15 px, daarna 8 px), onderhoeken recht en geen eigen onderrand, lucht onder de laatste rij; «Класичний» met zijn hogere balk idem',
    go.includes("[data-lees-modus='telefoon'] .google-mail-reader-more[open]>.mail-reader-overflow-panel{top:auto!important;bottom:calc(var(--lz-blad-onder,58px) + env(safe-area-inset-bottom,0px))!important;left:8px!important;right:8px!important;") && /\.mail-reader-overflow-panel\{[^}]*bottom:calc\(var\(--lz-blad-onder,58px\)[^}]*padding-bottom:10px;[^}]*border-bottom-width:0;border-radius:var\(--straal-l,16px\) var\(--straal-l,16px\) 0 0\}/.test(go)
    && /html\.palet-maquette\[data-maquette-stijl="klassiek"\] body \.mail-reader-overflow-panel \{\s*--lz-blad-onder: 61px;\s*\}/.test(mq) && !/!important/.test(mq));
  check('blad «Ще», «Класичний»: met muis 60 px (het venster met vervaging is zelf het ankervlak: de maat telt binnen de vensterrand), op aanraakschermen 61 px — die regel staat in de aanraaklaag, de laatste van het bestand',
    /\nhtml\.palet-maquette\[data-maquette-stijl="klassiek"\] body \.mail-reader-overflow-panel \{\s*--lz-blad-onder: 60px;\s*\}/.test(mq)
    && /\n@media \(pointer: coarse\) \{[\s\S]*\n  html\.palet-maquette\[data-maquette-stijl="klassiek"\] body \.mail-reader-overflow-panel \{\s*--lz-blad-onder: 61px;\s*\}\s*\}\s*$/.test(mq)
    && mq.lastIndexOf('\n@media (pointer: coarse) {') === mq.lastIndexOf('\n@media') && (mq.match(/--lz-blad-onder:/g) || []).length === 2);
  const wk = readFileSync('src/mail/WeergaveKeuze.tsx', 'utf8');
  check('«Вигляд» open: aria-expanded op de knop volgt het <details> — daarop haalt de knopinfo-laag de knopinfo weg',
    wk.includes("<details ref={ref} className='mail-reader-weergave' onToggle={(e) => setOpen(e.currentTarget.open)}>") && wk.includes("<summary className='mail-reader-icon-action' aria-expanded={open}")
    && readFileSync('src/ViewportKnopinfoLaag.tsx', 'utf8').includes("target?.getAttribute('aria-expanded')!=='true'"));
}

process.exit(einde());
