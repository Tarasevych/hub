import {lazy,Suspense,useEffect,useMemo,useState} from 'react';
import IntegratieStrook from './integraties/IntegratieStrook'; // UI-013 fase 2: gedeelde verbindingenstrook (vlag integraties-catalogus-v2)
import {api} from './platform/client';
import {Bell,Check,Clock3,FileText,Inbox,ListChecks,Pencil,ShieldCheck,Sparkles,Star,Upload,UserCheck,X} from 'lucide-react';
import MailAccountsHub from './MailAccountsHub';import{mailKoppelenOpenen}from'./platform/VensterHerstel';import{mailAanbieder}from'../shared/mail-aanbieders';
import GoogleMailWorkspace from './GoogleMailWerkruimte';const ContactenWeergave=lazy(()=>import('./afzenders/ContactenWeergave'));const ContactenScanMelding=lazy(()=>import('./afzenders/ContactenScanMelding'));import{emitCanonicalNotice}from'./canoniek-meldingen';

import './mail-functioneel.css';import './mail-ux-beoordeling-20261021.css';import './mailfix-001-accounts.css';

type Lang='uk'|'nl';
type Triage='action'|'waiting'|'info'|'later';
type Energy='low'|'medium'|'high';
type ReplyStyle='short'|'warm'|'formal';
type NotificationLevel='all'|'info'|'waiting'|'action'|'none';
type Citation={id:string;excerpt:string};
type CitedSummary={who:string;what:string;when:number;next:string;confidence:number;sources:Citation[];mode:'deterministic-cited-v1';requiresReview:true};
type MailItem={id:string;source:'manual'|'qa'|'provider';senderName:string;senderEmail:string;subject:string;receivedAt:number;body:string;unread:boolean;triage:Triage;triageSuggested:Triage;triageConfirmed:boolean;noise:boolean;snoozedUntil:number;taskTitle:string;draftStyle:ReplyStyle|'';draftBody:string;sendLaterAt:number;createdAt:number;updatedAt:number;firstOpenedAt:number;firstActionAt:number;notificationEligible:boolean;summary:CitedSummary};
type ResumeState={currentItemId:string;focus:boolean;energy:Energy;updatedAt:number}|null;
type Metrics={firstImportAt:number;firstActionAt:number;focusViews:number;taskConversions:number;snoozes:number;drafts:number;triageChanges:number};
type NotificationPreference={minimum:NotificationLevel;updatedAt:number};
type MailAccount={id:string;provider:'google'|'microsoft';email:string;primary:boolean;identityLinked:boolean;status:'authorization_required'|'connecting'|'initial_sync'|'connected'|'degraded'|'reauth_required'|'revoked'|'disconnected';createdAt:number;updatedAt:number};
type ProviderReadiness={provider:'google_gmail'|'microsoft_graph';oauthConfigured:boolean;encryptionConfigured:boolean;pushConfigured:boolean;pushEndpointVerified:boolean;oauthImplemented:boolean;workersImplemented:boolean;runtimeEnabled:boolean;oauthStartAvailable:boolean;connectEnabled:boolean;syncEnabled:boolean;missing:string[];scopes:string[]};
type SuiteService={id:'mail'|'drive'|'calendar'|'photos';status:'granted'|'configuration_missing'|'consent_required'|'waiting_previous_consent';granted:boolean;connectEnabled:boolean;tokenName:string;scopes:string[];missing:string[];runtimeBinding:string};
type GoogleSuiteStatus={architecture:'primary_google_suite_onboarding_bplus_v1';primaryAccount:{email:string;principalId:string;identityLinked:boolean};services:SuiteService[];nextService:string;tokenPolicy:{canonicalGrantTable:string;clientRef:string;singleRefreshTokenPerPrincipal:boolean;accessTokensPersisted:boolean};runtimeBoundaries:{mailMigration:string}};
type GoogleMailAccount={id:string;principalId:string;email:string;displayName:string;picture:string;accountRole:'primary'|'additional';status:'connected'};type GoogleMailSnapshot={provider:'google_gmail';connectEnabled:boolean;activeAccountId:string;account:GoogleMailAccount|null;accounts:GoogleMailAccount[];runtime:string};
type MailPlatformStatus={architecture:'provider_foundation_v1';runtime:'phase1_manual_only'|'provider_runtime_verified';tokenVault:{algorithm:'AES-256-GCM';keySecret:'server_side_only';configured?:boolean;selfTestPassed:boolean};queue:{table:'mail_jobs_v2';jobTypes:string[];idempotency:string;workersActive:boolean};providers:{google:ProviderReadiness;microsoft:ProviderReadiness};selfTests:Array<{id:string;passed:boolean}>};
type Bootstrap={items:MailItem[];resume:ResumeState;metrics:Metrics;notificationPreference:NotificationPreference;mailAccounts:MailAccount[];accountPolicy:{autoLinkPrimaryMail:boolean;allowAdditionalMailAccounts:boolean;mailboxAuthorization:'required'};provider:{connected:boolean;manualImport:true;analysis:'deterministic-cited-v1';highRiskSend:false;notificationDelivery:'not_connected'};platform:MailPlatformStatus;googleSuite?:GoogleSuiteStatus;googleMail?:GoogleMailSnapshot};
type Props={lang:Lang;tab:string;userId:string;/** Naam uit de sessie (audit 19.10 U-01: niet meer «Власник» voor iedereen). */userName?:string;sourceOrigin:string;tabContext:string;homeSignal:number;sessionReady:boolean;onFocusChange:(value:boolean)=>void};

