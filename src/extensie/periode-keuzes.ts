// EXTUI-001 · плитки строку доступу: числа й одиниці людською мовою (без React і CSS, щоб тестувати в Node).
// Tegels voor de termijn: getallen en eenheden in mensentaal (zonder React/CSS, testbaar in Node).
export type PeriodeKeuze = {
  waarde: number;
  /** Велике число на плитці: «7», «1», «15». */
  groot: string;
  /** Одиниця під числом: «днів», «рік», «хв». */
  eenheid: string;
  /** Повна назва для читача екрана й підказки: «7 днів». */
  naam: string;
  /** Відносна довжина 0…1 для шкали на плитці. */
  schaal: number;
};

/** Шкала на плитках: логарифм, щоб і 15 хв, і рік були помітні. Schaal: logaritmisch. */
export function logSchaal(waarde: number, min: number, max: number): number {
  if (max <= min) return 1;
  return 0.12 + 0.88 * (Math.log(waarde / min) / Math.log(max / min));
}

/** Плитки для приватного простору (дні). Tegels voor de privéruimte (dagen). */
export function dagKeuzes(dagen: readonly number[], uk: boolean): PeriodeKeuze[] {
  const min = Math.min(...dagen), max = Math.max(...dagen);
  return dagen.map((d) => {
    const s = logSchaal(d, min, max);
    if (d >= 360) { const j = Math.round(d / 365); return { waarde: d, groot: String(j), eenheid: uk ? (j === 1 ? 'рік' : 'роки') : 'jaar', naam: uk ? `${j} рік` : `${j} jaar`, schaal: s }; }
    if (d >= 180) { const m = Math.round(d / 30.4); return { waarde: d, groot: String(m), eenheid: uk ? 'місяців' : 'maanden', naam: uk ? `${m} місяців` : `${m} maanden`, schaal: s }; }
    if (d === 1) return { waarde: d, groot: '1', eenheid: uk ? 'день' : 'dag', naam: uk ? '1 день' : '1 dag', schaal: s };
    return { waarde: d, groot: String(d), eenheid: uk ? 'днів' : 'dagen', naam: uk ? `${d} днів` : `${d} dagen`, schaal: s };
  });
}

/** Плитки для технічного простору (хвилини). Tegels voor de technische ruimte (minuten). */
export function minuutKeuzes(minuten: readonly number[], uk: boolean): PeriodeKeuze[] {
  const min = Math.min(...minuten), max = Math.max(...minuten);
  return minuten.map((m) => {
    const s = logSchaal(m, min, max);
    if (m >= 60 && m % 60 === 0) { const u = m / 60; return { waarde: m, groot: String(u), eenheid: uk ? 'год' : 'uur', naam: uk ? `${u} год` : `${u} uur`, schaal: s }; }
    return { waarde: m, groot: String(m), eenheid: uk ? 'хв' : 'min', naam: uk ? `${m} хв` : `${m} min`, schaal: s };
  });
}
