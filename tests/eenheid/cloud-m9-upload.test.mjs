import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}})();
const root=new URL('../../',import.meta.url);
function m(file,replace={}){let code=readFileSync(new URL(file,root),'utf8');for(const [k,v] of Object.entries(replace))code=code.replaceAll(k,v);
 const output=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
 assert(!output.diagnostics.some(d=>d.category===ts.DiagnosticCategory.Error));return 'data:text/javascript;base64,'+Buffer.from(output.outputText).toString('base64');}
const base=m('backend/cloud-overdracht-adapters.ts');const importer=m('backend/cloud-m9-upload-sessions.ts',{"'./cloud-overdracht-adapters'":`'${base}'`});
const {M9ChunkUploader}=await import(importer);
const graph=()=>({jobId:'job1',owner:'user1',space:'prive',accountId:'acc1',provider:'onedrive-personal',total:1_000_000,offset:0,session:'https://example.up.1drv.com/upload?token=x',target:'folder',name:'a.pdf',leaseId:'lease',expectedRevision:'e1'});
const drop=()=>({...graph(),provider:'dropbox',total:8_388_610,session:'session:abcde12345',target:'/data/a.pdf'});
const read=(o,len)=>new Uint8Array(len).fill(4);
const state=()=>{const history=[];return{store:{checkpoint:async(l,d)=>history.push({l,d})},history};};
test('Graph: sends exact Content-Range with no bearer and persists 202 offset',async()=>{
 const {store,history}=state(),requests=[];
 const worker=new M9ChunkUploader(store,async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify({nextExpectedRanges:['1000000-']}),{status:202});});
 const result=await worker.advanceGraph(graph(),read);assert.equal(result.offset,1_000_000);assert.equal(result.state,'uploading');
 assert.equal(history.length,1);assert.equal(requests[0].init.headers['Content-Range'],'bytes 0-999999/1000000');
 assert.equal(requests[0].init.headers.Authorization,undefined);
});
test('Graph: final 201 is staged as uploaded_not_verified, not completed',async()=>{
 const {store,history}=state(),worker=new M9ChunkUploader(store,async()=>new Response(JSON.stringify({id:'file1',size:1_000_000,eTag:'v1'}),{status:201}));
 const x=await worker.advanceGraph(graph(),read);assert.equal(x.state,'uploaded_not_verified');assert.equal(x.remoteId,'file1');assert.equal(history.at(-1).d.state,'uploaded_not_verified');
});
test('Graph: refuses malicious upload-session URL before reading any bytes',async()=>{
 const worker=new M9ChunkUploader(state().store,async()=>{throw Error('Unexpected');});
 await assert.rejects(worker.advanceGraph({...graph(),session:'https://127.0.0.1/upload'},()=>{throw Error('read must not happen');}),e=>e.code==='CLOUD_M9_GRAPH_SESSION_HOST_UNTRUSTED');
});
test('Graph: ambiguous connection failure persists review_required, not retry',async()=>{
 const {store,history}=state(),worker=new M9ChunkUploader(store,async()=>{throw Error('network abort');});
 await assert.rejects(worker.advanceGraph(graph(),read),e=>e.code==='CLOUD_M9_GRAPH_UNKNOWN_REMOTE_OFFSET');
 assert.equal(history.length,1);assert.equal(history[0].d.state,'review_required');assert.equal(history[0].d.offset,0);
});
test('Graph: mismatch on 202 checkpoint requires review rather than silently skipping data',async()=>{
 const {store,history}=state(),worker=new M9ChunkUploader(store,async()=>new Response(JSON.stringify({nextExpectedRanges:['500000-']}),{status:202}));
 await assert.rejects(worker.advanceGraph(graph(),read),e=>e.code==='CLOUD_M9_GRAPH_UNEXPECTED_NEXT_RANGE');assert.equal(history[0].d.state,'review_required');
});
test('Graph: wrong range reader size blocks upload',async()=>{
 const worker=new M9ChunkUploader(state().store,async()=>{throw Error('HTTP must not happen');});
 await assert.rejects(worker.advanceGraph(graph(),async()=>new Uint8Array(3)),e=>e.code==='CLOUD_M9_RANGE_READ_MISMATCH');
});
test('Dropbox: session append uses checked offset and no autorename',async()=>{
 const {store,history}=state(),requests=[];const worker=new M9ChunkUploader(store,async(url,init)=>{requests.push({url,init});return new Response('{}',{status:200});});
 const result=await worker.advanceDropbox(drop(),read,async()=> 'abcdefghijk1234567');assert.equal(result.offset,4*1024*1024);assert.equal(result.state,'uploading');
 assert(requests[0].url.endsWith('/upload_session/append_v2'));const arg=JSON.parse(requests[0].init.headers['Dropbox-API-Arg']);assert.equal(arg.cursor.offset,0);
 assert.equal(history[0].d.offset,4*1024*1024);
});
test('Dropbox: final chunk calls finish, no rename, returns verification-pending',async()=>{
 const {store,history}=state();const inputs=[];const worker=new M9ChunkUploader(store,async(url,init)=>{inputs.push({url,init});return new Response(JSON.stringify({id:'id:12345',size:8_388_610,rev:'r1'}),{status:200});});
 const lease={...drop(),offset:8_388_608};const result=await worker.advanceDropbox(lease,read,async()=> 'abcdefghijk1234567');assert.equal(result.state,'uploaded_not_verified');
 assert(inputs[0].url.endsWith('/upload_session/finish'));const args=JSON.parse(inputs[0].init.headers['Dropbox-API-Arg']);
 assert.equal(args.commit.autorename,false);assert.equal(args.cursor.offset,8_388_608);assert.equal(history[0].d.state,'uploaded_not_verified');
});
test('Dropbox: bad scope provider is rejected before token resolution',async()=>{
 const worker=new M9ChunkUploader(state().store,async()=>{throw Error('unexpected');});
 await assert.rejects(worker.advanceDropbox(graph(),read,async()=>{throw Error('should not be called');}),e=>e.code==='CLOUD_M9_DROPBOX_PROVIDER_INVALID');
});
test('Dropbox: unknown upload result enters manual review',async()=>{
 const {store,history}=state(),worker=new M9ChunkUploader(store,async()=>new Response('{}',{status:409}));
 await assert.rejects(worker.advanceDropbox(drop(),read,async()=> 'abcdefghijk1234567'),e=>e.code==='CLOUD_M9_DROPBOX_CHUNK_UNCERTAIN');
 assert.equal(history[0].d.state,'review_required');
});
