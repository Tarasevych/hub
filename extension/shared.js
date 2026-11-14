// Gedeelde regels van de Mijn Ruimte-extensie (ook getest in tests/eenheid/browser-extensie.test.ts).
// De server controleert hetzelfde (backend/connectors-hulpmiddelen.ts: isOwnSiteUrl); de extensie vertrouwt er niet op.

export const ALLOWED_COMMANDS = [
  'browser.snapshot', 'browser.diagnostics', 'browser.tabs', 'browser.scroll', 'browser.wait',
  'browser.navigate', 'browser.history',
  'browser.invoke', 'browser.click', 'browser.type', 'browser.select', 'browser.key',
  'browser.screenshot', 'browser.deep_diagnostics',
  'browser.console', 'browser.network', 'browser.self_test', 'browser.pages', 'browser.hover', 'browser.fill_form',
  'browser.audit', // 0.5.0
  'browser.script', // 0.7.0: evaluate_script via chrome.debugger (alleen technisch slot, pakket «diagnose», cap browser.script)
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
  if (el.getAttribute && (el.getAttribute('data-geheim-invoer') || el.getAttribute('data-scherm-toetsenbord'))) return true;
  return type === 'password' || /^cc-|one-time-code|current-password|new-password/.test(ac);
}

/**
 * 0.7.0 (zone E): element-uid zoals chrome-devtools-mcp ("<index>_<hash van de naam>"). De index is de plaats in de lijst van
 * bedieningselementen van browser_snapshot; de hash maakt de uid bestand tegen een verschoven DOM (dan zoeken we op de hash).
 * Zuiver (ook getest zonder DOM).
 */
