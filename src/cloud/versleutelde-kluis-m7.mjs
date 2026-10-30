/** M7 experimental, browser-native end-to-end encrypted vault.
 * Deliberately no server keys, no OAuth tokens, no side effects/network calls.
 * NOT independently security audited. Uses WebCrypto in secure contexts.
 */
const te = new TextEncoder();
const td = new TextDecoder();
const VERSION = 'ufw-vault-v1';
const PRF_MIN_BYTES = 32;
const MAX_CHUNK = 4 * 1024 * 1024;
const MAX_CHUNKS = 1_000_000;
const api = () => {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error('VAULT_WEBCRYPTO_UNAVAILABLE');
  return globalThis.crypto;
};
const rand = n => api().getRandomValues(new Uint8Array(n));
const enc = x => te.encode(JSON.stringify(x));
const b64 = bytes => { let s=''; for (let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); };
const unb64 = value => {
  if (typeof value!=='string'||!/^[-\w]+$/.test(value)) throw new Error('VAULT_BASE64_INVALID');
  const s=atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4));
  return Uint8Array.from(s,c=>c.charCodeAt(0));
};
const stable = c => ({v:VERSION,accountId:c.accountId,space:c.space,fileId:c.fileId,revision:c.revision});
export function checkContext(c) {
  if(!c||!['prive','technisch'].includes(c.space) || ![c.accountId,c.fileId,c.revision].every(x=>typeof x==='string'&&x.length>0&&x.length<200)) throw new Error('VAULT_CONTEXT_INVALID');
  return stable(c);
}
const aesKey = bytes => api().subtle.importKey('raw',bytes,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
async function encrypt(key,plain,aad) {
  const iv=rand(12);
  const out=await api().subtle.encrypt({name:'AES-GCM',iv,additionalData:enc(aad),tagLength:128},key,plain);
  return {iv:b64(iv),data:b64(new Uint8Array(out))};
}
async function decrypt(key,packet,aad) {
  if(!packet||unb64(packet.iv).length!==12)throw new Error('VAULT_IV_INVALID');
  return new Uint8Array(await api().subtle.decrypt({name:'AES-GCM',iv:unb64(packet.iv),additionalData:enc(aad),tagLength:128},key,unb64(packet.data)));
}
async function recoveryKey(secret,salt,accountId) {
  const raw=unb64(secret);
  if(raw.length!==32 || unb64(salt).length!==16)throw new Error('VAULT_RECOVERY_FORMAT_INVALID');
  const km=await api().subtle.importKey('raw',raw,'HKDF',false,['deriveKey']);
  return api().subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:unb64(salt),info:te.encode(`${VERSION}:recovery:${accountId}`)},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
/** Only a one-time user-owned 256-bit recovery secret can unwrap this vault.
 * The caller must display it ONCE and keep it away from the server/telemetry.
 */
/** Only pass an output from a VERIFIED WebAuthn assertion with userVerification=required.
 * This module does not verify assertions or communicate with the authenticator.
 * PRF output is not the private key; it is ephemeral extension output.
 */
async function prfWrappingKey(output, salt, accountId, credentialId){
  if(!(output instanceof Uint8Array)||output.length<PRF_MIN_BYTES||
     typeof credentialId!=='string'||credentialId.length<4||credentialId.length>512)throw new Error('VAULT_PRF_INVALID');
  const km=await api().subtle.importKey('raw',output,'HKDF',false,['deriveKey']);
  return api().subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:unb64(salt),
   info:te.encode(`${VERSION}:passkey:${accountId}:${credentialId}`)},km,
   {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function initializeVault(accountId,{verifiedPrfOutput,credentialId}={}) {
  if(typeof accountId!=='string'||accountId.length<1||accountId.length>199)throw new Error('VAULT_ACCOUNT_INVALID');
  const secret=rand(32), root=rand(32), salt=b64(rand(16));
  const recoverySecret=b64(secret);
  const key=await recoveryKey(recoverySecret,salt,accountId);
  const sealedRoot=await encrypt(key,root,{purpose:'root-wrap',v:VERSION,accountId});
  const vault={version:VERSION,accountId,salt,sealedRoot};
  if(verifiedPrfOutput){
    const passkeySalt=b64(rand(16));
    const passkeyKey=await prfWrappingKey(verifiedPrfOutput,passkeySalt,accountId,credentialId);
    const sealed=await encrypt(passkeyKey,root,{purpose:'passkey-root',v:VERSION,accountId,credentialId});
    vault.passkey={credentialId,salt:passkeySalt,sealed};
  }
  const unlockedRoot=await aesKey(root);
  root.fill(0);secret.fill(0);
  return {vault,recoverySecret,unlockedRoot};
}
export async function unlockVault(vault,recoverySecret,expectedAccountId) {
  if(!vault || vault.version!==VERSION ||vault.accountId!==expectedAccountId)throw new Error('VAULT_ACCOUNT_MISMATCH');
  const key=await recoveryKey(recoverySecret,vault.salt,vault.accountId);
  const root=await decrypt(key,vault.sealedRoot,{purpose:'root-wrap',v:VERSION,accountId:vault.accountId});
  if(root.length!==32)throw new Error('VAULT_ROOT_LENGTH_INVALID');
  const unlockedRoot=await aesKey(root);root.fill(0);
  return unlockedRoot;
}
/** On another device the credential must support PRF and pass a verified assertion.
 * If unavailable, the user must unlock with their 256-bit offline recovery secret.
 */
export async function unlockVaultWithPasskey(vault,verifiedPrfOutput,expectedAccountId,credentialId){
  if(!vault||vault.version!==VERSION||vault.accountId!==expectedAccountId||vault.passkey?.credentialId!==credentialId)throw new Error('VAULT_ACCOUNT_OR_CREDENTIAL_MISMATCH');
  const key=await prfWrappingKey(verifiedPrfOutput,vault.passkey.salt,expectedAccountId,credentialId);
  const root=await decrypt(key,vault.passkey.sealed,{purpose:'passkey-root',v:VERSION,accountId:expectedAccountId,credentialId});
  if(root.length!==32)throw new Error('VAULT_ROOT_LENGTH_INVALID');
  const unlockedRoot=await aesKey(root);root.fill(0);return unlockedRoot;
}

/** Streaming encryption: only one <=4 MiB chunk must be in memory at once.
 * Resumability requires an external authenticated upload manifest and a durable,
 * user-controlled per-upload key escrow; this experimental session is NOT resumable.
 */
export async function createEncryptionSession({rootKey,context,totalChunks,metadata={}}){
  const c=checkContext(context);
  if(!Number.isSafeInteger(totalChunks)||totalChunks<1||totalChunks>MAX_CHUNKS)throw new Error('VAULT_CHUNKS_INVALID');
  const raw=rand(32),key=await aesKey(raw);
  const wrappedKey=await encrypt(rootKey,raw,{purpose:'file-wrap',...c});raw.fill(0);
  const encryptedMetadata=await encrypt(key,enc(metadata),{purpose:'metadata',...c});
  let index=0,totalBytes=0;const summaries=[];
  return {
    async encryptNext(bytes){
      if(index>=totalChunks||!(bytes instanceof Uint8Array)||bytes.length>MAX_CHUNK)throw new Error('VAULT_STREAM_INVALID_CHUNK');
      const packet=await encrypt(key,bytes,{purpose:'file-chunk',...c,index,count:totalChunks});
      const result={...packet,index,size:bytes.length,checksum:await sha256(unb64(packet.data))};
      summaries.push({index,size:bytes.length,checksum:result.checksum});totalBytes+=bytes.length;index++;return result;
    },
    finalize(){
      if(index!==totalChunks)throw new Error('VAULT_STREAM_INCOMPLETE');
      return {version:VERSION,context:c,totalBytes,totalChunks,wrappedKey,encryptedMetadata,packets:summaries};
    }
  };
}

export async function sha256(bytes) {
  return b64(new Uint8Array(await api().subtle.digest('SHA-256',bytes)));
}
/** Encrypt in bounded independent chunks; no provider identifiers/tokens in ciphertext.
 * objectId is stable across source/destination so ciphertext can be relayed blindly.
 * Metadata (filename/mime) encrypted too; server only learns sizes and timing.
 */
export async function encryptObject({rootKey,context,chunks,metadata={}}) {
  const c=checkContext(context);
  if(!Array.isArray(chunks) || chunks.length<1||chunks.length>MAX_CHUNKS)throw new Error('VAULT_CHUNKS_INVALID');
  const raw=rand(32), fileKey=await aesKey(raw);
  const wrappedKey=await encrypt(rootKey,raw,{purpose:'file-wrap',...c});
  raw.fill(0);
  const encryptedMetadata=await encrypt(fileKey,enc(metadata),{purpose:'metadata',...c});
  const packets=[];
  let totalBytes=0;
  for(let i=0;i<chunks.length;i++) {
    const chunk=chunks[i];
    if(!(chunk instanceof Uint8Array)||chunk.length>MAX_CHUNK)throw new Error('VAULT_CHUNK_TOO_LARGE');
    totalBytes+=chunk.length;
    const packet=await encrypt(fileKey,chunk,{purpose:'file-chunk',...c,index:i,count:chunks.length});
    packets.push({...packet,index:i,size:chunk.length,checksum:await sha256(unb64(packet.data))});
  }
  return {manifest:{version:VERSION,context:c,totalBytes,totalChunks:chunks.length,wrappedKey,encryptedMetadata,packets:packets.map(({index,size,checksum})=>({index,size,checksum}))},packets};
}
export async function decryptObject({rootKey,expectedContext,manifest,packets}) {
  const c=checkContext(expectedContext);
  if(manifest?.version!==VERSION||JSON.stringify(manifest.context)!==JSON.stringify(c))throw new Error('VAULT_CONTEXT_MISMATCH');
  if(!Number.isInteger(manifest.totalChunks)||manifest.totalChunks<1||manifest.totalChunks>MAX_CHUNKS||manifest.totalChunks!==manifest.packets?.length||manifest.totalChunks!==packets?.length)throw new Error('VAULT_MANIFEST_COUNT_INVALID');
  const raw=await decrypt(rootKey,manifest.wrappedKey,{purpose:'file-wrap',...c});
  if(raw.length!==32)throw new Error('VAULT_FILE_KEY_INVALID');
  const fileKey=await aesKey(raw);raw.fill(0);
  const meta=JSON.parse(td.decode(await decrypt(fileKey,manifest.encryptedMetadata,{purpose:'metadata',...c})));
  let totalBytes=0;const chunks=[];
  for(let i=0;i<manifest.totalChunks;i++){
    const m=manifest.packets[i],p=packets[i];
    if(m.index!==i||p.index!==i||!Number.isSafeInteger(m.size)||m.size<0||m.size>MAX_CHUNK)throw new Error('VAULT_CHUNK_INDEX_INVALID');
    if(await sha256(unb64(p.data))!==m.checksum)throw new Error('VAULT_CIPHERTEXT_CHANGED');
    const data=await decrypt(fileKey,p,{purpose:'file-chunk',...c,index:i,count:manifest.totalChunks});
    if(data.length!==m.size)throw new Error('VAULT_SIZE_INVALID');
    totalBytes+=data.length;chunks.push(data);
  }
  if(totalBytes!==manifest.totalBytes)throw new Error('VAULT_TOTAL_BYTES_MISMATCH');
  return {chunks,metadata:meta};
}
export const vaultFormatVersion=VERSION;
