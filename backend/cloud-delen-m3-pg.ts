/** M3 owner/space-scoped provider share receipt ledger, not connected to live routes. */
import{getPool}from'../server/platform/pg';
import{CloudTransportError}from'./cloud-overdracht-adapters';
import type{ShareRepository,ShareRecord}from'./cloud-delen-m3';
type DBRecord={id:string;user_id:string;ruimte:'prive'|'technisch';account_id:string;aanbieder:string;bestand_id:string;ontvanger:string;rol:'viewer'|'editor';provider_permissie_id:string;status:'active'|'review'|'revoked';aangemaakt_op:string};
const decoded=(x:DBRecord):ShareRecord=>({id:x.id,owner:x.user_id,space:x.ruimte,accountId:x.account_id,provider:x.aanbieder,fileId:x.bestand_id,recipientEmail:x.ontvanger,role:x.rol,providerPermissionId:x.provider_permissie_id,status:x.status,createdAt:x.aangemaakt_op});
export class PostgresShareRepository implements ShareRepository{
 async save(x:ShareRecord){
  const r=await getPool('systeem').query(`INSERT INTO app.cloud_share_receipts
    (id,user_id,ruimte,account_id,aanbieder,bestand_id,ontvanger,rol,provider_permissie_id,status)
    VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,'active') ON CONFLICT DO NOTHING RETURNING id`,
   [x.id,x.owner,x.space,x.accountId,x.provider,x.fileId,x.recipientEmail,x.role,x.providerPermissionId]);
  if(r.rowCount!==1)throw new CloudTransportError('CLOUD_SHARE_RECEIPT_NOT_SAVED',409);
 }
 async getForOwner(id:string,owner:string,space:'prive'|'technisch'){
  const r=await getPool('systeem').query<DBRecord>(`SELECT * FROM app.cloud_share_receipts WHERE id=$1::uuid AND user_id=$2 AND ruimte=$3`,[id,owner,space]);
  return r.rows.length?decoded(r.rows[0]):null;
 }
 async mark(id:string,owner:string,space:'prive'|'technisch',status:'review'|'revoked'){
  if(!['review','revoked'].includes(status))throw new CloudTransportError('CLOUD_SHARE_STATE_INVALID',400);
  const r=await getPool('systeem').query(`UPDATE app.cloud_share_receipts SET status=$4,bijgewerkt_op=now()
    WHERE id=$1::uuid AND user_id=$2 AND ruimte=$3 AND status='active' RETURNING id`,[id,owner,space,status]);
  if(r.rowCount!==1)throw new CloudTransportError('CLOUD_SHARE_RECEIPT_STATUS_CONFLICT',409);
 }
}
