// Inline settings for every section. Deliberately disconnected from account APIs.
const expandedSections=new Set();
const demoValues={};
// Reserve the mini-browser for controls whose result changes the look of the
// workspace. Account, access and security tasks need room for the actual form.
const visualPreviewSections=new Set(["personalization","menu","themes","widgets"]);

const optionIconNames={
  personalization:["піктограма","щільність","рух"],menu:["підсвітка","підказка"],
  themes:["місяць","палітра","ефекти"],languages:["мова"],
  widgets:["видимість","розмір","додати"],sharing:["видимість","посилання","запрошення"],
  identities:["особа","посвідчення"],account:["особа","дані","попередження"],
  sessions:["пристрій","сповіщення","історія"],methods:["гугл","ключдоступу","захист"],
  security:["захист","шифрування","гість"],recovery:["коди","нагадування","попередження"]
};
function optionSvg(sectionId,index){
  const name=optionIconNames[sectionId]?.[index];
  if(!name)throw new Error("Не визначено піктограму для "+sectionId+" / "+index);
  return піктограмаЗаСуттю(name);
}

function drawerControl(control,i,sectionId){
  const key=sectionId+"-"+i,type=control.type,t=ui();
  const current=demoValues[key];
  let widget="";
  if(type==="toggle"){
    const selected=current===undefined?control.initial:current;
    widget='<button class="drawer-toggle '+(selected?"on":"")+'" data-toggle-demo="'+key+'" aria-label="'+control.label+'" aria-pressed="'+selected+'"><span></span></button>';
  }else if(type==="compact"){
    widget='<button class="drawer-toggle '+(preferences.compact?"on":"")+'" data-drawer-compact aria-label="'+control.label+'" aria-pressed="'+preferences.compact+'"><span></span></button>';
  }else if(type==="navstyle"){
    widget='<div class="drawer-choice"><button data-nav-style="classic" class="'+(preferences.navStyle==="classic"?"selected":"")+'">'+t.navClassic+'</button><button data-nav-style="pills" class="'+(preferences.navStyle==="pills"?"selected":"")+'">'+t.navPills+'</button></div>';
  }else if(type==="choice"){
    const selected=current??0;
    widget='<div class="drawer-choice">'+control.options.map((label,idx)=>'<button class="'+(idx===selected?"selected":"")+'" data-choice-group="'+key+'" data-choice-index="'+idx+'">'+label+'</button>').join("")+'</div>';
  }else if(type==="positions"){
    widget='<div class="drawer-positions">'+["left","right","top","bottom"].map(pos=>'<button data-pos="'+pos+'" class="'+(pos===preferences.position?"selected":"")+'"><span class="dock-diagram dock-'+pos+'"></span>'+t.positions[pos]+'</button>').join("")+'</div>';
  }else if(type==="theme"){
    widget='<div class="drawer-choice theme-illustrated"><button data-theme="dark" class="'+(preferences.theme==="dark"?"selected":"")+'"><span class="theme-miniature theme-miniature-dark"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 16a8.4 8.4 0 0 1-12-12 8.4 8.4 0 1 0 12 12Z"/></svg></span><span>'+t.dark+'</span></button><button data-theme="light" class="'+(preferences.theme==="light"?"selected":"")+'"><span class="theme-miniature theme-miniature-light"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></svg></span><span>'+t.light+'</span></button></div>';
  }else if(type==="accent"){
    widget='<div class="swatches drawer-swatches">'+["violet","cyan","pink","amber"].map(c=>'<button data-accent="'+c+'" class="'+(preferences.accent===c?"selected":"")+'" aria-label="'+t.colors[c]+'"></button>').join("")+'</div>';
  }else if(type==="language"){
    widget='<div class="drawer-choice language-illustrated"><button data-demo-lang="uk" class="'+(preferences.lang==="uk"?"selected":"")+'"><span class="language-flag language-flag-uk" aria-hidden="true"></span><span>Українська</span></button><button data-demo-lang="nl" class="'+(preferences.lang==="nl"?"selected":"")+'"><span class="language-flag language-flag-nl" aria-hidden="true"></span><span>Nederlands</span></button></div>';
  }else if(type==="range"){
    const value=current??control.value;
    widget='<div class="drawer-range"><input type="range" min="0" max="100" value="'+value+'" data-range-demo="'+key+'" aria-label="'+control.label+'"><output>'+value+'%</output></div>';
  }else if(type==="profile"){
    const value=current??(preferences.lang==="uk"?"Павло":"Pavlo");
    widget='<label class="inline-profile-field"><span>'+t.profileName+'</span><input type="text" maxlength="42" data-profile-demo="'+key+'" value="'+escapeMarkup(value)+'" autocomplete="off" spellcheck="false"><small>'+t.demoOnly+'</small></label>';
  }else if(type==="export"){
    widget='<div class="inline-export-tools"><div class="drawer-choice export-formats">'+["JSON","CSV"].map((format,idx)=>'<button data-choice-group="'+key+'" data-choice-index="'+idx+'" class="'+((current??0)===idx?"selected":"")+'"><span class="export-format-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2h7l5 5v14a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v5h5"/>'+(idx===0?'<path d="m10 12-2 2 2 2m4-4 2 2-2 2"/>':'<path d="M8 12h8M8 16h8m-5-5v7"/>')+'</svg></span><span>'+format+'</span></button>').join("")+'</div><button class="export-sample" data-demo-action="'+key+'"><svg class="export-action-glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13m-5-5 5 5 5-5M4 17v3h16v-3"/></svg><span>'+t.prepareCopy+'</span></button></div>';
  }else if(type==="action"){
    widget='<button class="drawer-action-button" data-demo-action="'+key+'" aria-label="'+control.label+'">'+піктограмаЗаСуттю(optionIconNames[sectionId][i])+'</button>';
  }else if(type==="warning"){
    widget='<span class="drawer-warning-icon">!</span>';
  }else{
    widget='<span class="drawer-info-icon">ⓘ</span>';
  }
  const fullWidth=["positions","choice","navstyle","theme","accent","language","range","profile","export"].includes(type);
  return '<div class="drawer-control-card control-'+type+' '+(fullWidth?"control-wide ":"")+'">' +
    '<div class="drawer-control-top"><span class="drawer-control-glyph">'+optionSvg(sectionId,i)+'</span><div class="drawer-control-copy"><strong>'+control.label+'</strong><p>'+control.note+'</p></div>'+(!fullWidth?widget:"")+'</div>'+
    (fullWidth?'<div class="drawer-control-widget">'+widget+'</div>':"")+'</div>';
}

