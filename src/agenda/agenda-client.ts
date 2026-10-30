// De agendapagina praat met de server: één laag, zodat Agenda.tsx alleen over het beeld gaat.
//
// Elke SCHRIJVENDE aanroep draagt een idempotentiesleutel mee die HIER wordt gemaakt (crypto.randomUUID, geen
// Math.random): hapert het netwerk en drukt de gebruiker nog eens, dan verandert er niets twee keer. Die sleutel
// is ook het `lokaalId`, waarmee de pagina na een herstart kan opzoeken wat er met haar verzoek gebeurd is
// (POST /api/owner/agenda/lokaal).
import { api } from '../platform/client';
import { hubAuthBody } from '../useCanoniekHubAuth';
import type { AgendaItem, AgendaVorm, Antwoord, Deelnemer } from '../../shared/agenda-model';
import type { CaldavAgenda } from '../../shared/agenda-caldav-model';

export type AgendaRecht = {
  gekoppeld: boolean; lezen: boolean; schrijven: boolean; uitbreidingNodig: boolean;
  toevoegen: string[]; scopes: string[]; uitbreidingRoute: string;
};
export type AgendaKop = { id: string; naam: string; primair: boolean; rol: string; schrijfbaar: boolean; tijdzone: string; kleur: string };
export type IcsRij = { id: string; naam: string; adres: string; actief: boolean; intervalMinuten: number; laatstOp: number; laatstKlaarOp: number; laatsteStaat: string; fout: string; aantal: number };
export type CaldavRij = IcsRij & { gebruikersnaam: string; agendas: CaldavAgenda[]; schrijven: false; schrijvenOntbreekt: readonly (readonly [string, string])[] };
/**
 * GESCHEIDEN GEGEVENSRUIMTES: in welke lade kijkt deze mens (backend/ruimte-cloud-agenda.ts).
 *  ok: true   -> het mag; `ruimte` zegt of dit de persoonlijke of de technische lade is, `gedeeld` of de technische
 *                ruimte bewust de PERSOONLIJKE gegevens gebruikt;
 *  ok: false  -> de dienst staat hier uit, is bevroren, of er is nog niets gekozen. `uitleg` zegt in beide talen
 *                WAAROM, zodat de pagina dat kan laten zien in plaats van leeg te blijven.
 */
export type AgendaRuimte =
  | { ok: true; ruimte: 'prive' | 'technisch'; stand: string; gedeeld: boolean; dienst: string; naam: { uk: string; nl: string }; uitleg: { uk: string; nl: string } }
  | { ok: false; dienst: string; dienstNaam?: { uk: string; nl: string }; code: string; uitleg: { uk: string; nl: string } };
export type AgendaOverzicht = {
  observedAt: number;
  ruimte?: AgendaRuimte;
  toegang: AgendaRecht;
  agendas: AgendaKop[];
  standaardTijdzone: string;
  items: AgendaItem[];
  begrensd: boolean;
  abonnementen: { ics: IcsRij[]; caldav: CaldavRij[]; grenzen: { icsSchemas: string[]; icsMaxBytes: number; icsTimeoutMs: number; icsMinMinuten: number; icsIntervalKeuzes: number[] } };
  caldavSchrijvenOntbreekt: readonly (readonly [string, string])[];
  /** Per aanbieder wat vandaag werkelijk kan, en bij alles wat niet kan de reden. */
  mogelijkheden: Record<string, Record<string, unknown>>;
  agendasFout?: string;
};
export type SchrijfUitslag = {
  ok: boolean; uitslag: string; fout?: string; gebeurtenisId?: string; agendaId?: string; etag?: string;
  google?: AgendaVorm; koppeling?: string; uitbreiding?: { nodig: boolean; scope: string };
};

const post = <T,>(pad: string, body: Record<string, unknown> = {}) => api.post(pad, hubAuthBody(body)).then((r) => r.data as T);
/** Eén sleutel per schrijfactie. Niet Math.random: dit moet uniek zijn, niet «willekeurig genoeg». */
export const nieuweSleutel = () => {
  const ruw = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  return ruw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);
};

