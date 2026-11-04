// Technisch profiel aanzetten in een e2e-test (zoals diagnose.e2e): via de API van de ingelogde eigenaar, voor deze
// tabContext. Nodig sinds de audit van 14.10: beheerpagina's (mcp/dashboard, /apps, /download, agents#beleid) tonen zonder
// technisch profiel de poort «Управління сайтом» en staan niet in het accountmenu.
type Page = import('playwright-core').Page;

export async function techAan(page: Page, o: { url: string; tab: string; service: string; minuten?: number; reden?: string }): Promise<number> {
  // Eerst op de oorsprong staan, anders heeft fetch geen cookies.
  if (!page.url().startsWith(o.url)) await page.goto(`${o.url}/`, { waitUntil: 'domcontentloaded' });
  const status = await page.evaluate(async (a) => (await fetch('/api/owner/tech/activeren', {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ service: a.service, tabContext: a.tab, sourceOrigin: location.origin, minuten: a.minuten, reden: a.reden }),
  })).status, { service: o.service, tab: o.tab, minuten: o.minuten ?? 15, reden: o.reden ?? 'E2E' });
  return status;
}

/** De poort die een beheerpagina toont zonder technisch profiel. */
export const techPoort = (page: Page) => page.locator('[data-tech-poort="1"]');
