// Ontwikkelstand voor tests/e2e/scan-melding.e2e.ts (BUG-002): de ECHTE melding «Перевірка всіх адрес» (ContactenScanMelding), zonder
// server. Alle /api-verzoeken beantwoordt de test (page.route, nepserver). Legt elke zichtbare overgang vast in window.__overgangen:
// gemount / weg / klein / open, met tijd — dat is het logboek van de werkelijke toestandsovergangen.
import { StrictMode, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ContactenScanMelding from '../../../../src/afzenders/ContactenScanMelding';
import { vensterBeheer } from '../../../../src/platform/vensters';
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/platform/vensters.css';
import '../../../../src/afzenders/afzenders.css';
import '../../../../src/afzenders/contacten.css';

const zoek = new URLSearchParams(location.search);
document.documentElement.classList.add(zoek.get('thema') === 'donker' ? 'theme-dark' : 'theme-light');
document.body.style.background = 'var(--bg)'; document.body.style.color = 'var(--text)';
const w = window as unknown as Record<string, unknown>;
const log: Array<{ t: number; ev: string }> = []; w.__overgangen = log;
const t0 = performance.now();
const noteer = (ev: string) => { log.push({ t: Math.round(performance.now() - t0), ev }); };
w.__noteer = noteer;
let vorige = '';
const meet = () => {
  const v = vensterBeheer.lijst().find((x) => x.id === 'mail-contacten-scan');
  const strook = document.querySelector('.ctv-melding') as HTMLElement | null;
  const nu = v ? (v.klein ? 'venster:klein' : 'venster:open') : strook ? `strook:${strook.dataset.ingeklapt === 'ja' ? 'ingeklapt' : 'open'}` : 'geen';
  if (nu !== vorige) { noteer(`zicht ${vorige || '∅'} → ${nu}`); vorige = nu; }
};
new MutationObserver(meet).observe(document.body, { subtree: true, childList: true, attributes: true });
setInterval(meet, 50);

function App() {
  const [sleutel, setSleutel] = useState(0), [actief, setActief] = useState(true), [sessie, setSessie] = useState(true);
  w.__hermount = () => setSleutel((k) => k + 1);
  w.__actief = (a: boolean) => setActief(a);
  w.__sessie = (a: boolean) => setSessie(a);
  return <Suspense fallback={null}>{sessie && <ContactenScanMelding key={sleutel} lang='uk' actief={actief} />}</Suspense>;
}
const root = document.createElement('div'); document.body.appendChild(root);
createRoot(root).render(<StrictMode><App /></StrictMode>);
