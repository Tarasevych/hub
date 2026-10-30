// Tweedelige wisselknop «Звичайний простір | Технічний простір» (vlag tech-ruimtes-v2). Wisselt IN PLAATS: geen herladen, getypte
// tekst en open vensters blijven; de band en html[data-tech] volgen via de gewone tech-status. Toetsenbord: ←/→ (of Home/End)
// wisselt, Tab gaat verder. Elke klik toont wat er gebeurt («Перемикаю…») en hoe het afliep (role=status).
import { useRef, useState, type KeyboardEvent } from 'react';
import { Home, Lock, ShieldCheck } from 'lucide-react';
import { openTechVenster } from '../tech-opslag';
import { RUIMTE_NAAM, standTekst, wisselFoutTekst, type Taal } from './teksten';
import { ruimtesToestand, useRuimtes, wissel } from './ruimtes-opslag';
import { SNELTOETS_TEKST } from './sneltoets';
import Vraag from '../Vraag';
import './ruimtes.css';

const HELP = {
  wat: ['Два простори одного акаунта. Технічний — це той самий звичайний простір (ті самі дані й розкладки) плюс технічні сторінки.', 'Twee ruimtes van één account. De technische is dezelfde gewone ruimte (zelfde gegevens en indeling) plus technische pagina\u2019s.'],
  gevolg: ['Перехід у звичайний простір ставить технічний сеанс на паузу; повернення — без повторного входу, доки діє термін. Швидкі клавіші: Ctrl+Alt+1 — звичайний, Ctrl+Alt+2 — технічний; набраний текст і відкриті вікна лишаються.', 'Naar de gewone ruimte gaan pauzeert de technische sessie; terugkeren kan zonder opnieuw aan te melden zolang de termijn loopt. Sneltoetsen: Ctrl+Alt+1 — gewone, Ctrl+Alt+2 — technische; getypte tekst en open vensters blijven.'],
} as const;

/** Eén plek voor klik én sneltoets (Ctrl+Alt+1/2). Geeft de uitkomst als tekst, of null als er niets te doen was. */
export async function kiesRuimte(naar: 'prive' | 'technisch', taal: Taal): Promise<{ ok: boolean; tekst: string } | null> {
  const r = ruimtesToestand(); const s = r.status; const uk = taal === 'uk';
  if (!s || !s.aan || naar === s.actief || r.bezig) return null;
  if (naar === 'technisch' && !s.technischToegestaan) return { ok: false, tekst: uk ? 'Немає дозволу на технічний простір. Його дає власник сервера.' : 'Geen toestemming voor de technische ruimte. De servereigenaar geeft die.' };
  if (naar === 'technisch' && !s.sessie) { openTechVenster('activeren'); return null; }
  try {
    await wissel(naar);
    return { ok: true, tekst: naar === 'technisch' ? (uk ? 'Готово: ви в технічному просторі.' : 'Klaar: u bent in de technische ruimte.') : (uk ? 'Готово: звичайний простір, технічний сеанс на паузі.' : 'Klaar: gewone ruimte, technische sessie gepauzeerd.') };
  } catch (e) { return { ok: false, tekst: wisselFoutTekst(e, taal) }; }
}

export default function RuimteWissel({ taal, compact = false }: { taal: Taal; compact?: boolean }) {
  const r = useRuimtes();
  const s = r.status;
  const [uitkomst, setUitkomst] = useState<{ ok: boolean; tekst: string } | null>(null);
  const refs = { prive: useRef<HTMLButtonElement | null>(null), technisch: useRef<HTMLButtonElement | null>(null) };
  if (!s || !s.aan) return null;
  const uk = taal === 'uk';
  const actief = s.actief;
  const geenRecht = !s.technischToegestaan;
  const kies = async (naar: 'prive' | 'technisch') => {
    setUitkomst(null);
    const u = await kiesRuimte(naar, taal);
    if (u) { setUitkomst(u); if (u.ok) refs[naar].current?.focus(); }
  };
  const toets = (e: KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowLeft', 'ArrowUp', 'Home'].includes(e.key)) { e.preventDefault(); refs.prive.current?.focus(); void kies('prive'); }
    else if (['ArrowRight', 'ArrowDown', 'End'].includes(e.key)) { e.preventDefault(); refs.technisch.current?.focus(); void kies('technisch'); }
  };
  const stand = standTekst(s, r.nu, taal);
  const redenGeen = uk ? 'Немає дозволу на технічний простір. Його дає власник сервера.' : 'Geen toestemming voor de technische ruimte. De servereigenaar geeft die.';
  return (
    <div className={`rw${compact ? ' rw-compact' : ''}`} data-ruimte-wissel={actief} data-ruimte-pauze={s.pauze ? '1' : '0'}>
      <div className='rw-seg' role='radiogroup' aria-label={uk ? 'Простір' : 'Ruimte'} onKeyDown={toets} aria-busy={r.bezig === 'wisselen' || undefined}>
        <button ref={refs.prive} type='button' role='radio' aria-checked={actief === 'prive'} tabIndex={actief === 'prive' ? 0 : -1} className='rw-knop rw-prive' data-ruimte='prive' title={`${RUIMTE_NAAM.prive[taal]} (${SNELTOETS_TEKST.prive})`} aria-keyshortcuts='Control+Alt+1' onClick={() => void kies('prive')}>
          <Home aria-hidden='true' /><span className='rw-naam'>{RUIMTE_NAAM.prive[taal]}</span>
        </button>
        <button ref={refs.technisch} type='button' role='radio' aria-checked={actief === 'technisch'} tabIndex={actief === 'technisch' ? 0 : -1} aria-disabled={geenRecht || undefined}
          title={geenRecht ? redenGeen : `${RUIMTE_NAAM.technisch[taal]} (${SNELTOETS_TEKST.technisch})`} aria-keyshortcuts='Control+Alt+2' className='rw-knop rw-tech' data-ruimte='technisch' onClick={() => void kies('technisch')}>
          {geenRecht ? <Lock aria-hidden='true' /> : <ShieldCheck aria-hidden='true' />}
          <span className='rw-naam'>{RUIMTE_NAAM.technisch[taal]}</span>
          <small className='rw-stand' data-ruimte-stand='1'>{r.bezig === 'wisselen' ? (uk ? 'перемикаю…' : 'wisselen…') : stand}</small>
        </button>
      </div>
      {!compact ? <Vraag help={HELP} uk={uk} label={uk ? 'Простори' : 'Ruimtes'} /> : null}
      {geenRecht && !compact ? <small className='rw-reden' data-ruimte-reden='1'>{redenGeen}</small> : null}
      {uitkomst ? <small className={`rw-uitkomst${uitkomst.ok ? ' is-ok' : ' is-fout'}`} role={uitkomst.ok ? 'status' : 'alert'} data-ruimte-uitkomst='1'>{uitkomst.tekst}</small> : null}
    </div>
  );
}