export const UID_RE = /^(\d{1,3})_([a-z0-9]{1,8})$/;
export function naamHash(s) {
  let h = 0x811c9dc5;
  const t = String(s || '');
  for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36).slice(0, 6);
}
export const uidVan = (index, name) => `${index}_${naamHash(name)}`;
/** Kies een element op uid (uit de snapshot) of op naam. `filter` beperkt tot een soort (tekstveld, keuzelijst). */
export function kiesElement(items, params, filter) {
  const p = params || {};
  if (typeof p.uid === 'string' && p.uid) {
    const m = UID_RE.exec(p.uid);
    if (!m) return { error: `invalid uid "${String(p.uid).slice(0, 20)}" (use one from take_snapshot)` };
    const i = Number(m[1]);
    let item = items[i] && naamHash(items[i].name) === m[2] ? items[i] : null;
    if (!item) {
      const zelfde = items.filter((it) => naamHash(it.name) === m[2]);
      if (zelfde.length !== 1) return { error: zelfde.length ? `ambiguous uid ${p.uid}: take a new snapshot` : `uid ${p.uid} is no longer on the page: take a new snapshot` };
      item = zelfde[0];
    }
    if (filter && !filter(item)) return { error: `uid ${p.uid} is not a control of this kind (role ${item.role || '?'})` };
    return { item };
  }
  return pickByName(filter ? items.filter(filter) : items, p.name);
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

/** Valt een adres binnen de domeinen van een grant? Leeg = alle eigen subdomeinen. Zelfde regel als ai-toestemmingen.ts urlInScope. */
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

/** Welke mogelijkheid hoort bij een opdracht (zelfde indeling als ai-toestemmingen.ts TYPE_CAPABILITY, alleen browser). */
export const TYPE_CAPABILITY = {
  'browser.snapshot': 'browser.read', 'browser.diagnostics': 'browser.read', 'browser.tabs': 'browser.read', 'browser.scroll': 'browser.read',
  // console/netwerk blijven browser.read (zoals 0.6); de rij «Консоль і мережа» van de matrix dwingt de server af.
  'browser.wait': 'browser.read', 'browser.console': 'browser.read', 'browser.network': 'browser.read', 'browser.self_test': 'browser.read',
  'browser.audit': 'browser.read', 'browser.script': 'browser.script',
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

// ---- 0.5.0: ontgrendeling met een passkey (zie shared/extensie-ontgrendeling.ts) en strikte controle van elke opdracht ----
// Dezelfde waarden als de TypeScript-versie; tests/eenheid/extensie-vergrendeling.test.ts vergelijkt ze.

// 0.7.0: 'browser.console' (console + netwerk) en 'browser.script' (evaluate_script) erbij — zelfde lijst als shared/extensie-ontgrendeling.ts.
export const BROWSER_CAPS = Object.freeze(['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug', 'browser.script']);
/** Lokale agent (Native Messaging) mag nooit meer dan lezen. */
export const LOKAAL_CAPS = Object.freeze(['browser.read']);
/** Alle hosts die bij een ontgrendeling gekozen mogen worden (eigen diensten). */
export const ADMIN_HOSTS_TOEGESTAAN = Object.freeze([
  'admin.tarasevych.com', 'mcp.tarasevych.com', 'hub.tarasevych.com', 'id.tarasevych.com', 'ai.tarasevych.com',
  'mail.tarasevych.com', 'cloud.tarasevych.com', 'github.tarasevych.com', 'huis.tarasevych.com', 'api.tarasevych.com',
]);
/** 0.7.0: de eigenaar kiest de termijn zelf (tot een jaar, beide ruimtes); 480 was de grens tot 0.6.2 (MAX_MINUTEN_OUD op de server). */
export const MAX_MINUTEN = 366 * 24 * 60;
/** Speling voor klokverschil tussen server en browser. */
export const KLOK_SPELING_MS = 60_000;

// ---- 0.6.1: debuggerrecht + zichtbare markering (punten 7 en 8 van de eigenaar, 19.10.2026) ----
// Dezelfde waarden als shared/extensie-ontgrendeling.ts; tests/eenheid/extensie-debugger-markering-20261019.test.ts vergelijkt ze.

/** Onder deze versie weigert de server een ontgrendeling (de site vraagt dan om bijwerken, zie shared/extensie-update.ts). */
export const MIN_EXTENSIE_VERSIE = '0.6.2';

/** Standen van het Chrome-recht `debugger`. Zie DIAG_RECHT_STANDEN in shared/extensie-ontgrendeling.ts. */
export const DIAG_RECHT_STANDEN = Object.freeze(['ja', 'nee', 'geweigerd', 'ingetrokken', 'niet-aanvraagbaar']);
export const isDiagRechtStand = (v) => DIAG_RECHT_STANDEN.includes(v);
/** Pakket waarin `debugger` vast in het manifest staat. */
export const DIAG_PAKKET = 'mijn-ruimte-extension-diagnose.zip';
/** Diepe diagnose (chrome.debugger) mag ALLEEN in deze ruimte en alleen met deze mogelijkheid in de ontgrendeling. */
export const DIAG_RUIMTE = 'technisch';
export const DIAG_CAP = 'browser.debug';

/**
 * Waarom permissions.request mislukte. Chrome staat `debugger` niet toe als optioneel recht: het verzoek eindigt altijd met
 * «Only permissions specified in the manifest may be requested» (zie deploy/BROWSER-EXTENSIE.md). Die fout is dus GEEN weigering
 * van de gebruiker en mag niet als zo'n weigering gemeld worden.
 */
export function diagRechtStandVanFout(fout) {
  const m = String((fout && fout.message) || fout || '').toLowerCase();
  if (!m) return 'geweigerd';
  if (/only permissions specified in the manifest|cannot be optional|not a recognized permission|unknown permission/.test(m)) return 'niet-aanvraagbaar';
  if (/user gesture/.test(m)) return 'nee';
  return 'geweigerd';
}

/** Mag de debugger NU aanhaken? Zuiver, zodat de test de hele keten kan nalopen zonder Chrome. */
export function debuggerToegestaan({ recht, optIn, ruimte, url, grant, profiel, cap = DIAG_CAP }) {
  if (recht !== true) return { ok: false, code: 'GEEN_RECHT' };
  if (optIn !== true) return { ok: false, code: 'GEEN_OPT_IN' };
  if (ruimte !== DIAG_RUIMTE) return { ok: false, code: 'VERKEERDE_RUIMTE' };
  if (!grant || !Array.isArray(grant.caps) || !grant.caps.includes(cap)) return { ok: false, code: 'GEEN_ONTGRENDELING' };
  if (!adresInRuimte(DIAG_RUIMTE, url, grant.domeinen)) return { ok: false, code: 'DOMEIN' };
  if (!ADMIN_HOSTS_TOEGESTAAN.includes(new URL(url).hostname)) return { ok: false, code: 'HOST' };
  if (!profielToegestaan(DIAG_RUIMTE, profiel)) return { ok: false, code: 'PROFIEL' };
  return { ok: true };
}

/** Kleur van de markering per ruimte (dunne rand op de pagina) en de badge op het pictogram. */
export const MARKERING_KLEUREN = Object.freeze({ prive: '#1a7f37', technisch: '#b45309' });
export const MARKERING_BADGE = Object.freeze({ prive: 'ON', technisch: 'TECH' });

/**
 * Moet de markering op DEZE pagina aan staan? Alleen als het slot van dit tabblad echt open én verbonden is (WSS 'ready'), het
 * profiel van de pagina bij dat slot past en deze host in de ontgrendeling staat. Zuiver; `slot` is de publieke vorm.
 */
export function markeringVoor(slot, ruimte, profiel, url) {
  if (!slot || typeof slot !== 'object' || !isRuimte(ruimte)) return null;
  if (slot.gekoppeld !== true || slot.verbonden !== true) return null;
  if (slot.staat !== 'ontgrendeld' && slot.staat !== 'agent') return null;
  if (!profielToegestaan(ruimte, profiel)) return null;
  if (!adresInRuimte(ruimte, url, Array.isArray(slot.domeinen) ? slot.domeinen : [])) return null;
  return { ruimte, kleur: MARKERING_KLEUREN[ruimte], agent: slot.aiVerbonden === true };
}

// ---- 0.6.0: twee sloten (ruimtes) — 'prive' (gebruiker, eigen diensten) en 'technisch' (sitebeheer) ----
// Zie shared/ai-ruimte.ts (ruimteOf) en contract 0.6 §1–§2. Elk slot is een eigen koppeling (agent) met eigen geheimen,
// eigen WebSocket en eigen ontgrendeling; een opdracht van slot X gebruikt alleen de ontgrendeling van slot X.
export const RUIMTES = Object.freeze(['prive', 'technisch']);
export const isRuimte = (v) => v === 'prive' || v === 'technisch';
/** Onbekend of leeg → 'prive' (minste rechten), zelfde regel als shared/ai-ruimte.ts ruimteOf. */
export const ruimteOf = (v) => (v === 'technisch' ? 'technisch' : 'prive');
/** Eigen diensten van de gebruiker (slot prive). NOOIT admin.* of api.*. */
export const PRIVE_HOSTS = Object.freeze([
  'hub.tarasevych.com', 'mail.tarasevych.com', 'cloud.tarasevych.com', 'ai.tarasevych.com', 'id.tarasevych.com',
  'github.tarasevych.com', 'huis.tarasevych.com', 'mcp.tarasevych.com',
]);
/** Hosts die een ontgrendeling van deze ruimte mag noemen. */
export const hostsVoorRuimte = (ruimte) => (ruimte === 'technisch' ? ADMIN_HOSTS_TOEGESTAAN : PRIVE_HOSTS);
/** Prive: hoogstens 30 dagen (keuze 1|7|30 op de site); technisch: hoogstens 480 minuten (lopende activering). */
export const PRIVE_MAX_MINUTEN = 366 * 24 * 60;
export const maxMinutenVoorRuimte = (ruimte) => (ruimte === 'technisch' ? MAX_MINUTEN : PRIVE_MAX_MINUTEN);

/**
 * Profiel van een tabblad uit <meta name="mjn-profiel" content="gebruiker|technisch" data-zeker="1|0">.
 * SEC-002 extensie-03/04 (12.11.2026): GESLOTEN bij twijfel. Vroeger was alles behalve exact 'technisch' meteen 'gebruiker' — een
 * technisch tabblad dat nog laadde, waarvan de status niet opgehaald kon worden of waarvan het achtergrondproces de stand kwijt was,
 * gold daardoor als gebruikerstabblad en de AI van de privéruimte mocht het lezen en bedienen. Nu zijn er drie uitkomsten:
 *   'technisch'  exact die inhoud;
 *   'gebruiker'  exact die inhoud, en de site zegt er NIET bij dat zij het nog niet weet: de site zet data-zeker="0" zolang het
 *                eerste geldige antwoord van /tech/status er niet is (laden, netwerkfout) en data-zeker="1" daarna;
 *   'onbekend'   al het andere (geen meta, andere inhoud, data-zeker="0") → geen enkel slot mag het tabblad raken.
 * `zeker` = de ruwe waarde van data-zeker (of false). Weglaten = geen voorbehoud: de waarde is al door een brug beoordeeld (het
 * achtergrondproces krijgt 'gebruiker' | 'technisch' | 'onbekend'), of de pagina komt van een site-versie zonder dit attribuut.
 */
export const PROFIELEN = Object.freeze(['gebruiker', 'technisch']);
export const PROFIEL_ONBEKEND = 'onbekend';
export function parseProfiel(content, zeker) {
  const c = typeof content === 'string' ? content.trim() : '';
  if (c === 'technisch') return 'technisch';
  if (c === 'gebruiker' && zeker !== false && zeker !== '0') return 'gebruiker';
  return PROFIEL_ONBEKEND;
}
/**
 * Mag een opdracht van slot `ruimte` een tabblad met dit profiel raken?
 *  technisch → alleen een tabblad dat NU in de technische modus is (profiel 'technisch');
 *  prive     → alleen een tabblad dat ZEKER een gebruikerstabblad is (profiel 'gebruiker'); nooit een technisch en nooit een
 *              onbekend tabblad (de AI van de gebruiker ziet nooit wat het beheer in dat tabblad toont).
 */
export function profielToegestaan(ruimte, profiel) {
  return ruimte === 'technisch' ? profiel === 'technisch' : profiel === 'gebruiker';
}

// ---- 12.11.2026 (SEC-002 extensie-02 / extensie-09): zones die de SITE zelf afschermt voor een AI ----
/** Hier mag een AI niets bedienen: knoppen die een AI rechten of uitvoering geven (goedkeuren, toestemming, «Відкрити доступ», step-up). */
export const AI_GEEN_ACTIE = 'data-ai-geen-actie';
/** Dit mag een AI niet LEZEN: koppelcodes, zojuist gemaakte tokens, herstelcodes (tekst op de pagina, geen invoerveld). */
export const AI_VERBORGEN = 'data-ai-verborgen';
export const AI_GEEN_ACTIE_FOUT = 'Refused: this control decides what an AI may do; only the person at the screen can use it';
/**
 * Ook zonder attribuut afgeschermd: de beslisvensters zelf. Ze worden via een portal in <body> getekend (src/platform/vensters.tsx,
 * data-venster=<id>), dus een attribuut op de omringende pagina bereikt ze niet: het OAuth-venster «Доступ для …» en de
 * koppelwizard van connector v2 (beide 'mcp-toestemming') en «Підтвердіть доступ» (step-up).
 * Na de toets (g10a-2): ook de andere plekken waar een AI zichzelf rechten of uitvoering zou kunnen geven, op hun vaste wortel-
 * attributen (dus ook in schermen die zelf nog geen data-ai-geen-actie zetten): toestemmingen per apparaat en sets (data-ai-grants),
 * de wachtrij «Запити ШІ на підтвердження» (bevestigen, weigeren, keuzes, Google-toegang), scopes van een verbinding (data-toegang),
 * schakelaars van de site, AI verbinden/duur, het bord met rechten per klant en de schakelaar «browser voor AI».
 */
export const AI_GEEN_ACTIE_SELECTOR = [`[${AI_GEEN_ACTIE}]`, '[data-venster="mcp-toestemming"]', '[data-venster="bevestig-toegang"]', '#bevestig-toegang-wortel',
  '[data-ai-grants]', '[data-ab-bevestig]', '[data-ab-weiger]', '.ab-keuzes', '[data-ab-google]', '[data-toegang]', '[data-site-schakelaars]',
  '[data-ai-verbinden]', '[data-agent-bord]', '[data-browser-ai-schakelaar]'].join(', ');
const binnen = (el, sel) => { try { return !!(el && typeof el.closest === 'function' && el.closest(sel)); } catch { return false; } };
/** Staat dit element in (of is het zelf) een zone waar een AI niets mag bedienen? */
export const inAiGeenActie = (el) => binnen(el, AI_GEEN_ACTIE_SELECTOR);
/** Enter in een veld verstuurt het formulier: dat telt als bedienen van een afgeschermde knop als het formulier er een bevat. */
export function formulierMetAiGeenActie(el) {
  try { const f = el && el.form; return !!(f && (f.hasAttribute(AI_GEEN_ACTIE) || (typeof f.querySelector === 'function' && f.querySelector(AI_GEEN_ACTIE_SELECTOR)))); } catch { return false; }
}
/**
 * Na de toets (g10a-3): niet alleen [data-ai-verborgen], ook de andere eenmalig getoonde geheimen op hun vaste attributen/klassen —
 * token van een nieuwe MCP-verbinding (AiVerbinden), token van het bord (AgentBord), toegangscode (Toegangscodes), API-sleutel
 * (ApiPlatformWeergave), TOTP-sleutel (toegangslaag, aanmeld-vnext), nieuwe herstelcodes en het tijdelijke wachtwoord.
 */
export const AI_VERBORGEN_SELECTOR = [`[${AI_VERBORGEN}]`, '[data-vers-token]', '[data-token-eenmaal]', '.toegangscode-code', '[data-api-plaintext-once]',
  '.access-plane-secret', '.amv-geheim', '[data-herstel-nieuw]', '.herstel-raster', '.access-plane-recovery-codes'].join(', ');
export const inAiVerborgen = (el) => binnen(el, AI_VERBORGEN_SELECTOR);
/** Adres binnen een ontgrendeling van `ruimte`: exacte host ∈ domeinen én ∈ hosts van die ruimte (prive dus nooit admin.*). */
export function adresInRuimte(ruimte, url, domeinen) {
  if (!hostToegestaan(url, domeinen)) return false;
  return hostsVoorRuimte(ruimte).includes(new URL(url).hostname);
}

/**
 * Canonieke tekst die de server ondertekent (identiek aan ontgrendelTekst in shared/extensie-ontgrendeling.ts, v2):
 * mr-ontgrendeling-v2, gid, agentId, userId, ruimte, caps, domeinen, lokaal, iat, exp, nonce — lijsten gesorteerd, komma-gescheiden.
 */
export function ontgrendelTekst(g) {
  const lijst = (a) => [...a].map(String).sort().join(',');
  return ['mr-ontgrendeling-v2', g.gid, g.agentId, g.userId, g.ruimte, lijst(g.caps), lijst(g.domeinen), g.lokaal ? '1' : '0', String(g.iat), String(g.exp), g.nonce].join('\n');
}

/** Exacte host-match: het adres is een eigen https-adres en de host staat letterlijk in de lijst (geen subdomeinen erbij). */
export function hostToegestaan(url, domeinen) {
  if (!isOwnSiteUrl(url) || !Array.isArray(domeinen) || domeinen.length === 0) return false;
  const u = new URL(url);
  return u.port === '' && domeinen.includes(u.hostname); // review 18.10: geen andere poort op dezelfde host
}

const isGewoonObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const VEILIG_ID = /^[A-Za-z0-9_.@-]{1,200}$/;
const UNIEK = (a) => new Set(a).size === a.length;

/** Alleen de ondertekende velden, met vaste vorm; null = ongeldige vorm. Extra velden worden genegeerd (niet ondertekend). */
function vormOntgrendeling(g) {
  if (!isGewoonObject(g)) return { code: 'VORM' };
  if (g.v !== 2) return { code: 'VERSIE' }; // 0.6: alleen v2 (met ruimte); v1 is nooit live geweest en wordt geweigerd
  const ok = typeof g.gid === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(g.gid)
    && typeof g.agentId === 'string' && VEILIG_ID.test(g.agentId) && typeof g.userId === 'string' && VEILIG_ID.test(g.userId)
    && isRuimte(g.ruimte)
    && Array.isArray(g.caps) && g.caps.length > 0 && g.caps.length <= BROWSER_CAPS.length && g.caps.every((c) => typeof c === 'string') && UNIEK(g.caps)
    && Array.isArray(g.domeinen) && g.domeinen.length > 0 && g.domeinen.length <= ADMIN_HOSTS_TOEGESTAAN.length && g.domeinen.every((d) => typeof d === 'string') && UNIEK(g.domeinen)
    && typeof g.lokaal === 'boolean' && Number.isSafeInteger(g.iat) && g.iat > 0 && Number.isSafeInteger(g.exp) && g.exp > 0
    && typeof g.nonce === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(g.nonce);
  if (!ok) return { code: 'VORM' };
  return { grant: { v: 2, gid: g.gid, agentId: g.agentId, userId: g.userId, ruimte: g.ruimte, caps: [...g.caps], domeinen: [...g.domeinen], lokaal: g.lokaal, iat: g.iat, exp: g.exp, nonce: g.nonce } };
}

/**
 * Controleer een ontgrendeling van de server. {ok:true, grant} (alleen de ondertekende velden) | {ok:false, code}.
 * Volgorde: vorm (v2) → handtekening (HMAC-SHA256 met de opdrachtsleutel van DIT slot, hex) → eigen koppeling (agentId, userId,
 * ruimte = slot) → tijd → duur (per ruimte) → caps → domeinen (per ruimte: technisch ⊂ ADMIN_HOSTS_TOEGESTAAN, prive ⊂ PRIVE_HOSTS).
 * `eigen` = { agentId, userId, ruimte }.
 */
export async function verifyOntgrendeling(keyB64url, grant, sig, eigen, now = Date.now()) {
  if (!keyB64url || typeof keyB64url !== 'string') return { ok: false, code: 'GEEN_SLEUTEL' };
  const vorm = vormOntgrendeling(grant);
  if (!vorm.grant) return { ok: false, code: vorm.code };
  const g = vorm.grant;
  if (typeof sig !== 'string' || !/^[0-9a-f]{64}$/.test(sig)) return { ok: false, code: 'HANDTEKENING' };
  let geldig = false;
  try {
    const key = await crypto.subtle.importKey('raw', b64urlToBytes(keyB64url), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    geldig = await crypto.subtle.verify('HMAC', key, Uint8Array.from(sig.match(/../g).map((h) => parseInt(h, 16))), new TextEncoder().encode(ontgrendelTekst(g)));
  } catch { return { ok: false, code: 'GEEN_SLEUTEL' }; }
  if (!geldig) return { ok: false, code: 'HANDTEKENING' };
  if (!eigen || typeof eigen.agentId !== 'string' || !eigen.agentId || g.agentId !== eigen.agentId) return { ok: false, code: 'AGENT' };
  if (typeof eigen.userId !== 'string' || !eigen.userId || g.userId !== eigen.userId) return { ok: false, code: 'GEBRUIKER' };
  if (!isRuimte(eigen.ruimte) || g.ruimte !== eigen.ruimte) return { ok: false, code: 'RUIMTE' };
  if (g.iat > now + KLOK_SPELING_MS) return { ok: false, code: 'TOEKOMST' };
  if (g.exp <= now) return { ok: false, code: 'VERLOPEN' };
  if (g.exp <= g.iat || g.exp - g.iat > maxMinutenVoorRuimte(g.ruimte) * 60_000) return { ok: false, code: 'TE_LANG' };
  if (!g.caps.every((c) => BROWSER_CAPS.includes(c))) return { ok: false, code: 'CAPS' };
  if (!g.domeinen.every((d) => hostsVoorRuimte(g.ruimte).includes(d))) return { ok: false, code: 'DOMEINEN' };
  return { ok: true, grant: g };
}

// ---- valideerOpdracht: schema per opdrachttype ----
// Afgeleid van wat de server stuurt (backend/connectors-hulpmiddelen.ts: BROWSER_TOOLS, DEVTOOLS_ALIASES, validateParams; de sleutel
// "browser" haalt de server er zelf af) en wat background.js en bridge.js werkelijk lezen. Onbekende sleutels = weigeren.

/** Control-tekens, regel-/alineascheiders en bidi-overschrijvingen (Trojan Source) zijn nergens toegestaan. */
const CONTROLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
/** In typtekst mogen \t en \n (\r\n wordt \n). */
const CONTROLE_TYP = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/;
const VERBODEN_SLEUTEL = new Set(['__proto__', 'constructor', 'prototype']);
const SCROLL_RICHTINGEN = ['up', 'down', 'top', 'bottom'];
const GESCHIEDENIS = ['back', 'forward', 'reload'];
const CONSOLE_SOORTEN = ['error', 'warn', 'log', 'info', 'debug'];
export const AUDIT_SOORTEN = Object.freeze(['alles', 'prestaties', 'beveiliging', 'dom']);
const ACTIE_ID = /^[a-z][a-z0-9_]{0,63}$/;
const ARG_SLEUTEL = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

const goed = (v) => ({ ok: true, v });
const mis = (code, detail) => ({ ok: false, code, detail });

const tekst = (min, max) => (v) => {
  if (typeof v !== 'string') return mis('TYPE', 'tekst verwacht');
  if (v.length > max || v.length < min || (min > 0 && !v.trim())) return mis('LENGTE', `${min}-${max} tekens`);
  if (CONTROLE.test(v)) return mis('CONTROLETEKEN', 'control-tekens zijn niet toegestaan');
  return goed(v);
};
const typtekst = (max) => (v) => {
  if (typeof v !== 'string') return mis('TYPE', 'tekst verwacht');
  const n = v.replace(/\r\n/g, '\n');
  if (n.length > max) return mis('LENGTE', `hoogstens ${max} tekens`);
  if (CONTROLE_TYP.test(n)) return mis('CONTROLETEKEN', 'alleen \\n en \\t zijn toegestaan');
  return goed(n);
};
const keuze = (lijst) => (v) => (typeof v === 'string' && lijst.includes(v) ? goed(v) : mis('WAARDE', `één van: ${lijst.join(', ')}`));
const getal = (min, max, geheel = false) => (v) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!geheel || Number.isInteger(v))
  ? goed(v) : mis('WAARDE', `${geheel ? 'geheel ' : ''}getal ${min}-${max}`));
const janee = () => (v) => (typeof v === 'boolean' ? goed(v) : mis('TYPE', 'true of false'));
const eigenUrl = () => (v) => (typeof v === 'string' && !CONTROLE.test(v) && isOwnSiteUrl(v) ? goed(v) : mis('URL', 'alleen https-adressen op tarasevych.com zonder inloggegevens'));
const patroon = (re, uitleg) => (v) => (typeof v === 'string' && re.test(v) ? goed(v) : mis('WAARDE', uitleg));
const lijstVan = (item, min, max) => (v) => {
  if (!Array.isArray(v)) return mis('TYPE', 'lijst verwacht');
  if (v.length < min || v.length > max) return mis('LENGTE', `${min}-${max} items`);
  const uit = [];
  for (let i = 0; i < v.length; i += 1) { const r = item(v[i]); if (!r.ok) return mis(r.code, `[${i}] ${r.detail}`); uit.push(r.v); }
  return goed(uit);
};
const object = (velden) => (v) => controleerObject(velden, v);

/** Vrije argumenten van een site-actie: klein JSON-object, beperkte diepte, veilige sleutels, geen control-tekens. */
const vrijeArgs = () => (v) => {
  const kopie = (x, diepte) => {
    if (x === null || typeof x === 'boolean') return goed(x);
    if (typeof x === 'number') return Number.isFinite(x) ? goed(x) : mis('WAARDE', 'eindig getal');
    if (typeof x === 'string') return typtekst(2000)(x);
    if (diepte >= 4) return mis('DIEPTE', 'te diep genest');
    if (Array.isArray(x)) {
      if (x.length > 50) return mis('LENGTE', 'hoogstens 50 items');
      const uit = []; for (const e of x) { const r = kopie(e, diepte + 1); if (!r.ok) return r; uit.push(r.v); } return goed(uit);
    }
    if (!isGewoonObject(x)) return mis('TYPE', 'gewoon object verwacht');
    const sleutels = Reflect.ownKeys(x);
    if (sleutels.length > 50) return mis('LENGTE', 'hoogstens 50 sleutels');
    const uit = {};
    for (const k of sleutels) {
      if (typeof k !== 'string' || VERBODEN_SLEUTEL.has(k) || !ARG_SLEUTEL.test(k)) return mis('SLEUTEL_ONBEKEND', `ongeldige sleutel ${String(k).slice(0, 40)}`);
      const r = kopie(x[k], diepte + 1); if (!r.ok) return r; uit[k] = r.v;
    }
    return goed(uit);
  };
  if (!isGewoonObject(v)) return mis('TYPE', 'object verwacht');
  let json = ''; try { json = JSON.stringify(v); } catch { return mis('TYPE', 'geen JSON'); }
  if (json.length > 4000) return mis('LENGTE', 'args groter dan 4000 tekens');
  return kopie(v, 0);
};

function controleerObject(velden, v) {
  if (!isGewoonObject(v)) return mis('PARAMS_VORM', 'object verwacht');
  for (const k of Reflect.ownKeys(v)) {
    if (typeof k !== 'string' || VERBODEN_SLEUTEL.has(k) || !Object.prototype.hasOwnProperty.call(velden, k)) return mis('SLEUTEL_ONBEKEND', `onbekende sleutel ${String(k).slice(0, 40)}`);
  }
  const uit = {};
  for (const [k, [controle, verplicht]] of Object.entries(velden)) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) { if (verplicht) return mis('VERPLICHT', `${k} ontbreekt`); continue; }
    const r = controle(v[k]);
    if (!r.ok) return mis(r.code, `${k}: ${r.detail}`);
    uit[k] = r.v;
  }
  return goed(uit);
}

