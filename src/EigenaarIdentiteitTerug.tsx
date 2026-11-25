import {useEffect,useRef,useState} from 'react';
import {markeerGoogleTerugkeer} from './platform/google-terugkeer';
import {api} from './platform/client';
import {bewaarStapOpFout} from './platform/stap-op';
import {rememberViewAccountEverywhere} from './domein-weergave-cache';
import {clearCachedAvatar,rememberAvatarUrl,zetWeergaveAccount} from './gedeelde-voorkeuren';
import {setEcosystemSessionLikely} from './tab-context';
import {broadcastCanonicalAuthChange} from './canoniek-gebeurtenissen';
import Merk from './merk/Merk';
import './google-terugkeer-kaart.css';

type Lang='uk'|'nl';
type CallbackResult={ok?:boolean;stepUp?:boolean;result?:string;sourceOrigin?:string;locale?:Lang;flowMode?:'popup'|'redirect';returnTo?:string;reasonCode?:string;retryAfter?:number;sessionCreated?:boolean;user?:{id?:string;picture?:string|null}|null;mailboxAuthorized?:boolean;cloudStorageAuthorized?:boolean;suiteServiceAuthorized?:boolean;service?:'mail'|'drive'|'calendar'|'photos';nextService?:string;completedServices?:string[];technicalCookiePending?:boolean;handoffToken?:string};

const localeFromCallbackUrl=(url:URL):Lang=>{const state=url.searchParams.get('state')||'';const match=/^(?:v2|mailg\.v1|mailm\.v1|cloudg\.v1|gsuite\.v2)\.(uk|nl)\./.exec(state);if(match)return match[1]as Lang;const query=url.searchParams.get('lang');if(query==='uk'||query==='nl')return query;return navigator.language.toLowerCase().startsWith('nl')?'nl':'uk'};

