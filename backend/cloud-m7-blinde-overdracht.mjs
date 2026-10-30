/** Privacy-first ciphertext-only transfer primitive (development).
 * Storage adapters must be bound to user-owned connection and verify ACL;
 * this module never receives/accepts plaintext, recovery keys, or provider tokens.
 * NO destructive MOVE here. Requires caller-provided idempotent destination staging.
 */
import {createHash} from 'node:crypto';
export class BlindTransferError extends Error {constructor(code){super(code);this.code=code;}}
const digest=x=>createHash('sha256').update(x).digest('base64url');
export function assertBlindCopyRequest(r){
  if(!r||r.mode!=='copy'||r.encryption!=='ufw-vault-v1')throw new BlindTransferError('BLIND_COPY_ONLY');
  if(!r.ownerId||!['prive','technisch'].includes(r.space)|| !r.sourceAccountId||!r.targetAccountId||!r.objectId||!r.transferId)throw new BlindTransferError('BLIND_CONTEXT_INVALID');
  if(r.sourceAccountId===r.targetAccountId&&r.sourceId===r.targetId)throw new BlindTransferError('BLIND_SAME_TARGET');
  if(r.plaintext||r.unlockedKey||r.providerToken||r.recoverySecret)throw new BlindTransferError('BLIND_SECRETS_FORBIDDEN');
  return true;
}
/** Source/dest expected to be authorized, same-principal ciphertext storage adapters.
 * Staging must be durable, idempotent and only visible after atomic publish.
 */
export async function copyCiphertext({request,source,target,authorize,onProgress=()=>{}}){
  assertBlindCopyRequest(request);
  if(typeof authorize!=='function'||await authorize(request)!==true)throw new BlindTransferError('BLIND_AUTH_DENIED');
  const manifest=await source.readManifest(request.objectId);
  if(manifest?.version!=='ufw-vault-v1'||manifest.context?.accountId!==request.ownerId||manifest.context?.space!==request.space||manifest.context?.fileId!==request.objectId)throw new BlindTransferError('BLIND_MANIFEST_CONTEXT_MISMATCH');
  const total=manifest.totalChunks;
  if(!Number.isSafeInteger(total)||total<1||total>1000000||total!==manifest.packets?.length)throw new BlindTransferError('BLIND_MANIFEST_INVALID');
  await target.startStaging(request.transferId,{objectId:request.objectId,total});
  let bytes=0;
  try{
    for(let i=0;i<total;i++){
      const m=manifest.packets[i];
      if(m.index!==i||!Number.isSafeInteger(m.size)||m.size<0||m.size>4194304)throw new BlindTransferError('BLIND_CHUNK_METADATA_INVALID');
      const ciphertext=await source.readChunk(request.objectId,i);
      if(!(ciphertext instanceof Uint8Array)||ciphertext.length>4194320||digest(ciphertext)!==m.checksum)throw new BlindTransferError('BLIND_SOURCE_CIPHERTEXT_CHANGED');
      // Authorize on every chunk: revocation must interrupt a long-running copy.
      if(await authorize(request)!==true)throw new BlindTransferError('BLIND_AUTH_REVOKED');
      await target.stageChunk(request.transferId,i,ciphertext);
      const verified=await target.readStagedChunk(request.transferId,i);
      if(!(verified instanceof Uint8Array)||digest(verified)!==m.checksum)throw new BlindTransferError('BLIND_TARGET_VERIFY_FAILED');
      bytes+=ciphertext.byteLength;
      onProgress({completed:i+1,total});
    }
    if(await authorize(request)!==true)throw new BlindTransferError('BLIND_AUTH_REVOKED');
    await target.publish(request.transferId,manifest);
    return {state:'ciphertext_copied_unverified_by_client',chunks:total,encryptedBytes:bytes};
  }catch(e){
    // No deletion of source; best-effort removal of destination staging.
    try{await target.abort(request.transferId);}catch{}
    throw e;
  }
}
