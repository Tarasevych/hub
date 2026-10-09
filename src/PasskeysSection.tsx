// Instellingen → «Способи входу» → Passkeys (RUNBOOK-VEILIGE-UITROL.md §13). Voor elke gebruiker: passkeys toevoegen,
// hernoemen en verwijderen. Alleen de eigenaar ziet per passkey «Може схвалювати оновлення сервера»: aanzetten legt een
// aanmelding bij root neer; root beslist (eerste sleutel via SSH, volgende met een passkey die root al vertrouwt).
// Weergave zoals GitHub «Sign in methods»: één rij «Passkeys» met rechts «Додати passkey»; de naam vragen we pas na die klik.
// Per passkey: soort (Google Менеджер паролів, Телефон або планшет, Ключ безпеки…), «Синхронізовано», Додано / Останнє використання.
// Uitleg (wat is een passkey, QR-hint) staat in de (?) naast de titel (InfoTip); elke rij: titel + één statusregel + knop.
// Nooit stil falen: tijdens «Продовжити» staat er een statusregel met «Скасувати» (AbortController), na 25 s een hint als er
// geen venster verscheen, en elke fout komt als melding in de sectie (en in de console).
// Geen window.confirm: verwijderen en intrekken bevestig je in de rij zelf. Step-up gaat via het venster «Підтвердіть доступ»;
// kies je daar Google, dan wordt «passkey toevoegen» (met de naam) na terugkeer automatisch hervat (stap-op.ts, metHervat/neemHervat).
// §13.10: per passkey waarvoor hij gebruikt is (actie, host, apparaat, IP-hash; laatste 20, uitklapbaar), een privénotitie
// (potloodje) en «Історія». Het recht om updates goed te keuren intrekken (en zo'n passkey verwijderen) vraagt een reden in de
// rij en een sterke bevestiging (passkey/app-code/herstelcode — Google alleen telt niet); terugzetten kan daarna alleen via SSH.
import {useEffect,useRef,useState} from 'react';
import {Check,Cloud,Fingerprint,KeyRound,Laptop,Pencil,Plus,ShieldCheck,Smartphone,Trash2,TriangleAlert,X} from 'lucide-react';
import {InfoTip} from './InfoTip';
import {api} from './platform/client';
import {swrPost} from './lees-cache';
import {metHervat,neemHervat} from './platform/stap-op';
import {GebruikLijst,GeschiedenisLijst,NotitieVeld,RedenVeld,redenOk,useNotities,type Gebruik,type GeschiedenisItem} from './ToegangContext';
import {foutCode,kanPasskey,passkeyAanmaken,passkeyBevestigen,type AssertieOpties,type RegistratieOpties} from './platform/webauthn';
import type {Lang} from './access-plane-copy';

type Status='alleen-aanmelden'|'wacht'|'kan-goedkeuren'|'wordt-ingetrokken';
type Soort='wachtwoordbeheerder'|'telefoon'|'beveiligingssleutel'|'apparaat'|'onbekend';
type Passkey={id:string;naam:string;aanbieder:string;soort?:Soort;viaTelefoon?:boolean;transports?:string[];synchroniseerbaar:boolean;gesynchroniseerd:boolean;aangemaaktOp:string;laatstGebruiktOp:string|null;vingerafdrukKort:string;goedkeuring?:Status;sshOpdracht?:string;gebruik?:Gebruik[];geschiedenis?:GeschiedenisItem[]};
type Lijst={rpId:string;limiet:number;passkeys:Passkey[];goedkeuring?:{schakelaar:boolean;rootRpId:string;rpKlopt:boolean;aantalBijRoot:number;onbekendBijRoot:Array<{vingerafdrukKort:string;label:string}>}};
type Props={lang:Lang;context:Record<string,unknown>;onChange?:()=>void};

