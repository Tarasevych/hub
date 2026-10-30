// Ontwikkelstand voor tests/e2e/agenda-v3-ui.e2e.ts: de ECHTE agendapagina (src/agenda/Agenda.tsx met de poort naar v3), zonder server.
// Alle /api-verzoeken beantwoordt de test (page.route, nepserver in het geheugen); andere hosts worden afgebroken. Alleen lokaal.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Agenda from '../../../../src/agenda/Agenda';
// esbuild laadt CSS van luie chunks niet zelf (vite wel): hier statisch, zodat de stand dezelfde stijl heeft als de site.
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/platform/vensters.css';
import '../../../../src/agenda/agenda.css';
import '../../../../src/agenda/v3/agenda-v3.css';

const zoek = new URLSearchParams(location.search);
const lang = location.pathname.startsWith('/nl/') ? 'nl' : 'uk';
document.documentElement.lang = lang;
document.documentElement.classList.add(zoek.get('thema') === 'donker' ? 'theme-dark' : 'theme-light');
document.body.style.background = 'var(--bg)'; document.body.style.color = 'var(--text)';
const root = document.createElement('div'); root.id = 'root'; root.className = 'stand-main'; document.body.appendChild(root);
createRoot(root).render(<StrictMode><Agenda lang={lang} ownerUserId='u1' /></StrictMode>);
