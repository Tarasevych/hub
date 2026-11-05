// ZOEKEN — SECTIE VAN EEN KNOP IN DE GEGENEREERDE CATALOGUS (ORCH-001, oude fout, 05.11.2026). Zonder database.
//
// De zoekkaart van een knop toont het pad «dienst › pagina › sectie»; de sectie is een kop (h1-h3) uit de bron. Vroeger gold «de
// laatste kop vóór de knop in het bestand», ook als die kop in een andere component stond of in een tak die nooit samen met de knop
// zichtbaar is. Echte gevolgen: 21 knoppen van de inbox (GoogleMailWerkruimte.tsx) toonden «Підключені Google-акаунти» (kop in de
// tak mode==='accounts'), «Вийти з фокусу» (cloud, werkruimten) toonde «Зберегти без організації», de knoppen van de meldingen
// toonden «Правила сповіщень». Nu geldt alleen een kop uit DEZELFDE JSX-boom (wat samen getoond wordt). Deze test houdt vast:
//   1. kop in een kopblok, knoppen in een zustercontainer van dezelfde boom → die kop (ook binnen {open && …} en .map(…));
//   2. kop in een tak (cond && (…), c ? (…) : (…)) of in een andere component/JSX-variabele → telt niet voor knoppen erbuiten;
//   3. de laatste passende kop wint; «<h2» in een tekst of commentaar is geen kop;
//   4. de echte catalogus.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';
import { UI_ELEMENTEN } from '../../shared/zoek-ui-knoppen.generated';

