import type { RendererManifest, FileFamily, Operation } from './contracts.js';
const make=(id:string,displayName:string,families:FileFamily[],priority:number,operations:Operation[]=['preview','download'],status:'supported'|'partial'='supported'):RendererManifest=>({id,displayName,version:'1.0.0',families,priority,operations,trust:'audited-package',enabled:true,status});
/** Engine manifests, NOT implementations. Wire real packages only after source audit, license review and sandbox tests. */
export const proposedEngines: RendererManifest[]=[
  make('builtin-pdf','PDF.js · PDF', ['pdf'],10,['preview','print','download']),
  make('builtin-media','Browser Media · зображення/аудіо/відео',['image','audio','video'],20),
  make('docx-preview','docx-preview · документи Word',['word'],30),
  make('sheetjs','SheetJS CE · Excel/CSV',['spreadsheet'],40),
  make('office-slides','PowerPoint / ODP · сторінковий перегляд',['presentation'],50, ['preview','download'],'partial'),
  make('zipjs','zip.js · ZIP/ASiC',['archive'],60),
  make('signature-inspector','CMS/PKCS7 · підписи',['signature'],65,['preview','verify-signature'],'partial'),
  make('calendar-contact','ICS + VCF',['calendar','contact'],70),
  make('monaco','Monaco/Shiki · код',['text','code'],80),
  make('email-view','EML/MIME · повідомлення',['email'],90),
  make('generic-safe','Metadata-only · невідомий формат',['binary','font'],999,['download'])
];

/** Actually implemented offline safe renderers. These are NOT dependent on optional packages. */
export const implementedSafeEngines:RendererManifest[]=[
  {id:'safe-text',version:'0.2.0',displayName:'Text-only · no HTML execution',families:['text','code','calendar','contact','email'],priority:10,operations:['preview','download'],trust:'browser-native',maxPreviewBytes:1024*1024,enabled:true,status:'supported'},
  {id:'safe-native-media',version:'0.2.0',displayName:'Browser-native PDF & static media',families:['pdf','image','audio','video'],priority:15,operations:['preview','download'],trust:'browser-native',maxPreviewBytes:8*1024*1024,enabled:true,status:'supported'}
];
