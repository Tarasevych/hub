// Mijn Ruimte-extensie 0.6: achtergrondproces met TWEE sloten (contract 0.6 §1, §2, §5).
//  - Slot 'prive'     = koppeling (agent) in de ruimte van de gebruiker: zijn AI werkt alleen op zijn eigen diensten (PRIVE_HOSTS),
//                       nooit op admin.*, en nooit op een tabblad dat in de technische modus staat.
//  - Slot 'technisch' = tweede koppeling in de technische ruimte: werkt alleen op tabbladen met <meta name="mjn-profiel"
//                       content="technisch"> (lopende tech-activering in DAT tabblad) en hosts uit de ontgrendeling (⊂ ADMIN_HOSTS_TOEGESTAAN).
//  Elk slot heeft eigen geheimen (IndexedDB, sleutels '<ruimte>:agentToken' en '<ruimte>:commandKey'), eigen WebSocket (eigen ticket),
//  eigen ontgrendeling (chrome.storage.session 'ontgrendeling_<ruimte>'), eigen ingetrokken gids, wachtrij en afstemming na 'ready',
//  eigen settings en eigen netwerkbuffers. Een opdracht van de WebSocket van slot X gebruikt UITSLUITEND de ontgrendeling van slot X.
// - Verbinding per slot: eerst een eenmalig ticket (60 s) met het agenttoken in de Authorization-header, dan de WebSocket openen en
//   het ticket in het EERSTE bericht sturen. Het token staat nooit in een URL. Elke 20 s een levensteken.
// - STANDAARD VERGRENDELD per slot. Toestanden: niet-gekoppeld → vergrendeld → ontgrendeld → agent (AI actief). De server stuurt
//   {t:'ontgrendeling', grant, sig} (v2, met ruimte; HMAC-SHA256 met de opdrachtsleutel van DAT slot). v1 en een grant waarvan de
//   ruimte niet bij het slot hoort worden geweigerd.
// - Volgorde van de controles vóór elke opdracht: type bekend → slot gekoppeld → HMAC (sleutel van het slot) → ontgrendeling van het
//   slot geldig → cap ∈ grant.caps ∩ settings.caps → valideerOpdracht → host ∈ grant.domeinen ∩ hosts van de ruimte → doeltabblad
//   (host + PROFIEL volgens de regel van de ruimte, vers gevraagd aan de brug) → accountclaim = userId van het slot → uitvoeren
//   (de brug controleert het profiel bij de uitvoering nog een keer).
// - Lokale agent (Native Messaging): hoort bij het slot waarvan de ontgrendeling `lokaal` heeft; hebben beide dat, dan technisch
//   (de beheerder koos het bewust bij een passkey-ontgrendeling en die is korter). Alleen LOKAAL_CAPS.
// - De site praat alleen via externally_connectable met ons: PING, STATUS, OPEN_OPTIONS, SELF_TEST, UPDATE_CHECK en PAIR
//   (eenmalige code, 5 minuten; alleen vanaf mcp.tarasevych.com). PAIR koppelt in het slot dat de server teruggeeft (`ruimte`);
//   een PAIR met de andere ruimte laat het andere slot staan. Nooit geheimen naar de site.
import {
  ALLOWED_COMMANDS, DIAG_CAP, DIAG_PAKKET, DIAG_RUIMTE, LOKAAL_CAPS, MARKERING_BADGE, MARKERING_KLEUREN, RUIMTES, TYPE_CAPABILITY,
  accountState, adresInRuimte, debuggerToegestaan, isOwnSiteUrl, isRuimte,
  parseAccountClaim, parseProfiel, profielToegestaan, ruimteOf, stripQuery, urlInScope, valideerOpdracht, verifyCommand, verifyOntgrendeling,
} from './shared.js';
// 0.6.2 (opdracht eigenaar 20.10.2026): WIE leest het tabblad nu, en welke kleur hoort bij die agent.
import { MARKERING_STAART_MS, agentSlugUitNaam, kleurVoorAgent } from './markering-agenten.js';
// Statische import: import() is in een service worker niet toegestaan (HTML-spec), dus native.js moet in het pakket zitten.
import * as nativeModule from './native.js';
import { ruimteFout, sluitFout } from './ruimte-fouten.js';

const VERSION = chrome.runtime.getManifest().version;
const SITE = 'https://mcp.tarasevych.com';
const PAIR_HOST = 'mcp.tarasevych.com';
const PING_MS = 20_000;
const LOG_MAX = 30;
const NET_RING = 300;
const NET_FILTER = { urls: ['https://*.tarasevych.com/*'] };
const VERGRENDELD_FOUT = {
  technisch: 'EXTENSIE_VERGRENDELD: het beheerdersaccount moet de extensie eerst op de site ontgrendelen met een passkey (mcp.tarasevych.com → Підключення ШІ → Розширення браузера → Технічний профіль)',
  prive: 'EXTENSIE_VERGRENDELD: de gebruiker moet de toegang eerst op de site openen (mcp.tarasevych.com → Підключення ШІ → Розширення браузера → Як користувач)',
};
const PROFIEL_FOUT = {
  technisch: 'EXTENSIE_PROFIEL: this command belongs to the technical profile, but the tab is not in technical mode (activate the technical profile in that tab)',
  prive: 'EXTENSIE_PROFIEL: the tab is in technical mode; a user-space AI never reads or controls a technical tab',
};
const LOKALE_REDENEN = ['popup', 'zijpaneel', 'opties'];
const SERVER_REDENEN = ['ingetrokken', 'verlopen', 'tech-einde', 'popup', 'zijpaneel', 'opties', 'site', 'noodstop', 'uitgelogd', 'nieuw', 'ontkoppeld', 'beleid', 'beheer', 'browser-gesloten', 'site-sessie-weg'];
/** Velden per slot in chrome.storage.local (geen geheimen). */
const SLOT_VELDEN = ['tokenExpiresAt', 'agentId', 'userId', 'server', 'name'];
/** 0.5 (en ouder): één koppeling, platte sleutels in storage.local (+ geheimen in IDB of, 0.4, in storage.local). */
const OUD_LOCAL = ['agentToken', 'commandKey', 'tokenExpiresAt', 'agentId', 'userId', 'server', 'name'];
const OUD_SESSIE = ['ontgrendeling', 'ingetrokken', 'laatsteIat', 'wachtrij', 'settings', 'wsTicket', 'wsTicketAt'];
const K = {
  local: (r) => `slot_${r}`, ontgr: (r) => `ontgrendeling_${r}`, intrek: (r) => `intrekking_${r}`, settings: (r) => `settings_${r}`,
  ticket: (r) => `wsTicket_${r}`, alarm: (r) => `ontgrendeling-einde-${r}`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stil = async (fn) => { try { return await fn(); } catch { return undefined; } };
const capabilities = (ruimte) => ({ kind: 'browser', version: VERSION, commands: ALLOWED_COMMANDS, account: true, signed: true, ontgrendeling: 2, ruimte, profielen: true });
const sessie = {
  get: (k) => stil(() => chrome.storage.session.get(k)).then((v) => v || {}),
  set: (o) => stil(() => chrome.storage.session.set(o)),
  remove: (k) => stil(() => chrome.storage.session.remove(k)),
};
// 0.7.0 (migratie 0111): één willekeurige id per BROWSERSESSIE. chrome.storage.session is leeg na het sluiten van de browser (en na
// een update of herladen van de extensie) en overleeft het inslapen van de service worker. Gaat mee in 'auth' van beide sloten; de
// server beëindigt daarmee «до закриття браузера» en de korte termijnen na een herstart. Geen geheim: ze kan alleen iets BEËINDIGEN.
const K_BROWSERSESSIE = 'browserSessie';
const BROWSERSESSIE_RE = /^[A-Za-z0-9_-]{16,64}$/;
let browserSessieBelofte = null;
function browserSessie() {
  browserSessieBelofte ??= (async () => {
    const v = await sessie.get(K_BROWSERSESSIE);
    if (typeof v[K_BROWSERSESSIE] === 'string' && BROWSERSESSIE_RE.test(v[K_BROWSERSESSIE])) return v[K_BROWSERSESSIE];
    const id = crypto.randomUUID().replace(/-/g, '');
    await sessie.set({ [K_BROWSERSESSIE]: id });
    return id;
  })();
  return browserSessieBelofte;
}

// ---------------------------------------------------------------- toestand per slot
function nieuwSlot(ruimte) {
  return {
    ruimte, ws: null, ready: false, lastError: '', pingTimer: null, settings: { epoch: -1, caps: [], blocked: false },
    /** { grant, sig, ontvangenOp } — alleen na verifyOntgrendeling; ook in chrome.storage.session. */
    ontgrendeling: null, eindeTimer: null, noodstop: false, laatsteVergrendeling: null, ai: { verbonden: false, agenten: [] },
    /** 0.6.2: accent per agent zoals de eigenaar het op de site koos ({slug: accent}); leeg = de standaard uit het palet. */
    agentKleuren: {},
    /** 0.6.2: de laatste AI die in dit slot een browseropdracht uitvoerde — voor de badge en als de opdracht zelf geen naam draagt. */
    laatsteLezer: null,
    ingetrokken: [], laatsteIat: 0, wachtrij: [], afstemming: null, selfCache: { at: 0, data: {} },
  };
}
const sloten = { prive: nieuwSlot('prive'), technisch: nieuwSlot('technisch') };
/** Profiel en techRecht van het account (uit /self; alleen weergave en de keuze of de technische kaart bestaat). */
let accountInfo = { email: '', techRecht: false, at: 0 };
/** tabId -> { claim, profiel } — wat de brug van dat tabblad meldde. */
const tabInfo = new Map();
const attached = new Set(); // tabIds met debugger
const usedPairCodes = new Set();
const opdrachtLog = []; // laatste 30: { at, type, ok, bron, ruimte, fout? } — nooit parameters
const netwerk = new Map(); // `${ruimte}:${tabId}` -> ring van verzoeken (chrome.webRequest), alleen voor het slot dat er NU mag verzamelen
const netStart = new Map(); // requestId -> timeStamp
const tabUrls = new Map(); // tabId -> laatst bekende adres

// ---------------------------------------------------------------- geheimen: IndexedDB van de extensie-origin (alleen background)
// Review 18.10.2026: chrome.storage.local is ook vanuit content scripts leesbaar. agentToken en commandKey staan daarom in IndexedDB
// van chrome-extension://<id>, waar geen content script bij kan — per slot een eigen paar sleutels.
const GEHEIM_KEYS = ['agentToken', 'commandKey'];
const geheimGeheugen = {}; // alleen als er geen IndexedDB is (eenheidstests zonder IDB)
const geheimCache = {};
let geheimDbBelofte = null;
function geheimDb() {
  if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
  if (!geheimDbBelofte) {
    geheimDbBelofte = new Promise((resolve, reject) => {
      const r = indexedDB.open('mr-geheim', 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }).catch((e) => { geheimDbBelofte = null; throw e; });
  }
  return geheimDbBelofte;
}
function idb(mode, werk) {
  return geheimDb().then((db) => (db ? new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode);
    const uit = werk(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(uit);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IDB afgebroken'));
  }) : null));
}
/** prefix '' = de oude (0.5) platte sleutels; 'prive:' / 'technisch:' = per slot. */
const geheim = {
  async get(prefix) {
    if (geheimCache[prefix]) return { ...geheimCache[prefix] };
    const verzoeken = await idb('readonly', (st) => GEHEIM_KEYS.map((k) => [k, st.get(prefix + k)]));
    const uit = {};
    if (verzoeken) { for (const [k, r] of verzoeken) if (r.result !== undefined) uit[k] = r.result; }
    else for (const k of GEHEIM_KEYS) if (geheimGeheugen[prefix + k] !== undefined) uit[k] = geheimGeheugen[prefix + k];
    geheimCache[prefix] = uit;
    return { ...uit };
  },
  async set(prefix, o) {
    const schoon = Object.fromEntries(Object.entries(o).filter(([k, v]) => GEHEIM_KEYS.includes(k) && typeof v === 'string'));
    const ok = await idb('readwrite', (st) => { for (const [k, v] of Object.entries(schoon)) st.put(v, prefix + k); return true; });
    if (!ok) for (const [k, v] of Object.entries(schoon)) geheimGeheugen[prefix + k] = v;
    geheimCache[prefix] = { ...(geheimCache[prefix] || {}), ...schoon };
  },
  async remove(prefix) {
    const ok = await idb('readwrite', (st) => { for (const k of GEHEIM_KEYS) st.delete(prefix + k); return true; });
    if (!ok) for (const k of GEHEIM_KEYS) delete geheimGeheugen[prefix + k];
    geheimCache[prefix] = {};
  },
};
const pre = (r) => `${r}:`;

