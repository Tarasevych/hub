// Instellingen → «Способи входу» / «Aanmeldmethoden»: één pagina zoals bij GitHub (RUNBOOK-VEILIGE-UITROL.md §13).
// Secties: e-mail en Google (alleen lezen), passkeys, tweefactorauthenticatie (TOTP; geen sms), herstelcodes.
// De tabbladen «Безпека» en «Відновлення» tonen dezelfde pagina, gescrold naar hun sectie.
// Elke methode is een rij: icoon, titel, statusregel en rechts één knop (Керувати / Додати passkey / Налаштувати), zoals GitHub.
// Uitleg staat in een (?) naast elke titel (InfoTip), niet als lopende tekst; elke rij is titel + één statusregel + knop.
// Passkeys staan op één plek (onder «Вхід»); onder 2FA alleen de authenticator-app en herstelcodes plus één regel dat
// passkeys ook als bevestiging tellen. De paginakop zelf komt van SettingsCenterView (geen tweede kop hier).
// Bevestigen (step-up) gebeurt in het venster «Підтвердіть доступ» (src/platform/bevestig-toegang.tsx), nooit met prompt/alert.
import {useEffect} from 'react';
import {verborgenVoorAi} from './menselijke-actie'; // SEC-002 extensie-09 (g10a-3): eenmalige geheimen leest de AI-extensie niet
import {Check,ExternalLink,Fingerprint,KeyRound,Mail,Pencil,Plus,Smartphone,Trash2,X} from 'lucide-react';
import {InfoTip} from './InfoTip';
import {useState} from 'react';
import type {Lang} from './toegangslaag-teksten';
import {PasskeysSection} from './ToegangssleutelsSectie';
import {HerstelcodesSectie} from './HerstelcodesSectie';
import {SleutelkluisSectie} from './SleutelkluisSectie';
import {ToegangWijziging,wijzigingUitUrl} from './ToegangWijziging';
import {Toegangscodes} from './Toegangscodes';
import GeheimInvoer from './geheim/GeheimInvoer';

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
  recoverySaved:()=>Promise<void>;
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

export function AccessPlanePanels(p:Props){
  const {tab,lang,data,busy,notice,password,setPassword,code,setCode,recovery,write}=p;
  const[wachtwoordOpen,setWachtwoordOpen]=useState(false);
  const totp=data.factors.find(item=>item.id==='totp');
  const passwordMethod=data.methods.find(item=>item.id==='password');
  const googleMethod=data.methods.find(item=>item.id==='google');
  const googleBinding=data.bindings.find(item=>item.method==='google');
  const laden=totp?.status==='loading';
  // Link uit de melding «Це були ви?»: ?wijziging=<id> → paneel bovenaan (§13.10). Na terugdraaien de passkeys opnieuw laden.
  const[wijziging]=useState(wijzigingUitUrl);
  const[vernieuw,setVernieuw]=useState(0);
  const toonMethoden=!p.alleen||p.alleen==='methods';
  const toonBeveiliging=!p.alleen||p.alleen==='security';
  const toonHerstel=!p.alleen||p.alleen==='recovery';

  const geladen=!!(data as {loaded?:boolean}).loaded||data.factors.some(f=>f.status!=='loading');
  useEffect(()=>{const t1=window.setTimeout(()=>naarSectie(tab),60),t2=window.setTimeout(()=>naarSectie(tab),450);return()=>{window.clearTimeout(t1);window.clearTimeout(t2)};},[tab,geladen]);

  const codeVeld=<input inputMode='numeric' autoComplete='one-time-code' autoFocus value={code} onChange={event=>setCode(event.target.value.replace(/\D+/g,''))} placeholder={tr(lang,'6-значний код','6-cijferige code')} maxLength={6}/>;

  return <div className='access-plane'>
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
        {passwordMethod&&(passwordMethod.bound||data.password.configured)&&<div className='access-plane-row' data-access-method='password'>
          <KeyRound className='access-plane-row-icon'/>
          <div className='access-plane-row-main'>
            <span className='access-plane-row-title'><strong>{tr(lang,'Пароль','Wachtwoord')}</strong><span className={`access-plane-badge tone-${statusTone(passwordMethod.status)}`}>{statusLabel(lang,passwordMethod.status)}</span></span>
            {data.password.mustChange&&<small className='access-plane-warn'>{tr(lang,'Тимчасовий пароль — потрібно змінити','Tijdelijk wachtwoord — wijzigen vereist')}</small>}
            {wachtwoordOpen&&<div className='access-plane-inline-form'>
              <GeheimInvoer lang={lang} value={password} onChange={setPassword} autoComplete='new-password' autoFocus placeholder={tr(lang,'Новий пароль, мін. 10 символів','Nieuw wachtwoord, min. 10 tekens')} minLength={10} max={1024} soort='wachtwoord'/>
              <button type='button' disabled={busy||password.length<10} onClick={()=>void write('/api/owner/access/password/set',{password})}><Check/>{tr(lang,'Зберегти','Opslaan')}</button>
              <button type='button' className='secondary' disabled={busy||data.lockout.protected} onClick={()=>void write('/api/owner/access/password/remove')}><Trash2/>{tr(lang,'Прибрати пароль','Wachtwoord verwijderen')}</button>
            </div>}
          </div>
          <div className='access-plane-row-actions'>
            <button type='button' className='secondary' onClick={()=>setWachtwoordOpen(v=>!v)}>{wachtwoordOpen?<X/>:<Pencil/>}{wachtwoordOpen?tr(lang,'Закрити','Sluiten'):tr(lang,'Керувати','Beheren')}</button>
          </div>
        </div>}
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
            {totp.enrolled&&<button type='button' className='secondary' disabled={busy} onClick={()=>void p.totpUitschakelen()}><Trash2/>{tr(lang,'Вимкнути','Uitschakelen')}</button>}
          </div>
        </div>}
        {p.otpauth&&!totp?.enrolled&&<div className='access-plane-subrow access-plane-totp-setup'>
          <strong>{tr(lang,'Додайте ключ у застосунок-автентифікатор і введіть код','Voeg de sleutel toe in de authenticator-app en voer de code in')}</strong>
          <code className='access-plane-mono access-plane-secret' {...verborgenVoorAi}>{p.secret}</code>
          <small>{tr(lang,'Ключ показано один раз.','De sleutel wordt eenmalig getoond.')}</small>
          <div className='access-plane-inline-form'>
            {codeVeld}
            <button type='button' disabled={busy||code.length!==6} onClick={()=>void write('/api/owner/access/totp/confirm',{code})}><Check/>{tr(lang,'Підтвердити','Bevestigen')}</button>
          </div>
        </div>}
      </div>
    </section>}

    {toonHerstel&&<HerstelcodesSectie lang={lang} context={p.context} codes={recovery} busy={busy} nieuweHerstelcodes={p.nieuweHerstelcodes} recoverySaved={p.recoverySaved} onChange={()=>void p.load()}/>}
    {toonBeveiliging&&<SleutelkluisSectie lang={lang} context={p.context}/>}
    {toonMethoden&&<Toegangscodes lang={lang} context={p.context}/>}
    {toonHerstel&&p.tempPassword&&<div className='access-plane-subrow access-plane-recovery-codes' {...verborgenVoorAi}><strong>{tr(lang,'Тимчасовий пароль','Tijdelijk wachtwoord')}</strong><code className='access-plane-mono'>{p.tempPassword}</code></div>}
  </div>;
}
