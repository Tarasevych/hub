/** GitHub repository-file transport: NOT a traditional cloud-drive adapter.
 * Read/update are repo-commit operations. Only new file creation is implemented;
 * existing paths conflict. Owner/repo/branch are resolved server-side per grant.
 * Git LFS, binary files > 1 MiB and MOVE are deliberately unsupported here.
 */
import type {CloudTransport,CloudTokenResolver,CloudGrantContext,Fetcher,RemoteLocation,RemoteFile,RemoteUpload} from './cloud-overdracht-adapters';
import {CloudTransportError} from './cloud-overdracht-adapters';
export type GithubRepoScope={owner:string;repo:string;branch:string};
export type GithubRepoResolver=(ctx:CloudGrantContext)=>Promise<GithubRepoScope>;
function safeSegment(v:string){return /^[a-zA-Z0-9_.-]{1,100}$/.test(v)&&v!=='.'&&v!=='..';}
function safePath(path:string){
 if(!path||path.length>500||path.startsWith('/')||path.endsWith('/')||/[\\?#\r\n\0]/.test(path)||path.split('/').length>30||!path.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!/%2e|%2f|%5c/i.test(s)))throw new CloudTransportError('CLOUD_GITHUB_PATH_INVALID',400);
 return path.split('/').map(encodeURIComponent).join('/');
}
async function checked(r:Response){if(r.status===401||r.status===403)throw new CloudTransportError('CLOUD_GITHUB_PERMISSION_DENIED',403);
 if(r.status===404)throw new CloudTransportError('CLOUD_GITHUB_NOT_FOUND',404);
 if(r.status===409||r.status===422)throw new CloudTransportError('CLOUD_GITHUB_WRITE_CONFLICT',409);
 if(!r.ok)throw new CloudTransportError('CLOUD_GITHUB_UPSTREAM_ERROR',r.status>=500?503:502);return r;}
export class GithubRepoTransport implements CloudTransport{
 readonly provider='github' as const;
 constructor(private readonly token:CloudTokenResolver,private readonly scope:GithubRepoResolver,private readonly request:Fetcher=fetch){}
 private async base(loc:RemoteLocation,mode:'read'|'write'){
  if(loc.context.provider!==this.provider||!loc.context.accountId||!loc.context.userId)throw new CloudTransportError('CLOUD_GITHUB_CONTEXT_INVALID',403);
  const r=await this.scope(loc.context);
  if(!safeSegment(r.owner)||!safeSegment(r.repo)||!/^[a-zA-Z0-9_./-]{1,160}$/.test(r.branch)||r.branch.includes('..'))throw new CloudTransportError('CLOUD_GITHUB_REPO_SCOPE_INVALID',403);
  const t=await this.token(loc.context,mode);if(!t||t.length>8192||/[\r\n\0]/.test(t))throw new CloudTransportError('CLOUD_GITHUB_GRANT_MISSING',403);
  return {base:`https://api.github.com/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}/contents/`,branch:r.branch,headers:{'Authorization':'Bearer '+t,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}};
 }
 async stat(loc:RemoteLocation):Promise<RemoteFile>{
  const path=safePath(loc.fileId),a=await this.base(loc,'read');const u=a.base+path+'?ref='+encodeURIComponent(a.branch);
  const resp=await checked(await this.request(u,{headers:a.headers,redirect:'error'}));
  const v=await resp.json() as {type?:string;sha?:string;size?:number;name?:string;path?:string};
  if(v.type!=='file'||!Number.isSafeInteger(v.size)||v.size!<0||!v.sha||v.path!==loc.fileId)throw new CloudTransportError('CLOUD_GITHUB_METADATA_INVALID');
  return {id:loc.fileId,name:v.name||loc.fileId.split('/').at(-1)!,size:v.size!,mime:'application/octet-stream',revision:v.sha,isFolder:false,canRead:true,canWrite:false};
 }
 async download(loc:RemoteLocation,maxBytes:number){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1024*1024)throw new CloudTransportError('CLOUD_GITHUB_READ_LIMIT_INVALID',400);
  const path=safePath(loc.fileId),a=await this.base(loc,'read');const r=await checked(await this.request(a.base+path+'?ref='+encodeURIComponent(a.branch),{headers:a.headers,redirect:'error'}));
  const v=await r.json() as {type?:string;encoding?:string;content?:string;size?:number};
  if(v.type!=='file'||v.encoding!=='base64'||typeof v.content!=='string'||!Number.isSafeInteger(v.size)||v.size!>maxBytes)
   throw new CloudTransportError('CLOUD_GITHUB_NOT_INLINE_OR_TOO_LARGE',413);
  // Lineaire base64-controle (zelfde geaccepteerde verzameling): een groep-herhaling (?:…{4})* overloopt de V8-stack op grote bestanden.
  const encoded=v.content.replace(/\s/g,'');if(encoded.length%4!==0||!/^[a-zA-Z0-9+/]*={0,2}$/.test(encoded))throw new CloudTransportError('CLOUD_GITHUB_BASE64_INVALID');
  const bytes=Buffer.from(encoded,'base64');if(bytes.byteLength!==v.size)throw new CloudTransportError('CLOUD_GITHUB_SIZE_MISMATCH');return new Uint8Array(bytes);
 }
 async upload(loc:RemoteLocation,name:string,bytes:Uint8Array,_mime:string):Promise<RemoteUpload>{
  const a=await this.base(loc,'write');if(bytes.length>1024*1024||bytes.length===0)throw new CloudTransportError('CLOUD_GITHUB_UPLOAD_LIMIT',413);
  if(!safeSegment(name)||name==='.'||name==='..')throw new CloudTransportError('CLOUD_GITHUB_FILENAME_INVALID',400);
  const dir=loc.parentId||'';
  if(dir) safePath(dir); const path=(dir?dir.replace(/\/$/,'')+'/':'')+name;
  const resp=await checked(await this.request(a.base+safePath(path),{method:'PUT',headers:{...a.headers,'Content-Type':'application/json'},redirect:'error',body:JSON.stringify({message:'Add '+name+' via Mijn Ruimte',content:Buffer.from(bytes).toString('base64'),branch:a.branch})}));
  if(resp.status!==201)throw new CloudTransportError('CLOUD_GITHUB_CREATE_NOT_CONFIRMED');
  const v=await resp.json() as {content?:{path?:string;sha?:string;size?:number}};
  if(v.content?.path!==path||!v.content.sha||v.content.size!==bytes.length)throw new CloudTransportError('CLOUD_GITHUB_CREATE_RESULT_INVALID');
  return {id:path,size:bytes.length,revision:v.content.sha};
 }
}
