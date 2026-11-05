// ZOEKEN — TABBLAD VAN EEN ELEMENT IN DE GEGENEREERDE CATALOGUS (ORCH-001, oude fout, 05.11.2026). Zonder database.
//
// scripts/zoek-ui-catalogus.mjs bepaalt op welke pagina (tabblad) van een dienst een knop of kop leeft; de zoeker opent precies die
// pagina (de route zelf: tests/eenheid/zoek-route-tabblad-20261105.test.ts). Vroeger: «de laatste `tab==='x'` in de 1500 tekens vóór
// het element». Dat ging mis bij lange takken (de knop «Підтвердити видалення» staat 1503 tekens na `p.tab==='account'` → de zoeker
// opende «Персоналізація», waar die knop niet is) en bij elementen NA een afgesloten tak (`if (tab==='accounts') return …;` gevolgd
// door de gewone weergave erfde «accounts»). Nu leest de generator de syntaxisboom en rekent per plek uit welke tabbladen daar nog
// mogelijk zijn; precies één = de hint. Deze test houdt vast:
//   1. lange if/else-if-keten: het tabblad blijft, ook na duizenden tekens;
//   2. code na `if (tab==='x') return …` hoort NIET bij x; `else` hoort niet bij x;
//   3. `x ? A : B` (alleen A), `x && A`, `switch (tab) { case 'x': … }`; `!==`, `!(…)` en `a || b` (twee tabbladen) geven geen hint;
//   4. eigen component / hulpfunctie / JSX-variabele: het tabblad van de plek waar die gebruikt wordt, alleen als alle plekken het
//      eens zijn; een component die ook als waarde wordt doorgegeven is niet te volgen; recursie binnen het eigen lichaam telt niet;
//   5. onbekende tabbladen tellen niet;
//   7. wat overblijft: na `if (tab !== 'x') return`, aan het eind van een else-if-keten met een const-voorwaarde, in `const x = c ? <…/> : null`;
//   8. (tweede onafhankelijke review) namen zoals TypeScript ze oplost: een let/var/catch/for-of/import of lokale const met dezelfde
//      naam in een andere functie geeft GEEN valse hint; gehesen functiedeclaraties; switch-takken met `break` vallen niet door;
//      `memo(function X …)`/`forwardRef(function X …)`; `if … else` waarvan één kant verlaat; waarde-aliassen van het tabblad
//      (`effectiveTab`, `section`, ook in `switch`); `pages[tab]` met JSX-variabelen; geneste componenten blijven snel;
//   6. de echte catalogus: «Підтвердити видалення» → identity/account, «Зберегти меню» → identity/menu, «Перейменувати» (сховище) → api/vault,
//      lokale mail → mail/local, GitHub-zoeken → research; beheerconsole (pages[tab]), cloud (effectiveTab), MCP (section) en de hub
//      «Підключення ШІ» op mcp/agents.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';
import { UI_ELEMENTEN } from '../../shared/zoek-ui-knoppen.generated';

type El = { soort: string; uk: string; tabHint?: string };

