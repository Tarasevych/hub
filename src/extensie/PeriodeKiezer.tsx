// EXTUI-001 (16.11.2026, зауваження Павла): строк доступу — не випадний список, а наочні плитки «число + одиниця»
// зі шкалою довжини, щоб вибір читався з першого погляду. Під плитками — коли саме доступ закриється.
// Termijn van de toegang: geen keuzelijst maar tegels «getal + eenheid» met een lengteschaal; eronder wanneer de toegang sluit.
// Справжні radio-кнопки (клавіатура стрілками, читач екрана); data-hulp на кожній, «?» стоїть у файлі виклику.
import type { ReactNode } from 'react';
import { CalendarClock, Check } from 'lucide-react';
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
};

export default function PeriodeKiezer({ naam, keuzes, waarde, disabled, onChange, hulp, kop, einde, uitleg, data }: PeriodeKiezerProps) {
  return (
    <fieldset className='pk' disabled={disabled} {...data}>
      <legend className='pk-kop'>{kop}</legend>
      <div className='pk-tegels' role='radiogroup'>
        {keuzes.map((k) => {
          const aan = k.waarde === waarde;
          return (
            <label key={k.waarde} className={`pk-tegel${aan ? ' is-aan' : ''}`} title={uitleg(k)} data-pk-waarde={k.waarde}>
              <input type='radio' name={naam} value={k.waarde} checked={aan} aria-label={k.naam}
                onChange={() => onChange(k.waarde)} data-hulp={hulp} />
              {aan ? <Check className='pk-vink' aria-hidden='true' /> : null}
              <b>{k.groot}</b>
              <small>{k.eenheid}</small>
              <span className='pk-schaal' aria-hidden='true'><i style={{ width: `${Math.round(Math.max(0.08, Math.min(1, k.schaal)) * 100)}%` }} /></span>
            </label>
          );
        })}
      </div>
      {einde ? <p className='pk-einde'><CalendarClock aria-hidden='true' /><span>{einde}</span></p> : null}
    </fieldset>
  );
}
