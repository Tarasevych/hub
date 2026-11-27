// MAIL-IMAP-LEZEN-001 (15.11.2026): de lijst en het lezen van berichten uit een IMAP-mailbox (Ukr.net, I.ua, iCloud, Yahoo …).
//
// WAAROM (klacht van de eigenaar, 15.11.2026, telefoon): «коли я переключаюся між підключеним обліковим записом мені просто відкривається
// оця сторінка поштових підключень замість того щоб переключитися на обліковий запис». IMAP-koppelingen werden wel bewaard en gecontroleerd
// (backend/mail-imap.ts), maar er was geen enkele weg om de berichten te LEZEN.
//
// ONTWERP — privacy eerst (projectregel: ruimtes geïsoleerd en versleuteld, ook de servereigenaar mag niets kunnen lezen):
//   • NIETS wordt opgeslagen. Elke vraag opent één TLS-verbinding, meldt aan met het app-wachtwoord dat ALLEEN via de sleutelkluis
//     van de gebruiker (ontzegel, AAD per gebruiker/rij/ruimte) wordt geopend, leest en sluit. Geen kopie van berichten in de database,
//     geen cache op schijf, geen logregel met inhoud, onderwerp of adres.
//   • Alleen-lezen: EXAMINE (niet SELECT) en BODY.PEEK — het lezen hier zet bij de dienst zelfs geen «gelezen»-vlag.
//   • Alleen tekst terug naar de browser: HTML wordt tot platte tekst teruggebracht (geen scripts, geen externe beelden, geen
//     volgpixels). Bijlagen worden alleen bij naam en grootte genoemd.
//   • Vaste grenzen: maximaal 50 berichten per pagina, 2 MB per bericht, 15 s per verbinding.
// Українською: листи IMAP-скриньки читаються «наживо» з сервісу, нічого не зберігається на сервері сайту; пароль застосунку
// відкривається лише ключем користувача (сховище ключів), лише читання.
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { getPool } from '../server/platform/pg';
import { isGeslotenFout, ontzegel } from './sleutelkluis';
import { SLEUTEL_GESLOTEN_CODE } from '../shared/sleutelkluis';
import { mailAanbieder, type MailServerAdres } from '../shared/mail-aanbieders';
import { MAIL_IMAP_SLEUTEL_NAAM, MAIL_IMAP_TIMEOUT_MS, mailImapAad } from './mail-imap';
import type { AiRuimte } from '../shared/ai-ruimte';
import { imapBerichtUitBron, imapKopUitBron, type ImapBericht, type ImapKop } from '../shared/mail-imap-mime';

export const IMAP_PAGINA_MAX = 50;
const MAX_BERICHT_BYTES = 2 * 1024 * 1024;
const MAX_LIJST_BYTES = 1024 * 1024;

const sys = () => getPool('systeem');

export type Kanaal = { opdracht: (tekst: string, max: number) => Promise<string>; sluit: () => void };
export type KanaalOpener = (adres: MailServerAdres) => Promise<Kanaal>;

/** Status (OK/NO/BAD) van de getagde slotregel, of undefined zolang die er niet is. Loopt regel voor regel en springt over
 *  literals {n} (n BYTES; tekst is latin1 = 1 teken per byte), zodat inhoud van een bericht nooit als slotregel geldt. */
export function slotStatus(tekst: string, tag: string): string | undefined {
  let pos = 0;
  let regelBegin = true;
  for (;;) {
    const eind = tekst.indexOf('\r\n', pos);
    if (eind < 0) return undefined;
    const regel = tekst.slice(pos, eind);
    if (regelBegin) {
      const m = /^(\S+) (OK|NO|BAD)\b/i.exec(regel);
      if (m && m[1] === tag) return m[2].toUpperCase();
    }
    const lit = /\{(\d+)\}$/.exec(regel);
    if (lit) { pos = eind + 2 + Number(lit[1]); regelBegin = false; if (pos > tekst.length) return undefined; }
    else { pos = eind + 2; regelBegin = true; }
  }
}

/** Eén IMAP-verbinding op BYTEniveau (latin1), zodat literals {n} exact kloppen. Antwoord = alles tot de getagde slotregel.
 *  `ca` bestaat ALLEEN voor tests (eigen testcertificaat als extra vertrouwensanker); de certificaatcontrole blijft altijd aan
 *  (geen rejectUnauthorized:false). Productie roept openKanaal(adres) aan zonder `ca` → standaard vertrouwde CA's van Node. */