const copy=(lang:Lang)=>lang==='nl'?{
  bovenAanmelden:'Mijn Ruimte · Veilig aanmelden met Google',
  bovenSuite:'Mijn Ruimte · Google-dienst koppelen',
  working:'We ronden de veilige aanmelding af…',
  suiteWorking:'We slaan uw Google-toegang veilig op…',
  failed:'De Google-aanmelding kon niet worden voltooid. Uw account is veilig en er is niets gewijzigd — start hieronder een nieuwe aanmeldpoging.',
  oauthState:'De eenmalige Google-bevestiging ontbreekt of hoort bij een eerdere poging. Er is niets gewijzigd — start de aanmelding hieronder opnieuw.',
  stateExpiredAanmelden:'Het beveiligde Google-bevestigingsvenster is verlopen: er zat te veel tijd tussen de start van het aanmelden en de terugkeer naar de site. Uw account is veilig en er is niets gewijzigd. Kies «Opnieuw aanmelden» voor een verse poging.',
  stateNotFoundAanmelden:'De eenmalige bevestiging van deze Google-aanmeldpoging is niet gevonden of al gebruikt (bijvoorbeeld door vernieuwen of een tweede tabblad). Kies «Opnieuw aanmelden» in dit tabblad.',
  timeoutAanmelden:'De toegestane tijd voor deze Google-aanmeldpoging is verstreken. Uw account is veilig en er is niets gewijzigd — start hieronder een nieuwe poging.',
  txMismatchAanmelden:'Deze Google-terugkeer hoort niet meer bij de actieve aanmeldpoging in dit tabblad. Kies «Opnieuw aanmelden» om schoon te beginnen.',
  ownerIdentity:'Dit Google-profiel hoort niet bij de vaste Google-identiteit van de eigenaar. Het adres van de eigenaar krijgt nooit een tweede account; de aanmelding is geweigerd en gemeld aan de eigenaar. Bent u de eigenaar met een nieuw Google-profiel: koppel eerst de oude identiteit los bij «Aanmeldmethoden».',
  configMissing:'De Google-aanmelding is nog niet volledig ingesteld door de beheerder. Probeer het later opnieuw of neem contact op met de beheerder.',
  wrongPrimary:'U koos een ander Google-profiel dan het primaire profiel van Mijn Ruimte. Kies voor de primaire Gmail hetzelfde Google-profiel waarmee u bij Mijn Ruimte bent aangemeld.',
  duplicatePrimary:'Dit Google-profiel is al gekoppeld als primair account. Kies het in de lijst met accounts in plaats van het opnieuw toe te voegen.',
  denied:'Google-toegang is niet verleend. Er is niets gewijzigd; u kunt het opnieuw starten wanneer u wilt.',
  scope:'Niet alle benodigde Gmail-machtigingen zijn verleend. Start de koppeling opnieuw en controleer de gevraagde toegangen.',
  expiredSuite:'De beveiligde Google-koppeling is verlopen. Ga terug naar E-mail → Accounts en start één nieuwe poging.',
  retryLogin:'Opnieuw aanmelden',
  retrySuite:'Koppeling opnieuw starten',
  back:'Terug naar de vorige pagina',
}:{
  bovenAanmelden:'Мій простір · Безпечний вхід через Google',
  bovenSuite:'Мій простір · Підключення служби Google',
  working:'Завершуємо безпечний вхід…',
  suiteWorking:'Безпечно зберігаємо доступ Google…',
  failed:'Не вдалося завершити вхід через Google. Обліковий запис у безпеці й нічого не змінено — почніть нову спробу нижче.',
  oauthState:'Одноразове підтвердження Google відсутнє або залишилося від попередньої спроби. Нічого не змінено — натисніть «Почати вхід знову».',
  stateExpiredAanmelden:'Захищене вікно підтвердження Google застаріло: минуло забагато часу між початком входу та поверненням на сайт. Обліковий запис у безпеці й нічого не змінено. Натисніть «Почати вхід знову», щоб одразу виконати свіжу спробу.',
  stateNotFoundAanmelden:'Одноразове підтвердження цієї спроби входу Google не знайдено або вже використане (наприклад, через оновлення сторінки чи іншу вкладку). Натисніть «Почати вхід знову» у цій вкладці.',
  timeoutAanmelden:'Час, відведений на завершення цієї спроби входу Google, вичерпано. Обліковий запис у безпеці й нічого не змінено — почніть нову спробу нижче.',
  txMismatchAanmelden:'Це повернення з Google більше не відповідає активній спробі входу у цій вкладці. Натисніть «Почати вхід знову», щоб почати чисто.',
  ownerIdentity:'Цей профіль Google не збігається з постійною ідентичністю власника. Адреса власника ніколи не отримує другий обліковий запис; вхід відхилено, власника повідомлено. Якщо ви власник із новим профілем Google: спершу від’єднайте стару ідентичність у розділі «Способи входу».',
  configMissing:'Вхід через Google ще не повністю налаштований адміністратором. Спробуйте пізніше або зверніться до адміністратора.',
  wrongPrimary:'Ви обрали інший профіль Google, ніж основний профіль «Мого простору». Для основної скриньки Gmail оберіть той самий профіль Google, з яким увійшли до «Мого простору».',
  duplicatePrimary:'Цей профіль Google уже підключений як основний. Оберіть його у переліку облікових записів замість повторного додавання.',
  denied:'Доступ Google не надано. Нічого не змінено; ви можете почати знову в будь-який момент.',
  scope:'Надано не всі потрібні дозволи Gmail. Почніть підключення повторно й перевірте запитані доступи.',
  expiredSuite:'Захищена спроба підключення Google застаріла. Поверніться до розділу «Пошта → Облікові записи» й почніть одну нову спробу.',
  retryLogin:'Почати вхід знову',
  retrySuite:'Почати підключення знову',
  back:'Повернутися назад',
};

