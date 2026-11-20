// Eenheidstest (echte handler + echte database, nagebootste Google): meerdere tabbladen in één browser.
// - Twee parallelle aanmeldingen (tab A en tab B, elk een eigen account) in één cookiejar ronden allebei af:
//   elke transactie heeft een eigen bindingscookie `__Secure-tsv_aanmeld_binding_<hash>`.
// - Na de aanmelding in tab B blijft tab A op zijn eigen account (de rootcookie wordt niet vervangen).
// Google wordt nagebootst met een eigen RSA-sleutel: fetch() naar het token-, certs- en userinfo-endpoint
// wordt onderschept. Er gaat niets naar buiten.
import { createSign, generateKeyPairSync, randomBytes } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

export async function main() {
  const tijd = Date.now();
  const CLIENT = '1234567890-eenheidstest.apps.googleusercontent.com';
  const vorige = { id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET, suite: process.env.GOOGLE_SUITE_CLIENT_ID, owner: process.env.OWNER_EMAIL };
  process.env.GOOGLE_OAUTH_CLIENT_ID = CLIENT; process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'eenheidstest-geheim'; delete process.env.GOOGLE_SUITE_CLIENT_ID;
  process.env.OWNER_EMAIL = `tab-eigenaar-${tijd}@example.test`;

  // Nagebootste Google.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = `eenheid-${tijd}`;
  const codes = new Map<string, { sub: string; email: string; nonce: string }>();
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(String(init?.body || ''));
      const c = codes.get(p.get('code') || '');
      if (!c || p.get('client_id') !== CLIENT) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      const kop = b64({ alg: 'RS256', kid }), nu = Math.floor(Date.now() / 1000);
      const inhoud = b64({ iss: 'https://accounts.google.com', aud: CLIENT, sub: c.sub, email: c.email, email_verified: true, name: c.email, iat: nu, exp: nu + 600, nonce: c.nonce });
      const handtekening = createSign('RSA-SHA256').update(`${kop}.${inhoud}`).sign(privateKey).toString('base64url');
      return new Response(JSON.stringify({ id_token: `${kop}.${inhoud}.${handtekening}`, access_token: 'eenheid' }), { status: 200 });
    }
    if (url === 'https://www.googleapis.com/oauth2/v1/certs') return new Response(JSON.stringify({ [kid]: publicKey.export({ type: 'spki', format: 'pem' }) }), { status: 200, headers: { 'cache-control': 'max-age=60' } });
    if (url.startsWith('https://openidconnect.googleapis.com/')) return new Response('{}', { status: 404 });
    return echteFetch(input as RequestInfo, init);
  }) as typeof fetch;

  const { handler } = await import('../../backend/index');
  await new Promise(r => setTimeout(r, 100)); // refreshClientId() is async bij het laden

  // Eenvoudige cookiejar voor één browser (alle cookies hebben Domain=.tarasevych.com).
  const jar = new Map<string, string>();
  const neemOp = (headers: Record<string, string> = {}) => {
    const raw = Object.entries(headers).filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => v).join(', ');
    for (const c of raw ? raw.split(/,\s*(?=[^;,\s]+=)/) : []) {
      const [paar] = c.split(';'); const i = paar.indexOf('='); const naam = paar.slice(0, i).trim(), waarde = paar.slice(i + 1).trim();
      if (/Max-Age=0\b/i.test(c) || !waarde) jar.delete(naam); else jar.set(naam, waarde);
    }
  };
  const cookieKop = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const verzoek = async (host: string, path: string, body: unknown) => {
    const headers: Record<string, string> = { host, origin: `https://${host}`, 'content-type': 'application/json', 'user-agent': 'eenheidstest', 'x-forwarded-for': '203.0.113.9' };
    if (jar.size) headers.cookie = cookieKop();
    const r = await handler({ headers, body: JSON.stringify(body), isBase64Encoded: false, rawPath: path, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path, sourceIp: '203.0.113.9', userAgent: 'eenheidstest' } } } as never) as { statusCode: number; headers: Record<string, string>; body: string };
    neemOp(r.headers);
    let data: Record<string, any> = {}; try { data = JSON.parse(r.body); } catch {}
    return { status: r.statusCode, data, setCookie: Object.entries(r.headers || {}).filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => v).join(', ') };
  };
  const tab = () => randomBytes(24).toString('hex');
  const start = async (tabContext: string) => {
    const r = await verzoek('hub.tarasevych.com', '/api/owner/identity/transactions/create', { service: 'hub', tabContext, flowMode: 'redirect', returnTo: 'https://hub.tarasevych.com/', locale: 'nl', intent: 'replace-tab', remember: false });
    const u = new URL(String(r.data.authUrl || 'https://x.invalid/'));
    return { r, state: u.searchParams.get('state') || '', nonce: u.searchParams.get('nonce') || '' };
  };
  const rondAf = async (s: { state: string; nonce: string }, sub: string, email: string) => {
    const code = `code-${randomBytes(6).toString('hex')}`; codes.set(code, { sub, email, nonce: s.nonce });
    return verzoek('id.tarasevych.com', '/api/owner/auth/google/callback', { state: s.state, code });
  };
  const wieIn = async (tabContext: string) => { const r = await verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext }); return { state: String(r.data.state || ''), email: String(r.data.user?.email || r.data.account?.email || r.data.email || '') }; };

  const mailA = `tab-a-${tijd}@example.test`, mailB = `tab-b-${tijd}@example.test`, mailC = `tab-c-${tijd}@example.test`;
  const tabA = tab(), tabB = tab(), tabC = tab();
  try {
    // Beide tabbladen starten (afgemeld) tegelijk een aanmelding: twee bindingscookies in één jar.
    const sA = await start(tabA), sB = await start(tabB);
    const bindingNamen = [...jar.keys()].filter(k => k.startsWith('__Secure-tsv_aanmeld_binding_'));
    check('parallel: twee transacties zetten elk een eigen bindingscookie (naam per transactie, Max-Age 900)', sA.r.data.ok === true && sB.r.data.ok === true && bindingNamen.length === 2 && /Max-Age=900;/.test(sA.r.setCookie) && !jar.has('__Secure-tsv_aanmeld_binding'), `${bindingNamen.length} cookies, ${sA.r.status}/${sB.r.status} ${sA.r.data.reasonCode || ''}`);
    const cbA = await rondAf(sA, `sub-a-${tijd}`, mailA);
    const naA = [...jar.keys()].filter(k => k.startsWith('__Secure-tsv_aanmeld_binding_'));
    const rootNaA = [...jar].find(([k]) => k.startsWith('__Secure-tsv_ecosystem_'))?.[1] || '';
    const cbB = await rondAf(sB, `sub-b-${tijd}`, mailB);
    const rootNaB = [...jar].find(([k]) => k.startsWith('__Secure-tsv_ecosystem_'))?.[1] || '';
    check('parallel: beide aanmeldingen ronden af in dezelfde browser; alleen de eigen bindingscookie wordt gewist', cbA.data.ok === true && cbB.data.ok === true && naA.length === 1 && [...jar.keys()].filter(k => k.startsWith('__Secure-tsv_aanmeld_binding_')).length === 0, `A ${cbA.data.reasonCode}, B ${cbB.data.reasonCode}, na A nog ${naA.length} binding`);
    check('één actief account per browser: de tweede aanmelding roteert het browseranker (replaceScope=browser)', !!rootNaA && !!rootNaB && rootNaA !== rootNaB && cbB.data.replaceScope === 'browser', `roteert ${rootNaA !== rootNaB}, scope ${cbB.data.replaceScope}`);
    const a1 = await wieIn(tabA), b1 = await wieIn(tabB);
    check('één actief account per browser: tab A en tab B volgen beide het nieuw aangemelde account B', a1.email === mailB && b1.email === mailB, `A=${a1.state}/${a1.email}, B=${b1.state}/${b1.email}`);
    // Een derde tabblad dat later afrondt, schakelt de hele browser door naar account C.
    const sC = await start(tabC);
    const cbC = await rondAf(sC, `sub-c-${tijd}`, mailC);
    const a2 = await wieIn(tabA), b2 = await wieIn(tabB), c2 = await wieIn(tabC);
    check('één actief account per browser: derde aanmelding (tab C) zet A, B en C op account C', cbC.data.ok === true && a2.email === mailC && b2.email === mailC && c2.email === mailC, `A ${a2.email === mailC}, B ${b2.email === mailC}, C ${c2.email === mailC}`);
    // Bindingscookie van transactie D werkt niet voor transactie E (andere naam, tab en transactie).
    const sD = await start(tab());
    const dNaam = [...jar.keys()].find(k => k.startsWith('__Secure-tsv_aanmeld_binding_'))!;
    const dWaarde = jar.get(dNaam)!;
    jar.delete(dNaam);
    const sE = await start(tab());
    const eNaam = [...jar.keys()].find(k => k.startsWith('__Secure-tsv_aanmeld_binding_'))!;
    jar.set(eNaam, dWaarde); // waarde van D onder de naam van E
    const cbE = await rondAf(sE, `sub-e-${tijd}`, `tab-e-${tijd}@example.test`);
    check('binding: cookiewaarde van een andere transactie geldt niet (naam/tab/transactie gebonden)', cbE.data.ok === false && cbE.data.reasonCode === 'LOGIN_BINDING_MISMATCH' && !!sD.state, String(cbE.data.reasonCode));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    globalThis.fetch = echteFetch;
    const pool = getPool();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`tab-%-${tijd}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]);
    for (const [k, v] of Object.entries({ GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret, GOOGLE_SUITE_CLIENT_ID: vorige.suite, OWNER_EMAIL: vorige.owner })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool();
  const mis = resultaten.filter(r => !r.ok).length;
  console.log(`\n${resultaten.length - mis}/${resultaten.length} geslaagd (tabbladen)`);
  return mis ? 1 : 0;
}
