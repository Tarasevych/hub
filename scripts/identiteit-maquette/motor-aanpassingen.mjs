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

// 3. Перехід до розділу повідомляє застосунок (адреса), крім переходу, що прийшов від самого застосунку.
v(`  function jump(id){
    closeHorizontalNavMenu();`,
`  function jump(id,stil=false){
    if(!stil&&sections.some(s=>s.id===id))opties.bijKies(id); // САЙТ: адресу сторінки змінює застосунок
    closeHorizontalNavMenu();`);

// 4. Діалог світлини: вибору файла немає (світлина — з облікового запису); кнопки ведуть до розділу «Акаунт» і до меню облікового запису сайту.
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

// 4в. Ctrl+K усередині вигляду відкриває пошук розділів макета, а не глобальний пошук сайту (сайт слухає ту саму комбінацію на document):
//     слухаємо на window у фазі перехоплення і зупиняємо подальшу обробку лише для Ctrl/⌘+K.
v(`  luister(doc,"keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();searchOverlay.hidden?openSearch():closeSearch();}`,
`  luister(window,"keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();e.stopImmediatePropagation();searchOverlay.hidden?openSearch():closeSearch();} // САЙТ: перехоплює комбінацію раніше за глобальний пошук сайту`);
v(`      if(e.target.closest('.section-inline-settings'))closeInlineSettings(e.target.closest('.section-inline-settings').dataset.inlineSection);
    }
  });`,
`      if(e.target.closest?.('.section-inline-settings'))closeInlineSettings(e.target.closest('.section-inline-settings').dataset.inlineSection);
    }
  },true);`);

// 5. Спостерігачі й таймери прибираються разом із компонентом; пороги ширини та зсуви закріплених елементів.
v(`  if(typeof ResizeObserver!=="undefined")new ResizeObserver(()=>requestAnimationFrame(updatePillDimensions)).observe(byId("anchorRail"));`,
`  if(typeof ResizeObserver!=="undefined"){const ro=new ResizeObserver(()=>requestAnimationFrame(updatePillDimensions));ro.observe(byId("anchorRail"));luisteraars.push(()=>ro.disconnect());}
  // САЙТ: пороги ширини макета (@media) переведено на класи кореня за шириною робочої області (не вікна).
  // Зсуви закріплених елементів: смуга сервісів макета плюс відступ робочої області сайту (--mq-links), верхні відступи (--mq-site, --mq-boven).
  const DREMPELS=${JSON.stringify(drempels)};
  function zetMaten(){
    const b=breed();
    for(const n of DREMPELS){root.classList.toggle("bp-max-"+n,b<=n);root.classList.toggle("bp-min-"+n,b>=n);}
    const stijl=werkvlak?getComputedStyle(werkvlak):null;
    const maat=n=>stijl?parseFloat(stijl[n])||0:0;
    const rail=root.querySelector(".app-rail");
    const railBreed=rail&&getComputedStyle(rail).display!=="none"?rail.offsetWidth:0;
    const links=maat("paddingLeft")+railBreed, site=maat("paddingTop");
    const planck=root.querySelector(".topbar")?.offsetHeight||0;
    root.style.setProperty("--mq-links",links+"px");
    root.style.setProperty("--mq-site-links",maat("paddingLeft")+"px");
    root.style.setProperty("--mq-rechts",maat("paddingRight")+"px");
    root.style.setProperty("--mq-onder",maat("paddingBottom")+"px");
    root.style.setProperty("--mq-site",site+"px");
    root.style.setProperty("--mq-boven",(site+planck)+"px");
    if(rail)rail.style.left=maat("paddingLeft")+"px";
  }
  zetMaten();
  if(typeof ResizeObserver!=="undefined"){const ro2=new ResizeObserver(()=>{zetMaten();requestAnimationFrame(updatePillDimensions);});ro2.observe(root);luisteraars.push(()=>ro2.disconnect());}
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
