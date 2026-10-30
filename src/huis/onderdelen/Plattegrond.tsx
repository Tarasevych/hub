// Schematische 2D-plattegrond in SVG: kamers als rechthoeken op een raster (geometrie x/y/w/h), naam altijd zichtbaar, per kamer
// het aantal apparaten en hoeveel lampen bevestigd aan staan. Klikbaar en met het toetsenbord bereikbaar; er is altijd ook een
// lijst (Kamers.tsx) voor wie geen plattegrond kan gebruiken. Geen 3D, geen scanning.
import { versheid, type Apparaat, type Ruimte } from '../../../shared/huis-model';
import { toestandVan, tr, type Lang } from '../tekst';

type Props = { lang: Lang; ruimtes: Ruimte[]; apparaten: Apparaat[]; verdieping: string; gekozen?: string; onKies: (r: Ruimte) => void; compact?: boolean };
export default function Plattegrond({ lang, ruimtes, apparaten, verdieping, gekozen, onKies, compact }: Props) {
  const op = ruimtes.filter((r) => r.verdieping === verdieping);
  if (!op.length) return <p className='hv-hint'>{tr(lang, 'На цьому поверсі ще немає кімнат.', 'Op deze verdieping zijn nog geen kamers.')}</p>;
  const S = 24;
  const maxX = Math.max(...op.map((r) => r.geometrie.x + r.geometrie.w), 8), maxY = Math.max(...op.map((r) => r.geometrie.y + r.geometrie.h), 6);
  return (
    <svg className={`hv-plan${compact ? ' is-compact' : ''}`} viewBox={`0 0 ${maxX * S + 8} ${maxY * S + 8}`} role='group' aria-label={tr(lang, 'Схематичний план', 'Schematische plattegrond')} data-hv-plan={verdieping}>
      {op.map((r) => {
        const in_ = apparaten.filter((a) => a.ruimteId === r.id);
        const aan = in_.filter((a) => a.soort === 'light' && toestandVan(a, 'aan')?.waarde === true && versheid(toestandVan(a, 'aan')) === 'vers').length;
        const temp = in_.map((a) => toestandVan(a, 'temperatuur')).find((t) => t && typeof t.waarde === 'number' && versheid(t) === 'vers');
        const x = r.geometrie.x * S + 4, y = r.geometrie.y * S + 4, w = r.geometrie.w * S, h = r.geometrie.h * S;
        return (
          <g key={r.id} className={`hv-plan-kamer${gekozen === r.id ? ' is-gekozen' : ''}${aan ? ' heeft-licht' : ''}`} tabIndex={0} role='button' aria-label={`${r.naam}: ${in_.length} ${tr(lang, 'пристроїв', 'apparaten')}${aan ? `, ${aan} ${tr(lang, 'світло увімк.', 'licht aan')}` : ''}`} onClick={() => onKies(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKies(r); } }} data-hv-plan-kamer={r.id}>
            <rect x={x} y={y} width={w} height={h} rx={6} />
            <text x={x + 8} y={y + 18} className='hv-plan-naam'>{r.naam}</text>
            {!compact || h >= 2 * S ? <text x={x + 8} y={y + 34} className='hv-plan-info'>{in_.length ? `${in_.length} ${tr(lang, 'пристр.', 'app.')}${aan ? ` · ${aan} 💡` : ''}${temp ? ` · ${temp.waarde}${temp.eenheid}` : ''}` : tr(lang, 'порожньо', 'leeg')}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
