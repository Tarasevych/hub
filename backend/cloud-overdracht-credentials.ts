/** M2 token broker. Uses existing Google Suite B+ grant; other providers remain fail-closed
 * until their own correctly-scoped encrypted OAuth grants are implemented and authorized.
 * Must be used ONLY with cloud ladePoort session context, never based on a user-supplied space.
 */
import {googleSuiteDriveProviderSnapshot,googleSuitePrincipalAccessToken} from './google-suite-inrichting';
import {ladeOf} from './ruimte-cloud-agenda';
import type {CloudTokenResolver,CloudGrantContext} from './cloud-overdracht-adapters';
import {CloudTransportError} from './cloud-overdracht-adapters';
import {PostgresCloudConnections} from './cloud-verbinding-m4-pg';
import {LiveOAuthProviders} from './cloud-verbinding-m4-providers';
import {CloudMultiAccountTokenBroker} from './cloud-verbinding-m4-token';
import {cloudOAuthM4Config} from './cloud-verbinding-m4-config';
import {assertCloudProviderEnabled} from './cloud-m6-aanbieder-gate';
const m4Broker=new CloudMultiAccountTokenBroker(new PostgresCloudConnections(),new LiveOAuthProviders(),cloudOAuthM4Config);
export const cloudTransportToken:CloudTokenResolver=async(ctx:CloudGrantContext,operation:'read'|'write')=>{
 if(ladeOf(ctx.userId).ruimte!==ctx.space)throw new CloudTransportError('CLOUD_TOKEN_SPACE_MISMATCH',403);
 if(ctx.provider!=='google-drive'){
  if(process.env.CLOUD_M4_CONNECTIONS_STAGING!=='enabled')throw new CloudTransportError('CLOUD_PROVIDER_OAUTH_NOT_CONNECTED',409);
  await assertCloudProviderEnabled(ctx.provider,'operate');
  try{return await m4Broker.forOperation({owner:ctx.userId,space:ctx.space},ctx.accountId,ctx.provider,operation);}
  catch{throw new CloudTransportError('CLOUD_M4_GRANT_UNAVAILABLE_OR_REAUTH_REQUIRED',403);}
 }
 const snap=await googleSuiteDriveProviderSnapshot(ctx.userId) as Array<{id:string;accounts:Array<{id:string;principalId:string;status:string}>}>;
 const account=snap.find(x=>x.id==='google')?.accounts.find(x=>x.id===ctx.accountId&&x.status==='connected');
 if(!account)throw new CloudTransportError('CLOUD_GOOGLE_ACCOUNT_NOT_CONNECTED',403);
 try{return await googleSuitePrincipalAccessToken(ctx.userId,account.principalId,'drive');}
 catch{throw new CloudTransportError('CLOUD_GOOGLE_GRANT_OR_SCOPE_UNAVAILABLE',403);}
};
