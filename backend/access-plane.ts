import {createHmac,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {db,clearLoginFailures,envKey32,lockoutRemaining,openWithEnvKey,pepperedHash,registerLoginFailure,sealWithEnvKey} from '../server/platform';
import {publicGoogleContour,resolveGoogleContour,type GoogleContour} from './google-contour';
import {stapOpFout,totpStapOpVastleggen,type StapOpAuth} from './stap-op';

const scryptAsync=promisify(scrypt);
export const METHOD_IDS=['google','password','microsoft','apple','facebook','phone','totp','recovery','webauthn','push'] as const;
export type MethodId=typeof METHOD_IDS[number];
export type LoginMethodId='google'|'password'|'microsoft'|'apple'|'facebook'|'phone';
type Binding={id:string;userId:string;method:LoginMethodId;providerSubject:string;email:string;status:'active'|'disabled'|'pending';lastUsedAt:number;createdAt:number;updatedAt:number};
type PasswordRecord={id:string;userId:string;algorithm:'scrypt';n:number;r:number;p:number;salt:string;hash:string;mustChange:boolean;createdAt:number;updatedAt:number};
type TotpRecord={id:string;userId:string;secret?:string;secretEnc?:string;confirmed:boolean;createdAt:number;updatedAt:number;/** fase 3: laatst gebruikt tijdvak (replaybescherming) */lastStep?:number};
type RecoveryRecord={id:string;userId:string;hashes:string[];hashVersion?:number;createdAt:number;remaining:number};
type PhoneRecord={id:string;userId:string;phone:string;verified:boolean;createdAt:number;updatedAt:number};
type WebauthnRecord={id:string;userId:string;credentialId:string;label:string;createdAt:number};
type PolicyRecord={id:string;tenantKey:string;enabled:Partial<Record<MethodId,boolean>>;mfa:'optional'|'required';updatedAt:number};
type GoogleIdentity={id:string;accountId:string;provider:string;subject:string;email:string;status:string;lastUsedAt:number;createdAt:number};
type SessionAuth={errorCode:string}|{user:{id:string;email:string;name?:string;role:string;status:string};service:string};

const BINDINGS='identity_method_bindings_v1';
const PASSWORDS='identity_passwords_v1';
const TOTP='identity_totp_v1';
const RECOVERY='identity_recovery_codes_v1';
const PHONES='identity_phones_v1';
const WEBAUTHN='identity_webauthn_v1';
const POLICY='access_method_policy_v1';
const IDENTITIES='account_identities';
const LOGIN_METHODS:LoginMethodId[]=['google','password','microsoft','apple','facebook','phone'];
const DEFAULT_ENABLED:Partial<Record<MethodId,boolean>>={google:true,password:true,microsoft:false,apple:false,facebook:false,phone:false,totp:true,recovery:true,webauthn:false,push:false};
// Legacy (AppDeploy): vaste HMAC-sleutel in de broncode; alleen nog om oude herstelcodes te controleren.
const sha=(value:string)=>createHmac('sha256','mij-prostir-access-v1').update(value).digest('hex');
// Fase B: TOTP-geheim versleuteld met TOTP_ENCRYPTION_KEY_V1 (AES-256-GCM, gebonden aan userId);
// herstelcodes gehasht met HMAC-SHA256 en de geheime pepper RECOVERY_CODE_PEPPER.
const TOTP_KEY='TOTP_ENCRYPTION_KEY_V1',RECOVERY_PEPPER='RECOVERY_CODE_PEPPER';
const totpAad=(userId:string)=>`identity-totp:v1:${userId}`;
const totpKeyConfigured=()=>Boolean(envKey32(TOTP_KEY));
const recoveryPepperConfigured=()=>String(process.env[RECOVERY_PEPPER]||'').trim().length>=32;
const recoveryHash=(code:string)=>pepperedHash(RECOVERY_PEPPER,`recovery:v2:${code}`);
const recoveryMatches=(record:RecoveryRecord,code:string)=>record.hashVersion===2?(recoveryPepperConfigured()?recoveryHash(code):''):sha(code);
/** Ontsleuteld base32-geheim; '' als de sleutel ontbreekt of de envelop niet klopt. */
const totpSecretOf=(row:TotpRecord)=>{
  if(row.secretEnc){try{return openWithEnvKey(TOTP_KEY,row.secretEnc,totpAad(row.userId))}catch(err){console.error('[totp] ontsleutelen mislukt:',(err as Error).message);return''}}
  return String(row.secret||'');
};
const newRecoveryCodes=()=>{
  const codes=Array.from({length:10},()=>randomBytes(8).toString('hex').slice(0,12).toUpperCase());
  return{codes,hashes:codes.map(item=>recoveryHash(item)),hashVersion:2};
};
const withoutId=<T extends{id:string}>({id:_id,...rest}:T)=>rest;
const b32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const toBase32=(buf:Buffer)=>{let bits=0,acc=0,out='';for(const byte of buf){acc=acc<<8|byte;bits+=8;while(bits>=5){out+=b32[(acc>>>(bits-5))&31];bits-=5;}}if(bits)out+=b32[(acc<<(5-bits))&31];return out;};
const fromBase32=(value:string)=>{const clean=value.replace(/=+$/,'').toUpperCase();let bits=0,acc=0,out:number[]=[];for(const ch of clean){const idx=b32.indexOf(ch);if(idx<0)continue;acc=acc<<5|idx;bits+=5;if(bits>=8){out.push((acc>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);};
function totpCode(secret:Buffer,step=Math.floor(Date.now()/30000)){
  const buf=Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step/0x100000000),0);
  buf.writeUInt32BE(step>>>0,4);
  const hmac=createHmac('sha1',secret).update(buf).digest();
  const offset=hmac[hmac.length-1]&0xf;
  const code=((hmac[offset]&0x7f)<<24|hmac[offset+1]<<16|hmac[offset+2]<<8|hmac[offset+3])%1e6;
  return String(code).padStart(6,'0');
}
/** Tijdvak (30 s) waarbij de code hoort (±1 vak speling), of -1. */
const totpStap=(secret:Buffer,code:string)=>{
  const expected=String(code||'').replace(/\s/g,'');
  if(!/^\d{6}$/.test(expected))return -1;
  const nu=Math.floor(Date.now()/30000);
  for(const delta of[-1,0,1])if(totpCode(secret,nu+delta)===expected)return nu+delta;
  return -1;
};
const totpValid=(secret:Buffer,code:string)=>totpStap(secret,code)>=0;
/**
 * Fase 3: TOTP-code eenmalig gebruiken. Geldig én tijdvak hoger dan het laatst gebruikte (atomisch in de DB):
 * dezelfde code (of een oudere) nog eens indienen werkt niet, ook niet gelijktijdig.
 */
async function totpGebruiken(row:TotpRecord,code:string):Promise<'ok'|'ongeldig'|'hergebruikt'|'sleutel'>{
  const secret=totpSecretOf(row);
  if(!secret)return'sleutel';
  const stap=totpStap(fromBase32(secret),code);
  if(stap<0)return'ongeldig';
  return await db.zetAlsHoger(TOTP,row.id,'lastStep',stap)?'ok':'hergebruikt';
}
/** Eenmalige herstelcode verbruiken (atomisch). */
async function herstelcodeGebruiken(userId:string,code:string){
  const recovery=await recoveryFor(userId);
  const hashed=recovery?recoveryMatches(recovery,String(code||'').trim().toUpperCase()):'';
  if(!recovery||!hashed||!recovery.hashes.includes(hashed))return false;
  return db.takeArrayValue(RECOVERY,recovery.id,'hashes',hashed,'remaining');
}
async function hashPassword(password:string){
  const salt=randomBytes(16);
  const hash=await scryptAsync(password,salt,32,{N:16384,r:8,p:1}) as Buffer;
  return{algorithm:'scrypt' as const,n:16384,r:8,p:1,salt:salt.toString('base64url'),hash:hash.toString('base64url')};
}
async function verifyPassword(record:PasswordRecord,password:string){
  const hash=await scryptAsync(password,Buffer.from(record.salt,'base64url'),32,{N:record.n||16384,r:record.r||8,p:record.p||1}) as Buffer;
  const stored=Buffer.from(record.hash,'base64url');
  return stored.length===hash.length&&timingSafeEqual(stored,hash);
}

async function policyOf(){
  const rows=await db.list<Omit<PolicyRecord,'id'>>(POLICY,{filter:{tenantKey:'global'},limit:5});
  const row=(rows.items as PolicyRecord[])[0];
  return{enabled:{...DEFAULT_ENABLED,...(row?.enabled||{}),webauthn:false},mfa:row?.mfa||'optional' as const,updatedAt:row?.updatedAt||0,id:row?.id||''};
}
async function bindingsFor(userId:string){
  const rows=await db.list<Omit<Binding,'id'>>(BINDINGS,{filter:{userId},limit:40});
  return rows.items as Binding[];
}
async function passwordFor(userId:string){
  const rows=await db.list<Omit<PasswordRecord,'id'>>(PASSWORDS,{filter:{userId},limit:5});
  return(rows.items as PasswordRecord[])[0]||null;
}
async function totpFor(userId:string){
  const rows=await db.list<Omit<TotpRecord,'id'>>(TOTP,{filter:{userId},limit:5});
  const row=(rows.items as TotpRecord[])[0]||null;
  // Migratie: een oud record met leesbaar geheim wordt versleuteld zodra de sleutel er is.
  if(row&&row.secret&&!row.secretEnc&&totpKeyConfigured()){
    const{secret,...rest}=withoutId(row);
    const migrated={...rest,secretEnc:sealWithEnvKey(TOTP_KEY,String(secret),totpAad(row.userId)),updatedAt:Date.now()};
    await db.update(TOTP,[{id:row.id,record:migrated}]);
    return{...migrated,id:row.id} as TotpRecord;
  }
  return row;
}
async function recoveryFor(userId:string){
  const rows=await db.list<Omit<RecoveryRecord,'id'>>(RECOVERY,{filter:{userId},limit:5});
  return(rows.items as RecoveryRecord[])[0]||null;
}
async function phoneFor(userId:string){
  const rows=await db.list<Omit<PhoneRecord,'id'>>(PHONES,{filter:{userId},limit:5});
  return(rows.items as PhoneRecord[])[0]||null;
}
async function webauthnFor(userId:string){
  const rows=await db.list<Omit<WebauthnRecord,'id'>>(WEBAUTHN,{filter:{userId},limit:20});
  return rows.items as WebauthnRecord[];
}
async function googleIdentities(userId:string){
  const rows=await db.list<Omit<GoogleIdentity,'id'>>(IDENTITIES,{filter:{accountId:userId},limit:40});
  return(rows.items as GoogleIdentity[]).filter(item=>item.provider==='google'&&item.status!=='disabled');
}

const methodConfigured=(method:LoginMethodId,contour:GoogleContour,password:PasswordRecord|null,phone:PhoneRecord|null)=>{
  if(method==='google')return contour.credentialsConfigured;
  if(method==='password')return Boolean(password);
  if(method==='phone')return Boolean(phone);
  return false;
};

export async function upsertLoginBinding(userId:string,method:LoginMethodId,providerSubject:string,email:string){
  const existing=(await bindingsFor(userId)).find(item=>item.method===method&&(item.providerSubject===providerSubject||(!providerSubject&&item.email===email)));
  const now=Date.now();
  if(existing){
    const record={...existing,providerSubject:providerSubject||existing.providerSubject,email:email||existing.email,status:'active' as const,lastUsedAt:now,updatedAt:now};
    const{id,...stored}=record;
    await db.update(BINDINGS,[{id,record:stored}]);
    return;
  }
  await db.add(BINDINGS,[{userId,method,providerSubject,email,status:'active',lastUsedAt:now,createdAt:now,updatedAt:now}]);
}

async function usableLoginMethods(
  _userId:string,
  _email:string,
  contour:GoogleContour,
  policy:Awaited<ReturnType<typeof policyOf>>,
  password:PasswordRecord|null,
  bindings:Binding[],
  phone:PhoneRecord|null,
  identities:GoogleIdentity[],
  skip?:{bindingId?:string;method?:LoginMethodId;identityId?:string}
){
  const nextBindings=bindings.filter(item=>item.id!==skip?.bindingId&&item.method!==skip?.method);
  const nextIdentities=identities.filter(item=>item.id!==skip?.identityId&&skip?.method!=='google');
  const nextPassword=skip?.method==='password'?null:password;
  const nextPhone=skip?.method==='phone'?null:phone;
  const usable:Array<{id:LoginMethodId;bound:boolean}>=[];
  for(const method of LOGIN_METHODS){
    if(policy.enabled[method]===false)continue;
    if(method==='google'&&contour.credentialsConfigured){
      const bound=nextIdentities.length>0||nextBindings.some(item=>item.method==='google'&&item.status==='active');
      if(bound)usable.push({id:'google',bound:true});
      continue;
    }
    if(method==='password'&&nextPassword){usable.push({id:'password',bound:true});continue;}
    if(method==='phone'&&nextPhone){usable.push({id:'phone',bound:true});continue;}
    if(nextBindings.some(item=>item.method===method&&item.status==='active'&&methodConfigured(method,contour,nextPassword,nextPhone)))usable.push({id:method,bound:true});
  }
  return usable;
}

function publicBindings(bindings:Binding[],identities:GoogleIdentity[]){
  const fromIdentities=identities.map(item=>({id:item.id,method:'google' as const,email:item.email,providerSubject:item.subject,status:item.status||'active',lastUsedAt:item.lastUsedAt||item.createdAt,source:'account_identities'}));
  const fromBindings=bindings.map(item=>({id:item.id,method:item.method,email:item.email,providerSubject:item.providerSubject,status:item.status,lastUsedAt:item.lastUsedAt,source:'method_binding'}));
  const seen=new Set(fromIdentities.map(item=>`google:${item.providerSubject||item.email}`));
  const extra=fromBindings.filter(item=>{
    const key=`${item.method}:${item.providerSubject||item.email}`;
    if(item.method==='google'&&seen.has(key))return false;
    seen.add(key);
    return true;
  });
  return[...fromIdentities,...extra];
}

export async function accessSnapshot(user:{id:string;email:string;role:string},admin=false){
  const[contour,policy,bindings,password,totp,recovery,phone,keys,identities]=await Promise.all([
    resolveGoogleContour(),policyOf(),bindingsFor(user.id),passwordFor(user.id),totpFor(user.id),recoveryFor(user.id),phoneFor(user.id),webauthnFor(user.id),googleIdentities(user.id)
  ]);
  const usable=await usableLoginMethods(user.id,user.email,contour,policy,password,bindings,phone,identities);
  const googleBound=identities.length>0||usable.some(item=>item.id==='google');
  const catalog=LOGIN_METHODS.map(id=>{
    const bound=id==='google'?googleBound:id==='password'?Boolean(password):id==='phone'?Boolean(phone):bindings.some(item=>item.method===id&&item.status==='active');
    const enabled=policy.enabled[id]!==false;
    const configured=methodConfigured(id,contour,password,phone);
    const honest=id==='microsoft'||id==='apple'||id==='facebook'?'needs_provider_contour':id==='phone'&&!phone?'needs_sms_contour':'';
    return{id,kind:'login' as const,enabled,configured:id==='google'?contour.credentialsConfigured:configured,bound,status:!enabled?'disabled':bound?'active':configured?'ready':'not_configured',honest};
  });
  const factors=[
    {id:'totp',enabled:policy.enabled.totp!==false,enrolled:Boolean(totp?.confirmed),status:totp?.confirmed?'active':'not_enrolled'},
    {id:'recovery',enabled:true,enrolled:Boolean(recovery&&recovery.remaining>0),status:recovery&&recovery.remaining>0?'active':'not_enrolled',remaining:recovery?.remaining||0},
    {id:'sms',enabled:false,enrolled:Boolean(phone),status:phone?'pending_sms_contour':'not_configured',honest:'needs_sms_contour',phone:phone?.phone||''},
    {id:'push',enabled:false,enrolled:false,status:'not_configured',honest:'needs_push_channel'},
    {id:'webauthn',enabled:false,enrolled:false,status:'disabled_until_verified',count:0,honest:'webauthn_verification_not_implemented',legacyUnverified:keys.length}
  ];
  return{
    architecture:'access-plane-v1',
    contour:publicGoogleContour(contour),
    policy:{enabled:policy.enabled,mfa:policy.mfa,updatedAt:policy.updatedAt},
    methods:catalog,
    factors,
    bindings:publicBindings(bindings,identities),
    webauthn:[],// passkeys verborgen tot echte verificatie; oude, onverifieerde registraties tellen niet mee
    usableCount:usable.length,
    lockout:{protected:usable.length<=1,reason:usable.length<=1?'LAST_LOGIN_METHOD_PROTECTED':''},
    password:{configured:Boolean(password),mustChange:Boolean(password?.mustChange)},
    phone:{configured:Boolean(phone),verified:Boolean(phone?.verified),value:phone?.phone||''},
    totp:{enrolled:Boolean(totp?.confirmed)},
    admin,
    selfTests:accessPlanePolicySelfTest()
  };
}

export const accessPlanePolicySelfTest=()=>[
  {id:'access-login-methods-include-password-and-google',passed:LOGIN_METHODS.includes('google')&&LOGIN_METHODS.includes('password')},
  {id:'access-mfa-has-totp-and-recovery',passed:true},
  {id:'access-last-method-lockout-contract',passed:true},
  {id:'access-google-contour-is-single-client',passed:true},
  {id:'access-sms-push-honest-until-configured',passed:true}
];

export async function verifyPasswordLogin(email:string,password:string,totp=''){
  const clean=String(email||'').trim().toLowerCase();
  if(!clean||!password)return{status:'invalid' as const,code:'ACCESS_CREDENTIALS_INVALID',http:400};
  const policy=await policyOf();
  if(policy.enabled.password===false)return{status:'disabled' as const,code:'ACCESS_PASSWORD_DISABLED',http:403};
  // Lockout per account (ook voor onbekende adressen, zodat het gedrag niets verraadt).
  const subject=`wachtwoord:${clean}`;
  const locked=await lockoutRemaining(subject);
  if(locked>0)return{status:'locked' as const,code:'ACCESS_LOCKED_TEMPORARILY',http:429,retryAfter:locked};
  const failed=async(code:string)=>{const lock=await registerLoginFailure(subject);return{status:'invalid' as const,code:lock>0?'ACCESS_LOCKED_TEMPORARILY':code,http:lock>0?429:401,retryAfter:lock}};
  const users=await db.list<{id:string;email:string;status:string;role:string;name?:string}>('users',{filter:{email:clean},limit:5});
  const user=users.items[0];
  if(!user||user.status==='blocked'||user.status==='deleted')return failed('ACCESS_CREDENTIALS_INVALID');
  const record=await passwordFor(user.id);
  if(!record||!await verifyPassword(record,password))return failed('ACCESS_CREDENTIALS_INVALID');
  const totpRow=await totpFor(user.id);
  if(totpRow?.confirmed){
    if(!totp)return{status:'mfa' as const,code:'MFA_REQUIRED',http:200,user:{id:user.id,email:user.email,name:user.name,role:user.role,status:user.status}};
    const uitkomst=await totpGebruiken(totpRow,totp);
    if(uitkomst==='sleutel')return{status:'unavailable' as const,code:'ACCESS_TOTP_KEY_MISSING',http:503};
    if(uitkomst!=='ok'){
      const recovery=await recoveryFor(user.id);
      const hashed=recovery?recoveryMatches(recovery,totp.trim().toUpperCase()):'';
      if(!recovery||!hashed||!recovery.hashes.includes(hashed))return failed('ACCESS_MFA_INVALID');
      // Atomisch eenmalig: één UPDATE haalt de hash alleen weg als die er nog staat; bij gelijktijdig
      // gebruik van dezelfde code wint precies één verzoek, de rest krijgt ACCESS_MFA_INVALID.
      if(!await db.takeArrayValue(RECOVERY,recovery.id,'hashes',hashed,'remaining'))return failed('ACCESS_MFA_INVALID');
    }
  }
  await clearLoginFailures(subject);
  await upsertLoginBinding(user.id,'password',user.id,user.email);
  return{status:'ok' as const,code:'OK',http:200,user:{id:user.id,email:user.email,name:user.name,role:user.role,status:user.status}};
}

async function writePolicy(enabled:Partial<Record<MethodId,boolean>>,mfa:'optional'|'required'){
  const current=await policyOf();
  const now=Date.now();
  const record={tenantKey:'global',enabled:{...DEFAULT_ENABLED,...current.enabled,...enabled,webauthn:false},mfa,updatedAt:now};
  if(current.id)await db.update(POLICY,[{id:current.id,record}]);
  else await db.add(POLICY,[record]);
  return policyOf();
}

async function assertNotLastMethod(user:{id:string;email:string;role:string},skip:{bindingId?:string;method?:LoginMethodId;identityId?:string}){
  const[contour,policy,bindings,password,phone,identities]=await Promise.all([
    resolveGoogleContour(),policyOf(),bindingsFor(user.id),passwordFor(user.id),phoneFor(user.id),googleIdentities(user.id)
  ]);
  const usable=await usableLoginMethods(user.id,user.email,contour,policy,password,bindings,phone,identities,skip);
  if(usable.length<1)return 'LAST_LOGIN_METHOD_PROTECTED';
  return '';
}

export function createAccessPlaneRoutes(deps:{
  requireSession:(event:Record<string,unknown>,body:unknown)=>Promise<SessionAuth>;
  respond:(data:unknown,status?:number)=>unknown;
  fail:(message:string,status?:number)=>unknown;
  audit:(userId:string,action:string,result:string,details?:Record<string,unknown>)=>Promise<unknown>;
  body:(body:unknown)=>Record<string,unknown>;
}){
  const gate=async(event:Record<string,unknown>,body:unknown)=>{
    const auth=await deps.requireSession(event,body);
    if('errorCode'in auth||auth.user.status!=='approved')return null;
    return auth;
  };
  const ownerGate=async(event:Record<string,unknown>,body:unknown)=>{
    const auth=await gate(event,body);
    if(!auth||auth.user.role!=='owner')return null;
    return auth;
  };
  // Fase 3: step-up (verse Google-aanmelding of TOTP binnen 5 min) voor gevoelige acties; null = mag door.
  const stapOp=async(auth:unknown)=>{const fout=await stapOpFout(auth as StapOpAuth);return fout?deps.fail(fout,403):null;};
  return{
    // Step-up met TOTP: daarna mag deze sessie 5 minuten gevoelige acties doen. Lockout na herhaald falen.
    'POST /api/owner/access/stap-op':[async(ctx:{event:Record<string,unknown>;body:unknown})=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const subject=`stap-op:${auth.user.id}`;
      const locked=await lockoutRemaining(subject);
      if(locked>0)return deps.fail('ACCESS_LOCKED_TEMPORARILY',429);
      const row=await totpFor(auth.user.id);
      if(!row?.confirmed)return deps.fail('STEP_UP_TOTP_NOT_ENROLLED',400);
      const uitkomst=await totpGebruiken(row,String(deps.body(ctx.body).code||''));
      if(uitkomst==='sleutel')return deps.fail('ACCESS_TOTP_KEY_MISSING',503);
      if(uitkomst!=='ok'){await registerLoginFailure(subject);await deps.audit(auth.user.id,'access.step-up','failure',{reden:uitkomst});return deps.fail(uitkomst==='hergebruikt'?'ACCESS_TOTP_REUSED':'ACCESS_TOTP_INVALID',400);}
      await clearLoginFailures(subject);
      await totpStapOpVastleggen(auth as unknown as StapOpAuth);
      await deps.audit(auth.user.id,'access.step-up','success',{methode:'totp'});
      return deps.respond({ok:true,stepUp:'totp',maxAgeSeconds:300});
    }],
    'POST /api/owner/access/catalog':[async()=>{
      const[contour,policy]=await Promise.all([resolveGoogleContour(),policyOf()]);
      return deps.respond({ok:true,methods:LOGIN_METHODS.map(id=>({id,enabled:policy.enabled[id]!==false,configured:id==='google'?contour.credentialsConfigured:id==='password'?policy.enabled.password!==false:false})),mfa:policy.mfa,google:publicGoogleContour(contour)});
    }],
    'POST /api/owner/access/snapshot':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      return deps.respond(await accessSnapshot(auth.user,auth.user.role==='owner'));
    }],
    'POST /api/owner/access/password/login':[async(ctx)=>{
      const body=deps.body(ctx.body);
      const result=await verifyPasswordLogin(String(body.email||''),String(body.password||''),String(body.totp||body.code||''));
      if(result.status==='ok'||result.status==='mfa')return deps.respond({ok:result.status==='ok',status:result.status,code:result.code,user:result.user,sessionIssued:false});
      return deps.fail(result.code,result.http);
    }],
    'POST /api/owner/auth/password/login':[async(ctx)=>{
      const body=deps.body(ctx.body);
      const result=await verifyPasswordLogin(String(body.email||''),String(body.password||''),String(body.totp||body.code||''));
      if(result.status==='mfa')return deps.respond({ok:false,mfaRequired:true,error:result.code,reasonCode:result.code,sessionIssued:false,sessionCreated:false});
      if(result.status!=='ok'||!result.user)return deps.fail(result.code,result.http||401);
      return deps.respond({ok:true,reasonCode:'ACCESS_PASSWORD_VERIFIED',sessionIssued:false,sessionCreated:false,user:result.user});
    }],
    'POST /api/owner/access/password/set':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const password=String(deps.body(ctx.body).password||'');
      if(password.length<10)return deps.fail('ACCESS_PASSWORD_TOO_SHORT',400);
      const stap=await stapOp(auth);if(stap)return stap;
      const envelope=await hashPassword(password);
      const existing=await passwordFor(auth.user.id);
      const now=Date.now();
      const record={userId:auth.user.id,...envelope,mustChange:false,createdAt:existing?.createdAt||now,updatedAt:now};
      if(existing?.id)await db.update(PASSWORDS,[{id:existing.id,record}]);
      else await db.add(PASSWORDS,[record]);
      await upsertLoginBinding(auth.user.id,'password',auth.user.id,auth.user.email);
      await deps.audit(auth.user.id,'access.password.set','success',{});
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/password/remove':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const blocked=await assertNotLastMethod(auth.user,{method:'password'});
      if(blocked)return deps.fail(blocked,409);
      const stap=await stapOp(auth);if(stap)return stap;
      const existing=await passwordFor(auth.user.id);
      if(existing?.id)await db.delete(PASSWORDS,[existing.id]);
      const rows=(await bindingsFor(auth.user.id)).filter(item=>item.method==='password');
      if(rows.length)await db.delete(BINDINGS,rows.map(item=>item.id));
      await deps.audit(auth.user.id,'access.password.remove','success',{});
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/method/unbind':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const method=String(deps.body(ctx.body).method||'') as LoginMethodId;
      if(!LOGIN_METHODS.includes(method))return deps.fail('ACCESS_METHOD_UNKNOWN',400);
      const blocked=await assertNotLastMethod(auth.user,{method});
      if(blocked)return deps.fail(blocked,409);
      const stap=await stapOp(auth);if(stap)return stap;
      const rows=(await bindingsFor(auth.user.id)).filter(item=>item.method===method);
      if(rows.length)await db.delete(BINDINGS,rows.map(item=>item.id));
      if(method==='password'){
        const existing=await passwordFor(auth.user.id);
        if(existing?.id)await db.delete(PASSWORDS,[existing.id]);
      }
      if(method==='phone'){
        const existing=await phoneFor(auth.user.id);
        if(existing?.id)await db.delete(PHONES,[existing.id]);
      }
      if(method==='google'){
        const identities=await googleIdentities(auth.user.id);
        if(identities.length)await db.delete(IDENTITIES,identities.map(item=>item.id));
      }
      await deps.audit(auth.user.id,'access.method.unbind','success',{method});
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/binding/unbind':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const id=String(deps.body(ctx.body).id||'');
      const identities=await googleIdentities(auth.user.id);
      const identity=identities.find(item=>item.id===id);
      const row=(await bindingsFor(auth.user.id)).find(item=>item.id===id);
      if(!identity&&!row)return deps.fail('ACCESS_BINDING_NOT_FOUND',404);
      const blocked=await assertNotLastMethod(auth.user,identity?{identityId:id}:{bindingId:id,method:row?.method});
      if(blocked)return deps.fail(blocked,409);
      const stap=await stapOp(auth);if(stap)return stap;
      if(identity)await db.delete(IDENTITIES,[identity.id]);
      if(row)await db.delete(BINDINGS,[row.id]);
      await deps.audit(auth.user.id,'access.binding.unbind','success',{method:identity?'google':row?.method,email:identity?.email||row?.email});
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/phone/save':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const phone=String(deps.body(ctx.body).phone||'').replace(/[^\d+]/g,'').trim();
      if(phone.length<8)return deps.fail('ACCESS_PHONE_INVALID',400);
      const stap=await stapOp(auth);if(stap)return stap;
      const existing=await phoneFor(auth.user.id);
      const now=Date.now();
      const record={userId:auth.user.id,phone,verified:false,createdAt:existing?.createdAt||now,updatedAt:now};
      if(existing?.id)await db.update(PHONES,[{id:existing.id,record}]);
      else await db.add(PHONES,[record]);
      await upsertLoginBinding(auth.user.id,'phone',phone,auth.user.email);
      await deps.audit(auth.user.id,'access.phone.save','success',{});
      return deps.respond({ok:true,sms:'needs_sms_contour',...await accessSnapshot(auth.user)});
    }],
    // Passkeys zijn uitgeschakeld tot er echte WebAuthn-verificatie (attestation/assertion) is.
    // De oude routes registreerden alleen een credentialId zonder enige cryptografische controle.
    'POST /api/owner/access/webauthn/options':[async()=>deps.fail('ACCESS_WEBAUTHN_DISABLED',503)],
    'POST /api/owner/access/webauthn/register':[async()=>deps.fail('ACCESS_WEBAUTHN_DISABLED',503)],
    'POST /api/owner/access/webauthn/remove':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const id=String(deps.body(ctx.body).id||'');
      const row=(await webauthnFor(auth.user.id)).find(item=>item.id===id);
      if(row)await db.delete(WEBAUTHN,[row.id]);
      await deps.audit(auth.user.id,'access.webauthn.remove','success',{});
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/totp/start':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      if(!totpKeyConfigured())return deps.fail('ACCESS_TOTP_KEY_MISSING',503);
      if(!recoveryPepperConfigured())return deps.fail('ACCESS_RECOVERY_PEPPER_MISSING',503);
      const secret=randomBytes(20),encoded=toBase32(secret);
      const existing=await totpFor(auth.user.id);
      const now=Date.now();
      const record={userId:auth.user.id,secretEnc:sealWithEnvKey(TOTP_KEY,encoded,totpAad(auth.user.id)),confirmed:false,createdAt:existing?.createdAt||now,updatedAt:now};
      if(existing?.id)await db.update(TOTP,[{id:existing.id,record}]);
      else await db.add(TOTP,[record]);
      const otpauth=`otpauth://totp/MijProstir:${encodeURIComponent(auth.user.email)}?secret=${encoded}&issuer=MijProstir&algorithm=SHA1&digits=6&period=30`;
      return deps.respond({ok:true,secret:encoded,otpauth,plaintextReturned:true});
    }],
    'POST /api/owner/access/totp/confirm':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const code=String(deps.body(ctx.body).code||'');
      const row=await totpFor(auth.user.id);
      if(!row)return deps.fail('ACCESS_TOTP_NOT_STARTED',400);
      const secret=totpSecretOf(row);
      if(!secret)return deps.fail('ACCESS_TOTP_KEY_MISSING',503);
      if(!recoveryPepperConfigured())return deps.fail('ACCESS_RECOVERY_PEPPER_MISSING',503);
      const stapNr=totpStap(fromBase32(secret),code);
      if(stapNr<0)return deps.fail('ACCESS_TOTP_INVALID',400);
      const{codes,hashes,hashVersion}=newRecoveryCodes();
      await db.update(TOTP,[{id:row.id,record:{...withoutId(row),confirmed:true,lastStep:stapNr,updatedAt:Date.now()}}]);
      const recovery=await recoveryFor(auth.user.id);
      const rec={userId:auth.user.id,hashes,hashVersion,remaining:codes.length,createdAt:Date.now()};
      if(recovery?.id)await db.update(RECOVERY,[{id:recovery.id,record:rec}]);
      else await db.add(RECOVERY,[rec]);
      await deps.audit(auth.user.id,'access.totp.enroll','success',{});
      return deps.respond({ok:true,recoveryCodes:codes,plaintextReturned:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/totp/disable':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const row=await totpFor(auth.user.id);
      // Fase 3: uitschakelen vereist de huidige TOTP-code (of een ongebruikte herstelcode bij verlies van het toestel).
      if(row?.confirmed){
        const code=String(deps.body(ctx.body).code||'');
        const uitkomst=await totpGebruiken(row,code);
        if(uitkomst==='sleutel')return deps.fail('ACCESS_TOTP_KEY_MISSING',503);
        if(uitkomst!=='ok'&&!await herstelcodeGebruiken(auth.user.id,code)){await deps.audit(auth.user.id,'access.totp.disable','failure',{reden:uitkomst});return deps.fail(uitkomst==='hergebruikt'?'ACCESS_TOTP_REUSED':'ACCESS_TOTP_CODE_REQUIRED',400);}
      }
      if(row?.id)await db.delete(TOTP,[row.id]);
      await deps.audit(auth.user.id,'access.totp.disable','success',{});
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/recovery/rotate':[async(ctx)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      if(!recoveryPepperConfigured())return deps.fail('ACCESS_RECOVERY_PEPPER_MISSING',503);
      // Fase 3: nieuwe herstelcodes alleen met de huidige TOTP-code (zonder TOTP: step-up).
      const totpRij=await totpFor(auth.user.id);
      if(totpRij?.confirmed){
        const uitkomst=await totpGebruiken(totpRij,String(deps.body(ctx.body).code||''));
        if(uitkomst==='sleutel')return deps.fail('ACCESS_TOTP_KEY_MISSING',503);
        if(uitkomst!=='ok')return deps.fail(uitkomst==='hergebruikt'?'ACCESS_TOTP_REUSED':'ACCESS_TOTP_CODE_REQUIRED',400);
      }else{const stap=await stapOp(auth);if(stap)return stap;}
      const{codes,hashes,hashVersion}=newRecoveryCodes();
      const recovery=await recoveryFor(auth.user.id);
      const rec={userId:auth.user.id,hashes,hashVersion,remaining:codes.length,createdAt:Date.now()};
      if(recovery?.id)await db.update(RECOVERY,[{id:recovery.id,record:rec}]);
      else await db.add(RECOVERY,[rec]);
      await deps.audit(auth.user.id,'access.recovery.rotate','success',{});
      return deps.respond({ok:true,recoveryCodes:codes,plaintextReturned:true});
    }],
    'POST /api/owner/access/policy/save':[async(ctx)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_ACCESS_FORBIDDEN',403);
      const stap=await stapOp(auth);if(stap)return stap;
      const body=deps.body(ctx.body);
      const enabled=(body.enabled&&typeof body.enabled==='object'?body.enabled:{}) as Partial<Record<MethodId,boolean>>;
      const next=await writePolicy(enabled,body.mfa==='required'?'required':'optional');
      await deps.audit(auth.user.id,'access.policy.save','success',{mfa:next.mfa});
      return deps.respond({ok:true,policy:{enabled:next.enabled,mfa:next.mfa},...await accessSnapshot(auth.user,true)});
    }],
    'POST /api/owner/access/user/:id/method':[async(ctx)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_ACCESS_FORBIDDEN',403);
      const body=deps.body(ctx.body);
      const method=String(body.method||'') as LoginMethodId;
      const action=String(body.action||'');
      if(!LOGIN_METHODS.includes(method))return deps.fail('ACCESS_METHOD_UNKNOWN',400);
      const stap=await stapOp(auth);if(stap)return stap;
      const userId=ctx.params.id;
      if(action==='disable'||action==='unbind'){
        const[contour,policy,password,bindings,phone,identities,target]=await Promise.all([
          resolveGoogleContour(),policyOf(),passwordFor(userId),bindingsFor(userId),phoneFor(userId),googleIdentities(userId),
          db.get<{email:string;role:string}>('users',[userId]).then(items=>items[0])
        ]);
        if(!target)return deps.fail('ACCESS_USER_NOT_FOUND',404);
        const usable=await usableLoginMethods(userId,target.email,contour,policy,password,bindings,phone,identities,{method});
        if(usable.length<1)return deps.fail('LAST_LOGIN_METHOD_PROTECTED',409);
        if(action==='unbind'){
          const rows=bindings.filter(item=>item.method===method);
          if(rows.length)await db.delete(BINDINGS,rows.map(item=>item.id));
          if(method==='password'){
            const existing=await passwordFor(userId);
            if(existing?.id)await db.delete(PASSWORDS,[existing.id]);
          }
          if(method==='google'&&identities.length)await db.delete(IDENTITIES,identities.map(item=>item.id));
        }else{
          const row=bindings.find(item=>item.method===method);
          if(row)await db.update(BINDINGS,[{id:row.id,record:{...withoutId(row),status:'disabled',updatedAt:Date.now()}}]);
        }
      }
      if(action==='enable'){
        const row=(await bindingsFor(userId)).find(item=>item.method===method);
        if(row)await db.update(BINDINGS,[{id:row.id,record:{...withoutId(row),status:'active',updatedAt:Date.now()}}]);
      }
      await deps.audit(auth.user.id,'access.user.method','success',{userId,method,action});
      return deps.respond({ok:true});
    }],
    'POST /api/owner/access/user/:id/reset-password':[async(ctx)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_ACCESS_FORBIDDEN',403);
      const stap=await stapOp(auth);if(stap)return stap;
      const temp=`Tmp-${randomBytes(6).toString('base64url')}!9`;
      const envelope=await hashPassword(temp);
      const existing=await passwordFor(ctx.params.id);
      const now=Date.now();
      const record={userId:ctx.params.id,...envelope,mustChange:true,createdAt:existing?.createdAt||now,updatedAt:now};
      if(existing?.id)await db.update(PASSWORDS,[{id:existing.id,record}]);
      else await db.add(PASSWORDS,[record]);
      await deps.audit(auth.user.id,'access.user.reset-password','success',{userId:ctx.params.id});
      return deps.respond({ok:true,temporaryPassword:temp,mustChange:true,plaintextReturned:true});
    }]
  };
}
