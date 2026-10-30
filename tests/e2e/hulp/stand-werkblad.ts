// Stand (22.10.2026, zone F): het WERKBLAD op hub.*/overzicht. Kroki «werkblad-*» (elke stap: 390/768/1280, licht + donker, nl op 1280):
//   werkblad-leeg          — rij met nul widgets op de server → de lege toestand met «Додати віджет» / «Стандартна розкладка».
//   werkblad-gevuld        — standaardindeling met ECHTE routes; de gegevensroutes (blocks/data, board/list) krijgen in de browser
//                            een gevulde demo-antwoord (page.route, zoals de mail-stappen), de zoekgeschiedenis wordt echt op de server gezaaid.
//                            Meting: LCP (PerformanceObserver), aantal tegels, geen overlap van tegels, geen verzonnen logo's.
//   werkblad-instellen     — instelmodus aan: grepen, formaatgreep, knoppen; meting: tikvlakken ≥ 44 px op 390.
//   werkblad-catalogus     — catalogus open (categorieën, «скоро» voor GitHub niet toevoegbaar).
//   werkblad-sleep         — een tegel met de muis versleept (pointer events) → volgorde verandert, server krijgt /bewaren, geen overlap.
//   werkblad-toetsenbord   — Tab naar de titel, ArrowRight → volgorde verandert; Shift+ArrowRight → breder.
//   werkblad-telefoon      — op 390: knoppen omhoog/omlaag, geen horizontale scroll (meting), tap ≥ 44.
//   werkblad-axe           — axe-core (wcag2a/aa, 21a/aa, 22aa) op de pagina; meting = aantal schendingen (eis 0).
//   werkblad-tech          — technisch profiel aan (fase tech): de technische lade met server/updates/diagnostiek.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Page = import('playwright-core').Page;
type Stap = { naam: string; url: string; voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void>; alleen1280?: boolean; fase?: 'prive' | 'tech'; wachtOp?: string };
export type WerkbladCtx = { hubUrl: string; uid: () => string; uit: string; axe: string; zeg: (s: string) => void; meting: (naam: string, p: Page, slecht: string, detail: string) => void };

