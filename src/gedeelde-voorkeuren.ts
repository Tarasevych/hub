// Gedeelde weergavevoorkeuren van alle subdomeinen — PER ACCOUNT en PER WEBRUIMTE (profiel). Punt 2 en punt 4, audit 20.10.2026.
//
// WAT HIER FOUT WAS (en nu hersteld is): dit bestand hield het hele uiterlijk onder ÉÉN waarde in de cookie
// `tsv_ecosystem_preferences` (Domain=.tarasevych.com) en in sessionStorage. Thema, palet, automatisch schakelen, taal, foto,
// plaats van de bel, meldingsgeluid en de laatste paden waren dus gedeeld door ALLE accounts in dezelfde browser én door de
// gebruikersruimte en het technisch profiel. Wie met twee accounts werkte, zag het thema van de ander; wie het technische
// profiel opende, zag precies hetzelfde beeld als in zijn privéruimte.
//
// HOE HET NU WERKT (dezelfde mechaniek als het menu — src/zijbalk-voorkeuren.ts + shared/menu-model.ts; GEEN tweede systeem):
//  • De opslag heeft twee laden: `accounts['<account>']` (taal + profielfoto: die horen bij de persoon, niet bij de ruimte) en
//    `ruimtes['<account>|<ruimte>']` (thema, palet, auto, menuhint, geluid, belpositie, laatste paden, routebeeld).
//    Zie shared/uiterlijk.ts voor de velden en de reden van die verdeling.
//  • Het ACCOUNT van dit tabblad komt synchroon uit `accountPerDienst[dienst]` in de cookie (zelfde bron als het eerste beeld in
//    index.html), met een hint per TABBLAD in sessionStorage; de bootstrap zet het exact via zetWeergaveAccount().
//  • De RUIMTE van dit tabblad komt uit een hint per TABBLAD (sessionStorage), zodat na F5 het eerste beeld meteen het juiste
//    profiel heeft; CanonicalChrome zet hem met zetWeergaveRuimte() zodra het oppervlak bekend is.
//  • De SERVER is de bron van waarheid (src/weergave-uiterlijk.ts stuurt en haalt op); deze cookie is alleen een snelle cache
//    voor het EERSTE BEELD — zonder cookie flitst het wit en springt het thema. Daarom blijft de cookie klein: hoogstens
//    MAX_RUIMTES scopes en MAX_COOKIE tekens, anders vallen de minst nodige velden en de oudste scopes weg (snijden()).
//  • MIGRATIE (punt 3): een bestaande gedeelde waarde (versie 1/2, velden op het hoogste niveau) wordt NIET weggegooid en NIET
//    aan alle accounts gegeven: hij wordt precies het record van het NU ACTIEVE ACCOUNT in de GEBRUIKERSRUIMTE
//    (`<account>|gebruiker`, account uit accountPerDienst van deze dienst, anders 'anon'). Het technisch profiel begint dus met
//    zijn eigen standaard en de andere accounts met een leeg record. Zie migreer() hieronder.
import{defaults,idForTab,serviceForHostname,serviceTabs,type CanonicalService}from'./canoniek-dienst';
import type{AutoInstelling,Palet}from'./thema/kern';
import type{MenuRuimte}from'../shared/menu-model';
import{normaliseerUiterlijkAccount,normaliseerUiterlijkAvatar,normaliseerUiterlijkRuimte,standaardVoorRuimte,uiterlijkLeeg,UITERLIJK_DIENSTEN,type UiterlijkAccount,type UiterlijkRuimte}from'../shared/uiterlijk';
export type SharedTheme='light'|'dark'|'device'|'auto'|'plum'|'plum-light'|'plum-dark';
export type ThemePreference='light'|'dark'|'device'|'auto'|'plum-light'|'plum-dark';
export type PresentationTheme='light'|'dark'|'plum-light'|'plum-dark';
export type CachedRouteView='signed-out'|'mail-empty'|'github-empty'|'api-empty';
/** Platte weergave van de voorkeuren van DIT tabblad (dit account, deze ruimte). De vorm blijft zoals hij was, zodat alle
 *  bestaande aanroepen (thema, taal, bel, avatar, laatste paden) ongewijzigd blijven werken — alleen de OPSLAG is nu per scope. */
