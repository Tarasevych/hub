// MAILBG-001 · Перевірка меж взаємодії, спільних налаштувань і доступності.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-achtergrond-001');
  const bron = (pad: string) => readFileSync(pad, 'utf8');
  const achtergrond = bron('src/mail/MailAchtergrond.tsx');
  const css = bron('src/mail/mail-achtergrond.css');
  const aanmelden = bron('src/CanoniekOmlijsting.tsx');
  const accounts = bron('src/mail/MailOrbitIntro.tsx');
  const beheer = bron('src/MailAccountsHub.tsx');

  check('обидві поштові сторінки застосовують одне тло',
    accounts.includes("<MailAchtergrond lang={lang} plaats='accounts' />")
    && aanmelden.includes("<MailAchtergrond lang={lang} plaats='aanmelden'/>")
    && beheer.includes("<MailAchtergrond lang={lang} plaats='accounts' />"));
  check('інші служби зберігають звичайний вигляд входу',
    aanmelden.includes("window.location.hostname.startsWith('mail.')")
    && aanmelden.includes('postdienst&&<Suspense'));
  check('права кнопка перемикає лінзу лише на тлі',
    achtergrond.includes('e.button !== 2')
    && achtergrond.includes('e.preventDefault()')
    && achtergrond.includes('zetLens((waarde) => !waarde)'));
  check('натискання поштових елементів і поля введення не перехоплено',
    achtergrond.includes('button,a,input,textarea,select,summary')
    && css.includes('pointer-events:none')
    && css.includes('pointer-events:auto'));
  check('налаштування однакові між сторінками й зберігаються локально',
    achtergrond.includes('mijn-ruimte-mail-achtergrond-v1')
    && achtergrond.includes('localStorage.getItem(SLEUTEL)')
    && achtergrond.includes('localStorage.setItem(SLEUTEL'));
  check('вибір руху та гами має по три варіанти і вимкнення',
    ['golven', 'wervel', 'aantrekken', 'uit', 'poollicht', 'zomer', 'oceaan'].every((x) => achtergrond.includes(`value='${x}'`)));
  check('є три самостійні різновиди тла',
    ['tekens', 'stippen', 'rust'].every((x) => achtergrond.includes(`value='${x}'`)));
  check('густина й сила обмежені та керуються повзунками',
    achtergrond.includes('begrens(Number(bewaard.aantal), 300, 2600)')
    && achtergrond.includes('begrens(Number(bewaard.kracht), 0, 1)')
    && achtergrond.includes("type='range'"));
  check('зменшення руху та зупинка поза видимою ділянкою',
    achtergrond.includes("prefers-reduced-motion: reduce")
    && achtergrond.includes('document.hidden')
    && achtergrond.includes('IntersectionObserver')
    && achtergrond.includes('stand.pauze'));
  check('менша кількість емблем на телефоні й обмежене відмальовування',
    achtergrond.includes('breedte < 700 ? .38 : 1')
    && achtergrond.includes('devicePixelRatio || 1, 1.5')
    && achtergrond.includes('nu - vorig < 28'));
  check('поштові форми та способи підключення не змінюються новим шаром',
    achtergrond.includes('MAIL_AANBIEDERS')
    && achtergrond.includes("import('../merk/merk-logos')")
    && !achtergrond.includes('/api/owner/')
    && accounts.includes('onClick={() => onSelect(a)}'));
  check('налаштування мають підписи двома мовами та клавіатурний доступ',
    achtergrond.includes('Налаштувати тло') && achtergrond.includes('Achtergrond instellen')
    && achtergrond.includes('aria-expanded={instellingen}')
    && css.includes(':focus-visible'));
  check('лінза працює без миші та не перехоплює дотик до форми',
    achtergrond.includes('rect.width / 2, y: rect.height / 2')
    && achtergrond.includes("houder.addEventListener('pointerdown', wijs")
    && achtergrond.includes("e.pointerType !== 'mouse' && !lensRef.current")
    && achtergrond.includes("e.target.closest('button,a,input,textarea,select,summary")
    && achtergrond.includes("if (e.pointerType === 'mouse') aanwijzer.current.binnen = false"));
  return einde();
}
