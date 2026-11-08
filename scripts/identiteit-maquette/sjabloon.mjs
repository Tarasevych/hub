// Розмітка оболонки макета (index.html → рядок для компонента): без лівої смуги сервісів і скриптів.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const WORTEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let html = fs.readFileSync(path.join(WORTEL, 'docs/ontwerp/identiteit-account/maquette-bron/') + 'index.html', 'utf8');
html = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
html = html.replace(/^<body[^>]*>/, '');
html = html.replace(/<aside class="app-rail"[\s\S]*?<\/aside>\s*/, '');
html = html.replace(/<script[^>]*><\/script>\s*/g, '');
// Вибір файла світлини існував лише для макета; на сайті світлину змінюють у розділі «Акаунт».
html = html.replace(/\s*<label class="profile-photo-picker"[^>]*>[^<]*<\/label>\s*<input type="file" id="profilePhotoFile"[^>]*>/, '');
html = html.replace(/\s*<p class="profile-photo-warning"[^>]*><\/p>/, '');
// САЙТ: гнізда для перемикача вигляду (макет / «Студія» / класичний) — у вікні налаштувань навігації та під підвалом.
html = html.replace(/(<p>Можна також перетягнути заголовок панелі[^<]*<\/p>\s*<\/div>)/, '<div class="mq-echt mq-vormgeving" data-echt="vormgeving-venster"></div>\n    $1');
html = html.replace(/(<\/footer>)/, '$1\n        <div class="mq-echt mq-vormgeving mq-vormgeving-voet" data-echt="vormgeving-voet"></div>');
if (!html.includes('vormgeving-venster') || !html.includes('vormgeving-voet')) throw new Error('гнізда перемикача не вставлено');
const uit = `// Оболонка вигляду «Макет» (IDENTITEIT-007): розмітка index.html макета власника без лівої смуги сервісів і скриптів.
// ЗГЕНЕРОВАНО; динамічні частини (картки, навігація, пошук) малює maquette-motor.ts. De vaste opmaak van het ontwerp van de eigenaar.
export const MAQUETTE_SJABLOON = ${JSON.stringify(html.trim())};
`;
fs.writeFileSync(path.join(WORTEL, 'src/identiteit/maquette/') + 'maquette-sjabloon.ts', uit);
console.log(html.length);
