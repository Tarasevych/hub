// SITE-001 (пункти 5 і 19): згода на необов'язкову аналітику та власна знеособлена аналітика.
// Сайт використовує лише необхідні реп'яшки (cookie) для входу; аналітика типово вимкнена і вмикається лише явною згодою.
// Вибір зберігається у місцевому сховищі оглядача (не в реп'яшку) і, якщо є сеанс, передається на сервер
// (POST /api/owner/privacy/toestemming), бо саме сервер вирішує, чи рахувати подію (backend/privacy.ts).
// Подія — лише назва розділу («bezoek.<сервіс>»), без адреси сторінки, ідентифікатора, IP чи пристрою.
// nl: toestemming voor optionele analyse en eigen anonieme analyse. Alleen noodzakelijke cookies; analyse standaard uit.

export const TOESTEMMING_SLEUTEL = 'mr-toestemming-v1';
export const TOESTEMMING_VERSIE = 1;
export const TOESTEMMING_ROUTE = '/api/owner/privacy/toestemming';
export const GEBEURTENIS_ROUTE = '/api/owner/privacy/gebeurtenis';
/** Подія на сервері: ^[a-z0-9][a-z0-9_.-]{0,59}$ (backend/privacy.ts → GEBEURTENIS). */
export const GEBEURTENIS_PATROON = /^[a-z0-9][a-z0-9_.-]{0,59}$/;
export const HEROPEN_GEBEURTENIS = 'mr-toestemming-heropenen';

export type Keuze = { versie: number; analyse: boolean; tijd: number };
type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const veiligeOpslag = (): Opslag | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** Читає збережений вибір; пошкоджений або застарілий запис вважається відсутнім (смуга згоди з'явиться знову). */
export function leesKeuze(opslag: Opslag | null = veiligeOpslag()): Keuze | null {
  try {
    const ruw = opslag?.getItem(TOESTEMMING_SLEUTEL);
    if (!ruw) return null;
    const k = JSON.parse(ruw) as Partial<Keuze>;
    if (k?.versie !== TOESTEMMING_VERSIE || typeof k.analyse !== 'boolean' || !Number.isFinite(k.tijd)) return null;
    return { versie: TOESTEMMING_VERSIE, analyse: k.analyse, tijd: Number(k.tijd) };
  } catch { return null; }
}

export function bewaarKeuze(analyse: boolean, opslag: Opslag | null = veiligeOpslag(), nu = Date.now()): Keuze {
  const k: Keuze = { versie: TOESTEMMING_VERSIE, analyse: analyse === true, tijd: nu };
  try { opslag?.setItem(TOESTEMMING_SLEUTEL, JSON.stringify(k)); } catch { /* приватний режим без сховища: вибір діє до перезавантаження */ }
  return k;
}

export function wisKeuze(opslag: Opslag | null = veiligeOpslag()): void {
  try { opslag?.removeItem(TOESTEMMING_SLEUTEL); } catch { /* немає сховища */ }
}

/** Смуга згоди потрібна, лише поки немає дійсного вибору. */
export const bandNodig = (keuze: Keuze | null) => keuze === null;

/** Назва події для сервісу: лише латинські малі літери, без адреси сторінки й параметрів. */
export function bezoekGebeurtenis(dienst: string): string | null {
  const d = String(dienst || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  const naam = `bezoek.${d}`;
  return d && GEBEURTENIS_PATROON.test(naam) ? naam : null;
}

/** Є сеанс (з ранньої розмітки index.html): без нього запити до закритих маршрутів не надсилаються. */
export function sessieBekend(w: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  const p = (w as { __TSV_PRESENTATION__?: { session?: string; domainAccountKey?: string } } | undefined)?.__TSV_PRESENTATION__;
  return p?.session === 'known' || Boolean(p?.domainAccountKey && p.domainAccountKey !== 'anon');
}

export type Post = (url: string, body: unknown) => Promise<unknown>;
export type Context = { service: string; tabContext: string; sourceOrigin: string };

/** Передає вибір на сервер; помилки (немає сеансу, обліковий запис не схвалено) не заважають сторінці. */
export async function meldKeuzeAanServer(keuze: Keuze, post: Post, ctx: Context): Promise<boolean> {
  try { await post(TOESTEMMING_ROUTE, { ...ctx, analyticsConsent: keuze.analyse }); return true; } catch { return false; }
}

/**
 * Одна подія відвідування на сервіс за сеанс вкладки, лише за згоди. Повертає назву надісланої події або null.
 * Сервер повторно перевіряє власну згоду й рахує лише денний лічильник без прив'язки до облікового запису.
 */
export async function telBezoek(dienst: string, post: Post, ctx: Context, opslag: Opslag | null = veiligeOpslag(), sessie: Pick<Storage, 'getItem' | 'setItem'> | null = (() => { try { return sessionStorage; } catch { return null; } })()): Promise<string | null> {
  const keuze = leesKeuze(opslag);
  if (!keuze?.analyse) return null;
  const naam = bezoekGebeurtenis(dienst);
  if (!naam) return null;
  const merk = `mr-bezoek-geteld:${naam}`;
  try { if (sessie?.getItem(merk)) return null; sessie?.setItem(merk, '1'); } catch { /* без сховища сеансу — одна спроба на завантаження */ }
  try { await post(GEBEURTENIS_ROUTE, { ...ctx, naam }); return naam; } catch { return null; }
}

/** Відкрити смугу згоди повторно (посилання «Налаштування реп'яшків»). */
export function heropenToestemming(): void {
  wisKeuze();
  try { window.dispatchEvent(new Event(HEROPEN_GEBEURTENIS)); } catch { /* поза оглядачем */ }
}
