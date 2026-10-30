/** Cloud multi-account authorization core, M4 DEVELOPMENT ONLY.
 * No HTTP routes or deployment registration. Credentials and OAuth flows are
 * server-only. A completed OAuth flow never switches the selected account.
 */
import {createHash,randomBytes,randomUUID} from 'node:crypto';

export type CloudSpace='prive'|'technisch';
export type OAuthProvider='onedrive-personal'|'onedrive-business'|'sharepoint'|'dropbox'|'box';
export type ConnectionMode='read'|'write';
export type ConnectionStatus='connected'|'reauth_required'|'disconnect_pending'|'revoked';
export type CloudPrincipal={owner:string;space:CloudSpace};
export type AccountView={id:string;provider:OAuthProvider;displayName:string;label:string;email:string;externalSubject:string;status:ConnectionStatus;mode:ConnectionMode;scopes:string[];updatedAt:string};
export type PendingFlow={stateHash:string;id:string;owner:string;space:CloudSpace;provider:OAuthProvider;mode:ConnectionMode;verifier:string;nonce:string;createdAt:number;expiresAt:number};
export type RemoteIdentity={subject:string;displayName:string;email:string};
export type OAuthTokens={accessToken:string;refreshToken?:string;expiresAt:number;scopes:string[]};
export type StoredConnection=AccountView&{owner:string;space:CloudSpace;credentials:OAuthTokens};
export type OAuthConfig={clientId:string;clientSecret:string;redirectUri:string};
export type OAuthAuthorization={url:string;flowId:string;expiresAt:number};
export interface CloudConnectionStore{
 saveFlow(x:PendingFlow):Promise<void>;
 consumeFlow(stateHash:string):Promise<PendingFlow|null>;
 upsert(account:Omit<StoredConnection,'id'|'updatedAt'|'status'>):Promise<AccountView>;
 list(principal:CloudPrincipal):Promise<AccountView[]>;
 get(principal:CloudPrincipal,id:string):Promise<StoredConnection|null>;
 deactivate(principal:CloudPrincipal,id:string):Promise<void>;
 markRevokePending(principal:CloudPrincipal,id:string):Promise<boolean>;
 rename(principal:CloudPrincipal,id:string,label:string):Promise<AccountView>;
 setStatus(principal:CloudPrincipal,id:string,status:ConnectionStatus):Promise<void>;
}
export interface ProviderOAuthClient{
 authorization(provider:OAuthProvider,mode:ConnectionMode,config:OAuthConfig,state:string,challenge:string,nonce:string):string;
 exchange(provider:OAuthProvider,config:OAuthConfig,code:string,verifier:string):Promise<OAuthTokens>;
 identity(provider:OAuthProvider,accessToken:string):Promise<RemoteIdentity>;
 revoke(provider:OAuthProvider,config:OAuthConfig,tokens:OAuthTokens):Promise<'revoked'|'unsupported'>;
}
export class CloudConnectionError extends Error{
 constructor(public readonly code:string,public readonly status=409){super(code);this.name='CloudConnectionError';}
}
const valid=(value:string,max=250)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\0\r\n]/.test(value);
const stateHash=(state:string)=>createHash('sha256').update(state).digest('hex');
const challenge=(verifier:string)=>createHash('sha256').update(verifier).digest('base64url');
const states=new Set(['prive','technisch']);
const providers=new Set(['onedrive-personal','onedrive-business','sharepoint','dropbox','box']);
export function principalCheck(p:CloudPrincipal){
 if(!valid(p.owner)||!states.has(p.space))throw new CloudConnectionError('CLOUD_OWNER_OR_SPACE_INVALID',403);
}
export const M4_TTL_MS=10*60_000;
export class CloudConnectionManager{
 constructor(private readonly store:CloudConnectionStore,private readonly client:ProviderOAuthClient,
 private readonly configuration:(provider:OAuthProvider)=>OAuthConfig,private readonly clock:()=>number=Date.now,
 private readonly checkConnectionPolicy?: (provider:OAuthProvider)=>Promise<void>){}
 /** Returns an external consent URL. Caller must have an authenticated owner/space from ladePoort. */
 async start(p:CloudPrincipal,provider:OAuthProvider,mode:ConnectionMode):Promise<OAuthAuthorization>{
  principalCheck(p);
  if(!providers.has(provider)||!['read','write'].includes(mode))throw new CloudConnectionError('CLOUD_PROVIDER_OR_MODE_INVALID',400);
  await this.checkConnectionPolicy?.(provider);
  const config=this.configuration(provider);
  if(!valid(config.clientId,512)||!valid(config.clientSecret,2048)||!/^https:\/\//.test(config.redirectUri))
   throw new CloudConnectionError('CLOUD_OAUTH_PROVIDER_NOT_CONFIGURED',503);
  const flowId=randomUUID(),secret=randomBytes(32).toString('base64url');
  const verifier=randomBytes(48).toString('base64url'),nonce=randomBytes(32).toString('base64url');
  const state=flowId+'.'+secret;
  const createdAt=this.clock(),expiresAt=createdAt+M4_TTL_MS;
  const url=this.client.authorization(provider,mode,config,state,challenge(verifier),nonce);
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!['login.microsoftonline.com','www.dropbox.com','account.box.com'].includes(parsed.hostname))
   throw new CloudConnectionError('CLOUD_OAUTH_CONSENT_ORIGIN_INVALID');
  await this.store.saveFlow({id:flowId,stateHash:stateHash(state),owner:p.owner,space:p.space,provider,mode,verifier,nonce,createdAt,expiresAt});
  return{url,flowId,expiresAt};
 }
 /** Callback must bind to CURRENT server-side user+space; state is single-use even on errors. */
 async complete(p:CloudPrincipal,state:string,code:string):Promise<AccountView>{
  principalCheck(p);
  if(!valid(state,200)||!valid(code,4096))throw new CloudConnectionError('CLOUD_OAUTH_CALLBACK_INVALID',400);
  const flow=await this.store.consumeFlow(stateHash(state));
  if(!flow||flow.expiresAt<=this.clock())throw new CloudConnectionError('CLOUD_OAUTH_STATE_EXPIRED_OR_USED',403);
  if(flow.owner!==p.owner||flow.space!==p.space)throw new CloudConnectionError('CLOUD_OAUTH_CONTEXT_CHANGED',403);
  // Re-check at callback, because operator could disable connections after consent started.
  await this.checkConnectionPolicy?.(flow.provider);
  const config=this.configuration(flow.provider);
  const tokens=await this.client.exchange(flow.provider,config,code,flow.verifier);
  if(!valid(tokens.accessToken,16384)||!Number.isFinite(tokens.expiresAt)||tokens.expiresAt<=this.clock()+10_000)
   throw new CloudConnectionError('CLOUD_OAUTH_TOKEN_INVALID',502);
  // Provider identity, NEVER email supplied by the browser.
  const identity=await this.client.identity(flow.provider,tokens.accessToken);
  if(!valid(identity.subject,350)||!valid(identity.displayName,300)||!valid(identity.email,350))
   throw new CloudConnectionError('CLOUD_OAUTH_PROFILE_INVALID',502);
  if(!tokens.refreshToken)throw new CloudConnectionError('CLOUD_OAUTH_OFFLINE_GRANT_REQUIRED',409);
  return this.store.upsert({owner:p.owner,space:p.space,provider:flow.provider,externalSubject:identity.subject,
   displayName:identity.displayName,label:'',email:identity.email,mode:flow.mode,
   scopes:tokens.scopes,credentials:tokens});
 }
 async list(p:CloudPrincipal){principalCheck(p);return this.store.list(p);}
 async rename(p:CloudPrincipal,id:string,label:string){
  principalCheck(p);if(!valid(id,100)||typeof label!=='string'||label.length>80||/[\0\r\n<>]/.test(label))
   throw new CloudConnectionError('CLOUD_ACCOUNT_LABEL_INVALID',400);
  return this.store.rename(p,id,label.trim());
 }
 /** Local access is disabled first. If upstream revoke fails, local state remains blocked. */
 async disconnect(p:CloudPrincipal,accountId:string):Promise<{localDisabled:true;remote:'revoked'|'unsupported'|'pending'}>{
  principalCheck(p);if(!valid(accountId,100))throw new CloudConnectionError('CLOUD_ACCOUNT_ID_INVALID',400);
  const account=await this.store.get(p,accountId);
  if(!account)throw new CloudConnectionError('CLOUD_ACCOUNT_NOT_FOUND',404);
  if(account.status==='revoked')return{localDisabled:true,remote:'revoked'};
  if(account.status==='disconnect_pending')return{localDisabled:true,remote:'pending'};
  const leased=await this.store.markRevokePending(p,accountId);
  if(!leased)return{localDisabled:true,remote:'pending'};
  let remote:'revoked'|'unsupported'|'pending'='pending';
  try{remote=await this.client.revoke(account.provider,this.configuration(account.provider),account.credentials);}
  catch{return{localDisabled:true,remote:'pending'};}
  // Provider without revocation endpoint: local grant is disabled; UI must say remote provider access may persist.
  await this.store.setStatus(p,accountId,'revoked');
  return{localDisabled:true,remote};
 }
}
