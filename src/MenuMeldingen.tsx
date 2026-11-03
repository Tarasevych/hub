// «Levend» menu (fase B2): badge op een menu-item + «sms-bellen» bij aanwijzen. Inhoud komt uitsluitend uit de bel-meldingen van het
// eigen (goedgekeurde) account en uit tellers (alleen getallen); alles als tekst gerenderd (React escapet), niets in aria-label of
// URL's behalve het aantal. Bellen verschijnen alleen bij aanwijzen/focus; × verbergt (server: gelezen; teller: tot er meer is).
//
// INTEG-001 (eigenaar: «Червона точка на пункті меню сайту горить без пояснення. Наведення або клік мають відкривати вікно з
// поясненням, до чого точка, з переходом до місця і кнопкою «очистити» одразу»):
//  • ook een KLIK/TIK op de stip opent het venster (vroeger alleen aanwijzen met de muis — op de telefoon nooit), en het venster
//    sluit bij een tik ernaast;
//  • bovenaan in gewone woorden wat de stip betekent (hoeveel, welk soort, waar), per melding «Відкрити» (naar de plek) en
//    «Очистити» als tekstknop (niet alleen ×), en altijd «Очистити все тут» (ook bij één melding);
//  • «Усі сповіщення» opent het meldingenpaneel aan de bel.
import {useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent as RKeyboardEvent,type MouseEvent as RMouseEvent} from 'react';
import {Bell,ExternalLink} from 'lucide-react';
import {CATEGORIE_TEKST,badgeTekst,type Badge,type BadgeStijl,type MenuMelding} from '../shared/menu-meldingen';
import {MELDINGEN_OPENEN_EVENT} from './canoniek-meldingen';

type Lang='uk'|'nl';
const tr=(lang:Lang,uk:string,nl:string)=>lang==='uk'?uk:nl;
export const badgeLabel=(lang:Lang,n:number)=>lang==='uk'?`${n} ${n%10>=1&&n%10<=4&&!(n%100>=11&&n%100<=14)?'сповіщення':'сповіщень'}`:`${n} ${n===1?'melding':'meldingen'}`;

/** Wat de stip betekent, in één zin: hoeveel, welk soort (kleur), waar. */
export function stipUitleg(lang:Lang,label:string,badge:Badge):string{
  const soorten=badge.categorieen.map(c=>CATEGORIE_TEKST[c][lang==='uk'?0:1].toLowerCase()).join(', ');
  return lang==='uk'
    ?`Позначка на «${label}» означає: тут ${badge.aantal===1?'є 1 непрочитане сповіщення':`є непрочитані сповіщення — ${badgeLabel(lang,badge.aantal)}`} (${soorten}). Колір — вид сповіщення. Відкрийте, щоб виправити, або очистіть — позначка зникне.`
    :`De stip op «${label}» betekent: hier ${badge.aantal===1?'staat 1 ongelezen melding':`staan ongelezen meldingen — ${badgeLabel(lang,badge.aantal)}`} (${soorten}). De kleur is het soort melding. Open om het op te lossen, of ruim op — dan verdwijnt de stip.`;
}

export function MenuBadge({badge,stijl,knipper,herinner,onOpen}:{badge:Badge;stijl:BadgeStijl;knipper:boolean;herinner:boolean;onOpen?:(el:HTMLElement)=>void}){
  const getal=stijl==='getal';
  // Klik/tik op de stip: het venster met uitleg opent; het menu-item zelf navigeert dan NIET (stopPropagation + preventDefault).
  const klik=onOpen?(e:RMouseEvent<HTMLSpanElement>)=>{e.preventDefault();e.stopPropagation();onOpen(e.currentTarget)}:undefined;
  return <span className={`menu-badge${getal?' getal':' punt'}`} data-menu-badge={badge.item} data-categorie={badge.categorieen[0]} data-meer-categorieen={badge.categorieen.length>1?'ja':undefined} data-knipper={knipper?'ja':undefined} data-herinner={herinner?'ja':undefined} data-klik={onOpen?'ja':undefined} aria-hidden='true' onClick={klik}>{getal?badgeTekst(badge.aantal):null}</span>;
}

const tijd=(lang:Lang,op:number)=>{if(!op)return'';const s=Math.max(0,Math.round((Date.now()-op)/1000));if(s<60)return tr(lang,'щойно','zojuist');const m=Math.round(s/60);if(m<60)return tr(lang,`${m} хв тому`,`${m} min geleden`);const u=Math.round(m/60);if(u<48)return tr(lang,`${u} год тому`,`${u} u geleden`);return new Date(op).toLocaleDateString(lang==='uk'?'uk-UA':'nl-BE',{day:'numeric',month:'short'})};

type BellenProps={lang:Lang;label:string;badge:Badge;anker:DOMRect;onSluit:(m:MenuMelding)=>void;onOpen:(m:MenuMelding)=>void;onAllesWeg:()=>void;onBinnen:(binnen:boolean)=>void;onEsc:()=>void;paneelRef:(el:HTMLDivElement|null)=>void;
  /** Het menu-item waaraan het venster hangt: een tik daarop sluit het niet (dat doet het item zelf). */
  ankerEl?:HTMLElement|null};
