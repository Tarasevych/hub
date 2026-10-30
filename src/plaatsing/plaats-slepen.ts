// Розставлення — de zwevende knoppen verplaatsen zoals iconen op een telefoon (25.10.2026; basis: src/menu-slepen.ts).
//
// Eigenaar: «кнопка … має рухатися лише доти поки користувач її тримає», «меню … розгорталися коли в їх зону підводять та згортатися
// назад коли від їх зони відводиться», «зсуває інших … і вертається назад», «якщо простір переповнений то має спочатку звідти прибиратися».
//  - Aanraken/pen: 450 ms vasthouden (≤ 8 px bewegen) — eerder bewegen = gewoon scrollen (de bel ging vroeger mee met een veeg).
//    Muis: slepen begint na 5 px met ingedrukte knop; een gewone klik blijft een klik.
//  - Tijdens het slepen volgt alleen een «geest» de vinger; de knop zelf blijft in zijn gniezdo tot je loslaat (dan staat hij in het
//    oplichtende gniezdo, of terug waar hij vandaan kwam). Zones lichten op met een teller («Верхня панель · 4 з 5»); de buren schuiven
//    opzij voor de open plek (FLIP). Een VOLLE zone neemt niets aan: rode rand + «усі гнізда зайняті — спершу приберіть звідси кнопку».
//  - Telefoon: de vinger 650 ms op ☰ of tegen de linkerrand → de lade gaat open (kop van het menu, menulijst); weg uit de lade (400 ms)
//    → weer dicht. Een sleep die IN de lade begon, sluit haar niet onderweg (de knop moet blijven bestaan onder de vinger).
//  - Loslaten zonder bewegen na lang vasthouden, rechtermuisknop, de contextmenutoets of een klik in «Редагувати меню» → het menu
//    «Перемістити до…» (verplaatsen zonder slepen, WCAG 2.5.7). Esc of pointercancel = terug, niets veranderd.
import { ZONE_RICHTING, isKnop, magNaar, tellerTekst, weigeringTekst, type KnopId, type ZoneId } from '../../shared/plaatsing';
import { flipUit, flipVoor } from './plaats-flip';
import { ladeBediening, plaatsStaat, zetPlaatsMenu, zetPlaatsStatus, zetSleep, type SleepDoel } from './plaatsing-staat';

export type PlaatsSleepOpties = {
  lang: () => 'uk' | 'nl';
  /** Staat «Редагувати меню» aan? Dan opent een klik op een verplaatsbare knop «Перемістити до…». */
  bewerken: () => boolean;
  opNeerzetten: (knop: KnopId, zone: ZoneId, index: number) => void;
};

export const LANG_INDRUKKEN = 450, MUIS_DREMPEL = 5, AANRAAK_DREMPEL = 8, LADE_OPEN_MS = 650, LADE_DICHT_MS = 400, RAAK_MARGE = 16;

type Wacht = { el: HTMLElement; knop: KnopId; x: number; y: number; id: number; soort: string; timer?: number };
type Bezig = {
  knop: KnopId; el: HTMLElement; id: number; soort: string; x0: number; y0: number; x: number; y: number; bewogen: boolean;
  geest: HTMLElement; laag: HTMLElement; hint: HTMLElement; labels: Map<ZoneId, HTMLElement>;
  doel: SleepDoel | null; vol: ZoneId | null; vanLade: boolean; ladeOpen?: number; ladeDicht?: number; doorVeer: boolean;
};

const knopVan = (el: Element | null): { gniezdo: HTMLElement; knop: KnopId } | null => {
  const g = el?.closest<HTMLElement>('.plaats-gniezdo[data-plaats-knop]');
  const k = g?.dataset.plaatsKnop;
  return g && isKnop(k) && !g.classList.contains('plaats-voorbeeld') && g.firstElementChild ? { gniezdo: g, knop: k } : null;
};
const zichtbaar = (el: Element) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
const chrome = () => (document.querySelector('.canonical-chrome') as HTMLElement | null) || document.body;

