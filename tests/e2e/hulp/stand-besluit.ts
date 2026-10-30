// Стенд (22.10.2026, зона B; RUNBOOK §15) — рішення власника з підписом passkey і нова стрічка історії. Кроки «besluit-*»:
//   besluit-dashboard-meester     — mcp.*/dashboard → «Відкат до попереднього» → майстер (з якого на який випуск, попередження про міграції).
//   besluit-dashboard-ondertekend — у майстрі натиснуто «Підписати passkey й відкотити»: ВІРТУАЛЬНИЙ автентифікатор Chrome (CDP WebAuthn)
//                                   підписує справжню WebAuthn-асерцію ключем, чий публічний ключ лежить у «root»-файлі стенду; сервер
//                                   кладе рішення в inbox; крок сам запускає root-скрипт (bash, тестові шляхи, інсталятор-заглушка) → «Виконано».
//   besluit-agenten-hosts         — mcp.*/agenten#extern → картка «Дозволені хости» зі списком із файла + доданий хост (пунктирний чип).
//   besluit-agenten-hosts-klaar   — список підписано (той самий віртуальний passkey), root записав файл → «Виконано» + нові хости.
//   besluit-historie              — admin.*/updates → «Історія»: одна стрічка (встановлені, відкочені, автовідкат, обірвані, відхилені),
//                                   перший рядок розгорнутий, «Спробувати знову» неактивна з підказкою (сіяні runs/pogingen/voorstellen).
// Середовище готується в тому самому процесі, що й сервер стенду (process.env): BESLUIT_APP_ROOT (випуски), MCP_RECHTEN_PAD,
// GOEDKEUR_SLEUTELS, BESLUIT_INBOX, OPDRACHT_STATUS_DIR → тека $STAND_UIT/besluit-omgeving. Нічого з реального сервера не торкається.
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, chownSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Page = import('playwright-core').Page;
type Stap = { naam: string; url: string; voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void>; alleen1280?: boolean; fase?: 'prive' | 'tech' };
export type BesluitCtx = { mcpUrl: string; adminUrl: string; uid: () => string; uit: string; zeg: (s: string) => void };

const b64u = (b: Buffer) => b.toString('base64url');
let omg: { dir: string; rechten: string; sleutels: string; inbox: string; status: string; app: string; cred: { id: Buffer; pkcs8: Buffer } } | null = null;

