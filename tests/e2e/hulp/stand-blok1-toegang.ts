// Blok 1 (25.10.2026): stappen van het team «toegang» — zie stand-blok1.ts. Namen: «blok1-toegang-…».
//   blok1-toegang-stapop — venster «Підтвердіть доступ» boven de v2-toestemming (claude en gpt, «Дозволити») en boven #browser
//                          («Дозволити все» → «Так, дозволити все»), licht én donker: het label van het vinkje «Запам’ятати цей
//                          браузер» helemaal binnen het venster, het vinkje zelf niet opgerekt, geen horizontale overloop in
//                          .venster-inhoud, contrast van label en uitleg ≥ 4.5:1 — berekend uit de computed kleuren (opacity van
//                          het element en zijn voorouders meegeteld, halfdoorzichtige achtergronden samengesteld).
//   blok1-toegang-chips  — v2-toestemming, stap «Дозволи» (claude en gpt): elke chip binnen het venster (fout zat op 390 px);
//                          meteen ook een veegronde over alle stappen van beide toestemmingsvensters (v2 en het oude /mcp):
//                          niets steekt buiten het venster en geen vinkje/keuzerondje is opgerekt door een invoerregel.
//   blok1-toegang-gpt    — de pagina van ChatGPT (#agent/gpt): de nieuwe stappen (Settings → Apps → Advanced settings → Developer
//                          mode, «Create app», OAuth zonder client-id, app kiezen in het menu) en de waarschuwing over de plannen,
//                          in uk (en in nl bij STAND_NL=1).
// Waarom het venster hier «gevraagd» wordt: de stand meldt zich vers aan (auth_time = nu), dus de server vraagt de eerste 5 minuten
// geen step-up. De stap antwoordt daarom op ÉÉN klik («Дозволити» / «Так, дозволити все») zelf met 403 STEP_UP_REQUIRED; vanaf daar
// is alles echt: platform/client.ts opent het venster, de manieren komen van de server (/api/owner/access/stap-op/methoden).
// Daarna «Скасувати»: er wordt niets toegestaan en niets opgeslagen. De onderschepping wordt meteen weer weggehaald.
import type { Page, Route } from 'playwright-core';
import type { Blok1Ctx, Blok1Stap } from './stand-blok1';

type Kader = { l: number; r: number; t: number; b: number; w: number; h: number };
type StapOpMeting = {
  open: boolean; onthoud: string; venster: Kader | null; inhoud: { sw: number; cw: number } | null;
  label: Kader | null; span: Kader | null; vinkje: { w: number; h: number; font: string } | null;
  labelContrast: number | null; nootContrast: number | null; laag: string[]; buiten: string[]; html: string;
};

const STAP_OP_403 = { status: 403, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'STEP_UP_REQUIRED', reasonCode: 'STEP_UP_REQUIRED' }) };
const VENSTER = '.venster[data-venster="bevestig-toegang"]';
const TOESTEMMING = '.venster[data-venster="mcp-toestemming"]';

/** Taal van de huidige pagina: <html lang> (de app haalt ?lang=… na het laden uit de adresbalk); anders het adres zelf. */
const taalVan = async (p: Page): Promise<'uk' | 'nl'> => {
  const html = await p.evaluate(() => document.documentElement.lang).catch(() => '');
  if (html === 'nl' || html === 'uk') return html;
  try { return new URL(p.url()).searchParams.get('lang') === 'nl' ? 'nl' : 'uk'; } catch { return 'uk'; }
};
const metTaal = (url: string, lang: 'uk' | 'nl') => { const u = new URL(url); const hash = u.hash; u.hash = ''; u.searchParams.set('lang', lang); return `${u.toString()}${hash}`; };
const breedte = (p: Page) => p.viewportSize()?.width || 0;

