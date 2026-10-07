// Діагностика сторінки без дозволу «debugger»: збирач, який розширення на кілька секунд вбудовує в саму сторінку (MAIN world) через chrome.scripting.
// Збирає лише: помилки/попередження консоли (текст), винятки, адреси (без параметрів) невдалих і повільних запитів зі статусом і часом.
// Ніколи не читає вміст відповідей, заголовки, тіла запитів чи значення об'єктів. Результат забирає background.js і додає до відповіді ШІ.
(() => {
  const clip = (value, max = 300) => String(value == null ? '' : value).slice(0, max);
  const noQuery = (url) => { try { const u = new URL(url, location.href); return u.origin + u.pathname; } catch { return ''; } };
  const existing = window.__mrDiag;
  const d = existing || { console: [], exceptions: [], failed: [], slow: [], requests: 0 };
  d.console.length = 0; d.exceptions.length = 0; d.failed.length = 0; d.slow.length = 0; d.requests = 0;
  if (existing) return; // уже встановлено: лише обнулили
  window.__mrDiag = d;

  for (const [level, kind] of [['error', 'error'], ['warn', 'warning']]) {
    const original = console[level];
    console[level] = function (...args) {
      try { if (d.console.length < 60) d.console.push({ level: kind, text: clip(args.map((a) => (typeof a === 'string' ? a : (a && a.message) || '[object]')).join(' ')) }); } catch { /* ігноруємо */ }
      return original.apply(this, args);
    };
  }
  addEventListener('error', (e) => { if (d.exceptions.length < 30) d.exceptions.push(clip(e && e.message || 'error')); }, true);
  addEventListener('unhandledrejection', (e) => { if (d.exceptions.length < 30) d.exceptions.push(clip((e && e.reason && e.reason.message) || (e && e.reason) || 'unhandled rejection')); });

  const record = (method, url, status, ms, error) => {
    if (error) { if (d.failed.length < 60) d.failed.push({ method, url, error: clip(error, 80) }); return; }
    if (status >= 400) { if (d.failed.length < 60) d.failed.push({ method, url, status, ms }); } else if (ms > 1000 && d.slow.length < 30) d.slow.push({ method, url, status, ms });
  };
  const nativeFetch = window.fetch;
  window.fetch = async function (input, init) {
    const start = performance.now();
    const url = noQuery(typeof input === 'string' ? input : (input && input.url) || '');
    const method = clip((init && init.method) || (input && input.method) || 'GET', 10).toUpperCase();
    d.requests += 1;
    try { const response = await nativeFetch.apply(this, arguments); record(method, url, response.status, Math.round(performance.now() - start)); return response; }
    catch (error) { record(method, url, 0, 0, error && error.message || 'network error'); throw error; }
  };
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { this.__mr = { method: clip(method, 10).toUpperCase(), url: noQuery(url) }; return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    const info = this.__mr; const start = performance.now();
    if (info) { d.requests += 1; this.addEventListener('loadend', () => record(info.method, info.url, this.status, Math.round(performance.now() - start), this.status === 0 ? 'network error' : '')); }
    return send.apply(this, arguments);
  };
})();
