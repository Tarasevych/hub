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

/** true voor niet-publieke adressen (loopback, privé, link-local, CGNAT, multicast, ULA, …). */
export const privateAddress=(value:string):boolean=>{
  const lower=value.toLowerCase();
  if(isIP(value)===4){
    const[a,b]=value.split('.').map(Number);
    return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19))||a>=224;
  }
  if(isIP(value)===6){
    if(lower==='::'||lower==='::1'||lower.startsWith('fc')||lower.startsWith('fd')||/^fe[89ab]/.test(lower)||lower.startsWith('ff')||lower.startsWith('64:ff9b:')||lower.startsWith('2001:db8'))return true;
    const mapped=lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return Boolean(mapped&&privateAddress(mapped[1]));
  }
  return true;
};

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
    if(isIP(literal)&&privateAddress(literal))return reject(new Error('SSRF_ADRES_GEWEIGERD'));
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
