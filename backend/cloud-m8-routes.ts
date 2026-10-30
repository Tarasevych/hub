/** M8 unified directory endpoints. Mounted INSIDE ladePoort('cloud') in cloud-platform.
 * No runtime is registered at build time: unless the verified CI deployment injects
 * the runtime AND enables staging, all routes fail closed with 404.
 * No service token, provider upload URL or credential ever returns to browser.
 */
import {json,error} from '../server/platform';
import {ladeOf} from './ruimte-cloud-agenda';
import {CloudTransportError} from './cloud-overdracht-adapters';
import type {CloudMultiAccountWorkspace,ClientDirectoryRequest,Viewer} from './cloud-m8-werkruimte';
type Auth={service:string;user:{id:string;status:string}}|{errorCode:string};
type Authorize=(event:Record<string,unknown>,body:unknown)=>Promise<Auth>;
type Ctx={event:Record<string,unknown>;body:unknown;params:Record<string,string>};
const staging=()=>process.env.CLOUD_M8_DIRECTORY_STAGING==='enabled';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
async function principal(authorize:Authorize,ctx:Ctx):Promise<Viewer|null>{
 const a=await authorize(ctx.event,ctx.body);
 if('errorCode'in a||a.service!=='cloud'||a.user.status!=='approved')return null;
 return{owner:a.user.id,space:ladeOf(a.user.id).ruimte};
}
function problem(e:unknown){if(e instanceof CloudTransportError)return error(e.code,e.status);return error('CLOUD_M8_DIRECTORY_UNAVAILABLE',503);}
/** The runtime is intentionally INJECTED only by the separately verified staging bootstrap. */
export function createM8CloudRoutes(authorize:Authorize,runtime?:CloudMultiAccountWorkspace){
 return{
  'POST /api/owner/cloud/integrations/v1/directory/list':[async(ctx:Ctx)=>{
   if(!staging()||!runtime)return error('CLOUD_M8_NOT_RELEASED',404);
   const user=await principal(authorize,ctx);if(!user)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
   const b=object(ctx.body);
   if(typeof b.accountId!=='string'||typeof b.folderId!=='string'||b.cursor!=null&&typeof b.cursor!=='string')return error('CLOUD_M8_REQUEST_INVALID',400);
   try{return json({schema:'cloud-directory-m8',release:'STAGING_ONLY',...await runtime.list(user,b as ClientDirectoryRequest)});}
   catch(e){return problem(e);}
  }],
  'POST /api/owner/cloud/integrations/v1/directory/batch':[async(ctx:Ctx)=>{
   if(!staging()||!runtime)return error('CLOUD_M8_NOT_RELEASED',404);
   const user=await principal(authorize,ctx);if(!user)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
   const b=object(ctx.body);
   if(!Array.isArray(b.requests)||b.requests.length>8||b.requests.some(x=>!x||typeof x!=='object'||typeof x.accountId!=='string'||typeof x.folderId!=='string'||x.cursor!=null&&typeof x.cursor!=='string'))
    return error('CLOUD_M8_BATCH_INVALID',400);
   try{return json({schema:'cloud-directory-batch-m8',release:'STAGING_ONLY',results:await runtime.across(user,b.requests as ClientDirectoryRequest[])});}
   catch(e){return problem(e);}
  }]
 };
}
