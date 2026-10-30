/** Platform operator controls. Release approval cannot be manufactured by
 * flipping a UI toggle. Multi-admin rules/audit are delegated to a durable store.
 * This module is not connected to admin routes until actor authorization is proven.
 */
import type {WaveOneProvider} from '../shared/cloud-m5-catalogus';
import {FIRST_WAVE_PROVIDERS} from '../shared/cloud-m5-catalogus';
import {CloudTransportError} from './cloud-overdracht-adapters';
export type OperatorContext={userId:string;isSiteOwner:boolean;isTechnicalSession:boolean;reason:string};
export type ProviderPolicy={provider:WaveOneProvider;allowNewConnections:boolean;allowExistingOperations:boolean;revision:number;updatedBy:string};
export interface ProviderPolicyStore {
 read(provider:WaveOneProvider):Promise<ProviderPolicy|null>;
 // Atomic CAS + append-only audit must happen in ONE transaction.
 changeWithAudit(previous:ProviderPolicy|null,next:ProviderPolicy,reason:string):Promise<boolean>;
}
export type ProviderReleaseVerifier=(provider:WaveOneProvider)=>Promise<boolean>;
export class CloudM5Governor{
 constructor(private readonly store:ProviderPolicyStore,private readonly verified:ProviderReleaseVerifier){}
 private actor(a:OperatorContext){
  if(!a.isSiteOwner||!a.isTechnicalSession||!a.userId||a.reason.trim().length<8)
   throw new CloudTransportError('CLOUD_M5_OWNER_TECH_PROFILE_REQUIRED',403);
 }
 async status(provider:WaveOneProvider){if(!FIRST_WAVE_PROVIDERS.includes(provider))throw new CloudTransportError('CLOUD_M5_PROVIDER_INVALID',400);
  return(await this.store.read(provider))??{provider,allowNewConnections:false,allowExistingOperations:false,revision:0,updatedBy:''};}
 async set(a:OperatorContext,provider:WaveOneProvider,expectedRevision:number,policy:Pick<ProviderPolicy,'allowNewConnections'|'allowExistingOperations'>){
  this.actor(a);
  if(!FIRST_WAVE_PROVIDERS.includes(provider)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
   throw new CloudTransportError('CLOUD_M5_POLICY_REQUEST_INVALID',400);
  const prev=await this.status(provider);if(prev.revision!==expectedRevision)throw new CloudTransportError('CLOUD_M5_POLICY_VERSION_CONFLICT',409);
  if((policy.allowNewConnections||policy.allowExistingOperations)&&!(await this.verified(provider)))
   throw new CloudTransportError('CLOUD_M5_PROVIDER_NOT_ACCEPTED',403);
  const next:ProviderPolicy={provider,allowNewConnections:policy.allowNewConnections===true,
   allowExistingOperations:policy.allowExistingOperations===true,revision:prev.revision+1,updatedBy:a.userId};
  if(!(await this.store.changeWithAudit(prev.revision?prev:null,next,a.reason)))throw new CloudTransportError('CLOUD_M5_POLICY_CONCURRENT_CHANGE',409);
  return next;
 }
}
