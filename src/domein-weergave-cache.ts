import type{CanonicalLang,CanonicalService}from'./canoniek-dienst';
import{readSharedPreferences,writeSharedPreferences}from'./gedeelde-voorkeuren';
import{stripEcosystemTabView}from'./tab-context';
export type DomainViewAddress={accountKey:string;service:CanonicalService;path:string;locale:CanonicalLang};
export type DomainViewEntry<T=unknown>={key:string;signature:string;model:T;timestamp:number};
type DomainViewStore={version:1;entries:Record<string,DomainViewEntry>};
const DOMAIN_VIEW_CACHE_KEY='tsv-domain-view-cache-v1';
const DURABLE_MAX_ENTRIES=64,DURABLE_MAX_BYTES=1200000,FUTURE_SLACK_MS=60000;
const services:CanonicalService[]=['hub','ai','mail','cloud','github','huis','identity','api','admin','mcp'];
const sensitive=/^(accessToken|refreshToken|idToken|token|authorization|cookie|secret|password|nonce|pkce|codeVerifier|proof|sessionToken)$/i;
/* hash + cacheAccountKey staan sinds 21.10.2026 in ./account-sleutel (zonder afhankelijkheden: ook src/mail-bijlage-cache.ts gebruikt ze) */
import{accountHash as hash,cacheAccountKey}from'./account-sleutel';export{cacheAccountKey};
const safePath=(value:unknown)=>{const raw=String(value||'/').split(/[?#]/)[0];return(raw.startsWith('/')?raw:`/${raw}`).slice(0,240)||'/'};
const normalizeValue=(value:unknown,seen=new WeakSet<object>()):unknown=>{if(value===null||typeof value==='string'||typeof value==='boolean')return value;if(typeof value==='number')return Number.isFinite(value)?value:null;if(Array.isArray(value))return value.slice(0,500).map(item=>normalizeValue(item,seen));if(typeof value!=='object')return null;if(seen.has(value as object))return null;seen.add(value as object);const result:Record<string,unknown>={};for(const key of Object.keys(value as Record<string,unknown>).sort()){if(sensitive.test(key))continue;result[key]=normalizeValue((value as Record<string,unknown>)[key],seen)}seen.delete(value as object);return result};
const stableJson=(value:unknown)=>JSON.stringify(normalizeValue(value));
export const stableSignature=(value:unknown)=>{const json=stableJson(value);return`${hash(json)}:${json.length}`};
export const applyIfChanged=<T,>(previous:T,next:T):T=>stableSignature(previous)===stableSignature(next)?previous:next;
export const makeViewCacheKey=(address:DomainViewAddress)=>`${cacheAccountKey(address.accountKey)}|${address.service}|${encodeURIComponent(safePath(address.path))}|${address.locale}`;
const emptyStore=():DomainViewStore=>({version:1,entries:{}});
/* SEC-002 (interface-05): de cache komt ALLEEN uit sessionStorage/localStorage van deze origin — nooit meer uit window.name, dat elke
   site kan zetten. Ook de eigen opslag wordt bij het lezen nagekeken (ze kan vóór deze patch zijn vervuild): een rij telt alleen als
   haar eigen sleutel bij haar plaats past en haar tijdstip niet in de toekomst ligt (> 60 s) — anders won een ondergeschoven rij
   voorgoed van elke echte. */
const validEntry=(key:string,entry:unknown,now:number):entry is DomainViewEntry=>{if(!entry||typeof entry!=='object')return false;const item=entry as DomainViewEntry,timestamp=Number(item.timestamp);return item.key===key&&typeof item.signature==='string'&&Number.isFinite(timestamp)&&timestamp<=now+FUTURE_SLACK_MS};
const parseStore=(raw:string):DomainViewStore=>{try{const parsed=JSON.parse(raw)as DomainViewStore;if(parsed?.version!==1||!parsed.entries||typeof parsed.entries!=='object')return emptyStore();const store=emptyStore(),now=Date.now();for(const[key,entry]of Object.entries(parsed.entries))if(validEntry(key,entry,now))store.entries[key]=entry;return store}catch{return emptyStore()}};
const mergeStores=(first:DomainViewStore,second:DomainViewStore)=>{const merged=emptyStore();for(const entry of[...Object.values(first.entries),...Object.values(second.entries)]){const current=merged.entries[entry.key];if(!current||Number(entry.timestamp)>Number(current.timestamp))merged.entries[entry.key]=entry}return merged};
const trimStore=(store:DomainViewStore,maxEntries:number,maxBytes:number)=>{let entries=Object.values(store.entries).sort((a,b)=>b.timestamp-a.timestamp).slice(0,maxEntries);let next:DomainViewStore={version:1,entries:Object.fromEntries(entries.map(entry=>[entry.key,entry]))};while(entries.length>1&&JSON.stringify(next).length>maxBytes){entries=entries.slice(0,-1);next={version:1,entries:Object.fromEntries(entries.map(entry=>[entry.key,entry]))}}return next};
const readStore=():DomainViewStore=>{let session=emptyStore(),durable=emptyStore();stripEcosystemTabView();try{session=parseStore(sessionStorage.getItem(DOMAIN_VIEW_CACHE_KEY)||'')}catch{}try{durable=parseStore(localStorage.getItem(DOMAIN_VIEW_CACHE_KEY)||'')}catch{}return mergeStores(session,durable)};
const writeStore=(store:DomainViewStore)=>{try{const durable=trimStore(store,DURABLE_MAX_ENTRIES,DURABLE_MAX_BYTES),json=JSON.stringify(durable);localStorage.setItem(DOMAIN_VIEW_CACHE_KEY,json);sessionStorage.setItem(DOMAIN_VIEW_CACHE_KEY,json)}catch{}};
export const readCachedViewModel=<T,>(address:DomainViewAddress):DomainViewEntry<T>|null=>{const key=makeViewCacheKey(address),entry=readStore().entries[key];return entry&&entry.signature&&entry.model!==undefined?entry as DomainViewEntry<T>:null};
export const writeCachedViewModel=<T,>(address:DomainViewAddress,input:T)=>{const key=makeViewCacheKey(address),store=readStore(),model=normalizeValue(input)as T,signature=stableSignature(model),previous=store.entries[key]as DomainViewEntry<T>|undefined;if(previous?.signature===signature)return{entry:previous,changed:false};const entry:DomainViewEntry<T>={key,signature,model,timestamp:Date.now()};store.entries[key]=entry;writeStore(store);return{entry,changed:true}};
export const clearDomainViewCache=(accountKey?:string)=>{try{if(!accountKey){sessionStorage.removeItem(DOMAIN_VIEW_CACHE_KEY);localStorage.removeItem(DOMAIN_VIEW_CACHE_KEY);stripEcosystemTabView();return}const prefix=`${cacheAccountKey(accountKey)}|`,store=readStore();for(const key of Object.keys(store.entries))if(key.startsWith(prefix))delete store.entries[key];writeStore(store)}catch{}};
export const viewAccountForService=(service:CanonicalService)=>cacheAccountKey(readSharedPreferences().accountKeyByService?.[service]);
export const rememberViewAccount=(service:CanonicalService,identity:unknown)=>{const accountKey=cacheAccountKey(identity),current=readSharedPreferences();if(current.accountKeyByService?.[service]!==accountKey)writeSharedPreferences({accountKeyByService:{[service]:accountKey}});return accountKey};
export const rememberViewAccountEverywhere=(identity:unknown)=>{const accountKey=cacheAccountKey(identity),current=readSharedPreferences(),patch:Partial<Record<CanonicalService,string>>={};let changed=false;for(const service of services){patch[service]=accountKey;if(current.accountKeyByService?.[service]!==accountKey)changed=true}if(changed)writeSharedPreferences({accountKeyByService:patch});return accountKey};
export const forgetViewAccount=(service:CanonicalService)=>{const current=readSharedPreferences();if(current.accountKeyByService?.[service])writeSharedPreferences({accountKeyByService:{[service]:''}})};
/* Afmelden van ÉÉN account mag de kaart van de ANDERE accounts van deze browser niet wissen: anders verliezen hun
   tabbladen hun eerste beeld (ze weten niet meer welk account bij welke dienst hoort). clearViewAccounts() blijft voor
   «alle accounts afmelden». */
export const forgetViewAccountEverywhere=(identity:unknown)=>{const accountKey=cacheAccountKey(identity),current=readSharedPreferences(),patch:Partial<Record<CanonicalService,string>>={};let changed=false;for(const service of services)if(current.accountKeyByService?.[service]===accountKey){patch[service]='';changed=true}if(changed)writeSharedPreferences({accountKeyByService:patch});return accountKey};
export const clearViewAccounts=()=>{const current=readSharedPreferences();if(!services.some(service=>current.accountKeyByService?.[service]))return;const patch:Partial<Record<CanonicalService,string>>={};for(const service of services)patch[service]='';writeSharedPreferences({accountKeyByService:patch})};
export{DOMAIN_VIEW_CACHE_KEY};
