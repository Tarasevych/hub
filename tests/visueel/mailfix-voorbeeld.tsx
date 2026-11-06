// MAILFIX-001: de ECHTE volledige MailFunctionalView met MailAccountsHub én IntegratieStrook,
// niet enkel een geïsoleerde orbit. Alle API-antwoorden hieronder zijn fictief en bevatten geen privésessie.
import '../../src/ontwerp/tokens.css'; // tokens van de site (DESIGN-001): de echte component-CSS gebruikt ze zonder terugval
import { createRoot } from 'react-dom/client';
import MailFunctionalView from '../../src/MailFunctioneelWeergave';

const antwoord = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
const bootstrap = {
  items: [], resume: null,
  metrics: { firstImportAt: 0, firstActionAt: 0, focusViews: 0, taskConversions: 0, snoozes: 0, drafts: 0, triageChanges: 0 },
  notificationPreference: { minimum: 'action', updatedAt: 0 },
  googleMail: { accounts: [], connectEnabled: true },
  provider: { connected: false, manualImport: true },
};

// De fake API dient uitsluitend een reproduceerbare layoutcontrole, nooit een OAuth-doorvoer.
const echteFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith('/api/ofrep/v1/evaluate/flags/integraties-catalogus-v2')) return antwoord({ value: true });
  if (url.startsWith('/api/owner/mail/bootstrap')) return antwoord(bootstrap);
  if (url.startsWith('/api/owner/mail/google-suite/accounts')) return antwoord({ accounts: [], inactiveAccounts: [], connectEnabled: true, sessionEmail: '' });
  if (url.startsWith('/api/owner/mail/notification-preferences/list')) return antwoord({ accounts: [], legacy: { minimum: 'action' } });
  if (url.startsWith('/api/owner/mail/imap/aanbieders')) return antwoord({ koppelingen: [] });
  if (url.startsWith('/api/owner/mail/accounts/list')) return antwoord({ accounts: [] });
  if (url.startsWith('/api/')) return antwoord({ ok: true, accounts: [] });
  return echteFetch(input, init);
};

function Preview() {
  return <div className='mailfix-shell'>
    <header className='mailfix-head'>Mijn Ruimte <span>Повна сторінка · перевірка на мобільному</span></header>
    <MailFunctionalView lang='uk' tab='accounts' userId='mailfix-fixture' userName=''
      sourceOrigin={location.origin} tabContext='' homeSignal={0} sessionReady
      onFocusChange={() => {}} />
  </div>;
}

createRoot(document.getElementById('root')!).render(<Preview />);
