import { useEffect, useId, useRef } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { MAIL_MELDING_NIVEAUS, mailMeldingNiveauNaam, type MailMeldingNiveau } from '../../shared/mail-melding-niveau';

type Props = {
  lang: 'uk' | 'nl';
  email: string;
  sleutel: string;
  niveau: MailMeldingNiveau;
  eigen: boolean;
  open: boolean;
  bezig: boolean;
  onOpen: (open: boolean) => void;
  onKies: (niveau: MailMeldingNiveau) => void;
};

/** Дзвоник на картці скриньки. Сповіщень про нові листи ще немає — зберігається лише поріг. */
export default function MailMeldingBel({ lang, email, sleutel, niveau, eigen, open, bezig, onOpen, onKies }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const titel = useId();
  const knop = useRef<HTMLButtonElement | null>(null);
  const venster = useRef<HTMLDivElement | null>(null);
  const naam = mailMeldingNiveauNaam(niveau, lang);

  useEffect(() => {
    if (!open) return;
    const opToets = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onOpen(false);
      knop.current?.focus();
    };
    const buiten = (event: PointerEvent) => {
      const doel = event.target as Node | null;
      if (!doel || venster.current?.contains(doel) || knop.current?.contains(doel)) return;
      onOpen(false);
    };
    window.addEventListener('keydown', opToets, true);
    window.addEventListener('pointerdown', buiten, true);
    return () => {
      window.removeEventListener('keydown', opToets, true);
      window.removeEventListener('pointerdown', buiten, true);
    };
  }, [open, onOpen]);

  return (
    <div className='mail-melding-bel'>
      <button
        type='button'
        ref={knop}
        className='mail-koppeling-icoon'
        data-mail-melding-bel={sleutel}
        aria-haspopup='dialog'
        aria-expanded={open}
        aria-controls={open ? `${titel}-venster` : undefined}
        disabled={bezig}
        data-tooltip={t(`Які листи з ${email} показує дзвоник: ${naam}`, `Welke post van ${email} de bel toont: ${naam}`)}
        aria-label={t(`Які листи з ${email} показує дзвоник: ${naam}`, `Welke post van ${email} de bel toont: ${naam}`)}
        onClick={() => onOpen(!open)}
      >
        {niveau === 'none' ? <BellOff size={16} aria-hidden='true' /> : <Bell size={16} aria-hidden='true' />}
      </button>
      {open ? (
        <div
          ref={venster}
          className='mail-melding-venster'
          id={`${titel}-venster`}
          role='dialog'
          aria-labelledby={titel}
          data-mail-melding-venster={sleutel}
        >
          <strong id={titel}>{email}</strong>
          <p>{t('Сповіщень про нові листи поки немає. Дзвоник лише запам’ятовує поріг для цієї скриньки.', 'Meldingen over nieuwe post zijn er nog niet. De bel onthoudt alleen de drempel van deze mailbox.')}</p>
          <div role='radiogroup' aria-label={t('Поріг дзвоника', 'Drempel van de bel')}>
            {MAIL_MELDING_NIVEAUS.map((id) => (
              <label key={id}>
                <input type='radio' name={`melding-${sleutel}`} checked={niveau === id} onChange={() => onKies(id)} />
                <span>{mailMeldingNiveauNaam(id, lang)}</span>
              </label>
            ))}
          </div>
          {!eigen ? <small>{t('Поки що діє загальний поріг. Вибір збережеться лише для цієї скриньки.', 'Nu geldt nog de algemene drempel. Een keuze geldt daarna alleen voor deze mailbox.')}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
