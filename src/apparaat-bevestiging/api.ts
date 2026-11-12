// APPARAAT-001 — client voor de routes van «Підтвердження з іншого пристрою» en de poort van de klassieke step-up.
import { api, ApiError } from '../platform/client';
import type { ApparaatInstellingen, ApparaatVoorkeuren, Stand, VerzoekPubliek } from '../../shared/apparaat-bevestiging/model';
import type { VasteSoort } from '../../shared/apparaat-bevestiging/symbolen';

export type Ctx = { service: string; tabContext: string };
export const foutCode = (e: unknown): string => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'NETWORK_ERROR');
export const foutData = (e: unknown): Record<string, unknown> => (e instanceof ApiError && e.response?.data && typeof e.response.data === 'object' ? e.response.data as Record<string, unknown> : {});

const post = async <T>(ctx: Ctx, pad: string, body: Record<string, unknown> = {}): Promise<T> => (await api.post(pad, { ...ctx, ...body })).data as T;
const B = '/api/owner/bevestiging/apparaat';

// ---- A: het vragende apparaat
export const aanvragen = (ctx: Ctx, o: { actie: string; label?: string; gevoelig?: boolean }) => post<VerzoekPubliek>(ctx, `${B}/aanvragen`, o);
export const stand = (ctx: Ctx, id: string) => post<VerzoekPubliek>(ctx, `${B}/stand`, { id });
export const intrekken = (ctx: Ctx, id: string) => post<{ ok: true }>(ctx, `${B}/intrekken`, { id });
// ---- B: het bevestigende apparaat
export type OpenAntwoord = { verzoeken: VerzoekPubliek[]; totp: boolean; geluid: boolean; toonAls: 'venster' | 'melding' };
export const open = (ctx: Ctx) => post<OpenAntwoord>(ctx, `${B}/open`);
export const bekrachtigen = (ctx: Ctx, id: string, keuze: number) => post<{ ok: boolean; stand: Stand; uitkomst?: string }>(ctx, `${B}/bekrachtigen`, { id, keuze });
export const weigeren = (ctx: Ctx, id: string) => post<{ ok: true }>(ctx, `${B}/weigeren`, { id });
// ---- gebruiker
export type Overzicht = {
  vlag: boolean;
  beheer: Pick<ApparaatInstellingen, 'aan' | 'wachtSeconden' | 'aftelSeconden' | 'aftelSecondenGevoelig' | 'symbolenStandaard' | 'aantalKandidaten' | 'totpToegestaan' | 'sterkBijPasskey' | 'telegramSymbolen' | 'levendMinuten' | 'wieMag'>;
  voorkeuren: ApparaatVoorkeuren;
  teller: { mislukt: number; pauzeTot: string | null; uitgeschakeld: boolean; reden: string };
  beschikbaar: boolean; reden: string;
  apparaten: Array<{ laatstGezien: string; dienst: string }>;
  recent: VerzoekPubliek[];
};
export const overzicht = (ctx: Ctx) => post<Overzicht>(ctx, `${B}/overzicht`);
export const voorkeurenOpslaan = (ctx: Ctx, voorkeuren: ApparaatVoorkeuren) => post<{ voorkeuren: ApparaatVoorkeuren }>(ctx, `${B}/voorkeuren`, { voorkeuren });
export const herstellen = (ctx: Ctx) => post<{ ok: true }>(ctx, `${B}/herstellen`);
// ---- beheer
export type BeheerOverzicht = { instellingen: ApparaatInstellingen; cijfers: { dag: number; week: number; bevestigd: number; geweigerd: number; nietIk: number; uitgeschakeldeAccounts: number }; ongedaanMogelijk: boolean };
export const beheerOverzicht = (ctx: Ctx) => post<BeheerOverzicht>(ctx, `${B}/beheer/overzicht`);
export const beheerOpslaan = (ctx: Ctx, instellingen: ApparaatInstellingen) => post<{ instellingen: ApparaatInstellingen }>(ctx, `${B}/beheer/instellingen`, { instellingen });
export const beheerOngedaan = (ctx: Ctx) => post<{ instellingen: ApparaatInstellingen }>(ctx, `${B}/beheer/ongedaan`);
export const beheerNoodUit = (ctx: Ctx) => post<{ instellingen: ApparaatInstellingen }>(ctx, `${B}/beheer/nood-uit`);
// ---- klassieke step-up via de poort van de bevestigingstabel
export type PoortNodig = { actie: string; ontbreekt: string[]; onbeschikbaar: string[]; eis: string[][] };
export const poort = (ctx: Ctx) => post<{ ok: true; stepUp: 'telegram' | 'apparaat' }>(ctx, '/api/owner/access/stap-op/poort');
// ---- Telegram-kanaal voor de klassieke step-up (dienst «stap-op» in de bevestigingstabel)
export type TelegramAangevraagd = { id: string; verlooptOp: string; verstuurd: number; soort?: VasteSoort; kandidaten?: number[]; juist?: number };
export const telegramAanvragen = (ctx: Ctx, actie = 'stap-op') => post<TelegramAangevraagd>(ctx, '/api/owner/telegram/bevestiging/aanvragen', { actie });
export const telegramStatus = (ctx: Ctx, id: string) => post<{ stand: string }>(ctx, '/api/owner/telegram/bevestiging/status', { id });
export const telegramCode = (ctx: Ctx, code: string, actie = 'stap-op') => post<{ ok: boolean; uitkomst: string }>(ctx, '/api/owner/telegram/bevestiging/code', { actie, code });

/**
 * Een route die een VERSE toegangssleutel eist (403 STEP_UP_PASSKEY_REQUIRED): eerst het venster «Підтвердіть доступ» met alleen
 * de toegangssleutel, dan één keer opnieuw. Gebruikt door voorkeuren, herstel, beheer en het bekrachtigen op apparaat B.
 */
export async function metSleutel<T>(ctx: Ctx, fn: () => Promise<T>, toegestaan: Array<'passkey' | 'totp'> = ['passkey'], actie = 'apparaat-instellingen'): Promise<T> {
  try { return await fn(); }
  catch (e) {
    if (foutCode(e) !== 'STEP_UP_PASSKEY_REQUIRED') throw e;
    const { bevestigToegang } = await import('../platform/stap-op');
    const uit = await bevestigToegang({ service: ctx.service, tabContext: ctx.tabContext, post: (u, d) => api.post(u, d), toegestaan, sterk: true, actie });
    if (!uit.ok) throw new Error('PASSKEY_GEANNULEERD');
    return fn();
  }
}
