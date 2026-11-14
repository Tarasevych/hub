// Перемикач вигляду центру облікового запису. Keuzeknoppen voor de weergave; de uitleg vertelt wat er wel en niet verandert.
// Компактний варіант — одна кнопка «Вигляд: …», що розкриває ті самі кнопки; для липкого меню класичної сторінки.
// De compacte variant: één knop «Weergave: …» die dezelfde keuzeknoppen openklapt, voor het klevende menu van de klassieke pagina.
import { useRef } from 'react';
import { VLAG_MAQUETTE, VORMGEVINGEN, VORMGEVING_TEKST, useBeschikbareVormgevingen, useVormgeving } from './identiteit-vormgeving';

export function VormgevingKiezer({ lang, className = '', compact = false }: { lang: 'uk' | 'nl'; className?: string; compact?: boolean }) {
  const [huidig, kies] = useVormgeving();
  const beschikbaar = useBeschikbareVormgevingen();
  const details = useRef<HTMLDetailsElement>(null);
  const label = lang === 'uk' ? 'Вигляд сторінки' : 'Weergave van de pagina';
  // Вигляд без свого перемикача функції лишається в списку, але неактивний: інакше незрозуміло, куди він подівся.
  // Een weergave zonder ingeschakelde vlag blijft zichtbaar maar uitgeschakeld, met uitleg waar de schakelaar staat.
  const nietBeschikbaar = VORMGEVINGEN.filter((v) => !beschikbaar.includes(v));
  const waaromNiet = lang === 'uk'
    ? `Недоступно: перемикач функції «${VLAG_MAQUETTE}» вимкнено або ще не створено. Увімкніть його в технічному профілі → «Перемикачі функцій» (спершу «Тільки я»).`
    : `Niet beschikbaar: de functieschakelaar «${VLAG_MAQUETTE}» staat uit of bestaat nog niet. Zet hem aan in het technische profiel → «Functieschakelaars» (eerst «Alleen ik»).`;
  const groep = (
    <div className={`ia-vormgeving ${className}`} role='radiogroup' aria-label={label}>
      <span className='ia-vormgeving-label'>{label}</span>
      {VORMGEVINGEN.map((v) => {
        const t = VORMGEVING_TEKST[v];
        const kan = beschikbaar.includes(v);
        const uitleg = kan
          ? (lang === 'uk' ? t.ukUitleg : t.nlUitleg) + ' ' + (lang === 'uk' ? 'Вибір зберігається в обліковому записі й діє на всіх ваших пристроях після входу.' : 'De keuze wordt in het account bewaard en geldt na aanmelden op al uw apparaten.')
          : waaromNiet;
        return (
          <button key={v} type='button' role='radio' aria-checked={huidig === v} title={uitleg} data-vormgeving={v}
            disabled={!kan} aria-disabled={!kan || undefined}
            className={huidig === v ? 'is-actief' : kan ? undefined : 'is-niet-beschikbaar'}
            onClick={() => { kies(v); if (details.current) details.current.open = false; }}>
            {lang === 'uk' ? t.uk : t.nl}
          </button>
        );
      })}
      {nietBeschikbaar.length ? <small className='ia-vormgeving-hint' data-vormgeving-hint={nietBeschikbaar.join(' ')}>
        {(lang === 'uk' ? '«' : '«') + nietBeschikbaar.map((v) => (lang === 'uk' ? VORMGEVING_TEKST[v].uk : VORMGEVING_TEKST[v].nl)).join('», «') + '»: ' + waaromNiet}
      </small> : null}
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
