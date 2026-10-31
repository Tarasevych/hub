// SSRF-bescherming met DNS-pinning voor uitgaande verzoeken naar door gebruikers/mails aangeleverde URL's
// (externe afbeeldingen in de mailreader, one-click-unsubscribe).
//
// Probleem van de oude code: eerst `dns.lookup()` controleren en daarna `fetch()` laten resolven.
// Tussen die twee kan het DNS-antwoord wijzigen (DNS-rebinding), waardoor de fetch toch een intern adres
// (127.0.0.1, 10.x, 169.254.169.254, …) bereikt. Hier gebeurt resolutie en controle in de `lookup`-hook van
// de socket zelf: het adres dat gecontroleerd wordt, is exact het adres waarmee verbonden wordt.
import https from 'node:https';
import {lookup as dnsLookup,type LookupAddress} from 'node:dns';
import {isIP} from 'node:net';
import {adresSoort,ipv6Groepen} from '../shared/extern-bureaublad';

/**
 * true voor niet-publieke adressen (loopback, privé, link-local, CGNAT, multicast, ULA,
 * plus alle IPv4-in-IPv6-schrijfwijzen zoals ::ffff:7f00:1, ::7f00:1, 0:0:0:0:0:0:0:1, 6to4, NAT64, Teredo).
 */
export const privateAddress=(value:string):boolean=>adresSoort(value)!=='publiek';
const isIpLiteral=(value:string):boolean=>isIP(value)!==0||ipv6Groepen(value)!==null;

type LookupCallback=(err:NodeJS.ErrnoException|null,address:string|LookupAddress[],family?:number)=>void;
/** lookup-hook: resolveert, weigert als ÉÉN adres niet publiek is, en geeft alleen gecontroleerde adressen terug. */
export const pinnedLookup=(hostname:string,options:{all?:boolean}|number|undefined,callback:LookupCallback)=>{
  const wantAll=typeof options==='object'&&options!==null&&Boolean(options.all);
  dnsLookup(hostname,{all:true,verbatim:true},(err,addresses)=>{
    if(err)return callback(err,'');
    if(!addresses.length||addresses.some(item=>privateAddress(item.address))){
      const unsafe=Object.assign(new Error('SSRF_ADRES_GEWEIGERD'),{code:'EUNSAFEADDR'});
      return callback(unsafe,'');
    }
    if(wantAll)return callback(null,addresses);
    return callback(null,addresses[0].address,addresses[0].family);
  });
};

/**
 * HTTPS-verzoek met DNS-pinning, zonder automatische redirects, met time-out en maximale grootte.
 * Geeft een WHATWG-Response terug (body gebufferd), zodat bestaande aanroepers ongewijzigd blijven.
 */
export function pinnedFetch(url:string,init:{method?:string;headers?:Record<string,string>;body?:string}={},timeoutMs=15000,maxBytes=8*1024*1024,tooLargeCode='REMOTE_RESPONSE_TOO_LARGE'):Promise<Response>{
  return new Promise((resolve,reject)=>{
    let target:URL;
    try{target=new URL(url)}catch{return reject(new Error('REMOTE_URL_INVALID'))}
    if(target.protocol!=='https:')return reject(new Error('REMOTE_URL_INVALID'));
    // IP-literals passeren de lookup-hook niet: hier expliciet controleren.
    const literal=target.hostname.replace(/^\[|\]$/g,'');
    if(isIpLiteral(literal)&&privateAddress(literal))return reject(new Error('SSRF_ADRES_GEWEIGERD'));
    const req=https.request(target,{method:init.method||'GET',headers:{'User-Agent':'mijn-ruimte/1',...(init.headers||{})},lookup:pinnedLookup as never,timeout:timeoutMs},res=>{
      const declared=Number(res.headers['content-length']||0);
      if(declared>maxBytes){res.destroy();return reject(new Error(tooLargeCode))}
      const chunks:Buffer[]=[];let total=0;
      res.on('data',(chunk:Buffer)=>{total+=chunk.length;if(total>maxBytes){res.destroy();reject(new Error(tooLargeCode));return}chunks.push(chunk)});
      res.on('error',reject);
      res.on('end',()=>{
        const headers=new Headers();
        for(const[key,value]of Object.entries(res.headers)){if(value===undefined)continue;for(const item of Array.isArray(value)?value:[value])headers.append(key,String(item))}
        const status=res.statusCode||502;
        const nullBody=status===204||status===205||status===304;
        resolve(new Response(nullBody?null:Buffer.concat(chunks),{status,headers}));
      });
    });
    const timer=setTimeout(()=>req.destroy(new Error('REMOTE_TIMEOUT')),timeoutMs);
    req.on('close',()=>clearTimeout(timer));
    req.on('timeout',()=>req.destroy(new Error('REMOTE_TIMEOUT')));
    req.on('error',err=>reject((err as NodeJS.ErrnoException).code==='EUNSAFEADDR'?new Error('SSRF_ADRES_GEWEIGERD'):err));
    if(init.body)req.write(init.body);
    req.end();
  });
}

