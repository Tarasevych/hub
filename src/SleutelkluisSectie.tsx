// «Шифрування моїх даних» / «Versleuteling van mijn gegevens» — Instellingen → «Способи входу» (id.*), migratie 0092.
//
// Wat de mens hier ziet en doet (alles in beide talen, nooit een geheim op het scherm behalve de EENMALIGE herstelcode):
//   • de stand: uit / aan-gesloten / aan-open, en voor welke ruimte (prive of technisch — de server beslist dat);
//   • inschakelen (sterke step-up): de herstelcode één keer, met Завантажити/Копіювати/«Я зберіг код»;
//   • ontgrendelen in deze sessie: met een gekoppelde passkey (PRF, in de browser) of met de herstelcode;
//   • de omslagen: welke passkeys gekoppeld zijn (en welke nog niet), AI-verbindingen met een eigen omslag, de herstelcode;
//   • SEC-002 (geheimen-04): na ontgrendelen met de herstelcode blijft de GEBRUIKTE code geldig tot de mens bevestigt dat hij
//     de nieuwe bewaard heeft («Готово»); een kluis zonder één omslag krijgt een eerlijke uitleg en «Скинути й увімкнути заново»;
//   • «Перешифрувати мої дані зараз»: oude rijen onder de eigen sleutel, met het resultaat per tabel;
//   • het register: wat al onder de eigen sleutel staat en wat nog niet — mét reden (shared/sleutelkluis.ts).
// Een passkey zonder PRF krijgt de eerlijke tekst KLUIS_TEKST.geenPrf en de weg via de herstelcode.
import {useEffect,useState} from 'react';
import {verborgenVoorAi} from './menselijke-actie'; // SEC-002 extensie-09: de nieuwe herstelcode leest de AI-extensie niet
import {AlertTriangle,Check,ChevronDown,Copy,Download,KeyRound,Lock,LockOpen,MonitorSmartphone,Plus,RefreshCw,ShieldCheck,Unplug,X} from 'lucide-react';
import {api} from './platform/client';
import {leesVergeten,swrPost} from './lees-cache';
import {metHervat,stapOpUitleg} from './platform/stap-op';
import {foutCode} from './platform/webauthn';
import {aanmeldOmslag,kanPrf,kekUitPrf,omslaan,omslagOpenen,passkeyMetPrf,type PrfAssertieOpties} from './platform/sleutelkluis-client';
import {InfoTip} from './InfoTip';
import {apparaatRecords,apparaatVergetenLokaal} from './platform/kluis-apparaat';
import type {Lang} from './toegangslaag-teksten';
import {KLUIS_FOUT,KLUIS_TEKST,opmaakHerstelcode,type KluisStand,type RegisterRegel} from '../shared/sleutelkluis';

type Overzicht={
  ruimte:'prive'|'technisch';stand:KluisStand;ingeschakeldOp:number;herversleuteldOp:number;
  houders:Array<{soort:'sessie'|'grant'|'intern';tot:number}>;
  omslagen:{wachtwoord?:{aangemaaktOp:number;laatstGebruiktOp:number}|null;aanmeldPasskeys?:string[];herstelcode:{aangemaaktOp:number;laatstGebruiktOp:number}|null;passkeys:Array<{passkeyId:string;prf:boolean;aangemaaktOp:number;laatstGebruiktOp:number}>;grants:Array<{grantId:string;aangemaaktOp:number;laatstGebruiktOp:number}>;apparaten?:Array<{id:string;label:string;aangemaaktOp:number;laatstGebruiktOp:number;verlooptOp:number}>};
  journaal:Array<{tabel:string;soort:string;aantal:number;laatstOp:number}>;
  register:RegisterRegel[];passkeys:Array<{id:string;naam:string;gekoppeld:boolean}>;pepperAanwezig:boolean;
  /** SEC-002 (geheimen-04): er wacht een nieuwe herstelcode op bevestiging / de kluis heeft geen enkele omslag. */
  herstelcodeWacht?:boolean;zonderOmslag?:boolean;
  /** KLUIS-AANMELDEN: mag de aanmelding met wachtwoord de sleutel openen (voorkeur, standaard ja). */
  wachtwoordOpent?:boolean;
  /** IDENTITEIT-015: перебіг повторного шифрування (стан у app.records) — «оброблено N з M», «Продовжити» після переривання. */
  herversleutelVoortgang?:Voortgang|null;
};
type Uitkomst={tabel:string;gevonden:number;herversleuteld:number;fout?:string};
type Voortgang={status:'geen'|'bezig'|'onderbroken'|'klaar';totaal:number;gedaan:number;tabellen:Uitkomst[];gestartOp:number;bijgewerktOp:number;klaarOp:number;reden?:string};
type Props={lang:Lang;context:Record<string,unknown>};
const P='/api/owner/sleutelkluis';
const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
const t2=(lang:Lang,t:{uk:string;nl:string})=>lang==='nl'?t.nl:t.uk;
const datum=(lang:Lang,ms?:number)=>ms?new Date(ms).toLocaleDateString(lang==='uk'?'uk-UA':'nl-BE',{day:'numeric',month:'short',year:'numeric'}):'';
const foutTekst=(lang:Lang,code:string)=>code==='STEP_UP_REQUIRED'||code==='STEP_UP_STRONG_REQUIRED'?stapOpUitleg():KLUIS_FOUT[code]?t2(lang,KLUIS_FOUT[code]):code==='NotAllowedError'||code==='AbortError'?tr(lang,'Скасовано.','Geannuleerd.'):tr(lang,'Не вдалося. ','Mislukt. ')+(code||tr(lang,'Немає зв’язку.','Geen verbinding.'));