export async function openKanaal(adres: MailServerAdres, test?: { ca?: string | Buffer }): Promise<Kanaal> {
  const socket: TLSSocket = tlsConnect({ host: adres.host, port: adres.poort, servername: adres.host, minVersion: 'TLSv1.2', ...(test?.ca ? { ca: test.ca } : {}) });
  let buffer = Buffer.alloc(0);
  let fout: Error | null = null;
  let wachter: (() => void) | null = null;
  const prik = () => { const w = wachter; wachter = null; w?.(); };
  socket.setTimeout(MAIL_IMAP_TIMEOUT_MS, () => { fout = new Error('TIJD'); socket.destroy(); prik(); });
  socket.on('error', () => { fout ??= new Error('VERBINDING'); prik(); });
  socket.on('close', () => { fout ??= new Error('VERBINDING'); prik(); });
  socket.on('data', (stuk: Buffer) => { buffer = Buffer.concat([buffer, stuk]); prik(); });
  await new Promise<void>((klaar, mis) => { socket.once('secureConnect', () => klaar()); socket.once('error', () => mis(new Error('VERBINDING')));
    // Sluiten (ook na de tijdslimiet) vóór de TLS-handdruk: anders bleef deze belofte voor altijd hangen.
    socket.once('close', () => mis(fout ?? new Error('VERBINDING'))); });
  const wachtOp = async (klaarAls: (tekst: string) => boolean, max: number): Promise<string> => {
    for (;;) {
      const tekst = buffer.toString('latin1');
      if (klaarAls(tekst)) { buffer = Buffer.alloc(0); return tekst; }
      if (buffer.length > max) { socket.destroy(); throw new Error('TE_GROOT'); }
      if (fout) throw fout;
      await new Promise<void>((r) => { wachter = r; });
    }
  };
  await wachtOp((t) => /^\*\s+(OK|PREAUTH)[^\r\n]*\r\n/i.test(t), 64 * 1024);
  let teller = 0;
  return {
    opdracht: async (tekst, max) => {
      const tag = `m${(teller += 1)}`;
      socket.write(`${tag} ${tekst}\r\n`);
      // Literal-bewust: een getagde slotregel BINNEN een literal {n} (bv. een mail die «m3 OK» bevat) telt niet als einde.
      const uit = await wachtOp((t) => slotStatus(t, tag) !== undefined, max);
      if (slotStatus(uit, tag) !== 'OK') throw new Error(tekst.startsWith('LOGIN') ? 'GEWEIGERD' : 'IMAP_NEE');
      return uit;
    },
    // end() spoelt LOGOUT echt naar de server (write()+destroy() gooide het weg); daarna hard dicht na uiterlijk 1 s.
    sluit: () => { try { socket.end('z LOGOUT\r\n'); } catch { /* dicht */ } setTimeout(() => { try { socket.destroy(); } catch { /* dicht */ } }, 1000).unref(); },
  };
}

const imapTekst = (waarde: string) => `"${waarde.replace(/([\\"])/g, '\\$1')}"`;
const foutCode = (gevangen: unknown) => {
  const m = gevangen instanceof Error ? gevangen.message : '';
  return m === 'TIJD' ? 'MAIL_IMAP_TIJD_OVERSCHREDEN' : m === 'GEWEIGERD' ? 'MAIL_IMAP_AANMELDEN_GEWEIGERD' : m === 'TE_GROOT' ? 'MAIL_IMAP_TE_GROOT' : 'MAIL_IMAP_VERBINDING_MISLUKT';
};

type Toegang = { ok: true; adres: string; server: MailServerAdres; wachtwoord: string } | { ok: false; fout: string };

/** Rij van DEZE gebruiker in DEZE ruimte + wachtwoord via de sleutelkluis van de gebruiker. Andermans id → «onbekend». */
async function toegang(userId: string, ruimte: AiRuimte, id: string): Promise<Toegang> {
  const r = await sys().query('SELECT aanbieder, adres, geheim, actief FROM app.mail_imap_koppeling WHERE user_id = $1 AND ruimte = $2 AND id = $3', [userId, ruimte, id]);
  const rij = r.rows[0] as { aanbieder: string; adres: string; geheim: string; actief: boolean } | undefined;
  if (!rij || rij.actief === false) return { ok: false, fout: 'MAIL_IMAP_ONBEKEND' };
  const dienst = mailAanbieder(rij.aanbieder);
  if (!dienst?.imap) return { ok: false, fout: 'MAIL_IMAP_AANBIEDER_ONBEKEND' };
  try {
    const wachtwoord = await ontzegel({ userId, ruimte }, 'app.mail_imap_koppeling', rij.geheim, mailImapAad(userId, id, ruimte), MAIL_IMAP_SLEUTEL_NAAM);
    return { ok: true, adres: rij.adres, server: dienst.imap, wachtwoord };
  } catch (e) {
    return { ok: false, fout: isGeslotenFout(e) ? SLEUTEL_GESLOTEN_CODE : 'MAIL_IMAP_SLEUTEL_ONTBREEKT' };
  }
}

