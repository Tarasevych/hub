// Site-kant van extensie 0.5 (18.10.2026): live statusbron (brug + server + PING), toestandsmachine met locked/unlocked/agent,
// en het blok «Розблокування розширення» (render met react-dom/server, gemockte fetch en passkeyBevestigen): geen recht → knop uit
// + uitleg; succes → ontgrendeld zonder herladen; intrekken → vergrendeld; weigeringen met uitleg en alleen links naar de eigen site.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { tags, isBediening } from './hulp-register.test';
import { combineer, filterPubliek, lokaalBericht, maakExtensieLive, regelVan, zetExtensieLive, LEEG, POLL_MS, VAST_EXTENSIE_ID, type LiveDeps, type LiveToestand } from '../../src/extensie/extensie-live';
import { deriveExtState, EXT_TEXT, type ExtInputs } from '../../src/extensie-toestand';
import { hulpGebreken, hulpVan } from '../../shared/hulp-register';
import { ADMIN_HOSTS_STANDAARD, STAAT_TEKST, WEIGER_UITLEG, type ExtensieAgentStatus, type ExtensieStatusAntwoord } from '../../shared/extensie-ontgrendeling';

const ORIGIN = 'https://mcp.tarasevych.com';
const AID = '11111111-2222-4333-8444-555555555555';
const AID2 = '99999999-2222-4333-8444-555555555555';

// ---------------------------------------------------------------- nepomgeving: venster, document, klok en timers
function omgeving() {
  let klok = 1_000_000;
  const berichten: Array<(e: { source: unknown; origin: string; data: unknown }) => void> = [];
  const zicht: Array<() => void> = [];
  const verstuurd: unknown[] = [];
  const timers = new Map<number, { f: () => void; op: number }>();
  let volgend = 1;
  const venster = {
    addEventListener: (_t: 'message', f: (typeof berichten)[number]) => { berichten.push(f); },
    removeEventListener: (_t: 'message', f: (typeof berichten)[number]) => { const i = berichten.indexOf(f); if (i >= 0) berichten.splice(i, 1); },
    postMessage: (m: unknown) => { verstuurd.push(m); },
  };
  const doc = {
    hidden: false,
    addEventListener: (_t: 'visibilitychange', f: () => void) => { zicht.push(f); },
    removeEventListener: (_t: 'visibilitychange', f: () => void) => { const i = zicht.indexOf(f); if (i >= 0) zicht.splice(i, 1); },
  };
  return {
    venster, doc, verstuurd, berichten, timers,
    nu: () => klok, zet: (ms: number) => { klok = ms; }, verder: (ms: number) => { klok += ms; },
    stuur: (data: unknown, extra: Partial<{ source: unknown; origin: string }> = {}) => { for (const f of [...berichten]) f({ source: venster, origin: ORIGIN, data, ...extra }); },
    verberg: (h: boolean) => { doc.hidden = h; for (const f of [...zicht]) f(); },
    setTimeout: (f: () => void, ms: number) => { const id = volgend++; timers.set(id, { f, op: klok + ms }); return id; },
    clearTimeout: (h: unknown) => { timers.delete(h as number); },
    /** Voert de eerstvolgende timer uit (klok springt mee). */
    async draai() { const [id, t] = [...timers.entries()].sort((a, b) => a[1].op - b[1].op)[0] ?? []; if (!id || !t) return false; timers.delete(id); klok = Math.max(klok, t.op); t.f(); await rust(); return true; },
  };
}
const rust = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

const agentStatus = (p: Partial<ExtensieAgentStatus> = {}): ExtensieAgentStatus => ({
  agentId: AID, naam: 'Chrome (Win32)', online: true, versie: '0.5.0', staat: 'vergrendeld', ontgrendeling: null,
  ai: { verbonden: false, agenten: [] }, lokaal: { verbonden: false }, laatstGezien: 1, ...p,
});
const antwoord = (p: Partial<ExtensieStatusAntwoord> = {}, a: ExtensieAgentStatus[] = [agentStatus()]): ExtensieStatusAntwoord => ({
  agenten: a, recht: { magOntgrendelen: true, rollen: ['ontwikkelaar'], caps: ['browser.read', 'browser.navigate'], activatieTot: null, passkeys: 1 }, nu: 0, ...p,
});

