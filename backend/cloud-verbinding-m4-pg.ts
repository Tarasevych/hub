/** PostgreSQL connection and OAuth flow repository (M4 development, not deployed).
 * AES-256-GCM envelope encryption with record-bound AAD; no decrypted token is
 * sent by list(). The system role is used only behind an authenticated Cloud route.
 */
import {createCipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {gcmOpenStrikt} from '../server/platform/beveiliging';
import {getPool} from '../server/platform/pg';
import type {CloudPrincipal,PendingFlow,StoredConnection,AccountView,ConnectionStatus,CloudConnectionStore} from './cloud-verbinding-m4';
import {CloudConnectionError} from './cloud-verbinding-m4';
const table='app.cloud_provider_accounts_m4';
const flowTable='app.cloud_oauth_flows_m4';
function key(){
 const raw=process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1||'';
 let secret:Buffer;
 if(/^[a-f0-9]{64}$/i.test(raw))secret=Buffer.from(raw,'hex');
 else if(/^[A-Za-z0-9_-]{43,44}$/.test(raw))secret=Buffer.from(raw,'base64url');
 else throw new CloudConnectionError('CLOUD_M4_ENCRYPTION_KEY_MISSING',503);
 if(secret.length!==32)throw new CloudConnectionError('CLOUD_M4_ENCRYPTION_KEY_INVALID',503);
 return secret;
}
export function encryptCloudGrant(value:unknown,aad:string):string{
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 cipher.setAAD(Buffer.from(aad,'utf8'));
 const payload=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),payload.toString('base64url')].join('.');
}
export function decryptCloudGrant<T>(encoded:string,aad:string):T{
 const p=encoded.split('.');if(p.length!==4||p[0]!=='v1')throw new CloudConnectionError('CLOUD_GRANT_CIPHERTEXT_INVALID',500);
 // SEC-002 (geheimen-06): IV 12 en tag 16 bytes afgedwongen; een afgekapte tag wordt geweigerd.
 try{
  return JSON.parse(gcmOpenStrikt(key(),Buffer.from(p[1],'base64url'),Buffer.from(p[2],'base64url'),Buffer.from(p[3],'base64url'),Buffer.from(aad,'utf8')).toString('utf8')) as T;
 }catch{throw new CloudConnectionError('CLOUD_GRANT_DECRYPT_FAILED',503);}
}
const grantAAD=(owner:string,space:string,id:string)=>`cloud-m4:token:${owner}:${space}:${id}`;
const flowAAD=(hash:string)=>`cloud-m4:flow:${hash}`;
type PgAccount={id:string;user_id:string;ruimte:'prive'|'technisch';aanbieder:StoredConnection['provider'];external_subject:string;
 naam:string;alias:string;email:string;modus:'read'|'write';status:ConnectionStatus;scopes:string[];encrypted_credentials:string;bijgewerkt_op:Date|string};
const publicView=(r:PgAccount):AccountView=>({id:r.id,provider:r.aanbieder,externalSubject:r.external_subject,displayName:r.naam,label:r.alias||'',
 email:r.email,mode:r.modus,status:r.status,scopes:r.scopes||[],updatedAt:new Date(r.bijgewerkt_op).toISOString()});
