import {Bell,Building2,Check,Copy,Fingerprint,Globe,Info,KeyRound,Lock,LogIn,Plus,RefreshCw,ShieldCheck,Smartphone,Trash2} from 'lucide-react';
import type {Lang} from './access-plane-copy';
// Passkeys blijven verborgen tot er echte WebAuthn-verificatie (attestation/assertion) in de backend is.
const PASSKEYS_ENABLED=false;

type Method={id:string;kind?:string;enabled:boolean;configured:boolean;bound?:boolean;status:string;honest?:string};
type Factor={id:string;enabled:boolean;enrolled:boolean;status:string;honest?:string;remaining?:number;phone?:string;count?:number};
type Binding={id:string;method:string;email:string;status:string;providerSubject?:string;lastUsedAt?:number};
type Snapshot={
  architecture:string;
  contour:{clientId:string;redirectUri:string;credentialsConfigured:boolean;source:string;hasVaultOverride:boolean;hasPlatformSecret:boolean;missing:string[];lockProtected:boolean;updatedAt:number};
  policy:{enabled:Record<string,boolean>;mfa:'optional'|'required'};
  methods:Method[];
  factors:Factor[];
  bindings:Binding[];
  webauthn?:Array<{id:string;label:string;createdAt?:number}>;
  usableCount:number;
  lockout:{protected:boolean;reason:string};
  password:{configured:boolean;mustChange:boolean};
  phone?:{configured:boolean;verified:boolean;value:string};
  totp:{enrolled:boolean};
  admin?:boolean;
};

type Props={
  tab:string;
  lang:Lang;
  mode:'identity'|'admin';
  data:Snapshot;
  busy:boolean;
  notice:string;
  password:string;
  setPassword:(value:string)=>void;
  phone:string;
  setPhone:(value:string)=>void;
  clientId:string;
  setClientId:(value:string)=>void;
  clientSecret:string;
  setClientSecret:(value:string)=>void;
  otpauth:string;
  secret:string;
  code:string;
  setCode:(value:string)=>void;
  recovery:string[];
  tempPassword:string;
  load:()=>Promise<void>;
  write:(route:string,payload?:Record<string,unknown>)=>Promise<void>;
  enrollPasskey:()=>Promise<void>;
  blank:()=>Snapshot;
};

const tr=(lang:Lang,uk:string,nl:string)=>lang==='nl'?nl:uk;

const methodLabel=(lang:Lang,id:string)=>({
  google:'Google',
  password:tr(lang,'Пароль','Wachtwoord'),
  microsoft:'Microsoft',
  apple:'Apple',
  facebook:'Facebook',
  phone:tr(lang,'Телефон / SMS','Telefoon / sms')
} as Record<string,string>)[id]||id;

const honestNote=(lang:Lang,honest?:string)=>{
  if(honest==='needs_provider_contour')return tr(lang,'Ще не підключено: адміністратору потрібно спершу додати ключі цього провайдера.','Nog niet gekoppeld: de beheerder moet eerst de sleutels van deze provider toevoegen.');
  if(honest==='needs_sms_contour')return tr(lang,'Номер збережено, але SMS-доставка ще не підключена адміністратором.','Het nummer is opgeslagen, maar sms-bezorging is nog niet door de beheerder gekoppeld.');
  if(honest==='needs_push_channel')return tr(lang,'Push-сповіщення для входу ще не підключені.','Pushmeldingen voor aanmelden zijn nog niet gekoppeld.');
  if(honest==='browser_supported_not_enrolled')return tr(lang,'Браузер підтримує passkey, але жодного ще не додано.','De browser ondersteunt passkeys, maar er is er nog geen toegevoegd.');
  return '';
};

const statusTone=(status:string)=>status==='loading'?'muted':status==='active'?'good':status==='ready'?'info':status==='disabled'?'muted':status==='not_configured'?'muted':'warn';

const statusLabel=(lang:Lang,status:string)=>({
  loading:tr(lang,'Завантаження…','Laden…'),
  active:tr(lang,'Активний','Actief'),
  ready:tr(lang,'Готовий, не увімкнено','Klaar, niet ingeschakeld'),
  not_configured:tr(lang,'Не налаштовано','Niet geconfigureerd'),
  disabled:tr(lang,'Вимкнено','Uitgeschakeld'),
  not_enrolled:tr(lang,'Не додано','Niet toegevoegd'),
  pending_sms_contour:tr(lang,'Очікує SMS-підключення','Wacht op sms-koppeling')
} as Record<string,string>)[status]||status;

