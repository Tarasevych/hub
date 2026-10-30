// Stand (21.10.2026, рецензент доступності WCAG 2.2 AA): клавіатурні сценарії + axe-core з ПОВНИМ набором правил
// (wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa) для відкритих меню й діалогів пошти. Кроки «a11y-*»:
//   a11y-meldingen   — дзвоник → панель сповіщень: фокус при відкритті/закритті, пастка фокусу на телефоні (повноекранний лист),
//                      меню «⋯» (#cnc-acties) і «Фільтри» (#cnc-extra) з клавіатури, Escape, лічильник непрочитаних (live).
//   a11y-fab-bel     — FAB «Новий лист» і дзвоник: доступні в Tab-порядку, видимий фокус (контраст обведення ≥ 3:1 до фону),
//                      prefers-reduced-motion (переміщення FAB без анімації).
//   a11y-opstellen   — «Новий лист» з клавіатури: фокус при відкритті, пастка Tab, Cc/Bcc (фокус не губиться), «⋯» і списки
//                      редактора (роль, стрілки/Home/End/Escape, повернення фокусу), підтвердження видалення (фокус на безпечній дії),
//                      індикатор чернетки (скільки разів змінюється live-регіон), Escape → фокус назад на FAB.
//   a11y-mail-rij    — «⋮» рядка листа: назва рядка в імені кнопки/меню, стрілки/Home/End/Escape, фокус після дії.
//   a11y-postvakken  — перемикач скриньок: меню з клавіатури, вибраний пункт (aria-checked), alt фото, Escape → кнопка.
//   a11y-accounts    — «Поштові акаунти»: імена кнопок з адресою, підтвердження «Відключити» (alertdialog, фокус на «Скасувати»,
//                      Escape), <details> «Чому недоступно?», логотипи декоративні.
// Після кожної дії записується document.activeElement (роль, ім'я, контейнер). Результат: meting-<крок>-<ширина>.json + toegankelijk-*.json.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mailNep, wachtOpLijst } from './stand-mail-nep';
import { mailAccountsRoutes, type AccCtx } from './stand-mail-accounts';
import { zaaiMeldingen } from './stand-meldingen';

type Page = import('playwright-core').Page;
type Stap = { naam: string; url: string; voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void> };
export type ToegCtx = {
  mailUrl: string; accountsUrl: string; uid: () => string; uit: string; axe: string; acc: AccCtx;
  zeg: (s: string) => void; meting: (naam: string, p: Page, slecht: string, detail: string) => void;
};
type Actief = { tag: string; rol: string; naam: string; qa: string; klasse: string; binnen: string; zichtbaar: boolean };
type Regel = { actie: string; actief: Actief; extra?: unknown };
type AxeV = { id: string; impact: string; nodes: number; doel: string[]; help: string };

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BEL = "[data-qa-id='canonical-notification-bell']";
const PANEEL = '.canonical-notification-panel';
const VENSTER = 'section.mail-new-message';
const FAB = '.mail-compose-float';
const MENU_KNOP = ".canonical-sidebar .canonical-menu-toggle[data-sidebar-action='open-drawer']";

/** Beschrijving van document.activeElement: rol, benaderde toegankelijke naam en in welke laag het staat. */
const actief = (p: Page): Promise<Actief> => p.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return { tag: el ? 'body' : 'geen', rol: '', naam: '', qa: '', klasse: '', binnen: 'body', zichtbaar: false };
  const tekst = (e: Element | null) => (e ? ((e as HTMLElement).innerText || e.textContent || '') : '').replace(/\s+/g, ' ').trim();
  const lb = el.getAttribute('aria-labelledby');
  const lbl = (el as HTMLInputElement).labels?.[0];
  const naam = (lb ? lb.split(/\s+/).map((i) => tekst(document.getElementById(i))).join(' ') : '') || el.getAttribute('aria-label') || (lbl ? tekst(lbl) : '') || tekst(el) || el.getAttribute('title') || el.getAttribute('placeholder') || '';
  const lagen: Array<[string, string]> = [['#cnc-acties', 'meldingen-meer'], ['#cnc-extra', 'meldingen-filters'], ['.canonical-notification-panel', 'meldingen-paneel'], ['.mail-compose-more-menu', 'opstellen-meer'], ['.mail-compose-dropdown-menu', 'opstellen-lijst'], ['.mail-nm-wis-vraag', 'opstellen-wisvraag'], ['section.mail-new-message', 'opstellen'], ['[data-mail-row-menu]', 'rij-menu'], ['.mail-account-badge-menu, .mail-account-switcher-menu', 'postvakken-menu'], ['[data-mail-ontkoppel-vraag]', 'ontkoppel-vraag'], ['.venster[data-venster]', 'venster'], ['.mail-compose-float', 'fab'], ["[data-qa-id='canonical-notification-bell']", 'bel']];
  const binnen = lagen.find(([s]) => el.closest(s))?.[1] || 'pagina';
  const r = el.getBoundingClientRect();
  return { tag: el.tagName.toLowerCase(), rol: el.getAttribute('role') || '', naam: naam.slice(0, 80), qa: el.getAttribute('data-qa-id') || [...el.attributes].find((a) => a.name.startsWith('data-nm-') || a.name.startsWith('data-mail-'))?.name || '', klasse: String(el.className || '').slice(0, 60), binnen, zichtbaar: r.width > 0 && r.height > 0 };
});

/** axe-core met de WCAG 2.2 AA-tags, beperkt tot de bestaande selectors. */
async function axeOp(p: Page, bron: string, sels: string[]): Promise<{ v: AxeV[]; doelen: string[] }> {
  if (!bron) return { v: [], doelen: [] };
  if (!(await p.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe !== 'undefined'))) await p.evaluate(bron).catch(() => undefined);
  return p.evaluate(async ({ sels, tags }) => {
    const doelen = sels.filter((s) => document.querySelector(s));
    if (!doelen.length) return { v: [], doelen };
    const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string; help: string; nodes: Array<{ target: string[] }> }> }> } };
    const r = await w.axe.run({ include: doelen.map((s) => [s]) }, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return { v: r.violations.map((x) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length, doel: x.nodes.slice(0, 4).map((n) => n.target.join(' ').slice(0, 140)) })), doelen };
  }, { sels, tags: AXE_TAGS });
}

