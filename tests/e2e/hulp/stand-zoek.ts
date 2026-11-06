// Stand (22.10.2026, zone Z4): de zoekpagina hub.*/zoek, het palet ⌘K en de geschiedenis op de server. Kroki «zoek-*»:
//   zoek-begin              — /zoek zonder vraag: wat je kunt zoeken + echte stand van de bronnen (gezaaid: klaar/indexeert/fout/niet gekoppeld).
//   zoek-autocomplete       — typen «нала» → listbox (combobox-ARIA); ↓ + Enter kiest de eerste suggestie; meting debounce: 10 tekens → aantal POST /api/owner/zoek.
//   zoek-resultaten-filter  — /zoek?q=пошта → vinkje «Налаштування» in het filterpaneel (telefoon: onderblad) → de server krijgt `bronnen`.
//   zoek-niets              — vraag met typefout → «Нічого не знайдено» + correctie van de server (als de kern die geeft).
//   zoek-geschiedenis       — rij uit de geschiedenis (momentopname met een verdwenen id) → heropenen: «нове» / «більше недоступно».
//   zoek-palet-hub / -mail  — Ctrl+K op de hub en in de post: palet boven de pagina, Escape → focus terug (post: via de knop in het menu, 24.10).
//   zoek-axe                — axe-core (wcag2a/aa, 21a/aa, 22aa) op de pagina met resultaten; meting = aantal schendingen.
//   zoek-resultaten-groepen — (zone D) «за джерелами» + raster: groepen met kop per categorie, tegels met gekleurde icoon, geen horizontale scroll.
//   zoek-index-venster      — (zone D, fase tech) knop «Індексація…» → zwevend venster: gedeeltelijk (ui), starten, voortgang/uitkomst,
//                             «Згорнути» naar het dok, terug uit het dok, maximaliseren (≥ 560), sluiten; axe op het venster.
// Zaaien gebeurt in-process (zelfde server als de stand) via backend/zoek-index.ts (indexeer/standZetten) en backend/zoek-geschiedenis.ts.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ZoekObject } from '../../../shared/zoek-model';

type Page = import('playwright-core').Page;
type Stap = { naam: string; url: string; voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void>; alleen1280?: boolean; fase?: 'prive' | 'tech' };
export type ZoekCtx = { hubUrl: string; mailUrl: string; uid: () => string; uit: string; axe: string; zeg: (s: string) => void; meting: (naam: string, p: Page, slecht: string, detail: string) => void };

