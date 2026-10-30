// Stand «plaatsing» (25.10.2026): waar staan de zwevende knoppen (bel, «Написати», «Вгору») en blijven ze daar?
//
// Melding van de eigenaar (telefoon): «Написати» verdwijnt/trilt bij naar beneden scrollen, de bel schuift in de bovenbalk; bij
// inzoomen wordt de bel bijna schermgroot en blijft in de hoek van het SCHERM staan in plaats van bij zijn deel van de site.
// Deze stap meet het gedrag zelf (geen aannames) en is tegelijk de acceptatietest voor de nieuwe plaatsingslaag:
//   1. scrollen zonder formaatwijziging — beweegt er iets?
//   2. adresbalk verdwijnt / komt terug (venster +56 px / −56 px, zoals Chrome op Android tijdens het scrollen) — per frame opgenomen:
//      hoeveel verschillende posities, hoe lang onderweg, frames waarin de knop (deels) onder de onderrand ligt, overlap bel ↔ FAB;
//   3. «Вгору» na snel omhoog scrollen — overlapt hij iets?
//   4. vinger begint op de bel en veegt omhoog (wie wil scrollen) — sleept dat de bel mee?
//   5. knijpzoom ×3 (visualViewport) — volgt de bel het zichtbare stuk (en wordt hij 3× zo groot op het scherm)?
//   6. (telefoon) bel op de computer naast de avatar gezet, daarna op de telefoon geopend — waar komt hij terecht?
//   7. herladen — verschijnt de bel meteen op zijn plaats of springt hij nog?
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Page = import('playwright-core').Page;
type Box = { left: number; top: number; width: number; height: number; right: number; bottom: number };
type Frame = { t: number; fab: Box | null; bel: Box | null; vh: number };
export type PlaatsCtx = { uit: string; zeg: (s: string) => void; meting: (naam: string, p: Page, slecht: string, detail: string) => void };

const FAB = '[data-mail-compose-float]', BEL = "[data-qa-id='canonical-notification-bell']";

/** Rechthoeken in vensterpixels (CSS px van het layout-venster) + het zichtbare venster (visualViewport). */
const meet = (p: Page) => p.evaluate(([fab, bel]) => {
  const r = (el: Element | null) => {
    if (!el) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const b = el.getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) };
  };
  const vv = window.visualViewport;
  return {
    fab: r(document.querySelector(fab)), bel: r(document.querySelector(bel)), vomhoog: r(document.querySelector('.canonical-scroll-top')),
    avatar: r([...document.querySelectorAll('.canonical-avatar-trigger')].find((x) => (x as HTMLElement).offsetParent) || null),
    menu: r(document.querySelector('.canonical-menu-toggle')),
    bovenbalk: [...document.querySelectorAll('button, a, input')].map((x) => ({ x, b: x.getBoundingClientRect() })).filter(({ x, b }) => b.width > 0 && b.top < 70 && b.bottom > 0 && !x.closest(`${bel}, ${fab}`)).map(({ x, b }) => ({ naam: (x.getAttribute('aria-label') || x.getAttribute('title') || x.textContent || x.tagName).trim().slice(0, 40), left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom) })),
    // Knoppen/links van de pagina die (deels) ONDER de FAB of de bel liggen — die kun je op dat moment niet aanraken.
    onder: (() => { const z = (s: string) => document.querySelector(s)?.getBoundingClientRect(); const f = z(fab), b = z(bel); const raakt = (a: DOMRect | undefined, x: DOMRect) => !!a && a.width > 0 && x.left < a.right && x.right > a.left && x.top < a.bottom && x.bottom > a.top;
      return [...document.querySelectorAll('button, a[href], input, [role=button]')].filter((x) => !x.closest(`${fab}, ${bel}`) && (x as HTMLElement).offsetParent).map((x) => ({ x, r: x.getBoundingClientRect() })).filter(({ r }) => r.width > 0 && r.bottom > 0 && r.top < innerHeight && (raakt(f, r) || raakt(b, r))).map(({ x, r }) => ({ naam: (x.getAttribute('aria-label') || x.getAttribute('title') || x.textContent || x.tagName).trim().slice(0, 50), door: raakt(f, r) ? 'fab' : 'bel', left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) })); })(),
    vw: innerWidth, vh: innerHeight, vv: vv ? { w: Math.round(vv.width), h: Math.round(vv.height), x: Math.round(vv.offsetLeft), y: Math.round(vv.offsetTop), schaal: Math.round(vv.scale * 100) / 100 } : null,
  };
}, [FAB, BEL]);

/** Neemt per animatieframe de rechthoeken van FAB en bel op, `ms` lang (in de pagina, zodat Playwright er niet tussen zit). */
const neemOp = (p: Page, ms: number) => p.evaluate(([fab, bel, duur]) => new Promise<Frame[]>((klaar) => {
  const r = (el: Element | null) => { if (!el) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
  const uit: Frame[] = []; const t0 = performance.now();
  const stap = () => { const t = performance.now() - t0; uit.push({ t: Math.round(t), fab: r(document.querySelector(fab as string)), bel: r(document.querySelector(bel as string)), vh: innerHeight }); if (t < (duur as number)) requestAnimationFrame(stap); else klaar(uit); };
  requestAnimationFrame(stap);
}), [FAB, BEL, ms] as const);

const sleutel = (b: Box | null) => (b ? `${b.left},${b.top}` : '—');
const overlap = (a: Box | null, b: Box | null) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Samenvatting van een opname: verschillende posities, afgelegde weg, tijd tot stilstand, frames onder de rand en met overlap. */
function analyse(frames: Frame[], wanneer: number) {
  const stuk = (k: 'fab' | 'bel') => {
    const pos = frames.map((f) => sleutel(f[k]));
    const verschillend = [...new Set(pos)];
    let weg = 0, laatsteWissel = -1;
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1][k], b = frames[i][k];
      if (a && b && (a.left !== b.left || a.top !== b.top)) { weg += Math.hypot(b.left - a.left, b.top - a.top); laatsteWissel = frames[i].t; }
    }
    const onderRand = frames.filter((f) => f[k] && f[k]!.bottom > f.vh).length;
    return { posities: verschillend.length, eerste: pos[0], laatste: pos[pos.length - 1], weg: Math.round(weg), stilNaMs: laatsteWissel < 0 ? 0 : Math.max(0, laatsteWissel - wanneer), framesOnderRand: onderRand };
  };
  return { frames: frames.length, fab: stuk('fab'), bel: stuk('bel'), framesOverlap: frames.filter((f) => overlap(f.fab, f.bel)).length };
}

