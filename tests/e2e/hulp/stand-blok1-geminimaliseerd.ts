// Blok 1 (25.10.2026): stappen van het team «geminimaliseerd» — zie stand-blok1.ts. Namen: «blok1-geminimaliseerd-…».
//
// blok1-geminimaliseerd-dok (1.3/1.4, schermafdrukken eigenaar f83fade0 / 538db84e / 4edfead2): twee brieven openen en inklappen →
//   met de lijst dicht ≤ 60 px hoog; lijst open = hoogte van de inhoud; aan de linkerrand 300 px omhoog slepen → hoogte gelijk, niets
//   uitgerekt (top+bottom), binnen beeld, niet onder de actiestapel of de bovenbalk; lijst open en weer dicht → terug op dezelfde plek;
//   herladen → zelfde natuurlijke hoogte, plek binnen beeld; terugslepen naar de standaardplek → weer standaard (geen data-geplaatst).
//   «+N» bij meer dan vier bijlagen is een getal (vroeger «+$84»): bron-test in tests/eenheid/mail-geminimaliseerd-20261025.test.ts.
// blok1-geminimaliseerd-bijlage (6.3): in elke dichtheid een bijlage aanwijzen en het wiel draaien → kaart en rij blijven even groot;
//   meteen na het aanwijzen (nog geen bruikbaar voorbeeld) of zonder zichtbaar voorbeeld (telefoon) blokkeert het wiel de lijst niet;
//   met het zwevende voorbeeld open maakt het wiel DAT groter («groot»); het voorbeeld ligt helemaal binnen beeld. Ook voor de
//   bijlagen van ingeklapte berichten in de brief (MailGesprekInhoud).
// Vroeger (stand dist-PL9): 52 → 352 px na slepen, ook na inklappen en herladen; kaart 64 → 304 px en lijst geblokkeerd.
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import type { Blok1Ctx, Blok1Stap } from './stand-blok1';
import { mailNep, mailNepUit, wachtOpLijst } from './stand-mail-nep';
import { lezerNep, zetZwevend } from './stand-lezer';

type Doos = { x: number; y: number; w: number; h: number };
type Viewer = Doos & { inhoud: number; lijst: boolean; geplaatst: boolean; inline: string; vw: number; vh: number; onder: number; bedekt: string[] };

/** De geminimaliseerde brief(ven) meten: rechthoek, hoogte van de inhoud (kinderen + padding + rand), lijst open, data-geplaatst, en wat
 *  hij bedekt van de actiestapel (gevulde gniezda) en de bovenbalk (foto, bel). */
const meetViewer = (page: Page) => page.evaluate((): Viewer | null => {
  const e = document.querySelector('.mail-minimized-viewer') as HTMLElement | null;
  if (!e) return null;
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  const kinderen = [...e.children].map((k) => k.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
  const boven = Math.min(...kinderen.map((b) => b.top)), onder = Math.max(...kinderen.map((b) => b.bottom));
  const px = (v: string) => parseFloat(v) || 0;
  // natuurlijke hoogte = inhoud + padding + rand, maar minstens de min-height van de CSS (52 px; telefoon 48 px)
  const rand = px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
  const inhoud = kinderen.length ? Math.max(onder - boven + rand, px(cs.minHeight) + (cs.boxSizing === 'border-box' ? 0 : rand)) : 0;
  const raakt = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const zichtbaar = (x: Element) => { const b = x.getBoundingClientRect(), c = getComputedStyle(x); return b.width > 0 && b.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' ? b : null; };
  const bedekt: string[] = [];
  for (const n of document.querySelectorAll('.plaats-actiestapel > .plaats-gniezdo:not(:empty), .canonical-account-anchor')) {
    const b = zichtbaar(n); if (b && raakt(r, b)) bedekt.push(`${n.classList[0]}${(n as HTMLElement).dataset.plaatsKnop ? `[${(n as HTMLElement).dataset.plaatsKnop}]` : ''}`);
  }
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), inhoud: Math.round(inhoud), lijst: !!e.querySelector('.mail-minimized-entry-list'),
    geplaatst: e.hasAttribute('data-geplaatst'), inline: e.getAttribute('style') || '', vw: innerWidth, vh: innerHeight, onder: Math.round(innerHeight - r.bottom), bedekt };
});

