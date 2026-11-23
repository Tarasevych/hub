// Віха M2 (UI-015A): перехід до чинної сторінки сеансів та пам'ятка про способи підтвердження важливих дій.
import { ChevronRight, Monitor, ShieldCheck } from 'lucide-react';
import type { Taal } from './aanmeldmethoden-model';

export function BeveiligingExtrasV2({ lang, onSessies }: { lang: Taal; onSessies?: () => void }) {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  return (
    <div className='amv2-extras'>
      {onSessies ? (
        <button type='button' className='amv2-extra' onClick={onSessies}>
          <span className='amv2-icoon tint-blauw' aria-hidden='true'>
            <Monitor />
          </span>
          <span className='amv2-kaart-tekst'>
            <strong>{tr('Пристрої та сеанси', 'Apparaten en sessies')}</strong>
            <span className='amv2-kaart-regel'>{tr('Де зараз відкрито ваш обліковий запис', 'Waar uw account nu aangemeld is')}</span>
          </span>
          <ChevronRight aria-hidden='true' className='amv2-pijl' />
        </button>
      ) : (
        <a className='amv2-extra' href={`/sessies?lang=${lang}`}>
          <span className='amv2-icoon tint-blauw' aria-hidden='true'>
            <Monitor />
          </span>
          <span className='amv2-kaart-tekst'>
            <strong>{tr('Пристрої та сеанси', 'Apparaten en sessies')}</strong>
            <span className='amv2-kaart-regel'>{tr('Де зараз відкрито ваш обліковий запис', 'Waar uw account nu aangemeld is')}</span>
          </span>
          <ChevronRight aria-hidden='true' className='amv2-pijl' />
        </a>
      )}
      <div className='amv2-extra info'>
        <span className='amv2-icoon tint-groen' aria-hidden='true'>
          <ShieldCheck />
        </span>
        <span className='amv2-kaart-tekst'>
          <strong>{tr('Підтвердження важливих дій', 'Belangrijke handelingen bevestigen')}</strong>
          <span className='amv2-kaart-regel'>
            {tr(
              'Ключ доступу, код із застосунку, код відновлення або Google. Без SMS.',
              'Toegangssleutel, code uit de app, herstelcode of Google. Zonder sms.',
            )}
          </span>
        </span>
      </div>
    </div>
  );
}
