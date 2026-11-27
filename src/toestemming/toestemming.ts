// SITE-001 (пункти 5 і 19): згода на необов'язкову аналітику та власна знеособлена аналітика.
// Сайт використовує лише необхідні реп'яшки (cookie) для входу; аналітика типово вимкнена і вмикається лише явною згодою.
// Вибір зберігається у місцевому сховищі оглядача (не в реп'яшку) і, якщо є сеанс, передається на сервер
// (POST /api/owner/privacy/toestemming), бо саме сервер вирішує, чи рахувати подію (backend/privacy.ts).
// Подія — лише назва розділу («bezoek.<сервіс>»), без адреси сторінки, ідентифікатора, IP чи пристрою.
// nl: toestemming voor optionele analyse en eigen anonieme analyse. Alleen noodzakelijke cookies; analyse standaard uit.

export const TOESTEMMING_SLEUTEL = 'mr-toestemming-v1';
export const TOESTEMMING_COOKIE = 'mr_toestemming_v1';
export const TOESTEMMING_VERSIE = 1;
export const TOESTEMMING_ROUTE = '/api/owner/privacy/toestemming';
export const GEBEURTENIS_ROUTE = '/api/owner/privacy/gebeurtenis';
/** Подія на сервері: ^[a-z0-9][a-z0-9_.-]{0,59}$ (backend/privacy.ts → GEBEURTENIS). */
export const GEBEURTENIS_PATROON = /^[a-z0-9][a-z0-9_.-]{0,59}$/;
export const HEROPEN_GEBEURTENIS = 'mr-toestemming-heropenen';

export type Keuze = { versie: number; analyse: boolean; tijd: number };
type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const veiligeOpslag = (): Opslag | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const isStandaardOpslag = (opslag: Opslag | null): boolean => opslag !== null && opslag === veiligeOpslag();
const gedeeldDomein = (): boolean => {
  try {
    const h = typeof location !== 'undefined' ? String(location.hostname || '').toLowerCase() : '';
    return h === 'tarasevych.com' || h.endsWith('.tarasevych.com');
  } catch { return false; }
};
const ontleedKeuze = (ruw: string | null | undefined): Keuze | null => {
  if (!ruw) return null;
  try {
    const k = JSON.parse(ruw) as Partial<Keuze>;
    if (k?.versie !== TOESTEMMING_VERSIE || typeof k.analyse !== 'boolean' || !Number.isFinite(k.tijd)) return null;
    return { versie: TOESTEMMING_VERSIE, analyse: k.analyse, tijd: Number(k.tijd) };
  } catch { return null; }
};
const leesCookieKeuze = (): Keuze | null => {
  try {
    if (typeof document === 'undefined' || typeof document.cookie !== 'string') return null;
    const deel = document.cookie.split('; ').find((item) => item.startsWith(`${TOESTEMMING_COOKIE}=`));
    if (!deel) return null;
    return ontleedKeuze(decodeURIComponent(deel.slice(TOESTEMMING_COOKIE.length + 1)));
  } catch { return null; }
};
const schrijfCookieKeuze = (k: Keuze | null): void => {
  try {
    if (typeof document === 'undefined') return;
    const desc = Object.getOwnPropertyDescriptor(document, 'cookie');
    const waarde = k ? encodeURIComponent(JSON.stringify(k)) : '';
    if (desc && 'value' in desc && desc.writable) {
      const overig = String(document.cookie || '').split('; ').filter((s) => s && !s.startsWith(`${TOESTEMMING_COOKIE}=`));
      if (k) overig.push(`${TOESTEMMING_COOKIE}=${waarde}`);
      document.cookie = overig.join('; ');
      return;
    }
    const domein = gedeeldDomein() ? '; Domain=.tarasevych.com' : '';
    const secure = typeof location !== 'undefined' && location.protocol === 'http:' ? '' : '; Secure';
    if (k) {
      document.cookie = `${TOESTEMMING_COOKIE}=${waarde}; Path=/; Max-Age=31536000; SameSite=Lax${secure}${domein}`;
    } else {
      document.cookie = `${TOESTEMMING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}${domein}`;
      if (domein) document.cookie = `${TOESTEMMING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    }
  } catch { /* немає документа */ }
};

/** Читає збережений вибір (місцеве сховище + спільний реп'яшок для всіх піддоменів *.tarasevych.com); пошкоджений або застарілий запис вважається відсутнім. */
export function leesKeuze(opslag: Opslag | null = veiligeOpslag()): Keuze | null {
  if (!opslag) return null;
  let ruw: string | null = null;
  try { ruw = opslag.getItem(TOESTEMMING_SLEUTEL); } catch { ruw = null; }
  const lokaal = ontleedKeuze(ruw);
  if (ruw !== null && ruw !== undefined && !lokaal) return null;
  const uitCookie = isStandaardOpslag(opslag) ? leesCookieKeuze() : null;
  if (lokaal && uitCookie) {
    const nieuwste = uitCookie.tijd > lokaal.tijd ? uitCookie : lokaal;
    if (nieuwste !== lokaal) { try { opslag.setItem(TOESTEMMING_SLEUTEL, JSON.stringify(nieuwste)); } catch { /* немає сховища */ } }
    return nieuwste;
  }
  if (!lokaal && uitCookie) {
    try { opslag.setItem(TOESTEMMING_SLEUTEL, JSON.stringify(uitCookie)); } catch { /* немає сховища */ }
    return uitCookie;
  }
  return lokaal;
}

export function bewaarKeuze(analyse: boolean, opslag: Opslag | null = veiligeOpslag(), nu = Date.now()): Keuze {
  const k: Keuze = { versie: TOESTEMMING_VERSIE, analyse: analyse === true, tijd: nu };
  try { opslag?.setItem(TOESTEMMING_SLEUTEL, JSON.stringify(k)); } catch { /* приватний режим без сховища: вибір діє до перезавантаження */ }
  if (isStandaardOpslag(opslag)) schrijfCookieKeuze(k);
  return k;
}

export function wisKeuze(opslag: Opslag | null = veiligeOpslag()): void {
  try { opslag?.removeItem(TOESTEMMING_SLEUTEL); } catch { /* немає сховища */ }
  if (isStandaardOpslag(opslag)) schrijfCookieKeuze(null);
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
