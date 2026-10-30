// Stand (21.10.2026, агент «вікна/док»): док згорнутих вікон проти вікна згоди v2 («Підключення Claude»).
// Скарга власника (390 px, mcp.tarasevych.com): док («Відкриті вікна: 2» + розгорнутий список) лежав ПОВЕРХ вікна згоди й
// перекривав «Далі», «Заборонити», «Пізніше» і рядки дозволів; пересунути його було неможливо; відкрите вікно ще й значилося в доку.
// Кроки (STAND_FILTER=venster-dok):
//   venster-dok-consent   — на mail/accounts відкрити 2 вікна підключення пошти (Gmail + ще одне) і згорнути (вони живуть у
//                           «пам'яті вікон» на сервері, тож переходять на mcp.*), потім відкрити згоду v2 для claude і на кожному
//                           кроці (Підтвердження → Обліковий запис → Простір → Дозволи) взяти elementFromPoint у центрі кнопок
//                           «Далі», «Заборонити», «Пізніше», «Назад», «Дозволити»: має бути сама кнопка. Плюс: перетин доку з вікном,
//                           чи не дублюється відкрите вікно в списку доку.
//   venster-dok-slepen    — док: перетягнути вгору (pointer), перевірити збереження після reload, перетягнути до правого краю,
//                           клавіатурна альтернатива (кнопки «Перемістити …» у меню доку, Enter), повернути вниз; розкрити список
//                           (вгору, як меню) і вибрати вікно; Escape і дотик поза меню закривають; FAB/дзвоник/док не перетинаються.
//   venster-dok-z-opruimen — закрити тестові вікна (щоб наступні кроки повного проходу не мали доку).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Page = import('playwright-core').Page;
type Box = { left: number; top: number; width: number; height: number; right: number; bottom: number };
type Stap = { naam: string; url: string; voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void> };
export type DokCtx = {
  mailUrl: string; consentUrl: () => Promise<string>; uit: string;
  zeg: (s: string) => void; meting: (naam: string, p: Page, slecht: string, detail: string) => void;
  voorMail?: (page: Page) => Promise<void>;
};

const SLEUTEL_DOK = 'mijn-ruimte-venster-dok-v1';
const overlapt = (a: Box | null, b: Box | null) => !!a && !!b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
const doos = (b: Box | null) => (b ? `${b.left},${b.top} ${b.width}×${b.height}` : '—');

/** Вікна підключення пошти: відкрити (плитка на /accounts) і згорнути. Повертає id відкритих вікон. */
async function tweeVensters(p: Page, c: DokCtx): Promise<string[]> {
  await p.locator('[data-mail-provider-knop="ja"]').first().waitFor({ timeout: 15000 });
  const ids = await p.$$eval('[data-mail-provider-knop="ja"]', (l) => l.map((e) => e.getAttribute('data-mail-provider') || ''));
  const kies = ['gmail', ...ids.filter((x) => x && x !== 'gmail')].slice(0, 2);
  for (const a of kies) {
    const id = `mail-koppelen:${a}`;
    const al = await p.locator(`.venster[data-venster="${id}"]`).count();
    if (!al) {
      await p.locator(`[data-mail-provider="${a}"][data-mail-provider-knop="ja"]`).first().click({ timeout: 8000 });
      await p.locator(`.venster[data-venster="${id}"]`).first().waitFor({ state: 'attached', timeout: 8000 });
      await p.waitForTimeout(500);
    }
    const min = p.locator(`.venster[data-venster="${id}"]:not([hidden]) [data-venster-knop="min"]`).first();
    if (await min.isVisible().catch(() => false)) { await min.click({ timeout: 5000 }); await p.waitForTimeout(400); }
  }
  // «Пам'ять вікон» шле зміни на сервер пакетом (300 мс).
  await p.waitForTimeout(1200);
  c.zeg(`   dok: vensters ${kies.join(', ')} geopend en geminimaliseerd`);
  return kies.map((a) => `mail-koppelen:${a}`);
}

