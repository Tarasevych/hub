/** M3 private invitation sharing. No public/anonymous links; provider writes remain
 * DISABLED until reviewed OAuth, live permission preflight, audit store and E2E.
 * An invite can succeed upstream even if local storage fails: no automatic retry.
 */
import{randomUUID}from'node:crypto';
import type{CloudGrantContext,CloudTokenResolver,Fetcher,RemoteLocation}from'./cloud-overdracht-adapters';
import{CloudTransportError}from'./cloud-overdracht-adapters';
export type PrivateRole='viewer'|'editor';
export type ShareInvitation={location:RemoteLocation;email:string;role:PrivateRole;explicitlyConfirmed:boolean};
export type ShareRecord={id:string;owner:string;space:'prive'|'technisch';accountId:string;provider:string;fileId:string;
 recipientEmail:string;role:PrivateRole;providerPermissionId:string;status:'active'|'review'|'revoked';createdAt:string};
export type ShareRepository={save(x:ShareRecord):Promise<void>;getForOwner(id:string,owner:string,space:'prive'|'technisch'):Promise<ShareRecord|null>;
 mark(id:string,owner:string,space:'prive'|'technisch',state:'review'|'revoked'):Promise<void>};
export type VerifiedSharePermission=(loc:RemoteLocation,op:'invite'|'revoke')=>Promise<boolean>;
const validEmail=(v:string)=>typeof v==='string'&&v.length<255&&/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[a-z]{2,}$/i.test(v);
const idOk=(v:string)=>typeof v==='string'&&v.length>0&&v.length<=300&&!/[\r\n\0?#]/.test(v);
const grantOk=(t:string)=>typeof t==='string'&&t.length>5&&t.length<8192&&!/[\r\n\0]/.test(t);
const supported=(p:string)=>['google-drive','onedrive-personal','onedrive-business','sharepoint','box'].includes(p);
function ensure(cond:unknown,code:string,status=403):asserts cond{if(!cond)throw new CloudTransportError(code,status);}
export class CloudPrivateShares{
 constructor(private readonly token:CloudTokenResolver,private readonly permission:VerifiedSharePermission,
  private readonly store:ShareRepository,private readonly request:Fetcher=fetch,
  private readonly driveId?:(c:CloudGrantContext)=>Promise<string>){}
 private async endpoint(loc:RemoteLocation,permissionId?:string){
  const {provider}=loc.context,fileId=loc.fileId;ensure(idOk(fileId),'CLOUD_SHARE_INVALID_FILE',400);
  switch(provider){
  case'google-drive':return`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions${permissionId?'/'+encodeURIComponent(permissionId):'?sendNotificationEmail=true&fields=id,role,type,emailAddress'}`;
  case'onedrive-personal':case'onedrive-business':case'sharepoint':{
   let drive='me/drive';if(provider==='sharepoint'){const id=await this.driveId?.(loc.context);ensure(id&&idOk(id),'CLOUD_SHARE_DRIVE_NOT_RESOLVED');drive='drives/'+encodeURIComponent(id);}
   return`https://graph.microsoft.com/v1.0/${drive}/items/${encodeURIComponent(fileId)}/${permissionId?'permissions/'+encodeURIComponent(permissionId):'invite'}`;}
  case'box':ensure(/^\d{1,30}$/.test(fileId),'CLOUD_SHARE_BOX_ID_INVALID');return permissionId?`https://api.box.com/2.0/collaborations/${encodeURIComponent(permissionId)}`:'https://api.box.com/2.0/collaborations';
  default:throw new CloudTransportError('CLOUD_SHARE_PROVIDER_UNSUPPORTED',409);
  }
 }
 async invite(x:ShareInvitation):Promise<ShareRecord>{
  const loc=x.location,c=loc.context,p=c.provider;
  ensure(x.explicitlyConfirmed,'CLOUD_SHARE_USER_CONFIRMATION_REQUIRED');
  ensure(validEmail(x.email)&&(['viewer','editor'].includes(x.role)),'CLOUD_SHARE_RECIPIENT_INVALID',400);
  ensure(supported(p),'CLOUD_SHARE_PROVIDER_UNSUPPORTED',409);
  ensure(await this.permission(loc,'invite'),'CLOUD_SHARE_ACL_NOT_VERIFIED');
  const tok=await this.token(c,'write');ensure(grantOk(tok),'CLOUD_SHARE_WRITE_GRANT_MISSING');
  const endpoint=await this.endpoint(loc);let body:unknown,expected=201;
  if(p==='google-drive'){expected=200;body={type:'user',role:x.role==='viewer'?'reader':'writer',emailAddress:x.email};}
  else if(p==='box')body={item:{type:'file',id:loc.fileId},accessible_by:{type:'user',login:x.email},role:x.role==='viewer'?'viewer':'editor'};
  else{body={recipients:[{email:x.email}],roles:[x.role==='viewer'?'read':'write'],requireSignIn:true,sendInvitation:true,retainInheritedPermissions:true};expected=200;}
  const response=await this.request(endpoint,{method:'POST',headers:{Authorization:'Bearer '+tok,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error'});
  if(![expected].includes(response.status))throw new CloudTransportError('CLOUD_SHARE_PROVIDER_INVITE_UNCONFIRMED',502);
  const data=await response.json()as any;
  const proofId=p==='google-drive'?data.id:p==='box'?data.id:data.value?.[0]?.id;
  ensure(typeof proofId==='string'&&idOk(proofId),'CLOUD_SHARE_PROVIDER_RECEIPT_MISSING',502);
  const receipt:ShareRecord={id:randomUUID(),owner:c.userId,space:c.space,accountId:c.accountId,provider:p,fileId:loc.fileId,
   recipientEmail:x.email,role:x.role,providerPermissionId:proofId,status:'active',createdAt:new Date().toISOString()};
  // If this fails, it is an ambiguous remote success. Caller must not retry automatically.
  try{await this.store.save(receipt);}catch{throw new CloudTransportError('CLOUD_SHARE_REMOTE_CREATED_LEDGER_FAILED_REVIEW',409);}
  return receipt;
 }
 async revoke(id:string,owner:string,space:'prive'|'technisch',explicitlyConfirmed:boolean){
  ensure(explicitlyConfirmed,'CLOUD_SHARE_REVOKE_CONFIRMATION_REQUIRED');
  const receipt=await this.store.getForOwner(id,owner,space);
  ensure(receipt&&receipt.status==='active','CLOUD_SHARE_RECEIPT_MISSING');
  const loc:RemoteLocation={context:{userId:owner,space,accountId:receipt.accountId,provider:receipt.provider as any},fileId:receipt.fileId};
  ensure(await this.permission(loc,'revoke'),'CLOUD_SHARE_REVOKE_NOT_ALLOWED');
  const token=await this.token(loc.context,'write');ensure(grantOk(token),'CLOUD_SHARE_WRITE_GRANT_MISSING');
  const url=await this.endpoint(loc,receipt.providerPermissionId);
  let resp:Response;try{resp=await this.request(url,{method:'DELETE',headers:{Authorization:'Bearer '+token},redirect:'error'});}catch{
   await this.store.mark(id,owner,space,'review');throw new CloudTransportError('CLOUD_SHARE_REVOKE_NETWORK_AMBIGUOUS',409);}
  if(resp.status!==204){await this.store.mark(id,owner,space,'review');throw new CloudTransportError('CLOUD_SHARE_REVOKE_RESPONSE_AMBIGUOUS',409);}
  await this.store.mark(id,owner,space,'revoked');return{status:'revoked' as const};
 }
}
