// E2E met een echte Chrome tegen de lokale build. Vereist: `npx vite build` (dist/), lokale Postgres (DATABASE_URL,
// AUDIT_IP_PEPPER, RECOVERY_CODE_PEPPER… zoals bij de eenheidstests), playwright-core (PLAYWRIGHT_CORE) en een test-CA die
// Chrome vertrouwt (NSS, $HOME/.pki/nssdb) met een certificaat voor *.tarasevych.com in E2E_TLS (srv.key, srv.crt).
// Gebruik: node scripts/e2e-lokaal.mjs [filter]
import { build } from 'esbuild';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
import dns from 'node:dns';
import { networkInterfaces } from 'node:os';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { STANDAARD_E2E_TLS_MAP, controleerE2eTls, zorgVoorE2eTls } from './e2e-tls-maak.mjs';

// ── Alleen lokaal: geen enkele e2e-test mag productie of een andere externe host bereiken. ──
// 1) Statische controle: Playwright-API-verzoeken vanuit Node (ctx.request / page.request / request.newContext) gaan buiten
//    Chrome om (zonder host-resolver-rules) naar het echte netwerk; die zijn in tests/e2e verboden. Gebruik fetch in de pagina.
// 2) Netwerkslot in dit proces: sockets en DNS alleen naar loopback (lokale server, Postgres op 127.0.0.1, Chrome-debugpoort).
// 3) Chrome zelf: chromeArgs() in tests/e2e/server.ts mapt *.tarasevych.com naar de lokale poort en al het andere naar ~NOTFOUND.
// Ook de EIGEN interface-adressen van deze machine tellen als lokaal (huis-vnext: de nagebootste Home Assistant luistert op een
// niet-loopback-adres omdat de adapter loopback weigert; er gaat nog steeds niets de machine uit).
const LOKAAL = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1', ...Object.values(networkInterfaces()).flat().filter(Boolean).map((i) => i.address.toLowerCase())]);
const verboden = [/\.request\s*\.\s*(get|post|put|patch|delete|head|fetch)\s*\(/, /request\s*\.\s*newContext\s*\(/, /\bapiRequest\b/, /--host-resolver-rules=(?!.*~NOTFOUND)/];
for (const f of (await readdir('tests/e2e')).filter((n) => n.endsWith('.ts'))) {
  const tekst = await readFile(join('tests/e2e', f), 'utf8');
  for (const r of verboden) if (r.test(tekst)) { console.error(`e2e-slot: ${f} gebruikt ${r} (kan buiten de lokale server gaan)`); process.exit(2); }
  if (/chromium\.launch\(/.test(tekst) && !/chromeArgs\(/.test(tekst)) { console.error(`e2e-slot: ${f} start Chrome zonder chromeArgs()`); process.exit(2); }
}

const opgegevenTls = (process.env.E2E_TLS || '').trim();
if (opgegevenTls) {
  const tlsStaat = controleerE2eTls(opgegevenTls, 60_000);
  if (!tlsStaat.geldig) {
    if (process.env.E2E_TLS_AUTO === '1') {
      const vernieuwd = zorgVoorE2eTls({ map: opgegevenTls, vernieuw: true });
      console.warn(
        `[e2e-lokaal] Автоматично оновлено сертифікат у E2E_TLS (${vernieuwd.map}, чинний до ${vernieuwd.geldigTot}). / ` +
        `Certificaat in E2E_TLS automatisch vernieuwd (${vernieuwd.map}, geldig tot ${vernieuwd.geldigTot}).`,
      );
    } else {
      console.error(
        `[e2e-lokaal] Сертифікат перевіркового центру в E2E_TLS (${opgegevenTls}) непридатний (${tlsStaat.reden}${tlsStaat.geldigTot ? `, строк чинності до ${tlsStaat.geldigTot}` : ''}).\n` +
        `  Створіть свіжий локальний сертифікат на 30 діб командою:\n` +
        `    node scripts/e2e-tls-maak.mjs --map "${opgegevenTls}"\n` +
        `  або запустіть з E2E_TLS_AUTO=1 чи без застарілого шляху, щоб використати ${STANDAARD_E2E_TLS_MAP}.\n` +
        `[e2e-lokaal] Het proefcertificaat in E2E_TLS (${opgegevenTls}) is niet bruikbaar (${tlsStaat.reden}${tlsStaat.geldigTot ? `, geldig tot ${tlsStaat.geldigTot}` : ''}).\n` +
        `  Maak een vers lokaal certificaat voor 30 dagen aan met:\n` +
        `    node scripts/e2e-tls-maak.mjs --map "${opgegevenTls}"`,
      );
      process.exit(2);
    }
  }
} else {
  const werkruimteTls = '/workspace/e2e-tools/tls';
  const werkruimteStaat = controleerE2eTls(werkruimteTls, 60_000);
  if (werkruimteStaat.geldig) {
    process.env.E2E_TLS = werkruimteTls;
  } else {
    if (existsSync(werkruimteTls)) {
      console.warn(
        `[e2e-lokaal] Сертифікат у ${werkruimteTls} непридатний (${werkruimteStaat.reden}); використовуємо свіжий локальний сертифікат у ${STANDAARD_E2E_TLS_MAP}. / ` +
        `Certificaat in ${werkruimteTls} is niet bruikbaar (${werkruimteStaat.reden}); vers lokaal certificaat in ${STANDAARD_E2E_TLS_MAP} wordt gebruikt.`,
      );
    }
    const gezorgd = zorgVoorE2eTls({ map: STANDAARD_E2E_TLS_MAP });
    process.env.E2E_TLS = gezorgd.map;
  }
}

const weiger = (host) => { const e = new Error(`e2e-slot: verbinding naar ${host} geweigerd (alleen lokaal)`); e.code = 'E2E_NIET_LOKAAL'; return e; };
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  const b = Array.isArray(a[0]) ? a[0] : a; // net.connect() geeft intern een genormaliseerde array door
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

await mkdir('rapporten', { recursive: true });
const map = await mkdtemp(join('rapporten', 'e2e-'));
let code = 0;
try {
  const filter = process.argv[2] || '';
  for (const f of (await readdir('tests/e2e')).filter((n) => n.endsWith('.e2e.ts') && n.includes(filter))) {
    const uit = join(map, f.replace(/\.ts$/, '.mjs'));
    await build({ entryPoints: [join('tests/e2e', f)], outfile: uit, bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'warning' });
    const mod = await import(pathToFileURL(resolve(uit)).href);
    code = (await mod.main()) || code;
  }
} finally {
  await rm(map, { recursive: true, force: true });
}
process.exit(code);
