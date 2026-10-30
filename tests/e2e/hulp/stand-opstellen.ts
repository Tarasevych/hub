// Stand (21.10.2026, агент B): вікно «Новий лист» на телефоні — меню редактора поверх усього, квадратні кнопки, підказка
// прокрутки балки, шаблони на телефоні, Cc/Bcc згорнуто/розгорнуто, чернетка переживає перезавантаження вкладки.
// Лише loopback: Gmail-акаунт підставлено в браузері (page.route на /accounts — у стенді немає Google); чернетки йдуть на
// СПРАВЖНІЙ сервер стенду (POST /api/owner/mail/compose/draft/save → app.mail_drafts у базі стенду).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Page = import('playwright-core').Page;
type Stap = { naam: string; url: string; na?: (page: Page) => Promise<void> };

const ACC = '**/api/owner/mail/google-suite/accounts';
const VENSTER = 'section.mail-new-message';

export function opstelStappen(o: { mailUrl: string; uit: string; check: (naam: string, ok: boolean, info?: string) => void; zeg: (s: string) => void }): Stap[] {
  const metingen: Record<string, unknown> = {};
  const meet = async (p: Page, naam: string, waarde: unknown) => {
    const vp = p.viewportSize();
    const lang = await p.evaluate(() => document.documentElement.lang).catch(() => '?');
    metingen[`${naam}|${vp?.width}|${lang}`] = waarde;
    try { writeFileSync(join(o.uit, 'agB-metingen.json'), JSON.stringify(metingen, null, 1)); } catch { /* geen schijf: niet erg */ }
  };
  const telefoon = (p: Page) => (p.viewportSize()?.width ?? 1280) <= 500;

  /** Pagina met gesimuleerd Gmail-account, lokale concepten gewist (tenzij `wis:false`), venster «Новий лист» open. */
  const openVenster = async (p: Page, wis = true) => {
    await p.unroute(ACC).catch(() => undefined);
    await p.route(ACC, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ activeAccountId: 'stand-acc', accounts: [{ id: 'stand-acc', email: 'stand@example.test', status: 'connected' }] }) }));
    if (wis) await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^mijn-ruimte-mail-concept-v2:|^mail-draft/.test(k)) localStorage.removeItem(k); });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !!document.querySelector('.mail-compose-float:not([disabled])'), null, { timeout: 25000 });
    await p.waitForTimeout(400);
    await p.evaluate(() => window.dispatchEvent(new Event('mail:open-compose')));
    await p.locator(VENSTER).waitFor({ timeout: 10000 });
    await p.waitForTimeout(700);
  };
  const klaar = async (p: Page) => { await p.unroute(ACC).catch(() => undefined); };

  /** Alle zichtbare knoppen van het venster: maat, alleen-icoon, ovaal? */
  const knoppen = (p: Page) => p.evaluate((sel) => {
    const v = document.querySelector(sel); if (!v) return [];
    return [...v.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !b.closest('.ProseMirror'); })
      .map((b) => { const r = b.getBoundingClientRect(); const tekst = (b.textContent || '').trim(); return { naam: (b.getAttribute('aria-label') || tekst || b.className).slice(0, 40), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, icoon: !tekst || tekst.length <= 1, radius: getComputedStyle(b).borderRadius }; });
  }, VENSTER);

  /** Ligt het menu helemaal in beeld en is het BOVENSTE element op het midden van elk zichtbaar item (elementFromPoint)? */
  const menuBoven = (p: Page, sel: string) => p.evaluate((s) => {
    const m = document.querySelector(s) as HTMLElement | null;
    if (!m) return { gevonden: false, inBeeld: false, getest: 0, geraakt: 0, mis: [] as string[], rect: null as null | number[], z: '' };
    const r = m.getBoundingClientRect();
    const vw = window.visualViewport?.width ?? innerWidth, vh = window.visualViewport?.height ?? innerHeight;
    let getest = 0, geraakt = 0; const mis: string[] = [];
    for (const it of [...m.querySelectorAll('button, select')] as HTMLElement[]) {
      const ir = it.getBoundingClientRect(); const cx = ir.left + ir.width / 2, cy = ir.top + ir.height / 2;
      if (ir.width === 0 || cy < r.top + 2 || cy > r.bottom - 2) continue; // weggescrold binnen het menu
      getest++;
      const el = document.elementFromPoint(cx, cy);
      if (el && (el === it || it.contains(el))) geraakt++; else mis.push(`${(it.textContent || it.getAttribute('aria-label') || '').trim().slice(0, 24)} → ${el ? `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)}` : 'niets'}`);
    }
    return { gevonden: true, inBeeld: r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5, getest, geraakt, mis: mis.slice(0, 6), rect: [r.left, r.top, r.right, r.bottom].map((x) => Math.round(x)), z: getComputedStyle(m).zIndex };
  }, sel);

  const S = (naam: string, na: (p: Page) => Promise<void>): Stap => ({ naam, url: o.mailUrl, na: async (p) => { try { await na(p); } finally { await klaar(p); } } });

  /** Ligt op (x,y) bovenaan een element binnen `sel`? */
  const bovenOp = (p: Page, x: number, y: number, sel: string) => p.evaluate(({ x, y, sel }) => { const el = document.elementFromPoint(x, y); return { boven: !!el?.closest(sel), el: el ? `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 50)}` : 'niets' }; }, { x, y, sel });
  const rect = (p: Page, sel: string) => p.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null; }, sel);
  const KOPPEL = '.venster[data-venster^="mail-koppelen"]';
  /** Een venster kiezen in het gezamenlijke dok: het menu is standaard dicht (eerst de dokknop), het bovenste venster staat er niet in. */
  const dokKies = async (p: Page, itemSel: string) => {
    const kop = p.locator('nav.venster-dok .venster-dok-kop').first();
    if ((await kop.getAttribute('aria-expanded')) !== 'true') { await kop.click({ timeout: 5000 }); await p.waitForTimeout(250); }
    await p.locator(`nav.venster-dok ${itemSel}`).first().click({ timeout: 5000 });
  };
  /** Is de knop zichtbaar en bovenaan in zijn midden (niet onder de dokstrook of een ander venster)? */
  const knopBoven = (p: Page, sel: string) => p.evaluate((s) => {
    const k = document.querySelector(s) as HTMLElement | null; if (!k) return { gevonden: false, boven: false, rect: null as number[] | null, el: '' };
    const r = k.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const dok = document.querySelector('nav.venster-dok')?.getBoundingClientRect();
    return { gevonden: true, boven: !!el && (el === k || k.contains(el)), rect: [r.left, r.top, r.right, r.bottom].map(Math.round), el: el ? `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)}` : 'niets', dok: dok ? [dok.left, dok.top, dok.right, dok.bottom].map(Math.round) : null, vh: innerHeight };
  }, sel);


  return [
    S('mail-opstellen-venster', async (p) => {
      await openVenster(p);
      const k = await knoppen(p);
      const ovaal = k.filter((x) => x.icoon && Math.abs(x.w - x.h) > 1);
      const klein = telefoon(p) ? k.filter((x) => x.h < 44 - 0.5 || (x.icoon && x.w < 44 - 0.5)) : [];
      const balk = await p.evaluate(() => { const w = document.querySelector('.mail-compose-ribbon-rij') as HTMLElement | null, n = w?.querySelector('nav') as HTMLElement | null; return w && n ? { scrollbaar: n.scrollWidth > n.clientWidth + 2, meerRechts: w.dataset.meerRechts === '1', pijlZichtbaar: getComputedStyle(w.querySelector('.ut-tabs-pijl.is-rechts')!).display !== 'none', breed: n.scrollWidth, zicht: n.clientWidth } : null; });
      // Smaller toestel (330 px): de balk past niet meer → schaduw + pijl moeten verschijnen (TabsRij). Eigen knipsel als bewijs.
      let smal: unknown = null;
      if (telefoon(p)) {
        const vp = p.viewportSize()!;
        await p.setViewportSize({ width: 330, height: vp.height }); await p.waitForTimeout(600);
        smal = await p.evaluate(() => { const w = document.querySelector('.mail-compose-ribbon-rij') as HTMLElement | null, n = w?.querySelector('nav') as HTMLElement | null; return w && n ? { scrollbaar: n.scrollWidth > n.clientWidth + 2, meerRechts: w.dataset.meerRechts === '1', pijlZichtbaar: getComputedStyle(w.querySelector('.ut-tabs-pijl.is-rechts')!).display !== 'none', schaduw: getComputedStyle(w, '::after').opacity, breed: n.scrollWidth, zicht: n.clientWidth } : null; });
        await p.screenshot({ path: join(o.uit, 'mail-opstellen-venster-330-balkhint.png') }).catch(() => undefined);
        await p.setViewportSize(vp); await p.waitForTimeout(400);
        const s = smal as { scrollbaar: boolean; meerRechts: boolean; pijlZichtbaar: boolean; schaduw: string } | null;
        o.check('B3 330: balk past niet → pijl «›» en schaduw rechts zichtbaar', !!s && s.scrollbaar && s.meerRechts && s.pijlZichtbaar && s.schaduw === '1', JSON.stringify(smal));
      }
      await meet(p, 'mail-opstellen-venster', { knoppen: k, ovaal, klein, balk, smal });
      o.check(`B2 ${p.viewportSize()?.width}: geen ovale icoonknoppen in «Новий лист» (${k.filter((x) => x.icoon).length} icoonknoppen)`, ovaal.length === 0, JSON.stringify(ovaal));
      if (telefoon(p)) o.check('B2 390: alle knoppen ≥ 44 px hoog, icoonknoppen ≥ 44×44', klein.length === 0, JSON.stringify(klein.slice(0, 8)));
      o.check(`B3 ${p.viewportSize()?.width}: balk schuift → zichtbare hint (schaduw/pijl) óf past helemaal`, !!balk && (!balk.scrollbaar || (balk.meerRechts && balk.pijlZichtbaar)), JSON.stringify(balk));
    }),
    S('mail-opstellen-menu-meer', async (p) => {
      await openVenster(p);
      await p.locator(`${VENSTER} .mail-compose-more > button`).click();
      await p.waitForTimeout(500);
      const m = await menuBoven(p, '.mail-compose-more-menu');
      await meet(p, 'mail-opstellen-menu-meer', m);
      o.check(`B1 ${p.viewportSize()?.width}: menu «⋯» volledig in beeld en BOVEN het venster (elementFromPoint ${m.geraakt}/${m.getest})`, m.gevonden && m.inBeeld && m.getest > 3 && m.geraakt === m.getest, JSON.stringify(m));
    }),
    S('mail-opstellen-menu-lijst', async (p) => {
      await openVenster(p);
      // telefoon: «Список» staat als twee knoppen in de balk; computer: als keuzelijst. Test daar de stijl-keuzelijst («Звичайний»).
      const knop = p.locator(`${VENSTER} .mail-compose-dropdown-trigger`).first();
      if (!(await knop.count())) throw new Error('SKIP geen keuzelijst in de balk (telefoon: in «⋯»)');
      await knop.click(); await p.waitForTimeout(400);
      const m = await menuBoven(p, '.mail-compose-dropdown-menu');
      await meet(p, 'mail-opstellen-menu-lijst', m);
      o.check(`B1 ${p.viewportSize()?.width}: keuzelijst van de balk boven het venster (${m.geraakt}/${m.getest})`, m.gevonden && m.inBeeld && m.geraakt === m.getest && m.getest > 0, JSON.stringify(m));
    }),
    S('mail-opstellen-cc-dicht', async (p) => {
      await openVenster(p);
      const s = await p.evaluate((sel) => { const v = document.querySelector(sel)!; return { ccVelden: v.querySelectorAll('[data-nm-cc-velden] input').length, knop: !!v.querySelector('[data-nm-kopie]'), hoogteKop: Math.round((v.querySelector('[data-nm-kop]') as HTMLElement | null)?.getBoundingClientRect().height || 0) }; }, VENSTER);
      await meet(p, 'mail-opstellen-cc-dicht', s);
      o.check(`B5 ${p.viewportSize()?.width}: Cc/Bcc standaard dicht achter «Cc/Bcc»`, s.ccVelden === 0 && s.knop, JSON.stringify(s));
    }),
    S('mail-opstellen-cc-open', async (p) => {
      await openVenster(p);
      await p.locator(`${VENSTER} [data-nm-kopie]`).click(); await p.waitForTimeout(250);
      const open = await p.locator(`${VENSTER} [data-nm-cc-velden] input`).count();
      await p.locator(`${VENSTER} [data-nm-cc-velden] input`).first().fill('kopie@example.test');
      // dichtklappen en weer open: met een adres = compacte regel «Cc: …»
      await p.locator(`${VENSTER} [data-nm-kopie-dicht]`).click(); await p.waitForTimeout(250);
      const kort = await p.locator(`${VENSTER} [data-nm-cc-kort]`).innerText().catch(() => '');
      const dichtVelden = await p.locator(`${VENSTER} [data-nm-cc-velden] input`).count();
      await meet(p, 'mail-opstellen-cc-open', { open, kort, dichtVelden });
      o.check(`B5 ${p.viewportSize()?.width}: «Cc/Bcc» klapt open (2 velden), «згорнути» klapt dicht, met adres compact «Cc: …»`, open === 2 && dichtVelden === 0 && /Cc:\s*kopie@example\.test/.test(kort), JSON.stringify({ open, kort, dichtVelden }));
      // voor de knipsel: weer open (zo ziet de mens de uitgeklapte stand)
      await p.locator(`${VENSTER} [data-nm-cc-kort]`).click(); await p.waitForTimeout(250);
    }),
    S('mail-opstellen-sjablonen', async (p) => {
      await openVenster(p);
      await p.locator(`${VENSTER} .mail-compose-more > button`).click(); await p.waitForTimeout(400);
      const items = p.locator('.mail-compose-more-menu .mail-sjabloon-item');
      const n = await items.count();
      const eerste = await p.evaluate(() => { const m = document.querySelector('.mail-compose-more-menu'); const i = m?.querySelector('.mail-sjabloon-item'); if (!m || !i) return null; const r = i.getBoundingClientRect(), mr = m.getBoundingClientRect(); return { zichtbaar: r.top >= mr.top - 1 && r.bottom <= mr.bottom + 1, boven: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.mail-sjabloon-item') === i }; });
      await meet(p, 'mail-opstellen-sjablonen', { n, eerste });
      o.check(`B4 ${p.viewportSize()?.width}: 10 шаблонів у «⋯», перший видно й він зверху`, n === 10 && !!eerste?.zichtbaar && !!eerste?.boven, JSON.stringify({ n, eerste }));
      // knipsel MET open menu; daarna (zonder knipsel) invoegen proberen
      await p.screenshot({ path: join(o.uit, `mail-opstellen-sjablonen-menu-${p.viewportSize()?.width}.png`) }).catch(() => undefined);
      await items.filter({ hasText: 'Подяка' }).first().click(); await p.waitForTimeout(500);
      const tekst = await p.locator(`${VENSTER} .ProseMirror`).innerText();
      o.check(`B4 ${p.viewportSize()?.width}: шаблон «Подяка» вставлено в текст`, /Дякуємо|щиро дякую/.test(tekst), tekst.slice(0, 120));
    }),
    S('mail-opstellen-boven-vensters', async (p) => {
      // Злитий стенд 21.10: відкрите вікно спільного шару (підключення пошти / перевірка адрес) лежало ПОВЕРХ «Новий лист» і його «⋯».
      const basis = new URL(p.url()); basis.pathname = '/accounts';
      await p.goto(basis.toString(), { waitUntil: 'domcontentloaded' });
      const tegel = p.locator('[data-mail-provider-knop="ja"]').first();
      await tegel.waitFor({ timeout: 20000 }); await tegel.click(); await p.locator(KOPPEL).first().waitFor({ timeout: 10000 }); await p.waitForTimeout(500);
      await openVenster(p);               // herladen: het koppelvenster komt terug uit de vensterlade en staat open
      await p.locator(KOPPEL).first().waitFor({ timeout: 15000 }).catch(() => undefined);
      const res: Record<string, unknown> = {};
      const brief = await rect(p, VENSTER), kop = await rect(p, `${KOPPEL} .venster-kop`);
      res.brief = brief; res.koppel = kop;
      // a) bij openen staat de brief bovenaan (ook boven het koppelvenster)
      res.a = brief ? await bovenOp(p, brief.l + 40, brief.t + 30, VENSTER) : null;
      res.aKoppelPunt = kop ? await bovenOp(p, kop.l + kop.w / 2, kop.t + kop.h / 2, VENSTER) : null;
      // dok zichtbaar (er is een ander venster): «Надіслати» ligt niet onder de dokstrook
      res.verzend = { dokZichtbaar: await p.locator('nav.venster-dok').count(), ...(await knopBoven(p, `${VENSTER} footer button.primary`)) };
      // b) menu «⋯» boven alles
      await p.locator(`${VENSTER} .mail-compose-more > button`).click(); await p.waitForTimeout(500);
      res.b = await menuBoven(p, '.mail-compose-more-menu');
      await p.keyboard.press('Escape'); await p.waitForTimeout(250);
      // c) klik op een ZICHTBAAR stuk van het koppelvenster (niet bedekt door de brief) → dat venster naar voren, de brief blijft open.
      //    Helemaal bedekt (telefoon: beide op volle breedte)? Dan via het gezamenlijke dok — daar staan alle open vensters.
      const vrijPunt = (p2: Page, doel: string, ander: string) => p2.evaluate(({ doel, ander }) => {
        const d = document.querySelector(doel)?.getBoundingClientRect(), a = document.querySelector(ander)?.getBoundingClientRect();
        if (!d) return null;
        for (let y = d.top + 12; y < d.bottom - 4; y += 16) for (let x = d.left + 12; x < d.right - 4; x += 24) {
          if (a && x >= a.left - 2 && x <= a.right + 2 && y >= a.top - 2 && y <= a.bottom + 2) continue;
          // geometrisch vrij (het venster kan onder de achtergrond van de brief liggen); niet op een knop/veld van het doel
          const onder = document.elementsFromPoint(x, y).find((e) => e.closest(doel));
          if (onder && !onder.closest('button, a, input, select, textarea, [contenteditable=true]')) return [x, y] as [number, number];
        }
        return null;
      }, { doel, ander });
      const kpt = await vrijPunt(p, KOPPEL, VENSTER);
      if (kpt) await p.mouse.click(kpt[0], kpt[1]);
      else await dokKies(p, '[data-dok-venster^="mail-koppelen"]');
      await p.waitForTimeout(400);
      const k1 = await rect(p, KOPPEL);
      res.c = k1 ? { via: kpt ? 'klik' : 'dok', ...(await bovenOp(p, k1.l + k1.w / 2, k1.t + 20, KOPPEL)), briefNogOpen: await p.locator(VENSTER).count() === 1, koppelBovenaan: await p.locator(KOPPEL).first().getAttribute('data-bovenaan') } : null;
      // d) klik op een zichtbaar stuk van de brief (of via het dok) → de brief weer bovenaan
      const bpt = await vrijPunt(p, VENSTER, KOPPEL);
      if (bpt) await p.mouse.click(bpt[0], bpt[1]);
      else await dokKies(p, '[data-dok-venster="mail-nieuw-bericht"]');
      await p.waitForTimeout(400);
      // overlap van beide vensters: wie ligt daar bovenop?
      const ov = await p.evaluate(({ a, b }) => { const r1 = document.querySelector(a)?.getBoundingClientRect(), r2 = document.querySelector(b)?.getBoundingClientRect(); if (!r1 || !r2) return null; const l = Math.max(r1.left, r2.left), r = Math.min(r1.right, r2.right), t = Math.max(r1.top, r2.top), bo = Math.min(r1.bottom, r2.bottom); return l < r && t < bo ? [(l + r) / 2, (t + bo) / 2] : null; }, { a: VENSTER, b: KOPPEL });
      res.d = { via: bpt ? 'klik' : 'dok', overlapPunt: ov, briefOpOverlap: ov ? await bovenOp(p, ov[0], ov[1], VENSTER) : null, briefBovenaan: await p.locator(VENSTER).getAttribute('data-bovenaan'), koppelBovenaan: await p.locator(KOPPEL).first().getAttribute('data-bovenaan') };
      // e) brief met onderwerp minimaliseren → in HETZELFDE dok als de andere vensters; klik in het dok → terug, met onderwerp
      await p.locator(`${VENSTER} .mail-new-message-field input`).last().fill('Лист у доку');
      await p.waitForTimeout(500);
      await p.locator(`${VENSTER} [data-nm-minimaliseer]`).click(); await p.waitForTimeout(500);
      const dokItem = p.locator('.venster-dok [data-dok-venster="mail-nieuw-bericht"]');
      res.e = { inDok: await dokItem.count(), dokTekst: (await dokItem.textContent().catch(() => '')) || '', eigenPlashka: await p.locator('[data-concept-dok]').count() };
      await p.screenshot({ path: join(o.uit, `mail-opstellen-boven-vensters-dok-${p.viewportSize()?.width}.png`) }).catch(() => undefined);
      if (await dokItem.count()) { await dokKies(p, '[data-dok-venster="mail-nieuw-bericht"]'); await p.waitForTimeout(600); }
      res.f = { open: await p.locator(VENSTER).count(), onderwerp: await p.locator(`${VENSTER} .mail-new-message-field input`).last().inputValue().catch(() => '') };
      await meet(p, 'mail-opstellen-boven-vensters', res);
      const w = p.viewportSize()?.width;
      const a = res.a as { boven: boolean } | null, ak = res.aKoppelPunt as { boven: boolean } | null, b = res.b as { geraakt: number; getest: number; inBeeld: boolean }, c = res.c as { boven: boolean; briefNogOpen: boolean } | null, d = res.d as { briefOpOverlap: { boven: boolean } | null; briefBovenaan: string | null; koppelBovenaan: string | null } | null, e = res.e as { inDok: number; eigenPlashka: number }, f = res.f as { open: number; onderwerp: string };
      const vz = res.verzend as { dokZichtbaar: number; boven: boolean; rect: number[] | null; dok: number[] | null };
      o.check(`B7 ${w}: dok zichtbaar en «Надіслати» volledig bovenaan (elementFromPoint), niet onder de dokstrook`, vz.dokZichtbaar === 1 && vz.boven && !!vz.rect && (!vz.dok || vz.rect[3] <= vz.dok[1] || vz.rect[1] >= vz.dok[3] || vz.rect[2] <= vz.dok[0] || vz.rect[0] >= vz.dok[2]), JSON.stringify(res.verzend));
      o.check(`B7 ${w}: «Новий лист» відкривається ПОВЕРХ відкритого вікна підключення`, !!a?.boven && !!ak?.boven, JSON.stringify({ a: res.a, ak: res.aKoppelPunt }));
      o.check(`B7 ${w}: меню «⋯» поверх усіх вікон (elementFromPoint ${b.geraakt}/${b.getest})`, b.getest > 3 && b.geraakt === b.getest && b.inBeeld, JSON.stringify(b));
      o.check(`B7 ${w}: клік по вікну підключення піднімає його, лист лишається відкритим`, !!c?.boven && !!c?.briefNogOpen, JSON.stringify(res.c));
      o.check(`B7 ${w}: клік по листу — лист знову нагорі`, !!d && d.briefBovenaan === '1' && d.koppelBovenaan === '0' && (d.briefOpOverlap === null || d.briefOpOverlap.boven), JSON.stringify(res.d));
      o.check(`B7 ${w}: згорнутий лист — у спільному доку вікон (не окрема плашка), клік у доку повертає з темою`, e.inDok === 1 && e.eigenPlashka === 0 && f.open === 1 && f.onderwerp === 'Лист у доку', JSON.stringify({ e: res.e, f: res.f }));
      // opruimen: brief weg (leeg), koppelvenster sluiten
      await p.locator(`${VENSTER} .mail-new-message-field input`).last().fill('').catch(() => undefined);
      await p.locator(`${VENSTER} [data-nm-sluit]`).click().catch(() => undefined); await p.waitForTimeout(300);
      await p.locator(`${KOPPEL} [data-venster-knop="sluit"]`).first().click({ timeout: 5000 }).catch(() => undefined); await p.waitForTimeout(300);
    }),
    S('mail-opstellen-herstel', async (p) => {
      await openVenster(p);
      const v = p.locator(VENSTER);
      await v.locator('#mail-nm-aan').fill('olena@example.test');
      await v.locator('.mail-new-message-field input').last().fill('Перевірка відновлення');
      await v.locator('.ProseMirror').click();
      await p.keyboard.insertText('Текст, що мав пропасти після перезавантаження вкладки. ');
      await p.waitForTimeout(2600); // lokaal 300 ms, server 700 ms + antwoord
      const voor = await v.locator('[data-draft-sync]').evaluate((e) => ({ tekst: e.textContent, lokaal: e.getAttribute('data-concept-lokaal'), serverOp: e.getAttribute('data-concept-server-op') }));
      const sleutels = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mijn-ruimte-mail-concept-v2:')));
      // «мобільний браузер вивантажив вкладку»: зникнення сторінки (visibilitychange) і перезавантаження
      await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await p.reload({ waitUntil: 'domcontentloaded' });
      await v.waitFor({ timeout: 25000 });
      await p.waitForTimeout(1500);
      const na = await p.evaluate((sel) => { const d = document.querySelector(sel)!; const ins = [...d.querySelectorAll('input')] as HTMLInputElement[]; return { aan: (d.querySelector('#mail-nm-aan') as HTMLInputElement | null)?.value ?? (d.querySelector('[data-nm-kop-kort]')?.textContent || ''), onderwerp: ins.map((i) => i.value).join(' | ') + ' ' + (d.querySelector('[data-nm-kop-kort]')?.textContent || ''), tekst: (d.querySelector('.ProseMirror') as HTMLElement | null)?.innerText || '', status: d.querySelector('[data-draft-sync]')?.textContent || '' }; }, VENSTER);
      await meet(p, 'mail-opstellen-herstel', { voor, sleutels, na });
      o.check(`B6 ${p.viewportSize()?.width}: vóór herladen «Збережено локально · на сервері о HH:MM» (lokaal + echte server)`, voor.lokaal === 'ja' && !!voor.serverOp && /(Збережено локально|Lokaal bewaard) · (на сервері о|op de server om) \d\d:\d\d/.test(voor.tekst || ''), JSON.stringify(voor));
      o.check(`B6 ${p.viewportSize()?.width}: lokale sleutel per account|ruimte`, sleutels.length === 1 && /\|(prive|technisch)$/.test(sleutels[0]), sleutels.join(', '));
      o.check(`B6 ${p.viewportSize()?.width}: na herladen staat het venster weer open met dezelfde Кому/Тема/tekst`, /olena@example\.test/.test(na.aan + na.onderwerp) && /Перевірка відновлення/.test(na.onderwerp) && /мав пропасти/.test(na.tekst), JSON.stringify(na));
      // «Видалити чернетку» → lokale kopie weg
      const wis = v.locator('[data-nm-wis]');
      if (await wis.count()) {
        await wis.click(); await p.locator('[data-nm-wis-bevestig]').click(); await p.waitForTimeout(500);
        const rest = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('mijn-ruimte-mail-concept-v2:')).length);
        o.check(`B6 ${p.viewportSize()?.width}: «Видалити чернетку» wist de lokale kopie`, rest === 0, String(rest));
        // knipsel van de herstelde stand: opnieuw typen en herladen
        await openVenster(p);
        await v.locator('#mail-nm-aan').fill('olena@example.test');
        await v.locator('.mail-new-message-field input').last().fill('Перевірка відновлення');
        await v.locator('.ProseMirror').click(); await p.keyboard.insertText('Текст після перезавантаження на місці.');
        await p.waitForTimeout(2600);
        await p.reload({ waitUntil: 'domcontentloaded' }); await v.waitFor({ timeout: 25000 }); await p.waitForTimeout(1800);
      }
    }),
  ];
}
