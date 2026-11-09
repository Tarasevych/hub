const sections = [
  {
    id:"personalization", group:"personal", number:"01", name:"Персоналізація", short:"Персоналізація", icon:"✦",
    kicker:"ВАШ ПОЧЕРК", title:"Простір, який відчувається вашим.",
    description:"Зовнішній вигляд, поведінка інтерфейсу та особисті вподобання — зібрані в одному красивому місці.",
    accent:"violet", art:"personalization",
    details:[
      {icon:"◈",label:"Меню й піктограми",note:"Порядок, кольори та характер навігації"},
      {icon:"☼",label:"Теми й атмосфера",note:"Світло, контраст і ваша палітра"},
      {icon:"⊞",label:"Віджети та блоки",note:"Робочий простір без зайвого шуму"}
    ]
  },
  {
    id:"menu", group:"personal", number:"02", name:"Меню", short:"Меню", icon:"☷",
    kicker:"ПОВНА СВОБОДА", title:"Навігація під вашу руку.",
    description:"Розташування меню, швидкий доступ, стиль іконок та делікатні анімації. Точне налаштування без складності.",
    accent:"cyan", art:"menu",
    details:[
      {icon:"↔",label:"Розташування",note:"Ліворуч · праворуч · верх · низ"},
      {icon:"◌",label:"Швидкий доступ",note:"Ваші улюблені дії під рукою"},
      {icon:"⋮",label:"Вигляд панелі",note:"Розгорнутий, компактний або док"}
    ],
    special:"dock"
  },
  {
    id:"themes", group:"personal", number:"03", name:"Теми", short:"Теми", icon:"◑",
    kicker:"ГРА СВІТЛА", title:"Настрій у кожному пікселі.",
    description:"Оберіть темний камерний простір або легку світлу атмосферу. Відтінки, які підтримують концентрацію.",
    accent:"pink", art:"themes",
    details:[
      {icon:"◕",label:"Темна",note:"Глибина, спокій та кінематографічний контраст"},
      {icon:"◒",label:"Світла",note:"Повітря, м'які тіні та чистота"},
      {icon:"✳",label:"Акцент",note:"Особистий колір для активних елементів"}
    ],
    special:"theme"
  },
  {
    id:"languages", group:"personal", number:"04", name:"Мови", short:"Мови", icon:"文",
    kicker:"ВАШ ГОЛОС", title:"Зрозуміло з першого погляду.",
    description:"Мова інтерфейсу — це частина комфорту. Швидке перемикання між українською та нідерландською.",
    accent:"mint", art:"languages",
    details:[
      {icon:"УК",label:"Українська",note:"Основна мова інтерфейсу"},
      {icon:"NL",label:"Nederlands",note:"Для повсякденного життя в Бельгії"}
    ],
    special:"language"
  },
  {
    id:"widgets", group:"personal", number:"05", name:"Віджети", short:"Віджети", icon:"⊞",
    kicker:"ЗБЕРІТЬ СВОЄ", title:"Маленькі деталі. Велика різниця.",
    description:"Побудуйте робочий простір із корисних блоків. Обирайте те, що важливе саме сьогодні.",
    accent:"amber", art:"widgets",
    details:[
      {icon:"⊞",label:"Додавання блоків",note:"Сервіси, інструменти та зовнішні посилання"},
      {icon:"▥",label:"Компонування",note:"Зручні розміри й порядок елементів"}
    ]
  },
  {
    id:"sharing", group:"social", number:"06", name:"Спільний доступ", short:"Доступ", icon:"◎",
    kicker:"ВАШІ КОРДОНИ", title:"Діліться лише тим, чим хочете.",
    description:"Прозорі права доступу, чіткі запрошення й повне розуміння того, хто що бачить.",
    accent:"blue", art:"sharing",
    details:[
      {icon:"♙",label:"Доступ за акаунтом",note:"Запрошення та керовані ролі"},
      {icon:"↗",label:"Доступ за посиланням",note:"Окремі параметри та обмеження"}
    ]
  },
  {
    id:"identities", group:"social", number:"07", name:"Ідентичності", short:"Ідентичності", icon:"◇",
    kicker:"ДВА РЕЖИМИ", title:"Кожна роль на своєму місці.",
    description:"Особистий і технічний профілі залишаються виразно відокремленими — і в логіці, і у візуальному стилі.",
    accent:"violet", art:"identities",
    details:[
      {icon:"◉",label:"Звичайний профіль",note:"Щоденні інструменти та особистий простір"},
      {icon:"⌘",label:"Технічний профіль",note:"Окремий візуальний режим для адміністрування"}
    ]
  },
  {
    id:"account", group:"account", number:"08", name:"Акаунт і дані", short:"Акаунт і дані", icon:"▣",
    kicker:"ВАШІ ДАНІ", title:"Усе важливе — під контролем.",
    description:"Профіль, дані та відповідальні дії згруповано за змістом. Важливі рішення ніколи не губляться серед дрібних перемикачів.",
    accent:"cyan", art:"account",
    details:[
      {icon:"▧",label:"Профіль",note:"Основні відомості вашого акаунта"},
      {icon:"⇩",label:"Дані й експорт",note:"Перегляд та керування вашими даними"},
      {icon:"!",label:"Небезпечні дії",note:"Відокремлена зона з підтвердженням"}
    ]
  },
  {
    id:"sessions", group:"account", number:"09", name:"Сесії та пристрої", short:"Пристрої", icon:"▤",
    kicker:"ВАШІ ПІДКЛЮЧЕННЯ", title:"Видно кожен пристрій.",
    description:"Активні сесії, історія та підключені пристрої — візуально зрозумілі з першого погляду.",
    accent:"mint", art:"sessions",
    details:[
      {icon:"▱",label:"Пристрої",note:"Тип, браузер і остання активність"},
      {icon:"◷",label:"Сесії",note:"Огляд та керування входами"}
    ]
  },
  {
    id:"methods", group:"account", number:"10", name:"Способи входу", short:"Способи входу", icon:"⌁",
    kicker:"БЕЗ ЗАЙВИХ ПАРОЛІВ", title:"Безпечний вхід. Менше тертя.",
    description:"Google, ключі доступу та способи підтвердження важливих дій — кожен на своєму місці.",
    accent:"pink", art:"methods",
    details:[
      {icon:"G",label:"Google",note:"Основний спосіб входу"},
      {icon:"✳",label:"Ключі доступу",note:"Підтвердження захищених дій"}
    ]
  },
  {
    id:"security", group:"security", number:"11", name:"Безпека", short:"Безпека", icon:"⬡",
    kicker:"ТИХА ВПЕВНЕНІСТЬ", title:"Захист, який можна зрозуміти.",
    description:"Двофакторна автентифікація, шифрування, ключі та дозволи — без прихованих деталей і двозначності.",
    accent:"blue", art:"security",
    details:[
      {icon:"⊙",label:"Підтвердження входу",note:"TOTP і ключі доступу"},
      {icon:"⌘",label:"Шифрування",note:"Ключі та межі захисту даних"},
      {icon:"♙",label:"Гостьовий доступ",note:"Обмежені права й історія"}
    ]
  },
  {
    id:"recovery", group:"security", number:"12", name:"Відновлення доступу", short:"Відновлення", icon:"✣",
    kicker:"ПЛАН Б", title:"Спокій навіть у непередбачуваному.",
    description:"Відновлення доступу повинно бути передбачуваним: із чіткими поясненнями, ризиками та шляхами дій.",
    accent:"amber", art:"recovery",
    details:[
      {icon:"⌑",label:"Коди відновлення",note:"Резервний спосіб підтвердження"},
      {icon:"◈",label:"Рекомендації",note:"Що зберегти та як не втратити доступ"}
    ]
  }
];

