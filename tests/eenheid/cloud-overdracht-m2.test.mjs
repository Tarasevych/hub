/** Offline contract tests with mocked provider HTTP; no actual OAuth or production calls. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let ts;try {ts=require('typescript');}catch{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}
const root=new URL('../../',import.meta.url);
function compiled(name,replacements={}){
 let text=readFileSync(new URL(name,root),'utf8');
 for(const [from,to] of Object.entries(replacements))text=text.replaceAll(from,to);
 const code=ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.ESNext}}).outputText;
 return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
}
const adapterUrl=compiled('backend/cloud-overdracht-adapters.ts');
const A=await import(adapterUrl);
const U=await import(compiled('backend/cloud-overdracht-uitvoerder.ts',{ "'./cloud-overdracht-adapters'":`'${adapterUrl}'` }));
const ctx=(provider='dropbox',space='prive')=>({userId:'owner-1',space,accountId:'connected-1',provider});
const loc=(provider,id='id:aabbcc')=>({context:ctx(provider),fileId:id});
const grant=async()=> 'test-not-real-token';
const json=(obj,code=200,headers={})=>new Response(JSON.stringify(obj),{status:code,headers:{'content-type':'application/json',...headers}});
const bytes=(s)=>new TextEncoder().encode(s);
const text=(b)=>new TextDecoder().decode(b);
test('redirect verifier accepts Microsoft upload hosts, rejects adversarial hosts',()=>{
 assert(A.verifiedUploadUrl('https://foo.up.1drv.com/up/3'));
 assert(A.verifiedUploadUrl('https://tenant.sharepoint.com/_api'));
 for(const x of ['http://foo.up.1drv.com','https://evil-up.1drv.com.evil.org/','https://user@foo.up.1drv.com','https://127.0.0.1/x','https://graph.microsoft.com.evil/']) assert(!A.verifiedUploadUrl(x),x);
});
test('Dropbox metadata is parsed without granting folder download',async()=>{
 const requests=[];const d=new A.DropboxTransport(grant,async(url,init)=>{requests.push([url,init]);return json({'.tag':'file',id:'id:aabbcc',name:'image.pdf',size:11,rev:'1',is_downloadable:true});});
 const file=await d.stat(loc('dropbox'));
 assert.equal(file.size,11);assert.equal(file.canRead,true);assert.equal(requests[0][1].redirect,'error');
});
test('Dropbox download reads provider content, enforces bounded size',async()=>{
 const d=new A.DropboxTransport(grant,async()=>new Response('hello'));
 assert.equal(text(await d.download(loc('dropbox'),8)),'hello');
 await assert.rejects(d.download(loc('dropbox'),2),e=>e.code==='CLOUD_TRANSFER_TOO_LARGE');
});
test('Dropbox upload uses sessions + explicit fail-on-conflict (no overwrite)',async()=>{
 const calls=[];let stage=0;const d=new A.DropboxTransport(grant,async(url,opt)=>{
   calls.push({url,opt}); if(url.includes('/start'))return json({session_id:'session123'});
   if(url.includes('/append_v2'))return json({});
   if(url.includes('/finish'))return json({id:'id:created123',size:5,rev:'newrev'});
   throw Error('unexpected');
 });
 const result=await d.upload({...loc('dropbox','root'),parentId:'root'},'Звіт.pdf',bytes('hello'),'application/pdf');
 assert.equal(result.id,'id:created123');assert.equal(calls.length,3);
 const args=JSON.parse(calls[2].opt.headers['Dropbox-API-Arg']);
 assert.equal(args.commit.mode['.tag'],'add');assert.equal(args.commit.autorename,false);
 assert(!/[\u0080-\uffff]/.test(calls[2].opt.headers['Dropbox-API-Arg']));
});
test('Dropbox invalid target blocks any network request',async()=>{
 let calls=0;const d=new A.DropboxTransport(grant,async()=>{calls++;return json({});});
 await assert.rejects(d.upload({...loc('dropbox','root'),parentId:'../attack'},'foo.txt',bytes('a'),'text/plain'),e=>e.code==='CLOUD_DROPBOX_FOLDER_PATH_INVALID');
 assert.equal(calls,0);
});
test('Graph preauthorized redirect NEVER forwards Authorization header',async()=>{
 const calls=[];const m=new A.MicrosoftGraphTransport('onedrive-personal',grant,async(url,init)=>{
   calls.push({url,init});if(calls.length===1)return new Response(null,{status:302,headers:{Location:'https://tenant.sharepoint.com/file?token=secret'}});
   return new Response('remote file');
 });
 assert.equal(text(await m.download(loc('onedrive-personal','graph-item'),100)),'remote file');
 assert(calls[0].init.headers.Authorization);assert(!calls[1].init.headers);
});
test('Graph malicious redirect blocked (SSRF safety)',async()=>{
 let n=0;const m=new A.MicrosoftGraphTransport('onedrive-business',grant,async()=>{n++;return new Response(null,{status:302,headers:{Location:'https://evil.example/export'}});});
 await assert.rejects(m.download(loc('onedrive-business','graph-item'),100),e=>e.code==='CLOUD_GRAPH_DOWNLOAD_REDIRECT_REJECTED');assert.equal(n,1);
});
test('Graph upload session sends chunks without OAuth to preauthorized host',async()=>{
 const calls=[];const m=new A.MicrosoftGraphTransport('onedrive-personal',grant,async(url,init)=>{
   calls.push({url,init});if(calls.length===1)return json({uploadUrl:'https://tenant.up.1drv.com/upload/token'});
   return json({id:'new-item',size:4,eTag:'rev1'},201);
 });
 const r=await m.upload({...loc('onedrive-personal','root'),parentId:'root'},'file.txt',bytes('test'),'text/plain');
 assert.equal(r.size,4);assert.equal(calls.length,2);
 assert(!calls[1].init.headers.Authorization);
 assert.equal(JSON.parse(calls[0].init.body).item['@microsoft.graph.conflictBehavior'],'fail');
});
test('Graph rejects untrusted upload session URL',async()=>{
 const m=new A.MicrosoftGraphTransport('onedrive-business',grant,async()=>json({uploadUrl:'https://attacker.invalid/exfil'}));
 await assert.rejects(m.upload({...loc('onedrive-business','root'),parentId:'root'},'file.txt',bytes('test'),'text/plain'),e=>e.code==='CLOUD_GRAPH_SESSION_URL_REJECTED');
});
test('SharePoint never guesses drive from personal /me/drive',async()=>{
 const m=new A.MicrosoftGraphTransport('sharepoint',grant,async()=>{throw Error('should not request');});
 await assert.rejects(m.stat(loc('sharepoint','the-file')),e=>e.code==='CLOUD_SHAREPOINT_DRIVE_NOT_RESOLVED');
});
test('Google Drive folder metadata reports write support',async()=>{
 const g=new A.GoogleDriveTransport(grant,async()=>json({id:'google-folder',name:'Workspace',mimeType:'application/vnd.google-apps.folder',version:'4',capabilities:{canAddChildren:true}}));
 const folder=await g.stat(loc('google-drive','google-folder'));assert(folder.isFolder);assert(folder.canWrite);assert.equal(folder.size,0);
});
test('Google Docs are identified but cannot be downloaded as binary',async()=>{
 const g=new A.GoogleDriveTransport(grant,async()=>json({id:'google-doc',name:'Doc',size:'120',mimeType:'application/vnd.google-apps.document',capabilities:{canDownload:true}}));
 assert.equal((await g.stat(loc('google-drive','google-doc'))).canRead,false);
});
test('Google upload uses resumable sessions and validates size',async()=>{
 const calls=[];const g=new A.GoogleDriveTransport(grant,async(url,init)=>{
  calls.push({url,init});if(calls.length===1)return new Response(null,{status:200,headers:{Location:'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc'}});
  return json({id:'created-google',size:'4',version:'2'});
 });
 const r=await g.upload({...loc('google-drive','root'),parentId:'google-folder'},'demo.pdf',bytes('test'),'application/pdf');
 assert.equal(r.id,'created-google');assert.equal(calls.length,2);
 assert.equal(calls[1].init.headers['Content-Range'],'bytes 0-3/4');
});
class MemoryJobs{
 constructor(){this.job=null;this.finishes=[];}
 async enqueue(input){if(this.job){if(U.transferFingerprint(this.job.input)!==U.transferFingerprint(input))throw new A.CloudTransportError('CLOUD_IDEMPOTENCY_PAYLOAD_MISMATCH',409);return this.job;}
  this.job={id:'job1',input,status:'queued',lease:'',attempts:0};return this.job;}
 async claim(id,owner,space){if(!this.job||this.job.status!=='queued'||this.job.input.ownerUserId!==owner||this.job.input.space!==space)return null;
  this.job={...this.job,status:'running',lease:'lease1',attempts:1};return this.job;}
 async finish(id,lease,status,outcome){if(lease!==this.job.lease)throw Error('invalid lease');this.finishes.push({status,outcome});this.job={...this.job,status,...outcome};}
}
const input=(changes={})=>({ownerUserId:'owner-1',space:'prive',mode:'copy',idempotencyKey:'same-operation-123',source:{provider:'google-drive',accountId:'google-account',fileId:'source1',revision:'2'},target:{provider:'dropbox',accountId:'dropbox-account',folderId:'root'},...changes});
function fake(p,content='hello',tamper=false){let uploaded=false;return {provider:p,
 stat:async loc=>loc.fileId==='root'?{id:'root',name:'/',size:0,mime:'inode/directory',revision:'',isFolder:true,canWrite:true,canRead:false}:loc.fileId==='source1'?{id:'source1',name:'demo.pdf',size:5,mime:'application/pdf',revision:'2',isFolder:false,canRead:true,canWrite:false}:{id:'created',name:'demo.pdf',size:5,mime:'application/pdf',revision:'newrev',isFolder:false,canRead:true,canWrite:false},
 download:async loc=>tamper&&loc.fileId==='created'?bytes('wrong'):bytes(content),
 upload:async (loc,name,b)=>{uploaded=true;return{id:'created',size:b.length,revision:'newrev'};},
 get uploaded(){return uploaded;}};}
test('True copy: source revision & target readback SHA-256 verified',async()=>{
 const jobs=new MemoryJobs();const src=fake('google-drive'),dst=fake('dropbox');const engine=new U.CloudTransferExecutor(jobs,[src,dst]);
 await engine.queue(input());const out=await engine.execute('job1','owner-1','prive');
 assert.equal(out.status,'done');assert.equal(out.result.bytes,5);assert(dst.uploaded);assert.equal(jobs.finishes.length,1);
});
test('Corrupted target readback refuses to claim success',async()=>{
 const jobs=new MemoryJobs();const engine=new U.CloudTransferExecutor(jobs,[fake('google-drive'),fake('dropbox','hello',true)]);
 await engine.queue(input());const out=await engine.execute('job1','owner-1','prive');
 assert.equal(out.status,'review');assert.equal(out.error,'CLOUD_TARGET_SHA256_MISMATCH');
});
test('Unauthorized owner/space cannot claim or execute another user transfer',async()=>{
 const jobs=new MemoryJobs();const engine=new U.CloudTransferExecutor(jobs,[fake('google-drive'),fake('dropbox')]);
 await engine.queue(input());assert.equal(await engine.execute('job1','another-owner','prive'),null);
 assert.equal(await engine.execute('job1','owner-1','technisch'),null);assert.equal(jobs.finishes.length,0);
});
test('Move requires conditional deletion design; never deletes an original',async()=>{
 const jobs=new MemoryJobs();const engine=new U.CloudTransferExecutor(jobs,[fake('google-drive'),fake('dropbox')]);
 await assert.rejects(engine.queue(input({mode:'move'})),e=>e.code==='CLOUD_MOVE_NOT_SAFE_UNTIL_PROVIDER_CONDITIONAL_DELETE');
});
test('Copy rejects unavailable providers before persisting job',async()=>{
 const jobs=new MemoryJobs();const engine=new U.CloudTransferExecutor(jobs,[fake('google-drive')]);
 await assert.rejects(engine.queue(input()),e=>e.code==='CLOUD_TRANSFER_PROVIDER_NOT_CONFIGURED');assert.equal(jobs.job,null);
});
test('Idempotent enqueue returns same job; changed payload conflicts',async()=>{
 const jobs=new MemoryJobs();const engine=new U.CloudTransferExecutor(jobs,[fake('google-drive'),fake('dropbox')]);
 const one=await engine.queue(input());const two=await engine.queue(input());assert.equal(one.id,two.id);
 await assert.rejects(engine.queue(input({requestedName:'different.pdf'})),e=>e.code==='CLOUD_IDEMPOTENCY_PAYLOAD_MISMATCH');
});
test('Target folder non-writable refuses upload',async()=>{
 const jobs=new MemoryJobs(),src=fake('google-drive'),dst=fake('dropbox');dst.stat=async()=>({id:'root',name:'/',size:0,isFolder:true,canWrite:false,revision:''});
 const engine=new U.CloudTransferExecutor(jobs,[src,dst]);
 await assert.rejects(engine.queue(input()),e=>e.code==='CLOUD_TRANSFER_TARGET_FOLDER_NOT_WRITABLE');
 assert.equal(dst.uploaded,false);assert.equal(jobs.job,null);
});
test('Existing M1 release routes still have no user-executable transfer endpoint',()=>{
 const code=readFileSync(new URL('backend/cloud-integratie-routes.ts',root),'utf8');assert(!/['"](?:POST|PUT) \/api\/owner\/cloud\/integrations\/v1\/transfer\/(?:execute|run|submit)/.test(code));
});

test('Dropbox folder ID is translated to provider path before upload',async()=>{
 const calls=[];const d=new A.DropboxTransport(grant,async(url,opt)=>{
  calls.push({url,opt});
  if(url.endsWith('/get_metadata'))return json({'.tag':'folder',id:'id:folder123',name:'Documents',path_display:'/Reports/Documents'});
  if(url.endsWith('/start'))return json({session_id:'test-session'});
  if(url.endsWith('/append_v2'))return json({});
  if(url.endsWith('/finish'))return json({id:'id:done123',size:5,rev:'r2'});
  throw new Error('unexpected endpoint');
 });
 const r=await d.upload({...loc('dropbox','id:folder123'),parentId:'id:folder123'},'memo.txt',bytes('hello'),'text/plain');
 assert.equal(r.id,'id:done123');
 const arg=JSON.parse(calls.at(-1).opt.headers['Dropbox-API-Arg']);
 assert.equal(arg.commit.path,'/Reports/Documents/memo.txt');
});
test('Dropbox rejects inconsistent folder metadata instead of writing',async()=>{
 let calls=0;const d=new A.DropboxTransport(grant,async(url,opt)=>{calls++;return json({'.tag':'folder',id:'id:another',path_display:'/Reports'});});
 await assert.rejects(d.upload({...loc('dropbox','id:folder123'),parentId:'id:folder123'},'test.txt',bytes('1'),'text/plain'),e=>e.code==='CLOUD_DROPBOX_TARGET_FOLDER_UNVERIFIED');
 assert.equal(calls,1);
});
test('Graph SharePoint drive ID is resolved from registered account rather than request URL',async()=>{
 const requests=[];const m=new A.MicrosoftGraphTransport('sharepoint',grant,async(url,init)=>{requests.push(url);return json({id:'file123',name:'a.txt',size:5,eTag:'r',file:{mimeType:'text/plain'}});},async context=>'drive123');
 assert.equal((await m.stat(loc('sharepoint','file123'))).id,'file123');
 assert.equal(requests[0],'https://graph.microsoft.com/v1.0/drives/drive123/items/file123?$select=id,name,size,eTag,file,folder');
});
test('Migration has RLS, idempotency uniqueness and manual review state',()=>{
 const sql=readFileSync(new URL('migrations/0117_cloud_overdracht_jobs.sql',root),'utf8');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/i);
 assert.match(sql,/UNIQUE \(user_id,ruimte,idempotentie_sleutel\)/);
 assert.match(sql,/status IN \('queued','running','done','failed','review'\)/);
});
