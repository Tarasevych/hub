// «Вийти» у вікні кодового слова (SEC-002, aanmelden-07).
//
// Тут людина ще не назвала кодове слово, але Google уже пустив: у браузері є чинна сесія (cookie до 30 діб). Тому «Вийти» має
// завершити САМЕ ЇЇ — вихід цього облікового запису в усьому браузері, — а не лише позначити цю вкладку як «вийшла»: інакше
// наступна людина за цим комп’ютером відкриває нову вкладку й знову стоїть перед тим самим вікном із чужим обліковим записом.
// Окремий файл без залежностей від вікна браузера, щоб правило перевірялося тестом (tests/eenheid/sec-002-g06-20261112.test.ts).

/** Маршрут виходу облікового запису з цього браузера: відкликає якірну сесію, вкладки та запам’ятовування; сервер очищує cookie. */
export const POORT_AFMELD_ROUTE = '/api/owner/session/logout-account-browser';

/** 'klaar' — сесії в браузері вже немає; 'mislukt' — сервер не підтвердив вихід, сесія може бути ще чинна. */
export type PoortAfmeldUitkomst = 'klaar' | 'mislukt';

type Post = (url: string, data: Record<string, unknown>) => Promise<unknown>;

/**
 * Вихід із вікна кодового слова. 401 означає, що сесії вже немає (вийшли в іншій вкладці, строк минув) — це теж «вийшли».
 * Будь-яка інша помилка (сервер, мережа) — НЕ вихід: вікно має сказати про це, а не вдавати, що все гаразд.
 */
export async function poortAfmelden(post: Post, lichaam: Record<string, unknown>): Promise<PoortAfmeldUitkomst> {
  try {
    await post(POORT_AFMELD_ROUTE, lichaam);
    return 'klaar';
  } catch (e) {
    return Number((e as { status?: unknown } | null)?.status) === 401 ? 'klaar' : 'mislukt';
  }
}
