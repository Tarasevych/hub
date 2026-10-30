// /zoek — de clientkant van het contract (shared/zoek-model.ts, scratchpad/zoek-API.md). Zone Z4, 22.10.2026.
//   POST /api/owner/zoek                     ZoekVraag → ZoekAntwoord
//   POST /api/owner/zoek/suggesties          { prefix, bronnen? } → { suggesties: ZoekSuggestie[] }
//   POST /api/owner/zoek/stand               {} → { standen: ZoekBronStand[], gesloten }
//   (zoek-API.md §3; elk antwoord van /zoek draagt ook `gesloten` — diensten die in deze lade dicht staan — en `laden`.)
//   POST /api/owner/zoek/geschiedenis/*      backend/zoek-geschiedenis.ts (0103): lijst / open / bewaren / wis / wis-alles
// Elk verzoek draagt de sessievelden {service, tabContext, sourceOrigin}; de lade (gebruiker + ruimte) bepaalt de SERVER.
// Elke lezer hier is tolerant: ontbrekende velden worden leeg, nooit verzonnen (geen demo-gegevens).
import { api, isAfgebroken } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import { ZOEK_BRONNEN, ZOEK_SOORTEN, isZoekBron, isZoekSoort, isZoekTaal, type ZoekAntwoord, type ZoekBron, type ZoekBronStand, type ZoekFacets, type ZoekFragment, type ZoekRoute, type ZoekSuggestie, type ZoekTreffer, type ZoekUitleg, type ZoekVraag } from '../../shared/zoek-model';

export type Lang = 'uk' | 'nl';
export type { ZoekAntwoord, ZoekBron, ZoekBronStand, ZoekFacets, ZoekSuggestie, ZoekTreffer, ZoekVraag, ZoekRoute };
export type Opties = { signal?: AbortSignal };

const sessie = () => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lijst = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const telling = (v: unknown): Record<string, number> => Object.fromEntries(Object.entries(obj(v)).map(([k, n]) => [k, Math.max(0, Math.floor(num(n)))]));

