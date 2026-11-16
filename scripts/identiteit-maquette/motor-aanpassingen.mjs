// Точкові правки двигуна «Макет» після збирання: макет один в один, плюс стик із сайтом — справжні панелі в згортаному блоці
// «Чинні налаштування», смуга сервісів веде на справжні сервіси, адресу змінює застосунок, прибирання слухачів, пороги ширини.
// De puntsgewijze aanpassingen van de motor: het ontwerp één op één, plus de aansluiting op de site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const WORTEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const f = path.join(WORTEL, 'src/identiteit/maquette/') + 'maquette-motor.ts';
let s = fs.readFileSync(f, 'utf8');
const drempels = JSON.parse(fs.readFileSync(path.join(WORTEL, 'src/identiteit/maquette/') + 'maquette-stijlen-drempels.json', 'utf8'));
const v = (a, b) => { if (!s.includes(a)) throw new Error('не знайдено: ' + a.slice(0, 80)); s = s.replace(a, b); };

// 1. Вподобання: мова й тема — від сайту, не з макета.
v(`  // Version 32 stored icons as an exclusive style. Migrate without losing the`,
`  // САЙТ: мову й тему визначає сайт; у макеті вони були власними перемикачами.
  preferences.lang=opties.lang;
  preferences.theme=opties.licht?"light":"dark";
  // Version 32 stored icons as an exclusive style. Migrate without losing the`);

// 2. Елементи макета лишаються один в один; під ними — згортаний блок «Чинні налаштування» з гніздом .mq-echt, у яке застосунок
//    монтує справжню панель розділу (чинні дії й права). Відкриті блоки пам'ятаємо, бо картки перемальовуються рядком HTML.
v(`  function directSettings(s){
    if(!directSettingsSections.has(s.id))return "";`,
`  // САЙТ: блок справжніх налаштувань у стилі «Можливостей для доопрацювання» макета; гніздо .mq-echt заповнює застосунок.
  const openeЧинні=new Set();
  function tekenЧинні(id){
    const nl=preferences.lang==="nl";
    const kop=nl?"Huidige instellingen":"Чинні налаштування";
    const uitleg=nl?"De echte instellingen van uw account: wijzigingen hier gelden meteen en volgen uw rechten.":"Справжні налаштування вашого облікового запису: зміни тут діють одразу й за вашими правами.";
    return '<details class="future-section mq-echt-blok" data-echt-blok="'+id+'"'+(openeЧинні.has(id)?' open':'')+'>'+
      '<summary class="future-section-head"><span class="future-section-flower" aria-hidden="true">⚙</span><div class="future-section-copy"><strong>'+kop+'</strong><p>'+uitleg+'</p></div><span class="future-section-chevron" aria-hidden="true">'+chevronIcon+'</span></summary>'+
      '<div class="future-section-content"><div class="mq-echt" data-echt="'+id+'"></div></div></details>';
  }
  function directSettings(s){
    if(!directSettingsSections.has(s.id))return "";`);
v(`      directSettings(s)+
      (!expandable?tekenМайбутніМожливості(s.id):'')+`,
`      directSettings(s)+
      (!expandable?tekenЧинні(s.id)+tekenМайбутніМожливості(s.id):'')+ // САЙТ: справжня панель під елементами макета`);
v(`      '</div>'+tekenМайбутніМожливості(id);
    if(selectedInlineOptions.has(id))markInlineOption(id,selectedInlineOptions.get(id),false);`,
`      '</div>'+tekenЧинні(id)+tekenМайбутніМожливості(id); // САЙТ: справжня панель під елементами макета
    if(selectedInlineOptions.has(id))markInlineOption(id,selectedInlineOptions.get(id),false);`);
v(`    if(newlyOpened){panel.hidden=false;renderInlinePanel(id);requestAnimationFrame(()=>panel.classList.add('entered'));}`,
`    if(newlyOpened){panel.hidden=false;renderInlinePanel(id);opties.bijOpenen(id);requestAnimationFrame(()=>panel.classList.add('entered'));}`);

// 2б. Векторні шеврони замість сирих типографічних символів ⌄ і ⌃ у групах реєстру та кнопці згортання розділу.
v(`<span class="register-chevron" aria-hidden="true">⌄</span>`,
  `<span class="register-chevron" aria-hidden="true"><svg class="expand-chevron" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7.5 5 5 5-5"/></svg></span>`);
v(`<button class="inline-close-button" data-close-inline="'+id+'" aria-label="'+t.collapseSection+'">'+t.collapseSection+' <span>⌃</span></button>`,
  `<button class="inline-close-button" data-close-inline="'+id+'" aria-label="'+t.collapseSection+'">'+t.collapseSection+' <span class="inline-close-chevron" aria-hidden="true">'+chevronIcon+'</span></button>`);

// 3. Перехід до розділу повідомляє застосунок (адреса), крім переходу, що прийшов від самого застосунку.
v(`  function jump(id){
    closeHorizontalNavMenu();`,
`  function jump(id,stil=false){
    if(!stil&&sections.some(s=>s.id===id))opties.bijKies(id); // САЙТ: адресу сторінки змінює застосунок
    closeHorizontalNavMenu();`);

// 4. Діалог світлини: правдивий стан без фото, перевірка https:-адрес як у normalizeAvatarUrl, перехід до розділу «Акаунт» та меню облікового запису сайту.
v(`  const дозволенаСвітлина=(значення)=>{
    if(typeof значення!=="string"||!значення.trim())return "";
    // У чинному застосунку власне фото може бути збережене як зображення всередині даних акаунта.
    if(/^data:image\\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(значення)&&значення.length<=340000)return значення;
    try{
      const адреса=new URL(значення,location.href);
      const вузол=адреса.hostname.toLowerCase();
      return адреса.protocol==="https:"&&(вузол==="lh3.googleusercontent.com"||вузол.endsWith(".googleusercontent.com"))?адреса.href:"";
    }catch{return "";}
  };
  const світлинаПрофілю={
    імʼя:даніВласника?.bevestigd===true&&typeof даніВласника.naam==="string"?даніВласника.naam.trim():"",
    адреса:даніВласника?.bevestigd===true?дозволенаСвітлина(даніВласника.foto):"",
    джерело:даніВласника?.bevestigd===true?"акаунт":"немає",
    місцеваАдреса:""
  };

  // Під час переходу між обліковими записами застосунок має передавати новий стан.
  // Джерело оновлення — лише власний код авторизованої сторінки, не повідомлення з інших сайтів.
  function прийнятиФотоПрофілю(новийПрофіль){
    if(світлинаПрофілю.місцеваАдреса)URL.revokeObjectURL(світлинаПрофілю.місцеваАдреса);
    світлинаПрофілю.місцеваАдреса="";
    світлинаПрофілю.імʼя=новийПрофіль?.bevestigd===true&&typeof новийПрофіль.naam==="string"?новийПрофіль.naam.trim():"";
    світлинаПрофілю.адреса=новийПрофіль?.bevestigd===true?дозволенаСвітлина(новийПрофіль.foto):"";
    світлинаПрофілю.джерело=новийПрофіль?.bevestigd===true?"акаунт":"немає";
    оновитиФотоПрофілю();
  }`,
`  const дозволенаСвітлина=(значення)=>{
    if(typeof значення!=="string"||!значення.trim())return "";
    const чисте=значення.trim();
    // У чинному застосунку власне фото може бути збережене як зображення всередині даних акаунта.
    if(/^data:image\\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(чисте)&&чисте.length<=340000)return чисте;
    if(чисте.length>1024)return "";
    try{
      const адреса=new URL(чисте);
      if(адреса.protocol!=="https:"||адреса.username||адреса.password)return "";
      адреса.hash="";
      return адреса.href;
    }catch{return "";}
  };
  const початковаАдреса=даніВласника?.bevestigd===true?дозволенаСвітлина(даніВласника.foto):"";
  const світлинаПрофілю={
    імʼя:даніВласника?.bevestigd===true&&typeof даніВласника.naam==="string"?даніВласника.naam.trim():"",
    адреса:початковаАдреса,
    джерело:даніВласника?.bevestigd===true?(початковаАдреса?"акаунт":"безФото"):"немає",
    місцеваАдреса:""
  };

  // Під час переходу між обліковими записами застосунок має передавати новий стан.
  // Джерело оновлення — лише власний код авторизованої сторінки, не повідомлення з інших сайтів.
  function прийнятиФотоПрофілю(новийПрофіль){
    if(світлинаПрофілю.місцеваАдреса)URL.revokeObjectURL(світлинаПрофілю.місцеваАдреса);
    світлинаПрофілю.місцеваАдреса="";
    світлинаПрофілю.імʼя=новийПрофіль?.bevestigd===true&&typeof новийПрофіль.naam==="string"?новийПрофіль.naam.trim():"";
    const новаАдреса=новийПрофіль?.bevestigd===true?дозволенаСвітлина(новийПрофіль.foto):"";
    світлинаПрофілю.адреса=новаАдреса;
    світлинаПрофілю.джерело=новийПрофіль?.bevestigd===true?(новаАдреса?"акаунт":"безФото"):"немає";
    оновитиФотоПрофілю();
  }`);
v(`      акаунт:["Світлина отримана з облікового запису","Foto ontvangen uit het account","Зображення надане авторизованим застосунком. У цьому макеті його можна лише переглядати.","De aangemelde toepassing heeft de foto aangeleverd. Dit ontwerp toont haar alleen."],`,
`      акаунт:["Світлина отримана з облікового запису","Foto ontvangen uit het account","Зображення надане авторизованим застосунком. Змінити або прибрати світлину можна в розділі «Акаунт».","De aangemelde toepassing heeft de foto aangeleverd. U kunt de foto wijzigen of verwijderen bij «Account»."],
      безФото:["Світлину профілю ще не встановлено","Nog geen profielfoto ingesteld","Обліковий запис підключено, але власну чи сервісну світлину не передано. Додати її можна в розділі «Акаунт».","Het account is verbonden, maar er is nog geen profielfoto ingesteld. U kunt er een kiezen bij «Account»."],`);
v(`  byId("profilePhotoFile").addEventListener("change",подія=>{`, `  byId("profilePhotoFile")?.addEventListener("change",подія=>{`);
v(`    byId("profilePhotoPickLabel").textContent=перекладПрофілю("Обрати свою світлину для макета","Eigen foto voor het ontwerp kiezen");`,
`    byId("profilePhotoPickLabel").textContent=перекладПрофілю("Змінити світлину — розділ «Акаунт»","Foto wijzigen — onderdeel «Account»"); // САЙТ
    byId("profilePhotoAccount").textContent=перекладПрофілю("Обліковий запис, інші акаунти, вихід","Account, andere accounts, afmelden");`);
v(`    if(подія.target.closest("[data-close-profile-photo]")||подія.target===діалог)діалог.close();
  });`,
`    if(подія.target.closest("[data-close-profile-photo]")||подія.target===діалог)діалог.close();
    // САЙТ: дії діалогу світлини — справжній розділ «Акаунт» або меню облікового запису сайту.
    const actie=подія.target.closest("[data-echt-actie]")?.dataset.echtActie;
    if(actie){діалог.close();if(actie==="account-foto")gaNaar("account",true);else if(actie==="account-menu")opties.bijAccountMenu();}
  });`);

// 4б. Смуга сервісів макета веде на справжні сервіси сайту (у макеті показувала лише підказку «переходи не підключені»).
v(`  root.querySelectorAll(".app-icon:not(.theme-button)").forEach(el=>el.addEventListener("click",()=>{
    showToast(ui().navDemoToast);
  }));`,
`  root.querySelectorAll(".app-icon:not(.theme-button)").forEach(el=>el.addEventListener("click",()=>{
    // САЙТ: активна кнопка (Налаштування) веде вгору сторінки, решта — до справжніх сервісів через застосунок.
    if(el.classList.contains("active")||!el.dataset.dienst)jump("intro");else opties.bijDienst(el.dataset.dienst);
  }));`);

// 4в. Розмежування внутрішнього дороговказу сторінки (#mqSectieBalk) і головного гамбургера сайту; єдиний загальносайтовий пошук (tsv:zoek-palet).
v(`  function placeAdaptiveNavToggle(){
    // Keep the hamburger on the same edge as the temporary side drawer.
    // Moving the existing node preserves its event listeners and focus state.
    const onRight=preferences.position==="right";
    const host=root.querySelector(onRight?".top-actions":".topbar-start");
    if(adaptiveNavToggle.parentElement!==host){
      if(onRight)host.append(adaptiveNavToggle);
      else host.prepend(adaptiveNavToggle);
    }
  }`,
`  function placeAdaptiveNavToggle(){
    const balk=byId("mqSectieBalk");
    if(balk)balk.dataset.zijde=preferences.position==="right"?"right":"left";
  }`);
