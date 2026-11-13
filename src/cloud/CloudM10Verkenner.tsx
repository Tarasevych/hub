/** M10: захищений оглядач кількох облікових записів у передпусковому режимі.
 * Використовує лише серверні маршрути каталогів, прив'язані до облікового запису; ніколи не вигадує можливостей,
 * попередніх переглядів або прямих посилань завантаження, і не замінює основний переглядач Google Диску.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {api} from '../platform/client';
import {openUniverseelBestand,type BestandBron} from '../bestand/universeel-bestand';
import './cloud-m10-verkenner.css';
import '../cloud-klassiek-maquette.css';

type A={id:string;provider:string;displayName:string;email:string;status:string};
type F={id:string;name:string;kind:'file'|'folder';size:number|null;revision:string;mime:string};
type Page={account:{id:string;provider:string;label:string};folderId:string;items:F[];nextCursor:string|null};
type Props={lang:'uk'|'nl';tabContext:string;sourceOrigin:string;googleAccounts:A[]};
const size=(n:number|null,language:string)=>n===null?'—':new Intl.NumberFormat(language==='uk'?'uk-UA':'nl-BE',{maximumFractionDigits:1}).format(n<1024?n:n<1048576?n/1024:n/1048576)+(n<1024?' B':n<1048576?' KiB':' MiB');
const safeTitle=(s:string)=>s.length>200?s.slice(0,197)+'…':s;
export default function CloudM10Verkenner({lang,tabContext,sourceOrigin,googleAccounts}:Props){
 const t=(uk:string,nl:string)=>lang==='uk'?uk:nl;
 const[accounts,setAccounts]=useState<A[]>([]),[accountId,setAccountId]=useState('');
 const[breadcrumbs,setBreadcrumbs]=useState<Array<{id:string;name:string}>>([{id:'root',name:t('Мої файли','Mijn bestanden')}]);
 const[page,setPage]=useState<Page|null>(null),[loading,setLoading]=useState(false),[loadingMore,setLoadingMore]=useState(false),[error,setError]=useState('');
 const[filter,setFilter]=useState(''),[view,setView]=useState<'list'|'grid'>('list');const sequence=useRef(0);
 const previewSequence=useRef(0),[previewing,setPreviewing]=useState<string|null>(null);
 const context=useMemo(()=>({service:'cloud',tabContext,sourceOrigin}),[tabContext,sourceOrigin]);
 useEffect(()=>{let live=true;
  void api.post('/api/owner/cloud/integrations/v1/accounts/list',context).then(({data})=>{
   if(!live)return;
   if(data?.schema!=='cloud-accounts-m4'||!Array.isArray(data.accounts))throw Error('CLOUD_ACCOUNTS_INVALID');
   setAccounts(data.accounts.filter((a:A)=>a&&a.status==='connected'&&typeof a.id==='string'));
  }).catch(()=>{if(live)setError(t('Список підключень тимчасово недоступний.','Koppelingenlijst is tijdelijk niet beschikbaar.'));});
  return()=>{live=false;};
 },[context,lang]);
 const sources=useMemo(()=>{const indexed=new Map<string,A>();for(const a of [...googleAccounts,...accounts])if(a.status==='connected')indexed.set(a.provider+':'+a.id,a);return [...indexed.values()];},[accounts,googleAccounts]);
 const selected=sources.find(a=>a.id===accountId)||null;
 const folder=breadcrumbs[breadcrumbs.length-1]?.id||'root';
 async function load(id:string,folderId:string,cursor:string|null,append:boolean){
  if(!id)return;const number=++sequence.current;append?setLoadingMore(true):setLoading(true);setError('');
  try{const {data}=await api.post('/api/owner/cloud/integrations/v1/directory/list',{...context,accountId:id,folderId,cursor});
   if(number!==sequence.current)return;
   if(data?.schema!=='cloud-directory-m8'||!Array.isArray(data.items))throw Error('CLOUD_DIRECTORY_INVALID');
   setPage(prev=>append&&prev&&prev.account.id===id&&prev.folderId===folderId?{...data,items:[...prev.items,...data.items]}:data as Page);
  }catch(e){if(number===sequence.current){setError(t('Файли цього сховища недоступні. Перевірте дозвіл, підключення і стан сервісу.','Bestanden zijn niet beschikbaar. Controleer toestemming, koppeling en servicestatus.'));if(!append)setPage(null);}}
  finally{if(number===sequence.current){setLoading(false);setLoadingMore(false);}}
 }
 function select(id:string){++sequence.current;++previewSequence.current;setPreviewing(null);setAccountId(id);setPage(null);setFilter('');setBreadcrumbs([{id:'root',name:t('Мої файли','Mijn bestanden')}]);void load(id,'root',null,false);}
 async function previewFile(file:F){
  if(!selected||file.kind!=='file'||!file.revision||!file.size||file.size>8*1024*1024)return;
  const current=++previewSequence.current,sourceAccount=selected.id,provider=selected.provider;
  setPreviewing(file.id);setError('');
  try{
   const {data}=await api.post('/api/owner/cloud/integrations/v1/files/preview',{
    ...context,accountId:sourceAccount,fileId:file.id,expectedRevision:file.revision
   });
   if(current!==previewSequence.current)return;
   if(data?.schema!=='cloud-preview-m11'||data.accountId!==sourceAccount||data.revision!==file.revision||
      typeof data.dataBase64!=='string'||data.dataBase64.length>12_000_000||data.security!=='SERVER_DELEGATED_NOT_E2EE')
    throw Error('CLOUD_M11_RESPONSE_INVALID');
   const raw=atob(data.dataBase64),bytes=new Uint8Array(raw.length);
   for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   if(bytes.length!==data.size)throw Error('CLOUD_M11_SIZE_MISMATCH');
   const actualHash=await crypto.subtle.digest('SHA-256',bytes);
   const hash=Array.from(new Uint8Array(actualHash),v=>v.toString(16).padStart(2,'0')).join('');
   if(hash!==data.sha256)throw Error('CLOUD_M11_SHA256_MISMATCH');
   if(current!==previewSequence.current)return;
   const source:BestandBron=provider==='google-drive'?'google-drive':provider.startsWith('onedrive')||provider==='sharepoint'?'onedrive':provider==='dropbox'?'dropbox':provider==='github'?'github':'plugin';
   openUniverseelBestand({bron:source,bronLabel:provider,bestand:new Blob([bytes],{type:data.mime||'application/octet-stream'}),
    bestandsnaam:data.name,contentType:data.mime});
  }catch{
   if(current===previewSequence.current)setError(t('Безпечний перегляд недоступний. Файл не змінено.','Veilige preview is niet beschikbaar. Het bestand is niet gewijzigd.'));
  }finally{if(current===previewSequence.current)setPreviewing(null);}
 }
 function openFolder(file:F){const next=[...breadcrumbs,{id:file.id,name:file.name}];setBreadcrumbs(next);void load(accountId,file.id,null,false);}
 function goBack(index:number){const next=breadcrumbs.slice(0,index+1);setBreadcrumbs(next);void load(accountId,next[next.length-1].id,null,false);}
 const items=useMemo(()=>[...(page?.items||[])].filter(i=>i.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).sort((a,b)=>Number(b.kind==='folder')-Number(a.kind==='folder')||a.name.localeCompare(b.name)),[page,filter]);
 return <section className="tsv-cloud-m10" aria-label={t('Єдиний файловий каталог','Verenigde bestandscatalogus')}>
  <header className="tsv-cloud-m10-head"><div><span>{t('Cloud · багато акаунтів','Cloud · meerdere accounts')}</span><h2>{t('Усі підключені сховища','Alle gekoppelde opslagdiensten')}</h2><p>{t('Файли залишаються у своїх сервісах. Операції перевіряються для кожного акаунта.','Bestanden blijven bij hun provider. Elke bewerking vereist een accountspecifieke controle.')}</p></div>
   <span className="tsv-cloud-m10-stage">{t('Інтеграційне тестування','Integratietesten')}</span></header>
  <div className="tsv-cloud-m10-toolbar"><label>{t('Сховище й акаунт','Opslag en account')}<select value={accountId} onChange={e=>select(e.target.value)}><option value="">{t('Оберіть підключення','Kies een koppeling')}</option>{sources.map(a=><option key={a.provider+':'+a.id} value={a.id}>{a.displayName||a.email||a.id} · {a.provider}</option>)}</select></label>
   <label>{t('Фільтр у цій теці','Filter in deze map')}<input type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder={t('Назва файла','Bestandsnaam')} /></label>
   <fieldset><legend>{t('Вигляд','Weergave')}</legend><button type="button" aria-pressed={view==='list'} onClick={()=>setView('list')}>{t('Список','Lijst')}</button><button type="button" aria-pressed={view==='grid'} onClick={()=>setView('grid')}>{t('Сітка','Raster')}</button></fieldset></div>
  <nav className="tsv-cloud-m10-crumbs" aria-label={t('Шлях тек','Mappad')}>{selected&&breadcrumbs.map((x,i)=><button type="button" key={x.id+':'+i} disabled={loading||i===breadcrumbs.length-1} onClick={()=>goBack(i)}>{i>0?'› ':''}{safeTitle(x.name)}</button>)}</nav>
  {error&&<p className="tsv-cloud-m10-error" role="alert">{error}</p>}
  {!selected?<p className="tsv-cloud-m10-empty">{t('Оберіть акаунт. Основне підключення Google Drive не буде автоматично перемкнено.','Selecteer een account. Het primaire Google Drive-account wordt niet automatisch gewisseld.')}</p>:
   loading?<p role="status">{t('Завантаження без зміни файлів…','Bestanden laden zonder wijzigingen…')}</p>:
   !items.length?<p className="tsv-cloud-m10-empty">{page?t('У теці немає файлів, що відповідають фільтру.','Geen bestanden gevonden in deze map.'):t('Перегляд не завантажено.','De map is niet geladen.')}</p>:
   <div className={'tsv-cloud-m10-items '+view}>{items.map(f=><article key={f.id+f.revision} className="tsv-cloud-m10-item"><button type="button" onClick={()=>f.kind==='folder'?openFolder(f):void previewFile(f)} disabled={f.kind==='file'&&(!f.revision||!f.size||f.size>8*1024*1024||previewing!==null)} title={f.kind==='folder'?t('Відкрити теку','Map openen'):t('Переглянути лише після перевірки акаунта й версії','Voorbeeld na controle van account en versie')}>
    <span className="tsv-cloud-m10-icon" aria-hidden="true">{f.kind==='folder'?'📁':'📄'}</span><span className="tsv-cloud-m10-details"><strong>{safeTitle(f.name)}</strong><small>{f.kind==='folder'?t('Тека','Map'):f.mime||t('Невідомий формат','Onbekend formaat')} · {size(f.size,lang)}</small></span></button>
    <div className="tsv-cloud-m10-actions">{f.kind==='folder'?<button type="button" onClick={()=>openFolder(f)}>{t('Відкрити','Openen')}</button>:<button type="button" onClick={()=>void previewFile(f)} disabled={!f.revision||!f.size||f.size>8*1024*1024||previewing!==null}>{previewing===f.id?t('Завантаження…','Laden…'):t('Переглянути','Voorbeeld')}</button>}</div>
   </article>)}</div>}
  {page?.nextCursor&&<button className="tsv-cloud-m10-more" type="button" disabled={loadingMore} onClick={()=>void load(accountId,folder,page.nextCursor,true)}>{loadingMore?t('Завантаження…','Laden…'):t('Показати ще','Meer tonen')}</button>}
  <footer>{t('Попередній перегляд: до 8 MiB, тільки після підтвердження ревізії. Для файлів стороннього провайдера наш сервер тимчасово обробляє відкритий вміст — це НЕ E2EE. Усі функції лише в тестовому режимі.','Voorbeeld: maximaal 8 MiB en alleen met gecontroleerde revisie. Onze server verwerkt bij gewone externe providers kortstondig leesbare bytes: dit is GEEN E2EE. Alleen testmodus.')}</footer>
 </section>;
}
