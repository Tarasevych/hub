// SITE-001 (пункт 20): сторож одного чіткого заклику до дії (CTA) без мережі.
// 1) На екрані входу (SignedOutCenter) перша збережена картка облікового запису має data-hoofdactie="true",
//    а кнопка Google під нею переходить у другорядне подання data-hoofdactie="false" (за нового пристрою — навпаки).
// 2) У таблицях стилів (aanmeld-herontwerp.css і maquette-aanmelden.css) оформлено обидва стани без втрати контрасту.
// 3) На юридичних сторінках (/privacy, /terms) і сторінці 404 позначено рівно одну головну дію повернення до простору.
// nl: bewaking van één duidelijke hoofdactie (CTA) per scherm zonder netwerk.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { PRIVACY_HTML, TERMS_HTML } from '../../backend/juridisch';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-cta');
  const root = process.cwd();
  try {
    const oml = await readFile(join(root, 'src/CanoniekOmlijsting.tsx'), 'utf8');
    check('SignedOutCenter: перша збережена картка отримує hoofdactie={index===0}', oml.includes('hoofdactie={index===0}') && oml.includes("data-hoofdactie={hoofdactie?'true':'false'}"));
    check('SignedOutCenter: кнопка Google головна лише без збережених записів і першою у hoofd', oml.includes('const eersteHoofdMethode=!heeftBewaard?zichtbareHoofd[0]:undefined') && oml.includes("maakGoogleKnop(eersteHoofdMethode==='google')"));

    const css = await readFile(join(root, 'src/aanmeld-herontwerp.css'), 'utf8');
    check('aanmeld-herontwerp.css: акцент для першої збереженої картки й спокійний вигляд для другорядної кнопки', css.includes(".mr-sign-in-account-row[data-hoofdactie='true']") && css.includes(".mr-sign-in-main-button[data-hoofdactie='false']:not([data-activated='true']):not([data-pauze='true'])"));

    const mq = await readFile(join(root, 'src/maquette-kern/maquette-aanmelden.css'), 'utf8');
    check('maquette-aanmelden.css: студійна палітра узгоджена з data-hoofdactie', mq.includes(".mr-sign-in-account-row[data-hoofdactie='true']") && mq.includes(".mr-sign-in-main-button[data-hoofdactie='false']"));

    for (const [naam, html] of [['/privacy', PRIVACY_HTML], ['/terms', TERMS_HTML]] as const) {
      const treffers = html.match(/data-hoofdactie="true"/g) || [];
      check(`${naam}: рівно одна головна дія повернення до простору`, treffers.length === 1, String(treffers.length));
    }
    const jurCss = await readFile(join(root, 'public/juridisch.css'), 'utf8');
    check('juridisch.css: стилі hoofdactie для світлої й темної тем', jurCss.includes('.kop nav>a.hoofdactie{background:#23575a;color:#fff') && jurCss.includes('.kop nav>a.hoofdactie{background:#99c7c4;color:#14181d}'));

    const nf = await readFile(join(root, 'src/NietGevonden.tsx'), 'utf8');
    check('NietGevonden.tsx: головна дія позначена data-hoofdactie=true, другорядна — false', nf.includes("className='primary' data-hoofdactie='true'") && nf.includes("data-hoofdactie='false' href={hub}"));
  } catch (e) {
    check('сторож виконано без винятків', false, String(e));
  }
  return einde();
}
