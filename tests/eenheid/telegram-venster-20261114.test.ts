// TELEGRAM-002 etap 1 — het beveiligde Telegram-venster tegen een echte database en een NEP-Telegram (lokale HTTP-server):
//   • tegels: dezelfde vorm/kleur/naam op site en venster, contrast, geen emoji in het venster;
//   • verwijzing: ondertekend, gebonden aan Telegram + verzoek, verloopt; zonder webhookgeheim geen venster;
//   • aanmelden: browser ziet het juiste pictogram, venster niet; verkeerd pictogram = één poging; oude «Так»-knop werkt niet;
//     initData van een andere Telegram wordt geweigerd; geheime code alleen in het venster; alarmcode faalt stil;
//   • bevestigen van een handeling: pictogram + code in het venster, oude knoppen werken niet;
//   • «Це не я» in het venster; fotogeschiedenis (nieuwe foto bewaard, oude blijft); teksten zonder Latijnse woorden.
import { createServer, type IncomingMessage } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { getPool } from '../../server/platform/pg';

type Oproep = { methode: string; lichaam: string };
const oproepen: Oproep[] = [];
const lees = (req: IncomingMessage) => new Promise<string>((ok) => { const d: Buffer[] = []; req.on('data', (c) => d.push(c)); req.on('end', () => ok(Buffer.concat(d).toString('utf8'))); });
let berichtNr = 500;
let fotoUniek = '';

