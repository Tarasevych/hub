// SEC-002 (12.11.2026), groep g10h — integraties-04, aanmelden-05 en aanmelden-04:
//   * «bekend apparaat» hing aan het grove label «Browser/Systeem» uit de User-Agent (na te bootsen): de eis «nieuw apparaat →
//     ook een toegangssleutel» bij aanmelden met Telegram, de kaart «новий пристрій» in de bot en de melding «Новий вхід на
//     новому пристрої» verdwenen met de User-Agent van het slachtoffer; «Це не я» blokkeerde diens eigen browser;
//   * het aanmeldvenster van Telegram (widget / widget-terug) was niet gebonden aan de browser die de aanmelding startte.
// Echte routes (nep-Google, nep-Telegram op 127.0.0.1, geen internet) tegen de eigen database. Alleen verzonnen geheimen.
import { createServer, type IncomingMessage } from 'node:http';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { checker, nepGoogle } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';

const lees = (req: IncomingMessage) => new Promise<string>((ok) => { const d: Buffer[] = []; req.on('data', (c) => d.push(c)); req.on('end', () => ok(Buffer.concat(d).toString('utf8'))); });
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const APPARAAT_COOKIE = '__Secure-tsv_apparaat';

export async function main(): Promise<number> {
  const { check, einde } = checker('telegram-inlog-apparaat-20261112');
  if (!process.env.DATABASE_URL) { console.log('OK   overgeslagen: geen DATABASE_URL'); return einde(); }
  const pool = getPool('systeem');
  const sql = async (q: string, w: unknown[] = []) => (await pool.query(q, w)).rows;
  const sfx = randomUUID().slice(0, 8);

  // ---------------------------------------------------------------- nep-Telegram (lokaal)
  const oproepen: Array<{ methode: string; lichaam: string }> = [];
  let berichtNr = 500;
  const nep = createServer(async (req, res) => {
    const methode = String(req.url || '').split('/').pop() || '';
    oproepen.push({ methode, lichaam: await lees(req) });
    const result = methode === 'getMe' ? { id: 1, is_bot: true, username: 'MijnRuimte_Bot', first_name: 'Мій простір' }
      : methode === 'getUserProfilePhotos' ? { total_count: 0, photos: [] } : methode.startsWith('send') ? { message_id: ++berichtNr } : true;
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result }));
  });
  await new Promise<void>((ok) => nep.listen(0, '127.0.0.1', () => ok()));
  process.env.TELEGRAM_API_BASIS = `http://127.0.0.1:${(nep.address() as { port: number }).port}`;
  process.env.AANMELD_TERUG_BASIS = 'https://id.tarasevych.com';

  const vlaggenVoor = (await sql("SELECT sleutel, aan, standaard FROM app.feature_flags WHERE sleutel IN ('telegram-aanmelden-v1','meldingen-uitleg-v3')")) as Array<{ sleutel: string; aan: boolean; standaard: boolean }>;
  await sql("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel IN ('telegram-aanmelden-v1','meldingen-uitleg-v3')");
  const echteFetch = globalThis.fetch;
  const G = await nepGoogle({ ownerEmail: `g10h-tg-eig-${sfx}@example.test` });
  // nep-Google onderschept fetch; verzoeken naar de lokale nep-Telegram gaan gewoon door.
  const nepFetch = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init?: RequestInit) => (String(input).startsWith(String(process.env.TELEGRAM_API_BASIS)) ? echteFetch(input as string, init) : nepFetch(input as string, init))) as typeof fetch;
  const sleutels = await import('../../backend/telegram-aanmelden/sleutels');
  const testBotSleutel = '123456789:AAEverzonnenproefsleutelg10hg10hg10h0';
  const geheugen = new Map<string, string>([['TELEGRAM_AANMELD_WEBHOOK_GEHEIM', 'w'.repeat(40)], ['TELEGRAM_AANMELD_PEPER', 'p'.repeat(40)]]);
  sleutels.zetKluisVoorTest({
    lees: async (_u, n) => geheugen.get(n) || '',
    leesIntegratie: async () => ({ waarde: testBotSleutel, naam: 'telegram-bot-token' }),
    bewaar: async (_u, n, w) => { geheugen.set(n, w); },
    wis: async (_u, n) => { geheugen.delete(n); },
    eigenaar: async () => `g10h-tg-eigenaar-${sfx}`,
  });
  const opslag = await import('../../backend/telegram-aanmelden/opslag');
  opslag.vlagCacheWissen(); opslag.instellingenCacheWissen();
  opslag.registreerVlagBeoordelaar(async () => true);
  const ac = await import('../../backend/apparaat-cookie');
  const na = await import('../../backend/nieuw-apparaat');
  const inl = await import('../../backend/telegram-aanmelden/inloggen');

  const gebruikers: string[] = [];
  const verzoeken: string[] = [];
  const TG = String(4_000_000_000 + Math.floor(Math.random() * 99_999_999));
  const van = { id: Number(TG), first_name: 'Olena', last_name: 'K', username: `slachtoffer_${sfx}`, language_code: 'uk' };
  try {
    // ============================================================== 1. de apparaatcookie zelf (zuiver)
    {
      const ev: Record<string, unknown> = { headers: {} };
      const a = ac.apparaatVoorAanmelding(ev);
      const b = ac.apparaatVoorAanmelding(ev);
      const r = ac.metApparaatCookie(ev, { statusCode: 200, headers: { 'Set-Cookie': 'x=1' }, body: '' });
      const kop = String(r.headers['Set-Cookie']);
      check('apparaatcookie: nieuw per browser, binnen één verzoek dezelfde; Set-Cookie HttpOnly, Secure, SameSite=Lax, eigen domein, ~400 dagen; bestaande cookie blijft',
        a.nieuw && a === b && /^[a-f0-9]{64}$/.test(a.hash) && kop.startsWith('x=1, ') && kop.includes(`${APPARAAT_COOKIE}=${a.waarde};`) && /HttpOnly/.test(kop) && /Secure/.test(kop)
        && /SameSite=Lax/.test(kop) && /Domain=\.tarasevych\.com/.test(kop) && /Max-Age=34560000/.test(kop), kop);
      const metCookie = { headers: { cookie: `andere=1; ${APPARAAT_COOKIE}=${a.waarde}` } };
      check('apparaatcookie: de browser stuurt hem terug → dezelfde hash; geen cookie of een vervalste vorm → geen hash',
        ac.apparaatCookieHash(metCookie) === a.hash && ac.apparaatVoorAanmelding(metCookie).nieuw === false && ac.apparaatCookieHash({ headers: {} }) === ''
        && ac.apparaatCookieHash({ headers: { cookie: `${APPARAAT_COOKIE}=kort` } }) === '' && ac.apparaatCookieHash({ headers: { cookie: `${APPARAAT_COOKIE}=${'a'.repeat(43)};x` } }) !== '');
      const geen = ac.metApparaatCookie({ headers: {} }, { statusCode: 200, headers: {}, body: '' });
      const fout = ac.metApparaatCookie(ev, { statusCode: 403, headers: {}, body: '' });
      const h = Object.assign(async () => ({ statusCode: 200, headers: {}, body: '' }), { patronen: ['GET /x'] });
      const omhuld = ac.apparaatCookieNaAanmelding(h);
      check('apparaatcookie: alleen na een geslaagde aanmelding in DIT verzoek, niet bij een fout; het omhulsel houdt `patronen`',
        !('Set-Cookie' in geen.headers) && !('Set-Cookie' in fout.headers) && (omhuld as unknown as { patronen: string[] }).patronen[0] === 'GET /x');
    }

    // ============================================================== 2. naAanmelding (melding «новий пристрій») op de cookie, niet op het label
    {
      const uid = `g10h-na-${sfx}`; gebruikers.push(uid);
      const hA = ac.apparaatCookieHash({ headers: { cookie: `${APPARAAT_COOKIE}=${randomBytes(32).toString('base64url')}` } });
      const hB = ac.apparaatCookieHash({ headers: { cookie: `${APPARAAT_COOKIE}=${randomBytes(32).toString('base64url')}` } });
      const aan = { vlagAan: async () => true };
      const r1 = await na.naAanmelding({ userId: uid, email: '', ua: CHROME_WIN, methode: 'google', apparaatCookie: hA }, aan);
      const r2 = await na.naAanmelding({ userId: uid, email: '', ua: CHROME_WIN, methode: 'google', apparaatCookie: hB }, aan);
      const r3 = await na.naAanmelding({ userId: uid, email: '', ua: SAFARI_IOS, methode: 'telegram', apparaatCookie: hA }, aan);
      check('aanmelden-05 (б): een ANDERE browser met dezelfde User-Agent («Chrome/Windows») is een nieuw apparaat → melding', r1 === 'basis' && r2 === 'gemeld', `${r1} ${r2}`);
      check('aanmelden-05: dezelfde browser (cookie) blijft bekend, ook als zijn label verandert (update, andere User-Agent)', r3 === 'bekend', r3);
    }

    // ============================================================== 3. echte routes: slachtoffer, aanvaller met de User-Agent van het slachtoffer
    const sub = `g10h-tg-${sfx}`, email = `${sub}@example.test`;
    const V = G.browser();
    await V.aanmelden(sub, email, { intent: 'login', service: 'identity', ua: CHROME_WIN });
    const uid = String((await sql(`SELECT id FROM app.records WHERE tbl = 'users' AND data->>'email' = $1`, [email]))[0]?.id || '');
    gebruikers.push(uid);
    await sql(`UPDATE app.records SET data = data || '{"status":"approved"}'::jsonb WHERE tbl = 'users' AND id = $1`, [uid]);
    const cookieV = V.jar.get(APPARAAT_COOKIE) || '';
    check('integraties-04: na een geslaagde aanmelding (Google) krijgt de browser een eigen apparaatcookie', /^[A-Za-z0-9_-]{43}$/.test(cookieV));
    const wachtOpRijen = async (n: number) => { for (let i = 0; i < 40; i++) { if (Number((await sql('SELECT count(*)::int AS n FROM app.bekende_apparaten WHERE user_id = $1', [uid]))[0].n) >= n) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
    await wachtOpRijen(1);
    // De aanvaller kent het Google-wachtwoord (gestolen) en meldt zich aan met de User-Agent van het slachtoffer: dat moet een NIEUW apparaat zijn.
    const A = G.browser();
    await A.aanmelden(sub, email, { intent: 'login', service: 'identity', ua: CHROME_WIN });
    const tweeRijen = await wachtOpRijen(2);
    check('aanmelden-05 (б, routes): aanmelden met gestolen Google-gegevens en de User-Agent van het slachtoffer = nieuw apparaat (eigen rij, melding)', tweeRijen && !!A.jar.get(APPARAAT_COOKIE) && A.jar.get(APPARAAT_COOKIE) !== cookieV);

    const [koppeling] = await sql(`INSERT INTO app.tg_koppelingen (user_id, telegram_id, chat_id, gebruikersnaam, voornaam, achternaam, naam) VALUES ($1, $2, $2, $3, 'Olena', 'K', 'Особистий') RETURNING id`, [uid, TG, van.username]);
    await sql('DELETE FROM app.tg_matrix WHERE user_id = $1', [uid]); // standaard: nieuw apparaat = Telegram + toegangssleutel
    const start = async (b: ReturnType<typeof G.browser>) => {
      const r = await b.verzoek('id.tarasevych.com', '/api/aanmelden/telegram/start', { tab: b.tab, locale: 'uk', remember: true, service: 'identity' }, { ua: CHROME_WIN });
      if (r.data?.id) verzoeken.push(String(r.data.id));
      return r;
    };
    const rij = async (id: string) => (await sql('SELECT apparaat, apparaat_sleutel, telegram_id, stand, reden FROM app.tg_inlog_verzoeken WHERE id = $1', [id]))[0] as { apparaat: string; apparaat_sleutel: string | null; telegram_id: string | null; stand: string; reden: string } | undefined;

    // 3a. De aanvaller (nieuwe browser, User-Agent van het slachtoffer) start een aanmelding met Telegram en stuurt de link door.
    const T = G.browser();
    const s1 = await start(T);
    const r1 = await rij(String(s1.data.id || ''));
    check('integraties-04: het verzoek van de aanvaller draagt hetzelfde label als de browser van het slachtoffer, maar GEEN apparaatsleutel',
      s1.status === 200 && !!r1 && /Chrome/.test(r1.apparaat) && /Windows/.test(r1.apparaat) && r1.apparaat_sleutel == null, JSON.stringify({ st: s1.status, e: s1.data?.error, r1 }));
    const voorKaart = oproepen.length;
    const viaBot = await inl.inlogVanBot(String(s1.data.id), van, TG);
    const kaart = oproepen.slice(voorKaart).map((o) => o.lichaam).join('\n');
    check('integraties-04: de bot toont het verzoek van de aanvaller als NIEUW apparaat (in woorden)', viaBot === 'gevraagd' && /НОВИЙ пристрій|NIEUW apparaat/.test(kaart), `${viaBot} ${kaart.slice(0, 200)}`);
    const goed1 = await inl.inlogGoedkeuren(`${s1.data.id}:${koppeling.id}`, TG);
    check('integraties-04: «Це я» van het slachtoffer volstaat NIET — nieuw apparaat vraagt een toegangssleutel (passkey-nodig)', goed1.uitkomst === 'passkey-nodig', goed1.uitkomst);

    // 3b. «Це не я» op een tweede verzoek van de aanvaller blokkeert NIET de eigen browser van het slachtoffer.
    const s2 = await start(T);
    await inl.inlogVanBot(String(s2.data.id), van, TG);
    const geweigerd = await inl.inlogWeigeren(String(s2.data.id), TG);
    const sv = await start(V);
    const rv = await rij(String(sv.data.id || ''));
    const viaBotV = await inl.inlogVanBot(String(sv.data.id), van, TG);
    check('aanmelden-05 (в): «Це не я» op het verzoek van de aanvaller blokkeert de eigen browser van het slachtoffer niet', geweigerd && viaBotV === 'gevraagd' && /^[a-f0-9]{64}$/.test(String(rv?.apparaat_sleutel || '')), `${geweigerd} ${viaBotV}`);
    const goedV = await inl.inlogGoedkeuren(`${sv.data.id}:${koppeling.id}`, TG);
    check('integraties-04: de eigen (bekende) browser van het slachtoffer meldt zich gewoon aan met alleen Telegram', goedV.uitkomst === 'ok', goedV.uitkomst);
    const s3 = await start(T);
    const viaBot3 = await inl.inlogVanBot(String(s3.data.id), van, TG);
    check('aanmelden-05 (в): de geblokkeerde browser zonder cookie (de aanvaller) blijft geblokkeerd', viaBot3 === 'apparaat-geblokkeerd', viaBot3);

    // ============================================================== 3c. g10h-toets-3: vlag meldingen-uitleg-v3 UIT (de standaard)
    // De vlag regelt alleen de MELDING «nieuw apparaat»; welke browser bekend is, moet ook zonder de vlag onthouden worden — anders
    // kreeg elk verzoek, ook uit de eigen browser, de (onware) waarschuwing «⚠️ НОВИЙ пристрій … tik Це не я» en wende de mens eraan.
    {
      await sql("UPDATE app.feature_flags SET aan = false, standaard = false WHERE sleutel = 'meldingen-uitleg-v3'");
      const voorRijen = Number((await sql('SELECT count(*)::int AS n FROM app.bekende_apparaten WHERE user_id = $1', [uid]))[0].n);
      const V3 = G.browser();
      await V3.aanmelden(sub, email, { intent: 'login', service: 'identity', ua: SAFARI_IOS });
      const onthouden = await wachtOpRijen(voorRijen + 1);
      const meldingenVoor = Number((await sql(`SELECT count(*)::int AS n FROM app.records WHERE data::text LIKE '%Новий вхід на новому пристрої%' AND data::text LIKE $1`, [`%${uid}%`]).catch(() => [{ n: 0 }]))[0].n);
      const s5 = await V3.verzoek('id.tarasevych.com', '/api/aanmelden/telegram/start', { tab: V3.tab, locale: 'uk', remember: true, service: 'identity' }, { ua: SAFARI_IOS });
      if (s5.data?.id) verzoeken.push(String(s5.data.id));
      const voorK = oproepen.length;
      const bot5 = await inl.inlogVanBot(String(s5.data.id), van, TG);
      const kaart5 = oproepen.slice(voorK).map((o) => o.lichaam).join('\n');
      const goed5 = await inl.inlogGoedkeuren(`${s5.data.id}:${koppeling.id}`, TG);
      check('g10h-toets-3: met de vlag UIT onthoudt de server de browser toch (rij), de eigen browser krijgt GEEN «НОВИЙ пристрій» en meldt zich aan met alleen Telegram',
        onthouden && bot5 === 'gevraagd' && !/НОВИЙ пристрій|NIEUW apparaat/.test(kaart5) && goed5.uitkomst === 'ok', JSON.stringify({ onthouden, bot5, nieuw: /НОВИЙ пристрій/.test(kaart5), goed: goed5.uitkomst }));
      const meldingenNa = Number((await sql(`SELECT count(*)::int AS n FROM app.records WHERE data::text LIKE '%Новий вхід на новому пристрої%' AND data::text LIKE $1`, [`%${uid}%`]).catch(() => [{ n: 0 }]))[0].n);
      check('g10h-toets-3: met de vlag UIT geen melding «Новий вхід на новому пристрої» (de vlag regelt alleen de melding)', meldingenNa === meldingenVoor, `${meldingenVoor} → ${meldingenNa}`);
      await sql("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = 'meldingen-uitleg-v3'");
    }

    // ============================================================== 4. aanmelden-04: aanmeldvenster alleen voor de browser die begon
    {
      const T4 = G.browser();
      const s4 = await start(T4);
      const id4 = String(s4.data.id || '');
      const venster = (b: ReturnType<typeof G.browser>, id: string) => b.verzoek('id.tarasevych.com', '/api/aanmelden/telegram/widget', {}, { methode: 'GET', query: { i: id, verzoek: id, taal: 'uk' } });
      const vSlachtoffer = await venster(V, id4);
      const vAanvaller = await venster(T4, id4);
      check('aanmelden-04: het slachtoffer kan het aanmeldvenster van het verzoek van de aanvaller niet openen (403); de browser die begon wel',
        vSlachtoffer.status === 403 && !vSlachtoffer.body.includes('data-telegram-login') && vAanvaller.status === 200 && vAanvaller.body.includes('data-telegram-login'), `${vSlachtoffer.status} ${vAanvaller.status}`);
      let datum = Math.floor(Date.now() / 1000);
      const ondertekend = () => {
        const velden: Record<string, string> = { auth_date: String(datum--), first_name: van.first_name, id: TG, last_name: van.last_name, username: van.username };
        const regel = Object.entries(velden).map(([k, v]) => `${k}=${v}`).sort().join('\n');
        return { ...velden, hash: createHmac('sha256', createHash('sha256').update(testBotSleutel).digest()).update(regel).digest('hex') };
      };
      const terug = (b: ReturnType<typeof G.browser>, id: string) => b.verzoek('id.tarasevych.com', '/api/aanmelden/telegram/widget-terug', {}, { methode: 'GET', query: { ...ondertekend(), verzoek: id, i: id } });
      const voor = oproepen.length;
      const tSlachtoffer = await terug(V, id4);
      const r4 = await rij(id4);
      check('aanmelden-04: de terugkeer van Telegram in de browser van het slachtoffer raakt het verzoek van de aanvaller niet (geen Telegram-id, geen vraag in de bot)',
        tSlachtoffer.status === 302 && r4?.telegram_id == null && r4?.stand === 'wacht' && oproepen.length === voor, JSON.stringify({ st: tSlachtoffer.status, r4, berichten: oproepen.length - voor }));
      // Controle: de eigen aanmelding van het slachtoffer via het venster werkt als voorheen.
      const sEigen = await start(V);
      const vEigen = await venster(V, String(sEigen.data.id));
      const tEigen = await terug(V, String(sEigen.data.id));
      const rEigen = await rij(String(sEigen.data.id));
      check('aanmelden-04: de eigen aanmelding via het venster in dezelfde browser werkt (venster 200, terugkeer koppelt de Telegram en de bot vraagt)',
        vEigen.status === 200 && tEigen.status === 302 && rEigen?.telegram_id === TG && oproepen.length > voor, JSON.stringify({ v: vEigen.status, t: tEigen.status, rEigen }));
    }
  } finally {
    G.herstel();
    nep.close();
    for (const id of verzoeken) await sql('DELETE FROM app.tg_inlog_verzoeken WHERE id = $1', [id]).catch(() => undefined);
    for (const u of gebruikers) {
      await sql('DELETE FROM app.tg_koppelingen WHERE user_id = $1', [u]).catch(() => undefined);
      await sql('DELETE FROM app.tg_geblokkeerd WHERE user_id = $1', [u]).catch(() => undefined);
      await sql('DELETE FROM app.bekende_apparaten WHERE user_id = $1', [u]).catch(() => undefined);
    }
    for (const v of vlaggenVoor) await sql('UPDATE app.feature_flags SET aan = $2, standaard = $3 WHERE sleutel = $1', [v.sleutel, v.aan, v.standaard]).catch(() => undefined);
    sleutels.zetKluisVoorTest(null);
    opslag.registreerVlagBeoordelaar(null);
  }
  return einde();
}