let gezaaid = '';
const nu = Date.now(), DAG = 864e5;
function objecten(uid: string): ZoekObject[] {
  const r = { userId: uid, ruimte: 'prive' as const };
  const o = (p: Partial<ZoekObject> & Pick<ZoekObject, 'id' | 'bron' | 'soort' | 'titel'>): ZoekObject => ({ bijgewerktOp: nu - DAG, rechten: r, ...p });
  return [
    o({ id: 'instellingen/mail', bron: 'instelling', soort: 'instelling', titel: 'Налаштування пошти', titels: { uk: 'Налаштування пошти', nl: 'E-mailinstellingen' }, omschrijving: 'Тут ви можете налаштувати параметри пошти, підключити облікові записи, керувати фільтрами.', trefwoorden: ['mail', 'e-mail instellingen', 'налаштування пошти'], pad: 'Налаштування › Пошта', route: { host: 'mail', pad: '/accounts', params: { focus: 'mail.accounts' } }, taal: 'uk', bijgewerktOp: nu - 2 * 3600e3 }),
    o({ id: 'instellingen/taal', bron: 'instelling', soort: 'instelling', titel: 'Мова інтерфейсу', titels: { nl: 'Taal van de interface' }, omschrijving: 'Змінити мову сайту: українська або нідерландська.', trefwoorden: ['taal wijzigen', 'мова інтерфейсу', 'мова'], pad: 'Налаштування › Мова', route: { host: 'id', pad: '/talen', params: { focus: 'taal.kiezer' } }, taal: 'uk' }),
    o({ id: 'pagina/mail/accounts', bron: 'pagina', soort: 'pagina', titel: 'Поштові акаунти', titels: { nl: 'E-mailaccounts' }, omschrijving: 'Підключені поштові скриньки: Gmail, Outlook, IMAP.', pad: 'Пошта › Акаунти', route: { host: 'mail', pad: '/accounts' }, taal: 'uk' }),
    o({ id: 'knop/mail/koppelen', bron: 'ui', soort: 'knop', titel: 'Підключити Gmail', titels: { nl: 'Gmail koppelen' }, omschrijving: 'Кнопка на сторінці «Поштові акаунти»: відкриває вікно Google для підключення скриньки.', pad: 'Пошта › Акаунти › Підключити', route: { host: 'mail', pad: '/accounts', params: { focus: 'mail.koppelen.gmail' } }, taal: 'uk' }),
    o({ id: 'hulp/zoeken', bron: 'hulp', soort: 'hulp', titel: 'Як шукати у «Мій простір»', omschrijving: 'Довідка: оператори, фільтри, історія пошуку.', pad: 'Довідка', route: { host: 'hub', pad: '/zoek' }, taal: 'uk' }),
    o({ id: 'm-1', bron: 'mail', soort: 'bericht', titel: 'Лист із налаштуваннями пошти', omschrijving: 'Олена Коваль · olena@example.test', tekst: 'Доброго дня! Тут вказані нові налаштування для вашої пошти. Будь ласка, перевірте параметри сервера IMAP та SMTP.', pad: 'Пошта › Вхідні', route: { host: 'mail', pad: '/postvak-in', params: { open_message_id: 'm-1' } }, taal: 'uk', bijgewerktOp: nu - 10 * DAG }),
    o({ id: 'm-2', bron: 'mail', soort: 'bericht', titel: 'Factuur oktober — administratie', omschrijving: 'Boekhouding BV · facturen@example.test', tekst: 'Beste, in de bijlage vindt u de factuur van oktober. Met vriendelijke groet.', pad: 'E-mail › Postvak IN', route: { host: 'mail', pad: '/postvak-in', params: { open_message_id: 'm-2' } }, taal: 'nl', bijgewerktOp: nu - 3 * DAG }),
    o({ id: 'm-3', bron: 'mail', soort: 'bericht', titel: 'Зустріч щодо проєкту пошти', omschrijving: 'Ірина Шевченко', tekst: 'Пропоную зустрітись у четвер, щоб обговорити міграцію поштових скриньок.', pad: 'Пошта › Вхідні', route: { host: 'mail', pad: '/postvak-in', params: { open_message_id: 'm-3' } }, taal: 'uk', bijgewerktOp: nu - 20 * DAG }),
    o({ id: 'bijl-1', bron: 'bijlage', soort: 'bijlage', titel: 'Інструкція: Налаштування пошти в Outlook.pdf', omschrijving: 'Вкладення листа «Лист із налаштуваннями пошти»', tekst: 'Детальна інструкція з налаштування пошти в Outlook. Крок за кроком з прикладами.', pad: 'Пошта › Вкладення', route: { host: 'mail', pad: '/postvak-in', params: { open_message_id: 'm-1', bijlage: 'bijl-1' } }, taal: 'uk', formaat: 'pdf', bijgewerktOp: nu - 10 * DAG }),
    o({ id: 'c-1', bron: 'cloud', soort: 'bestand', titel: 'Архів: поштові налаштування.zip', omschrijving: 'Резервні копії', tekst: 'У файлі містяться резервні копії налаштувань пошти за останні 6 місяців.', pad: 'Файли › Архіви', route: { host: 'cloud', pad: '/zoeken', params: { open_item_id: 'c-1' } }, taal: 'uk', formaat: 'zip', bijgewerktOp: nu - 30 * DAG }),
    o({ id: 'c-2', bron: 'cloud', soort: 'bestand', titel: 'Jaarplan 2026.docx', omschrijving: 'Documenten', tekst: 'Jaarplan met doelstellingen, budget en planning voor 2026.', pad: 'Bestanden › Documenten', route: { host: 'cloud', pad: '/zoeken', params: { open_item_id: 'c-2' } }, taal: 'nl', formaat: 'docx', bijgewerktOp: nu - 60 * DAG }),
    o({ id: 'a-1', bron: 'agenda', soort: 'afspraak', titel: 'Календар: налаштування сповіщень', omschrijving: '28 жовтня, 10:00', tekst: 'Ви можете налаштувати сповіщення про події у пошті та календарі.', pad: 'Календар › Налаштування', route: { host: 'cloud', pad: '/agenda', params: { open_event_id: 'a-1' } }, taal: 'uk', bijgewerktOp: nu - 5 * DAG }),
    o({ id: 'b-1', bron: 'bord', soort: 'taak', titel: 'Перевірити поштові фільтри', omschrijving: 'Задача на дошці', tekst: 'Налаштувати фільтри для розсилок.', pad: 'Дошка › Задачі', route: { host: 'mcp', pad: '/bord', params: { open_board_item: 'b-1' } }, taal: 'uk', bijgewerktOp: nu - 1 * DAG }),
    o({ id: 'gh-1', bron: 'github', soort: 'repo', titel: 'mijn-ruimte-mail', omschrijving: 'Поштовий модуль «Мій простір»', tekst: 'README: IMAP, SMTP, Gmail REST, налаштування пошти.', pad: 'GitHub › Репозиторії', route: { host: 'github', pad: '/repositories' }, taal: 'uk', bijgewerktOp: nu - 7 * DAG }),
  ];
}

/** Index + stand van de bronnen zaaien voor DEZE eigenaar (één keer). Geen demo-cijfers: de aantallen komen uit de index. */
export async function zaaiZoekIndex(uid: string, zeg: (s: string) => void): Promise<void> {
  if (!uid || gezaaid === uid) return;
  gezaaid = uid;
  const zi = await import('../../../backend/zoek-index');
  const lade = { userId: uid, ruimte: 'prive' as const };
  const u = await zi.indexeer(lade, objecten(uid));
  zeg(`   zoek: index gezaaid — toegevoegd ${u.toegevoegd}, bijgewerkt ${u.bijgewerkt}, overgeslagen ${u.overgeslagen}`);
  const klaar = ['instelling', 'pagina', 'ui', 'hulp', 'mail', 'bijlage', 'agenda', 'bord'] as const;
  for (const b of klaar) await zi.standZetten(lade, b, { stand: 'klaar', voortgang: 100, laatsteOk: nu - 3600e3, laatstePoging: nu - 3600e3, versie: 'stand-z4' });
  await zi.standZetten(lade, 'cloud', { stand: 'indexeert', voortgang: 40, laatstePoging: nu - 60e3, versie: 'stand-z4' });
  await zi.standZetten(lade, 'github', { stand: 'fout', voortgang: 100, fout: 'token verlopen (401)', laatstePoging: nu - 120e3, versie: 'stand-z4' });
  // geschiedenis: een rij waarvan de momentopname een id bevat dat NIET meer in de index staat (→ «більше недоступно») en die
  // één huidige treffer mist (→ «нове»)
  const zg = await import('../../../backend/zoek-geschiedenis');
  await zg.geschiedenisBewaren(lade, { vraag: 'налаштування пошти', filters: {}, treffers: [{ bron: 'instelling', id: 'instellingen/mail' }, { bron: 'mail', id: 'm-verwijderd' }, { bron: 'mail', id: 'm-1' }], totaal: 3, algoritmeVersie: 'zoek-kern-2', indexVersie: 'oud' });
  await zg.geschiedenisBewaren(lade, { vraag: 'factuur', filters: { cat: 'mail' }, treffers: [{ bron: 'mail', id: 'm-2' }], totaal: 1, algoritmeVersie: 'zoek-kern-2', indexVersie: 'index' });
  await zg.geschiedenisBewaren(lade, { vraag: 'jaarplan', filters: {}, treffers: [{ bron: 'cloud', id: 'c-2' }], totaal: 1, algoritmeVersie: 'zoek-kern-2', indexVersie: 'index' });
}