export type SharedPreferences={lang?:'uk'|'nl';theme?:SharedTheme;menu?:string[];lastPathByService?:Partial<Record<CanonicalService,string>>;accountKeyByService?:Partial<Record<CanonicalService,string>>;avatarUrl?:string;viewByRoute?:Record<string,CachedRouteView>;notificationSound?:boolean;notificationBellPosition?:{x:number;y:number};palet?:Palet;auto?:AutoInstelling;revision?:number};
const COOKIE='tsv_ecosystem_preferences',LOCAL='tsv-ecosystem-presentation-v2';export const HUB_LAYOUTS_STORAGE_KEY='tsv-hub-workspace-layouts-v1';const LEGACY_THEME_KEYS=['pavlo-hub-theme','tarasevych-ecosystem-theme','tsv-ecosystem-theme-v1'] as const,LEGACY_LANGUAGE_KEYS=['pavlo-hub-language','tarasevych-ecosystem-language'] as const,LEGACY_LAYOUT_KEYS=['pavlo-hub-workspace-layouts'] as const;
/** Hints per TABBLAD (sessionStorage is per tabblad, niet per browser): welk account en welke ruimte had dit tabblad als laatste?
 *  Zo toont het eerste beeld na F5 meteen het juiste uiterlijk en nooit dat van een ander account of een ander profiel. */
export const WEERGAVE_ACCOUNT_HINT='tsv-weergave-account',WEERGAVE_RUIMTE_HINT='tsv-weergave-ruimte';
/** Grenzen van de cookie-cache. Een cookie mag (naam + waarde + kenmerken) ongeveer 4096 tekens zijn, en hij gaat bij ELK verzoek
 *  naar alle subdomeinen mee, naast de sessiecookies. Daarom 3000 voor de waarde: ruim onder de grens van de browser en met plaats
 *  over in de verzoekkop. MAX_RUIMTES houdt hem ook bij veel accounts klein; de volledige stand staat op de server, en
 *  sessionStorage (MAX_LOKAAL scopes, geen grens van 4 kB) houdt alles van DIT tabblad. */
export const MAX_COOKIE=3000,MAX_RUIMTES=4,MAX_LOKAAL=12;
const services:CanonicalService[]=[...UITERLIJK_DIENSTEN];
const views:CachedRouteView[]=['signed-out','mail-empty','github-empty','api-empty'];
type Opslag={versie:3;revisie:number;accountPerDienst:Partial<Record<CanonicalService,string>>;accounts:Record<string,UiterlijkAccount>;ruimtes:Record<string,UiterlijkRuimte>};
const leegOpslag=():Opslag=>({versie:3,revisie:0,accountPerDienst:{},accounts:{},ruimtes:{}});
const huidigeDienst=():CanonicalService=>{try{return serviceForHostname()||'hub'}catch{return'hub'}};
const normalizeAccountKey=(value:unknown)=>{const raw=String(value||'');return raw==='anon'||/^u-[a-f0-9]{8}$/.test(raw)?raw:''};
export const sleutelVoor=(account:string,ruimte:MenuRuimte)=>`${account||'anon'}|${ruimte}`;

