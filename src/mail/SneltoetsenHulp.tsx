// Overzicht van de sneltoetsen in de open brief («?», pakket 2 «Adaptive Mail Canvas», 24.10.2026). Een klein modaal venster
// binnen het leesvenster: Escape of «Закрити» sluit het en zet de focus terug waar hij was. De toetsen zelf regelt
// src/mail/LeesVenster.tsx (lees-modus: sneltoets, sneltoetsMag).
// Blok 1 (25.10.2026): naam en toets van elke actie komen uit het register (shared/mail-acties.ts) — dezelfde namen als de knoppen;
// tests/eenheid/mail-acties-20261025 bewaakt dat de toetsen van het register die van lees-modus.ts (sneltoets) zijn.
import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { mailActieSneltoets, mailActieTekst, type MailActieId } from '../../shared/mail-acties';
import type { LeesModus } from './lees-modus';

type Props = { lang: 'uk' | 'nl'; modus: LeesModus; onSluit: () => void };

type Rij = { toetsen: string[]; uk: string; nl: string };
const actie = (id: MailActieId): Rij => ({ toetsen: [mailActieSneltoets(id)], uk: mailActieTekst(id, 'uk', { vorm: 'hulp' }), nl: mailActieTekst(id, 'nl', { vorm: 'hulp' }) });
const RIJEN: Rij[] = [
  actie('reply'),
  actie('reply-all'),
  actie('forward-attachment'),
  actie('archive'),
  { toetsen: [mailActieSneltoets('next'), mailActieSneltoets('previous')], uk: `${mailActieTekst('next', 'uk')} / ${mailActieTekst('previous', 'uk')}`, nl: `${mailActieTekst('next', 'nl')} / ${mailActieTekst('previous', 'nl')}` },
  { toetsen: ['F6'], uk: 'Лист ⇄ контекст', nl: 'Bericht ⇄ context' },
  { toetsen: ['Esc'], uk: 'Спершу закрити аркуш, потім лист', nl: 'Eerst het blad sluiten, dan het bericht' },
  { toetsen: ['?'], uk: 'Ця довідка', nl: 'Dit overzicht' },
];

export default function SneltoetsenHulp({ lang, modus, onSluit }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const id = useId(), sluitRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const vorige = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sluitRef.current?.focus({ preventScroll: true });
    const opToets = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      onSluit();
    };
    document.addEventListener('keydown', opToets, true);
    return () => {
      document.removeEventListener('keydown', opToets, true);
      if (vorige && vorige.isConnected) requestAnimationFrame(() => vorige.focus({ preventScroll: true }));
    };
  }, []);
  const gesplitst = modus === 'rechts' || modus === 'onder' || modus === 'zwevend';
  return (
    <>
      <div className='lz-hulp-scherm' aria-hidden='true' onMouseDown={onSluit} />
      {/* een <div>, geen <section>: een <section> direct in het leesvenster telt overal als het gesprek (schuiven, opmaak) */}
      <div className='lz-hulp' role='dialog' aria-modal='true' aria-labelledby={`${id}-kop`} data-lezer-hulp>
        <header>
          <h2 id={`${id}-kop`}>{t('Клавіші в листі', 'Sneltoetsen in het bericht')}</h2>
          <button ref={sluitRef} type='button' aria-label={t('Закрити', 'Sluiten')} title={t('Закрити', 'Sluiten')} onClick={onSluit}><X aria-hidden='true' /></button>
        </header>
        <dl>
          {RIJEN.map((r) => (
            <div key={r.toetsen.join()}>
              <dt>{r.toetsen.map((k, i) => <span key={k}>{i > 0 ? ' / ' : ''}<kbd>{k}</kbd></span>)}</dt>
              <dd>{t(r.uk, r.nl)}</dd>
            </div>
          ))}
        </dl>
        <p>
          {gesplitst
            ? t('У цьому режимі клавіші працюють, коли фокус у листі. Під час набору тексту — ніколи.', 'In deze vorm werken de toetsen met de focus in het bericht. Tijdens het typen nooit.')
            : t('Під час набору тексту клавіші не працюють. На українській розкладці теж: важить місце клавіші.', 'Tijdens het typen werken de toetsen niet. Ook met een Oekraïense indeling: de plaats van de toets telt.')}
        </p>
      </div>
    </>
  );
}