const byId = id => document.getElementById(id);
const body = document.body;
const STORAGE_KEY = "account-atelier-preferences-v1";
let preferences = {position:"right",compact:false,navStyle:"classic",iconOnly:false,theme:"dark",accent:"violet",lang:"uk"};
try {
  const saved=localStorage.getItem(STORAGE_KEY);
  if(saved) preferences={...preferences,...JSON.parse(saved)};
  else if(matchMedia("(max-width: 730px)").matches) preferences.position="bottom";
} catch {}
// Version 32 stored icons as an exclusive style. Migrate without losing the
// user's selection; button content and surface are independent from now on.
if(preferences.navStyle==="icons"){
  preferences.navStyle="classic";
  preferences.iconOnly=true;
}
preferences.iconOnly=Boolean(preferences.iconOnly);
preferences.railMode=preferences.railMode|| (preferences.compact?"collapsed":"expanded");
if(!["expanded","collapsed","auto"].includes(preferences.railMode))preferences.railMode="expanded";
preferences.compact=preferences.railMode!=="expanded";
const expandedNavGroups=new Set(["personal"]);
let horizontalNavTrigger=null;
const isHorizontalNav=()=>["top","bottom"].includes(preferences.position);
const isAutoRail=()=>body.classList.contains("rail-smart-condensed")||preferences.railMode==="auto";
const adaptiveNavToggle=byId("adaptiveNavToggle");
const adaptiveNavScrim=byId("adaptiveNavScrim");
const adaptiveNavEdge=byId("adaptiveNavEdge");
let drawerOpenedByControl=false;
function placeAdaptiveNavToggle(){
  // Keep the hamburger on the same edge as the temporary side drawer.
  // Moving the existing node preserves its event listeners and focus state.
  const onRight=preferences.position==="right";
  const host=document.querySelector(onRight?".top-actions":".topbar-start");
  if(adaptiveNavToggle.parentElement!==host){
    if(onRight)host.append(adaptiveNavToggle);
    else host.prepend(adaptiveNavToggle);
  }
}
function setAdaptiveNavOpen(open,{explicit=false}={}){
  const visible=Boolean(open&&body.classList.contains("rail-smart-condensed"));
  if(!visible)drawerOpenedByControl=false;
  else if(explicit)drawerOpenedByControl=true;
  body.classList.toggle("rail-smart-open",visible);
  adaptiveNavScrim.hidden=!visible;
  byId("anchorRail").setAttribute("aria-hidden",String(!visible&&body.classList.contains("rail-smart-condensed")));
  adaptiveNavToggle.setAttribute("aria-expanded",String(visible));
  adaptiveNavToggle.setAttribute("aria-label",preferences.lang==="nl"?(visible?"Navigatie sluiten":"Navigatie openen"):(visible?"Закрити навігацію":"Відкрити навігацію"));
  adaptiveNavToggle.title=adaptiveNavToggle.getAttribute("aria-label");
  const edgeLabel=preferences.lang==="nl"?"Zijmenu openen":"Відкрити бічне меню";
  adaptiveNavEdge.setAttribute("aria-label",edgeLabel);
  adaptiveNavEdge.title=edgeLabel;
  if(byId("railExpand"))syncRailCompactButton();
}
let stableSideNavWidth=212;
function naturalDrawerWidth(){
  if(preferences.iconOnly)return 88;
  // The compact drawer must fit the longest button, including closed groups.
  // Measure text at its actual font size instead of the clipped panel width.
  const meter=document.createElement("span");
  meter.style.cssText="position:fixed;left:-9999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none";
  document.body.append(meter);
  let widest=0;
  byId("railItems").querySelectorAll(".anchor-link,.nav-group-toggle").forEach(button=>{
    const label=button.querySelector(".anchor-name,.nav-group-name");
    if(!label)return;
    const type=getComputedStyle(label);
    meter.style.font=`${type.fontStyle} ${type.fontWeight} ${type.fontSize} ${type.fontFamily}`;
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
}
function syncAdaptiveNavigation(){
  placeAdaptiveNavToggle();
  // A breakpoint depends on the reserved footprint, never on button style
  // or whether the pointer temporarily expanded an auto-mode rail.
  const eligible=!isHorizontalNav();
  const navWidth=preferences.iconOnly?60:preferences.railMode==="expanded"?naturalSideNavWidth():60;
  const appLane=innerWidth<=730?0:74;
  const layoutGutters=innerWidth<=730?26:95;
  const projectedCanvas=innerWidth-appLane-navWidth-19-layoutGutters;
  const condense=eligible&&projectedCanvas<680;
  const wasCondensed=body.classList.contains("rail-smart-condensed");
  body.classList.toggle("rail-smart-condensed",condense);
  body.classList.toggle("rail-mode-auto",condense||preferences.railMode==="auto");
  if(condense){
    const drawerWidth=naturalDrawerWidth()+"px";
    if(body.style.getPropertyValue("--smart-drawer-width")!==drawerWidth)
      body.style.setProperty("--smart-drawer-width",drawerWidth);
  }
  if(!condense&&body.classList.contains("rail-smart-open"))setAdaptiveNavOpen(false);
  setAdaptiveNavOpen(body.classList.contains("rail-smart-open"));
  byId("anchorRail").setAttribute("aria-hidden",String(condense&&!body.classList.contains("rail-smart-open")));
  // No persistent rail variant is meaningful when the menu is an overlay.
  const modePicker=byId("navSettings").querySelector(".nav-mode-picker");
  if(condense&&modePicker.contains(document.activeElement)){
    byId("closeNavSettings").focus({preventScroll:true});
  }
  modePicker.hidden=condense;
  byId("adaptiveModeDescription").hidden=!condense;
  byId("adaptiveModeDescription").textContent=ui().adaptiveNavModeOnly;
  const selectedMode=condense?"auto":preferences.railMode;
  document.querySelectorAll("[data-rail-mode]").forEach(button=>{
    const on=button.dataset.railMode===selectedMode;
    button.classList.toggle("selected",on);
    button.setAttribute("aria-pressed",String(on));
  });
  byId("navSettings").querySelector(":scope > p").textContent=condense?ui().adaptiveNavHelp:ui().dragHelp;
  if(wasCondensed!==condense){
    applyRailCollapsed(condense||preferences.railMode==="collapsed"||preferences.railMode==="auto"&&!railPointerInside);
  }
}
const persist = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)); } catch {} };
const pill = text => '<span class="art-pill">'+text+'</span>';
const arrowIcon='<svg class="arrow-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 5 7 7-7 7"/></svg>';
const chevronIcon='<svg class="expand-chevron" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7.5 5 5 5-5"/></svg>';
const ui = () => locales[preferences.lang].ui;
const localizedSections = () => sections.map(base=>{
  const nl=locales[preferences.lang].sections?.[base.id];
  if(!nl)return base;
  return {...base,...nl,details:base.details.map((d,i)=>({...d,label:nl.details[i][0],note:nl.details[i][1]}))};
});
const iconPaths = {
  intro:'<path d="m3 11 9-8 9 8v9H3z"/><path d="M9 20v-7h6v7"/>',
  personalization:'<path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m19 17 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/>',
  menu:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M6 8h.01M6 12h.01M12 9h6M12 13h5"/>',
  themes:'<path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-2a2 2 0 0 1-2-2V6a3 3 0 0 0-3-3Z"/><circle cx="7" cy="10" r=".8"/><circle cx="10" cy="7" r=".8"/><circle cx="7" cy="15" r=".8"/>',
  languages:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 6-5 12 0 18M12 3c5 6 5 12 0 18"/>',
  widgets:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sharing:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
  identities:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0M18 3l2 2m0-2-2 2"/>',
  account:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M5.8 16a3.5 3.5 0 0 1 6.4 0M15 8h4M15 12h4M15 16h3"/>',
  sessions:'<rect x="2" y="4" width="15" height="12" rx="2"/><path d="M6 20h7M9.5 16v4"/><rect x="18" y="9" width="4" height="10" rx="1"/>',
  methods:'<circle cx="8" cy="15" r="4"/><path d="M11 12 21 2M16 7l3 3M18 5l3 3"/>',
  security:'<path d="M12 2 20 6v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
  recovery:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6m5.6 5.6 3.6 3.6M18.4 5.6l-3.6 3.6m-5.6 5.6-3.6 3.6"/>'
};
function iconSvg(id){return '<svg class="semantic-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">'+(iconPaths[id]||iconPaths.intro)+'</svg>';}

