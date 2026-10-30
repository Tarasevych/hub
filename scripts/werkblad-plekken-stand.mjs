// Browsercontrole stroom D («Werkblad blokken»: slepen en plekken) op een LOKALE stand, zonder server/DB/netwerk.
// Bundelt tests/stand/werkblad-plekken-stand.tsx, serveert op 127.0.0.1, start Chrome met alles behalve loopback → ~NOTFOUND.
// Gebruik: PLAYWRIGHT_CORE=<pad> node scripts/werkblad-plekken-stand.mjs [uitmap-schermafdrukken]
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import net from 'node:net';

// alleen lokaal: sockets uit dit proces alleen naar loopback
const LOKAAL = new Set(['localhost', '127.0.0.1', '::1']);
const orig = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) {
  const b = Array.isArray(a[0]) ? a[0] : a; const x = b[0] && typeof b[0] === 'object' ? b[0] : null;
  const host = x ? x.host : typeof b[1] === 'string' ? b[1] : undefined;
  if (x && x.path) return orig.apply(this, a);
  if (host && !LOKAAL.has(host)) throw new Error(`stand-slot: ${host} geweigerd (alleen lokaal)`);
  return orig.apply(this, a);
};

const PW = process.env.PLAYWRIGHT_CORE || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core';
const { chromium } = await import(join(PW, 'index.mjs'));
const UIT = process.argv[2] || '/workspace/audit-blokken';
const MAP = 'rapporten/stand-plekken';
await mkdir(MAP, { recursive: true }); await mkdir(UIT, { recursive: true });
await build({ entryPoints: ['tests/stand/werkblad-plekken-stand.tsx'], outfile: join(MAP, 'stand.js'), bundle: true, format: 'iife', jsx: 'automatic', target: 'chrome120', logLevel: 'warning', define: { 'process.env.NODE_ENV': '"development"' } });
await copyFile('tests/stand/werkblad-plekken-stand.html', join(MAP, 'index.html'));
const srv = createServer(async (req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const naam = (req.url || '/').split('?')[0].replace(/^\/$/, '/index.html').replace(/[^a-z.\-/]/g, '');
  try { const d = await readFile(join(MAP, naam)); res.writeHead(200, { 'content-type': naam.endsWith('.js') ? 'text/javascript' : naam.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' }); res.end(d); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const URL_ = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--no-proxy-server'] });

const res = []; const check = (naam, ok, info = '') => { res.push(ok); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const st = (p) => p.evaluate(() => window.__stand);
const ids = (b) => b.kinderen.map((k) => k.id);
const zoekB = (b, id) => b.id === id ? b : b.kinderen.filter((k) => k.soort === 'blok').map((k) => zoekB(k, id)).find(Boolean);
const midden = async (p, sel, fy = 0.5) => { const r = await p.locator(sel).first().boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height * fy }; };
async function muisSleep(p, van, naar, { alt = false, opHalf } = {}) {
  const a = await midden(p, van); const b = typeof naar === 'string' ? await midden(p, naar, 0.25) : naar;
  await p.mouse.move(a.x, a.y); await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(a.x + (b.x - a.x) * i / 12, a.y + (b.y - a.y) * i / 12);
  if (alt) { await p.keyboard.down('Alt'); await p.mouse.move(b.x + 1, b.y + 1); }
  if (opHalf) await opHalf();
  await p.mouse.up(); if (alt) await p.keyboard.up('Alt');
  await p.waitForTimeout(60);
}
async function raakSleep(p, cdp, van, naar, wachtMs = 600) {
  const a = await midden(p, van); const b = typeof naar === 'string' ? await midden(p, naar) : naar;
  const pt = (x, y) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(a.x, a.y) });
  await p.waitForTimeout(wachtMs);
  for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(a.x + (b.x - a.x) * i / 12, a.y + (b.y - a.y) * i / 12) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(80);
}

