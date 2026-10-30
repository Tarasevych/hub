/** STAGING ONLY: PostgreSQL CAS checkpoint and AES-GCM sealing of upload capabilities.
 * A server operator controlling the process can still access these native provider
 * capabilities. This is server-at-rest protection, NOT a zero-knowledge guarantee.
 */
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {getPool} from '../server/platform/pg';
import type {UploadLease,UploadDelta,UploadStore} from './cloud-m9-upload-sessions';
import {CloudTransportError} from './cloud-overdracht-adapters';
const failure=(code:string,status=409):never=>{throw new CloudTransportError(code,status);};
const context=(l:UploadLease)=>Buffer.from(JSON.stringify([1,l.jobId,l.owner,l.space,l.accountId,l.provider]));
export class M9UploadCapabilitySealer{
 constructor(private readonly key:Buffer){if(key.length!==32)failure('CLOUD_M9_SEAL_KEY_INVALID',503);}
 seal(lease:UploadLease):Buffer{
  const nonce=randomBytes(12),enc=createCipheriv('aes-256-gcm',this.key,nonce);enc.setAAD(context(lease));
  const data=Buffer.concat([enc.update(Buffer.from(lease.session,'utf8')),enc.final()]);
  return Buffer.concat([nonce,enc.getAuthTag(),data]);
 }
 unseal(lease:UploadLease,record:Buffer):string{
  if(!Buffer.isBuffer(record)||record.length<29||record.length>8192)failure('CLOUD_M9_SEALED_CAPABILITY_INVALID',403);
  try{const dec=createDecipheriv('aes-256-gcm',this.key,record.subarray(0,12));dec.setAAD(context(lease));dec.setAuthTag(record.subarray(12,28));
   return Buffer.concat([dec.update(record.subarray(28)),dec.final()]).toString('utf8');}
  catch{failure('CLOUD_M9_CAPABILITY_OTHER_ACCOUNT',403);}
 }
}
export interface UploadDb{query:<T=any>(sql:string,params?:unknown[])=>Promise<{rows:T[];rowCount?:number|null}>}
export class M9PostgresUploadCheckpoints implements UploadStore{
 constructor(private readonly seal:M9UploadCapabilitySealer,private readonly db:UploadDb=getPool('systeem') as unknown as UploadDb){}
 async initialize(lease:UploadLease):Promise<void>{
  if(!lease.jobId||!lease.owner||!lease.accountId||!lease.leaseId||lease.offset!==0||!lease.expectedRevision||
   !Number.isSafeInteger(lease.total)||lease.total<=0)failure('CLOUD_M9_INITIAL_LEASE_INVALID',400);
  const sealed=this.seal.seal(lease);
  const r=await this.db.query(`INSERT INTO app.cloud_m9_upload_checkpoints
   (job_id,user_id,ruimte,account_id,provider,encrypted_session,doel,naam,bron_revisie,total_bytes,confirmed_offset,lease_token,lease_until)
   SELECT $1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,now()+interval '5 minutes'
   WHERE EXISTS(SELECT 1 FROM app.cloud_overdracht_jobs WHERE id=$1::uuid AND user_id=$2 AND ruimte=$3 AND status='running')
   ON CONFLICT (job_id) DO NOTHING RETURNING job_id`,
   [lease.jobId,lease.owner,lease.space,lease.accountId,lease.provider,sealed,lease.target,lease.name,lease.expectedRevision,lease.total,lease.leaseId]);
  if(r.rows.length!==1)failure('CLOUD_M9_UPLOAD_JOB_NOT_CLAIMED');
 }
 async checkpoint(lease:UploadLease,delta:UploadDelta):Promise<void>{
  if(!Number.isSafeInteger(delta.offset)||delta.offset<lease.offset||delta.offset>lease.total||
   delta.state==='uploading'&&delta.offset===lease.offset||
   delta.state==='review_required'&&delta.offset!==lease.offset||
   delta.state==='uploaded_not_verified'&&(delta.offset!==lease.total||!delta.remoteId))failure('CLOUD_M9_UPLOAD_DELTA_INVALID',400);
  const r=await this.db.query(`UPDATE app.cloud_m9_upload_checkpoints SET
    confirmed_offset=$9,status=$10,fout=$11,remote_id=$12,remote_revision=$13,
    lease_until=CASE WHEN $10='uploading' THEN now()+interval '5 minutes' ELSE lease_until END,
    bijgewerkt_op=now()
    WHERE job_id=$1::uuid AND user_id=$2 AND ruimte=$3 AND account_id=$4 AND provider=$5
      AND bron_revisie=$6 AND total_bytes=$7 AND lease_token=$8
      AND confirmed_offset=$14 AND status='uploading' AND lease_until>now()
    RETURNING job_id`,[
      lease.jobId,lease.owner,lease.space,lease.accountId,lease.provider,
      lease.expectedRevision,lease.total,lease.leaseId,delta.offset,delta.state,delta.reason||'',
      delta.remoteId||null,delta.remoteRevision||null,lease.offset
    ]);
  if(r.rows.length!==1)failure('CLOUD_M9_CHECKPOINT_CONCURRENT_OR_REVOKED');
 }
 async quarantineExpired():Promise<number>{
  const r=await this.db.query(`UPDATE app.cloud_m9_upload_checkpoints
   SET status='review_required',fout='EXPIRED_UPLOAD_LEASE_RECONCILIATION_REQUIRED',bijgewerkt_op=now()
   WHERE status='uploading' AND lease_until<now() RETURNING job_id`);
  return r.rows.length;
 }
}
