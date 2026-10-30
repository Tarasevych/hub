// Werkblad «Blokken» — eigenschappenpaneel (stroom C). Zijpaneel op de computer, onderblad op de telefoon.
// Tabbladen «Розмір», «Вигляд», «Розташування», «Пристрої»; elke optie heeft een (?)-uitleg en «Скинути».
// Het paneel bewaart zelf niets: het geeft een nieuwe boom aan onWijzig. Gebruik useBlokkenBewerker voor
// live voorbeeld + vertraagd bewaren + ongedaan/opnieuw + voortgang («Зберігаю…» → «Збережено» / fout + «Спробувати знову»).
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as RKeyboardEvent } from 'react';
import {
  BLOKKEN_LIMIETEN, MAAT_AUTO, VOORINSTELLINGEN,
  type Blok, type BlokModus, type Icoon, type Kleur, type Knoop, type KnoopId, type Label, type Maat, type Uitlijning, type VoorinstellingId,
} from '../../../shared/werkblad-blokken';
import type { ApparaatKlasse } from '../../../shared/werkblad-v3-types';
import { tekst, uitleg, type Taal, type TekstSleutel } from '../../../shared/werkblad-blokken-teksten';
import * as L from './EigenschappenLogica';
import './eigenschappen.css';

export type BewaarStaat = { staat: 'rust' } | { staat: 'bezig' } | { staat: 'bewaard'; melding?: string } | { staat: 'mislukt'; fout?: string };

export interface EigenschappenPaneelProps {
  wortel: Blok;
  geselecteerd: KnoopId | null;
  onWijzig: (nieuw: Blok, omschrijving: string, pad?: string) => void;
  taal?: Taal;
  /** Voortgang van het bewaren (uit useBlokkenBewerker). */
  bewaarStaat?: BewaarStaat;
  onOpnieuwProberen?: () => void;
  kanOngedaan?: boolean; kanOpnieuw?: boolean; onOngedaan?: () => void; onOpnieuw?: () => void;
  /** «Дозволити накладання» — staat nog niet in het contract; de integrator bewaart het (voorstel: indeling.overlap). */
  overlapToegestaan?: boolean; onOverlap?: (aan: boolean) => void;
  onSluiten?: () => void;
  /** Gewone naam van een register-item, voor de kop en het voorbeeld. */
  naamVan?: (itemId: string) => string;
  /** Themakleuren (hex) voor de contrastcontrole als een kleur «Як у темі» is; standaard uit --panel/--text. */
  themaKleuren?: { achtergrond: string; tekst: string; icoon?: string };
  /** 'zij' (computer), 'blad' (telefoon) of 'auto' (CSS beslist bij ≤700px). */
  weergave?: 'zij' | 'blad' | 'auto';
}

type Tab = 'maat' | 'uiterlijk' | 'indeling' | 'apparaten';
const TABS: Array<{ id: Tab; s: TekstSleutel }> = [
  { id: 'maat', s: 'tabMaat' }, { id: 'uiterlijk', s: 'tabUiterlijk' }, { id: 'indeling', s: 'tabIndeling' }, { id: 'apparaten', s: 'tabApparaten' },
];
const VOOR_IDS: VoorinstellingId[] = ['raster-automatisch', 'grote-iconen', 'compacte-rij', 'kolom', 'vrij'];

// ------------------------------------------------------------------ (?)-knop
export function EigenschappenHulp({ s, taal }: { s: TekstSleutel; taal: Taal }) {
  const [open, zetOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const t = uitleg(s, taal);
  useEffect(() => {
    if (!open) return;
    const klik = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) zetOpen(false); };
    document.addEventListener('pointerdown', klik);
    return () => document.removeEventListener('pointerdown', klik);
  }, [open]);
  if (!t) return null;
  return (
    <span className="eig-hulp" ref={ref}>
      <button type="button" className="eig-hulp-knop" aria-label={`${tekst('hulpOpen', taal)}: ${tekst(s, taal)}`} aria-expanded={open} aria-controls={id}
        onClick={() => zetOpen((o) => !o)} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); zetOpen(false); } }}>?</button>
      {open && <span id={id} role="note" className="eig-hulp-tekst">{t}</span>}
    </span>
  );
}

function Rij({ s, taal, children, pad, knoop, onHerstel, uitgeschakeld, labelVoor }: {
  s: TekstSleutel; taal: Taal; children: ReactNode; pad?: string | string[]; knoop?: Knoop; onHerstel?: (pad: string[]) => void; uitgeschakeld?: boolean; labelVoor?: string;
}) {
  const paden = pad ? (Array.isArray(pad) ? pad : [pad]) : [];
  const standaard = !knoop || paden.every((p) => L.isStandaard(knoop, p));
  return (
    <div className="eig-rij" data-pad={paden.join(',') || undefined}>
      <div className="eig-rij-kop">
        {labelVoor ? <label htmlFor={labelVoor} className="eig-naam">{tekst(s, taal)}</label> : <span className="eig-naam">{tekst(s, taal)}</span>}
        <EigenschappenHulp s={s} taal={taal} />
        {paden.length > 0 && onHerstel && (
          <button type="button" className="eig-herstel" disabled={standaard || uitgeschakeld} onClick={() => onHerstel(paden)}
            aria-label={`${tekst('herstel', taal)}: ${tekst(s, taal)}`} title={uitleg('herstel', taal)}>{tekst('herstel', taal)}</button>
        )}
      </div>
      <div className="eig-rij-inhoud">{children}</div>
    </div>
  );
}