function visual(type){
  const a=locales[preferences.lang].art;
  switch(type){
    case "personalization": return '<div class="art art-personalization"><div class="art-halo"></div><div class="floating-window main-window"><div class="window-top"><i></i><i></i><i></i></div><div class="window-row"><span></span><b></b></div><div class="window-row second"><span></span><b></b></div><div class="window-row third"><span></span><b></b></div></div><div class="floating-window smaller-window"><span>✦</span><strong>'+a.makeYours+'</strong><small>'+a.personalSpace+'</small></div><span class="art-spark spark-a">✳</span><span class="art-spark spark-b">✦</span></div>';
    case "menu": return '<div class="art art-menu"><div class="art-orbit">'+["меню","палітра","блоки","користувачі","захист","пристрій"].map(ключ=>'<span>'+піктограмаЗаСуттю(ключ)+'</span>').join("")+'</div><div class="art-middle">'+a.nav+'<br><b>360°</b></div><div class="art-menu-label">'+a.anyEdge+'</div></div>';
    case "themes": return '<div class="art art-themes"><div class="theme-sample theme-sample-back"><span class="theme-sample-dot"></span><i></i><i></i></div><div class="theme-sample theme-sample-front"><div class="sample-moon">◑</div><strong>'+a.beautifully+'</strong><div class="sample-pills"><span></span><span></span><span></span></div></div></div>';
    case "languages": return '<div class="art art-languages"><div class="language-card language-back">'+a.hello1+' <span>'+a.hello2+'</span></div><div class="language-card language-front"><small>'+a.commonSpace+'</small><strong>'+a.greeting+'</strong><span>UA ↔ NL</span></div><span class="language-ring"></span></div>';
    case "widgets": return '<div class="art art-widgets"><div class="widget-art-grid"><div><small>'+a.widgets+'</small><span>'+піктограмаЗаСуттю("строк")+'</span><small>'+a.widgetCalendar+'</small></div><div><span>'+піктограмаЗаСуттю("пошта")+'</span><small>'+a.widgetMail+'</small></div><div><span>'+піктограмаЗаСуттю("нотатка")+'</span><small>'+a.widgetNotes+'</small></div><div><span>'+піктограмаЗаСуттю("додати")+'</span><small>'+a.create+'</small></div></div></div>';
    case "sharing": return '<div class="art art-sharing"><div class="sharing-permissions-card"><div class="sharing-card-head"><span>'+піктограмаЗаСуттю("захист")+'</span><strong>'+a.sharingTitle+'</strong></div><div class="sharing-person-row"><div class="sharing-person-avatar profile-avatar" data-profile-photo></div><span>'+a.sharingOwner+'</span><b>'+піктограмаЗаСуттю("перевірка")+'</b></div><div class="sharing-person-row"><div class="sharing-person-avatar sharing-invite-avatar">'+піктограмаЗаСуттю("запрошення")+'</div><span>'+a.sharingInvite+'</span><em>'+a.sharingView+'</em></div><div class="sharing-link-row"><span>'+піктограмаЗаСуттю("посилання")+'</span><strong>'+a.sharingLink+'</strong><small>'+a.sharingOff+'</small></div><div class="sharing-card-foot">'+піктограмаЗаСуттю("права")+'<span>'+a.sharingSecure+'</span></div></div><div class="sharing-art-footer">'+a.verified+'</div></div>';
    case "identities": return '<div class="art art-identities"><div class="identity-card identity-back"><small>'+a.tech+'</small><strong class="identity-tech-mark"><svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="13" y="13" width="22" height="22" rx="5"/><path d="M18 5v8M30 5v8M18 35v8M30 35v8M5 18h8M5 30h8M35 18h8M35 30h8"/><path d="m20 24 3 3 6-7"/></svg></strong><span>'+a.control+'</span></div><div class="identity-card identity-front"><small>'+a.personal+'</small><div class="identity-avatar profile-avatar" data-profile-photo></div><strong data-profile-name>'+naamVoorProfiel()+'</strong><span>'+a.daily+'</span></div><span class="identity-mode-badge">'+a.personal+'</span></div>';
    case "account": return '<div class="art art-account"><div class="account-outer-ring"></div><div class="account-folder"><div class="folder-tab"></div><span>'+піктограмаЗаСуттю("дані")+'</span><strong>'+a.yourData+'</strong><small>'+a.inHands+'</small></div><div class="account-stamp">'+a.private+'</div></div>';
    case "sessions": return '<div class="art art-sessions"><div class="device-screen"><div class="device-notch"></div><div class="device-wave"></div><span>'+піктограмаЗаСуттю("сеанси")+'</span></div><div class="device-phone"><div class="device-notch"></div><span>'+піктограмаЗаСуттю("перевірка")+'</span></div><div class="device-label">'+a.devices+'</div></div>';
    case "methods": return '<div class="art art-methods"><div class="methods-art-card"><div class="methods-art-row"><span class="methods-art-brand">'+піктограмаЗаСуттю("гугл")+'</span><span><strong>Google</strong><small>'+a.methodsPrimary+'</small></span>'+піктограмаЗаСуттю("перевірка")+'</div><div class="methods-art-divider"><span></span><small>'+a.methodsNote+'</small><span></span></div><div class="methods-art-row"><span class="methods-art-key">'+піктограмаЗаСуттю("ключдоступу")+'</span><span><strong>'+a.passkey+'</strong><small>'+a.methodsConfirm+'</small></span>'+піктограмаЗаСуттю("захист")+'</div></div></div>';
    case "security": return '<div class="art art-security"><div class="security-ring ring-outer"></div><div class="security-ring ring-inner"></div><div class="shield-shape"><span>'+піктограмаЗаСуттю("захист")+'</span></div><span class="security-art-label security-label-one">'+піктограмаЗаСуттю("автентифікатор")+' '+a.securityCheck+'</span><span class="security-art-label security-label-two">'+піктограмаЗаСуттю("замок")+' '+a.securityEncrypt+'</span></div>';
    case "recovery": return '<div class="art art-recovery"><div class="recovery-sun"></div><div class="recovery-ticket"><span>'+a.recovery+'</span><div class="recovery-art-code">'+піктограмаЗаСуттю("коди")+'<strong>•••• ••••</strong></div><small>'+a.backupCodes+'</small></div><span class="recovery-star">'+піктограмаЗаСуттю("відновлення")+'</span></div>';
    default: return "";
  }
}

