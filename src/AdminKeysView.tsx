import {useEffect,useMemo,useState} from 'react';
import {api} from '@appdeploy/client';
import {Eye,EyeOff,KeyRound,LockKeyhole,Plus,RefreshCw,ShieldCheck,Trash2,TriangleAlert,X} from 'lucide-react';

type Lang='uk'|'nl';
type KeyCard={
  id:string;
  name:string;
  group:'google'|'platform'|'vault';
  aliases?:string[];
  configured:boolean;
  working?:boolean;
  source:string;
  masked:string;
  revealable:boolean;
  editable:boolean;
  deletable:boolean;
  locked:boolean;
  noteUk?:string;
  noteNl?:string;
  purpose?:string;
};
type ContourPublic={
  clientId:string;
  redirectUri:string;
  connectEnabled:boolean;
  credentialsConfigured:boolean;
  encryptionConfigured:boolean;
  redirectConfigured:boolean;
  source:string;
  missing:string[];
  hasVaultOverride:boolean;
  hasPlatformSecret:boolean;
};
type Props={lang:Lang;sourceOrigin:string;tabContext:string;technical:boolean};

const tr=(lang:Lang,uk:string,nl:string)=>lang==='uk'?uk:nl;
const apiError=(caught:unknown)=>{
  const value=caught as{response?:{data?:{error?:unknown;reasonCode?:unknown}};message?:unknown};
  const code=String(value?.response?.data?.error||value?.response?.data?.reasonCode||'');
  return code||String(value?.message||'');
};

