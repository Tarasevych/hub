import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const TS=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root=new URL('../../',import.meta.url);
function moduleUrl(file,replace={}){let content=readFileSync(new URL(file,root),'utf8');
 for(const[k,v]of Object.entries(replace)){assert(content.includes(k));content=content.replaceAll(k,v);}
 const output=TS.transpileModule(content,{compilerOptions:{target:TS.ScriptTarget.ES2022,module:TS.ModuleKind.ESNext},reportDiagnostics:true});
 assert.equal((output.diagnostics||[]).filter(x=>x.category===TS.DiagnosticCategory.Error).length,0);
 return 'data:text/javascript;base64,'+Buffer.from(output.outputText).toString('base64');}
const errorUrl='data:text/javascript;base64,'+Buffer.from('export class CloudTransportError extends Error{constructor(code,status=502){super(code);this.code=code;this.status=status}}').toString('base64');
const catalog=moduleUrl('shared/cloud-m5-catalogus.ts');
const pgUrl='data:text/javascript;base64,'+Buffer.from('export class PostgresCloudProviderPolicies{};export const postgresCiVerifier=async()=>false').toString('base64');
const mod=await import(moduleUrl('backend/cloud-m6-aanbieder-gate.ts',{
 "'./cloud-overdracht-adapters'":`'${errorUrl}'`,"'./cloud-m6-bestuur-pg'":`'${pgUrl}'`,"'../shared/cloud-m5-catalogus'":`'${catalog}'`
}));
const store=(policy)=>({read:async()=>policy});const allows={allowNewConnections:true,allowExistingOperations:true};
test('unknown provider refused',async()=>assert.rejects(mod.assertCloudProviderEnabled('random','connect',store(allows),async()=>true),e=>e.code==='CLOUD_PROVIDER_UNKNOWN'));
test('default deny refuses new connections',async()=>assert.rejects(mod.assertCloudProviderEnabled('dropbox','connect',store(null),async()=>true),e=>e.code==='CLOUD_M6_PROVIDER_POLICY_DISABLED'));
test('new connection blocked if operations policy alone is enabled',async()=>assert.rejects(mod.assertCloudProviderEnabled('dropbox','connect',store({allowNewConnections:false,allowExistingOperations:true}),async()=>true),e=>e.code==='CLOUD_M6_PROVIDER_POLICY_DISABLED'));
test('existing operation blocked if only connect is enabled',async()=>assert.rejects(mod.assertCloudProviderEnabled('dropbox','operate',store({allowNewConnections:true,allowExistingOperations:false}),async()=>true),e=>e.code==='CLOUD_M6_PROVIDER_POLICY_DISABLED'));
test('operator cannot override missing signed CI',async()=>assert.rejects(mod.assertCloudProviderEnabled('dropbox','operate',store(allows),async()=>false),e=>e.code==='CLOUD_M6_PROVIDER_LIVE_PROOF_MISSING'));
test('operation allowed only if both policy and CI proof valid',async()=>assert.equal(await mod.assertCloudProviderEnabled('dropbox','operate',store(allows),async()=>true),undefined));
test('list, disconnect remain separate from blocking operation gate',()=>{
 const src=readFileSync(new URL('backend/cloud-verbinding-m4-routes.ts',root),'utf8');
 const starts=src.split("'POST /api/owner/cloud/integrations/v1/accounts/start'")[1].split("'GET /api/owner/cloud/oauth/m4/callback'")[0];
 assert(starts.includes("assertCloudProviderEnabled(provider,'connect')"));
 const disconnect=src.split("'POST /api/owner/cloud/integrations/v1/accounts/:id/disconnect'")[1];assert(!disconnect.includes('assertCloudProviderEnabled'));
});
test('broker guard runs before token retrieval',()=>{const s=readFileSync(new URL('backend/cloud-overdracht-credentials.ts',root),'utf8');assert(s.indexOf("assertCloudProviderEnabled(ctx.provider,'operate')")<s.indexOf('m4Broker.forOperation'))});
const m4=await import(moduleUrl('backend/cloud-verbinding-m4.ts'));
function oauthScenario(){let flow=null,exchanges=0,allowed=true;
 const store={saveFlow:async x=>{flow=x},consumeFlow:async hash=>{const x=flow;flow=null;return x?.stateHash===hash?x:null},upsert:async()=>({id:'account'})};
 const client={authorization:(_p,_m,_c,state)=>'https://www.dropbox.com/oauth2/authorize?state='+encodeURIComponent(state),exchange:async()=>{exchanges++;return{accessToken:'some-token',refreshToken:'refresh-token',expiresAt:Date.now()+100000,scopes:[]}},identity:async()=>({subject:'subject',displayName:'Account',email:'account@example.com'})};
 const config=()=>({clientId:'client',clientSecret:'secret',redirectUri:'https://cloud.tarasevych.com/api/owner/cloud/oauth/m4/callback'});
 const manager=new m4.CloudConnectionManager(store,client,config,Date.now,async()=>{if(!allowed)throw new m4.CloudConnectionError('CLOUD_POLICY_DISABLED',403)});
 return{manager,principal:{owner:'alice',space:'prive'},disable:()=>{allowed=false},exchanges:()=>exchanges,pending:()=>flow};}
test('OAuth consent start is blocked by provider policy inside manager',async()=>{const x=oauthScenario();x.disable();await assert.rejects(x.manager.start(x.principal,'dropbox','read'),e=>e.code==='CLOUD_POLICY_DISABLED');assert.equal(x.pending(),null)});
test('OAuth callback refuses a previously started flow after operator disables provider',async()=>{
 const x=oauthScenario(),a=await x.manager.start(x.principal,'dropbox','read');const state=new URL(a.url).searchParams.get('state');x.disable();
 await assert.rejects(x.manager.complete(x.principal,state,'code'),e=>e.code==='CLOUD_POLICY_DISABLED');
 assert.equal(x.exchanges(),0);assert.equal(x.pending(),null);
});
