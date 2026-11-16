// KLAP-001 (15.11.2026): «Згорнути все / Розгорнути все» в блоках «Приватний простір» і «Технічний доступ» (RechtenKiezer,
// сторінка ШІ #agent/claude). Лише вигляд: кнопка не викликає onChange, тож дозволи не змінюються. Без браузера й бази.
// KLAP-001: knop «Alles inklappen / openklappen» per blok; alleen weergave, de rechten veranderen niet.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('klap-alles-20261115');
  const k = readFileSync('src/connector-v2/RechtenKiezer.tsx', 'utf8');
  const css = readFileSync('src/connector-v2/connector-v2.css', 'utf8');
  const kop = k.slice(k.indexOf("<header className='v2-kant-kop'>"), k.indexOf('</header>', k.indexOf("<header className='v2-kant-kop'>")));
  check('у шапці кожного блоку (приватний і технічний) є кнопка згортання з data-v2-klap-alles і aria-expanded',
    kop.includes("className='v2-klap-alles'") && kop.includes('data-v2-klap-alles={kant}') && kop.includes('aria-expanded={ietsOpen}'));
  check('підписи обома мовами: «Згорнути все / Розгорнути все» і «Alles inklappen / Alles openklappen»',
    kop.includes("tr('Згорнути все', 'Alles inklappen')") && kop.includes("tr('Розгорнути все', 'Alles openklappen')"));
  check('підказка пояснює наслідок: дозволи не змінюються, лише вигляд',
    kop.includes('Дозволи не змінюються') && kop.includes('De rechten veranderen niet'));
  const klap = k.slice(k.indexOf('const klapAlles = () => {'), k.indexOf('return (', k.indexOf('const klapAlles = () => {')));
  check('згортання діє на всі видимі групи блоку й закриває розгорнуті пояснення інструментів цього блоку',
    klap.includes('for (const g of zichtbareGroepen)') && klap.includes('setGroepDicht') && klap.includes('if (o.kant === kant) delete n[o.key]'));
  check('кнопка не змінює дозволів (не викликає onChange)', klap.length > 0 && !klap.includes('onChange'));
  check('стиль кнопки — до мобільного шару, на телефоні лишається лише піктограма',
    css.indexOf('.v2-klap-alles{') > 0 && css.indexOf('.v2-klap-alles{') < css.indexOf('@media (max-width:560px)') && /@media \(max-width:560px\)\{\s*\.v2-klap-alles span\{/.test(css));
  return einde();
}
