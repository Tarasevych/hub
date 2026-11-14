/** Cloud M2: LIVE provider file transports; no OAuth shortcuts. No deployment gate is changed.
 * Credential resolution must be backed by a verified, user+space+account-scoped grant.
 * Network hosts are pinned, including redirects. Tokens are never logged or returned to the browser.
 */
import { createHash } from 'node:crypto';
import type { CloudAanbieder, CloudRuimte } from '../shared/cloud-integratie-contract';

export type CloudGrantContext = { userId: string; space: CloudRuimte; accountId: string; provider: CloudAanbieder };
export type CloudTokenResolver = (context: CloudGrantContext, operation: 'read'|'write') => Promise<string>;
export type Fetcher = typeof fetch;
export type RemoteFile = { id:string; name:string; size:number; mime:string; revision:string; isFolder:boolean; canRead:boolean; canWrite:boolean };
export type RemoteUpload = { id:string; size:number; revision:string };
export type RemoteLocation = { context:CloudGrantContext; fileId:string; parentId?:string };
export interface CloudTransport {
  readonly provider:CloudAanbieder;
  stat(location:RemoteLocation):Promise<RemoteFile>;
  download(location:RemoteLocation, maxBytes:number):Promise<Uint8Array>;
  upload(location:RemoteLocation, name:string, bytes:Uint8Array, mime:string):Promise<RemoteUpload>;
}
export class CloudTransportError extends Error {
  constructor(public readonly code:string, public readonly status:number=502){super(code);this.name='CloudTransportError';}
}
const bounded=(value:string,max=400)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\r\n\0]/.test(value);
const safeName=(name:string)=>bounded(name,200)&&name!=='.'&&name!=='..'&&!/[\\/]/.test(name);
const validId=(id:string)=>bounded(id,400)&&!/[?#]/.test(id);
/**
 * SEC-002 (aanv-ronde1-06): Dropbox-pad of -id, LINEAIR getoetst. De vroegere expressie /^\/(?:[^\r\n\\]+\/?){1,40}$/ had geneste
 * kwantoren met «/» in de tekenklasse: «/aaaa…a\» (enkele tientallen tekens) liet de enige Node-thread eindeloos terugzoeken.
 * Nu: «id:…» of een absoluut pad zonder \, CR, LF, NUL, hoogstens 1024 tekens, 1..40 segmenten van hoogstens 255 tekens,
 * geen «.» of «..». / Лінійна перевірка шляху Dropbox замість виразу з вкладеними кванторами.
 */
export function isDropboxPad(waarde:unknown):boolean{if(typeof waarde!=='string'||!waarde.length||waarde.length>1024)return false;if(waarde.startsWith('id:'))return /^id:[A-Za-z0-9_-]{5,300}$/.test(waarde);if(waarde[0]!=='/'||/[\\\r\n\0]/.test(waarde))return false;const delen=waarde.split('/').filter(Boolean);return delen.length>=1&&delen.length<=40&&delen.every(deel=>deel.length<=255&&deel!=='.'&&deel!=='..')}
const upstream=async(resp:Response,code:string,allowed=[200,201,202,204])=>{if(!allowed.includes(resp.status)){
  if(resp.status===401||resp.status===403)throw new CloudTransportError('CLOUD_PROVIDER_PERMISSION_DENIED',403);
  if(resp.status===404)throw new CloudTransportError('CLOUD_PROVIDER_RESOURCE_NOT_FOUND',404);
  if(resp.status===409||resp.status===412)throw new CloudTransportError('CLOUD_PROVIDER_REVISION_OR_NAME_CONFLICT',409);
  if(resp.status===429||resp.status>=500)throw new CloudTransportError('CLOUD_PROVIDER_RETRYABLE',503);
  throw new CloudTransportError(code,502);
}return resp;};
export function verifiedUploadUrl(raw:string):boolean {
  try {const u=new URL(raw); if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return false;
    const h=u.hostname.toLowerCase(); return h==='graph.microsoft.com'||h==='api.onedrive.com'||
    h==='public.dm.files.1drv.com'||h.endsWith('.up.1drv.com')||h.endsWith('.1drv.com')||
    h.endsWith('.sharepoint.com')||h.endsWith('.sharepoint-df.com')||h.endsWith('.sharepointonline.com');
  }catch{return false;}
}
async function readBounded(resp:Response,max:number):Promise<Uint8Array>{
  if(!resp.body)throw new CloudTransportError('CLOUD_PROVIDER_NO_BODY');
  const claimed=Number(resp.headers.get('content-length')||'0');
  if(claimed>max)throw new CloudTransportError('CLOUD_TRANSFER_TOO_LARGE',413);
  const reader=resp.body.getReader(),parts:Uint8Array[]=[];let n=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>max)throw new CloudTransportError('CLOUD_TRANSFER_TOO_LARGE',413);parts.push(value);}}
  finally{reader.releaseLock();if(n>max)await resp.body.cancel().catch(()=>{});}
  const data=new Uint8Array(n);let offset=0;for(const part of parts){data.set(part,offset);offset+=part.length;}
  return data;
}
const assertLocation=(loc:RemoteLocation)=>{if(!validId(loc.fileId)||!bounded(loc.context.userId,200)||!bounded(loc.context.accountId,250))throw new CloudTransportError('CLOUD_INVALID_FILE_REFERENCE',400);};
const assertSpace=(loc:RemoteLocation,expected:CloudAanbieder)=>{assertLocation(loc);if(loc.context.provider!==expected)throw new CloudTransportError('CLOUD_PROVIDER_MISMATCH',403);};
const utf8=(data:unknown)=>JSON.stringify(data);
const asciiHeaderArg=(value:unknown)=>utf8(value).replace(/[\u007f-\uffff]/g,ch=>'\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
/** Microsoft Graph delegated accounts: personal/business/SharePoint determined by a server-verified connection. */
export class MicrosoftGraphTransport implements CloudTransport {
  constructor(public readonly provider:'onedrive-personal'|'onedrive-business'|'sharepoint',private readonly token:CloudTokenResolver,private readonly request:Fetcher=fetch,private readonly driveId?: (context:CloudGrantContext)=>Promise<string>){}
  private async base(loc:RemoteLocation){
    assertSpace(loc,this.provider);
    if(this.provider==='sharepoint'){
      const drive=await this.driveId?.(loc.context);
      if(!drive||!validId(drive))throw new CloudTransportError('CLOUD_SHAREPOINT_DRIVE_NOT_RESOLVED',403);
      return `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(drive)}`;
    }
    return 'https://graph.microsoft.com/v1.0/me/drive';
  }
  private async url(loc:RemoteLocation,tail=''){return `${await this.base(loc)}/items/${encodeURIComponent(loc.fileId)}${tail}`;}
  private async headers(loc:RemoteLocation,op:'read'|'write'){
    const token=await this.token(loc.context,op);if(!bounded(token,8192))throw new CloudTransportError('CLOUD_PROVIDER_GRANT_MISSING',403);
    return {Authorization:`Bearer ${token}`};
  }
  async stat(loc:RemoteLocation):Promise<RemoteFile>{
    const resp=await upstream(await this.request(await this.url(loc,'?$select=id,name,size,eTag,file,folder'),{headers:await this.headers(loc,'read'),redirect:'error'}),'CLOUD_GRAPH_METADATA_FAILED',[200]);
    const f=await resp.json() as {id?:string;name?:string;size?:number;eTag?:string;file?:{mimeType?:string};folder?:object};
    if(f.id!==loc.fileId||!Number.isSafeInteger(f.size)||f.size!<0||!safeName(f.name||''))throw new CloudTransportError('CLOUD_GRAPH_METADATA_INVALID');
    return{id:f.id,name:f.name!,size:f.size!,mime:f.file?.mimeType||'application/octet-stream',revision:f.eTag||'',isFolder:!!f.folder,canRead:!!f.file,canWrite:true};
  }
  async download(loc:RemoteLocation,maxBytes:number):Promise<Uint8Array>{
    const url=await this.url(loc,'/content');let resp=await this.request(url,{headers:await this.headers(loc,'read'),redirect:'manual'});
    if([301,302,303,307,308].includes(resp.status)){
      const target=resp.headers.get('location')||'';
      if(!verifiedUploadUrl(target)||new URL(target).hostname==='graph.microsoft.com')throw new CloudTransportError('CLOUD_GRAPH_DOWNLOAD_REDIRECT_REJECTED',502);
      // Pre-authorized URL; deliberately NEVER send OAuth Authorization to redirected host.
      resp=await this.request(target,{redirect:'error'});
    }
    await upstream(resp,'CLOUD_GRAPH_DOWNLOAD_FAILED',[200]);return readBounded(resp,maxBytes);
  }
  async upload(loc:RemoteLocation,name:string,data:Uint8Array,mime:string):Promise<RemoteUpload>{
    assertSpace(loc,this.provider);if(!safeName(name)||!validId(loc.parentId||''))throw new CloudTransportError('CLOUD_GRAPH_TARGET_INVALID',400);
    const parent=loc.parentId!,endpoint=`${await this.base(loc)}/items/${encodeURIComponent(parent)}:/${encodeURIComponent(name)}:/createUploadSession`;
    const creation=await upstream(await this.request(endpoint,{method:'POST',headers:{...await this.headers(loc,'write'),'Content-Type':'application/json'},body:utf8({item:{'@microsoft.graph.conflictBehavior':'fail',name}}),redirect:'error'}),'CLOUD_GRAPH_SESSION_FAILED',[200,201]);
    const session=await creation.json() as {uploadUrl?:string};
    if(!session.uploadUrl||!verifiedUploadUrl(session.uploadUrl)||new URL(session.uploadUrl).hostname==='graph.microsoft.com')throw new CloudTransportError('CLOUD_GRAPH_SESSION_URL_REJECTED');
    const CHUNK=5*1024*1024;let finished:RemoteUpload|undefined;
    for(let offset=0;offset<data.length;offset+=CHUNK){
      const section=data.slice(offset,Math.min(offset+CHUNK,data.length));
      const resp=await upstream(await this.request(session.uploadUrl,{method:'PUT',headers:{'Content-Length':String(section.length),'Content-Range':`bytes ${offset}-${offset+section.length-1}/${data.length}`},body:Buffer.from(section),redirect:'error'}),'CLOUD_GRAPH_CHUNK_FAILED',[200,201,202]);
      if(resp.status!==202){const item=await resp.json() as {id?:string;size?:number;eTag?:string};if(!item.id||item.size!==data.length)throw new CloudTransportError('CLOUD_GRAPH_FINAL_SIZE_MISMATCH');finished={id:item.id,size:item.size,revision:item.eTag||''};}
      else if(offset+section.length>=data.length)throw new CloudTransportError('CLOUD_GRAPH_FINAL_CHUNK_NOT_COMMITTED');
    }
    if(!finished)throw new CloudTransportError('CLOUD_GRAPH_UPLOAD_NOT_COMMITTED');return finished;
  }
}
/** Dropbox user token is resolved from account+space every call. No direct browser token exposure. */
export class DropboxTransport implements CloudTransport {
  readonly provider='dropbox' as const;
  constructor(private readonly token:CloudTokenResolver,private readonly request:Fetcher=fetch){}
  private path(loc:RemoteLocation){assertSpace(loc,this.provider);if(!isDropboxPad(loc.fileId))throw new CloudTransportError('CLOUD_DROPBOX_PATH_INVALID',400);return loc.fileId;}
  private async auth(loc:RemoteLocation,op:'read'|'write'){const t=await this.token(loc.context,op);if(!bounded(t,8192))throw new CloudTransportError('CLOUD_PROVIDER_GRANT_MISSING',403);return {Authorization:`Bearer ${t}`};}
  async stat(loc:RemoteLocation):Promise<RemoteFile>{
    if(loc.fileId==='root'){
      const check=await this.request('https://api.dropboxapi.com/2/files/list_folder',{method:'POST',headers:{...await this.auth(loc,'write'),'Content-Type':'application/json'},body:utf8({path:'',limit:1}),redirect:'error'});
      await upstream(check,'CLOUD_DROPBOX_ROOT_ACCESS_FAILED',[200]);
      return{id:'root',name:'/',size:0,mime:'inode/directory',revision:'',isFolder:true,canRead:false,canWrite:true};
    }
    const resp=await upstream(await this.request('https://api.dropboxapi.com/2/files/get_metadata',{method:'POST',headers:{...await this.auth(loc,'read'),'Content-Type':'application/json'},body:utf8({path:this.path(loc),include_deleted:false}),redirect:'error'}),'CLOUD_DROPBOX_METADATA_FAILED',[200]);
    const x=await resp.json() as {'.tag'?:string;id?:string;name?:string;size?:number;rev?:string;is_downloadable?:boolean};
    if(!x.id||!safeName(x.name||'')||!['file','folder'].includes(x['.tag']||''))throw new CloudTransportError('CLOUD_DROPBOX_METADATA_INVALID');
    const folder=x['.tag']==='folder';
    if(!folder&&(!Number.isSafeInteger(x.size)||x.size!<0))throw new CloudTransportError('CLOUD_DROPBOX_METADATA_INVALID');
    return{id:x.id,name:x.name!,size:folder?0:x.size!,mime:folder?'inode/directory':'application/octet-stream',revision:x.rev||'',isFolder:folder,canRead:!folder&&x.is_downloadable!==false,canWrite:true};
  }
  async download(loc:RemoteLocation,max:number){
    const resp=await upstream(await this.request('https://content.dropboxapi.com/2/files/download',{method:'POST',headers:{...await this.auth(loc,'read'),'Dropbox-API-Arg':asciiHeaderArg({path:this.path(loc)})},redirect:'error'}),'CLOUD_DROPBOX_DOWNLOAD_FAILED',[200]);return readBounded(resp,max);
  }
  async upload(loc:RemoteLocation,name:string,data:Uint8Array,mime:string):Promise<RemoteUpload>{
    assertSpace(loc,this.provider);if(!safeName(name)||!validId(loc.parentId||''))throw new CloudTransportError('CLOUD_DROPBOX_TARGET_INVALID',400);
    if(loc.parentId!=='root'&&!isDropboxPad(loc.parentId||''))
      throw new CloudTransportError('CLOUD_DROPBOX_FOLDER_PATH_INVALID',400);
    const auth=await this.auth(loc,'write');
    let folder='';
    if(loc.parentId!=='root'){
      // A Dropbox folder is identified by id:...; resolve its canonical path server-side.
      // Never concatenate provider IDs as directory names or trust browser-supplied URLs.
      const meta=await upstream(await this.request('https://api.dropboxapi.com/2/files/get_metadata',{
        method:'POST',headers:{...auth,'Content-Type':'application/json'},
        body:utf8({path:loc.parentId}),redirect:'error'
      }),'CLOUD_DROPBOX_TARGET_FOLDER_METADATA_FAILED',[200]);
      const d=await meta.json() as {id?:string;'.tag'?:string;path_display?:string};
      if(d.id!==loc.parentId||d['.tag']!=='folder'||!d.path_display?.startsWith('/')||
        d.path_display.includes('..')||/[\\\r\n]/.test(d.path_display))
        throw new CloudTransportError('CLOUD_DROPBOX_TARGET_FOLDER_UNVERIFIED',409);
      folder=d.path_display;
    }
    const path=`${folder}/${name}`;
    const CHUNK=4*1024*1024;
    const started=await upstream(await this.request('https://content.dropboxapi.com/2/files/upload_session/start',{method:'POST',headers:{...auth,'Content-Type':'application/octet-stream','Dropbox-API-Arg':asciiHeaderArg({close:false})},body:Buffer.alloc(0),redirect:'error'}),'CLOUD_DROPBOX_SESSION_FAILED',[200]);
    const session=await started.json() as {session_id?:string};if(!session.session_id||!bounded(session.session_id,300))throw new CloudTransportError('CLOUD_DROPBOX_SESSION_INVALID');
    let offset=0;
    while(offset<data.length){const bytes=data.slice(offset,Math.min(offset+CHUNK,data.length));
      const close=offset+bytes.length===data.length;
      await upstream(await this.request('https://content.dropboxapi.com/2/files/upload_session/append_v2',{method:'POST',headers:{...auth,'Content-Type':'application/octet-stream','Dropbox-API-Arg':asciiHeaderArg({cursor:{session_id:session.session_id,offset},close})},body:Buffer.from(bytes),redirect:'error'}),'CLOUD_DROPBOX_APPEND_FAILED',[200]);offset+=bytes.length;}
    const finish=await upstream(await this.request('https://content.dropboxapi.com/2/files/upload_session/finish',{method:'POST',headers:{...auth,'Content-Type':'application/octet-stream','Dropbox-API-Arg':asciiHeaderArg({cursor:{session_id:session.session_id,offset},commit:{path,mode:{'.tag':'add'},autorename:false,mute:true,strict_conflict:true}})},body:Buffer.alloc(0),redirect:'error'}),'CLOUD_DROPBOX_FINISH_FAILED',[200]);
    const result=await finish.json() as {id?:string;rev?:string;size?:number};if(!result.id||result.size!==data.length)throw new CloudTransportError('CLOUD_DROPBOX_FINAL_SIZE_MISMATCH');
    return{id:result.id,size:result.size,revision:result.rev||''};
  }
}
export const sha256=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');

/** Google Drive binary file read/write. Google Workspace native Docs require separate export adapter. */
export class GoogleDriveTransport implements CloudTransport {
 readonly provider='google-drive' as const;
 constructor(private readonly token:CloudTokenResolver,private readonly request:Fetcher=fetch){}
 private async auth(loc:RemoteLocation,op:'read'|'write'){assertSpace(loc,this.provider);const t=await this.token(loc.context,op);if(!bounded(t,8192))throw new CloudTransportError('CLOUD_PROVIDER_GRANT_MISSING',403);return {Authorization:`Bearer ${t}`};}
 async stat(loc:RemoteLocation):Promise<RemoteFile>{
  assertSpace(loc,this.provider);
  const fields='id,name,size,version,mimeType,trashed,capabilities(canDownload,canAddChildren)';
  const resp=await upstream(await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(loc.fileId)}?supportsAllDrives=true&fields=${encodeURIComponent(fields)}`,{headers:await this.auth(loc,'read'),redirect:'error'}),'CLOUD_GOOGLE_METADATA_FAILED',[200]);
  const f=await resp.json() as {id?:string;name?:string;size?:string;version?:string;mimeType?:string;trashed?:boolean;capabilities?:{canDownload?:boolean;canAddChildren?:boolean}};
  const folder=f.mimeType==='application/vnd.google-apps.folder';
  const size=folder?0:Number(f.size);
  if(f.id!==loc.fileId||!safeName(f.name||'')||!f.mimeType||f.trashed||!Number.isSafeInteger(size)||size<0)throw new CloudTransportError('CLOUD_GOOGLE_METADATA_INVALID');
  const nativeDoc=f.mimeType.startsWith('application/vnd.google-apps.')&&f.mimeType!=='application/vnd.google-apps.folder';
  return{id:f.id!,name:f.name!,size,mime:f.mimeType,revision:String(f.version||''),isFolder:f.mimeType==='application/vnd.google-apps.folder',canRead:!nativeDoc&&f.capabilities?.canDownload===true,canWrite:f.capabilities?.canAddChildren===true};
 }
 async download(loc:RemoteLocation,max:number){
  const resp=await upstream(await this.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(loc.fileId)}?alt=media&supportsAllDrives=true`,{headers:await this.auth(loc,'read'),redirect:'error'}),'CLOUD_GOOGLE_DOWNLOAD_FAILED',[200]);return readBounded(resp,max);
 }
 async upload(loc:RemoteLocation,name:string,data:Uint8Array,mime:string):Promise<RemoteUpload>{
  assertSpace(loc,this.provider);
  if(!safeName(name)||!validId(loc.parentId||'')||!bounded(mime,160))throw new CloudTransportError('CLOUD_GOOGLE_TARGET_INVALID',400);
  const parent=loc.parentId!;
  const creation=await upstream(await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,version',{method:'POST',headers:{...await this.auth(loc,'write'),'Content-Type':'application/json','X-Upload-Content-Type':mime,'X-Upload-Content-Length':String(data.length)},body:utf8({name,mimeType:mime,parents:[parent]}),redirect:'error'}),'CLOUD_GOOGLE_SESSION_FAILED',[200]);
  const uri=creation.headers.get('Location')||'';let uploadUrl:URL;
  try{uploadUrl=new URL(uri);}catch{throw new CloudTransportError('CLOUD_GOOGLE_SESSION_URL_INVALID');}
  if(uploadUrl.protocol!=='https:'||uploadUrl.hostname!=='www.googleapis.com'||!uploadUrl.pathname.startsWith('/upload/drive/v3/files')||uploadUrl.username||uploadUrl.password)throw new CloudTransportError('CLOUD_GOOGLE_SESSION_URL_INVALID');
  const CHUNK=4*1024*1024;let uploaded:RemoteUpload|undefined;
  for(let start=0;start<data.length;start+=CHUNK){const chunk=data.slice(start,Math.min(data.length,start+CHUNK));
   const resp=await this.request(uploadUrl.href,{method:'PUT',headers:{'Content-Type':mime,'Content-Length':String(chunk.length),'Content-Range':`bytes ${start}-${start+chunk.length-1}/${data.length}`},body:Buffer.from(chunk),redirect:'error'});
   if(resp.status===308){if(start+chunk.length>=data.length)throw new CloudTransportError('CLOUD_GOOGLE_UPLOAD_NOT_FINALIZED');continue;}
   await upstream(resp,'CLOUD_GOOGLE_CHUNK_FAILED',[200,201]);
   const info=await resp.json() as {id?:string;size?:string;version?:string};if(!info.id||Number(info.size)!==data.length)throw new CloudTransportError('CLOUD_GOOGLE_UPLOAD_RESULT_INVALID');
   uploaded={id:info.id,size:data.length,revision:String(info.version||'')};
  }
  if(!uploaded)throw new CloudTransportError('CLOUD_GOOGLE_UPLOAD_NOT_COMMITTED');return uploaded;
 }
}
