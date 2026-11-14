import{adresVan}from'../shared/mail-afzenders';
/* SEC-002 (aanv-ronde1-02): адреса — з ОСТАННІХ кутових дужок наприкінці (як у shared/mail-afzenders adresVan). Раніше перемагали перші «<…>»
   з відображуваного імені нападника («"Baas <baas@x>" <aanvaller@y>»): лист отримував фото, колір, контекст і дозвіл на зображення справжнього контакту. */
export const normalizeMailAddress=(value:string)=>adresVan(String(value||'')).adres;