v(`    adaptiveNavToggle.setAttribute("aria-label",preferences.lang==="nl"?(visible?"Navigatie sluiten":"Navigatie openen"):(visible?"Закрити навігацію":"Відкрити навігацію"));`,
`    adaptiveNavToggle.setAttribute("aria-label",preferences.lang==="nl"?(visible?"Pagina-onderdelen sluiten":"Pagina-onderdelen openen"):(visible?"Закрити розділи сторінки":"Відкрити розділи сторінки"));`);
v(`    write(".search-action span",t.quickJump);`,
`    write(".search-action span",preferences.lang==="nl"?"Zoeken in «Mijn Ruimte»…":"Пошук у «Мій простір»…");
    write("#mqSectieNaam",preferences.lang==="nl"?"Onderdelen":"Розділи");
    const zoekKnop=byId("openSearch");if(zoekKnop){const zl=preferences.lang==="nl"?"Zoeken in «Mijn Ruimte» (Ctrl K)":"Пошук у «Мій простір» (Ctrl K)";zoekKnop.setAttribute("aria-label",zl);zoekKnop.title=zl;}
    const posKnop=byId("mqSectiePositie");if(posKnop){const pl=preferences.lang==="nl"?"Positie van paginanavigatie":"Розташування навігації сторінки";posKnop.setAttribute("aria-label",pl);posKnop.title=pl;}`);
v(`  byId("heroNavSettings").addEventListener("click",toggleNavSettings);`,
`  byId("heroNavSettings").addEventListener("click",toggleNavSettings);
  byId("mqSectiePositie")?.addEventListener("click",e=>{e.stopPropagation();toggleNavSettings();});`);
v(`    if(!target){if(!e.target.closest("#navSettings,#railConfig,#heroNavSettings"))closeNavSettings();return;}`,
`    if(!target){if(!e.target.closest("#navSettings,#railConfig,#heroNavSettings,#mqSectiePositie"))closeNavSettings();return;}`);
// Лівий край екрана в режимі шухляди сайту належить свайпу головного меню платформи.
v(`    const fromEdge=!open&&event.clientX>=edgeRect.left-5&&event.clientX<=edgeRect.right+5&&`,
`    const siteLade=Boolean(root.closest(".canonical-chrome")?.classList.contains("sidebar-drawer-mode"));
    const fromEdge=!open&&(right||!siteLade)&&event.clientX>=edgeRect.left-5&&event.clientX<=edgeRect.right+5&&`);
// Пошук у шапці макета відкриває загальносайтовий пошук (tsv:zoek-palet); Ctrl+K також належить загальносайтовому пошуку без перехоплення.
v(`  byId("openSearch").addEventListener("click",openSearch);`,
`  byId("openSearch").addEventListener("click",()=>{window.dispatchEvent(new CustomEvent("tsv:zoek-palet"));});`);
v(`  luister(doc,"keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();searchOverlay.hidden?openSearch():closeSearch();}
    if(e.key==="Escape"){
      const closingAdaptiveNav=body.classList.contains("rail-smart-open");
      closeSearch();closeNavSettings();closeHorizontalNavMenu(true);setAdaptiveNavOpen(false);
      if(closingAdaptiveNav)adaptiveNavToggle.focus({preventScroll:true});
      if(e.target.closest('.section-inline-settings'))closeInlineSettings(e.target.closest('.section-inline-settings').dataset.inlineSection);
    }
  });`,
`  luister(doc,"keydown",e=>{
    if(e.key==="Escape"){
      const closingAdaptiveNav=body.classList.contains("rail-smart-open");
      closeSearch();closeNavSettings();closeHorizontalNavMenu(true);setAdaptiveNavOpen(false);
      if(closingAdaptiveNav)adaptiveNavToggle.focus({preventScroll:true});
      if(e.target?.closest?.('.section-inline-settings'))closeInlineSettings(e.target.closest('.section-inline-settings').dataset.inlineSection);
    }
  });`);

// 5. Спостерігачі й таймери прибираються разом із компонентом; пороги ширини та зсуви від справжнього головного меню сайту й підсмуги розділів.
v(`  if(typeof ResizeObserver!=="undefined")new ResizeObserver(()=>requestAnimationFrame(updatePillDimensions)).observe(byId("anchorRail"));`,
`  if(typeof ResizeObserver!=="undefined"){const ro=new ResizeObserver(()=>requestAnimationFrame(updatePillDimensions));ro.observe(byId("anchorRail"));luisteraars.push(()=>ro.disconnect());}
  // САЙТ: пороги ширини макета (@media) переведено на класи кореня за шириною робочої області (не вікна).
  // Зсуви закріплених елементів: відступ робочої області від справжнього головного меню сайту (--mq-links, --mq-rechts, --mq-onder, --mq-site) і висота підсмуги розділів (--mq-boven).
  const DREMPELS=${JSON.stringify(drempels)};
  const chrome=root.closest(".canonical-chrome");
  function zetMaten(){
    const b=breed();
    for(const n of DREMPELS){root.classList.toggle("bp-max-"+n,b<=n);root.classList.toggle("bp-min-"+n,b>=n);}
    const stijl=werkvlak?getComputedStyle(werkvlak):null;
    const maat=n=>stijl?parseFloat(stijl[n])||0:0;
    const rail=root.querySelector(".app-rail");
    const railBreed=rail&&getComputedStyle(rail).display!=="none"?rail.offsetWidth:0;
    const links=maat("paddingLeft")+railBreed, site=maat("paddingTop");
    const planck=root.querySelector(".topbar")?.offsetHeight||0;
    const sectieBalkEl=byId("mqSectieBalk");
    const sectieBalk=sectieBalkEl&&getComputedStyle(sectieBalkEl).display!=="none"?sectieBalkEl.offsetHeight:0;
    root.style.setProperty("--mq-links",links+"px");
    root.style.setProperty("--mq-site-links",maat("paddingLeft")+"px");
    root.style.setProperty("--mq-rechts",maat("paddingRight")+"px");
    root.style.setProperty("--mq-onder",maat("paddingBottom")+"px");
    root.style.setProperty("--mq-site",site+"px");
    root.style.setProperty("--mq-topbar",planck+"px");
    root.style.setProperty("--mq-boven",(site+planck+sectieBalk)+"px");
    if(rail)rail.style.left=maat("paddingLeft")+"px";
  }
  zetMaten();
  if(typeof ResizeObserver!=="undefined"){const ro2=new ResizeObserver(()=>{zetMaten();requestAnimationFrame(updatePillDimensions);});ro2.observe(root);if(werkvlak)ro2.observe(werkvlak);luisteraars.push(()=>ro2.disconnect());}
  if(chrome&&typeof MutationObserver!=="undefined"){const mo=new MutationObserver(()=>{zetMaten();requestAnimationFrame(updatePillDimensions);});mo.observe(chrome,{attributes:true,attributeFilter:["class","data-dock"]});luisteraars.push(()=>mo.disconnect());}
  luisteraars.push(()=>{cancelRailAutoCollapse();clearTimeout(showToast.timer);});
  // САЙТ: відкриті блоки «Чинні налаштування» пам'ятаємо між перемальовуваннями; відкриття монтує справжню панель.
  luister(root,"toggle",e=>{
    const blok=e.target;
    if(!(blok instanceof HTMLElement)||!blok.classList.contains("mq-echt-blok"))return;
    const id=blok.dataset.echtBlok;
    if(blok.open){openeЧинні.add(id);opties.bijOpenen(id);}else openeЧинні.delete(id);
  },true);`);
v(`  },{threshold:.06,rootMargin:"0px 0px 40px 0px"});
  renderAll();`,
`  },{threshold:.06,rootMargin:"0px 0px 40px 0px"});
  luisteraars.push(()=>revealObserver.disconnect());
  renderAll();
  zetMaten();`);
// Перехід від застосунку (адреса, меню облікового запису): показати розділ і розгорнути його справжні налаштування.
v(`    ga(id, open) { jump(id); if (open) openInlineSettings(id); },`,
`    ga(id, open) { gaNaar(id, open); },
    direct: [...directSettingsSections],`);
v(`  function jump(id,stil=false){`,
`  function gaNaar(id,open){
    if(!sections.some(s=>s.id===id)){jump(id,true);return;}
    if(open){
      openeЧинні.add(id);
      if(!directSettingsSections.has(id))openInlineSettings(id);
      const blok=root.querySelector('.mq-echt-blok[data-echt-blok="'+id+'"]');
      if(blok&&!blok.open)blok.open=true;
    }
    jump(id,true);
  }
  function jump(id,stil=false){`);
v(`export type Maquette = { stop: () => void; ga: (id: string, open?: boolean) => void;`, `export type Maquette = { stop: () => void; direct: string[]; ga: (id: string, open?: boolean) => void;`);

// 6. Після кожного перемальовування карток застосунок знову знаходить гнізда (картки будуються заново рядком HTML).
v(`    оновитиФотоПрофілю();
    requestAnimationFrame(updatePillDimensions);
  }

  function setPosition(position){`,
`    оновитиФотоПрофілю();
    requestAnimationFrame(updatePillDimensions);
    opties.bijRender(); // САЙТ: гнізда справжніх панелей створено заново — застосунок монтує їх знову
  }

  function setPosition(position){`);
v(`  /** Розділ розгорнуто: сайт монтує справжню панель у гніздо. */
  bijOpenen: (id: string) => void;`,
`  /** Розділ або блок «Чинні налаштування» розгорнуто: сайт монтує справжню панель у гніздо. */
  bijOpenen: (id: string) => void;
  /** Картки перемальовано (мова, повторне малювання): гнізда .mq-echt створено заново. */
  bijRender: () => void;
  /** Кнопка смуги сервісів: перехід до справжнього сервісу сайту (hub, ai, mail, cloud, github). */
  bijDienst: (id: string) => void;
  /** Діалог світлини: відкрити меню облікового запису сайту (інші акаунти, вихід). */
  bijAccountMenu: () => void;`);

// IDENTITEIT-011. Демо-елементи над справжньою панеллю. У розділах облікового запису (доступ, акаунт, сесії, вхід, безпека, відновлення)
// макетні перемикачі й кнопки нічого не змінювали, хоча стояли поруч зі справжніми. Тепер кожен такий елемент чесно позначено
// «Приклад вигляду» і він відкриває справжнє налаштування. Вибір теми й «Додати віджет» теж ведуть до справжніх місць.
// У візуальних розділах (персоналізація, меню, мови) прев'ю лишається: воно показує вигляд, а не змінює обліковий запис.
// Demo-elementen boven het echte paneel: in accountonderdelen gemarkeerd als «Voorbeeld» en een knop naar de echte instelling.
v(`  function drawerControl(control,i,sectionId){
    const key=sectionId+"-"+i,type=control.type,t=ui();`,
`  const демоДоСайту={melding:"#melding-modus",sharing:".settings-sharing",account:"",sessions:"",methods:"#aanmeldmethoden-google",security:"#aanmeldmethoden-2fa",recovery:"#aanmeldmethoden-herstel",identities:""};
  const демоТипи=new Set(["toggle","action","profile","export","choice","range","info","warning"]);
  function чеснийЕлемент(control,i,sectionId,ціль){
    const nl=preferences.lang==="nl";
    const підказка=nl?"Dit is een voorbeeld uit het ontwerp. De knop opent de echte instelling, waar wijzigingen meteen gelden.":"Це приклад із макета. Кнопка відкриває справжнє налаштування, де зміни діють одразу.";
    return '<div class="drawer-control-card control-'+control.type+' mq-demo-eerlijk">'+
      '<div class="drawer-control-top"><span class="drawer-control-glyph">'+optionSvg(sectionId,i)+'</span><div class="drawer-control-copy"><strong>'+control.label+' <span class="mq-demo-label">'+(nl?"Voorbeeld":"Приклад вигляду")+'</span></strong><p>'+control.note+'</p></div>'+
      '<button type="button" class="future-option-open mq-demo-open" data-kaart-ga="'+escapeMarkup(sectionId+"|"+ціль)+'" title="'+escapeMarkup(підказка)+'">'+(nl?"Echte instelling":"Справжнє налаштування")+'</button></div></div>';
  }
  function drawerControl(control,i,sectionId){
    if(Object.prototype.hasOwnProperty.call(демоДоСайту,sectionId)&&демоТипи.has(control.type))return чеснийЕлемент(control,i,sectionId,демоДоСайту[sectionId]);
    if(sectionId==="themes"&&control.type==="theme")return чеснийЕлемент({...control,type:"theme"},i,sectionId,"#thema-modus-kop");
    if(sectionId==="widgets"&&control.type==="action")return чеснийЕлемент(control,i,sectionId,".settings-form");
    const key=sectionId+"-"+i,type=control.type,t=ui();`);

