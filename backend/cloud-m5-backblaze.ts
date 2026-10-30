/** Backblaze B2 S3-compatible transport; server-side per-user application keys only.
 * This is an AWS SigV4 S3-compatible SUBSET, not generic public S3 endpoint support.
 * B2 does not support per-object ACL or IAM-role features of AWS.
 */
import {createHash,createHmac} from 'node:crypto';
import type {CloudTransport,CloudGrantContext,Fetcher,RemoteLocation,RemoteFile,RemoteUpload} from './cloud-overdracht-adapters';
import {CloudTransportError} from './cloud-overdracht-adapters';
export type B2Connection={bucket:string;region:string;prefix:string;keyId:string;applicationKey:string};
export type B2Credentials=(ctx:CloudGrantContext,operation:'read'|'write')=>Promise<B2Connection>;
function assert(v:unknown,code:string,status=403):asserts v{if(!v)throw new CloudTransportError(code,status);}
const sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const hmac=(key:string|Buffer,msg:string)=>createHmac('sha256',key).update(msg).digest();
const enc=(s:string)=>s.split('/').map(part=>encodeURIComponent(part).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())).join('/');
function checkedPath(v:string,folder=false){assert(typeof v==='string'&&v.length<=1024&&!v.startsWith('/')&&!/[\\\r\n\0?#]/.test(v)&&!v.split('/').includes('..')&&!v.split('/').includes('.'),'CLOUD_B2_INVALID_OBJECT_PATH',400);
 if(folder)assert(!v||v.endsWith('/'),'CLOUD_B2_INVALID_PREFIX',400);return v;}
async function readBounded(r:Response,max:number){
 assert(Number.isSafeInteger(max)&&max>0&&max<=32*1024*1024,'CLOUD_B2_LIMIT',400);
 if(Number(r.headers.get('content-length')||0)>max)throw new CloudTransportError('CLOUD_B2_TOO_LARGE',413);
 if(!r.body)throw new CloudTransportError('CLOUD_B2_EMPTY_RESPONSE');
 const rd=r.body.getReader(),parts:Uint8Array[]=[];let n=0;
 try{for(;;){const s=await rd.read();if(s.done)break;n+=s.value.length;if(n>max)throw new CloudTransportError('CLOUD_B2_TOO_LARGE',413);parts.push(s.value);}}finally{rd.releaseLock();}
 const data=new Uint8Array(n);let offset=0;for(const p of parts){data.set(p,offset);offset+=p.length;}return data;
}
export class BackblazeB2Transport implements CloudTransport{
 readonly provider='backblaze-b2' as const;
 constructor(private readonly credentials:B2Credentials,private readonly request:Fetcher=fetch,private readonly now:()=>Date=()=>new Date()){}
 private async cfg(loc:RemoteLocation,mode:'read'|'write'){
  assert(loc.context.provider==='backblaze-b2'&&!!loc.context.userId&&!!loc.context.accountId,'CLOUD_B2_CONTEXT_INVALID');
  const cfg=await this.credentials(loc.context,mode);
  assert(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(cfg.bucket)&&!cfg.bucket.includes('..')&&!/^\d+\.\d+\.\d+\.\d+$/.test(cfg.bucket), 'CLOUD_B2_BUCKET_INVALID');
  assert(/^[a-z]{2}-[a-z]+-\d{3}$/.test(cfg.region),'CLOUD_B2_REGION_INVALID');
  assert(cfg.keyId.length>=10&&cfg.keyId.length<100&&cfg.applicationKey.length>=15&&!/[\r\n\0]/.test(cfg.keyId+cfg.applicationKey),'CLOUD_B2_KEY_INVALID');
  checkedPath(cfg.prefix,true);return cfg;
 }
 private async call(loc:RemoteLocation,mode:'read'|'write',method:'HEAD'|'GET'|'PUT',key:string,data?:Uint8Array,mime='application/octet-stream'){
  const c=await this.cfg(loc,mode);const suffix=checkedPath(key);
  assert(!!suffix,'CLOUD_B2_KEY_REQUIRED',400);
  const host=`s3.${c.region}.backblazeb2.com`,uri=`/${c.bucket}/${enc(c.prefix+suffix)}`;
  const time=this.now().toISOString().replace(/[-:]|\.\d{3}/g,''),day=time.slice(0,8),hash=sha(data||new Uint8Array());
  const headers:Record<string,string>={host,'x-amz-content-sha256':hash,'x-amz-date':time};
  if(method==='PUT'){headers['content-type']=mime;headers['if-none-match']='*';}
  const names=Object.keys(headers).sort(),canonicalHeaders=names.map(k=>k+':'+headers[k]+'\n').join('');
  const credentialScope=`${day}/${c.region}/s3/aws4_request`;
  const canonical=[method,uri,'',canonicalHeaders,names.join(';'),hash].join('\n');
  const toSign=['AWS4-HMAC-SHA256',time,credentialScope,sha(canonical)].join('\n');
  const signingKey=hmac(hmac(hmac(hmac('AWS4'+c.applicationKey,day),c.region),'s3'),'aws4_request');
  headers.authorization=`AWS4-HMAC-SHA256 Credential=${c.keyId}/${credentialScope}, SignedHeaders=${names.join(';')}, Signature=${createHmac('sha256',signingKey).update(toSign).digest('hex')}`;
  const r=await this.request(`https://${host}${uri}`,{method,headers,redirect:'error',body:data?Buffer.from(data):undefined});
  if(r.status===401||r.status===403)throw new CloudTransportError('CLOUD_B2_PERMISSION_DENIED',403);
  if(r.status===404)throw new CloudTransportError('CLOUD_B2_NOT_FOUND',404);
  if(r.status===409||r.status===412)throw new CloudTransportError('CLOUD_B2_CONFLICT',409);
  if(r.status===429||r.status>=500)throw new CloudTransportError('CLOUD_B2_RETRYABLE',503);
  if(![200,201].includes(r.status))throw new CloudTransportError('CLOUD_B2_REQUEST_FAILED');return r;
 }
 async stat(loc:RemoteLocation):Promise<RemoteFile>{
  const id=checkedPath(loc.fileId);if(id==='root'||id.endsWith('/'))return {id,name:'/',size:0,mime:'inode/directory',revision:'',isFolder:true,canRead:false,canWrite:true};
  const r=await this.call(loc,'read','HEAD',id),size=Number(r.headers.get('content-length'));
  assert(Number.isSafeInteger(size)&&size>=0,'CLOUD_B2_SIZE_INVALID',502);
  return {id,name:id.split('/').at(-1)||'',size,mime:r.headers.get('content-type')||'application/octet-stream',revision:r.headers.get('etag')||'',isFolder:false,canRead:true,canWrite:false};
 }
 async download(loc:RemoteLocation,max:number){return readBounded(await this.call(loc,'read','GET',checkedPath(loc.fileId)),max);}
 async upload(loc:RemoteLocation,name:string,bytes:Uint8Array,mime:string):Promise<RemoteUpload>{
  assert(name.length>0&&name.length<200&&name!=='.'&&name!=='..'&&!/[\\/\r\n\0]/.test(name),'CLOUD_B2_FILENAME_INVALID',400);
  const folder=loc.parentId==='root'?'':checkedPath(loc.parentId||'',true);
  const key=folder+name,r=await this.call(loc,'write','PUT',key,bytes,mime);
  return {id:key,size:bytes.length,revision:r.headers.get('etag')||''};
 }
}
