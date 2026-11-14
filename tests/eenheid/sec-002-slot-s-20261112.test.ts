// SEC-002, laatste correctie «s» (server): regressietests voor de punten van de eindcontrole (eind-regressie, eind-interface, eind-omzeiling).
// SEC-002, останнє виправлення «s» (сервер): регресійні перевірки за висновками наскрізної перевірки.
//  A. Sessie verversen met auth-poort AAN: 200, geen poort401, de zekering zet de poort NIET uit; zekering telt verschillende routes.
//  B. Rol «лише перегляд»: alle leesroutes zonder leeswoord open (eind-regressie midden-1), eigen toegang intrekken open, nieuwe
//     toegang maken dicht; melding toegang_alleen_lezen hoogstens één per uur.
//  C. body-aanmelding: alleen een levende sessie telt (niet ingetrokken, niet verlopen), hoogstens 4 cookies opgezocht.
//  D. NUL: in een waarde weggehaald (200), in een sleutel/padparameter/query 400 INVOER_NUL; koppeling-id geen uuid → geen 500.
//  E. 415 JSON_VEREIST: journaalregel + melding (begrensd); CONSENT_ANDERE_BROWSER: journaal + melding (begrensd);
//     JOURNAAL_NIET_BESCHIKBAAR met Retry-After.
//  F. Nieuw apparaat na de update (eind-regressie midden-2): browser met een OUDE labelrij → neutrale melding, rij verbruikt;
//     zonder toegangssleutel een duidelijke andere weg in de status van de Telegram-aanmelding.
//  G. Kleine punten: agent (`node meta.js --in=.env` → padcontrole), github-platform zonder console, dode binding weg.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { checker } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { router } from '../../server/platform/router';
import { poortAfdwingen } from '../../server/platform/auth-poort';
import { _schakelaarsReset } from '../../server/platform/schakelaars';
import { _tellerLeeg, som, telPoort401 } from '../../server/platform/antwoord-teller';
import { registreerMelder } from '../../backend/melder';

