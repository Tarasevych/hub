/** M11 browser route: staging-only, no-store, exact per-account file revision. */
import {error} from '../server/platform';
import {ladeOf} from './ruimte-cloud-agenda';
import {CloudTransportError} from './cloud-overdracht-adapters';
import type {CloudM11PreviewService,PreviewRequest} from './cloud-m11-preview';
type Auth={service:string;user:{id:string;status:string}}|{errorCode:string};
type Authorize=(event:Record<string,unknown>,body:unknown)=>Promise<Auth>;
type Ctx={event:Record<string,unknown>;body:unknown;params:Record<string,string>};
const enabled=()=>process.env.CLOUD_M11_PREVIEW_STAGING==='enabled'&&process.env.CLOUD_M8_DIRECTORY_STAGING==='enabled';
function payload(value:unknown):PreviewRequest|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const x=value as Record<string,unknown>;
 if(typeof x.accountId!=='string'||typeof x.fileId!=='string'||typeof x.expectedRevision!=='string')return null;
 return {accountId:x.accountId,fileId:x.fileId,expectedRevision:x.expectedRevision};
}
export function createM11CloudPreviewRoutes(authorize:Authorize,runtime?:CloudM11PreviewService){return{
 'POST /api/owner/cloud/integrations/v1/files/preview':[async(ctx:Ctx)=>{
  if(!enabled()||!runtime)return error('CLOUD_M11_PREVIEW_NOT_RELEASED',404);
  const auth=await authorize(ctx.event,ctx.body);
  if('errorCode'in auth||auth.service!=='cloud'||auth.user.status!=='approved')return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  const input=payload(ctx.body);if(!input)return error('CLOUD_PREVIEW_REQUEST_INVALID',400);
  try{
   const result=await runtime.read({owner:auth.user.id,space:ladeOf(auth.user.id).ruimte},input);
   return {statusCode:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0',
    'Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'},
    body:JSON.stringify({schema:'cloud-preview-m11',...result})};
  }catch(e){if(e instanceof CloudTransportError)return error(e.code,e.status);return error('CLOUD_PREVIEW_INTERNAL_FAILURE',503);}
 }]
};}
