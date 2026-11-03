/** Staged Cloud multi-account HTTP routes. Secure-by-default: env flag off,
 * and production rollout must remain blocked until provider live E2E passes.
 * All routes MUST be inside the existing ladePoort('cloud',...) wrapper.
 */
import {json,error} from '../server/platform';
import {ladeOf} from './ruimte-cloud-agenda';
import {CloudConnectionError,CloudConnectionManager,type CloudPrincipal,type OAuthProvider,type ConnectionMode}from'./cloud-verbinding-m4';
import {LiveOAuthProviders}from'./cloud-verbinding-m4-providers';
import {PostgresCloudConnections}from'./cloud-verbinding-m4-pg';
import {cloudOAuthM4Config}from'./cloud-verbinding-m4-config';
import {assertCloudProviderEnabled}from'./cloud-m6-aanbieder-gate';
const allowed=new Set(['onedrive-personal','onedrive-business','sharepoint','dropbox','box']);
const enabled=()=>process.env.CLOUD_M4_CONNECTIONS_STAGING==='enabled';
const safeQuery=(s:unknown,max=300)=>typeof s==='string'&&s.length<=max&&!/[\r\n\0]/.test(s)?s:'';
const store=new PostgresCloudConnections();
const manager=new CloudConnectionManager(store,new LiveOAuthProviders(),cloudOAuthM4Config,Date.now,
  provider=>assertCloudProviderEnabled(provider,'connect'));
type Context={event:Record<string,unknown>;body:unknown;query?:Record<string,string>;params:Record<string,string>};
type Auth={service:string;user:{id:string;email:string;status:string}}|{errorCode:string};
type Authorize=(event:Record<string,unknown>,body:unknown)=>Promise<Auth>;
function fromBody(body:unknown):Record<string,unknown>{return typeof body==='object'&&body!==null&&!Array.isArray(body)?body as Record<string,unknown>:{};}
async function bound(authorize:Authorize,ctx:Context):Promise<CloudPrincipal|null>{
 const auth=await authorize(ctx.event,ctx.body);
 if('errorCode'in auth||auth.service!=='cloud'||auth.user.status!=='approved')return null;
 return{owner:auth.user.id,space:ladeOf(auth.user.id).ruimte};
}
function caught(e:unknown){
 if(e instanceof CloudConnectionError)return error(e.code,e.status);
 return error('CLOUD_CONNECTION_INTERNAL_ERROR',502);
}
const returnToCloud=(state:'ok'|'failed',code:string)=>({statusCode:303,
 headers:{Location:`https://cloud.tarasevych.com/overzicht?cloud_auth=${state}&reason=${encodeURIComponent(code.slice(0,90))}`,
  'Cache-Control':'no-store','Referrer-Policy':'no-referrer'},body:''});
export function createM4CloudRoutes(authorize:Authorize){return{
 'POST /api/owner/cloud/integrations/v1/accounts/list':[async(ctx:Context)=>{
  if(!enabled())return error('CLOUD_M4_NOT_RELEASED',404);
  const principal=await bound(authorize,ctx);if(!principal)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  try{return json({schema:'cloud-accounts-m4',accounts:await manager.list(principal),release:'STAGING_ONLY'});}catch(e){return caught(e);}
 }],
 'POST /api/owner/cloud/integrations/v1/accounts/start':[async(ctx:Context)=>{
  if(!enabled())return error('CLOUD_M4_NOT_RELEASED',404);
  const principal=await bound(authorize,ctx);if(!principal)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  const body=fromBody(ctx.body);const provider=body.provider,mode=body.mode;
  if(typeof provider!=='string'||!allowed.has(provider)||!['read','write'].includes(String(mode)))return error('CLOUD_PROVIDER_OR_MODE_INVALID',400);
  try{await assertCloudProviderEnabled(provider,'connect');
   return json({schema:'cloud-consent-m4',...await manager.start(principal,provider as OAuthProvider,mode as ConnectionMode)});}
  catch(e){return caught(e);}
 }],
 'GET /api/owner/cloud/oauth/m4/callback':[async(ctx:Context)=>{
  if(!enabled())return error('CLOUD_M4_NOT_RELEASED',404);
  const principal=await bound(authorize,ctx);if(!principal)return returnToCloud('failed','OWNER_CLOUD_SESSION_REQUIRED');
  if(ctx.query?.error)return returnToCloud('failed','PROVIDER_CONSENT_CANCELLED');
  try{await manager.complete(principal,safeQuery(ctx.query?.state,200),safeQuery(ctx.query?.code,4096));
   return returnToCloud('ok','ACCOUNT_CONNECTED');}
  catch(e){return returnToCloud('failed',e instanceof CloudConnectionError?e.code:'CLOUD_CALLBACK_FAILED');}
 }],
 'POST /api/owner/cloud/integrations/v1/accounts/:id/rename':[async(ctx:Context)=>{
  if(!enabled())return error('CLOUD_M4_NOT_RELEASED',404);
  const principal=await bound(authorize,ctx);if(!principal)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  try{const label=fromBody(ctx.body).label;
   return json({schema:'cloud-account-m4',account:await manager.rename(principal,safeQuery(ctx.params.id,100),String(label??''))});}
  catch(e){return caught(e);}
 }],
 'POST /api/owner/cloud/integrations/v1/accounts/:id/disconnect':[async(ctx:Context)=>{
  if(!enabled())return error('CLOUD_M4_NOT_RELEASED',404);
  const principal=await bound(authorize,ctx);if(!principal)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  const b=fromBody(ctx.body);if(b.confirm!==true)return error('CLOUD_DISCONNECT_EXPLICIT_CONFIRMATION_REQUIRED',400);
  try{return json({schema:'cloud-disconnect-m4',...await manager.disconnect(principal,safeQuery(ctx.params.id,100))});}
  catch(e){return caught(e);}
 }]
};}