// IDENTITEIT-011. Жива карта: рядок «Працює · Відкрити» розгортає розділ і його «Чинні налаштування», чекає, доки застосунок
// змонтує справжню панель, і веде до потрібного місця (розгортає вкладені <details>, прокручує, ставить фокус, коротко підсвічує).
// De levende kaart: «Werkt · Openen» opent het onderdeel en de echte instellingen en gaat naar de juiste plek in het paneel.
v(`  function gaNaar(id,open){`,
`  function відкритиНаСайті(розділ,ціль){
    const id=розділ==="identity"?"identities":розділ;
    if(!sections.some(s=>s.id===id))return;
    gaNaar(id,true);
    opties.bijOpenen(id);
    if(!ціль)return;
    const рух=matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth";
    let спроби=0;
    const шукати=()=>{
      const гніздо=root.querySelector('.mq-echt[data-echt="'+id+'"]');
      let доціль=null;
      try{доціль=гніздо?гніздо.querySelector(ціль):null;}catch{доціль=null;}
      // Панель монтується асинхронно (портал React після bijOpenen): чекаємо до ~3 с.
      if(!доціль){if(++спроби<50)setTimeout(шукати,60);return;}
      for(let d=доціль.closest("details");d;d=d.parentElement?d.parentElement.closest("details"):null)if(!d.open)d.open=true;
      доціль.scrollIntoView({behavior:рух,block:"start"});
      const фокус=доціль.matches("summary,button,a,input,select,textarea")?доціль:(доціль.querySelector(":scope > summary")||доціль);
      if(фокус===доціль&&!доціль.hasAttribute("tabindex")&&!доціль.matches("summary,button,a,input,select,textarea"))доціль.setAttribute("tabindex","-1");
      try{фокус.focus({preventScroll:true});}catch{}
      доціль.classList.add("mq-kaart-doel");
      setTimeout(()=>доціль.classList.remove("mq-kaart-doel"),1800);
    };
    setTimeout(шукати,80);
  }
  function gaNaar(id,open){`);

// IDENTITEIT-015 (крок «vormgeving»). Демо-елементи «Макета», що виглядали справжніми, під'єднано до СПРАВЖНІХ налаштувань сайту
// (обліковий запис): стиль піктограм, щільність, рух, акцент, виразність ефектів, положення й поведінка меню, мова. Там, де налаштування
// сайту не має сенсу (підсвічування активного розділу, підказки, загальний вимикач віджетів), — «Приклад вигляду» з поясненням і
// переходом до справжнього місця; «Активний профіль» отримав справжній тумблер технічного простору.
// De demo-elementen zijn gekoppeld aan de echte instellingen van de site; waar dat geen zin heeft: «Voorbeeld» met uitleg en een knop.
v(`  bijAccountMenu: () => void;`,
`  bijAccountMenu: () => void;
  /** IDENTITEIT-015: справжні налаштування сайту для елементів макета (обліковий запис). Echte instellingen van de site. */
  weergave?: MaquetteWeergave;
  /** Зміна в макеті → справжнє налаштування сайту (зберігається в обліковому записі). Wijziging → echte instelling. */
  bijWeergave?: (patch: Partial<MaquetteWeergave>) => void;
  /** Мовні кнопки картки «Мови» → справжня зміна мови сайту (cookie + обліковий запис). Taalknoppen → echte taal van de site. */
  bijTaal?: (lang: 'uk' | 'nl') => void;`);
v(`export type Maquette = { stop: () => void; direct: string[];`,
`export type MaquetteWeergave = {
  dichtheid: 'compact' | 'normaal' | 'ruim'; beweging: 'systeem' | 'minder'; accent?: 'violet' | 'cyan' | 'pink' | 'amber'; effecten: number;
  icoonStijl: 'klassiek' | 'kleur'; positie: 'links' | 'rechts' | 'boven' | 'onder'; modus: 'auto' | 'open' | 'dicht';
};
export type Maquette = { stop: () => void; direct: string[]; zetWeergave: (w: MaquetteWeergave) => void;`);
// Щільність: три рівні сайту (індекс 1 = «Компактна», як і раніше, тож клас demo-dense лишається тим самим).
v(`options:["Комфортна","Компактна"]}`, `options:["Звичайна","Компактна","Простора"]}`);
v(`options:["Comfortabel","Compact"]}`, `options:["Normaal","Compact","Ruim"]}`);

// Стан сайту → елементи макета; зміна в макеті → сайт. Початкові значення беремо із сайту, а не з демо-значень.
v(`  preferences.compact=preferences.railMode!=="expanded";
  const expandedNavGroups`,
`  preferences.compact=preferences.railMode!=="expanded";
  // САЙТ (IDENTITEIT-015): елементи макета показують і змінюють справжні налаштування сайту (обліковий запис), не демо-значення.
  const ПОЗ_САЙТ={left:"links",right:"rechts",top:"boven",bottom:"onder"},ПОЗ_МАКЕТ={links:"left",rechts:"right",boven:"top",onder:"bottom"};
  const РЕЖИМ_САЙТ={expanded:"open",collapsed:"dicht",auto:"auto"},РЕЖИМ_МАКЕТ={open:"expanded",dicht:"collapsed",auto:"auto"};
  const ЩІЛЬНІСТЬ=["normaal","compact","ruim"];
  let сайтАкцент=opties.weergave?opties.weergave.accent:preferences.accent;
  let сайтГотовий=false;
  const обранийАкцент=()=>opties.weergave?сайтАкцент:preferences.accent;
  function демоЗСайту(w){
    if(!w)return;
    demoValues["personalization-0"]=w.icoonStijl==="kleur"?1:0;
    demoValues["personalization-1"]=Math.max(0,ЩІЛЬНІСТЬ.indexOf(w.dichtheid||"normaal"));
    demoValues["personalization-2"]=w.beweging!=="minder";
    demoValues["themes-2"]=typeof w.effecten==="number"?w.effecten:45;
    сайтАкцент=w.accent;
    if(w.accent)preferences.accent=w.accent;
    if(ПОЗ_МАКЕТ[w.positie])preferences.position=ПОЗ_МАКЕТ[w.positie];
    if(РЕЖИМ_МАКЕТ[w.modus]){preferences.railMode=РЕЖИМ_МАКЕТ[w.modus];preferences.compact=preferences.railMode!=="expanded";}
  }
  демоЗСайту(opties.weergave);
  function доСайту(patch){if(сайтГотовий&&typeof opties.bijWeergave==="function")opties.bijWeergave(patch);}
  // Вже намальовані елементи підлаштовуються без перемальовування карток (справжні панелі під ними не перемонтовуються).
  function синхронізуватиДемо(){
    root.querySelectorAll("[data-choice-group]").forEach(b=>{const k=b.dataset.choiceGroup;if(k in demoValues)b.classList.toggle("selected",Number(b.dataset.choiceIndex)===demoValues[k]);});
    root.querySelectorAll("[data-toggle-demo]").forEach(b=>{const k=b.dataset.toggleDemo;if(k in demoValues){b.setAttribute("aria-pressed",String(demoValues[k]));b.classList.toggle("on",demoValues[k]);}});
    root.querySelectorAll("[data-range-demo]").forEach(r=>{const k=r.dataset.rangeDemo;if(k in demoValues&&doc.activeElement!==r){r.value=String(demoValues[k]);const o=r.parentElement?.querySelector("output");if(o)o.textContent=demoValues[k]+"%";}});
    syncDirectVisuals();syncControlStates();refreshLivePreview();
  }
  const expandedNavGroups`);
// Акцент: вибраний лише той, що справді діє на сайті (без вибору — акцент палітри, жоден кружок не позначено).
v(`widget='<div class="swatches drawer-swatches">'+["violet","cyan","pink","amber"].map(c=>'<button data-accent="'+c+'" class="'+(preferences.accent===c?"selected":"")+'" aria-label="'+t.colors[c]+'"></button>').join("")+'</div>';`,
  `widget='<div class="swatches drawer-swatches">'+["violet","cyan","pink","amber"].map(c=>'<button data-accent="'+c+'" class="'+(обранийАкцент()===c?"selected":"")+'" aria-pressed="'+(обранийАкцент()===c)+'" aria-label="'+t.colors[c]+'"></button>').join("")+'</div>';`);
v(`    root.querySelectorAll(".swatches [data-accent]").forEach(b=>b.classList.toggle("selected",b.dataset.accent===preferences.accent));
    root.querySelectorAll("[data-demo-lang]")`,
  `    root.querySelectorAll(".swatches [data-accent]").forEach(b=>{const on=b.dataset.accent===обранийАкцент();b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});
    root.querySelectorAll("[data-demo-lang]")`);
// Перемикачі, вибір і повзунок картки → сайт.
v(`if(key==="menu-0")syncActive();if(key==="menu-1"&&!demoValues[key])hideAnchorTooltip();return;}`,
  `if(key==="menu-0")syncActive();if(key==="menu-1"&&!demoValues[key])hideAnchorTooltip();if(key==="personalization-2")доСайту({beweging:demoValues[key]?"systeem":"minder"});return;}`);
v(`if(choice){demoValues[choice.dataset.choiceGroup]=Number(choice.dataset.choiceIndex);root.querySelectorAll('[data-choice-group="'+choice.dataset.choiceGroup+'"]').forEach(button=>button.classList.toggle("selected",button===choice));refreshLivePreview();syncDirectVisuals();return;}`,
  `if(choice){demoValues[choice.dataset.choiceGroup]=Number(choice.dataset.choiceIndex);root.querySelectorAll('[data-choice-group="'+choice.dataset.choiceGroup+'"]').forEach(button=>button.classList.toggle("selected",button===choice));refreshLivePreview();syncDirectVisuals();const ck=choice.dataset.choiceGroup;if(ck==="personalization-0")доСайту({icoonStijl:demoValues[ck]===1?"kleur":"klassiek"});if(ck==="personalization-1")доСайту({dichtheid:ЩІЛЬНІСТЬ[demoValues[ck]]||"normaal"});return;}`);
v(`      root.style.setProperty("--effect-intensity",String(range.value/100));`,
  `      root.style.setProperty("--effect-intensity",String(range.value/100));
      if(range.dataset.rangeDemo==="themes-2")доСайту({effecten:Number(range.value)});`);
// Положення й поведінка навігації якорів (перетягування теж) зберігаються в обліковому записі.
// ANKERS-001 (15.11): власне поле paginaNav, а НЕ положення (dock.positie) і режим (modus) меню сайту — одне меню більше не рухає інше.
// Ankernavigatie: eigen veld paginaNav in het account, los van positie en gedrag van het sitemenu.
v(`    preferences.position=position;
    syncRailCompactButton();`,
  `    preferences.position=position;
    доСайту({positie:ПОЗ_САЙТ[position]}); // САЙТ (ANKERS-001): положення навігації якорів (paginaNav), не меню сайту
    syncRailCompactButton();`);
v(`    preferences.railMode=mode;
    preferences.compact=mode!=="expanded";`,
  `    preferences.railMode=mode;
    preferences.compact=mode!=="expanded";
    доСайту({modus:РЕЖИМ_САЙТ[mode]}); // САЙТ (ANKERS-001): поведінка навігації якорів (paginaNav), не меню сайту`);
v(`    if(target.dataset.accent){setAccent(target.dataset.accent);syncControlStates();return;}
    if(target.dataset.demoLang){setLang(target.dataset.demoLang);return;}`,
  `    if(target.dataset.accent){сайтАкцент=target.dataset.accent;setAccent(target.dataset.accent);доСайту({accent:target.dataset.accent});syncControlStates();return;}
    // САЙТ (IDENTITEIT-015): мова сайту (cookie, <html lang>, обліковий запис); двигун перезапускається з новою мовою сам.
    if(target.dataset.demoLang){if(typeof opties.bijTaal==="function"){if(target.dataset.demoLang!==preferences.lang)opties.bijTaal(target.dataset.demoLang);}else setLang(target.dataset.demoLang);return;}`);
v(`  setTheme(preferences.theme);
  setAccent(preferences.accent);`,
  `  setTheme(preferences.theme);
  setAccent(preferences.accent);
  сайтГотовий=true; // САЙТ: далі кожна зміна людини йде на сайт; початкове малювання — ні`);