export const failureCopy=(lang:Lang,reason:string,suiteState=false)=>{
  const c=copy(lang);
  const code=veiligeFoutcode(reason);
  if(code==='GOOGLE_SUITE_PRIMARY_ACCOUNT_MISMATCH'||code==='GOOGLE_SUITE_PRIMARY_IDENTITY_MISMATCH')return c.wrongPrimary;
  if(code==='GOOGLE_SUITE_ADDITIONAL_ACCOUNT_DUPLICATES_PRIMARY')return c.duplicatePrimary;
  if(code==='GOOGLE_SUITE_CONSENT_DENIED'||reason==='access_denied')return c.denied;
  if(code==='GOOGLE_SUITE_SCOPE_INCOMPLETE')return c.scope;
  if(code==='GOOGLE_SUITE_STATE_NOT_FOUND'||code==='GOOGLE_SUITE_STATE_EXPIRED')return c.expiredSuite;
  if(code==='STATE_EXPIRED'||code==='OWNER_OAUTH_EXPIRED'||reason==='expired')return suiteState?c.expiredSuite:c.stateExpiredAanmelden;
  if(code==='STATE_NOT_FOUND')return suiteState?c.expiredSuite:c.stateNotFoundAanmelden;
  if(code==='TIMEOUT'||code==='OWNER_CALLBACK_TIMEOUT')return suiteState?c.expiredSuite:c.timeoutAanmelden;
  if(code==='TRANSACTION_NOT_FOUND'||code==='TRANSACTION_NOT_ATTACHED'||code==='STATE_TRANSACTION_MISMATCH')return suiteState?c.expiredSuite:c.txMismatchAanmelden;
  if(code==='OWNER_CALLBACK_STATE_MISSING'||code==='LOGIN_BINDING_MISMATCH'||reason==='invalid_state'||reason==='state_mismatch'||code==='OWNER_OAUTH_STATE_INVALID')return c.oauthState;
  if(code==='OWNER_IDENTITY_MISMATCH')return c.ownerIdentity;
  if(code==='OWNER_GOOGLE_SECRET_UNAVAILABLE'||code==='OWNER_GOOGLE_STATE_CREATE_FAILED'||code==='GOOGLE_CONTOUR_SECRET_MISSING')return c.configMissing;
  return c.failed;
};

// Zelf gehost: na het inloggen altijd terug naar de hub (geen AppDeploy-origin meer).
const defaultBack=()=>'https://hub.tarasevych.com/';
const safeBack=(value:string)=>{const fallback=defaultBack();try{const url=new URL(value||fallback,location.origin),host=url.hostname.toLowerCase(),allowed=host==='tarasevych.com'||host.endsWith('.tarasevych.com');return url.protocol==='https:'&&allowed?url.toString():fallback}catch{return fallback}};
const apiFailure=(caught:unknown)=>{let reason='OWNER_CALLBACK_REQUEST_FAILED',status='',locale:Lang|''='',returnTo='',retryAfter=0;if(caught&&typeof caught==='object'){const item=caught as Record<string,unknown>;const response=item.response&&typeof item.response==='object'?item.response as Record<string,unknown>:null;const data=response?.data&&typeof response.data==='object'?response.data as Record<string,unknown>:item.data&&typeof item.data==='object'?item.data as Record<string,unknown>:null;reason=String(data?.reasonCode||data?.error||item.message||reason);status=String(response?.status||item.status||'');retryAfter=Math.max(0,Math.ceil(Number(data?.retryAfter||item.retryAfter||0)||0));if(data?.locale==='uk'||data?.locale==='nl')locale=data.locale;returnTo=String(data?.returnTo||'')}return{reason,status,locale,returnTo,retryAfter}};

const duurTekst=(seconden:number,lang:Lang):string=>{
  const s=Math.max(1,Math.ceil(seconden));
  if(s<60)return lang==='nl'?`${s} s`:`${s} с`;
  if(s<3600){const m=Math.floor(s/60),rest=s%60;return rest===0?(lang==='nl'?`${m} min`:`${m} хв`):(lang==='nl'?`${m} min ${rest} s`:`${m} хв ${rest} с`)}
  const u=Math.floor(s/3600),m=Math.ceil((s%3600)/60);
  if(m===0||m===60)return lang==='nl'?`${m===60?u+1:u} u`:`${m===60?u+1:u} год`;
  return lang==='nl'?`${u} u ${m} min`:`${u} год ${m} хв`;
};

const pasAangemeldAccountToe=(data:CallbackResult)=>{
  const userId=String(data.user?.id||'').trim();
  if(!data.sessionCreated||!userId)return;
  const sleutel=rememberViewAccountEverywhere(userId);
  zetWeergaveAccount(sleutel);
  if(data.user?.picture)rememberAvatarUrl(data.user.picture);
  else clearCachedAvatar();
  setEcosystemSessionLikely(true);
  broadcastCanonicalAuthChange();
};

