// Instellingen → «Способи входу» / «Aanmeldmethoden»: één pagina zoals bij GitHub (RUNBOOK-VEILIGE-UITROL.md §13).
// Secties: e-mail en Google (alleen lezen), passkeys, tweefactorauthenticatie (TOTP; geen sms), herstelcodes.
// De tabbladen «Безпека» en «Відновлення» tonen dezelfde pagina, gescrold naar hun sectie.
// Elke methode is een rij: icoon, titel, statusregel en rechts één knop (Керувати / Додати passkey / Налаштувати), zoals GitHub.
// Uitleg staat in een (?) naast elke titel (InfoTip), niet als lopende tekst; elke rij is titel + één statusregel + knop.
// Passkeys staan op één plek (onder «Вхід»); onder 2FA alleen de authenticator-app en herstelcodes plus één regel dat
// passkeys ook als bevestiging tellen. De paginakop zelf komt van SettingsCenterView (geen tweede kop hier).
// Bevestigen (step-up) gebeurt in het venster «Підтвердіть доступ» (src/platform/bevestig-toegang.tsx), nooit met prompt/alert.
import {lazy,Suspense,useEffect} from 'react';
import {BevestigDialoog} from './platform/BevestigDialoog'; // IDENTITEIT-013
import {verborgenVoorAi} from './menselijke-actie'; // SEC-002 extensie-09 (g10a-3): eenmalige geheimen leest de AI-extensie niet
import {Check,ExternalLink,Fingerprint,KeyRound,Mail,Pencil,Plus,RefreshCw,Smartphone,Trash2,X} from 'lucide-react';
import {InfoTip} from './InfoTip';
import {useState} from 'react';
import type {Lang} from './toegangslaag-teksten';
import {PasskeysSection} from './ToegangssleutelsSectie';
import {HerstelcodesSectie} from './HerstelcodesSectie';
import {SleutelkluisSectie} from './SleutelkluisSectie';
import {ToegangWijziging,wijzigingUitUrl} from './ToegangWijziging';
import {Toegangscodes} from './Toegangscodes';
import GeheimInvoer from './geheim/GeheimInvoer';
import {Qr} from './platform/Qr'; // IDENTITEIT-014: спільний QR (data-ai-verborgen всередині)
import {ReserveOverzicht} from './herstel/ReserveOverzicht'; // IDENTITEIT-014: огляд резерву (herstel-overzicht)
import {Scenarios} from './herstel/Scenarios'; // IDENTITEIT-014: сценарії й наслідки втрати ключа (herstel-scenarios, herstel-sleutelverlies)
import type {HerstelSectie} from './herstel/reserve';
const AanbiederCatalogus=lazy(()=>import('./aanmeld-vnext/onderdelen/CatalogusMetStijl')); /* IDENTITEIT-014: лише в розділі «Вхід» */
const AndereMethoden=lazy(()=>import('./AndereAanmeldMethodenLaden')); /* IDENTITEIT-014: Telegram і розміщення; модуль конфігу читає window під час завантаження */

type Method={id:string;kind?:string;enabled:boolean;configured:boolean;bound?:boolean;status:string;honest?:string};
type Factor={id:string;enabled:boolean;enrolled:boolean;status:string;honest?:string;remaining?:number;phone?:string;count?:number;createdAt?:number;bekekenOp?:number};
type Binding={id:string;method:string;email:string;status:string;providerSubject?:string;lastUsedAt?:number};
type Snapshot={
  architecture:string;
  contour:{clientId:string;redirectUri:string;credentialsConfigured:boolean;source:string;hasVaultOverride:boolean;hasPlatformSecret:boolean;missing:string[];lockProtected:boolean;updatedAt:number};
  policy:{enabled:Record<string,boolean>;mfa:'optional'|'required'};
  methods:Method[];
  factors:Factor[];
  bindings:Binding[];
  usableCount:number;
  lockout:{protected:boolean;reason:string};
  password:{configured:boolean;mustChange:boolean};
  totp:{enrolled:boolean};
  admin?:boolean;
};

