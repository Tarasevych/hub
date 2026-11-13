// «Керування входами й пристроями»: входи згруповано за ФІЗИЧНИМ пристроєм (User-Agent + мережа; IPv4 та IPv6 одного пристрою
import { ruimtesV2Nu } from './tech/ruimtes/ruimtes-vlag';
import { WOORDEN } from './tech/ruimtes/teksten';
import { openTechVenster } from './tech/tech-opslag';
// разом), кожен пристрій — акордеон зі списком сервісів/вкладок/запам'ятованих браузерів. Значки ОС/браузера/типу, прапор країни,
// бейджі способу входу, IPv4/IPv6 (приховані, показ за кліком) і «Завершити всі сесії на цьому пристрої».
// Дані — ті самі, що й раніше (GET security/sessions); групування повністю на клієнті (src/sessies/groeperen.ts).
import {ChevronDown,Fingerprint,KeyRound,LockKeyhole,MonitorSmartphone,RefreshCw,ShieldCheck,Smartphone,Trash2,TimerReset,Wrench} from 'lucide-react';
import {useMemo,useState} from 'react';
import {api} from './platform/client';
import {ecosystemTabContext} from './tab-context';
import {groepeerPerApparaat,intrekbaarOpApparaat,landCode,type Apparaat} from './sessies/groeperen';
import {BrowserIcoon,GoogleIcoon,OsIcoon,SoortIcoon,Vlag} from './sessies/SessieIconen';
import './sessies/sessies.css';
export type SecuritySession={id:string;fingerprint:string;kind:'service'|'tab'|'remembered';service:string;createdAt:number;lastSeenAt:number;expiresAt:number;ip:string;userAgent:string;deviceLabel:string;browser:string;browserVersion:string;os:string;osVersion:string;deviceType:string;approximateLocation?:{city?:string;region?:string;country?:string};authMethod:string;current:boolean;/** Запам'ятаний для підтверджень: до якого часу (мс); 0/відсутнє — не запам'ятано. */onthoudTot?:number;tech?:SessieTech|null};
/** Lopend technisch profiel van deze aanmelding (migratie 0060): zo ziet de gebruiker welke aanmelding alleen «користувацький» is en welke ook technisch. */
export type SessieTech={activatie:string;modus:'tijd'|'tot-uitloggen'|'tot-verlaten';begin:number;eind:number;reden:string};
type Tr=(uk:string,nl:string)=>string;type Props={tr:Tr;sessions:SecuritySession[];loading:boolean;busy:boolean;onRefresh:()=>void;onRevoke:(session:SecuritySession)=>void|Promise<void>;onRevokeAll:()=>void;onShareLocation:()=>void};

