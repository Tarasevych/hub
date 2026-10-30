// Eenheidstest toegangspoort (beveiliging fase 2): elke route zonder referenties aanroepen.
// Faalt als een route buiten PUBLIEKE_ROUTES een anoniem verzoek met 2xx beantwoordt (vergeten controle),
// als de allowlist routes noemt die niet (meer) bestaan, of als het vangnet / requireAuth niet werkt.
import { closePool } from '../../server/platform/pg';
import { PUBLIEKE_ROUTES, registreerSessieControle, requireAuth } from '../../server/platform/auth-poort';
import { json, router } from '../../server/platform/router';
import { sessieGeverifieerd, zetGebruiker } from '../../server/platform/context';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const evt = (method: string, path: string, headers: Record<string, string> = {}, body = '{}') => ({
  headers: { host: 'hub.tarasevych.com', origin: 'https://hub.tarasevych.com', 'content-type': 'application/json', 'user-agent': 'routetest', 'x-forwarded-for': '203.0.113.7', ...headers },
  body, isBase64Encoded: false as const, rawPath: path, rawQueryString: '', queryStringParameters: {},
  requestContext: { http: { method, path, sourceIp: '203.0.113.7', userAgent: 'routetest' } },
});

const DIENSTEN = ['hub', 'id', 'mail', 'cloud', 'admin', 'api'];

export async function main() {
  const vorige = process.env.AUTH_POORT_AFDWINGEN;
  try {
    const { handler } = await import('../../backend/index');
    await new Promise((r) => setTimeout(r, 100));
    const patronen: string[] = (handler as any).patronen;
    const open: string[] = [];
    for (const p of patronen) {
      const [method, pad] = p.split(' ');
      // Lege body en een body per dienst (veel routes weigeren eerst een ontbrekende dienst met 400).
      for (const body of ['{}', ...DIENSTEN.map((service) => JSON.stringify({ service, tab: 'ecosystem', locale: 'uk' }))]) {
        const r = await handler(evt(method, pad.replace(/:[A-Za-z_]+/g, 'x'), { host: `${body.includes('"service"') ? JSON.parse(body).service : 'hub'}.tarasevych.com` }, body) as never);
        if (r.statusCode >= 200 && r.statusCode < 300 && !(p in PUBLIEKE_ROUTES)) { open.push(`${r.statusCode} ${p} ${body}`); break; }
      }
    }
    check(`alle ${patronen.length} routes: anoniem geen 2xx buiten PUBLIEKE_ROUTES`, open.length === 0, open.join(', '));
    const weg = Object.keys(PUBLIEKE_ROUTES).filter((p) => !patronen.includes(p));
    check('PUBLIEKE_ROUTES noemt alleen bestaande routes', weg.length === 0, weg.join(', '));

    // Vangnet in de router: een route die de controle vergeet.
    const proef = router({ 'POST /api/proef/vergeten': [async () => json({ geheim: 1 })], 'GET /api/_healthcheck': [async () => json({ ok: true })], 'POST /api/proef/met-sessie': [async () => { zetGebruiker('u-proef'); return json({ ok: 1 }); }], 'POST /api/proef/met-token': [async () => { sessieGeverifieerd(); return json({ ok: 1 }); }] });
    delete process.env.AUTH_POORT_AFDWINGEN;
    const melden = await proef(evt('POST', '/api/proef/vergeten') as never);
    process.env.AUTH_POORT_AFDWINGEN = '1';
    const dicht = await proef(evt('POST', '/api/proef/vergeten') as never);
    const metCookie = await proef(evt('POST', '/api/proef/vergeten', { cookie: 'x=1', authorization: 'Bearer nep' }) as never);
    const metSessie = await proef(evt('POST', '/api/proef/met-sessie') as never);
    const metToken = await proef(evt('POST', '/api/proef/met-token') as never);
    const publiek = await proef(evt('GET', '/api/_healthcheck') as never);
    check('vangnet: standaard melden (200 blijft), met AUTH_POORT_AFDWINGEN=1 → 401, ook met willekeurige Cookie/Authorization (audit-fix 8); gecontroleerde sessie/token of publiek ongemoeid',
      melden.statusCode === 200 && dicht.statusCode === 401 && metCookie.statusCode === 401 && metSessie.statusCode === 200 && metToken.statusCode === 200 && publiek.statusCode === 200, `${melden.statusCode}/${dicht.statusCode}/${metCookie.statusCode}/${metSessie.statusCode}/${metToken.statusCode}/${publiek.statusCode}`);
    const pad = async (p: string) => (await proef(evt('POST', p) as never)).statusCode;
    const varianten = [await pad('/api/proef/met-sessie/'), await pad('/api//proef/met-sessie'), await pad('/api/proef/./met-sessie'), await pad('/api/proef/met-sessie')];
    check('router: niet-canonieke paden (afsluitende /, //, punt-segment) → 404, canoniek pad werkt (audit-fix 3)', JSON.stringify(varianten) === '[404,404,404,200]', JSON.stringify(varianten));

    // requireAuth met een nagebootste sessiecontrole.
    const gebruikers: Record<string, any> = { goed: { id: 'u1', status: 'approved', role: 'member' }, wacht: { id: 'u2', status: 'pending', role: 'member' }, beheer: { id: 'u3', status: 'approved', role: 'admin' } };
    registreerSessieControle(async (event) => { const u = gebruikers[String(event.headers.cookie || '').replace('s=', '')]; return u ? { user: u, service: 'hub' } : { errorCode: 'OWNER_SESSION_REQUIRED' }; }, (u, perm) => perm === 'admin.users' ? u.role === 'admin' : true);
    const r2 = router({ 'POST /api/proef/a': [requireAuth({ status: 'approved' }), async (ctx) => json({ wie: ctx.user?.userId })], 'POST /api/proef/b': [requireAuth({ status: 'approved', perm: 'admin.users' }), async () => json({ ok: true })], 'POST /api/proef/c': [requireAuth({ service: 'mail' }), async () => json({ ok: true })] });
    const st = async (pad: string, c?: string) => (await r2(evt('POST', pad, c ? { cookie: `s=${c}` } : {}) as never)).statusCode;
    const uitkomst = [await st('/api/proef/a'), await st('/api/proef/a', 'wacht'), await st('/api/proef/a', 'goed'), await st('/api/proef/b', 'goed'), await st('/api/proef/b', 'beheer'), await st('/api/proef/c', 'goed')];
    check('requireAuth: zonder sessie 401, niet goedgekeurd 403, goedgekeurd 200, recht ontbreekt 403, met recht 200, andere dienst 403', JSON.stringify(uitkomst) === JSON.stringify([401, 403, 200, 403, 200, 403]), JSON.stringify(uitkomst));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    if (vorige === undefined) delete process.env.AUTH_POORT_AFDWINGEN; else process.env.AUTH_POORT_AFDWINGEN = vorige;
  }
  const ok = resultaten.filter((r) => r.ok).length;
  console.log(`\n${ok}/${resultaten.length} geslaagd (routes)`);
  await closePool();
  return ok === resultaten.length ? 0 : 1;
}
