// Lokale stand (alleen test) voor stroom D: canvas ↔ blok ↔ blok ↔ zijmenu met nep-gegevens. Geen netwerk, geen API.
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { MAAT_AUTO, STANDAARD_INDELING, type Blok, type Knoop, type Neerzetting, type NeerzetOordeel, type Onderdeel, type Plek, type Sleepbron } from '../../shared/werkblad-blokken';
import { LaagGeschiedenis, beoordeelNeerzetting, maakPlek, redenTekst, zoek, type PlekContext } from '../../shared/werkblad-plekken';
import type { DesktopEntry } from '../../shared/werkblad-v3-types';
import { installeerSleepregelaar } from '../../src/werkblad/blokken/slepen';
import { menuAlsPlek, menuLijstVan, menuPlek, menuPlekkenUitDom } from '../../src/werkblad/blokken/menu-adapter';
import { PlekKiezer, type PlekKeuze } from '../../src/werkblad/blokken/PlekKiezer';
import '../../src/werkblad/blokken/slepen.css';

const af = { breedte: MAAT_AUTO, hoogte: MAAT_AUTO };
const TITEL: Record<string, string> = { 'svc:mail': 'Пошта', 'svc:agenda': 'Календар', 'svc:notities': 'Нотатки', 'svc:github': 'GitHub', 'svc:taken': 'Завдання', 'svc:cloud': 'Хмара', 'svc:ai': 'ШІ', 'svc:admin': 'Адмінка' };
const o = (id: string, extra: Partial<Onderdeel> = {}): Onderdeel => ({ id, soort: 'onderdeel', itemId: `svc:${id}`, afmeting: af, volgorde: 0, ...extra });
type Toestand = { wortel: Blok; canvas: DesktopEntry[]; menu: string[] };
const begin: Toestand = {
  wortel: { id: 'snel', soort: 'blok', titel: 'Швидкий доступ', indeling: STANDAARD_INDELING, afmeting: af, volgorde: 0, kinderen: [
    o('mail', { uiterlijk: { achtergrond: '#7c3aed' } }), o('agenda'), o('notities'), o('github'),
    { id: 'groep', soort: 'blok', titel: 'Група', indeling: { ...STANDAARD_INDELING, modus: 'kolom' }, afmeting: af, volgorde: 0, kinderen: [o('taken'), o('cloud')] },
  ] },
  canvas: [{ instanceId: 'k-ai', itemId: 'svc:ai', kind: 'shortcut', x: 20, y: 20, w: 96, h: 104, z: 1 }, { instanceId: 'k-admin', itemId: 'svc:admin', kind: 'shortcut', x: 140, y: 20, w: 96, h: 104, z: 1 }],
  menu: ['svc:mail', 'svc:cloud'],
};
const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
function verwijder(b: Blok, id: string): Knoop | null {
  const i = b.kinderen.findIndex((k) => k.id === id);
  if (i >= 0) return b.kinderen.splice(i, 1)[0];
  for (const k of b.kinderen) if (k.soort === 'blok') { const r = verwijder(k, id); if (r) return r; }
  return null;
}
let teller = 0;
const nieuwId = (s: string) => `${s}-k${++teller}`;
function hernoem(k: Knoop): Knoop { const n = { ...k, id: nieuwId(k.id) } as Knoop; if (n.soort === 'blok') n.kinderen = n.kinderen.map(hernoem); return n; }

