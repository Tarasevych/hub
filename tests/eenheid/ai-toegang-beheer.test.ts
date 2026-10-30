// Tab «Доступи» op de hub (contract 0.6 §3/§4, src/agenten/TabToegang.tsx + src/agenten/toegang/*). Render met react-dom/server en
// een gemockte fetch (vormen uit contract §3/§4; X2 levert de echte server):
//  - een gewone gebruiker ziet NOOIT «Усі користувачі» (ook niet als er nog beheergegevens in het geheugen staan);
//  - de eigenaar / een activering met users.manage ziet het, met beleid, sloten en lopende ontgrendelingen;
//  - Відкликати / Продовжити / Обмежити roepen het juiste endpoint en werken de lijst bij zonder herladen;
//  - geen innerHTML / dangerouslySetInnerHTML; elke optie heeft data-hulp + «?» uit het hulp-register.
import { readdirSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { tags, isBediening } from './hulp-register.test';
import { hulpGebreken, hulpSleutels, hulpVan } from '../../shared/hulp-register';

const ORIGIN = 'https://mcp.tarasevych.com';
const PC = 'aaaaaaaa-0000-4000-8000-000000000001';
const AP = 'aaaaaaaa-0000-4000-8000-000000000002'; // browser, slot prive (ontgrendeld, met lokale agent)
const AT = 'aaaaaaaa-0000-4000-8000-000000000003'; // browser, slot technisch (ontgrendeld)
const AL = 'aaaaaaaa-0000-4000-8000-000000000004'; // browser, slot prive (vergrendeld, wel toestemmingen)

function nepBrowser() {
  const g = globalThis as Record<string, unknown>;
  if (g.window) return;
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}/agents#toegang`);
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  if (!g.document) g.document = { hidden: false, title: '', cookie: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null };
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
}