/** De momentopname van «налаштування пошти» (opnieuw) verouderd maken: een verdwenen id erin, een huidige treffer eruit. */
export async function zaaiMomentopname(uid: string): Promise<void> {
  const zg = await import('../../../backend/zoek-geschiedenis');
  await zg.geschiedenisBewaren({ userId: uid, ruimte: 'prive' }, { vraag: 'налаштування пошти', filters: {}, treffers: [{ bron: 'instelling', id: 'instellingen/mail' }, { bron: 'mail', id: 'm-verwijderd' }, { bron: 'mail', id: 'm-1' }], totaal: 3, algoritmeVersie: 'zoek-kern-2', indexVersie: 'oud' });
}
const VELD = 'form[role="search"] input[role="combobox"]';
const wachtOpResultaten = async (p: Page, ms = 8000) => { await p.waitForFunction(() => { const s = document.querySelector('[data-zoek-pagina]')?.getAttribute('data-zoek-staat'); return s === 'resultaten' || s === 'niets' || s === 'fout' || s === 'geenRecht'; }, null, { timeout: ms }).catch(() => undefined); await p.waitForTimeout(400); };
const actief = (p: Page) => p.evaluate(() => { const el = document.activeElement as HTMLElement | null; return el ? `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}` : 'geen'; });

