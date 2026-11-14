(()=>{
  const serviceIds=['hub','ai','mail','cloud','github','huis','identity','api','admin','mcp'];
  const publicServiceIds=['hub','ai','mail','cloud','github','huis','mcp'];
  const domains={hub:'hub.tarasevych.com',ai:'ai.tarasevych.com',mail:'mail.tarasevych.com',cloud:'cloud.tarasevych.com',github:'github.tarasevych.com',huis:'huis.tarasevych.com',identity:'id.tarasevych.com',api:'api.tarasevych.com',admin:'admin.tarasevych.com',mcp:'mcp.tarasevych.com'};
  const defaults={hub:'overview',ai:'workspace',mail:'inbox',cloud:'overview',github:'overview',huis:'overview',identity:'personalization',api:'access',admin:'overview',mcp:'overview'};
  const tabs={hub:['overview','recent','tasks','calendar','notes','zoek','photos'],ai:['workspace','agents','runs','workflows','verbindingen'],mail:['inbox','starred','snoozed','sent','drafts','archive','labels','accounts','local','unread','all','important','spam','trash','subscriptions','scheduled','settings','contacts'],cloud:['overview','files','shared','workspaces','capture','inbox','search','recent','calendar','photos','accounts','google','onedrive','dropbox'],github:['overview','repositories','code','issues','pulls','actions','releases','sync','projects','documentation','research','activity','accounts'],huis:['overview','rooms','devices','scenes','automations','security','energy','activity','integrations','assistant','settings','showroom','planner'],identity:['personalization','menu','themes','languages','widgets','sharing','identity','account','sessions','methods','security','recovery'],api:['verbindingen','vault','access','reconciliation'],admin:['overview','access','ai','contour','updates','apps','devices','sso','directories','roles','diagnostics','audit'],mcp:['overview','dashboard','services','tools','board','agents','apps','playground','traffic','connect','roadmap','download','verbindingen']};
  const isService=value=>serviceIds.includes(String(value||''));
  const serviceForHostname=(host=location.hostname)=>Object.entries(domains).find(([,value])=>value===String(host).toLowerCase())?.[0]||'';
  // Нідерландські slug у URL (Правило 0: жодних англіцизмів). Внутрішній id НЕ міняється — лише те, що видно в адресі.
  const TAB_SLUG={overview:'overzicht',tasks:'taken',calendar:'agenda',notes:'notities',workspace:'werkgebied',agents:'agenten',runs:'processen',workflows:'werkstromen',inbox:'postvak-in',starred:'met-ster',snoozed:'uitgesteld',sent:'verzonden',drafts:'concepten',labels:'etiketten',local:'prive',unread:'ongelezen',all:'alles',trash:'prullenbak',scheduled:'gepland',settings:'instellingen',subscriptions:'abonnementen',contacts:'contacten',archive:'archief',important:'belangrijk',workspaces:'werkruimtes',capture:'vastleggen',search:'zoeken',photos:'fotos',code:'code',issues:'vraagstukken',pulls:'samenvoegingen',actions:'werkstromen-ci',releases:'uitgaven',sync:'spiegel',projects:'projecten',research:'onderzoek',activity:'activiteit',documentation:'documentatie',themes:'themas',languages:'talen',widgets:'blokken',sharing:'delen',identity:'identiteit',sessions:'sessies',methods:'aanmeldmethoden',security:'beveiliging',recovery:'herstel',personalization:'personalisatie',vault:'kluis',access:'toegang',reconciliation:'afstemming',devices:'apparaten',directories:'mappen',roles:'rollen',diagnostics:'diagnostiek',services:'diensten',tools:'hulpmiddelen',board:'bord',playground:'zandbak',traffic:'verkeer',connect:'verbinden',roadmap:'routekaart',download:'downloaden',files:'bestanden',shared:'gedeeld',rooms:'kamers',scenes:'scenes',automations:'automatiseringen',energy:'energie',integrations:'integraties',assistant:'assistent',showroom:'showroom',planner:'planner'};
  const LEGACY_ALIAS={connections:'verbindingen',oauth:'access',webhooks:'access',events:'access',gebeurtenissen:'access',logs:'access',logboeken:'access',import:'access',importeren:'access'};
  const SLUG_TO_ID={};for(const k in TAB_SLUG)SLUG_TO_ID[TAB_SLUG[k]]=k;
  // slug/legacy/англ. id → внутрішній id
  const idForTab=v=>{const x=String(v||'');return SLUG_TO_ID[x]||LEGACY_ALIAS[x]||x;};
  // внутрішній id → нідерландський slug для URL
  const tabSlug=id=>TAB_SLUG[String(id||'')]||String(id||'');
  const aliasTab=idForTab;
  const safeTab=(service,value)=>{const v=idForTab(value);return tabs[service]?.includes(v)?v:defaults[service]||defaults.hub;};
  const pathParts=pathname=>String(pathname||'/').split('/').filter(Boolean).map(value=>decodeURIComponent(value));
  const resolve=(loc=location)=>{
    const host=String(loc.hostname||'').toLowerCase();
    const productionService=serviceForHostname(host);
    const query=new URLSearchParams(loc.search||'');
    const parts=pathParts(loc.pathname||'/');
    let service='hub',pathTab='';
    if(productionService){service=productionService;pathTab=parts[0]||''}
    const requestedTab=pathTab||query.get('tab')||'';
    const explicitLang=['uk','nl'].includes(query.get('lang')||'')?query.get('lang'):'';
    // Onbekend pad (19.10.2026): een eerste padsegment dat geen tabblad (of oud alias) van deze dienst is → 404-pagina in de app, geen stille terugval naar het standaardtabblad.
    const onbekend=Boolean(productionService)&&Boolean(pathTab)&&!(tabs[service]||[]).includes(idForTab(pathTab));
    return{service,tab:safeTab(service,requestedTab),lang:explicitLang,explicitLang,host,path:loc.pathname||'/',pathTab,production:Boolean(productionService),onbekend};
  };
  const canonicalUrl=(target,tab='',lang='uk',options={})=>{
    const service=isService(target)?target:'hub';
    const resolvedTab=safeTab(service,tab);
    const url=new URL(`https://${domains[service]}/`);
    if(options.explicitTab===true)url.pathname=`/${encodeURIComponent(tabSlug(resolvedTab))}`;
    return url.toString();
  };
  const persistLanguage=lang=>{
    if(lang!=='uk'&&lang!=='nl')return;
    let value={};
    try{const encoded=document.cookie.split('; ').find(item=>item.startsWith('tsv_ecosystem_preferences='))?.slice('tsv_ecosystem_preferences='.length)||'';if(encoded)value=JSON.parse(decodeURIComponent(encoded))}catch{}
    // Taal hangt aan het ACCOUNT (punt 2, 20.10.2026): zetten in het record van het account van DEZE dienst (accounts['<account>'].taal),
    // nooit meer als één waarde voor alle accounts. Een oude cookie (zonder versie 3) blijft zoals hij is; src/gedeelde-voorkeuren.ts
    // migreert hem naar het nu actieve account in de gebruikersruimte, zodat niets verloren gaat.
    const nu=Date.now();
    if(Number(value.versie)===3){
      const kaart=value.accountPerDienst||{};let account='anon';
      try{const hint=String(sessionStorage.getItem('tsv-weergave-account')||'');account=/^(anon|u-[a-f0-9]{8})$/.test(hint)?hint:String(kaart[serviceForHostname()]||'anon')}catch{account=String(kaart[serviceForHostname()]||'anon')}
      const accounts={...(value.accounts||{})};
      accounts[account]={...(accounts[account]||{}),versie:1,taal:lang,op:nu};
      value={...value,accounts,revisie:nu};
    }else value={...value,lang,revision:nu};
    document.cookie=`tsv_ecosystem_preferences=${encodeURIComponent(JSON.stringify(value))}; Path=/; Max-Age=31536000; SameSite=Lax; Secure; Domain=.tarasevych.com`;
  };
  const replaceLegacy=()=>{
    const hostService=serviceForHostname();
    if(!hostService)return false;
    const query=new URLSearchParams(location.search);
    if(hostService==='identity'&&((query.has('state')&&(query.has('code')||query.has('error')))||query.get('tab')==='authorize'))return false;
    const route=resolve();
    const requestedService=isService(query.get('service'))?query.get('service'):hostService;
    const queryTab=query.get('tab')||'';
    const pathId=idForTab(route.pathTab);const pathTab=requestedService===hostService&&tabs[requestedService].includes(pathId)?pathId:'';
    const queryId=idForTab(queryTab);const requestedTab=tabs[requestedService].includes(queryId)?queryId:pathTab;
    const explicitTab=Boolean(queryTab||pathTab);
    const requestedLang=['uk','nl'].includes(query.get('lang')||'')?query.get('lang'):'';
    if(requestedLang)persistLanguage(requestedLang);
    const target=new URL(canonicalUrl(requestedService,requestedTab,requestedLang||'uk',{explicitTab}));
    const subParts=pathParts(location.pathname||'/');if(requestedService==='cloud'&&requestedTab==='shared'&&subParts.length===2&&/^[A-Za-z0-9_-]{16,96}$/.test(subParts[1]))target.pathname=`/${encodeURIComponent(tabSlug('shared'))}/${encodeURIComponent(subParts[1])}`;
    for(const[key,value]of query.entries())if(!['service','tab','lang'].includes(key))target.searchParams.append(key,value);
    target.hash=location.hash;
    const noisy=query.has('service')||query.has('tab')||query.has('lang')||requestedService!==hostService;
    if(!noisy)return false;
    const current=`${location.origin}${location.pathname}${location.search}${location.hash}`;
    if(target.toString()===current)return false;
    document.documentElement.style.visibility='hidden';
    location.replace(target.toString());
    return true;
  };
  const faviconColors={hub:'#2f6f73',ai:'#6f46c1',mail:'#2563a8',cloud:'#3979b7',github:'#30363d',huis:'#a45a24',identity:'#6f355f',api:'#23766d',admin:'#5b6470',mcp:'#1f6b4a'},faviconGlyphs={hub:'<rect x="17" y="17" width="12" height="12" rx="2"/><rect x="35" y="17" width="12" height="12" rx="2"/><rect x="17" y="35" width="12" height="12" rx="2"/><rect x="35" y="35" width="12" height="12" rx="2"/>',ai:'<path d="M32 12l5 11 11 5-11 5-5 11-5-11-11-5 11-5 5-11z"/><path d="M47 42l2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4z"/>',mail:'<rect x="13" y="18" width="38" height="28" rx="4"/><path d="M15 21l17 13 17-13"/>',cloud:'<path d="M20 45h27a9 9 0 000-18 15 15 0 00-28-4 11 11 0 001 22z"/>',github:'<circle cx="22" cy="18" r="5"/><circle cx="22" cy="46" r="5"/><circle cx="45" cy="32" r="5"/><path d="M22 23v18M27 20c8 0 8 12 13 12"/>',huis:'<path d="M12 31l20-17 20 17v19H38V38H26v12H12z"/>',identity:'<circle cx="32" cy="23" r="8"/><path d="M18 49c2-10 8-15 14-15s12 5 14 15"/><path d="M48 18l6 3v7c0 5-2 9-6 12-4-3-6-7-6-12v-7z"/>',api:'<path d="M24 17c-6 0-7 4-7 9v2c0 3-2 4-5 4 3 0 5 1 5 4v2c0 5 1 9 7 9M40 17c6 0 7 4 7 9v2c0 3 2 4 5 4-3 0-5 1-5 4v2c0 5-1 9-7 9"/><circle cx="32" cy="32" r="3"/>',admin:'<path d="M17 20h30M17 32h30M17 44h30"/><circle cx="27" cy="20" r="4"/><circle cx="40" cy="32" r="4"/><circle cx="24" cy="44" r="4"/>',mcp:'<path d="M16 32h10M38 32h10"/><circle cx="32" cy="32" r="6"/><path d="M32 18v8M32 38v8"/>'};const faviconHref=service=>{const color=faviconColors[service]||faviconColors.hub,glyph=faviconGlyphs[service]||faviconGlyphs.hub,svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="${color}"/><g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;return`data:image/svg+xml,${encodeURIComponent(svg)}`},applyFavicon=(href,type,service,unread=null)=>{let links=[...document.querySelectorAll('link[rel~="icon"]')];if(!links.length){const link=document.createElement('link');link.rel='icon';document.head.appendChild(link);links=[link]}for(const link of links){link.href=href;link.type=type;link.dataset.canonicalServiceIcon=service;if(service==='mail'&&unread!==null)link.dataset.canonicalUnread=String(unread);else delete link.dataset.canonicalUnread}},setBaseFavicon=service=>applyFavicon(faviconHref(service),'image/svg+xml',service),drawMailFavicon=count=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');if(!ctx){setBaseFavicon('mail');return}ctx.fillStyle=faviconColors.mail;ctx.beginPath();ctx.arc(32,32,30,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.lineJoin='round';ctx.strokeRect(13,18,38,28);ctx.beginPath();ctx.moveTo(15,21);ctx.lineTo(32,34);ctx.lineTo(49,21);ctx.stroke();if(count>0){const label=count>99?'99+':String(count);ctx.fillStyle='#d9382e';ctx.beginPath();ctx.arc(50,14,13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=`700 ${label.length>2?10:13}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,50,14)}applyFavicon(canvas.toDataURL('image/png'),'image/png','mail',count)};let activeFaviconService=resolve().service,lastMailUnread=null;setBaseFavicon(activeFaviconService);const setMailUnread=value=>{if(activeFaviconService!=='mail')return;const next=value===null||value===undefined?null:Math.max(0,Math.floor(Number(value)||0));if(next===lastMailUnread)return;lastMailUnread=next;if(next===null)setBaseFavicon('mail');else drawMailFavicon(next)};window.addEventListener('tsv:mail-unread-count',event=>setMailUnread(event.detail?.count));window.addEventListener('popstate',()=>{const nextService=resolve().service;if(nextService===activeFaviconService)return;activeFaviconService=nextService;lastMailUnread=null;setBaseFavicon(nextService)});
  // Thema (zelfde regels als src/thema/kern.ts; eenheidstest «thema» vergelijkt beide): palet + modus + automatisch schakelen.
  const thema=(()=>{const RAD=Math.PI/180,UUR=/^([01]\d|2[0-3]):([0-5]\d)$/;
    const getal=(v,min,max)=>{const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?Math.round(n*10)/10:undefined};
    const normaalAuto=raw=>{const r=raw&&typeof raw==='object'?raw:{};const lat=getal(r.lat,-90,90),lon=getal(r.lon,-180,180),pt=Number(r.pauzeTot),pm=r.pauzeModus==='dark'?'dark':r.pauzeModus==='light'?'light':undefined;const a={soort:r.soort==='interval'?'interval':'zon',van:UUR.test(String(r.van))?String(r.van):'20:00',tot:UUR.test(String(r.tot))?String(r.tot):'07:00'};if(lat!==undefined&&lon!==undefined){a.lat=lat;a.lon=lon}if(Number.isFinite(pt)&&pt>0&&pm){a.pauzeTot=pt;a.pauzeModus=pm}return a};
    const zon=(dag,lat,lon)=>{const middag=new Date(dag.getFullYear(),dag.getMonth(),dag.getDate(),12,0,0,0).getTime(),jd=middag/86400000+2440587.5,n=Math.ceil(jd-2451545.0+0.0008),js=n-lon/360,M=(357.5291+0.98560028*js)%360,C=1.9148*Math.sin(M*RAD)+0.02*Math.sin(2*M*RAD)+0.0003*Math.sin(3*M*RAD),L=(M+C+180+102.9372)%360,tr=2451545.0+js+0.0053*Math.sin(M*RAD)-0.0069*Math.sin(2*L*RAD),sinD=Math.sin(L*RAD)*Math.sin(23.4397*RAD),cosD=Math.cos(Math.asin(sinD)),cosW=(Math.sin(-6*RAD)-Math.sin(lat*RAD)*sinD)/(Math.cos(lat*RAD)*cosD);if(cosW>1)return'nacht';if(cosW<-1)return'dag';const w=Math.acos(cosW)/RAD,ms=j=>Math.round((j-2440587.5)*86400000);return{op:ms(tr-w/360),onder:ms(tr+w/360)}};
    const middernacht=nu=>{const d=new Date(nu);return new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime()};
    const opUur=(nu,hhmm,dagen)=>{const d=new Date(nu),[h,m]=hhmm.split(':').map(Number);return new Date(d.getFullYear(),d.getMonth(),d.getDate()+dagen,h,m,0,0).getTime()};
    const zonderPauze=(a,nu)=>{if(a.soort==='interval'){if(a.van===a.tot)return{donker:false,volgende:middernacht(nu)};const g=[];for(const d of[-1,0,1,2])g.push({t:opUur(nu,a.van,d),donker:true},{t:opUur(nu,a.tot,d),donker:false});g.sort((x,y)=>x.t-y.t);let donker=false,volgende=middernacht(nu);for(const x of g){if(x.t<=nu)donker=x.donker;else{volgende=x.t;break}}return{donker,volgende}}const lat=a.lat??50.8,lon=a.lon??4.4,d=new Date(nu),v=zon(d,lat,lon);if(v==='nacht')return{donker:true,volgende:middernacht(nu)};if(v==='dag')return{donker:false,volgende:middernacht(nu)};if(nu<v.op)return{donker:true,volgende:v.op};if(nu<v.onder)return{donker:false,volgende:v.onder};const m=zon(new Date(d.getFullYear(),d.getMonth(),d.getDate()+1),lat,lon);return{donker:true,volgende:typeof m==='object'?m.op:middernacht(nu)}};
    const isModus=v=>v==='light'||v==='dark'||v==='device'||v==='auto',isPalet=v=>v==='grifel'||v==='puur'||v==='violet'||v==='kleur'||v==='maquette'||v==='klassiek-wit'||v==='klassiek-zwart';
    return(o)=>{const t=o.theme;let modus,palet;if(t==='plum-dark'||t==='plum-light'||t==='plum'){modus=t==='plum-dark'?'dark':'light';palet='violet'}else{modus=isModus(t)?t:'device';palet=isPalet(o.palet)?o.palet:'kleur'}if(palet==='violet'&&o.violetToegestaan===false)palet='grifel';if(palet==='klassiek-wit')return{donker:false,palet,presentatie:'light',volgende:null,gepauzeerd:false};if(palet==='klassiek-zwart')return{donker:true,palet,presentatie:'dark',volgende:null,gepauzeerd:false};let donker=false,volgende=null,gepauzeerd=false;if(modus==='dark')donker=true;else if(modus==='device')donker=Boolean(o.apparaatDonker);else if(modus==='auto'){const a=normaalAuto(o.auto);if(a.pauzeTot&&a.pauzeModus&&o.nu<a.pauzeTot){donker=a.pauzeModus==='dark';volgende=a.pauzeTot;gepauzeerd=true}else{const r=zonderPauze(a,o.nu);donker=r.donker;volgende=r.volgende}}return{donker,palet,presentatie:palet==='violet'?(donker?'plum-dark':'plum-light'):(donker?'dark':'light'),volgende,gepauzeerd}}})();
  window.__TSV_CANONICAL_SERVICE__={serviceIds,publicServiceIds,domains,defaults,tabs,isService,serviceForHostname,safeTab,resolve,canonicalUrl,replaceLegacy,thema,idForTab,tabSlug};
})();
