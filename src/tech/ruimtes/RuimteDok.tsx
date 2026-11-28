// Sneltoets en meldingen van de ruimtewissel (vlag tech-ruimtes-v2), op elk subdomein (TechLaag is een eigen root per pagina).
// 28.10.2026 (Pavlo): de zwevende strook onderaan in het midden («Звичайний п… | Технічний п…») is weg. De wissel staat nu onderaan
// in het zijmenu (src/tech/ruimtes/ZijbalkRuimte.tsx) en in het menu van de technische band. Hier blijven Ctrl+Alt+1/2 en de
// gesproken/zichtbare uitkomst (role=status) als compacte pil-capsule + duurzame registratie in het algemene meldingencentrum.
import { useEffect, useRef, useState } from 'react';
import { emitCanonicalNotice } from '../../canoniek-meldingen';
import { useRuimtes, uitlegWeg } from './ruimtes-opslag';
import { kiesRuimte } from './RuimteWissel';
import { sneltoetsRuimte } from './sneltoets';
import type { Taal } from './teksten';
import './ruimtes.css';

const UITLEG_DUUR_MS = 4000;

export default function RuimteDok({ taal }: { taal: Taal }) {
  const r = useRuimtes();
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const laatstGemeldeUitlegRef = useRef('');

  useEffect(() => {
    const op = (e: KeyboardEvent) => {
      const naar = sneltoetsRuimte(e);
      if (!naar) return;
      e.preventDefault(); e.stopPropagation();
      void kiesRuimte(naar, taal).then((u) => {
        const uitkomst = u ?? {
          ok: true,
          tekst: naar === 'technisch'
            ? (taal === 'uk' ? 'Ви вже в технічному просторі.' : 'U bent al in de technische ruimte.')
            : (taal === 'uk' ? 'Ви вже у звичайному просторі.' : 'U bent al in de gewone ruimte.'),
        };
        setMelding(uitkomst);
        emitCanonicalNotice({
          kind: uitkomst.ok ? 'info' : 'warning',
          source: 'tech-ruimte',
          text: uitkomst.tekst,
          retain: true,
          alleenPaneel: true,
          dedupeSeconds: 15,
        });
      });
    };
    window.addEventListener('keydown', op, true);
    return () => window.removeEventListener('keydown', op, true);
  }, [taal]);

  useEffect(() => {
    if (!melding) return;
    const i = window.setTimeout(() => setMelding(null), UITLEG_DUUR_MS);
    return () => window.clearTimeout(i);
  }, [melding]);

  // Розумне сповіщення про недоступність технічного простору: записується в історію загальної панелі сповіщень і автоматично зникає через 4 с.
  useEffect(() => {
    const tekst = String(r.uitleg || '').trim();
    if (!tekst) {
      laatstGemeldeUitlegRef.current = '';
      return;
    }
    if (laatstGemeldeUitlegRef.current !== tekst) {
      laatstGemeldeUitlegRef.current = tekst;
      emitCanonicalNotice({
        kind: 'warning',
        source: 'tech-ruimte',
        text: tekst,
        explain: taal === 'uk'
          ? 'Технічний сеанс завершився або призупинений. Ви можете продовжити роботу у звичайному просторі або знову відкрити технічний простір.'
          : 'De technische sessie is afgelopen of gepauzeerd. U kunt verder werken in de gewone ruimte of de technische ruimte opnieuw openen.',
        retain: true,
        alleenPaneel: true,
        dedupeSeconds: 30,
      });
    }
    const timer = window.setTimeout(() => uitlegWeg(), UITLEG_DUUR_MS);
    return () => window.clearTimeout(timer);
  }, [r.uitleg, taal]);

  const s = r.status;
  // Zonder technisch recht geen dok: gewone gebruikers zien niets nieuws.
  const uitleg = r.uitleg ? (
    <div className='rw-dok-melding is-fout' role='alert' data-ruimte-uitleg='1'>
      <i className='rw-dok-stip' aria-hidden='true' />
      <span className='rw-dok-tekst'>{r.uitleg}</span>
      <button type='button' className='rw-dok-sluit' onClick={uitlegWeg} aria-label={taal === 'uk' ? 'Закрити' : 'Sluiten'}>×</button>
    </div>
  ) : null;
  if (!s || !s.aan || !s.technischToegestaan) return uitleg;
  return (
    <>
      {uitleg}
      {melding ? (
        <div className={`rw-dok-melding${melding.ok ? ' is-ok' : ' is-fout'}`} role={melding.ok ? 'status' : 'alert'} data-ruimte-sneltoets-uitkomst='1'>
          <i className='rw-dok-stip' aria-hidden='true' />
          <span className='rw-dok-tekst'>{melding.tekst}</span>
        </div>
      ) : null}
    </>
  );
}

