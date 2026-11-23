/** Маршрути політик керування постачальниками Хмари M6 за воротами ladePoort('cloud').
 * Повноваження власника та активної технічної вкладки перевіряються виключно на сервері.
 * Beheerroutes voor cloudaanbieders (M6) achter ladePoort('cloud') en vlag cloud-m6-beheer-v1.
 */
import {json,error} from '../server/platform';
import {getPool} from '../server/platform/pg';
import {isEigenaar,actieveActivatie,TAB_RE} from './tech-profiel';
import {CloudTransportError} from './cloud-overdracht-adapters';
import {FIRST_WAVE_PROVIDERS,type WaveOneProvider} from '../shared/cloud-m5-catalogus';
import {CloudM5Governor} from './cloud-m5-governor';
import {PostgresCloudProviderPolicies,postgresCiVerifier} from './cloud-m6-bestuur-pg';

type Context={event:Record<string,unknown>;body:unknown;params?:Record<string,string>};
type Auth={service:string;user:{id:string;email?:string;status:string;role?:string}}|{errorCode:string};
type Authorize=(event:Record<string,unknown>,body:unknown)=>Promise<Auth>;
export type AdminDeps={
 liveOwner:(id:string)=>Promise<{id:string;email?:string;role?:string}|null>;
 technicalTabActive:(id:string,tab:string)=>Promise<boolean>;
 governor:Pick<CloudM5Governor,'status'|'set'>;
};
const defaults=():AdminDeps=>({
 async liveOwner(id){
  const {rows}=await getPool('systeem').query<{data:{role?:string;email?:string}}>("SELECT data FROM app.records WHERE tbl='users' AND id=$1 LIMIT 1",[id]);
  return rows[0]?{id,email:String(rows[0].data.email||''),role:String(rows[0].data.role||'')}:null;
 },
 async technicalTabActive(id,tab){return Boolean(await actieveActivatie(id,tab));},
 governor:new CloudM5Governor(new PostgresCloudProviderPolicies(),postgresCiVerifier)
});
const bodyObject=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const staging=()=>process.env.CLOUD_M6_ADMIN_STAGING==='enabled';
async function m6VlagAan(userId?:string):Promise<boolean>{
 if(staging())return true;
 try{
  const {berekenen}=await import('./vlaggen');
  const id=typeof userId==='string'&&userId.trim()?userId.trim():'__cloud_poort__';
  return (await berekenen({id} as never,['cloud-m6-beheer-v1']))[0]?.value===true;
 }catch{return false;}
}
function caught(e:unknown){if(e instanceof CloudTransportError)return error(e.code,e.status);return error('CLOUD_M6_ADMIN_UNAVAILABLE',503);}
export function createCloudM6AdminRoutes(authorize:Authorize,deps:AdminDeps=defaults()){
 async function poort(ctx:Context):Promise<{open:boolean;voorafAuth?:Auth}>{
  if(await m6VlagAan())return{open:true};
  const auth=await authorize(ctx.event,ctx.body);
  if(!('errorCode' in auth)&&auth.user?.id&&await m6VlagAan(auth.user.id))return{open:true,voorafAuth:auth};
  return{open:false,voorafAuth:auth};
 }
 async function actor(ctx:Context,vorigeAuth?:Auth){
  const auth=vorigeAuth??await authorize(ctx.event,ctx.body);
  if('errorCode' in auth||auth.service!=='cloud'||auth.user.status!=='approved'||!auth.user.id)return null;
  const b=bodyObject(ctx.body),tab=typeof b.tabContext==='string'?b.tabContext:'';
  if(!TAB_RE.test(tab))return null;
  const current=await deps.liveOwner(auth.user.id);
  if(!current||!isEigenaar(current)||!(await deps.technicalTabActive(current.id,tab)))return null;
  return {userId:current.id,isSiteOwner:true,isTechnicalSession:true,reason:''};
 }
 return {
 'POST /api/owner/cloud/integrations/v1/admin/policies/list':[async(ctx:Context)=>{
  const p=await poort(ctx);
  if(!p.open)return error('CLOUD_M6_NOT_RELEASED',404);
  try{if(!await actor(ctx,p.voorafAuth))return error('CLOUD_M6_OWNER_TECH_REQUIRED',403);
   const providers=await Promise.all(FIRST_WAVE_PROVIDERS.map(k=>deps.governor.status(k)));
   return json({schema:'cloud-governance-m6',release:'ACTIEF',providers});
  }catch(e){return caught(e);}
 }],
 'POST /api/owner/cloud/integrations/v1/admin/policies/change':[async(ctx:Context)=>{
  const p=await poort(ctx);
  if(!p.open)return error('CLOUD_M6_NOT_RELEASED',404);
  try{
   const a=await actor(ctx,p.voorafAuth);if(!a)return error('CLOUD_M6_OWNER_TECH_REQUIRED',403);
   const b=bodyObject(ctx.body),provider=b.provider,revision=b.expectedRevision,reason=b.reason;
   if(typeof provider!=='string'||!FIRST_WAVE_PROVIDERS.includes(provider as WaveOneProvider)||
      typeof reason!=='string'||reason.length<8||reason.length>500||/[\u0000-\u001f]/.test(reason)||
      !Number.isSafeInteger(revision)||Number(revision)<0||
      typeof b.allowNewConnections!=='boolean'||typeof b.allowExistingOperations!=='boolean')
    return error('CLOUD_M6_POLICY_REQUEST_INVALID',400);
   const next=await deps.governor.set({...a,reason},provider as WaveOneProvider,Number(revision),
    {allowNewConnections:b.allowNewConnections,allowExistingOperations:b.allowExistingOperations});
   return json({schema:'cloud-governance-m6',policy:next});
  }catch(e){return caught(e);}
 }]
 };
}