// ---------------------------------------------------------------------------------------- scope van DIT tabblad
const hint=(sleutel:string)=>{try{return typeof sessionStorage!=='undefined'?String(sessionStorage.getItem(sleutel)||''):''}catch{return''}};
const zetHint=(sleutel:string,waarde:string)=>{try{if(typeof sessionStorage!=='undefined')sessionStorage.setItem(sleutel,waarde)}catch{/* privémodus */}};
let ruimteNu:MenuRuimte=hint(WEERGAVE_RUIMTE_HINT)==='technisch'?'technisch':'gebruiker';
let accountNu=normalizeAccountKey(hint(WEERGAVE_ACCOUNT_HINT));
/** In welke webruimte (profiel) staat dit tabblad nu? */
export const weergaveRuimteNu=()=>ruimteNu;
/** Aan welk account hangt het uiterlijk nu ('anon' = niet aangemeld)? Zonder hint: het account van deze dienst uit de cookie. */
export const weergaveAccountNu=()=>accountNu||normalizeAccountKey(leesOpslag().accountPerDienst[huidigeDienst()])||'anon';
export const weergaveScopeNu=()=>sleutelVoor(weergaveAccountNu(),ruimteNu);

const luisteraars=new Set<(value:SharedPreferences)=>void>();
let laatsteSignatuur='';
/** Lokaal abonnement: elke wijziging van de opslag, van het account of van de ruimte van DIT tabblad, meteen (geen 800 ms wachten). */
export const abonneerWeergave=(listener:(value:SharedPreferences)=>void)=>{luisteraars.add(listener);return()=>{luisteraars.delete(listener)}};
const melden=()=>{const signatuur=`${weergaveScopeNu()}#${JSON.stringify(leesOpslag().ruimtes[weergaveScopeNu()]||null)}#${JSON.stringify(leesOpslag().accounts[weergaveAccountNu()]||null)}`;if(signatuur===laatsteSignatuur)return;laatsteSignatuur=signatuur;const waarde=readSharedPreferences();for(const listener of [...luisteraars])listener(waarde)};

/** Ander account in dit tabblad (bootstrap / accountwissel): nooit het uiterlijk van de ander toepassen of namens hem schrijven. */
export const zetWeergaveAccount=(waarde:unknown)=>{const account=normalizeAccountKey(waarde)||'anon';if(account===weergaveAccountNu()&&account===accountNu)return account;accountNu=account;zetHint(WEERGAVE_ACCOUNT_HINT,account);melden();return account};
/** Van ruimte wisselen (gebruikersruimte ↔ technisch profiel): elke ruimte heeft zijn eigen thema, palet en de rest van het uiterlijk. */
export const zetWeergaveRuimte=(ruimte:MenuRuimte)=>{if(ruimte===ruimteNu)return;ruimteNu=ruimte;zetHint(WEERGAVE_RUIMTE_HINT,ruimte);melden()};