// ---------------------------------------------------------------- migratie 0.4/0.5 → 0.6 (één koppeling → slot volgens /self.ruimte)
let migratie = null;
async function migreer() {
  const oud = await chrome.storage.local.get(OUD_LOCAL);
  const oudGeheim = await geheim.get('');
  const token = oudGeheim.agentToken || (typeof oud.agentToken === 'string' ? oud.agentToken : '');
  const sleutel = oudGeheim.commandKey || (typeof oud.commandKey === 'string' ? oud.commandKey : '');
  const opruimen = async () => {
    await chrome.storage.local.remove(OUD_LOCAL);
    await geheim.remove('');
    await sessie.remove(OUD_SESSIE); // een v1-ontgrendeling van 0.5 geldt nooit meer
  };
  if (!token) { if (Object.keys(oud).length) await opruimen(); return; }
  if (oud.tokenExpiresAt && Number(oud.tokenExpiresAt) < Date.now()) { await opruimen(); return; }
  const server = typeof oud.server === 'string' && isOwnSiteUrl(`${oud.server}/`) ? oud.server : SITE;
  let ruimte = 'prive';
  try {
    const res = await fetch(`${server}/api/owner/agents/self`, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', credentials: 'omit' });
    if (res.status === 401) { await opruimen(); return; } // ingetrokken: niet meenemen
    if (res.ok) { const d = await res.json().catch(() => ({})); ruimte = ruimteOf(d && d.ruimte); }
  } catch { /* offline: contract 0.6 §1 — anders 'prive'; /self corrigeert het later (herindelen) */ }
  const bestaand = await geheim.get(pre(ruimte));
  if (!bestaand.agentToken) {
    await geheim.set(pre(ruimte), { agentToken: token, commandKey: sleutel }); // eerst veilig in het nieuwe slot…
    await chrome.storage.local.set({ [K.local(ruimte)]: { tokenExpiresAt: oud.tokenExpiresAt || Date.now() + 30 * 86400000, agentId: oud.agentId || '',
      userId: oud.userId || '', server, name: String(oud.name || 'Chrome').slice(0, 60) } });
  }
  await opruimen(); // …dan pas de oude sleutels weg
}
const gemigreerd = () => { if (!migratie) migratie = migreer().catch(() => { migratie = null; }); return migratie; };

async function slotState(r) {
  await gemigreerd();
  const v = await chrome.storage.local.get([K.local(r)]);
  const st = { ...((v && v[K.local(r)]) || {}), ...(await geheim.get(pre(r))) };
  if (st.agentToken && st.tokenExpiresAt && Number(st.tokenExpiresAt) < Date.now()) { // verlopen koppeling: vergeten
    await vergeetKoppeling(r);
    sloten[r].lastError = 'expired';
    return {};
  }
  return st;
}
async function globaal() { return chrome.storage.local.get(['pairingId', 'diagOptIn', 'nativeOptIn', 'diagRechtStand']); }
async function vergeetKoppeling(r) {
  await chrome.storage.local.remove([K.local(r)]);
  await geheim.remove(pre(r));
}
async function installId() {
  const { pairingId } = await chrome.storage.local.get('pairingId');
  if (pairingId) return pairingId;
  const id = `ext-${crypto.randomUUID()}`;
  await chrome.storage.local.set({ pairingId: id });
  return id;
}
/** userId van het account (beide sloten horen bij hetzelfde account; prive eerst). */
async function accountUserId() {
  for (const r of RUIMTES) { const st = await slotState(r); if (st.agentToken && st.userId) return st.userId; }
  return '';
}

// ---------------------------------------------------------------- ontgrendeling per slot
// ontgrendeling = { grant, sig, ontvangenOp }. Review 18.10.2026 (per slot):
//  - klok: geldig tot min(exp, ontvangenOp + (exp − iat));
//  - ingetrokken gids nooit meer aanvaard; geen downgrade naar een oudere iat;
//  - na elke 'ready' moet de server binnen AFSTEM_MS dezelfde gid bevestigen, anders wissen (fail-closed);
//  - lokaal intrekken in een wachtrij tot de server het bevestigt.
const AFSTEM_MS = 5_000;
const MAX_INGETROKKEN = 200;

const eindeLokaal = (o) => Math.min(o.grant.exp, o.ontvangenOp + (o.grant.exp - o.grant.iat));
/** Geldige ontgrendeling van slot r in het geheugen (alleen tijd). Tijdens de afstemming na 'ready' telt hij niet. */
const huidigeGrant = (r, now = Date.now()) => { const s = sloten[r]; return s.ontgrendeling && !s.afstemming && eindeLokaal(s.ontgrendeling) > now ? s.ontgrendeling.grant : null; };
const huidigEinde = (r) => (sloten[r].ontgrendeling ? eindeLokaal(sloten[r].ontgrendeling) : null);
const eigenVan = (st, r) => ({ agentId: st.agentId, userId: st.userId, ruimte: r });

/** Volledige controle opnieuw (handtekening, eigen koppeling + ruimte, tijd, intrekking). Ongeldig → slot vergrendelen. */
async function geldigeOntgrendeling(r, st) {
  const s = sloten[r];
  if (s.afstemming) await Promise.race([s.afstemming.klaar, sleep(AFSTEM_MS + 200)]);
  if (!s.ontgrendeling) return null;
  const v = await verifyOntgrendeling(st.commandKey, s.ontgrendeling.grant, s.ontgrendeling.sig, eigenVan(st, r));
  if (v.ok && eindeLokaal(s.ontgrendeling) > Date.now() && !s.ingetrokken.includes(v.grant.gid)) return v.grant;
  await vergrendel(r, !v.ok && v.code !== 'VERLOPEN' ? 'ingetrokken' : 'verlopen');
  return null;
}

function planEinde(r, einde) {
  const s = sloten[r];
  clearTimeout(s.eindeTimer);
  const over = einde - Date.now();
  if (over <= 0) return;
  void stil(() => chrome.alarms.create(K.alarm(r), { when: einde }));
  if (over < 2 ** 31) s.eindeTimer = setTimeout(() => { void eindeBereikt(r); }, over + 50);
}
async function eindeBereikt(r) {
  await geladen;
  const s = sloten[r];
  if (s.ontgrendeling && eindeLokaal(s.ontgrendeling) <= Date.now() + 1000) await vergrendel(r, 'verlopen');
}

async function bewaarIntrekking(r) { const s = sloten[r]; await sessie.set({ [K.intrek(r)]: { ingetrokken: s.ingetrokken, laatsteIat: s.laatsteIat, wachtrij: s.wachtrij } }); }
function markeerIngetrokken(r, gid) {
  const s = sloten[r];
  if (typeof gid !== 'string' || !gid || s.ingetrokken.includes(gid)) return;
  s.ingetrokken.push(gid);
  if (s.ingetrokken.length > MAX_INGETROKKEN) s.ingetrokken = s.ingetrokken.slice(-MAX_INGETROKKEN);
}
function wisNetwerk(r) { for (const k of [...netwerk.keys()]) if (k.startsWith(`${r}:`)) netwerk.delete(k); }

// 0.7.0: hoe de ontgrendeling eindigt — alleen WEERGAVE (niet ondertekend; het einde blijft exp in de grant, de server trekt in).
const EINDE_WEERGAVE = ['duur', 'tech-einde', 'uitloggen', 'handmatig', 'browser'];
async function ontvangOntgrendeling(r, grant, sig, einde) {
  const s = sloten[r];
  const st = await slotState(r);
  if (!st.agentToken) return { ok: false, code: 'NIET_GEKOPPELD' };
  let v = await verifyOntgrendeling(st.commandKey, grant, sig, eigenVan(st, r));
  if (v.ok && s.ingetrokken.includes(v.grant.gid)) v = { ok: false, code: 'INGETROKKEN' };
  else if (v.ok && v.grant.iat < s.laatsteIat) v = { ok: false, code: 'OUDER' };
  if (!v.ok) { s.lastError = `ontgrendeling geweigerd (${v.code})`; await statusWijziging(); return v; }
  if (s.ontgrendeling && s.ontgrendeling.grant.gid !== v.grant.gid) { markeerIngetrokken(r, s.ontgrendeling.grant.gid); wisNetwerk(r); }
  const zelfde = s.ontgrendeling && s.ontgrendeling.grant.gid === v.grant.gid;
  s.ontgrendeling = { grant: v.grant, sig, ontvangenOp: zelfde ? s.ontgrendeling.ontvangenOp : Date.now(), einde: EINDE_WEERGAVE.includes(einde) ? einde : null };
  s.laatsteIat = Math.max(s.laatsteIat, v.grant.iat);
  afstemmingKlaar(r);
  s.noodstop = false;
  s.lastError = '';
  await sessie.set({ [K.ontgr(r)]: s.ontgrendeling });
  await bewaarIntrekking(r);
  planEinde(r, eindeLokaal(s.ontgrendeling));
  await statusWijziging();
  return v;
}

/** Na 'ready' van slot r: de server moet de gid van DAT slot binnen AFSTEM_MS bevestigen, anders wissen. */
function startAfstemming(r) {
  const s = sloten[r];
  afstemmingKlaar(r);
  if (!s.ontgrendeling) return;
  const gid = s.ontgrendeling.grant.gid;
  let los;
  const klaar = new Promise((x) => { los = x; });
  const timer = setTimeout(() => {
    if (s.afstemming && s.afstemming.gid === gid) {
      afstemmingKlaar(r);
      if (s.ontgrendeling && s.ontgrendeling.grant.gid === gid) void vergrendel(r, 'ingetrokken');
    }
  }, AFSTEM_MS);
  s.afstemming = { gid, klaar, los, timer };
}
function afstemmingKlaar(r) {
  const s = sloten[r];
  if (!s.afstemming) return;
  clearTimeout(s.afstemming.timer);
  const a = s.afstemming;
  s.afstemming = null;
  a.los();
}

/** Ontgrendeling van slot r wissen + alles van dat slot stil: debugger los, netwerkbuffers leeg, diagnosebuffers van de brug leeg. */
async function vergrendel(r, reden) {
  const s = sloten[r];
  const had = s.ontgrendeling;
  s.ontgrendeling = null;
  afstemmingKlaar(r);
  if (had) markeerIngetrokken(r, had.grant.gid);
  clearTimeout(s.eindeTimer); s.eindeTimer = null;
  await sessie.remove(K.ontgr(r));
  await bewaarIntrekking(r);
  await stil(() => chrome.alarms.clear(K.alarm(r)));
  wisNetwerk(r);
  netStart.clear();
  await detachAll();
  for (const tab of (await stil(ownTabs)) || []) await stil(() => chrome.tabs.sendMessage(tab.id, { op: 'diag-clear', ruimte: r }));
  if (had) s.laatsteVergrendeling = { reden: reden || 'ingetrokken', at: Date.now() };
  await statusWijziging();
}

/** Gebruiker trok lokaal in (popup, zijpaneel, opties, noodstop): slot vergrendelen, in de wachtrij, en de server van DAT slot laten weten. */
async function vergrendelLokaal(r, reden) {
  const s = sloten[r];
  const gid = s.ontgrendeling ? s.ontgrendeling.grant.gid : null;
  await vergrendel(r, reden);
  if (!gid) return;
  if (!s.wachtrij.some((w) => w.gid === gid)) s.wachtrij.push({ gid, reden, at: Date.now() });
  s.wachtrij = s.wachtrij.slice(-50);
  await bewaarIntrekking(r);
  await wachtrijVersturen(r);
}
/** Elk verzoek in de wachtrij van slot r: via zijn WebSocket (blijft staan tot de server bevestigt) of HTTP met zijn token. */
async function wachtrijVersturen(r) {
  const s = sloten[r];
  for (const w of [...s.wachtrij]) {
    if (s.ws && s.ready && s.ws.readyState === WebSocket.OPEN) {
      try { s.ws.send(JSON.stringify({ t: 'vergrendel-verzoek', gid: w.gid, reden: w.reden })); continue; } catch { /* terugval */ }
    }
    const st = await slotState(r);
    if (!st.agentToken || !st.server || !isOwnSiteUrl(`${st.server}/`)) continue;
    const res = await stil(() => fetch(`${st.server}/api/owner/agents/ontgrendeling/intrekken-extensie`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${st.agentToken}` }, credentials: 'omit', cache: 'no-store',
      body: JSON.stringify({ gid: w.gid, reden: w.reden }),
    }));
    if (res && res.ok) await bevestigIntrekking(r, w.gid);
  }
}
async function bevestigIntrekking(r, gid) {
  const s = sloten[r];
  const voor = s.wachtrij.length;
  s.wachtrij = s.wachtrij.filter((w) => w.gid !== gid);
  if (s.wachtrij.length !== voor) await bewaarIntrekking(r);
}

// ---------------------------------------------------------------- tabbladen: profiel en regels per slot
const profielVan = (tabId) => { const i = tabInfo.get(tabId); return i ? i.profiel : 'gebruiker'; };
/** Mag slot r (met grant g) dit tabblad raken? Host exact ∈ domeinen ∩ hosts van de ruimte, en het profiel volgens de regel. */
function tabMag(r, g, tab, profiel = profielVan(tab.id)) {
  return !!(g && tab && isOwnSiteUrl(tab.url || '') && adresInRuimte(r, tab.url || '', g.domeinen) && profielToegestaan(r, profiel));
}
/** Voor welk slot verzamelt dit tabblad NU? (de regels sluiten elkaar uit: technisch vereist profiel technisch, prive verbiedt het) */
function verzamelRuimte(tabId, url) {
  const profiel = profielVan(tabId);
  for (const r of ['technisch', 'prive']) { const g = huidigeGrant(r); if (g && tabMag(r, g, { id: tabId, url }, profiel)) return r; }
  return null;
}

// ---------------------------------------------------------------- status
function staatNu(r, gekoppeld) {
  if (!gekoppeld) return 'niet-gekoppeld';
  const g = huidigeGrant(r);
  if (!g) return 'vergrendeld';
  return sloten[r].ai.verbonden || (g.lokaal && nativeRuimte() === r && lokaalInfo().verbonden) ? 'agent' : 'ontgrendeld';
}
function lokaalInfo() {
  let info = null;
  try { info = native && typeof native.info === 'function' ? native.info() : null; } catch { info = null; }
  return { verbonden: !!(info && info.verbonden === true) };
}
/** Slot van de lokale agent: dat met grant.lokaal; beide → technisch (zie kop). */
function nativeRuimte() {
  for (const r of ['technisch', 'prive']) { const g = huidigeGrant(r); if (g && g.lokaal) return r; }
  return null;
}

async function actiefTabblad() {
  let tabs = await stil(() => chrome.tabs.query({ active: true, lastFocusedWindow: true }));
  if (!Array.isArray(tabs)) tabs = [];
  return tabs.find((t) => t && t.active) || tabs[0] || null;
}

async function slotStatus(r) {
  const st = await slotState(r);
  const s = sloten[r];
  const gekoppeld = !!st.agentToken;
  const g = gekoppeld ? huidigeGrant(r) : null;
  return {
    ruimte: r, gekoppeld, verbonden: gekoppeld && s.ready, staat: staatNu(r, gekoppeld),
    ontgrendeling: g ? { gid: g.gid, exp: huidigEinde(r), caps: [...g.caps], domeinen: [...g.domeinen], lokaal: g.lokaal, einde: (s.ontgrendeling && s.ontgrendeling.einde) || null } : null,
    ai: { verbonden: s.ai.verbonden, agenten: s.ai.agenten.map((a) => ({ ...a })) },
    agentId: st.agentId || '', naam: st.name || '', fout: s.lastError, tokenExpiresAt: st.tokenExpiresAt || null,
    vergrendeldDoor: s.laatsteVergrendeling ? { ...s.laatsteVergrendeling } : null,
  };
}
/** ExtStatus 0.6 voor eigen pagina's: geen sleutels of tokens. sloten.technisch = null als die kaart niet mag bestaan. */
async function statusKern() {
  const gl = await globaal();
  const prive = await slotStatus('prive');
  const tech = await slotStatus('technisch');
  const tab = await actiefTabblad();
  const opSite = !!(tab && isOwnSiteUrl(tab.url || ''));
  const userId = await accountUserId();
  const nativeAan = gl.nativeOptIn === true;
  const nr = nativeRuimte();
  const techBestaat = tech.gekoppeld || accountInfo.techRecht === true;
  return {
    versie: VERSION, profielTab: opSite ? profielVan(tab.id) : null, accountEmail: accountInfo.email || '', techRecht: accountInfo.techRecht === true,
    account: opSite ? accountState(tabInfo.get(tab.id) ? tabInfo.get(tab.id).claim : null, userId) : 'unknown',
    sloten: { prive, technisch: techBestaat ? tech : null },
    lokaal: { toegestaan: nativeAan && !!nr, verbonden: lokaalInfo().verbonden, ruimte: nativeAan ? nr : null },
    diagOptIn: gl.diagOptIn === true, nativeOptIn: nativeAan, debugging: attached.size > 0,
    // 0.6.1 (punt 7): stand van het debuggerrecht — ook naar de site, zodat «дозвіл є / немає / відкликано» daar te zien is.
    diagnostiek: { ...(await diagStand()), losgelaten: losgelaten ? losgelaten.reden : null },
    gekoppeld: prive.gekoppeld || tech.gekoppeld, verbonden: prive.verbonden || tech.verbonden,
  };
}
const slotPubliek = (x) => (x ? {
  gekoppeld: x.gekoppeld, verbonden: x.verbonden, staat: x.staat, exp: x.ontgrendeling ? x.ontgrendeling.exp : null,
  caps: x.ontgrendeling ? [...x.ontgrendeling.caps] : [], domeinen: x.ontgrendeling ? [...x.ontgrendeling.domeinen] : [], aiVerbonden: x.ai.verbonden, agentId: x.agentId,
} : null);
/**
 * Publieke status (contract 0.6 §5) voor tabbladen en de site: per slot, nooit sleutels. `profiel`/`account` = van het tabblad
 * waarvoor hij bedoeld is. Platte velden (versie, gekoppeld, staat, exp, caps, domeinen, aiVerbonden, agentId) = spiegel van het slot
 * dat bij het profiel van dat tabblad hoort (overgang voor de 0.5-site).
 */
function publiek(s, profiel = s.profielTab, account = s.account) {
  const prive = slotPubliek(s.sloten.prive);
  const technisch = slotPubliek(s.sloten.technisch);
  const spiegel = profiel === 'technisch' && technisch ? technisch : prive;
  const d = s.diagnostiek || {};
  return {
    versie: s.versie, profielTab: profiel === 'technisch' || profiel === 'gebruiker' ? profiel : null, account, prive, technisch, lokaalVerbonden: s.lokaal.verbonden,
    // 0.6.1: alleen de stand (nooit het pad naar een pakket of iets uit de opslag) — de site toont er «дозвіл є / немає / відкликано» mee.
    diagnostiek: { stand: d.stand || 'nee', optIn: d.optIn === true, actief: d.actief === true, aanvraagbaar: d.aanvraagbaar === true },
    gekoppeld: spiegel.gekoppeld, verbonden: spiegel.verbonden, staat: spiegel.staat, exp: spiegel.exp, caps: spiegel.caps, domeinen: spiegel.domeinen,
    aiVerbonden: spiegel.aiVerbonden, agentId: spiegel.agentId,
  };
}

let pushBezig = null;
let pushOpnieuw = false;
/** Bij elke wijziging: badge, eigen pagina's, eigen tabbladen (publiek + diag-modus), servers ({t:'status'} per slot), lokale agent. */
function statusWijziging() {
  if (pushBezig) { pushOpnieuw = true; return pushBezig; }
  pushBezig = (async () => {
    do { pushOpnieuw = false; await stil(pushStatus); } while (pushOpnieuw);
  })().finally(() => { pushBezig = null; });
  return pushBezig;
}
async function pushStatus() {
  const s = await statusKern();
  const userId = await accountUserId();
  await badgeVoorStaat(s);
  await stil(() => chrome.runtime.sendMessage({ op: 'status-push', status: s }));
  for (const tab of (await stil(ownTabs)) || []) {
    const info = tabInfo.get(tab.id);
    await stil(() => chrome.tabs.sendMessage(tab.id, { op: 'status-push', status: publiek(s, profielVan(tab.id), accountState(info ? info.claim : null, userId)) }));
    const r = verzamelRuimte(tab.id, tab.url || '');
    await stil(() => chrome.tabs.sendMessage(tab.id, { op: 'diag-modus', aan: !!r, ruimte: r }));
  }
  // 0.6.1 (20.10.2026): het profiel van het ACTIEVE tabblad en de stand van het debuggerrecht gaan mee naar de server, zodat een
  // technische browseropdracht VOORAF uitlegbaar geweigerd kan worden (nooit om iets toe te staan: wij controleren alles zelf opnieuw).
  for (const r of RUIMTES) stuurStatusNaarServer(r, { profielTab: s.profielTab, diagRecht: s.diagnostiek ? s.diagnostiek.stand : null });
  await nativeBijwerken();
}
function statusVelden(r) {
  const g = huidigeGrant(r);
  return { ruimte: r, staat: staatNu(r, true), gid: g ? g.gid : null, exp: g ? g.exp : null, lokaal: !!(g && g.lokaal), lokaalVerbonden: nativeRuimte() === r && lokaalInfo().verbonden };
}
function stuurStatusNaarServer(r, extra = {}) {
  const s = sloten[r];
  if (!s.ws || !s.ready || s.ws.readyState !== WebSocket.OPEN) return;
  try { s.ws.send(JSON.stringify({ t: 'status', ...statusVelden(r), ...extra, version: VERSION })); } catch { /* dicht */ }
}
const pong = (r) => JSON.stringify({ t: 'pong', version: VERSION, capabilities: capabilities(r), ...statusVelden(r) });

// ---------------------------------------------------------------- badge + tooltip (samen voor beide sloten)
// 0.6.1 (punt 8): de badge krijgt de KLEUR VAN HET PROFIEL van het actieve tabblad (gebruiker groen, technisch oranje) en de
// tooltip zegt in woorden wat er aan is. Zo is buiten de pagina te zien dat de extensie werkt, ook zonder de pop-up te openen.
async function badge(kind, titel) {
  const map = {
    ok: ['', '#1a7f37'], off: ['', '#6b7280'], warn: ['!', '#ca8a04'], debug: ['DBG', '#b91c1c'], stop: ['■', '#b91c1c'],
    open: [MARKERING_BADGE.prive, MARKERING_KLEUREN.prive], agent: ['AI', '#7c3aed'],
    'open-technisch': [MARKERING_BADGE.technisch, MARKERING_KLEUREN.technisch], 'agent-technisch': ['AI', MARKERING_KLEUREN.technisch],
  };
  const [text, color] = map[kind] || map.off;
  try { await chrome.action.setBadgeBackgroundColor({ color }); await chrome.action.setBadgeText({ text }); } catch { /* geen actie */ }
  if (titel !== undefined) { try { await chrome.action.setTitle({ title: titel }); } catch { /* geen actie */ } }
}
/** Tooltip in twee talen in één regel (de extensie weet de taal van de gebruiker niet in de service worker). */
function tooltip(s) {
  const naam = (r) => (r === 'technisch' ? 'технічний профіль / technisch profiel' : 'як користувач / als gebruiker');
  if (RUIMTES.some((r) => sloten[r].noodstop)) return `Mijn Ruimte ${VERSION} — Стоп: усе зупинено / Stop: alles stil`;
  if (attached.size > 0) return `Mijn Ruimte ${VERSION} — глибока діагностика (налагоджувач Chrome) / diepe diagnose (Chrome-debugger)`;
  const open = RUIMTES.filter((r) => (s.sloten[r] ? s.sloten[r].staat === 'ontgrendeld' || s.sloten[r].staat === 'agent' : false));
  if (!open.length) return `Mijn Ruimte ${VERSION} — доступ закрито, ШІ нічого не бачить / toegang dicht, de AI ziet niets`;
  const agent = open.some((r) => s.sloten[r].staat === 'agent');
  return `Mijn Ruimte ${VERSION} — ${agent ? 'ШІ-агент працює / AI-agent actief' : 'доступ відкрито / toegang open'}: ${open.map(naam).join(' + ')}`;
}
/**
 * 0.6.2: leest een AI op dit moment een van onze tabbladen? Dan de badge in DE KLEUR VAN DIE AGENT (dezelfde kleur als de rand
 * op de pagina en als de agentenlijst op de site), zodat ook buiten de pagina te zien is wie er bezig is. Na de staart
 * (MARKERING_STAART_MS) valt de badge terug op de kleur van het slot.
 */
function levendeLezer() {
  const nu = Date.now();
  let beste = null;
  for (const r of RUIMTES) {
    const l = sloten[r].laatsteLezer;
    if (!l || nu - l.at > MARKERING_STAART_MS) continue;
    if (!beste || beste.at < l.at) beste = { ...l, ruimte: r };
  }
  return beste;
}
async function badgeVoorStaat(s) {
  const titel = tooltip(s);
  const staten = [s.sloten.prive, s.sloten.technisch].filter(Boolean).map((x) => x.staat);
  if (RUIMTES.some((r) => sloten[r].noodstop)) return badge('stop', titel);
  if (attached.size > 0) return badge('debug', titel);
  if (laatsteBekend && ouderDan(VERSION, laatsteBekend)) return undefined; // «↑» en zijn eigen tooltip laten staan
  const lezer = levendeLezer();
  if (lezer) {
    const kleur = kleurVoorAgent(lezer.slug, lezer.accent).licht;
    try { await chrome.action.setBadgeBackgroundColor({ color: kleur }); await chrome.action.setBadgeText({ text: 'AI' }); } catch { /* geen actie */ }
    try { await chrome.action.setTitle({ title: `Mijn Ruimte ${VERSION} — ${lezer.naam || (lezer.slug ? lezer.slug : 'ШІ / AI')}: ${lezer.type}` }); } catch { /* geen actie */ }
    return undefined;
  }
  // Kleur van het profiel van het ACTIEVE tabblad; staat dat niet in de technische modus, dan de gebruikerskleur.
  const tech = s.profielTab === 'technisch' && s.sloten.technisch && (s.sloten.technisch.staat === 'ontgrendeld' || s.sloten.technisch.staat === 'agent');
  if (staten.includes('agent')) return badge(tech ? 'agent-technisch' : 'agent', titel);
  if (staten.includes('ontgrendeld')) return badge(tech ? 'open-technisch' : 'open', titel);
  return badge('off', titel);
}

// ---------------------------------------------------------------- bijwerken (0.4.1)
const ZELF_GEHOST = !!chrome.runtime.getManifest().update_url;
let laatsteBekend = '';
const ouderDan = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
async function versieOphalen() {
  try {
    const r = await fetch(`${SITE}/downloads/extension-version.json`, { cache: 'no-cache', credentials: 'omit' });
    if (!r.ok) return null;
    const j = await r.json();
    laatsteBekend = typeof j.version === 'string' ? j.version : '';
    if (laatsteBekend && ouderDan(VERSION, laatsteBekend)) {
      try { await chrome.action.setBadgeBackgroundColor({ color: '#1d4ed8' }); await chrome.action.setBadgeText({ text: '↑' }); await chrome.action.setTitle({ title: `Mijn Ruimte ${VERSION} → ${laatsteBekend} beschikbaar` }); } catch { /* geen actie */ }
    }
    return j;
  } catch { return null; }
}
async function updateControleren(handmatig) {
  const j = await versieOphalen();
  if (!ZELF_GEHOST) return { ok: false, reason: 'UNPACKED', version: VERSION, latest: laatsteBekend || null };
  if (!handmatig) return { ok: true, version: VERSION, latest: laatsteBekend || null };
  try {
    const [status, details] = await new Promise((resolve) => chrome.runtime.requestUpdateCheck((st, det) => resolve([st, det])));
    if (status === 'update_available') { setTimeout(() => chrome.runtime.reload(), 500); return { ok: true, status, next: details?.version || laatsteBekend || null }; }
    return { ok: true, status, version: VERSION, latest: j?.version || null };
  } catch (e) { return { ok: false, reason: 'CHECK_FAILED', detail: String(e?.message || e).slice(0, 120) }; }
}
chrome.alarms.create('versie', { periodInMinutes: 360 });

// ---------------------------------------------------------------- verbinding per slot
const verbindt = { prive: false, technisch: false };
async function connect(r) {
  if (!r) { for (const x of RUIMTES) await connect(x); return; }
  const s = sloten[r];
  if (verbindt[r] || (s.ws && (s.ws.readyState === WebSocket.OPEN || s.ws.readyState === WebSocket.CONNECTING))) return;
  verbindt[r] = true;
  try {
    const st = await slotState(r);
    if (!st.agentToken || !st.server || !isOwnSiteUrl(`${st.server}/`)) return;
    const host = new URL(st.server).host;
    let ticket;
    try {
      const res = await fetch(`${st.server}/api/owner/agents/ws-ticket`, { method: 'GET', headers: { Authorization: `Bearer ${st.agentToken}` }, cache: 'no-store', credentials: 'omit' });
      if (res.status === 401) { await forget(r, 'revoked'); return; }
      if (res.status === 403) { const d = await res.json().catch(() => ({})); s.lastError = ruimteFout(403, d && (d.reden || d.error)).melding; return; }
      if (!res.ok) { s.lastError = `ticket ${res.status}`; return; }
      ticket = (await res.json()).ticket;
    } catch { s.lastError = 'offline'; return; }
    await chrome.storage.session.set({ [K.ticket(r)]: ticket });
    s.ready = false;
    const socket = new WebSocket(`wss://${host}/agent/ws`);
    s.ws = socket;
    socket.onopen = async () => {
      const v = await chrome.storage.session.get(K.ticket(r));
      await chrome.storage.session.remove(K.ticket(r)); // eenmalig
      socket.send(JSON.stringify({ t: 'auth', ticket: v[K.ticket(r)], version: VERSION, capabilities: capabilities(r), sessie: await browserSessie() }));
    };
    socket.onmessage = (event) => { handle(r, socket, event.data).catch((err) => { s.lastError = String((err && err.message) || err); }); };
    socket.onclose = async (event) => {
      if (s.ws !== socket) return; // een oudere socket van dit slot
      s.ready = false;
      clearInterval(s.pingTimer); s.pingTimer = null;
      s.ws = null;
      s.ai = { verbonden: false, agenten: [] };
      if (event.code === 4403) await forget(r, 'revoked');
      else if (event.code === 4401) { s.lastError = sluitFout(4401).melding; }
      else if (event.code === 4410) { s.lastError = 'stopped'; s.noodstop = true; }
      await statusWijziging();
    };
    socket.onerror = () => { s.lastError = 'connection error'; };
  } finally { verbindt[r] = false; }
}

/** Ontkoppel slot r (of alle sloten): geheimen weg, socket dicht, ontgrendeling weg. Het andere slot blijft staan. */
async function forget(r, reason) {
  if (!r) { for (const x of RUIMTES) await forget(x, reason); return; }
  const s = sloten[r];
  await vergeetKoppeling(r);
  await sessie.remove([K.ticket(r), K.settings(r)]);
  s.settings = { epoch: -1, caps: [], blocked: false };
  const oud = s.ws; s.ws = null;
  if (oud) { try { oud.close(); } catch { /* al dicht */ } }
  s.ready = false;
  clearInterval(s.pingTimer); s.pingTimer = null;
  s.ai = { verbonden: false, agenten: [] };
  s.selfCache = { at: 0, data: {} };
  s.lastError = reason || '';
  await vergrendel(r, 'ontkoppeld');
}

const schoon = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, max);
async function handle(r, socket, raw) {
  await geladen;
  const s = sloten[r];
  if (s.ws !== socket) return; // bericht van een oude socket
  const msg = JSON.parse(raw);
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'ready') {
    s.ready = true; s.lastError = ''; s.noodstop = false;
    clearInterval(s.pingTimer);
    s.pingTimer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(pong(r)); }, PING_MS);
    startAfstemming(r); // de server moet de gid van DIT slot bevestigen, anders wissen
    await wachtrijVersturen(r);
    void selfInfo(r, true).then(() => statusWijziging());
    await statusWijziging();
    return;
  }
  if (msg.t === 'ping') { socket.send(pong(r)); return; }
  if (msg.t === 'settings') {
    if (typeof msg.epoch === 'number' && msg.epoch >= s.settings.epoch) {
      s.settings = { epoch: msg.epoch, caps: Array.isArray(msg.caps) ? msg.caps : [], blocked: msg.blocked === true };
      await sessie.set({ [K.settings(r)]: s.settings });
    }
    return;
  }
  if (msg.t === 'ontgrendeling') { await ontvangOntgrendeling(r, msg.grant, msg.sig, msg.einde); return; }
  if (msg.t === 'vergrendel') {
    const reden = SERVER_REDENEN.includes(msg.reden) ? msg.reden : 'ingetrokken';
    const gid = typeof msg.gid === 'string' && msg.gid ? msg.gid : null;
    if (gid) { markeerIngetrokken(r, gid); await bewaarIntrekking(r); if (msg.ingetrokken === true || s.wachtrij.some((w) => w.gid === gid)) await bevestigIntrekking(r, gid); }
    if (!gid || (s.ontgrendeling && s.ontgrendeling.grant.gid === gid)) await vergrendel(r, reden); // zonder gid: ALTIJD wissen
    return;
  }
  if (msg.t === 'agent-status') {
    s.ai = {
      verbonden: msg.verbonden === true,
      agenten: (Array.isArray(msg.agenten) ? msg.agenten : []).slice(0, 10).map((a) => ({ naam: schoon(a && a.naam, 60), laatst: Number.isFinite(a && a.laatst) ? a.laatst : 0 })),
    };
    // 0.6.2: het accent dat de eigenaar per agent koos (app.agent_kleuren). Alleen de zes bekende slugs en alleen een
    // accentNAAM; de kleurwaarde zelf komt uit het palet in markering-agenten.js, nooit uit dit bericht.
    if (Array.isArray(msg.kleuren)) {
      const uit = {};
      for (const k of msg.kleuren.slice(0, 20)) {
        const slug = agentSlugUitNaam(k && k.agent);
        const accent = schoon(k && k.accent, 20);
        if (slug && accent) uit[slug] = accent;
      }
      s.agentKleuren = uit;
    }
    await statusWijziging();
    return;
  }
  if (msg.t === 'stop') { await emergencyStop(r); return; }
  if (msg.t !== 'cmd') return;
  const res = await voerOpdrachtUit(r, msg, 'ws');
  const reply = res.ok ? { t: 'result', id: msg.id, ok: true, data: res.data } : { t: 'result', id: msg.id, ok: false, error: res.error };
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(reply));
}

