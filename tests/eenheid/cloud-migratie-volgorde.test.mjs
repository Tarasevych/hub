// Regression test: Cloud migration identifiers may never shadow the parallel release's migrations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
const root=new URL('../../migrations/',import.meta.url);
const all=readdirSync(root).filter(name=>name.endsWith('.sql')&&name!=='rechten.sql').sort();
test('every numbered migration has a unique number and valid name',()=>{
 const names=new Set();
 for(const file of all){assert.match(file,/^\d{4}_[a-z0-9_]+\.sql$/);const nr=file.slice(0,4);
  assert(!names.has(nr),`duplicate migration number: ${nr} (${file})`);names.add(nr);}
});
test('parallel workbench migration remains unchanged and Cloud follows it',()=>{
 assert(all.includes('0116_werkblad_blokken.sql'));
 for(const file of ['0117_cloud_overdracht_jobs.sql','0118_cloud_move_proofs.sql','0119_cloud_share_receipts.sql','0120_cloud_multi_account_connections.sql','0121_cloud_provider_governance.sql','0122_cloud_m9_upload_checkpoints.sql'])assert(all.includes(file),`missing ${file}`);
 const files=all.filter(x=>Number(x.slice(0,4))>=117&&x.includes('cloud_'));
 assert.equal(files.length,6);
});
test('FK dependencies are created after their referenced Cloud job table',()=>{
 const n=(x)=>all.indexOf(x);
 assert(n('0117_cloud_overdracht_jobs.sql')<n('0118_cloud_move_proofs.sql'));
 assert(n('0117_cloud_overdracht_jobs.sql')<n('0122_cloud_m9_upload_checkpoints.sql'));
 for(const file of ['0118_cloud_move_proofs.sql','0122_cloud_m9_upload_checkpoints.sql']){
  const sql=readFileSync(new URL(file,root),'utf8');assert(sql.includes('REFERENCES app.cloud_overdracht_jobs(id)'));
 }
});
