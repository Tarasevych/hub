// IMAP + SMTP met een APP-WACHTWOORD — een ECHTE cliënt, bewust klein gehouden.
//
// WAAROM. Gmail en Outlook hebben hun eigen OAuth-weg; iCloud, Ukr.net, Yahoo en I.ua kennen voor derden geen OAuth en
// werken uitsluitend met een app-wachtwoord over IMAP/SMTP. Tot vandaag deden hun tegels op «Підключіть свої поштові
// акаунти» niets (een melding «поки не підключається» achter een gewone knop). Dit bestand maakt die vier tegels echt:
//
//   1. KOPPELEN controleert de opgegeven gegevens bij de DIENST ZELF, niet bij ons: aanmelden over IMAPS (LOGIN), de
//      mappen opvragen (LIST) en netjes afmelden (LOGOUT), en daarna ook de verzendkant (SMTP: EHLO, eventueel STARTTLS,
//      AUTH LOGIN, QUIT). Lukt het aanmelden niet, dan wordt er NIETS bewaard en krijgt de mens de echte reden.
//   2. Het app-wachtwoord gaat uitsluitend als AES-256-GCM-envelop de database in (sealWithEnvKey, sleutel
//      MAIL_APP_WACHTWOORD_SLEUTEL_V1, de rij als AAD) — precies zoals het CalDAV-wachtwoord van de agenda
//      (backend/agenda-caldav.ts). Het komt NOOIT terug in een antwoord: `publiek()` hieronder bouwt het antwoord op uit
//      een vaste verzameling velden, dus er is geen pad waarlangs het geheim naar buiten lekt.
//   3. GEEN vrij in te vullen host. De host en poort komen uit de vaste lijst shared/mail-aanbieders.ts. Daarmee bestaat
//      er geen veld waarin iemand een binnenadres (SSRF) kan zetten — anders dan bij CalDAV, waar een eigen adres juist
//      de bedoeling is en de SSRF-controle in backend/veilige-fetch.ts zit.
//
// WAT HIER (NOG) NIET IS: post ophalen en bewaren. Dit is de koppeling en de controle ervan; het binnenhalen van berichten
// loopt bij deze diensten nog niet. Dat staat ook zo op de pagina — geen knop die meer belooft dan de server doet.
import { randomUUID } from 'node:crypto';
import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { error, json } from '../server/platform';
import { herversleutelEnvelop, isGeslotenFout, ontzegel, registreerHerversleutelaar, verzegel } from './sleutelkluis';
import { SLEUTEL_GESLOTEN_CODE, isServerEnvelop } from '../shared/sleutelkluis';
import { getPool } from '../server/platform/pg';
import { denyMutation, rejectForeignOwnerUserId } from './rbac';
import {
  MAIL_AANBIEDERS, MAIL_IMAP_MAX_KOPPELINGEN, geldigMailAdres, mailAanbieder, schoonAppWachtwoord,
  type MailAanbieder, type MailImapKoppelingPubliek, type MailServerAdres,
} from '../shared/mail-aanbieders';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import type { AiRuimte } from '../shared/ai-ruimte';

const sys = () => getPool('systeem');
/** De sleutel waarmee het app-wachtwoord wordt versleuteld. Ontbreekt hij, dan kan er niets gekoppeld worden. */
export const MAIL_IMAP_SLEUTEL_NAAM = 'MAIL_APP_WACHTWOORD_SLEUTEL_V1';
/** AAD van de envelop: aan deze gebruiker, deze rij én deze ruimte gebonden (zelfde gedachte als 0084 bij CalDAV). */
export const mailImapAad = (userId: string, id: string, ruimte: AiRuimte = 'prive') =>
  ruimte === 'technisch' ? `mail-imap|technisch|${userId}|${id}` : `mail-imap|${userId}|${id}`;

export const MAIL_IMAP_TIMEOUT_MS = 15_000;
const MAX_BYTES = 256 * 1024;

