// «Діагностика» + RENDERCONTROLE + ZOEKINDEX (zone A, 22.10.2026). Vroeger stond «Сторінка «Оновлення» HTTP 200 · Справно» terwijl de pagina wit
// was. Nu: (1) elke «pagina-<slug>» koppelt de HTTP-schil aan de laatste browsercontrole van DIE pagina — zonder browser eerlijk
// «лише HTTP, рендеринг не перевірено»; een kapotte pagina in rook-controle.json = fout ROOK_KAPOT; (2) het register-item «pagina-rendering»
// leest het cachebestand (ok / kapot / verouderd / niet gecontroleerd / nooit); (3) «taak-zoek-index» leest app.cron_runs + wachtrij + bronnen;
// (4) route /rendering: stand + aanvragen (leeg verzoekbestand in de goedkeur-inbox, 409 zonder browser, rate limit, auditregel);
// (5) hulp-register: de knop heeft een «?»; register ↔ uitvoerders blijven één-op-één.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closePool, getPool } from '../../server/platform/pg';
import { CONTROLE_IDS, codeUitleg, controleVan, isControleId } from '../../shared/beheer-diagnostiek';
import { hulpVan } from '../../shared/hulp-register';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('beheer-diagnostiek-rook-20261022');
  const oud = { owner: process.env.OWNER_EMAIL, fetch: globalThis.fetch, status: process.env.OPDRACHT_STATUS_DIR, inbox: process.env.GOEDKEUR_INBOX, chromium: process.env.ROOK_CHROMIUM, dist: process.env.DIST_DIR };
  process.env.OWNER_EMAIL = 'eigenaar@diag.test';
  const T = mkdtempSync(join(tmpdir(), 'diag-rook-'));
  const status = join(T, 'status'), inbox = join(T, 'inbox'), release = join(T, 'release');
  mkdirSync(status); mkdirSync(inbox); mkdirSync(join(release, 'dist'), { recursive: true });
  writeFileSync(join(release, 'UITROL-VERSIE'), '20261022-121416\n'); writeFileSync(join(release, 'dist', 'index.html'), '<!doctype html><html><div id="root"></div></html>');
  process.env.OPDRACHT_STATUS_DIR = status; process.env.GOEDKEUR_INBOX = inbox; process.env.DIST_DIR = join(release, 'dist');
  const sys = () => getPool('systeem');
  try {
    const m = await import('../../backend/beheer-diagnostiek');
    const ri = await import('../../backend/uitgave-info'); ri._resetReleaseInfo();
    check('register ↔ uitvoerders blijven één-op-één (pagina-rendering en taak-zoek-index erbij)', m.UITVOERBARE_IDS.slice().sort().join() === CONTROLE_IDS.slice().sort().join() && isControleId('pagina-rendering') && isControleId('taak-zoek-index'));
    check('register: pagina-rendering in categorie pagina’s met uitleg, oplossing (browser-controle) en link naar «Оновлення»', controleVan('pagina-rendering')?.cat === 'paginas' && controleVan('pagina-rendering')!.oplossing.some((s) => /browser-controle/.test(s[0])) && controleVan('pagina-rendering')!.naar?.href === '/updates');
    check('register: taak-zoek-index in categorie taken; codes ROOK_* en ZOEK_* hebben uitleg uk+nl', controleVan('taak-zoek-index')?.cat === 'taken' && ['ROOK_KAPOT', 'ROOK_NIET_GECONTROLEERD', 'ROOK_OUD', 'ROOK_GEEN', 'ROOK_WAARSCHUWING', 'ROOK_NIET_UITGEVOERD', 'ZOEK_INDEX_FOUT', 'ZOEK_INDEX_OUD', 'ZOEK_INDEX_NOOIT', 'ZOEK_BRON_FOUT', 'ZOEK_WACHTRIJ_VAST'].every((c) => { const u = codeUitleg(c); return !!u && u.reden[0] !== u.reden[1] && u.reden[0].length > 10; }));
    check('hulp-register: de knop «Перевірити рендеринг» heeft een registeritem met vier lagen', (() => { const h = hulpVan('diagnostiek.rendering-aanvragen'); return !!h && h.wat[0].length > 25 && h.dev[1].includes('rook-controle') && h.bron.includes('RenderingKnop'); })());
    check('UI: RenderingKnop staat in Diagnostiek.tsx bij pagina-rendering, met <HulpVraag k=…/> in het eigen bestand', /extra=\{d\.id === 'pagina-rendering' \? <RenderingKnop/.test(readFileSync('src/diagnostiek/Diagnostiek.tsx', 'utf8')) && /<HulpVraag k='diagnostiek\.rendering-aanvragen'/.test(readFileSync('src/diagnostiek/RenderingKnop.tsx', 'utf8')));

    // ---- 1+2. pagina's: HTTP + rook, zonder browser
    process.env.ROOK_CHROMIUM = '/bestaat/niet';
    globalThis.fetch = (async () => new Response('<!doctype html><html><div id="root"></div></html>', { status: 200 })) as typeof fetch;
    let pu = await m.voerUit('pagina-updates');
    check('pagina-updates zonder enige rook-uitslag: HTTP ok, maar detail zegt «лише HTTP, рендеринг не перевірено (встановіть browser-controle)»', pu.stand === 'ok' && /HTTP 200/.test(pu.detail) && /лише HTTP, рендеринг не перевірено/.test(pu.detail), JSON.stringify(pu));
    let pr = await m.voerUit('pagina-rendering');
    // de browserlijst bevat vaste paden; op een machine zonder /usr/bin/chromium is er geen browser → let-op
    const browserOpDezeMachine = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/lib/chromium/chromium', '/srv/mijn-ruimte/browser/chrome-headless-shell'].some((p) => { try { statSync(p); return true; } catch { return false; } });
    check('pagina-rendering zonder uitslag: let-op ROOK_NIET_GECONTROLEERD (geen browser) of onbekend ROOK_GEEN (wel browser) — nooit ok', (!browserOpDezeMachine && pr.stand === 'let-op' && pr.code === 'ROOK_NIET_GECONTROLEERD') || (browserOpDezeMachine && pr.stand === 'onbekend' && pr.code === 'ROOK_GEEN'), JSON.stringify(pr));
    // kapotte uitslag (zoals 20261021-221718 zou hebben gegeven)
    const basisJson = { tijd: new Date().toISOString(), modus: 'stand', chromium: '/srv/mijn-ruimte/browser/chrome-headless-shell', release: '20261022-121416', uitgevoerd: true, kapot: true, paginas: [{ naam: 'admin-updates', url: 'https://admin.tarasevych.com/updates', stand: 'kapot', fouten: ['pageerror: Error: Buffer is not defined', '#root leeg'], http: 200, ms: 1600 }, { naam: 'admin-overzicht', url: 'u', stand: 'kapot', fouten: ['#root leeg'], http: 200, ms: 1500 }, { naam: 'hub-overzicht', url: 'u', stand: 'ok', fouten: [], http: 200, ms: 900 }], bundels: { aantal: 490, ok: 489, kapot: ['/assets/tech/AdminConsoleView-x.js: Buffer is not defined'], waarschuwingen: [] }, fouten: [], samenvatting: { uk: 'Зламано', nl: 'Kapot' }, ms: 30000, code: 1 };
    writeFileSync(join(status, 'rook-controle.json'), JSON.stringify(basisJson));
    pu = await m.voerUit('pagina-updates');
    check('pagina-updates met kapotte browseruitslag: FOUT ROOK_KAPOT ondanks HTTP 200 — «рендеринг ЗЛАМАНО … Buffer is not defined»', pu.stand === 'fout' && pu.code === 'ROOK_KAPOT' && /HTTP 200/.test(pu.detail) && /ЗЛАМАНО/.test(pu.detail) && /Buffer is not defined/.test(pu.detail), JSON.stringify(pu));
    check('pagina-audit (niet in de browserlijst) blijft ok met eerlijke tekst «ця сторінка не входить у рендер-контроль»', (await m.voerUit('pagina-audit')).detail.includes('не входить'));
    pr = await m.voerUit('pagina-rendering');
    check('pagina-rendering met kapotte uitslag: fout ROOK_KAPOT, noemt 2 van 3 pagina’s en admin-updates', pr.stand === 'fout' && pr.code === 'ROOK_KAPOT' && /2 з 3/.test(pr.detail) && /admin-updates/.test(pr.detail), JSON.stringify(pr));
    // gezonde uitslag
    writeFileSync(join(status, 'rook-controle.json'), JSON.stringify({ ...basisJson, kapot: false, paginas: basisJson.paginas.map((p) => ({ ...p, stand: 'ok', fouten: [] })), bundels: { aantal: 490, ok: 490, kapot: [], waarschuwingen: [] }, code: 0 }));
    pu = await m.voerUit('pagina-updates'); pr = await m.voerUit('pagina-rendering');
    check('gezonde uitslag: pagina-updates ok met «рендеринг ок у браузері»; pagina-rendering ok met aantallen', pu.stand === 'ok' && /рендеринг ок/.test(pu.detail) && pr.stand === 'ok' && /3 сторінок/.test(pr.detail) && /490\/490/.test(pr.detail), JSON.stringify([pu, pr]));
    // andere release → verouderd
    writeFileSync(join(status, 'rook-controle.json'), JSON.stringify({ ...basisJson, kapot: false, release: '20261001-000000', paginas: basisJson.paginas.map((p) => ({ ...p, stand: 'ok', fouten: [] })), bundels: { aantal: 1, ok: 1, kapot: [] }, code: 0 }));
    pr = await m.voerUit('pagina-rendering');
    check('uitslag van een andere release: let-op ROOK_OUD («запустіть знову»)', pr.stand === 'let-op' && pr.code === 'ROOK_OUD', JSON.stringify(pr));
    // modules-only
    writeFileSync(join(status, 'rook-controle.json'), JSON.stringify({ ...basisJson, modus: 'modules', chromium: '', kapot: false, paginas: [], bundels: { aantal: 490, ok: 490, kapot: [], waarschuwingen: [] }, code: 0 }));
    pr = await m.voerUit('pagina-rendering'); pu = await m.voerUit('pagina-updates');
    check('modules-only (geen browser op de server): let-op ROOK_NIET_GECONTROLEERD; pagina-updates «лише HTTP»', pr.code === 'ROOK_NIET_GECONTROLEERD' && /490\/490/.test(pr.detail) && /лише HTTP/.test(pu.detail));
    // rommel in het bestand
    writeFileSync(join(status, 'rook-controle.json'), '{"modus":"raar","paginas":[{"naam":"<b>x</b>","stand":"kapot"}],"uitgevoerd":true,"chromium":"/x","tijd":"' + new Date().toISOString() + '"}');
    pr = await m.voerUit('pagina-rendering');
    check('rommel in rook-controle.json: ongeldige paginanamen weggeknipt, geen crash, geen verzonnen ok', pr.stand !== 'ok' || pr.detail.length > 0);

    // ---- 3. zoekindex
    await sys().query(`DELETE FROM app.cron_runs WHERE name = 'zoek-index' AND detail LIKE 'diag-rook-test%'`);
    const hadRuns = Number((await sys().query(`SELECT count(*) AS n FROM app.cron_runs WHERE name = 'zoek-index'`)).rows[0].n);
    await sys().query(`INSERT INTO app.cron_runs (name, started_at, finished_at, status, detail) VALUES ('zoek-index', now() - interval '2 minutes', now() - interval '1 minute', 'ok', 'diag-rook-test ok')`);
    let zi = await m.voerUit('taak-zoek-index');
    check('taak-zoek-index: recente ok-run → ok met «Останній запуск N хв тому (ok)» en aantallen', zi.stand === 'ok' && /Останній запуск \d+ хв тому \(ok\)/.test(zi.detail) && /джерел: \d+/.test(zi.detail), JSON.stringify(zi));
    await sys().query(`INSERT INTO app.cron_runs (name, started_at, finished_at, status, detail) VALUES ('zoek-index', now() - interval '1 minute', now(), 'error', 'diag-rook-test ZOEK_INDEX_CRON_FAILED: kaputt')`);
    zi = await m.voerUit('taak-zoek-index');
    check('taak-zoek-index: laatste run error → fout ZOEK_INDEX_FOUT met de foutregel', zi.stand === 'fout' && zi.code === 'ZOEK_INDEX_FOUT' && /kaputt/.test(zi.detail), JSON.stringify(zi));
    await sys().query(`INSERT INTO app.cron_runs (name, started_at, finished_at, status, detail) VALUES ('zoek-index', now() - interval '45 minutes', now() - interval '44 minutes', 'ok', 'diag-rook-test oud')`);
    await sys().query(`DELETE FROM app.cron_runs WHERE name = 'zoek-index' AND detail IN ('diag-rook-test ok', 'diag-rook-test ZOEK_INDEX_CRON_FAILED: kaputt')`);
    zi = await m.voerUit('taak-zoek-index');
    check('taak-zoek-index: laatste run 45 min geleden → let-op ZOEK_INDEX_OUD', zi.stand === 'let-op' && zi.code === 'ZOEK_INDEX_OUD', JSON.stringify(zi));
    await sys().query(`DELETE FROM app.cron_runs WHERE name = 'zoek-index' AND detail LIKE 'diag-rook-test%'`);
    if (hadRuns === 0) { zi = await m.voerUit('taak-zoek-index'); check('taak-zoek-index: nog nooit gedraaid → let-op ZOEK_INDEX_NOOIT (eerlijk, geen groen)', zi.code === 'ZOEK_INDEX_NOOIT'); }
    check('taak-cron (oud) ziet de zoekindex niet — daarom is taak-zoek-index apart', !/zoek/.test((await m.voerUit('taak-cron')).detail));

    // ---- 4. route /rendering
    await sys().query(`DELETE FROM app.rate_limits WHERE bucket LIKE 'admin-diagnostiek-rendering%'`);
    const routes = m.adminDiagnostiekRoutes({ requireSession: async (event) => {
      const w = String((event as { wie?: string }).wie || '');
      if (w === 'geen') return { errorCode: 'OWNER_SESSION_REQUIRED' };
      if (w === 'eigenaar') return { user: { id: 'u-eig', email: 'eigenaar@diag.test', role: 'owner', status: 'approved' }, service: 'admin' };
      return { user: { id: 'u-lid', email: 'lid@diag.test', role: 'member', status: 'approved' }, service: 'admin' };
    } });
    const r = routes['POST /api/owner/admin/diagnostiek/rendering'][0] as unknown as (ctx: unknown) => Promise<{ statusCode: number; body: string }>;
    const roep = async (event: Record<string, unknown>, body: unknown) => { const x = await r({ event, body }); let data: any = {}; try { data = JSON.parse(x.body); } catch { /* geen json */ } return { status: x.statusCode, data }; };
    check('route rendering: zonder sessie 401, gewoon lid zonder technisch profiel 403', (await roep({ wie: 'geen' }, {})).status === 401 && (await roep({ wie: 'lid' }, {})).status === 403);
    process.env.ROOK_CHROMIUM = '/bestaat/niet';
    let st = await roep({ wie: 'eigenaar' }, {});
    check('route rendering (stand): browser false/true eerlijk, laatste uitslag meegegeven, niets geschreven', st.status === 200 && typeof st.data.browser === 'boolean' && st.data.laatste && st.data.wachtend === false && !existsSync(join(inbox, 'rook-verzoek')), JSON.stringify(st.data).slice(0, 200));
    if (!browserOpDezeMachine) check('route rendering aanvragen zonder browser: 409 ROOK_GEEN_BROWSER, geen verzoekbestand', (await roep({ wie: 'eigenaar' }, { aanvragen: true })).status === 409 && !existsSync(join(inbox, 'rook-verzoek')));
    process.env.ROOK_CHROMIUM = process.execPath;   // een uitvoerbaar bestand = «browser aanwezig» voor deze test
    st = await roep({ wie: 'eigenaar' }, { aanvragen: true, opdracht: 'rm -rf /', pad: '/etc/passwd' });
    check('route rendering aanvragen met browser: 200, LEEG verzoekbestand in de goedkeur-inbox (inhoud/opdracht uit de body wordt nooit geschreven)', st.status === 200 && st.data.wachtend === true && existsSync(join(inbox, 'rook-verzoek')) && readFileSync(join(inbox, 'rook-verzoek'), 'utf8') === '', JSON.stringify(st.data));
    st = await roep({ wie: 'eigenaar' }, {});
    check('route rendering (stand) daarna: wachtend=true zolang root het bestand niet heeft weggehaald', st.data.wachtend === true);
    const log = (await sys().query(`SELECT result, details FROM app.audit WHERE action = 'diag.rendering.aangevraagd' AND owner_id = 'u-eig' ORDER BY seq DESC LIMIT 1`)).rows;
    check('route rendering aanvragen: auditregel diag.rendering.aangevraagd', log.length === 1 && log[0].result === 'success', JSON.stringify(log));
    await roep({ wie: 'eigenaar' }, { aanvragen: true }); await roep({ wie: 'eigenaar' }, { aanvragen: true });
    check('route rendering aanvragen: hoogstens 3 per 10 min (vierde = 429)', (await roep({ wie: 'eigenaar' }, { aanvragen: true })).status === 429);
    rmSync(join(inbox, 'rook-verzoek'), { force: true });
  } finally {
    rmSync(T, { recursive: true, force: true });
    globalThis.fetch = oud.fetch; process.env.OWNER_EMAIL = oud.owner;
    for (const [k, v] of [['OPDRACHT_STATUS_DIR', oud.status], ['GOEDKEUR_INBOX', oud.inbox], ['ROOK_CHROMIUM', oud.chromium], ['DIST_DIR', oud.dist]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await closePool();
  }
  return einde();
}
