/**
 * Cloud Integration API · server gated and READ-ONLY in this milestone.
 * No transfer execution endpoint is registered: new Cloud UI remains disabled.
 * The parent createCloudRoutes() wraps these routes in ladePoort('cloud', ...).
 */
import { error, json } from '../server/platform';
import { ladeOf, ruimteKop } from './ruimte-cloud-agenda';
import { googleSuiteDriveProviderSnapshot } from './google-suite-inrichting';
import { CloudIntegratieFout } from './cloud-integratie-google';
import { cloudIntegratieRegister } from './cloud-integratie-register';
import { CloudAdapterNietBeschikbaar } from '../shared/cloud-aanbieder-register';
import { beoordeelOverdracht, geenSteun, providerStatus, veiligVoorCloudImport,
  type CloudAanbieder, type CloudOverdrachtVerzoek } from '../shared/cloud-integratie-contract';

type CloudUser = {id:string;email:string;status:string};
type Auth = {service:string;user:CloudUser}|{errorCode:string};
type Authorize=(event:Record<string,unknown>,body:unknown)=>Promise<Auth>;
type Context={event:Record<string,unknown>;body:unknown;params:Record<string,string>};
const str=(x:unknown,max=300)=>typeof x==='string'?x.trim().slice(0,max):'';
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const ALL_PROVIDERS:CloudAanbieder[]=['cloud-native','google-drive','onedrive-personal','onedrive-business','sharepoint','dropbox','nextcloud','box','github','s3','local'];
const STAGED_IMPLEMENTED=new Set<CloudAanbieder>(['cloud-native','google-drive']);
function statusFromError(caught:unknown){
 if(caught instanceof CloudIntegratieFout)return error(caught.code,caught.status);
 if(caught instanceof CloudAdapterNietBeschikbaar)return error(caught.code,403);
 return error('CLOUD_INTEGRATION_REQUEST_FAILED',502);
}
const authOf=async(authorize:Authorize,ctx:Context)=>{
 const auth=await authorize(ctx.event,ctx.body);
 return 'errorCode' in auth||auth.service!=='cloud'||auth.user.status!=='approved'?null:auth;
};
export function createCloudIntegratieRoutes(authorize:Authorize){return {
 'POST /api/owner/cloud/integrations/v1/status':[async(ctx:Context)=>{
   const auth=await authOf(authorize,ctx);
   if(!auth)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
   const snap=await googleSuiteDriveProviderSnapshot(auth.user.id) as Array<{id:string;accounts:Array<{status:string}>}>;
   const connected=Boolean(snap.find(p=>p.id==='google')?.accounts.some(a=>a.status==='connected'));
   return json({schema:'cloud-integration-v1',releaseGate:'BLOCKED_PENDING_FULL_PROVIDER_ACCEPTANCE',ruimte:ruimteKop('cloud'),
     providers:ALL_PROVIDERS.map(id=>providerStatus(id,id==='cloud-native'||id==='google-drive'&&connected,STAGED_IMPLEMENTED.has(id))),
     implemented:{cloudNative:'existing_captures_max_6_mib',googleDrive:'existing_browser_operations_plus_live_capabilities_probe'},
     disabled:['cross-provider-transfer-execution','unified-sharing-gateway','new-cloud-ui'],
     noSyntheticData:true});
 }],
 'POST /api/owner/cloud/integrations/v1/google/file/capabilities':[async(ctx:Context)=>{
   const auth=await authOf(authorize,ctx);
   if(!auth)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
   const body=obj(ctx.body),accountId=str(body.accountId),fileId=str(body.fileId);
   if(!accountId||!fileId)return error('CLOUD_RESOURCE_REF_REQUIRED',400);
   try{return json(await cloudIntegratieRegister.inspect({ownerUserId:auth.user.id,ruimte:ladeOf(auth.user.id).ruimte},{aanbieder:'google-drive',accountId,bestandId:fileId,ruimte:ladeOf(auth.user.id).ruimte}));}
   catch(caught){return statusFromError(caught);}
 }],
 'POST /api/owner/cloud/integrations/v1/transfer/plan':[async(ctx:Context)=>{
   const auth=await authOf(authorize,ctx);
   if(!auth)return error('OWNER_CLOUD_SESSION_REQUIRED',403);
   const body=obj(ctx.body),raw=obj(body.source),dst=obj(body.target),mode=body.mode;
   if(mode!=='copy'&&mode!=='move')return error('CLOUD_TRANSFER_MODE_INVALID',400);
   const space=ladeOf(auth.user.id).ruimte;
   if(raw.provider!=='google-drive'||dst.provider!=='cloud-native')return error('CLOUD_TRANSFER_PAIR_NOT_IMPLEMENTED',409);
   if(raw.space!==space||dst.space!==space||str(dst.accountId)!=='own')return error('CLOUD_TRANSFER_SPACE_OR_TARGET_INVALID',403);
   const accountId=str(raw.accountId),fileId=str(raw.fileId);
   if(!accountId||!fileId)return error('CLOUD_RESOURCE_REF_REQUIRED',400);
   try {
     const live=await cloudIntegratieRegister.inspect({ownerUserId:auth.user.id,ruimte:space},{aanbieder:'google-drive',accountId,bestandId:fileId,ruimte:space});
     const input:CloudOverdrachtVerzoek={mode,bron:live.bron,doel:{aanbieder:'cloud-native',accountId:'own',ruimte:space}};
     const size=live.bestand.grootte;
     const compatible=!live.bestand.isMap&&veiligVoorCloudImport(live.bestand.mimeType,size);
     const plan=beoordeelOverdracht(input,{bronLezen:live.acties.read,doelSchrijven:compatible?
       {kind:'native',enabled:true,technique:'cloud_native_capture'}:geenSteun('CLOUD_NATIVE_IMPORT_LIMIT_OR_TYPE'),
       sourceLive:true,targetLive:true,authenticatedSameOwnerAndSpace:true,userConfirmedMove:body.confirmDelete===true,
       resourceCompatible:compatible,executorReady:false});
     return json({schema:'cloud-transfer-plan-v1',plan,source:live.bron,
       target:{provider:'cloud-native',accountId:'own',space},sizeBytes:size,mimeType:live.bestand.mimeType,
       sourceRevision:live.bestand.revisie,readOnly:true,executionRoute:null});
   } catch(caught){return statusFromError(caught);}
 }]
};}