/** Herladen ZONDER de bewaarde toestand van de post (sessionStorage «tsv:mail-ui-context-v3:…»: ingeklapte brieven, hun plek, bijlage):
 *  de stand gebruikt één tabblad voor alle maten, dus anders begint 768 met de stapel en de plek van 390. De post schrijft die toestand
 *  bij «pagehide» opnieuw weg; een luisteraar in de vangfase op window gaat vóór en wist hem. */
async function herlaadSchoon(page: Page) {
  await page.evaluate(() => { addEventListener('pagehide', (e) => { e.stopImmediatePropagation(); for (const k of Object.keys(sessionStorage)) if (k.startsWith('tsv:mail-ui-context-')) sessionStorage.removeItem(k); }, { capture: true }); });
  await page.reload({ waitUntil: 'load' }); await wachtOpLijst(page);
}

/** Staat er (na het schoon herladen: «verder waar u was» van de server) nog een brief open, dan eerst dicht: Escape in de brief. */
async function sluitLezer(page: Page) {
  // «Назад» sluit de brief (telefoon, volledig); verliet dat de post, dan weer vooruit (zelfde aanpak als stand-lezer.ts)
  const terug = async () => { await page.goBack({ timeout: 6000 }).catch(() => undefined); await page.waitForTimeout(500); if (!/\/\/mail\./.test(page.url())) { await page.goForward({ timeout: 6000 }).catch(() => undefined); await wachtOpLijst(page).catch(() => undefined); } };
  for (let i = 0; i < 3; i++) {
    const open = await page.evaluate(() => { const b = document.querySelector('.google-mail-reader-backdrop:not(.reader-minimized)'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).display !== 'none'; });
    if (!open) return;
    if (i === 0) {
      await page.evaluate(() => { const a = document.querySelector('.google-mail-reader-backdrop:not(.reader-minimized) .google-mail-reader') as HTMLElement | null; if (a && !a.contains(document.activeElement)) { a.setAttribute('tabindex', a.getAttribute('tabindex') || '-1'); a.focus(); } });
      await page.keyboard.press('Escape');
    } else if (i === 1) {
      const sluit = page.locator('.google-mail-reader-backdrop:not(.reader-minimized) .google-mail-reader .mail-reader-close').first();
      if (await sluit.isVisible().catch(() => false)) await sluit.click({ timeout: 3000 }).catch(() => undefined); else await terug();
    } else await terug();
    await page.waitForTimeout(700);
  }
}

/** Een brief openen met een klik op een punt van de rij dat de brief opent (de doorzichtige knop .mail-row-open-hit of tekst van onderwerp/
 *  uittreksel), nooit op het oog «Попередній перегляд», de afzender, de foto, een bijlage of de knoppen: op de telefoon lag het punt van
 *  openRij (60 % van de breedte) bij agc-m1 op het oog en ging het voorbeeldvenster open i.p.v. de brief. */
