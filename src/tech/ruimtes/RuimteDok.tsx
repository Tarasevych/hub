// Sneltoets en meldingen van de ruimtewissel (vlag tech-ruimtes-v2), op elk subdomein (TechLaag is een eigen root per pagina).
// 28.10.2026 (Pavlo): de zwevende strook onderaan in het midden («Звичайний п… | Технічний п…») is weg. De wissel staat nu onderaan
// in het zijmenu (src/tech/ruimtes/ZijbalkRuimte.tsx) en in het menu van de technische band. Hier blijven Ctrl+Alt+1/2 en de
// gesproken/zichtbare uitkomst (role=status).
import { useEffect, useState } from 'react';
import { useRuimtes, uitlegWeg } from './ruimtes-opslag';
import { kiesRuimte } from './RuimteWissel';
import { sneltoetsRuimte } from './sneltoets';
import type { Taal } from './teksten';
import './ruimtes.css';

export default function RuimteDok({ taal }: { taal: Taal }) {
  const r = useRuimtes();
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  useEffect(() => {
    const op = (e: KeyboardEvent) => {
      const naar = sneltoetsRuimte(e);
      if (!naar) return;
      e.preventDefault(); e.stopPropagation();
      void kiesRuimte(naar, taal).then((u) => setMelding(u ?? { ok: true, tekst: naar === 'technisch' ? (taal === 'uk' ? 'Ви вже в технічному просторі.' : 'U bent al in de technische ruimte.') : (taal === 'uk' ? 'Ви вже у звичайному просторі.' : 'U bent al in de gewone ruimte.') }));
    };
    window.addEventListener('keydown', op, true);
    return () => window.removeEventListener('keydown', op, true);
  }, [taal]);
  useEffect(() => { if (!melding) return; const i = window.setTimeout(() => setMelding(null), 4000); return () => window.clearTimeout(i); }, [melding]);
  const s = r.status;
  // Zonder technisch recht geen dok: gewone gebruikers zien niets nieuws.
  const uitleg = r.uitleg ? <div className='rw-dok-melding is-fout' role='alert' data-ruimte-uitleg='1'>{r.uitleg} <button type='button' className='rw-dok-sluit' onClick={uitlegWeg} aria-label={taal === 'uk' ? 'Закрити' : 'Sluiten'}>×</button></div> : null;
  if (!s || !s.aan || !s.technischToegestaan) return uitleg;
  return (
    <>
      {uitleg}
      {melding ? <div className={`rw-dok-melding${melding.ok ? ' is-ok' : ' is-fout'}`} role={melding.ok ? 'status' : 'alert'} data-ruimte-sneltoets-uitkomst='1'>{melding.tekst}</div> : null}
    </>
  );
}