export async function main(): Promise<number> {
  const { check, einde } = checker('zoek-ui-tabblad-20261105');
  const gen = await import(pathToFileURL(join(process.cwd(), 'scripts/zoek-ui-catalogus.mjs')).href);
  const TABS = ['overview', 'account', 'accounts', 'menu', 'sharing', 'vault', 'widgets', 'activity', 'projects', 'local'];
  const hint = (src: string, uk: string, soort = 'knop') => {
    const el = (gen.elementenUit(src, 'src/Proef.tsx', TABS) as El[]).find((e) => e.uk === uk && e.soort === soort);
    return el ? (el.tabHint ?? '') : '(niet gevonden)';
  };
  const knop = (uk: string, nl: string) => `<button type='button'>{tr('${uk}','${nl}')}</button>`;
  const opvulling = `<p>${'x'.repeat(3000)}</p>`;

  // 1. lange keten
  const keten = `export function V(p){let body;if(p.tab==='menu')body=<div>${knop('Зберегти меню','Menu opslaan')}</div>;` +
    `else if(p.tab==='account')body=<div>${opvulling}<section><h3>{tr('Видалити поточний акаунт','Huidig account verwijderen')}</h3>${opvulling}${knop('Підтвердити видалення','Verwijderen bevestigen')}</section></div>;` +
    `else body=<div>${knop('Загальна дія','Algemene actie')}</div>;return body;}`;
  check('1a lange tak: knop 6000+ tekens na p.tab===\'account\' → account', hint(keten, 'Підтвердити видалення') === 'account', hint(keten, 'Підтвердити видалення'));
  check('1b kop in dezelfde lange tak → account', hint(keten, 'Видалити поточний акаунт', 'sectie') === 'account');
  check('1c eerste tak → menu; else-tak → geen tabblad', hint(keten, 'Зберегти меню') === 'menu' && hint(keten, 'Загальна дія') === '');

  // 2. vroege return
  const vroeg = `export function G({tab}){if(tab==='accounts')return <div>${knop('Акаунт дія','Accountactie')}</div>;` +
    `if(!ok)return <div><h2>{tr('Підключіть сервіс','Koppel de dienst')}</h2>${knop('Повторити спробу','Opnieuw proberen')}</div>;return <div/>;}`;
  check('2a binnen `if (tab===\'accounts\') return …` → accounts', hint(vroeg, 'Акаунт дія') === 'accounts');
  check('2b NA die return (gewone weergave) → geen tabblad (was: accounts)', hint(vroeg, 'Повторити спробу') === '' && hint(vroeg, 'Підключіть сервіс', 'sectie') === '');

  // 3. ternair, &&, switch, ontkenning
  const vormen = `export function F({tab,p}){return <div>{tab==='vault'?${knop('Перейменувати','Hernoemen')}:${knop('Інша дія','Andere actie')}}` +
    `{p.tab==='sharing'&&${knop('Створити посилання','Link maken')}}{tab!=='menu'&&${knop('Не меню','Geen menu')}}{!(tab==='menu')&&${knop('Знову не меню','Weer geen menu')}}` +
    `{(tab==='widgets'||tab==='projects')&&busy&&${knop('Спільна дія','Gedeelde actie')}}</div>;}` +
    `export function S({tab}){switch(tab){case 'widgets':return ${knop('Додати свій сервіс','Eigen dienst toevoegen')};default:return ${knop('Типово','Standaard')};}}`;
  check('3a `tab===\'vault\' ? A : B`: A → vault, B → geen', hint(vormen, 'Перейменувати') === 'vault' && hint(vormen, 'Інша дія') === '');
  check('3b `p.tab===\'sharing\' && A` → sharing', hint(vormen, 'Створити посилання') === 'sharing');
  check('3c `!==` en `!(…)` geven geen tabblad', hint(vormen, 'Не меню') === '' && hint(vormen, 'Знову не меню') === '');
  check('3d `tab===\'widgets\'||tab===\'projects\'`: twee mogelijke tabbladen → geen (de bestandsregel geldt)', hint(vormen, 'Спільна дія') === '', hint(vormen, 'Спільна дія'));
  check('3e switch (tab): case \'widgets\' → widgets, default → geen', hint(vormen, 'Додати свій сервіс') === 'widgets' && hint(vormen, 'Типово') === '');

  // 4. eigen component, hulpfunctie, JSX-variabele
  const comp = `function Kaart(){return <section><h3>{tr('Активність сервісу','Activiteit van de dienst')}</h3>${knop('Оновити стрічку','Feed vernieuwen')}</section>;}` +
    `function Twee(){return ${knop('Двічі вжито','Twee keer gebruikt')};}` +
    `function Waarde(){return ${knop('Як значення','Als waarde')};}` +
    `const rij=()=>${knop('Рядок функції','Rij van functie')};` +
    `const blok=<div>${knop('Блок змінної','Blok van variabele')}</div>;` +
    `function Zelf(){return <div>${knop('Сам себе','Zichzelf')}<Zelf/></div>;}` +
    `export function H({tab}){return <div>{tab==='activity'&&<Kaart/>}{tab==='activity'&&<Twee/>}{tab==='projects'&&<Twee/>}` +
    `{tab==='projects'&&<Lijst items={[Waarde]}/>}{tab==='projects'&&<Waarde/>}{tab==='account'&&rij()}{tab==='accounts'?blok:null}{tab==='overview'&&<Zelf/>}</div>;}`;
  check('4a component alleen onder activity gebruikt → kop en knop erin → activity', hint(comp, 'Оновити стрічку') === 'activity' && hint(comp, 'Активність сервісу', 'sectie') === 'activity');
  check('4b component onder twee verschillende tabbladen → geen', hint(comp, 'Двічі вжито') === '');
  // Waarde staat ALLEEN onder projects (als tag én als waarde): het enige wat geen hint geeft, is de regel «als waarde = niet te volgen».
  check('4c component ook als waarde doorgegeven (items={[Waarde]}), zelfs onder hetzelfde tabblad → niet te volgen → geen', hint(comp, 'Як значення') === '', hint(comp, 'Як значення'));
  check('4d hulpfunctie rij() onder account aangeroepen → account', hint(comp, 'Рядок функції') === 'account');
  check('4e JSX-variabele blok onder accounts gebruikt → accounts', hint(comp, 'Блок змінної') === 'accounts');
  check('4f zelfverwijzende component loopt niet vast; de eigen <Zelf/> in het lichaam telt niet (alleen via buiten bereikbaar) → overview', hint(comp, 'Сам себе') === 'overview', hint(comp, 'Сам себе'));

  // 5. onbekend tabblad
  const onbekend = `export function O({tab}){return <div>{tab==='bestaatniet'&&${knop('Нема такої','Bestaat niet')}}</div>;}`;
  check('5 een tabblad dat geen pagina van de dienst is telt niet', hint(onbekend, 'Нема такої') === '');

  // 7. verzamelingen: wat na `!==` + return, na een else-if-keten met een const-voorwaarde, en in `const x = c ? <…/> : null` overblijft
  const rest = `export function L({tab}){if(tab!=='local')return <div/>;return <div>${knop('Лише локально','Alleen lokaal')}</div>;}` +
    `export function M({tab,cur,focus}){const std=tab!=='accounts'&&tab!=='local'&&tab!=='overview';` +
    `const fv=cur?(<div>${knop('Фокус листа','Focus op bericht')}</div>):null;let body;` +
    `if(tab==='accounts')body=<div>${knop('Акаунти тут','Accounts hier')}</div>;else if(tab==='overview')body=<div/>;else if(std)body=<div>${knop('Звичайна поверхня','Gewoon oppervlak')}</div>;` +
    `else if(focus)body=fv;else body=<div>${knop('Що лишилось','Wat overblijft')}</div>;return body;}` +
    `export function N({tab}){switch(tab){case 'menu':case 'widgets':return ${knop('Два випадки','Twee gevallen')};case 'vault':return ${knop('Сховище випадок','Kluisgeval')};default:return null;}}`;
  check('7a `if (tab !== \'local\') return …;` — wat volgt → local', hint(rest, 'Лише локально') === 'local', hint(rest, 'Лише локально'));
  check('7b else-if-keten met const-voorwaarde (std = tab!==… && …): laatste else → local; std-tak → geen', hint(rest, 'Що лишилось') === 'local' && hint(rest, 'Звичайна поверхня') === '' && hint(rest, 'Акаунти тут') === 'accounts', `${hint(rest, 'Що лишилось')}|${hint(rest, 'Звичайна поверхня')}`);
  check('7c `const fv = cur ? <…/> : null`, gebruikt in die keten → local', hint(rest, 'Фокус листа') === 'local', hint(rest, 'Фокус листа'));
  check('7d switch: doorvallende lege case (menu → widgets) → geen; case \'vault\' → vault', hint(rest, 'Два випадки') === '' && hint(rest, 'Сховище випадок') === 'vault');

  // 8a. namen zoals TypeScript ze oplost: dezelfde tekst in een andere functie is een andere naam
  const schaduw = `import { zichtbaar } from './elders';` +
    `function A({tab}){const actief=tab==='account';const fout=tab==='vault';const zichtbaar=tab==='menu';return <div>{actief&&<p/>}{fout&&<p/>}{zichtbaar&&<p/>}</div>;}` +
    `export function B({items}){let actief=items.length>0;if(actief)return <div>${knop('Список дій','Lijst van acties')}</div>;return null;}` +
    `export function C(){var fout=laad();return fout?<div>${knop('Повторити запит','Verzoek herhalen')}</div>:null;}` +
    `export function D(){try{doe();}catch(fout){return fout&&<div>${knop('Помилка дії','Fout bij actie')}</div>;}return null;}` +
    `export function E({rijen}){for(const actief of rijen){if(actief)return <div>${knop('Цикл дія','Lusactie')}</div>;}return null;}` +
    `export function G(){return zichtbaar&&<div>${knop('Імпорт видно','Import zichtbaar')}</div>;}` +
    `export function Kaart(){return <div>${knop('Картка дія','Kaartactie')}</div>;}` +
    `export function V({tab,kaarten}){const Kaart=kaarten[0];return <div>{tab==='activity'&&<Kaart/>}</div>;}`;
  const valseHints = ['Список дій', 'Повторити запит', 'Помилка дії', 'Цикл дія', 'Імпорт видно', 'Картка дія'].map((uk) => `${uk}=${hint(schaduw, uk)}`).filter((x) => !x.endsWith('='));
  check('8a let / var / catch / for-of / import / lokale const met dezelfde naam als een const elders → geen valse hint', valseHints.length === 0, valseHints.join(', '));

  // 8b. gehesen functiedeclaraties
  const hijs = `export function V({tab}){if(tab==='vault')return <div><Kop/></div>;return <section><Kop/></section>;function Kop(){return <div>${knop('Оновити дані','Gegevens vernieuwen')}</div>;}}` +
    `export function W({tab}){if(tab==='menu')return <div>{rij()}</div>;return <section/>;function rij(){return <div>${knop('Рядок звіту','Rapportregel')}</div>;}}`;
  check('8b functie onder een vroege return gedeclareerd: hangt af van het gebruik (vault én rest → geen; alleen in de menu-return → menu)', hint(hijs, 'Оновити дані') === '' && hint(hijs, 'Рядок звіту') === 'menu', `${hint(hijs, 'Оновити дані')}|${hint(hijs, 'Рядок звіту')}`);

  // 8c. switch met break
  const breek = `export function SW({tab}){let body;switch(tab){case 'vault':body=<div>${knop('Перша дія','Eerste actie')}</div>;break;` +
    `case 'menu':body=<div>${knop('Друга дія','Tweede actie')}</div>;break;case 'sharing':{body=<div>${knop('Третя дія','Derde actie')}</div>;break;}default:body=null;}return body;}`;
  check('8c switch: een tak die met break eindigt valt niet door (vault, menu, sharing — ook met break in een blok)', hint(breek, 'Перша дія') === 'vault' && hint(breek, 'Друга дія') === 'menu' && hint(breek, 'Третя дія') === 'sharing', `${hint(breek, 'Перша дія')}|${hint(breek, 'Друга дія')}|${hint(breek, 'Третя дія')}`);

  // 8d. memo(function X) en forwardRef(function X)
  const memo = `const Rij=memo(function Rij(){return <div>${knop('Рядок мемо','Memo-rij')}</div>;});` +
    `const Veld=forwardRef(function Veld(p,ref){return <div>${knop('Поле посилання','Ref-veld')}</div>;});` +
    `export function MV({tab}){return <div>{tab==='widgets'&&<Rij/>}{tab==='activity'&&<Veld/>}</div>;}`;
  check('8d memo(function Rij …) → widgets, forwardRef(function Veld …) → activity (de eigen naam van de functie is geen gebruik)', hint(memo, 'Рядок мемо') === 'widgets' && hint(memo, 'Поле посилання') === 'activity', `${hint(memo, 'Рядок мемо')}|${hint(memo, 'Поле посилання')}`);
  // memo(…) telt als COMPONENT (alleen <Rij/> of Rij() volgen), niet als JSX-waarde: ook als waarde doorgegeven → niet te volgen
  const memoWaarde = `const Rij=memo(function Rij(){return <div>${knop('Рядок як значення','Rij als waarde')}</div>;});` +
    `export function MW({tab}){return <div>{tab==='widgets'&&<Lijst items={[Rij]}/>}{tab==='widgets'&&<Rij/>}</div>;}`;
  check('8d memo-component ook als waarde doorgegeven (items={[Rij]}) → niet te volgen → geen', hint(memoWaarde, 'Рядок як значення') === '', hint(memoWaarde, 'Рядок як значення'));

  // 8e. if … else waarvan één kant verlaat
  const anders = `export function IE({tab}){if(tab!=='local'){return <div/>;}else{doe();}return <div>${knop('Після розгалуження','Na de vertakking')}</div>;}` +
    `export function IF({tab}){if(tab==='local'){doe();}else{return <div/>;}return <div>${knop('Не вийшли','Niet weg')}</div>;}`;
  check('8e `if (c) { return } else { … }` en `if (c) { … } else { return }`: wat volgt → local', hint(anders, 'Після розгалуження') === 'local' && hint(anders, 'Не вийшли') === 'local', `${hint(anders, 'Після розгалуження')}|${hint(anders, 'Не вийшли')}`);

  // 8f. waarde-aliassen van het tabblad (zoals cloud: effectiveTab, MCP: section)
  const aliassen = `export function CF({tab}){const effectiveTab=['google','onedrive'].includes(tab)?'accounts':tab;` +
    `return <div>{effectiveTab==='vault'&&<div>${knop('Знайти у сховищі','Zoeken in kluis')}</div>}{effectiveTab==='accounts'&&<div>${knop('Акаунти хмари','Cloudaccounts')}</div>}</div>;}` +
    `export function MS({tab}){const section=['overview','menu','sharing'].includes(tab)?tab:'overview';` +
    `switch(section){case 'menu':return <div>${knop('Секція меню','Menusectie')}</div>;default:return <div>${knop('Секція типово','Standaardsectie')}</div>;}}`;
  check('8f `const effectiveTab = [...].includes(tab) ? \'accounts\' : tab` → vault / accounts; `switch (section)` → menu; default → geen',
    hint(aliassen, 'Знайти у сховищі') === 'vault' && hint(aliassen, 'Акаунти хмари') === 'accounts' && hint(aliassen, 'Секція меню') === 'menu' && hint(aliassen, 'Секція типово') === '',
    ['Знайти у сховищі', 'Акаунти хмари', 'Секція меню', 'Секція типово'].map((u) => hint(aliassen, u)).join('|'));

  // 8g. pages[tab] (zoals de beheerconsole)
  const paginas = `export function AC({tab}){const sso=<section><h2>{tr('Система входу','Aanmeldsysteem')}</h2>${knop('Зберегти вхід','Aanmelding opslaan')}</section>;` +
    `const roles=<div>${knop('Застосувати роль','Rol toepassen')}</div>;const overview=<div>${knop('Огляд дія','Overzichtactie')}</div>;` +
    `const pages={overview,vault:sso,menu:roles,sharing:<div>${knop('Вбудована сторінка','Ingebouwde pagina')}</div>};return <main>{pages[tab]||overview}</main>;}` +
    `export function AD({tab}){const kaart=<div>${knop('Інший доступ','Andere toegang')}</div>;const p2={vault:kaart};const n=Object.keys(p2);return <main>{p2[tab]}{n.length}</main>;}`;
  check('8g `pages[tab]`: sso → vault (knop en kop), roles → menu, JSX direct als waarde → sharing; overview (ook terugval) → geen',
    hint(paginas, 'Зберегти вхід') === 'vault' && hint(paginas, 'Система входу', 'sectie') === 'vault' && hint(paginas, 'Застосувати роль') === 'menu' && hint(paginas, 'Вбудована сторінка') === 'sharing' && hint(paginas, 'Огляд дія') === '',
    ['Зберегти вхід', 'Застосувати роль', 'Вбудована сторінка', 'Огляд дія'].map((u) => hint(paginas, u)).join('|'));
  check('8g een object dat ook anders wordt gelezen (Object.keys) is niet te volgen → geen', hint(paginas, 'Інший доступ') === '');

  // 8h. geneste componenten: lineair, niet exponentieel (elk niveau gebruikt het vorige twee keer)
  const N = 24;
  let diep = `function K0(){return <div>${knop('Глибока кнопка','Diepe knop')}</div>;}`;
  for (let i = 1; i <= N; i++) diep += `function K${i}(){return <div><K${i - 1}/><K${i - 1}/></div>;}`;
  diep += `export function DV({tab}){return tab==='projects'?<K${N}/>:null;}`;
  const t0 = performance.now(); const diepHint = hint(diep, 'Глибока кнопка'); const ms = Math.round(performance.now() - t0);
  check(`8h ${N} geneste componenten (2^${N} paden) → projects, binnen 3 s`, diepHint === 'projects' && ms < 3000, `${diepHint} in ${ms} ms`);
  // 8h'. «ladder»: per niveau twee VERSCHILLENDE componenten die elk beide vorige gebruiken (vroeger per pad onthouden: 2^N)
  const L = 22;
  let ladder = `function A0(){return <div>${knop('Ladderknop','Ladderknop')}</div>;}function B0(){return <div/>;}`;
  for (let i = 1; i <= L; i++) ladder += `function A${i}(){return <div><A${i - 1}/><B${i - 1}/></div>;}function B${i}(){return <div><A${i - 1}/><B${i - 1}/></div>;}`;
  ladder += `export function LD({tab}){return tab==='projects'?<div><A${L}/><B${L}/></div>:null;}`;
  const l0 = performance.now(); const ladderHint = hint(ladder, 'Ladderknop'); const lms = Math.round(performance.now() - l0);
  check(`8h' ladder van ${L} niveaus met twee verschillende componenten → projects, binnen 3 s`, ladderHint === 'projects' && lms < 3000, `${ladderHint} in ${lms} ms`);
  // 8h''. het geheugen verandert de uitkomst niet: met en zonder geheugen gelijk, ook bij kringen (A ↔ B), recursie en een kleine ladder
  const vergelijk = (src: string) => {
    const met = (gen.elementenUit(src, 'src/Proef.tsx', TABS) as El[]).map((e) => `${e.uk}=${e.tabHint}`).join('|');
    const zonder = (gen.elementenUit(src, 'src/Proef.tsx', TABS, { zonderGeheugen: true }) as El[]).map((e) => `${e.uk}=${e.tabHint}`).join('|');
    return { gelijk: met === zonder, met, zonder };
  };
  let kleineLadder = `function A0(){return <div>${knop('Kleine ladder','Kleine ladder')}</div>;}function B0(){return <div>${knop('Ander blad','Ander blad')}</div>;}`;
  for (let i = 1; i <= 6; i++) kleineLadder += `function A${i}(){return <div><A${i - 1}/><B${i - 1}/></div>;}function B${i}(){return <div><B${i - 1}/></div>;}`;
  kleineLadder += `export function KL({tab}){return <div>{tab==='projects'&&<A6/>}{tab==='vault'&&<B6/>}{tab==='projects'&&<B3/>}</div>;}`;
  const kringen = `function KA({n}){return <div>${knop('Kring A','Kring A')}{n>0&&<KB n={n-1}/>}</div>;}function KB({n}){return <div>${knop('Kring B','Kring B')}{n>0&&<KA n={n-1}/>}</div>;}` +
    `function KZ(){return <div>${knop('Zelf in zelf','Zelf in zelf')}<KZ/></div>;}` +
    `export function KK({tab}){return <div>{tab==='menu'&&<KA n={3}/>}{tab==='menu'&&<KZ/>}{tab==='vault'&&<KB n={1}/>}</div>;}`;
  // kring tussen twee JSX-variabelen: de uitkomst bij «b in a» hangt af van het pad (via a of rechtstreeks) en mag dus niet
  // per plek bewaard worden — anders krijgt «Кнопка Б» de verzameling van het eerste pad ({menu}) i.p.v. {widgets}
  const jsxKring = `export function JK({tab}){const a=<div>${knop('Кнопка А','Knop A')}{tab==='menu'&&b}</div>;const b=<div>${knop('Кнопка Б','Knop B')}{tab==='vault'&&a}</div>;` +
    `return <div>{tab==='sharing'&&a}{tab==='widgets'&&b}</div>;}`;
  const v1 = vergelijk(kleineLadder), v2 = vergelijk(kringen), v3 = vergelijk(comp), v4 = vergelijk(jsxKring);
  check("8h'' met en zonder geheugen dezelfde uitkomst (ladder, kringen A ↔ B, kring tussen JSX-variabelen, recursie, componenten uit 4)",
    v1.gelijk && v2.gelijk && v3.gelijk && v4.gelijk && v1.met === 'Kleine ladder=projects|Ander blad=' && v2.met.includes('Zelf in zelf=menu') &&
    hint(jsxKring, 'Кнопка А') === 'sharing' && hint(jsxKring, 'Кнопка Б') === 'widgets',
    `${v1.gelijk}/${v2.gelijk}/${v3.gelijk}/${v4.gelijk}: ${v1.met} || ${v2.met} || ${v4.met}`);

  // 8i. alleen het tabblad van de PAGINA telt (tweede rev'ju): andere namen `tab` geven geen hint
  const ander = (src: string, uk: string) => hint(src, uk);
  const i1 = `export function V1({tab:pagina}){return <nav>{['vault','menu'].map((tab)=>tab==='vault'?${knop('Кнопка смуги','Strookknop')}:null)}</nav>;}`;
  const i2 = `export function V2({tab}){return <nav>{['vault','menu'].map((tab)=>tab==='vault'?${knop('Затінена кнопка','Overschaduwde knop')}:null)}</nav>;}`;
  const i3 = `export function V3({pagina}){const [tab,setTab]=useState('overview');return <div>{tab==='activity'&&${knop('Внутрішня вкладка','Interne tab')}}</div>;}`;
  const i4 = `function Rij({tab}){return tab==='sharing'?${knop('Рядок типу','Rij van soort')}:null;}export function V4({items}){return <ul>{items.map((i)=><Rij key={i.id} tab={i.kind}/>)}</ul>;}`;
  const i5 = `export function V5({items}){return <ul>{items.map((item)=>item.tab==='vault'?${knop('Елемент списку','Lijstelement')}:null)}</ul>;}`;
  const i6 = `export function V6(){const [tab,setTab]=useState('menu');const deel=['menu','widgets'].includes(tab)?tab:'overview';switch(deel){case 'widgets':return ${knop('Локальний switch','Lokale switch')};default:return null;}}`;
  const i7 = `export function V7({pagina}){const sso=<div>${knop('Сторінка циклу','LusPagina')}</div>;const pages={vault:sso};return <div>{['vault','menu'].map((tab)=><section key={tab} hidden={tab!==pagina}>{pages[tab]}</section>)}</div>;}`;
  check('8i namen `tab` die niet het tabblad van de pagina zijn → geen hint (smuga .map, schaduw, useState, prop van een kind, item.tab, switch op een lokale alias, pages[tab] in een lus)',
    [ander(i1, 'Кнопка смуги'), ander(i2, 'Затінена кнопка'), ander(i3, 'Внутрішня вкладка'), ander(i4, 'Рядок типу'), ander(i5, 'Елемент списку'), ander(i6, 'Локальний switch'), ander(i7, 'Сторінка циклу')].every((x) => x === ''),
    [ander(i1, 'Кнопка смуги'), ander(i2, 'Затінена кнопка'), ander(i3, 'Внутрішня вкладка'), ander(i4, 'Рядок типу'), ander(i5, 'Елемент списку'), ander(i6, 'Локальний switch'), ander(i7, 'Сторінка циклу')].join('|'));
  const p1 = `function Binnen({tab}){return tab==='vault'?${knop('Через проп','Via prop')}:null;}export function P1({tab}){return <div><Binnen tab={tab}/></div>;}`;
  const p2 = `export default function (p){const {tab}=p;return tab==='menu'?${knop('Анонімна сторінка','Anonieme pagina')}:null;}`;
  const p3 = `function P3(p){const tab=p.tab;return tab==='sharing'?${knop('Псевдонім пропа','Alias van prop')}:null;}export default P3;`;
  const p4 = `const P4=memo(function P4({tab}){return tab==='widgets'?${knop('Мемо-сторінка','Memo-pagina')}:null;});export { P4 };`;
  check('8i wel: kind met `tab={tab}` van de pagina, `export default function (p)` + `const {tab}=p`, `const tab=p.tab` + `export default P3`, memo + `export { P4 }`',
    hint(p1, 'Через проп') === 'vault' && hint(p2, 'Анонімна сторінка') === 'menu' && hint(p3, 'Псевдонім пропа') === 'sharing' && hint(p4, 'Мемо-сторінка') === 'widgets',
    `${hint(p1, 'Через проп')}|${hint(p2, 'Анонімна сторінка')}|${hint(p3, 'Псевдонім пропа')}|${hint(p4, 'Мемо-сторінка')}`);

  // 6. de echte catalogus
  const echt = (uk: string) => UI_ELEMENTEN.filter((e) => e.uk === uk).map((e) => `${e.dienst}/${e.tab}`);
  const in_ = (uk: string, bestand: string, soort = '') => UI_ELEMENTEN.filter((e) => e.uk === uk && e.bestand === bestand && (!soort || e.soort === soort)).map((e) => `${e.dienst}/${e.tab}`);
  check('6e mail: «Звичайна пошта» en «Відкласти без провини» (lokale mail) → mail/local; «Поштові акаунти» → mail/accounts',
    JSON.stringify(in_('Звичайна пошта', 'src/MailFunctioneelWeergave.tsx')) === '["mail/local"]' && in_('Відкласти без провини', 'src/MailFunctioneelWeergave.tsx').includes('mail/local') && in_('Поштові акаунти', 'src/MailFunctioneelWeergave.tsx').includes('mail/accounts'));
  check('6f GitHub: «Шукати» → research, «Проєкти GitHub» → projects, «Повторити» (na de accounts-return) niet op accounts',
    in_('Шукати', 'src/GitHubWeergave.tsx').includes('github/research') && in_('Проєкти GitHub', 'src/GitHubWeergave.tsx').includes('github/projects') && !in_('Повторити', 'src/GitHubWeergave.tsx').includes('github/accounts'));
  check('6a «Підтвердити видалення» (Instellingen) → identity/account, niet personalization', JSON.stringify(echt('Підтвердити видалення')) === '["identity/account"]', echt('Підтвердити видалення').join(','));
  check('6b «Видалити поточний акаунт» (kop) → identity/account', UI_ELEMENTEN.some((e) => e.soort === 'sectie' && e.uk === 'Видалити поточний акаунт' && e.tab === 'account'));
  check('6c «Зберегти меню» → identity/menu; «Додати свій сервіс» → identity/widgets', echt('Зберегти меню').includes('identity/menu') && echt('Додати свій сервіс').includes('identity/widgets'));
  check('6d «Перейменувати» van de sleutelkluis (API-platform) → api/vault', UI_ELEMENTEN.some((e) => e.uk === 'Перейменувати' && e.bestand === 'src/ApiPlatformWeergave.tsx' && e.dienst === 'api' && e.tab === 'vault'));
  const BC = 'src/BeheerConsoleWeergave.tsx';
  check('6g beheerconsole (pages[tab]): «Зберегти політику єдиного входу» → admin/sso, «Застосувати роль» → admin/roles, kop «Події пристроїв» → admin/devices',
    JSON.stringify(in_('Зберегти політику єдиного входу', BC)) === '["admin/sso"]' && JSON.stringify(in_('Застосувати роль', BC)) === '["admin/roles"]' && JSON.stringify(in_('Події пристроїв', BC, 'sectie')) === '["admin/devices"]',
    `${in_('Зберегти політику єдиного входу', BC)}|${in_('Застосувати роль', BC)}|${in_('Події пристроїв', BC, 'sectie')}`);
  const CL = 'src/CloudFunctioneelWeergave.tsx';
  check('6h cloud (effectiveTab): «Знайти» → cloud/search, «Зберегти зараз» → cloud/capture, «Вийти з фокусу» → cloud/workspaces',
    JSON.stringify(in_('Знайти', CL)) === '["cloud/search"]' && JSON.stringify(in_('Зберегти зараз', CL)) === '["cloud/capture"]' && JSON.stringify(in_('Вийти з фокусу', CL)) === '["cloud/workspaces"]',
    `${in_('Знайти', CL)}|${in_('Зберегти зараз', CL)}|${in_('Вийти з фокусу', CL)}`);
  const MCP = 'src/McpDienstWeergave.tsx';
  check('6i MCP (section): «Записати» → mcp/board, «Зібрати повний архів» → mcp/download',
    JSON.stringify(in_('Записати', MCP)) === '["mcp/board"]' && JSON.stringify(in_('Зібрати повний архів', MCP)) === '["mcp/download"]', `${in_('Записати', MCP)}|${in_('Зібрати повний архів', MCP)}`);
  const hub = UI_ELEMENTEN.filter((e) => e.bestand.startsWith('src/agenten/') || e.bestand.startsWith('src/connector-v2/'));
  check('6j hub «Підключення ШІ» (agenten/, connector-v2/) staat op mcp/agents, niets meer op ai/agents (daar staat alleen een verwijzing)',
    hub.length > 100 && hub.every((e) => e.dienst === 'mcp' && e.tab === 'agents') && !UI_ELEMENTEN.some((e) => e.dienst === 'ai' && e.tab === 'agents'), `${hub.length}`);
  return einde();
}