v(`    zetProfiel(p) { прийнятиФотоПрофілю(p); },`,
  `    zetProfiel(p) { прийнятиФотоПрофілю(p); },
    // САЙТ (IDENTITEIT-015): налаштування змінилося на сайті (справжня панель, інший пристрій) — макет показує те саме, без луни назад.
    zetWeergave(w) {
      const колишні={positie:preferences.position,modus:preferences.railMode,accent:preferences.accent};
      демоЗСайту(w);
      сайтГотовий=false;
      try{
        if(preferences.position!==колишні.positie)setPosition(preferences.position);
        if(preferences.railMode!==колишні.modus)setRailMode(preferences.railMode);
        if(сайтАкцент&&сайтАкцент!==колишні.accent)setAccent(сайтАкцент);
      }finally{сайтГотовий=true;}
      синхронізуватиДемо();
    },`);

// Картки: «Активний профіль» — справжній тумблер технічного простору; інші — чесне пояснення з переходом до справжнього місця.
v(`  function чеснийЕлемент(control,i,sectionId,ціль){
    const nl=preferences.lang==="nl";`,
`  function чеснийЕлемент(control,i,sectionId,ціль,пояснення,кнопка){
    const nl=preferences.lang==="nl";
    if(пояснення)control={...control,note:escapeMarkup(nl?пояснення.nl:пояснення.uk)};`);
v(`'+(nl?"Echte instelling":"Справжнє налаштування")+'</button></div></div>';
  }`,
`'+(кнопка?escapeMarkup(nl?кнопка.nl:кнопка.uk):(nl?"Echte instelling":"Справжнє налаштування"))+'</button></div></div>';
  }
  // САЙТ (IDENTITEIT-015): пояснення там, де справжнього вимикача на сайті свідомо немає.
  const ЧЕСНО={
    "menu-0":[{uk:"У меню сайту активний розділ підсвічується завжди: так видно, де ви зараз, і це потрібно програмам читання з екрана. Тому окремого вимикача немає. Вигляд і поведінку меню змінюють у «Налаштування меню».",nl:"In het menu van de site is het actieve onderdeel altijd gemarkeerd: zo ziet u waar u bent, en schermlezers hebben het nodig. Daarom is er geen aparte schakelaar. Het uiterlijk en gedrag van het menu stelt u in bij «Menu-instellingen»."},{uk:"Налаштування меню",nl:"Menu-instellingen"},"#menu-modus"],
    "menu-1":[{uk:"У меню сайту назва пункту з'являється підказкою завжди, коли меню згорнуте до піктограм: без неї піктограма нічого не каже. Тому окремого вимикача немає. Згорнуте, розгорнуте чи автоматичне меню обирають у «Налаштування меню».",nl:"In het menu van de site verschijnt de naam altijd als hint wanneer het menu tot pictogrammen is ingeklapt: zonder hint zegt een pictogram niets. Daarom is er geen aparte schakelaar. Ingeklapt, uitgeklapt of automatisch kiest u bij «Menu-instellingen»."},{uk:"Налаштування меню",nl:"Menu-instellingen"},"#menu-modus"],
    "widgets-0":[{uk:"Загального вимикача блоків немає, щоб випадково не сховати весь простір. Блоки ховають і показують по одному в самому просторі: «Мій простір» → кнопка «Налаштувати».",nl:"Er is geen algemene schakelaar voor blokken, zodat u niet per ongeluk de hele werkruimte verbergt. Blokken verbergt en toont u één voor één in de werkruimte zelf: «Mijn ruimte» → knop «Aanpassen»."},{uk:"Відкрити простір",nl:"Werkruimte openen"},"dienst:hub"],
    "widgets-1":[{uk:"Тут лише зразок. Розмір і порядок ваших справжніх блоків змінюють у самому просторі: «Мій простір» → кнопка «Налаштувати»; там же видно справжні блоки.",nl:"Hier staat alleen een voorbeeld. Grootte en volgorde van uw echte blokken wijzigt u in de werkruimte zelf: «Mijn ruimte» → knop «Aanpassen»; daar ziet u ook uw echte blokken."},{uk:"Відкрити простір",nl:"Werkruimte openen"},"dienst:hub"],
    // IDENTITEIT-015 (apparaten-uitvoer): демо-елементи «Дані й експорт» і «Сповіщення про новий вхід» ведуть до справжніх блоків.
    "account-1":[{uk:"Тут лише зразок вибору. Справжнє вивантаження — у «Чинних налаштуваннях» → «Ваші дані»: формат JSON або ZIP із CSV на кожну таблицю, без секретів; перед вивантаженням сайт попросить підтвердити, що це ви.",nl:"Hier staat alleen een voorbeeld. De echte export staat in «Huidige instellingen» → «Uw gegevens»: JSON of ZIP met een CSV per tabel, zonder geheimen; vóór de export vraagt de site te bevestigen dat u het bent."},{uk:"Вивантажити дані",nl:"Gegevens exporteren"},"#gegevensuitvoer"],
    "sessions-1":[{uk:"Тут лише зразок. Справжній вибір «Завжди / Вимкнено» і перелік відомих пристроїв — у «Чинних налаштуваннях» → «Попереджати про новий пристрій»; вибір діє на всіх ваших пристроях.",nl:"Hier staat alleen een voorbeeld. De echte keuze «Altijd / Uit» en de lijst van bekende apparaten staan in «Huidige instellingen» → «Waarschuwen bij een nieuw apparaat»; de keuze geldt op al uw apparaten."},{uk:"Справжнє налаштування",nl:"Echte instelling"},"#sessies-nieuw-apparaat"],
    "identities-1":[{uk:"Позначку технічного режиму вимкнути не можна: вона не дає виконати дію керування сайтом, думаючи, що ви у звичайному просторі. Колір і згортання технічної смуги налаштовуються на самій смузі (значок налаштувань), коли технічний простір увімкнено — через меню облікового запису.",nl:"De markering van de technische modus kan niet uit: ze voorkomt dat u een beheeractie uitvoert terwijl u denkt in de gewone ruimte te zijn. Kleur en inklappen van de technische band stelt u op de band zelf in (instellingenpictogram) wanneer de technische ruimte aan staat — via het accountmenu."},{uk:"Меню облікового запису",nl:"Accountmenu"},"accountmenu:"],
  };
  function карткаПростору(control,i,sectionId){
    const nl=preferences.lang==="nl";
    const uitleg=nl?"Gewone of technische ruimte van dit account. De schakelaar is echt: de server controleert uw rechten; zonder toestemming ziet u waarom.":"Звичайний чи технічний простір цього облікового запису. Тумблер справжній: права перевіряє сервер; без дозволу ви побачите причину.";
    return '<div class="drawer-control-card control-wide mq-echt-kaart" data-echt-kaart="'+sectionId+'-'+i+'">'+
      '<div class="drawer-control-top"><span class="drawer-control-glyph">'+optionSvg(sectionId,i)+'</span><div class="drawer-control-copy"><strong>'+control.label+'</strong><p>'+escapeMarkup(uitleg)+'</p></div></div>'+
      '<div class="drawer-control-widget"><div class="mq-echt mq-ruimtewissel" data-echt="ruimtewissel"></div></div></div>';
  }`);
v(`  function drawerControl(control,i,sectionId){
    if(Object.prototype.hasOwnProperty.call(демоДоСайту,sectionId)`,
`  function drawerControl(control,i,sectionId){
    if(sectionId==="identities"&&i===0)return карткаПростору(control,i,sectionId); // САЙТ (IDENTITEIT-015)
    const чесно=ЧЕСНО[sectionId+"-"+i];
    if(чесно)return чеснийЕлемент(control,i,sectionId,чесно[2],чесно[0],чесно[1]);
    if(Object.prototype.hasOwnProperty.call(демоДоСайту,sectionId)`);
// Цілі поза гніздом розділу: справжній сервіс (dienst:hub) або меню облікового запису сайту (accountmenu:).
v(`  function відкритиНаСайті(розділ,ціль){
    const id=розділ==="identity"?"identities":розділ;`,
`  function відкритиНаСайті(розділ,ціль){
    if(typeof ціль==="string"&&ціль.startsWith("dienst:")){opties.bijDienst(ціль.slice(7));return;} // САЙТ (IDENTITEIT-015)
    if(ціль==="accountmenu:"){opties.bijAccountMenu();return;}
    const id=розділ==="identity"?"identities":розділ;`);
// Давня вада (з макета): корінь сторінки сам несе data-accent (setAccent пише body.dataset.accent), тому будь-яке натискання всередині
// сторінки, навіть у справжній панелі, знаходило «кнопку акценту» в корені: акцент обирався повторно (тепер це пішло б на сайт —
// людина «вибирала б» акцент, якого не обирала), а вікно навігації не закривалося кліком поза ним. Корінь — не кнопка.
// Oude fout: de wortel draagt zelf data-accent, dus elke klik kwam bij «de accentknop» uit; de wortel is geen knop.
v(`    const target=e.target.closest("[data-jump],[data-pos],[data-nav-style],[data-icon-display],[data-rail-mode],[data-theme],[data-accent],[data-demo-lang],.open-detail,.demo-action");
    if(!target){`,
`    let target=e.target.closest("[data-jump],[data-pos],[data-nav-style],[data-icon-display],[data-rail-mode],[data-theme],[data-accent],[data-demo-lang],.open-detail,.demo-action");
    if(target===body)target=null; // САЙТ (IDENTITEIT-015): корінь із data-accent — не кнопка акценту
    if(!target){`);
// Вікно навігації: що діє на меню сайту, а що лише на навігацію цієї сторінки (переклад; сам абзац додає sjabloon.mjs).
v(`    write("#mqSectieNaam",preferences.lang==="nl"?"Onderdelen":"Розділи");`,
`    write("#mqSectieNaam",preferences.lang==="nl"?"Onderdelen":"Розділи");
    // ANKERS-001: положення й поведінка — лише навігація цієї сторінки (окремо від меню сайту); підказка кнопки каже, що вона змінює.
    write("#mqPaginaNavNoot",preferences.lang==="nl"?"Positie en gedrag gelden alleen voor de navigatie van deze pagina en worden apart van het sitemenu in uw account bewaard: een wijziging hier verschuift het sitemenu niet, en omgekeerd. Stijl en inhoud van de knoppen gelden alleen op dit apparaat.":"Положення й поведінка діють лише на навігацію цієї сторінки й зберігаються в обліковому записі окремо від меню сайту: зміна тут не рухає меню сайту, а зміна меню сайту — цю навігацію. Стиль і вміст кнопок — лише на цьому пристрої.");
    write("#mqPaginaNavKnop",preferences.lang==="nl"?"Menu-instellingen van de site":"Налаштування меню сайту");
    {const k=byId("mqPaginaNavKnop");if(k)k.title=preferences.lang==="nl"?"Opent de instellingen van het hoofdmenu van de site (positie, gedrag, pictogrammen). Wat u daar kiest, verandert de navigatie van deze pagina niet.":"Відкриває налаштування головного меню сайту (положення, поведінка, піктограми). Те, що ви там оберете, не змінює навігацію цієї сторінки.";}`);
// IDENTITEIT-015 (приймання vormgeving): давня вада макета — вікно «Налаштування навігації» закривалося (Esc, «×», вибір положення),
// а фокус лишався на схованій кнопці вікна або падав на <body>: людина з клавіатурою губила місце. Тепер фокус повертається на кнопку,
// що відкрила вікно (⚙ меню, «Розташування навігації» у героя, кнопка положення на смузі розділів), — лише якщо він був у вікні
// або загубився; клік деінде на сторінці фокус не перехоплює.
// Oude fout: na het sluiten van het navigatievenster stond de focus op een verborgen knop of op <body>; nu terug naar de opener.
v(`  function toggleNavSettings(){
    popover.hidden=!popover.hidden;`,
`  let navOpener=null; // САЙТ (IDENTITEIT-015): хто відкрив вікно навігації — туди повертається фокус
  function focusNaarOpener(){
    const actief=doc.activeElement;
    if(navOpener&&navOpener.isConnected&&(!actief||actief===doc.body||popover.contains(actief)))navOpener.focus({preventScroll:true});
    navOpener=null;
  }
  function toggleNavSettings(){
    if(popover.hidden){const a=doc.activeElement;navOpener=a&&a!==doc.body&&!popover.contains(a)?a:null;}
    popover.hidden=!popover.hidden;
    if(popover.hidden)focusNaarOpener();`);
