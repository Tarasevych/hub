// Blok 1 (25.10.2026): stappen van het team «acties» — zie stand-blok1.ts. Namen: «blok1-acties-…».
//
//  blok1-acties-rij      (1.1, 6.1) — in elke dichtheid (minimum, detailed, normal, bulky) elke zichtbare rij aanwijzen, op de tekst én
//                        op de datum (daar staat het «око»; in «Мінімум» met bijlagen verschijnt de balk pas daar): de balk ligt binnen
//                        de rij, elk zichtbaar interactief element van de rij wordt in zijn midden door elementFromPoint geraakt (of is
//                        verborgen), en «Попередній перегляд» is met de muis bereikbaar (het «око» zelf, of «Перегляд» in de balk).
//  blok1-acties-kleuren  (1.2) — de berekende kleur van het pictogram per actie is gelijk in de balk van de rij, het ⋮-menu, de selectiebalk
//                        (2 brieven gekozen) en haar menu «›», het leesvenster (kop en ⋮) en de onderbalk op de telefoon — in licht én
//                        donker; «До кошика» = --fout, «Архівувати» = --info; elk pictogram ≥ 3:1 op zijn achtergrond.
//
// Werkt op de oude build (dist-PL9: daar komen de defecten) en de nieuwe: een actie heet data-mail-actie (nieuw), data-reader-action-id
// (leesvenster) of — oud — naar haar aria-label/tekst. Na de metingen toont de stap een eenvoudige samenvatting (alleen tekst): de algemene
// analyse van de stand (geometrie, axe) meet dan die bladzijde en niet opnieuw de lijst — die hebben mail-agc-lijst* al, met hun eigen,
// bekende afkappingen. Knipsels van de metingen zelf: blok1-acties-*.png in ctx.uit.
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import type { Blok1Ctx, Blok1Stap } from './stand-blok1';
import { mailNep, wachtOpLijst } from './stand-mail-nep';

type Dichtheid = 'minimum' | 'detailed' | 'normal' | 'bulky';
const DICHTHEDEN: Dichtheid[] = ['minimum', 'detailed', 'normal', 'bulky'];
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const lichaam = (r: { request: () => { postData: () => string | null } }) => { try { return JSON.parse(r.request().postData() || '{}') as Record<string, unknown>; } catch { return {}; } };

/** Oude build (zonder data-mail-actie): actie naar haar naam. Volgorde telt (eerste treffer). */
const NAAM_NAAR_ACTIE: Array<[string, string]> = [
  ['^Попередній перегляд', 'preview'], ['^Архівувати', 'archive'], ['^(До кошика|Перемістити до кошика)', 'trash'], ['^Позначити (не)?прочитаним', 'read'],
  ['^(Відкласти|Змінити відкладання|Задати локальний час)', 'snooze'], ['^Перемістити у Вхідні|^Відновити у Вхідні', 'inbox'], ['^Перемістити$', 'move'], ['^Мітки$', 'labels'],
  ['Від людей', 'classifyPeople'], ['Системні / розсилки', 'classifySystem'], ['^Позначити (відправник(а|ів) )?(важлив|звичайн)', 'attention'], ['зірочку$|обраного$', 'star'],
  ['^Скасувати підписку', 'unsubscribe'], ['^Обрати лист', 'select'], ['^Колір відправника', 'senderColor'],
];

