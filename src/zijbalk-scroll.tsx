// Scrollpijlen voor het zijmenu (menu v2): een kleine pijl boven/onder met een vervaging, alleen als er in die richting
// nog iets te zien is. Klik = vloeiend een stuk verder; ingedrukt houden = blijven scrollen tot loslaten. Werkt smal en breed.
import {useCallback,useEffect,useRef,useState,type PointerEvent as RPointerEvent,type RefObject} from 'react';
import {ChevronDown,ChevronUp} from 'lucide-react';

export const SCROLL_STAP=140, HOUD_NA_MS=260, HOUD_PX_PER_S=520, MARGE=2;
/** Puur (getest): is er boven/onder nog inhoud? */
export function scrollRichtingen(top:number,hoogte:number,zichtbaar:number){return{boven:top>MARGE,onder:top+zichtbaar<hoogte-MARGE}}

export function useScrollPijlen(ref:RefObject<HTMLElement|null>){
  const[st,setSt]=useState({boven:false,onder:false});
  const meet=useCallback(()=>{const el=ref.current;if(!el)return;const r=scrollRichtingen(el.scrollTop,el.scrollHeight,el.clientHeight);setSt(v=>v.boven===r.boven&&v.onder===r.onder?v:r)},[ref]);
  useEffect(()=>{const el=ref.current;if(!el)return;meet();el.addEventListener('scroll',meet,{passive:true});window.addEventListener('resize',meet);const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(meet):null;ro?.observe(el);const mo=new MutationObserver(()=>requestAnimationFrame(meet));mo.observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-submenu-manual-state']});return()=>{el.removeEventListener('scroll',meet);window.removeEventListener('resize',meet);ro?.disconnect();mo.disconnect()}},[ref,meet]);
  return{...st,meet};
}

type Props={lijst:RefObject<HTMLElement|null>;boven:boolean;onder:boolean;lang:'uk'|'nl';smal:boolean};
export function ScrollPijlen({lijst,boven,onder,lang,smal}:Props){
  const houd=useRef<{raf:number;start:number;t:number;timer:number;gehouden:boolean}|null>(null);
  const stop=()=>{const h=houd.current;if(!h)return;window.clearTimeout(h.timer);cancelAnimationFrame(h.raf);houd.current=null};
  useEffect(()=>stop,[]);
  const rustig=()=>typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion:reduce)').matches;
  const druk=(richting:1|-1)=>(e:RPointerEvent<HTMLButtonElement>)=>{
    if(e.button!==0)return;stop();
    const h={raf:0,start:performance.now(),t:performance.now(),timer:0,gehouden:false};houd.current=h;
    try{e.currentTarget.setPointerCapture(e.pointerId)}catch{/* oud */}
    h.timer=window.setTimeout(()=>{h.gehouden=true;h.t=performance.now();const stap=(nu:number)=>{const el=lijst.current;if(!el||houd.current!==h)return;el.scrollTop+=richting*HOUD_PX_PER_S*Math.min(64,nu-h.t)/1000;h.t=nu;h.raf=requestAnimationFrame(stap)};h.raf=requestAnimationFrame(stap)},HOUD_NA_MS);
  };
  const los=(richting:1|-1)=>()=>{const h=houd.current;stop();if(h&&!h.gehouden)lijst.current?.scrollBy({top:richting*SCROLL_STAP,behavior:rustig()?'auto':'smooth'})};
  const label=(r:1|-1)=>r<0?(lang==='uk'?'Прокрутити меню вгору':'Menu omhoog scrollen'):(lang==='uk'?'Прокрутити меню вниз':'Menu omlaag scrollen');
  const knop=(r:1|-1,zichtbaar:boolean)=><div className={`zijbalk-pijl ${r<0?'boven':'onder'}`} data-zijbalk-pijl={r<0?'boven':'onder'} data-zichtbaar={zichtbaar?'true':'false'} aria-hidden={zichtbaar?undefined:'true'}>
    <button type='button' tabIndex={zichtbaar?0:-1} aria-label={label(r)} data-tooltip={label(r)} data-tooltip-placement={smal?'right':undefined} onPointerDown={druk(r)} onPointerUp={los(r)} onPointerCancel={stop} onLostPointerCapture={()=>{if(houd.current?.gehouden)stop()}} onClick={e=>{if(e.detail===0)lijst.current?.scrollBy({top:r*SCROLL_STAP,behavior:rustig()?'auto':'smooth'})}}>{r<0?<ChevronUp aria-hidden='true'/>:<ChevronDown aria-hidden='true'/>}</button>
  </div>;
  return <>{knop(-1,boven)}{knop(1,onder)}</>;
}
