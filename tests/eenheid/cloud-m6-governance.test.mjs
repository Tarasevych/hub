import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const TS=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root=new URL('../../',import.meta.url);
function transpile(path,changes={}){
 let code=readFileSync(new URL(path,root),'utf8');
 for(const [from,to] of Object.entries(changes)){assert(code.includes(from),`missing substitution ${from}`);code=code.replaceAll(from,to);}
 const out=TS.transpileModule(code,{compilerOptions:{target:TS.ScriptTarget.ES2022,module:TS.ModuleKind.ESNext},reportDiagnostics:true});
 assert.equal(out.diagnostics?.filter(x=>x.category===TS.DiagnosticCategory.Error).length??0,0,(out.diagnostics||[]).map(x=>TS.flattenDiagnosticMessageText(x.messageText,' / ')).join('; '));
 return 'data:text/javascript;base64,'+Buffer.from(out.outputText).toString('base64');
}
const dataJs=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const mockPg=dataJs('export function getPool(){return globalThis.__cloudM6Pool}');
const mockRouter=dataJs('export const json=(v)=>({statusCode:200,body:v});export const error=(code,status)=>({statusCode:status,code})');
const mockTech=dataJs("export const TAB_RE=/^[A-Za-z0-9_-]{8,128}$/;export const isEigenaar=u=>u.role==='owner'&&u.email==='owner@example.test';export const actieveActivatie=async()=>null");
const mockError=dataJs('export class CloudTransportError extends Error{constructor(code,status=502){super(code);this.code=code;this.status=status}}');
const catalog=transpile('shared/cloud-m5-catalogus.ts');
const pg=await import(transpile('backend/cloud-m6-governance-pg.ts',{"'../shared/cloud-m5-catalogus'":`'${catalog}'`,"'../server/platform/pg'":`'${mockPg}'`}));
const governor=await import(transpile('backend/cloud-m5-governor.ts',{"'../shared/cloud-m5-catalogus'":`'${catalog}'`,"'./cloud-overdracht-adapters'":`'${mockError}'`}));
const routes=await import(transpile('backend/cloud-m6-admin-routes.ts',{
 "'../server/platform'":`'${mockRouter}'`,"'../server/platform/pg'":`'${mockPg}'`,"'./tech-profiel'":`'${mockTech}'`,
 "'./cloud-overdracht-adapters'":`'${mockError}'`,"'../shared/cloud-m5-catalogus'":`'${catalog}'`,
 "'./cloud-m5-governor'":`'${transpile('backend/cloud-m5-governor.ts',{"'../shared/cloud-m5-catalogus'":`'${catalog}'`,"'./cloud-overdracht-adapters'":`'${mockError}'`})}'`,
 "'./cloud-m6-governance-pg'":`'${transpile('backend/cloud-m6-governance-pg.ts',{"'../shared/cloud-m5-catalogus'":`'${catalog}'`,"'../server/platform/pg'":`'${mockPg}'`})}'`
}));
const key='ab'.repeat(32),sha='c'.repeat(40);
function signed(provider='dropbox'){
 const checks=[...pg.minimumLiveChecks(provider)];const row={provider,build_sha:sha,run_id:'ci-run-012345',checks,checked_at:new Date(Date.now()-60_000),expires_at:new Date(Date.now()+86_400_000),evidence_digest:'f'.repeat(64)};
 return {...row,signature:createHmac('sha256',Buffer.from(key,'hex')).update(pg.attestationPayload(row)).digest('hex')};
}
const now=Date.now();
test('valid signed full attestation accepted',()=>assert(pg.verifyProviderAttestation(signed(),key,sha,now)));
test('signature does not carry over to another provider',()=>assert.equal(pg.verifyProviderAttestation({...signed(),provider:'box'},key,sha,now),false));
test('different build is rejected',()=>assert.equal(pg.verifyProviderAttestation(signed(),key,'d'.repeat(40),now),false));
test('expired proof is rejected',()=>assert.equal(pg.verifyProviderAttestation(signed(),key,sha,now+3*86_400_000),false));
test('missing test case rejects proof even when re-signed',()=>{const row=signed();row.checks=row.checks.filter(x=>x!=='share-revoke');row.signature=createHmac('sha256',Buffer.from(key,'hex')).update(pg.attestationPayload(row)).digest('hex');assert.equal(pg.verifyProviderAttestation(row,key,sha,now),false)});
test('duplicate test ids are refused',()=>{const row=signed();row.checks.push('authorization');row.signature=createHmac('sha256',Buffer.from(key,'hex')).update(pg.attestationPayload(row)).digest('hex');assert.equal(pg.verifyProviderAttestation(row,key,sha,now),false)});
test('GitHub does not require unsupported native share or MOVE',()=>{const keys=pg.minimumLiveChecks('github');assert(!keys.includes('conditional-move'));assert(!keys.includes('share-revoke'));});
test('unconfigured CI verifier fails closed',async()=>{delete process.env.CLOUD_M6_CI_ATTESTATION_HMAC_KEY;delete process.env.CLOUD_M6_EXPECTED_BUILD_SHA;assert.equal(await pg.postgresCiVerifier('dropbox'),false)});
test('signed attestation can be queried by server from DB without client evidence',async()=>{process.env.CLOUD_M6_CI_ATTESTATION_HMAC_KEY=key;process.env.CLOUD_M6_EXPECTED_BUILD_SHA=sha;
 globalThis.__cloudM6Pool={query:async()=>({rows:[signed()]})};
 // Current time in 2026-10-28; proof dates are intentionally bounded to 29 Oct.
 assert.equal(await pg.postgresCiVerifier('dropbox'),true);
 delete process.env.CLOUD_M6_CI_ATTESTATION_HMAC_KEY;delete process.env.CLOUD_M6_EXPECTED_BUILD_SHA;
});
function fakePool({insert=true,failAudit=false,update=true}={}){
 const events=[];
 const client={query:async(q,params)=>{events.push(q);if(q==='BEGIN'||q==='COMMIT'||q==='ROLLBACK')return {rows:[]};
  if(q.startsWith('INSERT INTO app.cloud_provider_policy_m6')||q.startsWith('UPDATE app.cloud_provider_policy_m6'))return{rows:insert&&update?[{provider:'dropbox'}]:[]};
  if(q.startsWith('INSERT INTO app.cloud_provider_policy_audit_m6')){if(failAudit)throw Error('AUDIT_FAIL');return{rows:[]}};
  return{rows:[]};},release(){events.push('RELEASE')}};
 globalThis.__cloudM6Pool={connect:async()=>client,query:async()=>({rows:[]})};return events;
}
const initial={provider:'dropbox',allowNewConnections:false,allowExistingOperations:false,revision:1,updatedBy:'owner-id'};
test('policy transaction and audit commit together',async()=>{const ops=fakePool();assert(await new pg.PostgresCloudProviderPolicies().changeWithAudit(null,initial,'Operator deliberately disables Dropbox'));assert(ops.some(x=>x.startsWith('INSERT INTO app.cloud_provider_policy_audit_m6')));assert(ops.includes('COMMIT'))});
test('failed audit rolls back policy',async()=>{const ops=fakePool({failAudit:true});await assert.rejects(new pg.PostgresCloudProviderPolicies().changeWithAudit(null,initial,'Operator disables Dropbox now'));assert(ops.includes('ROLLBACK'));assert(!ops.includes('COMMIT'))});
test('concurrent CAS conflict does not commit policy or audit',async()=>{const ops=fakePool({insert:false});assert.equal(await new pg.PostgresCloudProviderPolicies().changeWithAudit(null,initial,'Operator disables Dropbox now'),false);assert(ops.includes('ROLLBACK'));assert(!ops.includes('COMMIT'))});
test('governor blocks activation without CI approval',async()=>{
 const store={read:async()=>null,changeWithAudit:async()=>true};const g=new governor.CloudM5Governor(store,async()=>false);
 await assert.rejects(g.set({userId:'owner-id',isSiteOwner:true,isTechnicalSession:true,reason:'Request after release evidence'},'dropbox',0,{allowNewConnections:true,allowExistingOperations:true}),e=>e.code==='CLOUD_M5_PROVIDER_NOT_ACCEPTED');
});
function makeRoute({owner=true,tech=true}={}){
 let changed=0;
 const gov={status:async provider=>({provider,revision:0,allowNewConnections:false,allowExistingOperations:false}),set:async()=>{changed++;return initial}};
 const deps={liveOwner:async id=>owner?{id,role:'owner',email:'owner@example.test'}:null,technicalTabActive:async()=>tech,governor:gov};
 const auth=async()=>({service:'cloud',user:{id:'owner-id',status:'approved'}});
 const r=routes.createCloudM6AdminRoutes(auth,deps);
 const body={tabContext:'tab-context-1234',provider:'dropbox',expectedRevision:0,allowNewConnections:false,allowExistingOperations:false,reason:'Disable connections as maintenance'};
 return {r,body,getChanged:()=>changed};
}
test('M6 endpoints are off by default, without touching DB',async()=>{delete process.env.CLOUD_M6_ADMIN_STAGING;const {r,body}=makeRoute();const x=await r['POST /api/owner/cloud/integrations/v1/admin/policies/change'][0]({event:{},body});assert.equal(x.statusCode,404)});
test('admin list rejects non-owner even with technical tab',async()=>{process.env.CLOUD_M6_ADMIN_STAGING='enabled';const {r,body}=makeRoute({owner:false});const x=await r['POST /api/owner/cloud/integrations/v1/admin/policies/list'][0]({event:{},body});assert.equal(x.statusCode,403)});
test('admin write rejects missing technical profile',async()=>{const {r,body,getChanged}=makeRoute({tech:false});const x=await r['POST /api/owner/cloud/integrations/v1/admin/policies/change'][0]({event:{},body});assert.equal(x.statusCode,403);assert.equal(getChanged(),0)});
test('admin rejects invalid flag types even for owner',async()=>{const {r,body,getChanged}=makeRoute();const x=await r['POST /api/owner/cloud/integrations/v1/admin/policies/change'][0]({event:{},body:{...body,allowNewConnections:'true'}});assert.equal(x.statusCode,400);assert.equal(getChanged(),0)});
test('admin with explicit denial can disable existing connections',async()=>{const {r,body,getChanged}=makeRoute();const x=await r['POST /api/owner/cloud/integrations/v1/admin/policies/change'][0]({event:{},body});assert.equal(x.statusCode,200);assert.equal(getChanged(),1)});
test('admin rejects malformed or missing technical tab id',async()=>{const {r,body,getChanged}=makeRoute();const x=await r['POST /api/owner/cloud/integrations/v1/admin/policies/change'][0]({event:{},body:{...body,tabContext:'invalid'}});assert.equal(x.statusCode,403);assert.equal(getChanged(),0)});
