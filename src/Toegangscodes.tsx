// «Коди доступу для інших / Toegangscodes voor anderen» op id.tarasevych.com/methods (RUNBOOK §13.11). Alleen de eigenaar.
// Maken (sterke bevestiging): naam, privénotitie, scope uit de allowlist van de server (alleen lezen), verloop (безстроково / 1 год /
// 1 день / 7 днів / 30 днів / eigen datum en tijd), eenmalig of herbruikbaar met optioneel maximum. De code verschijnt één keer
// (kopiëren, QR, deellink). Lijst met status, verloop, gebruik, laatste gebruik en uitklapbare geschiedenis van elk gebruik en elke
// actie. Intrekken met reden (gastsessies meteen weg), verloop korter (vrij) of langer (sterke bevestiging). Alleen UA + NL.
import {useEffect,useMemo,useState} from 'react';
import {Check,ChevronDown,ChevronRight,Clock,Copy,History,KeyRound,Link2,Plus,Share2,Ticket,Users,X} from 'lucide-react';
import qrcode from 'qrcode-generator';
import {api} from './platform/client';
import {swrPost} from './lees-cache';
import {foutCode} from './platform/webauthn';
import {InfoTip} from './InfoTip';
import {NotitieVeld,RedenVeld,apparaatTekst,redenOk,tijdTekst,useNotities} from './ToegangContext';
import type {Lang} from './toegangslaag-teksten';

const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
type Scope={id:string;uk:string;nl:string};
type Log={soort:string;op:string;detail:Record<string,unknown>;apparaat:string|null;ipKort:string|null;sessie:string|null};
type Sessie={id:string;gestartOp:string;laatstActiefOp:string;verlooptOp:string;apparaat:string|null;ipKort:string|null;actief:boolean};
export type Code={id:string;naam:string;codeHint:string;scopes:string[];eenmalig:boolean;maxGebruik:number|null;gebruikt:number;verlooptOp:string|null;aangemaaktOp:string;
  laatstGebruiktOp:string|null;laatstApparaat:string|null;laatstIpKort:string|null;ingetrokkenOp:string|null;ingetrokkenReden:string|null;ingetrokkenDoor:string|null;
  status:'actief'|'gebruikt'|'verlopen'|'ingetrokken';geschiedenis:Log[];sessies:Sessie[]};
type Lijst={codes:Code[];scopes:Scope[];nooit:Array<{uk:string;nl:string}>;presets:string[]};
type Verloop={soort:'nooit'}|{soort:'preset';preset:string}|{soort:'datum';tot:string};