type Uitslag<T> = { ok: true; waarde: T } | { ok: false; fout: string };

// ------------------------------------------------------------------------------------------------ praten met een server
type Lijn = { regels: string[]; sluit: () => void; stuur: (tekst: string) => void; wacht: (test: (regel: string) => boolean) => Promise<string> };

/** Eén tekstverbinding met regels, een tijdslimiet en een maximum aan bytes. Geen enkel wachtwoord wordt gelogd. */
function lijnen(socket: Socket | TLSSocket): Lijn {
  const regels: string[] = [];
  let buffer = '';
  let bytes = 0;
  let fout: Error | null = null;
  const wachters: Array<{ test: (regel: string) => boolean; klaar: (regel: string) => void; mis: (f: Error) => void }> = [];
  const mislukken = (f: Error) => { fout = f; for (const w of wachters.splice(0)) w.mis(f); };
  socket.setTimeout(MAIL_IMAP_TIMEOUT_MS, () => mislukken(new Error('TIJD')));
  socket.on('error', () => mislukken(new Error('VERBINDING')));
  socket.on('close', () => mislukken(new Error('VERBINDING')));
  socket.on('data', (stuk: Buffer) => {
    bytes += stuk.length;
    if (bytes > MAX_BYTES) { mislukken(new Error('TE_GROOT')); socket.destroy(); return; }
    buffer += stuk.toString('utf8');
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const regel = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      regels.push(regel);
      for (let i = wachters.length - 1; i >= 0; i -= 1) {
        if (wachters[i].test(regel)) { wachters.splice(i, 1)[0].klaar(regel); break; }
      }
      index = buffer.indexOf('\n');
    }
  });
  return {
    regels,
    sluit: () => { try { socket.destroy(); } catch { /* al dicht */ } },
    stuur: (tekst: string) => { try { socket.write(`${tekst}\r\n`); } catch { mislukken(new Error('VERBINDING')); } },
    wacht: (test) => new Promise<string>((klaar, mis) => {
      if (fout) { mis(fout); return; }
      const al = regels.find(test);
      if (al) { klaar(al); return; }
      wachters.push({ test, klaar, mis });
    }),
  };
}

const foutCode = (gevangen: unknown, soort: 'IMAP' | 'SMTP') => {
  const bericht = gevangen instanceof Error ? gevangen.message : '';
  if (bericht === 'TIJD') return 'MAIL_IMAP_TIJD_OVERSCHREDEN';
  if (bericht === 'GEWEIGERD') return soort === 'SMTP' ? 'MAIL_IMAP_SMTP_GEWEIGERD' : 'MAIL_IMAP_AANMELDEN_GEWEIGERD';
  return 'MAIL_IMAP_VERBINDING_MISLUKT';
};
/** Een IMAP-tekenreeks: aanhalingstekens en backslashes ontsnappen (RFC 3501 §4.3). */
const imapTekst = (waarde: string) => `"${waarde.replace(/([\\"])/g, '\\$1')}"`;

/**
 * ECHTE IMAP-aanmelding: greeting → LOGIN → LIST → LOGOUT. Geeft het aantal mappen terug; nul mappen betekent dat er
 * niets te koppelen valt en wordt als een fout behandeld (anders «gekoppeld» zonder inhoud).
 */
