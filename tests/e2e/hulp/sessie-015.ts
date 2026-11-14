// IDENTITEIT-015: спільні засоби приймальних e2e центру облікового запису. Кожна «особа» — окремий набір cookie (окремий
// пристрій або окремий пробний обліковий запис); вхід — підробленим Google (tests/eenheid/hulp/nep-google.ts), браузер — справжній
// Chromium. Помилки консолі й HTTP збираються для перевірки «без помилок». Знімки — лише з вигаданими адресами (example.test).
// Gedeelde hulp voor de acceptatie-e2e van IDENTITEIT-015: personen/apparaten als losse cookiesets, foutverzameling, schermafdrukken.
import { randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, Page } from 'playwright-core';

export const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai'].map((h) => `https://${h}.tarasevych.com`);
export const ID = 'https://id.tarasevych.com';
export const HUB = 'https://hub.tarasevych.com';

/** Набори пристроїв для перевірки вигляду (телефон 320, 380×800, планшет, комп'ютер). */
export const PRISTROI = [
  { naam: 'telefoon-320', width: 320, height: 720, touch: true },
  { naam: 'telefoon-380', width: 380, height: 800, touch: true },
  { naam: 'tablet-768', width: 768, height: 1024, touch: true },
  { naam: 'computer-1280', width: 1280, height: 860, touch: false },
  { naam: 'computer-1440', width: 1440, height: 900, touch: false },
] as const;

type NepBrowser = { jar: Map<string, string>; aanmelden: (sub: string, email: string, o?: Record<string, unknown>) => Promise<unknown>; verzoek: (host: string, pad: string, body?: unknown, o?: Record<string, unknown>) => Promise<{ status: number; data: any }>; ctxBody: (service?: string, extra?: Record<string, unknown>) => Record<string, unknown> };
type Nep = { browser: () => NepBrowser };

export type Persoon = { email: string; sub: string; b: NepBrowser; tab: string };

/** Пробна особа (вигадана адреса). Не власник сайту, якщо адреса не збігається з ownerEmail сервера. */
export async function persoon(G: Nep, naam: string, run: string, o: Record<string, unknown> = {}): Promise<Persoon> {
  const email = `e2e-${naam}-${run}@example.test`, sub = `sub-e2e-${naam}-${run}`, tab = randomBytes(24).toString('hex');
  const b = G.browser();
  await b.aanmelden(sub, email, { service: 'identity', tabContext: tab, intent: 'login', ...o });
  return { email, sub, b, tab };
}

/** Новий «пристрій»: окремий контекст браузера з cookie особи, мовою, темою й розміром. */
export async function apparaat(browser: Browser, p: Persoon, o: { taal?: 'uk' | 'nl'; thema?: 'light' | 'dark'; width?: number; height?: number; touch?: boolean; reducedMotion?: boolean; tijdzone?: string; fouten?: string[] } = {}) {
  const ctx = await browser.newContext({
    colorScheme: o.thema || 'light', locale: o.taal === 'nl' ? 'nl-NL' : 'uk-UA', viewport: { width: o.width || 1280, height: o.height || 860 },
    hasTouch: !!o.touch, isMobile: !!o.touch && (o.width || 1280) < 500, reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference',
    timezoneId: o.tijdzone || 'Europe/Brussels', serviceWorkers: 'block', acceptDownloads: true,
  });
  await ctx.addCookies([...p.b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
  await ctx.addInitScript((tb) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); }, p.tab);
  const page = await ctx.newPage();
  if (o.fouten) volgFouten(page, o.fouten);
  return { ctx, page };
}

/** Збирає помилки консолі, JS і HTTP ≥ 400 (з кодом відмови сервера), крім очікуваних. */
export function volgFouten(page: Page, fouten: string[], verwacht: RegExp[] = [/\/api\/owner\/agents\/activity$/]) {
  page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
  page.on('response', async (q) => {
    if (q.status() < 400 || verwacht.some((v) => v.test(q.url()))) return;
    const code = await q.json().then((j: { error?: string }) => j?.error || '').catch(() => '');
    fouten.push(`http ${q.status()} ${q.url()}${code ? ` (${code})` : ''}`);
  });
}

/** Розгортає всі <details> навколо елемента — як людина, що відкрила потрібний блок. */
export async function openBlok(page: Page, selector: string) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'attached', timeout: 15000 });
  await el.evaluate((x) => { let d: Element | null = x; while (d) { if (d instanceof HTMLDetailsElement) d.open = true; d = d.parentElement; } });
  await el.scrollIntoViewIfNeeded();
  return el;
}

/** Запит від імені сторінки (cookie браузера, без обходу Chrome). */
export async function api(page: Page, pad: string, body: Record<string, unknown> = {}) {
  return page.evaluate(async ([p, b]) => {
    const tab = sessionStorage.getItem('tsv-canonical-tab-v1') || '';
    const r = await fetch(p as string, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'identity', tabContext: tab, sourceOrigin: location.origin, ...(b as object) }) });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }, [pad, body] as const);
}

/** Горизонтальна прокрутка сторінки (має бути 0). */
export const horizontaal = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Маскує пробні адреси, коди й QR на знімку (знеособлення). */
export async function verberg(page: Page) {
  await page.addStyleTag({ content: '[data-ai-verborgen], canvas, svg[data-qr], .toegangscode-code, .herstelcode{filter:blur(7px)!important}' }).catch(() => undefined);
  await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (/@example\.test/.test(n.nodeValue || '')) n.nodeValue = (n.nodeValue || '').replace(/[\w.+-]+@example\.test/g, 'proef•••@example.test');
  });
}

export async function sluit(...ctxs: BrowserContext[]) { for (const c of ctxs) await c.close().catch(() => undefined); }
