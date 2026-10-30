// De browserkant van /api/huis/* (backend/huis-vnext.ts). Elke aanroep draagt dienst + tabblad mee (sessie van deze host).
import { api, ApiError } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import type { Apparaat, Automatisering, Droogloop, Gebeurtenis, Integratie, Lid, MogelijkheidSoort, Opdracht, Ruimte, Scene, Voorstel, Woning } from '../../shared/huis-model';
export type { Lid } from '../../shared/huis-model';

const body = (extra: Record<string, unknown> = {}) => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin, ...extra });
export class HuisFout extends Error { constructor(public code: string, public status: number, public data: any) { super(code); this.name = 'HuisFout'; } }
async function roep<T>(pad: string, data: Record<string, unknown> = {}): Promise<T> {
  try { const r = await api.post(pad, body(data)); return r.data as T; }
  catch (e) {
    if (e instanceof ApiError) throw new HuisFout(e.message || `HTTP_${e.status}`, e.status, e.response?.data);
    throw new HuisFout(String((e as Error)?.message || 'FOUT'), 0, null);
  }
}
export type Overzicht = { woning: Woning; lid: Lid; ruimtes: Ruimte[]; integraties: Integratie[]; apparaten: Apparaat[]; scenes: Scene[]; gebeurtenissen: Gebeurtenis[]; openOpdrachten: Opdracht[]; voorstellenWacht: number };
export type OntdektApparaatUit = { bronId: string; naam: string; soort: string; mogelijkheden: Apparaat['mogelijkheden']; kritiek: boolean; online: boolean; bestaat: boolean; toestanden: Array<{ kenmerk: string; waarde: unknown; eenheid: string; kwaliteit: string }> };
export type LidUit = { userId: string; rol: string; geldigTot: string | null; email: string; naam: string };