export async function imapAanmelden(adres: MailServerAdres, gebruiker: string, wachtwoord: string): Promise<Uitslag<{ mappen: number }>> {
  let kanaal: Lijn | null = null;
  try {
    const socket = tlsConnect({ host: adres.host, port: adres.poort, servername: adres.host, minVersion: 'TLSv1.2' });
    kanaal = lijnen(socket);
    await new Promise<void>((klaar, mis) => { socket.once('secureConnect', () => klaar()); socket.once('error', () => mis(new Error('VERBINDING'))); });
    await kanaal.wacht((r) => /^\*\s+(OK|PREAUTH)/i.test(r));
    kanaal.stuur(`a1 LOGIN ${imapTekst(gebruiker)} ${imapTekst(wachtwoord)}`);
    const aanmelding = await kanaal.wacht((r) => /^a1\s+(OK|NO|BAD)/i.test(r));
    if (!/^a1\s+OK/i.test(aanmelding)) throw new Error('GEWEIGERD');
    kanaal.stuur('a2 LIST "" "*"');
    await kanaal.wacht((r) => /^a2\s+(OK|NO|BAD)/i.test(r));
    const mappen = kanaal.regels.filter((r) => /^\*\s+LIST\s/i.test(r)).length;
    kanaal.stuur('a3 LOGOUT');
    if (!mappen) throw new Error('GEWEIGERD');
    return { ok: true, waarde: { mappen } };
  } catch (gevangen) {
    return { ok: false, fout: foutCode(gevangen, 'IMAP') };
  } finally {
    kanaal?.sluit();
  }
}

/** ECHTE SMTP-controle: EHLO → (STARTTLS) → AUTH LOGIN → QUIT. Zo weet de mens meteen of hij ook kan VERZENDEN. */
export async function smtpAanmelden(adres: MailServerAdres, gebruiker: string, wachtwoord: string): Promise<Uitslag<true>> {
  let kanaal: Lijn | null = null;
  try {
    let socket: Socket | TLSSocket;
    if (adres.versleuteling === 'tls') {
      socket = tlsConnect({ host: adres.host, port: adres.poort, servername: adres.host, minVersion: 'TLSv1.2' });
      kanaal = lijnen(socket);
      await new Promise<void>((klaar, mis) => { socket.once('secureConnect', () => klaar()); socket.once('error', () => mis(new Error('VERBINDING'))); });
    } else {
      const plat = netConnect({ host: adres.host, port: adres.poort });
      const platKanaal = lijnen(plat);
      await new Promise<void>((klaar, mis) => { plat.once('connect', () => klaar()); plat.once('error', () => mis(new Error('VERBINDING'))); });
      await platKanaal.wacht((r) => /^220[ -]/.test(r));
      platKanaal.stuur('EHLO mijn-ruimte');
      await platKanaal.wacht((r) => /^(250\s|5\d\d)/.test(r));
      platKanaal.stuur('STARTTLS');
      await platKanaal.wacht((r) => /^(220|4\d\d|5\d\d)/.test(r));
      socket = tlsConnect({ socket: plat, servername: adres.host, minVersion: 'TLSv1.2' });
      kanaal = lijnen(socket);
      await new Promise<void>((klaar, mis) => { (socket as TLSSocket).once('secureConnect', () => klaar()); socket.once('error', () => mis(new Error('VERBINDING'))); });
    }
    if (adres.versleuteling === 'tls') await kanaal.wacht((r) => /^220[ -]/.test(r));
    kanaal.stuur('EHLO mijn-ruimte');
    await kanaal.wacht((r) => /^(250\s|5\d\d)/.test(r));
    kanaal.stuur('AUTH LOGIN');
    const vraag = await kanaal.wacht((r) => /^(334|5\d\d)/.test(r));
    if (!/^334/.test(vraag)) throw new Error('GEWEIGERD');
    kanaal.stuur(Buffer.from(gebruiker, 'utf8').toString('base64'));
    await kanaal.wacht((r) => /^(334|5\d\d)/.test(r));
    kanaal.stuur(Buffer.from(wachtwoord, 'utf8').toString('base64'));
    const uitslag = await kanaal.wacht((r) => /^(235|5\d\d|4\d\d)/.test(r));
    kanaal.stuur('QUIT');
    if (!/^235/.test(uitslag)) throw new Error('GEWEIGERD');
    return { ok: true, waarde: true };
  } catch (gevangen) {
    return { ok: false, fout: foutCode(gevangen, 'SMTP') };
  } finally {
    kanaal?.sluit();
  }
}

