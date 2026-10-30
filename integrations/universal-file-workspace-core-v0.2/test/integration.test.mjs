import test from 'node:test';
import assert from 'node:assert/strict';
import {Blob} from 'node:buffer';
import {BrowserFileSource} from '../dist/adapters/browser-file.js';
import {UniversalFileService,builtInSafeRuntimes} from '../dist/file-service.js';
import {SourceRegistry,EngineRegistry} from '../dist/registry.js';
import {implementedSafeEngines,proposedEngines} from '../dist/default-engines.js';
const scope={ownerId:'owner-1',space:'private',connectionId:'local-session'};
const actor=(changes={})=>({...scope,actorId:'user-1',allowedSources:new Set(['browser-file']),allowedConnections:new Set(['local-session']),allowedOperations:new Set(['preview','download','edit','share','print','convert']),...changes});
const make=()=>{const local=new BrowserFileSource(),sources=new SourceRegistry(),engines=new EngineRegistry();sources.register(local);[...proposedEngines,...implementedSafeEngines].forEach(e=>engines.register(e));const service=new UniversalFileService(sources,engines);builtInSafeRuntimes().forEach(r=>service.registerRuntime(r));return {local,sources,engines,service};};
const file=(local,txt,name='hello.txt',mime='text/plain')=>local.add(new Blob([txt],{type:mime}),name,scope);

