// Ruimtes-scheiding (0123, vlag ruimtes-scheiding, standaard UIT). Zie docs/ontwerp/RUIMTES-ISOLATIE.md.
//  • ruimteVanSessie(): DE ruimte van het lopende verzoek, alleen uit de sessie (verzoekcontext) en de database — nooit uit de body.
//  • binding: de technische sessie is met een HMAC gebonden aan de ankersessie van de site (bindingWaarde/bindingKlopt).
//  • antwoordkoppen: Cache-Control: no-store + Vary: Cookie + X-Ruimte op elk /api/-antwoord van een ingelogd verzoek.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { huidigeContext, zetRuimte } from '../server/platform/context';
import { registreerAntwoordNabewerking } from '../server/platform/router';
import { RUIMTE_KOP } from '../shared/ruimte-sleutel';

export const VLAG_SCHEIDING = 'ruimtes-scheiding';
const cache = new Map<string, { tot: number; aan: boolean }>();
export const _scheidingCacheLeeg = () => cache.clear();
/** Vlag ruimtes-scheiding voor deze gebruiker (3 s in het geheugen, fout = UIT = oud gedrag). */
export async function scheidingAan(userId: string | undefined | null): Promise<boolean> {
  if (!userId) return false;
  const c = cache.get(userId), nu = Date.now();
  if (c && c.tot > nu) return c.aan;
  let aan = false;
  try { const { berekenen } = await import('./vlaggen'); aan = (await berekenen({ id: userId } as never, [VLAG_SCHEIDING]))[0]?.value === true; } catch { aan = false; }
  cache.set(userId, { tot: nu + 3000, aan });
  return aan;
}

// ---------------------------------------------------------------- binding (HMAC)
/** Sleutel: RUIMTE_BINDING_SLEUTEL_V1, anders afgeleid van TOTP_ENCRYPTION_KEY_V1 (bestaand servergeheim). Nooit gelogd. */
function bindingSleutel(): Buffer | null {
  const eigen = String(process.env.RUIMTE_BINDING_SLEUTEL_V1 || '').trim();
  if (eigen.length >= 32) return Buffer.from(eigen, 'utf8');
  const basis = String(process.env.TOTP_ENCRYPTION_KEY_V1 || '').trim();
  if (basis.length >= 16) return createHmac('sha256', basis).update('mijn-ruimte-ruimte-binding-v1').digest();
  return null;
}
export const bindingBeschikbaar = (): boolean => bindingSleutel() !== null;
/** HMAC(sleutel, v1|siteSessie|technischeSessie|generatie) als hex, of null zonder sleutel (dan: geen technische ruimte). */
export function bindingWaarde(siteSessieId: string, ruimteSessieId: string, generatie: number): string | null {
  const k = bindingSleutel();
  if (!k || !siteSessieId || !ruimteSessieId) return null;
  return createHmac('sha256', k).update(`v1|${siteSessieId}|${ruimteSessieId}|${Math.trunc(Number(generatie) || 0)}`).digest('hex');
}
/** Vergelijking in constante tijd. */
export function bindingKlopt(opgeslagen: string | null | undefined, siteSessieId: string, ruimteSessieId: string, generatie: number): boolean {
  const verwacht = bindingWaarde(siteSessieId, ruimteSessieId, generatie);
  if (!verwacht || typeof opgeslagen !== 'string' || !/^[0-9a-f]{64}$/.test(opgeslagen)) return false;
  return timingSafeEqual(Buffer.from(opgeslagen, 'hex'), Buffer.from(verwacht, 'hex'));
}

// ---------------------------------------------------------------- de ruimte van het verzoek
export type Ruimte = 'prive' | 'technisch';
/**
 * De ruimte van DIT verzoek: gebruiker, ankersessie en tabblad uit de verzoekcontext (gezet door de sessiecontrole), de rest uit
 * de database (gegevensRuimteVeilig → besluit, met de sessiebinding). Zonder geverifieerde sessie: 'prive'. Eén keer per verzoek.
 */
export async function ruimteVanSessie(): Promise<Ruimte> {
  const c = huidigeContext();
  if (!c?.actor || !c.poort?.geverifieerd) return 'prive';
  if (c.ruimte) return c.ruimte;
  const { gegevensRuimteVeilig } = await import('./ruimte-scheiding');
  const r: Ruimte = (await gegevensRuimteVeilig(c.actor, { tabContext: c.tab ?? null })) === 'technisch' ? 'technisch' : 'prive';
  zetRuimte(r);
  return r;
}

// ---------------------------------------------------------------- antwoordkoppen
/** Elk ingelogd /api/-antwoord: niet opslaan, per cookie verschillend, met de ruimte erbij. Alleen met de vlag aan. */
export function installeerRuimteKoppen(): void {
  registreerAntwoordNabewerking(async (pad, antwoord) => {
    const c = huidigeContext();
    if (!pad.startsWith('/api/') || !c?.actor || !c.poort?.geverifieerd) return antwoord;
    if (!(await scheidingAan(c.actor))) return antwoord;
    const koppen = { ...(antwoord.headers || {}) };
    const vary = String(koppen.Vary || koppen.vary || '');
    delete koppen.vary;
    koppen['Cache-Control'] = 'no-store';
    koppen.Vary = vary ? (/\bcookie\b/i.test(vary) ? vary : `${vary}, Cookie`) : 'Cookie';
    koppen[RUIMTE_KOP] = await ruimteVanSessie().catch(() => 'prive' as const);
    return { ...antwoord, headers: koppen };
  });
}
