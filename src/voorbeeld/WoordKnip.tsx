// Tekst afkappen op een WOORDGRENS in plaats van midden in een woord («Your AWS free plan is endin…», «woensda…»), met de
// volledige tekst als title bij aanwijzen (audit пошти 18.10.2026). De hoeveelheid tekst hangt af van de dichtheid
// (shared/mail-uittreksel.ts: minimum → bulky neemt toe). Meet met canvas.measureText (geen herberekening van de opmaak per
// woord) en past zich aan bij een andere breedte (ResizeObserver).
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { knipOpWoord, voorbeeldProfiel, type Dichtheid } from '../../shared/mail-uittreksel';
import { pasOpWoorden } from './voorbeeld-hulp';
import './voorbeeld.css';
export { pasOpWoorden };

let doek: CanvasRenderingContext2D | null | undefined;
const maat = (font: string, tekst: string) => {
  if (doek === undefined) { try { doek = document.createElement('canvas').getContext('2d'); } catch { doek = null; } }
  if (!doek) return tekst.length * 7;
  doek.font = font;
  return doek.measureText(tekst).width;
};

type Props = {
  tekst: string;
  dichtheid?: Dichtheid | string;
  /** Maximaal aantal tekens (anders uit het dichtheidsprofiel). */
  max?: number;
  /** Zichtbare regels (anders uit het dichtheidsprofiel). */
  regels?: number;
  /** false = alleen op tekens afkappen (voor tekst die inline naast andere tekst staat). */
  meten?: boolean;
  render?: (zichtbaar: string) => ReactNode;
  className?: string;
};

export default function WoordKnip({ tekst, dichtheid = 'normal', max, regels, meten = true, render, className = '' }: Props) {
  const profiel = voorbeeldProfiel(dichtheid);
  const r = Math.max(1, regels ?? profiel.regels);
  const volledig = useMemo(() => String(tekst ?? '').replace(/\s+/g, ' ').trim(), [tekst]);
  const basis = useMemo(() => knipOpWoord(volledig, max ?? profiel.tekens), [volledig, max, profiel.tekens]);
  const [zicht, setZicht] = useState(basis);
  const ref = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    setZicht(basis);
    const el = ref.current;
    if (!meten || !el || typeof ResizeObserver === 'undefined') return;
    const pas = () => {
      const w = el.clientWidth;
      if (!w) return;
      const cs = getComputedStyle(el);
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      // Bij meerdere regels is de ruimte ongeveer breedte × regels (woordterugloop kost wat; 0,92 als marge).
      const ruimte = r === 1 ? w - 1 : w * r * 0.92;
      setZicht(pasOpWoorden(basis, ruimte, (t) => maat(font, t)));
    };
    pas();
    const ro = new ResizeObserver(pas);
    ro.observe(el);
    return () => ro.disconnect();
  }, [basis, meten, r]);

  return (
    <span ref={ref} className={`woord-knip${meten ? ' woord-knip-gemeten' : ''} ${className}`.trim()} data-regels={r} style={{ ['--woord-knip-regels' as string]: r }}
      title={volledig || undefined}>
      {render ? render(zicht) : zicht}
    </span>
  );
}
