// Mijn Ruimte-extensie 0.4: achtergrondproces.
// - Verbinding: eerst een eenmalig ticket (60 s) halen met het agenttoken in de Authorization-header, dan de WebSocket openen en het
//   ticket in het EERSTE bericht sturen. Het token staat nooit in een URL. Het ticket leeft in chrome.storage.session, het
//   koppeltoken in chrome.storage.local met een vervaldatum (30 dagen; daarna opnieuw koppelen).
// - Elke 20 s een levensteken (houdt de service worker wakker zolang er een verbinding is; Chrome ≥ 116).
// - Opdrachten worden alleen uitgevoerd met een geldige HMAC-handtekening (sleutel per koppeling), binnen de mogelijkheden en
//   domeinen die de server laatst heeft gepusht ({type:'settings'}), en alleen op een tabblad waarvan de accountclaim
//   (<meta name="mjn-account">) bij het gekoppelde account hoort. Anders: weigeren en de badge wordt geel.
// - 'stop' van de server (knop Стоп): debugger los, diagnosebuffers leeg, verbinding dicht.
// - De site praat alleen via externally_connectable met ons: PING, OPEN_OPTIONS en PAIR (eenmalige code, 5 minuten), en alleen
//   vanaf https://*.tarasevych.com (PAIR alleen vanaf mcp.tarasevych.com).
import { ALLOWED_COMMANDS, TYPE_CAPABILITY, accountState, isOwnSiteUrl, stripQuery, urlInScope, verifyCommand } from './shared.js';

const VERSION = chrome.runtime.getManifest().version;
const SITE = 'https://mcp.tarasevych.com';
const PAIR_HOST = 'mcp.tarasevych.com';
const PING_MS = 20_000;
const TOKEN_KEYS = ['agentToken', 'tokenExpiresAt', 'agentId', 'userId', 'server', 'name', 'commandKey'];
let ws = null;
let ready = false;
let lastError = '';
let pingTimer = null;
let settings = { epoch: -1, caps: [], blocked: false };
const accounts = new Map(); // tabId -> claim
const attached = new Set(); // tabIds met debugger
const usedPairCodes = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const capabilities = () => ({ kind: 'browser', version: VERSION, commands: ALLOWED_COMMANDS, account: true, signed: true });

async function state() {
  const st = await chrome.storage.local.get([...TOKEN_KEYS, 'pairingId', 'diagOptIn']);
  if (st.agentToken && st.tokenExpiresAt && Number(st.tokenExpiresAt) < Date.now()) { // verlopen koppeling: vergeten
    await chrome.storage.local.remove(TOKEN_KEYS);
    lastError = 'expired';
    return { pairingId: st.pairingId, diagOptIn: st.diagOptIn };
  }
  return st;
}
async function installId() {
  const { pairingId } = await chrome.storage.local.get('pairingId');
  if (pairingId) return pairingId;
  const id = `ext-${crypto.randomUUID()}`;
  await chrome.storage.local.set({ pairingId: id });
  return id;
}

// ---------------------------------------------------------------- badge
async function badge(kind) {
  const map = { ok: ['', '#1a7f37'], off: ['', '#6b7280'], warn: ['!', '#ca8a04'], debug: ['DBG', '#b91c1c'], stop: ['■', '#b91c1c'] };
  const [text, color] = map[kind] || map.off;
  try { await chrome.action.setBadgeBackgroundColor({ color }); await chrome.action.setBadgeText({ text }); } catch { /* geen actie */ }
}

