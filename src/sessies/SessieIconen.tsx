// Iconen voor de sessiepagina: browser, besturingssysteem, soort toestel, vlag. Alles lokaal (geen CDN, geen netwerk naar
// derden). De merklogo's komen uit het ENE merkregister van de site (src/merk/) — eerder stond hier een eigen kopie van
// dertien simple-icons-paden (src/sessies/merk-iconen.ts, ±30 kB) die Chrome, Safari, Apple, Google en Linux óók nog eens
// tekende naast src/mcp-ui.tsx. Vlaggen komen uit country-flag-icons (MIT), per land een eigen klein bestand dat pas geladen
// wordt als dat land voorkomt; voor de rest lucide-react. Iconen zijn decoratief naast tekst (aria-hidden); waar een icoon
// alleen staat, krijgt het een tekstalternatief.
import {Globe,Monitor,Smartphone,Tablet,HelpCircle} from 'lucide-react';
import {useEffect,useState} from 'react';
import Merk from '../merk/Merk';
import {laadMerken} from '../merk/merk-register';
import {landCode} from './groeperen';

void laadMerken();

const klas=(klein?:boolean)=>klein?'sessie-icoon klein':'sessie-icoon';
const Teken=({merk,titel,klein,terugval}:{merk:string;titel?:string;klein?:boolean;terugval:React.ReactNode})=>
  <Merk merk={merk} vorm='gliefje' titel={titel} className={klas(klein)} terugval={terugval}/>;

export const browserMerk=(b:string)=>{const v=b.toLowerCase();if(v.includes('edge'))return 'edge';if(v.includes('firefox'))return 'firefox';if(v.includes('opera'))return 'opera';if(v.includes('brave'))return 'brave';if(v.includes('vivaldi'))return 'vivaldi';if(v.includes('samsung'))return 'samsung';if(v.includes('duckduckgo'))return 'duckduckgo';if(v.includes('safari'))return 'safari';if(v.includes('chrom'))return 'chrome';return ''};
export const osMerk=(o:string)=>{const v=o.toLowerCase();if(v.startsWith('windows'))return 'windows';if(v==='macos'||v.includes('mac'))return 'apple';if(v==='ios'||v.includes('ipad'))return 'apple';if(v.includes('android'))return 'android';if(v.includes('ubuntu'))return 'ubuntu';if(v.includes('linux')||v.includes('chrome os')||v.includes('chromeos'))return 'linux';return ''};

export function BrowserIcoon({browser,titel,klein}:{browser:string;titel?:string;klein?:boolean}){
  const m=browserMerk(browser);
  const leeg=<Globe className={klas(klein)} aria-hidden/>;
  return m?<Teken merk={m} titel={titel} klein={klein} terugval={leeg}/>:leeg;
}
/** OS-logo; Apple en Linux hebben een (bijna) zwart merk — dat volgt de tekstkleur (volgtTekst in het register), zodat het in het donker zichtbaar blijft. */
export function OsIcoon({os,titel,klein}:{os:string;titel?:string;klein?:boolean}){
  const m=osMerk(os);
  const leeg=<HelpCircle className={klas(klein)} aria-hidden/>;
  return m?<Teken merk={m} titel={titel} klein={klein} terugval={leeg}/>:leeg;
}
export function SoortIcoon({soort}:{soort:string}){const v=soort.toLowerCase();return v==='mobile'?<Smartphone aria-hidden/>:v==='tablet'?<Tablet aria-hidden/>:<Monitor aria-hidden/>}
export function GoogleIcoon(){return <Merk merk='google' vorm='gliefje' className='sessie-icoon klein' terugval={<Globe className='sessie-icoon klein' aria-hidden/>}/>}

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
