// Легкий скелетний заповнювач (UPD-013): прогнозована висота карток/рядків без стрибків макета, aria-busy="true",
// двомовний aria-label і повторне використання наявного класу .tsv-skelet із src/canoniek-omlijsting.css.
// Lichte skeletopvulling met voorspelbare hoogte, zonder layoutsprongen en met tweetalig aria-label.
import type { CSSProperties } from 'react';
import './ux-bouwstenen.css';

export type SkeletVariant = 'lijst' | 'kaarten' | 'compact';

export type SkeletBlokProps = {
  lang: 'uk' | 'nl';
  /** Кількість рядків або карток заповнювача. */
  aantal?: number;
  /** Спосіб розташування: список, сітка карток або стислий перелік. */
  variant?: SkeletVariant;
  /** Прогнозована мінімальна висота одного елемента у пікселях. */
  hoogte?: number;
  /** Додатковий опис для читачів екрана (інакше типовий двомовний). */
  label?: string;
  className?: string;
  /** Додаткові data-атрибути для збереження сумісності з наявними перевірками. */
  dataAttrs?: Record<string, string | undefined>;
};

export function SkeletBlok({
  lang,
  aantal = 3,
  variant = 'lijst',
  hoogte,
  label,
  className = '',
  dataAttrs,
}: SkeletBlokProps) {
  const uk = lang === 'uk';
  const ariaLabel = label || (uk ? 'Завантаження вмісту…' : 'Inhoud wordt geladen…');
  const minHoogte = hoogte ?? (variant === 'kaarten' ? 112 : variant === 'compact' ? 40 : 62);
  const kaartStijl: CSSProperties = { minHeight: `${minHoogte}px` };
  const items = Array.from({ length: Math.max(1, aantal) }, (_, i) => i);

  return (
    <div
      className={`tsv-skelet-blok is-${variant}${className ? ` ${className}` : ''}`}
      role='status'
      aria-busy='true'
      aria-live='polite'
      aria-label={ariaLabel}
      {...dataAttrs}
    >
      <span className='sr-only'>{ariaLabel}</span>
      {items.map((idx) => (
        <div key={idx} className='tsv-skelet-kaart' style={kaartStijl} aria-hidden='true'>
          <span className='tsv-skelet tsv-skelet-lijn is-kop' />
          {variant !== 'compact' ? <span className='tsv-skelet tsv-skelet-lijn' /> : null}
          {variant === 'kaarten' ? <span className='tsv-skelet tsv-skelet-lijn is-kort' /> : null}
        </div>
      ))}
    </div>
  );
}

export default SkeletBlok;