const NAAM = tekst(1, 200);
const UID = patroon(UID_RE, 'uid uit take_snapshot (<index>_<hash>)');
const LEEG = {};
/** 0.7.0: een element op naam óf uid (chrome-devtools-mcp); precies één van de twee is genoeg, minstens één verplicht. */
const naamOfUid = (p) => (p.name === undefined && p.uid === undefined ? mis('VERPLICHT', 'name of uid ontbreekt') : null);
const formVeld = () => (v) => {
  const r = controleerObject({ name: [NAAM, false], uid: [UID, false], value: [typtekst(2000), true] }, v);
  if (!r.ok) return r;
  return r.v.name === undefined && r.v.uid === undefined ? mis('VERPLICHT', 'name of uid ontbreekt') : r;
};
/** Schema per opdrachttype: { velden: { sleutel: [controle, verplicht] }, extra?(params) → fout | null }. */
const SCHEMA = Object.freeze({
  'browser.snapshot': { velden: LEEG },
  'browser.diagnostics': { velden: LEEG },
  'browser.tabs': { velden: LEEG },
  'browser.self_test': { velden: LEEG },
  'browser.screenshot': { velden: LEEG },
  'browser.scroll': { velden: { direction: [keuze(SCROLL_RICHTINGEN), true], pages: [getal(0.1, 10), false] } },
  'browser.wait': { velden: { text: [NAAM, true], timeout_seconds: [getal(1, 15), false] } },
  'browser.navigate': { velden: { url: [eigenUrl(), true] } },
  'browser.history': { velden: { action: [keuze(GESCHIEDENIS), true] } },
  'browser.pages': {
    // 0.7.0: pageIdx = plaats in de lijst van browser.tabs (zoals chrome-devtools-mcp), naast de vaste pageId.
    velden: { action: [keuze(['select', 'new', 'close']), true], pageId: [getal(0, 2 ** 31 - 1, true), false], pageIdx: [getal(0, 99, true), false], url: [eigenUrl(), false] },
    extra: (p) => (p.action === 'new' ? (p.url === undefined ? mis('VERPLICHT', 'url ontbreekt') : null) : (p.pageId === undefined && p.pageIdx === undefined ? mis('VERPLICHT', 'pageId ontbreekt') : null)),
  },
  'browser.invoke': { velden: { action: [patroon(ACTIE_ID, 'actie-id: kleine letters, cijfers en _'), true], args: [vrijeArgs(), false] } },
  'browser.click': { velden: { name: [NAAM, false], uid: [UID, false] }, extra: naamOfUid },
  'browser.hover': { velden: { name: [NAAM, false], uid: [UID, false] }, extra: naamOfUid },
  'browser.type': { velden: { name: [NAAM, false], uid: [UID, false], text: [typtekst(2000), true] }, extra: naamOfUid },
  'browser.select': { velden: { name: [NAAM, false], uid: [UID, false], option: [NAAM, true] }, extra: naamOfUid },
  'browser.key': { velden: { key: [keuze(ALLOWED_KEYS), true] } },
  'browser.fill_form': { velden: { elements: [lijstVan(formVeld(), 1, 20), true] } },
  'browser.console': { velden: { types: [lijstVan(keuze(CONSOLE_SOORTEN), 0, CONSOLE_SOORTEN.length), false] } },
  'browser.network': { velden: { failed_only: [janee(), false] } },
  'browser.deep_diagnostics': { velden: { seconds: [getal(1, 10), false], reload: [janee(), false] } },
  'browser.audit': { velden: { soort: [keuze(AUDIT_SOORTEN), false] } },
  // 0.7.0: evaluate_script — alleen de expressie; de server begrensde al (≤ 4000 tekens), hier opnieuw.
  'browser.script': { velden: { expression: [typtekst(4000), true] } },
});

/**
 * Controleer de parameters van een opdracht. {ok:true, params} (een schone kopie met alleen bekende sleutels) |
 * {ok:false, code, detail}. Geen eval, geen dynamische code: alleen vaste controles per veld.
 */
export function valideerOpdracht(type, params) {
  if (typeof type !== 'string' || !ALLOWED_COMMANDS.includes(type) || !Object.prototype.hasOwnProperty.call(SCHEMA, type)) return { ok: false, code: 'TYPE_ONBEKEND', detail: 'onbekende opdracht' };
  const schema = SCHEMA[type];
  const r = controleerObject(schema.velden, params === undefined || params === null ? {} : params);
  if (!r.ok) return { ok: false, code: r.code, detail: r.detail };
  const extra = schema.extra ? schema.extra(r.v) : null;
  if (extra) return { ok: false, code: extra.code, detail: extra.detail };
  return { ok: true, params: r.v };
}
