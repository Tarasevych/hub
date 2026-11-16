// TELEGRAM-002 — foto's als visueel kenmerk bij elk verzoek (eis van de eigenaar 14.11.2026):
//   • de foto van het SITE-account dat iets vraagt (in het beveiligde venster, in de kaart van de bot);
//   • de foto van de TELEGRAM-account waar het verzoek heen ging (op de site, naast de naam).
// Zo ziet de mens in één oogopslag om WELK account het gaat en geeft hij een koppeling of bevestiging niet per vergissing aan een ander.
// Українською: фото облікового запису сайту — у вікні й картці бота; фото Telegram — у запиті на сайті. Немає фото → коло з першою літерою.
import { sql } from './opslag';

const DATA_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

/** Dezelfde regels als safePicture in backend/index.ts: eigen data-URI (≤ 340 kB) of een https-adres bij googleusercontent.com. */
export function veiligeFoto(waarde: unknown): string {
  const ruw = String(waarde || '').trim();
  if (DATA_RE.test(ruw) && ruw.length <= 340000) return ruw;
  try {
    const u = new URL(ruw);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' || u.username || u.password || !(host === 'lh3.googleusercontent.com' || host.endsWith('.googleusercontent.com'))) return '';
    u.hash = '';
    return u.toString();
  } catch { return ''; }
}

export type AccountBeeld = { naam: string; email: string; foto: string; letter: string };

/** Naam, e-mail (gemaskeerd) en foto van een site-account. «Без фото» (geenFoto) → geen foto. Nooit een fout naar buiten. */
export async function accountBeeld(userId: string): Promise<AccountBeeld> {
  const [r] = await sql<{ naam: string | null; email: string | null; foto: string | null; geen: string | null }>(
    "SELECT data->>'name' AS naam, data->>'email' AS email, data->>'picture' AS foto, data->>'geenFoto' AS geen FROM app.records WHERE tbl = 'users' AND id = $1", [userId]).catch(() => []);
  const email = String(r?.email || '');
  const naam = String(r?.naam || email || '').slice(0, 60);
  const [lokaal, domein] = email.split('@');
  const gemaskeerd = lokaal && domein ? `${lokaal.slice(0, 2)}…@${domein}`.slice(0, 80) : '';
  return { naam, email: gemaskeerd, foto: r?.geen === 'true' ? '' : veiligeFoto(r?.foto), letter: ([...naam.trim()][0] || '?').toUpperCase() };
}

/** Voor sendPhoto van de bot: bytes van een eigen foto, of het https-adres (Telegram haalt het zelf op). */
export function fotoVoorBot(foto: string): { inhoud: Buffer; type: string; naam: string } | { url: string } | null {
  const m = DATA_RE.exec(foto);
  if (m) {
    const inhoud = Buffer.from(m[2], 'base64');
    // Telegram: foto ≤ 10 MB; onze eigen foto's zijn ≤ 240 kB. WebP stuurt Telegram als sticker-achtig beeld — dan liever de gewone kaart.
    if (m[1] === 'webp' || inhoud.length < 100) return null;
    return { inhoud, type: `image/${m[1]}`, naam: `account.${m[1] === 'jpeg' ? 'jpg' : m[1]}` };
  }
  return foto.startsWith('https://') ? { url: foto } : null;
}

export type TelegramBeeld = { naam: string; gebruikersnaam: string; foto: string; letter: string };

/** Naam, @naam en de laatst bewaarde profielfoto (klein voorbeeld uit app.tg_fotos) van een gekoppelde Telegram. */
export async function telegramBeeld(k: { telegram_id: string; voornaam?: string | null; achternaam?: string | null; gebruikersnaam?: string | null; foto_id?: string | null }): Promise<TelegramBeeld> {
  const naam = [k.voornaam, k.achternaam].filter(Boolean).join(' ').slice(0, 80) || 'Telegram';
  let foto = '';
  if (k.foto_id) {
    const [f] = await sql<{ beeld: Buffer | null; type: string }>('SELECT beeld, type FROM app.tg_fotos WHERE telegram_id = $1 AND uniek = $2', [k.telegram_id, k.foto_id]).catch(() => []);
    if (f?.beeld && /^image\/(jpeg|png|webp)$/.test(f.type)) foto = `data:${f.type};base64,${Buffer.from(f.beeld).toString('base64')}`;
  }
  return { naam, gebruikersnaam: String(k.gebruikersnaam || '').slice(0, 40), foto, letter: ([...naam.trim()][0] || 'T').toUpperCase() };
}
