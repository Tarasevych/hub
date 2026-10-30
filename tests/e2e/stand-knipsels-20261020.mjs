// Запускач стенду знімків (20.10.2026): збирає tests/e2e/stand-knipsels-20261020.ts через esbuild і виконує main().
// Використання (з кореня робочої теки, де є dist/ і migrations/):
//   node tests/e2e/stand-knipsels-20261020.mjs [МІТКА]        → знімки в $STAND_BASIS/<МІТКА>/ (типово ВЕРСИЯ-ДО)
// Змінні: DATABASE_URL (типово postgres://postgres@127.0.0.1:55432/mijnruimte_stand), E2E_TLS (CA+сертифікат *.tarasevych.com),
//   PLAYWRIGHT_CORE, CHROME, AXE_CORE, STAND_BASIS, STAND_FILTER (підрядок назви кроку; результати зливаються з попередніми в тій самій теці),
//   STAND_VANAF (почати з кроку з такою назвою, теж зі злиттям), STAND_MATEN (390x844,768x1024,1280x800),
//   STAND_NL=0 (без нідерландської), STAND_DONKER=0 (без темної теми), E2E_POORT (8443), STAND_DIST (тека dist для фронтенду).
// Лише loopback: сервер у цьому ж процесі, Chrome із host-resolver-rules (усе поза *.tarasevych.com → ~NOTFOUND).
import { build } from 'esbuild';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import dns from 'node:dns';

const SCRATCH = process.env.STAND_MAP || 'rapporten'; // lokaal (rapporten/ staat in .gitignore)
const label = process.argv[2] || 'ВЕРСИЯ-ДО';
process.env.STAND_UIT ||= join(process.env.STAND_BASIS || join(SCRATCH, 'stand'), label);
process.env.DATABASE_URL ||= 'postgres://postgres@127.0.0.1:55432/mijnruimte_stand';
process.env.E2E_TLS ||= join(SCRATCH, 'stand', 'tls');
// Фронтенд стенду: STAND_DIST → E2E_DIST (типово dist/ робочої теки; для «ДО» — заморожена копія stand/dist-DO).
if (process.env.STAND_DIST) process.env.E2E_DIST = process.env.STAND_DIST;
process.env.PLAYWRIGHT_CORE ||= '/opt/node-tools/node_modules/playwright-core';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
process.env.CHROME ||= '/opt/pw-browsers/chromium';
process.env.AXE_CORE ||= '/tmp/aipw/axe/node_modules/axe-core/axe.min.js';
process.env.TOTP_ENCRYPTION_KEY_V1 ||= randomBytes(32).toString('base64');
process.env.RECOVERY_CODE_PEPPER ||= randomBytes(32).toString('base64');
process.env.AUDIT_IP_PEPPER ||= randomBytes(48).toString('base64');
// Проксі-змінні геть: нічого назовні.
for (const k of Object.keys(process.env)) if (/^(https?|no|all)_proxy$/i.test(k)) delete process.env[k];

// Мережевий замок у цьому процесі (як у scripts/e2e-lokaal.mjs): сокети й DNS лише на loopback.
const LOKAAL = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
const weiger = (host) => { const e = new Error(`stand: з'єднання з ${host} відхилено (лише loopback)`); e.code = 'E2E_NIET_LOKAAL'; return e; };
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  const b = Array.isArray(a[0]) ? a[0] : a;
  const o = b[0] && typeof b[0] === 'object' ? b[0] : null;
  const pad = o ? o.path : (typeof b[0] === 'string' && !/^\d+$/.test(b[0]) ? b[0] : undefined);
  const host = o ? (o.path ? undefined : (o.host || 'localhost')) : (pad ? undefined : (typeof b[1] === 'string' ? b[1] : 'localhost'));
  if (!pad && !LOKAAL.has(String(host).toLowerCase())) throw weiger(host);
  return origConnect.apply(this, a);
};
const origLookup = dns.lookup;
dns.lookup = function (host, ...rest) {
  if (!LOKAAL.has(String(host).toLowerCase())) { const cb = rest.find((x) => typeof x === 'function'); const e = weiger(host); if (cb) { process.nextTick(() => cb(e)); return {}; } throw e; }
  return origLookup.call(this, host, ...rest);
};

await mkdir(process.env.STAND_UIT, { recursive: true });
await mkdir('rapporten', { recursive: true });
const map = await mkdtemp(join('rapporten', 'stand-'));
let code = 1;
try {
  const uit = join(map, 'stand-knipsels-20261020.mjs');
  await build({ entryPoints: ['tests/e2e/stand-knipsels-20261020.ts'], outfile: uit, bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', logLevel: 'warning' });
  const mod = await import(pathToFileURL(resolve(uit)).href);
  code = (await mod.main()) || 0;
} finally {
  await rm(map, { recursive: true, force: true });
}
console.log(`стенд завершено, код ${code}; знімки: ${process.env.STAND_UIT}`);
process.exit(code);
