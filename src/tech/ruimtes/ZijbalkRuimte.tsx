// Ruimtewissel onderaan in het zijmenu (28.10.2026, op verzoek van Pavlo; vervangt de zwevende strook onderaan in het midden).
// Uitgeklapt menu (en de menulade op de telefoon): twee compacte knoppen «Звичайний» / «Технічний» met volledige namen, de actieve met
// de accentkleur. Ingeklapt menu: twee kleine ronde pictogrammen. Zelfde logica als de band en Ctrl+Alt+1/2 (kiesRuimte): wisselen
// zonder opnieuw aan te melden zolang de technische termijn loopt. Alleen zichtbaar met vlag tech-ruimtes-v2 en technisch recht.
import { useEffect, useState } from 'react';
import { Home, ShieldCheck } from 'lucide-react';
import { startRuimtes, useRuimtes } from './ruimtes-opslag';
import { kiesRuimte } from './RuimteWissel';
import { SNELTOETS_TEKST } from './sneltoets';
import './zijbalk-ruimte.css';

export default function ZijbalkRuimte({ lang, breed }: { lang: 'uk' | 'nl'; breed: boolean }) {
  const r = useRuimtes();
  const [uitkomst, setUitkomst] = useState<{ ok: boolean; tekst: string } | null>(null);
  useEffect(() => { startRuimtes(); }, []);
  useEffect(() => { if (!uitkomst) return; const i = window.setTimeout(() => setUitkomst(null), 3500); return () => window.clearTimeout(i); }, [uitkomst]);
  const s = r.status;
  if (!s || !s.aan || !s.technischToegestaan) return null;
  const uk = lang === 'uk';
  const kies = async (naar: 'prive' | 'technisch') => { setUitkomst(null); const u = await kiesRuimte(naar, lang); if (u) setUitkomst(u); };
  const knop = (id: 'prive' | 'technisch') => {
    const naam = id === 'prive' ? (uk ? 'Звичайний' : 'Gewoon') : (uk ? 'Технічний' : 'Technisch');
    const actief = s.actief === id;
    return (
      <button key={id} type='button' role='radio' aria-checked={actief} className={`zr-knop is-${id}`} onClick={() => void kies(id)}
        aria-label={breed ? undefined : naam} title={`${naam} (${SNELTOETS_TEKST[id]})`} aria-keyshortcuts={id === 'prive' ? 'Control+Alt+1' : 'Control+Alt+2'} data-zijbalk-ruimte={id}>
        {id === 'prive' ? <Home aria-hidden='true' /> : <ShieldCheck aria-hidden='true' />}{breed ? <span>{naam}</span> : null}
      </button>
    );
  };
  return (
    <div className={`zr${breed ? ' is-breed' : ' is-smal'}`} data-zijbalk-ruimtes={s.actief} aria-busy={r.bezig === 'wisselen' || undefined}>
      <div className='zr-seg' role='radiogroup' aria-label={uk ? 'Простір' : 'Ruimte'}>{knop('prive')}{knop('technisch')}</div>
      {uitkomst && breed ? <small className={`zr-uitkomst${uitkomst.ok ? '' : ' is-fout'}`} role={uitkomst.ok ? 'status' : 'alert'}>{uitkomst.tekst}</small> : null}
    </div>
  );
}
