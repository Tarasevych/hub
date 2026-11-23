/** Внутрішній маршрут каталогу готовності постачальників Хмари M5 за воротами ladePoort('cloud').
 * Керується прапорцем cloud-m5-catalogus-v1 у БД із резервною сумісністю з CLOUD_M5_CATALOGUE_STAGING.
 * Besloten catalogusroute voor cloudaanbieders (M5) achter ladePoort('cloud').
 */
import {json,error} from '../server/platform';
import {CLOUD_M5_BLUEPRINTS,resolveProviderReadiness,type ProviderReadiness} from '../shared/cloud-m5-catalogus';
import {cloudVlagAan} from './cloud-vlaggen-poort';
type Auth={service:string;user:{id:string;status:string}}|{errorCode:string};
type Authorize=(event:Record<string,unknown>,body:unknown)=>Promise<Auth>;
type Context={event:Record<string,unknown>;body:unknown};
const approvedReadiness:readonly ProviderReadiness[]=[];
export function createM5ProviderCatalogueRoutes(authorize:Authorize){return {
 'POST /api/owner/cloud/integrations/v1/catalogue':[async(ctx:Context)=>{
  const envAan=process.env.CLOUD_M5_CATALOGUE_STAGING==='enabled';
  const session=await authorize(ctx.event,ctx.body);
  const uid=!('errorCode' in session)&&session.user?.id?session.user.id:undefined;
  if(!envAan&&!(await cloudVlagAan('cloud-m5-catalogus-v1',uid)))return error('CLOUD_M5_NOT_RELEASED',404);
  if('errorCode' in session||session.service!=='cloud'||session.user.status!=='approved')return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  const data=CLOUD_M5_BLUEPRINTS.map(p=>resolveProviderReadiness(p.id,approvedReadiness));
  return json({schema:'cloud-provider-catalogue-m5',release:'ACTIEF',count:data.length,providers:data,allReady:data.every(p=>p.ready)});
 }]
};}
