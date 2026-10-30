/** M2 real bounded COPY executor. Never claim a move is safe without conditional provider deletion.
 * Persistence/leases are delegated to Postgres store. No release routes activate this yet.
 */
import {randomUUID,createHash} from 'node:crypto';
import type {CloudAanbieder,CloudRuimte} from '../shared/cloud-integratie-contract';
import type {CloudTransport,RemoteLocation,RemoteFile,CloudGrantContext} from './cloud-overdracht-adapters';
import {CloudTransportError,sha256} from './cloud-overdracht-adapters';
export type TransferInput={ownerUserId:string;space:CloudRuimte;idempotencyKey:string;mode:'copy'|'move';
 source:{provider:CloudAanbieder;accountId:string;fileId:string;revision:string};
 target:{provider:CloudAanbieder;accountId:string;folderId:string};requestedName?:string};
export type TransferStatus='queued'|'running'|'done'|'failed'|'review';
export type TransferJob={id:string;input:TransferInput;status:TransferStatus;lease:string;attempts:number;result?:{id:string;bytes:number;sha256:string};error?:string};
export type JobRepository={enqueue(input:TransferInput):Promise<TransferJob>;claim(id:string,owner:string,space:CloudRuimte):Promise<TransferJob|null>;
 finish(id:string,lease:string,status:TransferStatus,output:{result?:TransferJob['result'];error?:string}):Promise<void>};
