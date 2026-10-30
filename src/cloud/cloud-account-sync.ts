/** Cloud account list convergence for multiple tabs and browsers.
 * No OAuth tokens or account emails in BroadcastChannel/localStorage.
 * The server remains authoritative. A selected account is TAB-LOCAL only.
 */
export type CloudAccountListItem={id:string;provider:string;displayName:string;email:string;status:string;mode:string;updatedAt:string};
export type CloudAccountResponse={schema:'cloud-accounts-m4';accounts:CloudAccountListItem[]};
export type CloudAccountListener=(accounts:CloudAccountListItem[],selectedId:string|null)=>void;
const CHANNEL='tsv-cloud-accounts-v1',TAB_KEY='tsv-cloud-active-account-v1',MAX_AGE=25_000;
export class CloudAccountSync{
 private channel:BroadcastChannel|null=null;
 private timer:ReturnType<typeof setInterval>|null=null;
 private listeners=new Set<CloudAccountListener>();
 private state:CloudAccountListItem[]=[];
 private busy=false;
 private lastCheck=0;
 private selected:string|null=null;
 constructor(private readonly endpoint='/api/owner/cloud/integrations/v1/accounts/list',private readonly intervalMs=20_000){
  try{this.selected=sessionStorage.getItem(TAB_KEY);}catch{}
 }
 subscribe(listener:CloudAccountListener){this.listeners.add(listener);listener(this.state,this.selected);return()=>this.listeners.delete(listener);}
 private emit(){this.listeners.forEach(l=>l([...this.state],this.selected));}
 select(accountId:string|null){
  this.selected=accountId&&this.state.some(x=>x.id===accountId&&x.status==='connected')?accountId:null;
  try{if(this.selected)sessionStorage.setItem(TAB_KEY,this.selected);else sessionStorage.removeItem(TAB_KEY);}catch{}
  this.emit(); // NEVER broadcast active-account selection.
 }
 async refresh(force=false){
  if(this.busy||(!force&&Date.now()-this.lastCheck<3000))return;
  this.busy=true;
  try{
   const resp=await fetch(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',
    credentials:'include',cache:'no-store',redirect:'error'});
   if(!resp.ok)return;
   const data=await resp.json() as CloudAccountResponse;
   if(data.schema!=='cloud-accounts-m4'||!Array.isArray(data.accounts))return;
   this.state=data.accounts.filter(x=>x&&typeof x.id==='string'&&typeof x.provider==='string');
   if(this.selected&&!this.state.some(x=>x.id===this.selected&&x.status==='connected')){
    this.selected=null;try{sessionStorage.removeItem(TAB_KEY);}catch{}
   }
   this.lastCheck=Date.now();this.emit();
  }finally{this.busy=false;}
 }
 /** A hint only; another browser/device learns of changes on its next poll. */
 announce(){try{this.channel?.postMessage({kind:'accounts_changed',at:Date.now()});}catch{}this.refresh(true).catch(()=>{});}
 start(){
  if(this.timer)return;
  if(typeof BroadcastChannel!=='undefined'){
   this.channel=new BroadcastChannel(CHANNEL);
   this.channel.onmessage=(event:MessageEvent)=>{
    const data=event.data;
    if(data?.kind==='accounts_changed'&&Number.isFinite(data.at)&&Math.abs(Date.now()-data.at)<MAX_AGE)
     this.refresh(true).catch(()=>{});
   };
  }
  this.timer=setInterval(()=>{
   if(typeof document==='undefined'||!document.hidden)this.refresh().catch(()=>{});
  },this.intervalMs);
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.onVisibility);
  this.refresh(true).catch(()=>{});
 }
 private onVisibility=()=>{if(!document.hidden)this.refresh(true).catch(()=>{});};
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;
  if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.onVisibility);
  this.channel?.close();this.channel=null;this.listeners.clear();}
}
/** The connect button must be invoked from an actual user gesture, before navigation.
 * The server returns a fixed-provider OAuth URL, not an arbitrary file host.
 */
export async function beginCloudConsent(provider:string,mode:'read'|'write'){
 const result=await fetch('/api/owner/cloud/integrations/v1/accounts/start',{method:'POST',
  headers:{'Content-Type':'application/json'},credentials:'include',cache:'no-store',redirect:'error',
  body:JSON.stringify({provider,mode})});
 if(!result.ok)throw new Error('CLOUD_CONSENT_START_FAILED');
 const data=await result.json() as {url?:string};
 if(!data.url)throw new Error('CLOUD_CONSENT_URL_MISSING');
 const url=new URL(data.url);
 if(url.protocol!=='https:'||!['login.microsoftonline.com','www.dropbox.com','account.box.com'].includes(url.hostname))
  throw new Error('CLOUD_CONSENT_URL_UNSAFE');
 // Same-tab navigation survives popup blockers. Return path is fixed server-side.
 window.location.assign(url.href);
}
