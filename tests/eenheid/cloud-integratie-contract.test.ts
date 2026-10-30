import test from 'node:test';
import { CloudProviderRegister, CloudAdapterNietBeschikbaar } from '../../shared/cloud-aanbieder-register.ts';
import assert from 'node:assert/strict';
import { CLOUD_AKTIES, alleGeblokkeerd, beoordeelOverdracht, geenSteun, googleBestandMogelijkheden,
  native, providerStatus, veiligVoorCloudImport, type CloudOverdrachtVerzoek } from '../../shared/cloud-integratie-contract.ts';
const source={aanbieder:'google-drive',accountId:'account_123',bestandId:'file_abc',ruimte:'prive'} as const;
const request:CloudOverdrachtVerzoek={mode:'copy',bron:source,doel:{aanbieder:'cloud-native',accountId:'own',ruimte:'prive'}};
const yes={bronLezen:native('read'),doelSchrijven:native('write'),sourceLive:true,targetLive:true,userConfirmedMove:false,
 resourceCompatible:true,authenticatedSameOwnerAndSpace:true,executorReady:true};
test('Actions enumeration is complete and unique',()=>{
 assert.equal(CLOUD_AKTIES.length,16);
 assert.equal(new Set(CLOUD_AKTIES).size,CLOUD_AKTIES.length);
});
test('No capability without a verified provider',()=>{
 for(const a of Object.values(alleGeblokkeerd('NO_PROVIDER')))assert.deepEqual(a,{kind:'unavailable',enabled:false,reason:'NO_PROVIDER'});
});
test('Google Drive absent ACL = fail closed',()=>{
 const c=googleBestandMogelijkheden({id:'f',mimeType:'application/pdf'});
 assert.equal(c.read.enabled,false);assert.equal(c.rename.enabled,false);assert.equal(c.share.enabled,false);
});
test('Google Drive explicit read and edit only maps to implemented functionality',()=>{
 const c=googleBestandMogelijkheden({id:'f',mimeType:'application/pdf',capabilities:{canDownload:true,canEdit:true,canRename:true,canCopy:true,canShare:true,canDelete:true}});
 assert.equal(c.read.enabled,true);assert.equal(c.preview.enabled,false);assert.equal(c.rename.enabled,true);
 assert.equal(c.delete.enabled,true);assert.equal(c.copy.enabled,false);assert.equal(c.share.enabled,false);
 assert.equal(c.move.enabled,false);
});
test('Trash resource cannot be opened, copied or shared',()=>{
 const c=googleBestandMogelijkheden({id:'f',trashed:true,capabilities:{canDownload:true,canShare:true}});
 assert(Object.values(c).every(a=>!a.enabled));
});
test('Folder is not treated as downloadable file',()=>{
 const c=googleBestandMogelijkheden({id:'f',mimeType:'application/vnd.google-apps.folder',capabilities:{canDownload:true}});
 assert.equal(c.read.enabled,false);assert.equal(c.preview.enabled,false);
});
test('Native Google Docs are not silently considered binary DOCX',()=>{
 const c=googleBestandMogelijkheden({id:'f',mimeType:'application/vnd.google-apps.document',capabilities:{canDownload:true}});
 assert.equal(c.read.enabled,true);assert.equal(c.read.kind,'native');
 if(c.read.kind==='native') assert.equal(c.read.technique,'google_drive_files_export');
});
test('Native Cloud 6MiB limit and MIME whitelist',()=>{
 assert(veiligVoorCloudImport('application/pdf',6*1024*1024));
 assert(!veiligVoorCloudImport('application/pdf',6*1024*1024+1));
 assert(!veiligVoorCloudImport('image/svg+xml',1024));
 assert(!veiligVoorCloudImport('text/html',1024));
 assert(!veiligVoorCloudImport('application/pdf',0));
 assert(!veiligVoorCloudImport('application/pdf',null));
 assert(!veiligVoorCloudImport('application/vnd.google-apps.document',100));
});
test('Copy requires both permissions, both live, matching spaces and a real executor',()=>{
 assert.equal(beoordeelOverdracht(request,yes).decision,'ready');
 const fail=[{...yes,bronLezen:geenSteun('NO_READ')},{...yes,doelSchrijven:geenSteun('NO_WRITE')},
  {...yes,sourceLive:false},{...yes,targetLive:false},{...yes,resourceCompatible:false},
  {...yes,authenticatedSameOwnerAndSpace:false},{...yes,executorReady:false}];
 fail.forEach(x=>assert.equal(beoordeelOverdracht(request,x).decision,'blocked'));
});
test('Cross-space operation blocked even when ACLs are green',()=>{
 const cross={...request,doel:{...request.doel,ruimte:'technisch' as const}};
 const p=beoordeelOverdracht(cross,yes);
 assert(p.reasonCodes.includes('SPACE_OR_OWNER_MISMATCH'));
});
test('Move requires explicit confirmation and only deletes after readiness',()=>{
 const move={...request,mode:'move' as const};
 const p=beoordeelOverdracht(move,yes);
 assert.equal(p.decision,'blocked');assert.equal(p.deleteOriginal,false);
 const ready=beoordeelOverdracht(move,{...yes,userConfirmedMove:true});
 assert.equal(ready.decision,'ready');assert.equal(ready.deleteOriginal,true);
 const notReady=beoordeelOverdracht(move,{...yes,userConfirmedMove:true,executorReady:false});
 assert.equal(notReady.deleteOriginal,false);
});
test('No provider becomes connected before an implementation is available',()=>{
 assert.equal(providerStatus('dropbox',true,false).ready,false);
 assert.equal(providerStatus('google-drive',false,true).status,'needs-connection');
 assert.equal(providerStatus('cloud-native',true,true).ready,true);
});
test('Plan cannot authorize a transfer when source consent is missing',()=>{
 const p=beoordeelOverdracht(request,{...yes,bronLezen:{kind:'needs-consent',enabled:false,missingScopes:['files.read']}});
 assert(p.reasonCodes.includes('SOURCE_NEEDS_CONSENT'));
});

test('Provider register blocks unimplemented providers and cross-space reads',async()=>{
 const registry=new CloudProviderRegister();
 const ctx={ownerUserId:'user-1',ruimte:'prive' as const};
 await assert.rejects(()=>registry.inspect(ctx,{...source,aanbieder:'dropbox'}),(e:unknown)=>e instanceof CloudAdapterNietBeschikbaar&&e.code==='CLOUD_PROVIDER_NOT_IMPLEMENTED');
 registry.register({provider:'google-drive',async inspectFile(_ctx,ref){return {bron:ref,bestand:{naam:'report.pdf',mimeType:'application/pdf',grootte:101,isMap:false,revisie:'v1'},acties:alleGeblokkeerd('MOCK_FOR_TEST'),checkedAt:new Date().toISOString(),freshness:'live' as const};}});
 assert.equal(registry.implemented('google-drive'),true);
 await assert.rejects(()=>registry.inspect(ctx,{...source,ruimte:'technisch'}),(e:unknown)=>e instanceof CloudAdapterNietBeschikbaar&&e.code==='CLOUD_SPACE_MISMATCH');
 const result=await registry.inspect(ctx,source);assert.equal(result.bestand.naam,'report.pdf');
 assert.throws(()=>registry.register({provider:'google-drive',async inspectFile(){throw Error('unreachable')}}));
});

test('Google file renaming requires explicit canRename, not broad canEdit alone',()=>{
 const c=googleBestandMogelijkheden({capabilities:{canEdit:true,canRename:false}});
 assert.equal(c.rename.enabled,false);
});
