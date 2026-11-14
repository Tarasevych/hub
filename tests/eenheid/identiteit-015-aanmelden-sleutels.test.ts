// IDENTITEIT-015 (приймання aanmelden-sleutels): вади, знайдені e2e tests/e2e/identiteit-015-aanmelden.e2e.ts.
// (1) Після налаштування застосунку-автентифікатора в «Безпеці» нові коди
// відновлення показано й збережено («Готово»), а розділ «Відновлення» (окремий екземпляр панелі доступу) лишався з «Кодів ще немає»
// до перезавантаження. Тут — сигнал «доступ змінено» між екземплярами:
// хто отримує, хто ні, які маршрути зачіпають коди, і що обидва компоненти справді підписані й сповіщають.
// (2) Кнопки вікна «Другий крок входу» (і кодового слова) мали вигляд простого тексту — «Вийти» не читалася як кнопка.
// Signaal «toegang gewijzigd» tussen de panelen; zichtbare knoppen in het poortvenster.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { RAAKT_HERSTELCODES, TOEGANG_GEWIJZIGD, meldToegangGewijzigd, opToegangGewijzigd, type ToegangGewijzigdDetail } from '../../src/toegang-gewijzigd';

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-aanmelden-sleutels');
  const g = globalThis as Record<string, unknown>;
  const vorig = Object.getOwnPropertyDescriptor(g, 'window');
  const doel = new EventTarget();
  Object.defineProperty(g, 'window', { value: Object.assign(doel, { dispatchEvent: doel.dispatchEvent.bind(doel), addEventListener: doel.addEventListener.bind(doel), removeEventListener: doel.removeEventListener.bind(doel) }), configurable: true, writable: true });
  try {
    const bijA: ToegangGewijzigdDetail[] = [], bijB: ToegangGewijzigdDetail[] = [];
    const uitA = opToegangGewijzigd('a', (d) => bijA.push(d));
    const uitB = opToegangGewijzigd('b', (d) => bijB.push(d));
    meldToegangGewijzigd('a', '/api/owner/access/totp/confirm');
    check('сигнал від екземпляра «a» отримує лише «b» (сам себе «a» не перечитує)', bijA.length === 0 && bijB.length === 1 && bijB[0].route === '/api/owner/access/totp/confirm' && bijB[0].bron === 'a');
    uitB();
    meldToegangGewijzigd('c', '/api/owner/access/recovery/bekeken');
    check('після відписки «b» більше нічого не отримує; «a» отримує сигнал від «c»', bijB.length === 1 && bijA.length === 1 && bijA[0].bron === 'c');
    uitA();
    meldToegangGewijzigd('c', '/api/owner/access/recovery/rotate');
    check('після відписки — жодних викликів (без витоку слухачів)', bijA.length === 1);
    check('у сигналі немає таємниць: лише джерело й маршрут', Object.keys(bijA[0]).sort().join() === 'bron,route' && TOEGANG_GEWIJZIGD === 'mr-toegang-gewijzigd');
  } finally {
    if (vorig) Object.defineProperty(g, 'window', vorig); else delete g.window;
  }
  // без вікна (сервер, тест) — тихо
  check('без window: meld/op не падають', (() => { try { meldToegangGewijzigd('x', '/y'); opToegangGewijzigd('x', () => undefined)(); return true; } catch { return false; } })());

  const raakt = ['totp/confirm', 'totp/disable', 'recovery/rotate', 'recovery/bekeken', 'recovery/intrekken'].map((p) => `/api/owner/access/${p}`);
  const nietRaakt = ['passkeys/hernoemen', 'password/set', 'totp/start', 'recovery/overzicht', 'policy/save'].map((p) => `/api/owner/access/${p}`);
  check('маршрути, що змінюють коди відновлення: confirm/disable автентифікатора, створення, «Готово», відкликання; інші — ні',
    raakt.every((r) => RAAKT_HERSTELCODES.test(r)) && nietRaakt.every((r) => !RAAKT_HERSTELCODES.test(r)));

  const weergave = readFileSync('src/ToegangslaagWeergave.tsx', 'utf8');
  const herstel = readFileSync('src/HerstelcodesSectie.tsx', 'utf8');
  const write = weergave.slice(weergave.indexOf('const write=async'), weergave.indexOf('// Nieuwe herstelcodes.'));
  check('панель доступу: після успішної зміни (write → load) сповіщає інші екземпляри, а сама слухає й перечитує знімок без кешу',
    /await load\(true\);\s*meldToegangGewijzigd\(eigenId\.current,route\)/.test(write) && /opToegangGewijzigd\(eigenId\.current,\(\)=>\{leesVergeten\('\/api\/owner\/access\/snapshot'\);void loadRef\.current\(true\);\}\)/.test(weergave));
  check('розділ кодів відновлення: слухає сигнал, на маршрути кодів скидає кеш огляду й перечитує; після «Відкликати всі» сам сповіщає',
    /opToegangGewijzigd\(eigenId\.current,d=>\{if\(RAAKT_HERSTELCODES\.test\(d\.route\)\)\{leesVergeten\('\/api\/owner\/access\/recovery\/overzicht'\);void ladenRef\.current\(true\);\}\}\)/.test(herstel)
    && /meldToegangGewijzigd\(eigenId\.current,'\/api\/owner\/access\/recovery\/intrekken'\)/.test(herstel));
  const css = readFileSync('src/geheim/codewoord-poort.css', 'utf8');
  /** Тіло першого CSS-правила, чий селектор закінчується на `kinec` (точний збіг рядка перед «{»). */
  const regel = (kinec: string) => { const i = css.indexOf(`${kinec} {`); return i < 0 ? '' : css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i)); };
  const knop = regel('.codewoord-poort-knoppen button'), hoofd = regel(".codewoord-poort-knoppen button[type='submit']");
  check('вікно воріт: кнопки мають рамку, відступи й шрифт сайту; головна дія — кольорова (акцент), висота — токен дотику; видимий фокус',
    /border:\s*1px solid/.test(knop) && /padding:/.test(knop) && /font:\s*inherit/.test(knop) && /min-height:\s*var\(--tik-hoogte/.test(knop)
    && /background:\s*var\(--boot-accent/.test(hoofd) && /:focus-visible\s*\{\s*outline:/.test(css));

  // (3) Поки ворота зачинені, центр облікового запису показував «Не вдалося завантажити сесії» — це не збій, а сама дія воріт.
  const { isPoortWeigering } = await import('../../src/geheim/tweede-factor-poort-brug');
  const fout = (code: string) => ({ response: { status: 401, data: { error: code } } });
  check('ворота: відмови TWEEDE_FACTOR_POORT і CODEWOORD_POORT — «не збій»; інші відмови й мережеві помилки — збій',
    isPoortWeigering(fout('TWEEDE_FACTOR_POORT')) && isPoortWeigering(fout('CODEWOORD_POORT')) && isPoortWeigering({ data: { error: 'TWEEDE_FACTOR_POORT' } })
    && !isPoortWeigering(fout('OWNER_SESSION_INVALID')) && !isPoortWeigering(new Error('NETWORK_ERROR')) && !isPoortWeigering(null) && !isPoortWeigering(undefined));
  const dienst = readFileSync('src/VerenigdDienstApp.tsx', 'utf8');
  check('«Сесії»: помилку завантаження показано, лише якщо це НЕ відмова воріт', /catch\(e\)\{[^}]*if\(!cached&&!isPoortWeigering\(e\)\)say\('Не вдалося завантажити сесії\.'/.test(dienst));
  return einde();
}
