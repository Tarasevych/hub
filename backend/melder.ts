// Melding aan een account vanuit modules zonder toegang tot backend/index.ts (fase 3). index.ts registreert
// zijn notify(); zonder registratie (tests) wordt er alleen gelogd. Optioneel een link (eigen pad of https://*.tarasevych.com),
// die het meldingencentrum als knop toont (bv. «Переглянути зміну» bij «Це були ви?»).
import type { MeldingVoorkeuren } from '../shared/menu-meldingen-voorkeuren';
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
/**
 * UITROL-001: ongelezen meldingen van een soort sluiten (gelezen zetten) als ze over iets gaan dat al voorbij is — bv. «Оновлення X чекає
 * схвалення» nadat X is geïnstalleerd, afgewezen of gestopt. Zoekt in de titel. index.ts registreert de uitvoering; zonder (tests) gebeurt er niets.
 * Закриває застарілі сповіщення (наприклад, «чекає схвалення» після встановлення), щоб вони не з’являлися знову.
 */
type MeldingenSluiter = (kind: string, zoekInTitel: string) => Promise<number>;
let sluiter: MeldingenSluiter | null = null;
export function registreerMeldingenSluiter(fn: MeldingenSluiter): void { sluiter = fn; }
export async function meldingenSluiten(kind: string, zoekInTitel: string): Promise<number> {
  try { return sluiter ? await sluiter(kind, zoekInTitel) : 0; }
  catch (err) { console.error('[melder] meldingen sluiten mislukt:', (err as Error).message); return 0; }
}
/**
 * IDENTITEIT-014: menuvoorkeuren voor meldingen (sidebar.meldingen, ruimte 'gebruiker') lezen vanuit modules zonder toegang tot
 * index.ts — bv. de waarschuwing «weinig herstelcodes» in toegangslaag.ts. index.ts registreert de lezer; zonder (tests) of bij een
 * fout → undefined, en de aanroeper valt terug op de standaard (beveiligingswaarschuwingen staan standaard AAN).
 * Читання вподобань сповіщень меню для модулів поза index.ts; без читача чи при збої — undefined (типове «увімкнено»).
 */
type MeldingVoorkeurLezer = (userId: string) => Promise<MeldingVoorkeuren | undefined>;
let voorkeurLezer: MeldingVoorkeurLezer | null = null;
export function registreerMeldingVoorkeurLezer(fn: MeldingVoorkeurLezer): void { voorkeurLezer = fn; }
export async function meldingVoorkeurenVan(userId: string): Promise<MeldingVoorkeuren | undefined> {
  try { return voorkeurLezer ? await voorkeurLezer(userId) : undefined; }
  catch (err) { console.error('[melder] voorkeuren lezen mislukt:', (err as Error).message); return undefined; }
}
export async function meld(userId: string, kind: string, title: string, message: string, link?: string): Promise<void> {
  try { if (melder) await melder(userId, '', kind, title, message, meldLink(link) || undefined); }
  catch (err) { console.error('[melder] melding mislukt:', (err as Error).message); }
}