export function zoekStappen(c: ZoekCtx): Stap[] {
  const zaai = async () => zaaiZoekIndex(c.uid(), c.zeg);
  const tel = (p: Page) => { const n = { zoek: 0, sugg: 0, lichamen: [] as string[] }; const h = (q: import('playwright-core').Request) => { const u = q.url(); if (q.method() !== 'POST') return; if (/\/api\/owner\/zoek$/.test(u)) { n.zoek++; n.lichamen.push(q.postData() || ''); } else if (/\/api\/owner\/zoek\/suggesties$/.test(u)) n.sugg++; }; p.on('request', h); return { n, stop: () => p.off('request', h) }; };
  return [
    { naam: 'zoek-begin', url: `${c.hubUrl}/zoek`, voor: zaai, na: async (p) => { await p.waitForSelector('[data-zoek-pagina]', { timeout: 15000 }); await p.waitForFunction(() => !!document.querySelector('.zk-standen li'), null, { timeout: 10000 }).catch(() => undefined); await p.waitForTimeout(500);
      const m = await p.evaluate(() => ({ staat: document.querySelector('[data-zoek-pagina]')?.getAttribute('data-zoek-staat'), standen: [...document.querySelectorAll('.zk-standen li')].map((li) => `${li.querySelector('.zk-stand-naam')?.textContent}=${li.querySelector('.pil')?.textContent}`), categorieen: [...document.querySelectorAll('.zk-tab')].map((b) => b.textContent?.trim()), geschiedenis: [...document.querySelectorAll('.zk-recent-q')].map((e) => e.textContent), trigger: !!document.querySelector('[data-zoek-trigger]') }));
      const slecht = [m.staat !== 'begin' ? `staat ${m.staat}` : '', m.standen.length < 10 ? `standen ${m.standen.length}` : '', !m.standen.some((s) => /(Індексується|Indexeert) 40%/.test(s)) ? 'geen indexeert 40%' : '', !m.standen.some((s) => /Помилка|Fout/.test(s)) ? 'geen fout-bron' : '', m.categorieen.includes('GitHub') === false && m.categorieen.length < 5 ? `categorieën ${m.categorieen.join('|')}` : '', !m.trigger ? 'geen globaal veld' : ''].filter(Boolean);
      c.meting('zoek-begin', p, slecht.join('; '), JSON.stringify(m)); } },
    { naam: 'zoek-autocomplete', url: `${c.hubUrl}/zoek`, voor: zaai, na: async (p) => {
      await p.waitForSelector(VELD, { timeout: 15000 }); const t = tel(p);
      await p.click(VELD); await p.keyboard.type('налаштування', { delay: 70 }); // 12 tekens
      await p.waitForTimeout(900); await wachtOpResultaten(p);
      const naTypen = { zoek: t.n.zoek, sugg: t.n.sugg };
      await p.keyboard.press('Backspace'); await p.keyboard.press('Backspace'); await p.keyboard.type('ня', { delay: 70 }); await p.waitForTimeout(700); await wachtOpResultaten(p);
      const aria = await p.evaluate((sel) => { const i = document.querySelector(sel) as HTMLInputElement; const lb = i?.getAttribute('aria-controls'); const ul = lb ? document.getElementById(lb) : null; return { expanded: i?.getAttribute('aria-expanded'), lb: ul?.getAttribute('role'), opties: ul ? ul.querySelectorAll('[role="option"]').length : 0, verborgen: ul?.hasAttribute('hidden'), autocomplete: i?.getAttribute('aria-autocomplete') }; }, VELD);
      // ↓ Enter: eerste suggestie kiezen (als er suggesties zijn)
      let gekozen = ''; if (aria.opties > 0 && !aria.verborgen) { await p.keyboard.press('ArrowDown'); const act = await p.evaluate((sel) => { const i = document.querySelector(sel) as HTMLInputElement; const id = i.getAttribute('aria-activedescendant'); return id ? document.getElementById(id)?.textContent || '' : ''; }, VELD); await p.keyboard.press('Enter'); await wachtOpResultaten(p); gekozen = act; }
      t.stop();
      const m = { ...aria, naTypen, totaal: { zoek: t.n.zoek, sugg: t.n.sugg }, gekozen, staat: await p.evaluate(() => document.querySelector('[data-zoek-pagina]')?.getAttribute('data-zoek-staat')), kaarten: await p.locator('[data-zoek-kaart]').count(), lichamen: t.n.lichamen.slice(0, 3) };
      const slecht = [naTypen.zoek > 3 ? `debounce: ${naTypen.zoek} zoekverzoeken bij 12 tekens (max 3)` : '', aria.autocomplete !== 'list' ? 'aria-autocomplete' : '', m.kaarten === 0 ? 'geen resultaten' : ''].filter(Boolean);
      c.meting('zoek-autocomplete', p, slecht.join('; '), JSON.stringify(m));
      // voor het knipsel: lijst open laten (veld leeg → opnieuw «нала» typen)
      await p.fill(VELD, ''); await p.click(VELD); await p.keyboard.type('нала', { delay: 70 }); await p.waitForTimeout(900); } },
    { naam: 'zoek-resultaten-filter', url: `${c.hubUrl}/zoek?q=${encodeURIComponent('налаштування пошти')}`, voor: zaai, na: async (p) => {
      await wachtOpResultaten(p, 15000); const t = tel(p);
      await p.mouse.move(Math.round((p.viewportSize()?.width || 1280) * 0.6), 4); await p.waitForTimeout(400); // muis weg van de zijbalk (hover-open + scrim)
      const mobiel = (p.viewportSize()?.width || 1280) <= 900;
      if (mobiel) { await p.locator('.zk-filterknop').first().click({ timeout: 5000 }); await p.waitForSelector('[data-zoek-filters="onderblad"]', { timeout: 5000 }); }
      const vink = p.locator('.zk-groep-bron .zk-vink', { hasText: /Пошта|E-mail/ }).first().locator('input');
      await vink.scrollIntoViewIfNeeded().catch(() => undefined);
      let bedekt = '';
      try { await vink.check({ timeout: 5000 }); } catch (e) {
        bedekt = await vink.evaluate((el) => { const b = el.getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return `${Math.round(b.left)},${Math.round(b.top)} ${b.width}×${b.height} → ${t ? `${t.tagName.toLowerCase()}.${String((t as HTMLElement).className).slice(0, 60)}` : 'niets'}`; }).catch(() => String(e).slice(0, 100));
        c.zeg(`   !! vinkje niet klikbaar (bedekt?): ${bedekt}`); await vink.check({ force: true }).catch(() => undefined);
      }
      await p.waitForTimeout(600); await wachtOpResultaten(p);
      t.stop();
      // zone D: op de telefoon/tablet mag GEEN bedieningselement van het onderblad onder de chrome liggen (menurail z 160, knoppen rechtsboven, «naar boven»)
      const blad = mobiel ? await p.evaluate(() => { const paneel = document.querySelector('[data-zoek-filters="onderblad"]'); if (!paneel) return { bedekt: ['geen onderblad'], top: -1 };
        const uit: string[] = []; const r0 = paneel.getBoundingClientRect();
        for (const el of [...paneel.querySelectorAll<HTMLElement>('.zk-paneel-sluit, .zk-paneel-voet .knop, .zk-groep-bron .zk-vink input')]) {
          const b = el.getBoundingClientRect(); if (b.width < 1 || b.height < 1 || b.bottom < r0.top || b.top > r0.bottom) continue;
          const x = b.left + b.width / 2, y = Math.min(Math.max(b.top + b.height / 2, r0.top + 1), r0.bottom - 1); const t = document.elementFromPoint(x, y);
          if (t && !(t === el || el.contains(t) || el.closest('label')?.contains(t))) uit.push(`${el.className || el.tagName}@${Math.round(x)},${Math.round(y)} → ${t.tagName.toLowerCase()}.${String((t as HTMLElement).className?.baseVal ?? (t as HTMLElement).className).slice(0, 40)}`);
        }
        return { bedekt: uit.slice(0, 5), top: Math.round(r0.top) }; }) : { bedekt: [] as string[], top: -1 };
      const m = await p.evaluate(() => ({ staat: document.querySelector('[data-zoek-pagina]')?.getAttribute('data-zoek-staat'), kaarten: document.querySelectorAll('[data-zoek-kaart]').length, chips: [...document.querySelectorAll('.zk-actief .zk-chip')].map((e) => e.textContent), percenten: [...document.querySelectorAll('[data-zoek-kaart]')].map((e) => e.getAttribute('data-percent')), marks: document.querySelectorAll('.zk-kaart-fragment mark, .zk-kaart-titel mark').length, uitleg: document.querySelectorAll('.zk-uitleg').length, dialoog: !!document.querySelector('[data-zoek-filters="onderblad"]'), actief: (document.activeElement as HTMLElement)?.tagName }));
      const lichaam = t.n.lichamen[t.n.lichamen.length - 1] || ''; let bronnen: unknown = null; try { bronnen = JSON.parse(lichaam).bronnen; } catch { /* leeg */ }
      const slecht = [bedekt ? `vinkje bedekt: ${bedekt}` : '', blad.bedekt.length ? `onderblad bedekt: ${blad.bedekt.join(' | ')}` : '', !Array.isArray(bronnen) ? 'filter niet naar de server (geen bronnen in het verzoek)' : '', m.kaarten === 0 ? 'geen resultaten' : '', m.marks === 0 ? 'geen markering' : '', m.percenten.some((x) => Number(x) > 100 || Number(x) < 0) ? 'percent buiten 0..100' : ''].filter(Boolean);
      c.meting('zoek-resultaten-filter', p, slecht.join('; '), JSON.stringify({ ...m, bronnen, verzoeken: t.n.zoek, blad }));
      // het onderblad blijft open voor het knipsel op de telefoon
    } },
    { naam: 'zoek-niets', url: `${c.hubUrl}/zoek?q=${encodeURIComponent('qzxv wtrp')}`, voor: zaai, na: async (p) => { await wachtOpResultaten(p, 15000);
      const m = await p.evaluate(() => ({ staat: document.querySelector('[data-zoek-pagina]')?.getAttribute('data-zoek-staat'), niets: !!document.querySelector('[data-zoek-niets]'), correcties: [...document.querySelectorAll('.zk-dym-knop')].map((b) => b.textContent), kaarten: document.querySelectorAll('[data-zoek-kaart]').length, origineel: !!document.querySelector('.zk-dym-orig') }));
      c.meting('zoek-niets', p, '', JSON.stringify(m)); } },
    { naam: 'zoek-geschiedenis', url: `${c.hubUrl}/zoek`, voor: async () => { await zaai(); await zaaiMomentopname(c.uid()); }, na: async (p) => {
      await p.waitForSelector('[data-zoek-geschiedenis]', { timeout: 15000 }); await p.waitForFunction(() => document.querySelectorAll('.zk-recent-q').length > 0, null, { timeout: 10000 }).catch(() => undefined);
      const mobiel = (p.viewportSize()?.width || 1280) <= 900;
      const rij = p.locator('.zk-recent-knop', { hasText: 'налаштування пошти' }).first();
      if (!(await rij.count())) throw new Error('SKIP geen geschiedenisrij');
      await rij.click({ timeout: 5000 });
      const momentopname = await p.waitForSelector('[data-zoek-momentopname]', { timeout: 5000 }).then((e) => e.getAttribute('data-zoek-momentopname')).catch(() => null);
      await p.waitForSelector('[data-zoek-momentopname="vernieuwd"]', { timeout: 15000 }).catch(() => undefined); await p.waitForTimeout(500);
      const m = await p.evaluate(() => ({ staat: document.querySelector('[data-zoek-pagina]')?.getAttribute('data-zoek-staat'), band: document.querySelector('[data-zoek-momentopname]')?.textContent, nieuw: document.querySelectorAll('.zk-kaart.is-nieuw').length, weg: document.querySelector('[data-zoek-weg]')?.getAttribute('data-zoek-weg'), wegTekst: document.querySelector('.zk-weg')?.textContent?.slice(0, 200), kaarten: document.querySelectorAll('[data-zoek-kaart]').length, q: (document.querySelector('form[role="search"] input') as HTMLInputElement)?.value, dubbel: (() => { const ids = [...document.querySelectorAll('[data-zoek-kaart]')].map((e) => e.getAttribute('data-zoek-kaart')); return ids.length - new Set(ids).size; })() }));
      const slecht = [m.q !== 'налаштування пошти' ? `vraag niet hersteld: ${m.q}` : '', m.weg !== '1' ? `weg=${m.weg} (verwacht 1: m-verwijderd)` : '', m.nieuw === 0 ? 'geen «нове»' : '', m.dubbel ? `dubbels ${m.dubbel}` : '', !momentopname ? 'geen momentopname-band' : ''].filter(Boolean);
      c.meting('zoek-geschiedenis', p, slecht.join('; '), JSON.stringify({ ...m, eersteBand: momentopname, mobiel }));
      const weg = p.locator('.zk-weg summary').first(); if (await weg.count()) await weg.click().catch(() => undefined); await p.waitForTimeout(200); } },
    { naam: 'zoek-palet-hub', url: `${c.hubUrl}/overzicht`, voor: zaai, na: async (p) => {
      await p.waitForSelector('[data-zoek-trigger]', { timeout: 15000 }); await p.keyboard.press('Control+K'); await p.waitForSelector('[data-zoek-palet="open"]', { timeout: 5000 });
      const a1 = await actief(p); await p.keyboard.type('пош', { delay: 60 }); await p.waitForTimeout(900);
      const m = await p.evaluate(() => ({ dialoog: document.querySelector('[data-zoek-palet] [role="dialog"]')?.getAttribute('aria-modal'), opties: document.querySelectorAll('[data-zoek-palet] [role="option"]').length, soorten: [...document.querySelectorAll('[data-zoek-palet] [role="option"]')].map((o) => o.className.replace(/.*soort-(\S+).*/, '$1')), alles: document.querySelector('.zk-palet-alles')?.textContent }));
      await p.keyboard.press('Escape'); await p.waitForTimeout(300); const dicht = !(await p.locator('[data-zoek-palet="open"]').count()); const a2 = await actief(p);
      c.meting('zoek-palet-hub', p, [m.dialoog !== 'true' ? 'geen aria-modal' : '', a1 === 'geen' || !/input/.test(a1) ? `focus niet in het veld: ${a1}` : '', !dicht ? 'Escape sluit niet' : ''].filter(Boolean).join('; '), JSON.stringify({ ...m, focusBijOpenen: a1, focusNaSluiten: a2, dicht }));
      await p.keyboard.press('Control+K'); await p.waitForSelector('[data-zoek-palet="open"]', { timeout: 5000 }); await p.keyboard.type('пош', { delay: 60 }); await p.waitForTimeout(900); } },
    { naam: 'zoek-palet-mail', url: `${c.mailUrl}`, voor: zaai, na: async (p) => {
      // hier via de KNOP, niet via het toetsenbord. 24.10: op de post staat die knop IN HET MENU (telefoon: in de lade tussen de
      // profielfoto en «Редагувати меню» — eerst de lade openen; computer: in de werkbalk van de zijbalk), niet meer in de bovenbalk.
      if ((p.viewportSize()?.width || 0) <= 700) { await p.locator('[data-sidebar-action="open-drawer"]').first().click({ timeout: 10000 }).catch(() => undefined); await p.waitForTimeout(400); }
      await p.waitForSelector('[data-zoek-trigger="menu"]', { timeout: 15000 }); const trig = p.locator('[data-zoek-trigger="menu"]').first(); const doos = await trig.boundingBox();
      const bedekt = doos ? await p.evaluate(([x, y]) => { const t = document.elementFromPoint(x, y); return t ? `${t.tagName.toLowerCase()}.${String((t as HTMLElement).className).slice(0, 50)}` : 'niets'; }, [doos.x + doos.width / 2, doos.y + doos.height / 2]) : 'geen doos';
      let viaKnop = true; try { await trig.click({ timeout: 5000 }); } catch { viaKnop = false; await p.keyboard.press('Control+K'); }
      await p.waitForSelector('[data-zoek-palet="open"]', { timeout: 5000 }); await p.keyboard.type('налашт', { delay: 60 }); await p.waitForTimeout(900);
      const m = await p.evaluate(() => ({ opties: document.querySelectorAll('[data-zoek-palet] [role="option"]').length, eerste: document.querySelector('[data-zoek-palet] [role="option"]')?.textContent, alles: document.querySelector('.zk-palet-alles')?.getAttribute('class') }));
      c.meting('zoek-palet-mail', p, viaKnop ? '' : `knop in de bovenbalk niet klikbaar (${bedekt})`, JSON.stringify({ ...m, viaKnop, trigger: doos, bedekt })); } },
    { naam: 'zoek-axe', url: `${c.hubUrl}/zoek?q=${encodeURIComponent('пошта')}`, voor: zaai, na: async (p) => {
      await wachtOpResultaten(p, 15000); if (!c.axe) throw new Error('SKIP geen axe');
      await p.evaluate(c.axe).catch(() => undefined);
      const r = await p.evaluate(async () => { const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string; help: string; nodes: Array<{ target: string[] }> }> }> } }; const out = await w.axe.run(document.querySelector('.zk-pagina') || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }); return out.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, doel: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })); });
      writeFileSync(join(c.uit, `zoek-axe-${p.viewportSize()?.width || 0}.json`), JSON.stringify(r, null, 1));
      c.meting('zoek-axe', p, r.length ? `${r.length} axe-schendingen: ${r.map((v) => v.id).join(', ')}` : '', JSON.stringify(r)); } },
    { naam: 'zoek-resultaten-groepen', url: `${c.hubUrl}/zoek?q=${encodeURIComponent('налаштування пошти')}`, voor: zaai, na: async (p) => {
      await wachtOpResultaten(p, 15000);
      await p.selectOption('.zk-ordening select', 'bron', { timeout: 5000 }); await p.waitForTimeout(400);
      const g1 = await p.evaluate(() => ({ groepen: [...document.querySelectorAll('[data-zoek-groep]')].map((e) => `${e.getAttribute('data-zoek-groep')}=${e.querySelectorAll('[data-zoek-kaart]').length}`), koppen: [...document.querySelectorAll('.zk-groep-kop')].map((e) => e.textContent?.trim()), los: document.querySelectorAll('.zk-resultaten > .zk-lijst').length, iconen: [...document.querySelectorAll('[data-zoek-kaart] [data-zoek-icoon]')].map((e) => e.getAttribute('data-zoek-icoon')), ordening: document.querySelector('[data-zoek-pagina]')?.getAttribute('data-zoek-ordening') }));
      await p.locator('.zk-weergave-knoppen button[aria-label="Сітка"], .zk-weergave-knoppen button[aria-label="Raster"]').first().click({ timeout: 5000 }); await p.waitForTimeout(400);
      const g2 = await p.evaluate(() => ({ weergave: document.querySelector('[data-zoek-pagina]')?.getAttribute('data-zoek-weergave'), tegels: document.querySelectorAll('.zk-kaart.is-tegel').length, rasters: document.querySelectorAll('.zk-lijst.is-raster').length, hscroll: document.documentElement.scrollWidth > window.innerWidth + 1, kleinsteTik: Math.min(...[...document.querySelectorAll('.zk-weergave-knoppen button, .zk-kaart .zk-actie')].map((e) => e.getBoundingClientRect().height)), bewaard: (() => { try { return localStorage.getItem('mr.zoek.weergave.v1'); } catch { return null; } })() }));
      const mobiel = (p.viewportSize()?.width || 1280) <= 900;
      const slecht = [g1.groepen.length < 2 ? `groepen ${g1.groepen.length}` : '', g1.los !== 0 ? 'losse lijst naast de groepen' : '', g1.ordening !== 'bron' ? `ordening ${g1.ordening}` : '', g2.weergave !== 'raster' ? `weergave ${g2.weergave}` : '', g2.tegels === 0 ? 'geen tegels' : '', g2.hscroll ? 'horizontale scroll' : '', mobiel && g2.kleinsteTik < 44 ? `tik ${g2.kleinsteTik}` : '', !g1.iconen.length ? 'geen iconen' : ''].filter(Boolean);
      c.meting('zoek-resultaten-groepen', p, slecht.join('; '), JSON.stringify({ ...g1, ...g2 }));
      // terug naar de standaard voor de andere stappen (de keuze staat in localStorage)
      await p.evaluate(() => { try { localStorage.removeItem('mr.zoek.weergave.v1'); } catch { /* geen opslag */ } }); } },
  ];
}