const emptyMetrics:Metrics={firstImportAt:0,firstActionAt:0,focusViews:0,taskConversions:0,snoozes:0,drafts:0,triageChanges:0};
const triageValues:Triage[]=['action','waiting','info','later'];
const text=(lang:Lang,uk:string,nl:string)=>lang==='uk'?uk:nl;
const triageName=(lang:Lang,value:Triage)=>value==='action'?text(lang,'Дія','Actie'):value==='waiting'?text(lang,'Чекаю','Wachten'):value==='info'?text(lang,'Інфо','Info'):text(lang,'Пізніше','Later');
const notificationName=(lang:Lang,value:NotificationLevel)=>value==='all'?text(lang,'Усі листи','Alle berichten'):value==='info'?text(lang,'Інфо, Чекаю та Дія','Info, Wachten en Actie'):value==='waiting'?text(lang,'Чекаю та Дія','Wachten en Actie'):value==='action'?text(lang,'Лише Дія — рекомендовано','Alleen Actie — aanbevolen'):text(lang,'Не показувати','Niet tonen');
const dateName=(lang:Lang,value:number)=>value?new Date(value).toLocaleString(lang==='uk'?'uk-UA':'nl-BE'):text(lang,'Час не вказано','Tijd niet vermeld');
const tomorrowMorning=()=>{const date=new Date();date.setDate(date.getDate()+1);date.setHours(9,0,0,0);return date.getTime()};
const replyTemplate=(item:MailItem,style:ReplyStyle,lang:Lang)=>{
 const name=item.senderName||item.senderEmail||text(lang,'Вітаю','Hallo');
 if(lang==='nl'){
  if(style==='short')return `Hallo ${name},\n\nBedankt voor uw bericht. Ik kom hier zo snel mogelijk op terug.\n\nMet vriendelijke groet`;
  if(style==='warm')return `Hallo ${name},\n\nDank u dat u dit hebt gestuurd. Ik heb uw bericht goed ontvangen en neem even de tijd om het zorgvuldig te bekijken. Ik kom hier spoedig op terug.\n\nHartelijke groet`;
  return `Geachte ${name},\n\nDank voor uw bericht over “${item.subject||'dit onderwerp'}”. Ik bevestig de goede ontvangst en bezorg u zo spoedig mogelijk een inhoudelijk antwoord.\n\nMet vriendelijke groet`;
 }
 if(style==='short')return `Вітаю, ${name}!\n\nДякую за повідомлення. Я повернуся з відповіддю найближчим часом.\n\nЗ повагою`;
 if(style==='warm')return `Вітаю, ${name}!\n\nДякую, що написали. Я отримав повідомлення й хочу спокійно його опрацювати. Повернуся до вас із відповіддю найближчим часом.\n\nЩиро`;
 return `Шановний/шановна ${name},\n\nДякую за ваше повідомлення щодо «${item.subject||'цього питання'}». Підтверджую його отримання та надам змістовну відповідь найближчим часом.\n\nЗ повагою`;
};

