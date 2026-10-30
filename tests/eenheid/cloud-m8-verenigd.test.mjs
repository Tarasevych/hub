import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root=new URL('../../',import.meta.url);
function src(file,replacements={}){
 let code=readFileSync(new URL(file,root),'utf8');for(const [a,b] of Object.entries(replacements))code=code.replaceAll(a,b);
 const output=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
 assert.equal(output.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
 return 'data:text/javascript;base64,'+Buffer.from(output.outputText).toString('base64');
}
const base=src('backend/cloud-overdracht-adapters.ts');
const cat=src('shared/cloud-m5-catalogus.ts');
const types=src('shared/cloud-integratie-contract.ts');
const directory=src('backend/cloud-m8-directory.ts',{"'./cloud-overdracht-adapters'":`'${base}'`});
const workspace=src('backend/cloud-m8-werkruimte.ts',{"'./cloud-overdracht-adapters'":`'${base}'`,"'../shared/cloud-m5-catalogus'":`'${cat}'`,"'../shared/cloud-integratie-contract'":`'${types}'`});
const D=await import(directory),W=await import(workspace);
const ctx=(provider='google-drive',accountId='acc1')=>({userId:'user1',space:'prive',accountId,provider});
const resp=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json'}});
const call=(x)=>async(u,init)=>{x.push({url:String(u),init});return resp({});};
test('Google Drive directory maps folder and files and keeps account authorization',async()=>{
 const calls=[];const driver=new D.GoogleDriveDirectory(async()=> 'grant-a',async(u,init)=>{calls.push({url:String(u),init});return resp({files:[{id:'g1',name:'Work',mimeType:'application/vnd.google-apps.folder'},{id:'g2',name:'Report.pdf',size:'29',mimeType:'application/pdf',version:'8'}],nextPageToken:'token_2'});});
 const page=await driver.list(ctx(),'folder-123',null);assert.equal(page.items.length,2);assert.equal(page.items[0].kind,'folder');assert.equal(page.items[1].size,29);assert.equal(page.nextCursor,'token_2');
 const u=new URL(calls[0].url);assert(u.searchParams.get('q').includes("'folder-123' in parents"));assert.equal(calls[0].init.headers.Authorization,'Bearer grant-a');
});
test('Google Drive does not accept URL as folder reference',async()=>{
 const driver=new D.GoogleDriveDirectory(async()=> 'token',async()=>{throw Error('network should not occur');});
 await assert.rejects(driver.list(ctx(),'https://evil.example/path',null),e=>e.code==='CLOUD_M8_INVALID_REFERENCE');
});
test('Microsoft Graph lists OneDrive children',async()=>{
 const calls=[];const driver=new D.GraphDirectory('onedrive-personal',async()=> 'token',undefined,async(u,init)=>{calls.push(String(u));return resp({value:[{id:'a',name:'a.docx',size:12,eTag:'1',file:{mimeType:'application/docx'}}]});});
 const page=await driver.list(ctx('onedrive-personal'),'root',null);assert.equal(page.items[0].name,'a.docx');assert(calls[0].includes('/me/drive/root/children'));
});
test('SharePoint never guesses a drive id',async()=>{
 const driver=new D.GraphDirectory('sharepoint',async()=> 'token',undefined,async()=>{throw Error('should not call');});
 await assert.rejects(driver.list(ctx('sharepoint'),'root',null),e=>e.code==='CLOUD_M8_SHAREPOINT_DRIVE_REQUIRED');
});
test('Graph cursor only points to matching folder within graph.microsoft.com',async()=>{
 const driver=new D.GraphDirectory('onedrive-business',async()=> 'token',undefined,async()=>resp({value:[]}));
 await assert.rejects(driver.list(ctx('onedrive-business'),'root','https://evil.example/v1.0/me/drive/root/children?$skiptoken=1'),e=>e.code==='CLOUD_M8_GRAPH_CURSOR_UNTRUSTED');
 await assert.rejects(driver.list(ctx('onedrive-business'),'root','https://graph.microsoft.com/v1.0/me/drive/items/other/children?$skiptoken=1'),e=>e.code==='CLOUD_M8_GRAPH_CURSOR_UNTRUSTED');
});
test('Dropbox list folder and continuation use correct endpoint',async()=>{
 const calls=[];const driver=new D.DropboxDirectory(async()=> 'box-grant',async(u,init)=>{calls.push({u:String(u),init});return resp(calls.length===1?{entries:[{'id':'id:00001',name:'X',size:3,'.tag':'file',rev:'a'}],has_more:true,cursor:'next-2'}:{entries:[],has_more:false});});
 const first=await driver.list(ctx('dropbox'),'root',null);assert.equal(first.items[0].size,3);const page=await driver.list(ctx('dropbox'),'root',first.nextCursor);assert.equal(page.nextCursor,null);
 assert(calls[1].u.endsWith('/files/list_folder/continue'));assert.equal(JSON.parse(calls[1].init.body).cursor,'next-2');
});
test('Box folder listing supports marker',async()=>{
 const calls=[];const driver=new D.BoxDirectory(async()=> 'grant',async(u)=>{calls.push(String(u));return resp({entries:[{id:'456',type:'folder',name:'Docs',etag:'e'}],next_marker:'m2'});});
 const page=await driver.list(ctx('box'),'folder:0',null);assert.equal(page.items[0].id,'folder:456');assert.equal(page.nextCursor,'m2');assert(calls[0].includes('usemarker=true'));
});
test('GitHub shows repository files as folders and does not invent pagination',async()=>{
 const calls=[];const driver=new D.GithubDirectory(async()=> 'git-token',async()=>({owner:'me',repo:'repo',branch:'main'}),async(u,init)=>{calls.push([String(u),init]);return resp([{type:'file',path:'src/a.ts',name:'a.ts',size:9,sha:'one'},{type:'dir',path:'src/docs',name:'docs',sha:'two'}]);});
 const page=await driver.list(ctx('github'),'src',null);assert.equal(page.items[1].kind,'folder');assert.equal(page.items[0].revision,'one');assert.equal(page.nextCursor,null);assert(calls[0][0].includes('/contents/src/?ref=main'));
});
test('GitHub rejects more than 100 entries instead of silently losing some',async()=>{
 const driver=new D.GithubDirectory(async()=> 'token',async()=>({owner:'me',repo:'repo',branch:'main'}),async()=>resp(Array.from({length:101},(_,i)=>({type:'file',path:`x/${i}`,name:`${i}`,size:1,sha:'x'}))));
 await assert.rejects(driver.list(ctx('github'),'x',null),e=>e.code==='CLOUD_M8_UNBOUNDED_PAGE');
});
test('pCloud lists only from verified EU or US region',async()=>{
 const calls=[];const driver=new D.PCloudDirectory(async()=> 'token',async()=> 'eapi.pcloud.com',async(u)=>{calls.push(String(u));return resp({result:0,metadata:{isfolder:true,contents:[{isfolder:false,fileid:5,name:'video.mp4',size:11,hash:5}]}});});
 const page=await driver.list(ctx('pcloud'),'0',null);assert.equal(page.items[0].name,'video.mp4');assert(calls[0].startsWith('https://eapi.pcloud.com/listfolder?'));
});
test('pCloud refuses user-supplied host injection',async()=>{
 const driver=new D.PCloudDirectory(async()=> 'token',async()=> '169.254.169.254',async()=>{throw Error('not expected');});
 await assert.rejects(driver.list(ctx('pcloud'),'0',null),e=>e.code==='CLOUD_M8_PCLOUD_HOST_UNTRUSTED');
});
const cursors=()=>new W.CloudOpaqueCursors(Buffer.alloc(32,8),()=>50000);
const account=(id='acc1',provider='google-drive',space='prive')=>({id,provider,owner:'user1',space,status:'connected',label:'Work account'});
const principal={owner:'user1',space:'prive'};
const browse=(accounts,drivers,policy=async()=>{})=>new W.CloudMultiAccountWorkspace({find:async(p,id)=>accounts.find(a=>a.id===id)||null},policy,cursors(),drivers);
const mockProvider=(provider='google-drive')=>({provider,list:async(ctx,folder,cursor)=>({items:[{id:'file-1',name:'test.pdf',kind:'file',size:2,revision:'x',mime:'application/pdf'}],nextCursor:cursor?null:'next_provider'})});
test('coordinator binds account to canonical owner and space',async()=>{
 const workspace=browse([account('acc1'),{...account('other'),owner:'another'}],[mockProvider()]);
 const x=await workspace.list(principal,{accountId:'acc1',folderId:'root'});assert.equal(x.items.length,1);
 await assert.rejects(workspace.list(principal,{accountId:'other',folderId:'root'}),e=>e.code==='CLOUD_M8_ACCOUNT_NOT_AVAILABLE');
});
test('coordinator cannot use technical account from private space',async()=>{
 const workspace=browse([account('acc', 'google-drive','technisch')],[mockProvider()]);
 await assert.rejects(workspace.list(principal,{accountId:'acc',folderId:'root'}),e=>e.code==='CLOUD_M8_ACCOUNT_NOT_AVAILABLE');
});
test('coordinator checks provider live policy before provider API',async()=>{
 let requests=0;const workspace=browse([account()], [{provider:'google-drive',list:async()=>{requests++;return{items:[],nextCursor:null};}}],async()=>{throw new Error('blocked');});
 await assert.rejects(workspace.list(principal,{accountId:'acc1',folderId:'root'}));assert.equal(requests,0);
});
test('signed cursors cannot be reused with another folder or account',async()=>{
 const workspace=browse([account(),account('acc2')],[mockProvider()]);
 const first=await workspace.list(principal,{accountId:'acc1',folderId:'root'});assert(first.nextCursor);
 const second=await workspace.list(principal,{accountId:'acc1',folderId:'root',cursor:first.nextCursor});assert.equal(second.nextCursor,null);
 await assert.rejects(workspace.list(principal,{accountId:'acc2',folderId:'root',cursor:first.nextCursor}),e=>e.code==='CLOUD_M8_CURSOR_INVALID_OR_OTHER_CONTEXT');
 await assert.rejects(workspace.list(principal,{accountId:'acc1',folderId:'other',cursor:first.nextCursor}),e=>e.code==='CLOUD_M8_CURSOR_INVALID_OR_OTHER_CONTEXT');
});
test('tampered cursor signature fails',async()=>{
 const workspace=browse([account()],[mockProvider()]);const first=await workspace.list(principal,{accountId:'acc1',folderId:'root'});
 await assert.rejects(workspace.list(principal,{accountId:'acc1',folderId:'root',cursor:(first.nextCursor.startsWith('A')?'B':'A')+first.nextCursor.slice(1)}),e=>e.code==='CLOUD_M8_CURSOR_INVALID_OR_OTHER_CONTEXT');
});
test('independent account batch returns partial failure without leaking source data',async()=>{
 const workspace=browse([account(),account('acc2')],[mockProvider()]);
 const results=await workspace.across(principal,[{accountId:'acc1',folderId:'root'},{accountId:'missing',folderId:'root'},{accountId:'acc2',folderId:'root'}]);
 assert.equal(results.length,3);assert.equal(results[0].ok,true);assert.equal(results[1].ok,false);assert.equal(results[2].ok,true);
 assert(!('page'in results[1]));
});
test('rejects oversized fanout and duplicate account-folder requests',async()=>{
 const w=browse([account()],[mockProvider()]);
 await assert.rejects(w.across(principal,Array.from({length:9},()=>({accountId:'acc1',folderId:'root'}))),e=>e.code==='CLOUD_M8_BATCH_INVALID');
 await assert.rejects(w.across(principal,[{accountId:'acc1',folderId:'root'},{accountId:'acc1',folderId:'root'}]),e=>e.code==='CLOUD_M8_DUPLICATE_BATCH');
});

test('encrypted continuation does not disclose provider cursor or folder',async()=>{
 const w=browse([account()],[mockProvider()]);
 const first=await w.list(principal,{accountId:'acc1',folderId:'secret-folder'});
 const token=first.nextCursor;
 assert(token&&!token.includes('next_provider'));
 assert(!Buffer.from(token,'base64url').toString('utf8').includes('secret-folder'));
});
test('HTTP list responses are bounded even when content-length is missing',async()=>{
 const driver=new D.GoogleDriveDirectory(async()=> 'token',async()=>new Response('x'.repeat((1<<20)+1),{status:200}));
 await assert.rejects(driver.list(ctx(),'folder1',null),e=>e.code==='CLOUD_M8_RESPONSE_TOO_LARGE');
});
test('account revoked after an earlier page invalidates subsequent pagination',async()=>{
 const record=account();const w=browse([record],[mockProvider()]);
 const first=await w.list(principal,{accountId:'acc1',folderId:'root'});
 record.status='revoked';
 await assert.rejects(w.list(principal,{accountId:'acc1',folderId:'root',cursor:first.nextCursor}),e=>e.code==='CLOUD_M8_ACCOUNT_NOT_AVAILABLE');
});
test('provider response cannot silently exceed page limit',async()=>{
 const driver=new D.BoxDirectory(async()=> 'token',async()=>resp({entries:Array.from({length:101},(_,i)=>({id:String(i),type:'file',name:'file '+i,size:10}))}));
 await assert.rejects(driver.list(ctx('box'),'0',null),e=>e.code==='CLOUD_M8_UNBOUNDED_PAGE');
});