/** Nagebootste post + wat het leesvenster nodig heeft (één brief, gelezen-melding) — de lijst komt van mailNep. */
async function actiesNep(page: Page) {
  await mailNep(page);
  await page.route('**/api/owner/mail/view-preferences/load', (r) => r.fulfill(json({ ok: true, preferences: { readingPane: 'none', threadGrouping: true, mobileOverrides: {} } })));
  await page.route('**/api/owner/mail/view-preferences/save', (r) => r.fulfill(json({ ok: true })));
  const details = { dateHeader: '', via: '', mailedBy: 'novaposhta.example.test', signedBy: 'novaposhta.example.test', signatureDomain: 'novaposhta.example.test', authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' }, transport: { status: 'encrypted_observed', evidence: 'TLS 1.3' }, list: { id: '', unsubscribeMode: '', oneClick: false }, headerCount: 12 };
  await page.route('**/api/owner/mail/google-suite/message', (r) => {
    const id = String(lichaam(r).messageId || 'agc-m1'), tekst = 'Короткий зміст листа. Тут кілька речень тексту, щоб лист мав уривок.';
    return r.fulfill(json({ source: 'live_on_demand', persisted: false, message: { id, threadId: `agc-t${id.replace('agc-m', '')}`, internetMessageId: `<${id}@stand.example.test>`, from: 'Нова пошта <noreply@novaposhta.example.test>', to: 'pavlo.tarasevych.stand@example.test', cc: '', replyTo: '', subject: `Лист ${id}`, snippet: tekst, receivedAt: Date.now() - 3_600_000, labelIds: ['INBOX'], sizeBytes: 4000, parseWarnings: [], details, plainText: tekst, renderBody: { kind: 'html', html: `<p>${tekst}</p>`, text: tekst, inlineResources: [] }, attachments: [] } }));
  });
  await page.route('**/api/owner/mail/google-suite/thread', (r) => r.fulfill(json({ source: 'live_on_demand', persisted: false, threadId: String(lichaam(r).threadId || ''), messages: [] })));
  await page.route('**/api/owner/mail/google-suite/state-intents/submit', (r) => { const b = lichaam(r); return r.fulfill(json({ ok: true, intent: { outboxId: `o-${Date.now()}`, intentId: b.intentId, accountId: b.accountId || '', messageId: b.messageId, action: b.action, status: 'succeeded', capability: 'supported', providerWrite: 'done', attemptCount: 1, maxAttempts: 5, retryAt: 0, acceptedAt: Date.now(), providerObservedAt: Date.now(), completedAt: Date.now(), errorCode: '', rollbackRequired: false, converged: true } })); });
  await page.route('**/api/owner/mail/google-suite/state-intents/status', (r) => { const b = lichaam(r); return r.fulfill(json({ ok: true, intents: ((b.outboxIds as string[]) || []).map((outboxId) => ({ outboxId, status: 'succeeded', converged: true })) })); });
  await page.route('**/api/owner/mail/google-suite/reader/n10/capabilities', (r) => r.fulfill(json({ taskWrite: false, eventWrite: false, filterWrite: false, ignoreThread: false })));
}

const pauze = (page: Page, ms: number) => page.waitForTimeout(ms);
/** Muis weg van de rijen: bovenaan in het midden — niet op (2,2): daar klapt de zijbalk open en zijn scrim vangt de volgende klik. */
const parkeer = (page: Page) => page.mouse.move(Math.round((page.viewportSize()?.width || 1280) / 2), 2);
async function herlaad(page: Page, url: string) {
  // De mailpagina onthoudt per tabblad (sessionStorage) wat open stond — het leesvenster, de gekozen brieven: elke meting begint vers.
  await page.evaluate(() => { try { for (const k of Object.keys(sessionStorage)) if (k.startsWith('tsv:mail-ui-context') || k.startsWith('tsv:cognitive-resume-pending:mail')) sessionStorage.removeItem(k); } catch { /* geen opslag */ } }).catch(() => undefined);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
  await wachtOpLijst(page);
}

/** Eenvoudige samenvatting als laatste toestand van de stap (alleen tekst, ≥ 14 px, geen knoppen): voor het knipsel van de stand. */
async function samenvatting(page: Page, titel: string, regels: string[]) {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  await page.goto('about:blank').catch(() => undefined);
  await page.setContent(`<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${esc(titel)}</title><style>html,body{margin:0;background:#fff;color:#111;font:16px/1.45 system-ui,sans-serif}main{padding:16px;max-width:100%;box-sizing:border-box}h1{font-size:20px;margin:0 0 8px}pre{margin:0;font:14px/1.45 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><main><h1>${esc(titel)}</h1><pre>${esc(regels.join('\n'))}</pre></main></body></html>`).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------- 1.1 + 6.1: de rij
type RijMeting = { id: string; balk: { zichtbaar: boolean; boven: number; onder: number; links: number; rechts: number } | null; rij: { h: number }; bedekt: Array<{ el: string; door: string; balk: boolean }>; oog: { inDom: boolean; zichtbaar: boolean; raak: boolean; balkKnop: boolean } };

/** Meet in de pagina, terwijl de muis op de rij staat. */
const meetRij = (page: Page, id: string) => page.evaluate((id) => {
  const rij = document.querySelector<HTMLElement>(`.google-mail-row[data-mail-message-id="${id}"]`);
  if (!rij) return null;
  const zicht = (el: Element) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const cv = (el as HTMLElement & { checkVisibility?: (o: Record<string, boolean>) => boolean }).checkVisibility; if (typeof cv === 'function' && !cv.call(el, { opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
  const naam = (el: Element) => { const h = el as HTMLElement; return `${h.tagName.toLowerCase()}${h.className && typeof h.className === 'string' ? '.' + h.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''}${h.getAttribute('aria-label') ? `«${(h.getAttribute('aria-label') || '').slice(0, 28)}»` : ''}`; };
  const balkEl = rij.querySelector<HTMLElement>(':scope > .mail-row-hover-actions');
  const rr = rij.getBoundingClientRect();
  const balkZicht = !!balkEl && zicht(balkEl) && getComputedStyle(balkEl).pointerEvents !== 'none';
  const br = balkEl?.getBoundingClientRect();
  const INTERACTIEF = 'button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=checkbox],[role=menuitem],[tabindex]:not([tabindex="-1"])';
  const bedekt: Array<{ el: string; door: string; balk: boolean }> = [];
  for (const k of rij.querySelectorAll<HTMLElement>(INTERACTIEF)) {
    if (balkEl && balkEl.contains(k)) continue;
    if (k.classList.contains('mail-row-open-hit') || k.closest('[aria-hidden="true"],[inert]')) continue;
    if (!zicht(k) || getComputedStyle(k).pointerEvents === 'none') continue;
    const r = k.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
    const t = document.elementFromPoint(x, y);
    if (!t || t === k || k.contains(t)) continue;
    bedekt.push({ el: naam(k), door: naam(t), balk: !!balkEl && balkEl.contains(t) });
  }
  const oog = rij.querySelector<HTMLElement>('.voorbeeld-knop');
  const oogZicht = !!oog && zicht(oog);
  let oogRaak = false;
  if (oog && oogZicht && getComputedStyle(oog).pointerEvents !== 'none') { const r = oog.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); oogRaak = !!t && (t === oog || oog.contains(t)); }
  // «Перегляд» in de balk: nieuw data-mail-actie="preview", zichtbaar en zelf geraakt
  const pk = balkEl?.querySelector<HTMLElement>('[data-mail-actie="preview"]');
  let balkKnop = false;
  if (pk && balkZicht && zicht(pk)) { const r = pk.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); balkKnop = !!t && (t === pk || pk.contains(t)); }
  return {
    id, rij: { h: Math.round(rr.height * 10) / 10 },
    balk: balkEl && br ? { zichtbaar: balkZicht, boven: Math.round((br.top - rr.top) * 10) / 10, onder: Math.round((rr.bottom - br.bottom) * 10) / 10, links: Math.round((br.left - rr.left) * 10) / 10, rechts: Math.round((rr.right - br.right) * 10) / 10 } : null,
    bedekt, oog: { inDom: !!oog, zichtbaar: oogZicht, raak: oogRaak, balkKnop },
  } as RijMeting;
}, id);

/** Rijen die helemaal in beeld staan (onder de bovenbalk), met het midden van hun tekst en van hun datum. */
const zichtbareRijen = (page: Page) => page.evaluate(() => {
  const kop = document.querySelector('.mail-top-command-bar')?.getBoundingClientRect().bottom || 0;
  const uit: Array<{ id: string; tekst: { x: number; y: number }; datum: { x: number; y: number } | null }> = [];
  for (const r of document.querySelectorAll<HTMLElement>('.google-mail-row[data-mail-message-id]')) {
    if (r.classList.contains('mail-row-skeleton')) continue;
    const b = r.getBoundingClientRect();
    if (b.top < kop + 4 || b.bottom > innerHeight - 4 || b.height < 20) continue;
    const d = r.querySelector('.mail-minimum-date, [data-mail-density-block="date"]')?.getBoundingClientRect();
    uit.push({ id: r.dataset.mailMessageId || '', tekst: { x: Math.round(b.left + b.width * 0.35), y: Math.round(b.top + Math.min(b.height / 2, 30)) }, datum: d && d.width > 0 ? { x: Math.round(d.left + d.width / 2), y: Math.round(d.top + d.height / 2) } : null });
  }
  return uit.slice(0, 12);
});

const rijStap = (ctx: Blok1Ctx) => async (page: Page) => {
  const w = page.viewportSize()?.width || 0, url = `${ctx.H('mail')}/postvak-in`;
  const slecht: string[] = [], detail: Record<string, unknown> = {}, regels: string[] = [];
  // licht én donker: de plek van de balk hangt niet van het thema af, het verbergen (opacity, :has) wel van dezelfde regels — toch meten
  for (const thema of ['licht', 'donker'] as const) {
    await page.emulateMedia({ colorScheme: thema === 'donker' ? 'dark' : 'light' });
    for (const d of DICHTHEDEN) {
      await mailNep(page, { dichtheid: d });
      await herlaad(page, url);
      const echt = await page.evaluate(() => document.querySelector('.google-mail-workspace')?.getAttribute('data-density-mode') || '');
      if (echt !== d) { slecht.push(`${thema} ${d}: dichtheid niet gezet (${echt || 'geen'})`); continue; }
      const rijen = await zichtbareRijen(page);
      const metingen: Array<RijMeting & { punt: string }> = [];
      let knipsel = false;
      for (const r of rijen) {
        for (const [punt, p] of [['tekst', r.tekst], ['datum', r.datum]] as const) {
          if (!p) continue;
          await page.mouse.move(p.x, p.y); await pauze(page, 220);
          const m = await meetRij(page, r.id);
          if (!m) continue;
          metingen.push({ ...m, punt });
          const waar = `${thema} ${d} ${r.id} (${punt})`;
          if (m.balk?.zichtbaar && (m.balk.boven < -0.5 || m.balk.onder < -0.5 || m.balk.links < -0.5 || m.balk.rechts < -0.5)) slecht.push(`${waar}: balk buiten de rij (boven ${m.balk.boven}, onder ${m.balk.onder} px)`);
          for (const b of m.bedekt) slecht.push(`${waar}: ${b.el} bedekt door ${b.door}${b.balk ? ' (balk)' : ''}`);
          if (m.oog.inDom && !(m.oog.zichtbaar && m.oog.raak) && !m.oog.balkKnop) slecht.push(`${waar}: «Попередній перегляд» niet bereikbaar (око ${m.oog.zichtbaar ? 'zichtbaar maar niet te raken' : 'verborgen'}, geen «Перегляд» in de balk)`);
          // één knipsel per dichtheid en thema: de eerste rij met bijlagen, muis op de datum (daar lag het «око» onder de balk)
          if (!knipsel && punt === 'datum' && Number(r.id.replace('agc-m', '')) % 2 === 0) {
            knipsel = true;
            const box = await page.locator(`.google-mail-row[data-mail-message-id="${r.id}"]`).boundingBox();
            if (box) await page.screenshot({ path: join(ctx.uit, `blok1-acties-rij-${d}-${w}${thema === 'donker' ? '-donker' : ''}.png`), clip: { x: Math.max(0, box.x + box.width - Math.min(560, box.width)), y: Math.max(0, box.y - 28), width: Math.min(560, box.width), height: Math.min(box.height + 56, 400) } }).catch(() => undefined);
          }
        }
      }
      detail[`${thema}/${d}`] = metingen;
      const fout = slecht.filter((s) => s.startsWith(`${thema} ${d} `)).length;
      regels.push(`${thema} ${d}: ${rijen.length} rijen × 2 punten, ${fout} problemen`);
    }
    await parkeer(page);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  const uniek = [...new Set(slecht)];
  ctx.meting('blok1-acties-rij', page, uniek.slice(0, 40).join('; '), JSON.stringify({ ...detail, problemen: uniek }));
  await samenvatting(page, `blok1-acties-rij · ${w} px`, [...regels, '', uniek.length ? `PROBLEMEN (${uniek.length}):` : 'Geen problemen: de balk ligt binnen elke rij, niets interactiefs eronder, «Перегляд» bereikbaar.', ...uniek.slice(0, 60)]);
};

// ---------------------------------------------------------------------------------------------- 1.2: de kleuren
type Kleur = { oppervlak: string; id: string; kleur: string; achter: string; contrast: number; naam: string };

/** Kleur van het pictogram (svg) van elke zichtbare actie onder `wortel` (selector), met achtergrond en contrast. */
const meetKleuren = (page: Page, oppervlak: string, wortel: string, knoppen: string) => page.evaluate(({ oppervlak, wortel, knoppen, namen }) => {
  // rgb()/rgba() en color(srgb r g b / a): color-mix() (toon «etiket») komt als color(srgb …) terug
  const rgb = (c: string) => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]; const s = c.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/); return s ? [+s[1] * 255, +s[2] * 255, +s[3] * 255, s[4] === undefined ? 1 : +s[4]] : null; };
  const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const achter = (el: Element) => { for (let e: Element | null = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.5) return c; } return [255, 255, 255, 1]; };
  const uit: Array<{ oppervlak: string; id: string; kleur: string; achter: string; contrast: number; naam: string }> = [];
  for (const w of document.querySelectorAll(wortel)) for (const k of w.querySelectorAll<HTMLElement>(knoppen)) {
    const r = k.getBoundingClientRect(); const cs = getComputedStyle(k);
    if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || k.getAttribute('data-kop-verborgen') === 'true') continue;
    const svg = k.querySelector('svg'); if (!svg) continue;
    const tekst = (k.getAttribute('aria-label') || k.textContent || '').trim();
    let id = k.getAttribute('data-mail-actie') || k.getAttribute('data-reader-action-id') || '';
    if (!id) for (const [re, a] of namen) if (new RegExp(re).test(tekst)) { id = a; break; }
    if (!id) continue;
    const kleur = getComputedStyle(svg).color, a = achter(k), c = rgb(kleur);
    const x = c ? lum(c) + 0.05 : 1, y = lum(a) + 0.05;
    uit.push({ oppervlak, id, kleur, achter: `rgb(${a.slice(0, 3).join(', ')})`, contrast: Math.round((x > y ? x / y : y / x) * 100) / 100, naam: tekst.slice(0, 40) });
  }
  return uit;
}, { oppervlak, wortel, knoppen, namen: NAAR_REGEX });
const NAAR_REGEX = NAAM_NAAR_ACTIE;

