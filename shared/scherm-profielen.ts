// UPD-012: компактна база профілів екранів основних виробників і миттєве визначення класу верстки
// без постійного перевимірювання під час прокручування.
// Schermprofielen van gangbare toestellen voor directe indeling zonder doorlopende metingen bij scrollen.

export type SchermKlasse =
  | 'compact-telefoon'
  | 'telefoon'
  | 'grote-telefoon'
  | 'tablet'
  | 'desktop'
  | 'breed';

export type SchermProfielBron = 'exact' | 'nabij' | 'dynamisch';

export interface SchermProfielDefinitie {
  readonly id: string;
  readonly merk: string;
  readonly naam: string;
  readonly breedte: number;
  readonly hoogte: number;
  readonly dpr: number;
  readonly aanraking: boolean;
  readonly klasse: SchermKlasse;
  readonly eersteSchermItems: number;
  readonly achtergrondEffecten: boolean;
  readonly kolomMax: number;
  readonly aanraakMinPx: number;
}

export interface SchermProfielCssVariabelen {
  readonly '--profiel-klasse': SchermKlasse;
  readonly '--profiel-kolom-max': string;
  readonly '--profiel-aanraak-min': string;
}

export interface BepaaldSchermProfiel {
  readonly klasse: SchermKlasse;
  readonly bron: SchermProfielBron;
  readonly profiel: SchermProfielDefinitie | null;
  readonly orientatie: 'staand' | 'liggend';
  readonly breedte: number;
  readonly hoogte: number;
  readonly dpr: number;
  readonly aanraking: boolean;
  readonly eersteSchermItems: number;
  readonly achtergrondEffecten: boolean;
  readonly cssVariabelen: SchermProfielCssVariabelen;
}

interface KlasseStandaard {
  readonly eersteSchermItems: number;
  readonly achtergrondEffecten: boolean;
  readonly kolomMax: number;
  readonly aanraakMinPx: number;
}

const KLASSE_STANDAARD: Record<SchermKlasse, KlasseStandaard> = {
  'compact-telefoon': { eersteSchermItems: 6, achtergrondEffecten: false, kolomMax: 1, aanraakMinPx: 44 },
  telefoon: { eersteSchermItems: 8, achtergrondEffecten: true, kolomMax: 1, aanraakMinPx: 44 },
  'grote-telefoon': { eersteSchermItems: 10, achtergrondEffecten: true, kolomMax: 2, aanraakMinPx: 44 },
  tablet: { eersteSchermItems: 14, achtergrondEffecten: true, kolomMax: 3, aanraakMinPx: 44 },
  desktop: { eersteSchermItems: 18, achtergrondEffecten: true, kolomMax: 4, aanraakMinPx: 36 },
  breed: { eersteSchermItems: 24, achtergrondEffecten: true, kolomMax: 5, aanraakMinPx: 36 },
};

function p(
  id: string,
  merk: string,
  naam: string,
  breedte: number,
  hoogte: number,
  dpr: number,
  aanraking: boolean,
  klasse: SchermKlasse,
  extra?: Partial<KlasseStandaard>,
): SchermProfielDefinitie {
  const basis = KLASSE_STANDAARD[klasse];
  return {
    id,
    merk,
    naam,
    breedte,
    hoogte,
    dpr,
    aanraking,
    klasse,
    eersteSchermItems: extra?.eersteSchermItems ?? basis.eersteSchermItems,
    achtergrondEffecten: extra?.achtergrondEffecten ?? basis.achtergrondEffecten,
    kolomMax: extra?.kolomMax ?? basis.kolomMax,
    aanraakMinPx: extra?.aanraakMinPx ?? basis.aanraakMinPx,
  };
}

/**
 * База з 54 відомих профілів екранів провідних виробників (логічні CSS-пікселі).
 * Catalogus met 54 gangbare schermprofielen van grote fabrikanten in logische CSS-pixels.
 */
