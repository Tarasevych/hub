import{test}from'node:test';import assert from'node:assert/strict';import {createRequire} from'node:module';import{readFileSync}from'node:fs';
const require=createRequire(import.meta.url);let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=new URL('../../',import.meta.url),mod=(s)=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const a=ts.transpileModule(readFileSync(new URL('backend/cloud-overdracht-adapters.ts',root),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const uri=mod(a),t=readFileSync(new URL('backend/cloud-delen-m3.ts',root),'utf8').replaceAll("'./cloud-overdracht-adapters'",`'${uri}'`),code=ts.transpileModule(t,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const{CloudPrivateShares}=await import(mod(code));
const loc=(provider='google-drive')=>({context:{userId:'owner1',space:'prive',accountId:'account1',provider},fileId:'123'});
const store=()=>({rows:new Map(),async save(x){this.rows.set(x.id,x)},async getForOwner(id,owner,space){const x=this.rows.get(id);return x?.owner===owner&&x?.space===space?x:null},async mark(id,owner,space,status){this.rows.get(id).status=status}});
test('Google invitation is addressed to one named user; never creates public link',async()=>{
 const calls=[],db=store();const x=new CloudPrivateShares(async()=> 'valid-token',async()=>true,db,async(u,o)=>{calls.push([u,o]);return new Response(JSON.stringify({id:'perm123'}),{status:200})});
 const r=await x.invite({location:loc(),email:'person@example.com',role:'viewer',explicitlyConfirmed:true});
 assert.equal(r.status,'active');const payload=JSON.parse(calls[0][1].body);assert.deepEqual(payload,{type:'user',role:'reader',emailAddress:'person@example.com'});
});
test('Graph invitation requires sign-in and sends recipient notification',async()=>{
 const calls=[];const x=new CloudPrivateShares(async()=> 'valid-token',async()=>true,store(),async(u,o)=>{calls.push([u,o]);return new Response(JSON.stringify({value:[{id:'perm1'}]}),{status:200})});
 const r=await x.invite({location:loc('onedrive-personal'),email:'person@example.com',role:'editor',explicitlyConfirmed:true});
 assert.equal(r.role,'editor');const body=JSON.parse(calls[0][1].body);assert.equal(body.requireSignIn,true);assert.equal(body.sendInvitation,true);assert.deepEqual(body.roles,['write']);
});
test('Box collaboration uses named recipient and viewer role',async()=>{
 const calls=[];const x=new CloudPrivateShares(async()=> 'valid-token',async()=>true,store(),async(u,o)=>{calls.push([u,o]);return new Response(JSON.stringify({id:'collab1'}),{status:201})});
 await x.invite({location:loc('box'),email:'person@example.com',role:'viewer',explicitlyConfirmed:true});
 assert.equal(calls[0][0],'https://api.box.com/2.0/collaborations');assert.equal(JSON.parse(calls[0][1].body).role,'viewer');
});
test('No verified provider ACL means zero remote writes',async()=>{
 let network=0;const x=new CloudPrivateShares(async()=> 'valid-token',async()=>false,store(),async()=>{network++;throw Error('unexpected')});
 await assert.rejects(x.invite({location:loc(),email:'person@example.com',role:'viewer',explicitlyConfirmed:true}),e=>e.code==='CLOUD_SHARE_ACL_NOT_VERIFIED');assert.equal(network,0);
});
test('Public links, unsupported providers and missing confirmation fail closed',async()=>{
 const x=new CloudPrivateShares(async()=> 'valid-token',async()=>true,store(),async()=>new Response('{}',{status:201}));
 await assert.rejects(x.invite({location:loc('dropbox'),email:'person@example.com',role:'viewer',explicitlyConfirmed:true}),e=>e.code==='CLOUD_SHARE_PROVIDER_UNSUPPORTED');
 await assert.rejects(x.invite({location:loc(),email:'person@example.com',role:'viewer',explicitlyConfirmed:false}),e=>e.code==='CLOUD_SHARE_USER_CONFIRMATION_REQUIRED');
});
test('Share revoke is bound to original receipt owner and expected provider ID',async()=>{
 const db=store(),calls=[];const x=new CloudPrivateShares(async()=> 'valid-token',async()=>true,db,async(u,o)=>{calls.push([u,o]);return o.method==='POST'?new Response(JSON.stringify({id:'perm123'}),{status:200}):new Response(null,{status:204})});
 const r=await x.invite({location:loc(),email:'person@example.com',role:'viewer',explicitlyConfirmed:true});
 await assert.rejects(x.revoke(r.id,'attacker','prive',true),e=>e.code==='CLOUD_SHARE_RECEIPT_MISSING');
 const out=await x.revoke(r.id,'owner1','prive',true);assert.equal(out.status,'revoked');assert.match(calls.at(-1)[0],/permissions\/perm123$/);
});

test('Share receipt migration restricts access by owner and space',()=>{
 const sql=readFileSync(new URL('migrations/0119_cloud_share_receipts.sql',root),'utf8');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.match(sql,/user_id=app.huidige_gebruiker\(\)/);
 assert.match(sql,/UNIQUE\(user_id,ruimte,account_id,aanbieder,bestand_id,provider_permissie_id\)/);
});