/** Stappen die het TECHNISCH profiel nodig hebben (fase tech in tests/e2e/stand-knipsels-20261020.ts). */
export function zoekTechStappen(c: ZoekCtx): Stap[] {
  const VENSTER = '[data-venster="zoek-index"]';
  return [
    { naam: 'zoek-index-venster', url: `${c.hubUrl}/zoek`, fase: 'tech', na: async (p) => {
      await p.waitForSelector('[data-zoek-pagina]', { timeout: 15000 });
      const strook = await p.waitForSelector('[data-zoek-tech-strook]', { timeout: 10000 }).then(() => true).catch(() => false);
      const knop = p.locator('[data-zoek-index-knop]').first();
      if (!(await knop.count())) { c.meting('zoek-index-venster', p, 'geen knop «Індексація…» (technisch profiel niet actief op /zoek?)', JSON.stringify({ strook })); return; }
      await knop.click({ timeout: 5000 });
      await p.waitForSelector(VENSTER, { timeout: 10000 });
      await p.waitForFunction((sel) => { const v = document.querySelector(sel)?.getAttribute('data-zoek-index-venster'); return !!v && v !== 'laden'; }, `${VENSTER} [data-zoek-index-venster]`, { timeout: 15000 }).catch(() => undefined);
      const smal = (p.viewportSize()?.width || 1280) < 560;
      // gedeeltelijk, alleen «Інтерфейс» (snel, zonder externe koppelingen), starten
      await p.locator(`${VENSTER} input[type="radio"][data-hulp="zoek.index.modus"]`).nth(1).check({ timeout: 5000 });
      const vinken = p.locator(`${VENSTER} input[type="checkbox"][data-hulp="zoek.index.bron"]`); const n = await vinken.count();
      for (let i = 0; i < n; i++) { const v = vinken.nth(i); if (i === 0) await v.check(); else await v.uncheck(); }
      // Het venster toont bij openen de uitkomst van de VORIGE run: wachten op een ANDERE run-id, anders meet de stap oude tellers.
      const INHOUD = `${VENSTER} [data-zoek-index-venster]`;
      const vorigeRun = (await p.locator(INHOUD).getAttribute('data-zoek-index-run').catch(() => '')) || '';
      await p.locator(`${VENSTER} [data-zoek-index-start]`).click({ timeout: 5000 });
      const gestart = await p.waitForFunction(([sel, vorig]) => { const el = document.querySelector(sel); const id = el?.getAttribute('data-zoek-index-run') || ''; return !!id && id !== vorig && /loopt|aangesloten|klaar|gestopt|tijd|limiet|fout/.test(el?.getAttribute('data-zoek-index-venster') || ''); }, [INHOUD, vorigeRun] as const, { timeout: 15000 }).then(() => true).catch(() => false);
      await p.waitForFunction(([sel, vorig]) => { const el = document.querySelector(sel); return (el?.getAttribute('data-zoek-index-run') || '') !== vorig && !!el?.querySelector('[data-zoek-index-uitkomst]'); }, [INHOUD, vorigeRun] as const, { timeout: 45000 }).catch(() => undefined);
      const m1 = await p.evaluate((sel) => { const v = document.querySelector(sel)!; return { plusUi: v.querySelector('[data-zoek-index-uitkomst] [data-zoek-index-bron="ui"] td:nth-child(4)')?.textContent || '', somNieuw: v.querySelector('[data-zoek-index-uitkomst] .zk-iv-tellers li b')?.textContent || '', run: v.querySelector('[data-zoek-index-venster]')?.getAttribute('data-zoek-index-run'), staat: v.querySelector('[data-zoek-index-venster]')?.getAttribute('data-zoek-index-venster'), uitkomst: v.querySelector('[data-zoek-index-uitkomst]')?.getAttribute('data-zoek-index-uitkomst'), tellers: v.querySelector('.zk-iv-tellers')?.textContent, rijen: v.querySelectorAll('[data-zoek-index-bron]').length, modaal: v.getAttribute('aria-modal'), achter: !!document.querySelector('.venster-achter'), rol: v.getAttribute('role'), fouten: v.querySelector('.zk-iv-fouten summary')?.textContent }; }, VENSTER);
      // minimaliseren → dok; terug uit het dok
      await p.locator(`${VENSTER} [data-venster-knop="min"]`).click({ timeout: 5000 }); await p.waitForTimeout(400);
      const dok = await p.evaluate((sel) => ({ verborgen: (document.querySelector(sel) as HTMLElement | null)?.hidden ?? null, dok: !!document.querySelector('nav.venster-dok') }), VENSTER);
      const dokKop = p.locator('nav.venster-dok .venster-dok-kop').first();
      if (await dokKop.count()) { await dokKop.click({ timeout: 5000 }); await p.waitForTimeout(300); const item = p.locator('[data-dok-venster="zoek-index"]').first(); if (await item.count()) await item.click({ timeout: 5000 }); }
      await p.waitForTimeout(400);
      const terug = await p.evaluate((sel) => !((document.querySelector(sel) as HTMLElement | null)?.hidden ?? true), VENSTER);
      // maximaliseren / herstellen (computer); slepen van de titelbalk (computer)
      let max: { voor: string; na: string } | null = null, sleep: { voor: number; na: number } | null = null;
      if (!smal) {
        const doos = () => p.locator(VENSTER).boundingBox();
        const b0 = await doos();
        await p.locator(`${VENSTER} [data-venster-knop="max"]`).click({ timeout: 5000 }); await p.waitForTimeout(300);
        const b1 = await doos();
        await p.locator(`${VENSTER} [data-venster-knop="max"]`).click({ timeout: 5000 }); await p.waitForTimeout(300);
        max = { voor: `${Math.round(b0?.width || 0)}×${Math.round(b0?.height || 0)}`, na: `${Math.round(b1?.width || 0)}×${Math.round(b1?.height || 0)}` };
        const kop = await p.locator(`${VENSTER} .venster-kop`).boundingBox();
        if (kop) { await p.mouse.move(kop.x + kop.width / 2, kop.y + kop.height / 2); await p.mouse.down(); await p.mouse.move(kop.x + kop.width / 2 + 120, kop.y + kop.height / 2 + 40, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300); const b2 = await doos(); sleep = { voor: Math.round(b0?.x || 0), na: Math.round(b2?.x || 0) }; }
      }
      // axe op het venster
      let axe: Array<{ id: string }> = [];
      if (c.axe) { await p.evaluate(c.axe).catch(() => undefined); axe = await p.evaluate(async (sel) => { const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string; help: string; nodes: Array<{ target: string[] }> }> }> } }; const out = await w.axe.run(document.querySelector(sel) || document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }); return out.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, doel: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })); }, VENSTER).catch(() => []); writeFileSync(join(c.uit, `zoek-index-venster-axe-${p.viewportSize()?.width || 0}.json`), JSON.stringify(axe, null, 1)); }
      // sluiten en opnieuw openen (de uitkomst blijft op de server; het knipsel toont het venster met de uitkomst)
      await p.locator(`${VENSTER} [data-venster-knop="sluit"]`).click({ timeout: 5000 }); await p.waitForTimeout(300);
      const dicht = !(await p.locator(VENSTER).count());
      await knop.click({ timeout: 5000 }); await p.waitForSelector(VENSTER, { timeout: 10000 }); await p.waitForSelector(`${VENSTER} [data-zoek-index-uitkomst], ${VENSTER} [data-zoek-index-start]`, { timeout: 15000 }).catch(() => undefined); await p.waitForTimeout(500);
      const slecht = [!strook ? 'geen technische strook (D3)' : '', !gestart ? 'run niet gestart' : '', m1.run === vorigeRun ? 'uitkomst is die van de vorige run' : '', m1.plusUi && m1.somNieuw && Number(m1.plusUi.split('/')[0]) !== Number(m1.somNieuw) ? `tabel «Інтерфейс» +${m1.plusUi.split('/')[0].trim()} ≠ uitkomst ${m1.somNieuw} nieuw` : '', !m1.uitkomst ? `geen uitkomst binnen 45 s (staat ${m1.staat})` : m1.uitkomst !== 'klaar' ? `uitkomst ${m1.uitkomst}` : '', m1.modaal === 'true' || m1.achter ? 'venster is modaal (blokkeert de pagina)' : '', dok.verborgen !== true ? 'minimaliseren verbergt het venster niet' : '', !dok.dok ? 'geen dok' : '', !terug ? 'niet terug uit het dok' : '', max && max.voor === max.na ? 'maximaliseren verandert niets' : '', sleep && sleep.voor === sleep.na ? 'slepen verplaatst niet' : '', !dicht ? 'sluiten sluit niet' : '', axe.length ? `${axe.length} axe-schendingen: ${axe.map((v) => v.id).join(', ')}` : ''].filter(Boolean);
      c.meting('zoek-index-venster', p, slecht.join('; '), JSON.stringify({ ...m1, vorigeRun, dok, terug, max, sleep, dicht, axe: axe.length })); } },
  ];
}
