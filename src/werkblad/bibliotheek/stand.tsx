// ONTWIKKELSTAND (geen productie-ingang): de bibliotheek, snelkoppelingen en een map los gerenderd, voor
// tests/e2e/werkblad-bibliotheek.e2e.ts. Querystring: ?lang=uk|nl&thema=licht|donker&ruimte=prive|technisch&api=1.
// Navigeren gebeurt hier NOOIT: het adres van de canonieke router wordt alleen in #stand-nav getoond.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bibliotheek } from './Bibliotheek';
import { ShortcutTegel } from './ShortcutTegel';
import { MapTegel } from './MapTegel';
import { BIBLIOTHEEK_EVENT, leesSleepData, leesVerzoek, type BibliotheekVerzoek } from './contract';
import type { RegisterContext, RegisterRegel } from '../../../shared/werkblad-register';

const q = new URLSearchParams(location.search);
const lang = q.get('lang') === 'nl' ? 'nl' : 'uk';
const donker = q.get('thema') === 'donker';
const ctx: RegisterContext = { ruimte: q.get('ruimte') === 'technisch' ? 'technisch' : 'prive', rechten: { apiPlatform: q.get('api') === '1', eigenaar: true } };
document.documentElement.dataset.thema = donker ? 'donker' : 'licht';

function Stand() {
  const [log, setLog] = useState<BibliotheekVerzoek[]>([]);
  const [nav, setNav] = useState('');
  const [persoonlijk, setPersoonlijk] = useState<RegisterRegel[]>([]);
  const ontvang = (v: BibliotheekVerzoek) => setLog((l) => [...l, v]);
  if (!(window as unknown as { __standLuistert?: boolean }).__standLuistert) {
    (window as unknown as { __standLuistert?: boolean }).__standLuistert = true;
    window.addEventListener(BIBLIOTHEEK_EVENT, (e) => { const v = leesVerzoek((e as CustomEvent).detail); if (v) ontvang(v); });
  }
  return (
    <main className='stand'>
      <div className='stand-bib'><Bibliotheek lang={lang} ctx={ctx} donker={donker} persoonlijk={persoonlijk} onPersoonlijk={setPersoonlijk} /></div>
      <div className='stand-canvas' data-stand-canvas onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const v = leesSleepData(e.dataTransfer); if (v) ontvang({ ...v, point: { x: Math.round(e.nativeEvent.offsetX), y: Math.round(e.nativeEvent.offsetY) } }); }}>
        <div className='stand-tegels'>
          {['svc:mail', 'pg:mail/spam', 'svc:social', 'pg:admin/audit', 'cmd:bericht-schrijven', ...persoonlijk.map((p) => p.id)].map((id) => (
            <div key={id} className='stand-tegel'><ShortcutTegel itemId={id} lang={lang} ctx={ctx} donker={donker} persoonlijk={persoonlijk} navigeer={setNav} /></div>
          ))}
          <div className='stand-tegel'><MapTegel map={{ instanceId: 'm1', titleOverride: lang === 'uk' ? 'Пошта' : 'Post' }} kinderen={[{ instanceId: 'a', itemId: 'pg:mail/inbox', kind: 'shortcut' }, { instanceId: 'b', itemId: 'pg:mail/sent', kind: 'shortcut' }, { instanceId: 'c', itemId: 'pg:mail/drafts', kind: 'shortcut' }]} lang={lang} ctx={ctx} donker={donker} navigeer={setNav} /></div>
        </div>
        <output id='stand-nav'>{nav}</output>
        <pre id='stand-log'>{JSON.stringify(log)}</pre>
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Stand />);