function uitvoeren(t0: Toestand, bron: Sleepbron, n0: Neerzetting, oordeel: NeerzetOordeel): Toestand {
  const n = { ...n0, positie: n0.positie || { x: 420, y: 80 } }; // toetsenbord: vrije plek kiest de integratie
  const t = kloon(t0);
  let knoop: Knoop | null = null;
  let itemId = '';
  if (bron.van === 'blok') {
    const r = zoek([t.wortel], bron.knoopId)!; knoop = r.knoop; itemId = r.knoop.soort === 'onderdeel' ? r.knoop.itemId : '';
    if (!n.kopie) verwijder(t.wortel, bron.knoopId); else knoop = hernoem(kloon(knoop));
  } else if (bron.van === 'canvas') {
    const e = t.canvas.find((x) => x.instanceId === bron.instanceId)!; itemId = e.itemId;
    knoop = o(e.itemId.slice(4) + (n.kopie ? `-k${++teller}` : ''), { itemId: e.itemId, uiterlijk: (e.config as never) || undefined });
    if (!n.kopie && n.doel.soort !== 'canvas') t.canvas = t.canvas.filter((x) => x !== e);
    if (n.doel.soort === 'canvas') { if (n.kopie) t.canvas.push({ ...e, instanceId: nieuwId(e.instanceId), x: n.positie!.x, y: n.positie!.y }); else Object.assign(e, { x: n.positie!.x - 40, y: n.positie!.y - 40 }); return t; }
  } else if (bron.van === 'menu') { itemId = bron.sleutel; knoop = o(itemId.slice(4) + `-m${++teller}`, { itemId }); if (!n.kopie && n.doel.soort !== 'menu') t.menu = t.menu.filter((x) => x !== itemId); }
  if (n.doel.soort === 'blok') {
    const doel = zoek([t.wortel], n.doel.id.slice(5))!.knoop as Blok;
    const i = n.voor ? doel.kinderen.findIndex((k) => k.id === n.voor) : -1;
    doel.kinderen.splice(i < 0 ? doel.kinderen.length : i, 0, knoop!);
  } else if (n.doel.soort === 'canvas' && knoop?.soort === 'onderdeel') {
    // onderdeel → gewone snelkoppeling, stijl blijft (in config)
    t.canvas.push({ instanceId: nieuwId('k'), itemId: knoop.itemId, kind: 'shortcut', x: n.positie!.x - 40, y: n.positie!.y - 40, w: 96, h: 104, z: 2, config: (knoop.uiterlijk as never) });
  } else if (n.doel.soort === 'menu') {
    const lijst = t.menu.filter((x) => x !== itemId);
    const i = n.voor ? lijst.indexOf(n.voor) : -1;
    lijst.splice(i < 0 ? lijst.length : i, 0, itemId); t.menu = lijst;
  }
  void oordeel;
  return t;
}

const PLEKKEN: Record<string, Plek> = {};
const plekVan = (id: string): Plek | null => {
  if (PLEKKEN[id]) return PLEKKEN[id];
  const i = id.indexOf(':'); const soort = id.slice(0, i) as Plek['soort'];
  return (PLEKKEN[id] = soort === 'menu' ? menuPlek(id.slice(5)) : maakPlek(soort, id.slice(i + 1)));
};

function Knp({ k }: { k: Knoop }) {
  if (k.soort === 'blok') return (
    <div className="st-blok" data-wb-knoop={k.id} data-wb-sleep={`blok:${k.id}`} data-testid={`blok-${k.id}`}>
      <div className="st-blok-kop">{k.titel || k.id}</div>
      <div className="st-blok-inhoud" data-wb-plek={`blok:${k.id}`} data-wb-richting={k.indeling.modus === 'kolom' ? 'v' : 'h'} data-modus={k.indeling.modus}>
        {k.kinderen.map((c) => <Knp key={c.id} k={c} />)}
      </div>
    </div>);
  return (
    <button type="button" className="st-onderdeel" data-wb-knoop={k.id} data-wb-sleep={`blok:${k.id}`} data-testid={`o-${k.id}`} style={{ background: k.uiterlijk?.achtergrond }}
      onKeyDown={(e) => { if (e.key === 'F2') window.dispatchEvent(new CustomEvent('st-kies', { detail: k.id })); }} onContextMenu={(e) => e.preventDefault()} onDoubleClick={() => window.dispatchEvent(new CustomEvent('st-kies', { detail: k.id }))}>
      <span className="st-icoon" />{TITEL[k.itemId] || k.itemId}
    </button>);
}

