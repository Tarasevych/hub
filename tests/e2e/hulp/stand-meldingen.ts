// Stand (21.10.2026, агент A): панель сповіщень з багатьма сповіщеннями + розташування FAB «Новий лист» відносно дзвоника.
// Скарга власника (390 px): шапка/фільтри/кнопки панелі займали весь екран — для списку лишалась смужка ~100 px; FAB пошти «стрибав»
// то зліва від дзвоника, то над ним. Кроки:
//   mail-meldingen-paneel-vol  — 36 серверних сповіщень у базі, відкрита панель; вимір висоти списку (видима частина) і частки екрана.
//   mail-meldingen-fab-bel     — координати FAB і дзвоника: після завантаження, серія вимірів (чи не стрибає), після відкриття/закриття
//                                панелі, після перетягування дзвоника на місце FAB (FAB має ухилитися), після «Повернути в кут».
// 25.10.2026: дзвоник і «Написати» мають кожен своє гніздо в зоні (shared/plaatsing.ts): дзвоник у стос → обидва в стосі без накладання;
//                                «Повернути на типове місце» (раніше «Повернути в кут»); на телефоні дзвоник у шапці меню.
// Усе локально: сповіщення через backend/melder (той самий процес, що й сервер стенду), пошта — через page.route (stand-mail-nep).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { meld } from '../../../backend/melder';

type Page = import('playwright-core').Page;
type Box = { left: number; top: number; width: number; height: number; right: number; bottom: number };
export type MeldCtx = { uid: () => string; uit: string; zeg: (s: string) => void; meting: (naam: string, p: Page, slecht: string, detail: string) => void };

let gezaaid = false;
/** 36 сповіщень особистих типів (видимі в поштовому просторі), різні розділи/стани, частина з посиланням. */
export async function zaaiMeldingen(uid: string): Promise<number> {
  if (gezaaid || !uid) return 0;
  gezaaid = true;
  const soorten = ['security_warning', 'workspace_share', 'access_decision', 'ondersteuning', 'security', 'access_method_restored'];
  // Різні тексти (групування в панелі зливає однакові без цифр — тоді з 36 лишилося б 6 рядків).
  const що = ['новий вхід з пристрою', 'доступ до теки', 'запит на доступ', 'перегляд облікового запису', 'зміна ключа входу', 'відновлення способу входу'];
  const де = ['Pixel', 'MacBook', 'Windows ПК', 'iPad', 'Chromebook', 'Linux-ноутбук'];
  for (let i = 0; i < 36; i++) {
    const soort = soorten[i % soorten.length];
    await meld(uid, soort, `${що[i % 6]} — ${де[Math.floor(i / 6) % 6]} (${['Київ', 'Брюссель', 'Львів', 'Гент', 'Одеса', 'Антверпен'][(i + Math.floor(i / 6)) % 6]})`,
      `Подробиці сповіщення ${i + 1}. Текст достатньо довгий, щоб показати перенесення рядків у панелі на телефоні.`, i % 3 === 0 ? '/postvak-in' : undefined);
  }
  return 36;
}

const meetPaneel = (p: Page) => p.evaluate(() => {
  const r = (el: Element | null) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
  const q = (s: string) => document.querySelector(s);
  const paneel = q('.canonical-notification-panel'), lijst = q('.canonical-notification-panel .cnc-list');
  const pb = paneel?.getBoundingClientRect(), lb = lijst?.getBoundingClientRect();
  // Видима висота списку: перетин списку з панеллю і з екраном.
  const zicht = pb && lb ? Math.max(0, Math.round(Math.min(lb.bottom, pb.bottom, innerHeight) - Math.max(lb.top, pb.top, 0))) : 0;
  const rijen = [...document.querySelectorAll('.canonical-notification-panel .cnc-row')];
  const zichtbaar = lb ? rijen.filter((e) => { const b = e.getBoundingClientRect(); return b.bottom > lb.top + 4 && b.top < Math.min(lb.bottom, innerHeight) - 4; }).length : 0;
  const voet = q('.canonical-notification-panel>footer');
  return { vw: innerWidth, vh: innerHeight, paneel: r(paneel), kop: r(q('.canonical-notification-panel>header')), tools: r(q('.canonical-notification-panel .cnc-tools')), voet: voet && getComputedStyle(voet).display !== 'none' ? r(voet) : null, lijst: r(lijst), lijstZichtbaar: zicht, aandeel: Math.round((zicht / innerHeight) * 100), rijen: rijen.length, rijenInBeeld: zichtbaar, scrollWidth: document.documentElement.scrollWidth };
});

