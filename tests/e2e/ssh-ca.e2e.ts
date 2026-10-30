// E2E etap C deel 2 (14.10.2026) in een echte Chrome: eigenaar → technisch profiel → zonder vlag geen knop → vlag aan → «Сертифікат SSH»
// → publieke sleutel → schakelaar uit: duidelijke melding → schakelaar aan: het ECHTE root-script (hier als nobody, met testmappen) tekent
// → certificaat in het venster (alleen beheer, permit-pty, ~60 min) → journaal owner.ssh-ca.uitgegeven met vingerafdruk, zonder certificaat.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { chmodSync, chownSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const SCRIPT = 'deploy/ssh-ca/mijn-ruimte-ssh-ca.sh';
const ALS_ROOT = process.getuid?.() === 0, NIEMAND = 65534;

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e ssh-ca');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-ssh-${T}@example.test`, sub = `sub-e2e-ssh-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  // Testmappen voor het root-script (draait hier als nobody; als root zou het bewust alleen /etc/mijn-ruimte gebruiken).
  const w = mkdtempSync(join(tmpdir(), 'e2e-ssh-'));
  const p = { ca: join(w, 'ca'), inbox: join(w, 'inbox'), werk: join(w, 'werk'), uit: join(w, 'uit'), status: join(w, 'status'), rechten: join(w, 'rechten.json') };
  for (const d of [p.ca, p.inbox, p.werk, p.uit, p.status]) { mkdirSync(d); if (ALS_ROOT) chownSync(d, NIEMAND, NIEMAND); }
  if (ALS_ROOT) chownSync(w, NIEMAND, NIEMAND);
  const env = { ...process.env, MIJN_RUIMTE_SSH_CA_DIR: p.ca, MIJN_RUIMTE_SSH_CA_INBOX: p.inbox, MIJN_RUIMTE_SSH_CA_WERK: p.werk, MIJN_RUIMTE_SSH_CA_UIT: p.uit,
    MIJN_RUIMTE_SSH_CA_STATUS: p.status, MIJN_RUIMTE_SSH_CA_RECHTEN: p.rechten, MIJN_RUIMTE_SSH_CA_GROEP: 'nogroup' };
  const script = (...a: string[]) => spawnSync('bash', [SCRIPT, ...a], { encoding: 'utf8', env, ...(ALS_ROOT ? { uid: NIEMAND, gid: NIEMAND } : {}) });
  const oud = { inbox: process.env.SSH_CA_INBOX, uit: process.env.SSH_CA_UIT, rechten: process.env.SSH_CA_RECHTEN };
  process.env.SSH_CA_INBOX = p.inbox; process.env.SSH_CA_UIT = p.uit; process.env.SSH_CA_RECHTEN = p.rechten;
  // «path-unit»: elk nieuw verzoek in de inbox → het echte script tekent het.
  // Op de server schrijft de app (mijnruimte) en leest root; hier schrijft de testserver als root en leest het script als nobody: leesbaar maken.
  const pathUnit = setInterval(() => {
    const nieuw = readdirSync(p.inbox).filter((n) => n.endsWith('.json'));
    if (!nieuw.length) return;
    for (const n of nieuw) { try { chmodSync(join(p.inbox, n), 0o644); } catch { /* al weg */ } }
    script('verwerk');
  }, 150);
  const vlagVoor = (await sys.query(`SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'ssh-certificaat'`)).rows[0];
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  let uid = '';
  try {
    check('CA ingericht (script, schakelaar blijft uit)', script('inrichten').status === 0 && !readdirSync(w).includes('rechten.json'));
    const kg = join(w, 'gebruiker');
    spawnSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-f', kg, '-N', '']);
    const publiek = readFileSync(`${kg}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const r = await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    check('aanmelden', r.cb.data.sessionCreated === true);
    uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'uk-UA', serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    const fouten: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$|\/downloads\/extension-version\.json$|\/api\/ssh-ca\/uitgifte$/.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });
    const post = (pad: string, extra: Record<string, unknown> = {}) => page.evaluate(async ([pp, t, e]) => {
      const res = await fetch(pp as string, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin, ...(e as object) }) });
      return { status: res.status, data: await res.json().catch(() => null) };
    }, [pad, tab, extra] as const);

    await page.goto(`${MCP}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('.canonical-avatar-trigger').first().waitFor({ timeout: 20000 });
    check('technisch profiel aan', (await post('/api/owner/tech/activeren', { minuten: 30, reden: 'E2E SSH' })).status === 200);
    await post('/api/beheer/flags/zetten', { vlag: { sleutel: 'ssh-certificaat', omschrijving: 'E2E', aan: false, standaard: false, percentage: 0, gebruikers: [] } });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-tech-band]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    check('vlag uit: geen knop «Сертифікат SSH»', await page.locator('[data-tech-knop="ssh"]').count() === 0);
    await post('/api/beheer/flags/zetten', { vlag: { sleutel: 'ssh-certificaat', omschrijving: 'E2E', aan: true, standaard: true, percentage: 0, gebruikers: [] } });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-tech-band] [data-tech-knop="ssh"]').click({ timeout: 20000 });
    const v = page.locator('[data-ssh-venster]');
    await v.waitFor({ timeout: 10000 });
    await v.locator('[data-ssh-publiek]').fill(`${publiek} commentaar`);
    check('sleutel met commentaar: knop uit (alleen de kale ed25519-regel)', await v.locator('[data-ssh-uitgifte]').isDisabled());
    await v.locator('[data-ssh-publiek]').fill(publiek);
    await v.locator('[data-ssh-uitgifte]').click();
    await v.locator('[data-ssh-melding]').waitFor({ timeout: 15000 });
    check('schakelaar uit: duidelijke melding, geen certificaat', /вимкнено/.test(await v.locator('[data-ssh-melding]').innerText()) && await v.locator('[data-ssh-cert]').count() === 0);

    writeFileSync(p.rechten, '{"ssh-ca": true}\n');
    await v.locator('[data-ssh-uitgifte]').click();
    await v.locator('[data-ssh-ok]').waitFor({ timeout: 15000 });
    const cert = await v.locator('[data-ssh-cert]').inputValue();
    writeFileSync(join(w, 'gebruiker-cert.pub'), cert + '\n');
    const L = spawnSync('/usr/bin/ssh-keygen', ['-L', '-f', join(w, 'gebruiker-cert.pub')], { encoding: 'utf8' }).stdout;
    check('certificaat in het venster: user certificate, alleen beheer, alleen permit-pty', /user certificate/.test(L) && /Principals:\s*\n\s+beheer\s*\n/.test(L) && /Extensions:\s*\n\s+permit-pty\s*\n/.test(L) && !/permit-port-forwarding|permit-agent-forwarding/.test(L), L.slice(0, 400));
    check('geldig ongeveer een uur, getekend door de CA van de server', /Valid: from/.test(L) && L.includes(spawnSync('/usr/bin/ssh-keygen', ['-lf', join(p.ca, 'ca.pub')], { encoding: 'utf8' }).stdout.split(' ')[1]));
    await page.screenshot({ path: `${UIT}/ssh-1-certificaat.png` });
    const acties = (await sys.query(`SELECT action, details FROM app.audit WHERE owner_id=$1 AND action LIKE 'owner.ssh-ca.%' ORDER BY id`, [uid])).rows;
    const ok = acties.find((a) => a.action === 'owner.ssh-ca.uitgegeven');
    check('journaal: geweigerd (uit) en uitgegeven met vingerafdruk, zonder het certificaat', acties.some((a) => a.action === 'owner.ssh-ca.geweigerd' && a.details.code === 'SSH_CA_UIT')
      && !!ok && /^SHA256:/.test(ok.details.vinger) && !JSON.stringify(acties).includes('ssh-ed25519-cert'));
    check('root-journaal (gebeurtenissen.jsonl): bron ssh-ca, 0640', /"bron": "ssh-ca"/.test(readFileSync(join(p.status, 'gebeurtenissen.jsonl'), 'utf8')) && (statSync(join(p.status, 'gebeurtenissen.jsonl')).mode & 0o777) === 0o640);
    check('geen consolefouten', fouten.length === 0, fouten.slice(0, 5).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    clearInterval(pathUnit);
    for (const [k, val] of [['SSH_CA_INBOX', oud.inbox], ['SSH_CA_UIT', oud.uit], ['SSH_CA_RECHTEN', oud.rechten]] as const) { if (val === undefined) delete process.env[k]; else process.env[k] = val; }
    if (vlagVoor) await sys.query(`UPDATE app.feature_flags SET aan=$1, standaard=$2, omschrijving=omschrijving WHERE sleutel='ssh-certificaat'`, [vlagVoor.aan, vlagVoor.standaard]).catch(() => undefined);
    if (uid) {
      await sys.query('DELETE FROM app.tech_activaties WHERE user_id=$1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [uid]).catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