// Immediate switches and short choices stay on their cards. Multi-step account,
// access and security workspaces retain their expandable detail panels.
// The rail gear remains the single home for positioning and menu style.
// Уже оформлені швидкі налаштування завжди залишаються на своїх місцях.
const directSettingsSections=new Set(["personalization","menu","themes","languages","widgets","identities"]);
function directSettings(s){
  if(!directSettingsSections.has(s.id))return "";
  return '<div class="direct-settings" role="group" aria-label="'+s.name+'">'+
    locales[preferences.lang].panels[s.id].map((control,i)=>drawerControl(control,i,s.id)).join("")+
    '</div>';
}

function renderCard(s){
  const expandable=!directSettingsSections.has(s.id);
  return '<section class="setting-section accent-'+s.accent+'" id="'+s.id+'" data-section="'+s.id+'">' +
    '<div class="section-card">' +
      '<div class="setting-main">' +
        '<div class="setting-topline"><span class="setting-index">'+s.number+' / 12</span><span class="setting-divider"></span><span>'+s.kicker+'</span></div>' +
        '<div class="setting-symbol'+(s.id==="identities"?' profile-avatar':'')+'"'+(s.id==="identities"?' data-profile-photo':'')+'>'+(s.id==="identities"?'':iconSvg(s.id))+'</div>' +
        '<h2>'+s.title+'</h2><p>'+s.description+'</p>' +
        (expandable?'<button class="text-link open-detail" data-for="'+s.id+'" aria-controls="inline-'+s.id+'" aria-expanded="false">'+ui().openSettings+' <span>'+chevronIcon+'</span></button>':'') +
      '</div>' +
      visual(s.art) +
    '</div>' +
    directSettings(s)+
    (!expandable?tekenМайбутніМожливості(s.id):'')+
    (expandable?'<div id="inline-'+s.id+'" class="section-inline-settings" data-inline-section="'+s.id+'" role="region" aria-label="'+s.name+'" hidden></div>':'')+
    '</section>';
}

function renderStatic(){
  const t=ui();
  const write=(selector,value,html=false)=>{
    const el=document.querySelector(selector);
    if(el){if(html)el.innerHTML=value;else el.textContent=value;}
  };
  document.documentElement.lang=preferences.lang;
  document.title=t.settings+" — "+t.workspace;
  write("#breadcrumbWorkspace",t.workspace);
  write(".breadcrumbs strong",t.settings);
  write(".concept-pill",'<span class="concept-dot"></span>'+t.concept,true);
  write(".search-action span",t.quickJump);
  write(".hero-eyebrow",'<span class="line"></span>'+t.heroEyebrow+'<span class="line"></span>',true);
  write(".hero h1",t.heroTitle[0]+'<br><em>'+t.heroTitle[1]+'</em>',true);
  write(".hero-copy p",t.heroDesc);
  write(".primary-button",t.startSetup+' <span>'+arrowIcon+'</span>',true);
  write(".ghost-button",t.navPlacement+' <span>⌘</span>',true);
  write(".hero-foot span:first-child",'<b>12</b> '+t.sectionCount,true);
  write(".hero-foot span:nth-of-type(2)",t.controlCenter);
  write(".hero-foot .hero-foot-last",t.profiles);
  document.querySelectorAll(".section-overline-text").forEach((el,i)=>el.textContent=t.groups[i]);
  document.querySelectorAll(".interlude p").forEach((el,i)=>el.innerHTML=t.interludes[i][0]+' <em>'+t.interludes[i][1]+'</em>');
  write(".site-footer strong",t.workspace);
  write(".site-footer div span","Account Atelier / "+t.footer);
  write(".to-top",t.backTop);
  write(".rail-title strong",t.navigation);
  write(".rail-title small",t.dragToEdge);
  byId("railProgressGauge").setAttribute("aria-label",t.scrollProgress);
  byId("railProgressHelp").setAttribute("aria-label",preferences.lang==="nl"?"Wat betekent de voortgangscirkel?":"Що означає колова шкала?");
  byId("railProgressHelp").title=preferences.lang==="nl"?"Geeft aan welk deel van de pagina je hebt bekeken":"Показує, яку частину сторінки ви переглянули";
  write(".popover-head small",t.anchorPlacement);
  write(".popover-head strong",t.positionPrompt);
  document.querySelectorAll("#dockPicker [data-pos]").forEach(el=>{
    el.lastChild.textContent=t.positions[el.dataset.pos];
  });
  write("#navModeLabel",t.navModeLabel);
  document.querySelectorAll("[data-rail-mode]").forEach(el=>el.textContent=t.navModes[el.dataset.railMode]);
  write("#navStyleLabel",t.navStyle);
  document.querySelectorAll(".nav-style-picker [data-nav-style]").forEach(el=>el.textContent=({classic:t.navClassic,pills:t.navPills})[el.dataset.navStyle]);
  write("#navIconLabel",t.navIconLabel);
  document.querySelectorAll("[data-icon-display]").forEach(el=>el.textContent=el.dataset.iconDisplay==="icons"?t.navIcons:t.navNames);
  write(".popover-panel p",t.dragHelp);
  byId("commandInput").placeholder=t.findSection;
  write(".command-hint",t.commandHeading);
  write(".command-footer",t.choose+' <span>'+t.go+'</span>',true);
  byId("anchorRail").setAttribute("aria-label",t.navigation);
  byId("navSettings").setAttribute("aria-label",t.navPlacement);
  byId("searchOverlay").querySelector('[role="dialog"]').setAttribute("aria-label",t.quickJump);
  byId("railDrag").setAttribute("aria-label",t.dragToEdge);
  byId("openSearch").setAttribute("aria-label",t.quickJump);
  byId("railConfig").setAttribute("aria-label",t.navPlacement);
  byId("railConfig").title=t.navPlacement;
  syncRailCompactButton();
  byId("closeNavSettings").setAttribute("aria-label",t.drawerDone);
  document.querySelector(".app-rail").setAttribute("aria-label",t.workspace);
  document.querySelector(".brand-mark").setAttribute("aria-label",t.workspace);
  document.querySelector(".top-avatar").setAttribute("aria-label",preferences.lang==="nl"?"Echte profielfoto bekijken":"Переглянути справжню світлину профілю");
  document.querySelectorAll(".app-icon:not(.theme-button)").forEach((el,i)=>{
    const titles=preferences.lang==="nl"?["Instellingen","Mijn Ruimte","AI voor jou","Mail","Cloudopslag","GitHub"]:["Налаштування","Мій простір","ШІ для вас","Пошта","Хмарне сховище","GitHub"];
    el.title=titles[i];
    el.setAttribute("aria-label",titles[i]);
  });
}
function renderAll(){
  closeHorizontalNavMenu();
  renderStatic();
  const localized=localizedSections();
  for(const g of ["personal","social","account","security"]){
    byId("group-"+g).innerHTML=localized.filter(s=>s.group===g).map(renderCard).join("");
  }
  const navItem=(id,name)=>'<button class="anchor-link" data-jump="'+id+'" aria-label="'+name+'" data-tooltip="'+name+'"><span class="anchor-icon">'+iconSvg(id)+'</span><span class="anchor-name">'+name+'</span><span class="anchor-active-marker"></span></button>';
  const groups=[{id:"personal",icon:"personalization"},{id:"social",icon:"sharing"},{id:"account",icon:"account"},{id:"security",icon:"security"}];
  byId("railItems").innerHTML=navItem("intro",ui().beginning)+groups.map((group,index)=>{
    const label=ui().navGroups[index],opened=expandedNavGroups.has(group.id);
    return '<div class="nav-group '+(opened?'nav-group-open':'')+'" data-nav-group="'+group.id+'">'+
      '<button class="nav-group-toggle" data-nav-group-toggle="'+group.id+'" aria-expanded="'+opened+'" aria-label="'+label+'" data-tooltip="'+label+'"><span class="anchor-icon">'+iconSvg(group.icon)+'</span><span class="nav-group-name">'+label+'</span><span class="nav-chevron" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg></span></button>'+
      '<div class="nav-subitems" role="group" aria-label="'+label+'">'+localized.filter(s=>s.group===group.id).map(s=>navItem(s.id,s.short)).join("")+'</div></div>';
  }).join("");
  rehydrateInlineSettings();
  document.querySelectorAll(".setting-section,.section-overline,.interlude").forEach(el=>revealObserver?.observe(el));
  syncControlStates();
  syncDirectVisuals();
  syncActive();
  syncNavGroups();
  оновитиФотоПрофілю();
  requestAnimationFrame(updatePillDimensions);
}

