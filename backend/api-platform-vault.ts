import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {db,secrets} from '../server/platform';
import {stapOpFout,type StapOpAuth} from './stap-op';

export const OWNER_VAULT_TABLE='owner_vault_v1';
export const OWNER_VAULT_PURPOSES=['home-assistant','telegram','github','webhook','other'] as const;
const MAX_ITEMS=40;
const MAX_VALUE=8192;
// SECURITY: dedicated vault key only. Previously fell back to other encryption keys and even to the
// Google OAuth client secrets (key reuse; the client secret is also sent to Google on every token call).
const KEY_CANDIDATES=['OWNER_VAULT_ENCRYPTION_KEY_V1'] as const;
const REVEAL_CONFIRM='REVEAL_SECRET';

export type OwnerVaultPurpose=typeof OWNER_VAULT_PURPOSES[number];
export type OwnerVaultRecord={id:string;ownerUserId:string;keyName:string;purpose:OwnerVaultPurpose;usedBy:string;algorithm:'AES-256-GCM';keyVersion:number;keySource:string;ciphertext:string;iv:string;authTag:string;createdAt:number;updatedAt:number};
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
  source:'vault'
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
  respond:(data:unknown,status?:number)=>unknown;
  fail:(message:string,status?:number)=>unknown;
  audit:(userId:string,action:string,result:string,details?:Record<string,unknown>)=>Promise<unknown>;
  body:(body:unknown)=>Record<string,unknown>;
}){
  const ownerGate=async(event:Record<string,unknown>,body:unknown)=>{
    const auth=await deps.requireSession(event,body);
    if('errorCode'in auth||(auth.service!=='api'&&auth.service!=='admin')||auth.user.status!=='approved')return null;
    return auth;
  };
  const owned=async(ownerUserId:string,id:string)=>{
    const[raw]=id?await db.get<Omit<OwnerVaultRecord,'id'>>(OWNER_VAULT_TABLE,[id]):[null];
    if(!raw||raw.ownerUserId!==ownerUserId)return null;
    return{id,...raw} as OwnerVaultRecord;
  };
  return{
    'POST /api/owner/api-platform/vault':[async(ctx)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail('OWNER_API_SESSION_REQUIRED',403);
      const items=await apiPlatformVaultItems(auth.user.id);
      const ready=await vaultEncryptionReady();
      return deps.respond({items:items.map(publicItem),count:items.length,encryptionReady:ready,plaintextReturned:false});
    }],
    'POST /api/owner/api-platform/vault/save':[async(ctx)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail('OWNER_API_SESSION_REQUIRED',403);
      const body=deps.body(ctx.body);
      let keyName:string;
      try{keyName=normalizeName(body.name||body.keyName);}catch(caught){return deps.fail(caught instanceof Error?caught.message:'OWNER_VAULT_NAME_INVALID',400);}
      const purpose=normalizePurpose(body.purpose||body.usedBy);
      const usedBy=String(body.usedBy||purpose).trim().slice(0,80)||purpose;
      const value=String(body.value||body.secret||'');
      if(!value||value.length>MAX_VALUE)return deps.fail(value?'OWNER_VAULT_VALUE_TOO_LARGE':'OWNER_VAULT_VALUE_EMPTY',400);
      const resolved=await resolveVaultSecret();
      if(!resolved.ready)return deps.fail('OWNER_VAULT_ENCRYPTION_UNAVAILABLE',503);
      const items=await apiPlatformVaultItems(auth.user.id);
      const existing=items.find(item=>item.id===String(body.id||'')||item.keyName===keyName)||null;
      if(!existing&&items.length>=MAX_ITEMS)return deps.fail('OWNER_VAULT_LIMIT_REACHED',400);
      if(existing&&existing.keyName!==keyName&&items.some(item=>item.keyName===keyName&&item.id!==existing.id))return deps.fail('OWNER_VAULT_NAME_TAKEN',409);
      let envelope;
      try{envelope=encryptValue(value,resolved.secret,auth.user.id,keyName);}catch(caught){return deps.fail(caught instanceof Error?caught.message:'OWNER_VAULT_ENCRYPT_FAILED',500);}
      const now=Date.now();
      if(existing){
        const record={...existing,keyName,purpose,usedBy,...envelope,keySource:resolved.keySource,updatedAt:now};
        const{id,...stored}=record;
        const[ok]=await db.update(OWNER_VAULT_TABLE,[{id,record:stored}]);
        if(!ok)return deps.fail('OWNER_VAULT_WRITE_FAILED',500);
        await deps.audit(auth.user.id,'owner.api.vault.updated','success',{vaultId:id,keyName,purpose});
        return deps.respond({ok:true,rotated:true,item:publicItem(record),plaintextReturned:false});
      }
      const record={ownerUserId:auth.user.id,keyName,purpose,usedBy,...envelope,keySource:resolved.keySource,createdAt:now,updatedAt:now};
      const[id]=await db.add(OWNER_VAULT_TABLE,[record]);
      if(!id)return deps.fail('OWNER_VAULT_WRITE_FAILED',500);
      await deps.audit(auth.user.id,'owner.api.vault.created','success',{vaultId:id,keyName,purpose});
      return deps.respond({ok:true,rotated:false,item:publicItem({id,...record}),plaintextReturned:false});
    }],
    'POST /api/owner/api-platform/vault/:id/rename':[async(ctx)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail('OWNER_API_SESSION_REQUIRED',403);
      const current=await owned(auth.user.id,ctx.params.id);
      if(!current)return deps.fail('OWNER_VAULT_NOT_FOUND',404);
      let nextName:string;
      try{nextName=normalizeName(deps.body(ctx.body).name);}catch(caught){return deps.fail(caught instanceof Error?caught.message:'OWNER_VAULT_NAME_INVALID',400);}
      if(nextName===current.keyName)return deps.respond({ok:true,item:publicItem(current),plaintextReturned:false});
      const clash=(await apiPlatformVaultItems(auth.user.id)).some(item=>item.keyName===nextName&&item.id!==current.id);
      if(clash)return deps.fail('OWNER_VAULT_NAME_TAKEN',409);
      const resolved=await resolveVaultSecret();
      if(!resolved.ready)return deps.fail('OWNER_VAULT_ENCRYPTION_UNAVAILABLE',503);
      let envelope;
      try{
        const plaintext=decryptValue(current,resolved.secret,auth.user.id,current.keyName);
        envelope=encryptValue(plaintext,resolved.secret,auth.user.id,nextName);
      }catch{return deps.fail('OWNER_VAULT_RENAME_FAILED',500);}
      const record={...current,keyName:nextName,...envelope,keySource:resolved.keySource,updatedAt:Date.now()};
      const{id,...stored}=record;
      const[ok]=await db.update(OWNER_VAULT_TABLE,[{id,record:stored}]);
      if(!ok)return deps.fail('OWNER_VAULT_WRITE_FAILED',500);
      await deps.audit(auth.user.id,'owner.api.vault.renamed','success',{vaultId:id,from:current.keyName,to:nextName});
      return deps.respond({ok:true,item:publicItem(record),plaintextReturned:false});
    }],
    'POST /api/owner/api-platform/vault/:id/reveal':[async(ctx)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail('OWNER_API_SESSION_REQUIRED',403);
      if(auth.user.role!=='owner')return deps.fail('OWNER_VAULT_REVEAL_FORBIDDEN',403);
      if(!revealHostAllowed(ctx.event))return deps.fail('OWNER_VAULT_REVEAL_HOST_FORBIDDEN',403);
      const body=deps.body(ctx.body);
      if(String(body.confirm||'')!==REVEAL_CONFIRM)return deps.fail('OWNER_VAULT_REVEAL_CONFIRM_REQUIRED',400);
      // Fase 3: onthullen alleen met verse step-up (Google < 5 min of TOTP).
      const stapFout=await stapOpFout(auth as unknown as StapOpAuth);
      if(stapFout)return deps.fail(stapFout,403);
      const current=await owned(auth.user.id,ctx.params.id);
      if(!current)return deps.fail('OWNER_VAULT_NOT_FOUND',404);
      const resolved=await resolveVaultSecret();
      if(!resolved.ready)return deps.fail('OWNER_VAULT_ENCRYPTION_UNAVAILABLE',503);
      try{
        const value=decryptValue(current,resolved.secret,auth.user.id,current.keyName);
        await deps.audit(auth.user.id,'owner.api.vault.revealed','success',{vaultId:current.id,keyName:current.keyName,length:value.length,plaintextLogged:false});
        return deps.respond({ok:true,name:current.keyName,id:current.id,revealedValue:value,plaintextReturned:true,once:true,ttlSeconds:12});
      }catch{
        await deps.audit(auth.user.id,'owner.api.vault.revealed','rejected',{vaultId:current.id,keyName:current.keyName});
        return deps.fail('OWNER_VAULT_REVEAL_FAILED',500);
      }
    }],
    'POST /api/owner/api-platform/vault/:id/delete':[async(ctx)=>{
      const auth=await ownerGate(ctx.event,ctx.body);
      if(!auth||'errorCode'in auth)return deps.fail('OWNER_API_SESSION_REQUIRED',403);
      const current=await owned(auth.user.id,ctx.params.id);
      if(!current)return deps.fail('OWNER_VAULT_NOT_FOUND',404);
      await db.delete(OWNER_VAULT_TABLE,[current.id]);
      await deps.audit(auth.user.id,'owner.api.vault.deleted','success',{vaultId:current.id,keyName:current.keyName,purpose:current.purpose});
      return deps.respond({ok:true,deletedId:current.id,plaintextReturned:false});
    }]
  };
}
