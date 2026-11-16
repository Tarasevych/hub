// UITROL-002 · Gebruikelijke duur van een installatie (mediaan van eerdere geslaagde runs), gedeeld door backend (uitrol-runs.ts,
// /api/owner/uitrol/live → verwacht) en browser (src/uitrol/terminal-voortgang.ts). Звичайна тривалість кроків — з реальної історії.

/** Gebruikelijke duur per installer-onderdeel en van het hele pakket, uit eerdere geslaagde runs (ms); `uitRuns` = hoeveel runs meetelden. */
export type VerwachtDuren = { stappen: Record<string, number>; totaalMs: number | null; uitRuns: number };

/** Mediaan van durations (ms); leeg → null. */
export function mediaan(waarden: number[]): number | null {
  const w = waarden.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!w.length) return null;
  const h = Math.floor(w.length / 2);
  return w.length % 2 ? w[h] : Math.round((w[h - 1] + w[h]) / 2);
}

/**
 * Durations per «stap:»-onderdeel uit de regels van één run (tijdstip van de regel tot de volgende «stap:»-regel, de laatste tot `eind`).
 * Regels: [{ tijd, tekst }] in volgorde; alleen «[installeer] stap: <id> (<pct>%)».
 */
export function stapDurenUitRegels(regels: ReadonlyArray<{ tijd: string; tekst: string }>, eind: string): Record<string, number> {
  const stappen: Array<{ id: string; t: number }> = [];
  for (const r of regels) {
    const m = /^\[installeer\] stap: (\S+) \(\d+%\)/.exec(r.tekst);
    if (!m) continue;
    const t = Date.parse(r.tijd);
    if (!Number.isFinite(t) || stappen.some((s) => s.id === m[1])) continue;
    stappen.push({ id: m[1], t });
  }
  const uit: Record<string, number> = {};
  const e = Date.parse(eind);
  stappen.forEach((s, i) => { const tot = stappen[i + 1]?.t ?? e; if (Number.isFinite(tot) && tot >= s.t) uit[s.id] = tot - s.t; });
  return uit;
}

/** Mediaan per onderdeel en van het totaal over meerdere runs. */
export function verwachtUitRuns(runs: ReadonlyArray<{ duren: Record<string, number>; totaalMs: number }>): VerwachtDuren {
  const perStap: Record<string, number[]> = {};
  for (const r of runs) for (const [id, d] of Object.entries(r.duren)) (perStap[id] ||= []).push(d);
  const stappen: Record<string, number> = {};
  for (const [id, w] of Object.entries(perStap)) { const m = mediaan(w); if (m !== null) stappen[id] = m; }
  return { stappen, totaalMs: mediaan(runs.map((r) => r.totaalMs)), uitRuns: runs.length };
}
