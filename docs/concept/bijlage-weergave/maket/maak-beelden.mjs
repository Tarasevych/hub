// Rendert de conceptpagina naar PNG's (Grok: hub.tarasevych.com). Alleen lokaal bestand, geen netwerk.
import {chromium} from 'playwright-core'; // npm i playwright-core; Chrome via CHROME=/pad/naar/chrome
const D=new URL('.', import.meta.url).pathname.replace(/\/$/,''); // map van dit script
const b=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',headless:true,args:['--host-resolver-rules=MAP * ~NOTFOUND']});
const p=await (await b.newContext({viewport:{width:2400,height:1200},deviceScaleFactor:1,locale:'uk-UA'})).newPage();
await p.goto('file://'+D+'/index.html'); await p.waitForTimeout(600);
const latijn=await p.evaluate(()=>[...document.body.innerText.matchAll(/[A-Za-z]{2,}/g)].map(m=>m[0]));
console.log('latijn',JSON.stringify([...new Set(latijn)]));
for(const [id,naam] of [['computer','voor-na-computer'],['zwevend','voor-na-zwevend'],['telefoon','voor-na-telefoon'],['melding','voor-na-melding']]){
  await p.locator('#'+id).screenshot({path:`${D}/../${naam}.png`}); console.log(naam);
}
await b.close();