/** Eenmalig: releases, rechtenbestand, root-sleutelbestand met de publieke sleutel van de virtuele passkey, inbox en statusmap. */
function omgevingMaken(uit: string, zeg: (s: string) => void) {
  if (omg) return omg;
  // Onder /tmp (niet onder $STAND_UIT): de map van de stand is 0700 van root en voor «nobody» (het root-script, zie rootVerwerken) niet
  // te bereiken; het root-script staat buiten root bovendien alleen paden onder /tmp toe. Het pad staat in het log en in $STAND_UIT/besluit-omgeving.txt.
  const dir = mkdtempSync(join(tmpdir(), 'stand-besluit-'));
  chmodSync(dir, 0o755);
  try { writeFileSync(join(uit, 'besluit-omgeving.txt'), `${dir}\n`); } catch { /* alleen informatief */ }
  const p = { dir, rechten: join(dir, 'mcp-rechten.json'), sleutels: join(dir, 'goedkeur-passkeys.json'), inbox: join(dir, 'inbox'), status: join(dir, 'status'), app: join(dir, 'srv'), werk: join(dir, 'werk') };
  for (const d of [p.inbox, p.status, p.werk, join(p.app, 'releases')]) mkdirSync(d, { recursive: true });
  for (const r of ['20261022-121416', '20261021-221718', '20261020-183000']) { mkdirSync(join(p.app, 'releases', r, 'dist-server'), { recursive: true }); writeFileSync(join(p.app, 'releases', r, 'dist-server', 'start.mjs'), '// stand\n'); writeFileSync(join(p.app, 'releases', r, 'RELEASE-COMMIT'), `${createHash('sha1').update(r).digest('hex')}\n`); }
  if (!existsSync(join(p.app, 'current'))) symlinkSync(join(p.app, 'releases', '20261022-121416'), join(p.app, 'current'));
  writeFileSync(join(p.app, 'VORIGE'), `${join(p.app, 'releases', '20261021-221718')}\n`);
  writeFileSync(p.rechten, JSON.stringify({ read: true, uitrol: false, gitops: false, 'passkey-goedkeuring': true, 'ssh-ca': false, 'terugdraaien-passkey': true, 'externe-hosts-passkey': true, externeMcpHosts: ['api.githubcopilot.com'], opdracht: { status: true, releases: true, backup: true, 'uitrol-nu': true, terugdraaien: false } }, null, 2));
  chmodSync(p.rechten, 0o640);
  // Virtuele passkey (ES256): privésleutel naar de CDP-authenticator, publieke sleutel (JWK) naar het «root»-sleutelbestand.
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const cred = { id: randomBytes(32), pkcs8: privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer };
  const vingerafdruk = createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex');
  writeFileSync(p.sleutels, JSON.stringify({ versie: 1, rpId: 'tarasevych.com', origins: ['https://admin.tarasevych.com', 'https://id.tarasevych.com'], sleutels: [{ credentialId: b64u(cred.id), alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }, label: 'стенд-телефон', vingerafdruk, toegevoegd: new Date().toISOString(), door: 'stand' }] }, null, 2));
  // Installer-stub voor het root-script: wisselt de symlink zoals de echte `terugdraaien <release>`.
  const installeer = join(dir, 'installeer');
  writeFileSync(installeer, `#!/bin/bash\n[ "$1" = terugdraaien ] || exit 64\nd="${p.app}/releases/$2"\n[ -f "$d/dist-server/start.mjs" ] || exit 1\nreadlink -f "${p.app}/current" > "${p.app}/VORIGE"\nln -sfn "$d" "${p.app}/current.tmp" && mv -T "${p.app}/current.tmp" "${p.app}/current"\necho "[installeer] teruggedraaid naar $2 (stand)"\n`);
  // Kopie van het root-script en de root-hulp in de omgeving zelf: de werkmap van de stand is voor «nobody» niet leesbaar.
  mkdirSync(join(dir, 'goedkeuring'), { recursive: true });
  for (const n of ['goedkeur-hulp.mjs', 'webauthn-kern.mjs', 'besluit-kern.mjs', 'ai-beleid-kern.mjs']) copyFileSync(resolve('deploy/goedkeuring', n), join(dir, 'goedkeuring', n));
  copyFileSync(resolve('deploy/besluit/mijn-ruimte-besluit.sh'), join(dir, 'mijn-ruimte-besluit.sh'));
  const passkey = join(dir, 'passkey');
  writeFileSync(passkey, `#!/bin/bash\nexport GOEDKEUR_SLEUTELS="${p.sleutels}" GOEDKEUR_RECHTEN="${p.rechten}" GOEDKEUR_STAAT="${join(dir, 'goed-staat')}" GOEDKEUR_INBOX="${join(dir, 'goed-inbox')}" GOEDKEUR_STATUS_DIR="${p.status}" GOEDKEUR_GROEP=nogroup\nexec "${process.execPath}" "${join(dir, 'goedkeuring', 'goedkeur-hulp.mjs')}" "$@"\n`);
  chmodSync(installeer, 0o755); chmodSync(passkey, 0o755);
  mkdirSync(join(dir, 'goed-staat'), { recursive: true }); mkdirSync(join(dir, 'goed-inbox'), { recursive: true });
  Object.assign(process.env, { BESLUIT_APP_ROOT: p.app, MCP_RECHTEN_PAD: p.rechten, GOEDKEUR_SLEUTELS: p.sleutels, BESLUIT_INBOX: p.inbox, OPDRACHT_STATUS_DIR: p.status });
  zeg(`   besluit-omgeving: ${dir} (passkey ${vingerafdruk.slice(0, 16)}…)`);
  omg = { ...p, cred, dir };
  (omg as any).installeer = installeer; (omg as any).passkey = passkey; (omg as any).werk = p.werk;
  return omg;
}

