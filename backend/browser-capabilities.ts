// Mogelijkheden van de browserextensie (opdrachttypes) en hun standaardinstellingen. Eén bron voor server, tools, routes en tests.
// De extensie heeft een eigen kopie (extension/shared.js); tests/eenheid/browser-extensie.test.ts controleert dat ze gelijk zijn.
//
// Per browser kiest de gebruiker welke mogelijkheden AAN staan (policy.enabled) en welke daarvan zonder klik mogen (policy.autoApprove).
// Handelen op de pagina (invoke, click, type, select, key) en screenshots/diepe diagnose kunnen NOOIT automatisch.

export const BROWSER_TYPES = [
  'browser.snapshot', 'browser.diagnostics', 'browser.tabs', 'browser.scroll', 'browser.wait',
  'browser.navigate', 'browser.history',
  'browser.invoke', 'browser.click', 'browser.type', 'browser.select', 'browser.key',
  'browser.screenshot', 'browser.deep_diagnostics',
  // 0.4 (0021): naar het voorbeeld van chrome-devtools-mcp; welke mogen, bepalen de grants (ai-grants.ts).
  'browser.console', 'browser.network', 'browser.self_test', 'browser.pages', 'browser.hover', 'browser.fill_form',
] as const;
export type BrowserType = typeof BROWSER_TYPES[number];

/** Standaard aan na het koppelen: alleen lezen en kijken. Al het andere zet de gebruiker zelf aan. */
export const BROWSER_DEFAULT_ENABLED: readonly BrowserType[] = ['browser.snapshot', 'browser.diagnostics', 'browser.tabs', 'browser.scroll', 'browser.wait'];

/** Mogen zonder klik als de gebruiker dat kiest (de rest wacht altijd op "Toestaan"). */
export const BROWSER_AUTO_APPROVABLE: readonly BrowserType[] = ['browser.snapshot', 'browser.diagnostics', 'browser.tabs', 'browser.scroll', 'browser.wait', 'browser.navigate', 'browser.history'];

/** Standaard direct (zonder klik): het lezen en kijken. */
export const BROWSER_DEFAULT_AUTO: readonly BrowserType[] = ['browser.snapshot', 'browser.diagnostics', 'browser.tabs', 'browser.scroll', 'browser.wait'];

export const isBrowserType = (v: unknown): v is BrowserType => typeof v === 'string' && (BROWSER_TYPES as readonly string[]).includes(v);

/** De ingeschakelde typen van een browseragent: de keuze van de gebruiker, of de standaard als er nog niets is gekozen. */
export function enabledTypes(policy: { enabled?: unknown } | null | undefined): string[] {
  const list = policy?.enabled;
  return Array.isArray(list) ? list.filter(isBrowserType) : [...BROWSER_DEFAULT_ENABLED];
}
