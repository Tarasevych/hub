// «Способи входу» in context (RUNBOOK §13.10): per passkey / herstelcode WAARVOOR hij gebruikt is (actie uit de vaste lijst van
// de server), waar (host), met welk apparaat («Chrome · Windows») en een korte IP-hash; privénotities (≤ 500 tekens, alleen
// voor uzelf, potloodje) en een uitklapbare «Історія». Teksten alleen UA + NL.
import {useEffect,useState} from 'react';
import {Check,ChevronDown,ChevronRight,History,Pencil,StickyNote,X} from 'lucide-react';
import {api} from './platform/client';
import {foutCode} from './platform/webauthn';
import type {Lang} from './access-plane-copy';

const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
export const NOTITIE_MAX=500;
export type Gebruik={actie:string;host:string;apparaat:string|null;ipKort:string|null;op:string};
export type NotitieSoort='passkey'|'herstelset'|'herstelcode'|'toegangscode';
type Notitie={soort:NotitieSoort;sleutel:string;tekst:string;bijgewerktOp:string|null};

/** Zelfde vaste lijst als backend/toegang-context.ts ACTIES (de server neemt alleen deze labels over). */
export const ACTIE_TEKST:Record<string,[string,string]>={
  inloggen:['Вхід','Aanmelden'],
  bevestigen:['Підтвердження доступу','Toegang bevestigen'],
  'herstelcodes-nieuw':['Створення нових кодів','Nieuwe codes maken'],
  'herstelcodes-intrekken':['Відкликання кодів відновлення','Herstelcodes intrekken'],
  'passkey-toevoegen':['Додавання passkey','Passkey toevoegen'],
  'passkey-verwijderen':['Видалення passkey','Passkey verwijderen'],
  'goedkeur-recht-aanvragen':['Запит права схвалювати оновлення','Recht om updates goed te keuren aanvragen'],
  'goedkeur-recht-bevestigen':['Надання права схвалювати оновлення','Recht om updates goed te keuren bevestigen'],
  'goedkeur-recht-intrekken':['Відкликання права схвалювати оновлення','Recht om updates goed te keuren intrekken'],
  'wijziging-terugdraaien':['Скасування зміни («Це був не я»)','Wijziging terugdraaien («Dit was ik niet»)'],
  'toegangscode-maken':['Створення коду доступу для іншої людини','Toegangscode voor iemand anders maken'],
  'toegangscode-verlengen':['Продовження коду доступу','Toegangscode verlengen'],
  'uitrol-goedkeuren':['Схвалення оновлення','Update goedkeuren'],
  voorbereider:['Право готувати оновлення','Recht om updates voor te bereiden'],
  'totp-wijzigen':['Зміна застосунку-автентифікатора','Authenticator-app wijzigen'],
  'totp-uitschakelen':['Вимкнення застосунку-автентифікатора','Authenticator-app uitschakelen'],
  wachtwoord:['Зміна пароля','Wachtwoord wijzigen'],
  aanmeldmethode:['Зміна способів входу','Aanmeldmethoden wijzigen'],
  beheer:['Адміністрування','Beheer'],
  agenten:['Агенти й токени','Agents en tokens'],
  export:['Експорт даних','Gegevens exporteren'],
  'account-verwijderen':['Видалення акаунта','Account verwijderen'],
  onbekend:['Інша дія','Andere actie'],
};
export const actieTekst=(lang:Lang,a:string)=>{const t=ACTIE_TEKST[a]||ACTIE_TEKST.onbekend;return tr(lang,t[0],t[1]);};
/** «Chrome/Windows» → «Chrome · Windows»; onbekende delen in de taal van de pagina. */
export const apparaatTekst=(lang:Lang,a:string|null)=>{
  if(!a)return tr(lang,'Невідомий пристрій','Onbekend apparaat');
  return a.split('/').map(d=>d==='overig'?tr(lang,'інше','overig'):d==='script'?tr(lang,'скрипт','script'):d).join(' · ');
};
export const tijdTekst=(lang:Lang,v?:string|number|null)=>v?new Date(v).toLocaleString(lang==='uk'?'uk-UA':'nl-BE',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';

/** Eén regel gebruik: «Створення нових кодів · id.tarasevych.com · Chrome · Windows · IP #a1b2c3d4e5f6 · 9 жовт. 2026, 10:12». */
export function GebruikRegel({lang,g}:{lang:Lang;g:Gebruik}){
  return <span className='toegang-gebruik-regel' data-gebruik-actie={g.actie}>
    <strong>{actieTekst(lang,g.actie)}</strong>
    {g.host&&<span>{g.host}</span>}
    <span>{apparaatTekst(lang,g.apparaat)}</span>
    {g.ipKort&&<span className='access-plane-mono' title={tr(lang,'Хеш IP-адреси (саму адресу ми не зберігаємо)','Hash van het IP-adres (het adres zelf bewaren we niet)')}>IP #{g.ipKort}</span>}
    <time dateTime={g.op}>{tijdTekst(lang,g.op)}</time>
  </span>;
}
/** Laatste gebruik + uitklapbare lijst (laatste 20). */
export function GebruikLijst({lang,gebruik,id}:{lang:Lang;gebruik:Gebruik[];id:string}){
  const[open,setOpen]=useState(false);
  if(!gebruik.length)return null;
  return <div className='toegang-gebruik' data-gebruik={id}>
    <div className='toegang-gebruik-laatste'><small>{tr(lang,'Останнє використання:','Laatst gebruikt:')}</small> <GebruikRegel lang={lang} g={gebruik[0]}/></div>
    {gebruik.length>1&&<button type='button' className='toegang-uitklap' aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<ChevronDown/>:<ChevronRight/>}{tr(lang,`Усі використання (${gebruik.length})`,`Alle keren gebruikt (${gebruik.length})`)}</button>}
    {open&&<ol className='toegang-gebruik-lijst'>{gebruik.map((g,i)=><li key={`${g.op}-${i}`}><GebruikRegel lang={lang} g={g}/></li>)}</ol>}
  </div>;
}

// ------------------------------------------------------------------------------------------------ notities
const sleutelVan=(soort:string,sleutel:string)=>`${soort}|${sleutel}`;
/** Notities van deze gebruiker (één keer laden per sectie). */
export function useNotities(context:Record<string,unknown>){
  const[map,setMap]=useState<Map<string,Notitie>>(new Map());
  const laden=async()=>{try{const n=((await api.post('/api/owner/access/notities/lijst',context)).data as {notities:Notitie[]}).notities||[];setMap(new Map(n.map(x=>[sleutelVan(x.soort,x.sleutel),x])));}catch{/* notities zijn bijzaak */}};
  useEffect(()=>{void laden();},[]);// eslint-disable-line react-hooks/exhaustive-deps
  const opslaan=async(soort:NotitieSoort,sleutel:string,tekst:string)=>{
    const n=((await api.post('/api/owner/access/notities/opslaan',{...context,soort,sleutel,tekst})).data as {notitie:Notitie}).notitie;
    setMap(m=>{const k=new Map(m);if(n.tekst)k.set(sleutelVan(soort,sleutel),n);else k.delete(sleutelVan(soort,sleutel));return k;});
  };
  return{tekst:(soort:NotitieSoort,sleutel:string)=>map.get(sleutelVan(soort,sleutel))?.tekst||'',opslaan,laden};
}
const NOTITIE_FOUT:Record<string,[string,string]>={
  NOTITIE_TE_LANG:[`Нотатка задовга (максимум ${NOTITIE_MAX} символів).`,`De notitie is te lang (maximaal ${NOTITIE_MAX} tekens).`],
  NOTITIE_LIMIET:['Забагато нотаток.','Te veel notities.'],
  RATE_LIMITED:['Забагато змін поспіль. Зачекайте хвилину.','Te veel wijzigingen achter elkaar. Wacht een minuut.'],
};
/** Privénotitie met potloodje; bewerken in de rij zelf. */
export function NotitieVeld({lang,soort,sleutel,notities,compact=false}:{lang:Lang;soort:NotitieSoort;sleutel:string;notities:ReturnType<typeof useNotities>;compact?:boolean}){
  const huidig=notities.tekst(soort,sleutel);
  const[bewerk,setBewerk]=useState<string|null>(null);
  const[bezig,setBezig]=useState(false);
  const[fout,setFout]=useState('');
  const lengte=[...(bewerk??'')].length;
  const opslaan=async()=>{
    if(bewerk===null)return;
    setBezig(true);setFout('');
    try{await notities.opslaan(soort,sleutel,bewerk);setBewerk(null);}
    catch(c){const code=foutCode(c);const f=NOTITIE_FOUT[code];setFout(f?tr(lang,f[0],f[1]):tr(lang,'Не вдалося зберегти нотатку.','Notitie opslaan mislukt.'));}
    finally{setBezig(false);}
  };
  const label=tr(lang,'Приватна нотатка','Privénotitie');
  if(bewerk!==null)return <div className='toegang-notitie bewerk' data-notitie={`${soort}:${sleutel}`}>
    <textarea aria-label={label} autoFocus rows={compact?2:3} value={bewerk} maxLength={NOTITIE_MAX} disabled={bezig}
      placeholder={tr(lang,'Наприклад: де зберігається, хто має доступ… Бачите лише ви.','Bijvoorbeeld: waar bewaard, wie er toegang toe heeft… Alleen u ziet dit.')}
      onChange={e=>setBewerk(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'&&!bezig)setBewerk(null);if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))void opslaan();}}/>
    <div className='toegang-notitie-voet'>
      <small data-teller={lengte>NOTITIE_MAX?'te-lang':''}>{lengte} / {NOTITIE_MAX}</small>
      <button type='button' disabled={bezig||lengte>NOTITIE_MAX} onClick={()=>void opslaan()}><Check/>{tr(lang,'Зберегти','Opslaan')}</button>
      <button type='button' className='secondary' disabled={bezig} onClick={()=>{setBewerk(null);setFout('');}}><X/>{tr(lang,'Скасувати','Annuleren')}</button>
    </div>
    {fout&&<small className='toegang-fout' role='alert'>{fout}</small>}
  </div>;
  return <div className='toegang-notitie' data-notitie={`${soort}:${sleutel}`}>
    {huidig?<p className='toegang-notitie-tekst'><StickyNote aria-hidden='true'/><span>{huidig}</span></p>:null}
    <button type='button' className='toegang-potlood' aria-label={huidig?tr(lang,'Змінити нотатку','Notitie wijzigen'):tr(lang,'Додати нотатку','Notitie toevoegen')} title={label} onClick={()=>{setBewerk(huidig);setFout('');}}>
      <Pencil/>{!huidig&&!compact&&<span>{tr(lang,'Нотатка','Notitie')}</span>}
    </button>
  </div>;
}

// ------------------------------------------------------------------------------------------------ geschiedenis
export type Wijziging={id:string;soort:string;actorEmail:string;actorId:string;label:string;vingerafdruk:string;reden:string|null;sessieId:string;stapOp:string;host:string;apparaat:string|null;ipKort:string|null;op:string;ongedaanOp:string|null;ongedaanDoor:string|null;ongedaanUitkomst:Record<string,unknown>|null;doorZelf:boolean};
export type GeschiedenisItem={soort:string;op:string;wijziging?:Wijziging;door?:string};
export const WIJZIGING_TEKST:Record<string,[string,string]>={
  'goedkeur-recht-aangevraagd':['Запит права схвалювати оновлення','Recht om updates goed te keuren aangevraagd'],
  'goedkeur-recht-ingetrokken':['Право схвалювати оновлення відкликано','Recht om updates goed te keuren ingetrokken'],
  'goedkeur-passkey-verwijderd':['Passkey, що міг схвалювати оновлення, видалено','Passkey die updates mocht goedkeuren verwijderd'],
  'voorbereider-ingetrokken':['Право готувати оновлення відкликано','Recht om updates voor te bereiden ingetrokken'],
  'root-toegevoegd':['Сервер прийняв ключ (може схвалювати оновлення)','Server heeft de sleutel aangenomen (mag updates goedkeuren)'],
};
const METHODE:Record<string,[string,string]>={passkey:['passkey','passkey'],totp:['код із застосунку','app-code'],herstelcode:['код відновлення','herstelcode'],google:['повторний вхід Google','opnieuw inloggen bij Google']};
export const methodeTekst=(lang:Lang,m:string)=>METHODE[m]?tr(lang,METHODE[m][0],METHODE[m][1]):m;
/** Regel voor één wijziging (wie, waarvandaan, waarom). */
export function WijzigingDetails({lang,w}:{lang:Lang;w:Wijziging}){
  return <dl className='toegang-wijziging-details'>
    <dt>{tr(lang,'Хто','Wie')}</dt><dd>{w.actorEmail||w.actorId}{w.doorZelf?` (${tr(lang,'ваш акаунт','uw account')})`:''}</dd>
    <dt>{tr(lang,'Коли','Wanneer')}</dt><dd><time dateTime={w.op}>{tijdTekst(lang,w.op)}</time></dd>
    {w.reden&&<><dt>{tr(lang,'Причина','Reden')}</dt><dd data-reden>{w.reden}</dd></>}
    {w.label&&<><dt>{tr(lang,'Ключ','Sleutel')}</dt><dd>«{w.label}»{w.vingerafdruk?<span className='access-plane-mono'> {w.vingerafdruk.slice(0,16).replace(/(.{4})/g,'$1 ').trim()}</span>:null}</dd></>}
    <dt>{tr(lang,'Звідки','Vanaf')}</dt><dd>{[w.host,apparaatTekst(lang,w.apparaat),w.ipKort?`IP #${w.ipKort}`:''].filter(Boolean).join(' · ')}</dd>
    {w.sessieId&&<><dt>{tr(lang,'Сесія','Sessie')}</dt><dd className='access-plane-mono'>{w.sessieId}…</dd></>}
    {w.stapOp&&<><dt>{tr(lang,'Підтверджено','Bevestigd met')}</dt><dd>{methodeTekst(lang,w.stapOp)}</dd></>}
    {w.ongedaanOp&&<><dt>{tr(lang,'Скасовано','Teruggedraaid')}</dt><dd>{tijdTekst(lang,w.ongedaanOp)}{w.ongedaanDoor?` · ${w.ongedaanDoor}`:''}</dd></>}
  </dl>;
}
/** Uitklapbare «Історія» per sleutel. */
export function GeschiedenisLijst({lang,items,id}:{lang:Lang;items:GeschiedenisItem[];id:string}){
  const[open,setOpen]=useState(false);
  if(!items.length)return null;
  return <div className='toegang-geschiedenis' data-geschiedenis={id}>
    <button type='button' className='toegang-uitklap' aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<ChevronDown/>:<ChevronRight/>}<History/>{tr(lang,`Історія (${items.length})`,`Geschiedenis (${items.length})`)}</button>
    {open&&<ol className='toegang-geschiedenis-lijst'>{items.map((g,i)=>{const t=WIJZIGING_TEKST[g.soort];return <li key={`${g.op}-${i}`} data-soort={g.soort}>
      <strong>{t?tr(lang,t[0],t[1]):g.soort}</strong>{g.wijziging?.ongedaanOp&&<span className='access-plane-badge tone-info'>{tr(lang,'Скасовано','Teruggedraaid')}</span>}
      {g.wijziging?<WijzigingDetails lang={lang} w={g.wijziging}/>:<small>{tijdTekst(lang,g.op)}{g.door?` · ${g.door==='ssh'?tr(lang,'через SSH','via SSH'):g.door}`:''}</small>}
      {g.wijziging&&!g.wijziging.ongedaanOp&&g.soort!=='goedkeur-recht-aangevraagd'&&<a className='toegang-link' href={`?wijziging=${g.wijziging.id}`}>{tr(lang,'Це були не ви?','Was u dit niet?')}</a>}
    </li>;})}</ol>}
  </div>;
}

// ------------------------------------------------------------------------------------------------ reden
export const REDEN_MIN=10, REDEN_MAX=500;
/** Verplichte reden (≥ 10 tekens) in de rij zelf; de knop wordt pas actief bij een geldige reden. */
export function RedenVeld({lang,waarde,zet,id,disabled}:{lang:Lang;waarde:string;zet:(v:string)=>void;id:string;disabled?:boolean}){
  const n=[...waarde.trim()].length;
  return <div className='toegang-reden'>
    <label htmlFor={id}>{tr(lang,'Причина (обов’язково, щонайменше 10 символів)','Reden (verplicht, minstens 10 tekens)')}</label>
    <textarea id={id} rows={2} value={waarde} maxLength={REDEN_MAX} disabled={disabled} autoFocus onChange={e=>zet(e.target.value)}
      placeholder={tr(lang,'Наприклад: телефон загублено; ключ більше не потрібен…','Bijvoorbeeld: telefoon kwijt; sleutel niet meer nodig…')}/>
    <small data-teller={n<REDEN_MIN?'te-kort':''}>{n<REDEN_MIN?tr(lang,`Ще ${REDEN_MIN-n} симв.`,`Nog ${REDEN_MIN-n} tekens`):`${n} / ${REDEN_MAX}`}</small>
  </div>;
}
export const redenOk=(v:string)=>{const n=[...v.trim()].length;return n>=REDEN_MIN&&n<=REDEN_MAX;};
