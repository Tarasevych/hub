// Vertaalstrook in de brief (pakket 3 «Adaptive Mail Canvas», 24.10.2026). Макет: «смуга перекладу: перемикач «Оригінал / Переклад /
// Порівняти»». Oorspronkelijk = de brief zoals hij kwam (met al zijn opmaak, altijd bereikbaar); Переклад = de bestaande vertaling op de
// plaats zelf (src/mail/AiVertalingBalk.tsx doet het verzoek); Порівняти = de tabel per alinea (src/mail/VergelijkTabel.tsx).
// Zonder privé-agent met mail.read: alleen «Оригінал» kan, en dat staat erbij — er wordt niets weggestuurd.
import { Languages, LoaderCircle } from 'lucide-react';
import { useId } from 'react';
import { taalLabel } from '../../shared/ai-vertaling';
import './ai-blok.css';

export type VertaalModus = 'origineel' | 'vertaling' | 'vergelijk';
type Props = {
  lang: 'uk' | 'nl';
  modus: VertaalModus;
  bronTaal: string;
  doelTaal: string;
  /** Er is een privé-agent die mag vertalen. */
  kan: boolean;
  bezig: boolean;
  /** «Перекладено … рушієм …» staat al op de plaat boven de tekst; hier alleen de talen. */
  onModus: (m: VertaalModus) => void;
};

const KEUZES: Array<{ id: VertaalModus; uk: string; nl: string }> = [
  { id: 'origineel', uk: 'Оригінал', nl: 'Origineel' },
  { id: 'vertaling', uk: 'Переклад', nl: 'Vertaling' },
  { id: 'vergelijk', uk: 'Порівняти', nl: 'Vergelijken' },
];

export default function VertaalStrook({ lang, modus, bronTaal, doelTaal, kan, bezig, onModus }: Props) {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl);
  const id = useId();
  return (
    <div className='vertaal-strook' data-vertaal-strook data-modus={modus} role='group' aria-labelledby={`${id}-kop`} data-mail-translation-skip='true'>
      <span className='vertaal-strook-talen' id={`${id}-kop`}>
        <Languages aria-hidden='true' />
        <span>{t('Мова листа', 'Taal van het bericht')}: {taalLabel(lang, bronTaal) || bronTaal.toUpperCase()} → {taalLabel(lang, doelTaal)}</span>
      </span>
      <span className='lz-segment vertaal-strook-keuze'>
        {KEUZES.map((k) => (
          <label key={k.id} data-modus={k.id} title={k.id !== 'origineel' && !kan ? t('Потрібен ШІ-агент у «Доступ ШІ»', 'Er is een AI-agent nodig in «AI-toegang»') : undefined}>
            <input type='radio' name={`${id}-m`} checked={modus === k.id} disabled={k.id !== 'origineel' && !kan} onChange={() => onModus(k.id)} />
            <span>{t(k.uk, k.nl)}</span>
          </label>
        ))}
      </span>
      {bezig && <LoaderCircle className='spin vertaal-strook-bezig' aria-label={t('Перекладаємо…', 'Bezig met vertalen…')} />}
      {!kan && <small className='vertaal-strook-zonder'>{t('Переклад потребує ШІ-агента («Доступ ШІ»); без нього лист нікуди не надсилається.', 'Vertalen vraagt een AI-agent («AI-toegang»); zonder agent gaat het bericht nergens heen.')}</small>}
    </div>
  );
}
