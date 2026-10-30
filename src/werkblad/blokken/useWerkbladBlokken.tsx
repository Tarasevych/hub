// Werkblad «Blokken» — integratie in Werkblad v3 (WerkbladV3.tsx). Eén haak die alles bij elkaar brengt:
//  • laden (blokken/laden; vlag uit → {aan:false} → NIETS verandert aan de weergave, exact v3);
//  • weergave van «Швидкий доступ» en mappen via BlokWeergave (zonder bewaard blok: standaardblok met automatische maten);
//  • bewerkmodus van het werkblad: klik = kiezen → EigenschappenPaneel; bewaren met 400 ms vertraging, 409 → herladen + melding;
//  • werkbalk: «Згрупувати», «Розгрупувати», «+ Значок», «+ Блок», «Видалити», «Змінити значок», «Перемістити в…»;
//  • slepen (sleepregelaar van stroom D) blok↔blok, blok→werkblad (stijl in config.blokStijl), blok→bichne menu, en
//    werkblad→blok via de canvas-commit (snelkoppeling losgelaten boven een blok);
//  • ongedaan/opnieuw (Ctrl+Z / Ctrl+Shift+Z) via LaagGeschiedenis over blokken én de canvaslaag.
// De server controleert elke bewaring opnieuw (register + ruimte privé/technisch); een weigering wordt getoond en teruggedraaid.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BLOKKEN_SCHEMA, MAAT_AUTO, STANDAARD_INDELING, type Blok, type BlokInhoud, type Knoop, type KnoopId, type Neerzetting, type NeerzetOordeel, type Onderdeel, type Plek, type Sleepbron } from '../../../shared/werkblad-blokken';
import { BlokFout, groepeer, ontgroepeer, zoekKnoop } from '../../../shared/werkblad-blokken-boom';
import { LaagGeschiedenis, beoordeelNeerzetting, maakPlek, redenTekst, type PlekContext } from '../../../shared/werkblad-plekken';
import type { ApparaatKlasse, CanvasLayout, DesktopEntry } from '../../../shared/werkblad-v3-types';
import { ICOON_PRESETS, WERKBLAD_REGISTER, registerItem, toegestaanVoor, type RegisterContext, type RegisterRegel } from '../../../shared/werkblad-register';
import { BlokWeergave } from './BlokWeergave';
import { EigenschappenPaneel, type BewaarStaat } from './EigenschappenPaneel';
import { PlekKiezer, type PlekKeuze } from './PlekKiezer';
import { installeerSleepregelaar, type ExternePlek } from './slepen';
import { menuAlsPlek, menuLijstVan, menuPlek, menuPlekkenUitDom } from './menu-adapter';
import { BlokkenGeweigerd, BlokkenVerouderd, bewaarBlok, herstelBlokken, laadBlokken } from './api';
import { alleIds, haalWeg, herId, heeftBlok, onderdeelNaarCanvas, onderdeelVanCanvas, samen, samengesteldeWortels, standaardMap, standaardSnelToegang, uiteen, voegIn, vrijeId, SNEL_TOEGANG } from './koppeling';
import { RegisterIcoon } from '../bibliotheek/icoon';
import { startItem } from '../bibliotheek/starten';
import { useRegisterBadge } from '../bibliotheek/tegels';
import * as K from '../canvas/kern';
import { tr, type Lang } from '../soorten';
import './blokken.css';
import './slepen.css';
import './integratie.css';

type Blokken = Record<string, BlokInhoud>;
type Lagen = Partial<Record<ApparaatKlasse, { layout: CanvasLayout; versie: number; bijgewerktOp: number }>>;
type Momentopname = { blokken: Blokken; layout: CanvasLayout };
export const MENU_EVENT = 'werkblad-blokken:naar-menu';

export interface WerkbladBlokkenOpties {
  lang: Lang; klasse: ApparaatKlasse | null; magBewerken: boolean; bewerken: boolean;
  rctx: RegisterContext; persoonlijk: readonly RegisterRegel[];
  lagenRef: React.MutableRefObject<Lagen>;
  /** Laagversie bijwerken na een blok-bewaring (versie van een blok = laagversie van v3). */
  zetVersie: (a: ApparaatKlasse, versie: number) => void;
  /** v3-laag bewaren (zelfde keten/409-afhandeling als het canvas). */
  bewaarLaag: (a: ApparaatKlasse, layout: CanvasLayout) => void;
  keten: React.MutableRefObject<Promise<unknown>>;
  houder: React.RefObject<HTMLDivElement | null>;
  melding: (t: string) => void;
  herladenV3: () => Promise<void>;
  /** Snelle-toegangtegels zoals de widget ze nu toont (zelfde volgorde). */
  snelToegangItems: string[];
}

/** Onzichtbare hulp: elke tegel/subblok sleepbaar maken voor de sleepregelaar (data-wb-sleep), na elke weergave. */
function TegelSleep({ vak, wortelId }: { vak: string; wortelId: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current?.closest<HTMLElement>('[data-blk-inst]'); if (!el) return;
    el.querySelectorAll<HTMLElement>('[data-knoop-id]').forEach((t) => { if (t.dataset.knoopId !== wortelId) t.dataset.wbSleep = `blok:${samen(vak, t.dataset.knoopId || '')}`; });
    // buiten de bewerkmodus niet sleepbaar (en de veeggebaren van het menu werken weer)
    return () => { el.querySelectorAll<HTMLElement>('[data-wb-sleep]').forEach((t) => { delete t.dataset.wbSleep; }); };
  });
  return <span ref={ref} hidden />;
}

function TegelIcoon({ itemId, icoon }: { itemId: string; icoon: string }) {
  const item = registerItem(itemId);
  const n = useRegisterBadge(item?.basis ?? item?.id);
  return <><RegisterIcoon icoon={icoon} />{n > 0 ? <span className='wb-teller is-op-icoon' aria-hidden='true'>{n > 99 ? '99+' : n}</span> : null}</>;
}

/** Alle ids in de boom behalve `zonder` zelf. */
function knoopIdsZonder(w: Blok, zonder: string): string[] { const uit: string[] = []; const loop = (k: Knoop) => { if (k.id !== zonder) uit.push(k.id); if (k.soort === 'blok') k.kinderen.forEach(loop); }; loop(w); return uit; }

