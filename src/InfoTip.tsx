// Kleine (?) naast een titel met uitleg in een eigen popover (geen native title-attribuut).
// Desktop: verschijnt bij hover of toetsenbordfocus. Mobiel: tikken opent/sluit. Esc of tikken ernaast sluit.
// De popover staat position:fixed (berekend uit de knop), zodat overflow:hidden van de kaarten hem niet afknipt.
// Toegankelijk: de knop heeft een aria-label, aria-expanded en aria-describedby → de tekst (role=tooltip).
import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';

type Props={label:string;children:ReactNode;className?:string};

export function InfoTip({label,children,className}:Props){
  const id=useId();
  const[open,setOpen]=useState(false);
  const[vast,setVast]=useState(false);// geopend door tik/klik: blijft staan tot opnieuw tikken, Esc of klik ernaast
  const wortel=useRef<HTMLSpanElement>(null);
  const knop=useRef<HTMLButtonElement>(null);
  const[plek,setPlek]=useState<CSSProperties>({});
  useLayoutEffect(()=>{
    if(!open)return;
    const zet=()=>{
      const r=knop.current?.getBoundingClientRect();if(!r)return;
      const breed=Math.min(320,window.innerWidth-16);
      const left=Math.max(8,Math.min(r.left+r.width/2-breed/2,window.innerWidth-breed-8));
      setPlek({top:Math.round(r.bottom+8),left:Math.round(left),maxWidth:breed});
    };
    zet();
    window.addEventListener('scroll',zet,true);window.addEventListener('resize',zet);
    return()=>{window.removeEventListener('scroll',zet,true);window.removeEventListener('resize',zet);};
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);setVast(false);}};
    const buiten=(e:PointerEvent)=>{if(wortel.current&&!wortel.current.contains(e.target as Node)){setOpen(false);setVast(false);}};
    document.addEventListener('keydown',esc);document.addEventListener('pointerdown',buiten);
    return()=>{document.removeEventListener('keydown',esc);document.removeEventListener('pointerdown',buiten);};
  },[open]);
  return <span ref={wortel} className={`info-tip${className?` ${className}`:''}`} data-open={open||undefined}
    onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>{if(!vast)setOpen(false);}}>
    <button ref={knop} type='button' className='info-tip-knop' aria-label={label} aria-expanded={open} aria-describedby={id}
      onFocus={()=>setOpen(true)} onBlur={()=>{if(!vast)setOpen(false);}}
      onClick={()=>{const n=!vast;setVast(n);setOpen(n);}}>?</button>
    <span id={id} role='tooltip' className='info-tip-tekst' style={plek} hidden={!open}>{children}</span>
  </span>;
}
