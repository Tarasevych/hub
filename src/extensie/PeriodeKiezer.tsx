// EXTUI-001 (16.11.2026, зауваження Павла): строк доступу — не випадний список, а наочні плитки «число + одиниця»
// зі шкалою довжини, щоб вибір читався з першого погляду. Під плитками — коли саме доступ закриється.
// Termijn van de toegang: geen keuzelijst maar tegels «getal + eenheid» met een lengteschaal; eronder wanneer de toegang sluit.
// Справжні radio-кнопки (клавіатура стрілками, читач екрана); data-hulp на кожній, «?» стоїть у файлі виклику.
import { useState, type ReactNode } from 'react';
import { CalendarClock, CalendarDays, Check } from 'lucide-react';
import DatumKiezer from './DatumKiezer';
import './periode-kiezer.css';

import type { PeriodeKeuze } from './periode-keuzes';
export { dagKeuzes, minuutKeuzes, type PeriodeKeuze } from './periode-keuzes';

export type PeriodeKiezerProps = {
  naam: string;
  keuzes: readonly PeriodeKeuze[];
  waarde: number;
  disabled?: boolean;
  onChange: (waarde: number) => void;
  hulp: string;
  /** Підпис групи разом із «?» (HulpVraag) — передає файл виклику. */
  kop: ReactNode;
  /** Рядок «діятиме до …» під плитками. */
  einde?: ReactNode;
  /** Підказка для кожної плитки: наслідки вибору (не повтор назви). */
  uitleg: (k: PeriodeKeuze) => string;
  data?: Record<string, string>;
  /** «До дати»: власний момент закриття з календаря (мс, годинник браузера). Без цього плитки «До дати» немає. */
  kalender?: { uk: boolean; min: number; max: number; tot: number | null; onTot: (ms: number | null) => void; uitleg: string };
};

export default function PeriodeKiezer({ naam, keuzes, waarde, disabled, onChange, hulp, kop, einde, uitleg, data, kalender }: PeriodeKiezerProps) {
  const [open, setOpen] = useState(false);
  const tot = kalender?.tot ?? null;
  const taal = kalender?.uk === false ? 'nl-NL' : 'uk-UA';
  return (
    <fieldset className='pk' disabled={disabled} {...data}>
      <legend className='pk-kop'>{kop}</legend>
      <div className='pk-tegels' role='radiogroup'>
        {keuzes.map((k) => {
          const aan = tot === null && k.waarde === waarde;
          return (
            <label key={k.waarde} className={`pk-tegel${aan ? ' is-aan' : ''}`} title={uitleg(k)} data-pk-waarde={k.waarde}>
              <input type='radio' name={naam} value={k.waarde} checked={aan} aria-label={k.naam}
                onChange={() => { kalender?.onTot(null); setOpen(false); onChange(k.waarde); }} data-hulp={hulp} />
              {aan ? <Check className='pk-vink' aria-hidden='true' /> : null}
              <b>{k.groot}</b>
              <small>{k.eenheid}</small>
              <span className='pk-schaal' aria-hidden='true'><i style={{ width: `${Math.round(Math.max(0.08, Math.min(1, k.schaal)) * 100)}%` }} /></span>
            </label>
          );
        })}
        {kalender ? (
          <label className={`pk-tegel is-datum${tot !== null ? ' is-aan' : ''}`} title={kalender.uitleg} data-pk-datum='1'>
            <input type='radio' name={naam} value='datum' checked={tot !== null} aria-label={kalender.uk ? 'До дати: відкрити календар' : 'Tot datum: kalender openen'}
              onChange={() => setOpen(true)} onClick={() => setOpen(true)} aria-expanded={open} data-hulp={hulp} />
            {tot !== null ? <Check className='pk-vink' aria-hidden='true' /> : null}
            <CalendarDays className='pk-kalender' aria-hidden='true' />
            <small>{tot !== null ? new Date(tot).toLocaleDateString(taal, { day: 'numeric', month: 'short', year: new Date(tot).getFullYear() !== new Date().getFullYear() ? '2-digit' : undefined }) : (kalender.uk ? 'до дати' : 'tot datum')}</small>
          </label>
        ) : null}
      </div>
      {kalender && open ? (
        <DatumKiezer uk={kalender.uk} min={kalender.min} max={kalender.max} waarde={tot}
          onKies={(ms) => { kalender.onTot(ms); setOpen(false); }} onSluit={() => setOpen(false)} />
      ) : null}
      {einde ? <p className='pk-einde'><CalendarClock aria-hidden='true' /><span>{einde}</span></p> : null}
    </fieldset>
  );
}
