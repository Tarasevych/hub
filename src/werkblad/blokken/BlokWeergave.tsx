// Werkblad «Blokken» — weergave van een Blok-boom (stroom B). Rekent via shared/werkblad-blokken-rekenen.ts (één bron van
// waarheid voor maten) en tekent absoluut gepositioneerde tegels. Selectie/slepen komen als props van stroom C en D.
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { ApparaatKlasse } from '../../../shared/werkblad-v3-types';
import type { Berekend, Blok, Knoop, KnoopId, Onderdeel } from '../../../shared/werkblad-blokken';
import { bereken, effectieveStijl, inhoudHoogte, kleurCss, leesVolgorde, leesbareTekst, tekeningPx, type RekenOpties } from '../../../shared/werkblad-blokken-rekenen';
import './blokken.css';

/** Wat de weergave over een register-item moet weten (naam, icoon). Doel/actie komt van de aanroeper. */
export interface ItemBeschrijving { naam: string; icoon?: (px: number) => ReactNode; uitleg?: string }

export interface BlokWeergaveProps {
  wortel: Blok;
  apparaat: ApparaatKlasse;
  /** Tweede argument: het onderdeel zelf (bv. icoon.vervang). */
  beschrijf: (itemId: string, onderdeel?: Onderdeel) => ItemBeschrijving;
  /** Vaste maat; ontbreekt → meten met ResizeObserver. hoogte 'inhoud' = meegroeien met de inhoud. */
  breedte?: number; hoogte?: number | 'inhoud';
  opties?: RekenOpties;
  taal?: 'uk' | 'nl';
  /** Gewone klik / Enter op een tegel (niet in bewerkmodus). */
  opActiveer?: (o: Onderdeel) => void;
  // ---- haken voor stroom C (selectie/eigenschappen) en D (slepen) ----
  bewerken?: boolean;
  geselecteerd?: ReadonlySet<KnoopId>;
  opSelecteer?: (id: KnoopId, uitbreiden: boolean) => void;
  opAanwijzerOmlaag?: (id: KnoopId, e: PointerEvent<HTMLElement>, kader: Berekend['kader']) => void;
  sleepGreep?: (knoop: Knoop, b: Berekend) => ReactNode;
  /** Extra laag (doelzones, invoeglijn) in hetzelfde coördinatenstelsel. */
  bovenlaag?: (r: Berekend[]) => ReactNode;
  opBerekend?: (r: Berekend[]) => void;
}

const SCHADUW = { geen: 'none', zacht: '0 2px 8px var(--shadow)', sterk: '0 8px 24px var(--shadow)' } as const;
const LABEL_GROOTTE = { mini: '0.68rem', klein: '0.75rem', normaal: 'var(--tekst-mini, 0.78rem)', groot: '0.9rem' } as const;

function vlak(wortel: Blok): Map<KnoopId, { knoop: Knoop; ouder: Blok }> {
  const m = new Map<KnoopId, { knoop: Knoop; ouder: Blok }>();
  const loop = (b: Blok) => { for (const k of b.kinderen || []) { m.set(k.id, { knoop: k, ouder: b }); if (k.soort === 'blok') loop(k); } };
  loop(wortel); return m;
}

function stijlVoor(u: { achtergrond?: string; tekstKleur?: string; randKleur?: string; randDikte?: number; vorm?: string; straal?: number; doorzichtigheid?: number; schaduw?: keyof typeof SCHADUW; icoonKleur?: string } | undefined): CSSProperties {
  if (!u) return {};
  const s: CSSProperties & Record<string, string | number | undefined> = {};
  const bg = kleurCss(u.achtergrond); if (bg) s['--blk-achtergrond'] = bg;
  const tk = leesbareTekst(u.achtergrond, u.tekstKleur); if (tk) s['--blk-tekst'] = tk;
  const rk = kleurCss(u.randKleur); if (rk) s['--blk-rand'] = rk;
  const ik = kleurCss(u.icoonKleur); if (ik) s['--blk-icoon'] = ik;
  if (typeof u.randDikte === 'number') s['--blk-randdikte'] = `${Math.max(0, Math.min(8, u.randDikte))}px`;
  if (u.vorm === 'rechthoek') s['--blk-straal'] = '0px';
  else if (u.vorm === 'cirkel' || u.vorm === 'pil') s['--blk-straal'] = '9999px';
  else if (typeof u.straal === 'number') s['--blk-straal'] = `${Math.max(0, Math.min(64, u.straal))}px`;
  if (typeof u.doorzichtigheid === 'number') s.opacity = Math.max(0.2, Math.min(1, u.doorzichtigheid));
  if (u.schaduw) s['--blk-schaduw'] = SCHADUW[u.schaduw];
  return s;
}