/** De tokens als berekende kleur in de context van de werkruimte (thema van nu). */
const tokenKleuren = (page: Page) => page.evaluate(() => {
  const host = document.querySelector('.google-mail-workspace') || document.body;
  const uit: Record<string, string> = {};
  for (const t of ['fout', 'info', 'warn', 'muted']) { const e = document.createElement('span'); e.style.color = `var(--${t})`; host.appendChild(e); uit[t] = getComputedStyle(e).color; e.remove(); }
  return uit;
});

/** Sluit een open leesvenster (terug naar de lijst): «Назад до списку» of «Закрити», anders Escape. */
const sluitLezer = async (page: Page) => {
  for (let i = 0; i < 3 && await page.locator('.google-mail-reader').count(); i++) {
    const knop = page.locator('.google-mail-reader :is(.mail-reader-back, .mail-reader-close)').first();
    if (await knop.isVisible().catch(() => false)) await knop.click({ timeout: 3000 }).catch(() => undefined); else await page.keyboard.press('Escape').catch(() => undefined);
    await pauze(page, 400);
  }
};
/** Wat er op de plek van de klik ligt en of er een leesvenster is (voor de meting, als het niet opent). */
const lezerDiagnose = (page: Page, x: number, y: number) => page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const naam = (e: Element | null) => e ? `${e.tagName.toLowerCase()}${typeof (e as HTMLElement).className === 'string' && (e as HTMLElement).className ? '.' + (e as HTMLElement).className.split(/\s+/).slice(0, 3).join('.') : ''}` : '';
  return { url: location.pathname + location.search + location.hash, lezer: !!document.querySelector('.google-mail-reader'), backdrop: !!document.querySelector('.google-mail-reader-backdrop'), raak: naam(el), rij: el?.closest('.google-mail-row')?.getAttribute('data-mail-message-id') || '', meldingen: [...document.querySelectorAll('[role=status],[role=alert]')].map((e) => (e.textContent || '').trim()).filter(Boolean).join(' | ').slice(0, 300) };
}, { x, y });

