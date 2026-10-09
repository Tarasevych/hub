// Instellingen → «Способи входу» → Passkeys (RUNBOOK-VEILIGE-UITROL.md §13). Voor elke gebruiker: passkeys toevoegen,
// hernoemen en verwijderen. Alleen de eigenaar ziet per passkey «Може схвалювати оновлення сервера»: aanzetten legt een
// aanmelding bij root neer; root beslist (eerste sleutel via SSH, volgende met een passkey die root al vertrouwt).
// Weergave zoals GitHub «Sign in methods»: één rij «Passkeys» met rechts «Додати passkey»; de naam vragen we pas na die klik.
// Per passkey: soort (Google Менеджер паролів, Телефон або планшет, Ключ безпеки…), «Синхронізовано», Додано / Останнє використання.
// Geen window.confirm: verwijderen en intrekken bevestig je in de rij zelf. Step-up gaat via het venster «Підтвердіть доступ»;
// kies je daar Google, dan wordt «passkey toevoegen» (met de naam) na terugkeer automatisch hervat (stap-op.ts, metHervat/neemHervat).
import {useEffect,useRef,useState} from 'react';
import {Check,Cloud,Fingerprint,KeyRound,Laptop,Pencil,Plus,ShieldCheck,Smartphone,Trash2,TriangleAlert,X} from 'lucide-react';
import {api} from './platform/client';
import {metHervat,neemHervat} from './platform/stap-op';
import {foutCode,kanPasskey,passkeyAanmaken,passkeyBevestigen,type AssertieOpties,type RegistratieOpties} from './platform/webauthn';
import type {Lang} from './access-plane-copy';

type Status='alleen-aanmelden'|'wacht'|'kan-goedkeuren';
type Soort='wachtwoordbeheerder'|'telefoon'|'beveiligingssleutel'|'apparaat'|'onbekend';
type Passkey={id:string;naam:string;aanbieder:string;soort?:Soort;viaTelefoon?:boolean;transports?:string[];synchroniseerbaar:boolean;gesynchroniseerd:boolean;aangemaaktOp:string;laatstGebruiktOp:string|null;vingerafdrukKort:string;goedkeuring?:Status;sshOpdracht?:string};
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
  NotAllowedError:['Підтвердження passkey скасовано або час вийшов.','Passkey-bevestiging geannuleerd of de tijd is verstreken.'],
  InvalidStateError:['Цей passkey уже додано.','Deze passkey is al toegevoegd.'],
  SecurityError:['Браузер не дозволив passkey на цій адресі.','De browser staat de passkey op dit adres niet toe.'],
  PASSKEY_BESTAAT_AL:['Цей passkey уже додано.','Deze passkey is al toegevoegd.'],
  PASSKEY_LIMIET:['Досягнуто максимальної кількості passkey.','Het maximale aantal passkeys is bereikt.'],
  PASSKEY_KAN_GOEDKEUREN:['Спершу заберіть у цього passkey право схвалювати оновлення.','Neem deze passkey eerst het recht af om updates goed te keuren.'],
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
const STATUS:Record<Status,[string,string,string]>={
  'alleen-aanmelden':['Лише вхід','Alleen aanmelden','muted'],
  wacht:['Чекає підтвердження сервером','Wacht op bevestiging door de server','warn'],
  'kan-goedkeuren':['Може схвалювати оновлення','Mag updates goedkeuren','good'],
};