export const ZOEK_HOSTS = ['hub', 'mail', 'cloud', 'id', 'mcp', 'ai', 'github'] as const;
export function leesRoute(v: unknown): ZoekRoute | null {
  const r = obj(v); const host = str(r.host, 16) as ZoekRoute['host'];
  if (!(ZOEK_HOSTS as readonly string[]).includes(host)) return null;
  const params: Record<string, string> = {};
  for (const [k, x] of Object.entries(obj(r.params))) if (/^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/.test(k)) params[k] = str(x, 500);
  return { host, pad: str(r.pad, 500), ...(r.hash ? { hash: str(r.hash, 200) } : {}), ...(Object.keys(params).length ? { params } : {}) };
}
function leesFragment(v: unknown): ZoekFragment {
  const f = obj(v); const tekst = str(f.tekst, 2000);
  const posities = lijst(f.posities).map(p => (Array.isArray(p) ? [Math.max(0, Math.floor(num(p[0]))), Math.max(0, Math.floor(num(p[1])))] as [number, number] : null))
    .filter((p): p is [number, number] => !!p && p[1] > p[0] && p[0] < tekst.length).map(p => [p[0], Math.min(tekst.length, p[1])] as [number, number]);
  const bron = (['titel', 'omschrijving', 'tekst'] as const).find(b => b === f.bron) || 'tekst';
  return { tekst, bron, posities };
}
function leesUitleg(v: unknown): ZoekUitleg[] {
  return lijst(v).map(u => obj(u)).filter(u => u.code).map(u => ({ code: str(u.code, 40) as ZoekUitleg['code'], uk: str(u.uk, 300), nl: str(u.nl, 300) })).slice(0, 8);
}
export function leesTreffer(v: unknown): ZoekTreffer | null {
  const t = obj(v); const id = str(t.id, 700); const bron = str(t.bron, 32);
  if (!id || !isZoekBron(bron)) return null;
  const soort = isZoekSoort(t.soort) ? t.soort : 'overig';
  const titels: ZoekTreffer['titels'] = {};
  for (const [k, x] of Object.entries(obj(t.titels))) if (isZoekTaal(k) && typeof x === 'string') titels[k] = x.slice(0, 500);
  return {
    id, bron, soort, titel: str(t.titel, 500), titels, omschrijving: str(t.omschrijving, 1000), pad: str(t.pad, 300), route: leesRoute(t.route),
    taal: isZoekTaal(t.taal) ? t.taal : '', formaat: str(t.formaat, 40), bijgewerktOp: Math.max(0, num(t.bijgewerktOp)), extra: obj(t.extra), integratie: str(t.integratie, 80),
    score: num(t.score), percent: Math.max(0, Math.min(100, Math.round(num(t.percent)))), uitleg: leesUitleg(t.uitleg), fragment: leesFragment(t.fragment),
  };
}
export function leesSuggestie(v: unknown): ZoekSuggestie | null {
  const s = obj(v); const tekst = str(s.tekst, 300).trim(); if (!tekst) return null;
  const soort = (['aanvulling', 'functie', 'pagina', 'categorie', 'correctie', 'synoniem'] as const).find(x => x === s.soort) || 'aanvulling';
  const label = obj(s.label); const bron = str(s.bron, 32);
  return { soort, tekst, ...(label.uk || label.nl ? { label: { uk: str(label.uk, 200), nl: str(label.nl, 200) } } : {}), ...(isZoekBron(bron) ? { bron } : {}), ...(s.id ? { id: str(s.id, 700) } : {}), route: leesRoute(s.route), ...(s.aantal != null ? { aantal: Math.max(0, Math.floor(num(s.aantal))) } : {}) };
}
export function leesAntwoord(v: unknown): ZoekAntwoord {
  const a = obj(v); const facets = a.facets ? obj(a.facets) : null;
  return {
    q: str(a.q, 300), qNorm: str(a.qNorm, 300), items: lijst(a.items).map(leesTreffer).filter((t): t is ZoekTreffer => !!t),
    ...(facets ? { facets: { bron: telling(facets.bron), soort: telling(facets.soort), formaat: telling(facets.formaat), taal: telling(facets.taal) } } : {}),
    suggesties: lijst(a.suggesties).map(leesSuggestie).filter((s): s is ZoekSuggestie => !!s),
    totaal: Math.max(0, Math.floor(num(a.totaal))), pagina: Math.max(1, Math.floor(num(a.pagina)) || 1), perPagina: Math.max(1, Math.floor(num(a.perPagina)) || 20),
    bron: a.bron === 'live' ? 'live' : 'index', duurMs: Math.max(0, num(a.duurMs)), versie: 'zoek-kern-2',
  };
}
export type Gesloten = { dienst: string; dienstNaam: { uk: string; nl: string }; code: string; uitleg: { uk: string; nl: string } };
export function leesGesloten(v: unknown): Gesloten[] {
  return lijst(obj(v).gesloten).map(obj).filter(g => g.dienst).map(g => ({ dienst: str(g.dienst, 40), dienstNaam: { uk: str(obj(g.dienstNaam).uk, 80), nl: str(obj(g.dienstNaam).nl, 80) }, code: str(g.code, 60), uitleg: { uk: str(obj(g.uitleg).uk, 400), nl: str(obj(g.uitleg).nl, 400) } }));
}
export function leesStand(v: unknown): ZoekBronStand[] {
  const o = obj(v);
  return lijst(Array.isArray(o.standen) ? o.standen : o.bronnen).map(obj).filter(b => isZoekBron(b.bron)).map(b => ({
    bron: b.bron as ZoekBron, stand: (['niet_gekoppeld', 'indexeert', 'gedeeltelijk', 'fout', 'klaar'] as const).find(s => s === b.stand) || 'niet_gekoppeld',
    voortgang: Math.max(0, Math.min(100, Math.round(num(b.voortgang)))), aantal: Math.max(0, Math.floor(num(b.aantal))),
    laatsteOk: num(b.laatsteOk), laatstePoging: num(b.laatstePoging), fout: str(b.fout, 300), versie: str(b.versie, 80), bijgewerktOp: num(b.bijgewerktOp),
  }));
}

