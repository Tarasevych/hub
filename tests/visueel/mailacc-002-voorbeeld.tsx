// MAILACC-002: de ECHTE MailFunctionalView op het tabblad «accounts», mét gekoppelde accounts (Gmail + Ukr.net via IMAP)
// en met een vertraagde API (?vertraging=ms), zodat te zien is dat er vóór het laden géén lege orbit meer flitst.
// Alle API-antwoorden zijn fictief (geen echte sessie of adressen).
import '../../src/ontwerp/tokens.css';
import '../../src/thema/paletten.css';
import { createRoot } from 'react-dom/client';
import MailFunctionalView from '../../src/MailFunctioneelWeergave';

const zoek = new URLSearchParams(location.search);
const vertraging = Number(zoek.get('vertraging') || 0);
const leeg = zoek.get('leeg') === 'ja';
const wacht = () => new Promise((r) => setTimeout(r, vertraging));
const antwoord = async (data: unknown) => { await wacht(); return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
const gmail = leeg ? [] : [{ id: 'g1', email: 'voorbeeld@gmail.com', accountRole: 'primary', status: 'active' }];
const imap = leeg ? [] : [{ id: 'i1', aanbieder: 'ukrnet', adres: 'voorbeeld@ukr.net', actief: true, mappen: 3, smtpGoed: true, laatstGoedOp: Date.now(), fout: '' }];
const bootstrap = {
  items: [], resume: null,
  metrics: { firstImportAt: 0, firstActionAt: 0, focusViews: 0, taskConversions: 0, snoozes: 0, drafts: 0, triageChanges: 0 },
  notificationPreference: { minimum: 'action', updatedAt: 0 },
  googleMail: { accounts: [], connectEnabled: true },
  provider: { connected: false, manualImport: true },
};
(window as unknown as { __ophalen: string[] }).__ophalen = [];
const echteFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  (window as unknown as { __ophalen: string[] }).__ophalen.push(url);
  if (url.startsWith('/api/ofrep/v1/evaluate/flags/integraties-catalogus-v2')) return antwoord({ value: true });
  if (url.startsWith('/api/owner/mail/bootstrap')) return antwoord(bootstrap);
  if (url.startsWith('/api/owner/mail/google-suite/accounts')) return antwoord({ accounts: gmail, inactiveAccounts: [], connectEnabled: true, sessionEmail: '' });
  if (url.startsWith('/api/owner/mail/notification-preferences/list')) return antwoord({ accounts: [], legacy: { minimum: 'action' } });
  if (url.startsWith('/api/owner/mail/imap/aanbieders')) return antwoord({ koppelingen: imap });
  if (url.startsWith('/api/owner/mail/accounts/list')) return antwoord({ accounts: [] });
  if (url.startsWith('/api/')) return antwoord({ ok: true, accounts: [], items: [] });
  return echteFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <div className='mailacc-shell'>
    <MailFunctionalView lang={zoek.get('taal') === 'nl' ? 'nl' : 'uk'} tab='accounts' userId='mailacc-fixture' userName='Voorbeeld Gebruiker'
      sourceOrigin={location.origin} tabContext='' homeSignal={0} sessionReady onFocusChange={() => {}} />
  </div>,
);
