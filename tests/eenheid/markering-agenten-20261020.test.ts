// Opdracht eigenaar 20.10.2026 — «обведення лише коли ШІ працює з вікном; видно, ЯКІ ШІ зараз читають цей екран; колір за
// агентом; якщо декілька — внизу логотип, назва та дія кожного».
//
// Wat hier vastligt (geen netwerk, geen database: de echte extension/markering.js en markering-agenten.js draaien hier met
// een nep-DOM, en hun TypeScript-tweeling wordt teken voor teken vergeleken):
//  1. GEEN rand zonder werk. Een open, verbonden slot is alleen de POORT (markeringVoor); zichtbaar wordt het pas door een
//     echte actie, en na de staart (MARKERING_STAART_MS, één getal, één plek) gaat het weer uit;
//  2. het opschrift noemt de AGENT en zijn ACTIE, in beide talen;
//  3. de kleur komt uit de keuze van de eigenaar, en de standaard uit het accentpalet van de site (ACCENT_KLEUREN);
//  4. twee lezers = twee randen én twee plaatsen in de strook; boven de grens komt er «та ще N» bij;
//  5. een onbekende agent geeft een EERLIJK opschrift («ШІ» zonder naam) — nooit de eerste de beste agent;
//  6. het technische slot blijft te onderscheiden, ook met dezelfde agentkleur;
//  7. extension/markering-agenten.js en shared/markering-agenten.ts geven dezelfde waarden en hetzelfde gedrag, en
//     extension/shared.js blijft gelijk aan shared/extensie-ontgrendeling.ts (MIN_EXTENSIE_VERSIE, markering, badge);
//  8. de logo's in de extensie komen letterlijk uit het ene merkregister (src/merk/merk-tabel.ts).
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import * as JS from '../../extension/markering-agenten.js';
import * as TS from '../../shared/markering-agenten';
import * as extShared from '../../extension/shared.js';
import { EXTENSIE_VERSIE_MATRIX, MARKERING_BADGE, MARKERING_KLEUREN, MIN_EXTENSIE_VERSIE } from '../../shared/extensie-ontgrendeling';
import { ACCENTEN, ACCENT_KLEUREN } from '../../shared/menu-model';
import { V2_AGENTEN } from '../../shared/connector-v2/agenten';
import { MERKEN } from '../../src/merk/merk-tabel';
import { MERK_AGENTEN } from '../../extension/merk-agenten.js';
import * as kleurenStore from '../../backend/agent-kleuren';
import { getPool } from '../../server/platform/pg';

const W = process.cwd();
const EXT = join(W, 'extension');
/** De poort (0.6.1) woont in de extensie zelf: markeringVoor() bepaalt of er óóit iets te zien MAG zijn. */
const markeringVoor = (extShared as any).markeringVoor as (s: unknown, r: string, p: string, u: string) => { ruimte: string } | null;

// ---------------------------------------------------------------- nep-DOM: net genoeg voor markering.js (gesloten shadow DOM)
type NepEl = ReturnType<typeof nieuwEl>;
function nieuwEl(tag: string) {
  const el = {
    tagName: tag, kinderen: [] as NepEl[], attrs: new Map<string, string>(), stijl: new Map<string, string>(),
    className: '', id: '', ouder: null as NepEl | null, schaduw: null as any,
    style: { setProperty: (k: string, v: string) => { el.stijl.set(k, v); } },
    setAttribute: (k: string, v: string) => { el.attrs.set(k, String(v)); },
    getAttribute: (k: string) => (el.attrs.has(k) ? el.attrs.get(k)! : null),
    append: (...n: NepEl[]) => { for (const k of n) { k.ouder = el; el.kinderen.push(k); } },
    prepend: (...n: NepEl[]) => { for (const k of n) { k.ouder = el; el.kinderen.unshift(k); } },
    remove: () => { if (el.ouder) el.ouder.kinderen = el.ouder.kinderen.filter((c) => c !== el); el.ouder = null; },
    attachShadow: () => { el.schaduw = nieuwEl('#shadow'); return el.schaduw; },
    get isConnected(): boolean { return el.tagName === '#root' || (!!el.ouder && el.ouder.isConnected); },
    _tekst: '',
    get textContent(): string { return el.kinderen.length ? el.kinderen.map((k) => k.textContent).join('') : el._tekst; },
    set textContent(v: string) { el.kinderen = []; el._tekst = String(v); },
  };
  return el;
}
/** Alle .pil-knoppen (of .rand-divs) in de boom, in volgorde. */
function zoek(el: NepEl, klasse: string, uit: NepEl[] = []): NepEl[] {
  for (const k of el.kinderen) { if (k.className.split(' ').includes(klasse)) uit.push(k); zoek(k, klasse, uit); }
  return uit;
}
/** Wat we van globalThis overnemen, zodat de volgende test in dezelfde node-run een schone wereld heeft. */
const G = globalThis as any;
const OUD = { document: G.document, matchMedia: G.matchMedia, CSSStyleSheet: G.CSSStyleSheet };
const herstelDom = () => { for (const k of Object.keys(OUD) as Array<keyof typeof OUD>) { if (OUD[k] === undefined) delete G[k]; else G[k] = OUD[k]; } };