export function useWerkbladBlokken(o: WerkbladBlokkenOpties) {
  const { lang, klasse } = o;
  const [aan, zetAan] = useState(false);
  const [lagen, zetLagen] = useState<Partial<Record<ApparaatKlasse, Blokken>>>({});
  const lagenB = useRef(lagen); lagenB.current = lagen;
  const [keuze, zetKeuze] = useState<{ inst: string; ids: KnoopId[] } | null>(null);
  const [staat, zetStaat] = useState<BewaarStaat>({ staat: 'rust' });
  const [kiezer, zetKiezer] = useState<{ bron: Sleepbron; titel: string } | null>(null);
  const [toevoegen, zetToevoegen] = useState<'' | 'icoon' | 'vervang'>('');
  const [, tik] = useState(0);
  const gesch = useRef(new LaagGeschiedenis<Momentopname>());
  const klokken = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const laatstePad = useRef<{ pad?: string; tijd: number }>({ tijd: 0 });
  const optRef = useRef(o); optRef.current = o;
  const laagSleutel = `${o.rctx.ruimte}:${klasse || 'computer'}`;

  const laad = useCallback(async () => {
    try {
      const a = await laadBlokken();
      if (!a.aan) { zetAan(false); return; }
      const l: Partial<Record<ApparaatKlasse, Blokken>> = {};
      for (const [k, v] of Object.entries(a.lagen) as [ApparaatKlasse, { versie: number; blokken: Blokken }][]) { l[k] = v.blokken; optRef.current.zetVersie(k, v.versie); }
      lagenB.current = l; zetLagen(l); zetAan(true);
    } catch { zetAan(false); }
  }, []);
  useEffect(() => { void laad(); }, [laad]);

  // -------------------------------------------------------------- welk blok hoort bij een canvasobject
  const blokVan = useCallback((e: DesktopEntry, a: ApparaatKlasse | null = optRef.current.klasse): BlokInhoud | null => {
    if (!heeftBlok(e) || !a) return null;
    const b = lagenB.current[a]?.[e.instanceId]; if (b) return b;
    const l = optRef.current.lagenRef.current[a]?.layout;
    if (e.itemId === SNEL_TOEGANG) {
      const ids = optRef.current.snelToegangItems.filter((id) => toegestaanVoor(registerItem(id), optRef.current.rctx).ok);
      return standaardSnelToegang(e.instanceId, ids);
    }
    return standaardMap(e, l?.items || []);
  }, []);
  /** Alle blokken van de huidige laag (bewaard of standaard), per instanceId. */
  const huidige = useCallback((): Blokken => {
    const a = optRef.current.klasse; const l = a && optRef.current.lagenRef.current[a]?.layout; if (!a || !l) return {};
    const uit: Blokken = {};
    for (const e of l.items) if (heeftBlok(e) && !e.parent) { const b = blokVan(e, a); if (b) uit[e.instanceId] = b; }
    return uit;
  }, [blokVan]);
  const momentopname = useCallback((): Momentopname | null => {
    const a = optRef.current.klasse; const l = a && optRef.current.lagenRef.current[a]?.layout; return l ? { blokken: huidige(), layout: l } : null;
  }, [huidige]);

  // -------------------------------------------------------------- bewaren (vertraagd, in dezelfde keten als v3)
  const stuurBlok = useCallback((a: ApparaatKlasse, inst: string) => {
    const o2 = optRef.current;
    zetStaat({ staat: 'bezig' });
    o2.keten.current = o2.keten.current.catch(() => undefined).then(async () => {
      const blok = lagenB.current[a]?.[inst]; if (!blok) return;
      if (!o2.lagenRef.current[a]?.layout.items.some((e) => e.instanceId === inst)) return; // object is weg
      try {
        const r = await bewaarBlok(a, inst, { ...blok, bron: 'eigen' }, o2.lagenRef.current[a]?.versie ?? 0);
        optRef.current.zetVersie(a, r.versie);
        zetStaat({ staat: 'bewaard', melding: tr(o2.lang, 'Збережено', 'Bewaard') });
      } catch (e) {
        if (e instanceof BlokkenVerouderd) {
          zetStaat({ staat: 'mislukt', fout: tr(o2.lang, 'Змінено в іншій вкладці', 'Gewijzigd in een ander tabblad') });
          o2.melding(tr(o2.lang, 'Блоки змінено в іншій вкладці або на іншому пристрої. Показано новішу версію — повторіть свою зміну.', 'De blokken zijn in een ander tabblad of op een ander apparaat gewijzigd. De nieuwere versie wordt getoond — herhaal uw wijziging.'));
          await o2.herladenV3(); await laad();
        } else if (e instanceof BlokkenGeweigerd) {
          const tech = e.fouten.some((f) => f.startsWith('item-niet-toegestaan'));
          zetStaat({ staat: 'mislukt', fout: e.code });
          o2.melding(tech ? tr(o2.lang, 'Сервер не дозволив: цей значок можна тримати лише в технічному просторі. Зміну скасовано.', 'De server weigerde: dit icoon mag alleen in de technische ruimte staan. De wijziging is teruggedraaid.')
            : tr(o2.lang, `Сервер не прийняв зміну (${e.fouten[0] || e.code}). Зміну скасовано.`, `De server weigerde de wijziging (${e.fouten[0] || e.code}). De wijziging is teruggedraaid.`));
          await laad();
        } else zetStaat({ staat: 'mislukt', fout: String((e as Error)?.message || e) });
      }
    });
  }, [laad]);
  const plan = useCallback((a: ApparaatKlasse, inst: string, direct = false) => {
    const k = `${a}|${inst}`; const oud = klokken.current.get(k); if (oud) clearTimeout(oud);
    zetStaat({ staat: 'bezig' });
    if (direct) { klokken.current.delete(k); stuurBlok(a, inst); return; }
    klokken.current.set(k, setTimeout(() => { klokken.current.delete(k); stuurBlok(a, inst); }, 400));
  }, [stuurBlok]);
  useEffect(() => () => { for (const t of klokken.current.values()) clearTimeout(t); }, []);

  /** Nieuwe toestand van één of meer blokken (+ eventueel de canvaslaag). Legt de vorige toestand vast voor Ctrl+Z. */
  const pasToe = useCallback((nieuw: Blokken, layout: CanvasLayout | null, opties: { pad?: string; direct?: boolean; geenGeschiedenis?: boolean } = {}) => {
    const a = optRef.current.klasse; if (!a) return;
    const voor = momentopname();
    const nu = Date.now();
    const samenvoegen = !!opties.pad && opties.pad === laatstePad.current.pad && nu - laatstePad.current.tijd < 800;
    laatstePad.current = { pad: opties.pad, tijd: nu };
    if (voor && !opties.geenGeschiedenis && !samenvoegen) gesch.current.legVast(laagSleutel, voor);
    const oud = lagenB.current[a] || {};
    const volgend = { ...oud, ...nieuw };
    const n = { ...lagenB.current, [a]: volgend }; lagenB.current = n; zetLagen(n);
    if (layout) optRef.current.bewaarLaag(a, layout);
    for (const inst of Object.keys(nieuw)) plan(a, inst, opties.direct || !!layout);
    tik((x) => x + 1);
  }, [momentopname, plan, laagSleutel]);

  const herstelMoment = useCallback((m: Momentopname) => {
    const a = optRef.current.klasse; if (!a) return;
    const nu = huidige();
    const huidigeLayout = optRef.current.lagenRef.current[a]?.layout;
    if (huidigeLayout !== m.layout) optRef.current.bewaarLaag(a, m.layout);
    const n = { ...lagenB.current, [a]: { ...(lagenB.current[a] || {}), ...m.blokken } }; lagenB.current = n; zetLagen(n);
    for (const inst of Object.keys(m.blokken)) if (JSON.stringify(nu[inst]) !== JSON.stringify(m.blokken[inst])) plan(a, inst, true);
    tik((x) => x + 1);
  }, [huidige, plan]);
  const ongedaan = useCallback(() => { const m = momentopname(); if (!m) return false; const t = gesch.current.ongedaan(laagSleutel, m); if (!t) return false; herstelMoment(t); optRef.current.melding(tr(lang, 'Дію скасовано.', 'Ongedaan gemaakt.')); return true; }, [momentopname, herstelMoment, laagSleutel, lang]);
  const opnieuw = useCallback(() => { const m = momentopname(); if (!m) return false; const t = gesch.current.opnieuw(laagSleutel, m); if (!t) return false; herstelMoment(t); optRef.current.melding(tr(lang, 'Дію повторено.', 'Opnieuw gedaan.')); return true; }, [momentopname, herstelMoment, laagSleutel, lang]);

  // Ctrl+Z / Ctrl+Shift+Z (en Ctrl+Y) zolang er een blokonderdeel gekozen is of de focus in een blok/paneel staat.
  useEffect(() => {
    if (!aan || !o.bewerken) return;
    const f = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input,textarea,select,[contenteditable="true"]')) return;
      const inBlok = !!t?.closest('[data-blk-inst],.eig-paneel,[data-blk-werkbalk]') || !!keuzeRef.current;
      if (!inBlok) return;
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'y') { const ok = (k === 'y' || e.shiftKey) ? opnieuw() : ongedaan(); if (ok || inBlok) { e.preventDefault(); e.stopPropagation(); } }
    };
    addEventListener('keydown', f, true); return () => removeEventListener('keydown', f, true);
  }, [aan, o.bewerken, ongedaan, opnieuw]);
  const keuzeRef = useRef(keuze); keuzeRef.current = keuze;
  useEffect(() => { if (!o.bewerken) { zetKeuze(null); zetKiezer(null); zetToevoegen(''); } }, [o.bewerken]);

  // -------------------------------------------------------------- slepen en «Перемістити в…»
  const ctxVan = useCallback((): PlekContext => {
    const a = optRef.current.klasse; const l = a ? optRef.current.lagenRef.current[a]?.layout : undefined;
    return { wortels: samengesteldeWortels(huidige()), plekken: [], ruimte: optRef.current.rctx.ruimte, ruimtesVan: (id) => registerItem(id, optRef.current.persoonlijk)?.ruimtes, canvas: l?.items || [] };
  }, [huidige]);
  const plekVan = useCallback((id: string): Plek | null => {
    const i = id.indexOf(':'); if (i < 1) return null;
    const soort = id.slice(0, i) as Plek['soort'];
    if (soort === 'menu') return menuPlek(id.slice(5));
    if (soort === 'canvas' || soort === 'blok') return maakPlek(soort, id.slice(i + 1));
    return null;
  }, []);
  const beoordeel = useCallback((bron: Sleepbron, n: Neerzetting): NeerzetOordeel => {
    const c = ctxVan(); const r = beoordeelNeerzetting(bron, n, c);
    if (!r.ok) return r;
    // Extra integratieregels: naar het menu alleen diensten (svc:…); naar het werkblad alleen losse onderdelen.
    if (n.doel.soort === 'menu' && bron.van === 'blok') { const z = uiteen(bron.knoopId); const k = z && huidige()[z.instanceId] && zoekKnoop(huidige()[z.instanceId].wortel, z.knoopId)?.knoop; if (!k || k.soort !== 'onderdeel' || !/^svc:/.test(k.itemId)) return { ok: false, reden: 'soort-niet-toegestaan' }; }
    if (n.doel.soort === 'canvas' && bron.van === 'blok') { const z = uiteen(bron.knoopId); const k = z && huidige()[z.instanceId] && zoekKnoop(huidige()[z.instanceId].wortel, z.knoopId)?.knoop; if (!k || k.soort !== 'onderdeel') return { ok: false, reden: 'soort-niet-toegestaan' }; }
    return r;
  }, [ctxVan, huidige]);
  const tekstVan = useCallback((oo: NeerzetOordeel, p: Plek) => redenTekst(oo, p, {}, optRef.current.lang), []);

  const naamVan = useCallback((itemId: string) => { const r = registerItem(itemId, optRef.current.persoonlijk); return r ? r.titel[optRef.current.lang] : itemId; }, []);

  /** Eén neerzetting uitvoeren (slepen of «Перемістити в…»). */
  const voerUit = useCallback((bron: Sleepbron, n: Neerzetting, oordeel: NeerzetOordeel) => {
    const o2 = optRef.current; const a = o2.klasse; const l = a && o2.lagenRef.current[a]?.layout;
    if (!a || !l) return;
    if (!oordeel.ok) { o2.melding(tekstVan(oordeel, n.doel)); return; }
    const alle = huidige(); const bezet = alleIds(alle);
    if (bron.van !== 'blok') return; // werkblad→blok loopt via de canvas-commit (opCanvasCommit)
    const z = uiteen(bron.knoopId); if (!z || !alle[z.instanceId]) return;
    const bronBlok = alle[z.instanceId];
    const gevonden = zoekKnoop(bronBlok.wortel, z.knoopId); if (!gevonden || !gevonden.ouder) return;
    const knoop = gevonden.knoop;
    const titel = knoop.soort === 'onderdeel' ? (knoop.label?.tekst || naamVan(knoop.itemId)) : (knoop.titel || tr(lang, 'Блок', 'Blok'));
    if (n.doel.soort === 'blok') {
      const d = uiteen(n.doel.id.slice(5)); if (!d || !alle[d.instanceId]) return;
      const voor = n.voor ? uiteen(n.voor)?.knoopId ?? null : null;
      const zelfde = d.instanceId === z.instanceId;
      let bronW = bronBlok.wortel;
      if (!n.kopie) { const w = haalWeg(bronW, z.knoopId); if (!w) return; bronW = w.wortel; }
      const mee = n.kopie || !zelfde ? (n.kopie ? herId(knoop, bezet, 'k') : knoop) : knoop;
      const doelW = zelfde ? bronW : alle[d.instanceId].wortel;
      // positie: canvas-px → blok-px (schaal van het canvas)
      const s = Number(o2.houder.current?.querySelector<HTMLElement>('.wbc')?.dataset.schaal) || 1;
      const nieuwDoel = voegIn(doelW, d.knoopId, mee, voor, n.positie ? { x: n.positie.x / s, y: n.positie.y / s } : undefined);
      if (!nieuwDoel) return;
      const uit: Blokken = zelfde ? { [z.instanceId]: { ...bronBlok, wortel: nieuwDoel, bron: 'eigen' } }
        : { [z.instanceId]: { ...bronBlok, wortel: bronW, bron: 'eigen' }, [d.instanceId]: { ...alle[d.instanceId], wortel: nieuwDoel, bron: 'eigen' } };
      // map: de oude kind-snelkoppeling (verborgen, voor terugval) verdwijnt als het onderdeel de map verlaat
      let layout: CanvasLayout | null = null;
      if (!zelfde && !n.kopie && l.items.some((e) => e.instanceId === z.knoopId && e.parent === z.instanceId)) layout = { ...l, items: l.items.filter((e) => e.instanceId !== z.knoopId) };
      pasToe(uit, layout);
      zetKeuze({ inst: d.instanceId, ids: [mee.id] });
      o2.melding(n.kopie ? tr(lang, `«${titel}» скопійовано.`, `«${titel}» gekopieerd.`) : tr(lang, `«${titel}» переміщено.`, `«${titel}» verplaatst.`));
      return;
    }
    if (n.doel.soort === 'canvas' && knoop.soort === 'onderdeel') {
      const s = Number(o2.houder.current?.querySelector<HTMLElement>('.wbc')?.dataset.schaal) || 1;
      let inst = ''; for (;;) { inst = `i-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; if (!l.items.some((e) => e.instanceId === inst)) break; }
      const w0 = onderdeelNaarCanvas(knoop, { x: 0, y: 0, z: l.items.reduce((m, e) => Math.max(m, e.z), 0) + 1 }, inst);
      const g = K.grenzenVan(undefined, w0.itemId, l.canvasWidth);
      const ww = Math.max(72, Math.min(192, w0.w)), hh = Math.max(80, Math.min(208, w0.h)); void g;
      const start = n.positie ? { x: Math.round(n.positie.x / s - ww / 2), y: Math.round(n.positie.y / s - hh / 2) } : { x: 16, y: 16 };
      const ruw = K.klemInCanvas({ ...start, w: ww, h: hh }, l);
      const plek = K.vrijePlek(l, inst, ruw, 8, 6000) || { ...ruw, y: K.benodigdeHoogte(l) };
      const entry: DesktopEntry = { ...w0, ...plek };
      let items = [...l.items, entry];
      const uit: Blokken = {};
      if (!n.kopie) {
        const w = haalWeg(bronBlok.wortel, z.knoopId); if (w) uit[z.instanceId] = { ...bronBlok, wortel: w.wortel, bron: 'eigen' };
        items = items.filter((e) => !(e.instanceId === z.knoopId && e.parent === z.instanceId));
      }
      pasToe(uit, { ...l, items });
      zetKeuze(null);
      o2.melding(tr(lang, `«${titel}» тепер окремий ярлик на робочому столі (колір і форма збережені).`, `«${titel}» staat nu los op het werkblad (kleur en vorm blijven).`));
      return;
    }
    if (n.doel.soort === 'menu' && knoop.soort === 'onderdeel') {
      const lijst = menuLijstVan(n.doel.id) || 'zijbalk|';
      const dienst = knoop.itemId.slice(4);
      const detail: { dienst: string; lijst: string; voor: string | null; uitkomst?: 'toegevoegd' | 'bestaat' | 'geweigerd' } = { dienst, lijst, voor: n.voor };
      dispatchEvent(new CustomEvent(MENU_EVENT, { detail }));
      o2.melding(detail.uitkomst === 'toegevoegd' ? tr(lang, `«${titel}» додано в меню (у блоці значок теж лишається).`, `«${titel}» is aan het menu toegevoegd (het icoon blijft ook in het blok).`)
        : detail.uitkomst === 'bestaat' ? tr(lang, `«${titel}» уже є в цьому місці меню.`, `«${titel}» staat al op deze plek in het menu.`)
          : tr(lang, `«${titel}» не можна покласти в це місце меню.`, `«${titel}» kan niet op deze plek in het menu.`));
    }
  }, [huidige, pasToe, naamVan, tekstVan, lang]);
  const voerUitRef = useRef(voerUit); voerUitRef.current = voerUit;
  const beoordeelRef = useRef(beoordeel); beoordeelRef.current = beoordeel;

  /** Plekken buiten de attributen om: blokken (platte DOM van BlokWeergave), het bichne menu en het canvas. */
  const extraPlekken = useMemo<ExternePlek[]>(() => {
    const blok: ExternePlek = {
      vind(el) {
        const vak = el?.closest<HTMLElement>('[data-blk-inst]'); if (!vak) return null;
        const inst = vak.dataset.blkInst || ''; const b = huidige()[inst]; if (!b) return null;
        let k = el?.closest<HTMLElement>('[data-knoop-id]') || null;
        while (k && k.dataset.wbSleept === 'ja') k = k.parentElement?.closest<HTMLElement>('[data-knoop-id]') || null;
        let blokId = b.wortel.id;
        if (k && k.classList.contains('blk-blok')) blokId = k.dataset.knoopId || blokId;
        else if (k && k.classList.contains('blk-tegel')) blokId = zoekKnoop(b.wortel, k.dataset.knoopId || '')?.ouder?.id || blokId;
        const plekEl = blokId === b.wortel.id ? vak.querySelector<HTMLElement>('.blk-wortel') || vak : vak.querySelector<HTMLElement>(`.blk-blok[data-knoop-id="${CSS.escape(blokId)}"]`) || vak;
        plekEl.dataset.blkPlekInst = inst; plekEl.dataset.blkPlekId = blokId;
        return { el: plekEl, plekId: `blok:${samen(inst, blokId)}` };
      },
      voor(plekEl, x, y, sleepEl) {
        const inst = plekEl.dataset.blkPlekInst || ''; const id = plekEl.dataset.blkPlekId || '';
        const b = huidige()[inst]; const z = b && zoekKnoop(b.wortel, id); const vak = plekEl.closest<HTMLElement>('[data-blk-inst]');
        if (!z || z.knoop.soort !== 'blok' || !vak) return { voor: null, lijn: null, richting: 'h' };
        const modus = z.knoop.indeling.modus; const richting = modus === 'kolom' ? 'v' : 'h';
        if (modus === 'vrij') return { voor: null, lijn: null, richting };
        const kinderen = z.knoop.kinderen.map((c) => vak.querySelector<HTMLElement>(`[data-knoop-id="${CSS.escape(c.id)}"]`)).filter((e): e is HTMLElement => !!e && e !== sleepEl);
        let voorEl: HTMLElement | null = null;
        for (const c of kinderen) { const r = c.getBoundingClientRect(); const ervoor = richting === 'h' ? (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) : y < r.top + r.height / 2; if (ervoor) { voorEl = c; break; } }
        const ref = voorEl || kinderen[kinderen.length - 1]; let lijn: DOMRect | null = null;
        if (ref) { const r = ref.getBoundingClientRect(); lijn = richting === 'h' ? new DOMRect(voorEl ? r.left - 3 : r.right + 1, r.top, 3, r.height) : new DOMRect(r.left, voorEl ? r.top - 3 : r.bottom + 1, r.width, 3); }
        return { voor: voorEl ? samen(inst, voorEl.dataset.knoopId || '') : null, lijn, richting };
      },
    };
    const canvas: ExternePlek = {
      vind(el) { const w = el?.closest<HTMLElement>('.wbc'); if (!w || el?.closest('[data-blk-inst]')) return null; return { el: w, plekId: `canvas:${optRef.current.klasse || 'computer'}` }; },
      voor() { return { voor: null, lijn: null, richting: 'h' }; },
    };
    return [blok, menuAlsPlek({ menuWortel: document.body }), canvas];
  }, [huidige]);

  /** Sleepregelaar per blokvak (binnen het canvasobject, zodat het canvas het object zelf niet meesleept). */
  const koppelVak = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const vorige = (el as HTMLDivElement & { __blkWeg?: () => void }).__blkWeg; vorige?.();
    const r = installeerSleepregelaar({
      wortel: el, plek: plekVan, beoordeel: (b, n) => beoordeelRef.current(b, n), redenTekst: tekstVan,
      opNeerzetten: (b, n, oo) => voerUitRef.current(b, n, oo),
      opEinde: (u) => { if (u === 'geannuleerd') optRef.current.melding(tr(optRef.current.lang, 'Перетягування скасовано.', 'Slepen geannuleerd.')); },
      extraPlekken,
    });
    // Na de sleepregelaar: het canvas mag het object niet verplaatsen als een tegel/blok binnenin wordt vastgepakt.
    const stop = (e: PointerEvent) => { if ((e.target as HTMLElement | null)?.closest('[data-knoop-id],[data-blk-werkbalk]')) e.stopPropagation(); };
    const stopToets = (e: KeyboardEvent) => { if ((e.target as HTMLElement | null)?.closest('[data-knoop-id],[data-blk-werkbalk]')) e.stopPropagation(); };
    el.addEventListener('pointerdown', stop); el.addEventListener('keydown', stopToets);
    (el as HTMLDivElement & { __blkWeg?: () => void }).__blkWeg = () => { r.verwijder(); el.removeEventListener('pointerdown', stop); el.removeEventListener('keydown', stopToets); };
  }, [plekVan, tekstVan, extraPlekken]);

  // -------------------------------------------------------------- canvas → blok (snelkoppeling losgelaten boven een blok)
  /** Geeft de layout terug zonder de snelkoppelingen die in een blok zijn beland (en werkt die blokken bij), of null = niets. */
  const opCanvasCommit = useCallback((oud: CanvasLayout, nieuw: CanvasLayout): CanvasLayout | null => {
    if (!aan) return null;
    const a = optRef.current.klasse; if (!a) return null;
    const vakken = nieuw.items.filter((e) => e.itemId === SNEL_TOEGANG && !e.parent);
    const alle = huidige(); const bezet = alleIds(alle); const uit: Blokken = {}; let items = nieuw.items; let titel = '';
    // Map met een bewaard blok: een snelkoppeling die net in de map is gezet (parent) komt ook in het blok (id = instanceId).
    for (const e of nieuw.items) {
      if (!e.parent || e.kind !== 'shortcut' || oud.items.find((x) => x.instanceId === e.instanceId)?.parent === e.parent) continue;
      const opgeslagen = lagenB.current[a]?.[e.parent]; if (!opgeslagen || bezet.has(e.instanceId)) continue;
      const knoop = onderdeelVanCanvas(e, e.instanceId); delete knoop.positie; knoop.afmeting = { breedte: MAAT_AUTO, hoogte: MAAT_AUTO };
      const w = voegIn((uit[e.parent] || opgeslagen).wortel, (uit[e.parent] || opgeslagen).wortel.id, knoop, null); if (w) { uit[e.parent] = { ...opgeslagen, wortel: w, bron: 'eigen' }; titel = e.titleOverride || naamVan(e.itemId); }
    }
    for (const e of nieuw.items) {
      if (e.kind !== 'shortcut' || e.parent) continue;
      const o0 = oud.items.find((x) => x.instanceId === e.instanceId); if (!o0 || (o0.x === e.x && o0.y === e.y)) continue;
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      const v = vakken.find((f) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h); if (!v) continue;
      const b = uit[v.instanceId] || alle[v.instanceId]; if (!b) continue;
      const oordeel = beoordeelNeerzetting({ van: 'canvas', instanceId: e.instanceId }, { doel: maakPlek('blok', samen(v.instanceId, b.wortel.id)), voor: null, kopie: false }, { ...ctxVan(), canvas: nieuw.items });
      if (!oordeel.ok) { optRef.current.melding(tekstVan(oordeel, maakPlek('blok', b.wortel.id))); continue; }
      const knoop = onderdeelVanCanvas(e, vrijeId(bezet, 'k'));
      delete knoop.positie; knoop.afmeting = { breedte: MAAT_AUTO, hoogte: MAAT_AUTO };
      const w = voegIn(b.wortel, b.wortel.id, knoop, null); if (!w) continue;
      uit[v.instanceId] = { ...b, wortel: w, bron: 'eigen' };
      items = items.filter((x) => x.instanceId !== e.instanceId);
      titel = e.titleOverride || naamVan(e.itemId);
    }
    if (!Object.keys(uit).length) return null;
    const layout = { ...nieuw, items };
    pasToe(uit, layout);
    optRef.current.melding(tr(lang, `«${titel}» додано до блоку.`, `«${titel}» is aan het blok toegevoegd.`));
    return layout;
  }, [aan, huidige, ctxVan, tekstVan, naamVan, pasToe, lang]);

  // -------------------------------------------------------------- werkbalk-acties
  const gekozenBlok = keuze ? huidige()[keuze.inst] : undefined;
  const gekozenKnoop = keuze && gekozenBlok && keuze.ids.length === 1 ? zoekKnoop(gekozenBlok.wortel, keuze.ids[0]) : null;
  const wijzigWortel = useCallback((inst: string, w: Blok, pad?: string) => { const b = huidige()[inst]; if (b) pasToe({ [inst]: { ...b, wortel: w, bron: 'eigen' } }, null, { pad }); }, [huidige, pasToe]);
  const doeBoom = (f: () => Blok, ok: string) => {
    if (!keuze) return;
    try { wijzigWortel(keuze.inst, f()); o.melding(ok); }
    catch (e) {
      const c = e instanceof BlokFout ? e.code : String(e);
      o.melding(c === 'verschillende-ouders' ? tr(lang, 'Згрупувати можна лише значки з одного блоку.', 'Alleen iconen uit hetzelfde blok kunnen samen.')
        : c === 'te-diep' ? tr(lang, 'Не можна: максимум 4 рівні блоків.', 'Niet mogelijk: hoogstens 4 niveaus blokken.')
          : c === 'vol' ? tr(lang, 'Не можна: блок заповнений.', 'Niet mogelijk: het blok is vol.') : tr(lang, `Не вдалося (${c}).`, `Mislukt (${c}).`));
    }
  };
  /** Cellen die een groep in een raster nodig heeft: rij = som van de breedtes, kolom = som van de hoogtes (max 4). */
  const natuurlijkeSpan = (g: Blok): { kolommen: number; rijen: number } => {
    const maat = (k: Knoop) => (k.soort === 'blok' ? (k.rasterSpan || natuurlijkeSpan(k)) : { kolommen: 1, rijen: 1 });
    const m = g.kinderen.map(maat); const som = (f: 'kolommen' | 'rijen') => m.reduce((t, x) => t + x[f], 0); const max = (f: 'kolommen' | 'rijen') => m.reduce((t, x) => Math.max(t, x[f]), 1);
    const r = g.indeling.modus === 'rij' ? { kolommen: som('kolommen'), rijen: max('rijen') } : g.indeling.modus === 'kolom' ? { kolommen: max('kolommen'), rijen: som('rijen') } : { kolommen: max('kolommen'), rijen: max('rijen') };
    return { kolommen: Math.min(4, Math.max(1, r.kolommen)), rijen: Math.min(6, Math.max(1, r.rijen)) };
  };
  const groepeerNu = (modus: 'rij' | 'kolom') => {
    if (!keuze || !gekozenBlok) return;
    const ids = keuze.ids.filter((i) => i !== gekozenBlok.wortel.id);
    if (!ids.length) { o.melding(tr(lang, 'Спершу виберіть значки (Shift+клік — кілька).', 'Kies eerst iconen (Shift+klik — meerdere).')); return; }
    let nieuwId = '';
    doeBoom(() => { const w = groepeer(gekozenBlok.wortel, ids, modus); const z = zoekKnoop(w, ids[0]); const g = z?.ouder; if (g && g.id !== w.id) { const ander = alleIds(Object.fromEntries(Object.entries(huidige()).filter(([k]) => k !== keuze.inst))); for (const i of knoopIdsZonder(w, g.id)) ander.add(i); if (ander.has(g.id)) g.id = vrijeId(ander, 'g'); nieuwId = g.id;
      // In een raster krijgt de nieuwe groep zoveel cellen als ze onderdelen heeft (rij → kolommen, kolom → rijen), anders past ze niet in één cel.
      const ouder = zoekKnoop(w, g.id)?.ouder; if (ouder?.indeling.modus === 'raster') { g.rasterSpan = natuurlijkeSpan(g); g.indeling = { ...g.indeling, omloop: false }; } } return w; },
      modus === 'rij' ? tr(lang, 'Згруповано в ряд.', 'Gegroepeerd in een rij.') : tr(lang, 'Згруповано в колонку.', 'Gegroepeerd in een kolom.'));
    if (nieuwId) zetKeuze({ inst: keuze.inst, ids: [nieuwId] });
  };
  const ontgroepeerNu = () => {
    if (!keuze || !gekozenKnoop || gekozenKnoop.knoop.soort !== 'blok' || !gekozenKnoop.ouder) { o.melding(tr(lang, 'Виберіть вкладений блок, щоб розгрупувати.', 'Kies een genest blok om te ontgroeperen.')); return; }
    const id = gekozenKnoop.knoop.id; doeBoom(() => ontgroepeer(gekozenBlok!.wortel, id), tr(lang, 'Розгруповано.', 'Ontgroepeerd.'));
    zetKeuze({ inst: keuze.inst, ids: [] });
  };
  const doelBlokId = () => (gekozenKnoop ? (gekozenKnoop.knoop.soort === 'blok' ? gekozenKnoop.knoop.id : gekozenKnoop.ouder?.id) : gekozenBlok?.wortel.id) || gekozenBlok?.wortel.id || '';
  const voegBlokToe = () => {
    if (!keuze || !gekozenBlok) return;
    const bezet = alleIds(huidige());
    const nieuw: Blok = { soort: 'blok', id: vrijeId(bezet, 'g'), afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0, indeling: { ...STANDAARD_INDELING, modus: 'rij', omloop: true }, kinderen: [], titel: tr(lang, 'Новий блок', 'Nieuw blok') };
    const w = voegIn(gekozenBlok.wortel, doelBlokId(), nieuw, null);
    if (!w) return;
    try { wijzigWortel(keuze.inst, w); zetKeuze({ inst: keuze.inst, ids: [nieuw.id] }); o.melding(tr(lang, 'Додано порожній блок. Перетягніть у нього значки.', 'Leeg blok toegevoegd. Sleep er iconen in.')); } catch { /* leeg */ }
  };
  const voegIcoonToe = (itemId: string) => {
    if (!keuze || !gekozenBlok) return;
    const item = registerItem(itemId, o.persoonlijk); const t = toegestaanVoor(item, o.rctx);
    if (!t.ok) { o.melding(t.reden[lang]); return; }
    const bezet = alleIds(huidige());
    const nieuw: Onderdeel = { soort: 'onderdeel', id: vrijeId(bezet, 'k'), itemId, afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0 };
    const w = voegIn(gekozenBlok.wortel, doelBlokId(), nieuw, null); if (!w) return;
    wijzigWortel(keuze.inst, w); zetKeuze({ inst: keuze.inst, ids: [nieuw.id] }); zetToevoegen('');
    o.melding(tr(lang, `«${item?.titel.uk || itemId}» додано до блоку.`, `«${item?.titel.nl || itemId}» toegevoegd aan het blok.`));
  };
  const verwijderNu = () => {
    if (!keuze || !gekozenBlok || !keuze.ids.length) return;
    let w = gekozenBlok.wortel; let n = 0;
    for (const id of keuze.ids) { if (id === w.id) continue; const r = haalWeg(w, id); if (r) { w = r.wortel; n++; } }
    if (!n) { o.melding(tr(lang, 'Цілий блок віджета не видаляється тут — приберіть віджет зі столу.', 'Het hele widgetblok verwijdert u hier niet — haal de widget van het werkblad.')); return; }
    const a = o.klasse; const l = a && o.lagenRef.current[a]?.layout;
    const kinderenWeg = l ? l.items.filter((e) => e.parent === keuze.inst && keuze.ids.includes(e.instanceId)).map((e) => e.instanceId) : [];
    pasToe({ [keuze.inst]: { ...gekozenBlok, wortel: w, bron: 'eigen' } }, l && kinderenWeg.length ? { ...l, items: l.items.filter((e) => !kinderenWeg.includes(e.instanceId)) } : null);
    zetKeuze({ inst: keuze.inst, ids: [] });
    o.melding(tr(lang, `Видалено з блоку: ${n}. Повернути — Ctrl+Z або «Скасувати дію».`, `Uit het blok gehaald: ${n}. Terugzetten — Ctrl+Z of «Ongedaan maken».`));
  };
  const vervangIcoon = (icoon: string | null) => {
    if (!keuze || !gekozenBlok || !gekozenKnoop || gekozenKnoop.knoop.soort !== 'onderdeel') return;
    const id = gekozenKnoop.knoop.id;
    const zet = (k: Knoop): Knoop => (k.id === id && k.soort === 'onderdeel' ? (() => { const c = { ...k, icoon: { grootte: k.icoon?.grootte ?? MAAT_AUTO, ...(k.icoon?.stijl ? { stijl: k.icoon.stijl } : {}) } as Onderdeel['icoon'] }; if (icoon) c.icoon!.vervang = icoon; return c; })() : k.soort === 'blok' ? { ...k, kinderen: k.kinderen.map(zet) } : k);
    wijzigWortel(keuze.inst, zet(gekozenBlok.wortel) as Blok); zetToevoegen('');
    o.melding(icoon ? tr(lang, 'Значок замінено.', 'Icoon vervangen.') : tr(lang, 'Повернуто звичайний значок.', 'Het gewone icoon is terug.'));
  };
  const openKiezer = useCallback(() => {
    const k = keuzeRef.current; if (!k || k.ids.length !== 1) { optRef.current.melding(tr(optRef.current.lang, 'Виберіть один значок або блок.', 'Kies één icoon of blok.')); return; }
    const b = huidige()[k.inst]; const z = b && zoekKnoop(b.wortel, k.ids[0]);
    if (!z || !z.ouder) { optRef.current.melding(tr(optRef.current.lang, 'Сам віджет переміщуйте на столі.', 'De widget zelf verplaatst u op het werkblad.')); return; }
    zetKiezer({ bron: { van: 'blok', knoopId: samen(k.inst, z.knoop.id) }, titel: z.knoop.soort === 'onderdeel' ? (z.knoop.label?.tekst || naamVan(z.knoop.itemId)) : (z.knoop.titel || tr(optRef.current.lang, 'Блок', 'Blok')) });
  }, [huidige, naamVan]);
  // Sneltoets «Перемістити в…»: M (of F2) op een gekozen onderdeel.
  useEffect(() => {
    if (!aan || !o.bewerken) return;
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (!t?.closest('[data-blk-inst]') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'F2' || e.key.toLowerCase() === 'm') { e.preventDefault(); e.stopPropagation(); openKiezer(); }
      if (e.key === 'Delete') { e.preventDefault(); e.stopPropagation(); verwijderRef.current(); }
    };
    addEventListener('keydown', f, true); return () => removeEventListener('keydown', f, true);
  }, [aan, o.bewerken, openKiezer]);
  const verwijderRef = useRef(verwijderNu); verwijderRef.current = verwijderNu;

  const keuzes = (): PlekKeuze[] => {
    const alle = huidige(); const uit: PlekKeuze[] = [{ plek: maakPlek('canvas', klasse || 'computer'), titel: tr(lang, 'Робочий стіл (окремий ярлик)', 'Werkblad (losse snelkoppeling)'), kinderen: [] }];
    const a = o.klasse; const l = a && o.lagenRef.current[a]?.layout;
    for (const [inst, b] of Object.entries(alle)) {
      const e = l?.items.find((x) => x.instanceId === inst);
      const basis = e?.itemId === SNEL_TOEGANG ? tr(lang, 'Швидкий доступ', 'Snelle toegang') : (e?.titleOverride || tr(lang, 'Папка', 'Map'));
      const loop = (blk: Blok, pad: string) => {
        uit.push({ plek: maakPlek('blok', samen(inst, blk.id)), titel: pad, kinderen: blk.kinderen.map((c) => ({ id: samen(inst, c.id), titel: c.soort === 'onderdeel' ? (c.label?.tekst || naamVan(c.itemId)) : `▦ ${c.titel || tr(lang, 'Блок', 'Blok')}` })) });
        blk.kinderen.forEach((c) => { if (c.soort === 'blok') loop(c, `${pad} › ${c.titel || tr(lang, 'Блок', 'Blok')}`); });
      };
      loop(b.wortel, basis);
    }
    for (const m of menuPlekkenUitDom(document.body)) uit.push({ ...m, titel: `${tr(lang, 'Меню', 'Menu')}: ${m.titel}` });
    return uit;
  };

  const herstel = useCallback(async (welke: 'na' | 'voor' = 'na') => {
    try {
      const r = await herstelBlokken(welke);
      await optRef.current.herladenV3(); await laad();
      optRef.current.melding(r.hersteld ? tr(optRef.current.lang, `Блоки відновлено: ${r.hersteld}.`, `Blokken hersteld: ${r.hersteld}.`) : tr(optRef.current.lang, 'Немає збережених блоків для відновлення.', 'Er zijn geen bewaarde blokken om te herstellen.'));
    } catch (e) { optRef.current.melding(tr(optRef.current.lang, `Не вдалося відновити (${String((e as Error)?.message || e)}).`, `Herstellen mislukt (${String((e as Error)?.message || e)}).`)); }
  }, [laad]);

  // -------------------------------------------------------------- weergave van één vak
  const beschrijf = useCallback((itemId: string, on?: Onderdeel) => {
    const r = registerItem(itemId, optRef.current.persoonlijk);
    return { naam: r ? r.titel[optRef.current.lang] : itemId, icoon: () => <TegelIcoon itemId={itemId} icoon={on?.icoon?.vervang || r?.icoon || 'dot'} /> };
  }, []);
  const vakVoor = (e: DesktopEntry, bewerken: boolean): ReactNode => {
    const b = blokVan(e); if (!b) return null;
    const actief = bewerken && o.magBewerken;
    const wortel = b.wortel;
    const geselecteerd = new Set(keuze?.inst === e.instanceId ? keuze.ids : []);
    return (
      <div className={`blk-vak${actief ? ' is-bewerken' : ''}`} data-blk-inst={e.instanceId} ref={actief ? koppelVak : undefined}>
        <BlokWeergave wortel={wortel} apparaat={klasse || 'computer'} beschrijf={beschrijf} hoogte='inhoud' taal={lang} bewerken={actief} geselecteerd={geselecteerd}
          opActiveer={(on) => { const item = registerItem(on.itemId, o.persoonlijk); const u = startItem(item, o.rctx, lang, o.persoonlijk); if (!u.ok && !u.toestemming.ok) o.melding(u.toestemming.reden[lang]); }}
          opSelecteer={(id, uit) => zetKeuze((k) => (uit && k?.inst === e.instanceId ? { inst: e.instanceId, ids: k.ids.includes(id) ? k.ids.filter((x) => x !== id) : [...k.ids, id] } : { inst: e.instanceId, ids: [id] }))} />
        {actief ? <TegelSleep vak={e.instanceId} wortelId={b.wortel.id} /> : null}
        {actief ? (
          <div className='blk-vak-balk' data-blk-werkbalk=''>
            <button type='button' className='knop-stil is-klein' data-blk-actie='kies-blok' onClick={() => zetKeuze({ inst: e.instanceId, ids: [b.wortel.id] })}>{tr(lang, 'Весь блок', 'Hele blok')}</button>
          </div>
        ) : null}
      </div>
    );
  };
  /** Losse snelkoppeling met een bewaarde blokstijl (config.blokStijl) → zelfde tekening als in een blok; anders null. */
  const losseTegel = (e: DesktopEntry, bewerken: boolean): ReactNode => {
    if (e.kind !== 'shortcut' || !e.config || typeof e.config.blokStijl !== 'string') return null;
    const on = onderdeelVanCanvas(e, 'los'); on.afmeting = { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }; delete on.positie;
    const w: Blok = { soort: 'blok', id: 'w-los', afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0, indeling: { ...STANDAARD_INDELING, rasterKolommen: 1, binnenrand: 0 }, kinderen: [on] };
    return <div className='blk-los' data-blk-los={e.instanceId}><BlokWeergave wortel={w} apparaat={klasse || 'computer'} beschrijf={beschrijf} taal={lang} bewerken={bewerken}
      opActiveer={(x) => { if (bewerken) return; const item = registerItem(x.itemId, o.persoonlijk); const u = startItem(item, o.rctx, lang, o.persoonlijk); if (!u.ok && !u.toestemming.ok) o.melding(u.toestemming.reden[lang]); }} /></div>;
  };

  // -------------------------------------------------------------- paneel + werkbalk + kiezers
  const paneel: ReactNode = aan && o.bewerken && keuze && gekozenBlok ? (
    <div className='blk-zijpaneel' data-blk-paneel=''>
      <div className='blk-werkbalk' data-blk-werkbalk='' role='toolbar' aria-label={tr(lang, 'Дії з блоком', 'Acties met het blok')}>
        <button type='button' className='knop-secundair is-klein' data-blk-actie='groepeer-rij' onClick={() => groepeerNu('rij')} title={tr(lang, 'Вибрані значки стають рядом в окремому блоці. Shift+клік — вибрати кілька.', 'De gekozen iconen komen naast elkaar in een eigen blok. Shift+klik — meerdere kiezen.')}>{tr(lang, 'Згрупувати в ряд', 'Groeperen in rij')}</button>
        <button type='button' className='knop-secundair is-klein' data-blk-actie='groepeer-kolom' onClick={() => groepeerNu('kolom')}>{tr(lang, 'Згрупувати в колонку', 'Groeperen in kolom')}</button>
        <button type='button' className='knop-secundair is-klein' data-blk-actie='ontgroepeer' disabled={!gekozenKnoop || gekozenKnoop.knoop.soort !== 'blok' || !gekozenKnoop.ouder} onClick={ontgroepeerNu}>{tr(lang, 'Розгрупувати', 'Ontgroeperen')}</button>
        <button type='button' className='knop-secundair is-klein' data-blk-actie='plus-icoon' aria-expanded={toevoegen === 'icoon'} onClick={() => zetToevoegen((t) => (t === 'icoon' ? '' : 'icoon'))}>{tr(lang, '+ Додати значок', '+ Icoon toevoegen')}</button>
        <button type='button' className='knop-secundair is-klein' data-blk-actie='plus-blok' onClick={voegBlokToe}>{tr(lang, '+ Додати блок', '+ Blok toevoegen')}</button>
        <button type='button' className='knop-secundair is-klein' data-blk-actie='vervang' disabled={!gekozenKnoop || gekozenKnoop.knoop.soort !== 'onderdeel'} aria-expanded={toevoegen === 'vervang'} onClick={() => zetToevoegen((t) => (t === 'vervang' ? '' : 'vervang'))}>{tr(lang, 'Змінити значок', 'Icoon wijzigen')}</button>
        <button type='button' className='knop-secundair is-klein' data-blk-actie='verplaats' disabled={!gekozenKnoop || !gekozenKnoop.ouder} onClick={openKiezer} title={tr(lang, 'Клавіші: M або F2', 'Toetsen: M of F2')}>{tr(lang, 'Перемістити в…', 'Verplaatsen naar…')}</button>
        <button type='button' className='knop-stil is-klein' data-blk-actie='verwijder' disabled={!keuze.ids.some((i) => i !== gekozenBlok.wortel.id)} onClick={verwijderNu} title={tr(lang, 'Клавіша: Delete', 'Toets: Delete')}>{tr(lang, 'Видалити з блоку', 'Uit blok halen')}</button>
      </div>
      {toevoegen === 'icoon' ? (
        <div className='blk-keuzelijst' data-blk-keuze='icoon' role='listbox' aria-label={tr(lang, 'Що додати', 'Wat toevoegen')}>
          {WERKBLAD_REGISTER.filter((r) => r.kind === 'shortcut' && toegestaanVoor(r, o.rctx).ok).slice(0, 80).map((r) => (
            <button key={r.id} type='button' role='option' aria-selected='false' className='blk-keuze' data-blk-item={r.id} onClick={() => voegIcoonToe(r.id)}><span className='blk-keuze-icoon' aria-hidden='true'><RegisterIcoon icoon={r.icoon} /></span>{r.titel[lang]}</button>
          ))}
        </div>
      ) : null}
      {toevoegen === 'vervang' ? (
        <fieldset className='blk-icoonkiezer' data-blk-keuze='vervang'>
          <legend>{tr(lang, 'Значок (лише з набору)', 'Icoon (alleen uit de set)')}</legend>
          <button type='button' className='knop-stil is-klein' data-blk-icoon='' onClick={() => vervangIcoon(null)}>{tr(lang, 'Звичайний', 'Gewoon')}</button>
          {ICOON_PRESETS.map((i) => <button key={i} type='button' className='blk-icoonknop' data-blk-icoon={i} aria-label={i} onClick={() => vervangIcoon(i)}><RegisterIcoon icoon={i} /></button>)}
        </fieldset>
      ) : null}
      <EigenschappenPaneel wortel={gekozenBlok.wortel} geselecteerd={keuze.ids[0] ?? gekozenBlok.wortel.id} taal={lang} naamVan={naamVan} weergave='auto'
        onWijzig={(w, _m, pad) => wijzigWortel(keuze.inst, w, pad)} bewaarStaat={staat}
        onOpnieuwProberen={() => { const a = o.klasse; if (a) plan(a, keuze.inst, true); }}
        kanOngedaan={gesch.current.kan(laagSleutel).terug > 0} kanOpnieuw={gesch.current.kan(laagSleutel).vooruit > 0} onOngedaan={() => void ongedaan()} onOpnieuw={() => void opnieuw()}
        overlapToegestaan={(() => { const z = gekozenKnoop?.knoop; const blk = z?.soort === 'blok' ? z : gekozenKnoop?.ouder ?? gekozenBlok.wortel; return !!blk.indeling.overlapToestaan; })()}
        onOverlap={(v) => { const z = gekozenKnoop?.knoop; const blk = z?.soort === 'blok' ? z : gekozenKnoop?.ouder ?? gekozenBlok.wortel; const id = blk.id;
          const zet = (k: Knoop): Knoop => (k.soort !== 'blok' ? k : k.id === id ? { ...k, indeling: { ...k.indeling, overlapToestaan: v } } : { ...k, kinderen: k.kinderen.map(zet) });
          wijzigWortel(keuze.inst, zet(gekozenBlok.wortel) as Blok); }}
        onSluiten={() => zetKeuze(null)} />
    </div>
  ) : null;
  const kiezerVenster: ReactNode = kiezer ? (
    <PlekKiezer bron={kiezer.bron} bronTitel={kiezer.titel} keuzes={keuzes()} beoordeel={beoordeel} redenTekst={tekstVan} taal={lang}
      opKies={(b, n, oo) => { zetKiezer(null); voerUit(b, n, oo); }} opSluit={() => zetKiezer(null)} />
  ) : null;

  return { aan, blokVan, vakVoor, losseTegel, paneel, kiezerVenster, opCanvasCommit, herstel, schema: BLOKKEN_SCHEMA };
}
