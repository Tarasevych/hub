/** Private Cloud catalog endpoint. Nothing can be activated here.
 * The platform-wide access gate is ladePoort('cloud') in cloud-platform.ts.
 * Exact live evidence must later come from trusted CI/real provider probes,
 * never from a browser-controlled status, query or importable JSON file.
 */
import {json,error} from '../server/platform';
import {CLOUD_M5_BLUEPRINTS,resolveProviderReadiness,type ProviderReadiness} from '../shared/cloud-m5-catalogus';
type Auth={service:string;user:{id:string;status:string}}|{errorCode:string};
type Authorize=(event:Record<string,unknown>,body:unknown)=>Promise<Auth>;
type Context={event:Record<string,unknown>;body:unknown};
// Explicitly NO runtime-injected evidence until CI attestation and provider probing exist.
const approvedReadiness:readonly ProviderReadiness[]=[];
export function createM5ProviderCatalogueRoutes(authorize:Authorize){return {
 'POST /api/owner/cloud/integrations/v1/catalogue':[async(ctx:Context)=>{
  if(process.env.CLOUD_M5_CATALOGUE_STAGING!=='enabled')return error('CLOUD_M5_NOT_RELEASED',404);
  const session=await authorize(ctx.event,ctx.body);
  if('errorCode' in session||session.service!=='cloud'||session.user.status!=='approved')return error('OWNER_CLOUD_SESSION_REQUIRED',403);
  const data=CLOUD_M5_BLUEPRINTS.map(p=>resolveProviderReadiness(p.id,approvedReadiness));
  return json({schema:'cloud-provider-catalogue-m5',release:'STAGING_ONLY',count:data.length,providers:data,allReady:data.every(p=>p.ready)});
 }]
};}
