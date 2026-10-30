// Lichte grafieken in inline SVG/HTML (geen extra bibliotheek). Stijl volgens de dataviz-regels: dunne lijnen (2 px), recessief raster,
// één as, vaste volgorde van serie-kleuren (--ov-s1…), tekst in tekstkleuren (niet in de serie-kleur), crosshair + tooltip bij hover en
// toetsenbord (pijlen), een tabelweergave als alternatief en een legenda zodra er meer dan één reeks is.
import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Lang, Punt } from './types';
import { tr } from './types';

const nf = (lang: Lang) => new Intl.NumberFormat(lang === 'uk' ? 'uk-UA' : 'nl-BE');
export const getal = (lang: Lang, n: number) => nf(lang).format(n);

function mooiMax(max: number): number {
  if (max <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= max) return m * mag;
  return max;
}
const label = (lang: Lang, t: number, stap: 'uur' | 'dag', kort = false) => {
  const d = new Date(t);
  const loc = lang === 'uk' ? 'uk-UA' : 'nl-BE';
  if (stap === 'uur') return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  return kort ? d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' }) : d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
};

const W = 600; const H = 170; const PAD_T = 8; const PAD_B = 6;

/** `meting`: de reeks is een momentwaarde (online, sessies…) en geen telling per periode: de legenda toont de laatste waarde, geen som, en er is geen storingsreeks. */
export function Gebied({ punten, lang, stap, naamN, naamF, meting = false }: { punten: Punt[]; lang: Lang; stap: 'uur' | 'dag'; naamN: string; naamF?: string; meting?: boolean }) {
  const [actief, setActief] = useState<number | null>(null);
  const [tabel, setTabel] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  const n = punten.length;
  const max = useMemo(() => mooiMax(Math.max(1, ...punten.map((p) => p.n))), [punten]);
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
  const lijn = punten.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.n).toFixed(1)}`).join(' ');
  const vlak = `${lijn} L${x(n - 1).toFixed(1)} ${H - PAD_B} L${x(0).toFixed(1)} ${H - PAD_B} Z`;
  const staafBreed = Math.max(3, Math.min(14, (W / Math.max(1, n)) * 0.5));
  const totaalN = meting ? (punten[punten.length - 1]?.n ?? 0) : punten.reduce((a, p) => a + p.n, 0); const totaalF = punten.reduce((a, p) => a + p.f, 0);
  const naarIndex = (e: PointerEvent) => {
    const r = wrap.current?.getBoundingClientRect(); if (!r || !r.width) return;
    setActief(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
  };
  const toets = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActief((a) => Math.max(0, (a ?? n) - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setActief((a) => Math.min(n - 1, (a ?? -1) + 1)); }
    else if (e.key === 'Escape') setActief(null);
  };
  const a = actief === null ? null : punten[actief];
  const heeftF = !meting && !!naamF;
  const samenvatting = heeftF ? `${naamN}: ${getal(lang, totaalN)}; ${naamF}: ${getal(lang, totaalF)}` : `${naamN}: ${getal(lang, totaalN)}`;
  return (
    <div className="ov-chart">
      <div className="ov-chart-leg" aria-hidden={false}>
        <span><i className="ov-sw ov-sw-1" />{naamN} <b>{getal(lang, totaalN)}</b></span>
        {heeftF && <span><i className="ov-sw ov-sw-bad" />{naamF} <b>{getal(lang, totaalF)}</b></span>}
        <button type="button" className="ov-link" onClick={() => setTabel((v) => !v)} aria-pressed={tabel}>{tabel ? tr(lang, 'Графік', 'Grafiek') : tr(lang, 'Таблиця', 'Tabel')}</button>
      </div>
      {tabel ? (
        <div className="ov-tabel-wrap" tabIndex={0}>
          <table className="ov-tabel">
            <thead><tr><th>{stap === 'uur' ? tr(lang, 'Година', 'Uur') : tr(lang, 'День', 'Dag')}</th><th>{naamN}</th>{heeftF && <th>{naamF}</th>}</tr></thead>
            <tbody>{punten.slice().reverse().map((p) => <tr key={p.t}><td>{label(lang, p.t, stap)}</td><td>{getal(lang, p.n)}</td>{heeftF && <td>{getal(lang, p.f)}</td>}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div
          ref={wrap} className="ov-plot" tabIndex={0} role="img" aria-label={samenvatting} aria-describedby={`${id}-tip`}
          onPointerMove={naarIndex} onPointerDown={naarIndex} onPointerLeave={() => setActief(null)} onKeyDown={toets} onBlur={() => setActief(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="ov-svg" aria-hidden="true">
            {[0, 0.5, 1].map((f) => <line key={f} x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} className="ov-raster" vectorEffect="non-scaling-stroke" />)}
            {heeftF && punten.map((p, i) => p.f > 0 && <rect key={p.t} x={x(i) - staafBreed / 2} width={staafBreed} y={y(p.f)} height={Math.max(2, H - PAD_B - y(p.f))} rx="3" className="ov-staaf-bad" />)}
            <path d={vlak} className="ov-vlak" />
            <path d={lijn} className="ov-lijn" vectorEffect="non-scaling-stroke" />
            {actief !== null && <line x1={x(actief)} x2={x(actief)} y1="0" y2={H} className="ov-cross" vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="ov-yas" aria-hidden="true"><span>{getal(lang, max)}</span><span>{getal(lang, max / 2)}</span><span>0</span></div>
          {a && actief !== null && (
            <div className="ov-tip" id={`${id}-tip`} role="status" style={{ left: `${n <= 1 ? 50 : (actief / (n - 1)) * 100}%` }} data-flip={actief > n * 0.6 ? 'l' : 'r'}>
              <strong>{label(lang, a.t, stap)}</strong>
              <span><i className="ov-sw ov-sw-1" />{naamN}: {getal(lang, a.n)}</span>
              {heeftF && <span><i className="ov-sw ov-sw-bad" />{naamF}: {getal(lang, a.f)}</span>}
            </div>
          )}
          <div className="ov-xas" aria-hidden="true">
            <span>{label(lang, punten[0]?.t ?? 0, stap, true)}</span>
            <span>{label(lang, punten[Math.floor(n / 2)]?.t ?? 0, stap, true)}</span>
            <span>{label(lang, punten[n - 1]?.t ?? 0, stap, true)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function Spark({ punten, kleur = 'var(--ov-s1)', hoogte = 36, label: aria }: { punten: number[]; kleur?: string; hoogte?: number; label?: string }) {
  const w = 120; const n = punten.length; const max = Math.max(1, ...punten);
  if (n < 2) return null;
  const d = punten.map((v, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * w).toFixed(1)} ${(hoogte - 3 - (v / max) * (hoogte - 6)).toFixed(1)}`).join(' ');
  return (
    <svg className="ov-spark" viewBox={`0 0 ${w} ${hoogte}`} preserveAspectRatio="none" role="img" aria-label={aria} style={{ height: hoogte }}>
      <path d={d} fill="none" stroke={kleur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Staven({ rijen, lang, kleur = 'var(--ov-s1)', leeg }: { rijen: Array<{ sleutel?: string; naam: string; n: number }>; lang: Lang; kleur?: string; leeg: string }) {
  const max = Math.max(1, ...rijen.map((r) => r.n));
  if (!rijen.length) return <p className="ov-leeg">{leeg}</p>;
  return (
    <ul className="ov-staven">
      {rijen.map((r) => (
        <li key={r.sleutel ?? r.naam}>
          <span className="ov-staven-naam" title={r.naam}>{r.naam}</span>
          <span className="ov-staven-baan"><span className="ov-staven-vul" style={{ width: `${Math.max(3, (r.n / max) * 100)}%`, background: kleur }} /></span>
          <b>{getal(lang, r.n)}</b>
        </li>
      ))}
    </ul>
  );
}

const SERIES = ['var(--ov-s1)', 'var(--ov-s2)', 'var(--ov-s3)', 'var(--ov-s4)', 'var(--ov-s5)'];
export function Donut({ delen, lang, leeg, midden }: { delen: Array<{ naam: string; n: number }>; lang: Lang; leeg: string; midden?: string }) {
  const totaal = delen.reduce((a, d) => a + d.n, 0);
  if (!totaal) return <p className="ov-leeg">{leeg}</p>;
  // meer dan 5 delen: de rest wordt «Інше / Overig» (nooit een zesde kleur verzinnen)
  const kop = delen.slice(0, 5); const rest = delen.slice(5).reduce((a, d) => a + d.n, 0);
  const lijst = rest ? [...kop, { naam: tr(lang, 'Інше', 'Overig'), n: rest }] : kop;
  const R = 40; const C = 2 * Math.PI * R; let acc = 0;
  return (
    <div className="ov-donut">
      <svg viewBox="0 0 100 100" role="img" aria-label={lijst.map((d) => `${d.naam}: ${d.n}`).join(', ')}>
        <circle cx="50" cy="50" r={R} className="ov-donut-baan" />
        {lijst.map((d, i) => {
          const len = (d.n / totaal) * C; const gap = lijst.length > 1 ? 2 : 0;
          const el = <circle key={d.naam} cx="50" cy="50" r={R} className="ov-donut-deel" style={{ stroke: i < 5 ? SERIES[i] : 'var(--ov-muted)' }} strokeDasharray={`${Math.max(0.5, len - gap)} ${C}`} strokeDashoffset={-acc} />;
          acc += len; return el;
        })}
        <text x="50" y="52" textAnchor="middle" className="ov-donut-getal">{midden ?? getal(lang, totaal)}</text>
      </svg>
      <ul className="ov-donut-leg">
        {lijst.map((d, i) => <li key={d.naam}><i className="ov-sw" style={{ background: i < 5 ? SERIES[i] : 'var(--ov-muted)' }} /><span title={d.naam}>{d.naam}</span><b>{getal(lang, d.n)}</b></li>)}
      </ul>
    </div>
  );
}
