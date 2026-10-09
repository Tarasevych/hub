// Instellingen → Меню: «Стиль іконок» (Класичний / Кольоровий) en de modus van de bijbalk (auto / altijd open / altijd smal).
// Dezelfde winkel als de werkbalk boven in de zijbalk (zijbalk-voorkeuren.ts): wijzigingen zijn meteen overal zichtbaar.
import type {ReactElement} from 'react';
import {MousePointer2,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
import {DIENST_ACCENT,type IcoonStijl,type ZijbalkModus} from '../shared/menu-model';
import {MenuGlyph} from './menu-preferences';
import {useZijbalkVoorkeuren,zetZijbalk} from './zijbalk-voorkeuren';

type Tr=(uk:string,nl:string)=>string;
const VOORBEELD=[['hub','home'],['mail','mail'],['cloud','cloud'],['identity','settings']] as const;

export default function ZijbalkInstellingen({tr}:{tr:Tr}){
  const v=useZijbalkVoorkeuren();
  const stijlen:Array<[IcoonStijl,string,string]>=[['klassiek',tr('Класичний','Klassiek'),tr('Спокійні монохромні іконки; активний пункт — кольором теми.','Rustige monochrome iconen; het actieve item in de themakleur.')],['kleur',tr('Кольоровий','Kleurrijk'),tr('Кожен розділ має свій колір: іконка й підсвітка активного пункту.','Elk onderdeel heeft een eigen kleur: icoon en markering van het actieve item.')]];
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
  </section>;
}
