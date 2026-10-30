/** M2 durable transfer jobs; requests are bound to canonical owner+space in every query.
 * Does not start workers or register public mutation routes. Migration 0116 required.
 */
import { randomUUID } from 'node:crypto';
import {getPool} from '../server/platform/pg';
import { transferFingerprint,type JobRepository,type TransferInput,type TransferJob,type TransferStatus } from './cloud-overdracht-uitvoerder';
import type {CloudRuimte} from '../shared/cloud-integratie-contract';
import {CloudTransportError} from './cloud-overdracht-adapters';
type JobRow={id:string;user_id:string;ruimte:CloudRuimte;verzoek:TransferInput;status:TransferStatus;lease_token:string;pogingen:number;uitkomst?:TransferJob['result'];fout?:string;fingerprint:string};
function convert(row:JobRow):TransferJob{return{id:row.id,input:row.verzoek,status:row.status,lease:row.lease_token,attempts:row.pogingen,result:row.uitkomst||undefined,error:row.fout||undefined};}
export class PostgresTransferJobs implements JobRepository {
 async enqueue(input:TransferInput){
  const digest=transferFingerprint(input),db=getPool('systeem');
  const add=await db.query<JobRow>(`INSERT INTO app.cloud_overdracht_jobs
    (user_id,ruimte,idempotentie_sleutel,fingerprint,verzoek)
    VALUES($1,$2,$3,$4,$5::jsonb)
    ON CONFLICT (user_id,ruimte,idempotentie_sleutel) DO NOTHING RETURNING *`,
    [input.ownerUserId,input.space,input.idempotencyKey,digest,JSON.stringify(input)]);
  if(add.rows.length)return convert(add.rows[0]);
  const prior=await db.query<JobRow>(`SELECT * FROM app.cloud_overdracht_jobs WHERE user_id=$1 AND ruimte=$2 AND idempotentie_sleutel=$3`,[input.ownerUserId,input.space,input.idempotencyKey]);
  if(!prior.rows.length||prior.rows[0].fingerprint!==digest)throw new CloudTransportError('CLOUD_IDEMPOTENCY_PAYLOAD_MISMATCH',409);
  return convert(prior.rows[0]);
 }
 async claim(id:string,owner:string,space:CloudRuimte){
  const lease=randomUUID();
  const r=await getPool('systeem').query<JobRow>(`UPDATE app.cloud_overdracht_jobs
    SET status='running', lease_token=$4, lease_tot=now()+interval '10 minutes', pogingen=pogingen+1, bijgewerkt_op=now()
    WHERE id=$1::uuid AND user_id=$2 AND ruimte=$3 AND status='queued' AND pogingen<3
    RETURNING *`,[id,owner,space,lease]);
  return r.rows.length?convert(r.rows[0]):null;
 }
 async finish(id:string,lease:string,status:TransferStatus,output:{result?:TransferJob['result'];error?:string}){
  if(status!=='done'&&status!=='review'&&status!=='failed')throw new CloudTransportError('CLOUD_FINAL_STATE_INVALID',400);
  const r=await getPool('systeem').query(`UPDATE app.cloud_overdracht_jobs
    SET status=$3, uitkomst=$4::jsonb, fout=$5, lease_token='', lease_tot=NULL, bijgewerkt_op=now()
    WHERE id=$1::uuid AND lease_token=$2 AND status='running' AND lease_tot>now() RETURNING id`,
    [id,lease,status,JSON.stringify(output.result||{}),output.error||'']);
  if(!r.rows.length)throw new CloudTransportError('CLOUD_TRANSFER_LEASE_LOST',409);
 }
 /** Expired leases become manual review, never auto-retry: remote upload may already have succeeded. */
 async quarantineExpired(){
  const r=await getPool('systeem').query(`UPDATE app.cloud_overdracht_jobs
     SET status='review', fout='CLOUD_TRANSFER_LEASE_EXPIRED_RECONCILIATION_REQUIRED', lease_token='', lease_tot=NULL, bijgewerkt_op=now()
     WHERE status='running' AND lease_tot<now() RETURNING id`);
  return r.rowCount||0;
 }
 async getForUser(id:string,owner:string,space:CloudRuimte){
  const r=await getPool('systeem').query<JobRow>(`SELECT * FROM app.cloud_overdracht_jobs WHERE id=$1::uuid AND user_id=$2 AND ruimte=$3`,[id,owner,space]);
  return r.rows.length?convert(r.rows[0]):null;
 }
}
