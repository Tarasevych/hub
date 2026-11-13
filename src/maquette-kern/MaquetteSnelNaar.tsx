// Вікно швидкого переходу за розділами піддомену системи «Макет» (MAQUETTE-001).
// Підтримує миттєве фільтрування, клавіатурну навігацію стрілками та виклик загальносайтового пошуку.
// Venster voor snelle sprong naar onderdelen van het subdomein met toetsenbordnavigatie.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';

export interface MaquetteSnelNaarItem {
  id: string;
  label: string;
  beschrijving?: string;
  groep?: string;
  badge?: string | number;
}

export interface MaquetteSnelNaarProps {
  open: boolean;
  onSluit: () => void;
  lang: 'uk' | 'nl';
  titel?: string;
  placeholder?: string;
  items: ReadonlyArray<MaquetteSnelNaarItem>;
  onKies: (id: string) => void;
  toonGlobaalZoeken?: boolean;
}

const SNEL_NAAR_TEKSTEN = {
  uk: {
    dialoogAria: 'Швидкий перехід за розділами',
    standaardRubriek: 'РОЗДІЛИ СТОРІНКИ',
    standaardPlaceholder: 'Знайти розділ на цій сторінці…',
    leeg: 'За цим запитом розділів не знайдено.',
    voetHint: '↑ ↓ обрати · ↵ перейти',
    globaalKnop: 'Пошук по всьому простору ↗',
    sluittoets: 'Закрити',
  },
  nl: {
    dialoogAria: 'Snel naar onderdeel',
    standaardRubriek: 'ONDERDELEN OP DEZE PAGINA',
    standaardPlaceholder: 'Zoek een onderdeel op deze pagina…',
    leeg: 'Geen onderdelen gevonden voor deze zoekopdracht.',
    voetHint: '↑ ↓ kiezen · ↵ ga naar',
    globaalKnop: 'Zoeken in heel Mijn Ruimte ↗',
    sluittoets: 'Sluiten',
  },
} as const;

export function MaquetteSnelNaar({
  open,
  onSluit,
  lang,
  titel,
  placeholder,
  items,
  onKies,
  toonGlobaalZoeken = true,
}: MaquetteSnelNaarProps) {
  const taal = lang === 'nl' ? 'nl' : 'uk';
  const t = SNEL_NAAR_TEKSTEN[taal];

  const [zoekterm, setZoekterm] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const invoerRef = useRef<HTMLInputElement>(null);

  const gefilterd = useMemo(() => {
    const q = zoekterm.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const bundel = [item.label, item.beschrijving ?? '', item.groep ?? '']
        .join(' ')
        .toLowerCase();
      return bundel.includes(q);
    });
  }, [items, zoekterm]);

  useEffect(() => {
    if (!open) return;
    setZoekterm('');
    setFocusIndex(0);
    const id = window.requestAnimationFrame(() => {
      invoerRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setFocusIndex(0);
  }, [zoekterm]);

  if (!open) return null;

  const veiligIndex =
    gefilterd.length === 0 ? -1 : Math.min(focusIndex, gefilterd.length - 1);

  const behandelToets = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onSluit();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (gefilterd.length > 0) {
        setFocusIndex((oud) => (oud + 1) % gefilterd.length);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (gefilterd.length > 0) {
        setFocusIndex((oud) => (oud - 1 + gefilterd.length) % gefilterd.length);
      }
      return;
    }
    if (e.key === 'Enter' && veiligIndex >= 0 && gefilterd[veiligIndex]) {
      e.preventDefault();
      const gekozen = gefilterd[veiligIndex];
      onKies(gekozen.id);
      onSluit();
    }
  };

  const bijAchtergrondKlik = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onSluit();
    }
  };

  const openGlobaalZoeken = () => {
    onSluit();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tsv:zoek-palet'));
    }
  };

  const inhoud = (
    <div
      className="mq-snel-naar-laag mq-snel-naar"
      onClick={bijAchtergrondKlik}
      onKeyDown={behandelToets}
    >
      <div
        className="mq-snel-naar-venster"
        role="dialog"
        aria-modal="true"
        aria-label={titel || t.dialoogAria}
      >
        <div className="mq-snel-naar-invoerrij">
          <span aria-hidden="true">⌕</span>
          <input
            ref={invoerRef}
            type="text"
            className="mq-snel-naar-veld"
            value={zoekterm}
            placeholder={placeholder || t.standaardPlaceholder}
            aria-label={placeholder || t.standaardPlaceholder}
            onChange={(e) => setZoekterm(e.target.value)}
          />
          <kbd aria-label={t.sluittoets}>Esc</kbd>
        </div>

        <p className="mq-snel-naar-rubriek">{titel || t.standaardRubriek}</p>

        <div className="mq-snel-naar-lijst" role="listbox">
          {gefilterd.length === 0 ? (
            <p className="mq-snel-naar-leeg">{t.leeg}</p>
          ) : (
            gefilterd.map((item, idx) => {
              const isFocus = idx === veiligIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isFocus}
                  className={`mq-snel-naar-optie${isFocus ? ' is-gefocust' : ''}`}
                  onMouseEnter={() => setFocusIndex(idx)}
                  onClick={() => {
                    onKies(item.id);
                    onSluit();
                  }}
                >
                  <span className="mq-snel-naar-optie-tekst">
                    <strong>{item.label}</strong>
                    {item.beschrijving || item.groep ? (
                      <small>{item.beschrijving || item.groep}</small>
                    ) : null}
                  </span>
                  {item.badge !== undefined && item.badge !== '' ? (
                    <span className="mq-anker-badge">{item.badge}</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className="mq-snel-naar-voet">
          <span>{t.voetHint}</span>
          {toonGlobaalZoeken ? (
            <button
              type="button"
              className="mq-snel-naar-globaal"
              onClick={openGlobaalZoeken}
            >
              {t.globaalKnop}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(inhoud, document.body) : inhoud;
}