type Props={
  tab:string;
  alleen?:'methods'|'security'|'recovery';
  lang:Lang;
  data:Snapshot;
  busy:boolean;
  notice:string;
  password:string;
  setPassword:(value:string)=>void;
  otpauth:string;
  secret:string;
  code:string;
  setCode:(value:string)=>void;
  recovery:string[];
  tempPassword:string;
  context:Record<string,unknown>;
  write:(route:string,payload?:Record<string,unknown>)=>Promise<void>;
  load:()=>Promise<void>;
  nieuweHerstelcodes:()=>Promise<void>;
  totpUitschakelen:()=>Promise<void>;
  /** IDENTITEIT-014: bevestigde authenticator vervangen (totp/start met de huidige code). Ontbreekt → geen knop «Замінити». */
  totpVervangen?:()=>Promise<void>;
  /** Lopende vervanging van het scherm halen (de oude authenticator blijft gelden). */
  totpVervangenStoppen?:()=>void;
  /** De volledige TelegramSectie staat op deze pagina → hier alleen een verwijzing ernaar, geen tweede stand. */
  telegramSectie?:boolean;
  recoverySaved:()=>Promise<void>;
  /** IDENTITEIT-014: перехід до іншого розділу облікового запису (огляд і сценарії відновлення). Немає → прокрутка в межах панелі. */
  onKies?:(sectie:HerstelSectie)=>void;
};

const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
const statusTone=(status:string)=>status==='loading'?'muted':status==='active'?'good':status==='ready'?'info':status==='disabled'||status==='not_configured'?'muted':'warn';
const statusLabel=(lang:Lang,status:string)=>({
  loading:tr(lang,'Завантаження…','Laden…'),
  active:tr(lang,'Активний','Actief'),
  ready:tr(lang,'Готовий, не увімкнено','Klaar, niet ingeschakeld'),
  not_configured:tr(lang,'Не налаштовано','Niet geconfigureerd'),
  disabled:tr(lang,'Вимкнено','Uitgeschakeld'),
  not_enrolled:tr(lang,'Не додано','Niet toegevoegd')
} as Record<string,string>)[status]||status;

// ID-02: één pagina voor Способи входу / Безпека / Відновлення — elk tabblad scrolt naar ZIJN onderdeel en licht het even op (ook als het
// adres direct wordt geopend, en opnieuw zodra de gegevens binnen zijn, want dan verschuift de pagina).
const SECTIE:Record<string,string>={methods:'aanmeldmethoden-google',security:'aanmeldmethoden-2fa',recovery:'aanmeldmethoden-herstel'};
export const naarSectie=(tab:string,doc:Pick<Document,'getElementById'|'querySelectorAll'>=document):string=>{const id=SECTIE[tab];if(!id)return '';const el=doc.getElementById(id);if(!el)return '';for(const x of Array.from(doc.querySelectorAll('[data-access-actief]')))x.removeAttribute('data-access-actief');el.setAttribute('data-access-actief','1');/* Ingebed in de accountpagina (.ia-inline): de pagina kiest zelf het onderdeel; anders sprongen alle drie panelen tegelijk naar hun sectie en eindigde de pagina onderaan. */if(!(el as Element).closest?.('.ia-inline'))try{el.scrollIntoView({behavior:'smooth',block:'start'})}catch{/* geen scroll */}try{(el as HTMLElement).focus?.({preventScroll:true})}catch{/* geen focus */}return id};

