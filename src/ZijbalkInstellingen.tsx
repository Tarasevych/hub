// Instellingen → Меню: «Стиль іконок» (Класичний / Кольоровий) en de modus van de bijbalk (auto / altijd open / altijd smal).
// Dezelfde winkel als de werkbalk boven in de zijbalk (zijbalk-voorkeuren.ts): wijzigingen zijn meteen overal zichtbaar.
import {useState,type ReactElement,type ReactNode} from 'react';
import {BevestigDialoog} from './platform/BevestigDialoog'; // IDENTITEIT-013
import {conceptAantal} from './concepten';
import {BellRing,ChevronDown,SlidersHorizontal,Eye,Gauge,Move,MousePointer2,Palette,PanelLeftClose,PanelLeftOpen,Zap} from 'lucide-react';
import type {SnelheidVoorkeuren} from '../shared/menu-snelheid';
import {CATEGORIE_TEKST,HERINNER_MINUTEN,MELDING_CATEGORIEEN,type MeldingVoorkeuren} from '../shared/menu-meldingen-voorkeuren';
import {DIENST_ACCENT,type IcoonStijl,type ZijbalkModus} from '../shared/menu-model';
import {MenuGlyph} from './menu-voorkeuren';
import {useZijbalkVoorkeuren,zetZijbalk} from './zijbalk-voorkeuren';
import MeldingVoorkeurenPaneel from './meldingen/MeldingVoorkeurenPaneel'; // IDENTITEIT-014: «Типи сповіщень» і тут, не лише в дзвонику
import {useTech} from './tech/tech-opslag';
import MenuIndelingInstellingen from './MenuIndelingInstellingen';
import SnelleToegangEditor from './SnelleToegangBewerker';
import type {AccountRechten} from './account-rechten';
import './zijbalk-blokken.css';

/** Uitklapblok (accordeon op de pagina id-host /menu): <details id> — onthouden en #anker-gedrag regelt src/platform/uitklap.ts voor de hele site. */
const Blok=({id,icoon,titel,uitleg,children}:{id:string;icoon:ReactElement;titel:string;uitleg:string;children:ReactNode})=><details id={id} className='zijbalk-blok' data-zijbalk-blok={id}><summary><span className='zijbalk-blok-icoon' aria-hidden='true'>{icoon}</span><span className='zijbalk-blok-tekst'><strong>{titel}</strong><small>{uitleg}</small></span><ChevronDown className='zijbalk-blok-pijl' aria-hidden='true'/></summary><div className='zijbalk-blok-inhoud'>{children}</div></details>;

type Tr=(uk:string,nl:string)=>string;
const VOORBEELD=[['hub','home'],['mail','mail'],['cloud','cloud'],['identity','settings']] as const;

