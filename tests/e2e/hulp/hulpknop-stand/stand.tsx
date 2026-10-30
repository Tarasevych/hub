// Ontwikkelstand voor tests/e2e/hulpknoppen-ui.e2e.ts (29.10.2026): de ECHTE beheerpagina (src/BeheerConsoleWeergave.tsx, tabblad
// toegang of sso) en het ECHTE venster «SSH-сертифікати» (src/ssh/SshBeheer.tsx), zonder server. Alle /api-verzoeken beantwoordt de
// test (page.route). Alleen lokaal.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AdminConsoleView from '../../../../src/BeheerConsoleWeergave';
import SshBeheer from '../../../../src/ssh/SshBeheer';
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/index.css';
import '../../../../src/platform/vensters.css';
import '../../../../src/tech/tech.css';

const zoek = new URLSearchParams(location.search);
document.documentElement.lang = 'uk';
document.documentElement.classList.add(zoek.get('thema') === 'donker' ? 'theme-dark' : 'theme-light');
document.body.style.background = 'var(--bg)'; document.body.style.color = 'var(--text)';
const root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root);
const weergave = zoek.get('weergave') || 'access';
createRoot(root).render(<StrictMode>{weergave === 'ssh'
  ? <SshBeheer sluit={() => undefined} />
  : <main className='stand-beheer' style={{ padding: 12, maxWidth: 1100 }}><AdminConsoleView lang='uk' tab={weergave} userId='u1' sourceOrigin={location.origin} tabContext='stand' /></main>}</StrictMode>);