const nu = Date.now(), UUR = 3600e3, DAG = 864e5;
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Demo-antwoord van POST /api/owner/hub/blocks/data (zelfde vorm als backend/hub-blok-gegevens.ts), in de browser onderschept. */
const blokken = () => ({
  storage: 'existing_owner_scoped_projections', observedAt: nu,
  opslag: [{ id: 'd1', provider: 'google_drive', email: 'pavlo@example.test', limiet: 1_000_000_000_000, gebruik: 248_000_000_000, bijgewerktOp: nu - UUR }],
  gekoppeld: { mail: true, drive: true, calendar: true },
  sources: {
    mail: { kind: 'mail', status: 'ready', source: 'owner_scoped_projection', observedAt: nu, total: 9, bounded: false, unread: 9, gekoppeld: true, items: [
      { id: 'm1', title: 'Re: Документи для CVO Focus', subtitle: 'Олеся Коваленко · olesia@example.test', badge: 'unread', updatedAt: nu - 2 * UUR, url: '' },
      { id: 'm2', title: 'Безпека вашого облікового запису', subtitle: 'Сервіс Google · no-reply@example.test', badge: 'unread', updatedAt: nu - 3 * UUR, url: '' },
      { id: 'm3', title: 'Зустріч у п’ятницю', subtitle: 'Тетяна Петрівна · t.p@example.test', badge: '', updatedAt: nu - DAG, url: '' },
      { id: 'm4', title: 'Виплата: новий період', subtitle: 'CM · cm@example.test', badge: '', updatedAt: nu - DAG - UUR, url: '' },
      { id: 'm5', title: 'Підтвердження сесії', subtitle: 'Lumen interius · lumen@example.test', badge: '', updatedAt: nu - DAG - 2 * UUR, url: '' },
      { id: 'm6', title: 'Factuur oktober', subtitle: 'Boekhouding BV · facturen@example.test', badge: '', updatedAt: nu - 3 * DAG, url: '' },
    ] },
    files: { kind: 'files', status: 'ready', source: 'owner_scoped_projection', observedAt: nu, total: 4, bounded: false, gekoppeld: true, items: [
      { id: 'cloud:f1', title: 'Довідка_CVO.pdf', subtitle: 'application/pdf', badge: 'cloud', updatedAt: nu - 5 * UUR, url: '' },
      { id: 'drive:f2', title: 'Витрати_жовтень.xlsx', subtitle: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', badge: 'drive', updatedAt: nu - DAG, url: 'https://drive.google.com/file/d/f2/view' },
      { id: 'cloud:f3', title: 'Проєкт_Tarasevych_Hub.zip', subtitle: 'application/zip', badge: 'cloud', updatedAt: nu - 4 * DAG, url: '' },
      { id: 'cloud:f4', title: 'Медичний_огляд.pdf', subtitle: 'application/pdf', badge: 'cloud', updatedAt: nu - 6 * DAG, url: '' },
    ] },
    calendar: { kind: 'calendar', status: 'ready', source: 'owner_scoped_projection', observedAt: nu, total: 4, bounded: false, gekoppeld: true, items: [
      { id: 'a1', title: 'Зустріч з терапевтом', subtitle: 'Поліклініка', badge: 'calendar', updatedAt: nu + DAG, url: '' },
      { id: 'a2', title: 'Оновити проєкт Tarasevych Hub', subtitle: '', badge: 'calendar', updatedAt: nu + DAG + 3 * UUR, url: '' },
      { id: 'a3', title: 'Podiumgesprek — ouders', subtitle: 'School', badge: 'calendar', updatedAt: nu + 3 * DAG, url: 'https://calendar.google.com/' },
      { id: 'a4', title: 'Підготувати документи для CVO', subtitle: '', badge: 'calendar', updatedAt: nu + 6 * DAG, url: '' },
    ] },
  },
});
const bord = () => ({
  tasks: [
    { id: 't1', title: 'Підготувати документи для CVO', body: '', status: 'doing', tags: ['Освіта'], createdAt: new Date(nu - DAG).toISOString(), updatedAt: new Date(nu - UUR).toISOString() },
    { id: 't2', title: 'Зв’язатися з CM щодо виплати', body: '', status: 'backlog', tags: ['Фінанси'], createdAt: new Date(nu - DAG).toISOString(), updatedAt: new Date(nu - 2 * UUR).toISOString() },
    { id: 't3', title: 'Зустріч з терапевтом', body: '', status: 'blocked', tags: ['Здоров’я'], createdAt: new Date(nu - 2 * DAG).toISOString(), updatedAt: new Date(nu - 3 * UUR).toISOString() },
    { id: 't4', title: 'Оновити проєкт Tarasevych Hub', body: '', status: 'backlog', tags: ['Розробка'], createdAt: new Date(nu - 3 * DAG).toISOString(), updatedAt: new Date(nu - DAG).toISOString() },
    { id: 't5', title: 'Заархівувати старі листи', body: '', status: 'done', tags: [], createdAt: new Date(nu - 5 * DAG).toISOString(), updatedAt: new Date(nu - 4 * DAG).toISOString() },
  ],
  notes: [
    { id: 'n1', title: 'Ідеї для робочого столу', body: 'Віджети, темна тема, drag&drop', tags: ['hub', 'vast'], createdAt: new Date(nu - DAG).toISOString(), updatedAt: new Date(nu - UUR).toISOString() },
    { id: 'n2', title: 'Список покупок', body: '- [x] молоко\n- [ ] хліб\n- [ ] кава', tags: ['hub'], createdAt: new Date(nu - 2 * DAG).toISOString(), updatedAt: new Date(nu - 2 * UUR).toISOString() },
  ],
});

/** Gegevensroutes in de browser onderscheppen (de werkblad-routes zelf blijven ECHT: laden/bewaren gaan naar de server). */
export async function werkbladNep(p: Page) {
  await p.route('**/api/owner/hub/blocks/data', (r) => r.fulfill(json(blokken())));
  await p.route('**/api/mcp/board/list', (r) => r.fulfill(json(bord())));
}
export async function werkbladNepUit(p: Page) { await p.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined); }

