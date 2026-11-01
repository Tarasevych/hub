import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {db,isOwnerEmail,secrets} from '../server/platform';
import {stapOpMethode,stapOpVerbruiken,type StapOpAuth} from './stap-op';
import {sterkeStapOpFout} from './toegang-context';
import {VAULT_DOELEN} from '../shared/geheimen';
import {leesAppSleutel,leesOauthApp} from '../shared/github-koppeling';
import {GEEN_RECHT,heeftApiRecht,weigerCode} from './api-recht';
import {leegMeta,metaUitRecord,normaliseerVaultMeta,staatTekst,vandaag,vaultStaat,type VaultMeta,type VaultStaat} from '../shared/kluis-meta';

export const OWNER_VAULT_TABLE='owner_vault_v1';
// Uitgebreid (fase «Секрети й ключі»): dezelfde lijst als shared/geheimen.ts, zodat groepen en logo's kloppen.
export const OWNER_VAULT_PURPOSES=VAULT_DOELEN;
const MAX_ITEMS=40;
const MAX_VALUE=8192;
// SECURITY: dedicated vault key only. Previously fell back to other encryption keys and even to the
// Google OAuth client secrets (key reuse; the client secret is also sent to Google on every token call).
const KEY_CANDIDATES=['OWNER_VAULT_ENCRYPTION_KEY_V1'] as const;
const REVEAL_CONFIRM='REVEAL_SECRET';
/** Laatste termijncontrole per eigenaar (meldingen); een wijziging in de kluis zet hem terug, zodat een melding meteen kan komen. */
const laatsteControle=new Map<string,number>();

export type OwnerVaultPurpose=typeof OWNER_VAULT_PURPOSES[number];
export type OwnerVaultRecord={id:string;ownerUserId:string;keyName:string;purpose:OwnerVaultPurpose;usedBy:string;algorithm:'AES-256-GCM';keyVersion:number;keySource:string;ciphertext:string;iv:string;authTag:string;createdAt:number;updatedAt:number;
  /** Termijn, eigenaar (dienst/AI/apparaat/persoon), verantwoordelijke — nooit de waarde. Oude records: ontbreekt. */
  meta?:VaultMeta;
  /** Voor welke staat al een melding is gemaakt (bijna/verlopen), zodat die niet terugkomt. */
  gemeld?:Partial<Record<VaultStaat,string>>;
  /** Laatste vervanging van de waarde (rotatie). */
  rotatedAt?:number};
type SessionAuth={errorCode:string}|{user:{id:string;email:string;role:string;status:string};service:string};

