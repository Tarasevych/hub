/** M4 server-side token broker for multi-account file operations (STAGING ONLY).
 * All calls must already be authorized by cloud ladePoort or a verified worker
 * job with owner+space. Never accepts a browser-provided bearer token.
 */
import{randomUUID}from'node:crypto';
import type{CloudPrincipal,OAuthProvider,ConnectionMode,OAuthConfig,OAuthTokens}from'./cloud-verbinding-m4';
import{CloudConnectionError}from'./cloud-verbinding-m4';
import{PostgresCloudConnections}from'./cloud-verbinding-m4-pg';
import{LiveOAuthProviders}from'./cloud-verbinding-m4-providers';
const providers=new Set(['onedrive-personal','onedrive-business','sharepoint','dropbox','box']);
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export class CloudMultiAccountTokenBroker{
 constructor(private readonly repo:PostgresCloudConnections,private readonly client:LiveOAuthProviders,
  private readonly configuration:(p:OAuthProvider)=>OAuthConfig,private readonly now:()=>number=Date.now){}
 async forOperation(principal:CloudPrincipal,id:string,provider:string,operation:ConnectionMode):Promise<string>{
  if(!providers.has(provider))throw new CloudConnectionError('CLOUD_PROVIDER_NOT_SUPPORTED',403);
  const account=await this.repo.get(principal,id);
  if(!account||account.provider!==provider||account.status!=='connected')throw new CloudConnectionError('CLOUD_ACCOUNT_UNAVAILABLE',403);
  if(operation==='write'&&account.mode!=='write')throw new CloudConnectionError('CLOUD_WRITE_GRANT_NOT_SELECTED',403);
  // Microsoft & Dropbox scopes reported by provider. Box relies on per-file API permission checks.
  if(provider!=='box'){
   const relevant=provider==='dropbox'?(operation==='read'?'files.content.read':'files.content.write'):
    provider==='sharepoint'?(operation==='read'?'Sites.Read.All':'Sites.ReadWrite.All'):
    (operation==='read'?'Files.Read':'Files.ReadWrite');
   const alternative=provider.startsWith('onedrive')&&account.scopes.includes('Files.ReadWrite.All');
   const msWriteImpliesRead=operation==='read'&&account.scopes.includes(provider==='sharepoint'?'Sites.ReadWrite.All':'Files.ReadWrite');
   if(!account.scopes.includes(relevant)&&!alternative&&!msWriteImpliesRead)
    throw new CloudConnectionError('CLOUD_GRANTED_SCOPES_INSUFFICIENT',403);
  }
  const fresh=(t:OAuthTokens)=>t.expiresAt>this.now()+75_000;
  if(fresh(account.credentials))return account.credentials.accessToken;
  if(!account.credentials.refreshToken)throw new CloudConnectionError('CLOUD_REFRESH_TOKEN_MISSING',403);
  if(await this.repo.quarantineExpiredRefresh(principal,id))
   throw new CloudConnectionError('CLOUD_REFRESH_TIMEOUT_REAUTHORIZE',409);
  const lease=randomUUID();
  if(await this.repo.tryRefreshLease(principal,id,lease)){
   try{
    const next=await this.client.refresh(account.provider,this.configuration(account.provider),account.credentials);
    await this.repo.commitRefreshed(principal,id,lease,next);
    return next.accessToken;
   }catch(e){await this.repo.failedRefresh(principal,id,lease).catch(()=>{});
    throw new CloudConnectionError('CLOUD_REFRESH_FAILED_REAUTHORIZE',409);}
  }
  // Another web tab, worker or device may be rotating Box's one-use refresh token.
  for(let i=0;i<5;i++){
   await wait(400);
   const updated=await this.repo.get(principal,id);
   if(updated?.status!=='connected')throw new CloudConnectionError('CLOUD_REAUTHORIZATION_REQUIRED',403);
   if(updated.credentials.expiresAt>this.now()+75_000)return updated.credentials.accessToken;
  }
  throw new CloudConnectionError('CLOUD_REFRESH_IN_PROGRESS_RETRY',409);
 }
}
