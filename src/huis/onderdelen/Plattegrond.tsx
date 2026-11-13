// Схематичний двовимірний план поверху у форматі SVG: кімнати на координатній сітці з назвою, кількістю пристроїв,
// підтвердженим освітленням і виміряною температурою. Доступний з клавіатури; поруч завжди є спискове подання (Kamers.tsx).
// Schematische 2D-plattegrond in SVG: kamers als rechthoeken op een raster met naam, aantal apparaten, bevestigd licht en temperatuur.
import { versheid, type Apparaat, type Ruimte } from '../../../shared/huis-model';
import { toestandVan, tr, type Lang } from '../tekst';

type Props = { lang: Lang; ruimtes: Ruimte[]; apparaten: Apparaat[]; verdieping: string; gekozen?: string; onKies: (r: Ruimte) => void; compact?: boolean };
export default function Plattegrond({ lang, ruimtes, apparaten, verdieping, gekozen, onKies, compact }: Props) {
  const op = ruimtes.filter((r) => r.verdieping === verdieping);
  if (!op.length) return <p className='hv-hint'>{tr(lang, 'На цьому поверсі ще немає кімнат.', 'Op deze verdieping zijn nog geen kamers.')}</p>;
  const S = 24;
  const maxX = Math.max(...op.map((r) => r.geometrie.x + r.geometrie.w), 8), maxY = Math.max(...op.map((r) => r.geometrie.y + r.geometrie.h), 6);
  const breedte = maxX * S + 8, hoogte = maxY * S + 8;
  const kolommen = Array.from({ length: maxX + 1 }, (_, i) => i * S + 4);
  const rijen = Array.from({ length: maxY + 1 }, (_, i) => i * S + 4);
  return (
    <svg className={`hv-plan${compact ? ' is-compact' : ''}`} viewBox={`0 0 ${breedte} ${hoogte}`} role='group' aria-label={tr(lang, 'Схематичний план', 'Schematische plattegrond')} data-hv-plan={verdieping} data-mq-plattegrond={compact ? 'compact' : 'volledig'}>
      <g className='hv-plan-aslijnen' opacity={0} aria-hidden='true'>
        {kolommen.map((kx) => <line key={`x-${kx}`} className='hv-plan-aslijn' x1={kx} y1={2} x2={kx} y2={hoogte - 2} />)}
        {rijen.map((ry) => <line key={`y-${ry}`} className='hv-plan-aslijn' x1={2} y1={ry} x2={breedte - 2} y2={ry} />)}
        <path className='hv-plan-hoek' d={`M 2 10 L 2 2 L 10 2 M ${breedte - 10} 2 L ${breedte - 2} 2 L ${breedte - 2} 10 M 2 ${hoogte - 10} L 2 ${hoogte - 2} L 10 ${hoogte - 2} M ${breedte - 10} ${hoogte - 2} L ${breedte - 2} ${hoogte - 2} L ${breedte - 2} ${hoogte - 10}`} />
      </g>
      {op.map((r) => {
        const in_ = apparaten.filter((a) => a.ruimteId === r.id);
        const aan = in_.filter((a) => a.soort === 'light' && toestandVan(a, 'aan')?.waarde === true && versheid(toestandVan(a, 'aan')) === 'vers').length;
        const temp = in_.map((a) => toestandVan(a, 'temperatuur')).find((t) => t && typeof t.waarde === 'number' && versheid(t) === 'vers');
        const x = r.geometrie.x * S + 4, y = r.geometrie.y * S + 4, w = r.geometrie.w * S, h = r.geometrie.h * S;
        const binnen = w > 8 && h > 8 ? `M ${x + 2.5} ${y + 2.5} H ${x + w - 2.5} V ${y + h - 2.5} H ${x + 2.5} Z` : '';
        return (
          <g key={r.id} className={`hv-plan-kamer${gekozen === r.id ? ' is-gekozen' : ''}${aan ? ' heeft-licht' : ''}`} tabIndex={0} role='button' aria-label={`${r.naam}: ${in_.length} ${tr(lang, 'пристроїв', 'apparaten')}${aan ? `, ${aan} ${tr(lang, 'світло увімк.', 'licht aan')}` : ''}`} onClick={() => onKies(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKies(r); } }} data-hv-plan-kamer={r.id} data-mq-kamer-staat={gekozen === r.id ? 'gekozen' : aan ? 'verlicht' : 'rust'}>
            <rect x={x} y={y} width={w} height={h} rx={6} />
            {binnen ? <path className='hv-plan-binnenrand' d={binnen} opacity={0} aria-hidden='true' /> : null}
            {aan && w >= 2 * S ? (
              <g aria-hidden='true'>
                <circle className='hv-plan-lichtgloed' cx={x + w - 10} cy={y + 12} r={6.5} opacity={0} />
                <circle className='hv-plan-lichtpunt' cx={x + w - 10} cy={y + 12} r={2.8} opacity={0} />
              </g>
            ) : null}
            <text x={x + 8} y={y + 18} className='hv-plan-naam'>{r.naam}</text>
            {!compact || h >= 2 * S ? <text x={x + 8} y={y + 34} className='hv-plan-info'>{in_.length ? `${in_.length} ${tr(lang, 'пристр.', 'app.')}${aan ? ` · ${aan} 💡` : ''}${temp ? ` · ${temp.waarde}${temp.eenheid}` : ''}` : tr(lang, 'порожньо', 'leeg')}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}
