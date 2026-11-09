// TELEGRAM-AANMELDEN v1 — de geheimen van de bot. Bron: de versleutelde kluis van de EIGENAAR (owner_vault_v1, doel «telegram»,
// AES-256-GCM met OWNER_VAULT_ENCRYPTION_KEY_V1), gezet via het beheerpaneel met toegangssleutel. Terugval: de bestaande
// omgevingsvariabele AANMELD_TELEGRAM_BOT_TOKEN (UI-015), zodat een server die al zo was ingericht blijft werken.
//
// Regels: de waarde verlaat deze module alleen richting bot-api.ts en cryptografie.ts; nooit naar een antwoord, log of
// auditregel (daar staat hoogstens «aanwezig» en de laatste 4 tekens van de bot-id, nooit van het geheime deel).
// Wisselen zonder onderbreking: de nieuwe sleutel wordt eerst als TELEGRAM_AANMELD_BOT_SLEUTEL_NIEUW bewaard, met getMe
// gecontroleerd en pas na succes de actieve; tot dan blijft de oude werken.
import { randomBytes } from 'node:crypto';
import { alsSysteem } from '../../server/platform/context';
import { eigenaarUserId } from '../integraties-kluis';

export const KLUIS = {
  bot: 'TELEGRAM_AANMELD_BOT_SLEUTEL',
  botNieuw: 'TELEGRAM_AANMELD_BOT_SLEUTEL_NIEUW',
  webhook: 'TELEGRAM_AANMELD_WEBHOOK_GEHEIM',
  peper: 'TELEGRAM_AANMELD_PEPER',
} as const;
const DOEL = 'telegram';
const CACHE_MS = 30_000;
const cache = new Map<string, { waarde: string; tot: number }>();

type Kluis = {
  lees: (userId: string, naam: string) => Promise<string>;
  bewaar: (userId: string, naam: string, waarde: string) => Promise<void>;
  wis: (userId: string, naam: string) => Promise<void>;
  eigenaar: () => Promise<string>;
};
const echteKluis: Kluis = {
  lees: async (userId, naam) => {
    const m = await import('../api-platform-kluis');
    return alsSysteem(() => m.readOwnerVaultPlaintext(userId, naam, DOEL as never));
  },
  bewaar: async (userId, naam, waarde) => {
    const m = await import('../api-platform-kluis');
    await alsSysteem(() => m.ownerVaultBewarenIntern(userId, naam, DOEL, 'Telegram-aanmelden', waarde));
  },
  wis: async (userId, naam) => {
    const m = await import('../api-platform-kluis');
    await alsSysteem(() => m.ownerVaultVerwijderenIntern(userId, naam));
  },
  eigenaar: () => eigenaarUserId(),
};
let kluis: Kluis = echteKluis;
/** Alleen voor tests: een kluis in het geheugen. */
export const zetKluisVoorTest = (k: Kluis | null): void => { kluis = k ?? echteKluis; cache.clear(); };
export const sleutelCacheWissen = (): void => cache.clear();

async function lees(naam: string): Promise<string> {
  const c = cache.get(naam);
  if (c && c.tot > Date.now()) return c.waarde;
  let waarde = '';
  try {
    const eigenaar = await kluis.eigenaar();
    if (eigenaar) waarde = String(await kluis.lees(eigenaar, naam)).trim();
  } catch { waarde = ''; }
  cache.set(naam, { waarde, tot: Date.now() + CACHE_MS });
  return waarde;
}
async function bewaar(naam: string, waarde: string): Promise<void> {
  const eigenaar = await kluis.eigenaar();
  if (!eigenaar) throw new Error('EIGENAAR_ONBEKEND');
  await kluis.bewaar(eigenaar, naam, waarde);
  cache.delete(naam);
}

export const BOT_SLEUTEL_RE = /^[0-9]{3,20}:[A-Za-z0-9_-]{30,80}$/;

/** De actieve botsleutel ('' = niet ingesteld). */
export async function botSleutel(): Promise<string> {
  const uitKluis = await lees(KLUIS.bot);
  if (uitKluis) return uitKluis;
  return String(process.env.AANMELD_TELEGRAM_BOT_TOKEN || '').trim();
}
/** Bron van de sleutel voor de beheerweergave (zonder waarde). */
export async function botSleutelBron(): Promise<{ aanwezig: boolean; bron: 'kluis' | 'omgeving' | 'geen'; botId: string; wisselLoopt: boolean }> {
  const k = await lees(KLUIS.bot);
  const env = String(process.env.AANMELD_TELEGRAM_BOT_TOKEN || '').trim();
  const s = k || env;
  return { aanwezig: !!s, bron: k ? 'kluis' : env ? 'omgeving' : 'geen', botId: s ? s.split(':')[0] : '', wisselLoopt: !!(await lees(KLUIS.botNieuw)) };
}
export async function nieuweBotSleutelBewaren(waarde: string): Promise<void> { await bewaar(KLUIS.botNieuw, waarde); }
export async function nieuweBotSleutel(): Promise<string> { return lees(KLUIS.botNieuw); }
/** Na een geslaagde controle: nieuwe sleutel wordt de actieve; de tijdelijke rij verdwijnt. */
export async function botSleutelWisselen(): Promise<void> {
  const nieuw = await lees(KLUIS.botNieuw);
  if (!nieuw) throw new Error('GEEN_NIEUWE_SLEUTEL');
  await bewaar(KLUIS.bot, nieuw);
  const eigenaar = await kluis.eigenaar();
  await kluis.wis(eigenaar, KLUIS.botNieuw).catch(() => undefined);
  cache.clear();
}
export async function nieuweBotSleutelVergeten(): Promise<void> {
  const eigenaar = await kluis.eigenaar();
  if (eigenaar) await kluis.wis(eigenaar, KLUIS.botNieuw).catch(() => undefined);
  cache.delete(KLUIS.botNieuw);
}

/** Geheim voor X-Telegram-Bot-Api-Secret-Token. Wordt bij «Налаштувати бота» aangemaakt als het ontbreekt. */
export async function webhookGeheim(aanmaken = false): Promise<string> {
  const g = await lees(KLUIS.webhook) || String(process.env.TELEGRAM_AANMELD_WEBHOOK_GEHEIM || '').trim();
  if (g || !aanmaken) return g;
  const nieuw = randomBytes(32).toString('base64url');
  await bewaar(KLUIS.webhook, nieuw);
  return nieuw;
}
/** Serverpeper voor de geheime code (nooit in de database naast de hash). */
export async function codePeper(aanmaken = false): Promise<string> {
  const p = String(process.env.TELEGRAM_AANMELD_PEPER || '').trim() || await lees(KLUIS.peper);
  if (p || !aanmaken) return p;
  const nieuw = randomBytes(32).toString('base64url');
  await bewaar(KLUIS.peper, nieuw);
  return nieuw;
}
/** Maskering voor de beheerweergave: alleen «123456789:••••••••». */
export const sleutelMasker = (botId: string): string => (botId ? `${botId}:••••••••••••••••` : '');
