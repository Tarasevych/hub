// Kop van ai.* en mcp.*: in welke RICHTING werkt deze dienst (met «?» en een verwijzing naar de andere), en de schakelaar
// «Простий / Розширений» (alleen op mcp.*). Plus de melding als iemand via een link een onderdeel opent dat alleen in «розширений» staat.
import { useState } from 'react';
import { ArrowRight, ArrowLeftRight } from 'lucide-react';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import Vraag from '../tech/Vraag';
import { HELP_MODUS, MODI, MODUS_NAAM, RICHTING, type Modus, type Richting } from '../../shared/weergave';
import { modusKiezen, useWeergave } from './weergave-opslag';
import './weergave.css';

export function RichtingBand({ richting, uk, metModus = false }: { richting: Richting; uk: boolean; metModus?: boolean }) {
  const r = RICHTING[richting];
  const tx = (p: readonly [string, string]) => (uk ? p[0] : p[1]);
  const ander = RICHTING[r.ander];
  const naar = r.ander === 'mcp' ? canonicalNavigationUrl('mcp', 'overview', uk ? 'uk' : 'nl') : canonicalNavigationUrl('ai', 'workspace', uk ? 'uk' : 'nl');
  return (
    <section className={`weergave-richting is-${richting}`} aria-label={uk ? 'Напрямок цього сервісу' : 'Richting van deze dienst'} data-richting={richting}>
      <div className='weergave-richting-kop'>
        <span className='weergave-richting-naam'>{tx(r.naam)}</span>
        <Vraag help={r.help} uk={uk} label={tx(r.naam)} />
        {metModus ? <ModusSchakelaar uk={uk} /> : null}
      </div>
      <ol className='weergave-pijl' aria-label={uk ? 'Хто до кого звертається' : 'Wie spreekt wie aan'}>
        {r.pijl.map((stap, i) => (
          <li key={i}>{i > 0 ? <ArrowRight aria-hidden='true' /> : null}<span>{tx(stap)}</span></li>
        ))}
      </ol>
      <p className='weergave-richting-kort'>{tx(r.kort)}</p>
      <p className='weergave-richting-ander'>
        <ArrowLeftRight aria-hidden='true' />
        <span>{tx(r.anderVraag)} </span>
        <a href={naar} data-richting-ander={r.ander}>{uk ? `Перейти: ${ander.naam[0]}` : `Naar: ${ander.naam[1]}`}</a>
      </p>
    </section>
  );
}

export function ModusSchakelaar({ uk }: { uk: boolean }) {
  const w = useWeergave();
  const [fout, setFout] = useState('');
  const huidig: Modus = w.modus ?? 'expert';
  return (
    <span className='weergave-modus'>
      <span className='weergave-modus-groep' role='radiogroup' aria-label={uk ? 'Режим показу' : 'Weergavemodus'}>
        {MODI.map((m) => (
          <button key={m} type='button' role='radio' aria-checked={huidig === m} data-modus={m}
            onClick={() => { if (m !== huidig) { setFout(''); modusKiezen(m).catch(() => setFout(uk ? 'Не вдалося зберегти режим.' : 'Modus niet opgeslagen.')); } }}>
            {uk ? MODUS_NAAM[m][0] : MODUS_NAAM[m][1]}
          </button>
        ))}
      </span>
      <Vraag help={HELP_MODUS} uk={uk} label={uk ? 'Режим показу' : 'Weergavemodus'} />
      {fout ? <span className='weergave-fout' role='alert'>{fout}</span> : null}
    </span>
  );
}

/** Onderdeel dat alleen in «розширений» in het menu staat, maar via een link geopend werd: uitleggen + één klik om te tonen. */
export function ExpertMelding({ uk }: { uk: boolean }) {
  return (
    <section className='weergave-expert' role='status' data-weergave-expert='1'>
      <p><b>{uk ? 'Цей розділ — для розширеного режиму.' : 'Dit onderdeel hoort bij de uitgebreide modus.'}</b>{' '}
        {uk ? 'Зараз увімкнено «Простий»: показуємо лише основне. Права від режиму не залежать.' : 'Nu staat «Eenvoudig» aan: alleen de basis. Rechten hangen niet af van de modus.'}</p>
      <button type='button' onClick={() => void modusKiezen('expert').catch(() => undefined)} data-modus-naar='expert'>{uk ? 'Показати розширений режим' : 'Uitgebreide modus tonen'}</button>
    </section>
  );
}
