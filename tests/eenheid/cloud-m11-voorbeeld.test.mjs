import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root=new URL('../../',import.meta.url);
const src=(p)=>readFileSync(new URL(p,root),'utf8');
const moduleUrl=(path,replace={})=>{let code=src(path);for(const [a,b]of Object.entries(replace))code=code.replaceAll(a,b);
 const out=ts.transpileModule(code,{fileName:path,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
 assert.deepEqual(out.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
 return 'data:text/javascript;base64,'+Buffer.from(out.outputText).toString('base64');};
const adapter=moduleUrl('backend/cloud-overdracht-adapters.ts');
const preview=moduleUrl('backend/cloud-m11-voorbeeld.ts',{"'./cloud-overdracht-adapters'":`'${adapter}'`});
const {CloudM11PreviewService}=await import(preview);
const ctx={owner:'user-1',space:'prive'};
const bytes=Buffer.from('%PDF-1.7\nHello secure reader');
const stat=()=>({id:'doc42',name:'document.pdf',size:bytes.length,mime:'application/pdf',revision:'rev-1',isFolder:false,canRead:true,canWrite:false});
function fixture({account={},before={},after={},payload=bytes,driverProvider='google-drive',guard=()=>{}}={}){
 const saved={id:'a-1',provider:'google-drive',owner:'user-1',space:'prive',status:'connected',label:'My Drive',...account};
 let count=0,reads=0;
 const scope={async authorizedAccount(principal,id){guard();if(id!==saved.id||principal.owner!==saved.owner||principal.space!==saved.space)throw Object.assign(new Error('DENIED'),{code:'DENIED'});return saved;}};
 const driver={provider:driverProvider,async stat(){return {...stat(),...(count++?after:before)}},async download(){reads++;return payload;},async upload(){throw Error('MUST_NOT_WRITE');}};
 const service=new CloudM11PreviewService(scope,[driver]);
 return{service,read:()=>service.read(ctx,{accountId:'a-1',fileId:'doc42',expectedRevision:'rev-1'}),get reads(){return reads;}};
}
test('M11: returns revision-bound bytes and SHA256 for an authorized account',async()=>{
 const x=fixture(),v=await x.read();assert.equal(v.dataBase64,bytes.toString('base64'));assert.equal(v.sha256,createHash('sha256').update(bytes).digest('hex'));
 assert.equal(v.security,'SERVER_DELEGATED_NOT_E2EE');assert.equal(x.reads,1);assert(!JSON.stringify(v).includes('accessToken'));
});
test('M11: refuses a different owner and another space',async()=>{
 await assert.rejects(fixture({account:{owner:'other'}}).read());
 await assert.rejects(fixture({account:{space:'technisch'}}).read());
});
test('M11: refuses unsupported provider and mismatched driver',async()=>{
 await assert.rejects(fixture({driverProvider:'dropbox'}).read(),e=>e.code==='CLOUD_PREVIEW_PROVIDER_NOT_VERIFIED');
});
test('M11: a forged filename with HTML MIME is never previewed',async()=>{
 const x=fixture({before:{name:'attack.pdf',mime:'text/html'}});
 await assert.rejects(x.read(),e=>e.code==='CLOUD_PREVIEW_FORMAT_NOT_ALLOWED');assert.equal(x.reads,0);
});
test('M11: disallowed extensions and folders are rejected before download',async()=>{
 for(const first of [{name:'script.svg'},{name:'payload.exe'},{isFolder:true},{canRead:false}]){
  const f=fixture({before:first});await assert.rejects(f.read());assert.equal(f.reads,0);
 }
});
test('M11: file too large rejected without reading content',async()=>{
 const x=fixture({before:{size:9*1024*1024}});await assert.rejects(x.read(),e=>e.status===413);assert.equal(x.reads,0);
});
test('M11: revision mismatch before download is rejected',async()=>{
 const x=fixture({before:{revision:'rev-2'}});await assert.rejects(x.read(),e=>e.code==='CLOUD_PREVIEW_REVISION_CHANGED');assert.equal(x.reads,0);
});
test('M11: revision changed during download produces failure, never bytes',async()=>{
 const x=fixture({after:{revision:'rev-2'}});await assert.rejects(x.read(),e=>e.code==='CLOUD_PREVIEW_CHANGED_DURING_READ');
});
test('M11: different byte count is refused even with unchanged revision',async()=>{
 const x=fixture({payload:new Uint8Array([1,2])});await assert.rejects(x.read(),e=>e.code==='CLOUD_PREVIEW_SIZE_CHANGED');
});
test('M11: missing expectedRevision rejected',async()=>{
 const x=fixture();await assert.rejects(x.service.read(ctx,{accountId:'a-1',fileId:'doc42',expectedRevision:''}),e=>e.status===400);
});
test('M11: multiple drivers with same provider rejected',async()=>{
 const fake={provider:'dropbox'};assert.throws(()=>new CloudM11PreviewService({authorizedAccount:async()=>{}},[fake,fake]),e=>e.code==='CLOUD_PREVIEW_DUPLICATE_DRIVER');
});
test('M11: stage-only web endpoint and no-store are present in source',()=>{
 const r=src('backend/cloud-m11-voorbeeld-routes.ts');assert(r.includes("CLOUD_M11_PREVIEW_STAGING==='enabled'"));
 assert(r.includes("auth.service!=='cloud'"));assert(r.includes('Cache-Control'));assert(r.includes("'no-cache'"));
 assert(src('backend/cloud-platform.ts').includes('...createM11CloudPreviewRoutes(authorize,createM11StagingPreviewRuntime(stagedDirectory))'));
});
test('M11: existing Cloud menus and file viewer reused; no duplicate global chrome',()=>{
 const ui=src('src/cloud/CloudM10Verkenner.tsx');assert(ui.includes('openUniverseelBestand'));assert(ui.includes('expectedRevision:file.revision'));assert(ui.includes('data.security'));assert(ui.includes('previewSequence.current'));assert(ui.includes('SERVER_DELEGATED_NOT_E2EE'));
});
test('M11: root folder identifiers mapped to provider-specific root',()=>{
 const s=src('backend/cloud-m8-directory.ts');assert(s.includes("folder==='root'?'0'"));assert(s.includes("if(folder==='root')folder='0'"));
});
test('M11: rejects a fake PDF body even if provider reports PDF',async()=>{
 const x=fixture({payload:Buffer.from('<html>not-a-pdf-at-all!!</html>'),before:{size:32}});
 await assert.rejects(x.read(),e=>e.code==='CLOUD_PREVIEW_SIZE_CHANGED'||e.code==='CLOUD_PREVIEW_FILE_SIGNATURE_MISMATCH');
 const raw=Buffer.from('HTMLFAKE'.padEnd(bytes.length,'?'));
 await assert.rejects(fixture({payload:raw}).read(),e=>e.code==='CLOUD_PREVIEW_FILE_SIGNATURE_MISMATCH');
});
test('M11: a revoked account during remote download must not receive bytes',async()=>{
 let n=0;
 const fake={provider:'google-drive',async stat(){return stat()},async download(){return bytes},async upload(){throw Error('do not upload')}};
 const manager={async authorizedAccount(){n++;return {id:'a-1',owner:'user-1',space:'prive',provider:'google-drive',label:'Drive',status:n===2?'revoked':'connected'};}};
 const service=new CloudM11PreviewService(manager,[fake]);
 await assert.rejects(service.read(ctx,{accountId:'a-1',fileId:'doc42',expectedRevision:'rev-1'}),e=>e.code==='CLOUD_PREVIEW_REVOKED_DURING_READ');
});
test('M11: a forbidden SVG MIME is refused even with an innocuous extension',async()=>{
 const x=fixture({before:{mime:'image/svg+xml'}});
 await assert.rejects(x.read(),e=>e.code==='CLOUD_PREVIEW_FORMAT_NOT_ALLOWED');
});
test('M11: client checks cryptographic digest before showing a remote file',()=>{
 const ui=src('src/cloud/CloudM10Verkenner.tsx');assert(ui.includes("crypto.subtle.digest('SHA-256',bytes)"));
 assert(ui.includes('CLOUD_M11_SHA256_MISMATCH'));assert(ui.includes('previewSequence.current'));
});

test('M11: HTML and SVG MIME parameters cannot bypass the forbidden list',async()=>{
 for(const mime of ['text/html; charset=UTF-8','image/svg+xml;charset=utf-8']){
  const x=fixture({before:{mime}});await assert.rejects(x.read(),e=>e.code==='CLOUD_PREVIEW_FORMAT_NOT_ALLOWED');
 }
});

test('M11: revalidation must not switch account owner or security space while downloading',async()=>{
 for(const rebind of [{owner:'other'},{space:'technisch'}]){
  let count=0;
  const driver={provider:'google-drive',async stat(){return stat()},async download(){return bytes}};
  const scope={async authorizedAccount(){count++;return{id:'a-1',owner:'user-1',space:'prive',provider:'google-drive',label:'Drive',status:'connected',...(count>1?rebind:{})}}};
  const service=new CloudM11PreviewService(scope,[driver]);
  await assert.rejects(service.read(ctx,{accountId:'a-1',fileId:'doc42',expectedRevision:'rev-1'}),e=>e.code==='CLOUD_PREVIEW_REVOKED_DURING_READ');
 }
});