type El = { soort: string; uk: string; sectie: { uk: string; nl: string } | null };

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-ui-sectie-20261105');
  const gen = await import(pathToFileURL(join(process.cwd(), 'scripts/zoek-ui-catalogus.mjs')).href);
  const sectie = (src: string, uk: string) => {
    const el = (gen.elementenUit(src, 'src/Proef.tsx', []) as El[]).find((e) => e.uk === uk && e.soort === 'knop');
    return el ? (el.sectie?.uk ?? '') : '(niet gevonden)';
  };
  const knop = (uk: string, nl: string) => `<button type='button'>{tr('${uk}','${nl}')}</button>`;
  const kop = (h: string, uk: string, nl: string) => `<${h}>{tr('${uk}','${nl}')}</${h}>`;

  // 1. dezelfde boom
  const boom = `export function A({open, rijen}){return (<section><header>${kop('h2', 'Мої акаунти', 'Mijn accounts')}<p/></header>` +
    `<div className='lijst'>${knop('Додати акаунт', 'Account toevoegen')}{open && <div>${knop('Зберегти акаунт', 'Account opslaan')}</div>}` +
    `{rijen.map((r) => <div key={r}>${knop('Видалити рядок', 'Rij verwijderen')}</div>)}</div></section>);}`;
  check('1 kop in een kopblok; knoppen in een zustercontainer, in {open && …} en in .map(…) van dezelfde boom → die kop',
    sectie(boom, 'Додати акаунт') === 'Мої акаунти' && sectie(boom, 'Зберегти акаунт') === 'Мої акаунти' && sectie(boom, 'Видалити рядок') === 'Мої акаунти',
    `${sectie(boom, 'Додати акаунт')}|${sectie(boom, 'Зберегти акаунт')}|${sectie(boom, 'Видалити рядок')}`);

  // 2a. kop in een tak die niet samen met de knop getoond wordt (zoals mode==='accounts' in GoogleMailWerkruimte)
  const tak = `export function B({mode}){return (<div>{mode==='accounts' && (<section>${kop('h2', 'Підключені акаунти', 'Gekoppelde accounts')}` +
    `${knop('Від’єднати', 'Ontkoppelen')}</section>)}<main>${knop('Оновити пошту', 'Mail vernieuwen')}</main></div>);}`;
  check('2a kop in `mode===… && (…)`: geldt binnen die tak, niet voor de knop erna', sectie(tak, 'Від’єднати') === 'Підключені акаунти' && sectie(tak, 'Оновити пошту') === '',
    `${sectie(tak, 'Від’єднати')}|${sectie(tak, 'Оновити пошту')}`);
  // 2b. ternair
  const ternair = `export function C({p}){return p ? (<div>${kop('h3', 'Збережено', 'Opgeslagen')}</div>) : (<div>${knop('Вийти з режиму', 'Modus verlaten')}</div>);}`;
  check('2b kop in de ene kant van `? :` → niet voor een knop in de andere kant', sectie(ternair, 'Вийти з режиму') === '', sectie(ternair, 'Вийти з режиму'));
  // 2c. andere component en JSX-variabele
  const ander = `function Kop(){return <header>${kop('h2', 'Правила', 'Regels')}</header>;}` +
    `const titel = <h3>{tr('Заголовок змінної','Titel van variabele')}</h3>;` +
    `export function D(){return <div><Kop/>{titel}${knop('Позначити прочитаним', 'Als gelezen markeren')}</div>;}`;
  check('2c kop in een andere component of JSX-variabele → niet voor de knop in de pagina (liever geen sectie dan een verkeerde)', sectie(ander, 'Позначити прочитаним') === '', sectie(ander, 'Позначити прочитаним'));

  // 3. de laatste passende kop wint; geen kop uit tekst of commentaar
  const twee = `export function E(){return <div>${kop('h2', 'Перший розділ', 'Eerste sectie')}${knop('Дія один', 'Actie een')}` +
    `${kop('h2', 'Другий розділ', 'Tweede sectie')}${knop('Дія два', 'Actie twee')}</div>;}`;
  check('3a twee koppen in één boom: elke knop krijgt de laatste kop ervoor', sectie(twee, 'Дія один') === 'Перший розділ' && sectie(twee, 'Дія два') === 'Другий розділ',
    `${sectie(twee, 'Дія один')}|${sectie(twee, 'Дія два')}`);
  const tekst = `// <h2>{tr('Коментар-заголовок','Commentaarkop')}</h2>\nconst html = "<h2>{tr('Рядок-заголовок','Tekstkop')}</h2>";\n` +
    `export function F(){return <div>${knop('Справжня кнопка', 'Echte knop')}</div>;}`;
  check('3b «<h2» in commentaar of tekst is geen kop', sectie(tekst, 'Справжня кнопка') === '', sectie(tekst, 'Справжня кнопка'));
  // 3c. wisselende koptekst (zoals MeldingenV2: «Правила сповіщень» of «Сповіщення», naar de toestand) — de taalkeuze zelf telt niet
  const wissel = `export function G({paneel, lang, n}){return <div><header><h2>{paneel==='regels' ? tr('Правила панелі','Paneelregels') : tr('Стрічка панелі','Paneelstroom')}</h2>` +
    `${knop('Шукати в панелі', 'Zoeken in paneel')}</header><section><h3>{lang === 'uk' ? 'Мовний заголовок' : 'Taalkop'}</h3>${knop('Дія під мовним', 'Actie onder taalkop')}</section>` +
    `<section><h3>{n > 0 && tr('Є нові','Er is nieuws')}</h3>${knop('Дія під умовним', 'Actie onder voorwaardelijke kop')}</section></div>;}`;
  const els = gen.elementenUit(wissel, 'src/Proef.tsx', []) as El[];
  check('3c kop met wisselende tekst (?: of &&) is geen sectie voor knoppen, maar blijft zelf vindbaar; `lang === \'uk\' ? … : …` is gewoon een vertaling',
    sectie(wissel, 'Шукати в панелі') === '' && sectie(wissel, 'Дія під умовним') === '' && sectie(wissel, 'Дія під мовним') === 'Мовний заголовок' && els.some((e) => e.soort === 'sectie' && e.uk === 'Правила панелі'),
    `${sectie(wissel, 'Шукати в панелі')}|${sectie(wissel, 'Дія під умовним')}|${sectie(wissel, 'Дія під мовним')}`);

  // 3d. een kop geldt tot het einde van zijn blok (section, footer, dialog, …), niet tot het einde van de hele boom (05.11.2026)
  const blok = `export function H(){return <div className='venster'><section>${kop('h3', 'Закритий розділ', 'Gesloten sectie')}${knop('Дія в розділі', 'Actie in sectie')}</section>` +
    `<footer>${knop('Дія в підвалі', 'Actie in voet')}</footer><div>${knop('Дія після розділу', 'Actie na sectie')}</div>` +
    `<div role='dialog'><header>${kop('h2', 'Діалог', 'Dialoog')}</header>${knop('Дія в діалозі', 'Actie in dialoog')}</div>${knop('Дія після діалогу', 'Actie na dialoog')}` +
    `<article><header>${kop('h3', 'Стаття', 'Artikel')}</header><div className='rij'>${knop('Дія в статті', 'Actie in artikel')}</div></article><div>${knop('Дія після статті', 'Actie na artikel')}</div></div>;}`;
  const s3d = ['Дія в розділі', 'Дія в підвалі', 'Дія після розділу', 'Дія в діалозі', 'Дія після діалогу', 'Дія в статті', 'Дія після статті'].map((u) => sectie(blok, u));
  check('3d kop binnen een gesloten blok (section, role=dialog, article) geldt binnen dat blok, niet voor knoppen erna (voet, volgende div)',
    JSON.stringify(s3d) === JSON.stringify(['Закритий розділ', '', '', 'Діалог', '', 'Стаття', '']), s3d.join('|'));
  const zonderBlok = `export function I(){return <div><div className='kop'><header>${kop('h2', 'Шапка', 'Kop')}</header></div><div className='rij'>${knop('Дія без блоку', 'Actie zonder blok')}</div></div>;}`;
  check('3e zonder blok (alleen div/header, ook als die eerder sluiten) blijft de kop gelden voor de hele boom', sectie(zonderBlok, 'Дія без блоку') === 'Шапка', sectie(zonderBlok, 'Дія без блоку'));

  // 4. de echte catalogus
  const GMW = UI_ELEMENTEN.filter((e) => e.bestand === 'src/GoogleMailWerkruimte.tsx' && e.soort === 'knop');
  const metGa = GMW.filter((e) => e.sectieUk === 'Підключені Google-акаунти').map((e) => e.uk);
  // (de kop zelf wisselt: «Підключені Google-акаунти» of «Gmail для цієї …» naar het aantal accounts → ook in de tak geen sectie)
  check('4a inbox (GoogleMailWerkruimte): «Оновити пошту», «Друк», «Назад до списку» bestaan en geen enkele knop staat onder «Підключені Google-акаунти»',
    ['Оновити пошту', 'Друк', 'Назад до списку'].every((uk) => GMW.some((e) => e.uk === uk)) && metGa.length === 0, `${GMW.length}; met die sectie: ${metGa.join(', ') || '—'}`);
  const focus = UI_ELEMENTEN.find((e) => e.bestand === 'src/CloudFunctioneelWeergave.tsx' && e.uk === 'Вийти з фокусу');
  check('4b cloud: «Вийти з фокусу» (werkruimten) niet onder «Зберегти без організації»', !!focus && focus.sectieUk !== 'Зберегти без організації', focus ? `${focus.tab}: ${focus.sectieUk || '—'}` : '(niet gevonden)');
  const mv2 = UI_ELEMENTEN.filter((e) => e.bestand === 'src/meldingen/v2/MeldingenV2.tsx' && e.soort === 'knop' && e.sectieUk === 'Правила сповіщень');
  check('4c meldingen: geen knop meer onder de wisselende kop «Правила сповіщень»', mv2.length === 0, mv2.map((e) => e.uk).join(', '));
  const BC = UI_ELEMENTEN.find((e) => e.bestand === 'src/BeheerConsoleWeergave.tsx' && e.uk === 'Застосувати роль');
  check('4d beheerconsole: «Застосувати роль» houdt zijn sectie «Адміністративні ролі» (zelfde boom)', BC?.sectieUk === 'Адміністративні ролі', BC?.sectieUk || '—');
  // 05.11.2026: 442 → 300 knoppen met een sectie (na de blokgrens 297). De meeste van de 142 stonden onder een kop uit een andere
  // boom, tak of onder een wisselende kop; minstens 14 juiste secties gingen ook weg (voorzichtig: liever geen sectie dan een onjuiste).
  check('4e nog steeds de meeste secties (geen massaal verlies): ≥ 280', UI_ELEMENTEN.filter((e) => e.sectieUk).length >= 280, String(UI_ELEMENTEN.filter((e) => e.sectieUk).length));
  return einde();
}
