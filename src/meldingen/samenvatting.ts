// Tekst van de ene regel in de gewone bel die naar het technische paneel verwijst (18.10.2026). Puur, voor tests.
/** Oekraïense meervoudsvorm: 1 нове сповіщення · 2–4 нові сповіщення · 5+ (en 11–14) нових сповіщень. */
export function ukMeervoud(n: number): 'een' | 'enkele' | 'veel' {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'een';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'enkele';
  return 'veel';
}
export function techSamenvattingTekst(lang: 'uk' | 'nl', n: number): string {
  if (lang === 'nl') return `In het technisch paneel: ${n} ${n === 1 ? 'nieuwe melding' : 'nieuwe meldingen'}`;
  const v = ukMeervoud(n);
  return `У технічній панелі ${n} ${v === 'een' ? 'нове сповіщення' : v === 'enkele' ? 'нові сповіщення' : 'нових сповіщень'}`;
}
