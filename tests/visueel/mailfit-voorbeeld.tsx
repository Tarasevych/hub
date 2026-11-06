// MAILFIT-001: echte MailFunctionalView met een volledig fictieve, nog niet gekoppelde mailbox.
// De tests werken niet met een eigenaarssessie of een echte OAuth-doorvoer.
import { createRoot } from 'react-dom/client';
import MailFunctionalView from '../../src/MailFunctioneelWeergave';

const json = (value: unknown) => new Response(JSON.stringify(value), {status:200,headers:{'Content-Type':'application/json'}});
const bootstrap = {
  items:[],resume:null,
  metrics:{firstImportAt:0,firstActionAt:0,focusViews:0,taskConversions:0,snoozes:0,drafts:0,triageChanges:0},
  notificationPreference:{minimum:'action',updatedAt:0},
  googleMail:{accounts:[],connectEnabled:true},
  provider:{connected:false,manualImport:true},
};
const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url=String(input instanceof Request?input.url:input);
  if(url.startsWith('/api/ofrep/v1/evaluate/flags/integraties-catalogus-v2'))return json({value:true});
  if(url.startsWith('/api/owner/mail/bootstrap'))return json(bootstrap);
  if(url.startsWith('/api/owner/mail/google-suite/accounts'))return json({accounts:[],inactiveAccounts:[],connectEnabled:true,sessionEmail:''});
  if(url.startsWith('/api/owner/mail/notification-preferences/list'))return json({accounts:[],legacy:{minimum:'action'}});
  if(url.startsWith('/api/owner/mail/imap/aanbieders'))return json({koppelingen:[]});
  if(url.startsWith('/api/owner/mail/accounts/list'))return json({accounts:[]});
  if(url.startsWith('/api/'))return json({ok:true,accounts:[],messages:[],resultSizeEstimate:0});
  return originalFetch(input,init);
};

function Preview(){return <main className='mailfit-shell'>
  <header className='mailfit-head'>Mijn Ruimte <span>Порожня пошта · адаптивне підключення</span></header>
  <MailFunctionalView lang='uk' tab='inbox' userId='mailfit-fictief' userName=''
    sourceOrigin={location.origin} tabContext='' homeSignal={0} sessionReady onFocusChange={()=>{}} />
  <div className='mailfit-dock' aria-hidden='true'/>
</main>}

createRoot(document.getElementById('root')!).render(<Preview/>);
