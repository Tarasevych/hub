/** Staging-only connection manager for cloud.tarasevych.com.
 * Requires the existing CanonicalChrome; no duplicate global shell.
 * Not mounted until full release gate and real provider acceptance pass.
 */
import React,{useEffect,useMemo,useState}from'react';
import{beginCloudConsent,CloudAccountSync,type CloudAccountListItem}from'./cloud-account-sync';
import './cloud-verbinding-centrum.css';
const META=[
 {provider:'onedrive-personal',name:'OneDrive Personal',group:'Microsoft'},
 {provider:'onedrive-business',name:'OneDrive Work',group:'Microsoft'},
 {provider:'sharepoint',name:'SharePoint',group:'Microsoft'},
 {provider:'dropbox',name:'Dropbox',group:'Dropbox'},
 {provider:'box',name:'Box',group:'Box'}
];
const STATUS:Record<string,string>={connected:'Підключено',reauth_required:'Потрібен повторний вхід',
 disconnect_pending:'Відключено тут · відкликання в провайдера очікує перевірки',revoked:'Відключено'};
const nameOf=(provider:string)=>META.find(x=>x.provider===provider)?.name||provider;
async function post(url:string,data:unknown){const r=await fetch(url,{method:'POST',credentials:'include',cache:'no-store',redirect:'error',
 headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const x=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(typeof x.error==='string'?x.error:'CLOUD_REQUEST_FAILED');return x;}
export function CloudVerbindingCentrum(){
 const sync=useMemo(()=>new CloudAccountSync(),[]);
 const [accounts,setAccounts]=useState<CloudAccountListItem[]>([]),[selected,setSelected]=useState<string|null>(null);
 const [mode,setMode]=useState<'read'|'write'>('read'),[status,setStatus]=useState(''),[busy,setBusy]=useState('');
 const [showDisconnected,setShowDisconnected]=useState(false);
 useEffect(()=>{const unsub=sync.subscribe((items,active)=>{setAccounts(items);setSelected(active)});sync.start();
  return()=>{unsub();sync.stop();};},[sync]);
 const connected=accounts.filter(x=>x.status==='connected');
 const shown=showDisconnected?accounts:accounts.filter(x=>x.status!=='revoked');
 async function connect(provider:string){setBusy(provider);setStatus('Відкриваю погодження доступу в сервісі…');
  try{await beginCloudConsent(provider,mode);}catch(e){setStatus(e instanceof Error?e.message:'Не вдалося почати підключення');setBusy('');}}
 async function disconnect(a:CloudAccountListItem){
  if(!window.confirm(`Відключити «${a.displayName}»? Файли у провайдера не видаляються. Доступ до нашого Cloud буде заблоковано.`))return;
  setBusy(a.id);try{const result=await post(`/api/owner/cloud/integrations/v1/accounts/${encodeURIComponent(a.id)}/disconnect`,{confirm:true});
   setStatus(result.remote==='revoked'?'Доступ відкликано.':result.remote==='pending'?'Доступ тут заблоковано. Відкликання у провайдера потребує перевірки.':'Доступ тут заблоковано. Перевірте дозволи на стороні провайдера.');
   sync.announce();}catch(e){setStatus(e instanceof Error?e.message:'Не вдалося відключити');}finally{setBusy('');}}
 async function rename(a:CloudAccountListItem){const label=window.prompt('Підпис акаунта — наприклад «Робота», «Особистий», «Команда»',a.displayName);
  if(label===null)return;setBusy(a.id);try{await post(`/api/owner/cloud/integrations/v1/accounts/${encodeURIComponent(a.id)}/rename`,{label:label.slice(0,80)});
    setStatus('Назву підключення оновлено');sync.announce();}catch(e){setStatus(e instanceof Error?e.message:'Не вдалося змінити назву');}finally{setBusy('');}}
 return <section className="tsv-cloud-accounts" aria-labelledby="tsv-cloud-accounts-title">
  <header className="tsv-cloud-accounts-heading">
   <div><p className="tsv-cloud-eyebrow">Мій простір · Cloud</p><h2 id="tsv-cloud-accounts-title">Підключення та акаунти</h2>
   <p>Керуйте кількома робочими й особистими сховищами з одного місця. Ваші файли залишаються в обраних сервісах.</p></div>
   <span className="tsv-cloud-counter">{connected.length} підключено</span>
  </header>
  <div className="tsv-cloud-two-col">
   <section className="tsv-cloud-panel" aria-labelledby="tsv-cloud-connect-heading">
    <h3 id="tsv-cloud-connect-heading">Додати підключення</h3>
    <p>Виберіть, які дозволи потрібні. Погодження відбувається на офіційному сайті провайдера.</p>
    <fieldset className="tsv-cloud-scopes"><legend>Доступ</legend>
     <label><input type="radio" checked={mode==='read'} onChange={()=>setMode('read')}/> Лише перегляд</label>
     <label><input type="radio" checked={mode==='write'} onChange={()=>setMode('write')}/> Перегляд і зміни</label>
    </fieldset>
    <div className="tsv-cloud-providers">{META.map(item=><div key={item.provider} className="tsv-cloud-provider">
      <div><strong>{item.name}</strong><small>{item.group}</small></div>
      <button type="button" disabled={Boolean(busy)} onClick={()=>connect(item.provider)} aria-label={`Підключити ${item.name}`}>{busy===item.provider?'Підключення…':'Підключити'}</button>
    </div>)}</div>
    <p className="tsv-cloud-note">У Box режим лише читання обмежується нашою системою; фактичні дозволи застосунку задаються у Box Developer Console. Nextcloud та S3 мають окремі способи авторизації й будуть доступні після перевірки їхніх захищених майстрів підключення. Google Drive використовує наявне канонічне підключення Google Suite.</p>
   </section>
   <section className="tsv-cloud-panel" aria-labelledby="tsv-cloud-connected-heading">
    <div className="tsv-cloud-panel-header"><h3 id="tsv-cloud-connected-heading">Мої акаунти</h3>
     <button type="button" className="tsv-cloud-subtle" onClick={()=>sync.refresh(true)}>Оновити</button></div>
    {shown.length===0?<p className="tsv-cloud-empty">Поки немає підключень у цьому просторі.</p>:
    <div className="tsv-cloud-connections">{shown.map(a=><article key={a.id} className={`tsv-cloud-connected ${a.id===selected?'tsv-cloud-current':''}`}>
      <div className="tsv-cloud-connected-line"><strong>{a.displayName}</strong><span>{STATUS[a.status]||a.status}</span></div>
      <p>{nameOf(a.provider)} · {a.email} · {a.mode==='write'?'Читання й запис':'Читання'}</p>
      <div className="tsv-cloud-account-actions">
       <button type="button" disabled={a.status!=='connected'} onClick={()=>sync.select(a.id)}>{a.id===selected?'Обрано в цій вкладці':'Обрати тут'}</button>
       <button type="button" disabled={Boolean(busy)} onClick={()=>rename(a)}>Назва</button>
       <button type="button" disabled={Boolean(busy)||['revoked','disconnect_pending'].includes(a.status)} onClick={()=>disconnect(a)}>Відключити</button>
      </div>
     </article>)}</div>}
    <label className="tsv-cloud-show-disconnected"><input type="checkbox" checked={showDisconnected} onChange={e=>setShowDisconnected(e.target.checked)}/> Показати відключені</label>
   </section>
  </div>
  <p role="status" aria-live="polite" className="tsv-cloud-status">{status}</p>
  <aside className="tsv-cloud-bottom-note">Вибір акаунта не перемикає інші вкладки. Підключення й відкликання дозволів синхронізуються через сервер між браузерами та пристроями. Секретні ключі ніколи не передаються в цей інтерфейс.</aside>
 </section>;
}
