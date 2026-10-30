import{test}from'node:test';import assert from'node:assert/strict';
import{readFileSync}from'node:fs';import{createRequire}from'node:module';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=new URL('../../',import.meta.url);
const asUrl=(s)=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
function transpile(file,replacements={}){let src=readFileSync(new URL(file,root),'utf8');for(const [key,value]of Object.entries(replacements))src=src.replaceAll(key,value);
 const result=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
 const errors=result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)||[];assert.equal(errors.length,0,errors.map(e=>String(e.messageText)).join('\n'));return asUrl(result.outputText);}
const coreUrl=transpile('backend/cloud-verbinding-m4.ts');const C=await import(coreUrl);
const providersUrl=transpile('backend/cloud-verbinding-m4-providers.ts',{"'./cloud-verbinding-m4'":`'${coreUrl}'`});const P=await import(providersUrl);
const principal=(owner='user-1',space='prive')=>({owner,space});
function fixtures(){let now=10_000_000;const db={flows:new Map(),accounts:new Map(),
 async saveFlow(f){this.flows.set(f.stateHash,f)},async consumeFlow(h){const x=this.flows.get(h);this.flows.delete(h);return x||null;},
 async upsert(x){const key=[x.owner,x.space,x.provider,x.externalSubject].join('|');const before=this.accounts.get(key),item={...x,id:before?.id||'id-'+(this.accounts.size+1),status:'connected',updatedAt:new Date().toISOString()};this.accounts.set(key,item);const{credentials,owner,space,...view}=item;return view;},
 async list(p){return[...this.accounts.values()].filter(x=>x.owner===p.owner&&x.space===p.space).map(({credentials,owner,space,...view})=>view)},
 async get(p,id){return[...this.accounts.values()].find(x=>x.id===id&&x.owner===p.owner&&x.space===p.space)||null},
 async markRevokePending(p,id){const x=await this.get(p,id);if(!x||x.status==='disconnect_pending')return false;x.status='disconnect_pending';return true},
 async deactivate(){},async setStatus(p,id,status){const x=await this.get(p,id);if(!x)throw Error('missing');x.status=status}};
 const calls=[];const client={authorization(p,mode,c,state,ch,nonce){calls.push(['start',p,mode,state,ch,nonce]);return P.consentUrl(p,mode,c,state,ch,nonce)},
 async exchange(p,c,code,verifier){calls.push(['exchange',p,code,verifier]);return{accessToken:'token-'+code,refreshToken:'refresh-'+code,expiresAt:now+3_600_000,scopes:P.requiredScopes(p,'write')}},
 async identity(p,t){return{subject:t.endsWith('a')?'subject-a':'subject-b',displayName:'Account '+t,email:'someone@example.com'}},
 async revoke(){calls.push(['revoke']);return'revoked'}};
 const manager=new C.CloudConnectionManager(db,client,()=>({clientId:'client',clientSecret:'secret',redirectUri:'https://api.tarasevych.com/api/owner/cloud/oauth/m4/callback'}),()=>now);
 return{manager,db,calls,setNow(v){now=v}};}
