/** Cloud M8: server-only multi-account navigation coordinator.
 * Resolved identity, space and account are ALWAYS recomputed server-side. No tokens
 * or upstream URLs reach the browser. Do NOT expose without M6 proof gate + live E2E.
 */
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {CloudTransportError} from './cloud-overdracht-adapters';
import type {DirectoryListing,DirectoryPage} from './cloud-m8-directory';
import type {CloudGrantContext} from './cloud-overdracht-adapters';
import type {CloudRuimte,CloudAanbieder} from '../shared/cloud-integratie-contract';
import {FIRST_WAVE_PROVIDERS} from '../shared/cloud-m5-catalogus';
export type Viewer={owner:string;space:CloudRuimte};
export type DirectoryAccount={id:string;provider:CloudAanbieder;owner:string;space:CloudRuimte;status:'connected'|'revoked'|'reauth_required';label:string};
export type ScopedAccountResolver={find:(principal:Viewer,accountId:string)=>Promise<DirectoryAccount|null>};
export type ProviderAccessPolicy=(provider:CloudAanbieder,action:'operate')=>Promise<void>;
export type ClientDirectoryRequest={accountId:string;folderId:string;cursor?:string|null};
export type PublicDirectoryPage={account:{id:string;provider:CloudAanbieder;label:string};folderId:string;items:DirectoryPage['items'];nextCursor:string|null};
const valid=(x:string,max=1000)=>typeof x==='string'&&x.length>0&&x.length<=max&&!/[\r\n\0]/.test(x);
function deny(code:string,status=403):never{throw new CloudTransportError(code,status);}
function sameContext(principal:Viewer,account:DirectoryAccount){return account.owner===principal.owner&&account.space===principal.space&&account.status==='connected';}
/** Authenticated-encrypted continuation, not merely base64 + MAC: provider cursors
 * may contain sensitive paths or state, so browser cannot inspect them. */
export class CloudOpaqueCursors{
 constructor(private readonly secret:Uint8Array,private readonly now:()=>number=Date.now){if(secret.byteLength!==32)deny('CLOUD_M8_CURSOR_KEY_INVALID',503);}
 private binding(context:Viewer,account:DirectoryAccount,folder:string){return Buffer.from(JSON.stringify([1,context.owner,context.space,account.provider,account.id,folder]));}
 seal(context:Viewer,account:DirectoryAccount,folder:string,remote:string):string{
  if(!valid(remote,2048))deny('CLOUD_M8_REMOTE_CURSOR_INVALID',400);
  const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.secret,nonce);
  cipher.setAAD(this.binding(context,account,folder));
  const payload=Buffer.from(JSON.stringify({remote,exp:this.now()+300_000}),'utf8');
  const encrypted=Buffer.concat([cipher.update(payload),cipher.final()]);
  return Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64url');
 }
 open(context:Viewer,account:DirectoryAccount,folder:string,token:string):string{
  if(!valid(token,8000)||!/^[A-Za-z0-9_-]+$/.test(token))deny('CLOUD_M8_CURSOR_INVALID',400);
  const bytes=Buffer.from(token,'base64url');if(bytes.length<29||bytes.length>4000)deny('CLOUD_M8_CURSOR_INVALID',400);
  let data:Record<string,any>;
  try{
   const decipher=createDecipheriv('aes-256-gcm',this.secret,bytes.subarray(0,12));
   decipher.setAAD(this.binding(context,account,folder));decipher.setAuthTag(bytes.subarray(12,28));
   data=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
  }catch{deny('CLOUD_M8_CURSOR_INVALID_OR_OTHER_CONTEXT',403);}
  if(!Number.isSafeInteger(data.exp)||data.exp<this.now()||data.exp>this.now()+300_000||!valid(data.remote,2048))deny('CLOUD_M8_CURSOR_EXPIRED',403);
  return data.remote;
 }
}
export class CloudMultiAccountWorkspace{
 private readonly listings=new Map<CloudAanbieder,DirectoryListing>();
 constructor(private readonly accounts:ScopedAccountResolver,private readonly providerAccess:ProviderAccessPolicy,
   private readonly cursors:CloudOpaqueCursors,providers:DirectoryListing[]){
  for(const adapter of providers){const name=adapter.provider as CloudAanbieder;
   if(!FIRST_WAVE_PROVIDERS.includes(name as any)||this.listings.has(name))deny('CLOUD_M8_DUPLICATE_OR_UNKNOWN_DRIVER',500);
   this.listings.set(name,adapter);
  }
 }
 /** Reusable authorization for directory and byte-preview. This is not a token broker. */
 async authorizedAccount(principal:Viewer,accountId:string):Promise<DirectoryAccount>{
  if(!valid(principal?.owner,200)||!['prive','technisch'].includes(principal.space)||!valid(accountId,200))deny('CLOUD_M8_CONTEXT_INVALID',403);
  const account=await this.accounts.find(principal,accountId);
  if(!account||!sameContext(principal,account))deny('CLOUD_M8_ACCOUNT_NOT_AVAILABLE',403);
  await this.providerAccess(account.provider,'operate');
  return account;
 }
 async list(principal:Viewer,request:ClientDirectoryRequest):Promise<PublicDirectoryPage>{
  if(!valid(principal?.owner,200)||!['prive','technisch'].includes(principal.space)||!valid(request?.accountId,200)||!valid(request?.folderId,700))deny('CLOUD_M8_CONTEXT_INVALID',403);
  const account=await this.authorizedAccount(principal,request.accountId); // M6 + scoped account
  const driver=this.listings.get(account.provider);
  if(!driver)deny('CLOUD_M8_LISTING_DRIVER_NOT_LIVE_VERIFIED',409);
  const grant:CloudGrantContext={userId:principal.owner,space:principal.space,accountId:account.id,provider:account.provider};
  const remoteCursor=request.cursor?this.cursors.open(principal,account,request.folderId,request.cursor):null;
  const result=await driver.list(grant,request.folderId,remoteCursor);
  if(result.items.length>100)deny('CLOUD_M8_PAGE_TOO_LARGE',502);
  return{account:{id:account.id,provider:account.provider,label:account.label},folderId:request.folderId,items:result.items,
   nextCursor:result.nextCursor?this.cursors.seal(principal,account,request.folderId,result.nextCursor):null};
 }
 /** Separate failures and per-account isolation: one unauthorized account does not leak results
  * or block others. No global active account and no shared client cursor between tabs. */
 async across(principal:Viewer,requests:ClientDirectoryRequest[]){
  if(!Array.isArray(requests)||requests.length>8||requests.some(x=>!valid(x?.accountId,200)))deny('CLOUD_M8_BATCH_INVALID',400);
  if(new Set(requests.map(x=>x.accountId+'\0'+x.folderId)).size!==requests.length)deny('CLOUD_M8_DUPLICATE_BATCH',400);
  return Promise.all(requests.map(async request=>{
   try{return{accountId:request.accountId,ok:true as const,page:await this.list(principal,request)};}
   catch(e){return{accountId:request.accountId,ok:false as const,error:e instanceof CloudTransportError?e.code:'CLOUD_M8_UNAVAILABLE'};}
  }));
 }
}