const isUk=(tr:Tr)=>tr('1','0')==='1';
/** Українська множина: 1 вхід, 2–4 входи, 5+ входів (11–14 → входів). */
const mn=(n:number,een:string,paar:string,veel:string)=>{const t=n%10,h=n%100;return t===1&&h!==11?een:t>=2&&t<=4&&(h<12||h>14)?paar:veel};
const maskIp=(ip:string)=>{if(!ip||ip==='unknown')return '—';if(ip.includes(':')){const parts=ip.split(':').filter(Boolean);return `${parts.slice(0,2).join(':')}:••••::••••`}const parts=ip.split('.');return parts.length===4?`${parts[0]}.${parts[1]}.•••.•••`:ip};
const landNaam=(cc:string,tr:Tr)=>{if(!cc)return '';try{return new Intl.DisplayNames([isUk(tr)?'uk':'nl'],{type:'region'}).of(cc)||cc}catch{return cc}};
const plaatsTekst=(a:Apparaat,tr:Tr)=>{const p=a.plaats;const cc=landCode(p?.country);const delen=[p?.city,p?.region,cc?landNaam(cc,tr):p?.country].filter(Boolean);return delen.length?[...new Set(delen)].join(', '):tr('Місце невідоме','Locatie onbekend')};
const geleden=(t:number,tr:Tr)=>{const s=Math.round((t-Date.now())/1000);const rtf=new Intl.RelativeTimeFormat(isUk(tr)?'uk':'nl',{numeric:'auto'});const a=Math.abs(s);if(a<60)return tr('щойно','zojuist');if(a<3600)return rtf.format(Math.round(s/60),'minute');if(a<86400)return rtf.format(Math.round(s/3600),'hour');return rtf.format(Math.round(s/86400),'day')};
const duur=(ms:number,tr:Tr)=>{const m=Math.max(0,Math.round(ms/60000));if(m<60)return tr(`${m} хв`,`${m} min`);const u=Math.floor(m/60);if(u<48)return tr(`${u} год ${m%60} хв`,`${u} u ${m%60} min`);const d=Math.floor(u/24);return tr(`${d} дн ${u%24} год`,`${d} d ${u%24} u`)};
const DIENST:Record<string,[string,string]>={identity:['Обліковий запис (id)','Account (id)'],mail:['Пошта','Mail'],cloud:['Хмара','Cloud'],admin:['Адміністрування','Beheer'],mcp:['MCP і агенти','MCP en agenten'],hub:['Головна','Start'],ai:['ШІ','AI'],github:['GitHub','GitHub'],huis:['Дім','Huis'],api:['API','API']};
const dienstNaam=(s:string,tr:Tr)=>{const d=DIENST[s];return d?tr(d[0],d[1]):s||tr('Невідомий сервіс','Onbekende dienst')};
const soortNaam=(k:SecuritySession['kind'],tr:Tr)=>k==='remembered'?tr('Запам’ятований браузер','Onthouden browser'):k==='tab'?tr('Вкладка','Tabblad'):tr('Вхід','Aanmelding');
// Vlag tech-ruimtes-v2: ondubbelzinnige namen (audit 27.10.2026); uit = de oude woorden.
const techModus=(m:SessieTech['modus'],tr:Tr)=>ruimtesV2Nu()?(m==='tot-uitloggen'?tr(WOORDEN.bandTotUitloggen.uk,WOORDEN.bandTotUitloggen.nl):m==='tot-verlaten'?tr(WOORDEN.bandTotVerlaten.uk,WOORDEN.bandTotVerlaten.nl):tr(WOORDEN.sessieTijd.uk,WOORDEN.sessieTijd.nl)):m==='tot-uitloggen'?tr('до виходу з акаунта','tot uitloggen'):m==='tot-verlaten'?tr('до виходу з профілю','tot verlaten'):tr('на час','op tijd');
/** Бейдж рівня доступу: лише користувацький, або користувацький + технічний (з режимом і кінцем). */
function Niveau({t,tr}:{t?:SessieTech|null;tr:Tr}){return t?<span className='sessie-niveau tech' data-sessie-niveau='tech' title={tr(`Технічний профіль увімкнено ${new Date(t.begin).toLocaleString()} (${techModus(t.modus,tr)})`,`Technisch profiel actief sinds ${new Date(t.begin).toLocaleString()} (${techModus(t.modus,tr)})`)}><Wrench aria-hidden/>{tr('Користувацький + технічний','Gebruiker + technisch')}</span>:<span className='sessie-niveau' data-sessie-niveau='gebruiker'>{tr('Користувацький','Gebruiker')}</span>}
const techContext=()=>({service:'identity',tabContext:ecosystemTabContext(),sourceOrigin:location.origin});
const soortToestel=(s:string,tr:Tr)=>{const v=s.toLowerCase();return v==='mobile'?tr('Телефон','Telefoon'):v==='tablet'?tr('Планшет','Tablet'):tr('Комп’ютер','Computer')};
/** Бейдж способу входу. Лише ті способи, що реально є в системі: Google, passkey, пароль, код автентифікатора. */
function Methode({m,tr}:{m:string;tr:Tr}){
  const[ic,uk,nl]=m==='passkey'?[<Fingerprint key='i' aria-hidden/>,'Passkey','Passkey']:m==='password'?[<LockKeyhole key='i' aria-hidden/>,'Лише пароль','Alleen wachtwoord']:m==='totp'?[<Smartphone key='i' aria-hidden/>,'Автентифікатор (2FA)','Authenticator (2FA)']:[<GoogleIcoon key='i'/>,'Google SSO','Google SSO'];
  return <span className={`sessie-methode m-${m||'google'}`} data-sessie-methode={m||'google'}>{ic}{tr(uk,nl)}</span>;
}
function IpRegel({label,ips,tr}:{label:string;ips:string[];tr:Tr}){const[toon,setToon]=useState(false);return <div className='sessie-ip'><dt>{label}</dt><dd>{ips.length?<>{ips.map(ip=><code key={ip}>{toon?ip:maskIp(ip)}</code>)}<button type='button' className='security-inline-action' aria-pressed={toon} onClick={()=>setToon(v=>!v)}>{toon?tr('Приховати','Verbergen'):tr('Показати','Tonen')}</button></>:<span className='sessie-leeg'>{tr('не спостерігалась','niet gezien')}</span>}</dd></div>}