const BOT = '123456789:AAEtestsleuteltestsleuteltestsleutel0';
const TG = 779;
/** initData zoals Telegram die ondertekent (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
function initData(userId: number, sleutel = BOT, authDate = Math.floor(Date.now() / 1000)): string {
  const velden: Record<string, string> = { auth_date: String(authDate), query_id: 'AAH' + userId, user: JSON.stringify({ id: userId, first_name: 'Pavlo' }) };
  const dcs = Object.keys(velden).sort().map((k) => `${k}=${velden[k]}`).join('\n');
  const geheim = createHmac('sha256', 'WebAppData').update(sleutel).digest();
  const hash = createHmac('sha256', geheim).update(dcs).digest('hex');
  return new URLSearchParams({ ...velden, hash }).toString();
}

export async function main(): Promise<number> {
  const { check, einde } = checker('telegram-venster-20261114');

  // ---------------------------------------------------------------- puur: tegels en teksten
  const sym = await import('../../shared/apparaat-bevestiging/symbolen');
  const { VORMEN } = await import('../../shared/apparaat-bevestiging/pictogram-vormen');
  const lum = (h: string) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  check('24 pictogrammen, elk met een vorm en een eigen vaste kleur', sym.PICTOGRAMMEN.length === 24 && sym.PICTOGRAMMEN.every((p) => VORMEN[p.icoon]?.length > 0) && new Set(sym.PICTOGRAMMEN.map((p) => p.kleur)).size === 24);
  check('wit pictogram op elke tegel: contrast ≥ 4,5:1', sym.PICTOGRAMMEN.every((p) => 1.05 / (lum(p.kleur) + 0.05) >= 4.5));
  const svg = sym.pictogramSvg(0);
  check('svg van het venster = dezelfde vormen als de React-tegel (Anker)', VORMEN.Anchor.every(([tag, a]) => svg.includes(`<${tag} `) && Object.values(a).every((v) => svg.includes(`"${v}"`))) && !/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(svg));
  check('ongeldige index → geen tegel, geen svg', sym.pictogramTegel(24, 'uk') === null && sym.pictogramSvg(-1) === '');
  const st = sym.tegelStijlen('#1f5f9e');
  check('opmaak van de tegel als gegevens → style-tekst', sym.stijlTekst(st.tegel).includes('place-items:center') && sym.stijlTekst(st.tegel).includes('background:#1f5f9e'));
  check('kleur uit de catalogus wordt nooit vervangen door invoer van buiten', sym.tegelStijlen('red;x:1').tegel.background === '#4f5b66');
  const { TEKST, VOETREGEL } = await import('../../shared/telegram-aanmelden/teksten');
  const latijnVrij = (s: string) => !/[A-Za-z]/.test(s.replace(/Telegram|WhatsApp|Business|Google|TOTP/g, ''));
  check('nieuwe uk-teksten: geen Latijnse woorden (behalve merknamen)', [TEKST.inlogVraagVenster.uk, TEKST.bevestigVraagVenster.uk, TEKST.knopVensterInlog.uk, TEKST.knopVensterBevestig.uk, TEKST.knopVensterBrowser.uk, VOETREGEL.uk]
    .every((s) => latijnVrij(s.replace(/\{[a-z]+\}/g, ''))));
  check('voetregel zegt eerlijk: code nooit in de chat, alleen in het beveiligde venster', /У чаті/.test(VOETREGEL.uk) && /захищеному вікні/.test(VOETREGEL.uk) && /In de chat/.test(VOETREGEL.nl));
  const { AANMELD_AANBIEDERS, AANBIEDER_STAND_LABEL } = await import('../../shared/aanmeld-vnext-model');
  check('WhatsApp: «Заплановано», niet «Неможливо»', AANMELD_AANBIEDERS.find((a) => a.id === 'whatsapp')?.stand === 'gepland' && AANBIEDER_STAND_LABEL.gepland[0] === 'Заплановано');
  const { herkenning } = await import('../../backend/telegram-aanmelden/herkenning');
  const h = herkenning('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    { 'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131"', 'sec-ch-ua-platform': '"Windows"', 'sec-ch-ua-platform-version': '"15.0.0"', 'CF-IPCountry': 'BE', 'cf-ipcity': 'Brussels' });
  check('herkenning: «Chrome 131 · Windows 11», Brussels, BE (geen IP)', h.toestel === 'Chrome 131 · Windows 11' && h.plaats === 'Brussels' && h.land === 'BE');
  const { plaatsTekst } = await import('../../shared/telegram-aanmelden/plaatsnamen');
  check('plaats zonder Engelse woorden: «Брюссель, Бельгія» / «Brussel, België»', plaatsTekst('Brussels', 'BE', 'uk') === 'Брюссель, Бельгія' && plaatsTekst('Brussels', 'BE', 'nl') === 'Brussel, België');
  check('onbekende stad → alleen het land (geen Engels woord)', plaatsTekst('Springfield', 'US', 'uk') === 'Сполучені Штати' && plaatsTekst('', 'UA', 'nl') === 'Oekraïne' && plaatsTekst('x', '', 'uk') === '');
  check('herkenning: iPhone met Safari', herkenning('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1').toestel === 'Safari 17 · iOS 17.4');
  const merk = await import('../../backend/telegram-aanmelden/venster-merk');
  check('officiële logo\'s uit het merkregister (Chrome, Windows-bestand) en vlag BE', merk.merkLogo('chrome').startsWith('data:image/svg+xml;base64,') && merk.merkLogo('windows').startsWith('data:image/svg+xml')
    && merk.vlag('BE').startsWith('data:image/svg+xml') && merk.vlag('xx') === '' && merk.merkLogo('verzonnen') === '');
  const { VENSTER_CSP } = await import('../../backend/telegram-aanmelden/venster');
  check('venster-CSP: alleen eigen script, alleen Telegram Web als frame, geen eval', VENSTER_CSP.includes("script-src 'self'") && VENSTER_CSP.includes('frame-ancestors https://web.telegram.org') && !VENSTER_CSP.includes('unsafe-eval') && VENSTER_CSP.includes("default-src 'none'"));

  if (!process.env.DATABASE_URL) { console.log('OK   databasedeel overgeslagen: geen DATABASE_URL'); return einde(); }

  // ---------------------------------------------------------------- nep-Telegram
  const nep = createServer(async (req, res) => {
    const url = String(req.url || '');
    if (url.includes('/file/')) { res.setHeader('content-type', 'image/jpeg'); res.end(Buffer.from(`foto-${fotoUniek}`)); return; }
    const methode = url.split('/').pop() || '';
    oproepen.push({ methode, lichaam: await lees(req) });
    const result = methode === 'getMe' ? { id: 1, is_bot: true, username: 'MijnRuimte_Bot', first_name: 'Мій простір' }
      : methode === 'getUserProfilePhotos' ? (fotoUniek ? { total_count: 1, photos: [[{ file_id: `f-${fotoUniek}`, file_unique_id: fotoUniek, width: 160 }, { file_id: `g-${fotoUniek}`, file_unique_id: `${fotoUniek}-groot`, width: 640 }]] } : { total_count: 0, photos: [] })
        : methode === 'getFile' ? { file_path: 'photos/klein.jpg' }
          : methode.startsWith('send') ? { message_id: ++berichtNr } : true;
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result }));
  });
  await new Promise<void>((ok) => nep.listen(0, '127.0.0.1', () => ok()));
  process.env.TELEGRAM_API_BASIS = `http://127.0.0.1:${(nep.address() as { port: number }).port}`;
  process.env.AANMELD_TERUG_BASIS = 'https://id.tarasevych.com';

  const pool = getPool('systeem');
  const sql = async (q: string, w: unknown[] = []) => (await pool.query(q, w)).rows;
  const bestaand = (await pool.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1")).rows[0];
  const eigenaar = bestaand ? String(bestaand.id) : randomUUID();
  if (!bestaand) await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', eigenaar, { email: `tg2-${eigenaar.slice(0, 8)}@voorbeeld.test`, role: 'owner', status: 'approved', name: 'Pavlo' }]);
  const opruimen = async () => {
    await sql('DELETE FROM app.tg_koppelingen WHERE user_id = $1 OR telegram_id = $2', [eigenaar, String(TG)]);
    await sql('DELETE FROM app.tg_matrix WHERE user_id = $1', [eigenaar]);
    await sql('DELETE FROM app.tg_geblokkeerd WHERE user_id = $1', [eigenaar]);
    await sql('DELETE FROM app.tg_geheime_codes WHERE user_id = $1', [eigenaar]);
    await sql('DELETE FROM app.tg_chats WHERE telegram_id = $1', [String(TG)]);
    await sql('DELETE FROM app.apparaat_voorkeuren WHERE user_id = $1', [eigenaar]);
  };
  await opruimen();
  await sql('DELETE FROM app.tg_fotos WHERE telegram_id = $1', [String(TG)]);
  await sql("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel IN ('telegram-aanmelden-v1','telegram-v2')");

  const sleutels = await import('../../backend/telegram-aanmelden/sleutels');
  const geheugen = new Map<string, string>([['TELEGRAM_AANMELD_BOT_SLEUTEL', BOT], ['TELEGRAM_AANMELD_WEBHOOK_GEHEIM', 'v'.repeat(40)], ['TELEGRAM_AANMELD_PEPER', 'p'.repeat(40)]]);
  sleutels.zetKluisVoorTest({ lees: async (_u, n) => geheugen.get(n) || '', bewaar: async (_u, n, w) => { geheugen.set(n, w); }, wis: async (_u, n) => { geheugen.delete(n); }, eigenaar: async () => eigenaar });
  const opslag = await import('../../backend/telegram-aanmelden/opslag');
  opslag.vlagCacheWissen(); opslag.instellingenCacheWissen();
  opslag.registreerVlagBeoordelaar(async (id) => id === eigenaar);
  const vs = await import('../../backend/telegram-aanmelden/venster-sleutel');
  vs.vensterCacheWissen();
  const inl = await import('../../backend/telegram-aanmelden/inloggen');
  const bev = await import('../../backend/telegram-aanmelden/bevestigen');
  const ven = await import('../../backend/telegram-aanmelden/venster');
  const { updateVerwerken } = await import('../../backend/telegram-aanmelden/webhook');
  const { codeInstellen } = await import('../../backend/telegram-aanmelden/code');
  const fotos = await import('../../backend/telegram-aanmelden/fotos');

  let upd = Date.now() * 100 + 7;
  const van = { id: TG, first_name: 'Pavlo', last_name: 'T', username: 'venster_t', language_code: 'uk' };
  const bericht = (text: string) => updateVerwerken({ update_id: ++upd, message: { message_id: ++berichtNr, chat: { id: TG, type: 'private' }, from: van, text } } as never);
  const tik = (data: string) => updateVerwerken({ update_id: ++upd, callback_query: { id: `q${upd}`, from: van, data, message: { message_id: berichtNr, chat: { id: TG } } } } as never);
  const ontsnapt = (o: Oproep) => o.lichaam.replace(/\\"/g, '"').replace(/\\\//g, '/');
  const vensterAdres = (): string => { for (const o of [...oproepen].reverse()) { const m = /"web_app":\{"url":"([^"]+)"\}/.exec(ontsnapt(o)); if (m) return m[1]; } return ''; };
  const tokenUit = (adres: string) => decodeURIComponent(/[?&]t=([^&]+)/.exec(adres)?.[1] || '');
  const knop = (letter: string) => { for (const o of [...oproepen].reverse()) { const r = new RegExp(`"callback_data":"(${letter}\\.[A-Za-z0-9_-]{12}\\.[A-Za-z0-9_-]{16})"`).exec(ontsnapt(o)); if (r) return r[1]; } return ''; };
  const juistePos = async (id: string, tabel = 'tg_inlog_verzoeken') => Number((await sql(`SELECT juist FROM app.${tabel} WHERE id = $1`, [id]))[0].juist);
  const pagina = async (t: string) => (await ven.vensterPagina({ query: { t, taal: 'uk' } } as never)) as { statusCode: number; headers: Record<string, string>; body: string };

  try {
    // ---------------------------------------------------------------- koppeling (direct, het koppelen zelf test de v1-stroom)
    const [kp] = await sql(`INSERT INTO app.tg_koppelingen (user_id, telegram_id, chat_id, telefoon, gebruikersnaam, voornaam, achternaam, foto_id, naam, rechten, kleur, site_taal)
      VALUES ($1,$2,$2,'32470123456','venster_t','Pavlo','T','','Особистий',ARRAY['aanmelden','bevestigen','meldingen'],0,'uk') RETURNING id`, [eigenaar, String(TG)]);
    await sql('INSERT INTO app.tg_matrix (user_id, keuzes) VALUES ($1, $2::jsonb)', [eigenaar, JSON.stringify({ 'nieuw-apparaat': 'telegram', aanmelden: 'telegram' })]);

    // ---------------------------------------------------------------- verwijzing
    const nu = new Date(Date.now() + 60_000);
    const tok = await vs.vensterToken('i', 'abcdefghijkl', String(TG), nu);
    check('verwijzing leesbaar en gebonden aan soort, verzoek en Telegram', JSON.stringify(await vs.vensterTokenLezen(tok)) === JSON.stringify({ soort: 'i', id: 'abcdefghijkl', tg: String(TG), tot: Math.floor(nu.getTime() / 1000) }));
    const delen = tok.split('.');
    check('andere Telegram in de verwijzing → ongeldig', (await vs.vensterTokenLezen([delen[0], delen[1], '780', delen[3], delen[4]].join('.'))) === null);
    check('verlopen verwijzing → ongeldig', (await vs.vensterTokenLezen(await vs.vensterToken('i', 'abcdefghijkl', String(TG), new Date(Date.now() - 1000)))) === null);
    geheugen.delete('TELEGRAM_AANMELD_WEBHOOK_GEHEIM'); sleutels.sleutelCacheWissen();
    check('zonder webhookgeheim: venster uit en verwijzing ongeldig (geen zwakke sleutel)', !(await vs.vensterAan()) && (await vs.vensterTokenLezen(tok)) === null);
    geheugen.set('TELEGRAM_AANMELD_WEBHOOK_GEHEIM', 'v'.repeat(40)); sleutels.sleutelCacheWissen();
    check('met webhookgeheim + vlag + instelling: venster aan', await vs.vensterAan());

    // ---------------------------------------------------------------- aanmelden: verkeerd pictogram
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36';
    const i1 = await inl.inlogStart('tx-v1', ua, { toestel: 'Chrome 131 · Windows 11', plaats: 'Brussels', land: 'BE' });
    const s1 = await inl.inlogStatus(i1.id, i1.geheim);
    const j1 = await juistePos(i1.id);
    const kand1 = (await sql('SELECT kandidaten FROM app.tg_inlog_verzoeken WHERE id = $1', [i1.id]))[0].kandidaten.map(Number);
    check('browser (met geheim) krijgt het juiste pictogram', s1.pictogram === kand1[j1] && s1.codePlek === 'venster' && kand1.length === 4);
    await bericht(`/start i_${i1.id}`);
    const adres1 = vensterAdres();
    check('kaart in Telegram: knop naar het beveiligde venster (web_app) + browser + «Це не я», geen «Так»-knop', adres1.startsWith('https://id.tarasevych.com/api/telegram/venster?t=') && !!knop('n') && !knop('i'));
    check('kaart toont toestel en plaats', oproepen.some((o) => o.lichaam.includes('Chrome 131 · Windows 11 · Брюссель, Бельгія')) && !oproepen.some((o) => o.lichaam.includes('Brussels')));
    const t1 = tokenUit(adres1);
    const p1 = await pagina(t1);
    check('venster: 4 tegels, logo\'s en vlag, juiste pictogram NIET aangeduid', (p1.body.match(/class="keuze"/g) || []).length === 4 && p1.body.includes('data:image/svg+xml') && !/juist|is-uitgelicht|aria-current/.test(p1.body));
    check('venster: eigen CSP, X-Frame-Options weggelaten, geen verwijzer', p1.headers['Content-Security-Policy'] === VENSTER_CSP && p1.headers['X-Frame-Options'] === '' && p1.headers['Referrer-Policy'] === 'no-referrer');
    check('venster-tegel = zelfde svg als pictogramSvg (identiek op beide schermen)', p1.body.includes(sym.pictogramSvg(kand1[0], sym.stijlTekst(sym.tegelStijlen(sym.PICTOGRAMMEN[kand1[0]].kleur).vorm))));
    const fout1 = (j1 + 1) % 4;
    check('initData van een andere Telegram → geweigerd', (await ven.vensterKiezen({ t: t1, initData: initData(780), pos: j1, koppeling: kp.id })).uitkomst === 'verlopen');
    check('initData met een valse sleutel → geweigerd', (await ven.vensterKiezen({ t: t1, initData: initData(TG, '1:vals'), pos: j1, koppeling: kp.id })).uitkomst === 'verlopen');
    check('verkeerd pictogram → fout-symbool', (await ven.vensterKiezen({ t: t1, initData: initData(TG), pos: fout1, koppeling: kp.id })).uitkomst === 'fout-symbool');
    const s1b = await inl.inlogStatus(i1.id, i1.geheim);
    check('site ziet eerlijk: ander pictogram gekozen', s1b.stand === 'geweigerd' && s1b.reden === 'fout-symbool');
    check('één poging: daarna ook het juiste niet meer', (await ven.vensterKiezen({ t: t1, initData: initData(TG), pos: j1, koppeling: kp.id })).uitkomst === 'verlopen');
    check('verkeerd pictogram telt in de teller van «ander apparaat»', Number((await sql('SELECT mislukt FROM app.apparaat_voorkeuren WHERE user_id = $1', [eigenaar]))[0]?.mislukt) >= 1);
    await sql('UPDATE app.apparaat_voorkeuren SET mislukt = 0 WHERE user_id = $1', [eigenaar]);

    // ---------------------------------------------------------------- aanmelden: juist pictogram, zonder code
    const i2 = await inl.inlogStart('tx-v2', ua);
    await bericht(`/start i_${i2.id}`);
    const t2 = tokenUit(vensterAdres());
    const oud = await inl.inlogGoedkeuren(`${i2.id}:${kp.id}`, String(TG));
    check('oude «Так»-weg kan een vensterverzoek niet goedkeuren', oud.uitkomst === 'verlopen' && (await inl.inlogStatus(i2.id, i2.geheim)).stand === 'wacht');
    let vroeg = '';
    try { await inl.inlogInwisselen(i2.id, i2.geheim); } catch (e) { vroeg = (e as Error).message; }
    check('inwisselen vóór de keuze kan niet', vroeg === 'NOG_NIET_GOEDGEKEURD');
    check('juist pictogram in Telegram (initData) → ok', (await ven.vensterKiezen({ t: t2, initData: initData(TG), pos: await juistePos(i2.id), koppeling: kp.id })).uitkomst === 'ok');
    const s2 = await inl.inlogStatus(i2.id, i2.geheim);
    check('site: goedgekeurd, pictogram bevestigd, geen code nodig', s2.stand === 'goedgekeurd' && s2.symboolOk && !s2.codeNodig);
    const r2 = await inl.inlogInwisselen(i2.id, i2.geheim);
    check('inwisselen geeft de juiste gebruiker', r2.userId === eigenaar && r2.koppelingId === kp.id);

    // ---------------------------------------------------------------- aanmelden: met geheime code (in het venster, nooit op de site)
    const ci = await codeInstellen(eigenaar, 'Zonbloem-73', 'Alarmwrd-91', '32470123456');
    check('geheime code ingesteld (met alarmcode)', ci.ok, JSON.stringify(ci));
    const i3 = await inl.inlogStart('tx-v3', ua);
    await bericht(`/start i_${i3.id}`);
    const t3 = tokenUit(vensterAdres());
    check('juist pictogram (browser, zonder initData) → code nodig', (await ven.vensterKiezen({ t: t3, pos: await juistePos(i3.id), koppeling: kp.id })).uitkomst === 'code');
    let opSite = '';
    try { await inl.inlogCode(i3.id, i3.geheim, 'Zonbloem-73'); } catch (e) { opSite = (e as Error).message; }
    check('code op de site voor een vensterverzoek → CODE_IN_TELEGRAM', opSite === 'CODE_IN_TELEGRAM');
    let zonderCode = '';
    try { await inl.inlogInwisselen(i3.id, i3.geheim); } catch (e) { zonderCode = (e as Error).message; }
    check('inwisselen zonder code kan niet', zonderCode === 'CODE_NODIG');
    check('pagina toont nu de codestap', /id="stap-code">/.test((await pagina(t3)).body) && /id="stap-kiezen" hidden/.test((await pagina(t3)).body));
    check('verkeerde code → fout (nog niet gesloten)', (await ven.vensterCode({ t: t3, code: 'fout-fout-1' })).uitkomst === 'fout' && (await inl.inlogStatus(i3.id, i3.geheim)).stand === 'goedgekeurd');
    check('juiste code → ok', (await ven.vensterCode({ t: t3, code: 'Zonbloem-73' })).ok);
    check('daarna kan inwisselen', (await inl.inlogInwisselen(i3.id, i3.geheim)).userId === eigenaar);

    const i4 = await inl.inlogStart('tx-v4', ua);
    await bericht(`/start i_${i4.id}`);
    const t4 = tokenUit(vensterAdres());
    await ven.vensterKiezen({ t: t4, pos: await juistePos(i4.id), koppeling: kp.id });
    check('alarmcode lijkt te slagen…', (await ven.vensterCode({ t: t4, code: 'Alarmwrd-91' })).ok);
    let alarm = '';
    try { await inl.inlogInwisselen(i4.id, i4.geheim); } catch (e) { alarm = (e as Error).message; }
    check('…maar het inwisselen faalt stil', alarm === 'AANMELDEN_MISLUKT');
    check('alarmcode: koppelingen uit (zoals in v1)', (await sql('SELECT stand FROM app.tg_koppelingen WHERE id = $1', [kp.id]))[0].stand === 'uitgeschakeld');
    // terug naar een werkende toestand voor de volgende stappen (alleen in de test)
    await sql("UPDATE app.tg_koppelingen SET stand = 'actief', reden = '' WHERE id = $1", [kp.id]);
    await sql("UPDATE app.tg_geheime_codes SET uitgeschakeld = false, reden = '', mislukt = 0 WHERE user_id = $1", [eigenaar]);

    // ---------------------------------------------------------------- «Це не я» in het venster
    const i5 = await inl.inlogStart('tx-v5', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0');
    await bericht(`/start i_${i5.id}`);
    const t5 = tokenUit(vensterAdres());
    const w5 = await ven.vensterWeigeren({ t: t5, initData: initData(TG) });
    check('«Це не я» in het venster → geweigerd + apparaat geblokkeerd', w5.uitkomst === 'geweigerd'
      && (await inl.inlogStatus(i5.id, i5.geheim)).reden === 'niet-ik' && (await sql('SELECT 1 FROM app.tg_geblokkeerd WHERE user_id = $1 AND sleutel = $2', [eigenaar, 'Firefox/Linux'])).length === 1);

    // ---------------------------------------------------------------- bevestigen van een handeling
    const b1 = await bev.bevestigingAanvragen(eigenaar, 'sessie-v', 'stap-op', { apparaat: 'Chrome/Windows', herkenning: { toestel: 'Chrome 131 · Windows 11', plaats: 'Gent', land: 'BE' } });
    check('aanvraag: venster, code nodig, juist pictogram alleen naar de vragende site', b1.venster === true && b1.codeNodig === true && typeof b1.juist === 'number' && b1.kandidaten?.length === 4);
    const tb1 = tokenUit(vensterAdres());
    check('kaart: knop naar het venster, geen symbool- of «Так»-knoppen', tb1.startsWith('b.') && !knop('s') && !knop('b'));
    const ja = await bev.bevestigingVanBot(`${b1.id}:${kp.id}`, String(TG), true);
    check('oude «Підтвердити»-weg werkt niet voor een vensterverzoek', ja === 'verlopen');
    check('oude symboolknop-weg werkt niet voor een vensterverzoek', (await bev.bevestigingSymbool(`${b1.id}:${kp.id}:${b1.juist}`, String(TG))) === 'verlopen');
    check('juist pictogram → code nodig', (await ven.vensterKiezen({ t: tb1, initData: initData(TG), pos: b1.juist })).uitkomst === 'code');
    check('nog niet bevestigd zonder code', (await bev.bevestigingStatus(eigenaar, 'sessie-v', b1.id)).stand === 'wacht');
    check('juiste code → bevestigd', (await ven.vensterCode({ t: tb1, initData: initData(TG), code: 'Zonbloem-73' })).ok && (await bev.bevestigingStatus(eigenaar, 'sessie-v', b1.id)).stand === 'bevestigd');

    const b2 = await bev.bevestigingAanvragen(eigenaar, 'sessie-v', 'stap-op', { apparaat: 'Chrome/Windows' });
    const tb2 = tokenUit(vensterAdres());
    check('verkeerd pictogram bij bevestigen → geweigerd', (await ven.vensterKiezen({ t: tb2, pos: ((b2.juist ?? 0) + 1) % 4 })).uitkomst === 'fout-symbool' && (await bev.bevestigingStatus(eigenaar, 'sessie-v', b2.id)).stand === 'geweigerd');
    await sql('UPDATE app.apparaat_voorkeuren SET mislukt = 0 WHERE user_id = $1', [eigenaar]);
    await tik(knop('n'));

    // ---------------------------------------------------------------- fotogeschiedenis
    fotos.fotoCacheWissen();
    fotoUniek = 'AQADfotoEen';
    check('eerste foto bewaard', (await fotos.fotoBijwerken(String(TG), { nu: true })) === 'nieuw' && (await sql('SELECT count(*)::int AS n FROM app.tg_fotos WHERE telegram_id = $1 AND beeld IS NOT NULL', [String(TG)]))[0].n === 1);
    check('zelfde foto: niets nieuws', (await fotos.fotoBijwerken(String(TG), { nu: true })) === 'zelfde');
    fotoUniek = 'AQADfotoTwee';
    check('nieuwe foto: bewaard, de oude blijft', (await fotos.fotoBijwerken(String(TG), { nu: true })) === 'nieuw' && (await sql('SELECT count(*)::int AS n FROM app.tg_fotos WHERE telegram_id = $1', [String(TG)]))[0].n === 2);
    check('koppeling kreeg de nieuwe foto + regel in de geschiedenis, NIET gepauzeerd', (await sql("SELECT k.foto_id, k.stand, (SELECT count(*)::int FROM app.tg_vingerafdruk_historie h WHERE h.koppeling_id = k.id AND h.veld = 'fotoId') AS n FROM app.tg_koppelingen k WHERE k.id = $1", [kp.id]))
      .every((r) => r.foto_id === 'AQADfotoTwee' && r.stand === 'actief' && r.n === 2));
    const gs = await fotos.fotoGeschiedenis(String(TG), 'AQADfotoTwee');
    check('geschiedenis: nieuwste eerst, huidige aangeduid, beelden als data-URL', gs.length === 2 && gs[0].huidig && !gs[1].huidig && gs.every((g) => g.foto.startsWith('data:image/jpeg;base64,')));
    check('gedempt: binnen 10 minuten geen nieuwe oproep', (await fotos.fotoBijwerken(String(TG))) === 'overgeslagen');
    await sql('DELETE FROM app.tg_koppelingen WHERE id = $1', [kp.id]);
    check('ook na ontkoppelen blijven de foto\'s bewaard', (await sql('SELECT count(*)::int AS n FROM app.tg_fotos WHERE telegram_id = $1', [String(TG)]))[0].n === 2);
  } finally {
    await opruimen();
    await sql("UPDATE app.feature_flags SET aan = false, standaard = false WHERE sleutel = 'telegram-aanmelden-v1'");
    sleutels.zetKluisVoorTest(null);
    opslag.registreerVlagBeoordelaar(null);
    nep.close();
    await new Promise((ok) => setTimeout(ok, 50));
  }
  const uit = einde();
  await pool.end?.().catch?.(() => undefined);
  return uit;
}