export const plaatsingNu = (c: PlaatsCtx) => async (p: Page) => {
  const fab = p.locator(FAB).first();
  await fab.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw new Error('SKIP FAB «Написати» niet zichtbaar (geen mailaccount?)'); });
  await p.waitForTimeout(1200);
  const v0 = p.viewportSize() || { width: 1280, height: 800 }; const smal = v0.width <= 560;
  const info: Record<string, unknown> = { maat: `${v0.width}×${v0.height}` }; const slecht: string[] = [];
  const begin = await meet(p); info.begin = begin;
  if (begin.onder.length) slecht.push(`na laden liggen ${begin.onder.length} knoppen onder FAB/bel: ${begin.onder.map((x) => `«${x.naam}» (${x.door})`).join(', ')}`);
  const cdp = await p.context().newCDPSession(p);
  const werk = '.canonical-workspace';

  // ---- 1. scrollen zonder formaatwijziging
  {
    const opname = neemOp(p, 900);
    await p.waitForTimeout(80);
    for (let i = 0; i < 3; i++) { await p.evaluate((s) => { const w = document.querySelector(s); if (w) w.scrollTop += 260; }, werk); await p.waitForTimeout(90); }
    const a = analyse(await opname, 80); info.scrollen = a;
    if (a.fab.posities > 1 || a.bel.posities > 1) slecht.push(`scrollen alleen: FAB ${a.fab.posities} / bel ${a.bel.posities} posities`);
  }
  // ---- 2. adresbalk verdwijnt (+56 px) en komt terug (−56 px)
  for (const [naam, h] of [['adresbalk-weg', v0.height + 56], ['adresbalk-terug', v0.height]] as const) {
    const opname = neemOp(p, 1300);
    await p.waitForTimeout(150);
    await p.setViewportSize({ width: v0.width, height: h });
    const a = analyse(await opname, 150); info[naam] = a;
    if (a.fab.posities > 2 || a.fab.stilNaMs > 120) slecht.push(`${naam}: FAB glijdt (${a.fab.posities} posities, ${a.fab.weg} px, stil na ${a.fab.stilNaMs} ms)`);
    if (a.fab.framesOnderRand) slecht.push(`${naam}: FAB ${a.fab.framesOnderRand} frames (deels) onder de onderrand`);
    if (a.bel.framesOnderRand) slecht.push(`${naam}: bel ${a.bel.framesOnderRand} frames (deels) onder de onderrand`);
    if (a.framesOverlap) slecht.push(`${naam}: FAB en bel overlappen in ${a.framesOverlap} frames`);
    await p.waitForTimeout(400);
  }
  // ---- 3. «Вгору» na snel omhoog scrollen
  {
    await p.evaluate((s) => { const w = document.querySelector(s); if (w) w.scrollTop = w.scrollHeight; }, werk);
    await p.waitForTimeout(500);
    const box = await p.locator(werk).first().boundingBox();
    if (box) { await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, -160); await p.waitForTimeout(40); } }
    await p.waitForTimeout(450);
    const m = await meet(p); info.vomhoog = { vomhoog: m.vomhoog, fab: m.fab, bel: m.bel };
    await p.screenshot({ path: join(c.uit, `plaatsing-nu-vomhoog-${v0.width}.png`) }).catch(() => undefined);
    if (m.vomhoog && (overlap(m.vomhoog, m.fab) || overlap(m.vomhoog, m.bel))) slecht.push('«Вгору» overlapt FAB of bel');
    if (!m.vomhoog) info.vomhoogNiet = 'niet verschenen (te weinig inhoud of te traag gescrold)';
    await p.evaluate((s) => { const w = document.querySelector(s); if (w) w.scrollTop = 0; }, werk);
    await p.waitForTimeout(500);
  }
  // ---- 4. vinger begint op de bel en veegt omhoog (scrollen) — sleept dat de bel mee?
  {
    const voor = (await meet(p)).bel;
    if (voor) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const x = voor.left + voor.width / 2, y = voor.top + voor.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 30 }] }); await p.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(500);
      const na = (await meet(p)).bel; info.veegOpBel = { voor, na };
      if (na && Math.abs(na.top - voor.top) > 8) slecht.push(`veeg omhoog die op de bel begint, sleept de bel ${voor.top - na.top} px mee (scrollen wordt slepen)`);
      // terugzetten: dezelfde veeg omlaag
      if (na && Math.abs(na.top - voor.top) > 8) {
        const x2 = na.left + na.width / 2, y2 = na.top + na.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x2, y: y2 }] });
        for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x2, y: y2 + ((voor.top - na.top) * i) / 6 }] }); await p.waitForTimeout(16); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await p.waitForTimeout(500);
      }
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      info.naTerugzetten = (await meet(p)).bel;
    }
  }
  // ---- 5. knijpzoom ×3
  {
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 3 }).catch((e) => { info.zoomFout = String(e).slice(0, 200); });
    await p.waitForTimeout(900);
    const m = await meet(p);
    const s = m.vv?.schaal || 1;
    // Op het scherm: (rechthoek − begin van het zichtbare stuk) × schaal. Deel van de schermbreedte dat de bel inneemt.
    const opScherm = (b: Box | null) => (b && m.vv ? { left: Math.round((b.left - m.vv.x) * s), top: Math.round((b.top - m.vv.y) * s), breedte: Math.round(b.width * s), aandeelBreedte: Math.round(((b.width * s) / v0.width) * 100) } : null);
    info.zoom = { vv: m.vv, bel: m.bel, belOpScherm: opScherm(m.bel), fab: m.fab, fabOpScherm: opScherm(m.fab) };
    await p.screenshot({ path: join(c.uit, `plaatsing-nu-zoom3-${v0.width}.png`) }).catch(() => undefined);
    if (s > 1.5 && m.bel && m.vv) {
      const volgt = m.bel.left >= m.vv.x && m.bel.right <= m.vv.x + m.vv.w && m.bel.top >= m.vv.y && m.bel.bottom <= m.vv.y + m.vv.h;
      if (volgt) slecht.push(`knijpzoom ×${s}: de bel volgt het zichtbare stuk (staat in de hoek van wat je ziet, ${Math.round(m.bel.width * s)} px breed = ${opScherm(m.bel)?.aandeelBreedte}% van het scherm)`);
    }
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }).catch(() => undefined);
    await p.waitForTimeout(600);
  }
  // ---- 6. (telefoon) de bel op de computer naast de avatar gezet → op de telefoon geopend
  if (smal) {
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.waitForTimeout(900);
    const d = await meet(p);
    if (d.bel) {
      const doelX = (d.avatar ? d.avatar.left - 60 : 1160), doelY = 14;
      const bx = d.bel.left + d.bel.width / 2, by = d.bel.top + d.bel.height / 2;
      await p.mouse.move(bx, by); await p.mouse.down();
      for (let i = 1; i <= 10; i++) await p.mouse.move(bx + ((doelX + 24 - bx) * i) / 10, by + ((doelY + 24 - by) * i) / 10);
      await p.mouse.up(); await p.waitForTimeout(900);
      const opPc = await meet(p);
      await p.setViewportSize({ width: v0.width, height: v0.height });
      // ---- 7. herladen: de bel per frame vanaf het eerste beeld
      await p.addInitScript(() => {
        const t0 = performance.now(); const uit: Array<{ t: number; b: string }> = []; (window as unknown as { __belStart: typeof uit }).__belStart = uit;
        const stap = () => { const el = document.querySelector("[data-qa-id='canonical-notification-bell']"); const b = el?.getBoundingClientRect(); const s = b && b.width ? `${Math.round(b.left)},${Math.round(b.top)}` : '—'; if (!uit.length || uit[uit.length - 1].b !== s) uit.push({ t: Math.round(performance.now() - t0), b: s }); if (performance.now() - t0 < 6000) requestAnimationFrame(stap); };
        requestAnimationFrame(stap);
      });
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.locator(BEL).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(6200);
      const opTel = await meet(p);
      const start = await p.evaluate(() => (window as unknown as { __belStart?: Array<{ t: number; b: string }> }).__belStart || []);
      const onder = (opTel.bovenbalk || []).filter((x) => opTel.bel && x.left < opTel.bel.right && x.right > opTel.bel.left && x.top < opTel.bel.bottom && x.bottom > opTel.bel.top);
      info.pcNaarTelefoon = { pc: { bel: opPc.bel, avatar: opPc.avatar }, telefoon: { bel: opTel.bel, menu: opTel.menu, avatar: opTel.avatar, bedekt: onder }, herladen: start };
      await p.screenshot({ path: join(c.uit, `plaatsing-nu-pc-naar-telefoon-${v0.width}.png`) }).catch(() => undefined);
      if (opTel.bel && opTel.bel.top < 70) slecht.push(`bel op de computer bij de avatar gezet → op de telefoon in de bovenbalk (${opTel.bel.left},${opTel.bel.top})${onder.length ? `, over: ${onder.map((x) => `«${x.naam}»`).join(', ')}` : ''}`);
      const plekken = [...new Set(start.filter((x) => x.b !== '—').map((x) => x.b))];
      if (plekken.length > 1) slecht.push(`herladen: de bel verschijnt op ${plekken.length} plekken na elkaar (${plekken.join(' → ')})`);
    }
  }
  writeFileSync(join(c.uit, `plaatsing-nu-${v0.width}.json`), JSON.stringify(info, null, 1));
  c.meting('plaatsing-nu', p, slecht.join(' · '), JSON.stringify(info));
};

