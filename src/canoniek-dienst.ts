export type CanonicalService='hub'|'ai'|'mail'|'cloud'|'github'|'huis'|'identity'|'api'|'admin'|'mcp';
export type PublicService='hub'|'ai'|'mail'|'cloud'|'github'|'huis'|'mcp';
export type ServiceId=Exclude<CanonicalService,'hub'>;
export type CanonicalLang='uk'|'nl';
export type CanonicalRoute={service:CanonicalService;tab:string;lang:CanonicalLang;explicitLang?:string;host:string;path:string;pathTab?:string;production:boolean;/** pad is geen tabblad van deze dienst → 404-pagina (public/canonical-service.js) */onbekend?:boolean};
type Runtime={serviceIds:CanonicalService[];publicServiceIds:PublicService[];domains:Record<CanonicalService,string>;defaults:Record<CanonicalService,string>;tabs:Record<CanonicalService,readonly string[]>;isService:(value:unknown)=>boolean;serviceForHostname:(host?:string)=>CanonicalService|'';safeTab:(service:CanonicalService,value:unknown)=>string;resolve:()=>Omit<CanonicalRoute,'lang'>&{lang?:string;explicitLang?:string};canonicalUrl:(target:CanonicalService,tab?:string,lang?:CanonicalLang,options?:{explicitTab?:boolean})=>string;replaceLegacy:()=>boolean;idForTab:(v:unknown)=>string;tabSlug:(id:unknown)=>string};
declare global{interface Window{__TSV_CANONICAL_SERVICE__?:Runtime;__TSV_PARSE_PUBLIC_ROUTE__?:()=>CanonicalRoute;__TSV_ROUTE__?:CanonicalRoute}}
const runtime=()=>{const value=window.__TSV_CANONICAL_SERVICE__;if(!value)throw new Error('CANONICAL_SERVICE_RUNTIME_MISSING');return value};
export const serviceIds=runtime().serviceIds;
export const publicServiceIds=runtime().publicServiceIds;
export const domains=runtime().domains;
export const defaults=runtime().defaults;
export const serviceTabs=runtime().tabs;
export const serviceForHostname=(host=location.hostname)=>runtime().serviceForHostname(host);
export const resolveCanonicalRoute=():CanonicalRoute=>{const route=runtime().resolve();const documentLang=document.documentElement.lang==='nl'?'nl':'uk';const lang:CanonicalLang=route.explicitLang==='nl'?'nl':route.explicitLang==='uk'?'uk':documentLang;return{...route,lang} as CanonicalRoute};
export const canonicalServiceUrl=(target:CanonicalService,tab='',lang:CanonicalLang='uk',explicitTab=Boolean(tab))=>runtime().canonicalUrl(target,tab,lang,{explicitTab});
export const replaceLegacyProductionUrl=()=>runtime().replaceLegacy();
// Slug-laag (Правило 0): id↔Nederlandse slug in de URL; de views gebruiken de id.
export const idForTab=(v:unknown)=>runtime().idForTab(v);
export const tabSlug=(id:unknown)=>runtime().tabSlug(id);