// ------------------------------------------------------------------------------------------------ opslag
/** Het antwoord wordt uit een VASTE verzameling velden opgebouwd: het geheim kan er dus niet in terechtkomen. */
const publiek = (rij: Record<string, unknown>): MailImapKoppelingPubliek => ({
  id: String(rij.id || ''),
  aanbieder: String(rij.aanbieder || ''),
  adres: String(rij.adres || ''),
  actief: rij.actief !== false,
  mappen: Number(rij.mappen || 0),
  smtpGoed: rij.smtp_goed === true,
  laatstGoedOp: rij.laatst_goed_op ? new Date(String(rij.laatst_goed_op)).getTime() : 0,
  fout: String(rij.fout || ''),
  aangemaaktOp: rij.aangemaakt_op ? new Date(String(rij.aangemaakt_op)).getTime() : 0,
});

export async function mailImapLijst(userId: string, ruimte: AiRuimte): Promise<MailImapKoppelingPubliek[]> {
  const rijen = await sys().query(
    'SELECT id, aanbieder, adres, actief, mappen, smtp_goed, laatst_goed_op, fout, aangemaakt_op FROM app.mail_imap_koppeling WHERE user_id = $1 AND ruimte = $2 ORDER BY aangemaakt_op',
    [userId, ruimte],
  );
  return (rijen.rows as Record<string, unknown>[]).map(publiek);
}

/** Чи ця IMAP-скринька належить користувачеві (будь-яка дані-кімната). Для порога дзвоника. */
export async function mailImapHoortBij(userId: string, id: string): Promise<boolean> {
  if (!userId || !id) return false;
  const rijen = await sys().query('SELECT 1 FROM app.mail_imap_koppeling WHERE user_id = $1 AND id = $2 LIMIT 1', [userId, id]);
  return rijen.rows.length > 0;
}

export type MailImapKoppelUitslag = { ok: true; koppeling: MailImapKoppelingPubliek } | { ok: false; fout: string };

/**
 * Koppelen = eerst ECHT aanmelden, dan pas bewaren. Het app-wachtwoord blijft hier in het geheugen van dit ene verzoek en
 * gaat daarna alleen versleuteld de database in.
 */
/**
 * `vervang` (21.10.2026, «Перепідключити»): staat dit adres al gekoppeld, dan vervangt een GESLAAGDE nieuwe aanmelding het bewaarde
 * app-wachtwoord van DEZELFDE rij (zelfde id, dus dezelfde AAD). Zonder `vervang` blijft het antwoord MAIL_IMAP_AL_GEKOPPELD: een tweede
 * klik op «Підключити» overschrijft nooit stil een werkend wachtwoord. Mislukt de aanmelding, dan blijft de oude rij onaangeroerd.
 */
