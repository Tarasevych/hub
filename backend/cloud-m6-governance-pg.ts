/** Durable M6 governance. Policies are server-global, never per-browser.
 * One serializable SQL transaction updates the policy and inserts an append-only audit row.
 * No route to edit attestations exists. Default policy is deny/deny.
 */
import {getPool} from '../server/platform/pg';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {CLOUD_M5_BLUEPRINTS,type WaveOneProvider} from '../shared/cloud-m5-catalogus';
import type {ProviderPolicy,ProviderPolicyStore,ProviderReleaseVerifier} from './cloud-m5-governor';
const policy='app.cloud_provider_policy_m6',audit='app.cloud_provider_policy_audit_m6';
type Row={provider:WaveOneProvider;allow_new_connections:boolean;allow_existing_operations:boolean;revision:string|number;updated_by:string};
const rowPolicy=(r:Row):ProviderPolicy=>({provider:r.provider,allowNewConnections:r.allow_new_connections,allowExistingOperations:r.allow_existing_operations,revision:Number(r.revision),updatedBy:r.updated_by});
export class PostgresCloudProviderPolicies implements ProviderPolicyStore{
 async read(provider:WaveOneProvider):Promise<ProviderPolicy|null>{
  const res=await getPool('systeem').query<Row>(`SELECT provider,allow_new_connections,allow_existing_operations,revision,updated_by FROM ${policy} WHERE provider=$1`,[provider]);
  return res.rows[0]?rowPolicy(res.rows[0]):null;
 }
 async changeWithAudit(previous:ProviderPolicy|null,next:ProviderPolicy,reason:string):Promise<boolean>{
  if(!/^.{8,500}$/s.test(reason)||!next.updatedBy||!Number.isSafeInteger(next.revision)||next.revision!==(previous?.revision??0)+1)return false;
  const client=await getPool('systeem').connect();
  try{
   await client.query('BEGIN');
   let changed:Row|undefined;
   if(previous){
    const res=await client.query<Row>(`UPDATE ${policy} SET allow_new_connections=$2,allow_existing_operations=$3,revision=revision+1,updated_by=$4,updated_at=now() WHERE provider=$1 AND revision=$5 RETURNING *`,[next.provider,next.allowNewConnections,next.allowExistingOperations,next.updatedBy,previous.revision]);
    changed=res.rows[0];
   }else{
    const res=await client.query<Row>(`INSERT INTO ${policy}(provider,allow_new_connections,allow_existing_operations,revision,updated_by) VALUES($1,$2,$3,1,$4) ON CONFLICT (provider) DO NOTHING RETURNING *`,[next.provider,next.allowNewConnections,next.allowExistingOperations,next.updatedBy]);
    changed=res.rows[0];
   }
   if(!changed){await client.query('ROLLBACK');return false;}
   // Audit insert is REQUIRED: failure rolls back policy change.
   await client.query(`INSERT INTO ${audit}(provider,revision,actor_id,reason,before_policy,after_policy) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,[next.provider,next.revision,next.updatedBy,reason,JSON.stringify(previous??{}),JSON.stringify(next)]);
   await client.query('COMMIT');return true;
  }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e;}
  finally{client.release();}
 }
}

export type ProviderAttestation={provider:WaveOneProvider;build_sha:string;run_id:string;checks:string[];checked_at:Date|string;expires_at:Date|string;evidence_digest:string;signature:string};
export const minimumLiveChecks=(provider:WaveOneProvider):readonly string[]=>{
 const c=CLOUD_M5_BLUEPRINTS.find(x=>x.id===provider);
 if(!c)return [];
 const required=['authorization','multi-account','scoped-read','upload','cross-provider-copy','disconnect','worker-recovery','live-e2e'];
 if(c.nativeCapabilities.includes('move'))required.push('conditional-move');
 if(c.nativeCapabilities.includes('share'))required.push('share-revoke');
 if(c.nativeCapabilities.includes('versions'))required.push('versions');
 return required;
};
/** Canonical CI payload, not user-controlled. Signature generated outside app by isolated CI secret. */
export function attestationPayload(a:Omit<ProviderAttestation,'signature'>):string{
 return ['cloud-governance-m6',a.provider,a.build_sha,a.run_id,[...a.checks].sort().join(','),
  new Date(a.checked_at).toISOString(),new Date(a.expires_at).toISOString(),a.evidence_digest].join('|');
}
export function verifyProviderAttestation(a:ProviderAttestation,secretHex:string,buildSha:string,now=Date.now()):boolean{
 if(!/^[a-f0-9]{64}$/.test(secretHex)||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(buildSha)||a.build_sha!==buildSha)return false;
 if(!/^[a-f0-9]{64}$/.test(a.evidence_digest)||!/^[a-f0-9]{64}$/.test(a.signature)||!/^[A-Za-z0-9_-]{8,128}$/.test(a.run_id))return false;
 if(!Array.isArray(a.checks)||!CLOUD_M5_BLUEPRINTS.some(x=>x.id===a.provider))return false;
 const times=[new Date(a.checked_at).getTime(),new Date(a.expires_at).getTime()];
 if(times.some(t=>!Number.isFinite(t))||times[0]>now||times[1]<=now||times[1]-times[0]>14*864e5)return false;
 const checks=new Set(a.checks);
 if(checks.size!==a.checks.length||minimumLiveChecks(a.provider).some(k=>!checks.has(k)))return false;
 const expected=createHmac('sha256',Buffer.from(secretHex,'hex')).update(attestationPayload(a)).digest();
 const actual=Buffer.from(a.signature,'hex');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
/** Fails closed without a CI-only secret and exact build SHA. No browser-supplied proof. */
export const postgresCiVerifier:ProviderReleaseVerifier=async(provider)=>{
 const secret=process.env.CLOUD_M6_CI_ATTESTATION_HMAC_KEY||'';
 const build=process.env.CLOUD_M6_EXPECTED_BUILD_SHA||'';
 if(!/^[a-f0-9]{64}$/.test(secret)||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(build))return false;
 const res=await getPool('systeem').query<ProviderAttestation>(`SELECT provider,build_sha,run_id,checks,checked_at,expires_at,evidence_digest,signature FROM app.cloud_provider_attestation_m6 WHERE provider=$1`,[provider]);
 return res.rows.length===1&&verifyProviderAttestation(res.rows[0],secret,build);
};
