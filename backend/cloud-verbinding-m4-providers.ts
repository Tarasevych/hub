/** Real OAuth2 endpoints for Microsoft, Dropbox and Box; not wired to production.
 * Every external request has fixed host, no redirects, size limit and timeout.
 */
import type {ConnectionMode,OAuthProvider,OAuthConfig,OAuthTokens,RemoteIdentity,ProviderOAuthClient} from './cloud-verbinding-m4';
import {CloudConnectionError} from './cloud-verbinding-m4';

const isMicrosoft=(p:OAuthProvider)=>p==='onedrive-personal'||p==='onedrive-business'||p==='sharepoint';
const msTenant=(p:OAuthProvider)=>p==='onedrive-personal'?'consumers':'organizations';
export function requiredScopes(p:OAuthProvider,mode:ConnectionMode){
 if(isMicrosoft(p))return p==='sharepoint'?
  ['offline_access','User.Read',mode==='write'?'Sites.ReadWrite.All':'Sites.Read.All']:
  ['offline_access','User.Read',mode==='write'?'Files.ReadWrite':'Files.Read'];
 if(p==='dropbox')return mode==='write'?
  ['account_info.read','files.metadata.read','files.content.read','files.content.write']:
  ['account_info.read','files.metadata.read','files.content.read'];
 // Box scopes are configured on the Box application, not assured by an OAuth URL argument.
 return [];
}
export function consentUrl(p:OAuthProvider,mode:ConnectionMode,c:OAuthConfig,state:string,ch:string,nonce:string){
 const base=isMicrosoft(p)?`https://login.microsoftonline.com/${msTenant(p)}/oauth2/v2.0/authorize`:
  p==='dropbox'?'https://www.dropbox.com/oauth2/authorize':'https://account.box.com/api/oauth2/authorize';
 const u=new URL(base);u.searchParams.set('client_id',c.clientId);u.searchParams.set('response_type','code');
 u.searchParams.set('redirect_uri',c.redirectUri);u.searchParams.set('state',state);
 if(p==='box'){
  // Box OAuth applications control scopes in Developer Console. No false promise of read-only OAuth scope.
 }else{
  u.searchParams.set('code_challenge',ch);u.searchParams.set('code_challenge_method','S256');
 }
 if(isMicrosoft(p)){u.searchParams.set('scope',requiredScopes(p,mode).join(' '));u.searchParams.set('prompt','select_account');u.searchParams.set('nonce',nonce);}
 if(p==='dropbox'){u.searchParams.set('token_access_type','offline');u.searchParams.set('scope',requiredScopes(p,mode).join(' '));}
 return u.toString();
}
const endpoints={
 'onedrive-personal':'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
 'onedrive-business':'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
 sharepoint:'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
 dropbox:'https://api.dropbox.com/oauth2/token',box:'https://api.box.com/oauth2/token'
} as const;
const safeToken=(value:unknown,max=20000)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\r\n\0]/.test(value);
async function jsonLimited(response:Response):Promise<Record<string,unknown>>{
 const text=await response.text();if(text.length>64_000)throw new CloudConnectionError('CLOUD_PROVIDER_RESPONSE_TOO_LARGE',502);
 try{const o=JSON.parse(text);if(o&&typeof o==='object'&&!Array.isArray(o))return o;}catch{}
 throw new CloudConnectionError('CLOUD_PROVIDER_RESPONSE_INVALID',502);
}
export type RequestFunction=typeof fetch;
async function send(request:RequestFunction,url:string,init:RequestInit,host:string,expected=200){
 const u=new URL(url);if(u.protocol!=='https:'||u.hostname!==host||u.username||u.password)
  throw new CloudConnectionError('CLOUD_PROVIDER_ENDPOINT_UNSAFE',500);
 let response:Response;
 try{response=await request(url,{...init,redirect:'error',signal:AbortSignal.timeout(12_000)});}
 catch{throw new CloudConnectionError('CLOUD_PROVIDER_REQUEST_FAILED',502);}
 if(response.status!==expected)throw new CloudConnectionError('CLOUD_PROVIDER_HTTP_'+response.status,502);
 return jsonLimited(response);
}
const body=(data:Record<string,string>)=>new URLSearchParams(data).toString();
function tokensFrom(data:Record<string,unknown>,now:number):OAuthTokens{
 const expires=Number(data.expires_in);if(!safeToken(data.access_token)||!Number.isFinite(expires)||expires<60||expires>86400)
  throw new CloudConnectionError('CLOUD_PROVIDER_ACCESS_TOKEN_INVALID',502);
 return{accessToken:String(data.access_token),refreshToken:safeToken(data.refresh_token)?String(data.refresh_token):undefined,
  expiresAt:now+expires*1000,scopes:typeof data.scope==='string'?data.scope.split(/[ ,]+/).filter(Boolean):[]};
}
export class LiveOAuthProviders implements ProviderOAuthClient{
 constructor(private readonly request:RequestFunction=fetch,private readonly now:()=>number=Date.now){}
 authorization(p:OAuthProvider,mode:ConnectionMode,c:OAuthConfig,s:string,ch:string,n:string){return consentUrl(p,mode,c,s,ch,n);}
 async exchange(p:OAuthProvider,c:OAuthConfig,code:string,verifier:string){
  if(!safeToken(code,4096)||!safeToken(verifier,250))throw new CloudConnectionError('CLOUD_OAUTH_CODE_OR_PKCE_INVALID',400);
  const param:Record<string,string>={client_id:c.clientId,client_secret:c.clientSecret,grant_type:'authorization_code',code,redirect_uri:c.redirectUri};
  if(p!=='box')param.code_verifier=verifier;
  const r=await send(this.request,endpoints[p],{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body(param)},new URL(endpoints[p]).hostname);
  return tokensFrom(r,this.now());
 }
 async refresh(p:OAuthProvider,c:OAuthConfig,current:OAuthTokens):Promise<OAuthTokens>{
  if(!safeToken(current.refreshToken))throw new CloudConnectionError('CLOUD_REFRESH_TOKEN_MISSING',403);
  const param:Record<string,string>={grant_type:'refresh_token',refresh_token:current.refreshToken!,client_id:c.clientId,client_secret:c.clientSecret};
  const data=await send(this.request,endpoints[p],{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:body(param)},new URL(endpoints[p]).hostname);
  const fresh=tokensFrom(data,this.now());
  // Box refresh tokens are one-time-use: absence of the replacement is an ambiguous failure.
  if(p==='box'&&!fresh.refreshToken)throw new CloudConnectionError('CLOUD_BOX_REFRESH_REPLACEMENT_MISSING',409);
  return{...fresh,refreshToken:fresh.refreshToken||current.refreshToken,scopes:fresh.scopes.length?fresh.scopes:current.scopes};
 }
 async identity(p:OAuthProvider,accessToken:string):Promise<RemoteIdentity>{
  if(!safeToken(accessToken))throw new CloudConnectionError('CLOUD_PROVIDER_BEARER_INVALID',403);
  const headers={Authorization:'Bearer '+accessToken};let data:Record<string,unknown>;
  if(isMicrosoft(p)){
   data=await send(this.request,'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',
    {headers},'graph.microsoft.com');
   if(!safeToken(data.id,350))throw new CloudConnectionError('CLOUD_PROVIDER_IDENTITY_UNVERIFIED',502);
   const email=data.mail||data.userPrincipalName||'';
   return{subject:String(data.id),displayName:String(data.displayName||email),email:String(email)};
  }
  if(p==='dropbox'){
   data=await send(this.request,'https://api.dropboxapi.com/2/users/get_current_account',
    {method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'},'api.dropboxapi.com');
   const name=data.name as {display_name?:string}|undefined;
   if(!safeToken(data.account_id,350))throw new CloudConnectionError('CLOUD_PROVIDER_IDENTITY_UNVERIFIED',502);
   return{subject:String(data.account_id),displayName:name?.display_name||String(data.email||''),email:String(data.email||'')};
  }
  data=await send(this.request,'https://api.box.com/2.0/users/me?fields=id,name,login',
   {headers},'api.box.com');
  if(!safeToken(data.id,350))throw new CloudConnectionError('CLOUD_PROVIDER_IDENTITY_UNVERIFIED',502);
  return{subject:String(data.id),displayName:String(data.name||data.login||''),email:String(data.login||'')};
 }
 async revoke(p:OAuthProvider,c:OAuthConfig,t:OAuthTokens):Promise<'revoked'|'unsupported'>{
  // Microsoft Graph user tokens have no equivalent guaranteed per-grant revocation endpoint.
  // Stop locally and guide the user to Microsoft connected apps/consent portal.
  if(isMicrosoft(p))return'unsupported';
  if(p==='dropbox'){
   const u='https://api.dropboxapi.com/2/auth/token/revoke';
   const response=await this.request(u,{method:'POST',headers:{Authorization:'Bearer '+t.accessToken,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(12_000)});
   if(response.status!==200)throw new CloudConnectionError('CLOUD_DROPBOX_REVOKE_UNCONFIRMED',502);
   return'revoked';
  }
  // Box refresh token can rotate: use current refresh token when available.
  const token=t.refreshToken||t.accessToken;
  const u='https://api.box.com/oauth2/revoke';
  const response=await this.request(u,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:body({client_id:c.clientId,client_secret:c.clientSecret,token}),redirect:'error',signal:AbortSignal.timeout(12_000)});
  if(response.status!==200)throw new CloudConnectionError('CLOUD_BOX_REVOKE_UNCONFIRMED',502);
  return'revoked';
 }
}
