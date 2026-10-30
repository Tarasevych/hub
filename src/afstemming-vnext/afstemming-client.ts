// Afstemming vNext — de ene client voor het contract uit shared/afstemming-model.ts. Elke aanroep gaat door src/platform/client
// (zelfde sessie/CSRF als de rest van de site); fouten worden AfstemmingFout met de servercode, nooit een stil succes.
import { api } from '../platform/client';
import type {
  Besluit, BewijsStuk, Gebeurtenis, ImportVoorbeeld, Kaart, Koppeling, KoppelSoort, Levensfase, ReleaseKoppeling, Revisie, ScanBevinding,
} from '../../shared/afstemming-model';

export class AfstemmingFout extends Error { code: string; huidig?: Kaart; constructor(code: string, huidig?: Kaart) { super(code); this.code = code; this.huidig = huidig; } }
/* Elke aanroep draagt dienst + tabblad + herkomst mee — dezelfde sessiecontext als de rest van de site. De dienst is hier
   bewust de HOST zelf (api.…→'api', hub.…→'hub'); het tabblad komt LUI uit ../tab-context, want dat bestand trekt bij een
   statische import de canonical-runtime (window) mee en zou de node-tests van de componenten breken. */
const dienstVanHost = (): string => { try { return location.hostname.split('.')[0] || 'api'; } catch { return 'api'; } };
let tabContextLui: (() => string) | null = null;
const tabContextVeilig = async (): Promise<string> => {
  try { tabContextLui ||= (await import('../tab-context')).ecosystemTabContext; return tabContextLui(); } catch { return ''; }
};
const roep = async <T>(pad: string, body: Record<string, unknown> = {}): Promise<T> => {
  const metContext = { service: dienstVanHost(), tabContext: await tabContextVeilig(), sourceOrigin: location.origin, ...body };
  try { return (await api.post(`/api/owner/afstemming/${pad}`, metContext)).data as T; }
  catch (e) {
    const r = (e as { response?: { data?: { error?: string; huidig?: Kaart } } }).response;
    throw new AfstemmingFout(String(r?.data?.error || 'FOUT'), r?.data?.huidig);
  }
};

export type Overzicht = { tellers: { kaarten: number; aandacht: number; conflicten: number; zonderBewijs: number; kandidaten: number }; aandacht: Kaart[]; recent: Gebeurtenis[]; kandidaten: Koppeling[] };
export type KaartenUit = { kaarten: Kaart[]; volgende: string | null; totaal: number; diensten: string[]; categorieen: string[] };
export type KaartDetail = { kaart: Kaart; revisie: Revisie; koppelingen: Koppeling[]; bewijs: BewijsStuk[]; releases: ReleaseKoppeling[]; besluiten: Besluit[] };
export type KaartenVraag = { zoek?: string; dienst?: string; categorie?: string; fase?: string; gezondheid?: string; conflict?: boolean; sorteer?: 'bijgewerkt' | 'aangemaakt' | 'titel' | 'prioriteit'; oplopend?: boolean; token?: string };
export type GraafUit = { knopen: Array<{ id: string; externId: string; titel: [string, string] | { uk: string; nl?: string }; fase: Levensfase; gezondheid: string; dienst: string }>; randen: Array<{ van: string; naar: string; soort: KoppelSoort; stand: string }> };
export type ReleasesUit = { releases: Array<{ versie: string; op: string; samenvatting: string; kaarten: ReleaseKoppeling[]; ongeregistreerd: string[] }> };
export type RapportUit = { nieuw: number; veranderd: number; zonderEigenaar: number; conflicten: number; verouderd: number; tekst: [string, string] };
export type MogelijkhedenUit = { rubrieken: Array<{ dienst: string; items: Array<{ externId: string; titel: [string, string] | { uk: string; nl?: string }; uitleg: string; route: string; stand: 'перевірено' | 'не перевірено' }> }> };

export const afstemmingClient = {
  overzicht: () => roep<Overzicht>('overzicht'),
  kaarten: (v: KaartenVraag = {}) => roep<KaartenUit>('kaarten', v as Record<string, unknown>),
  kaart: (id: string) => roep<KaartDetail>('kaart', { id }),
  voorstel: (b: Record<string, unknown>) => roep<{ kaart: Kaart }>('voorstel', b),
  wijzig: (id: string, versie: number, velden: Record<string, unknown>) => roep<{ kaart: Kaart; revisie: Revisie }>('wijzig', { id, versie, velden }),
  fase: (id: string, versie: number, fase: Levensfase, reden?: string) => roep<{ kaart: Kaart }>('fase', { id, versie, fase, reden }),
  criterium: (id: string, versie: number, criteriumId: string, stand: string, bewijsId?: string) => roep<{ kaart: Kaart }>('criterium', { id, versie, criteriumId, stand, bewijsId }),
  importVoorbeeld: (naam: string, formaat: 'json' | 'md' | 'txt', inhoud: string) => roep<ImportVoorbeeld>('import', { actie: 'voorbeeld', naam, formaat, inhoud }),
  importVastleggen: (invoerHash: string, kaart: ImportVoorbeeld['kaart']) => roep<{ kaart: Kaart; hergebruikt: boolean }>('import', { actie: 'vastleggen', invoerHash, kaart }),
  geschiedenis: (id: string, token?: string) => roep<{ gebeurtenissen: Gebeurtenis[]; volgende: string | null }>('geschiedenis', { id, token }),
  verschil: (id: string, revisieA: string, revisieB: string) => roep<{ velden: Array<{ veld: string; a: string; b: string }> }>('verschil', { id, revisieA, revisieB }),
  bewijs: (b: Record<string, unknown>) => roep<{ stuk: BewijsStuk }>('bewijs', b),
  koppel: (b: Record<string, unknown>) => roep<{ koppeling?: Koppeling; koppelingen?: Koppeling[] }>('koppel', b),
  kandidaten: (kaartId?: string) => roep<{ kandidaten: Koppeling[] }>('kandidaten', kaartId ? { kaartId } : {}),
  graaf: (v: { dienst?: string; soorten?: string[]; diepte?: number } = {}) => roep<GraafUit>('graaf', v),
  releases: (token?: string) => roep<ReleasesUit>('releases', token ? { token } : {}),
  releaseKoppel: (kaartId: string, releaseVersie: string, zekerheid: number, commit?: string) => roep<{ koppeling: ReleaseKoppeling }>('release-koppel', { kaartId, releaseVersie, zekerheid, commit }),
  postflight: (releaseVersie: string) => roep<{ gecontroleerd: number; regressies: string[]; onbevestigd: string[] }>('postflight', { releaseVersie }),
  scan: () => roep<{ bevindingen: ScanBevinding[]; op: string }>('scan'),
  rapport: (periode?: 'week' | 'maand') => roep<RapportUit>('rapport', periode ? { periode } : {}),
  mogelijkheden: () => roep<MogelijkhedenUit>('mogelijkheden'),
};
