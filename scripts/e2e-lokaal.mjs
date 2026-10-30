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
import { readFile } from 'node:fs/promises';

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
