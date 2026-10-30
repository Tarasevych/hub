// Zones, gniezda en de knoppen erin (25.10.2026, zwevende knoppen — model: shared/plaatsing.ts, staat: ./plaatsing-staat.ts).
//
//  - useZone(zone)        : props voor het element dat de ZONE is (bovenbalk = .canonical-account-anchor, kop van het menu, menulijst,
//                           actiestapel). De browser legt de zone uit (flex); `order` komt uit de indeling — ook voor de bewoners.
//  - <Gniezda zone>       : de gniezda van de verplaatsbare knoppen in die zone (lege div's; ook als de knop er nog niet is: zo springt
//                           niets als «Написати» of «Вгору» later verschijnt). Tijdens het slepen: één open plek (voorbeeld).
//  - <Plek knop>          : de knop tekent zich in ZIJN gniezdo (portal). Geen gniezdo (bv. lade dicht) = niet getekend.
//  - <Actiestapel>        : de stapel rechtsonder in het inhoudsvlak; staat boven onderbalken (één gemeten hoogte), nooit eronder.
//  - <PlaatsActies>       : «Перемістити до…» — verplaatsen zonder slepen (WCAG 2.5.7), met toetsenbord, en «Повернути на типове місце».
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, RotateCcw, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  IFRAME_INZET, KNOP_NAAM, KNOP_ZONES, MAX_INDEX, PLAATSEN, STANDAARD, TABLET_MAX, TELEFOON_MAX, ZONE_NAAM, ZONE_RICHTING, ZONE_VORM, bezet, heeftEigen,
  isVerplaatst, magNaar, terugzetten, verplaats, weigeringTekst, zoneBestaat, type Indeling, type ItemId, type Klasse, type KnopId, type PaginaContext,
  type PlaatsingVoorkeur, type ZoneId, type ZoneInhoud,
} from '../../shared/plaatsing';
import { placeNear } from '../melding-positie';
import { focusbaar, menuToets } from '../platform/toegankelijk';
import { registerZone } from '../zwevend-ontwijking';
import { gniezdoRef, plaatsStaat, useGniezdo, usePlaatsStaat, zetOnder, zetPlaatsMenu, zetPlaatsStatus, zoneRef, type Sleep } from './plaatsing-staat';
import { flipNa } from './plaats-flip';
import './plaatsing.css';

type Lang = 'uk' | 'nl';

// ------------------------------------------------------------------------------------------------------------------ klasse
const leesKlasse = (): Klasse => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'computer';
  return window.matchMedia(`(max-width:${TELEFOON_MAX}px)`).matches ? 'telefoon' : window.matchMedia(`(max-width:${TABLET_MAX}px)`).matches ? 'tablet' : 'computer';
};
/** Apparaatklasse uit de breedte (zelfde grens als de lade van het menu: 700 px). */
export function useKlasse(): Klasse {
  const [k, setK] = useState<Klasse>(leesKlasse);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const a = window.matchMedia(`(max-width:${TELEFOON_MAX}px)`), b = window.matchMedia(`(max-width:${TABLET_MAX}px)`);
    const f = () => setK(leesKlasse());
    a.addEventListener?.('change', f); b.addEventListener?.('change', f); f();
    return () => { a.removeEventListener?.('change', f); b.removeEventListener?.('change', f); };
  }, []);
  return k;
}

// ------------------------------------------------------------------------------------------------------------------ weergave van een zone
/** Volgorde (CSS `order`) van alles in een zone, met tijdens het slepen één open plek op de doelpositie. Zuiver (getest). */
export function zoneWeergave(inhoud: ZoneInhoud, zone: ZoneId, sleep: Sleep | null) {
  const start = inhoud.voor.length;
  const knop = sleep?.knop;
  const zonder = inhoud.lijst.filter((x) => x.id !== knop);
  const doel = sleep?.doel?.zone === zone ? Math.max(0, Math.min(sleep.doel.index, zonder.length)) : -1;
  const rij: Array<ItemId | 'voorbeeld'> = zonder.map((x) => x.id);
  if (doel >= 0) rij.splice(doel, 0, 'voorbeeld');
  const orde: Partial<Record<ItemId | 'voorbeeld', number>> = {};
  inhoud.voor.forEach((id, i) => { orde[id] = i; });
  rij.forEach((id, i) => { orde[id] = start + i; });
  return { orde, voorbeeld: doel >= 0, gesleept: knop && inhoud.lijst.some((x) => x.id === knop) ? knop : null, knoppen: inhoud.lijst.filter((x) => !x.bewoner).map((x) => x.id as KnopId) };
}

