/** Staging-only administrator routes, wrapped by the existing Cloud ladePoort.
 * NEVER trust role, technical status, provider evidence or policy state from the browser.
 * Admin controls are NOT wired into public Cloud UI.
 */
import {json,error} from '../server/platform';
import {getPool} from '../server/platform/pg';
import {isEigenaar,actieveActivatie,TAB_RE} from './tech-profiel';
import {CloudTransportError} from './cloud-overdracht-adapters';
import {FIRST_WAVE_PROVIDERS,type WaveOneProvider} from '../shared/cloud-m5-catalogus';
import {CloudM5Governor} from './cloud-m5-governor';
import {PostgresCloudProviderPolicies,postgresCiVerifier} from './cloud-m6-governance-pg';

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
function caught(e:unknown){if(e instanceof CloudTransportError)return error(e.code,e.status);return error('CLOUD_M6_ADMIN_UNAVAILABLE',503);}
export function createCloudM6AdminRoutes(authorize:Authorize,deps:AdminDeps=defaults()){
 async function actor(ctx:Context){
  const auth=await authorize(ctx.event,ctx.body);
  if('errorCode' in auth||auth.service!=='cloud'||auth.user.status!=='approved'||!auth.user.id)return null;
  const b=bodyObject(ctx.body),tab=typeof b.tabContext==='string'?b.tabContext:'';
  if(!TAB_RE.test(tab))return null;
  // A session's email/role in client JSON MUST NOT grant admin access.
  const current=await deps.liveOwner(auth.user.id);
  if(!current||!isEigenaar(current)||!(await deps.technicalTabActive(current.id,tab)))return null;
  return {userId:current.id,isSiteOwner:true,isTechnicalSession:true,reason:''};
 }
 return {
 'POST /api/owner/cloud/integrations/v1/admin/policies/list':[async(ctx:Context)=>{
  if(!staging())return error('CLOUD_M6_NOT_RELEASED',404);
  try{if(!await actor(ctx))return error('CLOUD_M6_OWNER_TECH_REQUIRED',403);
   const providers=await Promise.all(FIRST_WAVE_PROVIDERS.map(p=>deps.governor.status(p)));
   return json({schema:'cloud-governance-m6',release:'STAGING_ONLY',providers});
  }catch(e){return caught(e);}
 }],
 'POST /api/owner/cloud/integrations/v1/admin/policies/change':[async(ctx:Context)=>{
  if(!staging())return error('CLOUD_M6_NOT_RELEASED',404);
  try{
   const a=await actor(ctx);if(!a)return error('CLOUD_M6_OWNER_TECH_REQUIRED',403);
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
