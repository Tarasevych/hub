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
`  const демоДоСайту={sharing:".settings-sharing",account:"",sessions:"",methods:"#aanmeldmethoden-google",security:"#aanmeldmethoden-2fa",recovery:"#aanmeldmethoden-herstel",identities:""};
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
// Положення й поведінка меню макета = положення (dock.positie) і режим (zijbalk modus) меню сайту; перетягування теж.
v(`    preferences.position=position;
    syncRailCompactButton();`,
  `    preferences.position=position;
    доСайту({positie:ПОЗ_САЙТ[position]}); // САЙТ (IDENTITEIT-015): положення меню сайту
    syncRailCompactButton();`);
v(`    preferences.railMode=mode;
    preferences.compact=mode!=="expanded";`,
  `    preferences.railMode=mode;
    preferences.compact=mode!=="expanded";
    доСайту({modus:РЕЖИМ_САЙТ[mode]}); // САЙТ (IDENTITEIT-015): режим меню сайту`);
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
    write("#mqPaginaNavNoot",preferences.lang==="nl"?"Positie en gedrag gelden ook voor het menu van de site en worden in uw account bewaard. Stijl en inhoud van de knoppen gelden alleen voor de navigatie van deze pagina op dit apparaat.":"Положення й поведінка діють і на меню сайту та зберігаються в обліковому записі. Стиль і вміст кнопок — лише навігація цієї сторінки на цьому пристрої.");
    write("#mqPaginaNavKnop",preferences.lang==="nl"?"Menu-instellingen van de site":"Налаштування меню сайту");`);
fs.writeFileSync(f, s);
console.log('ok');
