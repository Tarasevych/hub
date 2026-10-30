import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import{execFileSync}from'node:child_process';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root=new URL('../../',import.meta.url);
const src=name=>readFileSync(new URL(name,root),'utf8');
const compiled=(name,replacements={})=>{let s=src(name);for(const [a,b]of Object.entries(replacements))s=s.replaceAll(a,b);
 const o=ts.transpileModule(s,{fileName:name,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
 assert.deepEqual(o.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error),[]);return'data:text/javascript;base64,'+Buffer.from(o.outputText).toString('base64');};
const base=compiled('backend/cloud-overdracht-adapters.ts');const directory=compiled('backend/cloud-m8-directory.ts',{"'./cloud-overdracht-adapters'":`'${base}'`});
const {GoogleDriveDirectory}=await import(directory);
const ctx={provider:'google-drive',accountId:'google-a',userId:'u',space:'prive'};
test('M10: hostile chunked provider response is rejected after at most 1 MiB despite absent Content-Length',async()=>{
 let called=0;
 const driver=new GoogleDriveDirectory(async()=> 'only-test',async()=>new Response(new ReadableStream({pull(c){called++;c.enqueue(new Uint8Array(64*1024).fill(65));}}),{status:200,headers:{'Content-Type':'application/json'}}));
 await assert.rejects(driver.list(ctx,'root',null),e=>e?.code==='CLOUD_M8_RESPONSE_TOO_LARGE');
 assert(called<100,'provider response must not be fully buffered');
});
test('M10: new frontend is reachable only through an explicit build-stage flag and preserves existing Drive',()=>{
 const cloud=src('src/CloudFunctioneelWeergave.tsx');const nav=src('src/VerenigdDienstApp.tsx');
 assert(cloud.includes('VITE_CLOUD_FULL_STAGING'));assert(cloud.includes('CLOUD_M10_STAGE&&effectiveTab'));assert(nav.includes('CLOUD_M10_STAGE?[{id:\'files\''));
 assert(cloud.includes('<CloudAccountsPanel'));assert(cloud.includes('DriveBrowser'));
});
test('M10: release preflight always rejects absent real provider evidence and missing runtime',()=>{
 try{execFileSync(process.execPath,['scripts/cloud-m10-release-preflight.mjs'],{cwd:new URL('../../',import.meta.url).pathname,stdio:'pipe'});assert.fail('must block');}
 catch(e){assert.equal(e.status,2);const obj=JSON.parse(e.stdout.toString('utf8'));
 assert.equal(obj.decision,'BLOCKED');assert(obj.checks.some(x=>x.id==='all-eleven-runtime-resolvers-live'&&!x.passed));assert.equal(obj.attestation.valid,false);}
});

test('M10: admin controls are only on admin host with live owner, technical tab and strong step-up',()=>{
 const backend=src('backend/cloud-m10-admin-bridge.ts'); const admin=src('src/BeheerConsoleWeergave.tsx');
 assert(backend.includes("a.service!=='admin'"));
 assert(backend.includes('TAB_RE.test(tab)'));
 assert(backend.includes('actieveActivatie(a.user.id,tab)'));
 assert(backend.includes('isEigenaar('));
 assert(backend.includes('const challenged=await stepUp(ctx,who.auth)'));
 assert(backend.includes("process.env.CLOUD_M10_ADMIN_STAGING==='enabled'"));
 assert(admin.includes('CLOUD_M10_STAGE&&'));
 assert(admin.includes('CloudM10Governance'));
});