type Res = { statusCode: number; body: string; headers?: Record<string, string> };
const nul = { totaal: 0, '5xx': 0, '403': 0, poort401: 0, poort401routes: 0, opa: 0, opa403: 0, rls: 0 };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const NULT = String.fromCharCode(0);

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-slot-s-20261112');
  const metDb = Boolean(process.env.DATABASE_URL_SYSTEM || process.env.DATABASE_URL);
  const meldingen: Array<{ userId: string; kind: string; title: string; message: string }> = [];
  registreerMelder(async (userId, _e, kind, title, message) => { meldingen.push({ userId, kind, title, message }); });
  const bv = await import('../../backend/beveiliging-schakelaars');

  // ------------------------------------------------------------------ A. zekering: verschillende routes, puur
  check('A: 5× 401 op één route → niet automatisch uit, wel voorstel aan de eigenaar',
    bv.zekeringOordeel('auth-poort', { ...nul, totaal: 50, poort401: 7, poort401routes: 1 }) === null
    && bv.zekeringVoorstel('auth-poort', { ...nul, totaal: 50, poort401: 7, poort401routes: 1 }) === 'poort-401-een-route');
  check('A: 401 op drie verschillende routes → poort-401-piek (echte fout van de poort)', bv.zekeringOordeel('auth-poort', { ...nul, totaal: 50, poort401: 5, poort401routes: 3 }) === 'poort-401-piek');
  _tellerLeeg();
  const t0 = Date.now();
  for (let i = 0; i < 6; i++) telPoort401('POST /api/x', t0);
  telPoort401('POST /api/y', t0);
  const s0 = som(t0 - 1000, t0 + 1000);
  check('A: teller telt 401 én de verschillende routepatronen', s0.poort401 === 7 && s0.poort401routes === 2, JSON.stringify(s0));
  _tellerLeeg();

  if (!metDb) { console.log('OVERGESLAGEN (geen database): A-handler, B-dispatcher, C, D-dispatcher, E, F'); return einde(); }
  const sys = getPool('systeem');
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
  // backend/index.ts registreert bij het laden zijn eigen notify — daarna opnieuw de eigen opvang van meldingen.
  registreerMelder(async (userId, _e, kind, title, message) => { meldingen.push({ userId, kind, title, message }); });
  const sfx = randomBytes(4).toString('hex');
  const mensen: string[] = [];
  const mens = async (rol: 'member' | 'viewer') => {
    const id = randomUUID(); mensen.push(id);
    await sys.query(`INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)`, [id, { email: `${rol}-${sfx}-${mensen.length}@test.invalid`, role: rol, status: 'approved', accessLevel: rol === 'viewer' ? 'limited' : 'full', name: rol }]);
    return id;
  };
  const sessie = async (userId: string, extra: Record<string, unknown> = {}) => {
    const token = randomBytes(32).toString('base64url'); const now = Date.now(); const id = randomUUID();
    await sys.query(`INSERT INTO app.records (tbl,id,data) VALUES ('owner_service_sessions_v1',$1,$2)`, [id, { id, tokenHash: sha(token), userId, service: 'hub', sourceOrigin: 'https://hub.tarasevych.com', tabHash: sha('x'), createdAt: now, authenticatedAt: now, lastSeenAt: now, idleExpiresAt: now + 864e5, absoluteExpiresAt: now + 864e5, rotation: 0, version: 1, revocationEpoch: 999999, scope: 'ecosystem', userAgent: 'proef', ...extra }]);
    mensen.push(id);
    return { id, token, cookie: `${id}.${token}` };
  };
  const roep = async (cookie: string, methode: string, pad: string, body: Record<string, unknown> = {}, host = 'hub', ruwLijf?: string) => handler({
    headers: { host: `${host}.tarasevych.com`, origin: `https://${host}.tarasevych.com`, 'content-type': ruwLijf ? 'application/x-www-form-urlencoded' : 'application/json', cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(cookie)}`, 'user-agent': 'proef' },
    body: ruwLijf ?? JSON.stringify({ service: host, sourceOrigin: `https://${host}.tarasevych.com`, tabContext: 'a'.repeat(48), ...body }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {},
    requestContext: { http: { method: methode, path: pad, sourceIp: '203.0.113.91', userAgent: 'proef' } },
  } as never) as Promise<Res>;
  const code = (r: Res) => { try { return String(JSON.parse(r.body || '{}').error || ''); } catch { return ''; } };

  try {
    // ------------------------------------------------------------------ A. sessie verversen met auth-poort aan (de HOGE vondst)
    const lid = await mens('member');
    const eig = (await sys.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0]?.id || lid;
    _schakelaarsReset(); bv._bewakingReset(); _tellerLeeg();
    try {
      await bv.aanzetten('auth-poort', { id: eig, email: 'eigenaar' }, 'proef slot s');
      const st: number[] = [];
      for (let i = 0; i < 6; i++) st.push((await roep((await sessie(lid)).cookie, 'POST', '/api/owner/session/refresh')).statusCode);
      const sA = som(Date.now() - 60_000, Date.now() + 1000);
      check('A: eigen geldige sessie verversen met auth-poort AAN → 200 (niet 401 van het vangnet), poort401 = 0', st.every((x) => x === 200) && sA.poort401 === 0, `${st.join(',')} poort401=${sA.poort401}`);
      const uit = await bv.zekeringControleren();
      check('A: de zekering zet auth-poort NIET uit na zes verversingen door een gewoon lid', uit.length === 0 && poortAfdwingen() === true, JSON.stringify(uit));
      const onecht = await roep(`${randomUUID()}.${randomBytes(32).toString('base64url')}`, 'POST', '/api/owner/session/refresh');
      check('A: een onbekende sessie blijft 401 OWNER_SESSION_INVALID', onecht.statusCode === 401 && code(onecht) === 'OWNER_SESSION_INVALID', `${onecht.statusCode} ${code(onecht)}`);
    } finally {
      await sys.query(`UPDATE app.beveiliging_schakelaars SET stand='uit', bewaking_tot=NULL, basis='{}'::jsonb`).catch(() => undefined);
      _schakelaarsReset(); bv._bewakingReset(); _tellerLeeg();
    }

    // ------------------------------------------------------------------ B. kijker
    const kl = await import('../../backend/kijker-alleen-lezen');
    const LEZEN = ['diagnose/server', 'owner/merk-beeld', 'owner/mail/ruimte', 'owner/mail/afzenders/controle', 'owner/mail/afzenders/nu', 'owner/mail/sender-avatar/data',
      'owner/ai-bord', 'owner/ai-toegang/beheer', 'owner/ai-site-schakelaars', 'owner/mcp-connector/duren', 'owner/github/spiegel', 'owner/agenda/lokaal', 'terminal/opdrachten',
      'owner/agents/activity', 'owner/agents/:id/commands', 'owner/apps/geheimen', 'owner/apps/geheimen/:id', 'owner/api-platform/connections', 'owner/api-platform/tokens',
      'owner/api-platform/vault', 'owner/google-contour', 'owner/google-contour/keys', 'owner/cloud/integrations/v1/transfer/plan', 'owner/cloud/providers/status/verify'].map((p) => `POST /api/${p}`);
    const nietLezen = LEZEN.filter((k) => kl.kijkerRouteSoort(k) !== 'lezen');
    check(`B: ${LEZEN.length} routes die alleen lezen zijn voor de kijker «lezen» (eind-regressie midden-1)`, nietLezen.length === 0, nietLezen.join(' | '));
    const patronen = new Set(handler.patronen);
    const onbekend = [...LEZEN, ...kl.KIJKER_INTREKKEN, ...Object.keys(kl.KIJKER_ALS_LIJF)].filter((k) => !patronen.has(k));
    check('B: elke ingedeelde route bestaat echt in de routetabel (geen tikfout, geen dode regel)', onbekend.length === 0, onbekend.join(' | '));
    check('B: lezen-én-schrijven blijft dicht: owner/ai/settings, connector-v2/instellingen MET extraBevestigen, mail-loskoppelen MET wissen',
      !kl.kijkerMagVerzoek('POST /api/owner/ai/settings', { capabilities: {} })
      && !kl.kijkerMagVerzoek('POST /api/owner/connector-v2/instellingen', { extraBevestigen: false })
      && kl.kijkerMagVerzoek('POST /api/owner/connector-v2/instellingen', {})
      && !kl.kijkerMagVerzoek('POST /api/owner/mail/accounts/:id/disconnect', { retainLocalData: false, confirmation: 'DELETE_MAIL_ACCOUNT_DATA' })
      && kl.kijkerMagVerzoek('POST /api/owner/mail/accounts/:id/disconnect', {}));
    check('B: nieuwe toegang maken blijft dicht (tokens, PAT, agent koppelen, gastcode, deelkoppeling)',
      ['POST /api/mcp/tokens', 'POST /api/owner/api-platform/tokens/create', 'POST /api/owner/agents/pairing-code', 'POST /api/owner/access/toegangscodes/maken', 'POST /api/owner/cloud/vnext/delen/nieuw', 'POST /api/share/link']
        .every((k) => kl.kijkerRouteSoort(k) === 'geweigerd'));

    const kijker = await mens('viewer');
    const kc = (await sessie(kijker)).cookie;
    const DISP: Array<[string, string]> = [['/api/diagnose/server', 'hub'], ['/api/owner/merk-beeld', 'mail'], ['/api/owner/ai-bord', 'mcp'], ['/api/owner/ai-toegang/beheer', 'mcp'],
      ['/api/owner/github/spiegel', 'github'], ['/api/terminal/opdrachten', 'hub'], ['/api/owner/mail/ruimte', 'mail'], ['/api/owner/agenda/lokaal', 'hub']];
    const dichtL: string[] = [];
    for (const [pad, host] of DISP) { const r = await roep(kc, 'POST', pad, {}, host); if (code(r) === 'RBAC_FORBIDDEN') dichtL.push(`${pad} ${r.statusCode}`); }
    check('B: via de echte dispatcher komt de kijker op deze leesroutes langs de kijkerwacht (geen RBAC_FORBIDDEN)', dichtL.length === 0, dichtL.join(' | '));
    const INTREK: Array<[string, string, Record<string, unknown>]> = [
      ['/api/owner/mail/google-suite/account/disconnect', 'mail', {}],
      [`/api/owner/agents/${randomUUID()}/revoke`, 'mcp', {}], [`/api/owner/mcp-connector/grants/${randomUUID()}/revoke`, 'mcp', {}], ['/api/owner/connector-v2/intrekken', 'mcp', { agent: 'claude' }],
      [`/api/owner/api-platform/tokens/${randomUUID()}/revoke`, 'hub', {}], ['/api/mcp/tokens/revoke', 'mcp', { id: randomUUID() }], ['/api/owner/ai/grants/revoke', 'mcp', { all: true }],
      ['/api/owner/agents/ontgrendeling/intrekken', 'mcp', {}], ['/api/owner/agent-namens/intrekken', 'mcp', { id: randomUUID() }],
      ['/api/owner/access/toegangscodes/intrekken', 'id', { id: randomUUID() }], ['/api/owner/access/gast-sessies/intrekken', 'id', { id: randomUUID() }],
      ['/api/owner/mail/imap/ontkoppelen', 'mail', { id: 'x' }], ['/api/owner/cloud/providers/google/disconnect', 'cloud', {}], ['/api/share/link/revoke', 'hub', {}],
      ['/api/owner/cloud/vnext/delen/intrekken', 'cloud', { id: randomUUID() }],
    ];
    const dichtI: string[] = [];
    for (const [pad, host, b] of INTREK) { const r = await roep(kc, 'POST', pad, b, host); if (code(r) === 'RBAC_FORBIDDEN') dichtI.push(`${pad} ${r.statusCode}`); }
    check(`B: ${INTREK.length} routes om EIGEN toegang in te trekken of los te koppelen zijn open voor de kijker (eind-omzeiling 2)`, dichtI.length === 0, dichtI.join(' | '));
    meldingen.length = 0; kl._kijkerMeldingLeeg();
    const maak = await roep(kc, 'POST', '/api/mcp/tokens', { name: 'proef' }, 'mcp');
    await roep(kc, 'POST', '/api/notities/nieuw', { titel: 'x' }, 'hub');
    check('B: nieuwe toegang maken als kijker → 403 RBAC_FORBIDDEN', maak.statusCode === 403 && code(maak) === 'RBAC_FORBIDDEN', `${maak.statusCode} ${code(maak)}`);
    const tm = meldingen.filter((m) => m.userId === kijker && m.kind === 'toegang_alleen_lezen');
    check('B: weigering buiten de hmara → melding toegang_alleen_lezen, hoogstens één per uur (twee weigeringen = één melding)', tm.length === 1 && /лише перегляд/.test(tm[0].title) && /alleen-lezen/.test(tm[0].title), JSON.stringify(meldingen.map((m) => m.kind)));

    // ------------------------------------------------------------------ C. body-aanmelding
    const ba = await import('../../server/platform/body-aanmelding');
    const kop = (c: string) => ({ cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(c)}` });
    const levend = await sessie(lid);
    const ingetrokken = await sessie(lid, { revokedAt: Date.now() - 1000 });
    const verlopen = await sessie(lid, { absoluteExpiresAt: Date.now() - 1000 });
    ba._aanmeldingCacheLeeg();
    check('C: levende sessie → ruimere grenzen; ingetrokken of verlopen sessie → anonieme grenzen (eind-omzeiling 4)',
      (await ba.aanmeldingEcht(kop(levend.cookie))) === true && (await ba.aanmeldingEcht(kop(ingetrokken.cookie))) === false && (await ba.aanmeldingEcht(kop(verlopen.cookie))) === false);
    ba._aanmeldingCacheLeeg();
    const nep = Array.from({ length: 10 }, (_, i) => `__Secure-tsv_ecosystem_n${i}=${randomUUID()}.${randomBytes(32).toString('base64url')}`);
    const veel = { cookie: [...nep, `${ECOSYSTEM_COOKIE}=${encodeURIComponent(levend.cookie)}`].join('; ') };
    check('C: hoogstens 4 sessiecookies per verzoek opgezocht (een echte na 10 valse telt niet meer — geen 60 opzoekingen)', (await ba.aanmeldingEcht(veel)) === false);

    // ------------------------------------------------------------------ D. NUL en koppeling-id
    const r = router({
      'POST /api/proef/:id': [async (ctx) => ({ statusCode: 200, headers: {}, body: JSON.stringify({ body: ctx.body, id: ctx.params.id }) })],
      'POST /api/github/webhook/:sleutel': [async (ctx) => ({ statusCode: 200, headers: {}, body: JSON.stringify({ heeft: JSON.stringify(ctx.body).includes('\\u0000') }) })],
    });
    const ev = (pad: string, lijf: unknown) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(lijf), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.5', userAgent: 'proef' } } } as never);
    const d1 = await r(ev('/api/proef/a', { tekst: `a${NULT}b`, lijst: [`x${NULT}`], diep: { t: `${NULT}z` } }));
    const j1 = JSON.parse(d1.body || '{}');
    check('D: NUL in een WAARDE wordt weggehaald (geen 500, geen weigering van een legitieme tekst)', d1.statusCode === 200 && j1.body.tekst === 'ab' && j1.body.lijst[0] === 'x' && j1.body.diep.t === 'z', d1.body);
    const d2 = await r(ev('/api/proef/a', { [`k${NULT}`]: 1 }));
    const d3 = await r(ev(`/api/proef/${encodeURIComponent(`a${NULT}b`)}`, {}));
    check('D: NUL in een SLEUTEL of padparameter → 400 INVOER_NUL', d2.statusCode === 400 && code(d2) === 'INVOER_NUL' && d3.statusCode === 400 && code(d3) === 'INVOER_NUL', `${d2.statusCode}/${d3.statusCode}`);
    const d4 = await r(ev('/api/github/webhook/s', { t: `a${NULT}` }));
    check('D: ondertekende webhooks krijgen hun lijf ongewijzigd (handtekening blijft kloppen)', d4.statusCode === 200 && JSON.parse(d4.body).heeft === true);
    const bdBron = readFileSync('backend/bestanden-delen.ts', 'utf8');
    check('D: id van een deelkoppeling wordt vóór de SQL als uuid gecontroleerd (KOPPELING_ONBEKEND, geen 500)',
      (bdBron.match(/koppelingIdOfNull\(d\.id\) \|\| fout\('KOPPELING_ONBEKEND'\)/g) || []).length === 3 && /EIGENAAR_404 = new Set\(\[[^\]]*'KOPPELING_ONBEKEND'/.test(bdBron));

    // ------------------------------------------------------------------ E. JSON_VEREIST, CONSENT_ANDERE_BROWSER, JOURNAAL_NIET_BESCHIKBAAR
    const jw = await import('../../backend/json-weigering');
    const bm = await import('../../backend/beveiliging-meldingen');
    jw._jsonWeigeringLeeg(); bm._beperktLeeg(); meldingen.length = 0;
    const jsonSes = await sessie(lid);
    const w = { patroon: 'POST /api/proef/formulier', headers: { cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(jsonSes.cookie)}`, 'content-type': 'application/x-www-form-urlencoded', origin: 'https://kwaad.example' }, ip: '203.0.113.9' };
    const e1 = await jw.jsonWeigeringVastleggen(w);
    const e2 = await jw.jsonWeigeringVastleggen(w);
    const aRij = (await sys.query(`SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'beveiliging.json-vereist'`, [lid])).rows[0]?.n;
    check('E: 415 JSON_VEREIST → één journaalregel (type beveiliging) en één melding aan het account; herhaling binnen het venster niet',
      e1.audit && e1.melding && e1.account === lid && !e2.audit && !e2.melding && aRij === 1 && meldingen.filter((m) => m.kind === 'security' && m.userId === lid).length === 1, JSON.stringify({ e1, e2, aRij }));
    const via = await roep(jsonSes.cookie, 'POST', '/api/notities/nieuw', {}, 'hub', 'titel=x');
    check('E: de router geeft 415 JSON_VEREIST voor een formulier met cookie (ongewijzigd)', via.statusCode === 415 && code(via) === 'JSON_VEREIST');
    bm._beperktLeeg(); meldingen.length = 0;
    const c1 = await bm.meldBeveiligingsWijzigingBeperkt(lid, 'consent-andere-browser');
    const c2 = await bm.meldBeveiligingsWijzigingBeperkt(lid, 'consent-andere-browser');
    const routesBron = readFileSync('backend/mcp-connector-routes.ts', 'utf8');
    check('E: CONSENT_ANDERE_BROWSER → melding (één per uur) bij openen, besluit en deur; openen schrijft nu ook een journaalregel',
      c1 && !c2 && meldingen.length === 1 && /andere browser/.test(meldingen[0].title)
      && (routesBron.match(/meldBeveiligingsWijzigingBeperkt\(auth\.user\.id, 'consent-andere-browser'\)/g) || []).length === 4
      && /reden: 'andere-browser', stap: 'openen'/.test(routesBron));
    check('E: JOURNAAL_NIET_BESCHIKBAAR met eigen code en Retry-After (de dienst draait — geen kale «proxy 503»)',
      /error\("JOURNAAL_NIET_BESCHIKBAAR", 503, \{ retryAfter: 60 \}\)/.test(readFileSync('backend/mcp-console.ts', 'utf8')));

    // ------------------------------------------------------------------ F. nieuw apparaat na de update
    const na = await import('../../backend/nieuw-apparaat');
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
    const { apparaat } = await import('../../server/platform/audit');
    const label = apparaat(ua) || '';
    const fu = await mens('member');
    await sys.query('INSERT INTO app.bekende_apparaten (user_id, sleutel, apparaat, bevestigd_op) VALUES ($1, $2, $3, now())', [fu, na.apparaatSleutel(fu, label), label]);
    meldingen.length = 0;
    const f1 = await na.naAanmelding({ userId: fu, email: 'f@test.invalid', ua, methode: 'google', apparaatCookie: sha(`c1-${sfx}`) }, { vlagAan: async () => true });
    const oudWeg = (await sys.query('SELECT count(*)::int AS n FROM app.bekende_apparaten WHERE user_id = $1 AND sleutel = $2', [fu, na.apparaatSleutel(fu, label)])).rows[0]?.n === 0;
    const m1 = meldingen.filter((m) => m.userId === fu);
    check('F: browser die het systeem vóór de update kende (oude labelrij) → neutrale melding «перший вхід після оновлення безпеки», geen «новий пристрій»',
      f1 === 'overgang' && m1.length === 1 && m1[0].kind === na.OVERGANG_SOORT && /після оновлення безпеки/.test(m1[0].title) && !/Новий вхід на новому пристрої/.test(m1[0].title), `${f1} ${JSON.stringify(m1.map((m) => m.title))}`);
    const f2 = await na.naAanmelding({ userId: fu, email: 'f@test.invalid', ua, methode: 'google', apparaatCookie: sha(`c2-${sfx}`) }, { vlagAan: async () => true });
    check('F: de oude rij is verbruikt — een TWEEDE browser met hetzelfde label krijgt wél de gewone waarschuwing (bescherming niet losser)',
      oudWeg && f2 === 'gemeld' && meldingen.filter((m) => m.userId === fu && /Новий вхід на новому пристрої/.test(m.title)).length === 1, String(f2));
    const tg = await import('../../backend/telegram-aanmelden/inloggen');
    const e = await tg.eisenVoorAanmelden(fu, sha(`c9-${sfx}`));
    check('F: Telegram blijft voor een browser zonder bekende cookie «nieuw apparaat» (geen herkenning op het label terug)', e.nieuwApparaat === true && e.passkey === false);
    const id = randomBytes(9).toString('base64url').slice(0, 12), geheim = randomBytes(32).toString('base64url');
    await sys.query(`INSERT INTO app.tg_inlog_verzoeken (id, geheim_hash, transactie_id, apparaat, user_id, stand, reden, verloopt_op) VALUES ($1,$2,'tx',$3,$4,'geweigerd','passkey-nodig', now() + interval '3 minutes')`, [id, sha(geheim), label, fu]);
    const st = await tg.inlogStatus(id, geheim);
    check('F: zonder toegangssleutel zegt de status van de Telegram-aanmelding de andere weg (Google in deze browser), uk + nl',
      st.reden === 'passkey-nodig' && st.advies === tg.ANDERE_WEG_CODE && /Google/.test(st.uitleg?.uk || '') && /Google/.test(st.uitleg?.nl || ''), JSON.stringify(st));
    await sys.query('DELETE FROM app.tg_inlog_verzoeken WHERE id = $1', [id]).catch(() => undefined);
    await sys.query('DELETE FROM app.bekende_apparaten WHERE user_id = $1', [fu]).catch(() => undefined);
  } finally {
    await sys.query(`DELETE FROM app.records WHERE id = ANY($1::text[]) OR (tbl = 'owner_service_sessions_v1' AND data->>'userId' = ANY($1::text[]))`, [mensen]).catch(() => undefined);
  }

  // ------------------------------------------------------------------ G. kleine punten
  if (existsSync('deploy/agent/agent.mjs')) {
    const p = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { mkdtempSync, writeFileSync } from 'node:fs'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
      const { handlers } = await import(${JSON.stringify(`${process.cwd()}/deploy/agent/agent.mjs`)});
      const w = mkdtempSync(join(tmpdir(), 'ag-')); writeFileSync(join(w, 'meta.js'), ''); writeFileSync(join(w, '.env'), 'X=1');
      const uit = []; for (const a of [['meta.js', '--in=.env'], ['--ev=1']]) { try { await handlers.exec({ roots: [w], allow: ['node'] }, { command: 'node', args: a }); uit.push('geen'); } catch (e) { uit.push(e.message); } }
      console.log(JSON.stringify(uit)); process.exit(0);`], { encoding: 'utf8', timeout: 60_000 });
    let u: string[] = []; try { u = JSON.parse((p.stdout || '').trim().split('\n').pop() || '[]'); } catch { /* */ }
    check('G: agent — `node meta.js --in=.env` → padcontrole (protected secret), `node --ev=1` blijft «runs code from text»',
      /protected secret/.test(u[0] || '') && /runs code from text/.test(u[1] || ''), JSON.stringify(u));
  }
  check('G: github-platform.ts heeft geen console meer (hier komt de token langs); mislukte opruiming staat als code in het journaal',
    !/console\.(log|info|warn|error|debug)/.test(readFileSync('backend/github-platform.ts', 'utf8')) && /webhooksFout: 'WEBHOOKS_OPRUIMEN_MISLUKT'/.test(readFileSync('backend/github-platform.ts', 'utf8')));
  check('G: dode tweede binding backend/mcp-toestemming-binding.ts is weg (één implementatie: mcp-oauth-binding.ts)', !existsSync('backend/mcp-toestemming-binding.ts'));
  return einde();
}
