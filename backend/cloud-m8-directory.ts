/** Cloud M8: provider-native directory browsing behind a single account-scoped contract.
 * STAGING ONLY. Never accepts an arbitrary URL, bearer token or provider-origin from a client.
 * The adapter is not evidence of live readiness; deployment requires separate provider E2E.
 */
import type {CloudGrantContext,CloudTokenResolver,Fetcher} from './cloud-overdracht-adapters';
import {CloudTransportError} from './cloud-overdracht-adapters';

export type DirectoryItem={id:string;name:string;kind:'file'|'folder';size:number|null;revision:string;mime:string};
export type DirectoryPage={items:DirectoryItem[];nextCursor:string|null};
export type DirectoryListing={provider:string;list:(ctx:CloudGrantContext,folder:string,cursor:string|null)=>Promise<DirectoryPage>};
export type GraphDriveResolver=(ctx:CloudGrantContext)=>Promise<string>;
export type GithubScopeResolver=(ctx:CloudGrantContext)=>Promise<{owner:string;repo:string;branch:string}>;
export type PCloudRegionResolver=(ctx:CloudGrantContext)=>Promise<'api.pcloud.com'|'eapi.pcloud.com'>;

const maxResults=100;
function ensure(ok:unknown,code:string,status=400):asserts ok{if(!ok)throw new CloudTransportError(code,status);}
function segment(s:string,max=400){ensure(typeof s==='string'&&s.length>0&&s.length<=max&&!/[\r\n\0\\?#]/.test(s),'CLOUD_M8_INVALID_REFERENCE');return s;}
function cursor(s:string|null){if(s===null)return null;ensure(typeof s==='string'&&s.length>0&&s.length<=2048&&!/[\r\n\0]/.test(s),'CLOUD_M8_INVALID_CURSOR');return s;}
function name(s:unknown):s is string{return typeof s==='string'&&s.length>0&&s.length<=350&&!/[\r\n\0]/.test(s);}
function size(s:unknown):number|null{if(s===null||s===undefined)return null;const n=Number(s);return Number.isSafeInteger(n)&&n>=0?n:null;}
function dataItem(id:unknown,n:unknown,isFolder:boolean,length:unknown,rev:unknown,mime:unknown):DirectoryItem{
 ensure(typeof id==='string'&&id.length>0&&id.length<=1024&&name(n),'CLOUD_M8_INVALID_ITEM',502);
 return{id,name:n,kind:isFolder?'folder':'file',size:isFolder?null:size(length),revision:typeof rev==='string'?rev.slice(0,200):'',mime:typeof mime==='string'&&mime.length<=200?mime:isFolder?'inode/directory':'application/octet-stream'};
}
async function boundedText(response:Response):Promise<string>{
 const cap=1<<20;
 const claimed=response.headers.get('content-length');if(claimed&&Number(claimed)>cap)throw new CloudTransportError('CLOUD_M8_RESPONSE_TOO_LARGE',502);
 ensure(!!response.body,'CLOUD_M8_RESPONSE_EMPTY',502);
 const reader=response.body!.getReader(),parts:Uint8Array[]=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
  if(total>cap)throw new CloudTransportError('CLOUD_M8_RESPONSE_TOO_LARGE',502);parts.push(value);}}
 finally{reader.releaseLock();}
 const out=new Uint8Array(total);let at=0;for(const p of parts){out.set(p,at);at+=p.byteLength;}
 return new TextDecoder('utf-8',{fatal:true}).decode(out);
}
async function getJson(request:Fetcher,url:string,token:string,init:RequestInit={}):Promise<Record<string,any>>{
 ensure(/^https:\/\//.test(url)&&typeof token==='string'&&token.length>0&&token.length<8192&&!/[\r\n\0]/.test(token),'CLOUD_M8_INVALID_REQUEST',403);
 let response:Response;
 try{response=await request(url,{...init,headers:{...(init.headers as Record<string,string>||{}),Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});}
 catch{throw new CloudTransportError('CLOUD_M8_PROVIDER_UNAVAILABLE',503);}
 if(response.status===401||response.status===403)throw new CloudTransportError('CLOUD_M8_PROVIDER_PERMISSION_DENIED',403);
 if(response.status===404)throw new CloudTransportError('CLOUD_M8_FOLDER_NOT_FOUND',404);
 if(response.status===429||response.status>=500)throw new CloudTransportError('CLOUD_M8_PROVIDER_RETRYABLE',503);
 ensure(response.status===200,'CLOUD_M8_PROVIDER_ERROR',502);
 ensure(Number(response.headers.get('content-length')||0)<=(1<<20),'CLOUD_M8_RESPONSE_TOO_LARGE',502);
 let body:string;try{body=await boundedText(response);}catch(e){if(e instanceof CloudTransportError)throw e;throw new CloudTransportError('CLOUD_M8_RESPONSE_UNREADABLE',502);}
 ensure(body.length<=1<<20,'CLOUD_M8_RESPONSE_TOO_LARGE',502);
 try{const o=JSON.parse(body);ensure(o&&typeof o==='object'&&!Array.isArray(o),'CLOUD_M8_RESPONSE_INVALID',502);return o;}
 catch(e){if(e instanceof CloudTransportError)throw e;throw new CloudTransportError('CLOUD_M8_RESPONSE_INVALID',502);}
}
async function getArray(request:Fetcher,url:string,token:string,extra:Record<string,string>):Promise<Record<string,any>[]> {
 ensure(/^https:\/\/api\.github\.com\//.test(url)&&!!token&&!/[\r\n\0]/.test(token),'CLOUD_M8_INVALID_GITHUB_REQUEST',403);
 const r=await request(url,{headers:{...extra,Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
 if(r.status===401||r.status===403)throw new CloudTransportError('CLOUD_M8_PROVIDER_PERMISSION_DENIED',403);
 if(r.status===404)throw new CloudTransportError('CLOUD_M8_FOLDER_NOT_FOUND',404);
 if(r.status===429||r.status>=500)throw new CloudTransportError('CLOUD_M8_PROVIDER_RETRYABLE',503);
 ensure(r.status===200,'CLOUD_M8_GITHUB_LIST_FAILED',502);
 ensure(Number(r.headers.get('content-length')||0)<=1<<20,'CLOUD_M8_RESPONSE_TOO_LARGE',502);
 const body=await boundedText(r);ensure(body.length<=1<<20,'CLOUD_M8_RESPONSE_TOO_LARGE',502);
 let payload:unknown;try{payload=JSON.parse(body);}catch{throw new CloudTransportError('CLOUD_M8_RESPONSE_INVALID',502);}
 return entries(payload);
}
function entries(xs:unknown):Record<string,any>[]{ensure(Array.isArray(xs)&&xs.length<=1000,'CLOUD_M8_ITEMS_INVALID',502);return xs.filter(x=>x&&typeof x==='object'&&!Array.isArray(x));}
function finish(items:DirectoryItem[],next:string|null):DirectoryPage{ensure(items.length<=maxResults,'CLOUD_M8_UNBOUNDED_PAGE',502);return{items,nextCursor:next};}
const enc=(s:string)=>encodeURIComponent(s);
const gql=(s:string)=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

export class GoogleDriveDirectory implements DirectoryListing{
 readonly provider='google-drive';
 constructor(private readonly token:CloudTokenResolver,private readonly request:Fetcher=fetch){}
 async list(ctx:CloudGrantContext,folder:string,rawCursor:string|null):Promise<DirectoryPage>{
  ensure(ctx.provider===this.provider,'CLOUD_M8_PROVIDER_MISMATCH',403);segment(folder);ensure(!folder.includes('://')&&!folder.includes('/'),'CLOUD_M8_INVALID_REFERENCE',400);const next=cursor(rawCursor);
  const u=new URL('https://www.googleapis.com/drive/v3/files');u.searchParams.set('q',`'${gql(folder)}' in parents and trashed = false`);
  u.searchParams.set('fields','nextPageToken,files(id,name,mimeType,size,version,capabilities(canDownload,canAddChildren))');
  u.searchParams.set('pageSize',String(maxResults));u.searchParams.set('supportsAllDrives','true');u.searchParams.set('includeItemsFromAllDrives','true');
  if(next)u.searchParams.set('pageToken',next);
  const x=await getJson(this.request,u.toString(),await this.token(ctx,'read'));
  const items=entries(x.files).map(f=>dataItem(f.id,f.name,f.mimeType==='application/vnd.google-apps.folder',f.size,String(f.version||''),f.mimeType));
  return finish(items,x.nextPageToken?segment(x.nextPageToken):null);
 }
}
export class GraphDirectory implements DirectoryListing{
 readonly provider:'onedrive-personal'|'onedrive-business'|'sharepoint';
 constructor(provider:'onedrive-personal'|'onedrive-business'|'sharepoint',private readonly token:CloudTokenResolver,private readonly drive:GraphDriveResolver|undefined,private readonly request:Fetcher=fetch){this.provider=provider;}
 async list(ctx:CloudGrantContext,folder:string,rawCursor:string|null):Promise<DirectoryPage>{
  ensure(ctx.provider===this.provider,'CLOUD_M8_PROVIDER_MISMATCH',403);
  const base=this.provider==='sharepoint'?(await this.drive?.(ctx)):'me';
  if(this.provider==='sharepoint')ensure(typeof base==='string'&&/^[A-Za-z0-9!._-]{1,300}$/.test(base),'CLOUD_M8_SHAREPOINT_DRIVE_REQUIRED',403);
  const prefix=this.provider==='sharepoint'?`https://graph.microsoft.com/v1.0/drives/${enc(base!)}`:'https://graph.microsoft.com/v1.0/me/drive';
  const tail=folder==='root'?'/root/children':`/items/${enc(segment(folder))}/children`;
  let url=prefix+tail+'?$top=100&$select=id,name,size,eTag,file,folder';
  const continuation=cursor(rawCursor);
  if(continuation){const next=new URL(continuation,'https://graph.microsoft.com');
   ensure(next.protocol==='https:'&&next.hostname==='graph.microsoft.com'&&next.port===''&&next.username===''&&next.password===''&&next.pathname===prefix.slice('https://graph.microsoft.com'.length)+tail&&next.searchParams.has('$skiptoken'),'CLOUD_M8_GRAPH_CURSOR_UNTRUSTED',403);
   url=next.toString();
  }
  const x=await getJson(this.request,url,await this.token(ctx,'read'));
  const items=entries(x.value).map(f=>dataItem(f.id,f.name,!!f.folder,f.size,f.eTag,f.file?.mimeType));
  return finish(items,x['@odata.nextLink']?cursor(x['@odata.nextLink']):null);
 }
}
export class DropboxDirectory implements DirectoryListing{
 readonly provider='dropbox';
 constructor(private readonly token:CloudTokenResolver,private readonly request:Fetcher=fetch){}
 async list(ctx:CloudGrantContext,folder:string,rawCursor:string|null):Promise<DirectoryPage>{
  ensure(ctx.provider===this.provider,'CLOUD_M8_PROVIDER_MISMATCH',403);
  ensure(folder==='root'||/^\/(?:[^\\\r\n\0]+\/?){1,40}$/.test(folder),'CLOUD_M8_DROPBOX_FOLDER_INVALID');
  const next=cursor(rawCursor),url=next?'https://api.dropboxapi.com/2/files/list_folder/continue':'https://api.dropboxapi.com/2/files/list_folder';
  const x=await getJson(this.request,url,await this.token(ctx,'read'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next?{cursor:next}:{path:folder==='root'?'':folder,recursive:false,limit:maxResults})});
  const items=entries(x.entries).map(f=>dataItem(f.id||f.path_lower||f.path_display,f.name,f['.tag']==='folder',f.size,f.rev,f['.tag']==='folder'?'inode/directory':'application/octet-stream'));
  ensure(x.has_more!==true||typeof x.cursor==='string','CLOUD_M8_DROPBOX_CURSOR_MISSING',502);
  return finish(items,x.has_more===true?segment(x.cursor):null);
 }
}
export class BoxDirectory implements DirectoryListing{
 readonly provider='box';
 constructor(private readonly token:CloudTokenResolver,private readonly request:Fetcher=fetch){}
 async list(ctx:CloudGrantContext,folder:string,rawCursor:string|null):Promise<DirectoryPage>{
  ensure(ctx.provider===this.provider,'CLOUD_M8_PROVIDER_MISMATCH',403);
  const id=folder==='root'?'0':folder.startsWith('folder:')?folder.slice(7):folder;
  ensure(/^\d{1,30}$/.test(id),'CLOUD_M8_BOX_FOLDER_INVALID');
  const next=cursor(rawCursor);const u=new URL(`https://api.box.com/2.0/folders/${id}/items`);u.searchParams.set('limit',String(maxResults));u.searchParams.set('usemarker','true');u.searchParams.set('fields','id,type,name,size,etag');if(next)u.searchParams.set('marker',next);
  const x=await getJson(this.request,u.toString(),await this.token(ctx,'read'));
  const items=entries(x.entries).map(f=>dataItem(f.type==='folder'?'folder:'+f.id:f.id,f.name,f.type==='folder',f.size,f.etag,''));
  return finish(items,x.next_marker?segment(x.next_marker):null);
 }
}
export class GithubDirectory implements DirectoryListing{
 readonly provider='github';
 constructor(private readonly token:CloudTokenResolver,private readonly scope:GithubScopeResolver,private readonly request:Fetcher=fetch){}
 async list(ctx:CloudGrantContext,folder:string,rawCursor:string|null):Promise<DirectoryPage>{
  ensure(ctx.provider===this.provider,'CLOUD_M8_PROVIDER_MISMATCH',403);ensure(rawCursor===null,'CLOUD_M8_GITHUB_NO_PAGINATION');
  const s=await this.scope(ctx);ensure(/^[A-Za-z0-9_.-]{1,100}$/.test(s.owner)&&/^[A-Za-z0-9_.-]{1,100}$/.test(s.repo)&&/^[A-Za-z0-9._\/-]{1,200}$/.test(s.branch)&&!s.branch.includes('..'),'CLOUD_M8_GITHUB_SCOPE_INVALID',403);
  ensure(folder==='root'||(folder.length<=500&&!folder.startsWith('/')&&folder.split('/').every(p=>p!==''&&p!=='.'&&p!=='..'&&!/%2f|%2e|%5c/i.test(p))),'CLOUD_M8_GITHUB_FOLDER_INVALID');
  const path=folder==='root'?'':folder.split('/').map(enc).join('/')+'/';
  const url=`https://api.github.com/repos/${enc(s.owner)}/${enc(s.repo)}/contents/${path}?ref=${enc(s.branch)}`;
  const xs=await getArray(this.request,url,await this.token(ctx,'read'),{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
  const items=xs.map(x=>dataItem(x.path,x.name,x.type==='dir',x.size,x.sha,x.type==='dir'?'inode/directory':'application/octet-stream'));
  return finish(items,null);
 }
}

export class PCloudDirectory implements DirectoryListing{
 readonly provider='pcloud';
 constructor(private readonly token:CloudTokenResolver,private readonly region:PCloudRegionResolver,private readonly request:Fetcher=fetch){}
 async list(ctx:CloudGrantContext,folder:string,rawCursor:string|null):Promise<DirectoryPage>{
  ensure(ctx.provider===this.provider,'CLOUD_M8_PROVIDER_MISMATCH',403);ensure(rawCursor===null,'CLOUD_M8_PCLOUD_NO_PAGINATION');
  if(folder==='root')folder='0';
  ensure(/^(?:0|[1-9][0-9]{0,17})$/.test(folder),'CLOUD_M8_PCLOUD_FOLDER_INVALID');
  const host=await this.region(ctx);ensure(host==='api.pcloud.com'||host==='eapi.pcloud.com','CLOUD_M8_PCLOUD_HOST_UNTRUSTED',403);
  const url=`https://${host}/listfolder?folderid=${enc(folder)}&recursive=0`;
  const x=await getJson(this.request,url,await this.token(ctx,'read'));
  ensure(x.result===0&&x.metadata?.isfolder===true,'CLOUD_M8_PCLOUD_LIST_INVALID',502);
  const contents=entries(x.metadata.contents);
  const items=contents.map(f=>dataItem(f.isfolder?String(f.folderid):String(f.fileid),f.name,f.isfolder===true,f.size,String(f.hash||''),f.contenttype));
  return finish(items,null);
 }
}
