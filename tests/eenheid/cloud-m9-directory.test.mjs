import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=(()=>{try{return require('typescript')}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript')}})();
const root=new URL('../../',import.meta.url);
function asModule(path,changes={}){
 let source=readFileSync(new URL(path,root),'utf8');for(const [from,to] of Object.entries(changes))source=source.replaceAll(from,to);
 const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
 assert.equal(result.diagnostics.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
 return 'data:text/javascript;base64,'+Buffer.from(result.outputText).toString('base64');
}
const adapter=asModule('backend/cloud-overdracht-adapters.ts');
const xml=asModule('backend/cloud-m9-xml.ts',{"'./cloud-overdracht-adapters'":`'${adapter}'`});
const directory=asModule('backend/cloud-m9-directory.ts',{"'./cloud-overdracht-adapters'":`'${adapter}'`,"'./cloud-m9-xml'":`'${xml}'`});
const {parseCloudXml,childText}=await import(xml);
const {NextcloudDirectory,S3CompatibleDirectory}=await import(directory);
const context=(provider)=>({provider,userId:'user-01',accountId:'account-9',space:'prive'});
const xmlResponse=(s,status=207)=>new Response(s,{status,headers:{'Content-Type':'application/xml; charset=utf-8'}});
const davBase='/remote.php/dav/files/alice/';
const dav=(items,others='')=>`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>${davBase}Photos/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>${items.map(x=>`<d:response><d:href>${davBase}Photos/${x.name}</d:href><d:propstat><d:prop><d:resourcetype>${x.folder?'<d:collection/>':''}</d:resourcetype><d:getcontentlength>${x.size||'0'}</d:getcontentlength><d:getetag>"rev"</d:getetag><d:getcontenttype>image/jpeg</d:getcontenttype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('')}${others}</d:multistatus>`;
const s3Xml=(contents='',folders='',extra='')=>`<?xml version="1.0"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><EncodingType>url</EncodingType><Prefix>Projects/</Prefix>${folders}${contents}<IsTruncated>false</IsTruncated>${extra}</ListBucketResult>`;
const s3Cfg={bucket:'my-secure-bucket',region:'eu-west-1',prefix:'',accessKeyId:'AKIA12345678901234',secretAccessKey:'secretaaaaaabbbbbcccccdddddeeeeefffff'};
const b2Cfg={bucket:'my-backup-bucket',region:'eu-central-003',prefix:'',keyId:'003b2b2b2b2b2b2b',applicationKey:'application-key-realistic'};
const dcfg={origin:'https://cloud.example.org/',davUsername:'alice',authorization:'Basic dXNlcjpwYXNzd29yZA=='};
const nc=(body,options={})=>new NextcloudDirectory(async()=>dcfg,async()=>true,async(url,init)=>{options.spy?.(url,init);return xmlResponse(body);});
test('XML: namespace-aware structure and five predefined entity references',()=>{
 const x=parseCloudXml('<d:a xmlns:d="DAV:"><d:b>rock &amp; roll &#x1F512; &lt;x&gt;</d:b></d:a>');
 assert.equal(x.ns,'DAV:');assert.equal(childText(x,'b','DAV:'),'rock & roll 🔒 <x>');
});
test('XML: reject DTD, ENTITY, unknown entity, stray processing instruction, and mismatched closing',()=>{
 for(const s of ['<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x/>','<x>&secret;</x>','<x></y>','<x><?pi unsafe?></x>'])
  assert.throws(()=>parseCloudXml(s),{name:'CloudTransportError'});
});
test('XML: rejects unbounded depth and giant text',()=>{
 assert.throws(()=>parseCloudXml('<x>'.repeat(26)+'</x>'.repeat(26)),{name:'CloudTransportError'});
 assert.throws(()=>parseCloudXml('<x>'+'a'.repeat(33000)+'</x>'),{name:'CloudTransportError'});
});
test('Nextcloud: PROPFIND depth 1 and verified DAV listing',async()=>{
 const calls=[];const page=await nc(dav([{name:'photo%201.jpg',size:'12'},{name:'Albums/',folder:true}]),{spy:(url,init)=>calls.push({url,init})}).list(context('nextcloud'),'/Photos/',null);
 assert.equal(page.items.length,2);assert.equal(page.items[0].name,'photo 1.jpg');assert.equal(page.items[0].size,12);
 assert.equal(page.items[1].kind,'folder');assert.equal(page.items[1].id,'/Photos/Albums/');assert.equal(calls[0].init.headers.Depth,'1');
});
test('Nextcloud: rejects href that escapes the users DAV root',async()=>{
 const malicious=dav([],`<d:response><d:href>/remote.php/dav/files/bob/secrets.txt</d:href><d:propstat><d:prop><d:getcontentlength>20</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`);
 await assert.rejects(nc(malicious).list(context('nextcloud'),'/Photos/',null),e=>e.code==='CLOUD_M9_DAV_HREF_UNTRUSTED');
});
test('Nextcloud: rejects ancestor scope leakage and recursion',async()=>{
 const malicious=dav([],`<d:response><d:href>${davBase}Photos/more/deep.txt</d:href><d:propstat><d:prop><d:getcontentlength>20</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`);
 await assert.rejects(nc(malicious).list(context('nextcloud'),'/Photos/',null),e=>e.code==='CLOUD_M9_DAV_DEPTH_VIOLATION');
});
test('Nextcloud: rejects unexpected 207 XML doc type and dangerous server origin',async()=>{
 await assert.rejects(nc('<notdav/>').list(context('nextcloud'),'/Photos/',null),e=>e.code==='CLOUD_M9_DAV_ROOT_INVALID');
 const driver=new NextcloudDirectory(async()=>({...dcfg,origin:'http://127.0.0.1/'}),async()=>true,async()=>{throw Error('No HTTP');});
 await assert.rejects(driver.list(context('nextcloud'),'root',null),e=>e.code==='CLOUD_M9_DAV_ORIGIN_INVALID');
});
test('Nextcloud: denies access when egress policy rejects target',async()=>{
 const driver=new NextcloudDirectory(async()=>dcfg,async()=>false,async()=>{throw Error('HTTP not allowed');});
 await assert.rejects(driver.list(context('nextcloud'),'root',null),e=>e.code==='CLOUD_M9_EGRESS_REJECTED');
});
test('Nextcloud: does not accept paginated cursor where provider has no pagination',async()=>{
 await assert.rejects(nc(dav([])).list(context('nextcloud'),'/Photos/','opaque'),e=>e.code==='CLOUD_M9_DAV_NO_PAGINATION');
});
test('AWS S3: SigV4 GET and decoded files and folders',async()=>{
 const calls=[];const contents='<Contents><Key>Projects/report%20A.pdf</Key><Size>144</Size><ETag>"etag"</ETag></Contents>';
 const folders='<CommonPrefixes><Prefix>Projects/2026%20work/</Prefix></CommonPrefixes>';
 const driver=new S3CompatibleDirectory('s3',async()=>s3Cfg,undefined,async(url,init)=>{calls.push({url,init});return xmlResponse(s3Xml(contents,folders),200);},()=>new Date('2026-10-28T08:00:00Z'));
 const page=await driver.list(context('s3'),'Projects/',null);
 assert.equal(page.items.length,2);assert.equal(page.items[0].name,'2026 work');assert.equal(page.items[1].name,'report A.pdf');assert.equal(page.items[1].size,144);
 const u=new URL(calls[0].url);assert.equal(u.hostname,'my-secure-bucket.s3.eu-west-1.amazonaws.com');assert.equal(u.searchParams.get('list-type'),'2');assert.equal(u.searchParams.get('prefix'),'Projects/');assert.match(calls[0].init.headers.authorization,/^AWS4-HMAC-SHA256/);
});
test('AWS S3: when truncated continuation token must be present',async()=>{
 const source=s3Xml().replace('<IsTruncated>false</IsTruncated>','<IsTruncated>true</IsTruncated>');
 const driver=new S3CompatibleDirectory('s3',async()=>s3Cfg,undefined,async()=>xmlResponse(source,200));
 await assert.rejects(driver.list(context('s3'),'Projects/',null),e=>e.code==='CLOUD_M9_S3_CONTINUATION_INVALID');
});
test('AWS S3: no cross-prefix object injection',async()=>{
 const source=s3Xml('<Contents><Key>Other/secret.txt</Key><Size>1</Size></Contents>');
 const driver=new S3CompatibleDirectory('s3',async()=>s3Cfg,undefined,async()=>xmlResponse(source,200));
 await assert.rejects(driver.list(context('s3'),'Projects/',null),e=>e.code==='CLOUD_M9_S3_CROSS_PREFIX');
});
test('Backblaze B2: distinct path-style endpoint and SigV4',async()=>{
 const calls=[];const driver=new S3CompatibleDirectory('backblaze-b2',undefined,async()=>b2Cfg,async(url,init)=>{calls.push({url,init});return xmlResponse(s3Xml(),200);});
 const page=await driver.list(context('backblaze-b2'),'Projects/',null);
 assert.equal(page.items.length,0);assert.equal(new URL(calls[0].url).hostname,'s3.eu-central-003.backblazeb2.com');assert(new URL(calls[0].url).pathname.startsWith('/my-backup-bucket'));
});
test('AWS S3: long XML response refused even with inaccurate content-length',async()=>{
 const driver=new S3CompatibleDirectory('s3',async()=>s3Cfg,undefined,async()=>new Response('<x>'+'x'.repeat(1_100_000)+'</x>',{status:200,headers:{'Content-Length':'10'}}));
 await assert.rejects(driver.list(context('s3'),'Projects/',null),e=>e.code==='CLOUD_M9_RESPONSE_TOO_LARGE');
});
test('S3: rejects arbitrary cursor control characters and traversal folder references',async()=>{
 const driver=new S3CompatibleDirectory('s3',async()=>s3Cfg,undefined,async()=>{throw Error('HTTP should not be called');});
 await assert.rejects(driver.list(context('s3'),'../Projects/',null),e=>e.code==='CLOUD_M9_FOLDER_INVALID');
 await assert.rejects(driver.list(context('s3'),'Projects/','a\nB'),e=>e.code==='CLOUD_M9_CONTINUATION_INVALID');
});
test('S3 continuation cursor is returned and signed back to provider',async()=>{
 const calls=[];let n=0;
 const driver=new S3CompatibleDirectory('s3',async()=>s3Cfg,undefined,async(url)=>{
  calls.push(String(url));n++;
  return xmlResponse(n===1?s3Xml().replace('<IsTruncated>false</IsTruncated>','<IsTruncated>true</IsTruncated><NextContinuationToken>next=ABC%2F</NextContinuationToken>'):s3Xml(),200);
 });
 const first=await driver.list(context('s3'),'Projects/',null);
 assert.equal(first.nextCursor,'next=ABC%2F');await driver.list(context('s3'),'Projects/',first.nextCursor);
 assert.equal(new URL(calls[1]).searchParams.get('continuation-token'),'next=ABC%2F');
});
