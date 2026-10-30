import{test}from'node:test';import assert from'node:assert/strict';import {createRequire} from'node:module';import{readFileSync}from'node:fs';
const require=createRequire(import.meta.url);let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=new URL('../../',import.meta.url);
const text=readFileSync(new URL('backend/cloud-versies-m3.ts',root),'utf8');
const transport=readFileSync(new URL('backend/cloud-overdracht-adapters.ts',root),'utf8');
const ta=ts.transpileModule(transport,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const mod=(s)=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');const uri=mod(ta);
const tc=ts.transpileModule(text.replaceAll("'./cloud-overdracht-adapters'",`'${uri}'`),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {ProviderVersionHistory}=await import(mod(tc));
const l=(provider,fileId='file-1')=>({context:{provider,space:'prive',userId:'owner-1',accountId:'account1'},fileId});
const response=(obj)=>new Response(JSON.stringify(obj),{status:200});
test('Drive revisions use correct resource and expose completeness warning',async()=>{
 const requests=[];const x=new ProviderVersionHistory(async()=> 'valid-token',async(u,o)=>{requests.push([u,o]);return response({revisions:[{id:'r1',modifiedTime:'2026-10-01T12:00:00Z',size:'20'}],nextPageToken:'next'})});
 const data=await x.list(l('google-drive'));assert.equal(data.versions.length,1);assert.equal(data.complete,false);assert.match(requests[0][0],/revisions\?fields=/);
});
test('Graph SharePoint versions require trusted drive mapping',async()=>{
 const x=new ProviderVersionHistory(async()=> 'valid-token',async()=>response({value:[{id:'2.0',lastModifiedDateTime:'2026-10-01T12:00:00Z',size:11}]}),async()=> 'drive1');
 const data=await x.list(l('sharepoint'));assert.equal(data.versions[0].id,'2.0');assert.equal(data.complete,true);
 const blocked=new ProviderVersionHistory(async()=> 'valid-token',async()=>response({}));
 await assert.rejects(blocked.list(l('sharepoint')),e=>e.code==='CLOUD_VERSIONS_SHAREPOINT_DRIVE_MISSING');
});
test('Dropbox revisions are path-bound and limited',async()=>{
 const calls=[];const x=new ProviderVersionHistory(async()=> 'valid-token',async(u,o)=>{calls.push([u,o]);return response({entries:[{rev:'0123456789abcdef',size:13,server_modified:'2026-10-01T00:00:00Z'}]})});
 const data=await x.list(l('dropbox','id:abcdefgh'));assert.equal(data.versions[0].size,13);assert.equal(JSON.parse(calls[0][1].body).limit,100);
 await assert.rejects(x.list(l('dropbox','../bad')),e=>e.code==='CLOUD_VERSIONS_DROPBOX_PATH_INVALID');
});
test('Box versions reflect account retention and response count',async()=>{
 const x=new ProviderVersionHistory(async()=> 'valid-token',async()=>response({entries:[{id:'version1',modified_at:'2026-10-01T00:00:00Z',size:5}],total_count:2}));
 const data=await x.list(l('box','123'));assert.equal(data.complete,false);assert.equal(data.versions.length,1);
});
test('Unknown provider does not claim to support versions',async()=>{
 const x=new ProviderVersionHistory(async()=> 'valid-token',async()=>response({}));
 await assert.rejects(x.list(l('nextcloud')),e=>e.code==='CLOUD_VERSIONS_PROVIDER_NOT_IMPLEMENTED');
});
