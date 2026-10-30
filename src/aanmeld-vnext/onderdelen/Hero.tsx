// UI-015 — de hero van «Способи входу»: rustige gradient op de tokens, bergsilhouet en schild-met-slot naar het
// referentiebeeld (assets/security-hero.svg, hertekend op var(--…)-kleuren zodat licht/donker vanzelf kloppen).
// GEEN cijfers of «100% захист» (dossier §3.2): alleen de titel, één zin en de CTA die bestaande details opent.
import type { Lang } from '../../toegangslaag-teksten';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

export default function Hero({ lang, onCta }: { lang: Lang; onCta: () => void }) {
  return (
    <section className='amv-hero' data-amv-hero='' aria-labelledby='amv-hero-kop'>
      <div className='amv-hero-tekst'>
        <h2 id='amv-hero-kop'>{tr(lang, 'Способи входу', 'Aanmeldmethoden')}</h2>
        <p>{tr(lang, 'Керуйте всіма способами автентифікації у вашому обліковому записі.', 'Beheer alle manieren waarop u zich bij uw account aanmeldt.')}</p>
        <button type='button' className='amv-knop is-hoofd' data-amv-hero-cta='' onClick={onCta}>
          {tr(lang, '+ Налаштувати спосіб', '+ Methode instellen')}
        </button>
      </div>
      {/* Decoratief: bergen + schild met slot, alleen token-kleuren; aria-hidden want de tekst ernaast zegt alles. */}
      <svg className='amv-hero-beeld' viewBox='0 0 320 180' aria-hidden='true' focusable='false'>
        <path d='M0 150 L70 70 L110 118 L160 40 L215 130 L250 92 L320 160 L320 180 L0 180 Z' fill='var(--accent)' opacity='.18' />
        <path d='M0 164 L55 110 L120 156 L190 86 L260 150 L320 120 L320 180 L0 180 Z' fill='var(--accent)' opacity='.12' />
        <g transform='translate(236 24)'>
          <path d='M32 0 L64 12 V38 C64 60 50 74 32 82 C14 74 0 60 0 38 V12 Z' fill='var(--panel)' opacity='.85' stroke='var(--accent)' strokeWidth='2' />
          <rect x='20' y='34' width='24' height='20' rx='4' fill='var(--accent)' />
          <path d='M24 34 V28 a8 8 0 0 1 16 0 v6' fill='none' stroke='var(--accent)' strokeWidth='4' />
          <circle cx='32' cy='43' r='3' fill='var(--accentText)' />
        </g>
      </svg>
    </section>
  );
}
