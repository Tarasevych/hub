/** M9 STAGING ONLY: provider-native Nextcloud WebDAV and S3/B2 directory listings.
 * User-owned credentials and destinations come only from server-scoped resolvers.
 * The global workspace must still pass M6 policies and the M8 encrypted cursor gate.
 */
import {createHash,createHmac} from 'node:crypto';
import type {DirectoryListing,DirectoryItem,DirectoryPage} from './cloud-m8-directory';
import type {CloudGrantContext,Fetcher} from './cloud-overdracht-adapters';
import {CloudTransportError} from './cloud-overdracht-adapters';
import type {NextcloudConnectionResolver,TrustedEgressPolicy,S3ConnectionResolver} from './cloud-overdracht-m3-providers';
import type {B2Credentials} from './cloud-m5-backblaze';
import {parseCloudXml,children,childText,type XmlNode} from './cloud-m9-xml';
const DAV='DAV:';
const fail=(code:string,status=502):never=>{throw new CloudTransportError(code,status);};
const check=(condition:unknown,code:string,status=400):asserts condition=>{if(!condition)fail(code,status);};
const encode=(v:string)=>encodeURIComponent(v).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const encodedPath=(p:string)=>p.split('/').map(encode).join('/');
function safeFolder(raw:string):string {
 check(raw==='root'||typeof raw==='string'&&raw.length<=800&&!raw.startsWith('/')&&!/[?#\\\r\n\0]/.test(raw)&&raw.endsWith('/')&&!raw.split('/').filter(Boolean).some(x=>x==='.'||x==='..'||/%(?:2e|2f|5c)/i.test(x)),'CLOUD_M9_FOLDER_INVALID');
 return raw==='root'?'':raw;
}
async function boundedXml(request:Fetcher,url:string,init:RequestInit):Promise<XmlNode>{
 let r:Response;try{r=await request(url,{...init,redirect:'error',signal:AbortSignal.timeout(15_000)});}catch{fail('CLOUD_M9_UPSTREAM_UNAVAILABLE',503);}
 if([401,403].includes(r.status))fail('CLOUD_M9_PERMISSION_DENIED',403);
 if(r.status===404)fail('CLOUD_M9_DIRECTORY_NOT_FOUND',404);
 if(r.status===429||r.status>=500)fail('CLOUD_M9_RETRYABLE',503);
 check(r.status===200||r.status===207,'CLOUD_M9_RESPONSE_STATUS',502);
 const len=r.headers.get('content-length');if(len!==null&&(!/^\d+$/.test(len)||Number(len)>1_048_576))fail('CLOUD_M9_RESPONSE_TOO_LARGE');
 if(!r.body)fail('CLOUD_M9_RESPONSE_MISSING');
 const reader=r.body.getReader(),pieces:Uint8Array[]=[];let size=0;
 try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>1_048_576)fail('CLOUD_M9_RESPONSE_TOO_LARGE');pieces.push(x.value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const part of pieces){bytes.set(part,at);at+=part.byteLength;}
 let xml:string;try{xml=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('CLOUD_M9_INVALID_UTF8');}
 return parseCloudXml(xml);
}
function directoryItem(id:string,name:string,folder:boolean,size:string,revision:string,mime:string):DirectoryItem{
 check(id.length>0&&id.length<=1024&&name.length>0&&name.length<=350&&!/[\r\n\0]/.test(id+name),'CLOUD_M9_ITEM_INVALID',502);
 const n=Number(size);check(folder||/^\d+$/.test(size)&&Number.isSafeInteger(n),'CLOUD_M9_ITEM_SIZE_INVALID',502);
 return {id,name,kind:folder?'folder':'file',size:folder?null:n,revision:revision.slice(0,200),mime:folder?'inode/directory':mime.slice(0,200)||'application/octet-stream'};
}
function cleanUser(s:string){check(/^[^/\r\n\0\\]{1,150}$/.test(s)&&s!=='.'&&s!=='..','CLOUD_M9_DAV_USERNAME_INVALID',403);return encode(s);}
function folderSegments(input:string):string[]{
 if(input==='root')return [];
 check(typeof input==='string'&&input.startsWith('/')&&input.endsWith('/')&&input.length<=800&&!/[?#\\\r\n\0]/.test(input),'CLOUD_M9_DAV_FOLDER_INVALID');
 const xs=input.split('/').filter(Boolean);check(xs.length<=40&&xs.every(x=>x!=='.'&&x!=='..'&&!/%(?:2e|2f|5c)/i.test(x)),'CLOUD_M9_DAV_FOLDER_INVALID');
 return xs;
}
function safeDavOrigin(input:string){
 let u:URL;try{u=new URL(input);}catch{fail('CLOUD_M9_DAV_ORIGIN_INVALID',403);}
 check(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.pathname==='/'&&!u.search&&!u.hash&&u.hostname.includes('.')&&!/^(?:\d+\.){3}\d+$/.test(u.hostname),'CLOUD_M9_DAV_ORIGIN_INVALID',403);
 return u.origin;
}
/** DAV 207 Multi-Status: only 2xx propstat counts, and each href must be within this account's DAV root. */
export class NextcloudDirectory implements DirectoryListing{
 readonly provider='nextcloud';
 constructor(private readonly resolve:NextcloudConnectionResolver,private readonly egress:TrustedEgressPolicy,private readonly request:Fetcher=fetch){}
 async list(ctx:CloudGrantContext,folder:string,cursor:string|null):Promise<DirectoryPage>{
  check(ctx.provider==='nextcloud','CLOUD_M9_PROVIDER_MISMATCH',403);
  check(cursor===null,'CLOUD_M9_DAV_NO_PAGINATION');
  const sections=folderSegments(folder),conn=await this.resolve(ctx,'read'),origin=safeDavOrigin(conn.origin);
  check(await this.egress(origin,ctx),'CLOUD_M9_EGRESS_REJECTED',403);
  check(/^Basic [A-Za-z0-9+/=]{8,4096}$/.test(conn.authorization),'CLOUD_M9_DAV_AUTH_INVALID',403);
  const base=`/remote.php/dav/files/${cleanUser(conn.davUsername)}/`;
  const path=base+sections.map(encode).join('/')+(sections.length?'/':'');
  const doc=await boundedXml(this.request,origin+path,{method:'PROPFIND',headers:{Authorization:conn.authorization,Depth:'1','Content-Type':'application/xml; charset=utf-8'},body:'<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getcontentlength/><d:getcontenttype/><d:displayname/></d:prop></d:propfind>'});
  check(doc.local==='multistatus'&&doc.ns===DAV,'CLOUD_M9_DAV_ROOT_INVALID',502);
  const responses=children(doc,'response',DAV);check(responses.length<=102,'CLOUD_M9_DAV_UNBOUNDED',502);
  const files:DirectoryItem[]=[];let parentFound=false;
  for(const node of responses){
   const href=childText(node,'href',DAV);let uri:URL;try{uri=new URL(href,origin);}catch{fail('CLOUD_M9_DAV_HREF_INVALID');}
   check(uri.origin===origin&&!uri.username&&!uri.password&&!uri.search&&!uri.hash&&uri.pathname.startsWith(base),'CLOUD_M9_DAV_HREF_UNTRUSTED',502);
   const relative=uri.pathname.slice(base.length);check(!/%(?:2f|5c|00|2e)/i.test(relative),'CLOUD_M9_DAV_ENCODED_PATH_INVALID',502);
   let names:string[];try{names=relative.split('/').filter(Boolean).map(decodeURIComponent);}catch{fail('CLOUD_M9_DAV_HREF_ENCODING',502);}
   check(names.every(x=>x!=='.'&&x!=='..'&&!/[\\/\0]/.test(x)),'CLOUD_M9_DAV_TRAVERSAL',502);
   // Only direct children, not recursively enumerated siblings/other users.
   check(names.length===sections.length||names.length===sections.length+1,'CLOUD_M9_DAV_DEPTH_VIOLATION',502);
   check(sections.every((x,i)=>x===names[i]),'CLOUD_M9_DAV_CROSS_FOLDER_RESPONSE',502);
   if(names.length===sections.length){parentFound=true;continue;}
   const properties=children(node,'propstat',DAV).filter(p=>/\b2\d\d\b/.test(childText(p,'status',DAV)));
   check(properties.length===1,'CLOUD_M9_DAV_PROPSTAT_INVALID',502);
   const prop=children(properties[0],'prop',DAV)[0];check(!!prop,'CLOUD_M9_DAV_PROP_MISSING',502);
   const rt=children(prop,'resourcetype',DAV)[0];const isFolder=!!rt&&children(rt,'collection',DAV).length>0;
   const length=childText(prop,'getcontentlength',DAV);
   files.push(directoryItem('/'+names.join('/')+(isFolder?'/':''),names.at(-1)!,isFolder,length,childText(prop,'getetag',DAV),childText(prop,'getcontenttype',DAV)));
  }
  check(parentFound,'CLOUD_M9_DAV_MISSING_PARENT',502);
  check(files.length<=100,'CLOUD_M9_DAV_TOO_MANY_CHILDREN',502);
  return {items:files,nextCursor:null};
 }
}
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const hmac=(key:string|Buffer,s:string)=>createHmac('sha256',key).update(s).digest();
function s3SignedGet(options:{host:string;region:string;keyId:string;secret:string;sessionToken?:string;bucketPath:string;query:Record<string,string>;now:Date}){
 const {host,region,keyId,secret,sessionToken,bucketPath,query,now}=options;
 const date=now.toISOString().replace(/[-:]|\.\d{3}/g,''),day=date.slice(0,8);
 const qs=Object.entries(query).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${encode(k)}=${encode(v)}`).join('&');
 const headers:Record<string,string>={'host':host,'x-amz-content-sha256':hash(''),'x-amz-date':date};
 if(sessionToken)headers['x-amz-security-token']=sessionToken;
 const signed=Object.keys(headers).sort(),canon=signed.map(k=>`${k}:${headers[k].trim()}\n`).join('');
 const scope=`${day}/${region}/s3/aws4_request`,canonical=['GET',bucketPath,qs,canon,signed.join(';'),hash('')].join('\n');
 const stringToSign=['AWS4-HMAC-SHA256',date,scope,hash(canonical)].join('\n');
 const key=hmac(hmac(hmac(hmac('AWS4'+secret,day),region),'s3'),'aws4_request');
 headers.authorization=`AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${createHmac('sha256',key).update(stringToSign).digest('hex')}`;
 return {url:`https://${host}${bucketPath}?${qs}`,headers};
}
function safeS3Prefix(folder:string,allowed:string){
 const relative=safeFolder(folder);
 check(allowed===''||!allowed.startsWith('/')&&allowed.endsWith('/')&&!/[?#\\\r\n\0]/.test(allowed)&&!allowed.split('/').includes('..'),'CLOUD_M9_S3_PREFIX_INVALID',403);
 return allowed+relative;
}
function strictPercent(value:string){try{const decoded=decodeURIComponent(value);check(!/[\u0000-\u001f]/.test(decoded),'CLOUD_M9_S3_KEY_INVALID',502);return decoded;}catch{fail('CLOUD_M9_S3_KEY_INVALID');}}
function s3Results(xml:XmlNode,prefix:string):DirectoryPage{
 check(xml.local==='ListBucketResult'&&(!xml.ns||xml.ns==='http://s3.amazonaws.com/doc/2006-03-01/'),'CLOUD_M9_S3_XML_ROOT',502);
 check(childText(xml,'EncodingType')==='url','CLOUD_M9_S3_ENCODING_REQUIRED',502);
 check(strictPercent(childText(xml,'Prefix'))===prefix, 'CLOUD_M9_S3_PREFIX_CHANGED',502);
 const folders=children(xml,'CommonPrefixes'),objects=children(xml,'Contents');
 check(folders.length+objects.length<=100,'CLOUD_M9_S3_PAGE_LIMIT',502);
 const items:DirectoryItem[]=[];
 for(const f of folders){const key=strictPercent(childText(f,'Prefix'));check(key.startsWith(prefix)&&key!==prefix&&key.endsWith('/'),'CLOUD_M9_S3_CHILD_PREFIX_INVALID',502);
  const rest=key.slice(prefix.length).replace(/\/$/,'');check(rest.length>0&&!rest.includes('/'),'CLOUD_M9_S3_DEPTH_VIOLATION',502);
  items.push(directoryItem(key,rest,true,'', '', ''));}
 for(const f of objects){const key=strictPercent(childText(f,'Key'));check(key.startsWith(prefix),'CLOUD_M9_S3_CROSS_PREFIX',502);
  const rest=key.slice(prefix.length);if(rest===''&&key.endsWith('/'))continue;
  check(rest.length>0&&!rest.includes('/'),'CLOUD_M9_S3_DEPTH_VIOLATION',502);
  items.push(directoryItem(key,rest,false,childText(f,'Size'),childText(f,'ETag'),'application/octet-stream'));}
 const truncated=childText(xml,'IsTruncated');check(truncated==='true'||truncated==='false','CLOUD_M9_S3_TRUNCATION_INVALID',502);
 const next=childText(xml,'NextContinuationToken');check(truncated==='true'?!(!next||next.length>2048):!next,'CLOUD_M9_S3_CONTINUATION_INVALID',502);
 return {items,nextCursor:next||null};
}
/** S3 and Backblaze B2 share the listing protocol, not their account permissions or endpoints. */
export class S3CompatibleDirectory implements DirectoryListing{
 readonly provider:'s3'|'backblaze-b2';
 constructor(provider:'s3'|'backblaze-b2',private readonly resolveS3:S3ConnectionResolver|undefined,private readonly resolveB2:B2Credentials|undefined,private readonly request:Fetcher=fetch,private readonly now:()=>Date=()=>new Date()){
  this.provider=provider;
 }
 async list(ctx:CloudGrantContext,folder:string,rawCursor:string|null):Promise<DirectoryPage>{
  check(ctx.provider===this.provider,'CLOUD_M9_PROVIDER_MISMATCH',403);
  let host:string,region:string,bucketPath:string,prefix:string,keyId:string,secret:string,sessionToken:string|undefined;
  if(this.provider==='s3'){
   check(!!this.resolveS3,'CLOUD_M9_CREDENTIAL_RESOLVER_MISSING',503);
   const c=await this.resolveS3(ctx,'read');
   check(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(c.bucket)&&/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(c.region)&&/^[A-Z0-9]{12,40}$/.test(c.accessKeyId)&&c.secretAccessKey.length>=20,'CLOUD_M9_S3_CREDENTIAL_INVALID',403);
   region=c.region;host=`${c.bucket}.s3.${region}.amazonaws.com`;bucketPath='/';prefix=safeS3Prefix(folder,c.prefix);keyId=c.accessKeyId;secret=c.secretAccessKey;sessionToken=c.sessionToken;
  }else{
   check(!!this.resolveB2,'CLOUD_M9_CREDENTIAL_RESOLVER_MISSING',503);
   const c=await this.resolveB2(ctx,'read');
   check(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(c.bucket)&&!c.bucket.includes('..')&&/^[a-z]{2}-[a-z]+-\d{3}$/.test(c.region)&&c.keyId.length>=10&&c.applicationKey.length>=15,'CLOUD_M9_B2_CREDENTIAL_INVALID',403);
   region=c.region;host=`s3.${region}.backblazeb2.com`;bucketPath='/'+encode(c.bucket);prefix=safeS3Prefix(folder,c.prefix);keyId=c.keyId;secret=c.applicationKey;
  }
  check(rawCursor===null||typeof rawCursor==='string'&&rawCursor.length>0&&rawCursor.length<=2048&&!/[\r\n\0]/.test(rawCursor),'CLOUD_M9_CONTINUATION_INVALID');
  const query:Record<string,string>={'list-type':'2','delimiter':'/','max-keys':'100','encoding-type':'url','prefix':prefix};if(rawCursor)query['continuation-token']=rawCursor;
  const signed=s3SignedGet({host,region,keyId,secret,sessionToken,bucketPath,query,now:this.now()});
  const xml=await boundedXml(this.request,signed.url,{method:'GET',headers:signed.headers});
  return s3Results(xml,prefix);
 }
}