/** Wat een zone tijdens het slepen zegt: neemt ze deze knop aan, is ze vol, wijst de vinger hierheen? */
function doelStaat(zone: ZoneId, sleep: Sleep | null, voorkeur: PlaatsingVoorkeur, ctx: PaginaContext): string | undefined {
  if (!sleep) return undefined;
  if (sleep.vol === zone) return 'vol-hier';
  const m = magNaar(voorkeur, ctx, sleep.knop, zone);
  if (!m.ok) return m.reden === 'vol' ? 'vol' : 'nee';
  return sleep.doel?.zone === zone ? 'hier' : 'ja';
}

/** Props voor het zone-element. `extra`: eigen stijl van de aanroeper (wordt samengevoegd). */
export function useZone(zone: ZoneId, ind: Indeling, extra?: CSSProperties) {
  const s = usePlaatsStaat();
  const w = zoneWeergave(ind.zones[zone], zone, s.sleep);
  const style = { ...(extra || {}), ['--plaats-orde-account' as string]: w.orde.account ?? 0, ['--plaats-orde-zoeken' as string]: w.orde.zoeken ?? 0 } as CSSProperties;
  return { ref: zoneRef(zone), 'data-plaats-zone': zone, 'data-plaats-doel': doelStaat(zone, s.sleep, s.voorkeur, s.ctx), 'data-plaats-aantal': w.knoppen.length, style };
}

/** De gniezda van de verplaatsbare knoppen in `zone` (plus de open plek tijdens het slepen). */
export function Gniezda({ zone, ind }: { zone: ZoneId; ind: Indeling }) {
  const s = usePlaatsStaat();
  const w = zoneWeergave(ind.zones[zone], zone, s.sleep);
  useLayoutEffect(() => { const el = plaatsStaat().zones[zone]; if (el) flipNa(el); });
  return <>
    {w.knoppen.map((k) => <div key={k} className='plaats-gniezdo' data-plaats-knop={k} data-sleept={w.gesleept === k ? 'ja' : undefined} ref={gniezdoRef(k)} style={{ order: w.orde[k] ?? 0 }} />)}
    {w.voorbeeld && <div key='voorbeeld' className='plaats-gniezdo plaats-voorbeeld' aria-hidden='true' data-plaats-voorbeeld={s.sleep?.knop} style={{ order: w.orde.voorbeeld ?? 0 }} />}
  </>;
}

/** De knop `knop` tekent zich in zijn gniezdo. `children(vorm, zone)`: rond in bovenbalk/kop/stapel, als menuregel in de menulijst. */
export function Plek({ knop, children }: { knop: KnopId; children: (vorm: 'rond' | 'rij', zone: ZoneId) => ReactNode }) {
  const el = useGniezdo(knop);
  const s = usePlaatsStaat();
  const zone = s.indeling.plek[knop];
  if (!el || !zone) return null;
  return createPortal(children(ZONE_VORM[zone], zone), el);
}

// ------------------------------------------------------------------------------------------------------------------ actiestapel
/** Balken onderaan die de stapel optillen (de stapel staat erboven, niet erop). Eén gemeten hoogte; verandert alleen als zo'n balk
 *  verschijnt, verdwijnt of van hoogte verandert — niet bij scrollen of zoomen. */
