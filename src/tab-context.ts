import{readSharedPreferences,writeSharedPreferences}from'./gedeelde-voorkeuren';
/* SEC-002 (interface-05): window.name draagt alleen nog niet-geheime hints (tab-id, sessiehint, menu, zijbalk). Vroeger reisde
   hier ook het «view:»-deel mee: tot 260 000 tekens weergavemodellen (meldingen, bekende accounts, blokken). Elke site kan de naam
   van een venster zetten (<a target="…">, window.open(url, naam)): zo schoof een vreemde site zijn eigen model onder, dat daarna
   in localStorage belandde, en de echte modellen gingen in window.name mee naar de volgende site in hetzelfde tabblad. Nu wordt
   «view:» nooit gelezen en nooit geschreven, en een achtergebleven deel wordt uit window.name gehaald. De weergavecache leeft
   alleen in sessionStorage/localStorage van deze origin (src/domein-weergave-cache.ts). */
const STORAGE_KEY='tsv-canonical-tab-v1',MENU_KEY='tsv-canonical-tab-menu-v1',WINDOW_PREFIX='tarasevych-tab:',VIEW_PREFIX='view:',TRANSIENT_TTL=4000,TAB_COOKIE='tsv_tab_ctx',OVERDRACHT_COOKIE='tsv_tab_overdracht',OVERDRACHT_TTL=60_000;
const MENU_IDS=['hub','ai','mail','cloud','github','crm','huis','mcp','tasks','calendar','notes','identity','api','admin','social']as const,PARENT_IDS=['hub','ai','mail','cloud','github','crm','huis','identity','api','admin','mcp']as const;
export type EcosystemSessionHint='known'|'out'|'';export type EcosystemSidebarState={open:boolean;submenu:string};
type ParentId=typeof PARENT_IDS[number];type ParsedWindow={id:string;session:EcosystemSessionHint;menu:string[];sidebar:'pinned'|'closed';submenu:string;transientTarget:string;transientAt:number;transientSubmenu:string};
const valid=(value:string)=>/^[a-f0-9]{48}$/.test(value),validSession=(value:string):value is Exclude<EcosystemSessionHint,''>=>value==='known'||value==='out',validMenu=(value:string)=>[...new Set(value.split(',').filter(item=>MENU_IDS.includes(item as typeof MENU_IDS[number])))],validParent=(value:string):value is ParentId=>PARENT_IDS.includes(value as ParentId),validSubmenu=(value:string)=>validParent(value)?value:'',create=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),value=>value.toString(16).padStart(2,'0')).join('');
const empty=():ParsedWindow=>({id:'',session:'',menu:[],sidebar:'closed',submenu:'',transientTarget:'',transientAt:0,transientSubmenu:''});
const leesSess=(k:string)=>{try{return typeof sessionStorage!=='undefined'?sessionStorage.getItem(k)||'':''}catch{return''}},schrijfSess=(k:string,v:string)=>{try{if(typeof sessionStorage!=='undefined')sessionStorage.setItem(k,v)}catch{}},vensterNaam=()=>typeof window!=='undefined'&&typeof window.name==='string'?window.name:'';
const isGedeeldDomein=()=>{try{const h=typeof location!=='undefined'?String(location.hostname||'').toLowerCase():'';return h==='tarasevych.com'||h.endsWith('.tarasevych.com')}catch{return false}};
const zetCookie=(naam:string,waarde:string,maxAge?:number)=>{
  try{
    if(typeof document==='undefined')return;
    const desc=Object.getOwnPropertyDescriptor(document,'cookie');
    if(desc&&'value' in desc&&desc.writable){
      const overig=String(document.cookie||'').split('; ').filter(s=>s&&!s.startsWith(`${naam}=`));
      if(waarde&&maxAge!==0)overig.push(`${naam}=${waarde}`);
      document.cookie=overig.join('; ');
      return;
    }
    const domein=isGedeeldDomein()?'; Domain=.tarasevych.com':'';
    const secure=typeof location!=='undefined'&&location.protocol==='http:'?'':'; Secure';
    const leeftijd=typeof maxAge==='number'?`; Max-Age=${maxAge}`:'';
    document.cookie=`${naam}=${waarde}; Path=/${leeftijd}; SameSite=Lax${secure}${domein}`;
  }catch{}
};
const leesCookie=(naam:string):string=>{
  try{
    if(typeof document==='undefined'||typeof document.cookie!=='string')return'';
    const deel=document.cookie.split('; ').find(s=>s.startsWith(`${naam}=`));
    return deel?decodeURIComponent(deel.slice(naam.length+1)):'';
  }catch{return''}
};
const leesOverdrachtTab=():string=>{
  const ruw=leesCookie(OVERDRACHT_COOKIE);
  if(!ruw)return'';
  const[id,t]=ruw.split('.');
  const tijd=Number(t||0);
  if(valid(id||'')&&Number.isFinite(tijd)&&Date.now()-tijd>=0&&Date.now()-tijd<=OVERDRACHT_TTL)return id;
  return'';
};
/* Staat er (nog) een «view:»-deel in window.name — ondergeschoven door een andere site, of achtergebleven van vóór de patch? */
const draagtView=()=>vensterNaam().startsWith(WINDOW_PREFIX)&&vensterNaam().split('|').some(item=>item.startsWith(VIEW_PREFIX));
const parsedWindow=():ParsedWindow=>{const wn=vensterNaam();if(!wn.startsWith(WINDOW_PREFIX))return empty();const[id,...parts]=wn.slice(WINDOW_PREFIX.length).split('|'),part=(prefix:string)=>(parts.find(item=>item.startsWith(prefix))||'').slice(prefix.length),session=part('session:'),sidebar=part('sidebar:')==='pinned'?'pinned':'closed',transientTarget=part('transient-target:'),transientAt=Number(part('transient-at:')||0);return{id:valid(id)?id:'',session:validSession(session)?session:'',menu:validMenu(part('menu:')),sidebar,submenu:sidebar==='pinned'?validSubmenu(part('submenu:')):'',transientTarget:validParent(transientTarget)?transientTarget:'',transientAt:Number.isFinite(transientAt)?transientAt:0,transientSubmenu:validSubmenu(part('transient-submenu:'))}};
const sharedMenu=()=>{const menu=readSharedPreferences().menu;return validMenu(Array.isArray(menu)?menu.join(','):'')},storedMenu=()=>{const local=validMenu(leesSess(MENU_KEY));return local.length?local:sharedMenu()};
const writeWindow=(state:ParsedWindow)=>{const menu=validMenu(state.menu.join(',')),parts=[`${WINDOW_PREFIX}${valid(state.id)?state.id:create()}`];if(state.session)parts.push(`session:${state.session}`);if(menu.length)parts.push(`menu:${menu.join(',')}`);parts.push(`sidebar:${state.sidebar}`);if(state.sidebar==='pinned'&&validSubmenu(state.submenu))parts.push(`submenu:${state.submenu}`);if(state.transientTarget&&state.transientAt>0){parts.push(`transient-target:${state.transientTarget}`,`transient-at:${state.transientAt}`);if(validSubmenu(state.transientSubmenu))parts.push(`transient-submenu:${state.transientSubmenu}`)}if(typeof window!=='undefined')window.name=parts.join('|')};
const ensureState=()=>{const current=parsedWindow();const overdracht=leesOverdrachtTab();if(current.id){/* interface-05: een «view:»-deel verdwijnt bij het eerste gebruik (writeWindow schrijft het nooit) */const actiefId=valid(overdracht)?overdracht:current.id;const bijgewerkt=actiefId!==current.id?{...current,id:actiefId}:current;if(draagtView()||actiefId!==current.id)writeWindow(bijgewerkt);schrijfSess(STORAGE_KEY,bijgewerkt.id);zetCookie(TAB_COOKIE,bijgewerkt.id);if(bijgewerkt.menu.length)schrijfSess(MENU_KEY,bijgewerkt.menu.join(','));return bijgewerkt}const stored=leesSess(STORAGE_KEY),cookieTab=leesCookie(TAB_COOKIE),gekozenId=valid(overdracht)?overdracht:valid(stored)?stored:valid(cookieTab)?cookieTab:create(),state={...empty(),id:gekozenId,menu:storedMenu()};schrijfSess(STORAGE_KEY,state.id);zetCookie(TAB_COOKIE,state.id);writeWindow(state);return state};
const updateWindow=(patch:Partial<ParsedWindow>)=>{const state={...ensureState(),...patch};writeWindow(state);return state};
export const bewaarTabOverdracht=(id?:string)=>{const tabId=id&&valid(id)?id:ensureState().id;zetCookie(TAB_COOKIE,tabId);zetCookie(OVERDRACHT_COOKIE,`${tabId}.${Date.now()}`,60)};
if(typeof window!=='undefined'&&typeof window.addEventListener==='function'){try{window.addEventListener('pagehide',()=>{const id=leesSess(STORAGE_KEY)||parsedWindow().id;if(valid(id))bewaarTabOverdracht(id)})}catch{}}
export const ecosystemTabContext=()=>ensureState().id;

