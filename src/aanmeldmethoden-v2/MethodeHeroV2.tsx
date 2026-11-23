// Віха M2 (UI-015A): тематична шапка розділу «Способи входу» у картковому поданні.
// Векторна ілюстрація гір і щита побудована виключно на змінних теми (var(--accent), var(--panel), var(--accentText)),
// без зовнішніх файлів у public/ і без вигаданих оцінок чи відсотків захисту.
import { Plus } from 'lucide-react';
import type { Taal } from './aanmeldmethoden-model';

export function MethodeHeroV2({ lang, onStart, startUit }: { lang: Taal; onStart: () => void; startUit: boolean }) {
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  return (
    <section className='amv2-hero' aria-labelledby='amv2-hero-titel'>
      <div className='amv2-hero-tekst'>
        <h2 id='amv2-hero-titel'>{tr('Способи входу', 'Aanmeldmethoden')}</h2>
        <p>{tr('Як ви входите в обліковий запис і чим підтверджуєте важливі дії.', 'Hoe u zich bij uw account aanmeldt en belangrijke handelingen bevestigt.')}</p>
        <button type='button' className='amv2-hero-knop' data-amv2-hero-cta='' onClick={onStart} disabled={startUit}>
          <Plus aria-hidden='true' />
          {tr('Налаштувати спосіб', 'Methode instellen')}
        </button>
      </div>
      <svg className='amv2-hero-beeld' viewBox='0 0 320 180' aria-hidden='true' focusable='false'>
        <path d='M0 150 L70 70 L110 118 L160 40 L215 130 L250 92 L320 160 L320 180 L0 180 Z' fill='var(--accent)' opacity='.18' />
        <path d='M0 164 L55 110 L120 156 L190 86 L260 150 L320 120 L320 180 L0 180 Z' fill='var(--accent)' opacity='.12' />
        <g transform='translate(232 24)'>
          <path d='M32 0 L64 12 V38 C64 60 50 74 32 82 C14 74 0 60 0 38 V12 Z' fill='var(--panel)' opacity='.9' stroke='var(--accent)' strokeWidth='2' />
          <rect x='20' y='34' width='24' height='20' rx='4' fill='var(--accent)' />
          <path d='M24 34 V28 a8 8 0 0 1 16 0 v6' fill='none' stroke='var(--accent)' strokeWidth='4' />
          <circle cx='32' cy='43' r='3' fill='var(--accentText)' />
        </g>
      </svg>
    </section>
  );
}
