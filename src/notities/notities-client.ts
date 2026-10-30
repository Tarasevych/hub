// De browserkant van /api/notities/* (backend/notities-vnext.ts). Elke aanroep draagt dienst + tabblad mee, net als het bord:
// de server kiest de lade (prive/technisch) uit het TABBLAD, nooit uit wat de pagina zegt.
import { api, ApiError } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import { ruimteFeitenUit, ruimteGeslotenUit, type RuimteFeiten, type RuimteGesloten } from '../../shared/ruimte-weergave';
import type { Notitie, NotitieInvoer, NotitieKleur, NotitieMap, NotitieRevisie, NotitieSoort, Weergave } from '../../shared/notities-vnext-model';

const body = (extra: Record<string, unknown> = {}) => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin, ...extra });

export type LijstAntwoord = { notities: Notitie[]; totaal: number; offset: number; limiet: number; volgende: number | null; telling: Record<Weergave, number>; mappen: NotitieMap[]; etiketten: Array<{ etiket: string; aantal: number }>; ruimte: RuimteFeiten | null };
export type LijstFilter = { weergave: Weergave; mapId: string | null; etiket: string; vraag: string; soort: NotitieSoort | ''; kleur: NotitieKleur | ''; offset?: number; limiet?: number };
export type ImportItemUit = { titel: string; inhoud: string; soort: NotitieSoort; kleur: NotitieKleur; etiketten: string[]; bestand: string; vingerafdruk: string; dubbel: 'bestaand' | 'in-import' | '' };
export type ImportFoutUit = { bestand: string; fout: string };
export type ImportVoorbeeldUit = { items: ImportItemUit[]; fouten: ImportFoutUit[]; bestanden: number; nieuw: number; dubbel: number };

/** Een fout van de server, met als het even kan de code (bv. VERSIE_VEROUDERD) en de gegevens (bv. de huidige notitie). */
export class NotitiesFout extends Error {
  constructor(public code: string, public status: number, public data: any, public gesloten: RuimteGesloten | null) { super(code); this.name = 'NotitiesFout'; }
}
async function roep<T>(pad: string, data: Record<string, unknown> = {}): Promise<T> {
  try { const r = await api.post(pad, body(data)); return r.data as T; }
  catch (e) {
    if (e instanceof ApiError) throw new NotitiesFout(e.message || `HTTP_${e.status}`, e.status, e.response?.data, ruimteGeslotenUit(e.response?.data));
    throw new NotitiesFout(String((e as Error)?.message || 'FOUT'), 0, null, null);
  }
}

export const notitiesClient = {
  lijst: async (f: LijstFilter): Promise<LijstAntwoord> => { const d = await roep<any>('/api/notities/lijst', f); return { ...d, ruimte: ruimteFeitenUit(d) }; },
  een: (id: string) => roep<{ notitie: Notitie }>('/api/notities/een', { id }).then((d) => d.notitie),
  nieuw: (invoer: NotitieInvoer) => roep<{ notitie: Notitie }>('/api/notities/nieuw', invoer).then((d) => d.notitie),
  wijzig: (id: string, versie: number | null, patch: Partial<NotitieInvoer>) => roep<{ notitie: Notitie }>('/api/notities/wijzig', { id, versie, ...patch }).then((d) => d.notitie),
  actie: (id: string, actie: 'vast' | 'losmaken' | 'archief' | 'uit-archief' | 'prullenbak' | 'herstel' | 'definitief') => roep<{ notitie: Notitie }>('/api/notities/actie', { id, actie }).then((d) => d.notitie),
  revisies: (id: string) => roep<{ revisies: NotitieRevisie[] }>('/api/notities/revisies', { id }).then((d) => d.revisies),
  revisieHerstel: (id: string, revisieId: string) => roep<{ notitie: Notitie }>('/api/notities/revisie-herstel', { id, revisieId }).then((d) => d.notitie),
  mappen: () => roep<{ mappen: NotitieMap[] }>('/api/notities/mappen', { actie: 'lijst' }).then((d) => d.mappen),
  mapNieuw: (naam: string, kleur: NotitieKleur) => roep<{ map: NotitieMap }>('/api/notities/mappen', { actie: 'nieuw', naam, kleur }).then((d) => d.map),
  mapWijzig: (id: string, patch: { naam?: string; kleur?: NotitieKleur }) => roep<{ map: NotitieMap }>('/api/notities/mappen', { actie: 'wijzig', id, ...patch }).then((d) => d.map),
  mapVerwijder: (id: string) => roep<{ verwijderd: boolean }>('/api/notities/mappen', { actie: 'verwijder', id }),
  importVoorbeeld: (bestanden: { naam: string; tekst: string }[]) => roep<ImportVoorbeeldUit>('/api/notities/import/voorbeeld', { bestanden }),
  importUitvoeren: (bestanden: { naam: string; tekst: string }[], opts: { ookDubbelen: boolean; mapId: string | null; etiket: string }) => roep<{ aangemaakt: Notitie[]; overgeslagen: number; fouten: ImportFoutUit[] }>('/api/notities/import/uitvoeren', { bestanden, ...opts }),
  export: (ookArchief: boolean) => roep<{ notities: Notitie[]; mappen: NotitieMap[] }>('/api/notities/export', { ookArchief }),
};

// ------------------------------------------------------------------------------- klad (alleen in deze browser, nooit een geheim)
const KLAD = 'mr-notitie-klad:';
export type Klad = { titel: string; inhoud: string; op: string };
export function kladLezen(id: string): Klad | null { try { const v = localStorage.getItem(KLAD + id); return v ? (JSON.parse(v) as Klad) : null; } catch { return null; } }
export function kladBewaren(id: string, k: Omit<Klad, 'op'>) { try { localStorage.setItem(KLAD + id, JSON.stringify({ ...k, op: new Date().toISOString() })); } catch { /* geen opslag */ } }
export function kladWissen(id: string) { try { localStorage.removeItem(KLAD + id); } catch { /* geen opslag */ } }

// ------------------------------------------------------------------------------- voorkeuren van de weergave (per browser)
export type Voorkeuren = { indeling: 'kaarten' | 'lijst'; volgorde: 'gewijzigd' | 'aangemaakt' | 'titel'; zijkolom: boolean; leesbaar: boolean };
const VOORKEUR = 'mr-notities-voorkeuren';
export function voorkeurenLezen(): Voorkeuren {
  const basis: Voorkeuren = { indeling: 'kaarten', volgorde: 'gewijzigd', zijkolom: true, leesbaar: false };
  try { const v = localStorage.getItem(VOORKEUR); return v ? { ...basis, ...(JSON.parse(v) as Partial<Voorkeuren>) } : basis; } catch { return basis; }
}
export function voorkeurenBewaren(v: Voorkeuren) { try { localStorage.setItem(VOORKEUR, JSON.stringify(v)); } catch { /* geen opslag */ } }
