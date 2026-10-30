import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const TS=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root=new URL('../../',import.meta.url);
function source(rel,replacements={}){
 let code=readFileSync(new URL(rel,root),'utf8');for(const [a,b] of Object.entries(replacements))code=code.replaceAll(a,b);
 const result=TS.transpileModule(code,{compilerOptions:{target:TS.ScriptTarget.ES2022,module:TS.ModuleKind.ESNext,jsx:TS.JsxEmit.ReactJSX},reportDiagnostics:true});
 const errors=result.diagnostics?.filter(d=>d.category===TS.DiagnosticCategory.Error)||[];
 assert.equal(errors.length,0,errors.map(x=>x.messageText).join('\n'));
 return 'data:text/javascript;base64,'+Buffer.from(result.outputText).toString('base64');
}
const shared=source('shared/cloud-m5-catalogus.ts');
const CAT=await import(shared);
// Load transport base module once and substitute only direct imports in the new drivers.
const base=source('backend/cloud-overdracht-adapters.ts');
const replace={"'./cloud-overdracht-adapters'":`'${base}'`};
const T=await import(base);
const P=await import(source('backend/cloud-m5-pcloud.ts',replace));
const G=await import(source('backend/cloud-m5-github.ts',replace));
const B=await import(source('backend/cloud-m5-backblaze.ts',replace));
const loc=(provider,fileId='1',parentId)=>({context:{provider,userId:'owner1',space:'prive',accountId:'acc1'},fileId,parentId});
const enc=s=>new TextEncoder().encode(s);
const j=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
test('provider catalog has at least 10 distinct service families and names',()=>{
 assert(CAT.CLOUD_M5_BLUEPRINTS.length>=10);assert.equal(new Set(CAT.CLOUD_M5_BLUEPRINTS.map(x=>x.id)).size,CAT.CLOUD_M5_BLUEPRINTS.length);
 for(const e of CAT.CLOUD_M5_BLUEPRINTS){assert(e.apiReference.startsWith('https://'));assert(e.nativeCapabilities.length>0);}
});
test('no provider is marked ready when no live evidence exists',()=>{for(const p of CAT.FIRST_WAVE_PROVIDERS)assert.equal(CAT.resolveProviderReadiness(p,[]).ready,false)});
test('local fake readiness does not grant a provider operation',()=>{
 assert.deepEqual(CAT.providerOperationDecision('pcloud','upload',[],true,true),{allowed:false,reason:'DRIVER_NOT_LIVE_VERIFIED'});
});
test('GitHub cannot pretend to support native sharing and MOVE',()=>{
 assert.equal(CAT.providerOperationDecision('github','move',[],true,true).reason,'PROVIDER_DOES_NOT_SUPPORT');
 assert.equal(CAT.providerOperationDecision('github','share',[],true,true).reason,'PROVIDER_DOES_NOT_SUPPORT');
});
test('provider requires per-file ACL even after verified transport',()=>{
 const full=CAT.FIRST_WAVE_PROVIDERS.map(provider=>({provider,driver:'live-verified',onboarding:'live-verified',permissions:'live-verified',transfer:'live-verified',sharing:'live-verified',recovery:'live-verified',passedContractTests:true,liveEvidence:'ci://internal/verified-run'}));
 assert.equal(CAT.providerOperationDecision('dropbox','download',full,true,false).reason,'FILE_PERMISSION_MISSING');
 assert.equal(CAT.providerOperationDecision('dropbox','download',full,false,true).reason,'ACCOUNT_GRANT_MISSING');
 assert.equal(CAT.providerOperationDecision('dropbox','download',full,true,true).allowed,true);
});
test('pCloud uses region-selected API origin and verified bearer',async()=>{
 const calls=[];const a=new P.PCloudTransport(async()=> 'secret-grant',async()=> 'eapi.pcloud.com',async(u,init)=>{calls.push([u,init]);return j({result:0,metadata:{fileid:135,name:'test.txt',size:3,hash:500,contenttype:'text/plain'}})});
 const info=await a.stat(loc('pcloud','135'));assert.equal(info.size,3);assert(calls[0][0].startsWith('https://eapi.pcloud.com/stat?fileid=135'));
 assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].headers.Authorization,'Bearer secret-grant');
});
test('pCloud rejects user-selected foreign host before HTTP',async()=>{
 let requests=0;const a=new P.PCloudTransport(async()=> 'x',async()=> '169.254.169.254',async()=>{requests++;return j({result:0})});
 await assert.rejects(a.stat(loc('pcloud','2')),e=>e.code==='CLOUD_PCLOUD_HOST_NOT_APPROVED');assert.equal(requests,0);
});
test('pCloud rejects foreign CDN and does not leak bearer on data fetch',async()=>{
 const calls=[];const a=new P.PCloudTransport(async()=> 'supersecret',async()=> 'api.pcloud.com',async(u,init)=>{calls.push([u,init]);return j({result:0,hosts:['malicious.example'],path:'/file'})});
 await assert.rejects(a.download(loc('pcloud','135'),100),e=>e.code==='CLOUD_PCLOUD_CDN_NOT_APPROVED');assert.equal(calls.length,1);
});
test('pCloud CDN fetch uses no Authorization header',async()=>{
 const calls=[];const a=new P.PCloudTransport(async()=> 'supersecret',async()=> 'api.pcloud.com',async(u,init)=>{calls.push([u,init]);return calls.length===1?j({result:0,hosts:['c1.pcloud.com'],path:'/download/f'}):new Response('hello')});
 assert.equal(new TextDecoder().decode(await a.download(loc('pcloud','135'),20)),'hello');assert.equal(calls.length,2);
 assert(!JSON.stringify(calls[1][1]).includes('supersecret'));assert.equal(calls[1][1].redirect,'error');
});
test('pCloud upload rejects replace conflict and uses renameifexists',async()=>{
 const calls=[];const a=new P.PCloudTransport(async()=> 'ok',async()=> 'api.pcloud.com',async(u,opts)=>{calls.push([u,opts]);return j({result:0,metadata:[{fileid:22,size:5,hash:123}]})});
 assert.equal((await a.upload(loc('pcloud','0','0'),'test.txt',enc('hello'),'text/plain')).size,5);
 const body=calls[0][1].body;assert.equal(body.get('renameifexists'),'1');assert.equal(body.get('nopartial'),'1');
});
test('pCloud never accepts a fake conditional revision for delete',()=>{assert.equal(typeof P.PCloudTransport.prototype.deleteIfUnchanged,'undefined')});
test('GitHub requires preverified scope and reads repository Contents API',async()=>{
 const calls=[];const a=new G.GithubRepoTransport(async()=> 'token_x',async()=>({owner:'alice',repo:'docs',branch:'main'}),async(u,init)=>{calls.push([u,init]);return j({type:'file',path:'docs/a.txt',sha:'abcdef',size:5,name:'a.txt'})});
 const info=await a.stat(loc('github','docs/a.txt'));assert.equal(info.revision,'abcdef');assert(calls[0][0].includes('/repos/alice/docs/contents/docs/a.txt?ref=main'));
});
test('GitHub never allows path traversal or arbitrary URL in repo content',async()=>{
 let count=0;const a=new G.GithubRepoTransport(async()=> 't',async()=>({owner:'org',repo:'repo',branch:'main'}),async()=>{count++;return j({})});
 await assert.rejects(a.stat(loc('github','../private')),e=>e.code==='CLOUD_GITHUB_PATH_INVALID');assert.equal(count,0);
 await assert.rejects(a.stat(loc('github','https://host/x')),e=>e.code==='CLOUD_GITHUB_PATH_INVALID');
});
test('GitHub creates file using a commit, never a generic cloud PUT',async()=>{
 const calls=[];const a=new G.GithubRepoTransport(async()=> 'token',async()=>({owner:'team',repo:'repo',branch:'main'}),async(u,options)=>{calls.push([u,options]);return j({content:{path:'docs/new.txt',size:2,sha:'new-sha'}},201)});
 const r=await a.upload(loc('github','root','docs'),'new.txt',enc('hi'),'text/plain');assert.equal(r.revision,'new-sha');
 assert.equal(JSON.parse(calls[0][1].body).branch,'main');assert.match(calls[0][0],/\/repos\/team\/repo\/contents\/docs\/new.txt$/);
});
test('GitHub content read size must match decoded base64',async()=>{
 const a=new G.GithubRepoTransport(async()=> 'token',async()=>({owner:'team',repo:'repo',branch:'main'}),async()=>j({type:'file',encoding:'base64',content:'aGVsbG8=',size:5}));
 assert.equal(new TextDecoder().decode(await a.download(loc('github','a.txt'),100)),'hello');
});
test('GitHub avoids overwriting on conflict',async()=>{
 const a=new G.GithubRepoTransport(async()=> 'token',async()=>({owner:'team',repo:'repo',branch:'main'}),async()=>j({message:'Already exists'},422));
 await assert.rejects(a.upload(loc('github','root','docs'),'new.txt',enc('hi'),'text/plain'),e=>e.code==='CLOUD_GITHUB_WRITE_CONFLICT');
});
const b2Cred=async()=>({bucket:'customer-assets',region:'eu-central-003',prefix:'owner-a/',keyId:'1234567890abcdef',applicationKey:'abcdefghijklmnop1234'});
test('Backblaze B2 signs requests for regional pinned host, never AWS',async()=>{
 const calls=[];const a=new B.BackblazeB2Transport(b2Cred,async(u,init)=>{calls.push([u,init]);return new Response(null,{status:200,headers:{'content-length':'4','etag':'"sha"'}})},()=>new Date('2026-10-28T10:00:00Z'));
 const info=await a.stat(loc('backblaze-b2','docs/a.pdf'));assert.equal(info.size,4);
 assert.equal(calls[0][0],'https://s3.eu-central-003.backblazeb2.com/customer-assets/owner-a/docs/a.pdf');
 assert.match(calls[0][1].headers.authorization,/AWS4-HMAC-SHA256 Credential=/);
});
test('B2 uses if-none-match and validated prefix',async()=>{
 const calls=[];const a=new B.BackblazeB2Transport(b2Cred,async(u,init)=>{calls.push([u,init]);return new Response(null,{status:200,headers:{etag:'"u"'}})});
 const v=await a.upload(loc('backblaze-b2','root','folder/'),'n.txt',enc('yes'),'text/plain');assert.equal(v.id,'folder/n.txt');
 assert.equal(calls[0][1].headers['if-none-match'],'*');
});
test('B2 refuses invalid region, malformed bucket and traversal without network',async()=>{
 let n=0;const a=new B.BackblazeB2Transport(async()=>({...await b2Cred(),region:'evil.example'}),async()=>{n++;return new Response(null)});
 await assert.rejects(a.stat(loc('backblaze-b2','file')),e=>e.code==='CLOUD_B2_REGION_INVALID');assert.equal(n,0);
 const good=new B.BackblazeB2Transport(b2Cred,async()=>{n++;return new Response(null)});
 await assert.rejects(good.stat(loc('backblaze-b2','../secrets')),e=>e.code==='CLOUD_B2_INVALID_OBJECT_PATH');assert.equal(n,0);
});
test('B2 copy-recovery is not marked as complete until verified in live acceptance',()=>{
 assert.equal(CAT.resolveProviderReadiness('backblaze-b2',[]).ready,false);
});
const REG=await import(source('backend/cloud-m5-driver-registry.ts',{...replace,"'../shared/cloud-m5-catalogus'":`'${shared}'`}));
test('driver registry refuses unverified attestation and forged context',async()=>{
 const registry=new REG.CloudM5DriverRegistry(async()=>true);
 const mock={provider:'pcloud',stat:async()=>{},download:async()=>{},upload:async()=>{}};
 const proof={provider:'pcloud',buildSha:'a'.repeat(40),revision:'m5',authenticatedWithTrustedCI:true,liveProviderE2e:false};
 await assert.rejects(registry.register('pcloud',mock,proof),e=>e.code==='CLOUD_M5_DRIVER_NOT_ATTESTED');
 assert.equal(registry.available('pcloud'),false);
 await registry.register('pcloud',mock,{...proof,liveProviderE2e:true});
 assert.equal(registry.resolve(loc('pcloud','1'),loc('pcloud','1').context),mock);
 await assert.rejects(async()=>registry.resolve(loc('pcloud','1'),loc('pcloud','1').context&&{...loc('pcloud','1').context,accountId:'other'}),e=>e.code==='CLOUD_M5_CONTEXT_MISMATCH');
});
test('driver cannot register itself under another provider',async()=>{
 const registry=new REG.CloudM5DriverRegistry(async()=>true);
 await assert.rejects(registry.register('dropbox',{provider:'pcloud'},{provider:'dropbox',buildSha:'a'.repeat(40),revision:'m5',authenticatedWithTrustedCI:true,liveProviderE2e:true}),e=>e.code==='CLOUD_M5_DRIVER_PROVIDER_MISMATCH');
});
const PO=await import(source('backend/cloud-m5-pcloud-oauth.ts',replace));
const oauthConfig={clientId:'client-1',clientSecret:'server-secret',redirectUri:'https://api.tarasevych.com/api/owner/cloud/oauth/pcloud/callback'};
function flowRepo(){let row=null;const accounts=[];return {accounts,save:async x=>{row=x},consume:async hash=>{const old=row;row=null;return old?.stateHash===hash?old:null},upsertEncrypted:async x=>{accounts.push(x);return {accountId:'acc-pcloud'}}}}
test('pCloud OAuth code flow uses server redirect, state, and no implicit token',async()=>{
 const store=flowRepo();const manager=new PO.PCloudOAuthM5(store,oauthConfig);const first=await manager.start({owner:'alice',space:'prive'},'read');
 assert(first.url.startsWith('https://my.pcloud.com/oauth2/authorize?'));const u=new URL(first.url);assert.equal(u.searchParams.get('response_type'),'code');assert.equal(u.searchParams.get('client_secret'),null);
});
test('pCloud callback validates location, consumes state once, stores only server-side',async()=>{
 const store=flowRepo();const calls=[];const manager=new PO.PCloudOAuthM5(store,oauthConfig,async(u,init)=>{calls.push([u,init]);return j({result:0,token_type:'bearer',access_token:'secure-token',uid:34535})});
 const {url}=await manager.start({owner:'alice',space:'prive'},'write');const state=new URL(url).searchParams.get('state');
 const arg={state,code:'auth-code',hostname:'eapi.pcloud.com',locationid:'2'};
 const result=await manager.complete({owner:'alice',space:'prive'},arg);assert.equal(result.accountId,'acc-pcloud');
 assert.equal(store.accounts[0].subject,'34535');assert.equal(store.accounts[0].apiHost,'eapi.pcloud.com');
 assert.equal(calls[0][0],'https://eapi.pcloud.com/oauth2_token');assert.equal(calls[0][1].redirect,'error');
 await assert.rejects(manager.complete({owner:'alice',space:'prive'},arg),e=>e.code==='CLOUD_PCLOUD_OAUTH_STATE_INVALID');
});
test('pCloud cannot attach grant to different owner or technical space',async()=>{
 const store=flowRepo();let calls=0;const manager=new PO.PCloudOAuthM5(store,oauthConfig,async()=>{calls++;return j({result:0})});
 const {url}=await manager.start({owner:'alice',space:'prive'},'write');const state=new URL(url).searchParams.get('state');
 await assert.rejects(manager.complete({owner:'bob',space:'prive'},{state,code:'x',hostname:'api.pcloud.com',locationid:'1'}),e=>e.code==='CLOUD_PCLOUD_OAUTH_STATE_INVALID');assert.equal(calls,0);
});
test('pCloud refuses mismatched EU and US callback hosts before token exchange',async()=>{
 const store=flowRepo();let calls=0;const manager=new PO.PCloudOAuthM5(store,oauthConfig,async()=>{calls++;return j({result:0})});
 const {url}=await manager.start({owner:'alice',space:'prive'},'read');const state=new URL(url).searchParams.get('state');
 await assert.rejects(manager.complete({owner:'alice',space:'prive'},{state,code:'x',hostname:'attacker.example',locationid:'2'}),e=>e.code==='CLOUD_PCLOUD_REGION_CALLBACK_INVALID');assert.equal(calls,0);
});
const GOV=await import(source('backend/cloud-m5-governor.ts',{...replace,"'../shared/cloud-m5-catalogus'":`'${shared}'`}));
const owner={userId:'owner1',isSiteOwner:true,isTechnicalSession:true,reason:'provider acceptance reviewed'};
function policyStore(){let p=null;let log=[];return {log,read:async()=>p,changeWithAudit:async(prev,next,reason)=>{if((p?.revision||0)!==(prev?.revision||0))return false;p=next;log.push({provider:next.provider,reason});return true}}}
test('operator cannot enable provider before live acceptance proof',async()=>{
 const db=policyStore(),governor=new GOV.CloudM5Governor(db,async()=>false);
 await assert.rejects(governor.set(owner,'box',0,{allowNewConnections:true,allowExistingOperations:true}),e=>e.code==='CLOUD_M5_PROVIDER_NOT_ACCEPTED');
 assert.equal((await governor.status('box')).allowNewConnections,false);assert.equal(db.log.length,0);
});
test('only a site owner in technical session can change a provider policy',async()=>{
 const g=new GOV.CloudM5Governor(policyStore(),async()=>true);
 await assert.rejects(g.set({...owner,isTechnicalSession:false},'box',0,{allowNewConnections:true,allowExistingOperations:true}),e=>e.code==='CLOUD_M5_OWNER_TECH_PROFILE_REQUIRED');
 await assert.rejects(g.set({...owner,isSiteOwner:false},'box',0,{allowNewConnections:true,allowExistingOperations:true}),e=>e.code==='CLOUD_M5_OWNER_TECH_PROFILE_REQUIRED');
});
test('owner policy uses compare-and-swap and audit even for disabling',async()=>{
 const store=policyStore(),g=new GOV.CloudM5Governor(store,async()=>true);
 const p=await g.set(owner,'box',0,{allowNewConnections:true,allowExistingOperations:true});assert.equal(p.revision,1);
 const next=await g.set(owner,'box',1,{allowNewConnections:false,allowExistingOperations:false});assert.equal(next.revision,2);
 assert.equal(store.log.length,2);await assert.rejects(g.set(owner,'box',1,{allowNewConnections:true,allowExistingOperations:true}),e=>e.code==='CLOUD_M5_POLICY_VERSION_CONFLICT');
});
