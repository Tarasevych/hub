// Blok 1 (25.10.2026): stappen van het team «vensters» — zie stand-blok1.ts. Namen: «blok1-vensters…».
//
// 2.5 «Дзвоник перекриває кнопки вікна»: in een geopende brief lag de bel met «99+» over «Зменшити вікно»/«Закрити» (schermafdruk van de
// eigenaar). Oorzaak: de kop van het venster hield een VASTE reserve vrij (4.75rem, voor de foto alleen), terwijl de bovenbalk sinds de
// zwevende knoppen ook de bel (en wat de gebruiker er nog neerzet) draagt. Het venster ligt in .canonical-workspace (z-index 1) en kan dus
// nooit boven de zone komen: de zone moet RUIMTE krijgen (besluit: reserveren, niet verbergen).
//
// Stap «blok1-vensters» — per maat (telefoon / tablet / computer) en per plaats van de bel:
//   standaard   computer/tablet: bovenbalk rechts van de foto; telefoon: kop van het menu (niet op de pagina);
//   voor-foto   computer/tablet: bovenbalk vóór de foto (zoals de eigenaar hem had);
//   bovenbalk   telefoon: de bel in de bovenbalk van de pagina;
//   stapel      de bel in de actiestapel rechtsonder;
//   vol         de bel én «Написати» in de bovenbalk (de breedste zone die de gebruiker kan maken);
//   groot       standaardplaats met grotere letters (lettergrootte van de pagina 20 px, WCAG 1.4.4): de gniezda zijn 2.875rem — de zone
//               wordt breder én hoger, dus ook vensters ONDER de balk (rechts, zwevend, bijlage) moeten de gemeten maat volgen;
// en per venster: het leesvenster in elke vorm (volledig, rechts, onder, zwevend; telefoon: telefoon), de bijlage-werkbank, «Новий лист»
// en een venster van het platform (voorbeeld van een brief, portaal in <body>): ELKE bediening van het venster (sluiten, minimaliseren,
// vergroten, vorm, ⋮, terug, de greep, …) én elke knop van de laag ([data-plaats-knop]) is in zijn midden zelf het bovenste element
// (elementFromPoint), en geen bediening ligt (deels) onder een knop van de laag (rechthoeken, de teller «99+» meegeteld). Bediening IN het
// venster (inhoud) mag zoals bij elke zwevende knop rechtsonder even onder de stapel liggen, maar moet er onderuit te scrollen zijn. Licht én donker.
// De ingeklapte brieven (.mail-minimized-viewer, ander team) worden alleen gemeten: aparte meting «blok1-vensters-ingeklapt».
// Knipsels: <uit>/blok1-vensters-<plaats>-<venster>-<breedte>.png (bovenrand; bij «stapel» ook de hoek rechtsonder).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Blok1Ctx, Blok1Stap } from './stand-blok1';
import { lezerNep, openRij } from './stand-lezer';
import { wachtOpLijst } from './stand-mail-nep';

type Page = import('playwright-core').Page;
type Klasse = 'telefoon' | 'tablet' | 'computer';
type Plaats = 'standaard' | 'voor-foto' | 'bovenbalk' | 'stapel' | 'vol' | 'groot';
type Vorm = 'volledig' | 'rechts' | 'onder' | 'zwevend' | 'telefoon';
type Soort = 'lezer' | 'bijlage' | 'opstellen' | 'platform' | 'ingeklapt';
type Doos = { x: number; y: number; w: number; h: number };
type Raak = { naam: string; waar: string; doos: Doos; raak: string; over: string[]; onderVenster?: boolean };
type VensterMeting = { soort: Soort; open: boolean; venster: Doos | null; z: string; ouder: string; knoppen: Raak[]; drijvers: Raak[]; zone: Doos | null; stapel: Doos | null; reserve: string; modus: string; inhoud: string[]; onbereikbaar: string[]; kopRechts: string };

