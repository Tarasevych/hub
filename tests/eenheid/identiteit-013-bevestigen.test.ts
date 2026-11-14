// IDENTITEIT-013 (фаза 2 «Макета»): діалоги підтвердження й правдиві тексти.
// Перевіряє: (1) спільний BevestigDialoog — «!», фокус на «Скасувати», лише людина, Esc скасовує; (2) кожна небезпечна дія
// спершу відкриває діалог, а не діє одразу; (3) foutNaarTekst дає двомовні пояснення відомих відмов і null для невідомих;
// (4) kopieerTekst повертає false замість винятку, коли браузер відмовляє; (5) автотема, «Забути місце», «не зберігати браузер»,
// автозбереження меню, форма віджета й правдивий текст видалення облікового запису.
// IDENTITEIT-013: bevestigingsdialogen en eerlijke teksten — bron- en gedragscontrole.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { foutNaarTekst } from '../../src/weigeringen';
import { kopieerTekst, KOPIEER_MISLUKT } from '../../src/platform/klembord';

const lees = (p: string) => readFileSync(p, 'utf8');
const plat = (s: string) => s.replace(/\s+/g, '');
const kyr = /[Ѐ-ӿ]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-013-bevestigen');

  // ------------------------------------------------------------------ 1. спільний діалог
  const dlg = lees('src/platform/BevestigDialoog.tsx');
  const css = lees('src/platform/bevestig-dialoog.css');
  check('діалог побудовано на спільному Venster (стек вікон, фокус-пастка, телефон)', /from '\.\/vensters'/.test(dlg) && dlg.includes('<Venster'));
  check('підтвердити може лише людина (doorMens) і небезпечну кнопку не натискає ШІ (geenAi)', dlg.includes('!doorMens(e)') && dlg.includes('geenAi'));
  check('небезпечна дія: знак «!» і фокус спершу на «Скасувати»', dlg.includes("bevestig-dialoog-uitroep") && /autoFocus=\{p\.gevaarlijk\}/.test(dlg));
  check('Esc скасовує й не закриває зовнішнє вікно', dlg.includes("e.key === 'Escape'") && dlg.includes('stopPropagation') && dlg.includes('p.onAnnuleer()'));
  check('поки дія виконується, закрити не можна', dlg.includes('sluitenUit={bezig}') && dlg.includes('disabled={bezig}'));
  check('причина: щонайменше 3 символи, інакше кнопка вимкнена', dlg.includes('reden.trim().length >= 3') && dlg.includes('!redenOk'));
  check('збій дії показується людині, а не мовчки', dlg.includes("role='alert'") && /Не вдалося виконати дію/.test(dlg) && /De handeling is mislukt/.test(dlg));
  check('діалог повертає фокус туди, звідки його відкрили', dlg.includes('focusTerug('));
  check('CSS діалогу: лише токени теми, без фіксованих позицій', !/position\s*:\s*fixed/.test(css) && css.includes('var(--fout') && css.includes('var(--accent'));
  check('CSS діалогу: на телефоні кнопки на всю ширину', /@media \(max-width:560px\)/.test(css));
  check('CSS діалогу: режим високого контрасту', css.includes('forced-colors:active'));

  // ------------------------------------------------------------------ 2. кожна небезпечна дія — через діалог
  const plaatsen: Array<[string, string, string]> = [
    ['src/identiteit/Profielfoto.tsx', 'foto-herstellen', 'прибрати власну світлину'],
    ['src/toegangslaag-panelen.tsx', 'wachtwoord-verwijderen', 'прибрати пароль (стара панель)'],
    ['src/aanmeld-vnext/onderdelen/MethodeDetail.tsx', 'wachtwoord-verwijderen', 'прибрати пароль (нова панель)'],
    ['src/ZijbalkInstellingen.tsx', 'concepten-uit', 'вимкнути чернетки'],
    ['src/App.tsx', 'deel-intrekken', 'відкликати учасника'],
    ['src/InstellingencentrumWeergave.tsx', 'ruimte-herstellen', 'відновити простір'],
    ['src/InstellingencentrumWeergave.tsx', 'account-verwijderen', 'видалити обліковий запис'],
  ];
  for (const [bestand, id, naam] of plaatsen) {
    const s = lees(bestand);
    check(`${naam}: спершу діалог «${id}»`, s.includes('<BevestigDialoog') && s.includes(`id='${id}'`));
  }
  const zijbalk = lees('src/ZijbalkInstellingen.tsx');
  check('чернетки: у діалозі видно, скільки буде видалено', zijbalk.includes('conceptAantal()') && /aantal=\{/.test(zijbalk));
  check('concepten.ts віддає публічний лічильник', /export const conceptAantal/.test(lees('src/concepten.ts')));
  const app = lees('src/App.tsx');
  check('відкликання учасника не відбувається одразу після кліку', /intrekDoel/.test(app) && !/onClick=\{\(\)=>\s*void revokeShare/.test(plat(app)));

  // ------------------------------------------------------------------ 3. правдиві тексти видалення
  const centrum = lees('src/InstellingencentrumWeergave.tsx');
  check('власнику блок видалення не пропонує видалити себе', centrum.includes('data-wissen-eigenaar'));
  check('текст видалення: 30 днів на відновлення, без «остаточно»', centrum.includes('data-wissen-uitleg') && /30/.test(centrum) && !/Видалення остаточне/.test(centrum));
  check('відновлення простору показує причину архівації', centrum.includes('data-archief-reden') && centrum.includes('archivedReason'));
  check('сервер віддає причину архівації', (plat(lees('backend/index.ts')).match(/archivedReason:item\.archivedReason/g) || []).length >= 2);
  check('сторінка облікового запису теж без «остаточно»', !/Видалення остаточне/.test(lees('src/IdentiteitBeheerWeergave.tsx')));

  // ------------------------------------------------------------------ 4. зрозумілі відмови (поведінка)
  const fout = (code: string, extra: Record<string, unknown> = {}) => ({ response: { data: { error: code, ...extra } } });
  for (const code of ['OWNER_NIET_WISSEN', 'STEP_UP_REQUIRED', 'STEP_UP_STRONG_REQUIRED', 'LAST_LOGIN_METHOD_PROTECTED', 'ACCESS_PASSWORD_TOO_SHORT', 'ACCESS_PASSWORD_TOO_LONG', 'BLOK_URL_ONGELDIG', 'ZELFTEST_ALLEEN_BEHEER']) {
    const p = foutNaarTekst(fout(code));
    check(`foutNaarTekst(${code}): українська й нідерландська`, !!p && kyr.test(p[0]) && !kyr.test(p[1]) && p[1].length > 10, p ? p[0].slice(0, 50) : 'null');
  }
  const rl = foutNaarTekst(fout('RATE_LIMITED', { retryAfter: 125 }));
  check('RATE_LIMITED: називає час очікування (≈3 хв)', !!rl && rl[0].includes('3 хв') && rl[1].includes('3 min'), rl ? rl[0] : 'null');
  const stap = foutNaarTekst({ response: { data: { reasonCode: 'STEP_UP_REQUIRED' } } });
  check('код береться і з reasonCode (step-up)', !!stap && kyr.test(stap[0]));
  check('невідома відмова → null (екран лишає свій текст)', foutNaarTekst(fout('IETS_ONBEKENDS')) === null && foutNaarTekst(null) === null);
  const dienst = lees('src/VerenigdDienstApp.tsx');
  check('віджети: помилка не губиться (try/catch + foutNaarTekst)', /addSettingsWidget[\s\S]{0,600}catch/.test(dienst) && dienst.includes('foutNaarTekst'));

  // ------------------------------------------------------------------ 5. безпечне копіювання (поведінка)
  const g = globalThis as unknown as { navigator?: unknown; document?: unknown };
  const navOud = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const docOud = g.document;
  const zetNav = (v: unknown) => Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true, writable: true });
  try {
    let gekregen = '';
    zetNav({ clipboard: { writeText: async (t: string) => { gekregen = t; } } });
    check('kopieerTekst: дозволено → true і саме цей текст', (await kopieerTekst('abc')) === true && gekregen === 'abc');
    zetNav({ clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } } });
    g.document = undefined;
    check('kopieerTekst: відмова без запасного шляху → false, без винятку', (await kopieerTekst('abc')) === false);
    const knopen: string[] = [];
    g.document = {
      createElement: () => ({ value: '', style: {}, setAttribute: () => undefined, select: () => knopen.push('select'), remove: () => knopen.push('remove') }),
      body: { appendChild: () => knopen.push('append') },
      execCommand: (c: string) => { knopen.push(c); return true; },
    };
    check('kopieerTekst: відмова → запасний шлях через поле, поле прибрано', (await kopieerTekst('abc')) === true && knopen.join(',') === 'append,select,copy,remove', knopen.join(','));
  } finally {
    if (navOud) Object.defineProperty(globalThis, 'navigator', navOud); else delete (globalThis as { navigator?: unknown }).navigator;
    g.document = docOud;
  }
  check('текст невдалого копіювання — двома мовами', kyr.test(KOPIEER_MISLUKT[0]) && !kyr.test(KOPIEER_MISLUKT[1]));
  for (const b of ['src/App.tsx', 'src/InstellingencentrumWeergave.tsx', 'src/McpDienstWeergave.tsx']) {
    check(`${b}: копіювання через kopieerTekst, не напряму`, lees(b).includes('kopieerTekst') && !/navigator\.clipboard\.writeText/.test(lees(b)));
  }

  // ------------------------------------------------------------------ 6. автотема
  const thema = lees('src/thema/ThemaInstellingen.tsx');
  check('автотема: «Темна тема з» / «до» замість незрозумілих полів', thema.includes('Темна тема з') && thema.includes('Donker thema vanaf'));
  check('автотема: «Призупинити до наступного перемикання»', thema.includes('Призупинити до наступного перемикання'));
  check('автотема: пояснено, що приблизне місце синхронізується', thema.includes('у налаштуваннях облікового запису') && thema.includes('на всіх ваших пристроях'));
  check('автотема: кнопка «Забути місце» прибирає координати', thema.includes('data-thema-vergeet') && /Забути місце/.test(thema));

  // ------------------------------------------------------------------ 7. «не зберігати браузер»
  const sessies = lees('src/SessiesOverzicht.tsx');
  check('вимкнення одразу відкликає грант цього браузера', sessies.includes('wisselOnthouden') && sessies.includes("kind:'grant'") && sessies.includes('/revoke'));
  check('перемикач заблоковано, поки триває відкликання', /role='switch'[^>]*disabled=\{bezig\}/.test(sessies));
  check('сервер не перезаписує локальне «вимкнено»', plat(dienst).includes('model.rememberedBrowser!==false&&leesAanmeldenOnthouden()'));
  check('огляд безпеки позначає грант цього браузера як поточний', /current:item\.id===\(auth\.tabSession\?\.grantId\|\|auth\.session\.grantId\)/.test(lees('backend/index.ts')));

  // ------------------------------------------------------------------ 8. меню й віджети
  check('видимість меню зберігається автоматично (з видимим станом)', centrum.includes('menuTimer') && centrum.includes('data-menu-opslag'));
  check('віджет «Власний»: поля ширини й висоти з межами', centrum.includes('data-widget-maat') && /min=\{?['"]?260/.test(centrum) && /max=\{?['"]?1400/.test(centrum));
  check('зовнішній віджет: назва й https-посилання обов’язкові', /required/.test(centrum) && /pattern=['"]https/.test(centrum));
  check('глядач бачить пояснення замість робочої форми', centrum.includes('data-widget-alleen-kijken'));

  // ------------------------------------------------------------------ 9. давня вада: синхронізація сповіщень без контексту (401)
  const ctxBron = lees('src/meldingen/sessie-context.ts');
  check('meldingLichaam додає service і tabContext', ctxBron.includes('serviceFromLocation') && ctxBron.includes('ecosystemTabContext()'));
  const syncBronnen = lees('src/meldingen/gelezen-sync.ts') + lees('src/meldingen/v2/status-opslag.ts');
  check('усі запити /api/owner/meldingen/(status|gelezen) несуть контекст сесії', (syncBronnen.match(/api\.post\('\/api\/owner\/meldingen\/[a-z/]+', meldingLichaam\(/g) || []).length === 5 && !/meldingen\/(status|gelezen)[a-z/]*', \{/.test(syncBronnen));
  check('діалог не дублює заголовок шапки Venster (лише для читачів екрана)', /\.bevestig-dialoog-titel\{position:absolute/.test(css));
  check('небезпечна кнопка: текст через --text-on-vlak (контраст у темній темі)', css.includes('color:var(--text-on-vlak'));

  return einde();
}