// ======================================================================================================================================
// plaatsing-na (25.10.2026): ACCEPTATIE van zones en gniezda (shared/plaatsing.ts, src/plaatsing/). Dezelfde metingen als plaatsing-nu,
// met de grenzen uit de pakketbeschrijving (MAKET-PLAVAYUCHI-KNOPKY-2026-10-25 §5), plus het розставлення zelf.
//   A  standaard: telefoon — дзвоник in de kop van het menu rechts van de foto, ☰ telt mee; computer/tablet — rechts van de foto in de
//      bovenbalk, even groot; «Написати» rechtsonder (rand 12/16/20 px); niets overlapt in de bovenbalk.
//   B  scrollen: niets beweegt.   C  adresbalk ±56 px: hoogstens één sprong (geen glijden), nooit onder de rand, geen overlap.
//   D  «Вгору» verschijnt in zijn eigen gniezdo boven «Написати»; «Написати» schuift niet.
//   E  veeg die op «Написати» begint = scrollen (de knop gaat niet mee).   F  knijpzoom ×3: de knoppen blijven op hun plek in de pagina.
//   G  slepen (vasthouden 0,6 s / muis): «Написати» naar de bovenbalk → staat daar, de opdrachtbalk wijkt, blijft na herladen; eerste
//      beeld na herladen = eindplaats.   H  (telefoon) volle zone: naar de kop van het menu (lade via ☰ geopend) → geweigerd met hint.
//   I  «Перемістити до…» met het toetsenbord (Shift+F10, pijlen, Enter, Esc).   J  computer → telefoon: elk zijn eigen plaats.
//   K  «Скинути всі кнопки до типового» → alles terug.
type Doos = { left: number; top: number; width: number; height: number; right: number; bottom: number };
const doosVan = (p: Page, sel: string) => p.evaluate((s) => {
  const el = document.querySelector(s); if (!el) return null;
  const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null;
  const b = el.getBoundingClientRect(); if (b.width < 1 || b.height < 1) return null;
  return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) };
}, sel);
const overlapD = (a: Doos | null, b: Doos | null) => !!a && !!b && a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
const midden = (d: Doos) => ({ x: d.left + d.width / 2, y: d.top + d.height / 2 });
const AVATAR_BOVEN = '.canonical-account-anchor .canonical-avatar-trigger', AVATAR_LADE = '.canonical-drawer-account .canonical-avatar-trigger';
const MENU = ".canonical-sidebar .canonical-menu-toggle[data-sidebar-action='open-drawer']";
const plaatsingVoorkeur = (p: Page) => p.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) || ''; if (k.startsWith('tsv-zijbalk-v2:')) { try { return JSON.parse(localStorage.getItem(k) || '{}')?.gebruiker?.plaatsing ?? null; } catch { return null; } } }
  return null;
});
/** Bovenbalk: alles wat klikbaar is in de bovenste 70 px — overlappen er twee? */
const bovenOverlap = (p: Page) => p.evaluate(() => {
  const els = [...document.querySelectorAll('button, a[href], input')].filter((x) => { const b = x.getBoundingClientRect(); const cs = getComputedStyle(x); return b.width > 1 && b.height > 1 && b.top < 70 && b.bottom > 0 && cs.visibility !== 'hidden' && !x.closest('.canonical-sidebar, .zk-palet-achter, .plaats-acties'); })
    .map((x) => ({ naam: (x.getAttribute('aria-label') || x.getAttribute('title') || x.textContent || x.tagName).trim().slice(0, 40), b: x.getBoundingClientRect(), x }));
  const uit: string[] = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], c = els[j]; if (a.x.contains(c.x) || c.x.contains(a.x)) continue;
    if (a.b.left < c.b.right - 1 && a.b.right > c.b.left + 1 && a.b.top < c.b.bottom - 1 && a.b.bottom > c.b.top + 1) uit.push(`«${a.naam}» × «${c.naam}»`);
  }
  return uit;
});

/** Kleine, echt zichtbare knoppen onder de melding (dezelfde regel als src/plaatsing/melding-plek.ts) + de gekozen plek. */
const meldingOnder = (p: Page) => p.evaluate(() => {
  const el = document.querySelector<HTMLElement>('.canonical-notification-toast');
  // onderkant van de bovenbalk zoals src/plaatsing/melding-plek.ts (BALK_STUKKEN): de <header> zelf heeft geen hoogte
  let balkOnder = 0;
  for (const e of document.querySelectorAll(".canonical-topbar .canonical-account-anchor,.mail-top-command-bar,.canonical-sidebar .canonical-menu-toggle[data-sidebar-action='open-drawer']")) { const r = e.getBoundingClientRect(); if (r.height > 0 && r.top < 120 && getComputedStyle(e).visibility !== 'hidden') balkOnder = Math.max(balkOnder, r.bottom); }
  if (!el) return { plek: '', vrij: '', knoppen: [] as string[], balkOnder };
  const t = el.getBoundingClientRect(), oud = el.style.pointerEvents; el.style.pointerEvents = 'none';
  const knoppen: string[] = [];
  try {
    for (const k of document.querySelectorAll<HTMLElement>('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[role=menuitem],[contenteditable=true]')) {
      if (k.closest('.canonical-notification-toast,.canonical-notification-panel')) continue;
      const r = k.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.width > 400 || r.height > 120) continue;
      if (!(r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top)) continue;
      const z = k as HTMLElement & { checkVisibility?: (o?: Record<string, boolean>) => boolean };
      if (z.checkVisibility && !z.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true })) continue;
      const x0 = Math.max(0, r.left), x1 = Math.min(innerWidth, r.right), y0 = Math.max(0, r.top), y1 = Math.min(innerHeight, r.bottom);
      if (x1 - x0 < 1 || y1 - y0 < 1) continue;
      const top = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
      if (!top || !(top === k || k.contains(top) || top.contains(k))) continue;
      knoppen.push(`«${(k.getAttribute('aria-label') || k.textContent || k.tagName).trim().slice(0, 40)}»`);
    }
  } finally { el.style.pointerEvents = oud; }
  return { plek: el.getAttribute('data-melding-plek') || '', vrij: el.getAttribute('data-melding-vrij') || '', knoppen, balkOnder };
});

