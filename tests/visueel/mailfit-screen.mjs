// MAILFIT-001 · Geen screenshot zonder levende React-DOM en werkelijke geometrie.
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';

mkdirSync('uitvoer',{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[];
try{
  for(const [width,height] of [[390,800],[768,1024],[1280,800],[1920,1080]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    page.on('pageerror',error=>errors.push(`${width}: ${error.stack||error.message}`));
    page.on('console',message=>{if(message.type()==='error')errors.push(`${width}: ${message.text()}`)});
    await page.goto('http://127.0.0.1:4179/tests/visueel/mailfit-voorbeeld.html',{waitUntil:'networkidle',timeout:30000});
    await page.waitForTimeout(1200);
    const facts=await page.evaluate(()=>{
      const $=s=>document.querySelector(s),rect=e=>e?.getBoundingClientRect();
      const intro=$('.mail-orbit-intro.is-inbox'),wrapper=$('.google-mail-orbit[data-mail-account-resolution-empty="true"]');
      const workspace=$('.google-mail-workspace');
      const heading=$('.mail-workspace-heading'),pager=$('.mail-pagination-selection-dock');
      const main=$('.mail-orbit-desktop-hoofdknop'),mobile=$('.mail-orbit-mobiel-hoofdknop'),repeat=$('.mail-orbit-mobiel-snel');
      const r=rect(intro),w=rect(wrapper),root=$('#root');
      return {
        domLength:root?.innerHTML.length||0,
        hasEmpty:Boolean(wrapper&&intro),
        intro: r?{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}:null,
        wrapper:w?{x:w.x,width:w.width}:null,
        headingDisplay:heading?getComputedStyle(heading).display:'absent',
        pagerDisplay:pager?getComputedStyle(pager).display:'absent',
        borderRadius:intro?parseFloat(getComputedStyle(intro).borderTopLeftRadius):0,
        outerBorder:workspace?getComputedStyle(workspace).borderTopWidth:'absent',
        outerBackground:workspace?getComputedStyle(workspace).backgroundColor:'absent',
        desktopButton:main?getComputedStyle(main).display:'absent',
        mobileButton:mobile?getComputedStyle(mobile).display:'absent',
        repeatedServices:repeat?getComputedStyle(repeat).display:'absent',
        scrollWidth:document.documentElement.scrollWidth,
        viewport:innerWidth,
        scrollHeight:document.documentElement.scrollHeight,
      };
    });
    await page.screenshot({path:`uitvoer/mailfit-${width}.png`,fullPage:true});
    console.log(`MAILFIT_SCREEN_${width}: ${JSON.stringify(facts)}`);
    if(facts.domLength<500||!facts.hasEmpty)errors.push(`${width}: empty inbox did not render`);
    if(facts.headingDisplay!=='none'||facts.pagerDisplay!=='none')errors.push(`${width}: irrelevant mail heading/pager visible`);
    if(facts.borderRadius<23)errors.push(`${width}: square card (${facts.borderRadius}px)`);
    if(facts.outerBorder!=='0px'||facts.outerBackground!=='rgba(0, 0, 0, 0)')
      errors.push(`${width}: redundant outer mail panel (${facts.outerBorder}, ${facts.outerBackground})`);
    if(facts.scrollWidth>width+2)errors.push(`${width}: horizontal overflow ${facts.scrollWidth}`);
    if(facts.intro&&facts.wrapper&&Math.abs((facts.intro.x+facts.intro.width/2)-(facts.wrapper.x+facts.wrapper.width/2))>10)
      errors.push(`${width}: onboarding not centered`);
    if(width<=620){
      if(facts.mobileButton==='none'||facts.repeatedServices!=='none')errors.push(`${width}: incorrect mobile actions`);
      if(facts.intro&&facts.intro.bottom>height-50)errors.push(`${width}: card extends below mobile dock`);
    }else if(facts.desktopButton==='none')errors.push(`${width}: desktop Gmail action missing`);
    if(width>=1280&&facts.intro&&facts.intro.bottom>height-30)errors.push(`${width}: card not contained in desktop viewport`);
    await page.close();
  }
}finally{
  await browser.close();
  writeFileSync('uitvoer/mailfit-browser-errors.log',errors.length?errors.join('\n\n')+'\n':'Geen browserfouten.\n');
}
if(errors.length){for(const error of errors)console.error('MAILFIT_VISUAL_FAIL:',error);process.exitCode=1}
