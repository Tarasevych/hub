import{readSharedPreferences,writeSharedPreferences}from'./gedeelde-voorkeuren';
const STORAGE_KEY='tsv-canonical-tab-v1',MENU_KEY='tsv-canonical-tab-menu-v1',WINDOW_PREFIX='tarasevych-tab:',MAX_VIEW_CACHE=260000,TRANSIENT_TTL=4000;
const MENU_IDS=['hub','ai','mail','cloud','github','huis','mcp','tasks','calendar','notes','identity','api','admin','social']as const,PARENT_IDS=['hub','ai','mail','cloud','github','huis','identity','api','admin','mcp']as const;
export type EcosystemSessionHint='known'|'out'|'';export type EcosystemSidebarState={open:boolean;submenu:string};
type ParentId=typeof PARENT_IDS[number];type ParsedWindow={id:string;session:EcosystemSessionHint;menu:string[];view:string;sidebar:'pinned'|'closed';submenu:string;transientTarget:string;transientAt:number;transientSubmenu:string};
const valid=(value:string)=>/^[a-f0-9]{48}$/.test(value),validSession=(value:string):value is Exclude<EcosystemSessionHint,''>=>value==='known'||value==='out',validMenu=(value:string)=>[...new Set(value.split(',').filter(item=>MENU_IDS.includes(item as typeof MENU_IDS[number])))],validParent=(value:string):value is ParentId=>PARENT_IDS.includes(value as ParentId),validSubmenu=(value:string)=>validParent(value)?value:'',safeView=(value:string)=>String(value||'').slice(0,MAX_VIEW_CACHE),create=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),value=>value.toString(16).padStart(2,'0')).join('');
const empty=():ParsedWindow=>({id:'',session:'',menu:[],view:'',sidebar:'closed',submenu:'',transientTarget:'',transientAt:0,transientSubmenu:''});
const parsedWindow=():ParsedWindow=>{if(!window.name.startsWith(WINDOW_PREFIX))return empty();const[id,...parts]=window.name.slice(WINDOW_PREFIX.length).split('|'),part=(prefix:string)=>(parts.find(item=>item.startsWith(prefix))||'').slice(prefix.length),session=part('session:'),sidebar=part('sidebar:')==='pinned'?'pinned':'closed',transientTarget=part('transient-target:'),transientAt=Number(part('transient-at:')||0);return{id:valid(id)?id:'',session:validSession(session)?session:'',menu:validMenu(part('menu:')),view:safeView(part('view:')),sidebar,submenu:sidebar==='pinned'?validSubmenu(part('submenu:')):'',transientTarget:validParent(transientTarget)?transientTarget:'',transientAt:Number.isFinite(transientAt)?transientAt:0,transientSubmenu:validSubmenu(part('transient-submenu:'))}};
const sharedMenu=()=>{const menu=readSharedPreferences().menu;return validMenu(Array.isArray(menu)?menu.join(','):'')},storedMenu=()=>{const local=validMenu(sessionStorage.getItem(MENU_KEY)||'');return local.length?local:sharedMenu()};
const writeWindow=(state:ParsedWindow)=>{const menu=validMenu(state.menu.join(',')),parts=[`${WINDOW_PREFIX}${valid(state.id)?state.id:create()}`];if(state.session)parts.push(`session:${state.session}`);if(menu.length)parts.push(`menu:${menu.join(',')}`);parts.push(`sidebar:${state.sidebar}`);if(state.sidebar==='pinned'&&validSubmenu(state.submenu))parts.push(`submenu:${state.submenu}`);if(state.transientTarget&&state.transientAt>0){parts.push(`transient-target:${state.transientTarget}`,`transient-at:${state.transientAt}`);if(validSubmenu(state.transientSubmenu))parts.push(`transient-submenu:${state.transientSubmenu}`)}if(state.view)parts.push(`view:${safeView(state.view)}`);window.name=parts.join('|')};
const ensureState=()=>{const current=parsedWindow();if(current.id){sessionStorage.setItem(STORAGE_KEY,current.id);if(current.menu.length)sessionStorage.setItem(MENU_KEY,current.menu.join(','));return current}const stored=sessionStorage.getItem(STORAGE_KEY)||'',state={...empty(),id:valid(stored)?stored:create(),menu:storedMenu()};sessionStorage.setItem(STORAGE_KEY,state.id);writeWindow(state);return state};
const updateWindow=(patch:Partial<ParsedWindow>)=>{const state={...ensureState(),...patch};writeWindow(state);return state};
export const ecosystemTabContext=()=>ensureState().id;

export const ecosystemTabMenu=()=>{const state=ensureState();return state.menu.length?state.menu:storedMenu()};
export const ecosystemTabViewCache=()=>ensureState().view;
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
export const prepareEcosystemSidebarNavigation=(target:string,snapshot?:EcosystemTransientSnapshot)=>{const state=snapshot||transientRuntime;if(!state.open||!state.inside||!validParent(target))return false;updateWindow({transientTarget:target,transientAt:Date.now(),transientSubmenu:validSubmenu(state.submenu||target)});return true};
export const consumeEcosystemSidebarNavigation=(target:string)=>{const presentation=(window as Window&{__TSV_PRESENTATION__?:{sidebarTransient?:boolean;sidebarTransientTarget?:string;sidebarTransientSubmenu?:string}}).__TSV_PRESENTATION__;if(presentation?.sidebarTransient&&presentation.sidebarTransientTarget===target){presentation.sidebarTransient=false;return{open:true,submenu:validSubmenu(presentation.sidebarTransientSubmenu||target)}}const state=ensureState(),open=state.transientTarget===target&&Date.now()-state.transientAt>=0&&Date.now()-state.transientAt<=TRANSIENT_TTL;updateWindow({transientTarget:'',transientAt:0,transientSubmenu:''});return{open,submenu:open?validSubmenu(state.transientSubmenu||target):''}};
export const setEcosystemSidebarState=(open:boolean,submenu='')=>{reportEcosystemSidebarTransient(false,false,'');updateWindow({sidebar:open?'pinned':'closed',submenu:open?validSubmenu(submenu):'',transientTarget:'',transientAt:0,transientSubmenu:''})};
export const setEcosystemSessionLikely=(active:boolean)=>{schrijfApparaatHint(active);updateWindow({session:active?'known':'out'})};

export const setEcosystemTabMenu=(menu:string[])=>{const safe=validMenu(menu.join(','));sessionStorage.setItem(MENU_KEY,safe.join(','));writeSharedPreferences({menu:safe});updateWindow({menu:safe})};
export const setEcosystemTabViewCache=(view:string)=>{updateWindow({view:safeView(view)})};
