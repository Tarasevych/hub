// SITE-001 (пункт 17): сторож перевірки форм без мережі.
// 1) Код гостьового доступу: кириличні двійники стають латинськими, недопустимі знаки видно одразу, повний код — 16 знаків.
// 2) Гостьова форма й форма пароля пов'язують помилку з полем (aria-invalid + aria-describedby) і повертають фокус.
// nl: bewaking van formuliercontrole zonder netwerk.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { GAST_CODE_LENGTE, gastCodeStatus, schoonGastCode } from '../../src/gast-code';

export async function main(): Promise<number> {
  const { check, einde } = checker('site-001-formulieren');
  const root = process.cwd();
  try {
    // 1. Код гостьового доступу
    check('кириличні двійники перетворено на латинські', schoonGastCode('авсе-кмнр-тх12-3456') === 'ABCE-KMHP-TX12-3456', schoonGastCode('авсе-кмнр-тх12-3456'));
    check('кирилична О стає нулем, І — одиницею', schoonGastCode('ОІ') === '01');
    check('введене обрізано до 24 знаків', schoonGastCode('A'.repeat(40)).length === 24);
    check('довжина коду — 16', GAST_CODE_LENGTE === 16);
    const повний = gastCodeStatus('ABCD-EFGH-JKMN-PQRS');
    check('повний правильний код дозволено надіслати', повний.volledig && повний.tekens === 16 && повний.ongeldig.length === 0, JSON.stringify(повний));
    const зU = gastCodeStatus('ABCD-EFGH-JKMN-PQRU');
    check('літеру U позначено недопустимою', !зU.volledig && зU.ongeldig.includes('U'), JSON.stringify(зU));
    const знак = gastCodeStatus('ABCD!EFGH');
    check('знак «!» позначено недопустимим', знак.ongeldig.includes('!') && !знак.volledig);
    const неповний = gastCodeStatus('ABCD EFGH');
    check('неповний код не можна надіслати', !неповний.volledig && неповний.tekens === 8 && неповний.ongeldig.length === 0);
    check('O, I, L допустимі (сервер замінює сам)', gastCodeStatus('OILO-OILO-OILO-OILO').volledig);

    // 2. Гостьова форма
    const gast = await readFile(join(root, 'src/GastToegang.tsx'), 'utf8');
    check('гостьова форма: noValidate (власні пояснення замість типових)', /noValidate/.test(gast));
    check('гостьова форма: поле має aria-invalid', /aria-invalid=\{/.test(gast));
    check('гостьова форма: поле має aria-describedby', /aria-describedby=\{/.test(gast));
    check('гостьова форма: помилка має id gast-code-fout', /id=['"]gast-code-fout['"]/.test(gast));
    check('гостьова форма: недопустимі знаки оголошуються (role=alert)', /id=['"]gast-code-teken['"][^>]*role=['"]alert['"]|role=['"]alert['"][^>]*id=['"]gast-code-teken['"]/.test(gast));
    check('гостьова форма: кнопка чекає повного коду', /codeStatus\.volledig/.test(gast));
    check('гостьова форма: фокус повертається в поле', /codeVeld\.current\?\.focus\(\)/.test(gast));
    check('гостьова форма: код із #code= очищено', /schoonGastCode\(/.test(gast));

    // 3. Форма пароля
    const ww = await readFile(join(root, 'src/aanmelden/AanmeldZonderGoogle.tsx'), 'utf8');
    check('форма пароля: помилка має id', /<p id=\{foutId\} className='mr-sign-in-fout'/.test(ww));
    check('форма пароля: адреса позначена при помилці', /type='email'[^>]*aria-invalid=\{fout/.test(ww) && /type='email'[^>]*aria-describedby=\{fout \? foutId/.test(ww));
    check('форма пароля: поле пароля позначене при помилці', /<GeheimInvoer[^>]*id=\{wachtwoordId\}[^>]*ariaInvalid=\{!!fout\}[^>]*ariaDescribedBy=\{fout \? foutId/.test(ww));
    check('форма пароля: фокус повертається в поле пароля', /getElementById\(wachtwoordId\)[\s\S]{0,80}focus\(\)/.test(ww));
    const geheim = await readFile(join(root, 'src/geheim/GeheimInvoer.tsx'), 'utf8');
    check('поле таємниці передає aria-invalid', /'aria-invalid': ariaInvalid/.test(geheim));
  } catch (e) {
    check('сторож виконано без винятків', false, String(e));
  }
  return einde();
}
