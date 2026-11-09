// TELEGRAM-AANMELDEN v1 — alle cryptografie op één plek (alleen node:crypto).
//
//  • aanmeldvenster: data_check_string (gesorteerde velden zonder hash, «\n»-gescheiden), sleutel = SHA-256(bottoken),
//    HMAC-SHA256, tijdconstante vergelijking, auth_date ≤ 5 minuten oud en niet in de toekomst (60 s speling);
//    hergebruik van dezelfde handtekening wordt door de aanroeper geweigerd (tabel app.tg_eenmalig).
//  • Mini App (WebApp initData): geheime sleutel = HMAC-SHA256(sleutel «WebAppData», bottoken), daarna HMAC over de
//    data_check_string; zelfde versheid en eenmaligheid.
//  • Knoptokens: kort, ondertekend (HMAC-SHA256 met een sleutel afgeleid uit het webhookgeheim), gebonden aan
//    telegram-gebruiker + handeling + verzoek; past in callback_data (≤ 64 bytes). Eenmaligheid in de database.
//  • Geheime code: Argon2id (als deze Node het heeft) anders scrypt N=2^15; per gebruiker een eigen zout + serverpeper.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import * as nodeCrypto from 'node:crypto';

export const VERS_SECONDEN = 5 * 60;
const SPELING_SECONDEN = 60;

export const gelijk = (a: string | Buffer, b: string | Buffer): boolean => {
  const x = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
  const y = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
  if (x.length !== y.length) { timingSafeEqual(x, x); return false; }
  return timingSafeEqual(x, y);
};
export const sha256hex = (v: string | Buffer): string => createHash('sha256').update(v).digest('hex');

export type ControleUitkomst = { ok: boolean; vers: boolean; reden: '' | 'HANDTEKENING_ONGELDIG' | 'VERLOPEN' | 'VELDEN_ONGELDIG'; handtekeningHash: string };

function versheid(authDate: number, nuSec: number): boolean {
  return Number.isFinite(authDate) && authDate > 0 && authDate <= nuSec + SPELING_SECONDEN && nuSec - authDate <= VERS_SECONDEN;
}

/** aanmeldvenster (https://core.telegram.org/widgets/login#checking-authorization). */
export function widgetControle(velden: Record<string, unknown>, botToken: string, nuSec = Math.floor(Date.now() / 1000)): ControleUitkomst {
  const hash = String(velden.hash ?? '');
  if (!botToken || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, vers: false, reden: 'VELDEN_ONGELDIG', handtekeningHash: '' };
  const toegestaan = ['auth_date', 'first_name', 'id', 'last_name', 'photo_url', 'username'];
  const paren = Object.entries(velden).filter(([k, v]) => k !== 'hash' && toegestaan.includes(k) && v !== undefined && v !== null && String(v) !== '')
    .map(([k, v]) => `${k}=${String(v)}`).sort();
  const sleutel = createHash('sha256').update(botToken).digest();
  const verwacht = createHmac('sha256', sleutel).update(paren.join('\n')).digest('hex');
  const ok = gelijk(verwacht, hash);
  const vers = versheid(Number(velden.auth_date), nuSec);
  return { ok, vers, reden: !ok ? 'HANDTEKENING_ONGELDIG' : !vers ? 'VERLOPEN' : '', handtekeningHash: sha256hex(`widget:${hash}`) };
}