// ---------------------------------------------------------------- verbinding
async function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const st = await state();
  if (!st.agentToken || !st.server || !isOwnSiteUrl(`${st.server}/`)) return;
  const host = new URL(st.server).host;
  let ticket;
  try {
    const res = await fetch(`${st.server}/api/owner/agents/ws-ticket`, { method: 'GET', headers: { Authorization: `Bearer ${st.agentToken}` }, cache: 'no-store', credentials: 'omit' });
    if (res.status === 401) { await forget('revoked'); return; }
    if (!res.ok) { lastError = `ticket ${res.status}`; return; }
    ticket = (await res.json()).ticket;
  } catch { lastError = 'offline'; return; }
  await chrome.storage.session.set({ wsTicket: ticket, wsTicketAt: Date.now() });
  ready = false;
  const socket = new WebSocket(`wss://${host}/agent/ws`);
  ws = socket;
  socket.onopen = async () => {
    const { wsTicket } = await chrome.storage.session.get('wsTicket');
    await chrome.storage.session.remove('wsTicket'); // eenmalig
    socket.send(JSON.stringify({ t: 'auth', ticket: wsTicket, version: VERSION, capabilities: capabilities() }));
  };
  socket.onmessage = (event) => { handle(socket, event.data).catch((err) => { lastError = String((err && err.message) || err); }); };
  socket.onclose = async (event) => {
    ready = false;
    clearInterval(pingTimer); pingTimer = null;
    if (ws === socket) ws = null;
    if (event.code === 4403) await forget('revoked');
    else if (event.code === 4410) { lastError = 'stopped'; await badge('stop'); }
    else await badge('off');
  };
  socket.onerror = () => { lastError = 'connection error'; };
}

async function forget(reason) {
  await chrome.storage.local.remove(TOKEN_KEYS);
  await chrome.storage.session.remove(['wsTicket', 'settings']);
  settings = { epoch: -1, caps: [], blocked: false };
  if (ws) { try { ws.close(); } catch { /* al dicht */ } ws = null; }
  ready = false;
  lastError = reason || '';
  await detachAll();
  await badge('off');
}

async function handle(socket, raw) {
  const msg = JSON.parse(raw);
  if (msg.t === 'ready') {
    ready = true; lastError = '';
    clearInterval(pingTimer);
    pingTimer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'pong', version: VERSION, capabilities: capabilities() })); }, PING_MS);
    await badge('ok');
    return;
  }
  if (msg.t === 'ping') { socket.send(JSON.stringify({ t: 'pong', version: VERSION, capabilities: capabilities() })); return; }
  if (msg.t === 'settings') {
    if (typeof msg.epoch === 'number' && msg.epoch >= settings.epoch) {
      settings = { epoch: msg.epoch, caps: Array.isArray(msg.caps) ? msg.caps : [], blocked: msg.blocked === true };
      await chrome.storage.session.set({ settings });
    }
    return;
  }
  if (msg.t === 'stop') { await emergencyStop(); return; }
  if (msg.t !== 'cmd') return;
  let reply;
  try { reply = { t: 'result', id: msg.id, ok: true, data: await guarded(msg) }; }
  catch (err) { reply = { t: 'result', id: msg.id, ok: false, error: String((err && err.message) || err).slice(0, 300) }; }
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(reply));
}

async function emergencyStop() {
  settings = { ...settings, caps: [] };
  await chrome.storage.session.set({ settings });
  await detachAll();
  for (const tab of await ownTabs()) { try { await chrome.tabs.sendMessage(tab.id, { op: 'diag-clear' }); } catch { /* geen brug */ } }
  await badge('stop');
}

// ---------------------------------------------------------------- controles vóór elke opdracht
function capFor(type) {
  const cap = TYPE_CAPABILITY[type];
  return cap ? settings.caps.find((c) => c.capability === cap) || null : null;
}
async function guarded(msg) {
  if (!ALLOWED_COMMANDS.includes(msg.type)) throw new Error('unknown command');
  const st = await state();
  if (st.commandKey && !(await verifyCommand(st.commandKey, msg))) throw new Error('Refused: invalid or expired command signature');
  if (settings.blocked) throw new Error('Refused: AI access is blocked for this account');
  const grant = capFor(msg.type);
  if (!grant) throw new Error('Refused: this capability is not granted to this browser (settings epoch ' + settings.epoch + ')');
  const domains = Array.isArray(msg.scope && msg.scope.domains) ? msg.scope.domains : grant.domains || [];
  const params = msg.params || {};
  if (typeof params.url === 'string' && !urlInScope(params.url, domains)) throw new Error('Refused: the address is outside the domains you allowed');
  if (msg.type === 'browser.self_test') return selfTest();
  if (msg.type === 'browser.tabs' || (msg.type === 'browser.pages' && params.action === 'new') || msg.type === 'browser.navigate') return run(msg.type, params, null, domains, st);
  const tab = await needTab(domains);
  const acc = accountState(accounts.get(tab.id), st.userId);
  if (acc !== 'ok') {
    await badge('warn');
    throw new Error(acc === 'mismatch'
      ? 'Refused: the page is signed in with a different account than the one this browser is paired with'
      : 'Refused: the page does not show which account is signed in (sign in on the site first)');
  }
  return run(msg.type, params, tab, domains, st);
}

