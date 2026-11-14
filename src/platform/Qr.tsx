// IDENTITEIT-014: спільний QR-код у SVG (без innerHTML) — для кодів доступу гостям і для ключа застосунку-автентифікатора.
// QR завжди несе data-ai-verborgen: у ньому зазвичай секрет (otpauth://… або посилання з кодом), тож ШІ-розширення його
// не читає й не фотографує. Раніше жив лише в src/Toegangscodes.tsx.
// Gedeelde QR als SVG-paden (geen innerHTML), altijd verborgen voor de AI-extensie: er staat meestal een geheim in.
import {useMemo} from 'react';
import qrcode from 'qrcode-generator';
import {verborgenVoorAi} from '../menselijke-actie';

/** SVG-pad van de modules met een stille zone van 4 modules; n = zijde inclusief marge. */
export function qrPad(tekst:string):{d:string;n:number}{
  const q=qrcode(0,'M');q.addData(tekst);q.make();
  const n=q.getModuleCount();let d='';
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))d+=`M${c+4} ${r+4}h1v1h-1z`;
  return{d,n:n+8};
}

export function Qr({tekst,label,className='toegangscode-qr'}:{tekst:string;label:string;className?:string}){
  const pad=useMemo(()=>qrPad(tekst),[tekst]);
  return <svg className={className} viewBox={`0 0 ${pad.n} ${pad.n}`} role='img' aria-label={label} shapeRendering='crispEdges' {...verborgenVoorAi}><rect width={pad.n} height={pad.n} fill='#fff'/><path d={pad.d} fill='#000'/></svg>;
}