function setPosition(position){
  if(!["left","right","top","bottom"].includes(position)) return;
  closeHorizontalNavMenu();
  body.classList.remove("rail-left","rail-right","rail-top","rail-bottom");
  body.classList.add("rail-"+position);
  preferences.position=position;
  syncRailCompactButton();
  syncNavGroups();
  document.querySelectorAll("[data-pos]").forEach(b=>b.classList.toggle("selected",b.dataset.pos===position));
  persist();
  hideAnchorTooltip();
  refreshLivePreview();
  requestAnimationFrame(updatePillDimensions);
}
function applyRailCollapsed(collapsed){
  body.classList.toggle("rail-compact",collapsed);
  document.querySelectorAll("[data-drawer-compact]").forEach(b=>{b.setAttribute("aria-pressed",String(collapsed));b.classList.toggle("on",collapsed);});
  syncRailCompactButton();
  requestAnimationFrame(updatePillDimensions);
}
let railPointerInside=false;
let railCollapseTimer=null;
function cancelRailAutoCollapse(){
  if(railCollapseTimer!==null){clearTimeout(railCollapseTimer);railCollapseTimer=null;}
}
function scheduleRailAutoCollapse(){
  cancelRailAutoCollapse();
  if(!isAutoRail()||railPointerInside||drawerOpenedByControl||!byId("navSettings").hidden)return;
  // A short grace interval tolerates movement into the adjacent controls.
  railCollapseTimer=setTimeout(()=>{
    railCollapseTimer=null;
    if(isAutoRail()&&!railPointerInside&&!drawerOpenedByControl&&byId("navSettings").hidden){
      if(body.classList.contains("rail-smart-condensed"))setAdaptiveNavOpen(false);
      applyRailCollapsed(true);
    }
  },300);
}
function setRailMode(mode){
  if(!["expanded","collapsed","auto"].includes(mode))return;
  if(mode!=="auto"&&body.classList.contains("rail-smart-condensed"))return;
  cancelRailAutoCollapse();
  preferences.railMode=mode;
  preferences.compact=mode!=="expanded";
  body.classList.toggle("rail-mode-auto",isAutoRail());
  applyRailCollapsed(mode==="collapsed"||(mode==="auto"&&!railPointerInside&&byId("navSettings").hidden));
  document.querySelectorAll("[data-rail-mode]").forEach(button=>{
    const on=button.dataset.railMode===mode;
    button.classList.toggle("selected",on);
    button.setAttribute("aria-pressed",String(on));
  });
  persist();
  hideAnchorTooltip();
  refreshLivePreview();
  requestAnimationFrame(updatePillDimensions);
}
function setCompact(value){setRailMode(value?"collapsed":"expanded");}
function setNavStyle(value){
  if(!["classic","pills"].includes(value))return;
  preferences.navStyle=value;
  body.classList.toggle("rail-pills",value==="pills");
  syncControlStates();
  persist();
  hideAnchorTooltip();
  refreshLivePreview();
  requestAnimationFrame(updatePillDimensions);
}
function setIconOnly(iconOnly){
  preferences.iconOnly=Boolean(iconOnly);
  body.classList.toggle("rail-icons",preferences.iconOnly);
  syncControlStates();
  persist();
  hideAnchorTooltip();
  requestAnimationFrame(updatePillDimensions);
}
function setTheme(theme){
  preferences.theme=theme==="light"?"light":"dark";
  body.classList.toggle("light",preferences.theme==="light");
  document.querySelectorAll("[data-theme]").forEach(b=>b.classList.toggle("selected",b.dataset.theme===preferences.theme));
  persist();
  refreshLivePreview();
}
function setAccent(color){
  preferences.accent=color;
  body.dataset.accent=color;
  document.querySelectorAll(".swatches [data-accent]").forEach(b=>b.classList.toggle("selected",b.dataset.accent===color));
  persist();
  refreshLivePreview();
}
function syncControlStates(){
  document.querySelectorAll("[data-pos]").forEach(b=>b.classList.toggle("selected",b.dataset.pos===preferences.position));
  document.querySelectorAll("[data-theme]").forEach(b=>b.classList.toggle("selected",b.dataset.theme===preferences.theme));
  document.querySelectorAll(".swatches [data-accent]").forEach(b=>b.classList.toggle("selected",b.dataset.accent===preferences.accent));
  document.querySelectorAll("[data-demo-lang]").forEach(b=>b.classList.toggle("selected",b.dataset.demoLang===preferences.lang));
  document.querySelectorAll("[data-drawer-compact]").forEach(b=>b.setAttribute("aria-pressed",String(preferences.compact)));
  document.querySelectorAll("[data-nav-style]").forEach(b=>{const on=b.dataset.navStyle===preferences.navStyle;b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});
  document.querySelectorAll("[data-icon-display]").forEach(b=>{const on=(b.dataset.iconDisplay==="icons")===preferences.iconOnly;b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});
  document.querySelectorAll("[data-rail-mode]").forEach(b=>{const on=b.dataset.railMode===preferences.railMode;b.classList.toggle("selected",on);b.setAttribute("aria-pressed",String(on));});
}
function setLang(lang){
  if(!["uk","nl"].includes(lang))return;
  preferences.lang=lang;
  stableSideNavWidth=212;
  persist();
  renderAll();
  applyRailCollapsed(preferences.railMode!=="expanded");
  if(!byId("searchOverlay").hidden)renderSearch();
}
setPosition(preferences.position);
setRailMode(preferences.railMode);
setNavStyle(preferences.navStyle);
setIconOnly(preferences.iconOnly);
setTheme(preferences.theme);
setAccent(preferences.accent);