export async function mailImapKoppelen(userId: string, ruimte: AiRuimte, invoer: { aanbieder: unknown; adres: unknown; wachtwoord: unknown; vervang?: unknown }): Promise<MailImapKoppelUitslag> {
  const dienst = mailAanbieder(invoer.aanbieder);
  if (!dienst || dienst.wijze !== 'imap-app-wachtwoord' || !dienst.imap || !dienst.smtp) return { ok: false, fout: 'MAIL_IMAP_AANBIEDER_ONBEKEND' };
  const adres = geldigMailAdres(invoer.adres);
  if (!adres) return { ok: false, fout: 'MAIL_IMAP_ADRES_ONGELDIG' };
  const wachtwoord = schoonAppWachtwoord(invoer.wachtwoord);
  if (wachtwoord.length < 6) return { ok: false, fout: 'MAIL_IMAP_WACHTWOORD_ONTBREEKT' };

  const bestaand = await mailImapLijst(userId, ruimte);
  const zelfde = bestaand.find((k) => k.adres === adres && k.aanbieder === dienst.id);
  if (bestaand.some((k) => k.adres === adres) && !(zelfde && invoer.vervang === true)) return { ok: false, fout: 'MAIL_IMAP_AL_GEKOPPELD' };
  if (!zelfde && bestaand.length >= MAIL_IMAP_MAX_KOPPELINGEN) return { ok: false, fout: 'MAIL_IMAP_TE_VEEL' };

  const inkomend = await imapAanmelden(dienst.imap, adres, wachtwoord);
  if (!inkomend.ok) return { ok: false, fout: inkomend.fout };
  const uitgaand = await smtpAanmelden(dienst.smtp, adres, wachtwoord);

  const id = zelfde ? zelfde.id : randomUUID();
  let geheim = '';
  // Sleutelkluis (0092): onder de eigen gegevenssleutel zodra de mens die aanzette (open vereist), anders de serversleutel.
  try {
    geheim = await verzegel({ userId, ruimte }, 'app.mail_imap_koppeling', wachtwoord, mailImapAad(userId, id, ruimte), MAIL_IMAP_SLEUTEL_NAAM);
  } catch (e) {
    return { ok: false, fout: isGeslotenFout(e) ? SLEUTEL_GESLOTEN_CODE : 'MAIL_IMAP_SLEUTEL_ONTBREEKT' };
  }
  if (zelfde) {
    await sys().query(
      `UPDATE app.mail_imap_koppeling SET geheim = $4, actief = true, mappen = $5, smtp_goed = $6, fout = $7, laatst_goed_op = now(), bijgewerkt_op = now()
       WHERE user_id = $1 AND ruimte = $2 AND id = $3`,
      [userId, ruimte, id, geheim, inkomend.waarde.mappen, uitgaand.ok, uitgaand.ok ? '' : uitgaand.fout],
    );
  } else await sys().query(
    `INSERT INTO app.mail_imap_koppeling (user_id, id, aanbieder, adres, geheim, ruimte, actief, mappen, smtp_goed, laatst_goed_op, fout)
     VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,now(),$9)`,
    [userId, id, dienst.id, adres, geheim, ruimte, inkomend.waarde.mappen, uitgaand.ok, uitgaand.ok ? '' : uitgaand.fout],
  );
  const [rij] = await mailImapLijst(userId, ruimte).then((lijst) => lijst.filter((k) => k.id === id));
  return rij ? { ok: true, koppeling: rij } : { ok: false, fout: 'MAIL_IMAP_ONBEKEND' };
}

/** Opnieuw controleren met het BEWAARDE wachtwoord: zo ziet de mens of de koppeling nog leeft, zonder iets te typen. */
export async function mailImapControleren(userId: string, ruimte: AiRuimte, id: string): Promise<MailImapKoppelUitslag> {
  const rijen = await sys().query('SELECT aanbieder, adres, geheim FROM app.mail_imap_koppeling WHERE user_id = $1 AND ruimte = $2 AND id = $3', [userId, ruimte, id]);
  const rij = rijen.rows[0] as { aanbieder: string; adres: string; geheim: string } | undefined;
  if (!rij) return { ok: false, fout: 'MAIL_IMAP_ONBEKEND' };
  const dienst = mailAanbieder(rij.aanbieder);
  if (!dienst?.imap || !dienst.smtp) return { ok: false, fout: 'MAIL_IMAP_AANBIEDER_ONBEKEND' };
  let wachtwoord = '';
  try { wachtwoord = await ontzegel({ userId, ruimte }, 'app.mail_imap_koppeling', rij.geheim, mailImapAad(userId, id, ruimte), MAIL_IMAP_SLEUTEL_NAAM); }
  catch (e) { return { ok: false, fout: isGeslotenFout(e) ? SLEUTEL_GESLOTEN_CODE : 'MAIL_IMAP_SLEUTEL_ONTBREEKT' }; }
  const inkomend = await imapAanmelden(dienst.imap, rij.adres, wachtwoord);
  const uitgaand = inkomend.ok ? await smtpAanmelden(dienst.smtp, rij.adres, wachtwoord) : { ok: false as const, fout: '' };
  await sys().query(
    `UPDATE app.mail_imap_koppeling SET mappen = $4, smtp_goed = $5, fout = $6, laatst_goed_op = CASE WHEN $7 THEN now() ELSE laatst_goed_op END, bijgewerkt_op = now()
     WHERE user_id = $1 AND ruimte = $2 AND id = $3`,
    [userId, ruimte, id, inkomend.ok ? inkomend.waarde.mappen : 0, uitgaand.ok, inkomend.ok ? '' : inkomend.fout, inkomend.ok],
  );
  if (!inkomend.ok) return { ok: false, fout: inkomend.fout };
  const [vers] = (await mailImapLijst(userId, ruimte)).filter((k) => k.id === id);
  return vers ? { ok: true, koppeling: vers } : { ok: false, fout: 'MAIL_IMAP_ONBEKEND' };
}