function Keuze<T extends string>({ waarde, opties, onKies, taal, naam, uit }: { waarde: T; opties: Array<{ w: T; s: TekstSleutel }>; onKies: (w: T) => void; taal: Taal; naam: string; uit?: boolean }) {
  return (
    <div className="eig-keuze" role="radiogroup" aria-label={naam}>
      {opties.map((o) => (
        <button key={o.w} type="button" role="radio" aria-checked={waarde === o.w} disabled={uit} className={waarde === o.w ? 'gekozen' : ''}
          tabIndex={waarde === o.w ? 0 : -1}
          onKeyDown={(e) => {
            const i = opties.findIndex((x) => x.w === waarde);
            const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (!d) return; e.preventDefault();
            const n = opties[(i + d + opties.length) % opties.length]; onKies(n.w);
            const ouder = (e.currentTarget.parentElement as HTMLElement); requestAnimationFrame(() => (ouder.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
          }}
          onClick={() => onKies(o.w)}>{tekst(o.s, taal)}</button>
      ))}
    </div>
  );
}

function Getal({ id, waarde, min, max, onWaarde, eenheid, uit, leeg }: { id?: string; waarde: number | undefined; min: number; max: number; onWaarde: (n: number | undefined) => void; eenheid?: string; uit?: boolean; leeg?: boolean }) {
  const [t, zetT] = useState(waarde === undefined ? '' : String(waarde));
  useEffect(() => { zetT(waarde === undefined ? '' : String(waarde)); }, [waarde]);
  const leg = (s: string) => {
    if (s.trim() === '') { if (leeg) onWaarde(undefined); return; }
    const n = Number(s.replace(',', '.')); if (!Number.isFinite(n)) return;
    onWaarde(Math.min(max, Math.max(min, Math.round(n))));
  };
  return (
    <span className="eig-getal">
      <input id={id} type="number" inputMode="numeric" min={min} max={max} value={t} disabled={uit}
        onChange={(e) => { zetT(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && n >= min && n <= max) leg(e.target.value); }}
        onBlur={() => leg(t)} onKeyDown={(e) => { if (e.key === 'Enter') leg(t); }} />
      {eenheid && <span className="eig-eenheid">{eenheid}</span>}
    </span>
  );
}

function MaatVeld({ maat, onMaat, taal, as, uit, naam }: { maat: Maat; onMaat: (m: Maat) => void; taal: Taal; as: 'b' | 'h'; uit?: boolean; naam: string }) {
  const id = useId();
  const soorten: Array<{ w: Maat['soort']; s: TekstSleutel }> = [{ w: 'auto', s: 'maatAuto' }, { w: 'px', s: 'maatPx' }, { w: 'procent', s: 'maatProcent' }, { w: 'deel', s: 'maatDeel' }];
  const kies = (s: Maat['soort']) => {
    if (s === maat.soort) return;
    onMaat(s === 'auto' ? MAAT_AUTO : L.begrensMaat({ soort: s, waarde: s === 'px' ? 96 : s === 'procent' ? 50 : 1 } as Maat));
  };
  const eenheid = maat.soort === 'px' ? tekst('eenheidPx', taal) : maat.soort === 'procent' ? tekst(as === 'b' ? 'eenheidProcent' : 'eenheidProcentH', taal) : tekst('eenheidDeel', taal);
  const [min, max] = maat.soort === 'px' ? [BLOKKEN_LIMIETEN.minPx, BLOKKEN_LIMIETEN.maxPx] : maat.soort === 'procent' ? [1, 100] : [1, 12];
  return (
    <div className="eig-maat">
      <Keuze waarde={maat.soort} opties={soorten} onKies={kies} taal={taal} naam={naam} uit={uit} />
      {maat.soort !== 'auto' && <Getal id={id} waarde={maat.waarde} min={min} max={max} eenheid={eenheid} uit={uit} onWaarde={(n) => n !== undefined && onMaat(L.begrensMaat({ soort: maat.soort, waarde: n } as Maat))} />}
    </div>
  );
}

function leesCssKleur(naam: string, terug: string): string {
  if (typeof document === 'undefined') return terug;
  const v = getComputedStyle(document.documentElement).getPropertyValue(naam).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : terug;
}

function KleurVeld({ waarde, onKleur, taal, naam, uit }: { waarde: Kleur | undefined; onKleur: (k: Kleur | undefined) => void; taal: Taal; naam: string; uit?: boolean }) {
  const eigen = !!waarde && waarde.startsWith('#');
  const [hex, zetHex] = useState<string>(eigen ? waarde! : '#2f6f73');
  useEffect(() => { if (waarde?.startsWith('#')) zetHex(waarde); }, [waarde]);
  return (
    <div className="eig-kleur" role="group" aria-label={naam}>
      <span className="eig-kleur-naam">{naam}</span>
      <Keuze waarde={eigen ? 'eigen' : 'thema'} opties={[{ w: 'thema', s: 'kleurThema' }, { w: 'eigen', s: 'kleurEigen' }]} taal={taal} naam={naam} uit={uit}
        onKies={(w) => onKleur(w === 'thema' ? undefined : (hex as Kleur))} />
      {eigen && (
        <span className="eig-kleur-kies">
          <input type="color" value={hex} disabled={uit} aria-label={`${naam}: ${tekst('kleurEigen', taal)}`} onChange={(e) => { zetHex(e.target.value); onKleur(e.target.value as Kleur); }} />
          <input type="text" className="eig-hex" value={hex} disabled={uit} maxLength={7} aria-label={`${naam}: #rrggbb`} spellCheck={false}
            onChange={(e) => { zetHex(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onKleur(e.target.value.toLowerCase() as Kleur); }} />
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ paneel
export function EigenschappenPaneel(p: EigenschappenPaneelProps) {
  const taal = p.taal ?? 'uk';
  const [tab, zetTab] = useState<Tab>('maat');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const gevonden = p.geselecteerd ? L.zoekKnoop(p.wortel, p.geselecteerd) : null;
  const knoop = gevonden?.knoop ?? null;
  const ouder = gevonden?.ouder ?? null;
  const uit = !!knoop?.vergrendeld;
  const naam = knoop ? (knoop.soort === 'blok' ? (knoop.titel || tekst('soortBlok', taal)) : (knoop.label?.tekst || p.naamVan?.(knoop.itemId) || knoop.itemId)) : '';

  // doorlopend = schuif/getal/typen: snelle opeenvolgende wijzigingen worden één stap in de geschiedenis.
  const pas = useCallback((pad: string, waarde: unknown, omschrijving?: string, doorlopend = typeof waarde === 'number') => {
    if (!knoop) return;
    p.onWijzig(L.wijzigKnoop(p.wortel, knoop.id, (k) => L.zetPad(k, pad, waarde)), omschrijving ?? pad, doorlopend ? pad : undefined);
  }, [knoop, p]);
  const herstel = useCallback((paden: string[]) => {
    if (!knoop) return;
    p.onWijzig(L.wijzigKnoop(p.wortel, knoop.id, (k) => paden.reduce((a, x) => L.herstelPad(a, x), k)), `${tekst('herstel', taal)}: ${paden.join(', ')}`);
  }, [knoop, p, taal]);

  const thema = p.themaKleuren ?? { achtergrond: leesCssKleur('--panel', '#ffffff'), tekst: leesCssKleur('--text', '#17212b'), icoon: leesCssKleur('--accent', '#2f6f73') };
  const u = knoop?.uiterlijk ?? {};
  const echt = (k: Kleur | undefined, terug: string) => (k && k.startsWith('#') ? k : terug);
  const cTekst = L.contrastVerhouding(echt(u.tekstKleur, thema.tekst), echt(u.achtergrond, thema.achtergrond));
  const cIcoon = L.contrastVerhouding(echt(u.icoonKleur, thema.icoon ?? thema.tekst), echt(u.achtergrond, thema.achtergrond));
  const contrastRelevant = !!(u.tekstKleur || u.achtergrond || u.icoonKleur);
  const laagste = Math.min(cTekst ?? 21, cIcoon ?? 21);

  const tabToets = (e: RKeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const n = e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : d ? TABS[(i + d + TABS.length) % TABS.length] : null;
    if (!n) return; e.preventDefault(); zetTab(n.id); tabRefs.current[n.id]?.focus();
  };

  // Ctrl+Z / Ctrl+Shift+Z: in het paneel én als de focus «nergens» is (bv. na een knop die uitgeschakeld werd).
  const paneelRef = useRef<HTMLElement>(null);
  const toetsRef = useRef(p); toetsRef.current = p;
  useEffect(() => {
    const op = (e: KeyboardEvent) => {
      const doel = e.target as HTMLElement | null;
      const binnen = !!doel && (doel === document.body || doel === document.documentElement || !!paneelRef.current?.contains(doel));
      if (!binnen || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || doel?.matches('input[type=text]')) return;
      const q = toetsRef.current; e.preventDefault();
      if (e.shiftKey) { if (q.kanOpnieuw) q.onOpnieuw?.(); } else if (q.kanOngedaan) q.onOngedaan?.();
    };
    document.addEventListener('keydown', op);
    return () => document.removeEventListener('keydown', op);
  }, []);
  const paneelToets = (e: RKeyboardEvent) => {
    if (e.key === 'Escape' && p.onSluiten && !e.defaultPrevented) { e.preventDefault(); p.onSluiten(); }
  };

  const klasse = `eig-paneel eig-${p.weergave ?? 'auto'}`;
  if (!knoop) {
    return <aside ref={paneelRef} className={klasse} aria-label={tekst('paneelTitel', taal)} onKeyDown={paneelToets}><div className="eig-leeg">{tekst('geenSelectie', taal)}</div></aside>;
  }
  const o = knoop.soort === 'onderdeel' ? knoop : null;
  const b = knoop.soort === 'blok' ? knoop : null;
  const std = ouder?.standaardOnderdeel;
  const icoon: Icoon = o?.icoon ?? std?.icoon ?? { grootte: MAAT_AUTO };
  const label: Label = o?.label ?? { tonen: 'auto', plaats: 'onder', ...std?.label } as Label;
  const ouderModus = ouder?.indeling.modus;

  return (
    <aside ref={paneelRef} className={klasse} aria-label={`${tekst('paneelTitel', taal)}: ${naam}`} onKeyDown={paneelToets} data-knoop={knoop.id}>
      <header className="eig-kop">
        <div className="eig-titel">
          <h2>{tekst('paneelTitel', taal)}</h2>
          <EigenschappenHulp s="paneelTitel" taal={taal} />
        </div>
        <div className="eig-ondertitel"><span className="eig-soort">{tekst(b ? 'soortBlok' : 'soortOnderdeel', taal)}</span> {naam}</div>
        {p.onSluiten && <button type="button" className="eig-sluit" onClick={p.onSluiten} aria-label={tekst('sluiten', taal)}>×</button>}
      </header>

      <div className="eig-scroll">
        {/* live voorbeeld */}
        <div className="eig-voorbeeld" aria-hidden="true">
          <Voorbeeld knoop={knoop} icoon={icoon} label={label} naam={naam} />
        </div>

        <label className="eig-slot">
          <input type="checkbox" checked={!!knoop.vergrendeld} onChange={(e) => pas('vergrendeld', e.target.checked || undefined, tekst('vergrendel', taal))} />
          <span>{tekst('vergrendel', taal)}</span>
          <EigenschappenHulp s="vergrendel" taal={taal} />
        </label>
        {uit && <p className="eig-melding">{tekst('vergrendeld', taal)}</p>}

        <section className="eig-voorinstellingen" aria-label={tekst('voorinstellingen', taal)}>
          <div className="eig-rij-kop"><span className="eig-naam">{tekst('voorinstellingen', taal)}</span><EigenschappenHulp s="voorinstellingen" taal={taal} /></div>
          {b ? (
            <div className="eig-knoppen">
              {VOOR_IDS.map((v) => (
                <button key={v} type="button" disabled={uit} data-voorinstelling={v}
                  onClick={() => p.onWijzig(L.wijzigKnoop(p.wortel, b.id, (k) => L.pasVoorinstellingToe(k as Blok, v)), `${tekst('voorinstellingToegepast', taal)}: ${VOORINSTELLINGEN[v][taal]}`, 'voorinstelling')}>
                  {VOORINSTELLINGEN[v][taal]}
                </button>
              ))}
            </div>
          ) : <p className="eig-uitleg">{tekst('voorinstellingAlleenBlok', taal)}</p>}
        </section>

        <div className="eig-tabs" role="tablist" aria-label={tekst('paneelTitel', taal)} onKeyDown={tabToets}>
          {TABS.map((t) => (
            <button key={t.id} ref={(el) => { tabRefs.current[t.id] = el; }} type="button" role="tab" id={`eig-tab-${t.id}`} aria-controls={`eig-vak-${t.id}`}
              aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onClick={() => zetTab(t.id)}>{tekst(t.s, taal)}</button>
          ))}
        </div>

        <div className="eig-vak" role="tabpanel" id={`eig-vak-${tab}`} aria-labelledby={`eig-tab-${tab}`}>
          {tab === 'maat' && <>
            <Rij s="breedte" taal={taal} pad="afmeting.breedte" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
              <MaatVeld maat={knoop.afmeting.breedte} onMaat={(m) => pas('afmeting.breedte', m, tekst('breedte', taal))} taal={taal} as="b" uit={uit} naam={tekst('breedte', taal)} />
            </Rij>
            <Rij s="hoogte" taal={taal} pad="afmeting.hoogte" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
              <MaatVeld maat={knoop.afmeting.hoogte} onMaat={(m) => pas('afmeting.hoogte', m, tekst('hoogte', taal))} taal={taal} as="h" uit={uit} naam={tekst('hoogte', taal)} />
            </Rij>
            <Rij s="grenzen" taal={taal} pad={['afmeting.minBreedte', 'afmeting.maxBreedte', 'afmeting.minHoogte', 'afmeting.maxHoogte']} knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
              <div className="eig-grenzen">
                {(['minBreedte', 'maxBreedte', 'minHoogte', 'maxHoogte'] as const).map((g) => {
                  const id = `eig-${g}`;
                  return <label key={g} htmlFor={id}><span>{tekst(g, taal)}</span>
                    <Getal id={id} leeg waarde={knoop.afmeting[g]} min={BLOKKEN_LIMIETEN.minPx} max={BLOKKEN_LIMIETEN.maxPx} eenheid={tekst('eenheidPx', taal)} uit={uit} onWaarde={(n) => pas(`afmeting.${g}`, n, tekst(g, taal))} /></label>;
                })}
              </div>
            </Rij>
            {ouderModus === 'raster' && (
              <Rij s="rasterSpan" taal={taal} pad="rasterSpan" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                <div className="eig-grenzen">
                  <label><span>{tekst('spanKolommen', taal)}</span><Getal waarde={knoop.rasterSpan?.kolommen ?? 1} min={1} max={12} uit={uit} onWaarde={(n) => pas('rasterSpan', { kolommen: n ?? 1, rijen: knoop.rasterSpan?.rijen ?? 1 }, tekst('rasterSpan', taal), true)} /></label>
                  <label><span>{tekst('spanRijen', taal)}</span><Getal waarde={knoop.rasterSpan?.rijen ?? 1} min={1} max={12} uit={uit} onWaarde={(n) => pas('rasterSpan', { kolommen: knoop.rasterSpan?.kolommen ?? 1, rijen: n ?? 1 }, tekst('rasterSpan', taal), true)} /></label>
                </div>
              </Rij>
            )}
            {o && (
              <Rij s="icoonGrootte" taal={taal} pad="icoon.grootte" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                <Keuze waarde={icoon.grootte.soort === 'px' ? 'px' : 'auto'} opties={[{ w: 'auto', s: 'maatAuto' }, { w: 'px', s: 'maatPx' }]} taal={taal} naam={tekst('icoonGrootte', taal)} uit={uit}
                  onKies={(w) => pas('icoon', { ...icoon, grootte: w === 'auto' ? MAAT_AUTO : { soort: 'px', waarde: 48 } }, tekst('icoonGrootte', taal))} />
                {icoon.grootte.soort === 'px' && (
                  <span className="eig-schuif">
                    <input type="range" min={BLOKKEN_LIMIETEN.minIcoonPx} max={128} value={icoon.grootte.waarde} disabled={uit} aria-label={tekst('icoonGrootte', taal)}
                      onChange={(e) => pas('icoon', { ...icoon, grootte: { soort: 'px', waarde: Number(e.target.value) } }, tekst('icoonGrootte', taal), true)} />
                    <Getal waarde={icoon.grootte.waarde} min={BLOKKEN_LIMIETEN.minIcoonPx} max={BLOKKEN_LIMIETEN.maxIcoonPx} eenheid={tekst('eenheidPx', taal)} uit={uit}
                      onWaarde={(n) => n !== undefined && pas('icoon', { ...icoon, grootte: { soort: 'px', waarde: n } }, tekst('icoonGrootte', taal), true)} />
                  </span>
                )}
              </Rij>
            )}
          </>}

          {tab === 'uiterlijk' && <>
            <Rij s="kleuren" taal={taal} pad={['uiterlijk.achtergrond', 'uiterlijk.icoonKleur', 'uiterlijk.tekstKleur', 'uiterlijk.randKleur']} knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
              {(['achtergrond', 'icoonKleur', 'tekstKleur', 'randKleur'] as const).map((k) => (
                <KleurVeld key={k} waarde={u[k]} naam={tekst(k, taal)} taal={taal} uit={uit} onKleur={(w) => pas(`uiterlijk.${k}`, w, tekst(k, taal), !!w)} />
              ))}
              {contrastRelevant && (
                <p className={`eig-contrast ${laagste < L.CONTRAST_MIN ? 'laag' : 'goed'}`} role={laagste < L.CONTRAST_MIN ? 'alert' : 'status'}>
                  {tekst(laagste < L.CONTRAST_MIN ? 'contrastLaag' : 'contrastGoed', taal, { v: laagste.toFixed(1).replace('.', ',') })}
                </p>
              )}
            </Rij>
            {o && <>
              <Rij s="icoonStijl" taal={taal} pad="icoon.stijl" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                <Keuze waarde={icoon.stijl ?? 'kader'} opties={[{ w: 'kader', s: 'stijlKader' }, { w: 'los', s: 'stijlLos' }, { w: 'rond', s: 'stijlRond' }]} taal={taal} naam={tekst('icoonStijl', taal)} uit={uit}
                  onKies={(w) => pas('icoon', { ...icoon, stijl: w }, tekst('icoonStijl', taal))} />
              </Rij>
              <Rij s="label" taal={taal} pad="label" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                <span className="eig-sub">{tekst('labelTonen', taal)}</span>
                <Keuze waarde={label.tonen} opties={[{ w: 'auto', s: 'labelAuto' }, { w: 'ja', s: 'labelJa' }, { w: 'nee', s: 'labelNee' }]} taal={taal} naam={tekst('labelTonen', taal)} uit={uit}
                  onKies={(w) => pas('label', { ...label, tonen: w }, tekst('labelTonen', taal))} />
                <span className="eig-sub">{tekst('labelPlaats', taal)}</span>
                <Keuze waarde={label.plaats} opties={[{ w: 'onder', s: 'plaatsOnder' }, { w: 'rechts', s: 'plaatsRechts' }, { w: 'boven', s: 'plaatsBoven' }, { w: 'links', s: 'plaatsLinks' }]} taal={taal} naam={tekst('labelPlaats', taal)} uit={uit}
                  onKies={(w) => pas('label', { ...label, plaats: w }, tekst('labelPlaats', taal))} />
                <span className="eig-sub">{tekst('labelGrootte', taal)}</span>
                <Keuze waarde={label.grootte ?? 'normaal'} opties={[{ w: 'mini', s: 'grootteMini' }, { w: 'klein', s: 'grootteKlein' }, { w: 'normaal', s: 'grootteNormaal' }, { w: 'groot', s: 'grootteGroot' }]} taal={taal} naam={tekst('labelGrootte', taal)} uit={uit}
                  onKies={(w) => pas('label', { ...label, grootte: w }, tekst('labelGrootte', taal))} />
                <label className="eig-sub" htmlFor="eig-labeltekst">{tekst('labelTekst', taal)} <EigenschappenHulp s="labelTekst" taal={taal} /></label>
                <input id="eig-labeltekst" type="text" maxLength={60} disabled={uit} value={label.tekst ?? ''} placeholder={p.naamVan?.(o.itemId) ?? ''}
                  onChange={(e) => pas('label', { ...label, tekst: e.target.value.slice(0, 60) || undefined }, tekst('labelTekst', taal), true)} />
              </Rij>
            </>}
            <Rij s="vorm" taal={taal} pad={['uiterlijk.vorm', 'uiterlijk.straal']} knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
              <Keuze waarde={u.vorm ?? 'afgerond'} opties={[{ w: 'rechthoek', s: 'vormRechthoek' }, { w: 'afgerond', s: 'vormAfgerond' }, { w: 'cirkel', s: 'vormCirkel' }, { w: 'pil', s: 'vormPil' }]} taal={taal} naam={tekst('vorm', taal)} uit={uit}
                onKies={(w) => pas('uiterlijk.vorm', w, tekst('vorm', taal))} />
              {(u.vorm ?? 'afgerond') === 'afgerond' && (
                <label className="eig-sub-rij"><span>{tekst('straal', taal)}</span><EigenschappenHulp s="straal" taal={taal} />
                  <Getal waarde={u.straal ?? 10} min={0} max={BLOKKEN_LIMIETEN.maxStraal} eenheid={tekst('eenheidPx', taal)} uit={uit} onWaarde={(n) => pas('uiterlijk.straal', n, tekst('straal', taal))} /></label>
              )}
            </Rij>
            <Rij s="randDikte" taal={taal} pad="uiterlijk.randDikte" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
              <Getal waarde={u.randDikte ?? 0} min={0} max={8} eenheid={tekst('eenheidPx', taal)} uit={uit} onWaarde={(n) => pas('uiterlijk.randDikte', n, tekst('randDikte', taal))} />
            </Rij>
            <Rij s="doorzichtigheid" taal={taal} pad="uiterlijk.doorzichtigheid" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
              <span className="eig-schuif">
                <input type="range" min={20} max={100} value={Math.round((u.doorzichtigheid ?? 1) * 100)} disabled={uit} aria-label={tekst('doorzichtigheid', taal)}
                  onChange={(e) => pas('uiterlijk.doorzichtigheid', Number(e.target.value) / 100, tekst('doorzichtigheid', taal))} />
                <span className="eig-eenheid">{Math.round((u.doorzichtigheid ?? 1) * 100)} %</span>
              </span>
            </Rij>
            <Rij s="schaduw" taal={taal} pad="uiterlijk.schaduw" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
              <Keuze waarde={u.schaduw ?? 'geen'} opties={[{ w: 'geen', s: 'schaduwGeen' }, { w: 'zacht', s: 'schaduwZacht' }, { w: 'sterk', s: 'schaduwSterk' }]} taal={taal} naam={tekst('schaduw', taal)} uit={uit}
                onKies={(w) => pas('uiterlijk.schaduw', w, tekst('schaduw', taal))} />
            </Rij>
          </>}

          {tab === 'indeling' && <>
            {b ? <>
              <Rij s="modus" taal={taal} pad="indeling.modus" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                <Keuze<BlokModus> waarde={b.indeling.modus} opties={[{ w: 'vrij', s: 'modusVrij' }, { w: 'rij', s: 'modusRij' }, { w: 'kolom', s: 'modusKolom' }, { w: 'raster', s: 'modusRaster' }]} taal={taal} naam={tekst('modus', taal)} uit={uit}
                  onKies={(w) => pas('indeling.modus', w, tekst('modus', taal))} />
              </Rij>
              <Rij s="tussenruimte" taal={taal} pad="indeling.tussenruimte" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                <Getal waarde={b.indeling.tussenruimte} min={0} max={BLOKKEN_LIMIETEN.maxTussenruimte} eenheid={tekst('eenheidPx', taal)} uit={uit} onWaarde={(n) => pas('indeling.tussenruimte', n ?? 0, tekst('tussenruimte', taal))} />
              </Rij>
              <Rij s="binnenrand" taal={taal} pad="indeling.binnenrand" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                <Getal waarde={b.indeling.binnenrand} min={0} max={BLOKKEN_LIMIETEN.maxBinnenrand} eenheid={tekst('eenheidPx', taal)} uit={uit} onWaarde={(n) => pas('indeling.binnenrand', n ?? 0, tekst('binnenrand', taal))} />
              </Rij>
              {b.indeling.modus !== 'vrij' && <>
                {(['uitlijningHoofd', 'uitlijningDwars'] as const).map((k) => (
                  <Rij key={k} s={k} taal={taal} pad={`indeling.${k}`} knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                    <Keuze<Uitlijning> waarde={b.indeling[k]} opties={[{ w: 'begin', s: 'uitBegin' }, { w: 'midden', s: 'uitMidden' }, { w: 'eind', s: 'uitEind' }, { w: 'rek', s: 'uitRek' }, { w: 'verdeeld', s: 'uitVerdeeld' }]} taal={taal} naam={tekst(k, taal)} uit={uit}
                      onKies={(w) => pas(`indeling.${k}`, w, tekst(k, taal))} />
                  </Rij>
                ))}
              </>}
              {(b.indeling.modus === 'rij' || b.indeling.modus === 'kolom') && (
                <Rij s="omloop" taal={taal} pad="indeling.omloop" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                  <Schakelaar aan={b.indeling.omloop} uit={uit} naam={tekst('omloop', taal)} onZet={(a) => pas('indeling.omloop', a, tekst('omloop', taal))} />
                </Rij>
              )}
              {b.indeling.modus !== 'vrij' && (
                <Rij s="richting" taal={taal} pad="indeling.richting" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                  <Schakelaar aan={b.indeling.richting === 'omgekeerd'} uit={uit} naam={tekst('richting', taal)} onZet={(a) => pas('indeling.richting', a ? 'omgekeerd' : 'normaal', tekst('richting', taal))} />
                </Rij>
              )}
              {b.indeling.modus === 'raster' && <>
                <Rij s="rasterKolommen" taal={taal} pad="indeling.rasterKolommen" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                  <Keuze waarde={b.indeling.rasterKolommen === 'auto' || b.indeling.rasterKolommen === undefined ? 'auto' : 'vast'} opties={[{ w: 'auto', s: 'maatAuto' }, { w: 'vast', s: 'rasterKolommen' }]} taal={taal} naam={tekst('rasterKolommen', taal)} uit={uit}
                    onKies={(w) => pas('indeling.rasterKolommen', w === 'auto' ? 'auto' : 4, tekst('rasterKolommen', taal))} />
                  {typeof b.indeling.rasterKolommen === 'number' && <Getal waarde={b.indeling.rasterKolommen} min={1} max={12} uit={uit} onWaarde={(n) => pas('indeling.rasterKolommen', n ?? 1, tekst('rasterKolommen', taal))} />}
                </Rij>
                {(b.indeling.rasterKolommen ?? 'auto') === 'auto' && (
                  <Rij s="rasterMinCel" taal={taal} pad="indeling.rasterMinCel" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
                    <Getal waarde={b.indeling.rasterMinCel ?? 84} min={32} max={400} eenheid={tekst('eenheidPx', taal)} uit={uit} onWaarde={(n) => pas('indeling.rasterMinCel', n ?? 84, tekst('rasterMinCel', taal))} />
                  </Rij>
                )}
              </>}
              {b.indeling.modus === 'vrij' && (
                <Rij s="overlap" taal={taal}>
                  <Schakelaar aan={!!p.overlapToegestaan} uit={uit || !p.onOverlap} naam={tekst('overlap', taal)} onZet={(a) => p.onOverlap?.(a)} />
                </Rij>
              )}
            </> : <p className="eig-uitleg">{tekst('modus', taal)}: {tekst(ouderModus === 'vrij' ? 'modusVrij' : ouderModus === 'rij' ? 'modusRij' : ouderModus === 'kolom' ? 'modusKolom' : 'modusRaster', taal)}. {uitleg('modus', taal)}</p>}
          </>}

          {tab === 'apparaten' && (
            <Rij s="apparaten" taal={taal} pad="apparaten" knoop={knoop} onHerstel={herstel} uitgeschakeld={uit}>
              {(['computer', 'tablet', 'telefoon'] as ApparaatKlasse[]).map((a) => (
                <div key={a} className="eig-apparaat">
                  <span>{tekst(a, taal)}</span>
                  <Keuze waarde={knoop.apparaten?.[a] ?? 'tonen'} opties={[{ w: 'tonen', s: 'tonen' }, { w: 'verbergen', s: 'verbergen' }]} taal={taal} naam={tekst(a, taal)} uit={uit}
                    onKies={(w) => pas(`apparaten.${a}`, w === 'tonen' ? undefined : w, `${tekst('apparaten', taal)}: ${tekst(a, taal)}`)} />
                </div>
              ))}
            </Rij>
          )}
        </div>
      </div>

      <footer className="eig-voet">
        <Voortgang staat={p.bewaarStaat} taal={taal} onOpnieuwProberen={p.onOpnieuwProberen} />
        <div className="eig-voet-knoppen">
          <button type="button" disabled={!p.kanOngedaan} onClick={p.onOngedaan} title={uitleg('ongedaan', taal)} aria-keyshortcuts="Control+Z">↶ {tekst('ongedaan', taal)}</button>
          <button type="button" disabled={!p.kanOpnieuw} onClick={p.onOpnieuw} title={uitleg('opnieuw', taal)} aria-keyshortcuts="Control+Shift+Z">↷ {tekst('opnieuw', taal)}</button>
          <button type="button" disabled={uit} onClick={() => p.onWijzig(L.wijzigKnoop(p.wortel, knoop.id, L.herstelAlles), tekst('herstelAlles', taal), '*')} title={uitleg('herstelAlles', taal)}>{tekst('herstelAlles', taal)}</button>
          {p.onSluiten && <button type="button" className="eig-hoofd" onClick={p.onSluiten}>{tekst('klaar', taal)}</button>}
        </div>
      </footer>
    </aside>
  );
}

function Schakelaar({ aan, onZet, naam, uit }: { aan: boolean; onZet: (a: boolean) => void; naam: string; uit?: boolean }) {
  return <button type="button" role="switch" aria-checked={aan} aria-label={naam} disabled={uit} className={`eig-schakel ${aan ? 'aan' : ''}`} onClick={() => onZet(!aan)}><span /></button>;
}

function Voortgang({ staat, taal, onOpnieuwProberen }: { staat?: BewaarStaat; taal: Taal; onOpnieuwProberen?: () => void }) {
  const s = staat ?? { staat: 'rust' };
  return (
    <div className={`eig-voortgang ${s.staat}`} role="status" aria-live="polite">
      {s.staat === 'bezig' && <><span className="eig-draai" aria-hidden="true" />{tekst('bezig', taal)}</>}
      {s.staat === 'bewaard' && <>✓ {s.melding ? `${s.melding} · ` : ''}{tekst('bewaard', taal)}</>}
      {s.staat === 'mislukt' && <>⚠ {tekst('mislukt', taal)}{s.fout ? `: ${s.fout}` : ''} {onOpnieuwProberen && <button type="button" onClick={onOpnieuwProberen}>{tekst('probeerOpnieuw', taal)}</button>}</>}
    </div>
  );
}

function maatCss(m: Maat, terug: number): string {
  return m.soort === 'px' ? `${Math.min(m.waarde, 220)}px` : `${terug}px`;
}
function Voorbeeld({ knoop, icoon, label, naam }: { knoop: Knoop; icoon: Icoon; label: Label; naam: string }) {
  const u = knoop.uiterlijk ?? {};
  const icoonPx = icoon.grootte.soort === 'px' ? Math.min(icoon.grootte.waarde, 96) : 36;
  const straal = u.vorm === 'cirkel' ? '50%' : u.vorm === 'pil' ? '999px' : u.vorm === 'rechthoek' ? '0' : `${u.straal ?? 10}px`;
  const kleur = (k: Kleur | undefined, t: string) => (k && k.startsWith('#') ? k : k?.startsWith('token:') ? `var(--${k.slice(6)})` : t);
  const toon = label.tonen !== 'nee';
  const richting = label.plaats === 'rechts' ? 'row' : label.plaats === 'links' ? 'row-reverse' : label.plaats === 'boven' ? 'column-reverse' : 'column';
  const fs = { mini: 10, klein: 11, normaal: 12, groot: 15 }[label.grootte ?? 'normaal'];
  return (
    <div className="eig-vb-tegel" data-voorbeeld="" style={{
      flexDirection: richting, background: kleur(u.achtergrond, 'var(--surface)'), color: kleur(u.tekstKleur, 'var(--text)'),
      border: `${u.randDikte ?? 0}px solid ${kleur(u.randKleur, 'var(--line)')}`, borderRadius: straal, opacity: u.doorzichtigheid ?? 1,
      boxShadow: u.schaduw === 'sterk' ? '0 8px 22px var(--shadow)' : u.schaduw === 'zacht' ? '0 2px 8px var(--shadow)' : 'none',
      width: maatCss(knoop.afmeting.breedte, 96), minHeight: maatCss(knoop.afmeting.hoogte, 80),
    }}>
      <span className={`eig-vb-icoon stijl-${icoon.stijl ?? 'kader'}`} style={{ width: icoonPx, height: icoonPx, fontSize: Math.round(icoonPx * 0.55), color: kleur(u.icoonKleur, 'var(--accent)') }} data-icoon-px={icoonPx}>
        {knoop.soort === 'blok' ? '▦' : '◆'}
      </span>
      {toon && <span style={{ fontSize: fs }}>{naam}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ hook: voorbeeld + bewaren + geschiedenis
export interface BlokkenBewerker {
  wortel: Blok;
  paneelProps: Pick<EigenschappenPaneelProps, 'wortel' | 'onWijzig' | 'bewaarStaat' | 'onOpnieuwProberen' | 'kanOngedaan' | 'kanOpnieuw' | 'onOngedaan' | 'onOpnieuw'>;
  /** Voor wijzigingen van buiten het paneel (slepen, groeperen) — komen in dezelfde geschiedenis. */
  wijzig: (nieuw: Blok, omschrijving: string) => void;
}
/**
 * @param begin  huidige boom (bij wissel van widget: nieuwe sleutel → component opnieuw mounten)
 * @param bewaar schrijft naar de server (stroom A, api.ts); werpt bij fout. Wordt vertraagd (wachtMs) aangeroepen.
 */
export function useBlokkenBewerker(begin: Blok, bewaar: (wortel: Blok) => Promise<void>, taal: Taal = 'uk', wachtMs = 400): BlokkenBewerker {
  const [g, zetG] = useState(() => L.nieuweGeschiedenis(begin));
  const [staat, zetStaat] = useState<BewaarStaat>({ staat: 'rust' });
  const klok = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laatste = useRef<{ pad?: string; tijd: number }>({ tijd: 0 });
  const melding = useRef<string>('');
  const teller = useRef(0);

  const plan = useCallback((w: Blok, m: string) => {
    melding.current = m;
    zetStaat({ staat: 'bezig' });
    if (klok.current) clearTimeout(klok.current);
    klok.current = setTimeout(async () => {
      const nr = ++teller.current;
      try { await bewaar(w); if (nr === teller.current) zetStaat({ staat: 'bewaard', melding: melding.current }); }
      catch (e) { if (nr === teller.current) zetStaat({ staat: 'mislukt', fout: e instanceof Error ? e.message : undefined }); }
    }, wachtMs);
  }, [bewaar, wachtMs]);
  useEffect(() => () => { if (klok.current) clearTimeout(klok.current); }, []);

  const onWijzig = useCallback((nieuw: Blok, omschrijving: string, pad?: string) => {
    const nu = Date.now();
    // Snelle opeenvolgende wijzigingen van dezelfde eigenschap (schuif, typen) = één stap in de geschiedenis.
    const samen = !!pad && pad === laatste.current.pad && nu - laatste.current.tijd < 800;
    laatste.current = { pad, tijd: nu };
    zetG((x) => (samen ? { ...x, heden: nieuw } : L.duw(x, nieuw)));
    plan(nieuw, omschrijving);
  }, [plan]);
  const onOngedaan = useCallback(() => { const n = L.terug(g); if (n === g) return; laatste.current = { tijd: 0 }; zetG(n); plan(n.heden, tekst('ongedaanGedaan', taal)); }, [g, plan, taal]);
  const onOpnieuw = useCallback(() => { const n = L.vooruit(g); if (n === g) return; laatste.current = { tijd: 0 }; zetG(n); plan(n.heden, tekst('opnieuwGedaan', taal)); }, [g, plan, taal]);
  const onOpnieuwProberen = useCallback(() => plan(g.heden, melding.current), [plan, g.heden]);

  return useMemo(() => ({
    wortel: g.heden,
    wijzig: (n: Blok, m: string) => onWijzig(n, m),
    paneelProps: { wortel: g.heden, onWijzig, bewaarStaat: staat, onOpnieuwProberen, kanOngedaan: g.verleden.length > 0, kanOpnieuw: g.toekomst.length > 0, onOngedaan, onOpnieuw },
  }), [g, staat, onWijzig, onOngedaan, onOpnieuw, onOpnieuwProberen]);
}
