// Instellingen → Меню: «Стиль іконок» (Класичний / Кольоровий) en de modus van de bijbalk (auto / altijd open / altijd smal).
// Dezelfde winkel als de werkbalk boven in de zijbalk (zijbalk-voorkeuren.ts): wijzigingen zijn meteen overal zichtbaar.
import {useEffect,type ReactElement} from 'react';
import {BellRing,MousePointer2,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
import {CATEGORIE_TEKST,HERINNER_MINUTEN,MELDING_CATEGORIEEN,type MeldingVoorkeuren} from '../shared/menu-meldingen-voorkeuren';
import {DIENST_ACCENT,type IcoonStijl,type ZijbalkModus} from '../shared/menu-model';
import {MenuGlyph} from './menu-preferences';
import {useZijbalkVoorkeuren,zetZijbalk} from './zijbalk-voorkeuren';

type Tr=(uk:string,nl:string)=>string;
const VOORBEELD=[['hub','home'],['mail','mail'],['cloud','cloud'],['identity','settings']] as const;

export default function ZijbalkInstellingen({tr}:{tr:Tr}){
  const v=useZijbalkVoorkeuren(),m=v.meldingen;
  const zetM=(patch:Partial<MeldingVoorkeuren>)=>zetZijbalk(cur=>({...cur,meldingen:{...cur.meldingen,...patch}}));
  useEffect(()=>{if(location.hash==='#menu-meldingen')window.setTimeout(()=>document.getElementById('menu-meldingen')?.scrollIntoView({block:'start'}),150)},[]);
  const schakel=(id:string,aan:boolean,naam:string,uitleg:string,doe:(x:boolean)=>void,uit=false)=><label className={`zijbalk-schakel${uit?' uit':''}`} data-meld-schakel={id}><input type='checkbox' role='switch' checked={aan} disabled={uit} onChange={e=>doe(e.target.checked)}/><span className='zijbalk-schakel-spoor' aria-hidden='true'><i/></span><span><strong>{naam}</strong>{uitleg&&<small>{uitleg}</small>}</span></label>;
  const stijlen:Array<[IcoonStijl,string,string]>=[['klassiek',tr('Класичний','Klassiek'),tr('Спокійні монохромні іконки; колір розділу з’являється при наведенні та в активного пункту.','Rustige monochrome iconen; de kleur van het onderdeel verschijnt bij aanwijzen en bij het actieve item.')],['kleur',tr('Кольоровий','Kleurrijk'),tr('Кожен розділ завжди у своєму кольорі (пошта — синя, ШІ — фіолетовий, хмара — блакитна…); підпункти — світлішим відтінком того ж кольору.','Elk onderdeel altijd in zijn eigen kleur (e-mail blauw, AI violet, cloud hemelsblauw…); subitems in een lichtere tint van dezelfde kleur.')]];
  const modi:Array<[ZijbalkModus,string,ReactElement]>=[['auto',tr('Автоматично: розгортається при наведенні','Automatisch: klapt open bij aanwijzen'),<MousePointer2 key='a'/>],['open',tr('Завжди розгорнута','Altijd uitgeklapt'),<PanelLeftOpen key='o'/>],['dicht',tr('Завжди згорнута','Altijd ingeklapt'),<PanelLeftClose key='d'/>]];
  return <section className='zijbalk-instellingen' data-zijbalk-instellingen>
    <fieldset className='zijbalk-keuze' data-icoon-stijl-keuze>
      <legend>{tr('Стиль іконок','Icoonstijl')}</legend>
      {stijlen.map(([id,naam,uitleg])=><label key={id} className={v.icoonStijl===id?'actief':''}>
        <input type='radio' name='icoon-stijl' value={id} checked={v.icoonStijl===id} onChange={()=>zetZijbalk({icoonStijl:id})}/>
        <span className='zijbalk-voorbeeld' data-icoon-stijl={id} aria-hidden='true'>{VOORBEELD.map(([d,i],n)=><span key={d} data-accent={DIENST_ACCENT[d]} className={n===1?'actief':''}><MenuGlyph icon={i}/></span>)}</span>
        <span><strong>{naam}</strong><small>{uitleg}</small></span>
      </label>)}
    </fieldset>
    <fieldset className='zijbalk-keuze compact' data-zijbalk-modus-keuze>
      <legend>{tr('Бічна панель','Zijbalk')}</legend>
      {modi.map(([id,naam,icoon])=><label key={id} className={v.modus===id?'actief':''}>
        <input type='radio' name='zijbalk-modus' value={id} checked={v.modus===id} onChange={()=>zetZijbalk({modus:id})}/>
        <span className='zijbalk-modus-icoon' aria-hidden='true'>{icoon}</span><span><strong>{naam}</strong></span>
      </label>)}
    </fieldset>
    <fieldset className='zijbalk-meldingen' id='menu-meldingen' data-menu-meldingen-instellingen>
      <legend><BellRing aria-hidden='true'/>{tr('Сповіщення в меню','Meldingen in het menu')}</legend>
      <p className='zijbalk-meldingen-uitleg'>{tr('Пункти меню показують мітку, коли там є щось нове (наприклад, непрочитані листи чи запит на доступ). Наведіть на пункт — побачите список, кожне можна прибрати хрестиком. Бачите лише ви: гості та інші акаунти цього не отримують.','Menu-items tonen een badge als er iets nieuws is (bijv. ongelezen e-mail of een toegangsverzoek). Wijs een item aan voor de lijst; elk bericht kun je met het kruisje verbergen. Alleen jij ziet dit: gasten en andere accounts niet.')}</p>
      {schakel('aan',m.aan,tr('Показувати мітки сповіщень','Badges tonen'),'',x=>zetM({aan:x}))}
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
        <div className='zijbalk-meldingen-stil'>
          {schakel('stil',m.stil.aan,tr('Тихі години','Stille uren'),tr('Без пульсу та нагадувань; мітки залишаються.','Geen puls of herinneringen; badges blijven.'),x=>zetM({stil:{...m.stil,aan:x}}),!m.aan)}
          <span className='zijbalk-meldingen-tijden'><input type='time' aria-label={tr('Від','Van')} value={m.stil.van} disabled={!m.aan||!m.stil.aan} onChange={e=>zetM({stil:{...m.stil,van:e.target.value}})}/>–<input type='time' aria-label={tr('До','Tot')} value={m.stil.tot} disabled={!m.aan||!m.stil.aan} onChange={e=>zetM({stil:{...m.stil,tot:e.target.value}})}/></span>
        </div>
        <fieldset className='zijbalk-meldingen-cat'>
          <legend>{tr('Типи сповіщень','Soorten meldingen')}</legend>
          {MELDING_CATEGORIEEN.map(c=><label key={c} className='zijbalk-cat' data-meld-categorie={c}><input type='checkbox' checked={m.categorieen[c]} disabled={!m.aan} onChange={e=>zetM({categorieen:{...m.categorieen,[c]:e.target.checked}})}/><span className='menu-badge punt' data-categorie={c} aria-hidden='true'/>{tr(...CATEGORIE_TEKST[c])}</label>)}
        </fieldset>
      </div>
    </fieldset>
  </section>;
}
