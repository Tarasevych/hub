// Instellingen → «Способи входу» / «Aanmeldmethoden»: één pagina zoals bij GitHub (RUNBOOK-VEILIGE-UITROL.md §13).
// Secties: e-mail en Google (alleen lezen), passkeys, tweefactorauthenticatie (TOTP; geen sms), herstelcodes.
// De tabbladen «Безпека» en «Відновлення» tonen dezelfde pagina, gescrold naar hun sectie.
// Elke methode is een rij: icoon, titel, statusregel en rechts één knop (Керувати / Додати passkey / Налаштувати), zoals GitHub.
// Uitleg staat in een (?) naast elke titel (InfoTip), niet als lopende tekst; elke rij is titel + één statusregel + knop.
// Passkeys staan op één plek (onder «Вхід»); onder 2FA alleen de authenticator-app en herstelcodes plus één regel dat
// passkeys ook als bevestiging tellen. De paginakop zelf komt van SettingsCenterView (geen tweede kop hier).
// Bevestigen (step-up) gebeurt in het venster «Підтвердіть доступ» (src/platform/bevestig-toegang.tsx), nooit met prompt/alert.
import {useEffect} from 'react';
import {Check,Copy,ExternalLink,Fingerprint,KeyRound,Mail,Pencil,Plus,RefreshCw,Smartphone,Trash2,X} from 'lucide-react';
import {InfoTip} from './InfoTip';
import {useState} from 'react';
import type {Lang} from './access-plane-copy';
import {PasskeysSection} from './PasskeysSection';

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
  recoverySaved:()=>Promise<void>;
};

const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;
const datum=(lang:Lang,ms?:number)=>ms?new Date(ms).toLocaleDateString(lang==='uk'?'uk-UA':'nl-BE',{dateStyle:'medium'}):'';
const statusTone=(status:string)=>status==='loading'?'muted':status==='active'?'good':status==='ready'?'info':status==='disabled'||status==='not_configured'?'muted':'warn';
const statusLabel=(lang:Lang,status:string)=>({
  loading:tr(lang,'Завантаження…','Laden…'),
  active:tr(lang,'Активний','Actief'),
  ready:tr(lang,'Готовий, не увімкнено','Klaar, niet ingeschakeld'),
  not_configured:tr(lang,'Не налаштовано','Niet geconfigureerd'),
  disabled:tr(lang,'Вимкнено','Uitgeschakeld'),
  not_enrolled:tr(lang,'Не додано','Niet toegevoegd')
} as Record<string,string>)[status]||status;

const SECTIE:Record<string,string>={security:'aanmeldmethoden-2fa',recovery:'aanmeldmethoden-herstel'};

