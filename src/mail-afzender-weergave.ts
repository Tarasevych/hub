// Weergave van de afzender in de kop van een geopende brief (21.10.2026, рецензія UX).
/** 21.10 рецензія UX: «Ім'я <адреса>» у заголовку листа показувався сирим рядком (кутові дужки, «>» окремим рядком на 360 px).
 * Тепер ім'я — жирним, адреса — окремим приглушеним рядком (як у списку листів). Без імені — лише адреса. */
export const splitsAfzender=(from?:string|null):{naam:string;adres:string}=>{const v=String(from||'').trim();const m=/^"?([^"<]*?)"?\s*<([^<>\s]+)>$/.exec(v);if(!m)return{naam:v,adres:''};const naam=m[1].trim(),adres=m[2].trim();return naam&&naam.toLowerCase()!==adres.toLowerCase()?{naam,adres}:{naam:adres,adres:''}};