/** Kleurmeting in de pagina (zelfde aanpak als onderzoek H): tekstkleur × opacity-keten over de samengestelde achtergrond. */
function contrastIn(): void {
  type K = { r: number; g: number; b: number; a: number };
  const parse = (s: string): K | null => { const m = /rgba?\(([^)]+)\)/.exec(s || ''); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const over = (top: K, bot: K): K => { const a = top.a + bot.a * (1 - top.a); if (!a) return { r: 0, g: 0, b: 0, a: 0 }; return { r: (top.r * top.a + bot.r * bot.a * (1 - top.a)) / a, g: (top.g * top.a + bot.g * bot.a * (1 - top.a)) / a, b: (top.b * top.a + bot.b * bot.a * (1 - top.a)) / a, a }; };
  const achter = (el: Element): K => { const lagen: K[] = []; for (let x: Element | null = el; x; x = x.parentElement) { const k = parse(getComputedStyle(x).backgroundColor); if (k && k.a > 0) lagen.push(k); if (k && k.a >= 1) break; } let r: K = { r: 255, g: 255, b: 255, a: 1 }; for (let i = lagen.length - 1; i >= 0; i--) r = over(lagen[i], r); return r; };
  const lin = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (k: K) => 0.2126 * lin(k.r) + 0.7152 * lin(k.g) + 0.0722 * lin(k.b);
  const ratio = (a: K, b: K) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  (window as unknown as { __b1Contrast: (el: Element) => number }).__b1Contrast = (el: Element) => {
    const k = parse(getComputedStyle(el).color); if (!k) return 0;
    let o = 1; for (let x: Element | null = el; x; x = x.parentElement) o *= Number(getComputedStyle(x).opacity);
    const bg = achter(el);
    return Math.round(ratio(over({ ...k, a: k.a * o }, bg), bg) * 100) / 100;
  };
}

