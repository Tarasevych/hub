// OPSTELPIL-001 (16.11.2026). Без браузера й бази.
// Скарга власника (знімок бічного меню пошти на телефоні): кнопка «Написати лист» широка, без заокруглення, підпис перенесено, дві
// піктограми купою. Причина: її стилі лежали в mail-nieuw-bericht.css, який вантажиться ліниво разом із вікном нового листа
// (MailOpstelZwevend монтує вікно лише коли є сеанс і під'єднана скринька). Тепер стилі приходять разом із самим меню.
// De stijl van «Bericht schrijven» in het zijmenu mag niet afhangen van het lui geladen opstelvenster.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

export async function main(): Promise<number> {
  const { check, einde } = checker('opstelpil-001-20261116');
  const pil = zc(lees('src/mail/mail-opstel-pil.css')), lui = zc(lees('src/mail-nieuw-bericht.css')), menu = lees('src/MailZijbalkNavigatie.tsx'), zwevend = lees('src/MailOpstelZwevend.tsx');
  check('меню пошти саме підключає стилі кнопки «Написати лист»', menu.includes("import'./mail/mail-opstel-pil.css'") && menu.includes('mail-compose-pill'));
  check('кнопка — один рядок: піктограма й підпис поруч, заокруглена', /\.mail-compose-pill\{[^}]*display:flex;align-items:center;gap:8px[^}]*\}/.test(pil) && /\.mail-compose-pill\{[^}]*border-radius:9px/.test(pil) && /\.mail-compose-pill\{[^}]*height:40px/.test(pil));
  check('дві піктограми лежать одна на одній, видно лише одну', /\.mail-compose-pill-icon\{position:relative;width:17px;height:17px/.test(pil) && /\.mail-compose-pill-icon svg\{position:absolute;inset:0/.test(pil) && /\.mail-compose-pill-icon \.pen\{opacity:0\}/.test(pil));
  check('у ліниво завантажуваному файлі вікна листа цих правил більше немає (одне джерело)', !lui.includes('.mail-compose-pill'));
  check('вікно листа й далі ліниве (PERF-001 не зачеплено)', /lazy\(\(\) => import\('\.\/MailNieuwBerichtDialoog'\)\)/.test(zwevend));
  return einde();
}
