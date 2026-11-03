/** M11: bounded, explicitly authorized remote-file preview, staging-only.
 * User+space+account+revision are verified for every read. This is NOT E2EE:
 * upstream plaintext bytes reach the application's server for native providers.
 */
import {createHash} from 'node:crypto';
import {CloudTransportError,type CloudTransport,type CloudGrantContext} from './cloud-overdracht-adapters';
import type {CloudMultiAccountWorkspace,Viewer} from './cloud-m8-werkruimte';

export const CLOUD_PREVIEW_MAX_BYTES=8*1024*1024;
const deny=(code:string,status=403):never=>{throw new CloudTransportError(code,status);};
const bounded=(x:unknown,max:number)=>typeof x==='string'&&x.length>0&&x.length<=max&&!/[\r\n\0]/.test(x);
const allowedExtension=/\.(?:pdf|txt|md|csv|json|png|jpe?g|gif|webp|docx|xlsx|pptx|odt|ods|odp|zip|ics|vcf|mp3|mp4|webm)$/i;
const forbiddenMime=/^(?:text\/html|image\/svg\+xml|application\/(?:xhtml\+xml|javascript|x-msdownload|x-sh|x-executable))$/i;
export type PreviewRequest={accountId:string;fileId:string;expectedRevision:string};
export type PreviewResult={accountId:string;provider:string;name:string;size:number;mime:string;revision:string;sha256:string;dataBase64:string;security:'SERVER_DELEGATED_NOT_E2EE'};
export interface AuthorizedAccount {id:string;provider:string;owner:string;space:string;status:string;label:string}
export type PreviewScope={authorizedAccount:(principal:Viewer,accountId:string)=>Promise<AuthorizedAccount>};

export class CloudM11PreviewService{
 private readonly transports:Map<string,CloudTransport>;
 constructor(private readonly access:PreviewScope, transports:CloudTransport[],private readonly maxBytes=CLOUD_PREVIEW_MAX_BYTES){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>CLOUD_PREVIEW_MAX_BYTES)deny('CLOUD_PREVIEW_SIZE_LIMIT_INVALID',500);
  this.transports=new Map();for(const t of transports){if(this.transports.has(t.provider))deny('CLOUD_PREVIEW_DUPLICATE_DRIVER',500);this.transports.set(t.provider,t);}
 }
 async read(principal:Viewer,input:PreviewRequest):Promise<PreviewResult>{
  if(!bounded(principal?.owner,200)||!['prive','technisch'].includes(principal.space)||
     !bounded(input?.accountId,200)||!bounded(input?.fileId,1024)||!bounded(input?.expectedRevision,200))deny('CLOUD_PREVIEW_INVALID_REFERENCE',400);
  const account=await this.access.authorizedAccount(principal,input.accountId);
  if(account.owner!==principal.owner||account.space!==principal.space||account.status!=='connected'||account.id!==input.accountId)deny('CLOUD_PREVIEW_ACCOUNT_SCOPE_MISMATCH');
  const transport=this.transports.get(account.provider);
  if(!transport)throw new CloudTransportError('CLOUD_PREVIEW_PROVIDER_NOT_VERIFIED',409);
  const ctx:CloudGrantContext={userId:principal.owner,space:principal.space,accountId:account.id,provider:transport.provider};
  const loc={context:ctx,fileId:input.fileId};
  const stat=await transport.stat(loc);
  if(stat.id!==input.fileId||stat.isFolder||!stat.canRead)deny('CLOUD_PREVIEW_FILE_ACCESS_DENIED');
  if(!Number.isSafeInteger(stat.size)||stat.size<=0||stat.size>this.maxBytes)deny('CLOUD_PREVIEW_TOO_LARGE',413);
  if(!bounded(stat.revision,200)||stat.revision!==input.expectedRevision)deny('CLOUD_PREVIEW_REVISION_CHANGED',409);
  const contentMime=typeof stat.mime==='string'?stat.mime.split(';',1)[0].trim().toLowerCase():'';
  if(!bounded(stat.name,300)||!allowedExtension.test(stat.name)||forbiddenMime.test(contentMime))deny('CLOUD_PREVIEW_FORMAT_NOT_ALLOWED',415);
  const data=await transport.download(loc,this.maxBytes);
  if(!(data instanceof Uint8Array)||data.byteLength!==stat.size||data.byteLength>this.maxBytes)deny('CLOUD_PREVIEW_SIZE_CHANGED',409);
  const after=await transport.stat(loc);
  if(after.id!==stat.id||after.revision!==stat.revision||after.size!==stat.size||!after.canRead)deny('CLOUD_PREVIEW_CHANGED_DURING_READ',409);
  // Revocation may happen while remote bytes are being fetched. Re-evaluate
  // the account and current provider policy BEFORE returning those bytes.
  const stillAuthorized=await this.access.authorizedAccount(principal,input.accountId);
  if(stillAuthorized.id!==account.id||stillAuthorized.provider!==account.provider||stillAuthorized.owner!==principal.owner||stillAuthorized.space!==principal.space||stillAuthorized.status!=='connected')deny('CLOUD_PREVIEW_REVOKED_DURING_READ',403);
  const sig=Buffer.from(data.subarray(0,16));const extension=stat.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0]||'';
  const hex=sig.toString('hex'),ascii=sig.toString('ascii');
  if(extension==='.pdf'&&!ascii.startsWith('%PDF-')||
     extension==='.png'&&!hex.startsWith('89504e470d0a1a0a')||
     ['.jpg','.jpeg'].includes(extension)&&!hex.startsWith('ffd8ff')||
     extension==='.gif'&&!/^GIF8[79]a/.test(ascii)||
     extension==='.webp'&&!(ascii.startsWith('RIFF')&&ascii.slice(8,12)==='WEBP')||
     ['.docx','.xlsx','.pptx','.odt','.ods','.odp','.zip'].includes(extension)&&!(hex.startsWith('504b0304')||hex.startsWith('504b0506')))
    deny('CLOUD_PREVIEW_FILE_SIGNATURE_MISMATCH',415);
  // No unsigned URL or decrypted OAuth token leaves the backend. Binary is returned
  // only in the authenticated response and must be stored nowhere by the client.
  const mime=contentMime&&!forbiddenMime.test(contentMime)&&contentMime.length<=160?contentMime:'application/octet-stream';
  return {accountId:account.id,provider:account.provider,name:stat.name,size:data.byteLength,mime,revision:stat.revision,
   sha256:createHash('sha256').update(data).digest('hex'),dataBase64:Buffer.from(data).toString('base64'),security:'SERVER_DELEGATED_NOT_E2EE'};
 }
}