/** De zone onder de vinger: rechthoek + marge; bij overlap de kleinste (de kop van het menu ligt in de lade, die over de pagina ligt). */
export function zoneOnder(x: number, y: number): ZoneId | null {
  let beste: { zone: ZoneId; opp: number } | null = null;
  for (const [zone, el] of Object.entries(plaatsStaat().zones) as Array<[ZoneId, HTMLElement | undefined]>) {
    if (!el || !el.isConnected || !zichtbaar(el)) continue;
    const r = el.getBoundingClientRect();
    if (x < r.left - RAAK_MARGE || x > r.right + RAAK_MARGE || y < r.top - RAAK_MARGE || y > r.bottom + RAAK_MARGE) continue;
    const opp = r.width * r.height;
    if (!beste || opp < beste.opp) beste = { zone, opp };
  }
  return beste?.zone || null;
}

/** Positie in de zone (index in de lijst ZONDER de gesleepte knop): telt de items vóór de vinger. Rij: links→rechts; menulijst:
 *  boven→onder; stapel: onder→boven (column-reverse, index 0 = onderaan). Bewoners vooraan (zoeken) tellen niet. */
export function indexIn(zone: ZoneId, zoneEl: HTMLElement, x: number, y: number): number {
  const items = Array.from(zoneEl.children).filter((c): c is HTMLElement => c instanceof HTMLElement
    && !c.classList.contains('plaats-voorbeeld') && c.dataset.sleept !== 'ja' && !c.matches('.zk-trigger,.zk-trigger-mobiel,.zk-palet-achter,.plaats-zone-hint')
    && (c.matches('.plaats-gniezdo,.canonical-account-menu,.canonical-drawer-account')));
  let n = 0;
  for (const c of items) {
    const r = c.getBoundingClientRect(), mx = r.left + r.width / 2, my = r.top + r.height / 2;
    if (zone === 'actiestapel' ? my > y : ZONE_RICHTING[zone] === 'kolom' ? my < y : mx < x) n++;
  }
  return n;
}