const ONDERBALKEN = ['.canonical-connection-banner', '.mail-reader-onderbalk', '.mail-minimized-viewer', ".canonical-chrome[data-dock='onder'] .canonical-sidebar"];
function useOnderbalken(stapel: React.RefObject<HTMLElement | null>, klasse: Klasse) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => plan()) : null;
    const gevolgd = new Set<Element>();
    const meet = () => {
      raf = 0;
      const vh = window.innerHeight, vw = window.innerWidth, s = stapel.current?.getBoundingClientRect();
      const kolomL = s && s.width ? s.left - 8 : vw - 96, kolomR = s && s.width ? s.right + 8 : vw;
      let hoogte = 0;
      for (const sel of ONDERBALKEN) for (const el of document.querySelectorAll(sel)) {
        if (!gevolgd.has(el)) { gevolgd.add(el); ro?.observe(el); }
        if (el.closest('.plaats-actiestapel')) continue;
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') continue;
        // alleen balken die tot (bijna) de onderrand reiken en onder de kolom van de stapel liggen
        if (r.bottom < vh - 24 || r.right < kolomL || r.left > kolomR) continue;
        hoogte = Math.max(hoogte, vh - r.top);
      }
      zetOnder(hoogte ? hoogte + 4 : 0);
    };
    const plan = () => { if (!raf) raf = requestAnimationFrame(meet); };
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(plan) : null;
    mo?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', plan);
    plan();
    return () => { cancelAnimationFrame(raf); mo?.disconnect(); ro?.disconnect(); window.removeEventListener('resize', plan); };
  }, [stapel, klasse]);
}

/** De actiestapel: rechtsonder in het INHOUDSVLAK (rechts van het menu, links van een menu rechts), boven onderbalken. */
export function Actiestapel({ ind, klasse }: { ind: Indeling; klasse: Klasse }) {
  const s = usePlaatsStaat();
  const ref = useRef<HTMLDivElement | null>(null);
  const z = useZone('actiestapel', ind, { ['--plaats-onder' as string]: `${s.onder}px` } as CSSProperties);
  useOnderbalken(ref, klasse);
  const aantal = ind.zones.actiestapel.lijst.length;
  // «flow»-zones (bv. het antwoordvak van een gesprek) houden ruimte vrij voor de stapel — zelfde register als vroeger de FAB.
  useEffect(() => {
    if (!aantal) return;
    return registerZone({ id: 'plaats-actiestapel', priority: 100, kind: 'float', fallbacks: [], getRect: () => {
      const el = ref.current; if (!el) return null;
      const r = el.getBoundingClientRect(); return r.width && r.height && getComputedStyle(el).visibility !== 'hidden' ? r : null;
    } });
  }, [aantal]);
  // stabiel: een nieuwe ref-functie per render zou de zone elke keer af- en aanmelden
  const zetRef = useCallback((el: HTMLDivElement | null) => { ref.current = el; return zoneRef('actiestapel')(el); }, []);
  return <div className='plaats-actiestapel' data-plaats-klasse={klasse} {...z} ref={zetRef} role='group' aria-label={ZONE_NAAM.actiestapel[plaatsTaal()]}>
    <Gniezda zone='actiestapel' ind={ind} />
  </div>;
}
const plaatsTaal = (): Lang => (typeof document !== 'undefined' && document.documentElement.lang === 'nl' ? 'nl' : 'uk');

/** Iframe: de site in een venster van een ander programma — 72 px van de rand (L002), net als vroeger de bel. */
export const inIframe = () => { try { return typeof window !== 'undefined' && window.self !== window.top; } catch { return true; } };
export const IFRAME_INZET_PX = `${IFRAME_INZET}px`;