/** Виміри в сторінці: кнопки нижнього ряду майстра (elementFromPoint), док, вікно, FAB, дзвоник. */
const meet = (p: Page) => p.evaluate(() => {
  const r = (el: Element | null): Box | null => {
    if (!el) return null; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const b = el.getBoundingClientRect(); if (b.width < 1 || b.height < 1) return null;
    return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) };
  };
  const wie = (el: Element | null) => {
    if (!el) return 'niets';
    const k = el.closest('nav.venster-dok') ? 'DOK' : el.closest('.venster[data-venster]') ? `venster:${el.closest('.venster[data-venster]')!.getAttribute('data-venster')}` : 'pagina';
    const h = el as HTMLElement;
    return `${k} ${el.tagName.toLowerCase()}${h.className && typeof h.className === 'string' ? '.' + h.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''} «${(h.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}»`;
  };
  const wiz = document.querySelector('[data-v2-wizard]');
  const knoppen = [...document.querySelectorAll('.v2-wizard-acties button')].map((b) => {
    const box = r(b);
    const tekst = ((b as HTMLElement).innerText || b.textContent || '').trim().replace(/\s+/g, ' ');
    if (!box) return { tekst, box, raak: false, boven: 'onzichtbaar' };
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return { tekst, box, raak: false, boven: 'buiten-beeld' };
    const hit = document.elementFromPoint(cx, cy);
    return { tekst, box, raak: !!hit && b.contains(hit), boven: wie(hit) };
  });
  const dok = document.querySelector('nav.venster-dok');
  const venster = document.querySelector('.venster[data-venster="mcp-toestemming"]');
  const items = [...document.querySelectorAll('nav.venster-dok [data-dok-venster]')].filter((e) => !!r(e)).map((e) => ({ id: e.getAttribute('data-dok-venster'), huidig: e.getAttribute('aria-current'), tekst: ((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim() }));
  const boven = document.querySelector('.venster[data-bovenaan="1"]:not([hidden])')?.getAttribute('data-venster') || '';
  const kop = document.querySelector('nav.venster-dok .venster-dok-kop');
  const menuId = kop?.getAttribute('aria-controls') || '';
  return {
    vw: innerWidth, vh: innerHeight, stap: wiz?.getAttribute('data-v2-stap') || '', knoppen,
    dok: r(dok), dokRand: dok?.getAttribute('data-dok-rand') || '', dokVorm: dok?.getAttribute('data-dok-vorm') || '', dokZ: dok ? getComputedStyle(dok).zIndex : '',
    dokOpen: kop?.getAttribute('aria-expanded') || '', menu: r(menuId ? document.getElementById(menuId) : dok?.querySelector('ul') || null), kop: r(kop),
    venster: r(venster), vensterInhoud: r(venster?.querySelector('.venster-inhoud') || null), voet: r(venster?.querySelector('.v2-wizard-acties') || null),
    items, boven, dubbel: items.some((i) => i.id && i.id === boven && i.huidig !== 'true'),
    fab: r(document.querySelector('[data-mail-compose-float]')), bel: r(document.querySelector("[data-qa-id='canonical-notification-bell']")),
    reserve: getComputedStyle(document.documentElement).getPropertyValue('--venster-dok-onder').trim(),
    opslag: (() => { try { return localStorage.getItem('mijn-ruimte-venster-dok-v1'); } catch { return null; } })(),
  };
});
type Meting = Awaited<ReturnType<typeof meet>>;

const NAAR: Record<string, RegExp> = { Далі: /^(Далі|Volgende)/, Заборонити: /^(Заборонити|Weigeren)/, Пізніше: /^(Пізніше|Later)/, Назад: /(Назад|Terug)/, Дозволити: /(Дозволити|Toestaan)/ };

