// UI-015: thematische kop (schild + slot, berglandschap: public/aanmeldmethoden/security-hero.svg). Geen verzonnen «score» of
// «3 підключено»: alleen titel, één zin en de knop naar de eerstvolgende ECHTE instelling.
import { Plus } from 'lucide-react';
import type { Taal } from '../../shared/aanmeldmethoden-model';

export function IdentityMethodsHero({ lang, onStart, startUit }: { lang: Taal; onStart: () => void; startUit: boolean }) {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  return <section className='amv2-hero' aria-labelledby='amv2-hero-titel'>
    <img className='amv2-hero-beeld' src='/aanmeldmethoden/security-hero.svg' alt='' aria-hidden='true' draggable={false} />
    <div className='amv2-hero-tekst'>
      <h2 id='amv2-hero-titel'>{tr('Способи входу', 'Aanmeldmethoden')}</h2>
      <p>{tr('Як ви входите і як підтверджуєте важливі дії.', 'Hoe je je aanmeldt en belangrijke acties bevestigt.')}</p>
      <button type='button' className='amv2-hero-knop' onClick={onStart} disabled={startUit}><Plus aria-hidden='true' />{tr('Налаштувати спосіб', 'Methode instellen')}</button>
    </div>
  </section>;
}