/** 25.10.2026: op de telefoon staat de bel in de kop van het menu (zones, shared/plaatsing.ts) — eerst de lade openen. */
export const belInBeeld = async (p: Page) => {
  const bel = p.locator("[data-qa-id='canonical-notification-bell']").first();
  if (await bel.isVisible().catch(() => false)) return bel;
  const menu = p.locator(".canonical-sidebar .canonical-menu-toggle[data-sidebar-action='open-drawer']").first();
  if (await menu.isVisible().catch(() => false)) { await menu.click({ timeout: 5000 }); await p.waitForTimeout(500); }
  return bel;
};
const openPaneel = async (p: Page) => {
  const bel = await belInBeeld(p);
  await bel.waitFor({ timeout: 15000 });
  let bedekt = '';
  if ((await bel.getAttribute('aria-expanded')) !== 'true') {
    // Echte klik op het midden; lukt dat niet (iets ligt op de bel, bv. de FAB), dan noteren en via DOM openen.
    await bel.click({ timeout: 3000 }).catch(async () => {
      bedekt = await bel.evaluate((el) => { const b = el.getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return t && !el.contains(t) ? `${t.tagName.toLowerCase()}.${String((t.closest('[class]') as HTMLElement | null)?.className || '').split(' ')[0]}` : 'onbekend'; });
      await bel.evaluate((el) => (el as HTMLElement).click());
    });
  }
  await p.locator('.canonical-notification-panel').first().waitFor({ timeout: 5000 });
  await p.waitForTimeout(700);
  return bedekt;
};

export const paneelVol = (c: MeldCtx) => async (p: Page) => {
  // Сповіщення сервер віддає при завантаженні сторінки: засіяти до першого відкриття, далі перезавантажити.
  if (await zaaiMeldingen(c.uid())) { await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500); }
  await openPaneel(p);
  // Дочекатися, доки список заповниться (серверні сповіщення приходять окремим запитом).
  await p.waitForFunction(() => document.querySelectorAll('.canonical-notification-panel .cnc-row').length >= 20, null, { timeout: 15000 }).catch(() => undefined);
  await p.waitForTimeout(400);
  const m = await meetPaneel(p);
  const v = p.viewportSize();
  await p.screenshot({ path: join(c.uit, `mail-meldingen-paneel-vol-${v?.width}-scherm.png`), fullPage: false }).catch(() => undefined);
  writeFileSync(join(c.uit, `meting-meldingen-paneel-${v?.width}.json`), JSON.stringify(m, null, 1));
  const slecht = [
    ...(m.rijen < 20 ? [`te weinig rijen: ${m.rijen}`] : []),
    ...((v?.width || 0) <= 560 && m.aandeel < 70 ? [`lijst ${m.lijstZichtbaar}px = ${m.aandeel}% van ${m.vh}px (< 70%)`] : []),
    ...(m.scrollWidth > m.vw ? [`horizontale overloop ${m.scrollWidth} > ${m.vw}`] : []),
  ].join('; ');
  c.meting('mail-meldingen-paneel-vol', p, slecht, JSON.stringify(m));
  // Telefoon: menu «⋯» en uitklapper «Фільтри» — knipsel van elk, daarna dicht (het paneel zelf blijft open voor het standaardknipsel).
  for (const [qa, naam] of [['melding-meer', 'meer'], ['melding-filters', 'filters']] as const) {
    const k = p.locator(`[data-qa-id='${qa}']`).first();
    if (!(await k.isVisible().catch(() => false))) continue;
    await k.click({ timeout: 3000 }); await p.waitForTimeout(350);
    const open = await p.evaluate((q) => { const b = document.querySelector(`[data-qa-id='${q}']`); const id = b?.getAttribute('aria-controls') || ''; const el = id ? document.getElementById(id) : null; const r = el?.getBoundingClientRect(); return { expanded: b?.getAttribute('aria-expanded'), zichtbaar: !!el && getComputedStyle(el).display !== 'none', hoogte: Math.round(r?.height || 0), knoppen: el ? [...el.querySelectorAll('button')].map((x) => `${(x.textContent || '').trim()} ${Math.round(x.getBoundingClientRect().height)}px`) : [] }; }, qa);
    c.zeg(`   ${naam} open: ${JSON.stringify(open)}`);
    await p.screenshot({ path: join(c.uit, `mail-meldingen-paneel-vol-${v?.width}-${naam}.png`), fullPage: false }).catch(() => undefined);
    await k.click({ timeout: 3000 }); await p.waitForTimeout(250);
  }
};

