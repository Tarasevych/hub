// Regressies uit de audit van een gewone gebruiker (Учасник), 19.10.2026 (BEVINDINGEN-GEBRUIKER.md). Elke check verwijst naar een punt:
//  U-01 mailaccounts koppelen · U-03/MCP-01 recht «api-platform» (API_RECHT_VEREIST, muur zonder polling) · 2c menu/zijbalk/poort ·
//  3 rechten in admin/access · 4 welkomstkaart · R-01/R-02 wachtend account · R-05 technisch profiel bij accountwissel ·
//  U-05/U-06/TOK-01 · U-04 extensie aan ander account.
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';

const bron = (pad: string) => readFileSync(pad, 'utf8');
const ORIGIN = 'https://mcp.tarasevych.com';
/** Nagebootste browser (zelfde aanpak als ai-toegang-beheer.test.ts): de src-modules verwachten window/document/location. */
function nepBrowser() {
  const g = globalThis as Record<string, unknown>;
  if (g.window) return;
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}/agents#overzicht`);
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  if (!g.document) g.document = { hidden: false, title: '', cookie: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null };
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
}
const deps = (sessie: unknown) => ({
  requireSession: async () => sessie as never,
  respond: (d: unknown, st = 200) => ({ statusCode: st, body: JSON.stringify(d) }),
  fail: (m: string, st = 400) => ({ statusCode: st, body: JSON.stringify({ error: m }) }),
  audit: async () => undefined,
  body: (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {}),
});
const roep = async (routes: Record<string, any[]>, route: string, body: Record<string, unknown> = {}, params: Record<string, string> = {}) => {
  const r = await routes[route][0]({ event: { headers: {} }, body, params });
  return { status: Number(r.statusCode), data: JSON.parse(r.body || 'null') as { error?: string } };
};

