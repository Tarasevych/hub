// Точкові правки двигуна «Макет» після збирання: гнізда справжніх панелей, зв'язок із сайтом, прибирання, пороги ширини.
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

// 2. Справжні панелі замість демонстраційних елементів: гніздо .mq-echt у картці (розділи 1–5 та «Ідентичності») і у вкладеній панелі.
v(`  function directSettings(s){
    if(!directSettingsSections.has(s.id))return "";
    return '<div class="direct-settings" role="group" aria-label="'+s.name+'">'+
      locales[preferences.lang].panels[s.id].map((control,i)=>drawerControl(control,i,s.id)).join("")+
      '</div>';
  }`,
`  // САЙТ: замість демонстраційних елементів макета — гніздо, у яке застосунок монтує справжню панель розділу з чинними діями й правами.
  function directSettings(s){
    if(!directSettingsSections.has(s.id))return "";
    return '<div class="direct-settings mq-direct" role="group" aria-label="'+s.name+'"><div class="mq-echt" data-echt="'+s.id+'"></div></div>';
  }`);
v(`    panel.innerHTML=
      '<div class="inline-settings-header">`,
`    if(panel.querySelector('.mq-echt')){оновитиФотоПрофілю();return;} // САЙТ: гніздо справжньої панелі будуємо один раз, щоб не втрачати змонтовану форму
    panel.innerHTML=
      '<div class="inline-settings-header">`);
v(`      '<div class="inline-settings-workspace '+(visualPreview?'has-preview':'no-preview')+'">'+
        '<div class="inline-settings-controls"><div class="drawer-controls-list">'+locales[preferences.lang].panels[id].map((control,i)=>drawerControl(control,i,id)).join("")+'</div></div>'+
        (visualPreview?'<aside class="inline-live-panel" aria-label="'+t.previewSample+'"><div class="inline-preview-body">'+drawerPreview(s)+'</div></aside>':'')+
      '</div>'+tekenМайбутніМожливості(id);`,
`      '<div class="inline-settings-workspace no-preview">'+
        '<div class="inline-settings-controls"><div class="mq-echt" data-echt="'+id+'"></div></div>'+
      '</div>'+tekenМайбутніМожливості(id);
    void visualPreview;`);
v(`    if(newlyOpened){panel.hidden=false;renderInlinePanel(id);requestAnimationFrame(()=>panel.classList.add('entered'));}`,
`    if(newlyOpened){panel.hidden=false;renderInlinePanel(id);opties.bijOpenen(id);requestAnimationFrame(()=>panel.classList.add('entered'));}`);

// 3. Перехід до розділу повідомляє застосунок (адреса), крім переходу, що прийшов від самого застосунку.
v(`  function jump(id){
    closeHorizontalNavMenu();`,
`  function jump(id,stil=false){
    if(!stil&&sections.some(s=>s.id===id))opties.bijKies(id); // САЙТ: адресу сторінки змінює застосунок
    closeHorizontalNavMenu();`);

// 4. Вибір файла світлини — лише в макеті; на сайті світлину змінюють у розділі «Акаунт».
v(`  byId("profilePhotoFile").addEventListener("change",подія=>{`, `  byId("profilePhotoFile")?.addEventListener("change",подія=>{`);
v(`    byId("profilePhotoPickLabel").textContent=перекладПрофілю("Обрати свою світлину для макета","Eigen foto voor het ontwerp kiezen");`,
`    { const вибір=byId("profilePhotoPickLabel"); if(вибір)вибір.textContent=перекладПрофілю("Обрати свою світлину для макета","Eigen foto voor het ontwerp kiezen"); } // САЙТ: вибору файла немає`);

// 4б. Лівої смуги сервісів макета на сайті немає (її роль виконує бічне меню сайту).
v(`    root.querySelector(".app-rail").setAttribute("aria-label",t.workspace);
    root.querySelector(".brand-mark").setAttribute("aria-label",t.workspace);`,
`    // САЙТ: смуги сервісів і знака макета немає — їх замінює бічне меню сайту.`);

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

// 5. Спостерігачі й таймери прибираються разом із компонентом.
v(`  if(typeof ResizeObserver!=="undefined")new ResizeObserver(()=>requestAnimationFrame(updatePillDimensions)).observe(byId("anchorRail"));`,
`  if(typeof ResizeObserver!=="undefined"){const ro=new ResizeObserver(()=>requestAnimationFrame(updatePillDimensions));ro.observe(byId("anchorRail"));luisteraars.push(()=>ro.disconnect());}
  // САЙТ: пороги ширини макета (@media) переведено на класи кореня за шириною робочої області, бо бічне меню сайту забирає ширину вікна.
  // Зсуви закріплених елементів: бічне меню сайту (--mq-links), командна смуга сайту (--mq-site) і верхня планка макета (--mq-boven).
  const DREMPELS=${JSON.stringify(drempels)};
  function zetMaten(){
    const b=breed();
    for(const n of DREMPELS){root.classList.toggle("bp-max-"+n,b<=n);root.classList.toggle("bp-min-"+n,b>=n);}
    const stijl=werkvlak?getComputedStyle(werkvlak):null;
    const maat=n=>stijl?parseFloat(stijl[n])||0:0;
    const links=maat("paddingLeft"), site=maat("paddingTop");
    const planck=root.querySelector(".topbar")?.offsetHeight||0;
    root.style.setProperty("--mq-links",links+"px");
    root.style.setProperty("--mq-rechts",maat("paddingRight")+"px");
    root.style.setProperty("--mq-onder",maat("paddingBottom")+"px");
    root.style.setProperty("--mq-site",site+"px");
    root.style.setProperty("--mq-boven",(site+planck)+"px");
  }
  zetMaten();
  if(typeof ResizeObserver!=="undefined"){const ro2=new ResizeObserver(()=>{zetMaten();requestAnimationFrame(updatePillDimensions);});ro2.observe(root);luisteraars.push(()=>ro2.disconnect());}
  luisteraars.push(()=>{cancelRailAutoCollapse();clearTimeout(showToast.timer);});`);
v(`  },{threshold:.06,rootMargin:"0px 0px 40px 0px"});
  renderAll();`,
`  },{threshold:.06,rootMargin:"0px 0px 40px 0px"});
  luisteraars.push(()=>revealObserver.disconnect());
  renderAll();
  zetMaten();`);
v(`    ga(id, open) { jump(id); if (open) openInlineSettings(id); },`,
`    ga(id, open) { if (open && !directSettingsSections.has(id)) openInlineSettings(id); jump(id, true); },
    direct: [...directSettingsSections],`);
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
`  /** Розділ розгорнуто: сайт монтує справжню панель у гніздо. */
  bijOpenen: (id: string) => void;
  /** Картки перемальовано (мова, повторне малювання): гнізда .mq-echt створено заново. */
  bijRender: () => void;`);
fs.writeFileSync(f, s);
console.log('ok');