function Stand() {
  const [t, setT] = useState<Toestand>(begin);
  const [kiezer, setKiezer] = useState<string | null>(null);
  const [melding, setMelding] = useState('');
  const tRef = useRef(t); tRef.current = t;
  const gesch = useRef(new LaagGeschiedenis<Toestand>());
  const wortel = useRef<HTMLDivElement>(null);
  const menuEl = useRef<HTMLElement>(null);
  const ctxVan = (s: Toestand): PlekContext => ({ wortels: [s.wortel], plekken: [], canvas: s.canvas, ruimte: 'prive', ruimtesVan: (id) => (id === 'svc:admin' ? ['technisch'] : undefined) });
  const beoordeel = (bron: Sleepbron, n: Neerzetting) => beoordeelNeerzetting(bron, n, ctxVan(tRef.current));
  const tekst = (oo: NeerzetOordeel, p: Plek) => redenTekst(oo, p, {});
  const doe = (bron: Sleepbron, n: Neerzetting, oo: NeerzetOordeel) => {
    gesch.current.legVast('prive:computer', tRef.current);
    const nieuw = uitvoeren(tRef.current, bron, n, oo); setT(nieuw);
    setMelding(n.kopie ? 'Скопійовано' : 'Переміщено');
  };
  useEffect(() => {
    const r = installeerSleepregelaar({ wortel: document.body, plek: plekVan, beoordeel, redenTekst: tekst, opNeerzetten: doe,
      opEinde: (u) => { (window as never as { __einde: string }).__einde = u; if (u === 'geannuleerd') setMelding('Скасовано'); },
      extraPlekken: [menuAlsPlek({ menuWortel: menuEl.current! })] });
    const kies = (e: Event) => setKiezer((e as CustomEvent).detail);
    const toets = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); const st = e.shiftKey ? gesch.current.opnieuw('prive:computer', tRef.current) : gesch.current.ongedaan('prive:computer', tRef.current); if (st) setT(st); }
    };
    window.addEventListener('st-kies', kies); window.addEventListener('keydown', toets);
    return () => { r.verwijder(); window.removeEventListener('st-kies', kies); window.removeEventListener('keydown', toets); };
  }, []);
  (window as never as { __stand: Toestand }).__stand = t;
  const keuzes = (): PlekKeuze[] => {
    const blokken: PlekKeuze[] = [];
    const loop = (b: Blok) => { blokken.push({ plek: plekVan(`blok:${b.id}`)!, titel: `Блок «${b.titel || b.id}»`, kinderen: b.kinderen.map((c) => ({ id: c.id, titel: c.soort === 'onderdeel' ? TITEL[c.itemId] || c.id : c.titel || c.id })) }); b.kinderen.forEach((c) => c.soort === 'blok' && loop(c)); };
    loop(t.wortel);
    return [{ plek: plekVan('canvas:computer')!, titel: 'Робочий стіл', kinderen: [] }, ...blokken,
      ...menuPlekkenUitDom(menuEl.current!).map((m) => ({ ...m, titel: 'Бічне меню' })), { plek: plekVan('pagina:mail#boven')!, titel: 'Сторінка «Пошта», верхня панель', kinderen: [] }];
  };
  const bronVan = (id: string): Sleepbron => (id.startsWith('k-') || id.startsWith('k') && t.canvas.some((c) => c.instanceId === id) ? { van: 'canvas', instanceId: id } : { van: 'blok', knoopId: id });
  return (
    <div className="st" ref={wortel}>
      <nav ref={menuEl} className="st-menu" aria-label="Меню">
        <div data-menu-lijst="hoofd" data-menu-titel="Бічне меню" data-menu-richting="v" data-testid="menu">
          {t.menu.map((m) => <div key={m} data-menu-sleutel={m} className="st-menu-item">{TITEL[m]}</div>)}
        </div>
      </nav>
      <main className="st-canvas" data-wb-plek="canvas:computer" data-wb-richting="vrij" data-testid="canvas">
        {t.canvas.map((c) => (
          <button key={c.instanceId} type="button" className="st-onderdeel st-los" data-wb-sleep={`canvas:${c.instanceId}`} data-testid={`c-${c.itemId.slice(4)}`}
            style={{ left: c.x, top: c.y, background: (c.config as { achtergrond?: string } | undefined)?.achtergrond }} onDoubleClick={() => setKiezer(c.instanceId)}>
            <span className="st-icoon" />{TITEL[c.itemId]}</button>))}
        <section className="st-widget"><Knp k={t.wortel} /></section>
      </main>
      <div className="st-melding" role="status" data-testid="melding">{melding}</div>
      {kiezer && <PlekKiezer bron={bronVan(kiezer)} bronTitel={TITEL[t.canvas.find((c) => c.instanceId === kiezer)?.itemId || `svc:${kiezer}`] || kiezer} keuzes={keuzes()} beoordeel={beoordeel} redenTekst={tekst}
        opKies={(b, n, oo) => { doe(b, n, oo); setKiezer(null); }} opSluit={() => setKiezer(null)} />}
    </div>);
}
void menuLijstVan;
createRoot(document.getElementById('app')!).render(<Stand />);
