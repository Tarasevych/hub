/** M3 staged provider-safe move proof persistence. Not registered into live routes.
 * Durable receipt must exactly match a completed, verified M2 COPY job. No transfer
 * token, OAuth grant or source bytes are stored in PostgreSQL.
 */
import {randomUUID} from 'node:crypto';
import {getPool} from '../server/platform/pg';
import {CloudTransportError} from './cloud-overdracht-adapters';
import type {MoveProof,MoveProofStore,MoveReviewResult} from './cloud-overdracht-m3-move';

type DBProof = {job_id:string;user_id:string;ruimte:string;bewijs:MoveProof;status:string;lease_token:string};
const safeReason=(reason:string)=>reason.length<=160&&/^[A-Za-z0-9_-]+$/.test(reason);
const canonical=(v:any):string=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
export class PostgresMoveProofStore implements MoveProofStore{
 async persistVerifiedCopy(proof:MoveProof):Promise<void>{
  if(!proof.explicitlyConfirmed)throw new CloudTransportError('CLOUD_MOVE_CONFIRMATION_REQUIRED',403);
  // Verify against the original M2 job with exact owner, space, input and outcome.
  const db=getPool('systeem');
  const r=await db.query<{verzoek:any;uitkomst:any;status:string}>(`SELECT verzoek,uitkomst,status
   FROM app.cloud_overdracht_jobs WHERE id=$1::uuid AND user_id=$2 AND ruimte=$3`,
   [proof.jobId,proof.ownerUserId,proof.space]);
  if(!r.rows.length||r.rows[0].status!=='done')throw new CloudTransportError('CLOUD_M3_COPY_JOB_NOT_VERIFIED',409);
  const {verzoek:x,uitkomst:o}=r.rows[0];
  if(x?.mode!=='copy'||x?.ownerUserId!==proof.ownerUserId||x?.space!==proof.space||
   x?.source?.provider!==proof.source.provider||x?.source?.accountId!==proof.source.accountId||
   x?.source?.fileId!==proof.source.fileId||x?.source?.revision!==proof.source.revision||x?.target?.provider!==proof.target.provider||
   x?.target?.accountId!==proof.target.accountId||
   o?.id!==proof.target.fileId||o?.bytes!==proof.target.size||o?.bytes!==proof.source.size||o?.sha256!==proof.checksumSHA256||
   proof.source.size!==proof.target.size||!proof.source.revision||!proof.target.revision)
   throw new CloudTransportError('CLOUD_M3_COPY_PROOF_MISMATCH',409);
  // Immutable evidence; an existing proof never changes even when retried.
  const inserted=await db.query<{bewijs:MoveProof}>(`INSERT INTO app.cloud_move_proofs(job_id,user_id,ruimte,bewijs)
   VALUES ($1::uuid,$2,$3,$4::jsonb) ON CONFLICT(job_id) DO NOTHING RETURNING bewijs`,
   [proof.jobId,proof.ownerUserId,proof.space,JSON.stringify(proof)]);
  if(inserted.rows.length)return;
  const existing=await db.query<{bewijs:MoveProof}>(`SELECT bewijs FROM app.cloud_move_proofs
   WHERE job_id=$1::uuid AND user_id=$2 AND ruimte=$3`,[proof.jobId,proof.ownerUserId,proof.space]);
  if(!existing.rows.length||canonical(existing.rows[0].bewijs)!==canonical(proof))
   throw new CloudTransportError('CLOUD_M3_MOVE_PROOF_ALREADY_EXISTS',409);
 }
 async claimDelete(jobId:string,owner:string,space:'prive'|'technisch'){
  const lease=randomUUID();const r=await getPool('systeem').query<DBProof>(`UPDATE app.cloud_move_proofs
    SET status='deleting',lease_token=$4,lease_tot=now()+interval '10 minutes',bijgewerkt_op=now()
    WHERE job_id=$1::uuid AND user_id=$2 AND ruimte=$3 AND status='verified'
    RETURNING *`,[jobId,owner,space,lease]);
  return r.rows.length?{proof:r.rows[0].bewijs,lease}:null;
 }
 async finishDelete(jobId:string,lease:string,result:MoveReviewResult){
  if(result.state!=='moved'&&result.state!=='review'&&result.state!=='blocked')throw new CloudTransportError('CLOUD_M3_MOVE_RESULT_INVALID',400);
  if(!safeReason(result.reason))throw new CloudTransportError('CLOUD_M3_MOVE_RESULT_REASON_INVALID',400);
  const state=result.state==='blocked'?'review':result.state;
  const r=await getPool('systeem').query(`UPDATE app.cloud_move_proofs
    SET status=$3,resultaat=$4,lease_token='',lease_tot=NULL,bijgewerkt_op=now()
    WHERE job_id=$1::uuid AND lease_token=$2 AND status='deleting' AND lease_tot>now()
    RETURNING job_id`,[jobId,lease,state,result.reason]);
  if(!r.rows.length)throw new CloudTransportError('CLOUD_M3_MOVE_LEASE_LOST',409);
 }
 async quarantineExpired(){
  const r=await getPool('systeem').query(`UPDATE app.cloud_move_proofs
    SET status='review',resultaat='CLOUD_M3_MOVE_EXPIRED_RECONCILIATION_REQUIRED',lease_token='',lease_tot=NULL,bijgewerkt_op=now()
    WHERE status='deleting' AND lease_tot<now() RETURNING job_id`);
  return r.rowCount||0;
 }
}
