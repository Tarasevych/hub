// UI-010 fase 2 (vlag uitrol-weergave-v2): op «Огляд» alleen een korte samenvatting van recente problemen; de volledige lijst
// van onderbroken/mislukte pogingen staat in «Історія». Niets actueels → het blok verschijnt niet.
import { AlertTriangle, ChevronRight } from 'lucide-react';
import HulpVraag from '../hulp/HulpVraag';
import { etappeTekst, pogingOorzaak, type PogingUit } from '../../shared/uitrol-pogingen';
import { recenteProblemen } from './weergave-v2';
import { datum, tr, type Lang, type Run } from './types';

export default function ProblemenSamenvatting({ lang, pogingen, runs, actieveVersie, naarGeschiedenis }: { lang: Lang; pogingen: PogingUit[]; runs: Run[]; actieveVersie: string; naarGeschiedenis: (pogingId: string) => void }) {
  const p = recenteProblemen(pogingen, runs, actieveVersie);
  if (!p.length) return null;
  const laatste = p[0];
  const versies = new Set(p.map((x) => x.versie)).size;
  return <div className='ut-problemen' data-ut-problemen={p.length} role='status'>
    <AlertTriangle aria-hidden='true' />
    <span><b>{tr(lang, `Незавершених спроб за 7 днів: ${p.length}${versies > 1 ? ` (${versies} версії)` : ''}`, `Onvoltooide pogingen in 7 dagen: ${p.length}${versies > 1 ? ` (${versies} versies)` : ''}`)}</b>
      <small>{laatste.versie || '—'} · {etappeTekst(lang, laatste.etappe)} · {pogingOorzaak(lang, laatste.code, laatste.redenBekend).waarom} · {datum(lang, laatste.tijd)}</small></span>
    <HulpVraag k='uitrol.problemen' lang={lang} />
    <button type='button' className='ut-knop' onClick={() => naarGeschiedenis(laatste.id)}>{tr(lang, 'В історії', 'In geschiedenis')}<ChevronRight aria-hidden='true' /></button>
  </div>;
}