async function emergencyStop(r) {
  const s = sloten[r];
  s.settings = { ...s.settings, caps: [] };
  await sessie.set({ [K.settings(r)]: s.settings });
  s.noodstop = true;
  await vergrendel(r, 'noodstop');
}

// ---------------------------------------------------------------- opdrachtlog (in het geheugen, zonder parameters)
const korteFout = (tekst) => {
  const t = String(tekst || '');
  const code = /^([A-Z][A-Z_]{3,}):/.exec(t);
  return (code ? code[1] : t.replace(/"[^"]*"/g, '"…"')).slice(0, 80);
};
function logRegel(r, type, ok, bron, fout) {
  const regel = { at: Date.now(), type: ALLOWED_COMMANDS.includes(type) ? type : 'onbekend', ok: !!ok, bron, ruimte: r };
  if (!ok) regel.fout = korteFout(fout);
  opdrachtLog.push(regel);
  while (opdrachtLog.length > LOG_MAX) opdrachtLog.shift();
}
async function voerOpdrachtUit(r, msg, bron) {
  try {
    const data = await guarded(r, msg, bron);
    logRegel(r, msg && msg.type, true, bron);
    return { ok: true, data };
  } catch (err) {
    const error = String((err && err.message) || err).slice(0, 300);
    logRegel(r, msg && msg.type, false, bron, error);
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------- controles vóór elke opdracht (per slot)
function capFor(r, type) {
  const cap = TYPE_CAPABILITY[type];
  return cap ? sloten[r].settings.caps.find((c) => c && c.capability === cap) || null : null;
}
async function guarded(r, msg, bron) {
  await geladen;
  if (!isRuimte(r)) throw new Error('unknown slot');
  const type = msg && msg.type;
  // 1. type bekend
  if (typeof type !== 'string' || !ALLOWED_COMMANDS.includes(type)) throw new Error('unknown command');
  const st = await slotState(r);
  if (!st.agentToken) throw new Error(VERGRENDELD_FOUT[r]);
  // 2. HMAC met de sleutel van DIT slot (de lokale agent heeft geen sleutel maar krijgt alleen LOKAAL_CAPS)
  if (bron === 'ws') {
    if (!st.commandKey) throw new Error('Refused: this pairing has no command key; pair the extension again');
    if (!(await verifyCommand(st.commandKey, msg))) throw new Error('Refused: invalid or expired command signature');
  } else if (bron !== 'lokaal') throw new Error('unknown source');
  // 3. ontgrendeling van DIT slot geldig (opnieuw volledig gecontroleerd, ruimte = slot)
  const g = await geldigeOntgrendeling(r, st);
  if (!g) throw new Error(VERGRENDELD_FOUT[r]);
  const cap = TYPE_CAPABILITY[type];
  if (bron === 'lokaal' && (g.lokaal !== true || !LOKAAL_CAPS.includes(cap))) {
    throw new Error('EXTENSIE_LOKAAL: de lokale agent mag alleen lezen, en alleen als dat bij het ontgrendelen op de site is toegestaan');
  }
  // 4. cap ∈ grant.caps ∩ settings.caps (van dit slot)
  const s = sloten[r];
  if (s.settings.blocked) throw new Error('Refused: AI access is blocked for this account');
  if (!g.caps.includes(cap)) throw new Error(`EXTENSIE_CAP: the unlock on the site does not include "${cap}"`);
  const serverGrant = capFor(r, type);
  if (!serverGrant) throw new Error('Refused: this capability is not granted to this browser (settings epoch ' + s.settings.epoch + ')');
  // 5. parameters
  const v = valideerOpdracht(type, msg.params);
  if (!v.ok) throw new Error(`EXTENSIE_PARAMS: ${v.code} (${String(v.detail || '').slice(0, 120)})`);
  const params = v.params;
  // 6. host ∈ grant.domeinen ∩ hosts van de ruimte (prive nooit admin.*) en binnen de domeinen van de server-grant
  const scope = msg.scope && Array.isArray(msg.scope.domains) ? msg.scope.domains : (Array.isArray(serverGrant.domains) ? serverGrant.domains : []);
  const inBereik = (url) => adresInRuimte(r, url || '', g.domeinen) && urlInScope(url || '', scope);
  const tabOk = (t) => !!t && inBereik(t.url || '') && profielToegestaan(r, profielVan(t.id));
  if (typeof params.url === 'string' && !inBereik(params.url)) throw new Error('EXTENSIE_DOMEIN: the address is outside the pages that were unlocked on the site');
  if (type === 'browser.self_test') return selfTest(r);
  if (type === 'browser.tabs' || (type === 'browser.pages' && params.action === 'new') || type === 'browser.navigate') return run(r, type, params, null, inBereik, tabOk, msg);
  // 7. doeltabblad: host + profiel (vers gevraagd aan de brug), accountclaim = userId van DIT slot
  const tab = await needTab(tabOk);
  const vers = await claimVan(tab.id, true);
  if (!profielToegestaan(r, vers.profiel)) throw new Error(PROFIEL_FOUT[r]);
  const acc = accountState(vers.claim, st.userId);
  if (acc !== 'ok') {
    await badge('warn');
    throw new Error(acc === 'mismatch'
      ? 'Refused: the page is signed in with a different account than the one this browser is paired with'
      : 'Refused: the page does not show which account is signed in (sign in on the site first)');
  }
  return run(r, type, params, tab, inBereik, tabOk, msg);
}

// ---------------------------------------------------------------- 0.7.0: chat in het zijpaneel (slot-token, alleen browserhulpmiddelen op de server)
async function zijpaneelChat(message) {
  const r = isRuimte(message.ruimte) ? message.ruimte : 'prive';
  const st = await slotState(r);
  if (!st.agentToken || !st.server || !isOwnSiteUrl(`${st.server}/`)) return { ok: false, code: 'NIET_GEKOPPELD' };
  if (!huidigeGrant(r)) return { ok: false, code: 'VERGRENDELD' };
  const berichten = Array.isArray(message.messages) ? message.messages.slice(-40).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map((m) => ({ role: m.role, content: String(m.content).slice(0, 20000) })) : [];
  if (!berichten.length) return { ok: false, code: 'LEEG' };
  const tab = message.tab && typeof message.tab === 'object' ? { url: stripQuery(String(message.tab.url || '')), title: String(message.tab.title || '').slice(0, 200) } : undefined;
  try {
    const res = await fetch(`${st.server}/api/owner/agents/extensie/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${st.agentToken}` }, credentials: 'omit', cache: 'no-store',
      body: JSON.stringify({ messages: berichten, ...(tab ? { tab } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, code: String((data && data.error) || `HTTP_${res.status}`).slice(0, 80), status: res.status };
    return { ok: true, reply: String(data.reply || '').slice(0, 60000), steps: Array.isArray(data.steps) ? data.steps.slice(0, 20).map((s) => ({ tool: String(s.tool || '').slice(0, 80), isError: s.isError === true })) : [], truncated: data.truncated === true, model: String(data.model || '').slice(0, 80) };
  } catch (err) { return { ok: false, code: 'NETWERK', detail: String((err && err.message) || err).slice(0, 120) }; }
}

// ---------------------------------------------------------------- tabbladen
async function ownTabs() { return chrome.tabs.query({ url: 'https://*.tarasevych.com/*' }); }
async function targetTab(mag) {
  const tabs = (await ownTabs()).filter((t) => mag(t));
  return tabs.find((t) => t.active && t.lastFocusedWindow) || tabs.find((t) => t.active) || tabs[0] || null;
}
async function needTab(mag) {
  const tab = await targetTab(mag);
  if (!tab) throw new Error('No Mijn Ruimte tab within the unlocked pages (and the right profile) is open in this browser. Use navigate_page first.');
  return tab;
}
function waitComplete(tabId, ms = 15000) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); clearTimeout(timer); resolve(); };
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const timer = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(listener);
  });
}
async function askTab(tabId, message, pogingen = 6) {
  let last;
  for (let i = 0; i < pogingen; i += 1) {
    try { return await chrome.tabs.sendMessage(tabId, message); } catch (err) { last = err; await sleep(400); }
  }
  throw new Error('The page is not ready or the extension is not active on it: ' + String((last && last.message) || last));
}
/** Profielwissel van een tabblad: buffers van het slot dat er niet meer mag weg, debugger los, status opnieuw. */
async function zetTabInfo(tabId, claim, profiel) {
  const oud = tabInfo.get(tabId);
  tabInfo.set(tabId, { claim, profiel });
  if (oud && oud.profiel !== profiel) {
    for (const r of RUIMTES) if (!profielToegestaan(r, profiel)) netwerk.delete(`${r}:${tabId}`);
    if (attached.has(tabId)) { try { await chrome.debugger.detach({ tabId }); } catch { /* al los */ } attached.delete(tabId); }
    return true;
  }
  return !oud || JSON.stringify(oud.claim) !== JSON.stringify(claim);
}
/**
 * Accountclaim + profiel van een tabblad. Na het wekken van de service worker is `tabInfo` leeg: dan (of met vers=true, vóór elke
 * opdracht) vragen we het vers aan de brug van dat tabblad (zelfde parseAccountClaim/parseProfiel als de brug).
 */
