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
fs.writeFileSync(f, s);
console.log('ok');