function showToast(message){
  const el=byId("toast");
  el.textContent=message;
  el.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>el.classList.remove("show"),3600);
}
function jump(id){
  closeHorizontalNavMenu();
  setAdaptiveNavOpen(false);
  const target=byId(id);
  if(!target) return;
  const group=target.dataset.section&&sections.find(s=>s.id===id)?.group;
  if(group){expandedNavGroups.add(group);syncNavGroups();}
  target.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
  closeSearch();
  closeNavSettings();
}
function syncActive(){
  const els=[byId("intro"),...sections.map(s=>byId(s.id))];
  let active="intro";
  for(const el of els){if(el.getBoundingClientRect().top < innerHeight*.48) active=el.id;}
  const highlight=demoValues["menu-0"]!==false;
  document.querySelectorAll(".anchor-link").forEach(b=>{let on=b.dataset.jump===active;b.classList.toggle("active",on&&highlight); b.setAttribute("aria-current",on?"location":"false");});
  const currentGroup=sections.find(s=>s.id===active)?.group;
  document.querySelectorAll(".nav-group-toggle").forEach(b=>{
    const on=b.dataset.navGroupToggle===currentGroup;
    b.classList.toggle("current-group",Boolean(on&&highlight));
    b.setAttribute("aria-current",on?"location":"false");
  });
  document.querySelectorAll("#horizontalNavPopup [data-jump]").forEach(b=>{
    const on=b.dataset.jump===active;
    b.classList.toggle("current-section",on&&highlight);
    b.setAttribute("aria-current",on?"location":"false");
  });
  const scrollable=Math.max(1,document.documentElement.scrollHeight-innerHeight);
  const pct=Math.max(0,Math.min(100,Math.round(scrollY/scrollable*100)));
  byId("scrollProgress").style.width=pct+"%";
  byId("railProgressRing").style.strokeDashoffset=String(113.097*(1-pct/100));
  byId("railProgressGauge").setAttribute("aria-valuenow",String(pct));
  byId("railPercent").textContent=pct+"%";
  const selected=isHorizontalNav()?(currentGroup?document.querySelector('.nav-group-toggle.current-group'):document.querySelector('.anchor-link[data-jump="intro"]')):null;
  if(selected){
    const row=byId("railItems"), box=selected.getBoundingClientRect(), visible=row.getBoundingClientRect();
    if(box.left<visible.left+8)row.scrollLeft+=box.left-visible.left-12;
    else if(box.right>visible.right-8)row.scrollLeft+=box.right-visible.right+12;
  }
}
let ticking=false;
addEventListener("scroll",()=>{if(ticking)return; ticking=true;requestAnimationFrame(()=>{syncActive(); ticking=false;});},{passive:true});
addEventListener("resize",syncActive);