export const laadOverzicht = () => post<AgendaOverzicht>('/api/owner/agenda/overzicht');
export const synchroniseer = (forceren = false) => post<Record<string, unknown>>('/api/owner/agenda/synchroniseren', { forceren });
export const startUitbreiding = () => post<{ ok: boolean; authUrl?: string; alGegeven?: boolean; scopes?: string[] }>(
  '/api/owner/agenda/toegang/uitbreiden', { locale: document.documentElement.lang === 'nl' ? 'nl' : 'uk', returnTo: location.href, sourceOrigin: location.origin });
export const leesGebeurtenis = (agendaId: string, gebeurtenisId: string) =>
  post<{ ok: boolean; vorm?: AgendaVorm; fout?: string }>('/api/owner/agenda/gebeurtenis', { agendaId, gebeurtenisId });

export const maakGebeurtenis = (sleutel: string, vorm: AgendaVorm, meldDeelnemers: string) =>
  post<SchrijfUitslag>('/api/owner/agenda/gebeurtenis/aanmaken', { idempotentieSleutel: sleutel, lokaalId: sleutel, vorm, meldDeelnemers });
export const wijzigGebeurtenis = (sleutel: string, vorm: AgendaVorm, meldDeelnemers: string, negeerVersie = false) =>
  post<SchrijfUitslag>('/api/owner/agenda/gebeurtenis/wijzigen', {
    idempotentieSleutel: sleutel, agendaId: vorm.agendaId, gebeurtenisId: vorm.gebeurtenisId, etag: vorm.etag, vorm, meldDeelnemers, negeerVersie });
export const verplaatsGebeurtenis = (sleutel: string, agendaId: string, gebeurtenisId: string, naarAgendaId: string, etag: string) =>
  post<SchrijfUitslag>('/api/owner/agenda/gebeurtenis/verplaatsen', { idempotentieSleutel: sleutel, agendaId, gebeurtenisId, naarAgendaId, etag });
export const wisGebeurtenis = (sleutel: string, agendaId: string, gebeurtenisId: string, etag: string, meldDeelnemers: string) =>
  post<SchrijfUitslag>('/api/owner/agenda/gebeurtenis/verwijderen', { idempotentieSleutel: sleutel, agendaId, gebeurtenisId, etag, meldDeelnemers });
export const zetDeelnemers = (sleutel: string, agendaId: string, gebeurtenisId: string, etag: string, toevoegen: Deelnemer[], verwijderen: Deelnemer[]) =>
  post<SchrijfUitslag>('/api/owner/agenda/gebeurtenis/deelnemers', { idempotentieSleutel: sleutel, agendaId, gebeurtenisId, etag, toevoegen, verwijderen });
export const antwoordGebeurtenis = (sleutel: string, agendaId: string, gebeurtenisId: string, etag: string, antwoord: Antwoord) =>
  post<SchrijfUitslag>('/api/owner/agenda/gebeurtenis/antwoord', { idempotentieSleutel: sleutel, agendaId, gebeurtenisId, etag, antwoord });

export const icsToevoegen = (adres: string, naam: string, intervalMinuten: number) =>
  post<{ ok: boolean; fout?: string; abonnement?: IcsRij; haal?: { staat: string; aantal: number; fout: string } }>('/api/owner/agenda/ics/toevoegen', { adres, naam, intervalMinuten });
export const icsVernieuwen = (id = '') => post<Record<string, unknown>>('/api/owner/agenda/ics/vernieuwen', { id });
export const icsSchakelen = (id: string, actief: boolean, intervalMinuten?: number) => post<Record<string, unknown>>('/api/owner/agenda/ics/schakelen', { id, actief, intervalMinuten });
export const icsVerwijderen = (id: string) => post<Record<string, unknown>>('/api/owner/agenda/ics/verwijderen', { id });
export const caldavKoppelen = (adres: string, gebruikersnaam: string, wachtwoord: string, naam: string) =>
  post<{ ok: boolean; fout?: string; account?: CaldavRij; haal?: { staat: string; aantal: number; fout: string } }>('/api/owner/agenda/caldav/koppelen', { adres, gebruikersnaam, wachtwoord, naam });
export const caldavVernieuwen = (id = '') => post<Record<string, unknown>>('/api/owner/agenda/caldav/vernieuwen', { id });
export const caldavVerwijderen = (id: string) => post<Record<string, unknown>>('/api/owner/agenda/caldav/verwijderen', { id });
