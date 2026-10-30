// Afstemming vNext — ZUIVERE kern van de звірка-onderdelen (uitvoerder D3): grafindeling, zoom-wiskunde, groepering van
// controles, postflight-labels en de mogelijkheden-filter. GEEN React en GEEN runtime-import van de client (alleen typen),
// zodat de eenheidstests dit bestand rechtstreeks kunnen laden en de uitspraken BEWIJZEN in plaats van beweren.
import type { Gezondheid, Kaart, KoppelSoort, Levensfase } from '../../shared/afstemming-model';
import type { GraafUit } from './afstemming-client';

// ---------------------------------------------------------------- kleuren: alleen ontwerp-tokens (licht/donker volgen vanzelf)
export const RAND_KLEUR: Record<KoppelSoort, string> = Object.freeze({
  depends_on: 'var(--info)', duplicates: 'var(--warn)', overlaps: 'var(--warn)', conflicts_with: 'var(--fout)',
  blocks: 'var(--fout)', implements: 'var(--ok)', tested_by: 'var(--ok)', introduced_in: 'var(--accent)',
  regresses: 'var(--fout)', supersedes: 'var(--muted)', relates_to: 'var(--muted)',
});
export const GEZONDHEID_KLEUR: Record<Gezondheid, string> = Object.freeze({
  unknown: 'var(--muted)', not_implemented: 'var(--muted)', partially_working: 'var(--warn)', working: 'var(--ok)',
  regressed: 'var(--fout)', blocked: 'var(--fout)', obsolete: 'var(--muted)',
});

// ---------------------------------------------------------------- grafindeling (§6): deterministisch, vrij van toeval
export type GraafKnoopXY = GraafUit['knopen'][number] & { x: number; y: number };
export type GraafRandXY = GraafUit['randen'][number] & { x1: number; y1: number; x2: number; y2: number; mx: number; my: number };
export type GraafFilters = { dienst: string; soorten: readonly KoppelSoort[]; alleenBevestigd: boolean };
const rond = (v: number) => Math.round(v * 10) / 10;

/**
 * Knopen op één cirkel, gegroepeerd per dienst en daarbinnen op externId (stabiel alfabet — twee keer dezelfde invoer geeft
 * exact dezelfde tekening). Randen als kwadratische bogen met het stuurpunt richting het middelpunt, zodat kruisende lijnen
 * leesbaar blijven. Filters: dienst beperkt de knopen (en laat bungelende randen vallen), soorten/alleenBevestigd de randen.
 */