const meetFabBel = (p: Page) => p.evaluate(() => {
  const r = (el: Element | null) => { if (!el) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
  return { fab: r(document.querySelector('[data-mail-compose-float]')), bel: r(document.querySelector("[data-qa-id='canonical-notification-bell']")), vw: innerWidth, vh: innerHeight };
});
const overlapt = (a: Box | null, b: Box | null) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const tekst = (b: Box | null) => (b ? `${b.left},${b.top} ${b.width}×${b.height}` : '—');

export const fabBel = (c: MeldCtx) => async (p: Page) => {
  const fab = p.locator('[data-mail-compose-float]').first();
  await fab.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw new Error('SKIP FAB «Новий лист» niet zichtbaar (geen mailaccount?)'); });
  await p.waitForTimeout(900);
  const v = p.viewportSize();
  const ladeDicht = async () => { if (await p.locator('.canonical-chrome.sidebar-drawer').count()) { await p.locator('.canonical-drawer-close').first().click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(400); } };
  const fasen: Array<{ fase: string; fab: Box | null; bel: Box | null }> = [];
  const neem = async (fase: string) => { const m = await meetFabBel(p); fasen.push({ fase, fab: m.fab, bel: m.bel }); return m; };
  await neem('na laden');
  // Serie: 10 metingen over 1,5 s — positie mag niet wisselen.
  const serie = new Set<string>();
  for (let i = 0; i < 10; i++) { const m = await meetFabBel(p); serie.add(tekst(m.fab)); await p.waitForTimeout(150); }
  // Paneel open → dicht.
  const bedekt0 = await openPaneel(p); await neem('paneel open');
  await p.keyboard.press('Escape'); await p.waitForTimeout(900); await ladeDicht(); await neem('paneel dicht');
  // 25.10.2026: de bel in de STAPEL zetten (slepen naar «Написати»): elk krijgt zijn eigen gniezdo — niets wijkt uit, niets overlapt.
  // Telefoon: lade open, vasthouden (0,6 s), slepen; computer: muis (slepen na 5 px).
  await ladeDicht();
  const smal = (v?.width || 0) <= 700;
  const fabVoor = (await meetFabBel(p)).fab;
  await belInBeeld(p);
  const belVoor = (await meetFabBel(p)).bel;
  if (fabVoor && belVoor) {
    const bx = belVoor.left + belVoor.width / 2, by = belVoor.top + belVoor.height / 2;
    const fx = fabVoor.left + fabVoor.width / 2, fy = fabVoor.top + fabVoor.height / 2;
    if (smal) {
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bx, y: by }] });
      await p.waitForTimeout(650);
      for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bx + ((fx - bx) * i) / 12, y: by + ((fy - by) * i) / 12 }] }); await p.waitForTimeout(20); }
      await p.waitForTimeout(200);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    } else {
      await p.mouse.move(bx, by); await p.mouse.down();
      for (let i = 1; i <= 10; i++) await p.mouse.move(bx + ((fx - bx) * i) / 10, by + ((fy - by) * i) / 10);
      await p.waitForTimeout(150); await p.mouse.up();
    }
    await p.waitForTimeout(900);
    await ladeDicht();
    await neem('bel in de stapel gesleept');
  }
  await p.screenshot({ path: join(c.uit, `mail-meldingen-fab-bel-${v?.width}-gesleept.png`), fullPage: false }).catch(() => undefined);
  // Terug naar de standaardplek via het paneel («Повернути на типове місце» in het menu «⋯»).
  const bedekt1 = await openPaneel(p);
  const meer = p.locator("[data-qa-id='melding-meer']").first();
  if (await meer.isVisible().catch(() => false)) { await meer.click({ timeout: 3000 }); await p.waitForTimeout(250); }
  const terug = await p.getByRole('button', { name: /Повернути на типове місце|Terug naar de standaardplek/ }).first().click({ timeout: 5000 }).then(() => true, async (e) => {
    const diag = await p.evaluate(() => { const b = [...document.querySelectorAll('.canonical-notification-panel button')].find((x) => /Повернути на типове місце|Terug naar de standaardplek/.test(x.textContent || '')); const r = b?.getBoundingClientRect(); const pr = document.querySelector('.canonical-notification-panel')?.getBoundingClientRect(); const t = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null; return { knop: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null, paneel: pr ? [Math.round(pr.left), Math.round(pr.top), Math.round(pr.width), Math.round(pr.height)] : null, opPunt: t ? `${t.tagName.toLowerCase()}.${String((t as HTMLElement).className || '').split(' ')[0]}` : null, vh: innerHeight }; });
    c.zeg(`   !! terug naar de standaardplek: ${String(e).slice(0, 220).replace(/\s+/g, ' ')} — ${JSON.stringify(diag)}`);
    await p.screenshot({ path: join(c.uit, `mail-meldingen-fab-bel-${v?.width}-terug-fout.png`) }).catch(() => undefined);
    return false;
  });
  if (!terug) {
    // Bel terugslepen, zodat volgende stappen de standaardplaats houden.
    const nu = await meetFabBel(p), b0 = fasen[0].bel;
    if (nu.bel && b0) { await p.keyboard.press('Escape'); await p.mouse.move(nu.bel.left + 24, nu.bel.top + 24); await p.mouse.down(); for (let i = 1; i <= 8; i++) await p.mouse.move(nu.bel.left + 24 + ((b0.left - nu.bel.left) * i) / 8, nu.bel.top + 24 + ((b0.top - nu.bel.top) * i) / 8); await p.mouse.up(); }
  }
  await p.waitForTimeout(300);
  if (await p.locator('.canonical-notification-panel').count()) { await p.keyboard.press('Escape'); }
  await p.waitForTimeout(900);
  await ladeDicht();
  await neem('terug in de hoek');
  await p.screenshot({ path: join(c.uit, `mail-meldingen-fab-bel-${v?.width}-scherm.png`), fullPage: false }).catch(() => undefined);
  const eerste = fasen[0], laatste = fasen[fasen.length - 1], dicht = fasen.find((f) => f.fase === 'paneel dicht');
  const slecht = [
    ...(bedekt0 ? [`bel niet klikbaar, bedekt door ${bedekt0}`] : []), ...(bedekt1 && !bedekt0 ? [`bel na slepen niet klikbaar, bedekt door ${bedekt1}`] : []),
    ...(terug ? [] : ['«Повернути на типове місце» niet bereikbaar']),
    ...fasen.filter((f) => overlapt(f.fab, f.bel)).map((f) => `overlap in «${f.fase}»: FAB ${tekst(f.fab)} / bel ${tekst(f.bel)}`),
    ...(serie.size > 1 ? [`FAB springt binnen 1,5 s: ${[...serie].join(' | ')}`] : []),
    ...(dicht && tekst(dicht.fab) !== tekst(eerste.fab) ? [`FAB na open/dicht anders: ${tekst(eerste.fab)} → ${tekst(dicht.fab)}`] : []),
    ...(tekst(laatste.fab) !== tekst(eerste.fab) ? [`FAB na «terug in de hoek» anders: ${tekst(eerste.fab)} → ${tekst(laatste.fab)}`] : []),
    ...fasen.filter((f) => f.fab && (f.fab.left < 0 || f.fab.top < 0 || f.fab.right > (v?.width || 0) || f.fab.bottom > (v?.height || 0))).map((f) => `FAB buiten beeld in «${f.fase}»`),
  ].join('; ');
  writeFileSync(join(c.uit, `meting-fab-bel-${v?.width}.json`), JSON.stringify({ fasen, serie: [...serie] }, null, 1));
  c.meting('mail-meldingen-fab-bel', p, slecht, fasen.map((f) => `${f.fase}: FAB ${tekst(f.fab)} bel ${tekst(f.bel)}`).join(' · '));
};