type Verzoek = { method: string; pad: string; body: Record<string, unknown> | null; query: URLSearchParams };

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-toegang-beheer');
  nepBrowser();
  const nu = Date.now();
  const DAG = 86_400_000;

  // ---------------------------------------------------------------- nepserver (vormen uit contract §3/§4 en de bestaande routes)
  const verzoeken: Verzoek[] = [];
  const S = {
    oauth: [
      { id: 'o1', clientId: 'c1', clientName: 'Claude', scope: 'mcp:read mcp:tools', createdAt: nu - 5 * DAG, lastUsedAt: nu - 60_000, expiresAt: nu + 30 * DAG, accessExpiresAt: nu + 3600_000, revokedAt: null, status: 'active', ruimte: 'prive' },
      { id: 'o2', clientId: 'c2', clientName: 'Grok', scope: 'mcp:read', createdAt: nu - 9 * DAG, lastUsedAt: null, expiresAt: nu + DAG, accessExpiresAt: 0, revokedAt: nu - DAG, status: 'revoked', ruimte: 'prive' },
    ] as Array<Record<string, unknown>>,
    tokens: [{ id: 't1', name: 'cursor', prefix: 'mr_ab12', scopes: ['mcp:read'], createdAt: new Date(nu - DAG).toISOString(), expiresAt: new Date(nu + 7 * DAG).toISOString(), revokedAt: '', calls: 3, lastSeenAt: '', ruimte: 'prive' }] as Array<Record<string, unknown>>,
    agents: [
      { id: PC, name: 'Werk-pc', platform: 'win32', status: 'connected', ruimte: 'prive', lastSeenAt: nu, createdAt: nu - DAG, policy: { autoApprove: [] } },
      { id: AP, name: 'Chrome (Win32)', platform: 'browser', status: 'connected', ruimte: 'prive', lastSeenAt: nu, createdAt: nu - DAG, policy: { autoApprove: [] } },
      { id: AT, name: 'Chrome (Win32)', platform: 'browser', status: 'connected', ruimte: 'technisch', lastSeenAt: nu, createdAt: nu - DAG, policy: { autoApprove: [] } },
      { id: AL, name: 'Edge', platform: 'browser', status: 'disconnected', ruimte: 'prive', lastSeenAt: nu - DAG, createdAt: nu - DAG, policy: { autoApprove: [] } },
    ],
    grants: [
      { id: 'g1', agentId: PC, capability: 'machine.read', domains: [], always: false, preset: null, grantedAt: nu - 1000, expiresAt: nu + DAG, revokedAt: null },
      { id: 'g2', agentId: AL, capability: 'browser.read', domains: ['mail.tarasevych.com'], always: false, preset: null, grantedAt: nu - 1000, expiresAt: nu + 2 * DAG, revokedAt: null },
      { id: 'g3', agentId: AP, capability: 'browser.navigate', domains: [], always: false, preset: null, grantedAt: nu - 1000, expiresAt: nu + 2 * DAG, revokedAt: null },
    ] as Array<Record<string, unknown>>,
    sloten: [
      { agentId: AP, naam: 'Chrome (Win32)', ruimte: 'prive', online: true, versie: '0.6.0', staat: 'ontgrendeld', ontgrendeling: { gid: 'gp', caps: ['browser.read', 'browser.navigate'], domeinen: ['mail.tarasevych.com', 'hub.tarasevych.com'], lokaal: true, begin: nu - 1000, eind: nu + 2 * DAG, rollen: [] }, ai: { verbonden: false, agenten: [] }, lokaal: { verbonden: true }, laatstGezien: nu },
      { agentId: AT, naam: 'Chrome (Win32)', ruimte: 'technisch', online: true, versie: '0.6.0', staat: 'ontgrendeld', ontgrendeling: { gid: 'gt', caps: ['browser.read', 'browser.debug'], domeinen: ['admin.tarasevych.com', 'mcp.tarasevych.com'], lokaal: false, begin: nu - 1000, eind: nu + 3600_000, rollen: ['ontwikkelaar'] }, ai: { verbonden: true, agenten: [{ naam: 'Claude', laatst: nu }] }, lokaal: { verbonden: false }, laatstGezien: nu },
      { agentId: AL, naam: 'Edge', ruimte: 'prive', online: false, versie: '0.6.0', staat: 'vergrendeld', ontgrendeling: null, ai: { verbonden: false, agenten: [] }, lokaal: { verbonden: false }, laatstGezien: nu - DAG },
    ] as Array<Record<string, unknown>>,
    recht: { prive: { mag: true, caps: ['browser.read', 'browser.navigate'], maxDagen: 7 }, technisch: { mag: true, rollen: ['ontwikkelaar'], caps: ['browser.read', 'browser.debug'], activatieTot: nu + 50 * 60_000, passkeys: 1 } } as Record<string, unknown>,
    tech: { profiel: null, activatie: null } as Record<string, unknown>,
    beheerStatus: 200,
    gebruikers: [
      { userId: 'u-eig', email: 'eigenaar@test.invalid', naam: 'Eigenaar', techProfiel: true, eigenaar: true, beleid: { priveAan: true, technischAan: true, priveCaps: null, technischCaps: null, priveMaxDagen: 30, technischMaxMinuten: 480, lokaalAan: true, notitie: '', gewijzigdDoor: '', gewijzigdOp: null }, browsers: [] },
      { userId: 'u-anna', email: 'anna@test.invalid', naam: 'Anna', techProfiel: false, beleid: { prive_aan: true, technisch_aan: false, prive_caps: ['browser.read', 'browser.navigate'], technisch_caps: null, prive_max_dagen: 7, technisch_max_minuten: 60, lokaal_aan: false, notitie: 'stagiair', gewijzigd_door: 'eigenaar@test.invalid', gewijzigd_op: new Date(nu - DAG).toISOString() },
        browsers: [{ agentId: 'b-anna', naam: 'Firefox', ruimte: 'prive', online: true, versie: '0.6.0', ontgrendeling: { gid: 'ga', caps: ['browser.read'], domeinen: ['mail.tarasevych.com'], lokaal: false, begin: nu - 1000, eind: nu + DAG } }] },
      { userId: 'u-bob', email: 'bob@test.invalid', naam: 'Bob', techProfiel: true, beleid: {}, browsers: [{ agentId: 'b-bob', naam: 'Chrome', ruimte: 'technisch', online: false, versie: '0.6.0', ontgrendeling: null }] },
    ] as Array<Record<string, any>>,
  };
  const json = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status, statusText: '', headers: new Headers(), text: async () => JSON.stringify(data) });
  const vorigeFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(init.body) : null;
    const [pad, qs = ''] = String(url).split('?');
    verzoeken.push({ method, pad, body, query: new URLSearchParams(qs) });
    if (pad === '/api/owner/tech/status') return json(200, { ...S.tech, nu: Date.now() });
    if (pad === '/api/owner/agents/overzicht') return json(200, { oauth: S.oauth, losgekoppeld: [], toestemmingen: {}, mcpUrl: '', now: nu });
    if (pad === '/api/mcp/tokens/list') return json(200, { tokens: S.tokens });
    if (pad === '/api/owner/agents/list') return json(200, { agents: S.agents, pending: [], last: [] });
    if (pad === '/api/owner/ai/grants/list') return json(200, { settings: { blocked: false, epoch: 1 }, grants: S.grants, catalog: { destructive: [], presets: {}, limits: { maxDays: 90, alwaysDefaultDays: 30 } } });
    if (pad === '/api/owner/agents/extensie-status') return json(200, { agenten: S.sloten, recht: S.recht, nu: Date.now() });
    if (pad.startsWith('/api/owner/mcp-connector/grants/') && pad.endsWith('/revoke')) { const id = decodeURIComponent(pad.split('/')[5]); S.oauth = S.oauth.map((g) => (g.id === id ? { ...g, status: 'revoked', revokedAt: Date.now() } : g)); return json(200, { ok: true }); }
    if (pad === '/api/mcp/tokens/revoke') { S.tokens = S.tokens.map((t) => (t.id === body?.id ? { ...t, revokedAt: new Date().toISOString() } : t)); return json(200, { ok: true }); }
    if (pad === '/api/owner/ai/grants/revoke') { S.grants = S.grants.filter((g) => g.agentId !== body?.agentId); return json(200, { ok: true }); }
    if (pad === '/api/owner/agents/ontgrendeling/intrekken') { S.sloten = S.sloten.map((s) => (s.agentId === body?.agentId ? { ...s, ontgrendeling: null, staat: 'vergrendeld' } : s)); return json(200, { ok: true, ingetrokken: 1 }); }
    if (pad === '/api/owner/agents/ontgrendeling/prive') {
      const o = { gid: `gp-${verzoeken.length}`, caps: ['browser.read', 'browser.navigate'], domeinen: (body?.domeinen as string[]) ?? ['hub.tarasevych.com'], lokaal: body?.lokaal === true, begin: Date.now(), eind: Date.now() + Number(body?.dagen ?? 1) * DAG, rollen: [] };
      S.sloten = S.sloten.map((s) => (s.agentId === body?.agentId ? { ...s, ontgrendeling: o, staat: 'ontgrendeld' } : s));
      return json(200, { ontgrendeling: o, verzonden: true });
    }
    if (pad === '/api/owner/agents/extensie-beheer') return S.beheerStatus === 200 ? json(200, { gebruikers: S.gebruikers }) : json(S.beheerStatus, { error: 'USERS_MANAGE_REQUIRED' });
    if (pad === '/api/owner/agents/extensie-beheer/intrekken') {
      S.gebruikers = S.gebruikers.map((u) => (u.userId === body?.userId ? { ...u, browsers: u.browsers.map((b: Record<string, unknown>) => ((!body?.agentId || b.agentId === body.agentId) ? { ...b, ontgrendeling: null } : b)) } : u));
      return json(200, { ok: true, ingetrokken: 1 });
    }
    if (pad === '/api/owner/agents/extensie-beheer/verlengen') return json(200, { ontgrendeling: { gid: body?.gid, caps: ['browser.read'], domeinen: ['mail.tarasevych.com'], lokaal: false, begin: nu, eind: nu + Number(body?.dagen ?? 1) * DAG + DAG } });
    if (pad === '/api/owner/agents/extensie-beheer/beleid') {
      if (body?.userId === 'u-eig') return json(403, { error: 'EIGENAAR_BESCHERMD' });
      S.gebruikers = S.gebruikers.map((u) => (u.userId === body?.userId ? { ...u, beleid: { ...body } } : u));
      return json(200, { beleid: { ...body, gewijzigdDoor: 'beheerder@test.invalid', gewijzigdOp: Date.now() } });
    }
    return json(404, { error: 'NOT_FOUND' });
  }) as unknown as typeof fetch;

  const rust = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
  try {
    const model = await import('../../src/agenten/toegang/model');
    const bron = await import('../../src/agenten/toegang/bron');
    const { techVernieuwen } = await import('../../src/tech/tech-opslag');
    const { default: TabToegang } = await import('../../src/agenten/TabToegang');
    const { Venster } = await import('../../src/agenten/toegang/delen');
    const techCalls: unknown[] = [];
    let techAntwoord: { ok: true } | { ok: false; code: string; uk: string; nl: string } = { ok: true };
    bron.zetToegangDeps({ techOntgrendel: async (inv) => { techCalls.push(inv); return techAntwoord; } });
    const tr = (uk: string) => uk;
    const html = () => renderToString(createElement(TabToegang, { tr }));
    const na = (n: number) => verzoeken.slice(n).filter((v) => v.method === 'POST');

    // ================================================================ 1. model
    {
      const e = model.normExtStatus({ agenten: S.sloten, recht: S.recht, nu });
      check('model: extensie-status 0.6 → drie sloten met ruimte', e.sloten.length === 3 && e.sloten.filter((s) => s.ruimte === 'technisch').length === 1 && e.recht.prive.maxDagen === 7 && e.recht.technisch?.rollen[0] === 'ontwikkelaar');
      const geneste = model.normExtStatus({ browsers: [{ naam: 'Chrome', sloten: { prive: { agentId: AP, ruimte: 'prive' }, technisch: { agentId: AT, ruimte: 'technisch' } } }], recht: { prive: { mag: false, code: 'GEEN_BROWSER_RECHTEN' }, technisch: null } });
      check('model: ook browsers[].sloten-vorm; technisch null = geen tech-profiel', geneste.sloten.length === 2 && geneste.sloten[0].naam === 'Chrome' && geneste.recht.technisch === null && geneste.recht.prive.code === 'GEEN_BROWSER_RECHTEN');
      const oud = model.normExtStatus({ agenten: [{ agentId: AT, naam: 'x' }], recht: { magOntgrendelen: true, rollen: ['tester'], caps: ['browser.read'], activatieTot: nu, passkeys: 1 } });
      check('model: 0.5-vorm (recht.magOntgrendelen) → technisch recht', oud.recht.technisch?.mag === true && oud.recht.technisch.rollen[0] === 'tester');
      const vreemd = model.normOntgrendeling({ gid: 'x', caps: ['browser.read', 'browser.root', 7], domeinen: ['MAIL.tarasevych.com', '<img src=x>'], eind: nu + 1 });
      check('model: onbekende caps en ongeldige hosts vallen weg', JSON.stringify(vreemd?.caps) === '["browser.read"]' && JSON.stringify(vreemd?.domeinen) === '["mail.tarasevych.com"]');
      const b = model.normBeleid({ prive_aan: false, technisch_max_minuten: 9999, prive_caps: ['browser.read', 'x'] });
      check('model: beleid snake_case → camelCase, 9999 min blijft (plafond 366 d), onbekende caps weg', !b.priveAan && b.technischMaxMinuten === 9999 && JSON.stringify(b.priveCaps) === '["browser.read"]' && b.technischCaps === null);
      check('model: restTijd «ще 2 год 5 хв» / verlopen', model.restTijd(nu + 125 * 60_000, nu)[0] === 'ще 2 год 5 хв' && model.restTijd(nu - 1, nu)[0] === 'закінчився');
    }

    // ================================================================ 2. gewone gebruiker: nooit «Усі користувачі»
    await techVernieuwen();
    await bron.laadMijn();
    let h = html();
    check('gewone gebruiker: «Мої доступи» zichtbaar', h.includes('Мої доступи') && h.includes('data-tg-mijn'));
    check('gewone gebruiker: «Усі користувачі» niet gerenderd (geen data-tg-beheer)', !h.includes('Усі користувачі') && !h.includes('data-tg-beheer'));
    check('gewone gebruiker: route extensie-beheer nooit aangeroepen', !verzoeken.some((v) => v.pad.startsWith('/api/owner/agents/extensie-beheer')));
    check('uitleg bovenaan (2 zinnen) + «?» toegang.overzicht', h.includes('Тут зібрано все, що ви дозволили ШІ') && /Будь-що можна одразу відкликати/.test(h) && h.includes('tech-vraag-knop'));
    check('aria-live voor uitkomsten; geen tabellen (kaarten)', /aria-live="polite"/.test(h) && !h.includes('<table'));

    // tech-modus zonder users.manage (bijv. tester) → ook niet
    S.tech = { profiel: { userId: 'u-t', profielId: 'p', rollen: ['tester'], maxMinuten: 480, maxNu: 480, band: { kleur: 'amber', patroon: 'geen' }, laatstActief: null }, activatie: { id: 'a', profielId: 'p', rollen: ['tester'], mogelijkheden: ['diagnose.lezen', 'flags.test', 'testruimtes'], reden: 'x', begin: nu, eind: nu + 3600_000 } };
    await techVernieuwen();
    check('tech-modus zonder users.manage: «Усі користувачі» niet gerenderd', !html().includes('data-tg-beheer'));

    // ================================================================ 3. «Мої доступи»: alle methoden, wat/waar/tot
    h = html();
    const rij = (sleutel: string) => new RegExp(`data-tg-rij="${sleutel.replace(/[.:]/g, (c) => `\\${c}`)}"`).test(h);
    check('connector (actief) zichtbaar, ingetrokken connector niet', rij('oauth:o1') && !rij('oauth:o2'));
    check('token, pc-agent met toestemmingen, extensie prive + technisch, lokale agent, vergrendelde browser', rij('token:t1') && rij(`apparaat:${PC}`) && rij(`extensie:${AP}`) && rij(`extensie:${AT}`) && rij(`lokaal:${AP}`) && rij(`extensie:${AL}`));
    check('caps in mensentaal + domeinen + methode', h.includes('читати сторінки') && h.includes('відкривати сторінки') && h.includes('mail.tarasevych.com') && h.includes('Розширення браузера') && h.includes('читати файли й стан пристрою'));
    check('aftellen: «ще 2 дн.» en exact tijdstip als title', h.includes('ще 2 дн.') && /<time class="tg-tijd[^"]*" dateTime="[^"]+" title="/.test(h));
    check('profiel per slot: Користувач / Технічний', /data-ruimte="technisch"/.test(h) && h.includes('>Технічний<') && h.includes('>Користувач<'));
    check('vergrendelde browser: badge «Заблоковано» + «Відкрити доступ»', h.includes('data-badge="dicht"') && h.includes('Відкрити доступ'));
    check('elke rij heeft Відкликати / Продовжити / Обмежити', [`oauth:o1`, 'token:t1', `apparaat:${PC}`, `extensie:${AP}`, `extensie:${AT}`].every((k) => h.includes(`data-knop="tg-intrekken:${k}"`) && h.includes(`data-knop="tg-verleng:${k}"`) && h.includes(`data-knop="tg-beperk:${k}"`)));
    check('connector: Продовжити/Обмежити leiden naar «Підключені ШІ» (bestaande «Доступ ШІ»)', h.includes('href="#ai/oauth:o1"'));

    // ================================================================ 4. Відкликати: juist endpoint + lijst meteen bijgewerkt
    const rijen = () => bron.rijenVan(bron.mijnToegang());
    const vind = (k: string) => rijen().find((r) => r.sleutel === k)!;
    let n = verzoeken.length;
    await bron.intrekken(vind('oauth:o1'));
    h = html();
    check('connector intrekken → POST /api/owner/mcp-connector/grants/o1/revoke', na(n)[0]?.pad === '/api/owner/mcp-connector/grants/o1/revoke');
    check('connector intrekken → rij meteen weg (zonder herladen)', !h.includes('data-tg-rij="oauth:o1"'));
    n = verzoeken.length;
    await bron.intrekken(vind('token:t1'));
    check('token intrekken → POST /api/mcp/tokens/revoke {id}', na(n)[0]?.pad === '/api/mcp/tokens/revoke' && na(n)[0]?.body?.id === 't1' && !html().includes('data-tg-rij="token:t1"'));
    n = verzoeken.length;
    await bron.intrekken(vind(`apparaat:${PC}`));
    check('pc-agent intrekken → POST /api/owner/ai/grants/revoke {agentId}', na(n)[0]?.pad === '/api/owner/ai/grants/revoke' && na(n)[0]?.body?.agentId === PC && !html().includes(`data-tg-rij="apparaat:${PC}"`));
    n = verzoeken.length;
    await bron.intrekken(vind(`extensie:${AT}`));
    const ir = na(n)[0];
    check('extensie (technisch) intrekken → POST /api/owner/agents/ontgrendeling/intrekken {agentId, gid} met tabContext', ir?.pad === '/api/owner/agents/ontgrendeling/intrekken' && ir.body?.agentId === AT && ir.body?.gid === 'gt' && typeof ir.body?.tabContext === 'string');
    check('extensie intrekken → rij meteen weg', !html().includes(`data-tg-rij="extensie:${AT}"`));
    await rust();
    check('na intrekken: rustig opnieuw bij de server gevraagd (lijst blijft consistent)', verzoeken.slice(n).some((v) => v.pad === '/api/owner/agents/extensie-status') && !bron.rijenVan(bron.mijnToegang()).some((r) => r.sleutel === `extensie:${AT}`));

    // ================================================================ 5. Продовжити (met bevestiging) en Обмежити (intrekken + opnieuw)
    n = verzoeken.length;
    await bron.heropenen({ agentId: AL, ruimte: 'prive', domeinen: ['mail.tarasevych.com'], lokaal: false, dagen: 7 });
    const pv = na(n)[0];
    check('privé heropenen → POST /api/owner/agents/ontgrendeling/prive {agentId, dagen, domeinen}', pv?.pad === '/api/owner/agents/ontgrendeling/prive' && pv.body?.agentId === AL && pv.body?.dagen === 7 && JSON.stringify(pv.body?.domeinen) === '["mail.tarasevych.com"]');
    h = html();
    check('privé heropenen → browser meteen «open» (geen badge vergrendeld meer)', h.includes(`data-tg-rij="extensie:${AL}"`) && !/data-tg-rij="extensie:aaaaaaaa-0000-4000-8000-000000000004"[^>]*is-dicht|is-dicht[^>]*data-tg-rij="extensie:aaaaaaaa-0000-4000-8000-000000000004"/.test(h));
    await bron.heropenen({ agentId: AT, ruimte: 'technisch', domeinen: ['admin.tarasevych.com'], lokaal: false, minuten: 30 });
    check('technisch heropenen → passkey-ontgrendeling (uitdaging + passkey) met minuten', techCalls.length === 1 && (techCalls[0] as { minuten?: number }).minuten === 30);
    techAntwoord = { ok: false, code: 'TECH_NIET_ACTIEF', uk: 'Технічний профіль не активний.', nl: 'Niet actief.' };
    let fout: unknown = null;
    try { await bron.heropenen({ agentId: AT, ruimte: 'technisch', domeinen: ['admin.tarasevych.com'], lokaal: false, minuten: 30 }); } catch (e) { fout = e; }
    check('technisch geweigerd → ToegangFout met uitleg (niets geopend)', fout instanceof bron.ToegangFout && (fout as InstanceType<typeof bron.ToegangFout>).code === 'TECH_NIET_ACTIEF');
    techAntwoord = { ok: true };
    n = verzoeken.length;
    const uitkomst = await bron.beperken(vind(`extensie:${AP}`), { domeinen: ['mail.tarasevych.com', 'evil.example'], lokaal: false, dagen: 1 });
    const bp = na(n).map((v) => v.pad).filter((p) => p.includes('/ontgrendeling')); // achtergrond-herladen telt niet
    check('Обмежити → eerst intrekken, dan opnieuw (privé) — in die volgorde', uitkomst === 'heropend' && bp[0] === '/api/owner/agents/ontgrendeling/intrekken' && bp[1] === '/api/owner/agents/ontgrendeling/prive', bp.join(' '));
    const pb = na(n).find((v) => v.pad === '/api/owner/agents/ontgrendeling/prive')?.body;
    check('Обмежити → alleen deelverzameling van de huidige domeinen, lokale agent uit', JSON.stringify(pb?.domeinen) === '["mail.tarasevych.com"]' && pb?.lokaal === false);
    let leeg: unknown = null;
    try { await bron.beperken(vind(`extensie:${AP}`), { domeinen: [], lokaal: false, dagen: 1 }); } catch (e) { leeg = e; }
    check('Обмежити zonder domeinen → geweigerd vóór intrekken', leeg instanceof bron.ToegangFout);

    // ================================================================ 6. eigenaar / users.manage: «Усі користувачі»
    S.tech = { profiel: { userId: 'u-eig', profielId: 'p', rollen: ['eigenaar'], maxMinuten: 480, maxNu: 480, band: { kleur: 'amber', patroon: 'geen' }, laatstActief: null }, activatie: { id: 'a', profielId: 'p', rollen: ['eigenaar'], mogelijkheden: ['diagnose.lezen', 'users.manage', 'roles.delegate'], reden: 'x', begin: nu, eind: nu + 3600_000 } };
    await techVernieuwen();
    n = verzoeken.length;
    await bron.laadBeheer();
    const gb = verzoeken.slice(n).find((v) => v.pad === '/api/owner/agents/extensie-beheer');
    check('beheer: GET /api/owner/agents/extensie-beheer met sessievelden in de query', gb?.method === 'GET' && gb.query.get('service') === 'mcp' && !!gb.query.get('tabContext'));
    h = html();
    check('eigenaar: «Усі користувачі» zichtbaar met gebruikers', h.includes('data-tg-beheer') && h.includes('Усі користувачі') && h.includes('anna@test.invalid') && h.includes('bob@test.invalid'));
    check('beheer: tech-profiel ja/nee per gebruiker', /data-tech-profiel="0"/.test(h) && /data-tech-profiel="1"/.test(h));
    check('beheer: slot + lopende ontgrendeling (caps, domeinen, aftellen) en knoppen', h.includes('data-tg-slot="b-anna"') && h.includes('data-knop="tg-beheer-intrekken:b-anna"') && h.includes('data-knop="tg-beheer-verleng:b-anna"') && (h.includes('ще 1 дн.') || h.includes('ще 24 год')));
    check('beheer: beleid met vinkjes per ruimte, max dagen/minuten, lokaal, notitie, Зберегти', ['toegang.beleid.prive-aan', 'toegang.beleid.technisch-aan', 'toegang.beleid.prive-caps', 'toegang.beleid.technisch-caps', 'toegang.beleid.max-dagen', 'toegang.beleid.max-minuten', 'toegang.beleid.lokaal', 'toegang.beleid.notitie'].every((k) => h.includes(`data-hulp="${k}"`)) && h.includes('data-knop="tg-beleid-bewaar:u-anna"') && h.includes('stagiair'));
    check('beheer: zoeken + filter', h.includes('data-tg-zoek') && h.includes('data-tg-filter'));
    check('beheer: filter «з відкритим доступом» / zoeken op e-mail', model.filterGebruikers(bron.beheerToegang().gebruikers, '', 'open').map((u) => u.userId).join() === 'u-anna' && model.filterGebruikers(bron.beheerToegang().gebruikers, 'BOB@', 'alle').length === 1);
    check('eigenaar ziet het eigen account niet als beschermd', !h.includes('data-tg-beschermd'));

    // ander met users.manage (beheerder): eigenaarsaccount beschermd in de UI
    S.tech = { ...S.tech, activatie: { ...(S.tech.activatie as object), rollen: ['beheerder'], mogelijkheden: ['users.manage'] } };
    await techVernieuwen();
    h = html();
    check('beheerder (users.manage) ziet de sectie ook', h.includes('data-tg-beheer'));
    check('beheerder: eigenaarsaccount beschermd (uitleg, Зберегти uit)', h.includes('data-tg-beschermd') && /<button[^>]*disabled=""[^>]*data-knop="tg-beleid-bewaar:u-eig"/.test(h));
    let beschermdFout: unknown = null;
    try { await bron.beheerBeleid('u-eig', model.STANDAARD_BELEID); } catch (e) { beschermdFout = e; }
    const { tgFout } = await import('../../src/agenten/toegang/delen');
    check('server weigert eigenaarsbeleid → UI-tekst «лише сам власник»', !!beschermdFout && tgFout(beschermdFout, tr, ['x', 'x']).includes('лише сам власник'));

    // acties beheer
    n = verzoeken.length;
    await bron.beheerIntrekken('u-anna', { agentId: 'b-anna', ruimte: 'prive' });
    const bi = na(n)[0];
    check('beheer intrekken → POST …/extensie-beheer/intrekken {userId, agentId, ruimte}', bi?.pad === '/api/owner/agents/extensie-beheer/intrekken' && bi.body?.userId === 'u-anna' && bi.body?.agentId === 'b-anna' && bi.body?.ruimte === 'prive');
    check('beheer intrekken → meteen dicht in de lijst (zonder herladen)', html().includes('Доступ закрито') && !html().includes('data-knop="tg-beheer-intrekken:b-anna"'));
    S.gebruikers[1].browsers[0].ontgrendeling = { gid: 'ga2', caps: ['browser.read'], domeinen: ['mail.tarasevych.com'], lokaal: false, begin: nu, eind: nu + DAG };
    await bron.laadBeheer();
    n = verzoeken.length;
    await bron.beheerVerlengen('ga2', { dagen: 7 });
    check('beheer verlengen → POST …/extensie-beheer/verlengen {gid, dagen}', na(n)[0]?.pad === '/api/owner/agents/extensie-beheer/verlengen' && na(n)[0]?.body?.gid === 'ga2' && na(n)[0]?.body?.dagen === 7);
    n = verzoeken.length;
    const nieuw = await bron.beheerBeleid('u-anna', { ...model.STANDAARD_BELEID, priveAan: false, priveCaps: ['browser.read'], technischMaxMinuten: 60, notitie: 'pauze' });
    const bb = na(n)[0];
    check('beleid opslaan → POST …/extensie-beheer/beleid {userId, priveAan, priveCaps, …, notitie}', bb?.pad === '/api/owner/agents/extensie-beheer/beleid' && bb.body?.userId === 'u-anna' && bb.body?.priveAan === false && JSON.stringify(bb.body?.priveCaps) === '["browser.read"]' && bb.body?.technischMaxMinuten === 60 && bb.body?.notitie === 'pauze');
    check('beleid opslaan → lijst meteen bijgewerkt (door, op)', !nieuw.priveAan && bron.beheerToegang().gebruikers.find((u) => u.userId === 'u-anna')?.beleid.gewijzigdDoor === 'beheerder@test.invalid');

    // bevestigingsvenster
    const v = renderToString(createElement(Venster, { titel: 'Відкликати чужий доступ?', ja: 'Так, відкликати', nee: 'Скасувати', onJa: () => undefined, onNee: () => undefined, children: 'x', data: 'beheer-intrekken' }));
    check('bevestigingsvenster: role=alertdialog, aria-modal, ja/nee', /role="alertdialog"/.test(v) && /aria-modal="true"/.test(v) && v.includes('data-tg-venster-ja="beheer-intrekken"') && v.includes('data-tg-venster-nee="beheer-intrekken"'));
    check('AlleGebruikers: intrekken alleen via het venster (setVraag), niet direct', /onIntrekken=\{\(v\) => setVraag\(v\)\}/.test(readFileSync('src/agenten/toegang/AlleGebruikers.tsx', 'utf8')));

    // 403 en terug naar gewone gebruiker: gegevens weg, sectie weg
    S.beheerStatus = 403;
    await bron.laadBeheer();
    check('beheer 403 → verboden, geen gebruikers in het geheugen', bron.beheerToegang().verboden && bron.beheerToegang().gebruikers.length === 0);
    S.beheerStatus = 200;
    await bron.laadBeheer();
    S.tech = { profiel: null, activatie: null };
    await techVernieuwen();
    h = html();
    check('weer gewone gebruiker (gegevens nog in het geheugen) → sectie en andermans e-mails niet gerenderd', !h.includes('data-tg-beheer') && !h.includes('anna@test.invalid') && !h.includes('bob@test.invalid'));
    bron.wisBeheer();
    check('wisBeheer → beheergegevens weg', bron.beheerToegang().gebruikers.length === 0);

    // ================================================================ 7. statisch: geen innerHTML, «?» bij elke optie, register volledig
    const bestanden = ['src/agenten/TabToegang.tsx', ...readdirSync('src/agenten/toegang').filter((f) => /\.tsx?$/.test(f)).map((f) => `src/agenten/toegang/${f}`)];
    const vies = bestanden.filter((f) => /innerHTML|dangerouslySetInnerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(readFileSync(f, 'utf8')));
    check(`geen innerHTML/dangerouslySetInnerHTML in ${bestanden.length} bestanden`, vies.length === 0, vies.join(', '));
    const mis: string[] = [];
    let aantal = 0;
    for (const f of bestanden.filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(f, 'utf8');
      for (const t of tags(src).filter(isBediening)) {
        aantal++;
        if (/data-hulp-vrij=['"](filter|sortering|keuze)['"]/.test(t.tekst)) continue;
        const dyn = /data-hulp=\{`([a-z0-9.-]+\.)\$\{/.exec(t.tekst)?.[1];
        if (dyn) { if (!hulpSleutels().some((x) => x.startsWith(dyn)) || !src.includes(`<HulpVraag k={\`${dyn}\${`)) mis.push(`${f}:${t.regel} ${dyn}…`); continue; }
        const k = /data-hulp=['"]([a-z0-9.-]+)['"]/.exec(t.tekst)?.[1] ?? '';
        if (!k || !hulpVan(k) || (!new RegExp(`<HulpVraag k=['"]${k.replace(/\./g, '\\.')}['"]`).test(src) && !new RegExp(`meer=\\{\\[[^]*?\\[\\s*['"]${k.replace(/\./g, '\\.')}['"]\\s*,`).test(src) /* 29.10.2026: één (?) per kop */)) mis.push(`${f}:${t.regel} ${k}`);
      }
    }
    check(`elke optie (${aantal} vinkjes/selects) heeft data-hulp + «?» in hetzelfde bestand`, aantal >= 10 && mis.length === 0, mis.join('\n'));
    const gebreken = hulpSleutels().filter((k) => k.startsWith('toegang.')).flatMap((k) => hulpGebreken(k, hulpVan(k)));
    check(`hulp-register: ${hulpSleutels().filter((k) => k.startsWith('toegang.')).length} toegang.*-sleutels volledig (wat/gevolg/risico/dev, uk/nl)`, gebreken.length === 0 && hulpSleutels().filter((k) => k.startsWith('toegang.')).length >= 15, gebreken.join('\n'));
    const css = readFileSync('src/agenten/toegang/toegang.css', 'utf8');
    check('css: alleen themavariabelen, 44 px aanraakdoelen, geen vaste breedte > 320 px', /min-height:44px/.test(css) && /var\(--panel\)/.test(css) && !/(?:^|[;{])\s*(?:min-)?width:\s*(3[3-9]\d|[4-9]\d\d|\d{4})px/m.test(css));
  } finally {
    globalThis.fetch = vorigeFetch;
  }
  return einde();
}