for (const breedte of [1280, 390]) {
  const telefoon = breedte === 390;
  const ctx = await browser.newContext({ viewport: { width: breedte, height: telefoon ? 844 : 900 }, hasTouch: telefoon, isMobile: telefoon, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const fouten = []; p.on('pageerror', (e) => fouten.push(String(e))); p.on('console', (m) => m.type() === 'error' && fouten.push(m.text()));
  await p.goto(URL_); await p.waitForSelector('[data-testid=o-mail]');
  const tag = `${breedte}`;
  await p.screenshot({ path: join(UIT, `d-${tag}-0-begin.png`) });
  if (!telefoon) {
    // 1. muis: onderdeel naar genest blok, vóór «Хмара»
    await muisSleep(p, '[data-testid=o-notities]', '[data-testid=o-cloud]', { opHalf: () => p.screenshot({ path: join(UIT, `d-${tag}-1-slepen-naar-blok.png`) }) });
    let s = await st(p);
    check(`${tag} muis: Нотатки → блок «Група» vóór Хмара`, ids(zoekB(s.wortel, 'groep')).join() === 'taken,notities,cloud', ids(zoekB(s.wortel, 'groep')).join());
    // 2. uit blok naar canvas: gewone snelkoppeling met stijl
    const cv = await p.locator('[data-testid=canvas]').boundingBox();
    await muisSleep(p, '[data-testid=o-mail]', { x: cv.x + 700, y: cv.y + 60 });
    s = await st(p);
    const m = s.canvas.find((c) => c.itemId === 'svc:mail');
    check(`${tag} blok → canvas: snelkoppeling, kleur behouden`, !!m && m.kind === 'shortcut' && m.config?.achtergrond === '#7c3aed' && !ids(s.wortel).includes('mail'));
    // 3. technisch → privéblok: weigering met reden in tekst, niets gewijzigd
    let reden = '';
    await muisSleep(p, '[data-testid=c-admin]', '[data-testid=o-agenda]', { opHalf: async () => { reden = await p.locator('.wb-sleep-melding').textContent(); await p.screenshot({ path: join(UIT, `d-${tag}-2-geweigerd-technisch.png`) }); } });
    s = await st(p);
    check(`${tag} technisch item geweigerd + reden zichtbaar`, /технічний/.test(reden) && s.canvas.some((c) => c.itemId === 'svc:admin') && !JSON.stringify(s.wortel).includes('svc:admin'), reden);
    // 4. Esc annuleert
    const voor = JSON.stringify(await st(p));
    const a = await midden(p, '[data-testid=o-agenda]'); const b2 = await midden(p, '[data-testid=o-taken]');
    await p.mouse.move(a.x, a.y); await p.mouse.down(); for (let i = 1; i <= 8; i++) await p.mouse.move(a.x + (b2.x - a.x) * i / 8, a.y + (b2.y - a.y) * i / 8);
    await p.keyboard.press('Escape'); await p.mouse.up(); await p.waitForTimeout(50);
    check(`${tag} Esc annuleert (geen wijziging, geen geest)`, JSON.stringify(await st(p)) === voor && (await p.locator('.wb-sleep-geest').count()) === 0);
    // 5. Alt = kopie naar menu
    await muisSleep(p, '[data-testid=o-agenda]', '[data-menu-sleutel="svc:cloud"]', { alt: true, opHalf: () => p.screenshot({ path: join(UIT, `d-${tag}-3-kopie-naar-menu.png`) }) });
    s = await st(p);
    check(`${tag} Alt-kopie naar menu vóór Хмара, blijft in blok`, s.menu.join() === 'svc:mail,svc:agenda,svc:cloud' && ids(s.wortel).includes('agenda'), s.menu.join());
    // 6. blok in blok (groep naar begin van snel) en ongedaan/opnieuw
    await p.keyboard.press('Control+z'); s = await st(p);
    check(`${tag} Ctrl+Z maakt menukopie ongedaan`, s.menu.join() === 'svc:mail,svc:cloud');
    await p.keyboard.press('Control+Shift+z'); s = await st(p);
    check(`${tag} Ctrl+Shift+Z opnieuw`, s.menu.join() === 'svc:mail,svc:agenda,svc:cloud');
    // 7. klik zonder slepen = geen sleepactie
    await p.locator('[data-testid=o-github]').click(); s = await st(p);
    check(`${tag} gewone klik verplaatst niets`, ids(s.wortel).includes('github'));
    await p.screenshot({ path: join(UIT, `d-${tag}-4-na-muis.png`) });
  } else {
    const cdp = await ctx.newCDPSession(p);
    // kort aanraken + bewegen = scrollen, geen sleep
    const voor = JSON.stringify(await st(p));
    await raakSleep(p, cdp, '[data-testid=o-github]', '[data-testid=o-taken]', 100);
    check(`${tag} aanraken zonder lang indrukken sleept niet`, JSON.stringify(await st(p)) === voor);
    // lang indrukken 450 ms → slepen naar genest blok
    await raakSleep(p, cdp, '[data-testid=o-github]', '[data-testid=o-cloud]');
    let s = await st(p);
    check(`${tag} aanraken (lang indrukken) GitHub → «Група»`, ids(zoekB(s.wortel, 'groep')).includes('github'), ids(zoekB(s.wortel, 'groep')).join());
    // canvas → blok (snelkoppeling → onderdeel)
    await raakSleep(p, cdp, '[data-testid=c-ai]', '[data-testid=o-agenda]');
    s = await st(p);
    check(`${tag} aanraken: canvas ШІ → blok`, JSON.stringify(s.wortel).includes('svc:ai') && !s.canvas.some((c) => c.itemId === 'svc:ai'));
    await p.screenshot({ path: join(UIT, `d-${tag}-1-na-aanraken.png`) });
  }
  // toetsenbord: «Перемістити в…» (F2 op focus) — doet hetzelfde als slepen
  await p.locator('[data-testid=o-taken]').focus(); await p.keyboard.press('F2');
  await p.waitForSelector('.wb-plekkiezer');
  const opties = await p.locator('.wb-plekkiezer-lijst li').evaluateAll((l) => l.map((x) => [x.dataset.plek, x.dataset.geldig, x.textContent]));
  const pag = opties.find((o) => o[0] === 'pagina:mail#boven');
  check(`${tag} kiezer: pagina grijs met reden (niet verborgen)`, !!pag && pag[1] === 'nee' && /Ще недоступно/.test(pag[2]));
  const groep = opties.find((o) => o[0] === 'blok:groep');
  check(`${tag} kiezer: eigen ouderblok kiesbaar`, groep?.[1] === 'ja');
  await p.screenshot({ path: join(UIT, `d-${tag}-5-kiezer.png`) });
  // ↓ naar «Блок «Швидкий доступ»» (index 1), Enter → stap 2, End = в кінець, Enter
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
  await p.waitForSelector('.wb-plekkiezer-lijst li[data-voor]');
  await p.screenshot({ path: join(UIT, `d-${tag}-6-kiezer-volgorde.png`) });
  await p.keyboard.press('End'); await p.keyboard.press('Enter');
  await p.waitForTimeout(50);
  let s = await st(p);
  check(`${tag} toetsenbord: Завдання → кінець «Швидкий доступ»`, ids(s.wortel).at(-1) === 'taken' && (await p.locator('.wb-plekkiezer').count()) === 0, ids(s.wortel).join());
  // toetsenbord naar canvas = snelkoppeling
  await p.locator('[data-testid=o-agenda]').focus(); await p.keyboard.press('F2'); await p.waitForSelector('.wb-plekkiezer');
  await p.keyboard.press('Home'); await p.keyboard.press('Enter'); await p.waitForTimeout(50);
  s = await st(p);
  check(`${tag} toetsenbord: Календар → Робочий стіл`, s.canvas.some((c) => c.itemId === 'svc:agenda' && c.kind === 'shortcut'));
  // Esc sluit
  await p.locator('[data-testid=o-cloud]').focus(); await p.keyboard.press('F2'); await p.waitForSelector('.wb-plekkiezer');
  await p.keyboard.press('Escape'); await p.waitForTimeout(30);
  check(`${tag} Esc sluit kiezer`, (await p.locator('.wb-plekkiezer').count()) === 0);
  await p.screenshot({ path: join(UIT, `d-${tag}-7-eind.png`) });
  check(`${tag} geen JS-fouten`, fouten.length === 0, fouten.join(' | '));
  await ctx.close();
}
await browser.close(); srv.close();
const fout = res.filter((x) => !x).length;
console.log(`stand werkblad-plekken: ${res.length - fout}/${res.length} OK`);
process.exit(fout ? 1 : 0);
