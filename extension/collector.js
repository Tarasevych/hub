// Mijn Ruimte 0.6: verzamelaar in de pagina zelf (MAIN world, document_start), alleen op *.tarasevych.com.
// PASSIEF tot bridge.js `document.dispatchEvent(new CustomEvent('mr-diag-modus', {detail:'aan'}))` stuurt (dat doet hij alleen als het
// achtergrondproces zegt: het slot dat bij dit tabblad hoort (profiel + host) is ontgrendeld). 'uit' = niets meer uitsturen, prestatiegegevens weg.
// De brug houdt bij voor WELK slot hij verzamelt; wisselt dat (profiel van de pagina), dan gooit hij de buffer weg.
// De omhulsels van console/fetch/XHR staan er altijd (document_start), maar sturen pas iets als de modus aan is.
// Legt vast: console-meldingen (tekst, ingekort), uitzonderingen en verzoeken (methode, adres ZONDER querystring, status, duur);
// prestaties (LCP, CLS, longtasks) alleen als getallen, op verzoek ('mr-perf?') als samenvatting ('mr-perf').
// Nooit inhoud van verzoeken of antwoorden, headers, cookies of formulierwaarden.
// De pagina kan zelf ook zulke gebeurtenissen maken (en de modus aan/uit zetten): bridge.js behandelt alles als onbetrouwbare data
// en bewaart alleen iets als HIJ in verzamelmodus is; de server doet hetzelfde.
(() => {
  if (window.__mrCollector) return;
  Object.defineProperty(window, '__mrCollector', { value: true });
  let aan = false;
  const clip = (value, max = 300) => String(value == null ? '' : value).slice(0, max);
  const noQuery = (url) => { try { const u = new URL(url, location.href); return u.origin + u.pathname; } catch { return ''; } };
  const emit = (entry) => {
    if (!aan) return;
    try { document.dispatchEvent(new CustomEvent('mr-diag', { detail: JSON.stringify(entry) })); } catch { /* nooit de pagina breken */ }
  };

  for (const level of ['error', 'warn', 'info', 'log', 'debug']) {
    const original = console[level];
    if (typeof original !== 'function') continue;
    console[level] = function (...args) {
      if (aan) { try { emit({ kind: 'console', level, text: clip(args.map((a) => (typeof a === 'string' ? a : (a && a.message) || '[object]')).join(' ')) }); } catch { /* negeren */ } }
      return original.apply(this, args);
    };
  }
  addEventListener('error', (e) => { if (aan) emit({ kind: 'exception', text: clip((e && e.message) || 'error') }); }, true);
  addEventListener('unhandledrejection', (e) => { if (aan) emit({ kind: 'exception', text: clip((e && e.reason && e.reason.message) || (e && e.reason) || 'unhandled rejection') }); });

  const record = (method, url, status, ms, error) => emit({ kind: 'request', method, url, status, ms, error: error ? clip(error, 80) : undefined });
  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = async function (input, init) {
      if (!aan) return nativeFetch.apply(this, arguments);
      const start = performance.now();
      const url = noQuery(typeof input === 'string' ? input : (input && input.url) || String(input || ''));
      const method = clip((init && init.method) || (input && input.method) || 'GET', 10).toUpperCase();
      try { const response = await nativeFetch.apply(this, arguments); record(method, url, response.status, Math.round(performance.now() - start)); return response; }
      catch (error) { record(method, url, 0, Math.round(performance.now() - start), (error && error.message) || 'network error'); throw error; }
    };
  }
  // Gegevens per XHR in een WeakMap (geen zichtbare eigenschap op het object van de pagina).
  const xhrInfo = new WeakMap();
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) { try { xhrInfo.set(this, { method: clip(method, 10).toUpperCase(), url: noQuery(url) }); } catch { /* negeren */ } return open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    const info = xhrInfo.get(this);
    if (info && aan) {
      const start = performance.now();
      this.addEventListener('loadend', () => record(info.method, info.url, this.status, Math.round(performance.now() - start), this.status === 0 ? 'network error' : ''));
    }
    return send.apply(this, arguments);
  };

  // ---- prestaties: alleen getallen, alleen in verzamelmodus (buffered: ook wat vóór 'aan' gebeurde, want de browser bewaart dat) ----
  const leeg = () => ({ lcp: null, cls: 0, venster: 0, vensterStart: 0, vensterLaatst: 0, longAantal: 0, longMs: 0 });
  let perf = leeg();
  let waarnemers = [];
  const neem = (type, fn) => {
    try {
      const po = new PerformanceObserver((lijst) => {
        if (!aan) return;
        try { for (const e of lijst.getEntries()) fn(e); } catch { /* negeren */ }
      });
      po.observe({ type, buffered: true });
      waarnemers.push(po);
    } catch { /* type niet ondersteund */ }
  };
  const startPerf = () => {
    if (waarnemers.length || typeof PerformanceObserver !== 'function') return;
    neem('largest-contentful-paint', (e) => { const t = Number(e.startTime); if (Number.isFinite(t) && t >= 0) perf.lcp = t; });
    // CLS zoals web-vitals: grootste sessievenster (pauze < 1 s, venster ≤ 5 s), verschuivingen na invoer tellen niet.
    neem('layout-shift', (e) => {
      if (e.hadRecentInput) return;
      const v = Number(e.value); const t = Number(e.startTime);
      if (!Number.isFinite(v) || !Number.isFinite(t) || v < 0) return;
      if (perf.venster && t - perf.vensterLaatst < 1000 && t - perf.vensterStart < 5000) perf.venster += v;
      else { perf.venster = v; perf.vensterStart = t; }
      perf.vensterLaatst = t;
      if (perf.venster > perf.cls) perf.cls = perf.venster;
    });
    neem('longtask', (e) => { const d = Number(e.duration); if (Number.isFinite(d) && d >= 0) { perf.longAantal += 1; perf.longMs += d; } });
  };
  const stopPerf = () => {
    for (const po of waarnemers) { try { po.disconnect(); } catch { /* negeren */ } }
    waarnemers = []; perf = leeg();
  };
  const rond = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;

  document.addEventListener('mr-diag-modus', (e) => {
    const d = e && e.detail;
    if (d === 'aan') { aan = true; startPerf(); }
    else if (d === 'uit') { aan = false; stopPerf(); }
  });
  document.addEventListener('mr-perf?', (e) => {
    const id = clip(e && e.detail, 40);
    const detail = aan
      ? { id, actief: true, lcp: perf.lcp == null ? null : rond(perf.lcp), cls: rond(perf.cls, 4), longTasks: { aantal: perf.longAantal, totaalMs: rond(perf.longMs) } }
      : { id, actief: false, lcp: null, cls: null, longTasks: null };
    try { document.dispatchEvent(new CustomEvent('mr-perf', { detail: JSON.stringify(detail) })); } catch { /* negeren */ }
  });
})();
