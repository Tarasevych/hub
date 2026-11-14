// TELEGRAM-002 — het beveiligde Telegram-venster: aan/uit, de ondertekende verwijzing en de trekking van pictogrammen.
// Apart bestand (geen database-logica van aanmelden/bevestigen) zodat inloggen.ts, bevestigen.ts en venster.ts het allemaal
// kunnen gebruiken zonder kringverwijzing.
//
// Verwijzing: «<soort>.<id>.<telegramId>.<vervaltijd>.<handtekening>»; soort i = aanmelden, b = handeling bevestigen.
// Handtekening = HMAC-SHA256 (sleutel afgeleid uit het webhookgeheim, net als de knoppen) over alle delen, 128 bits.
// ZONDER webhookgeheim staat het venster uit: dan is er geen sterke sleutel, en zonder webhook werkt de bot sowieso niet.
// De verwijzing alleen geeft nooit toegang: de server controleert bovendien dat het verzoek bij deze Telegram hoort, nog open is,
// en (in Telegram zelf) de ondertekende initData van Telegram. In het venster moet het JUISTE pictogram gekozen worden,
// dat alleen op het scherm van de vragende browser staat.
import { createHmac, randomInt } from 'node:crypto';
import { webhookGeheim } from './sleutels';
import { instellingen, sql } from './opslag';
import { gelijk } from './cryptografie';
import { SITE_BASIS } from './berichten';
import { trek } from '../../shared/apparaat-bevestiging/symbolen';

export const VENSTER_VLAG = 'telegram-v2';
/** Aantal pictogrammen in het venster (zoals in de goedgekeurde macquette: 4, raster 2 × 2). */
export const VENSTER_KANDIDATEN = 4;

let vlagCache: { aan: boolean; tot: number } | null = null;
export const vensterCacheWissen = (): void => { vlagCache = null; };
async function vlagAan(): Promise<boolean> {
  if (vlagCache && vlagCache.tot > Date.now()) return vlagCache.aan;
  let aan = false;
  try { const [r] = await sql<{ aan: boolean }>('SELECT aan FROM app.feature_flags WHERE sleutel = $1', [VENSTER_VLAG]); aan = r?.aan === true; } catch { aan = false; }
  vlagCache = { aan, tot: Date.now() + 15_000 };
  return aan;
}

/** Venster aan = vlag telegram-v2 aan + instelling «venster» aan + er is een webhookgeheim (sterke sleutel). */
export async function vensterAan(): Promise<boolean> {
  if (!(await vlagAan())) return false;
  if (!(await instellingen()).venster) return false;
  return !!(await webhookGeheim(false));
}

/** Trekking voor het venster: altijd pictogrammen (eis van de eigenaar: beelden, geen cijfers of letters). */
export const vensterTrekking = (): { soort: 'pictogrammen'; kandidaten: number[]; juist: number } =>
  trek('pictogrammen', VENSTER_KANDIDATEN, randomInt) as { soort: 'pictogrammen'; kandidaten: number[]; juist: number };

export type VensterSoort = 'i' | 'b';
export type VensterToken = { soort: VensterSoort; id: string; tg: string; tot: number };
const TOKEN_RE = /^([ib])\.([A-Za-z0-9_-]{12})\.([0-9]{1,20})\.([0-9]{10})\.([A-Za-z0-9_-]{22})$/;

async function sleutel(): Promise<Buffer | null> {
  const g = await webhookGeheim(false);
  return g ? createHmac('sha256', 'tg-venster-v1').update(g).digest() : null;
}
const teken = (k: Buffer, s: VensterSoort, id: string, tg: string, tot: number): string =>
  createHmac('sha256', k).update(`${s}|${id}|${tg}|${tot}`).digest('base64url').slice(0, 22);

export async function vensterToken(soort: VensterSoort, id: string, tg: string, verlooptOp: Date): Promise<string> {
  const k = await sleutel();
  if (!k) throw new Error('VENSTER_UIT');
  const tot = Math.floor(verlooptOp.getTime() / 1000);
  return `${soort}.${id}.${tg}.${tot}.${teken(k, soort, id, tg, tot)}`;
}
/** Adres van het venster (zelfde pagina in Telegram en in de browser). */
export async function vensterUrl(soort: VensterSoort, id: string, tg: string, verlooptOp: Date, taal: 'uk' | 'nl'): Promise<string> {
  return `${SITE_BASIS()}/api/telegram/venster?t=${encodeURIComponent(await vensterToken(soort, id, tg, verlooptOp))}&taal=${taal}`;
}
/** Leest en controleert een verwijzing; ongeldig of verlopen → null (nooit een uitleg waarom: geen orakel). */
export async function vensterTokenLezen(t: unknown, nuMs = Date.now()): Promise<VensterToken | null> {
  const m = TOKEN_RE.exec(String(t || ''));
  if (!m) return null;
  const k = await sleutel();
  if (!k) return null;
  const [, s, id, tg, totTekst, sig] = m;
  const tot = Number(totTekst);
  if (!gelijk(teken(k, s as VensterSoort, id, tg, tot), sig)) return null;
  if (tot * 1000 < nuMs) return null;
  return { soort: s as VensterSoort, id, tg, tot };
}
