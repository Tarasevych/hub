// Цикл у вікні згоди «Доступ для Claude» (скарга власника 20.10.2026: «почали підключати конектор і не завершили — застрягло»).
//
// ЩО БУЛО НЕ ТАК. Вікно згоди брало простір з АДРЕСИ СТОРІНКИ, на якій його намалювали ('prive' на Агентах, 'technisch' на
// окремій сторінці «Технічні підключення»). Запит дверей сервера (rid mrd_…) у приватному просторі показував жовтий блок і
// ПОСИЛАННЯ на /verbindingen?consent=… Але сторінки /verbindingen більше немає — вона злита у вкладку «Технічне» хаба
// mcp.*/agents, і mcpIngang веде /verbindingen назад на /agents. Там вікно знову малювалося з 'prive' — і цикл замикався,
// навіть коли технічний профіль у вкладці справді був активний.
//
// ЩО ТУТ ЗАФІКСОВАНО:
//  1. простір вікна рахується лише з ЖИВОГО стану технічного профілю (consentPlek), ніколи з адреси сторінки;
//  2. профіль активний + запит дверей → крок 'toestaan' («Дозволити»), без жовтого блоку;
//  3. профіль вимкнений + запит дверей → крок 'tech-aanzetten': ДІЯ «Увімкнути технічний профіль», а не посилання на сторінку,
//     якої немає; стан ще не завантажений → 'tech-laden' (нічого не стверджуємо);
//  4. `?consent=` переживає перехід (ingangAdres), і сам запит зберігається (mcp-consent-store);
//  5. у джерелі вікна й сторінки немає жодного посилання на /verbindingen як на окрему сторінку; сервер і двері теж ведуть на
//     /agents?consent=…;
//  6. обидва світи доходять до кінця: запит дверей (mrd_, soort 'deur') і запит конектора v2 (/<agent>) — v2 узагалі не
//     залежить від технічного профілю (живі права, 20.10.2026).
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { mcpIngang } from '../../shared/ai-agent-bord';
import { isAiRuimte } from '../../shared/ai-ruimte';

const ORIGIN = 'https://mcp.tarasevych.com';
const RID = 'mrd_abcdefghijklmnopqrstuvwxyz01';