function ApparaatKaart({a,tr,busy,onRevoke,onRefresh}:{a:Apparaat;tr:Tr;busy:boolean;onRevoke:Props['onRevoke'];onRefresh:()=>void}){
  const[open,setOpen]=useState(a.huidig);const[bevestig,setBevestig]=useState(false);const[bezig,setBezig]=useState(false);
  const titel=`${a.browser||tr('Невідомий браузер','Onbekende browser')}${a.browserVersie?` ${a.browserVersie}`:''}`;const os=`${a.os||tr('Невідома система','Onbekend systeem')}${a.osVersie?` ${a.osVersie}`:''}`;
  const cc=landCode(a.plaats?.country);const intrekbaar=intrekbaarOpApparaat(a);
  const alles=async()=>{setBezig(true);try{for(const s of intrekbaar)await onRevoke(s)}finally{setBezig(false);setBevestig(false)}};
  // Alleen het technisch profiel van deze aanmelding beëindigen (de aanmelding blijft); rechten verlagen vraagt geen stap-op.
  const techUit=async(s:SecuritySession)=>{setBezig(true);try{await api.post(`/api/owner/identity/security/items/${s.id}/tech-beeindigen`,{...techContext(),kind:s.kind==='tab'?'tab':'session'});onRefresh()}catch{/* de lijst toont de werkelijke toestand na vernieuwen */}finally{setBezig(false)}};
  // «Забути цей браузер»: alleen het onthouden van bevestigingen wissen; de aanmelding zelf blijft bestaan.
  const onthoudVergeten=async(s:SecuritySession)=>{setBezig(true);try{await api.post(`/api/owner/identity/security/items/${s.id}/stap-op-vergeten`,techContext());onRefresh()}catch{/* de lijst toont de werkelijke toestand na vernieuwen */}finally{setBezig(false)}};
  return <article className={`sessie-apparaat${a.huidig?' current':''}`} data-sessie-apparaat={a.sleutel}>
    <button type='button' className='sessie-kop' aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <span className='sessie-toestel' aria-hidden><SoortIcoon soort={a.soort}/><span className='sessie-os-badge'><OsIcoon os={a.os} klein/></span></span>
      <span className='sessie-kop-tekst'>
        <strong><BrowserIcoon browser={a.browser} klein/>{titel}<span className='sessie-op'>·</span><OsIcoon os={a.os} klein/>{os}</strong>
        <small><Vlag land={a.plaats?.country} naam={cc?landNaam(cc,tr):''}/>{plaatsTekst(a,tr)} · {soortToestel(a.soort,tr)} · {tr('активність','actief')} {geleden(a.laatst,tr)}</small>
        <span className='sessie-badges'>{a.methoden.map(m=><Methode key={m} m={m} tr={tr}/>)}<span className='sessie-telling'>{tr(`${a.sessies.length} ${mn(a.sessies.length,'вхід','входи','входів')}`,`${a.sessies.length} ${a.sessies.length===1?'aanmelding':'aanmeldingen'}`)}</span></span>
      </span>
      {a.huidig&&<b className='security-current-badge'>{tr('Цей пристрій','Dit apparaat')}</b>}
      <ChevronDown className='sessie-pijl' aria-hidden/>
    </button>
    {open&&<div className='sessie-inhoud'>
      <dl className='sessie-netwerk'><IpRegel label='IPv4' ips={a.ipv4} tr={tr}/><IpRegel label='IPv6' ips={a.ipv6} tr={tr}/><div><dt>{tr('Перший вхід','Eerste aanmelding')}</dt><dd>{new Date(a.eerst).toLocaleString()}</dd></div></dl>
      <ul className='sessie-diensten'>{a.sessies.map(s=><li key={`${s.kind}:${s.id}`} className={s.current?'current':''} data-sessie-rij={s.kind}>
        <div className='sessie-dienst-kop'><span className='security-device-icon'>{s.kind==='remembered'?<KeyRound aria-hidden/>:<MonitorSmartphone aria-hidden/>}</span><div><strong>{dienstNaam(s.service,tr)}</strong><small>{soortNaam(s.kind,tr)}{s.current?` · ${tr('ви зараз тут','u bent hier nu')}`:''}</small></div>
          {/* ID-05 (klacht 20.10): de badges staan op hun EIGEN regel onder de naam. Stonden ze in dezelfde flexrij, dan drukten
              ze de naamkolom tot nul breedte en liep «Адміністрування» letter voor letter naar beneden. */}
          <span className='sessie-dienst-badges'><Methode m={s.authMethod} tr={tr}/>{s.kind!=='remembered'&&<Niveau t={s.tech} tr={tr}/>}{Number(s.onthoudTot)>Date.now()&&<span className='sessie-onthouden' data-sessie-onthouden title={tr('Підтвердження запам’ятано для цього браузера','Bevestiging onthouden voor deze browser')}><TimerReset aria-hidden/>{tr('Підтвердження запам’ятано до','Bevestiging onthouden tot')} {new Date(Number(s.onthoudTot)).toLocaleString()}</span>}</span></div>
        <dl><div><dt>{tr('Створено','Aangemaakt')}</dt><dd>{new Date(s.createdAt).toLocaleString()}</dd></div><div><dt>{tr('Остання активність','Laatste activiteit')}</dt><dd>{new Date(s.lastSeenAt).toLocaleString()}</dd></div><div><dt>{tr('Тривалість','Duur')}</dt><dd>{duur(s.lastSeenAt-s.createdAt,tr)}</dd></div><div><dt>{tr('Діє до','Geldig tot')}</dt><dd>{new Date(s.expiresAt).toLocaleString()}</dd></div>{s.tech&&<div data-sessie-tech><dt>{tr('Технічний профіль','Technisch profiel')}</dt><dd>{techModus(s.tech.modus,tr)} · {tr('з','sinds')} {new Date(s.tech.begin).toLocaleTimeString()}{s.tech.modus==='tijd'?` · ${tr('до','tot')} ${new Date(s.tech.eind).toLocaleTimeString()}`:''}{ruimtesV2Nu()&&<> · <button type='button' className='sessies-secundair' data-sessie-toegang onClick={()=>openTechVenster('toegang')}>{tr(WOORDEN.toegangPagina.uk,WOORDEN.toegangPagina.nl)}</button></>}</dd></div>}</dl>
        <details className='security-technical-details'><summary>{tr('Технічні подробиці для IT','Technische details voor IT')}</summary><p><strong>User-Agent</strong><code>{s.userAgent||'—'}</code></p><p><strong>IP</strong><code>{s.ip||'—'}</code></p><p><strong>ID</strong><code>{s.kind}:{s.fingerprint}</code></p><p><strong>{tr('Сервіс','Dienst')}</strong><code>{s.service}</code></p></details>
        <div className='sessie-rij-acties'>{s.tech&&<button type='button' className='sessie-secundair' data-sessie-tech-uit onClick={()=>void techUit(s)} disabled={busy||bezig}><Wrench aria-hidden/>{tr('Завершити технічний профіль','Technisch profiel beëindigen')}</button>}{Number(s.onthoudTot)>Date.now()&&<button type='button' className='sessie-secundair' data-sessie-onthoud-vergeten onClick={()=>void onthoudVergeten(s)} disabled={busy||bezig}><TimerReset aria-hidden/>{tr('Забути цей браузер (питати знову)','Deze browser vergeten (opnieuw vragen)')}</button>}<button type='button' className='security-revoke' onClick={()=>void onRevoke(s)} disabled={busy||bezig} title={s.kind==='remembered'?undefined:tr('Вхід завершиться разом із «запам\'ятованим браузером» цього входу: щоб повернутися на тому пристрої, знову знадобиться вхід через Google.','De aanmelding stopt samen met de «onthouden browser» ervan: om op dat apparaat terug te komen, is opnieuw aanmelden met Google nodig.')}><Trash2 aria-hidden/>{s.kind==='remembered'?tr('Забути цей браузер','Deze browser vergeten'):s.current?tr('Завершити цей вхід','Deze aanmelding beëindigen'):s.tech?tr('Завершити сесію (обидва)','Sessie beëindigen (beide)'):tr('Відкликати','Intrekken')}</button></div>
      </li>)}</ul>
      {intrekbaar.length>0&&<div className='sessie-apparaat-acties'>{!bevestig
        ?<button type='button' className='identity-danger' data-sessie-alle-op-apparaat onClick={()=>setBevestig(true)} disabled={busy||bezig}><Trash2 aria-hidden/>{tr('Завершити всі сесії на цьому пристрої','Alle sessies op dit apparaat beëindigen')}</button>
        :<div className='sessies-bevestig' role='group' aria-label={tr('Підтвердження','Bevestiging')}><p>{a.huidig?tr(`Завершити інші входи на цьому пристрої (${intrekbaar.length})? Вхід, у якому ви зараз, залишиться.`,`${intrekbaar.length} andere aanmeldingen op dit apparaat beëindigen? De aanmelding waarin u nu bent, blijft.`):tr(`Завершити всі входи на цьому пристрої (${intrekbaar.length})?`,`Alle ${intrekbaar.length} aanmeldingen op dit apparaat beëindigen?`)}</p>
          <button type='button' className='identity-danger' onClick={()=>void alles()} disabled={bezig}><Trash2 aria-hidden/>{bezig?tr('Завершую…','Bezig…'):tr('Так, завершити','Ja, beëindigen')}</button><button type='button' className='sessies-secundair' onClick={()=>setBevestig(false)} disabled={bezig}>{tr('Скасувати','Annuleren')}</button></div>}</div>}
    </div>}
  </article>;
}

