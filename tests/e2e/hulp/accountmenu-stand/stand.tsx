// Ontwikkelstand voor tests/e2e/accountmenu-v2.e2e.ts: het ECHTE CanonicalAccountMenu (src/CanoniekAccountMenu.tsx) in isolatie.
// Alle /api-verzoeken beantwoordt de test (page.route). ?modus=oud|nieuw bepaalt alleen wat de nep-OFREP voor accountmenu-v2 zegt.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CanonicalAccountMenu, { type AccountTheme, type AccountMenuSnapshot } from '../../../../src/CanoniekAccountMenu';
import { zijbalkVanServer } from '../../../../src/zijbalk-voorkeuren';
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/canoniek-omlijsting.css';
import '../../../../src/tech/tech.css';
import '../../../../src/tech/ruimtes/ruimtes.css';
import '../../../../src/hulp/hulp-knop.css';

zijbalkVanServer({}, { service: 'hub', scope: 'u1' });
const q = new URLSearchParams(location.search);
const donker = q.get('thema') === 'donker';
const meer = q.get('accounts') !== '1';
declare global { interface Window { __acties: string[] } }
window.__acties = [];
const log = (s: string) => window.__acties.push(s);
const user = { id: 'u1', name: 'Eigenaar Test', email: 'pavlo@example.org' };
const snapshot: AccountMenuSnapshot = {
  accounts: [
    { grantId: 'g1', user, lastUsedAt: Date.now(), expiresAt: Date.now() + 864e5, current: true, status: 'active' },
    ...(meer ? [
      { grantId: 'g2', user: { id: 'u2', name: 'Werk Account', email: 'werk@example.org' }, lastUsedAt: Date.now() - 1e6, expiresAt: Date.now() + 864e5, status: 'signed_in' as const },
      { grantId: 'g3', user: { id: 'u3', name: 'Familie', email: 'familie@example.org' }, lastUsedAt: Date.now() - 2e6, expiresAt: Date.now() + 864e5, status: 'reauth' as const },
    ] : []),
  ], previews: [], externalCandidates: [],
};
function Stand() {
  const [lang, setLang] = useState<'uk' | 'nl'>(q.get('lang') === 'nl' ? 'nl' : 'uk');
  const [theme, setTheme] = useState<AccountTheme>(donker ? 'dark' : 'light');
  return (
    <div className={`canonical-chrome theme-${donker ? 'dark' : 'light'}`} style={{ minHeight: '100vh', background: 'var(--canonical-surface, var(--bg))' }}>
      <header style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px' }}>
        <CanonicalAccountMenu lang={lang} theme={theme} user={user}
          onManage={() => log('beheer')} onSettings={() => log('instellingen')} onThemeColors={() => log('kleuren')}
          onAddAccount={() => log('toevoegen')} onLogout={() => log('uitloggen')} onLogoutAll={() => log('alles-uit')}
          onLanguage={(l) => { log(`taal:${l}`); setLang(l); }} onTheme={(t) => { log(`thema:${t}`); setTheme(t); }}
          onLoadAccounts={async () => snapshot} onSelectAccount={async (g) => { log(`kies:${g}`); }}
          onForgetAccount={async (g) => { log(`vergeet:${g}`); return snapshot; }}
          onProfilePhotoChange={async () => { log('foto'); }} />
      </header>
    </div>
  );
}
document.documentElement.classList.add(donker ? 'theme-dark' : 'theme-light');
const root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root);
createRoot(root).render(<StrictMode><Stand /></StrictMode>);