/** Nep-DOM met precies wat de modules bij het laden nodig hebben (zelfde aanpak als ai-hub.test.ts). */
function nepBrowser(pad = '/agents', zoek = `?consent=${RID}`, hash = '#technisch'): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}${pad}${zoek}${hash}`);
  const metas: Array<{ setAttribute: (k: string, v: string) => void; getAttribute: (k: string) => string | null }> = [];
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const head = { appendChild: (el: (typeof metas)[number]) => { metas.push(el); return el; } };
  const doc = {
    hidden: false, title: '', cookie: '', head, body: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: (sel: string) => { const m = /^meta\[name="([^"]+)"\]$/.exec(sel); return m ? metas.find((x) => x.getAttribute('name') === m[1]) ?? null : null; },
    querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
  };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

const json = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status, statusText: '', headers: new Headers(), text: async () => JSON.stringify(data) });
const tr = (uk: string) => uk;

export async function main(): Promise<number> {
  const { check, einde } = checker('toestemming-ruimte-cyclus-20261020');

  // ================================================================ 1. de lus zelf: /verbindingen is geen pagina meer
  check('mcp.*/verbindingen is geen pagina: mcpIngang stuurt naar de hub #technisch (daarom mocht het venster er nooit naar linken)',
    JSON.stringify(mcpIngang('verbindingen', true)) === JSON.stringify({ service: 'mcp', tab: 'agents', hash: 'technisch' })
    && mcpIngang('verbindingen', false)?.hash === 'technisch' && mcpIngang('agents', false) === null && mcpIngang('agents', true) === null);

  // ================================================================ 2. geen enkele link naar /verbindingen als eigen pagina
  const modalBron = readFileSync('src/McpToestemmingVenster.tsx', 'utf8');
  const viewBron = readFileSync('src/McpDienstWeergave.tsx', 'utf8');
  const connectorBron = readFileSync('backend/mcp-connector.ts', 'utf8');
  const deurBron = readFileSync('deploy/mcp/server.mjs', 'utf8');
  check('venster van de toestemming: geen adres /verbindingen en geen andereRuimteUrl meer',
    !/['"`/]verbindingen\?consent/.test(modalBron) && !/andereRuimteUrl/.test(modalBron) && !/\/verbindingen['"`]/.test(modalBron));
  check('de site stuurt een toestemmingsverzoek naar /agents?consent=…', /\/agents\?consent=/.test(connectorBron) && !/\/verbindingen\?consent=/.test(connectorBron));
  check('de serverdeur (deploy/mcp/server.mjs) stuurt «в один клік» ook naar /agents?consent=…',
    (deurBron.match(/\/agents\?consent=/g) || []).length === 2 && !/\/verbindingen\?consent=/.test(deurBron));
  check('het venster beslist niet op de pagina: geen isBeheerPagina/ruimte-prop meer bij McpConsentModal',
    /<McpConsentModal tr=\{t\} \/>/.test(viewBron) && !/McpConsentModal[^>]*ruimte=/.test(viewBron));

  const herstel = nepBrowser();
  const vorigeFetch = globalThis.fetch;
  try {
    // ================================================================ 3. `?consent=` overleeft de omleiding (puur)
    const { ingangAdres } = await import('../../src/McpDienstWeergave');
    check('ingangAdres: ?consent= blijft staan en de hash komt erachter',
      ingangAdres(`${ORIGIN}/agents`, 'technisch', `?consent=${RID}`) === `${ORIGIN}/agents?consent=${RID}#technisch`);
    check('ingangAdres: zonder consent een schoon adres; andere parameters van de oude pagina gaan niet mee',
      ingangAdres(`${ORIGIN}/agents`, 'technisch', '') === `${ORIGIN}/agents#technisch`
      && ingangAdres(`${ORIGIN}/agents`, '', '?tool=read_file') === `${ORIGIN}/agents`);
    check('ingangAdres: een hash in het basisadres wordt vervangen, nooit verdubbeld',
      ingangAdres(`${ORIGIN}/agents#oud`, 'technisch', `?consent=${RID}`) === `${ORIGIN}/agents?consent=${RID}#technisch`);

    // ================================================================ 4. het verzoek overleeft ook de opslag (localStorage)
    const winkel = await import('../../src/mcp-toestemming-opslag');
    check('mcp-consent-store: het verzoek uit ?consent= wordt vastgelegd en blijft na het wissen van de adresbalk bekend',
      winkel.getPendingConsent() === RID);

    // ================================================================ 5. de pure beslissing: alleen de LEVENDE staat
    const { consentPlek, ConsentTechPoort, ConsentRuimteRegel } = await import('../../src/McpToestemmingVenster');
    const deurAan = consentPlek({ isDeur: true, techGeladen: true, techAan: true });
    const deurUit = consentPlek({ isDeur: true, techGeladen: true, techAan: false });
    const deurOnbekend = consentPlek({ isDeur: true, techGeladen: false, techAan: false });
    check('deurverzoek + profiel ACTIEF → «Дозволити» (technische ruimte), geen geel blok',
      deurAan.stap === 'toestaan' && deurAan.ruimte === 'technisch', JSON.stringify(deurAan));
    check('deurverzoek + profiel UIT → de actie «увімкнути профіль» (nooit een link naar een pagina)',
      deurUit.stap === 'tech-aanzetten' && deurUit.ruimte === 'technisch', JSON.stringify(deurUit));
    check('deurverzoek + staat nog onbekend → wachten, niets beweren', deurOnbekend.stap === 'tech-laden');
    check('connector (geen deur): nooit door het technische profiel geblokkeerd — privé is de veilige standaard',
      consentPlek({ isDeur: false, techGeladen: true, techAan: false }).stap === 'toestaan'
      && consentPlek({ isDeur: false, techGeladen: false, techAan: false }).ruimte === 'prive'
      && consentPlek({ isDeur: false, techGeladen: true, techAan: false, keuze: 'technisch' }).ruimte === 'prive');
    check('connector + profiel actief: «технічний» is alleen de KEUZE van de mens, niet de pagina',
      consentPlek({ isDeur: false, techGeladen: true, techAan: true, keuze: 'technisch' }).ruimte === 'technisch'
      && consentPlek({ isDeur: false, techGeladen: true, techAan: true, keuze: 'prive' }).ruimte === 'prive');
    check('consentPlek geeft altijd een geldige ruimte (shared/ai-ruimte)',
      [true, false].every((d) => [true, false].every((a) => isAiRuimte(consentPlek({ isDeur: d, techGeladen: true, techAan: a }).ruimte))));

    // ================================================================ 6. wat de mens ziet (markup)
    const poort = renderToString(createElement(ConsentTechPoort, { tr, heeftProfiel: true, netwerkfout: false, busy: false, onWeiger: () => undefined, onAanzetten: () => undefined }));
    check('profiel uit: een KNOP «Увімкнути технічний профіль», geen <a href> naar een andere ruimte',
      poort.includes('data-consent-tech-aan="1"') && poort.includes('Увімкнути технічний профіль') && !/<a\s/.test(poort) && !poort.includes('verbindingen'),
      poort.slice(0, 160));
    check('profiel uit zonder technisch profiel op het account: uitleg i.p.v. een knop die nergens heen kan',
      renderToString(createElement(ConsentTechPoort, { tr, heeftProfiel: false, netwerkfout: false, busy: false, onWeiger: () => undefined, onAanzetten: () => undefined })).includes('data-consent-tech="geen-profiel"'));
    check('netwerkfout op /tech/status: «запит зберігається», niet «немає технічного профілю»',
      renderToString(createElement(ConsentTechPoort, { tr, heeftProfiel: false, netwerkfout: true, busy: false, onWeiger: () => undefined, onAanzetten: () => undefined })).includes('data-consent-tech="netwerkfout"'));
    const deurRegel = renderToString(createElement(ConsentRuimteRegel, { tr, uk: true, ruimte: 'technisch', isDeur: true, techAan: true, heeftProfiel: true, busy: false, onKies: () => undefined, onAanzetten: () => undefined }));
    check('deurverzoek met actief profiel: regel «Технічний простір», geen keuze en geen link',
      deurRegel.includes('data-consent-ruimte="technisch"') && !/<a\s/.test(deurRegel) && !deurRegel.includes('data-consent-kies-ruimte'), deurRegel.slice(0, 140));
    const priveRegel = renderToString(createElement(ConsentRuimteRegel, { tr, uk: true, ruimte: 'prive', isDeur: false, techAan: true, heeftProfiel: true, busy: false, onKies: () => undefined, onAanzetten: () => undefined }));
    check('connector met actief profiel: de keuze is een knop in dit venster (data-consent-kies-ruimte), geen link',
      priveRegel.includes('data-consent-kies-ruimte="technisch"') && !/<a\s/.test(priveRegel));
    const priveUit = renderToString(createElement(ConsentRuimteRegel, { tr, uk: true, ruimte: 'prive', isDeur: false, techAan: false, heeftProfiel: true, busy: false, onKies: () => undefined, onAanzetten: () => undefined }));
    check('connector zonder actief profiel: aanbod om het profiel aan te zetten, geen link naar een pagina',
      priveUit.includes('data-consent-tech-aan="kies"') && !/<a\s/.test(priveUit) && !priveUit.includes('data-consent-kies-ruimte'));

    // ================================================================ 7. levende staat: van «aanzetten» naar «Дозволити» zonder herladen
    let techStatus: Record<string, unknown> = { profiel: null, activatie: null, nu: Date.now() };
    globalThis.fetch = (async (url: string) => (String(url).split('?')[0].startsWith('/api/owner/tech/') ? json(200, techStatus) : json(200, {}))) as unknown as typeof fetch;
    const store = await import('../../src/tech/tech-opslag');
    const profiel = { userId: 'u1', profielId: 'p1', rollen: ['ontwikkelaar'], maxMinuten: 60, maxNu: 60, band: { kleur: 'rood', patroon: 'streep' }, laatstActief: null };
    techStatus = { profiel, activatie: null, nu: Date.now() };
    await store.techVernieuwen();
    const uit = consentPlek({ isDeur: true, techGeladen: store.techToestand().geladen, techAan: store.techActief() });
    techStatus = { profiel, activatie: { id: 'a1', profielId: 'p1', rollen: ['ontwikkelaar'], mogelijkheden: [], reden: 'test', begin: Date.now(), eind: Date.now() + 3600_000 }, nu: Date.now() };
    await store.techActiveren(60, 'test test test');
    const aan = consentPlek({ isDeur: true, techGeladen: store.techToestand().geladen, techAan: store.techActief() });
    check('дія «увімкнути профіль» → той самий запит одразу показує «Дозволити» (без перезавантаження, без переходу)',
      uit.stap === 'tech-aanzetten' && aan.stap === 'toestaan' && winkel.getPendingConsent() === RID, `${uit.stap} → ${aan.stap}`);
    techStatus = { profiel, activatie: null, nu: Date.now() };
    await store.techBeeindigen();
    check('профіль вийшов → запит дверей знову вимагає ввімкнення (жодного тихого «Дозволити»)',
      consentPlek({ isDeur: true, techGeladen: true, techAan: store.techActief() }).stap === 'tech-aanzetten');

    // ================================================================ 8. beide wereldjes komen aan het einde
    const { isDeurRid } = await import('../../backend/mcp-deur-brug');
    const { isAgentSlug, agentUrl, AGENT_PAD_PREFIX } = await import('../../shared/connector-v2/agenten');
    check('deurverzoek (mrd_…) wordt als deur herkend, ook vóór het antwoord van de server', isDeurRid(RID) && !isDeurRid('abcdefghijklmnopqrstuvwx'));
    check('connector v2 /claude: eigen adres van de agent (geen deur, geen /ai/-pad)', isAgentSlug('claude') && AGENT_PAD_PREFIX === '' && agentUrl('claude') === `${ORIGIN}/claude`);
    // Een v2-verzoek (info.agent + info.v2) verlaat het venster vóór élke tech-poort: KoppelWizard staat in de bron vóór de
    // takken 'tech-aanzetten'/'tech-laden' en krijgt geen techAan/ruimte mee — levende rechten beslissen daar per aanroep.
    check('v2-venster komt vóór elke tech-poort (KoppelWizard) en kent geen technisch profiel als voorwaarde',
      modalBron.indexOf('<KoppelWizard') < modalBron.indexOf("stap === 'tech-aanzetten'")
      && modalBron.indexOf('<KoppelWizard') < modalBron.indexOf("stap === 'tech-laden'")
      && !/KoppelWizard[^>]*(techAan|ruimte=)/.test(modalBron));
  } finally {
    globalThis.fetch = vorigeFetch;
    herstel();
  }
  return einde();
}
