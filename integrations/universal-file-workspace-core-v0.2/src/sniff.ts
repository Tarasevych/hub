import type { FileFamily, FileSignature } from './contracts.js';
const known: Readonly<Record<string, [FileFamily, string, boolean]>> = {
  pdf:['pdf','application/pdf',false], doc:['word','application/msword',false],
  docx:['word','application/vnd.openxmlformats-officedocument.wordprocessingml.document',false],
  odt:['word','application/vnd.oasis.opendocument.text',false],
  xls:['spreadsheet','application/vnd.ms-excel',false],
  xlsx:['spreadsheet','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',false],
  ods:['spreadsheet','application/vnd.oasis.opendocument.spreadsheet',false],
  csv:['spreadsheet','text/csv',false],
  ppt:['presentation','application/vnd.ms-powerpoint',false],
  pptx:['presentation','application/vnd.openxmlformats-officedocument.presentationml.presentation',false],
  odp:['presentation','application/vnd.oasis.opendocument.presentation',false],
  png:['image','image/png',false],jpg:['image','image/jpeg',false],jpeg:['image','image/jpeg',false],gif:['image','image/gif',false],webp:['image','image/webp',false],bmp:['image','image/bmp',false],tif:['image','image/tiff',false],tiff:['image','image/tiff',false],svg:['image','image/svg+xml',true],
  zip:['archive','application/zip',false],asice:['archive','application/vnd.etsi.asic-e+zip',false],asics:['archive','application/vnd.etsi.asic-s+zip',false],rar:['archive','application/vnd.rar',false],'7z':['archive','application/x-7z-compressed',false],tar:['archive','application/x-tar',false],gz:['archive','application/gzip',false],
  p7s:['signature','application/pkcs7-signature',false],p7m:['signature','application/pkcs7-mime',false],
  ics:['calendar','text/calendar',false],vcf:['contact','text/vcard',false],
  mp3:['audio','audio/mpeg',false],wav:['audio','audio/wav',false],ogg:['audio','audio/ogg',false],flac:['audio','audio/flac',false],
  mp4:['video','video/mp4',false],webm:['video','video/webm',false],mov:['video','video/quicktime',false],
  txt:['text','text/plain',false],md:['text','text/markdown',false],json:['code','application/json',false],xml:['code','application/xml',false],yaml:['code','text/yaml',false],yml:['code','text/yaml',false],ts:['code','text/typescript',false],tsx:['code','text/typescript',false],js:['code','text/javascript',true],jsx:['code','text/javascript',true],html:['code','text/html',true],css:['code','text/css',false],sql:['code','application/sql',false],sh:['code','text/x-shellscript',true],py:['code','text/x-python',true],
  eml:['email','message/rfc822',false],msg:['email','application/vnd.ms-outlook',false],
  woff:['font','font/woff',false],woff2:['font','font/woff2',false],ttf:['font','font/ttf',false],otf:['font','font/otf',false],exe:['binary','application/octet-stream',true],dll:['binary','application/octet-stream',true],wasm:['binary','application/wasm',true]
};
function signature(family: FileFamily, mime: string, reason: FileSignature['reason'], executableRisk=false): FileSignature {
  return {family,mime,reason,confidence:reason==='magic'?'high':reason==='container'?'high':reason==='mime'?'medium':reason==='extension'?'low':'low',executableRisk};
}
const is=(bytes:Uint8Array, offsets:number[], hex:number[])=>offsets.every((v,i)=>bytes[v]===hex[i]);
const starts=(b:Uint8Array,...prefix:number[])=>b.length>=prefix.length && prefix.every((v,i)=>b[i]===v);
function matchesContainer(containerNames:readonly string[] | undefined): FileSignature | undefined {
  if (!containerNames) return;
  const paths = containerNames.map(x=>x.toLowerCase().replaceAll('\\','/'));
  if(paths.some(x=>x.startsWith('word/') && x.endsWith('.xml'))) return signature('word',known.docx[1],'container');
  if(paths.some(x=>x.startsWith('xl/') && x.endsWith('.xml'))) return signature('spreadsheet',known.xlsx[1],'container');
  if(paths.some(x=>x.startsWith('ppt/') && x.endsWith('.xml'))) return signature('presentation',known.pptx[1],'container');
  if(paths.some(x=>x.startsWith('meta-inf/') && x.includes('signature'))) return signature('archive','application/vnd.etsi.asic-e+zip','container');
  return;
}
/** Never dispatch active content by MIME header or extension alone; magic can override both. */
export function detectFile(name:string, declaredMime?:string, bytes=new Uint8Array(), containerNames?:readonly string[]): FileSignature {
  if(starts(bytes,0x25,0x50,0x44,0x46,0x2d)) return signature('pdf','application/pdf','magic');
  if(starts(bytes,0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)) return signature('image','image/png','magic');
  if(starts(bytes,0xff,0xd8,0xff)) return signature('image','image/jpeg','magic');
  if(starts(bytes,0x47,0x49,0x46,0x38)) return signature('image','image/gif','magic');
  if(bytes.length>=12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') return signature('image','image/webp','magic');
  if(starts(bytes,0x50,0x4b,0x03,0x04) || starts(bytes,0x50,0x4b,0x05,0x06) || starts(bytes,0x50,0x4b,0x07,0x08)) {
    return matchesContainer(containerNames) ?? signature('archive','application/zip','magic');
  }
  if(starts(bytes,0x37,0x7a,0xbc,0xaf,0x27,0x1c)) return signature('archive','application/x-7z-compressed','magic');
  if(starts(bytes,0x52,0x61,0x72,0x21,0x1a,0x07)) return signature('archive','application/vnd.rar','magic');
  if(starts(bytes,0x4d,0x5a)) return signature('binary','application/octet-stream','magic',true);
  if(starts(bytes,0x7f,0x45,0x4c,0x46)) return signature('binary','application/octet-stream','magic',true);
  if(starts(bytes,0x00,0x61,0x73,0x6d)) return signature('binary','application/wasm','magic',true);
  const container = matchesContainer(containerNames); if(container) return container;
  // For nonbinary formats fall back to declared MIME and extension as hints; no execution permitted.
  const ext = name.toLowerCase().split('.').at(-1) ?? '';
  const entry = known[ext];
  if(entry) return signature(entry[0],entry[1],'extension',entry[2]);
  const safeMime=(declaredMime||'').split(';')[0].trim().toLowerCase();
  if(safeMime.startsWith('image/')) return signature('image',safeMime,'mime',safeMime==='image/svg+xml');
  if(safeMime.startsWith('audio/')) return signature('audio',safeMime,'mime');
  if(safeMime.startsWith('video/')) return signature('video',safeMime,'mime');
  if(safeMime.startsWith('text/')) return signature('text',safeMime,'mime');
  return signature('binary','application/octet-stream','fallback',true);
}
