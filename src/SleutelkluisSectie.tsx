// «Шифрування моїх даних» / «Versleuteling van mijn gegevens» — Instellingen → «Способи входу» (id.*), migratie 0092.
//
// Wat de mens hier ziet en doet (alles in beide talen, nooit een geheim op het scherm behalve de EENMALIGE herstelcode):
//   • de stand: uit / aan-gesloten / aan-open, en voor welke ruimte (prive of technisch — de server beslist dat);
//   • inschakelen (sterke step-up): de herstelcode één keer, met Завантажити/Копіювати/«Я зберіг код»;
//   • ontgrendelen in deze sessie: met een gekoppelde passkey (PRF, in de browser) of met de herstelcode;
//   • de omslagen: welke passkeys gekoppeld zijn (en welke nog niet), AI-verbindingen met een eigen omslag, de herstelcode;
//   • «Перешифрувати мої дані зараз»: oude rijen onder de eigen sleutel, met het resultaat per tabel;
//   • het register: wat al onder de eigen sleutel staat en wat nog niet — mét reden (shared/sleutelkluis.ts).
// Een passkey zonder PRF krijgt de eerlijke tekst KLUIS_TEKST.geenPrf en de weg via de herstelcode.
import {useEffect,useState} from 'react';
import {Check,ChevronDown,Copy,Download,KeyRound,Lock,LockOpen,Plus,RefreshCw,ShieldCheck,Unplug,X} from 'lucide-react';
import {api} from './platform/client';
import {leesVergeten,swrPost} from './lees-cache';
import {metHervat,stapOpUitleg} from './platform/stap-op';
import {foutCode} from './platform/webauthn';
import {kanPrf,kekUitPrf,omslaan,omslagOpenen,passkeyMetPrf,type PrfAssertieOpties} from './platform/sleutelkluis-client';
import {InfoTip} from './InfoTip';
import type {Lang} from './toegangslaag-teksten';
import {KLUIS_FOUT,KLUIS_TEKST,opmaakHerstelcode,type KluisStand,type RegisterRegel} from '../shared/sleutelkluis';

type Overzicht={
  ruimte:'prive'|'technisch';stand:KluisStand;ingeschakeldOp:number;herversleuteldOp:number;
  houders:Array<{soort:'sessie'|'grant'|'intern';tot:number}>;
  omslagen:{herstelcode:{aangemaaktOp:number;laatstGebruiktOp:number}|null;passkeys:Array<{passkeyId:string;prf:boolean;aangemaaktOp:number;laatstGebruiktOp:number}>;grants:Array<{grantId:string;aangemaaktOp:number;laatstGebruiktOp:number}>};
  journaal:Array<{tabel:string;soort:string;aantal:number;laatstOp:number}>;
  register:RegisterRegel[];passkeys:Array<{id:string;naam:string;gekoppeld:boolean}>;pepperAanwezig:boolean;
};
type Props={lang:Lang;context:Record<string,unknown>};
const P='/api/owner/sleutelkluis';
const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
const t2=(lang:Lang,t:{uk:string;nl:string})=>lang==='nl'?t.nl:t.uk;
const datum=(lang:Lang,ms?:number)=>ms?new Date(ms).toLocaleDateString(lang==='uk'?'uk-UA':'nl-BE',{day:'numeric',month:'short',year:'numeric'}):'';
const foutTekst=(lang:Lang,code:string)=>code==='STEP_UP_REQUIRED'||code==='STEP_UP_STRONG_REQUIRED'?stapOpUitleg():KLUIS_FOUT[code]?t2(lang,KLUIS_FOUT[code]):code==='NotAllowedError'||code==='AbortError'?tr(lang,'Скасовано.','Geannuleerd.'):tr(lang,'Не вдалося. ','Mislukt. ')+(code||tr(lang,'Немає зв’язку.','Geen verbinding.'));

