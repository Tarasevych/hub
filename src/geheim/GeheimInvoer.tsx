import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import SchermToetsenbord from './SchermToetsenbord';

type Props = {
  lang?: 'uk' | 'nl';
  /** Якщо мови як пропа немає (лише tr). */
  t?: (uk: string, nl: string) => string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
  id?: string;
  name?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  minLength?: number;
  spellCheck?: boolean;
  max?: number;
  style?: CSSProperties;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  /** data-geheim-invoer. Типово кодове слово. */
  soort?: string;
  /** Додаткові data-атрибути, які вже шукають тести (наприклад mail-koppel-wachtwoord). */
  data?: Record<string, string>;
  /** Кілька рядків (PEM, ключ SSH). Тоді це textarea, не password-input. */
  rijen?: number;
  /** Для textarea: ховати символи. Для PEM лишаємо видимим. */
  verborgen?: boolean;
};

/**
 * Секретне поле + кнопка екранної клавіатури (4.4).
 * Клавіатура пише в value сама. Клавіші не є полями, які ШІ-розширення може «натиснути».
 */
export default function GeheimInvoer({ lang, t, value, onChange, placeholder, children, id, name, autoComplete = 'off', autoFocus, required, minLength, spellCheck, max = 200, style, ariaLabelledBy, ariaDescribedBy, soort = 'codewoord', data, rijen, verborgen = false }: Props) {
  const zeg = t || ((uk: string, nl: string) => ((lang || 'uk') === 'uk' ? uk : nl));
  const [open, setOpen] = useState(false);
  const veld = useRef<HTMLInputElement | null>(null);
  const grens = Math.max(1, rijen ? Math.max(max, 16384) : max);
  const zet = (volgende: string) => onChange(volgende.slice(0, grens));
  const extra = Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k.startsWith('data-') ? k : `data-${k}`, v]));
  const gemeen = { id, name, value, autoComplete, autoFocus, required, minLength, spellCheck, placeholder, 'aria-labelledby': ariaLabelledBy, 'aria-describedby': ariaDescribedBy, 'data-geheim-invoer': soort, ...extra, onChange: (e: { target: { value: string } }) => zet(e.target.value) };
  return (
    <span className='geheim-invoer' style={{ position: 'relative', display: 'block' }}>
      {children}
      <span style={{ display: 'flex', gap: 6, alignItems: rijen ? 'flex-start' : 'center' }}>
        {rijen ? (
          <textarea {...gemeen} rows={rijen} className={verborgen ? 'geheim-invoer-verborgen' : undefined} style={{ flex: 1, ...style }} />
        ) : (
          <input {...gemeen} ref={veld} type='password' style={{ flex: 1, ...style }} />
        )}
        <button type='button' data-scherm-toetsenbord='1' aria-expanded={open} aria-label={zeg('Екранна клавіатура', 'Schermtoetsenbord')} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)}>
          {zeg('АБВ', 'ABC')}
        </button>
      </span>
      {open && <SchermToetsenbord lang={lang === 'nl' ? 'nl' : 'uk'} onTeken={(extraTeken) => zet(`${value}${extraTeken}`)} onWis={() => zet(value.slice(0, -1))} />}
    </span>
  );
}
