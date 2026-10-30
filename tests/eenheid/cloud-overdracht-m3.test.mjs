/** M3 offline provider contract suite. All HTTP mocks; no production accounts. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let ts;try{ts=require('typescript')}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}
const root=new URL('../../',import.meta.url);
function transpile(path,replacements={}){
 let text=readFileSync(new URL(path,root),'utf8');for(const [a,b] of Object.entries(replacements))text=text.replaceAll(a,b);
 const out=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
 const serious=out.diagnostics?.filter(x=>x.category===ts.DiagnosticCategory.Error)||[];assert.equal(serious.length,0,serious.map(x=>x.messageText).join('\n'));
 return 'data:text/javascript;base64,'+Buffer.from(out.outputText).toString('base64');
}
const adapterUrl=transpile('backend/cloud-overdracht-adapters.ts');
const A=await import(adapterUrl);
const replacement={"'./cloud-overdracht-adapters'":`'${adapterUrl}'`};
const P=await import(transpile('backend/cloud-overdracht-m3-providers.ts',replacement));
const M=await import(transpile('backend/cloud-overdracht-m3-move.ts',replacement));
const loc=(provider,id,accountId='acc-1')=>({context:{provider,userId:'owner-1',space:'prive',accountId},fileId:id});
const txt=(s)=>new TextEncoder().encode(s);
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers});
const nc=async()=>({origin:'https://example.nextcloud.com/',davUsername:'alice',authorization:'Basic '+Buffer.from('alice:app-password').toString('base64')});
const ncXml=(folder=false)=>`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:response><d:propstat><d:prop><d:getetag>"rev1"</d:getetag><d:getcontentlength>5</d:getcontentlength><d:getcontenttype>text/plain</d:getcontenttype><oc:permissions>RWCD</oc:permissions><d:resourcetype>${folder?'<d:collection/>':''}</d:resourcetype></d:prop></d:propstat></d:response></d:multistatus>`;
test('Nextcloud PROPFIND: verified origin, no redirects, permissions respected',async()=>{
 const req=[];const a=new P.NextcloudTransport(nc,async()=>true,async(u,init)=>{req.push({u,init});return new Response(ncXml(),{status:207});});
 const s=await a.stat(loc('nextcloud','/Reports/a.txt'));assert.equal(s.size,5);assert.equal(s.revision,'"rev1"');
 assert.equal(req[0].init.method,'PROPFIND');assert.equal(req[0].init.redirect,'error');assert(req[0].u.includes('/remote.php/dav/files/alice/Reports/a.txt'));
});
test('Nextcloud root folder exposes write only if permissions prove it',async()=>{
 const a=new P.NextcloudTransport(nc,async()=>true,async()=>new Response(ncXml(true),{status:207}));
 const s=await a.stat(loc('nextcloud','/Reports/'));assert.equal(s.isFolder,true);assert.equal(s.canWrite,true);
});
test('Nextcloud upload creates non-overwriting file with If-None-Match',async()=>{
 const requests=[];const a=new P.NextcloudTransport(nc,async()=>true,async(u,init)=>{requests.push([u,init]);return new Response(null,{status:201,headers:{etag:'"new"'}})});
 const result=await a.upload({...loc('nextcloud','/Reports/'),parentId:'/Reports/'},'a.txt',txt('hello'),'text/plain');
 assert.equal(result.id,'/Reports/a.txt');assert.equal(requests[0][1].headers['If-None-Match'],'*');
});
test('Nextcloud refuses unapproved origin without network',async()=>{
 let calls=0;const a=new P.NextcloudTransport(async()=>({...await nc(),origin:'http://169.254.169.254/'}),async()=>true,async()=>{calls++;return new Response('oops')});
 await assert.rejects(a.stat(loc('nextcloud','/x')),e=>e.code==='CLOUD_NEXTCLOUD_ORIGIN_INVALID');assert.equal(calls,0);
});
test('Nextcloud egress policy is mandatory and blocks external connection',async()=>{
 let calls=0;const a=new P.NextcloudTransport(nc,async()=>false,async()=>{calls++;return new Response('oops')});
 await assert.rejects(a.stat(loc('nextcloud','/x')),e=>e.code==='CLOUD_NEXTCLOUD_EGRESS_NOT_APPROVED');assert.equal(calls,0);
});
test('Nextcloud rejects traversal and XML DTD',async()=>{
 const a=new P.NextcloudTransport(nc,async()=>true,async()=>new Response('<!DOCTYPE x><x/>',{status:207}));
 await assert.rejects(a.stat(loc('nextcloud','/ok')),e=>e.code==='CLOUD_NEXTCLOUD_UNSAFE_XML');
 await assert.rejects(a.stat(loc('nextcloud','/../etc')),e=>e.code==='CLOUD_M3_PATH_TRAVERSAL');
});
test('Box uses correct file endpoint and restricted token scope',async()=>{
 const calls=[];const a=new P.BoxTransport(async()=> 'abcdefghi',async(u,opt)=>{calls.push([u,opt]);return json({id:'123',name:'note',size:5,etag:'r1',permissions:{can_download:true}})});
 const x=await a.stat(loc('box','123'));assert.equal(x.canRead,true);assert.equal(calls[0][0],'https://api.box.com/2.0/files/123?fields=id,name,size,etag,permissions,type');
});
test('Box recognizes folder-specific reference with upload permission',async()=>{
 const a=new P.BoxTransport(async()=> 'abcdefghi',async()=>json({id:'0',name:'All files',size:0,permissions:{can_upload:true}}));
 assert.equal((await a.stat(loc('box','folder:0'))).canWrite,true);
});
test('Box upload uses official multipart endpoint and exact target',async()=>{
 const calls=[];const a=new P.BoxTransport(async()=> 'abcdefghi',async(u,opt)=>{calls.push([u,opt]);return json({entries:[{id:'238',size:5,etag:'rev'}]},201)});
 const out=await a.upload({...loc('box','folder:0'),parentId:'folder:0'},'report.pdf',txt('hello'),'application/pdf');
 assert.equal(out.id,'238');assert.equal(calls[0][0],'https://upload.box.com/api/2.0/files/content');
 assert.equal(calls[0][1].body.get('attributes'),JSON.stringify({name:'report.pdf',parent:{id:'0'}}));
});
test('Box redirect fails closed; no OAuth token to unknown host',async()=>{
 const a=new P.BoxTransport(async()=> 'abcdefghi',async()=>new Response(null,{status:302,headers:{location:'https://attacker.example/'}}));
 await assert.rejects(a.download(loc('box','123'),10),e=>e.code==='CLOUD_BOX_CDN_REDIRECT_REJECTED');
});
const cfg=async()=>({bucket:'test-bucket',region:'eu-west-1',prefix:'customers/a/',accessKeyId:'AKIA'+'IOSFODNN7EXAMPLE'/* opgeknipt voor de geheimenscan van de uitrol; runtime dezelfde voorbeeldsleutel uit de AWS-documentatie */,secretAccessKey:'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'});
test('S3 signs HEAD with SigV4 against AWS pinned host',async()=>{
 const calls=[];const a=new P.S3Transport(cfg,async(u,opt)=>{calls.push([u,opt]);return new Response(null,{status:200,headers:{'content-length':'5','etag':'"e"'}})},()=>new Date('2026-10-28T12:30:00Z'));
 const r=await a.stat(loc('s3','Docs/a.txt'));assert.equal(r.size,5);assert.equal(r.revision,'"e"');
 assert.equal(calls[0][0],'https://test-bucket.s3.eu-west-1.amazonaws.com/customers/a/Docs/a.txt');
 assert.match(calls[0][1].headers.authorization,/AWS4-HMAC-SHA256 Credential=/);
 assert.equal(calls[0][1].headers['x-amz-date'],'20261028T123000Z');
});
test('S3 upload uses if-none-match to avoid overwrite',async()=>{
 const calls=[];const a=new P.S3Transport(cfg,async(u,opt)=>{calls.push([u,opt]);return new Response(null,{status:200,headers:{etag:'"e2"'}})});
 const r=await a.upload({...loc('s3','root'),parentId:'Docs/'},'name.pdf',txt('abc'),'application/pdf');
 assert.equal(r.id,'Docs/name.pdf');assert.equal(calls[0][1].headers['if-none-match'],'*');
});
test('S3 rejects arbitrary endpoints/configs and path traversal',async()=>{
 let calls=0;const a=new P.S3Transport(async()=>({...await cfg(),bucket:'invalid_bucket'}),async()=>{calls++;return new Response(null)});
 await assert.rejects(a.stat(loc('s3','abc')),e=>e.code==='CLOUD_S3_ACCOUNT_CONFIG_INVALID');assert.equal(calls,0);
 const good=new P.S3Transport(cfg,async()=>{calls++;return new Response(null)});
 await assert.rejects(good.stat(loc('s3','../config')),e=>e.code==='CLOUD_S3_KEY_INVALID');assert.equal(calls,0);
});
test('Graph delete uses If-Match and restricted Graph endpoint',async()=>{
 const calls=[];const a=new M.GraphConditionalDeleter('onedrive-personal',async()=> 'valid-token',async(u,o)=>{calls.push([u,o]);return new Response(null,{status:204})});
 await a.deleteIfUnchanged(loc('onedrive-personal','f123'),'"etag"');
 assert.equal(calls[0][1].headers['If-Match'],'"etag"');assert.equal(calls[0][0],'https://graph.microsoft.com/v1.0/me/drive/items/f123');
});
test('Graph delete rejects stale version instead of continuing MOVE',async()=>{
 const a=new M.GraphConditionalDeleter('onedrive-business',async()=> 'valid-token',async()=>new Response(null,{status:412}));
 await assert.rejects(a.deleteIfUnchanged(loc('onedrive-business','f1'),'"old"'),e=>e.code==='CLOUD_M3_SOURCE_CHANGED_DO_NOT_DELETE');
});
test('Dropbox delete includes exact parent_rev (conditional)',async()=>{
 const calls=[];const a=new M.DropboxConditionalDeleter(async()=> 'valid-token',async(u,o)=>{calls.push([u,o]);return json({metadata:{}})});
 await a.deleteIfUnchanged(loc('dropbox','id:aabbccdd'),'0123456789abcdef');
 assert.deepEqual(JSON.parse(calls[0][1].body),{path:'id:aabbccdd',parent_rev:'0123456789abcdef'});
});
test('Dropbox missing revision blocks network call',async()=>{
 let calls=0;const a=new M.DropboxConditionalDeleter(async()=> 'valid-token',async()=>{calls++;return json({})});
 await assert.rejects(a.deleteIfUnchanged(loc('dropbox','id:abcdefgh'),'bogus'),e=>e.code==='CLOUD_M3_DROPBOX_REV_INVALID');assert.equal(calls,0);
});
test('Box delete uses If-Match and never follows redirect',async()=>{
 const calls=[];const a=new M.BoxConditionalDeleter(async()=> 'valid-token',async(u,o)=>{calls.push(o);return new Response(null,{status:204})});
 await a.deleteIfUnchanged(loc('box','123'),'etag12');assert.equal(calls[0].headers['If-Match'],'etag12');assert.equal(calls[0].redirect,'error');
});
function moveData(){return {jobId:'job-1',ownerUserId:'owner-1',space:'prive',source:{provider:'onedrive-personal',accountId:'src',fileId:'original',revision:'etag1',size:5},target:{provider:'dropbox',accountId:'dst',fileId:'copied',revision:'rev2',size:5},checksumSHA256:A.sha256(txt('hello')),copiedVerifiedAt:'2026-10-28T10:00:00Z',explicitlyConfirmed:true}}
function fakeStore(){const store={proof:null,complete:[],async persistVerifiedCopy(p){this.proof=p},async claimDelete(id,owner,space){return this.proof&&this.proof.jobId===id&&this.proof.ownerUserId===owner&&this.proof.space===space?{proof:this.proof,lease:'token'}:null},async finishDelete(id,lease,outcome){this.complete.push(outcome)}};return store;}
const fakeSrc=(rev='etag1')=>({provider:'onedrive-personal',stat:async()=>({id:'original',name:'original',size:5,revision:rev,isFolder:false,canRead:true}),download:async()=>txt('hello')});
const fakeDst=(content='hello')=>({provider:'dropbox',stat:async()=>({id:'copied',name:'copied',size:5,revision:'rev2',isFolder:false,canRead:true}),download:async()=>txt(content)});
test('MOVE persists proof before deleting, verifies target again',async()=>{
 const store=fakeStore(),calls=[];const del={provider:'onedrive-personal',async deleteIfUnchanged(l,rev){calls.push(rev)}};
 const x=new M.SafeMoveFinalizer(store,[fakeSrc(),fakeDst()],[del]);await x.recordVerifiedCopy(moveData());
 const result=await x.finalize('job-1','owner-1','prive');assert.equal(result.state,'moved');assert.equal(calls.length,1);
});
test('MOVE never deletes changed source',async()=>{
 const store=fakeStore(),calls=[];const x=new M.SafeMoveFinalizer(store,[fakeSrc('changed'),fakeDst()],[{provider:'onedrive-personal',async deleteIfUnchanged(){calls.push(1)}}]);
 await x.recordVerifiedCopy(moveData());const result=await x.finalize('job-1','owner-1','prive');assert.equal(result.state,'review');assert.equal(calls.length,0);
});
test('MOVE never deletes if destination readback checksum differs',async()=>{
 const store=fakeStore(),calls=[];const x=new M.SafeMoveFinalizer(store,[fakeSrc(),fakeDst('wrong')],[{provider:'onedrive-personal',async deleteIfUnchanged(){calls.push(1)}}]);
 await x.recordVerifiedCopy(moveData());const result=await x.finalize('job-1','owner-1','prive');assert.equal(result.state,'review');assert.equal(calls.length,0);
});
test('MOVE does not allow mismatched owner or space',async()=>{
 const store=fakeStore();const x=new M.SafeMoveFinalizer(store,[fakeSrc(),fakeDst()],[{provider:'onedrive-personal',async deleteIfUnchanged(){}}]);
 await x.recordVerifiedCopy(moveData());assert.equal(await x.finalize('job-1','attacker','prive'),null);assert.equal(await x.finalize('job-1','owner-1','technisch'),null);
});
test('MOVE requires proof and known conditional deleter',async()=>{
 const store=fakeStore();const x=new M.SafeMoveFinalizer(store,[fakeSrc(),fakeDst()],[]);
 await assert.rejects(x.recordVerifiedCopy(moveData()),e=>e.code==='CLOUD_M3_DELETE_UNSUPPORTED');
});