async function openBrief(page: Page, id: string) {
  const rij = page.locator(`.google-mail-row[data-mail-message-id="${id}"]`).first();
  await rij.waitFor({ timeout: 15000 });
  await rij.evaluate((a) => a.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300);
  const punt = await page.evaluate((id) => {
    const r = document.querySelector(`.google-mail-row[data-mail-message-id="${id}"]`);
    if (!r) return null;
    const b = r.getBoundingClientRect();
    const nee = 'button:not(.mail-row-open-hit),a,input,label,select,textarea,[role=button],[role=menu],[role=menuitem],[data-row-eigen],.mail-row-avatar,.mail-avatar,img,.mail-row-actions,.mail-row-quick-actions,.mail-row-hover-actions,[class*="attachment"],.voorbeeld-knop,[data-mail-density-block="sender"],[data-mail-density-block="date"]';
    for (const fy of [0.5, 0.3, 0.7]) for (const fx of [0.5, 0.4, 0.62, 0.3, 0.75]) {
      const x = b.left + b.width * fx, y = b.top + b.height * fy, t = document.elementFromPoint(x, y);
      if (t && r.contains(t) && !t.closest(nee)) return { x, y };
    }
    return null;
  }, id);
  if (!punt) throw new Error(`geen klikpunt in rij ${id}`);
  await page.mouse.click(punt.x, punt.y);
  await page.locator('.google-mail-reader-backdrop:not(.reader-minimized) .google-mail-reader:not(.content-loading)').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(700);
}

/** Muis naar een rustig punt (midden-rechts): de muis bleef na de vorige maat op de linkerrand staan (slepen op 390), en op 768 klapte dan
 *  het menu open met een scherm over de lijst. */
async function muisRust(page: Page) {
  const v = page.viewportSize() || { width: 1280, height: 800 };
  await page.mouse.move(Math.round(v.width * 0.72), Math.round(v.height * 0.5)); await page.waitForTimeout(500);
}