const STATUS:Record<Code['status'],[string,string,string]>={
  actief:['Діє','Actief','good'],gebruikt:['Використано','Gebruikt','muted'],verlopen:['Закінчився','Verlopen','muted'],ingetrokken:['Відкликано','Ingetrokken','warn'],
};
const PRESET:Record<string,[string,string]>={'1u':['1 година','1 uur'],'1d':['1 день','1 dag'],'7d':['7 днів','7 dagen'],'30d':['30 днів','30 dagen']};
const LOG:Record<string,[string,string]>={
  aangemaakt:['Код створено','Code gemaakt'],ingewisseld:['Гість увійшов із кодом','Gast kwam binnen met de code'],actie:['Гість переглянув','Gast bekeek'],
  geweigerd:['Відмовлено','Geweigerd'],gewijzigd:['Строк змінено','Verloop gewijzigd'],ingetrokken:['Код відкликано','Code ingetrokken'],
  'sessie-ingetrokken':['Гостьову сесію завершено','Gastsessie beëindigd'],uitgelogd:['Гість вийшов','Gast uitgelogd'],
};
const FOUT:Record<string,[string,string]>={
  NAAM_VEREIST:['Вкажіть назву, наприклад «Для Олени».','Geef een naam, bijvoorbeeld «Voor Olena».'],NAAM_TE_LANG:['Назва задовга (максимум 80 символів).','De naam is te lang (maximaal 80 tekens).'],
  SCOPE_VEREIST:['Оберіть, що людина зможе переглядати.','Kies wat de persoon mag bekijken.'],SCOPE_NIET_TOEGESTAAN:['Такий доступ не дозволено.','Deze toegang is niet toegestaan.'],
  VERLOOP_TE_KORT:['Дата має бути щонайменше через 5 хвилин.','De datum moet minstens 5 minuten in de toekomst liggen.'],VERLOOP_TE_LANG:['Не довше ніж на рік.','Niet langer dan een jaar.'],
  VERLOOP_ONGELDIG:['Оберіть строк дії.','Kies een geldigheid.'],MAX_GEBRUIK_ONGELDIG:['Кількість використань: від 1 до 1000.','Aantal keer: van 1 tot 1000.'],
  TE_VEEL_CODES:['Забагато активних кодів (максимум 50). Відкличте непотрібні.','Te veel actieve codes (maximaal 50). Trek overbodige in.'],
  STEP_UP_STRONG_REQUIRED:['Потрібне підтвердження passkey, кодом із застосунку або кодом відновлення.','Bevestiging met passkey, app-code of herstelcode is nodig.'],
  STEP_UP_REQUIRED:['Потрібне додаткове підтвердження.','Extra bevestiging is nodig.'],REDEN_TE_KORT:['Причина: щонайменше 10 символів.','Reden: minstens 10 tekens.'],
  AL_INGETROKKEN:['Код уже відкликано.','De code is al ingetrokken.'],RATE_LIMITED:['Забагато спроб. Зачекайте.','Te veel pogingen. Even wachten.'],
};
const foutTekst=(lang:Lang,c:string)=>FOUT[c]?tr(lang,FOUT[c][0],FOUT[c][1]):tr(lang,`Не вдалося (${c||'немає зв’язку'}).`,`Mislukt (${c||'geen verbinding'}).`);
const lokaal=(d:Date)=>{const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
const scopeTekst=(lang:Lang,scopes:Scope[],id:string)=>{const s=scopes.find(x=>x.id===id);return s?tr(lang,s.uk,s.nl):id;};
const gebruikTekst=(lang:Lang,c:Code)=>{const max=c.eenmalig?1:c.maxGebruik;return max?tr(lang,`${c.gebruikt} з ${max}`,`${c.gebruikt} van ${max}`):tr(lang,`${c.gebruikt} раз(и)`,`${c.gebruikt}×`);};

/** QR als SVG-paden (geen innerHTML). */
function Qr({tekst,label}:{tekst:string;label:string}){
  const pad=useMemo(()=>{const q=qrcode(0,'M');q.addData(tekst);q.make();const n=q.getModuleCount();let d='';for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))d+=`M${c+4} ${r+4}h1v1h-1z`;return{d,n:n+8};},[tekst]);
  return <svg className='toegangscode-qr' viewBox={`0 0 ${pad.n} ${pad.n}`} role='img' aria-label={label} shapeRendering='crispEdges'><rect width={pad.n} height={pad.n} fill='#fff'/><path d={pad.d} fill='#000'/></svg>;
}

function VerloopKiezer({lang,waarde,zet,presets,metNooit=true,groep='verloop'}:{lang:Lang;waarde:Verloop;zet:(v:Verloop)=>void;presets:string[];metNooit?:boolean;groep?:string}){
  const min=lokaal(new Date(Date.now()+6*60000)),max=lokaal(new Date(Date.now()+365*86400000));
  return <div className='toegangscode-verloop' role='radiogroup' aria-label={tr(lang,'Строк дії','Geldigheid')}>
    {metNooit&&<label><input type='radio' name={groep} checked={waarde.soort==='nooit'} onChange={()=>zet({soort:'nooit'})}/>{tr(lang,'Безстроково','Onbeperkt')}</label>}
    {presets.map(p=><label key={p}><input type='radio' name={groep} checked={waarde.soort==='preset'&&waarde.preset===p} onChange={()=>zet({soort:'preset',preset:p})}/>{PRESET[p]?tr(lang,PRESET[p][0],PRESET[p][1]):p}</label>)}
    <label><input type='radio' name={groep} checked={waarde.soort==='datum'} onChange={()=>zet({soort:'datum',tot:lokaal(new Date(Date.now()+86400000))})}/>{tr(lang,'Своя дата й час','Eigen datum en tijd')}</label>
    {waarde.soort==='datum'&&<input type='datetime-local' data-verloop-datum min={min} max={max} value={waarde.tot} onChange={e=>zet({soort:'datum',tot:e.target.value})} aria-label={tr(lang,'Діє до','Geldig tot')}/>}
  </div>;
}
const verloopVoorServer=(v:Verloop)=>v.soort==='datum'?{soort:'datum',tot:new Date(v.tot).toISOString()}:v;

