/** M3 safe MOVE building blocks: copy evidence is durable before any delete.
 * Strictly DEV ONLY; never invoked by a public endpoint or the M2 copy executor.
 * Deletion is refused without an immutable proof of read-back verification and a
 * mandatory exact source revision. An ambiguous response always enters review.
 */
import type { CloudGrantContext, CloudTokenResolver, Fetcher, RemoteLocation, CloudTransport } from './cloud-overdracht-adapters';
import {CloudTransportError,sha256} from './cloud-overdracht-adapters';

export type MoveProof = {
 jobId:string; ownerUserId:string; space:'prive'|'technisch';
 source:{provider:string;accountId:string;fileId:string;revision:string;size:number};
 target:{provider:string;accountId:string;fileId:string;revision:string;size:number};
 checksumSHA256:string; copiedVerifiedAt:string; explicitlyConfirmed:boolean;
};
export type MoveReviewResult = {state:'moved'|'review'|'blocked';reason:string};
export type MoveProofStore = {
 /** Must commit proof in durable storage BEFORE delete. Enforces single owner+space, status and lease. */
 persistVerifiedCopy(proof:MoveProof):Promise<void>;
 /** State transition must CAS by jobId+owner+space+lease to prevent concurrent deletes. */
 claimDelete(jobId:string,owner:string,space:'prive'|'technisch'):Promise<{proof:MoveProof;lease:string}|null>;
 finishDelete(jobId:string,lease:string,result:MoveReviewResult):Promise<void>;
};
export interface ConditionalDeleter {readonly provider:string; deleteIfUnchanged(location:RemoteLocation,expectedRevision:string):Promise<void>;}
const nonempty=(s:string)=>typeof s==='string'&&s.length>0&&s.length<=512&&!/[\r\n\0]/.test(s);
function grantOk(loc:RemoteLocation,provider:string,revision:string){
 if(loc.context.provider!==provider||!nonempty(revision)||!nonempty(loc.fileId)||!nonempty(loc.context.userId)||!nonempty(loc.context.accountId))
  throw new CloudTransportError('CLOUD_M3_DELETE_INVALID_REFERENCE',400);
}
const checkDelete=(response:Response)=>{
 if(response.status===204||response.status===200)return;
 if(response.status===412||response.status===409)throw new CloudTransportError('CLOUD_M3_SOURCE_CHANGED_DO_NOT_DELETE',409);
 if(response.status===401||response.status===403)throw new CloudTransportError('CLOUD_M3_DELETE_FORBIDDEN',403);
 throw new CloudTransportError('CLOUD_M3_DELETE_AMBIGUOUS_MANUAL_REVIEW',502);
};
export class GraphConditionalDeleter implements ConditionalDeleter{
 readonly provider:'onedrive-personal'|'onedrive-business'|'sharepoint';
 private readonly token:CloudTokenResolver;private readonly request:Fetcher;
 private readonly driveId?: (ctx:CloudGrantContext)=>Promise<string>;
 constructor(provider:'onedrive-personal'|'onedrive-business'|'sharepoint',token:CloudTokenResolver,request:Fetcher=fetch,driveId?: (ctx:CloudGrantContext)=>Promise<string>){this.provider=provider;this.token=token;this.request=request;this.driveId=driveId;}
 async deleteIfUnchanged(loc:RemoteLocation,revision:string){
  grantOk(loc,this.provider,revision);
  const drive=this.provider==='sharepoint'?await this.driveId?.(loc.context):null;
  if(this.provider==='sharepoint'&&!drive)throw new CloudTransportError('CLOUD_M3_DRIVE_NOT_VERIFIED',403);
  const base=drive?'drives/'+encodeURIComponent(drive)+'/items/':'me/drive/items/';
  const token=await this.token(loc.context,'write');if(!nonempty(token))throw new CloudTransportError('CLOUD_M3_NO_WRITE_GRANT',403);
  const res=await this.request(`https://graph.microsoft.com/v1.0/${base}${encodeURIComponent(loc.fileId)}`,{
   method:'DELETE',headers:{Authorization:'Bearer '+token,'If-Match':revision},redirect:'error'});
  checkDelete(res);
 }
}
export class DropboxConditionalDeleter implements ConditionalDeleter{
 readonly provider='dropbox' as const;
 private readonly token:CloudTokenResolver;private readonly request:Fetcher;
 constructor(token:CloudTokenResolver,request:Fetcher=fetch){this.token=token;this.request=request;}
 async deleteIfUnchanged(loc:RemoteLocation,revision:string){
  grantOk(loc,this.provider,revision);
  if(!/^(?:id:[A-Za-z0-9_-]{5,300}|\/(?:[^\\\r\n\0]+))$/.test(loc.fileId)||!/^[0-9a-f]{9,}$/.test(revision))throw new CloudTransportError('CLOUD_M3_DROPBOX_REV_INVALID',400);
  const token=await this.token(loc.context,'write');if(!nonempty(token))throw new CloudTransportError('CLOUD_M3_NO_WRITE_GRANT',403);
  const res=await this.request('https://api.dropboxapi.com/2/files/delete_v2',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({path:loc.fileId,parent_rev:revision}),redirect:'error'});
  if(res.status!==200)checkDelete(res);
 }
}
export class BoxConditionalDeleter implements ConditionalDeleter{
 readonly provider='box' as const;
 private readonly token:CloudTokenResolver;private readonly request:Fetcher;
 constructor(token:CloudTokenResolver,request:Fetcher=fetch){this.token=token;this.request=request;}
 async deleteIfUnchanged(loc:RemoteLocation,revision:string){
  grantOk(loc,this.provider,revision);
  if(!/^\d{1,30}$/.test(loc.fileId))throw new CloudTransportError('CLOUD_M3_BOX_FILE_INVALID',400);
  const token=await this.token(loc.context,'write');if(!nonempty(token))throw new CloudTransportError('CLOUD_M3_NO_WRITE_GRANT',403);
  const res=await this.request(`https://api.box.com/2.0/files/${loc.fileId}`,{
    method:'DELETE',headers:{Authorization:'Bearer '+token,'If-Match':revision},redirect:'error'});
  checkDelete(res);
 }
}
/** M3 separates copy verification and source deletion as two independently durable operations. */
export class SafeMoveFinalizer{
 private readonly sources=new Map<string,CloudTransport>(); private readonly deleters=new Map<string,ConditionalDeleter>();
 constructor(private readonly store:MoveProofStore,sources:CloudTransport[],deleters:ConditionalDeleter[]){
  for(const s of sources)this.sources.set(s.provider,s);
  for(const d of deleters)this.deleters.set(d.provider,d);
 }
 async recordVerifiedCopy(proof:MoveProof){
  // Network calls are made by a separate M2 copy worker. This method is used only
  // after the worker has already independently read back and hashed the target.
  if(!proof.explicitlyConfirmed||!nonempty(proof.source.revision)||!nonempty(proof.target.fileId)||
   proof.source.size<1||proof.source.size!==proof.target.size||
   !/^[0-9a-f]{64}$/.test(proof.checksumSHA256))throw new CloudTransportError('CLOUD_M3_INVALID_COPY_PROOF',409);
  if(!this.deleters.has(proof.source.provider))throw new CloudTransportError('CLOUD_M3_DELETE_UNSUPPORTED',409);
  await this.store.persistVerifiedCopy(proof);
 }
 async finalize(jobId:string,owner:string,space:'prive'|'technisch'):Promise<MoveReviewResult|null>{
  const claim=await this.store.claimDelete(jobId,owner,space);if(!claim)return null;
  const {proof,lease}=claim;let result:MoveReviewResult={state:'review',reason:'CLOUD_M3_UNVERIFIED'};
  try{
   if(proof.ownerUserId!==owner||proof.space!==space||!proof.explicitlyConfirmed)throw new CloudTransportError('CLOUD_M3_OWNER_OR_CONFIRMATION_MISMATCH',403);
   const src=this.sources.get(proof.source.provider),dst=this.sources.get(proof.target.provider),del=this.deleters.get(proof.source.provider);
   if(!src||!dst||!del)throw new CloudTransportError('CLOUD_M3_PROVIDER_UNAVAILABLE',409);
   const s:RemoteLocation={context:{userId:owner,space,accountId:proof.source.accountId,provider:proof.source.provider as any},fileId:proof.source.fileId};
   const t:RemoteLocation={context:{userId:owner,space,accountId:proof.target.accountId,provider:proof.target.provider as any},fileId:proof.target.fileId};
   const [smeta,tmeta]=await Promise.all([src.stat(s),dst.stat(t)]);
   if(smeta.isFolder||!smeta.canRead||smeta.revision!==proof.source.revision||smeta.size!==proof.source.size)
    throw new CloudTransportError('CLOUD_M3_SOURCE_CHANGED_BEFORE_DELETE',409);
   if(tmeta.isFolder||!tmeta.canRead||tmeta.revision!==proof.target.revision||tmeta.size!==proof.target.size)
    throw new CloudTransportError('CLOUD_M3_TARGET_CHANGED_BEFORE_DELETE',409);
   const bytes=await dst.download(t,32*1024*1024);
   if(bytes.length!==proof.target.size||sha256(bytes)!==proof.checksumSHA256)
    throw new CloudTransportError('CLOUD_M3_TARGET_VERIFICATION_FAILED',409);
   // Reread source version immediately before deletion and supply provider precondition.
   const finalSrc=await src.stat(s);
   if(finalSrc.revision!==proof.source.revision)throw new CloudTransportError('CLOUD_M3_SOURCE_CHANGED_BEFORE_DELETE',409);
   await del.deleteIfUnchanged(s,proof.source.revision);
   result={state:'moved',reason:'CLOUD_M3_CONDITIONAL_DELETE_CONFIRMED'};
  }catch(e){result={state:'review',reason:e instanceof CloudTransportError?e.code:'CLOUD_M3_DELETE_UNEXPECTED_REVIEW'};}
  await this.store.finishDelete(jobId,lease,result);return result;
 }
}
