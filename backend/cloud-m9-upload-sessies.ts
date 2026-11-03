/** M9: explicit protocol adapters for resumable remote uploads.
 * Only file chunks, never entire files, are retained in memory. Nothing in this
 * module runs until a scoped PG-backed worker with an encrypted checkpoint is injected.
 * Network ambiguity => REVIEW REQUIRED; never automatically create a second file.
 */
import {CloudTransportError,verifiedUploadUrl} from './cloud-overdracht-adapters';
import type {Fetcher} from './cloud-overdracht-adapters';
export type UploadProvider='onedrive-personal'|'onedrive-business'|'sharepoint'|'dropbox';
export type UploadLease={jobId:string;owner:string;space:'prive'|'technisch';accountId:string;provider:UploadProvider;
 total:number;offset:number;session:string;target:string;name:string;expectedRevision:string;leaseId:string;};
export type UploadDelta={offset:number;state:'uploading'|'uploaded_not_verified'|'review_required';remoteId?:string;remoteRevision?:string;reason?:string};
export type UploadStore={
 /** A real implementation MUST check exact owner/space/account and one active worker lease. */
 checkpoint:(lease:UploadLease,delta:UploadDelta)=>Promise<void>;
};
export type RangeReader=(start:number,length:number)=>Promise<Uint8Array>;
const fail=(code:string,status=409):never=>{throw new CloudTransportError(code,status);};
function valid(lease:UploadLease):void{
 if(!lease||!lease.jobId||!lease.owner||!lease.accountId||!lease.leaseId||!['prive','technisch'].includes(lease.space)||
  !Number.isSafeInteger(lease.total)||lease.total<=0||!Number.isSafeInteger(lease.offset)||lease.offset<0||lease.offset>lease.total||
  typeof lease.name!=='string'||lease.name.length>200||/[/\\\r\n\0]/.test(lease.name))fail('CLOUD_M9_UPLOAD_LEASE_INVALID',403);
}
function checkSessionUrl(raw:string){
 if(!verifiedUploadUrl(raw)||new URL(raw).hostname==='graph.microsoft.com')fail('CLOUD_M9_GRAPH_SESSION_HOST_UNTRUSTED',403);
 let u:URL;try{u=new URL(raw);}catch{fail('CLOUD_M9_GRAPH_SESSION_INVALID',403);}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||u.pathname.length>2000||u.search.length>6000)fail('CLOUD_M9_GRAPH_SESSION_INVALID',403);
 return u.toString();
}
function checkedDropboxSession(id:string){if(!/^[A-Za-z0-9_:-]{10,500}$/.test(id))fail('CLOUD_M9_DROPBOX_SESSION_INVALID',403);return id;}
const ascii=(v:object)=>JSON.stringify(v).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
/** Every successful chunk must be persisted before the next chunk is read. */
export class M9ChunkUploader{
 constructor(private readonly store:UploadStore,private readonly request:Fetcher=fetch){}
 private async persist(lease:UploadLease,delta:UploadDelta){await this.store.checkpoint(lease,delta);}
 async advanceGraph(lease:UploadLease,read:RangeReader):Promise<UploadDelta>{
  valid(lease);if(lease.provider!=='onedrive-personal'&&lease.provider!=='onedrive-business'&&lease.provider!=='sharepoint')fail('CLOUD_M9_GRAPH_PROVIDER_INVALID',403);
  const uri=checkSessionUrl(lease.session);
  if(lease.offset===lease.total)fail('CLOUD_M9_ALREADY_UPLOADED');
  const CHUNK=5*1024*1024;// exactly 16 * 320KiB
  const length=Math.min(CHUNK,lease.total-lease.offset),bytes=await read(lease.offset,length);
  if(bytes.byteLength!==length)fail('CLOUD_M9_RANGE_READ_MISMATCH');
  let response:Response;
  try{response=await this.request(uri,{method:'PUT',headers:{'Content-Length':String(length),'Content-Range':`bytes ${lease.offset}-${lease.offset+length-1}/${lease.total}`},body:Buffer.from(bytes),redirect:'error',signal:AbortSignal.timeout(90_000)});}
  catch{await this.persist(lease,{offset:lease.offset,state:'review_required',reason:'GRAPH_UNKNOWN_REMOTE_OFFSET'});fail('CLOUD_M9_GRAPH_UNKNOWN_REMOTE_OFFSET',503);}
  if(response.status===202){
   const value=await response.json() as {nextExpectedRanges?:string[]};
   const next=lease.offset+length;
   if(!Array.isArray(value.nextExpectedRanges)||value.nextExpectedRanges.length!==1||value.nextExpectedRanges[0]!==`${next}-`){
    await this.persist(lease,{offset:lease.offset,state:'review_required',reason:'GRAPH_UNEXPECTED_NEXT_RANGE'});fail('CLOUD_M9_GRAPH_UNEXPECTED_NEXT_RANGE');
   }
   const delta:UploadDelta={offset:next,state:'uploading'};await this.persist(lease,delta);return delta;
  }
  if(response.status===200||response.status===201){
   const item=await response.json() as {id?:string;size?:number;eTag?:string};
   if(lease.offset+length!==lease.total||!item.id||item.size!==lease.total){
    await this.persist(lease,{offset:lease.offset,state:'review_required',reason:'GRAPH_COMMIT_UNVERIFIED'});fail('CLOUD_M9_GRAPH_COMMIT_UNVERIFIED');
   }
   const delta:UploadDelta={offset:lease.total,state:'uploaded_not_verified',remoteId:item.id,remoteRevision:item.eTag};
   await this.persist(lease,delta);return delta;
  }
  const reason=response.status===401||response.status===403?'GRAPH_PERMISSION_DENIED':response.status===404?'GRAPH_SESSION_EXPIRED':'GRAPH_UPLOAD_AMBIGUOUS';
  await this.persist(lease,{offset:lease.offset,state:'review_required',reason});fail(`CLOUD_M9_${reason}`,response.status===401||response.status===403?403:409);
 }
 async advanceDropbox(lease:UploadLease,read:RangeReader,token:()=>Promise<string>):Promise<UploadDelta>{
  valid(lease);if(lease.provider!=='dropbox')fail('CLOUD_M9_DROPBOX_PROVIDER_INVALID',403);
  const session=checkedDropboxSession(lease.session);
  const accessToken=await token();if(typeof accessToken!=='string'||accessToken.length<8||accessToken.length>8192||/[\r\n\0]/.test(accessToken))fail('CLOUD_M9_GRANT_INVALID',403);
  if(lease.offset===lease.total)fail('CLOUD_M9_ALREADY_UPLOADED');
  const length=Math.min(4*1024*1024,lease.total-lease.offset),bytes=await read(lease.offset,length);
  if(bytes.byteLength!==length)fail('CLOUD_M9_RANGE_READ_MISMATCH');
  const isLast=lease.offset+length===lease.total;
  const url=isLast?'https://content.dropboxapi.com/2/files/upload_session/finish':'https://content.dropboxapi.com/2/files/upload_session/append_v2';
  const args=isLast?{cursor:{session_id:session,offset:lease.offset},commit:{path:lease.target,mode:{'.tag':'add'},autorename:false,mute:true,strict_conflict:true}}:
   {cursor:{session_id:session,offset:lease.offset},close:false};
  if(!/^\/(?:[^\\\r\n\0/]+\/){0,39}[^\\\r\n\0/]+$/.test(lease.target))fail('CLOUD_M9_DROPBOX_TARGET_INVALID',400);
  let response:Response;
  try{response=await this.request(url,{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/octet-stream','Dropbox-API-Arg':ascii(args)},body:Buffer.from(bytes),redirect:'error',signal:AbortSignal.timeout(90_000)});}
  catch{await this.persist(lease,{offset:lease.offset,state:'review_required',reason:'DROPBOX_UNKNOWN_REMOTE_OFFSET'});fail('CLOUD_M9_DROPBOX_UNKNOWN_REMOTE_OFFSET',503);}
  if(response.status!==200){await this.persist(lease,{offset:lease.offset,state:'review_required',reason:'DROPBOX_CHUNK_UNCERTAIN'});fail('CLOUD_M9_DROPBOX_CHUNK_UNCERTAIN');}
  if(isLast){const body=await response.json() as {id?:string;size?:number;rev?:string};
   if(!body.id||body.size!==lease.total){await this.persist(lease,{offset:lease.offset,state:'review_required',reason:'DROPBOX_COMMIT_UNVERIFIED'});fail('CLOUD_M9_DROPBOX_COMMIT_UNVERIFIED');}
   const delta:UploadDelta={offset:lease.total,state:'uploaded_not_verified',remoteId:body.id,remoteRevision:body.rev};await this.persist(lease,delta);return delta;
  }
  const delta:UploadDelta={offset:lease.offset+length,state:'uploading'};await this.persist(lease,delta);return delta;
 }
}
