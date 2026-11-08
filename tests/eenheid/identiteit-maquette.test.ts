// IDENTITEIT-007: вигляд «Макет» — дизайн власника як оболонка, справжні панелі сайту в картках, вибір за прапорцем.
// De weergave «Ontwerp»: het ontwerp van de eigenaar als omlijsting, de echte onderdelen van de site in de kaarten, keuze via een vlag.
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
  check('джерела макета власника збережено (html, стилі, шість скриптів)', ['index.html', 'styles.css', 'app.js', 'drawer.js', 'locales.js', 'піктограми.js', 'реєстр.js', 'фото-профілю.js'].every((n) => existsSync(bron + n)));
  check('генератори збірки макета присутні', ['bouw.mjs', 'stijlen.mjs', 'motor.mjs', 'motor-aanpassingen.mjs', 'sjabloon.mjs'].every((n) => existsSync('scripts/identiteit-maquette/' + n)));
  check('згенеровані файли позначено як згенеровані', stijlen.includes('ЗГЕНЕРОВАНО') && sjabloon.includes('ЗГЕНЕРОВАНО') && motor.includes('// @ts-nocheck'));

  // Двигун прив'язаний до кореня компонента, а не до документа.
  check('двигун не чіпає document.body і не шукає в document', !motor.includes('document.body') && !motor.includes('document.getElementById(') && !motor.includes('document.querySelector'));
  check('усі слухачі вікна/документа реєструються через luister і знімаються в stop()', !/\n\s*(window|doc)\.addEventListener\(/.test(motor) && motor.includes('stop() { for (const weg of luisteraars) weg(); }'));
  check('пороги ширини макета стали класами кореня за шириною робочої області', drempels.includes(730) && drempels.includes(1040) && motor.includes('root.classList.toggle("bp-max-"+n,b<=n)') && !/@media\s*\((max|min)-width/.test(stijlen));
  check('мова й тема беруться із сайту, не з макета', motor.includes('preferences.lang=opties.lang;') && motor.includes('preferences.theme=opties.licht?"light":"dark";'));
  check('перехід до розділу повідомляє застосунок, який змінює адресу', motor.includes('opties.bijKies(id)') && component.includes('onKiesRef.current(s)'));
  check('Ctrl+K усередині вигляду перехоплюється раніше за глобальний пошук сайту', motor.includes('e.stopImmediatePropagation();searchOverlay.hidden?openSearch():closeSearch();') && /luister\(window,"keydown",[\s\S]*?\},true\);/.test(motor));

  // Справжні панелі замість демонстраційних елементів.
  check('демонстраційні елементи замінено гніздами справжніх панелей', motor.includes('<div class="mq-echt" data-echt="\'+s.id+\'"></div>') && motor.includes('<div class="mq-echt" data-echt="\'+id+\'"></div>') && !motor.includes('drawerControl(control,i,s.id)'));
  check('шість розділів показують справжню панель одразу, решта — після «Відкрити налаштування»', motor.includes('directSettingsSections=new Set(["personalization","menu","themes","languages","widgets","identities"])') && motor.includes('opties.bijOpenen(id)'));
  check('компонент монтує панелі порталами в гнізда й перезбирає їх після перемальовування', component.includes('createPortal(') && component.includes("querySelectorAll<HTMLElement>('.mq-echt[data-echt]')") && motor.includes('opties.bijRender();'));
  check('усі дванадцять розділів сайту знаходять свою картку (identities ↔ identity)', component.includes("id === 'identities' ? 'identity' : id") && IDENTITEIT_TABS.every((t) => motor.includes(`id:"${t.id === 'identity' ? 'identities' : t.id}"`)));
  check('вибору файла світлини в макеті немає: світлина й ім’я — з облікового запису', !sjabloon.includes('profilePhotoFile') && weergave.includes('gebruiker={{naam:p.user.name,foto:p.user.picture}}') && component.includes('zetProfiel('));
  check('тема сайту відстежується, поки вигляд відкритий', component.includes("attributeFilter: ['class']") && component.includes('m.zetLicht(helder())'));
  check('збій двигуна макета повертає класичну сторінку, а не порожній екран', pagina.includes('class MaquetteGrens extends Component') && pagina.includes('<MaquetteGrens terugval={klassiek}>'));

  // Стилі в просторі імен сайту.
  check('усі правила макета живуть під .mr-mq і не торкаються решти сайту', !/^(body|html|\*|button|a|svg|input)\b/m.test(stijlen) && (stijlen.match(/\.mr-mq\.mr-mq\.mr-mq\.mr-mq/g) || []).length > 1500);
  check('глобальні правила макета для svg/button/input не діють усередині справжніх панелей', stijlen.includes('svg:not(.mq-echt *)') && stijlen.includes('button:not(.mq-echt *)'));
  check('зсуви закріплених елементів через виміряні змінні, не через сталі макета', stijlen.includes('var(--mq-boven)') && stijlen.includes('var(--mq-links)') && !/\.anchor-rail\{[^}]*top:96px/.test(stijlen));
  check('верхня планка лишається липкою в робочій області (top:0, зсув дає відступ контейнера)', /\.topbar\{height:77px;position:sticky;top:0;/.test(stijlen));
  check('анімації кнопок повернуто попри глобальне вимкнення оболонки', (stijlen.match(/transition[^;]*!important/g) || []).length > 50);
  check('мобільний шар оболонки — наприкінці файла', omlijsting.lastIndexOf('@media(max-width:730px)') > omlijsting.lastIndexOf('.mq-kiezer button.is-actief'));
  const vast = ['.anchor-rail', '.popover-panel', '.search-overlay', '.toast', '.anchor-tooltip', '.horizontal-nav-popup', '.scroll-progress'];
  check('закріплені елементи макета зареєстровано з причинами', vast.every((v) => registratie.toegestaan.some((t) => t.sleutel.startsWith(map) && t.sleutel.includes(v) && t.reden.length > 30)));

  // Вибір вигляду за прапорцем.
  check('прапорець identiteit-account-maquette має пояснення обома мовами', Boolean(VLAG_UITLEG['identiteit-account-maquette']) && VLAG_UITLEG['identiteit-account-maquette'].gevolg.every((t) => t.length > 40));
  check('без прапорця «Макет» зникає з вибору, типовим стає перший доступний вигляд', vormgeving.includes("VORMGEVINGEN.filter((v) => v !== 'maquette')") && vormgeving.includes("return beschikbaar[0] ?? 'studio';") && kiezer.includes('beschikbaar.map('));
  check('з прапорцем макет — перший і типовий, «Студія» та класичний лишаються', vormgeving.includes("['maquette', 'studio', 'klassiek']") && pagina.includes("vormgeving === 'maquette'") && pagina.includes("vormgeving === 'studio'"));
  check('перемикач вигляду є у вікні навігації та під підвалом макета', sjabloon.includes('data-echt=\\"vormgeving-venster\\"') && sjabloon.includes('data-echt=\\"vormgeving-voet\\"') && component.includes("id.startsWith('vormgeving')"));

  return einde();
}
