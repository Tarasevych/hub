// Єдиний блок налаштування подання центру сповіщень у Пульті уваги, компактному списку v2 та на сторінці /melding.
// Забезпечує прозорий вибір між типовим «Пультом уваги» (MELDPANEEL-003), компактним списком v2 та розширеними поясненнями uitleg-v3.

import { BookOpenCheck, Layers, List, Sparkles } from 'lucide-react';
import { zetEcosysteemModusActief } from './ecosysteem/ecosysteem-opslag';
import { useMeldingWeergaveKeuze, zetMeldingWeergaveKeuze } from './weergave-keuze';

type Props = {
  lang: 'uk' | 'nl';
};

export default function MeldingModusKiezer({ lang }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const { stijl, uitlegV3 } = useMeldingWeergaveKeuze();

  const kiesStijl = (volgende: 'puls' | 'v2') => {
    zetMeldingWeergaveKeuze({ stijl: volgende });
    if (volgende === 'v2') {
      zetEcosysteemModusActief(false);
    }
  };

  return (
    <section
      className='mvk-kaart mel-modus-kiezer'
      data-melding-modus-kiezer='1'
      aria-label={t('Режим панелі сповіщень та пояснень', 'Modus van het meldingenpaneel en uitleg')}
    >
      <header className='mvk-kaart-kop'>
        <span className='mvk-tegel is-groot' data-kleur='teal' aria-hidden='true'>
          <Layers />
        </span>
        <span className='mvk-kaart-titel'>
          <strong>{t('Подання центру сповіщень', 'Weergave van het meldingencentrum')}</strong>
          <small>
            {t(
              'Типовим є єдиний Пульт уваги; за потреби можна увімкнути компактний список або розширені пояснення.',
              'Standaard is de ene Aandachtspuls actief; u kunt altijd kiezen voor de compacte lijst of uitgebreide uitleg.',
            )}
          </small>
        </span>
      </header>

      <div
        className='mvk-segment'
        role='radiogroup'
        aria-label={t('Вигляд біля дзвіночка', 'Weergave bij de bel')}
      >
        <button
          type='button'
          role='radio'
          aria-checked={stijl === 'puls'}
          data-melding-stijl-keuze='puls'
          onClick={() => kiesStijl('puls')}
          title={t(
            'Типовий єдиний Пульт уваги з логотипами служб, графом першопричини та перемиканням у широке вікно',
            'Standaard Aandachtspuls met dienstlogo’s, oorzaakketens en wissel naar breed venster',
          )}
        >
          <Sparkles aria-hidden='true' />
          <span>{t('Пульт уваги (типово)', 'Aandachtspuls (standaard)')}</span>
        </button>
        <button
          type='button'
          role='radio'
          aria-checked={stijl === 'v2'}
          data-melding-stijl-keuze='v2'
          onClick={() => kiesStijl('v2')}
          title={t(
            'Стислий класичний список сповіщень із вкладками «Нові», «Прочитані» та «Архів»',
            'Beknopte klassieke lijst met de delen «Nieuw», «Gelezen» en «Archief»',
          )}
        >
          <List aria-hidden='true' />
          <span>{t('Компактний список', 'Compacte lijst')}</span>
        </button>
      </div>

      <div className='mvk-rij-kop mv2-schakel-rij' style={{ marginTop: '8px' }}>
        <span className='mvk-naam' style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <BookOpenCheck size={15} aria-hidden='true' />
          <span>{t('Розширені пояснення та швидкі дії в картках', 'Uitgebreide uitleg en snelle acties in kaarten')}</span>
        </span>
        <button
          type='button'
          role='switch'
          className='mvk-schakel'
          data-melding-uitleg-v3-schakel='1'
          aria-checked={uitlegV3}
          aria-label={t('Розширені пояснення та швидкі дії в картках', 'Uitgebreide uitleg en snelle acties in kaarten')}
          title={t(
            'Показує стисле пояснення причини, наступних кроків, налаштування розміру тексту та групові дії',
            'Toont beknopte uitleg over oorzaak, vervolgstappen, tekstgrootte en groepsacties',
          )}
          onClick={() => zetMeldingWeergaveKeuze({ uitlegV3: !uitlegV3 })}
        >
          <span aria-hidden='true' />
        </button>
      </div>
    </section>
  );
}