/** Virtuele authenticator in Chrome met onze sleutel (CDP WebAuthn): de browser tekent dan echt, met UV, zonder scherm of telefoon. */
const authenticators = new WeakMap<object, string>();
async function virtuelePasskey(page: Page, o: NonNullable<typeof omg>) {
  // Chrome staat één «internal» authenticator per omgeving toe: per browsercontext één keer aanmaken en daarna hergebruiken.
  const ctx = page.context();
  if (authenticators.has(ctx)) return;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } }) as { authenticatorId: string };
  await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: { credentialId: o.cred.id.toString('base64'), isResidentCredential: true, rpId: 'tarasevych.com', privateKey: o.cred.pkcs8.toString('base64'), userHandle: Buffer.from('eigenaar').toString('base64'), signCount: 1 } });
  authenticators.set(ctx, authenticatorId);
}
/**
 * «Root» van de stand: het echte root-script met testpaden over de inbox laten lopen (pas nadat de site het besluit neerlegde).
 * De stand zelf draait vaak als root; als root wist het script de BESLUIT_*-omgeving en neemt het de echte paden — daarom draait het
 * hier als «nobody» (65534) op een omgeving die aan die gebruiker is gegeven (zoals tests/eenheid/ssh-ca-beheer.test.ts doet).
 */
const NIEMAND = 65534;
function rootVerwerken(o: NonNullable<typeof omg>, zeg: (s: string) => void) {
  const alsRoot = process.getuid?.() === 0;
  if (alsRoot) {
    spawnSync('chown', ['-R', `${NIEMAND}:${NIEMAND}`, o.dir]);
    for (const n of readdirSync(o.inbox)) { try { chownSync(join(o.inbox, n), NIEMAND, NIEMAND); } catch { /* al weg */ } }
  }
  const r = spawnSync('bash', [join(o.dir, 'mijn-ruimte-besluit.sh'), 'verwerk'], { encoding: 'utf8', ...(alsRoot ? { uid: NIEMAND, gid: NIEMAND } : {}), env: { ...process.env, HOME: '/tmp', BESLUIT_INBOX: o.inbox, BESLUIT_WERK: (o as any).werk, BESLUIT_STATUS: o.status, BESLUIT_RECHTEN: o.rechten, BESLUIT_PASSKEY: (o as any).passkey, BESLUIT_INSTALLEER: (o as any).installeer, BESLUIT_APP_ROOT: o.app, BESLUIT_GROEP: 'nogroup' } });
  zeg(`   root-script: exit ${r.status} ${r.stderr.slice(0, 200).replace(/\n/g, ' ')}; status: ${readdirSync(o.status).filter((n) => n.startsWith('besluit-')).join(',')}`);
}
async function wachtOpInbox(o: NonNullable<typeof omg>, ms = 15000) {
  const tot = Date.now() + ms;
  while (Date.now() < tot) { if (readdirSync(o.inbox).some((n) => n.startsWith('besluit-') && n.endsWith('.json'))) return true; await new Promise((r) => setTimeout(r, 200)); }
  return false;
}

