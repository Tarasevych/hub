/** Provider SDK contracts. No provider is marked usable merely because it has a logo/config row. */
import type { CloudAanbieder, CloudBestandRef, CloudMogelijkhedenAntwoord, CloudRuimte } from './cloud-integratie-contract';
export type CloudAanbiederContext = {ownerUserId:string; ruimte:CloudRuimte};
export type CloudProviderAdapter = {
  provider:CloudAanbieder;
  inspectFile(ctx:CloudAanbiederContext, ref:CloudBestandRef):Promise<CloudMogelijkhedenAntwoord>;
};
export class CloudAdapterNietBeschikbaar extends Error {
  readonly code:string;
  constructor(code:string){super(code);this.code=code;this.name='CloudAdapterNietBeschikbaar';}
}
/** Registry is server-side only. UI receives no token, original provider URL or trusted capability flag. */
export class CloudProviderRegister {
  private readonly adapters=new Map<CloudAanbieder,CloudProviderAdapter>();
  register(adapter:CloudProviderAdapter) {
    if(this.adapters.has(adapter.provider))throw new CloudAdapterNietBeschikbaar('CLOUD_PROVIDER_DUPLICATE');
    this.adapters.set(adapter.provider,adapter);
    return this;
  }
  implemented(provider:CloudAanbieder){return this.adapters.has(provider);}
  async inspect(ctx:CloudAanbiederContext,ref:CloudBestandRef){
    if(ref.ruimte!==ctx.ruimte)throw new CloudAdapterNietBeschikbaar('CLOUD_SPACE_MISMATCH');
    const adapter=this.adapters.get(ref.aanbieder);
    if(!adapter)throw new CloudAdapterNietBeschikbaar('CLOUD_PROVIDER_NOT_IMPLEMENTED');
    // The adapter MUST independently resolve account grants and resource ACLs on every call.
    return adapter.inspectFile(ctx,ref);
  }
}
