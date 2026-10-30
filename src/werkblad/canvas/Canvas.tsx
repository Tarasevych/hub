// Werkblad v3 — vrij canvas (Etappe C). Gecontroleerde component: de ouder geeft `layout`, krijgt bij elke afgeronde wijziging
// precies één `onCommit(layout)` (pointerup, menu-actie, of na 600 ms toetsenbordrust) en toont de opslagstatus via `status`.
//
// z-index-schaal (alles BINNEN .wbc, dat `isolation:isolate` heeft — het canvas is als geheel één laag van de pagina, dus
// CanonicalChrome, dialogen en systeempanelen liggen er altijd boven):
//   1 … n      items (DesktopEntry.z, genormaliseerd)
//   8000       geest (doelplek tijdens slepen)
//   8100       het gesleepte/geselecteerde item tijdens het gebaar
//   9000       contextmenu
//   9100       statusbalk (opslaan / fout / 409)
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ApparaatKlasse, CanvasLayout, DesktopEntry } from '../../../shared/werkblad-v3-types';
import * as K from './kern';
import { useContainerBreedte, usePointerGestures, type Actief } from './hooks';
import './canvas.css';

export type CanvasStatus = 'idle' | 'saving' | 'error' | 'conflict';
export type CanvasProps = {
  layout: CanvasLayout;
  render: (entry: DesktopEntry, ctx: { bewerken: boolean; schaal: number }) => ReactNode;
  limieten?: K.LimietenFn;
  onCommit: (layout: CanvasLayout) => void;
  editMode: boolean;
  /** «Додати»: zonder plek (menu) of met de logische plek waar de gebruiker iets wil toevoegen. */
  onRequestAdd?: (plek?: { x: number; y: number }) => void;
  status?: CanvasStatus;
  onRetry?: () => void;
  onReload?: () => void;
  lang?: K.Taal;
  /** Overschrijft het beleid uit layout.mode (bijv. de schakelaar «Прив'язка до сітки»). */
  beleid?: Partial<K.Beleid>;
  /** Toegankelijke naam per item (anders itemId). */
  titel?: (entry: DesktopEntry) => string;
  /** Echte containerbreedte + klasse (ResizeObserver), voor de keuze van de indeling per apparaat. */
  onApparaat?: (klasse: ApparaatKlasse, breedte: number) => void;
  className?: string;
  /** Werkblad-blokken: inhoud van dit object blijft bedienbaar in de bewerkmodus (geen inert). */
  interactief?: (entry: DesktopEntry) => boolean;
};

type Menu = { id: string; x: number; y: number };
const TOETS_RUST_MS = 600;