const BEL = "[data-qa-id='canonical-notification-bell']", FAB = '[data-mail-compose-float]';
const MENU = ".canonical-sidebar .canonical-menu-toggle[data-sidebar-action='open-drawer']";
const klasseVan = (w: number): Klasse => (w <= 700 ? 'telefoon' : w <= 1099 ? 'tablet' : 'computer');
const plaatsenVoor = (k: Klasse): Plaats[] => (k === 'telefoon' ? ['standaard', 'bovenbalk', 'stapel', 'vol', 'groot'] : ['standaard', 'voor-foto', 'stapel', 'vol', 'groot']);
const vormenVoor = (k: Klasse, p: Plaats): Vorm[] => (k === 'telefoon' ? ['telefoon'] : p === 'vol' ? ['volledig', 'rechts'] : p === 'groot' ? ['volledig', 'rechts', 'zwevend'] : ['volledig', 'rechts', 'onder', 'zwevend']);
/** Lettergrootte van de pagina per plaats (0 = die van de site). */
const tekstVoor = (p: Plaats) => (p === 'groot' ? 20 : 0);

/** Meet één venster in de pagina: bediening van het venster tegen de knoppen van de laag, en de knoppen van de laag zelf. */
const meet = (p: Page, soort: Soort) => p.evaluate((soort): VensterMeting => {
  const SOORTEN: Record<string, { venster: string; stroken: string[] }> = {
    lezer: { venster: '.google-mail-reader-backdrop:not(.reader-minimized) .google-mail-reader', stroken: [':scope > header', '.mail-reader-onderbalk'] },
    bijlage: { venster: '.google-mail-attachment-preview', stroken: [':scope > header'] },
    opstellen: { venster: '.mail-new-message', stroken: [':scope > header', ':scope > footer'] },
    platform: { venster: '.venster[data-venster]:not([hidden])', stroken: ['.venster-kop'] },
    ingeklapt: { venster: '.mail-minimized-viewer', stroken: [':scope'] },
  };
  const BEDIENING = 'button, summary, a[href], [role="button"], [role="group"][tabindex="0"]';
  const s = SOORTEN[soort];
  const doos = (r: DOMRect) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  const zichtbaar = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    const z = e as Element & { checkVisibility?: (o?: Record<string, boolean>) => boolean };
    if (z.checkVisibility && !z.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true })) return false;
    return !e.closest('[data-kop-verborgen="true"], [hidden], [inert]');
  };
  const naam = (e: Element) => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 48);
  const klasse = (e: Element) => String(e.getAttribute('class') || '').split(' ').filter(Boolean)[0] || '';
  const besch = (t: Element) => {
    const laag = t.closest('.canonical-account-anchor') ? ' [bovenbalk]' : t.closest('.plaats-actiestapel') ? ' [stapel]' : t.closest('.plaats-lade-kop') ? ' [lade-kop]' : '';
    return `${t.tagName.toLowerCase()}${klasse(t) ? `.${klasse(t)}` : ''}${laag}`;
  };
  const raak = (e: Element) => {
    const r = e.getBoundingClientRect();
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const t = document.elementFromPoint(x, y);
    if (!t) return 'niets';
    return t === e || e.contains(t) ? 'zelf' : besch(t);
  };
  const snijdt = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  // ligt de knop van de laag in de overlap echt BOVEN de bediening (midden van de overlap)? Een venster van de gezamenlijke laag (z ≥ 100000)
  // ligt zelf boven de zone: daar telt de rechthoek niet, wel wat je ziet en raakt
  const bovenop = (d: Element, a: DOMRect, b: DOMRect) => {
    const t = document.elementFromPoint((Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2, (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2);
    return !!t && (t === d || d.contains(t));
  };
  // de knoppen van de laag: bewoners en gniezda van de bovenbalk (met de teller «99+»), de gniezda van de stapel
  const drijfEls = [...document.querySelectorAll('.canonical-account-anchor :is(button, a[href], [role="button"], small), .plaats-actiestapel > .plaats-gniezdo > *, .plaats-actiestapel > .plaats-gniezdo small')].filter(zichtbaar);
  const venster = document.querySelector(s.venster);
  const open = !!venster && zichtbaar(venster);
  const knopEls: Element[] = [];
  if (venster && open) for (const sel of s.stroken) for (const strook of sel === ':scope' ? [venster] : [...venster.querySelectorAll(sel)]) for (const k of strook.querySelectorAll(BEDIENING)) if (zichtbaar(k) && !knopEls.includes(k)) knopEls.push(k);
  const knoppen = knopEls.map((k) => {
    const r = k.getBoundingClientRect();
    return { naam: naam(k), waar: besch(k), doos: doos(r), raak: raak(k), over: drijfEls.filter((d) => !k.contains(d) && !d.contains(k) && snijdt(r, d.getBoundingClientRect()) && bovenop(d, r, d.getBoundingClientRect())).map((d) => `${naam(d)} (${besch(d)})`) };
  });
  const drijvers = [...document.querySelectorAll('.plaats-gniezdo[data-plaats-knop]')].map((g) => ({ g, k: g.firstElementChild })).filter((x): x is { g: Element; k: Element } => !!x.k && zichtbaar(x.k))
    .map(({ g, k }) => {
      const r = k.getBoundingClientRect(), t = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
      // onder een venster van de gezamenlijke laag (<body>, z ≥ 100000: modaal of door de gebruiker erover gezet) — geen fout van de zone
      const onderVenster = !!t && !k.contains(t) && !!t.closest('.venster, .venster-achter, .mail-new-message-backdrop');
      return { naam: `${(g as HTMLElement).dataset.plaatsKnop}: ${naam(k)}`, waar: besch(g), doos: doos(r), raak: raak(k), over: [] as string[], onderVenster };
    });
  const rr = (sel: string) => { const e = document.querySelector(sel); return e && zichtbaar(e) ? doos(e.getBoundingClientRect()) : null; };
  // bediening IN het venster (niet de kop) waarvan het midden nu onder een knop van de laag ligt — zoals bij elke zwevende knop rechtsonder
  // (ter info); een fout is het pas als ze er ook niet onderuit te scrollen is (naar het einde van haar schuifvak: daar houdt de brief
  // zoveel lucht als de stapel hoog is)
  const onderLaag = (k: Element) => { const r = k.getBoundingClientRect(), t = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); return t && !k.contains(t) && t.closest('.canonical-account-anchor, .plaats-actiestapel') ? t : null; };
  const schuifvak = (k: Element) => { for (let e = k.parentElement; e && e !== venster?.parentElement; e = e.parentElement) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) return e; } return null; };
  const inhoud: string[] = [], onbereikbaar: string[] = [];
  if (venster && open) for (const k of [...venster.querySelectorAll(BEDIENING)].filter((x) => !knopEls.includes(x) && zichtbaar(x))) {
    const t = onderLaag(k); if (!t) continue;
    inhoud.push(`«${naam(k)}»→${besch(t)}`);
    const vak = schuifvak(k), was = vak ? vak.scrollTop : 0;
    let vrij = false;
    if (vak) { for (const y of [vak.scrollHeight, 0]) { vak.scrollTop = y; if (!onderLaag(k)) { vrij = true; break; } } vak.scrollTop = was; }
    if (!vrij) onbereikbaar.push(`«${naam(k)}»→${besch(t)}`);
  }
  // de laag waarin het venster ligt: platform = .venster, «Новий лист» = zijn achtergrond in de vensterstapel
  const vEl = venster?.closest('.venster, .mail-new-message-backdrop') || venster;
  return {
    soort: soort as VensterMeting['soort'], open, venster: venster && open ? doos(venster.getBoundingClientRect()) : null,
    z: vEl ? getComputedStyle(vEl).zIndex : '', ouder: vEl?.parentElement ? besch(vEl.parentElement) : '', knoppen, drijvers,
    zone: rr('.canonical-account-anchor'), stapel: rr('.plaats-actiestapel'),
    reserve: getComputedStyle(document.documentElement).getPropertyValue('--plaats-boven-reserve').trim(),
    modus: document.querySelector('.google-mail-reader-backdrop')?.getAttribute('data-lees-modus') || '', inhoud, onbereikbaar,
    kopRechts: (() => { const kop = venster && s.stroken[0] !== ':scope' ? venster.querySelector(s.stroken[0]) : null; return kop ? getComputedStyle(kop).paddingRight : ''; })(),
  };
}, soort);

