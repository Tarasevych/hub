// IDENTITEIT-015 (приймання aanmelden-sleutels, давня вада): центр облікового запису показує «Безпеку», «Вхід» і «Відновлення» як
// ОКРЕМІ екземпляри панелі доступу (ToegangslaagWeergave з `alleen`), кожен зі своїм станом. Коди відновлення, створені в «Безпеці»
// (після налаштування застосунку-автентифікатора), не потрапляли в розділ «Відновлення»: після «Готово» там лишалося «Кодів ще немає»
// до перезавантаження сторінки. Тепер успішна зміна доступу в одному екземплярі сповіщає інші, і вони перечитують стан із сервера.
// Gedeeld signaal «toegang gewijzigd»: andere panelen en de herstelcodesectie lezen vers van de server (geen geheimen in het signaal).
export const TOEGANG_GEWIJZIGD = 'mr-toegang-gewijzigd';

export type ToegangGewijzigdDetail = { bron: string; route: string };

/** Сповістити інші частини сторінки: доступ змінено (`bron` — хто змінив, щоб не перечитувати самого себе). */
export function meldToegangGewijzigd(bron: string, route: string): void {
  try { window.dispatchEvent(new CustomEvent<ToegangGewijzigdDetail>(TOEGANG_GEWIJZIGD, { detail: { bron, route } })); } catch { /* geen venster (test) */ }
}

/** Підписка; повертає відписку. Сигнали від `eigen` (того самого екземпляра) пропускаються. */
export function opToegangGewijzigd(eigen: string, fn: (d: ToegangGewijzigdDetail) => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return () => undefined;
  const luister = (e: Event) => { const d = (e as CustomEvent<ToegangGewijzigdDetail>).detail; if (d && d.bron !== eigen) fn(d); };
  window.addEventListener(TOEGANG_GEWIJZIGD, luister);
  return () => window.removeEventListener(TOEGANG_GEWIJZIGD, luister);
}

/** Маршрути, після яких змінюються коди відновлення (розділ «Коди відновлення» перечитує свій огляд). */
export const RAAKT_HERSTELCODES = /\/api\/owner\/access\/(totp\/(confirm|disable)|recovery\/(rotate|bekeken|intrekken))$/;