export const plaatsingNa = (c: PlaatsCtx) => async (p: Page) => {
  const fabL = p.locator(FAB).first();
  await fabL.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw new Error('SKIP FAB «Написати» niet zichtbaar (geen mailaccount?)'); });
  await p.waitForTimeout(900);
  const v0 = p.viewportSize() || { width: 1280, height: 800 };
  const tel = v0.width <= 700, klasse = tel ? 'telefoon' : v0.width <= 1099 ? 'tablet' : 'computer';
  const rand = { telefoon: 12, tablet: 16, computer: 20 }[klasse], gn = { telefoon: 52, tablet: 48, computer: 48 }[klasse];
  const info: Record<string, unknown> = { maat: `${v0.width}×${v0.height}`, klasse }; const slecht: string[] = [];
  const foto = (naam: string) => p.screenshot({ path: join(c.uit, `plaatsing-na-${naam}-${v0.width}.png`) }).catch(() => undefined);
  const cdp = await p.context().newCDPSession(p);
  const werk = '.canonical-workspace';

  // ---- A. standaard
  const fab0 = await doosVan(p, FAB);
  info.fab = fab0;
  if (!fab0 || Math.abs(fab0.right - (v0.width - rand)) > 1 || Math.abs(fab0.bottom - (v0.height - rand)) > 1 || Math.abs(fab0.width - gn) > 1) slecht.push(`A «Написати» niet rechtsonder op ${rand} px (${JSON.stringify(fab0)})`);
  if (tel) {
    const belBuiten = await doosVan(p, BEL);
    const teller = await p.locator(MENU).first().getAttribute('data-plaats-teller').catch(() => null);
    info.telefoon = { belZonderLade: belBuiten, tellerOpMenu: teller };
    if (belBuiten) slecht.push(`A telefoon: de bel staat op de pagina (${belBuiten.left},${belBuiten.top}) — hoort in het menu`);
    await p.locator(MENU).first().click({ timeout: 5000 }); await p.waitForTimeout(500);
    const bel = await doosVan(p, BEL), av = await doosVan(p, AVATAR_LADE);
    info.lade = { bel, avatar: av };
    await foto('telefoon-menu');
    if (!bel || !av || bel.left < av.right || Math.abs(midden(bel).y - midden(av).y) > 2) slecht.push(`A telefoon: de bel staat niet rechts van de foto in de kop van het menu (bel ${JSON.stringify(bel)}, foto ${JSON.stringify(av)})`);
    await p.keyboard.press('Escape').catch(() => undefined);
    await p.locator(".canonical-drawer-close").first().click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(400);
  } else {
    const bel = await doosVan(p, BEL), av = await doosVan(p, AVATAR_BOVEN);
    info.bovenbalk = { bel, avatar: av };
    if (!bel || !av || bel.left < av.right || Math.abs(bel.top - av.top) > 1 || Math.abs(bel.width - av.width) > 2) slecht.push(`A ${klasse}: de bel staat niet rechts van de foto, even groot (bel ${JSON.stringify(bel)}, foto ${JSON.stringify(av)})`);
    if (bel && fab0 && overlapD(bel, fab0)) slecht.push('A bel en «Написати» overlappen');
  }
  const ov = await bovenOverlap(p); info.bovenOverlap = ov;
  if (ov.length) slecht.push(`A bovenbalk: overlap ${ov.join(', ')}`);
  await foto('standaard');

  // ---- L. melding op een VRIJE plek (src/plaatsing/melding-plek.ts): nooit op een kleine knop (QA 12.10 №11), de bel of «Написати»;
  //      telefoon bovenaan onder de balk (anders boven de stapel) en ☰ telt mee; computer onder de bel als dat vrij is.
  {
    await p.evaluate(() => window.dispatchEvent(new CustomEvent('tsv:canonical-notice', { detail: { text: 'Стенд: перевірка місця сповіщення', kind: 'info', source: 'stand-plaatsing' } })));
    await p.waitForTimeout(800);
    const toast = await doosVan(p, '.canonical-notification-toast'), bel = await doosVan(p, BEL), fab = await doosVan(p, FAB);
    const teller = tel ? await p.locator(MENU).first().getAttribute('data-plaats-teller').catch(() => null) : null;
    const m = await meldingOnder(p);
    info.melding = { toast, bel, fab, teller, ...m };
    await foto('melding');
    if (!toast) info.meldingNiet = 'geen melding op het scherm (dit type duikt niet op?)';
    else {
      if (m.knoppen.length) slecht.push(`L de melding (${m.plek}, vrij ${m.vrij}) ligt op ${m.knoppen.length} knop(pen): ${m.knoppen.slice(0, 4).join(', ')}`);
      if (bel && overlapD(toast, bel)) slecht.push('L de melding ligt op de bel');
      if (fab && overlapD(toast, fab)) slecht.push('L de melding ligt op «Написати»');
      if (tel) {
        if (!['boven', 'onder', 'midden'].includes(m.plek)) slecht.push(`L telefoon: onbekende plek «${m.plek}»`);
        if (m.plek === 'boven' && Math.abs(toast.top - (m.balkOnder + 6)) > 6) slecht.push(`L telefoon: de melding staat niet onder de balk (${toast.top} ↔ ${m.balkOnder + 6})`);
      } else {
        if (!['bel', 'onder', 'boven', 'midden'].includes(m.plek)) slecht.push(`L ${klasse}: onbekende plek «${m.plek}»`);
        if (m.plek === 'bel' && (!bel || toast.top < bel.bottom || Math.abs(toast.right - bel.right) > 12)) slecht.push(`L ${klasse}: «onder de bel» maar niet onder de bel (${JSON.stringify({ toast, bel })})`);
      }
    }
    if (tel && !teller) slecht.push('L ☰ telt de nieuwe melding niet (de bel staat in het menu)');
    await p.locator('.canonical-notification-toast .canonical-notification-icon-button').last().click({ timeout: 2000 }).catch(() => undefined);
    await p.waitForTimeout(400);
  }

  // ---- B. scrollen zonder formaatwijziging
  {
    const opname = neemOp(p, 900); await p.waitForTimeout(80);
    for (let i = 0; i < 3; i++) { await p.evaluate((s) => { const w = document.querySelector(s); if (w) w.scrollTop += 260; }, werk); await p.waitForTimeout(90); }
    const a = analyse(await opname, 80); info.scrollen = a;
    if (a.fab.posities > 1 || a.bel.posities > 1) slecht.push(`B scrollen: «Написати» ${a.fab.posities} / bel ${a.bel.posities} posities`);
    await p.evaluate((s) => { const w = document.querySelector(s); if (w) w.scrollTop = 0; }, werk); await p.waitForTimeout(300);
  }
  // ---- C. adresbalk ±56
  for (const [naam, h] of [['adresbalk-weg', v0.height + 56], ['adresbalk-terug', v0.height]] as const) {
    const opname = neemOp(p, 1100); await p.waitForTimeout(150);
    await p.setViewportSize({ width: v0.width, height: h });
    const a = analyse(await opname, 150); info[naam] = a;
    // glijden = tussenposities; de ene sprong mag een paar frames na de resize komen (de browser legt dan pas uit)
    if (a.fab.posities > 2) slecht.push(`C ${naam}: «Написати» glijdt (${a.fab.posities} posities, stil na ${a.fab.stilNaMs} ms)`);
    if (a.fab.framesOnderRand || a.bel.framesOnderRand) slecht.push(`C ${naam}: knop (deels) onder de onderrand`);
    if (a.framesOverlap) slecht.push(`C ${naam}: overlap in ${a.framesOverlap} frames`);
    if (!tel && a.bel.posities > 1) slecht.push(`C ${naam}: de bel beweegt (${a.bel.posities} posities)`);
    await p.waitForTimeout(300);
  }
  // ---- D. «Вгору»
  {
    const voor = await doosVan(p, FAB);
    await p.evaluate((s) => { const w = document.querySelector(s); if (w) w.scrollTop = w.scrollHeight; }, werk); await p.waitForTimeout(500);
    const box = await p.locator(werk).first().boundingBox();
    if (box) { await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); for (let i = 0; i < 3; i++) { await p.mouse.wheel(0, -160); await p.waitForTimeout(40); } }
    await p.waitForTimeout(450);
    const vb = await doosVan(p, '.canonical-scroll-top'), na = await doosVan(p, FAB);
    info.vomhoog = { vomhoog: vb, fabVoor: voor, fabNa: na };
    await foto('vomhoog');
    if (!vb) info.vomhoogNiet = 'niet verschenen (te weinig inhoud of te traag gescrold)';
    else {
      if (!na || vb.bottom > na.top - 8 || overlapD(vb, na)) slecht.push(`D «Вгору» niet in zijn gniezdo boven «Написати» (${JSON.stringify(vb)} / ${JSON.stringify(na)})`);
      if (voor && na && (voor.left !== na.left || voor.top !== na.top)) slecht.push('D «Написати» schoof toen «Вгору» verscheen');
    }
    await p.evaluate((s) => { const w = document.querySelector(s); if (w) w.scrollTop = 0; }, werk); await p.waitForTimeout(500);
  }
  // ---- E. veeg die op «Написати» begint (zonder vasthouden) = scrollen
  {
    const voor = await doosVan(p, FAB);
    if (voor) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const { x, y } = midden(voor);
      const s0 = await p.evaluate((s) => document.querySelector(s)?.scrollTop || 0, werk);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 30 }] }); await p.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(600);
      const na = await doosVan(p, FAB), s1 = await p.evaluate((s) => document.querySelector(s)?.scrollTop || 0, werk);
      const sleep = await p.evaluate(() => document.documentElement.dataset.plaatsSleep || '');
      info.veeg = { voor, na, scrollVoor: s0, scrollNa: s1, sleep };
      if (!na || na.left !== voor.left || na.top !== voor.top || sleep) slecht.push(`E veeg op «Написати» sleept de knop (${JSON.stringify(na)})`);
      if (s1 <= s0) info.veegScrolde = 'nee (de gebeurtenissen van CDP scrollen in deze modus niet altijd — alleen de knop telt)';
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await p.evaluate((s) => { const w = document.querySelector(s); if (w) w.scrollTop = 0; }, werk); await p.waitForTimeout(300);
    }
  }
  // ---- F. knijpzoom ×3
  {
    const voorF = await doosVan(p, FAB), voorB = await doosVan(p, BEL);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 3 }).catch((e) => { info.zoomFout = String(e).slice(0, 200); });
    await p.waitForTimeout(800);
    const m = await meet(p);
    info.zoom = { vv: m.vv, fab: m.fab, bel: m.bel, fabVoor: voorF, belVoor: voorB };
    await foto('zoom3');
    if (voorF && m.fab && (Math.abs(m.fab.left - voorF.left) > 1 || Math.abs(m.fab.top - voorF.top) > 1)) slecht.push(`F zoom ×3: «Написати» verschuift met het zichtbare stuk (${voorF.left},${voorF.top} → ${m.fab.left},${m.fab.top})`);
    if (voorB && m.bel && (Math.abs(m.bel.left - voorB.left) > 1 || Math.abs(m.bel.top - voorB.top) > 1)) slecht.push(`F zoom ×3: de bel verschuift met het zichtbare stuk`);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }).catch(() => undefined);
    await p.waitForTimeout(500);
  }
  // ---- M. onderbalk (verbindingsbalk) verschijnt en verdwijnt: de stapel staat erboven, in één stap, en zakt daarna terug
  {
    const voor = await doosVan(p, FAB);
    const opname = neemOp(p, 1400); await p.waitForTimeout(100);
    await p.evaluate(() => { const c = document.querySelector('.canonical-chrome'); c?.insertAdjacentHTML('beforeend', '<div class="canonical-connection-banner" data-stand-nep="1" role="status"><span><strong>Стенд: немає з’єднання</strong><small>Перевірка: стос дій стоїть над смугою.</small></span></div>'); });
    await p.waitForTimeout(600);
    const balk = await doosVan(p, "[data-stand-nep='1']"), met = await doosVan(p, FAB);
    await foto('onderbalk');
    await p.evaluate(() => document.querySelector("[data-stand-nep='1']")?.remove());
    const a = analyse(await opname, 100);
    await p.waitForTimeout(400);
    const na = await doosVan(p, FAB);
    info.onderbalk = { balk, voor, met, na, opname: a.fab };
    if (balk && met && overlapD(balk, met)) slecht.push(`M «Написати» ligt op de verbindingsbalk (${JSON.stringify({ balk, met })})`);
    if (balk && met && balk.left < met.right && balk.right > met.left && met.bottom > balk.top) slecht.push('M de stapel staat niet boven de verbindingsbalk');
    if (a.fab.posities > 3) slecht.push(`M de stapel glijdt bij de balk (${a.fab.posities} posities)`);
    if (voor && na && (voor.left !== na.left || voor.top !== na.top)) slecht.push('M na het verdwijnen van de balk staat «Написати» niet terug op zijn plek');
  }

  // ---- G. slepen: «Написати» naar de bovenbalk
  const sleepNaar = async (van: { x: number; y: number }, naar: { x: number; y: number }, opties: { aanraken: boolean; houdBij?: () => Promise<void> }) => {
    if (opties.aanraken) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: van.x, y: van.y }] });
      await p.waitForTimeout(650); // vasthouden: 450 ms + marge
      for (let i = 1; i <= 14; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: van.x + ((naar.x - van.x) * i) / 14, y: van.y + ((naar.y - van.y) * i) / 14 }] }); await p.waitForTimeout(20); }
      if (opties.houdBij) await opties.houdBij();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    } else {
      await p.mouse.move(van.x, van.y); await p.mouse.down();
      for (let i = 1; i <= 14; i++) await p.mouse.move(van.x + ((naar.x - van.x) * i) / 14, van.y + ((naar.y - van.y) * i) / 14);
      if (opties.houdBij) await opties.houdBij();
      await p.mouse.up();
    }
    await p.waitForTimeout(700);
  };
  {
    const f = await doosVan(p, FAB), zone = await doosVan(p, "[data-plaats-zone='bovenbalk']");
    const doel = tel ? { x: v0.width - 30, y: 30 } : zone ? { x: zone.right - 4, y: midden(zone).y } : { x: v0.width - 30, y: 37 };
    let tijdens: unknown = null;
    if (f) await sleepNaar(midden(f), doel, { aanraken: tel, houdBij: async () => {
      await p.waitForTimeout(250);
      tijdens = await p.evaluate(() => ({ sleep: document.documentElement.dataset.plaatsSleep || '', doel: document.querySelector("[data-plaats-zone='bovenbalk']")?.getAttribute('data-plaats-doel') || '', voorbeeld: !!document.querySelector('.plaats-voorbeeld'), teller: [...document.querySelectorAll('.plaats-zone-teller')].map((x) => x.textContent) }));
      await foto('slepen');
    } });
    const na = await doosVan(p, FAB), cmd = await doosVan(p, '.mail-top-command-bar'), vk = await plaatsingVoorkeur(p);
    info.slepen = { tijdens, fab: na, opdrachtbalk: cmd, voorkeur: vk };
    const t = tijdens as { sleep: string; doel: string; voorbeeld: boolean; teller: string[] } | null;
    if (!t || t.sleep !== 'opstellen' || t.doel !== 'hier' || !t.voorbeeld || !t.teller.some((x) => /Верхня панель · \d з \d|Bovenbalk · \d van \d/.test(x || ''))) slecht.push(`G tijdens het slepen: geen oplichtende bovenbalk met teller en open gniezdo (${JSON.stringify(t)})`);
    if (!na || na.top > 70) slecht.push(`G «Написати» staat na het loslaten niet in de bovenbalk (${JSON.stringify(na)})`);
    if (na && cmd && cmd.right > na.left + 1) slecht.push(`G de opdrachtbalk van de post wijkt niet voor «Написати» (balk tot ${cmd.right}, knop vanaf ${na.left})`);
    const ov2 = await bovenOverlap(p); if (ov2.length) slecht.push(`G bovenbalk na het verplaatsen: overlap ${ov2.join(', ')}`);
    if (!vk || vk.klassen?.[klasse]?.opstellen?.zone !== 'bovenbalk') slecht.push(`G keuze niet bewaard voor ${klasse} (${JSON.stringify(vk)})`);
    await foto('na-slepen');
    // herladen: het eerste beeld is de eindplaats
    await p.addInitScript(() => {
      const t0 = performance.now(); const uit: Array<{ t: number; b: string }> = []; (window as unknown as { __fabStart: typeof uit }).__fabStart = uit;
      const stap = () => { const el = document.querySelector('[data-mail-compose-float]'); const b = el?.getBoundingClientRect(); const s = b && b.width ? `${Math.round(b.left)},${Math.round(b.top)}` : '—'; if (!uit.length || uit[uit.length - 1].b !== s) uit.push({ t: Math.round(performance.now() - t0), b: s }); if (performance.now() - t0 < 5000) requestAnimationFrame(stap); };
      requestAnimationFrame(stap);
    });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.locator(FAB).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(5200);
    const start = await p.evaluate(() => (window as unknown as { __fabStart?: Array<{ t: number; b: string }> }).__fabStart || []);
    const naHerladen = await doosVan(p, FAB);
    info.herladen = { start, fab: naHerladen };
    if (!naHerladen || naHerladen.top > 70) slecht.push(`G na herladen staat «Написати» niet meer in de bovenbalk (${JSON.stringify(naHerladen)})`);
    const plekken = [...new Set(start.filter((x) => x.b !== '—').map((x) => x.b))];
    if (plekken.length > 1) slecht.push(`G herladen: «Написати» verschijnt op ${plekken.length} plekken na elkaar (${plekken.join(' → ')})`);
  }
  // ---- H. (telefoon) volle zone: «Написати» naar de kop van het menu (foto + дзвоник = 2 з 2), lade via ☰
  if (tel) {
    const f = await doosVan(p, FAB), m = await doosVan(p, MENU);
    let tijdens: unknown = null;
    if (f && m) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const van = midden(f), opMenu = midden(m);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [van] });
      await p.waitForTimeout(650);
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: van.x + ((opMenu.x - van.x) * i) / 10, y: van.y + ((opMenu.y - van.y) * i) / 10 }] }); await p.waitForTimeout(20); }
      await p.waitForTimeout(900); // ≥ 650 ms boven ☰ → de lade gaat open
      const ladeOpen = await p.evaluate(() => !!document.querySelector('.canonical-chrome.sidebar-drawer'));
      const kop = await doosVan(p, "[data-plaats-zone='lade-kop']");
      if (kop) {
        const k = { x: kop.left + kop.width / 2, y: kop.top + kop.height / 2 };
        for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: opMenu.x + ((k.x - opMenu.x) * i) / 6, y: opMenu.y + ((k.y - opMenu.y) * i) / 6 }] }); await p.waitForTimeout(20); }
        await p.waitForTimeout(250);
      }
      tijdens = await p.evaluate(() => ({ ladeOpen: !!document.querySelector('.canonical-chrome.sidebar-drawer'), doel: document.querySelector("[data-plaats-zone='lade-kop']")?.getAttribute('data-plaats-doel') || '', hint: (document.querySelector('.plaats-zone-hint:not([hidden])')?.textContent || '').trim() }));
      (tijdens as Record<string, unknown>).ladeDoorVeer = ladeOpen;
      await foto('volle-zone');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await p.waitForTimeout(700);
    }
    const na = await doosVan(p, FAB), status = await p.evaluate(() => document.querySelector('[data-plaats-status]')?.textContent || '');
    info.volleZone = { tijdens, fab: na, status };
    const t = tijdens as { ladeOpen: boolean; ladeDoorVeer: boolean; doel: string; hint: string } | null;
    if (!t?.ladeDoorVeer) slecht.push('H de lade ging niet open toen «Написати» boven ☰ werd vastgehouden');
    if (!t || t.doel !== 'vol-hier' || !/усі гнізда зайняті|alle plekken bezet/.test(t.hint)) slecht.push(`H volle zone zonder rode rand of hint (${JSON.stringify(t)})`);
    if (!na || na.top > 70) slecht.push(`H na loslaten op de volle zone staat «Написати» niet meer waar hij was (${JSON.stringify(na)})`);
    if (await p.evaluate(() => !!document.querySelector('.canonical-chrome.sidebar-drawer'))) { await p.locator('.canonical-drawer-close').first().click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(400); }
  }
  // ---- I. «Перемістити до…» met het toetsenbord (computer/tablet: de bel; telefoon: «Написати»)
  {
    const knop = tel ? FAB : BEL;
    await p.locator(knop).first().focus().catch(() => undefined);
    await p.keyboard.press('Shift+F10'); await p.waitForTimeout(500);
    const open = await p.evaluate(() => ({ menu: document.querySelector('.plaats-acties')?.getAttribute('data-plaats-acties') || '', focus: document.activeElement?.closest('.plaats-acties') ? 'in-menu' : 'elders', zones: [...document.querySelectorAll('.plaats-acties [data-plaats-naar]')].map((x) => `${x.getAttribute('data-plaats-naar')}${(x as HTMLButtonElement).disabled ? '(vol)' : ''}${x.getAttribute('aria-current') ? '(hier)' : ''}`) }));
    await foto('verplaatsen-menu');
    // Esc sluit, focus terug op de knop
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const naEsc = await p.evaluate((s) => ({ menu: !!document.querySelector('.plaats-acties'), focusOpKnop: !!document.activeElement?.closest(s) }), knop);
    // opnieuw, met pijlen naar «Стос дій» en Enter
    await p.keyboard.press('Shift+F10'); await p.waitForTimeout(400);
    const naar = await p.evaluate(() => { const items = [...document.querySelectorAll<HTMLButtonElement>('.plaats-acties [data-plaats-naar]')]; return items.findIndex((x) => x.dataset.plaatsNaar === 'actiestapel'); });
    for (let i = 0; i < naar; i++) await p.keyboard.press('ArrowDown');
    await p.keyboard.press('Enter'); await p.waitForTimeout(700);
    const na = await doosVan(p, knop), status = await p.evaluate(() => document.querySelector('[data-plaats-status]')?.textContent || '');
    info.toetsenbord = { open, naEsc, naarIndex: naar, na, status };
    if (open.menu !== (tel ? 'opstellen' : 'bel') || open.focus !== 'in-menu' || !open.zones.length) slecht.push(`I Shift+F10 opent «Перемістити до…» niet (met focus) (${JSON.stringify(open)})`);
    if (naEsc.menu || !naEsc.focusOpKnop) slecht.push(`I Esc sluit het menu niet of de focus gaat niet terug (${JSON.stringify(naEsc)})`);
    if (!na || na.bottom < v0.height / 2) slecht.push(`I met pijlen + Enter staat de knop niet in de stapel (${JSON.stringify(na)})`);
    if (!/тепер у «Стос дій»|staat nu in «Actiestapel»/.test(status)) slecht.push(`I geen aankondiging voor de schermlezer (${status})`);
    await foto('na-toetsenbord');
  }
  // ---- J. (telefoon) computer → telefoon: elk zijn eigen plaats
  if (tel) {
    await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(900);
    const belPc = await doosVan(p, BEL), fabPc = await doosVan(p, FAB);
    await p.setViewportSize({ width: v0.width, height: v0.height }); await p.waitForTimeout(900);
    const belTel = await doosVan(p, BEL);
    info.pcTelefoon = { belPc, fabPc, belTel };
    if (!belPc || belPc.top > 70) slecht.push(`J op de computer staat de bel niet in de bovenbalk (de telefoonkeuze lekt door) (${JSON.stringify(belPc)})`);
    if (belTel) slecht.push(`J op de telefoon staat de bel op de pagina (${JSON.stringify(belTel)})`);
  }
  // ---- O. de bel als regel van het menu («Список меню»): via «Перемістити до…»; klik opent het paneel; ☰ telt (telefoon)
  {
    // eerst alles terug, zodat de bel op zijn standaardplek staat
    const knop0 = tel ? FAB : BEL;
    await p.locator(knop0).first().focus().catch(() => undefined);
    await p.keyboard.press('Shift+F10'); await p.waitForTimeout(400);
    const alles = p.locator('.plaats-acties [data-plaats-alles-terug]').first();
    if (await alles.count()) { await alles.click({ timeout: 3000 }); await p.waitForTimeout(600); } else await p.keyboard.press('Escape');
    if (tel) { await p.locator(MENU).first().click({ timeout: 5000 }); await p.waitForTimeout(500); }
    await p.locator(BEL).first().focus().catch(() => undefined);
    await p.keyboard.press('Shift+F10'); await p.waitForTimeout(400);
    const naar = await p.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('.plaats-acties [data-plaats-naar]')].findIndex((x) => x.dataset.plaatsNaar === 'zijbalk'));
    for (let i = 0; i < naar; i++) await p.keyboard.press('ArrowDown');
    await p.keyboard.press('Enter'); await p.waitForTimeout(700);
    if (tel && !(await p.locator('.canonical-chrome.sidebar-drawer').count())) { await p.locator(MENU).first().click({ timeout: 5000 }); await p.waitForTimeout(500); }
    const rij = await p.evaluate(() => { const b = document.querySelector("[data-plaats-zone='zijbalk'] [data-qa-id='canonical-notification-bell']"); const r = b?.getBoundingClientRect(); return b && r ? { vorm: b.getAttribute('data-vorm'), label: (b.querySelector('.plaats-rij-label')?.textContent || '').trim(), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) } : null; });
    await foto('bel-in-menu');
    let paneel = false;
    if (rij) { await p.locator("[data-plaats-zone='zijbalk'] [data-qa-id='canonical-notification-bell']").first().click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(600); paneel = !!(await p.locator('.canonical-notification-panel').count()); await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
    let teller: string | null = null;
    if (tel) {
      if (await p.locator('.canonical-chrome.sidebar-drawer').count()) { await p.locator('.canonical-drawer-close').first().click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(400); }
      await p.evaluate(() => window.dispatchEvent(new CustomEvent('tsv:canonical-notice', { detail: { text: 'Стенд: дзвоник у меню', kind: 'info', source: 'stand-plaatsing' } })));
      await p.waitForTimeout(600);
      teller = await p.locator(MENU).first().getAttribute('data-plaats-teller').catch(() => null);
    }
    info.belInMenu = { naarIndex: naar, rij, paneel, teller };
    if (!rij || rij.vorm !== 'rij' || !/Сповіщення|Meldingen/.test(rij.label)) slecht.push(`O de bel staat niet als regel in het menu (${JSON.stringify(rij)})`);
    if (rij && !paneel) slecht.push('O de bel als menuregel opent het paneel niet');
    if (tel && !teller) slecht.push('O ☰ telt de meldingen niet terwijl de bel in het menu staat');
  }
  // ---- N. «Редагувати меню»: een klik op een verplaatsbare knop opent «Перемістити до…» (in plaats van zijn gewone actie)
  {
    if (tel && !(await p.locator('.canonical-chrome.sidebar-drawer').count())) { await p.locator(MENU).first().click({ timeout: 5000 }).catch(() => undefined); await p.waitForTimeout(500); }
    const bewerk = p.locator('[data-menu-bewerken-knop]').first();
    const kan = await bewerk.isVisible().catch(() => false);
    let menu = '', opstellenOpen = false, diag: unknown = null;
    if (kan) {
      await bewerk.click({ timeout: 3000 }); await p.waitForTimeout(600);
      diag = await p.evaluate((f) => { const el = document.querySelector(f); const r = el?.getBoundingClientRect(); const t = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null; return { bewerken: document.querySelector('main.canonical-chrome')?.getAttribute('data-menu-bewerken'), lade: !!document.querySelector('.canonical-chrome.sidebar-drawer'), stapel: getComputedStyle(document.querySelector('.plaats-actiestapel') as Element).visibility, opPunt: t ? `${t.tagName.toLowerCase()}.${String((t as HTMLElement).className || '').split(' ')[0]}` : null }; }, FAB);
      await p.locator(FAB).first().click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(500);
      menu = await p.evaluate(() => document.querySelector('.plaats-acties')?.getAttribute('data-plaats-acties') || '');
      opstellenOpen = !!(await p.locator('.mail-new-message').count());
      await foto('bewerken');
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      if (await p.locator('[data-menu-bewerken-knop][aria-pressed="true"]').count()) { await p.locator('[data-menu-bewerken-knop]').first().click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(500); }
    }
    info.bewerken = { kan, menu, opstellenOpen, diag };
    if (kan && (menu !== 'opstellen' || opstellenOpen)) slecht.push(`N in «Редагувати меню» opent een klik op «Написати» niet «Перемістити до…» (menu ${menu || '—'}, nieuw bericht ${opstellenOpen}, ${JSON.stringify(diag)})`);
    if (await p.locator('.canonical-chrome.sidebar-drawer').count()) { await p.locator('.canonical-drawer-close').first().click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(400); }
  }
  // ---- K. alles terug naar de standaard
  {
    const knop = tel ? FAB : BEL;
    await p.locator(knop).first().focus().catch(() => undefined);
    await p.keyboard.press('Shift+F10'); await p.waitForTimeout(400);
    const k = p.locator('.plaats-acties [data-plaats-alles-terug]').first();
    const was = await k.count();
    if (was) { await k.click({ timeout: 3000 }); await p.waitForTimeout(800); } else await p.keyboard.press('Escape');
    const fab = await doosVan(p, FAB), vk = await plaatsingVoorkeur(p);
    info.terug = { knop: was, fab, voorkeur: vk };
    if (!was) slecht.push('K «Скинути всі кнопки до типового» ontbreekt terwijl er iets verplaatst is');
    if (!fab || Math.abs(fab.right - (v0.width - rand)) > 1 || Math.abs(fab.bottom - (v0.height - rand)) > 1) slecht.push(`K na «Скинути» staat «Написати» niet terug rechtsonder (${JSON.stringify(fab)})`);
    if (vk && vk.klassen && vk.klassen[klasse]) slecht.push(`K na «Скинути» staat er nog een keuze voor ${klasse}: ${JSON.stringify(vk.klassen[klasse])}`);
    await foto('terug');
  }
  // de muis niet boven het menu laten staan: een menu-item met teller opent anders bij de volgende stap zijn bubbel (hover)
  await p.mouse.move(Math.round(v0.width * 0.6), Math.round(v0.height * 0.55)).catch(() => undefined);
  writeFileSync(join(c.uit, `plaatsing-na-${v0.width}.json`), JSON.stringify(info, null, 1));
  c.meting('plaatsing-na', p, slecht.join(' · '), JSON.stringify(info));
};

