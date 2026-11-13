/** M3: additional bounded provider transports. DEVELOPMENT ONLY, NOT wired to live routes.
 * Nextcloud base URL is returned solely by a trusted connection resolver and must pass
 * an egress/SSRF network-policy callback; no URL originates from a browser file reference.
 * Box API host and S3 endpoint are hardcoded. All requests disable redirects by default.
 */
import { createHash, createHmac } from 'node:crypto';
import type { CloudGrantContext, CloudTransport, CloudTokenResolver, Fetcher, RemoteLocation, RemoteFile, RemoteUpload } from './cloud-overdracht-adapters';
import { CloudTransportError } from './cloud-overdracht-adapters';

const enc=(v:string)=>encodeURIComponent(v).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const validName=(v:string)=>typeof v==='string'&&v.length>0&&v.length<=200&&v!=='.'&&v!=='..'&&!/[\\/\r\n\0]/.test(v);
function ensure(test:unknown,code:string,status=400):asserts test{if(!test)throw new CloudTransportError(code,status);}
function boundPath(p:string,folder=false){
  ensure(typeof p==='string'&&p.length<=1200&&p.startsWith('/')&&!p.includes('\\')&&!/[?#\r\n\0]/.test(p),'CLOUD_M3_PATH_INVALID');
  const parts=p.split('/').filter(Boolean);
  ensure(parts.length<=40&&parts.every(x=>x!=='.'&&x!=='..'&&!/%2e|%2f|%5c/i.test(x)),'CLOUD_M3_PATH_TRAVERSAL');
  if(folder)ensure(p==='/'||p.endsWith('/'),'CLOUD_M3_FOLDER_PATH_INVALID');
  return '/'+parts.map(enc).join('/')+(p.endsWith('/')&&parts.length?'/':'');
}
function checkLoc(loc:RemoteLocation,provider:string){
  ensure(loc?.context?.provider===provider&&/^[a-zA-Z0-9:_-]{1,200}$/.test(loc.context.userId)&&
    /^[a-zA-Z0-9:_-]{1,250}$/.test(loc.context.accountId),'CLOUD_M3_ACCOUNT_CONTEXT_INVALID',403);
}
function checkResp(resp:Response,code:string,allowed:number[]){
  if(allowed.includes(resp.status))return;
  if(resp.status===401||resp.status===403)throw new CloudTransportError('CLOUD_M3_PERMISSION_DENIED',403);
  if(resp.status===404)throw new CloudTransportError('CLOUD_M3_NOT_FOUND',404);
  if(resp.status===409||resp.status===412)throw new CloudTransportError('CLOUD_M3_CONFLICT',409);
  if(resp.status===429||resp.status>=500)throw new CloudTransportError('CLOUD_M3_RETRYABLE',503);
  throw new CloudTransportError(code);
}
async function bounded(resp:Response,max:number){
  ensure(Number.isSafeInteger(max)&&max>0&&max<=32*1024*1024,'CLOUD_M3_READ_LIMIT_INVALID');
  const length=resp.headers.get('content-length');if(length!==null&&Number(length)>max)throw new CloudTransportError('CLOUD_M3_FILE_TOO_LARGE',413);
  ensure(resp.body,'CLOUD_M3_EMPTY_RESPONSE',502);
  const reader=resp.body.getReader(),parts:Uint8Array[]=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max)throw new CloudTransportError('CLOUD_M3_FILE_TOO_LARGE',413);parts.push(value);}}
  finally{reader.releaseLock();}
  const out=new Uint8Array(total);let offset=0;for(const chunk of parts){out.set(chunk,offset);offset+=chunk.byteLength;}return out;
}
export type NextcloudVerifiedConnection={origin:string;davUsername:string;authorization:string};
export type NextcloudConnectionResolver=(context:CloudGrantContext,operation:'read'|'write')=>Promise<NextcloudVerifiedConnection>;
/** Must enforce private-IP/DNS rebinding/IPv6/redirect/port egress protections at network layer too. */
export type TrustedEgressPolicy=(origin:string,context:CloudGrantContext)=>Promise<boolean>;
function trustedOrigin(raw:string){
  let u:URL;try{u=new URL(raw);}catch{throw new CloudTransportError('CLOUD_NEXTCLOUD_ORIGIN_INVALID',400);}
  ensure(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&u.pathname==='/'&&
    u.hostname.includes('.')&&!/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname),'CLOUD_NEXTCLOUD_ORIGIN_INVALID');
  return u.origin;
}
/** Nextcloud authenticated WebDAV. Location.fileId = normalized path such as /Folder/note.txt. */
export class NextcloudTransport implements CloudTransport{
 readonly provider='nextcloud' as const;
 private readonly resolve:NextcloudConnectionResolver; private readonly egress:TrustedEgressPolicy; private readonly request:Fetcher;
 constructor(resolve:NextcloudConnectionResolver,egress:TrustedEgressPolicy,request:Fetcher=fetch){this.resolve=resolve;this.egress=egress;this.request=request;}
 private async url(loc:RemoteLocation,mode:'read'|'write'){
  checkLoc(loc,this.provider);const conn=await this.resolve(loc.context,mode),origin=trustedOrigin(conn.origin);
  if(!(await this.egress(origin,loc.context)))throw new CloudTransportError('CLOUD_NEXTCLOUD_EGRESS_NOT_APPROVED',403);
  ensure(/^[^\/\r\n\0]{1,150}$/.test(conn.davUsername)&&/^Basic [A-Za-z0-9+/=]{8,4096}$/.test(conn.authorization),'CLOUD_NEXTCLOUD_CREDENTIAL_INVALID',403);
  return {url:origin+'/remote.php/dav/files/'+enc(conn.davUsername),auth:conn.authorization};
 }
 async stat(loc:RemoteLocation):Promise<RemoteFile>{
  const {url,auth}=await this.url(loc,'read'),path=boundPath(loc.fileId);
  const res=await this.request(url+path,{method:'PROPFIND',headers:{Authorization:auth,Depth:'0','Content-Type':'application/xml'},body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:displayname/><d:getetag/><d:getcontentlength/><d:getcontenttype/><d:resourcetype/><oc:permissions/></d:prop></d:propfind>',redirect:'error'});
  checkResp(res,'CLOUD_NEXTCLOUD_METADATA_FAILED',[207]);const bytes=await bounded(res,65536);const xml=new TextDecoder().decode(bytes);
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new CloudTransportError('CLOUD_NEXTCLOUD_UNSAFE_XML');
  /* SEC-002 (toetsen/g08.md, afwerking A): attributen en inhoud begrensd ({0,256} / {0,4096}) — anders kostte elke onafgesloten «<getetag » een scan tot het einde (kwadratisch op 64 KB van een vreemde server). */const val=(name:string)=>{const m=xml.match(new RegExp('<(?:[A-Za-z_][\\w.-]{0,64}:)?'+name+'(?:\\s[^>]{0,256})?>([^<]{0,4096})<\\/(?:[A-Za-z_][\\w.-]{0,64}:)?'+name+'>','i'));return m?.[1]||'';};
  const folder=/<(?:[a-z][\w.-]*:)?collection\s*\/?\s*>/i.test(xml);
  const lengthText=val('getcontentlength');
  const size=folder?0:Number(lengthText);
  ensure(folder||lengthText!==''&&Number.isSafeInteger(size)&&size>=0,'CLOUD_NEXTCLOUD_METADATA_INCOMPLETE',502);
  const revision=val('getetag'),name=path==='/'?'/':decodeURIComponent(path.split('/').filter(Boolean).at(-1)||'');
  ensure(name==='/'||validName(name),'CLOUD_NEXTCLOUD_INVALID_FILENAME',502);
  const permissions=val('permissions');
  return {id:loc.fileId,name,size,mime:folder?'inode/directory':val('getcontenttype')||'application/octet-stream',revision,isFolder:folder,canRead:!folder,canWrite:folder&&/[WC]/.test(permissions)};
 }
 async download(loc:RemoteLocation,max:number){const {url,auth}=await this.url(loc,'read'),path=boundPath(loc.fileId);
  const resp=await this.request(url+path,{headers:{Authorization:auth},redirect:'error'});checkResp(resp,'CLOUD_NEXTCLOUD_DOWNLOAD_FAILED',[200]);return bounded(resp,max);
 }
 async upload(loc:RemoteLocation,name:string,bytes:Uint8Array,mime:string):Promise<RemoteUpload>{
  ensure(validName(name)&&typeof loc.parentId==='string','CLOUD_NEXTCLOUD_UPLOAD_INVALID');
  const {url,auth}=await this.url(loc,'write'),parent=boundPath(loc.parentId,true);
  const target=url+(parent==='/'?'/':parent)+enc(name);
  const res=await this.request(target,{method:'PUT',headers:{Authorization:auth,'Content-Type':mime||'application/octet-stream','If-None-Match':'*'},body:Buffer.from(bytes),redirect:'error'});
  checkResp(res,'CLOUD_NEXTCLOUD_UPLOAD_FAILED',[201,204]);
  const fileId=(parent==='/'?'/':parent)+name;return {id:fileId,size:bytes.byteLength,revision:res.headers.get('etag')||''};
 }
}
/** BOX v2 files and folders; folders use folder:<id> references; root=folder:0. */
export class BoxTransport implements CloudTransport{
 readonly provider='box' as const;
 private readonly token:CloudTokenResolver; private readonly request:Fetcher;
 constructor(token:CloudTokenResolver,request:Fetcher=fetch){this.token=token;this.request=request;}
 private async auth(loc:RemoteLocation,scope:'read'|'write'){
  checkLoc(loc,this.provider);const t=await this.token(loc.context,scope);ensure(typeof t==='string'&&t.length>4&&t.length<8192&&!/[\r\n\0]/.test(t),'CLOUD_BOX_GRANT_MISSING',403);return {Authorization:'Bearer '+t};
 }
 private id(loc:RemoteLocation){ensure(/^(?:[0-9]{1,30}|folder:[0-9]{1,30})$/.test(loc.fileId),'CLOUD_BOX_FILE_ID_INVALID');return loc.fileId;}
 async stat(loc:RemoteLocation):Promise<RemoteFile>{
  const id=this.id(loc),folder=id.startsWith('folder:'),plain=folder?id.slice(7):id;
  const endpoint='https://api.box.com/2.0/'+(folder?'folders/':'files/')+plain+'?fields=id,name,size,etag,permissions,type';
  const res=await this.request(endpoint,{headers:await this.auth(loc,'read'),redirect:'error'});checkResp(res,'CLOUD_BOX_METADATA_FAILED',[200]);
  const x=await res.json() as {id?:string;name?:string;size?:number;etag?:string;type?:string;permissions?:{can_download?:boolean;can_upload?:boolean;can_delete?:boolean}};
  ensure(x.id===plain&&typeof x.name==='string'&&Number.isSafeInteger(x.size??0),'CLOUD_BOX_METADATA_INVALID',502);
  return {id,name:x.name!,size:x.size||0,mime:folder?'inode/directory':'application/octet-stream',revision:x.etag||'',isFolder:folder,canRead:!folder&&x.permissions?.can_download===true,canWrite:folder&&x.permissions?.can_upload===true};
 }
 async download(loc:RemoteLocation,max:number){const id=this.id(loc);ensure(!id.startsWith('folder:'),'CLOUD_BOX_FOLDER_NOT_FILE');
  const res=await this.request('https://api.box.com/2.0/files/'+id+'/content',{headers:await this.auth(loc,'read'),redirect:'manual'});
  // Box returns temporary downloads through a documented CDN. Only dl.boxcloud.com
  // is accepted; bearer authorization MUST NOT follow the redirect.
  if(res.status===302){
   const target=res.headers.get('location')||'';let uri:URL;
   try{uri=new URL(target);}catch{throw new CloudTransportError('CLOUD_BOX_CDN_REDIRECT_REJECTED',409);}
   if(uri.protocol!=='https:'||uri.hostname!=='dl.boxcloud.com'||uri.port||uri.username||uri.password)
      throw new CloudTransportError('CLOUD_BOX_CDN_REDIRECT_REJECTED',409);
   const redirected=await this.request(uri.toString(),{redirect:'error'});
   checkResp(redirected,'CLOUD_BOX_CDN_DOWNLOAD_FAILED',[200]);return bounded(redirected,max);
  }
  checkResp(res,'CLOUD_BOX_DOWNLOAD_FAILED',[200]);return bounded(res,max);
 }
 async upload(loc:RemoteLocation,name:string,data:Uint8Array,mime:string):Promise<RemoteUpload>{
  ensure(validName(name)&&typeof loc.parentId==='string','CLOUD_BOX_TARGET_INVALID');const id=loc.parentId;
  ensure(/^(folder:)?[0-9]{1,30}$/.test(id),'CLOUD_BOX_FOLDER_ID_INVALID');
  const folder=id.startsWith('folder:')?id.slice(7):id;
  const form=new FormData();form.append('attributes',JSON.stringify({name,parent:{id:folder}}));form.append('file',new Blob([new Uint8Array(data)],{type:mime||'application/octet-stream'}),name);
  const res=await this.request('https://upload.box.com/api/2.0/files/content',{method:'POST',headers:await this.auth(loc,'write'),body:form,redirect:'error'});
  checkResp(res,'CLOUD_BOX_UPLOAD_FAILED',[201]);const response=await res.json() as {entries?:Array<{id?:string;size?:number;etag?:string}>};const file=response.entries?.[0];
  ensure(file&&/^[0-9]{1,30}$/.test(file.id||'')&&file.size===data.length,'CLOUD_BOX_UPLOAD_UNVERIFIED',502);
  return {id:file.id!,size:file.size!,revision:file.etag||''};
 }
}
export type S3VerifiedConnection={bucket:string;region:string;prefix:string;accessKeyId:string;secretAccessKey:string;sessionToken?:string};
export type S3ConnectionResolver=(context:CloudGrantContext,operation:'read'|'write')=>Promise<S3VerifiedConnection>;
const SHA=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const hmac=(key:Buffer|string,data:string)=>createHmac('sha256',key).update(data).digest();
const s3encode=(key:string)=>key.split('/').map(enc).join('/');
/** AWS S3, SigV4, AWS-controlled endpoints only; no user-supplied S3-compatible host. */
export class S3Transport implements CloudTransport{
 readonly provider='s3' as const;
 private readonly resolve:S3ConnectionResolver; private readonly request:Fetcher; private readonly clock:()=>Date;
 constructor(resolve:S3ConnectionResolver,request:Fetcher=fetch,clock:()=>Date=()=>new Date()){this.resolve=resolve;this.request=request;this.clock=clock;}
 private async cfg(loc:RemoteLocation,scope:'read'|'write'){
  checkLoc(loc,'s3');const x=await this.resolve(loc.context,scope);
  ensure(/^(?!.*\.\.)(?!\d+\.\d+\.\d+\.\d+$)[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(x.bucket)&&
   /^[a-z]{2}(?:-[a-z]+)+-\d$/.test(x.region)&&/^[A-Z0-9]{12,40}$/.test(x.accessKeyId)&&
   typeof x.secretAccessKey==='string'&&x.secretAccessKey.length>=20,'CLOUD_S3_ACCOUNT_CONFIG_INVALID',403);
  ensure(x.prefix===''||(!x.prefix.startsWith('/')&&x.prefix.endsWith('/')&&!x.prefix.includes('..')&&!/[?#\\\0\r\n]/.test(x.prefix)),'CLOUD_S3_PREFIX_INVALID',403);
  return x;
 }
 private key(cfg:S3VerifiedConnection,fileId:string){
  ensure(typeof fileId==='string'&&!fileId.startsWith('/')&&!fileId.includes('..')&&!/[?#\\\0\r\n]/.test(fileId),'CLOUD_S3_KEY_INVALID');
  return cfg.prefix+(fileId==='root'?'':fileId);
 }
 private async call(loc:RemoteLocation,method:'HEAD'|'GET'|'PUT',fileId:string,scope:'read'|'write',bytes?:Uint8Array,mime?:string){
  const c=await this.cfg(loc,scope),key=this.key(c,fileId);ensure(key.length>0,'CLOUD_S3_OBJECT_KEY_REQUIRED');
  const host=`${c.bucket}.s3.${c.region}.amazonaws.com`,uri='/'+s3encode(key);
  const date=this.clock().toISOString().replace(/[-:]|\.\d{3}/g,''),day=date.slice(0,8),bodyhash=SHA(bytes||new Uint8Array());
  const headers:Record<string,string>={'host':host,'x-amz-date':date,'x-amz-content-sha256':method==='PUT'?bodyhash:SHA('')};
  if(c.sessionToken)headers['x-amz-security-token']=c.sessionToken;
  if(method==='PUT'){headers['content-type']=mime||'application/octet-stream';headers['if-none-match']='*';}
  const keys=Object.keys(headers).sort(),canon=keys.map(k=>k+':'+headers[k].trim()+'\n').join(''),signed=keys.join(';');
  const canonical=[method,uri,'',canon,signed,headers['x-amz-content-sha256']].join('\n');
  const scopeString=`${day}/${c.region}/s3/aws4_request`,stringToSign=`AWS4-HMAC-SHA256\n${date}\n${scopeString}\n${SHA(canonical)}`;
  const sign=hmac(hmac(hmac(hmac('AWS4'+c.secretAccessKey,day),c.region),'s3'),'aws4_request');
  headers['authorization']=`AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scopeString}, SignedHeaders=${signed}, Signature=${createHmac('sha256',sign).update(stringToSign).digest('hex')}`;
  const res=await this.request(`https://${host}${uri}`,{method,headers,body:bytes?Buffer.from(bytes):undefined,redirect:'error'});
  checkResp(res,'CLOUD_S3_REQUEST_FAILED',method==='PUT'?[200,201]:[200]);return res;
 }
 async stat(loc:RemoteLocation):Promise<RemoteFile>{
  const cfg=await this.cfg(loc,'read');if(loc.fileId==='root'||loc.fileId.endsWith('/'))return{id:loc.fileId,name:'/',size:0,mime:'inode/directory',revision:'',isFolder:true,canRead:false,canWrite:true};
  const resp=await this.call(loc,'HEAD',loc.fileId,'read'),size=Number(resp.headers.get('content-length'));
  ensure(Number.isSafeInteger(size)&&size>=0,'CLOUD_S3_SIZE_INVALID',502);
  return {id:loc.fileId,name:loc.fileId.split('/').at(-1)||'',size,mime:resp.headers.get('content-type')||'application/octet-stream',revision:resp.headers.get('etag')||'',isFolder:false,canRead:true,canWrite:false};
 }
 async download(loc:RemoteLocation,max:number){return bounded(await this.call(loc,'GET',loc.fileId,'read'),max);}
 async upload(loc:RemoteLocation,name:string,bytes:Uint8Array,mime:string):Promise<RemoteUpload>{
  ensure(validName(name)&&typeof loc.parentId==='string','CLOUD_S3_TARGET_INVALID');const prefix=loc.parentId==='root'?'':loc.parentId;
  ensure(prefix===''||prefix.endsWith('/'),'CLOUD_S3_FOLDER_INVALID');
  const id=prefix+name;const res=await this.call(loc,'PUT',id,'write',bytes,mime);
  return{id,size:bytes.byteLength,revision:res.headers.get('etag')||''};
 }
}