v(`  function closeNavSettings(){popover.hidden=true;scheduleRailAutoCollapse();}`,
`  function closeNavSettings(){const was=!popover.hidden;popover.hidden=true;if(was)focusNaarOpener();scheduleRailAutoCollapse();}`);
// IDENTITEIT-015 (приймання D2 «пристрої й доступність»): на вузькому екрані смуга над сторінкою показує активний розділ (а не
// завжди «Розділи»), тож людина бачить, де вона, не розгортаючи меню. Видима назва входить і в доступну назву кнопки (WCAG 2.5.3).
// Smal scherm: de balk toont het actieve onderdeel; de zichtbare naam staat ook in de toegankelijke naam van de knop.
v(`    write("#mqSectieNaam",preferences.lang==="nl"?"Onderdelen":"Розділи");\n`, `    zetSectieBalk();\n`);
v(`    adaptiveNavToggle.setAttribute("aria-label",preferences.lang==="nl"?(visible?"Pagina-onderdelen sluiten":"Pagina-onderdelen openen"):(visible?"Закрити розділи сторінки":"Відкрити розділи сторінки"));
    adaptiveNavToggle.title=adaptiveNavToggle.getAttribute("aria-label");\n`, `    zetSectieBalk();\n`);
v(`  function setAdaptiveNavOpen(open,{explicit=false}={}){`, `  // САЙТ (IDENTITEIT-015, D2): смуга розділів на вузькому екрані показує активний розділ; назва — і в aria-label кнопки.
  let actieveSectie="intro";
  function zetSectieBalk(){
    const nl=preferences.lang==="nl";
    const s=actieveSectie==="intro"?null:localizedSections().find(x=>x.id===actieveSectie);
    const naam=s?s.name:(nl?"Onderdelen":"Розділи");
    const el=root.querySelector("#mqSectieNaam");
    if(el&&el.textContent!==naam)el.textContent=naam;
    const knop=root.querySelector("#adaptiveNavToggle");
    if(!knop)return;
    const open=knop.getAttribute("aria-expanded")==="true";
    const basis=nl?(open?"Pagina-onderdelen sluiten":"Pagina-onderdelen openen"):(open?"Закрити розділи сторінки":"Відкрити розділи сторінки");
    const label=s?basis+" — "+(nl?"nu: ":"зараз: ")+naam:basis;
    if(knop.getAttribute("aria-label")!==label){knop.setAttribute("aria-label",label);knop.title=label;}
  }
  function setAdaptiveNavOpen(open,{explicit=false}={}){`);
v(`    root.querySelectorAll(".anchor-link").forEach(b=>{let on=b.dataset.jump===active;`, `    if(actieveSectie!==active){actieveSectie=active;zetSectieBalk();}
    root.querySelectorAll(".anchor-link").forEach(b=>{let on=b.dataset.jump===active;`);

// GEMINI-003: усунення примусових перекомпонувань DOM, пакетні rAF та запам’ятовування розмірів.
v(`  let stableSideNavWidth=212;
  function naturalDrawerWidth(){
    if(preferences.iconOnly)return 88;
    // The compact drawer must fit the longest button, including closed groups.
    // Measure text at its actual font size instead of the clipped panel width.
    const meter=document.createElement("span");
    meter.style.cssText="position:fixed;left:-9999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none";
    root.append(meter);
    let widest=0;
    byId("railItems").querySelectorAll(".anchor-link,.nav-group-toggle").forEach(button=>{
      const label=button.querySelector(".anchor-name,.nav-group-name");
      if(!label)return;
      const type=getComputedStyle(label);
      meter.style.font=\`\${type.fontStyle} \${type.fontWeight} \${type.fontSize} \${type.fontFamily}\`;
      meter.textContent=label.textContent.trim();
      const labelWidth=meter.getBoundingClientRect().width;
      // Icon, spacing, button padding, optional chevron, panel padding/border.
      widest=Math.max(widest,labelWidth+25+9+28+26+(button.classList.contains("nav-group-toggle")?21:0));
    });
    meter.remove();
    return Math.ceil(Math.max(146,widest));
  }
  function naturalSideNavWidth(){
    // Measure the actual, unclipped labels (including closed groups). The
    // compact rail and temporary drawer must never influence this footprint.
    if(!isHorizontalNav()&&!body.classList.contains("rail-compact")&&!body.classList.contains("rail-smart-condensed")){
      const rail=byId("anchorRail");
      const hiddenGroups=[...rail.querySelectorAll(".nav-subitems")]
        .filter(group=>getComputedStyle(group).display==="none");
      hiddenGroups.forEach(group=>{group.style.display="flex";});
      const widths=[...rail.querySelectorAll(".anchor-link,.nav-group-toggle")].map(button=>{
        const oldWidth=button.style.width,oldMax=button.style.maxWidth;
        button.style.width="max-content";
        button.style.maxWidth="none";
        const width=button.getBoundingClientRect().width;
        button.style.width=oldWidth;
        button.style.maxWidth=oldMax;
        return width;
      });
      hiddenGroups.forEach(group=>{group.style.removeProperty("display");});
      // Preserve the same footprint while switching classic/pills, whose font
      // metrics may differ by a pixel or two. A language change resets it.
      if(widths.some(Boolean))stableSideNavWidth=Math.max(stableSideNavWidth,195,Math.ceil(Math.max(...widths)+24));
    }
    return stableSideNavWidth;
  }`,
`  let stableSideNavWidth=212;
  let basisFontFamily="";
  let tekstCanvas=null;
  let tekstCtx=null;
  const tekstBreedCache=new Map();
  function haalFontFamily(){
    if(!basisFontFamily){
      try{basisFontFamily=getComputedStyle(root).fontFamily||'Inter,"Segoe UI",system-ui,-apple-system,Arial,sans-serif';}
      catch{basisFontFamily='Inter,"Segoe UI",system-ui,-apple-system,Arial,sans-serif';}
    }
    return basisFontFamily;
  }
  function meetTekstBreed(tekst,isGroup){
    const k=(isGroup?"g:":"i:")+tekst;
    const cached=tekstBreedCache.get(k);
    if(cached!==undefined)return cached;
    if(!tekstCtx&&typeof doc.createElement==="function"){
      try{
        tekstCanvas=doc.createElement("canvas");
        tekstCtx=tekstCanvas&&typeof tekstCanvas.getContext==="function"?tekstCanvas.getContext("2d"):null;
      }catch{tekstCtx=null;}
    }
    let w;
    if(tekstCtx){
      tekstCtx.font=(isGroup?"740 13.5px ":"650 13.5px ")+haalFontFamily();
      w=tekstCtx.measureText(tekst).width;
    }else{
      w=tekst.length*7.8;
    }
    tekstBreedCache.set(k,w);
    return w;
  }
  function naturalDrawerWidth(){
    if(preferences.iconOnly)return 88;
    let widest=0;
    byId("railItems").querySelectorAll(".anchor-link,.nav-group-toggle").forEach(button=>{
      const label=button.querySelector(".anchor-name,.nav-group-name");
      if(!label)return;
      const isGroup=button.classList.contains("nav-group-toggle");
      const labelWidth=meetTekstBreed((label.textContent||"").trim(),isGroup);
      // Піктограма, інтервал, відступи кнопки, можлива стрілка групи, поля панелі та запас.
      widest=Math.max(widest,labelWidth+25+10+28+26+(isGroup?23:0));
    });
    return Math.ceil(Math.max(146,widest));
  }
  function naturalSideNavWidth(){
    // Вимірюємо ширину підписів без розкриття схованих груп і без примусових перекомпонувань DOM.
    if(!isHorizontalNav()&&!body.classList.contains("rail-compact")&&!body.classList.contains("rail-smart-condensed")){
      const rail=byId("anchorRail");
      let maxKnop=0;
      rail.querySelectorAll(".anchor-link,.nav-group-toggle").forEach(button=>{
        const label=button.querySelector(".anchor-name,.nav-group-name");
        if(!label)return;
        const isGroup=button.classList.contains("nav-group-toggle");
        const isSub=Boolean(button.closest(".nav-subitems"));
        const lw=meetTekstBreed((label.textContent||"").trim(),isGroup);
        const knopBreed=lw+25+10+28+(isGroup?23:0)+(isSub?11:0)+6;
        if(knopBreed>maxKnop)maxKnop=knopBreed;
      });
      if(maxKnop>0)stableSideNavWidth=Math.max(stableSideNavWidth,195,Math.ceil(maxKnop+24));
    }
    return stableSideNavWidth;
  }`);

v(`  function renderAll(){`,
`  let ініціалізовано=false;
  let pillRaf=null;
  let vorigeSyncKey="";
  let vorigeSyncPct=-1;
  let vorSideNavW=-1,vorPillH=-1;
  function schedulePillUpdate(){
    if(!ініціалізовано||pillRaf!==null)return;
    pillRaf=requestAnimationFrame(()=>{pillRaf=null;updatePillDimensions();});
  }
  function renderAll(){`);
v(`    syncActive();
    syncNavGroups();
    оновитиФотоПрофілю();
    requestAnimationFrame(updatePillDimensions);`,
`    vorigeSyncKey="";
    vorigeSyncPct=-1;
    syncActive();
    syncNavGroups();
    оновитиФотоПрофілю();
    schedulePillUpdate();`);
v(`  function setLang(lang){
    if(!["uk","nl"].includes(lang))return;
    preferences.lang=lang;
    stableSideNavWidth=212;`,
`  function setLang(lang){
    if(!["uk","nl"].includes(lang))return;
    preferences.lang=lang;
    stableSideNavWidth=212;
    vorSideNavW=-1;
    vorPillH=-1;
    basisFontFamily="";
    tekstBreedCache.clear();`);
while (s.includes(`requestAnimationFrame(updatePillDimensions)`)) {
  v(`requestAnimationFrame(updatePillDimensions)`, `schedulePillUpdate()`);
}
v(`  function syncActive(){
    const els=[byId("intro"),...sections.map(s=>byId(s.id))];
    let active="intro";
    for(const el of els){if(el.getBoundingClientRect().top < innerHeight*.48) active=el.id;}
    const highlight=demoValues["menu-0"]!==false;
    if(actieveSectie!==active){actieveSectie=active;zetSectieBalk();}
    root.querySelectorAll(".anchor-link").forEach(b=>{let on=b.dataset.jump===active;b.classList.toggle("active",on&&highlight); b.setAttribute("aria-current",on?"location":"false");});
    const currentGroup=sections.find(s=>s.id===active)?.group;
    root.querySelectorAll(".nav-group-toggle").forEach(b=>{
      const on=b.dataset.navGroupToggle===currentGroup;
      b.classList.toggle("current-group",Boolean(on&&highlight));
      b.setAttribute("aria-current",on?"location":"false");
    });
    root.querySelectorAll("#horizontalNavPopup [data-jump]").forEach(b=>{
      const on=b.dataset.jump===active;
      b.classList.toggle("current-section",on&&highlight);
      b.setAttribute("aria-current",on?"location":"false");
    });
    const scrollable=Math.max(1,scroller().hoogte-scroller().venster);
    const pct=Math.max(0,Math.min(100,Math.round(scroller().top/scrollable*100)));
    byId("scrollProgress").style.width=pct+"%";
    byId("railProgressRing").style.strokeDashoffset=String(113.097*(1-pct/100));
    byId("railProgressGauge").setAttribute("aria-valuenow",String(pct));
    byId("railPercent").textContent=pct+"%";
    const selected=isHorizontalNav()?(currentGroup?root.querySelector('.nav-group-toggle.current-group'):root.querySelector('.anchor-link[data-jump="intro"]')):null;
    if(selected){
      const row=byId("railItems"), box=selected.getBoundingClientRect(), visible=row.getBoundingClientRect();
      if(box.left<visible.left+8)row.scrollLeft+=box.left-visible.left-12;
      else if(box.right>visible.right-8)row.scrollLeft+=box.right-visible.right+12;
    }
  }
  let ticking=false;
  luister(scrolDoel,"scroll",()=>{if(ticking)return; ticking=true;requestAnimationFrame(()=>{syncActive(); ticking=false;});},{passive:true});
  luister(window,"resize",syncActive);`,
`  function syncActive(){
    const els=[byId("intro"),...sections.map(s=>byId(s.id))];
    const vh=innerHeight*.48;
    let active="intro";
    for(const el of els){if(el&&el.getBoundingClientRect().top<vh)active=el.id;}
    const sc=scroller();
    const scrollable=Math.max(1,sc.hoogte-sc.venster);
    const pct=Math.max(0,Math.min(100,Math.round(sc.top/scrollable*100)));
    const highlight=demoValues["menu-0"]!==false;
    const currentGroup=sections.find(s=>s.id===active)?.group||"";
    const horiz=isHorizontalNav();
    const syncKey=active+"|"+(highlight?1:0)+"|"+currentGroup+"|"+(horiz?1:0);
    const changedKey=syncKey!==vorigeSyncKey;
    const selected=changedKey&&horiz?(currentGroup?root.querySelector('.nav-group-toggle[data-nav-group-toggle="'+currentGroup+'"]'):root.querySelector('.anchor-link[data-jump="intro"]')):null;
    const row=selected?byId("railItems"):null;
    const box=selected?selected.getBoundingClientRect():null;
    const visible=row?row.getBoundingClientRect():null;
    if(changedKey){
      vorigeSyncKey=syncKey;
      if(actieveSectie!==active){actieveSectie=active;zetSectieBalk();}
      root.querySelectorAll(".anchor-link").forEach(b=>{const on=b.dataset.jump===active;b.classList.toggle("active",on&&highlight);b.setAttribute("aria-current",on?"location":"false");});
      root.querySelectorAll(".nav-group-toggle").forEach(b=>{
        const on=b.dataset.navGroupToggle===currentGroup;
        b.classList.toggle("current-group",Boolean(on&&highlight));
        b.setAttribute("aria-current",on?"location":"false");
      });
      root.querySelectorAll("#horizontalNavPopup [data-jump]").forEach(b=>{
        const on=b.dataset.jump===active;
        b.classList.toggle("current-section",on&&highlight);
        b.setAttribute("aria-current",on?"location":"false");
      });
    }
    if(pct!==vorigeSyncPct){
      vorigeSyncPct=pct;
      byId("scrollProgress").style.width=pct+"%";
      byId("railProgressRing").style.strokeDashoffset=String(113.097*(1-pct/100));
      byId("railProgressGauge").setAttribute("aria-valuenow",String(pct));
      byId("railPercent").textContent=pct+"%";
    }
    if(row&&box&&visible){
      if(box.left<visible.left+8)row.scrollLeft+=box.left-visible.left-12;
      else if(box.right>visible.right-8)row.scrollLeft+=box.right-visible.right+12;
    }
  }
  let scrollRaf=null;
  function scheduleSyncActive(){
    if(scrollRaf!==null)return;
    scrollRaf=requestAnimationFrame(()=>{scrollRaf=null;syncActive();});
  }
  luister(scrolDoel,"scroll",scheduleSyncActive,{passive:true});
  luister(window,"resize",scheduleSyncActive);`);

