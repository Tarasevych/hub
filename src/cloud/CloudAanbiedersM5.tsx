/** M5 staging-only provider overview. CanonicalChrome navigation remains untouched.
 * This component NEVER enables permissions based on a provider name alone.
 * Server-side catalogue intentionally reports all unverified first-wave providers as not ready.
 */
import {useEffect,useState} from 'react';
import './cloud-aanbieders-m5.css';
type State={id:string;title:string;authentication:string;ready:boolean;status:string;missing:string[];constraints:string[]};
type Envelope={schema:string;release:string;providers:State[];allReady:boolean};
export function CloudAanbiedersM5(){
 const [data,setData]=useState<Envelope|null>(null),[error,setError]=useState('');
 const [filter,setFilter]=useState(''),[expanded,setExpanded]=useState<string|null>(null);
 useEffect(()=>{let cancelled=false;const controller=new AbortController();
  const load=async()=>{try{
   const response=await fetch('/api/owner/cloud/integrations/v1/catalogue',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error('CLOUD_PROVIDER_CATALOGUE_NOT_AVAILABLE');
   const body=await response.json() as Envelope;
   if(body.schema!=='cloud-provider-catalogue-m5'||!Array.isArray(body.providers))throw Error('CLOUD_PROVIDER_CATALOGUE_INVALID');
   if(!cancelled){setData(body);setError('');}
  }catch(e){if(!cancelled){setData(null);setError(e instanceof Error?e.message:'CLOUD_PROVIDER_CATALOGUE_ERROR');}}};
  void load();return()=>{cancelled=true;controller.abort();};
 },[]);
 return <section className="cloud-m5" aria-label="Каталог хмарних інтеграцій">
  <header className="cloud-m5__heading"><div><p className="cloud-m5__eyebrow">Cloud · керування інтеграціями</p><h2>Сервіси та підключення</h2><p>Один робочий простір, окремий доступ до кожного акаунта. Доступність визначається сервером.</p></div><span className="cloud-m5__stage">Тестовий режим · не опубліковано</span></header>
  <label className="cloud-m5__search">Знайти сервіс<input type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Наприклад, Dropbox або S3" /></label>
  {error&&<div role="status" className="cloud-m5__warning">Каталог недоступний. Наявні підключення не змінено. ({error})</div>}
  {data&&!data.allReady&&<div className="cloud-m5__warning">Інтеграції ще проходять тестування. Підключення не відкриваються, доки сервер не підтвердить роботу.</div>}
  <div className="cloud-m5__grid">{data?.providers.filter(p=>p.title.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).map(p=><article className="cloud-m5__card" key={p.id}>
   <div className="cloud-m5__card-head"><div><h3>{p.title}</h3><small>{p.authentication}</small></div><span className={'cloud-m5__status '+(p.ready?'is-ready':'')}>{p.ready?'Перевірено':'У розробці'}</span></div>
   <p>{p.ready?'Функції перевірено. Для доступу потрібне підключення акаунта.':'Підключення буде доступне лише після приймання інтеграції.'}</p>
   <div className="cloud-m5__actions"><button type="button" onClick={()=>setExpanded(expanded===p.id?null:p.id)} aria-expanded={expanded===p.id}>Можливості та умови</button><button type="button" disabled title="Майстер підключення буде доступний після серверної інтеграції та перевірки OAuth/ключів">Підключити</button></div>
   {expanded===p.id&&<div className="cloud-m5__details">{p.constraints.map((c,i)=><p key={i}>• {c}</p>)}</div>}
  </article>)}</div>
  <p className="cloud-m5__footnote">Повідомлення «API підтримує операцію» не означає, що поточний акаунт має дозвіл її виконувати. Доступ перевіряється для кожного файла окремо.</p>
 </section>;
}
