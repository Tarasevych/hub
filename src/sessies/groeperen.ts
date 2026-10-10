// Sessies groeperen per FYSIEK apparaat (Sessies-redesign, punt 6). Puur en testbaar; geen netwerk.
//
// Sleutel: dezelfde User-Agent + hetzelfde netwerk (IPv4-adres, of het IPv6-/64-prefix — dat blijft gelijk voor één aansluiting,
// terwijl het einde van een IPv6-adres vaak wisselt). Daarna worden een IPv4- en een IPv6-groep met DEZELFDE User-Agent en
// dezelfde (ongeveer) plaats samengevoegd als ze binnen 15 minuten van elkaar actief waren: dat is dan één toestel met dual-stack,
// zodat IPv4 én IPv6 samen bij één apparaat staan. Bewust voorzichtig: bij twijfel blijven het twee kaarten (liever één te veel
// dan een vreemd toestel verstopt onder het eigen).
import type {SecuritySession} from '../SecuritySessionsPanel';

export type IpFamilie='v4'|'v6'|'onbekend';
export type Apparaat={
  sleutel:string;
  sessies:SecuritySession[];
  huidig:boolean;
  browser:string;browserVersie:string;os:string;osVersie:string;soort:string;userAgent:string;
  ipv4:string[];ipv6:string[];
  plaats:{city?:string;region?:string;country?:string}|undefined;
  methoden:string[];
  diensten:string[];
  eerst:number;laatst:number;
};

export const ipFamilie=(ip:string):IpFamilie=>{const v=String(ip||'').trim();if(!v||v==='unknown')return 'onbekend';if(v.includes(':'))return /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(v)?'v4':'v6';return /^\d{1,3}(\.\d{1,3}){3}$/.test(v)?'v4':'onbekend'};
/** IPv4-mapped IPv6 (::ffff:1.2.3.4) is gewoon IPv4. */
export const normaalIp=(ip:string)=>{const v=String(ip||'').trim();const m=/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(v);return m?m[1]:v};

/** Volledig uitgeschreven IPv6 (8 groepen) of null. */
export const ipv6Groepen=(ip:string):string[]|null=>{const v=String(ip||'').split('%')[0].toLowerCase();if(!v.includes(':'))return null;const[kop,staart]=v.split('::');if(v.split('::').length>2)return null;const a=kop?kop.split(':'):[],b=staart!==undefined&&staart?staart.split(':'):[];if(staart===undefined){return a.length===8?a.map(g=>g||'0'):null}const nul=8-a.length-b.length;if(nul<1)return null;return[...a,...Array(nul).fill('0'),...b]};
export const netwerk=(ip:string)=>{const v=normaalIp(ip);const f=ipFamilie(v);if(f==='v6'){const g=ipv6Groepen(v);return g?`v6:${g.slice(0,4).map(x=>x.replace(/^0+(?=.)/,'')).join(':')}::/64`:`v6:${v}`}return `${f}:${v}`};

const plaatsSleutel=(s:SecuritySession)=>[s.approximateLocation?.country||'',s.approximateLocation?.city||''].join('|').toLowerCase();
const VENSTER=15*60*1000;

export function groepeerPerApparaat(sessies:SecuritySession[]):Apparaat[]{
  const map=new Map<string,SecuritySession[]>();
  for(const s of sessies){const k=`${s.userAgent||'?'}#${netwerk(s.ip)}`;const l=map.get(k);if(l)l.push(s);else map.set(k,[s]);}
  // dual-stack samenvoegen: één v4-groep en één v6-groep met dezelfde UA en plaats, binnen 15 min actief
  const groepen=[...map.entries()].map(([sleutel,l])=>({sleutel,l,fam:ipFamilie(normaalIp(l[0].ip)),ua:l[0].userAgent||'?',plaats:plaatsSleutel(l[0]),laatst:Math.max(...l.map(s=>s.lastSeenAt||0))}));
  const weg=new Set<string>();
  for(const a of groepen){if(a.fam!=='v4'||weg.has(a.sleutel))continue;
    const kandidaten=groepen.filter(b=>b.fam==='v6'&&!weg.has(b.sleutel)&&b.ua===a.ua&&b.plaats===a.plaats&&Math.abs(b.laatst-a.laatst)<=VENSTER);
    if(kandidaten.length===1){const b=kandidaten[0];b.l.push(...a.l);weg.add(a.sleutel);}}
  const uit=groepen.filter(g=>!weg.has(g.sleutel)).map(({sleutel,l}):Apparaat=>{
    const s=[...l].sort((x,y)=>Number(y.current)-Number(x.current)||(y.lastSeenAt||0)-(x.lastSeenAt||0));const eerste=s[0];
    const ips=[...new Set(s.map(x=>normaalIp(x.ip)).filter(Boolean))];
    return{sleutel,sessies:s,huidig:s.some(x=>x.current),browser:eerste.browser||'',browserVersie:eerste.browserVersion||'',os:eerste.os||'',osVersie:eerste.osVersion||'',soort:eerste.deviceType||'',userAgent:eerste.userAgent||'',
      ipv4:ips.filter(i=>ipFamilie(i)==='v4'),ipv6:ips.filter(i=>ipFamilie(i)==='v6'),
      plaats:s.find(x=>x.approximateLocation&&(x.approximateLocation.city||x.approximateLocation.country))?.approximateLocation,
      methoden:[...new Set(s.filter(x=>x.kind!=='tab').map(x=>x.authMethod||'google'))],
      diensten:[...new Set(s.map(x=>x.service).filter(Boolean))],
      eerst:Math.min(...s.map(x=>x.createdAt||Infinity)),laatst:Math.max(...s.map(x=>x.lastSeenAt||0))};});
  // dit apparaat eerst, dan meest recent actief
  return uit.sort((a,b)=>Number(b.huidig)-Number(a.huidig)||b.laatst-a.laatst);
}

/** Sessies die «Завершити всі сесії на цьому пристрої» intrekt: alles van de groep behalve de sessie waarin u nu zit
 *  (die beëindigt u apart met «Вийти» — anders sluit u uzelf buiten midden in de actie). */
export const intrekbaarOpApparaat=(a:Apparaat)=>a.sessies.filter(s=>!s.current);

/** Landcode → ISO-3166 alpha-2 hoofdletters, of '' (Cloudflare geeft «XX»/«T1» voor onbekend/Tor). */
export const landCode=(c?:string)=>{const v=String(c||'').trim().toUpperCase();return /^[A-Z]{2}$/.test(v)&&v!=='XX'&&v!=='T1'?v:''};
