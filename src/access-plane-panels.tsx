// Instellingen → «Способи входу» / «Aanmeldmethoden»: één pagina zoals bij GitHub (RUNBOOK-VEILIGE-UITROL.md §13).
// Secties: e-mail en Google (alleen lezen), passkeys, tweefactorauthenticatie (TOTP; geen sms), herstelcodes.
// De tabbladen «Безпека» en «Відновлення» tonen dezelfde pagina, gescrold naar hun sectie.
import {useEffect} from 'react';
import {Check,Copy,Fingerprint,KeyRound,Lock,LogIn,Mail,Plus,RefreshCw,ShieldCheck,Trash2} from 'lucide-react';
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
  rotateWithPasskey:()=>Promise<void>;
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
  const totp=data.factors.find(item=>item.id==='totp');
  const recoveryFactor=data.factors.find(item=>item.id==='recovery');
  const passkeyFactor=data.factors.find(item=>item.id==='passkey');
  const passwordMethod=data.methods.find(item=>item.id==='password');
  const googleMethod=data.methods.find(item=>item.id==='google');
  const googleBinding=data.bindings.find(item=>item.method==='google');
  const heeftPasskey=(passkeyFactor?.count||0)>0;

  useEffect(()=>{const id=SECTIE[tab];if(id)window.setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}),60);},[tab]);

  const codeVeld=<input inputMode='numeric' autoComplete='one-time-code' value={code} onChange={event=>setCode(event.target.value.replace(/\s+/g,''))} placeholder={tr(lang,'6-значний код','6-cijferige code')} maxLength={6}/>;

  return <div className='access-plane'>
    <header className='access-plane-header'>
      <ShieldCheck/>
      <div><h1>{tr(lang,'Способи входу','Aanmeldmethoden')}</h1><p>{tr(lang,'Як ви входите в обліковий запис і як підтверджуєте важливі дії.','Hoe je je aanmeldt bij je account en hoe je belangrijke acties bevestigt.')}</p></div>
    </header>

    {notice&&<p className='access-plane-notice'>{notice}</p>}

    <section className='access-plane-section' id='aanmeldmethoden-google' data-access-section='google'>
      <header className='access-plane-section-head'><Mail/><div><h2>{tr(lang,'Електронна пошта та Google','E-mail en Google')}</h2><p>{tr(lang,'Ви входите через свій Google-акаунт. Змінити адресу можна лише в Google.','Je meldt je aan met je Google-account. Het adres wijzigen kan alleen bij Google.')}</p></div></header>
      {googleMethod&&<article className='access-plane-card' data-access-method='google'>
        <LogIn/>
        <div>
          <strong>Google</strong>
          <span className={`access-plane-badge tone-${statusTone(googleMethod.status)}`}>{statusLabel(lang,googleMethod.status)}</span>
          {googleBinding?.email&&<small>{googleBinding.email}</small>}
        </div>
      </article>}
      {data.lockout.protected&&<p className='access-plane-lockout'><Lock/>{tr(lang,'Це єдиний активний спосіб входу — його не можна вимкнути, доки не додано інший.','Dit is de enige actieve aanmeldmethode — deze kan niet worden uitgeschakeld totdat er een andere is.')}</p>}
      {passwordMethod&&(passwordMethod.bound||data.password.configured)&&<article className='access-plane-card' data-access-method='password'>
        <KeyRound/>
        <div>
          <strong>{tr(lang,'Пароль','Wachtwoord')}</strong>
          <span className={`access-plane-badge tone-${statusTone(passwordMethod.status)}`}>{statusLabel(lang,passwordMethod.status)}</span>
          {data.password.mustChange&&<small className='access-plane-warn'>{tr(lang,'Тимчасовий пароль — потрібно змінити','Tijdelijk wachtwoord — wijzigen vereist')}</small>}
          <div className='access-plane-inline-form'>
            <input type='password' autoComplete='new-password' value={password} onChange={event=>setPassword(event.target.value)} placeholder={tr(lang,'Новий пароль, мін. 10 символів','Nieuw wachtwoord, min. 10 tekens')} minLength={10}/>
            <button type='button' disabled={busy||password.length<10} onClick={()=>void write('/api/owner/access/password/set',{password})}><Check/>{tr(lang,'Змінити','Wijzigen')}</button>
            <button type='button' className='secondary' disabled={busy||data.lockout.protected} onClick={()=>void write('/api/owner/access/password/remove')}><Trash2/>{tr(lang,'Прибрати','Verwijderen')}</button>
          </div>
        </div>
      </article>}
    </section>

    <PasskeysSection lang={lang} context={p.context} onChange={()=>void p.load()}/>

    <section className='access-plane-section' id='aanmeldmethoden-2fa' data-access-section='2fa'>
      <header className='access-plane-section-head'><ShieldCheck/><div><h2>{tr(lang,'Двофакторна автентифікація','Tweefactorauthenticatie')}</h2><p>{tr(lang,'Для важливих дій (видалення, нові ключі, коди відновлення) ми просимо підтвердження: passkey, код із застосунку-автентифікатора або повторний вхід у Google. SMS не використовуємо.','Voor belangrijke acties (verwijderen, nieuwe sleutels, herstelcodes) vragen we een bevestiging: passkey, code uit de authenticator-app of opnieuw inloggen bij Google. Sms gebruiken we niet.')}</p></div></header>
      {totp&&<article className='access-plane-card' data-access-factor='totp'>
        <KeyRound/>
        <div>
          <strong>{tr(lang,'Застосунок-автентифікатор (TOTP)','Authenticator-app (TOTP)')}</strong>
          <span className={`access-plane-badge tone-${totp.status==='loading'?'muted':totp.enrolled?'good':'warn'}`}>{totp.status==='loading'?statusLabel(lang,'loading'):totp.enrolled?tr(lang,'Налаштовано','Ingesteld'):tr(lang,'Не налаштовано','Niet ingesteld')}</span>
          {!totp.enrolled&&!p.otpauth&&<div className='access-plane-actions'><button type='button' disabled={busy||totp.status==='loading'} onClick={()=>void write('/api/owner/access/totp/start')}><Plus/>{tr(lang,'Налаштувати','Instellen')}</button></div>}
          {totp.enrolled&&<div className='access-plane-inline-form'>
            {codeVeld}
            <button type='button' className='secondary' disabled={busy||code.length!==6} onClick={()=>void write('/api/owner/access/totp/disable',{code})}><Trash2/>{tr(lang,'Вимкнути','Uitschakelen')}</button>
          </div>}
        </div>
      </article>}
      {p.otpauth&&!totp?.enrolled&&<article className='access-plane-card access-plane-totp-setup'>
        <div>
          <strong>{tr(lang,'Додайте ключ у застосунок-автентифікатор і введіть код','Voeg de sleutel toe in de authenticator-app en voer de code in')}</strong>
          <code className='access-plane-mono access-plane-secret'>{p.secret}</code>
          <small>{tr(lang,'Ключ показано один раз.','De sleutel wordt eenmalig getoond.')}</small>
          <div className='access-plane-inline-form'>
            {codeVeld}
            <button type='button' disabled={busy||code.length!==6} onClick={()=>void write('/api/owner/access/totp/confirm',{code})}><Check/>{tr(lang,'Підтвердити','Bevestigen')}</button>
          </div>
        </div>
      </article>}
      <article className='access-plane-card compact'>
        <Fingerprint/>
        <div><strong>{tr(lang,'Passkey для підтвердження','Passkey voor bevestiging')}</strong>
          <span className={`access-plane-badge tone-${heeftPasskey?'good':'muted'}`}>{heeftPasskey?tr(lang,`Додано: ${passkeyFactor?.count}`,`Toegevoegd: ${passkeyFactor?.count}`):tr(lang,'Не додано','Niet toegevoegd')}</span></div>
      </article>
    </section>

    <section className='access-plane-section' id='aanmeldmethoden-herstel' data-access-section='recovery'>
      <header className='access-plane-section-head'><RefreshCw/><div><h2>{tr(lang,'Коди відновлення','Herstelcodes')}</h2><p>{tr(lang,'Одноразові коди на випадок, якщо ви втратите телефон. Зберігайте їх окремо (папір, менеджер паролів).','Eenmalige codes voor als je je telefoon kwijt bent. Bewaar ze apart (papier, wachtwoordmanager).')}</p></div></header>
      {recoveryFactor&&<article className='access-plane-card' data-access-factor='recovery'>
        <RefreshCw/>
        <div>
          <strong>{recoveryFactor.enrolled?tr(lang,`Залишилось кодів: ${recoveryFactor.remaining||0}`,`Resterende codes: ${recoveryFactor.remaining||0}`):tr(lang,'Кодів ще немає','Nog geen codes')}</strong>
          {recoveryFactor.enrolled&&<span className={`access-plane-badge tone-${recoveryFactor.bekekenOp?'good':'warn'}`}>{recoveryFactor.bekekenOp?tr(lang,'Збережено ','Bewaard ')+datum(lang,recoveryFactor.bekekenOp):tr(lang,'Не позначено як збережені','Niet als bewaard gemarkeerd')}</span>}
          {recoveryFactor.createdAt?<small>{tr(lang,'Створено ','Gemaakt ')}{datum(lang,recoveryFactor.createdAt)}</small>:null}
          <small>{tr(lang,'Нові коди замінюють старі. Для цього потрібне підтвердження.','Nieuwe codes vervangen de oude. Daarvoor is een bevestiging nodig.')}</small>
          <div className='access-plane-inline-form'>
            {totp?.enrolled&&codeVeld}
            <button type='button' disabled={busy||(!!totp?.enrolled&&code.length!==6)} onClick={()=>void write('/api/owner/access/recovery/rotate',totp?.enrolled?{code}:{})}><RefreshCw/>{recoveryFactor.enrolled?tr(lang,'Створити нові коди','Nieuwe codes maken'):tr(lang,'Створити коди','Codes maken')}</button>
            {totp?.enrolled&&heeftPasskey&&<button type='button' className='secondary' disabled={busy} onClick={()=>void p.rotateWithPasskey()}><Fingerprint/>{tr(lang,'Підтвердити passkey','Met passkey bevestigen')}</button>}
          </div>
        </div>
      </article>}
      {recovery.length>0&&<article className='access-plane-card access-plane-recovery-codes'>
        <div>
          <strong>{tr(lang,'Нові коди відновлення — збережіть їх зараз','Nieuwe herstelcodes — bewaar ze nu')}</strong>
          <small>{tr(lang,'Показано лише один раз. Кожен код діє один раз.','Wordt maar één keer getoond. Elke code werkt één keer.')}</small>
          <ul className='access-plane-code-list'>{recovery.map(item=><li key={item} className='access-plane-mono'>{item}</li>)}</ul>
          <div className='access-plane-actions'>
            <button type='button' className='secondary' onClick={()=>void navigator.clipboard?.writeText(recovery.join('\n'))}><Copy/>{tr(lang,'Копіювати всі','Alles kopiëren')}</button>
            <button type='button' disabled={busy} onClick={()=>void p.recoverySaved()}><Check/>{tr(lang,'Я зберіг коди','Ik heb de codes bewaard')}</button>
          </div>
        </div>
      </article>}
      {p.tempPassword&&<article className='access-plane-card access-plane-recovery-codes'>
        <div><strong>{tr(lang,'Тимчасовий пароль','Tijdelijk wachtwoord')}</strong><code className='access-plane-mono'>{p.tempPassword}</code></div>
      </article>}
    </section>
  </div>;
}
