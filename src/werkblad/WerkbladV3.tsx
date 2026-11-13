// WERKBLAD v3 («Робочий стіл», vrij canvas) — integratie (etappe D). Alleen geladen als de vlag `werkblad-v3` voor deze
// gebruiker aan staat (zie de poort onderaan Werkblad.tsx). Bouwstenen:
//   • data: src/werkblad/api-v3.ts (laden/bewaren met versie per laag, 409 → WerkbladV3Verouderd, terugdraaien), cache voor de 1e weergave;
//   • canvas: src/werkblad/canvas/Canvas.tsx (vrije x/y/w/h, één commit per gebaar, Escape/pointercancel = niets bewaren, ongedaan/opnieuw);
//   • bibliotheek: src/werkblad/bibliotheek/* (register «Все на сайті», ShortcutTegel/MapTegel, contract `werkblad-bibliotheek:toevoegen`);
//   • widgets: dezelfde live widgets als v2 (Inhoud uit Werkblad.tsx, lui geladen, eigen gegevensbronnen ongewijzigd).
// Apparaatklasse komt uit de ECHTE containerbreedte (ResizeObserver), niet uit window.innerWidth. Elke klasse heeft een eigen laag;
// een ontbrekende tablet-/telefoonlaag wordt één keer afgeleid van de computerlaag (aanpassenVanaf) en daarna onafhankelijk bewaard.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, Image, LayoutGrid, Library, RotateCcw, Settings2, Undo2, X } from 'lucide-react';
import { canonicalNavigationUrl } from '../canoniek-navigatie';
import { profielVan, useTech } from '../tech/tech-opslag';
import { ACHTERGRONDEN, werkbladTekst, werkbladWidget, type WerkbladContext, type WerkbladWidgetId } from '../../shared/werkblad-indeling';
import { normaliseerLaag, leegLaag } from '../../shared/werkblad-v3';
import type { ApparaatKlasse, CanvasLayout, DesktopEntry } from '../../shared/werkblad-v3-types';
import {
  MAP_ITEM, REGISTER_V3_HAKEN, USR_ID, persoonlijkItem, registerItem, registerItemVoorEntry, toegestaanVoor,
  type RegisterContext, type RegisterRegel,
} from '../../shared/werkblad-register';
import { bewaarV3, draaiV3Terug, laadV3, schrijfCacheV3, wisCacheV3, WerkbladV3Verouderd, type LaagStand, type V3Antwoord } from './api-v3';
import { haalWerkblad } from './api';
import { weigeringZinUitFout } from '../../shared/weigering-tekst';
import { pasPaginaAchtergrondToe } from './pagina-achtergrond';
import { useZichtbaar } from './gegevens';
import { tr, type Acties, type Dienst, type Lang } from './soorten';
import { Skelet } from './widgets/Vlak';
import { Inhoud, KAAL, WIDGET_ICOON, type WerkbladProps } from './Werkblad';
import HulpVraag from '../hulp/HulpVraag';
import { Canvas, type CanvasStatus } from './canvas/Canvas';
import * as K from './canvas/kern';
import { useContainerBreedte } from './canvas/hooks';
import { Bibliotheek } from './bibliotheek/Bibliotheek';
import { ShortcutTegel } from './bibliotheek/ShortcutTegel';
import { MapTegel } from './bibliotheek/MapTegel';
import { BIBLIOTHEEK_EVENT, BIBLIOTHEEK_MIME, leesSleepData, leesVerzoek, type BibliotheekVerzoek } from './bibliotheek/contract';
import { useWerkbladBlokken } from './blokken/useWerkbladBlokken';
import { heeftBlok, SNEL_TOEGANG, SNEL_TOEGANG_ITEMS } from './blokken/koppeling';
import './werkblad.css';