// MAILFIX-001: servercode zichtbaar maken zonder ooit OAuth-code, state of URL te tonen.
const veiligeFoutcode=(reason:string)=>/^[A-Za-z][A-Za-z0-9_]{2,89}$/.test(reason)?reason.toUpperCase():'OWNER_CALLBACK_REQUEST_FAILED';
const kluisPad=()=>{try{const u=new URL(location.origin),d=u.hostname.split('.');if(d.length>2)d[0]='id';else d.unshift('id');return `${u.protocol}//${d.join('.')}${u.port?`:${u.port}`:''}/aanmeldmethoden#aanmeldmethoden-sleutelkluis`}catch{return 'https://id.tarasevych.com/aanmeldmethoden#aanmeldmethoden-sleutelkluis'}};

/** HERSTEL-001 (GOOG-4): безпечна адреса для негайного повторного входу з передачею причини (?aanmeld_fout=<КОД>). */
const maakOpnieuwUrl=(doel:string,code:string|undefined,suiteState:boolean):string=>{
  const basis=safeBack(doel);
  if(suiteState||!code)return basis;
  try{
    const u=new URL(basis);
    u.searchParams.set('aanmeld_fout',veiligeFoutcode(code));
    return safeBack(u.toString());
  }catch{
    return basis;
  }
};

/** HERSTEL-001 (GOOG-1 / GOOG-3): короткий зрозумілий заголовок стану над поясненням. */
const foutTitel=(lang:Lang,code:string,suiteState:boolean):string=>{
  switch(code){
    case 'STATE_EXPIRED':
    case 'OWNER_OAUTH_EXPIRED':
    case 'TIMEOUT':
    case 'OWNER_CALLBACK_TIMEOUT':
    case 'GOOGLE_SUITE_STATE_EXPIRED':
      return lang==='nl'?'Bevestigingstijd voor aanmelden is verlopen':'Час підтвердження входу минув';
    case 'STATE_NOT_FOUND':
    case 'TRANSACTION_NOT_FOUND':
    case 'TRANSACTION_NOT_ATTACHED':
    case 'STATE_TRANSACTION_MISMATCH':
    case 'LOGIN_BINDING_MISMATCH':
      return lang==='nl'?'Deze aanmeldpoging is niet meer actief':'Ця спроба входу вже не активна';
    case 'ACCESS_DENIED':
    case 'GOOGLE_SUITE_CONSENT_DENIED':
      return lang==='nl'?'Toegang bij Google geannuleerd':'Вхід у вікні Google скасовано';
    case 'RATE_LIMITED':
      return lang==='nl'?'Even geduld vóór een nieuwe poging':'Тимчасова пауза між спробами';
    default:
      return suiteState
        ?(lang==='nl'?'Google-koppeling nog niet voltooid':'Підключення Google ще не завершено')
        :(lang==='nl'?'Aanmelden met Google gepauzeerd':'Вхід через Google призупинено');
  }
};