const aad=(ownerUserId:string,keyName:string)=>`owner-vault-v1|${ownerUserId}|${keyName}`;
const vaultKey=(secret:string)=>{
  const normalized=secret.trim();
  if(/^[a-f0-9]{64}$/i.test(normalized))return Buffer.from(normalized,'hex');
  try{const decoded=Buffer.from(normalized,'base64');if(decoded.length===32)return decoded;}catch{/* ignore */}
  if(normalized.length>=32)return createHash('sha256').update(normalized).digest();
  throw new Error('OWNER_VAULT_ENCRYPTION_KEY_INVALID');
};
const encryptValue=(plaintext:string,secret:string,ownerUserId:string,keyName:string,keyVersion=1)=>{
  if(!plaintext)throw new Error('OWNER_VAULT_VALUE_EMPTY');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',vaultKey(secret),iv);
  cipher.setAAD(Buffer.from(aad(ownerUserId,keyName),'utf8'));
  const ciphertext=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);
  return{algorithm:'AES-256-GCM' as const,keyVersion,ciphertext:ciphertext.toString('base64url'),iv:iv.toString('base64url'),authTag:cipher.getAuthTag().toString('base64url')};
};
const decryptValue=(record:Pick<OwnerVaultRecord,'algorithm'|'keyVersion'|'ciphertext'|'iv'|'authTag'>,secret:string,ownerUserId:string,keyName:string)=>{
  if(record.algorithm!=='AES-256-GCM'||record.keyVersion<1)throw new Error('OWNER_VAULT_ENVELOPE_INVALID');
  const iv=Buffer.from(record.iv,'base64url'),tag=Buffer.from(record.authTag,'base64url'),ciphertext=Buffer.from(record.ciphertext,'base64url');
  if(iv.length!==12||tag.length!==16)throw new Error('OWNER_VAULT_ENVELOPE_INVALID');
  const decipher=createDecipheriv('aes-256-gcm',vaultKey(secret),iv);
  decipher.setAAD(Buffer.from(aad(ownerUserId,keyName),'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
};
const normalizeName=(value:unknown)=>{
  const name=String(value||'').trim().slice(0,80);
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(name))throw new Error('OWNER_VAULT_NAME_INVALID');
  return name;
};
const normalizePurpose=(value:unknown):OwnerVaultPurpose=>{
  const purpose=String(value||'other').trim() as OwnerVaultPurpose;
  return OWNER_VAULT_PURPOSES.includes(purpose)?purpose:'other';
};
/**
 * Gevoelige kluisactie (tonen, opslaan, vervangen, hernoemen, verwijderen): passkey, TOTP of herstelcode (Google-login alleen telt niet
 * zodra een sterkere manier bestaat) en de bevestiging geldt voor ÉÉN actie: na gebruik moet de volgende opnieuw bevestigd worden.
 * Aanroepen pas NA de invoercontrole en vlak vóór de actie, zodat een typefout geen bevestiging kost.
 */
const gevoelig=async(auth:unknown):Promise<{fout:string;methode:string}>=>{
  const fout=await sterkeStapOpFout(auth as StapOpAuth);
  if(fout)return{fout,methode:''};
  const methode=await stapOpMethode(auth as StapOpAuth);
  await stapOpVerbruiken(auth as StapOpAuth);
  return{fout:'',methode};
};
const publicItem=(item:OwnerVaultRecord)=>({
  id:item.id,
  name:item.keyName,
  purpose:item.purpose,
  usedBy:item.usedBy||item.purpose,
  updatedAt:item.updatedAt,
  createdAt:item.createdAt,
  algorithm:item.algorithm,
  hasValue:true,
  masked:'\u2022'.repeat(12),
  revealable:true,
  editable:true,
  deletable:true,
  locked:false,
  source:'vault',
  meta:metaUitRecord(item.meta),
  ...vaultStaat(metaUitRecord(item.meta)),
  rotatedAt:item.rotatedAt||item.createdAt
});
const requestHost=(event:Record<string,unknown>)=>{
  const headers=(event.headers||{}) as Record<string,string>;
  // Zelf gehost: alleen de echte Host-header (de server verwijdert x-forwarded-host).
  return String(headers.host||headers.Host||'').split(',')[0].trim().toLowerCase();
};
const revealHostAllowed=(event:Record<string,unknown>)=>{
  const host=requestHost(event);
  // Geen localhost-/127.0.0.1-uitzondering meer: onthullen kan alleen via admin.* of api.*.
  return host==='admin.tarasevych.com'||host==='api.tarasevych.com';
};

async function resolveVaultSecret(){
  const names=await secrets.listSecretNames();
  for(const candidate of KEY_CANDIDATES){
    if(!names.includes(candidate))continue;
    try{
      const secret=await secrets.readSecret(candidate);
      const probe=encryptValue('owner-vault-probe',secret,'vault-probe','probe');
      if(decryptValue(probe,secret,'vault-probe','probe')!=='owner-vault-probe')continue;
      return{secret,keySource:candidate,ready:true as const};
    }catch{continue;}
  }
  return{secret:'',keySource:'',ready:false as const};
}

export async function vaultEncryptionReady(){return(await resolveVaultSecret()).ready;}
export async function apiPlatformVaultItems(ownerUserId:string){
  const rows=await db.list<Omit<OwnerVaultRecord,'id'>>(OWNER_VAULT_TABLE,{filter:{ownerUserId},limit:100});
  return(rows.items as OwnerVaultRecord[]).sort((a,b)=>b.updatedAt-a.updatedAt);
}
export async function apiPlatformVaultCount(ownerUserId:string){return(await apiPlatformVaultItems(ownerUserId)).length;}
export async function readOwnerVaultPlaintext(ownerUserId:string,keyName:string,expectedPurpose?:OwnerVaultPurpose){
  const name=normalizeName(keyName);
  const items=await apiPlatformVaultItems(ownerUserId);
  const record=items.find(item=>item.keyName===name);
  if(!record)throw new Error('OWNER_VAULT_NOT_FOUND');
  if(expectedPurpose&&record.purpose!==expectedPurpose)throw new Error('OWNER_VAULT_PURPOSE_MISMATCH');
  const resolved=await resolveVaultSecret();
  if(!resolved.ready)throw new Error('OWNER_VAULT_ENCRYPTION_UNAVAILABLE');
  return decryptValue(record,resolved.secret,ownerUserId,record.keyName);
}

export function createApiPlatformVaultRoutes(deps:{
  requireSession:(event:Record<string,unknown>,body:unknown)=>Promise<SessionAuth>;
  respond:(data:unknown,status?:number)=>any;
  fail:(message:string,status?:number)=>any;
  audit:(userId:string,action:string,result:string,details?:Record<string,unknown>)=>Promise<unknown>;
  body:(body:unknown)=>Record<string,unknown>;
}){
  const ownerGate=async(event:Record<string,unknown>,body:unknown)=>{
    const auth=await deps.requireSession(event,body);
    if('errorCode'in auth||!['api','admin','github','ai','mcp'].includes(auth.service)||auth.user.status!=='approved')return null;
    if(!heeftApiRecht(auth.user as never))return GEEN_RECHT;// fase 3: recht 'api-platform' of eigenaar
    return auth;
  };
  const owned=async(ownerUserId:string,id:string)=>{
    const[raw]=id?await db.get<Omit<OwnerVaultRecord,'id'>>(OWNER_VAULT_TABLE,[id]):[null];
    if(!raw||raw.ownerUserId!==ownerUserId)return null;
    return{id,...raw} as OwnerVaultRecord;
  };
  // Elke geweigerde gevoelige poging (geen/verkeerde bevestiging, geen eigenaar, verkeerde host) komt in het logboek; nooit een waarde.
  const geweigerd=async(userId:string,poging:string,keyName:string,reden:string,vaultId?:string)=>{try{await deps.audit(userId,'owner.api.vault.denied','denied',{poging,keyName,vaultId,reden});}catch{/* audit mag de weigering niet breken */}};
  return{
    'POST /api/owner/api-platform/vault':[async(ctx: any)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);
      const items=await apiPlatformVaultItems(auth.user.id);
      const ready=await vaultEncryptionReady();
      return deps.respond({items:items.map(publicItem),count:items.length,encryptionReady:ready,plaintextReturned:false});
    }],
    'POST /api/owner/api-platform/vault/save':[async(ctx: any)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);
      const body=deps.body(ctx.body);
      let keyName:string;
      try{keyName=normalizeName(body.name||body.keyName);}catch(caught){return deps.fail(caught instanceof Error?caught.message:'OWNER_VAULT_NAME_INVALID',400);}
      const purpose=normalizePurpose(body.purpose||body.usedBy);
      const usedBy=String(body.usedBy||purpose).trim().slice(0,80)||purpose;
      const value=String(body.value||body.secret||'');
      const metaIn=body.meta;
      if(!value||value.length>MAX_VALUE)return deps.fail(value?'OWNER_VAULT_VALUE_TOO_LARGE':'OWNER_VAULT_VALUE_EMPTY',400);
      if(purpose==='github-oauth'&&!leesOauthApp(value)){
        const mId=/^\s*client_id\s*[:=]\s*(\S+)\s*$/im.exec(value);
        const idOk=!!mId&&/^[A-Za-z0-9](?:[A-Za-z0-9._-]{6,78})[A-Za-z0-9]$/.test(mId[1]);
        return deps.fail(idOk?'GITHUB_OAUTH_CLIENT_SECRET_ONGELDIG':'GITHUB_OAUTH_CLIENT_ID_ONGELDIG',400);
      }
      if(purpose==='github-app'&&!leesAppSleutel(value)){
        const pemRe=new RegExp('-----BEGIN (?:RSA )?PRIVATE'+' KEY-----[\\s\\S]+?-----END (?:RSA )?PRIVATE'+' KEY-----');
        const heeftPem=pemRe.test(value.replace(/\\n/g,'\n'));
        const mApp=/^\s*app_id\s*[:=]\s*([0-9]{1,20})\s*$/im.exec(value);
        return deps.fail(!mApp?'GITHUB_APP_ID_ONGELDIG':!heeftPem?'GITHUB_APP_PEM_ONGELDIG':'GITHUB_APP_SLEUTEL_ONLEESBAAR',400);
      }
      const resolved=await resolveVaultSecret();
      if(!resolved.ready)return deps.fail('OWNER_VAULT_ENCRYPTION_UNAVAILABLE',503);
      const items=await apiPlatformVaultItems(auth.user.id);
      const existing=items.find(item=>item.id===String(body.id||'')||item.keyName===keyName)||null;
      if(!existing&&items.length>=MAX_ITEMS)return deps.fail('OWNER_VAULT_LIMIT_REACHED',400);
      if(existing&&existing.keyName!==keyName&&items.some(item=>item.keyName===keyName&&item.id!==existing.id))return deps.fail('OWNER_VAULT_NAME_TAKEN',409);
      const now=Date.now();
      const metaUit=normaliseerVaultMeta(metaIn,existing?metaUitRecord(existing.meta):{...leegMeta(),geldigVan:vandaag(now)});
      if('fout'in metaUit)return deps.fail(metaUit.fout,400);
      const stapSave=await gevoelig(auth);
      if(stapSave.fout){await geweigerd(auth.user.id,'save',keyName,stapSave.fout);return deps.fail(stapSave.fout,403);}
      let envelope;
      try{envelope=encryptValue(value,resolved.secret,auth.user.id,keyName);}catch(caught){return deps.fail(caught instanceof Error?caught.message:'OWNER_VAULT_ENCRYPT_FAILED',500);}
      if(existing){
        // Nieuwe waarde = rotatie: meldingen over de oude termijn vervallen.
        const record={...existing,keyName,purpose,usedBy,...envelope,keySource:resolved.keySource,meta:metaUit.meta,gemeld:{},rotatedAt:now,updatedAt:now};
        const{id,...stored}=record;
        const[ok]=await db.update(OWNER_VAULT_TABLE,[{id,record:stored}]);
        if(!ok)return deps.fail('OWNER_VAULT_WRITE_FAILED',500);
        laatsteControle.delete(auth.user.id);
        await deps.audit(auth.user.id,'owner.api.vault.updated','success',{vaultId:id,keyName,purpose,methode:stapSave.methode,oudeNaam:existing.keyName!==keyName?existing.keyName:undefined});
        return deps.respond({ok:true,rotated:true,item:publicItem(record),plaintextReturned:false});
      }
      const record={ownerUserId:auth.user.id,keyName,purpose,usedBy,...envelope,keySource:resolved.keySource,meta:metaUit.meta,gemeld:{},createdAt:now,updatedAt:now,rotatedAt:now};
      const[id]=await db.add(OWNER_VAULT_TABLE,[record]);
      if(!id)return deps.fail('OWNER_VAULT_WRITE_FAILED',500);
      laatsteControle.delete(auth.user.id);
      await deps.audit(auth.user.id,'owner.api.vault.created','success',{vaultId:id,keyName,purpose,methode:stapSave.methode});
      return deps.respond({ok:true,rotated:false,item:publicItem({id,...record}),plaintextReturned:false});
    }],
    'POST /api/owner/api-platform/vault/:id/rename':[async(ctx: any)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);
      const current=await owned(auth.user.id,ctx.params.id);
      if(!current)return deps.fail('OWNER_VAULT_NOT_FOUND',404);
      let nextName:string;
      try{nextName=normalizeName(deps.body(ctx.body).name);}catch(caught){return deps.fail(caught instanceof Error?caught.message:'OWNER_VAULT_NAME_INVALID',400);}
      if(nextName===current.keyName)return deps.respond({ok:true,item:publicItem(current),plaintextReturned:false});
      const clash=(await apiPlatformVaultItems(auth.user.id)).some(item=>item.keyName===nextName&&item.id!==current.id);
      if(clash)return deps.fail('OWNER_VAULT_NAME_TAKEN',409);
      const resolved=await resolveVaultSecret();
      if(!resolved.ready)return deps.fail('OWNER_VAULT_ENCRYPTION_UNAVAILABLE',503);
      const stapRename=await gevoelig(auth);
      if(stapRename.fout){await geweigerd(auth.user.id,'rename',current.keyName,stapRename.fout,current.id);return deps.fail(stapRename.fout,403);}
      let envelope;
      try{
        const plaintext=decryptValue(current,resolved.secret,auth.user.id,current.keyName);
        envelope=encryptValue(plaintext,resolved.secret,auth.user.id,nextName);
      }catch{return deps.fail('OWNER_VAULT_RENAME_FAILED',500);}
      const record={...current,keyName:nextName,...envelope,keySource:resolved.keySource,updatedAt:Date.now()};
      const{id,...stored}=record;
      const[ok]=await db.update(OWNER_VAULT_TABLE,[{id,record:stored}]);
      if(!ok)return deps.fail('OWNER_VAULT_WRITE_FAILED',500);
      await deps.audit(auth.user.id,'owner.api.vault.renamed','success',{vaultId:id,keyName:nextName,from:current.keyName,to:nextName,methode:stapRename.methode});
      return deps.respond({ok:true,item:publicItem(record),plaintextReturned:false});
    }],
    'POST /api/owner/api-platform/vault/:id/meta':[async(ctx: any)=>{
      // Alleen metadata (termijn, van wie, verantwoordelijke): de waarde wordt niet ontsleuteld of aangeraakt.
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);
      const current=await owned(auth.user.id,ctx.params.id);
      if(!current)return deps.fail('OWNER_VAULT_NOT_FOUND',404);
      const oud=metaUitRecord(current.meta);
      const uit=normaliseerVaultMeta(deps.body(ctx.body).meta,oud);
      if('fout'in uit)return deps.fail(uit.fout,400);
      const velden=(Object.keys(uit.meta) as Array<keyof VaultMeta>).filter(k=>uit.meta[k]!==oud[k]);
      if(!velden.length)return deps.respond({ok:true,item:publicItem(current),plaintextReturned:false});
      // Andere einddatum → opnieuw mogen melden.
      const gemeld=uit.meta.geldigTot!==oud.geldigTot?{}:current.gemeld||{};
      const record={...current,meta:uit.meta,gemeld,updatedAt:Date.now()};
      const{id,...stored}=record;
      const[ok]=await db.update(OWNER_VAULT_TABLE,[{id,record:stored}]);
      if(!ok)return deps.fail('OWNER_VAULT_WRITE_FAILED',500);
      laatsteControle.delete(auth.user.id);
      await deps.audit(auth.user.id,'owner.api.vault.meta','success',{vaultId:id,keyName:current.keyName,velden,geldigTot:uit.meta.geldigTot||null,soort:uit.meta.soort||null,van:uit.meta.van||null});
      return deps.respond({ok:true,item:publicItem(record),plaintextReturned:false});
    }],
    'POST /api/owner/api-platform/vault/:id/reveal':[async(ctx: any)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);
      if(auth.user.role!=='owner'||!isOwnerEmail(auth.user.email)){await geweigerd(auth.user.id,'reveal',String(ctx.params.id||'').slice(0,80),'OWNER_VAULT_REVEAL_FORBIDDEN');return deps.fail('OWNER_VAULT_REVEAL_FORBIDDEN',403);}
      if(!revealHostAllowed(ctx.event)){await geweigerd(auth.user.id,'reveal',String(ctx.params.id||'').slice(0,80),'OWNER_VAULT_REVEAL_HOST_FORBIDDEN');return deps.fail('OWNER_VAULT_REVEAL_HOST_FORBIDDEN',403);}
      const body=deps.body(ctx.body);
      if(String(body.confirm||'')!==REVEAL_CONFIRM)return deps.fail('OWNER_VAULT_REVEAL_CONFIRM_REQUIRED',400);
      const current=await owned(auth.user.id,ctx.params.id);
      if(!current)return deps.fail('OWNER_VAULT_NOT_FOUND',404);
      const resolved=await resolveVaultSecret();
      if(!resolved.ready)return deps.fail('OWNER_VAULT_ENCRYPTION_UNAVAILABLE',503);
      // Tonen alleen met passkey/TOTP/herstelcode, éénmalig (zie gevoelig()).
      const stapReveal=await gevoelig(auth);
      if(stapReveal.fout){await geweigerd(auth.user.id,'reveal',current.keyName,stapReveal.fout,current.id);return deps.fail(stapReveal.fout,403);}
      try{
        const value=decryptValue(current,resolved.secret,auth.user.id,current.keyName);
        await deps.audit(auth.user.id,'owner.api.vault.revealed','success',{vaultId:current.id,keyName:current.keyName,plaintextLogged:false,methode:stapReveal.methode});
        return deps.respond({ok:true,name:current.keyName,id:current.id,revealedValue:value,plaintextReturned:true,once:true,ttlSeconds:30});
      }catch{
        await deps.audit(auth.user.id,'owner.api.vault.revealed','rejected',{vaultId:current.id,keyName:current.keyName});
        return deps.fail('OWNER_VAULT_REVEAL_FAILED',500);
      }
    }],
    'POST /api/owner/api-platform/vault/:id/delete':[async(ctx: any)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail(weigerCode(auth),403);
      const current=await owned(auth.user.id,ctx.params.id);
      if(!current)return deps.fail('OWNER_VAULT_NOT_FOUND',404);
      const stapDelete=await gevoelig(auth);
      if(stapDelete.fout){await geweigerd(auth.user.id,'delete',current.keyName,stapDelete.fout,current.id);return deps.fail(stapDelete.fout,403);}
      await db.delete(OWNER_VAULT_TABLE,[current.id]);
      await deps.audit(auth.user.id,'owner.api.vault.deleted','success',{vaultId:current.id,keyName:current.keyName,purpose:current.purpose,methode:stapDelete.methode});
      return deps.respond({ok:true,deletedId:current.id,plaintextReturned:false});
    }]
  };
}

