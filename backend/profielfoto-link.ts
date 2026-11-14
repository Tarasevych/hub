// IDENTITEIT-015 (крок «profiel-blokken»): світлина профілю за https-посиланням — сервер сам завантажує зображення.
// Profielfoto via een https-link: de server haalt de afbeelding zelf op.
//
// Чому через сервер: більшість сайтів забороняє браузеру читати їхні зображення з іншого сайту (CORS), тож завантаження в
// браузері майже завжди не вдавалося. Чому це безпечно (SSRF — щоб посилання не змусило сервер звернутися до внутрішньої мережі):
//   • лише https, без логіна й пароля в адресі, лише стандартний порт, до 2048 символів;
//   • адреса перевіряється в момент з'єднання (backend/veilige-fetch.ts, pinnedFetch: DNS-pinning — приватні, локальні,
//     службові адреси 127.*, 10.*, 169.254.* тощо відхиляються навіть після підміни DNS);
//   • без переадресацій (3xx — відмова з поясненням), межа часу 10 с, межа розміру 8 МБ (і заявлена, і фактична);
//   • тип визначається за ПЕРШИМИ БАЙТАМИ файлу (JPEG, PNG, WebP), а не лише за заголовком сервера;
//   • ліміт запитів на обліковий запис (у маршруті), аудит з іменем хоста (без повної адреси).
// Сервер нічого не зберігає: він повертає байти браузеру, той показує попередній перегляд, зменшує до 512×512 і надсилає
// звичайним POST /api/owner/profile/photo (там ще раз перевіряються тип і розмір).
import { pinnedFetch } from './veilige-fetch';

export const FOTO_LINK_MAX_BYTES = 8 * 1024 * 1024;
export const FOTO_LINK_TIMEOUT_MS = 10_000;
export type FotoLinkFout = 'FOTO_LINK_ONGELDIG' | 'FOTO_LINK_GEWEIGERD' | 'FOTO_LINK_TE_GROOT' | 'FOTO_LINK_GEEN_AFBEELDING' | 'FOTO_LINK_OMLEIDING' | 'FOTO_LINK_ONBEREIKBAAR';
type Ophaler = (url: string) => Promise<Response>;

const standaardOphaler: Ophaler = (url) => pinnedFetch(url, { headers: { Accept: 'image/jpeg,image/png,image/webp' } }, FOTO_LINK_TIMEOUT_MS, FOTO_LINK_MAX_BYTES, 'FOTO_LINK_TE_GROOT');
let ophaler: Ophaler = standaardOphaler;
/** Alleen voor tests: een nep-aanbieder in plaats van het netwerk. Zonder argument terug naar het echte pinnedFetch. */
export function zetFotoOphalerVoorTests(f?: Ophaler): void { ophaler = f || standaardOphaler; }

/** Перевірка адреси до будь-якого з'єднання. Повертає нормалізовану адресу або код відмови. */
export function fotoLinkControleren(invoer: unknown): { ok: true; url: string; host: string } | { ok: false; code: FotoLinkFout } {
  const ruw = typeof invoer === 'string' ? invoer.trim() : '';
  if (!ruw || ruw.length > 2048 || /[\u0000- \u007f]/.test(ruw)) return { ok: false, code: 'FOTO_LINK_ONGELDIG' };
  let u: URL;
  try { u = new URL(ruw); } catch { return { ok: false, code: 'FOTO_LINK_ONGELDIG' }; }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) return { ok: false, code: 'FOTO_LINK_ONGELDIG' };
  // Lege poort = 443. Een andere poort is geen afbeelding van een gewone site en zou de server poorten laten aftasten.
  if (u.port && u.port !== '443') return { ok: false, code: 'FOTO_LINK_GEWEIGERD' };
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) return { ok: false, code: 'FOTO_LINK_GEWEIGERD' };
  u.hash = '';
  return { ok: true, url: u.toString(), host };
}

/** Тип зображення за першими байтами; '' — не JPEG/PNG/WebP. */
export function afbeeldingSoort(b: Uint8Array): '' | 'image/jpeg' | 'image/png' | 'image/webp' {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && Buffer.from(b.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(b.subarray(8, 12)).toString('ascii') === 'WEBP') return 'image/webp';
  return '';
}

/** Haalt de afbeelding op. Nooit een uitzondering naar buiten: altijd een uitslag met code. */
export async function fotoVanLink(invoer: unknown): Promise<{ ok: true; host: string; mimeType: string; data: string; bytes: number } | { ok: false; host: string; code: FotoLinkFout }> {
  const c = fotoLinkControleren(invoer);
  if (!c.ok) return { ok: false, host: '', code: c.code };
  let antwoord: Response;
  try { antwoord = await ophaler(c.url); } catch (e) {
    const m = e instanceof Error ? e.message : '';
    const code: FotoLinkFout = m === 'SSRF_ADRES_GEWEIGERD' ? 'FOTO_LINK_GEWEIGERD' : m === 'FOTO_LINK_TE_GROOT' || m === 'REMOTE_RESPONSE_TOO_LARGE' ? 'FOTO_LINK_TE_GROOT' : m === 'REMOTE_URL_INVALID' ? 'FOTO_LINK_ONGELDIG' : 'FOTO_LINK_ONBEREIKBAAR';
    return { ok: false, host: c.host, code };
  }
  if (antwoord.status >= 300 && antwoord.status < 400) return { ok: false, host: c.host, code: 'FOTO_LINK_OMLEIDING' };
  if (antwoord.status !== 200) return { ok: false, host: c.host, code: 'FOTO_LINK_ONBEREIKBAAR' };
  const bytes = new Uint8Array(await antwoord.arrayBuffer());
  if (bytes.length > FOTO_LINK_MAX_BYTES) return { ok: false, host: c.host, code: 'FOTO_LINK_TE_GROOT' };
  const soort = afbeeldingSoort(bytes);
  if (!soort) return { ok: false, host: c.host, code: 'FOTO_LINK_GEEN_AFBEELDING' };
  return { ok: true, host: c.host, mimeType: soort, data: Buffer.from(bytes).toString('base64'), bytes: bytes.length };
}