const stateOf=(authorization)=>new URL(authorization.url).searchParams.get('state');
test('Microsoft personal and business authority isolated; select_account and PKCE',()=>{
 const cfg={clientId:'c',clientSecret:'s',redirectUri:'https://api.tarasevych.com/api/owner/cloud/oauth/m4/callback'};
 const personal=new URL(P.consentUrl('onedrive-personal','read',cfg,'s','challenge','nonce'));
 const business=new URL(P.consentUrl('onedrive-business','write',cfg,'s','challenge','nonce'));
 assert.match(personal.pathname,/consumers/);assert.match(business.pathname,/organizations/);
 assert.equal(personal.searchParams.get('prompt'),'select_account');assert.equal(personal.searchParams.get('code_challenge_method'),'S256');
 assert.match(business.searchParams.get('scope'),/Files.ReadWrite/);
});
test('Dropbox uses official offline auth and read/write scopes',()=>{
 const url=new URL(P.consentUrl('dropbox','write',{clientId:'c',clientSecret:'s',redirectUri:'https://api.tarasevych.com/api/owner/cloud/oauth/m4/callback'},'x','ch','n'));
 assert.equal(url.searchParams.get('token_access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.match(url.searchParams.get('scope'),/files.content.write/);
});
test('Box scopes not falsely represented as selectable consent',()=>{
 const url=new URL(P.consentUrl('box','read',{clientId:'c',clientSecret:'s',redirectUri:'https://api.tarasevych.com/api/owner/cloud/oauth/m4/callback'},'x','ch','n'));
 assert.equal(url.searchParams.get('scope'),null);assert.equal(url.hostname,'account.box.com');
});
test('Two accounts from same provider remain distinct; reauth updates same one',async()=>{
 const f=fixtures();const a=await f.manager.start(principal(),'dropbox','read');const x=await f.manager.complete(principal(),stateOf(a),'a');
 const b=await f.manager.start(principal(),'dropbox','write');const y=await f.manager.complete(principal(),stateOf(b),'b');
 assert.notEqual(x.id,y.id);assert.equal((await f.manager.list(principal())).length,2);
 const c=await f.manager.start(principal(),'dropbox','write');const r=await f.manager.complete(principal(),stateOf(c),'a');
 assert.equal(r.id,x.id);assert.equal((await f.manager.list(principal())).length,2);assert.equal(r.mode,'write');
});
test('OAuth callback is one-time and cannot replay or change owner',async()=>{
 const f=fixtures();const flow=await f.manager.start(principal(),'box','read');const state=stateOf(flow);
 await assert.rejects(f.manager.complete(principal('intruder'),state,'a'),e=>e.code==='CLOUD_OAUTH_CONTEXT_CHANGED');
 assert.equal(f.calls.some(x=>x[0]==='exchange'),false);
 await assert.rejects(f.manager.complete(principal(),state,'a'),e=>e.code==='CLOUD_OAUTH_STATE_EXPIRED_OR_USED');
});
test('Private and technical spaces are independent; remote identity never merged',async()=>{
 const f=fixtures();const a=await f.manager.start(principal(),'box','read');await f.manager.complete(principal(),stateOf(a),'a');
 const b=await f.manager.start(principal('user-1','technisch'),'box','read');await f.manager.complete(principal('user-1','technisch'),stateOf(b),'a');
 assert.equal((await f.manager.list(principal())).length,1);assert.equal((await f.manager.list(principal('user-1','technisch'))).length,1);
 assert.notEqual((await f.manager.list(principal()))[0].id,(await f.manager.list(principal('user-1','technisch')))[0].id);
});
test('OAuth state expires, no token exchange performed',async()=>{
 const f=fixtures();const s=await f.manager.start(principal(),'dropbox','read');f.setNow(s.expiresAt+1);
 await assert.rejects(f.manager.complete(principal(),stateOf(s),'x'),e=>e.code==='CLOUD_OAUTH_STATE_EXPIRED_OR_USED');
 assert.equal(f.calls.some(x=>x[0]==='exchange'),false);
});
test('OAuth result requires a refresh token for background tasks',async()=>{
 const f=fixtures();f.manager.client.exchange=async()=>({accessToken:'t',expiresAt:13_000_000,scopes:[]});
 const s=await f.manager.start(principal(),'box','read');
 await assert.rejects(f.manager.complete(principal(),stateOf(s),'a'),e=>e.code==='CLOUD_OAUTH_OFFLINE_GRANT_REQUIRED');
 assert.equal((await f.manager.list(principal())).length,0);
});
test('Disconnect locally blocks immediately even if remote revocation fails',async()=>{
 const f=fixtures();const s=await f.manager.start(principal(),'dropbox','write');const v=await f.manager.complete(principal(),stateOf(s),'a');
 f.manager.client.revoke=async()=>{throw Error('network down')};const out=await f.manager.disconnect(principal(),v.id);
 assert.equal(out.remote,'pending');assert.equal((await f.manager.list(principal()))[0].status,'disconnect_pending');
});
test('Remote revoke success marks account revoked and cannot affect another owner',async()=>{
 const f=fixtures();const s=await f.manager.start(principal(),'box','write');const v=await f.manager.complete(principal(),stateOf(s),'a');
 await assert.rejects(f.manager.disconnect(principal('other'),v.id),e=>e.code==='CLOUD_ACCOUNT_NOT_FOUND');
 assert.equal((await f.manager.disconnect(principal(),v.id)).remote,'revoked');
 assert.equal((await f.manager.list(principal()))[0].status,'revoked');
});
test('Provider exchange never sends access token in URL; uses fixed token origin and PKCE',async()=>{
 const calls=[];const live=new P.LiveOAuthProviders(async(u,opts)=>{calls.push([u,opts]);return new Response(JSON.stringify({access_token:'access',refresh_token:'refresh',expires_in:3600,scope:'Files.Read'}),{status:200});});
 const v=await live.exchange('onedrive-personal',{clientId:'abc',clientSecret:'def',redirectUri:'https://api.tarasevych.com/api/owner/cloud/oauth/m4/callback'},'code','verifier');
 assert.equal(v.refreshToken,'refresh');assert.equal(calls[0][1].redirect,'error');assert.match(calls[0][1].body,/code_verifier=verifier/);assert(!calls[0][0].includes('access'));
});
test('Provider user identity verified on official host, no arbitrary browser email',async()=>{
 const live=new P.LiveOAuthProviders(async(u,opts)=>{
  assert.equal(new URL(u).hostname,'api.dropboxapi.com');assert.match(opts.headers.Authorization,/Bearer/);
  return new Response(JSON.stringify({account_id:'dbid:123',email:'alice@example.com',name:{display_name:'Alice'}}),{status:200});
 });
 const identity=await live.identity('dropbox','token');assert.equal(identity.subject,'dbid:123');assert.equal(identity.email,'alice@example.com');
});
test('Encryption bind to record and prevent ciphertext relocation',async()=>{
 const poolStub=asUrl('export const getPool=()=>{throw Error("unused")};');
 const pg=await import(transpile('backend/cloud-verbinding-m4-pg.ts',{"'../server/platform/pg'":`'${poolStub}'`,"'./cloud-verbinding-m4'":`'${coreUrl}'`}));
 process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1='a'.repeat(64);
 try{const encrypted=pg.encryptCloudGrant({accessToken:'super-secret'},'owner:prive:account1');
  assert(!encrypted.includes('super-secret'));assert.deepEqual(pg.decryptCloudGrant(encrypted,'owner:prive:account1'),{accessToken:'super-secret'});
  assert.throws(()=>pg.decryptCloudGrant(encrypted,'owner:technisch:account1'),e=>e.code==='CLOUD_GRANT_DECRYPT_FAILED');
 }finally{delete process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1;}
});
test('Database migration protects grants and ensures stable multi-account identity',()=>{
 const sql=readFileSync(new URL('migrations/0120_cloud_multi_account_connections.sql',root),'utf8');
 assert.match(sql,/UNIQUE\(user_id,ruimte,aanbieder,external_subject\)/);assert.match(sql,/REVOKE ALL ON app.cloud_provider_accounts_m4 FROM PUBLIC/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.doesNotMatch(sql,/GRANT SELECT.*mijnruimte_app/i);
});
test('Staging routes remain disabled unless explicitly enabled',()=>{
 const source=readFileSync(new URL('backend/cloud-verbinding-m4-routes.ts',root),'utf8');
 assert.match(source,/CLOUD_M4_CONNECTIONS_STAGING==='enabled'/);assert.match(source,/CLOUD_M4_NOT_RELEASED/);
 assert.match(source,/createM4CloudRoutes/);assert.match(source,/ladeOf\(auth.user.id\).ruimte/);
});
test('Cross-tab account selection stays local and token-free',()=>{
 const code=readFileSync(new URL('src/cloud/cloud-account-sync.ts',root),'utf8');
 assert.match(code,/sessionStorage/);assert.match(code,/BroadcastChannel/);assert.match(code,/accounts_changed/);
 assert.match(code,/credentials:'include'/);assert.doesNotMatch(code,/localStorage\.setItem\(.*access_token/);
});
const urlToken=transpile('backend/cloud-verbinding-m4-token.ts',{
 "'./cloud-verbinding-m4'":`'${coreUrl}'`,
 "'./cloud-verbinding-m4-pg'":`'${asUrl('export class PostgresCloudConnections{}')}'`,
 "'./cloud-verbinding-m4-providers'":`'${asUrl('export class LiveOAuthProviders{}')}'`
});
const TOKEN=await import(urlToken);
function brokerData(){const one={id:'uuid-1',provider:'dropbox',owner:'alice',space:'prive',status:'connected',mode:'write',scopes:['files.content.read','files.content.write'],credentials:{accessToken:'a0',refreshToken:'r0',expiresAt:1}};
 let lease='',quarantined=false;const repository={
  async get(p,id){return p.owner===one.owner&&p.space===one.space&&id===one.id?{...one,credentials:{...one.credentials}}:null},
  async quarantineExpiredRefresh(){return quarantined},async tryRefreshLease(p,id,value){if(lease)return false;lease=value;return true},
  async commitRefreshed(p,id,l,next){if(l!==lease)throw Error('lost');one.credentials=next;lease=''},
  async failedRefresh(p,id,l){one.status='reauth_required';lease=''}
 };
 const client={calls:0,async refresh(p,config,current){this.calls++;return{accessToken:'a1',refreshToken:'r1',expiresAt:1_000_000,scopes:current.scopes}}};
 const broker=new TOKEN.CloudMultiAccountTokenBroker(repository,client,()=>({clientId:'c',clientSecret:'s',redirectUri:'https://api.tarasevych.com/api/owner/cloud/oauth/m4/callback'}),()=>10_000);
 return{one,repository,client,broker,setExpired(x){quarantined=x}};
}
test('Token broker returns only selected account token and respects owner/space',async()=>{
 const f=brokerData();f.one.credentials.expiresAt=1_000_000;
 assert.equal(await f.broker.forOperation(principal('alice'),'uuid-1','dropbox','write'),'a0');
 await assert.rejects(f.broker.forOperation(principal('bob'),'uuid-1','dropbox','read'),e=>e.code==='CLOUD_ACCOUNT_UNAVAILABLE');
 await assert.rejects(f.broker.forOperation(principal('alice','technisch'),'uuid-1','dropbox','read'),e=>e.code==='CLOUD_ACCOUNT_UNAVAILABLE');
});
test('Token broker refreshes rotated token exactly once when expired',async()=>{
 const f=brokerData();const token=await f.broker.forOperation(principal('alice'),'uuid-1','dropbox','read');
 assert.equal(token,'a1');assert.equal(f.one.credentials.refreshToken,'r1');
 assert.equal(await f.broker.forOperation(principal('alice'),'uuid-1','dropbox','read'),'a1');assert.equal(f.client.calls,1);
});
test('Read-mode connection cannot authorize write even with provider-side broad scope',async()=>{
 const f=brokerData();f.one.mode='read';f.one.credentials.expiresAt=1_000_000;
 await assert.rejects(f.broker.forOperation(principal('alice'),'uuid-1','dropbox','write'),e=>e.code==='CLOUD_WRITE_GRANT_NOT_SELECTED');
});
test('Expired remote refresh lease is quarantined rather than retried',async()=>{
 const f=brokerData();f.setExpired(true);
 await assert.rejects(f.broker.forOperation(principal('alice'),'uuid-1','dropbox','write'),e=>e.code==='CLOUD_REFRESH_TIMEOUT_REAUTHORIZE');
 assert.equal(f.client.calls,0);
});
test('Refresh failure disables stale credentials instead of reusing them',async()=>{
 const f=brokerData();f.client.refresh=async()=>{throw Error('network ambiguous')};
 await assert.rejects(f.broker.forOperation(principal('alice'),'uuid-1','dropbox','read'),e=>e.code==='CLOUD_REFRESH_FAILED_REAUTHORIZE');
 assert.equal(f.one.status,'reauth_required');
});
test('New connection manager routes, token bridge and React screen parse as TypeScript',()=>{
 for(const file of ['backend/cloud-verbinding-m4-token.ts','backend/cloud-verbinding-m4-routes.ts',
   'backend/cloud-verbinding-m4-config.ts','backend/cloud-overdracht-credentials.ts',
   'backend/cloud-platform.ts','src/cloud/cloud-account-sync.ts','src/cloud/CloudVerbindingCentrum.tsx']){
  const text=readFileSync(new URL(file,root),'utf8');
  const result=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
  assert.equal((result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,file);
 }
});
test('M4 route is included under existing whole-cloud ladePoort and never overrides Google grant',()=>{
 const routes=readFileSync(new URL('backend/cloud-platform.ts',root),'utf8');
 assert.match(routes,/ladePoort\('cloud',\s*authorize/);assert.match(routes,/\.\.\.createM4CloudRoutes\(authorize\)/);
 const creds=readFileSync(new URL('backend/cloud-overdracht-credentials.ts',root),'utf8');
 assert.match(creds,/if\(ctx.provider!=='google-drive'\)/);assert.match(creds,/googleSuitePrincipalAccessToken/);
 assert.match(creds,/CLOUD_M4_CONNECTIONS_STAGING/);
});
test('M4 DB holds refresh lease and read-only app cannot obtain ciphertext',()=>{
 const sql=readFileSync(new URL('migrations/0120_cloud_multi_account_connections.sql',root),'utf8');
 assert.match(sql,/refresh_lease_token/);assert.match(sql,/token_version/);
 assert.match(sql,/GRANT SELECT,INSERT,UPDATE,DELETE ON app.cloud_provider_accounts_m4 TO mijnruimte_system/);
 assert.doesNotMatch(sql,/GRANT SELECT.*cloud_provider_accounts_m4.*mijnruimte_app/);
});
