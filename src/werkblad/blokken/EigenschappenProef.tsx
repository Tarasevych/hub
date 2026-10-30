// Werkblad «Blokken» — proefopstelling van het eigenschappenpaneel met een nep-toestand (geen server).
// Alleen voor de lokale browsercontrole (scripts/werkblad-blokken-paneel-proef.mjs); wordt niet in de app geladen.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MAAT_AUTO, STANDAARD_INDELING, type Blok, type Onderdeel } from '../../../shared/werkblad-blokken';
import { EigenschappenPaneel, useBlokkenBewerker } from './EigenschappenPaneel';

const NAMEN: Record<string, string> = { 'svc:mail': 'Пошта', 'svc:agenda': 'Календар', 'svc:taken': 'Завдання', 'svc:github': 'GitHub', 'svc:notities': 'Нотатки' };
const od = (id: string, v: number): Onderdeel => ({ id, soort: 'onderdeel', itemId: `svc:${id}`, afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: v });
const BEGIN: Blok = { id: 'snel', soort: 'blok', titel: 'Швидкий доступ', afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0, indeling: { ...STANDAARD_INDELING },
  kinderen: [od('mail', 0), od('agenda', 1), od('taken', 2), od('github', 3), od('notities', 4)] };

declare global { interface Window { __proef: { bewaard: Blok[]; faal: boolean } } }
window.__proef = { bewaard: [], faal: false };

function Proef() {
  const [sel, zetSel] = useState<string | null>('snel');
  const [overlap, zetOverlap] = useState(false);
  const b = useBlokkenBewerker(BEGIN, async (w) => {
    await new Promise((r) => setTimeout(r, 150));
    if (window.__proef.faal) throw new Error('мережа недоступна');
    window.__proef.bewaard.push(w);
  }, 'uk', 100);
  return (
    <div style={{ padding: 16 }}>
      <div className="proef-lijst" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" data-kies="snel" onClick={() => zetSel('snel')}>Блок</button>
        {b.wortel.kinderen.map((k) => <button key={k.id} type="button" data-kies={k.id} onClick={() => zetSel(k.id)}>{k.soort === 'onderdeel' ? NAMEN[k.itemId] : k.id}</button>)}
      </div>
      <pre data-staat="" style={{ fontSize: 10, maxWidth: 600, whiteSpace: 'pre-wrap', opacity: .6 }}>{JSON.stringify(b.wortel.indeling)}</pre>
      <EigenschappenPaneel {...b.paneelProps} geselecteerd={sel} naamVan={(i) => NAMEN[i] ?? i}
        overlapToegestaan={overlap} onOverlap={zetOverlap} onSluiten={() => zetSel(null)} />
    </div>
  );
}
createRoot(document.getElementById('wortel')!).render(<Proef />);