export const huisClient = {
  woningen: () => roep<{ woningen: Woning[] }>('/api/huis/woningen').then((d) => d.woningen),
  woningNieuw: (naam: string, taal: 'uk' | 'nl') => roep<{ woning: Woning }>('/api/huis/woningen/nieuw', { naam, taal }).then((d) => d.woning),
  woningWijzig: (woningId: string, v: Record<string, unknown>) => roep<{ woning: Woning }>('/api/huis/woningen/wijzig', { woningId, ...v }).then((d) => d.woning),
  overzicht: (woningId: string) => roep<Overzicht>('/api/huis/overzicht', { woningId }),
  ruimteNieuw: (woningId: string, v: { naam: string; verdieping: string; soort?: string; geometrie?: Ruimte['geometrie'] }) => roep<{ ruimte: Ruimte }>('/api/huis/ruimtes', { woningId, actie: 'nieuw', ...v }).then((d) => d.ruimte),
  ruimteWijzig: (woningId: string, id: string, v: Partial<Pick<Ruimte, 'naam' | 'verdieping' | 'soort' | 'geometrie'>>) => roep<{ ruimte: Ruimte }>('/api/huis/ruimtes', { woningId, actie: 'wijzig', id, ...v }).then((d) => d.ruimte),
  ruimteVerwijder: (woningId: string, id: string) => roep<{ verwijderd: boolean }>('/api/huis/ruimtes', { woningId, actie: 'verwijder', id }),
  apparaatWijzig: (woningId: string, id: string, v: { naam?: string; ruimteId?: string | null; verborgen?: boolean }) => roep<{ apparaat: Apparaat }>('/api/huis/apparaten/wijzig', { woningId, id, ...v }).then((d) => d.apparaat),
  integratieInstellen: (woningId: string, adres: string, token: string, naam?: string) => roep<{ integratie: Integratie }>('/api/huis/integraties/instellen', { woningId, adres, token, naam }).then((d) => d.integratie),
  integratieOntdekken: (woningId: string, integratieId: string) => roep<{ apparaten: OntdektApparaatUit[]; overgeslagen: number }>('/api/huis/integraties/ontdekken', { woningId, integratieId }),
  integratieImporteren: (woningId: string, integratieId: string, bronIds: string[] | null) => roep<{ nieuw: number; bijgewerkt: number; overgeslagen: number }>('/api/huis/integraties/importeren', { woningId, integratieId, bronIds }),
  integratieSynchroniseren: (woningId: string, integratieId: string) => roep<{ bijgewerkt: number; weg: number; nieuwBeschikbaar: number }>('/api/huis/integraties/synchroniseren', { woningId, integratieId }),
  integratieSchrijven: (woningId: string, integratieId: string, aan: boolean) => roep<{ integratie: Integratie }>('/api/huis/integraties/schrijven', { woningId, integratieId, aan }).then((d) => d.integratie),
  integratieVerwijderen: (woningId: string, integratieId: string) => roep<{ verwijderd: boolean }>('/api/huis/integraties/verwijderen', { woningId, integratieId }),
  opdracht: (woningId: string, v: { apparaatId: string; mogelijkheid: MogelijkheidSoort; waarde: Record<string, unknown>; idempotentie: string; kritiekBevestigd?: boolean }) => roep<{ opdracht: Opdracht }>('/api/huis/opdrachten/nieuw', { woningId, ...v }).then((d) => d.opdracht),
  opdrachtEen: (woningId: string, id: string) => roep<{ opdracht: Opdracht }>('/api/huis/opdrachten/een', { woningId, id }).then((d) => d.opdracht),
  opdrachten: (woningId: string) => roep<{ opdrachten: Opdracht[] }>('/api/huis/opdrachten', { woningId }).then((d) => d.opdrachten),
  scenes: (woningId: string) => roep<{ scenes: Scene[] }>('/api/huis/scenes', { woningId, actie: 'lijst' }).then((d) => d.scenes),
  sceneBewaar: (woningId: string, id: string | null, v: Record<string, unknown>) => roep<{ scene: Scene }>('/api/huis/scenes', { woningId, actie: 'bewaar', id: id ?? undefined, ...v }).then((d) => d.scene),
  sceneVerwijder: (woningId: string, id: string) => roep<{ verwijderd: boolean }>('/api/huis/scenes', { woningId, actie: 'verwijder', id }),
  sceneUitvoeren: (woningId: string, id: string, idempotentie: string) => roep<{ uitkomst: string; stappen: Array<{ apparaatId: string; mogelijkheid: string; stand: string; fout: string; opdrachtId: string | null }>; correlatie: string }>('/api/huis/scenes', { woningId, actie: 'uitvoeren', id, idempotentie }),
  automatiseringen: (woningId: string) => roep<{ automatiseringen: Automatisering[] }>('/api/huis/automatiseringen', { woningId, actie: 'lijst' }).then((d) => d.automatiseringen),
  automatiseringBewaar: (woningId: string, id: string | null, v: { naam: string; regel: unknown; stand?: string }) => roep<{ automatisering: Automatisering }>('/api/huis/automatiseringen', { woningId, actie: 'bewaar', id: id ?? undefined, ...v }).then((d) => d.automatisering),
  automatiseringVerwijder: (woningId: string, id: string) => roep<{ verwijderd: boolean }>('/api/huis/automatiseringen', { woningId, actie: 'verwijder', id }),
  droogloop: (woningId: string, regel: unknown, tijd?: string) => roep<{ droogloop: Droogloop; geenIo: boolean }>('/api/huis/automatiseringen', { woningId, actie: 'droogloop', regel, tijd }),
  gebeurtenissen: (woningId: string, v: { voor?: string; soort?: string } = {}) => roep<{ gebeurtenissen: Gebeurtenis[]; volgende: string | null }>('/api/huis/gebeurtenissen', { woningId, ...v }),
  energie: (woningId: string, uren: number) => roep<{ apparaten: Apparaat[]; reeksen: Record<string, Array<{ op: string; waarde: number }>>; van: string; fout: string; meters: number }>('/api/huis/energie', { woningId, uren }),
  beveiliging: (woningId: string) => roep<{ apparaten: Apparaat[]; integraties: Integratie[]; gecertificeerd: boolean }>('/api/huis/beveiliging', { woningId }),
  voorstellen: (woningId: string) => roep<{ voorstellen: Voorstel[] }>('/api/huis/voorstellen', { woningId, actie: 'lijst' }).then((d) => d.voorstellen),
  voorstelNieuw: (woningId: string, v: { samenvatting: string; apparaatId: string; mogelijkheid: MogelijkheidSoort; waarde: Record<string, unknown> }) => roep<{ voorstel: Voorstel }>('/api/huis/voorstellen', { woningId, actie: 'nieuw', door: 'assistent-pagina', ...v }).then((d) => d.voorstel),
  voorstelBesluit: (woningId: string, id: string, goedkeuren: boolean) => roep<{ voorstel: Voorstel; opdracht?: Opdracht | null; error?: string }>('/api/huis/voorstellen', { woningId, actie: goedkeuren ? 'goedkeuren' : 'afwijzen', id }),
  leden: (woningId: string) => roep<{ leden: LidUit[] }>('/api/huis/leden', { woningId, actie: 'lijst' }).then((d) => d.leden),
  lidToevoegen: (woningId: string, email: string, rol: string, dagen?: number) => roep<{ ok: boolean }>('/api/huis/leden', { woningId, actie: 'toevoegen', email, rol, dagen }),
  lidVerwijder: (woningId: string, userId: string) => roep<{ verwijderd: boolean }>('/api/huis/leden', { woningId, actie: 'verwijder', userId }),
};
export const idem = (prefix = 'site') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const WONING = 'mr-huis-woning';
export const gekozenWoning = () => { try { return localStorage.getItem(WONING) || ''; } catch { return ''; } };
export const kiesWoning = (id: string) => { try { localStorage.setItem(WONING, id); } catch { /* geen opslag */ } };
