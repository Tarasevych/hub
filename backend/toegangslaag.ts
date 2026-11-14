import {createHash,createHmac,randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {limietSleutel} from '../shared/ip-limiet';
import {db,clearLoginFailures,envKey32,isOwnerEmail,openWithEnvKey,pepperedHash,pogingReserveren,sealWithEnvKey} from '../server/platform';
import {publicGoogleContour,resolveGoogleContour,type GoogleContour} from './google-contour';
import {STAP_OP_MS,STAP_OP_ONTHOUD_MS,onthoudMagVoorActie,onthoudVastleggen,onthoudenSessies,onthoudSessieId,passkeyStapOpGeldig,stapOpFout,stapOpGeldig,stapOpGeldigTot,stapOpSessieId,totpStapOpVastleggen,codewoordStapOpVastleggen,type StapOpAuth} from './stap-op';
import {passkeyAantal} from './toegangssleutels';
import {codewoordHeeft, codewoordControleren} from './codewoord';
import {meld} from './melder';
import {meldBeveiligingsWijziging} from './beveiliging-meldingen'; /* SEC-002 privacy-logboek-03 */
import {herstelcodeGebruiktMelden} from './nieuw-apparaat';
import {reserveBijnaOpMelden} from './reserve-herinnering'; /* IDENTITEIT-014 */
import {apparaat} from '../server/platform/audit';
import {huidigeContext} from '../server/platform/context';
import {actieVan,gebruikVastleggen,gebruikVoor,registreerMethodenBron,sterkeStapOpFout} from './toegang-context';
import {kritiekeActie} from '../shared/kritieke-acties';
import {stapOpKanalen} from './apparaat-bevestiging/kanalen'; /* APPARAAT-001 */
import {magEigenToegang} from '../shared/eigen-toegang'; /* IDENTITEIT-012 */
import {registreerTweedeFactorBeleid,tweedeFactorBeleidVergeten,tweedeFactorBevestigdOp,tweedeFactorVers} from './tweede-factor-poort';
import {codewoordSessieId} from '../shared/codewoord-poort'; /* IDENTITEIT-015: правило mfa діє під час входу */

const scryptAsync=promisify(scrypt) as (password:string,salt:Buffer|string,keylen:number,options?:import('node:crypto').ScryptOptions)=>Promise<Buffer>;
export const METHOD_IDS=['google','password','microsoft','apple','facebook','phone','totp','recovery','webauthn','push'] as const;
export type MethodId=typeof METHOD_IDS[number];
export type LoginMethodId='google'|'password'|'microsoft'|'apple'|'facebook'|'phone';
/** Fase 3: ontkoppeld = uitgeschakeld met ontkoppeldAt/herstelTot (7 dagen terug te zetten), niet verwijderd. */
/** ontkoppeldDoor: userId van wie ontkoppelde; ontkoppeldDoorBeheer: door beheerder (niet zelf terug te zetten). */
type Ontkoppeld={ontkoppeldAt?:number;herstelTot?:number;ontkoppeldDoor?:string;ontkoppeldDoorBeheer?:boolean};
type Door={userId:string;beheer:boolean};
type Binding={id:string;userId:string;method:LoginMethodId;providerSubject:string;email:string;status:'active'|'disabled'|'pending';lastUsedAt:number;createdAt:number;updatedAt:number}&Ontkoppeld;
type PasswordRecord={id:string;userId:string;algorithm:'scrypt';n:number;r:number;p:number;salt:string;hash:string;mustChange:boolean;createdAt:number;updatedAt:number}&Ontkoppeld;
type TotpRecord={id:string;userId:string;secret?:string;secretEnc?:string;confirmed:boolean;createdAt:number;updatedAt:number;/** fase 3: laatst gebruikt tijdvak (replaybescherming) */lastStep?:number;/** audit-fix 2: nieuw geheim tijdens vervangen; het oude blijft geldig tot dit bevestigd is */pendingSecretEnc?:string;pendingAt?:number;/** SEC-002 (aanmelden-01): sessie die de eerste inschrijving (met step-up) begon; alleen zij mag bevestigen */startSessie?:string};
/** bekekenOp: de gebruiker bevestigde «Я зберіг коди» (de codes zelf worden maar één keer getoond). */
// Herstelcodes (GitHub-achtig): de codes zelf alleen gehasht (HMAC + pepper). Voor het overzicht per code: volgnummer en de
// laatste 2 tekens (hint, 8 bits van 48: raden blijft 2^40 per code, met lockout), wanneer gebruikt, en of de set is ingetrokken.
type HerstelRegel={nr:number;hint:string;hash:string};
type RecoveryRecord={id:string;userId:string;hashes:string[];hashVersion?:number;createdAt:number;remaining:number;bekekenOp?:number;totaal?:number;overzicht?:HerstelRegel[];gebruikt?:Record<string,number>;ingetrokkenOp?:number};
type PhoneRecord={id:string;userId:string;phone:string;verified:boolean;createdAt:number;updatedAt:number}&Ontkoppeld;
type WebauthnRecord={id:string;userId:string;credentialId:string;label:string;createdAt:number};
type PolicyRecord={id:string;tenantKey:string;enabled:Partial<Record<MethodId,boolean>>;mfa:'optional'|'required';updatedAt:number};
type GoogleIdentity={id:string;accountId:string;provider:string;subject:string;email:string;status:string;lastUsedAt:number;createdAt:number}&Ontkoppeld;
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
const TOTP_VERVANG_MS=15*60*1000;
const totpPendingOf=(row:TotpRecord)=>{if(!row.pendingSecretEnc||Date.now()-Number(row.pendingAt||0)>TOTP_VERVANG_MS)return'';try{return openWithEnvKey(TOTP_KEY,row.pendingSecretEnc,totpAad(row.userId))}catch{return''}};
const totpSecretOf=(row:TotpRecord)=>{
  if(row.secretEnc){try{return openWithEnvKey(TOTP_KEY,row.secretEnc,totpAad(row.userId))}catch(err){console.error('[totp] ontsleutelen mislukt:',(err as Error).message);return''}}
  return String(row.secret||'');
};
const newRecoveryCodes=()=>{
  const codes=Array.from({length:10},()=>randomBytes(8).toString('hex').slice(0,12).toUpperCase());
  return{codes,hashes:codes.map(item=>recoveryHash(item)),hashVersion:2};
};
/** Nieuwe set herstelcodes als record (met overzicht voor de lijst); de klare codes gaan één keer terug naar de gebruiker. */
const nieuweHerstelSet=(userId:string)=>{
  const{codes,hashes,hashVersion}=newRecoveryCodes();
  const rec:Omit<RecoveryRecord,'id'>={userId,hashes,hashVersion,remaining:codes.length,totaal:codes.length,createdAt:Date.now(),overzicht:codes.map((c,i)=>({nr:i+1,hint:c.slice(-2),hash:hashes[i]})),gebruikt:{}};
  return{codes,rec};
};
/** Invoer zoals de gebruiker hem typt of plakt: «A1B2-C3D4-E5F6», met spaties, kleine letters. */
const herstelNorm=(code:string)=>String(code||'').replace(/[\s-]/g,'').toUpperCase();
/** Overzicht voor «Коди відновлення»: alleen gemaskeerd, nooit hashes. */
export function herstelOverzicht(r:RecoveryRecord|null){
  if(!r)return{codes:[],resterend:0,totaal:0,createdAt:0,bekekenOp:0,ingetrokkenOp:0};
  const open=new Set(r.hashes||[]);
  const codes=(r.overzicht||[]).map(x=>({nr:x.nr,hint:x.hint,sleutel:herstelCodeSleutel(r,x.nr),status:open.has(x.hash)?'ongebruikt':r.gebruikt?.[x.hash]?'gebruikt':r.ingetrokkenOp?'ingetrokken':'gebruikt',gebruiktOp:Number(r.gebruikt?.[x.hash]||0)}));
  return{codes,resterend:Math.max(0,r.remaining||0),totaal:r.totaal||r.overzicht?.length||Math.max(0,r.remaining||0),createdAt:r.createdAt||0,setSleutel:herstelSetSleutel(r),bekekenOp:r.bekekenOp||0,ingetrokkenOp:r.ingetrokkenOp||0};
}
/** Overzicht + per code de laatste N keer gebruik (waarvoor, waar, apparaat, IP-hash) — §13.10. */
async function herstelOverzichtVol(userId:string,r:RecoveryRecord|null){
  const o=herstelOverzicht(r);
  const gebruik=await gebruikVoor(userId,'herstelcode',o.codes.map(c=>c.sleutel));
  return{...o,codes:o.codes.map(c=>({...c,gebruik:gebruik.get(c.sleutel)||[]}))};
}
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
/** Sleutel van een herstelcodeset (createdAt blijft per set gelijk; het record zelf wordt bij «Створити нові» hergebruikt). */
export const herstelSetSleutel=(r:{createdAt?:number}|null)=>String(Number(r?.createdAt||0));
const herstelCodeSleutel=(r:{createdAt?:number}|null,nr:number)=>`${herstelSetSleutel(r)}:${nr}`;
/**
 * Eenmalige herstelcode verbruiken (atomisch). Legt daarna vast WAARVOOR (actie uit de vaste lijst), waar, apparaat en IP-hash
 * (backend/toegang-context.ts). Geeft de sleutel van de code («<set>:<nr>») of '' als hij niet (meer) geldt.
 */
async function herstelcodeGebruiken(userId:string,code:string,actie:unknown='bevestigen',dienst?:string,melden=true):Promise<string>{
  const recovery=await recoveryFor(userId);
  const hashed=recovery&&!recovery.ingetrokkenOp?recoveryMatches(recovery,herstelNorm(code)):'';
  if(!recovery||!hashed||!recovery.hashes.includes(hashed))return'';
  if(!await db.takeArrayValue(RECOVERY,recovery.id,'hashes',hashed,'remaining'))return'';
  // Alleen voor het overzicht (doorgestreept + datum); atomisch en los van de hashes.
  await db.zetEenmaligInMap(RECOVERY,recovery.id,'gebruikt',hashed,Date.now()).catch(()=>false);
  const nr=(recovery.overzicht||[]).find(x=>x.hash===hashed)?.nr||0;
  const sleutel=nr?herstelCodeSleutel(recovery,nr):`${herstelSetSleutel(recovery)}:0`;
  await gebruikVastleggen(userId,'herstelcode',sleutel,actie,dienst?{dienst}:{});
  /* UI-014 fase 2A (vlag v3): melding bij inloggen/TOTP-wijzigen met herstelcode; de step-up-route meldt al zelf (melden=false) */
  if(melden)void herstelcodeGebruiktMelden(userId,String(actie||''),apparaat(huidigeContext()?.ua));
  /* IDENTITEIT-014: ≤2 codes over → één keer per set access_recovery_low (alle drie de wegen komen hier langs; fouten worden afgevangen) */
  await reserveBijnaOpMelden(userId,async()=>{const r=await recoveryFor(userId);return r?{over:Number(r.remaining||0),ingetrokken:!!r.ingetrokkenOp}:null},()=>db.zetEenmaligInMap(RECOVERY,recovery.id,'laagGemeld',herstelSetSleutel(recovery),Date.now()).catch(()=>false));
  return sleutel;
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
/** Ook een ontkoppeld (uitgeschakeld) wachtwoord: voor overschrijven en terugzetten. */
async function passwordRecordAny(userId:string){
  const rows=await db.list<Omit<PasswordRecord,'id'>>(PASSWORDS,{filter:{userId},limit:5});
  return(rows.items as PasswordRecord[])[0]||null;
}
/** Actief wachtwoord (ontkoppeld telt niet: geen aanmelden, geen aanmeldmethode). */
async function passwordFor(userId:string){
  const row=await passwordRecordAny(userId);
  return row&&!row.ontkoppeldAt?row:null;
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
// IDENTITEIT-015: ворота входу (backend/tweede-factor-poort.ts) читають правило звідси, без циклу імпортів.
registreerTweedeFactorBeleid(async()=>(await policyOf()).mfa);
// §13.10: welke «sterke» methoden heeft iemand? Dan telt Google alleen niet als step-up voor het intrekken van rechten.
registreerMethodenBron(async(userId)=>{
  const[p,t,h]=await Promise.all([passkeyAantal(userId).catch(()=>0),totpFor(userId),recoveryFor(userId)]);
  return{passkey:p>0,totp:!!t?.confirmed,herstelcode:!!h&&!h.ingetrokkenOp&&(h.remaining||0)>0};
});
async function phoneRecordAny(userId:string){
  const rows=await db.list<Omit<PhoneRecord,'id'>>(PHONES,{filter:{userId},limit:5});
  return(rows.items as PhoneRecord[])[0]||null;
}
async function phoneFor(userId:string){
  const row=await phoneRecordAny(userId);
  return row&&!row.ontkoppeldAt?row:null;
}
async function webauthnFor(userId:string){
  const rows=await db.list<Omit<WebauthnRecord,'id'>>(WEBAUTHN,{filter:{userId},limit:20});
  return rows.items as WebauthnRecord[];
}
async function googleIdentitiesAll(userId:string){
  const rows=await db.list<Omit<GoogleIdentity,'id'>>(IDENTITIES,{filter:{accountId:userId},limit:40});
  return(rows.items as GoogleIdentity[]).filter(item=>item.provider==='google');
}
async function googleIdentities(userId:string){
  return(await googleIdentitiesAll(userId)).filter(item=>item.status!=='disabled');
}

// ---- Fase 3: ontkoppelen = 7 dagen uitschakelen (terug te zetten), melding aan het account ----
export const HERSTEL_MS=7*24*60*60*1000;
const zonder=<T extends Record<string,unknown>>(row:T,...velden:string[])=>Object.fromEntries(Object.entries(row).filter(([k])=>k!=='id'&&!velden.includes(k)));
const doorVelden=(door:Door)=>({ontkoppeldDoor:door.userId,ontkoppeldDoorBeheer:door.beheer});
async function ontkoppelBindingen(rows:Binding[],door:Door){
  const nu=Date.now();
  if(rows.length)await db.update(BINDINGS,rows.map(row=>({id:row.id,record:{...zonder(row),status:'disabled',ontkoppeldAt:nu,herstelTot:nu+HERSTEL_MS,...doorVelden(door),updatedAt:nu}})));
}
async function ontkoppelIdentiteiten(rows:GoogleIdentity[],door:Door){
  const nu=Date.now();
  if(rows.length)await db.update(IDENTITIES,rows.map(row=>({id:row.id,record:{...zonder(row),status:'disabled',ontkoppeldAt:nu,herstelTot:nu+HERSTEL_MS,...doorVelden(door)}})));
}
async function ontkoppelEnkel(table:string,row:{id:string}&Record<string,unknown>|null,door:Door){
  if(!row)return;
  const nu=Date.now();
  await db.update(table,[{id:row.id,record:{...zonder(row),ontkoppeldAt:nu,herstelTot:nu+HERSTEL_MS,...doorVelden(door),updatedAt:nu}}]);
}
/** Een hele methode ontkoppelen (bindingen + bijbehorend wachtwoord/telefoon/Google-identiteiten). */
async function ontkoppelMethode(userId:string,method:LoginMethodId,door:Door){
  await ontkoppelBindingen((await bindingsFor(userId)).filter(item=>item.method===method&&item.status!=='disabled'),door);
  if(method==='password')await ontkoppelEnkel(PASSWORDS,await passwordFor(userId),door);
  if(method==='phone')await ontkoppelEnkel(PHONES,await phoneFor(userId),door);
  if(method==='google')await ontkoppelIdentiteiten(await googleIdentities(userId),door);
}
/**
 * Audit-fix 6: wie mag terugzetten? Alleen wie ontkoppelde (zelf), of een beheerder. Door een beheerder ontkoppeld
 * = nooit zelf terug te zetten. Oude rijen zonder ontkoppeldDoor: niet zelf (veilig falen; beheerder kan wel).
 */
const zelfTerugTeZetten=(r:Ontkoppeld,userId:string)=>!r.ontkoppeldDoorBeheer&&r.ontkoppeldDoor===userId;
/** Methode terugzetten (gedeeld door de eigen route en de beheerroute). */
async function zetTerug(userId:string,items:Awaited<ReturnType<typeof herstelbaar>>){
  const nu=Date.now(),telefoon=await phoneRecordAny(userId);
  const weg=(row:Record<string,unknown>)=>zonder(row,'ontkoppeldAt','herstelTot','ontkoppeldDoor','ontkoppeldDoorBeheer');
  for(const item of items){
    if(item.soort==='binding'){const[row]=await db.get<Omit<Binding,'id'>>(BINDINGS,[item.id]);if(row)await db.update(BINDINGS,[{id:item.id,record:{...weg(row as Record<string,unknown>),status:row.method==='phone'&&!telefoon?.verified?'pending':'active',updatedAt:nu}}]);}
    if(item.soort==='identiteit'){const[row]=await db.get<Omit<GoogleIdentity,'id'>>(IDENTITIES,[item.id]);if(row)await db.update(IDENTITIES,[{id:item.id,record:{...weg(row as Record<string,unknown>),status:'active'}}]);}
    if(item.soort==='wachtwoord'||item.soort==='telefoon'){const table=item.soort==='wachtwoord'?PASSWORDS:PHONES;const[row]=await db.get<Record<string,unknown>>(table,[item.id]);if(row)await db.update(table,[{id:item.id,record:{...weg(row),updatedAt:nu}}]);}
  }
}
/** TOTP-code of ongebruikte herstelcode controleren, met atomische lockout (audit-fix 7). */
async function codeControleren(userId:string,row:TotpRecord|null,code:string,herstelcodeActie:string|false='bevestigen'):Promise<{uitkomst:'ok'|'ongeldig'|'hergebruikt'|'sleutel'|'geblokkeerd';wachtSeconden:number}>{
  const subject=`stap-op:${userId}`;
  const poging=await pogingReserveren(subject);
  if(!poging.toegestaan)return{uitkomst:'geblokkeerd',wachtSeconden:poging.wachtSeconden};
  const uitkomst=row?await totpGebruiken(row,code):'ongeldig';
  if(uitkomst==='sleutel')return{uitkomst:'sleutel',wachtSeconden:0};
  if(uitkomst==='ok'||(herstelcodeActie!==false&&await herstelcodeGebruiken(userId,code,herstelcodeActie))){await clearLoginFailures(subject);return{uitkomst:'ok',wachtSeconden:0};}
  return{uitkomst,wachtSeconden:0};
}
const codeFout=(uitkomst:string,wachtSeconden=0)=>uitkomst==='geblokkeerd'?{code:'ACCESS_LOCKED_TEMPORARILY',http:429,extra:wachtSeconden>0?{retryAfter:wachtSeconden}:undefined}:uitkomst==='sleutel'?{code:'ACCESS_TOTP_KEY_MISSING',http:503,extra:undefined}:uitkomst==='hergebruikt'?{code:'ACCESS_TOTP_REUSED',http:400,extra:undefined}:{code:'ACCESS_TOTP_CODE_REQUIRED',http:400,extra:undefined};
const meldOntkoppeld=(userId:string,method:string,doorBeheer=false)=>meld(userId,'access_method_unlinked',
  'Спосіб входу від’єднано / Aanmeldmethode ontkoppeld',
  `${doorBeheer?'Адміністратор від’єднав':'Від’єднано'} спосіб входу «${method}». Протягом 7 днів його можна відновити на сторінці безпеки. Якщо це були не ви — відновіть і змініть доступ. / ${doorBeheer?'Een beheerder heeft':'Er is'} aanmeldmethode "${method}" ontkoppeld. Binnen 7 dagen kunt u die terugzetten op de beveiligingspagina. Was u dit niet: zet hem terug en controleer uw toegang.`);
/** Wat binnen 7 dagen terug te zetten is. */
async function herstelbaar(userId:string){
  const nu=Date.now();
  const[bindings,identities,password,phone]=await Promise.all([bindingsFor(userId),googleIdentitiesAll(userId),passwordRecordAny(userId),phoneRecordAny(userId)]);
  const open=(r:Ontkoppeld|null|undefined)=>!!r?.ontkoppeldAt&&Number(r.herstelTot||0)>nu;
  return[
    ...bindings.filter(open).map(r=>({id:r.id,soort:'binding' as const,method:r.method,herstelTot:Number(r.herstelTot),zelf:zelfTerugTeZetten(r,userId),doorBeheer:!!r.ontkoppeldDoorBeheer})),
    ...identities.filter(open).map(r=>({id:r.id,soort:'identiteit' as const,method:'google' as const,herstelTot:Number(r.herstelTot),zelf:zelfTerugTeZetten(r,userId),doorBeheer:!!r.ontkoppeldDoorBeheer})),
    ...(password&&open(password)?[{id:password.id,soort:'wachtwoord' as const,method:'password' as const,herstelTot:Number(password.herstelTot),zelf:zelfTerugTeZetten(password as Ontkoppeld,userId),doorBeheer:!!(password as Ontkoppeld).ontkoppeldDoorBeheer}]:[]),
    ...(phone&&open(phone)?[{id:phone.id,soort:'telefoon' as const,method:'phone' as const,herstelTot:Number(phone.herstelTot),zelf:zelfTerugTeZetten(phone as Ontkoppeld,userId),doorBeheer:!!(phone as Ontkoppeld).ontkoppeldDoorBeheer}]:[])
  ];
}

const methodConfigured=(method:LoginMethodId,contour:GoogleContour,password:PasswordRecord|null,phone:PhoneRecord|null)=>{
  if(method==='google')return contour.credentialsConfigured;
  if(method==='password')return Boolean(password);
  // Fase 3: telefoon telt pas na verificatie (tot dan 'pending').
  if(method==='phone')return Boolean(phone?.verified);
  return false;
};

export async function upsertLoginBinding(userId:string,method:LoginMethodId,providerSubject:string,email:string,status:'active'|'pending'='active'){
  const existing=(await bindingsFor(userId)).find(item=>item.method===method&&(item.providerSubject===providerSubject||(!providerSubject&&item.email===email)));
  const now=Date.now();
  if(existing){
    const{ontkoppeldAt:_o,herstelTot:_h,...basis}=existing;
    const record={...basis,providerSubject:providerSubject||existing.providerSubject,email:email||existing.email,status,lastUsedAt:now,updatedAt:now};
    const{id,...stored}=record;
    await db.update(BINDINGS,[{id,record:stored}]);
    return;
  }
  await db.add(BINDINGS,[{userId,method,providerSubject,email,status,lastUsedAt:now,createdAt:now,updatedAt:now}]);
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
    if(method==='phone'){if(nextPhone?.verified)usable.push({id:'phone',bound:true});continue;}
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
  const passkeys=await passkeyAantal(user.id);
  const googleBound=identities.length>0||usable.some(item=>item.id==='google');
  const catalog=LOGIN_METHODS.map(id=>{
    const bound=id==='google'?googleBound:id==='password'?Boolean(password):id==='phone'?Boolean(phone?.verified):bindings.some(item=>item.method===id&&item.status==='active');
    const enabled=policy.enabled[id]!==false;
    const configured=methodConfigured(id,contour,password,phone);
    const honest=id==='microsoft'||id==='apple'||id==='facebook'?'needs_provider_contour':id==='phone'&&!phone?'needs_sms_contour':'';
    return{id,kind:'login' as const,enabled,configured:id==='google'?contour.credentialsConfigured:configured,bound,status:!enabled?'disabled':bound?'active':id==='phone'&&phone&&!phone.verified?'pending':configured?'ready':'not_configured',honest};
  });
  const factors=[
    {id:'totp',enabled:policy.enabled.totp!==false,enrolled:Boolean(totp?.confirmed),status:totp?.confirmed?'active':'not_enrolled'},
    {id:'recovery',enabled:true,enrolled:Boolean(recovery&&recovery.remaining>0),status:recovery&&recovery.remaining>0?'active':'not_enrolled',remaining:recovery?.remaining||0,createdAt:recovery?.createdAt||0,bekekenOp:recovery?.bekekenOp||0,ingetrokken:Boolean(recovery?.ingetrokkenOp)/* IDENTITEIT-014: відкликаний набір ≠ «закінчився» */},
    {id:'passkey',enabled:true,enrolled:passkeys>0,status:passkeys>0?'active':'not_enrolled',count:passkeys},
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
    phone:{configured:Boolean(phone),verified:Boolean(phone?.verified),pending:Boolean(phone&&!phone.verified),value:phone?.phone||''},
    herstelbaar:await herstelbaar(user.id),
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

/** Lockout-onderwerp per (e-mail, IP) (audit-fix 10): een aanvaller kan zo niet iemands account wereldwijd blokkeren. */
/** SEC-002 (aanmelden-08): vaste nep-rij voor de scrypt-ronde bij een onbekend adres (zelfde kosten als een echte controle; klopt nooit). */
const LEEG_WACHTWOORD={salt:'c2VjLTAwMi1nZWVuLWFjY291bnQ',hash:'',n:16384,r:8,p:1} as unknown as PasswordRecord;
/* SEC-002 (http-rand-05): bij IPv6 het /64-net in plaats van het losse adres (shared/ip-limiet.ts) — anders gaf elk volgend adres uit het eigen net van de aanvaller een verse teller en een verse blokkade. IPv4: ongewijzigd (zelfde onderwerp als voorheen). */
const wachtwoordOnderwerp=(email:string,ip:string)=>`wachtwoord:${email}:${createHash('sha256').update(`lockout-ip:${limietSleutel(ip)||'onbekend'}`).digest('hex').slice(0,24)}`;
export async function verifyPasswordLogin(email:string,password:string,totp='',ip='',dienst=''){
  const clean=String(email||'').trim().toLowerCase();
  if(!clean||!password)return{status:'invalid' as const,code:'ACCESS_CREDENTIALS_INVALID',http:400};
  const policy=await policyOf();
  if(policy.enabled.password===false)return{status:'disabled' as const,code:'ACCESS_PASSWORD_DISABLED',http:403};
  const users=await db.list<{id:string;email:string;status:string;role:string;name?:string}>('users',{filter:{email:clean},limit:5});
  const user=users.items[0];
  const totpRow=user?await totpFor(user.id):null;
  // SEC-002 (aanmelden-08): geen aparte toestand «MFA_REQUIRED» meer vóór de wachtwoordcontrole. Die verried aan een anonieme
  // beller welke adressen een account met TOTP hebben (200 'mfa' tegenover 401) en telde niet mee voor de lockout.
  // Nu: de poging wordt gereserveerd vóór elke vertakking; e-mail, wachtwoord en code komen in één verzoek, en elk ander geval
  // (onbekend adres, fout wachtwoord, code ontbreekt of is fout) geeft hetzelfde antwoord ACCESS_CREDENTIALS_INVALID.
  // Atomische lockout per (e-mail, IP), ook voor onbekende adressen (gedrag verraadt niets).
  const subject=wachtwoordOnderwerp(clean,ip);
  const poging=await pogingReserveren(subject);
  if(!poging.toegestaan)return{status:'locked' as const,code:'ACCESS_LOCKED_TEMPORARILY',http:429,retryAfter:poging.wachtSeconden};
  const failed=async(code:string)=>({status:'invalid' as const,code,http:401,retryAfter:0});
  const record=user&&user.status!=='blocked'&&user.status!=='deleted'?await passwordFor(user.id):null;
  // Zonder account of wachtwoordrij toch één scrypt-ronde: de antwoordtijd verraadt dan niet of het adres bestaat.
  if(!record){await verifyPassword(LEEG_WACHTWOORD,password).catch(()=>false);return failed('ACCESS_CREDENTIALS_INVALID');}
  if(!user||!await verifyPassword(record,password))return failed('ACCESS_CREDENTIALS_INVALID');
  if(totpRow?.confirmed){
    // Of het wachtwoord klopt, blijkt pas samen met een geldige code (geen wachtwoord-orakel zonder tweede factor).
    if(!totp)return failed('ACCESS_CREDENTIALS_INVALID');
    const uitkomst=await totpGebruiken(totpRow,totp);
    if(uitkomst==='sleutel')return{status:'unavailable' as const,code:'ACCESS_TOTP_KEY_MISSING',http:503};
    if(uitkomst!=='ok'){
      // Atomisch eenmalig (herstelcodeGebruiken → takeArrayValue): bij gelijktijdig gebruik van dezelfde code wint precies
      // één verzoek, de rest krijgt ACCESS_CREDENTIALS_INVALID. Ingetrokken sets tellen niet.
      if(!await herstelcodeGebruiken(user.id,totp,'inloggen',dienst||undefined))return failed('ACCESS_CREDENTIALS_INVALID');
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

/** Client-IP zoals requestMeta in index.ts (X-Forwarded-For wordt door start.ts/Caddy gezet). */
const ipVan=(event:Record<string,unknown>)=>{const h=(event.headers||{}) as Record<string,string|undefined>;const f=String(h['x-forwarded-for']||h['X-Forwarded-For']||'').split(',')[0].trim();return f||String(((event.requestContext||{}) as {http?:{sourceIp?:string}}).http?.sourceIp||'');};
export function createAccessPlaneRoutes(deps:{
  requireSession:(event:Record<string,unknown>,body:unknown)=>Promise<SessionAuth>;
  respond:(data:unknown,status?:number)=>any;
  fail:(message:string,status?:number,extra?:{retryAfter?:number;maxAttempts?:number;windowSec?:number})=>any;
  audit:(userId:string,action:string,result:string,details?:Record<string,unknown>)=>Promise<unknown>;
  body:(body:unknown)=>Record<string,unknown>;
}){
  const gate=async(event:Record<string,unknown>,body:unknown)=>{
    const auth=await deps.requireSession(event,body);
    /* IDENTITEIT-012: та сама умова, що в ключах доступу й сховищі ключів (shared/eigen-toegang.ts). */
    if('errorCode'in auth||!magEigenToegang(auth.user))return null;
    return auth;
  };
  const ownerGate=async(event:Record<string,unknown>,body:unknown)=>{
    const auth=await gate(event,body);
    // Fase 3: eigenaar = rol owner ÉN OWNER_EMAIL (isOwnerEmail), overal dezelfde regel.
    if(!auth||auth.user.role!=='owner'||!isOwnerEmail(auth.user.email))return null;
    return auth;
  };
  // Fase 3: step-up (verse Google-aanmelding of TOTP binnen 5 min) voor gevoelige acties; null = mag door.
  // Deze poort beschermt aanmeldmethoden (wachtwoord zetten, methoden ontkoppelen): een onthouden browser telt hier nooit.
  const stapOp=async(auth:unknown,actie='aanmeldmethode')=>{const fout=kritiekeActie(actie)?await sterkeStapOpFout(auth as StapOpAuth):await stapOpFout(auth as StapOpAuth,{onthoud:false});return fout?deps.fail(fout,403):null;};
  /** «Запам'ятати цей браузер»: alleen als de gebruiker het aanvinkte EN deze actie onthouden mag. Geeft de einddatum of 0. */
  const onthoudNaBevestiging=async(auth:unknown,body:Record<string,unknown>,actie:string)=>(body.onthoud===true&&onthoudMagVoorActie(actie)?await onthoudVastleggen(auth as StapOpAuth).catch(()=>0):0);
  const zelf=(auth:{user:{id:string}}):Door=>({userId:auth.user.id,beheer:false});
  return{
    // Step-up met TOTP: daarna mag deze sessie 5 minuten gevoelige acties doen. Lockout na herhaald falen.
    'POST /api/owner/access/stap-op':[async(ctx:{event:Record<string,unknown>;body:unknown})=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const body=deps.body(ctx.body);
      // Venster «Підтвердіть доступ»: methode 'herstelcode' = een ongebruikte herstelcode (eenmalig, zelfde lockout, melding).
      if(body.methode==='herstelcode'){
        const herstel=await recoveryFor(auth.user.id);
        if(!herstel||herstel.remaining<=0)return deps.fail('STEP_UP_RECOVERY_NOT_ENROLLED',400);
        if(!recoveryPepperConfigured())return deps.fail('ACCESS_RECOVERY_PEPPER_MISSING',503);
        const poging=await pogingReserveren(`stap-op:${auth.user.id}`);
        if(!poging.toegestaan)return deps.fail('ACCESS_LOCKED_TEMPORARILY',429,{retryAfter:poging.wachtSeconden});
        // actie: label uit de vaste lijst (toegang-context ACTIES); onbekend → 'onbekend'. Host = dienst van de sessie.
        const actie=actieVan(body.actie);
        const sleutel=await herstelcodeGebruiken(auth.user.id,String(body.code||''),actie,auth.service,false);
        if(!sleutel){await deps.audit(auth.user.id,'access.step-up','failure',{methode:'herstelcode'});return deps.fail('ACCESS_RECOVERY_INVALID',400);}
        await clearLoginFailures(`stap-op:${auth.user.id}`);
        await totpStapOpVastleggen(auth as unknown as StapOpAuth,'herstelcode');
        const onthoudTot=await onthoudNaBevestiging(auth,body,actie);
        await deps.audit(auth.user.id,'access.step-up','success',{methode:'herstelcode',actie,herstelnr:sleutel.split(':')[1]});
        const over=Math.max(0,(await recoveryFor(auth.user.id))?.remaining||0);
        await meld(auth.user.id,'access_recovery_code_used','Використано код відновлення / Herstelcode gebruikt',
          `Для підтвердження дії використано код відновлення. Залишилось кодів: ${over}. Якщо це були не ви — негайно створіть нові коди. / Er is een herstelcode gebruikt om een actie te bevestigen. Resterende codes: ${over}. Was u dit niet: maak direct nieuwe codes.`);
        return deps.respond({ok:true,stepUp:'herstelcode',maxAgeSeconds:300,resterend:over,onthouden:onthoudTot>0,onthoudTot});
      }
      const row=await totpFor(auth.user.id);
      if(!row?.confirmed)return deps.fail('STEP_UP_TOTP_NOT_ENROLLED',400);
      // Audit-fix 7: poging atomisch gereserveerd vóór de controle (geen race rond de lockout); alleen TOTP, geen herstelcode.
      const{uitkomst,wachtSeconden}=await codeControleren(auth.user.id,row,String(body.code||''),false);
      if(uitkomst==='geblokkeerd')return deps.fail('ACCESS_LOCKED_TEMPORARILY',429,{retryAfter:wachtSeconden});
      if(uitkomst==='sleutel')return deps.fail('ACCESS_TOTP_KEY_MISSING',503);
      if(uitkomst!=='ok'){await deps.audit(auth.user.id,'access.step-up','failure',{reden:uitkomst});return deps.fail(uitkomst==='hergebruikt'?'ACCESS_TOTP_REUSED':'ACCESS_TOTP_INVALID',400);}
      await totpStapOpVastleggen(auth as unknown as StapOpAuth);
      const onthoudTot=await onthoudNaBevestiging(auth,body,actieVan(body.actie));
      await deps.audit(auth.user.id,'access.step-up','success',{methode:'totp',onthouden:onthoudTot>0});
      return deps.respond({ok:true,stepUp:'totp',maxAgeSeconds:300,onthouden:onthoudTot>0,onthoudTot});
    }],
    // Venster «Підтвердіть доступ»: wie is aangemeld en welke manieren deze gebruiker echt heeft (geen geheimen, alleen ja/nee/aantal).
    'POST /api/owner/access/stap-op/methoden':[async(ctx:{event:Record<string,unknown>;body:unknown})=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const body=deps.body(ctx.body);
      const[totp,herstel,passkeys,heeftCodewoord,geldigTot,onthouden]=await Promise.all([totpFor(auth.user.id),recoveryFor(auth.user.id),passkeyAantal(auth.user.id),codewoordHeeft(auth.user.id),stapOpGeldigTot(auth as unknown as StapOpAuth),onthoudenSessies(auth.user.id)]);
      const u=auth.user as {email:string;name?:string;picture?:string};
      const foto=typeof u.picture==='string'&&/^https:\/\/[a-z0-9.-]*\.googleusercontent\.com\//i.test(u.picture)?u.picture.slice(0,2048):'';
      // Mag deze actie onthouden worden? «sterk» (rechten intrekken, sleutels, goedkeuren) en de lijst NOOIT_ONTHOUDEN: nee.
      const onthoudMag=body.sterk!==true&&onthoudMagVoorActie(actieVan(body.actie));
      const onthoudTot=Number(onthouden[onthoudSessieId(auth as unknown as StapOpAuth)]||0);
      // APPARAAT-001: kanalen zonder sleutel op dit apparaat (Telegram, ander apparaat) volgens de bevestigingstabel; nooit voor «sterk».
      const kanalen=body.sterk===true?null:await stapOpKanalen(auth as never).catch(()=>null);
      return deps.respond({ok:true,email:auth.user.email,naam:String(u.name||'').slice(0,120),foto,
        methoden:{passkey:passkeys>0,totp:Boolean(totp?.confirmed),herstelcode:Boolean(herstel&&herstel.remaining>0),google:true,codewoord:heeftCodewoord,telegram:!!kanalen?.telegram,apparaat:!!kanalen?.apparaat},
        kanalen:kanalen?{apparaten:kanalen.apparaten,reden:kanalen.reden,eis:kanalen.eis,eisTekst:kanalen.eisTekst}:null,
        geldigTot,maxAgeSeconds:STAP_OP_MS/1000,onthoudMag,onthoudTot,onthoudUren:Math.round(STAP_OP_ONTHOUD_MS/3600000)});
    }],
    // Codewoord als step-up (4.3): alternatief voor passkey/TOTP bij hoog risico.
    'POST /api/owner/access/stap-op/codewoord':[async(ctx:{event:Record<string,unknown>;body:unknown})=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const woord=String(deps.body(ctx.body).woord||'');
      const c=await codewoordControleren(auth.user.id,woord);
      if(!c.ok)return deps.fail(c.code==='GEBLOKKEERD'?'CODEWOORD_GEBLOKKEERD':'CODEWOORD_ONJUIST',403);
      await codewoordStapOpVastleggen(auth as unknown as StapOpAuth);
      await deps.audit(auth.user.id,'access.step-up','success',{methode:'codewoord'});
      return deps.respond({ok:true,stepUp:'codewoord',maxAgeSeconds:300});
    }],
    /**
     * «Запам'ятати цей браузер» na een bevestiging die niet in dit verzoek zat (terugkeer van Google). Vereist een ECHT verse
     * bevestiging op deze sessie (een onthouden browser mag zichzelf niet verlengen) en een actie die onthouden mag.
     */
    'POST /api/owner/access/stap-op/onthouden':[async(ctx:{event:Record<string,unknown>;body:unknown})=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const body=deps.body(ctx.body);
      const actie=actieVan(body.actie);
      if(!onthoudMagVoorActie(actie))return deps.fail('STEP_UP_ONTHOUDEN_NIET_TOEGESTAAN',400);
      if(!(await stapOpGeldig(auth as unknown as StapOpAuth,Date.now(),{onthoud:false})))return deps.fail('STEP_UP_REQUIRED',403);
      const onthoudTot=await onthoudVastleggen(auth as unknown as StapOpAuth);
      if(!onthoudTot)return deps.fail('STEP_UP_SESSIE_VEREIST',403);
      await deps.audit(auth.user.id,'access.step-up.onthouden','success',{actie,onthoudTot});
      await meldBeveiligingsWijziging(auth.user.id,'stap-op-onthouden',{tot:new Date(Number(onthoudTot)).toISOString().slice(0,16).replace('T',' ')+' UTC'});
      return deps.respond({ok:true,onthouden:true,onthoudTot});
    }],
    'POST /api/owner/access/catalog':[async()=>{
      const[contour,policy]=await Promise.all([resolveGoogleContour(),policyOf()]);
      return deps.respond({ok:true,methods:LOGIN_METHODS.map(id=>({id,enabled:policy.enabled[id]!==false,configured:id==='google'?contour.credentialsConfigured:id==='password'?policy.enabled.password!==false:false})),mfa:policy.mfa,google:publicGoogleContour(contour)});
    }],
    'POST /api/owner/access/snapshot':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      return deps.respond(await accessSnapshot(auth.user,auth.user.role==='owner'));
    }],
    'POST /api/owner/access/password/login':[async(ctx: any)=>{
      const body=deps.body(ctx.body);
      const result=await verifyPasswordLogin(String(body.email||''),String(body.password||''),String(body.totp||body.code||''),ipVan(ctx.event),String(body.service||''));
      // SEC-002 (aanmelden-08): geen tussenstand 'mfa' meer; alles behalve 'ok' is een gewone weigering.
      if(result.status==='ok')return deps.respond({ok:true,status:result.status,code:result.code,user:result.user,sessionIssued:false});
      return deps.fail(result.code,result.http,'retryAfter'in result&&result.retryAfter?{retryAfter:result.retryAfter}:undefined);
    }],
    'POST /api/owner/auth/password/login':[async(ctx: any)=>{
      const body=deps.body(ctx.body);
      const result=await verifyPasswordLogin(String(body.email||''),String(body.password||''),String(body.totp||body.code||''),ipVan(ctx.event),String(body.service||''));
      // SEC-002 (aanmelden-08): geen aparte 'mfa'-antwoord meer — dat verraadde welke adressen TOTP hebben.
      if(result.status!=='ok'||!result.user)return deps.fail(result.code,result.http||401,'retryAfter'in result&&result.retryAfter?{retryAfter:result.retryAfter}:undefined);
      return deps.respond({ok:true,reasonCode:'ACCESS_PASSWORD_VERIFIED',sessionIssued:false,sessionCreated:false,user:result.user});
    }],
    'POST /api/owner/access/password/set':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const password=String(deps.body(ctx.body).password||'');
      if(password.length<10)return deps.fail('ACCESS_PASSWORD_TOO_SHORT',400);
      /* IDENTITEIT-012: верхня межа на сервері (раніше лише в інтерфейсі) — довгий рядок не йде в KDF. */
      if(password.length>1024)return deps.fail('ACCESS_PASSWORD_TOO_LONG',400);
      const stap=await stapOp(auth,'aanmeldmethode');if(stap)return stap;
      const envelope=await hashPassword(password);
      const existing=await passwordRecordAny(auth.user.id);
      const now=Date.now();
      const record={userId:auth.user.id,...envelope,mustChange:false,createdAt:existing?.createdAt||now,updatedAt:now};
      if(existing?.id)await db.update(PASSWORDS,[{id:existing.id,record}]);
      else await db.add(PASSWORDS,[record]);
      await upsertLoginBinding(auth.user.id,'password',auth.user.id,auth.user.email);
      await deps.audit(auth.user.id,'access.password.set','success',{});
      await meldBeveiligingsWijziging(auth.user.id,'wachtwoord-gezet');
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/password/remove':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const blocked=await assertNotLastMethod(auth.user,{method:'password'});
      if(blocked)return deps.fail(blocked,409);
      const stap=await stapOp(auth);if(stap)return stap;
      await ontkoppelMethode(auth.user.id,'password',zelf(auth));
      await deps.audit(auth.user.id,'access.password.remove','success',{herstelbaarTot:Date.now()+HERSTEL_MS});
      await meldOntkoppeld(auth.user.id,'password');
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/method/unbind':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const method=String(deps.body(ctx.body).method||'') as LoginMethodId;
      if(!LOGIN_METHODS.includes(method))return deps.fail('ACCESS_METHOD_UNKNOWN',400);
      const blocked=await assertNotLastMethod(auth.user,{method});
      if(blocked)return deps.fail(blocked,409);
      const stap=await stapOp(auth);if(stap)return stap;
      await ontkoppelMethode(auth.user.id,method,zelf(auth));
      await deps.audit(auth.user.id,'access.method.unbind','success',{method,herstelbaarTot:Date.now()+HERSTEL_MS});
      await meldOntkoppeld(auth.user.id,method);
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/binding/unbind':[async(ctx: any)=>{
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
      if(identity)await ontkoppelIdentiteiten([identity],zelf(auth));
      if(row){await ontkoppelBindingen([row],zelf(auth));if(row.method==='password'&&!(await bindingsFor(auth.user.id)).some(b=>b.method==='password'&&b.status==='active'))await ontkoppelEnkel(PASSWORDS,await passwordFor(auth.user.id),zelf(auth));}
      await deps.audit(auth.user.id,'access.binding.unbind','success',{method:identity?'google':row?.method,email:identity?.email||row?.email,herstelbaarTot:Date.now()+HERSTEL_MS});
      await meldOntkoppeld(auth.user.id,identity?'google':String(row?.method||''));
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    // Fase 3: ontkoppelde methode binnen 7 dagen terugzetten (body.id = één item, anders alles).
    'POST /api/owner/access/method/herstel':[async(ctx:{event:Record<string,unknown>;body:unknown})=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const id=String(deps.body(ctx.body).id||'');
      const alle=(await herstelbaar(auth.user.id)).filter(item=>!id||item.id===id);
      if(!alle.length)return deps.fail('ACCESS_RESTORE_NOT_FOUND',404);
      // Audit-fix 6: alleen wat je zelf ontkoppelde; door een beheerder ontkoppeld = alleen via beheer terug.
      const items=alle.filter(item=>item.zelf);
      if(!items.length)return deps.fail('ACCESS_RESTORE_ADMIN_ONLY',403);
      const stap=await stapOp(auth);if(stap)return stap;
      await zetTerug(auth.user.id,items);
      await deps.audit(auth.user.id,'access.method.restore','success',{items:items.map(item=>({soort:item.soort,method:item.method}))});
      await meld(auth.user.id,'access_method_restored','Спосіб входу відновлено / Aanmeldmethode teruggezet',`Відновлено: ${items.map(item=>item.method).join(', ')}. / Teruggezet: ${items.map(item=>item.method).join(', ')}.`);
      return deps.respond({ok:true,teruggezet:items.length,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/phone/save':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const phone=String(deps.body(ctx.body).phone||'').replace(/[^\d+]/g,'').trim();
      if(phone.length<8)return deps.fail('ACCESS_PHONE_INVALID',400);
      const stap=await stapOp(auth);if(stap)return stap;
      const existing=await phoneRecordAny(auth.user.id);
      const now=Date.now();
      const record={userId:auth.user.id,phone,verified:false,createdAt:existing?.createdAt||now,updatedAt:now};
      if(existing?.id)await db.update(PHONES,[{id:existing.id,record}]);
      else await db.add(PHONES,[record]);
      // Fase 3: onbevestigd nummer = 'pending'; telt niet als aanmeldmethode tot het geverifieerd is.
      await upsertLoginBinding(auth.user.id,'phone',phone,auth.user.email,'pending');
      await deps.audit(auth.user.id,'access.phone.save','success',{});
      return deps.respond({ok:true,sms:'needs_sms_contour',...await accessSnapshot(auth.user)});
    }],
    // Passkeys zijn uitgeschakeld tot er echte WebAuthn-verificatie (attestation/assertion) is.
    // De oude routes registreerden alleen een credentialId zonder enige cryptografische controle.
    'POST /api/owner/access/webauthn/options':[async()=>deps.fail('ACCESS_WEBAUTHN_DISABLED',503)],
    'POST /api/owner/access/webauthn/register':[async()=>deps.fail('ACCESS_WEBAUTHN_DISABLED',503)],
    /* IDENTITEIT-012: застарілий маршрут видаляв рядок без підтвердження доступу й писав «успіх», навіть коли рядка не було.
       Жодна сторінка його не кличе; ключі доступу вилучаються лише через /api/owner/access/passkeys/verwijderen (з підтвердженням). */
    'POST /api/owner/access/webauthn/remove':[async()=>deps.respond({ok:false,error:'LEGACY_ROUTE_GONE',reasonCode:'LEGACY_ROUTE_GONE'},410)],
    'POST /api/owner/access/totp/start':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      if(!totpKeyConfigured())return deps.fail('ACCESS_TOTP_KEY_MISSING',503);
      if(!recoveryPepperConfigured())return deps.fail('ACCESS_RECOVERY_PEPPER_MISSING',503);
      const secret=randomBytes(20),encoded=toBase32(secret);
      const existing=await totpFor(auth.user.id);
      const now=Date.now();
      if(existing?.confirmed){
        // Audit-fix 2: een bevestigde TOTP vervangen vraagt step-up ÉN de huidige code (of een herstelcode).
        // Het oude geheim blijft geldig tot het nieuwe bevestigd is (pendingSecretEnc).
        const stap=await stapOp(auth);if(stap)return stap;
        const{uitkomst,wachtSeconden}=await codeControleren(auth.user.id,existing,String(deps.body(ctx.body).currentCode||deps.body(ctx.body).code||''),'totp-wijzigen');
        if(uitkomst!=='ok'){const f=codeFout(uitkomst,wachtSeconden);await deps.audit(auth.user.id,'access.totp.replace.start','failure',{reden:uitkomst});return deps.fail(f.code,f.http,f.extra);}
        await db.update(TOTP,[{id:existing.id,record:{...withoutId(existing),pendingSecretEnc:sealWithEnvKey(TOTP_KEY,encoded,totpAad(auth.user.id)),pendingAt:now,updatedAt:now}}]);
        await deps.audit(auth.user.id,'access.totp.replace.start','success',{});
      }else{
        // SEC-002 (aanmelden-01): ook de EERSTE inschrijving vraagt step-up. Zonder dit gaf een gestolen sessie zichzelf een
        // «sterke» bevestiging: TOTP inschrijven → eigen herstelcodes → stap-op. De inschrijving hangt aan de sessie die haar begon.
        const stap=await stapOp(auth);if(stap)return stap;
        const record={userId:auth.user.id,secretEnc:sealWithEnvKey(TOTP_KEY,encoded,totpAad(auth.user.id)),confirmed:false,startSessie:stapOpSessieId(auth as unknown as StapOpAuth),createdAt:existing?.createdAt||now,updatedAt:now};
        if(existing?.id)await db.update(TOTP,[{id:existing.id,record}]);
        else await db.add(TOTP,[record]);
      }
      const otpauth=`otpauth://totp/MijProstir:${encodeURIComponent(auth.user.email)}?secret=${encoded}&issuer=MijProstir&algorithm=SHA1&digits=6&period=30`;
      return deps.respond({ok:true,secret:encoded,otpauth,plaintextReturned:true});
    }],
    'POST /api/owner/access/totp/confirm':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const code=String(deps.body(ctx.body).code||'');
      const row=await totpFor(auth.user.id);
      if(!row)return deps.fail('ACCESS_TOTP_NOT_STARTED',400);
      const vervangen=Boolean(row.confirmed);
      // Audit-fix 2: bevestigd zonder lopende vervanging → niets te bevestigen (geen nieuwe herstelcodes via deze route).
      if(vervangen&&!row.pendingSecretEnc)return deps.fail('ACCESS_TOTP_ALREADY_ENROLLED',409);
      // SEC-002 (aanmelden-01): een eerste inschrijving rondt alleen de sessie af die haar met step-up begon (totp/start).
      // Een rij zonder startSessie (van vóór deze controle) of van een andere sessie: opnieuw beginnen.
      if(!vervangen&&(!row.startSessie||row.startSessie!==stapOpSessieId(auth as unknown as StapOpAuth)))return deps.fail('ACCESS_TOTP_NOT_STARTED',400);
      const secret=vervangen?totpPendingOf(row):totpSecretOf(row);
      if(!secret)return deps.fail(vervangen?'ACCESS_TOTP_REPLACE_EXPIRED':'ACCESS_TOTP_KEY_MISSING',vervangen?400:503);
      if(!recoveryPepperConfigured())return deps.fail('ACCESS_RECOVERY_PEPPER_MISSING',503);
      const poging=await pogingReserveren(`stap-op:${auth.user.id}`);
      if(!poging.toegestaan)return deps.fail('ACCESS_LOCKED_TEMPORARILY',429,{retryAfter:poging.wachtSeconden});
      const stapNr=totpStap(fromBase32(secret),code);
      if(stapNr<0)return deps.fail('ACCESS_TOTP_INVALID',400);
      await clearLoginFailures(`stap-op:${auth.user.id}`);
      const{codes,rec}=nieuweHerstelSet(auth.user.id);
      const basis=zonder(withoutId(row) as Record<string,unknown>,'pendingSecretEnc','pendingAt','secret','startSessie');
      await db.update(TOTP,[{id:row.id,record:{...basis,...(vervangen?{secretEnc:row.pendingSecretEnc}:{}),confirmed:true,lastStep:stapNr,updatedAt:Date.now()}}]);
      const recovery=await recoveryFor(auth.user.id);
      if(recovery?.id)await db.update(RECOVERY,[{id:recovery.id,record:rec}]);
      else await db.add(RECOVERY,[rec]);
      await deps.audit(auth.user.id,vervangen?'access.totp.replace':'access.totp.enroll','success',{});
      await meld(auth.user.id,vervangen?'access_totp_replaced':'access_totp_enrolled',
        vervangen?'Автентифікатор замінено / Authenticator vervangen':'Автентифікатор додано / Authenticator toegevoegd',
        `${vervangen?'Додаток-автентифікатор (TOTP) замінено; старі коди більше не діють':'Додаток-автентифікатор (TOTP) увімкнено'}. Нові коди відновлення створено. Якщо це були не ви — негайно зверніться до адміністратора. / ${vervangen?'De authenticator-app (TOTP) is vervangen; oude codes werken niet meer':'De authenticator-app (TOTP) is ingeschakeld'}. Er zijn nieuwe herstelcodes gemaakt. Was u dit niet: neem direct contact op met de beheerder.`);
      return deps.respond({ok:true,recoveryCodes:codes,plaintextReturned:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/totp/disable':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const row=await totpFor(auth.user.id);
      // Fase 3: uitschakelen vereist de huidige TOTP-code (of een ongebruikte herstelcode bij verlies van het toestel).
      if(row?.confirmed){
        const code=String(deps.body(ctx.body).code||'');
        const{uitkomst,wachtSeconden}=await codeControleren(auth.user.id,row,code,'totp-uitschakelen');
        if(uitkomst!=='ok'){const f=codeFout(uitkomst,wachtSeconden);await deps.audit(auth.user.id,'access.totp.disable','failure',{reden:uitkomst});return deps.fail(f.code,f.http,f.extra);}
      }
      if(row?.id)await db.delete(TOTP,[row.id]);
      await deps.audit(auth.user.id,'access.totp.disable','success',{});
      if(row?.id)await meldBeveiligingsWijziging(auth.user.id,'totp-uit');
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/recovery/rotate':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      if(!recoveryPepperConfigured())return deps.fail('ACCESS_RECOVERY_PEPPER_MISSING',503);
      // Fase 3: nieuwe herstelcodes alleen met de huidige TOTP-code (zonder TOTP: step-up).
      const totpRij=await totpFor(auth.user.id);
      // Met TOTP: de huidige code, of een verse step-up met een eigen passkey (Способи входу).
      if(totpRij?.confirmed){
        const metPasskey=!String(deps.body(ctx.body).code||'')&&await passkeyStapOpGeldig(auth as unknown as StapOpAuth);
        if(!metPasskey){
          const{uitkomst,wachtSeconden}=await codeControleren(auth.user.id,totpRij,String(deps.body(ctx.body).code||''),false);
          if(uitkomst!=='ok'){const f=codeFout(uitkomst,wachtSeconden);return deps.fail(f.code,f.http,f.extra);}
        }
      }else{const stap=await stapOp(auth,'herstelcodes');if(stap)return stap;}
      // «Створити нові»: de oude set vervalt meteen (het record wordt vervangen).
      const{codes,rec}=nieuweHerstelSet(auth.user.id);
      const recovery=await recoveryFor(auth.user.id);
      if(recovery?.id)await db.update(RECOVERY,[{id:recovery.id,record:rec}]);
      else await db.add(RECOVERY,[rec]);
      await deps.audit(auth.user.id,'access.recovery.rotate','success',{});
      if(recovery?.id&&(recovery.remaining||0)>0)await meld(auth.user.id,'access_recovery_rotated','Коди відновлення замінено / Herstelcodes vervangen',
        'Створено нові коди відновлення; старі більше не діють. Якщо це були не ви — негайно зверніться до адміністратора. / Er zijn nieuwe herstelcodes gemaakt; de oude werken niet meer. Was u dit niet: neem direct contact op met de beheerder.');
      return deps.respond({ok:true,recoveryCodes:codes,plaintextReturned:true,overzicht:herstelOverzicht({...rec,id:recovery?.id||''})});
    }],
    // Lijst «Коди відновлення»: gemaskeerd (••••-••••-••ab), met status en datum van gebruik. Geen step-up: er komt niets geheims uit.
    'POST /api/owner/access/recovery/overzicht':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      return deps.respond({ok:true,...await herstelOverzichtVol(auth.user.id,await recoveryFor(auth.user.id))});
    }],
    // «Відкликати всі»: alle nog ongebruikte codes onbruikbaar (step-up vereist), lijst blijft zichtbaar als «Відкликано».
    'POST /api/owner/access/recovery/intrekken':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const stap=await stapOp(auth,'herstelcodes');if(stap)return stap;
      const recovery=await recoveryFor(auth.user.id);
      if(!recovery?.id)return deps.fail('ACCESS_RECOVERY_NOT_ENROLLED',404);
      const nu=Date.now();
      if(!recovery.ingetrokkenOp)await db.update(RECOVERY,[{id:recovery.id,record:{...withoutId(recovery),hashes:[],remaining:0,ingetrokkenOp:nu}}]);
      await deps.audit(auth.user.id,'access.recovery.revoke','success',{});
      await meld(auth.user.id,'access_recovery_revoked','Коди відновлення відкликано / Herstelcodes ingetrokken',
        'Усі коди відновлення відкликано; жоден більше не діє. Якщо це були не ви — негайно зверніться до адміністратора. / Alle herstelcodes zijn ingetrokken; geen enkele werkt nog. Was u dit niet: neem direct contact op met de beheerder.');
      return deps.respond({ok:true,...await herstelOverzichtVol(auth.user.id,await recoveryFor(auth.user.id)),snapshot:await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/recovery/bekeken':[async(ctx: any)=>{
      const auth=await gate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_SESSION_REQUIRED',401);
      const recovery=await recoveryFor(auth.user.id);
      if(!recovery?.id)return deps.fail('ACCESS_RECOVERY_NOT_ENROLLED',404);
      if(!recovery.bekekenOp)await db.update(RECOVERY,[{id:recovery.id,record:{...withoutId(recovery),bekekenOp:Date.now()}}]);
      await deps.audit(auth.user.id,'access.recovery.bekeken','success',{});
      return deps.respond({ok:true,...await accessSnapshot(auth.user)});
    }],
    'POST /api/owner/access/policy/save':[async(ctx: any)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth)return deps.fail('OWNER_ACCESS_FORBIDDEN',403);
      const stap=await stapOp(auth);if(stap)return stap;
      const body=deps.body(ctx.body);
      const enabled=(body.enabled&&typeof body.enabled==='object'?body.enabled:{}) as Partial<Record<MethodId,boolean>>;
      const mfa=body.mfa==='required'?'required':'optional';
      /* IDENTITEIT-015: правило «другий чинник обов'язковий» діє під час входу. Вмикає його лише той, хто сам має другий чинник
         (TOTP або ключ доступу): інакше власник одразу втратив би перевірку, яку вимагає від інших. Is.: alleen met een eigen tweede factor. */
      const vorig=(await policyOf()).mfa;
      if(mfa==='required'&&vorig!=='required'){const[t,p]=await Promise.all([totpFor(auth.user.id),passkeyAantal(auth.user.id).catch(()=>0)]);if(!t?.confirmed&&p<=0){await deps.audit(auth.user.id,'access.policy.save','denied',{mfa,reden:'geen-eigen-tweede-factor'});return deps.fail('ACCESS_MFA_EIGEN_FACTOR_VEREIST',409);}}
      const next=await writePolicy(enabled,mfa);
      tweedeFactorBeleidVergeten();
      await deps.audit(auth.user.id,'access.policy.save','success',{mfa:next.mfa,vorig});
      if(next.mfa!==vorig)await meldBeveiligingsWijziging(auth.user.id,next.mfa==='required'?'tweede-factor-verplicht':'tweede-factor-vrij');
      /* IDENTITEIT-015: якщо власник підтвердив збереження не другим чинником (наприклад, Google), його поточний вхід тепер теж
         за воротами — відповідь одразу каже про це клієнту (src/platform/client.ts → вікно «Другий крок входу»), а не лише після перезавантаження. */
      const s=auth as unknown as {session?:{id?:string;userId?:string}|null;tabSession?:{id?:string;userId?:string}|null};
      const sid=codewoordSessieId({userId:auth.user.id,anchorUserId:s.session?.userId,anchorId:s.session?.id,tabUserId:s.tabSession?.userId,tabId:s.tabSession?.id});
      const tweedeFactorPoort=next.mfa==='required'&&!!((await totpFor(auth.user.id))?.confirmed||(await passkeyAantal(auth.user.id).catch(()=>0))>0)&&!tweedeFactorVers(await tweedeFactorBevestigdOp(auth.user.id,sid));
      return deps.respond({ok:true,...await accessSnapshot(auth.user,true),tweedeFactorPoort}); // de momentopname bevat het beleid al (en overschreef het eerder opgegeven beleid ook al)
    }],
    'POST /api/owner/access/user/:id/method':[async(ctx: any)=>{
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
          await ontkoppelMethode(userId,method,{userId:auth.user.id,beheer:true});
          await meldOntkoppeld(userId,method,true);
        }else{
          const row=bindings.find(item=>item.method===method);
          if(row)await db.update(BINDINGS,[{id:row.id,record:{...withoutId(row),status:'disabled',updatedAt:Date.now()}}]);
        }
      }
      if(action==='restore'){
        // Audit-fix 6: beheerder zet een (ook door beheer) ontkoppelde methode terug.
        const items=(await herstelbaar(userId)).filter(item=>item.method===method);
        if(!items.length)return deps.fail('ACCESS_RESTORE_NOT_FOUND',404);
        await zetTerug(userId,items);
        await meld(userId,'access_method_restored','Спосіб входу відновлено / Aanmeldmethode teruggezet',`Адміністратор відновив: ${method}. / Een beheerder heeft teruggezet: ${method}.`);
      }
      if(action==='enable'){
        const row=(await bindingsFor(userId)).find(item=>item.method===method);
        if(row)await db.update(BINDINGS,[{id:row.id,record:{...withoutId(row),status:'active',updatedAt:Date.now()}}]);
      }
      await deps.audit(auth.user.id,'access.user.method','success',{userId,method,action});
      return deps.respond({ok:true});
    }],
    'POST /api/owner/access/user/:id/reset-password':[async(ctx: any)=>{
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
      /* SEC-002 (privacy-logboek-03): ook in het logboek en de bel van wie het wachtwoord kreeg, niet alleen in dat van de beheerder */
      if(ctx.params.id!==auth.user.id){await deps.audit(ctx.params.id,'access.password.reset-door-beheer','success',{door:auth.user.id});await meldBeveiligingsWijziging(ctx.params.id,'wachtwoord-door-beheer');}
      return deps.respond({ok:true,temporaryPassword:temp,mustChange:true,plaintextReturned:true});
    }]
  };
}