/** Minimale browseromgeving voor modules die bij het laden window/location lezen (canonical-service, tab-context). */
function nepBrowser() {
  const g = globalThis as Record<string, unknown>;
  if (g.window) return;
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}/agents#extension`);
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  if (!g.document) g.document = { hidden: false, title: '', cookie: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null };
  // Zelfde opstartscript als de echte pagina (index.html laadt public/canonical-service.js vóór de app).
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-site');
  nepBrowser();
  const { default: ExtensieOntgrendeling, blokkade, duurKeuzes, intrekken, ontgrendelen, weigeringVan, zetOntgrendelDeps } = await import('../../src/extensie/ExtensieOntgrendeling');
  const { api } = await import('../../src/platform/client');

  // ================================================================ 1. brug: alleen eigen venster/origin, whitelist
  {
    const v = {};
    check('bericht van andere origin genegeerd', lokaalBericht({ source: v, origin: 'https://evil.example', data: { mrExt: true, type: 'status', staat: 'ontgrendeld' } }, v, ORIGIN) === null);
    check('bericht uit ander venster (iframe) genegeerd', lokaalBericht({ source: {}, origin: ORIGIN, data: { mrExt: true, type: 'status', staat: 'ontgrendeld' } }, v, ORIGIN) === null);
    check('zonder mrExt === true genegeerd', lokaalBericht({ source: v, origin: ORIGIN, data: { mrExt: 'true', type: 'status' } }, v, ORIGIN) === null);
    check('ander type (result/snapshot) genegeerd', lokaalBericht({ source: v, origin: ORIGIN, data: { mrExt: true, type: 'snapshot', staat: 'ontgrendeld' } }, v, ORIGIN) === null);
    const b = lokaalBericht({ source: v, origin: ORIGIN, data: {
      mrExt: true, type: 'status', versie: '0.5.0', gekoppeld: true, verbonden: true, staat: 'ontgrendeld', exp: 5_000_000, caps: ['browser.read', 'browser.root', 7],
      domeinen: ['admin.tarasevych.com', 'evil.example', 'mcp.tarasevych.com'], aiVerbonden: false, lokaalVerbonden: true, agentId: AID, account: 'ok',
      commandKey: 'GEHEIM', agentToken: 'TOKEN', sig: 'abc', grant: { gid: 'x' }, __proto__x: 1, html: '<img onerror=alert(1)>',
    } }, v, ORIGIN);
    const sleutels = Object.keys(b?.publiek ?? {}).sort();
    check('extra velden weggefilterd (geen commandKey/agentToken/sig/grant/html)', !!b && !sleutels.some((k) => ['commandKey', 'agentToken', 'sig', 'grant', 'html', '__proto__x', 'mrExt', 'type'].includes(k)), sleutels.join(','));
    check('caps en domeinen alleen bekende waarden', JSON.stringify(b?.publiek.caps) === '["browser.read"]' && JSON.stringify(b?.publiek.domeinen) === '["admin.tarasevych.com","mcp.tarasevych.com"]');
    check('hello (0.4-vorm) → gekoppeld/verbonden/extensie-id', JSON.stringify(filterPubliek({ paired: true, connected: false, extensionId: VAST_EXTENSIE_ID, version: '0.4.2', agentId: 'geen-uuid' }))
      === JSON.stringify({ versie: '0.4.2', gekoppeld: true, verbonden: false, extensieId: VAST_EXTENSIE_ID }));
    check('ongeldige staat/exp worden niet overgenomen', JSON.stringify(filterPubliek({ staat: 'root', exp: 'morgen' })) === '{}');
  }

  // ================================================================ 1b. HUB-04/G3: buiten mcp/admin niet herhaald pollen (één vraag bij start, terugkeer en actie)
  {
    const { pollDienst } = await import('../../src/extensie/extensie-live');
    check('pollDienst: alleen mcp.* en admin.* pollen herhaald', pollDienst('mcp.tarasevych.com') && pollDienst('admin.tarasevych.com') && !pollDienst('hub.tarasevych.com') && !pollDienst('mail.tarasevych.com') && !pollDienst('mcpx.example'));
    const o = omgeving();
    let polls = 0;
    const s = maakExtensieLive({ haal: async () => { polls++; return antwoord(); }, venster: o.venster, document: o.doc, origin: ORIGIN, nu: o.nu, setTimeout: o.setTimeout, clearTimeout: o.clearTimeout, pollen: false });
    const uit = s.subscribe(() => undefined);
    await rust();
    check('pollen:false → één vraag bij start, niets gepland', polls === 1 && s.get().geladen && s.info().gepland === null && o.timers.size === 0);
    o.verder(600_000); await o.draai();
    check('pollen:false → na 10 min nog steeds geen tweede vraag', polls === 1);
    o.verberg(true); o.verberg(false); await rust();
    check('pollen:false → terugkeer naar het tabblad vraagt één keer', polls === 2);
    await s.vernieuw();
    check('pollen:false → vernieuw() na een actie vraagt één keer', polls === 3 && s.info().gepland === null);
    uit();
  }

  // ================================================================ 2. store: start, polling, verborgen, terugval, lokaal wint
  {
    const o = omgeving();
    let polls = 0; let geef: () => Promise<ExtensieStatusAntwoord> = async () => antwoord();
    const pings: string[] = [];
    const deps: LiveDeps = { haal: () => { polls++; return geef(); }, ping: async (id) => { pings.push(id); return null; }, venster: o.venster, document: o.doc, origin: ORIGIN, nu: o.nu, setTimeout: o.setTimeout, clearTimeout: o.clearTimeout };
    const s = maakExtensieLive(deps);
    check('niets gedaan vóór het eerste abonnement', polls === 0 && o.berichten.length === 0);
    let meldingen = 0;
    const uit = s.subscribe(() => { meldingen++; });
    await rust();
    check('bij start: {mrExtStatus:true} naar de pagina gestuurd', o.verstuurd.some((m) => JSON.stringify(m) === '{"mrExtStatus":true}'));
    check('bij start meteen naar de server gevraagd en luisteraar gemeld', polls === 1 && s.get().geladen && meldingen > 0);
    check(`volgende poll over ${POLL_MS} ms gepland`, s.info().gepland === POLL_MS);
    await o.draai();
    check('timer → opnieuw gevraagd', polls === 2);
    check('PING-terugval met het vaste extensie-id als de brug zwijgt', pings.length >= 1 && pings[0] === VAST_EXTENSIE_ID);
    o.verberg(true);
    check('polling stopt als het tabblad verborgen is (geen timer meer)', s.info().gepland === null && o.timers.size === 0);
    const voor = polls; o.verder(60_000); await o.draai();
    check('verborgen: ook na 60 s geen nieuwe vraag', polls === voor);
    o.verberg(false); await rust();
    check('weer zichtbaar → meteen gevraagd en opnieuw gepland', polls === voor + 1 && s.info().gepland === POLL_MS);
    geef = async () => { throw Object.assign(new Error('HTTP_500'), { status: 500 }); };
    await o.draai();
    const t1 = s.info().gepland; await o.draai(); const t2 = s.info().gepland;
    check('fouten → terugval 2×, 4× …', t1 === POLL_MS * 2 && t2 === POLL_MS * 4 && s.get().fout === 'HTTP_500', `${t1} ${t2}`);
    for (let i = 0; i < 6; i++) await o.draai();
    check('terugval begrensd op 60 s', s.info().gepland === 60_000);
    geef = async () => { throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 }); };
    await o.draai();
    check('401 → foutcode NIET_INGELOGD → uitleg «Увійти»', s.get().fout === 'NIET_INGELOGD' && blokkade(combineer(s.get()))?.code === 'NIET_INGELOGD');

    // G3/AI-01/A11 (audit 19.10.2026): een 403 (dienst niet toegestaan, oude server) stopt het pollen; vernieuw() na een actie probeert één keer opnieuw.
    geef = async () => { throw Object.assign(new Error('SERVICE_NOT_ALLOWED'), { status: 403 }); };
    await o.draai();
    const pollsNa403 = polls;
    check('403 → gestopt: geen timer meer gepland', s.info().gestopt && s.info().gepland === null && o.timers.size === 0, JSON.stringify(s.info()));
    o.verder(120_000); await o.draai(); o.verberg(true); o.verberg(false); await rust();
    check('403 → ook na 2 min en na terugkeer naar het tabblad geen nieuwe vraag', polls === pollsNa403, `${polls} vs ${pollsNa403}`);
    geef = async () => antwoord();
    await s.vernieuw();
    check('vernieuw() na een actie probeert opnieuw en herstelt het pollen', polls === pollsNa403 + 1 && !s.info().gestopt && s.info().gepland === POLL_MS);

    // lokaal wint als nieuwer
    geef = async () => antwoord({}, [agentStatus({ staat: 'vergrendeld' })]);
    o.zet(2_000_000); await s.vernieuw();
    check('server: vergrendeld', combineer(s.get(), undefined, o.nu()).staat === 'vergrendeld');
    o.zet(2_001_000);
    o.stuur({ mrExt: true, type: 'status', agentId: AID, gekoppeld: true, verbonden: true, staat: 'ontgrendeld', exp: 2_001_000 + 30 * 60000, caps: ['browser.read'], domeinen: ['admin.tarasevych.com'], aiVerbonden: false });
    const l = combineer(s.get(), undefined, o.nu());
    check('lokaal bericht nieuwer → ontgrendeld voor DEZE browser, bron lokaal', l.staat === 'ontgrendeld' && l.bron === 'lokaal' && l.dezeBrowser && l.ontgrendeling?.domeinen[0] === 'admin.tarasevych.com');
    check('statusregel menu: «Розширення: Доступ відкрито · 30 хв»', regelVan(l, true, o.nu())?.tekst === `Розширення: ${STAAT_TEKST.ontgrendeld[0]} · 30 хв`, regelVan(l, true, o.nu())?.tekst);
    o.stuur({ mrExt: true, type: 'status', agentId: AID, staat: 'agent', aiVerbonden: true, exp: 2_001_000 + 30 * 60000 }, { origin: 'https://evil.tarasevych.com.evil.example' });
    check('vreemde origin verandert niets aan de getoonde staat', combineer(s.get(), undefined, o.nu()).staat === 'ontgrendeld');
    check('andere browser (agentId) krijgt de lokale staat niet', combineer({ ...s.get(), antwoord: antwoord({}, [agentStatus(), agentStatus({ agentId: AID2 })]) }, AID2, o.nu()).staat === 'vergrendeld');
    o.zet(2_002_000); await s.vernieuw();
    check('daarna nieuwer serverantwoord → server wint weer', combineer(s.get(), undefined, o.nu()).bron === 'server' && combineer(s.get(), undefined, o.nu()).staat === 'vergrendeld');
    // verlopen → vergrendeld; AI verbonden → agent
    const ont = { gid: 'g1', caps: ['browser.read' as const], domeinen: ['mcp.tarasevych.com'], lokaal: false, begin: 0, eind: 2_100_000, rollen: ['ontwikkelaar'] };
    const tAgent: LiveToestand = { ...LEEG, geladen: true, serverOp: 1, antwoord: antwoord({}, [agentStatus({ staat: 'agent', ontgrendeling: ont, ai: { verbonden: true, agenten: [{ naam: 'Claude', laatst: 1 }] } })]) };
    check('AI actief → staat agent met namen', combineer(tAgent, undefined, 2_000_000).staat === 'agent' && combineer(tAgent, undefined, 2_000_000).ai.agenten[0].naam === 'Claude');
    check('ontgrendeling verlopen → meteen vergrendeld (ook zonder nieuwe poll)', combineer(tAgent, undefined, 2_200_000).staat === 'vergrendeld' && combineer(tAgent, undefined, 2_200_000).ontgrendeling === null);
    check('geen gekoppelde browser → geen statusregel in het menu', regelVan(combineer({ ...LEEG, geladen: true, antwoord: antwoord({}, []) }), true) === null);
    uit();
    check('laatste abonnee weg → luisteraars en timer weg', o.berichten.length === 0 && o.timers.size === 0 && !s.info().actief);
  }

  // ================================================================ 3. toestandsmachine
  {
    const ok: ExtInputs = { presence: 'present', version: '0.5.0', minVersion: '0.4.0', paired: true, online: true, account: 'ok', blocked: false, activeGrants: 1, browserEnabled: true, armed: true };
    const v = (p: Partial<ExtInputs>) => deriveExtState({ ...ok, ...p });
    check('zonder live staat: 0.4-gedrag (enabled)', v({}).state === 'enabled');
    check('vergrendeld → locked met unlock, geen revoke', v({ ontgrendeling: 'vergrendeld' }).state === 'locked' && v({ ontgrendeling: 'vergrendeld' }).actions[0] === 'unlock' && !v({ ontgrendeling: 'vergrendeld' }).actions.includes('revoke'));
    check('onbekend → ook locked (standaard dicht)', v({ ontgrendeling: 'onbekend' }).state === 'locked');
    check('ontgrendeld → unlocked met revoke', v({ ontgrendeling: 'ontgrendeld' }).state === 'unlocked' && v({ ontgrendeling: 'ontgrendeld' }).actions[0] === 'revoke');
    check('agent → agent met revoke en Стоп', v({ ontgrendeling: 'agent' }).state === 'agent' && v({ ontgrendeling: 'agent' }).actions.includes('revoke') && v({ ontgrendeling: 'agent' }).actions.includes('stop'));
    check('geblokkeerd gaat voor ontgrendeling (geen unlock)', v({ blocked: true, ontgrendeling: 'vergrendeld' }).reason === 'blocked' && !v({ blocked: true, ontgrendeling: 'vergrendeld' }).actions.includes('unlock'));
    check('offline gaat voor ontgrendeling', v({ online: false, ontgrendeling: 'ontgrendeld' }).state === 'paired');
    check('teksten uk + nl voor locked/unlocked/agent', (['locked', 'unlocked', 'agent'] as const).every((k) => EXT_TEXT[k][0].length > 20 && EXT_TEXT[k][1].length > 20 && EXT_TEXT[k][0] !== EXT_TEXT[k][1]));
    const alle = (['vergrendeld', 'ontgrendeld', 'agent', 'onbekend', 'niet-gekoppeld', undefined] as const).flatMap((ontgrendeling) => [true, false].map((blocked) => deriveExtState({ ...ok, blocked, ontgrendeling })));
    check('geen dubbele acties; unlock en revoke nooit samen', alle.every((x) => new Set(x.actions).size === x.actions.length && !(x.actions.includes('unlock') && x.actions.includes('revoke'))));
  }

  // ================================================================ 4. duur en blokkade
  {
    const nu = 10_000_000;
    check('duur: nooit voorbij de technische activering (50 min → 15, 30)', JSON.stringify(duurKeuzes(nu + 50 * 60000, nu)) === '[15,30]');
    check('duur: 10 min over → alleen 10', JSON.stringify(duurKeuzes(nu + 10 * 60000 + 5000, nu)) === '[10]');
    check('duur: activering voorbij → geen keuze', duurKeuzes(nu - 1, nu).length === 0);
    check('duur: open activering → alle keuzes ≤ 480', JSON.stringify(duurKeuzes(null, nu)) === '[15,30,60,120,240]');
    const l = combineer({ ...LEEG, geladen: true, antwoord: antwoord({ recht: { magOntgrendelen: false, code: 'TECH_NIET_ACTIEF', rollen: [], caps: [], activatieTot: null, passkeys: 1 } }) });
    check('blokkade: recht.magOntgrendelen false → uitleg van de server-code', blokkade(l)?.code === 'TECH_NIET_ACTIEF');
    const oud = combineer({ ...LEEG, geladen: true, lokaal: { agentId: AID, gekoppeld: true, versie: '0.4.2' }, antwoord: antwoord({}, [agentStatus({ versie: '0.4.2' })]) });
    check('blokkade: extensie in deze browser te oud', blokkade(oud)?.code === 'EXTENSIE_TE_OUD');
  }

  // ================================================================ 5. weigeringen
  {
    const apiFout = (status: number, data: unknown) => Object.assign(new Error(String((data as { error?: string }).error)), { name: 'ApiError', status, response: { status, data } });
    const w1 = weigeringVan(apiFout(403, { error: 'GEEN_PASSKEY', uitleg: { uk: 'Немає passkey у вас.', nl: 'U hebt geen passkey.' }, actie: { uk: 'Тут', nl: 'Hier', url: 'https://evil.example/phish' } }));
    check('server-uitleg overgenomen, link naar vreemde site vervangen door de eigen', w1.uk === 'Немає passkey у вас.' && w1.actie?.url === WEIGER_UITLEG.GEEN_PASSKEY.actie!.url);
    const w2 = weigeringVan(apiFout(409, { error: 'TE_VEEL_POGINGEN' }));
    check('zonder uitleg van de server: vaste uitleg uit WEIGER_UITLEG', w2.nl === WEIGER_UITLEG.TE_VEEL_POGINGEN.nl);
    check('passkey geannuleerd (NotAllowedError) → eigen uitleg', weigeringVan(Object.assign(new Error('x'), { name: 'NotAllowedError' })).code === 'PASSKEY_GEANNULEERD');
  }

  // ================================================================ 6. render + flow met gemockte fetch en passkeyBevestigen
  {
    const o = omgeving();
    o.zet(Date.now()); // de component rekent met de echte klok (aftellen); de nepserver geeft dezelfde tijd
    type Verzoek = { method: string; url: string; body: Record<string, unknown> | null };
    const verzoeken: Verzoek[] = [];
    let serverAgent = agentStatus();
    let recht: ExtensieStatusAntwoord['recht'] = { magOntgrendelen: false, code: 'GEEN_TECH_PROFIEL', rollen: [], caps: [], activatieTot: null, passkeys: 0 };
    let uitdagingAntwoord: { status: number; data: unknown } = { status: 200, data: { uitdagingId: 'u-1', verloopt: 0, publicKey: { challenge: 'Y2hhbA', rpId: 'tarasevych.com', timeout: 60000, allowCredentials: [] }, voorstel: { caps: ['browser.read'], domeinen: [...ADMIN_HOSTS_STANDAARD], eind: 0, rollen: ['ontwikkelaar'] } } };
    const json = (status: number, data: unknown) => ({ ok: status >= 200 && status < 300, status, statusText: '', headers: new Headers(), text: async () => JSON.stringify(data) });
    const vorigeFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(init.body) : null;
      verzoeken.push({ method, url: String(url), body });
      const pad = String(url).split('?')[0];
      if (pad === '/api/owner/agents/extensie-status') return json(200, { agenten: [serverAgent], recht, nu: o.nu() });
      if (pad === '/api/owner/agents/ontgrendeling/uitdaging') return json(uitdagingAntwoord.status, uitdagingAntwoord.data);
      if (pad === '/api/owner/agents/ontgrendeling') {
        const ontgrendeling = { gid: 'g-1', caps: ['browser.read'], domeinen: [...ADMIN_HOSTS_STANDAARD], lokaal: false, begin: o.nu(), eind: o.nu() + 60 * 60000, rollen: ['ontwikkelaar'] };
        serverAgent = { ...serverAgent, ontgrendeling: ontgrendeling as ExtensieAgentStatus['ontgrendeling'], staat: 'ontgrendeld' };
        return json(200, { ontgrendeling, verzonden: true });
      }
      if (pad === '/api/owner/agents/ontgrendeling/intrekken') { serverAgent = { ...serverAgent, ontgrendeling: null, staat: 'vergrendeld' }; return json(200, { ok: true }); }
      return json(404, { error: 'NOT_FOUND' });
    }) as unknown as typeof fetch;
    try {
      const store = maakExtensieLive({ haal: async () => (await api.get('/api/owner/agents/extensie-status', { service: 'mcp' })).data as ExtensieStatusAntwoord, venster: o.venster, document: o.doc, origin: ORIGIN, nu: o.nu, setTimeout: o.setTimeout, clearTimeout: o.clearTimeout });
      zetExtensieLive(store);
      const passkeys: unknown[] = [];
      let passkeyFout: Error | null = null;
      zetOntgrendelDeps({ body: () => ({ service: 'mcp', tabContext: 'a'.repeat(48), sourceOrigin: ORIGIN }), bevestig: async (pk) => { if (passkeyFout) throw passkeyFout; passkeys.push(pk); return { credentialId: 'c', clientDataJSON: 'd', authenticatorData: 'a', signature: 's' }; }, store: () => store });
      const uitzet = store.subscribe(() => undefined);
      await rust();
      const tr = (uk: string) => uk;
      const html = () => renderToString(createElement(ExtensieOntgrendeling, { tr }));
      const knop = (h: string) => /<button[^>]*data-eo-knop="ontgrendelen"[^>]*>/.exec(h)?.[0] ?? '';

      let h = html();
      check('render: geen recht → knop «Розблокувати з Passkey» uit', / disabled=""/.test(knop(h)) && h.includes('Розблокувати з Passkey'), knop(h));
      check('render: geen recht → uitleg waarom (GEEN_TECH_PROFIEL, uk)', h.includes('data-eo-weigering="GEEN_TECH_PROFIEL"') && h.includes(WEIGER_UITLEG.GEEN_TECH_PROFIEL.uk.slice(0, 40)));
      check('render: staat vergrendeld = «Очікування Passkey» met aria-live', h.includes('data-eo-staat="vergrendeld"') && h.includes(STAAT_TEKST.vergrendeld[0]) && /aria-live="polite"/.test(h));
      check('render: standaard admin + mcp aangevinkt, andere hosts niet', /data-eo-domein="admin.tarasevych.com"[^>]*checked|checked=""[^>]*data-eo-domein="admin.tarasevych.com"/.test(h) && !/checked=""[^>]*data-eo-domein="mail.tarasevych.com"/.test(h));
      check('render: elke optie heeft een «?» (hulp-register)', ['extensie.ontgrendeling', 'extensie.duur', 'extensie.domeinen', 'extensie.lokaal'].every((k) => !!hulpVan(k)) && (h.match(/data-hulp="/g) || []).length >= 3);

      recht = { magOntgrendelen: false, code: 'TECH_NIET_ACTIEF', rollen: ['ontwikkelaar'], caps: ['browser.read'], activatieTot: null, passkeys: 1 };
      await store.vernieuw(); h = html();
      check('render: tech niet actief → knop «Активувати технічний профіль» (in dit tabblad, geen link weg)', h.includes('data-eo-actie="TECH_NIET_ACTIEF"') && h.includes(WEIGER_UITLEG.TECH_NIET_ACTIEF.actie!.uk) && !/<a[^>]*data-eo-actie="TECH_NIET_ACTIEF"/.test(h));

      recht = { magOntgrendelen: true, rollen: ['ontwikkelaar'], caps: ['browser.read', 'browser.navigate'], activatieTot: o.nu() + 50 * 60000, passkeys: 1 };
      await store.vernieuw(); h = html();
      check('render: recht → knop aan, geen uitleg', !/ disabled=""/.test(knop(h)) && !h.includes('data-eo-weigering'));
      check('render: duur nooit voorbij activatieTot (alleen 15 en 30 min)', h.includes('>15 хв<') && h.includes('>30 хв<') && !h.includes('>1 год<'));

      const n0 = verzoeken.length;
      const r = await ontgrendelen({ agentId: AID, minuten: 30, domeinen: [...ADMIN_HOSTS_STANDAARD], lokaal: false });
      const nieuw = verzoeken.slice(n0).filter((x) => x.method === 'POST');
      check('ontgrendelen: uitdaging → passkey → ontgrendeling (POST, in die volgorde)', r.ok && nieuw[0]?.url === '/api/owner/agents/ontgrendeling/uitdaging' && nieuw[1]?.url === '/api/owner/agents/ontgrendeling' && passkeys.length === 1, nieuw.map((x) => x.url).join(' '));
      check('uitdaging: agentId, minuten, domeinen, lokaal + tabContext', nieuw[0]?.body?.agentId === AID && nieuw[0]?.body?.minuten === 30 && JSON.stringify(nieuw[0]?.body?.domeinen) === JSON.stringify([...ADMIN_HOSTS_STANDAARD]) && nieuw[0]?.body?.lokaal === false && nieuw[0]?.body?.tabContext === 'a'.repeat(48));
      check('ontgrendeling: uitdagingId + assertie van passkeyBevestigen', nieuw[1]?.body?.uitdagingId === 'u-1' && (nieuw[1]?.body?.assertie as { signature?: string })?.signature === 's');
      h = html();
      check('succes → staat ontgrendeld in dezelfde pagina (geen herladen)', h.includes('data-eo-staat="ontgrendeld"') && h.includes(STAAT_TEKST.ontgrendeld[0]) && h.includes('data-eo-knop="intrekken"') && h.includes('Відкликати зараз'));
      check('succes → aftellen en domeinen zichtbaar', /data-eo-rest="60"/.test(h) && h.includes('<code class="eo-chip">admin.tarasevych.com</code>'));
      check('direct na de actie opnieuw bij de server gevraagd', verzoeken.slice(n0).some((x) => x.method === 'GET' && x.url.startsWith('/api/owner/agents/extensie-status')));

      const n1 = verzoeken.length;
      const ri = await intrekken(AID, 'g-1');
      const ir = verzoeken.slice(n1).find((x) => x.method === 'POST');
      check('intrekken: POST zonder passkey met agentId + gid', ri.ok && ir?.url === '/api/owner/agents/ontgrendeling/intrekken' && ir.body?.gid === 'g-1' && passkeys.length === 1);
      h = html();
      check('intrekken → meteen vergrendeld', h.includes('data-eo-staat="vergrendeld"') && !h.includes('data-eo-knop="intrekken"'));

      uitdagingAntwoord = { status: 403, data: { error: 'GEEN_PASSKEY', uitleg: { uk: WEIGER_UITLEG.GEEN_PASSKEY.uk, nl: WEIGER_UITLEG.GEEN_PASSKEY.nl } } };
      const n2 = verzoeken.length;
      const rw = await ontgrendelen({ agentId: AID, minuten: 15, domeinen: ['admin.tarasevych.com'], lokaal: true });
      check('weigering 403 → uitleg + actie «Додати passkey», geen passkeyvenster, geen tweede POST', !rw.ok && rw.weigering.code === 'GEEN_PASSKEY' && rw.weigering.actie?.url === WEIGER_UITLEG.GEEN_PASSKEY.actie!.url && passkeys.length === 1
        && verzoeken.slice(n2).filter((x) => x.method === 'POST').length === 1);
      uitdagingAntwoord = { status: 200, data: { uitdagingId: 'u-2', verloopt: 0, publicKey: { challenge: 'Y2hhbA', rpId: 'tarasevych.com', timeout: 60000, allowCredentials: [] } } };
      passkeyFout = Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' });
      const n3 = verzoeken.length;
      const rp = await ontgrendelen({ agentId: AID, minuten: 15, domeinen: ['admin.tarasevych.com'], lokaal: false });
      check('passkey geannuleerd → niets geopend, geen POST ontgrendeling', !rp.ok && rp.weigering.code === 'PASSKEY_GEANNULEERD' && !verzoeken.slice(n3).some((x) => x.url === '/api/owner/agents/ontgrendeling'));
      check('store blijft vergrendeld na weigeringen', combineer(store.get()).staat === 'vergrendeld');
      uitzet();
    } finally {
      globalThis.fetch = vorigeFetch;
      zetOntgrendelDeps(null); zetExtensieLive(null);
    }
  }

  // ================================================================ 7. hulp «?» bij elke optie van het blok (zelfde regel als hulp-register.test)
  {
    const src = readFileSync('src/extensie/ExtensieOntgrendeling.tsx', 'utf8');
    const bed = tags(src).filter(isBediening);
    const mis = bed.filter((t) => { const k = /data-hulp=['"]([a-z0-9.-]+)['"]/.exec(t.tekst)?.[1]; return !k || !hulpVan(k) || !new RegExp(`<HulpVraag k=['"]${k.replace(/\./g, '\\.')}['"]`).test(src); });
    check(`blok: alle ${bed.length} opties (select/checkbox) hebben data-hulp + «?»`, bed.length >= 3 && mis.length === 0, mis.map((t) => `r${t.regel}`).join(','));
    const gebreken = ['extensie.ontgrendeling', 'extensie.duur', 'extensie.domeinen', 'extensie.lokaal', 'extensie.intrekken'].flatMap((k) => hulpGebreken(k, hulpVan(k)));
    check('hulp-register: extensie.* volledig (wat/gevolg/risico/dev, uk/nl)', gebreken.length === 0, gebreken.join('\n'));
    const tl = readFileSync('src/tech/TechLaag.tsx', 'utf8');
    check('TechLaag: statusregel alleen zolang de band loopt (useExtensieRegel(bandAan …))', /useExtensieRegel\(bandAan, uk\)/.test(tl) && /!!extRegel && \{ k: 'extensie'/.test(tl));
    const paneel = readFileSync('src/BrowserExtensiePaneel.tsx', 'utf8');
    check('paneel: blok in installatiedeel en per browser; toestand krijgt live staat', /<ExtensieOntgrendeling tr=\{tr\} \/>/.test(paneel) && /<ExtensieOntgrendeling tr=\{tr\} agentId=\{a\.id\} \/>/.test(paneel) && /ontgrendeling: liveT\.geladen \? live\.staat : undefined/.test(paneel));
    check('paneel 0.6: privé-koppeling → slot «як користувач» (ExtensiePrive), «Що може ШІ» = bestaande toestemmingen; koppelen met ruimte', /<ExtensiePrive tr=\{tr\} agentId=\{a\.id\} \/>/.test(paneel) && paneel.includes("tr('Що може ШІ', 'Wat mag de AI')") && paneel.includes('...(ruimte ? { ruimte } : {})'));
  }

  // ================================================================ 8. 0.6: twee sloten (prive/technisch), recht v2, ontgrendelen «як користувач» met step-up
  {
    const TID = '22222222-2222-4333-8444-555555555555';
    const { ontgrendelenPrive } = await import('../../src/extensie/ExtensieOntgrendeling');
    const { default: ExtensiePrive } = await import('../../src/extensie/ExtensiePrive');
    const { normaliseerRecht } = await import('../../src/extensie/extensie-live');
    const p6 = filterPubliek({ versie: '0.6.0', profielTab: 'technisch', account: 'ok', lokaalVerbonden: false,
      prive: { gekoppeld: true, verbonden: true, staat: 'ontgrendeld', exp: 9_000_000, caps: ['browser.read', 'x'], domeinen: ['mail.tarasevych.com', 'evil.example'], aiVerbonden: false, agentId: AID, agentToken: 'GEHEIM' },
      technisch: { gekoppeld: true, verbonden: true, staat: 'vergrendeld', agentId: TID, commandKey: 'GEHEIM' } });
    check('0.6 publiek: per slot gefilterd (geen sleutels, alleen bekende caps/hosts), profielTab overgenomen', !!p6 && p6.profielTab === 'technisch' && p6.prive?.staat === 'ontgrendeld' && JSON.stringify(p6.prive?.caps) === '["browser.read"]' && JSON.stringify(p6.prive?.domeinen) === '["mail.tarasevych.com"]' && !JSON.stringify(p6).includes('GEHEIM'));
    check('0.6 publiek: technisch: null = geen technisch slot', filterPubliek({ prive: { gekoppeld: false }, technisch: null })?.technisch === null);
    const r2 = normaliseerRecht({ magOntgrendelen: false, rollen: [], caps: [], activatieTot: null, passkeys: 0, prive: { mag: true, caps: ['browser.read'], maxDagen: 7, domeinen: ['hub.tarasevych.com', 'admin.tarasevych.com'], lokaal: false, stapOpGeldig: true }, technisch: null });
    check('recht v2: technisch null → geen tech-profiel; prive: maxDagen/domeinen (nooit admin)/lokaal/stapOp', r2.techProfiel === false && r2.technisch === null && r2.prive?.maxDagen === 7 && JSON.stringify(r2.prive?.domeinen) === '["hub.tarasevych.com"]' && r2.prive?.lokaal === false && r2.prive?.stapOpGeldig === true);
    check('recht 0.5 (plat) blijft werken als technisch recht', normaliseerRecht({ magOntgrendelen: true, rollen: ['tester'], caps: ['browser.read'], activatieTot: 5, passkeys: 1 }).technisch?.magOntgrendelen === true);
    const sP = agentStatus({ agentId: AID, staat: 'vergrendeld' }), sT = agentStatus({ agentId: TID, staat: 'vergrendeld' });
    const t2: LiveToestand = { ...LEEG, geladen: true, serverOp: 1, staatOp: 5, lokaal: p6, antwoord: { agenten: [{ ...sP, ruimte: 'prive' }, { ...sT, ruimte: 'technisch' }], recht: { prive: { mag: true, caps: ['browser.read'], maxDagen: 30 }, technisch: { mag: true, rollen: ['ontwikkelaar'], caps: ['browser.read'], activatieTot: null, passkeys: 1 } }, nu: 0 } as never };
    const lp = combineer(t2, undefined, 1_000_000, 'prive'), lt = combineer(t2, undefined, 1_000_000, 'technisch');
    check('per slot: prive-slot krijgt de lokale staat van publiek.prive (ontgrendeld), technisch die van publiek.technisch (vergrendeld)', lp.agentId === AID && lp.staat === 'ontgrendeld' && lp.dezeBrowser && lt.agentId === TID && lt.staat === 'vergrendeld' && lt.ruimte === 'technisch');
    check('per slot: recht.technisch → recht (passkey), recht.prive → rechtPrive', lt.recht?.magOntgrendelen === true && lp.rechtPrive?.mag === true && lp.techProfiel === true);
    check('gevraagde koppeling zonder slot: het slot van die koppeling telt (BrowserExtensionPanel per browser)', combineer(t2, TID, 1_000_000).staat === 'vergrendeld' && combineer(t2, AID, 1_000_000).staat === 'ontgrendeld');
    check('alleen technisch slot gevraagd zonder technische koppeling → geen browser', combineer({ ...t2, lokaal: null, antwoord: { agenten: [{ ...sP, ruimte: 'prive' }], nu: 0 } as never }, undefined, 1, 'technisch').heeftBrowser === false);

    // ontgrendelen «як користувач»: 403 STEP_UP_REQUIRED → venster (stapOp) → één keer opnieuw → ontgrendeld zonder herladen
    const o = omgeving();
    o.zet(Date.now()); // de component rekent met de echte klok (aftellen); de nepserver geeft dezelfde tijd
    let serverP: Record<string, unknown> = { ...sP, ruimte: 'prive' };
    const store = maakExtensieLive({ haal: async () => ({ agenten: [serverP], recht: { prive: { mag: true, caps: ['browser.read'], maxDagen: 30 }, technisch: null }, nu: o.nu() }) as never, venster: o.venster, document: o.doc, origin: ORIGIN, nu: o.nu, setTimeout: o.setTimeout, clearTimeout: o.clearTimeout });
    zetExtensieLive(store);
    const uit = store.subscribe(() => undefined); await rust();
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    let stapOpGevraagd = 0, eersteKeer = true;
    const stepUp = Object.assign(new Error('STEP_UP_REQUIRED'), { name: 'ApiError', status: 403, response: { status: 403, data: { error: 'STEP_UP_REQUIRED' } } });
    const ontg = { gid: 'gp-1', caps: ['browser.read'], domeinen: ['mail.tarasevych.com'], lokaal: false, ruimte: 'prive', begin: o.nu(), eind: o.nu() + 86_400_000, rollen: [], bevestigdMet: 'totp' };
    zetOntgrendelDeps({ body: () => ({ service: 'mcp', tabContext: 'b'.repeat(48), sourceOrigin: ORIGIN }), store: () => store,
      post: async (url, body) => { posts.push({ url, body }); if (eersteKeer) { eersteKeer = false; throw stepUp; } serverP = { ...serverP, staat: 'ontgrendeld', ontgrendeling: ontg }; return { data: { ontgrendeling: ontg, verzonden: true } }; },
      stapOp: async () => { stapOpGevraagd++; return true; } });
    try {
      const r = await ontgrendelenPrive({ agentId: AID, dagen: 1, domeinen: ['mail.tarasevych.com'], lokaal: false });
      check('prive: POST /ontgrendeling/prive {agentId, dagen, domeinen, lokaal} + sessievelden', posts[0]?.url === '/api/owner/agents/ontgrendeling/prive' && posts[0]?.body.agentId === AID && posts[0]?.body.dagen === 1 && posts[0]?.body.tabContext === 'b'.repeat(48));
      check('prive: 403 STEP_UP_REQUIRED → step-up-venster één keer → opnieuw → ontgrendeld', r.ok && stapOpGevraagd === 1 && posts.length === 2 && posts[1].url === '/api/owner/agents/ontgrendeling/prive');
      check('prive: meteen ontgrendeld in de live-store (geen herladen)', combineer(store.get(), AID, o.nu(), 'prive').staat === 'ontgrendeld');
      const html = renderToString(createElement(ExtensiePrive, { tr: (uk: string) => uk, agentId: AID }));
      check('render prive: «Доступ відкрито», resttijd in dagen/uren, «Відкликати зараз», geen passkey-tekst', html.includes('data-eo-slot="prive"') && html.includes(STAAT_TEKST.ontgrendeld[0]) && html.includes('data-eo-knop="prive-intrekken"') && !/passkey-ontgrendeling|Розблокувати з Passkey/.test(html));
      check('render prive: pagina’s alleen uit PRIVE_HOSTS (nooit admin.*), «?» bij elke optie', !html.includes('data-eo-prive-domein="admin.tarasevych.com"') && html.includes('data-eo-prive-domein="mail.tarasevych.com"') && (html.match(/data-hulp="extensie\.prive\./g) || []).length >= 3);
      // geannuleerd venster → uitleg, niets geopend; zonder toestemmingen → GEEN_BROWSER_RECHTEN met de prive-uitleg
      eersteKeer = true; stapOpGevraagd = 0;
      zetOntgrendelDeps({ body: () => ({ service: 'mcp', tabContext: 'b'.repeat(48), sourceOrigin: ORIGIN }), store: () => store, post: async () => { throw stepUp; }, stapOp: async () => { stapOpGevraagd++; return false; } });
      const rg = await ontgrendelenPrive({ agentId: AID, dagen: 7, domeinen: ['hub.tarasevych.com'], lokaal: false });
      check('prive: venster geannuleerd → weigering STEP_UP_REQUIRED met uitleg (uk/nl), geen tweede poging', !rg.ok && rg.weigering.code === 'STEP_UP_REQUIRED' && stapOpGevraagd === 1 && rg.weigering.uk.length > 10);
      zetOntgrendelDeps({ body: () => ({}), store: () => store, post: async () => { throw Object.assign(new Error('GEEN_BROWSER_RECHTEN'), { name: 'ApiError', status: 403, response: { status: 403, data: { error: 'GEEN_BROWSER_RECHTEN' } } }); } });
      const rb = await ontgrendelenPrive({ agentId: AID, dagen: 1, domeinen: ['hub.tarasevych.com'], lokaal: false });
      check('prive: GEEN_BROWSER_RECHTEN → «Спершу дозвольте ШІ щось у вкладці „Розширення браузера → Що може ШІ“»', !rb.ok && rb.weigering.uk.startsWith('Спершу дозвольте ШІ щось'));
    } finally { uit(); zetOntgrendelDeps(null); zetExtensieLive(null); }
  }

  // ================================================================ E-04 (audit fase 2): resttijd op hele eenheden
  {
    const { restLang } = await import('../../src/extensie/ExtensiePrive');
    const { restTekst } = await import('../../src/extensie/extensie-live');
    const H = 3_600_000, D = 24 * H;
    check('E-04 reproductie: 1 dag + 3 s (klok browser achter) → «1 дн», niet «1 дн 1 год»', restLang(D + 3000, true) === '1 дн' && restLang(D - 3000, true) === '1 дн' && restLang(D + 3000, false) === '1 d');
    check('E-04: 2 dagen 3 uur blijft «2 дн 3 год»; 7 dagen → «7 дн»', restLang(2 * D + 3 * H + 10_000, true) === '2 дн 3 год' && restLang(7 * D - 5000, true) === '7 дн');
    check('E-04: 1 uur + 3 s → «1 год» (niet «1 год 1 хв»); 59 min 40 s → «1 год»; 30 s → «1 хв» (nooit «0 хв»)', restTekst(H + 3000, true) === '1 год' && restTekst(H - 20_000, true) === '1 год' && restTekst(30_000, true) === '1 хв' && restTekst(H + 5 * 60000, false) === '1 u 5 min');
  }
  return einde();
}