export const SCHERM_PROFIELEN: readonly SchermProfielDefinitie[] = [
  // Apple iPhone
  p('apple-iphone-se', 'Apple', 'iPhone SE (2020/2022)', 375, 667, 2, true, 'compact-telefoon'),
  p('apple-iphone-13-mini', 'Apple', 'iPhone 13 mini', 375, 812, 3, true, 'compact-telefoon'),
  p('apple-iphone-13-14', 'Apple', 'iPhone 13 / 14', 390, 844, 3, true, 'telefoon'),
  p('apple-iphone-14-pro', 'Apple', 'iPhone 14 Pro', 393, 852, 3, true, 'telefoon'),
  p('apple-iphone-15-16', 'Apple', 'iPhone 15 / 16', 393, 852, 3, true, 'telefoon'),
  p('apple-iphone-16-pro', 'Apple', 'iPhone 16 Pro', 402, 874, 3, true, 'telefoon'),
  p('apple-iphone-14-plus', 'Apple', 'iPhone 13 Pro Max / 14 Plus', 428, 926, 3, true, 'grote-telefoon'),
  p('apple-iphone-15-pro-max', 'Apple', 'iPhone 14/15/16 Plus & 15 Pro Max', 430, 932, 3, true, 'grote-telefoon'),
  p('apple-iphone-16-pro-max', 'Apple', 'iPhone 16 Pro Max', 440, 956, 3, true, 'grote-telefoon'),

  // Apple iPad
  p('apple-ipad-mini', 'Apple', 'iPad mini (6/7)', 744, 1133, 2, true, 'tablet', { eersteSchermItems: 12, kolomMax: 2 }),
  p('apple-ipad-10', 'Apple', 'iPad 10.9"', 820, 1180, 2, true, 'tablet'),
  p('apple-ipad-air-11', 'Apple', 'iPad Air / Pro 11"', 834, 1194, 2, true, 'tablet'),
  p('apple-ipad-pro-11-m4', 'Apple', 'iPad Pro 11" (M4)', 834, 1210, 2, true, 'tablet'),
  p('apple-ipad-pro-13', 'Apple', 'iPad Air / Pro 12.9"–13"', 1024, 1366, 2, true, 'tablet', { eersteSchermItems: 16, kolomMax: 3 }),

  // Samsung Galaxy S / A / Z / Tab
  p('samsung-s22-s25', 'Samsung', 'Galaxy S22 / S23 / S24 / S25', 360, 780, 3, true, 'compact-telefoon', { achtergrondEffecten: true }),
  p('samsung-s23-plus', 'Samsung', 'Galaxy S22+ / S23+', 384, 832, 3, true, 'telefoon'),
  p('samsung-s24-s25-plus', 'Samsung', 'Galaxy S24+ / S25+', 412, 915, 3.5, true, 'grote-telefoon'),
  p('samsung-s23-s24-ultra', 'Samsung', 'Galaxy S22 / S23 / S24 Ultra', 412, 883, 3.5, true, 'grote-telefoon'),
  p('samsung-s25-ultra', 'Samsung', 'Galaxy S25 Ultra', 412, 915, 3.5, true, 'grote-telefoon'),
  p('samsung-a54-a55', 'Samsung', 'Galaxy A54 / A55', 360, 800, 3, true, 'compact-telefoon'),
  p('samsung-a35-a53', 'Samsung', 'Galaxy A35 / A53', 412, 915, 2.625, true, 'grote-telefoon', { achtergrondEffecten: false }),
  p('samsung-z-flip', 'Samsung', 'Galaxy Z Flip 5 / 6', 360, 880, 3, true, 'compact-telefoon', { achtergrondEffecten: true }),
  p('samsung-z-fold-cover', 'Samsung', 'Galaxy Z Fold 5 / 6 (buitenscherm)', 344, 882, 3, true, 'compact-telefoon'),
  p('samsung-z-fold-binnen', 'Samsung', 'Galaxy Z Fold 5 / 6 (binnenscherm)', 717, 841, 3, true, 'tablet', { eersteSchermItems: 12, kolomMax: 2 }),
  p('samsung-tab-s9', 'Samsung', 'Galaxy Tab S9 / S10', 800, 1280, 2, true, 'tablet'),
  p('samsung-tab-s9-plus', 'Samsung', 'Galaxy Tab S9+ / S10+', 876, 1400, 2, true, 'tablet'),
  p('samsung-tab-s9-ultra', 'Samsung', 'Galaxy Tab S9 / S10 Ultra', 924, 1480, 2, true, 'tablet', { eersteSchermItems: 16, kolomMax: 3 }),

  // Google Pixel
  p('google-pixel-7', 'Google', 'Pixel 7 / 7a / 8a', 412, 915, 2.625, true, 'grote-telefoon'),
  p('google-pixel-8', 'Google', 'Pixel 8', 412, 915, 2.625, true, 'grote-telefoon'),
  p('google-pixel-8-pro', 'Google', 'Pixel 8 Pro', 448, 998, 3, true, 'grote-telefoon'),
  p('google-pixel-9', 'Google', 'Pixel 9', 412, 923, 2.625, true, 'grote-telefoon'),
  p('google-pixel-9-pro', 'Google', 'Pixel 9 Pro', 427, 952, 3, true, 'grote-telefoon'),
  p('google-pixel-9-pro-xl', 'Google', 'Pixel 9 Pro XL', 448, 998, 3, true, 'grote-telefoon'),
  p('google-pixel-tablet', 'Google', 'Pixel Tablet', 800, 1280, 2, true, 'tablet'),

  // Xiaomi / Redmi / POCO
  p('xiaomi-14-15', 'Xiaomi', 'Xiaomi 14 / 15', 400, 890, 3, true, 'telefoon'),
  p('xiaomi-14-15-ultra', 'Xiaomi', 'Xiaomi 14 / 15 Ultra', 412, 915, 3.5, true, 'grote-telefoon'),
  p('redmi-note-13-14-pro', 'Xiaomi', 'Redmi Note 13 / 14 Pro', 393, 873, 2.75, true, 'telefoon', { achtergrondEffecten: false }),
  p('poco-f6-x6-pro', 'Xiaomi', 'POCO F6 / X6 Pro', 406, 904, 3, true, 'telefoon'),
  p('xiaomi-pad-6-7', 'Xiaomi', 'Xiaomi Pad 6 / 7', 800, 1280, 2.25, true, 'tablet'),

  // OnePlus / Motorola / Sony / Huawei / Honor / Nothing
  p('oneplus-12-13', 'OnePlus', 'OnePlus 12 / 13', 412, 919, 3.5, true, 'grote-telefoon'),
  p('oneplus-nord-4', 'OnePlus', 'OnePlus Nord 4', 412, 915, 2.75, true, 'grote-telefoon'),
  p('motorola-edge-50-pro', 'Motorola', 'Motorola Edge 50 Pro', 406, 904, 3, true, 'telefoon'),
  p('motorola-razr-50-ultra', 'Motorola', 'Motorola Razr 50 Ultra', 412, 1008, 2.625, true, 'grote-telefoon'),
  p('sony-xperia-1-v-vi', 'Sony', 'Sony Xperia 1 V / VI', 384, 854, 3, true, 'telefoon'),
  p('huawei-pura-70', 'Huawei', 'Huawei Pura 70 / Mate 60', 419, 912, 3, true, 'grote-telefoon'),
  p('honor-magic-6-7-pro', 'Honor', 'Honor Magic 6 / 7 Pro', 426, 933, 3, true, 'grote-telefoon'),
  p('nothing-phone-2', 'Nothing', 'Nothing Phone (2) / (2a)', 412, 919, 2.625, true, 'grote-telefoon'),

  // Ноутбуки та планшетні ПК / Laptops en hybride toestellen
  p('apple-macbook-air-13', 'Apple', 'MacBook Air 13" (M2/M3)', 1280, 832, 2, false, 'desktop'),
  p('apple-macbook-air-15', 'Apple', 'MacBook Air 15"', 1440, 932, 2, false, 'desktop'),
  p('apple-macbook-pro-14', 'Apple', 'MacBook Pro 14"', 1512, 982, 2, false, 'desktop'),
  p('apple-macbook-pro-16', 'Apple', 'MacBook Pro 16"', 1728, 1117, 2, false, 'breed'),
  p('microsoft-surface-pro', 'Microsoft', 'Surface Pro 9 / 10 / 11', 1440, 960, 2, true, 'desktop', { aanraakMinPx: 40 }),
  p('microsoft-surface-laptop', 'Microsoft', 'Surface Laptop 13.5" / 15"', 1504, 1002, 1.5, true, 'desktop', { aanraakMinPx: 40 }),

  // Настільні монітори / Desktopschermen
  p('desktop-hd', 'Standaard', 'HD-scherm 1366×768', 1366, 768, 1, false, 'desktop', { eersteSchermItems: 14, kolomMax: 3 }),
  p('desktop-fhd-125', 'Standaard', 'Laptop FHD 125% (1536×864)', 1536, 864, 1.25, false, 'desktop'),
  p('desktop-fhd', 'Standaard', 'Full HD 1920×1080', 1920, 1080, 1, false, 'breed'),
  p('desktop-wuxga', 'Standaard', 'WUXGA 1920×1200', 1920, 1200, 1, false, 'breed'),
  p('desktop-qhd', 'Standaard', 'QHD 2560×1440', 2560, 1440, 1, false, 'breed'),
  p('desktop-4k', 'Standaard', '4K UHD 3840×2160', 3840, 2160, 1, false, 'breed'),
  p('desktop-ultrawide', 'Standaard', 'Ultrawide 3440×1440', 3440, 1440, 1, false, 'breed'),
];

