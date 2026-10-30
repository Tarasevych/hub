// Keuze van de tijdzone voor terminal, stappen en historie (audit 18.10.2026, punt 8d). Eén plek, geldt voor de hele pagina.
import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { ZONES, opZone, tijdMetZone, zetZone, zoneKeuze, type ZoneKeuze } from './tijdzone';
import { tr, type Lang } from './types';
import HulpVraag from '../hulp/HulpVraag';

/** Herteken bij een andere zone (de datumfuncties lezen de keuze rechtstreeks). */
export function useZone(): ZoneKeuze {
  const [z, setZ] = useState<ZoneKeuze>(zoneKeuze());
  useEffect(() => opZone(setZ), []);
  return z;
}

export default function ZoneKiezer({ lang }: { lang: Lang }) {
  const z = useZone();
  const nu = new Date();
  return <section className='ut-kaart ut-zone' aria-labelledby='ut-zone-titel' data-ut-zone>
    <header className='ut-kaart-kop'><div>
      <h2 id='ut-zone-titel'><Clock aria-hidden='true' /> {tr(lang, 'Часова зона', 'Tijdzone')} <HulpVraag k='uitrol.zone' lang={lang} /></h2>
      <p className='ut-sub'>{tr(lang, 'Однаково для терміналу, кроків та історії. Сервер пише час у UTC; тут його перераховано в обрану зону.', 'Gelijk voor terminal, stappen en historie. De server schrijft UTC; hier omgerekend naar de gekozen zone.')}</p>
    </div></header>
    <div className='ut-zone-keuzes' role='radiogroup' aria-label={tr(lang, 'Часова зона', 'Tijdzone')}>
      {ZONES.map((o) => <label key={o.id} className='ut-zone-keuze' data-actief={z === o.id || undefined}>
        <input data-hulp='uitrol.zone' type='radio' name='ut-zone' value={o.id} checked={z === o.id} onChange={() => zetZone(o.id)} />
        <span>{tr(lang, o.uk, o.nl)}</span><small>{tijdMetZone(nu, o.id, lang)}</small>
      </label>)}
    </div>
  </section>;
}
