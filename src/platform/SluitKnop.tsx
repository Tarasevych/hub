// Gedeelde sluitknop (kruisje): één grootte, gecentreerd, met aria-label in uk/nl. Stijl: sluitknop.css (ook globaal geladen via main.tsx).
import { X } from 'lucide-react';
import './sluitknop.css';
import { routeLang } from '../canoniek-navigatie';

type Props = { onClick: () => void; label?: string; disabled?: boolean; klein?: boolean; rond?: boolean; className?: string; autoFocus?: boolean };

export function SluitKnop({ onClick, label, disabled, klein, rond, className = '', autoFocus }: Props) {
  const tekst = label || (routeLang() === 'nl' ? 'Sluiten' : 'Закрити');
  return (
    <button type='button' className={`sluitknop${klein ? ' is-klein' : ''}${rond ? ' is-rond' : ''}${className ? ` ${className}` : ''}`} onClick={onClick} disabled={disabled} aria-label={tekst} title={tekst} autoFocus={autoFocus} data-sluitknop='1'>
      <X aria-hidden='true' />
    </button>
  );
}
export default SluitKnop;
