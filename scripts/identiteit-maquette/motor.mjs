// Збирає двигун вигляду «Макет» із шести скриптів макета власника в один модуль із коренем root замість document/body.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const WORTEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const B = path.join(WORTEL, 'docs/ontwerp/identiteit-account/maquette-bron/');
const UIT = path.join(WORTEL, 'src/identiteit/maquette/') + 'maquette-motor.ts';
const volgorde = ['locales.js', 'фото-профілю.js', 'піктограми.js', 'реєстр.js', 'drawer.js', 'app.js'];
let code = volgorde.map(n => `\n// ───────── ${n} ─────────\n` + fs.readFileSync(B + n, 'utf8')).join('\n');

const vervang = (a, b) => { const n = code.split(a).length - 1; if (!n) console.warn('не знайдено:', a); code = code.split(a).join(b); };
vervang('document.body', 'root');
vervang('document.getElementById(', 'byId(');
vervang('document.querySelectorAll(', 'root.querySelectorAll(');
vervang('document.querySelector(', 'root.querySelector(');
vervang('document.addEventListener(', 'luister(doc,');
vervang('window.addEventListener(', 'luister(window,');
vervang('\naddEventListener("scroll",', '\nluister(scrolDoel,"scroll",');
vervang('\naddEventListener("resize",', '\nluister(window,"resize",');
vervang('\naddEventListener("pointer', '\nluister(doc,"pointer');
vervang('const byId = id => byId(id);', '');
vervang('const body = root;', 'const body = root;');
vervang('matchMedia("(max-width: 730px)").matches', '(breed()<=730)');
vervang("matchMedia(\"(max-width:730px)\").matches", '(breed()<=730)');
vervang('matchMedia("(min-width:731px)").matches', '(breed()>=731)');
vervang('const appLane=innerWidth<=730?0:74;', 'const appLane=0;');
vervang('const layoutGutters=innerWidth<=730?26:95;', 'const layoutGutters=breed()<=730?26:95;');
vervang('const projectedCanvas=innerWidth-appLane', 'const projectedCanvas=breed()-appLane');
vervang('const scrollable=Math.max(1,document.documentElement.scrollHeight-innerHeight);', 'const scrollable=Math.max(1,scroller().hoogte-scroller().venster);');
vervang('Math.round(scrollY/scrollable*100)', 'Math.round(scroller().top/scrollable*100)');
vervang('document.documentElement.style.setProperty', 'root.style.setProperty');
vervang('document.documentElement.lang=preferences.lang;', '');
vervang('document.title=t.settings+" — "+t.workspace;', '');
vervang('const даніВласника=window.MIJN_RUIMTE_PROFIEL;', 'const даніВласника=opties.profiel;');
vervang('const STORAGE_KEY = "account-atelier-preferences-v1";', 'const STORAGE_KEY = "identiteit-maquette-voorkeuren";');

const kop = `// @ts-nocheck
// Двигун вигляду «Макет» центру облікового запису (IDENTITEIT-007).
// Це код макета власника (ChatGPT, 2026-11-06: locales.js, фото-профілю.js, піктограми.js, реєстр.js, drawer.js, app.js), зібраний
// в один модуль і прив'язаний до кореня компонента замість document/body, щоб поведінка збігалася з макетом один в один.
// Відмінності від макета позначено коментарями «САЙТ:». Тип-перевірку вимкнено свідомо: код лишається максимально близьким до джерела.
// De motor van de weergave «Ontwerp»: de eigen scripts van het ontwerp van de eigenaar, gebundeld en aan de component-wortel gebonden.

export type MaquetteOpties = {
  lang: 'uk' | 'nl';
  licht: boolean;
  profiel: { bevestigd: boolean; naam: string; foto: string } | null;
  /** Перехід до розділу користувачем (адресу змінює застосунок). */
  bijKies: (id: string) => void;
  /** Розділ розгорнуто: сайт монтує справжню панель у гніздо. */
  bijOpenen: (id: string) => void;
};
export type Maquette = { stop: () => void; ga: (id: string, open?: boolean) => void; zetLicht: (licht: boolean) => void; zetProfiel: (p: MaquetteOpties['profiel']) => void };

export function startMaquette(root: HTMLElement, opties: MaquetteOpties): Maquette {
  const doc = root.ownerDocument;
  const byId = (id) => root.querySelector('#' + CSS.escape(id));
  // САЙТ: сторінка прокручується в робочій області оболонки, не у вікні.
  const werkvlak = root.closest('.canonical-workspace');
  const scrolDoel = werkvlak || window;
  const scroller = () => werkvlak
    ? { top: werkvlak.scrollTop, hoogte: werkvlak.scrollHeight, venster: werkvlak.clientHeight }
    : { top: window.scrollY, hoogte: doc.documentElement.scrollHeight, venster: window.innerHeight };
  const breed = () => root.clientWidth || window.innerWidth;
  const luisteraars = [];
  const luister = (doel, soort, fn, opt) => { doel.addEventListener(soort, fn, opt); luisteraars.push(() => doel.removeEventListener(soort, fn, opt)); };
`;
const staart = `
  return {
    stop() { for (const weg of luisteraars) weg(); },
    ga(id, open) { jump(id); if (open) openInlineSettings(id); },
    zetLicht(l) { setTheme(l ? 'light' : 'dark'); },
    zetProfiel(p) { прийнятиФотоПрофілю(p); },
  };
}
`;
fs.writeFileSync(UIT, kop + code.replace(/^/gm, '  ').replace(/^  $/gm, '') + staart);
console.log('рядків:', code.split('\n').length);