v(`  function updatePillDimensions(){
    if((breed()>=731)){
      const rail=byId("anchorRail").getBoundingClientRect();
      if(["left","right"].includes(preferences.position)){
        const width=naturalSideNavWidth();
        body.style.setProperty("--side-nav-width",width+"px");
        body.style.setProperty("--pill-nav-width",width+"px");
      }else if(preferences.navStyle==="pills"){
        body.style.setProperty("--pill-nav-height",Math.ceil(rail.height)+"px");
      }
    }
    syncAdaptiveNavigation();
  }`,
`  function updatePillDimensions(){
    if(!ініціалізовано)return;
    if((breed()>=731)){
      if(["left","right"].includes(preferences.position)){
        const width=naturalSideNavWidth();
        if(width!==vorSideNavW){
          vorSideNavW=width;
          body.style.setProperty("--side-nav-width",width+"px");
          body.style.setProperty("--pill-nav-width",width+"px");
        }
      }else if(preferences.navStyle==="pills"){
        const h=Math.ceil(byId("anchorRail").offsetHeight);
        if(h!==vorPillH){
          vorPillH=h;
          body.style.setProperty("--pill-nav-height",h+"px");
        }
      }
    }
    syncAdaptiveNavigation();
  }`);

v(`  luister(window,"resize",()=>schedulePillUpdate());
  if(typeof ResizeObserver!=="undefined"){const ro=new ResizeObserver(()=>schedulePillUpdate());ro.observe(byId("anchorRail"));luisteraars.push(()=>ro.disconnect());}
  // САЙТ: пороги ширини макета (@media) переведено на класи кореня за шириною робочої області (не вікна).
  // Зсуви закріплених елементів: відступ робочої області від справжнього головного меню сайту (--mq-links, --mq-rechts, --mq-onder, --mq-site) і висота підсмуги розділів (--mq-boven).
  const DREMPELS=${JSON.stringify(drempels)};
  const chrome=root.closest(".canonical-chrome");
  function zetMaten(){
    const b=breed();
    for(const n of DREMPELS){root.classList.toggle("bp-max-"+n,b<=n);root.classList.toggle("bp-min-"+n,b>=n);}
    const stijl=werkvlak?getComputedStyle(werkvlak):null;
    const maat=n=>stijl?parseFloat(stijl[n])||0:0;
    const rail=root.querySelector(".app-rail");
    const railBreed=rail&&getComputedStyle(rail).display!=="none"?rail.offsetWidth:0;
    const links=maat("paddingLeft")+railBreed, site=maat("paddingTop");
    const planck=root.querySelector(".topbar")?.offsetHeight||0;
    const sectieBalkEl=byId("mqSectieBalk");
    const sectieBalk=sectieBalkEl&&getComputedStyle(sectieBalkEl).display!=="none"?sectieBalkEl.offsetHeight:0;
    root.style.setProperty("--mq-links",links+"px");
    root.style.setProperty("--mq-site-links",maat("paddingLeft")+"px");
    root.style.setProperty("--mq-rechts",maat("paddingRight")+"px");
    root.style.setProperty("--mq-onder",maat("paddingBottom")+"px");
    root.style.setProperty("--mq-site",site+"px");
    root.style.setProperty("--mq-topbar",planck+"px");
    root.style.setProperty("--mq-boven",(site+planck+sectieBalk)+"px");
    if(rail)rail.style.left=maat("paddingLeft")+"px";
  }
  zetMaten();
  if(typeof ResizeObserver!=="undefined"){const ro2=new ResizeObserver(()=>{zetMaten();schedulePillUpdate();});ro2.observe(root);if(werkvlak)ro2.observe(werkvlak);luisteraars.push(()=>ro2.disconnect());}
  if(chrome&&typeof MutationObserver!=="undefined"){const mo=new MutationObserver(()=>{zetMaten();schedulePillUpdate();});mo.observe(chrome,{attributes:true,attributeFilter:["class","data-dock"]});luisteraars.push(()=>mo.disconnect());}
  luisteraars.push(()=>{cancelRailAutoCollapse();clearTimeout(showToast.timer);});`,
`  luister(window,"resize",schedulePillUpdate);
  if(typeof ResizeObserver!=="undefined"){const ro=new ResizeObserver(schedulePillUpdate);ro.observe(byId("anchorRail"));luisteraars.push(()=>ro.disconnect());}
  // САЙТ: пороги ширини макета (@media) переведено на класи кореня за шириною робочої області (не вікна).
  // Зсуви закріплених елементів: відступ робочої області від справжнього головного меню сайту (--mq-links, --mq-rechts, --mq-onder, --mq-site) і висота підсмуги розділів (--mq-boven).
  const DREMPELS=${JSON.stringify(drempels)};
  const chrome=root.closest(".canonical-chrome");
  let vorBreed=-1;
  const vorMaten={links:-1,siteLinks:-1,rechts:-1,onder:-1,site:-1,topbar:-1,boven:-1};
  function zetMaten(){
    const b=breed();
    if(b!==vorBreed){
      vorBreed=b;
      for(const n of DREMPELS){root.classList.toggle("bp-max-"+n,b<=n);root.classList.toggle("bp-min-"+n,b>=n);}
    }
    const stijl=werkvlak?getComputedStyle(werkvlak):null;
    const maat=n=>stijl?parseFloat(stijl[n])||0:0;
    const rail=root.querySelector(".app-rail");
    const railBreed=rail&&getComputedStyle(rail).display!=="none"?rail.offsetWidth:0;
    const siteLinks=maat("paddingLeft");
    const links=maat("paddingLeft")+railBreed, site=maat("paddingTop");
    const rechts=maat("paddingRight"), onder=maat("paddingBottom");
    const planck=root.querySelector(".topbar")?.offsetHeight||0;
    const sectieBalkEl=byId("mqSectieBalk");
    const sectieBalk=sectieBalkEl&&getComputedStyle(sectieBalkEl).display!=="none"?sectieBalkEl.offsetHeight:0;
    const boven=site+planck+sectieBalk;
    if(vorMaten.links!==links){vorMaten.links=links;root.style.setProperty("--mq-links",links+"px");}
    if(vorMaten.siteLinks!==siteLinks){vorMaten.siteLinks=siteLinks;root.style.setProperty("--mq-site-links",siteLinks+"px");}
    if(vorMaten.rechts!==rechts){vorMaten.rechts=rechts;root.style.setProperty("--mq-rechts",rechts+"px");}
    if(vorMaten.onder!==onder){vorMaten.onder=onder;root.style.setProperty("--mq-onder",onder+"px");}
    if(vorMaten.site!==site){vorMaten.site=site;root.style.setProperty("--mq-site",site+"px");}
    if(vorMaten.topbar!==planck){vorMaten.topbar=planck;root.style.setProperty("--mq-topbar",planck+"px");}
    if(vorMaten.boven!==boven){vorMaten.boven=boven;root.style.setProperty("--mq-boven",boven+"px");}
    if(rail){
      const leftVal=siteLinks+"px";
      if(rail.style.left!==leftVal)rail.style.left=leftVal;
    }
  }
  let matenRaf=null;
  function scheduleMaten(){
    if(matenRaf!==null)return;
    matenRaf=requestAnimationFrame(()=>{matenRaf=null;zetMaten();schedulePillUpdate();});
  }
  zetMaten();
  if(typeof ResizeObserver!=="undefined"){const ro2=new ResizeObserver(scheduleMaten);ro2.observe(root);if(werkvlak)ro2.observe(werkvlak);luisteraars.push(()=>ro2.disconnect());}
  if(chrome&&typeof MutationObserver!=="undefined"){const mo=new MutationObserver(scheduleMaten);mo.observe(chrome,{attributes:true,attributeFilter:["class","data-dock"]});luisteraars.push(()=>mo.disconnect());}
  luisteraars.push(()=>{
    cancelRailAutoCollapse();clearTimeout(showToast.timer);
    if(pillRaf!==null){cancelAnimationFrame(pillRaf);pillRaf=null;}
    if(scrollRaf!==null){cancelAnimationFrame(scrollRaf);scrollRaf=null;}
    if(matenRaf!==null){cancelAnimationFrame(matenRaf);matenRaf=null;}
  });`);
v(`    popup.hidden=false;horizontalNavTrigger=trigger;
    syncActive();`,
`    popup.hidden=false;horizontalNavTrigger=trigger;
    vorigeSyncKey="";
    syncActive();`);
v(`dragHandle.setPointerCapture(e.pointerId);`, `try{dragHandle.setPointerCapture(e.pointerId);}catch{}`);
v(`  luisteraars.push(()=>revealObserver.disconnect());
  renderAll();`,
`  luisteraars.push(()=>revealObserver.disconnect());
  ініціалізовано=true;
  renderAll();`);

// ДУБЛІ-001: заголовок групи в бічній навігації мав піктограму свого першого розділу («Обличчя простору» = «Персоналізація»,
// «Люди» = «Спільний доступ» тощо), тож у розгорнутій групі дві однакові піктограми стояли поспіль і виглядали як дубль розділу.
// Групи отримують власні піктограми. Groepen krijgen eigen pictogrammen, zodat er geen dubbele iconen onder elkaar staan.
v(`const groups=[{id:"personal",icon:"personalization"},{id:"social",icon:"sharing"},{id:"account",icon:"account"},{id:"security",icon:"security"}];`,
`const groups=[{id:"personal",icon:"groep-personal"},{id:"social",icon:"groep-social"},{id:"account",icon:"groep-account"},{id:"security",icon:"groep-security"}]; // САЙТ (ДУБЛІ-001): власні піктограми груп`);
v(`    recovery:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6m5.6 5.6 3.6 3.6M18.4 5.6l-3.6 3.6m-5.6 5.6-3.6 3.6"/>'
  };`,
`    recovery:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6m5.6 5.6 3.6 3.6M18.4 5.6l-3.6 3.6m-5.6 5.6-3.6 3.6"/>',
    // САЙТ (ДУБЛІ-001): піктограми груп, відмінні від піктограм розділів.
    "groep-personal":'<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    "groep-social":'<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 7.5v4M12 11.5 6.8 16.2M12 11.5l5.2 4.7"/>',
    "groep-account":'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.6a7 7 0 0 1 11.6 0"/>',
    "groep-security":'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1"/>'
  };`);