/** «Згорнути лист»: in de kop, of in een smal venster/op de telefoon via ⋮ of «Ще» onderaan (zelfde weg als mail-lezer-geminimaliseerd). */
async function minimaliseer(page: Page) {
  const kopMin = page.locator('.google-mail-reader .mail-reader-toolbar > .mail-reader-minimize').first();
  if (await kopMin.isVisible().catch(() => false)) await kopMin.click({ timeout: 5000 });
  else {
    const kopMeer = page.locator('.google-mail-reader details.google-mail-reader-more > summary').first();
    if (await kopMeer.isVisible().catch(() => false)) await kopMeer.click({ timeout: 5000 }); else await page.locator('.google-mail-reader .mail-reader-onderbalk [data-onderbalk-meer]').first().click({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.locator('.google-mail-reader .mail-reader-overflow-groep[data-groep="venster"] button:has-text("Згорнути")').first().click({ timeout: 5000 });
  }
  await page.waitForTimeout(700);
}

/** Aan de LINKERRAND (niet op een knop) slepen, zoals de eigenaar op 4edfead2. */
async function sleepRand(page: Page, dy: number) {
  const r = await page.locator('.mail-minimized-viewer').boundingBox();
  if (!r) throw new Error('geen geminimaliseerde brief om te slepen');
  const x = r.x + 3, y = r.y + Math.min(26, r.height / 2);
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + Math.sign(dy) * 40, { steps: 4 });
  await page.mouse.move(x, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}

/** De knop van de lijst (aantal + pijl) open/dicht. Ligt er iets over (vroeger: de lijst van een uitgerekt dok), dan is dat een defect
 *  en klikken we op de knop zelf (dispatchEvent), zodat de rest van de meting doorgaat. */
async function lijstKnop(page: Page, open: boolean, slecht: string[], naam: string) {
  const knop = page.locator('.mail-minimized-stack-toggle').first();
  if (!(await knop.count())) return;
  if (((await knop.getAttribute('aria-expanded')) === 'true') === open) return;
  const raak = await knop.evaluate((k) => { const b = k.getBoundingClientRect(), t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !t || k.contains(t) ? '' : `${t.tagName.toLowerCase()}.${String((t as HTMLElement).className || '').split(' ')[0]}`; });
  if (raak) { slecht.push(`${naam}: lijstknop bedekt door ${raak}`); await knop.dispatchEvent('click'); } else await knop.click({ timeout: 5000 });
  await page.waitForTimeout(500);
}

const dokStap = (ctx: Blok1Ctx) => async (page: Page) => {
  const w = page.viewportSize()?.width || 0, slecht: string[] = [], log: Record<string, unknown> = {};
  const knip = (n: number) => page.screenshot({ path: join(ctx.uit, `blok1-geminimaliseerd-dok-${w}-${n}.png`) }).catch(() => undefined);
  const meet = async (naam: string) => { const m = await meetViewer(page); log[naam] = m; if (!m) slecht.push(`${naam}: geen geminimaliseerde brief`); return m; };
  const dicht = (naam: string, m: Viewer | null) => { if (m && m.h > 60) slecht.push(`${naam}: ${m.h} px hoog met de lijst dicht (≤ 60)`); };
  const natuurlijk = (naam: string, m: Viewer | null) => { if (m && Math.abs(m.h - m.inhoud) > 3) slecht.push(`${naam}: uitgerekt — ${m.h} px hoog, inhoud ${m.inhoud} px`); };
  const inBeeld = (naam: string, m: Viewer | null) => {
    if (!m) return;
    if (m.x < -1 || m.y < -1 || m.x + m.w > m.vw + 1 || m.y + m.h > m.vh + 1) slecht.push(`${naam}: buiten beeld (${m.x},${m.y} ${m.w}×${m.h} in ${m.vw}×${m.vh})`);
    if (m.bedekt.length) slecht.push(`${naam}: ligt over ${m.bedekt.join(', ')}`);
  };
  try {
  /** Met de lijst open blijft het venster op zijn eigen plek zolang het past (alleen omhoog als de inhoud anders onder de rand valt). */
  const eigenPlek = (naam: string, m: Viewer | null, plek: Viewer | null) => { if (m && plek) { const verwacht = Math.max(8, Math.min(plek.y, m.vh - m.h - 8)); if (Math.abs(m.y - verwacht) > 2) slecht.push(`${naam}: niet op de eigen plek (top ${m.y}, verwacht ${verwacht})`); } };
  await muisRust(page);
  await wachtOpLijst(page);
  await zetZwevend(page, false);
  await herlaadSchoon(page); await sluitLezer(page); await muisRust(page);
  // 1. eerste brief ingeklapt
  await openBrief(page, 'agc-m0'); await minimaliseer(page);
  const m1 = await meet('1-een-brief'); dicht('1-een-brief', m1); natuurlijk('1-een-brief', m1); inBeeld('1-een-brief', m1);
  await knip(1);
  // 2. tweede brief ingeklapt: stapel van 2, de lijst staat open
  await openBrief(page, 'agc-m1'); await minimaliseer(page);
  await lijstKnop(page, true, slecht, '2-stapel-lijst-open');
  const m2 = await meet('2-stapel-lijst-open'); natuurlijk('2-stapel-lijst-open', m2); inBeeld('2-stapel-lijst-open', m2);
  if (m2 && !m2.lijst) slecht.push('2-stapel-lijst-open: geen lijst met de twee brieven');
  await knip(2);
  // 3. lijst dicht
  await lijstKnop(page, false, slecht, '3-stapel-lijst-dicht');
  const m3 = await meet('3-stapel-lijst-dicht'); dicht('3-stapel-lijst-dicht', m3); natuurlijk('3-stapel-lijst-dicht', m3); inBeeld('3-stapel-lijst-dicht', m3);
  // 4. aan de rand 300 px omhoog slepen: verplaatst, nooit uitgerekt
  await sleepRand(page, -300);
  const m4 = await meet('4-na-slepen'); dicht('4-na-slepen', m4); natuurlijk('4-na-slepen', m4); inBeeld('4-na-slepen', m4);
  if (m3 && m4) {
    if (Math.abs(m4.h - m3.h) > 1) slecht.push(`4-na-slepen: hoogte ${m3.h} → ${m4.h} px`);
    const verwacht = Math.max(8, m3.y - 300);
    if (Math.abs(m4.y - verwacht) > 30) slecht.push(`4-na-slepen: niet verplaatst (top ${m3.y} → ${m4.y}, verwacht ≈ ${verwacht})`);
    if (!m4.geplaatst) slecht.push('4-na-slepen: geen data-geplaatst na zelf neerzetten');
  }
  await knip(3);
  // 5. lijst open (inhoud, binnen beeld) en weer dicht (zelfde plek)
  await lijstKnop(page, true, slecht, '5-geplaatst-lijst-open');
  const m5 = await meet('5-geplaatst-lijst-open'); natuurlijk('5-geplaatst-lijst-open', m5); inBeeld('5-geplaatst-lijst-open', m5); eigenPlek('5-geplaatst-lijst-open', m5, m4);
  await lijstKnop(page, false, slecht, '6-geplaatst-lijst-dicht');
  const m6 = await meet('6-geplaatst-lijst-dicht'); dicht('6-geplaatst-lijst-dicht', m6); natuurlijk('6-geplaatst-lijst-dicht', m6); inBeeld('6-geplaatst-lijst-dicht', m6);
  if (m4 && m6 && Math.abs(m6.y - m4.y) > 2) slecht.push(`6-geplaatst-lijst-dicht: niet terug op de eigen plek (top ${m4.y} → ${m6.y})`);
  // 6. herladen: plek uit sessionStorage, natuurlijke hoogte, binnen beeld
  await page.reload({ waitUntil: 'load' }); await wachtOpLijst(page); await page.waitForTimeout(900);
  const m7 = await meet('7-na-herladen'); natuurlijk('7-na-herladen', m7); inBeeld('7-na-herladen', m7); eigenPlek('7-na-herladen', m7, m4);
  await knip(4);
  await lijstKnop(page, false, slecht, '8-na-herladen-lijst-dicht');
  const m8 = await meet('8-na-herladen-lijst-dicht'); dicht('8-na-herladen-lijst-dicht', m8); natuurlijk('8-na-herladen-lijst-dicht', m8); inBeeld('8-na-herladen-lijst-dicht', m8);
  if (m4 && m8 && Math.abs(m8.y - m4.y) > 2) slecht.push(`8-na-herladen-lijst-dicht: andere plek na herladen (top ${m4.y} → ${m8.y})`);
  // 7. terug naar de standaardplek slepen → weer standaard (onderaan vast)
  if (m8 && m3) await sleepRand(page, m3.y - m8.y);
  const m9 = await meet('9-terug-standaard'); dicht('9-terug-standaard', m9); natuurlijk('9-terug-standaard', m9); inBeeld('9-terug-standaard', m9);
  if (m9 && m9.geplaatst) slecht.push('9-terug-standaard: data-geplaatst bleef staan op de standaardplek');
  if (m9 && m3 && Math.abs(m9.y - m3.y) > 2) slecht.push(`9-terug-standaard: niet op de standaardplek (top ${m3.y} → ${m9.y})`);
  await knip(5);
  } catch (e) { slecht.push(`stap afgebroken: ${String((e as Error).message || e).split('\n')[0].slice(0, 200)}`); }
  await muisRust(page).catch(() => undefined);
  ctx.meting('blok1-geminimaliseerd-dok', page, [...new Set(slecht)].join(' · '), JSON.stringify({ w, ...log }));
};

// ------------------------------------------------------------------------------------------------ bijlagen
type Meting = { kaart: Doos | null; rij: Doos | null; schuif: number; schuifMax: number; pop: (Doos & { groot: boolean; staat: string }) | null; wielen: Array<{ p: boolean }> };
/** Kaart (gemarkeerd met data-b1-doel), haar rij (lijst) of ingeklapt bericht (brief), het schuifvlak en het zwevende voorbeeld. */
const meetBijlage = (page: Page) => page.evaluate((): Meting => {
  const d = (e: Element | null): Doos | null => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } : null; };
  const kaart = document.querySelector('[data-b1-doel]');
  const rij = kaart?.closest('.google-mail-row, .mail-thread-message') || null;
  const host = document.querySelector('[data-b1-schuif]') as HTMLElement | null;
  const pop = [...document.querySelectorAll('.mail-attachment-hover-preview')].map((e) => ({ e, b: d(e) })).find((x) => x.b && getComputedStyle(x.e).display !== 'none');
  const w = window as unknown as { __b1wiel?: Array<{ p: boolean }> };
  return { kaart: d(kaart), rij: d(rij), schuif: host ? Math.round(host.scrollTop) : -1, schuifMax: host ? Math.round(host.scrollHeight - host.clientHeight) : 0,
    pop: pop && pop.b ? { ...pop.b, groot: pop.e.getAttribute('data-groot') === 'ja', staat: pop.e.getAttribute('data-preview-state') || '' } : null, wielen: w.__b1wiel || [] };
});

