// Admin → «Оновлення» / «Updates»: voorstellen goedkeuren met de passkey van de eigenaar (RUNBOOK-VEILIGE-UITROL.md §13).
// De browser maakt alleen de WebAuthn-assertie; de server en daarna root controleren alles opnieuw. Teksten: Oekraïens en Nederlands.
import {useEffect,useMemo,useState} from 'react';
import {api} from './platform/client';
import {Check,Fingerprint,PackageCheck,RefreshCw,ShieldCheck,Trash2,TriangleAlert,UserCheck,X} from 'lucide-react';
import './admin-uitrol.css';

type Lang='uk'|'nl';
type Props={lang:Lang;sourceOrigin:string;tabContext:string};
type Voorstel={id:string;versie:string;status:string;bytes:number;sha256:string;ontvangen:number;voorbereider:string;commit:string;wijzigingen:string;tests:{geslaagd?:number|null;mislukt?:number|null;samenvatting?:string};diffSamenvatting:string;aangemaaktOp:string;beslistOp:string;beslistDoor:string;uitkomstCode:string;uitkomst:{uk?:string;nl?:string;reden?:string}|null};
type Grant={id:string;soort:'account'|'agenttoken'|'mcp-koppeling';onderwerp:string;label:string;gegevenDoor:string;gegevenOp:string;verlooptOp:string;ingetrokkenOp:string;status:'actief'|'verlopen'|'ingetrokken'};
type Passkey={vingerafdruk:string;kort:string;label:string;toegevoegd?:string;door?:string};
type Wachtend={vingerafdruk:string;kort:string;label:string;aangemaakt:string;sshOpdracht:string};
type Keuze={id:string;label:string};
type Overzicht={schakelaar:boolean;rpId:string;origins:string[];passkeys:Passkey[];wachtend:Wachtend[];voorstellen:Voorstel[];voorbereiders:Grant[];kandidaten:{accounts:Keuze[];agenttokens:Keuze[];koppelingen:Keuze[]};rootStatus:{staat?:string;versie?:string;code?:string;uk?:string;nl?:string;tijd?:string;methode?:string}|null;limieten:{voorbereiderMaxDagen:number}};

