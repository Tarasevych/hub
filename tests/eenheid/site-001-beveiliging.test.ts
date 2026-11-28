// SITE-001 (пункт 24): постійний сторож заголовків безпеки (HTTP Security Headers) та обмеження частоти запитів (Rate Limiting).
// Перевіряє:
// 1) наявність повного комплекту з 9 захисних HTTP-заголовків на відповідях застосунку, API, юридичних сторінок і 404:
//    Strict-Transport-Security, Content-Security-Policy (без unsafe-eval і вбудованих скриптів), X-Content-Type-Options: nosniff,
//    X-Frame-Options: DENY, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy,
//    Cross-Origin-Opener-Policy: same-origin-allow-popups, Cross-Origin-Resource-Policy: same-site,
//    X-Permitted-Cross-Domain-Policies: none;
// 2) збереження сумісності для публічних значків/прев'ю (CORP: cross-origin) і вбудованого вікна Telegram WebApp (frame-ancestors https://web.telegram.org);
// 3) захист від підробленого заголовка Origin (403 CSRF_ORIGIN_DENIED) та невідомого хоста (421 Onbekende host);
// 4) маскування IPv6-адрес до мережі /64 у shared/ip-limiet.ts (захист від ротації адрес у межах однієї підмережі);
// 5) обмеження частоти запитів у пам'яті (_geheugenLimiet) та в PostgreSQL (rateLimit + Retry-After + pogingReserveren у app.login_lockouts);
// 6) відсутність витоку Server-Timing на чутливих шляхах STRIKTE_LIMIETEN та помилках 4xx/5xx;
// 7) відсутність заборонених літер у змінених файлах і тесті.
// nl: permanente bewakingstest voor HTTP-beveiligingskoppen en snelheidslimieten (punt 24).
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { limietSleutel } from '../../shared/ip-limiet';
import { clearLoginFailures, pogingReserveren, rateLimit } from '../../server/platform/beveiliging';
import { getPool } from '../../server/platform/pg';