// ---------------------------------------------------------------- tabbladen
async function ownTabs() { return chrome.tabs.query({ url: 'https://*.tarasevych.com/*' }); }
async function targetTab(domains = []) {
  const tabs = (await ownTabs()).filter((t) => urlInScope(t.url || '', domains));
  return tabs.find((t) => t.active && t.lastFocusedWindow) || tabs.find((t) => t.active) || tabs[0] || null;
}
async function needTab(domains) {
  const tab = await targetTab(domains);
  if (!tab) throw new Error('No Mijn Ruimte tab within the allowed domains is open in this browser. Use navigate_page first.');
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
async function askTab(tabId, message) {
  let last;
  for (let i = 0; i < 6; i += 1) {
    try { return await chrome.tabs.sendMessage(tabId, message); } catch (err) { last = err; await sleep(400); }
  }
  throw new Error('The page is not ready or the extension is not active on it: ' + String((last && last.message) || last));
}
chrome.tabs.onRemoved.addListener((tabId) => { accounts.delete(tabId); attached.delete(tabId); });
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.url) accounts.delete(tabId); }); // nieuwe pagina: claim opnieuw lezen

// ---------------------------------------------------------------- debugger: alleen met diagOptIn, eigen site, zichtbaar
const cdp = (target, method, params) => chrome.debugger.sendCommand(target, method, params);
async function humanAttach(tab, domains) {
  const { diagOptIn } = await chrome.storage.local.get('diagOptIn');
  if (diagOptIn !== true) throw new Error('Refused: deep diagnostics is off in the extension options (the user can switch it on)');
  const now = await chrome.tabs.get(tab.id); // adres OPNIEUW controleren vlak voor het aanhaken
  if (!isOwnSiteUrl(now.url || '') || !urlInScope(now.url || '', domains)) throw new Error('Refused: the tab is not on an allowed tarasevych.com address');
  const target = { tabId: tab.id };
  await chrome.debugger.attach(target, '1.3'); // Chrome toont de balk "begonnen met foutopsporing" zolang dit duurt
  attached.add(tab.id);
  await badge('debug');
  return async () => { attached.delete(tab.id); try { await chrome.debugger.detach(target); } catch { /* al los */ } await badge(ready ? 'ok' : 'off'); };
}
async function detachAll() {
  for (const tabId of [...attached]) { try { await chrome.debugger.detach({ tabId }); } catch { /* al los */ } attached.delete(tabId); }
}
chrome.debugger.onDetach.addListener((src) => { if (src.tabId) attached.delete(src.tabId); });

async function deepDiagnostics(tab, seconds, reload, domains) {
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
      const r = pending.get(p.requestId); if (r) r.status = p.response.status;
    } else if (method === 'Network.loadingFinished') {
      const r = pending.get(p.requestId);
      if (r) { const ms = Math.round((p.timestamp - r.start) * 1000); if ((r.status || 0) >= 400) failed.push({ ...r, ms }); else if (ms > 1000) slow.push({ method: r.method, url: r.url, status: r.status, ms }); pending.delete(p.requestId); }
    } else if (method === 'Network.loadingFailed') {
      const r = pending.get(p.requestId); failed.push({ method: r ? r.method : '', url: r ? r.url : '', error: String(p.errorText || '').slice(0, 80) }); pending.delete(p.requestId);
    }
  };
  const detach = await humanAttach(tab, domains);
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

