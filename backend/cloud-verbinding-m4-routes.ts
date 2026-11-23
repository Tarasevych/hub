/** Маршрути багатооблікових підключень Хмари M4 у межах ladePoort('cloud', ...).
 * Керуються прапорцем cloud-m4-koppelingen-v1 у БД із резервною сумісністю з CLOUD_M4_CONNECTIONS_STAGING.
 * За відсутності серверних ключів повертають чесний структурований стан готовності двома мовами.
 * Meerdere cloudkoppelingen (M4) achter ladePoort('cloud') en functievlag cloud-m4-koppelingen-v1.
 */
import {json,error} from '../server/platform';
import {ladeOf} from './ruimte-cloud-agenda';
import {CloudConnectionError,CloudConnectionManager,type CloudPrincipal,type OAuthProvider,type ConnectionMode}from'./cloud-verbinding-m4';
import {LiveOAuthProviders}from'./cloud-verbinding-m4-providers';
import {PostgresCloudConnections}from'./cloud-verbinding-m4-pg';
import {cloudOAuthM4Config}from'./cloud-verbinding-m4-config';
import {assertCloudProviderEnabled}from'./cloud-m6-aanbieder-gate';
import {CloudTransportError}from'./cloud-overdracht-adapters';
import {cloudVlagAan}from'./cloud-vlaggen-poort';
const allowed=new Set(['onedrive-personal','onedrive-business','sharepoint','dropbox','box']);
const enabled=()=>process.env.CLOUD_M4_CONNECTIONS_STAGING==='enabled';
const sleutelGereed=()=>{
 const raw=String(process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1||'').trim();
 if(/^[a-f0-9]{64}$/i.test(raw))return true;
 if(/^[A-Za-z0-9_-]{43,44}$/.test(raw)){try{return Buffer.from(raw,'base64url').length===32;}catch{return false;}}
 return false;
};
const UITLEG_NIET_GEREED:Readonly<Record<string,{uk:string;nl:string}>>={
 CLOUD_M4_ENCRYPTION_KEY_MISSING:{
  uk:'Потребує налаштування ключа шифрування власника сервера (CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1).',
  nl:'Vereist instelling van de versleutelingssleutel door de servereigenaar (CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1).',
 },
 CLOUD_OAUTH_CALLBACK_NOT_CONFIGURED:{
  uk:'Потребує налаштування зворотної адреси OAuth власником сервера (CLOUD_OAUTH_M4_REDIRECT_URI).',
  nl:'Vereist instelling van het OAuth-terugkeeradres door de servereigenaar (CLOUD_OAUTH_M4_REDIRECT_URI).',
 },
 CLOUD_OAUTH_CALLBACK_NOT_ALLOWLISTED:{
  uk:'Зворотна адреса OAuth не входить до дозволеного переліку доменів сервера.',
  nl:'Het OAuth-terugkeeradres staat niet op de toegestane domeinlijst van de server.',
 },
 CLOUD_OAUTH_PROVIDER_NOT_CONFIGURED:{
  uk:'Потребує налаштування ключів застосунку постачальника власником сервера.',
  nl:'Vereist instelling van de aanbiedersleutels door de eigenaar van de server.',
 },
 CLOUD_M6_PROVIDER_POLICY_DISABLED:{
  uk:'Підключення цього постачальника наразі вимкнене політикою безпеки власника сайту.',
  nl:'Koppeling van deze aanbieder staat momenteel uit volgens het beveiligingsbeleid van de eigenaar.',
 },
 CLOUD_M6_PROVIDER_LIVE_PROOF_MISSING:{
  uk:'Постачальник очікує підписаного підтвердження перевірки власником сайту.',
  nl:'Deze aanbieder wacht op ondertekend verificatiebewijs van de site-eigenaar.',
 },
};
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
async function poortOpen(authorize:Authorize,ctx:Context):Promise<{open:boolean;principal:CloudPrincipal|null}>{
 if(enabled()){return{open:true,principal:await bound(authorize,ctx)};}
 if(await cloudVlagAan('cloud-m4-koppelingen-v1')){return{open:true,principal:await bound(authorize,ctx)};}
 const principal=await bound(authorize,ctx);
 if(principal&&await cloudVlagAan('cloud-m4-koppelingen-v1',principal.owner))return{open:true,principal};
 return{open:false,principal};
}
function caught(e:unknown){
 if(e instanceof CloudConnectionError||e instanceof CloudTransportError){
  const uitleg=UITLEG_NIET_GEREED[e.code];
  if(uitleg)return json({error:e.code,gereed:false,uitleg},e.status);
  return error(e.code,e.status);
 }
 return error('CLOUD_CONNECTION_INTERNAL_ERROR',502);
}
const returnToCloud=(state:'ok'|'failed',code:string)=>({statusCode:303,
 headers:{Location:`https://cloud.tarasevych.com/overzicht?cloud_auth=${state}&reason=${encodeURIComponent(code.slice(0,90))}`,
  'Cache-Control':'no-store','Referrer-Policy':'no-referrer'},body:''});