/** HERSTEL-001 (GOOG-2): людське розшифрування технічного коду всередині плашки подробиць. */
const foutcodeVerklaring=(lang:Lang,code:string,status:string):string=>{
  const httpDeel=status==='400'
    ?(lang==='nl'?' HTTP 400 betekent dat de server het verouderde of onvolledige verzoek veilig vóór de sleuteluitwisseling heeft gestopt.':' Статус HTTP 400 означає, що сервер безпечно зупинив застарілий або неповний запит ще до обміну ключами.')
    :status
      ?(lang==='nl'?` De server antwoordde met HTTP-status ${status}.`:` Сервер відповів статусом HTTP ${status}.`)
      :'';
  switch(code){
    case 'STATE_EXPIRED':
      return (lang==='nl'
        ?'STATE_EXPIRED betekent dat het eenmalige OAuth-state-bewijs zijn korte geldigheidsduur heeft overschreden om onderschepping te voorkomen.'
        :'Код STATE_EXPIRED означає, що одноразовий захисний стан OAuth вичерпав свій короткий строк дії (захист від перехоплення посилання).')+httpDeel;
    case 'STATE_NOT_FOUND':
      return (lang==='nl'
        ?'STATE_NOT_FOUND betekent dat dit eenmalige OAuth-bewijs al eerder is verbruikt of niet in deze sessie is aangemaakt.'
        :'Код STATE_NOT_FOUND означає, що одноразовий стан OAuth уже був використаний раніше або створений не в цьому сеансі.')+httpDeel;
    case 'TIMEOUT':
    case 'OWNER_CALLBACK_TIMEOUT':
      return (lang==='nl'
        ?'De aanmeldtransactie heeft de tijdslimiet overschreden voordat Google en de server de controle afrondden.'
        :'Транзакція входу перевищила дозволений час очікування до завершення перевірки між Google та сервером.')+httpDeel;
    case 'LOGIN_BINDING_MISMATCH':
      return (lang==='nl'
        ?'Het beveiligingsbewijs van het tabblad kwam niet overeen met het tabblad waarin de aanmelding startte.'
        :'Захисна прив’язка оглядача не збіглася з вкладкою, у якій починався вхід.')+httpDeel;
    default:
      return (lang==='nl'
        ?`Diagnostische servercode ${code} geeft aan op welke controle de OAuth-terugkeer stopte.`
        :`Діагностичний код ${code} вказує точний захисний крок, на якому зупинилося повернення OAuth.`)+httpDeel;
  }
};

export const callbackUitleg=(lang:Lang,reason:string,retryAfter=0,suiteState=false)=>{
  switch(veiligeFoutcode(reason)){
    case 'STATE_EXPIRED':
      return failureCopy(lang,'STATE_EXPIRED',suiteState);
    case 'STATE_NOT_FOUND':
      return failureCopy(lang,'STATE_NOT_FOUND',suiteState);
    case 'TIMEOUT':
    case 'OWNER_CALLBACK_TIMEOUT':
      return failureCopy(lang,'TIMEOUT',suiteState);
    case 'TRANSACTION_NOT_FOUND':
    case 'TRANSACTION_NOT_ATTACHED':
    case 'STATE_TRANSACTION_MISMATCH':
      return failureCopy(lang,'STATE_TRANSACTION_MISMATCH',suiteState);
    case 'RATE_LIMITED':{
      const d=duurTekst(retryAfter||60,lang);
      return lang==='uk'
        ?`Із цієї мережі надійшло забагато спроб входу за хвилину. Зачекайте ${d} і спокійно почніть вхід знову — ваш обліковий запис у безпеці.`
        :`Er kwamen vanaf dit netwerk te veel aanmeldpogingen per minuut binnen. Wacht ${d} en meld u rustig opnieuw aan — uw account is veilig.`;
    }
    case 'PLAATS_NODIG':return lang==='uk'
      ?'Цей обліковий запис вимагає місце пристрою для входу через Google, а оглядач його не надав. Перейдіть на сторінку входу, дозвольте оглядачу доступ до місця й увійдіть ще раз.'
      :'Dit account eist bij aanmelden met Google de plaats van het apparaat en de browser gaf die niet. Ga naar de aanmeldpagina, geef de browser toegang tot de locatie en meld u opnieuw aan.';
    case 'SLEUTELKLUIS_GESLOTEN':return lang==='uk'
      ?'Google підтвердив вхід, але ваш особистий ключ шифрування даних на сервері зараз закритий (наприклад, після оновлення сервера). Відкрийте сховище ключів у «Способи входу → Шифрування» та повторіть підключення.'
      :'Google heeft de aanmelding bevestigd, maar uw persoonlijke gegevenssleutel op de server is nu gesloten (bijvoorbeeld na een serverbijwerking). Ontgrendel de sleutelkluis bij «Aanmeldmethoden → Versleuteling» en probeer opnieuw.';
    case 'GOOGLE_SUITE_REAUTH_REQUIRED':return lang==='uk'
      ?'Попередній дозвіл Google більше не дійсний. Розпочніть підключення пошти ще раз і підтвердьте всі запитані доступи.'
      :'De eerdere Google-toestemming is niet meer geldig. Start de mailkoppeling opnieuw en bevestig alle gevraagde rechten.';
    case 'GOOGLE_SUITE_BROWSER_BINDING_MISMATCH':return lang==='uk'
      ?'Захисне підтвердження оглядача не повернулося після Google. Перевірте, чи дозволені реп’яшки для tarasevych.com, і розпочніть підключення знову в тому самому оглядачі.'
      :'De beveiligde browserkoppeling kwam niet terug van Google. Sta cookies voor tarasevych.com toe en start opnieuw in dezelfde browser.';
    case 'GOOGLE_SUITE_TOKEN_EXCHANGE_REJECTED':return lang==='uk'
      ?'Google не прийняв обмін тимчасового коду на дозвіл пошти. Потрібно перевірити налаштування OAuth на сервері.'
      :'Google heeft de omwisseling van de tijdelijke code geweigerd. De OAuth-instellingen op de server moeten worden gecontroleerd.';
    case 'GOOGLE_SUITE_OAUTH_MATERIAL_MISSING':return lang==='uk'
      ?'Сервер не знайшов одноразове підтвердження цієї спроби Google. Поверніться до пошти та почніть нове підключення.'
      :'De server heeft de eenmalige bevestiging van deze Google-poging niet gevonden. Ga terug naar e-mail en begin opnieuw.';
    case 'NETWORK_ERROR':return lang==='uk'
      ?'Пристрій не зміг зв’язатися із сервером під час завершення входу. Ми повторили запит, але підтвердження ще немає.'
      :'Het apparaat kon de server niet bereiken tijdens het afronden. Het verzoek is herhaald, maar er is nog geen bevestiging.';
    default:return failureCopy(lang,reason,suiteState);
  }
};

