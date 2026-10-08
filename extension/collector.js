// Mijn Ruimte 0.4: verzamelaar in de pagina zelf (MAIN world, document_start), alleen op *.tarasevych.com.
// Legt vast: console-meldingen (tekst, ingekort), uitzonderingen en verzoeken (methode, adres ZONDER querystring, status, duur).
// Nooit inhoud van verzoeken of antwoorden, headers, cookies of formulierwaarden. Elke regel gaat als DOM-gebeurtenis naar bridge.js
// (ISOLATED); die bewaart alleen iets als de gebruiker diagnose heeft aangezet (diagOptIn), anders wordt alles meteen weggegooid.
// De pagina kan zelf ook zulke gebeurtenissen maken: de inhoud is dus onbetrouwbare data (zo behandelt de server haar ook).
(() => {
  if (window.__mrCollector) return;
  Object.defineProperty(window, '__mrCollector', { value: true });
  const clip = (value, max = 300) => String(value == null ? '' : value).slice(0, max);
  const noQuery = (url) => { try { const u = new URL(url, location.href); return u.origin + u.pathname; } catch { return ''; } };
  const emit = (entry) => { try { document.dispatchEvent(new CustomEvent('mr-diag', { detail: JSON.stringify(entry) })); } catch { /* nooit de pagina breken */ } };

  for (const level of ['error', 'warn', 'info', 'log', 'debug']) {
    const original = console[level];
    if (typeof original !== 'function') continue;
    console[level] = function (...args) {
      try { emit({ kind: 'console', level, text: clip(args.map((a) => (typeof a === 'string' ? a : (a && a.message) || '[object]')).join(' ')) }); } catch { /* negeren */ }
      return original.apply(this, args);
    };
  }
  addEventListener('error', (e) => emit({ kind: 'exception', text: clip((e && e.message) || 'error') }), true);
  addEventListener('unhandledrejection', (e) => emit({ kind: 'exception', text: clip((e && e.reason && e.reason.message) || (e && e.reason) || 'unhandled rejection') }));

  const record = (method, url, status, ms, error) => emit({ kind: 'request', method, url, status, ms, error: error ? clip(error, 80) : undefined });
  const nativeFetch = window.fetch;
  window.fetch = async function (input, init) {
    const start = performance.now();
    const url = noQuery(typeof input === 'string' ? input : (input && input.url) || '');
    const method = clip((init && init.method) || (input && input.method) || 'GET', 10).toUpperCase();
    try { const response = await nativeFetch.apply(this, arguments); record(method, url, response.status, Math.round(performance.now() - start)); return response; }
    catch (error) { record(method, url, 0, Math.round(performance.now() - start), (error && error.message) || 'network error'); throw error; }
  };
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__mr = { method: clip(method, 10).toUpperCase(), url: noQuery(url) }; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    const info = this.__mr; const start = performance.now();
    if (info) this.addEventListener('loadend', () => record(info.method, info.url, this.status, Math.round(performance.now() - start), this.status === 0 ? 'network error' : ''));
    return send.apply(this, arguments);
  };
})();
