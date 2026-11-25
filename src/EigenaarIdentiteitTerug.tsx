import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown,Clock,Code2,Copy,ShieldCheck,X} from 'lucide-react';
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

const localeFromCallbackUrl=(url:URL):Lang=>{const state=url.searchParams.get('state')||'';const match=/^(?:v2|mailg\.v1|mailm\.v1|cloudg\.v1|gsuite\.v2)\.(uk|nl)\./.exec(state);if(match)return match[1]as Lang;const query=url.searchParams.get('lang');if(query==='uk'||query==='nl')return query;const docLang=typeof document!=='undefined'?document.documentElement.lang:'';if(docLang==='uk'||docLang==='nl')return docLang;return navigator.language.toLowerCase().startsWith('nl')?'nl':'uk'};

const copy=(lang:Lang)=>lang==='nl'?{
  bovenAanmelden:'Mijn Ruimte · Aanmelden met Google',
  bovenSuite:'Mijn Ruimte · Google koppelen',
  working:'We ronden de veilige aanmelding af…',
  suiteWorking:'We slaan uw Google-toegang veilig op…',
  failed:'De Google-aanmelding kon niet worden voltooid. Uw account is veilig en er is niets gewijzigd — start hieronder een nieuwe aanmeldpoging.',
  oauthState:'De eenmalige Google-bevestiging ontbreekt of hoort bij een eerdere poging. Er is niets gewijzigd — start de aanmelding hieronder opnieuw.',
  stateExpiredAanmelden:'Het beveiligde Google-bevestigingsvenster is verlopen: er zat te veel tijd tussen de start van het aanmelden en de terugkeer naar de site. Uw account is veilig en er is niets gewijzigd.',
  stateNotFoundAanmelden:'De eenmalige bevestiging van deze Google-aanmeldpoging is niet gevonden of al gebruikt (bijvoorbeeld door vernieuwen of een tweede tabblad).',
  timeoutAanmelden:'De toegestane tijd voor deze Google-aanmeldpoging is verstreken. Uw account is veilig en er is niets gewijzigd.',
  txMismatchAanmelden:'Deze Google-terugkeer hoort niet meer bij de actieve aanmeldpoging in dit tabblad.',
  ownerIdentity:'Dit Google-profiel hoort niet bij de vaste Google-identiteit van de eigenaar. Het adres van de eigenaar krijgt nooit een tweede account; de aanmelding is geweigerd en gemeld aan de eigenaar. Bent u de eigenaar met een nieuw Google-profiel: koppel eerst de oude identiteit los bij «Aanmeldmethoden».',
  configMissing:'De Google-aanmelding is nog niet volledig ingesteld door de beheerder. Probeer het later opnieuw of neem contact op met de beheerder.',
  wrongPrimary:'U koos een ander Google-profiel dan het primaire profiel van Mijn Ruimte. Kies voor de primaire Gmail hetzelfde Google-profiel waarmee u bij Mijn Ruimte bent aangemeld.',
  duplicatePrimary:'Dit Google-profiel is al gekoppeld als primair account. Kies het in de lijst met accounts in plaats van het opnieuw toe te voegen.',
  denied:'Google-toegang is niet verleend. Er is niets gewijzigd; u kunt het opnieuw starten wanneer u wilt.',
  scope:'Niet alle benodigde Gmail-machtigingen zijn verleend. Start de koppeling opnieuw en controleer de gevraagde toegangen.',
  expiredSuite:'De beveiligde Google-koppeling is verlopen. Ga terug naar E-mail → Accounts en start één nieuwe poging.',
  retryLogin:'Opnieuw aanmelden',
  retrySuite:'Koppeling opnieuw starten',
  back:'Terug naar vorige pagina',
  waaromTitel:'Waarom dit gebeurde',
  veiligPunt:'Uw account is veilig, er is niets gewijzigd',
  codeLabel:'Code:',
  meerDetails:'Meer details',
}:{
  bovenAanmelden:'Мій простір · Вхід через Google',
  bovenSuite:'Мій простір · Підключення Google',
  working:'Завершуємо безпечний вхід…',
  suiteWorking:'Безпечно зберігаємо доступ Google…',
  failed:'Не вдалося завершити вхід через Google. Обліковий запис у безпеці й нічого не змінено — почніть нову спробу нижче.',
  oauthState:'Одноразове підтвердження Google відсутнє або залишилося від попередньої спроби. Нічого не змінено.',
  stateExpiredAanmelden:'Захищене вікно підтвердження Google застаріло: минуло забагато часу між початком входу та поверненням на сайт. Обліковий запис у безпеці й нічого не змінено.',
  stateNotFoundAanmelden:'Одноразове підтвердження цієї спроби входу Google не знайдено або вже використане (наприклад, через оновлення сторінки чи іншу вкладку).',
  timeoutAanmelden:'Час, відведений на завершення цієї спроби входу Google, вичерпано. Обліковий запис у безпеці й нічого не змінено.',
  txMismatchAanmelden:'Це повернення з Google більше не відповідає активній спробі входу у цій вкладці.',
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
  waaromTitel:'Чому так сталося',
  veiligPunt:'Обліковий запис у безпеці, нічого не змінено',
  codeLabel:'Код:',
  meerDetails:'Докладно',
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

// Zelf gehost: na het aanmelden altijd terug naar Mijn Ruimte.
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

/** Короткий зрозумілий заголовок стану на головній картці. */
const foutTitel=(lang:Lang,code:string,suiteState:boolean):string=>{
  switch(code){
    case 'STATE_EXPIRED':
    case 'OWNER_OAUTH_EXPIRED':
    case 'TIMEOUT':
    case 'OWNER_CALLBACK_TIMEOUT':
    case 'GOOGLE_SUITE_STATE_EXPIRED':
      return lang==='nl'?'Bevestigingstijd verlopen':'Час підтвердження минув';
    case 'STATE_NOT_FOUND':
    case 'TRANSACTION_NOT_FOUND':
    case 'TRANSACTION_NOT_ATTACHED':
    case 'STATE_TRANSACTION_MISMATCH':
    case 'LOGIN_BINDING_MISMATCH':
      return lang==='nl'?'Poging niet meer actief':'Спроба вже не активна';
    case 'ACCESS_DENIED':
    case 'GOOGLE_SUITE_CONSENT_DENIED':
      return lang==='nl'?'Aanmelding geannuleerd':'Вхід скасовано';
    case 'RATE_LIMITED':
      return lang==='nl'?'Even geduld':'Тимчасова пауза';
    case 'SLEUTELKLUIS_GESLOTEN':
      return lang==='nl'?'Sleutelkluis is gesloten':'Сховище ключів закрите';
    default:
      return suiteState
        ?(lang==='nl'?'Koppeling niet voltooid':'Підключення не завершено')
        :(lang==='nl'?'Aanmelden gepauzeerd':'Вхід призупинено');
  }
};

/** Одне коротке речення на головній картці без зайвого візуального шуму (повне пояснення — у вікні «Чому так сталося» за кнопкою i). */
const korteKaartZin=(lang:Lang,code:string,retryAfter:number,suiteState:boolean):string=>{
  switch(code){
    case 'STATE_EXPIRED':
    case 'OWNER_OAUTH_EXPIRED':
    case 'GOOGLE_SUITE_STATE_EXPIRED':
      return suiteState
        ?(lang==='nl'?'Het koppelvenster is verlopen. Er is niets gewijzigd.':'Вікно підключення застаріло. Нічого не змінено.')
        :(lang==='nl'?'Het aanmeldvenster is verlopen. Er is niets gewijzigd.':'Вікно входу застаріло. Нічого не змінено.');
    case 'STATE_NOT_FOUND':
      return lang==='nl'?'Deze bevestiging is al gebruikt. Er is niets gewijzigd.':'Це підтвердження вже використане. Нічого не змінено.';
    case 'TIMEOUT':
    case 'OWNER_CALLBACK_TIMEOUT':
      return lang==='nl'?'De wachttijd is verstreken. Er is niets gewijzigd.':'Час очікування минув. Нічого не змінено.';
    case 'TRANSACTION_NOT_FOUND':
    case 'TRANSACTION_NOT_ATTACHED':
    case 'STATE_TRANSACTION_MISMATCH':
    case 'LOGIN_BINDING_MISMATCH':
      return lang==='nl'?'Poging hoort bij een ander tabblad. Er is niets gewijzigd.':'Спроба з іншої вкладки. Нічого не змінено.';
    case 'ACCESS_DENIED':
    case 'GOOGLE_SUITE_CONSENT_DENIED':
      return lang==='nl'?'Toegang bij Google niet bevestigd. Er is niets gewijzigd.':'Доступ у Google не підтверджено. Нічого не змінено.';
    case 'RATE_LIMITED':{
      const d=duurTekst(retryAfter||60,lang);
      return lang==='nl'?`Wacht ${d} en probeer opnieuw.`:`Зачекайте ${d} і спробуйте знову.`;
    }
    case 'SLEUTELKLUIS_GESLOTEN':
      return lang==='nl'?'Open eerst uw persoonlijke sleutelkluis.':'Спершу відкрийте особисте сховище ключів.';
    default:
      return lang==='nl'?'Probeer het gerust opnieuw. Er is niets gewijzigd.':'Спробуйте увійти знову. Нічого не змінено.';
  }
};

/** Перша коротка візуальна теза у спливному аркуші «Чому так сталося». */
const redenBladPunt=(lang:Lang,code:string,retryAfter:number):string=>{
  switch(code){
    case 'STATE_EXPIRED':
    case 'OWNER_OAUTH_EXPIRED':
    case 'GOOGLE_SUITE_STATE_EXPIRED':
      return lang==='nl'
        ?'Er zat te veel tijd tussen de start van het aanmelden en de terugkeer'
        :'Минуло забагато часу між початком входу і поверненням';
    case 'STATE_NOT_FOUND':
      return lang==='nl'
        ?'De eenmalige bevestiging is al eerder gebruikt of vernieuwd'
        :'Одноразове підтвердження вже використане або сторінку оновили';
    case 'TIMEOUT':
    case 'OWNER_CALLBACK_TIMEOUT':
      return lang==='nl'
        ?'De tijdslimiet voor het afronden van de aanmelding is overschreden'
        :'Перевищено час очікування відповіді під час завершення входу';
    case 'TRANSACTION_NOT_FOUND':
    case 'TRANSACTION_NOT_ATTACHED':
    case 'STATE_TRANSACTION_MISMATCH':
    case 'LOGIN_BINDING_MISMATCH':
      return lang==='nl'
        ?'De aanmelding begon in een ander tabblad of andere sessie'
        :'Спробу входу було розпочато в іншій вкладці або іншому сеансі';
    case 'RATE_LIMITED':{
      const d=duurTekst(retryAfter||60,lang);
      return lang==='nl'
        ?`Te veel pogingen per minuut vanaf dit netwerk (pauze ${d})`
        :`Забагато спроб за хвилину з цієї мережі (пауза ${d})`;
    }
    default:
      return lang==='nl'
        ?'De beveiligde terugkeercontrole kon deze poging niet voltooien'
        :'Захисна перевірка повернення зупинила цю спробу до створення сеансу';
  }
};

/** Людське розшифрування технічного коду у розкривному блоці «Докладно». */
const foutcodeVerklaring=(lang:Lang,code:string,status:string):string=>{
  const httpDeel=status==='400'
    ?(lang==='nl'?' HTTP 400 betekent dat de server het verouderde verzoek veilig vóór de sleuteluitwisseling heeft gestopt.':' Код відповіді HTTP 400 означає, що сервер безпечно зупинив застарілий запит ще до обміну ключами.')
    :status
      ?(lang==='nl'?` De server antwoordde met HTTP ${status}.`:` Сервер повернув код відповіді HTTP ${status}.`)
      :'';
  switch(code){
    case 'STATE_EXPIRED':
      return (lang==='nl'
        ?'STATE_EXPIRED geeft aan dat het eenmalige OAuth-bewijs zijn korte geldigheidsduur heeft overschreden.'
        :'Одноразовий стан OAuth дійсний лише кілька хвилин для захисту від перехоплення посилання.')+httpDeel;
    case 'STATE_NOT_FOUND':
      return (lang==='nl'
        ?'STATE_NOT_FOUND geeft aan dat dit eenmalige OAuth-bewijs niet meer actief is op de server.'
        :'Цей одноразовий стан OAuth більше не активний на сервері.')+httpDeel;
    default:
      return (lang==='nl'
        ?`Diagnostische code ${code} voor veilig delen met ondersteuning (zonder OAuth-geheimen).`
        :`Діагностичний код ${code} не містить особистих даних чи параметрів OAuth.`)+httpDeel;
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
  const infoKnopRef=useRef<HTMLButtonElement|null>(null);
  const sluitKnopRef=useRef<HTMLButtonElement|null>(null);
  const[locale,setLocale]=useState<Lang>(initialLocale);
  const[isSuite,setIsSuite]=useState(initialSuite);
  const[message,setMessage]=useState(initialSuite?copy(initialLocale).suiteWorking:copy(initialLocale).working);
  const[failed,setFailed]=useState(false);
  const[retrySec,setRetrySec]=useState(0);
  const[backTo,setBackTo]=useState('https://hub.tarasevych.com/');
  const[diagnostic,setDiagnostic]=useState<{code:string;status:string}|null>(null);
  const[infoOpen,setInfoOpen]=useState(false);
  const[gekopieerd,setGekopieerd]=useState(false);

  const sluitInfo=()=>{
    setInfoOpen(false);
    window.requestAnimationFrame(()=>infoKnopRef.current?.focus());
  };

  useEffect(()=>{
    if(!infoOpen)return undefined;
    const focusRaam=window.requestAnimationFrame(()=>sluitKnopRef.current?.focus());
    const opEsc=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();sluitInfo()}};
    window.addEventListener('keydown',opEsc);
    return()=>{
      window.cancelAnimationFrame(focusRaam);
      window.removeEventListener('keydown',opEsc);
    };
  },[infoOpen]);

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
    markeerGoogleTerugkeer();
    try{history.replaceState({},'',current.pathname||'/')}catch{}
    let stopped=false;
    let retryTimer=0;let watchdog=0;
    const showFailure=(reason:string,nextLocale:Lang=initialLocale,status='',returnTo='',retryAfter=0)=>{if(stopped)return;setLocale(nextLocale);document.documentElement.lang=nextLocale;setFailed(true);setRetrySec(retryAfter);setMessage(callbackUitleg(nextLocale,reason,retryAfter,suiteState));setDiagnostic({code:veiligeFoutcode(reason),status:/^[0-9]{3}$/.test(status)?status:''});setBackTo(safeBack(returnTo||(suiteState?'https://mail.tarasevych.com/accounts':'')));window.clearTimeout(watchdog)};
    watchdog=window.setTimeout(()=>showFailure('OWNER_CALLBACK_TIMEOUT'),25000);if(!state){showFailure('OWNER_CALLBACK_STATE_MISSING');return()=>{stopped=true;window.clearTimeout(watchdog)}};
    const submit=(attempt=0)=>{void api.post(callbackEndpoint,{state,code,error:providerError}).then(response=>{if(stopped)return;const data=(response.data||{})as CallbackResult;const nextLocale=data.locale==='nl'||data.locale==='uk'?data.locale:initialLocale;const reason=providerError||String(data.reasonCode||'OWNER_REDIRECT_COMPLETE_FAILED');const dataRetryAfter=Math.max(0,Math.ceil(Number(data.retryAfter||0)||0));if(reason==='CALLBACK_IN_PROGRESS'&&attempt<20){retryTimer=window.setTimeout(()=>submit(attempt+1),Math.min(300+attempt*100,1000));return}if(data.flowMode==='redirect'){const authorized=Boolean(data.sessionCreated||data.mailboxAuthorized||data.cloudStorageAuthorized||data.suiteServiceAuthorized);if(!data.ok||!authorized){if(data.stepUp&&data.returnTo){bewaarStapOpFout(reason);location.replace(safeBack(String(data.returnTo)));return}if(reason==='PLAATS_NODIG'&&data.returnTo){let terug=safeBack(String(data.returnTo));try{const u=new URL(terug,location.origin);u.searchParams.set('aanmeld_fout','PLAATS_NODIG');terug=safeBack(u.toString())}catch{}location.replace(terug);return}showFailure(reason,nextLocale,'',String(data.returnTo||''),dataRetryAfter);return}pasAangemeldAccountToe(data);const returnTo=safeBack(String(data.returnTo||'https://hub.tarasevych.com/'));if(data.suiteServiceAuthorized){setLocale(nextLocale);document.documentElement.lang=nextLocale;setFailed(false);setMessage(nextLocale==='nl'?'Google-toestemming is opgeslagen. Het koppelplan wordt bijgewerkt…':'Дозвіл Google збережено. Оновлюємо план підключення…');let target=returnTo;try{const next=new URL(returnTo,location.origin);if(data.service)next.searchParams.set('google_suite_connected',data.service);next.searchParams.set('google_suite_callback','success');target=safeBack(next.toString())}catch{}retryTimer=window.setTimeout(()=>location.replace(target),250);return}location.replace(returnTo);return}if(data.ok){pasAangemeldAccountToe(data);const fallbackTo=safeBack(String(data.returnTo||'https://hub.tarasevych.com/'));location.replace(fallbackTo);return}showFailure(reason,nextLocale,'',String(data.returnTo||''),dataRetryAfter)}).catch(caught=>{const{reason,status,locale:errLocale,returnTo,retryAfter}=apiFailure(caught);if(!providerError&&attempt<2&&(reason==='NETWORK_ERROR'||['502','503','504'].includes(status))){retryTimer=window.setTimeout(()=>submit(attempt+1),500*(attempt+1));return}showFailure(providerError||reason,errLocale||initialLocale,status,returnTo,retryAfter)})};
    submit();
    return()=>{stopped=true;if(retryTimer)window.clearTimeout(retryTimer);if(watchdog)window.clearTimeout(watchdog);if(kopieTimer.current)window.clearTimeout(kopieTimer.current)};
  },[initialLocale]);

  const c=copy(locale);
  const code=diagnostic?.code||'OWNER_CALLBACK_REQUEST_FAILED';
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
        <div className='mr-google-terug-merkrij'>
          <span className='mr-google-terug-merk-icoon' aria-hidden='true'>
            <Merk merk='google' maat={20} vorm='gliefje' />
          </span>
          <p className='mr-google-terug-boventitel'>{isSuite?c.bovenSuite:c.bovenAanmelden}</p>
        </div>

        <div className='mr-google-terug-titelrij'>
          <h1 className='mr-google-terug-titel'>
            {failed
              ?foutTitel(locale,code,isSuite)
              :(locale==='nl'?'Even geduld…':'Зачекайте мить…')}
          </h1>
          {failed&&(
            <button
              ref={infoKnopRef}
              type='button'
              className='mr-google-terug-info-knop is-icoon'
              data-google-terug-info-knop='1'
              aria-label={c.waaromTitel}
              aria-haspopup='dialog'
              aria-expanded={infoOpen}
              onClick={()=>setInfoOpen(true)}
            >
              i
            </button>
          )}
        </div>

        {!failed?(
          <div className='mr-google-terug-wacht' role='status'>
            <span className='mr-google-terug-ring' aria-hidden='true' />
            <span>{message}</span>
          </div>
        ):(
          <>
            <p className='mr-google-terug-kort' role='alert' data-google-terug-uitleg={code}>
              {korteKaartZin(locale,code,retrySec,isSuite)}
            </p>

            <div className='mr-google-terug-acties'>
              {code==='SLEUTELKLUIS_GESLOTEN'?(
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
          </>
        )}
      </section>

      {failed&&infoOpen&&(
        <div
          className='mr-google-terug-sluier'
          data-google-terug-sluier='1'
          onClick={e=>{if(e.target===e.currentTarget)sluitInfo()}}
        >
          <div
            className='mr-google-terug-blad'
            data-google-terug-blad={code}
            role='dialog'
            aria-modal='true'
            aria-labelledby='mr-google-terug-blad-titel'
          >
            <div className='mr-google-terug-blad-kop'>
              <h2 id='mr-google-terug-blad-titel'>{c.waaromTitel}</h2>
              <button
                ref={sluitKnopRef}
                type='button'
                className='mr-google-terug-blad-sluit is-icoon'
                aria-label={locale==='uk'?'Закрити':'Sluiten'}
                onClick={sluitInfo}
              >
                <X size={20} aria-hidden='true' />
              </button>
            </div>

            <div className='mr-google-terug-blad-punten'>
              <div className='mr-google-terug-punt'>
                <span className='mr-google-terug-punt-icoon is-tijd' aria-hidden='true'>
                  <Clock size={20} />
                </span>
                <p>{redenBladPunt(locale,code,retrySec)}</p>
              </div>
              <div className='mr-google-terug-punt'>
                <span className='mr-google-terug-punt-icoon is-schild' aria-hidden='true'>
                  <ShieldCheck size={20} />
                </span>
                <p>{c.veiligPunt}</p>
              </div>
            </div>

            {diagnostic&&(
              <div className='mr-google-terug-codekaart' data-google-foutcode-blok={diagnostic.code}>
                <div className='mr-google-terug-codebalk'>
                  <span className='mr-google-terug-codelabel'>
                    <Code2 size={17} aria-hidden='true' />
                    <span>{c.codeLabel}</span>
                    <span className='mr-google-terug-codewaarde'>
                      <code>{diagnostic.code}</code>
                      {diagnostic.status?<span className='mr-google-terug-codestatus'>{` · HTTP ${diagnostic.status}`}</span>:null}
                    </span>
                  </span>
                  <button
                    type='button'
                    className='mr-google-terug-kopieer-icoon is-icoon'
                    data-google-foutcode-kopieer={diagnostic.code}
                    data-gekopieerd={gekopieerd?'ja':'nee'}
                    aria-label={gekopieerd?(locale==='uk'?'Код скопійовано':'Code gekopieerd'):(locale==='uk'?'Скопіювати код збою':'Foutcode kopiëren')}
                    title={gekopieerd?(locale==='uk'?'Код скопійовано':'Code gekopieerd'):(locale==='uk'?'Скопіювати код збою':'Foutcode kopiëren')}
                    onClick={()=>{void kopieerFoutcode();}}
                  >
                    {gekopieerd?<Check size={17} aria-hidden='true' />:<Copy size={17} aria-hidden='true' />}
                  </button>
                </div>

                <details className='mr-google-terug-meer'>
                  <summary>
                    <ChevronDown size={16} className='mr-google-terug-meer-pijl' aria-hidden='true' />
                    <span>{c.meerDetails}</span>
                  </summary>
                  <div className='mr-google-terug-meer-inhoud'>
                    <p>{message}</p>
                    <p>{foutcodeVerklaring(locale,diagnostic.code,diagnostic.status)}</p>
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