export function AccessPlanePanels(p:Props){
  const {tab,lang,data,busy,notice,password,setPassword,code,setCode,recovery,write}=p;
  const[wachtwoordOpen,setWachtwoordOpen]=useState(false);
  const totp=data.factors.find(item=>item.id==='totp');
  const recoveryFactor=data.factors.find(item=>item.id==='recovery');
  const passwordMethod=data.methods.find(item=>item.id==='password');
  const googleMethod=data.methods.find(item=>item.id==='google');
  const googleBinding=data.bindings.find(item=>item.method==='google');
  const laden=totp?.status==='loading';

  useEffect(()=>{const id=SECTIE[tab];if(id)window.setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}),60);},[tab]);

  const codeVeld=<input inputMode='numeric' autoComplete='one-time-code' autoFocus value={code} onChange={event=>setCode(event.target.value.replace(/\D+/g,''))} placeholder={tr(lang,'6-значний код','6-cijferige code')} maxLength={6}/>;

  return <div className='access-plane'>
    {notice&&<p className='access-plane-notice'>{notice}</p>}

    <section className='access-plane-section' id='aanmeldmethoden-google' data-access-section='google'>
      <header className='access-plane-section-head'><h2>{tr(lang,'Вхід','Aanmelden')}</h2>
        <InfoTip label={tr(lang,'Про способи входу','Over aanmeldmethoden')}><p>{tr(lang,'Способи, якими ви входите в Mijn Ruimte, і ключі для підтвердження важливих дій.','Manieren waarop je je aanmeldt bij Mijn Ruimte, en sleutels om belangrijke acties te bevestigen.')}</p>
          {data.lockout.protected&&<p data-google-enige>{tr(lang,'Google — зараз ваш єдиний спосіб входу, тому його не можна вимкнути. Passkey поки що лише підтверджує важливі дії.','Google is nu je enige aanmeldmethode en kan daarom niet worden uitgeschakeld. Een passkey bevestigt voorlopig alleen belangrijke acties.')}</p>}</InfoTip></header>
      <div className='access-plane-box'>
        {googleMethod&&<div className='access-plane-row' data-access-method='google'>
          <Mail className='access-plane-row-icon'/>
          <div className='access-plane-row-main'>
            <span className='access-plane-row-title'><strong>{tr(lang,'Електронна пошта та Google','E-mail en Google')}</strong>
              <InfoTip label={tr(lang,'Про вхід через Google','Over aanmelden met Google')}><p>{tr(lang,'Вхід через Google-акаунт. Адресу можна змінити лише в Google.','Aanmelden met je Google-account. Het adres wijzigen kan alleen bij Google.')}</p></InfoTip>
              <span className={`access-plane-badge tone-${statusTone(googleMethod.status)}`}>{statusLabel(lang,googleMethod.status)}</span></span>
            <small>{googleBinding?.email||tr(lang,'Google-акаунт','Google-account')}{data.lockout.protected?` · ${tr(lang,'єдиний спосіб входу','enige aanmeldmethode')}`:''}</small>
          </div>
          <div className='access-plane-row-actions'>
            <a className='access-plane-button secondary' href='https://myaccount.google.com/security' target='_blank' rel='noopener noreferrer'><ExternalLink/>{tr(lang,'Керувати','Beheren')}</a>
          </div>
        </div>}
        {passwordMethod&&(passwordMethod.bound||data.password.configured)&&<div className='access-plane-row' data-access-method='password'>
          <KeyRound className='access-plane-row-icon'/>
          <div className='access-plane-row-main'>
            <span className='access-plane-row-title'><strong>{tr(lang,'Пароль','Wachtwoord')}</strong><span className={`access-plane-badge tone-${statusTone(passwordMethod.status)}`}>{statusLabel(lang,passwordMethod.status)}</span></span>
            {data.password.mustChange&&<small className='access-plane-warn'>{tr(lang,'Тимчасовий пароль — потрібно змінити','Tijdelijk wachtwoord — wijzigen vereist')}</small>}
            {wachtwoordOpen&&<div className='access-plane-inline-form'>
              <input type='password' autoComplete='new-password' autoFocus value={password} onChange={event=>setPassword(event.target.value)} placeholder={tr(lang,'Новий пароль, мін. 10 символів','Nieuw wachtwoord, min. 10 tekens')} minLength={10}/>
              <button type='button' disabled={busy||password.length<10} onClick={()=>void write('/api/owner/access/password/set',{password})}><Check/>{tr(lang,'Зберегти','Opslaan')}</button>
              <button type='button' className='secondary' disabled={busy||data.lockout.protected} onClick={()=>void write('/api/owner/access/password/remove')}><Trash2/>{tr(lang,'Прибрати пароль','Wachtwoord verwijderen')}</button>
            </div>}
          </div>
          <div className='access-plane-row-actions'>
            <button type='button' className='secondary' onClick={()=>setWachtwoordOpen(v=>!v)}>{wachtwoordOpen?<X/>:<Pencil/>}{wachtwoordOpen?tr(lang,'Закрити','Sluiten'):tr(lang,'Керувати','Beheren')}</button>
          </div>
        </div>}
        <PasskeysSection lang={lang} context={p.context} onChange={()=>void p.load()}/>
      </div>
    </section>

    <section className='access-plane-section' id='aanmeldmethoden-2fa' data-access-section='2fa'>
      <header className='access-plane-section-head'><h2>{tr(lang,'Двофакторна автентифікація','Tweefactorauthenticatie')}</h2>
        <InfoTip label={tr(lang,'Про двофакторну автентифікацію','Over tweefactorauthenticatie')}><p>{tr(lang,'Для важливих дій ми просимо підтвердження: passkey, код із застосунку-автентифікатора, код відновлення або повторний вхід у Google. SMS не використовуємо.','Voor belangrijke acties vragen we een bevestiging: passkey, code uit de authenticator-app, herstelcode of opnieuw inloggen bij Google. Sms gebruiken we niet.')}</p></InfoTip></header>
      <p className='access-plane-hint-line' data-passkeys-tellen><Fingerprint/>{tr(lang,'Passkey (див. «Вхід») теж підходять для підтвердження.','Passkeys (zie «Aanmelden») tellen ook als bevestiging.')}</p>
      <div className='access-plane-box'>
        {totp&&<div className='access-plane-row' data-access-factor='totp'>
          <Smartphone className='access-plane-row-icon'/>
          <div className='access-plane-row-main'>
            <span className='access-plane-row-title'><strong>{tr(lang,'Застосунок-автентифікатор','Authenticator-app')}</strong>
              <InfoTip label={tr(lang,'Про застосунок-автентифікатор','Over de authenticator-app')}><p>{tr(lang,'6-значні коди із застосунку на кшталт Google Authenticator, Microsoft Authenticator або 1Password.','6-cijferige codes uit een app zoals Google Authenticator, Microsoft Authenticator of 1Password.')}</p></InfoTip><span className={`access-plane-badge tone-${laden?'muted':totp.enrolled?'good':'muted'}`}>{laden?statusLabel(lang,'loading'):totp.enrolled?tr(lang,'Налаштовано','Ingesteld'):tr(lang,'Не налаштовано','Niet ingesteld')}</span></span>
            <small>{totp.enrolled?tr(lang,'Коди з вашого застосунку','Codes uit je app'):tr(lang,'Коди з телефону без SMS','Codes op je telefoon, zonder sms')}</small>
          </div>
          <div className='access-plane-row-actions'>
            {!totp.enrolled&&!p.otpauth&&<button type='button' className='secondary' disabled={busy||laden} onClick={()=>void write('/api/owner/access/totp/start')}><Plus/>{tr(lang,'Налаштувати','Instellen')}</button>}
            {totp.enrolled&&<button type='button' className='secondary' disabled={busy} onClick={()=>void p.totpUitschakelen()}><Trash2/>{tr(lang,'Вимкнути','Uitschakelen')}</button>}
          </div>
        </div>}
        {p.otpauth&&!totp?.enrolled&&<div className='access-plane-subrow access-plane-totp-setup'>
          <strong>{tr(lang,'Додайте ключ у застосунок-автентифікатор і введіть код','Voeg de sleutel toe in de authenticator-app en voer de code in')}</strong>
          <code className='access-plane-mono access-plane-secret'>{p.secret}</code>
          <small>{tr(lang,'Ключ показано один раз.','De sleutel wordt eenmalig getoond.')}</small>
          <div className='access-plane-inline-form'>
            {codeVeld}
            <button type='button' disabled={busy||code.length!==6} onClick={()=>void write('/api/owner/access/totp/confirm',{code})}><Check/>{tr(lang,'Підтвердити','Bevestigen')}</button>
          </div>
        </div>}
      </div>
    </section>

    <section className='access-plane-section' id='aanmeldmethoden-herstel' data-access-section='recovery'>
      <header className='access-plane-section-head'><h2>{tr(lang,'Коди відновлення','Herstelcodes')}</h2>
        <InfoTip label={tr(lang,'Про коди відновлення','Over herstelcodes')}><p>{tr(lang,'Одноразові коди на випадок, якщо ви втратите телефон. Зберігайте їх окремо (папір, менеджер паролів).','Eenmalige codes voor als je je telefoon kwijt bent. Bewaar ze apart (papier, wachtwoordmanager).')}</p><p>{tr(lang,'Нові коди замінюють старі. Для цього потрібне підтвердження.','Nieuwe codes vervangen de oude. Daarvoor is een bevestiging nodig.')}</p></InfoTip></header>
      <div className='access-plane-box'>
        {recoveryFactor&&<div className='access-plane-row' data-access-factor='recovery'>
          <RefreshCw className='access-plane-row-icon'/>
          <div className='access-plane-row-main'>
            <span className='access-plane-row-title'><strong>{recoveryFactor.enrolled?tr(lang,`Залишилось кодів: ${recoveryFactor.remaining||0}`,`Resterende codes: ${recoveryFactor.remaining||0}`):tr(lang,'Кодів ще немає','Nog geen codes')}</strong>
              {recoveryFactor.enrolled&&<span className={`access-plane-badge tone-${recoveryFactor.bekekenOp?'good':'warn'}`}>{recoveryFactor.bekekenOp?tr(lang,'Збережено ','Bewaard ')+datum(lang,recoveryFactor.bekekenOp):tr(lang,'Не позначено як збережені','Niet als bewaard gemarkeerd')}</span>}</span>
            <small>{recoveryFactor.createdAt?`${tr(lang,'Створено ','Gemaakt ')}${datum(lang,recoveryFactor.createdAt)}`:tr(lang,'Резерв, якщо втратите телефон','Reserve voor als je je telefoon kwijt bent')}</small>
          </div>
          <div className='access-plane-row-actions'>
            <button type='button' className='secondary' disabled={busy||laden} onClick={()=>void p.nieuweHerstelcodes()}><RefreshCw/>{recoveryFactor.enrolled?tr(lang,'Створити нові','Nieuwe maken'):tr(lang,'Створити коди','Codes maken')}</button>
          </div>
        </div>}
        {recovery.length>0&&<div className='access-plane-subrow access-plane-recovery-codes'>
          <strong>{tr(lang,'Нові коди відновлення — збережіть їх зараз','Nieuwe herstelcodes — bewaar ze nu')}</strong>
          <small>{tr(lang,'Показано лише один раз. Кожен код діє один раз.','Wordt maar één keer getoond. Elke code werkt één keer.')}</small>
          <ul className='access-plane-code-list'>{recovery.map(item=><li key={item} className='access-plane-mono'>{item}</li>)}</ul>
          <div className='access-plane-actions'>
            <button type='button' className='secondary' onClick={()=>void navigator.clipboard?.writeText(recovery.join('\n'))}><Copy/>{tr(lang,'Копіювати всі','Alles kopiëren')}</button>
            <button type='button' disabled={busy} onClick={()=>void p.recoverySaved()}><Check/>{tr(lang,'Я зберіг коди','Ik heb de codes bewaard')}</button>
          </div>
        </div>}
        {p.tempPassword&&<div className='access-plane-subrow access-plane-recovery-codes'><strong>{tr(lang,'Тимчасовий пароль','Tijdelijk wachtwoord')}</strong><code className='access-plane-mono'>{p.tempPassword}</code></div>}
      </div>
    </section>
  </div>;
}