export async function mailImapVerwijderen(userId: string, ruimte: AiRuimte, id: string): Promise<boolean> {
  const uit = await sys().query('DELETE FROM app.mail_imap_koppeling WHERE user_id = $1 AND ruimte = $2 AND id = $3', [userId, ruimte, id]);
  return (uit.rowCount || 0) > 0;
}

// ------------------------------------------------------------------------------------------------ routes
type User = { id: string; status: string; email?: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };

/** De koppelpagina staat op mail, maar het venster kan vanaf de hub geopend zijn: beide diensten mogen erbij. */
const TOEGESTANE_DIENSTEN = ['mail', 'hub'];
const lichaam = (body: unknown) => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});

/** Wat de pagina moet weten om een tegel te tekenen: de dienst, hoe zij koppelt en — eerlijk — wat er ontbreekt. */
export const mailAanbiedersVoorPagina = () => MAIL_AANBIEDERS.map((a: MailAanbieder) => ({
  id: a.id, naam: a.naam, merk: a.merk, onder: a.onder, wijze: a.wijze,
  // Host en poort mogen gezien worden (ze staan in elke handleiding), het geheim niet — dat is er ook niet.
  imap: a.imap ?? null, smtp: a.smtp ?? null, hulp: a.hulp ?? null, hulpAdres: a.hulpAdres ?? '',
  ontbreekt: a.ontbreekt ?? [],
}));

