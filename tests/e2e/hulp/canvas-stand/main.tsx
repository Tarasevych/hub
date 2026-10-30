// Stand voor tests/e2e/werkblad-canvas.e2e.ts: het canvas met nep-items, zonder server. Alleen lokaal (vite op 127.0.0.1).
// window.__wbc: commits (één per afgerond gebaar), huidige indelingen per apparaat. Persistentie = localStorage (zoals F5 na opslaan).
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ApparaatKlasse, CanvasLayout, DesktopEntry } from '../../../../shared/werkblad-v3-types';
import { Canvas, type CanvasStatus } from '../../../../src/werkblad/canvas/Canvas';
import { aanpassenVanaf, STANDAARD_CANVASBREEDTE, type LimietenFn } from '../../../../src/werkblad/canvas/kern';

type W = { commits: Array<{ klasse: ApparaatKlasse; layout: CanvasLayout }>; layouts: Partial<Record<ApparaatKlasse, CanvasLayout>>; adds: number };
declare global { interface Window { __wbc: W } }
const q = new URLSearchParams(location.search);
const SLEUTEL = 'wbc-stand-v1';
const it = (instanceId: string, kind: DesktopEntry['kind'], x: number, y: number, w: number, h: number, z: number): DesktopEntry => ({ instanceId, itemId: `${kind === 'widget' ? 'wdg' : 'svc'}:${instanceId}`, kind, x, y, w, h, z });
const PC: CanvasLayout = { mode: (q.get('mode') as CanvasLayout['mode']) || 'free', canvasWidth: 1280, canvasHeight: 900, items: [
  it('mail', 'shortcut', 40, 40, 96, 96, 1), it('agenda', 'shortcut', 160, 40, 96, 96, 2), it('notities', 'widget', 400, 60, 320, 240, 3),
  it('bestanden', 'shortcut', 40, 400, 96, 96, 4), it('weer', 'widget', 800, 400, 300, 200, 5), it('zoek', 'shortcut', 40, 700, 96, 96, 6),
] };
const NAMEN: Record<string, string> = { mail: 'Пошта', agenda: 'Календар', notities: 'Нотатки', bestanden: 'Файли', weer: 'Погода', zoek: 'Пошук' };
const lim: LimietenFn = (id) => (id.startsWith('wdg:') ? { minW: 200, minH: 140, maxW: 900, maxH: 700 } : { minW: 72, minH: 72, maxW: 200, maxH: 200 });
const bewaard = (): W['layouts'] => { if (q.has('vers')) localStorage.removeItem(SLEUTEL); try { return JSON.parse(localStorage.getItem(SLEUTEL) || '{}'); } catch { return {}; } };
window.__wbc = { commits: [], layouts: bewaard(), adds: 0 };

function Stand() {
  const [layouts, zet] = useState<W['layouts']>(() => window.__wbc.layouts);
  const [klasse, zetKlasse] = useState<ApparaatKlasse | null>(null);
  const [bewerken, zetBewerken] = useState(q.get('edit') !== '0');
  const [zij, zetZij] = useState(true);
  const status = (q.get('status') as CanvasStatus) || 'idle';
  const layout = useMemo(() => {
    if (!klasse) return null;
    return layouts[klasse] || (klasse === 'computer' ? PC : aanpassenVanaf(layouts.computer || PC, STANDAARD_CANVASBREEDTE[klasse], lim));
  }, [klasse, layouts]);
  return (
    <div className="stand">
      <nav className={`stand-zij${zij ? '' : ' dicht'}`} aria-label="Бічна панель">Меню</nav>
      <main className="stand-hoofd">
        <div className="stand-balk">
          <button type="button" data-qa="edit" onClick={() => zetBewerken((b) => !b)}>{bewerken ? 'Готово' : 'Налаштувати робочий стіл'}</button>
          <button type="button" data-qa="zij" onClick={() => zetZij((b) => !b)}>Бічна панель</button>
          <span data-qa="klasse">{klasse}</span>
        </div>
        <div data-qa="canvas-houder">
          {(() => {
            // Altijd renderen zodat de ResizeObserver de echte breedte meet; zonder klasse eerst een lege indeling.
            const l = layout || { ...PC, items: [] };
            return (
              <Canvas key={klasse || 'meet'} layout={l} editMode={bewerken} limieten={lim} status={status} lang={(q.get('lang') as 'uk' | 'nl') || 'uk'}
                titel={(e) => NAMEN[e.instanceId] || e.itemId}
                onApparaat={(k) => zetKlasse(k)}
                onRequestAdd={() => { window.__wbc.adds++; }}
                onRetry={() => {}} onReload={() => location.reload()}
                onCommit={(n) => { if (!klasse) return; const nl = { ...layouts, [klasse]: n }; window.__wbc.commits.push({ klasse, layout: n }); window.__wbc.layouts = nl; localStorage.setItem(SLEUTEL, JSON.stringify(nl)); zet(nl); }}
                render={(e) => (
                  <div className={`tegel ${e.kind}`} data-qa-tegel={e.instanceId}>
                    <strong>{NAMEN[e.instanceId]}</strong>{e.kind === 'widget' ? <p>Жива панель</p> : <a href={`#${e.instanceId}`}>Відкрити</a>}
                  </div>
                )} />
            );
          })()}
        </div>
        <p style={{ height: q.has('lang-pagina') ? 1200 : 0 }} />
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><Stand /></StrictMode>);