export default function MailFunctionalView({lang,tab,userId,userName,sourceOrigin,tabContext,homeSignal,sessionReady,onFocusChange}:Props){
 const notify=(message:string,kind:'info'|'success'|'warning'|'error'='info')=>emitCanonicalNotice({text:message,kind,source:'mail'});
 const [data,setData]=useState<Bootstrap>({items:[],resume:null,metrics:emptyMetrics,notificationPreference:{minimum:'action',updatedAt:0},mailAccounts:[],accountPolicy:{autoLinkPrimaryMail:true,allowAdditionalMailAccounts:true,mailboxAuthorization:'required'},provider:{connected:false,manualImport:true,analysis:'deterministic-cited-v1',highRiskSend:false,notificationDelivery:'not_connected'},platform:{architecture:'provider_foundation_v1',runtime:'phase1_manual_only',tokenVault:{algorithm:'AES-256-GCM',keySecret:'server_side_only',selfTestPassed:false},queue:{table:'mail_jobs_v2',jobTypes:[],idempotency:'sha256_owner_account_type_fingerprint',workersActive:false},providers:{google:{provider:'google_gmail',oauthConfigured:false,encryptionConfigured:false,pushConfigured:false,pushEndpointVerified:false,oauthImplemented:false,workersImplemented:false,runtimeEnabled:false,oauthStartAvailable:false,connectEnabled:false,syncEnabled:false,missing:['loading'],scopes:[]},microsoft:{provider:'microsoft_graph',oauthConfigured:false,encryptionConfigured:false,pushConfigured:false,pushEndpointVerified:false,oauthImplemented:false,workersImplemented:false,runtimeEnabled:false,oauthStartAvailable:false,connectEnabled:false,syncEnabled:false,missing:['loading'],scopes:[]}},selfTests:[]}});
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [showNoise,setShowNoise]=useState(false);

 const [focus,setFocus]=useState(false);
 const [selectedId,setSelectedId]=useState('');
 const [panel,setPanel]=useState<''|'reply'|'task'|'snooze'>('');
 const [importOpen,setImportOpen]=useState(false);
 const [form,setForm]=useState({senderName:'',senderEmail:'',subject:'',body:''});
 const [draftStyle,setDraftStyle]=useState<ReplyStyle>('short');
 const [draftBody,setDraftBody]=useState('');
 const [sendLater,setSendLater]=useState(false);
 const [taskTitle,setTaskTitle]=useState('');
 const [energy,setEnergy]=useState<Energy>('low');
 const context={service:'mail',tabContext,sourceOrigin};

 const load=async()=>{
  setLoading(true);
  try{
   const response=await api.post('/api/owner/mail/bootstrap',context);
   const next=response.data as Bootstrap;
   setData(next);
   setEnergy(next.resume?.energy||'low');
   if(next.resume?.focus&&next.resume.currentItemId){
    setSelectedId(next.resume.currentItemId);
    setFocus(true);
    onFocusChange(true);
   }
  }catch{
   notify(text(lang,'Не вдалося відкрити поштовий фронт. Дані не втрачено.','De mailwerkruimte kon niet worden geopend. Er zijn geen gegevens verloren.'),'error');
  }finally{setLoading(false)}
 };
 useEffect(()=>{try{const url=new URL(location.href);if(url.searchParams.get('google_suite_callback')==='success'&&url.searchParams.get('google_suite_connected')==='mail'){notify(text(lang,'Gmail підключено. Останній лист — у картці акаунта, без теми.','Gmail is gekoppeld. Het laatste bericht staat op de accountkaart, zonder onderwerp.'),'success');url.searchParams.delete('google_suite_callback');url.searchParams.delete('google_suite_connected');history.replaceState({},'',`${url.pathname}${url.search}${url.hash}`)}}catch{}},[lang]);
 useEffect(()=>{if(sessionReady)void load()},[userId,sessionReady]);useEffect(()=>()=>{onFocusChange(false)},[onFocusChange]);
 useEffect(()=>{onFocusChange(focus)},[focus,onFocusChange]);

 const current=useMemo(()=>data.items.find(item=>item.id===selectedId)||null,[data.items,selectedId]);
 const visible=useMemo(()=>{
  const now=Date.now();
  let items=data.items.filter(item=>showNoise||!item.noise);
  if(tab==='unread')items=items.filter(item=>item.unread&&(!item.snoozedUntil||item.snoozedUntil<=now));
  if(tab==='important')items=items.filter(item=>item.triage==='action');
  if(tab==='drafts')items=items.filter(item=>Boolean(item.draftBody));
  if(tab==='sent')items=items.filter(item=>item.triage==='waiting');
  return items;
 },[data.items,showNoise,tab]);
 const hiddenNoise=data.items.filter(item=>item.noise).length;
 const replaceItem=(item:MailItem)=>setData(value=>({...value,items:value.items.map(entry=>entry.id===item.id?item:entry)}));
 const saveResume=async(patch:Record<string,unknown>)=>{try{const response=await api.post('/api/owner/mail/resume',{...context,...patch});setData(value=>({...value,resume:response.data.resume as ResumeState}))}catch{}};
 const saveItem=async(id:string,patch:Record<string,unknown>)=>{
  setBusy(true);
  try{
   const response=await api.post(`/api/owner/mail/items/${id}/update`,{...context,...patch});
   const item=response.data.item as MailItem;
   replaceItem(item);
   setData(value=>({...value,metrics:(response.data.metrics||value.metrics) as Metrics}));
   return item;
  }catch{
   notify(text(lang,'Не вдалося зберегти зміну. Можна спробувати ще раз.','De wijziging kon niet worden opgeslagen. U kunt het opnieuw proberen.'),'error');
   return null;
  }finally{setBusy(false)}
 };
 const openFocus=async(item:MailItem)=>{
  setSelectedId(item.id);setPanel('');setFocus(true);
  await saveItem(item.id,{markOpened:true});
  void saveResume({currentItemId:item.id,focus:true,energy});
 };
 const closeFocus=()=>{setFocus(false);setPanel('');void saveResume({currentItemId:selectedId,focus:false,energy})};
 const updateTriage=async(value:Triage)=>{if(!current)return;const saved=await saveItem(current.id,{triage:value});if(saved)notify(text(lang,`Лист спокійно переміщено до «${triageName(lang,value)}».`,`Het bericht is rustig verplaatst naar ‘${triageName(lang,value)}’.`),'success')};
 const startReply=()=>{if(!current)return;const style=(current.draftStyle||'short') as ReplyStyle;setDraftStyle(style);setDraftBody(current.draftBody||replyTemplate(current,style,lang));setSendLater(Boolean(current.sendLaterAt)||new Date().getHours()>=18);setPanel('reply')};
 const selectReplyStyle=(style:ReplyStyle)=>{if(!current)return;setDraftStyle(style);setDraftBody(replyTemplate(current,style,lang))};
 const saveDraft=async()=>{if(!current)return;const saved=await saveItem(current.id,{draftStyle,draftBody,sendLaterAt:sendLater?(current.sendLaterAt||tomorrowMorning()):0});if(saved){setPanel('');notify(text(lang,'Чернетку збережено. Надсилання не виконувалося.','Het concept is bewaard. Er is niets verzonden.'),'success')}};
 const startTask=()=>{if(!current)return;setTaskTitle(current.taskTitle||text(lang,`Відповісти: ${current.subject||'лист'}`,`Antwoorden: ${current.subject||'bericht'}`));setPanel('task')};
 const saveTask=async()=>{if(!current)return;const saved=await saveItem(current.id,{taskTitle});if(saved){setPanel('');notify(text(lang,'Найближчий крок збережено як задачу.','De volgende stap is als taak bewaard.'),'success')}};
 const snooze=async(until:number)=>{if(!current)return;const saved=await saveItem(current.id,{snoozedUntil:until,triage:'later'});if(saved){closeFocus();notify(text(lang,'Лист відкладено без провини.','Het bericht is zonder schuldgevoel uitgesteld.'),'success')}};
 const importMail=async()=>{
  if(!form.body.trim())return;
  setBusy(true);
  try{
   const response=await api.post('/api/owner/mail/import',{...context,...form,receivedAt:Date.now()});
   const item=response.data.item as MailItem;
   setData(value=>({...value,items:[item,...value.items],metrics:(response.data.metrics||value.metrics) as Metrics}));
   setForm({senderName:'',senderEmail:'',subject:'',body:''});setImportOpen(false);
   notify(text(lang,'Один лист додано. Почати можна з найменшого кроку.','Eén bericht is toegevoegd. U kunt met de kleinste stap beginnen.'),'success');
  }catch{notify(text(lang,'Лист не вдалося додати.','Het bericht kon niet worden toegevoegd.'),'error')}finally{setBusy(false)}
 };
 // 20.10.2026 (opdracht van de eigenaar): elke tegel opent nu een ECHT venster uit de gezamenlijke laag — te minimaliseren,
 // en het blijft in het dok staan als de mens naar hub of cloud gaat (src/platform/VensterHerstel.tsx + migratie 0089).
 // Wat er IN dat venster gebeurt, bepaalt shared/mail-aanbieders.ts: Google-OAuth, Microsoft-OAuth, IMAP met app-wachtwoord,
 // of — zonder knop — de lijst van wat nog ontbreekt. Geen melding «ще не підтримується» meer waar een knop stond.
 const connectProvider=(provider:string)=>{const dienstNaam=mailAanbieder(provider)?.naam||provider;mailKoppelenOpenen(provider,`${text(lang,'Підключення','Koppelen')}: ${dienstNaam}`,'mail')};
 /* 21.10.2026: de aparte Microsoft-sectie voor extra accounts (select + e-mailveld + «Додати акаунт») was een dubbel van de tegel Outlook en is weg. De
    Microsoft-stromen (startMicrosoftConnection, disconnectMicrosoftAccount) staan nu in src/MailAccountsHub.tsx, bij «Підключені акаунти»,
    met dezelfde routes (accounts/:id/connect/start, accounts/:id/disconnect) — en het koppelen zelf in het venster van de tegel Outlook. */
 
 const saveNotificationLevel=async(value:NotificationLevel)=>{setBusy(true);try{const response=await api.post('/api/owner/mail/notification-preferences/save',{...context,minimum:value});setData(current=>({...current,notificationPreference:response.data.notificationPreference as NotificationPreference,items:current.items.map(item=>({...item,notificationEligible:Boolean((response.data.eligibility||{})[item.id])}))}));notify(text(lang,'Поріг важливості збережено. Зовнішній канал сповіщень ще не підключений.','De belangrijkheidsdrempel is bewaard. Een extern meldingskanaal is nog niet gekoppeld.'),'warning')}catch{notify(text(lang,'Не вдалося зберегти поріг сповіщень.','De meldingsdrempel kon niet worden bewaard.'),'error')}finally{setBusy(false)}};
 const changeEnergy=(value:Energy)=>{setEnergy(value);void saveResume({currentItemId:selectedId,focus,energy:value})};
 const openClassicMail=()=>{try{const url=new URL(location.href);url.pathname='/inbox';url.search='';url.hash='';history.pushState({},'',`${url.pathname}${url.search}${url.hash}`);window.dispatchEvent(new PopStateEvent('popstate'))}catch{}};

 const onboarding=(
  <section className='mail-onboarding' data-compassionate-onboarding='three-steps'>
   <div className='mail-kicker'><Sparkles/>Inbox Functional</div>
   <h1>{text(lang,'Почнімо з одного листа','Laten we met één bericht beginnen')}</h1>
   <p>{text(lang,'Не потрібно очищати всю пошту. Достатньо створити керований фронт роботи.','U hoeft niet uw hele mailbox leeg te maken. Eén beheersbare werkstroom is genoeg.')}</p>
   <ol>
    <li><Upload/><span><b>{text(lang,'Додайте один реальний лист','Voeg één echt bericht toe')}</b><small>{text(lang,'Текст зберігається у вашому приватному просторі.','De tekst wordt in uw privéruimte bewaard.')}</small></span></li>
    <li><Star/><span><b>{text(lang,'Оберіть рівень енергії','Kies uw energieniveau')}</b><small>{text(lang,'Інтерфейс не вимагатиме більше, ніж зараз посильно.','De interface vraagt niet meer dan nu haalbaar is.')}</small></span></li>
    <li><ListChecks/><span><b>{text(lang,'Побачте лише наступний крок','Zie alleen de volgende stap')}</b><small>{text(lang,'Без червоних лічильників і мови провини.','Zonder rode tellers of schuldtaal.')}</small></span></li>
   </ol>
   <div className='mail-onboarding-actions'>
    <button className='mail-primary' onClick={()=>setImportOpen(true)}><Upload/>{text(lang,'Додати один лист','Eén bericht toevoegen')}</button>
    <button type='button' onClick={openClassicMail}><Inbox/>{text(lang,'Повернутися до звичайної пошти','Terug naar gewone e-mail')}</button>
    
   </div>
  </section>
 );

 const accountView=(
  <section className='mail-provider-view' data-mail-provider-foundation='v1'>
   <div className='mail-kicker'><ShieldCheck/>{text(lang,'Підключення','Koppelingen')}</div>
   <div className='mail-account-intro'><h1>{text(lang,'Поштові акаунти','E-mailaccounts')}</h1><p>{text(lang,'Керуйте основною поштою та додатковими адресами в одному місці.','Beheer uw primaire mailbox en extra adressen op één plek.')}</p></div><div className='mail-account-manager' data-mail-account-manager='canonical-v1'><MailAccountsHub lang={lang} userName={userName||''} onConnect={connectProvider} accounts={(data.googleMail?.accounts||[]).map(a=>({id:a.id,email:a.email,provider:'Google',status:a.status,accountRole:a.accountRole}))} tabContext={tabContext} sourceOrigin={sourceOrigin} onVeranderd={()=>void load()} />
   
   </div>
   <div className='mail-provider-card available'><Upload/><div><b>{text(lang,'Приватний ручний імпорт','Privé handmatige import')}</b><p>{text(lang,'Focus, triage, цитоване резюме й тихе збереження контексту вже працюють для реального тексту.','Focus, triage, samenvatting met citaten en stille contextopslag werken al voor echte tekst.')}</p></div><button onClick={()=>setImportOpen(true)}>{text(lang,'Додати лист','Bericht toevoegen')}</button></div>
   <div className='mail-notification-card' data-mail-notification-threshold={data.notificationPreference.minimum}><Bell/><div><b>{text(lang,'Сповіщення для цієї пошти','Meldingen voor deze mailbox')}</b><p>{text(lang,'Виберіть рівень важливості, починаючи з якого потрібно показувати сповіщення для цієї Email.','Kies het belangrijkheidsniveau vanaf wanneer meldingen voor deze mailbox moeten worden getoond.')}</p><label>{text(lang,'Мінімальний рівень','Minimum niveau')}<select value={data.notificationPreference.minimum} disabled={busy} onChange={event=>void saveNotificationLevel(event.target.value as NotificationLevel)}>{(['all','info','waiting','action','none'] as NotificationLevel[]).map(value=><option key={value} value={value}>{notificationName(lang,value)}</option>)}</select></label><small><ShieldCheck/>{text(lang,'Налаштування вже збережено. Сповіщення почнуть надходити після підключення пошти.','De instelling is opgeslagen. Meldingen beginnen zodra de mailbox is gekoppeld.')}</small></div></div>
  </section>
 );

 const listView=(
  <section className='mail-front' data-inbox-functional='true'>
   <header className='mail-front-header'><div><div className='mail-kicker'><Inbox/>Inbox Functional</div><h1>{text(lang,'Керований фронт пошти','Beheersbare mailwerkstroom')}</h1><p>{text(lang,'Не все одразу — лише те, що зараз посильно.','Niet alles tegelijk — alleen wat nu haalbaar is.')}</p></div><div className='mail-onboarding-actions'><button type='button' onClick={openClassicMail}><Inbox/>{text(lang,'Звичайна пошта','Gewone e-mail')}</button><button className='mail-add' onClick={()=>setImportOpen(true)}><Upload/>{text(lang,'Додати лист','Bericht toevoegen')}</button></div></header>

   <div className='mail-control-row'><label>{text(lang,'Зараз у мене','Mijn energie nu')}<select value={energy} onChange={event=>changeEnergy(event.target.value as Energy)}><option value='low'>{text(lang,'Мало сил','Weinig energie')}</option><option value='medium'>{text(lang,'Середньо','Gemiddeld')}</option><option value='high'>{text(lang,'Є ресурс','Voldoende energie')}</option></select></label>{hiddenNoise>0&&<button className='mail-noise-toggle' onClick={()=>setShowNoise(value=>!value)}><Clock3/>{showNoise?text(lang,'Знову сховати шум','Ruis weer verbergen'):text(lang,`Показати шум (${hiddenNoise})`,`Ruis tonen (${hiddenNoise})`)}</button>}</div>
   {visible.length>0?<div className='mail-list'>{visible.map((item,index)=><article key={item.id} className={`mail-row triage-${item.triage}${item.unread?' unread':''}`} data-notification-eligible={item.notificationEligible?'true':'false'}><button className='mail-row-main' onClick={()=>void openFocus(item)}><span className='mail-row-index'>{String(index+1).padStart(2,'0')}</span><span><small>{item.senderName||item.senderEmail||text(lang,'Невідомий відправник','Onbekende afzender')}</small><b>{item.subject||text(lang,'Без теми','Geen onderwerp')}</b><em>{item.summary.what}</em></span></button><div className='mail-row-meta'><span data-mail-triage={item.triage}><Star/>{triageName(lang,item.triage)}{!item.triageConfirmed&&<small>{text(lang,'пропозиція','suggestie')}</small>}</span><time>{dateName(lang,item.receivedAt)}</time></div></article>)}</div>:<div className='mail-soft-empty'><Check/><h2>{text(lang,'На зараз достатньо','Voor nu is dit genoeg')}</h2><p>{text(lang,'У цій черзі немає листів, які потребують вашої уваги.','In deze rij staan geen berichten die uw aandacht vragen.')}</p><button onClick={()=>setImportOpen(true)}>{text(lang,'Додати один лист','Eén bericht toevoegen')}</button></div>}
   <details className='mail-metrics'><summary>{text(lang,'Мій спокійний прогрес','Mijn rustige voortgang')}</summary><div><span>{text(lang,'Focus відкрито','Focus geopend')}<b>{data.metrics.focusViews}</b></span><span>{text(lang,'Створено задач','Taken gemaakt')}<b>{data.metrics.taskConversions}</b></span><span>{text(lang,'Збережено чернеток','Concepten bewaard')}<b>{data.metrics.drafts}</b></span><span>{text(lang,'Відкладено','Uitgesteld')}<b>{data.metrics.snoozes}</b></span></div></details>
  </section>
 );

 const replyPanel=current&&panel==='reply'?(
  <section className='mail-action-panel' data-high-risk-send='disabled'>
   <header><h2>{text(lang,'Чернетка без тиску','Concept zonder druk')}</h2><button onClick={()=>setPanel('')}><X/></button></header>
   <div className='mail-reply-styles'>{(['short','warm','formal'] as ReplyStyle[]).map(style=><button key={style} aria-pressed={draftStyle===style} onClick={()=>selectReplyStyle(style)}>{style==='short'?text(lang,'Одним реченням','Eén zin'):style==='warm'?text(lang,'Тепло','Warm'):text(lang,'Формально','Formeel')}</button>)}</div>
   <textarea data-concept='mail-antwoord' value={draftBody} onChange={event=>setDraftBody(event.target.value)} rows={8}/>
   <label className='mail-send-later'><input type='checkbox' checked={sendLater} onChange={event=>setSendLater(event.target.checked)}/><span>{text(lang,'Повернутися до чернетки завтра о 09:00','Morgen om 09:00 naar dit concept terugkeren')}</span></label>
   <p className='mail-risk-boundary'><ShieldCheck/>{text(lang,'Фактичне надсилання вимкнене до підключення поштового провайдера.','Werkelijk verzenden is uitgeschakeld tot een mailprovider is gekoppeld.')}</p>
   <button className='mail-primary' disabled={busy||!draftBody.trim()} onClick={()=>void saveDraft()}><Check/>{text(lang,'Зберегти чернетку','Concept bewaren')}</button>
  </section>
 ):null;
 const taskPanel=current&&panel==='task'?(
  <section className='mail-action-panel'><header><h2>{text(lang,'Один наступний крок','Eén volgende stap')}</h2><button onClick={()=>setPanel('')}><X/></button></header><label>{text(lang,'Назва задачі','Taaknaam')}<input value={taskTitle} onChange={event=>setTaskTitle(event.target.value)} maxLength={500}/></label><button className='mail-primary' disabled={!taskTitle.trim()||busy} onClick={()=>void saveTask()}><ListChecks/>{text(lang,'Зберегти задачу','Taak bewaren')}</button></section>
 ):null;
 const snoozePanel=current&&panel==='snooze'?(
  <section className='mail-action-panel'><header><h2>{text(lang,'Відкласти без провини','Zonder schuldgevoel uitstellen')}</h2><button onClick={()=>setPanel('')}><X/></button></header><div className='mail-snooze-options'><button onClick={()=>void snooze(tomorrowMorning())}>{text(lang,'Завтра о 09:00','Morgen om 09:00')}</button><button onClick={()=>void snooze(Date.now()+3*24*60*60*1000)}>{text(lang,'Через 3 дні','Over 3 dagen')}</button><button onClick={()=>void snooze(Date.now()+7*24*60*60*1000)}>{text(lang,'Через тиждень','Over een week')}</button></div></section>
 ):null;
 const focusView=current?(
  <section className='mail-focus' data-focus-view='true'>
   <header className='mail-focus-header'><button onClick={closeFocus}>{text(lang,'Повернутися до черги','Terug naar de rij')}</button><span>{text(lang,'Один лист. Один наступний крок.','Eén bericht. Eén volgende stap.')}</span></header>
   <article className='mail-focus-card'>
    <div className='mail-message-head'><div><small>{current.senderName||current.senderEmail}</small><h1>{current.subject||text(lang,'Без теми','Geen onderwerp')}</h1><time>{dateName(lang,current.receivedAt)}</time></div><span className={`mail-triage-pill triage-${current.triage}`}>{triageName(lang,current.triage)}</span></div>
    <section className='mail-cited-summary' data-cited-summary='true'><header><div><Sparkles/><b>{text(lang,'Резюме з цитатами','Samenvatting met citaten')}</b></div><span><ShieldCheck/>{text(lang,'локальний розбір • перевірте','lokale analyse • controleer')}</span></header><dl><div><dt>{text(lang,'Хто','Wie')}</dt><dd>{current.summary.who}</dd></div><div><dt>{text(lang,'Що','Wat')}</dt><dd>{current.summary.what}</dd></div><div><dt>{text(lang,'Коли','Wanneer')}</dt><dd>{dateName(lang,current.summary.when)}</dd></div><div><dt>{text(lang,'Наступний крок','Volgende stap')}</dt><dd>{current.summary.next||text(lang,'Дію ще треба підтвердити.','De actie moet nog worden bevestigd.')}</dd></div></dl><div className='mail-trust-layer'><FileText/><span>{text(lang,`Впевненість ${Math.round(current.summary.confidence*100)}%. Це не заміна читання джерела.`,`Zekerheid ${Math.round(current.summary.confidence*100)}%. Dit vervangt de bron niet.`)}</span></div><ol>{current.summary.sources.map(source=><li key={source.id}><a href={`#citation-${source.id}`}>[{source.id}]</a><span id={`citation-${source.id}`}>{source.excerpt}</span></li>)}</ol></section>
    <fieldset className='mail-triage-control'><legend>{text(lang,'Куди покласти цей лист?','Waar hoort dit bericht?')}</legend>{triageValues.map(value=><button type='button' key={value} data-mail-triage={value} aria-pressed={current.triage===value} onClick={()=>void updateTriage(value)}>{triageName(lang,value)}</button>)}</fieldset>
    <div className='mail-primary-actions' data-primary-actions='3'><button className='mail-primary' onClick={startReply}><Pencil/>{text(lang,'Відповісти','Antwoorden')}</button><button onClick={startTask}><ListChecks/>{text(lang,'Перетворити на задачу','Omzetten in taak')}</button><button onClick={()=>setPanel('snooze')}><Clock3/>{text(lang,'Відкласти','Uitstellen')}</button></div>
    {replyPanel}{taskPanel}{snoozePanel}
    <details className='mail-original'><summary>{text(lang,'Показати оригінал листа','Origineel bericht tonen')}</summary><pre>{current.body}</pre></details>
    <button className='mail-enough' onClick={closeFocus}><UserCheck/>{text(lang,'На зараз достатньо','Voor nu is dit genoeg')}</button>
   </article>
  </section>
 ):null;

 let body;
 const standardMailSurface=tab!=='accounts'&&tab!=='local'&&tab!=='contacts';
 if(tab==='accounts')body=<><IntegratieStrook dienst='mail'/>{accountView}</>;
 else if(tab==='contacts')body=<Suspense fallback={null}><ContactenWeergave lang={lang}/></Suspense>;
 else if(standardMailSurface)body=<GoogleMailWorkspace lang={lang} tab={tab} sourceOrigin={sourceOrigin} tabContext={tabContext} ownerUserId={userId} homeSignal={homeSignal} initialSnapshot={data.googleMail||null} bootstrapPending={loading}/>;
 else if(loading)body=null;
 else if(data.items.length===0)body=onboarding;
 else if(focus)body=focusView;
 else body=listView;

 return <div className={`mail-functional${focus?' is-focus':''}${loading?' mail-initial-loading':''}${standardMailSurface?' google-workspace-active':''}`} data-mail-phase='1'>


  {body}
  {/* «Контакти й відправники»: start de volledige controle automatisch één keer en toont de voortgang (Пауза / Зупинити). */}
  <Suspense fallback={null}>{sessionReady&&<ContactenScanMelding lang={lang} actief={tab!=='contacts'}/>}</Suspense>

  {importOpen&&<div className='mail-dialog-backdrop' role='presentation'><section className='mail-import-dialog' role='dialog' aria-modal='true' aria-labelledby='mail-import-title'><header><div><small>{text(lang,'Приватний ручний імпорт','Privé handmatige import')}</small><h2 id='mail-import-title'>{text(lang,'Додати один лист','Eén bericht toevoegen')}</h2></div><button onClick={()=>setImportOpen(false)}><X/></button></header><label>{text(lang,'Ім’я відправника','Naam afzender')}<input value={form.senderName} onChange={event=>setForm(value=>({...value,senderName:event.target.value}))} maxLength={200}/></label><label>{text(lang,'Email відправника','E-mail afzender')}<input type='email' value={form.senderEmail} onChange={event=>setForm(value=>({...value,senderEmail:event.target.value}))} maxLength={320}/></label><label>{text(lang,'Тема','Onderwerp')}<input value={form.subject} onChange={event=>setForm(value=>({...value,subject:event.target.value}))} maxLength={500}/></label><label>{text(lang,'Текст листа','Tekst van het bericht')}<textarea value={form.body} onChange={event=>setForm(value=>({...value,body:event.target.value}))} rows={12} maxLength={80000} required/></label><p><ShieldCheck/>{text(lang,'Текст зберігається як plain text у вашому приватному акаунті. Він не надсилається зовнішній AI-моделі.','De tekst wordt als platte tekst in uw privéaccount bewaard en niet naar een extern AI-model gestuurd.')}</p><button className='mail-primary' disabled={busy||!form.body.trim()} onClick={()=>void importMail()}><Upload/>{text(lang,'Зберегти й розібрати','Bewaren en analyseren')}</button></section></div>}
 </div>;
}