async function screenshot(tab) {
  if (!tab.active) throw new Error('The Mijn Ruimte tab is not the visible tab of its window; ask the user to switch to it.');
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 });
  const image = String(dataUrl).replace(/^data:image\/jpeg;base64,/, '');
  if (image.length > 2000000) throw new Error('The screenshot is too large');
  return { image, mimeType: 'image/jpeg', url: stripQuery(tab.url), title: tab.title };
}

// ---------------------------------------------------------------- uitvoeren
async function run(type, params, tab, domains) {
  if (type === 'browser.navigate' || (type === 'browser.pages' && params.action === 'new')) {
    if (!isOwnSiteUrl(params.url) || !urlInScope(params.url, domains)) throw new Error('Only https addresses on the allowed tarasevych.com domains');
    let t = type === 'browser.navigate' ? await targetTab(domains) : null;
    if (t) t = await chrome.tabs.update(t.id, { url: params.url, active: true });
    else t = await chrome.tabs.create({ url: params.url });
    await waitComplete(t.id);
    const now = await chrome.tabs.get(t.id);
    if (!isOwnSiteUrl(now.url || '')) throw new Error('The tab ended up outside tarasevych.com; stopped');
    return { pageId: now.id, url: stripQuery(now.url), title: now.title };
  }
  if (type === 'browser.tabs') {
    return { tabs: (await ownTabs()).filter((t) => urlInScope(t.url || '', domains)).map((t) => ({ id: t.id, title: t.title, url: stripQuery(t.url), active: !!t.active })) };
  }
  if (type === 'browser.pages') {
    const target = (await ownTabs()).find((t) => t.id === params.pageId && urlInScope(t.url || '', domains));
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
    if (!isOwnSiteUrl(now.url || '')) throw new Error('The tab ended up outside tarasevych.com');
    return { url: stripQuery(now.url), title: now.title };
  }
  if (type === 'browser.screenshot') return screenshot(tab);
  if (type === 'browser.deep_diagnostics') return deepDiagnostics(tab, params.seconds, params.reload === true, domains);
  const op = {
    'browser.snapshot': 'snapshot', 'browser.diagnostics': 'diagnostics', 'browser.invoke': 'invoke', 'browser.click': 'click', 'browser.type': 'type',
    'browser.scroll': 'scroll', 'browser.wait': 'wait', 'browser.select': 'select', 'browser.key': 'key',
    'browser.console': 'console', 'browser.network': 'network', 'browser.hover': 'hover', 'browser.fill_form': 'fill_form',
  }[type];
  if (!op) throw new Error('unknown command');
  const answer = await askTab(tab.id, { op, ...params });
  if (!answer || answer.ok !== true) throw new Error((answer && answer.error) || 'The page did not answer');
  return answer.data;
}

// ---------------------------------------------------------------- zelftest (opties, zijpaneel en browser.self_test)
async function selfTest() {
  const st = await state();
  const checks = [];
  const add = (id, ok, detail = '') => checks.push({ id, ok: !!ok, detail: String(detail).slice(0, 120) });
  add('paired', !!st.agentToken, st.tokenExpiresAt ? `till ${new Date(Number(st.tokenExpiresAt)).toISOString().slice(0, 10)}` : '');
  add('command_key', !!st.commandKey);
  add('connected', ready, lastError);
  add('settings', settings.epoch >= 0, `epoch ${settings.epoch}, ${settings.caps.length} capabilities`);
  add('debugger_permission', typeof chrome.debugger?.attach === 'function');
  add('diag_opt_in', st.diagOptIn === true);
  const tab = await targetTab([]);
  add('site_tab', !!tab, tab ? stripQuery(tab.url) : '');
  if (tab) {
    let bridge = null; try { bridge = await chrome.tabs.sendMessage(tab.id, { op: 'self_test' }); } catch { bridge = null; }
    add('bridge', !!(bridge && bridge.ok), bridge && bridge.data ? `buffer ${bridge.data.buffered}` : '');
    add('account', accountState(accounts.get(tab.id), st.userId) === 'ok', accountState(accounts.get(tab.id), st.userId));
  }
  return { version: VERSION, ok: checks.filter((c) => !['diag_opt_in', 'site_tab', 'bridge', 'account'].includes(c.id)).every((c) => c.ok), checks };
}

