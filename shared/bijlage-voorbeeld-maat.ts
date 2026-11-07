/** Розмір спливного перегляду вкладення (блок 3, п. 6.2). S — як було до 26.10. */
export const BIJLAGE_MATEN = ['S', 'M', 'L', 'XL', 'scherm'] as const;
export type BijlageMaat = (typeof BIJLAGE_MATEN)[number];

const VAST: Record<Exclude<BijlageMaat, 'scherm'>, { w: number; h: number }> = {
  S: { w: 320, h: 154 },
  M: { w: 480, h: 300 },
  L: { w: 720, h: 460 },
  XL: { w: 960, h: 640 },
};

const STAP: Record<BijlageMaat, BijlageMaat> = { S: 'M', M: 'L', L: 'XL', XL: 'scherm', scherm: 'scherm' };

export function bijlageMaatVan(v: unknown): BijlageMaat {
  return BIJLAGE_MATEN.includes(v as BijlageMaat) ? (v as BijlageMaat) : 'S';
}

/** Колесо на S стрибає одразу на L — так було до вибору розміру. Далі крок на один. */
export function effectieveMaat(maat: BijlageMaat, groot = false): BijlageMaat {
  if (!groot) return maat;
  if (maat === 'S') return 'L';
  return STAP[maat];
}

/** Ширина картки в пікселях. `groot` (колесо) — крок угору. */
export function voorbeeldBreedte(maat: BijlageMaat, innerWidth: number, groot = false): number {
  const gekozen = effectieveMaat(maat, groot);
  const basis = gekozen === 'scherm' ? Math.min(innerWidth * 0.6, 1200) : VAST[gekozen].w;
  return Math.min(basis, Math.max(220, innerWidth - 16));
}

export function voorbeeldHoogte(maat: BijlageMaat, innerHeight: number, groot = false): number {
  const gekozen = effectieveMaat(maat, groot);
  const basis = gekozen === 'scherm' ? Math.min(innerHeight * 0.8, 900) : VAST[gekozen].h;
  return Math.min(basis, Math.max(120, innerHeight - 50));
}
