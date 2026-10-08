// Mijn Ruimte-extensie 0.4: brug op de pagina's van tarasevych.com (ISOLATED world). Doet vier dingen:
//  1. meldt aan de site dat de extensie er is (zodat het kabinet de juiste stap toont) en leest de accountclaim
//     <meta name="mjn-account" content="userId:sessionTag">; koppelen gaat NIET meer via deze brug maar via
//     chrome.runtime.sendMessage(extensie-id, {type:'PAIR'}) rechtstreeks naar het achtergrondproces (externally_connectable);
//  2. maakt een momentopname van de pagina (tekst, bedieningselementen, door de site aangeboden acties);
//  3. voert op verzoek een actie, klik of invoer uit. Wachtwoord- en betaalvelden worden nooit gelezen of ingevuld;
//  4. houdt de diagnosebuffer bij (≤ 200 regels, met TTL) als de gebruiker diagnose heeft aangezet; oudere regels gaan
//     via het achtergrondproces naar het versleutelde archief op de server (90 dagen).
// Alle verzoeken komen van het achtergrondproces; dat krijgt ze alleen met een geldige toestemming (grant) en handtekening.
(async () => {
  const shared = await import(chrome.runtime.getURL('shared.js'));
  const { isSensitiveField, pickByName, ALLOWED_KEYS, parseAccountClaim, pushDiag } = shared;
  const VERSION = chrome.runtime.getManifest().version;
  const PAIR_HOST = 'mcp.tarasevych.com';

  const say = (data) => window.postMessage({ mrExt: true, version: VERSION, ...data }, location.origin);

  // ---- 1a. accountclaim: bij laden en bij elke wijziging van de meta-tag (inloggen/uitloggen zonder herladen) ----
  let lastClaim = '';
  const readClaim = () => {
    const el = document.querySelector('meta[name="mjn-account"]');
    const raw = el ? String(el.getAttribute('content') || '') : '';
    if (raw === lastClaim) return;
    lastClaim = raw;
    chrome.runtime.sendMessage({ op: 'account', claim: parseAccountClaim(raw) }).catch(() => undefined);
  };
  readClaim();
  new MutationObserver(readClaim).observe(document.head || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });

  // ---- 1b. aanwezigheid (alleen berichten van de pagina zelf) ----
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin || !event.data) return;
    if (event.data.mrExtPing) {
      let status = null; try { status = await chrome.runtime.sendMessage({ op: 'status' }); } catch { status = null; }
      say({ type: 'hello', paired: !!(status && status.paired), connected: !!(status && status.connected), agentId: (status && status.agentId) || '',
        account: (status && status.account) || 'unknown', extensionId: chrome.runtime.id });
      return;
    }
    if (event.data.mrExtPair) say({ type: 'pair-failed', reason: 'USE_EXTERNAL_PAIR' }); // 0.3-pad bestaat niet meer
  });
  say({ type: 'hello', paired: false, connected: false, extensionId: chrome.runtime.id });

  // ---- 4. diagnosebuffer ----
  let diagOn = false;
  let buffer = [];
  chrome.storage.local.get('diagOptIn').then((v) => { diagOn = v.diagOptIn === true; }).catch(() => undefined);
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.diagOptIn) { diagOn = changes.diagOptIn.newValue === true; if (!diagOn) buffer = []; } });
  document.addEventListener('mr-diag', (event) => {
    if (!diagOn) return;
    let entry; try { entry = JSON.parse(String(event.detail || '')); } catch { return; }
    if (!entry || typeof entry !== 'object' || !['console', 'exception', 'request'].includes(entry.kind)) return;
    const clean = { kind: entry.kind, level: entry.level ? String(entry.level).slice(0, 10) : undefined, text: entry.text ? String(entry.text).slice(0, 300) : undefined,
      method: entry.method ? String(entry.method).slice(0, 10) : undefined, url: entry.url ? String(entry.url).slice(0, 300) : undefined,
      status: Number.isFinite(entry.status) ? entry.status : undefined, ms: Number.isFinite(entry.ms) ? entry.ms : undefined, error: entry.error ? String(entry.error).slice(0, 80) : undefined };
    const out = pushDiag(buffer, clean);
    buffer = out.buffer;
    if (out.spill.length) { spillQueue.push(...out.spill); if (spillQueue.length >= 150) flushSpill(); }
  });
  // Oudere regels in partijen naar het archief (de server neemt hoogstens 12 partijen per uur per browser aan).
  let spillQueue = [];
  const flushSpill = () => {
    if (!spillQueue.length) return;
    const entries = spillQueue.slice(-200); spillQueue = [];
    chrome.runtime.sendMessage({ op: 'diag-spill', url: location.origin + location.pathname, entries }).catch(() => undefined);
  };
  setInterval(flushSpill, 10 * 60 * 1000);
  addEventListener('pagehide', flushSpill);
  const fresh = () => { const out = pushDiag(buffer, { kind: 'noop' }); buffer = out.buffer.filter((e) => e.kind !== 'noop'); return buffer; };

  // Uitleg op de pagina na het installeren: alleen als de site de installatiehulp heeft gevraagd (?extension=welcome of de vlag die de site bewaart).
  try {
    const flagged = new URLSearchParams(location.search).get('extension') === 'welcome' || Date.now() - Number(localStorage.getItem('mr.ext.welcome') || 0) < 60 * 60 * 1000;
    if (flagged && location.hostname === PAIR_HOST) import(chrome.runtime.getURL('guide.js')).then((m) => m.startGuide(chrome, VERSION)).catch(() => undefined);
  } catch { /* geen opslag */ }

  // ---- 2. momentopname ----
  const SELECTOR = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[role=option],[contenteditable=""],[contenteditable=true]';
  const visible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    if (el.closest('[aria-hidden=true],[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) { const t = by.split(/\s+/).map((id) => { const n = document.getElementById(id); return n ? textOf(n) : ''; }).join(' ').trim(); if (t) return t; }
    if (el.labels && el.labels.length) { const t = textOf(el.labels[0]); if (t) return t; }
    const own = el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) ? el.value : textOf(el);
    if (own) return own.slice(0, 120);
    return (el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || '').trim();
  };
  const roleOf = (el) => el.getAttribute('role') || (el.tagName === 'A' ? 'link' : el.tagName === 'BUTTON' ? 'button' : el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textbox'
    : el.tagName === 'INPUT' ? (/^(checkbox|radio)$/i.test(el.type) ? el.type.toLowerCase() : /^(button|submit|reset)$/i.test(el.type) ? 'button' : 'textbox') : 'control');
  const controls = () => [...document.querySelectorAll(SELECTOR)].filter(visible).map((el) => ({ el, name: nameOf(el), role: roleOf(el) })).filter((c) => c.name);

  // De site biedt acties aan via window.postMessage (src/ai-site-actions.ts); een andere pagina antwoordt niet.
  const askPage = (message, ms = 8000) => new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const onMsg = (event) => {
      if (event.source !== window || event.origin !== location.origin || !event.data || event.data.mrAiReply !== id) return;
      cleanup(); resolve(event.data);
    };
    const timer = setTimeout(() => { cleanup(); resolve(null); }, ms);
    const cleanup = () => { window.removeEventListener('message', onMsg); clearTimeout(timer); };
    window.addEventListener('message', onMsg);
    window.postMessage({ ...message, mrAiId: id }, location.origin);
  });

  async function snapshot() {
    const list = controls().slice(0, 200).map(({ el, name, role }) => {
      const item = { role, name: name.slice(0, 120) };
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') item.disabled = true;
      if (role === 'textbox' && isSensitiveField(el)) item.sensitive = true;
      if (el.getAttribute('aria-expanded')) item.expanded = el.getAttribute('aria-expanded') === 'true';
      if (/^(checkbox|switch|radio)$/.test(role)) item.checked = el.checked === true || el.getAttribute('aria-checked') === 'true';
      return item;
    });
    const actions = await askPage({ mrAi: 'list' });
    return {
      url: location.origin + location.pathname, title: document.title,
      headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).slice(0, 30).map((h) => textOf(h).slice(0, 120)),
      text: (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 15000),
      controls: list,
      actions: actions && Array.isArray(actions.actions) ? actions.actions : [],
    };
  }

  // ---- 3. acties ----
  async function invoke(params) {
    const answer = await askPage({ mrAi: 'invoke', action: String(params.action || ''), args: params.args && typeof params.args === 'object' ? params.args : {} }, 15000);
    if (!answer) throw new Error('The page did not answer: the site offers no such action here (see "actions" in browser_snapshot)');
    if (!answer.ok) throw new Error(String(answer.error || 'The action failed'));
    return answer.result === undefined ? { ok: true } : answer.result;
  }

  function click(params) {
    const picked = pickByName(controls(), params.name);
    if (picked.error) throw new Error(picked.error);
    const { el, name, role } = picked.item;
    if (isSensitiveField(el)) throw new Error('Refused: this is a password or payment field');
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') throw new Error(`"${name}" is disabled`);
    el.scrollIntoView({ block: 'center' });
    el.click();
    return { clicked: name, role };
  }

  function type(params) {
    const fields = controls().filter((c) => c.role === 'textbox');
    const picked = pickByName(fields, params.name);
    if (picked.error) throw new Error(picked.error);
    const { el, name } = picked.item;
    if (isSensitiveField(el)) throw new Error('Refused: this is a password or payment field');
    if (el.disabled || el.readOnly) throw new Error(`"${name}" cannot be edited`);
    el.focus();
    const text = String(params.text ?? '').slice(0, 2000);
    if (el.isContentEditable) { el.textContent = text; }
    else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { typed: name, length: text.length };
  }

  // ---- kijken en verschuiven (verandert niets aan de gegevens) ----
  function scroll(params) {
    const direction = String(params.direction || '');
    const pages = Math.min(10, Math.max(0.1, Number(params.pages) || 1));
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    if (direction === 'top') window.scrollTo({ top: 0, behavior: 'instant' });
    else if (direction === 'bottom') window.scrollTo({ top: max, behavior: 'instant' });
    else if (direction === 'up' || direction === 'down') window.scrollBy({ top: (direction === 'down' ? 1 : -1) * pages * window.innerHeight, behavior: 'instant' });
    else throw new Error('Invalid direction');
    return { scrollY: Math.round(window.scrollY), maxScrollY: Math.round(max), atTop: window.scrollY <= 0, atBottom: window.scrollY >= max - 2 };
  }

  async function waitForText(params) {
    const wanted = String(params.text || '').trim().toLowerCase();
    if (!wanted) throw new Error('empty text');
    const limit = Math.min(15, Math.max(1, Number(params.timeout_seconds) || 10)) * 1000;
    const start = Date.now();
    while (Date.now() - start < limit) {
      if ((document.body.innerText || '').toLowerCase().includes(wanted)) return { found: true, waitedMs: Date.now() - start };
      await new Promise((r) => setTimeout(r, 300));
    }
    return { found: false, waitedMs: Date.now() - start };
  }

  // ---- 0.4: console, netwerk, hover, formulier ----
  function consoleMessages(params) {
    const types = Array.isArray(params.types) && params.types.length ? params.types : null;
    const items = fresh().filter((e) => e.kind === 'exception' || (e.kind === 'console' && (!types || types.includes(e.level))));
    return { diagnostics: diagOn, messages: items.slice(-100).map((e) => ({ type: e.kind === 'exception' ? 'exception' : e.level, text: e.text, at: e.at })) };
  }
  function networkRequests(params) {
    const items = fresh().filter((e) => e.kind === 'request' && (!params.failed_only || e.error || (e.status || 0) >= 400));
    return { diagnostics: diagOn, requests: items.slice(-100).map((e) => ({ method: e.method, url: e.url, status: e.status, ms: e.ms, error: e.error, at: e.at })) };
  }
  function hover(params) {
    const picked = pickByName(controls(), params.name);
    if (picked.error) throw new Error(picked.error);
    const { el, name } = picked.item;
    el.scrollIntoView({ block: 'center' });
    for (const t of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove']) el.dispatchEvent(new MouseEvent(t, { bubbles: t !== 'mouseenter' && t !== 'pointerenter' }));
    return { hovered: name };
  }
  function fillForm(params) {
    const list = Array.isArray(params.elements) ? params.elements.slice(0, 20) : [];
    const results = [];
    for (const item of list) {
      try { results.push({ ok: true, ...type({ name: item.name, text: item.value }) }); }
      catch (err) { results.push({ ok: false, name: String(item.name).slice(0, 120), error: String((err && err.message) || err).slice(0, 200) }); }
    }
    return { filled: results.filter((r) => r.ok).length, results };
  }

  // ---- handelen (de server laat dit alleen door na goedkeuring van de gebruiker) ----
  function selectOption(params) {
    const lists = controls().filter((c) => c.role === 'select');
    const picked = pickByName(lists, params.name);
    if (picked.error) throw new Error(picked.error);
    const { el, name } = picked.item;
    if (el.disabled) throw new Error(`"${name}" is disabled`);
    const wanted = String(params.option || '').trim().toLowerCase();
    const options = [...el.options].map((o) => ({ o, label: (o.label || o.textContent || '').trim(), value: String(o.value) }));
    let hits = options.filter((x) => x.label.toLowerCase() === wanted || x.value.toLowerCase() === wanted);
    if (hits.length !== 1) hits = options.filter((x) => x.label.toLowerCase().includes(wanted));
    if (hits.length !== 1) throw new Error(hits.length ? `ambiguous: ${hits.length} options match "${params.option}"` : `no option "${params.option}" in "${name}"`);
    el.value = hits[0].value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { selected: hits[0].label, in: name };
  }

  function pressKey(params) {
    const key = String(params.key || '');
    if (!ALLOWED_KEYS.includes(key)) throw new Error('Key not allowed');
    const el = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    if (isSensitiveField(el)) throw new Error('Refused: the focused field is a password or payment field');
    const init = { key, code: key, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', init));
    // Door de pagina gegenereerde toetsen activeren zelf niets; de gebruikelijke gevolgen doen we hier bewust na.
    if (key === 'Enter') {
      if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') el.click();
      else if (el.form && el.tagName === 'INPUT') el.form.requestSubmit();
    } else if (key === 'PageDown' || key === 'PageUp') window.scrollBy({ top: (key === 'PageDown' ? 1 : -1) * window.innerHeight, behavior: 'instant' });
    else if (key === 'Home') window.scrollTo({ top: 0, behavior: 'instant' });
    else if (key === 'End') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    else if (key === 'Tab') {
      const focusable = [...document.querySelectorAll(SELECTOR)].filter(visible).filter((e) => !e.disabled && e.tabIndex >= 0);
      const next = focusable[(focusable.indexOf(el) + 1) % Math.max(1, focusable.length)];
      if (next) next.focus();
    }
    el.dispatchEvent(new KeyboardEvent('keyup', init));
    const now = document.activeElement;
    return { pressed: key, focused: now && now !== document.body ? nameOf(now).slice(0, 80) : '' };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        if (message.op === 'scroll') return sendResponse({ ok: true, data: scroll(message) });
        if (message.op === 'wait') return sendResponse({ ok: true, data: await waitForText(message) });
        if (message.op === 'select') return sendResponse({ ok: true, data: selectOption(message) });
        if (message.op === 'key') return sendResponse({ ok: true, data: pressKey(message) });
        if (message.op === 'snapshot') return sendResponse({ ok: true, data: await snapshot() });
        if (message.op === 'invoke') return sendResponse({ ok: true, data: await invoke(message) });
        if (message.op === 'diagnostics') return sendResponse({ ok: true, data: await invoke({ action: 'get_diagnostics' }) });
        if (message.op === 'click') return sendResponse({ ok: true, data: click(message) });
        if (message.op === 'type') return sendResponse({ ok: true, data: type(message) });
        if (message.op === 'console') return sendResponse({ ok: true, data: consoleMessages(message) });
        if (message.op === 'network') return sendResponse({ ok: true, data: networkRequests(message) });
        if (message.op === 'hover') return sendResponse({ ok: true, data: hover(message) });
        if (message.op === 'fill_form') return sendResponse({ ok: true, data: fillForm(message) });
        if (message.op === 'diag-clear') { buffer = []; return sendResponse({ ok: true, data: { cleared: true } }); }
        if (message.op === 'self_test') return sendResponse({ ok: true, data: { bridge: true, diagnostics: diagOn, buffered: fresh().length, claim: !!parseAccountClaim(lastClaim), url: location.origin + location.pathname } });
        return sendResponse({ ok: false, error: 'unknown operation' });
      } catch (err) { return sendResponse({ ok: false, error: String((err && err.message) || err).slice(0, 300) }); }
    })();
    return true;
  });
})();