export default function OwnerIdentityCallback(){
  const initialUrl=new URL(location.href);
  const initialLocale=localeFromCallbackUrl(initialUrl);
  const initialSuite=/^gsuite\.v2\./.test(initialUrl.searchParams.get('state')||'');
  const started=useRef(false);
  const kopieTimer=useRef(0);
  const[locale,setLocale]=useState<Lang>(initialLocale);
  const[isSuite,setIsSuite]=useState(initialSuite);
  const[message,setMessage]=useState(initialSuite?copy(initialLocale).suiteWorking:copy(initialLocale).working);
  const[failed,setFailed]=useState(false);
  const[backTo,setBackTo]=useState('https://hub.tarasevych.com/');
  const[diagnostic,setDiagnostic]=useState<{code:string;status:string}|null>(null);
  const[gekopieerd,setGekopieerd]=useState(false);

  useEffect(()=>{
    if(started.current)return;
    started.current=true;
    document.documentElement.lang=initialLocale;
    const current=new URL(location.href);
    const state=current.searchParams.get('state')||'';
    const code=current.searchParams.get('code')||'';
    const providerError=current.searchParams.get('error')||'';
    const suiteState=/^gsuite\.v2\./.test(state);
    setIsSuite(suiteState);
    const callbackEndpoint=suiteState?'/api/owner/google-suite/callback':'/api/owner/auth/google/callback';
    if(suiteState)setMessage(copy(initialLocale).suiteWorking);
    markeerGoogleTerugkeer(); /* IDENTITEIT-015 (C2): до очищення адреси — прапорці на цій сторінці не питаються (401 без контексту вкладки) */
    try{history.replaceState({},'',current.pathname||'/')}catch{}
    let stopped=false;
    let retryTimer=0;let watchdog=0;
    const showFailure=(reason:string,nextLocale:Lang=initialLocale,status='',returnTo='',retryAfter=0)=>{if(stopped)return;setLocale(nextLocale);document.documentElement.lang=nextLocale;setFailed(true);setMessage(callbackUitleg(nextLocale,reason,retryAfter,suiteState));setDiagnostic({code:veiligeFoutcode(reason),status:/^[0-9]{3}$/.test(status)?status:''});setBackTo(safeBack(returnTo||(suiteState?'https://mail.tarasevych.com/accounts':'')));window.clearTimeout(watchdog)};
    watchdog=window.setTimeout(()=>showFailure('OWNER_CALLBACK_TIMEOUT'),25000);if(!state){showFailure('OWNER_CALLBACK_STATE_MISSING');return()=>{stopped=true;window.clearTimeout(watchdog)}};
    const submit=(attempt=0)=>{void api.post(callbackEndpoint,{state,code,error:providerError}).then(response=>{if(stopped)return;const data=(response.data||{})as CallbackResult;const nextLocale=initialLocale;const reason=providerError||String(data.reasonCode||'OWNER_REDIRECT_COMPLETE_FAILED');const dataRetryAfter=Math.max(0,Math.ceil(Number(data.retryAfter||0)||0));if(reason==='CALLBACK_IN_PROGRESS'&&attempt<20){retryTimer=window.setTimeout(()=>submit(attempt+1),Math.min(300+attempt*100,1000));return}if(data.flowMode==='redirect'){const authorized=Boolean(data.sessionCreated||data.mailboxAuthorized||data.cloudStorageAuthorized||data.suiteServiceAuthorized);if(!data.ok||!authorized){/* mislukte step-up («Підтвердіть доступ»): terug naar de pagina, het venster toont de reden */if(data.stepUp&&data.returnTo){bewaarStapOpFout(reason);location.replace(safeBack(String(data.returnTo)));return}/* TELEGRAM-004: обліковий запис вимагає місце пристрою — назад на сторінку входу, там пояснення й кнопка «Надати місце пристрою» */if(reason==='PLAATS_NODIG'&&data.returnTo){let terug=safeBack(String(data.returnTo));try{const u=new URL(terug,location.origin);u.searchParams.set('aanmeld_fout','PLAATS_NODIG');terug=safeBack(u.toString())}catch{}location.replace(terug);return}showFailure(reason,nextLocale,'',String(data.returnTo||''),dataRetryAfter);return}pasAangemeldAccountToe(data);const returnTo=safeBack(String(data.returnTo||'https://hub.tarasevych.com/'));if(data.suiteServiceAuthorized){setLocale(nextLocale);document.documentElement.lang=nextLocale;setFailed(false);setMessage(nextLocale==='nl'?'Google-toestemming is opgeslagen. Het koppelplan wordt bijgewerkt…':'Дозвіл Google збережено. Оновлюємо план підключення…');let target=returnTo;try{const next=new URL(returnTo,location.origin);if(data.service)next.searchParams.set('google_suite_connected',data.service);next.searchParams.set('google_suite_callback','success');target=safeBack(next.toString())}catch{}retryTimer=window.setTimeout(()=>location.replace(target),250);return}location.replace(returnTo);return}if(data.ok){pasAangemeldAccountToe(data);const fallbackTo=safeBack(String(data.returnTo||'https://hub.tarasevych.com/'));location.replace(fallbackTo);return}showFailure(reason,nextLocale,'',String(data.returnTo||''),dataRetryAfter)}).catch(caught=>{const{reason,status,locale:errLocale,returnTo,retryAfter}=apiFailure(caught);if(!providerError&&attempt<2&&(reason==='NETWORK_ERROR'||['502','503','504'].includes(status))){retryTimer=window.setTimeout(()=>submit(attempt+1),500*(attempt+1));return}showFailure(providerError||reason,errLocale||initialLocale,status,returnTo,retryAfter)})};
    submit();
    return()=>{stopped=true;if(retryTimer)window.clearTimeout(retryTimer);if(watchdog)window.clearTimeout(watchdog);if(kopieTimer.current)window.clearTimeout(kopieTimer.current)};
  },[initialLocale]);

  const c=copy(locale);
  const opnieuwUrl=maakOpnieuwUrl(backTo,diagnostic?.code,isSuite);
  const volledigeFoutcode=diagnostic?`${diagnostic.code}${diagnostic.status?` · HTTP ${diagnostic.status}`:''}`:'';

  const kopieerFoutcode=async()=>{
    if(!volledigeFoutcode)return;
    let gelukt=false;
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(volledigeFoutcode);
        gelukt=true;
      }
    }catch{}
    if(!gelukt){
      try{
        const veld=document.createElement('textarea');
        veld.value=volledigeFoutcode;
        veld.setAttribute('readonly','true');
        veld.style.position='fixed';
        veld.style.opacity='0';
        document.body.appendChild(veld);
        veld.select();
        gelukt=document.execCommand('copy');
        document.body.removeChild(veld);
      }catch{}
    }
    if(gelukt){
      setGekopieerd(true);
      if(kopieTimer.current)window.clearTimeout(kopieTimer.current);
      kopieTimer.current=window.setTimeout(()=>setGekopieerd(false),2600);
    }
  };

  return (
    <main lang={locale} className='mr-google-terug-scherm'>
      <section className='mr-google-terug-kaart' data-google-terug-kaart={failed?'fout':'bezig'}>
        <header className='mr-google-terug-kop'>
          <span className='mr-google-terug-merk' aria-hidden='true'>
            <Merk merk='google' maat={26} vorm='gliefje' />
          </span>
          <div>
            <p className='mr-google-terug-boventitel'>{isSuite?c.bovenSuite:c.bovenAanmelden}</p>
            <h1 className='mr-google-terug-titel'>
              {failed
                ?foutTitel(locale,diagnostic?.code||'OWNER_CALLBACK_REQUEST_FAILED',isSuite)
                :(locale==='nl'?'Even geduld…':'Зачекайте мить…')}
            </h1>
          </div>
        </header>

        {!failed?(
          <div className='mr-google-terug-wacht' role='status'>
            <span className='mr-google-terug-ring' aria-hidden='true' />
            <span>{message}</span>
          </div>
        ):(
          <>
            <p className='mr-google-terug-tekst' role='alert' data-google-terug-uitleg={diagnostic?.code||''}>{message}</p>

            <div className='mr-google-terug-acties'>
              {diagnostic?.code==='SLEUTELKLUIS_GESLOTEN'?(
                <a href={kluisPad()} className='mr-google-terug-knop-primair' data-google-terug-primair='kluis'>
                  {locale==='uk'?'Відкрити сховище ключів':'Sleutelkluis ontgrendelen'}
                </a>
              ):(
                <a href={opnieuwUrl} className='mr-google-terug-knop-primair' data-google-terug-primair='opnieuw'>
                  {isSuite?c.retrySuite:c.retryLogin}
                </a>
              )}
              <a href={backTo} className='mr-google-terug-knop-secundair' data-google-terug-secundair='terug'>
                {c.back}
              </a>
            </div>

            {diagnostic&&(
              <details className='mr-google-terug-details' data-google-foutcode-blok={diagnostic.code}>
                <summary>
                  <span className='mr-google-terug-code-rij'>
                    <span>{locale==='uk'?'Код збою:':'Foutcode:'}</span>
                    <code className='mr-google-terug-code-pil'>{diagnostic.code}</code>
                    {diagnostic.status?<span>{`· HTTP ${diagnostic.status}`}</span>:null}
                  </span>
                  <span className='mr-google-terug-pijl' aria-hidden='true'>▾</span>
                </summary>
                <div className='mr-google-terug-details-inhoud'>
                  <p className='mr-google-terug-verklaring'>
                    {foutcodeVerklaring(locale,diagnostic.code,diagnostic.status)}
                  </p>
                  <button
                    type='button'
                    className='mr-google-terug-kopieer'
                    data-google-foutcode-kopieer={diagnostic.code}
                    data-gekopieerd={gekopieerd?'ja':'nee'}
                    onClick={()=>{void kopieerFoutcode();}}
                  >
                    {gekopieerd
                      ?(locale==='uk'?'Код скопійовано ✓':'Code gekopieerd ✓')
                      :(locale==='uk'?'Скопіювати код збою':'Foutcode kopiëren')}
                  </button>
                  <small className='mr-google-terug-veilig-noot'>
                    {locale==='uk'
                      ?'Цей код не містить особистих даних чи одноразових параметрів OAuth — за потреби його безпечно передати розробникові.'
                      :'Deze code bevat geen persoonsgegevens of eenmalige OAuth-parameters — u kunt hem veilig met de ontwikkelaar delen.'}
                  </small>
                </div>
              </details>
            )}
          </>
        )}
      </section>
    </main>
  );
}