export const ecosystemTabMenu=()=>{const state=ensureState();return state.menu.length?state.menu:storedMenu()};
/** interface-05: haalt een eventueel «view:»-deel uit window.name (ook als de tab-id nog niet nodig was). Leest het nooit. */
export const stripEcosystemTabView=()=>{try{if(draagtView())ensureState()}catch{}};
/* Hint over de sessie. PER TABBLAD in window.name (die kent ook 'out': afgemeld in DIT tabblad) en — sinds 20.10.2026 —
   positief ook PER APPARAAT in localStorage. Een nieuw tabblad heeft geen window.name en zag daardoor geen enkele hint:
   het eerste beeld werd dan het aanmeldscherm in plaats van «aan het kijken». Alleen 'known' gaat naar het apparaat;
   'out' blijft per tabblad, zodat afmelden in één tabblad de andere accounts van dit apparaat nooit als afgemeld toont. */
const SESSIE_HINT_SLEUTEL='tsv-sessie-hint-v1';
const apparaatHint=():EcosystemSessionHint=>{try{return localStorage.getItem(SESSIE_HINT_SLEUTEL)==='known'?'known':''}catch{return''}};
/** Alleen aanzetten; uitzetten gebeurt bewust met clearEcosystemDeviceSessionHint (geen enkel account meer in deze browser). */
const schrijfApparaatHint=(active:boolean)=>{try{if(active)localStorage.setItem(SESSIE_HINT_SLEUTEL,'known')}catch{}};
export const clearEcosystemDeviceSessionHint=()=>{try{localStorage.removeItem(SESSIE_HINT_SLEUTEL)}catch{}};
export const ecosystemSessionHint=():EcosystemSessionHint=>ensureState().session||apparaatHint();
export const ecosystemSessionLikely=()=>ecosystemSessionHint()==='known';
export const ecosystemSidebarState=():EcosystemSidebarState=>{const state=ensureState();return{open:state.sidebar==='pinned',submenu:state.submenu}};
export type EcosystemTransientSnapshot={open:boolean;inside:boolean;submenu:string};
let transientRuntime:EcosystemTransientSnapshot={open:false,inside:false,submenu:''};
export const reportEcosystemSidebarTransient=(open:boolean,inside:boolean,submenu='')=>{transientRuntime={open,inside,submenu:validSubmenu(submenu)}};
export const prepareEcosystemSidebarNavigation=(target:string,snapshot?:EcosystemTransientSnapshot)=>{bewaarTabOverdracht();const state=snapshot||transientRuntime;if(!state.open||!state.inside||!validParent(target))return false;updateWindow({transientTarget:target,transientAt:Date.now(),transientSubmenu:validSubmenu(state.submenu||target)});return true};
export const consumeEcosystemSidebarNavigation=(target:string)=>{const presentation=(window as Window&{__TSV_PRESENTATION__?:{sidebarTransient?:boolean;sidebarTransientTarget?:string;sidebarTransientSubmenu?:string}}).__TSV_PRESENTATION__;if(presentation?.sidebarTransient&&presentation.sidebarTransientTarget===target){presentation.sidebarTransient=false;return{open:true,submenu:validSubmenu(presentation.sidebarTransientSubmenu||target)}}const state=ensureState(),open=state.transientTarget===target&&Date.now()-state.transientAt>=0&&Date.now()-state.transientAt<=TRANSIENT_TTL;updateWindow({transientTarget:'',transientAt:0,transientSubmenu:''});return{open,submenu:open?validSubmenu(state.transientSubmenu||target):''}};
export const setEcosystemSidebarState=(open:boolean,submenu='')=>{reportEcosystemSidebarTransient(false,false,'');updateWindow({sidebar:open?'pinned':'closed',submenu:open?validSubmenu(submenu):'',transientTarget:'',transientAt:0,transientSubmenu:''})};
/* IDENTITEIT-015 (gastcodes e2e): хто чекає, доки стане відомо, чи є сесія (bootstrap). Wie wacht tot bekend is of er een sessie is. */
const sessieWachters=new Set<(hint:EcosystemSessionHint)=>void>();
export const wachtOpSessieHint=(ms=4000):Promise<EcosystemSessionHint>=>{const nu=ecosystemSessionHint();if(nu==='known'||nu==='out')return Promise.resolve(nu);return new Promise(klaar=>{const af=(hint:EcosystemSessionHint)=>{sessieWachters.delete(af);clearTimeout(t);klaar(hint)};const t=setTimeout(()=>af(ecosystemSessionHint()),ms);sessieWachters.add(af)})};
export const setEcosystemSessionLikely=(active:boolean)=>{schrijfApparaatHint(active);updateWindow({session:active?'known':'out'});for(const af of [...sessieWachters])af(active?'known':'out')};

export const setEcosystemTabMenu=(menu:string[])=>{const safe=validMenu(menu.join(','));sessionStorage.setItem(MENU_KEY,safe.join(','));writeSharedPreferences({menu:safe});updateWindow({menu:safe})};