/** IDENTITEIT-015 (kluis): одна дія розділу. Стан сервера перечитується І ПІСЛЯ ПОМИЛКИ: якщо ключ закрили в іншій вкладці посеред
 *  повторного шифрування, людина одразу бачить «закрито», «не завершено N з M» і шлях до «Продовжити» (раніше — застарілий «відкрито»
 *  до ручного перезавантаження). Ook na een fout de stand opnieuw lezen. */
export async function kluisActie(fn:()=>Promise<void>,h:{vergeten:()=>void;laden:()=>Promise<void>;fout:(code:string)=>void}):Promise<void>{
  try{await fn();}catch(c){h.fout(foutCode(c));}
  h.vergeten();
  await h.laden().catch(()=>undefined);
}

export function SleutelkluisSectie({lang,context}:Props){
  const[o,setO]=useState<Overzicht|null>(null);
  const[bezig,setBezig]=useState('');
  const[melding,setMelding]=useState<{ok:boolean;tekst:string}|null>(null);
  const[nieuweCode,setNieuweCode]=useState('');
  const[bewaard,setBewaard]=useState(false);
  const[codeInvoer,setCodeInvoer]=useState('');
  const[toonCode,setToonCode]=useState(false);
  const[uitslag,setUitslag]=useState<Uitkomst[]|null>(null);
  const[loopt,setLoopt]=useState<{gedaan:number;totaal:number}|null>(null); /* IDENTITEIT-015: живий перебіг у цій вкладці */
  const[toonRegister,setToonRegister]=useState(false);
  /* De getoonde code komt van «ontgrendelen met de herstelcode»: «Готово» bevestigt dan eerst bij de server (pas daarna vervalt de oude code). */
  const[moetBevestigen,setMoetBevestigen]=useState(false);

  const laden=async(alleenVers=false)=>{try{await swrPost<Overzicht>(`${P}/stand`,context,d=>{if(d&&typeof d==='object'&&typeof d.stand==='string')setO(d);},{alleenVers});}catch(c){setMelding({ok:false,tekst:foutTekst(lang,foutCode(c))});}};
  useEffect(()=>{void laden();},[]);// eslint-disable-line react-hooks/exhaustive-deps
  /* KLUIS-APPARAAT-001: welke onthouden apparaten zijn DIT apparaat (IndexedDB) — voor het merkteken «цей пристрій». */
  const[lokaal,setLokaal]=useState<string[]>([]);
  useEffect(()=>{void apparaatRecords().then(r=>setLokaal(r.map(x=>x.apparaatId))).catch(()=>undefined);},[o]);
  const doe=async(naam:string,fn:()=>Promise<void>)=>{setBezig(naam);setMelding(null);try{await kluisActie(fn,{vergeten:()=>leesVergeten(`${P}/stand`),laden:()=>laden(true),fout:code=>{console.error('[sleutelkluis]',naam,code);setMelding({ok:false,tekst:foutTekst(lang,code)});}});}finally{setBezig('');}};

  const inschakelen=()=>doe('inschakelen',async()=>{const r=(await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/inschakelen`,context))).data as {herstelcode:string};setNieuweCode(r.herstelcode);setBewaard(false);setMoetBevestigen(false);});
  const codeVernieuwen=()=>doe('code',async()=>{const r=(await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/herstelcode/vernieuwen`,context))).data as {herstelcode:string};setNieuweCode(r.herstelcode);setBewaard(false);setMoetBevestigen(false);});
  const ontgrendelCode=()=>doe('ontgrendel-code',async()=>{const r=(await api.post(`${P}/ontgrendelen/herstelcode`,{...context,code:codeInvoer})).data as {herstelcode:string};setCodeInvoer('');setToonCode(false);setNieuweCode(r.herstelcode);setBewaard(false);setMoetBevestigen(true);setMelding({ok:true,tekst:tr(lang,'Ключ відкрито. Збережіть новий код і натисніть «Готово»: лише тоді використаний код перестане діяти.','Sleutel geopend. Bewaar de nieuwe code en kies «Klaar»: pas dan werkt de gebruikte code niet meer.')});});
  /* «Готово» bij de getoonde code. Kwam de code van het ontgrendelen, dan eerst bevestigen: daarna is de nieuwe code de enige. */
  const codeKlaar=()=>doe('code-klaar',async()=>{if(moetBevestigen)await api.post(`${P}/herstelcode/bevestigen`,context);setNieuweCode('');setBewaard(false);setMoetBevestigen(false);});
  const codeBevestigen=()=>doe('code-bevestigen',async()=>{await api.post(`${P}/herstelcode/bevestigen`,context);setMoetBevestigen(false);setMelding({ok:true,tekst:tr(lang,'Підтверджено: тепер діє лише новий код відновлення.','Bevestigd: nu werkt alleen de nieuwe herstelcode.')});});
  const kluisHerstellen=()=>doe('herstellen',async()=>{await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/herstellen`,context));setMelding({ok:true,tekst:tr(lang,'Стан скинуто. Тепер увімкніть шифрування заново.','Toestand teruggezet. Schakel de versleuteling nu opnieuw in.')});});
  const vergrendelen=()=>doe('vergrendel',async()=>{await api.post(`${P}/vergrendelen`,context);});
  const ontgrendelPasskey=()=>doe('ontgrendel-passkey',async()=>{
    const opt=(await api.post(`${P}/passkey/ontgrendelen/opties`,context)).data as {uitdagingId:string;omslagen:Array<{passkeyId:string;credentialId:string;salt:string;envelop:string;aad:string;aanmeldAad?:string}>;publicKey:PrfAssertieOpties};
    const a=await passkeyMetPrf(opt.publicKey);
    if(!a.prf){setMelding({ok:false,tekst:t2(lang,KLUIS_TEKST.geenPrf)});return;}
    const omslag=opt.omslagen.find(x=>x.credentialId===a.credentialId);
    if(!omslag)throw Object.assign(new Error('SLEUTELKLUIS_PASSKEY_GEEN_OMSLAG'),{name:'SLEUTELKLUIS_PASSKEY_GEEN_OMSLAG'});
    const dek=await omslagOpenen(await kekUitPrf(a.prf),omslag.envelop,omslag.aad);
    const{prf:_p,prf2,...assertie}=a;
    const aanmeldEnvelop=await aanmeldOmslag(prf2,dek,omslag.aanmeldAad); /* KLUIS-AANMELDEN: voortaan opent de aanmelding met deze passkey de gegevens */
    await api.post(`${P}/passkey/ontgrendelen`,{...context,uitdagingId:opt.uitdagingId,assertie,dek,...(aanmeldEnvelop?{aanmeldEnvelop}:{})});
    setMelding({ok:true,tekst:tr(lang,'Ключ відкрито для цієї сесії.','Sleutel geopend voor deze sessie.')});
  });
  const passkeyKoppelen=()=>doe('koppelen',async()=>{
    const opt=(await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/passkey/koppelen/opties`,context))).data as {uitdagingId:string;dek:string;passkeys:Array<{id:string;credentialId:string;naam:string;salt:string;aad:string;aanmeldAad?:string}>;publicKey:PrfAssertieOpties};
    const a=await passkeyMetPrf(opt.publicKey);
    const{prf,prf2,...assertie}=a;
    if(!prf){await api.post(`${P}/passkey/koppelen`,{...context,uitdagingId:opt.uitdagingId,assertie,prfOndersteund:false});setMelding({ok:false,tekst:t2(lang,KLUIS_TEKST.geenPrf)});return;}
    const pk=opt.passkeys.find(x=>x.credentialId===a.credentialId);
    if(!pk)throw Object.assign(new Error('SLEUTELKLUIS_PASSKEY_ONBEKEND'),{name:'SLEUTELKLUIS_PASSKEY_ONBEKEND'});
    const kek=await kekUitPrf(prf);
    const envelop=await omslaan(kek,opt.dek,pk.aad);
    // Zelfproef vóór het opslaan: gaat de omslag hier open, dan werkt hij straks ook bij het ontgrendelen.
    if((await omslagOpenen(kek,envelop,pk.aad))!==opt.dek)throw Object.assign(new Error('SLEUTELKLUIS_OMSLAG_ONGELDIG'),{name:'SLEUTELKLUIS_OMSLAG_ONGELDIG'});
    const aanmeldEnvelop=await aanmeldOmslag(prf2,opt.dek,pk.aanmeldAad); /* KLUIS-AANMELDEN: ook de aanmelding met deze passkey opent de sleutel */
    await api.post(`${P}/passkey/koppelen`,{...context,uitdagingId:opt.uitdagingId,assertie,salt:pk.salt,envelop,prfOndersteund:true,...(aanmeldEnvelop?{aanmeldEnvelop}:{})});
    setMelding({ok:true,tekst:tr(lang,`Passkey «${pk.naam}» тепер відкриває ваш ключ.`,`Passkey «${pk.naam}» opent nu uw sleutel.`)});
  });
  // KLUIS-APPARAAT-001: een onthouden apparaat vergeten — de serverhelft weg (de browserhelft wordt waardeloos), op dit apparaat ook lokaal.
  const apparaatVergeten=(id:string)=>doe('apparaat',async()=>{await api.post(`${P}/apparaat/vergeten`,{...context,apparaatId:id});if(lokaal.includes(id))await apparaatVergetenLokaal(id);setMelding({ok:true,tekst:tr(lang,'Пристрій забуто: там дані знову розшифровуватимуться лише ключ доступу або кодом.','Apparaat vergeten: daar worden de gegevens weer alleen met passkey of code ontsleuteld.')});});
  /* KLUIS-AANMELDEN: пароль відкриває ключ під час входу — увімкнути (сильне підтвердження) або вимкнути (обгортку стерто одразу). */
  const wachtwoordZetten=(aan:boolean)=>doe('wachtwoord',async()=>{await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/wachtwoord/${aan?'aan':'uit'}`,context));setMelding({ok:true,tekst:aan?tr(lang,'Увімкнено: наступний вхід паролем одразу розшифрує дані.','Aan: de volgende aanmelding met wachtwoord ontsleutelt de gegevens meteen.'):tr(lang,'Вимкнено: пароль лише впускає в обліковий запис, обгортку ключа стерто.','Uit: het wachtwoord laat u alleen binnen; de omslag van de sleutel is gewist.')});});
  const ontkoppelen=(passkeyId:string)=>doe('ontkoppelen',async()=>{await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/passkey/ontkoppelen`,{...context,passkeyId}));});
  // IDENTITEIT-015 (етап 1.3): кроками по одній таблиці — видно «оброблено N з M»; закрили ключ або вкладку — стан лишається на сервері,
  // і «Продовжити» доводить роботу до кінця (уже оброблені таблиці не повторюються). Старт — із сильним підтвердженням, продовження — ні.
  const kroky=async(eerste:()=>Promise<{data:unknown}>)=>{let r=(await eerste()).data as {tabellen:Uitkomst[];voortgang:Voortgang};const alle=[...r.tabellen];setLoopt({gedaan:r.voortgang.gedaan,totaal:r.voortgang.totaal});setUitslag([...alle]);
    try{while(r.voortgang.status==='bezig'&&r.voortgang.gedaan<r.voortgang.totaal){r=(await api.post(`${P}/herversleutelen/verder`,{...context,maxTabellen:1})).data as {tabellen:Uitkomst[];voortgang:Voortgang};alle.push(...r.tabellen);setLoopt({gedaan:r.voortgang.gedaan,totaal:r.voortgang.totaal});setUitslag([...alle]);}}
    finally{setLoopt(null);}
    if(r.voortgang.status==='klaar')setMelding({ok:true,tekst:tr(lang,`Готово: оброблено ${r.voortgang.totaal} з ${r.voortgang.totaal}.`,`Klaar: ${r.voortgang.totaal} van ${r.voortgang.totaal} verwerkt.`)});};
  const herversleutelen=()=>doe('herversleutelen',()=>kroky(()=>metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/herversleutelen`,{...context,maxTabellen:1}))));
  const herversleutelenVerder=()=>doe('herversleutelen',()=>kroky(()=>api.post(`${P}/herversleutelen/verder`,{...context,maxTabellen:1})));

  const downloaden=()=>{const tekst=[tr(lang,'Mijn Ruimte — код відновлення ключа даних','Mijn Ruimte — herstelcode van de gegevenssleutel'),tr(lang,`Простір: ${o?.ruimte==='technisch'?'технічний':'особистий'} · ${new Date().toLocaleString('uk-UA')}`,`Ruimte: ${o?.ruimte==='technisch'?'technisch':'persoonlijk'} · ${new Date().toLocaleString('nl-BE')}`),tr(lang,'Без цього коду (або ключ доступу з PRF) ваші зашифровані дані НЕ відновити — навіть адміністратор сервера не зможе.','Zonder deze code (of een passkey met PRF) zijn uw versleutelde gegevens NIET te herstellen — ook de serverbeheerder niet.'),'',opmaakHerstelcode(nieuweCode),''].join('\r\n');
    const url=URL.createObjectURL(new Blob([tekst],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='mijn-ruimte-sleutel-herstelcode.txt';document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const kopieren=async()=>{try{await navigator.clipboard.writeText(opmaakHerstelcode(nieuweCode));setMelding({ok:true,tekst:tr(lang,'Код скопійовано.','Code gekopieerd.')});}catch{setMelding({ok:false,tekst:tr(lang,'Не вдалося скопіювати. Завантажте файл.','Kopiëren lukte niet. Download het bestand.')});}};

  const stand=o?.stand||'uit';
  const tone=stand==='open'?'good':stand==='gesloten'?'warn':'muted';
  const houders=Array.isArray(o?.houders)?o.houders:[];
  const omslagGrants=Array.isArray(o?.omslagen?.grants)?o.omslagen.grants:[];
  const register=Array.isArray(o?.register)?o.register:[];
  /* IDENTITEIT-015: незавершене повторне шифрування (перервано ключем або закритою вкладкою) */
  const onaf=o?.herversleutelVoortgang&&(o.herversleutelVoortgang.status==='bezig'||o.herversleutelVoortgang.status==='onderbroken')?o.herversleutelVoortgang:null;
  const serverGelezen=(Array.isArray(o?.journaal)?o.journaal:[]).filter(j=>j.soort==='serversleutel-gelezen'&&j.aantal>0);
  const overgeslagen=(Array.isArray(o?.journaal)?o.journaal:[]).filter(j=>j.soort==='gesloten-overgeslagen'&&j.aantal>0);
  const nietGekoppeld=(Array.isArray(o?.passkeys)?o.passkeys:[]).filter(p=>!p.gekoppeld);
  const gekoppeld=(Array.isArray(o?.passkeys)?o.passkeys:[]).filter(p=>p.gekoppeld);
  const ruimteNaam=o?.ruimte==='technisch'?tr(lang,'технічний простір','technische ruimte'):tr(lang,'особистий простір','persoonlijke ruimte');

  return <section className='access-plane-section' id='aanmeldmethoden-sleutelkluis' data-access-section='sleutelkluis' tabIndex={-1}>
    <header className='access-plane-section-head'><h2>{tr(lang,'Шифрування моїх даних','Versleuteling van mijn gegevens')}</h2>
      <InfoTip label={tr(lang,'Про шифрування даних','Over versleuteling van gegevens')}>
        <p>{tr(lang,'Ваші дані шифруються ключем, який є лише у вас: він відкривається ключ доступу (PRF) або кодом відновлення й живе в памʼяті сервера лише поки триває сесія або діє підключення ШІ.','Uw gegevens worden versleuteld met een sleutel die alleen u hebt: hij gaat open met een passkey (PRF) of de herstelcode en leeft alleen in het geheugen van de server zolang een sessie of een AI-verbinding loopt.')}</p>
        <p>{tr(lang,'Адміністратор сервера, резервна копія бази чи хтось із доступом до сайту без вашого входу прочитати їх не може. Технічний простір має окремий ключ.','De serverbeheerder, een back-up van de database of iemand met toegang tot de site kan ze zonder uw aanmelding niet lezen. De technische ruimte heeft een eigen sleutel.')}</p>
        <p><strong>{tr(lang,'Втрата коду відновлення і всіх ключів доступу = втрата даних. Ніхто не зможе їх відновити.','Verlies van de herstelcode én alle passkeys = verlies van de gegevens. Niemand kan ze terughalen.')}</strong></p>
      </InfoTip></header>
    <div className='access-plane-box'>
      <div className='access-plane-row' data-sleutelkluis-stand={stand}>
        {stand==='open'?<LockOpen className='access-plane-row-icon'/>:<Lock className='access-plane-row-icon'/>}
        <div className='access-plane-row-main'>
          <span className='access-plane-row-title'><strong>{tr(lang,'Ключ даних','Gegevenssleutel')}</strong><span className={`access-plane-badge tone-${tone}`}>{o?t2(lang,KLUIS_TEKST.stand[stand]):tr(lang,'Завантаження…','Laden…')}</span></span>
          <small>{o?`${ruimteNaam}${o.ingeschakeldOp?` · ${tr(lang,'увімкнено','aan sinds')} ${datum(lang,o.ingeschakeldOp)}`:''}${houders.length?` · ${tr(lang,'відкритий для','open voor')}: ${houders.filter(h=>h.soort==='sessie').length} ${tr(lang,'сесій','sessies')}, ${houders.filter(h=>h.soort==='grant').length} ${tr(lang,'підключень ШІ','AI-verbindingen')}`:''}`:''}</small>
          {stand==='gesloten'&&<small className='access-plane-warn'>{t2(lang,KLUIS_TEKST.gesloten)}</small>}
          {overgeslagen.length>0&&<small data-sleutelkluis-overgeslagen>{tr(lang,'Фонова синхронізація пропущена із закритим ключем: ','Achtergrondsynchronisatie overgeslagen met gesloten sleutel: ')}{overgeslagen.map(j=>`${j.tabel} (${j.aantal}, ${datum(lang,j.laatstOp)})`).join(', ')}</small>}
        </div>
        <div className='access-plane-row-actions'>
          {stand==='uit'&&<button type='button' disabled={!!bezig} onClick={()=>void inschakelen()}><ShieldCheck/>{tr(lang,'Увімкнути','Inschakelen')}</button>}
          {stand==='gesloten'&&!o?.zonderOmslag&&gekoppeld.length>0&&kanPrf()&&<button type='button' disabled={!!bezig} onClick={()=>void ontgrendelPasskey()}><KeyRound/>{tr(lang,'Розблокувати ключем доступу','Ontgrendelen met passkey')}</button>}
          {stand==='gesloten'&&!o?.zonderOmslag&&<button type='button' className='secondary' disabled={!!bezig} onClick={()=>setToonCode(v=>!v)}>{toonCode?<X/>:<KeyRound/>}{toonCode?tr(lang,'Закрити','Sluiten'):tr(lang,'Код відновлення','Herstelcode')}</button>}
          {stand==='open'&&<button type='button' className='secondary' disabled={!!bezig} onClick={()=>void vergrendelen()}><Lock/>{tr(lang,'Заблокувати','Vergrendelen')}</button>}
        </div>
      </div>
      {toonCode&&stand==='gesloten'&&<div className='access-plane-subrow access-plane-inline-form' data-sleutelkluis-code>
        <input type='text' autoComplete='off' autoFocus value={codeInvoer} onChange={e=>setCodeInvoer(e.target.value)} placeholder='XXXX-XXXX-XXXX-XXXX-XXXX' className='access-plane-mono'/>
        <button type='button' disabled={!!bezig||codeInvoer.replace(/[^A-Za-z2-9]/g,'').length<20} onClick={()=>void ontgrendelCode()}><LockOpen/>{tr(lang,'Розблокувати','Ontgrendelen')}</button>
      </div>}
      {o?.zonderOmslag&&<div className='access-plane-subrow' data-sleutelkluis-zonder-omslag>
        <strong><AlertTriangle aria-hidden/> {tr(lang,'Ключ неможливо відкрити','De sleutel kan niet open')}</strong>
        <small className='access-plane-warn'>{t2(lang,KLUIS_TEKST.zonderOmslag)}</small>
        <div className='access-plane-actions'><button type='button' disabled={!!bezig} title={tr(lang,'Прибирає лише порожній стан «увімкнено без ключа». Дані не зачіпаються. Потрібне підтвердження ключем доступу або кодом.','Verwijdert alleen de lege toestand «aan zonder sleutel». Gegevens blijven ongemoeid. Vraagt bevestiging met passkey of code.')} onClick={()=>void kluisHerstellen()}><RefreshCw/>{tr(lang,'Скинути й увімкнути заново','Terugzetten en opnieuw inschakelen')}</button></div>
      </div>}
      {o?.herstelcodeWacht&&!nieuweCode&&<div className='access-plane-subrow' data-sleutelkluis-code-wacht>
        <strong><AlertTriangle aria-hidden/> {tr(lang,'Новий код відновлення чекає на підтвердження','De nieuwe herstelcode wacht op bevestiging')}</strong>
        <small className='access-plane-warn'>{t2(lang,KLUIS_TEKST.codeWacht)}</small>
        <small>{t2(lang,KLUIS_TEKST.codeWachtZonderCode)}</small>
        {stand==='open'&&<div className='access-plane-actions'><button type='button' className='secondary' disabled={!!bezig} title={tr(lang,'Після підтвердження попередній код перестане діяти назавжди. Підтверджуйте лише якщо новий код у вас збережено.','Na bevestiging werkt de vorige code nooit meer. Bevestig alleen als u de nieuwe code bewaard hebt.')} onClick={()=>void codeBevestigen()}><Check/>{tr(lang,'Я зберіг новий код — підтвердити','Ik heb de nieuwe code bewaard — bevestigen')}</button></div>}
      </div>}
      {melding&&<p className='access-plane-notice access-plane-subrow' data-ok={melding.ok} role='status'>{melding.tekst}</p>}

      {nieuweCode&&<div className='access-plane-subrow herstel-nieuw' data-sleutelkluis-nieuwe-code>
        <strong>{tr(lang,'Збережіть код відновлення ключа','Bewaar de herstelcode van uw sleutel')}</strong>
        <small>{tr(lang,'Показуємо його лише зараз. Це єдиний спосіб відкрити дані без ключа доступу. Нікому не можна його відновити.','We tonen hem alleen nu. Het is de enige weg naar uw gegevens zonder passkey. Niemand kan hem terughalen.')}</small>
        {moetBevestigen&&<small className='access-plane-warn'>{t2(lang,KLUIS_TEKST.codeWacht)}</small>}
        <code className='access-plane-mono access-plane-secret' {...verborgenVoorAi}>{opmaakHerstelcode(nieuweCode)}</code>
        <div className='access-plane-actions herstel-knoppen'>
          <button type='button' className='secondary' onClick={downloaden}><Download/>{tr(lang,'Завантажити','Downloaden')}</button>
          <button type='button' className='secondary' onClick={()=>void kopieren()}><Copy/>{tr(lang,'Копіювати','Kopiëren')}</button>
        </div>
        <div className='herstel-klaar'>
          <label className='access-plane-switch'><input type='checkbox' checked={bewaard} onChange={e=>setBewaard(e.target.checked)}/>{tr(lang,'Я зберіг код','Ik heb de code bewaard')}</label>
          <button type='button' disabled={!bewaard||!!bezig} onClick={()=>void codeKlaar()}><Check/>{tr(lang,'Готово','Klaar')}</button>
        </div>
      </div>}

      {o&&stand!=='uit'&&<>
        <div className='access-plane-subrow' data-sleutelkluis-omslagen>
          <strong>{tr(lang,'Хто може відкрити ключ','Wie de sleutel kan openen')}</strong>
          <ul className='herstel-lijst sleutelkluis-lijst'>
            <li data-omslag='herstelcode'><span>{tr(lang,'Код відновлення','Herstelcode')}</span><small>{o.omslagen?.herstelcode?`${tr(lang,'створено','gemaakt')} ${datum(lang,o.omslagen.herstelcode.aangemaaktOp)}`:tr(lang,'немає','geen')}</small>
              {stand==='open'&&<button type='button' className='secondary' disabled={!!bezig} onClick={()=>void codeVernieuwen()}><RefreshCw/>{tr(lang,'Новий код','Nieuwe code')}</button>}</li>
            {gekoppeld.map(p=><li key={p.id} data-omslag='passkey'><span>Passkey «{p.naam}»</span><small>{tr(lang,'відкриває ключ (PRF)','opent de sleutel (PRF)')} · {(o.omslagen?.aanmeldPasskeys||[]).includes(p.id)?tr(lang,'вхід цим ключ доступу одразу розшифровує дані','aanmelden met deze passkey ontsleutelt meteen'):tr(lang,'вхід ним розшифровуватиме одразу після наступного розшифрування цим ключ доступу','aanmelden ontsleutelt meteen na de volgende ontgrendeling met deze passkey')}</small>
              {stand==='open'&&<button type='button' className='secondary' disabled={!!bezig} onClick={()=>void ontkoppelen(p.id)}><Unplug/>{tr(lang,'Відʼєднати','Loskoppelen')}</button>}</li>)}
            {(o.omslagen?.wachtwoord||o.wachtwoordOpent===false)&&<li data-omslag='wachtwoord'><span style={{display:'inline-flex',alignItems:'center',gap:6,flexWrap:'nowrap'}}><KeyRound aria-hidden='true' style={{width:16,height:16,flex:'none'}}/>{tr(lang,'Пароль','Wachtwoord')}{o.wachtwoordOpent!==false&&<span role='img' data-wachtwoord-risico aria-label={tr(lang,'Увага: ризик слабкого пароля','Let op: risico van een zwak wachtwoord')} title={tr(lang,'Ризик: копія бази даних дозволяє підбирати пароль без обмежень. Сильний довгий пароль, якого немає на інших сайтах, робить це марним; короткий — ні. Якщо пароль слабкий, вимкніть: вхід паролем працюватиме, а дані розшифровуватиме ключ доступу або знайомий пристрій.','Risico: met een kopie van de database kan het wachtwoord onbeperkt geraden worden. Een sterk, lang wachtwoord dat u nergens anders gebruikt maakt dat zinloos; een kort niet. Is het wachtwoord zwak, zet dit dan uit: aanmelden met wachtwoord blijft werken, ontsleutelen gaat dan met passkey of een bekend apparaat.')} style={{display:'inline-flex',cursor:'help'}}><AlertTriangle aria-hidden='true' style={{width:14,height:14,flex:'none',color:'var(--warning,#b86e00)'}}/></span>}</span>
              <small>{o.wachtwoordOpent===false?tr(lang,'вимкнено: пароль лише впускає в обліковий запис','uit: het wachtwoord laat u alleen binnen'):tr(lang,'вхід паролем одразу розшифровує дані','aanmelden met wachtwoord ontsleutelt meteen')}{o.omslagen?.wachtwoord?.laatstGebruiktOp?` · ${tr(lang,'востаннє','laatst')} ${datum(lang,o.omslagen.wachtwoord.laatstGebruiktOp)}`:''}</small>
              <button type='button' className='secondary' disabled={!!bezig} onClick={()=>void wachtwoordZetten(o.wachtwoordOpent===false)} title={o.wachtwoordOpent===false?tr(lang,'Після ввімкнення вхід паролем одразу розшифровуватиме дані. Ризик: хто скопіює базу даних, може підбирати слабкий пароль без обмежень. Потрібне підтвердження ключем доступу або кодом.','Na het aanzetten ontsleutelt aanmelden met wachtwoord meteen. Risico: wie de database kopieert, kan een zwak wachtwoord onbeperkt raden. Bevestiging met passkey of code nodig.'):tr(lang,'Сервер стирає обгортку ключа під паролем. Вхід паролем далі працює, але дані доведеться розшифрувати ключем доступу, кодом або на знайомому пристрої.','De server wist de omslag onder het wachtwoord. Aanmelden met wachtwoord blijft werken, maar ontsleutelen gaat dan met passkey, code of een bekend apparaat.')}>{o.wachtwoordOpent===false?<><LockOpen/>{tr(lang,'Увімкнути','Aanzetten')}</>:<><Unplug/>{tr(lang,'Вимкнути','Uitzetten')}</>}</button></li>}
            {nietGekoppeld.map(p=><li key={p.id} data-omslag='passkey-los'><span>Passkey «{p.naam}»</span><small>{tr(lang,'ще не відкриває ключ','opent de sleutel nog niet')}</small></li>)}
            {(Array.isArray(o.omslagen?.apparaten)?o.omslagen.apparaten:[]).map(d=><li key={d.id} data-omslag='apparaat'><span><MonitorSmartphone aria-hidden='true' style={{width:16,height:16,verticalAlign:'-3px',marginRight:6}}/>{d.label||tr(lang,'Пристрій','Apparaat')}{lokaal.includes(d.id)?` · ${tr(lang,'цей пристрій','dit apparaat')}`:''}</span><small>{tr(lang,'розшифровує сам після входу та оновлень','ontsleutelt vanzelf na aanmelden en updates')} · {tr(lang,'до','tot')} {datum(lang,d.verlooptOp)}{d.laatstGebruiktOp?` · ${tr(lang,'востаннє','laatst')} ${datum(lang,d.laatstGebruiktOp)}`:''}</small>
              <button type='button' className='secondary' disabled={!!bezig} onClick={()=>void apparaatVergeten(d.id)} title={tr(lang,'Сервер стирає свою половину ключа для цього пристрою. Там знадобиться ключ доступу або код відновлення. На ваші дані це не впливає.','De server wist zijn helft van de sleutel voor dit apparaat. Daar is dan een passkey of de herstelcode nodig. Uw gegevens blijven onaangeroerd.')}><Unplug/>{tr(lang,'Забути','Vergeten')}</button></li>)}
            {omslagGrants.map(g=><li key={g.grantId} data-omslag='grant'><span>{tr(lang,'Підключення ШІ','AI-verbinding')} {g.grantId.slice(0,8)}…</span><small>{tr(lang,'працює без сесії, поки дійсне','werkt zonder sessie zolang het geldig is')}{g.laatstGebruiktOp?` · ${datum(lang,g.laatstGebruiktOp)}`:''}</small></li>)}
          </ul>
          {stand==='open'&&nietGekoppeld.length>0&&<div className='access-plane-actions'><button type='button' className='secondary' disabled={!!bezig||!kanPrf()} onClick={()=>void passkeyKoppelen()}><Plus/>{tr(lang,'Додати ключ доступу як ключ','Passkey als sleutel toevoegen')}</button></div>}
          {!o.pepperAanwezig&&<small className='access-plane-warn'>{t2(lang,KLUIS_FOUT.SLEUTELKLUIS_PEPPER_ONTBREEKT)}</small>}
        </div>

        <div className='access-plane-subrow' data-sleutelkluis-herversleutelen>
          <strong>{tr(lang,'Старі записи','Oude rijen')}</strong>
          <small>{serverGelezen.length?tr(lang,`Ще серверним ключем читалося: ${serverGelezen.map(j=>`${j.tabel} (${j.aantal})`).join(', ')}.`,`Nog met de serversleutel gelezen: ${serverGelezen.map(j=>`${j.tabel} (${j.aantal})`).join(', ')}.`):tr(lang,'Записів, прочитаних серверним ключем, не зафіксовано.','Geen rijen met de serversleutel gelezen.')}{o.herversleuteldOp?` ${tr(lang,'Перешифровано','Herversleuteld')} ${datum(lang,o.herversleuteldOp)}.`:''}</small>
          {loopt&&<div className='sleutelkluis-voortgang' role='status' data-sleutelkluis-voortgang={`${loopt.gedaan}/${loopt.totaal}`}><progress max={Math.max(1,loopt.totaal)} value={loopt.gedaan}/><small>{tr(lang,`Оброблено ${loopt.gedaan} з ${loopt.totaal}. Не закривайте ключ; якщо вкладку закрити, роботу можна буде продовжити.`,`${loopt.gedaan} van ${loopt.totaal} verwerkt. Sluit de sleutel niet; sluit u het tabblad, dan kunt u later verdergaan.`)}</small></div>}
          {!loopt&&onaf&&<small className='access-plane-warn' data-sleutelkluis-onderbroken={`${onaf.gedaan}/${onaf.totaal}`}>{tr(lang,`Повторне шифрування не завершено: оброблено ${onaf.gedaan} з ${onaf.totaal}${onaf.reden==='sleutel-gesloten'?' (ключ закрили під час роботи)':''}.`,`Het herversleutelen is niet afgemaakt: ${onaf.gedaan} van ${onaf.totaal} verwerkt${onaf.reden==='sleutel-gesloten'?' (de sleutel ging dicht tijdens het werk)':''}.`)} {stand==='open'?tr(lang,'Натисніть «Продовжити» — уже оброблене не повторюватиметься.','Kies «Doorgaan» — wat al verwerkt is, wordt niet herhaald.'):tr(lang,'Розблокуйте ключ і натисніть «Продовжити».','Ontgrendel de sleutel en kies «Doorgaan».')}</small>}
          {stand==='open'&&<div className='access-plane-actions'>{onaf&&!loopt&&<button type='button' disabled={!!bezig} data-sleutelkluis-verder onClick={()=>void herversleutelenVerder()}><RefreshCw/>{tr(lang,'Продовжити','Doorgaan')}</button>}<button type='button' className='secondary' disabled={!!bezig} onClick={()=>void herversleutelen()}><RefreshCw/>{onaf?tr(lang,'Почати заново','Opnieuw beginnen'):tr(lang,'Перешифрувати мої дані зараз','Mijn gegevens nu herversleutelen')}</button></div>}
          {uitslag&&<ul className='herstel-lijst sleutelkluis-lijst' data-sleutelkluis-uitslag>{uitslag.map(u=><li key={u.tabel}><span className='access-plane-mono'>{u.tabel}</span><small>{u.fout?`${tr(lang,'помилка','fout')}: ${u.fout}`:`${u.herversleuteld}/${u.gevonden}`}</small></li>)}</ul>}
        </div>
      </>}

      {o&&<div className='access-plane-subrow' data-sleutelkluis-register>
        <button type='button' className='secondary sleutelkluis-register-knop' aria-expanded={toonRegister} onClick={()=>setToonRegister(v=>!v)}>
          <ShieldCheck aria-hidden='true'/>
          <span>{tr(lang,'Що вже під моїм ключем, а що ще ні','Wat al onder mijn sleutel staat en wat nog niet')}</span>
          <ChevronDown className='toegang-chevron' aria-hidden='true'/>
        </button>
        {toonRegister&&<ul className='herstel-lijst sleutelkluis-lijst'>{register.map(r=><li key={r.tabel} data-register-stand={r.stand}><span className='access-plane-mono'>{r.tabel}</span><small>{r.veld} · {r.stand==='dek'?tr(lang,'під моїм ключем (нові записи)','onder mijn sleutel (nieuwe rijen)'):`${tr(lang,'ще ні','nog niet')}: ${r.reden?t2(lang,r.reden):''}`}</small></li>)}</ul>}
      </div>}
    </div>
  </section>;
}
