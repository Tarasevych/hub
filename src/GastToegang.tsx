// Gastpagina id.tarasevych.com/toegang (RUNBOOK §13.11). Iemand die van de eigenaar een toegangscode kreeg, voert die hier in (of
// opent de deellink …/toegang#code=…; het fragment gaat nooit naar de server en wordt meteen uit de adresbalk gehaald). De server geeft
// een APARTE gastsessie (cookie alleen voor /api/gast, HttpOnly) — nooit het account van de eigenaar. Bovenaan altijd de banner
// «Гостьовий доступ від … до …»; alleen de onderdelen die de code toestaat (alleen lezen). Alleen UA + NL.
import {useEffect,useState,type ReactElement} from 'react';
import {Clock,Cpu,History,KeyRound,LogOut,ShieldCheck,User} from 'lucide-react';
import './gast.css';

type Lang='uk'|'nl';
const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
type Sessie={eigenaar:string;code:string;scopes:string[];sinds?:string;tot:string};
type Apparaat={naam:string;platform:string;laatstGezien:string|null;actief:boolean;sinds:string|null};
type JItem={op:string;actie:string;soort:string;resultaat:string;naam:string};
const tijd=(lang:Lang,v?:string|null)=>v?new Date(v).toLocaleString(lang==='uk'?'uk-UA':'nl-BE',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const taalVan=():Lang=>{try{const q=new URLSearchParams(location.search).get('lang');if(q==='nl'||q==='uk')return q;const c=document.cookie.split('; ').find(x=>x.startsWith('tsv_ecosystem_preferences='));if(c){const v=JSON.parse(decodeURIComponent(c.split('=').slice(1).join('=')));
// Taal staat per ACCOUNT (punt 2, 20.10.2026): accounts['<account>'].taal; een gastpagina hoort bij geen account, dus 'anon'
// (met de hint van dit tabblad als die er is). Oude cookie (zonder versie 3): nog de ene gedeelde waarde.
const hint=sessionStorage.getItem('tsv-weergave-account')||'',account=/^(anon|u-[a-f0-9]{8})$/.test(hint)?hint:'anon';
const taal=Number(v.versie)===3?(v.accounts||{})[account]?.taal:v.lang;if(taal==='nl'||taal==='uk')return taal;}}catch{/* standaard */}return navigator.language?.toLowerCase().startsWith('nl')?'nl':'uk';};
async function post(pad:string,body:unknown={}){
  const r=await fetch(pad,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let data:Record<string,any>={};try{data=await r.json();}catch{/* leeg */}
  return{status:r.status,data};
}
const FOUT:Record<string,[string,string]>={
  CODE_ONGELDIG:['Код недійсний, уже використаний, відкликаний або строк його дії минув.','De code is ongeldig, al gebruikt, ingetrokken of verlopen.'],
  GAST_GEBLOKKEERD:['Забагато невдалих спроб із цієї мережі. Спробуйте пізніше.','Te veel mislukte pogingen vanaf dit netwerk. Probeer het later opnieuw.'],
  RATE_LIMITED:['Забагато спроб. Зачекайте хвилину.','Te veel pogingen. Wacht een minuut.'],
  GAST_GEEN_TOEGANG:['Цей розділ вам не відкрито.','Dit onderdeel is niet voor u opengezet.'],
};
const SCOPE:Record<string,{uk:string;nl:string;icoon:ReactElement}>={
  'profiel.lezen':{uk:'Профіль',nl:'Profiel',icoon:<User/>},
  'apparaten.lezen':{uk:'Пристрої та агенти',nl:'Apparaten en agents',icoon:<Cpu/>},
  'journaal.lezen':{uk:'Журнал агентів',nl:'Journaal van agents',icoon:<History/>},
};
const SOORT:Record<string,[string,string]>={ai:['Підключення ШІ','AI-koppeling'],apparaat:['Пристрій','Apparaat'],browser:['Браузер','Browser'],toestemming:['Дозвіл','Toestemming'],noodstop:['Аварійна зупинка','Noodstop'],hulpmiddelen:['Інструменти','Hulpmiddelen']};

export default function GastToegang(){
  const[lang,setLang]=useState<Lang>(taalVan);
  const[sessie,setSessie]=useState<Sessie|null>(null);
  const[laden,setLaden]=useState(true);
  const[code,setCode]=useState('');
  const[fout,setFout]=useState('');
  const[bezig,setBezig]=useState(false);
  const[actief,setActief]=useState('');
  const[inhoud,setInhoud]=useState<Record<string,unknown>>({});
  const[weg,setWeg]=useState(false);
  useEffect(()=>{document.documentElement.lang=lang==='uk'?'uk':'nl';document.title=tr(lang,'Гостьовий доступ — Mijn Ruimte','Gasttoegang — Mijn Ruimte');},[lang]);
  useEffect(()=>{
    // Deellink: #code=… invullen en meteen uit de adresbalk (en geschiedenis) halen.
    const m=/^#code=([0-9A-Za-z-]{16,24})$/.exec(location.hash||'');
    if(m){setCode(m[1].toUpperCase());history.replaceState(null,'',location.pathname+location.search);}
    void(async()=>{const r=await post('/api/gast/sessie').catch(()=>({status:0,data:{}}));if(r.status===200)setSessie(r.data as Sessie);setLaden(false);})();
  },[]);
  useEffect(()=>{if(sessie&&!actief&&sessie.scopes.length)setActief(sessie.scopes[0]);},[sessie,actief]);
  // Intrekken/verlopen ook zonder klikken zichtbaar maken: elke 20 s (en bij terugkeren naar het tabblad) de sessie controleren.
  useEffect(()=>{if(!sessie)return;const kijk=async()=>{const r=await post('/api/gast/sessie').catch(()=>({status:0,data:{}}));if(r.status===401){setSessie(null);setInhoud({});setActief('');setWeg(true);}};
    const t=window.setInterval(()=>{void kijk();},20000);const z=()=>{if(document.visibilityState==='visible')void kijk();};document.addEventListener('visibilitychange',z);
    return()=>{window.clearInterval(t);document.removeEventListener('visibilitychange',z);};},[!!sessie]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!sessie||!actief||inhoud[actief])return;void(async()=>{const r=await post('/api/gast/bekijk',{scope:actief});if(r.status===200)setInhoud(i=>({...i,[actief]:r.data.data}));else if(r.status===401){setSessie(null);setInhoud({});setActief('');setWeg(true);}else setFout(foutTekst(String(r.data.error||'')));})();},[sessie,actief]);// eslint-disable-line react-hooks/exhaustive-deps
  const foutTekst=(c:string)=>FOUT[c]?tr(lang,FOUT[c][0],FOUT[c][1]):tr(lang,`Не вдалося (${c||'немає зв’язку'}).`,`Mislukt (${c||'geen verbinding'}).`);
  const inwisselen=async()=>{
    setBezig(true);setFout('');setWeg(false);
    const r=await post('/api/gast/inwisselen',{code}).catch(()=>({status:0,data:{}}));
    setBezig(false);
    if(r.status===200){setCode('');setInhoud({});setActief('');const s=await post('/api/gast/sessie');if(s.status===200)setSessie(s.data as Sessie);}
    else setFout(foutTekst(String((r.data as Record<string,unknown>).error||(r.status===429?'RATE_LIMITED':''))));
  };
  const uitloggen=async()=>{await post('/api/gast/uitloggen').catch(()=>undefined);setSessie(null);setInhoud({});setActief('');};
  const taalKnop=<button type='button' className='gast-taal' onClick={()=>setLang(lang==='uk'?'nl':'uk')} aria-label={tr(lang,'Мова: українська. Перемкнути на нідерландську','Taal: Nederlands. Wissel naar Oekraïens')}>{lang==='uk'?'NL':'UA'}</button>;
  if(laden)return <main className='gast'><p className='gast-laden'>{tr(lang,'Завантаження…','Laden…')}</p></main>;
  if(!sessie)return <main className='gast'>
    <section className='gast-kaart' data-gast-inwisselen>
      <header><KeyRound aria-hidden='true'/><h1>{tr(lang,'Гостьовий доступ','Gasttoegang')}</h1>{taalKnop}</header>
      <p>{tr(lang,'Введіть код доступу, який вам дав власник. Ви отримаєте окрему гостьову сесію лише для перегляду — це не вхід у чужий акаунт.','Voer de toegangscode in die u van de eigenaar kreeg. U krijgt een aparte gastsessie, alleen om te bekijken — u logt niet in op iemands account.')}</p>
      {weg&&<p className='gast-melding' role='status'>{tr(lang,'Гостьову сесію завершено: код відкликано або строк дії минув.','De gastsessie is beëindigd: de code is ingetrokken of verlopen.')}</p>}
      <form onSubmit={e=>{e.preventDefault();void inwisselen();}}>
        <label htmlFor='gast-code'>{tr(lang,'Код доступу','Toegangscode')}</label>
        <input id='gast-code' autoFocus autoComplete='off' autoCapitalize='characters' spellCheck={false} inputMode='text' maxLength={24} placeholder='XXXX-XXXX-XXXX-XXXX' value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/>
        <button type='submit' disabled={bezig||code.replace(/[\s-]/g,'').length<16}>{bezig?tr(lang,'Перевірка…','Controleren…'):tr(lang,'Увійти як гість','Doorgaan als gast')}</button>
      </form>
      {fout&&<p className='gast-fout' role='alert'>{fout}</p>}
      <small>{tr(lang,'Кількість спроб обмежено. Код показують лише один раз — попросіть новий, якщо цей не працює.','Het aantal pogingen is beperkt. Een code wordt maar één keer getoond — vraag een nieuwe als deze niet werkt.')}</small>
    </section>
  </main>;
  const data=inhoud[actief] as Record<string,any>|undefined;
  return <main className='gast'>
    <div className='gast-banner' role='status' data-gast-banner>
      <ShieldCheck aria-hidden='true'/>
      <span><strong>{tr(lang,`Гостьовий доступ від ${sessie.eigenaar} до ${tijd(lang,sessie.tot)}`,`Gasttoegang van ${sessie.eigenaar} tot ${tijd(lang,sessie.tot)}`)}</strong>
        <small>{tr(lang,`Код «${sessie.code}» · лише перегляд · усі дії бачить власник`,`Code «${sessie.code}» · alleen bekijken · de eigenaar ziet alle acties`)}</small></span>
      {taalKnop}
      <button type='button' className='gast-uit' onClick={()=>void uitloggen()}><LogOut aria-hidden='true'/>{tr(lang,'Вийти','Afmelden')}</button>
    </div>
    <nav className='gast-tabs' role='tablist'>
      {sessie.scopes.map(s=><button key={s} type='button' role='tab' aria-selected={actief===s} data-gast-tab={s} onClick={()=>{setFout('');setActief(s);}}>{SCOPE[s]?.icoon}{SCOPE[s]?tr(lang,SCOPE[s].uk,SCOPE[s].nl):s}</button>)}
    </nav>
    {fout&&<p className='gast-fout' role='alert'>{fout}</p>}
    <section className='gast-inhoud' data-gast-inhoud={actief}>
      {!data?<p className='gast-laden'>{tr(lang,'Завантаження…','Laden…')}</p>
      :actief==='profiel.lezen'?<div className='gast-profiel'>{data.foto?<img src={String(data.foto)} alt='' referrerPolicy='no-referrer'/>:<User aria-hidden='true'/>}<strong>{String(data.naam||sessie.eigenaar)}</strong></div>
      :actief==='apparaten.lezen'?(data.apparaten?.length?<ul className='gast-lijst'>{(data.apparaten as Apparaat[]).map((a,i)=><li key={i}><Cpu aria-hidden='true'/><span><strong>{a.naam||'—'}</strong><small>{a.platform} · {a.actief?tr(lang,'активний','actief'):tr(lang,'неактивний','niet actief')} · {tr(lang,'остання активність ','laatst actief ')}{tijd(lang,a.laatstGezien)}</small></span></li>)}</ul>:<p>{tr(lang,'Немає підключених пристроїв.','Geen gekoppelde apparaten.')}</p>)
      :actief==='journaal.lezen'?(data.items?.length?<ol className='gast-lijst'>{(data.items as JItem[]).map((j,i)=><li key={i}><Clock aria-hidden='true'/><span><strong>{SOORT[j.soort]?tr(lang,SOORT[j.soort][0],SOORT[j.soort][1]):j.soort}{j.naam?` · ${j.naam}`:''}</strong><small>{tijd(lang,j.op)} · {j.actie}</small></span></li>)}</ol>:<p>{tr(lang,'Журнал порожній.','Het journaal is leeg.')}</p>)
      :null}
    </section>
    <p className='gast-voet'>{tr(lang,'Ви бачите лише те, що дозволив власник. Налаштування, ключі, адміністрування й інші розділи гостю недоступні.','U ziet alleen wat de eigenaar toestaat. Instellingen, sleutels, beheer en andere onderdelen zijn niet beschikbaar voor gasten.')}</p>
  </main>;
}
