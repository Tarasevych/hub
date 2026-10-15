// Admin → «Оновлення» / «Updates»: voorstellen goedkeuren met de passkey van de eigenaar (RUNBOOK-VEILIGE-UITROL.md §13).
// Passkeys zelf beheer je in Instellingen → «Способи входу» (id.tarasevych.com/methods); hier alleen de stand en een link.
// De browser maakt alleen de WebAuthn-assertie; de server en daarna root controleren alles opnieuw. Teksten: Oekraïens en Nederlands.
import {useEffect,useMemo,useState} from 'react';
import {api} from './platform/client';
import {Check,ExternalLink,Fingerprint,PackageCheck,RefreshCw,ShieldCheck,Trash2,TriangleAlert,UserCheck,X} from 'lucide-react';
import {canonicalNavigationUrl} from './canonical-navigation';
import {foutCode,kanPasskey as passkeyMogelijk,passkeyBevestigen} from './platform/webauthn';
import {RedenVeld,redenOk} from './ToegangContext';
import UitrolMeester from './UitrolMeester';
import './admin-uitrol.css';

type Lang='uk'|'nl';
type Props={lang:Lang;sourceOrigin:string;tabContext:string};
type Voorstel={id:string;versie:string;status:string;bytes:number;sha256:string;ontvangen:number;voorbereider:string;commit:string;wijzigingen:string;tests:{geslaagd?:number|null;mislukt?:number|null;samenvatting?:string};diffSamenvatting:string;aangemaaktOp:string;beslistOp:string;beslistDoor:string;uitkomstCode:string;uitkomst:{uk?:string;nl?:string;reden?:string}|null};
type Grant={id:string;soort:'account'|'agenttoken'|'mcp-koppeling';onderwerp:string;label:string;gegevenDoor:string;gegevenOp:string;verlooptOp:string;ingetrokkenOp:string;status:'actief'|'verlopen'|'ingetrokken'};
type Passkey={vingerafdruk:string;kort:string;label:string;toegevoegd?:string;door?:string};
type Wachtend={vingerafdruk:string;kort:string;label:string;aangemaakt:string;sshOpdracht:string};
type Keuze={id:string;label:string};
type Installatie={id:string;tijd:string;code:string;herkomst:string;wie:string;pakket:string;release:string;commit:string;adres:string;uk:string;nl:string};
type Overzicht={schakelaar:boolean;rpId:string;origins:string[];passkeys:Passkey[];wachtend:Wachtend[];voorstellen:Voorstel[];installaties?:Installatie[];voorbereiders:Grant[];kandidaten:{accounts:Keuze[];agenttokens:Keuze[];koppelingen:Keuze[]};rootStatus:{staat?:string;versie?:string;code?:string;uk?:string;nl?:string;tijd?:string;methode?:string}|null;limieten:{voorbereiderMaxDagen:number;maxBytes?:number;maxStuk?:number};ik?:{id:string;email:string}};

const tr=(lang:Lang,uk:string,nl:string)=>lang==='uk'?uk:nl;
const datum=(lang:Lang,v?:string)=>v?new Date(v).toLocaleString(lang==='uk'?'uk-UA':'nl-BE',{dateStyle:'short',timeStyle:'short'}):'—';
const mb=(n:number)=>`${(n/1048576).toFixed(1)} MB`;

