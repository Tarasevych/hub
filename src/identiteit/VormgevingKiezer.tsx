// Перемикач вигляду центру облікового запису. Keuzeknoppen voor de weergave; de uitleg vertelt wat er wel en niet verandert.
// Компактний варіант — одна кнопка «Вигляд: …», що розкриває ті самі кнопки; для липкого меню класичної сторінки.
// De compacte variant: één knop «Weergave: …» die dezelfde keuzeknoppen openklapt, voor het klevende menu van de klassieke pagina.
import { useRef } from 'react';
import { VORMGEVING_TEKST, useBeschikbareVormgevingen, useVormgeving } from './identiteit-vormgeving';

export function VormgevingKiezer({ lang, className = '', compact = false }: { lang: 'uk' | 'nl'; className?: string; compact?: boolean }) {
  const [huidig, kies] = useVormgeving();
  const beschikbaar = useBeschikbareVormgevingen();
  const details = useRef<HTMLDetailsElement>(null);
  const label = lang === 'uk' ? 'Вигляд сторінки' : 'Weergave van de pagina';
  const groep = (
    <div className={`ia-vormgeving ${className}`} role='radiogroup' aria-label={label}>
      <span className='ia-vormgeving-label'>{label}</span>
      {beschikbaar.map((v) => {
        const t = VORMGEVING_TEKST[v];
        const uitleg = (lang === 'uk' ? t.ukUitleg : t.nlUitleg) + ' ' + (lang === 'uk'
          ? 'Вибір зберігається на цьому пристрої.'
          : 'De keuze wordt op dit apparaat bewaard.');
        return (
          <button key={v} type='button' role='radio' aria-checked={huidig === v} title={uitleg} data-vormgeving={v}
            className={huidig === v ? 'is-actief' : undefined}
            onClick={() => { kies(v); if (details.current) details.current.open = false; }}>
            {lang === 'uk' ? t.uk : t.nl}
          </button>
        );
      })}
    </div>
  );
  if (!compact) return groep;
  const huidigeNaam = lang === 'uk' ? VORMGEVING_TEKST[huidig].uk : VORMGEVING_TEKST[huidig].nl;
  const hint = lang === 'uk'
    ? 'Відкриває вибір вигляду цієї сторінки («Макет», «Студія» або класичний). Змінюється лише подання, налаштування й дані ті самі.'
    : 'Opent de keuze van de weergave van deze pagina («Ontwerp», «Studio» of klassiek). Alleen de weergave wisselt, instellingen en gegevens blijven gelijk.';
  return (
    <details ref={details} className='ia-vormgeving-compact'>
      <summary title={hint}><span className='ia-vormgeving-compact-label'>{lang === 'uk' ? 'Вигляд' : 'Weergave'}</span> {huidigeNaam}</summary>
      <div className='ia-vormgeving-compact-paneel'>{groep}</div>
    </details>
  );
}