// One consistent panel icon for the header and footer. CSS mirrors/rotates it
// to match the dock edge; the chevron itself always describes the next action.
function railToggleSvg(collapsed){
  const chevron=collapsed?"m13 9 3 3-3 3":"m16 9-3 3 3 3";
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2.7"/><path d="M9 4v16"/><path d="'+chevron+'"/></svg>';
}
// Classic and individual-button layouts both honour the same compact switch.
// The optional button layout always reserves its real footprint in the page.
function syncRailCompactButton(){
  const button=byId("railExpand");
  if(!button)return;
  const collapsed=body.classList.contains("rail-compact");
  const smartDrawerOpen=body.classList.contains("rail-smart-condensed")&&body.classList.contains("rail-smart-open");
  const label=smartDrawerOpen?(preferences.lang==="nl"?"Navigatie sluiten":"Закрити навігацію"):isHorizontalNav()?(preferences.lang==="nl"?"Alle onderdelen":"Усі розділи"):(collapsed?ui().expand:ui().collapse);
  if(isHorizontalNav())button.removeAttribute("aria-pressed");
  else button.setAttribute("aria-pressed",String(collapsed));
  button.setAttribute("aria-label",label);
  button.setAttribute("aria-expanded",String(smartDrawerOpen|| (isHorizontalNav()?!byId("horizontalNavPopup").hidden:!collapsed)));
  if(isHorizontalNav()){button.setAttribute("aria-haspopup","menu");button.setAttribute("aria-controls","horizontalNavPopup");}
  else{button.removeAttribute("aria-haspopup");button.setAttribute("aria-controls","railItems");}
  button.title=label;
  button.querySelector(".rail-toggle-icon").innerHTML=isHorizontalNav()?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>':railToggleSvg(collapsed);
}
function updatePillDimensions(){
  if(matchMedia("(min-width:731px)").matches){
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
}
adaptiveNavToggle.addEventListener("click",()=>{
  const opening=!body.classList.contains("rail-smart-open");
  cancelRailAutoCollapse();
  setAdaptiveNavOpen(opening,{explicit:opening});
  if(opening)byId("railExpand").focus({preventScroll:true});
});
adaptiveNavEdge.addEventListener("click",()=>{
  cancelRailAutoCollapse();
  setAdaptiveNavOpen(true,{explicit:true});
  byId("railExpand").focus({preventScroll:true});
});
adaptiveNavEdge.addEventListener("pointerenter",event=>{
  if(event.pointerType==="mouse"&&isAutoRail()&&body.classList.contains("rail-smart-condensed")){
    cancelRailAutoCollapse();
    setAdaptiveNavOpen(true);
  }
});
addEventListener("pointermove",event=>{
  if(event.pointerType!=="mouse"||!isAutoRail()||
     !body.classList.contains("rail-smart-condensed")||!body.classList.contains("rail-smart-open")||
     railPointerInside||drawerOpenedByControl||!byId("navSettings").hidden)return;
  const rail=byId("anchorRail").getBoundingClientRect();
  // Leave an uninterrupted path between the screen edge and the drawer,
  // including the gap beside the permanent global app rail on the left.
  const atEdge=body.classList.contains("rail-left")?event.clientX<=rail.left+8:event.clientX>=rail.right-8;
  const atDrawer=event.clientX>=rail.left&&event.clientX<=rail.right&&
    event.clientY>=rail.top&&event.clientY<=rail.bottom;
  if(atEdge||atDrawer){cancelRailAutoCollapse();return;}
  // Resetting this timer on every pixel would keep the menu open forever
  // while the cursor moved outside it.
  if(railCollapseTimer===null)scheduleRailAutoCollapse();
},{passive:true});
adaptiveNavScrim.addEventListener("click",()=>{setAdaptiveNavOpen(false);adaptiveNavToggle.focus({preventScroll:true});});
byId("railExpand").addEventListener("click",event=>{
  event.stopPropagation();
  if(body.classList.contains("rail-smart-open")){
    setAdaptiveNavOpen(false);
    adaptiveNavToggle.focus({preventScroll:true});
    return;
  }
  if(isHorizontalNav()){
    toggleHorizontalNavMenu(null,byId("railExpand"));
    return;
  }
  // In hover mode this button pins the full menu open, regardless of its
  // temporary pointer-expanded appearance.
  if(preferences.railMode==="auto"){setRailMode("expanded");return;}
  setCompact(!body.classList.contains("rail-compact"));
});
let edgeSwipeStart=null;
addEventListener("pointerdown",event=>{
  if(event.pointerType==="mouse"||!body.classList.contains("rail-smart-condensed"))return;
  const right=body.classList.contains("rail-right");
  const open=body.classList.contains("rail-smart-open");
  const edgeRect=adaptiveNavEdge.getBoundingClientRect();
  const fromEdge=!open&&event.clientX>=edgeRect.left-5&&event.clientX<=edgeRect.right+5&&
    event.clientY>=edgeRect.top&&event.clientY<=edgeRect.bottom;
  const railRect=byId("anchorRail").getBoundingClientRect();
  const fromDrawer=open&&event.clientX>=railRect.left&&event.clientX<=railRect.right&&event.clientY>=railRect.top&&event.clientY<=railRect.bottom;
  if(fromEdge||fromDrawer)edgeSwipeStart={pointerId:event.pointerId,x:event.clientX,y:event.clientY,right,open};
},{passive:true});
addEventListener("pointerup",event=>{
  if(!edgeSwipeStart||event.pointerId!==edgeSwipeStart.pointerId)return;
  const swipe=edgeSwipeStart;
  edgeSwipeStart=null;
  const dx=event.clientX-swipe.x;
  const dy=event.clientY-swipe.y;
  if(Math.abs(dx)<48||Math.abs(dx)<Math.abs(dy)*1.35)return;
  if(!swipe.open&& (swipe.right?dx<0:dx>0)){
    cancelRailAutoCollapse();
    setAdaptiveNavOpen(true,{explicit:true});
  }
  if(swipe.open&& (swipe.right?dx>0:dx<0))setAdaptiveNavOpen(false);
},{passive:true});
addEventListener("pointercancel",()=>{edgeSwipeStart=null;},{passive:true});
addEventListener("resize",()=>requestAnimationFrame(updatePillDimensions));
if(typeof ResizeObserver!=="undefined")new ResizeObserver(()=>requestAnimationFrame(updatePillDimensions)).observe(byId("anchorRail"));

const popover=byId("navSettings");
function toggleNavSettings(){
  popover.hidden=!popover.hidden;
  if(isAutoRail()){
    if(popover.hidden)scheduleRailAutoCollapse();
    else{
      cancelRailAutoCollapse();
      if(!body.classList.contains("rail-smart-condensed"))applyRailCollapsed(false);
    }
  }
}
function closeNavSettings(){popover.hidden=true;scheduleRailAutoCollapse();}
byId("railConfig").addEventListener("click",e=>{e.stopPropagation(); toggleNavSettings();});
byId("heroNavSettings").addEventListener("click",toggleNavSettings);
byId("closeNavSettings").addEventListener("click",closeNavSettings);
byId("railProgressHelp").addEventListener("click",()=>showToast(preferences.lang==="nl"?"De cirkel laat zien hoeveel van deze pagina je al hebt bekeken.":"Коло показує, яку частину цієї сторінки ви вже переглянули."));
byId("anchorRail").addEventListener("pointerenter",e=>{
  if(e.pointerType==="touch")return;
  railPointerInside=true;
  // Only release a hamburger-opened drawer after the pointer reaches it.
  // The route between the header and the drawer must never auto-close it.
  drawerOpenedByControl=false;
  cancelRailAutoCollapse();
  // The narrow drawer already renders its expanded contents. Rewriting the
  // desktop compact state on hover only flips icon/text order and shifts pills.
  if(isAutoRail()&&!body.classList.contains("rail-smart-condensed"))applyRailCollapsed(false);
});
byId("anchorRail").addEventListener("pointerleave",e=>{
  if(e.pointerType==="touch")return;
  railPointerInside=false;
  scheduleRailAutoCollapse();
});
function syncNavGroups(){
  document.querySelectorAll("[data-nav-group]").forEach(group=>{
    const open=expandedNavGroups.has(group.dataset.navGroup);
    group.classList.toggle("nav-group-open",open);
    const button=group.querySelector(".nav-group-toggle");
    button?.setAttribute("aria-expanded",String(isHorizontalNav()?!byId("horizontalNavPopup").hidden&&horizontalNavTrigger===button:open));
    if(isHorizontalNav()){button?.setAttribute("aria-haspopup","menu");button?.setAttribute("aria-controls","horizontalNavPopup");}
    else{button?.removeAttribute("aria-haspopup");button?.removeAttribute("aria-controls");}
  });
  requestAnimationFrame(updatePillDimensions);
}
function closeHorizontalNavMenu(returnFocus=false){
  const popup=byId("horizontalNavPopup");
  if(!popup)return;
  popup.hidden=true;
  if(returnFocus)horizontalNavTrigger?.focus({preventScroll:true});
  horizontalNavTrigger=null;
  document.querySelectorAll(".nav-group-toggle").forEach(b=>b.setAttribute("aria-expanded",isHorizontalNav()?"false":String(expandedNavGroups.has(b.dataset.navGroupToggle))));
  if(byId("railExpand"))syncRailCompactButton();
}
function openHorizontalNavMenu(groupId,trigger){
  if(!isHorizontalNav())return;
  closeHorizontalNavMenu();hideAnchorTooltip();closeNavSettings();
  const popup=byId("horizontalNavPopup"),all=localizedSections();
  const defs=[{id:"personal",label:ui().navGroups[0]},{id:"social",label:ui().navGroups[1]},{id:"account",label:ui().navGroups[2]},{id:"security",label:ui().navGroups[3]}].filter(g=>!groupId||g.id===groupId);
  popup.innerHTML=defs.map(g=>'<div class="horizontal-popup-group"><div class="horizontal-popup-heading">'+g.label+'</div>'+all.filter(s=>s.group===g.id).map(s=>'<button type="button" role="menuitem" data-jump="'+s.id+'"><span class="horizontal-popup-icon">'+iconSvg(s.id)+'</span><span>'+s.name+'</span></button>').join("")+'</div>').join("");
  popup.hidden=false;horizontalNavTrigger=trigger;
  syncActive();
  const rect=trigger.getBoundingClientRect(),width=popup.offsetWidth,height=popup.offsetHeight;
  const minLeft=matchMedia("(max-width:730px)").matches?10:84;
  popup.style.left=Math.max(minLeft,Math.min(innerWidth-width-10,rect.left+rect.width/2-width/2))+"px";
  let top=preferences.position==="top"?rect.bottom+12:rect.top-height-12;
  popup.style.top=Math.max(10,Math.min(innerHeight-height-10,top))+"px";
  syncNavGroups();syncRailCompactButton();
  popup.querySelector('button')?.focus({preventScroll:true});
}
function toggleHorizontalNavMenu(groupId,trigger){
  const popup=byId("horizontalNavPopup");
  // Clicking the same tab again collapses its popup; clicking another tab
  // replaces the popup instead of leaving multiple menus or ignoring input.
  if(!popup.hidden&&horizontalNavTrigger===trigger){
    closeHorizontalNavMenu();
    return;
  }
  openHorizontalNavMenu(groupId,trigger);
}
byId("railItems").addEventListener("click",event=>{
  const group=event.target.closest("[data-nav-group-toggle]");
  if(!group){
    const home=event.target.closest('[data-jump="intro"]');
    if(isHorizontalNav()&&home?.classList.contains("active")){event.stopPropagation();toggleHorizontalNavMenu(null,home);}
    return;
  }
  const id=group.dataset.navGroupToggle;
  if(isHorizontalNav()){
    event.stopPropagation();
    const current=group.classList.contains("current-group");
    if(current||matchMedia("(hover:none)").matches||!byId("horizontalNavPopup").hidden)toggleHorizontalNavMenu(id,group);
    else{const first=sections.find(s=>s.group===id);if(first)jump(first.id);}
    return;
  }
  if(expandedNavGroups.has(id))expandedNavGroups.delete(id);else expandedNavGroups.add(id);
  syncNavGroups();
});
byId("railItems").addEventListener("contextmenu",event=>{
  if(!isHorizontalNav())return;
  const target=event.target.closest("[data-nav-group-toggle],.anchor-link[data-jump=\"intro\"]");
  if(!target)return;
  event.preventDefault();toggleHorizontalNavMenu(target.dataset.navGroupToggle||null,target);
});
byId("horizontalNavPopup").addEventListener("keydown",e=>{
  const buttons=[...byId("horizontalNavPopup").querySelectorAll('button[role="menuitem"]')];
  const index=buttons.indexOf(document.activeElement);
  if(e.key==="Escape"){e.preventDefault();closeHorizontalNavMenu(true);}
  else if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault();buttons[(index+(e.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();
  }
});

const searchOverlay=byId("searchOverlay"), searchInput=byId("commandInput");
let searchIndex=0;
function openSearch(){searchOverlay.hidden=false;searchInput.value="";renderSearch();setTimeout(()=>searchInput.focus(),30);}
function closeSearch(){searchOverlay.hidden=true;}
function renderSearch(){
  const term=searchInput.value.trim().toLocaleLowerCase("uk");
  const matches=localizedSections().filter(s=>(s.name+" "+s.title+" "+s.description).toLocaleLowerCase().includes(term));
  searchIndex=Math.min(searchIndex,Math.max(0,matches.length-1));
  byId("commandResults").innerHTML=matches.length?matches.map((s,i)=>'<button data-jump="'+s.id+'" class="command-result '+(i===searchIndex?"chosen":"")+'"><span>'+iconSvg(s.id)+'</span><strong>'+s.name+'</strong><small>'+s.number+' / 12</small><b>→</b></button>').join(""):'<div class="no-results">Нічого не знайдено. Спробуйте іншу назву.</div>';
  if(!matches.length)byId("commandResults").innerHTML='<div class="no-results">'+ui().noResults+'</div>';
}
byId("openSearch").addEventListener("click",openSearch);
searchInput.addEventListener("input",()=>{searchIndex=0;renderSearch();});
searchInput.addEventListener("keydown",e=>{
  const buttons=[...byId("commandResults").querySelectorAll("[data-jump]")];
  if(e.key==="ArrowDown"){e.preventDefault();searchIndex=Math.min(buttons.length-1,searchIndex+1);renderSearch();}
  if(e.key==="ArrowUp"){e.preventDefault();searchIndex=Math.max(0,searchIndex-1);renderSearch();}
  if(e.key==="Enter"&&buttons[searchIndex])jump(buttons[searchIndex].dataset.jump);
});
searchOverlay.addEventListener("click",e=>{if(e.target===searchOverlay)closeSearch();});
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();searchOverlay.hidden?openSearch():closeSearch();}
  if(e.key==="Escape"){
    const closingAdaptiveNav=body.classList.contains("rail-smart-open");
    closeSearch();closeNavSettings();closeHorizontalNavMenu(true);setAdaptiveNavOpen(false);
    if(closingAdaptiveNav)adaptiveNavToggle.focus({preventScroll:true});
    if(e.target.closest('.section-inline-settings'))closeInlineSettings(e.target.closest('.section-inline-settings').dataset.inlineSection);
  }
});
document.addEventListener("pointerdown",e=>{
  if(!e.target.closest('#horizontalNavPopup,#railExpand,#railItems .nav-group-toggle,#railItems .anchor-link[data-jump="intro"]'))closeHorizontalNavMenu();
});
document.addEventListener("click",e=>{
  const target=e.target.closest("[data-jump],[data-pos],[data-nav-style],[data-icon-display],[data-rail-mode],[data-theme],[data-accent],[data-demo-lang],.open-detail,.demo-action");
  if(!target){if(!e.target.closest("#navSettings,#railConfig,#heroNavSettings"))closeNavSettings();return;}
  if(target.dataset.jump){hideAnchorTooltip();jump(target.dataset.jump);return;}
  if(target.dataset.pos){setPosition(target.dataset.pos);syncActive();closeNavSettings();syncControlStates();showToast(ui().moved+" "+ui().positions[target.dataset.pos]);return;}
  if(target.dataset.navStyle){setNavStyle(target.dataset.navStyle);return;}
  if(target.dataset.iconDisplay){setIconOnly(target.dataset.iconDisplay==="icons");return;}
  if(target.dataset.railMode){setRailMode(target.dataset.railMode);return;}
  if(target.dataset.theme){setTheme(target.dataset.theme);syncControlStates();return;}
  if(target.dataset.accent){setAccent(target.dataset.accent);syncControlStates();return;}
  if(target.dataset.demoLang){setLang(target.dataset.demoLang);return;}
  if(target.classList.contains("open-detail")){
    const index=target.hasAttribute("data-option-index")?Number(target.dataset.optionIndex):null;
    openInlineSettings(target.dataset.for,{index,toggle:index===null});
    return;
  }
  if(target.classList.contains("demo-action")){showToast(ui().demoToast);}
});
document.querySelectorAll(".app-icon:not(.theme-button)").forEach(el=>el.addEventListener("click",()=>{
  showToast(ui().navDemoToast);
}));
byId("railItems").addEventListener("pointerover",e=>{
  const item=e.target.closest(".anchor-link,.nav-group-toggle");
  if(item&&item!==e.relatedTarget?.closest?.(".anchor-link,.nav-group-toggle"))showAnchorTooltip(item);
});
byId("railItems").addEventListener("pointerout",e=>{
  const item=e.target.closest(".anchor-link,.nav-group-toggle");
  if(item&&!item.contains(e.relatedTarget))hideAnchorTooltip();
});
byId("railItems").addEventListener("focusin",e=>{const item=e.target.closest(".anchor-link,.nav-group-toggle");if(item)showAnchorTooltip(item);});
byId("railItems").addEventListener("focusout",hideAnchorTooltip);
byId("railItems").addEventListener("scroll",hideAnchorTooltip,{passive:true});

