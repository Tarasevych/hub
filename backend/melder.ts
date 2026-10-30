// Melding aan een account vanuit modules zonder toegang tot backend/index.ts (fase 3). index.ts registreert
// zijn notify(); zonder registratie (tests) wordt er alleen gelogd. Optioneel een link (eigen pad of https://*.tarasevych.com),
// die het meldingencentrum als knop toont (bv. «Переглянути зміну» bij «Це були ви?»).
type Melder = (userId: string, email: string, kind: string, title: string, message: string, link?: string) => Promise<unknown>;
let melder: Melder | null = null;
export function registreerMelder(fn: Melder): void { melder = fn; }
/** Alleen een eigen pad of https://(sub.)tarasevych.com zonder gebruikersnaam; anders ''. */
export function meldLink(v: unknown): string {
  const href = String(v || '').trim().slice(0, 300);
  if (!href) return '';
  if (/[\\\s]/.test(href)) return ''; // geen backslash (browsers lezen /\\x als //x) of spaties
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  try {
    const u = new URL(href);
    return u.protocol === 'https:' && !u.username && !u.password && (u.hostname === 'tarasevych.com' || u.hostname.endsWith('.tarasevych.com')) ? u.toString() : '';
  } catch { return ''; }
}
export async function meld(userId: string, kind: string, title: string, message: string, link?: string): Promise<void> {
  try { if (melder) await melder(userId, '', kind, title, message, meldLink(link) || undefined); }
  catch (err) { console.error('[melder] melding mislukt:', (err as Error).message); }
}
