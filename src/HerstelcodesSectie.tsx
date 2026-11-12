// «Коди відновлення» / «Herstelcodes», zoals GitHub: na het maken één keer de codes met Завантажити (.txt), Копіювати,
// Друкувати en «Я зберіг коди». Daarna alleen een gemaskeerde lijst (••••-••••-••ab): gebruikte codes doorgestreept met
// datum, «Залишилося N з 10», «Відкликати всі» (step-up; alles onbruikbaar, getoond als «Відкликано») en «Створити нові»
// (vervangt de oude set). De server bewaart de codes alleen gehasht (backend/toegangslaag.ts, herstelOverzicht).
// §13.10: per gebruikte code WAARVOOR (actie), waar, apparaat en IP-hash; privénotities per set en per code (potloodje).
import {useEffect,useRef,useState} from 'react';
import {Check,Copy,Download,Printer,RefreshCw,ShieldOff,X} from 'lucide-react';
import {api} from './platform/client';
import {leesVergeten,swrPost} from './lees-cache';
import {metHervat,neemHervat,stapOpUitleg} from './platform/stap-op';
import {foutCode} from './platform/webauthn';
import {InfoTip} from './InfoTip';
import {GebruikLijst,NotitieVeld,useNotities,type Gebruik} from './ToegangContext';
import type {Lang} from './toegangslaag-teksten';

type Regel={nr:number;hint:string;sleutel?:string;status:'ongebruikt'|'gebruikt'|'ingetrokken';gebruiktOp:number;gebruik?:Gebruik[]};
type Overzicht={codes:Regel[];resterend:number;totaal:number;createdAt:number;setSleutel?:string;bekekenOp:number;ingetrokkenOp:number};
type Props={lang:Lang;context:Record<string,unknown>;codes:string[];busy:boolean;nieuweHerstelcodes:()=>Promise<void>;recoverySaved:()=>Promise<void>;onChange?:()=>void};

const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
const datum=(lang:Lang,ms?:number)=>ms?new Date(ms).toLocaleDateString(lang==='uk'?'uk-UA':'nl-BE',{day:'numeric',month:'short',year:'numeric'}):'';
/** «A1B2C3D4E5F6» → «A1B2-C3D4-E5F6» (invoer met of zonder streepjes werkt). */
export const opmaak=(c:string)=>(c.match(/.{1,4}/g)||[c]).join('-');
export const masker=(hint:string)=>`••••-••••-••${hint.toLowerCase()}`;
const FOUT:Record<string,[string,string]>={
  STEP_UP_REQUIRED:['',''],
  ACCESS_RECOVERY_NOT_ENROLLED:['Кодів відновлення ще немає.','Er zijn nog geen herstelcodes.'],
  ACCESS_RECOVERY_PEPPER_MISSING:['Коди відновлення тимчасово недоступні на сервері.','Herstelcodes zijn tijdelijk niet beschikbaar op de server.'],
  STAP_OP_VENSTER_FOUT:['Не вдалося відкрити вікно «Підтвердіть доступ». Оновіть сторінку й спробуйте ще раз.','Het venster «Toegang bevestigen» kon niet openen. Vernieuw de pagina en probeer het opnieuw.'],
};
const foutTekst=(lang:Lang,code:string)=>code==='STEP_UP_REQUIRED'?stapOpUitleg():FOUT[code]?tr(lang,FOUT[code][0],FOUT[code][1]):tr(lang,'Не вдалося. ','Mislukt. ')+(code||tr(lang,'Немає зв’язку.','Geen verbinding.'));

