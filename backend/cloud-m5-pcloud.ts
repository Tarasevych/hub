/** pCloud HTTP adapter; US/EU host returned by verified OAuth server flow.
 * Never trust a hostname from a browser form or an unchecked OAuth callback.
 * This is transport code, not a complete OAuth/onboarding integration.
 */
import type {CloudTransport, CloudTokenResolver, Fetcher, RemoteLocation, RemoteFile, RemoteUpload} from './cloud-overdracht-adapters';
import {CloudTransportError} from './cloud-overdracht-adapters';
export type PCloudRegion='api.pcloud.com'|'eapi.pcloud.com';
export type PCloudHostResolver=(loc:RemoteLocation)=>Promise<PCloudRegion>;
function validHost(v:string):asserts v is PCloudRegion{
 if(v!=='api.pcloud.com'&&v!=='eapi.pcloud.com')throw new CloudTransportError('CLOUD_PCLOUD_HOST_NOT_APPROVED',403);
}
function fileid(v:string){if(!/^[1-9][0-9]{0,17}$/.test(v))throw new CloudTransportError('CLOUD_PCLOUD_FILE_ID_INVALID',400);return v;}
function folderid(v:string){if(!/^(?:0|[1-9][0-9]{0,17})$/.test(v))throw new CloudTransportError('CLOUD_PCLOUD_FOLDER_ID_INVALID',400);return v;}
function safeName(v:string){if(typeof v!=='string'||!v||v.length>180||v==='.'||v==='..'||/[\\/\0\r\n]/.test(v))throw new CloudTransportError('CLOUD_PCLOUD_NAME_INVALID',400);}
function fail(status:number){throw new CloudTransportError(status===401||status===403?'CLOUD_PCLOUD_PERMISSION_DENIED':'CLOUD_PCLOUD_HTTP_FAILED',status===401||status===403?403:502);}
async function bytesBounded(resp:Response,limit:number){
 if(!Number.isSafeInteger(limit)||limit<1||limit>32*1024*1024)throw new CloudTransportError('CLOUD_PCLOUD_LIMIT_INVALID',400);
 if(Number(resp.headers.get('content-length')||'0')>limit)throw new CloudTransportError('CLOUD_PCLOUD_TOO_LARGE',413);
 if(!resp.body)throw new CloudTransportError('CLOUD_PCLOUD_EMPTY_BODY');
 const reader=resp.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>limit)throw new CloudTransportError('CLOUD_PCLOUD_TOO_LARGE',413);chunks.push(r.value);}}
 finally{reader.releaseLock();}
 const out=new Uint8Array(size);let off=0;for(const c of chunks){out.set(c,off);off+=c.length;}return out;
}
export class PCloudTransport implements CloudTransport{
 readonly provider='pcloud' as const;
 constructor(private readonly token:CloudTokenResolver,private readonly host:PCloudHostResolver,private readonly request:Fetcher=fetch){}
 private async session(loc:RemoteLocation,op:'read'|'write'){
  if(loc.context.provider!==this.provider||!loc.context.userId||!loc.context.accountId)throw new CloudTransportError('CLOUD_PCLOUD_CONTEXT_MISMATCH',403);
  const host=await this.host(loc);validHost(host);
  const token=await this.token(loc.context,op);if(!token||token.length>8192||/[\r\n\0]/.test(token))throw new CloudTransportError('CLOUD_PCLOUD_GRANT_MISSING',403);
  return {host,headers:{Authorization:'Bearer '+token}};
 }
 private async json(loc:RemoteLocation,path:string,query:Record<string,string>,op:'read'|'write'='read'){
  const {host,headers}=await this.session(loc,op);const u=new URL('https://'+host+'/'+path);
  Object.entries(query).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await this.request(u.toString(),{headers,redirect:'error'});if(!r.ok)fail(r.status);
  const v=await r.json() as Record<string,unknown>;if(v.result!==0)throw new CloudTransportError('CLOUD_PCLOUD_API_REJECTED_'+String(v.result),403);
  return v;
 }
 async stat(loc:RemoteLocation):Promise<RemoteFile>{
  const id=fileid(loc.fileId),result=await this.json(loc,'stat',{fileid:id}),m=result.metadata as Record<string,unknown>;
  if(!m||m.isfolder===true||String(m.fileid)!==id||!Number.isSafeInteger(m.size)||Number(m.size)<0||typeof m.name!=='string')
   throw new CloudTransportError('CLOUD_PCLOUD_METADATA_INVALID');
  const rev=String(m.hash||''); // hash is not a conditional-delete revision; MOVE remains blocked.
  return {id,name:m.name,size:Number(m.size),mime:String(m.contenttype||'application/octet-stream'),revision:rev,isFolder:false,canRead:true,canWrite:false};
 }
 async download(loc:RemoteLocation,maxBytes:number){
  const id=fileid(loc.fileId);const v=await this.json(loc,'getfilelink',{fileid:id});
  const hosts=v.hosts,rawPath=v.path;
  if(!Array.isArray(hosts)||typeof hosts[0]!=='string'||typeof rawPath!=='string')throw new CloudTransportError('CLOUD_PCLOUD_LINK_INVALID');
  const host=hosts[0].toLowerCase();
  // Explicit CDN allowlist; no access token forwarded to the CDN.
  if(!/^[a-z0-9-]{1,60}\.pcloud\.com$/.test(host)||host==='api.pcloud.com'||host==='eapi.pcloud.com')
    throw new CloudTransportError('CLOUD_PCLOUD_CDN_NOT_APPROVED',403);
  if(!rawPath.startsWith('/')||rawPath.startsWith('//')||/[\r\n\0\\]/.test(rawPath))throw new CloudTransportError('CLOUD_PCLOUD_LINK_INVALID');
  const u=new URL('https://'+host+rawPath);
  if(u.hostname!==host||u.username||u.password||u.port)throw new CloudTransportError('CLOUD_PCLOUD_LINK_INVALID');
  const r=await this.request(u.toString(),{redirect:'error'});if(!r.ok)fail(r.status);
  return bytesBounded(r,maxBytes);
 }
 async upload(loc:RemoteLocation,name:string,bytes:Uint8Array,mime:string):Promise<RemoteUpload>{
  safeName(name);const id=folderid(loc.parentId||'');if(!bytes.length||bytes.byteLength>32*1024*1024)throw new CloudTransportError('CLOUD_PCLOUD_UPLOAD_LIMIT',413);
  const {host,headers}=await this.session(loc,'write');const body=new FormData();
  body.set('folderid',id);body.set('nopartial','1');body.set('renameifexists','1');
  body.append('file',new Blob([new Uint8Array(bytes)],{type:mime||'application/octet-stream'}),name);
  const r=await this.request('https://'+host+'/uploadfile',{method:'POST',headers,body,redirect:'error'});
  if(!r.ok)fail(r.status);const info=await r.json() as {result?:number;metadata?:Array<{fileid?:number;size?:number;hash?:number}>};
  if(info.result!==0||!info.metadata?.length||info.metadata[0].size!==bytes.byteLength||!Number.isSafeInteger(info.metadata[0].fileid))
    throw new CloudTransportError('CLOUD_PCLOUD_UPLOAD_RESULT_INVALID');
  return {id:String(info.metadata[0].fileid),size:bytes.byteLength,revision:String(info.metadata[0].hash||'')};
 }
}
