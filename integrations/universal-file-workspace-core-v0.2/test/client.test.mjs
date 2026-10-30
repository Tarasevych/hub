import test from 'node:test';
import assert from 'node:assert/strict';
import {UniversalViewerClient} from '../dist/file-client.js';
const handle='opaque_file_handle_123456';
const make=(handler=async()=>new Response(JSON.stringify({handle,displayName:'file.pdf',mime:'application/pdf',family:'pdf',size:100,revision:'v2',sourceLabel:'Mail',actions:['preview','download'],previewAvailable:true}),{status:200,headers:{'Content-Type':'application/json'}}))=>{
 const calls=[];const client=new UniversalViewerClient({getCsrf:()=> 'csrf-test',fetcher:async(url,opts)=>{calls.push([url,opts]);return handler(url,opts);}});return {client,calls};
};
test('any app origin uses same fixed authenticated inspect endpoint',async()=>{
 const {client,calls}=make();await client.open({handle,origin:'mail'});await client.open({handle,origin:'github'});
 assert.equal(calls.length,2);assert.equal(calls[0][0],'/api/owner/universal-files/v1/inspect');
 assert.equal(calls[1][0],'/api/owner/universal-files/v1/inspect');
 assert.equal(calls[0][1].credentials,'same-origin');assert.equal(calls[0][1].cache,'no-store');assert.equal(calls[0][1].redirect,'error');
 assert(!JSON.stringify(calls).includes('https://'));
});
test('handle cannot be arbitrary provider URL/path',async()=>{
 const {client,calls}=make();await assert.rejects(client.open({handle:'https://drive.google.com/123',origin:'cloud'}),/INVALID_OPAQUE_HANDLE/);
 await assert.rejects(client.open({handle:'../../etc/passwd',origin:'local'}),/INVALID_OPAQUE_HANDLE/);assert.equal(calls.length,0);
});
test('no CSRF token: network call is never made',async()=>{
 let called=false;const client=new UniversalViewerClient({getCsrf:()=>'',fetcher:async()=>{called=true;return new Response();}});
 await assert.rejects(client.open({handle,origin:'mail'}),/MISSING_CSRF_TOKEN/);assert.equal(called,false);
});
test('server cannot switch returned handle during inspect',async()=>{
 const {client}=make(async()=>new Response(JSON.stringify({handle:'other_handle_00000000'}),{status:200}));await assert.rejects(client.open({handle,origin:'cloud'}),/FILE_HANDLE_MISMATCH/);
});
test('readRange max 256 KiB and strict response size',async()=>{
 const {client,calls}=make(async()=>new Response(new Uint8Array(4),{status:200}));const bytes=await client.readRange(handle,0,4);assert.equal(bytes.byteLength,4);
 assert.equal(calls[0][0],'/api/owner/universal-files/v1/content');
 await assert.rejects(client.readRange(handle,0,300000),/INVALID_RANGE/);
});
test('backend 401/403/409 map to safe reason codes',async()=>{
 for(const [status,code] of [[401,'AUTH_REQUIRED'],[403,'ACCESS_DENIED'],[409,'SOURCE_REVISION_CHANGED']]){
  const {client}=make(async()=>new Response('SENSITIVE PRIVATE PROVIDER ERROR',{status}));await assert.rejects(client.open({handle,origin:'mail'}),new RegExp(code));
 }
});
