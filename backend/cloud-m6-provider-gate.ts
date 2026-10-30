/** Policy guard applied to new Cloud connection starts and transport credential resolution.
 * Provider support is NOT a substitute for consent, file ACL, or signed live acceptance.
 * Disconnect/list MUST remain available while providers are disabled.
 */
import {CloudTransportError} from './cloud-overdracht-adapters';
import {PostgresCloudProviderPolicies,postgresCiVerifier} from './cloud-m6-governance-pg';
import {FIRST_WAVE_PROVIDERS,type WaveOneProvider} from '../shared/cloud-m5-catalogus';
export type PolicyAction='connect'|'operate';
export type ProviderGuardStore={read:(provider:WaveOneProvider)=>Promise<{allowNewConnections:boolean;allowExistingOperations:boolean}|null>};
export async function assertCloudProviderEnabled(provider:string,action:PolicyAction,
 store:ProviderGuardStore=new PostgresCloudProviderPolicies(),verified:(provider:WaveOneProvider)=>Promise<boolean>=postgresCiVerifier){
 if(!FIRST_WAVE_PROVIDERS.includes(provider as WaveOneProvider))throw new CloudTransportError('CLOUD_PROVIDER_UNKNOWN',400);
 const policy=await store.read(provider as WaveOneProvider);
 if(!policy||(action==='connect'?!policy.allowNewConnections:!policy.allowExistingOperations))
  throw new CloudTransportError('CLOUD_M6_PROVIDER_POLICY_DISABLED',403);
 if(!(await verified(provider as WaveOneProvider)))throw new CloudTransportError('CLOUD_M6_PROVIDER_LIVE_PROOF_MISSING',403);
}
