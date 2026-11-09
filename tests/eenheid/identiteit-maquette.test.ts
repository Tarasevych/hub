// IDENTITEIT-007: вигляд «Макет» — дизайн власника один в один (власна шапка, смуга сервісів, герой, елементи макета в картках),
// справжні панелі сайту в згортаному блоці «Чинні налаштування», оболонка сайту схована, вибір за прапорцем.
// De weergave «Ontwerp»: het ontwerp van de eigenaar één op één, de echte onderdelen van de site in een inklapbaar blok, keuze via een vlag.
import { readFileSync, existsSync } from 'node:fs';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { IDENTITEIT_TABS } from '../../src/identiteit/identiteit-tabs';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-maquette');
  const map = 'src/identiteit/maquette/';
  const bron = 'docs/ontwerp/identiteit-account/maquette-bron/';
  const component = readFileSync(map + 'IdentiteitMaquette.tsx', 'utf8');
  const motor = readFileSync(map + 'maquette-motor.ts', 'utf8');
  const sjabloon = readFileSync(map + 'maquette-sjabloon.ts', 'utf8');
  const stijlen = readFileSync(map + 'maquette-stijlen.css', 'utf8');
  const omlijsting = readFileSync(map + 'maquette-omlijsting.css', 'utf8');
  const drempels = JSON.parse(readFileSync(map + 'maquette-stijlen-drempels.json', 'utf8')) as number[];
  const pagina = readFileSync('src/identiteit/IdentiteitAccountPagina.tsx', 'utf8');
  const vormgeving = readFileSync('src/identiteit/identiteit-vormgeving.ts', 'utf8');
  const kiezer = readFileSync('src/identiteit/VormgevingKiezer.tsx', 'utf8');
  const weergave = readFileSync('src/InstellingencentrumWeergave.tsx', 'utf8');
  const registratie = JSON.parse(readFileSync('scripts/plaatsing-vaste-elementen.json', 'utf8')) as { toegestaan: { sleutel: string; reden: string }[] };

  // Джерела макета й генератори в репозиторії: згенеровані файли можна відтворити.
  const app = readFileSync('src/VerenigdDienstApp.tsx', 'utf8');
  check('джерела макета власника збережено (html, стилі, шість скриптів)', ['index.html', 'styles.css', 'app.js', 'drawer.js', 'locales.js', 'піктограми.js', 'реєстр.js', 'фото-профілю.js'].every((n) => existsSync(bron + n)));
  check('генератори збірки макета присутні', ['bouw.mjs', 'stijlen.mjs', 'motor.mjs', 'motor-aanpassingen.mjs', 'sjabloon.mjs'].every((n) => existsSync('scripts/identiteit-maquette/' + n)));
  check('згенеровані файли позначено як згенеровані', stijlen.includes('ЗГЕНЕРОВАНО') && sjabloon.includes('ЗГЕНЕРОВАНО') && motor.includes('// @ts-nocheck'));

  // Двигун прив'язаний до кореня компонента, а не до документа.
  check('двигун не чіпає document.body і не шукає в document', !motor.includes('document.body') && !motor.includes('document.getElementById(') && !motor.includes('document.querySelector'));
  check('усі слухачі вікна/документа реєструються через luister і знімаються в stop()', !/\n\s*(window|doc)\.addEventListener\(/.test(motor) && motor.includes('stop() { for (const weg of luisteraars) weg(); }'));
  check('пороги ширини макета стали класами кореня за шириною робочої області, без зайвої специфічності (:where)', drempels.includes(730) && drempels.includes(1040) && motor.includes('root.classList.toggle("bp-max-"+n,b<=n)') && !/@media\s*\((max|min)-width/.test(stijlen) && stijlen.includes(':where(.bp-max-730)') && !/\.mr-mq\.bp-(max|min)-\d+/.test(stijlen));
  check('правило flat-content сайту (радіуси, тіні) не торкається елементів макета; герой — без відступів index.css', readFileSync('src/canoniek-omlijsting.css', 'utf8').includes(':not(.auth-card):not(.mr-mq *){border-inline:0;border-radius:0;box-shadow:none}') && omlijsting.includes(":where(.hero):where(:not(.mq-echt *)){display:revert;margin:revert;padding:revert") && (omlijsting.match(/:where\([^)]*\):where\(:not\(\.mq-echt \*\)\)\{[^}]*revert/g) || []).length > 15);
  check('мова й тема беруться із сайту, не з макета', motor.includes('preferences.lang=opties.lang;') && motor.includes('preferences.theme=opties.licht?"light":"dark";'));
  check('перехід до розділу повідомляє застосунок, який змінює адресу', motor.includes('opties.bijKies(id)') && component.includes('onKiesRef.current(s)'));
  check('Ctrl+K усередині вигляду перехоплюється раніше за глобальний пошук сайту', motor.includes('e.stopImmediatePropagation();searchOverlay.hidden?openSearch():closeSearch();') && /luister\(window,"keydown",[\s\S]*?\},true\);/.test(motor));

  // Елементи макета один в один; справжні панелі — у згортаному блоці «Чинні налаштування» під ними.
  check('перемикачі, вибори й зразки макета лишаються в картках і панелях (drawerControl, drawerPreview)', motor.includes('drawerControl(control,i,s.id)') && motor.includes('drawerControl(control,i,id)') && motor.includes('drawerPreview(s)') && !motor.includes("'<div class=\"inline-settings-controls\"><div class=\"mq-echt\""));
  check('блок «Чинні налаштування» обома мовами з гніздом справжньої панелі — у картках без панелі й у вкладених панелях', motor.includes('"Huidige instellingen":"Чинні налаштування"') && motor.includes('class="future-section mq-echt-blok" data-echt-blok="\'+id+\'"') && motor.includes('tekenЧинні(s.id)+tekenМайбутніМожливості(s.id)') && motor.includes("tekenЧинні(id)+tekenМайбутніМожливості(id)"));
  check('відкриті блоки пам’ятаються між перемальовуваннями, відкриття монтує панель', motor.includes('const openeЧинні=new Set()') && motor.includes('luister(root,"toggle"') && motor.includes('if(blok.open){openeЧинні.add(id);opties.bijOpenen(id);}'));
  check('шість розділів мають елементи одразу, решта — після «Відкрити налаштування»; перехід ззовні розгортає і панель, і блок', motor.includes('directSettingsSections=new Set(["personalization","menu","themes","languages","widgets","identities"])') && motor.includes('function gaNaar(id,open){') && motor.includes('if(blok&&!blok.open)blok.open=true;'));

  // Оболонка макета один в один: власна шапка, смуга сервісів, герой зверху; хром сайту схований.
  check('смуга сервісів і знак «Мій простір» є в розмітці, кнопки прив’язані до сервісів сайту', sjabloon.includes('class=\\"app-rail\\"') && ['identity', 'hub', 'ai', 'mail', 'cloud', 'github'].every((d) => sjabloon.includes(`data-dienst=\\"${d}\\"`)) && sjabloon.includes('class=\\"brand-mark\\" data-jump=\\"intro\\"') && !sjabloon.includes('href=\\"#intro\\"'));
  check('смуга сервісів веде на справжні сервіси через застосунок, а не показує підказку макета', motor.includes('opties.bijDienst(el.dataset.dienst)') && !motor.includes('showToast(ui().navDemoToast)') && component.includes("new CustomEvent(GA_NAAR_DIENST, { detail: id })") && app.includes('window.addEventListener(GA_NAAR_DIENST,h)') && app.includes('navigateMenuRef.current(id as MenuItemId)'));
  check('стилі смуги сервісів і .main-content збережено, зсув 74px став виміряною змінною', stijlen.includes('.app-rail{width:74px;height:100dvh;position:fixed') && stijlen.includes('.main-content{margin-left:var(--mq-links)') && stijlen.includes(':where(.bp-max-730) .app-rail{display:none}'));
  check('ширина смуги сервісів вимірюється двигуном (на телефоні 0)', motor.includes('getComputedStyle(rail).display!=="none"?rail.offsetWidth:0') && motor.includes('const links=maat("paddingLeft")+railBreed'));
  check('хром сайту схований, поки вигляд відкритий; меню облікового запису й сповіщення лишаються видимими', component.includes("document.documentElement.dataset.identiteitMaquette = 'aan'") && omlijsting.includes("html[data-identiteit-maquette='aan'] .canonical-chrome :is(.canonical-sidebar,.canonical-sidebar-edge-zone,.canonical-scroll-top){display:none!important}") && omlijsting.includes('.canonical-topbar{visibility:hidden') && omlijsting.includes(':is(.canonical-account-panel,.canonical-notification-toast){visibility:visible'));
  check('відступ прокрутки макета (html{scroll-padding-top:110px}) перенесено на робочу область сайту', omlijsting.includes(".canonical-workspace{scroll-behavior:smooth;scroll-padding-top:110px}"));
  check('типовий розділ відкривається на герої без автопрокрутки; пряме посилання на інший розділ прокручує до нього', component.includes("const TYPISCH = 'personalization'") && component.includes("actief !== 'intro' && actief !== TYPISCH) m.ga(naarOntwerp(actief), true)"));
  check('аватар шапки відкриває діалог світлини макета; його кнопки ведуть до розділу «Акаунт» і меню облікового запису сайту', sjabloon.includes('data-open-profile-photo') && sjabloon.includes('data-echt-actie=\\"account-foto\\"') && sjabloon.includes('data-echt-actie=\\"account-menu\\"') && motor.includes('if(actie==="account-foto")gaNaar("account",true);else if(actie==="account-menu")opties.bijAccountMenu();') && component.includes("'.canonical-topbar .canonical-avatar-trigger'"));
  check('смуга сервісів зареєстрована як закріплений елемент', registratie.toegestaan.some((t) => t.sleutel === map + 'maquette-stijlen.css :: .mr-mq.mr-mq.mr-mq.mr-mq .app-rail' && t.reden.length > 30));
  check('компонент монтує панелі порталами в гнізда й перезбирає їх після перемальовування', component.includes('createPortal(') && component.includes("querySelectorAll<HTMLElement>('.mq-echt[data-echt]')") && motor.includes('opties.bijRender();'));
  check('усі дванадцять розділів сайту знаходять свою картку (identities ↔ identity)', component.includes("id === 'identities' ? 'identity' : id") && IDENTITEIT_TABS.every((t) => motor.includes(`id:"${t.id === 'identity' ? 'identities' : t.id}"`)));
  check('вибору файла світлини в макеті немає: світлина й ім’я — з облікового запису', !sjabloon.includes('profilePhotoFile') && weergave.includes('gebruiker={{naam:p.user.name,foto:p.user.picture}}') && component.includes('zetProfiel('));
  check('тема сайту відстежується, поки вигляд відкритий', component.includes("attributeFilter: ['class']") && component.includes('m.zetLicht(helder())'));
  check('збій двигуна макета повертає класичну сторінку, а не порожній екран', pagina.includes('class MaquetteGrens extends Component') && pagina.includes('<MaquetteGrens terugval={klassiek}>'));

  // Стилі в просторі імен сайту.
  check('правила всередині @container теж під .mr-mq (картка в один стовпчик у вузькому контейнері)', /@container \(max-width:710px\)\{\s*\.mr-mq\.mr-mq\.mr-mq\.mr-mq \.section-card\{display:flex/.test(stijlen) && !/@container[^{]*\{\s*\.(section-card|direct-settings)\{/.test(stijlen));
  check('усі правила макета живуть під .mr-mq і не торкаються решти сайту', !/^(body|html|\*|button|a|svg|input)\b/m.test(stijlen) && (stijlen.match(/\.mr-mq\.mr-mq\.mr-mq\.mr-mq/g) || []).length > 1500);
  check('глобальні правила макета для svg/button/input не діють усередині справжніх панелей', stijlen.includes('svg:where(:not(.mq-echt *))') && stijlen.includes('button:where(:not(.mq-echt *))') && !stijlen.includes('button:not(.mq-echt *)'));
  check('зсуви закріплених елементів через виміряні змінні, не через сталі макета', stijlen.includes('var(--mq-boven)') && stijlen.includes('var(--mq-links)') && !/\.anchor-rail\{[^}]*top:96px/.test(stijlen));
  check('верхня планка лишається липкою в робочій області (top:0, зсув дає відступ контейнера)', /\.topbar\{height:77px;position:sticky;top:0;/.test(stijlen));
  check('анімації кнопок повернуто попри глобальне вимкнення оболонки', (stijlen.match(/transition[^;]*!important/g) || []).length > 50);
  check('мобільний шар оболонки — наприкінці файла', omlijsting.lastIndexOf('@media(max-width:730px)') > omlijsting.lastIndexOf('.mq-kiezer button.is-actief'));
  const vast = ['.anchor-rail', '.popover-panel', '.search-overlay', '.toast', '.anchor-tooltip', '.horizontal-nav-popup', '.scroll-progress'];
  check('закріплені елементи макета зареєстровано з причинами', vast.every((v) => registratie.toegestaan.some((t) => t.sleutel.startsWith(map) && t.sleutel.includes(v) && t.reden.length > 30)));

  // Вибір вигляду за прапорцем.
  check('прапорець identiteit-account-maquette має пояснення обома мовами', Boolean(VLAG_UITLEG['identiteit-account-maquette']) && VLAG_UITLEG['identiteit-account-maquette'].gevolg.every((t) => t.length > 40));
  check('без прапорця «Макет» лишається в списку неактивним з поясненням, типовим стає перший доступний вигляд', vormgeving.includes("VORMGEVINGEN.filter((v) => v !== 'maquette')") && vormgeving.includes("return beschikbaar[0] ?? 'studio';") && kiezer.includes('VORMGEVINGEN.map(') && kiezer.includes('disabled={!kan}') && kiezer.includes("className='ia-vormgeving-hint'") && kiezer.includes('Перемикачі функцій'));
  check('з прапорцем макет — перший і типовий, «Студія» та класичний лишаються', vormgeving.includes("['maquette', 'studio', 'klassiek']") && pagina.includes("vormgeving === 'maquette'") && pagina.includes("vormgeving === 'studio'"));
  check('класичний вигляд: компактний перемикач у липкому меню, перемикач під розділами, зміна вигляду прокручує вгору',
    pagina.includes('<VormgevingKiezer lang={lang} compact />') && pagina.includes("<div className='ia-vormgeving-voet'><VormgevingKiezer lang={lang} /></div>") &&
    pagina.includes("werkruimte.scrollTo({ top: 0 })") && kiezer.includes("<details ref={details} className='ia-vormgeving-compact'>") &&
    kiezer.includes('details.current.open = false'));
  const migratie = readFileSync('migrations/0200_identiteit_account_maquette.sql', 'utf8');
  check('міграція створює перемикач identiteit-account-maquette вимкненим для всіх і не чіпає вибір власника',
    migratie.includes("'identiteit-account-maquette'") && /INSERT INTO app\.feature_flags \(sleutel, omschrijving, aan, standaard\)/.test(migratie) &&
    /false, false\)\s*ON CONFLICT \(sleutel\) DO NOTHING;/.test(migratie));
  check('перемикач вигляду є у вікні навігації та під підвалом макета', sjabloon.includes('data-echt=\\"vormgeving-venster\\"') && sjabloon.includes('data-echt=\\"vormgeving-voet\\"') && component.includes("id.startsWith('vormgeving')"));

  return einde();
}