/** Bereidt de meting voor: wiel-logboek (wordt het wiel geblokkeerd? — passief, op window, dus na alle andere luisteraars), het
 *  schuifvlak markeren, het doel (n-de bijlage van het bericht) markeren. `false` als dat doel er niet is. */
const zetDoel = (page: Page, sel: string, n: number) => page.evaluate(({ sel, n }) => {
  const w = window as unknown as { __b1wiel?: Array<{ p: boolean }>; __b1wielAan?: boolean };
  if (!w.__b1wielAan) { w.__b1wielAan = true; addEventListener('wheel', (e) => { (w.__b1wiel ||= []).push({ p: e.defaultPrevented }); }, { passive: true }); }
  for (const x of document.querySelectorAll('[data-b1-doel]')) x.removeAttribute('data-b1-doel');
  const doelen = [...document.querySelectorAll(sel)].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 4 && b.height > 4 && getComputedStyle(e).visibility !== 'hidden'; });
  const doel = doelen[n];
  if (!doel) return false;
  doel.setAttribute('data-b1-doel', '');
  doel.closest('.google-mail-row, .mail-thread-message')?.scrollIntoView({ block: 'center' });
  let e: Element | null = doel.parentElement, host: Element | null = null;
  while (e) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 4) { host = e; break; } e = e.parentElement; }
  for (const x of document.querySelectorAll('[data-b1-schuif]')) x.removeAttribute('data-b1-schuif');
  (host || document.scrollingElement)?.setAttribute('data-b1-schuif', '');
  return true;
}, { sel, n });