const principalSql='user_id=$1 AND ruimte=$2';
export class PostgresCloudConnections implements CloudConnectionStore{
 async saveFlow(x:PendingFlow){
  const encrypted=encryptCloudGrant(x,flowAAD(x.stateHash));
  await getPool('systeem').query(`INSERT INTO ${flowTable}(state_hash,flow_id,user_id,ruimte,encrypted_flow,expires_at)
   VALUES($1,$2::uuid,$3,$4,$5,to_timestamp($6/1000.0))`,
   [x.stateHash,x.id,x.owner,x.space,encrypted,x.expiresAt]);
 }
 async consumeFlow(hash:string):Promise<PendingFlow|null>{
  const r=await getPool('systeem').query<{encrypted_flow:string}>(`DELETE FROM ${flowTable}
   WHERE state_hash=$1 AND expires_at>now() RETURNING encrypted_flow`,[hash]);
  return r.rows.length?decryptCloudGrant<PendingFlow>(r.rows[0].encrypted_flow,flowAAD(hash)):null;
 }
 async upsert(x:Omit<StoredConnection,'id'|'updatedAt'|'status'>):Promise<AccountView>{
  const client=await getPool('systeem').connect();let done=false;
  try{
   await client.query('BEGIN');
   // Serializes concurrent OAuth completions for the SAME principal + provider account.
   const scopeKey=[x.owner,x.space,x.provider,x.externalSubject].join(':');
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[scopeKey]);
   const existing=await client.query<{id:string}>(`SELECT id FROM ${table}
    WHERE user_id=$1 AND ruimte=$2 AND aanbieder=$3 AND external_subject=$4 FOR UPDATE`,
    [x.owner,x.space,x.provider,x.externalSubject]);
   const id=existing.rows[0]?.id||randomUUID();
   const ciphertext=encryptCloudGrant(x.credentials,grantAAD(x.owner,x.space,id));
   const saved=await client.query<PgAccount>(`INSERT INTO ${table}
    (id,user_id,ruimte,aanbieder,external_subject,naam,email,modus,scopes,encrypted_credentials,status)
    VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,'connected')
    ON CONFLICT(user_id,ruimte,aanbieder,external_subject)
    DO UPDATE SET naam=excluded.naam,email=excluded.email,modus=excluded.modus,scopes=excluded.scopes,
    encrypted_credentials=excluded.encrypted_credentials,status='connected',refresh_lease_token='',refresh_lease_until=NULL,bijgewerkt_op=now()
    RETURNING *`,[id,x.owner,x.space,x.provider,x.externalSubject,x.displayName,x.email,x.mode,x.scopes,ciphertext]);
   await client.query('COMMIT');done=true;return publicView(saved.rows[0]);
  }finally{if(!done)await client.query('ROLLBACK').catch(()=>{});client.release();}
 }
 async list(p:CloudPrincipal):Promise<AccountView[]>{
  const r=await getPool('systeem').query<PgAccount>(`SELECT id,user_id,ruimte,aanbieder,external_subject,naam,alias,email,modus,status,scopes,bijgewerkt_op
   FROM ${table} WHERE ${principalSql} ORDER BY naam,aanbieder`,[p.owner,p.space]);
  return r.rows.map(publicView);
 }
 async get(p:CloudPrincipal,id:string):Promise<StoredConnection|null>{
  if(!/^[0-9a-f-]{36}$/i.test(id))return null;
  const r=await getPool('systeem').query<PgAccount>(`SELECT * FROM ${table} WHERE ${principalSql} AND id=$3::uuid`,[p.owner,p.space,id]);
  if(!r.rows.length)return null;const row=r.rows[0];
  return{...publicView(row),owner:p.owner,space:p.space,credentials:decryptCloudGrant(row.encrypted_credentials,grantAAD(p.owner,p.space,id))};
 }
 async rename(p:CloudPrincipal,id:string,label:string):Promise<AccountView>{
  const r=await getPool('systeem').query<PgAccount>(`UPDATE ${table} SET alias=$4,bijgewerkt_op=now()
   WHERE ${principalSql} AND id=$3::uuid AND status<>'revoked' RETURNING *`,[p.owner,p.space,id,label]);
  if(r.rowCount!==1)throw new CloudConnectionError('CLOUD_ACCOUNT_NOT_FOUND',404);
  return publicView(r.rows[0]);
 }
 async markRevokePending(p:CloudPrincipal,id:string):Promise<boolean>{
  const r=await getPool('systeem').query(`UPDATE ${table} SET status='disconnect_pending',bijgewerkt_op=now()
   WHERE ${principalSql} AND id=$3::uuid AND status IN ('connected','reauth_required') RETURNING id`,[p.owner,p.space,id]);
  return r.rowCount===1;
 }
 async quarantineExpiredRefresh(principal:CloudPrincipal,id:string){
  // Uncertain completion: a one-time Box refresh token may already be consumed.
  const r=await getPool('systeem').query(`UPDATE ${table} SET status='reauth_required',
   refresh_lease_token='',refresh_lease_until=NULL,bijgewerkt_op=now()
   WHERE ${principalSql} AND id=$3::uuid AND refresh_lease_token<>'' AND refresh_lease_until<now()
   RETURNING id`,[principal.owner,principal.space,id]);
  return r.rowCount===1;
 }
 /** Distributed lease: only one node is permitted to rotate a refresh token. */
 async tryRefreshLease(p:CloudPrincipal,id:string,lease:string):Promise<boolean>{
  const r=await getPool('systeem').query(`UPDATE ${table} SET refresh_lease_token=$4,
   refresh_lease_until=now()+interval '35 seconds' WHERE ${principalSql} AND id=$3::uuid
   AND status='connected' AND refresh_lease_token='' AND refresh_lease_until IS NULL RETURNING id`,
    [p.owner,p.space,id,lease]);return r.rowCount===1;
 }
 async commitRefreshed(p:CloudPrincipal,id:string,lease:string,next:StoredConnection['credentials']){
  const ciphertext=encryptCloudGrant(next,grantAAD(p.owner,p.space,id));
  const r=await getPool('systeem').query(`UPDATE ${table} SET encrypted_credentials=$5,
   refresh_lease_token='',refresh_lease_until=NULL,bijgewerkt_op=now(),token_version=token_version+1
   WHERE ${principalSql} AND id=$3::uuid AND refresh_lease_token=$4 AND refresh_lease_until>now() AND status='connected'
   RETURNING id`,[p.owner,p.space,id,lease,ciphertext]);
  if(r.rowCount!==1)throw new CloudConnectionError('CLOUD_REFRESH_LEASE_LOST',409);
 }
 async failedRefresh(p:CloudPrincipal,id:string,lease:string){
  // Remote response may have consumed a rotating token. Do not retry blindly.
  await getPool('systeem').query(`UPDATE ${table} SET status='reauth_required',
   refresh_lease_token='',refresh_lease_until=NULL,bijgewerkt_op=now()
   WHERE ${principalSql} AND id=$3::uuid AND refresh_lease_token=$4`,[p.owner,p.space,id,lease]);
 }
 async deactivate(p:CloudPrincipal,id:string){await this.setStatus(p,id,'revoked');}
 async setStatus(p:CloudPrincipal,id:string,status:ConnectionStatus){
  const r=await getPool('systeem').query(`UPDATE ${table} SET status=$4,bijgewerkt_op=now()
   WHERE ${principalSql} AND id=$3::uuid RETURNING id`,[p.owner,p.space,id,status]);
  if(r.rowCount!==1)throw new CloudConnectionError('CLOUD_ACCOUNT_NOT_FOUND',404);
 }
}
