// Gedeelde regels van de Mijn Ruimte-extensie (ook getest in tests/eenheid/browser-extensie.test.ts).
// De server controleert hetzelfde (backend/connectors-tools.ts: isOwnSiteUrl); de extensie vertrouwt er niet op.

export const ALLOWED_COMMANDS = [
  'browser.snapshot', 'browser.diagnostics', 'browser.tabs', 'browser.scroll', 'browser.wait',
  'browser.navigate', 'browser.history',
  'browser.invoke', 'browser.click', 'browser.type', 'browser.select', 'browser.key',
  'browser.screenshot', 'browser.deep_diagnostics',
  'browser.console', 'browser.network', 'browser.self_test', 'browser.pages', 'browser.hover', 'browser.fill_form',
];

/** Toetsen die de extensie mag indrukken (alleen navigatie, geen letters of sneltoetsen). */
export const ALLOWED_KEYS = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'];

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

// ---- 0.4.0: gedeeld tussen background.js, bridge.js en de tests ----

/** Adres zonder querystring en fragment (tokens, codes en zoektermen komen nooit in diagnose of status terecht). */
export function stripQuery(raw) {
  try { const u = new URL(raw); return u.origin + u.pathname; } catch { return String(raw || '').split(/[?#]/)[0].slice(0, 200); }
}

/** Valt een adres binnen de domeinen van een grant? Leeg = alle eigen subdomeinen. Zelfde regel als ai-grants.ts urlInScope. */
export function urlInScope(raw, domains) {
  if (!isOwnSiteUrl(raw)) return false;
  if (!Array.isArray(domains) || domains.length === 0) return true;
  const host = new URL(raw).hostname;
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Accountclaim van de pagina: <meta name="mjn-account" content="userId:sessionTag">. null = geen of ongeldige claim. */
export function parseAccountClaim(content) {
  if (typeof content !== 'string' || content.length > 300) return null;
  const i = content.lastIndexOf(':');
  if (i <= 0) return null;
  const userId = content.slice(0, i).trim();
  const sessionTag = content.slice(i + 1).trim();
  if (!/^[A-Za-z0-9_.@-]{1,200}$/.test(userId) || !/^[A-Za-z0-9_-]{0,64}$/.test(sessionTag)) return null;
  return { userId, sessionTag };
}

/**
 * Hoort deze pagina bij het gekoppelde account? 'ok' | 'mismatch' (ander account ingelogd: opdrachten weigeren, badge geel) |
 * 'unknown' (pagina zonder claim, bijvoorbeeld uitgelogd: ook weigeren, want we weten niet wie er is).
 */
export function accountState(claim, pairedUserId) {
  if (!claim || !pairedUserId) return 'unknown';
  return claim.userId === pairedUserId ? 'ok' : 'mismatch';
}

/** Zelfde tekst als backend/connectors-crypto.ts commandSigText. */
async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const b64urlToBytes = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));

/** Controleer de HMAC van een opdracht (sleutel per koppeling). true alleen bij een geldige, niet verlopen handtekening. */
export async function verifyCommand(keyB64url, msg, now = Date.now()) {
  if (!keyB64url || !msg || typeof msg.sig !== 'string' || typeof msg.exp !== 'number' || msg.exp < now || msg.exp > now + 10 * 60 * 1000) return false;
  const text = `v1\n${msg.id}\n${msg.type}\n${await sha256Hex(JSON.stringify(msg.params ?? {}))}\n${msg.exp}`;
  const key = await crypto.subtle.importKey('raw', b64urlToBytes(keyB64url), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  let sig;
  try { sig = /^[0-9a-f]{64}$/.test(msg.sig) ? Uint8Array.from(msg.sig.match(/../g).map((h) => parseInt(h, 16))) : b64urlToBytes(msg.sig); } catch { return false; }
  return crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(text));
}

/** Welke mogelijkheid hoort bij een opdracht (zelfde indeling als ai-grants.ts TYPE_CAPABILITY, alleen browser). */
export const TYPE_CAPABILITY = {
  'browser.snapshot': 'browser.read', 'browser.diagnostics': 'browser.read', 'browser.tabs': 'browser.read', 'browser.scroll': 'browser.read',
  'browser.wait': 'browser.read', 'browser.console': 'browser.read', 'browser.network': 'browser.read', 'browser.self_test': 'browser.read',
  'browser.navigate': 'browser.navigate', 'browser.history': 'browser.navigate', 'browser.pages': 'browser.navigate',
  'browser.invoke': 'browser.interact', 'browser.click': 'browser.interact', 'browser.type': 'browser.interact', 'browser.select': 'browser.interact',
  'browser.key': 'browser.interact', 'browser.hover': 'browser.interact', 'browser.fill_form': 'browser.interact',
  'browser.screenshot': 'browser.screenshot', 'browser.deep_diagnostics': 'browser.debug',
};

export const DIAG_LIMITS = Object.freeze({ maxEntries: 200, ttlMs: 15 * 60 * 1000 });

/** Diagnosebuffer: hoogstens 200 regels, ouder dan de TTL valt weg; wat eruit valt komt terug (voor het versleutelde archief). */
export function pushDiag(buffer, entry, now = Date.now()) {
  const keep = []; const spill = [];
  for (const e of buffer) (now - e.at > DIAG_LIMITS.ttlMs ? spill : keep).push(e);
  keep.push({ ...entry, at: now, url: entry.url ? stripQuery(entry.url) : undefined });
  while (keep.length > DIAG_LIMITS.maxEntries) spill.push(keep.shift());
  return { buffer: keep, spill };
}
