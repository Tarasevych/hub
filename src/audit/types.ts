// Types en kleine hulpjes van het beheerlogboek (scherm). De regels komen van /api/owner/journaal/beheer/* (backend/beheer-journaal-routes.ts).
import type { CategorieId, Doel, ResultaatKlasse, Wijziging } from '../../shared/beheer-journaal';

export type Lang = 'uk' | 'nl';
export const tr = (lang: Lang, uk: string, nl: string) => (lang === 'uk' ? uk : nl);

export type Persoon = { id: string; email: string; naam: string; foto?: string };
export type Rij = {
  id: string; bron: 'nieuw' | 'oud'; ownerId: string | null; actorId: string | null; action: string; type: string; result: string; details: Record<string, unknown>;
  device: string | null; service: string | null; ipHash: string | null; seq: number; hash: string; prevHash: string; createdAt: number;
  categorie: CategorieId; resultaatKlasse: ResultaatKlasse; ruis: boolean; doel: Doel | null; wijziging: Wijziging | null; reden: string; agent: string;
};
export type Lijst = { items: Rij[]; personen: Record<string, Persoon>; nextCursor: string | null };
export type Statistiek = {
  totaal: number; perCategorie: Array<{ id: string; n: number }>; perResultaat: Array<{ id: string; n: number }>; actoren: Array<{ id: string; n: number }>;
  acties: Array<{ id: string; n: number }>; perDienst?: Array<{ id: string; n: number }>; perDag: Array<{ dag: string; n: number; geweigerd: number }>; eerste: number; laatste: number; personen: Record<string, Persoon>;
};
export type KetenUitslag = { ketens: number; gecontroleerd: number; afgekapt: boolean; totaal: number; hashFout: number; schakelFout: number; gaten: number; geldig: boolean; ongeldig: Array<{ eigenaar: string; hashFout: number; schakelFout: number; gaten: number }>; duurMs: number };

export type Periode = '24u' | '7d' | '30d' | 'alles' | 'eigen';
export type Staat = {
  q: string; categorieen: string[]; resultaten: string[]; actorId: string; doelId: string; doelNaam: string; actie: string; /** rijfilter op de dienst (kolom service); gaat als `dienst` naar de server — nooit als `service` (dat is het sessieveld) */ dienst: string; bron: 'nieuw' | 'oud'; periode: Periode; van: string; tot: string; verbergRuis: boolean; volgorde: 'nieuw' | 'oud';
};
export const LEEG: Staat = { q: '', categorieen: [], resultaten: [], actorId: '', doelId: '', doelNaam: '', actie: '', dienst: '', bron: 'nieuw', periode: '7d', van: '', tot: '', verbergRuis: true, volgorde: 'nieuw' };

/** Eigen datuminvoer (yyyy-mm-dd) → ms op lokale middernacht; leeg of ongeldig → 0. */
export const dagMs = (v: string, einde = false): number => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 0; const [j, m, d] = v.split('-').map(Number); const t = new Date(j, m - 1, d + (einde ? 1 : 0)).getTime(); return Number.isFinite(t) ? t : 0; };
export function bereik(s: Staat, nu = Date.now()): { van?: number; tot?: number } {
  if (s.periode === '24u') return { van: nu - 24 * 3600_000 };
  if (s.periode === '7d') return { van: nu - 7 * 24 * 3600_000 };
  if (s.periode === '30d') return { van: nu - 30 * 24 * 3600_000 };
  if (s.periode === 'eigen') return { van: dagMs(s.van) || undefined, tot: dagMs(s.tot, true) || undefined };
  return {};
}
export const naarBody = (s: Staat, extra: Record<string, unknown> = {}) => ({
  q: s.q.trim(), categorieen: s.categorieen, resultaten: s.resultaten, actorId: s.actorId || undefined, doelId: s.doelId || undefined, actie: s.actie || undefined, dienst: s.dienst || undefined, bron: s.bron, verbergRuis: s.verbergRuis, volgorde: s.volgorde, ...bereik(s), ...extra,
});
export const filtersActief = (s: Staat) => (s.q.trim() ? 1 : 0) + s.categorieen.length + s.resultaten.length + (s.actorId ? 1 : 0) + (s.doelId ? 1 : 0) + (s.actie ? 1 : 0) + (s.dienst ? 1 : 0) + (s.bron !== 'nieuw' ? 1 : 0) + (s.periode !== '7d' ? 1 : 0) + (s.verbergRuis ? 0 : 1);