export function PasskeysSection({lang,context,onChange}:Props){
  const[data,setData]=useState<Lijst|null>(null);
  const[busy,setBusy]=useState('');
  const[notice,setNotice]=useState<{ok:boolean;text:string}|null>(null);
  const[nieuw,setNieuw]=useState<{naam:string}|null>(null);
  const[hernoem,setHernoem]=useState<{id:string;naam:string}|null>(null);
  const[bevestig,setBevestig]=useState<{id:string;wat:'verwijderen'|'intrekken'}|null>(null);
  // Safari: WebAuthn soms alleen direct na een tik. Dan een knop om dezelfde stap meteen opnieuw te doen.
  const[herhaal,setHerhaal]=useState<null|(()=>Promise<string|void>)>(null);
  const ondersteund=kanPasskey();
  const hervat=useRef(false);

  const laden=async()=>{
    try{setData((await api.post('/api/owner/access/passkeys/lijst',context)).data as Lijst);}
    catch(c){setNotice({ok:false,text:foutTekst(lang,foutCode(c))});}
  };
  useEffect(()=>{void laden();},[lang]);// eslint-disable-line react-hooks/exhaustive-deps

  const doe=async(sleutel:string,run:()=>Promise<string|void>)=>{
    setBusy(sleutel);setNotice(null);setHerhaal(null);
    try{const ok=await run();if(ok)setNotice({ok:true,text:ok});await laden();onChange?.();}
    catch(c){const code=foutCode(c);if(code==='NotAllowedError')setHerhaal(()=>run);setNotice({ok:false,text:foutTekst(lang,code)});}
    finally{setBusy('');}
  };

  const toevoegenMet=(naam:string)=>doe('nieuw',()=>metHervat({actie:'passkey-toevoegen',gegevens:{naam}},async()=>{
    const o=(await api.post('/api/owner/access/passkeys/registreren/opties',context)).data as {uitdagingId:string;publicKey:RegistratieOpties};
    const cred=await passkeyAanmaken(o.publicKey);
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
  const verwijderen=(p:Passkey)=>{setBevestig(null);void doe(`weg-${p.id}`,async()=>{await api.post('/api/owner/access/passkeys/verwijderen',{...context,id:p.id});return tr(lang,'Passkey видалено.','Passkey verwijderd.');});};
  const aanvragen=(p:Passkey)=>doe(`aan-${p.id}`,async()=>{
    const r=(await api.post('/api/owner/access/passkeys/goedkeuring/aanvragen',{...context,id:p.id})).data as {eerste:boolean};
    return r.eerste
      ?tr(lang,'Запит передано серверу. Це перший такий ключ: підтвердьте його SSH-командою нижче.','Aanvraag doorgegeven aan de server. Dit is de eerste zo’n sleutel: bevestig hem met de SSH-opdracht hieronder.')
      :tr(lang,'Запит передано серверу. Тепер підтвердьте його passkey, який уже може схвалювати.','Aanvraag doorgegeven aan de server. Bevestig hem nu met een passkey die al mag goedkeuren.');
  });
  const annuleren=(p:Passkey)=>doe(`ann-${p.id}`,async()=>{await api.post('/api/owner/access/passkeys/goedkeuring/annuleren',{...context,id:p.id});});
  const metRootSleutel=(p:Passkey,doel:'bevestigen'|'intrekken')=>{setBevestig(null);void doe(`${doel}-${p.id}`,async()=>{
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
        <strong>{tr(lang,'Passkeys','Passkeys')}</strong>
        <small>{!data?tr(lang,'Завантаження…','Laden…'):aantal?tr(lang,`Додано: ${aantal}`,`Toegevoegd: ${aantal}`):tr(lang,'Не додано. Passkey — це ключ на телефоні чи комп’ютері, який розблоковується відбитком, обличчям або PIN; ним можна підтверджувати важливі дії.','Niet toegevoegd. Een passkey is een sleutel op je telefoon of computer die je ontgrendelt met vingerafdruk, gezicht of pincode; je bevestigt er belangrijke acties mee.')}</small>
      </div>
      <div className='access-plane-row-actions'>
        {!nieuw&&<button type='button' className='secondary' disabled={!!busy||!ondersteund||vol||!data} onClick={()=>{setNotice(null);setNieuw({naam:''});}}><Plus/>{tr(lang,'Додати passkey','Passkey toevoegen')}</button>}
      </div>
    </div>

    {nieuw&&<div className='access-plane-subrow access-plane-nieuw'>
      <label htmlFor='passkey-naam'>{tr(lang,'Назва passkey','Naam van de passkey')}</label>
      <div className='access-plane-inline-form'>
        <input id='passkey-naam' autoFocus value={nieuw.naam} maxLength={60} onChange={e=>setNieuw({naam:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&!busy)void toevoegenMet(nieuw.naam);if(e.key==='Escape')setNieuw(null);}} placeholder={tr(lang,'Наприклад: Мій телефон','Bijvoorbeeld: Mijn telefoon')}/>
        <button type='button' disabled={!!busy} onClick={()=>void toevoegenMet(nieuw.naam)}><Fingerprint/>{busy==='nieuw'?tr(lang,'Підтвердіть на пристрої…','Bevestig op je apparaat…'):tr(lang,'Продовжити','Doorgaan')}</button>
        <button type='button' className='secondary' disabled={busy==='nieuw'} onClick={()=>setNieuw(null)}><X/>{tr(lang,'Скасувати','Annuleren')}</button>
      </div>
      <small>{tr(lang,'Можна залишити порожнім — назву підставимо автоматично.','Mag leeg blijven — dan vullen we automatisch een naam in.')}</small>
      <small className='access-plane-hint'><Smartphone/>{tr(lang,'Щоб зберегти passkey на телефоні, виберіть «Використовувати телефон або планшет» і відскануйте QR-код камерою телефону (Bluetooth має бути увімкнено).','Om de passkey op je telefoon op te slaan, kies je «Een telefoon of tablet gebruiken» en scan je de QR-code met de camera van je telefoon (Bluetooth moet aan staan).')}</small>
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
            :<span className='access-plane-row-title'><strong>{p.naam}</strong>{p.gesynchroniseerd&&<span className='access-plane-badge tone-info'>{tr(lang,'Синхронізовано','Gesynchroniseerd')}</span>}</span>}
          <small>{soortTekst(lang,p)}{!p.synchroniseerbaar&&p.soort!=='telefoon'?` · ${tr(lang,'лише на цьому пристрої','alleen op dit apparaat')}`:''}</small>
          <small>{tr(lang,'Додано ','Toegevoegd op ')}{datum(lang,p.aangemaaktOp)} · {p.laatstGebruiktOp?tr(lang,'Останнє використання ','Laatst gebruikt op ')+datum(lang,p.laatstGebruiktOp):tr(lang,'Ще не використовувався','Nog niet gebruikt')}</small>
          {bevestig?.id===p.id&&<div className='access-plane-confirm' role='group'>
            <span>{bevestig.wat==='verwijderen'
              ?tr(lang,`Видалити passkey «${p.naam}»? Ним більше не можна буде підтверджувати дії.`,`Passkey «${p.naam}» verwijderen? Je kunt er dan geen acties meer mee bevestigen.`)
              :tr(lang,`Забрати в «${p.naam}» право схвалювати оновлення?`,`«${p.naam}» het recht ontnemen om updates goed te keuren?`)}</span>
            <div className='access-plane-actions'>
              <button type='button' className='danger' disabled={!!busy} onClick={()=>bevestig.wat==='verwijderen'?verwijderen(p):metRootSleutel(p,'intrekken')}><Trash2/>{bevestig.wat==='verwijderen'?tr(lang,'Видалити','Verwijderen'):tr(lang,'Забрати право','Recht intrekken')}</button>
              <button type='button' className='secondary' onClick={()=>setBevestig(null)}><X/>{tr(lang,'Скасувати','Annuleren')}</button>
            </div>
          </div>}
          {p.goedkeuring&&<div className='access-plane-owner'>
            <span className={`access-plane-badge tone-${STATUS[p.goedkeuring][2]}`}>{tr(lang,STATUS[p.goedkeuring][0],STATUS[p.goedkeuring][1])}</span>
            {p.goedkeuring==='alleen-aanmelden'&&<label className='access-plane-switch'><input type='checkbox' checked={false} disabled={!!busy} onChange={()=>void aanvragen(p)}/>{tr(lang,'Може схвалювати оновлення сервера','Mag serverupdates goedkeuren')}</label>}
            {p.goedkeuring==='wacht'&&<>
              {p.sshOpdracht
                ?<small>{tr(lang,'Перший ключ: виконайте на сервері через SSH і звірте відбиток','Eerste sleutel: voer op de server via SSH uit en vergelijk de vingerafdruk')} <code className='access-plane-mono access-plane-ssh'>{p.sshOpdracht}</code></small>
                :<button type='button' disabled={!!busy||!ondersteund} onClick={()=>metRootSleutel(p,'bevestigen')}><ShieldCheck/>{tr(lang,'Підтвердити ключем, що вже може схвалювати','Bevestigen met een sleutel die al mag goedkeuren')}</button>}
              <button type='button' className='secondary' disabled={!!busy} onClick={()=>void annuleren(p)}><X/>{tr(lang,'Скасувати запит','Aanvraag annuleren')}</button></>}
            {p.goedkeuring==='kan-goedkeuren'&&<button type='button' className='secondary' disabled={!!busy||!ondersteund} onClick={()=>setBevestig({id:p.id,wat:'intrekken'})}><X/>{tr(lang,'Забрати право схвалювати','Recht om goed te keuren intrekken')}</button>}
            <small className='access-plane-mono'>{p.vingerafdrukKort}</small>
          </div>}
        </div>
        <div className='access-plane-row-actions'>
          <button type='button' className='secondary' disabled={!!busy} onClick={()=>setHernoem({id:p.id,naam:p.naam})} aria-label={tr(lang,'Перейменувати','Hernoemen')} title={tr(lang,'Перейменувати','Hernoemen')}><Pencil/></button>
          <button type='button' className='secondary' disabled={!!busy} onClick={()=>setBevestig({id:p.id,wat:'verwijderen'})} aria-label={tr(lang,'Видалити','Verwijderen')} title={tr(lang,'Видалити','Verwijderen')}><Trash2/></button>
        </div>
      </li>)}
    </ul>}

    {g&&g.onbekendBijRoot.length>0&&<p className='access-plane-notice access-plane-subrow'>{tr(lang,'Сервер ще довіряє ключам, яких тут немає (наприклад, старим для admin.tarasevych.com): ','De server vertrouwt nog sleutels die hier niet staan (bijvoorbeeld oude voor admin.tarasevych.com): ')}{g.onbekendBijRoot.map(s=>`${s.label} (${s.vingerafdrukKort})`).join(', ')}. {tr(lang,'Прибрати їх можна на сервері: «sudo mijn-ruimte-passkey verwijderen <відбиток>».','Verwijderen kan op de server: «sudo mijn-ruimte-passkey verwijderen <vingerafdruk>».')}</p>}
  </div>;
}