export function Toegangscodes({lang,context}:{lang:Lang;context:Record<string,unknown>}){
  const[data,setData]=useState<Lijst|null>(null);
  const[geenToegang,setGeenToegang]=useState(false);
  const[fout,setFout]=useState('');
  const[bezig,setBezig]=useState('');
  const[nieuw,setNieuw]=useState<null|{naam:string;notitie:string;scopes:string[];verloop:Verloop;gebruik:'eenmalig'|'herbruikbaar';max:string}>(null);
  const[getoond,setGetoond]=useState<null|{code:string;link:string;naam:string}>(null);
  const[melding,setMelding]=useState('');
  const notities=useNotities(context);
  // Fase B1: bewaarde lijst meteen tonen, dan vers ophalen (alleen geheugen, per account); afbreken als de pagina verdwijnt.
  const laden=async(o:{signal?:AbortSignal;alleenVers?:boolean}={alleenVers:true})=>{try{await swrPost<Lijst&{beschikbaar?:boolean}>('/api/owner/access/toegangscodes/lijst',context,d=>{if(d.beschikbaar===false){setGeenToegang(true);return;}setData(d);},o);}catch(c){if(foutCode(c)==='OWNER_REQUIRED')setGeenToegang(true);else setFout(foutTekst(lang,foutCode(c)));}};
  useEffect(()=>{const a=new AbortController();void laden({signal:a.signal});return()=>a.abort();},[]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(location.hash==='#toegangscodes'&&data)window.setTimeout(()=>document.getElementById('toegangscodes')?.scrollIntoView({block:'start'}),80);},[!!data]);// eslint-disable-line react-hooks/exhaustive-deps
  if(geenToegang)return null;
  const maken=async()=>{
    if(!nieuw)return;
    setBezig('maken');setFout('');
    try{
      const r=(await api.post('/api/owner/access/toegangscodes/maken',{...context,naam:nieuw.naam,notitie:nieuw.notitie,scopes:nieuw.scopes,verloop:verloopVoorServer(nieuw.verloop),eenmalig:nieuw.gebruik==='eenmalig',maxGebruik:nieuw.gebruik==='herbruikbaar'&&nieuw.max?Number(nieuw.max):null})).data as {code:string;link:string;item:Code};
      setGetoond({code:r.code,link:r.link,naam:r.item.naam});setNieuw(null);await notities.laden();await laden();
    }catch(c){setFout(foutTekst(lang,foutCode(c)));}
    finally{setBezig('');}
  };
  const kopieer=async(t:string,wat:string)=>{try{await navigator.clipboard.writeText(t);setMelding(wat);}catch{setMelding(tr(lang,'Не вдалося скопіювати — виділіть і скопіюйте вручну.','Kopiëren mislukt — selecteer en kopieer handmatig.'));}};
  const delen=async()=>{if(!getoond)return;try{await navigator.share({title:getoond.naam,text:tr(lang,`Код доступу: ${getoond.code}`,`Toegangscode: ${getoond.code}`),url:getoond.link});}catch{/* geannuleerd */}};
  const kanMaken=!!nieuw&&nieuw.naam.trim().length>0&&nieuw.scopes.length>0&&(nieuw.gebruik==='eenmalig'||!nieuw.max||(/^\d+$/.test(nieuw.max)&&Number(nieuw.max)>=1&&Number(nieuw.max)<=1000));
  return <section className='access-plane-section' id='toegangscodes' data-access-section='toegangscodes'>
    <header className='access-plane-section-head'><h2>{tr(lang,'Коди доступу для інших','Toegangscodes voor anderen')}</h2>
      <InfoTip label={tr(lang,'Про коди доступу','Over toegangscodes')}><p>{tr(lang,'Дайте іншій людині обмежений доступ лише для перегляду. Вона вводить код на id.tarasevych.com/toegang і отримує окрему гостьову сесію — не ваш акаунт. Код показується один раз; ви бачите кожне використання й можете будь-коли відкликати.','Geef iemand anders beperkte toegang, alleen om te bekijken. Die persoon voert de code in op id.tarasevych.com/toegang en krijgt een aparte gastsessie — niet uw account. De code wordt één keer getoond; u ziet elk gebruik en kunt altijd intrekken.')}</p></InfoTip></header>
    <div className='access-plane-box'>
      {fout&&<p className='access-plane-warn' role='alert'>{fout}</p>}
      {melding&&<p className='access-plane-notice' role='status'>{melding}</p>}
      {getoond&&<div className='access-plane-subrow toegangscode-getoond' data-code-getoond>
        <strong>{tr(lang,`Код для «${getoond.naam}» — показано лише один раз`,`Code voor «${getoond.naam}» — wordt maar één keer getoond`)}</strong>
        <div className='toegangscode-getoond-inhoud'>
          <Qr tekst={getoond.link} label={tr(lang,'QR-код із посиланням','QR-code met de link')}/>
          <div>
            <code className='access-plane-mono toegangscode-code' data-code>{getoond.code}</code>
            <small>{tr(lang,'Людина відкриває посилання або вводить код на id.tarasevych.com/toegang. Ми зберігаємо лише відбиток коду — пізніше його не показати.','De persoon opent de link of voert de code in op id.tarasevych.com/toegang. We bewaren alleen een vingerafdruk van de code — later tonen kan niet.')}</small>
            <div className='access-plane-actions'>
              <button type='button' onClick={()=>void kopieer(getoond.code,tr(lang,'Код скопійовано.','Code gekopieerd.'))}><Copy/>{tr(lang,'Копіювати код','Code kopiëren')}</button>
              <button type='button' className='secondary' onClick={()=>void kopieer(getoond.link,tr(lang,'Посилання скопійовано.','Link gekopieerd.'))}><Link2/>{tr(lang,'Копіювати посилання','Link kopiëren')}</button>
              {typeof navigator.share==='function'&&<button type='button' className='secondary' onClick={()=>void delen()}><Share2/>{tr(lang,'Поділитися','Delen')}</button>}
              <button type='button' className='secondary' onClick={()=>{setGetoond(null);setMelding('');}}><Check/>{tr(lang,'Готово','Klaar')}</button>
            </div>
          </div>
        </div>
      </div>}
      {!nieuw&&!getoond&&<div className='access-plane-row'>
        <Ticket className='access-plane-row-icon'/>
        <div className='access-plane-row-main'><span className='access-plane-row-title'><strong>{tr(lang,'Обмежений доступ для іншої людини','Beperkte toegang voor iemand anders')}</strong></span>
          <small>{tr(lang,'Лише перегляд вибраних розділів. Ніколи: способи входу, ключі, права, адміністрування, токени, оновлення сервера, видалення чи експорт.','Alleen bekijken van gekozen onderdelen. Nooit: aanmeldmethoden, sleutels, rechten, beheer, tokens, serverupdates, verwijderen of exporteren.')}</small></div>
        <div className='access-plane-row-actions'><button type='button' disabled={!data} onClick={()=>{setFout('');setNieuw({naam:'',notitie:'',scopes:[],verloop:{soort:'preset',preset:'7d'},gebruik:'herbruikbaar',max:''});}}><Plus/>{tr(lang,'Створити код доступу','Toegangscode maken')}</button></div>
      </div>}
      {nieuw&&data&&<form className='access-plane-subrow toegangscode-form' data-code-form onSubmit={e=>{e.preventDefault();void maken();}}>
        <label htmlFor='toegangscode-naam'>{tr(lang,'Назва','Naam')}</label>
        <input id='toegangscode-naam' autoFocus maxLength={80} value={nieuw.naam} placeholder={tr(lang,'Наприклад: Для Олени','Bijvoorbeeld: Voor Olena')} onChange={e=>setNieuw({...nieuw,naam:e.target.value})}/>
        <label htmlFor='toegangscode-notitie'>{tr(lang,'Приватна нотатка (бачите лише ви)','Privénotitie (alleen u ziet dit)')}</label>
        <textarea id='toegangscode-notitie' data-concept='toegangscode-notitie' rows={2} maxLength={500} value={nieuw.notitie} onChange={e=>setNieuw({...nieuw,notitie:e.target.value})}/>
        <fieldset><legend>{tr(lang,'Що людина зможе переглядати','Wat de persoon mag bekijken')}</legend>
          {data.scopes.map(s=><label key={s.id} className='toegangscode-scope'><input type='checkbox' data-scope={s.id} checked={nieuw.scopes.includes(s.id)} onChange={e=>setNieuw({...nieuw,scopes:e.target.checked?[...nieuw.scopes,s.id]:nieuw.scopes.filter(x=>x!==s.id)})}/>{tr(lang,s.uk,s.nl)}</label>)}
          <small className='toegangscode-nooit'><strong>{tr(lang,'Ніколи не доступно гостю:','Nooit beschikbaar voor een gast:')}</strong> {data.nooit.map(n=>tr(lang,n.uk,n.nl)).join(' · ')}</small>
        </fieldset>
        <fieldset><legend>{tr(lang,'Строк дії','Geldigheid')}</legend><VerloopKiezer lang={lang} waarde={nieuw.verloop} zet={v=>setNieuw({...nieuw,verloop:v})} presets={data.presets}/></fieldset>
        <fieldset><legend>{tr(lang,'Використання','Gebruik')}</legend>
          <label><input type='radio' name='gebruik' checked={nieuw.gebruik==='eenmalig'} onChange={()=>setNieuw({...nieuw,gebruik:'eenmalig'})}/>{tr(lang,'Одноразовий','Eenmalig')}</label>
          <label><input type='radio' name='gebruik' checked={nieuw.gebruik==='herbruikbaar'} onChange={()=>setNieuw({...nieuw,gebruik:'herbruikbaar'})}/>{tr(lang,'Багаторазовий до закінчення строку','Herbruikbaar tot het verloopt')}</label>
          {nieuw.gebruik==='herbruikbaar'&&<label className='toegangscode-max'>{tr(lang,'Не більше ніж (необов’язково):','Maximaal (optioneel):')}<input type='number' min={1} max={1000} inputMode='numeric' value={nieuw.max} onChange={e=>setNieuw({...nieuw,max:e.target.value})}/>{tr(lang,'разів','keer')}</label>}
        </fieldset>
        <small className='access-plane-hint-line'>{tr(lang,'Далі потрібне підтвердження passkey, кодом із застосунку або кодом відновлення.','Daarna is bevestiging met passkey, app-code of herstelcode nodig.')}</small>
        <div className='access-plane-actions'>
          <button type='submit' disabled={!!bezig||!kanMaken}><KeyRound/>{bezig==='maken'?tr(lang,'Створення…','Bezig…'):tr(lang,'Створити код','Code maken')}</button>
          <button type='button' className='secondary' onClick={()=>setNieuw(null)}><X/>{tr(lang,'Скасувати','Annuleren')}</button>
        </div>
      </form>}
      {data?.codes.map(c=><CodeRij key={c.id} lang={lang} c={c} scopes={data.scopes} presets={data.presets} context={context} notities={notities} onChange={()=>laden()}/>)}
      {data&&!data.codes.length&&!nieuw&&!getoond&&<p className='access-plane-hint-line'>{tr(lang,'Ще немає кодів доступу.','Nog geen toegangscodes.')}</p>}
    </div>
  </section>;
}

