import { useState } from 'react';
import type { MiniatuurModus } from '../../shared/miniatuur-beleid';
import { miniatuurModusLezen, miniatuurModusSchrijven } from '../bestand/miniatuur-modus';

const KEUZE: Array<{ id: MiniatuurModus; uk: string; nl: string }> = [
  { id: 'auto', uk: 'Авто', nl: 'Automatisch' },
  { id: 'altijd', uk: 'Завжди', nl: 'Altijd' },
  { id: 'op-verzoek', uk: 'На вимогу', nl: 'Op verzoek' },
];

/** Коли качати мініатюру вкладення. Лише в цьому браузері (не в рядку налаштувань сервера). */
export default function MiniatuurModusKeuze({ lang }: { lang: 'uk' | 'nl' }) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const [modus, setModus] = useState<MiniatuurModus>(() => miniatuurModusLezen());
  return (
    <section className='mail-compact-block mail-miniatuur-modus'>
      <header><strong>{t('Мініатюри вкладень', 'Miniaturen van bijlagen')}</strong></header>
      <div role='group' aria-label={t('Коли завантажувати мініатюри', 'Wanneer miniaturen laden')}>
        {KEUZE.map((k) => (
          <button type='button' key={k.id} aria-pressed={modus === k.id} data-miniatuur-modus={k.id} onClick={() => { miniatuurModusSchrijven(k.id); setModus(k.id); }}>
            {t(k.uk, k.nl)}
          </button>
        ))}
      </div>
      <p>{t('Авто: до 4 МБ на швидкій мережі, до 1 МБ на 3G, лише з кешу при економії трафіку. На вимогу нічого не качає само.', 'Automatisch: tot 4 MB op een snelle verbinding, tot 1 MB op 3G, alleen uit de cache bij databeperking. Op verzoek laadt niets vanzelf.')}</p>
    </section>
  );
}
