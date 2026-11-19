// UI-015: stand voor tests/e2e/aanmeldmethoden-v2.e2e.ts — de ECHTE controller src/ToegangslaagWeergave.tsx (AccessPlaneView) met de
// globale site-css, zonder server. Vlag uit sessionStorage (zelfde sleutel als src/aanmeldmethoden-v2/vlag.ts); /api beantwoordt de test.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AccessPlaneView from '../../../../src/ToegangslaagWeergave';
import '../../../../src/index.css';
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/instellingencentrum.css';

const zoek = new URLSearchParams(location.search);
const lang = zoek.get('taal') === 'nl' ? 'nl' : 'uk';
try { sessionStorage.setItem('mr-vlag:aanmeldmethoden-v2', zoek.get('v2') === '1' ? '1' : '0'); } catch { /* geen opslag */ }
document.documentElement.lang = lang;
document.documentElement.classList.add(zoek.get('thema') === 'donker' ? 'theme-dark' : 'theme-light');
document.documentElement.style.colorScheme = zoek.get('thema') === 'donker' ? 'dark' : 'light';
const tab = zoek.get('tab') || 'methods';
const el = document.createElement('div'); el.id = 'root'; document.body.appendChild(el);
(window as unknown as { __sessies: number }).__sessies = 0;
createRoot(el).render(<StrictMode><main className='stand-pagina' style={{ padding: 'clamp(12px,3vw,32px)', minHeight: '100vh', background: 'var(--amv2-pagina, transparent)' }}>
  <div className='settings-center'><header><div><h1>{lang === 'uk' ? 'Способи входу' : 'Aanmeldmethoden'}</h1></div></header>
    <AccessPlaneView tab={tab} lang={lang} mode='identity' onSessies={() => { (window as unknown as { __sessies: number }).__sessies++; }} /></div>
</main></StrictMode>);
