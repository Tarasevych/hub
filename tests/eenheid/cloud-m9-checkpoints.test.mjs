import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}})();
const file=new URL('../../',import.meta.url);
function mod(path,replaces={}){let code=readFileSync(new URL(path,file),'utf8');for(const [a,b] of Object.entries(replaces))code=code.replaceAll(a,b);
 const x=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});assert(!x.diagnostics.some(d=>d.category===ts.DiagnosticCategory.Error));return 'data:text/javascript;base64,'+Buffer.from(x.outputText).toString('base64');}
const base=mod('backend/cloud-overdracht-adapters.ts');const sql=mod('backend/cloud-m9-checkpoints-pg.ts',{"'../server/platform/pg'":`'data:text/javascript,export const getPool=()=>{throw Error("No live database")} '`,"'./cloud-overdracht-adapters'":`'${base}'`});
const {M9PostgresUploadCheckpoints,M9UploadCapabilitySealer}=await import(sql);
const lease=()=>({jobId:'15e76ce8-80cd-4336-aace-ae50b38753e9',owner:'user',space:'prive',accountId:'abc',provider:'dropbox',total:1000,offset:0,session:'session:SECRET123',target:'/file',name:'file',expectedRevision:'rev1',leaseId:'lease-1'});
test('Session capability ciphertext does not contain plaintext and binds owner+account',()=>{
 const key=Buffer.alloc(32,8),seal=new M9UploadCapabilitySealer(key),l=lease(),enc=seal.seal(l);
 assert(!enc.toString().includes('SECRET123'));assert.equal(seal.unseal(l,enc),l.session);
 assert.throws(()=>seal.unseal({...l,owner:'other'},enc),e=>e.code==='CLOUD_M9_CAPABILITY_OTHER_ACCOUNT');
 assert.throws(()=>seal.unseal({...l,accountId:'other'},enc),e=>e.code==='CLOUD_M9_CAPABILITY_OTHER_ACCOUNT');
});
test('PG store requires original running transfer job before initializing checkpoint',async()=>{
 const calls=[];const db={query:async(q,args)=>{calls.push({q,args});return{rows:[{job_id:lease().jobId}]};}};
 const store=new M9PostgresUploadCheckpoints(new M9UploadCapabilitySealer(Buffer.alloc(32,1)),db);
 await store.initialize(lease());assert.match(calls[0].q,/cloud_overdracht_jobs/);assert(!String(calls[0].args[5]).includes('SECRET123'));
});
test('Checkpoint uses lease token, owner, account and old offset CAS condition',async()=>{
 const calls=[];const db={query:async(q,args)=>{calls.push({q,args});return{rows:[{job_id:lease().jobId}]};}};
 const store=new M9PostgresUploadCheckpoints(new M9UploadCapabilitySealer(Buffer.alloc(32,1)),db);
 await store.checkpoint(lease(),{offset:500,state:'uploading'});assert.match(calls[0].q,/confirmed_offset=\$14/);assert.deepEqual(calls[0].args.slice(0,5),[lease().jobId,'user','prive','abc','dropbox']);
});
test('Checkpoint CAS failure rejects expired or revoked lease',async()=>{
 const store=new M9PostgresUploadCheckpoints(new M9UploadCapabilitySealer(Buffer.alloc(32,1)),{query:async()=>({rows:[]})});
 await assert.rejects(store.checkpoint(lease(),{offset:500,state:'uploading'}),e=>e.code==='CLOUD_M9_CHECKPOINT_CONCURRENT_OR_REVOKED');
});
test('Stale leases are quarantined instead of blindly resumed',async()=>{
 const calls=[];const store=new M9PostgresUploadCheckpoints(new M9UploadCapabilitySealer(Buffer.alloc(32,1)),{query:async(q)=>{calls.push(q);return{rows:[{job_id:'job'}]};}});
 assert.equal(await store.quarantineExpired(),1);assert.match(calls[0],/status='review_required'/);
});
