// Mijn Ruimte-extensie: script op de pagina's van tarasevych.com. Doet drie dingen:
//  1. meldt aan de site dat de extensie er is (zodat het kabinet "Verbinden" kan tonen) en voert de koppeling uit;
//  2. maakt een momentopname van de pagina (tekst, bedieningselementen, door de site aangeboden acties);
//  3. voert op verzoek een actie, klik of invoer uit. Wachtwoord- en betaalvelden worden nooit gelezen of ingevuld.
// Alle verzoeken komen van het achtergrondproces; dat krijgt ze alleen na goedkeuring volgens het beleid van de gebruiker.
(async () => {
  const shared = await import(chrome.runtime.getURL('shared.js'));
  const { isSensitiveField, pickByName } = shared;
  const VERSION = chrome.runtime.getManifest().version;
  const PAIR_HOST = 'mcp.tarasevych.com';

  const say = (data) => window.postMessage({ mrExt: true, version: VERSION, ...data }, location.origin);

  // ---- 1. aanwezigheid en koppelen (alleen berichten van de pagina zelf) ----
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin || !event.data) return;
    if (event.data.mrExtPing) {
      const status = await chrome.runtime.sendMessage({ op: 'status' }).catch(() => null);
      say({ type: 'hello', paired: !!(status && status.paired), connected: !!(status && status.connected), agentId: (status && status.agentId) || '' });
      return;
    }
    if (event.data.mrExtPair) {
      if (location.hostname !== PAIR_HOST) { say({ type: 'pair-failed', reason: 'WRONG_HOST' }); return; }
      const code = String(event.data.code || '').slice(0, 32);
      const name = String(event.data.name || 'Chrome').slice(0, 60);
      try {
        const res = await fetch('/api/owner/agents/pair', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, name, platform: 'browser', capabilities: { kind: 'browser', version: VERSION } }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.token) { say({ type: 'pair-failed', reason: String(data.error || data.reasonCode || res.status) }); return; }
        const ok = await chrome.runtime.sendMessage({ op: 'paired', token: data.token, agentId: data.agentId, server: location.origin, name });
        say({ type: ok && ok.ok ? 'paired' : 'pair-failed', reason: ok && ok.ok ? '' : 'STORE_FAILED' });
      } catch (err) { say({ type: 'pair-failed', reason: 'NETWORK' }); }
    }
  });
  say({ type: 'hello', paired: false, connected: false });

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
      url: location.href, title: document.title,
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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        if (message.op === 'snapshot') return sendResponse({ ok: true, data: await snapshot() });
        if (message.op === 'invoke') return sendResponse({ ok: true, data: await invoke(message) });
        if (message.op === 'diagnostics') return sendResponse({ ok: true, data: await invoke({ action: 'get_diagnostics' }) });
        if (message.op === 'click') return sendResponse({ ok: true, data: click(message) });
        if (message.op === 'type') return sendResponse({ ok: true, data: type(message) });
        return sendResponse({ ok: false, error: 'unknown operation' });
      } catch (err) { return sendResponse({ ok: false, error: String((err && err.message) || err).slice(0, 300) }); }
    })();
    return true;
  });
})();
