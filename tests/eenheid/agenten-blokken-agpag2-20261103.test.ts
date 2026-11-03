// INTEG-001 · agpag2 (03.11.2026): de secties «Розширення браузера», «Браузер і агенти», «Пристрої», «Токени», «Доступи», «Технічне»
// en «Журнал» van mcp.*/agents bestaan uit duidelijke blokken. Melding eigenaar: «сира таблиця, без дизайну і без зрозумілих блоків,
// багато порожніх проміжків, розділи не відділені». Elk blok volgt het klassencontract van src/agenten/agenten-pagina.css (agpag1):
// .ag-blok > .ag-blok-kop met .ag-blok-titel (naam) en .ag-blok-uitleg (één zin), knoppen in .ag-knoppen, lege staat in .ag-leeg.
// Toetst met react-dom/server (echte componenten, nep-DOM): elk blok heeft naam + uitleg, de dubbele koppen (h2 in de sectie) zijn
// weg, de bestaande data-attributen (e2e en andere tests) blijven, de Nederlandse weergave bevat geen Oekraïense tekst, en het eigen
// CSS-bestand definieert de contractklassen niet zelf, gebruikt alleen thema-tokens en heeft een telefoonregel.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';

const ORIGIN = 'https://mcp.tarasevych.com';
const lees = (p: string) => readFileSync(p, 'utf8');

/** Nep-DOM met wat de modules bij het laden nodig hebben (zelfde opzet als ai-hub.test.ts). Geeft een functie die alles weer opruimt. */
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}/agents#extensie`);
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = {
    hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
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
const json = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status, statusText: '', headers: new Headers(), text: async () => JSON.stringify(data), json: async () => data });

