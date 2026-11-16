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
  // 0.4 (0021): naar het voorbeeld van chrome-devtools-mcp; welke mogen, bepalen de grants (ai-toestemmingen.ts).
  'browser.console', 'browser.network', 'browser.self_test', 'browser.pages', 'browser.hover', 'browser.fill_form',
  // 0.5 (0072): audit van de open pagina (lezen; cap browser.read).
  'browser.audit',
  // 0.7 (0110, zone E): evaluate_script via de debugger (cap browser.script; alleen technisch slot, pakket «diagnose», vinkje in de matrix).
  'browser.script',
  // LAI-CON-001 (0.9.6): ingebouwde AI van Chrome (offscreen.html); cap browser.read, beleid «Локальний ШІ» van de beheerder.
  'browser.lokale_ai',
] as const;
export type BrowserType = typeof BROWSER_TYPES[number];

/** Standaard aan na het koppelen: alleen lezen en kijken. Al het andere zet de gebruiker zelf aan. */
// LAI-CON-001 (рішення власника 16.11.2026: «доступний всім користувачам»): browser.lokale_ai staat standaard aan en mag zonder klik —
// het leest geen pagina en rekent op het apparaat van de gebruiker; beperken doen de beheerder (met reden), de matrix en de extensie.
export const BROWSER_DEFAULT_ENABLED: readonly BrowserType[] = ['browser.snapshot', 'browser.diagnostics', 'browser.tabs', 'browser.scroll', 'browser.wait', 'browser.lokale_ai'];

/** Mogen zonder klik als de gebruiker dat kiest (de rest wacht altijd op "Toestaan"). */
export const BROWSER_AUTO_APPROVABLE: readonly BrowserType[] = ['browser.snapshot', 'browser.diagnostics', 'browser.tabs', 'browser.scroll', 'browser.wait', 'browser.navigate', 'browser.history', 'browser.lokale_ai'];

/** Standaard direct (zonder klik): het lezen en kijken. */
export const BROWSER_DEFAULT_AUTO: readonly BrowserType[] = ['browser.snapshot', 'browser.diagnostics', 'browser.tabs', 'browser.scroll', 'browser.wait', 'browser.lokale_ai'];
/** Altijd ingeschakeld, ook in een eerder opgeslagen keuze (die kende dit type nog niet): anders zou «voor iedereen» niet gelden. */
export const BROWSER_ALTIJD_AAN: readonly BrowserType[] = ['browser.lokale_ai'];

export const isBrowserType = (v: unknown): v is BrowserType => typeof v === 'string' && (BROWSER_TYPES as readonly string[]).includes(v);

/** De ingeschakelde typen van een browseragent: de keuze van de gebruiker, of de standaard als er nog niets is gekozen. */
export function enabledTypes(policy: { enabled?: unknown; kent?: unknown } | null | undefined): string[] {
  const list = policy?.enabled;
  if (!Array.isArray(list)) return [...BROWSER_DEFAULT_ENABLED];
  const gekozen = list.filter(isBrowserType);
  // Review PR #137: alleen typen die de gebruiker bij zijn keuze nog NIET kende (policy.kent, sinds 0.9.6) krijgen hun standaard;
  // wat hij kende en wegliet, blijft uit.
  const kent = Array.isArray(policy?.kent) ? (policy!.kent as unknown[]) : [];
  return [...gekozen, ...BROWSER_ALTIJD_AAN.filter((t) => !gekozen.includes(t) && !kent.includes(t))];
}
