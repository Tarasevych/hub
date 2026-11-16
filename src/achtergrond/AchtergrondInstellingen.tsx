// ACHTERGROND-001: «Налаштування → Теми → Живий фон». Кожна зміна одразу видна на тлі цієї ж сторінки й зберігається в обліковому
// записі (окремо для звичайного й технічного профілю — як тема й палітра). Підказки пояснюють наслідки: батарея, читабельність, рух.
// Instellingen van de levende achtergrond: direct zichtbaar achter deze pagina, bewaard in het account (per ruimte).
import { AlertTriangle, ChevronDown, BatteryMedium, Blend, Gauge, Layers, MonitorSmartphone, Power, RotateCcw, Shapes, Sparkles, Waves, Wind } from 'lucide-react';
import type { ReactNode } from 'react';
import { ACHTERGROND_GRENZEN, achtergrondVolledig, normaliseerAchtergrond, type AchtergrondKader, type AchtergrondKleuren, type AchtergrondOvergang, type AchtergrondStand, type UiterlijkAchtergrond } from '../../shared/uiterlijk';
import { useThemaStand, zetAchtergrond } from '../thema/useThema';
import { TLO_VOORBEELD } from '../thema/VormgevingZone';
import './achtergrond-instellingen.css';

type Tr = (uk: string, nl: string) => string;