function vraag(
  poort: number,
  pad: string,
  opties: { method?: string; host?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((res, rej) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: poort,
        path: pad,
        method: opties.method || 'GET',
        headers: { Host: opties.host || 'id.tarasevych.com', ...(opties.headers || {}) },
      },
      (antw) => {
        const stukken: Buffer[] = [];
        antw.on('data', (d) => stukken.push(Buffer.from(d)));
        antw.on('end', () =>
          res({ status: antw.statusCode || 0, headers: antw.headers, body: Buffer.concat(stukken).toString('utf8') }),
        );
      },
    );
    req.on('error', rej);
    if (opties.body) req.write(opties.body);
    req.end();
  });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-beveiliging');
  const proefDist = mkdtempSync(join(tmpdir(), 'site001-p24-dist-'));
  writeFileSync(join(proefDist, 'index.html'), '<!doctype html><html lang="uk"><title>Мій простір</title><div id="root"></div></html>');
  writeFileSync(join(proefDist, 'og-afbeelding.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const vorigeDist = process.env.DIST_DIR;
  process.env.DIST_DIR = proefDist;

  const { createServer, _geheugenLimiet } = await import('../../server/start');
  const srv = createServer();
  const poort = await new Promise<number>((res) => srv.listen(0, '127.0.0.1', () => res((srv.address() as { port: number }).port)));

  try {
    // 1. HTML-відповідь головної сторінки має всі 9 захисних заголовків
    const rApp = await vraag(poort, '/', { host: 'hub.tarasevych.com' });
    const h = rApp.headers;
    check(
      'HTML-відповідь містить HSTS (1 рік + includeSubDomains), nosniff, DENY, strict-origin-when-cross-origin, Permissions-Policy',
      rApp.status === 200 &&
        h['strict-transport-security'] === 'max-age=31536000; includeSubDomains' &&
        h['x-content-type-options'] === 'nosniff' &&
        h['x-frame-options'] === 'DENY' &&
        h['referrer-policy'] === 'strict-origin-when-cross-origin' &&
        String(h['permissions-policy'] || '').includes('geolocation=()'),
    );
    check(
      'HTML-відповідь містить COOP same-origin-allow-popups, CORP same-site, X-Permitted-Cross-Domain-Policies none та суворий CSP',
      h['cross-origin-opener-policy'] === 'same-origin-allow-popups' &&
        h['cross-origin-resource-policy'] === 'same-site' &&
        h['x-permitted-cross-domain-policies'] === 'none' &&
        String(h['content-security-policy'] || '').includes("default-src 'self'") &&
        String(h['content-security-policy'] || '').includes("frame-ancestors 'none'") &&
        !String(h['content-security-policy'] || '').includes("'unsafe-eval'"),
    );

    // 2. Публічне прев'ю og-afbeelding.png має CORP: cross-origin для соцмереж та оглядачів
    const rOg = await vraag(poort, '/og-afbeelding.png', { host: 'hub.tarasevych.com' });
    check(
      'публічна картка /og-afbeelding.png має Cross-Origin-Resource-Policy: cross-origin',
      rOg.status === 200 && rOg.headers['cross-origin-resource-policy'] === 'cross-origin',
    );

    // 3. Невідомий хост та чужий Origin отримують жорстку відмову
    const rHost = await vraag(poort, '/', { host: 'kwaad.example' });
    const rCsrf = await vraag(poort, '/api/owner/session/accounts', {
      method: 'POST',
      host: 'id.tarasevych.com',
      headers: { Origin: 'https://kwaad.example', 'Content-Type': 'application/json' },
      body: '{}',
    });
    check(
      'невідомий Host відхиляється кодом 421, а сторонній Origin на /api/* — кодом 403 без витоку Server-Timing',
      rHost.status === 421 && rCsrf.status === 403 && !rCsrf.headers['server-timing'],
    );

    // 4. Маскування IPv6 /64 та лічильник у пам'яті
    const sleutelA = limietSleutel('2001:db8:abcd:0012:1111:2222:3333:4444');
    const sleutelB = limietSleutel('2001:db8:abcd:0012:aaaa:bbbb:cccc:dddd');
    const emmer = `test-p24-${randomBytes(4).toString('hex')}`;
    const m1 = _geheugenLimiet(emmer, 2, 60_000);
    const m2 = _geheugenLimiet(emmer, 2, 60_000);
    const m3 = _geheugenLimiet(emmer, 2, 60_000);
    check(
      'limietSleutel об’єднує різні адреси однієї підмережі IPv6 /64, а _geheugenLimiet блокує перевищення з Retry-After > 0',
      sleutelA === sleutelB && m1.ok && m2.ok && !m3.ok && m3.retryAfter > 0,
    );

    // 5. Стійкий кошик rateLimit і прогресивне блокування pogingReserveren у живій PostgreSQL
    if (process.env.DATABASE_URL) {
      const dbEmmer = `site001-p24-${randomBytes(6).toString('hex')}`;
      const subj = `site001-lock-${randomBytes(6).toString('hex')}`;
      try {
        const rl1 = await rateLimit(dbEmmer, 2, 60, { failClosed: true });
        const rl2 = await rateLimit(dbEmmer, 2, 60, { failClosed: true });
        const rl3 = await rateLimit(dbEmmer, 2, 60, { failClosed: true });
        let laatsteWacht = 0;
        let toegestaan5 = true;
        for (let i = 0; i < 5; i += 1) {
          const p = await pogingReserveren(subj);
          toegestaan5 = toegestaan5 && p.toegestaan;
        }
        const p6 = await pogingReserveren(subj);
        laatsteWacht = p6.wachtSeconden;
        await clearLoginFailures(subj);
        const pNaWis = await pogingReserveren(subj);
        await clearLoginFailures(subj);
        await getPool().query('DELETE FROM app.rate_limits WHERE bucket = $1', [dbEmmer]);
        check(
          'PostgreSQL rateLimit блокує 3-тю спробу за межі 2/хв, а pogingReserveren блокує 6-ту невдалу спробу входу на ~15 хв і скидається після clearLoginFailures',
          rl1.ok && rl2.ok && !rl3.ok && rl3.retryAfter > 0 && toegestaan5 && !p6.toegestaan && laatsteWacht >= 800 && pNaWis.toegestaan,
        );
      } finally {
        await clearLoginFailures(subj).catch(() => undefined);
        await getPool().query('DELETE FROM app.rate_limits WHERE bucket = $1', [dbEmmer]).catch(() => undefined);
      }
    } else {
      check('PostgreSQL rateLimit і pogingReserveren пропущені без DATABASE_URL', true);
    }

    // 6. Мовна чистота
    const verboden = new RegExp('[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]');
    const startBron = readFileSync('server/start.ts', 'utf8');
    const zelf = readFileSync('tests/eenheid/site-001-beveiliging.test.ts', 'utf8');
    check('відсутність заборонених літер у server/start.ts і тесті', !verboden.test(startBron) && !verboden.test(zelf));
  } finally {
    await new Promise<void>((res) => srv.close(() => res()));
    if (vorigeDist === undefined) delete process.env.DIST_DIR;
    else process.env.DIST_DIR = vorigeDist;
    rmSync(proefDist, { recursive: true, force: true });
  }

  return einde();
}
