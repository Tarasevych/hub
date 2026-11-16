// UITROL-002 · Рядок прогресу над терміналом (власник, 16.11.2026): який процес іде зараз, його відсоток, скільки минуло на цьому
// кроці й на всьому пакеті, і скільки «зазвичай» триває крок та весь пакет — з медіани останніх вдалих встановлень на цьому сервері
// (/api/owner/uitrol/live → verwacht). Жодних вигаданих нормативів: без історії показується лише те, що минуло.
// Voortgangsregel boven de terminal: lopend onderdeel, percentage, verstreken tijd per onderdeel en in totaal, en de gebruikelijke duur
// (mediaan van de laatste geslaagde runs). Zuiver en getest in tests/eenheid/uitrol-terminal-voortgang.test.ts.
import { installerOnderdelen, ONDERDELEN, ROOT_STAPPEN } from './conveyor-stand';
import type { Regel, Run } from './types';
import type { VerwachtDuren } from '../../shared/uitrol-duur';
export type { VerwachtDuren } from '../../shared/uitrol-duur';
export { mediaan } from '../../shared/uitrol-duur';

export type VoortgangStand = {
  /** id van het lopende onderdeel («bouwen», «migraties», of «root-echtheid» vóór de installer) */
  id: string; uk: string; nl: string;
  /** percentage van het hele pakket (uit de laatste «stap:»-regel, anders run.pct) */
  pct: number;
  /** verstreken op dit onderdeel en in totaal (ms) */
  stapMs: number | null; totaalMs: number | null;
  /** gebruikelijke duur van dit onderdeel en van het hele pakket (ms), null = geen geschiedenis */
  verwachtStapMs: number | null; verwachtTotaalMs: number | null;
  /** geschat resterend voor het hele pakket (ms), null = onbekend */
  resterendMs: number | null;
  /** afgerond (de run loopt niet meer) */
  klaar: boolean;
};

const ms = (t?: string) => { const n = Date.parse(t || ''); return Number.isFinite(n) ? n : NaN; };

export function voortgangStand(run: Run | null, regels: Regel[], verwacht: VerwachtDuren | null | undefined, nu = Date.now()): VoortgangStand | null {
  if (!run) return null;
  const klaar = run.staat !== 'bezig';
  const eind = klaar ? ms(run.geeindigd || run.bijgewerkt) : nu;
  const onderdelen = installerOnderdelen(regels, klaar ? run.geeindigd || run.bijgewerkt : undefined, nu);
  const laatste = onderdelen[onderdelen.length - 1];
  const gestart = ms(run.gestart);
  const totaalMs = Number.isFinite(gestart) && Number.isFinite(eind) && eind >= gestart ? eind - gestart : null;
  let id: string; let uk: string; let nl: string; let pct: number; let stapMs: number | null; let verwachtStapMs: number | null = null;
  if (laatste) {
    id = laatste.id; uk = ONDERDELEN[id]?.uk || id; nl = ONDERDELEN[id]?.nl || id; pct = laatste.pct ?? run.pct;
    const van = ms(laatste.tijd);
    stapMs = Number.isFinite(van) && Number.isFinite(eind) && eind >= van ? eind - van : null;
    verwachtStapMs = verwacht?.stappen[id] ?? null;
  } else {
    // Vóór de installer: de controles van root (stappen.jsonl); het laatste «bezig»-stapje, anders de laatste stap.
    const s = [...run.stappen].reverse().find((x) => x.staat === 'bezig') || run.stappen[run.stappen.length - 1];
    const rid = s?.stap || 'ontvangen';
    id = `root-${rid}`; uk = ROOT_STAPPEN[rid]?.uk || (s?.uk ?? rid); nl = ROOT_STAPPEN[rid]?.nl || (s?.nl ?? rid); pct = s?.pct ?? run.pct;
    const van = ms(s?.tijd);
    stapMs = Number.isFinite(van) && Number.isFinite(eind) && eind >= van ? eind - van : null;
  }
  if (klaar && run.staat === 'klaar') pct = 100;
  const verwachtTotaalMs = verwacht?.totaalMs ?? null;
  // Resterend: eerst uit de gebruikelijke totale duur; is die al overschreden, dan uit het percentage (geen negatieve tijd).
  let resterendMs: number | null = null;
  if (!klaar && totaalMs !== null) {
    if (verwachtTotaalMs !== null && verwachtTotaalMs > totaalMs) resterendMs = verwachtTotaalMs - totaalMs;
    else if (pct > 0 && pct < 100 && verwachtTotaalMs === null) resterendMs = Math.round((totaalMs / pct) * (100 - pct));
    else if (verwachtTotaalMs !== null) resterendMs = 0;
  }
  return { id, uk, nl, pct: Math.max(0, Math.min(100, Math.round(pct || 0))), stapMs, totaalMs, verwachtStapMs, verwachtTotaalMs, resterendMs, klaar };
}

/** «1 год 02 хв», «4 хв 10 с», «35 с» — in de paginataal (seconden/minuten/uren, zoals de eigenaar vroeg). */
export function duurTekst(lang: 'uk' | 'nl', msWaarde: number): string {
  const s = Math.max(0, Math.round(msWaarde / 1000));
  const sec = lang === 'uk' ? 'с' : 's', min = lang === 'uk' ? 'хв' : 'min', uur = lang === 'uk' ? 'год' : 'u';
  if (s < 60) return `${s} ${sec}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${min} ${String(s % 60).padStart(2, '0')} ${sec}`;
  return `${Math.floor(m / 60)} ${uur} ${String(m % 60).padStart(2, '0')} ${min}`;
}