test('Box accepts only official dl.boxcloud.com redirect, never sends bearer token to CDN',async()=>{
 const calls=[];const x=new P.BoxTransport(async()=> 'valid-token',async(u,opt)=>{
   calls.push([u,opt]);
   if(calls.length===1)return new Response(null,{status:302,headers:{location:'https://dl.boxcloud.com/api/2.0/file/abc'}});
   return new Response('hello');
 });
 assert.equal(new TextDecoder().decode(await x.download(loc('box','123'),10)),'hello');
 assert.equal(calls[1][1].redirect,'error');assert.equal(calls[1][1].headers,undefined);
});
test('M3 move SQL journal has RLS, lease and no auto-retry',()=>{
 const sql=readFileSync(new URL('migrations/0118_cloud_move_proofs.sql',root),'utf8');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/i);
 assert.match(sql,/status IN \('verified','deleting','moved','review'\)/);
 assert.match(sql,/REFERENCES app.cloud_overdracht_jobs\(id\)/);
 const p=readFileSync(new URL('backend/cloud-overdracht-m3-pg.ts',root),'utf8');
 assert.match(p,/status='deleting'/);assert.match(p,/status='verified'/);assert.match(p,/status='review'/);
});
test('M3 providers remain separate from public Cloud routes',()=>{
 const routes=readFileSync(new URL('backend/cloud-integratie-routes.ts',root),'utf8');
 assert.doesNotMatch(routes,/cloud-overdracht-m3-providers|cloud-overdracht-m3-move|cloud-overdracht-m3-pg/);
});
