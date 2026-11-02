// «Levend» menu (fase B2): badge op een menu-item + «sms-bellen» bij aanwijzen. Inhoud komt uitsluitend uit de bel-meldingen van het
// eigen (goedgekeurde) account en uit tellers (alleen getallen); alles als tekst gerenderd (React escapet), niets in aria-label of
// URL's behalve het aantal. Bellen verschijnen alleen bij aanwijzen/focus; × verbergt (server: gelezen; teller: tot er meer is).
import {useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent as RKeyboardEvent} from 'react';
import {ExternalLink,X} from 'lucide-react';
import {CATEGORIE_TEKST,badgeTekst,type Badge,type BadgeStijl,type MenuMelding} from '../shared/menu-meldingen';

type Lang='uk'|'nl';
const tr=(lang:Lang,uk:string,nl:string)=>lang==='uk'?uk:nl;
export const badgeLabel=(lang:Lang,n:number)=>lang==='uk'?`${n} ${n%10>=1&&n%10<=4&&!(n%100>=11&&n%100<=14)?'сповіщення':'сповіщень'}`:`${n} ${n===1?'melding':'meldingen'}`;

export function MenuBadge({badge,stijl,knipper,herinner}:{badge:Badge;stijl:BadgeStijl;knipper:boolean;herinner:boolean}){
  const getal=stijl==='getal';
  return <span className={`menu-badge${getal?' getal':' punt'}`} data-menu-badge={badge.item} data-categorie={badge.categorieen[0]} data-meer-categorieen={badge.categorieen.length>1?'ja':undefined} data-knipper={knipper?'ja':undefined} data-herinner={herinner?'ja':undefined} aria-hidden='true'>{getal?badgeTekst(badge.aantal):null}</span>;
}

const tijd=(lang:Lang,op:number)=>{if(!op)return'';const s=Math.max(0,Math.round((Date.now()-op)/1000));if(s<60)return tr(lang,'щойно','zojuist');const m=Math.round(s/60);if(m<60)return tr(lang,`${m} хв тому`,`${m} min geleden`);const u=Math.round(m/60);if(u<48)return tr(lang,`${u} год тому`,`${u} u geleden`);return new Date(op).toLocaleDateString(lang==='uk'?'uk-UA':'nl-BE',{day:'numeric',month:'short'})};

type BellenProps={lang:Lang;label:string;badge:Badge;anker:DOMRect;onSluit:(m:MenuMelding)=>void;onOpen:(m:MenuMelding)=>void;onAllesWeg:()=>void;onBinnen:(binnen:boolean)=>void;onEsc:()=>void;paneelRef:(el:HTMLDivElement|null)=>void};
export function MeldingBellen({lang,label,badge,anker,onSluit,onOpen,onAllesWeg,onBinnen,onEsc,paneelRef}:BellenProps){
  const ref=useRef<HTMLDivElement|null>(null);
  const[pos,setPos]=useState({left:anker.right+10,top:anker.top-6});
  useLayoutEffect(()=>{const el=ref.current;if(!el)return;const h=el.offsetHeight,w=el.offsetWidth;const top=Math.max(8,Math.min(anker.top-6,window.innerHeight-h-8)),left=Math.min(anker.right+10,window.innerWidth-w-8);setPos({left,top})},[anker,badge.meldingen.length]);
  useEffect(()=>{paneelRef(ref.current);return()=>paneelRef(null)},[paneelRef]);
  const toets=(e:RKeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onEsc()}};
  return <div ref={ref} className='menu-bellen' role='region' aria-label={`${label}: ${badgeLabel(lang,badge.aantal)}`} data-menu-bellen={badge.item} style={{left:pos.left,top:pos.top}} onPointerEnter={()=>onBinnen(true)} onPointerLeave={()=>onBinnen(false)} onFocus={()=>onBinnen(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))onBinnen(false)}} onKeyDown={toets}>
    <div className='menu-bellen-kop'><strong>{label}</strong><span>{badgeLabel(lang,badge.aantal)}</span></div>
    {/* Legenda: de kleur van de stip is de soort melding (zelfde kleur als in de lijst hieronder). */}
    <div className='menu-bellen-legenda' aria-hidden='true'>{[...new Set(badge.meldingen.map((m)=>m.categorie))].map((c)=><span key={c} className='menu-bellen-legenda-item' data-categorie={c}><i/>{CATEGORIE_TEKST[c][lang==='uk'?0:1]}</span>)}</div>
    <ul>{badge.meldingen.map((m,i)=><li key={m.id} className='menu-bel' data-categorie={m.categorie} data-melding-id={m.id} style={{animationDelay:`${i*45}ms`}}>
      <span className='menu-bel-stip' aria-hidden='true'/>
      <div className='menu-bel-tekst'>
        <small>{CATEGORIE_TEKST[m.categorie][lang==='uk'?0:1]}{m.op?` · ${tijd(lang,m.op)}`:''}</small>
        <button type='button' className='menu-bel-titel' onClick={()=>onOpen(m)}>{m.titel||tr(lang,'Сповіщення','Melding')}<ExternalLink aria-hidden='true'/></button>
        {m.tekst&&<p>{m.tekst}</p>}
      </div>
      <button type='button' className='menu-bel-weg' aria-label={tr(lang,`Прибрати: ${m.titel}`,`Verbergen: ${m.titel}`)} data-tooltip={tr(lang,'Прибрати (позначити прочитаним)','Verbergen (als gelezen markeren)')} onClick={()=>onSluit(m)}><X aria-hidden='true'/></button>
    </li>)}</ul>
    {badge.meldingen.length>1&&<button type='button' className='menu-bellen-alles' onClick={onAllesWeg}>{tr(lang,'Прибрати всі тут','Alles hier verbergen')}</button>}
  </div>;
}