export default function AdminKeysView({lang,sourceOrigin,tabContext}:Props){
  const context=useMemo(()=>({service:'admin',tabContext,sourceOrigin}),[tabContext,sourceOrigin]);
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState('');
  const[notice,setNotice]=useState('');
  const[contour,setContour]=useState<ContourPublic|null>(null);
  const[keys,setKeys]=useState<KeyCard[]>([]);
  const[vaultReady,setVaultReady]=useState(true);
  const[reveal,setReveal]=useState<{id:string;name:string;value:string}|null>(null);
  const[editor,setEditor]=useState<{id:string;name:string;kind:'google-id'|'google-secret'|'vault';value:string}|null>(null);
  const[adder,setAdder]=useState({name:'',purpose:'other',value:''});

  const load=async()=>{
    setLoading(true);
    try{
      const[contourResponse,vaultResponse]=await Promise.all([
        api.post('/api/owner/google-contour',context),
        api.post('/api/owner/api-platform/vault',context).catch(()=>null)
      ]);
      const contourData=(contourResponse.data||{}) as {contour?:ContourPublic;keys?:KeyCard[]};
      setContour(contourData.contour||null);
      const contourKeys=Array.isArray(contourData.keys)?contourData.keys:[];
      const vaultData=(vaultResponse?.data||{}) as {items?:Array<Record<string,unknown>>;encryptionReady?:boolean};
      setVaultReady(vaultData.encryptionReady!==false);
      const vaultKeys=(Array.isArray(vaultData.items)?vaultData.items:[]).map(item=>({
        id:String(item.id||''),
        name:String(item.name||''),
        group:'vault' as const,
        configured:true,
        working:true,
        source:'vault',
        masked:String(item.masked||'\u2022'.repeat(12)),
        revealable:true,
        editable:true,
        deletable:true,
        locked:false,
        purpose:String(item.purpose||'other'),
        noteUk:'Користувацький секрет у зашифрованому owner vault.',
        noteNl:'Aangepast geheim in de versleutelde owner-kluis.'
      }));
      setKeys([...contourKeys, ...vaultKeys]);
      setNotice('');
    }catch(caught){
      setNotice(tr(lang,'Не вдалося завантажити ключі: ','Sleutels laden mislukt: ')+(apiError(caught)||tr(lang,'немає доступу.','geen toegang.')));
    }
    setLoading(false);
  };

  useEffect(()=>{void load();},[lang,sourceOrigin,tabContext]);

  const googleKeys=keys.filter(item=>item.group==='google');
  const platformKeys=keys.filter(item=>item.group==='platform');
  const vaultKeys=keys.filter(item=>item.group==='vault');
  const missing=keys.filter(item=>!item.configured&&item.group!=='platform');
  const healthy=Boolean(contour?.connectEnabled)&&missing.length===0;

  const confirmReveal=()=>window.confirm(tr(lang,'Показати значення ключа? Воно залишиться видимим, доки ви не натиснете «Сховати» або не покинете сторінку. Дія записується в журнал без самого значення.','De sleutelwaarde tonen? Deze blijft zichtbaar totdat u op «Verbergen» klikt of de pagina verlaat. Dit wordt gelogd zonder de waarde zelf.'));
  const confirmWrite=()=>window.confirm(tr(lang,'Підтвердити зміні зашифрованого ключа?','Wijziging van de versleutelde sleutel bevestigen?'));
  const confirmDelete=()=>window.confirm(tr(lang,'Видалити цей ключ? Останній Google-секрет захищено.','Deze sleutel verwijderen? Het laatste Google-geheim is beschermd.'));

  const openReveal=async(item:KeyCard)=>{
    if(!item.revealable||busy)return;
    if(reveal?.id===item.id){setReveal(null);return;}
    if(!confirmReveal())return;
    setBusy('reveal');
    try{
      const route=item.group==='vault'
        ?`/api/owner/api-platform/vault/${item.id}/reveal`
        :'/api/owner/google-contour/reveal';
      const response=await api.post(route,{...context,name:item.name,id:item.id,confirm:'REVEAL_SECRET'});
      const value=String(response.data?.revealedValue||'');
      if(!value)throw new Error('empty');
      setReveal({id:item.id,name:String(response.data?.name||item.name),value});
    }catch(caught){
      setNotice(tr(lang,'Не вдалося показати ключ: ','Sleutel tonen mislukt: ')+(apiError(caught)||tr(lang,'відмовлено.','geweigerd.')));
    }
    setBusy('');
  };

  const saveEditor=async()=>{
    if(!editor||busy)return;
    if(!confirmWrite())return;
    setBusy('save');
    try{
      if(editor.kind==='vault'){
        await api.post('/api/owner/api-platform/vault/save',{...context,id:editor.id,name:editor.name,value:editor.value,purpose:'other'});
      }else{
        await api.post('/api/owner/google-contour/save',{
          ...context,
          clientId:editor.kind==='google-id'?editor.value:undefined,
          clientSecret:editor.kind==='google-secret'?editor.value:undefined
        });
      }
      setEditor(null);
      setReveal(null);
      await load();
      setNotice(tr(lang,'Ключ збережено зашифровано. Значення знову сховано.','Sleutel versleuteld opgeslagen. De waarde is opnieuw verborgen.'));
    }catch(caught){
      setNotice(tr(lang,'Не вдалося зберегти ключ: ','Sleutel opslaan mislukt: ')+(apiError(caught)||tr(lang,'перевірте значення.','controleer de waarde.')));
    }
    setBusy('');
  };

  const removeKey=async(item:KeyCard)=>{
    if(!item.deletable||busy)return;
    if(!confirmDelete())return;
    setBusy('delete');
    try{
      if(item.group==='vault')await api.post(`/api/owner/api-platform/vault/${item.id}/delete`,context);
      else await api.post('/api/owner/google-contour/delete',context);
      setReveal(null);
      await load();
      setNotice(tr(lang,'Ключ видалено.','Sleutel verwijderd.'));
    }catch(caught){
      setNotice(tr(lang,'Не вдалося видалити ключ: ','Sleutel verwijderen mislukt: ')+(apiError(caught)||tr(lang,'захищено.','beschermd.')));
    }
    setBusy('');
  };

  const addVaultKey=async()=>{
    if(busy)return;
    if(!adder.name.trim()||!adder.value.trim()){
      setNotice(tr(lang,'Щоб додати ключ, потрібні назва і значення.','Om een sleutel toe te voegen zijn naam en waarde vereist.'));
      return;
    }
    if(!confirmWrite())return;
    setBusy('add');
    try{
      await api.post('/api/owner/api-platform/vault/save',{...context,name:adder.name.trim(),purpose:adder.purpose,usedBy:adder.purpose,value:adder.value});
      setAdder({name:'',purpose:'other',value:''});
      await load();
      setNotice(tr(lang,'Новий ключ додано й зашифровано.','Nieuwe sleutel toegevoegd en versleuteld.'));
    }catch(caught){
      setNotice(tr(lang,'Не вдалося додати ключ: ','Sleutel toevoegen mislukt: ')+(apiError(caught)||tr(lang,'перевірте назву.','controleer de naam.')));
    }
    setBusy('');
  };

  const startEdit=(item:KeyCard)=>{
    if(!item.editable)return;
    if(item.group==='vault')setEditor({id:item.id,name:item.name,kind:'vault',value:''});
    else if(item.id==='google-client-id'||item.name==='GOOGLE_SUITE_CLIENT_ID')setEditor({id:item.id,name:item.name,kind:'google-id',value:contour?.clientId||''});
    else setEditor({id:item.id,name:item.name,kind:'google-secret',value:''});
  };

  const statusLabel=(item:KeyCard)=>{
    if(!item.configured)return tr(lang,'не налаштовано','niet ingesteld');
    if(item.working===false)return tr(lang,'є, але не працює','aanwezig, werkt niet');
    return tr(lang,'налаштовано','ingesteld');
  };

  const renderCard=(item:KeyCard)=>{
    const isRevealed=reveal?.id===item.id;
    return (
    <article key={item.id||item.name} className='admin-key-card' data-admin-key-name={item.name} data-admin-key-configured={item.configured?'true':'false'}>
      <KeyRound aria-hidden='true'/>
      <div>
        <strong>{item.name}</strong>
        <span>{statusLabel(item)} · {item.source}</span>
        {item.aliases?.length?<small>{item.aliases.join(' · ')}</small>:null}
        <code className={`admin-key-mask${isRevealed?' is-revealed':''}`}>{isRevealed?reveal!.value:(item.masked||'—')}</code>
        <small>{lang==='uk'?item.noteUk:item.noteNl}</small>
      </div>
      <div className='admin-key-actions'>
        {item.revealable?<button type='button' data-admin-key-reveal={item.name} disabled={Boolean(busy)||(!item.configured&&!isRevealed)} onClick={()=>void openReveal(item)}>{isRevealed?<EyeOff/>:<Eye/>}{isRevealed?tr(lang,'Сховати','Verbergen'):tr(lang,'Показати','Tonen')}</button>:null}
        {isRevealed?<button type='button' onClick={()=>{void navigator.clipboard?.writeText(reveal!.value).catch(()=>undefined);}}>{tr(lang,'Копіювати','Kopiëren')}</button>:null}
        {item.editable?<button type='button' data-admin-key-edit={item.name} disabled={Boolean(busy)} onClick={()=>startEdit(item)}>{tr(lang,'Замінити','Vervangen')}</button>:null}
        {item.deletable?<button type='button' data-admin-key-delete={item.name} disabled={Boolean(busy)} onClick={()=>void removeKey(item)}><Trash2/>{tr(lang,'Видалити','Verwijderen')}</button>:null}
        {item.locked?<b><LockKeyhole/>{tr(lang,'Захищений','Beschermd')}</b>:null}
      </div>
    </article>
    );
  };

  if(loading){
    return <section className='admin-section' data-admin-keys='loading' aria-busy='true'><RefreshCw className='spin'/><p>{tr(lang,'Завантажуємо ключі контуру…','Contour-sleutels worden geladen…')}</p></section>;
  }

  return (
    <section className='admin-section admin-keys' data-admin-keys='ready'>
      <header>
        <ShieldCheck/>
        <div>
          <h2>{tr(lang,'Ключі Google-контуру','Google-contour-sleutels')}</h2>
          <p>{tr(lang,'Усі ключі зберігаються зашифровано. Значення видно лише після кнопки «Показати» у вікні на 12 секунд.','Alle sleutels worden versleuteld bewaard. De waarde is alleen zichtbaar na «Tonen» in een venster van 12 seconden.')}</p>
        </div>
        <button type='button' onClick={()=>void load()} disabled={Boolean(busy)}><RefreshCw/>{tr(lang,'Оновити','Vernieuwen')}</button>
      </header>

      <div className={`admin-key-health ${healthy?'is-ready':'is-warn'}`} data-admin-login-health={healthy?'ready':'blocked'}>
        {healthy?<ShieldCheck/>:<TriangleAlert/>}
        <div>
          <strong>{healthy?tr(lang,'Google-вхід готовий','Google-aanmelding is klaar'):tr(lang,'Google-вхід ще не готовий','Google-aanmelding is nog niet klaar')}</strong>
          <p>{tr(lang,`Секрет: ${contour?.credentialsConfigured?'є':'немає'} · шифрування: ${contour?.encryptionConfigured?'є':'немає'} · redirect: ${contour?.redirectUri||'—'} · джерело: ${contour?.source||'missing'}.`,`Geheim: ${contour?.credentialsConfigured?'aanwezig':'ontbreekt'} · encryptie: ${contour?.encryptionConfigured?'aanwezig':'ontbreekt'} · redirect: ${contour?.redirectUri||'—'} · bron: ${contour?.source||'missing'}.`)}</p>
          {!vaultReady?<small>{tr(lang,'Vault-шифрування недоступне — нові користувацькі ключі зараз не збережуться.','Kluisversleuteling is niet beschikbaar — nieuwe aangepaste sleutels kunnen nu niet worden opgeslagen.')}</small>:null}
        </div>
      </div>

      {notice?<p className='admin-notice' role='status'>{notice}</p>:null}

      <h3>{tr(lang,'Google identity / Suite','Google-identiteit / Suite')}</h3>
      <div className='admin-cards'>{googleKeys.map(renderCard)}</div>

      {platformKeys.length?<><h3>{tr(lang,'Інші платформні секрети','Andere platformgeheimen')}</h3><div className='admin-cards'>{platformKeys.map(renderCard)}</div></>:null}

      <h3>{tr(lang,'Користувацькі ключі (vault)','Aangepaste sleutels (kluis)')}</h3>
      {vaultKeys.length?<div className='admin-cards'>{vaultKeys.map(renderCard)}</div>:<p className='admin-honest-state'>{tr(lang,'Ще немає користувацьких ключів. Додайте нижче.','Er zijn nog geen aangepaste sleutels. Voeg er hieronder een toe.')}</p>}

      <form className='admin-key-add' data-admin-key-add='true' onSubmit={event=>{event.preventDefault();void addVaultKey();}}>
        <h3><Plus/>{tr(lang,'Додати ключ','Sleutel toevoegen')}</h3>
        <label>{tr(lang,'Назва','Naam')}<input value={adder.name} onChange={event=>setAdder(current=>({...current,name:event.target.value}))} autoComplete='off' placeholder='HOME_ASSISTANT_TOKEN'/></label>
        <label>{tr(lang,'Призначення','Doel')}<select value={adder.purpose} onChange={event=>setAdder(current=>({...current,purpose:event.target.value}))}><option value='other'>{tr(lang,'Інше','Overig')}</option><option value='home-assistant'>Home Assistant</option><option value='telegram'>Telegram</option><option value='github'>GitHub</option><option value='webhook'>Webhook</option></select></label>
        <label>{tr(lang,'Значення','Waarde')}<input type='password' value={adder.value} onChange={event=>setAdder(current=>({...current,value:event.target.value}))} autoComplete='new-password'/></label>
        <button type='submit' disabled={Boolean(busy)||!vaultReady}>{tr(lang,'Зберегти зашифровано','Versleuteld opslaan')}</button>
      </form>

      {editor?<div className='admin-key-dialog' role='dialog' aria-modal='true' data-admin-key-editor={editor.name}>
        <article>
          <header><h3>{tr(lang,'Замінити ключ','Sleutel vervangen')}</h3><button type='button' onClick={()=>setEditor(null)} aria-label={tr(lang,'Закрити','Sluiten')}><X/></button></header>
          <p><code>{editor.name}</code></p>
          <label>{tr(lang,'Нове значення','Nieuwe waarde')}<textarea value={editor.value} onChange={event=>setEditor(current=>current?{...current,value:event.target.value}:current)} rows={4}/></label>
          <div className='admin-key-actions'>
            <button type='button' onClick={()=>void saveEditor()} disabled={Boolean(busy)||!editor.value.trim()}>{tr(lang,'Оновити','Bijwerken')}</button>
            <button type='button' onClick={()=>setEditor(null)}>{tr(lang,'Скасувати','Annuleren')}</button>
          </div>
        </article>
      </div>:null}

    </section>
  );
}
