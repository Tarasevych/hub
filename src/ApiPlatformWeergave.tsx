import {useCallback,useEffect,useMemo,useState} from 'react';
import {verborgenVoorAi} from './menselijke-actie'; // SEC-002 extensie-09 (g10a-3): eenmalige geheimen leest de AI-extensie niet
import IntegratieStrook from './integraties/IntegratieStrook'; // UI-013 fase 2: gedeelde verbindingenstrook (vlag integraties-catalogus-v2)
import {api} from './platform/client';
import {API_PLATFORM_VERSION,apiPlatformContractPayload,type ApiPlatformCapability} from './api-platform-contract';
import {ecosystemTabContext} from './tab-context';
import {VaultMetaBewerker,VaultMetaRegel} from './KluisMeta';
import type {VaultMeta,VaultStaat} from '../shared/kluis-meta';
import {DOEL_INFO,isVaultDoel,type VaultDoel} from '../shared/geheimen';
// Kluisinvoer loopt via het canonieke GeheimFormulier (GeheimInvoer met schermtoetsenbord).
import {GeheimFormulier} from './geheimen/GeheimFormulier';
import {foutTekst,kies} from './geheimen/hulp';
import {canonicalNavigationUrl} from './canoniek-navigatie';
import {MaquetteAnkerRail,MaquetteHeld,type MaquetteAnkerItem,type MaquetteHeldStatistiek} from './maquette-kern';
import {useIsMaquette} from './thema/useThema';
import './api-platform-weergave.css';
import './api-sleutels-maquette.css';
type Tr=(uk:string,nl:string)=>string;
type ApiActieveTab='access'|'vault'|'verbindingen';
type Contract=ReturnType<typeof apiPlatformContractPayload>;
type TokenItem={id:string;prefix:string;display:string;scopes:string[];label:string;createdAt:number;expiresAt:number;lastUsedAt:number|null;revokedAt:number|null;status:'active'|'expired'|'revoked'};
type VaultItem={id:string;name:string;purpose:string;usedBy:string;updatedAt:number;createdAt:number;hasValue:boolean;meta?:VaultMeta;staat?:VaultStaat};
type ConnectionItem={id:string;kind:'google-link'|'vault-secret';labelUk:string;labelNl:string;noteUk:string;noteNl:string;status:'not_connected'|'configured'|'error'|'revoked';source:string;hasVaultSecret:boolean;vaultName:string;lastError:string;nextStep:{href:string;labelUk:string;labelNl:string};canMarkStatus:boolean;oauthSecondPass:boolean};
const API_MODAAL_SELECTOR=".venster-achter, .venster:not([hidden]), .afv-laag, [data-mq-laag-open='1'], dialog[open], [role='dialog'][aria-modal='true']";
const API_HELD_TEKSTEN:Record<ApiActieveTab,{
  boven:readonly[string,string];
  voor:readonly[string,string];
  cursief:readonly[string,string];
  beschrijving:readonly[string,string];
  primair:{tab:ApiActieveTab;label:readonly[string,string]};
  secundair:{tab:ApiActieveTab;label:readonly[string,string]};
}>={
  access:{
    boven:['ПРОГРАМНИЙ КОНТУР · API.TARASEVYCH.COM','PROGRAMMATISCHE POORT · API.TARASEVYCH.COM'],
    voor:['Машинні ключі та','Machinesleutels en'],
    cursief:['виважені межі прав.','afgebakende rechten.'],
    beschrijving:[
      'Захищений програмний вхід до маєтку: ключі доступу зберігаються лише як незворотний відбиток, видають чітко окреслені права читання й миттєво відкликаються власником.',
      'Beveiligde programmatische toegang tot het domein: toegangssleutels worden uitsluitend als onomkeerbare vingerafdruk bewaard, verlenen strikt afgebakende leesrechten en zijn direct intrekbaar door de eigenaar.'
    ],
    primair:{tab:'vault',label:['Сховище таємниць','Geheimenkluis']},
    secundair:{tab:'verbindingen',label:['Реєстр підключень','Koppelingenregister']}
  },
  vault:{
    boven:['ЗАШИФРОВАНЕ СХОВИЩЕ · API.TARASEVYCH.COM','VERSLEUTELDE KLUIS · API.TARASEVYCH.COM'],
    voor:['Таємниці власника під','Eigenaarsgeheimen achter'],
    cursief:['захистом AES-256-GCM.','AES-256-GCM-slot.'],
    beschrijving:[
      'Окреме зашифроване сховище ключів власника: відкрите значення ніколи не повертається у вікно оглядача після збереження і зчитується лише серверною частиною з’єднувача.',
      'Afzonderlijke versleutelde kluis voor sleutels van de eigenaar: na opslaan keert de open waarde nooit terug in het browservenster en leest uitsluitend de serverzijde van de koppeling.'
    ],
    primair:{tab:'verbindingen',label:['Реєстр підключень','Koppelingenregister']},
    secundair:{tab:'access',label:['Машинні ключі','Machinesleutels']}
  },
  verbindingen:{
    boven:['ЗОВНІШНІ СИСТЕМИ · API.TARASEVYCH.COM','EXTERNE SYSTEMEN · API.TARASEVYCH.COM'],
    voor:['Узгоджений реєстр','Afgestemd register van'],
    cursief:['зовнішніх з’єднань.','externe koppelingen.'],
    beschrijving:[
      'Прозорий перелік зовнішніх систем без повторного входу OAuth: кожна картка веде до точного наступного кроку та відображає живий стан підключення.',
      'Overzichtelijke lijst van externe systemen zonder dubbele OAuth-aanmelding: elke kaart opent de concrete volgende stap en toont de actuele koppelingsstaat.'
    ],
    primair:{tab:'vault',label:['Сховище таємниць','Geheimenkluis']},
    secundair:{tab:'access',label:['Машинні ключі','Machinesleutels']}
  }
};
const fallback=():Contract=>apiPlatformContractPayload({id:'',email:'',role:''});
const sessionBody=()=>({service:'api',tabContext:ecosystemTabContext(),sourceOrigin:location.origin});
const statusLabel=(status:ApiPlatformCapability['status'],tr:Tr)=>status==='published'?tr('Опубліковано','Gepubliceerd'):status==='planned'?tr('Заплановано','Gepland'):tr('Заборонено','Verboden');
const connectionStatusLabel=(status:ConnectionItem['status'],tr:Tr)=>status==='configured'?tr('Налаштовано','Geconfigureerd'):status==='error'?tr('Помилка','Fout'):status==='revoked'?tr('Відкликано','Ingetrokken'):tr('Не підключено','Niet gekoppeld');
const when=(value:number|null)=>value?new Date(value).toLocaleString():'—';
const apiFout=(e:unknown)=>String((e as {response?:{data?:{error?:unknown;reasonCode?:unknown}};message?:unknown})?.response?.data?.error||(e as {response?:{data?:{reasonCode?:unknown}}})?.response?.data?.reasonCode||(e as {message?:unknown})?.message||'');
export default function ApiPlatformView({tab,tr}:{tab:string;tr:Tr}){
  const isMaquette=useIsMaquette();
  const actieveTab:ApiActieveTab=tab==='vault'?'vault':tab==='verbindingen'?'verbindingen':'access';
  const[laagOpen,setLaagOpen]=useState(false);
  const[contract,setContract]=useState<Contract>(fallback);
  const[tokens,setTokens]=useState<TokenItem[]>([]);
  const[vault,setVault]=useState<VaultItem[]>([]);
  const[connections,setConnections]=useState<ConnectionItem[]>([]);
  const[vaultReady,setVaultReady]=useState(false);
  const[plaintext,setPlaintext]=useState('');
  const lang=tr('uk','nl')==='uk'?'uk' as const:'nl' as const;
  const gaNaarApiTab=useCallback((doelTab:string)=>{
    location.assign(canonicalNavigationUrl('api',doelTab,lang));
  },[lang]);
  useEffect(()=>{
    if(!isMaquette||typeof document==='undefined'){
      setLaagOpen(false);
      return;
    }
    const controleer=()=>{
      setLaagOpen(Boolean(document.querySelector(API_MODAAL_SELECTOR)));
    };
    controleer();
    const wortel=document.documentElement??document.body;
    if(!wortel||typeof MutationObserver!=='function')return;
    const waarnemer=new MutationObserver(controleer);
    waarnemer.observe(wortel,{
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['open','hidden','class','aria-modal','data-mq-laag-open']
    });
    return()=>waarnemer.disconnect();
  },[isMaquette,actieveTab]);
  const beginDoel=useMemo<VaultDoel>(()=>{
    try{const d=new URLSearchParams(location.search).get('doel');if(isVaultDoel(d))return d;}catch{/* ignore */}
    return 'github-oauth';
  },[tab]);
  const[renameDraft,setRenameDraft]=useState<Record<string,string>>({});
  const[busy,setBusy]=useState(false);
  const[notice,setNotice]=useState('');
  const load=async()=>{
    const[contractRes,tokenRes,vaultRes,connectionRes]=await Promise.all([
      api.post('/api/owner/api-platform/contract',sessionBody()),
      api.post('/api/owner/api-platform/tokens',sessionBody()),
      api.post('/api/owner/api-platform/vault',sessionBody()),
      api.post('/api/owner/api-platform/connections',sessionBody())
    ]);
    if(contractRes?.data)setContract({...fallback(),...contractRes.data,writeScopesEnabled:false,version:API_PLATFORM_VERSION});
    if(Array.isArray(tokenRes?.data?.items))setTokens(tokenRes.data.items);
    if(Array.isArray(vaultRes?.data?.items))setVault(vaultRes.data.items);
    if(Array.isArray(connectionRes?.data?.items))setConnections(connectionRes.data.items);
    setVaultReady(Boolean(vaultRes?.data?.encryptionReady||contractRes?.data?.vaultReady));
  };
  useEffect(()=>{let active=true;void load().catch(()=>{if(active){setContract(fallback());setTokens([]);setVault([]);setConnections([]);}});return()=>{active=false};},[tab]);
  const capabilities=contract.capabilities||[];
  const forbidden=contract.forbidden?.length?contract.forbidden:capabilities.filter(item=>item.status==='forbidden').map(item=>item.id);
  const liveCount=tokens.filter(item=>item.status==='active').length;
  const versleutelStaat=vaultReady?tr('Готове','Gereed'):tr('Очікує','Wacht');
  const statistieken=useMemo<ReadonlyArray<MaquetteHeldStatistiek>>(()=>[
    {waarde:liveCount,label:lang==='uk'?'Живих ключів':'Actieve sleutels'},
    {waarde:vault.length,label:lang==='uk'?'Таємниць у сховищі':'Geheimen in kluis'},
    {waarde:connections.length,label:lang==='uk'?'Зовнішніх з’єднань':'Externe koppelingen'},
    {waarde:versleutelStaat,label:lang==='uk'?'Шифрування сховища':'Kluisversleuteling'}
  ],[connections.length,lang,liveCount,vault.length,versleutelStaat]);
  const ankerItems=useMemo<ReadonlyArray<MaquetteAnkerItem>>(()=>[
    {id:'access',label:tr('Доступ','Toegang'),badge:liveCount||undefined},
    {id:'vault',label:tr('Сховище таємниць','Geheimenkluis'),badge:vault.length||undefined},
    {id:'verbindingen',label:tr('Підключення','Koppelingen'),badge:connections.length||undefined},
    {id:'reconciliation',label:tr('Звірка','Afstemming')}
  ],[connections.length,liveCount,tr,vault.length]);
  const held=API_HELD_TEKSTEN[actieveTab];
  const create=async()=>{if(busy)return;setBusy(true);setNotice('');try{const response=await api.post('/api/owner/api-platform/tokens/create',{...sessionBody(),label:tr('Ключ API','API-sleutel'),scopes:['identity.me.read'],expiresInDays:90});const key=String(response?.data?.plaintext||'');if(!key)throw new Error('empty');setPlaintext(key);setNotice(tr('Ключ показано один раз. Скопіюйте зараз. Backend зберіг лише hash.','Sleutel één keer getoond. Kopieer nu. Backend bewaart alleen de hash.'));await load();}catch{setNotice(tr('Не вдалося створити ключ.','Sleutel aanmaken mislukt.'))}setBusy(false);};
  const revoke=async(id:string)=>{if(busy||!window.confirm(tr('Відкликати ключ одразу?','Sleutel nu intrekken?')))return;setBusy(true);try{await api.post(`/api/owner/api-platform/tokens/${id}/revoke`,sessionBody());if(plaintext)setPlaintext('');await load();setNotice(tr('Ключ відкликано. GET /api/v1/me більше не прийме.','Sleutel ingetrokken. GET /api/v1/me weigert hem nu.'))}catch{setNotice(tr('Не вдалося відкликати.','Intrekken mislukt.'))}setBusy(false);};
  const verify=async()=>{if(!plaintext||busy)return;setBusy(true);try{const response=await api.post('/api/owner/api-platform/tokens/verify',{...sessionBody(),plaintext});setNotice(tr(`Перевірка успішна. owner id: ${response.data.ownerId}. scopes: ${(response.data.scopes||[]).join(', ')}`,`Controle geslaagd. owner-id: ${response.data.ownerId}. scopes: ${(response.data.scopes||[]).join(', ')}`));}catch{setNotice(tr('Ключ недійсний, прострочений або відкликаний.','Sleutel ongeldig, verlopen of ingetrokken.'))}setBusy(false);};
  const renameVault=async(id:string)=>{const name=String(renameDraft[id]||'').trim();if(busy||!name)return;setBusy(true);try{const response=await api.post(`/api/owner/api-platform/vault/${id}/rename`,{...sessionBody(),name});if(response?.data?.plaintext||response?.data?.value)throw new Error('leak');await load();setNotice(tr('Назву оновлено. Значення лишилось зашифрованим.','Naam bijgewerkt. De waarde blijft versleuteld.'));}catch(e){setNotice(`${tr('Не вдалося перейменувати: ','Hernoemen mislukt: ')}${foutTekst(apiFout(e),lang)}`)}setBusy(false);};
  const deleteVault=async(id:string,name:string)=>{if(busy||!window.confirm(tr(`Видалити секрет «${name}» без відновлення?`,`Geheim «${name}» definitief verwijderen?`)))return;setBusy(true);try{await api.post(`/api/owner/api-platform/vault/${id}/delete`,sessionBody());await load();setNotice(tr('Секрет видалено.','Geheim verwijderd.'));}catch(e){setNotice(`${tr('Не вдалося видалити: ','Verwijderen mislukt: ')}${foutTekst(apiFout(e),lang)}`)}setBusy(false);};
  const markConnection=async(id:string,status:ConnectionItem['status'])=>{if(busy)return;setBusy(true);try{await api.post(`/api/owner/api-platform/connections/${id}/status`,{...sessionBody(),status});await load();setNotice(tr('Статус підключення оновлено.','Koppelingsstatus bijgewerkt.'));}catch{setNotice(tr('Не вдалося оновити статус.','Status bijwerken mislukt.'))}setBusy(false);};
  const heading=tab==='vault'?tr('Сховище секретів','Geheimenkluis'):tab==='verbindingen'?tr('Реєстр підключень','Koppelingenregister'):tab==='access'?tr('API-доступ','API-toegang'):tr('API та інтеграції','API en integraties');
  return <section className={isMaquette?'api-platform mq-schil':'api-platform'} data-mq-dienst={isMaquette?'api':undefined} data-api-platform={API_PLATFORM_VERSION} data-api-tab={tab} data-api-token-count={String(liveCount)} data-api-create-token='enabled' data-api-vault={vaultReady?'ready':'blocked'} data-api-connections={String(connections.length)}>
    {isMaquette?(
      <MaquetteHeld
        key={`api-held-${actieveTab}`}
        id='api-maquette-held'
        dienst='api'
        lang={lang}
        modus={actieveTab==='access'?'volledig':'compact'}
        opslagSleutel={`api-${actieveTab}`}
        bovenregel={tr(held.boven[0],held.boven[1])}
        titelVoor={tr(held.voor[0],held.voor[1])}
        titelCursief={tr(held.cursief[0],held.cursief[1])}
        beschrijving={tr(held.beschrijving[0],held.beschrijving[1])}
        statistieken={statistieken}
        primair={{
          label:tr(held.primair.label[0],held.primair.label[1]),
          onClick:()=>gaNaarApiTab(held.primair.tab)
        }}
        secundair={{
          label:tr(held.secundair.label[0],held.secundair.label[1]),
          onClick:()=>gaNaarApiTab(held.secundair.tab)
        }}
      />
    ):null}
    <header>
      <h1>{heading}</h1>
      <p>{tab==='verbindingen'?tr('Картка відкриває конкретний наступний крок. Google identity / Gmail / Drive — лише посилання на наявний конектор, без другого OAuth. GitHub PAT окремо від UI github.tarasevych.com.','Elke kaart opent een concrete volgende stap. Google identity / Gmail / Drive verwijzen alleen naar de bestaande connector, zonder tweede OAuth. GitHub-PAT is los van de UI github.tarasevych.com.'):tr('PAT зберігається як hash. Інтеграційні секрети власника — окреме encrypted vault. Це не AppDeploy platform secrets. Значення після збереження в UI не повертається. Немає «показати секрет». Machine token не пише у vault.','PAT wordt als hash bewaard. Integratiegeheimen van de eigenaar zitten in een aparte encrypted vault. Dit zijn geen AppDeploy-platformgeheimen. Na opslaan keert de waarde niet terug in de UI. Er is geen «toon geheim». Een machinetoken schrijft niet naar de kluis.')}</p>
    </header>
    <nav className='api-platform-tabs' aria-label={tr('Розділи API','API-onderdelen')}>
      <a href='/?service=api&tab=access&lang=uk' data-api-tab-link='access'>{tr('Доступ','Toegang')}</a>
      <a href='/?service=api&tab=vault&lang=uk' data-api-tab-link='vault'>{tr('Сховище секретів','Geheimenkluis')}</a>
      <a href='/?service=api&tab=verbindingen&lang=uk' data-api-tab-link='verbindingen'>{tr('Підключення','Koppelingen')}</a>
    </nav>
    {tab!=='vault'&&tab!=='verbindingen'?<article className='api-platform-panel' data-api-access-panel='true'>
      <strong>{tr('Машинні токени','Machinetokens')}</strong>
      <div className='api-platform-meta'>
        <span data-api-token-count-value={String(liveCount)}>{tr('Живі токени','Actieve tokens')}: {liveCount}</span>
        <span>{tr('Базовий шлях /api/v1 live','Basispad /api/v1 live')}</span>
        <span>{tr('Видається лише identity.me.read','Alleen identity.me.read wordt uitgegeven')}</span>
      </div>
      <button type='button' onClick={()=>void create()} disabled={busy} data-api-create-token-button='enabled'>{tr('Створити ключ','Sleutel maken')}</button>
      {plaintext?<div className='api-platform-secret' data-api-plaintext-once='true' {...verborgenVoorAi}>
        <code>{plaintext}</code>
        <div className='api-platform-secret-actions'>
          <button type='button' onClick={()=>void navigator.clipboard?.writeText(plaintext)}>{tr('Скопіювати','Kopiëren')}</button>
          <button type='button' onClick={()=>void verify()}>{tr('Перевірити /api/v1/me','/api/v1/me controleren')}</button>
          <button type='button' onClick={()=>setPlaintext('')}>{tr('Приховати','Verbergen')}</button>
        </div>
        <small>{tr('Цей рядок більше не з’явиться. Для машини: Authorization: Bearer tsv_...','Deze waarde verschijnt niet opnieuw. Voor machines: Authorization: Bearer tsv_...')}</small>
      </div>:null}
      <ul className='api-platform-tokens'>{tokens.map(item=><li key={item.id} data-api-token-id={item.id} data-api-token-status={item.status}>
        <div><code>{item.display}</code> · {item.label} · {item.scopes.join(', ')}</div>
        <small>{tr('Статус','Status')}: {item.status} · {tr('Діє до','Geldig tot')}: {when(item.expiresAt)} · {tr('Останнє використання','Laatst gebruikt')}: {when(item.lastUsedAt)}</small>
        {item.status==='active'?<button type='button' onClick={()=>void revoke(item.id)} disabled={busy}>{tr('Відкликати','Intrekken')}</button>:null}
      </li>)}</ul>
    </article>:null}
    {tab==='verbindingen'&&<IntegratieStrook dienst='ai'/>}
    {tab==='verbindingen'?<article className='api-platform-panel' data-api-connections-panel='true'>
      <strong>{tr('Зовнішні системи','Externe systemen')}</strong>
      <div className='api-platform-meta'>
        <span data-api-connections-count={String(connections.length)}>{tr('Карток','Kaarten')}: {connections.length}</span>
        <span>{tr('Без другого Google OAuth','Geen tweede Google-OAuth')}</span>
      </div>
      <ul className='api-platform-connections'>{connections.map(item=><li key={item.id} data-api-connection-id={item.id} data-api-connection-status={item.status} data-api-connection-kind={item.kind}>
        <div><strong>{tr(item.labelUk,item.labelNl)}</strong> · <span data-api-connection-badge={item.status}>{connectionStatusLabel(item.status,tr)}</span></div>
        <small>{tr(item.noteUk,item.noteNl)}{item.vaultName?` · vault: ${item.vaultName}`:''}{item.lastError?` · ${item.lastError}`:''}</small>
        <div className='api-platform-secret-actions'>
          <a href={item.nextStep.href} data-api-connection-next={item.id}>{tr(item.nextStep.labelUk,item.nextStep.labelNl)}</a>
          {item.canMarkStatus?<>
            <button type='button' onClick={()=>void markConnection(item.id,'error')} disabled={busy}>{tr('Помилка','Fout')}</button>
            <button type='button' onClick={()=>void markConnection(item.id,'revoked')} disabled={busy}>{tr('Відкликано','Ingetrokken')}</button>
            <button type='button' onClick={()=>void markConnection(item.id,item.hasVaultSecret?'configured':'not_connected')} disabled={busy}>{tr('Зняти позначку','Markering wissen')}</button>
          </>:null}
        </div>
      </li>)}</ul>
    </article>:null}
    {tab==='vault'?<article className='api-platform-panel' data-api-vault-panel='true'>
      <strong>{tr('Encrypted vault власника','Encrypted eigenaarskluis')}</strong>
      <div className='api-platform-meta'>
        <span data-api-vault-count={String(vault.length)}>{tr('Секретів','Geheimen')}: {vault.length}</span>
        <span data-api-vault-ready={vaultReady?'yes':'no'}>{vaultReady?tr('Шифрування AES-256-GCM готове','AES-256-GCM-versleuteling klaar'):tr('Ключ шифрування недоступний','Versleutelingsleutel ontbreekt')}</span>
        <span>{tr('Читає лише backend конектора','Alleen connector-backend leest')}</span>
      </div>
      <GeheimFormulier
        lang={lang}
        beginDoel={beginDoel}
        vaultKlaar={vaultReady}
        context={sessionBody()}
        formulierNaam='api-kluis'
        onOpgeslagen={async ({ naam, rotated }) => {
          await load();
          setNotice(rotated
            ? tr(`Секрет «${naam}» оновлено й зашифровано. Значення в UI не повертається.`, `Geheim «${naam}» bijgewerkt en versleuteld. De waarde keert niet terug in de UI.`)
            : tr(`Секрет «${naam}» збережено зашифровано. Значення в UI не повертається.`, `Geheim «${naam}» versleuteld opgeslagen. De waarde keert niet terug in de UI.`));
        }}
      />
      <small>{tr('Після збереження поле очищується. Значення ніколи не передається відкритим текстом.', 'Na opslaan wordt het veld leeggemaakt. De waarde wordt nooit onversleuteld verzonden.')}</small>
      <ul className='api-platform-tokens' data-api-vault-list='true'>{vault.map(item=><li key={item.id} data-api-vault-id={item.id} data-api-vault-name={item.name}>
        <div><code>{item.name}</code> · {isVaultDoel(item.purpose)?kies(lang,DOEL_INFO[item.purpose].naam):(item.usedBy||item.purpose)} · {tr('оновлено','bijgewerkt')} {when(item.updatedAt)}<VaultMetaRegel lang={lang} meta={item.meta} staat={item.staat}/><VaultMetaBewerker lang={lang} id={item.id} meta={item.meta} context={sessionBody()} onOpgeslagen={load}/></div>
        <div className='api-platform-secret-actions'>
          <input aria-label={tr('Нова назва','Nieuwe naam')} value={renameDraft[item.id]??item.name} onChange={event=>setRenameDraft(current=>({...current,[item.id]:event.target.value}))} />
          <button type='button' onClick={()=>void renameVault(item.id)} disabled={busy}>{tr('Перейменувати','Hernoemen')}</button>
          <button type='button' onClick={()=>void deleteVault(item.id,item.name)} disabled={busy}>{tr('Видалити','Verwijderen')}</button>
        </div>
      </li>)}</ul>
    </article>:null}
    {notice?<p data-api-notice='true'>{notice}</p>:null}
    {tab!=='verbindingen'&&tab!=='vault'?<article className='api-platform-table'>
      <strong>{tr('Можливості','Mogelijkheden')}</strong>
      <table>
        <thead><tr><th>ID</th><th>{tr('Статус','Status')}</th><th>{tr('Актор','Actor')}</th><th>{tr('Опис','Beschrijving')}</th></tr></thead>
        <tbody>{capabilities.map(item=><tr key={item.id} data-api-capability={item.id} data-api-capability-status={item.status}><td><code>{item.id}</code></td><td>{statusLabel(item.status,tr)}</td><td>{item.actor}</td><td>{tr(item.descriptionUk,item.descriptionNl)}</td></tr>)}</tbody>
      </table>
    </article>:null}
    {tab!=='verbindingen'&&tab!=='vault'?<article className='api-platform-forbidden' data-api-forbidden-scopes={forbidden.join(' ')}>
      <strong>{tr('Заборонені scope','Verboden scopes')}</strong>
      <ul>{forbidden.map(id=><li key={id}><code>{id}</code></li>)}</ul>
    </article>:null}
    {isMaquette&&!laagOpen?(
      <MaquetteAnkerRail
        lang={lang}
        titel={tr('Розділи API','API-onderdelen')}
        ondertitel='api.tarasevych.com'
        items={ankerItems}
        actief={actieveTab}
        onKies={gaNaarApiTab}
        opslagSleutel='api'
      />
    ):null}
  </section>;
}