/** Mini App initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
export function initDataControle(initData: string, botToken: string, nuSec = Math.floor(Date.now() / 1000)): ControleUitkomst & { gebruiker: Record<string, unknown> | null } {
  const p = new URLSearchParams(String(initData || ''));
  const hash = p.get('hash') || '';
  if (!botToken || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, vers: false, reden: 'VELDEN_ONGELDIG', handtekeningHash: '', gebruiker: null };
  const paren: string[] = [];
  p.forEach((v, k) => { if (k !== 'hash' && k !== 'signature') paren.push(`${k}=${v}`); });
  paren.sort();
  const geheim = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const verwacht = createHmac('sha256', geheim).update(paren.join('\n')).digest('hex');
  const ok = gelijk(verwacht, hash);
  const vers = versheid(Number(p.get('auth_date')), nuSec);
  let gebruiker: Record<string, unknown> | null = null;
  try { gebruiker = JSON.parse(p.get('user') || 'null'); } catch { gebruiker = null; }
  return { ok: ok && !!gebruiker, vers, reden: !ok ? 'HANDTEKENING_ONGELDIG' : !vers ? 'VERLOPEN' : !gebruiker ? 'VELDEN_ONGELDIG' : '', handtekeningHash: sha256hex(`initdata:${hash}`), gebruiker };
}

// ------------------------------------------------------------------------------------------------ knoptokens
// Vorm (≤ 64 bytes): «<a>.<id>.<sig>»  a = één letter van de handeling, id = 12 tekens base64url (verzoek/token-id),
// sig = 16 tekens base64url van HMAC(sleutel, a|id|telegramId|vervaltijd). De vervaltijd en de binding zitten ook in de
// databaserij (app.tg_knoppen); de handtekening voorkomt dat iemand willekeurige id's probeert.
export const KNOP_ACTIES = { i: 'inloggen', n: 'weigeren', b: 'bevestigen', w: 'wijziging-gezien', x: 'wijziging-nee', o: 'ontkoppelen', t: 'taal-uk', l: 'taal-nl', a: 'account-kiezen', r: 'opnieuw', c: 'annuleren' } as const;
export type KnopLetter = keyof typeof KNOP_ACTIES;
export const isKnopLetter = (v: string): v is KnopLetter => Object.prototype.hasOwnProperty.call(KNOP_ACTIES, v);

export function knopSleutel(webhookGeheim: string): Buffer {
  return createHmac('sha256', 'tg-knoppen-v1').update(webhookGeheim).digest();
}
export function knopTekenen(sleutel: Buffer, letter: KnopLetter, id: string, telegramId: string, verlooptOpSec: number): string {
  const sig = createHmac('sha256', sleutel).update(`${letter}|${id}|${telegramId}|${verlooptOpSec}`).digest('base64url').slice(0, 16);
  return `${letter}.${id}.${sig}`;
}
export function knopLezen(data: string): { letter: KnopLetter; id: string; sig: string } | null {
  const m = /^([a-z])\.([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{16})$/.exec(String(data || ''));
  if (!m || !isKnopLetter(m[1])) return null;
  return { letter: m[1], id: m[2], sig: m[3] };
}
export function knopHandtekeningKlopt(sleutel: Buffer, k: { letter: KnopLetter; id: string; sig: string }, telegramId: string, verlooptOpSec: number): boolean {
  const verwacht = createHmac('sha256', sleutel).update(`${k.letter}|${k.id}|${telegramId}|${verlooptOpSec}`).digest('base64url').slice(0, 16);
  return gelijk(verwacht, k.sig);
}
export const nieuweId = (): string => randomBytes(9).toString('base64url'); // 12 tekens
export const nieuwGeheim = (): string => randomBytes(32).toString('base64url');

// ------------------------------------------------------------------------------------------------ geheime code
type Argon2 = (algo: string, p: Record<string, unknown>) => Buffer;
const argon2Sync = (nodeCrypto as unknown as { argon2Sync?: Argon2 }).argon2Sync;
export const ARGON2_BESCHIKBAAR = typeof argon2Sync === 'function';

/** Hash van de geheime code: «argon2id$<zout>$<hash>» of «scrypt$<zout>$<hash>». Nooit de code zelf bewaren of loggen. */
export function codeHashen(code: string, peper: string, zout = randomBytes(16)): string {
  const invoer = Buffer.from(`${code.normalize('NFC')}\u0000${peper}`, 'utf8');
  if (ARGON2_BESCHIKBAAR) {
    const h = argon2Sync!('argon2id', { message: invoer, nonce: zout, parallelism: 1, tagLength: 32, memory: 19456, passes: 2 });
    return `argon2id$${zout.toString('base64url')}$${h.toString('base64url')}`;
  }
  const h = scryptSync(invoer, zout, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${zout.toString('base64url')}$${h.toString('base64url')}`;
}
export function codeKlopt(code: string, peper: string, opgeslagen: string): boolean {
  const [soort, zoutB64, hashB64] = String(opgeslagen || '').split('$');
  if (!zoutB64 || !hashB64) return false;
  const zout = Buffer.from(zoutB64, 'base64url');
  const invoer = Buffer.from(`${String(code ?? '').normalize('NFC')}\u0000${peper}`, 'utf8');
  let h: Buffer;
  if (soort === 'argon2id') {
    if (!ARGON2_BESCHIKBAAR) return false;
    h = argon2Sync!('argon2id', { message: invoer, nonce: zout, parallelism: 1, tagLength: 32, memory: 19456, passes: 2 });
  } else if (soort === 'scrypt') {
    h = scryptSync(invoer, zout, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  } else return false;
  return gelijk(h, Buffer.from(hashB64, 'base64url'));
}

/** Webhookgeheim (X-Telegram-Bot-Api-Secret-Token): 1–256 tekens A-Z a-z 0-9 _ -. */
export const WEBHOOK_GEHEIM_RE = /^[A-Za-z0-9_-]{32,256}$/;