const STATUS:Record<string,[string,string]>={
  uploaden:['Завантажується','Wordt geüpload'],'wacht-op-goedkeuring':['Чекає схвалення','Wacht op goedkeuring'],goedgekeurd:['Схвалено, встановлюється','Goedgekeurd, wordt geïnstalleerd'],
  geinstalleerd:['Встановлено','Geïnstalleerd'],mislukt:['Не вдалося (повернено попередню версію)','Mislukt (vorige versie teruggezet)'],geweigerd:['Сервер відмовив','Geweigerd door de server'],
  afgewezen:['Відхилено вами','Door u afgewezen'],verlopen:['Минув термін','Verlopen'],afgebroken:['Скасовано','Afgebroken'],
};
const SOORT:Record<Grant['soort'],[string,string]>={account:['Акаунт','Account'],agenttoken:['Токен агента','Agenttoken'],'mcp-koppeling':['MCP-підключення','MCP-koppeling']};
const FOUTEN:Record<string,[string,string]>={
  REDEN_TE_KORT:['Вкажіть причину (щонайменше 10 символів).','Geef een reden op (minstens 10 tekens).'],
  REDEN_TE_LANG:['Причина задовга (максимум 500 символів).','De reden is te lang (maximaal 500 tekens).'],
  STEP_UP_STRONG_REQUIRED:['Потрібне підтвердження passkey, кодом із застосунку або кодом відновлення (повторного входу Google недостатньо).','Bevestiging met passkey, app-code of herstelcode is nodig (opnieuw inloggen bij Google is niet genoeg).'],
  PASSKEY_GOEDKEURING_UIT:['Схвалення через passkey вимкнено на сервері (перемикач «passkey-goedkeuring»).','Goedkeuren met een passkey staat op de server uit (schakelaar «passkey-goedkeuring»).'],
  GEEN_PASSKEY:['На сервері ще немає passkey, що може схвалювати. Додайте його в «Налаштування → Способи входу».','Er is op de server nog geen passkey die mag goedkeuren. Voeg er een toe via «Instellingen → Aanmeldmethoden».'],
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

export default function AdminUitrolView({lang,sourceOrigin,tabContext}:Props){
  const context=useMemo(()=>({service:'admin',tabContext,sourceOrigin}),[tabContext,sourceOrigin]);
  const[data,setData]=useState<Overzicht|null>(null);
  const[busy,setBusy]=useState('');
  const[notice,setNotice]=useState<{ok:boolean;text:string}|null>(null);
  const[grant,setGrant]=useState<{soort:Grant['soort'];onderwerp:string;dagen:number;label:string}>({soort:'agenttoken',onderwerp:'',dagen:7,label:''});
  // Sommige browsers (Safari) staan WebAuthn alleen direct na een tik toe; na het ophalen van de challenge kan dat verlopen zijn.
  // Dan bewaren we de (nog geldige, ≤ 5 min) challenge en tonen een knop die de passkey meteen bij de volgende tik vraagt.
  const[herhaal,setHerhaal]=useState<null|(()=>Promise<string|void>)>(null);
  // Intrekken in de rij zelf (geen window.confirm): verplichte reden; de server vraagt een sterke bevestiging (§13.10).
  const[intrek,setIntrek]=useState<{id:string;reden:string}|null>(null);
  const kanPasskey=passkeyMogelijk();

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
  // Afwijzen met een inline redenformulier (geen window.prompt meer; reden optioneel, max. 500 tekens).
  const[afwijs,setAfwijs]=useState<{id:string;reden:string}|null>(null);
  const afwijzen=(v:Voorstel)=>{if(!afwijs||afwijs.id!==v.id)return;const reden=afwijs.reden.trim().slice(0,500);void doe(`nee-${v.id}`,async()=>{await api.post('/api/owner/uitrol/voorstel/afwijzen',{...context,id:v.id,reden});setAfwijs(null);return tr(lang,'Відхилено.','Afgewezen.');});};

  const grantGeven=()=>doe('grant',async()=>{
    await api.post('/api/owner/uitrol/voorbereiders/toevoegen',{...context,...grant});setGrant(g=>({...g,onderwerp:'',label:''}));
    return tr(lang,'Дозвіл надано.','Toestemming gegeven.');
  });
  const grantIntrekken=(g:Grant)=>{if(!intrek||intrek.id!==g.id)return;const reden=intrek.reden.trim();void doe(`in-${g.id}`,async()=>{await api.post('/api/owner/uitrol/voorbereiders/intrekken',{...context,id:g.id,reden});setIntrek(null);return tr(lang,'Дозвіл відкликано. Користувач отримав сповіщення з причиною.','Toestemming ingetrokken. De gebruiker kreeg een melding met de reden.');});};

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
        <li data-ok={data.passkeys.length>0}>{data.passkeys.length>0?<Check/>:<X/>}{tr(lang,`Passkey, що можуть схвалювати: ${data.passkeys.length}`,`Passkeys die mogen goedkeuren: ${data.passkeys.length}`)}{data.wachtend.length>0?tr(lang,` · чекають підтвердження: ${data.wachtend.length}`,` · wachten op bevestiging: ${data.wachtend.length}`):''}
          {' '}<a className='admin-uitrol-link' href={canonicalNavigationUrl('identity','methods',lang)}><ExternalLink/>{tr(lang,'Керувати в «Способи входу»','Beheren in «Aanmeldmethoden»')}</a></li>
        {!kanPasskey&&<li data-ok={false}><X/>{tr(lang,'Цей браузер не підтримує passkey','Deze browser ondersteunt geen passkeys')}</li>}
        {data.rootStatus?.versie&&<li data-ok={data.rootStatus.staat==='klaar'}>{data.rootStatus.staat==='klaar'?<Check/>:<TriangleAlert/>}{tr(lang,'Останнє розгортання: ','Laatste uitrol: ')}{data.rootStatus.versie} · {lang==='uk'?data.rootStatus.uk:data.rootStatus.nl} · {datum(lang,data.rootStatus.tijd)}</li>}
      </ul>
      {(notice||herhaal)&&<div className='admin-uitrol-melding'>{notice&&<p className='admin-notice' data-ok={notice.ok} role='status'>{notice.text}</p>}
      {herhaal&&<div className='admin-uitrol-knoppen'><button type='button' className='admin-uitrol-ja' disabled={!!busy} onClick={()=>{const run=herhaal;void doe('herhaal',run);}}><Fingerprint/>{tr(lang,'Підтвердити passkey ще раз','Passkey opnieuw bevestigen')}</button></div>}</div>}
    </section>

    <UitrolMeester lang={lang} context={context} sourceOrigin={sourceOrigin} tabContext={tabContext} data={data} busy={busy} doe={doe} laden={laden}
      goedkeurenId={(id)=>{const v=data.voorstellen.find(x=>x.id===id);if(v)void goedkeuren(v);}}/>

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
          {afwijs?.id!==v.id&&<button type='button' className='admin-uitrol-nee' disabled={!!busy} onClick={()=>setAfwijs({id:v.id,reden:''})}><X/>{tr(lang,'Відхилити','Afwijzen')}</button>}
        </div>
        {afwijs?.id===v.id&&<div className='admin-uitrol-intrek' role='group' data-afwijzen-voorstel={v.id}>
          <label htmlFor={`afwijs-${v.id}`}>{tr(lang,'Причина відхилення (необов’язково)','Reden van afwijzen (optioneel)')}</label>
          <textarea id={`afwijs-${v.id}`} rows={2} maxLength={500} value={afwijs.reden} onChange={e=>setAfwijs({id:v.id,reden:e.target.value})} disabled={!!busy}/>
          <div className='admin-uitrol-knoppen'>
            <button type='button' className='admin-uitrol-nee' disabled={!!busy} onClick={()=>afwijzen(v)}><X/>{tr(lang,'Відхилити версію','Versie afwijzen')}</button>
            <button type='button' disabled={!!busy} onClick={()=>setAfwijs(null)}>{tr(lang,'Скасувати','Annuleren')}</button>
          </div>
        </div>}
        {!klaar&&<p className='admin-uitrol-hint'>{!data.schakelaar?foutTekst(lang,'PASSKEY_GOEDKEURING_UIT'):!data.passkeys.length?foutTekst(lang,'GEEN_PASSKEY'):tr(lang,'Відкрийте цю сторінку в браузері з підтримкою passkey.','Open deze pagina in een browser die passkeys ondersteunt.')}</p>}
      </article>)}
    </section>

    <section className='admin-section'>
      <header><UserCheck/><div><h2>{tr(lang,'Кому дозволено готувати оновлення','Wie mag updates voorbereiden')}</h2><p>{tr(lang,'Дозвіл лише на підготовку й завантаження пакета, з терміном дії. Схвалити не може ніхто, крім вас.','Toestemming alleen om een pakket voor te bereiden en te uploaden, met een vervaldatum. Goedkeuren kan niemand behalve u.')}</p></div></header>
      <ul className='admin-uitrol-lijst'>
        {data.voorbereiders.map(g=><li key={g.id} data-status={g.status}><span><b>{g.label}</b> · {tr(lang,SOORT[g.soort][0],SOORT[g.soort][1])} · {g.status==='actief'?tr(lang,'до ','tot ')+datum(lang,g.verlooptOp):g.status==='verlopen'?tr(lang,'термін минув','verlopen'):tr(lang,'відкликано ','ingetrokken ')+datum(lang,g.ingetrokkenOp)}</span>
          {g.status==='actief'&&intrek?.id!==g.id&&<button type='button' disabled={!!busy} onClick={()=>setIntrek({id:g.id,reden:''})}><Trash2/>{tr(lang,'Відкликати','Intrekken')}</button>}
          {intrek?.id===g.id&&<div className='admin-uitrol-intrek' role='group' data-intrek-grant={g.id}>
            <span>{tr(lang,`Відкликати дозвіл для «${g.label}»? Користувач побачить, хто і чому це зробив.`,`Toestemming voor «${g.label}» intrekken? De gebruiker ziet wie het deed en waarom.`)}</span>
            <RedenVeld lang={lang} id={`reden-grant-${g.id}`} waarde={intrek.reden} zet={(v)=>setIntrek({id:g.id,reden:v})} disabled={!!busy}/>
            <div className='admin-uitrol-knoppen'>
              <button type='button' className='admin-uitrol-nee' disabled={!!busy||!redenOk(intrek.reden)} onClick={()=>grantIntrekken(g)}><Trash2/>{tr(lang,'Відкликати','Intrekken')}</button>
              <button type='button' disabled={!!busy} onClick={()=>setIntrek(null)}><X/>{tr(lang,'Скасувати','Annuleren')}</button>
            </div>
          </div>}</li>)}
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
      <header><RefreshCw/><div><h2>{tr(lang,'Історія','Geschiedenis')}</h2><p>{tr(lang,'Рядок «Завантажується» — це пакет із браузера, доки його не зібрано. Встановлення з SSH або за підписом з’являється окремим рядком і цей пакет не змінює.','Een rij «Wordt geüpload» is een pakket uit de browser zolang het niet compleet is. Een installatie via SSH of met een handtekening verschijnt als een aparte rij en wijzigt dat pakket niet.')}</p></div></header>
      <ul className='admin-uitrol-lijst'>
        {(data.installaties??[]).map(i=>{
          const wat=i.code==='SSH_TERUG'?tr(lang,'Відкочено з SSH','Teruggedraaid via SSH')
          :i.code==='INSTALLATIE_MISLUKT'?tr(lang,'Не вдалося (встановлення)','Mislukt (installatie)')
          :i.code==='SIG_ONTBREEKT'?tr(lang,'Немає підпису (.sig)','Geen handtekening (.sig)')
          :i.code==='HANDTEKENING_ONGELDIG'?tr(lang,'Підпис недійсний','Handtekening ongeldig')
          :i.code==='NIET_NIEUWER'?tr(lang,'Не новіша версія','Niet nieuwer')
          :i.code==='GOEDKEURING_ONTBREEKT'?tr(lang,'Немає схвалення passkey','Geen passkey-goedkeuring')
          :i.code==='GOEDKEURING_ONGELDIG'?tr(lang,'Схвалення passkey відхилено','Passkey-goedkeuring geweigerd')
          :i.code==='GEEN_AUTEUR'||i.code==='GEEN_AGENT'||i.code==='GEEN_SAMENVATTING'?tr(lang,'Бракує метаданих випуску','Release-metadata ontbreekt')
          :i.herkomst==='ssh'?tr(lang,'Встановлено з SSH','Geïnstalleerd via SSH')
          :i.herkomst==='passkey'?tr(lang,'Встановлено (passkey)','Geïnstalleerd (passkey)')
          :tr(lang,'Встановлено (підпис)','Geïnstalleerd (handtekening)');
          const wie=i.wie||(i.herkomst==='handtekening'?tr(lang,'ключ випуску','uitrolsleutel'):'—');
          return <li key={i.id} data-status={i.herkomst||i.code} data-installatie={i.code}><span><b>{i.release||i.pakket}</b> · {wat} · {wie}{i.adres?` · ${i.adres}`:''} · {datum(lang,i.tijd)}{i.uk||i.nl?` · ${lang==='uk'?i.uk:i.nl}`:''}</span></li>;
        })}
        {overige.map(v=><li key={v.id} data-status={v.status}><span><b>{v.versie}</b> · {st(v.status)} · {v.voorbereider} · {datum(lang,v.beslistOp||v.aangemaaktOp)}{v.uitkomst&&(v.uitkomst.uk||v.uitkomst.nl)?` · ${lang==='uk'?v.uitkomst.uk:v.uitkomst.nl}`:''}{v.uitkomst?.reden?` · ${v.uitkomst.reden}`:''}</span></li>)}
        {(data.installaties??[]).length===0&&overige.length===0&&<li className='admin-uitrol-leeg'>{tr(lang,'Поки порожньо.','Nog leeg.')}</li>}
      </ul>
    </section>
  </div>;
}