function zetDom(opties: { rustig?: boolean; donker?: boolean } = {}) {
  const wortel = nieuwEl('#root');
  const g = globalThis as any;
  g.document = {
    documentElement: wortel, body: wortel,
    createElement: (t: string) => nieuwEl(String(t).toLowerCase()),
    createElementNS: (_ns: string, t: string) => nieuwEl(String(t).toLowerCase()),
  };
  g.matchMedia = (q: string) => ({ matches: /reduced-motion/.test(q) ? !!opties.rustig : /dark/.test(q) ? !!opties.donker : false });
  g.CSSStyleSheet = class { replaceSync() { /* nep */ } };
  // navigator bestaat in node al (alleen-lezen); markering.js leest hem niet zelf — bridge.js geeft `nederlands` mee.
  return wortel;
}
const hostVan = (wortel: NepEl) => wortel.kinderen.find((k) => k.id === 'mr-markering') ?? null;
const schaduwVan = (wortel: NepEl) => hostVan(wortel)?.schaduw ?? null;

export async function main(): Promise<number> {
  const { check, einde } = checker('markering-agenten-20261020');
  const wortel = zetDom();
  const mark = await import(pathToFileURL(join(EXT, 'markering.js')).href);
  const nu = 1_800_000_000_000;

  // ---------------------------------------------------------------- 1. geen rand zonder werk
  const slot = { gekoppeld: true, verbonden: true, staat: 'ontgrendeld', exp: nu + 60_000, caps: ['browser.read'], domeinen: ['hub.tarasevych.com'], aiVerbonden: true, agentId: 'a' };
  const poort = markeringVoor(slot as never, 'prive', 'gebruiker', 'https://hub.tarasevych.com/x');
  check('poort: een open, verbonden slot mag een markering hebben', !!poort && poort.ruimte === 'prive');
  check('zonder lezer is er GEEN model (dus geen rand), ook met een open slot', TS.markeringLezers([], nu) === null && TS.markeringLezers(null, nu) === null);
  mark.zetMarkering(poort ? { ruimte: 'prive', model: TS.markeringLezers([], nu), nederlands: false } : null);
  check('markering.js tekent niets zonder lezers', mark.markeringStand() === null && schaduwVan(wortel) === null);

  // ---------------------------------------------------------------- 2. verschijnt op een actie, verdwijnt na de staart
  const een = [{ slug: 'claude', type: 'browser.snapshot', at: nu }];
  const m1 = TS.markeringLezers(een, nu);
  check('één actie geeft één lezer', !!m1 && m1.lezers.length === 1 && m1.extra === 0);
  const netVoorEinde = TS.markeringLezers(een, nu + TS.MARKERING_STAART_MS - 1);
  const netNaEinde = TS.markeringLezers(een, nu + TS.MARKERING_STAART_MS + 1);
  check(`binnen de staart (${TS.MARKERING_STAART_MS} ms) blijft de lezer staan, daarna niet`, !!netVoorEinde && netNaEinde === null);
  check('de staart is één getal op één plek (JS = TS)', JS.MARKERING_STAART_MS === TS.MARKERING_STAART_MS && typeof TS.MARKERING_STAART_MS === 'number');
  mark.zetMarkering({ ruimte: 'prive', model: m1, nederlands: false });
  const s1 = mark.markeringStand();
  check('markering.js tekent de rand bij een levende lezer', !!s1 && s1.aanwezig === true && s1.lezers === 1);
  check('één rand in de schaduwboom', zoek(schaduwVan(wortel)!, 'rand').length === 1);
  check('geen streepjesrand van het technische profiel in het gebruikersslot', zoek(schaduwVan(wortel)!, 'tech').length === 0);

  // ---------------------------------------------------------------- 3. het opschrift noemt agent + actie, in twee talen
  check('opschrift (uk) noemt de agent en zijn actie', TS.lezerOpschrift(m1!.lezers[0], false) === 'Claude · читає сторінку');
  check('opschrift (nl) is dezelfde regel in het Nederlands', TS.lezerOpschrift(m1!.lezers[0], true) === 'Claude · leest de pagina');
  const acties = ['browser.screenshot', 'browser.click', 'browser.navigate', 'browser.deep_diagnostics'] as const;
  check('elke actie heeft een eigen tweetalige tekst', acties.every((t) => {
    const a = TS.actieTekst(t);
    return a !== TS.ACTIE_ALGEMEEN && a[0] !== a[1] && a[0].length > 2 && a[1].length > 2;
  }));
  check('knipt de markering een onbekende opdracht niet dicht: algemene, eerlijke tekst', TS.actieTekst('browser.iets_nieuws') === TS.ACTIE_ALGEMEEN);
  const pillen = zoek(schaduwVan(wortel)!, 'pil');
  check('de strook onderaan toont de naam en de actie', pillen.length === 1 && pillen[0].textContent === 'Claude · читає сторінку');
  check('de strook toont ook een logo uit het merkregister (svg, geen monogram)', pillen[0].kinderen.some((k) => k.tagName === 'svg'));

  // ---------------------------------------------------------------- 4. kleur: standaard uit het palet, keuze van de eigenaar wint
  const uitPalet = (acc: string) => ACCENT_KLEUREN[acc as keyof typeof ACCENT_KLEUREN];
  check('elke agent heeft een standaardaccent UIT het palet van de site',
    V2_AGENTEN.every((a) => (ACCENTEN as readonly string[]).includes(TS.AGENT_ACCENT[a.slug])));
  check('de standaardkleur is letterlijk de hoofdkleur van dat accent (niets verzonnen)',
    V2_AGENTEN.every((a) => TS.AGENT_KLEUR_STANDAARD[a.slug].licht === uitPalet(TS.AGENT_ACCENT[a.slug]).licht.hoofd
      && TS.AGENT_KLEUR_STANDAARD[a.slug].donker === uitPalet(TS.AGENT_ACCENT[a.slug]).donker.hoofd));
  check('twee agents hebben nooit dezelfde standaardkleur', new Set(V2_AGENTEN.map((a) => TS.AGENT_KLEUR_STANDAARD[a.slug].licht)).size === V2_AGENTEN.length);
  const gekozen = TS.markeringLezers([{ slug: 'claude', type: 'browser.snapshot', at: nu, accent: 'roze' }], nu);
  check('de keuze van de eigenaar bepaalt de kleur', gekozen!.lezers[0].kleur.licht === ACCENT_KLEUREN.roze.licht.hoofd);
  const onzin = TS.markeringLezers([{ slug: 'claude', type: 'browser.snapshot', at: nu, accent: 'neonpaars' }], nu);
  check('een accent dat niet in het palet staat wordt genegeerd (terug naar de standaard)', onzin!.lezers[0].kleur.licht === TS.AGENT_KLEUR_STANDAARD.claude.licht);
  check('een onbekende agent krijgt de neutrale kleur uit het palet', TS.kleurVoorAgent(null).licht === ACCENT_KLEUREN[TS.ONBEKEND_ACCENT].licht.hoofd);

  // ---------------------------------------------------------------- 5. meer lezers: meer randen, meer plaatsen, grens
  const drie = [
    { slug: 'claude', type: 'browser.snapshot', at: nu - 10 },
    { naam: 'ChatGPT', type: 'browser.click', at: nu },
  ];
  const m2 = TS.markeringLezers(drie, nu);
  check('twee AI’s geven twee lezers, jongste eerst', !!m2 && m2.lezers.length === 2 && m2.lezers[0].slug === 'gpt' && m2.lezers[1].slug === 'claude');
  check('elke lezer houdt zijn EIGEN kleur', m2!.lezers[0].kleur.licht !== m2!.lezers[1].kleur.licht);
  mark.zetMarkering({ ruimte: 'prive', model: m2, nederlands: false });
  const schaduw2 = schaduwVan(wortel)!;
  const randen2 = zoek(schaduw2, 'rand');
  check('twee lezers = twee randen', randen2.length === 2);
  check('de randen staan NAAST elkaar (elk verder naar binnen)', randen2[0].stijl.get('inset') === '0px' && randen2[1].stijl.get('inset') === '3px');
  check('elke rand heeft de kleur van zijn eigen agent',
    randen2[0].stijl.get('--k') === m2!.lezers[0].kleur.licht && randen2[1].stijl.get('--k') === m2!.lezers[1].kleur.licht);
  const pillen2 = zoek(schaduw2, 'pil');
  check('twee plaatsen in de strook, elk met naam en actie',
    pillen2.length === 2 && pillen2[0].textContent === 'ChatGPT · натискає' && pillen2[1].textContent === 'Claude · читає сторінку');

  const veel = V2_AGENTEN.map((a, i) => ({ slug: a.slug, type: 'browser.snapshot', at: nu - i }));
  const m3 = TS.markeringLezers(veel, nu);
  check(`de grens van ${TS.MARKERING_MAX_AGENTEN} wordt gerespecteerd`, m3!.lezers.length === TS.MARKERING_MAX_AGENTEN);
  check('de rest wordt geteld, niet weggelaten', m3!.extra === V2_AGENTEN.length - TS.MARKERING_MAX_AGENTEN);
  check('«та ще N» staat in het opschrift', TS.markeringOpschrift(m3!, 'prive', false).includes(`та ще ${m3!.extra}`)
    && TS.markeringOpschrift(m3!, 'prive', true).includes(`en nog ${m3!.extra}`));
  mark.zetMarkering({ ruimte: 'prive', model: m3, nederlands: false });
  const schaduw3 = schaduwVan(wortel)!;
  check('ook in de strook staat «та ще N» als eigen plaats', zoek(schaduw3, 'tel').some((p) => p.textContent === `та ще ${m3!.extra}`));
  check('niet meer randen dan de grens', zoek(schaduw3, 'rand').length === TS.MARKERING_MAX_AGENTEN);
  check('dezelfde agent twee keer blijft één lezer (jongste actie wint)', (() => {
    const m = TS.markeringLezers([{ slug: 'claude', type: 'browser.snapshot', at: nu - 50 }, { slug: 'claude', type: 'browser.click', at: nu }], nu)!;
    return m.lezers.length === 1 && m.lezers[0].actie[0] === 'натискає';
  })());

  // ---------------------------------------------------------------- 6. eerlijk bij een onbekende agent
  const onbekend = TS.markeringLezers([{ type: 'browser.snapshot', at: nu }], nu)!;
  check('onbekende agent: geen slug en geen naam', onbekend.lezers[0].slug === null && onbekend.lezers[0].naam === '');
  check('het opschrift zegt dan alleen «ШІ» / «AI», zonder naam',
    TS.lezerOpschrift(onbekend.lezers[0], false) === 'ШІ · читає сторінку' && TS.lezerOpschrift(onbekend.lezers[0], true) === 'AI · leest de pagina');
  check('geen enkele agentnaam wordt geraden', !V2_AGENTEN.some((a) => TS.lezerOpschrift(onbekend.lezers[0], false).includes(a.naam)));
  mark.zetMarkering({ ruimte: 'prive', model: onbekend, nederlands: false });
  const pilOnbekend = zoek(schaduwVan(wortel)!, 'pil')[0];
  check('de strook toont een monogram in plaats van een verzonnen logo', pilOnbekend.kinderen.some((k) => k.className === 'mono'));
  check('een naam die een agent AANDUIDT wordt wel herkend (ook uit een clientnaam)',
    TS.agentSlugUitNaam('Claude Code') === 'claude' && TS.agentSlugUitNaam('openai-chatgpt') === 'gpt'
    && TS.agentSlugUitNaam('VS Code Copilot') === 'copilot' && TS.agentSlugUitNaam('iets anders') === null);

  // ---------------------------------------------------------------- 7. technisch slot blijft te onderscheiden
  const zelfdeKleur = TS.markeringLezers([{ slug: 'claude', type: 'browser.snapshot', at: nu }], nu)!;
  mark.zetMarkering({ ruimte: 'technisch', model: zelfdeKleur, nederlands: false });
  const schaduwT = schaduwVan(wortel)!;
  check('technisch slot: extra streepjesrand in de kleur van het technische profiel', zoek(schaduwT, 'tech').length === 1);
  check('de agentranden schuiven daarbinnen op', zoek(schaduwT, 'rand')[0].stijl.get('inset') === '3px');
  check('de strook zegt het ook in woorden', zoek(schaduwT, 'tel').some((p) => p.textContent === 'технічний профіль'));
  check('en in het Nederlands', TS.markeringOpschrift(zelfdeKleur, 'technisch', true).endsWith('technisch profiel'));
  check('het opschrift van hetzelfde model verschilt per ruimte, ook bij dezelfde agentkleur',
    TS.markeringOpschrift(zelfdeKleur, 'technisch', false) !== TS.markeringOpschrift(zelfdeKleur, 'prive', false));
  check('de pillen van het technische slot zijn ook apart gemarkeerd', zoek(schaduwT, 'merk-tech').length === 1);

  // ---------------------------------------------------------------- 8. uitgaan, verbergen, opruimen
  mark.zetMarkering(null);
  check('zonder lezers gaat de markering weg (zacht: na de overgang is ze echt weg)', mark.markeringStand() === null);
  mark.zetMarkering({ ruimte: 'prive', model: m1, nederlands: false });
  check('verberg() zet de markering weg vóór een momentopname', mark.verberg(500) === true
    && hostVan(wortel)!.stijl.get('display') === 'none');
  check('toon() zet haar daarna terug', mark.toon() === true
    && hostVan(wortel)!.stijl.get('display') === 'block');
  mark.verwijder();
  check('verwijder() haalt alles uit de pagina', mark.markeringStand() === null && schaduwVan(wortel) === null);

  // prefers-reduced-motion: geen overgang, meteen weg
  zetDom({ rustig: true });
  mark.zetMarkering({ ruimte: 'prive', model: m1, nederlands: false });
  mark.zetMarkering(null);
  check('prefers-reduced-motion: meteen weg, zonder animatie', mark.markeringStand() === null);
  // donkere pagina: de donkere variant van hetzelfde accent
  const wortelD = zetDom({ donker: true });
  mark.zetMarkering({ ruimte: 'prive', model: m1, nederlands: false });
  check('op een donkere pagina wordt de donkere variant van hetzelfde accent gebruikt',
    zoek(schaduwVan(wortelD)!, 'rand')[0].stijl.get('--k') === TS.AGENT_KLEUR_STANDAARD.claude.donker);
  mark.verwijder();

  // ---------------------------------------------------------------- 9. de extensie en de site zeggen hetzelfde
  check('MARKERING_STAART_MS en de grens zijn in beide kopieën gelijk',
    JS.MARKERING_STAART_MS === TS.MARKERING_STAART_MS && JS.MARKERING_MAX_AGENTEN === TS.MARKERING_MAX_AGENTEN);
  check('AGENT_ACCENT is in beide kopieën gelijk', JSON.stringify(JS.AGENT_ACCENT) === JSON.stringify(TS.AGENT_ACCENT) && JS.ONBEKEND_ACCENT === TS.ONBEKEND_ACCENT);
  check('het accentpalet in de extensie is letterlijk ACCENT_KLEUREN van de site',
    ACCENTEN.every((a) => JS.ACCENT_HOOFD[a] && JS.ACCENT_HOOFD[a].licht === ACCENT_KLEUREN[a].licht.hoofd && JS.ACCENT_HOOFD[a].donker === ACCENT_KLEUREN[a].donker.hoofd)
    && Object.keys(JS.ACCENT_HOOFD).length === ACCENTEN.length);
  check('de standaardkleuren zijn in beide kopieën gelijk', JSON.stringify(JS.AGENT_KLEUR_STANDAARD) === JSON.stringify(TS.AGENT_KLEUR_STANDAARD));
  check('de actieteksten zijn in beide kopieën gelijk',
    JSON.stringify(JS.MARKERING_ACTIES) === JSON.stringify(TS.MARKERING_ACTIES) && JSON.stringify(JS.ACTIE_ALGEMEEN) === JSON.stringify(TS.ACTIE_ALGEMEEN));
  check('de agentnamen zijn in beide kopieën gelijk, en gelijk aan V2_AGENTEN',
    JSON.stringify(JS.AGENT_NAAM) === JSON.stringify(TS.AGENT_NAAM) && V2_AGENTEN.every((a) => TS.AGENT_NAAM[a.slug] === a.naam));
  const proef = [{ slug: 'grok', type: 'browser.type', at: nu }, { naam: 'Gemini CLI', type: 'browser.scroll', at: nu - 5 }, { type: 'browser.wait', at: nu - 9 }, { slug: 'cursor', type: 'browser.click', at: nu - 3000 }];
  check('markeringLezers() geeft in beide kopieën precies hetzelfde model',
    JSON.stringify(JS.markeringLezers(proef, nu)) === JSON.stringify(TS.markeringLezers(proef, nu)));
  check('ook het opschrift is in beide kopieën gelijk (uk én nl)',
    JS.markeringOpschrift(JS.markeringLezers(proef, nu), 'technisch', false) === TS.markeringOpschrift(TS.markeringLezers(proef, nu)!, 'technisch', false)
    && JS.markeringOpschrift(JS.markeringLezers(proef, nu), 'prive', true) === TS.markeringOpschrift(TS.markeringLezers(proef, nu)!, 'prive', true));
  check('agentSlugUitNaam() geeft in beide kopieën hetzelfde',
    ['Claude Code', 'chatgpt', 'xai grok', 'bard', 'vscode', 'cursor', '', 'Copilot Workspace', 'onbekend'].every((n) => JS.agentSlugUitNaam(n) === TS.agentSlugUitNaam(n)));

  // extension/shared.js ≡ shared/extensie-ontgrendeling.ts (de bestaande spiegel moet mee blijven kloppen)
  check('extension/shared.js heeft dezelfde MIN_EXTENSIE_VERSIE als de site', (extShared as any).MIN_EXTENSIE_VERSIE === MIN_EXTENSIE_VERSIE);
  check('extension/shared.js heeft dezelfde markeringkleuren en badge per ruimte',
    JSON.stringify((extShared as any).MARKERING_KLEUREN) === JSON.stringify(MARKERING_KLEUREN)
    && JSON.stringify((extShared as any).MARKERING_BADGE) === JSON.stringify(MARKERING_BADGE));
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));
  // 23.10 (zone E, 0.7.0): de server eist MINSTENS 0.6.2 (oudere extensies blijven werken, de server haalt de nieuwe mogelijkheden
  // voor hen weg — capsVoorVersie). EXTENSIE_VERSIE_MATRIX is de eerste versie die de zeven mogelijkheden kent: een drempel, geen
  // «nieuwste versie». Latere versies (bv. 0.8.1, F2) zijn daarom wel toegestaan; de test eist alleen dat het manifest niet onder één
  // van beide drempels zakt. INTEG-001: eerder stond hier een gelijkheid, die na F2 vanzelf faalde.
  const getal = (v: string) => v.split('.').map((x) => Number(x) || 0).reduce((n, x) => n * 1000 + x, 0);
  check('de versie van het manifest is minstens de minimumversie die de server eist en minstens de versie met de zeven mogelijkheden (matrix)',
    getal(manifest.version) >= getal(MIN_EXTENSIE_VERSIE) && getal(manifest.version) >= getal(EXTENSIE_VERSIE_MATRIX), `${manifest.version} / min ${MIN_EXTENSIE_VERSIE} / matrix ${EXTENSIE_VERSIE_MATRIX}`);
  const war = (manifest.web_accessible_resources?.[0]?.resources ?? []) as string[];
  check('de nieuwe modules zijn web-toegankelijk (anders laadt markering.js niet op de pagina)',
    ['markering.js', 'markering-agenten.js', 'merk-agenten.js'].every((f) => war.includes(f)));

  // ---------------------------------------------------------------- 10. de logo's komen uit het ENE merkregister
  check('elk agentlogo in de extensie is letterlijk het logo uit src/merk/merk-tabel.ts',
    V2_AGENTEN.every((a) => JSON.stringify((MERK_AGENTEN as any)[a.slug]) === JSON.stringify((MERKEN as any)[a.slug])));
  check('de extensie tekent geen agentlogo dat de site niet kent', Object.keys(MERK_AGENTEN).every((k) => k in MERKEN)
    && Object.keys(MERK_AGENTEN).length === V2_AGENTEN.length);

  // ---------------------------------------------------------------- 11. de poort blijft de poort (0.6.1 blijft gelden)
  check('een slot dat niet verbonden is geeft geen poort (en dus nooit een rand)',
    markeringVoor({ ...slot, verbonden: false } as never, 'prive', 'gebruiker', 'https://hub.tarasevych.com/x') === null);
  check('een technisch slot raakt nooit een gebruikerstabblad',
    markeringVoor(slot as never, 'technisch', 'gebruiker', 'https://admin.tarasevych.com/x') === null);
  check('een host buiten de ontgrendeling geeft geen poort',
    markeringVoor(slot as never, 'prive', 'gebruiker', 'https://mail.tarasevych.com/x') === null);

  herstelDom();

  // ---------------------------------------------------------------- 12. de kleur hoort bij de GEBRUIKER (migratie 0088)
  const sys = getPool('systeem');
  const U = `mka-${Date.now()}`;
  try {
    const standaard = await kleurenStore.lijst(U);
    check('zonder keuze: alle zes agents met hun standaardaccent uit het palet',
      standaard.length === V2_AGENTEN.length && standaard.every((r) => r.standaard && r.accent === TS.AGENT_ACCENT[r.agent]));
    const na = await kleurenStore.zet(U, 'grok', 'roze');
    check('de eigenaar kan de kleur van één agent wijzigen, de rest blijft standaard',
      na.find((r) => r.agent === 'grok')!.accent === 'roze' && na.find((r) => r.agent === 'grok')!.standaard === false
      && na.filter((r) => r.agent !== 'grok').every((r) => r.standaard));
    check('dezelfde keuze komt ook in de vorm die de extensie krijgt (alleen namen, geen hexwaarden)',
      JSON.stringify(kleurenStore.voorExtensie(na).find((r) => r.agent === 'grok')) === '{"agent":"grok","accent":"roze"}'
      && !JSON.stringify(kleurenStore.voorExtensie(na)).includes('#'));
    check('de rand gebruikt die keuze (en dus het palet van de site)',
      TS.markeringLezers([{ slug: 'grok', type: 'browser.snapshot', at: nu, accent: 'roze' }], nu)!.lezers[0].kleur.licht === ACCENT_KLEUREN.roze.licht.hoofd);
    const terug = await kleurenStore.zet(U, 'grok', null);
    check('«Стандарт» zet de kleur terug op het accent uit het palet', terug.find((r) => r.agent === 'grok')!.standaard === true
      && terug.find((r) => r.agent === 'grok')!.accent === TS.AGENT_ACCENT.grok);
    let fout = '';
    await kleurenStore.zet(U, 'grok', 'neonpaars').catch((e) => { fout = String((e as Error).message); });
    check('een kleur buiten het palet wordt geweigerd (nooit een onleesbare rand)', fout === 'ACCENT_ONBEKEND');
    fout = '';
    await kleurenStore.zet(U, 'onzin', 'roze').catch((e) => { fout = String((e as Error).message); });
    check('een onbekende agent wordt geweigerd', fout === 'AGENT_ONBEKEND');
  } catch (e) {
    check('onverwachte fout in de opslag van de agentkleuren', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.agent_kleuren WHERE user_id = $1', [U]).catch(() => undefined);
  }

  return einde();
}