// Dragging the dedicated handle docks the anchor navigator at the nearest edge.
let dragStart=null;
const dragHandle=byId("railDrag");
dragHandle.addEventListener("pointerdown",e=>{
  if(e.target.closest("button")||e.button!==0)return;
  dragStart={x:e.clientX,y:e.clientY,id:e.pointerId,moved:false};
  dragHandle.setPointerCapture(e.pointerId);
});
dragHandle.addEventListener("pointermove",e=>{
  if(!dragStart)return;
  if(Math.hypot(e.clientX-dragStart.x,e.clientY-dragStart.y)>16){dragStart.moved=true;body.classList.add("dragging-rail");}
});
dragHandle.addEventListener("pointerup",e=>{
  if(!dragStart)return;
  if(dragStart.moved){
    const distances={left:e.clientX,right:innerWidth-e.clientX,top:e.clientY,bottom:innerHeight-e.clientY};
    const nearest=Object.keys(distances).sort((a,b)=>distances[a]-distances[b])[0];
    setPosition(nearest);
    showToast(ui().moved+" "+ui().positions[nearest]);
  }
  body.classList.remove("dragging-rail");
  dragStart=null;
});
dragHandle.addEventListener("pointercancel",()=>{dragStart=null;body.classList.remove("dragging-rail");});
dragHandle.addEventListener("keydown",e=>{if(e.target===dragHandle&&(e.key==="Enter"||e.key===" ")){e.preventDefault();toggleNavSettings();}});

const revealObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting){entry.target.classList.add("revealed");revealObserver.unobserve(entry.target);}
  });
},{threshold:.06,rootMargin:"0px 0px 40px 0px"});
renderAll();
