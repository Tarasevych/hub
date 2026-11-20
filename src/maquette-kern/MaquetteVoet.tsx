// Студійний підвал системи «Макет» (MAQUETTE-001) із монограмою M·R та кнопкою плавного повернення догори.
// Studio-voetregel met het M·R-monogram en een knop om vloeiend naar boven te keren.

import { useIsKlassiekMaquette } from './klassiek-hulp';

export interface MaquetteVoetProps {
  lang: 'uk' | 'nl';
  titel?: string;
  ondertitel?: string;
  naarBovenLabel?: string;
  onNaarBoven?: () => void;
  className?: string;
}

const VOET_TEKSTEN = {
  uk: {
    titel: 'Мій простір',
    ondertitel: 'Власне середовище · Студійний вигляд «Макет»',
    klassiekOndertitel: 'Власне робоче середовище',
    naarBoven: 'Догори ↑',
  },
  nl: {
    titel: 'Mijn Ruimte',
    ondertitel: 'Eigen omgeving · Studio-uitvoering «Maquette»',
    klassiekOndertitel: 'Eigen werkomgeving',
    naarBoven: 'Naar boven ↑',
  },
} as const;

export function MaquetteVoet({
  lang,
  titel,
  ondertitel,
  naarBovenLabel,
  onNaarBoven,
  className = '',
}: MaquetteVoetProps) {
  const taal = lang === 'nl' ? 'nl' : 'uk';
  const isKlassiek = useIsKlassiekMaquette();
  const t = VOET_TEKSTEN[taal];
  const klassen = ['mq-voet', isKlassiek ? 'is-klassiek' : '', className]
    .filter(Boolean)
    .join(' ');

  const gaNaarBoven = () => {
    if (onNaarBoven) {
      onNaarBoven();
      return;
    }
    if (typeof document === 'undefined') return;
    const ws = document.querySelector<HTMLElement>('.canonical-workspace');
    if (ws) {
      ws.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (isKlassiek) {
    const schoneOndertitel = ondertitel
      ? ondertitel.replace(/[✦✳★]/g, '').trim()
      : t.klassiekOndertitel;
    return (
      <footer className={klassen}>
        <div className="mq-voet-kopie">
          <strong>{titel || t.titel}</strong>
          {schoneOndertitel ? <span>{schoneOndertitel}</span> : null}
        </div>
        <button type="button" className="mq-naar-boven" onClick={gaNaarBoven}>
          {naarBovenLabel || t.naarBoven}
        </button>
      </footer>
    );
  }

  return (
    <footer className={klassen}>
      <span className="mq-voet-monogram" aria-hidden="true">
        M<span>·</span>R
      </span>
      <div className="mq-voet-kopie">
        <strong>{titel || t.titel}</strong>
        <span>{ondertitel || t.ondertitel}</span>
      </div>
      <button type="button" className="mq-naar-boven" onClick={gaNaarBoven}>
        {naarBovenLabel || t.naarBoven}
      </button>
    </footer>
  );
}
