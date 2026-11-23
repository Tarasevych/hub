/** Єдині маршрути перегляду тек M8 у межах ladePoort('cloud') у cloud-platform.ts.
 * Керуються прапорцями cloud-m8-mappen-v1 та cloud-m10-omgeving-v1 із збереженням сумісності зі змінними середовища.
 * Жодні маркери доступу чи службові посилання постачальників ніколи не повертаються до оглядача.
 * Uniforme mappenroutes (M8) achter ladePoort('cloud') en vlaggen cloud-m8-mappen-v1 / cloud-m10-omgeving-v1.
 */
import {json,error} from '../server/platform';
import {ladeOf} from './ruimte-cloud-agenda';
import {CloudTransportError} from './cloud-overdracht-adapters';
import type {CloudMultiAccountWorkspace,ClientDirectoryRequest,Viewer} from './cloud-m8-werkruimte';
import {ensureM10DirectoryRuntime} from './cloud-m10-runtime';
import {cloudVlagAan} from './cloud-vlaggen-poort';
type Auth={service:string;user:{id:string;status:string}}|{errorCode:string};
type Authorize=(event:Record<string,unknown>,body:unknown)=>Promise<Auth>;
type Ctx={event:Record<string,unknown>;body:unknown;params:Record<string,string>};
const staging=()=>process.env.CLOUD_M8_DIRECTORY_STAGING==='enabled';
const runtimeEnv=()=>process.env.CLOUD_M10_STAGING_RUNTIME==='enabled';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
function naarViewer(a:Auth):Viewer|null{
 if('errorCode'in a||a.service!=='cloud'||a.user.status!=='approved')return null;
 return{owner:a.user.id,space:ladeOf(a.user.id).ruimte};
}
function problem(e:unknown){if(e instanceof CloudTransportError)return error(e.code,e.status);return error('CLOUD_M8_DIRECTORY_UNAVAILABLE',503);}
export function createM8CloudRoutes(authorize:Authorize,runtime?:CloudMultiAccountWorkspace){
 async function bereidVoor(ctx:Ctx):Promise<{actief:boolean;user:Viewer|null;ws:CloudMultiAccountWorkspace|undefined}>{
  const a=await authorize(ctx.event,ctx.body);
  const uid=!('errorCode'in a)&&a.user?.id?a.user.id:undefined;
  const m8Aan=staging()||await cloudVlagAan('cloud-m8-mappen-v1',uid);
  if(!m8Aan)return{actief:false,user:null,ws:undefined};
  if(runtime)return{actief:true,user:naarViewer(a),ws:runtime};
  const omgAan=runtimeEnv()||await cloudVlagAan('cloud-m10-omgeving-v1',uid);
  if(!omgAan)return{actief:false,user:null,ws:undefined};
  return{actief:true,user:naarViewer(a),ws:ensureM10DirectoryRuntime()};
 }
 return{
  'POST /api/owner/cloud/integrations/v1/directory/list':[async(ctx:Ctx)=>{
   const {actief,user,ws}=await bereidVoor(ctx);
   if(!actief||!ws)return error('CLOUD_M8_NOT_RELEASED',404);
   if(!user)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
   const b=object(ctx.body);
   if(typeof b.accountId!=='string'||typeof b.folderId!=='string'||b.cursor!=null&&typeof b.cursor!=='string')return error('CLOUD_M8_REQUEST_INVALID',400);
   try{return json({schema:'cloud-directory-m8',release:'ACTIEF',...await ws.list(user,b as ClientDirectoryRequest)});}
   catch(e){return problem(e);}
  }],
  'POST /api/owner/cloud/integrations/v1/directory/batch':[async(ctx:Ctx)=>{
   const {actief,user,ws}=await bereidVoor(ctx);
   if(!actief||!ws)return error('CLOUD_M8_NOT_RELEASED',404);
   if(!user)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
   const b=object(ctx.body);
   if(!Array.isArray(b.requests)||b.requests.length>8||b.requests.some(x=>!x||typeof x!=='object'||typeof x.accountId!=='string'||typeof x.folderId!=='string'||x.cursor!=null&&typeof x.cursor!=='string'))
    return error('CLOUD_M8_BATCH_INVALID',400);
   try{return json({schema:'cloud-directory-batch-m8',release:'ACTIEF',results:await ws.across(user,b.requests as ClientDirectoryRequest[])});}
   catch(e){return problem(e);}
  }]
 };
}
