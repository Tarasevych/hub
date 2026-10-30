// De korte accountsleutel 'u-xxxxxxxx' (FNV-1a van het account-id) — zonder afhankelijkheden, zodat ook modules die niet aan de
// canonieke runtime mogen hangen (src/mail-bijlage-cache.ts → lokale concepten wissen bij afmelden) dezelfde sleutel rekenen als
// de weergave (src/domein-weergave-cache.ts, src/weergave-uiterlijk.ts) en de concepten (src/mail-concept-lokaal.ts → conceptScope).
export const accountHash=(value:string)=>{let current=2166136261;for(let index=0;index<value.length;index++){current^=value.charCodeAt(index);current=Math.imul(current,16777619)}return(current>>>0).toString(16).padStart(8,'0')};
export const cacheAccountKey=(value:unknown)=>{const raw=String(value||'').trim();if(!raw||raw==='anon')return'anon';if(/^u-[a-f0-9]{8}$/.test(raw))return raw;return`u-${accountHash(raw)}`};