/** Elk blok (class «ag-blok», niet «ag-blok-kop» enz.) met zijn html tot het volgende blok. */
const BLOK = /<section\b[^>]*\bclass="(?:[^"]*\s)?ag-blok(?:\s[^"]*)?"[^>]*>/g;
function blokken(html: string): string[] {
  const begin = [...html.matchAll(BLOK)].map((m) => m.index ?? 0);
  return begin.map((b, i) => html.slice(b, begin[i + 1] ?? html.length));
}
/** Elk blok heeft een kop met naam en één zin. Geeft de blokken zonder naam of uitleg terug (leeg = in orde). */
function zonderKop(html: string): string[] {
  return blokken(html).filter((b) => !/class="[^"]*\bag-blok-kop\b/.test(b) || !/class="[^"]*\bag-blok-titel\b/.test(b) || !/class="[^"]*\bag-blok-uitleg\b/.test(b))
    .map((b) => b.slice(0, 160));
}
const CYRILLISCH = /[Ѐ-ӿ]/;
/** Oekraïense tekst in een Nederlandse weergave (zichtbare tekst én title/aria-label), met een stukje context. */
function cyrillischIn(html: string): string[] {
  const uit: string[] = [];
  const tekst = html.replace(/<[^>]*?\b(?:title|aria-label|placeholder)="([^"]*)"[^>]*>/g, ' $1 ').replace(/<[^>]+>/g, ' ');
  for (const m of tekst.matchAll(/[^\s][^<>]{0,40}/g)) if (CYRILLISCH.test(m[0])) uit.push(m[0].trim().slice(0, 60));
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('agenten-blokken-agpag2-20261103');
  const herstel = nepBrowser();
  const vorigeFetch = globalThis.fetch;
  globalThis.fetch = (async () => json(200, {})) as unknown as typeof fetch;
  const uk = (a: string) => a;
  const nl = (_a: string, b: string) => b;
  try {
    // ================================================================ 1. «Розширення браузера»
    const { default: TabExtensie } = await import('../../src/agenten/TabExtensie');
    const ext = (tr: typeof uk) => renderToString(createElement(TabExtensie, { tr, agents: [], techAgents: [], naActie: async () => undefined, versie: 0, koppel: '' }));
    const e = ext(uk);
    check('extensie: blok «Як користувач» met naam, één zin en de knop naar «Браузер і агенти» in de kop',
      blokken(e).length >= 1 && zonderKop(e).length === 0 && e.includes('data-ext-sectie="gebruiker"') && e.includes('id="extension-lokaal"')
      && /class="ag-knoppen ag2-acties" data-ext-naar-browser="1"/.test(e) && e.includes('data-ext-naar-browser-knop="1"'), zonderKop(e).join(' | '));
    check('extensie: de profielregel en het installatiepaneel staan IN het blok, niet als losse kaarten', e.includes('data-profiel-tab="gebruiker"') && e.includes('data-paneel="extensie"') && !/class="ag-kaart[^"]*" data-paneel="extensie"/.test(e) && !e.includes('ag-ext-naar-browser" data-ext-naar-browser'));
    check('extensie (nl): geen Oekraïense tekst', cyrillischIn(ext(nl)).length === 0, cyrillischIn(ext(nl)).join(' | '));

    // ================================================================ 2. «Браузер і агенти»
    const { default: BrowserEnAgenten } = await import('../../src/extensie/BrowserEnAgenten');
    const bea = (tr: typeof uk) => renderToString(createElement(BrowserEnAgenten, { tr }));
    const b = bea(uk);
    const bBlokken = blokken(b);
    check('browser: vier blokken (sloten, matrix, weigeringen, uitleg), elk met naam en één zin', bBlokken.length === 4 && zonderKop(b).length === 0, `${bBlokken.length}: ${zonderKop(b).join(' | ')}`);
    check('browser: geen dubbele h2 «Браузер і агенти» meer (de sectiekop van de hub draagt die naam)', !b.includes('<h2') && !b.includes('bea-kop'));
    check('browser: slotkeuze als knoppen in de kop van het matrixblok; sloten en termijnanker blijven', /data-ag-blok="browser-matrix"[\s\S]*?class="ag-blok-kop"[\s\S]*?data-bea-slotkeuze="prive"/.test(b) && b.includes('id="bea-slot-prive"') && b.includes('data-bea-slot="technisch"'));
    check('browser: geen weigeringen → lege staat (.ag-leeg) in het blok, geen losse grijze regel', /data-ag-blok="browser-weigeringen"[\s\S]*?class="ag-leeg" data-bea-geen-weigeringen="1"/.test(b));
    check('browser: geen inline-opmaak meer voor groepsknoppen en legenda (CSS in agenten-tabs-2.css)', !/data-bea-groepen=[^>]*style=/.test(lees('src/extensie/BrowserEnAgenten.tsx')) && !/data-bea-legenda='1' style=/.test(lees('src/extensie/BrowserEnAgenten.tsx')));
    check('browser (nl): geen Oekraïense tekst', cyrillischIn(bea(nl)).length === 0, cyrillischIn(bea(nl)).join(' | '));

    // ================================================================ 3. «Пристрої»
    const { default: TabApparaten } = await import('../../src/agenten/TabApparaten');
    const pc = (id: string, naam: string, status: 'connected' | 'offline') => ({ id, name: naam, platform: 'win32-x64', status, lastSeenAt: 1, createdAt: 1, policy: { autoApprove: [] }, enabled: true, armedUntil: null, version: '1.0.0', ruimte: 'prive' });
    const app = (tr: typeof uk, agents: unknown[]) => renderToString(createElement(TabApparaten, { tr, agents: agents as never, pending: [], last: {}, overzicht: null, naActie: async () => undefined, reload: async () => undefined, item: '', kies: () => undefined, versie: 0, naarExtensie: () => undefined }));
    const leeg = app(uk, []);
    check('apparaten: één blok met naam, één zin en de knoppen «Підключити ПК» / «Розширення браузера» in de kop', blokken(leeg).length === 1 && zonderKop(leeg).length === 0 && /class="ag-knoppen ag2-acties"[\s\S]*?data-knop="koppelen"[\s\S]*?data-knop="extensie"/.test(leeg));
    check('apparaten: geen apparaat → lege staat met wat u kunt doen; geen sorteerkeuze zonder lijst', leeg.includes('data-apparaten-leeg="1"') && leeg.includes('Підключити ПК') && !leeg.includes('data-sorteer'));
    const twee = app(uk, [pc('a1', 'Ноутбук', 'connected'), pc('a2', 'Робочий ПК', 'offline')]);
    check('apparaten: met twee apparaten → teller, sorteren en de lijst (data-lijst="apparaten")', twee.includes('data-apparaten-telling="2"') && twee.includes('у мережі 1') && twee.includes('data-sorteer="apparaten"') && twee.includes('data-lijst="apparaten"') && !twee.includes('data-apparaten-leeg'));
    check('apparaten (nl): geen Oekraïense tekst buiten de namen van de apparaten', cyrillischIn(app(nl, [pc('a1', 'Laptop', 'connected')])).length === 0, cyrillischIn(app(nl, [pc('a1', 'Laptop', 'connected')])).join(' | '));

    // ================================================================ 4. «Токени»
    const { default: TabTokens } = await import('../../src/agenten/TabTokens');
    const morgen = new Date(Date.now() + 864e5).toISOString();
    const tok = { id: 't1', name: 'grok', prefix: 'tvh_ab', scopes: ['mcp'], createdAt: new Date().toISOString(), expiresAt: morgen, revokedAt: '', calls: 3, lastSeenAt: new Date().toISOString(), ruimte: 'prive' };
    const toks = (tr: typeof uk, tokens: unknown[] | null) => renderToString(createElement(TabTokens, { tr, data: tokens === null ? null : { tokens: tokens as never, rechten: {}, catalogus: [], bestand: '' }, naActie: async () => undefined, item: '', kies: () => undefined }));
    const t0 = toks(uk, []);
    check('tokens: twee blokken — «Підключити ШІ» (AiVerbinden) en «Ваші токени» — elk met naam en één zin', blokken(t0).length === 2 && zonderKop(t0).length === 0 && t0.includes('data-ai-verbinden="1"') && t0.includes('data-ag-blok="tokens"'), zonderKop(t0).join(' | '));
    check('tokens: geen actief token → lege staat die zegt waar een nieuw token vandaan komt', t0.includes('data-tokens-leeg="1"') && !t0.includes('data-lijst="tokens"'));
    const t1 = toks(uk, [tok]);
    check('tokens: één actief token → teller + lijst met de rij (data-rij="tok:t1")', t1.includes('data-tokens-telling="1"') && t1.includes('data-lijst="tokens"') && t1.includes('data-rij="tok:t1"'));
    check('tokens: de kop van AiVerbinden heeft een uniek id (useId), niet meer het vaste «ag-verbind-titel»', !t0.includes('id="ag-verbind-titel"') && !lees('src/agenten/AiVerbinden.tsx').includes("'ag-verbind-titel'"));
    // De datum komt uit datum() in src/agenten/ui.tsx (Intl met de taal van de browser, gedeeld door alle tabbladen) — die telt hier niet mee.
    const { datum } = await import('../../src/agenten/ui');
    const tNl = toks(nl, [tok]).split(datum(Date.parse(morgen))).join('');
    check('tokens (nl): geen Oekraïense tekst (buiten de datum van de browser)', cyrillischIn(tNl).length === 0, cyrillischIn(tNl).join(' | '));

    // ================================================================ 5. «Доступи»
    const { default: TabToegang } = await import('../../src/agenten/TabToegang');
    const tg = (tr: typeof uk) => renderToString(createElement(TabToegang, { tr }));
    const a = tg(uk);
    check('toegang: geen dubbele h2 «Доступи»; bovenaan één regel met de (?) «toegang.overzicht»', !a.includes('<h2') && a.includes('data-tg-intro') && a.includes('tech-vraag-knop') && a.includes('Тут зібрано все, що ви дозволили ШІ'));
    check('toegang: «Мої доступи» is een blok met naam, één zin en «Оновити» in de kop', /data-ag-blok="mijn-toegang"/.test(a) && zonderKop(a).length === 0 && /class="ag-knoppen ag2-acties"[\s\S]*?data-knop="tg-vernieuw"/.test(a));
    check('toegang (nl): geen Oekraïense tekst', cyrillischIn(tg(nl)).length === 0, cyrillischIn(tg(nl)).join(' | '));

    // ================================================================ 6. «Технічне» (zonder technisch profiel: de poort)
    const { default: TabTechnisch } = await import('../../src/agenten/TabTechnisch');
    const tt = (tr: typeof uk) => renderToString(createElement(TabTechnisch, { tr }));
    const p = tt(uk);
    check('technisch: de poort is één blok met naam en één zin; anker #ruimte blijft', blokken(p).length === 1 && zonderKop(p).length === 0 && p.includes('id="ruimte"') && p.includes('data-technisch-poort='));
    check('technisch (nl): geen Oekraïense tekst', cyrillischIn(tt(nl)).length === 0, cyrillischIn(tt(nl)).join(' | '));
    const { default: TechVerbindingen } = await import('../../src/agenten/TechVerbindingen');
    const tv = renderToString(createElement(TechVerbindingen, { tr: uk, ingebed: true }));
    check('technisch ingebed: geen eigen h1/h2 (de sectiekop draagt de naam), wel blokken voor regels, verbindingen, deur en serveragenten',
      !tv.includes('<h1') && !tv.includes('<h2') && ['tech-regels', 'site-schakelaars', 'ai-verbinden', 'tech-verbindingen', 'tech-deur', 'tech-server-agenten'].every((x) => tv.includes(`data-ag-blok="${x}"`)) && zonderKop(tv).length === 0, zonderKop(tv).join(' | '));
    const { default: RuimteScheiding } = await import('../../src/agenten/RuimteScheiding');
    const rs = renderToString(createElement(RuimteScheiding, { tr: uk }));
    check('«Окремі простори»: blok met naam en één zin (ook tijdens het laden); de diensten zijn rijen, geen <table>', blokken(rs).length === 1 && zonderKop(rs).length === 0 && !lees('src/agenten/RuimteScheiding.tsx').includes('<table') && lees('src/agenten/RuimteScheiding.tsx').includes("className='ag2-diensten' data-ruimte-tabel='1'"));

    // ================================================================ 7. «Журнал»
    const { default: Journaal } = await import('../../src/agenten/Journaal');
    const jr = (tr: typeof uk) => renderToString(createElement(Journaal, { tr, onderwerpen: [], versie: 0, actief: false }));
    const j = jr(uk);
    check('journaal: één blok met naam, één zin en de filters (soort, onderwerp) in de kop', blokken(j).length === 1 && zonderKop(j).length === 0 && /class="ag-blok-kop"[\s\S]*?data-filter="soort"[\s\S]*?data-filter="onderwerp"/.test(j) && j.includes('data-tab-inhoud="journaal"'));
    check('journaal (nl): geen Oekraïense tekst', cyrillischIn(jr(nl)).length === 0, cyrillischIn(jr(nl)).join(' | '));
  } finally {
    globalThis.fetch = vorigeFetch;
    herstel();
  }

  // ================================================================ 8. CSS en bron
  const css = lees('src/agenten/agenten-tabs-2.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/(^|})\s*([^{}@]+)\{/g)].map((m) => m[2].trim());
  const contract = /(^|[\s,>+~])\.(ag-pagina|ag-blok|ag-blok-kop|ag-blok-titel|ag-blok-uitleg|ag-rij|ag-leeg|ag-knoppen)(?![\w-])/;
  check('agenten-tabs-2.css definieert geen klasse uit het contract van agenten-pagina.css (alleen eigen ag2-klassen)', !selectors.some((s) => s.split(',').some((x) => contract.test(` ${x.trim()}`))), selectors.filter((s) => contract.test(` ${s}`)).join(' | '));
  check('agenten-tabs-2.css: alleen thema-tokens (geen vaste kleur buiten een terugval in var()), een telefoonregel en tikdoelen van 44 px',
    !/#[0-9a-f]{3,8}\b/i.test(css.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '')) && /@media \(max-width:560px\)/.test(css) && /min-height:44px/.test(css));
  const bestanden = ['src/agenten/TabExtensie.tsx', 'src/extensie/BrowserEnAgenten.tsx', 'src/agenten/TabApparaten.tsx', 'src/agenten/TabTokens.tsx', 'src/agenten/TabToegang.tsx', 'src/agenten/TabTechnisch.tsx',
    'src/agenten/Journaal.tsx', 'src/agenten/AiVerbinden.tsx', 'src/agenten/TechVerbindingen.tsx', 'src/agenten/RuimteScheiding.tsx', 'src/agenten/SiteSchakelaars.tsx', 'src/agenten/AgentKleuren.tsx',
    'src/agenten/toegang/MijnToegang.tsx', 'src/agenten/toegang/AlleGebruikers.tsx'];
  check(`geen <style>-tags (CSP style-src 'self') in ${bestanden.length} bestanden`, bestanden.every((f) => !/<style[\s>]/.test(lees(f))));
  check('de bestanden van deze secties gebruiken het contract (ag-blok-kop + ag-blok-titel + ag-blok-uitleg)', bestanden.filter((f) => f !== 'src/agenten/TabToegang.tsx').every((f) => { const s = lees(f); return s.includes('ag-blok-kop') && s.includes('ag-blok-titel') && s.includes('ag-blok-uitleg'); }));
  check('AgentenPagina.tsx en agenten-pagina.css (agpag1) zijn hier niet aangeraakt: geen ag2-klassen erin', !lees('src/agenten/AgentenPagina.tsx').includes('ag2-'));
  return einde();
}
