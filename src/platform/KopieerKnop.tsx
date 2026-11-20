// Компактна кнопка копіювання в 1 натискання (UPD-013): миттєвий стан «Скопійовано ✓» / «Gekopieerd ✓» на 2 с,
// безпечний резерв через kopieerTekst (src/platform/klembord.ts), жива область aria-live="polite" і сенсорна зона ≥ 36–44 px.
// Compacte kopieerknop in één klik met directe terugkoppeling «Gekopieerd ✓» gedurende 2 s en veilige reserveweg.
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, AlertCircle } from 'lucide-react';
import { KOPIEER_MISLUKT, kopieerTekst } from './klembord';
import './ux-bouwstenen.css';

export type KopieerKnopProps = {
  /** Текст, який потрібно скопіювати в буфер обміну. */
  tekst: string;
  lang: 'uk' | 'nl';
  /** Власний напис на кнопці (типово «Копіювати» / «Kopiëren»). */
  label?: string;
  /** Власний опис для читачів екрана. */
  ariaLabel?: string;
  /** Компактний вигляд для рядків із довгими адресами чи ідентифікаторами. */
  compact?: boolean;
  className?: string;
  testId?: string;
};

type Stand = 'rust' | 'ok' | 'fout';

export function KopieerKnop({
  tekst,
  lang,
  label,
  ariaLabel,
  compact = false,
  className = '',
  testId,
}: KopieerKnopProps) {
  const uk = lang === 'uk';
  const [stand, setStand] = useState<Stand>('rust');
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const standaardLabel = label || (uk ? 'Копіювати' : 'Kopiëren');
  const okTekst = uk ? 'Скопійовано ✓' : 'Gekopieerd ✓';
  const foutTekst = uk ? KOPIEER_MISLUKT[0] : KOPIEER_MISLUKT[1];
  const foutKort = uk ? 'Не скопійовано' : 'Niet gekopieerd';

  const klik = async () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const gelukt = await kopieerTekst(tekst);
    setStand(gelukt ? 'ok' : 'fout');
    timerRef.current = window.setTimeout(() => {
      setStand('rust');
      timerRef.current = null;
    }, 2000);
  };

  const zichtbaarTekst = stand === 'ok' ? okTekst : stand === 'fout' ? foutKort : standaardLabel;
  const melding = stand === 'ok' ? okTekst : stand === 'fout' ? foutTekst : '';

  return (
    <span className='tsv-kopieer-wikkel'>
      <button
        type='button'
        className={`tsv-kopieer-knop${compact ? ' is-compact' : ''}${stand === 'ok' ? ' is-ok' : stand === 'fout' ? ' is-fout' : ''}${className ? ` ${className}` : ''}`}
        aria-label={ariaLabel || standaardLabel}
        title={stand === 'fout' ? foutTekst : ariaLabel || standaardLabel}
        data-testid={testId}
        data-kopieer-stand={stand}
        onClick={() => void klik()}
      >
        {stand === 'ok' ? <Check aria-hidden='true' /> : stand === 'fout' ? <AlertCircle aria-hidden='true' /> : <Copy aria-hidden='true' />}
        <span>{zichtbaarTekst}</span>
      </button>
      <span className='sr-only' role='status' aria-live='polite'>{melding}</span>
    </span>
  );
}

export default KopieerKnop;