export function grafIndeling(uit: GraafUit, f: GraafFilters, maat = 640): { knopen: GraafKnoopXY[]; randen: GraafRandXY[]; diensten: string[] } {
  const diensten = [...new Set(uit.knopen.map((k) => k.dienst || '—'))].sort();
  const zichtbaar = uit.knopen
    .filter((k) => !f.dienst || (k.dienst || '—') === f.dienst)
    .slice()
    .sort((a, b) => (a.dienst || '—').localeCompare(b.dienst || '—') || a.externId.localeCompare(b.externId));
  const c = maat / 2;
  const straal = maat * 0.38;
  const knopen: GraafKnoopXY[] = zichtbaar.map((k, i) => {
    const hoek = (i / Math.max(zichtbaar.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return { ...k, x: rond(c + straal * Math.cos(hoek)), y: rond(c + straal * Math.sin(hoek)) };
  });
  const plek = new Map(knopen.map((k) => [k.id, k]));
  const soorten = new Set(f.soorten);
  const randen: GraafRandXY[] = [];
  for (const r of uit.randen) {
    if (!soorten.has(r.soort)) continue;
    if (f.alleenBevestigd && r.stand !== 'bevestigd') continue;
    const a = plek.get(r.van); const b = plek.get(r.naar);
    if (!a || !b) continue; // bungelende rand: één van de knopen is weggefilterd of onbekend
    const midX = (a.x + b.x) / 2; const midY = (a.y + b.y) / 2;
    randen.push({ ...r, x1: a.x, y1: a.y, x2: b.x, y2: b.y, mx: rond(midX + (c - midX) * 0.35), my: rond(midY + (c - midY) * 0.35) });
  }
  return { knopen, randen, diensten };
}

/** De viewBox bij schaal + verschuiving: inzoomen rond het midden, pannen in tekening-eenheden. */
export function zoomViewBox(maat: number, schaal: number, dx: number, dy: number): string {
  const zijde = maat / Math.max(schaal, 0.01);
  const begin = (maat - zijde) / 2;
  return `${rond(begin + dx)} ${rond(begin + dy)} ${rond(zijde)} ${rond(zijde)}`;
}

// ---------------------------------------------------------------- controles (§5+§8): groeperen op FEITEN, niets verzinnen
export type ControleGroepen = { zonderBewijs: Kaart[]; regressies: Kaart[]; onbekend: Kaart[] };
export function groepeerKaarten(kaarten: readonly Kaart[]): ControleGroepen {
  const actief = kaarten.filter((k) => !k.gearchiveerd);
  return {
    zonderBewijs: actief.filter((k) => k.criteriaTotaal > 0 && k.bewijs === 0),
    regressies: actief.filter((k) => k.gezondheid === 'regressed'),
    onbekend: actief.filter((k) => k.gezondheid === 'unknown'),
  };
}

// ---------------------------------------------------------------- releases (§7): uitgerold ≠ bevestigd (scenario 4)
export type PostflightStand = 'niet_gecontroleerd' | 'gecontroleerd' | 'regressie';
export function postflightLabel(stand: PostflightStand): { kleur: 'warn' | 'ok' | 'fout'; uk: string; nl: string } {
  if (stand === 'gecontroleerd') return { kleur: 'ok', uk: 'Підтверджено перевіркою', nl: 'Door controle bevestigd' };
  if (stand === 'regressie') return { kleur: 'fout', uk: 'Регресія', nl: 'Regressie' };
  return { kleur: 'warn', uk: 'Розгорнуто, не підтверджено', nl: 'Uitgerold, niet bevestigd' };
}
export function preflightLabel(stand: 'ok' | 'onbekend' | 'ongeregistreerd'): { kleur: 'ok' | 'muted' | 'warn'; uk: string; nl: string } {
  if (stand === 'ok') return { kleur: 'ok', uk: 'Звірено перед випуском', nl: 'Vooraf afgestemd' };
  if (stand === 'ongeregistreerd') return { kleur: 'warn', uk: 'Незареєстрована зміна', nl: 'Ongeregistreerde wijziging' };
  return { kleur: 'muted', uk: 'Передзвірки не було', nl: 'Geen preflight' };
}

// ---------------------------------------------------------------- mogelijkheden (§2.6): lokale zoekfilter, taalbewust
export type MogelijkhedenRubriek = { dienst: string; items: Array<{ externId: string; titel: [string, string] | { uk: string; nl?: string }; uitleg: string; route: string; stand: 'перевірено' | 'не перевірено' }> };
const titelTekst = (t: [string, string] | { uk: string; nl?: string }): string => (Array.isArray(t) ? `${t[0]} ${t[1] ?? ''}` : `${t.uk} ${t.nl ?? ''}`);
export function filterMogelijkheden<T extends MogelijkhedenRubriek>(rubrieken: readonly T[], zoek: string): T[] {
  const q = zoek.trim().toLowerCase();
  if (!q) return [...rubrieken];
  return rubrieken
    .map((r) => ({ ...r, items: r.items.filter((i) => `${i.externId} ${titelTekst(i.titel)} ${i.uitleg} ${i.route}`.toLowerCase().includes(q)) }))
    .filter((r) => r.items.length > 0);
}

/** Korte, eerlijke fase-aanduiding voor de minikaart op de graf (geen eigen vertaling — de labels komen uit het contract). */
export const faseVanKnoop = (fase: Levensfase): Levensfase => fase;