export async function main(): Promise<number> {
  const { check, einde } = checker('gebruiker-audit-2026-10-19');
  nepBrowser();

  // ---------------------------------------------------------------- U-03 / MCP-01 (a): foutcode op de server
  {
    const { createAgentRoutes } = await import('../../backend/connectors-routes');
    const { createMcpConnectorRoutes } = await import('../../backend/mcp-connector-routes');
    const { weigerCode, GEEN_RECHT, isGeenRecht } = await import('../../backend/api-recht');
    check('api-recht: weigerCode onderscheidt «geen recht» van een sessiefout', weigerCode(GEEN_RECHT) === 'API_RECHT_VEREIST' && weigerCode(null) === 'OWNER_API_SESSION_REQUIRED' && isGeenRecht(GEEN_RECHT) && !isGeenRecht({ user: {} }));
    const lid = { user: { id: randomUUID(), email: 'lid@test.invalid', role: 'member', status: 'approved', entitlements: [] }, service: 'mcp' };
    const zonder: any = createAgentRoutes(deps(lid));
    const lijst = await roep(zonder, 'POST /api/owner/agents/list');
    const hb = await roep(zonder, 'POST /api/owner/agents/:id/heartbeat', {}, { id: randomUUID() });
    const code = await roep(zonder, 'POST /api/owner/agents/pairing-code');
    const journaal = await roep(zonder, 'POST /api/owner/agents/journaal');
    check('U-03 geldige sessie zonder recht: agents/list, heartbeat, pairing-code en journaal → 403 API_RECHT_VEREIST',
      [lijst, hb, code, journaal].every((r) => r.status === 403 && r.data.error === 'API_RECHT_VEREIST'), JSON.stringify([lijst, hb, code, journaal].map((r) => r.data.error)));
    const sessieFout: any = createAgentRoutes(deps({ errorCode: 'OWNER_SESSION_EXPIRED' }));
    const nietGoedgekeurd: any = createAgentRoutes(deps({ ...lid, user: { ...lid.user, status: 'pending', entitlements: ['api-platform'] } }));
    const r1 = await roep(sessieFout, 'POST /api/owner/agents/list'), r2 = await roep(nietGoedgekeurd, 'POST /api/owner/agents/list'), r3 = await roep(sessieFout, 'POST /api/owner/agents/:id/heartbeat', {}, { id: randomUUID() });
    check('U-03 echte sessiefouten (verlopen, niet goedgekeurd) blijven OWNER_API_SESSION_REQUIRED', [r1, r2, r3].every((r) => r.status === 403 && r.data.error === 'OWNER_API_SESSION_REQUIRED'));
    const mcpZonder: any = createMcpConnectorRoutes(deps(lid));
    const appr = await roep(mcpZonder, 'POST /api/owner/mcp-connector/approvals');
    const v2 = await roep(mcpZonder, 'POST /api/owner/connector-v2/overzicht');
    const mcpFout: any = createMcpConnectorRoutes(deps({ errorCode: 'X' }));
    const apprFout = await roep(mcpFout, 'POST /api/owner/mcp-connector/approvals');
    check('MCP-01 mcp-connector/approvals en connector-v2/overzicht: zonder recht API_RECHT_VEREIST, zonder sessie OWNER_API_SESSION_REQUIRED',
      appr.status === 403 && appr.data.error === 'API_RECHT_VEREIST' && v2.status === 403 && v2.data.error === 'API_RECHT_VEREIST' && apprFout.data.error === 'OWNER_API_SESSION_REQUIRED', JSON.stringify([appr.data, v2.data, apprFout.data]));
    const eigenaarBron = bron('backend/mcp-connector-routes.ts');
    check('MCP-01 eigenaarGate/siteGate laten een «geen recht»-antwoord nooit als eigenaar door', eigenaarBron.includes("auth && !('errorCode' in auth) && auth.user.role === 'owner' ? auth : null") && eigenaarBron.includes("if (!auth || 'errorCode' in auth || auth.user.role !== 'owner') return null;"));
    for (const f of ['api-platform-verbindingen', 'api-platform-tokens', 'api-platform-kluis']) {
      const b = bron(`backend/${f}.ts`);
      check(`U-03 ${f}: poort geeft GEEN_RECHT en antwoord gebruikt weigerCode`, b.includes('return GEEN_RECHT') && b.includes('deps.fail(weigerCode(auth),403)') && !b.includes("deps.fail('OWNER_API_SESSION_REQUIRED',403)"));
    }
  }

  // ---------------------------------------------------------------- U-03 (b): front — muur, geen polling
  {
    const fouten = bron('src/agenten/fouten.ts');
    const { foutTekst, isRechtFout, RECHT_UITLEG } = await import('../../src/agenten/fouten');
    const tr = (uk: string) => uk;
    const e = { message: 'API_RECHT_VEREIST', status: 403, response: { status: 403, data: { error: 'API_RECHT_VEREIST' } } };
    check('fouten.ts: API_RECHT_VEREIST → vriendelijke uitleg (eigenaar geeft «API-платформу»), niet «Сесія закінчилася»', isRechtFout(e) && foutTekst(e, tr).includes('Доступ ШІ для вашого акаунта ще не увімкнено') && foutTekst(e, tr).includes('API-платформу') && !foutTekst(e, tr).includes('Сесія закінчилася') && RECHT_UITLEG[0].includes('Попросіть власника'));
    check('fouten.ts: sessiefout blijft «Сесія закінчилася»', foutTekst({ message: 'OWNER_API_SESSION_REQUIRED', status: 403 }, tr).includes('Сесія закінчилася') && fouten.includes("export const RECHT_CODE = 'API_RECHT_VEREIST'"));
    const data = bron('src/agenten/gegevens.ts');
    check('gegevens.ts: useRustig stopt het herladen na API_RECHT_VEREIST (geen polling meer)', data.includes('if (isRechtFout(e)) geenRecht.current = true') && data.includes('if (!document.hidden && !geenRecht.current) void laad();'));
    check('gegevens.ts: journaal zonder recht → lege lijst (geen eeuwig «Завантаження…») en geen herlaadtimer', data.includes('if (isRechtFout(e)) setItems((oud) => oud ?? [])') && data.includes('!isRechtFout(foutRef.current)) void laad();'));
    // gedeelde poller: stopt zichzelf bij API_RECHT_VEREIST en geeft de fout door
    const { maakGedeeldePoller } = await import('../../src/agenten-gegevens');
    let n = 0;
    const p = maakGedeeldePoller(async () => { n++; throw Object.assign(new Error('API_RECHT_VEREIST'), { status: 403 }); }, 10);
    const af = p.subscribe(() => undefined);
    await new Promise((r) => setTimeout(r, 30));
    await p.laad(); await p.laad();
    check('agents-data: gedeelde poller stopt na API_RECHT_VEREIST (één verzoek, fout zichtbaar, geladen=true)', n === 1 && p.gestopt() && String((p.fout() as Error)?.message) === 'API_RECHT_VEREIST' && p.geladen());
    af();
    const q = maakGedeeldePoller(async () => { throw Object.assign(new Error('OWNER_API_SESSION_REQUIRED'), { status: 403 }); }, 10);
    await q.laad();
    check('agents-data: een gewone sessiefout stopt de poller NIET', !q.gestopt());
    const pagina = bron('src/agenten/AgentenPagina.tsx');
    check('AgentenPagina: zonder recht één muur (data-ag-recht=ontbreekt): geen tabbladen, geen «Стоп», #extensie met dezelfde uitleg',
      pagina.includes("const geenRecht = isRechtFout(ov.fout) || isRechtFout(tok.fout) || isRechtFout(agentsFout);") && /if \(geenRecht\) \{\s*return \(\s*<div className='ag' data-ag-tab=\{plek\.tab\} data-ag-recht='ontbreekt'>/.test(pagina)
      && pagina.includes("data-ag-melding='recht'") && pagina.includes("plek.tab === 'extensie' ? <p>") && !/data-ag-recht='ontbreekt'[\s\S]{0,900}<AiStopKnop/.test(pagina) && !/data-ag-recht='ontbreekt'[\s\S]{0,900}role='tablist'/.test(pagina));
    const ext = bron('src/BrowserExtensiePaneel.tsx');
    check('BrowserExtensionPanel: koppelcode zonder recht → dezelfde uitleg i.p.v. «Не вдалося отримати код підключення»', ext.includes('isRechtFout(e) ? foutTekst(e, tr)'));
  }

  // ---------------------------------------------------------------- 2c: menu, snelbalk, poort
  {
    const { dienstToegestaan, accountRechten, heeftApiRecht } = await import('../../src/account-rechten');
    const lid = accountRechten({ role: 'member', entitlements: [] }), metRecht = accountRechten({ role: 'member', entitlements: ['api-platform'] }), eig = accountRechten({ role: 'owner' });
    check('account-rechten: «Міст ШІ → сайт» alleen met recht of technisch profiel; admin/api alleen met technisch profiel; de rest altijd',
      !dienstToegestaan('mcp', lid, false) && dienstToegestaan('mcp', metRecht, false) && dienstToegestaan('mcp', lid, true) && !dienstToegestaan('admin', metRecht, false) && !dienstToegestaan('api', lid, false) && dienstToegestaan('admin', lid, true) && dienstToegestaan('mail', lid, false) && dienstToegestaan('mcp', eig, false) && heeftApiRecht({ role: 'owner' }) && !heeftApiRecht(null));
    const chrome = bron('src/CanoniekOmlijsting.tsx');
    check('CanonicalChrome: toegestane diensten gefilterd op rechten (geen dode «Оновлення (Адміністрування)» in de snelbalk)', chrome.includes("filter(d=>d===current||dienstToegestaan(d,rechten,techProfiel))") && chrome.includes('rechten?:AccountRechten'));
    const usa = bron('src/VerenigdDienstApp.tsx');
    check('UnifiedServiceApp: rechten doorgegeven; admin.*/api.* zonder technisch profiel → geen zijbalk-tabbladen', usa.includes('rechten={accountRechten(user)}') && usa.includes("!(isSiteBeheer(service)&&tech.geladen&&!tech.profiel)?tabs:[]") && usa.includes('heeftProfiel={!!tech.profiel}'));
    const TechPoort = (await import('../../src/tech/TechPoort')).default;
    const zonder = renderToString(createElement(TechPoort, { lang: 'uk', onAccount: () => undefined, heeftProfiel: false }));
    const met = renderToString(createElement(TechPoort, { lang: 'uk', onAccount: () => undefined, heeftProfiel: true }));
    check('TechPoort zonder profiel: geen «Увімкнути технічний профіль», wel «У вас немає технічного профілю; його дає власник» + «До облікового запису»',
      !zonder.includes('Увімкнути технічний профіль') && zonder.includes('У вас немає технічного профілю') && zonder.includes('До облікового запису') && met.includes('Увімкнути технічний профіль'));
  }

  // ---------------------------------------------------------------- U-01: mailaccounts
  {
    const mfv = bron('src/MailFunctioneelWeergave.tsx'), hub = bron('src/MailAccountsHub.tsx');
    check('U-01 MailAccountsHub krijgt onConnect en de naam uit de sessie (geen «Власник» meer)', mfv.includes("<MailAccountsHub lang={lang} userName={userName||''} onConnect={connectProvider}") && !mfv.includes("userName={'Власник'}") && !hub.includes("userName = 'Власник'") && bron('src/VerenigdDienstApp.tsx').includes("userName={user?.name||''}"));
    // 20.10.2026: de tegel opent nu een ECHT, minimaliseerbaar venster (src/mail/MailKoppelVenster.tsx) in plaats van óf een
    // directe location.assign óf een melding «ще не підтримується». De Google-OAuth zelf is niet weg — die zit nu IN dat venster.
    check('U-01 elke tegel opent een echt koppelvenster (geen directe sprong, geen melding meer)', mfv.includes("mailKoppelenOpenen(provider,") && !mfv.includes('Цей поштовий сервіс поки не підключається тут') && !mfv.includes('startGoogleMailConnection'));
    check('U-01 in dat venster zit de echte weg per dienst: Google-OAuth, Microsoft-OAuth of IMAP met app-wachtwoord', (() => {
      const v = bron('src/mail/MailKoppelVenster.tsx');
      return v.includes("'/api/owner/mail/google-suite/onboarding/start'") && v.includes("provider: 'microsoft'") && v.includes("'/api/owner/mail/imap/koppelen'");
    })());
    let geklikt = '';
    const MailAccountsHub = (await import('../../src/MailAccountsHub')).default;
    const html = renderToString(createElement(MailAccountsHub, { lang: 'uk', userName: 'Олена', accounts: [{ id: 'p1', email: 'olena@example.test', provider: 'Google', status: 'connected' }], onConnect: (p: string) => { geklikt = p; } }));
    check('U-01 kaarten dragen data-mail-provider en de begroeting toont de sessienaam', html.includes('data-mail-provider="gmail"') && html.includes('Вітаємо, Олена!') && !html.includes('Власник') && geklikt === '');
    check('U-01 route bestaat en vereist een mail-sessie', bron('backend/index.ts').includes("'POST /api/owner/mail/google-suite/onboarding/start'"));
  }

  // ---------------------------------------------------------------- 3: rechten in admin/access
  {
    const idx = bron('backend/index.ts'), adm = bron('src/BeheerConsoleWeergave.tsx');
    check('admin/users/:id neemt `entitlements` (genormaliseerd) aan en laat ze anders ongemoeid', idx.includes("const entitlements=Array.isArray(body.entitlements)?normalizeIdentityEntitlements(body.entitlements):target.entitlements;") && idx.includes("IDENTITY_ENTITLEMENTS_V1=['plum-theme','api-platform']"));
    check('admin/users/pagina geeft de rechten per gebruiker mee', idx.includes("entitlements:normalizeIdentityEntitlements(item.entitlements),createdAt:Number(item.createdAt||0)"));
    check('admin/access: schakelaars «Доступ до ШІ-мосту (api-platform)» en «Сливова тема», opgeslagen via dezelfde route (step-up)', adm.includes("['api-platform',tr(lang,'Доступ до ШІ-мосту (api-platform)'") && adm.includes("['plum-theme',tr(lang,'Сливова тема'") && adm.includes("entitlements:item.entitlements||[]})}>{tr(lang,'Зберегти','Opslaan')}"));
  }

  // ---------------------------------------------------------------- 4: welkomstkaart
  {
    const WelkomKaart = (await import('../../src/WelkomKaart')).default;
    const zonderAi = renderToString(createElement(WelkomKaart, { lang: 'uk', ai: false, onOpen: () => undefined, onClose: () => undefined }));
    const metAi = renderToString(createElement(WelkomKaart, { lang: 'uk', ai: true, onOpen: () => undefined, onClose: () => undefined }));
    check('welkomstkaart «Що далі»: 2 stappen zonder recht, 3 met (ШІ alleen met api-platform), sluitknop', zonderAi.includes('Що далі') && (zonderAi.match(/data-welkom-stap=/g) || []).length === 2 && (metAi.match(/data-welkom-stap=/g) || []).length === 3 && metAi.includes('data-welkom-stap="mcp"') && zonderAi.includes('data-hub-welkom-sluiten'));
    const app = bron('src/App.tsx'), idx = bron('backend/index.ts');
    check('hub: kaart alleen op het overzicht, na goedkeuring, zolang de server welkomGesloten=0 meldt; sluiten → /api/owner/ui/welkom/sluiten', app.includes("hubTab==='overview'&&state==='authorized'&&welkom&&<WelkomKaart") && app.includes("api.post('/api/owner/ui/welkom/sluiten'") && app.includes("welkom:user?.status==='approved'&&user.role!=='owner'&&'welkomGesloten'in ui&&!Number(ui.welkomGesloten||0)"));
    check('server: ui-voorkeuren dragen welkomGesloten, de route zet het, opslaan van het menu wist het niet', idx.includes("'POST /api/owner/ui/welkom/sluiten'") && idx.includes('welkomGesloten:Number(row?.welkomGesloten||0)') && idx.includes('welkomGesloten:current?.welkomGesloten,createdAt'));
  }

  // ---------------------------------------------------------------- R-01 / R-02: wachtend account
  {
    const app = bron('src/App.tsx');
    check('R-01 wachtend/nieuw/geblokkeerd: alleen het modaal — geen menu, tabbladen of zijbalkacties', app.includes("const alleenModaal=state==='new'||state==='pending'||state==='blocked'||state==='recoverable';") && app.includes("items={alleenModaal?[]:menuVoorOppervlak(menuPreferences,'account')} tabs={alleenModaal?[]:tabItems}") && app.includes('sidebarActions={alleenModaal?null:sidebarActions}'));
    const usa = bron('src/VerenigdDienstApp.tsx');
    check('R-01 ook op de diensten: wachtend account → geen menu-items', usa.includes("items={!['new','pending','blocked','recoverable'].includes(state)?menuVoorOppervlak("));
    const lader = bron('src/hub-blok-gegevens.ts'), widget = bron('src/HubBlokWidget.tsx');
    check('R-02 hub-datalader vangt OWNER_HUB_DATA_REQUIRED af (lege blokken, geen Uncaught ApiError); widget vangt de rest', lader.includes("==='OWNER_HUB_DATA_REQUIRED')return cached||{storage:'none',observedAt:Date.now(),sources:{}}") && (widget.match(/\.catch\(\(\)=>undefined\)/g) || []).length === 2);
  }

  // ---------------------------------------------------------------- R-05: technisch profiel bij accountwissel
  {
    const idx = bron('backend/index.ts');
    const i1 = idx.indexOf('const techBeeindigd=vorigeUserId&&vorigeUserId!==grant.userId?await techBeeindigenBijUitloggen(vorigeUserId,anchor.tab):0;'), i2 = idx.indexOf('const overlay=await ownerUpsertTabSession(anchor.session,user,anchor.service,sourceOrigin,anchor.tab,grantId', i1);
    check('R-05 replace-tab-remembered beëindigt de activering van het vorige account in dit tabblad vóór de wissel en meldt techBeeindigd', i1 > 0 && i2 > i1 && idx.includes("return ownerResponse({ok:true,replaceScope:'tab',techBeeindigd,"));
    check('R-05 front toont de melding en haalt de technische status opnieuw', bron('src/App.tsx').includes('Технічний профіль попереднього акаунта завершено') && bron('src/VerenigdDienstApp.tsx').includes('Технічний профіль попереднього акаунта завершено') && bron('src/VerenigdDienstApp.tsx').includes('void techVernieuwen()'));
    if (process.env.DATABASE_URL || process.env.DATABASE_URL_SYSTEM) {
      // de bouwsteen zelf: beëindigen per (gebruiker, tabblad) raakt een ander tabblad en een andere gebruiker niet
      const { getPool } = await import('../../server/platform/pg');
      const tp = await import('../../backend/tech-profiel');
      const pool = getPool('systeem');
      const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
      const uid = bestaand ? String(bestaand.id) : randomUUID();
      if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
      else await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: process.env.OWNER_EMAIL || 'eigenaar@eenheid.test', role: 'owner', status: 'approved', name: 'Eigenaar' }]);
      const eig = { id: uid, email: String(process.env.OWNER_EMAIL), role: 'owner', status: 'approved' };
      await tp.profielVan(eig);
      const tA = randomBytes(24).toString('hex'), tB = randomBytes(24).toString('hex');
      const aA = await tp.activeren(eig, tA, 30, 'tab A (wissel)'), aB = await tp.activeren(eig, tB, 30, 'tab B (blijft)');
      const n = await tp.beeindigenBijUitloggen(uid, tA);
      const reden = String((await pool.query('SELECT beeindigd_reden FROM app.tech_activaties WHERE id=$1', [aA.id])).rows[0]?.beeindigd_reden || '');
      check('R-05 beëindigen per tabblad: tab A weg (reden uitgelogd), tab B blijft actief', n === 1 && reden === 'uitgelogd' && !(await tp.actieveActivatie(uid, tA)) && !!(await tp.actieveActivatie(uid, tB)), `${n} ${reden}`);
      await tp.beeindigenBijIntrekken(uid, 'handmatig');
      void aB;
    } else console.log('OVERGESLAGEN R-05 runtime: geen database');
  }

  // ---------------------------------------------------------------- U-05 / U-06 / TOK-01
  {
    const scv = bron('src/InstellingencentrumWeergave.tsx');
    check('U-05 delen: Учасник ziet «Надати доступ»/«Приватне посилання» uit, met uitleg; eigenaar/beheerder niet', scv.includes("const magDelen=p.user.role==='owner'||p.user.role==='admin';") && scv.includes("data-delen-uitleg='1'") && scv.includes("disabled={!magDelen||!workspaceId||p.busy}><Share2/>") && scv.includes("onClick={()=>void createLink()} disabled={!magDelen||!workspaceId||p.busy}"));
    check('U-06 profielkaart toont de rolnaam (Власник/Адміністратор/Учасник/Глядач), niet «Повний доступ» voor iedereen', scv.includes("<small data-rol={p.user.role}>") && scv.includes("tr('Учасник','Deelnemer')}{p.user.accessLevel==='limited'") && !scv.includes("tr('Повний доступ','Volledige toegang')"));
    const ai = bron('src/agenten/AiVerbinden.tsx');
    check('TOK-01 #tokens: naamveld voor het token; `klant` blijft het bord-id', ai.includes("data-token-naam='1'") && ai.includes("name: tokenNaam.trim().slice(0, 80) || (k.id === 'overig' ? 'agent' : k.id), klant: k.id,"));
    const naar = bron('src/toegangslaag-panelen.tsx');
    check('U-07 methods/security/recovery scrollen naar hun sectie (naarSectie)', naar.includes('export const naarSectie=') && naar.includes('naarSectie(tab),450'));
    const aiv = bron('src/AIDienstWeergave.tsx');
    check('AI-02 ai.* «Підключити ШІ» voor niet-eigenaar → hub connectors; uitleg over eigen Anthropic-sleutel alleen voor de eigenaar', aiv.includes("onAction={() => location.assign(hubUrl('connectors'))}") && /eigenaar \? <ProductEmptyState[\s\S]{0,600}onAction=\{openVault\}/.test(aiv));
  }

  // ---------------------------------------------------------------- U-04: extensie aan een ander account
  {
    const hb = bron('src/browser-agent-hartslag.ts'), ext = bron('src/BrowserExtensiePaneel.tsx');
    check('U-04 heartbeat: 403 → bevestigingen gestopt (clearInterval), toestand gemeld; nieuwe hello met andere agent begint opnieuw', hb.includes("if (status === 403) { geweigerd = String((e as { message?: string } | null)?.message || 'HTTP_403'); window.clearInterval(beatTimer); meldHeartbeat(); }") && hb.includes("if (!agentId || geweigerd) return;") && hb.includes("agentId = id; geweigerd = '';"));
    check('U-04 panel: kaart «Розширення прив’язане до іншого облікового запису» bij PING mismatch of geweigerde heartbeat van een vreemde agent, met knop «Підключити до цього акаунта»',
      ext.includes("ping.account === 'mismatch' || (!!hb.geweigerd && !!ping.agentId && hb.agentId === ping.agentId && !agents.some((a) => a.id === ping.agentId))") && ext.includes("data-ext-mismatch='1'") && ext.includes('Розширення прив’язане до іншого облікового запису') && ext.includes('Підключити до цього акаунта') && (ext.match(/\{mismatchKaart\}/g) || []).length === 2);
  }

  return einde();
}