export function createM4CloudRoutes(authorize:Authorize){return{
 'POST /api/owner/cloud/integrations/v1/accounts/list':[async(ctx:Context)=>{
  const {open,principal}=await poortOpen(authorize,ctx);
  if(!open)return error('CLOUD_M4_NOT_RELEASED',404);
  if(!principal)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  const versleutelingGereed=sleutelGereed();
  try{
   const accounts=await manager.list(principal);
   return json({
    schema:'cloud-accounts-m4',
    accounts,
    gereed:versleutelingGereed,
    gereedheid:{
     versleutelingAanwezig:versleutelingGereed,
     ...(versleutelingGereed?{}:{uitleg:UITLEG_NIET_GEREED.CLOUD_M4_ENCRYPTION_KEY_MISSING}),
    },
    release:'ACTIEF',
   });
  }catch(e){
   if(e instanceof CloudConnectionError||e instanceof CloudTransportError)return caught(e);
   return json({
    schema:'cloud-accounts-m4',
    accounts:[],
    gereed:false,
    gereedheid:{versleutelingAanwezig:versleutelingGereed,uitleg:UITLEG_NIET_GEREED.CLOUD_M4_ENCRYPTION_KEY_MISSING},
    release:'ACTIEF',
   });
  }
 }],
 'POST /api/owner/cloud/integrations/v1/accounts/start':[async(ctx:Context)=>{
  const {open,principal}=await poortOpen(authorize,ctx);
  if(!open)return error('CLOUD_M4_NOT_RELEASED',404);
  if(!principal)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  const body=fromBody(ctx.body);const provider=body.provider,mode=body.mode;
  if(typeof provider!=='string'||!allowed.has(provider)||!['read','write'].includes(String(mode)))return error('CLOUD_PROVIDER_OR_MODE_INVALID',400);
  if(!sleutelGereed())return json({error:'CLOUD_M4_ENCRYPTION_KEY_MISSING',gereed:false,uitleg:UITLEG_NIET_GEREED.CLOUD_M4_ENCRYPTION_KEY_MISSING},503);
  try{await assertCloudProviderEnabled(provider,'connect');
   return json({schema:'cloud-consent-m4',...await manager.start(principal,provider as OAuthProvider,mode as ConnectionMode)});}
  catch(e){return caught(e);}
 }],
 'GET /api/owner/cloud/oauth/m4/callback':[async(ctx:Context)=>{
  const {open,principal}=await poortOpen(authorize,ctx);
  if(!open)return error('CLOUD_M4_NOT_RELEASED',404);
  if(!principal)return returnToCloud('failed','OWNER_CLOUD_SESSION_REQUIRED');
  if(ctx.query?.error)return returnToCloud('failed','PROVIDER_CONSENT_CANCELLED');
  try{await manager.complete(principal,safeQuery(ctx.query?.state,200),safeQuery(ctx.query?.code,4096));
   return returnToCloud('ok','ACCOUNT_CONNECTED');}
  catch(e){return returnToCloud('failed',e instanceof CloudConnectionError?e.code:'CLOUD_CALLBACK_FAILED');}
 }],
 'POST /api/owner/cloud/integrations/v1/accounts/:id/rename':[async(ctx:Context)=>{
  const {open,principal}=await poortOpen(authorize,ctx);
  if(!open)return error('CLOUD_M4_NOT_RELEASED',404);
  if(!principal)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  try{const label=fromBody(ctx.body).label;
   return json({schema:'cloud-account-m4',account:await manager.rename(principal,safeQuery(ctx.params.id,100),String(label??''))});}
  catch(e){return caught(e);}
 }],
 'POST /api/owner/cloud/integrations/v1/accounts/:id/disconnect':[async(ctx:Context)=>{
  const {open,principal}=await poortOpen(authorize,ctx);
  if(!open)return error('CLOUD_M4_NOT_RELEASED',404);
  if(!principal)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  const b=fromBody(ctx.body);if(b.confirm!==true)return error('CLOUD_DISCONNECT_EXPLICIT_CONFIRMATION_REQUIRED',400);
  try{return json({schema:'cloud-disconnect-m4',...await manager.disconnect(principal,safeQuery(ctx.params.id,100))});}
  catch(e){return caught(e);}
 }]
};}