const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
const datum=(lang:Lang,v?:string|null)=>v?new Date(v).toLocaleDateString(lang==='uk'?'uk-UA':'nl-BE',{day:'numeric',month:'short',year:'numeric'}):'';
const AANBIEDER:Record<string,[string,string]>={
  'Google Password Manager':['Google Менеджер паролів','Google Wachtwoordmanager'],
  'iCloud Keychain':['Зв’язка ключів iCloud','iCloud-sleutelhanger'],
  'Chrome (macOS)':['Chrome на Mac','Chrome op Mac'],
};
/** Leesbaar type van de passkey (zoals GitHub toont «Google Password Manager», «Security key»…). */
export const soortTekst=(lang:Lang,p:Pick<Passkey,'soort'|'aanbieder'>)=>{
  const a=p.aanbieder?(AANBIEDER[p.aanbieder]?tr(lang,AANBIEDER[p.aanbieder][0],AANBIEDER[p.aanbieder][1]):p.aanbieder):'';
  switch(p.soort){
    case 'wachtwoordbeheerder':return a||tr(lang,'Менеджер паролів','Wachtwoordmanager');
    case 'telefoon':return tr(lang,'Телефон або планшет','Telefoon of tablet');
    case 'beveiligingssleutel':return a?`${tr(lang,'Ключ безпеки','Beveiligingssleutel')} · ${a}`:tr(lang,'Ключ безпеки','Beveiligingssleutel');
    case 'apparaat':return a||tr(lang,'Вбудований у пристрій','Ingebouwd in apparaat');
    default:return a||'Passkey';
  }
};
const SoortIcoon=({soort}:{soort?:Soort})=>soort==='telefoon'?<Smartphone/>:soort==='beveiligingssleutel'?<KeyRound/>:soort==='wachtwoordbeheerder'?<Cloud/>:soort==='apparaat'?<Laptop/>:<Fingerprint/>;
const FOUTEN:Record<string,[string,string]>={
  AbortError:['Додавання passkey скасовано.','Passkey toevoegen geannuleerd.'],
  TimeoutError:['Час на підтвердження passkey вийшов. Спробуйте ще раз.','De tijd om de passkey te bevestigen is verstreken. Probeer het opnieuw.'],
  NotSupportedError:['Цей браузер або пристрій не може створити passkey.','Deze browser of dit apparaat kan geen passkey maken.'],
  STAP_OP_VENSTER_FOUT:['Не вдалося відкрити вікно «Підтвердіть доступ». Оновіть сторінку й спробуйте ще раз.','Het venster «Toegang bevestigen» kon niet openen. Vernieuw de pagina en probeer het opnieuw.'],
  NotAllowedError:['Підтвердження passkey скасовано або час вийшов.','Passkey-bevestiging geannuleerd of de tijd is verstreken.'],
  // Windows/Chrome: excludeCredentials — op dit apparaat staat al een passkey van u. Telefoon toevoegen gaat via de QR-keuze.
  InvalidStateError:['Цей пристрій уже має ваш passkey. Щоб додати телефон, у вікні Windows оберіть «Використовувати телефон або планшет».','Dit apparaat heeft al uw passkey. Om een telefoon toe te voegen, kiest u in het Windows-venster «Een telefoon of tablet gebruiken».'],
  SecurityError:['Браузер не дозволив passkey на цій адресі.','De browser staat de passkey op dit adres niet toe.'],
  PASSKEY_BESTAAT_AL:['Цей passkey уже додано.','Deze passkey is al toegevoegd.'],
  PASSKEY_LIMIET:['Досягнуто максимальної кількості passkey.','Het maximale aantal passkeys is bereikt.'],
  PASSKEY_KAN_GOEDKEUREN:['Цей passkey може схвалювати оновлення: для видалення вкажіть причину.','Deze passkey mag updates goedkeuren: geef een reden op om hem te verwijderen.'],
  REDEN_TE_KORT:['Вкажіть причину (щонайменше 10 символів).','Geef een reden op (minstens 10 tekens).'],
  REDEN_TE_LANG:['Причина задовга (максимум 500 символів).','De reden is te lang (maximaal 500 tekens).'],
  STEP_UP_STRONG_REQUIRED:['Потрібне підтвердження passkey, кодом із застосунку або кодом відновлення (повторного входу Google недостатньо).','Bevestiging met passkey, app-code of herstelcode is nodig (opnieuw inloggen bij Google is niet genoeg).'],
  INTREKKEN_LOOPT_AL:['Запит на відкликання вже передано серверу.','Het intrekverzoek is al aan de server doorgegeven.'],
  OPNIEUW_VIA_SSH:['Право цього ключа відкликано через застосунок; повернути його можна лише SSH-командою на сервері.','Het recht van deze sleutel is via de app ingetrokken; terugzetten kan alleen met de SSH-opdracht op de server.'],
  OWNER_REQUIRED:['Це може лише власник.','Dit kan alleen de eigenaar.'],
  PASSKEY_GEEN_VERIFICATIE:['Потрібне розблокування (відбиток, обличчя або PIN).','Ontgrendeling is vereist (vingerafdruk, gezicht of pincode).'],
  PASSKEY_SLEUTEL_ONBEKEND:['Цей passkey не підтверджено на сервері.','Deze passkey is niet bevestigd op de server.'],
  UITDAGING_ONGELDIG:['Запит застарів або вже використаний. Спробуйте ще раз.','Het verzoek is verlopen of al gebruikt. Probeer het opnieuw.'],
  EERSTE_VIA_SSH:['Перший passkey сервер приймає лише через SSH-команду.','De eerste passkey neemt de server alleen via de SSH-opdracht aan.'],
  GEEN_PASSKEY:['На сервері ще немає passkey, що може схвалювати.','De server heeft nog geen passkey die mag goedkeuren.'],
  STEP_UP_REQUIRED:['Потрібне додаткове підтвердження. Спробуйте ще раз.','Extra bevestiging is nodig. Probeer het opnieuw.'],
  RATE_LIMITED:['Забагато спроб. Зачекайте кілька хвилин.','Te veel pogingen. Wacht een paar minuten.'],
  NAAM_ONGELDIG:['Вкажіть назву.','Geef een naam op.'],
};
const foutTekst=(lang:Lang,code:string)=>{const t=FOUTEN[code];return t?tr(lang,t[0],t[1]):tr(lang,'Не вдалося. ','Mislukt. ')+(code||tr(lang,'Немає зв’язку.','Geen verbinding.'));};
export const QR_HINT:[string,string]=['Щоб зберегти passkey на телефоні, виберіть «Використовувати телефон або планшет» і відскануйте QR-код камерою телефону (Bluetooth має бути увімкнено).','Om de passkey op je telefoon op te slaan, kies je «Een telefoon of tablet gebruiken» en scan je de QR-code met de camera van je telefoon (Bluetooth moet aan staan).'];
const STATUS:Record<Status,[string,string,string]>={
  'alleen-aanmelden':['Лише вхід','Alleen aanmelden','muted'],
  wacht:['Чекає підтвердження сервером','Wacht op bevestiging door de server','warn'],
  'kan-goedkeuren':['Може схвалювати оновлення','Mag updates goedkeuren','good'],
  'wordt-ingetrokken':['Відкликається сервером…','Wordt ingetrokken door de server…','warn'],
};
const kanGoedkeuren=(p:Passkey)=>p.goedkeuring==='kan-goedkeuren'||p.goedkeuring==='wordt-ingetrokken';