// ------------------------------------------------------------------------------------------------------------------ «Перемістити до…»
const T = {
  titel: { uk: (k: string) => `${k}: перемістити до…`, nl: (k: string) => `${k}: verplaatsen naar…` },
  hier: { uk: 'тут зараз', nl: 'staat hier' },
  vol: { uk: 'усі гнізда зайняті — спершу приберіть звідси кнопку', nl: 'alle plekken bezet — haal hier eerst een knop weg' },
  terug: { uk: 'Повернути на типове місце', nl: 'Terug naar de standaardplek' },
  alles: { uk: 'Скинути всі кнопки до типового', nl: 'Alle knoppen terug naar standaard' },
  sluit: { uk: 'Закрити', nl: 'Sluiten' },
  links: { uk: 'Лівіше', nl: 'Naar links' }, rechts: { uk: 'Правіше', nl: 'Naar rechts' },
  hoger: { uk: 'Вище', nl: 'Hoger' }, lager: { uk: 'Нижче', nl: 'Lager' },
  gedaan: { uk: (k: string, z: string) => `${k} — тепер у «${z}».`, nl: (k: string, z: string) => `${k} staat nu in «${z}».` },
  teruggezet: { uk: (k: string) => `${k} — знову на типовому місці.`, nl: (k: string) => `${k} staat weer op de standaardplek.` },
  allesTerug: { uk: 'Усі кнопки — знову на типових місцях.', nl: 'Alle knoppen staan weer op hun standaardplek.' },
};

/** Voert een verplaatsing door (menu, toetsenbord of slepen) en meldt het resultaat; `opslaan` schrijft de zijbalkvoorkeur. */
export function voerUit(lang: Lang, ctx: PaginaContext, v: PlaatsingVoorkeur, knop: KnopId, zone: ZoneId, index: number, opslaan: (v: PlaatsingVoorkeur) => void): boolean {
  const u = verplaats(v, ctx, knop, zone, index);
  if (!u.ok) { zetPlaatsStatus(weigeringTekst(lang, u.reden, zone, ctx)); return false; }
  opslaan(u.v);
  zetPlaatsStatus(T.gedaan[lang](KNOP_NAAM[knop][lang], ZONE_NAAM[zone][lang]));
  return true;
}