export function AccessPlanePanels(p:Props){
  const {tab,lang,data,busy,notice,password,setPassword,phone,setPhone,code,setCode,recovery,write,enrollPasskey}=p;

  const totp=data.factors.find(item=>item.id==='totp');
  const smsFactor=data.factors.find(item=>item.id==='sms');
  const pushFactor=data.factors.find(item=>item.id==='push');
  const webauthnFactor=data.factors.find(item=>item.id==='webauthn');
  const recoveryFactor=data.factors.find(item=>item.id==='recovery');
  const passwordMethod=data.methods.find(item=>item.id==='password');
  const googleMethod=data.methods.find(item=>item.id==='google');
  const providerMethods=data.methods.filter(item=>['microsoft','apple','facebook'].includes(item.id));
  const phoneMethod=data.methods.find(item=>item.id==='phone');
  const googleBinding=data.bindings.find(item=>item.method==='google');

  const title=tab==='methods'
    ?tr(lang,'Способи входу','Aanmeldmethoden')
    :tab==='security'
    ?tr(lang,'Безпека','Beveiliging')
    :tr(lang,'Відновлення','Herstel');

  const subtitle=tab==='methods'
    ?tr(lang,'Керуйте тим, як ви входите в обліковий запис.','Beheer hoe u zich bij uw account aanmeldt.')
    :tab==='security'
    ?tr(lang,'Двофакторна автентифікація для цього акаунта.','Tweefactorauthenticatie voor dit account.')
    :tr(lang,'Коди відновлення на випадок втрати доступу до інших способів.','Herstelcodes voor als u geen toegang meer heeft tot andere methoden.');

  return <div className='access-plane'>
    <header className='access-plane-header'>
      <ShieldCheck/>
      <div><h1>{title}</h1><p>{subtitle}</p></div>
    </header>

    {notice&&<p className='access-plane-notice'>{notice}</p>}

    {data.lockout.protected&&<p className='access-plane-lockout'>
      <Lock/>{tr(lang,'Це єдиний активний спосіб входу — його не можна вимкнути чи видалити, доки не додано інший.','Dit is de enige actieve aanmeldmethode — deze kan niet worden uitgeschakeld of verwijderd totdat er een andere is toegevoegd.')}
    </p>}

    {tab==='methods'&&<div className='access-plane-grid'>
      {googleMethod&&<article className='access-plane-card' data-access-method='google'>
        <LogIn/>
        <div>
          <strong>{methodLabel(lang,'google')}</strong>
          <span className={`access-plane-badge tone-${statusTone(googleMethod.status)}`}>{statusLabel(lang,googleMethod.status)}</span>
          {data.contour.clientId&&<small className='access-plane-mono'>{data.contour.clientId}</small>}
          {googleBinding?.email&&<small>{googleBinding.email}</small>}
        </div>
        {googleMethod.bound&&googleBinding&&<button type='button' disabled={busy||data.lockout.protected} onClick={()=>void write('/api/owner/access/binding/unbind',{id:googleBinding.id})}><Trash2/>{tr(lang,'Відв’язати','Ontkoppelen')}</button>}
      </article>}

      {passwordMethod&&<article className='access-plane-card' data-access-method='password'>
        <KeyRound/>
        <div>
          <strong>{methodLabel(lang,'password')}</strong>
          <span className={`access-plane-badge tone-${statusTone(passwordMethod.status)}`}>{statusLabel(lang,passwordMethod.status)}</span>
          {data.password.mustChange&&<small className='access-plane-warn'>{tr(lang,'Тимчасовий пароль — потрібно змінити','Tijdelijk wachtwoord — wijzigen vereist')}</small>}
        </div>
        <div className='access-plane-inline-form'>
          <input type='password' value={password} onChange={event=>setPassword(event.target.value)} placeholder={tr(lang,'Новий пароль, мін. 10 символів','Nieuw wachtwoord, min. 10 tekens')} minLength={10}/>
          <button type='button' disabled={busy||password.length<10} onClick={()=>void write('/api/owner/access/password/set',{password})}><Check/>{data.password.configured?tr(lang,'Змінити','Wijzigen'):tr(lang,'Встановити','Instellen')}</button>
          {data.password.configured&&<button type='button' disabled={busy||data.lockout.protected} onClick={()=>void write('/api/owner/access/password/remove')}><Trash2/>{tr(lang,'Прибрати','Verwijderen')}</button>}
        </div>
      </article>}

      {phoneMethod&&<article className='access-plane-card' data-access-method='phone'>
        <Smartphone/>
        <div>
          <strong>{methodLabel(lang,'phone')}</strong>
          <span className={`access-plane-badge tone-${statusTone(phoneMethod.status)}`}>{statusLabel(lang,phoneMethod.status)}</span>
          {data.phone?.value&&<small className='access-plane-mono'>{data.phone.value}</small>}
          {honestNote(lang,phoneMethod.honest)&&<small className='access-plane-honest'><Info/>{honestNote(lang,phoneMethod.honest)}</small>}
        </div>
        <div className='access-plane-inline-form'>
          <input type='tel' value={phone} onChange={event=>setPhone(event.target.value)} placeholder='+380...'/>
          <button type='button' disabled={busy||phone.trim().length<8} onClick={()=>void write('/api/owner/access/phone/save',{phone})}><Check/>{tr(lang,'Зберегти','Opslaan')}</button>
          {data.phone?.configured&&<button type='button' disabled={busy||data.lockout.protected} onClick={()=>void write('/api/owner/access/method/unbind',{method:'phone'})}><Trash2/>{tr(lang,'Прибрати','Verwijderen')}</button>}
        </div>
      </article>}

      {providerMethods.map(method=><article className='access-plane-card muted' key={method.id} data-access-method={method.id}>
        <Globe/>
        <div>
          <strong>{methodLabel(lang,method.id)}</strong>
          <span className='access-plane-badge tone-muted'>{statusLabel(lang,method.status)}</span>
          <small className='access-plane-honest'><Info/>{honestNote(lang,method.honest)}</small>
        </div>
      </article>)}
    </div>}

    {tab==='security'&&<div className='access-plane-grid'>
      {totp&&<article className='access-plane-card' data-access-factor='totp'>
        <ShieldCheck/>
        <div>
          <strong>{tr(lang,'Застосунок-автентифікатор (TOTP)','Authenticator-app (TOTP)')}</strong>
          <span className={`access-plane-badge tone-${totp.enrolled?'good':'warn'}`}>{totp.enrolled?tr(lang,'Активний','Actief'):tr(lang,'Не додано','Niet toegevoegd')}</span>
        </div>
        {!totp.enrolled&&!p.otpauth&&<button type='button' disabled={busy} onClick={()=>void write('/api/owner/access/totp/start')}><Plus/>{tr(lang,'Почати налаштування','Instellen starten')}</button>}
        {totp.enrolled&&<button type='button' disabled={busy||data.lockout.protected} onClick={()=>void write('/api/owner/access/totp/disable')}><Trash2/>{tr(lang,'Вимкнути','Uitschakelen')}</button>}
      </article>}

      {p.otpauth&&!totp?.enrolled&&<article className='access-plane-card access-plane-totp-setup'>
        <div>
          <strong>{tr(lang,'Відскануйте або введіть ключ у застосунку-автентифікаторі','Scan of voer de sleutel in de authenticator-app in')}</strong>
          <code className='access-plane-mono access-plane-secret'>{p.secret}</code>
          <small className='access-plane-honest'>{tr(lang,'Значення показано один раз.','De waarde wordt eenmalig getoond.')}</small>
        </div>
        <div className='access-plane-inline-form'>
          <input value={code} onChange={event=>setCode(event.target.value)} placeholder={tr(lang,'6-значний код','6-cijferige code')} maxLength={6}/>
          <button type='button' disabled={busy||code.length!==6} onClick={()=>void write('/api/owner/access/totp/confirm',{code})}><Check/>{tr(lang,'Підтвердити','Bevestigen')}</button>
        </div>
      </article>}

      {PASSKEYS_ENABLED&&webauthnFactor&&<article className='access-plane-card' data-access-factor='webauthn'>
        <Fingerprint/>
        <div>
          <strong>{tr(lang,'Passkey / біометрія пристрою','Passkey / apparaatbiometrie')}</strong>
          <span className={`access-plane-badge tone-${webauthnFactor.enrolled?'good':'info'}`}>{webauthnFactor.count||0} {tr(lang,'додано','toegevoegd')}</span>
          {!webauthnFactor.enrolled&&<small className='access-plane-honest'><Info/>{honestNote(lang,webauthnFactor.honest)}</small>}
        </div>
        <button type='button' disabled={busy} onClick={()=>void enrollPasskey()}><Plus/>{tr(lang,'Додати passkey','Passkey toevoegen')}</button>
      </article>}

      {PASSKEYS_ENABLED&&(data.webauthn||[]).map(key=><article className='access-plane-card compact' key={key.id}>
        <Fingerprint/><div><strong>{key.label}</strong></div>
        <button type='button' disabled={busy} onClick={()=>void write('/api/owner/access/webauthn/remove',{id:key.id})} aria-label={tr(lang,'Видалити passkey','Passkey verwijderen')}><Trash2/></button>
      </article>)}

      {smsFactor&&<article className='access-plane-card muted' data-access-factor='sms'>
        <Smartphone/>
        <div><strong>{tr(lang,'SMS-код','Sms-code')}</strong><span className='access-plane-badge tone-muted'>{statusLabel(lang,smsFactor.status)}</span><small className='access-plane-honest'><Info/>{honestNote(lang,smsFactor.honest)}</small></div>
      </article>}

      {pushFactor&&<article className='access-plane-card muted' data-access-factor='push'>
        <Bell/>
        <div><strong>{tr(lang,'Push-сповіщення','Pushmeldingen')}</strong><span className='access-plane-badge tone-muted'>{statusLabel(lang,pushFactor.status)}</span><small className='access-plane-honest'><Info/>{honestNote(lang,pushFactor.honest)}</small></div>
      </article>}

      <article className='access-plane-card compact'>
        <ShieldCheck/>
        <div><strong>{tr(lang,'Вимога двофакторної автентифікації','Vereiste voor tweefactorauthenticatie')}</strong><span className='access-plane-badge tone-info'>{data.policy.mfa==='required'?tr(lang,'Обов’язково','Verplicht'):tr(lang,'За бажанням','Optioneel')}</span></div>
      </article>
    </div>}

    {tab==='recovery'&&<div className='access-plane-grid'>
      {recoveryFactor&&<article className='access-plane-card' data-access-factor='recovery'>
        <RefreshCw/>
        <div>
          <strong>{tr(lang,'Резервні коди відновлення','Back-up herstelcodes')}</strong>
          <span className={`access-plane-badge tone-${recoveryFactor.enrolled?'good':'warn'}`}>{recoveryFactor.remaining||0} {tr(lang,'залишилось','resterend')}</span>
        </div>
        <button type='button' disabled={busy} onClick={()=>void write('/api/owner/access/recovery/rotate')}><RefreshCw/>{recoveryFactor.enrolled?tr(lang,'Перевипустити коди','Codes opnieuw genereren'):tr(lang,'Створити коди','Codes maken')}</button>
      </article>}

      {recovery.length>0&&<article className='access-plane-card access-plane-recovery-codes'>
        <div>
          <strong>{tr(lang,'Нові коди відновлення — збережіть їх зараз','Nieuwe herstelcodes — bewaar ze nu')}</strong>
          <small className='access-plane-honest'>{tr(lang,'Показано лише один раз і більше не з’являться.','Wordt slechts eenmaal getoond en verschijnt daarna niet meer.')}</small>
          <ul className='access-plane-code-list'>{recovery.map(item=><li key={item} className='access-plane-mono'>{item}</li>)}</ul>
        </div>
        <button type='button' onClick={()=>void navigator.clipboard.writeText(recovery.join('\n'))}><Copy/>{tr(lang,'Копіювати всі','Alles kopiëren')}</button>
      </article>}

      {p.tempPassword&&<article className='access-plane-card access-plane-recovery-codes'>
        <div><strong>{tr(lang,'Тимчасовий пароль','Tijdelijk wachtwoord')}</strong><code className='access-plane-mono'>{p.tempPassword}</code></div>
      </article>}
    </div>}
  </div>;
}