/**
 * Meldingen voor sleutels die bijna aflopen of verlopen zijn: één keer per sleutel en staat (bijna → verlopen is een nieuwe melding;
 * een nieuwe waarde of een andere einddatum zet het terug). Hoogstens elke 10 minuten per eigenaar, goedkoop (≤ 40 records).
 */
export async function vaultTermijnMeldingen(user:{id:string;email:string},notify:(kind:string,title:string,message:string,link:string)=>Promise<unknown>,nu=Date.now()){
  if(nu-(laatsteControle.get(user.id)||0)<10*60_000)return 0;
  laatsteControle.set(user.id,nu);
  let n=0;
  for(const item of await apiPlatformVaultItems(user.id)){
    const meta=metaUitRecord(item.meta);
    const{staat}=vaultStaat(meta,nu);
    if(staat!=='bijna'&&staat!=='verlopen')continue;
    if(item.gemeld?.[staat])continue;
    const titel=staat==='verlopen'?`Строк ключа «${item.keyName}» вийшов`:`Ключ «${item.keyName}» скоро закінчиться`;
    const wie=[meta.van,meta.verantwoordelijke?`відповідальний: ${meta.verantwoordelijke}`:''].filter(Boolean).join(' · ');
    await notify(staat==='verlopen'?'vault_key_expired':'vault_key_expiring',titel,`${staatTekst(meta,'uk',nu)}${wie?` · ${wie}`:''}. Замініть значення в «Сховищі секретів».`,'https://api.tarasevych.com/vault');
    const{id,...stored}={...item,gemeld:{...(item.gemeld||{}),[staat]:new Date(nu).toISOString()}};
    await db.update(OWNER_VAULT_TABLE,[{id,record:stored}]);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- intern gebruik door andere modules (18.10.2026, extern bureaublad)
// Opslaan/verwijderen ZONDER eigen stap-op: de aanroeper (bv. backend/remote-bureaublad.ts) heeft de passkey-bevestiging al gecontroleerd
// en verbruikt. De waarde komt nooit terug naar de browser; alleen de naam wordt bewaard bij de aanroeper.
export async function ownerVaultBewarenIntern(ownerUserId:string,keyNameIn:string,purposeIn:string,usedBy:string,value:string){
  const keyName=normalizeName(keyNameIn);
  const purpose=normalizePurpose(purposeIn);
  if(!value||value.length>MAX_VALUE)throw new Error(value?'OWNER_VAULT_VALUE_TOO_LARGE':'OWNER_VAULT_VALUE_EMPTY');
  const resolved=await resolveVaultSecret();
  if(!resolved.ready)throw new Error('OWNER_VAULT_ENCRYPTION_UNAVAILABLE');
  const items=await apiPlatformVaultItems(ownerUserId);
  const existing=items.find(item=>item.keyName===keyName)||null;
  if(!existing&&items.length>=MAX_ITEMS)throw new Error('OWNER_VAULT_LIMIT_REACHED');
  const envelope=encryptValue(value,resolved.secret,ownerUserId,keyName);
  const now=Date.now();
  if(existing){
    const record={...existing,purpose,usedBy:usedBy.slice(0,80)||purpose,...envelope,keySource:resolved.keySource,gemeld:{},rotatedAt:now,updatedAt:now};
    const{id,...stored}=record;
    const[ok]=await db.update(OWNER_VAULT_TABLE,[{id,record:stored}]);
    if(!ok)throw new Error('OWNER_VAULT_WRITE_FAILED');
    laatsteControle.delete(ownerUserId);
    return{id,keyName,rotated:true};
  }
  const record={ownerUserId,keyName,purpose,usedBy:usedBy.slice(0,80)||purpose,...envelope,keySource:resolved.keySource,meta:{...leegMeta(),geldigVan:vandaag(now)},gemeld:{},createdAt:now,updatedAt:now,rotatedAt:now};
  const[id]=await db.add(OWNER_VAULT_TABLE,[record]);
  if(!id)throw new Error('OWNER_VAULT_WRITE_FAILED');
  laatsteControle.delete(ownerUserId);
  return{id,keyName,rotated:false};
}
export async function ownerVaultVerwijderenIntern(ownerUserId:string,keyNameIn:string){
  let keyName:string;try{keyName=normalizeName(keyNameIn);}catch{return false;}
  const record=(await apiPlatformVaultItems(ownerUserId)).find(item=>item.keyName===keyName);
  if(!record)return false;
  await db.delete(OWNER_VAULT_TABLE,[record.id]);
  laatsteControle.delete(ownerUserId);
  return true;
}
