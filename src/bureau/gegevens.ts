// Echte gegevens voor de tegels van het bureaublad. Eén lader per bron, met een korte cache zodat tien tegels
// niet tien keer dezelfde route bevragen. Alles wat hier staat komt van een route die de HUB mag aanroepen:
//   POST /api/owner/hub/blocks/data            e-mail, bestanden, agenda (backend/hub-blok-gegevens.ts)
//   POST /api/mcp/board/list                   taken en notities (backend/mcp-console.ts, BORD_DIENSTEN bevat 'hub')
//   POST /api/owner/diagnostiek/mijn-diensten  stand van de eigen diensten (backend/beheer-diagnostiek.ts)
// Er wordt niets verzonnen: mislukt een route, dan zegt de tegel dat, met de code van de server.
import { api } from '../platform/client';
import { hubAuthBody } from '../useCanoniekHubAuth';
import { loadHubBlockData, readHubBlockDataCache, type HubBlockDataPayload } from '../hub-blok-gegevens';
import type { TabelRij } from '../../shared/diagnostiek-account';

export type BordTaak = { id: string; title: string; body: string; status: string; tags: string[]; createdAt: string; updatedAt: string };
export type BordNotitie = { id: string; title: string; body: string; tags: string[]; createdAt: string; updatedAt: string };
export type Bord = { taken: BordTaak[]; notities: BordNotitie[] };

const VERS = 60_000;
type Bak<T> = { waarde: T | null; op: number; lopend: Promise<T> | null };
const bak = <T,>(): Bak<T> => ({ waarde: null, op: 0, lopend: null });

const bordBak = bak<Bord>();
const dienstenBak = bak<TabelRij[]>();

const rij = (v: unknown) => (Array.isArray(v) ? v : []);
const tekst = (v: unknown, max = 4000) => String(v ?? '').slice(0, max);

/** Taken en notities van het bord van deze gebruiker. */
export function haalBord(force = false): Promise<Bord> {
  if (!force && bordBak.waarde && Date.now() - bordBak.op < VERS) return Promise.resolve(bordBak.waarde);
  if (bordBak.lopend) return bordBak.lopend;
  const verzoek = api.post('/api/mcp/board/list', hubAuthBody()).then((r) => {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const waarde: Bord = {
      taken: rij(d.tasks).map((t) => { const o = t as Record<string, unknown>; return { id: tekst(o.id, 100), title: tekst(o.title, 160), body: tekst(o.body), status: tekst(o.status, 20) || 'backlog', tags: rij(o.tags).map((x) => tekst(x, 32)), createdAt: tekst(o.createdAt, 40), updatedAt: tekst(o.updatedAt, 40) }; }),
      notities: rij(d.notes).map((n) => { const o = n as Record<string, unknown>; return { id: tekst(o.id, 100), title: tekst(o.title, 160), body: tekst(o.body), tags: rij(o.tags).map((x) => tekst(x, 32)), createdAt: tekst(o.createdAt, 40), updatedAt: tekst(o.updatedAt, 40) }; }),
    };
    bordBak.waarde = waarde; bordBak.op = Date.now();
    return waarde;
  }).finally(() => { bordBak.lopend = null; });
  bordBak.lopend = verzoek;
  return verzoek;
}
/** Het bord is gewijzigd (notitie toegevoegd/gewist): de volgende tegel haalt opnieuw op. */
export const bordVergeten = () => { bordBak.waarde = null; bordBak.op = 0; };

/** Stand van de eigen diensten (nooit van de server of van iemand anders; `uitvoeren` blijft false: alleen lezen). */
export function haalDiensten(force = false): Promise<TabelRij[]> {
  if (!force && dienstenBak.waarde && Date.now() - dienstenBak.op < VERS) return Promise.resolve(dienstenBak.waarde);
  if (dienstenBak.lopend) return dienstenBak.lopend;
  const verzoek = api.post('/api/owner/diagnostiek/mijn-diensten', hubAuthBody({ uitvoeren: false })).then((r) => {
    const waarde = rij((r.data as Record<string, unknown> | undefined)?.rijen) as TabelRij[];
    dienstenBak.waarde = waarde; dienstenBak.op = Date.now();
    return waarde;
  }).finally(() => { dienstenBak.lopend = null; });
  dienstenBak.lopend = verzoek;
  return verzoek;
}

export { loadHubBlockData, readHubBlockDataCache };
export type { HubBlockDataPayload };