async function claimVan(tabId, vers = false) {
  if (!vers && tabInfo.has(tabId)) return tabInfo.get(tabId);
  const a = await stil(() => chrome.tabs.sendMessage(tabId, { op: 'account?' }));
  if (a && a.ok === true && a.data && typeof a.data === 'object') {
    const claim = typeof a.data.claim === 'string' ? parseAccountClaim(a.data.claim) : null;
    const profiel = parseProfiel(a.data.profiel);
    if (await zetTabInfo(tabId, claim, profiel)) void statusWijziging();
  }
  return tabInfo.get(tabId) || { claim: null, profiel: 'gebruiker' };
}
chrome.tabs.onRemoved.addListener((tabId) => { tabInfo.delete(tabId); attached.delete(tabId); for (const r of RUIMTES) netwerk.delete(`${r}:${tabId}`); tabUrls.delete(tabId); });
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url) { // nieuwe pagina: claim en profiel opnieuw lezen; netwerkring alleen houden als het slot er nog mag verzamelen
    tabInfo.delete(tabId);
    tabUrls.set(tabId, info.url);
    const r = verzamelRuimte(tabId, info.url);
    for (const x of RUIMTES) if (x !== r) netwerk.delete(`${x}:${tabId}`);
  }
  if (info.status === 'complete' && tab && isOwnSiteUrl(tab.url || '')) {
    tabUrls.set(tabId, tab.url);
    const r = verzamelRuimte(tabId, tab.url);
    void stil(() => chrome.tabs.sendMessage(tabId, { op: 'diag-modus', aan: !!r, ruimte: r }));
    void statusWijziging();
  }
});
try { chrome.tabs.onActivated.addListener(() => { void statusWijziging(); }); } catch { /* oud */ }
try { chrome.windows.onFocusChanged.addListener(() => { void statusWijziging(); }); } catch { /* geen windows-API */ }

