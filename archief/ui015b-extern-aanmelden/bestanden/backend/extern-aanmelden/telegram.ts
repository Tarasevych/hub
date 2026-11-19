// UI-015B — Telegram Login (oauth.telegram.org / Login Widget). Controle volgens core.telegram.org/widgets/login:
// data_check_string = alle velden behalve hash, gesorteerd «sleutel=waarde» met \n; geheime sleutel = SHA256(bot-token);
// hash = hex(HMAC-SHA256(geheime sleutel, data_check_string)). Vergelijking tijdconstant. auth_date maximaal 5 min oud
// (en niet in de toekomst). Hergebruik (replay) wordt in stroom.ts geweigerd via een eenmalige opslag van de hash.
import { createHash, createHmac } from 'node:crypto';
import { gelijk } from './jwt';

export const TELEGRAM_MAX_LEEFTIJD_S = 5 * 60;
const VELDEN = new Set(['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']);
export type TelegramGebruiker = { id: string; naam: string; gebruikersnaam?: string; authDate: number; hash: string };

export function telegramControleren(data: Record<string, unknown>, botToken: string, nuMs = Date.now()): TelegramGebruiker {
  if (!data || typeof data !== 'object') throw new Error('TELEGRAM_DATA_ONGELDIG');
  const velden: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!VELDEN.has(k)) continue; // onbekende velden tellen niet mee (Telegram rekent alleen met zijn eigen velden)
    if (v === undefined || v === null) continue;
    velden[k] = String(v);
  }
  const hash = velden.hash || '';
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('TELEGRAM_HASH_ONGELDIG');
  if (!/^\d{1,20}$/.test(velden.id || '')) throw new Error('TELEGRAM_DATA_ONGELDIG');
  const dcs = Object.keys(velden).filter((k) => k !== 'hash').sort().map((k) => `${k}=${velden[k]}`).join('\n');
  const sleutel = createHash('sha256').update(botToken).digest();
  const verwacht = createHmac('sha256', sleutel).update(dcs).digest('hex');
  if (!gelijk(verwacht, hash)) throw new Error('TELEGRAM_HASH_ONGELDIG');
  const authDate = Number(velden.auth_date);
  const nu = Math.floor(nuMs / 1000);
  if (!Number.isFinite(authDate) || authDate - 60 > nu) throw new Error('TELEGRAM_AUTH_DATE_ONGELDIG');
  if (nu - authDate > TELEGRAM_MAX_LEEFTIJD_S) throw new Error('TELEGRAM_VERLOPEN');
  const naam = [velden.first_name, velden.last_name].filter(Boolean).join(' ').slice(0, 80);
  return { id: velden.id, naam, gebruikersnaam: velden.username?.slice(0, 64), authDate, hash };
}
/** Bot-id = het numerieke deel vóór «:» van het token (openbaar; Telegram gebruikt het als bot_id). */
export const botId = (botToken: string) => (/^(\d{3,20}):/.exec(botToken) || [])[1] || '';