// plaatsing-dok (25.10.2026): het menu rechts, als dock boven of onder (Налаштування → Меню) — de actiestapel blijft in het INHOUDSVLAK
// (links van een menu rechts, boven een dock onder), de bel in de bovenbalk raakt het dock niet. Alleen op de computer/tablet.
export const plaatsingDok = (c: PlaatsCtx, menuUrl: string, mailUrl: string) => async (p: Page) => {
  const v0 = p.viewportSize() || { width: 1280, height: 800 };
  if (v0.width < 721) throw new Error('SKIP menu rechts/dock alleen op de computer (telefoon: lade)');
  const slecht: string[] = [], info: Record<string, unknown> = { maat: `${v0.width}×${v0.height}` };
  const zet = async (pos: string) => {
    await p.goto(`${menuUrl}#menu-indeling`, { waitUntil: 'load' });
    const blok = p.locator('details#menu-indeling').first();
    await blok.waitFor({ timeout: 15000 });
    if (!(await blok.evaluate((d) => (d as HTMLDetailsElement).open))) await blok.locator(':scope > summary').click();
    const k = p.locator(`[data-dock-positie="${pos}"]`).first();
    await k.waitFor({ timeout: 15000 }); await k.click(); await p.waitForTimeout(2500);
  };
  try {
    for (const dock of ['rechts', 'boven', 'onder'] as const) {
      await zet(dock);
      await p.goto(mailUrl, { waitUntil: 'load' });
      await p.locator(FAB).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(1200);
      const echt = await p.evaluate(() => document.querySelector('main.canonical-chrome')?.getAttribute('data-dock') || '');
      const fab = await doosVan(p, FAB), bel = await doosVan(p, BEL), menu = await doosVan(p, '.canonical-sidebar');
      info[dock] = { echt, fab, bel, menu };
      await p.screenshot({ path: join(c.uit, `plaatsing-dok-${dock}-${v0.width}.png`) }).catch(() => undefined);
      if (echt !== dock) { slecht.push(`${dock}: niet toegepast (data-dock ${echt || '-'})`); continue; }
      if (!fab) { slecht.push(`${dock}: «Написати» niet zichtbaar`); continue; }
      if (menu && overlapD(fab, menu)) slecht.push(`${dock}: «Написати» ligt op het menu (${JSON.stringify({ fab, menu })})`);
      if (bel && menu && overlapD(bel, menu)) slecht.push(`${dock}: de bel ligt op het menu (${JSON.stringify({ bel, menu })})`);
      if (dock === 'rechts' && menu && fab.right > menu.left - 8) slecht.push(`rechts: «Написати» niet links van het menu (${fab.right} > ${menu.left - 8})`);
      // 25.10.2026: het dock onder is een zwevende balk in het midden (max. 100vw − 200 px, menu-v2.css) en reikt dus niet tot de
      // kolom van de stapel. Alleen als het dock ónder de stapel ligt (horizontale overlap) moet «Написати» erboven staan.
      const onderKolom = (f: Doos, m: Doos) => f.left < m.right && f.right > m.left;
      if (dock === 'onder' && menu && onderKolom(fab, menu) && fab.bottom > menu.top - 4) slecht.push(`onder: «Написати» niet boven het dock (${fab.bottom} > ${menu.top - 4})`);
      if (dock === 'onder' && menu) {
        // brede dock (bv. veel vastgezette items): de balk rekt uit tot onder de stapel → de stapel moet meteen omhoog (ResizeObserver)
        await p.evaluate(() => { const el = document.querySelector<HTMLElement>('.canonical-sidebar'); if (el) { el.style.setProperty('max-width', 'none', 'important'); el.style.setProperty('width', 'calc(100vw - 16px)', 'important'); } });
        await p.waitForTimeout(700);
        const fab2 = await doosVan(p, FAB), menu2 = await doosVan(p, '.canonical-sidebar');
        info.onderBreed = { fab: fab2, menu: menu2 };
        await p.screenshot({ path: join(c.uit, `plaatsing-dok-onder-breed-${v0.width}.png`) }).catch(() => undefined);
        if (!fab2 || !menu2) slecht.push('onder (breed): «Написати» of het dock niet gevonden');
        else if (!onderKolom(fab2, menu2)) slecht.push(`onder (breed): het uitgerekte dock reikt niet tot de stapel (${JSON.stringify({ fab2, menu2 })})`);
        else if (fab2.bottom > menu2.top - 4) slecht.push(`onder (breed): «Написати» niet boven het uitgerekte dock (${fab2.bottom} > ${menu2.top - 4})`);
        await p.evaluate(() => { const el = document.querySelector<HTMLElement>('.canonical-sidebar'); el?.style.removeProperty('max-width'); el?.style.removeProperty('width'); });
      }
    }
  } finally {
    await zet('links').catch(() => undefined);
    await p.goto(mailUrl, { waitUntil: 'load' }).catch(() => undefined);
    await p.mouse.move(Math.round(v0.width * 0.6), Math.round(v0.height * 0.55)).catch(() => undefined);
    await p.waitForTimeout(800);
  }
  writeFileSync(join(c.uit, `plaatsing-dok-${v0.width}.json`), JSON.stringify(info, null, 1));
  c.meting('plaatsing-dok', p, slecht.join(' · '), JSON.stringify(info));
};

