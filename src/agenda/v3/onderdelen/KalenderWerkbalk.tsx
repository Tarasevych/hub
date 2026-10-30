// Werkbalk: periode, vorige/volgende, «Сьогодні» en de vier weergaven als rustige segmentbalk.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { WEERGAVEN, weekDagen, type AgendaWeergave } from '../../../../shared/agenda-model';
import { fmt, tr, WEERGAVE_NAAM, type Lang } from '../tekst';

export function periodeTekst(lang: Lang, weergave: AgendaWeergave, datum: string): string {
  if (weergave === 'maand') { const t = fmt(lang, datum, { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); }
  if (weergave === 'dag') return fmt(lang, datum, { day: 'numeric', month: 'long', year: 'numeric' });
  const w = weekDagen(datum);
  return `${fmt(lang, w[0], { day: 'numeric', month: 'short' })} – ${fmt(lang, w[6], { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

type Props = { lang: Lang; weergave: AgendaWeergave; datum: string; onWeergave: (w: AgendaWeergave) => void; onStap: (r: number) => void; onVandaag: () => void };
export default function KalenderWerkbalk({ lang, weergave, datum, onWeergave, onStap, onVandaag }: Props) {
  return (
    <div className='agv-werkbalk'>
      <div className='agv-periode'>
        <h2 data-agenda-periode='1' aria-live='polite'>{weergave === 'lijst' ? tr(lang, 'Найближчі події', 'Aankomende afspraken') : periodeTekst(lang, weergave, datum)}</h2>
        {weergave !== 'lijst' ? (
          <span className='agv-pijlen'>
            <button type='button' className='agv-icoonknop' onClick={() => onStap(-1)} aria-label={tr(lang, 'Назад', 'Vorige')}><ChevronLeft aria-hidden='true' /></button>
            <button type='button' className='agv-icoonknop' onClick={() => onStap(1)} aria-label={tr(lang, 'Далі', 'Volgende')}><ChevronRight aria-hidden='true' /></button>
          </span>
        ) : null}
      </div>
      <div className='agv-werkbalk-rechts'>
        <button type='button' className='agv-knop' onClick={onVandaag} data-agenda-vandaag='1'>{tr(lang, 'Сьогодні', 'Vandaag')}</button>
        <div className='agv-segment' role='tablist' aria-label={tr(lang, 'Вигляд', 'Weergave')}>
          {WEERGAVEN.map((w) => (
            <button key={w} type='button' role='tab' aria-selected={weergave === w} data-agenda-weergave={w} onClick={() => onWeergave(w)}>
              {lang === 'uk' ? WEERGAVE_NAAM[w][0] : WEERGAVE_NAAM[w][1]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
