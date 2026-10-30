// Ontwikkelstand voor tests/e2e/tech-ruimtes-ui.e2e.ts: de echte TechLaag (band + vensters) en de echte wisselknop, zonder server.
// Alle /api-verzoeken beantwoordt de test (page.route, nepserver in het geheugen); andere hosts worden afgebroken. Alleen lokaal.
// De «kop» hieronder is een vereenvoudigd accountmenu: met vlag aan de wisselknop + «Доступ і терміни», met vlag uit de oude knop.
import { StrictMode, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { opRuimteWissel, useHuidigeRuimte } from '../../../../src/tech/ruimtes/ruimte-signaal';
import { createRoot } from 'react-dom/client';
import TechLaag from '../../../../src/tech/TechLaag';
import { openTechVenster, techGebruiker, useTech, techActief } from '../../../../src/tech/tech-opslag';
import { zijbalkVanServer } from '../../../../src/zijbalk-voorkeuren';
import { useRuimtesV2 } from '../../../../src/tech/ruimtes/ruimtes-vlag';
import { startRuimtes } from '../../../../src/tech/ruimtes/ruimtes-opslag';
import { WOORDEN } from '../../../../src/tech/ruimtes/teksten';
import { routeLang } from '../../../../src/canoniek-navigatie';
// esbuild laadt CSS van luie chunks niet zelf (vite wel): hier statisch, zodat de stand dezelfde stijl heeft als de site.
import '../../../../src/ontwerp/tokens.css';
import '../../../../src/platform/vensters.css';
import '../../../../src/tech/tech.css';
import '../../../../src/tech/ruimtes/ruimtes.css';
const RuimteWissel = lazy(() => import('../../../../src/tech/ruimtes/RuimteWissel'));
const ZijbalkRuimte = lazy(() => import('../../../../src/tech/ruimtes/ZijbalkRuimte'));
// Nagebootst zijmenu: de ruimtewissel staat onderaan (28.10.2026, vervangt de zwevende strook onderaan).
function ZijMenu() {
  const v2 = useRuimtesV2();
  const [open, setOpen] = useState(false);
  useEffect(() => { document.body.style.paddingLeft = '60px'; }, []);
  return (<aside className='canonical-sidebar stand-zijmenu' data-stand='zijmenu' data-open={open ? '1' : '0'} style={{ position: 'fixed', left: 0, top: 'var(--tech-band-h, 0px)', bottom: 0, width: open ? 220 : 56, display: 'flex', flexDirection: 'column', background: 'var(--panel)', borderRight: '1px solid var(--line)', zIndex: 5 }}>
    <button type='button' className='canonical-menu-toggle' data-stand='menu-knop' aria-label='Меню' onClick={() => setOpen(!open)} style={{ width: 44, height: 44 }}>≡</button>
    <div style={{ flex: 1 }} />
    {v2 ? <Suspense fallback={null}><ZijbalkRuimte lang='uk' breed={open} /></Suspense> : null}
  </aside>);
}

declare global { interface Window { __standId: string; __uitgelogd: number } }
window.__standId = Math.random().toString(36).slice(2);
window.__uitgelogd = 0;
if (location.pathname.startsWith('/nl/')) document.documentElement.lang = 'nl';
if (new URLSearchParams(location.search).get('thema') === 'donker') document.documentElement.classList.add('theme-dark');
zijbalkVanServer({}, { service: 'hub', scope: 'u1' });

function Kop() {
  const v2 = useRuimtesV2();
  const t = useTech();
  const taal = routeLang() === 'nl' ? 'nl' : 'uk';
  useEffect(() => { techGebruiker('u1'); }, []);
  useEffect(() => { if (v2) startRuimtes(); }, [v2]);
  useEffect(() => { const op = (e: Event) => { if ((e as CustomEvent).detail === 'site') window.__uitgelogd += 1; }; window.addEventListener('mr-ruimtes-uitloggen', op); return () => window.removeEventListener('mr-ruimtes-uitloggen', op); }, []);
  return (
    <header className='stand-kop' data-stand-kop={v2 ? 'v2' : 'oud'}>
      <b>Мій простір</b>
      {v2 ? <><Suspense fallback={null}><RuimteWissel taal={taal} /></Suspense>
        <button type='button' data-stand='toegang' onClick={() => openTechVenster('toegang')}>{WOORDEN.toegangPagina[taal]}</button></>
        : t.profiel ? <button type='button' data-stand='oud-tech' onClick={() => openTechVenster('activeren')}>{`${taal === 'uk' ? 'Технічний профіль' : 'Technisch profiel'} · ${techActief(t) ? (taal === 'uk' ? 'увімкнено' : 'aan') : (taal === 'uk' ? 'вимкнено' : 'uit')}`}</button> : null}
    </header>
  );
}
// Nagebootst leesvenster (zelfde opberg-/terugzetpatroon als GoogleMailWerkruimte): een PERSOONLIJKE brief mag na de wissel niet
// zichtbaar blijven in de technische ruimte en moet terugkomen in de gewone ruimte (met het half getypte antwoord).
function LeesStand() {
  const ruimte = useHuidigeRuimte();
  const [brief, setBrief] = useState<string | null>(null);
  const [antwoord, setAntwoord] = useState('');
  const staat = useRef({ brief, antwoord }); staat.current = { brief, antwoord };
  const berging = useRef<Record<string, { brief: string | null; antwoord: string }>>({});
  useEffect(() => opRuimteWissel(({ van, naar }) => { berging.current[van] = staat.current; const t = berging.current[naar]; setBrief(t?.brief ?? null); setAntwoord(t?.antwoord ?? ''); }), []);
  return (<section data-stand='post' data-stand-ruimte={ruimte}><span className='zijbalk-werkbalk-titel'>Меню</span>
    <button type='button' data-stand='open-brief' onClick={() => setBrief(ruimte === 'technisch' ? 'Технічний лист' : 'Особистий лист від адвоката')}>Відкрити лист</button>
    {brief ? <article data-stand='brief'>{brief}<textarea data-stand='antwoord' value={antwoord} onChange={(e) => setAntwoord(e.target.value)} /></article> : <p data-stand='leeg'>Лист не відкрито</p>}</section>);
}
function Stand() {
  return (<><Kop /><ZijMenu /><main className='stand-main'><h1>Огляд</h1><LeesStand /><label>Нотатка (перевірка, що текст не зникає)<textarea data-stand='tekst' rows={3} /></label></main></>);
}
document.documentElement.classList.add(matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-light');
document.body.style.background = 'var(--bg)'; document.body.style.color = 'var(--text)';
const root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root);
createRoot(root).render(<StrictMode><Stand /></StrictMode>);
const laag = document.createElement('div'); laag.id = 'tech-laag'; document.body.appendChild(laag);
createRoot(laag).render(<TechLaag />);