export function SleutelkluisSectie({lang,context}:Props){
  const[o,setO]=useState<Overzicht|null>(null);
  const[bezig,setBezig]=useState('');
  const[melding,setMelding]=useState<{ok:boolean;tekst:string}|null>(null);
  const[nieuweCode,setNieuweCode]=useState('');
  const[bewaard,setBewaard]=useState(false);
  const[codeInvoer,setCodeInvoer]=useState('');
  const[toonCode,setToonCode]=useState(false);
  const[uitslag,setUitslag]=useState<Array<{tabel:string;gevonden:number;herversleuteld:number;fout?:string}>|null>(null);
  const[toonRegister,setToonRegister]=useState(false);

  const laden=async(alleenVers=false)=>{try{await swrPost<Overzicht>(`${P}/stand`,context,d=>{if(d&&typeof d==='object'&&typeof d.stand==='string')setO(d);},{alleenVers});}catch(c){setMelding({ok:false,tekst:foutTekst(lang,foutCode(c))});}};
  useEffect(()=>{void laden();},[]);// eslint-disable-line react-hooks/exhaustive-deps
  const doe=async(naam:string,fn:()=>Promise<void>)=>{setBezig(naam);setMelding(null);try{await fn();leesVergeten(`${P}/stand`);await laden(true);}catch(c){const code=foutCode(c);console.error('[sleutelkluis]',naam,code);setMelding({ok:false,tekst:foutTekst(lang,code)});}finally{setBezig('');}};

  const inschakelen=()=>doe('inschakelen',async()=>{const r=(await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/inschakelen`,context))).data as {herstelcode:string};setNieuweCode(r.herstelcode);setBewaard(false);});
  const codeVernieuwen=()=>doe('code',async()=>{const r=(await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/herstelcode/vernieuwen`,context))).data as {herstelcode:string};setNieuweCode(r.herstelcode);setBewaard(false);});
  const ontgrendelCode=()=>doe('ontgrendel-code',async()=>{const r=(await api.post(`${P}/ontgrendelen/herstelcode`,{...context,code:codeInvoer})).data as {herstelcode:string};setCodeInvoer('');setToonCode(false);setNieuweCode(r.herstelcode);setBewaard(false);setMelding({ok:true,tekst:tr(lang,'Ключ відкрито. Використаний код більше не діє — збережіть новий.','Sleutel geopend. De gebruikte code werkt niet meer — bewaar de nieuwe.')});});
  const vergrendelen=()=>doe('vergrendel',async()=>{await api.post(`${P}/vergrendelen`,context);});
  const ontgrendelPasskey=()=>doe('ontgrendel-passkey',async()=>{
    const opt=(await api.post(`${P}/passkey/ontgrendelen/opties`,context)).data as {uitdagingId:string;omslagen:Array<{passkeyId:string;credentialId:string;salt:string;envelop:string;aad:string}>;publicKey:PrfAssertieOpties};
    const a=await passkeyMetPrf(opt.publicKey);
    if(!a.prf){setMelding({ok:false,tekst:t2(lang,KLUIS_TEKST.geenPrf)});return;}
    const omslag=opt.omslagen.find(x=>x.credentialId===a.credentialId);
    if(!omslag)throw Object.assign(new Error('SLEUTELKLUIS_PASSKEY_GEEN_OMSLAG'),{name:'SLEUTELKLUIS_PASSKEY_GEEN_OMSLAG'});
    const dek=await omslagOpenen(await kekUitPrf(a.prf),omslag.envelop,omslag.aad);
    const{prf:_p,...assertie}=a;
    await api.post(`${P}/passkey/ontgrendelen`,{...context,uitdagingId:opt.uitdagingId,assertie,dek});
    setMelding({ok:true,tekst:tr(lang,'Ключ відкрито для цієї сесії.','Sleutel geopend voor deze sessie.')});
  });
  const passkeyKoppelen=()=>doe('koppelen',async()=>{
    const opt=(await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/passkey/koppelen/opties`,context))).data as {uitdagingId:string;dek:string;passkeys:Array<{id:string;credentialId:string;naam:string;salt:string;aad:string}>;publicKey:PrfAssertieOpties};
    const a=await passkeyMetPrf(opt.publicKey);
    const{prf,...assertie}=a;
    if(!prf){await api.post(`${P}/passkey/koppelen`,{...context,uitdagingId:opt.uitdagingId,assertie,prfOndersteund:false});setMelding({ok:false,tekst:t2(lang,KLUIS_TEKST.geenPrf)});return;}
    const pk=opt.passkeys.find(x=>x.credentialId===a.credentialId);
    if(!pk)throw Object.assign(new Error('SLEUTELKLUIS_PASSKEY_ONBEKEND'),{name:'SLEUTELKLUIS_PASSKEY_ONBEKEND'});
    const kek=await kekUitPrf(prf);
    const envelop=await omslaan(kek,opt.dek,pk.aad);
    // Zelfproef vóór het opslaan: gaat de omslag hier open, dan werkt hij straks ook bij het ontgrendelen.
    if((await omslagOpenen(kek,envelop,pk.aad))!==opt.dek)throw Object.assign(new Error('SLEUTELKLUIS_OMSLAG_ONGELDIG'),{name:'SLEUTELKLUIS_OMSLAG_ONGELDIG'});
    await api.post(`${P}/passkey/koppelen`,{...context,uitdagingId:opt.uitdagingId,assertie,salt:pk.salt,envelop,prfOndersteund:true});
    setMelding({ok:true,tekst:tr(lang,`Passkey «${pk.naam}» тепер відкриває ваш ключ.`,`Passkey «${pk.naam}» opent nu uw sleutel.`)});
  });
  const ontkoppelen=(passkeyId:string)=>doe('ontkoppelen',async()=>{await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/passkey/ontkoppelen`,{...context,passkeyId}));});
  const herversleutelen=()=>doe('herversleutelen',async()=>{const r=(await metHervat({actie:'sleutelkluis'},()=>api.post(`${P}/herversleutelen`,context))).data as {tabellen:Array<{tabel:string;gevonden:number;herversleuteld:number;fout?:string}>};setUitslag(r.tabellen);});

  const downloaden=()=>{const tekst=[tr(lang,'Mijn Ruimte — код відновлення ключа даних','Mijn Ruimte — herstelcode van de gegevenssleutel'),tr(lang,`Простір: ${o?.ruimte==='technisch'?'технічний':'особистий'} · ${new Date().toLocaleString('uk-UA')}`,`Ruimte: ${o?.ruimte==='technisch'?'technisch':'persoonlijk'} · ${new Date().toLocaleString('nl-BE')}`),tr(lang,'Без цього коду (або passkey з PRF) ваші зашифровані дані НЕ відновити — навіть адміністратор сервера не зможе.','Zonder deze code (of een passkey met PRF) zijn uw versleutelde gegevens NIET te herstellen — ook de serverbeheerder niet.'),'',opmaakHerstelcode(nieuweCode),''].join('\r\n');
    const url=URL.createObjectURL(new Blob([tekst],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='mijn-ruimte-sleutel-herstelcode.txt';document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const kopieren=async()=>{try{await navigator.clipboard.writeText(opmaakHerstelcode(nieuweCode));setMelding({ok:true,tekst:tr(lang,'Код скопійовано.','Code gekopieerd.')});}catch{setMelding({ok:false,tekst:tr(lang,'Не вдалося скопіювати. Завантажте файл.','Kopiëren lukte niet. Download het bestand.')});}};

  const stand=o?.stand||'uit';
  const tone=stand==='open'?'good':stand==='gesloten'?'warn':'muted';
  const houders=Array.isArray(o?.houders)?o.houders:[];
  const omslagGrants=Array.isArray(o?.omslagen?.grants)?o.omslagen.grants:[];
  const register=Array.isArray(o?.register)?o.register:[];
  const serverGelezen=(Array.isArray(o?.journaal)?o.journaal:[]).filter(j=>j.soort==='serversleutel-gelezen'&&j.aantal>0);
  const overgeslagen=(Array.isArray(o?.journaal)?o.journaal:[]).filter(j=>j.soort==='gesloten-overgeslagen'&&j.aantal>0);
  const nietGekoppeld=(Array.isArray(o?.passkeys)?o.passkeys:[]).filter(p=>!p.gekoppeld);
  const gekoppeld=(Array.isArray(o?.passkeys)?o.passkeys:[]).filter(p=>p.gekoppeld);
  const ruimteNaam=o?.ruimte==='technisch'?tr(lang,'технічний простір','technische ruimte'):tr(lang,'особистий простір','persoonlijke ruimte');

  return <section className='access-plane-section' id='aanmeldmethoden-sleutelkluis' data-access-section='sleutelkluis' tabIndex={-1}>
    <header className='access-plane-section-head'><h2>{tr(lang,'Шифрування моїх даних','Versleuteling van mijn gegevens')}</h2>
      <InfoTip label={tr(lang,'Про шифрування даних','Over versleuteling van gegevens')}>
        <p>{tr(lang,'Ваші дані шифруються ключем, який є лише у вас: він відкривається passkey (PRF) або кодом відновлення й живе в памʼяті сервера лише поки триває сесія або діє підключення ШІ.','Uw gegevens worden versleuteld met een sleutel die alleen u hebt: hij gaat open met een passkey (PRF) of de herstelcode en leeft alleen in het geheugen van de server zolang een sessie of een AI-verbinding loopt.')}</p>
        <p>{tr(lang,'Адміністратор сервера, резервна копія бази чи хтось із доступом до сайту без вашого входу прочитати їх не може. Технічний простір має окремий ключ.','De serverbeheerder, een back-up van de database of iemand met toegang tot de site kan ze zonder uw aanmelding niet lezen. De technische ruimte heeft een eigen sleutel.')}</p>
        <p><strong>{tr(lang,'Втрата коду відновлення і всіх passkey = втрата даних. Ніхто не зможе їх відновити.','Verlies van de herstelcode én alle passkeys = verlies van de gegevens. Niemand kan ze terughalen.')}</strong></p>
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
          {stand==='gesloten'&&gekoppeld.length>0&&kanPrf()&&<button type='button' disabled={!!bezig} onClick={()=>void ontgrendelPasskey()}><KeyRound/>{tr(lang,'Розблокувати passkey','Ontgrendelen met passkey')}</button>}
          {stand==='gesloten'&&<button type='button' className='secondary' disabled={!!bezig} onClick={()=>setToonCode(v=>!v)}>{toonCode?<X/>:<KeyRound/>}{toonCode?tr(lang,'Закрити','Sluiten'):tr(lang,'Код відновлення','Herstelcode')}</button>}
          {stand==='open'&&<button type='button' className='secondary' disabled={!!bezig} onClick={()=>void vergrendelen()}><Lock/>{tr(lang,'Заблокувати','Vergrendelen')}</button>}
        </div>
      </div>
      {toonCode&&stand==='gesloten'&&<div className='access-plane-subrow access-plane-inline-form' data-sleutelkluis-code>
        <input type='text' autoComplete='off' autoFocus value={codeInvoer} onChange={e=>setCodeInvoer(e.target.value)} placeholder='XXXX-XXXX-XXXX-XXXX-XXXX' className='access-plane-mono'/>
        <button type='button' disabled={!!bezig||codeInvoer.replace(/[^A-Za-z2-9]/g,'').length<20} onClick={()=>void ontgrendelCode()}><LockOpen/>{tr(lang,'Розблокувати','Ontgrendelen')}</button>
      </div>}
      {melding&&<p className='access-plane-notice access-plane-subrow' data-ok={melding.ok} role='status'>{melding.tekst}</p>}

      {nieuweCode&&<div className='access-plane-subrow herstel-nieuw' data-sleutelkluis-nieuwe-code>
        <strong>{tr(lang,'Збережіть код відновлення ключа','Bewaar de herstelcode van uw sleutel')}</strong>
        <small>{tr(lang,'Показуємо його лише зараз. Це єдиний спосіб відкрити дані без passkey. Нікому не можна його відновити.','We tonen hem alleen nu. Het is de enige weg naar uw gegevens zonder passkey. Niemand kan hem terughalen.')}</small>
        <code className='access-plane-mono access-plane-secret'>{opmaakHerstelcode(nieuweCode)}</code>
        <div className='access-plane-actions herstel-knoppen'>
          <button type='button' className='secondary' onClick={downloaden}><Download/>{tr(lang,'Завантажити','Downloaden')}</button>
          <button type='button' className='secondary' onClick={()=>void kopieren()}><Copy/>{tr(lang,'Копіювати','Kopiëren')}</button>
        </div>
        <div className='herstel-klaar'>
          <label className='access-plane-switch'><input type='checkbox' checked={bewaard} onChange={e=>setBewaard(e.target.checked)}/>{tr(lang,'Я зберіг код','Ik heb de code bewaard')}</label>
          <button type='button' disabled={!bewaard} onClick={()=>{setNieuweCode('');setBewaard(false);}}><Check/>{tr(lang,'Готово','Klaar')}</button>
        </div>
      </div>}

      {o&&stand!=='uit'&&<>
        <div className='access-plane-subrow' data-sleutelkluis-omslagen>
          <strong>{tr(lang,'Хто може відкрити ключ','Wie de sleutel kan openen')}</strong>
          <ul className='herstel-lijst sleutelkluis-lijst'>
            <li data-omslag='herstelcode'><span>{tr(lang,'Код відновлення','Herstelcode')}</span><small>{o.omslagen?.herstelcode?`${tr(lang,'створено','gemaakt')} ${datum(lang,o.omslagen.herstelcode.aangemaaktOp)}`:tr(lang,'немає','geen')}</small>
              {stand==='open'&&<button type='button' className='secondary' disabled={!!bezig} onClick={()=>void codeVernieuwen()}><RefreshCw/>{tr(lang,'Новий код','Nieuwe code')}</button>}</li>
            {gekoppeld.map(p=><li key={p.id} data-omslag='passkey'><span>Passkey «{p.naam}»</span><small>{tr(lang,'відкриває ключ (PRF)','opent de sleutel (PRF)')}</small>
              {stand==='open'&&<button type='button' className='secondary' disabled={!!bezig} onClick={()=>void ontkoppelen(p.id)}><Unplug/>{tr(lang,'Відʼєднати','Loskoppelen')}</button>}</li>)}
            {nietGekoppeld.map(p=><li key={p.id} data-omslag='passkey-los'><span>Passkey «{p.naam}»</span><small>{tr(lang,'ще не відкриває ключ','opent de sleutel nog niet')}</small></li>)}
            {omslagGrants.map(g=><li key={g.grantId} data-omslag='grant'><span>{tr(lang,'Підключення ШІ','AI-verbinding')} {g.grantId.slice(0,8)}…</span><small>{tr(lang,'працює без сесії, поки дійсне','werkt zonder sessie zolang het geldig is')}{g.laatstGebruiktOp?` · ${datum(lang,g.laatstGebruiktOp)}`:''}</small></li>)}
          </ul>
          {stand==='open'&&nietGekoppeld.length>0&&<div className='access-plane-actions'><button type='button' className='secondary' disabled={!!bezig||!kanPrf()} onClick={()=>void passkeyKoppelen()}><Plus/>{tr(lang,'Додати passkey як ключ','Passkey als sleutel toevoegen')}</button></div>}
          {!o.pepperAanwezig&&<small className='access-plane-warn'>{t2(lang,KLUIS_FOUT.SLEUTELKLUIS_PEPPER_ONTBREEKT)}</small>}
        </div>

        <div className='access-plane-subrow' data-sleutelkluis-herversleutelen>
          <strong>{tr(lang,'Старі записи','Oude rijen')}</strong>
          <small>{serverGelezen.length?tr(lang,`Ще серверним ключем читалося: ${serverGelezen.map(j=>`${j.tabel} (${j.aantal})`).join(', ')}.`,`Nog met de serversleutel gelezen: ${serverGelezen.map(j=>`${j.tabel} (${j.aantal})`).join(', ')}.`):tr(lang,'Записів, прочитаних серверним ключем, не зафіксовано.','Geen rijen met de serversleutel gelezen.')}{o.herversleuteldOp?` ${tr(lang,'Перешифровано','Herversleuteld')} ${datum(lang,o.herversleuteldOp)}.`:''}</small>
          {stand==='open'&&<div className='access-plane-actions'><button type='button' className='secondary' disabled={!!bezig} onClick={()=>void herversleutelen()}><RefreshCw/>{tr(lang,'Перешифрувати мої дані зараз','Mijn gegevens nu herversleutelen')}</button></div>}
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