export function HerstelcodesSectie({lang,context,codes,busy,nieuweHerstelcodes,recoverySaved,onChange}:Props){
  const[o,setO]=useState<Overzicht|null>(null);
  const[bezig,setBezig]=useState('');
  const[melding,setMelding]=useState<{ok:boolean;tekst:string}|null>(null);
  const[bewaard,setBewaard]=useState(false);
  const[intrekVraag,setIntrekVraag]=useState(false);
  const hervat=useRef(false);
  const notities=useNotities(context);

  const laden=async(alleenVers=false)=>{try{await swrPost<Overzicht>('/api/owner/access/recovery/overzicht',context,d=>{if(d&&typeof d==='object')setO(d);},{alleenVers});}catch(c){setMelding({ok:false,tekst:foutTekst(lang,foutCode(c))});}};
  useEffect(()=>{void laden(codes.length>0);setBewaard(false);},[codes.length]);// eslint-disable-line react-hooks/exhaustive-deps

  const tekstBestand=()=>[
    tr(lang,'Mijn Ruimte — коди відновлення','Mijn Ruimte — herstelcodes'),
    tr(lang,`Створено: ${new Date().toLocaleString('uk-UA')}`,`Gemaakt: ${new Date().toLocaleString('nl-BE')}`),
    tr(lang,'Кожен код діє один раз. Зберігайте їх у надійному місці.','Elke code werkt één keer. Bewaar ze op een veilige plek.'),
    '',...codes.map(opmaak),''].join('\r\n');
  const downloaden=()=>{
    const url=URL.createObjectURL(new Blob([tekstBestand()],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='mijn-ruimte-herstelcodes.txt';document.body.appendChild(a);a.click();a.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const kopieren=async()=>{try{await navigator.clipboard.writeText(codes.map(opmaak).join('\n'));setMelding({ok:true,tekst:tr(lang,'Коди скопійовано.','Codes gekopieerd.')});}catch{setMelding({ok:false,tekst:tr(lang,'Не вдалося скопіювати. Завантажте файл або виділіть коди вручну.','Kopiëren lukte niet. Download het bestand of selecteer de codes zelf.')});}};
  const afdrukken=()=>{document.body.classList.add('herstel-afdruk');const weg=()=>{document.body.classList.remove('herstel-afdruk');window.removeEventListener('afterprint',weg);};window.addEventListener('afterprint',weg);window.print();window.setTimeout(weg,1500);};
  const klaar=async()=>{setBezig('klaar');await recoverySaved();leesVergeten('/api/owner/access/recovery/overzicht');setBezig('');await laden(true);};

  const intrekken=async()=>{
    setIntrekVraag(false);setBezig('intrekken');setMelding(null);
    try{
      await metHervat({actie:'herstelcodes-intrekken'},()=>api.post('/api/owner/access/recovery/intrekken',context));
      leesVergeten('/api/owner/access/recovery/overzicht');
      leesVergeten('/api/owner/access/snapshot');
      setMelding({ok:true,tekst:tr(lang,'Усі коди відкликано. Жоден із них більше не діє.','Alle codes zijn ingetrokken. Geen enkele werkt nog.')});
      await laden(true);onChange?.();
    }catch(c){const code=foutCode(c);console.error('[herstelcodes] intrekken',code,c);setMelding({ok:false,tekst:foutTekst(lang,code)});}
    finally{setBezig('');}
  };
  useEffect(()=>{if(hervat.current)return;hervat.current=true;if(neemHervat('herstelcodes-intrekken'))void intrekken();},[]);// eslint-disable-line react-hooks/exhaustive-deps

  const nieuw=codes.length>0;
  const codeRegels=Array.isArray(o?.codes)?o.codes:[];
  const heeft=!!o&&((o.totaal||0)>0||(o.resterend||0)>0);
  const ingetrokken=!!o?.ingetrokkenOp;
  const status=!o?tr(lang,'Завантаження…','Laden…'):!heeft?tr(lang,'Резерв, якщо втратите телефон','Reserve voor als je je telefoon kwijt bent'):ingetrokken?tr(lang,`Відкликано ${datum(lang,o.ingetrokkenOp)}`,`Ingetrokken op ${datum(lang,o.ingetrokkenOp)}`):`${tr(lang,'Створено ','Gemaakt ')}${datum(lang,o.createdAt)}${o.bekekenOp?` · ${tr(lang,'збережено','bewaard')}`:''}`;

  return <section className='access-plane-section' id='aanmeldmethoden-herstel' data-access-section='recovery' tabIndex={-1}>
    <header className='access-plane-section-head'><h2>{tr(lang,'Коди відновлення','Herstelcodes')}</h2>
      <InfoTip label={tr(lang,'Про коди відновлення','Over herstelcodes')}><p>{tr(lang,'Одноразові коди на випадок, якщо ви втратите телефон. Зберігайте їх окремо (папір, менеджер паролів).','Eenmalige codes voor als je je telefoon kwijt bent. Bewaar ze apart (papier, wachtwoordmanager).')}</p><p>{tr(lang,'Ми зберігаємо лише захищений відбиток кожного коду, тому показати їх знову не можна. Нові коди замінюють старі.','We bewaren alleen een beveiligde vingerafdruk van elke code, dus tonen kan niet opnieuw. Nieuwe codes vervangen de oude.')}</p></InfoTip></header>
    <div className='access-plane-box'>
      <div className='access-plane-row' data-access-factor='recovery'>
        <RefreshCw className='access-plane-row-icon'/>
        <div className='access-plane-row-main'>
          <span className='access-plane-row-title'><strong data-herstel-teller>{heeft?tr(lang,`Залишилося ${o!.resterend} з ${o!.totaal||10}`,`Nog ${o!.resterend} van ${o!.totaal||10}`):tr(lang,'Кодів ще немає','Nog geen codes')}</strong>
            {ingetrokken&&<span className='access-plane-badge tone-warn'>{tr(lang,'Відкликано','Ingetrokken')}</span>}
            {heeft&&!ingetrokken&&o!.resterend<=3&&<span className='access-plane-badge tone-warn'>{tr(lang,'Мало кодів','Weinig codes')}</span>}</span>
          <small>{status}</small>
        </div>
        <div className='access-plane-row-actions'>
          {heeft&&!ingetrokken&&o!.resterend>0&&!nieuw&&<button type='button' className='secondary' disabled={busy||!!bezig} onClick={()=>setIntrekVraag(true)}><ShieldOff/>{tr(lang,'Відкликати всі','Alle intrekken')}</button>}
          <button type='button' className='secondary' disabled={busy||!!bezig} onClick={()=>{setMelding(null);void nieuweHerstelcodes();}}><RefreshCw/>{heeft?tr(lang,'Створити нові','Nieuwe maken'):tr(lang,'Створити коди','Codes maken')}</button>
        </div>
      </div>
      {heeft&&o!.setSleutel&&!nieuw&&<div className='access-plane-subrow' data-herstel-set-notitie><NotitieVeld lang={lang} soort='herstelset' sleutel={o!.setSleutel} notities={notities}/></div>}
      {intrekVraag&&<div className='access-plane-subrow access-plane-confirm' role='group'>
        <span>{tr(lang,'Відкликати всі коди відновлення? Жоден із них більше не діятиме.','Alle herstelcodes intrekken? Geen enkele werkt daarna nog.')}</span>
        <div className='access-plane-actions'>
          <button type='button' className='danger' disabled={!!bezig} onClick={()=>void intrekken()}><ShieldOff/>{tr(lang,'Відкликати','Intrekken')}</button>
          <button type='button' className='secondary' onClick={()=>setIntrekVraag(false)}><X/>{tr(lang,'Скасувати','Annuleren')}</button>
        </div>
      </div>}
      {melding&&<p className='access-plane-notice access-plane-subrow' data-ok={melding.ok} role='status'>{melding.tekst}</p>}

      {nieuw&&<div className='access-plane-subrow herstel-nieuw' data-herstel-nieuw>
        <strong>{tr(lang,'Збережіть коди відновлення','Bewaar je herstelcodes')}</strong>
        <small>{tr(lang,'Ми показуємо їх лише зараз. Кожен код діє один раз.','We tonen ze alleen nu. Elke code werkt één keer.')}</small>
        <ul className='herstel-raster' aria-label={tr(lang,'Коди відновлення','Herstelcodes')}>{codes.map(c=><li key={c} className='access-plane-mono'>{opmaak(c)}</li>)}</ul>
        <div className='access-plane-actions herstel-knoppen'>
          <button type='button' className='secondary' onClick={downloaden}><Download/>{tr(lang,'Завантажити','Downloaden')}</button>
          <button type='button' className='secondary' onClick={()=>void kopieren()}><Copy/>{tr(lang,'Копіювати','Kopiëren')}</button>
          <button type='button' className='secondary' onClick={afdrukken}><Printer/>{tr(lang,'Друкувати','Afdrukken')}</button>
        </div>
        <div className='herstel-klaar'>
          <label className='access-plane-switch'><input type='checkbox' checked={bewaard} onChange={e=>setBewaard(e.target.checked)}/>{tr(lang,'Я зберіг коди','Ik heb de codes bewaard')}</label>
          <button type='button' disabled={!bewaard||!!bezig} onClick={()=>void klaar()}><Check/>{tr(lang,'Готово','Klaar')}</button>
        </div>
      </div>}

      {!nieuw&&heeft&&(codeRegels.length>0
        ?<ul className='herstel-lijst' data-herstel-lijst>{codeRegels.map(r=><li key={r.nr} data-status={r.status} data-herstel-nr={r.nr}>
          <div className='herstel-rij-kop'>
            <span className='access-plane-mono herstel-code'>{masker(r.hint)}</span>
            <small>{r.status==='ongebruikt'?tr(lang,'Не використано','Ongebruikt'):r.status==='gebruikt'?`${tr(lang,'Використано','Gebruikt')}${r.gebruiktOp?` ${datum(lang,r.gebruiktOp)}`:''}`:tr(lang,'Відкликано','Ingetrokken')}</small>
            {r.sleutel&&<NotitieVeld lang={lang} soort='herstelcode' sleutel={r.sleutel} notities={notities} compact/>}
          </div>
          {r.sleutel&&r.gebruik&&r.gebruik.length>0&&<GebruikLijst lang={lang} gebruik={r.gebruik} id={r.sleutel}/>}
        </li>)}</ul>
        :<p className='access-plane-hint-line access-plane-subrow'>{tr(lang,'Це старий набір кодів без окремого списку. Створіть нові, щоб бачити стан кожного коду.','Dit is een oudere set zonder lijst per code. Maak nieuwe codes om de status van elke code te zien.')}</p>)}
    </div>
  </section>;
}
