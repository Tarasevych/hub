import{decode}from'html-entities';import{TextDecoder}from'node:util';import{knipTekst}from'../server/platform/json-veilig';const raw=(value:unknown)=>String(value||'').replace(/\u0000/g,''),text=(value:unknown)=>raw(value).replace(/\r\n/g,'\n'),charsetOf=(value:string)=>{const match=/charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i.exec(value);return String(match?.[1]||match?.[2]||match?.[3]||'').trim().toLowerCase()};
// SEC-002 (post-01 / keten-config-02, 12.11.2026) — alles in dit bestand is LINEAIR in de lengte van de invoer. De inhoud van een brief
// bepaalt de afzender; deze functies draaien in de hoofdthread van de server (synchronisatie, openen, zoeken), dus één kwadratische
// stap op een brief van een paar MB hield de hele site minuten tot uren vast.
/** Hoogstens zoveel tekens HTML per brief gaan door de tekstomzetting (gelijk aan de grens van normalizeMailRawHtml). */
export const MAIL_HTML_TEKST_MAX=1500000;
// Unicode-normalisatie (NFC) sorteert een aaneengesloten reeks combinerende tekens; ICU doet dat kwadratisch (100 000 accenten ≈ 4 s,
// 1 miljoen ≈ minuten). Geen echte tekst heeft meer dan een handvol accenten per letter (UAX #15 «stream-safe»: hoogstens 30), dus een
// reeks wordt op 32 afgekapt. De uitdrukking zelf is lineair: een reeks van k tekens kost hoogstens 32·k stappen.
const COMBINATIE_REEKS=/(\p{M}{32})\p{M}+/gu,begrensCombinatie=(value:string)=>value.replace(COMBINATIE_REEKS,'$1');
/**
 * Weergavetekst: entiteiten gedecodeerd, NFC, zonder witruimte aan de randen, hoogstens `max` tekens (nooit een halve emoji).
 * De invoer wordt vóór het decoderen begrensd op 10× `max` (een entiteit is hoogstens ~10 tekens per zichtbaar teken) en vóór NFC op
 * 4× `max`: het resultaat van gewone tekst blijft hetzelfde, het werk blijft begrensd.
 */
export const normalizeMailDisplayText=(value:unknown,max=200000)=>{const volledig=text(value).trimStart(),grens=max*10+1024,bron=volledig.length>grens?volledig.slice(0,grens).replace(/&[#a-zA-Z0-9]{0,40}$/,''):volledig;return knipTekst(begrensCombinatie(decode(bron,{level:'html5',scope:'body'}).trimStart().slice(0,max*4+64)).normalize('NFC').trim(),max)};
export const normalizeMailRawHtml=(value:unknown,max=1500000)=>raw(value).slice(0,max);
/**
 * Verwijdert elk blok <naam … </naam> (script, style), zoals vroeger `/<naam[\s\S]*?<\/naam>/gi` — maar lineair. De oude uitdrukking
 * zocht bij ELKE «<naam» opnieuw tot het einde van de tekst als er geen sluiting kwam (kwadratisch). Hier: ontbreekt de sluiting één
 * keer, dan ontbreekt ze ook voor elk later begin, en zijn we klaar. Het resultaat is teken voor teken gelijk aan dat van de oude.
 */
export const zonderHtmlBlok=(value:string,naam:'script'|'style',vervanging=' ')=>{const open=new RegExp(`<${naam}`,'gi'),sluit=new RegExp(`</${naam}>`,'gi'),delen:string[]=[];let positie=0;for(;;){open.lastIndex=positie;const begin=open.exec(value);if(!begin)break;sluit.lastIndex=begin.index+begin[0].length;const eind=sluit.exec(value);if(!eind)break;delen.push(value.slice(positie,begin.index),vervanging);positie=eind.index+eind[0].length}if(!positie)return value;delen.push(value.slice(positie));return delen.join('')};
/**
 * Verwijdert tags, zoals vroeger `/<[^>]+>/g` — maar lineair (de oude uitdrukking liep bij elke «<» zonder «>» tot het einde).
 * Zelfde regels: een tag is «<», minstens één teken dat geen «>» is, en dan «>»; «<>» is geen tag; komt er geen «>» meer, dan
 * blijft de rest tekst.
 */
export const zonderHtmlTags=(value:string,vervanging=' ')=>{const delen:string[]=[];let positie=0,zoek=0;for(;;){const begin=value.indexOf('<',zoek);if(begin<0)break;const eind=value.indexOf('>',begin+1);if(eind<0)break;if(eind===begin+1){zoek=begin+1;continue}delen.push(value.slice(positie,begin),vervanging);positie=zoek=eind+1}if(!positie)return value;delen.push(value.slice(positie));return delen.join('')};
/** HTML van een brief → tekst met regeleinden: script/style weg, <br> en </p> worden een regeleinde, overige tags een spatie. Lineair. */
export const mailHtmlNaarRuweTekst=(value:string)=>zonderHtmlTags(zonderHtmlBlok(zonderHtmlBlok(value,'script'),'style').replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n'));
export const decodeMailPartText=(data:string,contentType='')=>{let bytes:Buffer;try{bytes=Buffer.from(String(data||''),'base64url')}catch{return''}if(!bytes.length)return'';const charset=charsetOf(contentType)||'utf-8';try{return new TextDecoder(charset,{fatal:false}).decode(bytes)}catch{return new TextDecoder('utf-8',{fatal:false}).decode(bytes)}};
