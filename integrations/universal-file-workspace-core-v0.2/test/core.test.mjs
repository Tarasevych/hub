import test from 'node:test';
import assert from 'node:assert/strict';
import {detectFile} from '../dist/sniff.js';
import {SourceRegistry,EngineRegistry,resolveViewer} from '../dist/registry.js';
import {proposedEngines} from '../dist/default-engines.js';
const arr= x=>Uint8Array.from(x);
test('PDF magic overrides fake .exe filename (never execute)',()=>{
  const r=detectFile('payload.exe','application/octet-stream',arr([37,80,68,70,45,49]));assert.equal(r.family,'pdf');assert.equal(r.confidence,'high');
});
test('Zip is archive unless manifest verified',()=>{
  assert.equal(detectFile('abc.docx','application/zip',arr([80,75,3,4])).family,'archive');
  assert.equal(detectFile('abc.docx','application/zip',arr([80,75,3,4]),['word/document.xml']).family,'word');
});
test('Script and executable signatures are risk tagged',()=>{
 assert.equal(detectFile('script.html').executableRisk,true);
 assert.equal(detectFile('look.pdf','application/pdf',arr([77,90,20])).executableRisk,true);
});
test('Registry returns no renderer for absent or disabled engine',()=>{
 const e=new EngineRegistry(); proposedEngines.forEach(x=>e.register(x));
 assert.equal(e.choose(detectFile('report.pdf')).id,'builtin-pdf');e.setEnabled('builtin-pdf',false);assert.equal(e.choose(detectFile('report.pdf')),null);
 assert.equal(e.choose(detectFile('deck.pptx')),null);
});
test('ACL: private vs technical, owner and connector are fail closed',async()=>{
 const a=new SourceRegistry();a.register({kind:'gmail',async stat(r){return r;},async readRange(){return {bytes:arr([37,80,68,70,45])};}});
 const e=new EngineRegistry(); proposedEngines.forEach(x=>e.register(x));
 const ref={id:'attachment-8',source:'gmail',connectionId:'connection-1',ownerId:'owner-1',space:'private',displayName:'readme.pdf'};
 const actor={actorId:'me',ownerId:'owner-1',space:'private',allowedSources:new Set(['gmail']),allowedConnections:new Set(['connection-1']),allowedOperations:new Set(['preview','download'])};
 const result=await resolveViewer(a,e,ref,actor);assert.equal(result.renderer?.id,'builtin-pdf');assert.deepEqual(result.enabledActions,['preview','download']);
 await assert.rejects(resolveViewer(a,e,{...ref,space:'technical'},actor),/ACCESS_DENIED_OWNER_OR_SPACE/);
 await assert.rejects(resolveViewer(a,e,{...ref,connectionId:'other'},actor),/ACCESS_DENIED_SOURCE/);
 await assert.rejects(resolveViewer(a,e,{...ref,id:'https://bad.example/x'},actor),/INVALID_OPAQUE_FILE_ID/);
});
test('Source metadata cannot silently switch owners',async()=>{
 const a=new SourceRegistry();a.register({kind:'github',async stat(r){return {...r,ownerId:'intruder'};},async readRange(){throw Error('must not fetch');}});
 const e=new EngineRegistry();const ref={id:'repo-file',source:'github',connectionId:'gh-1',ownerId:'owner-1',space:'technical',displayName:'README.md'};
 const actor={actorId:'me',ownerId:'owner-1',space:'technical',allowedSources:new Set(['github']),allowedConnections:new Set(['gh-1']),allowedOperations:new Set(['preview'])};
 await assert.rejects(resolveViewer(a,e,ref,actor),/UNTRUSTED_METADATA_SCOPE/);
});