// ДУБЛІ-001: тексти, що стали неправдою або звучали як макет: елементи тепер змінюють справжні налаштування; «passkey» → «ключ доступу»;
// нагадування про резервний доступ має чинне місце в розділі «Відновлення доступу»; єдині назви розділів.
// Teksten die niet meer klopten of als ontwerp klonken; één naam per onderdeel.
v(`concept:"Дизайн-концепт"`, `concept:"Новий вигляд"`);
v(`concept:"Ontwerpconcept"`, `concept:"Nieuwe weergave"`);
v(`demoToast:"Це демонстрація дизайну. Реальні параметри акаунта не змінено."`, `demoToast:"Ця дія виконується в блоці «Чинні налаштування» цього розділу."`);
v(`demoToast:"Dit is een ontwerpdemonstratie. Je echte accountinstellingen zijn niet gewijzigd."`, `demoToast:"Deze handeling voert u uit in het blok «Huidige instellingen» van dit onderdeel."`);
v(`drawerHint:"Спробуйте елементи керування: цей прототип не зберігає змін на справжньому сайті."`, `drawerHint:"Зміни тут діють одразу: це справжні налаштування вашого облікового запису."`);
v(`drawerHint:"Probeer de bediening uit. Dit prototype wijzigt niets op de echte website."`, `drawerHint:"Wijzigingen hier gelden meteen: dit zijn de echte instellingen van uw account."`);
v(`note:"Приклад сценарію passkey без створення ключа"`, `note:"Створення ключа — у блоці «Чинні налаштування»"`);
v(`усіх passkey означає`, `усіх ключів доступу означає`);
v(`methods:{name:"Inlogmethoden",short:"Inloggen"`, `methods:{name:"Aanmeldmethoden",short:"Aanmelden"`);
v(`name:"Акаунт і дані", short:"Акаунт і дан`, `name:"Обліковий запис і дані", short:"Обліковий запис і дан`);
// Розділ «Ідентичності»: вибір профілю вже стоїть у картці — порожній блок «Чинні налаштування» не малюємо.
v(`function tekenЧинні(id){`, `function tekenЧинні(id){
    if(id==="identities")return ""; // САЙТ (ДУБЛІ-001): вибір профілю вже в картці розділу`);

// ДУБЛІ-001: підвал без «Account Atelier / Дизайн-концепт» — звичайна назва сторінки.
v(`footer:"Дизайн-концепт 2026"`, `footer:"Центр облікового запису"`);
v(`footer:"Ontwerpconcept 2026"`, `footer:"Accountcentrum"`);
v(`write(".site-footer div span","Account Atelier / "+t.footer);`, `write(".site-footer div span",t.footer);`);
v(`note:"Primaire inlogmethode in dit concept."`, `note:"Primaire inlogmethode."`);

// ДУБЛІ-001: назви в навігації «Макета» — як у меню сайту: «Блоки», «Обліковий запис» (без англіцизму «Акаунт»).
v(`navGroups:["Вигляд і меню","Доступ і ролі","Акаунт","Захист"]`, `navGroups:["Вигляд і меню","Доступ і ролі","Обліковий запис","Захист"]`);
v(`id:"widgets", group:"personal", number:"05", name:"Віджети", short:"Віджети"`, `id:"widgets", group:"personal", number:"05", name:"Блоки", short:"Блоки"`);
v(`widgets:{name:"Widgets",short:"Widgets"`, `widgets:{name:"Blokken",short:"Blokken"`);
v(`short:"Обліковий запис і дані"`, `short:"Обліковий запис"`);

// ZAVYSANNIA-001: будь-яке натискання на сторінці (зокрема вибір теми) закриває спливне вікно налаштувань рейки й через 300 мс
// знову «згортало» рейку й шухляду, навіть коли вони вже згорнуті. Кожен такий перезапис класів і атрибутів перераховував стилі
// всієї сторінки (селектори :has на <html>) — на телефоні до секунди без відгуку. Тепер лише справжня зміна стану.
// Elke klik klapte de rail opnieuw in, ook als die al ingeklapt was; nu alleen bij een echte wijziging.
v(`        if(body.classList.contains("rail-smart-condensed"))setAdaptiveNavOpen(false);
        applyRailCollapsed(true);`,
`        if(body.classList.contains("rail-smart-condensed")&&body.classList.contains("rail-smart-open"))setAdaptiveNavOpen(false);
        if(!body.classList.contains("rail-compact"))applyRailCollapsed(true);`);

// ZAVYSANNIA-001: так само вже сховане вікно налаштувань рейки не «ховаємо» вдруге — запис атрибута hidden на кожне натискання
// перераховував стилі всієї сторінки. Een al verborgen paneel niet opnieuw verbergen.
v(`function closeNavSettings(){const was=!popover.hidden;popover.hidden=true;`, `function closeNavSettings(){const was=!popover.hidden;if(was)popover.hidden=true;`);

// ANKERS-001: блок «Положення якорів» у розділі «Меню» — справжнє налаштування навігації цієї сторінки, а не «демонстраційна панель».
// Het blok «Positie van ankers» is een echte instelling van de paginanavigatie, geen demonstratiepaneel.
v(`dockInlineHint:"Налаштування цієї демонстраційної панелі"`, `dockInlineHint:"Лише навігація цієї сторінки; меню сайту не зміниться"`);
v(`dockInlineHint:"Pas dit demonstratiepaneel aan"`, `dockInlineHint:"Alleen de navigatie van deze pagina; het sitemenu verandert niet"`);

// BLOKKEN-001 (15.11.2026): «Справжнє налаштування» в картках «Профіль» і «Небезпечні дії» мало порожню ціль і лише
// прокручувало до верху розділу, нічого не розгортаючи. Тепер у кожної картки — свій справжній блок; без точної цілі (або якщо
// селектор не знайшовся за ~3 с) кнопка веде до гнізда справжніх налаштувань розділу, а не до верху розділу.
// NL: «Echte instelling» opent en toont het echte blok; zonder doel het nest met de echte instellingen van de sectie.
v(`if(Object.prototype.hasOwnProperty.call(демоДоСайту,sectionId)&&демоТипи.has(control.type))return чеснийЕлемент(control,i,sectionId,демоДоСайту[sectionId]);`,
`if(Object.prototype.hasOwnProperty.call(демоДоСайту,sectionId)&&демоТипи.has(control.type))return чеснийЕлемент(control,i,sectionId,ЦІЛЬ_КАРТКИ[sectionId+"-"+i]||демоДоСайту[sectionId]);`);
v(`  const демоТипи=new Set(`,
`  // BLOKKEN-001: точні справжні блоки для карток, де ціль розділу порожня. Ключ — «розділ-номер картки».
  // NL: precieze echte blokken voor kaarten zonder doel in de sectie.
  const ЦІЛЬ_КАРТКИ={"account-0":".ia-profiel","account-1":"#gegevensuitvoer","account-2":".settings-danger","sessions-0":".sessies-overzicht"};
  const демоТипи=new Set(`);
v(`    gaNaar(id,true);
    opties.bijOpenen(id);
    if(!ціль)return;`,
`    gaNaar(id,true);
    opties.bijOpenen(id);
    // BLOKKEN-001: без точної цілі ведемо до самого гнізда справжніх налаштувань розділу (а не до верху розділу),
    // а якщо селектор не знайшовся за ~3 с — теж до гнізда. NL: zonder doel naar het nest met echte instellingen.`);
v(`      try{доціль=гніздо?гніздо.querySelector(ціль):null;}catch{доціль=null;}
      // Панель монтується асинхронно (портал React після bijOpenen): чекаємо до ~3 с.
      if(!доціль){if(++спроби<50)setTimeout(шукати,60);return;}`,
`      try{доціль=гніздо&&ціль?гніздо.querySelector(ціль):null;}catch{доціль=null;}
      // Панель монтується асинхронно (портал React після bijOpenen): чекаємо до ~3 с.
      const гніздоГотове=гніздо&&гніздо.childElementCount>0&&гніздо.getBoundingClientRect().height>0;
      if(!доціль&&!ціль&&гніздоГотове&&спроби>=3)доціль=гніздо;
      if(!доціль){if(++спроби<50){setTimeout(шукати,60);return;}if(гніздоГотове)доціль=гніздо;else return;}`);

// BLOKKEN-001 (15.11.2026): правки, які KLEUREN-001 (#128: 12 акцентів і назви з ACCENT_KEUZES/ACCENT_NAMEN, сім палітр,
// акцент як справжнє налаштування) і HINT-001 (#130: підказка якорів лише для самої піктограми, без дотику, data-anker-tip)
// внесли прямо в згенерований maquette-motor.ts. Перенесено сюди, щоб bouw.mjs їх не стирав (кроки знайдено порівнянням файлів).
// NL: handmatige wijzigingen van KLEUREN-001 en HINT-001 aan de gegenereerde motor, overgezet naar de generator.
v(`
export type MaquetteOpties = {`,
`
import type { UiterlijkAccent } from '../../../shared/uiterlijk';
import { ACCENT_KEUZES, ACCENT_NAMEN } from '../../thema/weergave-stijl';
export type MaquetteOpties = {`);
v(`export type MaquetteWeergave = {
  dichtheid: 'compact' | 'normaal' | 'ruim'; beweging: 'systeem' | 'minder'; accent?: 'violet' | 'cyan' | 'pink' | 'amber'; effecten: number;
  icoonStijl: 'klassiek' | 'kleur'; positie: 'links' | 'rechts' | 'boven' | 'onder'; modus: 'auto' | 'open' | 'dicht';`,
`export type MaquetteWeergave = {
  dichtheid: 'compact' | 'normaal' | 'ruim'; beweging: 'systeem' | 'minder'; accent?: UiterlijkAccent; effecten: number;
  icoonStijl: 'klassiek' | 'kleur'; positie: 'links' | 'rechts' | 'boven' | 'onder'; modus: 'auto' | 'open' | 'dicht';`);
v(`        accentInline:"Акцентний колір",accentInlineHint:"Лише для цього макета",
        dark:"Темна",light:"Світла",colors:{violet:"Фіолетовий",cyan:"Бірюзовий",pink:"Рожевий",amber:"Бурштиновий"},
        langInline:"Мова інтерфейсу",langInlineHint:"Написи на всіх ілюстраціях також перекладаються.",`,
`        accentInline:"Акцентний колір",accentInlineHint:"Лише для цього макета",
        dark:"Темна",light:"Світла",colors:{violet:"Фіолетовий",cyan:"Ціан",pink:"Рожевий",amber:"Медовий",blauw:"Синій",hemel:"Небесний",teal:"Бірюзовий",groen:"Зелений",oranje:"Бурштиновий",roze:"Малиновий",indigo:"Індиго",bruin:"Теракотовий"},
        langInline:"Мова інтерфейсу",langInlineHint:"Написи на всіх ілюстраціях також перекладаються.",`);
v(`        accentInline:"Accentkleur",accentInlineHint:"Alleen voor dit ontwerp",
        dark:"Donker",light:"Licht",colors:{violet:"Paars",cyan:"Turkoois",pink:"Roze",amber:"Amber"},
        langInline:"Taal van de interface",langInlineHint:"Ook de teksten in illustraties worden vertaald.",`,
`        accentInline:"Accentkleur",accentInlineHint:"Alleen voor dit ontwerp",
        dark:"Donker",light:"Licht",colors:{violet:"Paars",cyan:"Cyaan",pink:"Roze",amber:"Honing",blauw:"Blauw",hemel:"Hemelsblauw",teal:"Teal",groen:"Groen",oranje:"Oranje",roze:"Framboos",indigo:"Indigo",bruin:"Terracotta"},
        langInline:"Taal van de interface",langInlineHint:"Ook de teksten in illustraties worden vertaald.",`);
v(`      група("палітра","Основне кольорове оформлення","Basiskleuren","Наявні оформлення з різними світлими та темними відтінками.","Bestaande paletten met een lichte en donkere variant.","наявне",[
        рядок("Оформлення сторінки","Paginaweergave","вибір",[["Кольорове","Kleurrijk"],["Грифельне","Leisteen"],["Чисте","Zuiver"],["Фіолетове","Paars"]])
      ]),`,
`      група("палітра","Основне кольорове оформлення","Basiskleuren","Наявні оформлення з різними світлими та темними відтінками.","Bestaande paletten met een lichte en donkere variant.","наявне",[
        // САЙТ (KLEUREN-001): усі сім палітр, як у «Темах» і меню облікового запису (було чотири). Alle zeven paletten.
        рядок("Оформлення сторінки","Paginaweergave","вибір",[["Кольорове","Kleurrijk"],["Макет","Ontwerp"],["Біла класика","Witte klassiek"],["Чорна класика","Zwarte klassiek"],["Грифельне","Grafiet"],["Чисте","Puur"],["Фіолетове","Violet"]])
      ]),`);
