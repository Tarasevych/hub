// IDENTITEIT-015 (крок «vormgeving»): справжні налаштування вигляду всього сайту, що раніше були лише демо-елементами «Макета».
//  • PersoonlijkeWeergave — «Персоналізація»: щільність інтерфейсу (компактна / звичайна / простора) і менше руху;
//  • AccentEnEffecten — «Теми»: акцентний колір поверх палітри та виразність декоративних ефектів.
// Усе зберігається в обліковому записі (той самий шлях, що й тема: shared/uiterlijk.ts → POST /api/owner/ui/weergave/save) і діє
// на всіх сервісах та пристроях після входу. Кожна підказка каже, що саме зміниться.
// Echte weergave-instellingen van de hele site (dichtheid, beweging, accent, effecten), bewaard in het account.
import { Layers, Rows3, Rows4, StretchHorizontal, Waves } from 'lucide-react';
import type { ReactNode } from 'react';
import { UITERLIJK_EFFECTEN_STANDAARD, UITERLIJK_TRANSPARANTIE_STANDAARD_AAN, type UiterlijkDichtheid } from '../../shared/uiterlijk';
import { useThemaStand, zetWeergaveStijl } from './useThema';
import { ACCENT_NAMEN, ACCENT_TONEN, accentKeuzesMet } from './weergave-stijl';
import './thema-instellingen.css';

type Tr = (uk: string, nl: string) => string;


/** «Персоналізація»: щільність і рух. Ідентифікатори секцій — цілі переходу з карток «Макета» (data-kaart-ga). */
export function PersoonlijkeWeergave({ tr }: { tr: Tr }) {
  const { stijl } = useThemaStand();
  const dichtheid: UiterlijkDichtheid = stijl.dichtheid || 'normaal';
  const minder = stijl.beweging === 'minder';
  const keuzes: Array<[UiterlijkDichtheid, string, string, ReactNode]> = [
    ['compact', tr('Компактна', 'Compact'), tr('Менші відступи — більше вміщається на екрані. Текст і кнопки того самого розміру.', 'Kleinere witruimte — meer past op het scherm. Tekst en knoppen blijven even groot.'), <Rows4 key='i' aria-hidden />],
    ['normaal', tr('Звичайна', 'Normaal'), tr('Типові відступи сайту.', 'De standaard witruimte van de site.'), <Rows3 key='i' aria-hidden />],
    ['ruim', tr('Простора', 'Ruim'), tr('Більші відступи — спокійніше, але менше вміщається.', 'Grotere witruimte — rustiger, maar er past minder op het scherm.'), <StretchHorizontal key='i' aria-hidden />],
  ];
  return <div className='thema-instellingen' data-weergave-persoonlijk>
    <section id='weergave-dichtheid' aria-labelledby='weergave-dichtheid-kop'>
      <h3 id='weergave-dichtheid-kop'>{tr('Щільність інтерфейсу', 'Dichtheid van de interface')}</h3>
      <p className='thema-uitleg'>{tr('Діє на всіх сервісах сайту й зберігається в обліковому записі — на іншому пристрої після входу буде так само.', 'Geldt voor alle diensten van de site en wordt in het account bewaard — op een ander apparaat is het na aanmelden hetzelfde.')}</p>
      <div className='thema-modi' role='radiogroup' aria-labelledby='weergave-dichtheid-kop'>
        {keuzes.map(([id, naam, hint, ic]) => <button key={id} type='button' role='radio' aria-checked={dichtheid === id} className={dichtheid === id ? 'active' : ''} title={hint}
          onClick={() => zetWeergaveStijl({ dichtheid: id === 'normaal' ? undefined : id })} data-weergave-dichtheid={id}>{ic}<strong>{naam}</strong><small>{hint}</small></button>)}
      </div>
    </section>
    <section id='weergave-beweging' aria-labelledby='weergave-beweging-kop'>
      <h3 id='weergave-beweging-kop'>{tr('Делікатна поява блоків', 'Rustig verschijnen van blokken')}</h3>
      <p className='thema-uitleg'>{tr('Плавні появи й переходи під час прокручування. Якщо на пристрої ввімкнено «Зменшити рух», анімацій і так менше — цей вибір їх не повертає.', 'Zachte overgangen tijdens het scrollen. Staat «Beweging beperken» op het apparaat aan, dan is er sowieso minder beweging — deze keuze zet die niet terug.')}</p>
      <label className='thema-soort-schakel' title={tr('Вимкнення прибирає анімації й плавну прокрутку на всіх сервісах цього облікового запису; зміст не змінюється.', 'Uitzetten haalt animaties en zacht scrollen weg op alle diensten van dit account; de inhoud verandert niet.')}>
        <input type='checkbox' role='switch' checked={!minder} onChange={(e) => zetWeergaveStijl({ beweging: e.target.checked ? undefined : 'minder' })} data-weergave-beweging />
        <span><Waves aria-hidden /><strong>{minder ? tr('Вимкнено: менше руху на всьому сайті', 'Uit: minder beweging op de hele site') : tr('Увімкнено: плавна поява (як на пристрої)', 'Aan: zacht verschijnen (zoals het apparaat)')}</strong></span>
      </label>
    </section>
  </div>;
}