export const tijdKort = (ms: number, lang: Lang) => new Date(ms).toLocaleTimeString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const datumLang = (ms: number, lang: Lang) => new Date(ms).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'medium', timeStyle: 'medium' });
export const dagKop = (ms: number, lang: Lang, nu = Date.now()) => {
  const d = new Date(ms); const v = new Date(nu); const gelijk = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (gelijk(d, v)) return tr(lang, 'Сьогодні', 'Vandaag');
  if (gelijk(d, new Date(nu - 86400_000))) return tr(lang, 'Вчора', 'Gisteren');
  return d.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
export const relatief = (ms: number, lang: Lang, nu = Date.now()) => {
  const s = Math.max(0, Math.round((nu - ms) / 1000));
  if (s < 45) return tr(lang, 'щойно', 'zojuist');
  if (s < 3600) return tr(lang, `${Math.round(s / 60)} хв тому`, `${Math.round(s / 60)} min geleden`);
  if (s < 86400) return tr(lang, `${Math.round(s / 3600)} год тому`, `${Math.round(s / 3600)} u geleden`);
  return tr(lang, `${Math.round(s / 86400)} дн. тому`, `${Math.round(s / 86400)} d geleden`);
};
export const korteHash = (h: string) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '—');

// Voorkeuren onthouden (alleen gemak per browser; werkt ook zonder opslag). Audit 19.10.2026 (A8): alleen de WEERGAVE-voorkeuren (bron, periode,
// ruis, volgorde) komen terug bij een volgend bezoek; een smalle selectie (tekst, actie, wie, voor wie, categorie, resultaat) niet — anders
// opende het journaal met een oud filter («Схвалено оновлення») en leek het leeg.
const SLEUTEL = 'tsv-admin-audit-filters-v2';
const VOORKEUREN = ['bron', 'periode', 'van', 'tot', 'verbergRuis', 'volgorde'] as const;
export const voorkeurenVan = (s: Staat): Pick<Staat, (typeof VOORKEUREN)[number]> => ({ bron: s.bron, periode: s.periode, van: s.van, tot: s.tot, verbergRuis: s.verbergRuis, volgorde: s.volgorde });
export const herstelFilters = (r: unknown): Staat => {
  if (!r || typeof r !== 'object') return LEEG;
  const v = r as Partial<Staat>;
  return { ...LEEG, bron: v.bron === 'oud' ? 'oud' : 'nieuw', periode: (['24u', '7d', '30d', 'alles', 'eigen'] as Periode[]).includes(v.periode as Periode) ? (v.periode as Periode) : LEEG.periode, van: typeof v.van === 'string' ? v.van : '', tot: typeof v.tot === 'string' ? v.tot : '',
    verbergRuis: typeof v.verbergRuis === 'boolean' ? v.verbergRuis : LEEG.verbergRuis, volgorde: v.volgorde === 'oud' ? 'oud' : 'nieuw' };
};
export const leesFilters = (): Staat => { try { return herstelFilters(JSON.parse(localStorage.getItem(SLEUTEL) || 'null')); } catch { return LEEG; } };
export const bewaarFilters = (s: Staat) => { try { localStorage.setItem(SLEUTEL, JSON.stringify(voorkeurenVan(s))); } catch { /* geen opslag: prima */ } };
