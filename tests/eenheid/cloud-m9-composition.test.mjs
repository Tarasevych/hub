import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}})();
const root=new URL('../../',import.meta.url);
function src(file,replacements={}){let code=readFileSync(new URL(file,root),'utf8');for(const [a,b] of Object.entries(replacements))code=code.replaceAll(a,b);
 const result=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});assert(!result.diagnostics.some(d=>d.category===ts.DiagnosticCategory.Error));return 'data:text/javascript;base64,'+Buffer.from(result.outputText).toString('base64');}
const base=src('backend/cloud-overdracht-adapters.ts');const xml=src('backend/cloud-m9-xml.ts',{"'./cloud-overdracht-adapters'":`'${base}'`});
const m8=src('backend/cloud-m8-directory.ts',{"'./cloud-overdracht-adapters'":`'${base}'`});
const m9=src('backend/cloud-m9-directory.ts',{"'./cloud-overdracht-adapters'":`'${base}'`,"'./cloud-m9-xml'":`'${xml}'`});
const composition=src('backend/cloud-m9-directory-composition.ts',{"'./cloud-m8-directory'":`'${m8}'`,"'./cloud-m9-directory'":`'${m9}'`});
const {createCloudM9DirectoryDrivers}=await import(composition);
const resolver=async()=> 'stub';
test('M9 composition provides 11 unique first-wave adapters, none registered into production by default',()=>{
 const dep={token:resolver,graphDrive:resolver,githubScope:resolver,pcloudRegion:resolver,nextcloud:resolver,egress:async()=>false,awsS3:resolver,backblazeB2:resolver};
 const providers=createCloudM9DirectoryDrivers(dep).map(x=>x.provider);
 assert.equal(providers.length,11);assert.equal(new Set(providers).size,11);
 for(const required of ['nextcloud','s3','backblaze-b2','google-drive','onedrive-business','sharepoint','dropbox','box','pcloud','github','onedrive-personal'])assert(providers.includes(required));
});
test('M9 composition refuses missing server-only credential resolver',()=>{
 assert.throws(()=>createCloudM9DirectoryDrivers({token:resolver}),/CLOUD_M9_MISSING_VERIFIED_RESOLVER/);
});