export function dokStappen(c: DokCtx): Stap[] {
  const accounts = c.mailUrl.replace(/\/[^/]*$/, '/accounts');
  const schoonDok = async (p: Page) => { await p.evaluate((k) => { try { localStorage.removeItem(k); } catch { /* geen opslag */ } }, SLEUTEL_DOK).catch(() => undefined); };

  const consent = async (p: Page) => {
    const v = p.viewportSize(); const w = v?.width || 0;
    await schoonDok(p);
    await tweeVensters(p, c);
    const lang = (await p.evaluate(() => document.documentElement.lang).catch(() => 'uk')) === 'nl' ? 'nl' : 'uk';
    const u = await c.consentUrl();
    await p.goto(`${u}&lang=${lang}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const wiz = p.locator('[data-v2-wizard]');
    await wiz.waitFor({ timeout: 20000 });
    await p.locator('nav.venster-dok').first().waitFor({ timeout: 10000 }).catch(() => c.zeg('   !! dok verscheen niet op mcp (vensters niet hersteld?)'));
    await p.waitForTimeout(1200);
    const metingen: Meting[] = [];
    const slecht: string[] = [];
    for (let n = 0; n < 6; n++) {
      const m = await meet(p);
      metingen.push(m);
      await p.screenshot({ path: join(c.uit, `venster-dok-consent-${w}${lang === 'nl' ? '-nl' : ''}-${n + 1}-${m.stap}.png`), fullPage: false }).catch(() => undefined);
      for (const k of m.knoppen) if (!k.raak) slecht.push(`${m.stap}: «${k.tekst}» bedekt door ${k.boven}`);
      if (overlapt(m.dok, m.venster)) slecht.push(`${m.stap}: dok ${doos(m.dok)} overlapt venster ${doos(m.venster)}`);
      if (m.dubbel) slecht.push(`${m.stap}: open venster «${m.boven}» staat ook als gewoon item in het dok`);
      if (m.stap === 'rechten') break;
      // Echte klik in het midden van «Далі» (wat de mens doet). Ving iets anders de klik, dan via de DOM verder.
      const k = m.knoppen.find((x) => NAAR.Далі.test(x.tekst));
      if (!k?.box) { slecht.push(`${m.stap}: geen «Далі»`); break; }
      const voor = m.stap;
      if (m.stap === 'ruimte') { const kaart = wiz.locator('.v2-ruimte-kaart input').first(); if (await kaart.count()) await kaart.check().catch(() => undefined); }
      await p.mouse.click(k.box.left + k.box.width / 2, k.box.top + k.box.height / 2);
      await p.waitForTimeout(500);
      if ((await wiz.getAttribute('data-v2-stap')) === voor) {
        slecht.push(`${voor}: echte klik op «Далі» bereikte de knop niet`);
        await wiz.getByRole('button', { name: NAAR.Далі }).first().evaluate((b) => (b as HTMLElement).click());
        await p.waitForTimeout(500);
      }
    }
    const laatste = metingen[metingen.length - 1];
    if (laatste.stap !== 'rechten') slecht.push(`kwam niet bij «Дозволи» (stap ${laatste.stap})`);
    else if (!laatste.knoppen.some((k) => NAAR.Дозволити.test(k.tekst) && k.raak)) slecht.push('rechten: «Дозволити» niet raak');
    writeFileSync(join(c.uit, `dok-fasen-consent-${w}${lang === 'nl' ? '-nl' : ''}.json`), JSON.stringify(metingen, null, 1));
    c.meting(`venster-dok-consent${lang === 'nl' ? '-nl' : ''}`, p, [...new Set(slecht)].join('; '),
      metingen.map((m) => `${m.stap}: ${m.knoppen.map((k) => `${k.tekst}=${k.raak ? 'raak' : `✗(${k.boven})`}`).join(', ')} | dok ${m.dokRand || '?'}/${m.dokVorm || '?'} ${doos(m.dok)} open=${m.dokOpen} items=[${m.items.map((i) => i.id).join(',')}] venster ${doos(m.venster)}`).join(' · '));
  };

  const slepen = async (p: Page) => {
    const v = p.viewportSize(); const w = v?.width || 0, h = v?.height || 0;
    const nl = (await p.evaluate(() => document.documentElement.lang).catch(() => 'uk')) === 'nl' ? '-nl' : '';
    // Altijd twee geminimaliseerde vensters (een vorige stap kan er een gesloten hebben — de stand drukt Escape na elke stap).
    await schoonDok(p);
    await p.goto(accounts, { waitUntil: 'domcontentloaded', timeout: 45000 }); await tweeVensters(p, c);
    await p.goto(c.mailUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(1500);
    await p.locator('nav.venster-dok').first().waitFor({ timeout: 10000 });
    await p.waitForTimeout(900);
    const fasen: Array<{ fase: string; m: Meting }> = [];
    const neem = async (fase: string) => { const m = await meet(p); fasen.push({ fase, m }); await p.screenshot({ path: join(c.uit, `venster-dok-slepen-${w}${nl}-${fasen.length}-${fase.replace(/[^a-z0-9]+/gi, '-')}.png`), fullPage: false }).catch(() => undefined); return m; };
    const slecht: string[] = [];
    const sleep = async (van: Box, naar: { x: number; y: number }) => {
      const gr = await p.locator('nav.venster-dok [data-dok-greep]').first().boundingBox().catch(() => null);
      const sx = gr ? gr.x + gr.width / 2 : van.left + van.width / 2, sy = gr ? gr.y + gr.height / 2 : van.top + van.height / 2;
      await p.mouse.move(sx, sy); await p.mouse.down();
      for (let i = 1; i <= 14; i++) await p.mouse.move(sx + ((naar.x - sx) * i) / 14, sy + ((naar.y - sy) * i) / 14);
      await p.mouse.up(); await p.waitForTimeout(600);
    };
    const m0 = await neem('start');
    if (m0.dokOpen === 'true') slecht.push('lijst van het dok staat standaard open');
    if (!m0.dok) { c.meting('venster-dok-slepen', p, 'geen dok', JSON.stringify(m0)); return; }
    if (m0.dok.bottom < h - 60) slecht.push(`dok staat niet onderaan: ${doos(m0.dok)}`);
    // 1) omhoog slepen
    await sleep(m0.dok, { x: w / 2, y: 40 });
    const m1 = await neem('na slepen omhoog');
    if (!m1.dok || m1.dok.top > h / 3) slecht.push(`slepen omhoog: dok niet bovenaan (${doos(m1.dok)}, rand ${m1.dokRand})`);
    if (!m1.opslag) slecht.push('positie van het dok niet bewaard (localStorage)');
    // 2) herladen: positie blijft
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.locator('nav.venster-dok').first().waitFor({ timeout: 10000 }).catch(() => undefined); await p.waitForTimeout(1500);
    const m2 = await neem('na herladen');
    if (!m2.dok || m2.dokRand !== m1.dokRand || Math.abs(m2.dok.top - (m1.dok?.top ?? -999)) > 4) slecht.push(`na herladen andere plaats: ${m1.dokRand} ${doos(m1.dok)} → ${m2.dokRand} ${doos(m2.dok)}`);
    // 3) naar de rechterrand (ander kant/hoek)
    if (m2.dok) await sleep(m2.dok, { x: w - 10, y: h / 2 });
    const m3 = await neem('na slepen naar rechts');
    if (!m3.dok || m3.dok.right < w - 60 || m3.dokRand !== 'rechts') slecht.push(`slepen naar rechts: ${m3.dokRand} ${doos(m3.dok)}`);
    // 4) toetsenbord / één aanwijzer: menu open (Enter), «Перемістити ліворуч» (Enter)
    const kop = p.locator('nav.venster-dok .venster-dok-kop').first();
    await kop.focus().catch(() => undefined); await p.keyboard.press('Enter'); await p.waitForTimeout(350);
    const links = p.locator('nav.venster-dok [data-dok-naar="links"], [data-dok-menu] [data-dok-naar="links"]').first();
    if (await links.count()) { await links.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(500); } else slecht.push('geen knop «Перемістити ліворуч» (toetsenbordalternatief)');
    const m4 = await neem('na toets links');
    if (m4.dokRand !== 'links' || !m4.dok || m4.dok.left > 60) slecht.push(`toets links: ${m4.dokRand} ${doos(m4.dok)}`);
    // 5) terug naar beneden (klik op «Перемістити вниз»)
    await kop.click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(350);
    const onder = p.locator('[data-dok-naar="onder"]').first();
    if (await onder.count()) { await onder.click({ timeout: 3000 }); await p.waitForTimeout(500); } else slecht.push('geen knop «Перемістити вниз»');
    const m5 = await neem('terug onder');
    if (m5.dokRand !== 'onder') slecht.push(`terug onder: ${m5.dokRand}`);
    // 6) lijst openen (als menu omhoog) en een venster kiezen
    await kop.click({ timeout: 3000 }); await p.waitForTimeout(400);
    const m6 = await neem('menu open');
    if (m6.dokOpen !== 'true' || !m6.menu) slecht.push('menu ging niet open');
    else if (m6.kop && m6.menu.bottom > m6.kop.top + 2) slecht.push(`menu opent niet omhoog: menu ${doos(m6.menu)} kop ${doos(m6.kop)}`);
    const doel = m6.items.find((i) => i.id?.startsWith('mail-koppelen:gmail'))?.id || m6.items[0]?.id;
    if (doel) {
      await p.locator(`[data-dok-venster="${doel}"]`).first().click({ timeout: 3000 }); await p.waitForTimeout(600);
      const m7 = await neem('venster gekozen');
      if (m7.boven !== doel) slecht.push(`gekozen venster ${doel} staat niet bovenaan (${m7.boven || 'geen'})`);
      if (m7.dokOpen === 'true') slecht.push('menu bleef open na de keuze');
      if (m7.dubbel) slecht.push('open venster staat ook als gewoon item in het dok');
    } else slecht.push('geen items in het dok');
    // 7) Escape sluit het menu, focus terug op de kop (het dok is er nog: het andere venster is nog geminimaliseerd)
    if (!(await p.locator('nav.venster-dok').count())) slecht.push('dok verdween na de keuze terwijl er nog een geminimaliseerd venster is');
    await kop.click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(300);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const na = await p.evaluate(() => ({ open: document.querySelector('nav.venster-dok .venster-dok-kop')?.getAttribute('aria-expanded'), focus: document.activeElement?.classList.contains('venster-dok-kop') }));
    if (na.open === 'true') slecht.push('Escape sloot het menu niet'); else if (!na.focus) slecht.push('na Escape staat de focus niet op de dokknop');
    // 8) tik buiten het menu sluit het (op de titelbalk van het open venster, anders bovenaan de pagina)
    await kop.click({ timeout: 3000 }).catch(() => undefined); await p.waitForTimeout(300);
    const buiten = await p.evaluate(() => { const g = document.querySelector('.venster[data-bovenaan="1"]:not([hidden]) .venster-titel'); const b = g?.getBoundingClientRect(); if (!b) return null; const x = b.left + Math.min(b.width / 2, 60), y = b.top + b.height / 2; const t = document.elementFromPoint(x, y); return t && !t.closest('nav.venster-dok') ? { x, y } : null; });
    await p.mouse.click(buiten ? buiten.x : Math.round(w / 2), buiten ? buiten.y : 6); await p.waitForTimeout(300);
    if ((await kop.getAttribute('aria-expanded').catch(() => '')) === 'true') slecht.push('tik buiten het menu sloot het niet');
    // FAB / bel / dok: geen overlap in welke fase ook
    for (const f of fasen) {
      if (overlapt(f.m.dok, f.m.bel)) slecht.push(`«${f.fase}»: dok ${doos(f.m.dok)} overlapt bel ${doos(f.m.bel)}`);
      if (overlapt(f.m.dok, f.m.fab)) slecht.push(`«${f.fase}»: dok ${doos(f.m.dok)} overlapt FAB ${doos(f.m.fab)}`);
      if (f.m.dok && (f.m.dok.left < 0 || f.m.dok.top < 0 || f.m.dok.right > w || f.m.dok.bottom > h)) slecht.push(`«${f.fase}»: dok buiten beeld ${doos(f.m.dok)}`);
    }
    writeFileSync(join(c.uit, `dok-fasen-slepen-${w}${nl}.json`), JSON.stringify(fasen, null, 1));
    c.meting(`venster-dok-slepen${nl}`, p, [...new Set(slecht)].join('; '), fasen.map((f) => `${f.fase}: dok ${f.m.dokRand || '?'} ${doos(f.m.dok)} open=${f.m.dokOpen} fab ${doos(f.m.fab)} bel ${doos(f.m.bel)}`).join(' · '));
    await schoonDok(p);
  };

  const opruimen = async (p: Page) => {
    for (let i = 0; i < 4; i++) {
      const id = await p.evaluate(() => document.querySelector('.venster[data-venster^="mail-koppelen:"]')?.getAttribute('data-venster') || '');
      if (!id) break;
      if (await p.locator(`.venster[data-venster="${id}"][hidden]`).count()) {
        const kop = p.locator('nav.venster-dok .venster-dok-kop').first();
        if ((await kop.getAttribute('aria-expanded').catch(() => '')) !== 'true' && !(await p.locator(`[data-dok-venster="${id}"]`).isVisible().catch(() => false))) await kop.click({ timeout: 3000 }).catch(() => undefined);
        await p.locator(`[data-dok-venster="${id}"]`).first().click({ timeout: 3000 }).catch(() => undefined);
        await p.waitForTimeout(400);
      }
      await p.locator(`.venster[data-venster="${id}"] [data-venster-knop="sluit"]`).first().click({ timeout: 3000 }).catch(() => undefined);
      await p.waitForTimeout(500);
    }
    await p.waitForTimeout(800);
    await schoonDok(p);
  };

  return [
    { naam: 'venster-dok-consent', url: accounts, na: consent },
    { naam: 'venster-dok-slepen', url: c.mailUrl, voor: c.voorMail, na: slepen },
    { naam: 'venster-dok-z-opruimen', url: accounts, na: opruimen },
  ];
}