export default function SecuritySessionsPanel({tr,sessions,loading,busy,onRefresh,onRevoke,onRevokeAll}:Props){
  const apparaten=useMemo(()=>groepeerPerApparaat(sessions),[sessions]);
  const[overal,setOveral]=useState(false);const aantal=sessions.filter(s=>s.kind!=='remembered').length,techAantal=sessions.filter(s=>s.tech).length,onthoudAantal=sessions.filter(s=>Number(s.onthoudTot)>Date.now()).length;
  return <div className='security-sessions'>
    <section className='security-session-summary'><div><ShieldCheck/><span><strong>{tr('Керування входами й пристроями','Aanmeldingen en apparaten beheren')}</strong><small>{sessions.length?tr(`${apparaten.length} ${mn(apparaten.length,'пристрій','пристрої','пристроїв')} · ${sessions.length} ${mn(sessions.length,'вхід','входи','входів')}. Натисніть на пристрій, щоб побачити сервіси й мережу.`,`${apparaten.length} apparaten · ${sessions.length} aanmeldingen. Klik op een apparaat voor diensten en netwerk.`):tr('Кожна картка пояснює, де й коли використовувався ваш акаунт.','Elke kaart legt uit waar en wanneer uw account is gebruikt.')}</small></span></div><button onClick={onRefresh} disabled={busy}><RefreshCw/>{tr('Оновити','Vernieuwen')}</button></section>
    {onthoudAantal>0&&<p className='security-onthoud-samenvatting' data-sessies-onthouden={onthoudAantal}>{tr(`Підтвердження запам’ятано у ${onthoudAantal} ${mn(onthoudAantal,'браузері','браузерах','браузерах')}. Важливі дії (схвалення випуску, видалення, ключі, passkey) усе одно питають завжди.`,`Bevestiging onthouden in ${onthoudAantal} ${onthoudAantal===1?'browser':'browsers'}. Belangrijke acties (uitrol goedkeuren, verwijderen, sleutels, passkeys) vragen altijd opnieuw.`)}</p>}
    {loading&&!sessions.length?<div className='security-empty'>{tr('Завантаження…','Laden…')}</div>:apparaten.length?<div className='sessie-apparaten'>{apparaten.map(a=><ApparaatKaart key={a.sleutel} a={a} tr={tr} busy={busy} onRevoke={onRevoke} onRefresh={onRefresh}/>)}</div>:<div className='security-empty'>{tr('Активних входів не знайдено.','Geen actieve aanmeldingen gevonden.')}</div>}
    <section className='security-danger-actions'>{!overal?<button className='identity-danger' data-sessies-overal onClick={()=>setOveral(true)}><Trash2/>{tr('Вийти всюди','Overal uitloggen')}</button>
      :<div className='sessies-bevestig' role='group' data-bevestig='overal'><p>{tr(`Завершити всі входи (${aantal}) і всі технічні профілі (${techAantal})? Після повторного входу технічний профіль знову вимагатиме підтвердження.`,`Alle aanmeldingen (${aantal}) en alle technische profielen (${techAantal}) beëindigen? Na opnieuw aanmelden vraagt het technisch profiel opnieuw om bevestiging.`)}</p>
        <button type='button' className='identity-danger' onClick={()=>{setOveral(false);onRevokeAll()}} disabled={busy}><Trash2 aria-hidden/>{tr('Так, вийти всюди','Ja, overal uitloggen')}</button><button type='button' className='sessies-secundair' onClick={()=>setOveral(false)} disabled={busy}>{tr('Скасувати','Annuleren')}</button></div>}</section>
  </div>;
}
