// Compacte werkbalk boven in de zijbalk (menu v2) — vervangt de grote knop «Зафіксувати бічну панель».
// Drie modi: altijd uitgeklapt, altijd ingeklapt (geen hover), automatisch (uitklappen bij aanwijzen) + ⚙ (fase B3): naar
// Налаштування → Меню (meldingen, stijl, modus). De ⚙ is een echte link (middelklik/nieuw tabblad werkt).
// Breed: drie iconen naast elkaar (role=toolbar, pijltjestoetsen). Smal: één knop met de huidige modus die een klein paneel opent.
// Fase 2: ✎ = menu bewerken (slepen, verplaatsen, kopiëren, terugzetten). Dock (boven/onder): alleen ⚙ en ✎ (de modus geldt dan niet);
// `kant` = aan welke kant de tooltips staan in de smalle stand (rechts bij een menu links, links bij een menu rechts).
import {useEffect,useRef,useState,type KeyboardEvent as RKeyboardEvent} from 'react';
import {MousePointer2,PanelLeftClose,PanelLeftOpen,PencilRuler,Settings2} from 'lucide-react';
import type {ZijbalkModus} from '../shared/menu-model';

const TEKST:Record<ZijbalkModus,[string,string]>={
  open:['Завжди розгорнута','Altijd uitgeklapt'],
  dicht:['Завжди згорнута (без розгортання при наведенні)','Altijd ingeklapt (niet openklappen bij aanwijzen)'],
  auto:['Автоматично: розгортається при наведенні','Automatisch: klapt open bij aanwijzen'],
};
const ICOON:Record<ZijbalkModus,typeof MousePointer2>={open:PanelLeftOpen,dicht:PanelLeftClose,auto:MousePointer2};
const VOLGORDE:ZijbalkModus[]=['open','dicht','auto'];
export const modusTekst=(m:ZijbalkModus,lang:'uk'|'nl')=>TEKST[m][lang==='uk'?0:1];

type Props={lang:'uk'|'nl';modus:ZijbalkModus;breed:boolean;onModus:(m:ZijbalkModus)=>void;instellingenHref:string;onInstellingen:(e:{preventDefault:()=>void})=>void;kant?:'right'|'left';bewerken?:boolean;onBewerken?:()=>void;dock?:boolean};
export const bewerkTekst=(lang:'uk'|'nl')=>lang==='uk'?'Редагувати меню: перетягнути, перемістити, дублювати':'Menu bewerken: slepen, verplaatsen, dupliceren';
export default function ZijbalkWerkbalk({lang,modus,breed,onModus,instellingenHref,onInstellingen,kant='right',bewerken=false,onBewerken,dock=false}:Props){
  const[open,setOpen]=useState(false);
  const wrap=useRef<HTMLDivElement|null>(null),knoppen=useRef<Array<HTMLElement|null>>([]);
  const titel=lang==='uk'?'Режим бічної панелі':'Weergave van de zijbalk';
  useEffect(()=>{if(breed)setOpen(false)},[breed]);
  useEffect(()=>{if(!open)return;const weg=(e:PointerEvent)=>{if(wrap.current&&!wrap.current.contains(e.target as Node))setOpen(false)},esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);wrap.current?.querySelector<HTMLButtonElement>('.zijbalk-modus-huidig')?.focus()}};document.addEventListener('pointerdown',weg,true);document.addEventListener('keydown',esc);window.setTimeout(()=>knoppen.current[Math.max(0,modi.indexOf(modus))]?.focus(),0);return()=>{document.removeEventListener('pointerdown',weg,true);document.removeEventListener('keydown',esc)}},[open]);// eslint-disable-line react-hooks/exhaustive-deps
  const modi=dock?[]:VOLGORDE,N=modi.length+(onBewerken?2:1),pijltjes=(e:RKeyboardEvent)=>{const i=knoppen.current.findIndex(b=>b===document.activeElement);if(i<0)return;const d=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;if(e.key==='Home'||e.key==='End'){e.preventDefault();knoppen.current[e.key==='Home'?0:N-1]?.focus();return}if(!d)return;e.preventDefault();knoppen.current[(i+d+N)%N]?.focus()};
  const instTekst=lang==='uk'?'Налаштування меню: сповіщення, стиль, режим':'Menu-instellingen: meldingen, stijl, weergave';
  const balk=<div className='zijbalk-werkbalk-knoppen' role='toolbar' aria-label={titel} aria-orientation='horizontal' onKeyDown={pijltjes}>
    {modi.map((m,i)=>{const I=ICOON[m],t=modusTekst(m,lang);return <button key={m} ref={b=>{knoppen.current[i]=b}} type='button' className={modus===m?'actief':''} data-zijbalk-modus={m} aria-pressed={modus===m} aria-label={t} data-tooltip={t} data-tooltip-placement={breed?undefined:kant} tabIndex={modus===m?0:-1} onClick={()=>{onModus(m);setOpen(false)}}><I aria-hidden='true'/></button>})}
    {!dock&&<span className='zijbalk-werkbalk-scheiding' aria-hidden='true'/>}
    <a ref={b=>{knoppen.current[modi.length]=b}} href={instellingenHref} className='zijbalk-werkbalk-instellingen' data-zijbalk-instellingen-knop aria-label={instTekst} data-tooltip={instTekst} data-tooltip-placement={breed||dock?undefined:kant} onClick={e=>{setOpen(false);onInstellingen(e)}}><Settings2 aria-hidden='true'/></a>
    {onBewerken&&<button ref={b=>{knoppen.current[modi.length+1]=b}} type='button' className={`zijbalk-werkbalk-bewerken${bewerken?' actief':''}`} data-menu-bewerken-knop aria-pressed={bewerken} aria-label={bewerkTekst(lang)} data-tooltip={bewerkTekst(lang)} data-tooltip-placement={breed||dock?undefined:kant} onClick={()=>{setOpen(false);onBewerken()}}><PencilRuler aria-hidden='true'/></button>}
  </div>;
  if(dock)return <div className='zijbalk-werkbalk dock' ref={wrap}>{balk}</div>;
  if(breed)return <div className='zijbalk-werkbalk breed' ref={wrap}><span className='zijbalk-werkbalk-titel' aria-hidden='true'>{lang==='uk'?'Меню':'Menu'}</span>{balk}</div>;
  const Huidig=ICOON[modus],uitleg=`${titel}: ${modusTekst(modus,lang)}`;
  return <div className='zijbalk-werkbalk smal' ref={wrap}>
    <button type='button' className='zijbalk-modus-huidig' data-zijbalk-modus-knop={modus} aria-haspopup='true' aria-expanded={open} aria-label={uitleg} data-tooltip={open?undefined:uitleg} data-tooltip-placement={kant} onClick={()=>setOpen(v=>!v)}><Huidig aria-hidden='true'/></button>
    {open&&<div className='zijbalk-werkbalk-paneel' data-zijbalk-paneel>{balk}</div>}
  </div>;
}