// ---------------------------------------------------------------- status
async function selfStatus() {
  const st = await state();
  const tab = await targetTab([]);
  const acc = tab ? accountState(accounts.get(tab.id), st.userId) : 'unknown';
  const base = { paired: !!st.agentToken, connected: ready, agentId: st.agentId || '', name: st.name || '', server: st.server || SITE, version: VERSION,
    error: lastError, account: acc, epoch: settings.epoch, caps: settings.caps, blocked: settings.blocked, diagOptIn: st.diagOptIn === true,
    tokenExpiresAt: st.tokenExpiresAt || null, debugging: attached.size > 0 };
  if (!st.agentToken) return base;
  try {
    const res = await fetch(`${st.server}/api/owner/agents/self`, { method: 'GET', headers: { Authorization: `Bearer ${st.agentToken}` }, cache: 'no-store', credentials: 'omit' });
    if (res.status === 401) { await forget('revoked'); return { ...base, paired: false, error: 'revoked' }; }
    if (res.ok) { const data = await res.json(); return { ...base, enabled: !!data.enabled, active: !!data.active }; }
  } catch { /* offline: toon wat we lokaal weten */ }
  return base;
}

// ---------------------------------------------------------------- koppelen (alleen via PAIR van mcp.tarasevych.com)
async function pair(code, name) {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (clean.length !== 8) return { ok: false, reason: 'CODE_INVALID' };
  if (usedPairCodes.has(clean)) return { ok: false, reason: 'CODE_USED' }; // eenmalig (de server weigert hem ook: verbruikt of > 5 min)
  usedPairCodes.add(clean);
  const res = await fetch(`${SITE}/api/owner/agents/pair`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', cache: 'no-store',
    body: JSON.stringify({ code: clean, name: String(name || 'Chrome').slice(0, 60), platform: 'browser', pairingId: await installId(), version: VERSION, capabilities: capabilities() }),
  }).catch(() => null);
  if (!res) return { ok: false, reason: 'NETWORK' };
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) return { ok: false, reason: String(data.error || data.reasonCode || res.status) };
  await forget('');
  await chrome.storage.local.set({ agentToken: data.token, tokenExpiresAt: data.tokenExpiresAt || Date.now() + 30 * 86400000, agentId: data.agentId,
    userId: data.userId || '', commandKey: data.commandKey || '', server: SITE, name: String(name || 'Chrome').slice(0, 60) });
  await connect();
  return { ok: true, agentId: data.agentId };
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  (async () => {
    let origin = '';
    try { origin = new URL(sender.origin || sender.url || '').origin; } catch { origin = ''; }
    if (!origin || !isOwnSiteUrl(`${origin}/`)) return sendResponse({ ok: false, reason: 'ORIGIN' });
    const type = message && message.type;
    if (type === 'PING') { const s = await selfStatus(); return sendResponse({ ok: true, version: VERSION, paired: s.paired, connected: s.connected, account: s.account, epoch: s.epoch }); }
    if (type === 'OPEN_OPTIONS') { await chrome.runtime.openOptionsPage(); return sendResponse({ ok: true }); }
    if (type === 'PAIR') {
      if (new URL(origin).hostname !== PAIR_HOST) return sendResponse({ ok: false, reason: 'WRONG_HOST' });
      return sendResponse(await pair(message.code, message.name));
    }
    return sendResponse({ ok: false, reason: 'UNKNOWN' });
  })();
  return true;
});