// ---------------------------------------------------------------- netwerk (chrome.webRequest): per slot, alleen als dat slot er NU mag verzamelen
async function tabUrl(tabId) {
  if (tabUrls.has(tabId)) return tabUrls.get(tabId);
  const t = await stil(() => chrome.tabs.get(tabId));
  const url = t && t.url ? t.url : '';
  if (url) tabUrls.set(tabId, url);
  return url;
}
function netBegin(d) {
  if (!d || d.tabId < 0 || !RUIMTES.some((r) => huidigeGrant(r))) return;
  if (netStart.size > 2000) netStart.clear();
  netStart.set(d.requestId, d.timeStamp);
}
async function netEinde(d, fout) {
  if (!d || d.tabId < 0) return;
  const begin = netStart.get(d.requestId);
  netStart.delete(d.requestId);
  await geladen;
  if (!RUIMTES.some((r) => huidigeGrant(r))) return;
  const pagina = d.type === 'main_frame' ? d.url : await tabUrl(d.tabId);
  const r = verzamelRuimte(d.tabId, pagina || ''); // opnieuw na het wachten; hoogstens één slot
  if (!r) return;
  const sleutel = `${r}:${d.tabId}`;
  const ring = netwerk.get(sleutel) || [];
  ring.push({
    at: Math.round(Number(d.timeStamp) || Date.now()), method: schoon(d.method, 10), url: stripQuery(String(d.url || '')).slice(0, 300),
    status: Number.isFinite(d.statusCode) ? d.statusCode : undefined, ms: Number.isFinite(begin) ? Math.max(0, Math.round(d.timeStamp - begin)) : undefined,
    type: schoon(d.type, 20), fromCache: d.fromCache === true, error: fout ? schoon(d.error, 80) : undefined,
  });
  if (ring.length > NET_RING) ring.splice(0, ring.length - NET_RING);
  netwerk.set(sleutel, ring);
}
try {
  chrome.webRequest.onBeforeRequest.addListener(netBegin, NET_FILTER);
  chrome.webRequest.onCompleted.addListener((d) => { void netEinde(d, false); }, NET_FILTER);
  chrome.webRequest.onErrorOccurred.addListener((d) => { void netEinde(d, true); }, NET_FILTER);
} catch { /* geen webRequest: dan alleen wat de pagina meldt */ }

async function netwerkVerzoeken(r, tab, params) {
  const fout = (e) => e.error || (e.status || 0) >= 400;
  const browser = (netwerk.get(`${r}:${tab.id}`) || []).filter((e) => !params.failed_only || fout(e)).slice(-100).map((e) => ({ ...e, bron: 'browser' }));
  let pagina = [];
  let paginaDiag = false;
  const a = await stil(() => askTab(tab.id, { op: 'network', ruimte: r, ...params }, 3));
  if (a && a.ok === true && a.data && Array.isArray(a.data.requests)) {
    paginaDiag = a.data.diagnostics === true;
    pagina = a.data.requests.slice(-100).map((e) => ({ ...e, bron: 'pagina' }));
  }
  return {
    diagnostics: true, pageDiagnostics: paginaDiag,
    sources: { browser: 'recorded by the extension (chrome.webRequest)', pagina: 'reported by the page itself: untrusted' },
    requests: [...browser, ...pagina].sort((x, y) => (x.at || 0) - (y.at || 0)),
  };
}

// ---------------------------------------------------------------- debugger: recht, diagOptIn, technisch slot, eigen site, zichtbaar
// 0.6.1 (punt 7 van de eigenaar, 19.10.2026) — waarom «Chrome не надав дозвіл налагоджувача» altijd kwam:
// Chrome staat `debugger` NIET toe als optioneel recht. Het staat wel in optional_permissions, maar Chrome haalt het er bij het
// inlezen van het manifest uit, dus een rechtenverzoek voor `debugger` eindigt altijd met
// «Only permissions specified in the manifest may be requested» (zie deploy/BROWSER-EXTENSIE.md). Het verzoek stond dus goed (in de
// klikhandler van de opties, binnen het gebruikersgebaar) maar kon per definitie niet slagen.
// Daarom: het recht wordt hier alleen GELEZEN (permissions.contains) en nooit gevraagd; de pagina's (opties, pop-up, zijpaneel)
// vragen het binnen een klik en vertellen bij een mislukking precies waarom en wat de gebruiker kan doen: het pakket
// «діагностика» (DIAG_PAKKET), waarin `debugger` vast in het manifest staat. Zodra het recht er is, werkt diepe diagnose
// ONMIDDELLIJK: permissions.onAdded hangt de onDetach-luisteraar op en duwt de nieuwe stand naar de pagina's en de site.
const heeftDebugger = async () => { try { return (await chrome.permissions.contains({ permissions: ['debugger'] })) === true && typeof chrome.debugger?.attach === 'function'; } catch { return false; } };
/**
 * Of het recht op verzoek gegeven KAN worden, is uit het manifest niet te zien: `debugger` staat er wel in optional_permissions,
 * maar Chrome haalt het er bij het inlezen uit. Dat blijkt pas uit het verzoek zelf. De pagina's melden de uitkomst daarom met
 * {op:'set-diag-stand', stand} en die stand wordt bewaard (chrome.storage.local 'diagRechtStand'), zodat de pop-up, het zijpaneel,
 * de opties én de site daarna hetzelfde zeggen — ook nadat de service worker opnieuw gestart is.
 */
/** 0.8.0: laatste mislukte aanhaking (CONFLICT = DevTools/andere debugger open; ATTACH = andere Chrome-fout). Alleen code + tijd naar de UI. */
let laatsteAttachFout = null;
const BEWAARDE_STANDEN = ['geweigerd', 'niet-aanvraagbaar'];
/** Stand voor de UI van de extensie en voor de site: dezelfde codes als DIAG_RECHT_STANDEN in shared/extensie-ontgrendeling.ts. */
async function diagStand() {
  const [recht, gl] = await Promise.all([heeftDebugger(), globaal()]);
  const optIn = gl.diagOptIn === true;
  const laatst = BEWAARDE_STANDEN.includes(gl.diagRechtStand) ? gl.diagRechtStand : null;
  // 0.8.0: `debugger` staat VAST in het manifest (permissions). Ontbreekt het daar (oud pakket), dan kan Chrome het nooit geven.
  const inManifest = (() => { try { return (chrome.runtime.getManifest().permissions || []).includes('debugger'); } catch { return false; } })();
  const stand = recht ? 'ja' : !inManifest ? 'niet-aanvraagbaar' : optIn ? 'ingetrokken' : laatst || 'nee';
  return {
    recht, optIn, stand, actief: attached.size > 0, inManifest, laatsteFout: laatsteAttachFout ? { code: laatsteAttachFout.code, at: laatsteAttachFout.at } : null,
    // «Nog eens proberen» heeft alleen zin als Chrome het verzoek niet al principieel afwees.
    aanvraagbaar: inManifest && laatst !== 'niet-aanvraagbaar', pakket: DIAG_PAKKET, ruimte: DIAG_RUIMTE, cap: DIAG_CAP,
  };
}
let debugLuisteraar = false;
function debuggerLuisteraars() {
  if (debugLuisteraar) return;
  // onDetach: de gebruiker sloot de gele balk, de pagina ging weg of Chrome trok het recht in → tabblad uit `attached`, status opnieuw.
  try {
    chrome.debugger.onDetach.addListener((src, reden) => {
      if (src && src.tabId) attached.delete(src.tabId);
      if (String(reden || '') === 'canceled_by_user') losgelaten = { at: Date.now(), reden: 'canceled_by_user' };
      void statusWijziging();
    });
    debugLuisteraar = true;
  } catch { /* nog geen permissie */ }
}
/** Laatste losmaking door de gebruiker (alleen voor uitleg in de UI; nooit inhoud). */
let losgelaten = null;
debuggerLuisteraars();
try { chrome.permissions.onAdded.addListener(() => { debuggerLuisteraars(); void statusWijziging(); }); } catch { /* oud */ }
// Het recht kan op ELK moment ingetrokken worden (chrome://extensions): meteen alles losmaken en de nieuwe stand verspreiden.
try { chrome.permissions.onRemoved.addListener(() => { losgelaten = { at: Date.now(), reden: 'permission_removed' }; void detachAll().then(() => statusWijziging()); }); } catch { /* oud */ }