let gezaaid = '';
async function zaai(uid: string, zeg: (s: string) => void) {
  if (!uid || gezaaid === uid) return;
  gezaaid = uid;
  const zg = await import('../../../backend/zoek-geschiedenis');
  const lade = { userId: uid, ruimte: 'prive' as const };
  for (const [vraag, ms] of [['налаштування пошти', 2 * 60e3], ['календар', 12 * 60e3], ['google drive', 28 * 60e3], ['документи pdf', UUR], ['github репозиторії', 2 * UUR]] as const) {
    await zg.geschiedenisBewaren(lade, { vraag, filters: {}, treffers: [], totaal: 3, algoritmeVersie: 'stand', indexVersie: 'stand' });
    await import('../../../server/platform/pg').then(({ getPool }) => getPool('systeem').query(`UPDATE app.zoek_geschiedenis SET laatst_op = now() - ($3::bigint || ' milliseconds')::interval WHERE user_id = $1 AND vraag = $2`, [uid, vraag, ms]));
  }
  zeg('   werkblad: zoekgeschiedenis gezaaid (5)');
}
/** Server: rij van deze lade wissen (→ eerste keer) of leeg zetten (→ lege toestand). */
async function serverRij(uid: string, stand: 'weg' | 'leeg' | 'standaard') {
  const wb = await import('../../../backend/werkblad');
  const lade = { userId: uid, ruimte: 'prive' as const };
  await wb.werkbladWissen(lade);
  if (stand === 'leeg') await wb.werkbladBewaren(lade, { ruimte: 'prive', eigenaar: true }, { indeling: { v: 2, items: [], achtergrond: 'nacht' }, herkomst: 'eigen', versie: 0 });
  if (stand === 'standaard') { const { standaardWerkblad } = await import('../../../shared/werkblad-indeling'); await wb.werkbladBewaren(lade, { ruimte: 'prive', eigenaar: true }, { indeling: standaardWerkblad({ ruimte: 'prive' }), herkomst: 'standaard', versie: 0 }); }
}

const wacht = async (p: Page) => { await p.waitForSelector('[data-werkblad="klaar"]', { timeout: 20000 }); await p.waitForTimeout(900); };
/** Lui laden: elke tegel één keer in beeld brengen (IntersectionObserver), daarna terug naar boven. */
const allesLaden = async (p: Page) => {
  const n = await p.locator('[data-wb-tegel]').count();
  for (let i = 0; i < n; i += 1) { await p.locator('[data-wb-tegel]').nth(i).scrollIntoViewIfNeeded().catch(() => undefined); await p.waitForTimeout(120); }
  await p.waitForTimeout(900);
  await p.evaluate(() => { for (const e of document.querySelectorAll<HTMLElement>('*')) if (e.scrollTop > 0) e.scrollTop = 0; window.scrollTo(0, 0); });
  await p.waitForTimeout(300);
};
const overlap = (p: Page) => p.evaluate(() => {
  const r = [...document.querySelectorAll<HTMLElement>('[data-wb-tegel]')].map((e) => { const b = e.getBoundingClientRect(); return { id: e.dataset.wbTegel, l: b.left, t: b.top, r: b.right, b: b.bottom }; });
  const o: string[] = [];
  for (let i = 0; i < r.length; i += 1) for (let j = i + 1; j < r.length; j += 1) { const a = r[i], b = r[j]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) o.push(`${a.id}×${b.id}`); }
  return { tegels: r.length, overlap: o, scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
});
const volgorde = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-wb-tegel]')].map((e) => e.dataset.wbWidget));
const lcp = (p: Page) => p.evaluate(() => new Promise<number>((res) => {
  let waarde = 0;
  try { const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) waarde = Math.max(waarde, e.startTime); }); po.observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* geen LCP (oude engine) */ }
  setTimeout(() => res(Math.round(waarde)), 1500);
}));

