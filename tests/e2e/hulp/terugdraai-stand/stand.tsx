// Ontwikkelstand voor tests/e2e/terugdraaien-ui.e2e.ts: de ECHTE terugdraai-wizard (src/besluit/TerugdraaiMeester.tsx) en de echte
// pakketgegevens van een run (src/uitrol/RunDetail.tsx), zonder server. Alle /api-verzoeken beantwoordt de test (page.route). Alleen lokaal.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TerugdraaiMeester from '../../../../src/besluit/TerugdraaiMeester';
import RunDetail from '../../../../src/uitrol/RunDetail';
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/uitrol/uitrol.css';
import '../../../../src/uitrol/pakket.css';
import '../../../../src/beheer-uitrol.css';

const zoek = new URLSearchParams(location.search);
const lang = zoek.get('taal') === 'nl' ? 'nl' : 'uk';
document.documentElement.lang = lang;
document.documentElement.classList.add(zoek.get('thema') === 'donker' ? 'theme-dark' : 'theme-light');
document.body.style.background = 'var(--bg)'; document.body.style.color = 'var(--text)';
const tr = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
const ctx = { service: 'mcp', tabContext: 'stand', sourceOrigin: location.origin };

function Stand() {
  const [open, setOpen] = useState(true);
  if (zoek.get('weergave') === 'run') return <div style={{ padding: 16, maxWidth: 1100 }}><RunDetail lang={lang} context={ctx} runId='ssh-20261029T100000000000Z-abcd1234' /></div>;
  return <>{!open && <button type='button' onClick={() => setOpen(true)}>open</button>}<TerugdraaiMeester tr={tr} ctx={ctx} open={open} onSluit={() => setOpen(false)} /></>;
}
const root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root);
createRoot(root).render(<StrictMode><Stand /></StrictMode>);