function escapeMarkup(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
function previewValue(row,i,sectionId){
  const key=sectionId+"-"+i, value=demoValues[key], t=ui();
  if(row.type==="toggle"||row.type==="compact"){
    const on=row.type==="compact"?preferences.compact:(value===undefined?row.initial:value);
    return '<span class="mini-live-switch '+(on?"on":"")+'"><i></i></span>';
  }
  if(row.type==="choice")return '<span class="mini-live-chip">'+row.options[value??0]+'</span>';
  if(row.type==="positions")return '<span class="mini-live-chip">'+t.positions[preferences.position]+'</span>';
  if(row.type==="navstyle")return '<span class="mini-live-chip">'+(preferences.navStyle==="pills"?t.navPills:t.navClassic)+'</span>';
  if(row.type==="theme")return '<span class="mini-live-chip">'+(preferences.theme==="dark"?t.dark:t.light)+'</span>';
  if(row.type==="accent")return '<span class="mini-live-color" style="background:var(--global)"></span>';
  if(row.type==="language")return '<span class="mini-live-chip">'+(preferences.lang==="uk"?"УК":"NL")+'</span>';
  if(row.type==="range")return '<span class="mini-live-chip">'+(value??row.value)+'%</span>';
  if(row.type==="profile")return '<span class="mini-live-chip">'+escapeMarkup(value??(preferences.lang==="uk"?"Павло":"Pavlo"))+'</span>';
  if(row.type==="export")return '<span class="mini-live-chip">'+["JSON","CSV"][value??0]+'</span>';
  if(row.type==="warning")return '<span class="mini-live-alert">!</span>';
  if(row.type==="action")return '<span class="mini-live-link">'+arrowIcon+'</span>';
  return '<span class="mini-live-info">ⓘ</span>';
}

function drawerPreview(s){
  const t=ui(),rows=locales[preferences.lang].panels[s.id];
  const miniIcons=[...new Set(["intro",s.id,"themes","sharing","security"])];
  const activeHighlight=demoValues["menu-0"]!==false;
  const names=new Map([["intro",t.beginning],...localizedSections().map(item=>[item.id,item.short])]);
  const dense=demoValues["personalization-1"]===1, colorful=demoValues["personalization-0"]===1;
  const motionOff=demoValues["personalization-2"]===false;
  return '<div class="live-stage-head"><div><span class="live-pulse"></span><strong>'+t.previewSample+'</strong></div><small>'+t.savedLocally+'</small></div>'+
    '<p class="live-stage-note">'+t.drawerVisualNote+'</p>'+
    '<div class="drawer-browser-demo mini-pos-'+preferences.position+' mini-theme-'+preferences.theme+(preferences.compact?" mini-compact":"")+(dense?" mini-dense":"")+(colorful?" mini-colorful":"")+(motionOff?" mini-motion-off":"")+'">'+
      '<div class="drawer-browser-chrome"><div><i></i><i></i><i></i></div><span>'+t.workspace+' / '+t.settings+'</span><b>✦</b></div>'+
      '<div class="drawer-browser-workspace"><div class="drawer-browser-nav">'+miniIcons.map(id=>'<span class="'+(activeHighlight&&id===s.id?"current":"")+'">'+iconSvg(id)+'<small class="mini-nav-label">'+names.get(id)+'</small></span>').join("")+'</div>'+
        '<div class="drawer-browser-page"><div class="drawer-preview-label">'+s.kicker+'</div><h3>'+s.name+'</h3><p>'+s.description+'</p>'+
          rows.map((row,i)=>'<div class="drawer-browser-row"><span class="mini-row-glyph">'+optionSvg(s.id,i)+'</span><span class="mini-row-label">'+row.label+'</span>'+previewValue(row,i,s.id)+'</div>').join("")+
        '</div></div></div>'+
    '<div class="drawer-preview-caption"><span>✦</span><div><strong>'+t.drawerVisualTitle+'</strong><p>'+t.savedLocally+'</p></div></div>';
}
function refreshLivePreview(){
  const list=localizedSections();
  for(const id of expandedSections){
    if(!visualPreviewSections.has(id))continue;
    const preview=document.querySelector('#inline-'+id+' .inline-preview-body');
    const section=list.find(item=>item.id===id);
    if(preview&&section)preview.innerHTML=drawerPreview(section);
  }
}

// Immediate controls visibly update the concept without an extra preview panel.
function syncDirectVisuals(){
  const page=document.body;
  page.classList.toggle("demo-colorful-icons",demoValues["personalization-0"]===1);
  page.classList.toggle("demo-dense",demoValues["personalization-1"]===1);
  page.classList.toggle("demo-motion-off",demoValues["personalization-2"]===false);
  page.classList.toggle("demo-widgets-hidden",demoValues["widgets-0"]===false);
  page.classList.toggle("demo-widgets-large",demoValues["widgets-1"]===1);
  page.classList.toggle("demo-technical-identity",demoValues["identities-0"]===1);
  page.classList.toggle("demo-hide-identity-badge",demoValues["identities-1"]===false);
  const badge=document.querySelector("#identities .identity-mode-badge");
  if(badge)badge.textContent=demoValues["identities-0"]===1?locales[preferences.lang].art.tech:locales[preferences.lang].art.personal;
}

function renderInlinePanel(id){
  const s=localizedSections().find(section=>section.id===id);
  if(!s)return;
  const t=ui();
  const panel=document.getElementById("inline-"+id);
  if(!panel)return;
  const visualPreview=visualPreviewSections.has(id);
  panel.innerHTML=
    '<div class="inline-settings-header"><div class="inline-settings-identity"><span class="inline-settings-section-icon'+(id==='identities'?' profile-avatar':'')+'"'+(id==='identities'?' data-profile-photo':'')+'>'+(id==='identities'?'':iconSvg(id))+'</span><div><span class="inline-settings-eyebrow">'+t.inlineEyebrow+'</span><h3>'+s.name+'</h3></div></div><button class="inline-close-button" data-close-inline="'+id+'" aria-label="'+t.collapseSection+'">'+t.collapseSection+' <span>⌃</span></button></div>'+
    '<div class="inline-settings-workspace '+(visualPreview?'has-preview':'no-preview')+'">'+
      '<div class="inline-settings-controls"><div class="drawer-controls-list">'+locales[preferences.lang].panels[id].map((control,i)=>drawerControl(control,i,id)).join("")+'</div></div>'+
      (visualPreview?'<aside class="inline-live-panel" aria-label="'+t.previewSample+'"><div class="inline-preview-body">'+drawerPreview(s)+'</div></aside>':'')+
    '</div>'+tekenМайбутніМожливості(id);
  if(selectedInlineOptions.has(id))markInlineOption(id,selectedInlineOptions.get(id),false);
  оновитиФотоПрофілю();
}
const selectedInlineOptions=new Map();
function updateInlineTriggers(id){
  const section=document.getElementById(id),opened=expandedSections.has(id);
  if(!section)return;
  section.classList.toggle("section-expanded",opened);
  section.querySelectorAll('.open-detail').forEach(button=>{
    button.setAttribute("aria-expanded",String(opened));
    if(button.classList.contains("text-link"))button.firstChild.textContent=(opened?ui().collapseSection:ui().openSettings)+" ";
  });
}
function markInlineOption(id,index,scroll){
  const section=document.getElementById(id),panel=document.getElementById("inline-"+id);
  if(!section||!panel)return;
  section.querySelectorAll('.detail-item').forEach((button,i)=>button.classList.toggle('detail-selected',i===index));
  const cards=panel.querySelectorAll('.drawer-control-card');
  cards.forEach((card,i)=>card.classList.toggle('inline-spotlight',i===index));
  const selected=cards[index];
  if(selected&&scroll){
    selected.setAttribute('tabindex','-1');
    selected.focus({preventScroll:true});
    selected.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  }
}
function openInlineSettings(id,{index=null,toggle=false}={}){
  if(!sections.some(s=>s.id===id))return;
  if(expandedSections.has(id)&&toggle){closeInlineSettings(id);return;}
  const newlyOpened=!expandedSections.has(id);
  expandedSections.add(id);
  const panel=document.getElementById("inline-"+id);
  if(!panel)return;
  if(index!==null)selectedInlineOptions.set(id,index);
  if(newlyOpened){panel.hidden=false;renderInlinePanel(id);requestAnimationFrame(()=>panel.classList.add('entered'));}
  updateInlineTriggers(id);
  if(index!==null)markInlineOption(id,index,true);
  else if(newlyOpened){panel.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
}
function closeInlineSettings(id){
  const panel=document.getElementById("inline-"+id);
  if(!panel)return;
  expandedSections.delete(id);
  selectedInlineOptions.delete(id);
  panel.classList.remove('entered');
  panel.hidden=true;
  const section=document.getElementById(id);
  section?.querySelectorAll('.detail-selected').forEach(el=>el.classList.remove('detail-selected'));
  updateInlineTriggers(id);
  section?.querySelector('.text-link')?.focus({preventScroll:true});
}
function rehydrateInlineSettings(){
  for(const id of expandedSections){
    const panel=document.getElementById('inline-'+id);
    if(panel){panel.hidden=false;panel.classList.add('entered');renderInlinePanel(id);updateInlineTriggers(id);}
  }
}

function isIconNav(){
  return preferences.iconOnly || ["top","bottom"].includes(preferences.position) || preferences.compact ||
    (matchMedia("(max-width: 730px)").matches&&["left","right"].includes(preferences.position));
}
function showAnchorTooltip(el){
  if(!el||!isIconNav()||(demoValues["menu-1"]===false&&!["top","bottom"].includes(preferences.position)))return;
  const tooltip=document.getElementById("anchorTooltip"),rect=el.getBoundingClientRect();
  tooltip.textContent=el.dataset.tooltip;
  tooltip.hidden=false;
  tooltip.dataset.side=preferences.position;
  const tw=tooltip.offsetWidth,th=tooltip.offsetHeight,pad=9;
  let x,y;
  if(preferences.position==="left"){x=rect.right+12;y=rect.top+(rect.height-th)/2;}
  else if(preferences.position==="right"){x=rect.left-tw-12;y=rect.top+(rect.height-th)/2;}
  else if(preferences.position==="top"){x=rect.left+(rect.width-tw)/2;y=rect.bottom+12;}
  else{x=rect.left+(rect.width-tw)/2;y=rect.top-th-12;}
  tooltip.style.left=Math.max(pad,Math.min(innerWidth-tw-pad,x))+"px";
  tooltip.style.top=Math.max(pad,Math.min(innerHeight-th-pad,y))+"px";
  tooltip.classList.add("show");
}
function hideAnchorTooltip(){
  const tooltip=document.getElementById("anchorTooltip");
  tooltip.classList.remove("show");
  tooltip.hidden=true;
}

document.addEventListener("click",event=>{
  const close=event.target.closest("[data-close-inline]");
  if(close){closeInlineSettings(close.dataset.closeInline);return;}
  const toggle=event.target.closest("[data-toggle-demo]");
  if(toggle){const key=toggle.dataset.toggleDemo;demoValues[key]=toggle.getAttribute("aria-pressed")!=="true";toggle.setAttribute("aria-pressed",String(demoValues[key]));toggle.classList.toggle("on",demoValues[key]);refreshLivePreview();syncDirectVisuals();if(key==="menu-0")syncActive();if(key==="menu-1"&&!demoValues[key])hideAnchorTooltip();return;}
  if(event.target.closest("[data-drawer-compact]")){setCompact(!preferences.compact);document.querySelectorAll("[data-drawer-compact]").forEach(b=>b.classList.toggle("on",preferences.compact));return;}
  const choice=event.target.closest("[data-choice-group]");
  if(choice){demoValues[choice.dataset.choiceGroup]=Number(choice.dataset.choiceIndex);document.querySelectorAll('[data-choice-group="'+choice.dataset.choiceGroup+'"]').forEach(button=>button.classList.toggle("selected",button===choice));refreshLivePreview();syncDirectVisuals();return;}
  if(event.target.closest("[data-demo-action]")){showToast(ui().actionDemo);return;}
});
document.addEventListener("input",event=>{
  const profile=event.target.closest("[data-profile-demo]");
  if(profile){demoValues[profile.dataset.profileDemo]=profile.value;refreshLivePreview();return;}
  const range=event.target.closest("[data-range-demo]");
  if(range){
    demoValues[range.dataset.rangeDemo]=Number(range.value);
    range.parentElement.querySelector("output").textContent=range.value+"%";
    document.documentElement.style.setProperty("--effect-intensity",String(range.value/100));
    refreshLivePreview();
  }
});