const cdp = (target, method, params) => chrome.debugger.sendCommand(target, method, params);
/**
 * Aanhaken mag alleen als ALLES klopt (punt 7: de veiligheidsmodel blijft gelijk, maar nu ook hier nagelopen in plaats van alleen
 * in de keten erboven): het Chrome-recht is er, de gebruiker zette diepe diagnose aan, het is het TECHNISCHE slot, de ontgrendeling
 * van dat slot leeft en geeft `browser.debug`, de host staat in die ontgrendeling én in ADMIN_HOSTS_TOEGESTAAN, en het tabblad staat
 * NU in de technische modus. De hele beslissing staat in debuggerToegestaan() in shared.js, zodat de test hem los kan nalopen.
 */
async function humanAttach(r, tab, tabOk, cap = DIAG_CAP) {
  const { diagOptIn } = await chrome.storage.local.get('diagOptIn');
  const now = await chrome.tabs.get(tab.id); // adres (en profiel) OPNIEUW lezen vlak voor het aanhaken
  const vers = await claimVan(tab.id, true);
  const oordeel = debuggerToegestaan({
    recht: await heeftDebugger(), optIn: diagOptIn === true, ruimte: r, url: String(now.url || ''),
    grant: huidigeGrant(r), profiel: vers.profiel, cap,
  });
  if (!oordeel.ok) throw new Error(DEBUG_WEIGER[oordeel.code] || DEBUG_WEIGER.ONGELDIG);
  if (!isOwnSiteUrl(now.url || '') || !tabOk({ ...now, id: tab.id })) throw new Error(DEBUG_WEIGER.DOMEIN);
  const target = { tabId: tab.id };
  try { await chrome.debugger.attach(target, '1.3'); }
  catch (e) {
    // 0.8.0: open DevTools of een andere debugger op hetzelfde tabblad → Chrome weigert; zeg dat precies (geen stille mislukking).
    const m = String((e && e.message) || e || '');
    laatsteAttachFout = { at: Date.now(), code: /already attached|another debugger/i.test(m) ? 'CONFLICT' : 'ATTACH', melding: m.slice(0, 200) };
    void statusWijziging();
    throw new Error(laatsteAttachFout.code === 'CONFLICT' ? DEBUG_WEIGER.CONFLICT : `${DEBUG_WEIGER.ATTACH} (${laatsteAttachFout.melding})`);
  }
  laatsteAttachFout = null;
  attached.add(tab.id);
  await badge('debug');
  return async () => { attached.delete(tab.id); try { await chrome.debugger.detach(target); } catch { /* al los */ } await statusWijziging(); };
}
const DEBUG_WEIGER = {
  GEEN_RECHT: 'Refused: Chrome has not granted the "debugger" permission. It is not active for this extension (0.8.0 declares it in the manifest; reload the extension in chrome://extensions or approve the new permission if Chrome disabled the extension after the update)',
  CONFLICT: 'Refused: another debugger is already attached to this tab (close Chrome DevTools or the other debugging tool for this tab and try again)',
  ATTACH: 'Refused: Chrome could not attach the debugger to this tab',
  GEEN_OPT_IN: 'Refused: deep diagnostics is off in the extension options (the user can switch it on there, in the pop-up or in the side panel)',
  VERKEERDE_RUIMTE: `Refused: the Chrome debugger is only available to the technical profile (slot "${DIAG_RUIMTE}"), never to a user-space AI`,
  GEEN_ONTGRENDELING: `Refused: no active signed unlock with "${DIAG_CAP}" for this slot`,
  DOMEIN: 'Refused: the tab is not on an unlocked tarasevych.com page (or its profile changed)',
  HOST: 'Refused: the Chrome debugger is only allowed on the administrative hosts of the own site',
  PROFIEL: 'Refused: the tab is not in technical mode (activate the technical profile in that tab)',
  ONGELDIG: 'Refused: deep diagnostics is not allowed here',
};
async function detachAll() {
  for (const tabId of [...attached]) { try { await chrome.debugger.detach({ tabId }); } catch { /* al los */ } attached.delete(tabId); }
}

async function deepDiagnostics(r, tab, seconds, reload, tabOk) {
  const secs = Math.min(10, Math.max(1, Number(seconds) || 5));
  const consoleLines = []; const exceptions = []; const failed = []; const slow = []; const pending = new Map();
  let total = 0;
  const onEvent = (src, method, p) => {
    if (src.tabId !== tab.id) return;
    if (method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) {
      consoleLines.push({ level: p.type, text: (p.args || []).map((a) => String(a.value ?? a.description ?? '')).join(' ').slice(0, 300) });
    } else if (method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails || {};
      exceptions.push(String((d.exception && d.exception.description) || d.text || 'exception').split('\n')[0].slice(0, 300));
    } else if (method === 'Network.requestWillBeSent') {
      total += 1; pending.set(p.requestId, { method: p.request.method, url: stripQuery(p.request.url), start: p.timestamp });
    } else if (method === 'Network.responseReceived') {
      const x = pending.get(p.requestId); if (x) x.status = p.response.status;
    } else if (method === 'Network.loadingFinished') {
      const x = pending.get(p.requestId);
      if (x) { const ms = Math.round((p.timestamp - x.start) * 1000); if ((x.status || 0) >= 400) failed.push({ ...x, ms }); else if (ms > 1000) slow.push({ method: x.method, url: x.url, status: x.status, ms }); pending.delete(p.requestId); }
    } else if (method === 'Network.loadingFailed') {
      const x = pending.get(p.requestId); failed.push({ method: x ? x.method : '', url: x ? x.url : '', error: String(p.errorText || '').slice(0, 80) }); pending.delete(p.requestId);
    }
  };
  const detach = await humanAttach(r, tab, tabOk);
  chrome.debugger.onEvent.addListener(onEvent);
  try {
    await cdp({ tabId: tab.id }, 'Runtime.enable'); await cdp({ tabId: tab.id }, 'Network.enable');
    if (reload) await chrome.tabs.reload(tab.id);
    await sleep(secs * 1000);
  } finally {
    chrome.debugger.onEvent.removeListener(onEvent);
    await detach();
  }
  return { url: stripQuery(tab.url), watchedSeconds: secs, mode: 'debugger', requests: total, console: consoleLines.slice(0, 60), exceptions: exceptions.slice(0, 30), failedRequests: failed.slice(0, 60), slowRequests: slow.slice(0, 30) };
}

/**
 * 0.7.0: browser.script = evaluate_script van chrome-devtools-mcp. Zelfde poort als diepe diagnose (debugger-recht uit het pakket
 * «diagnose», opt-in in de opties, TECHNISCH slot, host in de ontgrendeling, tabblad in technische modus) plus de cap
 * 'browser.script' in de ontgrendeling (= het vinkje «Скрипти» in de matrix op de site). Resultaat als JSON (≤ 20 kB); een
 * uitzondering in de pagina komt als fout terug. Nooit in het privéslot.
 */
async function uitvoerScript(r, tab, expression, tabOk) {
  const detach = await humanAttach(r, tab, tabOk, 'browser.script');
  try {
    await cdp({ tabId: tab.id }, 'Runtime.enable');
    const uit = await cdp({ tabId: tab.id }, 'Runtime.evaluate', { expression: String(expression), returnByValue: true, awaitPromise: true, timeout: 10000, userGesture: false });
    if (uit && uit.exceptionDetails) {
      const d = uit.exceptionDetails;
      throw new Error('Script threw: ' + String((d.exception && d.exception.description) || d.text || 'exception').split('\n')[0].slice(0, 300));
    }
    const res = uit && uit.result ? uit.result : {};
    let waarde = res.value;
    if (waarde === undefined && res.type !== 'undefined') waarde = res.description ?? null;
    let tekst = '';
    try { tekst = JSON.stringify(waarde === undefined ? null : waarde); } catch { tekst = JSON.stringify(String(waarde)); }
    const afgekapt = tekst.length > 20000;
    return { url: stripQuery(tab.url), type: res.type || 'undefined', result: afgekapt ? tekst.slice(0, 20000) : tekst, truncated: afgekapt };
  } finally { await detach(); }
}

async function screenshot(tab) {
  if (!tab.active) throw new Error('The Mijn Ruimte tab is not the visible tab of its window; ask the user to switch to it.');
  // 0.6.2: de markering hoort NIET op de momentopname (dan zou de AI haar eigen rand fotograferen en als paginainhoud lezen).
  // De brug zet haar weg, wacht één frame, en zet haar daarna terug; blijft het antwoord weg, dan komt ze er zelf weer op
  // (markering.js heeft een eigen tijdslot in verberg()).
  const terug = await stil(() => chrome.tabs.sendMessage(tab.id, { op: 'markering-verberg', ms: 2000 }));
  if (terug) await sleep(60);
  try {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 });
  const image = String(dataUrl).replace(/^data:image\/jpeg;base64,/, '');
  if (image.length > 2000000) throw new Error('The screenshot is too large');
  return { image, mimeType: 'image/jpeg', url: stripQuery(tab.url), title: tab.title };
  } finally {
    await stil(() => chrome.tabs.sendMessage(tab.id, { op: 'markering-toon' }));
  }
}

// ---------------------------------------------------------------- uitvoeren (params zijn hier al gevalideerd)
/**
 * 0.6.2 (opdracht eigenaar 20.10.2026): WELKE AI leest dit tabblad nu?
 *
 * Eerlijkheid gaat voor volledigheid. Drie bronnen, in deze orde:
 *  1. de opdracht zelf: de server zet de AI-verbinding in `ai` ({naam, slug}) van het {t:'cmd'}-bericht;
 *  2. is er precies ÉÉN AI die net browseropdrachten naar dit slot stuurde ({t:'agent-status'} → ai.agenten binnen de
 *     staart), dan is dat hij;
 *  3. anders: ONBEKEND — slug null en naam leeg. Het opschrift zegt dan «ШІ» / «AI» zonder naam. Nooit de eerste de beste
 *     agent uit de lijst: een verkeerde naam is erger dan geen naam.
 */
function lezerVoor(r, opdracht) {
  const s = sloten[r];
  const uitOpdracht = opdracht && typeof opdracht.ai === 'object' && opdracht.ai ? opdracht.ai : null;
  if (uitOpdracht) {
    const slug = agentSlugUitNaam(uitOpdracht.slug) ?? agentSlugUitNaam(uitOpdracht.naam);
    const naam = schoon(uitOpdracht.naam, 40);
    if (slug || naam) return { slug, naam: slug ? '' : naam };
  }
  const nu = Date.now();
  const vers = (s.ai.agenten || []).filter((a) => a && a.laatst > 0 && nu - a.laatst <= MARKERING_STAART_MS);
  if (vers.length === 1) {
    const slug = agentSlugUitNaam(vers[0].naam);
    return { slug, naam: slug ? '' : schoon(vers[0].naam, 40) };
  }
  return { slug: null, naam: '' };
}

/** Markering in het tabblad bijwerken: deze AI doet NU dit. Zonder bericht verschijnt er niets (geen werk = geen rand). */
function meldLezerIn(r, tab, type, opdracht) {
  const wie = lezerVoor(r, opdracht);
  const accent = (wie.slug && sloten[r].agentKleuren[wie.slug]) || '';
  sloten[r].laatsteLezer = { ...wie, accent, type, at: Date.now() };
  // De badge op het pictogram krijgt dezelfde kleur; na de staart valt hij terug op de kleur van het slot.
  void statusWijziging();
  clearTimeout(badgeStaart);
  badgeStaart = setTimeout(() => { void statusWijziging(); }, MARKERING_STAART_MS + 100);
  if (!tab) return;
  void stil(() => chrome.tabs.sendMessage(tab.id, { op: 'markering-lezer', ruimte: r, slug: wie.slug, naam: wie.naam, accent, type }));
}
let badgeStaart = null;