// ---------------------------------------------------------------- verzoeken
export type ZoekUitkomst = ZoekAntwoord & { gesloten: Gesloten[] };
export async function zoeken(vraag: ZoekVraag, o: Opties = {}): Promise<ZoekUitkomst> {
  const r = await api.post('/api/owner/zoek', { ...sessie(), ...vraag }, { signal: o.signal });
  return { ...leesAntwoord(r.data), gesloten: leesGesloten(r.data) };
}
export async function suggesties(prefix: string, limiet = 8, o: Opties = {}, bronnen?: readonly ZoekBron[]): Promise<ZoekSuggestie[]> {
  const r = await api.post('/api/owner/zoek/suggesties', { ...sessie(), prefix: prefix.slice(0, 300), ...(bronnen?.length ? { bronnen } : {}) }, { signal: o.signal });
  return lijst(obj(r.data).suggesties).map(leesSuggestie).filter((s): s is ZoekSuggestie => !!s).slice(0, limiet);
}
/** `laden`: per bron de lade (prive | technisch) waarin dit tabblad zoekt (zone D: de pagina toont dat in het technisch profiel). */
export function leesLaden(v: unknown): Partial<Record<ZoekBron, 'prive' | 'technisch'>> {
  const uit: Partial<Record<ZoekBron, 'prive' | 'technisch'>> = {};
  for (const [k, x] of Object.entries(obj(obj(v).laden))) if (isZoekBron(k) && (x === 'prive' || x === 'technisch')) uit[k] = x;
  return uit;
}
export async function bronStand(o: Opties = {}): Promise<{ standen: ZoekBronStand[]; gesloten: Gesloten[]; laden: Partial<Record<ZoekBron, 'prive' | 'technisch'>> }> {
  const r = await api.post('/api/owner/zoek/stand', { ...sessie() }, { signal: o.signal });
  return { standen: leesStand(r.data), gesloten: leesGesloten(r.data), laden: leesLaden(r.data) };
}

// ---------------------------------------------------------------- geschiedenis (0103)
export type Treffer = { bron: string; id: string };
export type GeschiedenisStand = 'vers' | 'verouderd' | 'vernieuwd' | 'fout';
export type GeschiedenisRij = { id: string; vraag: string; vraagNorm: string; filters: Record<string, unknown>; laatstOp: number; aantalKeer: number; algoritmeVersie: string; indexVersie: string; treffers: Treffer[]; totaal: number; stand: GeschiedenisStand };
export function leesGeschiedenisRij(v: unknown): GeschiedenisRij | null {
  const r = obj(v); const id = str(r.id, 40); const vraag = str(r.vraag, 300); if (!id || !vraag) return null;
  return { id, vraag, vraagNorm: str(r.vraagNorm, 300), filters: obj(r.filters), laatstOp: num(r.laatstOp), aantalKeer: Math.max(1, Math.floor(num(r.aantalKeer)) || 1), algoritmeVersie: str(r.algoritmeVersie, 80), indexVersie: str(r.indexVersie, 80),
    treffers: lijst(r.treffers).map(obj).map(t => ({ bron: str(t.bron, 40), id: str(t.id, 700) })).filter(t => t.bron && t.id), totaal: Math.max(0, Math.floor(num(r.totaal))), stand: (['vers', 'verouderd', 'vernieuwd', 'fout'] as const).find(s => s === r.stand) || 'vers' };
}
const G = '/api/owner/zoek/geschiedenis';
export async function geschiedenisLijst(o: Opties = {}): Promise<GeschiedenisRij[]> {
  const r = await api.post(`${G}/lijst`, { ...sessie(), limiet: 30 }, { signal: o.signal });
  return lijst(obj(r.data).items).map(leesGeschiedenisRij).filter((x): x is GeschiedenisRij => !!x);
}
export async function geschiedenisOpen(id: string, o: Opties = {}): Promise<GeschiedenisRij | null> {
  const r = await api.post(`${G}/open`, { ...sessie(), id }, { signal: o.signal });
  return leesGeschiedenisRij(obj(r.data).item);
}
export async function geschiedenisBewaren(invoer: { vraag: string; filters: Record<string, unknown>; treffers: Treffer[]; totaal: number; algoritmeVersie: string; indexVersie: string; stand?: 'fout' }, o: Opties = {}): Promise<{ item: GeschiedenisRij | null; nieuw: Treffer[]; weg: Treffer[]; bestond: boolean }> {
  const r = await api.post(`${G}/bewaren`, { ...sessie(), ...invoer, treffers: invoer.treffers.slice(0, 200).map(t => ({ bron: t.bron, id: t.id })) }, { signal: o.signal });
  const d = obj(r.data); const refs = (v: unknown) => lijst(v).map(obj).map(t => ({ bron: str(t.bron, 40), id: str(t.id, 700) })).filter(t => t.bron && t.id);
  return { item: leesGeschiedenisRij(d.item), nieuw: refs(d.nieuw), weg: refs(d.weg), bestond: d.bestond === true };
}
export const geschiedenisWis = async (id: string) => { await api.post(`${G}/wis`, { ...sessie(), id }); };
export const geschiedenisWisAlles = async () => { await api.post(`${G}/wis-alles`, { ...sessie() }); };

export { isAfgebroken, ZOEK_BRONNEN, ZOEK_SOORTEN };
