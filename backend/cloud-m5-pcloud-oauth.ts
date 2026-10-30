/** pCloud code-flow onboarding. Not registered in live router until secure vault
 * and server-only callback endpoint pass integration tests.
 * Unlike other OAuth providers, pCloud currently returns a long-lived bearer
 * without a standard refresh_token. Never assume refresh_token support.
 */
import {randomBytes,createHash} from 'node:crypto';
import {CloudTransportError} from './cloud-overdracht-adapters';
export type PCloudPending={stateHash:string;owner:string;space:'prive'|'technisch';mode:'read'|'write';created:number};
export type PCloudActive={owner:string;space:'prive'|'technisch';subject:string;apiHost:'api.pcloud.com'|'eapi.pcloud.com';token:string;mode:'read'|'write'};
export type PCloudFlowRepository={save(flow:PCloudPending):Promise<void>;consume(stateHash:string):Promise<PCloudPending|null>;
 upsertEncrypted(entry:PCloudActive):Promise<{accountId:string}>};
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
function approvedHost(host:string,locationid:string):'api.pcloud.com'|'eapi.pcloud.com'{
 if(host==='api.pcloud.com'&&locationid==='1')return host;
 if(host==='eapi.pcloud.com'&&locationid==='2')return host;
 throw new CloudTransportError('CLOUD_PCLOUD_REGION_CALLBACK_INVALID',403);
}
export class PCloudOAuthM5{
 constructor(private readonly repo:PCloudFlowRepository,private readonly config:{clientId:string;clientSecret:string;redirectUri:string},private readonly req:typeof fetch=fetch,private readonly now:()=>number=Date.now){}
 async start(p:{owner:string;space:'prive'|'technisch'},mode:'read'|'write'){
  if(!p.owner||!/^[A-Za-z0-9:_-]{1,200}$/.test(p.owner)||!['prive','technisch'].includes(p.space)||!['read','write'].includes(mode))throw new CloudTransportError('CLOUD_PCLOUD_OWNER_INVALID',403);
  if(!/^https:\/\/(?:api|cloud)\.tarasevych\.com\/api\/owner\/cloud\//.test(this.config.redirectUri)||!this.config.clientId)throw new CloudTransportError('CLOUD_PCLOUD_REDIRECT_NOT_CONFIGURED',503);
  const state=randomBytes(40).toString('base64url');await this.repo.save({stateHash:sha(state),owner:p.owner,space:p.space,mode,created:this.now()});
  const q=new URLSearchParams({client_id:this.config.clientId,response_type:'code',redirect_uri:this.config.redirectUri,state});
  const url='https://my.pcloud.com/oauth2/authorize?'+q.toString();return{url,expiresAt:this.now()+600_000};
 }
 async complete(p:{owner:string;space:'prive'|'technisch'},callback:{state:string;code:string;hostname:string;locationid:string}){
  if(!/^[a-zA-Z0-9_-]{30,150}$/.test(callback.state)||!callback.code||callback.code.length>5000)throw new CloudTransportError('CLOUD_PCLOUD_OAUTH_CALLBACK_INVALID',400);
  // Consume-before-exchange prevents replay regardless of upstream outcome.
  const flow=await this.repo.consume(sha(callback.state));
  if(!flow||flow.owner!==p.owner||flow.space!==p.space||this.now()-flow.created>600_000||this.now()<flow.created)
   throw new CloudTransportError('CLOUD_PCLOUD_OAUTH_STATE_INVALID',403);
  const host=approvedHost(callback.hostname,callback.locationid);
  const form=new URLSearchParams({client_id:this.config.clientId,client_secret:this.config.clientSecret,code:callback.code});
  const tokenResponse=await this.req('https://'+host+'/oauth2_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form,redirect:'error'});
  if(!tokenResponse.ok)throw new CloudTransportError('CLOUD_PCLOUD_OAUTH_EXCHANGE_FAILED',502);
  const payload=await tokenResponse.json() as {result?:number;access_token?:string;uid?:number;token_type?:string};
  if(payload.result!==0||!payload.access_token||payload.access_token.length>8192||payload.token_type!=='bearer'||!Number.isSafeInteger(payload.uid)||payload.uid!<=0)
   throw new CloudTransportError('CLOUD_PCLOUD_OAUTH_TOKEN_INVALID',502);
  // Server-side vault MUST encrypt token before accepting this grant.
  return this.repo.upsertEncrypted({owner:p.owner,space:p.space,subject:String(payload.uid),apiHost:host,token:payload.access_token,mode:flow.mode});
 }
}
