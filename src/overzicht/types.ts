// Typen van het live-overzicht: afgeleid van de pure kern op de server (alleen types, geen code in de bundel).
import type { Overzicht, GebruikerHistorie, Gebeurtenis, Punt } from '../../backend/beheer-overzicht-kern';
export type { Overzicht, GebruikerHistorie, Gebeurtenis, Punt };
export type { MomentPunt, Momentopname } from '../../backend/beheer-overzicht-momentopnamen';
export type Lang = 'uk' | 'nl';
export type Context = { service: string; tabContext: string; sourceOrigin: string };
export type Bron = { summary: { users: number; activeSessions: number; rememberedDevices: number; auditEvents: number }; role: string; capabilities: string[]; limitations: Array<string | { uk: string; nl: string }> };
export const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);