export default function AchtergrondInstellingen({ tr }: { tr: Tr }) {
  const { achtergrond } = useThemaStand();
  const a = achtergrondVolledig(achtergrond);
  const zet = (patch: Partial<UiterlijkAchtergrond>) => zetAchtergrond(normaliseerAchtergrond({ ...a, ...patch }));
  const uit = a.stand === 'uit';

  const standen: Array<[AchtergrondStand, string, string, string, ReactNode]> = [
    ['auto', tr('Авто', 'Automatisch'), tr('Повний на ПК, полегшений на телефоні й планшеті.', 'Volledig op de pc, licht op telefoon en tablet.'),
      tr('На телефоні й планшеті — до 4 плям і до 24 кадрів/с, щоб берегти батарею. Якщо пристрій не встигає малювати, фон сам стане легшим і про це буде запис у центрі сповіщень. «Зменшити рух» у системі — фон нерухомий.', 'Op telefoon en tablet hoogstens 4 vlekken en 24 beelden/s om de batterij te sparen. Haalt het apparaat het niet, dan wordt de achtergrond vanzelf lichter en staat dat in het meldingencentrum. Met «Beweging beperken» staat de achtergrond stil.'), <MonitorSmartphone key='i' aria-hidden />],
    ['aan', tr('Завжди повний', 'Altijd volledig'), tr('Усі плями й кадри на будь-якому пристрої.', 'Alle vlekken en beelden op elk apparaat.'),
      tr('Найвиразніше, але на телефоні витрачає помітно більше батареї й може гріти пристрій. «Зменшити рух» у системі все одно зупиняє рух.', 'Het meest uitgesproken, maar kost op een telefoon merkbaar meer batterij en kan het toestel warm maken. «Beweging beperken» stopt de beweging toch.'), <Sparkles key='i' aria-hidden />],
    ['uit', tr('Вимкнено', 'Uit'), tr('Звичайний нерухомий фон теми.', 'De gewone, stilstaande achtergrond van het thema.'),
      tr('Фон не малюється зовсім — нуль навантаження. Повертається статичне тло обраної палітри.', 'Er wordt niets getekend — geen belasting. Het stilstaande vlak van het gekozen palet komt terug.'), <Power key='i' aria-hidden />],
  ];
  const kleuren: Array<[AchtergrondKleuren, string, string]> = [
    // KLEUREN-001: назва каже, звідки береться колір; у сірих палітрах без акценту плями фіолетово-сині (сірий акцент не дає відтінку).
    ['thema', tr('За акцентом', 'Volgens het accent'), tr('Відтінки довкола акценту з блоку «Акцент» (або акценту палітри). У сірих палітрах без обраного акценту — спокійний фіолетово-синій.', 'Tinten rond het accent uit het blok «Accent» (of dat van het palet). Bij grijze paletten zonder gekozen accent een rustig violetblauw.')],
    ['aurora', tr('Полярне сяйво', 'Noorderlicht'), tr('Смарагд, бірюза й фіолет.', 'Smaragd, turkoois en violet.')],
    ['zee', tr('Море', 'Zee'), tr('Блакитні й сині відтінки, найспокійніше для очей.', 'Blauwe tinten, het rustigst voor de ogen.')],
    ['zonsondergang', tr('Захід сонця', 'Zonsondergang'), tr('Помаранч, корал, рожевий, бузок.', 'Oranje, koraal, roze, lila.')],
    ['regenboog', tr('Веселка', 'Regenboog'), tr('Плями повільно проходять увесь спектр.', 'De vlekken gaan langzaam door het hele spectrum.')],
  ];
  const overgangen: Array<[AchtergrondOvergang, string, string, ReactNode]> = [
    ['golf', tr('Хвилі', 'Golven'), tr('Плями пливуть плавними петлями — збалансовано.', 'Vlekken drijven in zachte lussen — evenwichtig.'), <Waves key='i' aria-hidden />],
    ['drift', tr('Дрейф', 'Drift'), tr('Довгий повільний перехід від краю до краю сторінки.', 'Lange, trage tocht van rand tot rand.'), <Wind key='i' aria-hidden />],
    ['adem', tr('Дихання', 'Ademen'), tr('Плями майже на місці, але повільно ростуть і стискаються.', 'Vlekken blijven bijna staan maar zwellen langzaam aan en af.'), <Blend key='i' aria-hidden />],
  ];
  const kaders: Array<[AchtergrondKader, string, string, boolean]> = [
    ['zuinig', tr('Ощадно · 15 к/с', 'Zuinig · 15 b/s'), tr('Найменше навантаження й батареї; повільний рух виглядає майже так само.', 'De minste belasting en batterij; trage beweging ziet er bijna hetzelfde uit.'), false],
    ['normaal', tr('Звичайно · 30 к/с', 'Normaal · 30 b/s'), tr('Плавно й ощадно — рекомендовано.', 'Vloeiend en zuinig — aanbevolen.'), false],
    ['vloeiend', tr('Плавно · 60 к/с', 'Vloeiend · 60 b/s'), tr('Удвічі більше кадрів: на ноутбуці й телефоні помітно швидше сідає батарея. На телефоні в стані «Авто» однаково не більше 24 к/с.', 'Twee keer zoveel beelden: op laptop en telefoon loopt de batterij merkbaar sneller leeg. Op een telefoon in «Automatisch» toch hoogstens 24 b/s.'), true],
  ];
  const schuif = (veld: keyof typeof ACHTERGROND_GRENZEN, naam: string, uitleg: string, tekst: (v: number) => string, icoon: ReactNode) => {
    const [min, max] = ACHTERGROND_GRENZEN[veld];
    return <label className='la-schuif' title={uitleg} data-achtergrond-veld={veld}>
      <span className='la-schuif-kop'>{icoon}<strong>{naam}</strong><output>{tekst(a[veld])}</output></span>
      <input type='range' min={min} max={max} step={1} value={a[veld]} disabled={uit} aria-valuetext={tekst(a[veld])} onChange={(e) => zet({ [veld]: Number(e.target.value) })} />
      <small>{uitleg}</small>
    </label>;
  };
  const tempoTekst = (v: number) => (v < 20 ? tr('ледь помітно', 'nauwelijks') : v < 45 ? tr('повільно', 'traag') : v < 70 ? tr('помірно', 'matig') : tr('жваво', 'levendig'));
  const wisselTekst = (v: number) => (v === 0 ? tr('без зміни', 'geen wissel') : v < 35 ? tr('повільно', 'traag') : v < 70 ? tr('помірно', 'matig') : tr('швидко', 'snel'));

  return <section id='thema-achtergrond' className='la-instellingen' aria-labelledby='thema-achtergrond-kop' data-achtergrond-instellingen>
    <h3 id='thema-achtergrond-kop'>{tr('Живий фон', 'Levende achtergrond')}</h3>
    <p className='thema-uitleg'>{tr('Великі розмиті плями різних форм повільно переливаються з відтінку у відтінок за всім вмістом сторінки. Зміни видно одразу на тлі цієї сторінки; зберігаються в обліковому записі окремо для звичайного й технічного профілю.', 'Grote, zachte vlekken in verschillende vormen vloeien langzaam van tint naar tint achter de hele pagina. Wijzigingen zie je meteen achter deze pagina; ze worden in het account bewaard, apart voor het gewone en het technische profiel.')}</p>

    <div className='thema-modi' role='radiogroup' aria-label={tr('Режим живого фону', 'Modus van de levende achtergrond')}>
      {standen.map(([id, naam, kort, lang, ic]) => <button key={id} type='button' role='radio' aria-checked={a.stand === id} className={a.stand === id ? 'active' : ''} title={lang} onClick={() => zet({ stand: id })} data-achtergrond-stand={id}>
        {ic}<strong>{naam}</strong><small>{kort}</small>
      </button>)}
    </div>

    <details className='la-blok' open>
      <summary><Gauge aria-hidden /><span>{tr('Рух і інтенсивність', 'Beweging en sterkte')}</span><ChevronDown className='la-pijl' aria-hidden /></summary>
      <div className='la-schuiven'>
        {schuif('tempo', tr('Плавність руху', 'Snelheid van de beweging'), tr('Ліворуч — плями ледь дрейфують, праворуч — помітно пливуть. На батарею майже не впливає: кадрів стільки ж.', 'Links drijven de vlekken nauwelijks, rechts bewegen ze duidelijk. Bijna geen invloed op de batterij: evenveel beelden.'), tempoTekst, <Wind aria-hidden />)}
        {schuif('sterkte', tr('Інтенсивність', 'Sterkte'), tr('Яскравість плям. Вище 75 % текст поза картками може читатися гірше, особливо у світлій темі.', 'Helderheid van de vlekken. Boven 75 % leest tekst buiten de kaarten minder goed, vooral in licht thema.'), (v) => `${v}%`, <Sparkles aria-hidden />)}
        {schuif('kleurwissel', tr('Перелив кольорів', 'Kleurverloop'), tr('Як швидко кожна пляма переходить з відтінку у відтінок. 0 — кольори сталі.', 'Hoe snel elke vlek van tint naar tint gaat. 0 — vaste kleuren.'), wisselTekst, <Blend aria-hidden />)}
      </div>
    </details>

    <details className='la-blok' open>
      <summary><Shapes aria-hidden /><span>{tr('Плями й форми', 'Vlekken en vormen')}</span><ChevronDown className='la-pijl' aria-hidden /></summary>
      <div className='la-schuiven'>
        {schuif('aantal', tr('Кількість плям', 'Aantal vlekken'), tr('Більше плям — багатша картина й трохи більше роботи для пристрою. На телефоні в «Авто» — не більше 4.', 'Meer vlekken — rijker beeld en iets meer werk voor het apparaat. Op een telefoon in «Automatisch» hoogstens 4.'), (v) => String(v), <Layers aria-hidden />)}
        {schuif('vervorming', tr('Непропорційність форм', 'Onregelmatigheid van vormen'), tr('0 — майже круглі плями; 100 — витягнуті, неправильні форми з бічними «хвилями».', '0 — bijna ronde vlekken; 100 — uitgerekte, grillige vormen met zijlobben.'), (v) => `${v}%`, <Shapes aria-hidden />)}
        {schuif('grootte', tr('Розмір плям', 'Grootte van de vlekken'), tr('Великі плями зливаються в м\'який градієнт на весь екран; малі — помітні окремі «острови».', 'Grote vlekken vloeien samen tot één zacht verloop; kleine blijven aparte «eilanden».'), (v) => `${v}%`, <Blend aria-hidden />)}
      </div>
      <div className='la-keuzes' role='radiogroup' aria-label={tr('Характер руху', 'Soort beweging')}>
        {overgangen.map(([id, naam, uitleg, ic]) => <button key={id} type='button' role='radio' aria-checked={a.overgang === id} className={a.overgang === id ? 'active' : ''} title={uitleg} disabled={uit} onClick={() => zet({ overgang: id })} data-achtergrond-overgang={id}>
          {ic}<span><strong>{naam}</strong><small>{uitleg}</small></span>
        </button>)}
      </div>
    </details>

    <details className='la-blok' open>
      <summary><Blend aria-hidden /><span>{tr('Відтінки фону', 'Tinten van de achtergrond')}</span><ChevronDown className='la-pijl' aria-hidden /></summary>
      <div className='la-kleuren' role='radiogroup' aria-label={tr('Відтінки плям живого фону', 'Tinten van de vlekken')}>
        {kleuren.map(([id, naam, uitleg]) => <button key={id} type='button' role='radio' aria-checked={a.kleuren === id} className={a.kleuren === id ? 'active' : ''} title={uitleg} disabled={uit} onClick={() => zet({ kleuren: id })} data-achtergrond-kleuren={id}>
          <i style={{ background: TLO_VOORBEELD[id] }} aria-hidden /><span><strong>{naam}</strong><small>{uitleg}</small></span>
        </button>)}
      </div>
    </details>

    <details className='la-blok'>
      <summary><BatteryMedium aria-hidden /><span>{tr('Кадри й батарея', 'Beelden en batterij')}</span><ChevronDown className='la-pijl' aria-hidden /></summary>
      <div className='la-keuzes' role='radiogroup' aria-label={tr('Частота кадрів', 'Beeldfrequentie')}>
        {kaders.map(([id, naam, uitleg, waarschuwing]) => <button key={id} type='button' role='radio' aria-checked={a.kader === id} className={a.kader === id ? 'active' : ''} title={uitleg} disabled={uit} onClick={() => zet({ kader: id })} data-achtergrond-kader={id}>
          {waarschuwing ? <AlertTriangle className='la-let-op' aria-label={tr('Увага: більше витрата батареї', 'Let op: meer batterijverbruik')} /> : <BatteryMedium aria-hidden />}<span><strong>{naam}</strong><small>{uitleg}</small></span>
        </button>)}
      </div>
      <p className='thema-uitleg'>{tr('Фон малюється в окремому потоці на маленькому полотні, яке браузер лише розтягує, тож прокрутка й кліки не гальмують. На прихованій вкладці фон стоїть і нічого не витрачає.', 'De achtergrond wordt in een aparte thread op een klein canvas getekend dat de browser alleen uitrekt, dus scrollen en klikken blijven vlot. In een verborgen tabblad staat hij stil en kost hij niets.')}</p>
    </details>

    <button type='button' className='thema-knop' onClick={() => zetAchtergrond(undefined)} title={tr('Повертає всі параметри живого фону до типових; тема й палітра не змінюються.', 'Zet alle instellingen van de levende achtergrond terug; thema en palet blijven.')} data-achtergrond-herstel>
      <RotateCcw aria-hidden />{tr('Типові значення', 'Standaardwaarden')}
    </button>
  </section>;
}