/** Hoeveel focusbare elementen er in een laag zijn (voor het aantal Tab-drukken). */
const telFocus = (p: Page, sel: string) => p.evaluate((s) => [...(document.querySelector(s)?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable=true]') || [])].filter((e) => e.offsetParent !== null).length, sel);

/** Contrast (WCAG) tussen de focusrand en de achtergrond direct buiten het element; plus de rand zelf. */
const focusRand = (p: Page, sel: string) => p.evaluate((s) => {
  const el = document.querySelector(s) as HTMLElement | null;
  if (!el) return null;
  // rgb()/rgba() en color(srgb r g b / a) — de berekende waarde van color-mix() in Chrome
  const parse = (c: string) => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]; const s = c.match(/color\(srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.e-]+))?\)/); return s ? [+s[1] * 255, +s[2] * 255, +s[3] * 255, s[4] === undefined ? 1 : +s[4]] : null; };
  const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a: number[], b: number[]) => { const x = lum(a) + 0.05, y = lum(b) + 0.05; return Math.round((x > y ? x / y : y / x) * 100) / 100; };
  const bgVan = (e: Element | null): number[] => { while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.5) return c; e = e.parentElement; } return [255, 255, 255, 1]; };
  const meng = (v: number[], a: number[]) => [0, 1, 2].map((i) => v[i] * v[3] + a[i] * (1 - v[3]));
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  const breedte = parseFloat(cs.outlineWidth) || 0, af = parseFloat(cs.outlineOffset) || 0;
  // punt net buiten de focusrand (links-midden), het bovenste element dat niet het element zelf is
  const x = Math.max(0, r.left - af - breedte - 2), y = r.top + r.height / 2;
  const onder = document.elementsFromPoint(x, y).find((e) => e !== el && !el.contains(e)) || document.body;
  const achter = bgVan(onder);
  const rand = parse(cs.outlineColor) || [0, 0, 0, 0];
  const randOp = meng(rand, achter);
  const schaduw = cs.boxShadow;
  return { focusVisible: el.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} offset ${cs.outlineOffset}`, schaduw: schaduw === 'none' ? '' : schaduw.slice(0, 120), achter: `rgb(${achter.slice(0, 3).join(',')})`, contrastRandAchter: cs.outlineStyle === 'none' || breedte === 0 ? 0 : ratio(randOp, achter), contrastRandKnop: cs.outlineStyle === 'none' || breedte === 0 ? 0 : ratio(randOp, bgVan(el)) };
}, sel);

export function toegankelijkStappen(c: ToegCtx): Stap[] {
  const S = (naam: string, url: string, na: (p: Page, log: Regel[], slecht: string[], extra: Record<string, unknown>) => Promise<void>, voor: (p: Page) => Promise<void> = (p) => mailNep(p)): Stap => ({
    naam, url, voor,
    na: async (p) => {
      const log: Regel[] = [], slecht: string[] = [], extra: Record<string, unknown> = {};
      try { await na(p, log, slecht, extra); } catch (e) { slecht.push(`uitzondering: ${String((e as Error).message || e).slice(0, 300)}`); }
      const v = p.viewportSize();
      const detail = { stap: naam, breedte: v?.width, slecht, log, ...extra };
      try { writeFileSync(join(c.uit, `toegankelijk-${naam}-${v?.width}.json`), JSON.stringify(detail, null, 1)); } catch { /* geen schijf */ }
      c.meting(naam, p, slecht.join('; '), JSON.stringify(detail));
    },
  });
  const druk = async (p: Page, log: Regel[], toets: string, label = toets, wacht = 180) => { await p.keyboard.press(toets); await p.waitForTimeout(wacht); const a = await actief(p); log.push({ actie: label, actief: a }); return a; };
  const focus = async (p: Page, log: Regel[], sel: string, label: string) => { await p.locator(sel).first().focus({ timeout: 5000 }); await p.waitForTimeout(120); const a = await actief(p); log.push({ actie: `focus ${label}`, actief: a }); return a; };
  const axe = async (p: Page, extra: Record<string, unknown>, sleutel: string, sels: string[], slecht: string[]) => {
    const r = await axeOp(p, c.axe, sels);
    extra[`axe:${sleutel}`] = r;
    // color-contrast is het domein van de UX-recensent (en wordt al per knipsel gemeten): hier apart geteld, niet als defect.
    const eigen = r.v.filter((x) => x.id !== 'color-contrast');
    if (eigen.length) slecht.push(`axe ${sleutel}: ${eigen.map((x) => `${x.id}(${x.impact},${x.nodes})`).join(', ')}`);
    return r;
  };
  const telefoon = (p: Page) => (p.viewportSize()?.width ?? 1280) <= 560;
  /** Tab N keer; telt hoe vaak de focus buiten de toegestane lagen komt. */
  const tabRonde = async (p: Page, log: Regel[], n: number, toegestaan: string[], shift = false) => {
    const buiten: Actief[] = [];
    for (let i = 0; i < n; i++) {
      await p.keyboard.press(shift ? 'Shift+Tab' : 'Tab'); await p.waitForTimeout(40);
      const a = await actief(p);
      if (!toegestaan.includes(a.binnen)) buiten.push(a);
    }
    log.push({ actie: `${shift ? 'Shift+' : ''}Tab ×${n}`, actief: await actief(p), extra: { buiten: buiten.length, eersteBuiten: buiten[0] || null } });
    return buiten;
  };

  return [
    // ---------------------------------------------------------------------------------------------- A. panel van meldingen
    S('a11y-meldingen', c.mailUrl, async (p, log, slecht, extra) => {
      if (await zaaiMeldingen(c.uid())) { await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500); }
      // 25.10.2026: de muis van een vorige stap kan op een menu-item met badge staan en zo zijn «bel» (sms-bellen) openen — weg ermee
      { const v = p.viewportSize() || { width: 1280, height: 800 }; await p.mouse.move(Math.round(v.width * 0.6), Math.round(v.height * 0.55)).catch(() => undefined); await p.waitForTimeout(300); }
      // 25.10.2026: op de telefoon staat de bel in de kop van het menu (zones, shared/plaatsing.ts) — de lade eerst openen (☰ met Enter)
      if (!(await p.locator(BEL).first().isVisible().catch(() => false)) && await p.locator(MENU_KNOP).first().isVisible().catch(() => false)) {
        await focus(p, log, MENU_KNOP, '☰'); await druk(p, log, 'Enter', 'Enter op ☰ (de bel staat in het menu)', 500);
      }
      await p.locator(BEL).first().waitFor({ timeout: 15000 });
      await focus(p, log, BEL, 'дзвоник');
      let a = await druk(p, log, 'Enter', 'Enter на дзвонику', 700);
      await p.waitForFunction(() => document.querySelectorAll('.canonical-notification-panel .cnc-row').length >= 10, null, { timeout: 15000 }).catch(() => undefined);
      if (a.binnen.startsWith('meldingen')) { /* goed */ } else slecht.push(`відкриття: фокус лишився на «${a.naam || a.tag}» (${a.binnen}), не в панелі`);
      extra.paneel = await p.evaluate((s) => { const el = document.querySelector(s); const kop = el?.querySelector('header small'); const live = el ? [...el.querySelectorAll('[aria-live],[role=status],[role=log]')].map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute('role') || ''}|${e.getAttribute('aria-live') || ''}] «${(e.textContent || '').trim().slice(0, 50)}»`) : []; const nav = el?.querySelector('.cnc-chips'); return { rol: el?.getAttribute('role'), modal: el?.getAttribute('aria-modal'), naam: el?.getAttribute('aria-label'), teller: kop?.textContent?.trim(), tellerLive: !!kop?.closest('[aria-live],[role=status]') || !!kop?.querySelector('[aria-live],[role=status]'), live, chipsRol: nav?.getAttribute('role'), chips: [...(nav?.querySelectorAll('button') || [])].map((b) => `${b.getAttribute('role') || 'button'}:${b.getAttribute('aria-pressed') ?? b.getAttribute('aria-selected') ?? '-'}`), pijlenTab: [...(el?.querySelectorAll('.ut-tabs-pijl') || [])].map((b) => b.getAttribute('tabindex')), voet: (() => { const f = el?.querySelector('#cnc-acties'); return f ? { rol: f.getAttribute('role'), naam: f.getAttribute('aria-label') } : null; })() }; }, PANEEL);
      const pn = extra.paneel as { tellerLive: boolean; pijlenTab: Array<string | null> };
      if (!pn.tellerLive) slecht.push('лічильник «Непрочитаних» не в live-регіоні');
      if (pn.pijlenTab.some((t) => t !== '-1')) slecht.push('стрілки прокрутки чипів у Tab-порядку');
      await axe(p, extra, 'paneel', [PANEEL], slecht);
      const n = Math.min(90, (await telFocus(p, PANEEL)) + 4);
      const buiten = await tabRonde(p, log, n, ['meldingen-paneel', 'meldingen-meer', 'meldingen-filters']);
      if (telefoon(p) && buiten.length) slecht.push(`телефон (повноекранна панель): Tab виходить за панель ${buiten.length}× (перший: «${buiten[0].naam}» у ${buiten[0].binnen})`);
      extra.tabBuiten = buiten.length;
      // Shift+Tab vanaf het EERSTE element van het paneel: op de telefoon moet de focus naar het laatste element van het paneel
      // (rond), niet naar de pagina eronder (vooruit Tab haalt het einde niet: 37 rijen × 3–4 knoppen).
      await p.evaluate((s) => { const el = document.querySelector(s); const f = el ? [...el.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((e) => e.offsetParent !== null && e.tabIndex >= 0) : []; f[0]?.focus(); }, PANEEL);
      const terug = await tabRonde(p, log, 3, ['meldingen-paneel', 'meldingen-meer', 'meldingen-filters'], true);
      extra.shiftTabBuiten = terug.length;
      if (telefoon(p) && terug.length) slecht.push(`телефон (повноекранна панель): Shift+Tab з першого елемента виходить за панель ${terug.length}× (перший: «${terug[0].naam}» у ${terug[0].binnen})`);
      if (telefoon(p)) {
        // «⋯»: фокус у меню, стрілки, Escape → «⋯»
        await focus(p, log, "[data-qa-id='melding-meer']", '«⋯»');
        a = await druk(p, log, 'Enter', 'Enter на «⋯»', 300);
        if (a.binnen !== 'meldingen-meer') slecht.push(`«⋯»: після відкриття фокус «${a.naam}» (${a.binnen}), не в меню`);
        const b = await druk(p, log, 'ArrowDown', 'ArrowDown у меню');
        if (b.binnen !== 'meldingen-meer' || b.naam === a.naam) slecht.push('«⋯»: стрілка вниз не переходить до наступної дії');
        await axe(p, extra, 'meer-open', [PANEEL], slecht);
        a = await druk(p, log, 'Escape', 'Escape у меню', 250);
        if (a.qa !== 'melding-meer') slecht.push(`«⋯»: Escape → фокус «${a.naam}», не на «⋯»`);
        // «Фільтри»: aria-expanded, Tab → пошук
        await focus(p, log, "[data-qa-id='melding-filters']", '«Фільтри»');
        await druk(p, log, 'Enter', 'Enter на «Фільтри»', 300);
        const exp = await p.locator("[data-qa-id='melding-filters']").getAttribute('aria-expanded');
        a = await druk(p, log, 'Tab', 'Tab після «Фільтри»');
        if (exp !== 'true') slecht.push('«Фільтри»: aria-expanded не true після відкриття');
        if (a.binnen !== 'meldingen-filters') slecht.push(`«Фільтри»: Tab веде на «${a.naam}» (${a.binnen}), не в розгорнуті фільтри`);
        await axe(p, extra, 'filters-open', [PANEEL], slecht);
      }
      // 25.10.2026: op de computer is het paneel niet-modaal — na Shift+Tab staat de focus al BUITEN het paneel (in de bovenbalk).
      // «Escape у панелі» meet dan niets van het paneel; daarom eerst terug in het paneel (de eerste knop), dán Escape.
      if (!['meldingen-paneel', 'meldingen-meer', 'meldingen-filters'].includes((await actief(p)).binnen)) {
        await p.evaluate((s) => { const el = document.querySelector(s); const f = el ? [...el.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((e) => e.offsetParent !== null && e.tabIndex >= 0) : []; f[0]?.focus(); }, PANEEL);
        log.push({ actie: 'focus terug in het paneel (eerste knop)', actief: await actief(p) });
      }
      a = await druk(p, log, 'Escape', 'Escape у панелі', 400);
      const dicht = !(await p.locator(PANEEL).count());
      if (!dicht) slecht.push('Escape не закрив панель');
      if (a.qa !== 'canonical-notification-bell') slecht.push(`Escape: фокус «${a.naam || a.tag}» (${a.binnen}), не на дзвонику`);
      // знову відкрити і закрити кнопкою «Згорнути панель»
      await focus(p, log, BEL, 'дзвоник');
      await druk(p, log, 'Enter', 'Enter на дзвонику', 600);
      const knop = p.locator(`${PANEEL} header button[aria-label*="Згорнути панель"], ${PANEEL} header button[aria-label*="inklappen"]`).last();
      if (await knop.count()) {
        await knop.focus(); a = await druk(p, log, 'Enter', 'Enter на «Згорнути панель»', 400);
        if (a.qa !== 'canonical-notification-bell') slecht.push(`«Згорнути панель»: фокус «${a.naam || a.tag}» (${a.binnen}), не на дзвонику`);
      }
      // 25.10.2026: één Esc = één laag. Paneel open + «bel» (sms-bellen) van een menu-item open via het toetsenbord: Esc sluit eerst
      // alleen die bel (het paneel blijft open), de volgende Esc het paneel (focus terug op de дзвоник).
      if (!telefoon(p)) {
        const item = "[data-heeft-bellen='ja']";
        if (await p.locator(item).first().isVisible().catch(() => false)) {
          const bellen = () => p.evaluate(() => !!document.querySelector('.menu-bellen'));
          const paneelOpen = async () => (await p.locator(PANEEL).count()) > 0;
          await focus(p, log, BEL, 'дзвоник'); await druk(p, log, 'Enter', 'Enter на дзвонику (laag-test)', 600);
          await focus(p, log, item, 'menu-item met badge');
          await p.waitForTimeout(400);
          const open1 = await bellen();
          a = await druk(p, log, 'ArrowRight', 'ArrowRight → in de «bel» van het item', 250);
          const inBel = await p.evaluate(() => !!document.activeElement?.closest('.menu-bellen'));
          a = await druk(p, log, 'Escape', 'Escape in de «bel» van het item', 400);
          const na1 = { bel: await bellen(), paneel: await paneelOpen(), focus: a.naam };
          a = await druk(p, log, 'Escape', 'tweede Escape', 400);
          const na2 = { bel: await bellen(), paneel: await paneelOpen(), focus: a.qa };
          extra.eenEscEenLaag = { open1, inBel, na1, na2 };
          if (!open1 || !inBel) slecht.push(`laag-test: de «bel» van het menu-item ging niet open via het toetsenbord (open ${open1}, focus erin ${inBel})`);
          else {
            if (na1.bel) slecht.push('één Esc = één laag: Esc in de «bel» van het item sloot die niet');
            if (!na1.paneel) slecht.push('één Esc = één laag: Esc in de «bel» van het item sloot ook het meldingenpaneel');
            if (na2.paneel) slecht.push('één Esc = één laag: de tweede Esc sloot het meldingenpaneel niet');
            if (na2.focus !== 'canonical-notification-bell') slecht.push(`één Esc = één laag: na de tweede Esc staat de focus niet op de дзвоник (${na2.focus || '-'})`);
          }
        }
      }
      // знову відкрити: панель має бути відкрита в кінці кроку для знімка
      await focus(p, log, BEL, 'дзвоник'); await druk(p, log, 'Enter', 'Enter на дзвонику (для знімка)', 600);
    }),

    // ---------------------------------------------------------------------------------------------- B. FAB en bel
    S('a11y-fab-bel', c.mailUrl, async (p, log, slecht, extra) => {
      await p.waitForFunction(() => !!document.querySelector('.mail-compose-float:not([disabled]):not(.is-wacht)'), null, { timeout: 25000 }).catch(() => undefined);
      await p.waitForTimeout(500);
      const volgorde: string[] = []; let fab = -1, bel = -1;
      for (let i = 0; i < 160 && (fab < 0 || bel < 0); i++) {
        await p.keyboard.press('Tab'); await p.waitForTimeout(30);
        const a = await actief(p); volgorde.push(`${a.binnen}:${a.naam.slice(0, 24)}`);
        if (a.binnen === 'fab' && fab < 0) { fab = i; extra.fabRand = await focusRand(p, FAB); }
        if (a.binnen === 'bel' && bel < 0) { bel = i; extra.belRand = await focusRand(p, BEL); }
      }
      // 25.10.2026: op de telefoon staat de bel in het menu: ☰ (Enter) en dan Tab binnen de lade
      if (bel < 0 && await p.locator(MENU_KNOP).first().isVisible().catch(() => false)) {
        await focus(p, log, MENU_KNOP, '☰'); await druk(p, log, 'Enter', 'Enter op ☰ (de bel staat in het menu)', 500);
        for (let i = 0; i < 20 && bel < 0; i++) {
          await p.keyboard.press('Tab'); await p.waitForTimeout(30);
          const a = await actief(p); volgorde.push(`lade/${a.binnen}:${a.naam.slice(0, 24)}`);
          if (a.binnen === 'bel') { bel = 100 + i; extra.belRand = await focusRand(p, BEL); extra.belViaMenu = true; }
        }
      }
      extra.tabVolgorde = volgorde;
      log.push({ actie: 'Tab-ronde', actief: await actief(p), extra: { fab, bel, stappen: volgorde.length } });
      if (fab < 0) slecht.push('FAB «Новий лист» недосяжна з Tab (160 натискань)');
      if (bel < 0) slecht.push('дзвоник недосяжний з Tab (160 натискань)');
      for (const [k, naam] of [['fabRand', 'FAB'], ['belRand', 'дзвоник']] as const) {
        const r = extra[k] as { focusVisible: boolean; contrastRandAchter: number; contrastRandKnop: number } | null | undefined;
        if (r && (!r.focusVisible || r.contrastRandAchter < 3)) slecht.push(`${naam}: видимий фокус ${r.focusVisible ? `контраст обведення до фону ${r.contrastRandAchter}:1 (< 3:1)` : 'не :focus-visible'}`);
      }
      extra.namen = await p.evaluate(({ f, b }) => ({ fab: document.querySelector(f)?.getAttribute('aria-label'), bel: document.querySelector(b)?.getAttribute('aria-label') }), { f: FAB, b: BEL });
      await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(200);
      extra.bewegingMinder = await p.evaluate((f) => { const el = document.querySelector(f); const cs = el ? getComputedStyle(el) : null; return { fabTransition: cs ? `${cs.transitionProperty} ${cs.transitionDuration}` : '', toastAnim: (() => { const t = document.querySelector('.canonical-notification-toast'); return t ? getComputedStyle(t).animationName : '(geen toast)'; })() }; }, FAB);
      const bm = extra.bewegingMinder as { fabTransition: string };
      if (/[1-9]/.test(bm.fabTransition.split(' ').slice(1).join(' '))) slecht.push(`prefers-reduced-motion: FAB рухається з анімацією (${bm.fabTransition})`);
      await p.emulateMedia({ reducedMotion: 'no-preference' });
      // знімок із фокусом на FAB
      await p.locator(FAB).first().focus().catch(() => undefined);
    }),

    // ---------------------------------------------------------------------------------------------- C. «Новий лист»
    S('a11y-opstellen', c.mailUrl, async (p, log, slecht, extra) => {
      await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^mijn-ruimte-mail-concept-v2:|^mail-draft/.test(k)) localStorage.removeItem(k); });
      await p.waitForFunction(() => !!document.querySelector('.mail-compose-float:not([disabled])'), null, { timeout: 25000 });
      await p.waitForTimeout(400);
      await focus(p, log, FAB, 'FAB');
      let a = await druk(p, log, 'Enter', 'Enter на FAB', 900);
      if (a.binnen !== 'opstellen' || a.tag !== 'input') slecht.push(`відкриття: фокус «${a.naam || a.tag}» (${a.binnen}), не в полі «Кому»`);
      extra.venster = await p.evaluate((s) => { const v = document.querySelector(s); const st = v?.querySelector('.mail-new-message-sync'); return { rol: v?.getAttribute('role'), modal: v?.getAttribute('aria-modal'), naam: v?.getAttribute('aria-label') || v?.getAttribute('aria-labelledby'), status: st ? `${st.getAttribute('role') || ''}|${st.getAttribute('aria-live') || ''}` : '', fout: v?.querySelector('.mail-new-message-error')?.getAttribute('role') ?? '(geen fout getoond)' }; }, VENSTER);
      await axe(p, extra, 'venster', [VENSTER], slecht);
      const n = Math.min(80, (await telFocus(p, VENSTER)) + 4);
      const vooruit = await tabRonde(p, log, n, ['opstellen', 'opstellen-meer', 'opstellen-lijst', 'opstellen-wisvraag']);
      if (vooruit.length) slecht.push(`Tab виходить із «Новий лист» ${vooruit.length}× (перший: «${vooruit[0].naam}» у ${vooruit[0].binnen})`);
      await p.locator(`${VENSTER} #mail-nm-aan`).focus().catch(() => undefined);
      const terug = await tabRonde(p, log, 3, ['opstellen', 'opstellen-meer', 'opstellen-lijst', 'opstellen-wisvraag'], true);
      if (terug.length) slecht.push(`Shift+Tab з «Кому» виходить із вікна (${terug[0].naam} у ${terug[0].binnen})`);
      // Cc/Bcc
      if (await p.locator(`${VENSTER} [data-nm-kopie]`).count()) {
        await focus(p, log, `${VENSTER} [data-nm-kopie]`, '«Cc/Bcc»');
        a = await druk(p, log, 'Enter', 'Enter на «Cc/Bcc»', 300);
        if (!(a.binnen === 'opstellen' && (a.tag === 'input' || a.qa === 'data-nm-kopie-dicht'))) slecht.push(`Cc/Bcc розгорнуто: фокус загубився («${a.naam || a.tag}», ${a.binnen})`);
        if (await p.locator(`${VENSTER} [data-nm-kopie-dicht]`).count()) {
          await focus(p, log, `${VENSTER} [data-nm-kopie-dicht]`, '«Згорнути Cc/Bcc»');
          a = await druk(p, log, 'Enter', 'Enter на «Згорнути Cc/Bcc»', 300);
          if (a.qa !== 'data-nm-kopie') slecht.push(`Cc/Bcc згорнуто: фокус «${a.naam || a.tag}» (${a.binnen}), не на «Cc/Bcc»`);
        }
      }
      // «⋯» редактора
      const meer = `${VENSTER} .mail-compose-more > button`;
      if (await p.locator(meer).count()) {
        await focus(p, log, meer, '«⋯» редактора');
        a = await druk(p, log, 'Enter', 'Enter на «⋯»', 400);
        if (a.binnen !== 'opstellen-meer') slecht.push(`«⋯» редактора: фокус «${a.naam || a.tag}» (${a.binnen}), не в меню`);
        // ↓ op een keuzelijst (lettertype) hoort de KEUZE te veranderen, niet de focus: dan Tab; elders ↓ = volgend element
        const b = await druk(p, log, a.tag === 'select' ? 'Tab' : 'ArrowDown', a.tag === 'select' ? 'Tab у «⋯» (фокус на списку)' : 'ArrowDown у «⋯»');
        if (b.binnen !== 'opstellen-meer' || b.naam === a.naam) slecht.push(`«⋯» редактора: ${a.tag === 'select' ? 'Tab' : 'ArrowDown'} не переходить до наступного пункту (фокус «${b.naam || b.tag}», ${b.binnen})`);
        if (a.tag === 'select') {
          // 3.2.2: een andere waarde kiezen met ↓ mag de focus niet wegtrekken (vroeger: applyTextStyle → view.focus())
          await p.locator('.mail-compose-more-menu select').first().focus();
          const c2 = await druk(p, log, 'ArrowDown', 'ArrowDown op «Шрифт» (waarde wisselen)');
          if (c2.tag !== 'select') slecht.push(`«⋯» редактора: waarde van «Шрифт» wisselen trekt de focus weg naar «${c2.naam || c2.tag}» (${c2.binnen})`);
        }
        extra.meerMenu = await p.evaluate(() => { const m = document.querySelector('.mail-compose-more-menu'); const t = document.querySelector('section.mail-new-message .mail-compose-more > button'); return { rol: m?.getAttribute('role'), naam: m?.getAttribute('aria-label'), haspopup: t?.getAttribute('aria-haspopup'), controls: t?.getAttribute('aria-controls'), menuitems: m?.querySelectorAll('[role=menuitem]').length, anders: m ? [...m.querySelectorAll('button, select, [role]')].filter((e) => !/^menuitem/.test(e.getAttribute('role') || '')).length : 0 }; });
        await axe(p, extra, 'meer-menu', ['.mail-compose-more-menu'], slecht);
        a = await druk(p, log, 'Escape', 'Escape у «⋯»', 300);
        const nogOpen = await p.locator(VENSTER).count();
        if (a.binnen !== 'opstellen' || !nogOpen) slecht.push(`«⋯» Escape: фокус «${a.naam || a.tag}» (${a.binnen}), вікно ${nogOpen ? 'відкрите' : 'ЗАКРИТЕ'}`);
      }
      // keuzelijst (computer)
      const lijst = `${VENSTER} .mail-compose-dropdown-trigger`;
      if (await p.locator(lijst).count()) {
        const t0 = await focus(p, log, lijst, 'список «Стиль»');
        extra.lijstTriggerNaam = t0.naam;
        a = await druk(p, log, 'Enter', 'Enter на списку', 400);
        if (a.binnen !== 'opstellen-lijst' || a.rol !== 'option') slecht.push(`список: фокус «${a.naam || a.tag}» (${a.binnen}, ${a.rol || a.tag}), не на option`);
        await druk(p, log, 'ArrowDown', 'ArrowDown у списку');
        const e = await druk(p, log, 'End', 'End у списку');
        const h = await druk(p, log, 'Home', 'Home у списку');
        if (e.naam === h.naam) slecht.push('список: Home/End не працюють');
        extra.lijstMenu = await p.evaluate(() => { const m = document.querySelector('.mail-compose-dropdown-menu'); return { rol: m?.getAttribute('role'), opties: [...(m?.querySelectorAll('[role=option]') || [])].map((o) => `${o.getAttribute('aria-selected')}|${o.getAttribute('tabindex') ?? 'tab'}`) }; });
        await axe(p, extra, 'lijst', ['.mail-compose-dropdown-menu'], slecht);
        a = await druk(p, log, 'Escape', 'Escape у списку', 300);
        if (!a.klasse.includes('mail-compose-dropdown-trigger')) slecht.push(`список Escape: фокус «${a.naam || a.tag}» (${a.binnen}), не на кнопці списку`);
      }
      // concept-indicator: hoe vaak verandert een live-regio tijdens typen?
      await p.evaluate((s) => { const w = window as unknown as { __a11yLive?: string[] }; w.__a11yLive = []; const v = document.querySelector(s); for (const r of v ? [...v.querySelectorAll('[aria-live],[role=status],[role=alert]')] : []) new MutationObserver(() => w.__a11yLive!.push((r.textContent || '').trim().slice(0, 80))).observe(r, { subtree: true, childList: true, characterData: true }); }, VENSTER);
      const onderwerp = p.locator(`${VENSTER} input`).filter({ hasNot: p.locator('[id=mail-nm-aan]') }).last();
      await p.locator(`${VENSTER} label:has(> span) input`).last().focus().catch(() => onderwerp.focus());
      for (const woord of ['Тест ', 'доступності ', 'чернетки']) { await p.keyboard.type(woord, { delay: 30 }); await p.waitForTimeout(1400); }
      extra.liveWijzigingen = await p.evaluate(() => (window as unknown as { __a11yLive?: string[] }).__a11yLive || []);
      extra.statusNa = await p.evaluate((s) => [...(document.querySelector(s)?.querySelectorAll('[aria-live],[role=status]') || [])].map((e) => `${e.getAttribute('role') || ''}|${e.getAttribute('aria-live') || ''}|${e.className}: «${(e.textContent || '').trim().slice(0, 60)}»`), VENSTER);
      if ((extra.liveWijzigingen as string[]).length > 3) slecht.push(`індикатор чернетки: live-регіон змінився ${(extra.liveWijzigingen as string[]).length}× за 3 паузи набору`);
      // wisvraag
      if (await p.locator(`${VENSTER} [data-nm-wis]`).count()) {
        await focus(p, log, `${VENSTER} [data-nm-wis]`, '«Видалити»');
        a = await druk(p, log, 'Enter', 'Enter на «Видалити»', 300);
        if (a.binnen !== 'opstellen-wisvraag') slecht.push(`підтвердження видалення: фокус «${a.naam || a.tag}» (${a.binnen}), не в питанні`);
        else if (!/Скасувати|Annuleren/.test(a.naam)) slecht.push(`підтвердження видалення: фокус на «${a.naam}», не на безпечній дії «Скасувати»`);
        await axe(p, extra, 'wisvraag', ['.mail-nm-wis-vraag'], slecht);
        const k = p.locator(`${VENSTER} .mail-nm-wis-vraag button`).last();
        if (await k.count()) { await k.focus(); a = await druk(p, log, 'Enter', 'Enter на «Скасувати»', 300); if (a.qa !== 'data-nm-wis') slecht.push(`«Скасувати»: фокус «${a.naam || a.tag}» (${a.binnen}), не на «Видалити»`); }
      }
      // Escape → згорнути, фокус назад
      await p.locator(`${VENSTER} #mail-nm-aan`).focus().catch(() => undefined);
      a = await druk(p, log, 'Escape', 'Escape у вікні', 600);
      if (a.binnen !== 'fab') slecht.push(`Escape (згорнути): фокус «${a.naam || a.tag}» (${a.binnen}), не на FAB`);
      // знову відкрити з клавіатури для знімка
      await p.locator(FAB).first().focus().catch(() => undefined); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
    }),

    // ---------------------------------------------------------------------------------------------- D. ⋮ van een rij
    S('a11y-mail-rij', c.mailUrl, async (p, log, slecht, extra) => {
      await wachtOpLijst(p);
      const rij = p.locator('.google-mail-row').first();
      await rij.hover().catch(() => undefined);
      const meer = rij.locator('.mail-row-actions-more').first();
      await meer.focus({ timeout: 5000 }); await p.waitForTimeout(150);
      const t0 = await actief(p); log.push({ actie: 'focus «⋮» eerste rij', actief: t0 });
      extra.rij = await p.evaluate(() => { const r = document.querySelector('.google-mail-row'); const g = r?.querySelector('.mail-row-hover-actions'); return { onderwerp: (r?.querySelector('[class*=subject], .mail-row-subject, strong')?.textContent || '').trim().slice(0, 60), groepRol: g?.getAttribute('role'), groepNaam: g?.getAttribute('aria-label'), meerNaam: r?.querySelector('.mail-row-actions-more')?.getAttribute('aria-label') }; });
      const rinfo = extra.rij as { meerNaam: string };
      if (!/[:—·]/.test(rinfo.meerNaam || '')) slecht.push(`«⋮»: ім'я «${rinfo.meerNaam}» без назви листа (однакове в кожному рядку)`);
      let a = await druk(p, log, 'Enter', 'Enter на «⋮»', 500);
      if (a.rol !== 'menuitem') slecht.push(`«⋮»: фокус «${a.naam || a.tag}» (${a.binnen}), не на першому пункті`);
      extra.menu = await p.evaluate(() => { const m = document.querySelector('[data-mail-row-menu]'); return { rol: m?.getAttribute('role'), naam: m?.getAttribute('aria-label'), items: m?.querySelectorAll('[role=menuitem]').length, secties: [...(m?.querySelectorAll('section') || [])].map((s) => `${s.getAttribute('role') || 'section'}|${s.getAttribute('aria-label') || ''}`) }; });
      const mi = extra.menu as { naam: string };
      if (!/[:—·]/.test(mi.naam || '')) slecht.push(`меню рядка: aria-label «${mi.naam}» без назви листа`);
      const b = await druk(p, log, 'ArrowDown', 'ArrowDown');
      const e = await druk(p, log, 'End', 'End');
      const h = await druk(p, log, 'Home', 'Home');
      if (b.naam === a.naam || e.naam === h.naam) slecht.push('меню рядка: стрілки/Home/End не рухають фокус');
      await axe(p, extra, 'rij-menu', ['[data-mail-row-menu]'], slecht);
      a = await druk(p, log, 'Escape', 'Escape', 300);
      if (!a.klasse.includes('mail-row-actions-more')) slecht.push(`Escape: фокус «${a.naam || a.tag}», не на «⋮»`);
      // дія без видалення рядка («Позначити прочитаним/непрочитаним» або «Додати зірочку») → фокус назад на «⋮»
      await druk(p, log, 'Enter', 'Enter на «⋮» знову', 500);
      for (let i = 0; i < 10; i++) { const x = await actief(p); if (/зірочк|прочитан|ster|gelezen/i.test(x.naam)) break; await p.keyboard.press('ArrowDown'); await p.waitForTimeout(80); }
      const keuze = await actief(p); log.push({ actie: 'вибрано пункт', actief: keuze });
      a = await druk(p, log, 'Enter', `Enter на «${keuze.naam.slice(0, 30)}»`, 700);
      if (a.tag === 'body') slecht.push(`після дії «${keuze.naam}»: фокус загубився (body)`);
      await axe(p, extra, 'rij-acties', ['.google-mail-row .mail-row-hover-actions'], slecht);
      // menu open laten voor het knipsel
      await meer.focus().catch(() => undefined); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    }),

    // ---------------------------------------------------------------------------------------------- E. mailboxkiezer
    S('a11y-postvakken', c.mailUrl, async (p, log, slecht, extra) => {
      await wachtOpLijst(p);
      const badge = p.locator('.mail-account-badge-trigger').first();
      const sel = (await badge.isVisible().catch(() => false)) ? '.mail-account-badge-trigger' : '.mail-account-switcher-trigger';
      // Computer: de kiezer zit in ServiceContextBar, die in deze indeling (CSS) verborgen is — dan geen defect, alleen een notitie.
      if (!(await p.locator(sel).first().isVisible().catch(() => false))) { extra.opmerking = 'geen zichtbare mailboxkiezer in deze indeling (ServiceContextBar verborgen); alleen bron/eenheidstest'; return; }
      const t0 = await focus(p, log, sel, 'кнопка скриньок');
      extra.trigger = { sel, naam: t0.naam };
      let a = await druk(p, log, 'Enter', 'Enter на кнопці', 500);
      if (!/^menuitem/.test(a.rol)) slecht.push(`меню скриньок: фокус «${a.naam || a.tag}» (${a.binnen}), не на пункті меню`);
      extra.menu = await p.evaluate(() => { const m = document.querySelector('.mail-account-badge-menu, .mail-account-switcher-menu'); return m ? { rol: m.getAttribute('role'), naam: m.getAttribute('aria-label') || m.getAttribute('aria-labelledby'), gekozen: [...m.querySelectorAll('[role=menuitemradio]')].map((x) => `${x.getAttribute('aria-checked')}|${(x.textContent || '').trim().slice(0, 40)}`), fotos: [...m.querySelectorAll('img')].map((i) => `alt=«${i.getAttribute('alt')}»`), kinderen: [...m.children].map((x) => `${x.tagName.toLowerCase()}[${x.getAttribute('role') || ''}]`) } : null; });
      const b = await druk(p, log, 'ArrowDown', 'ArrowDown');
      if (b.naam === a.naam || !/^menuitem/.test(b.rol)) slecht.push('меню скриньок: ArrowDown не рухає фокус');
      await druk(p, log, 'End', 'End'); await druk(p, log, 'Home', 'Home');
      await axe(p, extra, 'postvakken', ['.mail-account-badge-menu', '.mail-account-switcher-menu', '.mail-account-badge', '.mail-account-switcher'], slecht);
      a = await druk(p, log, 'Escape', 'Escape', 300);
      if (!a.klasse.includes('trigger')) slecht.push(`Escape: фокус «${a.naam || a.tag}» (${a.binnen}), не на кнопці скриньок`);
      await p.locator(sel).first().focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    }),

    // ---------------------------------------------------------------------------------------------- F. «Поштові акаунти»
    S('a11y-accounts', c.accountsUrl, async (p, log, slecht, extra) => {
      await p.locator('[data-mail-ontkoppel]').first().waitFor({ timeout: 20000 });
      await p.waitForTimeout(600);
      extra.namen = await p.evaluate(() => ({ ontkoppel: [...document.querySelectorAll('[data-mail-ontkoppel]')].map((b) => b.getAttribute('aria-label') || (b.textContent || '').trim()), opnieuw: [...document.querySelectorAll('[data-mail-opnieuw]')].map((b) => b.getAttribute('aria-label') || (b.textContent || '').trim()), nogEen: [...document.querySelectorAll('[data-mail-nog-een]')].map((b) => b.getAttribute('aria-label') || (b.textContent || '').trim()), logos: [...document.querySelectorAll('.mail-provider-logo > *, .mail-koppeling-kop > svg, .mail-koppeling-kop > span.merk')].map((e) => `${e.getAttribute('aria-hidden') ?? '-'}|${e.getAttribute('role') ?? ''}`) }));
      const nm = extra.namen as { ontkoppel: string[]; opnieuw: string[]; logos: string[] };
      if (nm.ontkoppel.some((x) => !x.includes('@'))) slecht.push(`«Відключити» без адреси в імені: ${[...new Set(nm.ontkoppel)].join(' / ')}`);
      if (nm.opnieuw.some((x) => !x.includes('@'))) slecht.push(`«Перепідключити» без адреси в імені: ${[...new Set(nm.opnieuw)].join(' / ')}`);
      if (nm.logos.some((x) => !x.startsWith('true'))) slecht.push(`логотипи не декоративні: ${nm.logos.filter((x) => !x.startsWith('true')).slice(0, 4).join(',')}`);
      await axe(p, extra, 'pagina', ['.mail-accounts-hub'], slecht);
      await focus(p, log, '[data-mail-ontkoppel]', '«Відключити» (перший)');
      let a = await druk(p, log, 'Enter', 'Enter на «Відключити»', 400);
      extra.vraag = await p.evaluate(() => { const v = document.querySelector('[data-mail-ontkoppel-vraag]'); return v ? { rol: v.getAttribute('role'), naam: v.getAttribute('aria-label') || v.getAttribute('aria-labelledby'), beschrijving: v.getAttribute('aria-describedby') } : null; });
      const vr = extra.vraag as { rol: string } | null;
      if (!vr || vr.rol !== 'alertdialog') slecht.push(`підтвердження: роль «${vr?.rol}», не alertdialog`);
      if (a.binnen !== 'ontkoppel-vraag' || !/Скасувати|Annuleren/.test(a.naam)) slecht.push(`підтвердження: фокус «${a.naam || a.tag}» (${a.binnen}), не на «Скасувати»`);
      await axe(p, extra, 'vraag', ['[data-mail-ontkoppel-vraag]'], slecht);
      a = await druk(p, log, 'Escape', 'Escape у підтвердженні', 300);
      const nogOpen = await p.locator('[data-mail-ontkoppel-vraag]').count();
      if (nogOpen || !a.qa.includes('data-mail-ontkoppel')) slecht.push(`Escape: питання ${nogOpen ? 'лишилось відкритим' : 'закрито'}, фокус «${a.naam || a.tag}»`);
      // details «Чому недоступно?»
      const sum = p.locator('.mail-provider-waarom > summary').first();
      if (await sum.count()) {
        await sum.focus(); a = await druk(p, log, 'Enter', 'Enter на «Чому недоступно?»', 250);
        const open = await p.locator('.mail-provider-waarom').first().evaluate((d) => (d as HTMLDetailsElement).open);
        if (!open) slecht.push('«Чому недоступно?» не розгортається з клавіатури');
      }
      // питання відкрите для знімка
      await p.locator('[data-mail-ontkoppel]').first().focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    }, (p) => mailAccountsRoutes(p, c.acc)),
  ];
}