const tr=(lang:Lang,uk:string,nl:string)=>lang==='uk'?uk:nl;
const foutCode=(caught:unknown)=>{const v=caught as{response?:{data?:{error?:unknown;reasonCode?:unknown}};message?:unknown;name?:unknown};const api=v?.response?.data?.error||v?.response?.data?.reasonCode;if(api)return String(api);if(typeof DOMException!=='undefined'&&caught instanceof DOMException)return String(caught.name);return String(v?.message||'');};
// base64url <-> ArrayBuffer voor navigator.credentials
const naarBuf=(s:string)=>{const b=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4));const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer;};
const naarB64u=(buf:ArrayBuffer|null|undefined)=>{if(!buf)return '';const u=new Uint8Array(buf);let s='';for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const datum=(lang:Lang,v?:string)=>v?new Date(v).toLocaleString(lang==='uk'?'uk-UA':'nl-BE',{dateStyle:'short',timeStyle:'short'}):'—';
const mb=(n:number)=>`${(n/1048576).toFixed(1)} MB`;

const STATUS:Record<string,[string,string]>={
  uploaden:['Завантажується','Wordt geüpload'],'wacht-op-goedkeuring':['Чекає схвалення','Wacht op goedkeuring'],goedgekeurd:['Схвалено, встановлюється','Goedgekeurd, wordt geïnstalleerd'],
  geinstalleerd:['Встановлено','Geïnstalleerd'],mislukt:['Не вдалося (повернено попередню версію)','Mislukt (vorige versie teruggezet)'],geweigerd:['Сервер відмовив','Geweigerd door de server'],
  afgewezen:['Відхилено вами','Door u afgewezen'],verlopen:['Минув термін','Verlopen'],afgebroken:['Скасовано','Afgebroken'],
};
const SOORT:Record<Grant['soort'],[string,string]>={account:['Акаунт','Account'],agenttoken:['Токен агента','Agenttoken'],'mcp-koppeling':['MCP-підключення','MCP-koppeling']};
const FOUTEN:Record<string,[string,string]>={
  PASSKEY_GOEDKEURING_UIT:['Схвалення через passkey вимкнено на сервері (перемикач «passkey-goedkeuring»).','Goedkeuren met een passkey staat op de server uit (schakelaar «passkey-goedkeuring»).'],
  GEEN_PASSKEY:['На сервері ще немає підтвердженого passkey. Спершу додайте passkey нижче.','Er is op de server nog geen bevestigde passkey. Voeg hieronder eerst een passkey toe.'],
  EERSTE_VIA_SSH:['Перший passkey підтверджується лише через SSH-команду.','De eerste passkey wordt alleen met de SSH-opdracht bevestigd.'],
  UITDAGING_ONGELDIG:['Запит застарів або вже використаний. Спробуйте ще раз.','Het verzoek is verlopen of al gebruikt. Probeer het opnieuw.'],
  STATUS_ONGELDIG:['Стан оновлення змінився. Оновіть сторінку.','De status van de update is gewijzigd. Vernieuw de pagina.'],
  PAKKET_GEWIJZIGD:['Пакет змінився після завантаження — схвалення скасовано.','Het pakket is na het uploaden gewijzigd — goedkeuring geannuleerd.'],
  NotAllowedError:['Підтвердження passkey скасовано або час вийшов.','Passkey-bevestiging geannuleerd of de tijd is verstreken.'],
  InvalidStateError:['Цей passkey уже зареєстровано.','Deze passkey is al geregistreerd.'],
  SecurityError:['Браузер не дозволив passkey на цій адресі.','De browser staat de passkey op dit adres niet toe.'],
  RATE_LIMITED:['Забагато спроб. Зачекайте кілька хвилин.','Te veel pogingen. Wacht een paar minuten.'],
  PASSKEY_SLEUTEL_ONBEKEND:['Цей passkey не підтверджено на сервері.','Deze passkey is niet bevestigd op de server.'],
  PASSKEY_GEEN_VERIFICATIE:['Потрібне розблокування (відбиток, обличчя або PIN).','Ontgrendeling is vereist (vingerafdruk, gezicht of pincode).'],
};
const foutTekst=(lang:Lang,code:string)=>{const t=FOUTEN[code];return t?tr(lang,t[0],t[1]):tr(lang,'Помилка: ','Fout: ')+(code||tr(lang,'немає зв’язку','geen verbinding'));};

/** navigator.credentials.get met de opties van de server; geeft de assertie in base64url terug. */
async function passkeyBevestigen(pk:{challenge:string;rpId:string;timeout:number;allowCredentials:Array<{type:string;id:string}>}){
  const cred=await navigator.credentials.get({publicKey:{challenge:naarBuf(pk.challenge),rpId:pk.rpId,timeout:pk.timeout,userVerification:'required',allowCredentials:pk.allowCredentials.map(c=>({type:'public-key' as const,id:naarBuf(c.id)}))}}) as PublicKeyCredential|null;
  if(!cred)throw Object.assign(new Error('NotAllowedError'),{name:'NotAllowedError'});
  const r=cred.response as AuthenticatorAssertionResponse;
  return{credentialId:naarB64u(cred.rawId),clientDataJSON:naarB64u(r.clientDataJSON),authenticatorData:naarB64u(r.authenticatorData),signature:naarB64u(r.signature)};
}

export default function AdminUitrolView({lang,sourceOrigin,tabContext}:Props){
  const context=useMemo(()=>({service:'admin',tabContext,sourceOrigin}),[tabContext,sourceOrigin]);
  const[data,setData]=useState<Overzicht|null>(null);
  const[busy,setBusy]=useState('');
  const[notice,setNotice]=useState<{ok:boolean;text:string}|null>(null);
  const[label,setLabel]=useState('');
  const[nieuw,setNieuw]=useState<{kort:string;sshOpdracht:string;eerste:boolean}|null>(null);
  const[grant,setGrant]=useState<{soort:Grant['soort'];onderwerp:string;dagen:number;label:string}>({soort:'agenttoken',onderwerp:'',dagen:7,label:''});
  // Sommige browsers (Safari) staan WebAuthn alleen direct na een tik toe; na het ophalen van de challenge kan dat verlopen zijn.
  // Dan bewaren we de (nog geldige, ≤ 5 min) challenge en tonen een knop die de passkey meteen bij de volgende tik vraagt.
  const[herhaal,setHerhaal]=useState<null|(()=>Promise<string|void>)>(null);
  const kanPasskey=typeof window!=='undefined'&&!!window.PublicKeyCredential&&!!navigator.credentials;

  const laden=async()=>{
    try{const r=await api.post('/api/owner/uitrol/overzicht',context);setData(r.data as Overzicht);}
    catch(c){setNotice({ok:false,text:foutTekst(lang,foutCode(c))});}
  };
  useEffect(()=>{void laden();const t=window.setInterval(()=>{void laden();},20000);return()=>window.clearInterval(t);},[context]);// eslint-disable-line react-hooks/exhaustive-deps

  const doe=async(sleutel:string,run:()=>Promise<string|void>)=>{
    setBusy(sleutel);setNotice(null);setHerhaal(null);
    try{const ok=await run();if(ok)setNotice({ok:true,text:ok});await laden();}
    catch(c){setNotice({ok:false,text:foutTekst(lang,foutCode(c))});}
    finally{setBusy('');}
  };

  const metPasskey=async<T,>(maak:()=>Promise<T>,vervolg:(r:T)=>Promise<string|void>)=>{
    try{return await vervolg(await maak());}
    catch(e){if(foutCode(e)==='NotAllowedError')setHerhaal(()=>async()=>vervolg(await maak()));throw e;}
  };
  const goedkeuren=(v:Voorstel)=>doe(`ok-${v.id}`,async()=>{
    const u=(await api.post('/api/owner/uitrol/voorstel/uitdaging',{...context,id:v.id})).data as {uitdagingId:string;publicKey:{challenge:string;rpId:string;timeout:number;allowCredentials:Array<{type:string;id:string}>}};
    return metPasskey(()=>passkeyBevestigen(u.publicKey),async(assertie)=>{
    await api.post('/api/owner/uitrol/voorstel/goedkeuren',{...context,id:v.id,uitdagingId:u.uitdagingId,assertie});
    return tr(lang,`Схвалено. Сервер сам перевіряє підпис і встановлює версію ${v.versie}; стан з’явиться тут за кілька хвилин.`,`Goedgekeurd. De server controleert de handtekening zelf en installeert versie ${v.versie}; de status verschijnt hier binnen enkele minuten.`);
    });
  });
  const afwijzen=(v:Voorstel)=>{const reden=window.prompt(tr(lang,'Причина відхилення (необов’язково):','Reden van afwijzen (optioneel):'),'');if(reden===null)return;void doe(`nee-${v.id}`,async()=>{await api.post('/api/owner/uitrol/voorstel/afwijzen',{...context,id:v.id,reden});return tr(lang,'Відхилено.','Afgewezen.');});};

  const registreren=()=>doe('reg',async()=>{
    const o=(await api.post('/api/owner/uitrol/passkey/registreren/opties',context)).data as {uitdagingId:string;publicKey:any};
    const pk=o.publicKey;
    return metPasskey(async()=>{const cred=await navigator.credentials.create({publicKey:{...pk,challenge:naarBuf(pk.challenge),user:{...pk.user,id:naarBuf(pk.user.id)},excludeCredentials:(pk.excludeCredentials||[]).map((c:{id:string})=>({type:'public-key' as const,id:naarBuf(c.id)}))}}) as PublicKeyCredential|null;
    if(!cred)throw Object.assign(new Error('NotAllowedError'),{name:'NotAllowedError'});
    return cred;},async(cred)=>{
    const r=cred.response as AuthenticatorAttestationResponse;
    const uit=(await api.post('/api/owner/uitrol/passkey/registreren',{...context,uitdagingId:o.uitdagingId,label:label.trim(),credentialId:naarB64u(cred.rawId),clientDataJSON:naarB64u(r.clientDataJSON),attestationObject:naarB64u(r.attestationObject)})).data as {kort:string;sshOpdracht:string;eerste:boolean};
    setNieuw(uit);setLabel('');
    return uit.eerste?tr(lang,'Passkey створено. Тепер підтвердьте його на сервері SSH-командою нижче.','Passkey gemaakt. Bevestig hem nu op de server met de SSH-opdracht hieronder.'):tr(lang,'Passkey створено. Підтвердьте його наявним passkey.','Passkey gemaakt. Bevestig hem met een bestaande passkey.');
    });
  });
  const sleutelActie=(doel:'toevoegen'|'verwijderen',fp:string)=>doe(`${doel}-${fp}`,async()=>{
    if(doel==='verwijderen'&&!window.confirm(tr(lang,'Видалити цей passkey із сервера?','Deze passkey van de server verwijderen?')))return;
    const u=(await api.post(`/api/owner/uitrol/passkey/${doel}/opties`,{...context,vingerafdruk:fp})).data as {uitdagingId:string;publicKey:{challenge:string;rpId:string;timeout:number;allowCredentials:Array<{type:string;id:string}>}};
    return metPasskey(()=>passkeyBevestigen(u.publicKey),async(assertie)=>{
    await api.post(`/api/owner/uitrol/passkey/${doel}`,{...context,uitdagingId:u.uitdagingId,assertie});
    return tr(lang,'Запит передано серверу; він перевірить підпис сам. Оновлення списку — за кілька секунд.','Verzoek doorgegeven aan de server; die controleert de handtekening zelf. De lijst wordt binnen enkele seconden bijgewerkt.');
    });
  });
  const aanmeldingWeg=(fp:string)=>doe(`weg-${fp}`,async()=>{await api.post('/api/owner/uitrol/passkey/aanmelding/intrekken',{...context,vingerafdruk:fp});});
  const grantGeven=()=>doe('grant',async()=>{
    await api.post('/api/owner/uitrol/voorbereiders/toevoegen',{...context,...grant});setGrant(g=>({...g,onderwerp:'',label:''}));
    return tr(lang,'Дозвіл надано.','Toestemming gegeven.');
  });
  const grantIntrekken=(g:Grant)=>{if(!window.confirm(tr(lang,`Відкликати дозвіл для «${g.label}»?`,`Toestemming voor «${g.label}» intrekken?`)))return;void doe(`in-${g.id}`,async()=>{await api.post('/api/owner/uitrol/voorbereiders/intrekken',{...context,id:g.id});return tr(lang,'Дозвіл відкликано.','Toestemming ingetrokken.');});};

  if(!data)return <section className='admin-section' data-admin-uitrol><header><PackageCheck/><div><h2>{tr(lang,'Оновлення сервера','Serverupdates')}</h2><p>{notice?.text||tr(lang,'Завантаження…','Laden…')}</p></div></header></section>;

  const wachtenden=data.voorstellen.filter(v=>v.status==='wacht-op-goedkeuring');
  const overige=data.voorstellen.filter(v=>v.status!=='wacht-op-goedkeuring');
  const klaar=data.schakelaar&&data.passkeys.length>0&&kanPasskey;
  const keuzes=grant.soort==='account'?data.kandidaten.accounts:grant.soort==='agenttoken'?data.kandidaten.agenttokens:data.kandidaten.koppelingen;
  const st=(s:string)=>{const t=STATUS[s];return t?tr(lang,t[0],t[1]):s;};

  return <div className='admin-uitrol' data-admin-uitrol>
    <section className='admin-section'>
      <header><PackageCheck/><div><h2>{tr(lang,'Оновлення сервера','Serverupdates')}</h2><p>{tr(lang,'Агенти й помічники лише готують пакет. Встановлюється він тільки після вашого підтвердження passkey на телефоні; сервер (root) перевіряє підпис сам, тож зламаний застосунок не може нічого схвалити.','Agents en helpers bereiden alleen een pakket voor. Het wordt pas geïnstalleerd na uw bevestiging met de passkey op uw telefoon; de server (root) controleert de handtekening zelf, dus een gekraakte app kan niets goedkeuren.')}</p></div>
        <button type='button' className='admin-uitrol-ververs' onClick={()=>void laden()} title={tr(lang,'Оновити','Vernieuwen')}><RefreshCw/></button></header>
      <ul className='admin-uitrol-stand'>
        <li data-ok={data.schakelaar}>{data.schakelaar?<Check/>:<X/>}{data.schakelaar?tr(lang,'Схвалення через passkey увімкнено на сервері','Goedkeuren met passkey staat aan op de server'):tr(lang,'Схвалення через passkey вимкнено (вмикає лише root у mcp-rechten.json)','Goedkeuren met passkey staat uit (alleen root zet het aan in mcp-rechten.json)')}</li>
        <li data-ok={data.passkeys.length>0}>{data.passkeys.length>0?<Check/>:<X/>}{tr(lang,`Підтверджених passkey: ${data.passkeys.length}`,`Bevestigde passkeys: ${data.passkeys.length}`)}</li>
        {!kanPasskey&&<li data-ok={false}><X/>{tr(lang,'Цей браузер не підтримує passkey','Deze browser ondersteunt geen passkeys')}</li>}
        {data.rootStatus?.versie&&<li data-ok={data.rootStatus.staat==='klaar'}>{data.rootStatus.staat==='klaar'?<Check/>:<TriangleAlert/>}{tr(lang,'Останнє розгортання: ','Laatste uitrol: ')}{data.rootStatus.versie} · {lang==='uk'?data.rootStatus.uk:data.rootStatus.nl} · {datum(lang,data.rootStatus.tijd)}</li>}
      </ul>
      {(notice||herhaal)&&<div className='admin-uitrol-melding'>{notice&&<p className='admin-notice' data-ok={notice.ok} role='status'>{notice.text}</p>}
      {herhaal&&<div className='admin-uitrol-knoppen'><button type='button' className='admin-uitrol-ja' disabled={!!busy} onClick={()=>{const run=herhaal;void doe('herhaal',run);}}><Fingerprint/>{tr(lang,'Підтвердити passkey ще раз','Passkey opnieuw bevestigen')}</button></div>}</div>}
    </section>

    <section className='admin-section'>
      <header><ShieldCheck/><div><h2>{tr(lang,'Чекають схвалення','Wachten op goedkeuring')}</h2><p>{tr(lang,'Перевірте, хто підготував, що змінено і чи пройшли тести. Схвалення діє лише для цього пакета (його sha256) і лише 5 хвилин.','Controleer wie het voorbereidde, wat er verandert en of de tests slaagden. Een goedkeuring geldt alleen voor dit pakket (de sha256) en maar 5 minuten.')}</p></div></header>
      {wachtenden.length===0&&<p className='admin-uitrol-leeg'>{tr(lang,'Немає оновлень, що чекають.','Geen updates die wachten.')}</p>}
      {wachtenden.map(v=><article key={v.id} className='admin-uitrol-voorstel'>
        <h3>{tr(lang,'Версія ','Versie ')}{v.versie}</h3>
        <dl>
          <dt>{tr(lang,'Підготував','Voorbereid door')}</dt><dd>{v.voorbereider} · {datum(lang,v.aangemaaktOp)}</dd>
          <dt>{tr(lang,'Коміт','Commit')}</dt><dd><code>{v.commit?v.commit.slice(0,12):'—'}</code></dd>
          <dt>{tr(lang,'Тести','Tests')}</dt><dd data-ok={v.tests?.mislukt===0}>{v.tests?.geslaagd!=null?tr(lang,`успішно ${v.tests.geslaagd}, з помилками ${v.tests.mislukt??'?'}`,`geslaagd ${v.tests.geslaagd}, mislukt ${v.tests.mislukt??'?'}`):tr(lang,'не вказано','niet opgegeven')}{v.tests?.samenvatting?` · ${v.tests.samenvatting}`:''}</dd>
          <dt>{tr(lang,'Розмір','Grootte')}</dt><dd>{mb(v.bytes)}</dd>
          <dt>sha256</dt><dd><code className='admin-uitrol-sha'>{v.sha256}</code></dd>
        </dl>
        {v.wijzigingen&&<details open><summary>{tr(lang,'Що змінено','Wat er verandert')}</summary><pre>{v.wijzigingen}</pre></details>}
        {v.diffSamenvatting&&<details><summary>{tr(lang,'Зміни у файлах','Gewijzigde bestanden')}</summary><pre>{v.diffSamenvatting}</pre></details>}
        <div className='admin-uitrol-knoppen'>
          <button type='button' className='admin-uitrol-ja' disabled={!klaar||!!busy} onClick={()=>void goedkeuren(v)}><Fingerprint/>{busy===`ok-${v.id}`?tr(lang,'Підтвердіть на телефоні…','Bevestig op uw telefoon…'):tr(lang,'Схвалити й встановити','Goedkeuren en installeren')}</button>
          <button type='button' className='admin-uitrol-nee' disabled={!!busy} onClick={()=>afwijzen(v)}><X/>{tr(lang,'Відхилити','Afwijzen')}</button>
        </div>
        {!klaar&&<p className='admin-uitrol-hint'>{!data.schakelaar?foutTekst(lang,'PASSKEY_GOEDKEURING_UIT'):!data.passkeys.length?foutTekst(lang,'GEEN_PASSKEY'):tr(lang,'Відкрийте цю сторінку в браузері з підтримкою passkey.','Open deze pagina in een browser die passkeys ondersteunt.')}</p>}
      </article>)}
    </section>

    <section className='admin-section'>
      <header><Fingerprint/><div><h2>{tr(lang,'Мої passkey для схвалення','Mijn passkeys voor goedkeuring')}</h2><p>{tr(lang,'Лише ваші passkey можуть схвалювати оновлення. Перший підтверджується SSH-командою на сервері (звірте відбиток), наступні — вже підтвердженим passkey.','Alleen uw passkeys kunnen updates goedkeuren. De eerste wordt met een SSH-opdracht op de server bevestigd (vergelijk de vingerafdruk), volgende met een al bevestigde passkey.')}</p></div></header>
      <ul className='admin-uitrol-lijst'>
        {data.passkeys.map(p=><li key={p.vingerafdruk}><span><b>{p.label||'passkey'}</b> <code>{p.kort}</code> · {datum(lang,p.toegevoegd)}</span>
          <button type='button' disabled={!!busy||!kanPasskey} onClick={()=>void sleutelActie('verwijderen',p.vingerafdruk)}><Trash2/>{tr(lang,'Видалити','Verwijderen')}</button></li>)}
        {data.passkeys.length===0&&<li className='admin-uitrol-leeg'>{tr(lang,'Ще немає підтверджених passkey.','Nog geen bevestigde passkeys.')}</li>}
      </ul>
      {data.wachtend.length>0&&<><h3>{tr(lang,'Очікують підтвердження','Wachten op bevestiging')}</h3><ul className='admin-uitrol-lijst'>
        {data.wachtend.map(w=><li key={w.vingerafdruk}><span><b>{w.label}</b> <code>{w.kort}</code> · {datum(lang,w.aangemaakt)}
          {data.passkeys.length===0&&<><br/>{tr(lang,'Виконайте на сервері через SSH:','Voer op de server via SSH uit:')} <code className='admin-uitrol-ssh'>{w.sshOpdracht}</code></>}</span>
          <span className='admin-uitrol-knoppen'>
            {data.passkeys.length>0&&<button type='button' disabled={!!busy||!kanPasskey} onClick={()=>void sleutelActie('toevoegen',w.vingerafdruk)}><Fingerprint/>{tr(lang,'Підтвердити наявним passkey','Bevestigen met bestaande passkey')}</button>}
            <button type='button' disabled={!!busy} onClick={()=>void aanmeldingWeg(w.vingerafdruk)}><X/>{tr(lang,'Скасувати','Annuleren')}</button></span></li>)}
      </ul></>}
      {nieuw&&<p className='admin-notice' data-ok>{tr(lang,'Відбиток нового passkey: ','Vingerafdruk van de nieuwe passkey: ')}<code>{nieuw.kort}</code>{nieuw.eerste&&<><br/>{tr(lang,'Команда для SSH: ','SSH-opdracht: ')}<code className='admin-uitrol-ssh'>{nieuw.sshOpdracht}</code><br/>{tr(lang,'Сервер покаже той самий відбиток — підтверджуйте, лише якщо він збігається.','De server toont dezelfde vingerafdruk — bevestig alleen als die overeenkomt.')}</>}</p>}
      <div className='admin-uitrol-form'>
        <input value={label} maxLength={60} onChange={e=>setLabel(e.target.value)} placeholder={tr(lang,'Назва (наприклад, «Телефон»)','Naam (bijvoorbeeld «Telefoon»)')}/>
        <button type='button' disabled={!!busy||!kanPasskey} onClick={()=>void registreren()}><Fingerprint/>{tr(lang,'Додати passkey','Passkey toevoegen')}</button>
      </div>
    </section>

    <section className='admin-section'>
      <header><UserCheck/><div><h2>{tr(lang,'Кому дозволено готувати оновлення','Wie mag updates voorbereiden')}</h2><p>{tr(lang,'Дозвіл лише на підготовку й завантаження пакета, з терміном дії. Схвалити не може ніхто, крім вас.','Toestemming alleen om een pakket voor te bereiden en te uploaden, met een vervaldatum. Goedkeuren kan niemand behalve u.')}</p></div></header>
      <ul className='admin-uitrol-lijst'>
        {data.voorbereiders.map(g=><li key={g.id} data-status={g.status}><span><b>{g.label}</b> · {tr(lang,SOORT[g.soort][0],SOORT[g.soort][1])} · {g.status==='actief'?tr(lang,'до ','tot ')+datum(lang,g.verlooptOp):g.status==='verlopen'?tr(lang,'термін минув','verlopen'):tr(lang,'відкликано ','ingetrokken ')+datum(lang,g.ingetrokkenOp)}</span>
          {g.status==='actief'&&<button type='button' disabled={!!busy} onClick={()=>grantIntrekken(g)}><Trash2/>{tr(lang,'Відкликати','Intrekken')}</button>}</li>)}
        {data.voorbereiders.length===0&&<li className='admin-uitrol-leeg'>{tr(lang,'Нікому не дозволено.','Niemand heeft toestemming.')}</li>}
      </ul>
      <div className='admin-uitrol-form'>
        <select value={grant.soort} onChange={e=>setGrant(g=>({...g,soort:e.target.value as Grant['soort'],onderwerp:''}))}>
          {(Object.keys(SOORT) as Grant['soort'][]).map(s=><option key={s} value={s}>{tr(lang,SOORT[s][0],SOORT[s][1])}</option>)}
        </select>
        <select value={grant.onderwerp} onChange={e=>setGrant(g=>({...g,onderwerp:e.target.value}))}>
          <option value=''>{tr(lang,'— виберіть —','— kies —')}</option>
          {keuzes.map(k=><option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <label>{tr(lang,'Днів','Dagen')} <input type='number' min={1} max={data.limieten.voorbereiderMaxDagen} value={grant.dagen} onChange={e=>setGrant(g=>({...g,dagen:Math.max(1,Math.min(data.limieten.voorbereiderMaxDagen,Number(e.target.value)||1))}))}/></label>
        <input value={grant.label} maxLength={80} onChange={e=>setGrant(g=>({...g,label:e.target.value}))} placeholder={tr(lang,'Назва (необов’язково)','Naam (optioneel)')}/>
        <button type='button' disabled={!!busy||!grant.onderwerp} onClick={()=>void grantGeven()}><Check/>{tr(lang,'Дозволити','Toestaan')}</button>
      </div>
    </section>

    <section className='admin-section'>
      <header><RefreshCw/><div><h2>{tr(lang,'Історія','Geschiedenis')}</h2></div></header>
      <ul className='admin-uitrol-lijst'>
        {overige.map(v=><li key={v.id} data-status={v.status}><span><b>{v.versie}</b> · {st(v.status)} · {v.voorbereider} · {datum(lang,v.beslistOp||v.aangemaaktOp)}{v.uitkomst&&(v.uitkomst.uk||v.uitkomst.nl)?` · ${lang==='uk'?v.uitkomst.uk:v.uitkomst.nl}`:''}{v.uitkomst?.reden?` · ${v.uitkomst.reden}`:''}</span></li>)}
        {overige.length===0&&<li className='admin-uitrol-leeg'>{tr(lang,'Поки порожньо.','Nog leeg.')}</li>}
      </ul>
    </section>
  </div>;
}