async function run(r, type, params, tab, inBereik, tabOk, opdracht) {
  meldLezerIn(r, tab, type, opdracht);
  if (type === 'browser.navigate' || (type === 'browser.pages' && params.action === 'new')) {
    if (!isOwnSiteUrl(params.url) || !inBereik(params.url)) throw new Error('Only https addresses on the unlocked tarasevych.com pages');
    let t = type === 'browser.navigate' ? await targetTab(tabOk) : null;
    if (t) t = await chrome.tabs.update(t.id, { url: params.url, active: true });
    else t = await chrome.tabs.create({ url: params.url });
    await waitComplete(t.id);
    const now = await chrome.tabs.get(t.id);
    if (!isOwnSiteUrl(now.url || '') || !inBereik(now.url || '')) throw new Error('EXTENSIE_DOMEIN: the tab ended up outside the unlocked pages; stopped');
    return { pageId: now.id, url: stripQuery(now.url), title: now.title };
  }
  if (type === 'browser.tabs') {
    // 0.7.0: `idx` = plaats in deze lijst (pageIdx van chrome-devtools-mcp: select_page / close_page).
    return { tabs: (await ownTabs()).filter(tabOk).map((t, idx) => ({ idx, id: t.id, title: t.title, url: stripQuery(t.url), active: !!t.active })) };
  }
  if (type === 'browser.pages') {
    const lijst = (await ownTabs()).filter(tabOk);
    const target = Number.isInteger(params.pageIdx) ? lijst[params.pageIdx] : lijst.find((t) => t.id === params.pageId);
    if (!target) throw new Error('No such Mijn Ruimte page (use list_pages)');
    if (params.action === 'select') { await chrome.tabs.update(target.id, { active: true }); await chrome.windows.update(target.windowId, { focused: true }); return { selected: target.id }; }
    if (params.action === 'close') {
      if ((await ownTabs()).length <= 1) throw new Error('Refused: this is the last Mijn Ruimte tab');
      await chrome.tabs.remove(target.id); return { closed: target.id };
    }
    throw new Error('Invalid action');
  }
  if (type === 'browser.history') {
    if (params.action === 'back') await chrome.tabs.goBack(tab.id);
    else if (params.action === 'forward') await chrome.tabs.goForward(tab.id);
    else if (params.action === 'reload') await chrome.tabs.reload(tab.id);
    else throw new Error('Invalid action');
    await sleep(300); await waitComplete(tab.id);
    const now = await chrome.tabs.get(tab.id);
    if (!isOwnSiteUrl(now.url || '') || !inBereik(now.url || '')) throw new Error('EXTENSIE_DOMEIN: the tab ended up outside the unlocked pages; stopped');
    return { url: stripQuery(now.url), title: now.title };
  }
  if (type === 'browser.screenshot') return screenshot(tab);
  if (type === 'browser.deep_diagnostics') return deepDiagnostics(r, tab, params.seconds, params.reload === true, tabOk);
  if (type === 'browser.script') return uitvoerScript(r, tab, params.expression, tabOk);
  if (type === 'browser.network') return netwerkVerzoeken(r, tab, params);
  const op = {
    'browser.snapshot': 'snapshot', 'browser.diagnostics': 'diagnostics', 'browser.invoke': 'invoke', 'browser.click': 'click', 'browser.type': 'type',
    'browser.scroll': 'scroll', 'browser.wait': 'wait', 'browser.select': 'select', 'browser.key': 'key',
    'browser.console': 'console', 'browser.hover': 'hover', 'browser.fill_form': 'fill_form', 'browser.audit': 'audit',
  }[type];
  if (!op) throw new Error('unknown command');
  // `ruimte` gaat mee: de brug weigert zelf als het profiel van de pagina intussen niet (meer) bij dit slot past.
  const answer = await askTab(tab.id, { ...params, op, ruimte: r });
  if (!answer || answer.ok !== true) throw new Error((answer && answer.error) || 'The page did not answer');
  return answer.data;
}

// ---------------------------------------------------------------- zelftest (opties, zijpaneel en browser.self_test)
/** r gezet = alleen dat slot (browser.self_test van een AI ziet het andere slot niet); anders beide. */
async function selfTest(r) {
  const checks = [];
  const add = (id, ok, detail = '') => checks.push({ id, ok: !!ok, detail: String(detail).slice(0, 120) });
  const lijst = r ? [r] : RUIMTES;
  const info = ['debugger_permission', 'diag_opt_in', 'site_tab', 'bridge', 'account', 'profiel', 'markering'];
  for (const x of lijst) {
    const st = await slotState(x);
    const s = sloten[x];
    if (!r && !st.agentToken && x === 'technisch' && !accountInfo.techRecht) continue; // geen technische regels zonder techRecht
    add(`${x}.paired`, !!st.agentToken, st.tokenExpiresAt ? `till ${new Date(Number(st.tokenExpiresAt)).toISOString().slice(0, 10)}` : '');
    if (!st.agentToken) { info.push(`${x}.paired`); continue; }
    add(`${x}.command_key`, !!st.commandKey);
    add(`${x}.connected`, s.ready, s.lastError);
    add(`${x}.settings`, s.settings.epoch >= 0, `epoch ${s.settings.epoch}, ${s.settings.caps.length} capabilities`);
    const g = huidigeGrant(x);
    add(`${x}.unlocked`, !!g, g ? `till ${new Date(huidigEinde(x)).toISOString().slice(11, 16)} UTC, ${g.caps.length} caps` : 'locked');
    info.push(`${x}.unlocked`);
  }
  const ds = await diagStand();
  add('debugger_permission', ds.recht, ds.stand === 'niet-aanvraagbaar' ? 'debugger ontbreekt in manifest (pakket ouder dan 0.8.0)' : ds.laatsteFout ? `${ds.stand}, laatste aanhaking: ${ds.laatsteFout.code}` : ds.stand);
  add('diag_opt_in', ds.optIn);
  const doel = r || 'prive';
  const g = huidigeGrant(doel);
  const tab = await stil(() => targetTab((t) => (g ? tabMag(doel, g, t) : isOwnSiteUrl(t.url || ''))));
  add('site_tab', !!tab, tab && g ? stripQuery(tab.url) : ''); // vergrendeld: geen adres of titel
  if (tab) {
    let bridge = null; try { bridge = await chrome.tabs.sendMessage(tab.id, { op: 'self_test' }); } catch { bridge = null; }
    add('bridge', !!(bridge && bridge.ok), bridge && bridge.data ? `buffer ${bridge.data.buffered}` : '');
    // 0.6.2: leest een AI dit tabblad NU? Alleen informatief — «niemand» is de normale toestand (geen werk = geen rand).
    const mk = bridge && bridge.data ? bridge.data : null;
    add('markering', true, mk && mk.markering ? `${mk.lezers || 0} × ${mk.markering}` : 'niemand leest nu');
    const i = await claimVan(tab.id);
    add('account', accountState(i.claim, await accountUserId()) === 'ok', accountState(i.claim, await accountUserId()));
    add('profiel', true, i.profiel);
  }
  return { version: VERSION, ok: checks.filter((c) => !info.includes(c.id)).every((c) => c.ok), checks };
}

// ---------------------------------------------------------------- /self per slot (hoogstens 1× per 30 s per slot)
const SELF_CACHE_MS = 30_000;
async function selfInfo(r, vers = false) {
  const s = sloten[r];
  const st = await slotState(r);
  if (!st.agentToken) return {};
  if (!vers && Date.now() - s.selfCache.at < SELF_CACHE_MS) return s.selfCache.data;
  s.selfCache = { at: Date.now(), data: s.selfCache.data };
  try {
    const res = await fetch(`${st.server}/api/owner/agents/self`, { method: 'GET', headers: { Authorization: `Bearer ${st.agentToken}` }, cache: 'no-store', credentials: 'omit' });
    if (res.status === 401) { s.selfCache = { at: 0, data: {} }; await forget(r, 'revoked'); return { revoked: true }; }
    if (res.ok) {
      const data = await res.json();
      s.selfCache = { at: Date.now(), data: { enabled: !!data.enabled, active: !!data.active, ruimte: ruimteOf(data.ruimte) } };
      accountInfo = { email: typeof data.email === 'string' ? data.email.slice(0, 200) : accountInfo.email, techRecht: data.techRecht === true || (r === 'technisch' && data.techRecht !== false), at: Date.now() };
      if (ruimteOf(data.ruimte) !== r) await herindelen(r, ruimteOf(data.ruimte));
    }
  } catch { /* offline: toon wat we lokaal weten */ }
  return s.selfCache.data;
}
/** De server zegt dat deze koppeling in de andere ruimte hoort (bv. migratie offline als 'prive'): verhuizen, of weg als dat slot bezet is. */
async function herindelen(van, naar) {
  if (van === naar) return;
  const bron = await slotState(van);
  const doel = await slotState(naar);
  await vergrendel(van, 'ontkoppeld');
  if (!doel.agentToken && bron.agentToken) {
    await geheim.set(pre(naar), { agentToken: bron.agentToken, commandKey: bron.commandKey || '' });
    await chrome.storage.local.set({ [K.local(naar)]: Object.fromEntries(SLOT_VELDEN.map((k) => [k, bron[k]])) });
  }
  const oud = sloten[van].ws; sloten[van].ws = null; if (oud) { try { oud.close(); } catch { /* al dicht */ } }
  sloten[van].ready = false;
  await vergeetKoppeling(van);
  await connect(naar);
}

// ---------------------------------------------------------------- status voor eigen onderdelen
async function selfStatus() {
  for (const r of RUIMTES) await selfInfo(r);
  return statusKern();
}

// ---------------------------------------------------------------- koppelen (alleen via PAIR van mcp.tarasevych.com)
async function pair(code, name) {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (clean.length !== 8) return { ok: false, reason: 'CODE_INVALID' };
  if (usedPairCodes.has(clean)) return { ok: false, reason: 'CODE_USED' };
  usedPairCodes.add(clean);
  const bezet = Object.fromEntries(await Promise.all(RUIMTES.map(async (r) => [r, !!(await slotState(r)).agentToken])));
  const res = await fetch(`${SITE}/api/owner/agents/pair`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', cache: 'no-store',
    body: JSON.stringify({ code: clean, name: String(name || 'Chrome').slice(0, 60), platform: 'browser', pairingId: await installId(), version: VERSION, capabilities: capabilities(null), sloten: bezet }),
  }).catch(() => null);
  if (!res) return { ok: false, reason: 'NETWORK' };
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) return { ok: false, reason: String(data.error || data.reasonCode || res.status) };
  const ruimte = ruimteOf(data.ruimte); // het slot bepaalt de SERVER (code met ruimte); onbekend → prive
  await forget(ruimte, ''); // alleen DIT slot vervangen; het andere blijft
  await geheim.set(pre(ruimte), { agentToken: String(data.token), commandKey: String(data.commandKey || '') });
  await chrome.storage.local.set({ [K.local(ruimte)]: { tokenExpiresAt: data.tokenExpiresAt || Date.now() + 30 * 86400000, agentId: data.agentId,
    userId: data.userId || '', server: SITE, name: String(name || 'Chrome').slice(0, 60) } });
  if (ruimte === 'technisch') accountInfo = { ...accountInfo, techRecht: true };
  await connect(ruimte);
  await statusWijziging();
  return { ok: true, agentId: data.agentId, ruimte };
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  (async () => {
    let origin = '';
    try { origin = new URL(sender.origin || sender.url || '').origin; } catch { origin = ''; }
    if (!origin || !isOwnSiteUrl(`${origin}/`)) return sendResponse({ ok: false, reason: 'ORIGIN' });
    const type = message && message.type;
    const vanTab = sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : null;
    const voorTab = async (s) => {
      const info = vanTab !== null ? tabInfo.get(vanTab) : null;
      return publiek(s, vanTab !== null ? profielVan(vanTab) : null, accountState(info ? info.claim : null, await accountUserId()));
    };
    if (type === 'PING') {
      await geladen;
      const s = await selfStatus();
      return sendResponse({ ok: true, version: VERSION, selfHosted: ZELF_GEHOST, latest: laatsteBekend || null, paired: s.gekoppeld, connected: s.verbonden,
        diagOptIn: s.diagOptIn, ...(await voorTab(s)) });
    }
    if (type === 'STATUS') { await geladen; return sendResponse({ ok: true, ...(await voorTab(await statusKern())) }); }
    const beheerOrigin = ['mcp.tarasevych.com', 'admin.tarasevych.com'].includes(new URL(origin).hostname);
    if ((type === 'SELF_TEST' || type === 'UPDATE_CHECK') && !beheerOrigin) return sendResponse({ ok: false, reason: 'WRONG_HOST' });
    if (type === 'SELF_TEST') return sendResponse({ ok: true, ...(await selfTest()) });
    if (type === 'OPEN_OPTIONS') { await chrome.runtime.openOptionsPage(); return sendResponse({ ok: true }); }
    if (type === 'UPDATE_CHECK') return sendResponse(await updateControleren(true));
    if (type === 'PAIR') {
      if (new URL(origin).hostname !== PAIR_HOST) return sendResponse({ ok: false, reason: 'WRONG_HOST' });
      return sendResponse(await pair(message.code, message.name));
    }
    return sendResponse({ ok: false, reason: 'UNKNOWN' });
  })();
  return true;
});

// ---------------------------------------------------------------- berichten van eigen onderdelen (brug, popup, opties, zijpaneel)
const EIGEN_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '');
const ownPage = (sender) => sender.id === chrome.runtime.id && String(sender.url || '').startsWith(chrome.runtime.getURL(''))
  && (!sender.origin || sender.origin === EIGEN_ORIGIN) && (!sender.tab || String(sender.tab.url || sender.url || '').startsWith(chrome.runtime.getURL('')));