export function BlokWeergave(p: BlokWeergaveProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [gemeten, setGemeten] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (p.breedte !== undefined && typeof p.hoogte === 'number') return;
    const el = ref.current; if (!el) return;
    const meet = () => { const r = el.getBoundingClientRect(); setGemeten((o) => (o && o.w === r.width && o.h === r.height ? o : { w: r.width, h: r.height })); };
    meet();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(meet); ro.observe(el); return () => ro.disconnect();
  }, [p.breedte, p.hoogte]);
  const w = p.breedte ?? gemeten?.w ?? 0;
  const hBinnen = p.hoogte === 'inhoud' ? 0 : typeof p.hoogte === 'number' ? p.hoogte : gemeten?.h ?? 0;
  const r = useMemo(() => (w > 0 ? bereken(p.wortel, { w, h: hBinnen }, p.apparaat, p.opties) : []), [p.wortel, w, hBinnen, p.apparaat, p.opties]);
  const opB = p.opBerekend; useLayoutEffect(() => { opB?.(r); }, [r, opB]);
  const knopen = useMemo(() => vlak(p.wortel), [p.wortel]);
  const volgorde = useMemo(() => leesVolgorde(r.filter((b) => knopen.get(b.id)?.knoop.soort === 'onderdeel')), [r, knopen]);
  const blokken = r.filter((b) => knopen.get(b.id)?.knoop.soort === 'blok');
  const binnenrand = p.wortel.indeling?.binnenrand ?? 0;
  const hoogte = p.hoogte === 'inhoud' ? inhoudHoogte(r, binnenrand) : typeof p.hoogte === 'number' ? p.hoogte : undefined;
  const nl = p.taal === 'nl';

  const toets = (e: KeyboardEvent<HTMLElement>, o: Onderdeel) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (p.bewerken) p.opSelecteer?.(o.id, e.shiftKey); else p.opActiveer?.(o); }
  };

  return (
    <div ref={ref} className={`blk-wortel${p.bewerken ? ' blk-bewerken' : ''}`} role="group"
      aria-label={p.wortel.titel || (nl ? 'Blok' : 'Блок')} data-blok-id={p.wortel.id}
      style={{ ...stijlVoor(p.wortel.uiterlijk), height: hoogte, width: p.breedte }}>
      {/* Geneste blokken eerst (achtergrondvlakken), onderdelen daarna in visuele leesvolgorde = focusvolgorde. */}
      {blokken.map((b) => {
        const k = knopen.get(b.id)!.knoop as Blok;
        return (
          <div key={b.id} className={`blk-blok${p.geselecteerd?.has(b.id) ? ' blk-gekozen' : ''}`} role="group" aria-label={k.titel || (nl ? 'Blok' : 'Блок')}
            data-knoop-id={b.id} data-diepte={b.diepte}
            style={{ ...stijlVoor(k.uiterlijk), left: b.kader.x, top: b.kader.y, width: b.kader.w, height: b.kader.h }}
            onPointerDown={p.opAanwijzerOmlaag ? (e) => { if (e.target === e.currentTarget) p.opAanwijzerOmlaag!(b.id, e, b.kader); } : undefined}
            onClick={p.bewerken && p.opSelecteer ? (e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('blk-blok-titel')) p.opSelecteer!(b.id, e.shiftKey || e.metaKey || e.ctrlKey); } : undefined}>
            {k.titel && b.labelTonen ? <span className="blk-blok-titel">{k.titel}</span> : null}
            {p.bewerken && p.sleepGreep ? p.sleepGreep(k, b) : null}
          </div>
        );
      })}
      {volgorde.map((id) => {
        const b = r.find((x) => x.id === id)!; const { knoop, ouder } = knopen.get(id)!; const o = knoop as Onderdeel;
        const st = effectieveStijl(o, ouder); const besch = p.beschrijf(o.itemId, o);
        const naam = st.label.tekst?.trim() || besch.naam;
        const tip = besch.uitleg ? `${naam} — ${besch.uitleg}` : naam;
        const gekozen = p.geselecteerd?.has(id);
        const tek = tekeningPx(b.icoonPx);
        return (
          <button key={id} type="button" className={`blk-tegel blk-label-${st.label.plaats}${gekozen ? ' blk-gekozen' : ''}${b.labelTonen ? '' : ' blk-zonder-label'}${b.labelTonen && st.label.plaats !== 'rechts' && st.label.plaats !== 'links' && b.kader.h < b.icoonPx + 36 ? ' blk-krap' : ''} blk-icoon-${st.icoon.stijl || 'kader'}`}
            data-knoop-id={id} data-tip={tip} aria-label={naam} aria-pressed={p.bewerken ? Boolean(gekozen) : undefined}
            style={{ ...stijlVoor(st.uiterlijk), left: b.kader.x, top: b.kader.y, width: b.kader.w, height: b.kader.h, ['--blk-icoon-px' as string]: `${b.icoonPx}px`, ['--blk-tekening-px' as string]: `${tek}px`, fontSize: LABEL_GROOTTE[st.label.grootte || 'normaal'] }}
            onClick={(e) => { if (p.bewerken) p.opSelecteer?.(id, e.shiftKey || e.metaKey || e.ctrlKey); else p.opActiveer?.(o); }}
            onKeyDown={(e) => toets(e, o)}
            onPointerDown={p.opAanwijzerOmlaag ? (e) => p.opAanwijzerOmlaag!(id, e, b.kader) : undefined}>
            <span className="blk-icoon" aria-hidden="true">{besch.icoon?.(tek)}</span>
            {b.labelTonen ? <span className="blk-naam">{naam}</span> : null}
            {p.bewerken && p.sleepGreep ? p.sleepGreep(o, b) : null}
          </button>
        );
      })}
      {p.bovenlaag?.(r)}
    </div>
  );
}
export default BlokWeergave;
