// IDENTITEIT-011: «Макет» у справжньому Chrome — жива карта розвитку, переходи до справжніх налаштувань, межі розділів,
// збереження введеного після перемальовування, жодного горизонтального прокручування на телефоні, планшеті й комп'ютері, обидві мови й теми.
// De weergave «Ontwerp» in een echte Chrome: levende kaart, sprongen naar de echte instellingen, grenzen, behoud van invoer, geen uitschuiven.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { chromeArgs } from './server';

const vereist = createRequire(import.meta.url);
const { chromium } = vereist(process.env.PLAYWRIGHT_CORE || 'playwright') as typeof import('playwright');

export async function main(): Promise<number> {
  const map = mkdtempSync(join(tmpdir(), 'identiteit-maquette-'));
  const uitvoer = process.env.E2E_SCREENSHOTS || 'rapporten/identiteit-maquette-kaart';
  mkdirSync(uitvoer, { recursive: true });
  await build({
    entryPoints: ['tests/e2e/hulp/identiteit-maquette-stand/stand.tsx'], outdir: map,
    bundle: true, format: 'esm', target: 'es2022', jsx: 'automatic',
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.jpg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' },
    logLevel: 'error',
  });
  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body style="margin:0"><div id="root"></div><script type="module" src="/stand.js"></script></body></html>';
  const server = createServer((req, res) => {
    const naam = (req.url || '/').split('?')[0];
    const bestand = join(map, naam.replace(/^\/+/, ''));
    if (naam === '/canonical-service.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync('public/canonical-service.js'));
    else if (naam !== '/' && existsSync(bestand)) res.writeHead(200, { 'content-type': naam.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(bestand));
    else res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const poort = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), headless: true, args: ['--no-sandbox', ...chromeArgs(poort)] });
  let fouten = 0;
  const controleer = (naam: string, geldig: boolean, detail?: unknown) => {
    process.stdout.write(`${geldig ? '✓' : '✗'} ${naam}${geldig ? '' : `: ${JSON.stringify(detail)}`}\n`);
    if (!geldig) fouten++;
  };
  try {
    const gevallen: { breedte: number; taal: 'uk' | 'nl'; licht: boolean }[] = [
      { breedte: 390, taal: 'uk', licht: false }, { breedte: 390, taal: 'nl', licht: true },
      { breedte: 768, taal: 'uk', licht: true }, { breedte: 1280, taal: 'uk', licht: false }, { breedte: 1280, taal: 'nl', licht: false },
    ];
    for (const { breedte, taal, licht } of gevallen) {
      const naam = `${breedte}/${taal}/${licht ? 'licht' : 'donker'}`;
      const context = await browser.newContext({ viewport: { width: breedte, height: 860 }, isMobile: breedte < 500, hasTouch: breedte < 500, deviceScaleFactor: 1 });
      const pagina = await context.newPage();
      await pagina.route('**/*', (route) => { const u = new URL(route.request().url()); return u.hostname === '127.0.0.1' && u.port === String(poort) ? route.continue() : route.abort(); });
      const jsFouten: string[] = [];
      pagina.on('pageerror', (e) => jsFouten.push(String(e)));
      pagina.on('console', (b) => { if (b.type() === 'error') jsFouten.push(b.text()); });
      await pagina.goto(`http://127.0.0.1:${poort}/?lang=${taal}`);
      await pagina.locator('.mr-mq').waitFor({ timeout: 15000 });
      await pagina.waitForTimeout(400);
      // Тема сайту змінюється, поки «Макет» відкритий: двигун має підхопити її сам (MutationObserver → zetLicht).
      if (licht) { await pagina.evaluate(() => document.documentElement.classList.add('theme-light')); await pagina.waitForTimeout(200); }

      if (licht) controleer(`${naam}: світла тема сайту доходить до «Макета»`, await pagina.evaluate(() => document.querySelector('.mr-mq')?.classList.contains('light') === true));
      // 1. Панелі не монтуються, доки блок «Чинні налаштування» закритий.
      const montagesVooraf = await pagina.evaluate(() => Object.keys((window as unknown as { mqMontages?: object }).mqMontages || {}).length);
      controleer(`${naam}: панелі не монтуються до відкриття блоку`, montagesVooraf === 0, montagesVooraf);

      // 2. Жива карта меню: мітки без «Звірити підключення», кнопка «Відкрити» веде до справжнього блоку.
      // IDENTITEIT-014: «Сповіщення в меню» (з «Типами сповіщень» і нагадуванням про резервний доступ) працює повністю → групи на карті немає;
      // перехід перевіряємо через «Видимість» (рядок 2 ще частковий, група лишається).
      const kaart = pagina.locator('details[data-future-section="menu"]');
      controleer(`${naam}: карта розвитку меню є`, await kaart.count() === 1);
      const tekst = await pagina.evaluate(() => document.querySelector('.mr-mq')?.textContent || '');
      controleer(`${naam}: немає «Звірити підключення» / «Koppeling controleren»`, !tekst.includes('Звірити підключення') && !tekst.includes('Koppeling controleren'));
      controleer(`${naam}: групи «Сповіщення в меню» на карті немає (усе працює), розділу «Відновлення» — теж`, await kaart.locator('[data-kaart-ga="menu|#menu-meldingen"]').count() === 0 && await pagina.locator('details[data-future-section="recovery"]').count() === 0);
      // Як людина: розгорнути карту й групи (групи з понад трьома рядками згорнуті).
      await kaart.evaluate((d) => { (d as HTMLDetailsElement).open = true; for (const g of d.querySelectorAll('details.future-group')) (g as HTMLDetailsElement).open = true; });
      const knop = kaart.locator('[data-kaart-ga="menu|#menu-zichtbaarheid"]').first();
      await knop.scrollIntoViewIfNeeded();
      await knop.click();
      await pagina.waitForFunction(() => { const d = document.querySelector('#menu-zichtbaarheid') as HTMLDetailsElement | null; return !!d && d.open; }, null, { timeout: 5000 }).catch(() => {});
      const naMenu = await pagina.evaluate(() => ({
        blokOpen: (document.querySelector('.mq-echt-blok[data-echt-blok="menu"]') as HTMLDetailsElement | null)?.open,
        doelOpen: (document.querySelector('#menu-zichtbaarheid') as HTMLDetailsElement | null)?.open,
        grens: document.querySelector('[data-grens="menu"]')?.getAttribute('data-atelier'),
      }));
      controleer(`${naam}: «Відкрити» розгортає «Чинні налаштування» й потрібне місце`, naMenu.blokOpen === true && naMenu.doelOpen === true, naMenu);
      controleer(`${naam}: панель бачить межі розділу (AtelierInhoud)`, naMenu.grens === 'true', naMenu);

      // 3. Перехід в інший розділ: рядок безпеки «резервні коди» → розділ «Відновлення» (#aanmeldmethoden-herstel).
      const kruis = await pagina.evaluate(() => {
        const r = document.querySelector('.mr-mq') as HTMLElement;
        const b = document.createElement('button'); b.type = 'button'; b.dataset.kaartGa = 'recovery|#aanmeldmethoden-herstel'; b.textContent = 'proef';
        r.appendChild(b); b.click(); b.remove(); return true;
      });
      await pagina.waitForSelector('.mq-echt[data-echt="recovery"] #aanmeldmethoden-herstel', { timeout: 6000 }).catch(() => {});
      const herstel = await pagina.evaluate(() => ({ bestaat: !!document.querySelector('.mq-echt[data-echt="recovery"] #aanmeldmethoden-herstel'), blok: (document.querySelector('.mq-echt-blok[data-echt-blok="recovery"]') as HTMLDetailsElement | null)?.open }));
      controleer(`${naam}: перехід до іншого розділу відкриває його справжню панель`, kruis && herstel.bestaat && herstel.blok === true, herstel);

      // 3б. Ціль усередині блоку: перемикач нагадування розгортає «Сповіщення в меню» і отримує фокус-підсвітку.
      await pagina.evaluate(() => { const r = document.querySelector('.mr-mq') as HTMLElement; const b = document.createElement('button'); b.dataset.kaartGa = 'menu|[data-meld-schakel="reserve"]'; r.appendChild(b); b.click(); b.remove(); });
      await pagina.waitForFunction(() => (document.querySelector('#menu-meldingen') as HTMLDetailsElement | null)?.open === true, null, { timeout: 5000 }).catch(() => {});
      controleer(`${naam}: ціль [data-meld-schakel="reserve"] розгортає «Сповіщення в меню»`, await pagina.evaluate(() => (document.querySelector('#menu-meldingen') as HTMLDetailsElement | null)?.open === true && !!document.querySelector('.mq-echt[data-echt="menu"] [data-meld-schakel="reserve"]')));

      // 4. Введене в «Спільному доступі» лишається після закриття й повторного відкриття (сталий контейнер порталу).
      await pagina.evaluate(() => { const r = document.querySelector('.mr-mq') as HTMLElement; const b = document.createElement('button'); b.dataset.kaartGa = 'sharing|.settings-sharing'; r.appendChild(b); b.click(); b.remove(); });
      const veld = pagina.locator('.mq-echt[data-echt="sharing"] [data-proef-invoer]');
      await veld.waitFor({ timeout: 6000 });
      await veld.fill('proef@example.org');
      const sluit = pagina.locator('[data-close-inline="sharing"]').first();
      if (await sluit.count()) await sluit.click();
      await pagina.waitForTimeout(250);
      await pagina.evaluate(() => { const r = document.querySelector('.mr-mq') as HTMLElement; const b = document.createElement('button'); b.dataset.kaartGa = 'sharing|.settings-sharing'; r.appendChild(b); b.click(); b.remove(); });
      await veld.waitFor({ timeout: 6000 });
      const waarde = await veld.inputValue();
      const montages = await pagina.evaluate(() => (window as unknown as { mqMontages: Record<string, number> }).mqMontages.sharing);
      controleer(`${naam}: введене зберігається після повторного відкриття, панель не перемонтовано`, waarde === 'proef@example.org' && montages === 1, { waarde, montages });

      // 5. Кожен id у документі один; жодного горизонтального прокручування; помилок JavaScript немає.
      const stand = await pagina.evaluate(() => {
        const tel = new Map<string, number>();
        for (const e of document.querySelectorAll('[id]')) tel.set(e.id, (tel.get(e.id) || 0) + 1);
        const dubbel = [...tel].filter(([, n]) => n > 1).map(([id]) => id);
        const grens = document.documentElement.clientWidth + 1;
        const uit = [...document.querySelectorAll('.mr-mq *')].map((el) => ({ el: el.tagName + '.' + String((el as HTMLElement).className).slice(0, 40), r: el.getBoundingClientRect() }))
          .filter((x) => x.r.width > 0 && x.r.right > grens && !(x.el.includes('hero') || x.el.includes('art') || x.el.includes('orbit'))).slice(0, 5).map((x) => x.el + '@' + Math.round(x.r.right));
        const ws = document.querySelector('.canonical-workspace') as HTMLElement;
        return { dubbel, scroll: Math.max(document.documentElement.scrollWidth, ws.scrollWidth), breedte: document.documentElement.clientWidth, uit };
      });
      controleer(`${naam}: кожен id у документі трапляється один раз`, stand.dubbel.length === 0, stand.dubbel);
      controleer(`${naam}: без горизонтального прокручування`, stand.scroll <= stand.breedte + 1, stand);
      controleer(`${naam}: без помилок JavaScript`, jsFouten.length === 0, jsFouten);

      // Знімки самої карти для звіту: меню (розгорнуті групи) і «Спільний доступ».
      for (const sectie of ['menu', 'sharing']) {
        const blok = pagina.locator(`details[data-future-section="${sectie}"]`).first();
        if (!(await blok.count())) continue;
        await blok.evaluate((d) => { (d as HTMLDetailsElement).open = true; for (const g of d.querySelectorAll('details')) (g as HTMLDetailsElement).open = true; d.scrollIntoView({ block: 'start' }); });
        await pagina.waitForTimeout(900);
        await blok.screenshot({ path: join(uitvoer, `kaart-${sectie}-${breedte}-${taal}-${licht ? 'licht' : 'donker'}.png`), animations: 'disabled' });
      }
      await context.close();
    }
  } finally { await browser.close(); await new Promise<void>((ok) => server.close(() => ok())); }
  process.stdout.write(`Resultaat: ${fouten} mislukte controles.\n`);
  return fouten ? 1 : 0;
}