function CodeRij({lang,c,scopes,presets,context,notities,onChange}:{lang:Lang;c:Code;scopes:Scope[];presets:string[];context:Record<string,unknown>;notities:ReturnType<typeof useNotities>;onChange:()=>Promise<void>}){
  const[modus,setModus]=useState<''|'intrekken'|'verloop'>('');
  const[reden,setReden]=useState('');
  const[verloop,setVerloop]=useState<Verloop>({soort:'preset',preset:'1d'});
  const[open,setOpen]=useState(false);
  const[bezig,setBezig]=useState(false);
  const[fout,setFout]=useState('');
  const st=STATUS[c.status];
  const actieveSessies=c.sessies.filter(s=>s.actief).length;
  const doe=async(pad:string,body:Record<string,unknown>)=>{setBezig(true);setFout('');try{await api.post(pad,{...context,...body});setModus('');setReden('');await onChange();}catch(e){setFout(foutTekst(lang,foutCode(e)));}finally{setBezig(false);}};
  const huidig=c.verlooptOp?new Date(c.verlooptOp).getTime():null;
  const nieuwMs=verloop.soort==='nooit'?null:verloop.soort==='preset'?Date.now()+({'1u':3600e3,'1d':86400e3,'7d':7*86400e3,'30d':30*86400e3}[verloop.preset]||0):new Date(verloop.tot).getTime();
  const verlenging=huidig!==null&&(nieuwMs===null||nieuwMs>huidig);
  return <div className='access-plane-row toegangscode-rij' data-toegangscode={c.id} data-status={c.status}>
    <Ticket className='access-plane-row-icon'/>
    <div className='access-plane-row-main'>
      <span className='access-plane-row-title'><strong>{c.naam}</strong><span className={`access-plane-badge tone-${st[2]}`} data-code-status>{tr(lang,st[0],st[1])}</span>
        <small className='access-plane-mono'>••••-{c.codeHint}</small></span>
      <small>{c.scopes.map(s=>scopeTekst(lang,scopes,s)).join(' · ')}</small>
      <small data-code-info><Clock aria-hidden='true'/>{c.verlooptOp?tr(lang,`Діє до ${tijdTekst(lang,c.verlooptOp)}`,`Geldig tot ${tijdTekst(lang,c.verlooptOp)}`):tr(lang,'Безстроково','Onbeperkt')}
        {' · '}{c.eenmalig?tr(lang,'одноразовий','eenmalig'):tr(lang,'багаторазовий','herbruikbaar')}{' · '}{tr(lang,'використано ','gebruikt ')}{gebruikTekst(lang,c)}
        {actieveSessies>0&&<> · <Users aria-hidden='true'/>{tr(lang,`активних гостьових сесій: ${actieveSessies}`,`actieve gastsessies: ${actieveSessies}`)}</>}</small>
      {c.laatstGebruiktOp&&<small data-code-laatst>{tr(lang,'Останнє використання: ','Laatst gebruikt: ')}{tijdTekst(lang,c.laatstGebruiktOp)} · {apparaatTekst(lang,c.laatstApparaat)}{c.laatstIpKort?` · IP #${c.laatstIpKort}`:''}</small>}
      {c.ingetrokkenOp&&<small className='access-plane-warn'>{tr(lang,'Відкликано ','Ingetrokken op ')}{tijdTekst(lang,c.ingetrokkenOp)}{c.ingetrokkenDoor?` · ${c.ingetrokkenDoor}`:''}{c.ingetrokkenReden?` — ${c.ingetrokkenReden}`:''}</small>}
      <NotitieVeld lang={lang} soort='toegangscode' sleutel={c.id} notities={notities}/>
      {modus==='intrekken'&&<div className='access-plane-confirm' role='group' data-bevestig='code-intrekken'>
        <span>{tr(lang,`Відкликати «${c.naam}»? Усі гостьові сесії з цим кодом завершаться одразу.`,`«${c.naam}» intrekken? Alle gastsessies met deze code eindigen meteen.`)}</span>
        <RedenVeld lang={lang} id={`reden-code-${c.id}`} waarde={reden} zet={setReden} disabled={bezig}/>
        <div className='access-plane-actions'>
          <button type='button' className='danger' disabled={bezig||!redenOk(reden)} onClick={()=>void doe('/api/owner/access/toegangscodes/intrekken',{id:c.id,reden})}><X/>{tr(lang,'Відкликати код','Code intrekken')}</button>
          <button type='button' className='secondary' onClick={()=>setModus('')}>{tr(lang,'Скасувати','Annuleren')}</button>
        </div>
      </div>}
      {modus==='verloop'&&<div className='access-plane-confirm' role='group' data-bevestig='code-verloop'>
        <VerloopKiezer lang={lang} waarde={verloop} zet={setVerloop} presets={presets} groep={`verloop-${c.id}`}/>
        <small className='access-plane-hint-line'>{verlenging?tr(lang,'Це продовження: потрібне підтвердження passkey, кодом із застосунку або кодом відновлення.','Dit is een verlenging: bevestiging met passkey, app-code of herstelcode is nodig.'):tr(lang,'Скоротити строк можна без додаткового підтвердження; активні гостьові сесії теж скоротяться.','Inkorten kan zonder extra bevestiging; actieve gastsessies worden ook korter.')}</small>
        <div className='access-plane-actions'>
          <button type='button' disabled={bezig} onClick={()=>void doe('/api/owner/access/toegangscodes/wijzigen',{id:c.id,verloop:verloopVoorServer(verloop)})}><Check/>{tr(lang,'Зберегти строк','Geldigheid opslaan')}</button>
          <button type='button' className='secondary' onClick={()=>setModus('')}>{tr(lang,'Скасувати','Annuleren')}</button>
        </div>
      </div>}
      {fout&&<small className='toegang-fout' role='alert'>{fout}</small>}
      {c.geschiedenis.length>0&&<div className='toegang-geschiedenis' data-code-geschiedenis={c.id}>
        <button type='button' className='toegang-uitklap' aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<ChevronDown/>:<ChevronRight/>}<History/>{tr(lang,`Історія (${c.geschiedenis.length})`,`Geschiedenis (${c.geschiedenis.length})`)}</button>
        {open&&<ol className='toegang-geschiedenis-lijst'>{c.geschiedenis.map((g,i)=>{const t=LOG[g.soort];const d=g.detail||{};return <li key={`${g.op}-${i}`} data-soort={g.soort==='ingetrokken'||g.soort==='geweigerd'?`code-${g.soort}`:g.soort}>
          <strong>{t?tr(lang,t[0],t[1]):g.soort}</strong>
          {g.soort==='actie'&&typeof d.scope==='string'?<span>: {scopeTekst(lang,scopes,d.scope)}</span>:null}
          {g.soort==='geweigerd'?<span>: {typeof d.wat==='string'?d.wat:typeof d.reden==='string'?d.reden:''}</span>:null}
          {g.soort==='ingetrokken'&&typeof d.reden==='string'?<span> — {d.reden}</span>:null}
          {g.soort==='gewijzigd'?<span>: {d.naar?tijdTekst(lang,String(d.naar)):tr(lang,'безстроково','onbeperkt')}</span>:null}
          <small>{tijdTekst(lang,g.op)} · {apparaatTekst(lang,g.apparaat)}{g.ipKort?` · IP #${g.ipKort}`:''}{g.sessie?` · ${tr(lang,'сесія','sessie')} ${g.sessie}…`:''}</small>
        </li>;})}</ol>}
      </div>}
    </div>
    {/* ID-05: een verlopen code heeft geen acties meer (niets te verlengen of in te trekken); alleen actief/gebruikt. */}
    {c.status==='verlopen'&&!modus&&<p className='access-plane-hint-line' data-code-verlopen={c.id}>{tr(lang,'Строк минув — код більше не діє. Створіть новий код, якщо доступ ще потрібен.','Verlopen — de code werkt niet meer. Maak een nieuwe code als toegang nog nodig is.')}</p>}
    {c.status!=='ingetrokken'&&c.status!=='verlopen'&&!modus&&<div className='access-plane-row-actions'>
      <button type='button' className='secondary' disabled={bezig} onClick={()=>{setFout('');setModus('verloop');}}><Clock/>{tr(lang,'Змінити строк','Geldigheid wijzigen')}</button>
      <button type='button' className='secondary' disabled={bezig} onClick={()=>{setFout('');setReden('');setModus('intrekken');}}><X/>{tr(lang,'Відкликати','Intrekken')}</button>
    </div>}
  </div>;
}
