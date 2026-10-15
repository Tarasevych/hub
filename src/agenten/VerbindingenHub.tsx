// ai.*/verbindingen — єдиний хаб підключень ШІ (реорганізація: усе, що стосується підключень ШІ, тут, як підвкладки).
// Підвкладки через hash (#...), щоб не плодити шляхи й не ламати маршрутизацію сервісів:
//   #bord        — Підключення ШІ (дошка: AgentBord)
//   #connectors  — Конектори (окрема адреса на агента, конектор v2: ConnectorsTab)
//   #tech        — Технічні підключення (лише з активним технічним профілем власника: TechVerbindingen)
// Метод MCP і «Доступ ШІ» (admin) додаються наступними порціями. Старий ai/connections → ai/verbindingen (аліас) уже діє.
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Plug, Sparkles, Wrench } from 'lucide-react';
import type { Tr } from '../mcp-ui';
import { useTech, techActief } from '../tech/tech-store';
import '../mcp-hub.css';
import './agenten.css';

const AgentBord = lazy(() => import('./AgentBord'));
const ConnectorsTab = lazy(() => import('../connector-v2/ConnectorsTab'));
const TechVerbindingen = lazy(() => import('./TechVerbindingen'));

type Sub = 'bord' | 'connectors' | 'tech';
const SUBS: Sub[] = ['bord', 'connectors', 'tech'];
const leesSub = (): Sub => { const h = (location.hash || '').replace(/^#/, '').split('/')[0]; return (SUBS as string[]).includes(h) ? (h as Sub) : 'bord'; };

export default function VerbindingenHub({ tr }: { tr: Tr }) {
  const tech = useTech();
  const [sub, setSub] = useState<Sub>(() => leesSub());
  useEffect(() => {
    const volg = () => setSub(leesSub());
    window.addEventListener('hashchange', volg);
    return () => window.removeEventListener('hashchange', volg);
  }, []);
  const ga = useCallback((s: Sub) => {
    setSub(s);
    try { history.pushState(null, '', `${location.pathname}${location.search}#${s}`); } catch { /* geen history */ }
  }, []);

  const info: Record<Sub, { uk: string; nl: string; icoon: React.ReactNode }> = {
    bord: { uk: 'Підключення ШІ', nl: 'AI-koppelingen', icoon: <Sparkles /> },
    connectors: { uk: 'Конектори', nl: 'Connectors', icoon: <Plug /> },
    tech: { uk: 'Технічні підключення', nl: 'Technische verbindingen', icoon: <Wrench /> },
  };
  // Технічна вкладка — лише для власника з активним технічним профілем (як і раніше на mcp.*/verbindingen).
  const zichtbaar = useMemo(() => SUBS.filter((s) => s !== 'tech' || techActief(tech)), [tech]);

  return (
    <div className='ag' data-verbindingen-hub={sub}>
      <header className='ag-kop'>
        <div>
          <h1>{tr('Підключення ШІ', 'AI-koppelingen')}</h1>
          <p>{tr('Усе про підключення ШІ в одному місці: хто має доступ до вашого простору, окремі конектори для кожного агента та (для власника) технічні підключення.', 'Alles over AI-koppelingen op één plek: wie toegang heeft tot uw ruimte, aparte connectors per agent en (voor de eigenaar) technische verbindingen.')}</p>
        </div>
      </header>

      <nav className='ag-tabs' role='tablist' aria-label={tr('Розділи підключень', 'Onderdelen van koppelingen')}>
        {zichtbaar.map((s) => (
          <a key={s} role='tab' href={`#${s}`} aria-selected={sub === s} className='ag-tab-knop' data-verbindingen-sub={s}
            onClick={(e) => { e.preventDefault(); ga(s); }}>
            {info[s].icoon}<span>{tr(info[s].uk, info[s].nl)}</span>
          </a>
        ))}
      </nav>

      <section className='ag-paneel' role='tabpanel'>
        <Suspense fallback={null}>
          {sub === 'bord' ? <AgentBord tr={tr} /> : null}
          {sub === 'connectors' ? <ConnectorsTab tr={tr} /> : null}
          {sub === 'tech' && techActief(tech) ? <TechVerbindingen tr={tr} /> : null}
        </Suspense>
      </section>
    </div>
  );
}