export type ImapLijstUitslag = { ok: true; adres: string; totaal: number; berichten: ImapKop[] } | { ok: false; fout: string };
export type ImapLeesUitslag = { ok: true; bericht: ImapBericht } | { ok: false; fout: string };

// Een wachtwoord of adres met CR/LF/NUL kan in een IMAP-quoted string niet bestaan en zou een tweede opdracht kunnen injecteren.
const veiligVoorImap = (w: string) => !/[\r\n\0]/.test(w);
const login = (adres: string, wachtwoord: string) => `LOGIN ${imapTekst(adres)} ${imapTekst(wachtwoord)}`;

/** Kern van de lijst, los van database en sleutelkluis (ook direct getest tegen een nep-IMAP-server). */
export async function leesInboxLijst(server: MailServerAdres, adres: string, wachtwoord: string, pagina = 0, aantal = 25, open: KanaalOpener = openKanaal): Promise<ImapLijstUitslag> {
  if (!veiligVoorImap(adres) || !veiligVoorImap(wachtwoord)) return { ok: false, fout: 'MAIL_IMAP_AANMELDEN_GEWEIGERD' };
  const n = Math.max(1, Math.min(IMAP_PAGINA_MAX, Math.floor(aantal) || 25));
  const p = Math.max(0, Math.floor(pagina) || 0);
  let kanaal: Kanaal | null = null;
  try {
    kanaal = await open(server);
    await kanaal.opdracht(login(adres, wachtwoord), 64 * 1024);
    const ex = await kanaal.opdracht('EXAMINE INBOX', 64 * 1024);
    const totaal = Number(ex.match(/\*\s+(\d+)\s+EXISTS/i)?.[1] || 0);
    const tot = totaal - p * n;
    if (tot < 1) return { ok: true, adres, totaal, berichten: [] };
    const van = Math.max(1, tot - n + 1);
    const bron = await kanaal.opdracht(`FETCH ${van}:${tot} (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE CONTENT-TYPE)])`, MAX_LIJST_BYTES);
    const berichten = imapKopUitBron(bron).sort((a, b) => b.volgnummer - a.volgnummer);
    return { ok: true, adres, totaal, berichten };
  } catch (gevangen) {
    return { ok: false, fout: foutCode(gevangen) };
  } finally {
    kanaal?.sluit();
  }
}

/** Kern van het lezen van één bericht (BODY.PEEK: zet geen «gelezen»-vlag), los van database en sleutelkluis. */
export async function leesInboxBericht(server: MailServerAdres, adres: string, wachtwoord: string, uid: number, open: KanaalOpener = openKanaal): Promise<ImapLeesUitslag> {
  if (!Number.isSafeInteger(uid) || uid < 1) return { ok: false, fout: 'MAIL_IMAP_ONBEKEND' };
  if (!veiligVoorImap(adres) || !veiligVoorImap(wachtwoord)) return { ok: false, fout: 'MAIL_IMAP_AANMELDEN_GEWEIGERD' };
  let kanaal: Kanaal | null = null;
  try {
    kanaal = await open(server);
    await kanaal.opdracht(login(adres, wachtwoord), 64 * 1024);
    await kanaal.opdracht('EXAMINE INBOX', 64 * 1024);
    const bron = await kanaal.opdracht(`UID FETCH ${uid} (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[])`, MAX_BERICHT_BYTES);
    const bericht = imapBerichtUitBron(bron);
    return bericht ? { ok: true, bericht } : { ok: false, fout: 'MAIL_IMAP_ONBEKEND' };
  } catch (gevangen) {
    return { ok: false, fout: foutCode(gevangen) };
  } finally {
    kanaal?.sluit();
  }
}

/** De nieuwste berichten van INBOX (nieuwste eerst). `pagina` 0 = nieuwste. */
export async function mailImapBerichten(userId: string, ruimte: AiRuimte, id: string, pagina = 0, aantal = 25, open: KanaalOpener = openKanaal): Promise<ImapLijstUitslag> {
  const t = await toegang(userId, ruimte, id);
  if (!t.ok) return t;
  return leesInboxLijst(t.server, t.adres, t.wachtwoord, pagina, aantal, open);
}

/** Eén bericht als tekst (BODY.PEEK: zet geen «gelezen»-vlag). */
export async function mailImapBericht(userId: string, ruimte: AiRuimte, id: string, uid: number, open: KanaalOpener = openKanaal): Promise<ImapLeesUitslag> {
  if (!Number.isSafeInteger(uid) || uid < 1) return { ok: false, fout: 'MAIL_IMAP_ONBEKEND' };
  const t = await toegang(userId, ruimte, id);
  if (!t.ok) return t;
  return leesInboxBericht(t.server, t.adres, t.wachtwoord, uid, open);
}