/** Kiest de brieven via hun vakje (role=checkbox); geeft terug hoeveel er gekozen zijn en of de selectiebalk er is. */
const kiesTwee = async (page: Page, ids: string[]) => {
  const gekozen = (id: string) => page.locator(`.google-mail-row[data-mail-message-id="${id}"] [role=checkbox][aria-checked="true"]`).count();
  for (const id of ids) {
    const rij = page.locator(`.google-mail-row[data-mail-message-id="${id}"]`).first();
    for (let poging = 0; poging < 2 && !(await gekozen(id)); poging++) {
      await rij.hover().catch(() => undefined);
      await rij.locator(':is(.mail-row-avatar[role=checkbox], .mail-row-select-box, .mail-minimum-select, .mail-minimum-avatar, [role=checkbox])').first().click({ timeout: 5000 }).catch(() => undefined);
      await pauze(page, 350);
    }
  }
  const aantal = (await Promise.all(ids.map(gekozen))).filter(Boolean).length;
  return { aantal, balk: await page.locator('.mail-selection-strip').first().isVisible().catch(() => false), lezerOpen: (await page.locator('.google-mail-reader').count()) > 0 };
};

const kleurenStap = (ctx: Blok1Ctx) => async (page: Page) => {
  const w = page.viewportSize()?.width || 0, telefoon = w <= 720, url = `${ctx.H('mail')}/postvak-in`;
  const slecht: string[] = [], detail: Record<string, unknown> = {}, regels: string[] = [], lezerOpenen: Record<string, unknown> = {};
  for (const thema of ['licht', 'donker'] as const) {
    await page.emulateMedia({ colorScheme: thema === 'donker' ? 'dark' : 'light' });
    await herlaad(page, url);
    await sluitLezer(page);
    const tok = await tokenKleuren(page);
    const metingen: Kleur[] = [];
    // (a) balk van de rij + ⋮-menu (alleen met de muis; op de telefoon is de balk alleen «⋮»)
    if (!telefoon) {
      const rij = page.locator('.google-mail-row[data-mail-message-id="agc-m1"]').first();
      const b = await rij.boundingBox();
      if (b) { await page.mouse.move(b.x + b.width * 0.35, b.y + Math.min(b.height / 2, 20)); await pauze(page, 300); }
      const meer = rij.locator('.mail-row-actions-more').first();
      await meer.waitFor({ state: 'visible', timeout: 2500 }).catch(() => undefined);
      const voor = metingen.length;
      metingen.push(...await meetKleuren(page, 'rij', '.google-mail-row[data-mail-message-id="agc-m1"] > .mail-row-hover-actions', ':scope > button'));
      if (metingen.length === voor) slecht.push(`${thema}: balk van de rij niet gemeten (geen zichtbare actie)`);
      if (thema === 'licht') await page.screenshot({ path: join(ctx.uit, `blok1-acties-kleuren-rij-${w}.png`), clip: b ? { x: Math.max(0, b.x + b.width - 420), y: Math.max(0, b.y - 30), width: Math.min(420, b.width), height: Math.min(b.height + 60, 220) } : undefined }).catch(() => undefined);
      if (await meer.isVisible().catch(() => false)) {
        await meer.click({ timeout: 5000 }).catch(() => undefined); await pauze(page, 400);
        metingen.push(...await meetKleuren(page, 'rij-menu', '.mail-row-action-popover', '[role=menuitem]'));
        await page.keyboard.press('Escape').catch(() => undefined); await pauze(page, 250);
      } else slecht.push(`${thema}: ⋮ van de rij niet zichtbaar`);
    }
    // (b) selectiebalk: twee brieven kiezen (agc-m1, agc-m3: geen ster, geen bijlagen) — plus haar menu «›» als dat er is
    const keuze = await kiesTwee(page, ['agc-m1', 'agc-m3']);
    if (keuze.aantal < 2 || !keuze.balk) { slecht.push(`${thema}: selectie niet gelukt (${keuze.aantal} gekozen, balk ${keuze.balk ? 'ja' : 'nee'}, leesvenster ${keuze.lezerOpen ? 'open' : 'dicht'})`); await page.screenshot({ path: join(ctx.uit, `blok1-acties-kleuren-selectie-mislukt-${w}-${thema}.png`) }).catch(() => undefined); }
    await parkeer(page); await pauze(page, 300);
    metingen.push(...await meetKleuren(page, 'selectie', '.mail-selection-actions', ':scope > button, :scope > details > summary'));
    if (thema === 'licht') { const s = await page.locator('.mail-selection-strip').first().boundingBox(); if (s) await page.screenshot({ path: join(ctx.uit, `blok1-acties-kleuren-selectie-${w}.png`), clip: { x: Math.max(0, s.x), y: Math.max(0, s.y - 4), width: Math.min(s.width, w), height: Math.min(s.height + 8, 160) } }).catch(() => undefined); }
    const verder = page.locator('.mail-selection-mobile-more > summary').first();
    if (await verder.isVisible().catch(() => false)) {
      await verder.click({ timeout: 5000 }).catch(() => undefined); await pauze(page, 350);
      metingen.push(...await meetKleuren(page, 'selectie-menu', '.mail-selection-mobile-more[open] > div', ':scope > button'));
      await verder.click({ timeout: 5000 }).catch(() => undefined); await pauze(page, 250);
    }
    // (c) leesvenster: kop en ⋮ (op de telefoon: onderbalk en «Ще») — vers geladen (geen selectie meer), niet zwevend (vorm in localStorage)
    await page.evaluate(() => { try { localStorage.setItem('mail-reader-venster-v1', JSON.stringify({ zwevend: false, x: Math.max(80, innerWidth - 820), y: 64, w: 760, h: Math.min(760, innerHeight - 90) })); } catch { /* */ } });
    await herlaad(page, url);
    const doel = page.locator('.google-mail-row[data-mail-message-id="agc-m1"]').first();
    const db = await doel.boundingBox();
    if (db) {
      const kx = db.x + db.width * 0.5, ky = db.y + Math.min(18, db.height / 2);
      const wacht = (ms: number) => page.waitForSelector('.google-mail-reader:not(.content-loading) > header', { timeout: ms }).then(() => true).catch(() => false);
      const diag = await lezerDiagnose(page, kx, ky);
      await page.mouse.click(kx, ky);
      let open = await wacht(6000), hoe = 'klik';
      if (!open) { hoe = 'open-knop'; await doel.locator('.mail-row-open-hit').first().click({ force: true, timeout: 3000 }).catch(() => undefined); open = await wacht(5000); }
      if (!open) { hoe = 'enter'; await doel.focus().catch(() => undefined); await page.keyboard.press('Enter').catch(() => undefined); open = await wacht(5000); }
      lezerOpenen[thema] = { hoe: open ? hoe : 'niet', voor: diag, na: await lezerDiagnose(page, kx, ky) };
      if (!open) slecht.push(`${thema}: leesvenster niet geopend (${JSON.stringify(lezerOpenen[thema]).slice(0, 300)})`);
      await pauze(page, 900);
      metingen.push(...await meetKleuren(page, 'lezer-kop', '.google-mail-reader > header', '[data-reader-action-id]'));
      if (telefoon) { const voor = metingen.length; metingen.push(...await meetKleuren(page, 'onderbalk', '.mail-reader-onderbalk', '.mail-reader-onderbalk-knop')); if (metingen.length - voor < 3) slecht.push(`${thema}: onderbalk niet gemeten (${metingen.length - voor} acties)`); }
      if (thema === 'licht') await page.screenshot({ path: join(ctx.uit, `blok1-acties-kleuren-lezer-${w}.png`), fullPage: false }).catch(() => undefined);
      const kopMeer = page.locator('.google-mail-reader details.google-mail-reader-more > summary').first();
      if (await kopMeer.isVisible().catch(() => false)) await kopMeer.click({ timeout: 5000 }).catch(() => undefined);
      else await page.locator('.google-mail-reader .mail-reader-onderbalk [data-onderbalk-meer]').first().click({ timeout: 5000 }).catch(() => undefined);
      await pauze(page, 450);
      if (!(await page.locator('.google-mail-reader details.google-mail-reader-more[open]').count())) slecht.push(`${thema}: «Додаткові дії» van het leesvenster niet geopend`);
      metingen.push(...await meetKleuren(page, 'lezer-menu', '.google-mail-reader details.google-mail-reader-more[open] .mail-reader-overflow-panel', '[data-reader-action-id]'));
      if (thema === 'licht') await page.screenshot({ path: join(ctx.uit, `blok1-acties-kleuren-lezer-menu-${w}.png`), fullPage: false }).catch(() => undefined);
      await page.keyboard.press('Escape').catch(() => undefined); await pauze(page, 250);
      await sluitLezer(page);
    }
    // vergelijken: per actie één kleur over alle oppervlakken; prullenbak = --fout, archief = --info; pictogram ≥ 3:1
    const perId = new Map<string, Kleur[]>();
    for (const m of metingen) perId.set(m.id, [...(perId.get(m.id) || []), m]);
    for (const [id, lijst] of perId) {
      const kleuren = [...new Set(lijst.map((m) => m.kleur))];
      if (kleuren.length > 1) slecht.push(`${thema}: ${id} verschilt — ${kleuren.map((k) => `${lijst.filter((m) => m.kleur === k).map((m) => m.oppervlak).join('+')} ${k}`).join(' ≠ ')}`);
    }
    for (const [id, token] of [['trash', 'fout'], ['archive', 'info']] as const) for (const m of perId.get(id) || []) if (m.kleur !== tok[token]) slecht.push(`${thema}: ${id} in ${m.oppervlak} is ${m.kleur}, niet --${token} ${tok[token]}`);
    for (const m of metingen) if (m.contrast < 3) slecht.push(`${thema}: ${m.id} in ${m.oppervlak} contrast ${m.contrast}:1 (${m.kleur} op ${m.achter})`);
    if (!perId.has('trash') || !perId.has('archive')) slecht.push(`${thema}: «До кошика»/«Архівувати» niet gevonden (oppervlakken: ${[...new Set(metingen.map((m) => m.oppervlak))].join(', ')})`);
    detail[thema] = { tokens: tok, keuze, lezer: lezerOpenen[thema], metingen };
    regels.push(`${thema}: --fout ${tok.fout}, --info ${tok.info}, --muted ${tok.muted}`);
    for (const [id, lijst] of [...perId].sort()) regels.push(`  ${id.padEnd(16)} ${[...new Set(lijst.map((m) => `${m.oppervlak}:${m.kleur.replace(/\s/g, '')}`))].join('  ')}`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  const uniek = [...new Set(slecht)];
  ctx.meting('blok1-acties-kleuren', page, uniek.slice(0, 40).join('; '), JSON.stringify({ ...detail, problemen: uniek }));
  await samenvatting(page, `blok1-acties-kleuren · ${w} px`, [...regels, '', uniek.length ? `PROBLEMEN (${uniek.length}):` : 'Geen problemen: elke actie heeft één kleur op elk oppervlak; «До кошика» = --fout, «Архівувати» = --info.', ...uniek.slice(0, 60)]);
};

export const actiesStappen = (ctx: Blok1Ctx): Blok1Stap[] => [
  { naam: 'blok1-acties-rij', url: `${ctx.H('mail')}/postvak-in`, voor: (p) => mailNep(p, { dichtheid: 'minimum' }), na: rijStap(ctx) },
  { naam: 'blok1-acties-kleuren', url: `${ctx.H('mail')}/postvak-in`, voor: actiesNep, na: kleurenStap(ctx) },
];