test('browser-local source requires an explicit file and returns scoped opaque ID',async()=>{
 const {local}=make(),ref=file(local,'hello world');assert.match(ref.id,/^local-/);assert.equal(ref.source,'browser-file');assert(!ref.id.includes('hello'));assert.equal((await local.stat(ref,actor())).size,11);
});
test('readRange reads only requested bytes and reports exact size/revision',async()=>{
 const {local}=make(),ref=file(local,'abcdef');const r=await local.readRange(ref,actor(),2,4);assert.equal(new TextDecoder().decode(r.bytes),'cd');assert.equal(r.totalSize,6);assert.equal(r.etag,ref.revision);
});
test('local adapter blocks cross-user and cross-connection file IDs',async()=>{
 const {local}=make(),ref=file(local,'abc');await assert.rejects(local.stat(ref,actor({ownerId:'other'})),/ACCESS_DENIED/);await assert.rejects(local.readRange({...ref,connectionId:'other'},actor(),0,1),/ACCESS_DENIED/);
});
test('local adapter deletes a file without a filesystem permission',async()=>{
 const {local}=make(),ref=file(local,'abc');local.remove(ref.id);await assert.rejects(local.stat(ref,actor()),/FILE_NOT_FOUND/);
});
test('local adapter refuses missing/invalid range',async()=>{
 const {local}=make(),ref=file(local,'abc');await assert.rejects(local.readRange(ref,actor(),-1,2),/INVALID_RANGE/);await assert.rejects(local.readRange(ref,actor(),3,1),/INVALID_RANGE/);
});
test('safe text preview opens through one source-agnostic service',async()=>{
 const {local,service}=make(),ref=file(local,'Привіт світе');const r=await service.preview(ref,actor());assert.equal(r.content.kind,'text');assert.equal(r.content.text,'Привіт світе');assert.equal(r.info.engine?.id,'safe-text');assert.deepEqual(r.info.actions,['preview','download']);
});
test('HTML is shown as inert source text, never evaluated',async()=>{
 const {local,service}=make();const html='<script>doSomethingDangerous()</script>';const ref=file(local,html,'index.html','text/html');const r=await service.preview(ref,actor());assert.equal(r.content.kind,'text');assert.equal(r.content.text,html);assert.equal(r.info.signature.executableRisk,true);
});
test('PDF bytes open under registered native preview engine',async()=>{
 const {local,service}=make(),ref=local.add(new Blob([new Uint8Array([37,80,68,70,45,49,46,55])],{type:'application/pdf'}),'a.pdf',scope);const p=await service.preview(ref,actor());assert.equal(p.content.kind,'blob');assert.equal(p.content.mime,'application/pdf');assert.deepEqual([...p.content.bytes],[37,80,68,70,45,49,46,55]);
});
test('unimplemented proposed DOCX engine never reports preview ready',async()=>{
 const {local,service}=make(),ref=file(local,'not a full docx','document.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document');const i=await service.inspect(ref,actor());assert.equal(i.engine,null);assert.equal(i.previewAvailable,false);assert.equal(i.reason,'PREVIEW_ENGINE_NOT_INSTALLED');assert.deepEqual(i.actions,['download']);await assert.rejects(service.preview(ref,actor()),/NO_AUTHORIZED_PREVIEW_ENGINE/);
});
test('removing registered runtime or disabling manifest prevents preview',async()=>{
 const {local,service,engines}=make(),ref=file(local,'abc');engines.setEnabled('safe-text',false);const i=await service.inspect(ref,actor());assert.equal(i.previewAvailable,false);
});
test('source that supports read-only never advertises edit/share/convert despite owner actor grants',async()=>{
 const {local,service}=make(),ref=file(local,'hello');const r=await service.inspect(ref,actor());assert(!r.actions.includes('edit'));assert(!r.actions.includes('share'));assert(!r.actions.includes('convert'));
});
test('missing read permission fails before adapter reads',async()=>{
 const {local,service}=make(),ref=file(local,'hello');await assert.rejects(service.inspect(ref,actor({allowedOperations:new Set(['download'])})),/ACCESS_DENIED_OPERATION/);
});
test('preview with strict limit truncates but never exceeds cap',async()=>{
 const {local,service}=make(),ref=file(local,'abcdefghijklmnop');const r=await service.preview(ref,actor(),{maxBytes:5});assert.equal(r.content.text,'abcde');assert.equal(r.content.truncated,true);
});
test('invalid requested preview limits fail closed',async()=>{
 const {local,service}=make(),ref=file(local,'abc');await assert.rejects(service.preview(ref,actor(),{maxBytes:0}),/INVALID_PREVIEW_LIMIT/);await assert.rejects(service.preview(ref,actor(),{maxBytes:100*1024*1024}),/INVALID_PREVIEW_LIMIT/);
});
test('aborted read does not deliver partial content',async()=>{
 const {local,service}=make(),ref=file(local,'abcdef');const ac=new AbortController();ac.abort();await assert.rejects(service.preview(ref,actor(),{signal:ac.signal}),/ABORTED/);
});
test('lying oversized ranges rejected',async()=>{
 const {sources,engines,service}=make();sources.register({kind:'github',async stat(r){return r;},async readRange(){return {bytes:new Uint8Array(300000)};}});const ref={id:'git-opaque',source:'github',ownerId:'owner-1',connectionId:'gh-1',space:'private',displayName:'abc.pdf'};await assert.rejects(service.inspect(ref,actor({allowedSources:new Set(['github']),allowedConnections:new Set(['gh-1'])})),/ADAPTER_RANGE_VIOLATION/);
});
test('revision mismatch rejected before content rendering',async()=>{
 const {sources,service}=make();sources.register({kind:'github',async stat(r){return r;},async readRange(){return {bytes:Uint8Array.from([37,80,68,70,45]),etag:'revision-other'};}});const ref={id:'git-opaque',source:'github',ownerId:'owner-1',connectionId:'gh-1',space:'private',displayName:'abc.pdf',revision:'revision-expected'};await assert.rejects(service.inspect(ref,actor({allowedSources:new Set(['github']),allowedConnections:new Set(['gh-1'])})),/SOURCE_REVISION_CHANGED/);
});
test('adapter may not silently redirect to a different file ID',async()=>{
 const {sources,service}=make();sources.register({kind:'github',async stat(r){return {...r,id:'different-file'};},async readRange(){throw Error('never');}});const ref={id:'git-opaque',source:'github',ownerId:'owner-1',connectionId:'gh-1',space:'private',displayName:'abc.pdf'};await assert.rejects(service.inspect(ref,actor({allowedSources:new Set(['github']),allowedConnections:new Set(['gh-1'])})),/UNTRUSTED_METADATA_SCOPE/);
});
test('source declares size inconsistent with range response -> reject',async()=>{
 const {sources,service}=make();sources.register({kind:'github',async stat(r){return r;},async readRange(){return {bytes:Uint8Array.from([37,80,68,70,45]),totalSize:999};}});const ref={id:'git-opaque',source:'github',ownerId:'owner-1',connectionId:'gh-1',space:'private',displayName:'abc.pdf',size:5};await assert.rejects(service.preview(ref,actor({allowedSources:new Set(['github']),allowedConnections:new Set(['gh-1'])})),/SOURCE_SIZE_CHANGED/);
});
test('registerRuntime rejects a runtime without vetted manifest',()=>{
 const {service}=make();assert.throws(()=>service.registerRuntime({id:'evil-script',prepare:async()=>({kind:'metadata',mime:'a',reason:'a'})}),/RUNTIME_WITHOUT_MANIFEST/);
});
test('registerRuntime rejects duplicates',()=>{
 const {service}=make();assert.throws(()=>service.registerRuntime(builtInSafeRuntimes()[0]),/DUPLICATE_RUNTIME/);
});
test('unsafe SVG stays metadata-only when no dedicated sanitizer is installed',async()=>{
 const {local,service}=make(),ref=file(local,'<svg><script>alert(1)</script></svg>','untrusted.svg','image/svg+xml');const r=await service.inspect(ref,actor());assert.equal(r.previewAvailable,false);assert.deepEqual(r.actions,['download']);
});
