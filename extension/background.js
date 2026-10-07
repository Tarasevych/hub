// Mijn Ruimte-extensie: achtergrondproces. Houdt een WebSocket naar de server (zelfde protocol als de pc-agent) en voert
// de opdrachten uit die de gebruiker via zijn AI-assistent heeft gegeven en (waar nodig) heeft goedgekeurd op de site.
// De server beslist of een opdracht mag (aangezet door de gebruiker, ingelogde sessie, mogelijkheid aan, goedkeuring);
// de extensie controleert zelf nog eens het adres (alleen tarasevych.com) en weigert alles wat daarbuiten valt.
import { ALLOWED_COMMANDS, isOwnSiteUrl } from './shared.js';

const VERSION = chrome.runtime.getManifest().version;
const DEFAULT_SITE = 'https://mcp.tarasevych.com';
let ws = null;
let ready = false;
let lastError = '';

const state = () => chrome.storage.local.get(['token', 'agentId', 'server', 'name']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noQuery = (raw) => { try { const u = new URL(raw); return u.origin + u.pathname; } catch { return String(raw || '').split('?')[0].slice(0, 200); } };

async function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const st = await state();
  if (!st.token || !st.server) return;
  let host;
  try { host = new URL(st.server).host; } catch { return; }
  if (!isOwnSiteUrl(`https://${host}/`)) return;
  ready = false;
  const socket = new WebSocket(`wss://${host}/agent/ws`);
  ws = socket;
  socket.onopen = () => socket.send(JSON.stringify({ t: 'auth', token: st.token, version: VERSION, capabilities: { kind: 'browser', version: VERSION, commands: ALLOWED_COMMANDS } }));
  socket.onmessage = (event) => { handle(socket, event.data).catch((err) => { lastError = String((err && err.message) || err); }); };
  socket.onclose = async (event) => {
    ready = false;
    if (ws === socket) ws = null;
    if (event.code === 4403) { // token ingetrokken of ongeldig: vergeten, opnieuw koppelen via de site
      await chrome.storage.local.remove(['token', 'agentId']);
      lastError = 'revoked';
    }
  };
  socket.onerror = () => { lastError = 'connection error'; };
}

async function handle(socket, raw) {
  const msg = JSON.parse(raw);
  if (msg.t === 'ready') { ready = true; lastError = ''; return; }
  if (msg.t === 'ping') { socket.send(JSON.stringify({ t: 'pong' })); return; }
  if (msg.t !== 'cmd') return;
  let reply;
  try { reply = { t: 'result', id: msg.id, ok: true, data: await run(msg.type, msg.params || {}) }; }
  catch (err) { reply = { t: 'result', id: msg.id, ok: false, error: String((err && err.message) || err).slice(0, 300) }; }
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(reply));
}

// ---- tabbladen ----
async function ownTabs() {
  return chrome.tabs.query({ url: 'https://*.tarasevych.com/*' });
}
async function targetTab() {
  const tabs = await ownTabs();
  return tabs.find((t) => t.active && t.lastFocusedWindow) || tabs.find((t) => t.active) || tabs[0] || null;
}
async function needTab() {
  const tab = await targetTab();
  if (!tab) throw new Error('No Mijn Ruimte tab is open in this browser. Use browser_open first.');
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
    try { return await chrome.tabs.sendMessage(tabId, message); }
    catch (err) { last = err; await sleep(400); }
  }
  throw new Error('The page is not ready or the extension is not active on it: ' + String((last && last.message) || last));
}

// ---- diepe diagnose zonder het zware recht "debugger" (Chrome staat dat niet als optioneel recht toe en toont een alarmerende waarschuwing) ----
// Voor enkele seconden plaatsen we een passieve verzamelaar (diag-hook.js) in de pagina zelf via chrome.scripting; hij legt alleen consoletekst, uitzonderingen en
// adres/status/duur van mislukte of trage verzoeken vast, nooit inhoud of headers. Dit vraagt geen extra toestemming buiten de bestaande site-rechten.
async function deepDiagnostics(tab, seconds, reload) {
  if (!isOwnSiteUrl(tab.url || '')) throw new Error('Refused: the tab is not on tarasevych.com');
  const secs = Math.min(10, Math.max(1, Number(seconds) || 5));
  const target = { tabId: tab.id };
  let registered = false;
  try {
    if (reload) {
      // Bij herladen moet de verzamelaar er al zijn voordat de pagina begint te laden.
      await chrome.scripting.registerContentScripts([{ id: 'mr-diag', matches: ['https://*.tarasevych.com/*'], js: ['diag-hook.js'], runAt: 'document_start', world: 'MAIN', persistAcrossSessions: false }]);
      registered = true;
    }
    await chrome.scripting.executeScript({ target, world: 'MAIN', files: ['diag-hook.js'] });
    if (reload) { await chrome.tabs.reload(tab.id); await waitComplete(tab.id); }
    await sleep(secs * 1000);
    const [res] = await chrome.scripting.executeScript({ target, world: 'MAIN', func: () => (window.__mrDiag ? JSON.parse(JSON.stringify(window.__mrDiag)) : null) });
    const d = (res && res.result) || {};
    return { url: noQuery(tab.url), watchedSeconds: secs, requests: d.requests || 0, console: (d.console || []).slice(0, 60), exceptions: (d.exceptions || []).slice(0, 30), failedRequests: (d.failed || []).slice(0, 60), slowRequests: (d.slow || []).slice(0, 30) };
  } finally {
    if (registered) { try { await chrome.scripting.unregisterContentScripts({ ids: ['mr-diag'] }); } catch { /* al weg */ } }
  }
}