export function installeerPlaatsSlepen(o: PlaatsSleepOpties): () => void {
  let wacht: Wacht | null = null;
  let bezig: Bezig | null = null;
  let slikKlikTot = 0;

  const slikKlik = (ms = 450) => { slikKlikTot = performance.now() + ms; };
  const opruimen = () => {
    if (wacht?.timer) window.clearTimeout(wacht.timer);
    wacht = null;
    if (!bezig) return;
    window.clearTimeout(bezig.ladeOpen); window.clearTimeout(bezig.ladeDicht);
    bezig.laag.remove();
    delete document.documentElement.dataset.plaatsSleep;
    bezig = null;
    zetSleep(null);
    requestAnimationFrame(() => flipUit());
  };

  const labelsBijwerken = () => {
    if (!bezig) return;
    const s = plaatsStaat(), lang = o.lang();
    for (const [zone, el] of Object.entries(s.zones) as Array<[ZoneId, HTMLElement | undefined]>) {
      let lab = bezig.labels.get(zone);
      if (!el || !el.isConnected || !zichtbaar(el)) { lab?.remove(); bezig.labels.delete(zone); continue; }
      const m = magNaar(s.voorkeur, s.ctx, bezig.knop, zone);
      if (!m.ok && m.reden !== 'vol') { lab?.remove(); bezig.labels.delete(zone); continue; }
      if (!lab) { lab = document.createElement('span'); lab.className = 'plaats-zone-teller'; lab.setAttribute('aria-hidden', 'true'); bezig.laag.appendChild(lab); bezig.labels.set(zone, lab); }
      // «4 з 5» als de vinger hier wijst: de knop telt al mee (zoals in het macket «відпустіть, дзвоник стане тут»)
      const erbij = bezig.doel?.zone === zone && s.indeling.plek[bezig.knop] !== zone ? 1 : 0;
      const inhoud = s.indeling.zones[zone];
      lab.textContent = tellerTekst(lang, zone, erbij ? { ...inhoud, dienst: inhoud.dienst + 1 } : inhoud, s.ctx);
      lab.dataset.staat = m.ok ? (bezig.doel?.zone === zone ? 'hier' : 'ja') : 'vol';
      const r = el.getBoundingClientRect(), vw = window.innerWidth, b = lab.offsetWidth || 120;
      const bovenaan = zone === 'actiestapel' ? false : r.top < window.innerHeight / 2;
      lab.style.top = `${Math.round(bovenaan ? r.bottom + 8 : r.top - 30)}px`;
      // rechts uitgelijnd met de zone, maar altijd helemaal in beeld (een zone links — kop van het menu — niet over de rand)
      lab.style.left = `${Math.round(Math.max(8, Math.min(r.right - b, vw - b - 8)))}px`;
    }
  };

  const hintZetten = (zone: ZoneId | null) => {
    if (!bezig) return;
    const h = bezig.hint;
    if (!zone) { h.hidden = true; return; }
    const s = plaatsStaat(), el = s.zones[zone];
    h.textContent = weigeringTekst(o.lang(), 'vol', zone, s.ctx);
    h.hidden = false;
    const r = el?.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    const breed = Math.min(420, vw - 16);
    h.style.width = `${breed}px`;
    h.style.left = `${Math.round(Math.max(8, Math.min((r ? r.right : vw) - breed, vw - breed - 8)))}px`;
    h.style.top = r && r.top < vh / 2 ? `${Math.round(r.bottom + 40)}px` : `${Math.round(Math.max(8, (r ? r.top : vh) - 130))}px`;
  };

  const begin = () => {
    if (!wacht) return;
    const { el, knop, x, y, id, soort } = wacht;
    if (wacht.timer) window.clearTimeout(wacht.timer);
    wacht = null;
    const knopEl = el.firstElementChild as HTMLElement | null;
    try { knopEl?.releasePointerCapture?.(id); } catch { /* niet gevangen */ }
    const laag = document.createElement('div');
    laag.className = 'plaats-sleep-laag';
    laag.setAttribute('aria-hidden', 'true');
    const geest = document.createElement('div');
    geest.className = 'plaats-sleep-geest';
    const icoon = knopEl?.querySelector('svg');
    if (icoon) geest.appendChild(icoon.cloneNode(true));
    const badge = knopEl?.querySelector('small');
    if (badge) geest.appendChild(badge.cloneNode(true));
    const hint = document.createElement('div');
    hint.className = 'plaats-zone-hint';
    hint.hidden = true;
    laag.append(geest, hint);
    chrome().appendChild(laag);
    const s = plaatsStaat();
    const zone = s.indeling.plek[knop] || null;
    const vanLade = Boolean(el.closest('.canonical-sidebar'));
    bezig = { knop, el, id, soort, x0: x, y0: y, x, y, bewogen: false, geest, laag, hint, labels: new Map(), doel: null, vol: null, vanLade, doorVeer: false };
    document.documentElement.dataset.plaatsSleep = knop;
    zetPlaatsMenu(null);
    flipVoor();
    const startIndex = zone ? s.indeling.zones[zone].lijst.filter((x2) => x2.id !== knop).length >= 0 ? s.indeling.zones[zone].lijst.findIndex((x2) => x2.id === knop) : 0 : 0;
    bezig.doel = zone ? { zone, index: Math.max(0, startIndex) } : null;
    zetSleep({ knop, doel: bezig.doel, vol: null });
    try { navigator.vibrate?.(12); } catch { /* niet ondersteund */ }
    bewegen(x, y);
  };

  const veerLade = (x: number, y: number) => {
    if (!bezig) return;
    const lade = ladeBediening();
    if (!lade || plaatsStaat().ctx.klasse !== 'telefoon') return;
    if (!lade.isOpen()) {
      window.clearTimeout(bezig.ladeDicht); bezig.ladeDicht = undefined;
      const toggle = document.querySelector('.canonical-sidebar .canonical-menu-toggle')?.getBoundingClientRect();
      const opKnop = toggle && x >= toggle.left - 8 && x <= toggle.right + 8 && y >= toggle.top - 8 && y <= toggle.bottom + 8;
      if (opKnop || x <= 24) {
        if (!bezig.ladeOpen) bezig.ladeOpen = window.setTimeout(() => { if (bezig) { bezig.ladeOpen = undefined; bezig.doorVeer = true; lade.open(); window.setTimeout(labelsBijwerken, 60); } }, LADE_OPEN_MS);
      } else if (bezig.ladeOpen) { window.clearTimeout(bezig.ladeOpen); bezig.ladeOpen = undefined; }
      return;
    }
    if (bezig.vanLade || !bezig.doorVeer) return; // een sleep die in de lade begon: de lade blijft open (de knop bestaat daar)
    const lr = document.querySelector('.canonical-sidebar')?.getBoundingClientRect();
    const buiten = !lr || x > lr.right + 16;
    if (buiten && !bezig.ladeDicht) bezig.ladeDicht = window.setTimeout(() => { if (bezig) { bezig.ladeDicht = undefined; bezig.doorVeer = false; lade.sluit(); window.setTimeout(labelsBijwerken, 60); } }, LADE_DICHT_MS);
    else if (!buiten && bezig.ladeDicht) { window.clearTimeout(bezig.ladeDicht); bezig.ladeDicht = undefined; }
  };

  const bewegen = (x: number, y: number) => {
    if (!bezig) return;
    bezig.x = x; bezig.y = y;
    if (Math.hypot(x - bezig.x0, y - bezig.y0) > AANRAAK_DREMPEL) bezig.bewogen = true;
    bezig.geest.style.transform = `translate(${Math.round(x - 26)}px, ${Math.round(y - 26)}px)`;
    const s = plaatsStaat();
    const zone = zoneOnder(x, y);
    let doel: SleepDoel | null = null, vol: ZoneId | null = null;
    if (zone) {
      const m = magNaar(s.voorkeur, s.ctx, bezig.knop, zone), el = s.zones[zone];
      if (m.ok && el) doel = { zone, index: indexIn(zone, el, x, y) };
      else if (!m.ok && m.reden === 'vol') vol = zone;
    }
    bezig.geest.dataset.staat = doel ? 'ja' : vol ? 'vol' : 'nee';
    if (JSON.stringify(doel) !== JSON.stringify(bezig.doel) || vol !== bezig.vol) {
      bezig.doel = doel; bezig.vol = vol;
      flipVoor();
      zetSleep({ knop: bezig.knop, doel, vol });
    }
    hintZetten(vol);
    labelsBijwerken();
    veerLade(x, y);
  };

  const neer = () => {
    if (!bezig) return;
    const { knop, doel, vol, soort, bewogen, el, doorVeer } = bezig;
    const lang = o.lang();
    // lang vasthouden en loslaten zonder te bewegen → het menu «Перемістити до…»
    if (soort !== 'mouse' && !bewogen) {
      const anker = el.getBoundingClientRect();
      opruimen(); slikKlik();
      zetPlaatsMenu({ knop, anker: { left: anker.left, top: anker.top, width: anker.width, height: anker.height } });
      return;
    }
    flipVoor();
    opruimen();
    slikKlik();
    if (doel) {
      const s = plaatsStaat(), nu = s.indeling.plek[knop];
      const huidigIndex = nu ? s.indeling.zones[nu].lijst.filter((x) => x.id !== knop).length : 0;
      const zelfde = nu === doel.zone && s.indeling.zones[nu].lijst.findIndex((x) => x.id === knop) === doel.index;
      if (!zelfde || huidigIndex < 0) o.opNeerzetten(knop, doel.zone, doel.index);
    } else if (vol) zetPlaatsStatus(weigeringTekst(lang, 'vol', vol, plaatsStaat().ctx));
    const lade = ladeBediening();
    if (doorVeer && lade?.isOpen() && (!doel || (doel.zone !== 'lade-kop' && doel.zone !== 'zijbalk'))) lade.sluit();
  };

  const omlaag = (e: PointerEvent) => {
    if (e.button !== 0 || bezig) return;
    const t = e.target as Element | null;
    if (!t || t.closest('.plaats-acties,input,select,textarea,[contenteditable="true"]')) return;
    const k = knopVan(t);
    if (!k) return;
    wacht = { el: k.gniezdo, knop: k.knop, x: e.clientX, y: e.clientY, id: e.pointerId, soort: e.pointerType };
    if (e.pointerType !== 'mouse') wacht.timer = window.setTimeout(begin, LANG_INDRUKKEN);
  };
  const beweeg = (e: PointerEvent) => {
    if (wacht && e.pointerId === wacht.id) {
      const d = Math.hypot(e.clientX - wacht.x, e.clientY - wacht.y);
      if (wacht.soort === 'mouse' ? d > MUIS_DREMPEL : d > AANRAAK_DREMPEL) {
        if (wacht.soort === 'mouse' && (e.buttons & 1)) begin(); else opruimen(); // aanraken: eerst bewegen = scrollen, niet slepen
      }
    }
    if (bezig && e.pointerId === bezig.id) { if (e.cancelable) e.preventDefault(); bewegen(e.clientX, e.clientY); }
  };
  const los = (e: PointerEvent) => { if (bezig && e.pointerId === bezig.id) neer(); else if (wacht && e.pointerId === wacht.id) opruimen(); };
  const annuleer = (e: PointerEvent) => { if ((bezig && e.pointerId === bezig.id) || (wacht && e.pointerId === wacht.id)) opruimen(); };
  const toets = (e: KeyboardEvent) => { if (bezig && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); opruimen(); zetPlaatsStatus(o.lang() === 'uk' ? 'Перенесення скасовано.' : 'Verplaatsen geannuleerd.'); } };
  const raak = (e: TouchEvent) => { if (bezig && e.cancelable) e.preventDefault(); };
  const contextmenu = (e: MouseEvent) => {
    if (wacht || bezig) { e.preventDefault(); return; }
    const k = knopVan(e.target as Element | null);
    if (!k) return;
    e.preventDefault();
    const r = k.gniezdo.getBoundingClientRect();
    zetPlaatsMenu({ knop: k.knop, anker: { left: r.left, top: r.top, width: r.width, height: r.height } });
  };
  const klik = (e: MouseEvent) => {
    if (performance.now() < slikKlikTot && knopVan(e.target as Element | null)) { e.preventDefault(); e.stopPropagation(); slikKlikTot = 0; return; }
    if (!o.bewerken()) return;
    const k = knopVan(e.target as Element | null);
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    const r = k.gniezdo.getBoundingClientRect();
    zetPlaatsMenu({ knop: k.knop, anker: { left: r.left, top: r.top, width: r.width, height: r.height } });
  };

  document.addEventListener('pointerdown', omlaag);
  window.addEventListener('pointermove', beweeg, { passive: false });
  window.addEventListener('pointerup', los);
  window.addEventListener('pointercancel', annuleer);
  window.addEventListener('keydown', toets, true);
  window.addEventListener('touchmove', raak, { passive: false });
  document.addEventListener('contextmenu', contextmenu);
  document.addEventListener('click', klik, true);
  return () => {
    opruimen();
    document.removeEventListener('pointerdown', omlaag);
    window.removeEventListener('pointermove', beweeg);
    window.removeEventListener('pointerup', los);
    window.removeEventListener('pointercancel', annuleer);
    window.removeEventListener('keydown', toets, true);
    window.removeEventListener('touchmove', raak);
    document.removeEventListener('contextmenu', contextmenu);
    document.removeEventListener('click', klik, true);
  };
}
