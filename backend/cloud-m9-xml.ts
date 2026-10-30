/** Bounded XML 1.0 subset for untrusted DAV/S3 metadata, not a generic XML reader.
 * No DTD, entities, CDATA, processing instructions other than initial XML header,
 * namespace remapping outside inherited declarations, or external resources.
 * Structural scanning, never regex-based document extraction.
 */
import {CloudTransportError} from './cloud-overdracht-adapters';
export type XmlNode={name:string;local:string;ns:string;text:string;children:XmlNode[]};
const fail=(code:string):never=>{throw new CloudTransportError(code,502);};
function entityDecode(value:string):string {
 let out='';for(let i=0;i<value.length;i++){
  if(value[i]!=='&'){out+=value[i];continue;}
  const end=value.indexOf(';',i+1);if(end<0||end-i>14)fail('CLOUD_M9_XML_ENTITY_INVALID');
  const raw=value.slice(i+1,end);let decoded:string;
  if(raw==='amp')decoded='&';else if(raw==='lt')decoded='<';else if(raw==='gt')decoded='>';
  else if(raw==='quot')decoded='"';else if(raw==='apos')decoded="'";
  else if(/^#(?:x[0-9A-Fa-f]+|[0-9]+)$/.test(raw)){
   const hex=raw.startsWith('#x');const num=parseInt(raw.slice(hex?2:1),hex?16:10);
   if(!Number.isSafeInteger(num)||num===0||num>0x10FFFF||num>=0xD800&&num<=0xDFFF||num<32&&num!==9&&num!==10&&num!==13)fail('CLOUD_M9_XML_ENTITY_INVALID');
   decoded=String.fromCodePoint(num);
  }else fail('CLOUD_M9_XML_ENTITY_INVALID');
  out+=decoded;i=end;
 }
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFE\uFFFF]/u.test(out))fail('CLOUD_M9_XML_CONTROL_CHAR');
 return out;
}
const isName=(value:string)=>/^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/.test(value);
/** Parses only bounded metadata responses. Namespace identity is resolved by xmlns declarations. */
export function parseCloudXml(xml:string):XmlNode {
 if(typeof xml!=='string'||Buffer.byteLength(xml,'utf8')>1_048_576||xml.length===0)fail('CLOUD_M9_XML_TOO_LARGE');
 if(xml.charCodeAt(0)===0xFEFF)xml=xml.slice(1);
 let i=0,root:XmlNode|null=null,count=0;
 const stack:Array<{node:XmlNode;ns:Record<string,string>;full:string}>=[];
 if(xml.startsWith('<?xml')){const end=xml.indexOf('?>');if(end<5||end>220)fail('CLOUD_M9_XML_HEADER_INVALID');i=end+2;}
 while(i<xml.length){
  if(xml[i]!=='<'){
   const next=xml.indexOf('<',i),end=next<0?xml.length:next;
   const part=entityDecode(xml.slice(i,end));
   if(stack.length){const current=stack[stack.length-1].node;current.text+=part;
    if(current.text.length>32768)fail('CLOUD_M9_XML_TEXT_LIMIT');
   }else if(part.trim())fail('CLOUD_M9_XML_TEXT_OUTSIDE_ROOT');
   i=end;continue;
  }
  if(xml.startsWith('<!',i)||xml.startsWith('<?',i))fail('CLOUD_M9_XML_DECLARATION_FORBIDDEN');
  if(xml.startsWith('</',i)){
   const end=xml.indexOf('>',i+2);if(end<0)fail('CLOUD_M9_XML_INVALID_CLOSE');
   const full=xml.slice(i+2,end).trim();if(!isName(full)||!stack.length||stack[stack.length-1].full!==full)fail('CLOUD_M9_XML_MISMATCHED_CLOSE');
   stack.pop();i=end+1;continue;
  }
  let end=i+1,quote='';
  while(end<xml.length){const c=xml[end];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;end++;}
  if(end===xml.length||end-i>8192||quote)fail('CLOUD_M9_XML_TAG_INVALID');
  let tag=xml.slice(i+1,end).trim(),self=false;
  if(tag.endsWith('/')){tag=tag.slice(0,-1).trimEnd();self=true;}
  const match=tag.match(/^([^\s]+)(?:\s|$)/);const full=match?.[1]||'';
  if(!isName(full))fail('CLOUD_M9_XML_NAME_INVALID');
  const ns={...(stack.at(-1)?.ns||{})};let pos=full.length;
  while(pos<tag.length){while(/\s/.test(tag[pos]||''))pos++;if(pos>=tag.length)break;
   const nameMatch=tag.slice(pos).match(/^([A-Za-z_][\w.:-]*)/);if(!nameMatch||!isName(nameMatch[1]))fail('CLOUD_M9_XML_ATTRIBUTE_INVALID');
   const attr=nameMatch[1];pos+=attr.length;while(/\s/.test(tag[pos]||''))pos++;
   if(tag[pos++]!=='=')fail('CLOUD_M9_XML_ATTRIBUTE_INVALID');while(/\s/.test(tag[pos]||''))pos++;
   const q=tag[pos++];if(q!=='"'&&q!=="'")fail('CLOUD_M9_XML_ATTRIBUTE_INVALID');
   const close=tag.indexOf(q,pos);if(close<0)fail('CLOUD_M9_XML_ATTRIBUTE_INVALID');
   const value=entityDecode(tag.slice(pos,close));pos=close+1;
   if(attr==='xmlns')ns['']=value;else if(attr.startsWith('xmlns:'))ns[attr.slice(6)]=value;
  }
  const parts=full.split(':');const prefix=parts.length===2?parts[0]:'';
  if(prefix&&!Object.prototype.hasOwnProperty.call(ns,prefix))fail('CLOUD_M9_XML_UNBOUND_PREFIX');
  const node:XmlNode={name:full,local:parts.at(-1)!,ns:ns[prefix]||'',text:'',children:[]};
  if(++count>3000||stack.length>=24)fail('CLOUD_M9_XML_COMPLEXITY');
  if(stack.length)stack.at(-1)!.node.children.push(node);else if(root)fail('CLOUD_M9_XML_MULTIPLE_ROOTS');else root=node;
  if(!self)stack.push({node,ns,full});i=end+1;
 }
 if(stack.length||!root)fail('CLOUD_M9_XML_UNCLOSED');
 return root;
}
export function children(node:XmlNode,local:string,ns?:string):XmlNode[]{return node.children.filter(x=>x.local===local&&(ns===undefined||x.ns===ns));}
export function childText(node:XmlNode,local:string,ns?:string):string{
 const found=children(node,local,ns);if(found.length>1)fail('CLOUD_M9_XML_DUPLICATE_FIELD');return found[0]?.text.trim()||'';
}
