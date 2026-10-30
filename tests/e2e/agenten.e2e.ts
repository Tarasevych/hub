// E2E mcp.*/agents (RUNBOOK §13.9) met een echte Chrome tegen de lokale build (opzet zoals bevestig-toegang.e2e.ts).
// Zaait: een pc-agent, een browserextensie, een OAuth-verbinding (Claude), een agenttoken (grok) en een «перевстановлено»-geschiedenis.
// Toetst: tabbladen via de hash en oude deep links (#claude, #dev:<id>), rijen dicht → uitklappen met technische gegevens,
// intrekken met bevestiging op de pagina → spinner → duidelijke melding → rij naar «Відкликані» zonder herladen, het journaal
// toont het intrekken, nergens een kale «RATE_LIMITED» (ook niet bij een nagebootste 429), geen lus van grants/list, geen consolefouten.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import * as store from '../../backend/connectors-opslag';
import { auditToevoegen } from '../../server/platform/audit';
import { startE2eServer, chromeArgs } from './server';
import { actieSoort } from '../../shared/mcp-acties';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
// Verwacht: de bewust nagebootste 429 op het overzicht.
const VERWACHT = [/^429 .*\/api\/owner\/agents\/overzicht$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e agenten');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-ag-${T}@example.test`, sub = `sub-e2e-ag-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  let uid = '';
  const clientId = `e2e-claude-${T}`;
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const r = await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    check('aanmelden op mcp gaf een sessie', r.cb.data.sessionCreated === true, JSON.stringify(r.cb.data).slice(0, 200));
    uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    check('eigenaar bestaat', !!uid);

    // ---- zaaien ----
    const pc = await store.createAgent(uid, 'Робочий ПК', 'win32-x64', sha(`pc-${T}`), { roots: ['D:\\werk'] }, { autoApprove: ['list_dir'] }, { version: '1.4.0', pairingId: `pair-${T}`.replace(/[^A-Za-z0-9_-]/g, '') });
    const br = await store.createAgent(uid, 'Chrome · ноутбук', 'browser', sha(`br-${T}`), {}, undefined, { version: '0.9.3' });
    const oud = await store.createAgent(uid, 'Chrome · ноутбук', 'browser', sha(`oud-${T}`), {}, undefined, { version: '0.9.2' });
    await sys.query("UPDATE app.agents SET revoked_at = now() - interval '2 days', revoke_reason = 'repaired', status = 'disconnected' WHERE id = $1", [oud.id]);
    await sys.query("UPDATE app.agents SET last_seen_at = now() - interval '3 hours' WHERE id = ANY($1)", [[pc.id, br.id]]);
    await sys.query('INSERT INTO app.mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, $2, $3)', [clientId, 'Claude', ['https://claude.ai/api/mcp/auth_callback']]);
    const grant = (await sys.query(`INSERT INTO app.mcp_oauth_tokens (user_id, client_id, client_name, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at, last_used_at)
      VALUES ($1, $2, 'Claude', 'mcp', $3, $4, now() + interval '1 hour', now() + interval '30 days', now() - interval '2 days') RETURNING id::text`, [uid, clientId, sha(`a-${T}`), sha(`r-${T}`)])).rows[0].id as string;
    const tok = (await sys.query(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, calls, last_seen_at) VALUES ($1, 'grok', 'mcpc_e2e1', $2, 7, now() - interval '1 day') RETURNING id::text`, [uid, sha(`t-${T}`)])).rows[0].id as string;
    await auditToevoegen({ ownerId: uid, action: 'owner.agent.paired', type: 'beveiliging', result: 'success', details: { agentId: br.id, name: 'Chrome · ноутбук', platform: 'browser', version: '0.9.3', replaced: 1, replacedIds: [oud.id] } });
    await auditToevoegen({ ownerId: uid, action: 'owner.mcp.grant.connected', type: 'beveiliging', result: 'success', details: { grantId: grant, clientId, clientName: 'Claude', scope: 'mcp' } });

    const ctx = await browser.newContext({ colorScheme: 'dark', locale: 'uk-UA', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    const fouten: string[] = [];
    let grantsList = 0, ratelimitTekst = '';
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { if (q.status() >= 400 && !VERWACHT.some((v) => v.test(`${q.status()} ${q.url()}`))) fouten.push(`http ${q.status()} ${q.url()}`); });
    page.on('request', (q) => { if (q.url().endsWith('/api/owner/ai/grants/list')) grantsList++; });
    const geenRate = async (waar: string) => { const t = await page.locator('body').innerText().catch(() => ''); if (/RATE_LIMITED/.test(t) && !ratelimitTekst) ratelimitTekst = `${waar}: ${t.slice(t.indexOf('RATE_LIMITED') - 80, t.indexOf('RATE_LIMITED') + 20)}`; };
    // Thema wisselen zoals de site het doet: de klasse staat op <html> én op de app-schil (.canonical-chrome).
    const thema = (naar: 'light' | 'dark') => page.evaluate((n) => {
      const els = [document.documentElement, ...document.querySelectorAll('[class*="theme-"]')] as HTMLElement[];
      for (const el of els) { if (![...el.classList].some((c) => /^theme-(light|dark|plum-light|plum-dark)$/.test(c))) continue; el.classList.remove('theme-light', 'theme-dark', 'theme-plum-light', 'theme-plum-dark'); el.classList.add(`theme-${n}`); }
      document.documentElement.classList.add(`theme-${n}`); document.documentElement.style.colorScheme = n;
    }, naar);
    const licht = () => thema('light');
    const donker = () => thema('dark');
    const tabSel = (p: Page) => p.locator('[role=tab][aria-selected=true]').getAttribute('data-tab');

    // ---------------------------------------------------------------- 1. oude deep link #claude → #ai
    await page.goto(`${MCP}/agents#claude`, { waitUntil: 'networkidle' });
    await page.locator('.ag-tabs').waitFor({ timeout: 20000 });
    await page.locator('[data-lijst="ai"] [data-rij]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
    await page.evaluate(() => { (window as unknown as { __zelfde: number }).__zelfde = 42; });
    check('oude link #claude → tab «Підключені ШІ», hash #ai', await tabSel(page) === 'ai' && new URL(page.url()).hash === '#ai', `${await tabSel(page)} ${page.url()}`);
    const tabs = await page.locator('[role=tab]').allInnerTexts();
    check('tabbladen: Огляд | Підключені ШІ | Доступ ШІ за підписом | Пристрої й браузери | Токени й двері | Журнал', ['Огляд', 'Підключені ШІ', 'Доступ ШІ за підписом', 'Пристрої й браузери', 'Токени й двері', 'Журнал'].every((n, i) => (tabs[i] || '').includes(n)), tabs.join(' | '));
    const aiRijen = page.locator('[data-lijst="ai"] > [data-rij]');
    check('«Підключені ШІ»: Claude (OAuth) en grok (MCP-токен), kop «Ви надали доступ 2 …»', await aiRijen.count() === 2 && /Claude/.test(await aiRijen.allInnerTexts().then((x) => x.join(' '))) && /grok/.test(await aiRijen.allInnerTexts().then((x) => x.join(' '))) && /2/.test(await page.locator('.ag-lijstkop-tekst').first().innerText()), await page.locator('[data-tab-inhoud="ai"]').innerText().catch(() => ''));
    check('rijen standaard dicht (geen details, aria-expanded=false)', await page.locator('.ag-rij-details').count() === 0 && (await page.locator('[data-lijst="ai"] .ag-rij-toggle').evaluateAll((els) => els.map((e) => e.getAttribute('aria-expanded')))).every((x) => x === 'false'));
    await page.screenshot({ path: `${UIT}/agenten-01-ai-donker.png`, fullPage: true });

    // ---------------------------------------------------------------- 2. uitklappen
    const claude = page.locator(`[data-rij="oauth:${grant}"]`);
    await claude.locator('.ag-rij-toggle').click();
    await claude.locator('.ag-rij-details .ag-tech').waitFor({ timeout: 5000 }).catch(() => undefined);
    const tech = await claude.locator('.ag-rij-details').innerText().catch(() => '');
    check('uitklappen: technische gegevens (grant-id, client-id, scope), hash met item', tech.includes(grant) && tech.includes(clientId) && /mcp/.test(tech) && decodeURIComponent(new URL(page.url()).hash) === `#ai/oauth:${grant}`, `${page.url()} | ${tech.slice(0, 300)}`);
    await page.screenshot({ path: `${UIT}/agenten-02-ai-open.png`, fullPage: true });

    // ---------------------------------------------------------------- 3. intrekken: bevestigen → spinner → melding → «Відкликані»
    await page.route('**/api/owner/mcp-connector/grants/*/revoke', async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.continue(); });
    await page.locator(`[data-knop="oauth:${grant}"]`).click();
    const bevestig = page.locator(`[data-bevestig="oauth:${grant}"]`);
    check('intrekken vraagt eerst bevestiging op de pagina (geen window.confirm)', await bevestig.isVisible() && /одразу|втратить|відкликати/i.test(await bevestig.innerText()), await bevestig.innerText().catch(() => ''));
    await page.screenshot({ path: `${UIT}/agenten-03-bevestigen.png` });
    let dialoog = false; page.on('dialog', (d) => { dialoog = true; void d.dismiss(); });
    await page.locator(`[data-knop="oauth:${grant}:ja"]`).click();
    const spinner = await page.locator(`[data-knop="oauth:${grant}"][aria-busy=true] .ag-spin`).waitFor({ timeout: 2000 }).then(() => true).catch(() => false);
    const melding = page.locator('[data-ag-melding="ok"]');
    await melding.waitFor({ timeout: 10000 }).catch(() => undefined);
    const mt = await melding.innerText().catch(() => '');
    check('spinner tijdens het intrekken', spinner);
    check('melding zegt wat er veranderde («Доступ «Claude» відкликано о …», «Відкликані»)', /Доступ «Claude» відкликано о/.test(mt) && /Відкликані/.test(mt) && !dialoog, mt);
    const hist = page.locator('[data-groep="ai-historie"]');
    await hist.locator('summary').click();
    const inHist = hist.locator(`[data-rij="oauth:${grant}"][data-status="ingetrokken"]`);
    check('rij staat nu in de groep «Відкликані» met datum, actieve lijst heeft 1 rij, zonder herladen',
      await inHist.count() === 1 && /Відкликано/.test(await inHist.innerText()) && await aiRijen.count() === 1 && await page.evaluate(() => (window as unknown as { __zelfde?: number }).__zelfde) === 42, await hist.innerText().catch(() => ''));
    const db = await sys.query('SELECT revoked_at FROM app.mcp_oauth_tokens WHERE id = $1', [grant]);
    check('database: grant ingetrokken', !!db.rows[0]?.revoked_at);
    await page.screenshot({ path: `${UIT}/agenten-04-ingetrokken.png`, fullPage: true });
    await geenRate('ai');

    // ---------------------------------------------------------------- 4. apparaten: oude deep link #dev:<id>, editor, loskoppelen
    await page.goto(`${MCP}/agents#dev:${pc.id}`, { waitUntil: 'networkidle' });
    const pcRij = page.locator(`[data-rij="dev:${pc.id}"]`);
    await pcRij.locator('.ag-rij-details').waitFor({ timeout: 15000 }).catch(() => undefined);
    check('oude link #dev:<id> → tab «Пристрої й браузери», rij open, hash #apparaten/dev:<id>', await tabSel(page) === 'apparaten' && decodeURIComponent(new URL(page.url()).hash) === `#apparaten/dev:${pc.id}` && await pcRij.locator('.ag-rij-details').count() === 1, page.url());
    const pcTech = await pcRij.locator('.ag-tech').first().innerText().catch(() => '');
    check('pc-rij open: id, versie 1.4.0, platform, pairing, token geldig tot', pcTech.includes(pc.id) && pcTech.includes('1.4.0') && pcTech.includes('win32-x64') && /Токен діє до/.test(pcTech), pcTech.slice(0, 400));
    await pcRij.locator('.ai-presets').waitFor({ timeout: 10000 }).catch(() => undefined);
    const presets = await pcRij.locator('.ai-presets [role=radio]').allInnerTexts();
    check('editor: presets als gesegmenteerde keuze (Спостерігач/Помічник/Разово) met (?)', presets.length === 3 && /Спостерігач/.test(presets.join()) && await pcRij.locator('.ai-presets .hub-help-btn').count() === 3, presets.join(','));
    check('editor: «Окремий дозвіл» als formulierrij', await pcRij.locator('form.ai-grant-form .ai-veld').count() >= 2);
    const overloop = await pcRij.evaluate((el) => [...el.querySelectorAll('.ag-rij-details *')].filter((x) => { const r = x.getBoundingClientRect(); const p = el.getBoundingClientRect(); return r.width > 0 && r.right > p.right + 1; }).map((x) => `${x.tagName}.${x.className}`).slice(0, 5));
    check('editor: niets steekt buiten de rij uit (1280 px)', overloop.length === 0, overloop.join(', '));
    await page.screenshot({ path: `${UIT}/agenten-05-apparaat-open.png`, fullPage: true });
    // Geen lus meer: in 8 s met een open apparaat hoogstens enkele grants/list-aanvragen.
    const voor = grantsList; await page.waitForTimeout(8000);
    check('geen renderlus: ≤ 3 × /api/owner/ai/grants/list in 8 s (vroeger honderden → RATE_LIMITED)', grantsList - voor <= 3, String(grantsList - voor));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const smal = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check('smal scherm (390 px): geen horizontale overloop', smal);
    await page.screenshot({ path: `${UIT}/agenten-06-apparaat-mobiel.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });

    const brRij = page.locator(`[data-rij="dev:${br.id}"]`);
    await page.locator(`[data-knop="dev:${br.id}"]`).click();
    await page.locator(`[data-knop="dev:${br.id}:ja"]`).click();
    const m2 = page.locator('[data-ag-melding="ok"]');
    await m2.waitFor({ timeout: 10000 }).catch(() => undefined);
    const m2t = await m2.innerText().catch(() => '');
    check('browser loskoppelen: melding «Браузер «…» відключено о …», rij weg uit de actieve lijst', /Браузер «Chrome · ноутбук» відключено о/.test(m2t) && await page.locator(`[data-lijst="apparaten"] [data-rij="dev:${br.id}"]`).count() === 0, m2t);
    const ah = page.locator('[data-groep="apparaten-historie"]');
    await ah.locator('summary').click();
    const histTekst = await ah.innerText().catch(() => '');
    check('geschiedenis apparaten: «Відключено» (zojuist) en «Перевстановлено» (oude installatie)', /Відключено/.test(histTekst) && /Перевстановлено/.test(histTekst) && await ah.locator(`[data-rij="weg:${br.id}"]`).count() === 1 && await ah.locator(`[data-rij="weg:${oud.id}"][data-reden="repaired"]`).count() === 1, histTekst.slice(0, 300));
    void brRij;
    await page.screenshot({ path: `${UIT}/agenten-07-apparaten-donker.png`, fullPage: true });
    await licht(); await page.waitForTimeout(200);
    await page.screenshot({ path: `${UIT}/agenten-08-apparaten-licht.png`, fullPage: true });
    await donker();
    await geenRate('apparaten');

    // ---------------------------------------------------------------- 5. tokens: intrekken
    await page.locator('[role=tab][data-tab="tokens"]').click();
    await page.locator(`[data-rij="tok:${tok}"]`).waitFor({ timeout: 10000 }).catch(() => undefined);
    check('tab «Токени й двері» via klik, hash #tokens', new URL(page.url()).hash === '#tokens' && await page.locator(`[data-rij="tok:${tok}"]`).count() === 1);
    await page.locator(`[data-knop="tok:${tok}"]`).click();
    await page.locator(`[data-knop="tok:${tok}:ja"]`).click();
    await page.locator('[data-ag-melding="ok"]').waitFor({ timeout: 10000 }).catch(() => undefined);
    check('token intrekken: melding en rij naar «Відкликані»', /Токен «grok» відкликано/.test(await page.locator('[data-ag-melding="ok"]').innerText().catch(() => '')) && await page.locator(`[data-groep="tokens-historie"] [data-rij="tok:${tok}"]`).count() === 1);
    await page.screenshot({ path: `${UIT}/agenten-09-tokens.png`, fullPage: true });

    // ---------------------------------------------------------------- 6. journaal
    await page.locator('[role=tab][data-tab="journaal"]').click();
    const jl = page.locator('[data-tab-inhoud="journaal"] .ag-journaal');
    await jl.locator('[data-rij]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
    const jt = await jl.innerText().catch(() => '');
    if (!jt) console.log('[e2e] journaal leeg:', (await page.locator('[data-tab-inhoud="journaal"], .ag-journaal-wrap').first().innerText().catch(() => '')).slice(0, 400), JSON.stringify(await page.evaluate(async (t) => { const r = await fetch('/api/owner/agents/journaal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin }) }); return { s: r.status, b: (await r.text()).slice(0, 600) }; }, tab)));
    check('journaal toont het intrekken (Claude, door u), het loskoppelen, het token en de herinstallatie',
      /Відкликано доступ «Claude» \(вами\)/.test(jt) && /Відключено «Chrome · ноутбук» \(вами\)/.test(jt) && /Відкликано токен «grok»/.test(jt) && /Перевстановлено «Chrome · ноутбук»/.test(jt), jt.slice(0, 600));
    const tijd = jl.locator('time').first();
    await tijd.waitFor({ timeout: 5000 }).catch(() => undefined);
    check('relatieve tijd met exacte tijd bij aanwijzen (title)', /щойно|хв тому/.test(await tijd.innerText().catch(() => '')) && /\d{2}:\d{2}:\d{2}/.test(await tijd.getAttribute('title').catch(() => '') || ''), `${await tijd.innerText().catch(() => '')} | ${await tijd.getAttribute('title').catch(() => '')}`);
    await page.locator('[data-filter="soort"]').selectOption('ai');
    await page.waitForTimeout(600);
    await jl.locator('[data-rij]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
    const soorten = await jl.locator('[data-rij]').evaluateAll((els) => els.map((e) => e.getAttribute('data-soort')));
    check('filter op soort «Підключення ШІ»: alleen ai-regels', soorten.length >= 2 && soorten.every((x) => x === 'ai'), soorten.join(','));
    await page.locator('[data-filter="soort"]').selectOption('');
    await page.locator('[data-filter="onderwerp"]').selectOption(br.id).catch(() => undefined);
    await page.waitForTimeout(600);
    const pcRegels = await jl.locator('[data-rij]').count();
    const pcTekst = await jl.innerText().catch(() => '');
    check('filter op apparaat (browser): alleen zijn regels (koppelen/herinstallatie + loskoppelen)', pcRegels >= 2 && !(/Claude|grok/.test(pcTekst)), `${pcRegels}: ${pcTekst.replace(/\s+/g, ' ').slice(0, 600)}`);
    await page.locator('[data-filter="onderwerp"]').selectOption('');
    await page.waitForTimeout(600);
    const eerste = jl.locator('[data-rij]').first();
    await eerste.locator('.ag-rij-toggle').click();
    const jdet = await eerste.locator('.ag-rij-details').innerText().catch(() => '');
    check('journaalregel uitklappen: actiecode en details, geen geheimen', /owner\.|mcp_console|ai_/.test(jdet) && !/token_hash|access_hash|refresh_hash/.test(jdet), jdet.slice(0, 300));
    await page.screenshot({ path: `${UIT}/agenten-10-journaal-donker.png`, fullPage: true });
    await licht(); await page.waitForTimeout(200);
    await page.screenshot({ path: `${UIT}/agenten-11-journaal-licht.png`, fullPage: true });
    await donker();

    // ---------------------------------------------------------------- 6b. werksessie van een AI (wat deed Claude, op volgorde)
    for (const [tool, doel] of [['machine_list', ''], ['machine_read_file', 'T:\\notes\\a.md'], ['machine_read_file', 'T:\\notes\\a.md'], ['machine_exec', 'git status']]) {
      await auditToevoegen({ ownerId: uid, actorId: uid, action: 'owner.mcp.tool', type: 'ai', result: 'success', details: { tool, client: 'Claude', grantId: grant, soort: actieSoort(tool), ...(doel ? { doel } : {}) } });
    }
    await page.locator('[data-filter="soort"]').selectOption('werk');
    const sessie = jl.locator('[data-actie="werksessie"]').first();
    await sessie.waitFor({ timeout: 10000 }).catch(() => undefined);
    const sessieTekst = await sessie.innerText().catch(() => '');
    check('journaal: 4 acties van Claude vormen één werksessie met samenvatting per soort',
      /«Claude» працював: 4 дії — 2 читання файлів чи тек · 1 перевірка стану · 1 команда/.test(sessieTekst) && (await jl.locator('[data-rij]').count()) === 1, sessieTekst.slice(0, 300));
    await sessie.locator('.ag-rij-toggle').click();
    const stappen = await sessie.locator('.ag-werkstappen li').allInnerTexts();
    check('werksessie uitklappen: stappen op volgorde, herhaling ×2, doel zichtbaar, icoon per stap',
      stappen.length === 3 && /Переглянув підключені пристрої/.test(stappen[0]) && /Прочитав файл: T:\\notes\\a\.md ×2/.test(stappen[1]) && /Виконав команду: git status/.test(stappen[2])
      && (await sessie.locator('.ag-werkstap-icoon svg').count()) === 3, JSON.stringify(stappen));
    await page.screenshot({ path: `${UIT}/agenten-12-werksessie-donker.png`, fullPage: true });
    await page.locator('[data-filter="soort"]').selectOption('');

    // ---------------------------------------------------------------- 7. overzicht + nagebootste 429: vriendelijke tekst, geen code
    await page.route('**/api/owner/agents/overzicht', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'RATE_LIMITED', reasonCode: 'RATE_LIMITED', retryAfter: 30 }) }));
    await page.goto(`${MCP}/agents#overview`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' }); // alleen de hash veranderde: echt opnieuw laden zodat de nagebootste 429 geldt
    await page.locator('[data-recent] [data-rij]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
    const ovT = await page.locator('.ag').innerText().catch(() => '');
    check('oude link #overview → #overzicht met tellers (ШІ, пристроїв у мережі, токенів) en recente gebeurtenissen + link naar Журнал',
      new URL(page.url()).hash === '#overzicht' && await page.locator('[data-stat]').count() === 4 && await page.locator('[data-recent] [data-rij]').count() >= 3 && /Увесь журнал/.test(ovT), ovT.slice(0, 400));
    check('nagebootste 429: vriendelijke melding «Забагато запитів … Зачекайте 30 с», nergens «RATE_LIMITED»', /Забагато запитів за короткий час\. Зачекайте 30 с/.test(ovT) && !/RATE_LIMITED/.test(await page.locator('body').innerText()), ovT.slice(0, 300));
    await page.screenshot({ path: `${UIT}/agenten-12-overzicht-429.png`, fullPage: true });
    await page.unroute('**/api/owner/agents/overzicht');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-recent] [data-rij]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
    await page.screenshot({ path: `${UIT}/agenten-13-overzicht-donker.png`, fullPage: true });
    await licht(); await page.waitForTimeout(200);
    await page.screenshot({ path: `${UIT}/agenten-14-overzicht-licht.png`, fullPage: true });
    await geenRate('overzicht');

    // ---------------------------------------------------------------- 8. terug-knop volgt de tabbladen
    await page.locator('[role=tab][data-tab="apparaten"]').click();
    await page.locator('[role=tab][data-tab="journaal"]').click();
    await page.goBack();
    await page.waitForTimeout(300);
    check('terug in de browser → vorig tabblad', await tabSel(page) === 'apparaten', String(await tabSel(page)));

    check('nergens een kale «RATE_LIMITED» op de pagina', !ratelimitTekst, ratelimitTekst);
    check('geen consolefouten of onverwachte HTTP-fouten', fouten.length === 0, fouten.join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await browser.close().catch(() => undefined);
    if (uid) {
      await sys.query('DELETE FROM app.ai_grants WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.agents WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_oauth_tokens WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_console_tokens WHERE user_id = $1', [uid]).catch(() => undefined);
    }
    await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = $1', [clientId]).catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`e2e-%-${T}@example.test`]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
