// Vlag van de taal als SVG-pictogram (geen emoji: Windows toont emoji-vlaggen als de letters «UA» en «NL»).
// Oekraïne: blauw boven, geel onder. België, voor het Nederlands (wens van de eigenaar): zwart, geel, rood, verticaal.
import './taal-vlag.css';

export default function LanguageFlag({ lang, className }: { lang: 'uk' | 'nl'; className?: string }) {
  // De klasse language-flag blijft staan: instellingencentrum.css stemt de vlag in de taalkeuze daarop af.
  const klasse = `taal-vlag taal-vlag-${lang} language-flag language-flag-${lang}${className ? ` ${className}` : ''}`;
  if (lang === 'uk') {
    return (
      <svg className={klasse} viewBox='0 0 3 2' aria-hidden='true' focusable='false'>
        <rect width='3' height='1' fill='#0057B7' />
        <rect y='1' width='3' height='1' fill='#FFD700' />
      </svg>
    );
  }
  return (
    <svg className={klasse} viewBox='0 0 3 2' aria-hidden='true' focusable='false'>
      <rect width='1' height='2' fill='#000000' />
      <rect x='1' width='1' height='2' fill='#FDDA24' />
      <rect x='2' width='1' height='2' fill='#EF3340' />
    </svg>
  );
}
