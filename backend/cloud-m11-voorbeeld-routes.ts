/** Маршрут захищеного попереднього перегляду файлів M11 без збереження у проміжних сховищах і з перевіркою версії файла.
 * Beveiligde voorbeeldweergave (M11) met no-store en exacte revisiecontrole per ruimte.
 */
import {error} from '../server/platform';
import {ladeOf} from './ruimte-cloud-agenda';
import {CloudTransportError} from './cloud-overdracht-adapters';
import type {CloudM11PreviewService,PreviewRequest} from './cloud-m11-voorbeeld';
import {ensureM11PreviewRuntime} from './cloud-m10-runtime';
import {cloudVlagAan} from './cloud-vlaggen-poort';
type Auth={service:string;user:{id:string;status:string}}|{errorCode:string};
type Authorize=(event:Record<string,unknown>,body:unknown)=>Promise<Auth>;
type Ctx={event:Record<string,unknown>;body:unknown;params:Record<string,string>};
const enabled=()=>process.env.CLOUD_M11_PREVIEW_STAGING==='enabled'&&process.env.CLOUD_M8_DIRECTORY_STAGING==='enabled';
const runtimeEnv=()=>process.env.CLOUD_M10_STAGING_RUNTIME==='enabled';
function payload(value:unknown):PreviewRequest|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const x=value as Record<string,unknown>;
 if(typeof x.accountId!=='string'||typeof x.fileId!=='string'||typeof x.expectedRevision!=='string')return null;
 return {accountId:x.accountId,fileId:x.fileId,expectedRevision:x.expectedRevision};
}
export function createM11CloudPreviewRoutes(authorize:Authorize,runtime?:CloudM11PreviewService){return{
 'POST /api/owner/cloud/integrations/v1/files/preview':[async(ctx:Ctx)=>{
  const auth=await authorize(ctx.event,ctx.body);
  const uid=!('errorCode'in auth)&&auth.user?.id?auth.user.id:undefined;
  const m11Aan=process.env.CLOUD_M11_PREVIEW_STAGING==='enabled'||await cloudVlagAan('cloud-m11-voorbeeld-v1',uid);
  const m8Aan=process.env.CLOUD_M8_DIRECTORY_STAGING==='enabled'||await cloudVlagAan('cloud-m8-mappen-v1',uid);
  const omgAan=Boolean(runtime)||runtimeEnv()||await cloudVlagAan('cloud-m10-omgeving-v1',uid);
  if(!(enabled()&&Boolean(runtime))&&!(m11Aan&&m8Aan&&omgAan))return error('CLOUD_M11_PREVIEW_NOT_RELEASED',404);
  if('errorCode'in auth||auth.service!=='cloud'||auth.user.status!=='approved')return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  const input=payload(ctx.body);if(!input)return error('CLOUD_PREVIEW_REQUEST_INVALID',400);
  const svc=runtime??ensureM11PreviewRuntime();
  try{
   const result=await svc.read({owner:auth.user.id,space:ladeOf(auth.user.id).ruimte},input);
   return {statusCode:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, max-age=0',
    'Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'},
    body:JSON.stringify({schema:'cloud-preview-m11',...result})};
  }catch(e){if(e instanceof CloudTransportError)return error(e.code,e.status);return error('CLOUD_PREVIEW_INTERNAL_FAILURE',503);}
 }]
};}