export function besluitStappen(c: BesluitCtx): Stap[] {
  const voor = async () => { omgevingMaken(c.uit, c.zeg); };
  const openMeester = async (p: Page) => {
    await p.locator('[data-besluit-open="terugdraaien"]').first().click({ timeout: 10000 });
    await p.locator('[data-besluit-meester="terugdraaien"]').waitFor({ timeout: 10000 });
    await p.locator('[data-besluit-keuze="naar"]').waitFor({ timeout: 10000 }).catch(() => undefined);
    await p.waitForTimeout(500);
    c.zeg(`   meester: van=${await p.locator('[data-besluit-van]').first().getAttribute('data-besluit-van')} naar=${await p.locator('[data-besluit-naar]').first().getAttribute('data-besluit-naar')} blok=${await p.locator('[data-besluit-blok]').count()}`);
  };
  return [
    { naam: 'besluit-dashboard-meester', url: `${c.mcpUrl}/dashboard`, fase: 'tech', voor, na: openMeester },
    { naam: 'besluit-dashboard-ondertekend', url: `${c.mcpUrl}/dashboard`, fase: 'tech', alleen1280: true, voor, na: async (p) => {
      const o = omgevingMaken(c.uit, c.zeg);
      // Elke run begint bij de actieve release 20261022-121416 (de vorige stap draaide niets terug; de installer-stub wisselt alleen hier).
      await virtuelePasskey(p, o);
      await openMeester(p);
      await p.locator('[data-besluit-knop="ondertekenen"]').first().click({ timeout: 10000 });
      const inbox = await wachtOpInbox(o);
      c.zeg(`   besluit in de inbox: ${inbox}`);
      if (inbox) rootVerwerken(o, c.zeg);
      await p.locator('[data-besluit-stand="klaar"], [data-besluit-stand="geweigerd"], [data-besluit-stand="mislukt"]').first().waitFor({ timeout: 30000 }).catch(() => undefined);
      await p.waitForTimeout(400);
      c.zeg(`   uitkomst: ${await p.locator('[data-besluit-stand]').first().getAttribute('data-besluit-stand')} code=${await p.locator('[data-besluit-stand]').first().getAttribute('data-besluit-code')}; actief nu: ${readFileSync(join(o.app, 'VORIGE'), 'utf8').trim().split('/').pop()} → current`);
      // Terug naar de beginstand voor een volgende maat/taal/thema.
      spawnSync('bash', [(o as any).installeer, 'terugdraaien', '20261022-121416']);
      writeFileSync(join(o.app, 'VORIGE'), `${join(o.app, 'releases', '20261021-221718')}\n`);
      try { for (const n of readdirSync((o as any).werk)) if (n === 'terugdraaien.stempel') spawnSync('rm', ['-f', join((o as any).werk, n)]); } catch { /* geen stempel */ }
    } },
    { naam: 'besluit-agenten-hosts', url: `${c.mcpUrl}/agenten#extern`, voor, na: async (p) => {
      await p.locator('[data-besluit-hosts]').first().waitFor({ timeout: 15000 });
      await p.locator('[data-besluit-hosts-lijst]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
      await p.locator('[data-besluit-hosts]').first().scrollIntoViewIfNeeded().catch(() => undefined);
      await p.locator('[data-besluit-veld="host"]').first().fill('mcp.voorbeeld.org');
      await p.locator('[data-besluit-knop="host-toevoegen"]').first().click({ timeout: 5000 });
      await p.waitForTimeout(400);
      c.zeg(`   hosts in lijst: ${await p.locator('[data-besluit-hosts-lijst]').first().getAttribute('data-besluit-hosts-lijst')} · knop ondertekenen uit: ${await p.locator('[data-besluit-knop="ondertekenen"]').first().isDisabled().catch(() => '?')}`);
    } },
    { naam: 'besluit-agenten-hosts-klaar', url: `${c.mcpUrl}/agenten#extern`, alleen1280: true, voor, na: async (p) => {
      const o = omgevingMaken(c.uit, c.zeg);
      await virtuelePasskey(p, o);
      await p.locator('[data-besluit-hosts-lijst]').first().waitFor({ timeout: 15000 });
      await p.locator('[data-besluit-hosts]').first().scrollIntoViewIfNeeded().catch(() => undefined);
      const nieuw = `mcp-${randomUUID().slice(0, 6)}.voorbeeld.org`;
      await p.locator('[data-besluit-veld="host"]').first().fill(nieuw);
      await p.locator('[data-besluit-knop="host-toevoegen"]').first().click({ timeout: 5000 });
      await p.locator('[data-besluit-knop="ondertekenen"]').first().click({ timeout: 10000 });
      const inbox = await wachtOpInbox(o);
      if (inbox) rootVerwerken(o, c.zeg);
      await p.locator('[data-besluit-stand="klaar"], [data-besluit-stand="geweigerd"], [data-besluit-stand="mislukt"]').first().waitFor({ timeout: 30000 }).catch(() => undefined);
      await p.waitForTimeout(400);
      const hosts = JSON.parse(readFileSync(o.rechten, 'utf8')).externeMcpHosts;
      c.zeg(`   uitkomst: ${await p.locator('[data-besluit-stand]').first().getAttribute('data-besluit-stand')}; mcp-rechten.json externeMcpHosts = ${JSON.stringify(hosts)} (bevat ${nieuw}: ${hosts.includes(nieuw)})`);
    } },
    { naam: 'besluit-historie', url: `${c.adminUrl}/updates`, fase: 'tech', voor: async () => { omgevingMaken(c.uit, c.zeg); await historieZaaien(c); }, na: async (p) => {
      await p.locator('#ut-tab-historie').first().click({ timeout: 10000 });
      await p.locator('[data-ut-tijdlijn]').first().waitFor({ timeout: 15000 });
      await p.waitForTimeout(800);
      const n = await p.locator('[data-ut-tijdlijn]').first().getAttribute('data-ut-tijdlijn');
      const staten = await p.locator('.ut-tl-item').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-soort')}:${e.getAttribute('data-staat')}`));
      // Eerste regel met een mislukte stand openklappen: de details en de (uitgeschakelde) knop «Спробувати знову» met uitleg.
      const rij = p.locator('.ut-tl-item[data-staat="mislukt"] .ut-tl-rij, .ut-tl-item[data-staat="afgebroken"] .ut-tl-rij').first();
      if (await rij.count()) { await rij.click({ timeout: 5000 }); await p.waitForTimeout(700); }
      c.zeg(`   tijdlijn: ${n} regels [${staten.join(' ')}] · opnieuw: ${await p.locator('[data-tl-opnieuw]').first().getAttribute('data-tl-opnieuw').catch(() => '-')}`);
    } },
  ];
}

/** Geschiedenis zaaien (in-process, systeemrol): runs (klaar, mislukt, ROOK_TERUGGEDRAAID, TERUG_OK), een afgebroken poging en een afgewezen voorstel. */
let gezaaid = false;
async function historieZaaien(c: BesluitCtx) {
  if (gezaaid) return; gezaaid = true;
  const { getPool } = await import('../../../server/platform/pg');
  const sys = getPool('systeem');
  const d = (dagen: number, uur = 12) => new Date(Date.now() - dagen * 864e5 + (uur - 12) * 36e5).toISOString();
  const run = async (id: string, methode: string, versie: string, staat: string, code: string, uk: string, nl: string, tijd: string, extra: Record<string, unknown> = {}) =>
    sys.query(`INSERT INTO app.uitrol_runs (id, methode, versie, release, staat, stap, pct, code, uk, nl, stappen, wie, gestart_op, bijgewerkt_op, geeindigd_op, reden, context)
      VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$12,$12,$13,$14::jsonb) ON CONFLICT (id) DO NOTHING`,
      [id, methode, versie, staat, staat === 'klaar' ? 'klaar' : 'installeren', staat === 'klaar' ? 100 : 60, code, uk, nl, JSON.stringify([{ stap: staat === 'klaar' ? 'klaar' : 'installeren', staat: staat === 'klaar' ? 'ok' : 'fout', pct: staat === 'klaar' ? 100 : 60, tijd, uk, nl }]), String(extra.wie || ''), tijd, String(extra.reden || ''), JSON.stringify(extra.context || [])]).catch((e) => c.zeg(`!! zaaien run ${id}: ${String(e.message).slice(0, 120)}`));
  await run('stand-b-r1', 'passkey', '20261019-100000', 'klaar', 'OK', 'Випуск 20261019-100000 встановлено', 'Release 20261019-100000 geïnstalleerd', d(6));
  await run('stand-b-r2', 'passkey', '20261020-183000', 'mislukt', 'INSTALLATIE_MISLUKT', 'Збірка не вдалася: vite build exit 1', 'Bouwen mislukt: vite build exit 1', d(5), { reden: 'error during build: RollupError: Could not resolve "./ontbreekt"', context: ['[installeer] bouwen (npm ci + vite)', 'error during build:', 'RollupError: Could not resolve "./ontbreekt" from src/App.tsx', 'FOUT: bouwen mislukt'] });
  await run('stand-b-r3', 'passkey', '20261021-221718', 'klaar', 'OK', 'Випуск 20261021-221718 встановлено', 'Release 20261021-221718 geïnstalleerd', d(3));
  await run('stand-b-r4', 'passkey', '20261021-221718', 'klaar', 'ROOK_TERUGGEDRAAID', 'Відкочено автоматично з 20261021-221718 на 20261019-100000: сторінка admin-updates не рендериться (pageerror: Error: Buffer is not defined)', 'Automatisch teruggedraaid van 20261021-221718 naar 20261019-100000: pagina admin-updates rendert niet (pageerror: Error: Buffer is not defined)', d(3, 13));
  await run('stand-b-r5', 'passkey', '20261022-121416', 'klaar', 'OK', 'Випуск 20261022-121416 встановлено', 'Release 20261022-121416 geïnstalleerd', d(1));
  await run('stand-b-r6', 'opdracht', '20261022-121416', 'klaar', 'TERUG_OK', 'Повернуто на випуск 20261021-221718 за рішенням власника з підписом passkey', 'Teruggedraaid naar release 20261021-221718 op besluit van de eigenaar met passkey-handtekening', d(0, 9), { wie: 'passkey' });
  const uid = c.uid();
  const vid = randomUUID(); const gid = randomUUID();
  await sys.query(`INSERT INTO app.uitrol_voorbereiders (id, soort, onderwerp, account_id, label, gegeven_door, verloopt_op) VALUES ($1, 'account', $2, $2, 'stand-eigenaar', 'stand', now() + interval '7 days') ON CONFLICT DO NOTHING`, [gid, uid]).catch((e) => c.zeg(`!! zaaien grant: ${String(e.message).slice(0, 160)}`));
  await sys.query(`INSERT INTO app.uitrol_voorstellen (id, versie, bytes, sha256, voorbereider_id, voorbereider_label, account_id, status, uitkomst_code, uitkomst, beslist_op, beslist_door, aangemaakt_op, bijgewerkt_op)
    VALUES ($1, '20261020-090000', 123456, $2, $3, 'Claude (agent)', $4, 'afgewezen', 'AFGEWEZEN', '{"reden":"Пакет без тестів — спершу запустіть набір."}'::jsonb, $5, 'eigenaar', $5, $5) ON CONFLICT DO NOTHING`,
    [vid, 'a'.repeat(64), gid, uid, d(4)]).catch((e) => c.zeg(`!! zaaien voorstel: ${String(e.message).slice(0, 160)}`));
  await sys.query(`INSERT INTO app.uitrol_pogingen (account_id, versie, sha256, bytes, etappe, verstuurd, procent, code, reden_bekend, poging, bestand, gemeld_door, voorbereider_label, gemeld_op, aangemaakt_op)
    VALUES ($1, '20261022-080000', $2, 52428800, 'uploaden', 20971520, 40, 'UPLOAD_ONDERBROKEN|NETWORK_ERROR|40', true, 1, 'mijn-ruimte-20261022-080000.tar.gz', 'browser', 'eigenaar', $3, $3)`,
    [uid, 'b'.repeat(64), d(0, 7)]).catch((e) => c.zeg(`!! zaaien poging: ${String(e.message).slice(0, 160)}`));
}