// ---------------------------------------------------------------- berichten van eigen onderdelen (brug, popup, opties, zijpaneel)
const ownPage = (sender) => sender.id === chrome.runtime.id && !sender.tab && String(sender.url || '').startsWith(chrome.runtime.getURL(''));
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (sender.id !== chrome.runtime.id) return sendResponse({ ok: false });
    if (message.op === 'account') {
      if (!sender.tab || !isOwnSiteUrl(sender.tab.url || '')) return sendResponse({ ok: false });
      if (message.claim) accounts.set(sender.tab.id, message.claim); else accounts.delete(sender.tab.id);
      const st = await state();
      const acc = accountState(message.claim, st.userId);
      if (st.agentToken && acc === 'mismatch') await badge('warn');
      else if (ready) await badge('ok');
      return sendResponse({ ok: true, account: acc });
    }
    if (message.op === 'diag-spill') {
      if (!sender.tab || !isOwnSiteUrl(sender.tab.url || '')) return sendResponse({ ok: false });
      const st = await state();
      if (!st.agentToken || st.diagOptIn !== true || !Array.isArray(message.entries)) return sendResponse({ ok: false });
      fetch(`${st.server}/api/owner/agents/diagnostics/archive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${st.agentToken}` }, credentials: 'omit',
        body: JSON.stringify({ url: stripQuery(message.url || ''), entries: message.entries.slice(0, 200) }),
      }).catch(() => undefined);
      return sendResponse({ ok: true });
    }
    if (message.op === 'pair-code') { // installatiehulp (guide.js) op mcp.tarasevych.com: zelfde eenmalige code als PAIR
      if (!sender.tab || !isOwnSiteUrl(sender.tab.url || '') || new URL(sender.tab.url).hostname !== PAIR_HOST) return sendResponse({ ok: false, reason: 'WRONG_HOST' });
      return sendResponse(await pair(message.code, message.name));
    }
    if (message.op === 'status') return sendResponse(await selfStatus());
    if (!ownPage(sender)) return sendResponse({ ok: false }); // hieronder alleen popup/opties/zijpaneel
    if (message.op === 'self-test') return sendResponse(await selfTest());
    if (message.op === 'set-diag') {
      await chrome.storage.local.set({ diagOptIn: message.on === true });
      if (message.on !== true) { await detachAll(); for (const tab of await ownTabs()) { try { await chrome.tabs.sendMessage(tab.id, { op: 'diag-clear' }); } catch { /* geen brug */ } } }
      return sendResponse({ ok: true, diagOptIn: message.on === true });
    }
    if (message.op === 'local-stop') { // Стоп in het zijpaneel: lokaal alles stil; de site-knop trekt daarnaast de toestemmingen in
      await emergencyStop();
      if (ws) { try { ws.close(1000, 'local stop'); } catch { /* al dicht */ } ws = null; }
      return sendResponse({ ok: true });
    }
    if (message.op === 'forget') { await forget(''); return sendResponse({ ok: true }); }
    if (message.op === 'open-side-panel' && message.windowId) { try { await chrome.sidePanel.open({ windowId: message.windowId }); } catch { /* niet ondersteund */ } return sendResponse({ ok: true }); }
    return sendResponse({ ok: false });
  })();
  return true;
});

// Na het installeren opent de extensie zelf de pagina waar de gebruiker inlogt, koppelt en kiest wat mag.
chrome.runtime.onInstalled.addListener(async (details) => {
  await installId();
  if (details.reason === 'install') chrome.tabs.create({ url: `${SITE}/agents?extension=welcome#extension` });
  if (details.reason === 'update') {
    // 0.3 → 0.4: een oud token heeft geen opdrachtsleutel en geen account; zonder die twee voert 0.4 niets uit. Dus bewust opnieuw
    // koppelen (dat trekt het oude token op de server in via pairing_id of naam) in plaats van stil op de oude manier doorwerken.
    const old = await chrome.storage.local.get(['token']);
    if (old.token) { await chrome.storage.local.remove(['token', 'agentId', 'server', 'name']); chrome.tabs.create({ url: `${SITE}/agents?extension=update#extension` }); }
  }
  connect();
});

// Een service worker slaapt na een tijdje; een wekker (30 s) controleert de verbinding. Tijdens een verbinding houdt het levensteken (20 s) hem wakker.
chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'keepalive') connect(); });
chrome.runtime.onStartup.addListener(connect);
chrome.storage.session.get('settings').then((v) => { if (v.settings) settings = v.settings; }).catch(() => undefined);
connect();
