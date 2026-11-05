// ZOEKEN — TABBLAD VAN EEN ELEMENT IN DE GEGENEREERDE CATALOGUS (ORCH-001, oude fout, 05.11.2026). Zonder database.
//
// scripts/zoek-ui-catalogus.mjs bepaalt op welke pagina (tabblad) van een dienst een knop of kop leeft; de zoeker opent dan precies
// die pagina. Vroeger: «de laatste `tab==='x'` in de 1500 tekens vóór het element». Dat ging mis bij lange takken (de knop
// «Підтвердити видалення» staat 1503 tekens na `p.tab==='account'` → de zoeker opende «Персоналізація», waar die knop niet is) en bij
// elementen NA een afgesloten tak (`if (tab==='accounts') return …;` gevolgd door de gewone weergave erfde «accounts»).
// Nu leest de generator de syntaxisboom en rekent per plek uit welke tabbladen daar nog mogelijk zijn; precies één = de hint.
// Deze test houdt vast:
//   1. lange if/else-if-keten: het tabblad blijft, ook na duizenden tekens;
//   2. code na `if (tab==='x') return …` hoort NIET bij x; `else` hoort niet bij x;
//   3. `x ? A : B` (alleen A), `x && A`, `switch (tab) { case 'x': … }`; `!==`, `!(…)` en `a || b` (twee tabbladen) geven geen hint;
//   4. eigen component / hulpfunctie / JSX-variabele: het tabblad van de plek waar die gebruikt wordt, alleen als alle plekken het eens zijn;
//   5. onbekende tabbladen tellen niet; zelfverwijzing loopt niet vast;
//   7. wat overblijft: na `if (tab !== 'x') return`, aan het eind van een else-if-keten met een const-voorwaarde, in `const x = c ? <…/> : null`;
//   6. de echte catalogus: «Підтвердити видалення» → identity/account, «Зберегти меню» → identity/menu, «Перейменувати» (сховище) → api/vault,
//      lokale mail → mail/local, GitHub-zoeken → research.
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
    `export function H({tab}){const kaarten={Waarde};return <div>{tab==='activity'&&<Kaart/>}{tab==='activity'&&<Twee/>}{tab==='projects'&&<Twee/>}` +
    `{tab==='projects'&&<Waarde/>}{tab==='account'&&rij()}{tab==='accounts'?blok:null}{tab==='overview'&&<Zelf/>}</div>;}`;
  check('4a component alleen onder activity gebruikt → kop en knop erin → activity', hint(comp, 'Оновити стрічку') === 'activity' && hint(comp, 'Активність сервісу', 'sectie') === 'activity');
  check('4b component onder twee verschillende tabbladen → geen', hint(comp, 'Двічі вжито') === '');
  check('4c component ook als waarde doorgegeven ({ Waarde }) → niet te volgen → geen', hint(comp, 'Як значення') === '');
  check('4d hulpfunctie rij() onder account aangeroepen → account', hint(comp, 'Рядок функції') === 'account');
  check('4e JSX-variabele blok onder accounts gebruikt → accounts', hint(comp, 'Блок змінної') === 'accounts');
  check('4f zelfverwijzende component loopt niet vast; eigen tag (zonder tabblad) en gebruik onder overview zijn het niet eens → geen', hint(comp, 'Сам себе') === '', hint(comp, 'Сам себе'));

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

  // 6. de echte catalogus
  const echt = (uk: string) => UI_ELEMENTEN.filter((e) => e.uk === uk).map((e) => `${e.dienst}/${e.tab}`);
  const in_ = (uk: string, bestand: string) => UI_ELEMENTEN.filter((e) => e.uk === uk && e.bestand === bestand).map((e) => `${e.dienst}/${e.tab}`);
  check('6e mail: «Звичайна пошта» en «Відкласти без провини» (lokale mail) → mail/local; «Поштові акаунти» → mail/accounts',
    JSON.stringify(in_('Звичайна пошта', 'src/MailFunctioneelWeergave.tsx')) === '["mail/local"]' && in_('Відкласти без провини', 'src/MailFunctioneelWeergave.tsx').includes('mail/local') && in_('Поштові акаунти', 'src/MailFunctioneelWeergave.tsx').includes('mail/accounts'));
  check('6f GitHub: «Шукати» → research, «Проєкти GitHub» → projects, «Повторити» (na de accounts-return) niet op accounts',
    in_('Шукати', 'src/GitHubWeergave.tsx').includes('github/research') && in_('Проєкти GitHub', 'src/GitHubWeergave.tsx').includes('github/projects') && !in_('Повторити', 'src/GitHubWeergave.tsx').includes('github/accounts'));
  check('6a «Підтвердити видалення» (Instellingen) → identity/account, niet personalization', JSON.stringify(echt('Підтвердити видалення')) === '["identity/account"]', echt('Підтвердити видалення').join(','));
  check('6b «Видалити поточний акаунт» (kop) → identity/account', UI_ELEMENTEN.some((e) => e.soort === 'sectie' && e.uk === 'Видалити поточний акаунт' && e.tab === 'account'));
  check('6c «Зберегти меню» → identity/menu; «Додати свій сервіс» → identity/widgets', echt('Зберегти меню').includes('identity/menu') && echt('Додати свій сервіс').includes('identity/widgets'));
  check('6d «Перейменувати» van de sleutelkluis (API-platform) → api/vault', UI_ELEMENTEN.some((e) => e.uk === 'Перейменувати' && e.bestand === 'src/ApiPlatformWeergave.tsx' && e.dienst === 'api' && e.tab === 'vault'));
  return einde();
}