/** «Теми»: акцент поверх палітри й виразність ефектів. */
export function AccentEnEffecten({ tr }: { tr: Tr }) {
  const { stijl } = useThemaStand();
  const effecten = typeof stijl.effecten === 'number' ? stijl.effecten : UITERLIJK_EFFECTEN_STANDAARD;
  const transparantie = typeof stijl.transparantie === 'number' ? stijl.transparantie : 0;
  return <>
    <section id='thema-accent' aria-labelledby='thema-accent-kop'>
      <h3 id='thema-accent-kop'>{tr('Акцентна палітра', 'Accentkleur')}</h3>
      <p className='thema-uitleg'>{tr('Улюблений відтінок діє поверх будь-якої палітри: кнопки, посилання, активні пункти меню й якорі, перемикачі, рамка фокусу й «Живий фон» (у режимі «Як тема»). Фон і текст палітри не змінюються, контраст тексту лишається достатнім у світлій і темній темі. Той самий вибір — у меню облікового запису.', 'De voorkeurstint werkt bovenop elk palet: knoppen, links, actieve menu-items en ankers, schakelaars, de focusrand en de levende achtergrond (stand «Zoals het thema»). Achtergrond en tekst van het palet blijven; het tekstcontrast blijft voldoende in licht en donker. Dezelfde keuze staat in het accountmenu.')}</p>
      <div className='thema-accenten' role='radiogroup' aria-labelledby='thema-accent-kop'>
        <button type='button' role='radio' aria-checked={!stijl.accent} className={!stijl.accent ? 'active' : ''} onClick={() => zetWeergaveStijl({ accent: undefined })} data-thema-accent=''
          title={tr('Акцент визначає палітра (у «Кольоровій» — колір розділу).', 'Het palet bepaalt het accent (bij «Kleurrijk» de kleur van het onderdeel).')}>
          <i style={{ background: 'var(--accent)' }} aria-hidden /><span>{tr('Як у палітрі', 'Zoals het palet')}</span>
        </button>
        {accentKeuzesMet(stijl.accent).map((id) => <button key={id} type='button' role='radio' aria-checked={stijl.accent === id} className={stijl.accent === id ? 'active' : ''} onClick={() => zetWeergaveStijl({ accent: id })} data-thema-accent={id}
          title={tr(`Кнопки, виділення й перемикачі на всіх сервісах стануть кольору «${ACCENT_NAMEN[id].uk}»; палітра поверхонь не зміниться.`, `Knoppen, selecties en schakelaars op alle diensten worden «${ACCENT_NAMEN[id].nl}»; de kleuren van de vlakken blijven.`)}>
          <i style={{ background: `linear-gradient(135deg, ${ACCENT_TONEN[id].licht.accent} 50%, ${ACCENT_TONEN[id].donker.accent} 50%)` }} aria-hidden /><span>{tr(ACCENT_NAMEN[id].uk, ACCENT_NAMEN[id].nl)}</span>
        </button>)}
      </div>
    </section>
    <section id='thema-transparantie' aria-labelledby='thema-transparantie-kop'>
      <h3 id='thema-transparantie-kop'>{tr('Прозорість блоків', 'Doorschijnende blokken')}</h3>
      <p className='thema-uitleg'>{tr('Блоки й картки стають напівпрозорими, і крізь них видно тло сторінки — найкраще з «Живим фоном». Меню, вікна й поля введення лишаються суцільними. Навіть на максимумі підкладка щільна щонайменше на 30 %, щоб текст читався. Якщо на пристрої ввімкнено «Зменшити прозорість», блоки лишаються суцільними.', 'Blokken en kaarten worden half doorschijnend en de achtergrond van de pagina schemert erdoor — het mooist met de levende achtergrond. Menu\'s, vensters en invoervelden blijven dicht. Ook op het maximum blijft de ondergrond minstens voor 30 % dicht, zodat tekst leesbaar blijft. Staat «Transparantie verminderen» op het apparaat aan, dan blijven de blokken dicht.')}</p>
      <label className='thema-soort-schakel' title={tr('Вмикає прозорий режим на всіх сервісах цього облікового запису; зберігається в обліковому записі.', 'Zet doorschijnende blokken aan op alle diensten van dit account; wordt in het account bewaard.')}>
        <input type='checkbox' role='switch' checked={transparantie > 0} onChange={(e) => zetWeergaveStijl({ transparantie: e.target.checked ? UITERLIJK_TRANSPARANTIE_STANDAARD_AAN : undefined })} data-thema-transparantie-aan />
        <span><Layers aria-hidden /><strong>{transparantie > 0 ? tr('Увімкнено: блоки напівпрозорі', 'Aan: blokken half doorschijnend') : tr('Вимкнено: суцільні блоки', 'Uit: dichte blokken')}</strong></span>
      </label>
      {transparantie > 0 ? <label className='thema-veld thema-effecten'>
        <input type='range' min={5} max={100} step={5} value={transparantie} aria-labelledby='thema-transparantie-kop' aria-valuetext={`${transparantie}%`} data-thema-transparantie
          title={tr('Ліворуч — ледь помітно, праворуч — виразно.', 'Links — nauwelijks, rechts — duidelijk.')}
          onChange={(e) => zetWeergaveStijl({ transparantie: Number(e.target.value) })} />
        <output aria-hidden='true'>{transparantie}%</output>
      </label> : null}
    </section>
    <section id='thema-effecten' aria-labelledby='thema-effecten-kop'>
      <h3 id='thema-effecten-kop'>{tr('Виразність декоративних ефектів', 'Sterkte van decoratieve effecten')}</h3>
      <p className='thema-uitleg'>{tr('Сяйво ілюстрацій центру облікового запису: 0 % — без сяйва, 45 % — як задумано, 100 % — насиченіше. На текст і кнопки не впливає.', 'De gloed van de illustraties in het accountcentrum: 0 % — geen gloed, 45 % — zoals bedoeld, 100 % — voller. Tekst en knoppen veranderen niet.')}</p>
      <label className='thema-veld thema-effecten'>
        <input type='range' min={0} max={100} step={5} value={effecten} aria-labelledby='thema-effecten-kop' aria-valuetext={`${effecten}%`} data-thema-effecten
          onChange={(e) => zetWeergaveStijl({ effecten: Number(e.target.value) === UITERLIJK_EFFECTEN_STANDAARD ? undefined : Number(e.target.value) })} />
        <output aria-hidden='true'>{effecten}%</output>
      </label>
    </section>
  </>;
}
