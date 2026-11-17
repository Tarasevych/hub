// WISSEL-001 (17.11.2026): перевірка обох усунених причин:
//   1. Перемикання на технічний простір у меню (оболонка Hub + VerenigdDienstApp, сховища tech та ruimtes, AccountMenuV3).
//   2. Чесне перемикання облікових записів у меню без тихого проковтування відмови, повернення `{ ok, fout, redirected }`
//      і показ повідомлення про помилку безпосередньо в меню (v3 та класичний вигляд).
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('menu-ruimte-wissel-20261117');

  const techOpslag = lees('src/tech/tech-opslag.ts');
  const ruimtesOpslag = lees('src/tech/ruimtes/ruimtes-opslag.ts');
  const hubAuth = lees('src/useCanoniekHubAuth.ts');
  const menuTsx = lees('src/CanoniekAccountMenu.tsx');
  const v3Tsx = lees('src/accountmenu-v3/AccountMenuV3.tsx');
  const v3Css = lees('src/accountmenu-v3/accountmenu-v3.css');
  const dienstApp = lees('src/VerenigdDienstApp.tsx');
  const hubApp = lees('src/App.tsx');

  // 1. Технічний простір: синхронізація сховищ, оболонка та закриття меню за потреби
  check(
    '1a. tech-opslag: слухач CANONICAL_AUTH_CHANGE не виходить завчасно за неактивного простору й оновлює технічний стан',
    !/window\.addEventListener\(CANONICAL_AUTH_CHANGE,\s*\(\)\s*=>\s*\{\s*if\s*\(!toestand\.activatie\)\s*return;/.test(techOpslag)
      && techOpslag.includes('const wasActief = Boolean(toestand.activatie);')
      && techOpslag.includes('if (wasActief && !toestand.activatie) meld({ t: \'uit\' });'),
  );

  check(
    '1b. ruimtes-opslag: чекає await techVernieuwen() в actie() та реагує на CANONICAL_AUTH_CHANGE',
    ruimtesOpslag.includes("import { CANONICAL_AUTH_CHANGE } from '../../canoniek-gebeurtenissen';")
      && ruimtesOpslag.includes('await techVernieuwen();')
      && ruimtesOpslag.includes('window.addEventListener(CANONICAL_AUTH_CHANGE, () => { void ruimtesVernieuwen(); });'),
  );

  check(
    '1c. VerenigdDienstApp: оболонка визначає технічний простір незалежно від того, чи сторінка є адміністративною',
    dienstApp.includes("const techRuimte=techRuimteBijLaden(tech,weergaveRuimteNu(),state!=='authorized'&&state!=='checking');")
      && dienstApp.includes("oppervlak={techRuimte?'technisch':'account'}")
      && dienstApp.includes("menuVoorOppervlak(menuPreferences,techRuimte?'technisch':'account')"),
  );

  check(
    '1d. App.tsx (Hub): відстежує tech і techRuimte, передає oppervlak і технічне меню в CanonicalChrome',
    hubApp.includes("import {techRuimteBijLaden, techVernieuwen, useTech} from './tech/tech-opslag';")
      && hubApp.includes("const techRuimte=techRuimteBijLaden(tech,weergaveRuimteNu(),state!=='authorized'&&state!=='checking');")
      && hubApp.includes("oppervlak={techRuimte?'technisch':'account'}")
      && hubApp.includes("menuVoorOppervlak(menuPreferences,techRuimte?'technisch':'account')"),
  );

  check(
    '1e. AccountMenuV3: під час переходу в технічний простір показує текст відмови, закриває меню перед вікном підтвердження й блокує повторне натискання',
    v3Tsx.includes('if (naar === \'technisch\' && ruimtes.status.technischToegestaan && !ruimtes.status.sessie)')
      && v3Tsx.includes('sluitVoorNavigatie();')
      && v3Tsx.includes('const uit = await kiesRuimte(naar, lang);')
      && v3Tsx.includes('if (uit?.tekst) setRuimteMelding(uit.tekst);')
      && v3Tsx.includes("disabled={ruimtes.bezig === 'wisselen'}"),
  );

  // 2. Перемикання облікових записів у меню: чесні результати, закриття перед переадресацією, показ помилок
  check(
    '2a. useCanoniekHubAuth: повертає ConnectResult { ok, foutUk, foutNl } у connect()',
    hubAuth.includes('export type ConnectResult={ok:boolean;foutUk?:string;foutNl?:string};')
      && hubAuth.includes('const connect=async(intent:Intent=\'replace-tab\',hintGrantId?:string):Promise<ConnectResult>=>'),
  );

  check(
    '2b. VerenigdDienstApp і App.tsx: передають closeRequest у CanonicalAccountMenu та повертають помилки/переадресацію із selectKnownAccount',
    dienstApp.includes('closeRequest={accountCloseRequest}')
      && dienstApp.includes("return{ok:false as const,redirected:true}")
      && dienstApp.includes("void loadAccountMenuSnapshot().catch(()=>undefined)")
      && dienstApp.includes('return{techBeeindigd:Number(response.data?.techBeeindigd||0)}')
      && hubApp.includes('closeRequest={accountCloseRequest}')
      && hubApp.includes('onChooserClose:()=>{setAccountCloseRequest(v=>v+1)}')
      && hubApp.includes("return{ok:false as const,redirected:true}")
      && hubApp.includes("void loadAccountMenuSnapshot().catch(()=>undefined)")
      && hubApp.includes('return{techBeeindigd:Number(response.data?.techBeeindigd||0)}'),
  );

  check(
    '2c. CanoniekAccountMenu: зберігає контракт повернення, закривається при closeRequest або redirected, показує помилку wisselFout в обох інтерфейсах',
    menuTsx.includes('export type AccountSelectResult =')
      && menuTsx.includes('closeRequest?: number;')
      && /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(open\)\s*void load\(\);\s*\},\s*\[open,\s*user\?\.id\]\)/.test(menuTsx)
      && /useEffect\(\(\)\s*=>\s*\{\s*if\s*\(closeRequest\s*>\s*0\)\s*close\(\);\s*\},\s*\[closeRequest\]\)/.test(menuTsx)
      && menuTsx.includes('const uit = await onSelectAccount(item.grantId);')
      && menuTsx.includes('if (res.redirected) { sluitMetLade(); return; }')
      && menuTsx.includes('if (res && res.ok === false) {')
      && menuTsx.includes('wisselFout={wisselFout}')
      && (menuTsx.match(/data-account-wissel-fout='true'/g) || []).length >= 2
      && v3Tsx.includes("data-account-wissel-fout='true'")
      && v3Css.includes('[data-account-menu-v3] .am3-wissel-fout'),
  );

  return einde();
}