export function MeldingBellen({lang,label,badge,anker,onSluit,onOpen,onAllesWeg,onBinnen,onEsc,paneelRef,ankerEl}:BellenProps){
  const ref=useRef<HTMLDivElement|null>(null);
  const[pos,setPos]=useState({left:anker.right+10,top:anker.top-6});
  useLayoutEffect(()=>{const el=ref.current;if(!el)return;const h=el.offsetHeight,w=el.offsetWidth;const top=Math.max(8,Math.min(anker.top-6,window.innerHeight-h-8)),left=Math.max(8,Math.min(anker.right+10,window.innerWidth-w-8));setPos({left,top})},[anker,badge.meldingen.length]);
  useEffect(()=>{paneelRef(ref.current);return()=>paneelRef(null)},[paneelRef]);
  // Tik/klik naast het venster (en naast het menu-item): dicht — ook op een aanraakscherm, waar geen «muis weg» bestaat.
  useEffect(()=>{const weg=(e:PointerEvent)=>{const doel=e.target as Node|null;if(!doel||ref.current?.contains(doel)||ankerEl?.contains(doel))return;onBinnen(false)};document.addEventListener('pointerdown',weg,true);return()=>document.removeEventListener('pointerdown',weg,true)},[ankerEl,onBinnen]);
  const toets=(e:RKeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onEsc()}};
  return <div ref={ref} className='menu-bellen' role='region' aria-label={`${label}: ${badgeLabel(lang,badge.aantal)}`} data-menu-bellen={badge.item} style={{left:pos.left,top:pos.top}} onPointerEnter={()=>onBinnen(true)} onPointerLeave={()=>onBinnen(false)} onFocus={()=>onBinnen(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))onBinnen(false)}} onKeyDown={toets}>
    <div className='menu-bellen-kop'><strong>{label}</strong><span>{badgeLabel(lang,badge.aantal)}</span></div>
    <p className='menu-bellen-uitleg' data-menu-bellen-uitleg='1'>{stipUitleg(lang,label,badge)}</p>
    {/* Legenda: de kleur van de stip is de soort melding (zelfde kleur als in de lijst hieronder). */}
    <div className='menu-bellen-legenda' aria-hidden='true'>{[...new Set(badge.meldingen.map((m)=>m.categorie))].map((c)=><span key={c} className='menu-bellen-legenda-item' data-categorie={c}><i/>{CATEGORIE_TEKST[c][lang==='uk'?0:1]}</span>)}</div>
    <ul>{badge.meldingen.map((m,i)=><li key={m.id} className='menu-bel' data-categorie={m.categorie} data-melding-id={m.id} style={{animationDelay:`${i*45}ms`}}>
      <span className='menu-bel-stip' aria-hidden='true'/>
      <div className='menu-bel-tekst'>
        <small>{CATEGORIE_TEKST[m.categorie][lang==='uk'?0:1]}{m.op?` · ${tijd(lang,m.op)}`:''}</small>
        <button type='button' className='menu-bel-titel' onClick={()=>onOpen(m)}>{m.titel||tr(lang,`Сповіщення: ${CATEGORIE_TEKST[m.categorie][0].toLowerCase()}`,`Melding: ${CATEGORIE_TEKST[m.categorie][1].toLowerCase()}`)}<ExternalLink aria-hidden='true'/></button>
        {m.tekst&&<p>{m.tekst}</p>}
        <div className='menu-bel-acties'>
          <button type='button' className='menu-bel-openen' data-menu-bel-openen='1' onClick={()=>onOpen(m)} aria-label={tr(lang,`Відкрити: ${m.titel}`,`Openen: ${m.titel}`)}>{tr(lang,'Відкрити','Openen')}<ExternalLink aria-hidden='true'/></button>
          <button type='button' className='menu-bel-weg' data-menu-bel-weg='1' aria-label={tr(lang,`Очистити: ${m.titel}`,`Opruimen: ${m.titel}`)} data-tooltip={tr(lang,'Позначити прочитаним — позначка зникне','Als gelezen markeren — de stip verdwijnt')} onClick={()=>onSluit(m)}>{tr(lang,'Очистити','Opruimen')}</button>
        </div>
      </div>
    </li>)}</ul>
    <div className='menu-bellen-voet'>
      <button type='button' className='menu-bellen-alles' data-menu-bellen-alles='1' onClick={onAllesWeg}>{badge.meldingen.length>1?tr(lang,'Очистити все тут','Alles hier opruimen'):tr(lang,'Очистити','Opruimen')}</button>
      <button type='button' className='menu-bellen-paneel' data-menu-bellen-paneel='1' onClick={()=>{window.dispatchEvent(new CustomEvent(MELDINGEN_OPENEN_EVENT));onEsc()}}><Bell aria-hidden='true'/>{tr(lang,'Усі сповіщення','Alle meldingen')}</button>
    </div>
  </div>;
}
