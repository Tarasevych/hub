// Перемикач вигляду центру облікового запису. Keuzeknoppen voor de weergave; de uitleg vertelt wat er wel en niet verandert.
import { VORMGEVINGEN, VORMGEVING_TEKST, useVormgeving } from './identiteit-vormgeving';

export function VormgevingKiezer({ lang, className = '' }: { lang: 'uk' | 'nl'; className?: string }) {
  const [huidig, kies] = useVormgeving();
  const label = lang === 'uk' ? 'Вигляд сторінки' : 'Weergave van de pagina';
  return (
    <div className={`ia-vormgeving ${className}`} role='radiogroup' aria-label={label}>
      <span className='ia-vormgeving-label'>{label}</span>
      {VORMGEVINGEN.map((v) => {
        const t = VORMGEVING_TEKST[v];
        const uitleg = (lang === 'uk' ? t.ukUitleg : t.nlUitleg) + ' ' + (lang === 'uk'
          ? 'Вибір зберігається на цьому пристрої.'
          : 'De keuze wordt op dit apparaat bewaard.');
        return (
          <button key={v} type='button' role='radio' aria-checked={huidig === v} title={uitleg} data-vormgeving={v}
            className={huidig === v ? 'is-actief' : undefined} onClick={() => kies(v)}>
            {lang === 'uk' ? t.uk : t.nl}
          </button>
        );
      })}
    </div>
  );
}