// IDENTITEIT-014: межі пароля — ті самі, що на сервері (backend/toegangslaag.ts, POST /api/owner/access/password/set).
export const WACHTWOORD_MIN=10,WACHTWOORD_MAX=1024;
export function AccessPlanePanels(p:Props){
  const {tab,lang,data,busy,notice,password,setPassword,code,setCode,recovery,write}=p;
  const[wachtwoordOpen,setWachtwoordOpen]=useState(false);
  const[wachtwoordWeg,setWachtwoordWeg]=useState(false); /* IDENTITEIT-013: прибирання пароля — через діалог підтвердження */
  const[vervangVraag,setVervangVraag]=useState(false); /* IDENTITEIT-014: заміна автентифікатора — спершу діалог із наслідками */
  const[mfaVraag,setMfaVraag]=useState<''|'required'|'optional'>(''); /* IDENTITEIT-015: правило «другий крок під час входу» — спершу діалог із наслідками */
  const totp=data.factors.find(item=>item.id==='totp');
  const passwordMethod=data.methods.find(item=>item.id==='password');
  const googleMethod=data.methods.find(item=>item.id==='google');
  const googleBinding=data.bindings.find(item=>item.method==='google');
  const laden=totp?.status==='loading';
  // IDENTITEIT-014: рядок пароля є завжди (на нього веде жива карта); без пароля він пропонує «Задати пароль».
  const heeftWachtwoord=Boolean(data.password.configured||passwordMethod?.bound);
  const wachtwoordStatus=passwordMethod?.status||(laden?'loading':'not_configured');
  const wachtwoordUit=!heeftWachtwoord&&wachtwoordStatus==='disabled';
  const sterkAanwezig=data.factors.some(f=>['totp','passkey','recovery'].includes(f.id)&&f.enrolled);
  const wachtwoordGeldig=password.length>=WACHTWOORD_MIN&&password.length<=WACHTWOORD_MAX;
  useEffect(()=>{setWachtwoordOpen(false);},[heeftWachtwoord]); /* пароль щойно задано або прибрано — форму закрито */
  const vervanging=Boolean(totp?.enrolled&&p.otpauth&&p.totpVervangen);
  // Link uit de melding «Це були ви?»: ?wijziging=<id> → paneel bovenaan (§13.10). Na terugdraaien de passkeys opnieuw laden.
  const[wijziging]=useState(wijzigingUitUrl);
  const[vernieuw,setVernieuw]=useState(0);
  const toonMethoden=!p.alleen||p.alleen==='methods';
  const toonBeveiliging=!p.alleen||p.alleen==='security';
  const toonHerstel=!p.alleen||p.alleen==='recovery';
  // IDENTITEIT-014: перехід з огляду/сценаріїв. Без onKies (окрема сторінка налаштувань) — прокрутка до розділу на цій же сторінці.
  const kies=(sectie:HerstelSectie)=>{if(p.onKies)p.onKies(sectie);else naarSectie(sectie);};

  const geladen=!!(data as {loaded?:boolean}).loaded||data.factors.some(f=>f.status!=='loading');
  useEffect(()=>{const t1=window.setTimeout(()=>naarSectie(tab),60),t2=window.setTimeout(()=>naarSectie(tab),450);return()=>{window.clearTimeout(t1);window.clearTimeout(t2)};},[tab,geladen]);

  const codeVeld=<input inputMode='numeric' autoComplete='one-time-code' autoFocus value={code} onChange={event=>setCode(event.target.value.replace(/\D+/g,''))} placeholder={tr(lang,'6-значний код','6-cijferige code')} maxLength={6}/>;

  return <div className='access-plane'>
    <BevestigDialoog open={wachtwoordWeg} id='wachtwoord-verwijderen' lang={lang} gevaarlijk bezig={busy}
      titel={tr(lang,'Прибрати пароль?','Wachtwoord verwijderen?')}
      uitleg={tr(lang,'Пароль перестане діяти. Повернути його можна протягом 7 днів у цьому ж розділі.','Het wachtwoord werkt dan niet meer. Terugzetten kan binnen 7 dagen in dit onderdeel.')}
      gevolgen={[tr(lang,'Вхід через Google та інші способи не зміняться.','Aanmelden via Google en andere methoden verandert niet.'),tr(lang,'Сайт може попросити підтвердити доступ перед прибиранням.','De site kan eerst om bevestiging van toegang vragen.')]}
      bevestigTekst={tr(lang,'Так, прибрати','Ja, verwijderen')}
      onAnnuleer={()=>setWachtwoordWeg(false)}
      onBevestig={async()=>{setWachtwoordWeg(false);await write('/api/owner/access/password/remove');}}/>
    {/* IDENTITEIT-015 (етап 1.4): власник сайту вмикає або вимикає правило; сервер застосовує його під час кожного входу. */}
    <BevestigDialoog open={!!mfaVraag} id='mfa-beleid' lang={lang} gevaarlijk={mfaVraag==='optional'} bezig={busy}
      titel={mfaVraag==='required'?tr(lang,'Зробити другий крок входу обов’язковим?','De tweede aanmeldstap verplicht maken?'):tr(lang,'Скасувати обов’язковий другий крок?','De verplichte tweede stap uitzetten?')}
      uitleg={mfaVraag==='required'?tr(lang,'Після Google кожен, хто має код із застосунку або ключ доступу, підтверджуватиме вхід ним. Без підтвердження сайт не покаже жодних даних.','Na Google bevestigt iedereen met een app-code of passkey de aanmelding daarmee. Zonder bevestiging toont de site geen gegevens.'):tr(lang,'Після Google сеанс знову відкриватиметься без коду. Вхід стане слабшим: викрадений пароль Google знову дасть повний доступ.','Na Google opent de sessie weer zonder code. Aanmelden wordt zwakker: een gestolen Google-wachtwoord geeft weer volledige toegang.')}
      gevolgen={mfaVraag==='required'?[tr(lang,'Ваш поточний вхід теж попросить код або ключ одразу після збереження.','Ook uw huidige aanmelding vraagt meteen na het opslaan om een code of sleutel.'),tr(lang,'Запасний шлях — невикористаний код відновлення.','Reserve: een ongebruikte herstelcode.'),tr(lang,'Хто ще не має другого чинника, входить як раніше, доки його не додасть.','Wie nog geen tweede factor heeft, meldt aan zoals voorheen tot hij er een toevoegt.')]:[tr(lang,'Другий чинник і далі потрібен для важливих дій.','De tweede factor blijft nodig voor belangrijke acties.')]}
      bevestigTekst={mfaVraag==='required'?tr(lang,'Так, увімкнути','Ja, inschakelen'):tr(lang,'Так, вимкнути','Ja, uitschakelen')}
      onAnnuleer={()=>setMfaVraag('')}
      onBevestig={async()=>{const mfa=mfaVraag;setMfaVraag('');await write('/api/owner/access/policy/save',{mfa,enabled:{}});}}/>
    <BevestigDialoog open={vervangVraag} id='totp-vervangen' lang={lang} gevaarlijk bezig={busy}
      titel={tr(lang,'Замінити автентифікатор?','Authenticator vervangen?')}
      uitleg={tr(lang,'Ви додасте новий ключ у застосунок-автентифікатор, наприклад на новому телефоні. Спершу сайт попросить чинний код зі старого застосунку або код відновлення, потім — ще одне сильне підтвердження доступу.','U voegt een nieuwe sleutel toe in de authenticator-app, bijvoorbeeld op een nieuwe telefoon. Eerst vraagt de site een geldige code uit de oude app of een herstelcode, daarna nog een sterke bevestiging van toegang.')}
      gevolgen={[
        tr(lang,'Коди зі старого застосунку діятимуть, доки ви не підтвердите новий (щонайбільше 15 хвилин).','Codes uit de oude app blijven werken tot u de nieuwe bevestigt (hoogstens 15 minuten).'),
        tr(lang,'Після підтвердження буде створено нові коди відновлення, а старі перестануть діяти.','Na bevestiging worden nieuwe herstelcodes gemaakt en werken de oude niet meer.'),
        tr(lang,'Для другого підтвердження оберіть passkey або код відновлення: той самий код із застосунку двічі не приймається.','Kies voor de tweede bevestiging een passkey of herstelcode: dezelfde app-code wordt geen twee keer aanvaard.'),
      ]}
      bevestigTekst={tr(lang,'Так, замінити','Ja, vervangen')}
      onAnnuleer={()=>setVervangVraag(false)}
      onBevestig={async()=>{setVervangVraag(false);await p.totpVervangen?.();}}/>
    {notice&&<p className='access-plane-notice'>{notice}</p>}
    {wijziging&&<ToegangWijziging lang={lang} context={p.context} id={wijziging} onChange={()=>{setVernieuw(v=>v+1);void p.load();}}/>}

    {toonMethoden&&<section className='access-plane-section' id='aanmeldmethoden-google' data-access-section='google' tabIndex={-1}>
      <header className='access-plane-section-head'><h2>{tr(lang,'Вхід','Aanmelden')}</h2>
        <InfoTip label={tr(lang,'Про способи входу','Over aanmeldmethoden')}><p>{tr(lang,'Способи, якими ви входите в Mijn Ruimte, і ключі для підтвердження важливих дій.','Manieren waarop je je aanmeldt bij Mijn Ruimte, en sleutels om belangrijke acties te bevestigen.')}</p>
          {data.lockout.protected&&<p data-google-enige>{tr(lang,'Google — зараз ваш єдиний спосіб входу, тому його не можна вимкнути. Passkey поки що лише підтверджує важливі дії.','Google is nu je enige aanmeldmethode en kan daarom niet worden uitgeschakeld. Een passkey bevestigt voorlopig alleen belangrijke acties.')}</p>}
          <p><b>{tr(lang,'Електронна пошта та Google.','E-mail en Google.')}</b> {tr(lang,'Вхід через Google-акаунт. Адресу можна змінити лише в Google.','Aanmelden met je Google-account. Het adres wijzigen kan alleen bij Google.')}</p></InfoTip></header>
      <div className='access-plane-box'>
        {googleMethod&&<div className='access-plane-row' data-access-method='google'>
          <Mail className='access-plane-row-icon'/>
          <div className='access-plane-row-main'>
            <span className='access-plane-row-title'><strong>{tr(lang,'Електронна пошта та Google','E-mail en Google')}</strong>
              <span className={`access-plane-badge tone-${statusTone(googleMethod.status)}`}>{statusLabel(lang,googleMethod.status)}</span></span>
            <small>{googleBinding?.email||tr(lang,'Google-акаунт','Google-account')}{data.lockout.protected?` · ${tr(lang,'єдиний спосіб входу','enige aanmeldmethode')}`:''}</small>
          </div>
          <div className='access-plane-row-actions'>
            <a className='access-plane-button secondary' href='https://myaccount.google.com/security' target='_blank' rel='noopener noreferrer'><ExternalLink/>{tr(lang,'Керувати','Beheren')}</a>
          </div>
        </div>}
        {/* IDENTITEIT-014: рядок пароля існує завжди (id для живої карти); без пароля — форма «Задати пароль» з тими самими межами, що на сервері.
            Підтвердження доступу (сильне: passkey, код застосунку або код відновлення) просить client.ts на 403 і повторює запит. */}
        <div className='access-plane-row' id='aanmeldmethoden-wachtwoord' data-access-method='password' data-wachtwoord={heeftWachtwoord?'ingesteld':wachtwoordUit?'uit':'geen'} tabIndex={-1}>
          <KeyRound className='access-plane-row-icon'/>
          <div className='access-plane-row-main'>
            <span className='access-plane-row-title'><strong>{tr(lang,'Пароль','Wachtwoord')}</strong><span className={`access-plane-badge tone-${statusTone(wachtwoordStatus)}`}>{statusLabel(lang,wachtwoordStatus)}</span></span>
            {data.password.mustChange&&<small className='access-plane-warn'>{tr(lang,'Тимчасовий пароль — потрібно змінити','Tijdelijk wachtwoord — wijzigen vereist')}</small>}
            {!heeftWachtwoord&&!laden&&<small data-wachtwoord-uitleg>{wachtwoordUit
              ?tr(lang,'Вхід паролем вимкнув власник сайту, тож задати пароль зараз не можна.','De eigenaar van de site heeft aanmelden met een wachtwoord uitgezet; een wachtwoord instellen kan nu niet.')
              :tr(lang,'Пароля немає. Якщо задати його, з’явиться ще один спосіб входу — на випадок, коли Google недоступний.','Er is geen wachtwoord. Stelt u er een in, dan krijgt u een extra manier om aan te melden — voor als Google niet beschikbaar is.')}</small>}
            {wachtwoordOpen&&!wachtwoordUit&&<div className='access-plane-inline-form'>
              {!heeftWachtwoord&&!sterkAanwezig&&<small className='access-plane-warn' data-wachtwoord-sterk-nodig>{tr(lang,'Перед збереженням сайт попросить сильне підтвердження: passkey, код із застосунку або код відновлення. Якщо жодного ще немає, спершу додайте passkey або автентифікатор у розділі «Безпека».','Voor het opslaan vraagt de site een sterke bevestiging: passkey, app-code of herstelcode. Heeft u er nog geen, voeg dan eerst een passkey of authenticator toe bij «Beveiliging».')}</small>}
              <GeheimInvoer lang={lang} value={password} onChange={setPassword} autoComplete='new-password' autoFocus placeholder={heeftWachtwoord?tr(lang,'Новий пароль, мін. 10 символів','Nieuw wachtwoord, min. 10 tekens'):tr(lang,'Пароль: від 10 до 1024 символів','Wachtwoord: 10 tot 1024 tekens')} minLength={WACHTWOORD_MIN} max={WACHTWOORD_MAX} soort='wachtwoord'/>
              <button type='button' disabled={busy||!wachtwoordGeldig} onClick={()=>void write('/api/owner/access/password/set',{password})}><Check/>{tr(lang,'Зберегти','Opslaan')}</button>
              {heeftWachtwoord&&<button type='button' className='secondary' disabled={busy||data.lockout.protected} onClick={()=>setWachtwoordWeg(true)}><Trash2/>{tr(lang,'Прибрати пароль','Wachtwoord verwijderen')}</button>}
            </div>}
          </div>
          <div className='access-plane-row-actions'>
            {!wachtwoordUit&&<button type='button' className='secondary' disabled={laden} data-wachtwoord-knop onClick={()=>setWachtwoordOpen(v=>!v)}>{wachtwoordOpen?<X/>:heeftWachtwoord?<Pencil/>:<Plus/>}{wachtwoordOpen?tr(lang,'Закрити','Sluiten'):heeftWachtwoord?tr(lang,'Керувати','Beheren'):tr(lang,'Задати пароль','Wachtwoord instellen')}</button>}
          </div>
        </div>
      </div>
      {/* IDENTITEIT-011: ключі доступу живуть у «Безпеці» (як у карті розвитку); тут лише перехід, щоб їх не дублювати. */}
      {/* IDENTITEIT-014: інші способи входу — стан Telegram, перехід власника до розміщення і чесний каталог провайдерів. */}
      <div className='access-plane-catalogus' id='aanmeldmethoden-catalogus' data-aanmeld-catalogus tabIndex={-1}>
        <Suspense fallback={null}><AndereMethoden lang={lang} admin={!!data.admin} telegramSectie={!!p.telegramSectie}/></Suspense>
        {/* IDENTITEIT-014 (herstel): каталог з назвами серверних ключів і самотестом — лише власнику сайту (data.admin); Telegram у ньому
            не повторюємо — його живий стан уже є в рядку вище і в розділі «Telegram» (інакше статична плитка «Потрібні ключі» суперечила «Працює»). */}
        {data.admin&&<div className='amv'><Suspense fallback={null}><AanbiederCatalogus lang={lang} context={p.context} zonder={['telegram']}/></Suspense></div>}
      </div>
      {!toonBeveiliging&&<p className='access-plane-hint-line' data-passkeys-verwijzing><Fingerprint/>{tr(lang,'Ключі доступу (passkey) — у розділі «Безпека».','Toegangssleutels (passkeys) staan bij «Beveiliging».')}</p>}
    </section>}

    {toonBeveiliging&&<section className='access-plane-section' id='aanmeldmethoden-sleutels' data-access-section='sleutels' tabIndex={-1}>
      <header className='access-plane-section-head'><h2>{tr(lang,'Ключі доступу','Toegangssleutels')}</h2></header>
      <div className='access-plane-box'>
        <PasskeysSection key={vernieuw} lang={lang} context={p.context} onChange={()=>void p.load()}/>
      </div>
    </section>}

    {toonBeveiliging&&<section className='access-plane-section' id='aanmeldmethoden-2fa' data-access-section='2fa' tabIndex={-1}>
      <header className='access-plane-section-head'><h2>{tr(lang,'Двофакторна автентифікація','Tweefactorauthenticatie')}</h2>
        <InfoTip label={tr(lang,'Про двофакторну автентифікацію','Over tweefactorauthenticatie')}><p>{tr(lang,'Для важливих дій ми просимо підтвердження: passkey, код із застосунку-автентифікатора, код відновлення або повторний вхід у Google. SMS не використовуємо.','Voor belangrijke acties vragen we een bevestiging: passkey, code uit de authenticator-app, herstelcode of opnieuw inloggen bij Google. Sms gebruiken we niet.')}</p>
          <p><b>{tr(lang,'Застосунок-автентифікатор.','Authenticator-app.')}</b> {tr(lang,'6-значні коди із застосунку на кшталт Google Authenticator, Microsoft Authenticator або 1Password.','6-cijferige codes uit een app zoals Google Authenticator, Microsoft Authenticator of 1Password.')}</p></InfoTip></header>
      <p className='access-plane-hint-line' data-passkeys-tellen><Fingerprint/>{tr(lang,'Passkey (див. «Вхід») теж підходять для підтвердження.','Passkeys (zie «Aanmelden») tellen ook als bevestiging.')}</p>
      <div className='access-plane-box'>
        {totp&&<div className='access-plane-row' data-access-factor='totp'>
          <Smartphone className='access-plane-row-icon'/>
          <div className='access-plane-row-main'>
            <span className='access-plane-row-title'><strong>{tr(lang,'Застосунок-автентифікатор','Authenticator-app')}</strong><span className={`access-plane-badge tone-${laden?'muted':totp.enrolled?'good':'muted'}`}>{laden?statusLabel(lang,'loading'):totp.enrolled?tr(lang,'Налаштовано','Ingesteld'):tr(lang,'Не налаштовано','Niet ingesteld')}</span></span>
            <small>{totp.enrolled?tr(lang,'Коди з вашого застосунку','Codes uit je app'):tr(lang,'Коди з телефону без SMS','Codes op je telefoon, zonder sms')}</small>
          </div>
          <div className='access-plane-row-actions'>
            {!totp.enrolled&&!p.otpauth&&<button type='button' className='secondary' disabled={busy||laden} onClick={()=>void write('/api/owner/access/totp/start')}><Plus/>{tr(lang,'Налаштувати','Instellen')}</button>}
            {totp.enrolled&&p.totpVervangen&&!p.otpauth&&<button type='button' className='secondary' disabled={busy} data-totp-vervangen onClick={()=>setVervangVraag(true)}><RefreshCw/>{tr(lang,'Замінити автентифікатор','Authenticator vervangen')}</button>}
            {totp.enrolled&&<button type='button' className='secondary' disabled={busy} onClick={()=>void p.totpUitschakelen()}><Trash2/>{tr(lang,'Вимкнути','Uitschakelen')}</button>}
          </div>
        </div>}
        {p.otpauth&&(!totp?.enrolled||vervanging)&&<div className='access-plane-subrow access-plane-totp-setup' data-totp-vervanging={vervanging?'1':undefined}>
          <strong>{vervanging?tr(lang,'Новий автентифікатор: додайте ключ у застосунок і введіть код із нього','Nieuwe authenticator: voeg de sleutel toe in de app en voer de code daaruit in'):tr(lang,'Додайте ключ у застосунок-автентифікатор і введіть код','Voeg de sleutel toe in de authenticator-app en voer de code in')}</strong>
          <Qr tekst={p.otpauth} label={tr(lang,'QR-код для застосунку-автентифікатора','QR-code voor de authenticator-app')}/>
          <small>{tr(lang,'Відскануйте QR-код камерою в застосунку-автентифікаторі або введіть ключ нижче вручну.','Scan de QR-code met de camera in de authenticator-app of typ de sleutel hieronder zelf over.')}</small>
          <code className='access-plane-mono access-plane-secret' {...verborgenVoorAi}>{p.secret}</code>
          <small>{tr(lang,'Ключ показано один раз.','De sleutel wordt eenmalig getoond.')}</small>
          {vervanging&&<small data-totp-oud-geldig>{tr(lang,'Старий автентифікатор діє, доки ви не підтвердите новий (щонайбільше 15 хвилин).','De oude authenticator werkt tot u de nieuwe bevestigt (hoogstens 15 minuten).')}</small>}
          <small className='access-plane-warn' data-totp-herstel-waarschuwing>{tr(lang,'Після підтвердження буде створено новий набір кодів відновлення, а старі коди перестануть діяти. Нові коди з’являться тут одразу — збережіть їх.','Na bevestiging wordt een nieuwe set herstelcodes gemaakt en werken de oude niet meer. De nieuwe codes verschijnen hier meteen — bewaar ze.')}</small>
          <div className='access-plane-inline-form'>
            {codeVeld}
            <button type='button' disabled={busy||code.length!==6} onClick={()=>void write('/api/owner/access/totp/confirm',{code})}><Check/>{tr(lang,'Підтвердити','Bevestigen')}</button>
            {vervanging&&p.totpVervangenStoppen&&<button type='button' className='secondary' disabled={busy} onClick={()=>p.totpVervangenStoppen?.()}><X/>{tr(lang,'Скасувати заміну','Vervangen annuleren')}</button>}
          </div>
        </div>}
        {/* IDENTITEIT-015 (етап 1.4): правило «другий крок під час входу». Перемикач — лише власнику сайту; інші бачать, що правило діє. */}
        {(data.admin||data.policy?.mfa==='required')&&<div className='access-plane-subrow' data-mfa-beleid={data.policy?.mfa==='required'?'verplicht':'vrij'}>
          {data.admin?<label className='zijbalk-schakel' data-mfa-beleid-schakel='1'>
            <input type='checkbox' role='switch' checked={data.policy?.mfa==='required'} disabled={busy||laden} onChange={event=>setMfaVraag(event.target.checked?'required':'optional')}/>
            <span className='zijbalk-schakel-spoor' aria-hidden='true'><i/></span>
            <span><strong>{tr(lang,'Обов’язковий другий крок під час входу','Verplichte tweede stap bij aanmelden')}</strong>
            <small>{tr(lang,'Для всіх облікових записів сайту: після Google потрібен код із застосунку або ключ доступу (запасний шлях — код відновлення). Хто не має другого чинника, входить як раніше. Увімкнути можна, лише маючи власний другий чинник.','Voor alle accounts van de site: na Google is een app-code of passkey nodig (reserve: een herstelcode). Wie geen tweede factor heeft, meldt aan zoals voorheen. Inschakelen kan alleen met een eigen tweede factor.')}</small></span>
          </label>:<small>{tr(lang,'Правило сайту: після Google вхід підтверджується кодом із застосунку або ключем доступу.','Regel van de site: na Google wordt de aanmelding bevestigd met een app-code of passkey.')}{!data.factors.some(f=>['totp','passkey'].includes(f.id)&&f.enrolled)?` ${tr(lang,'У вас другого чинника ще немає — додайте автентифікатор, щоб правило захищало й ваш вхід.','U hebt nog geen tweede factor — voeg een authenticator toe zodat de regel ook uw aanmelding beschermt.')}`:''}</small>}
        </div>}
      </div>
    </section>}

    {/* IDENTITEIT-011: нові коди після налаштування автентифікатора видно й у «Безпеці» — раніше вони губилися, бо там немає розділу відновлення. */}
    {/* IDENTITEIT-014: «Відновлення доступу» — огляд резерву перед кодами, сценарії й наслідки втрати ключа після них (лише в цьому розділі). */}
    {toonHerstel&&<ReserveOverzicht lang={lang} context={p.context} data={data} onKies={kies}/>}
    {(toonHerstel||(toonBeveiliging&&recovery.length>0))&&<HerstelcodesSectie lang={lang} context={p.context} codes={recovery} busy={busy} nieuweHerstelcodes={p.nieuweHerstelcodes} recoverySaved={p.recoverySaved} onChange={()=>void p.load()}/>}
    {toonHerstel&&<Scenarios lang={lang} context={p.context} data={data} busy={busy} onKies={kies} totpUitschakelen={p.totpUitschakelen} nieuweHerstelcodes={p.nieuweHerstelcodes}/>}
    {toonBeveiliging&&<SleutelkluisSectie lang={lang} context={p.context}/>}
    {toonBeveiliging&&<Toegangscodes lang={lang} context={p.context}/>}
    {toonHerstel&&p.tempPassword&&<div className='access-plane-subrow access-plane-recovery-codes' {...verborgenVoorAi}><strong>{tr(lang,'Тимчасовий пароль','Tijdelijk wachtwoord')}</strong><code className='access-plane-mono'>{p.tempPassword}</code></div>}
  </div>;
}
