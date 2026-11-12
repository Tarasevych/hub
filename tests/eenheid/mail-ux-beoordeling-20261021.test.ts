// Eenheidstest 21.10.2026 (рецензент UX, свіже око після чотирьох агентів) — пошта на телефоні (360/390 px) і в альбомній
// орієнтації (844×390), світла й темна тема, uk + nl. Знахідки зі знімків ЛИШЕ видимої області (не розгорнутого скролу):
//  R1 шапка пошти прозора — прокручені листи просвічували між «☰», пошуком, «оновити», шестернею й аватаром;
//  R2 вкладення в рядку: назва обрізана до «foto…» / «ra…», хоча плашки й так переносяться в окремі рядки;
//  R3 тост на bottom 84 px лягав на «Новий лист» (його «×» під FAB), смуга «Сервер знову відповідає» — на дзвоник;
//  R4 «Перевірка всіх адрес» на телефоні виходила за правий край на 30+ px (×-кнопка поза екраном) і займала пів екрана;
//  R5 вікно читання на 360 px: друга дія шапки обрізана наполовину під «⋮» (дев'ять кнопок у 360 px);
//  R6 «Новий лист» в альбомній орієнтації: «Надіслати» нижче краю вікна (88vh) — недосяжна;
//  R7 заголовок листа: сирий рядок «Ім'я <адреса>», «>» окремим рядком;
//  R8 щільність «Мінімум» на телефоні: «⋮» (44 px) у рядку 41 px, прив'язана до низу → залазила на сусідній рядок;
//  R9 панель ШІ над листом розгорнута завжди: на 390×844 текст листа з y≈555, на 844×390 не видно зовсім; рядки лише українською;
//  R10 панель сповіщень в альбомній орієнтації: на список лишалося 0 px (заголовок + пошук + два рядки чипів + 4 кнопки);
//  R11 підказка пошуку «Пошук у пошті» обрізана посеред слова («Пошук у по», «Пошу»).
// Кожна перевірка фіксує правило, яке це виправляє; ДО/ПІСЛЯ — знімки рецензента (scratchpad/rev1/DO|NA).
import { readdirSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { splitsAfzender } from '../../src/mail-afzender-weergave';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const HEX = /#[0-9a-fA-F]{3,8}\b/;
/** Блок @media (…) { … } з урахуванням вкладених дужок. */
function mediaBlok(css: string, kop: string): string {
  const i = css.indexOf(kop); if (i < 0) return '';
  let d = 0, j = css.indexOf('{', i);
  for (let k = j; k < css.length; k++) { if (css[k] === '{') d++; else if (css[k] === '}') { d--; if (d === 0) return css.slice(i, k + 1); } }
  return '';
}

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-ux-beoordeling-20261021');
  const rev = zc(lees('src/mail-ux-beoordeling-20261021.css'));
  const revRuw = lees('src/mail-ux-beoordeling-20261021.css');

  // ------------------------------------------------------------------ 0. дизайн-система
  check('0 review-CSS: лише токени (без hex), без prefers-color-scheme', !HEX.test(rev) && !/prefers-color-scheme/.test(rev));
  const klein = [...rev.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((n) => n < 12);
  check('0 review-CSS: жодного шрифту < 12 px; кегль лише через --tekst-*', klein.length === 0 && /font-size:var\(--tekst-klein\)/.test(rev), klein.join());
  const breed = [...rev.matchAll(/(?:^|[;{\s])(?:min-|max-)?width:\s*(\d{3,})px/g)].map((m) => Number(m[1])).filter((n) => n > 360);
  check('0 review-CSS: жодної px-ширини > 360', breed.length === 0, breed.join());
  const mfv = lees('src/MailFunctioneelWeergave.tsx');
  check('0 підключено на всіх сторінках пошти (MailFunctionalView, після mail-functioneel.css)', /import '\.\/mail-functioneel\.css';import '\.\/mail-ux-beoordeling-20261021\.css';/.test(mfv));

  // ------------------------------------------------------------------ R1 шапка
  const chrome = zc(lees('src/canoniek-omlijsting.css'));
  const r1 = /html body \.canonical-chrome:has\(\.mail-top-command-bar\) \.canonical-workspace::before \{([^}]*)\}/.exec(rev)?.[1] || '';
  check('R1 смуга під шапкою: fixed, угорі на всю ширину, колір тла сторінки (--bg), перехоплює дотики', /content:'';/.test(r1) && /position:fixed;/.test(r1) && /inset:0 0 auto 0;/.test(r1) && /background:var\(--bg\);/.test(r1) && /pointer-events:auto;/.test(r1));
  const zStrook = Number(/z-index:(\d+)/.exec(r1)?.[1] || 0);
  const ws = zc(lees('src/google-mail-werkruimte.css')) + zc(lees('src/mail-lezer-verbeteringen.css')) + zc(lees('src/mail-qa-2026-10.css'));
  const zLezer = Math.max(...[...ws.matchAll(/\.google-mail-reader-backdrop\{[^}]*z-index:(\d+)/g)].map((m) => Number(m[1])), 0);
  check('R1 z-index смуги: над рядками листів (їхні z ≤ 13), під вікном читання (воно в тій самій робочій області)', zStrook > 13 && zLezer > zStrook, `смуга ${zStrook}, вікно читання ${zLezer}`);
  // висота смуги = відступ робочої області зверху: 70 px (комп'ютер), 62 px (≤ 700 px)
  check('R1 висота = відступ .canonical-workspace зверху: 70 px і 62 px на телефоні (canoniek-omlijsting.css)', /\.canonical-workspace\{position:fixed;inset:0;z-index:1;overflow:auto;[^}]*padding:70px /.test(chrome) && /@media\(max-width:700px\)\{[^@]*\.canonical-workspace,\.sidebar-pinned \.canonical-workspace\{padding:62px /.test(chrome)
    && /height:var\(--mr-kop-hoogte, 70px\)/.test(r1) && /@media \(max-width:700px\) \{ html body \.canonical-chrome:has\(\.mail-top-command-bar\) \.canonical-workspace \{ --mr-kop-hoogte:62px; \} \}/.test(rev));
  check('R1 робоча область сама z 1 (своя площина) — смуга всередині не може лягти на шапку/дзвоник', /\.canonical-workspace\{position:fixed;inset:0;z-index:1;/.test(chrome));
  check('R1 межа під шапкою лише після прокрутки (scroll-timeline, у @supports)', /@supports \(animation-timeline: scroll\(\)\)/.test(rev) && /scroll-timeline:--mr-kop block;/.test(rev) && /animation-range:0 48px;/.test(rev));

  // ------------------------------------------------------------------ R2 вкладення
  const r2 = mediaBlok(rev, '@media (max-width:480px)');
  check('R2 ≤ 480 px: плашка вкладення без стелі змінної щільності (max-width:100%, width:auto), картки-мініатюри не зачеплено', /\.google-mail-row \.google-mail-row-attachments > \.mail-attachment:not\(\.mail-attachment-preview-card\) \{\s*flex:0 1 auto; width:auto; max-width:100%;/.test(r2));
  // ДО: clamp(140.12px, 113px + 11.3cqi, 271.2px) на 360 → 153,7 px; «PNG»-мітка 50 + розмір 43 + відступи → назві ~40 px
  const doBreedte = 113 + 0.113 * 360;
  check('R2 нагадування ДО: на 360 px плашка 153,7 px (виміряно 153,67) — на «foto-0.png» лишалося 4 літери', Math.abs(doBreedte - 153.68) < 0.05, doBreedte.toFixed(2));

  // ------------------------------------------------------------------ R3 тости / смуга зв'язку
  const r3 = mediaBlok(rev, '@media (max-width:520px)');
  // 25.10.2026 (zones, shared/plaatsing.ts): de melding staat op de telefoon BOVENAAN onder de balk (src/plaatsing/plaatsing.css), dus nooit
  // op de actiestapel («Написати», «Вгору») rechtsonder; de verbindingsbalk loopt over de hele breedte en de stapel staat erBOVEN
  // (src/plaatsing/Plek.tsx meet de balk: ONDERBALKEN). Vroeger: tost op bottom 124 px en een balk die 72 px rechts vrijliet.
  const laag = lees('src/plaatsing/plaatsing.css'), plekBron = lees('src/plaatsing/Plek.tsx');
  check('R3 тост на телефоні — угорі під панеллю (типово 64 px; вільне місце рахує src/plaatsing/melding-plek.ts), не над стосом дій «Написати»/«Вгору»', /@media \(max-width:700px\)\{\s*html body \.canonical-chrome \.canonical-notification-toast[^{]*\{top:var\(--melding-top,calc\(64px \+ var\(--veilig-boven,0px\)\)\)!important;bottom:auto!important;/.test(laag) && !/bottom:calc\(124px/.test(r3));
  check('R3 смуга зв\'язку: на всю ширину внизу, стос дій стоїть НАД нею (вимірюється як нижня смуга); у «Новому листі» — під його заголовком', /\.canonical-connection-banner \{\s*inset-inline:calc\(var\(--ruimte-2\) \+ var\(--veilig-links\)\) calc\(var\(--ruimte-2\) \+ var\(--veilig-rechts\)\) !important;/.test(r3) && plekBron.includes("'.canonical-connection-banner'") && /html body:has\(\.mail-new-message-backdrop\) \.canonical-connection-banner \{\s*top:calc\(60px \+ var\(--veilig-boven\)\) !important; bottom:auto !important;/.test(r3));

  // ------------------------------------------------------------------ R4 «Перевірка всіх адрес»
  const r4 = mediaBlok(rev, '@media (max-width:559px)');
  check('MAILSCAN-002: старі мобільні правила не змушують відкривати смугу', /html body \.ctv-melding/.test(r4));
  const ctvCss = zc(lees('src/afzenders/contacten.css'));
  // ДО: left = 52 + 12 = 64, ширина = min(360, vw − 32) → правий край 64 + 358 = 422 на 390 (за екраном на 32 px)
  check('R4 нагадування ДО: contacten.css ставить смугу від рейки (52 + 12 px) шириною 100vw − 32 → на 390 px правий край 422', /\.ctv-melding \{ position: fixed; z-index: 270; inset-inline-start: calc\(var\(--canonical-command-inline-start, 52px\) \+ 12px\); bottom: 16px; width: min\(360px, calc\(100vw - 32px\)\);/.test(ctvCss) && 64 + Math.min(360, 390 - 32) === 422);
  const ctv = lees('src/afzenders/ContactenScanMelding.tsx');
  check('MAILSCAN-002: на телефоні більше немає розгорнутого вікна перевірки адрес', !ctv.includes('<Venster') && !ctv.includes('ctv-melding-inhoud'));
  check('MAILSCAN-002: коротка звістка не перехоплює натискання', ctvCss.includes('.ctv-scan-korte-melding{position:fixed') && ctvCss.includes('pointer-events:none'));

  // ------------------------------------------------------------------ R5 вікно читання
  check('R5 ≤ 720 px (24.10, pakket 1: was ≤ 559 px hier; zweven kan pas vanaf 721 px, de regel staat nu in src/mail/lees-venster.css): «Зменшити вікно (перетягувати)» сховано (як «На весь екран» у «Новому листі»)', /@media \(max-width:720px\)\{\s*html body \.google-mail-reader \.mail-reader-venster\{display:none!important\}/.test(zc(lees('src/mail/lees-venster.css'))) && !/\.mail-reader-venster \{ display:none/.test(rev) && /@media\(max-width:560px\)\{\.mail-nm-venster-knoppen button\[data-nm-maximaliseer\]\{display:none\}\}/.test(zc(lees('src/mail-nieuw-bericht.css'))));
  // бюджет шапки на 360 (виміряно в браузері): відступ 8 + «назад» 44 + 6 + «пошук» 44 + 6 + [дії] + 3 × (2 + 44) («⋮», «згорнути»,
  // «закрити») + 8 = 254 + [дії]. Із «Зменшити вікно» (+ 2 + 44) на дії лишалося 60 px (виміряно 60 → друга кнопка обрізана);
  // без неї — 106 px ≥ 2 × 44 + 4 (виміряно: «Архівувати» 122–166, «Позначити непрочитаним» 170–214, «⋮» від 216).
  const vast = 8 + 44 + 6 + 44 + 6 + 3 * (2 + 44) + 8, vrij = 360 - vast, vrijDo = vrij - (2 + 44);
  check('R5 бюджет шапки на 360 px без «Зменшити вікно»: дві перші дії (92 px) вміщаються повністю (ДО: 60 px — одна з половиною)', vrij >= 92 && vrijDo === 60, `${vrij}px вільно (ДО ${vrijDo}px)`);

  // ------------------------------------------------------------------ R6 «Новий лист» в альбомній орієнтації
  const r6 = mediaBlok(rev, '@media (max-height:500px) and (min-width:561px)');
  check('R6 низький екран: вікно на всю висоту й прокручується; нижня панель липка (bottom 0) на тлі панелі', /html body \.mail-new-message \{\s*height:100dvh !important; max-height:100dvh !important;[^}]*overflow-y:auto !important;/.test(r6) && /html body \.mail-new-message > footer \{\s*position:sticky !important; bottom:0;[^}]*background:var\(--panel\) !important;/.test(r6));
  check('R6 «Чернетка» в одному рядку з кнопками; ручки зміни розміру сховано; редактор не стискається нижче 180 px', /> footer > \.mail-new-message-sync \{ order:0 !important; flex:1 1 auto !important;/.test(r6) && /\.mail-new-message-resize \{ display:none !important; \}/.test(r6) && /\.mail-nm-editor \{ flex:0 0 auto !important; min-height:180px !important; \}/.test(r6));
  check('R6 нагадування ДО: вікно 88vh з overflow:hidden (на 390 px висоти «Надіслати» було на y 477 при низі вікна 366)', /\.mail-new-message\{position:relative;box-sizing:border-box;width:min\(640px,100%\);max-height:88vh;overflow:hidden;/.test(zc(lees('src/mail-nieuw-bericht.css'))));

  // ------------------------------------------------------------------ R7 заголовок листа
  const a = splitsAfzender('Anastasia Arkhypenko-Vasylenko <anastasia-arkhypenko@notifications.example.test>');
  check('R7 «Ім\'я <адреса>» → ім\'я окремо, адреса окремо', a.naam === 'Anastasia Arkhypenko-Vasylenko' && a.adres === 'anastasia-arkhypenko@notifications.example.test', JSON.stringify(a));
  const b = splitsAfzender('"Нова пошта" <noreply@novaposhta.example.test>'), c = splitsAfzender('maria@example.test'), d = splitsAfzender('<x@y.test>'), e = splitsAfzender('X@Y.test <x@y.test>'), f = splitsAfzender('');
  check('R7 лапки знято; лише адреса → адреса як ім\'я без дубля; порожньо → порожньо', b.naam === 'Нова пошта' && b.adres === 'noreply@novaposhta.example.test' && c.naam === 'maria@example.test' && !c.adres && d.naam === 'x@y.test' && !d.adres && e.naam === 'x@y.test' && !e.adres && !f.naam && !f.adres, JSON.stringify([b, c, d, e, f]));
  const mtc = lees('src/MailGesprekInhoud.tsx');
  check('R7 MailThreadContent: ім\'я в <strong>, адреса в small.mail-thread-message-adres', mtc.includes("<strong>{splitsAfzender(message.from).naam||t('Невідомий відправник','Onbekende afzender')}</strong>") && mtc.includes("<small className='mail-thread-message-adres'>{splitsAfzender(message.from).adres}</small>"));
  check('R7 стиль адреси: приглушений, --tekst-klein, переноситься', /\.mail-thread-message-head \.mail-thread-message-adres \{\s*display:block; min-width:0; color:var\(--muted\); font-size:var\(--tekst-klein\);[^}]*overflow-wrap:anywhere;/.test(rev));

  // ------------------------------------------------------------------ R8 «Мінімум»
  const r8 = mediaBlok(rev, '@media (max-width:720px)');
  // blok 1 (25.10.2026): «по центру» zonder translate — dezelfde plaatsing als overal (top:clamp rond het gemeten anker, binnen de rij)
  check('R8 ≤ 720 px, «Мінімум»: рядок ≥ дотикової висоти, «⋮» по центру рядка (а не від низу), zonder translate en binnen de rij', /\[data-density-mode\] \.google-mail-row\.mail-row-minimum \{ min-height:var\(--tik-hoogte\); \}/.test(r8) && /\.mail-row-minimum \.mail-row-hover-actions \{\s*top:clamp\(0px, calc\(var\(--mail-row-actions-y, 50%\) - var\(--mail-row-actions-h, 44px\) \/ 2\), calc\(100% - var\(--mail-row-actions-h, 44px\)\)\) !important; bottom:auto !important; translate:none;/.test(r8));
  check('R8 нагадування ДО: mail-mobiel.css кріпить дії рядка до низу (bottom 4px, top auto); рядок 41 − 4 − 44 = −7 px', /html body \.google-mail-workspace \.google-mail-row \.mail-row-hover-actions\{position:absolute!important;right:4px!important;bottom:4px!important;top:auto!important;/.test(zc(lees('src/mail-mobiel.css'))) && 41 - 4 - 44 === -7);

  // ------------------------------------------------------------------ R9 панель ШІ
  const balkBron = lees('src/mail/AiVertalingBalk.tsx');
  const balkCss = lees('src/mail/ai-vertaling-balk.css');
  const balkBlok = zc(balkCss.slice(balkCss.indexOf('21.10.2026 рецензія UX')));
  check('R9 малий екран = (max-width: 700px), (max-height: 500px) — те саме в TSX і CSS', balkBron.includes("export const AI_BALK_KLEIN_SCHERM = '(max-width: 700px), (max-height: 500px)';") && balkBlok.includes('@media (max-width:700px), (max-height:500px) {'));
  check('R9 згорнуто ховає вибір агента/мови, режими, рушії, налаштування й значок (результати лишаються)', balkBlok.includes(".ai-vertaling-balk[data-ingeklapt='ja'] :is(.ai-vb-selectors, .ai-vb-modes, .ai-vb-motoren, .ai-vb-settings-drawer, .ai-vb-space-badge) { display:none; }") && !/ai-vb-result|ai-vb-refusal/.test(balkBlok.slice(balkBlok.indexOf("[data-ingeklapt='ja'] :is"))));
  check('R9 кнопка згортання: 44×44 (дотик), лише токени; з пакета 3 (24.10) — на кожному екрані (раніше на великому прихована)', !/\.ai-vb-inklap \{ display:none; \}/.test(balkBlok) && /\.ai-vb-inklap \{\s*display:inline-grid;/.test(balkBlok) && /width:var\(--tik-hoogte\); height:var\(--tik-hoogte\);/.test(balkBlok) && !HEX.test(balkBlok) && !/prefers-color-scheme/.test(balkBlok));
  // початковий стан через matchMedia/localStorage (нагадування: privévenster кидає на localStorage)
  const g = globalThis as Record<string, unknown>;
  const opslag = new Map<string, string>();
  const zetBrowser = (klein: boolean, gooit = false) => {
    g.window = { matchMedia: (q: string) => ({ matches: q === '(max-width: 700px), (max-height: 500px)' ? klein : false, addEventListener: () => undefined, removeEventListener: () => undefined }),
      localStorage: { getItem: (k: string) => { if (gooit) throw new Error('SecurityError'); return opslag.get(k) ?? null; }, setItem: (k: string, v: string) => { opslag.set(k, v); }, removeItem: (k: string) => { opslag.delete(k); } } };
  };
  const { aiBalkStartIngeklapt, default: AiVertalingBalk } = await import('../../src/mail/AiVertalingBalk');
  zetBrowser(true); const telefoon = aiBalkStartIngeklapt();
  zetBrowser(false); const computer = aiBalkStartIngeklapt();
  opslag.set('mr-ai-balk-open-v1', '1'); zetBrowser(true); const gekozen = aiBalkStartIngeklapt(); opslag.clear();
  zetBrowser(true, true); const prive = aiBalkStartIngeklapt();
  check('R9 старт: телефон згорнуто, комп\'ютер теж згорнуто (пакет 3, 24.10; раніше розгорнуто), «розгорнути» пам\'ятається, privévenster не ламає', telefoon && computer && !gekozen && prive, JSON.stringify({ telefoon, computer, gekozen, prive }));
  const props = { context: { service: 'mail' }, accountId: 'a', messageId: 'm1', subject: 'Тема', from: 'X <x@y.test>', bodyText: 'Текст', segments: [{ id: 's0', text: 'Текст' }], translationActive: false, onToggleTranslationActive: () => undefined, onTranslationsReady: () => undefined } as unknown as Parameters<typeof AiVertalingBalk>[0];
  zetBrowser(true);
  const ukHtml = renderToString(createElement(AiVertalingBalk, props));
  const ids = /aria-controls="([^" ]+)-kiezers \1-modi"/.exec(ukHtml);
  check('R9 SSR телефон: data-ingeklapt="ja", кнопка aria-expanded="false" з aria-controls на #…-kiezers і #…-modi (обидва є)', ukHtml.includes('data-ingeklapt="ja"') && /class="ai-vb-inklap" aria-expanded="false"/.test(ukHtml) && !!ids && ukHtml.includes(`id="${ids![1]}-kiezers"`) && ukHtml.includes(`id="${ids![1]}-modi"`) && ukHtml.includes('Показати інструменти ШІ'));
  zetBrowser(false);
  const pcHtml = renderToString(createElement(AiVertalingBalk, props));
  check('R9 SSR комп\'ютер: з пакета 3 теж згорнуто (data-ingeklapt="ja", aria-expanded="false"; раніше розгорнуто)', pcHtml.includes('data-ingeklapt="ja"') && /class="ai-vb-inklap" aria-expanded="false"/.test(pcHtml));
  g.document = { documentElement: { lang: 'nl' } };
  const nlHtml = renderToString(createElement(AiVertalingBalk, props));
  delete g.document;
  const nlTeksten = ['AI-analyse en vertaling', 'Privéruimte', 'Vertalen', 'Korte samenvatting', 'Context en verbanden', 'Vertaalmotoren', 'Instellingen', 'AI-paneel voor vertaling, samenvatting en context'];
  const ontbreekt = nlTeksten.filter((x) => !nlHtml.includes(x));
  const ukResten = ['ШІ-аналіз і переклад', 'Приватний простір', '>Перекласти<', 'Короткий підсумок', 'Рушії перекладу'].filter((x) => nlHtml.includes(x));
  check('R9 nl (<html lang="nl">): зверху панелі все нідерландською (раніше «ШІ-аналіз і переклад», «Перекласти»… у nl)', ontbreekt.length === 0 && ukResten.length === 0, `ontbreekt: ${ontbreekt.join(', ')}; uk-resten: ${ukResten.join(', ')}`);
  delete g.window;

  // ------------------------------------------------------------------ R10 панель сповіщень в альбомній орієнтації
  const np = zc(lees('src/meldingenpaneel.css'));
  // INTEG-001 (03.11.2026, вимога власника: «панель має відкриватися біля дзвіночка, прив'язана до нього, а не посеред екрана»):
  // компактний режим лишається спільним для телефону й альбомної орієнтації; окремий блок (max-width:560px) тепер містить ЛИШЕ
  // ліве/праве поле вікна біля дзвоника (верх і висота — з placeNear), а в альбомній — вузьке вікно біля дзвоника замість бічної
  // панелі на всю висоту (раніше left:auto + top/bottom від краю до краю).
  const alleenTel = mediaBlok(np, '@media (max-width:560px){');
  check('R10 компактний режим (рядок чипів, «Фільтри», «⋯») і на низькому екрані: @media (max-width:560px), (max-height:500px); окремий блок телефону — лише поля вікна',
    np.includes('@media (max-width:560px), (max-height:500px){') && !/cnc-|footer|header/.test(alleenTel) && /left:calc\(var\(--ruimte-2\) \+ var\(--veilig-links\)\)!important/.test(alleenTel));
  const r10 = mediaBlok(np, '@media (max-height:500px) and (min-width:561px){');
  check('R10 альбомна: вузьке вікно біля дзвоника (≤ 360 px), не на весь екран 844 px і не бічна панель на всю висоту', /html \.canonical-notification-panel\{width:min\(360px,calc\(100vw - var\(--ruimte-4\)\)\)!important\}/.test(r10) && !/left:auto!important/.test(r10) && np.indexOf(r10) > np.indexOf('@media (max-width:560px), (max-height:500px){'));
  check('R10 альбомна: чипи одним рядком із прокруткою (mail-qa-2026-10.css від 561 px переносить їх у 3 рядки = 100+ px)', /html body \.canonical-notification-panel \.cnc-chips\{flex-wrap:nowrap!important;overflow-x:auto!important\}/.test(r10) && /@media \(min-width:561px\)\{html body \.cnc-chips\{flex-wrap:wrap!important;/.test(zc(lees('src/mail-qa-2026-10.css'))));
  // бюджет на 844×390: кадр 390 − 16, заголовок 44 + 8 + 1, рядок чипів 44 + 16 + 1 → список ≥ 260 px (ДО: 0 px)
  const lijst = 390 - 16 - (44 + 8 + 1) - (44 + 16 + 1);
  check('R10 бюджет 844×390: на список ≥ 250 px (ДО виміряно 0 px)', lijst >= 250, `${lijst}px`);

  // ------------------------------------------------------------------ R11 підказка пошуку
  const zoek = lees('src/MailZoekVeld.tsx');
  check('R11 ≤ 480 px — коротка підказка «Пошук»/«Zoeken», повна назва в aria-label; стежить за зміною ширини', zoek.includes("export const MAIL_ZOEK_SMAL='(max-width: 480px)';") && zoek.includes("placeholder={smal?t('Пошук','Zoeken'):t('Пошук у пошті','Zoeken in e-mail')}") && zoek.includes("aria-label={t('Пошук у пошті','Zoeken in e-mail')}") && zoek.includes("m.addEventListener?.('change',op)"));

  // ------------------------------------------------------------------ R12 вигляд клікабельного
  const r12 = rev.slice(rev.indexOf('html body .mail-settings-scaffold nav a {') - 40);
  check('R12 налаштування ≤ 720 px: розділи-якорі — пігулки дотикової висоти з рамкою й тлом (не голий текст)', /@media \(max-width:720px\) \{\s*html body \.mail-settings-scaffold nav a \{\s*display:inline-flex; align-items:center; min-height:var\(--tik-hoogte\); padding:0 var\(--ruimte-3\);\s*border:1px solid var\(--line\); border-radius:999px; background:var\(--surface\); color:var\(--text\);/.test(r12));
  check('R12 «Чому недоступно?» і «Які джерела використовуються»: колір посилання, підкреслення, власна стрілка (повертається, коли відкрито)', /:is\(\.mail-provider-waarom, \.ctv-bronnen\) > summary \{ min-height:var\(--tik-hoogte\); color:var\(--accent\); text-decoration:underline;/.test(rev) && /:is\(\.mail-provider-waarom, \.ctv-bronnen\)\[open\] > summary::after \{ rotate:225deg;/.test(rev) && lees('src/afzenders/ScanPaneel.tsx').includes("<details className='ctv-bronnen'>") && /\.mail-provider-waarom>summary\{[^}]*color:var\(--text\);font-weight:600/.test(zc(lees('src/mail-accounts-hub.css'))));
  check('R12 «Перепідключити»/«Відключити» на вузькій картці — кожна на всю ширину рядка', /@media \(max-width:480px\) \{\s*html body \.mail-koppeling-acties > \.mail-koppeling-knop \{ flex:1 1 auto; \}/.test(rev));

  // ------------------------------------------------------------------ R13 події пошти в панелі сповіщень
  // ДО: «Дія на сайті: mail contacten scan gestart» (внутрішній нідерландський ідентифікатор в українському інтерфейсі).
  const backendBron = readdirSync('backend').filter((f) => f.endsWith('.ts')).map((f) => lees(`backend/${f}`)).join('\n');
  const mailTypes = [...new Set([...backendBron.matchAll(/'(owner\.mail\.[a-z_.-]+)'/g)].map((m) => m[1]))];
  const ca = lees('src/connector-activiteit.ts');
  const zonderLabel = mailTypes.filter((t) => !new RegExp(`'${t.replace(/\./g, '\\.')}': \\['[^']+', '[^']+'\\]`).test(ca));
  check('R13 кожна подія owner.mail.* з бекенду має назву uk + nl (а не «Дія на сайті: mail contacten scan gestart»)', mailTypes.length >= 15 && zonderLabel.length === 0, `${mailTypes.length} типів; без назви: ${zonderLabel.join(', ')}`);

  // виміряно на 360 px: поле 68 px (світла) / 60 px (темна, шапка з 60 px); «Пошук» 16 px Trebuchet = 48 px; «Пошук у пошті» ≈ 104 px
  const veld = 60, ph = 48;
  check('R11 ≤ 480 px: відступ поля 4 px → «Пошук» уміщується й у темній темі (60 − 2 × 4 = 52 ≥ 48; було 60 − 16 = 44)', /@media \(max-width:480px\) \{ html body \.mail-top-search-shell input \{ padding-inline:var\(--ruimte-1\); \} \}/.test(rev) && veld - 2 * 4 >= ph && veld - 2 * 8 < ph && /\.mail-top-search-shell input\{[^}]*padding:6px 8px;/.test(zc(lees('src/google-mail-werkruimte.css'))));

  // ------------------------------------------------------------------ R14 картки вкладень у вікні читання (комп'ютер)
  check('R14 ≥ 721 px: компактна картка вкладення не вужча за 22rem (5 кнопок × 35 px + мініатюра лишали назві ~40 px)', /@media \(min-width:721px\) \{\s*html body \.mail-attachment-card\[data-presentation='compact'\] \{ width:max\(var\(--mail-density-attachment-width, 226px\), min\(22rem, 100%\)\); \}/.test(rev) && 22 * 16 - 38 - 5 * 35 - 3 * 6 >= 110);

  check('нотатка: коментарі review-CSS пояснюють кожне правило (R1…R8, R11, R12, R14)', ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R11', 'R12', 'R14'].every((r) => revRuw.includes(`/* ${r} `)));
  return einde();
}
