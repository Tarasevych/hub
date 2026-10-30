/** M3 read-only version history adapters. Never restores/modifies versions.
 * Provider histories differ, so responses explicitly state whether they may be incomplete.
 * No new public route, no OAuth refresh side effects, no linked previews without permission.
 */
import type {CloudGrantContext,CloudTokenResolver,Fetcher,RemoteLocation} from './cloud-overdracht-adapters';
import {CloudTransportError} from './cloud-overdracht-adapters';
export type CloudVersion={id:string;modifiedAt:string|null;size:number|null;mimeType:string|null;keepForever?:boolean};
export type VersionHistory={provider:string;fileId:string;versions:CloudVersion[];complete:boolean;note:string};
const idOk=(v:string)=>typeof v==='string'&&v.length>0&&v.length<=400&&!/[\r\n\0?#]/.test(v);
const tokenOk=(v:string)=>typeof v==='string'&&v.length>5&&v.length<8192&&!/[\r\n\0]/.test(v);
async function parsed(resp:Response){
 if(resp.status!==200)throw new CloudTransportError(resp.status===403?'CLOUD_VERSIONS_FORBIDDEN':'CLOUD_VERSIONS_UNAVAILABLE',resp.status===403?403:502);
 const size=Number(resp.headers.get('content-length')||0);if(size>256000)throw new CloudTransportError('CLOUD_VERSIONS_RESPONSE_TOO_LARGE',413);
 const content=await resp.text();if(content.length>256000)throw new CloudTransportError('CLOUD_VERSIONS_RESPONSE_TOO_LARGE',413);
 try{return JSON.parse(content);}catch{throw new CloudTransportError('CLOUD_VERSIONS_RESPONSE_INVALID',502);}
}
const version=(id:unknown,at:unknown,size:unknown,mime:unknown,keepForever?:boolean):CloudVersion|null=>{
 if(typeof id!=='string'||!idOk(id))return null;
 return{id,modifiedAt:typeof at==='string'&&Number.isFinite(Date.parse(at))?at:null,
  size:(typeof size==='number'||typeof size==='string')&&Number.isSafeInteger(Number(size))&&Number(size)>=0?Number(size):null,
  mimeType:typeof mime==='string'&&mime.length<200?mime:null,...(keepForever===undefined?{}:{keepForever})};
};
export class ProviderVersionHistory{
 constructor(private readonly token:CloudTokenResolver,private readonly request:Fetcher=fetch,
 private readonly sharePointDrive?:(ctx:CloudGrantContext)=>Promise<string>){}
 async list(loc:RemoteLocation):Promise<VersionHistory>{
  const {context:c,fileId}=loc;if(!idOk(fileId)||!idOk(c.accountId)||!idOk(c.userId))throw new CloudTransportError('CLOUD_VERSIONS_INVALID_ID',400);
  const t=await this.token(c,'read');if(!tokenOk(t))throw new CloudTransportError('CLOUD_VERSIONS_NO_GRANT',403);
  let url:string,init:RequestInit={headers:{Authorization:'Bearer '+t},redirect:'error'};
  switch(c.provider){
  case 'google-drive':
   url=`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/revisions?fields=nextPageToken,revisions(id,modifiedTime,size,mimeType,keepForever)&pageSize=100`;
   break;
  case 'onedrive-personal':case 'onedrive-business':case 'sharepoint':{
   let drive='me/drive';if(c.provider==='sharepoint'){
    const id=await this.sharePointDrive?.(c);if(!id||!idOk(id))throw new CloudTransportError('CLOUD_VERSIONS_SHAREPOINT_DRIVE_MISSING',403);
    drive='drives/'+encodeURIComponent(id);
   }
   url=`https://graph.microsoft.com/v1.0/${drive}/items/${encodeURIComponent(fileId)}/versions`;
   break;}
  case 'dropbox':
   if(!/^(?:id:[A-Za-z0-9_-]{5,300}|\/(?:[^\\\r\n\0]+))$/.test(fileId))throw new CloudTransportError('CLOUD_VERSIONS_DROPBOX_PATH_INVALID',400);
   url='https://api.dropboxapi.com/2/files/list_revisions';init={method:'POST',redirect:'error',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({path:fileId,limit:100})};break;
  case 'box':
   if(!/^\d{1,30}$/.test(fileId))throw new CloudTransportError('CLOUD_VERSIONS_BOX_ID_INVALID',400);
   url=`https://api.box.com/2.0/files/${fileId}/versions?limit=100`;break;
  default:throw new CloudTransportError('CLOUD_VERSIONS_PROVIDER_NOT_IMPLEMENTED',409);
  }
  const raw=await parsed(await this.request(url,init));let versions:CloudVersion[]=[],complete=false,note='PROVIDER_HISTORY_MAY_BE_INCOMPLETE';
  if(c.provider==='google-drive'){
   versions=Array.isArray(raw.revisions)?raw.revisions.slice(0,100).map((x:any)=>version(x.id,x.modifiedTime,x.size,x.mimeType,x.keepForever)).filter(Boolean):[];
   complete=!raw.nextPageToken;note='GOOGLE_DRIVE_API_HISTORY_MAY_OMIT_OLDER_EDITOR_REVISIONS';
  }else if(c.provider==='dropbox'){
   versions=Array.isArray(raw.entries)?raw.entries.slice(0,100).map((x:any)=>version(x.rev,x.server_modified,x.size,null)).filter(Boolean):[];
   complete=raw.is_deleted!==true&&versions.length<100;note='DROPBOX_RETENTION_AND_LIMITS_APPLY';
  }else if(c.provider==='box'){
   versions=Array.isArray(raw.entries)?raw.entries.slice(0,100).map((x:any)=>version(x.id,x.modified_at,x.size,null)).filter(Boolean):[];
   complete=(raw.total_count??0)<=versions.length;note='BOX_PLAN_MAY_LIMIT_VERSION_HISTORY';
  }else{
   versions=Array.isArray(raw.value)?raw.value.slice(0,100).map((x:any)=>version(x.id,x.lastModifiedDateTime,x.size,null)).filter(Boolean):[];
   complete=!raw['@odata.nextLink'];note='MICROSOFT_RETENTION_POLICY_APPLIES';
  }
  return{provider:c.provider,fileId,versions:versions as CloudVersion[],complete,note};
 }
}