/**
 * Zelfde bescherming als `pinnedFetch` (alleen https, DNS-pinning, geen omleidingen, time-out, maximum aan bytes),
 * maar STROMEND: elk stuk gaat meteen naar `onChunk`. Nodig voor Server-Sent Events, waar het antwoord pas
 * compleet is als de server de stroom sluit — bij het oude MCP-vervoer (HTTP+SSE) blijft die stroom zelfs open
 * terwijl wij er POST-verzoeken naast sturen. `pinnedFetch` buffert en zou daar eeuwig wachten.
 *
 *  • `onKop`    status en koppen, zodra ze binnen zijn (de aanroeper beslist dan of hij verder wil lezen).
 *  • `onChunk`  tekst; `true` teruggeven stopt de stroom netjes (gestopt: true in de uitslag).
 *  • `onStart`  krijgt een functie waarmee de aanroeper de stroom van buitenaf kan afbreken (sessie sluiten).
 *  • `stilteMs` zonder één byte wordt de stroom afgebroken (REMOTE_TIMEOUT); `maxTotaalMs` is de harde bovengrens.
 */
export function pinnedStream(url:string,opties:{
  method?:string;headers?:Record<string,string>;body?:string;
  stilteMs?:number;maxTotaalMs?:number;maxBytes?:number;tooLargeCode?:string;
  onKop?:(status:number,headers:Headers)=>void;onChunk?:(tekst:string)=>boolean|void;onStart?:(stop:()=>void)=>void;
}={}):Promise<{status:number;headers:Headers;bytes:number;gestopt:boolean}>{
  const stilteMs=opties.stilteMs??20000,maxTotaalMs=opties.maxTotaalMs??60000,maxBytes=opties.maxBytes??1024*1024;
  const tooLargeCode=opties.tooLargeCode||'REMOTE_RESPONSE_TOO_LARGE';
  return new Promise((resolve,reject)=>{
    let target:URL;
    try{target=new URL(url)}catch{return reject(new Error('REMOTE_URL_INVALID'))}
    if(target.protocol!=='https:')return reject(new Error('REMOTE_URL_INVALID'));
    const literal=target.hostname.replace(/^\[|\]$/g,'');
    if(isIpLiteral(literal)&&privateAddress(literal))return reject(new Error('SSRF_ADRES_GEWEIGERD'));
    let gestopt=false,klaar=false,bytes=0;
    let stilte:NodeJS.Timeout|undefined;
    const req=https.request(target,{method:opties.method||'GET',headers:{'User-Agent':'mijn-ruimte/1',...(opties.headers||{})},lookup:pinnedLookup as never,timeout:stilteMs},res=>{
      const headers=new Headers();
      for(const[key,value]of Object.entries(res.headers)){if(value===undefined)continue;for(const item of Array.isArray(value)?value:[value])headers.append(key,String(item))}
      const status=res.statusCode||502;
      try{opties.onKop?.(status,headers)}catch{/* de aanroeper faalt niet onze stroom */}
      const af=(reden?:Error)=>{
        if(klaar)return;klaar=true;
        if(stilte)clearTimeout(stilte);clearTimeout(hard);
        res.destroy();req.destroy();
        if(reden)reject(reden);else resolve({status,headers,bytes,gestopt});
      };
      const raak=()=>{if(stilte)clearTimeout(stilte);stilte=setTimeout(()=>af(new Error('REMOTE_TIMEOUT')),stilteMs)};
      raak();
      res.setEncoding('utf8');
      res.on('data',(stuk:string)=>{
        if(klaar)return;
        bytes+=Buffer.byteLength(stuk,'utf8');
        if(bytes>maxBytes)return af(new Error(tooLargeCode));
        raak();
        let stop:boolean|void=false;
        try{stop=opties.onChunk?.(stuk)}catch{stop=true}
        if(stop===true){gestopt=true;af()}
      });
      res.on('error',err=>af(err as Error));
      res.on('end',()=>af());
      res.on('close',()=>af());
      opties.onStart?.(()=>{gestopt=true;af()});
    });
    const hard=setTimeout(()=>{if(!klaar){klaar=true;req.destroy();reject(new Error('REMOTE_TIMEOUT'))}},maxTotaalMs);
    req.on('timeout',()=>req.destroy(new Error('REMOTE_TIMEOUT')));
    req.on('error',err=>{if(klaar)return;klaar=true;if(stilte)clearTimeout(stilte);clearTimeout(hard);
      reject((err as NodeJS.ErrnoException).code==='EUNSAFEADDR'?new Error('SSRF_ADRES_GEWEIGERD'):err)});
    if(opties.body)req.write(opties.body);
    req.end();
  });
}