v(`      ]),
      група("акцент","Допоміжний колір і виразність","Accentkleur en intensiteit","Допоміжний колір не замінює основного оформлення.","Accentkleur vervangt het basispalet niet.","макет",[
        рядок("Акцентна палітра","Accentkleuren","вибір",[["Фіолетовий","Paars"],["Бірюзовий","Turkoois"],["Рожевий","Roze"],["Бурштиновий","Amber"]]),
        рядок("Виразність декоративних ефектів","Intensiteit van decoratieve effecten","повзунок")`,
`      ]),
      // САЙТ (KLEUREN-001): акцент уже справжнє налаштування облікового запису (не «лише макет»); набір і назви — з ACCENT_KEUZES/ACCENT_NAMEN.
      група("акцент","Допоміжний колір і виразність","Accentkleur en intensiteit","Акцент фарбує кнопки, посилання, активні пункти, перемикачі, фокус і «Живий фон»; фон і текст палітри лишаються.","Het accent kleurt knoppen, links, actieve items, schakelaars, focus en de levende achtergrond; achtergrond en tekst van het palet blijven.","наявне",[
        рядок("Акцентний відтінок","Accenttint","вибір",[["Як у палітрі","Zoals het palet"],...ACCENT_KEUZES.map(id=>[ACCENT_NAMEN[id].uk,ACCENT_NAMEN[id].nl])]),
        рядок("Прозорість блоків","Doorschijnende blokken","повзунок"),
        рядок("Сяйво ілюстрацій","Gloed van illustraties","повзунок")`);
v(`    }else if(type==="accent"){
      widget='<div class="swatches drawer-swatches">'+["violet","cyan","pink","amber"].map(c=>'<button data-accent="'+c+'" class="'+(обранийАкцент()===c?"selected":"")+'" aria-pressed="'+(обранийАкцент()===c)+'" aria-label="'+t.colors[c]+'"></button>').join("")+'</div>';
    }else if(type==="language"){`,
`    }else if(type==="accent"){
      // ACCENT-001: ті самі відтінки, що в меню облікового запису; давні «pink»/«amber» видно, лише поки обрані.
      widget='<div class="swatches drawer-swatches">'+ACCENT_KEUZES.concat(ACCENT_KEUZES.includes(обранийАкцент())||!обранийАкцент()?[]:[обранийАкцент()]).map(c=>'<button data-accent="'+c+'" class="'+(обранийАкцент()===c?"selected":"")+'" aria-pressed="'+(обранийАкцент()===c)+'" aria-label="'+t.colors[c]+'"></button>').join("")+'</div>';
    }else if(type==="language"){`);
v(`
  function isIconNav(){
    return preferences.iconOnly || ["top","bottom"].includes(preferences.position) || preferences.compact ||
      ((breed()<=730)&&["left","right"].includes(preferences.position));
  }`,
`
  // HINT-001: підказка потрібна лише тоді, коли пункт справді показує саму піктограму. Налаштування «компактно»/«авто»
  // не годиться як ознака: в авто-режимі панель розгортається при наведенні й назву вже видно (була подвійна назва).
  // HINT-001: alleen een hint als het item echt alleen een pictogram toont; «auto» klapt bij aanwijzen uit en toont de naam al.
  function isIconNav(el){
    const naam=el&&el.querySelector(".anchor-name,.nav-group-name");
    if(!naam)return true;
    if(!naam.getClientRects().length)return true;
    const st=getComputedStyle(naam);
    return st.visibility==="hidden"||Number(st.opacity)<0.05;
  }`);
v(`  function showAnchorTooltip(el){
    if(!el||!isIconNav()||(demoValues["menu-1"]===false&&!["top","bottom"].includes(preferences.position)))return;
    const tooltip=byId("anchorTooltip"),rect=el.getBoundingClientRect();`,
`  function showAnchorTooltip(el){
    if(!el||!isIconNav(el)||(demoValues["menu-1"]===false&&!["top","bottom"].includes(preferences.position)))return;
    const tooltip=byId("anchorTooltip"),rect=el.getBoundingClientRect();`);
v(`    const tooltip=byId("anchorTooltip"),rect=el.getBoundingClientRect();
    tooltip.textContent=el.dataset.tooltip;
    tooltip.hidden=false;`,
`    const tooltip=byId("anchorTooltip"),rect=el.getBoundingClientRect();
    tooltip.textContent=el.dataset.ankerTip||el.getAttribute("aria-label")||"";
    tooltip.hidden=false;`);
v(`    tooltip.classList.add("show");
  }`,
`    tooltip.classList.add("show");
    ankerTipDoel=el;
    // Авто-панель розгортається під мишею вже після показу: щойно назву видно, бубка зникає · verdwijnt zodra de naam zichtbaar is
    clearTimeout(ankerTipHerzien);ankerTipHerzien=setTimeout(herzieAnkerTip,120);setTimeout(herzieAnkerTip,420);
  }`);
v(`  }
  function hideAnchorTooltip(){`,
`  }
  let ankerTipDoel=null,ankerTipHerzien=0;
  function herzieAnkerTip(){if(ankerTipDoel&&!isIconNav(ankerTipDoel))hideAnchorTooltip();}
  function hideAnchorTooltip(){`);
v(`  function hideAnchorTooltip(){
    const tooltip=byId("anchorTooltip");`,
`  function hideAnchorTooltip(){
    ankerTipDoel=null;
    const tooltip=byId("anchorTooltip");`);
v(`    }
    const navItem=(id,name)=>'<button class="anchor-link" data-jump="'+id+'" aria-label="'+name+'" data-tooltip="'+name+'"><span class="anchor-icon">'+iconSvg(id)+'</span><span class="anchor-name">'+name+'</span><span class="anchor-active-marker"></span></button>';
    const groups=[{id:"personal",icon:"groep-personal"},{id:"social",icon:"groep-social"},{id:"account",icon:"groep-account"},{id:"security",icon:"groep-security"}]; // САЙТ (ДУБЛІ-001): власні піктограми груп`,
`    }
    const navItem=(id,name)=>'<button class="anchor-link" data-jump="'+id+'" aria-label="'+name+'" data-anker-tip="'+name+'"><span class="anchor-icon">'+iconSvg(id)+'</span><span class="anchor-name">'+name+'</span><span class="anchor-active-marker"></span></button>';
    const groups=[{id:"personal",icon:"groep-personal"},{id:"social",icon:"groep-social"},{id:"account",icon:"groep-account"},{id:"security",icon:"groep-security"}]; // САЙТ (ДУБЛІ-001): власні піктограми груп`);
v(`      return '<div class="nav-group '+(opened?'nav-group-open':'')+'" data-nav-group="'+group.id+'">'+
        '<button class="nav-group-toggle" data-nav-group-toggle="'+group.id+'" aria-expanded="'+opened+'" aria-label="'+label+'" data-tooltip="'+label+'"><span class="anchor-icon">'+iconSvg(group.icon)+'</span><span class="nav-group-name">'+label+'</span><span class="nav-chevron" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg></span></button>'+
        '<div class="nav-subitems" role="group" aria-label="'+label+'">'+localized.filter(s=>s.group===group.id).map(s=>navItem(s.id,s.short)).join("")+'</div></div>';`,
`      return '<div class="nav-group '+(opened?'nav-group-open':'')+'" data-nav-group="'+group.id+'">'+
        '<button class="nav-group-toggle" data-nav-group-toggle="'+group.id+'" aria-expanded="'+opened+'" aria-label="'+label+'" data-anker-tip="'+label+'"><span class="anchor-icon">'+iconSvg(group.icon)+'</span><span class="nav-group-name">'+label+'</span><span class="nav-chevron" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg></span></button>'+
        '<div class="nav-subitems" role="group" aria-label="'+label+'">'+localized.filter(s=>s.group===group.id).map(s=>navItem(s.id,s.short)).join("")+'</div></div>';`);
v(`    body.classList.toggle("rail-compact",collapsed);
    root.querySelectorAll("[data-drawer-compact]").forEach(b=>{b.setAttribute("aria-pressed",String(collapsed));b.classList.toggle("on",collapsed);});`,
`    body.classList.toggle("rail-compact",collapsed);
    if(!collapsed)herzieAnkerTip();
    root.querySelectorAll("[data-drawer-compact]").forEach(b=>{b.setAttribute("aria-pressed",String(collapsed));b.classList.toggle("on",collapsed);});`);
v(`  byId("railItems").addEventListener("pointerover",e=>{
    const item=e.target.closest(".anchor-link,.nav-group-toggle");`,
`  byId("railItems").addEventListener("pointerover",e=>{
    // HINT-001: на сенсорному екрані дотик не показує підказку · geen hint bij aanraken
    if(e.pointerType==="touch")return;
    const item=e.target.closest(".anchor-link,.nav-group-toggle");`);
v(`  });
  byId("railItems").addEventListener("focusin",e=>{const item=e.target.closest(".anchor-link,.nav-group-toggle");if(item)showAnchorTooltip(item);});
  byId("railItems").addEventListener("focusout",hideAnchorTooltip);`,
`  });
  byId("railItems").addEventListener("focusin",e=>{const item=e.target.closest(".anchor-link,.nav-group-toggle");if(item&&item.matches(":focus-visible"))showAnchorTooltip(item);});
  byId("railItems").addEventListener("focusout",hideAnchorTooltip);`);

// KLEUREN-001: розділ зветься так само, як на вкладці сайту й у меню облікового запису — «Вигляд і кольори» (раніше «Теми», хоча в ньому
// ще й акцент, живий фон, прозорість і сяйво). De sectie heet overal hetzelfde: «Weergave en kleuren».
v(`id:"themes", group:"personal", number:"03", name:"Теми", short:"Теми",`, `id:"themes", group:"personal", number:"03", name:"Вигляд і кольори", short:"Вигляд",`);
v(`themes:{name:"Thema's",short:"Thema's",`, `themes:{name:"Weergave en kleuren",short:"Weergave",`);
v(`рядок("Теми та кольори","Thema's en kleuren","перехід",[],null,"themes")`, `рядок("Вигляд і кольори","Weergave en kleuren","перехід",[],null,"themes")`);

// GOOGLE-OFFICIEEL (2026-11-16) → REESTR-LOGO-001 (16.11.2026): у макеті знаки постачальників були намальовані від руки (Google,
// Microsoft, Telegram, Discord, Apple, WhatsApp — схожі, але не справжні). Тепер генератор бере КОЖЕН знак з єдиного реєстру сайту:
// справжній файл src/merk/officieel/<ключ>.svg, а для Apple — фігуру з src/merk/merk-tabel.ts (однокольорова, у кольорі тексту).
// Тест maquette-generator-gelijk копіює ці файли разом із генератором; тест merk-een-register-20261116 звіряє знаки з реєстром.
// De merktekens van «Макет» komen uit het ene merkregister van de site (officieel bestand of vorm), niet meer met de hand getekend.
{
  const MERK_MAP = path.join(WORTEL, 'src/merk/');
  /** Officieel bestand → <svg class="brand-symbol …"> met de eigen viewBox; de inhoud blijft letterlijk dezelfde. */
  const officieel = (sleutel) => {
    const ruw = fs.readFileSync(path.join(MERK_MAP, 'officieel', `${sleutel}.svg`), 'utf8').trim();
    const m = /^<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>$/.exec(ruw);
    if (!m) throw new Error(`не знайдено: офіційний файл ${sleutel}.svg`);
    if (m[2].includes("'")) throw new Error(`${sleutel}.svg містить апостроф — не вміщується в рядок двигуна`);
    return `<svg class="brand-symbol brand-${sleutel}" data-merk-officieel="${sleutel}" viewBox="${m[1]}" aria-hidden="true">${m[2]}</svg>`;
  };
  /** Vorm uit het register (merk-tabel.ts): één pad in de doos 24, in de tekstkleur (zoals <Merk> een monochroom merk tekent). */
  const vorm = (sleutel) => {
    const tabel = fs.readFileSync(path.join(MERK_MAP, 'merk-tabel.ts'), 'utf8');
    const m = new RegExp(`^\\s+${sleutel}: \\{[^\\n]*?\\bd: "([^"]+)"`, 'm').exec(tabel);
    if (!m) throw new Error(`не знайдено: фігура ${sleutel} у merk-tabel.ts`);
    return `<svg class="brand-symbol brand-${sleutel}" data-merk-vorm="${sleutel}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${m[1]}"/></svg>`;
  };
  const ZNAKY = { гугл: () => officieel('google'), майкрософт: () => officieel('microsoft'), телеграм: () => officieel('telegram'),
    діскорд: () => officieel('discord'), ватсап: () => officieel('whatsapp'), епл: () => vorm('apple') };
  for (const [ключ, maak] of Object.entries(ZNAKY)) {
    const oud = new RegExp(`${ключ}:'<svg class="brand-symbol[^']*<\\/svg>',?`).exec(s);
    if (!oud) throw new Error('не знайдено: знак ' + ключ + ' у макеті');
    const nieuw = `${ключ}:'${maak()}'${oud[0].endsWith(',') ? ',' : ''}`;
    s = s.replace(oud[0], () => nieuw);
  }
}

fs.writeFileSync(f, s);
console.log('ok');
