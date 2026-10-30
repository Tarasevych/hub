import { CloudProviderRegister } from '../shared/cloud-aanbieder-register';
import { googleDriveLiveMogelijkheden } from './cloud-integratie-google';
/** Read-only live metadata integration in milestone 1. No fake adapters for unsupported services. */
export const cloudIntegratieRegister=new CloudProviderRegister().register({
  provider:'google-drive',
  inspectFile:(ctx,ref)=>googleDriveLiveMogelijkheden(ctx.ownerUserId,ctx.ruimte,ref.accountId,ref.bestandId)
});