/** 25.10.2026: de NIEUWE lagen in licht én donker, met axe-core (WCAG 2.2 AA, contrast inbegrepen): de tellers op de zones tijdens het
 *  slepen, de hint bij een volle zone (telefoon) en «Перемістити до…». Elke laag één keer per thema geopend; Esc annuleert het slepen
 *  (de knop blijft waar hij was). Eindigt met «Перемістити до…» open, zodat de gewone analyse van de stand die ook meeneemt. */
export const plaatsingLagen = (c: PlaatsCtx & { axe: string; hubUrl?: string }) => async (p: Page) => {
  const fabL = p.locator(FAB).first();
  await fabL.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw new Error('SKIP FAB «Написати» niet zichtbaar (geen mailaccount?)'); });
  await p.waitForTimeout(900);
  const v0 = p.viewportSize() || { width: 1280, height: 800 };
  const tel = v0.width <= 700;
  const slecht: string[] = [], info: Record<string, unknown> = { maat: `${v0.width}×${v0.height}` };
  const foto = (naam: string) => p.screenshot({ path: join(c.uit, `plaatsing-lagen-${naam}-${v0.width}.png`) }).catch(() => undefined);
  const axe = async (sels: string[]) => {
    if (!c.axe) return { v: [] as Array<{ id: string; nodes: number; doel: string[] }>, doelen: [] as string[], geenAxe: true };
    if (!(await p.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe !== 'undefined'))) await p.evaluate(c.axe).catch(() => undefined);
    return p.evaluate(async (s) => {
      const doelen = s.filter((x) => document.querySelector(x));
      if (!doelen.length) return { v: [], doelen, geenAxe: false };
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } };
      const r = await w.axe.run({ include: doelen.map((x) => [x]) }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
      return { v: r.violations.map((x) => ({ id: x.id, nodes: x.nodes.length, doel: x.nodes.slice(0, 3).map((n) => n.target.join(' ').slice(0, 120)) })), doelen, geenAxe: false };
    }, sels);
  };
  const meld = (laag: string, thema: string, r: { v: Array<{ id: string; nodes: number; doel: string[] }>; doelen: string[]; geenAxe?: boolean }) => {
    if (r.geenAxe) return;
    if (!r.doelen.length) slecht.push(`${laag} (${thema}): de laag is niet gevonden`);
    if (r.v.length) slecht.push(`${laag} (${thema}): axe ${r.v.map((x) => `${x.id}×${x.nodes} [${x.doel.join(' | ')}]`).join(', ')}`);
  };
  const sleepBegin = async (van: { x: number; y: number }) => { await p.mouse.move(van.x, van.y); await p.mouse.down(); };
  const sleepNaar = async (van: { x: number; y: number }, naar: { x: number; y: number }, n = 12) => { for (let i = 1; i <= n; i++) await p.mouse.move(van.x + ((naar.x - van.x) * i) / n, van.y + ((naar.y - van.y) * i) / n); };
  const annuleer = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(600); };
  const thema = async (t: 'licht' | 'donker') => { await p.emulateMedia({ colorScheme: t === 'donker' ? 'dark' : 'light' }); await p.waitForTimeout(450); };
  // 0. de melding op een pagina zonder post (hub): ook daar een vrije plek — onder de bel als daar niets ligt
  if (c.hubUrl) {
    const terug = p.url();
    await p.goto(c.hubUrl, { waitUntil: 'load' });
    await p.locator(tel ? MENU : BEL).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(1200);
    await p.evaluate(() => window.dispatchEvent(new CustomEvent('tsv:canonical-notice', { detail: { text: 'Стенд: сповіщення на хабі', kind: 'info', source: 'stand-plaatsing' } })));
    await p.waitForTimeout(800);
    const toast = await doosVan(p, '.canonical-notification-toast'), bel = await doosVan(p, BEL), m = await meldingOnder(p);
    info.hub = { toast, bel, ...m };
    await foto('melding-hub');
    if (!toast) slecht.push('hub: geen melding op het scherm');
    else {
      if (m.knoppen.length) slecht.push(`hub: de melding (${m.plek}, vrij ${m.vrij}) ligt op ${m.knoppen.length} knop(pen): ${m.knoppen.slice(0, 4).join(', ')}`);
      if (bel && overlapD(toast, bel)) slecht.push('hub: de melding ligt op de bel');
    }
    await p.locator('.canonical-notification-toast .canonical-notification-icon-button').last().click({ timeout: 2000 }).catch(() => undefined);
    await p.goto(terug, { waitUntil: 'load' });
    await p.locator(FAB).first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    await p.waitForTimeout(900);
  }
  try {
    for (const t of ['licht', 'donker'] as const) {
      await thema(t);
      const r: Record<string, unknown> = {};
      // 1. slepen: tellers op de zones (muis — op elke maat; aanraken staat in plaatsing-na)
      const f = await doosVan(p, FAB), zone = await doosVan(p, "[data-plaats-zone='bovenbalk']");
      if (f) {
        const doel = zone ? { x: zone.right - 4, y: midden(zone).y } : { x: v0.width - 30, y: 30 };
        await sleepBegin(midden(f)); await sleepNaar(midden(f), doel); await p.waitForTimeout(350);
        r.slepen = await p.evaluate(() => ({ sleep: document.documentElement.dataset.plaatsSleep || '', tellers: [...document.querySelectorAll('.plaats-zone-teller')].map((x) => (x.textContent || '').trim()) }));
        const a = await axe(['.plaats-zone-teller']); r.axeSlepen = a; meld('tellers tijdens het slepen', t, a);
        await foto(`slepen-${t}`);
        await annuleer();
        const terug = await doosVan(p, FAB);
        if (!terug || Math.abs(terug.left - f.left) > 1 || Math.abs(terug.top - f.top) > 1) slecht.push(`Esc tijdens het slepen (${t}): «Написати» staat niet terug (${JSON.stringify({ f, terug })})`);
        if (!(r.slepen as { tellers: string[] }).tellers.length) slecht.push(`slepen (${t}): geen tellers op de zones`);
      }
      // 2. telefoon: volle zone (kop van het menu, foto + дзвоник = 2 з 2) — de lade gaat open door boven ☰ te blijven
      if (tel) {
        const f2 = await doosVan(p, FAB), m = await doosVan(p, MENU);
        if (f2 && m) {
          await sleepBegin(midden(f2)); await sleepNaar(midden(f2), midden(m), 10); await p.waitForTimeout(900);
          const kop = await doosVan(p, "[data-plaats-zone='lade-kop']");
          if (kop) { await sleepNaar(midden(m), midden(kop), 6); await p.waitForTimeout(300); }
          r.vol = await p.evaluate(() => ({ doel: document.querySelector("[data-plaats-zone='lade-kop']")?.getAttribute('data-plaats-doel') || '', hint: (document.querySelector('.plaats-zone-hint:not([hidden])')?.textContent || '').trim() }));
          const a = await axe(['.plaats-zone-hint', '.plaats-zone-teller']); r.axeVol = a; meld('hint bij een volle zone', t, a);
          await foto(`volle-zone-${t}`);
          await annuleer();
          if ((r.vol as { doel: string }).doel !== 'vol-hier') slecht.push(`volle zone (${t}): geen rode rand (${JSON.stringify(r.vol)})`);
          if (await p.evaluate(() => !!document.querySelector('.canonical-chrome.sidebar-drawer'))) { await p.locator('.canonical-drawer-close').first().click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(400); }
        }
      }
      // 3. «Перемістити до…» met de rechtermuisknop (computer/tablet: de bel, telefoon: «Написати»)
      const doelKnop = await doosVan(p, tel ? FAB : BEL);
      if (doelKnop) {
        await p.mouse.click(midden(doelKnop).x, midden(doelKnop).y, { button: 'right' }); await p.waitForTimeout(500);
        r.menu = await p.evaluate(() => ({ open: !!document.querySelector('.plaats-acties'), zones: document.querySelectorAll('.plaats-acties [data-plaats-naar]').length }));
        const a = await axe(['.plaats-acties']); r.axeMenu = a; meld('«Перемістити до…»', t, a);
        await foto(`menu-${t}`);
        if (!(r.menu as { open: boolean }).open) slecht.push(`«Перемістити до…» (${t}): niet geopend met de rechtermuisknop`);
        if (t === 'licht') { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
      }
      info[t] = r;
    }
  } finally {
    await p.emulateMedia({ colorScheme: 'light' }).catch(() => undefined);
  }
  writeFileSync(join(c.uit, `plaatsing-lagen-${v0.width}.json`), JSON.stringify(info, null, 1));
  c.meting('plaatsing-lagen', p, slecht.join(' · '), JSON.stringify(info));
};
