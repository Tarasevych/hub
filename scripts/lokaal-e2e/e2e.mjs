import { chromium } from 'playwright-core'; import pg from 'pg'; import { createHash, randomBytes, randomUUID } from 'node:crypto';
const sha = v => createHash('sha256').update(v).digest('hex');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const out = []; const check = (n, ok, i = '') => { out.push(ok); console.log(`${ok ? 'OK  ' : 'FOUT'} ${n}${i ? ' — ' + i : ''}`); };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:8443', '--no-sandbox'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
const csp = []; const errors = [];
ctx.on('console', m => { const t = m.text(); if (/Content Security Policy|Refused to/.test(t)) csp.push(t.slice(0, 200)); else if (m.type() === 'error') errors.push(t.slice(0, 200)); });
const page = await ctx.newPage(); page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
const nu = Date.now(); let uid;
try {
  // Test 1: afgemelde shell is niet leeg.
  await page.goto('https://hub.tarasevych.com/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  let text = (await page.locator('body').innerText()).trim();
  await page.screenshot({ path: '/tmp/pw/1-hub-afgemeld.png' });
  check('Test 1: hub afgemeld toont echte shell', text.length > 10, JSON.stringify(text.slice(0, 120)));
  await page.goto('https://id.tarasevych.com/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
  text = (await page.locator('body').innerText()).trim();
  await page.screenshot({ path: '/tmp/pw/1-id-afgemeld.png' });
  check('Test 1: id afgemeld toont geen accountgegevens', text.length > 20 && !text.includes('rooktest'), JSON.stringify(text.slice(0, 120)));

  // Test 2: aangemelde hub (sessie gezaaid, want Google is nog niet geconfigureerd).
  uid = randomUUID();
  await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['users', uid, { email: 'e2e-eigenaar@example.test', sub: 'e2e', name: 'E2E Eigenaar', picture: '', role: 'owner', status: 'approved', accessLevel: 'full', entitlements: [], createdAt: nu, updatedAt: nu }]);
  const token = randomBytes(32).toString('base64url'); const sid = randomUUID();
  await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['owner_service_sessions_v1', sid, { tokenHash: sha(token), userId: uid, service: 'hub', sourceOrigin: 'https://hub.tarasevych.com', tabHash: sha('ecosystem'), createdAt: nu, authenticatedAt: nu, lastSeenAt: nu, idleExpiresAt: nu + 864e5, absoluteExpiresAt: nu + 7 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, ip: '198.51.100.9', userAgent: 'e2e', authMethod: 'google', scope: 'ecosystem' }]);
  await ctx.addCookies([{ name: '__Secure-tsv_ecosystem_migrated-bg2v4h', value: encodeURIComponent(`${sid}.${token}`), domain: '.tarasevych.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  for (const host of ['hub', 'cloud']) {
    await page.goto(`https://${host}.tarasevych.com/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
    text = (await page.locator('body').innerText()).trim();
    await page.screenshot({ path: `/tmp/pw/3-${host}-aangemeld.png` });
    const heading = await page.locator('h1, h2').first().innerText().catch(() => '');
    check(`Test 2: ${host} aangemeld toont kop en inhoud`, !!heading && text.length > 80, `kop=${JSON.stringify(heading.slice(0, 60))} tekst=${text.length} tekens; naam zichtbaar=${text.includes('E2E')}`);
  }
  // Test 8: passkeys verborgen tot echte verificatie; TOTP-kaart wel zichtbaar.
  await page.goto('https://id.tarasevych.com/security', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/pw/8-id-beveiliging.png' });
  const passkeyKaart = await page.locator("[data-access-factor='webauthn']").count();
  const totpKaart = await page.locator("[data-access-factor='totp']").count();
  const passkeyKnop = await page.getByText(/Passkey toevoegen|Додати passkey/).count();
  check('Test 8: beveiliging toont geen passkey-kaart of -knop (wel TOTP)', passkeyKaart === 0 && passkeyKnop === 0 && totpKaart > 0, `webauthn=${passkeyKaart} knop=${passkeyKnop} totp=${totpKaart}`);
  const cookies = await ctx.cookies('https://mail.tarasevych.com/');
  check('cookie geldt ook voor mail.tarasevych.com (één aanmelding)', cookies.some(c => c.name.startsWith('__Secure-tsv_ecosystem_')), cookies.map(c => `${c.name}(${c.sameSite},${c.domain})`).join(', '));
  check('geen CSP-schendingen in de console', csp.length === 0, csp.slice(0, 3).join(' | '));
  console.log('Overige console-fouten:', errors.slice(0, 8));
} finally {
  if (uid) await pool.query("delete from app.records where id=$1 or data->>'userId'=$1 or data->>'ownerUserId'=$1", [uid]);
  await browser.close(); await pool.end();
  console.log(`${out.filter(Boolean).length}/${out.length} geslaagd`);
}
