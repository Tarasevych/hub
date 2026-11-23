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

export type BureauGithub = {
  ruimte: string;
  gekoppeld: boolean;
  kluisGesloten: boolean;
  accounts: Array<{ pad: 'oauth' | 'app'; login: string; repoAantal: number; bijgewerktOp: number }>;
  opslagplaatsen: string[];
  recenteActies: Array<{ id: string; actie: string; resultaat: string; op: number }>;
};
export type BureauAiToegang = {
  ruimte: string;
  samenvatting: {
    verbindingen: number;
    toestemmingen: number;
    apparaten: number;
    apparatenVerbonden: number;
    browsersActief: number;
  };
  verbindingen: Array<{ id: string; naam: string; scope: string; laatstGebruiktOp: number }>;
  toestemmingen: Array<{ id: string; agentId: string; mogelijkheid: string; altijd: boolean; verlooptOp: number }>;
  apparaten: Array<{ id: string; naam: string; platform: string; online: boolean; laatstGezienOp: number }>;
};

const githubBureauBak = bak<BureauGithub>();
const aiBureauBak = bak<BureauAiToegang>();

export function haalBureauGithub(force = false): Promise<BureauGithub> {
  if (!force && githubBureauBak.waarde && Date.now() - githubBureauBak.op < VERS) return Promise.resolve(githubBureauBak.waarde);
  if (githubBureauBak.lopend) return githubBureauBak.lopend;
  const verzoek = api.post('/api/owner/hub/werkblad/github', hubAuthBody()).then((r) => {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const waarde: BureauGithub = {
      ruimte: tekst(d.ruimte, 20) || 'prive',
      gekoppeld: d.gekoppeld === true,
      kluisGesloten: d.kluisGesloten === true,
      accounts: rij(d.accounts).map((x) => {
        const o = (x || {}) as Record<string, unknown>;
        return { pad: o.pad === 'app' ? 'app' : 'oauth', login: tekst(o.login, 80), repoAantal: Number(o.repoAantal || 0), bijgewerktOp: Number(o.bijgewerktOp || 0) };
      }),
      opslagplaatsen: rij(d.opslagplaatsen).map((x) => tekst(x, 140)).filter(Boolean),
      recenteActies: rij(d.recenteActies).map((x) => {
        const o = (x || {}) as Record<string, unknown>;
        return { id: tekst(o.id, 80), actie: tekst(o.actie, 120), resultaat: tekst(o.resultaat, 40), op: Number(o.op || 0) };
      }),
    };
    githubBureauBak.waarde = waarde; githubBureauBak.op = Date.now();
    return waarde;
  }).finally(() => { githubBureauBak.lopend = null; });
  githubBureauBak.lopend = verzoek;
  return verzoek;
}

export function haalBureauAiToegang(force = false): Promise<BureauAiToegang> {
  if (!force && aiBureauBak.waarde && Date.now() - aiBureauBak.op < VERS) return Promise.resolve(aiBureauBak.waarde);
  if (aiBureauBak.lopend) return aiBureauBak.lopend;
  const verzoek = api.post('/api/owner/hub/werkblad/ai-toegang', hubAuthBody()).then((r) => {
    const d = (r.data ?? {}) as Record<string, unknown>;
    const s = (d.samenvatting && typeof d.samenvatting === 'object' ? d.samenvatting : {}) as Record<string, unknown>;
    const waarde: BureauAiToegang = {
      ruimte: tekst(d.ruimte, 20) || 'prive',
      samenvatting: {
        verbindingen: Number(s.verbindingen || 0),
        toestemmingen: Number(s.toestemmingen || 0),
        apparaten: Number(s.apparaten || 0),
        apparatenVerbonden: Number(s.apparatenVerbonden || 0),
        browsersActief: Number(s.browsersActief || 0),
      },
      verbindingen: rij(d.verbindingen).map((x) => {
        const o = (x || {}) as Record<string, unknown>;
        return { id: tekst(o.id, 80), naam: tekst(o.naam, 80), scope: tekst(o.scope, 120), laatstGebruiktOp: Number(o.laatstGebruiktOp || 0) };
      }),
      toestemmingen: rij(d.toestemmingen).map((x) => {
        const o = (x || {}) as Record<string, unknown>;
        return { id: tekst(o.id, 80), agentId: tekst(o.agentId, 80), mogelijkheid: tekst(o.mogelijkheid, 48), altijd: o.altijd === true, verlooptOp: Number(o.verlooptOp || 0) };
      }),
      apparaten: rij(d.apparaten).map((x) => {
        const o = (x || {}) as Record<string, unknown>;
        return { id: tekst(o.id, 80), naam: tekst(o.naam, 80), platform: tekst(o.platform, 32), online: o.online === true, laatstGezienOp: Number(o.laatstGezienOp || 0) };
      }),
    };
    aiBureauBak.waarde = waarde; aiBureauBak.op = Date.now();
    return waarde;
  }).finally(() => { aiBureauBak.lopend = null; });
  aiBureauBak.lopend = verzoek;
  return verzoek;
}

export { loadHubBlockData, readHubBlockDataCache };
export type { HubBlockDataPayload };
