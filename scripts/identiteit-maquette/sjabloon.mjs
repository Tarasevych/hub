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
const uit = `// Оболонка вигляду «Макет» (IDENTITEIT-007): розмітка index.html макета власника один в один, без скриптів.
// ЗГЕНЕРОВАНО; динамічні частини (картки, навігація, пошук) малює maquette-motor.ts. De vaste opmaak van het ontwerp van de eigenaar.
export const MAQUETTE_SJABLOON = ${JSON.stringify(html.trim())};
`;
fs.writeFileSync(path.join(WORTEL, 'src/identiteit/maquette/') + 'maquette-sjabloon.ts', uit);
console.log(html.length);
