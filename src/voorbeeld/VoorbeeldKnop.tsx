// Knop «Попередній перегляд» in een rij van de lijst: opent het werkvenster met de volledige inhoud (VoorbeeldVenster),
// zonder de pagina te verlaten. Klik/Enter/spatie op de knop opent níét de brief zelf (stopPropagation).
// Blok 1 (25.10.2026): naam, pictogram en toon uit het register (shared/mail-acties.ts, actie «preview»). Met de muis staat dezelfde
// actie vooraan in de balk van de rij; dit «oog» in de datum blijft voor het toetsenbord en voor aanraakschermen (zie voorbeeld.css).
// 26.10: nooit een native title — die toonde de lange naam («Попередній перегляд: текст…») als wit systeemblad naast de blauwe
// ongelezen-stip. De zichtbare hint is dezelfde korte «Перегляд» als in de balk (data-tooltip + span), links van het oog zodat
// hij de stip niet bedekt. aria-label blijft de lange naam voor de schermlezer; de viewport-laag leest data-tooltip, niet aria-label.
import { mailActieTekst } from '../../shared/mail-acties';
import { mailActieIcoon, mailActieKenmerken } from '../mail/MailActieKnop';
import './voorbeeld.css';

export default function VoorbeeldKnop({ lang, onOpen }: { lang: 'uk' | 'nl'; onOpen: () => void }) {
  const naam = mailActieTekst('preview', lang);
  const kort = mailActieTekst('preview', lang, { vorm: 'kort' });
  return (
    <button type='button' className='voorbeeld-knop' data-row-eigen='true' {...mailActieKenmerken('preview')} aria-label={naam} data-tooltip={kort} data-tooltip-placement='left'
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
      {mailActieIcoon('preview')}
      <span role='tooltip'>{kort}</span>
    </button>
  );
}
