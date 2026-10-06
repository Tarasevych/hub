import {useEffect,useState} from 'react';
import {api} from './platform/client';
import {API_PLATFORM_VERSION,apiPlatformContractPayload,type ApiPlatformCapability} from './api-platform-contract';
import {ecosystemTabContext} from './tab-context';
import './api-platform-view.css';
type Tr=(uk:string,nl:string)=>string;
type Contract=ReturnType<typeof apiPlatformContractPayload>;
type TokenItem={id:string;prefix:string;display:string;scopes:string[];label:string;createdAt:number;expiresAt:number;lastUsedAt:number|null;revokedAt:number|null;status:'active'|'expired'|'revoked'};
type VaultItem={id:string;name:string;purpose:string;usedBy:string;updatedAt:number;createdAt:number;hasValue:boolean};
type ConnectionItem={id:string;kind:'google-link'|'vault-secret';labelUk:string;labelNl:string;noteUk:string;noteNl:string;status:'not_connected'|'configured'|'error'|'revoked';source:string;hasVaultSecret:boolean;vaultName:string;lastError:string;nextStep:{href:string;labelUk:string;labelNl:string};canMarkStatus:boolean;oauthSecondPass:boolean};
const fallback=():Contract=>apiPlatformContractPayload({id:'',email:'',role:''});
const sessionBody=()=>({service:'api',tabContext:ecosystemTabContext(),sourceOrigin:location.origin});
const statusLabel=(status:ApiPlatformCapability['status'],tr:Tr)=>status==='published'?tr('Опубліковано','Gepubliceerd'):status==='planned'?tr('Заплановано','Gepland'):tr('Заборонено','Verboden');
const connectionStatusLabel=(status:ConnectionItem['status'],tr:Tr)=>status==='configured'?tr('Налаштовано','Geconfigureerd'):status==='error'?tr('Помилка','Fout'):status==='revoked'?tr('Відкликано','Ingetrokken'):tr('Не підключено','Niet gekoppeld');
const when=(value:number|null)=>value?new Date(value).toLocaleString():'—';
const PURPOSES=[{id:'anthropic',uk:'Anthropic (Claude API)',nl:'Anthropic (Claude-API)'},{id:'home-assistant',uk:'Home Assistant',nl:'Home Assistant'},{id:'telegram',uk:'Telegram bot',nl:'Telegram-bot'},{id:'github',uk:'GitHub PAT',nl:'GitHub PAT'},{id:'webhook',uk:'Webhook signing',nl:'Webhook-ondertekening'},{id:'other',uk:'Інше',nl:'Overig'}];
export default function ApiPlatformView({tab,tr}:{tab:string;tr:Tr}){
  const[contract,setContract]=useState<Contract>(fallback);
  const[tokens,setTokens]=useState<TokenItem[]>([]);
  const[vault,setVault]=useState<VaultItem[]>([]);
  const[connections,setConnections]=useState<ConnectionItem[]>([]);
  const[vaultReady,setVaultReady]=useState(false);
  const[plaintext,setPlaintext]=useState('');
  const[vaultName,setVaultName]=useState('ha-long-lived');
  const[vaultPurpose,setVaultPurpose]=useState('home-assistant');
  const[vaultValue,setVaultValue]=useState('');
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
  const create=async()=>{if(busy)return;setBusy(true);setNotice('');try{const response=await api.post('/api/owner/api-platform/tokens/create',{...sessionBody(),label:tr('Ключ API','API-sleutel'),scopes:['identity.me.read'],expiresInDays:90});const key=String(response?.data?.plaintext||'');if(!key)throw new Error('empty');setPlaintext(key);setNotice(tr('Ключ показано один раз. Скопіюйте зараз. Backend зберіг лише hash.','Sleutel één keer getoond. Kopieer nu. Backend bewaart alleen de hash.'));await load();}catch{setNotice(tr('Не вдалося створити ключ.','Sleutel aanmaken mislukt.'))}setBusy(false);};
  const revoke=async(id:string)=>{if(busy||!window.confirm(tr('Відкликати ключ одразу?','Sleutel nu intrekken?')))return;setBusy(true);try{await api.post(`/api/owner/api-platform/tokens/${id}/revoke`,sessionBody());if(plaintext)setPlaintext('');await load();setNotice(tr('Ключ відкликано. GET /api/v1/me більше не прийме.','Sleutel ingetrokken. GET /api/v1/me weigert hem nu.'))}catch{setNotice(tr('Не вдалося відкликати.','Intrekken mislukt.'))}setBusy(false);};
  const verify=async()=>{if(!plaintext||busy)return;setBusy(true);try{const response=await api.post('/api/owner/api-platform/tokens/verify',{...sessionBody(),plaintext});setNotice(tr(`Перевірка успішна. owner id: ${response.data.ownerId}. scopes: ${(response.data.scopes||[]).join(', ')}`,`Controle geslaagd. owner-id: ${response.data.ownerId}. scopes: ${(response.data.scopes||[]).join(', ')}`));}catch{setNotice(tr('Ключ недійсний, прострочений або відкликаний.','Sleutel ongeldig, verlopen of ingetrokken.'))}setBusy(false);};
  const saveVault=async()=>{if(busy)return;setBusy(true);setNotice('');try{const response=await api.post('/api/owner/api-platform/vault/save',{...sessionBody(),name:vaultName,purpose:vaultPurpose,usedBy:vaultPurpose,value:vaultValue});if(response?.data?.plaintext||response?.data?.value||response?.data?.secret)throw new Error('leak');setVaultValue('');await load();setNotice(tr('Секрет збережено зашифровано. Значення в UI більше не показується.','Geheim versleuteld opgeslagen. De waarde wordt niet meer in de UI getoond.'));}catch{setNotice(tr('Не вдалося зберегти секрет. Перевірте назву і що поле значення не порожнє.','Geheim opslaan mislukt. Controleer de naam en of de waarde niet leeg is.'))}setBusy(false);};
  const renameVault=async(id:string)=>{const name=String(renameDraft[id]||'').trim();if(busy||!name)return;setBusy(true);try{const response=await api.post(`/api/owner/api-platform/vault/${id}/rename`,{...sessionBody(),name});if(response?.data?.plaintext||response?.data?.value)throw new Error('leak');await load();setNotice(tr('Назву оновлено. Значення лишилось зашифрованим.','Naam bijgewerkt. De waarde blijft versleuteld.'));}catch{setNotice(tr('Не вдалося перейменувати.','Hernoemen mislukt.'))}setBusy(false);};
  const deleteVault=async(id:string,name:string)=>{if(busy||!window.confirm(tr(`Видалити секрет «${name}» без відновлення?`,`Geheim «${name}» definitief verwijderen?`)))return;setBusy(true);try{await api.post(`/api/owner/api-platform/vault/${id}/delete`,sessionBody());await load();setNotice(tr('Секрет видалено.','Geheim verwijderd.'));}catch{setNotice(tr('Не вдалося видалити.','Verwijderen mislukt.'))}setBusy(false);};
  const markConnection=async(id:string,status:ConnectionItem['status'])=>{if(busy)return;setBusy(true);try{await api.post(`/api/owner/api-platform/connections/${id}/status`,{...sessionBody(),status});await load();setNotice(tr('Статус підключення оновлено.','Koppelingsstatus bijgewerkt.'));}catch{setNotice(tr('Не вдалося оновити статус.','Status bijwerken mislukt.'))}setBusy(false);};
  const heading=tab==='vault'?tr('Сховище секретів','Geheimenkluis'):tab==='connections'?tr('Реєстр підключень','Koppelingenregister'):tab==='access'?tr('API-доступ','API-toegang'):tr('API та інтеграції','API en integraties');
  return <section className='api-platform' data-api-platform={API_PLATFORM_VERSION} data-api-tab={tab} data-api-token-count={String(liveCount)} data-api-create-token='enabled' data-api-vault={vaultReady?'ready':'blocked'} data-api-connections={String(connections.length)}>
    <header>
      <h1>{heading}</h1>
      <p>{tab==='connections'?tr('Картка відкриває конкретний наступний крок. Google identity / Gmail / Drive — лише посилання на існуючий конектор, без другого OAuth. GitHub PAT окремо від UI github.tarasevych.com.','Elke kaart opent een concrete volgende stap. Google identity / Gmail / Drive verwijzen alleen naar de bestaande connector, zonder tweede OAuth. GitHub-PAT is los van de UI github.tarasevych.com.'):tr('PAT зберігається як hash. Інтеграційні секрети власника — окреме encrypted vault. Це не AppDeploy platform secrets. Значення після збереження в UI не повертається. Немає «показати секрет». Machine token не пише у vault.','PAT wordt als hash bewaard. Integratiegeheimen van de eigenaar zitten in een aparte encrypted vault. Dit zijn geen AppDeploy-platformgeheimen. Na opslaan keert de waarde niet terug in de UI. Er is geen «toon geheim». Een machinetoken schrijft niet naar de kluis.')}</p>
    </header>
    <nav className='api-platform-tabs' aria-label={tr('Розділи API','API-onderdelen')}>
      <a href='/?service=api&tab=access&lang=uk' data-api-tab-link='access'>{tr('Доступ','Toegang')}</a>
      <a href='/?service=api&tab=vault&lang=uk' data-api-tab-link='vault'>{tr('Сховище секретів','Geheimenkluis')}</a>
      <a href='/?service=api&tab=connections&lang=uk' data-api-tab-link='connections'>{tr('Підключення','Koppelingen')}</a>
    </nav>
    {tab!=='vault'&&tab!=='connections'?<article className='api-platform-panel' data-api-access-panel='true'>
      <strong>{tr('Машинні токени','Machinetokens')}</strong>
      <div className='api-platform-meta'>
        <span data-api-token-count-value={String(liveCount)}>{tr('Живі токени','Actieve tokens')}: {liveCount}</span>
        <span>{tr('Базовий шлях /api/v1 live','Basispad /api/v1 live')}</span>
        <span>{tr('Видається лише identity.me.read','Alleen identity.me.read wordt uitgegeven')}</span>
      </div>
      <button type='button' onClick={()=>void create()} disabled={busy} data-api-create-token-button='enabled'>{tr('Створити ключ','Sleutel maken')}</button>
      {plaintext?<div className='api-platform-secret' data-api-plaintext-once='true'>
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
    {tab==='connections'?<article className='api-platform-panel' data-api-connections-panel='true'>
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
      <form className='api-platform-vault-form' onSubmit={event=>{event.preventDefault();void saveVault();}}>
        <label>{tr('Назва','Naam')}<input name='vault-name' autoComplete='off' value={vaultName} onChange={event=>setVaultName(event.target.value)} placeholder='ha-long-lived' /></label>
        <label>{tr('Призначення','Doel')}<select value={vaultPurpose} onChange={event=>setVaultPurpose(event.target.value)}>{PURPOSES.map(item=><option key={item.id} value={item.id}>{tr(item.uk,item.nl)}</option>)}</select></label>
        <label>{tr('Значення (один раз)','Waarde (één keer)')}<input name='vault-value' type='password' autoComplete='new-password' value={vaultValue} onChange={event=>setVaultValue(event.target.value)} placeholder={tr('Вставте секрет і збережіть','Plak het geheim en sla op')} /></label>
        <button type='submit' disabled={busy||!vaultValue||!vaultReady}>{tr('Зберегти зашифровано','Versleuteld opslaan')}</button>
      </form>
      <small>{tr('Після збереження поле очищується. Показати секрет неможливо. Google/Microsoft platform secrets сюди не входять.','Na opslaan wordt het veld leeggemaakt. Het geheim kan niet getoond worden. Google-/Microsoft-platformgeheimen horen hier niet.')}</small>
      <ul className='api-platform-tokens' data-api-vault-list='true'>{vault.map(item=><li key={item.id} data-api-vault-id={item.id} data-api-vault-name={item.name}>
        <div><code>{item.name}</code> · {item.usedBy||item.purpose} · {tr('оновлено','bijgewerkt')} {when(item.updatedAt)}</div>
        <div className='api-platform-secret-actions'>
          <input aria-label={tr('Нова назва','Nieuwe naam')} value={renameDraft[item.id]??item.name} onChange={event=>setRenameDraft(current=>({...current,[item.id]:event.target.value}))} />
          <button type='button' onClick={()=>void renameVault(item.id)} disabled={busy}>{tr('Перейменувати','Hernoemen')}</button>
          <button type='button' onClick={()=>void deleteVault(item.id,item.name)} disabled={busy}>{tr('Видалити','Verwijderen')}</button>
        </div>
      </li>)}</ul>
    </article>:null}
    {notice?<p data-api-notice='true'>{notice}</p>:null}
    {tab!=='connections'&&tab!=='vault'?<article className='api-platform-table'>
      <strong>{tr('Можливості','Mogelijkheden')}</strong>
      <table>
        <thead><tr><th>ID</th><th>{tr('Статус','Status')}</th><th>{tr('Актор','Actor')}</th><th>{tr('Опис','Beschrijving')}</th></tr></thead>
        <tbody>{capabilities.map(item=><tr key={item.id} data-api-capability={item.id} data-api-capability-status={item.status}><td><code>{item.id}</code></td><td>{statusLabel(item.status,tr)}</td><td>{item.actor}</td><td>{tr(item.descriptionUk,item.descriptionNl)}</td></tr>)}</tbody>
      </table>
    </article>:null}
    {tab!=='connections'&&tab!=='vault'?<article className='api-platform-forbidden' data-api-forbidden-scopes={forbidden.join(' ')}>
      <strong>{tr('Заборонені scope','Verboden scopes')}</strong>
      <ul>{forbidden.map(id=><li key={id}><code>{id}</code></li>)}</ul>
    </article>:null}
  </section>;
}