// ---------------------------------------------------------------------------------------- lezen (cookie + sessionStorage)
const cookieValue=()=>{try{return document.cookie.split('; ').find(item=>item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1)||''}catch{return''}};
const localValue=()=>{try{return sessionStorage.getItem(LOCAL)||''}catch{return''}};
const ontleed=(value:string):Record<string,unknown>=>{try{return value?JSON.parse(decodeURIComponent(value))as Record<string,unknown>:{}}catch{return{}}};
export const normalizeAvatarUrl=(value:unknown)=>{const raw=String(value||'').trim();if(!raw)return'';/* 21.10.2026: ook SVG en ICO van de eigen server (logo's/foto's van afzenders, backend/merk-bron.ts): in <img> voert een SVG nooit script uit */if(/^data:image\/(?:jpeg|png|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/.test(raw)&&raw.length<=360000)return raw;if(raw.length>1024)return'';try{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password)return'';url.hash='';return url.toString()}catch{return''}};
/** UI-004: tabbladen die alleen doorsturen naar een andere dienst (ai/verbindingen → mcp.*\/agents) worden nooit onthouden of hersteld; anders opent het hoofditem «ШІ для вас» na één bezoek steeds het MCP-centrum. */
export const DOORVERWIJS_TABS:Partial<Record<CanonicalService,readonly string[]>>={ai:['verbindingen']};
export const isDoorverwijsTab=(service:CanonicalService,tab:string)=>Boolean(DOORVERWIJS_TABS[service]?.includes(tab));
const normalizePath=(service:CanonicalService,value:unknown)=>{const raw=String(value||'').split(/[?#]/)[0];if(!raw.startsWith('/'))return'';let slug='';try{slug=decodeURIComponent(raw.slice(1).split('/')[0]||'')}catch{return''}const tab=idForTab(slug);if(isDoorverwijsTab(service,tab))return'';return serviceTabs[service].includes(tab)?`/${encodeURIComponent(tab)}`:''};
const accountKaart=(raw:unknown)=>{const uit:Partial<Record<CanonicalService,string>>={};const r=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};for(const service of services){const account=normalizeAccountKey(r[service]);if(account)uit[service]=account}return uit};
/** Een patch mag een dienst ook WISSEN: `{mail:''}` betekent «dit tabblad hoort bij geen account meer» (afmelden, een andere
 *  gebruiker, een mislukte bootstrap). accountKaart() laat lege waarden vallen — die mogen nooit in de opslag staan — dus het
 *  wissen staat hier apart. ZONDER dit deden forgetViewAccount() en clearViewAccounts() niets: de kaart bleef na afmelden op
 *  het oude account staan en het eerste beeld van een nieuw tabblad kwam uit de cache van dat account (fout 20.10.2026). */
const teWissenDiensten=(raw:unknown)=>{const r=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};return services.filter(service=>service in r&&!normalizeAccountKey(r[service]))};
/** Punt 3: een oude gedeelde waarde (versie 1/2) wordt het record van het NU ACTIEVE ACCOUNT in de GEBRUIKERSRUIMTE — niet
 *  weggegooid, niet aan alle accounts gegeven en niet aan het technisch profiel. */
const migreer=(oud:Record<string,unknown>):Opslag=>{
  const accountPerDienst=accountKaart(oud.accountKeyByService);
  const account=normalizeAccountKey(accountPerDienst[huidigeDienst()])||'anon';
  const revisie=Number(oud.revision)||Date.now();
  const ruimte=normaliseerUiterlijkRuimte({modus:oud.theme,palet:oud.palet,auto:oud.auto,menu:oud.menu,geluid:oud.notificationSound,belPositie:oud.notificationBellPosition,laatstePad:oud.lastPathByService,routeBeeld:oud.viewByRoute,op:revisie});
  const persoon=normaliseerUiterlijkAccount({taal:oud.lang,avatar:normaliseerUiterlijkAvatar(oud.avatarUrl),op:revisie});
  const uit=leegOpslag();uit.revisie=revisie;uit.accountPerDienst=accountPerDienst;
  if(!uiterlijkLeeg(ruimte))uit.ruimtes[sleutelVoor(account,'gebruiker')]=ruimte;
  if(!uiterlijkLeeg(persoon))uit.accounts[account]=persoon;
  return uit;
};
const naarOpslag=(raw:Record<string,unknown>):Opslag=>{
  if(Number(raw.versie)!==3)return Object.keys(raw).length?migreer(raw):leegOpslag();
  const uit=leegOpslag();
  uit.revisie=Number(raw.revisie)||0;
  uit.accountPerDienst=accountKaart(raw.accountPerDienst);
  const accounts=raw.accounts&&typeof raw.accounts==='object'?raw.accounts as Record<string,unknown>:{};
  for(const [sleutel,waarde] of Object.entries(accounts)){const account=normalizeAccountKey(sleutel);if(!account)continue;const record=normaliseerUiterlijkAccount(waarde);if(!uiterlijkLeeg(record))uit.accounts[account]=record}
  const ruimtes=raw.ruimtes&&typeof raw.ruimtes==='object'?raw.ruimtes as Record<string,unknown>:{};
  for(const [sleutel,waarde] of Object.entries(ruimtes)){const [account,ruimte]=String(sleutel).split('|');if(!normalizeAccountKey(account)||(ruimte!=='gebruiker'&&ruimte!=='technisch'))continue;const record=normaliseerUiterlijkRuimte(waarde);if(!uiterlijkLeeg(record))uit.ruimtes[`${account}|${ruimte}`]=record}
  return uit;
};
/** Cookie en sessionStorage samenvoegen. De globale accountkaart komt van de nieuwste van de twee; elk RECORD apart van de
 *  nieuwste van de twee (`op`), zodat een ander subdomein een andere scope kan hebben bijgewerkt zonder deze te overschrijven. */
const samen=(a:Opslag,b:Opslag):Opslag=>{
  const uit=leegOpslag();
  uit.revisie=Math.max(a.revisie,b.revisie);
  uit.accountPerDienst=(a.revisie>=b.revisie?{...b.accountPerDienst,...a.accountPerDienst}:{...a.accountPerDienst,...b.accountPerDienst});
  for(const sleutel of new Set([...Object.keys(a.accounts),...Object.keys(b.accounts)])){const x=a.accounts[sleutel],y=b.accounts[sleutel];uit.accounts[sleutel]=!x?y:!y?x:(Number(x.op||0)>=Number(y.op||0)?x:y)}
  for(const sleutel of new Set([...Object.keys(a.ruimtes),...Object.keys(b.ruimtes)])){const x=a.ruimtes[sleutel],y=b.ruimtes[sleutel];uit.ruimtes[sleutel]=!x?y:!y?x:(Number(x.op||0)>=Number(y.op||0)?x:y)}
  return uit;
};
let vorigeBron='';let vorigeOpslag:Opslag=leegOpslag();
/** De hele opslag (alle scopes). Gecacht op de ruwe tekst van cookie + sessionStorage: dit wordt per beeld tientallen keren gelezen. */
export const leesOpslag=():Opslag=>{const bron=`${cookieValue()}\u0000${localValue()}`;if(bron===vorigeBron)return vorigeOpslag;vorigeBron=bron;vorigeOpslag=samen(naarOpslag(ontleed(localValue())),naarOpslag(ontleed(cookieValue())));return vorigeOpslag};

/** Het record van één scope, met de standaard van die ruimte eronder (technisch profiel = eigen donker palet, punt 4). */
export const uiterlijkVanScope=(account=weergaveAccountNu(),ruimte=ruimteNu):UiterlijkRuimte=>({...standaardVoorRuimte(ruimte),...leesOpslag().ruimtes[sleutelVoor(account,ruimte)]});
export const uiterlijkVanAccount=(account=weergaveAccountNu()):UiterlijkAccount=>leesOpslag().accounts[account]||{versie:1};

/** Platte weergave voor de app: het uiterlijk van DIT account in DEZE ruimte (+ de globale accountkaart, die van geen account is). */
export const readSharedPreferences=():SharedPreferences=>{
  const opslag=leesOpslag(),ruimte=uiterlijkVanScope(),persoon=uiterlijkVanAccount();
  const paths:Partial<Record<CanonicalService,string>>={};
  for(const service of services){const path=normalizePath(service,ruimte.laatstePad?.[service]);if(path)paths[service]=path}
  const routeViews:Record<string,CachedRouteView>={};
  for(const [sleutel,waarde] of Object.entries(ruimte.routeBeeld||{}))if(views.includes(waarde as CachedRouteView))routeViews[sleutel]=waarde as CachedRouteView;
  return{lang:persoon.taal,theme:ruimte.modus,palet:ruimte.palet as Palet|undefined,auto:ruimte.auto as AutoInstelling|undefined,menu:ruimte.menu,lastPathByService:paths,accountKeyByService:opslag.accountPerDienst,avatarUrl:persoon.avatar||'',viewByRoute:routeViews,notificationSound:ruimte.geluid,notificationBellPosition:ruimte.belPositie,revision:opslag.revisie};
};

// ---------------------------------------------------------------------------------------- schrijven
/** Velden die het EERSTE BEELD niet nodig heeft: die vallen als eerste uit de cookie als hij te groot wordt. */
const SNIJ_VELDEN=['routeBeeld','laatstePad','menu','belPositie','geluid'] as const;
const zonder=(record:UiterlijkRuimte,velden:readonly string[]):UiterlijkRuimte=>Object.fromEntries(Object.entries(record).filter(([k])=>!velden.includes(k)))as UiterlijkRuimte;
const deel=(opslag:Opslag,sleutels:string[],snij:readonly string[]):Opslag=>{
  const uit:Opslag={versie:3,revisie:opslag.revisie,accountPerDienst:opslag.accountPerDienst,accounts:{},ruimtes:{}};
  for(const sleutel of sleutels){const record=opslag.ruimtes[sleutel];if(record)uit.ruimtes[sleutel]=snij.length?zonder(record,snij):record;const account=sleutel.split('|')[0];if(opslag.accounts[account])uit.accounts[account]=opslag.accounts[account]}
  return uit;
};
/** De cookie klein houden: eerst de oudste scopes, dan de minst nodige velden, en als laatste redmiddel alleen thema + palet +
 *  taal van DEZE scope. Het eerste beeld heeft nooit meer nodig dan dat; de volledige stand staat op de server. */
const snijden=(opslag:Opslag,sleutel:string)=>{
  const orde=[sleutel,...Object.keys(opslag.ruimtes).filter(k=>k!==sleutel).sort((a,b)=>Number(opslag.ruimtes[b]?.op||0)-Number(opslag.ruimtes[a]?.op||0))];
  for(const snij of [[],SNIJ_VELDEN] as const)for(let aantal=Math.min(orde.length,MAX_RUIMTES);aantal>=1;aantal--){const tekst=encodeURIComponent(JSON.stringify(deel(opslag,orde.slice(0,aantal),snij)));if(tekst.length<=MAX_COOKIE)return tekst}
  const record=opslag.ruimtes[sleutel]||{versie:1 as const},persoon=opslag.accounts[sleutel.split('|')[0]];
  const minimaal:Opslag={versie:3,revisie:opslag.revisie,accountPerDienst:opslag.accountPerDienst,accounts:persoon?.taal?{[sleutel.split('|')[0]]:{versie:1,taal:persoon.taal,op:persoon.op}}:{},ruimtes:{[sleutel]:{versie:1,...(record.modus?{modus:record.modus}:{}),...(record.palet?{palet:record.palet}:{}),op:record.op}}};
  return encodeURIComponent(JSON.stringify(minimaal));
};
const bewaren=(opslag:Opslag)=>{
  const sleutel=weergaveScopeNu();
  const orde=[sleutel,...Object.keys(opslag.ruimtes).filter(k=>k!==sleutel).sort((a,b)=>Number(opslag.ruimtes[b]?.op||0)-Number(opslag.ruimtes[a]?.op||0))].slice(0,MAX_LOKAAL);
  try{sessionStorage.setItem(LOCAL,encodeURIComponent(JSON.stringify(deel(opslag,orde,[]))))}catch{/* privémodus */}
  const shared=location.hostname==='tarasevych.com'||location.hostname.endsWith('.tarasevych.com');
  try{document.cookie=`${COOKIE}=${snijden(opslag,sleutel)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure${shared?'; Domain=.tarasevych.com':''}`}catch{/* geen document */}
  vorigeBron='';
};
const RUIMTE_VELDEN=['theme','palet','auto','menu','notificationSound','notificationBellPosition','lastPathByService','viewByRoute'] as const;
/** Schrijven gaat altijd naar de scope van DIT tabblad (dit account, deze ruimte) — nooit naar die van een ander account of profiel.
 *  `accountKeyByService` is de enige globale waarde: die zegt juist WELK account bij welke dienst hoort. */
export const writeSharedPreferences=(patch:SharedPreferences)=>{
  const opslag=leesOpslag(),account=weergaveAccountNu(),sleutel=sleutelVoor(account,ruimteNu),nu=Date.now();
  const vorigeRuimte=opslag.ruimtes[sleutel]||{versie:1 as const},vorigePersoon=opslag.accounts[account]||{versie:1 as const};
  const volgende:Opslag={versie:3,revisie:nu,accountPerDienst:{...opslag.accountPerDienst,...accountKaart(patch.accountKeyByService)},accounts:{...opslag.accounts},ruimtes:{...opslag.ruimtes}};
  for(const service of teWissenDiensten(patch.accountKeyByService))delete volgende.accountPerDienst[service];
  if(RUIMTE_VELDEN.some(veld=>veld in patch)){
    const samengevoegd=normaliseerUiterlijkRuimte({...vorigeRuimte,
      ...('theme' in patch?{modus:patch.theme}:{}),...('palet' in patch?{palet:patch.palet}:{}),...('auto' in patch?{auto:patch.auto}:{}),...('menu' in patch?{menu:patch.menu}:{}),
      ...('notificationSound' in patch?{geluid:patch.notificationSound}:{}),...('notificationBellPosition' in patch?{belPositie:patch.notificationBellPosition}:{}),
      laatstePad:{...vorigeRuimte.laatstePad,...patch.lastPathByService},routeBeeld:{...vorigeRuimte.routeBeeld,...patch.viewByRoute},op:nu});
    volgende.ruimtes[sleutel]=samengevoegd;
    if(uiterlijkLeeg(samengevoegd))delete volgende.ruimtes[sleutel];
  }
  if('lang' in patch||'avatarUrl' in patch){
    const persoon=normaliseerUiterlijkAccount({...vorigePersoon,...('lang' in patch?{taal:patch.lang}:{}),...('avatarUrl' in patch?{avatar:normaliseerUiterlijkAvatar(patch.avatarUrl)}:{}),op:nu});
    volgende.accounts[account]=persoon;
    if(uiterlijkLeeg(persoon))delete volgende.accounts[account];
  }
  bewaren(volgende);melden();
  return readSharedPreferences();
};
/** Door de server geleverde stand toepassen zonder hem meteen terug te sturen (src/weergave-uiterlijk.ts). */
export const uiterlijkVanServerZetten=(ruimte:MenuRuimte,record:UiterlijkRuimte,account=weergaveAccountNu())=>{
  const opslag=leesOpslag(),sleutel=sleutelVoor(account,ruimte),volgende:Opslag={...opslag,revisie:Date.now(),accounts:{...opslag.accounts},ruimtes:{...opslag.ruimtes}};
  const schoon=normaliseerUiterlijkRuimte({...record,op:Date.now()});
  if(JSON.stringify(zonder(schoon,['op']))===JSON.stringify(zonder(opslag.ruimtes[sleutel]||{versie:1},['op'])))return false;
  if(uiterlijkLeeg(schoon))delete volgende.ruimtes[sleutel];else volgende.ruimtes[sleutel]=schoon;
  bewaren(volgende);melden();
  return true;
};
/** Wat er van DEZE ruimte naar de server moet (zonder `op`: dat is alleen voor het samenvoegen van de twee lokale caches). */
export const uiterlijkVoorServer=(ruimte:MenuRuimte=ruimteNu,account=weergaveAccountNu()):UiterlijkRuimte=>zonder(leesOpslag().ruimtes[sleutelVoor(account,ruimte)]||{versie:1},['op']);

// ---------------------------------------------------------------------------------------- thema toepassen en oude sleutels
export const themePreferenceFromValue=(value:unknown,fallback:ThemePreference='device'):ThemePreference=>value==='plum-dark'?'plum-dark':value==='plum-light'||value==='plum'?'plum-light':value==='dark'?'dark':value==='light'?'light':value==='device'?'device':value==='auto'?'auto':fallback;
export const presentationThemeFromValue=(value:unknown,fallback:PresentationTheme='light'):PresentationTheme=>value==='plum-dark'?'plum-dark':value==='plum-light'||value==='plum'?'plum-light':value==='dark'?'dark':value==='light'?'light':value==='device'?fallback:fallback;
export const applyDocumentPresentationTheme=(theme:PresentationTheme)=>{const root=document.documentElement;root.classList.remove('theme-light','theme-dark','theme-plum','theme-plum-light','theme-plum-dark');root.classList.add(`theme-${theme}`);root.dataset.presentationTheme=theme;root.style.colorScheme=theme==='dark'||theme==='plum-dark'?'dark':'light'};
export const migrateLegacyPresentationStorage=()=>{try{
  // oude, accountloze cookie (versie 1/2) → record van dit account in de gebruikersruimte; één keer wegschrijven
  const ruw=ontleed(cookieValue());if(Object.keys(ruw).length&&Number(ruw.versie)!==3)bewaren(leesOpslag());
  const current=readSharedPreferences();
  if(current.theme==='plum'||current.theme==='plum-light'||current.theme==='plum-dark')writeSharedPreferences({theme:current.theme==='plum-dark'?'dark':'light',palet:'violet'});
  if(!current.theme){for(const key of LEGACY_THEME_KEYS){const value=localStorage.getItem(key);if(['light','dark','device','plum','plum-light','plum-dark'].includes(String(value))){writeSharedPreferences({theme:value as SharedTheme});break}}}
  if(!localStorage.getItem(HUB_LAYOUTS_STORAGE_KEY)){for(const key of LEGACY_LAYOUT_KEYS){const value=localStorage.getItem(key);if(value){localStorage.setItem(HUB_LAYOUTS_STORAGE_KEY,value);break}}}
  if(!readSharedPreferences().lang){for(const key of LEGACY_LANGUAGE_KEYS){const value=localStorage.getItem(key);if(value==='uk'||value==='nl'){writeSharedPreferences({lang:value});break}}}
  for(const key of [...LEGACY_THEME_KEYS,...LEGACY_LANGUAGE_KEYS,...LEGACY_LAYOUT_KEYS])localStorage.removeItem(key)}catch{}};
export const rememberServicePath=(service:CanonicalService,path:string)=>{const safe=normalizePath(service,path);if(safe)writeSharedPreferences({lastPathByService:{[service]:safe}})};
export const lastPathForService=(service:CanonicalService)=>normalizePath(service,readSharedPreferences().lastPathByService?.[service]);
export const rememberedTabForPath=(service:CanonicalService,path=lastPathForService(service))=>{const safe=normalizePath(service,path);if(!safe)return defaults[service];try{return decodeURIComponent(safe.slice(1))}catch{return defaults[service]}};
export const rememberAvatarUrl=(value:unknown)=>{const safe=normalizeAvatarUrl(value);if(safe&&!safe.startsWith('data:')&&safe!==readSharedPreferences().avatarUrl)writeSharedPreferences({avatarUrl:safe});return safe};
export const cachedAvatarUrl=()=>normalizeAvatarUrl(readSharedPreferences().avatarUrl);
export const clearCachedAvatar=()=>{if(readSharedPreferences().avatarUrl)writeSharedPreferences({avatarUrl:''})};
export const rememberRouteView=(service:CanonicalService,tab:string,view:CachedRouteView)=>{if(serviceTabs[service].includes(tab)&&views.includes(view))writeSharedPreferences({viewByRoute:{[`${service}:${tab}`]:view}})};
export const clearRouteView=(service:CanonicalService,tab:string)=>{if(serviceTabs[service].includes(tab))writeSharedPreferences({viewByRoute:{[`${service}:${tab}`]:''as CachedRouteView}})};
export const cachedRouteView=(service:CanonicalService,tab:string):CachedRouteView|''=>{if(!serviceTabs[service].includes(tab))return'';const value=readSharedPreferences().viewByRoute?.[`${service}:${tab}`];return views.includes(value as CachedRouteView)?value as CachedRouteView:''};
/** Volgt de cookie (ander subdomein of ander tabblad) ÉN elke lokale wijziging, inclusief een wissel van account of ruimte. */
export const watchSharedPreferences=(listener:(value:SharedPreferences)=>void)=>{let last=cookieValue();const timer=window.setInterval(()=>{const current=cookieValue();if(current!==last){last=current;vorigeBron='';listener(readSharedPreferences())}},800);const af=abonneerWeergave(value=>{last=cookieValue();listener(value)});return()=>{window.clearInterval(timer);af()}};