export function PlaatsActies({ lang, ind, ctx, voorkeur, opslaan }: { lang: Lang; ind: Indeling; ctx: PaginaContext; voorkeur: PlaatsingVoorkeur; opslaan: (v: PlaatsingVoorkeur) => void }) {
  const s = usePlaatsStaat();
  const menu = s.menu;
  const ref = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const knop = menu?.knop;
  useLayoutEffect(() => {
    if (!menu || !ref.current) { setPos(null); return; }
    const el = ref.current, vw = window.innerWidth, vh = window.innerHeight;
    const p = placeNear(menu.anker, { width: el.offsetWidth, height: el.offsetHeight }, { left: 0, top: 0, width: vw, height: vh }, { gap: 8 });
    setPos((c) => (c && c.left === p.left && c.top === p.top ? c : { left: p.left, top: p.top }));
  }, [menu]);
  // focus pas als het menu geplaatst (zichtbaar) is: verborgen elementen kunnen geen focus krijgen
  const geplaatst = pos !== null;
  useEffect(() => {
    if (!menu || !geplaatst) return;
    const eerste = ref.current ? focusbaar(ref.current)[0] : null;
    eerste?.focus({ preventScroll: true });
  }, [menu, geplaatst]);
  useEffect(() => {
    if (!menu) return;
    const buiten = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) sluit(false); };
    // Esc sluit ook als de focus (nog) niet in het menu staat
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); sluit(); } };
    document.addEventListener('pointerdown', buiten, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', buiten, true); document.removeEventListener('keydown', esc, true); };
  }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!menu || !knop) return null;
  const sluit = (focus = true) => {
    const k = menu.knop;
    zetPlaatsMenu(null);
    if (focus) requestAnimationFrame(() => (plaatsStaat().gniezda[k]?.querySelector<HTMLElement>('button,a') || null)?.focus({ preventScroll: true }));
  };
  const naam = KNOP_NAAM[knop][lang];
  const huidig = ind.plek[knop];
  const lijst = huidig ? ind.zones[huidig].lijst : [];
  const pos0 = lijst.findIndex((x) => x.id === knop);
  const richting = huidig ? ZONE_RICHTING[huidig] : 'rij';
  const kies = (zone: ZoneId) => {
    if (zone === huidig) { sluit(); return; }
    const std = STANDAARD[ctx.klasse][knop];
    if (voerUit(lang, ctx, voorkeur, knop, zone, std.zone === zone ? std.index : MAX_INDEX, opslaan)) sluit();
  };
  const schuif = (stap: number) => { if (huidig && voerUit(lang, ctx, voorkeur, knop, huidig, pos0 + stap, opslaan)) zetPlaatsMenu({ ...menu }); };
  // stapel: index 0 = onderaan (column-reverse) → «Вище» = index + 1
  const volgordeKnoppen = richting === 'rij'
    ? [{ k: 'links', stap: -1, Icoon: ArrowLeft, tekst: T.links[lang] }, { k: 'rechts', stap: 1, Icoon: ArrowRight, tekst: T.rechts[lang] }]
    : huidig === 'actiestapel'
      ? [{ k: 'hoger', stap: 1, Icoon: ArrowUp, tekst: T.hoger[lang] }, { k: 'lager', stap: -1, Icoon: ArrowDown, tekst: T.lager[lang] }]
      : [{ k: 'hoger', stap: -1, Icoon: ArrowUp, tekst: T.hoger[lang] }, { k: 'lager', stap: 1, Icoon: ArrowDown, tekst: T.lager[lang] }];
  return createPortal(
    <section ref={ref as never} className='plaats-acties' role='dialog' aria-label={T.titel[lang](naam)} data-plaats-acties={knop} style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
      onKeyDown={(e) => { if (ref.current) menuToets(e, focusbaar(ref.current)); }}>
      <h2 className='plaats-acties-titel'>{T.titel[lang](naam)}</h2>
      <ul role='list'>
        {KNOP_ZONES[knop].filter((z) => zoneBestaat(z, ctx)).map((z) => {
          const m = magNaar(voorkeur, ctx, knop, z), isHier = z === huidig, n = bezet(ind.zones[z]), max = PLAATSEN[z][ctx.klasse];
          return <li key={z}><button type='button' data-plaats-naar={z} aria-current={isHier ? 'true' : undefined} disabled={!m.ok && !isHier} onClick={() => kies(z)}>
            {isHier ? <Check aria-hidden='true' /> : <span className='plaats-acties-leeg' aria-hidden='true' />}
            <span><b>{ZONE_NAAM[z][lang]}</b><small>{`${n} ${lang === 'uk' ? 'з' : 'van'} ${max}`}{isHier ? ` · ${T.hier[lang]}` : !m.ok && m.reden === 'vol' ? ` · ${T.vol[lang]}` : ''}</small></span>
          </button></li>;
        })}
      </ul>
      {huidig && lijst.length > 1 && <div className='plaats-acties-volgorde' role='group' aria-label={ZONE_NAAM[huidig][lang]}>
        {volgordeKnoppen.map(({ k, stap, Icoon, tekst }) => {
          const doelIndex = pos0 + stap;
          return <button key={k} type='button' data-plaats-schuif={k} disabled={doelIndex < 0 || doelIndex >= lijst.length} onClick={() => schuif(stap)}><Icoon aria-hidden='true' />{tekst}</button>;
        })}
      </div>}
      <div className='plaats-acties-voet'>
        {isVerplaatst(voorkeur, ctx.klasse, knop) && <button type='button' data-plaats-terug onClick={() => { opslaan(terugzetten(voorkeur, ctx.klasse, knop)); zetPlaatsStatus(T.teruggezet[lang](naam)); sluit(); }}><Undo2 aria-hidden='true' />{T.terug[lang]}</button>}
        {heeftEigen(voorkeur, ctx.klasse) && <button type='button' data-plaats-alles-terug onClick={() => { opslaan(terugzetten(voorkeur, ctx.klasse)); zetPlaatsStatus(T.allesTerug[lang]); sluit(); }}><RotateCcw aria-hidden='true' />{T.alles[lang]}</button>}
        <button type='button' className='plaats-acties-sluit' onClick={() => sluit()}>{T.sluit[lang]}</button>
      </div>
    </section>,
    (typeof document !== 'undefined' && (document.querySelector('.canonical-chrome') || document.body)) as Element,
  );
}