/** Визначає клас верстки за логічними розмірами вікна без прив’язки до конкретної моделі. */
export function klasseVoorAfmeting(breedte: number, hoogte: number, aanraking: boolean): SchermKlasse {
  const w = Math.max(240, Math.round(breedte));
  const kleinste = Math.min(w, Math.max(240, Math.round(hoogte)));
  if (aanraking) {
    if (kleinste < 380) return 'compact-telefoon';
    if (kleinste < 410) return 'telefoon';
    if (kleinste < 600) return 'grote-telefoon';
    if (w < 1200) return 'tablet';
    return w >= 1680 ? 'breed' : 'desktop';
  }
  if (w < 380) return 'compact-telefoon';
  if (w < 410) return 'telefoon';
  if (w < 600) return 'grote-telefoon';
  if (w < 1024) return 'tablet';
  if (w < 1680) return 'desktop';
  return 'breed';
}

function maakCssVariabelen(klasse: SchermKlasse, kolomMax: number, aanraakMinPx: number): SchermProfielCssVariabelen {
  return {
    '--profiel-klasse': klasse,
    '--profiel-kolom-max': String(kolomMax),
    '--profiel-aanraak-min': `${aanraakMinPx}px`,
  };
}

/**
 * Миттєво визначає профіль екрана за шириною, висотою, щільністю пікселів і типом введення.
 * Для невідомих розмірів чисто переходить у режим `dynamisch` без зайвих обчислень.
 */