async function screenshot(tab) {
  if (!tab.active) throw new Error('The Mijn Ruimte tab is not the visible tab of its window; ask the user to switch to it.');
  let dataUrl;
  try { dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 }); }
  catch (err) { throw new Error('The browser did not allow a screenshot (' + String((err && err.message) || err).slice(0, 120) + '). Make sure the Mijn Ruimte tab is the visible tab of its window.'); }
  const image = String(dataUrl).replace(/^data:image\/jpeg;base64,/, '');
  if (image.length > 2000000) throw new Error('The screenshot is too large');
  return { image, mimeType: 'image/jpeg', url: noQuery(tab.url), title: tab.title };
}

async function run(type, params) {
  if (!ALLOWED_COMMANDS.includes(type)) throw new Error('unknown command');
  if (type === 'browser.navigate') {
    if (!isOwnSiteUrl(params.url)) throw new Error('Only https addresses on tarasevych.com are allowed');
    let tab = await targetTab();
    if (tab) tab = await chrome.tabs.update(tab.id, { url: params.url, active: true });
    else tab = await chrome.tabs.create({ url: params.url });
    await waitComplete(tab.id);
    const now = await chrome.tabs.get(tab.id);
    if (!isOwnSiteUrl(now.url || '')) throw new Error('The tab ended up outside tarasevych.com; stopped');
    return { url: now.url, title: now.title };
  }
  if (type === 'browser.tabs') {
    return { tabs: (await ownTabs()).map((t) => ({ id: t.id, title: t.title, url: noQuery(t.url), active: !!t.active })) };
  }
  if (type === 'browser.history') {
    const tab = await needTab();
    if (params.action === 'back') await chrome.tabs.goBack(tab.id);
    else if (params.action === 'forward') await chrome.tabs.goForward(tab.id);
    else if (params.action === 'reload') await chrome.tabs.reload(tab.id);
    else throw new Error('Invalid action');
    await sleep(300); await waitComplete(tab.id);
    const now = await chrome.tabs.get(tab.id);
    if (!isOwnSiteUrl(now.url || '')) throw new Error('The tab ended up outside tarasevych.com');
    return { url: now.url, title: now.title };
  }
  if (type === 'browser.screenshot') return screenshot(await needTab());
  if (type === 'browser.deep_diagnostics') return deepDiagnostics(await needTab(), params.seconds, params.reload === true);

  const tab = await needTab();
  const op = {
    'browser.snapshot': 'snapshot', 'browser.diagnostics': 'diagnostics', 'browser.invoke': 'invoke', 'browser.click': 'click', 'browser.type': 'type',
    'browser.scroll': 'scroll', 'browser.wait': 'wait', 'browser.select': 'select', 'browser.key': 'key',
  }[type];
  const answer = await askTab(tab.id, { op, ...params });
  if (!answer || answer.ok !== true) throw new Error((answer && answer.error) || 'The page did not answer');
  return answer.data;
}

// ---- status voor het popupvenster: eigen kant + wat de server weet (met het eigen token, zonder sessie) ----
async function selfStatus() {
  const st = await state();
  const base = { paired: !!st.token, connected: ready, agentId: st.agentId || '', name: st.name || '', server: st.server || DEFAULT_SITE, version: VERSION, error: lastError };
  if (!st.token) return base;
  try {
    // GET met het token in de header: een leesactie hoort niet door de CSRF-controle (die voor wijzigende methoden geldt) geblokkeerd te worden.
    const res = await fetch(`${st.server}/api/owner/agents/self`, { method: 'GET', headers: { Authorization: `Bearer ${st.token}` }, cache: 'no-store' });
    if (res.status === 401) return { ...base, paired: false, error: 'revoked' };
    if (res.ok) { const data = await res.json(); return { ...base, enabled: !!data.enabled, active: !!data.active, capabilities: data.capabilities || [] }; }
  } catch { /* offline: toon wat we lokaal weten */ }
  return base;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.op === 'paired') {
      // Alleen een koppeling die vanuit een pagina van onze eigen site komt (de content script draait nergens anders).
      if (!sender.tab || !isOwnSiteUrl(sender.tab.url || '')) return sendResponse({ ok: false });
      await chrome.storage.local.set({ token: message.token, agentId: message.agentId, server: message.server, name: message.name || 'Chrome' });
      if (ws) { try { ws.close(); } catch { /* al dicht */ } ws = null; }
      await connect();
      return sendResponse({ ok: true });
    }
    if (message.op === 'status') return sendResponse(await selfStatus());
    if (message.op === 'forget') {
      await chrome.storage.local.remove(['token', 'agentId', 'server', 'name']);
      if (ws) { try { ws.close(); } catch { /* al dicht */ } ws = null; }
      ready = false;
      return sendResponse({ ok: true });
    }
    return sendResponse({ ok: false });
  })();
  return true;
});

// Na het installeren opent de extensie zelf de pagina waar de gebruiker inlogt, de browser koppelt en kiest wat AAN mag.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') chrome.tabs.create({ url: `${DEFAULT_SITE}/agents?extension=welcome#extension` });
  connect();
});

// Een service worker slaapt na een tijdje; een wekker controleert elke halve minuut de verbinding.
chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'keepalive') connect(); });
chrome.runtime.onStartup.addListener(connect);
connect();