export function Canvas(p: CanvasProps) {
  const lang = p.lang || 'uk', T = K.TEKST[lang];
  const wortel = useRef<HTMLDivElement>(null);
  const breedte = useContainerBreedte(wortel);
  const [werk, zetWerk] = useState(p.layout);
  const werkRef = useRef(werk); werkRef.current = werk;
  const [, tik] = useState(0);
  const [gekozen, zetGekozen] = useState<string | null>(null);
  const [menu, zetMenu] = useState<Menu | null>(null);
  const [plaats, zetPlaats] = useState<string | null>(null);
  const [melding, zetMelding] = useState('');
  const hist = useRef(K.legeGeschiedenis());
  const toetsTimer = useRef<number | undefined>(undefined);
  const toetsBasis = useRef<CanvasLayout | null>(null);

  // Nieuwe layout van de ouder (server, andere tab, ongedaan) → overnemen, behalve midden in een gebaar.
  const gebaarRef = useRef<{ actief: React.RefObject<Actief | null> } | null>(null);
  useEffect(() => { if (!gebaarRef.current?.actief.current && !toetsBasis.current) zetWerk(p.layout); }, [p.layout]);

  const schaal = breedte ? K.schaalVoor(breedte, werk) : 1;
  const schaalRef = useRef(schaal); schaalRef.current = schaal;
  const beleid = useMemo(() => K.beleidVoor(werk, p.beleid), [werk, p.beleid]);
  const beleidRef = useRef(beleid); beleidRef.current = beleid;
  const naam = useCallback((id: string) => { const e = K.zoek(werkRef.current, id); return e ? (p.titel?.(e) || e.titleOverride || e.itemId) : id; }, [p.titel]);

  useEffect(() => { if (breedte) p.onApparaat?.(K.apparaatVoorBreedte(breedte), breedte); }, [breedte]); // eslint-disable-line react-hooks/exhaustive-deps

  const zeg = (t: string) => zetMelding((o) => (o === t ? `${t}\u00a0` : t));
  const commit = useCallback((oud: CanvasLayout, nieuw: CanvasLayout) => {
    hist.current = K.vastleggen(hist.current, oud); zetWerk(nieuw); werkRef.current = nieuw; p.onCommit(nieuw);
  }, [p.onCommit]); // eslint-disable-line react-hooks/exhaustive-deps

  const naarLogisch = useCallback((cx: number, cy: number) => {
    const r = wortel.current!.getBoundingClientRect(), s = schaalRef.current;
    return { x: (cx - r.left) / s, y: (cy - r.top) / s };
  }, []);

  const gebaar = usePointerGestures(wortel, {
    bewerken: p.editMode,
    layout: () => werkRef.current,
    beleid: () => beleidRef.current,
    limieten: p.limieten,
    naarLogisch,
    opStart: (a) => { zetMenu(null); zetGekozen(a.g.id); zeg(T.opgepakt(naam(a.g.id))); tik((n) => n + 1); },
    opBeweeg: () => tik((n) => n + 1),
    opEinde: (a, uitkomst) => {
      if (uitkomst === 'geannuleerd') { zeg(T.geannuleerd(naam(a.g.id))); tik((n) => n + 1); return; }
      const e = K.eindGebaar(a.g, a.start, beleidRef.current);
      if (e.gewijzigd) { commit(a.start, e.layout); const r = K.zoek(e.layout, a.g.id)!; zeg(a.g.soort === 'formaat' ? T.formaat(naam(a.g.id), r) : T.verplaatst(naam(a.g.id), r)); }
      else if (!a.g.doel) zeg(T.geblokkeerd(naam(a.g.id)));
      tik((n) => n + 1);
    },
    opMenu: (id, cx, cy) => { const r = wortel.current!.getBoundingClientRect(); zetGekozen(id); zetMenu({ id, x: cx - r.left, y: cy - r.top }); },
  });
  gebaarRef.current = gebaar;
  const a = gebaar.actief.current;

  // Toetsenbord: lokale stappen direct, één commit na rust (of bij blur/unmount).
  const spoelToetsen = useCallback(() => {
    clearTimeout(toetsTimer.current); const basis = toetsBasis.current; toetsBasis.current = null;
    if (basis && basis !== werkRef.current) commit(basis, werkRef.current);
  }, [commit]);
  useEffect(() => () => spoelToetsen(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const voerUit = (nieuw: CanvasLayout, tekst?: string) => { spoelToetsen(); if (nieuw !== werkRef.current) commit(werkRef.current, nieuw); if (tekst) zeg(tekst); };
  const ongedaanMaken = () => { spoelToetsen(); const u = K.ongedaan(hist.current, werkRef.current); if (!u) return; hist.current = u.h; zetWerk(u.layout); werkRef.current = u.layout; p.onCommit(u.layout); zeg(T.ongedaan); };
  const opnieuwDoen = () => { spoelToetsen(); const u = K.opnieuw(hist.current, werkRef.current); if (!u) return; hist.current = u.h; zetWerk(u.layout); werkRef.current = u.layout; p.onCommit(u.layout); zeg(T.opnieuw); };

  const opToets = (e: React.KeyboardEvent, id: string) => {
    if (!p.editMode || a) return;
    if (e.key === 'Enter' || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault(); const el = e.currentTarget as HTMLElement, r = wortel.current!.getBoundingClientRect(), b = el.getBoundingClientRect();
      zetMenu({ id, x: b.left - r.left + 8, y: b.top - r.top + 8 }); return;
    }
    if (e.key === 'Delete') { e.preventDefault(); const t = naam(id); voerUit(K.verwijder(werkRef.current, id), T.verwijderd(t)); zetGekozen(null); wortel.current?.focus({ preventScroll: true }); return; }
    if (e.key === 'PageUp') { e.preventDefault(); voerUit(K.stapNaarVoren(werkRef.current, id), T.voorgrond(naam(id))); return; }
    const res = K.toetsStap(werkRef.current, id, { key: e.key, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey }, beleidRef.current, p.limieten);
    if (!res) return;
    e.preventDefault();
    if (!res.gewijzigd) { zeg(T.geblokkeerd(naam(id))); return; }
    if (!toetsBasis.current) toetsBasis.current = werkRef.current;
    zetWerk(res.layout); werkRef.current = res.layout;
    const r = K.zoek(res.layout, id)!; zeg(e.shiftKey ? T.formaat(naam(id), r) : T.verplaatst(naam(id), r));
    clearTimeout(toetsTimer.current); toetsTimer.current = window.setTimeout(spoelToetsen, TOETS_RUST_MS);
  };
  const opWortelToets = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { if (plaats) { zeg(T.geannuleerd(naam(plaats))); zetPlaats(null); } if (menu) sluitMenu(); return; }
    if (!p.editMode) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); ongedaanMaken(); }
    else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); opnieuwDoen(); }
  };
  const sluitMenu = () => { const id = menu?.id; zetMenu(null); if (id) requestAnimationFrame(() => wortel.current?.querySelector<HTMLElement>(`[data-wbc-id="${CSS.escape(id)}"]`)?.focus()); };

  const opVlakKlik = (e: React.MouseEvent) => {
    if (!plaats) return;
    const q = naarLogisch(e.clientX, e.clientY), id = plaats; zetPlaats(null);
    const r = K.plaatsOp(werkRef.current, id, Math.round(q.x), Math.round(q.y), beleidRef.current);
    if (r.gewijzigd) voerUit(r.layout, T.verplaatst(naam(id), K.zoek(r.layout, id)!)); else zeg(T.geblokkeerd(naam(id)));
  };

  // Menu: focus op het eerste item, pijltjes binnen het menu.
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (menu) menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus(); }, [menu]);
  const menuToets = (e: React.KeyboardEvent) => {
    const knoppen = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role=menuitem]') || [])]; const i = knoppen.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); knoppen[(i + 1) % knoppen.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); knoppen[(i - 1 + knoppen.length) % knoppen.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); knoppen[0]?.focus(); } else if (e.key === 'End') { e.preventDefault(); knoppen[knoppen.length - 1]?.focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); sluitMenu(); }
  };
  const menuActie = (soort: string) => {
    const id = menu!.id, t = naam(id), l = werkRef.current; zetMenu(null);
    const focus = () => requestAnimationFrame(() => wortel.current?.querySelector<HTMLElement>(`[data-wbc-id="${CSS.escape(id)}"]`)?.focus());
    switch (soort) {
      case 'toevoegen': { const e = K.zoek(l, id); p.onRequestAdd?.(e ? { x: e.x, y: e.y + e.h + 8 } : undefined); break; }
      case 'plaats': zetPlaats(id); zeg(T.plaatsKies(t)); wortel.current?.focus({ preventScroll: true }); break;
      case 'formaat': zeg(T.hulp); focus(); break;
      case 'voren': voerUit(K.stapNaarVoren(l, id), T.voorgrond(t)); focus(); break;
      case 'voorgrond': voerUit(K.naarVoorgrond(l, id), T.voorgrond(t)); focus(); break;
      case 'vast': { const n = K.wisselVergrendeling(l, id); voerUit(n, K.zoek(n, id)?.locked ? T.vergrendeld(t) : T.ontgrendeld(t)); focus(); break; }
      case 'verwijder': voerUit(K.verwijder(l, id), T.verwijderd(t)); zetGekozen(null); wortel.current?.focus({ preventScroll: true }); break;
    }
  };

  // Open menu: het canvas groeit mee zodat geen menu-item buiten beeld of onder de rand valt (7 × 44 px + marge).
  const hoogte = Math.max(K.benodigdeHoogte(werk) * schaal, a ? (a.g.live.y + a.g.live.h + 24) * schaal : 0, menu ? menu.y + 7 * 44 + 24 : 0);
  const helpId = useMemo(() => `wbc-hulp-${Math.random().toString(36).slice(2, 8)}`, []);
  const zichtbaar = werk.items.filter((e) => !e.parent);
  const menuItem = menu ? K.zoek(werk, menu.id) : undefined;
  const st = p.status && p.status !== 'idle' ? p.status : null;

  return (
    <div className={`wbc${p.editMode ? ' wbc-bewerken' : ''}${a ? ' wbc-gebaar' : ''}${plaats ? ' wbc-plaatsen' : ''}${p.className ? ` ${p.className}` : ''}`}
      ref={wortel} role="region" aria-label={T.canvas} tabIndex={-1} onKeyDown={opWortelToets} onClick={opVlakKlik}
      data-schaal={schaal.toFixed(4)} data-apparaat={breedte ? K.apparaatVoorBreedte(breedte) : undefined}
      style={{ height: `${Math.ceil(hoogte)}px` }}>
      {p.editMode && <p id={helpId} className="wbc-sr">{T.hulp}</p>}
      {zichtbaar.map((e) => {
        const bezig = a?.g.id === e.instanceId, r = bezig ? a!.g.live : K.rechthoek(e);
        return (
          <div key={e.instanceId} data-wbc-id={e.instanceId} data-kind={e.kind}
            className={`wbc-item${bezig ? ' wbc-bezig' : ''}${gekozen === e.instanceId ? ' wbc-gekozen' : ''}${e.locked ? ' wbc-vast' : ''}`}
            style={{ left: r.x * schaal, top: r.y * schaal, width: r.w * schaal, height: r.h * schaal, zIndex: bezig ? 8100 : e.z }}
            tabIndex={p.editMode ? 0 : undefined} role={p.editMode ? 'button' : undefined}
            aria-roledescription={p.editMode ? (lang === 'uk' ? 'об’єкт столу' : 'werkbladobject') : undefined}
            aria-label={p.editMode ? naam(e.instanceId) : undefined} aria-describedby={p.editMode ? helpId : undefined}
            onFocus={() => p.editMode && zetGekozen(e.instanceId)} onBlur={() => spoelToetsen()}
            onKeyDown={(ev) => opToets(ev, e.instanceId)}>
            <div className="wbc-inhoud" inert={(p.editMode && !p.interactief?.(e)) || undefined}>{p.render(e, { bewerken: p.editMode, schaal })}</div>
            {p.editMode && !e.locked && K.RANDEN.map((rd) => (
              <span key={rd} className={`wbc-greep wbc-greep-${rd}`} data-wbc-rand={rd} aria-hidden="true" title={T.greep(rd)} />
            ))}
            {e.locked && p.editMode && <span className="wbc-slot" aria-hidden="true">🔒</span>}
          </div>
        );
      })}
      {a && (
        <div className={`wbc-geest${a.g.doel ? '' : ' wbc-geest-ongeldig'}`} aria-hidden="true"
          style={(() => { const d = a.g.doel || a.g.start; return { left: d.x * schaal, top: d.y * schaal, width: d.w * schaal, height: d.h * schaal }; })()} />
      )}
      {menu && menuItem && (
        <div ref={menuRef} className="wbc-menu" role="menu" aria-label={naam(menu.id)} data-wbc-menu="" onKeyDown={menuToets}
          style={{ left: Math.min(menu.x, Math.max(0, (breedte || 300) - 232)), top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {p.onRequestAdd && <button role="menuitem" type="button" onClick={() => menuActie('toevoegen')}>{T.menu.toevoegen}</button>}
          {!menuItem.locked && <button role="menuitem" type="button" onClick={() => menuActie('plaats')}>{T.menu.plaats}</button>}
          {!menuItem.locked && <button role="menuitem" type="button" onClick={() => menuActie('formaat')}>{T.menu.formaat}</button>}
          <button role="menuitem" type="button" onClick={() => menuActie('voren')}>{T.menu.voren}</button>
          <button role="menuitem" type="button" onClick={() => menuActie('voorgrond')}>{T.menu.voorgrond}</button>
          <button role="menuitem" type="button" onClick={() => menuActie('vast')}>{menuItem.locked ? T.menu.los : T.menu.vast}</button>
          <button role="menuitem" type="button" className="wbc-gevaar" onClick={() => menuActie('verwijder')}>{T.menu.verwijder}</button>
        </div>
      )}
      {menu && <div className="wbc-menu-achter" aria-hidden="true" onPointerDown={(e) => { e.stopPropagation(); sluitMenu(); }} />}
      {st && (
        <div className={`wbc-status wbc-status-${st}`} role={st === 'saving' ? 'status' : 'alert'} data-wbc-menu="">
          <span>{T.status[st]}</span>
          {st === 'error' && p.onRetry && <button type="button" onClick={p.onRetry}>{T.opnieuwProberen}</button>}
          {st === 'conflict' && p.onReload && <button type="button" onClick={p.onReload}>{T.herladen}</button>}
        </div>
      )}
      <div className="wbc-sr" aria-live="polite" aria-atomic="true">{melding}</div>
    </div>
  );
}
export default Canvas;