export function PasskeysSection({lang,context,onChange}:Props){
  const[data,setData]=useState<Lijst|null>(null);
  const[busy,setBusy]=useState('');
  const[notice,setNotice]=useState<{ok:boolean;text:string}|null>(null);
  const[nieuw,setNieuw]=useState<{naam:string}|null>(null);
  const[hernoem,setHernoem]=useState<{id:string;naam:string}|null>(null);
  const[bevestig,setBevestig]=useState<{id:string;wat:'verwijderen'|'intrekken'}|null>(null);
  const[reden,setReden]=useState('');
  const notities=useNotities(context);
  // Safari: WebAuthn soms alleen direct na een tik. Dan een knop om dezelfde stap meteen opnieuw te doen.
  const[herhaal,setHerhaal]=useState<null|(()=>Promise<string|void>)>(null);
  const ondersteund=kanPasskey();
  const hervat=useRef(false);
  const afbreken=useRef<AbortController|null>(null);
  // Wacht op het passkey-venster van browser/Windows: 'venster'; na 25 s zonder antwoord: 'traag' (extra hint).
  const[wacht,setWacht]=useState<''|'venster'|'traag'>('');

  // Fase B1: bewaarde lijst meteen, dan vers (alleen geheugen, per account); afbreken als de pagina verdwijnt.
  const laden=async(o:{signal?:AbortSignal;alleenVers?:boolean}={alleenVers:true})=>{
    try{await swrPost<Lijst>('/api/owner/access/passkeys/lijst',context,d=>setData(d),o);}
    catch(c){setNotice({ok:false,text:foutTekst(lang,foutCode(c))});}
  };
  useEffect(()=>{const a=new AbortController();void laden({signal:a.signal});return()=>a.abort();},[lang]);// eslint-disable-line react-hooks/exhaustive-deps

  const doe=async(sleutel:string,run:()=>Promise<string|void>)=>{
    setBusy(sleutel);setNotice(null);setHerhaal(null);
    try{const ok=await run();if(ok)setNotice({ok:true,text:ok});await laden();onChange?.();}
    catch(c){const code=foutCode(c);(code==='AbortError'?console.info:console.error)('[passkeys]',sleutel,code,c);if(code==='NotAllowedError')setHerhaal(()=>run);setNotice({ok:false,text:foutTekst(lang,code)});}
    finally{setBusy('');setWacht('');afbreken.current=null;}
  };

  const toevoegenMet=(naam:string)=>doe('nieuw',()=>metHervat({actie:'passkey-toevoegen',gegevens:{naam}},async()=>{
    const o=(await api.post('/api/owner/access/passkeys/registreren/opties',context)).data as {uitdagingId:string;publicKey:RegistratieOpties};
    const ac=new AbortController();afbreken.current=ac;setWacht('venster');
    const traag=window.setTimeout(()=>setWacht(w=>w==='venster'?'traag':w),25_000);
    let cred;
    try{cred=await passkeyAanmaken(o.publicKey,ac.signal);}finally{window.clearTimeout(traag);setWacht('');}
    await api.post('/api/owner/access/passkeys/registreren',{...context,uitdagingId:o.uitdagingId,naam:naam.trim(),...cred});
    setNieuw(null);
    return tr(lang,'Passkey додано.','Passkey toegevoegd.');
  }));
  // Terug van «Підтвердити повторним входом через Google»: dezelfde actie met dezelfde naam meteen hervatten.
  useEffect(()=>{
    if(hervat.current||!ondersteund)return;hervat.current=true;
    const h=neemHervat('passkey-toevoegen');
    if(h){const naam=String(h.gegevens?.naam||'');setNieuw({naam});void toevoegenMet(naam);}
  },[]);// eslint-disable-line react-hooks/exhaustive-deps

  const opslaanNaam=()=>{if(!hernoem)return;const h=hernoem;void doe(`naam-${h.id}`,async()=>{await api.post('/api/owner/access/passkeys/hernoemen',{...context,id:h.id,naam:h.naam});setHernoem(null);});};
  // Een passkey die updates mag goedkeuren: reden verplicht; de server vraagt dan een sterke bevestiging en trekt het recht bij root in.
  const verwijderen=(p:Passkey)=>{const metReden=kanGoedkeuren(p);const r=reden.trim();void doe(`weg-${p.id}`,async()=>{
    await metHervat({actie:'passkey-verwijderen'},()=>api.post('/api/owner/access/passkeys/verwijderen',{...context,id:p.id,...(metReden?{reden:r}:{})}));
    setBevestig(null);setReden('');
    return metReden
      ?tr(lang,'Passkey видалено; сервер відкликає його право схвалювати оновлення. Повернути право можна лише через SSH.','Passkey verwijderd; de server trekt het recht om updates goed te keuren in. Terugzetten kan alleen via SSH.')
      :tr(lang,'Passkey видалено.','Passkey verwijderd.');
  });};
  const rechtIntrekken=(p:Passkey)=>{const r=reden.trim();void doe(`intrekken-${p.id}`,async()=>{
    await api.post('/api/owner/access/passkeys/goedkeuring/recht-intrekken',{...context,id:p.id,reden:r});
    setBevestig(null);setReden('');
    return tr(lang,'Запит передано серверу: право схвалювати оновлення буде відкликано за кілька секунд. Повернути його можна лише SSH-командою на сервері.','Verzoek doorgegeven aan de server: het recht om updates goed te keuren wordt binnen enkele seconden ingetrokken. Terugzetten kan alleen met de SSH-opdracht op de server.');
  });};
  const aanvragen=(p:Passkey)=>doe(`aan-${p.id}`,async()=>{
    const r=(await api.post('/api/owner/access/passkeys/goedkeuring/aanvragen',{...context,id:p.id})).data as {eerste:boolean;viaSsh?:boolean};
    return r.eerste||r.viaSsh
      ?(r.eerste?tr(lang,'Запит передано серверу. Це перший такий ключ: підтвердьте його SSH-командою нижче.','Aanvraag doorgegeven aan de server. Dit is de eerste zo’n sleutel: bevestig hem met de SSH-opdracht hieronder.')
        :tr(lang,'Запит передано серверу. Право цього ключа раніше відкликали через застосунок, тому повернути його можна лише SSH-командою нижче.','Aanvraag doorgegeven aan de server. Het recht van deze sleutel is eerder via de app ingetrokken; terugzetten kan daarom alleen met de SSH-opdracht hieronder.'))
      :tr(lang,'Запит передано серверу. Тепер підтвердьте його passkey, який уже може схвалювати.','Aanvraag doorgegeven aan de server. Bevestig hem nu met een passkey die al mag goedkeuren.');
  });
  const annuleren=(p:Passkey)=>doe(`ann-${p.id}`,async()=>{await api.post('/api/owner/access/passkeys/goedkeuring/annuleren',{...context,id:p.id});});
  const metRootSleutel=(p:Passkey,doel:'bevestigen')=>{setBevestig(null);void doe(`${doel}-${p.id}`,async()=>{
    const u=(await api.post(`/api/owner/access/passkeys/goedkeuring/${doel}/opties`,{...context,id:p.id})).data as {uitdagingId:string;publicKey:AssertieOpties};
    const assertie=await passkeyBevestigen(u.publicKey);
    await api.post(`/api/owner/access/passkeys/goedkeuring/${doel}`,{...context,uitdagingId:u.uitdagingId,assertie});
    return tr(lang,'Запит передано серверу; він сам перевірить підпис. Стан оновиться за кілька секунд.','Verzoek doorgegeven aan de server; die controleert de handtekening zelf. De status wordt binnen enkele seconden bijgewerkt.');
  });};

  const g=data?.goedkeuring;
  const aantal=data?.passkeys.length||0;
  const vol=!!data&&aantal>=data.limiet;
  return <div className='access-plane-group' id='aanmeldmethoden-passkeys' data-access-section='passkeys'>
    <div className='access-plane-row'>
      <Fingerprint className='access-plane-row-icon'/>
      <div className='access-plane-row-main'>
        <span className='access-plane-row-title'><strong>{tr(lang,'Passkeys','Passkeys')}</strong>
          <InfoTip label={tr(lang,'Що таке passkey?','Wat is een passkey?')}>
            <p>{tr(lang,'Passkey — це ключ на телефоні чи комп’ютері, який розблоковується відбитком, обличчям або PIN. Ним підтверджують важливі дії замість пароля.','Een passkey is een sleutel op je telefoon of computer die je ontgrendelt met vingerafdruk, gezicht of pincode. Je bevestigt er belangrijke acties mee zonder wachtwoord.')}</p>
            <p data-qr-hint>{tr(lang,QR_HINT[0],QR_HINT[1])}</p>
          </InfoTip></span>
        <small>{!data?tr(lang,'Завантаження…','Laden…'):aantal?tr(lang,`Додано: ${aantal}`,`Toegevoegd: ${aantal}`):tr(lang,'Ще не додано','Nog niet toegevoegd')}</small>
      </div>
      <div className='access-plane-row-actions'>
        {!nieuw&&<button type='button' className='secondary' disabled={!!busy||!ondersteund||vol||!data} onClick={()=>{setNotice(null);setNieuw({naam:''});}}><Plus/>{tr(lang,'Додати passkey','Passkey toevoegen')}</button>}
      </div>
    </div>

    {nieuw&&<div className='access-plane-subrow access-plane-nieuw'>
      <label htmlFor='passkey-naam'>{tr(lang,'Назва passkey','Naam van de passkey')}</label>
      <div className='access-plane-inline-form'>
        <input id='passkey-naam' autoFocus value={nieuw.naam} maxLength={60} disabled={busy==='nieuw'} onChange={e=>setNieuw({naam:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!busy)void toevoegenMet(nieuw.naam);if(e.key==='Escape'&&!busy)setNieuw(null);}} placeholder={tr(lang,'Наприклад: Мій телефон (необов’язково)','Bijvoorbeeld: Mijn telefoon (optioneel)')}/>
        {busy!=='nieuw'&&<button type='button' disabled={!!busy} onClick={()=>void toevoegenMet(nieuw.naam)}><Fingerprint/>{tr(lang,'Продовжити','Doorgaan')}</button>}
        <button type='button' className='secondary' onClick={()=>{if(afbreken.current)afbreken.current.abort();else if(!busy)setNieuw(null);}} disabled={busy==='nieuw'&&!wacht}><X/>{tr(lang,'Скасувати','Annuleren')}</button>
      </div>
      {busy==='nieuw'&&<p className='access-plane-pending' role='status' aria-live='polite' data-passkey-wacht={wacht||'server'}><span className='access-plane-spinner' aria-hidden='true'/>{
        wacht==='traag'?tr(lang,'Вікно passkey не з’явилося? Перевірте, чи воно не сховане за браузером, або натисніть «Скасувати» й спробуйте ще раз.','Geen passkey-venster te zien? Kijk of het achter de browser staat, of klik op «Annuleren» en probeer het opnieuw.')
        :wacht==='venster'?tr(lang,'Відкрито вікно passkey браузера або Windows. Підтвердіть відбитком, обличчям, PIN або телефоном.','Het passkey-venster van de browser of Windows is open. Bevestig met vingerafdruk, gezicht, pincode of telefoon.')
        :tr(lang,'Готуємо запит…','Verzoek wordt voorbereid…')}</p>}
    </div>}

    {notice&&<p className='access-plane-notice access-plane-subrow' data-ok={notice.ok} role='status'>{notice.text}</p>}
    {herhaal&&<div className='access-plane-actions access-plane-subrow'><button type='button' className='primary' disabled={!!busy} onClick={()=>{const run=herhaal;void doe('herhaal',run);}}><Fingerprint/>{tr(lang,'Підтвердити passkey ще раз','Passkey opnieuw bevestigen')}</button></div>}
    {!ondersteund&&<p className='access-plane-notice access-plane-subrow'>{tr(lang,'Цей браузер не підтримує passkey.','Deze browser ondersteunt geen passkeys.')}</p>}
    {g&&!g.rpKlopt&&<p className='access-plane-lockout access-plane-subrow'><TriangleAlert/>{tr(lang,`Сервер ще налаштований на passkey для ${g.rootRpId}. Поки адміністратор не виконає на сервері «sudo mijn-ruimte-passkey rp-bijwerken», нові passkey не зможуть схвалювати оновлення.`,`De server staat nog ingesteld op passkeys voor ${g.rootRpId}. Zolang de beheerder op de server niet «sudo mijn-ruimte-passkey rp-bijwerken» uitvoert, kunnen nieuwe passkeys geen updates goedkeuren.`)}</p>}
    {g&&!g.schakelaar&&aantal>0&&<p className='access-plane-notice access-plane-subrow'>{tr(lang,'Схвалення оновлень через passkey зараз вимкнено на сервері (перемикач «passkey-goedkeuring»). Ключі можна підготувати заздалегідь.','Updates goedkeuren met een passkey staat nu uit op de server (schakelaar «passkey-goedkeuring»). Je kunt de sleutels al voorbereiden.')}</p>}

    {aantal>0&&<ul className='access-plane-sublist'>
      {data!.passkeys.map(p=><li key={p.id} className='access-plane-row' data-passkey={p.id}>
        <span className='access-plane-row-icon'><SoortIcoon soort={p.soort}/></span>
        <div className='access-plane-row-main'>
          {hernoem?.id===p.id
            ?<div className='access-plane-inline-form'><input value={hernoem.naam} maxLength={60} autoFocus onChange={e=>setHernoem({id:p.id,naam:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')opslaanNaam();if(e.key==='Escape')setHernoem(null);}}/>
              <button type='button' disabled={!!busy||!hernoem.naam.trim()} onClick={opslaanNaam}><Check/>{tr(lang,'Зберегти','Opslaan')}</button>
              <button type='button' className='secondary' onClick={()=>setHernoem(null)}><X/>{tr(lang,'Скасувати','Annuleren')}</button></div>
            :<span className='access-plane-row-title'><strong>{p.naam}</strong>{p.gesynchroniseerd&&<span className='access-plane-badge tone-info'>{tr(lang,'Синхронізовано','Gesynchroniseerd')}</span>}{!p.synchroniseerbaar&&p.soort!=='telefoon'&&<span className='access-plane-badge tone-muted'>{tr(lang,'Лише на цьому пристрої','Alleen op dit apparaat')}</span>}</span>}
          <small>{soortTekst(lang,p)} · {tr(lang,'Додано ','Toegevoegd op ')}{datum(lang,p.aangemaaktOp)} · {p.laatstGebruiktOp?tr(lang,'Останнє використання ','Laatst gebruikt op ')+datum(lang,p.laatstGebruiktOp):tr(lang,'Ще не використовувався','Nog niet gebruikt')}</small>
          <NotitieVeld lang={lang} soort='passkey' sleutel={p.id} notities={notities}/>
          {bevestig?.id===p.id&&(()=>{const metReden=bevestig.wat==='intrekken'||kanGoedkeuren(p);return <div className='access-plane-confirm' role='group' data-bevestig={bevestig.wat}>
            <span>{bevestig.wat==='verwijderen'
              ?(metReden
                ?tr(lang,`Видалити passkey «${p.naam}»? Він може схвалювати оновлення сервера: сервер відкликає це право, а повернути його можна буде лише SSH-командою.`,`Passkey «${p.naam}» verwijderen? Hij mag serverupdates goedkeuren: de server trekt dat recht in en terugzetten kan daarna alleen met een SSH-opdracht.`)
                :tr(lang,`Видалити passkey «${p.naam}»? Ним більше не можна буде підтверджувати дії.`,`Passkey «${p.naam}» verwijderen? Je kunt er dan geen acties meer mee bevestigen.`))
              :tr(lang,`Забрати в «${p.naam}» право схвалювати оновлення? Повернути його можна буде лише через SSH на сервері.`,`«${p.naam}» het recht ontnemen om updates goed te keuren? Terugzetten kan daarna alleen via SSH op de server.`)}</span>
            {metReden&&<RedenVeld lang={lang} id={`reden-${p.id}`} waarde={reden} zet={setReden} disabled={!!busy}/>}
            {metReden&&<small className='access-plane-hint-line'>{tr(lang,'Далі потрібне підтвердження passkey, кодом із застосунку або кодом відновлення.','Daarna is bevestiging met passkey, app-code of herstelcode nodig.')}</small>}
            <div className='access-plane-actions'>
              <button type='button' className='danger' disabled={!!busy||(metReden&&!redenOk(reden))} onClick={()=>bevestig.wat==='verwijderen'?verwijderen(p):rechtIntrekken(p)}><Trash2/>{bevestig.wat==='verwijderen'?tr(lang,'Видалити','Verwijderen'):tr(lang,'Забрати право','Recht intrekken')}</button>
              <button type='button' className='secondary' onClick={()=>{setBevestig(null);setReden('');}}><X/>{tr(lang,'Скасувати','Annuleren')}</button>
            </div>
          </div>;})()}
          {p.goedkeuring&&<div className='access-plane-owner'>
            <span className={`access-plane-badge tone-${STATUS[p.goedkeuring][2]}`}>{tr(lang,STATUS[p.goedkeuring][0],STATUS[p.goedkeuring][1])}</span>
            {p.goedkeuring==='alleen-aanmelden'&&<label className='access-plane-switch'><input type='checkbox' checked={false} disabled={!!busy} onChange={()=>void aanvragen(p)}/>{tr(lang,'Може схвалювати оновлення сервера','Mag serverupdates goedkeuren')}</label>}
            {p.goedkeuring==='wacht'&&<>
              {p.sshOpdracht
                ?<small>{tr(lang,'Перший ключ: виконайте на сервері через SSH і звірте відбиток','Eerste sleutel: voer op de server via SSH uit en vergelijk de vingerafdruk')} <code className='access-plane-mono access-plane-ssh'>{p.sshOpdracht}</code></small>
                :<button type='button' disabled={!!busy||!ondersteund} onClick={()=>metRootSleutel(p,'bevestigen')}><ShieldCheck/>{tr(lang,'Підтвердити ключем, що вже може схвалювати','Bevestigen met een sleutel die al mag goedkeuren')}</button>}
              <button type='button' className='secondary' disabled={!!busy} onClick={()=>void annuleren(p)}><X/>{tr(lang,'Скасувати запит','Aanvraag annuleren')}</button></>}
            {p.goedkeuring==='kan-goedkeuren'&&bevestig?.id!==p.id&&<button type='button' className='secondary' disabled={!!busy} onClick={()=>{setReden('');setBevestig({id:p.id,wat:'intrekken'});}}><X/>{tr(lang,'Забрати право схвалювати','Recht om goed te keuren intrekken')}</button>}
            {p.goedkeuring==='wordt-ingetrokken'&&<small>{tr(lang,'Сервер ще обробляє запит на відкликання.','De server verwerkt het intrekverzoek nog.')}</small>}
            <small className='access-plane-mono'>{p.vingerafdrukKort}</small>
          </div>}
          <GebruikLijst lang={lang} gebruik={p.gebruik||[]} id={p.id}/>
          <GeschiedenisLijst lang={lang} items={p.geschiedenis||[]} id={p.id}/>
        </div>
        <div className='access-plane-row-actions'>
          <button type='button' className='secondary' disabled={!!busy} onClick={()=>setHernoem({id:p.id,naam:p.naam})} aria-label={tr(lang,'Перейменувати','Hernoemen')} title={tr(lang,'Перейменувати','Hernoemen')}><Pencil/></button>
          <button type='button' className='secondary' disabled={!!busy} onClick={()=>{setReden('');setBevestig({id:p.id,wat:'verwijderen'});}} aria-label={tr(lang,'Видалити','Verwijderen')} title={tr(lang,'Видалити','Verwijderen')}><Trash2/></button>
        </div>
      </li>)}
    </ul>}

    {g&&g.onbekendBijRoot.length>0&&<p className='access-plane-notice access-plane-subrow'>{tr(lang,'Сервер ще довіряє ключам, яких тут немає (наприклад, старим для admin.tarasevych.com): ','De server vertrouwt nog sleutels die hier niet staan (bijvoorbeeld oude voor admin.tarasevych.com): ')}{g.onbekendBijRoot.map(s=>`${s.label} (${s.vingerafdrukKort})`).join(', ')}. {tr(lang,'Прибрати їх можна на сервері: «sudo mijn-ruimte-passkey verwijderen <відбиток>».','Verwijderen kan op de server: «sudo mijn-ruimte-passkey verwijderen <vingerafdruk>».')}</p>}
  </div>;
}
