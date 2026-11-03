/** M10 admin.tarasevych.com Cloud provider governance bridge (staging only).
 * Separate from cloud-lade routes. No user data, token or file content returned.
 * The authenticated session must be for `admin`, current owner from PG,
 * active technical tab, and fresh strong step-up for every modification.
 */
import {error,json} from '../server/platform';
import {getPool} from '../server/platform/pg';
import {isEigenaar,actieveActivatie,TAB_RE} from './tech-profiel';
import {CloudTransportError} from './cloud-overdracht-adapters';
import {CloudM5Governor} from './cloud-m5-governor';
import {PostgresCloudProviderPolicies,postgresCiVerifier} from './cloud-m6-bestuur-pg';
import {FIRST_WAVE_PROVIDERS,type WaveOneProvider} from '../shared/cloud-m5-catalogus';

type Ctx={event:Record<string,unknown>;body:unknown;params?:Record<string,string>};
type Auth={service:string;user:{id:string;status:string;email?:string;role?:string}}|{errorCode:string};
type Authorize=(event:Record<string,unknown>,body:unknown)=>Promise<Auth>;
type StepUp=(ctx:Ctx,auth:Auth)=>Promise<ReturnType<typeof json>|null>;
const governor=new CloudM5Governor(new PostgresCloudProviderPolicies(),postgresCiVerifier);
const object=(b:unknown):Record<string,unknown>=>b&&typeof b==='object'&&!Array.isArray(b)?b as Record<string,unknown>:{};
const enabled=()=>process.env.CLOUD_M10_ADMIN_STAGING==='enabled';
const fail=(e:unknown)=>e instanceof CloudTransportError?error(e.code,e.status):error('CLOUD_M10_ADMIN_UNAVAILABLE',503);
export function createM10CloudAdminRoutes(authorize:Authorize,stepUp:StepUp){
 async function actor(ctx:Ctx):Promise<{auth:Auth;userId:string}|null>{
  const a=await authorize(ctx.event,ctx.body);
  if('errorCode'in a||a.service!=='admin'||a.user.status!=='approved'||!a.user.id)return null;
  const tab=object(ctx.body).tabContext;
  if(typeof tab!=='string'||!TAB_RE.test(tab))return null;
  const r=await getPool('systeem').query<{data:{role?:string;email?:string}}>("SELECT data FROM app.records WHERE tbl='users' AND id=$1 LIMIT 1",[a.user.id]);
  const live=r.rows[0]?.data;
  if(!live||!isEigenaar({id:a.user.id,role:String(live.role||''),email:String(live.email||'')}))return null;
  if(!await actieveActivatie(a.user.id,tab))return null;
  return{auth:a,userId:a.user.id};
 }
 return{
  'POST /api/owner/admin/cloud/providers/list':[async(ctx:Ctx)=>{
   if(!enabled())return error('CLOUD_M10_NOT_RELEASED',404);
   try{if(!await actor(ctx))return error('CLOUD_ADMIN_TECH_OWNER_REQUIRED',403);
    const providers=await Promise.all(FIRST_WAVE_PROVIDERS.map(p=>governor.status(p)));
    return json({schema:'cloud-governance-m6',release:'STAGING_ONLY',providers});
   }catch(e){return fail(e);}
  }],
  'POST /api/owner/admin/cloud/providers/change':[async(ctx:Ctx)=>{
   if(!enabled())return error('CLOUD_M10_NOT_RELEASED',404);
   try{
    const who=await actor(ctx);if(!who)return error('CLOUD_ADMIN_TECH_OWNER_REQUIRED',403);
    const b=object(ctx.body),provider=b.provider,reason=b.reason,rev=b.expectedRevision;
    if(typeof provider!=='string'||!FIRST_WAVE_PROVIDERS.includes(provider as WaveOneProvider)||
       typeof reason!=='string'||reason.trim().length<8||reason.length>500||/[\u0000-\u001f]/.test(reason)||
       !Number.isSafeInteger(rev)||Number(rev)<0||typeof b.allowNewConnections!=='boolean'||typeof b.allowExistingOperations!=='boolean')
      return error('CLOUD_ADMIN_POLICY_INVALID',400);
    const challenged=await stepUp(ctx,who.auth);
    if(challenged)return challenged;
    const policy=await governor.set({userId:who.userId,isSiteOwner:true,isTechnicalSession:true,reason:reason.trim()},
     provider as WaveOneProvider,Number(rev),{allowNewConnections:b.allowNewConnections,allowExistingOperations:b.allowExistingOperations});
    return json({schema:'cloud-governance-m6',policy});
   }catch(e){return fail(e);}
  }]
 };
}
