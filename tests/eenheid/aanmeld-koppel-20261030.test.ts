// AANMELD vNEXT — KOPPEL (30.10.2026, vlag aanmeldmethoden-vnext, backend/aanmeld-koppel.ts, contract
// shared/aanmeld-vnext-model.ts). Tegen de ECHTE Postgres; de aanbieders zijn nagebootst (hulp/nep-aanbieder.ts) en de
// backend wijst ernaar via AANMELD_<ID>_BASIS — de volledige stroom loopt dus echt: start-URL met eenmalige state en
// PKCE S256 → code-inwisseling op de server → id_token-handtekening via de JWKS van de nep → koppeling aan het
// INGELOGDE account. Er gaat niets naar buiten.
//
// WAT DEZE TEST VASTHOUDT:
//   1. DE POORT. Geen sessie → 401; verkeerde dienst → 403; niet-goedgekeurd account → 403; identity én hub mogen.
//   2. WAARHEID. Zonder omgevingssleutels: aanwezig=false, zelftest 'niet-uitgevoerd', klaarVoorKoppeling=false,
//      gekoppeld=null; WhatsApp 'niet-mogelijk' en SMS 'gepland' krijgen nooit een koppelwaarheid of contour.
//   3. ZELFTEST. Ontbrekende sleutels eerlijk benoemd; vormcontroles per aanbieder; één bewaarde rij per aanbieder
//      (upsert); klaarVoorKoppeling pas na sleutels ÉN zelftest 'ok'; nooit een geheimwaarde in details of rij; audit.
//   4. START. Poorten in volgorde (sleutels → zelftest → rate-limit); de authorize-URL draagt eenmalige state, PKCE
//      S256 en redirect_uri; Microsoft met openid-scope en nonce; Discord met identify email; Apple ZONDER scope en met
//      response_mode=query; Telegram geeft het widget (botnaam + authUrl met state).
//   5. TERUG. Volledige happy-path per contour (id_token echt geverifieerd; Discord via /users/@me; Telegram via
//      HMAC-SHA256); state eenmalig en met TTL; vervalste state/handtekening/nonce, verlopen state/auth_date en
//      PKCE-weigering stranden met de juiste code in een eerlijke redirect ZONDER geheimen; duplicaat subject →
//      KOPPELING_BESTAAT (ook over accounts heen); labels gemaskeerd opgeslagen.
//   6. ONTKOPPEL en ISOLATIE. Eigen koppeling weg + audit; andermans koppeling onzichtbaar.
import { createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { db } from '../../server/platform';
import { getPool } from '../../server/platform/pg';
import { aanmeldKoppelRoutes, appleClientSecret, maskLabel } from '../../backend/aanmeld-koppel';
import { checker } from './hulp/nep-google';
import { nepAanbieder } from './hulp/nep-aanbieder';

type Routes = ReturnType<typeof aanmeldKoppelRoutes>;
type Antw = { status: number; uit: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
const STATES = 'aanmeld_states_v1';
const KOPPELINGEN = 'aanmeld_koppelingen_v1';
const ZELFTESTS = 'aanmeld_zelftest_v1';
const TERUG_BASIS = 'https://id.eenheid.test';
const ENV_SLEUTELS = [
  'AANMELD_TERUG_BASIS', 'AANMELD_MICROSOFT_BASIS', 'AANMELD_DISCORD_BASIS', 'AANMELD_APPLE_BASIS', 'AANMELD_TELEGRAM_BASIS',
  'AANMELD_MICROSOFT_CLIENT_ID', 'AANMELD_MICROSOFT_CLIENT_SECRET', 'AANMELD_DISCORD_CLIENT_ID', 'AANMELD_DISCORD_CLIENT_SECRET',
  'AANMELD_TELEGRAM_BOT_TOKEN', 'AANMELD_TELEGRAM_BOT_NAAM', 'AANMELD_APPLE_CLIENT_ID', 'AANMELD_APPLE_TEAM_ID', 'AANMELD_APPLE_KEY_ID', 'AANMELD_APPLE_PRIVATE_KEY',
];
const sha256hex = (v: string): string => createHash('sha256').update(v).digest('hex');
const s256 = (v: string): string => createHash('sha256').update(v).digest('base64url');

export async function main(): Promise<number> {
  const { check, einde } = checker('aanmeld-koppel-20261030');
  const pool = getPool('systeem');
  const sfx = randomBytes(4).toString('hex');
  const oudEnv = Object.fromEntries(ENV_SLEUTELS.map((k) => [k, process.env[k]]));
  for (const k of ENV_SLEUTELS) delete process.env[k];
  process.env.AANMELD_TERUG_BASIS = TERUG_BASIS;
  // Zelftest-rijen zijn per aanbieder (globaal): schoon beginnen, anders kleurt een vorige run de waarheid.
  await pool.query(`DELETE FROM app.records WHERE tbl = $1`, [ZELFTESTS]);

  const mk = async (email: string) => { const id = randomUUID(); await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role: 'member', status: 'approved' }]); return id; };
  const a = await mk(`amk-a-${sfx}@eenheid.test`);
  const b = await mk(`amk-b-${sfx}@eenheid.test`);
  const c = await mk(`amk-c-${sfx}@eenheid.test`);
  const maak = (id: string, service = 'identity') => aanmeldKoppelRoutes(async () => ({ user: { id, role: 'member', status: 'approved' }, service }));
  const rA = maak(a);
  const rB = maak(b);

  type RuwAntwoord = { statusCode: number; headers?: Record<string, string>; body: string };
  const roep = async (routes: Routes, pad: string, body: Record<string, unknown> = {}): Promise<Antw> => {
    const res = await (routes[`POST /api/owner/aanmeld/vnext/${pad}`][0] as unknown as (x: unknown) => Promise<RuwAntwoord>)({ event: {}, body, params: {}, query: {} });
    return { status: res.statusCode, uit: JSON.parse(res.body || '{}') };
  };
  const locaties: string[] = [];
  const terug = async (routes: Routes, aanbieder: string, query: Record<string, string>): Promise<{ status: number; naar: string }> => {
    const res = await (routes['GET /api/aanmeld/koppel/:aanbieder/terug'][0] as unknown as (x: unknown) => Promise<RuwAntwoord>)({ event: {}, body: '', params: { aanbieder }, query });
    const naar = String(res.headers?.Location || '');
    locaties.push(naar);
    return { status: res.statusCode, naar };
  };
  const fout = (naar: string, code: string, id: string): boolean => naar === `${TERUG_BASIS}/aanmeldmethoden?koppel=${id}-fout&reden=${code}`;
  const statusVan = async (routes: Routes, id: string) => (await roep(routes, 'aanbieders')).uit.aanbieders.find((x: any) => x.id === id); // eslint-disable-line @typescript-eslint/no-explicit-any
  const stateRij = async (state: string) => (await db.list<Record<string, any>>(STATES, { filter: { stateHash: sha256hex(state) }, limit: 2 })).items[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
  const koppelingen = async (owner: string, aanbieder: string) => (await db.list<Record<string, any>>(KOPPELINGEN, { filter: { ownerUserId: owner, aanbieder }, limit: 50 })).items; // eslint-disable-line @typescript-eslint/no-explicit-any
  const auditRijen = async (owner: string) => (await pool.query(`SELECT action, result FROM app.audit WHERE owner_id = $1 AND action LIKE 'aanmeld.%'`, [owner])).rows as Array<{ action: string; result: string }>;
  const telegramVector = (botToken: string, velden: Record<string, string>): Record<string, string> => {
    const regel = ['auth_date', 'first_name', 'id', 'last_name', 'photo_url', 'username'].filter((k) => velden[k] !== undefined && velden[k] !== '').map((k) => `${k}=${velden[k]}`).join('\n');
    return { ...velden, hash: createHmac('sha256', createHash('sha256').update(botToken).digest()).update(regel).digest('hex') };
  };

  const msId = `ms-client-${sfx}`;
  const msGeheim = `ms-geheim-${sfx}-lang-genoeg`;
  const dcId = `dc-client-${sfx}`;
  const dcGeheim = `dc-geheim-${sfx}-lang-genoeg`;
  const botToken = `123456:AEENHEID${sfx}aaaaaaaaaaaaaaaaaaaaaaaa`;
  const appleKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const appleP8 = appleKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const applePub = appleKeys.publicKey.export({ type: 'spki', format: 'pem' }) as string;
  const nep = await nepAanbieder({
    microsoft: { clientId: msId, clientSecret: msGeheim },
    discord: { clientId: dcId, clientSecret: dcGeheim },
    apple: { clientId: 'com.eenheid.app', publiekeSleutelPem: applePub },
  });

  try {
    // ================================================================ 1. de poort
    const geen = aanmeldKoppelRoutes(async () => ({ errorCode: 'OWNER_SESSION_REQUIRED' }));
    check('zonder sessie: 401 met de sessie-foutcode', await roep(geen, 'aanbieders').then((r) => r.status === 401 && r.uit.error === 'OWNER_SESSION_REQUIRED'));
    check('verkeerde dienst (cloud) → OWNER_CLOUD_SESSION_REQUIRED (403)', await roep(maak(a, 'cloud'), 'aanbieders').then((r) => r.status === 403 && r.uit.error === 'OWNER_CLOUD_SESSION_REQUIRED'));
    const wacht = aanmeldKoppelRoutes(async () => ({ user: { id: a, role: 'member', status: 'pending' }, service: 'identity' }));
    check('niet-goedgekeurd account → ACCOUNT_NOT_APPROVED (403)', await roep(wacht, 'aanbieders').then((r) => r.status === 403 && r.uit.error === 'ACCOUNT_NOT_APPROVED'));
    check('identity én hub mogen: zes aanbieders uit de catalogus', await roep(rA, 'aanbieders').then((r) => r.status === 200 && r.uit.aanbieders.length === 6)
      && await roep(maak(a, 'hub'), 'aanbieders').then((r) => r.status === 200));

    // ================================================================ 2. waarheid zonder omgevingssleutels
    const ms0 = await statusVan(rA, 'microsoft');
    check('zonder env: sleutels met naam en aanwezig=false, zelftest niet-uitgevoerd, klaar=false, gekoppeld=null',
      ms0.sleutels.length === 2 && ms0.sleutels.every((s: { naam: string; aanwezig: boolean }) => s.naam.startsWith('AANMELD_MICROSOFT_') && !s.aanwezig)
      && ms0.zelftest === 'niet-uitgevoerd' && ms0.klaarVoorKoppeling === false && ms0.gekoppeld === null);
    const wa0 = await statusVan(rA, 'whatsapp');
    const sms0 = await statusVan(rA, 'sms');
    check('WhatsApp blijft eerlijk niet-mogelijk en SMS gepland — nooit klaarVoorKoppeling', wa0.stand === 'niet-mogelijk' && sms0.stand === 'gepland' && !wa0.klaarVoorKoppeling && !sms0.klaarVoorKoppeling && wa0.sleutels.length === 0);
    check('het antwoord noemt het callback-pad', (await roep(rA, 'aanbieders')).uit.koppelPad === '/api/aanmeld/koppel/:aanbieder/terug');

    // ================================================================ 3. zelftest
    check('zelftest onbekende aanbieder → AANBIEDER_ONBEKEND (404)', await roep(rA, 'zelftest', { id: 'verzonnen' }).then((r) => r.status === 404 && r.uit.error === 'AANBIEDER_ONBEKEND'));
    check('zelftest whatsapp (geen contour) → AANBIEDER_ONBEKEND', (await roep(rA, 'zelftest', { id: 'whatsapp' })).uit.error === 'AANBIEDER_ONBEKEND');
    const zMs0 = await roep(rA, 'zelftest', { id: 'microsoft' });
    check('zelftest zonder sleutels → fout en noemt BEIDE ontbrekende sleutelnamen', zMs0.uit.zelftest === 'fout'
      && zMs0.uit.details.join(' ').includes('AANMELD_MICROSOFT_CLIENT_ID') && zMs0.uit.details.join(' ').includes('AANMELD_MICROSOFT_CLIENT_SECRET'));
    check('de fout-zelftest is bewaard en zichtbaar in de status', (await statusVan(rA, 'microsoft')).zelftest === 'fout');
    process.env.AANMELD_TELEGRAM_BOT_TOKEN = 'geen-echte-tokenvorm';
    process.env.AANMELD_TELEGRAM_BOT_NAAM = 'eenheid_bot';
    const zTgKapot = await roep(rA, 'zelftest', { id: 'telegram' });
    check('telegram met misvormde bottoken → fout; detail noemt de sleutelNAAM, nooit de waarde', zTgKapot.uit.zelftest === 'fout'
      && zTgKapot.uit.details.join(' ').includes('AANMELD_TELEGRAM_BOT_TOKEN') && !JSON.stringify(zTgKapot.uit).includes('geen-echte-tokenvorm'));
    process.env.AANMELD_TELEGRAM_BOT_TOKEN = botToken;
    check('telegram met geldige vorm → zelftest ok', (await roep(rA, 'zelftest', { id: 'telegram' })).uit.zelftest === 'ok');
    const tg1 = await statusVan(rA, 'telegram');
    check('e2e-recept: sleutels gezet + zelftest ok ⇒ klaarVoorKoppeling true, met zelftestOp', tg1.klaarVoorKoppeling === true && tg1.zelftest === 'ok' && typeof tg1.zelftestOp === 'string');
    await roep(rA, 'zelftest', { id: 'telegram' });
    const zRijen = (await db.list<Record<string, unknown>>(ZELFTESTS, { filter: { aanbieder: 'telegram' }, limit: 10 })).items;
    check('zelftest-upsert: na herhalen precies één rij per aanbieder, met doorUserId', zRijen.length === 1 && zRijen[0].doorUserId === a);
    check('de bewaarde zelftest-rij bevat de tokenwaarde niet', !JSON.stringify(zRijen).includes(botToken));
    check('audit-regel voor de zelftest geschreven', (await auditRijen(a)).some((x) => x.action === 'aanmeld.zelftest'));

    // ================================================================ 4. start: poorten en de authorize-URL
    check('start onbekend/sms → AANBIEDER_ONBEKEND (404)', (await roep(rA, 'start', { id: 'verzonnen' })).status === 404 && (await roep(rA, 'start', { id: 'sms' })).uit.error === 'AANBIEDER_ONBEKEND');
    check('start zonder sleutels → SLEUTELS_ONTBREKEN', (await roep(rA, 'start', { id: 'microsoft' })).uit.error === 'SLEUTELS_ONTBREKEN');
    process.env.AANMELD_MICROSOFT_CLIENT_ID = msId;
    process.env.AANMELD_MICROSOFT_CLIENT_SECRET = msGeheim;
    check('start met sleutels maar zonder zelftest-ok → ZELFTEST_VEREIST', (await roep(rA, 'start', { id: 'microsoft' })).uit.error === 'ZELFTEST_VEREIST');
    const sTg = await roep(rA, 'start', { id: 'telegram' });
    check('telegram-start geeft het widget: botnaam + authUrl naar het eigen callback-pad met state', sTg.uit.widget?.bot === 'eenheid_bot'
      && String(sTg.uit.widget?.authUrl).startsWith(`${TERUG_BASIS}/api/aanmeld/koppel/telegram/terug?state=`));

    // ================================================================ 5. microsoft: volledige happy-path tegen de nep
    process.env.AANMELD_MICROSOFT_BASIS = nep.url;
    const zMs = await roep(rA, 'zelftest', { id: 'microsoft' });
    check('microsoft-zelftest ok, mét netwerkping naar de JWKS van de (nep-)uitgever', zMs.uit.zelftest === 'ok' && zMs.uit.details.join(' ').includes('досяжний'));
    const s1 = await roep(rA, 'start', { id: 'microsoft' });
    const u1 = new URL(String(s1.uit.url));
    const q1 = u1.searchParams;
    check('authorize-URL: naar de aanbieder, met code-flow, state, PKCE S256, redirect_uri, openid-scope, nonce en response_mode=query',
      `${u1.origin}${u1.pathname}` === `${nep.url}/common/oauth2/v2.0/authorize` && q1.get('response_type') === 'code'
      && !!q1.get('state') && q1.get('code_challenge_method') === 'S256' && !!q1.get('code_challenge')
      && q1.get('redirect_uri') === `${TERUG_BASIS}/api/aanmeld/koppel/microsoft/terug`
      && q1.get('scope') === 'openid profile email' && !!q1.get('nonce') && q1.get('response_mode') === 'query');
    const rij1 = await stateRij(q1.get('state')!);
    check('state wordt gehasht bewaard, ongebruikt, en de challenge is S256 van de bewaarde verifier',
      !!rij1 && rij1.gebruiktOp === 0 && rij1.ownerUserId === a && s256(String(rij1.verifier)) === q1.get('code_challenge'));
    const subMs = `sub-ms-${sfx}`;
    const code1 = nep.codeVoor({ aanbieder: 'microsoft', sub: subMs, nonce: q1.get('nonce')!, challenge: q1.get('code_challenge')!, email: `ms-pavlo-${sfx}@voorbeeld.nl` });
    const t1 = await terug(rA, 'microsoft', { state: q1.get('state')!, code: code1 });
    check('geldige terug → 302 naar …?koppel=microsoft-ok zonder geheimen in de URL', t1.status === 302 && t1.naar === `${TERUG_BASIS}/aanmeldmethoden?koppel=microsoft-ok`);
    const kMs = (await koppelingen(a, 'microsoft'))[0];
    check('koppeling bewaard: subject = tenant:sub en het label is GEMASKEERD (nooit het volledige adres)',
      !!kMs && kMs.subject === `tenant-eenheid:${subMs}` && kMs.label === 'ms…@voorbeeld.nl' && !String(kMs.label).includes(`ms-pavlo-${sfx}`) && typeof kMs.op === 'string');
    const wissel1 = nep.aanroepen.find((x) => x.pad === '/common/oauth2/v2.0/token');
    check('inwisseling gebeurde server-side: client-id/-geheim en redirect_uri mee, en de verifier matcht de challenge',
      !!wissel1 && wissel1.velden.client_id === msId && wissel1.velden.client_secret === msGeheim
      && wissel1.velden.redirect_uri === `${TERUG_BASIS}/api/aanmeld/koppel/microsoft/terug` && s256(String(wissel1.velden.code_verifier)) === q1.get('code_challenge'));
    check('status toont nu gekoppeld {label, op} en audit kreeg aanmeld.koppeling ok',
      await statusVan(rA, 'microsoft').then((x) => x.gekoppeld?.label === 'ms…@voorbeeld.nl' && typeof x.gekoppeld?.op === 'string')
      && (await auditRijen(a)).some((x) => x.action === 'aanmeld.koppeling' && x.result === 'ok'));
    const code1b = nep.codeVoor({ aanbieder: 'microsoft', sub: `ander-${sfx}`, nonce: q1.get('nonce')!, challenge: q1.get('code_challenge')! });
    check('state is EENMALIG: dezelfde state nog eens → STATE_ONGELDIG', fout((await terug(rA, 'microsoft', { state: q1.get('state')!, code: code1b })).naar, 'STATE_ONGELDIG', 'microsoft'));
    const s2 = await roep(rA, 'start', { id: 'microsoft' });
    const q2 = new URL(String(s2.uit.url)).searchParams;
    const code2 = nep.codeVoor({ aanbieder: 'microsoft', sub: subMs, nonce: q2.get('nonce')!, challenge: q2.get('code_challenge')! });
    check('zelfde subject nogmaals koppelen → KOPPELING_BESTAAT', fout((await terug(rA, 'microsoft', { state: q2.get('state')!, code: code2 })).naar, 'KOPPELING_BESTAAT', 'microsoft'));
    check('en de weigering staat in de audit', (await auditRijen(a)).some((x) => x.action === 'aanmeld.koppeling' && x.result === 'denied'));
    check('vervalste state → STATE_ONGELDIG', fout((await terug(rA, 'microsoft', { state: 'vervalst-en-onbekend', code: 'x' })).naar, 'STATE_ONGELDIG', 'microsoft'));
    const s3 = await roep(rA, 'start', { id: 'microsoft' });
    const q3 = new URL(String(s3.uit.url)).searchParams;
    const rij3 = await stateRij(q3.get('state')!);
    { const { id: _w, ...rest } = rij3; await db.update(STATES, [{ id: rij3.id, record: { ...rest, verlooptOp: Date.now() - 1000 } }]); }
    check('verlopen state (ouder dan 10 min) → VERLOPEN', fout((await terug(rA, 'microsoft', { state: q3.get('state')!, code: 'x' })).naar, 'VERLOPEN', 'microsoft'));
    const s4 = await roep(rA, 'start', { id: 'microsoft' });
    const q4 = new URL(String(s4.uit.url)).searchParams;
    const rij4 = await stateRij(q4.get('state')!);
    { const { id: _w, ...rest } = rij4; await db.update(STATES, [{ id: rij4.id, record: { ...rest, verifier: 'vervalste-verifier' } }]); }
    const code4 = nep.codeVoor({ aanbieder: 'microsoft', sub: `pkce-${sfx}`, nonce: q4.get('nonce')!, challenge: q4.get('code_challenge')! });
    check('PKCE: de aanbieder weigert een verkeerde verifier → TOKEN_ONGELDIG', fout((await terug(rA, 'microsoft', { state: q4.get('state')!, code: code4 })).naar, 'TOKEN_ONGELDIG', 'microsoft'));
    const s5 = await roep(rA, 'start', { id: 'microsoft' });
    const q5 = new URL(String(s5.uit.url)).searchParams;
    const code5 = nep.codeVoor({ aanbieder: 'microsoft', sub: `sig-${sfx}`, nonce: q5.get('nonce')!, challenge: q5.get('code_challenge')!, kapot: 'handtekening' });
    check('id_token met vervalste handtekening → HANDTEKENING_ONGELDIG', fout((await terug(rA, 'microsoft', { state: q5.get('state')!, code: code5 })).naar, 'HANDTEKENING_ONGELDIG', 'microsoft'));
    const s6 = await roep(rA, 'start', { id: 'microsoft' });
    const q6 = new URL(String(s6.uit.url)).searchParams;
    const code6 = nep.codeVoor({ aanbieder: 'microsoft', sub: `nonce-${sfx}`, nonce: q6.get('nonce')!, challenge: q6.get('code_challenge')!, kapot: 'nonce' });
    check('id_token met een andere nonce → STATE_ONGELDIG', fout((await terug(rA, 'microsoft', { state: q6.get('state')!, code: code6 })).naar, 'STATE_ONGELDIG', 'microsoft'));
    const tFout = await terug(rA, 'microsoft', { state: 'maakt-niet-uit', error: 'access_denied' });
    check('weigering bij de aanbieder (?error=…) → eerlijke fout-redirect zonder de aanbiederstekst te herhalen', fout(tFout.naar, 'TOKEN_ONGELDIG', 'microsoft') && !tFout.naar.includes('access_denied'));
    check('terug voor een niet-koppelbare aanbieder → AANBIEDER_ONBEKEND', fout((await terug(rA, 'sms', { state: 'x' })).naar, 'AANBIEDER_ONBEKEND', 'sms'));

    // ================================================================ 6. discord: happy-path, isolatie en globale uniciteit
    process.env.AANMELD_DISCORD_CLIENT_ID = dcId;
    process.env.AANMELD_DISCORD_CLIENT_SECRET = dcGeheim;
    process.env.AANMELD_DISCORD_BASIS = nep.url;
    const zDc = await roep(rA, 'zelftest', { id: 'discord' });
    check('discord-zelftest ok; de ping verwacht juist 401 zonder token', zDc.uit.zelftest === 'ok' && zDc.uit.details.join(' ').includes('401'));
    const sd = await roep(rA, 'start', { id: 'discord' });
    const qd = new URL(String(sd.uit.url)).searchParams;
    check('discord-authorize: identify email + PKCE', String(sd.uit.url).startsWith(`${nep.url}/oauth2/authorize?`) && qd.get('scope') === 'identify email' && qd.get('prompt') === 'consent' && !!qd.get('code_challenge'));
    const subDc = `dc-${sfx}`;
    const coded = nep.codeVoor({ aanbieder: 'discord', sub: subDc, username: 'pavlo_tg', challenge: qd.get('code_challenge')! });
    check('discord terug → ok; identiteit via /users/@me met Bearer', (await terug(rA, 'discord', { state: qd.get('state')!, code: coded })).naar.endsWith('koppel=discord-ok')
      && nep.aanroepen.some((x) => x.pad === '/api/users/@me' && x.authorization.startsWith('Bearer nep-acc-')));
    const kDc = (await koppelingen(a, 'discord'))[0];
    check('discord-koppeling: subject = discord-id, label gemaskeerd uit de gebruikersnaam', !!kDc && kDc.subject === subDc && kDc.label === 'pa…tg');
    check('isolatie: account B ziet geen gekoppeld van A', await statusVan(rB, 'discord').then((x) => x.gekoppeld === null) && await statusVan(rB, 'microsoft').then((x) => x.gekoppeld === null));
    const sdB = await roep(rB, 'start', { id: 'discord' });
    const qdB = new URL(String(sdB.uit.url)).searchParams;
    const codedB = nep.codeVoor({ aanbieder: 'discord', sub: subDc, username: 'indringer', challenge: qdB.get('code_challenge')! });
    check('GLOBALE uniciteit: hetzelfde discord-subject bij account B → KOPPELING_BESTAAT', fout((await terug(rB, 'discord', { state: qdB.get('state')!, code: codedB })).naar, 'KOPPELING_BESTAAT', 'discord'));
    const sdB2 = await roep(rB, 'start', { id: 'discord' });
    const qdB2 = new URL(String(sdB2.uit.url)).searchParams;
    const codedB2 = nep.codeVoor({ aanbieder: 'discord', sub: `dc-b-${sfx}`, username: 'tweede', challenge: qdB2.get('code_challenge')! });
    check('een eigen subject voor B mag wél; beide accounts houden elk één koppeling', (await terug(rB, 'discord', { state: qdB2.get('state')!, code: codedB2 })).naar.endsWith('koppel=discord-ok')
      && (await koppelingen(b, 'discord')).length === 1 && (await koppelingen(a, 'discord')).length === 1);

    // ================================================================ 7. apple: ES256-clientgeheim + lege scope
    check('apple zonder sleutels → SLEUTELS_ONTBREKEN', (await roep(rA, 'start', { id: 'apple' })).uit.error === 'SLEUTELS_ONTBREKEN');
    process.env.AANMELD_APPLE_CLIENT_ID = 'com.eenheid.app';
    process.env.AANMELD_APPLE_TEAM_ID = `TEAM${sfx.toUpperCase()}`;
    process.env.AANMELD_APPLE_KEY_ID = `SLEUTEL${sfx.toUpperCase()}`;
    process.env.AANMELD_APPLE_PRIVATE_KEY = appleP8;
    process.env.AANMELD_APPLE_BASIS = nep.url;
    const geheim = appleClientSecret();
    const [gKop, gInhoud] = geheim.split('.').slice(0, 2).map((x) => JSON.parse(Buffer.from(x, 'base64url').toString('utf8')) as Record<string, unknown>);
    check('appleClientSecret: ES256-JWT met kid, iss=team, sub=client en aud=apple', geheim.split('.').length === 3
      && gKop.alg === 'ES256' && gKop.kid === `SLEUTEL${sfx.toUpperCase()}` && gInhoud.iss === `TEAM${sfx.toUpperCase()}` && gInhoud.sub === 'com.eenheid.app' && gInhoud.aud === 'https://appleid.apple.com');
    check('apple-zelftest ok (p8 leesbaar, proefhandtekening geverifieerd)', (await roep(rA, 'zelftest', { id: 'apple' })).uit.zelftest === 'ok');
    const sa = await roep(rA, 'start', { id: 'apple' });
    const ua = new URL(String(sa.uit.url));
    const qa = ua.searchParams;
    check('apple-authorize: ZONDER scope (vereist voor response_mode=query), mét nonce en PKCE', `${ua.origin}${ua.pathname}` === `${nep.url}/auth/authorize`
      && !qa.has('scope') && qa.get('response_mode') === 'query' && !!qa.get('nonce') && !!qa.get('code_challenge'));
    const subApple = `apple-sub-${sfx}`;
    const codea = nep.codeVoor({ aanbieder: 'apple', sub: subApple, nonce: qa.get('nonce')!, challenge: qa.get('code_challenge')! });
    check('apple terug → ok; de nep heeft het ES256-clientgeheim ECHT tegen de publieke sleutel geverifieerd',
      (await terug(rA, 'apple', { state: qa.get('state')!, code: codea })).naar.endsWith('koppel=apple-ok') && nep.appleSecretGeldig() === true);
    const kAp = (await koppelingen(a, 'apple'))[0];
    check('apple-koppeling: subject = sub, label gemaskeerd («Apple ap…»)', !!kAp && kAp.subject === subApple && String(kAp.label).startsWith('Apple ap…') && !String(kAp.label).includes(subApple));

    // ================================================================ 8. telegram terug: HMAC, vers, eenmalige state
    const tgStart1 = await roep(rA, 'start', { id: 'telegram' });
    const tgState1 = new URL(String(tgStart1.uit.widget.authUrl)).searchParams.get('state')!;
    const tgId = String(parseInt(sfx, 16));
    const v1 = telegramVector(botToken, { auth_date: String(Math.floor(Date.now() / 1000)), first_name: 'Pavlo', id: tgId, username: 'pavlo_tg' });
    check('telegram terug met geldige HMAC (zonder last_name/photo_url; onze state telt niet mee in de controleregel) → ok',
      (await terug(rA, 'telegram', { ...v1, state: tgState1 })).naar.endsWith('koppel=telegram-ok'));
    const kTg = (await koppelingen(a, 'telegram'))[0];
    check('telegram-koppeling: subject = telegram-id, label gemaskeerd uit @gebruikersnaam', !!kTg && kTg.subject === tgId && kTg.label === '@p…tg');
    check('telegram-state is ook eenmalig', fout((await terug(rA, 'telegram', { ...v1, state: tgState1 })).naar, 'STATE_ONGELDIG', 'telegram'));
    const tgStart2 = await roep(rA, 'start', { id: 'telegram' });
    const tgState2 = new URL(String(tgStart2.uit.widget.authUrl)).searchParams.get('state')!;
    const v2 = telegramVector(botToken, { auth_date: String(Math.floor(Date.now() / 1000)), first_name: 'Pavlo', id: `9${tgId}`, username: 'pavlo_tg' });
    v2.hash = v2.hash.startsWith('0') ? `1${v2.hash.slice(1)}` : `0${v2.hash.slice(1)}`;
    check('vervalste hash → HANDTEKENING_ONGELDIG', fout((await terug(rA, 'telegram', { ...v2, state: tgState2 })).naar, 'HANDTEKENING_ONGELDIG', 'telegram'));
    const tgStart3 = await roep(rA, 'start', { id: 'telegram' });
    const tgState3 = new URL(String(tgStart3.uit.widget.authUrl)).searchParams.get('state')!;
    const v3 = telegramVector(botToken, { auth_date: String(Math.floor(Date.now() / 1000) - 3600), first_name: 'Pavlo', id: `8${tgId}`, username: 'pavlo_tg' });
    check('geldige HMAC maar oude auth_date (> 10 min) → VERLOPEN', fout((await terug(rA, 'telegram', { ...v3, state: tgState3 })).naar, 'VERLOPEN', 'telegram'));

    // ================================================================ 9. rate-limit op start
    const rC = maak(c);
    let gelukt = 0;
    for (let i = 0; i < 10; i += 1) gelukt += (await roep(rC, 'start', { id: 'telegram' })).status === 200 ? 1 : 0;
    const elfde = await roep(rC, 'start', { id: 'telegram' });
    check('rate-limit: 10 starts per gebruiker per aanbieder per uur mogen, de elfde → RATE_LIMITED (429)', gelukt === 10 && elfde.status === 429 && elfde.uit.error === 'RATE_LIMITED');

    // ================================================================ 10. ontkoppelen
    check('ontkoppel microsoft → ok; de rij is weg en de status toont weer gekoppeld=null',
      (await roep(rA, 'ontkoppel', { id: 'microsoft' })).uit.ok === true && (await koppelingen(a, 'microsoft')).length === 0
      && await statusVan(rA, 'microsoft').then((x) => x.gekoppeld === null));
    check('audit kreeg aanmeld.ontkoppeling', (await auditRijen(a)).some((x) => x.action === 'aanmeld.ontkoppeling' && x.result === 'ok'));
    check('nogmaals ontkoppelen → KOPPELING_ONBEKEND (404)', await roep(rA, 'ontkoppel', { id: 'microsoft' }).then((r) => r.status === 404 && r.uit.error === 'KOPPELING_ONBEKEND'));
    check('ontkoppel onbekende aanbieder → AANBIEDER_ONBEKEND', (await roep(rA, 'ontkoppel', { id: 'verzonnen' })).uit.error === 'AANBIEDER_ONBEKEND');

    // ================================================================ 11. veiligheidsveeg
    const pemFrag = appleP8.split('\n')[1];
    const geheimen = [msGeheim, dcGeheim, botToken, pemFrag, String(rij1?.verifier || 'verifier-onbekend')];
    check('geen enkele redirect draagt codes, verifiers of geheimen (en nooit state terug naar de pagina)',
      locaties.length >= 12 && locaties.every((l) => l.startsWith(`${TERUG_BASIS}/aanmeldmethoden?koppel=`) && !l.includes('code=') && !l.includes('state=') && geheimen.every((g) => !l.includes(g))));
    check('de statusroute lekt geen enkele geheimwaarde', await roep(rA, 'aanbieders').then((r) => { const s = JSON.stringify(r.uit); return geheimen.every((g) => !s.includes(g)); }));
    check('maskLabel: e-mail → 2 tekens + domein; kort → 1 teken; leeg → •••; naam → kop en staart',
      maskLabel(`pavlo@een.nl`) === 'pa…@een.nl' && maskLabel('abc') === 'a…' && maskLabel('') === '•••' && maskLabel('pavlo_tg') === 'pa…tg');
  } finally {
    await nep.stop().catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = ANY($1) AND data->>'ownerUserId' = ANY($2)`, [[KOPPELINGEN, STATES], [a, b, c]]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = $1 AND data->>'doorUserId' = ANY($2)`, [ZELFTESTS, [a, b, c]]).catch(() => undefined);
    await pool.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [[a, b, c]]).catch(() => undefined);
    for (const k of ENV_SLEUTELS) { if (oudEnv[k] === undefined) delete process.env[k]; else process.env[k] = oudEnv[k]; }
  }
  return einde();
}
