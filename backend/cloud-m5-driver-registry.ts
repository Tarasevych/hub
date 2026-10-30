/** Single server-side access point for Cloud transports. No browser-supplied credentials.
 * Registry registration is guarded by deployment attestation, not by a local flag
 * or by capabilities published in the UI. Once wired, per-request authorization
 * remains mandatory at every transport and credential resolver.
 */
import type {CloudTransport,CloudGrantContext,RemoteLocation} from './cloud-overdracht-adapters';
import {CloudTransportError} from './cloud-overdracht-adapters';
import {FIRST_WAVE_PROVIDERS,type WaveOneProvider} from '../shared/cloud-m5-catalogus';
export type Attestation={provider:WaveOneProvider;buildSha:string;revision:string;authenticatedWithTrustedCI:boolean;liveProviderE2e:boolean};
export type AttestationVerifier=(proof:Attestation)=>Promise<boolean>;
export class CloudM5DriverRegistry{
 private readonly drivers=new Map<WaveOneProvider,CloudTransport>();
 constructor(private readonly verify:AttestationVerifier){}
 async register(provider:WaveOneProvider,driver:CloudTransport,proof:Attestation){
  if(!FIRST_WAVE_PROVIDERS.includes(provider)||driver.provider!==provider||proof.provider!==provider)
   throw new CloudTransportError('CLOUD_M5_DRIVER_PROVIDER_MISMATCH',400);
  if(!proof.authenticatedWithTrustedCI||!proof.liveProviderE2e||!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(proof.buildSha)||
      !(await this.verify(proof)))throw new CloudTransportError('CLOUD_M5_DRIVER_NOT_ATTESTED',403);
  this.drivers.set(provider,driver);
 }
 unregister(provider:WaveOneProvider){this.drivers.delete(provider);}
 available(provider:WaveOneProvider){return this.drivers.has(provider);}
 // Server auth must bind owner+space+connectionId to caller session before entering this method.
 resolve(loc:RemoteLocation,authenticated:CloudGrantContext):CloudTransport{
  if(loc.context.provider!==authenticated.provider||loc.context.userId!==authenticated.userId||
      loc.context.accountId!==authenticated.accountId||loc.context.space!==authenticated.space)
   throw new CloudTransportError('CLOUD_M5_CONTEXT_MISMATCH',403);
  const transport=this.drivers.get(authenticated.provider as WaveOneProvider);
  if(!transport)throw new CloudTransportError('CLOUD_M5_DRIVER_DISABLED',503);
  return transport;
 }
}
