// Hub «Підключення ШІ» op mcp.*/agents (19.10.2026, contract EXT-06 §1/§4; melding eigenaar: «Розширення браузера пропало»).
// Toetst: tabbladen + hash-id's en alle oude adressen (#apparaten/extensie, #extension, #extensie/…, #dev:…, #verbindingen …),
// «Технічне» alleen in de rij met actief technisch profiel, ?koppel=prive, doorverwijzingen mcp.*/verbindingen en ai.*/verbindingen,
// de matrix «Що через який спосіб» (alleen kolommen van dit account), de meta mjn-profiel (live bij activeren/beëindigen/einde, zonder
// herladen) en de tab «Розширення браузера» per soort account: gewone gebruiker → gebruikerssectie, GEEN technische elementen;
// technisch profiel zonder activering → één regel + «Активувати»; met activering → beide secties.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { aiVerbindingenNaar, mcpIngang } from '../../shared/ai-agent-bord';
import { berekenMatrix, type MatrixInvoer } from '../../src/agenten/matrix';
import { PRIVE_HOSTS, ADMIN_HOSTS_TOEGESTAAN } from '../../shared/extensie-ontgrendeling';

const ORIGIN = 'https://mcp.tarasevych.com';
const AID = '11111111-2222-4333-8444-555555555555';
const TID = '22222222-2222-4333-8444-555555555555';