/** Wat er mis is aan één meting (leeg = in orde). */
function gebreken(m: VensterMeting, wat: string): string[] {
  const uit: string[] = [];
  if (!m.open) { uit.push(`${wat}: venster niet open`); return uit; }
  if (!m.knoppen.length) uit.push(`${wat}: geen bediening gevonden`);
  for (const k of m.knoppen) {
    if (k.raak !== 'zelf') uit.push(`${wat}: «${k.naam}»→${k.raak}`);
    else if (k.over.length) uit.push(`${wat}: «${k.naam}» deels onder ${k.over.join(' + ')}`);
  }
  for (const d of m.drijvers) if (d.raak !== 'zelf' && !d.onderVenster) uit.push(`${wat}: knop ${d.naam} bedekt door ${d.raak}`);
  for (const k of m.onbereikbaar) uit.push(`${wat}: ${k} — ook na scrollen nog onder de laag`);
  if (m.soort === 'platform' || m.soort === 'opstellen') {
    if (!(Number(m.z) >= 100000)) uit.push(`${wat}: z-index ${m.z || '-'} (verwacht ≥ 100000, de laag van de vensters)`);
    if (!/^body\b/.test(m.ouder) && m.soort === 'platform') uit.push(`${wat}: niet in <body> (${m.ouder})`);
  }
  return uit;
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
/** Alles wat nog open staat dicht (de post zet een open brief/bijlage na herladen terug — sessionStorage): nieuw bericht, venster van
 *  het platform, bijlage, brief, ingeklapte brieven. */
async function allesDicht(p: Page) {
  for (let i = 0; i < 4; i++) {
    const kandidaten = ['.mail-new-message [data-nm-sluit]', ".venster [data-venster-knop='sluit']", '.google-mail-attachment-preview > header button:has-text("Закрити")',
      '.google-mail-reader .mail-reader-close', '.google-mail-reader .mail-reader-back', ".mail-minimized-viewer .mail-minimized-actions button[aria-label='Закрити перегляд']"];
    let iets = false;
    for (const sel of kandidaten) {
      const l = p.locator(sel).first();
      // opruimen, geen meting: klikken via het element zelf (een bedekte knop — precies wat deze stap meet — mag het opruimen niet tegenhouden)
      if (await l.isVisible().catch(() => false)) { await l.evaluate((e) => (e as HTMLElement).click()).catch(() => undefined); await p.waitForTimeout(400); iets = true; break; }
    }
    if (!iets) return;
  }
}
/** De vorm van het leesvenster: weergavevoorkeur (readingPane) en «Зменшити вікно» (localStorage), dan herladen; `tekst` = lettergrootte
 *  van de pagina in px (na het herladen, zoals een gebruiker met grotere letters). */
async function zetVorm(p: Page, vorm: Vorm, tekst = 0) {
  const pane = vorm === 'rechts' ? 'right' : vorm === 'onder' ? 'below' : 'none';
  await p.unroute('**/api/owner/mail/view-preferences/load').catch(() => undefined);
  await p.route('**/api/owner/mail/view-preferences/load', (r) => r.fulfill(json({ ok: true, preferences: { readingPane: pane, threadGrouping: true, mobileOverrides: {}, senderRules: [{ email: 'lotte.vermeulen@immo-voorbeeld.example', color: '#4a86e8' }] } })));
  // zelfde vorm als stand-lezer.zetZwevend, zodat de stappen mail-lezer-* daarna niets anders aantreffen
  await p.evaluate((aan) => { try { localStorage.setItem('mail-reader-venster-v1', JSON.stringify({ zwevend: aan, x: Math.max(80, innerWidth - 820), y: 64, w: 760, h: Math.min(760, innerHeight - 90) })); } catch { /* geen opslag */ } }, vorm === 'zwevend');
  await p.reload({ waitUntil: 'load' });
  await wachtOpLijst(p);
  if (tekst) { await p.evaluate((px) => { document.documentElement.style.fontSize = `${px}px`; }, tekst); await p.waitForTimeout(500); }
  await allesDicht(p);
  await p.mouse.move(Math.round((p.viewportSize()?.width || 1280) * 0.62), Math.round((p.viewportSize()?.height || 800) * 0.55));
}

/** «Перемістити до…» van een knop openen (Shift+F10 op de knop — dezelfde weg als het toetsenbord in stand-plaatsing). */
async function plaatsMenu(p: Page, knop: string) {
  const l = p.locator(knop).first();
  if (!(await l.isVisible().catch(() => false))) return false;
  await l.focus().catch(() => undefined);
  await p.keyboard.press('Shift+F10'); await p.waitForTimeout(350);
  return (await p.locator('.plaats-acties').count()) > 0;
}
const ladeOpen = async (p: Page) => { if (!(await p.locator('.canonical-chrome.sidebar-drawer').count())) { await p.locator(MENU).first().click({ timeout: 5000 }).catch(() => undefined); await p.waitForTimeout(500); } };
const ladeDicht = async (p: Page) => { if (await p.locator('.canonical-chrome.sidebar-drawer').count()) { await p.locator('.canonical-drawer-close').first().click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(400); } };
/** Bel (telefoon: in de lade) of «Написати» — wat er zichtbaar is — en «Скинути всі кнопки до типового». */
async function allesTerug(p: Page, k: Klasse) {
  for (const knop of [BEL, FAB]) {
    if (k === 'telefoon' && knop === BEL && !(await p.locator(BEL).first().isVisible().catch(() => false))) await ladeOpen(p);
    if (!(await plaatsMenu(p, knop))) continue;
    const terug = p.locator('.plaats-acties [data-plaats-alles-terug]').first();
    if (await terug.count()) { await terug.click({ timeout: 3000 }); await p.waitForTimeout(700); } else await p.keyboard.press('Escape');
    break;
  }
  await p.keyboard.press('Escape').catch(() => undefined);
  await ladeDicht(p);
}
/** Kies in het open menu een zone (en eventueel een stap naar links); true als het menu het deed. */
async function naarZone(p: Page, zone: string) {
  const b = p.locator(`.plaats-acties [data-plaats-naar='${zone}']`).first();
  if (!(await b.count())) return false;
  if (await b.getAttribute('aria-current') === 'true') { await p.keyboard.press('Escape'); return true; }
  await b.click({ timeout: 3000 }); await p.waitForTimeout(500);
  return true;
}
/** Waar de laag de bel nu tekent: zone en positie (voor het verslag). */
const belPlek = (p: Page) => p.evaluate(() => {
  const g = document.querySelector('.plaats-gniezdo[data-plaats-knop="bel"]'), z = g?.closest('[data-plaats-zone]') as HTMLElement | null;
  if (!g || !z) return 'nergens op de pagina';
  const items = [...z.children].filter((c) => (c as HTMLElement).offsetWidth > 0).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left || a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  return `${z.dataset.plaatsZone} [${items.map((c) => (c as HTMLElement).dataset.plaatsKnop || (c.classList.contains('canonical-account-menu') ? 'foto' : c.matches('.zk-trigger,.zk-trigger-mobiel') ? 'zoeken' : c.tagName.toLowerCase())).join(' · ')}]`;
});

async function zetPlaats(p: Page, k: Klasse, plaats: Plaats): Promise<string> {
  await allesTerug(p, k);
  if (plaats !== 'standaard' && plaats !== 'groot') {
    if (k === 'telefoon') await ladeOpen(p);
    if (await plaatsMenu(p, BEL)) {
      await naarZone(p, plaats === 'stapel' ? 'actiestapel' : 'bovenbalk');
      if (plaats === 'voor-foto' || (plaats === 'vol' && k !== 'telefoon')) {
        await ladeDicht(p);
        if (await plaatsMenu(p, BEL)) { const l = p.locator(".plaats-acties [data-plaats-schuif='links']").first(); if (await l.count() && await l.isEnabled()) { await l.click({ timeout: 3000 }); await p.waitForTimeout(500); } await p.keyboard.press('Escape'); }
      }
    }
    await p.keyboard.press('Escape').catch(() => undefined);
    await ladeDicht(p);
    if (plaats === 'vol' && (await plaatsMenu(p, FAB))) { await naarZone(p, 'bovenbalk'); await p.keyboard.press('Escape').catch(() => undefined); }
  }
  await p.waitForTimeout(900); // zijbalkvoorkeur gaat gebundeld (350 ms) naar de server
  return belPlek(p);
}

/** Leesvenster in vorm `vorm` openen. */
async function openLezer(p: Page, vorm: Vorm, tekst = 0) {
  await zetVorm(p, vorm, tekst);
  await openRij(p, 'agc-m0');
  await p.waitForTimeout(500);
}
/** Bijlage-werkbank: vanuit de open brief (kaart van de bijlage), anders vanuit de lijst. */
async function openBijlage(p: Page, tekst = 0) {
  await openLezer(p, 'volledig', tekst);
  const kaart = p.locator('.google-mail-reader .mail-attachment-card').first();
  if (await kaart.count()) {
    await kaart.scrollIntoViewIfNeeded().catch(() => undefined);
    const knop = kaart.locator('button').first();
    await ((await knop.count()) ? knop : kaart).click({ timeout: 5000 }).catch(() => undefined);
  }
  if (!(await p.locator('.google-mail-attachment-preview').first().waitFor({ timeout: 6000 }).then(() => true).catch(() => false))) {
    await p.keyboard.press('Escape').catch(() => undefined); await p.waitForTimeout(400);
    await p.locator('.google-mail-row .mail-attachment-preview-card, .google-mail-row [data-mail-attachment-chip], .google-mail-row .mail-attachment').first().click({ timeout: 5000 }).catch(() => undefined);
    await p.locator('.google-mail-attachment-preview').first().waitFor({ timeout: 6000 }).catch(() => undefined);
  }
  await p.waitForTimeout(900);
}
async function openOpstellen(p: Page) {
  await zetVorm(p, 'volledig');
  const fab = p.locator(FAB).first();
  if (await fab.isVisible().catch(() => false)) await fab.click({ timeout: 4000 }).catch(() => undefined);
  if (!(await p.locator('.mail-new-message').first().waitFor({ timeout: 2500 }).then(() => true).catch(() => false))) await p.evaluate(() => window.dispatchEvent(new Event('mail:open-compose')));
  await p.locator('.mail-new-message').first().waitFor({ timeout: 5000 }).catch(() => undefined);
  await p.waitForTimeout(700);
}
async function sluitOpstellen(p: Page) {
  await p.locator('.mail-new-message [data-nm-sluit]').first().click({ timeout: 3000 }).catch(() => undefined);
  await p.waitForTimeout(400);
  const vraag = p.locator('.mail-new-message [data-nm-wissen], .mail-nm-bevestig button').first();
  if (await vraag.count()) await vraag.click({ timeout: 2000 }).catch(() => undefined);
}
/** Een venster van het platform: «Попередній перегляд» (oogje) van een brief — <Venster> in <body>. */
async function openPlatform(p: Page) {
  await zetVorm(p, 'volledig');
  const rij = p.locator('.google-mail-row[data-mail-message-id="agc-m1"]').first();
  await rij.scrollIntoViewIfNeeded().catch(() => undefined);
  await rij.hover().catch(() => undefined); await p.waitForTimeout(400);
  const oog = rij.locator('.voorbeeld-knop').first();
  await oog.click({ timeout: 4000 }).catch(() => oog.click({ timeout: 3000, force: true }).catch(() => undefined));
  await p.locator('.venster[data-venster^="mail-voorbeeld-"]').first().waitFor({ timeout: 6000 }).catch(() => undefined);
  await p.waitForTimeout(800);
}

export const venstersStap = (c: Blok1Ctx) => async (p: Page) => {
  const v0 = p.viewportSize() || { width: 1280, height: 800 };
  const w = v0.width, k = klasseVan(w);
  const slecht: string[] = [], info: Record<string, unknown> = { maat: `${w}×${v0.height}`, klasse: k };
  const ingeklapt: string[] = [];
  const foto = async (naam: string, onder = false) => {
    await p.screenshot({ path: join(c.uit, `blok1-vensters-${naam}-${w}.png`), clip: { x: 0, y: 0, width: w, height: Math.min(v0.height, w <= 700 ? 120 : 150) } }).catch(() => undefined);
    if (onder) await p.screenshot({ path: join(c.uit, `blok1-vensters-${naam}-onder-${w}.png`), clip: { x: Math.max(0, w - 420), y: Math.max(0, v0.height - 300), width: Math.min(420, w), height: Math.min(300, v0.height) } }).catch(() => undefined);
  };
  /** Meet licht en donker (de maat verandert niet; de laag mag in donker niet anders liggen). */
  const tweeThemas = async (soort: Soort, wat: string, plaats: Plaats, naar: string[] = slecht) => {
    const licht = await meet(p, soort);
    await foto(`${plaats}-${wat}`, plaats === 'stapel');
    await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(300);
    const donker = await meet(p, soort);
    await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(200);
    const fouten = [...new Set([...gebreken(licht, `${plaats}/${wat}`), ...gebreken(donker, `${plaats}/${wat}/donker`)])];
    naar.push(...fouten);
    info[`${plaats}/${wat}`] = { licht, donkerFouten: gebreken(donker, 'donker'), fouten };
    c.zeg(`   blok1-vensters ${w} ${plaats}/${wat}: ${fouten.length ? fouten.slice(0, 4).join(' · ') : 'OK'} (zone ${JSON.stringify(licht.zone)}, reserve «${licht.reserve}», kop rechts ${licht.kopRechts || '-'}, venster ${JSON.stringify(licht.venster)})${licht.inhoud.length ? ` · info: inhoud onder de laag ${licht.inhoud.slice(0, 3).join(', ')}` : ''}`);
    return licht;
  };
  const poging = async (wat: string, f: () => Promise<void>) => { try { await f(); } catch (e) { slecht.push(`${wat}: stap mislukt (${String((e as Error).message || e).slice(0, 160)})`); await p.keyboard.press('Escape').catch(() => undefined); } };

  await wachtOpLijst(p);
  try {
    for (const plaats of plaatsenVoor(k)) {
      let plek = '';
      await poging(`${plaats}/plaatsen`, async () => { plek = await zetPlaats(p, k, plaats); });
      info[`${plaats}/plek`] = plek;
      c.zeg(`   blok1-vensters ${w} ${plaats}: bel → ${plek}`);
      const verwacht = plaats === 'standaard' || plaats === 'groot' ? (k === 'telefoon' ? /^nergens|^lade-kop/ : /^bovenbalk \[.*foto · bel/) : plaats === 'stapel' ? /^actiestapel/ : plaats === 'voor-foto' ? /^bovenbalk \[bel · foto/ : /^bovenbalk/;
      if (!verwacht.test(plek)) slecht.push(`${plaats}: de bel staat niet waar de stap hem zette (${plek})`);
      for (const vorm of vormenVoor(k, plaats)) await poging(`${plaats}/lezer-${vorm}`, async () => {
        await openLezer(p, vorm, tekstVoor(plaats));
        const m = await tweeThemas('lezer', `lezer-${vorm}`, plaats);
        if (m.modus !== vorm) slecht.push(`${plaats}/lezer-${vorm}: data-lees-modus ${m.modus || '-'}`);
        // ingeklapte brieven (ander team): alleen meten — één keer per plaats, vanuit «volledig»/«telefoon»
        if (vorm === 'volledig' || vorm === 'telefoon') {
          const kop = p.locator('.google-mail-reader .mail-reader-toolbar > .mail-reader-minimize').first();
          if (await kop.isVisible().catch(() => false)) await kop.click({ timeout: 4000 }).catch(() => undefined);
          else {
            const meer = p.locator('.google-mail-reader details.google-mail-reader-more > summary').first();
            if (await meer.isVisible().catch(() => false)) await meer.click({ timeout: 4000 }).catch(() => undefined); else await p.locator('.google-mail-reader .mail-reader-onderbalk [data-onderbalk-meer]').first().click({ timeout: 4000 }).catch(() => undefined);
            await p.waitForTimeout(300);
            await p.locator('.google-mail-reader .mail-reader-overflow-groep[data-groep="venster"] button:has-text("Згорнути")').first().click({ timeout: 4000 }).catch(() => undefined);
          }
          await p.waitForTimeout(700);
          if (await p.locator('.mail-minimized-viewer').count()) {
            await tweeThemas('ingeklapt', 'ingeklapt', plaats, ingeklapt);
            await p.locator('.mail-minimized-viewer .mail-minimized-actions button').last().click({ timeout: 3000 }).catch(() => undefined);
            await p.waitForTimeout(500);
          }
        }
        await allesDicht(p);
      });
      await poging(`${plaats}/bijlage`, async () => { await openBijlage(p, tekstVoor(plaats)); await tweeThemas('bijlage', 'bijlage', plaats); await allesDicht(p); });
      if (plaats !== 'voor-foto' && plaats !== 'groot') {
        await poging(`${plaats}/opstellen`, async () => { await openOpstellen(p); await tweeThemas('opstellen', 'opstellen', plaats); await sluitOpstellen(p); await allesDicht(p); });
        await poging(`${plaats}/platform`, async () => { await openPlatform(p); await tweeThemas('platform', 'platform', plaats); await allesDicht(p); });
      }
    }
  } finally {
    // de plaats terug naar de standaard (de keuze staat op de server: anders zien de volgende stappen hem)
    await zetVorm(p, 'volledig').catch(() => undefined);
    await allesTerug(p, k).catch(() => undefined);
    await p.waitForTimeout(800);
    info.naTerug = await belPlek(p).catch(() => '?');
    await p.mouse.move(Math.round(w * 0.6), Math.round(v0.height * 0.55)).catch(() => undefined);
  }
  writeFileSync(join(c.uit, `blok1-vensters-${w}.json`), JSON.stringify(info, null, 1));
  c.meting('blok1-vensters', p, [...new Set(slecht)].join(' · '), JSON.stringify({ maat: info.maat, klasse: k, fouten: [...new Set(slecht)].length, plekken: Object.fromEntries(Object.entries(info).filter(([x]) => x.endsWith('/plek'))) }));
  c.meting('blok1-vensters-ingeklapt', p, [...new Set(ingeklapt)].join(' · '), JSON.stringify({ maat: info.maat, gemeten: Object.keys(info).filter((x) => x.endsWith('/ingeklapt')) }));
};

export const venstersStappen = (ctx: Blok1Ctx): Blok1Stap[] => [
  { naam: 'blok1-vensters', url: `${ctx.H('mail')}/postvak-in`, voor: (p) => lezerNep(p, 'volledig'), na: venstersStap(ctx) },
];
