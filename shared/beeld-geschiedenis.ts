// Історія фото відправника (3.5): лише те, що вже показали. Нових запитів у мережу немає.
export type BeeldStap = { bron: string; data: string; tijd: number };
export const BEELD_GESCHIEDENIS_MAX = 5;

const beeld = (data: string) => data.startsWith('data:image/') && data.length < 400_000;

/** Новіша зверху, той самий bron замінює старий, не більше п’яти. */
export function voegBeeldStap(oud: readonly BeeldStap[] | null | undefined, stap: { bron: string; data: string; tijd?: number }, nu = Date.now()): BeeldStap[] {
  const bron = String(stap.bron || '').slice(0, 40);
  const data = String(stap.data || '');
  const basis = [...(oud || [])].slice(0, BEELD_GESCHIEDENIS_MAX);
  if (!bron || !beeld(data)) return basis;
  return [{ bron, data, tijd: Number(stap.tijd) || nu }, ...basis.filter((x) => x.bron !== bron)].slice(0, BEELD_GESCHIEDENIS_MAX);
}

/** Обраний bron, інакше найновіший. */
export function kiesBeeld(stappen: readonly BeeldStap[], gekozenBron = ''): BeeldStap | null {
  if (!stappen.length) return null;
  return stappen.find((s) => s.bron === gekozenBron) || stappen[0];
}