const bijlageStap = (ctx: Blok1Ctx) => async (page: Page) => {
  const vp = page.viewportSize() || { width: 1280, height: 800 }, w = vp.width, telefoon = w <= 500, slecht: string[] = [], log: Record<string, unknown> = {};
  const midden = (b: Doos) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  /** Muis weg naar een punt buiten elk zwevend voorbeeld en elke bijlage (het grote voorbeeld staat bovenaan en is tot 640 px breed: een vast
   *  punt lag erin en hield het open, zodat het de volgende kaart bedekte); daarna is het voorbeeld dicht. */
  const weg = async () => {
    for (let i = 0; i < 3; i++) {
      const p = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight, nee = '.mail-attachment-hover-preview, .mail-attachment, .mail-minimized-viewer, .plaats-actiestapel, .canonical-sidebar, .canonical-account-anchor, button:not(.mail-row-open-hit), a, input';
        for (const fy of [0.55, 0.75, 0.35, 0.9]) for (const fx of [0.92, 0.85, 0.7, 0.55, 0.4]) {
          const x = Math.round(vw * fx), y = Math.round(vh * fy), t = document.elementFromPoint(x, y);
          if (t && !t.closest(nee)) return { x, y };
        }
        return { x: Math.round(vw * 0.92), y: Math.round(vh * 0.55) };
      });
      await page.mouse.move(p.x, p.y); await page.waitForTimeout(450);
      const open = await page.evaluate(() => [...document.querySelectorAll('.mail-attachment-hover-preview')].some((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0));
      if (!open) return;
    }
  };
  const zelfde = (a: Doos | null, b: Doos | null) => !a || !b || (Math.abs(a.w - b.w) <= 1 && Math.abs(a.h - b.h) <= 1);
  const binnen = (p: Doos) => p.x >= -1 && p.y >= -1 && p.x + p.w <= vp.width + 1 && p.y + p.h <= vp.height + 1;
  /** Eén bijlage: (a) meteen na het aanwijzen het wiel; (b) aanwijzen, wachten (voorbeeld open), het wiel. */
  const proef = async (naam: string, sel: string, n: number, verwachtVoorbeeld: boolean) => {
    await weg();
    if (!(await zetDoel(page, sel, n))) return false;
    await page.waitForTimeout(300);
    const voor = await meetBijlage(page);
    if (!voor.kaart) return false;
    // (a) meteen: geen bruikbaar voorbeeld → het wiel is voor de lijst
    await page.mouse.move(midden(voor.kaart).x, midden(voor.kaart).y);
    await page.mouse.wheel(0, 120); await page.waitForTimeout(500);
    const snel = await meetBijlage(page);
    const pSnel = snel.wielen.slice(voor.wielen.length);
    if (pSnel.some((x) => x.p)) slecht.push(`${naam}: wiel meteen na aanwijzen geblokkeerd (lijst scrolt niet)`);
    if (!zelfde(voor.kaart, snel.kaart)) slecht.push(`${naam}: kaart ${voor.kaart.w}×${voor.kaart.h} → ${snel.kaart?.w}×${snel.kaart?.h} na wiel`);
    if (!zelfde(voor.rij, snel.rij)) slecht.push(`${naam}: rij ${voor.rij?.h} → ${snel.rij?.h} px hoog na wiel`);
    // (b) aanwijzen en wachten: kaart en rij blijven; met een zichtbaar voorbeeld maakt het wiel DAT groter
    await weg();
    await zetDoel(page, sel, n); await page.waitForTimeout(300);
    const voor2 = await meetBijlage(page);
    if (!voor2.kaart) return false;
    await page.mouse.move(midden(voor2.kaart).x, midden(voor2.kaart).y);
    await page.waitForTimeout(1100);
    const aan = await meetBijlage(page);
    if (!zelfde(voor2.kaart, aan.kaart)) slecht.push(`${naam}: kaart groeit bij aanwijzen (${voor2.kaart.h} → ${aan.kaart?.h} px)`);
    if (!zelfde(voor2.rij, aan.rij)) slecht.push(`${naam}: rij groeit bij aanwijzen (${voor2.rij?.h} → ${aan.rij?.h} px)`);
    if (verwachtVoorbeeld && !telefoon && !aan.pop) slecht.push(`${naam}: geen zwevend voorbeeld bij aanwijzen`);
    if (aan.pop && !binnen(aan.pop)) slecht.push(`${naam}: voorbeeld buiten beeld (${aan.pop.x},${aan.pop.y} ${aan.pop.w}×${aan.pop.h})`);
    await page.mouse.wheel(0, 120); await page.waitForTimeout(750);
    const wiel = await meetBijlage(page);
    const pWiel = wiel.wielen.slice(aan.wielen.length);
    if (!zelfde(aan.kaart, wiel.kaart)) slecht.push(`${naam}: kaart ${aan.kaart?.w}×${aan.kaart?.h} → ${wiel.kaart?.w}×${wiel.kaart?.h} na wiel`);
    if (!zelfde(aan.rij, wiel.rij)) slecht.push(`${naam}: rij ${aan.rij?.h} → ${wiel.rij?.h} px hoog na wiel`);
    if (aan.pop && aan.pop.staat !== 'metadata') {
      if (!wiel.pop || !wiel.pop.groot || wiel.pop.w < aan.pop.w + 40) slecht.push(`${naam}: wiel maakt het zwevende voorbeeld niet groter (${aan.pop.w}×${aan.pop.h} → ${wiel.pop ? `${wiel.pop.w}×${wiel.pop.h}${wiel.pop.groot ? ' groot' : ''}` : 'weg'})`);
    } else if (pWiel.some((x) => x.p)) slecht.push(`${naam}: wiel geblokkeerd zonder zichtbaar voorbeeld (lijst scrolt niet)`);
    if (wiel.pop && !binnen(wiel.pop)) slecht.push(`${naam}: groot voorbeeld buiten beeld (${wiel.pop.x},${wiel.pop.y} ${wiel.pop.w}×${wiel.pop.h})`);
    await page.screenshot({ path: join(ctx.uit, `blok1-geminimaliseerd-bijlage-${naam}-${w}.png`) }).catch(() => undefined);
    log[naam] = { voor, snel: { ...snel, wielen: pSnel }, voor2: { kaart: voor2.kaart, rij: voor2.rij }, aan: { ...aan, wielen: undefined }, wiel: { ...wiel, wielen: pWiel } };
    await weg();
    return true;
  };
  try {
  await muisRust(page);
  for (const d of ['minimum', 'normal', 'detailed', 'bulky'] as const) {
    // ook de routes van de brief (lezerNep): opent «verder waar u was» een brief, dan zonder 409 van de echte server; de dichtheid als laatste (wint)
    await mailNepUit(page); await lezerNep(page, 'volledig'); await mailNep(page, { dichtheid: d });
    await herlaadSchoon(page); await sluitLezer(page);
    await page.locator('.google-mail-row[data-mail-message-id="agc-m0"] :is(.mail-attachment, .mail-minimum-paperclip)').first().waitFor({ timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const rij = '.google-mail-row[data-mail-message-id="agc-m0"]';
    const kaarten = `${rij} .mail-attachment`;
    const heeftKaart = await page.locator(kaarten).count();
    let n = 0;
    if (heeftKaart) { for (let i = 0; i < 2; i++) if (await proef(`${d}-${i}`, kaarten, i, true)) n++; }
    if (!n && await proef(`${d}-paperclip`, `${rij} .mail-minimum-paperclip`, 0, false)) n++;
    if (!n) slecht.push(`${d}: geen bijlage gevonden in agc-m0`);
  }
  // ingeklapte berichten in de brief (MailGesprekInhoud): zelfde gedrag
  await mailNepUit(page); await lezerNep(page, 'volledig');
  await herlaadSchoon(page); await zetZwevend(page, false); await sluitLezer(page);
  await openBrief(page, 'agc-m0');
  // de oudere brieven staan eerst samen in «2 попередні листи»: openen → ingeklapte berichten met hun bijlagen
  const eerder = page.locator('.google-mail-reader .mail-thread-eerdere').first();
  if (await eerder.isVisible().catch(() => false)) { await eerder.click({ timeout: 5000 }); await page.waitForTimeout(600); }
  await page.locator('.mail-thread-collapsed-attachments .mail-attachment').first().waitFor({ timeout: 8000 }).catch(() => undefined);
  if (!(await proef('brief-ingeklapt', '.mail-thread-collapsed-attachments .mail-attachment', 0, true))) slecht.push('brief: geen bijlage van een ingeklapt bericht gevonden');
  } catch (e) { slecht.push(`stap afgebroken: ${String((e as Error).message || e).split('\n')[0].slice(0, 200)}`); }
  await weg().catch(() => undefined);
  ctx.meting('blok1-geminimaliseerd-bijlage', page, [...new Set(slecht)].join(' · '), JSON.stringify({ w, ...log }));
};

export const geminimaliseerdStappen = (ctx: Blok1Ctx): Blok1Stap[] => [
  { naam: 'blok1-geminimaliseerd-dok', url: `${ctx.H('mail')}/postvak-in`, voor: (p) => lezerNep(p, 'volledig'), na: dokStap(ctx) },
  { naam: 'blok1-geminimaliseerd-bijlage', url: `${ctx.H('mail')}/postvak-in`, voor: (p) => lezerNep(p, 'volledig'), na: bijlageStap(ctx) },
];
