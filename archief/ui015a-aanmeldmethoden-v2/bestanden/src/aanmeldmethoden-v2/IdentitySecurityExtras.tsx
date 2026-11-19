// UI-015: «Сеанси та пристрої» (verwijst naar de bestaande pagina, geen kopie van het sessiebeheer) en wat als bevestiging telt.
import { ChevronRight, Monitor, ShieldCheck } from 'lucide-react';
import type { Taal } from '../../shared/aanmeldmethoden-model';

export function IdentitySecurityExtras({ lang, onSessies }: { lang: Taal; onSessies?: () => void }) {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  return <div className='amv2-extras'>
    {onSessies && <button type='button' className='amv2-extra' onClick={onSessies}>
      <span className='amv2-icoon tint-blauw' aria-hidden='true'><Monitor /></span>
      <span className='amv2-kaart-tekst'><strong>{tr('Пристрої та сеанси', 'Apparaten en sessies')}</strong><span className='amv2-kaart-regel'>{tr('Де ви зараз увійшли', 'Waar je nu bent aangemeld')}</span></span>
      <ChevronRight aria-hidden='true' className='amv2-pijl' />
    </button>}
    <div className='amv2-extra info'>
      <span className='amv2-icoon tint-groen' aria-hidden='true'><ShieldCheck /></span>
      <span className='amv2-kaart-tekst'><strong>{tr('Підтвердження важливих дій', 'Belangrijke acties bevestigen')}</strong><span className='amv2-kaart-regel'>{tr('Passkey, код із застосунку, код відновлення або Google. Без SMS.', 'Passkey, app-code, herstelcode of Google. Zonder sms.')}</span></span>
    </div>
  </div>;
}