/** Nep-DOM met precies wat de modules bij het laden en de meta nodig hebben. Geeft een functie die alles weer opruimt. */
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}/agents#extensie`);
  const metas: Array<{ attrs: Map<string, string>; setAttribute: (k: string, v: string) => void; getAttribute: (k: string) => string | null }> = [];
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
const rust = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
const json = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status, statusText: '', headers: new Headers(), text: async () => JSON.stringify(data) });

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-hub');

  // ================================================================ 1. routering (puur)
  check('mcp.*/agents blijft voor iedereen (geen omleiding, ook #extension/welcome)', [false, true].every((t) => mcpIngang('agents', t) === null && mcpIngang('agents', t, true, true) === null));
  check('mcp.*/verbindingen → hub #technisch (bestaande componenten, adres blijft werken)', JSON.stringify(mcpIngang('verbindingen', true)) === JSON.stringify({ service: 'mcp', tab: 'agents', hash: 'technisch' }) && mcpIngang('verbindingen', false)?.hash === 'technisch');
  check('mcp overview/connect → hub; beheerpagina’s blijven; privé andere tabbladen → hub', mcpIngang('overview', false)?.tab === 'agents' && mcpIngang('connect', true)?.tab === 'agents' && mcpIngang('dashboard', true) === null && mcpIngang('tools', false)?.tab === 'agents' && mcpIngang('tools', true) === null);
  check('ai.*/verbindingen #bord/#connectors/#tech → hub #ai/#connectors/#technisch', aiVerbindingenNaar('') === 'ai' && aiVerbindingenNaar('#bord') === 'ai' && aiVerbindingenNaar('#connectors') === 'connectors' && aiVerbindingenNaar('#tech') === 'technisch');

  const herstel = nepBrowser();
  const vorigeFetch = globalThis.fetch;
  try {
    const { leesHash, koppelVraag, zichtbareTabs, TABS, OUDE_HASH, matrixInvoer } = await import('../../src/agenten/AgentenPagina');
    // ================================================================ 2. tabbladen en oude adressen
    // 20.10.2026: «extern» erbij — de ANDERE richting (vreemde MCP-servers waar de site zelf naartoe gaat,
    // backend/mcp-klant/*). Het blijft dezelfde ÉNE hub van §4: er komt geen pagina bij.
    check('tabbladen volgens §4 (+ extern): overzicht, connectors, ai, extern, extensie, apparaten, tokens, toegang, technisch, journaal',
      TABS.join() === 'overzicht,connectors,ai,extern,extensie,browser,apparaten,tokens,toegang,technisch,journaal');
    check('«Технічне» alleen in de rij met actief technisch profiel', !zichtbareTabs(false).includes('technisch') && zichtbareTabs(true).includes('technisch') && zichtbareTabs(false).includes('extensie'));
    const h = (x: string) => { const p = leesHash(x); return `${p.tab}|${p.item}|${p.oud ? 1 : 0}`; };
    check('#apparaten/extensie → extensie (oud)', h('#apparaten/extensie') === 'extensie||1');
    check('#extension → extensie; #extension/ontgrendelen → extensie/ontgrendelen', h('#extension') === 'extensie||1' && h('#extension/ontgrendelen') === 'extensie|ontgrendelen|1');
    check('#extensie/… → extensie met item (nieuw)', h('#extensie/prive') === 'extensie|prive|0' && h('#extensie') === 'extensie||0');
    check('#dev:<id> → apparaten/dev:<id>', h(`#dev:${AID}`) === `apparaten|dev:${AID}|1`);
    check('#verbindingen en #tech → technisch; #bord → ai; #dostupy → toegang', h('#verbindingen') === 'technisch||1' && h('#tech') === 'technisch||1' && h('#bord') === 'ai||1' && h('#dostupy') === 'toegang||1');
    check('bestaande oude hashes blijven (claude, doors, pair, tools)', h('#claude') === 'ai||1' && h('#doors') === 'tokens||1' && h('#pair') === 'apparaten|koppelen|1' && h('#tools') === 'ai|hulpmiddelen|1' && OUDE_HASH.overview === 'overzicht');
    check('onbekende hash → overzicht', h('#onzin') === 'overzicht||1' && h('') === 'overzicht||0');
    const q = leesHash('#extensie?koppel=prive');
    check('#extensie?koppel=prive: tab extensie, querydeel bewaard', q.tab === 'extensie' && koppelVraag('', q.vraag) === 'prive');
    check('?koppel=prive in de querystring (pop-up 0.6: /agents?koppel=prive#extensie) telt ook; onzin niet', koppelVraag('?koppel=prive', leesHash('#extensie').vraag) === 'prive' && koppelVraag('?koppel=root', new URLSearchParams()) === '' && koppelVraag('', leesHash('#extensie?koppel=technisch').vraag) === 'technisch');

    // ================================================================ 3. matrix «Що через який спосіб»
    const geslotenSlot = { gekoppeld: true, open: null, toegestaan: PRIVE_HOSTS, uit: false };
    const basis: MatrixInvoer = { techProfiel: false, connector: { prive: 0, technisch: 0 }, tokens: { prive: 0, technisch: 0 }, pc: { totaal: 0, metToestemming: 0 }, extPrive: geslotenSlot, extTech: null, lokaal: { open: null, mag: true } };
    const m0 = berekenMatrix(basis);
    check('gewone gebruiker: geen kolommen Адміністрування/Сервер en geen rij «Розширення — технічний»', !m0.kolommen.includes('beheer') && !m0.kolommen.includes('server') && !m0.rijen.some((r) => r.methode === 'ext-technisch'), m0.kolommen.join());
    check('rijen = Конектор, Розширення-користувач, Агент на ПК, Локальний агент, Токен', m0.rijen.map((r) => r.methode).join() === 'connector,ext-prive,pc,lokaal,token');
    const cel = (m: ReturnType<typeof berekenMatrix>, r: string, k: string) => m.rijen.find((x) => x.methode === r)?.cellen[k as 'mail'];
    check('zonder verbindingen: connector → mail ○ (mogelijk na toestemming), pc → mail — (nooit)', cel(m0, 'connector', 'mail') === 'kan' && cel(m0, 'pc', 'mail') === 'nooit' && cel(m0, 'pc', 'apparaten') === 'kan');
    const m1 = berekenMatrix({ ...basis, connector: { prive: 1, technisch: 0 }, pc: { totaal: 1, metToestemming: 1 }, extPrive: { ...geslotenSlot, open: ['mail.tarasevych.com', 'hub.tarasevych.com'] } });
    check('actieve connector: mail/drive/github ✓; apparaten ✓ met pc-toestemming; pagina’s via extensie alleen als het slot open is op die host', cel(m1, 'connector', 'mail') === 'ja' && cel(m1, 'connector', 'github') === 'ja' && cel(m1, 'connector', 'apparaten') === 'ja' && cel(m1, 'connector', 'paginas') === 'kan');
    check('extensie-gebruiker: open op mail/hub → mail, bord, agenda ✓; drive ○; apparaten —', cel(m1, 'ext-prive', 'mail') === 'ja' && cel(m1, 'ext-prive', 'bord') === 'ja' && cel(m1, 'ext-prive', 'agenda') === 'ja' && cel(m1, 'ext-prive', 'drive') === 'kan' && cel(m1, 'ext-prive', 'apparaten') === 'nooit');
    const mt = berekenMatrix({ ...basis, techProfiel: true, connector: { prive: 1, technisch: 1 }, extTech: { gekoppeld: true, open: ['admin.tarasevych.com', 'mcp.tarasevych.com'], toegestaan: ADMIN_HOSTS_TOEGESTAAN, uit: false } });
    check('technisch account: kolommen beheer/server en rij «Розширення — технічний»', mt.kolommen.includes('beheer') && mt.kolommen.includes('server') && mt.rijen.some((r) => r.methode === 'ext-technisch'));
    check('extensie-gebruiker → Адміністрування altijd — (nooit admin.*); technisch slot open op admin → ✓', cel(mt, 'ext-prive', 'beheer') === 'nooit' && cel(mt, 'ext-technisch', 'beheer') === 'ja' && cel(mt, 'ext-technisch', 'server') === 'nooit');
    check('connector: Сервер ✓ alleen met technische verbinding (ruimte uit shared/ai-ruimte TECHNISCH)', cel(mt, 'connector', 'server') === 'ja' && cel(berekenMatrix({ ...basis, techProfiel: true, extTech: { ...geslotenSlot, toegestaan: ADMIN_HOSTS_TOEGESTAAN } }), 'connector', 'server') === 'kan');
    check('beleid «prive uit» → extensie-gebruiker overal —', berekenMatrix({ ...basis, extPrive: { ...geslotenSlot, uit: true } }).rijen.find((r) => r.methode === 'ext-prive')!.cellen.mail === 'nooit');
    const inv = matrixInvoer({ techProfiel: false, oauthPrive: 2, oauthTech: 0, tokensPrive: 0, tokensTech: 0, pcTotaal: 0, pcMetToestemming: 0,
      prive: { staat: 'ontgrendeld', ontgrendeling: { gid: 'g', caps: ['browser.read'], domeinen: ['mail.tarasevych.com'], lokaal: true, ruimte: 'prive', begin: 0, eind: 9e15, rollen: [], bevestigdMet: null }, heeftBrowser: true, rechtPrive: null } as never,
      technisch: { staat: 'niet-gekoppeld', ontgrendeling: null, heeftBrowser: false, rechtPrive: null } as never, beleid: { priveAan: true, lokaalAan: true } });
    check('matrixInvoer: echte status → open domeinen van het privé-slot, lokaal = ontgrendeling met lokaal', JSON.stringify(inv.extPrive.open) === '["mail.tarasevych.com"]' && JSON.stringify(inv.lokaal.open) === '["mail.tarasevych.com"]' && inv.extTech === null && inv.connector.prive === 2);

    // ================================================================ 4. meta mjn-profiel (live, zonder herladen) en de tab «Розширення браузера»
    let techStatus: Record<string, unknown> = { profiel: null, activatie: null, nu: Date.now() };
    let extStatus: Record<string, unknown> = {};
    globalThis.fetch = (async (url: string) => {
      const pad = String(url).split('?')[0];
      if (pad === '/api/owner/tech/status' || pad === '/api/owner/tech/beeindigen' || pad === '/api/owner/tech/activeren') return json(200, techStatus);
      if (pad === '/api/owner/agents/extensie-status') return json(200, extStatus);
      return json(200, {});
    }) as unknown as typeof fetch;
    const store = await import('../../src/tech/tech-opslag');
    const meta = () => (globalThis.document as unknown as { querySelector: (s: string) => { getAttribute: (k: string) => string | null } | null }).querySelector('meta[name="mjn-profiel"]')?.getAttribute('content');
    check('meta mjn-profiel bestaat meteen bij het laden: «gebruiker»', meta() === 'gebruiker', String(meta()));
    const profiel = { userId: 'u1', profielId: 'p1', rollen: ['ontwikkelaar'], maxMinuten: 60, maxNu: 60, band: { kleur: 'rood', patroon: 'streep' }, laatstActief: null };
    techStatus = { profiel, activatie: { id: 'a1', profielId: 'p1', rollen: ['ontwikkelaar'], mogelijkheden: [], reden: 'test', begin: Date.now(), eind: Date.now() + 60 * 60000 }, nu: Date.now() };
    await store.techActiveren(60, 'test test test');
    check('activeren → meta «technisch» (zonder herladen)', meta() === 'technisch');
    techStatus = { profiel, activatie: null, nu: Date.now() };
    await store.techBeeindigen();
    check('beëindigen → meta «gebruiker»', meta() === 'gebruiker');
    techStatus = { profiel, activatie: { id: 'a2', profielId: 'p1', rollen: ['ontwikkelaar'], mogelijkheden: [], reden: 'test', begin: Date.now(), eind: Date.now() + 120 }, nu: Date.now() };
    await store.techVernieuwen();
    check('lopende activering → «technisch»', meta() === 'technisch');
    await new Promise((r) => setTimeout(r, 300));
    check('einde van de activering → meteen «gebruiker» (eigen timer, geen nieuwe status nodig)', meta() === 'gebruiker');

    // HUB-01 (audit 19.10.2026): een 5xx/netwerkfout op /tech/status wist het profiel NIET (de band bleef verdwijnen en de tab zei
    // «немає технічного профілю»); alleen 401/403/404 (geen sessie/recht) zet het profiel op null.
    techStatus = { profiel, activatie: null, nu: Date.now() };
    await store.techVernieuwen();
    check('HUB-01 vooraf: profiel geladen, geen fout', !!store.techToestand().profiel && store.techToestand().fout === null);
    let techHttp = 503;
    const fetchVoorFout = globalThis.fetch;
    globalThis.fetch = (async (url: string) => (String(url).split('?')[0] === '/api/owner/tech/status' ? json(techHttp, { error: 'HTTP_503' }) : fetchVoorFout(url as never))) as unknown as typeof fetch;
    await store.techVernieuwen();
    check('HUB-01: 503 → vorige profiel blijft, fout = netwerk', !!store.techToestand().profiel && store.techToestand().fout === 'netwerk', JSON.stringify({ p: !!store.techToestand().profiel, f: store.techToestand().fout }));
    const { default: TabTechnisch } = await import('../../src/agenten/TabTechnisch');
    const htmlFout = renderToString(createElement(TabTechnisch, { tr: (uk: string) => uk }));
    check('HUB-01: TabTechnisch zegt «сервер недоступний», niet «немає технічного профілю»', htmlFout.includes('data-technisch-poort="activeren"') && !htmlFout.includes('немає технічного профілю'), htmlFout.slice(0, 200));
    techHttp = 403;
    await store.techVernieuwen();
    check('HUB-01: 403 → profiel wél gewist (geen recht), fout leeg', store.techToestand().profiel === null && store.techToestand().fout === null);
    globalThis.fetch = fetchVoorFout;
    check('HUB-01: techFoutReset: alleen 401/403/404', store.techFoutReset({ status: 401 }) && store.techFoutReset({ status: 404 }) && !store.techFoutReset({ status: 500 }) && !store.techFoutReset(new Error('netwerk')));

    // Tab «Розширення браузера» per soort account (render met de echte componenten; extensie-status gemockt in v2-vorm).
    const live = await import('../../src/extensie/extensie-live');
    const { default: TabExtensie } = await import('../../src/agenten/TabExtensie');
    const leegDoc = { hidden: false, addEventListener: () => undefined, removeEventListener: () => undefined };
    const venster = { addEventListener: () => undefined, removeEventListener: () => undefined, postMessage: () => undefined };
    const s = live.maakExtensieLive({ haal: async () => extStatus as never, venster, document: leegDoc, origin: ORIGIN });
    live.zetExtensieLive(s);
    const uit = s.subscribe(() => undefined);
    const priveAgent = { agentId: AID, naam: 'Chrome', ruimte: 'prive', browserId: 'b1', online: true, versie: '0.6.0', staat: 'vergrendeld', ontgrendeling: null, ai: { verbonden: false, agenten: [] }, lokaal: { verbonden: false }, laatstGezien: 1, toestemming: { caps: ['browser.read'], tot: null } };
    const techAgent = { ...priveAgent, agentId: TID, ruimte: 'technisch', toestemming: undefined };
    const rechtPrive = { mag: true, caps: ['browser.read'], maxDagen: 30, domeinen: [...PRIVE_HOSTS], lokaal: true, stapOpGeldig: false };
    const rechtTech = { mag: false, code: 'TECH_NIET_ACTIEF', rollen: ['ontwikkelaar'], caps: ['browser.read'], activatieTot: null, passkeys: 1, maxMinuten: 480 };
    const oud = { magOntgrendelen: false, rollen: [], caps: [], activatieTot: null, passkeys: 0 };
    const tr = (uk: string) => uk;
    const agentRij = (id: string, ruimte: string) => ({ id, name: 'Chrome', platform: 'browser', status: 'connected' as const, lastSeenAt: 1, createdAt: 1, policy: { autoApprove: [] }, enabled: true, armedUntil: null, ruimte });
    const render = (techAgents: unknown[] = []) => renderToString(createElement(TabExtensie, { tr, agents: [agentRij(AID, 'prive')] as never, techAgents: techAgents as never, naActie: async () => undefined, versie: 0, koppel: '' }));
    const TECH = ['data-ext-sectie="technisch"', 'Технічний профіль', 'технічний профіль', 'Passkey', 'data-paneel="extensie-technisch"', 'data-ext-tech-aan', 'data-eo-knop="ontgrendelen"'];
    const techIn = (x: string) => TECH.filter((t) => x.includes(t)).map((t) => `${t} @ …${x.slice(Math.max(0, x.indexOf(t) - 80), x.indexOf(t) + 40)}…`).join(' | ');
    const geenTech = (x: string) => techIn(x) === '';

    // (a) gewone gebruiker
    techStatus = { profiel: null, activatie: null, nu: Date.now() };
    await store.techVernieuwen();
    extStatus = { agenten: [priveAgent], browsers: [], recht: { ...oud, code: 'GEEN_TECH_PROFIEL', prive: rechtPrive, technisch: null }, beleid: {}, beheer: false, nu: Date.now() };
    await s.vernieuw();
    let html = render();
    check('gewone gebruiker: tab met gebruikerssectie «Як користувач» en het installatie-/koppelblok', html.includes('data-ext-sectie="gebruiker"') && html.includes('Як користувач') && html.includes('data-paneel="extensie"'));
    check('gewone gebruiker: slot «як користувач» met «Підтвердити й відкрити доступ» en «Що може ШІ»', html.includes('data-eo-slot="prive"') && html.includes('Підтвердити й відкрити доступ') && html.includes('Що може ШІ'));
    check('gewone gebruiker: GEEN technische elementen (geen sectie, geen passkey, geen «Активувати»)', geenTech(html), techIn(html));
    check('profiel van dit tabblad: «Користувач»', html.includes('data-profiel-tab="gebruiker"') && html.includes('Користувач'));

    // (b) technisch profiel, niet actief in dit tabblad
    techStatus = { profiel, activatie: null, nu: Date.now() };
    await store.techVernieuwen();
    extStatus = { ...extStatus, agenten: [priveAgent, techAgent], recht: { ...oud, prive: rechtPrive, technisch: rechtTech } };
    await s.vernieuw();
    html = render();
    check('tech-profiel zonder activering: sectie «Технічний профіль» met precies één regel + «Активувати»', html.includes('data-ext-sectie="technisch"') && html.includes('data-ext-tech-regel="1"') && html.includes('Активувати') && !html.includes('data-paneel="extensie-technisch"'));
    check('tech-profiel zonder activering: geen passkey-ontgrendeling zichtbaar', !html.includes('Розблокувати з Passkey'));

    // (c) technisch profiel, actief
    techStatus = { profiel, activatie: { id: 'a3', profielId: 'p1', rollen: ['ontwikkelaar'], mogelijkheden: [], reden: 'test', begin: Date.now(), eind: Date.now() + 60 * 60000 }, nu: Date.now() };
    await store.techVernieuwen();
    extStatus = { ...extStatus, recht: { ...oud, magOntgrendelen: true, prive: rechtPrive, technisch: { ...rechtTech, mag: true, code: undefined, activatieTot: Date.now() + 60 * 60000 } } };
    await s.vernieuw();
    html = render([agentRij(TID, 'technisch')]);
    check('actief: beide secties — gebruiker én technisch (koppelen technisch slot + passkey-ontgrendeling)', html.includes('data-ext-sectie="gebruiker"') && html.includes('data-paneel="extensie-technisch"') && html.includes('Розблокувати з Passkey') && html.includes('data-tech-actief="1"'));
    check('actief: profiel van dit tabblad «Технічний»', html.includes('data-profiel-tab="technisch"'));
    uit();
    live.zetExtensieLive(null);

    // ================================================================ 4b. audit 19.10.2026: tellers, zelftest, termijnen, journaal, pollers
    {
      const { aiTeller } = await import('../../src/agenten/gegevens');
      const oauth = [{ clientName: 'Claude', status: 'active' }, { clientName: 'Claude Desktop', status: 'active' }, { clientName: 'Cursor', status: 'active' }, { clientName: 'Grok', status: 'revoked' }];
      const tokens = [{ name: 'Claude code', revokedAt: '', expiresAt: new Date(Date.now() + 864e5).toISOString() }, { name: 'mijn-agent', revokedAt: '', expiresAt: new Date(Date.now() + 864e5).toISOString() }];
      check('HUB-02: één teller «ШІ підключено» = verschillende AI-clients (Claude×2 + Claude-token = 1, Cursor = 1; ingetrokken Grok telt niet)', aiTeller(oauth, tokens) === 2, String(aiTeller(oauth, tokens)));
      const { zelftestWeergave, detailTekst } = await import('../../src/extensie/zelftest');
      const tr = (uk: string) => uk;
      const z = zelftestWeergave({ ok: true, version: '0.6.0', checks: [
        { id: 'prive.paired', ok: true, detail: 'till 2026-11-18' }, { id: 'prive.command_key', ok: true, detail: '' }, { id: 'prive.connected', ok: true, detail: '' }, { id: 'prive.settings', ok: true, detail: 'epoch 3, 5 capabilities' },
        { id: 'prive.unlocked', ok: false, detail: 'locked' }, { id: 'debugger_permission', ok: false, detail: '' }, { id: 'diag_opt_in', ok: false, detail: '' }, { id: 'site_tab', ok: true, detail: 'https://mail.tarasevych.com/inbox' }, { id: 'bridge', ok: true, detail: 'buffer 0' }, { id: 'account', ok: true, detail: 'ok' }, { id: 'profiel', ok: true, detail: 'profiel — gebruiker' },
      ] }, tr, 'mcp.tarasevych.com');
      check('HUB-07: oordeel = verplichte controles (4/4 ok) → «пройдено», informatieve ✗ tellen niet', z.ok && z.verplicht === 4 && z.mislukt === 0 && z.regels.filter((r) => r.soort === 'info').length === 7);
      check('HUB-07: regels uk met slot, geen rauwe sleutels (prive.paired, locked, epoch, profiel — gebruiker)', z.regels.every((r) => !/^[a-z_.]+$/.test(r.tekst)) && z.regels.some((r) => r.tekst === 'як користувач: підключено до облікового запису' && r.detail === 'до 2026-11-18') && z.regels.some((r) => r.id === 'prive.unlocked' && r.detail === 'заблоковано') && z.regels.some((r) => r.id === 'profiel' && r.detail === 'користувач'), JSON.stringify(z.regels.map((r) => [r.tekst, r.detail])));
      check('HUB-07: «відкрита вкладка» = het huidige tabblad, niet mail', z.regels.find((r) => r.id === 'site_tab')?.detail === 'поточна вкладка — mcp.tarasevych.com' && detailTekst('prive.settings', 'epoch 3, 5 capabilities', tr, '') === 'версія налаштувань 3, можливостей: 5');
      const mislukt = zelftestWeergave({ ok: true, checks: [{ id: 'prive.paired', ok: true }, { id: 'prive.connected', ok: false, detail: 'ws closed' }] }, tr, 'x');
      check('HUB-07: extensie zegt ok maar een verplichte controle faalt → «не пройдено»', !mislukt.ok && mislukt.mislukt === 1);
      const { restTijd, ONBEPAALD_MS } = await import('../../src/agenten/toegang/model');
      check('HUB-09: 36495 dagen → «безстроково», 3 dagen blijft «ще 3 дн.»', restTijd(Date.now() + 36495 * 864e5)[0] === 'безстроково' && restTijd(Date.now() + 3 * 864e5)[0] === 'ще 3 дн.' && ONBEPAALD_MS > 9 * 365 * 864e5);
      const { zin } = await import('../../src/agenten/Journaal');
      const item = (actie: string, details: Record<string, unknown>) => ({ id: 'x', at: 0, actie, soort: 'toegang', resultaat: 'success', onderwerp: null, details, ipHash: null, apparaat: null, dienst: null });
      check('HUB-10: open activering → «до виходу з облікового запису», nooit «на  хв»', zin(item('owner.tech.geactiveerd', { minuten: null, modus: 'tot-uitloggen', reden: 'werk' }) as never, tr) === 'Увімкнено технічний профіль до виходу з облікового запису: werk');
      check('HUB-10: geerfd/gedeeld en owner.extensie.* in gewone taal', zin(item('owner.tech.geerfd', { modus: 'tot-uitloggen' }) as never, tr).startsWith('Технічний профіль успадковано') && zin(item('owner.extensie.ontgrendeld', { ruimte: 'prive', dagen: 7, caps: ['browser.read'] }) as never, tr) === 'Відкрито доступ розширення (як користувач) на 7 дн.: читання сторінок' && zin(item('owner.extensie.ingetrokken', { ruimte: 'technisch', reden: 'tech-einde' }) as never, tr).includes('технічний профіль завершився') && !/owner\.|geerfd/.test(zin(item('owner.extensie.beheer.bekeken', { gebruikers: 3 }) as never, tr)));
      const { maakGedeeldePoller, agentOvergangen, AGENTS_POLL_MS } = await import('../../src/agenten-gegevens');
      let n = 0;
      const poller = maakGedeeldePoller(async () => ++n, AGENTS_POLL_MS);
      const u1 = poller.subscribe(() => undefined), u2 = poller.subscribe(() => undefined), u3 = poller.subscribe(() => undefined);
      await new Promise((r) => setTimeout(r, 20));
      check('HUB-04: drie abonnees → één verzoek en één timer (≥ 10 s)', n === 1 && poller.info().luisteraars === 3 && poller.info().actief && AGENTS_POLL_MS >= 10_000, JSON.stringify({ n, info: poller.info() }));
      u1(); u2(); u3();
      check('HUB-04: laatste abonnee weg → timer gestopt', !poller.info().actief);
      const voor = new Map([['a', 'disconnected'], ['b', 'connected']]);
      const agents = [{ id: 'a', name: 'Chrome', status: 'connected' }, { id: 'b', name: 'PC', status: 'connected' }, { id: 'c', name: 'nieuw', status: 'connected' }] as never;
      check('HUB-04: toast «підключився» alleen bij een echte overgang (a), niet bij ongewijzigd (b) of onbekend (c); nooit zonder vorige meting', agentOvergangen(voor, agents).map((x) => x.agent.id).join() === 'a' && agentOvergangen(null, agents).length === 0);
    }

    // ================================================================ 5. bronnen: zijbalk en doorverwijzingen
    const menu = readFileSync('src/menu-voorkeuren.tsx', 'utf8'), app = readFileSync('src/VerenigdDienstApp.tsx', 'utf8'), ai = readFileSync('src/AIDienstWeergave.tsx', 'utf8'), mcp = readFileSync('src/McpDienstWeergave.tsx', 'utf8');
    check('zijbalk «Міст ШІ → сайт» wijst naar de hub (agents), niet meer naar verbindingen', menu.includes("{id:'mcp',uk:'Міст ШІ → сайт',nl:'Brug AI → site',icon:'cable',target:'mcp',tab:'agents'}"));
    check('mcp-tab agents heet «Підключення ШІ»; Технічні підключення blijft (doorverwijzing)', app.includes("{id:'agents',label:tr('Підключення ШІ','AI-koppelingen')}") && app.includes("{id:'verbindingen',label:tr('Технічні підключення','Technische verbindingen')}"));
    check('ai.*/verbindingen leidt naar de hub (location.replace), VerbindingenHub-bestand blijft bestaan', /function NaarHub/.test(ai) && ai.includes('location.replace(doel)') && readFileSync('src/agenten/VerbindingenHub.tsx', 'utf8').length > 100);
    check('mcp.*/agents toont altijd de hub; ExtensieTechAanbod blokkeert niets meer', mcp.includes('<McpAgentsHub tr={t} />') && !mcp.includes('<ExtensieTechAanbod'));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    globalThis.fetch = vorigeFetch;
    herstel();
  }
  return einde();
}