type Lagen = Partial<Record<ApparaatKlasse, LaagStand>>;
const soortVan = (itemId: string) => (itemId.startsWith('wdg:') ? 'widget' : itemId.startsWith('map:') ? 'folder' : 'shortcut') as DesktopEntry['kind'];
/** Grenzen per item uit het register (dezelfde haak als de server). */
export const limietenV3: K.LimietenFn = (itemId) => {
  const g = REGISTER_V3_HAKEN.grenzen(itemId, soortVan(itemId));
  return g ? { minW: g.min.w, minH: g.min.h, maxW: g.max.w, maxH: g.max.h } : undefined;
};
const USR_OPSLAG = (uid: string) => `tsv:werkblad-v3-usr:${uid}`;
const nieuweId = (l: CanvasLayout) => { for (;;) { const id = `i-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; if (!l.items.some((e) => e.instanceId === id)) return id; } };

/** Persoonlijke snelkoppelingen: uit de bewaarde lagen (config.basis) + nog niet geplaatste uit de lokale lijst. */
function persoonlijkUit(lagen: Lagen, lokaal: readonly { id: string; basis: string; titel?: string; icoon?: string }[]): RegisterRegel[] {
  const uit = new Map<string, RegisterRegel>();
  for (const l of Object.values(lagen)) for (const e of l?.layout.items || []) {
    if (!USR_ID.test(e.itemId) || uit.has(e.itemId)) continue;
    const r = persoonlijkItem({ id: e.itemId, basis: String(e.config?.basis ?? ''), titel: e.titleOverride, icoon: e.iconOverride });
    if (r) uit.set(r.id, r);
  }
  for (const p of lokaal) if (!uit.has(p.id)) { const r = persoonlijkItem(p); if (r) uit.set(r.id, r); }
  return [...uit.values()];
}

/** Eén live widget op het canvas (zelfde inhoud en gegevensbron als v2, pas laden als in beeld). */
function WidgetV3({ entry, lang, acties, basis, kolommen, bewerken, rctx, vak }: {
  entry: DesktopEntry; vak?: React.ReactNode; lang: Lang; acties: Acties; kolommen: number; bewerken: boolean; rctx: RegisterContext;
  basis: { ctx: WerkbladContext; naam: string; ownerUserId: string; techProfiel: boolean; apiPlatform: boolean; eigenaar: boolean };
}) {
  const id = entry.itemId.slice(4) as WerkbladWidgetId;
  const def = werkbladWidget(id);
  const [ref, zichtbaar] = useZichtbaar<HTMLElement>();
  const reg = registerItem(entry.itemId);
  const t = toegestaanVoor(reg, rctx);
  const kaal = KAAL.has(id);
  const titel = def ? (id === 'oud-blok' || id === 'snelkoppeling' ? String(entry.config?.titel || werkbladTekst(def.titel, lang)) : werkbladTekst(def.titel, lang)) : entry.itemId;
  const Icoon = def ? WIDGET_ICOON[id] : LayoutGrid;
  // legacy (oud-blok/snelkoppeling uit v2) blijft werken: alleen planned/denied (buiten legacy) tonen we als zodanig.
  const geblokkeerd = !t.ok && !reg?.legacy;
  const item = useMemo(() => ({ tid: entry.instanceId, id, k: Math.max(1, Math.min(12, Math.round(entry.w / 100))), r: Math.max(1, Math.min(8, Math.round(entry.h / 96))), ...(entry.config ? { inst: entry.config as never } : {}) }), [entry.instanceId, id, entry.w, entry.h, entry.config]);
  return (
    <article ref={ref} className={`wb-tegel wb3-widget${kaal ? ' is-kaal' : ' is-kaart'}${bewerken ? ' is-instellen' : ''}`} data-wb3-widget={id} aria-label={titel} title={titel}>
      {!kaal ? <header className='wb-tegel-kop'><Icoon aria-hidden='true' className='wb-tegel-icoon' /><span className='wb-tegel-titel'>{titel}</span></header> : null}
      <div className='wb-tegel-inhoud'>
        {!def ? <p className='bib-leeg'>{tr(lang, 'Невідомий віджет.', 'Onbekende widget.')}</p>
          : geblokkeerd ? <p className='wb3-niet' data-wb3-stand={t.ok ? 'ready' : t.beschikbaarheid}>{t.ok ? '' : `${t.beschikbaarheid === 'planned' ? tr(lang, 'Скоро. ', 'Binnenkort. ') : ''}${t.reden[lang]}`}</p>
            : vak ? vak : <Suspense fallback={<Skelet rijen={3} />}><Inhoud {...basis} lang={lang} item={item} acties={acties} zichtbaar={zichtbaar} kolommen={kolommen} /></Suspense>}
      </div>
    </article>
  );
}

export default function WerkbladV3({ lang, ownerUserId, naam, magBewerken, rechten, onHubTab, eerste }: WerkbladProps & { eerste: Extract<V3Antwoord, { aan: true }> }) {
  const tech = useTech();
  const techProfiel = profielVan(tech) === 'technisch';
  const profiel = techProfiel ? 'technisch' : 'gebruiker';
  const ruimte = eerste.ruimte;
  const [lagen, zetLagen] = useState<Lagen>(() => eerste.layouts);
  const lagenRef = useRef(lagen); lagenRef.current = lagen;
  const [achtergrond, zetAchtergrond] = useState(eerste.achtergrond);
  const [achtergrondEigen, zetAchtergrondEigen] = useState('');
  const [status, zetStatus] = useState<CanvasStatus>('idle');
  const [bewerken, zetBewerken] = useState(false);
  const [bib, zetBib] = useState(false);
  const [instellingen, zetInstellingen] = useState(false);
  const [bevestig, zetBevestig] = useState<'' | 'reset' | 'v2'>('');
  const [melding, zetMelding] = useState('');
  const [lokaalUsr, zetLokaalUsr] = useState<{ id: string; basis: string; titel?: string; icoon?: string }[]>(() => { try { return JSON.parse(localStorage.getItem(USR_OPSLAG(ownerUserId)) || '[]'); } catch { return []; } });
  const houder = useRef<HTMLDivElement>(null);
  const breedte = useContainerBreedte(houder);
  const klasse: ApparaatKlasse | null = breedte ? K.apparaatVoorBreedte(breedte) : null;
  const klasseRef = useRef(klasse); klasseRef.current = klasse;
  const keten = useRef<Promise<unknown>>(Promise.resolve());
  const conflict = useRef<{ klasse: ApparaatKlasse; actueel: LaagStand | null } | null>(null);
  const mislukt = useRef<{ klasse: ApparaatKlasse; layout: CanvasLayout; extra: { achtergrond?: string } } | null>(null);

  const rctx = useMemo<RegisterContext>(() => ({ ruimte, rechten: { apiPlatform: rechten.apiPlatform, eigenaar: rechten.eigenaar } }), [ruimte, rechten.apiPlatform, rechten.eigenaar]);
  const wctx = useMemo<WerkbladContext>(() => ({ ruimte, eigenaar: rechten.eigenaar, apiPlatform: rechten.apiPlatform }), [ruimte, rechten.eigenaar, rechten.apiPlatform]);
  const persoonlijk = useMemo(() => persoonlijkUit(lagen, lokaalUsr), [lagen, lokaalUsr]);
  const persoonlijkRef = useRef(persoonlijk); persoonlijkRef.current = persoonlijk;

  // Cache voor de eerste weergave bij een volgend bezoek (de server blijft de waarheid).
  useEffect(() => { for (const [a, l] of Object.entries(lagen) as [ApparaatKlasse, LaagStand][]) if (l) schrijfCacheV3(ownerUserId, profiel, a, { ruimte, laag: l, achtergrond }); }, [lagen, achtergrond, ownerUserId, profiel, ruimte]);
  useEffect(() => { try { localStorage.setItem(USR_OPSLAG(ownerUserId), JSON.stringify(lokaalUsr.slice(0, 100))); } catch { /* leeg */ } }, [lokaalUsr, ownerUserId]);

  // Achtergrond: keuze uit v3; de eigen afbeelding blijft in de v2-kolom (achtergrond_eigen) en wordt daar gelezen.
  useEffect(() => {
    if (achtergrond !== 'eigen') { pasPaginaAchtergrondToe({ achtergrond, achtergrondEigen: '' }); return; }
    let leeft = true;
    haalWerkblad().then((a) => { if (leeft) { zetAchtergrondEigen(a.achtergrondEigen); pasPaginaAchtergrondToe({ achtergrond, achtergrondEigen: a.achtergrondEigen }); } }).catch(() => undefined);
    return () => { leeft = false; };
  }, [achtergrond]);

  const zetLaag = useCallback((a: ApparaatKlasse, l: LaagStand) => { zetLagen((o) => { const n = { ...o, [a]: l }; lagenRef.current = n; return n; }); }, []);

  /** Eén laag atomair bewaren (keten: nooit twee tegelijk). 409 → conflictbalk, NIETS overschreven. */
  const bewaar = useCallback((a: ApparaatKlasse, layout: CanvasLayout, extra: { achtergrond?: string } = {}) => {
    const oud = lagenRef.current[a];
    zetLaag(a, { layout, versie: oud?.versie ?? 0, bijgewerktOp: oud?.bijgewerktOp ?? 0 });
    if (!magBewerken) return;
    if (conflict.current) { zetStatus('conflict'); return; }
    zetStatus('saving');
    keten.current = keten.current.catch(() => undefined).then(async () => {
      if (conflict.current) return;
      try {
        const r = await bewaarV3(a, layout, lagenRef.current[a]?.versie ?? 0, extra);
        mislukt.current = null;
        zetLagen((o) => { const huidig = o[a]; const n = { ...o, [a]: huidig && huidig.layout !== layout ? { ...huidig, versie: r.laag.versie } : r.laag }; lagenRef.current = n; return n; });
        zetAchtergrond(r.achtergrond);
        zetStatus('idle');
      } catch (e) {
        if (e instanceof WerkbladV3Verouderd) { conflict.current = { klasse: a, actueel: e.actueel }; zetStatus('conflict'); return; }
        mislukt.current = { klasse: a, layout, extra }; zetStatus('error');
      }
    });
  }, [magBewerken, zetLaag]);

  const herladen = useCallback(async () => {
    const c = conflict.current; conflict.current = null;
    try {
      const a = await laadV3();
      if (a.aan) { lagenRef.current = a.layouts; zetLagen(a.layouts); zetAchtergrond(a.achtergrond); }
      else if (c?.actueel) zetLaag(c.klasse, c.actueel);
      zetStatus('idle'); zetMelding(tr(lang, 'Показано новішу версію з сервера.', 'De nieuwere versie van de server wordt getoond.'));
    } catch { conflict.current = c; zetStatus('conflict'); }
  }, [lang, zetLaag]);
  // Werkblad-blokken (vlag `werkblad-blokken`): uit = blk.aan false = niets verandert aan de weergave.
  const zetVersie = useCallback((a: ApparaatKlasse, versie: number) => { zetLagen((o) => { const l = o[a]; if (!l) return o; const n = { ...o, [a]: { ...l, versie } }; lagenRef.current = n; return n; }); }, []);
  const blk = useWerkbladBlokken({ lang, klasse, magBewerken, bewerken, rctx, persoonlijk, lagenRef, zetVersie, bewaarLaag: bewaar, keten, houder, melding: zetMelding,
    herladenV3: async () => { try { const a = await laadV3(); if (a.aan) { conflict.current = null; lagenRef.current = a.layouts; zetLagen(a.layouts); zetStatus('idle'); } } catch { /* leeg */ } }, snelToegangItems: [...SNEL_TOEGANG_ITEMS] });
  const opnieuw = useCallback(() => { const m = mislukt.current; if (m) bewaar(m.klasse, m.layout, m.extra); }, [bewaar]);

  // Eerste bezoek op een klasse zonder eigen laag → één keer afleiden van de computerlaag en bewaren (daarna onafhankelijk).
  useEffect(() => {
    if (!klasse || lagenRef.current[klasse]) return;
    const pc = lagenRef.current.computer?.layout;
    // Telefoon: flow (geen overlap, zoals de v2→v3-overzetting); tablet erft de modus van de PC.
    const afgeleid = klasse === 'computer' || !pc ? leegLaag(klasse) : { ...K.aanpassenVanaf(pc, K.STANDAARD_CANVASBREEDTE[klasse], limietenV3), ...(klasse === 'telefoon' ? { mode: 'flow' as const } : {}) };
    const schoon = normaliseerLaag(afgeleid, klasse, { ruimte, ...REGISTER_V3_HAKEN });
    bewaar(klasse, schoon);
  }, [klasse, ruimte, bewaar]);

  const laag = klasse ? lagen[klasse] : undefined;

  /** Commit van het canvas. Een snelkoppeling die op een map is neergezet gaat de map in (parent). */
  const opCommit = useCallback((nieuw: CanvasLayout) => {
    const a = klasseRef.current; if (!a) return;
    const oud = lagenRef.current[a]?.layout;
    let uit = nieuw;
    if (oud) {
      const mappen = nieuw.items.filter((e) => e.kind === 'folder' && !e.parent);
      for (const e of nieuw.items) {
        if (e.kind !== 'shortcut' || e.parent) continue;
        const o = oud.items.find((x) => x.instanceId === e.instanceId);
        if (!o || (o.x === e.x && o.y === e.y)) continue;
        const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
        const m = mappen.find((f) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h);
        if (m) {
          uit = { ...uit, items: uit.items.map((x) => (x.instanceId === e.instanceId ? { ...x, parent: m.instanceId } : x)) };
          zetMelding(tr(lang, `Додано до теки «${m.titleOverride || 'Тека'}».`, `Toegevoegd aan map «${m.titleOverride || 'Map'}».`));
        }
      }
      // Een verwijderde map laat haar inhoud niet verdwijnen: die komt terug op het werkblad.
      const weg = oud.items.filter((x) => x.kind === 'folder' && !uit.items.some((y) => y.instanceId === x.instanceId)).map((x) => x.instanceId);
      if (weg.length) uit = { ...uit, items: uit.items.map((x) => (x.parent && weg.includes(x.parent) ? (({ parent, ...r }) => { void parent; return r; })(x) : x)) };
      // Werkblad-blokken: snelkoppeling losgelaten boven «Швидкий доступ» gaat het blok in (bewaart zelf laag + blok).
      if (blk.opCanvasCommit(oud, uit)) return;
    }
    bewaar(a, uit);
  }, [bewaar, lang, blk]);

  const uitnemen = useCallback((instanceId: string) => {
    const a = klasseRef.current; const l = a && lagenRef.current[a]?.layout; if (!a || !l) return;
    const e = l.items.find((x) => x.instanceId === instanceId); const m = e && l.items.find((x) => x.instanceId === e.parent);
    if (!e || !m) return;
    const plek = K.vrijePlek(l, instanceId, { x: m.x + m.w + 8, y: m.y, w: e.w, h: e.h }) || { x: m.x, y: m.y + m.h + 8, w: e.w, h: e.h };
    bewaar(a, { ...l, items: l.items.map((x) => (x.instanceId === instanceId ? (({ parent, ...r }) => { void parent; return { ...r, ...plek }; })(x) : x)) });
  }, [bewaar]);

  /** Toevoegen uit de bibliotheek (knop, toetsenbord of slepen). Altijd opnieuw tegen het register + rechten gecontroleerd. */
  const voegToe = useCallback((v: BibliotheekVerzoek) => {
    const a = klasseRef.current; const l = a && lagenRef.current[a]?.layout;
    if (!a || !l || !magBewerken) return;
    const isMap = v.kind === 'folder' || v.itemId.startsWith('map:');
    const item = isMap ? MAP_ITEM : registerItem(v.itemId, persoonlijkRef.current);
    if (!item || (!isMap && item.kind !== v.kind)) { zetMelding(tr(lang, 'Цей елемент не можна додати.', 'Dit item kan niet worden toegevoegd.')); return; }
    const t = toegestaanVoor(item, rctx);
    if (!t.ok) { zetMelding(t.reden[lang]); return; }
    if (item.singleton && l.items.some((e) => e.itemId === item.id)) { zetMelding(tr(lang, 'Цей віджет уже є на столі.', 'Deze widget staat al op het werkblad.')); return; }
    let itemId = item.id;
    if (isMap) { for (let n = 1; ; n += 1) { const k = `map:m${n}`; if (!l.items.some((e) => e.itemId === k)) { itemId = k; break; } } }
    const w = Math.min(item.standaardAfm.w, l.canvasWidth), h = item.standaardAfm.h;
    const instanceId = nieuweId(l);
    const start = v.point ? { x: Math.round(v.point.x - w / 2), y: Math.round(v.point.y - h / 2) } : { x: 16, y: 16 };
    const ruw = K.klemInCanvas({ ...start, w, h }, l);
    const plek = K.vrijePlek(l, instanceId, ruw, 8, 6000) || { ...ruw, y: K.benodigdeHoogte(l) };
    const usr = USR_ID.test(itemId) ? persoonlijkRef.current.find((p) => p.id === itemId) : undefined;
    const entry: DesktopEntry = {
      instanceId, itemId, kind: isMap ? 'folder' : item.kind, ...plek, z: l.items.reduce((m, e) => Math.max(m, e.z), 0) + 1,
      ...(isMap ? { titleOverride: v.titleOverride || item.titel[lang] } : v.titleOverride ? { titleOverride: v.titleOverride } : usr ? { titleOverride: usr.titel[lang] } : {}),
      ...(v.iconOverride ? { iconOverride: v.iconOverride } : usr ? { iconOverride: usr.icoon } : {}),
      ...(usr ? { config: { basis: String(usr.basis), titel: usr.titel[lang] } } : {}),
    };
    bewaar(a, normaliseerLaag({ ...l, items: [...l.items, entry] }, a, { ruimte, ...REGISTER_V3_HAKEN }));
    zetMelding(tr(lang, `«${entry.titleOverride || item.titel.uk}» додано на стіл.`, `«${entry.titleOverride || item.titel.nl}» toegevoegd aan het werkblad.`));
    requestAnimationFrame(() => houder.current?.querySelector<HTMLElement>(`[data-wbc-id="${instanceId}"]`)?.focus());
  }, [bewaar, lang, magBewerken, rctx, ruimte]);
  const voegToeRef = useRef(voegToe); voegToeRef.current = voegToe;

  // Contract: CustomEvent van de bibliotheek (knop / toetsenbord).
  useEffect(() => {
    const f = (e: Event) => { const v = leesVerzoek((e as CustomEvent).detail); if (v) voegToeRef.current(v); };
    addEventListener(BIBLIOTHEEK_EVENT, f);
    return () => removeEventListener(BIBLIOTHEEK_EVENT, f);
  }, []);
  // Contract: slepen uit het paneel (HTML5 drag & drop) → logische canvas-px via de schaal van het canvas.
  const opDrop = (e: React.DragEvent) => {
    const v = leesSleepData(e.dataTransfer); if (!v) return;
    e.preventDefault();
    const wbc = houder.current?.querySelector<HTMLElement>('.wbc'); if (!wbc) return;
    const r = wbc.getBoundingClientRect(), s = Number(wbc.dataset.schaal) || 1;
    voegToe({ ...v, point: { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s } });
  };

  const acties = useMemo<Acties>(() => ({
    hubTab: (tab) => onHubTab(tab),
    dienst: (dienst: Dienst, tab = '') => { location.assign(canonicalNavigationUrl(dienst, tab, lang)); },
    zoek: (vraag) => { const u = new URL(canonicalNavigationUrl('hub', 'zoek', lang)); if (vraag) u.searchParams.set('q', vraag); location.assign(u.toString()); },
    instellen: () => zetBewerken(true),
    catalogus: () => { zetBewerken(true); zetBib(true); },
  }), [lang, onHubTab]);
  const basis = { ctx: wctx, naam, ownerUserId, techProfiel, apiPlatform: rechten.apiPlatform, eigenaar: rechten.eigenaar };
  const kolommen = klasse === 'telefoon' ? 1 : klasse === 'tablet' ? 6 : 12;

  const render = useCallback((e: DesktopEntry, c: { bewerken: boolean }) => {
    if (e.kind === 'widget') return <WidgetV3 entry={e} lang={lang} acties={acties} basis={basis} kolommen={kolommen} bewerken={c.bewerken} rctx={rctx} vak={blk.aan && e.itemId === SNEL_TOEGANG ? blk.vakVoor(e, c.bewerken) : undefined} />;
    if (e.kind === 'folder' && blk.aan) return <div className='wb3-tegel wb3-map-blok' data-wb3-map-blok={e.instanceId}><span className='wb3-map-titel'>{e.titleOverride || tr(lang, 'Тека', 'Map')}</span>{blk.vakVoor(e, c.bewerken)}</div>;
    if (e.kind === 'shortcut' && blk.aan) { const los = blk.losseTegel(e, c.bewerken); if (los) return <div className='wb3-tegel'>{los}</div>; }
    if (e.kind === 'folder') {
      const kinderen = (lagenRef.current[klasseRef.current!]?.layout.items || []).filter((x) => x.parent === e.instanceId);
      return <div className='wb3-tegel'><MapTegel map={e} kinderen={kinderen} lang={lang} ctx={rctx} persoonlijk={persoonlijk} instellen={c.bewerken} onUitnemen={magBewerken ? uitnemen : undefined} /></div>;
    }
    return <div className='wb3-tegel'><ShortcutTegel itemId={e.itemId} lang={lang} ctx={rctx} titleOverride={e.titleOverride} iconOverride={e.iconOverride} persoonlijk={persoonlijk} instellen={c.bewerken} /></div>;
  }, [lang, acties, kolommen, rctx, persoonlijk, magBewerken, uitnemen, lagen, blk]); // eslint-disable-line react-hooks/exhaustive-deps
  const titel = useCallback((e: DesktopEntry) => {
    if (e.titleOverride) return e.titleOverride;
    const r = registerItemVoorEntry(e.itemId, e.config) ?? registerItem(e.itemId, persoonlijk);
    return r ? r.titel[lang] : e.itemId;
  }, [lang, persoonlijk]);

  const reset = async () => {
    zetBevestig('');
    try {
      await draaiV3Terug({ v3Wissen: true }); wisCacheV3(ownerUserId, profiel);
      const a = await laadV3();
      if (a.aan) { conflict.current = null; lagenRef.current = a.layouts; zetLagen(a.layouts); zetAchtergrond(a.achtergrond); zetStatus('idle'); }
      zetMelding(tr(lang, 'Стіл скинуто до перенесеної розкладки v2.', 'Het werkblad is teruggezet naar de overgezette v2-indeling.'));
    } catch (e) { zetMelding(tr(lang, `Не вдалося скинути (${String((e as Error)?.message || e)}).`, `Terugzetten mislukt (${String((e as Error)?.message || e)}).`)); }
  };
  const naarV2 = async () => {
    zetBevestig('');
    try {
      const r = await draaiV3Terug({ v3Wissen: false });
      zetMelding(r.hersteld
        ? tr(lang, `Розкладку v2 відновлено (версія ${r.v2Versie}). Щоб бачити старий стіл, вимкніть прапорець «werkblad-v3». Дані v3 збережено.`, `De v2-indeling is hersteld (versie ${r.v2Versie}). Zet de vlag «werkblad-v3» uit om het oude werkblad te zien. De v3-gegevens blijven bewaard.`)
        : tr(lang, 'Резервної копії v2 немає — нічого відновлювати.', 'Er is geen v2-back-up — niets te herstellen.'));
    } catch (e) { zetMelding(weigeringZinUitFout(lang, e) ?? tr(lang, `Не вдалося (${String((e as Error)?.message || e)}).`, `Mislukt (${String((e as Error)?.message || e)}).`)); }
  };
  const kiesAchtergrond = (nieuw: string) => { const a = klasseRef.current; const l = a && lagenRef.current[a]?.layout; if (a && l) bewaar(a, l, { achtergrond: nieuw }); zetAchtergrond(nieuw); };

  const stijl = achtergrond === 'eigen' && achtergrondEigen ? ({ '--wb-eigen': `url("${achtergrondEigen}")` } as CSSProperties) : undefined;
  return (
    <section className={`werkblad wb3 wb-achtergrond-${achtergrond}${bewerken ? ' is-instellen' : ''}`} style={stijl} data-werkblad='klaar' data-werkblad-versie='3'
      data-wb-ruimte={ruimte} data-wb3-klasse={klasse || ''} data-wb3-status={status} aria-labelledby='werkblad-kop'>
      <div className='wb-balk'>
        <h2 id='werkblad-kop' className='sr-only'>{tr(lang, 'Робочий стіл', 'Werkblad')}</h2>
        {ruimte === 'technisch' ? <span className='pil pil-info wb-ruimte-pil'><LayoutGrid aria-hidden='true' />{tr(lang, 'Технічний простір: окрема розкладка', 'Technische ruimte: eigen indeling')}</span> : null}
        <div className='wb-balk-acties'>
          {magBewerken ? (bewerken ? (
            <>
              <button type='button' className='knop-secundair is-klein' data-wb3='bibliotheek' aria-expanded={bib} onClick={() => zetBib((b) => !b)}><Library aria-hidden='true' />{tr(lang, 'Бібліотека', 'Bibliotheek')}</button>
              <button type='button' className='knop-stil is-klein' data-wb3='instellingen' aria-expanded={instellingen} onClick={() => zetInstellingen((b) => !b)}><Settings2 aria-hidden='true' />{tr(lang, 'Параметри', 'Instellingen')}</button>
              <button type='button' className='knop-primair is-klein' data-wb3='klaar' onClick={() => { zetBewerken(false); zetBib(false); zetInstellingen(false); }}><Check aria-hidden='true' />{tr(lang, 'Готово', 'Klaar')}</button>
            </>
          ) : <button type='button' className='knop-secundair is-klein' data-wb3='instellen' onClick={() => zetBewerken(true)}><Settings2 aria-hidden='true' />{tr(lang, 'Налаштувати робочий стіл', 'Werkblad instellen')}</button>) : null}
        </div>
      </div>
      {bewerken ? <p className='wb-uitleg'>{tr(lang, 'Перетягуйте об’єкти куди завгодно; краї й кути змінюють розмір. На телефоні — довге натискання. Клавіатура: стрілки, Shift+стрілки, Enter — меню, Ctrl+Z / Ctrl+Y — скасувати/повторити. Ярлик, покладений на теку, потрапляє в теку.', 'Sleep objecten waar u wilt; randen en hoeken wijzigen het formaat. Op de telefoon: lang indrukken. Toetsenbord: pijltjes, Shift+pijltjes, Enter — menu, Ctrl+Z / Ctrl+Y — ongedaan/opnieuw. Een snelkoppeling op een map gaat de map in.')}{blk.aan ? ` ${tr(lang, 'Блоки: клік по значку в «Швидкому доступі» чи теці — властивості; Shift+клік — вибрати кілька; утримайте й перетягніть значок в інший блок, на стіл або в меню; M — «Перемістити в…».', 'Blokken: klik op een icoon in «Snelle toegang» of een map — eigenschappen; Shift+klik — meerdere kiezen; houd vast en sleep een icoon naar een ander blok, het werkblad of het menu; M — «Verplaatsen naar…».')}` : ''}</p> : null}
      {bewerken && instellingen ? (
        <div className='wb3-instellingen' data-wb3-paneel='instellingen'>
          <label className='wb3-veld'><Image aria-hidden='true' />{tr(lang, 'Фон', 'Achtergrond')}
            <select data-hulp='werkblad.achtergrond' value={achtergrond} onChange={(e) => kiesAchtergrond(e.target.value)} data-wb3='achtergrond'>
              {ACHTERGRONDEN.filter((a) => a !== 'eigen' || achtergrondEigen || achtergrond === 'eigen').map((a) => <option key={a} value={a}>{a === 'geen' ? tr(lang, 'Без фону', 'Geen') : a === 'nacht' ? tr(lang, 'Ніч', 'Nacht') : a === 'zee' ? tr(lang, 'Море', 'Zee') : a === 'woud' ? tr(lang, 'Ліс', 'Woud') : a === 'avond' ? tr(lang, 'Вечір', 'Avond') : tr(lang, 'Власне', 'Eigen')}</option>)}
            </select>
          </label>
          {/* «?» naast het veld, niet in het label: een klik op de knop mag de select niet openen. */}
          <HulpVraag k='werkblad.achtergrond' lang={lang} />
          <button type='button' className='knop-stil is-klein' data-wb3='reset' onClick={() => zetBevestig('reset')}><RotateCcw aria-hidden='true' />{tr(lang, 'Скинути стіл', 'Werkblad terugzetten')}</button>
          {blk.aan ? <button type='button' className='knop-stil is-klein' data-wb3='blokken-herstellen' title={tr(lang, 'Повертає блоки зі збереженої копії — наприклад, після встановлення старішої версії сайту.', 'Zet de blokken terug uit de bewaarde kopie — bijvoorbeeld na het installeren van een oudere versie van de site.')} onClick={() => void blk.herstel('na')}><RotateCcw aria-hidden='true' />{tr(lang, 'Відновити блоки', 'Blokken herstellen')}</button> : null}
          {rechten.eigenaar ? <button type='button' className='knop-stil is-klein' data-wb3='naar-v2' onClick={() => zetBevestig('v2')}><Undo2 aria-hidden='true' />{tr(lang, 'Повернути розкладку v2', 'v2-indeling herstellen')}</button> : null}
          {bevestig ? (
            <div className='melding melding-warn wb3-bevestig' role='alertdialog' aria-label={tr(lang, 'Підтвердження', 'Bevestiging')} data-wb3-bevestig={bevestig}>
              <p>{bevestig === 'reset'
                ? tr(lang, 'Усі три розкладки (ПК, планшет, телефон) буде видалено й заново перенесено з вашого столу v2. Продовжити?', 'Alle drie de indelingen (computer, tablet, telefoon) worden gewist en opnieuw overgezet vanuit uw v2-werkblad. Doorgaan?')
                : tr(lang, 'Збережену копію розкладки v2 буде записано назад у v2. Дані v3 лишаються. Продовжити?', 'De bewaarde kopie van de v2-indeling wordt teruggezet in v2. De v3-gegevens blijven. Doorgaan?')}</p>
              <div className='knoppen'>
                <button type='button' className='knop-primair is-klein' data-wb3='bevestig-ja' onClick={() => void (bevestig === 'reset' ? reset() : naarV2())}><Check aria-hidden='true' />{tr(lang, 'Так', 'Ja')}</button>
                <button type='button' className='knop-stil is-klein' data-wb3='bevestig-nee' onClick={() => zetBevestig('')}><X aria-hidden='true' />{tr(lang, 'Скасувати', 'Annuleren')}</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {bewerken && bib ? (
        <div className='wb3-bibliotheek' data-wb3-paneel='bibliotheek'>
          <Bibliotheek lang={lang} ctx={rctx} persoonlijk={persoonlijk}
            onPersoonlijk={(lijst) => zetLokaalUsr(lijst.filter((r) => r.basis).map((r) => ({ id: r.id, basis: String(r.basis), titel: r.titel.uk, icoon: r.icoon })))}
            onSluiten={() => zetBib(false)} />
        </div>
      ) : null}
      <p className='sr-only' aria-live='polite' data-wb3-melding=''>{melding}</p>
      {melding ? <p className='wb3-melding melding melding-info' data-wb3-zichtbaar-melding=''>{melding}<button type='button' className='wb-tip-sluit' aria-label={tr(lang, 'Закрити', 'Sluiten')} onClick={() => zetMelding('')}><X aria-hidden='true' /></button></p> : null}
      <div className='wb3-houder' ref={houder} data-wb3-houder='' onDragOver={(e) => { if (bewerken && [...e.dataTransfer.types].includes(BIBLIOTHEEK_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }} onDrop={opDrop}>
        {klasse && laag ? (
          <Canvas key={klasse} layout={laag.layout} editMode={bewerken && magBewerken} limieten={limietenV3} lang={lang} status={status}
            onCommit={opCommit} onRetry={opnieuw} onReload={() => void herladen()} onRequestAdd={() => zetBib(true)} titel={titel} render={render}
            interactief={blk.aan ? heeftBlok : undefined} />
        ) : <Skelet rijen={4} />}
      </div>
      {blk.paneel}
      {blk.kiezerVenster}
    </section>
  );
}

