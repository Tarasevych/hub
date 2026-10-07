// Gedeelde regels van de Mijn Ruimte-extensie (ook getest in tests/eenheid/browser-extensie.test.ts).
// De server controleert hetzelfde (backend/connectors-tools.ts: isOwnSiteUrl); de extensie vertrouwt er niet op.

export const ALLOWED_COMMANDS = ['browser.snapshot', 'browser.navigate', 'browser.invoke', 'browser.click', 'browser.type'];

/** Alleen https op tarasevych.com en subdomeinen, zonder inloggegevens in de URL. */
export function isOwnSiteUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 500) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password && (u.hostname === 'tarasevych.com' || u.hostname.endsWith('.tarasevych.com'));
  } catch { return false; }
}

/** Een veld waar de extensie nooit in typt en dat ze nooit uitleest (wachtwoord, betaalgegevens, eenmalige codes). */
export function isSensitiveField(el) {
  if (!el) return false;
  const type = String(el.type || '').toLowerCase();
  const ac = String(el.getAttribute ? el.getAttribute('autocomplete') || '' : '').toLowerCase();
  return type === 'password' || /^cc-|one-time-code|current-password|new-password/.test(ac);
}

/** Kies precies een element op naam: eerst exact (hoofdletterongevoelig), anders unieke deelovereenkomst. */
export function pickByName(items, name) {
  const wanted = String(name || '').trim().toLowerCase();
  if (!wanted) return { error: 'empty name' };
  const exact = items.filter((it) => it.name.toLowerCase() === wanted);
  if (exact.length === 1) return { item: exact[0] };
  if (exact.length > 1) return { error: `ambiguous: ${exact.length} controls are named "${name}"` };
  const partial = items.filter((it) => it.name.toLowerCase().includes(wanted));
  if (partial.length === 1) return { item: partial[0] };
  return { error: partial.length ? `ambiguous: ${partial.length} controls contain "${name}"` : `no control named "${name}" (use browser_snapshot to see the names)` };
}
