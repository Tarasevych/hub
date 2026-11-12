// TELEGRAM-AANMELDEN v1 — de hele stroom tegen een echte database en een NEP-Telegram (lokale HTTP-server, geen internet):
// koppelen (alleen eigen gedeeld nummer) → aanmelden met kaart + aftelling → «Ні» blokkeert → wijziging gezien → «Ні» wint →
// dubbele tik en dubbele update tellen één keer → groepen genegeerd → code in de chat wordt verwijderd.
import { createServer, type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';

type Oproep = { methode: string; lichaam: string };
const oproepen: Oproep[] = [];
const lees = (req: IncomingMessage) => new Promise<string>((ok) => { const d: Buffer[] = []; req.on('data', (c) => d.push(c)); req.on('end', () => ok(Buffer.concat(d).toString('utf8'))); });
let berichtNr = 100;

export async function main(): Promise<number> {
  const { check, einde } = checker('telegram-aanmelden-stroom');
  if (!process.env.DATABASE_URL) { console.log('OK   overgeslagen: geen DATABASE_URL'); return einde(); }
  const nep = createServer(async (req, res) => {
    const methode = String(req.url || '').split('/').pop() || '';
    oproepen.push({ methode, lichaam: await lees(req) });
    const result = methode === 'getMe' ? { id: 1, is_bot: true, username: 'MijnRuimte_Bot', first_name: 'Мій простір' }
      : methode === 'getUserProfilePhotos' ? { total_count: 0, photos: [] }
        : methode.startsWith('send') ? { message_id: ++berichtNr } : true;
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result }));
  });
  await new Promise<void>((ok) => nep.listen(0, '127.0.0.1', () => ok()));
  const poort = (nep.address() as { port: number }).port;
  process.env.TELEGRAM_API_BASIS = `http://127.0.0.1:${poort}`;
  process.env.AANMELD_TERUG_BASIS = 'https://id.tarasevych.com';

  const pool = getPool('systeem');
  // Er mag maar één eigenaar zijn (records_een_eigenaar): de bestaande gebruiken, anders een tijdelijke maken.
  const bestaand = (await pool.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1")).rows[0];
  const eigenaar = bestaand ? String(bestaand.id) : randomUUID();
  if (!bestaand) await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', eigenaar, { email: `tg-${eigenaar.slice(0, 8)}@voorbeeld.test`, role: 'owner', status: 'approved', name: 'Pavlo' }]);
  await pool.query('DELETE FROM app.tg_koppelingen WHERE user_id = $1', [eigenaar]);
  await pool.query('DELETE FROM app.tg_matrix WHERE user_id = $1', [eigenaar]);
  await pool.query("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = 'telegram-aanmelden-v1'");
  await pool.query('DELETE FROM app.tg_koppelingen WHERE telegram_id = $1', ['777']);
  await pool.query("DELETE FROM app.tg_chats WHERE telegram_id IN ('777','778')");

  const sleutels = await import('../../backend/telegram-aanmelden/sleutels');
  const geheugen = new Map<string, string>([['TELEGRAM_AANMELD_BOT_SLEUTEL', '123456789:AAEtestsleuteltestsleuteltestsleutel0'], ['TELEGRAM_AANMELD_WEBHOOK_GEHEIM', 'w'.repeat(40)], ['TELEGRAM_AANMELD_PEPER', 'p'.repeat(40)]]);
  sleutels.zetKluisVoorTest({ lees: async (_u, n) => geheugen.get(n) || '', bewaar: async (_u, n, w) => { geheugen.set(n, w); }, wis: async (_u, n) => { geheugen.delete(n); }, eigenaar: async () => eigenaar });
  const opslag = await import('../../backend/telegram-aanmelden/opslag');
  opslag.vlagCacheWissen(); opslag.instellingenCacheWissen();
  opslag.registreerVlagBeoordelaar(async (id) => id === eigenaar); // in de server: flagsBerekenen (backend/index.ts)
  const { koppelStart, koppelStatus, koppelBevestigen } = await import('../../backend/telegram-aanmelden/koppelen');
  const { inlogStart, inlogStatus } = await import('../../backend/telegram-aanmelden/inloggen');
  const { updateVerwerken, kopKlopt } = await import('../../backend/telegram-aanmelden/webhook');
  const { wijzigingBeantwoorden } = await import('../../backend/telegram-aanmelden/wijzigingen');
  const { publiekeConfig } = await import('../../backend/telegram-aanmelden/inloggen');

  let upd = Date.now() * 100; // uniek per run (Telegram-update-ids worden ontdubbeld)
  const van = { id: 777, first_name: 'Pavlo', last_name: 'T', username: 'pavlo_t', language_code: 'uk' };
  const chat = { id: 777, type: 'private' };
  const bericht = (extra: Record<string, unknown>, wie = van, waar = chat) => updateVerwerken({ update_id: ++upd, message: { message_id: ++berichtNr, chat: waar, from: wie, ...extra } } as never);
  const tik = (data: string, wie = van) => updateVerwerken({ update_id: ++upd, callback_query: { id: `q${upd}`, from: wie, data, message: { message_id: berichtNr, chat: { id: 777 } } } } as never);
  const laatste = (m: string) => [...oproepen].reverse().find((o) => o.methode === m);
  const knop = (letter: string) => { for (const o of [...oproepen].reverse()) { const r = new RegExp(`"callback_data":"(${letter}\\.[A-Za-z0-9_-]{12}\\.[A-Za-z0-9_-]{16})"`).exec(o.lichaam.replace(/\\"/g, '"')); if (r) return r[1]; } return ''; };
  const sql = async (q: string, w: unknown[] = []) => (await pool.query(q, w)).rows;

  try {
    check('kop van het terugroepadres: juist geheim aanvaard, fout geweigerd', (await kopKlopt('w'.repeat(40))) && !(await kopKlopt('x'.repeat(40))) && !(await kopKlopt('')));
    const cfg = await publiekeConfig();
    check('aanmeldscherm: knop zichtbaar met bot @MijnRuimte_Bot zodra vlag + sleutel er zijn', cfg.zichtbaar && cfg.bot === 'MijnRuimte_Bot' && cfg.botId === '123456789');

    // ---------------------------------------------------------------- koppelen
    const k = await koppelStart({ id: eigenaar, role: 'owner', status: 'approved' }, 'sessie-a', { naam: 'Особистий' });
    check('koppelen: directe verwijzing naar t.me/MijnRuimte_Bot?start=k_<id>', k.deeplink === `https://t.me/MijnRuimte_Bot?start=k_${k.id}`);
    await bericht({ text: `/start k_${k.id}` });
    check('bot vraagt het nummer met de knop «поділитися» (request_contact)', /request_contact/.test(laatste('sendMessage')?.lichaam || '') || /request_contact/.test(laatste('sendPhoto')?.lichaam || ''));
    check('stand na /start = wacht-telefoon', (await koppelStatus(eigenaar, 'sessie-a', k.id)).stand === 'wacht-telefoon');
    await bericht({ text: '+32 470 12 34 56' });
    check('getypt nummer telt niet', (await koppelStatus(eigenaar, 'sessie-a', k.id)).stand === 'wacht-telefoon');
    await bericht({ contact: { user_id: 999, phone_number: '32470999999' } });
    check('contact van iemand anders telt niet', (await koppelStatus(eigenaar, 'sessie-a', k.id)).stand === 'wacht-telefoon');
    await bericht({ contact: { user_id: 777, phone_number: '+32470123456' } });
    const st = await koppelStatus(eigenaar, 'sessie-a', k.id);
    check('eigen contact → wacht-toegangssleutel met de VOLLEDIGE identiteit (niets gemaskeerd)', st.stand === 'wacht-passkey' && st.identiteit?.telefoon.replace(/^\+/, '') === '32470123456' && st.identiteit?.gebruikersnaam === 'pavlo_t' && st.identiteit?.voornaam === 'Pavlo' && st.identiteit?.telegramId === '777');
    let andereSessie = '';
    try { await koppelStatus(eigenaar, 'sessie-b', k.id); } catch (e) { andereSessie = (e as Error).message; }
    check('een andere sessie ziet het verzoek niet', andereSessie === 'VERZOEK_ONBEKEND');
    const kb = await koppelBevestigen(eigenaar, 'sessie-a', k.id, { rechten: ['aanmelden', 'bevestigen', 'meldingen'] });
    check('bevestigd → koppeling actief', (await sql('SELECT stand FROM app.tg_koppelingen WHERE id = $1', [kb.koppelingId]))[0]?.stand === 'actief');

    // ---------------------------------------------------------------- aanmelden
    await sql('INSERT INTO app.tg_matrix (user_id, keuzes) VALUES ($1, $2::jsonb) ON CONFLICT (user_id) DO UPDATE SET keuzes = EXCLUDED.keuzes', [eigenaar, JSON.stringify({ 'nieuw-apparaat': 'telegram', aanmelden: 'telegram' })]);
    const i1 = await inlogStart('tx-1', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0');
    check('aanmelden: directe verwijzing t.me/MijnRuimte_Bot?start=i_<id>', i1.deeplink === `https://t.me/MijnRuimte_Bot?start=i_${i1.id}`);
    await bericht({ text: `/start i_${i1.id}` });
    const ja = knop('i');
    check('kaart met «Так»-knop verstuurd', !!ja);
    check('«Так»-knop toont eerst de aftelling (⏳)', oproepen.some((o) => o.lichaam.includes('⏳')));
    await tik(ja);
    check('tik vóór het aftellen telt niet (melding «⏳ Ще … с»)', (await inlogStatus(i1.id, i1.geheim)).stand === 'wacht' && /show_alert":true/.test(laatste('answerCallbackQuery')?.lichaam || ''));
    await sql("UPDATE app.tg_knoppen SET aangemaakt_op = now() - interval '1 minute' WHERE groep = $1", [`inlog-${i1.id}`]);
    await Promise.all([tik(ja), tik(ja), tik(ja)]);
    check('na het aftellen: goedgekeurd', (await inlogStatus(i1.id, i1.geheim)).stand === 'goedgekeurd');
    const klaar = await sql("SELECT count(*)::int AS n FROM app.tg_knoppen WHERE letter = 'i' AND stand = 'klaar' AND groep = $1", [`inlog-${i1.id}`]);
    check('drie snelle tikken = één handeling', klaar[0].n === 1);
    let fout = '';
    try { await inlogStatus(i1.id, 'verkeerd-geheim'); } catch (e) { fout = (e as Error).message; }
    check('zonder het geheim van deze browser geen status', fout === 'VERZOEK_ONBEKEND');

    // ---------------------------------------------------------------- «Ні, це не я»
    const i2 = await inlogStart('tx-2', 'Vreemd apparaat');
    await bericht({ text: `/start i_${i2.id}` });
    await tik(knop('n'));
    const s2 = await inlogStatus(i2.id, i2.geheim);
    check('«Ні» meteen (geen aftelling) → geweigerd met reden niet-ik', s2.stand === 'geweigerd' && s2.reden === 'niet-ik');
    check('apparaat geblokkeerd', (await sql('SELECT count(*)::int AS n FROM app.tg_geblokkeerd WHERE user_id = $1', [eigenaar]))[0].n >= 1);

    const i2b = await inlogStart('tx-2b', 'Vreemd apparaat');
    await bericht({ text: `/start i_${i2b.id}` });
    check('zelfde geblokkeerde apparaat opnieuw → site ziet «apparaat geblokkeerd»', (await inlogStatus(i2b.id, i2b.geheim)).reden === 'apparaat-geblokkeerd');

    // ---------------------------------------------------------------- niet gekoppeld
    const i3 = await inlogStart('tx-3', 'Iets');
    await bericht({ text: `/start i_${i3.id}` }, { ...van, id: 778 }, { id: 778, type: 'private' });
    const s3 = await inlogStatus(i3.id, i3.geheim);
    check('onbekende Telegram → site ziet meteen «niet gekoppeld»', s3.stand === 'geweigerd' && s3.reden === 'niet-gekoppeld');

    // ---------------------------------------------------------------- dubbele update, groepen
    const voor = oproepen.length;
    const dubbel = { update_id: ++upd, message: { message_id: 5, chat, from: van, text: '/hulp' } };
    await updateVerwerken(dubbel as never); await updateVerwerken(dubbel as never);
    check('dezelfde update twee keer = één antwoord', oproepen.slice(voor).filter((o) => o.methode.startsWith('send')).length === 1);
    const voorGroep = oproepen.length;
    await bericht({ text: '/start' }, van, { id: -100, type: 'supergroup' });
    check('groepsberichten worden genegeerd', oproepen.length === voorGroep);

    // ---------------------------------------------------------------- wijziging (gekaapt?)
    await bericht({ text: '/status' }, { ...van, username: 'iemand_anders' });
    const [w] = await sql("SELECT id, ernst, status FROM app.tg_wijzigingen WHERE koppeling_id = $1 ORDER BY aangemaakt_op DESC LIMIT 1", [kb.koppelingId]);
    check('gewijzigde @nickname wordt gezien → koppeling gepauzeerd', !!w && (await sql('SELECT stand FROM app.tg_koppelingen WHERE id = $1', [kb.koppelingId]))[0]?.stand === 'gepauzeerd');
    await sql("UPDATE app.tg_knoppen SET aangemaakt_op = now() - interval '1 minute' WHERE letter = 'w'");
    await tik(knop('w'), { ...van, username: 'iemand_anders' });
    check('«Так» in Telegram alleen heft de pauze NIET op', (await sql('SELECT stand FROM app.tg_koppelingen WHERE id = $1', [kb.koppelingId]))[0]?.stand === 'gepauzeerd');
    const i4 = await inlogStart('tx-4', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0');
    await bericht({ text: `/start i_${i4.id}` }, { ...van, username: 'iemand_anders' });
    check('gepauzeerde Telegram kan niet aanmelden', (await inlogStatus(i4.id, i4.geheim)).reden === 'gepauzeerd');
    const nee = await wijzigingBeantwoorden(String(w.id), 'nee', { userId: eigenaar, bron: 'site', metPasskey: false, huidigeSessieIds: [], begrepen: false });
    check('«Ні» op de site wint: koppeling uit + conflict getoond', nee.ok && (await sql('SELECT stand FROM app.tg_koppelingen WHERE id = $1', [kb.koppelingId]))[0]?.stand === 'uitgeschakeld' && (nee as { gevolg: { toestand: { conflict: boolean } } }).gevolg.toestand.conflict);

    // ---------------------------------------------------------------- code in de chat
    await bericht({ text: 'mijn code is 4815162342' });
    check('bot plaatst nooit iets met parse_mode (geen opmaak-injectie)', !oproepen.some((o) => o.lichaam.includes('parse_mode')));
  } finally {
    await pool.query("UPDATE app.feature_flags SET aan = false, standaard = false WHERE sleutel = 'telegram-aanmelden-v1'");
    await pool.query('DELETE FROM app.tg_koppelingen WHERE user_id = $1', [eigenaar]);
    await pool.query('DELETE FROM app.tg_matrix WHERE user_id = $1', [eigenaar]);
    await pool.query('DELETE FROM app.tg_geblokkeerd WHERE user_id = $1', [eigenaar]);
    if (!bestaand) await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [eigenaar]);
    sleutels.zetKluisVoorTest(null);
    opslag.registreerVlagBeoordelaar(null);
    nep.close();
    await new Promise((ok) => setTimeout(ok, 50));
  }
  const uit = einde();
  await pool.end?.().catch?.(() => undefined);
  return uit;
}