export function werkbladStappen(c: WerkbladCtx): Stap[] {
  const url = `${c.hubUrl}/overzicht`;
  const vooraf = async (p: Page, stand: 'weg' | 'leeg' | 'standaard' = 'standaard') => { await zaai(c.uid(), c.zeg); await serverRij(c.uid(), stand); await werkbladNep(p); };
  const instellen = async (p: Page) => { await wacht(p); await p.locator('[data-wb-instellen="aan"]').first().click({ timeout: 5000 }); await p.waitForTimeout(500); };
  const tel = (p: Page) => { const n = { bewaren: 0 }; const h = (q: import('playwright-core').Request) => { if (q.method() === 'POST' && /\/api\/owner\/hub\/werkblad\/bewaren$/.test(q.url())) n.bewaren++; }; p.on('request', h); return { n, stop: () => p.off('request', h) }; };
  return [
    { naam: 'werkblad-leeg', url, voor: (p) => vooraf(p, 'leeg'), na: async (p) => { await wacht(p); const m = await p.evaluate(() => ({ leeg: !!document.querySelector('[data-wb-leeg]'), aantal: document.querySelector('[data-werkblad]')?.getAttribute('data-wb-aantal'), knoppen: [...document.querySelectorAll('[data-wb-leeg] button')].map((b) => b.textContent?.trim()) })); c.meting('werkblad-leeg', p, m.leeg ? '' : 'geen lege toestand', JSON.stringify(m)); } },
    { naam: 'werkblad-gevuld', url, voor: (p) => vooraf(p, 'weg'), na: async (p) => {
      await wacht(p);
      await p.waitForFunction(() => document.querySelectorAll('.wb-post li').length >= 3, null, { timeout: 15000 }).catch(() => undefined);
      const l = await lcp(p);
      await allesLaden(p);
      const o = await overlap(p);
      const m = await p.evaluate(() => ({ herkomst: document.querySelector('[data-wb-herkomst]')?.getAttribute('data-wb-herkomst') || 'standaard', widgets: [...document.querySelectorAll<HTMLElement>('[data-wb-tegel]')].map((e) => e.dataset.wbWidget), post: document.querySelectorAll('.wb-post li').length, taken: document.querySelectorAll('.wb-taken li').length, afspraken: document.querySelectorAll('.wb-afspraken li, [data-wb-volgende]').length, tellers: [...document.querySelectorAll<HTMLElement>('[data-wb-teller], .wb-teller')].map((e) => e.textContent), zoek: document.querySelectorAll('.wb-zoek li').length, opslag: document.querySelectorAll('.wb-opslag li').length, snel: document.querySelectorAll('[data-wb-snel-tegel]').length, begroeting: document.querySelector('.wb-begroeting h2')?.textContent, monogram: document.querySelectorAll('[data-merk="onbekend"]').length, skelet: document.querySelectorAll('.wb-skelet').length, fouten: [...document.querySelectorAll('.wb-fout')].map((e) => e.textContent) }));
      const slecht = [o.overlap.length ? `overlap ${o.overlap.join(',')}` : '', o.scrollX ? 'horizontale scroll' : '', l > 2500 ? `LCP ${l} ms > 2500` : '', m.post < 3 ? 'post leeg' : '', m.taken < 2 ? 'taken leeg' : '', m.zoek < 3 ? 'zoek leeg' : '', m.afspraken < 1 ? 'agenda leeg' : '', m.opslag < 1 ? 'opslag leeg' : '', m.tellers.length < 2 ? `tellers ${m.tellers.join(',')}` : '', m.monogram ? `monogram ${m.monogram}` : '', m.fouten.length ? `fouten ${m.fouten.join('|')}` : ''].filter(Boolean);
      c.meting('werkblad-gevuld', p, slecht.join('; '), JSON.stringify({ lcpMs: l, ...o, ...m })); } },
    { naam: 'werkblad-instellen', url, voor: (p) => vooraf(p), na: async (p) => { await instellen(p); const m = await p.evaluate(() => { const k = [...document.querySelectorAll<HTMLElement>('.wb-tegel-knoppen button, [data-wb-catalogus], [data-wb-instellen], [data-wb-achtergrond]')].map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }); return { knoppen: k.length, klein: k.filter((x) => x.w < 44 || x.h < 44).length, grepen: document.querySelectorAll('.wb-maat').length, sleepbaar: document.querySelectorAll('.is-sleepbaar').length }; }); const mobiel = (p.viewportSize()?.width || 1280) <= 500; c.meting('werkblad-instellen', p, mobiel && m.klein ? `${m.klein} knoppen < 44px op de telefoon` : '', JSON.stringify(m)); } },
    { naam: 'werkblad-catalogus', url, voor: (p) => vooraf(p), na: async (p) => { await instellen(p); await p.locator('[data-wb-catalogus="open"]').first().click({ timeout: 5000 }); await p.waitForSelector('.wb-catalogus', { timeout: 5000 }); await p.waitForTimeout(500); const m = await p.evaluate(() => ({ kaarten: document.querySelectorAll('[data-wb-kaart]').length, binnenkort: [...document.querySelectorAll('[data-wb-stand="binnenkort"]')].map((e) => ({ id: e.getAttribute('data-wb-kaart'), knopUit: (e.querySelector('button') as HTMLButtonElement)?.disabled })), tech: document.querySelectorAll('[data-wb-cat="technisch"]').length })); c.meting('werkblad-catalogus', p, [m.kaarten < 10 ? 'te weinig kaarten' : '', m.binnenkort.some((b) => !b.knopUit) ? '«binnenkort» toevoegbaar' : '', m.tech ? 'technische categorie in de persoonlijke lade' : ''].filter(Boolean).join('; '), JSON.stringify(m)); } },
    { naam: 'werkblad-sleep', url, voor: (p) => vooraf(p), na: async (p) => {
      await instellen(p); const t = tel(p); const voor = await volgorde(p);
      const mobiel = (p.viewportSize()?.width || 1280) <= 700;
      if (mobiel) { const knop = p.locator('[data-wb-tegel] .wb-tegel-knoppen button[aria-label*="нижче"], [data-wb-tegel] .wb-tegel-knoppen button[aria-label*="omlaag"]').nth(2); await knop.click({ timeout: 5000 }); }
      else {
        const bron = p.locator('[data-wb-tegel]').nth(2).locator('.wb-tegel-kop'), doel = p.locator('[data-wb-tegel]').nth(5);
        const a = await bron.boundingBox(), b = await doel.boundingBox();
        if (!a || !b) throw new Error('SKIP geen tegels');
        await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down();
        for (let i = 1; i <= 12; i += 1) { await p.mouse.move(a.x + a.width / 2 + ((b.x + b.width - 8 - a.x - a.width / 2) * i) / 12, a.y + a.height / 2 + ((b.y + b.height / 2 - a.y - a.height / 2) * i) / 12); await p.waitForTimeout(30); }
        await p.mouse.up();
      }
      await p.waitForTimeout(1200); t.stop();
      const na = await volgorde(p); const o = await overlap(p);
      const veranderd = JSON.stringify(voor) !== JSON.stringify(na);
      c.meting('werkblad-sleep', p, [!veranderd ? 'volgorde niet veranderd' : '', t.n.bewaren < 1 ? 'geen /bewaren naar de server' : '', o.overlap.length ? `overlap ${o.overlap.join(',')}` : ''].filter(Boolean).join('; '), JSON.stringify({ voor, na, bewaren: t.n.bewaren, ...o, mobiel })); } },
    { naam: 'werkblad-toetsenbord', url, voor: (p) => vooraf(p), na: async (p) => {
      await instellen(p); const t = tel(p); const voor = await volgorde(p);
      const titel = p.locator('[data-wb-tegel]').nth(3).locator('.wb-tegel-titel[role="button"]');
      await titel.focus(); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400);
      const na = await volgorde(p);
      const k0 = await p.locator('[data-wb-tegel][data-wb-widget="' + (na[4] || '') + '"]').first().getAttribute('data-wb-k');
      await p.locator('[data-wb-tegel]').nth(4).locator('.wb-tegel-titel[role="button"]').focus(); await p.keyboard.press('Shift+ArrowRight'); await p.waitForTimeout(400);
      const k1 = await p.locator('[data-wb-tegel]').nth(4).getAttribute('data-wb-k');
      await p.waitForTimeout(900); t.stop();
      const actief = await p.evaluate(() => (document.activeElement as HTMLElement)?.className || '');
      c.meting('werkblad-toetsenbord', p, [JSON.stringify(voor) === JSON.stringify(na) ? 'ArrowRight verplaatst niet' : '', Number(k1) <= Number(k0) && Number(k0) < 12 ? `Shift+ArrowRight maakt niet breder (${k0}→${k1})` : '', t.n.bewaren < 1 ? 'geen /bewaren' : ''].filter(Boolean).join('; '), JSON.stringify({ voor, na, k0, k1, bewaren: t.n.bewaren, actief })); } },
    { naam: 'werkblad-telefoon', url, voor: (p) => vooraf(p), na: async (p) => { await instellen(p); await allesLaden(p); const o = await overlap(p); const m = await p.evaluate(() => ({ kolommen: document.querySelector('[data-werkblad]')?.getAttribute('data-wb-kolommen'), opneer: document.querySelectorAll('.wb-tegel-knoppen button[aria-label*="вище"], .wb-tegel-knoppen button[aria-label*="omhoog"]').length, grepen: document.querySelectorAll('.wb-maat').length, klein: [...document.querySelectorAll<HTMLElement>('.werkblad button, .werkblad a[href]')].filter((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); if (!r.height || cs.display === 'none' || cs.visibility === 'hidden' || b.closest('.sr-only, [aria-hidden="true"]')) return false; return r.height < 44 || (r.width < 44 && !(b.textContent || '').trim()); }).map((b) => `${b.className || b.tagName}:${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`) })); const mobiel = (p.viewportSize()?.width || 1280) <= 700; c.meting('werkblad-telefoon', p, mobiel ? [o.scrollX ? 'horizontale scroll' : '', m.kolommen !== '1' ? `kolommen ${m.kolommen}` : '', !m.opneer ? 'geen omhoog/omlaag-knoppen' : '', m.grepen ? 'formaatgreep op de telefoon' : '', m.klein.length ? `${m.klein.length} tikvlakken < 44px: ${m.klein.slice(0, 8).join(', ')}` : ''].filter(Boolean).join('; ') : '', JSON.stringify({ ...o, ...m, mobiel })); } },
    { naam: 'werkblad-axe', url, voor: (p) => vooraf(p), na: async (p) => {
      await wacht(p); if (!c.axe) throw new Error('SKIP geen axe');
      await p.waitForFunction(() => document.querySelectorAll('.wb-post li').length >= 3, null, { timeout: 15000 }).catch(() => undefined);
      await allesLaden(p);
      await p.evaluate(c.axe).catch(() => undefined);
      const r = await p.evaluate(async () => { const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string; help: string; nodes: Array<{ target: string[] }> }> }> } }; const out = await w.axe.run(document.querySelector('.werkblad') || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }); return out.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, doel: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })); });
      writeFileSync(join(c.uit, `werkblad-axe-${p.viewportSize()?.width || 0}.json`), JSON.stringify(r, null, 1));
      c.meting('werkblad-axe', p, r.length ? `${r.length} axe-schendingen: ${r.map((v) => v.id).join(', ')}` : '', JSON.stringify(r)); } },
    { naam: 'werkblad-tech', url, fase: 'tech', voor: async (p) => { await werkbladNep(p); }, na: async (p) => { await wacht(p); await allesLaden(p); await p.waitForTimeout(800); const m = await p.evaluate(() => ({ ruimte: document.querySelector('[data-werkblad]')?.getAttribute('data-wb-ruimte'), widgets: [...document.querySelectorAll<HTMLElement>('[data-wb-tegel]')].map((e) => e.dataset.wbWidget), server: !!document.querySelector('[data-wb-tech="server"]'), fouten: [...document.querySelectorAll('.wb-fout')].map((e) => e.textContent) })); c.meting('werkblad-tech', p, [m.ruimte !== 'technisch' ? `ruimte ${m.ruimte}` : '', !m.widgets.some((w) => w === 'tech-server') ? 'geen tech-server' : '', !m.server ? 'servergegevens niet geladen' : '', m.fouten.length ? `fouten ${m.fouten.join('|')}` : ''].filter(Boolean).join('; '), JSON.stringify(m)); } },
  ];
}
