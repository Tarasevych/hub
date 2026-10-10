// Iconen voor de sessiepagina: browser, besturingssysteem, soort toestel, vlag. Alles lokaal (geen CDN, geen netwerk naar derden):
// merklogo's als gevendorde SVG-paden (merk-iconen.ts, simple-icons CC0), vlaggen uit country-flag-icons (MIT) per land als eigen
// klein bestand dat pas geladen wordt als dat land voorkomt, en voor de rest lucide-react. Iconen zijn decoratief naast tekst
// (aria-hidden); waar een icoon alleen staat, krijgt het een tekstalternatief.
import {Globe,Monitor,Smartphone,Tablet,HelpCircle} from 'lucide-react';
import {useEffect,useState} from 'react';
import {MERK} from './merk-iconen';
import {landCode} from './groeperen';

const Pad=({pad,kleur,titel,klein}:{pad:string;kleur:string;titel?:string;klein?:boolean})=><svg viewBox='0 0 24 24' className={klein?'sessie-icoon klein':'sessie-icoon'} role={titel?'img':undefined} aria-hidden={titel?undefined:true} aria-label={titel}><path d={pad} fill={kleur}/></svg>;
// Eigen, generieke glyphs (geen merkbestanden): vier vlakken voor Windows, een golf voor Edge.
const WINDOWS='M3 4.5 10.5 3.5v8H3zM11.5 3.4 21 2v9.5h-9.5zM3 12.5h7.5v8L3 19.5zM11.5 12.5H21V22l-9.5-1.4z';
const EDGE='M12 2a10 10 0 0 0-9.9 8.6C3.4 7.4 6.6 5.5 10.2 5.5c4.3 0 7.4 2.7 7.4 6 0 2-1.6 3.4-3.6 3.4-1.6 0-2.6-.7-2.6-.7.3 2.4 2.6 4.3 5.8 4.3 1.6 0 3-.4 4.1-1.1A10 10 0 0 0 12 2Zm-2 6.6c-4 0-7.6 2.9-7.9 6.5A10 10 0 0 0 12 22c-3 0-5.6-2.6-5.6-6 0-3.1 2.2-5.8 5.3-6.6-.5-.5-1-.8-1.7-.8Z';

export const browserMerk=(b:string)=>{const v=b.toLowerCase();if(v.includes('edge'))return 'edge';if(v.includes('firefox'))return 'firefox';if(v.includes('opera'))return 'opera';if(v.includes('brave'))return 'brave';if(v.includes('vivaldi'))return 'vivaldi';if(v.includes('samsung'))return 'samsung';if(v.includes('duckduckgo'))return 'duckduckgo';if(v.includes('safari'))return 'safari';if(v.includes('chrom'))return 'chrome';return ''};
export const osMerk=(o:string)=>{const v=o.toLowerCase();if(v.startsWith('windows'))return 'windows';if(v==='macos'||v.includes('mac'))return 'apple';if(v==='ios'||v.includes('ipad'))return 'apple';if(v.includes('android'))return 'android';if(v.includes('ubuntu'))return 'ubuntu';if(v.includes('linux')||v.includes('chrome os')||v.includes('chromeos'))return 'linux';return ''};

export function BrowserIcoon({browser,titel,klein}:{browser:string;titel?:string;klein?:boolean}){const m=browserMerk(browser);if(m==='edge')return <Pad pad={EDGE} kleur='#0c8ce9' titel={titel} klein={klein}/>;const i=MERK[m];return i?<Pad pad={i.pad} kleur={i.kleur} titel={titel} klein={klein}/>:<Globe className={klein?'sessie-icoon klein':'sessie-icoon'} aria-hidden/>}
/** OS-logo; Apple/Ubuntu/Linux hebben een (bijna) zwart merk — dat volgt de tekstkleur, zodat het in het donker zichtbaar blijft. */
export function OsIcoon({os,titel,klein}:{os:string;titel?:string;klein?:boolean}){const m=osMerk(os);if(m==='windows')return <Pad pad={WINDOWS} kleur='#0078d4' titel={titel} klein={klein}/>;const i=MERK[m];if(!i)return <HelpCircle className={klein?'sessie-icoon klein':'sessie-icoon'} aria-hidden/>;const donker=/^#(000000|222222)$/i.test(i.kleur)||m==='linux';return <Pad pad={i.pad} kleur={donker?'currentColor':i.kleur} titel={titel} klein={klein}/>}
export function SoortIcoon({soort}:{soort:string}){const v=soort.toLowerCase();return v==='mobile'?<Smartphone aria-hidden/>:v==='tablet'?<Tablet aria-hidden/>:<Monitor aria-hidden/>}
export function GoogleIcoon(){const i=MERK.google;return <Pad pad={i.pad} kleur={i.kleur} klein/>}

// Vlaggen: elk land is een apart klein module (± 0,5 kB); Vite maakt er losse stukjes van die pas bij gebruik laden.
const VLAGGEN=import.meta.glob<string>('/node_modules/country-flag-icons/string/3x2/*.js',{import:'default'});
const vlagCache=new Map<string,string>();
export function Vlag({land,naam}:{land?:string;naam:string}){
  const cc=landCode(land);const[svg,setSvg]=useState(()=>vlagCache.get(cc)||'');
  useEffect(()=>{if(!cc||vlagCache.has(cc)){setSvg(vlagCache.get(cc)||'');return}const laad=VLAGGEN[`/node_modules/country-flag-icons/string/3x2/${cc}.js`];if(!laad)return;let weg=false;void laad().then(s=>{vlagCache.set(cc,s);if(!weg)setSvg(s)}).catch(()=>undefined);return()=>{weg=true}},[cc]);
  if(!cc)return null;
  // als <img> met data-URL: geen innerHTML, en past binnen CSP img-src 'self' data:
  return svg?<img className='sessie-vlag' src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={naam} width={21} height={14}/>:<span className='sessie-vlag sessie-vlag-tekst' role='img' aria-label={naam}>{cc}</span>;
}
