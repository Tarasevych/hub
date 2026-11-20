// Спокійна картка порожнього стану (UPD-013): одне речення пояснення та одна головна кнопка дії (необов’язкова).
// Rustige kaart voor een lege toestand: één zin uitleg en optioneel één hoofdactie, tweetalig en toegankelijk.
import type { ReactNode } from 'react';
import './ux-bouwstenen.css';

export type LegeStaatActie = {
  label: string;
  onClick: () => void;
  icoon?: ReactNode;
  disabled?: boolean;
  testId?: string;
};

export type LegeStaatKaartProps = {
  /** Необов’язкова піктограма розділу. */
  icoon?: ReactNode;
  /** Короткий заголовок порожнього стану (необов’язковий). */
  titel?: string;
  /** Одне спокійне речення пояснення. */
  uitleg: string;
  /** Одна головна кнопка дії (необов’язкова). */
  actie?: LegeStaatActie;
  className?: string;
  /** Додаткові data-атрибути для збереження наявних позначок у тестах. */
  dataAttrs?: Record<string, string | undefined>;
  [sleutel: `data-${string}`]: string | undefined;
};

export function LegeStaatKaart({
  icoon,
  titel,
  uitleg,
  actie,
  className = '',
  dataAttrs,
  ...rest
}: LegeStaatKaartProps) {
  return (
    <section
      className={`tsv-lege-staat${className ? ` ${className}` : ''}`}
      role='status'
      aria-live='polite'
      {...dataAttrs}
      {...rest}
    >
      {icoon ? <span className='tsv-lege-staat-icoon' aria-hidden='true'>{icoon}</span> : null}
      {titel ? <h3 className='tsv-lege-staat-titel'>{titel}</h3> : null}
      <p className='tsv-lege-staat-uitleg'>{uitleg}</p>
      {actie ? (
        <div className='tsv-lege-staat-actie'>
          <button
            type='button'
            className='knop-primair'
            disabled={actie.disabled}
            data-testid={actie.testId}
            onClick={actie.onClick}
          >
            {actie.icoon ? <span aria-hidden='true'>{actie.icoon}</span> : null}
            <span>{actie.label}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default LegeStaatKaart;