const siteTab = (sender) => !!(sender.tab && isOwnSiteUrl(sender.tab.url || ''));
/** Welke sloten bedoelt een bericht van een eigen pagina? Geldige ruimte = dat slot; anders (ontbreekt) = beide (veilig bij intrekken). */
const slotenVan = (m) => (isRuimte(m && m.ruimte) ? [m.ruimte] : [...RUIMTES]);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return sendResponse({ ok: false });
    await geladen;
    if (message.op === 'account') { // brug: accountclaim + profiel van dit tabblad (bij laden en bij elke wijziging)
      if (!siteTab(sender)) return sendResponse({ ok: false });
      const claim = message.claim && typeof message.claim === 'object' && typeof message.claim.userId === 'string' ? parseAccountClaim(`${message.claim.userId}:${message.claim.sessionTag || ''}`) : null;
      const profiel = parseProfiel(message.profiel);
      await zetTabInfo(sender.tab.id, claim, profiel);
      const acc = accountState(claim, await accountUserId());
      if (acc === 'mismatch' && (await accountUserId())) await badge('warn');
      await statusWijziging();
      return sendResponse({ ok: true, account: acc, profiel });
    }
    if (message.op === 'diag-modus?') { // brug: voor welk slot mag ik verzamelen? (ontgrendeld én regels van dat slot)
      if (!siteTab(sender)) return sendResponse({ ok: false, aan: false, ruimte: null });
      const r = verzamelRuimte(sender.tab.id, sender.tab.url);
      return sendResponse({ ok: true, aan: !!r, ruimte: r });
    }
    if (message.op === 'diag-spill') { // archief: alleen voor het slot dat er nu verzamelt, met het token van DAT slot
      if (!siteTab(sender)) return sendResponse({ ok: false });
      const r = verzamelRuimte(sender.tab.id, sender.tab.url);
      if (!r || message.ruimte !== r || !Array.isArray(message.entries)) return sendResponse({ ok: false });
      const st = await slotState(r);
      if (!st.agentToken) return sendResponse({ ok: false });
      fetch(`${st.server}/api/owner/agents/diagnostics/archive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${st.agentToken}` }, credentials: 'omit',
        body: JSON.stringify({ url: stripQuery(message.url || ''), entries: message.entries.slice(0, 200) }),
      }).catch(() => undefined);
      return sendResponse({ ok: true });
    }
    if (message.op === 'pair-code') { // installatiehulp (guide.js) op mcp.tarasevych.com: zelfde eenmalige code als PAIR
      if (!siteTab(sender) || new URL(sender.tab.url).hostname !== PAIR_HOST) return sendResponse({ ok: false, reason: 'WRONG_HOST' });
      return sendResponse(await pair(message.code, message.name));
    }
    if (message.op === 'status') {
      if (ownPage(sender)) return sendResponse(await selfStatus());
      // Content scripts (brug, installatiehulp): alleen de publieke status + de oude vlaggen; /self hoogstens 1× per 30 s.
      const s = await statusKern();
      const info = await selfInfo('prive');
      const infoT = await selfInfo('technisch');
      const i = siteTab(sender) ? tabInfo.get(sender.tab.id) : null;
      const pub = publiek(s, siteTab(sender) ? profielVan(sender.tab.id) : null, siteTab(sender) ? accountState(i ? i.claim : null, await accountUserId()) : 'unknown');
      const hoofd = s.sloten.prive.gekoppeld ? info : infoT;
      return sendResponse({ ...pub, paired: s.gekoppeld && !hoofd.revoked, connected: s.verbonden, enabled: hoofd.enabled, active: hoofd.active,
        agentId: s.sloten.prive.agentId || (s.sloten.technisch ? s.sloten.technisch.agentId : '') });
    }
    if (!ownPage(sender)) return sendResponse({ ok: false }); // hieronder alleen popup/opties/zijpaneel
    if (message.op === 'self-test') return sendResponse(await selfTest());
    if (message.op === 'log') return sendResponse({ ok: true, regels: opdrachtLog.map((x) => ({ ...x })) });
    // 0.7.0 (zone E): chat «ШІ для вас» in het zijpaneel. Het zijpaneel kiest het slot (profiel van het actieve tabblad); hier gaat het
    // verzoek met het agenttoken van DAT slot naar de server (POST /api/owner/agents/extensie/chat, zonder cookie — de CSRF-regel
    // van de site wijst cookies vanaf chrome-extension:// af). De server geeft het model ALLEEN de browserhulpmiddelen en richt elke
    // aanroep op deze browser; de opdrachten komen via het gewone kanaal terug en gaan door dezelfde poorten als vanuit een connector.
    if (message.op === 'zijpaneel-chat') return sendResponse(await zijpaneelChat(message));
    if (message.op === 'vergrendel') {
      const reden = LOKALE_REDENEN.includes(message.reden) ? message.reden : 'popup';
      for (const r of slotenVan(message)) await vergrendelLokaal(r, reden);
      const s = await statusKern();
      return sendResponse({ ok: true, status: s, staat: isRuimte(message.ruimte) ? (s.sloten[message.ruimte] || { staat: 'niet-gekoppeld' }).staat : s.sloten.prive.staat });
    }
    if (message.op === 'set-diag') { // diagOptIn geldt alleen voor chrome.debugger (diepe diagnose)
      // Zonder het Chrome-recht blijft diepe diagnose uit: de pagina krijgt de volledige stand terug (met `aanvraagbaar`), zodat
      // ze precies kan zeggen waarom en wat de gebruiker kan doen — niet alleen «Chrome не надав дозвіл».
      if (message.on === true && !(await heeftDebugger())) return sendResponse({ ok: false, reason: 'PERMISSION', diagOptIn: (await globaal()).diagOptIn === true, diagnostiek: await diagStand() });
      await chrome.storage.local.set({ diagOptIn: message.on === true });
      if (message.on !== true) await detachAll();
      if (message.on === true) { debuggerLuisteraars(); losgelaten = null; await chrome.storage.local.remove('diagRechtStand'); } // meteen actief, zonder herstart
      void statusWijziging();
      return sendResponse({ ok: true, diagOptIn: message.on === true, diagnostiek: await diagStand() });
    }
    if (message.op === 'diag-stand') return sendResponse({ ok: true, diagnostiek: await diagStand() });
    if (message.op === 'set-diag-stand') { // uitkomst van het rechtenverzoek van de PAGINA (die mag het vragen, de worker niet)
      const stand = BEWAARDE_STANDEN.includes(message.stand) ? message.stand : null;
      if (stand) await chrome.storage.local.set({ diagRechtStand: stand });
      else await chrome.storage.local.remove('diagRechtStand');
      void statusWijziging();
      return sendResponse({ ok: true, diagnostiek: await diagStand() });
    }
    if (message.op === 'set-native') {
      if (message.on === true && !(await heeftPermissie('nativeMessaging'))) return sendResponse({ ok: false, reason: 'PERMISSION' });
      await chrome.storage.local.set({ nativeOptIn: message.on === true });
      await statusWijziging();
      return sendResponse({ ok: true, nativeOptIn: message.on === true });
    }
    if (message.op === 'local-stop') { // Стоп in het zijpaneel: lokaal alles stil (beide sloten) en de servers laten weten
      for (const r of RUIMTES) {
        const s = sloten[r];
        s.noodstop = true;
        s.settings = { ...s.settings, caps: [] };
        await sessie.set({ [K.settings(r)]: s.settings });
        await vergrendelLokaal(r, 'noodstop');
        const oud = s.ws; s.ws = null; s.ready = false;
        if (oud) { try { oud.close(1000, 'local stop'); } catch { /* al dicht */ } }
      }
      await statusWijziging();
      return sendResponse({ ok: true });
    }
    if (message.op === 'forget') { for (const r of slotenVan(message)) await forget(r, ''); return sendResponse({ ok: true }); }
    if (message.op === 'open-side-panel' && message.windowId) { try { await chrome.sidePanel.open({ windowId: message.windowId }); } catch { /* niet ondersteund */ } return sendResponse({ ok: true }); }
    return sendResponse({ ok: false });
  })();
  return true;
});

// ---------------------------------------------------------------- lokale agent (Native Messaging, extension/native.js)
const heeftPermissie = async (p) => { try { return (await chrome.permissions.contains({ permissions: [p] })) === true; } catch { return false; } };
let native = null;
let nativeActief = false;
/** Status voor native.js: het slot van de lokale agent (technisch als beide `lokaal` hebben), in de vorm die native.js leest. */
async function nativeStatus() {
  const r = nativeRuimte();
  if (!r) return { staat: 'vergrendeld', ontgrendeling: null, ruimte: null };
  const s = await slotStatus(r);
  return { staat: s.staat, ontgrendeling: s.ontgrendeling, ruimte: r };
}
try {
  if (typeof nativeModule.maakNative === 'function') {
    native = nativeModule.maakNative({
      status: () => nativeStatus(),
      // Altijd bron 'lokaal' (wat native.js ook meegeeft) en altijd het slot van de lokale agent: geen HMAC, wel grant.lokaal en LOKAAL_CAPS.
      voerUit: async (type, params) => {
        const r = nativeRuimte();
        if (!r) throw new Error('EXTENSIE_VERGRENDELD: geen ontgrendeling met «локальний агент»');
        const x = await voerOpdrachtUit(r, { type, params }, 'lokaal');
        if (!x.ok) throw new Error(x.error);
        return x.data;
      },
      opWijziging: () => { void statusWijziging(); },
    });
  }
} catch { native = null; }
async function nativeBijwerken() {
  if (!native) return;
  const gl = await globaal();
  const mag = gl.nativeOptIn === true && !!nativeRuimte() && await heeftPermissie('nativeMessaging');
  if (mag) { nativeActief = true; await stil(() => native.start()); }
  else if (nativeActief) { nativeActief = false; await stil(() => native.stop()); }
}

// ---------------------------------------------------------------- opstarten
/** Na het wekken van de service worker: migratie, dan per slot ontgrendeling en settings uit storage.session, opnieuw gecontroleerd. */
const geladen = (async () => {
  await stil(() => chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }));
  await gemigreerd();
  for (const r of RUIMTES) {
    const s = sloten[r];
    const v = await sessie.get([K.ontgr(r), K.settings(r), K.intrek(r)]);
    if (v[K.settings(r)] && typeof v[K.settings(r)] === 'object') s.settings = v[K.settings(r)];
    const i = v[K.intrek(r)] && typeof v[K.intrek(r)] === 'object' ? v[K.intrek(r)] : {};
    if (Array.isArray(i.ingetrokken)) s.ingetrokken = i.ingetrokken.filter((x) => typeof x === 'string').slice(-MAX_INGETROKKEN);
    if (Number.isFinite(i.laatsteIat)) s.laatsteIat = i.laatsteIat;
    if (Array.isArray(i.wachtrij)) s.wachtrij = i.wachtrij.filter((w) => w && typeof w.gid === 'string' && typeof w.reden === 'string').slice(-50);
    const o = v[K.ontgr(r)];
    if (o && typeof o === 'object') {
      const st = await stil(() => slotState(r)) || {};
      const x = await verifyOntgrendeling(st.commandKey, o.grant, o.sig, eigenVan(st, r));
      const op = Number(o.ontvangenOp);
      const ontvangenOp = Number.isFinite(op) && op <= Date.now() ? op : Date.now();
      if (x.ok && !s.ingetrokken.includes(x.grant.gid)) { s.ontgrendeling = { grant: x.grant, sig: o.sig, ontvangenOp, einde: EINDE_WEERGAVE.includes(o.einde) ? o.einde : null }; planEinde(r, eindeLokaal(s.ontgrendeling)); }
      if (!s.ontgrendeling) await sessie.remove(K.ontgr(r));
    }
  }
})().catch(() => undefined);
// Na het wekken: claims en profielen van open tabbladen opnieuw ophalen (geheugen is leeg), dan de status duwen.
void geladen.then(async () => { for (const tab of (await stil(ownTabs)) || []) await stil(() => claimVan(tab.id)); }).then(() => statusWijziging());

// Na het installeren opent de extensie zelf de pagina waar de gebruiker inlogt, koppelt en kiest wat mag.
chrome.runtime.onInstalled.addListener(async (details) => {
  await installId();
  if (details.reason === 'install') chrome.tabs.create({ url: `${SITE}/agents?extension=welcome#extensie` });
  if (details.reason === 'update') {
    // 0.3 → 0.4: een oud token zonder opdrachtsleutel en account; bewust opnieuw koppelen.
    const old = await chrome.storage.local.get(['token']);
    if (old.token) { await chrome.storage.local.remove(['token', 'agentId', 'server', 'name']); chrome.tabs.create({ url: `${SITE}/agents?extension=update#extensie` }); }
  }
  connect();
});

// Een wekker (30 s) controleert de verbindingen van beide sloten. Tijdens een verbinding houdt het levensteken (20 s) hem wakker.
chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') { connect(); for (const r of RUIMTES) void eindeBereikt(r); }
  if (alarm.name === 'versie') void versieOphalen();
  for (const r of RUIMTES) if (alarm.name === K.alarm(r)) void eindeBereikt(r);
});
chrome.runtime.onStartup.addListener(() => { connect(); void versieOphalen(); });
void versieOphalen();
connect();
