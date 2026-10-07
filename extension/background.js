// Mijn Ruimte-extensie: achtergrondproces. Houdt een WebSocket naar de server (zelfde protocol als de pc-agent) en voert
// de opdrachten uit die de gebruiker via zijn AI-assistent heeft gegeven en (waar nodig) heeft goedgekeurd op de site.
import { ALLOWED_COMMANDS, isOwnSiteUrl } from './shared.js';

const VERSION = chrome.runtime.getManifest().version;
let ws = null;
let ready = false;
let lastError = '';

const state = () => chrome.storage.local.get(['token', 'agentId', 'server', 'name']);

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

async function targetTab() {
  const tabs = await chrome.tabs.query({ url: 'https://*.tarasevych.com/*' });
  return tabs.find((t) => t.active && t.lastFocusedWindow) || tabs.find((t) => t.active) || tabs[0] || null;
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
    catch (err) { last = err; await new Promise((r) => setTimeout(r, 400)); }
  }
  throw new Error('The page is not ready or the extension is not active on it: ' + String((last && last.message) || last));
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
  const tab = await targetTab();
  if (!tab) throw new Error('No Mijn Ruimte tab is open in this browser. Use browser_open first.');
  const op = { 'browser.snapshot': 'snapshot', 'browser.invoke': 'invoke', 'browser.click': 'click', 'browser.type': 'type' }[type];
  const answer = await askTab(tab.id, { op, ...params });
  if (!answer || answer.ok !== true) throw new Error((answer && answer.error) || 'The page did not answer');
  return answer.data;
}

// Berichten van de content script en het popupvenster.
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
    if (message.op === 'status') {
      const st = await state();
      return sendResponse({ paired: !!st.token, connected: ready, name: st.name || '', server: st.server || '', version: VERSION, error: lastError });
    }
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

// Een service worker slaapt na een tijdje; een wekker controleert elke halve minuut de verbinding.
chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'keepalive') connect(); });
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
connect();