export default function ZijbalkInstellingen({tr,zichtbaarheid,rechten}:{tr:Tr;zichtbaarheid?:ReactNode;rechten?:AccountRechten}){
  const v=useZijbalkVoorkeuren(),m=v.meldingen;
  const tech=useTech(); // технічні типи сповіщень — лише з технічним профілем (як у дзвонику)
  const sn=v.snelheid,zetS=(patch:Partial<SnelheidVoorkeuren>)=>zetZijbalk(cur=>({...cur,snelheid:{...cur.snelheid,...patch}}));
  // IDENTITEIT-013: вимкнення «Чернеток» одразу стирає всі збережені чернетки цього браузера — тому спершу підтвердження з їхньою кількістю.
  const lang=tr('uk','nl') as 'uk'|'nl';
  const[wisVraag,setWisVraag]=useState<{aantal:number}|null>(null);
  const vraagConceptenUit=async()=>{const n=await conceptAantal();if(n===0){zetS({concepten:false});return}setWisVraag({aantal:Math.max(0,n)})};
  const zetM=(patch:Partial<MeldingVoorkeuren>)=>zetZijbalk(cur=>({...cur,meldingen:{...cur.meldingen,...patch}}));
  const schakel=(id:string,aan:boolean,naam:string,uitleg:string,doe:(x:boolean)=>void,uit=false)=><label className={`zijbalk-schakel${uit?' uit':''}`} data-meld-schakel={id}><input type='checkbox' role='switch' checked={aan} disabled={uit} onChange={e=>doe(e.target.checked)}/><span className='zijbalk-schakel-spoor' aria-hidden='true'><i/></span><span><strong>{naam}</strong>{uitleg&&<small>{uitleg}</small>}</span></label>;
  const stijlen:Array<[IcoonStijl,string,string]>=[['klassiek',tr('Класичний','Klassiek'),tr('Спокійні монохромні іконки; колір розділу з’являється при наведенні та в активного пункту.','Rustige monochrome iconen; de kleur van het onderdeel verschijnt bij aanwijzen en bij het actieve item.')],['kleur',tr('Кольоровий','Kleurrijk'),tr('Кожен розділ завжди у своєму кольорі (пошта — синя, ШІ — фіолетовий, хмара — блакитна…); підпункти — світлішим відтінком того ж кольору.','Elk onderdeel altijd in zijn eigen kleur (e-mail blauw, AI violet, cloud hemelsblauw…); subitems in een lichtere tint van dezelfde kleur.')]];
  const modi:Array<[ZijbalkModus,string,ReactElement]>=[['auto',tr('Автоматично','Automatisch'),<MousePointer2 key='a'/>],['open',tr('Розгорнута','Uitgeklapt'),<PanelLeftOpen key='o'/>],['dicht',tr('Згорнута','Ingeklapt'),<PanelLeftClose key='d'/>]];
  return <section className='zijbalk-instellingen' data-zijbalk-instellingen data-accordeon>
    <BevestigDialoog open={!!wisVraag} id='concepten-uit' lang={lang} gevaarlijk aantal={wisVraag?.aantal||undefined}
      titel={tr('Вимкнути збереження чернеток?','Concepten bewaren uitzetten?')}
      uitleg={wisVraag&&wisVraag.aantal>0?tr(`Буде видалено збережені чернетки (${wisVraag.aantal}) у цьому браузері.`,`De bewaarde concepten (${wisVraag.aantal}) in deze browser worden verwijderd.`):tr('Збережені чернетки в цьому браузері буде видалено.','De bewaarde concepten in deze browser worden verwijderd.')}
      gevolgen={[tr('Незавершений текст (чат ШІ, відповіді, нотатки) більше не відновлюватиметься після перезавантаження.','Onafgemaakte tekst (AI-chat, antwoorden, notities) komt na herladen niet meer terug.'),tr('Повернути видалені чернетки неможливо.','Verwijderde concepten kunnen niet worden teruggezet.')]}
      bevestigTekst={tr('Так, вимкнути й видалити','Ja, uitzetten en verwijderen')}
      onAnnuleer={()=>setWisVraag(null)}
      onBevestig={()=>{setWisVraag(null);zetS({concepten:false})}}/>
    <Blok id='menu-stijl' icoon={<Palette/>} titel={tr('Стиль іконок','Icoonstijl')} uitleg={tr('Класичні чи кольорові іконки розділів','Klassieke of kleurrijke iconen van de onderdelen')}>
    <fieldset className='zijbalk-keuze' data-icoon-stijl-keuze>
      <legend>{tr('Стиль іконок','Icoonstijl')}</legend>
      {stijlen.map(([id,naam,uitleg])=><label key={id} className={v.icoonStijl===id?'actief':''}>
        <input type='radio' name='icoon-stijl' value={id} checked={v.icoonStijl===id} onChange={()=>zetZijbalk({icoonStijl:id})}/>
        <span className='zijbalk-voorbeeld' data-icoon-stijl={id} aria-hidden='true'>{VOORBEELD.map(([d,i],n)=><span key={d} data-accent={DIENST_ACCENT[d]} className={n===1?'actief':''}><MenuGlyph icon={i}/></span>)}</span>
        <span><strong>{naam}</strong><small>{uitleg}</small></span>
      </label>)}
    </fieldset>
    </Blok>
    <Blok id='menu-modus' icoon={<PanelLeftOpen/>} titel={tr('Бічна панель','Zijbalk')} uitleg={tr('Автоматично, завжди розгорнута або завжди згорнута','Automatisch, altijd uitgeklapt of altijd ingeklapt')}>
    <fieldset className='zijbalk-keuze compact zijbalk-modus-segmenten' data-zijbalk-modus-keuze>
      <legend>{tr('Бічна панель','Zijbalk')}</legend>
      {modi.map(([id,naam,icoon])=><label key={id} className={v.modus===id?'actief':''}>
        <input type='radio' name='zijbalk-modus' value={id} checked={v.modus===id} onChange={()=>zetZijbalk({modus:id})}/>
        <span className='zijbalk-modus-icoon' aria-hidden='true'>{icoon}</span><span><strong>{naam}</strong></span>
      </label>)}
    </fieldset>
    </Blok>
    <Blok id='menu-snel' icoon={<Zap/>} titel={tr('Швидкий доступ','Snelle toegang')} uitleg={tr('Додати, прибрати, порядок, іконка й колір — без перетягування','Toevoegen, weghalen, volgorde, icoon en kleur — zonder slepen')}>
    <SnelleToegangEditor tr={tr} rechten={rechten}/>
    </Blok>
    <Blok id='menu-indeling' icoon={<Move/>} titel={tr('Розташування й порядок меню','Plaats en indeling van het menu')} uitleg={tr('Збоку чи док, порядок, редагування, скидання','Zijkant of dock, volgorde, bewerken, terugzetten')}>
    <MenuIndelingInstellingen tr={tr}/>
    </Blok>
    <Blok id='menu-meldingen' icoon={<BellRing/>} titel={tr('Сповіщення в меню','Meldingen in het menu')} uitleg={tr('Мітки, бульбашки, нагадування, тихі години','Badges, bellen, herinneringen, stille uren')}>
    <fieldset className='zijbalk-meldingen' data-menu-meldingen-instellingen>
      <legend><BellRing aria-hidden='true'/>{tr('Сповіщення в меню','Meldingen in het menu')}</legend>
      <p className='zijbalk-meldingen-uitleg'>{tr('Пункти меню показують мітку, коли там є щось нове (наприклад, непрочитані листи чи запит на доступ). Наведіть на пункт — побачите список, кожне можна прибрати хрестиком. Бачите лише ви: гості та інші акаунти цього не отримують.','Menu-items tonen een badge als er iets nieuws is (bijv. ongelezen e-mail of een toegangsverzoek). Wijs een item aan voor de lijst; elk bericht kun je met het kruisje verbergen. Alleen jij ziet dit: gasten en andere accounts niet.')}</p>
      {schakel('aan',m.aan,tr('Показувати мітки сповіщень','Badges tonen'),'',x=>zetM({aan:x}))}
      {/* IDENTITEIT-014: попередження безпеки (типово увімкнено) — надсилає сервер, тому не залежить від міток меню й не вимикається разом із ними. */}
      {schakel('reserve',m.reserveHerinnering!==false,tr('Нагадувати про резервний доступ','Herinneren aan reservetoegang'),m.reserveHerinnering!==false?tr('Коли після використання залишиться 2 коди відновлення або менше, у центрі сповіщень з’явиться одне нагадування створити нові.','Als er na gebruik nog 2 of minder herstelcodes over zijn, verschijnt één herinnering in het meldingencentrum om nieuwe te maken.'):tr('Вимкнено: про останні коди відновлення ви не дізнаєтеся, доки не спробуєте ними скористатися.','Uit: u merkt pas dat de laatste herstelcodes op zijn wanneer u er een probeert te gebruiken.'),x=>zetM({reserveHerinnering:x}))}
      {/* IDENTITEIT-015 (kaart-stille-uren): тихі години діють на весь центр сповіщень (спливання, звук, пульс і нагадування міток), тому
          не залежать від «Показувати мітки». Попередження безпеки однаково спливають. Після кінця — один підсумок «Поки була тиша: N». */}
      <div className='zijbalk-meldingen-stil' data-stille-uren>
        {schakel('stil',m.stil.aan,tr('Тихі години','Stille uren'),m.stil.aan?tr(`З ${m.stil.van} до ${m.stil.tot} нові сповіщення не спливають і не звучать, мітки меню не пульсують — усе лишається в панелі сповіщень. Попередження безпеки все одно з’являються. Після кінця тиші — одне зведення «Поки була тиша: N».`,`Van ${m.stil.van} tot ${m.stil.tot} verschijnen nieuwe meldingen niet en maken ze geen geluid, menubadges pulseren niet — alles blijft in het meldingenpaneel. Beveiligingswaarschuwingen verschijnen wel. Na afloop één overzicht «Tijdens de stille uren: N».`):tr('Вимкнено: сповіщення спливають і звучать будь-коли (як налаштовано для кожного типу).','Uit: meldingen verschijnen en klinken op elk moment (zoals per type ingesteld).'),x=>zetM({stil:{...m.stil,aan:x}}))}
        <span className='zijbalk-meldingen-tijden'><input type='time' aria-label={tr('Від','Van')} value={m.stil.van} disabled={!m.stil.aan} onChange={e=>zetM({stil:{...m.stil,van:e.target.value}})}/>–<input type='time' aria-label={tr('До','Tot')} value={m.stil.tot} disabled={!m.stil.aan} onChange={e=>zetM({stil:{...m.stil,tot:e.target.value}})}/></span>
      </div>
      <div className='zijbalk-meldingen-groep' aria-disabled={!m.aan}>
        <div className='zijbalk-keuze compact zijbalk-badge-stijl' role='radiogroup' aria-label={tr('Вигляд мітки','Weergave van de badge')}>
          {([['getal',tr('Число','Getal'),tr('Скільки нового','Hoeveel nieuw')],['punt',tr('Кольорова крапка','Gekleurde stip'),tr('Колір — категорія','Kleur = categorie')]] as const).map(([id,naam,uitleg])=><label key={id} className={m.stijl===id?'actief':''}>
            <input type='radio' name='badge-stijl' value={id} checked={m.stijl===id} disabled={!m.aan} onChange={()=>zetM({stijl:id})}/>
            <span className={`menu-badge voorbeeld ${id}`} data-categorie='post' aria-hidden='true'>{id==='getal'?'3':null}</span><span><strong>{naam}</strong><small>{uitleg}</small></span>
          </label>)}
        </div>
        {schakel('bellen',m.bellen,tr('Список при наведенні («бульбашки»)','Lijstje bij aanwijzen («bellen»)'),tr('Що саме нового і чому горить мітка, з кнопкою ×.','Wat er nieuw is en waarom de badge brandt, met een ×.'),x=>zetM({bellen:x}),!m.aan)}
        {schakel('knipperen',m.knipperen,tr('Привертати увагу до нового','Aandacht vragen voor iets nieuws'),tr('Мітка коротко пульсує, доки ви не переглянете.','De badge pulseert even tot je hem bekijkt.'),x=>zetM({knipperen:x}),!m.aan)}
        <label className='zijbalk-meldingen-rij'><span><strong>{tr('Нагадувати про непрочитане','Herinneren aan ongelezen')}</strong><small>{tr('Тихий пульс міток час від часу.','Af en toe een zachte puls op de badges.')}</small></span>
          <select value={m.herinneren} disabled={!m.aan} data-meld-herinneren onChange={e=>zetM({herinneren:Number(e.target.value)})}>{HERINNER_MINUTEN.map(n=><option key={n} value={n}>{n===0?tr('Ніколи','Nooit'):n<60?tr(`Кожні ${n} хв`,`Elke ${n} min`):tr(`Кожні ${n/60} год`,`Elke ${n/60} u`)}</option>)}</select>
        </label>
        <fieldset className='zijbalk-meldingen-cat'>
          <legend>{tr('Категорії міток у меню','Categorieën van menubadges')}</legend>
          {MELDING_CATEGORIEEN.map(c=><label key={c} className='zijbalk-cat' data-meld-categorie={c}><input type='checkbox' checked={m.categorieen[c]} disabled={!m.aan} onChange={e=>zetM({categorieen:{...m.categorieen,[c]:e.target.checked}})}/><span className='menu-badge punt' data-categorie={c} aria-hidden='true'/>{tr(...CATEGORIE_TEKST[c])}</label>)}
        </fieldset>
      </div>
    </fieldset>
    </Blok>
    {/* IDENTITEIT-014: як показувати кожен тип сповіщення (звук, спливне вікно, тривалість) — те саме сховище, що в дзвонику. */}
    <Blok id='menu-meldingtypen' icoon={<SlidersHorizontal/>} titel={tr('Типи сповіщень','Soorten meldingen')} uitleg={tr('Для кожного типу: зі звуком, лише спливне вікно чи лише в панелі, і скільки висить','Per soort: met geluid, alleen pop-up of alleen in het paneel, en hoe lang hij blijft staan')}>
      <MeldingVoorkeurenPaneel lang={lang} techTypen={!!tech.profiel}/>
    </Blok>
    <Blok id='menu-snelheid' icoon={<Gauge/>} titel={tr('Швидкість переходів і чернетки','Snelheid van overgangen en concepten')} uitleg={tr('Смужка завантаження, плавні переходи, підвантаження','Laadbalk, vloeiende overgangen, vooraf laden')}>
    <fieldset className='zijbalk-meldingen zijbalk-snelheid' data-menu-snelheid-instellingen>
      <legend><Gauge aria-hidden='true'/>{tr('Швидкість переходів і чернетки','Snelheid van overgangen en concepten')}</legend>
      <p className='zijbalk-meldingen-uitleg'>{tr('Тонка смужка вгорі показує, що сторінка вантажиться (у кольорі розділу, куди ви переходите). Розділи можна підвантажувати заздалегідь, коли ви наводите на них у меню.','Een dunne balk bovenaan laat zien dat een pagina laadt (in de kleur van het onderdeel waar je heen gaat). Onderdelen kunnen alvast worden opgehaald als je ze in het menu aanwijst.')}</p>
      {schakel('voortgang',sn.voortgang,tr('Смужка завантаження','Laadbalk'),tr('У кольорі розділу, куди ви переходите.','In de kleur van het onderdeel waar je heen gaat.'),x=>zetS({voortgang:x}))}
      {schakel('overgangen',sn.overgangen,tr('Плавна зміна сторінок','Vloeiende paginawissel'),tr('Лише робоча область; вимикається, якщо в системі «менше анімації».','Alleen het werkgebied; uit bij «minder beweging» in het systeem.'),x=>zetS({overgangen:x}))}
      {schakel('vooruitladen',sn.vooruitladen,tr('Підвантажувати розділ при наведенні','Onderdeel ophalen bij aanwijzen'),tr('Лише сторінки цього сайту; не працює в режимі економії трафіку.','Alleen pagina’s van deze site; niet bij databesparing.'),x=>zetS({vooruitladen:x}))}
      <div className='zijbalk-risico' role='group' aria-label={tr('Експериментальні функції','Experimentele functies')}>
        <p className='zijbalk-risico-kop'><strong>{tr('Експериментально','Experimenteel')}</strong> {tr('— вимкнено типово','— standaard uit')}</p>
        {schakel('prerender',sn.prerender,tr('Повністю готувати розділ заздалегідь','Onderdeel volledig voorbereiden'),tr('Ще швидше, але браузер відкриває сторінку у фоні. Застосунок стартує лише коли ви її справді відкриєте.','Nog sneller, maar de browser opent de pagina op de achtergrond. De app start pas als je hem echt opent.'),x=>zetS({prerender:x}),!sn.vooruitladen)}
        {schakel('concepten',sn.concepten,tr('Зберігати чернетки (зашифровано)','Concepten bewaren (versleuteld)'),tr('Незавершений текст у полях (чат ШІ, відповіді, нотатки) зберігається зашифрованим лише в цьому браузері до 7 днів і відновлюється після перезавантаження. Вимкнення видаляє всі чернетки.','Onafgemaakte tekst in velden (AI-chat, antwoorden, notities) wordt versleuteld alleen in deze browser bewaard (max. 7 dagen) en na herladen teruggezet. Uitzetten wist alle concepten.'),x=>{if(x)zetS({concepten:true});else void vraagConceptenUit()})}
      </div>
    </fieldset>
    </Blok>
    {zichtbaarheid&&<Blok id='menu-zichtbaarheid' icoon={<Eye/>} titel={tr('Видимість та іконки пунктів','Zichtbaarheid en iconen van de items')} uitleg={tr('Показати чи приховати розділ, вибрати іконку','Een onderdeel tonen of verbergen, een icoon kiezen')}>{zichtbaarheid}</Blok>}
  </section>;
}