/** Meet het venster «Підтвердіть доступ» zoals het nu op het scherm staat. */
const meetStapOp = async (p: Page): Promise<StapOpMeting> => {
  await p.evaluate(contrastIn);
  return p.evaluate(([sel]) => {
    const kader = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left * 10) / 10, r: Math.round(r.right * 10) / 10, t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
    const contrast = (window as unknown as { __b1Contrast: (el: Element) => number }).__b1Contrast;
    const v = document.querySelector(sel);
    const inh = v?.querySelector('.venster-inhoud') as HTMLElement | null;
    const lab = v?.querySelector('label.bevestig-toegang-onthoud') || null;
    const inp = lab?.querySelector('input') as HTMLInputElement | null;
    const span = lab?.querySelector('span') || null;
    const noot = v?.querySelector('[data-onthoud-uitleg]') || null;
    const vr = v?.getBoundingClientRect();
    const laag: string[] = [], buiten: string[] = [];
    if (v && vr) {
      const loop = document.createTreeWalker(v, NodeFilter.SHOW_TEXT); const gezien = new Set<Element>();
      for (let n = loop.nextNode(); n; n = loop.nextNode()) {
        const el = n.parentElement; if (!el || gezien.has(el) || !(n.textContent || '').trim()) continue; gezien.add(el);
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
        if (el.closest('button:disabled')) continue; // uitgeschakelde knoppen: WCAG 1.4.3 uitzondering
        const c = contrast(el); if (c < 4.5) laag.push(`${c}:1 «${(n.textContent || '').trim().slice(0, 50)}»`);
      }
      for (const el of v.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue; if (r.right > vr.right + 0.5 || r.left < vr.left - 0.5) buiten.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className || '').slice(0, 40)} [${Math.round(r.left)}–${Math.round(r.right)}] «${(el.textContent || '').trim().slice(0, 40)}»`); }
    }
    const ics = inp ? getComputedStyle(inp) : null;
    return {
      open: !!v, onthoud: v?.querySelector('[data-onthoud]')?.getAttribute('data-onthoud') || '', venster: kader(v), inhoud: inh ? { sw: inh.scrollWidth, cw: inh.clientWidth } : null,
      label: kader(lab), span: kader(span), vinkje: inp && ics ? { w: Math.round(inp.getBoundingClientRect().width), h: Math.round(inp.getBoundingClientRect().height), font: ics.fontFamily.slice(0, 30) } : null,
      labelContrast: span ? contrast(span) : null, nootContrast: noot ? contrast(noot) : null, laag: laag.slice(0, 8), buiten: buiten.slice(0, 8), html: document.documentElement.className,
    };
  }, [VENSTER] as const);
};

const fouten = (m: StapOpMeting, wat: string): string[] => {
  if (!m.open) return [`${wat}: venster «Підтвердіть доступ» niet open`];
  const f: string[] = [];
  if (m.onthoud !== 'kan') f.push(`${wat}: geen vinkje «Запам’ятати цей браузер» (data-onthoud=${m.onthoud || '-'})`);
  if (m.vinkje && m.vinkje.w > 32) f.push(`${wat}: vinkje opgerekt ${m.vinkje.w}×${m.vinkje.h}px (${m.vinkje.font})`);
  if (m.span && m.venster && (m.span.r > m.venster.r + 0.5 || m.span.l < m.venster.l - 0.5)) f.push(`${wat}: label buiten venster ${m.span.l}–${m.span.r} (venster ${m.venster.l}–${m.venster.r})`);
  if (m.inhoud && m.inhoud.sw > m.inhoud.cw + 1) f.push(`${wat}: .venster-inhoud scrollWidth ${m.inhoud.sw} > clientWidth ${m.inhoud.cw}`);
  if (m.buiten.length) f.push(`${wat}: buiten het venster: ${m.buiten.slice(0, 3).join(' · ')}`);
  if (m.labelContrast !== null && m.labelContrast < 4.5) f.push(`${wat}: label ${m.labelContrast}:1`);
  if (m.nootContrast !== null && m.nootContrast < 4.5) f.push(`${wat}: uitleg onder het vinkje ${m.nootContrast}:1`);
  if (m.laag.length) f.push(`${wat}: tekst < 4.5:1: ${m.laag.slice(0, 3).join(' · ')}`);
  return f;
};

/** Eén klik met een 403 STEP_UP_REQUIRED als antwoord; wacht tot het venster zijn manieren heeft geladen. Route meteen weg. */
async function vraagStapOp(p: Page, pad: RegExp, moetRaken: (r: Route) => boolean, klik: () => Promise<void>): Promise<{ open: boolean; geraakt: number }> {
  let geraakt = 0;
  const h = async (route: Route) => { if (route.request().method() === 'POST' && moetRaken(route)) { geraakt++; return route.fulfill(STAP_OP_403); } return route.continue(); };
  await p.route(pad, h);
  try {
    await klik();
    const open = await p.locator(`${VENSTER} :is(label.bevestig-toegang-onthoud, [data-onthoud="nooit"], .bevestig-toegang-fout)`).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    return { open, geraakt };
  } finally { await p.unroute(pad, h).catch(() => undefined); }
}

const zetDonker = async (p: Page, donker: boolean) => { await p.emulateMedia({ colorScheme: donker ? 'dark' : 'light' }); await p.waitForTimeout(450); };
/**
 * Een toestemmingsverzoek dat we niet beslissen blijft 10 minuten in localStorage van mcp.* (src/mcp-toestemming-opslag.ts,
 * sleutel «mr.mcp.consent») en opent zich dan op ELKE pagina van mcp.* opnieuw — met een achtergrond die elke klik onderschept.
 * Na een meting vergeten we het daarom weer (zoals een mens die het verzoek in een ander tabblad laat liggen); op de server
 * verloopt het vanzelf. Alleen mogelijk op de oorsprong mcp.*: staat de pagina elders, dan eerst een klein bestand van mcp.* openen.
 */
async function vergeetToestemming(p: Page, mcp: string) {
  if (!p.url().startsWith(`${mcp}/`)) await p.goto(`${mcp}/favicon-16.png`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => undefined);
  await p.evaluate(() => { try { localStorage.removeItem('mr.mcp.consent'); } catch { /* opslag geblokkeerd */ } }).catch(() => undefined);
}
const foutTekst = (e: unknown) => String((e as Error)?.message || e).replace(/\x1b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 200);
/**
 * Eindbeeld voor de algemene analyse van de stand: scrol ALLEEN de inhoud van een venster (nooit het venster zelf — scrollIntoView
 * schuift anders ook een `.venster{overflow:hidden}` op en knipt de titelbalk weg), met `doel` in het midden, en schuif een paar
 * pixels bij zodat geen knop half onder de rand van de scrollzone valt (een halve rij telt daar anders als «kleine knop»).
 */
async function scrolInVenster(p: Page, venster: string, doel: string | null) {
  await p.evaluate(([vSel, dSel]) => {
    const v = document.querySelector(vSel); const inh = v?.querySelector('.venster-inhoud') as HTMLElement | null; if (!v || !inh) return;
    (v as HTMLElement).scrollTop = 0; (v as HTMLElement).scrollLeft = 0;
    if (dSel) {
      const d = [...v.querySelectorAll(dSel)].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      if (d) inh.scrollTop += d.getBoundingClientRect().top - inh.getBoundingClientRect().top - inh.clientHeight / 2;
    }
    const knoppen = [...v.querySelectorAll('button, a[href], [role=button], select, summary, input:not([type=checkbox]):not([type=radio]):not([type=hidden])')];
    const half = () => { const R = inh.getBoundingClientRect(); return knoppen.some((k) => { const r = k.getBoundingClientRect(); if (!inh.contains(k) || !r.width) return false; const zicht = Math.min(r.bottom, R.bottom) - Math.max(r.top, R.top); return zicht > 0 && zicht < 40 && r.height >= 40 - 0.5; }); };
    const basis = inh.scrollTop;
    for (const d of [0, 6, -6, 12, -12, 18, -18, 24, -24, 30, -30, 36, -36, 42, -42, 48, -48]) { inh.scrollTop = basis + d; if (!half()) return; }
    inh.scrollTop = basis;
  }, [venster, doel] as const).catch(() => undefined);
  await p.waitForTimeout(200);
}
const sluitStapOp = async (p: Page) => {
  await p.locator(`${VENSTER} .bevestig-toegang-annuleer`).first().click({ timeout: 5000 }).catch(() => undefined);
  await p.locator(VENSTER).first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
};
/** v2-toestemming: «Далі» tot «Дозволити» er staat. */
async function naarRechten(p: Page) {
  await p.locator('[data-v2-wizard]').first().waitFor({ timeout: 20000 });
  for (let i = 0; i < 6 && !(await p.locator('[data-v2-toestaan]').count()); i++) {
    await p.locator('[data-v2-actie="verder"]').first().click({ timeout: 5000 });
    await p.waitForTimeout(350);
  }
  await p.locator('[data-v2-toestaan]').first().waitFor({ timeout: 5000 });
}

export const toegangStappen = (ctx: Blok1Ctx): Blok1Stap[] => {
  const MCP = ctx.H('mcp');
  const knip = (p: Page, naam: string) => p.screenshot({ path: `${ctx.uit}/${naam}.png` }).catch(() => undefined);

  // ------------------------------------------------------------------ 1. «Підтвердіть доступ»
  const stapop = async (p: Page) => {
    const lang = await taalVan(p), w = breedte(p);
    const metingen: Record<string, unknown> = {};
    const slecht: string[] = [];
    // Eén stroom: venster openen, licht + donker meten, sluiten (behalve de laatste: die blijft open voor de algemene analyse).
    // Een mislukte stroom is een defect van deze stap, maar de andere stromen lopen gewoon door.
    const stroom = async (naam: string, openen: () => Promise<{ open: boolean; geraakt: number }>, openLaten = false) => {
      try {
        const r = await openen();
        if (!r.open) { slecht.push(`${naam}: venster niet open (onderschept: ${r.geraakt})`); await knip(p, `blok1-toegang-stapop-${naam}-${w}-mislukt`); return; }
        await p.waitForTimeout(500);
        for (const donker of [false, true]) {
          await zetDonker(p, donker);
          const m = await meetStapOp(p);
          metingen[`${naam}-${donker ? 'donker' : 'licht'}`] = m;
          slecht.push(...fouten(m, `${naam} ${donker ? 'donker' : 'licht'}`));
          await knip(p, `blok1-toegang-stapop-${naam}-${w}-${donker ? 'donker' : 'licht'}${lang === 'nl' ? '-nl' : ''}`);
        }
        await zetDonker(p, false);
        if (!openLaten) await sluitStapOp(p);
        else { await scrolInVenster(p, TOESTEMMING, null); await scrolInVenster(p, VENSTER, null); }
      } catch (e) {
        slecht.push(`${naam}: stroom mislukt — ${foutTekst(e)}`);
        await knip(p, `blok1-toegang-stapop-${naam}-${w}-mislukt`);
        await zetDonker(p, false).catch(() => undefined);
      }
    };
    const consentStroom = (agent: 'claude' | 'gpt', vers: boolean) => async () => {
      if (vers) {
        const url = await ctx.consentUrl(agent, agent === 'gpt' ? 'ChatGPT' : 'Claude');
        await p.goto(metTaal(url, lang), { waitUntil: 'domcontentloaded', timeout: 45000 });
      }
      await naarRechten(p);
      return vraagStapOp(p, /\/api\/owner\/mcp-connector\/consent(\?|$)/, (route) => { try { return route.request().postDataJSON()?.approve === true; } catch { return false; } },
        () => p.locator('[data-v2-toestaan]').first().click({ timeout: 5000 }));
    };
    // a) claude (het adres van de stap staat al open), b) #browser «Дозволити все» (als bereikbaar), c) gpt met een vers adres als
    // laatste — dat venster blijft open voor de algemene knipsels/axe van de stand (licht en donker).
    await stroom('v2-claude', consentStroom('claude', false));
    await vergeetToestemming(p, MCP);
    await p.goto(metTaal(`${MCP}/agenten#browser`, lang), { waitUntil: 'domcontentloaded', timeout: 45000 });
    const bereikbaar = await p.locator('[data-bea-snel="alles"]').first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    if (bereikbaar) {
      await p.waitForTimeout(800);
      await stroom('browser', () => vraagStapOp(p, /\/api\/owner\/agents\/extensie-matrix\/snel(\?|$)/, (route) => { try { return route.request().postDataJSON()?.set === 'alles'; } catch { return false; } }, async () => {
        await p.locator('[data-bea-snel="alles"]').first().click({ timeout: 5000 });
        await p.locator('[data-bea-snel-ok]').first().click({ timeout: 5000 });
      }));
    } else { metingen.browser = 'niet bereikbaar: [data-bea-snel="alles"] niet verschenen'; ctx.zeg(`   blok1-toegang-stapop ${w}: #browser niet bereikbaar (${p.url()})`); }
    await stroom('v2-gpt', consentStroom('gpt', true), true);
    ctx.meting('blok1-toegang-stapop', p, [...new Set(slecht)].join('; '), JSON.stringify({ lang, metingen }));
  };

  // ------------------------------------------------------------------ 2. chips en een veegronde over de toestemmingsvensters
  /** Alles in het toestemmingsvenster: steekt iets buiten het venster? Is een vinkje/keuzerondje opgerekt? Chips apart geteld. */
  const meetToestemming = (p: Page) => p.evaluate(([sel]) => {
    const v = document.querySelector(sel); if (!v) return null;
    const R = v.getBoundingClientRect();
    const inh = v.querySelector('.venster-inhoud') as HTMLElement | null;
    const tekst = (el: Element) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    const chips = [...v.querySelectorAll('.v2-chip')].map((el) => { const r = el.getBoundingClientRect(); return { tekst: tekst(el), l: Math.round(r.left), r: Math.round(r.right), ws: getComputedStyle(el).whiteSpace }; }).filter((c) => c.r > c.l);
    const buiten = [...v.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.right > R.right + 0.5 || r.left < R.left - 0.5); })
      .map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className || '').slice(0, 40)} [${Math.round(el.getBoundingClientRect().left)}–${Math.round(el.getBoundingClientRect().right)}] «${tekst(el)}»`);
    const vinkjes = [...v.querySelectorAll('input[type=checkbox], input[type=radio]')].map((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), font: getComputedStyle(el).fontFamily.slice(0, 24) }; }).filter((x) => x.w > 0);
    return { venster: [Math.round(R.left), Math.round(R.right)], stap: v.querySelector('[data-v2-stap]')?.getAttribute('data-v2-stap') || 'oud', chips, chipsBuiten: chips.filter((c) => c.r > R.right + 0.5 || c.l < R.left - 0.5), buiten: buiten.slice(0, 10), vinkjes, opgerekt: vinkjes.filter((x) => x.w > 32), inhoud: inh ? { sw: inh.scrollWidth, cw: inh.clientWidth } : null };
  }, [TOESTEMMING] as const);
  type Toestemming = NonNullable<Awaited<ReturnType<typeof meetToestemming>>>;
  const toestemmingFouten = (m: Toestemming | null, wat: string): string[] => {
    if (!m) return [`${wat}: toestemmingsvenster niet gevonden`];
    const f: string[] = [];
    if (m.chipsBuiten.length) f.push(`${wat}: ${m.chipsBuiten.length} chip(s) buiten het venster ${m.venster.join('–')}: ${m.chipsBuiten.slice(0, 2).map((c) => `«${c.tekst}» ${c.l}–${c.r} (${c.ws})`).join(' · ')}`);
    else if (m.buiten.length) f.push(`${wat}: buiten het venster: ${m.buiten.slice(0, 2).join(' · ')}`);
    if (m.opgerekt.length) f.push(`${wat}: ${m.opgerekt.length} opgerekt(e) vinkje(s) ${m.opgerekt.slice(0, 2).map((x) => `${x.w}×${x.h}`).join(', ')}`);
    if (m.inhoud && m.inhoud.sw > m.inhoud.cw + 1) f.push(`${wat}: .venster-inhoud scrollWidth ${m.inhoud.sw} > ${m.inhoud.cw}`);
    return f;
  };
  const chips = async (p: Page) => {
    const lang = await taalVan(p), w = breedte(p);
    const metingen: Record<string, unknown> = {};
    const slecht: string[] = [];
    // De gpt-toestemming staat al open (url van de stap). Elke stap van het venster meten, «Дозволи» als laatste.
    const veeg = async (agent: 'claude' | 'gpt', vers: boolean) => {
      try {
        if (vers) await p.goto(metTaal(await ctx.consentUrl(agent, agent === 'gpt' ? 'ChatGPT' : 'Claude'), lang), { waitUntil: 'domcontentloaded', timeout: 45000 });
        await p.locator('[data-v2-wizard]').first().waitFor({ timeout: 20000 });
        await p.waitForTimeout(500);
        for (let i = 0; i < 7; i++) {
          const m = await meetToestemming(p);
          const stap = m?.stap || String(i);
          metingen[`${agent}-${stap}`] = m;
          slecht.push(...toestemmingFouten(m, `v2-${agent} ${stap}`));
          if (await p.locator('[data-v2-toestaan]').count()) break;
          await p.locator('[data-v2-actie="verder"]').first().click({ timeout: 5000 });
          await p.waitForTimeout(400);
        }
      } catch (e) { slecht.push(`v2-${agent}: veegronde mislukt — ${foutTekst(e)}`); await knip(p, `blok1-toegang-chips-${agent}-${w}-mislukt`); }
    };
    await veeg('gpt', false);
    // Het oude venster (/mcp, McpConsentModal): dezelfde veegronde.
    try {
      await p.goto(metTaal(await ctx.consentUrl(null, 'Oude connector'), lang), { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (await p.locator('[data-mcp-consent-modal]').first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false)) {
        await p.waitForTimeout(600);
        const m = await meetToestemming(p); metingen.oud = m; slecht.push(...toestemmingFouten(m, 'oud /mcp'));
      } else metingen.oud = 'niet open';
    } catch (e) { slecht.push(`oud /mcp: veegronde mislukt — ${foutTekst(e)}`); }
    // claude als laatste: blijft op «Дозволи» staan voor de knipsels; de langste chip in beeld.
    await veeg('claude', true);
    await scrolInVenster(p, TOESTEMMING, '.v2-chip');
    await knip(p, `blok1-toegang-chips-${w}${lang === 'nl' ? '-nl' : ''}`);
    ctx.meting('blok1-toegang-chips', p, [...new Set(slecht)].join('; '), JSON.stringify({ lang, metingen }));
  };

  // ------------------------------------------------------------------ 3. de pagina van ChatGPT
  const gpt = async (p: Page) => {
    const lang = await taalVan(p), w = breedte(p);
    await p.locator('[data-agent-verbinden="gpt"]').first().waitFor({ timeout: 20000 });
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const blok = document.querySelector('[data-agent-verbinden="gpt"]');
      const stappen = [...(blok?.querySelectorAll('[data-verbind-stappen] li') || [])].map((li) => (li.textContent || '').trim());
      const vereist = (blok?.querySelector('[data-verbind-vereist]')?.textContent || '').trim();
      const knoppen = [...(blok?.querySelectorAll('a[data-verbind-knop]') || [])].map((a) => ({ href: a.getAttribute('href') || '', tekst: (a.textContent || '').trim() }));
      const uitleg = [...(blok?.querySelectorAll('.ag-verbind-knop-uitleg') || [])].map((x) => (x.textContent || '').trim());
      const vr = blok?.querySelector('[data-verbind-vereist]')?.getBoundingClientRect();
      return { taal: document.documentElement.lang, stappen, vereist, knoppen, uitleg, vereistBinnen: vr ? vr.right <= document.documentElement.clientWidth + 1 && vr.left >= -1 : false };
    });
    const alles = m.stappen.join(' | ');
    const nl = lang === 'nl';
    const eisen: Array<[string, boolean]> = [
      ['stap 1: Settings → Apps → Advanced settings → «Developer mode»', /Settings → Apps → Advanced settings → «Developer mode»/.test(m.stappen[0] || '')],
      ['stap 1: direct adres https://chatgpt.com/#settings/Connectors/Advanced', (m.stappen[0] || '').includes('https://chatgpt.com/#settings/Connectors/Advanced')],
      ['stap 2: «Create app» naast Advanced settings', /«Create app»/.test(m.stappen[1] || '') && /Advanced settings/.test(m.stappen[1] || '')],
      ['stap 2: het adres van /gpt', (m.stappen[1] || '').includes('https://mcp.tarasevych.com/gpt')],
      ['stap 2: OAuth zonder client-id (dynamic client registration)', /OAuth/.test(m.stappen[1] || '') && /dynamic client registration/.test(m.stappen[1] || '')],
      [nl ? 'stap: app kiezen in het menu met hulpmiddelen of noemen' : 'крок: вибрати застосунок у меню інструментів або назвати', nl ? /menu met hulpmiddelen/.test(alles) && /noem/.test(alles) : /меню інструментів/.test(alles) && /назвіть/.test(alles)],
      ['geen oud pad «Settings → Connectors → Advanced»', !/Connectors → Advanced/.test(`${alles} ${m.vereist}`)],
      ['één grote knop → https://chatgpt.com/#settings/Connectors (Settings → Apps)', m.knoppen.length === 1 && m.knoppen[0]?.href === 'https://chatgpt.com/#settings/Connectors' && /Settings → Apps/.test(m.knoppen[0]?.tekst || '')],
      [nl ? 'plannen: Pro, Plus, Business, Enterprise, Education' : 'плани: Pro, Plus, Business, Enterprise, Education', /Pro, Plus, Business, Enterprise/.test(m.vereist) && /Education/.test(m.vereist)],
      [nl ? 'schrijven: bèta voor Business en Enterprise/Edu' : 'запис: бета для Business і Enterprise/Edu', nl ? /bèta voor alleen Business en Enterprise\/Edu/.test(m.vereist) : /бета лише для Business і Enterprise\/Edu/.test(m.vereist)],
      [nl ? 'Pro alleen lezen; op Plus/Pro werkt schrijven mogelijk niet' : 'Pro лише читання; на Plus/Pro запис може не працювати', nl ? /alleen met leesrechten/.test(m.vereist) && /Op Plus\/Pro .* mogelijk niet/.test(m.vereist) : /лише з правами читання/.test(m.vereist) && /на Plus\/Pro .* можуть не працювати/.test(m.vereist)],
      [nl ? 'niet in de mobiele apps' : 'немає в мобільних застосунках', nl ? /mobiele ChatGPT-apps/.test(m.vereist) : /мобільних застосунках ChatGPT/.test(m.vereist)],
      ['pagina in uk of nl (<html lang>)', m.taal === 'uk' || m.taal === 'nl'],
      ['waarschuwing binnen de breedte van het scherm', m.vereistBinnen],
    ];
    const mis = eisen.filter(([, ok]) => !ok).map(([n]) => n);
    await p.locator('[data-verbind-vereist]').first().scrollIntoViewIfNeeded().catch(() => undefined);
    await p.waitForTimeout(250);
    await knip(p, `blok1-toegang-gpt-${w}${nl ? '-nl' : ''}`);
    ctx.meting('blok1-toegang-gpt', p, mis.length ? `ontbreekt (${lang}): ${mis.join(' · ')}` : '', JSON.stringify({ lang, ...m }));
  };

  return [
    { naam: 'blok1-toegang-stapop', url: () => ctx.consentUrl('claude', 'Claude'), wachtOp: '[data-v2-wizard]', na: stapop },
    { naam: 'blok1-toegang-chips', url: () => ctx.consentUrl('gpt', 'ChatGPT'), wachtOp: '[data-v2-wizard]', na: chips },
    // voor: een toestemmingsverzoek van de vorige stap (chips) zou zich anders boven de agentpagina openen.
    { naam: 'blok1-toegang-gpt', url: `${MCP}/agenten#agent/gpt`, voor: (p) => vergeetToestemming(p, MCP), wachtOp: '[data-agent-verbinden="gpt"]', na: gpt },
  ];
};