export function bepaalSchermProfiel(
  breedte: number,
  hoogte: number,
  dpr = 1,
  aanraking = false,
): BepaaldSchermProfiel {
  const w = Number.isFinite(breedte) && breedte > 0 ? Math.round(breedte) : 1280;
  const h = Number.isFinite(hoogte) && hoogte > 0 ? Math.round(hoogte) : 800;
  const normDpr = Number.isFinite(dpr) && dpr > 0 ? Math.round(dpr * 100) / 100 : 1;
  const orientatie: 'staand' | 'liggend' = h >= w ? 'staand' : 'liggend';

  let beste: SchermProfielDefinitie | null = null;
  let besteBron: SchermProfielBron = 'dynamisch';
  let besteScore = Number.POSITIVE_INFINITY;

  for (const profiel of SCHERM_PROFIELEN) {
    if (profiel.aanraking !== aanraking) continue;

    // Сенсорні пристрої порівнюємо в обох орієнтаціях, щоб поворот екрана впізнавав ту саму модель.
    const kandidaten: ReadonlyArray<readonly [number, number]> = aanraking
      ? [
          [profiel.breedte, profiel.hoogte],
          [profiel.hoogte, profiel.breedte],
        ]
      : [[profiel.breedte, profiel.hoogte]];

    for (const [pw, ph] of kandidaten) {
      const dw = Math.abs(w - pw);
      const dh = Math.abs(h - ph);
      const ddpr = Math.abs(normDpr - profiel.dpr);

      const isExact = dw <= 4 && dh <= 24 && ddpr <= 0.35;
      // На смартфонах верхня/нижня панель переглядача зменшує видиму висоту до ~160 px.
      const isNabij = !isExact && dw <= 12 && dh <= 165 && ddpr <= 0.55;
      if (!isExact && !isNabij) continue;

      const score = (isExact ? 0 : 1000) + dw * 12 + dh + ddpr * 40;
      if (score < besteScore) {
        besteScore = score;
        beste = profiel;
        besteBron = isExact ? 'exact' : 'nabij';
      }
    }
  }

  if (beste) {
    const kolomMax =
      orientatie === 'liggend' && beste.klasse !== 'desktop' && beste.klasse !== 'breed'
        ? Math.min(4, beste.kolomMax + 1)
        : beste.kolomMax;
    return {
      klasse: beste.klasse,
      bron: besteBron,
      profiel: beste,
      orientatie,
      breedte: w,
      hoogte: h,
      dpr: normDpr,
      aanraking,
      eersteSchermItems: beste.eersteSchermItems,
      achtergrondEffecten: beste.achtergrondEffecten,
      cssVariabelen: maakCssVariabelen(beste.klasse, kolomMax, beste.aanraakMinPx),
    };
  }

  const klasse = klasseVoorAfmeting(w, h, aanraking);
  const standaard = KLASSE_STANDAARD[klasse];
  const aanraakMinPx = aanraking ? Math.max(44, standaard.aanraakMinPx) : standaard.aanraakMinPx;
  const kolomMax =
    orientatie === 'liggend' && klasse !== 'desktop' && klasse !== 'breed'
      ? Math.min(4, standaard.kolomMax + 1)
      : standaard.kolomMax;

  return {
    klasse,
    bron: 'dynamisch',
    profiel: null,
    orientatie,
    breedte: w,
    hoogte: h,
    dpr: normDpr,
    aanraking,
    eersteSchermItems: standaard.eersteSchermItems,
    achtergrondEffecten: standaard.achtergrondEffecten,
    cssVariabelen: maakCssVariabelen(klasse, kolomMax, aanraakMinPx),
  };
}
