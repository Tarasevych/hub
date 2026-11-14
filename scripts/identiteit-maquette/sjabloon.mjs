// Розмітка оболонки макета (index.html → рядок для компонента): один в один, без скриптів.
// De opmaak van het ontwerp van de eigenaar, één op één, zonder scripts; de dienstenbalk leidt naar de echte diensten van de site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const WORTEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let html = fs.readFileSync(path.join(WORTEL, 'docs/ontwerp/identiteit-account/maquette-bron/') + 'index.html', 'utf8');
html = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
html = html.replace(/^<body[^>]*>/, '');
html = html.replace(/<script[^>]*><\/script>\s*/g, '');

// САЙТ: смуга сервісів макета веде на справжні сервіси сайту (порядок кнопок у макеті: Налаштування, Мій простір, ШІ, Пошта, Хмара, GitHub).
const diensten = ['identity', 'hub', 'ai', 'mail', 'cloud', 'github'];
let i = 0;
html = html.replace(/<button class="app-icon( active)?" /g, (_, actief) => `<button type="button" class="app-icon${actief || ''}" data-dienst="${diensten[i++]}" `);
if (i !== diensten.length) throw new Error('очікувалося 6 кнопок смуги сервісів, знайдено ' + i);
// Знак «Мій простір» у макеті був посиланням на #intro; на сайті адресу з «#» не вживаємо — це кнопка переходу вгору.
html = html.replace('<a href="#intro" class="brand-mark"', '<button type="button" class="brand-mark" data-jump="intro"');
html = html.replace(/(<button type="button" class="brand-mark"[\s\S]*?<\/svg>\s*)<\/a>/, '$1</button>');
if (!html.includes('class="brand-mark" data-jump="intro"') || html.includes('</a>\n      <div class="app-rail-divider">')) throw new Error('знак «Мій простір» не перетворено на кнопку');

// Вибір файла світлини існував лише для макета (без облікового запису); на сайті світлина — з облікового запису, її змінюють у розділі «Акаунт».
// Замість вибору файла — дві кнопки в тому самому стилі: до розділу «Акаунт» і до меню облікового запису сайту (інші акаунти, вихід).
html = html.replace(/\s*<label class="profile-photo-picker"[^>]*>[^<]*<\/label>\s*<input type="file" id="profilePhotoFile"[^>]*>/,
  '\n      <button type="button" class="profile-photo-picker" id="profilePhotoPickLabel" data-echt-actie="account-foto">Змінити світлину — розділ «Акаунт»</button>' +
  '\n      <button type="button" class="profile-photo-picker profile-photo-account" id="profilePhotoAccount" data-echt-actie="account-menu">Обліковий запис, інші акаунти, вихід</button>');
html = html.replace(/\s*<p class="profile-photo-warning"[^>]*><\/p>/, '');
if (html.includes('profilePhotoFile') || !html.includes('data-echt-actie="account-menu"')) throw new Error('кнопки діалогу світлини не вставлено');

// САЙТ: гнізда для перемикача вигляду (макет / «Студія» / класичний) — у вікні налаштувань навігації та під підвалом.
html = html.replace(/(<p>Можна також перетягнути заголовок панелі[^<]*<\/p>\s*<\/div>)/, '<div class="mq-echt mq-vormgeving" data-echt="vormgeving-venster"></div>\n    $1');
html = html.replace(/(<\/footer>)/, '$1\n        <div class="mq-echt mq-vormgeving mq-vormgeving-voet" data-echt="vormgeving-voet"></div>');
if (!html.includes('vormgeving-venster') || !html.includes('vormgeving-voet')) throw new Error('гнізда перемикача не вставлено');
// САЙТ (IDENTITEIT-015): чесне пояснення у вікні навігації — положення й поведінка діють і на меню сайту (обліковий запис), стиль і вміст
// кнопок — лише навігація цієї сторінки; кнопка веде до справжніх налаштувань меню. Переклад ставить двигун (renderStatic).
// Саме <div>, не <p>: двигун пише підказку перетягування в перший прямий <p> вікна (:scope > p) і стер би це пояснення.
html = html.replace(/(<div class="mq-echt mq-vormgeving" data-echt="vormgeving-venster">)/,
  '<div class="mq-pagina-nav-noot"><span id="mqPaginaNavNoot">Положення й поведінка діють і на меню сайту та зберігаються в обліковому записі. Стиль і вміст кнопок — лише навігація цієї сторінки на цьому пристрої.</span> ' +
  '<button type="button" id="mqPaginaNavKnop" class="mq-pagina-nav-knop" data-kaart-ga="menu|#menu-modus">Налаштування меню сайту</button></div>\n    $1');
if (!html.includes('id="mqPaginaNavNoot"')) throw new Error('пояснення вікна навігації не вставлено');

// САЙТ: відокремлення внутрішнього дороговказу розділів сторінки від головного гамбургера сайту в шапці .topbar.
// Переносимо #adaptiveNavToggle із .topbar-start в окрему липку підсмугу змісту сторінки під шапкою зі списковою піктограмою та векторним шевроном.
html = html.replace(/\s*<button id="adaptiveNavToggle"[^>]*>[\s\S]*?<\/button>/, '');
html = html.replace(
  '</header>',
  '</header>\n      <div class="mq-sectie-balk" id="mqSectieBalk" data-zijde="left">' +
    '<button id="adaptiveNavToggle" type="button" class="adaptive-nav-toggle" aria-controls="anchorRail" aria-expanded="false" aria-label="Відкрити розділи сторінки" title="Відкрити розділи сторінки">' +
      '<svg class="mq-sectie-icoon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>' +
      '<span class="mq-sectie-naam" id="mqSectieNaam">Розділи</span>' +
      '<svg class="mq-sectie-pijl" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>' +
    '</button>' +
    '<button id="mqSectiePositie" type="button" class="mq-sectie-positie" aria-controls="navSettings" aria-label="Розташування навігації сторінки" title="Розташування навігації сторінки">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M9 4v16"/></svg>' +
    '</button>' +
  '</div>',
);
if (!html.includes('id="mqSectieBalk"') || /class="topbar-start">\s*<button id="adaptiveNavToggle"/.test(html) || html.includes('M4 7h16M4 12h16M4 17h16')) {
  throw new Error('внутрішній перемикач розділів не винесено в підсмугу змісту сторінки');
}

// САЙТ: кнопка пошуку в шапці вигляду «Макет» відкриває загальносайтовий пошук «Мій простір · Mijn Ruimte».
html = html.replace(
  '<button class="search-action" id="openSearch" aria-label="Пошук розділу">',
  '<button type="button" class="search-action" id="openSearch" data-zoek-trigger="maquette" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" aria-label="Пошук у «Мій простір» (Ctrl K)">',
);
html = html.replace('<span>Швидкий перехід</span>', '<span>Пошук у «Мій простір»…</span>');
if (!html.includes('data-zoek-trigger="maquette"')) throw new Error('тригер загальносайтового пошуку не прив’язано');

const uit = `// Оболонка вигляду «Макет» (IDENTITEIT-007): розмітка index.html макета власника один в один, без скриптів.
// ЗГЕНЕРОВАНО; динамічні частини (картки, навігація, пошук) малює maquette-motor.ts. De vaste opmaak van het ontwerp van de eigenaar.
export const MAQUETTE_SJABLOON = ${JSON.stringify(html.trim())};
`;
fs.writeFileSync(path.join(WORTEL, 'src/identiteit/maquette/') + 'maquette-sjabloon.ts', uit);
console.log(html.length);