export const MAX_BOUND_BYTES=32*1024*1024;
const keyOk=(v:string)=>/^[A-Za-z0-9_-]{8,120}$/.test(v);
export function validateTransfer(input:TransferInput){
 if(!keyOk(input.idempotencyKey)||!input.ownerUserId||!['prive','technisch'].includes(input.space)||
 !input.source.accountId||!input.target.accountId||!input.source.fileId||!input.target.folderId)throw new CloudTransportError('CLOUD_TRANSFER_INPUT_INVALID',400);
 if(input.mode!=='copy'&&input.mode!=='move')throw new CloudTransportError('CLOUD_TRANSFER_MODE_INVALID',400);
 if(input.mode==='move')throw new CloudTransportError('CLOUD_MOVE_NOT_SAFE_UNTIL_PROVIDER_CONDITIONAL_DELETE',409);
 if(input.source.provider===input.target.provider&&input.source.accountId===input.target.accountId&&input.source.fileId===input.target.folderId)throw new CloudTransportError('CLOUD_TRANSFER_SAME_RESOURCE',409);
}
export class CloudTransferExecutor {
 private readonly adapters=new Map<CloudAanbieder,CloudTransport>();
 constructor(private readonly jobs:JobRepository,adapters:CloudTransport[]){adapters.forEach(a=>{if(this.adapters.has(a.provider))throw new Error('DUPLICATE_PROVIDER');this.adapters.set(a.provider,a);});}
 async queue(input:TransferInput){
   validateTransfer(input);const source=this.adapters.get(input.source.provider),target=this.adapters.get(input.target.provider);
   if(!source||!target)throw new CloudTransportError('CLOUD_TRANSFER_PROVIDER_NOT_CONFIGURED',409);
   const sContext:CloudGrantContext={userId:input.ownerUserId,space:input.space,accountId:input.source.accountId,provider:input.source.provider};
   const tContext:CloudGrantContext={userId:input.ownerUserId,space:input.space,accountId:input.target.accountId,provider:input.target.provider};
   const [item,folder]=await Promise.all([source.stat({context:sContext,fileId:input.source.fileId}),target.stat({context:tContext,fileId:input.target.folderId})]);
   if(!item.canRead||item.isFolder||item.size<1||item.size>MAX_BOUND_BYTES)throw new CloudTransportError('CLOUD_TRANSFER_SOURCE_NOT_BOUNDED_OR_FORBIDDEN',409);
   if(input.source.revision&&input.source.revision!==item.revision)throw new CloudTransportError('CLOUD_SOURCE_REVISION_CHANGED',409);
   if(!folder.isFolder||!folder.canWrite)throw new CloudTransportError('CLOUD_TRANSFER_TARGET_FOLDER_NOT_WRITABLE',403);
   return this.jobs.enqueue(input);
  }
 async execute(id:string,owner:string,space:CloudRuimte){const job=await this.jobs.claim(id,owner,space);if(!job)return null;
  const {input}=job;let outcome:TransferJob['result']|undefined;
  try {
   validateTransfer(input);if(input.ownerUserId!==owner||input.space!==space)throw new CloudTransportError('CLOUD_TRANSFER_OWNER_MISMATCH',403);
   const source=this.adapters.get(input.source.provider),destination=this.adapters.get(input.target.provider);
   if(!source||!destination)throw new CloudTransportError('CLOUD_TRANSFER_PROVIDER_NOT_CONFIGURED',409);
   const sContext:CloudGrantContext={userId:owner,space,accountId:input.source.accountId,provider:input.source.provider};
   const tContext:CloudGrantContext={userId:owner,space,accountId:input.target.accountId,provider:input.target.provider};
   const s:RemoteLocation={context:sContext,fileId:input.source.fileId};
   const folder=await destination.stat({context:tContext,fileId:input.target.folderId});
   if(!folder.isFolder||!folder.canWrite)throw new CloudTransportError('CLOUD_TRANSFER_TARGET_FOLDER_NOT_WRITABLE',403);
   const previous:RemoteFile=await source.stat(s);
   if(previous.isFolder||!previous.canRead||previous.size<1||previous.size>MAX_BOUND_BYTES)throw new CloudTransportError('CLOUD_TRANSFER_SOURCE_NOT_BOUNDED_OR_FORBIDDEN',409);
   if(input.source.revision&&previous.revision!==input.source.revision)throw new CloudTransportError('CLOUD_SOURCE_REVISION_CHANGED',409);
   const bytes=await source.download(s,MAX_BOUND_BYTES);
   if(bytes.byteLength!==previous.size)throw new CloudTransportError('CLOUD_SOURCE_BYTES_MISMATCH',409);
   const after=await source.stat(s);
   if(after.size!==previous.size||after.revision!==previous.revision)throw new CloudTransportError('CLOUD_SOURCE_MUTATED_DURING_READ',409);
   const name=input.requestedName||previous.name;
   const destinationLocation:RemoteLocation={context:tContext,fileId:input.target.folderId,parentId:input.target.folderId};
   const uploaded=await destination.upload(destinationLocation,name,bytes,previous.mime);
   if(uploaded.size!==bytes.byteLength)throw new CloudTransportError('CLOUD_TARGET_SIZE_MISMATCH',409);
   const created:RemoteLocation={context:tContext,fileId:uploaded.id};
   const targetMeta=await destination.stat(created);
   if(targetMeta.size!==bytes.length||targetMeta.revision!==uploaded.revision)throw new CloudTransportError('CLOUD_TARGET_METADATA_MISMATCH',409);
   const verify=await destination.download(created,MAX_BOUND_BYTES);
   if(sha256(bytes)!==sha256(verify))throw new CloudTransportError('CLOUD_TARGET_SHA256_MISMATCH',409);
   outcome={id:uploaded.id,bytes:bytes.length,sha256:sha256(bytes)};
   await this.jobs.finish(id,job.lease,'done',{result:outcome});
   return {status:'done' as const,result:outcome};
  }catch(e){
   const error=e instanceof CloudTransportError?e.code:'CLOUD_TRANSFER_UNEXPECTED_FAILURE';
   // An ambiguous provider response can mean a remote copy exists. Never blindly retry/overwrite it.
   await this.jobs.finish(id,job.lease,'review',{error});return{status:'review' as const,error};
  }
 }
}
/** Deterministic manifest fingerprint, excludes credentials and timestamps. */
export const transferFingerprint=(x:TransferInput)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