export const createMailImapRoutes = (authorize: Authorize) => {
  const auth = async (ctx: Context) => {
    const uitslag = await authorize(ctx.event, ctx.body);
    if ('errorCode' in uitslag) return null;
    if (!TOEGESTANE_DIENSTEN.includes(uitslag.service) || uitslag.user.status !== 'approved') return null;
    return uitslag;
  };
  const ruimteVan = (userId: string, body: Record<string, unknown>) =>
    gegevensRuimteVeilig(userId, { tabContext: typeof body.tabContext === 'string' ? body.tabContext : null });
  const mutatieGeweigerd = (gebruiker: AuthSuccess, body: unknown) =>
    rejectForeignOwnerUserId(gebruiker.user, body) || denyMutation(gebruiker.user, 'mail.write');

  return {
    'POST /api/owner/mail/imap/aanbieders': [async (ctx: Context) => {
      const gebruiker = await auth(ctx);
      if (!gebruiker) return error('OWNER_MAIL_SESSION_REQUIRED', 403);
      const ruimte = await ruimteVan(gebruiker.user.id, lichaam(ctx.body));
      return json({ ok: true, aanbieders: mailAanbiedersVoorPagina(), koppelingen: await mailImapLijst(gebruiker.user.id, ruimte), ruimte });
    }],
    'POST /api/owner/mail/imap/koppelen': [async (ctx: Context) => {
      const gebruiker = await auth(ctx);
      if (!gebruiker) return error('OWNER_MAIL_SESSION_REQUIRED', 403);
      const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
      if (geweigerd) return geweigerd;
      const body = lichaam(ctx.body);
      const ruimte = await ruimteVan(gebruiker.user.id, body);
      const uitslag = await mailImapKoppelen(gebruiker.user.id, ruimte, { aanbieder: body.aanbieder, adres: body.adres, wachtwoord: body.wachtwoord, vervang: body.vervang === true });
      return uitslag.ok ? json({ ok: true, koppeling: uitslag.koppeling }) : json({ ok: false, fout: uitslag.fout }, 400);
    }],
    'POST /api/owner/mail/imap/controleren': [async (ctx: Context) => {
      const gebruiker = await auth(ctx);
      if (!gebruiker) return error('OWNER_MAIL_SESSION_REQUIRED', 403);
      const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
      if (geweigerd) return geweigerd;
      const body = lichaam(ctx.body);
      const ruimte = await ruimteVan(gebruiker.user.id, body);
      const uitslag = await mailImapControleren(gebruiker.user.id, ruimte, String(body.id || '').slice(0, 120));
      return uitslag.ok ? json({ ok: true, koppeling: uitslag.koppeling }) : json({ ok: false, fout: uitslag.fout }, 400);
    }],
    'POST /api/owner/mail/imap/ontkoppelen': [async (ctx: Context) => {
      const gebruiker = await auth(ctx);
      if (!gebruiker) return error('OWNER_MAIL_SESSION_REQUIRED', 403);
      const geweigerd = mutatieGeweigerd(gebruiker, ctx.body);
      if (geweigerd) return geweigerd;
      const body = lichaam(ctx.body);
      const ruimte = await ruimteVan(gebruiker.user.id, body);
      const weg = await mailImapVerwijderen(gebruiker.user.id, ruimte, String(body.id || '').slice(0, 120));
      return weg ? json({ ok: true }) : error('MAIL_IMAP_KOPPELING_ONBEKEND', 404);
    }],
  };
};

// Sleutelkluis (0092): oude v1-wachtwoorden van déze lade onder de DEK zetten («перешифрувати зараз»).
registreerHerversleutelaar('app.mail_imap_koppeling', async (lade, dek) => {
  const rijen = await sys().query('SELECT id, geheim FROM app.mail_imap_koppeling WHERE user_id = $1 AND ruimte = $2', [lade.userId, lade.ruimte]);
  let gevonden = 0, herversleuteld = 0;
  for (const r of rijen.rows as Array<{ id: string; geheim: string }>) {
    if (!isServerEnvelop(r.geheim)) continue;
    gevonden++;
    try {
      const nieuw = herversleutelEnvelop(dek, r.geheim, mailImapAad(lade.userId, r.id, lade.ruimte), MAIL_IMAP_SLEUTEL_NAAM);
      await sys().query('UPDATE app.mail_imap_koppeling SET geheim = $4, bijgewerkt_op = now() WHERE user_id = $1 AND ruimte = $2 AND id = $3', [lade.userId, lade.ruimte, r.id, nieuw]);
      herversleuteld++;
    } catch { /* blijft v1 */ }
  }
  return { gevonden, herversleuteld };
});
/** Welke koppelingen staan nog onder de serversleutel (voor de pagina)? */
export async function mailImapNogServerSleutel(userId: string, ruimte: AiRuimte): Promise<string[]> {
  const rijen = await sys().query(`SELECT id FROM app.mail_imap_koppeling WHERE user_id = $1 AND ruimte = $2 AND geheim ~ '^v[1-9]\\.'`, [userId, ruimte]); // SEC-002 (geheimen-07): ook v2…v9 (na rotatie) is de serversleutel
  return (rijen.rows as Array<{ id: string }>).map((r) => r.id);
}
