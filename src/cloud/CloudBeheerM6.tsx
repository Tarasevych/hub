/** Private owner administration, not mounted before Cloud release acceptance.
 * CanonicalChrome supplies the server-registered tabContext; never invent a tab id.
 */
import {useEffect,useState} from 'react';
import './cloud-beheer-m6.css';
type Policy={provider:string;allowNewConnections:boolean;allowExistingOperations:boolean;revision:number;updatedBy:string};
type Props={tabContext:string};
const labels:Record<string,string>={'google-drive':'Google Drive','onedrive-personal':'OneDrive Personal',
 'onedrive-business':'OneDrive Business',sharepoint:'SharePoint',dropbox:'Dropbox',box:'Box',
 nextcloud:'Nextcloud',s3:'Amazon S3','backblaze-b2':'Backblaze B2',pcloud:'pCloud',github:'GitHub'};
async function action(path:string,body:unknown){
 const response=await fetch(`/api/owner/admin/cloud/providers/${path}`,{
  method:'POST',credentials:'include',cache:'no-store',redirect:'error',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||data.code||'CLOUD_M6_ADMIN_UNAVAILABLE');
 return data;
}
export function CloudBeheerM6({tabContext}:Props){
 const[items,setItems]=useState<Policy[]>([]),[reason,setReason]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState('');
 const[ready,setReady]=useState(false);
 const refresh=async()=>{const x=await action('list',{tabContext});
  if(x.schema!=='cloud-governance-m6'||!Array.isArray(x.providers))throw Error('CLOUD_M6_INVALID_RESPONSE');
  setItems(x.providers);setReady(true);};
 useEffect(()=>{let active=true;void refresh().catch(e=>{if(active)setMessage(String(e.message||e));});return()=>{active=false};},[tabContext]);
 async function toggle(p:Policy,kind:'allowNewConnections'|'allowExistingOperations'){
  const value=!p[kind];
  // Human must name the purpose and confirm expanding privileges.
  if(reason.trim().length<8){setMessage('Вкажіть причину зміни (не менше 8 символів).');return;}
  if(value&&!window.confirm(`Дозволити ${kind==='allowNewConnections'?'нові підключення':'файлові операції'} для ${labels[p.provider]||p.provider}? Потрібен доказ live-тестування.`))return;
  setBusy(p.provider);setMessage('');
  try{await action('change',{tabContext,provider:p.provider,expectedRevision:p.revision,
   allowNewConnections:kind==='allowNewConnections'?value:p.allowNewConnections,
   allowExistingOperations:kind==='allowExistingOperations'?value:p.allowExistingOperations,reason:reason.trim()});
   await refresh();setMessage('Збережено та додано до журналу змін.');}
  catch(e){setMessage(e instanceof Error?e.message:'Не вдалося зберегти.');await refresh().catch(()=>undefined);}
  finally{setBusy('');}
 }
 return <section className="tsv-cloud-governance" aria-labelledby="tsv-cloud-gov-title">
  <header><p className="tsv-cloud-governance__eyebrow">Адміністрування · Технічний простір</p>
   <h2 id="tsv-cloud-gov-title">Політики хмарних провайдерів</h2>
   <p>Провайдери заборонені за замовчуванням. Підключення працюють лише після підписаних CI-перевірок і дозволу власника.</p></header>
  <label>Причина зміни політики <textarea rows={2} value={reason} onChange={e=>setReason(e.target.value.slice(0,500))} placeholder="Наприклад: результати приймальних перевірок релізу…"/></label>
  <div className="tsv-cloud-governance__items">{items.map(p=><article key={p.provider}>
   <div className="tsv-cloud-governance__top"><strong>{labels[p.provider]||p.provider}</strong><small>ревізія {p.revision}</small></div>
   <div className="tsv-cloud-governance__toggles">
    <label><input type="checkbox" checked={p.allowNewConnections} disabled={Boolean(busy)} onChange={()=>toggle(p,'allowNewConnections')}/> Нові підключення</label>
    <label><input type="checkbox" checked={p.allowExistingOperations} disabled={Boolean(busy)} onChange={()=>toggle(p,'allowExistingOperations')}/> Файлові операції</label>
   </div>
  </article>)}</div>
  {!ready&&<p>Політики ще не отримано з сервера.</p>}
  <p role="status" aria-live="polite">{message}</p>
  <p>Відключення акаунтів користувачами залишається можливим, навіть коли операції провайдера заблоковано.</p>
 </section>;
}
