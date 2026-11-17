// 0.9.0–0.9.3: ingebouwde AI van Chrome (Gemini Nano / Gemma 4 op DIT apparaat) — Prompt, Summarizer, Writer, Rewriter, Translator,
// LanguageDetector, Proofreader, SemanticEmbedder, DecisionModel. Klassiek script (CSP script-src 'self'): globalThis.MR_LOKALE_AI.
// Regels:
//  - Alles draait lokaal: er gaat GEEN tekst naar een server (ook niet naar mcp.tarasevych.com). Past bij BYOS.
//  - Riskante functies (autoDownload, tabTekst, multimodaal, siteToegang) staan standaard UIT en dragen «!».
//  - Ze kunnen NOOIT stil zonder uitdrukkelijke bevestiging van de gebruiker (bevestigGevaar: true) aangezet worden.
(() => {
  'use strict';
  const SLEUTEL = 'lokaleAi';

  // Officiële namen van de globale API's + actuele Chrome 157 vlaggen (moeten gelijk blijven aan shared/lokale-ai-model.ts).
  const API = Object.freeze({
    prompt: { glob: 'LanguageModel', naam: ['Діалог (Prompt API)', 'Gesprek (Prompt API)'], vlag: 'prompt-api', oudVlag: 'prompt-api-for-gemini-nano', proef: false },
    summarizer: { glob: 'Summarizer', naam: ['Стислий виклад (Summarizer)', 'Samenvatten (Summarizer)'], vlag: 'summarizer-api', oudVlag: 'summarization-api-for-gemini-nano', proef: false },
    writer: { glob: 'Writer', naam: ['Написання тексту (Writer)', 'Tekst schrijven (Writer)'], vlag: 'writer-api', oudVlag: 'writer-api-for-gemini-nano', proef: true },
    rewriter: { glob: 'Rewriter', naam: ['Переписування (Rewriter)', 'Herschrijven (Rewriter)'], vlag: 'rewriter-api', oudVlag: 'rewriter-api-for-gemini-nano', proef: true },
    translator: { glob: 'Translator', naam: ['Переклад (Translator)', 'Vertalen (Translator)'], vlag: 'translation-api', proef: false },
    detector: { glob: 'LanguageDetector', naam: ['Визначення мови (Language Detector)', 'Taal herkennen (Language Detector)'], vlag: 'language-detection-api', proef: false },
    proofreader: { glob: 'Proofreader', naam: ['Коректура (Proofreader)', 'Proeflezen (Proofreader)'], vlag: 'proofreader-api', oudVlag: 'proofreader-api-for-gemini-nano', proef: true },
    embedder: { glob: 'SemanticEmbedder', naam: ['Значеннєві вектори (Embedder)', 'Betekenisvectoren (Embedder)'], vlag: 'semantic-embedder-api', proef: true },
    decisions: { glob: 'DecisionModel', naam: ['Модель рішень і класифікація (Decisions)', 'Beslismodel en indeling (Decisions)'], vlag: 'decisions-api', proef: true },
  });
  const API_IDS = Object.freeze(Object.keys(API));

  const BASIS_MODEL_TALEN = Object.freeze(['en', 'es', 'ja', 'de', 'fr']);
  const MODEL_TALEN = Object.freeze(['en', 'es', 'ja', 'de', 'fr', 'uk', 'nl']);
  const VERTAAL_TALEN = Object.freeze(['uk', 'nl', 'en', 'de', 'fr', 'es', 'it', 'pl', 'pt', 'ja', 'zh', 'ko', 'tr', 'ar', 'hi']);
  const GEVAAR_VELDEN = Object.freeze(['siteToegang', 'tabTekst', 'multimodaal', 'autoDownload']);

  const STANDAARD = Object.freeze({
    aan: true,
    apis: Object.freeze({
      prompt: true, summarizer: true, writer: true, rewriter: true, translator: true, detector: true, proofreader: true,
      embedder: true, decisions: true,
    }),
    autoDownload: false,
    tabTekst: false,
    multimodaal: false,
    siteToegang: false,
    chatHulp: true,
    vertaalInvoer: true,
    vertaalUitvoer: true,
    doelTaal: 'auto',
    prompt: Object.freeze({ systeem: '', temperatuur: '', topK: '', taal: 'en', schema: '', samplingMode: 'default', toolUse: false }),
    summarizer: Object.freeze({ type: 'key-points', format: 'plain-text', length: 'medium', preference: 'auto', context: '', taal: 'en' }),
    writer: Object.freeze({ tone: 'neutral', format: 'plain-text', length: 'medium', context: '', taal: 'en' }),
    rewriter: Object.freeze({ tone: 'as-is', format: 'as-is', length: 'as-is', context: '', taal: 'en' }),
    translator: Object.freeze({ bron: 'auto', doel: 'auto' }),
    proofreader: Object.freeze({ taal: 'en' }),
    embedder: Object.freeze({}),
    decisions: Object.freeze({ schema: '' }),
    proefTokens: '',
  });

  const KEUZES = Object.freeze({
    'prompt.samplingMode': ['default', 'most-predictable', 'balanced', 'most-creative'],
    'summarizer.type': ['key-points', 'tldr', 'teaser', 'headline'],
    'summarizer.format': ['plain-text', 'markdown'],
    'summarizer.length': ['short', 'medium', 'long'],
    'summarizer.preference': ['auto', 'speed', 'capability'],
    'writer.tone': ['formal', 'neutral', 'casual'],
    'writer.format': ['plain-text', 'markdown'],
    'writer.length': ['short', 'medium', 'long'],
    'rewriter.tone': ['as-is', 'more-formal', 'more-casual'],
    'rewriter.format': ['as-is', 'plain-text', 'markdown'],
    'rewriter.length': ['as-is', 'shorter', 'longer'],
  });

  const NL = String((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase().startsWith('nl');
  const t = (uk, nl) => (NL ? nl : uk);
  const uiTaal = () => (NL ? 'nl' : 'uk');

  // ---------------------------------------------------------------- instellingen
  function opschonen(ruw) {
    const r = ruw && typeof ruw === 'object' ? ruw : {};
    const bool = (v, d) => (typeof v === 'boolean' ? v : d);
    const str = (v, d, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : d);
    const taal = (v, d, lijst) => (typeof v === 'string' && lijst.includes(v) ? v : d);
    const keuze = (pad, v) => (KEUZES[pad].includes(v) ? v : STANDAARD[pad.split('.')[0]][pad.split('.')[1]]);
    const sub = (k) => (r[k] && typeof r[k] === 'object' ? r[k] : {});
    const apis = {};
    for (const id of API_IDS) apis[id] = bool(sub('apis')[id], STANDAARD.apis[id]);
    const p = sub('prompt'), s = sub('summarizer'), w = sub('writer'), rw = sub('rewriter'), tr = sub('translator'), pr = sub('proofreader'), dc = sub('decisions');
    return {
      aan: bool(r.aan, STANDAARD.aan), apis,
      autoDownload: bool(r.autoDownload, false), tabTekst: bool(r.tabTekst, false), multimodaal: bool(r.multimodaal, false), siteToegang: bool(r.siteToegang, false),
      chatHulp: bool(r.chatHulp, true), vertaalInvoer: bool(r.vertaalInvoer, true), vertaalUitvoer: bool(r.vertaalUitvoer, true),
      doelTaal: r.doelTaal === 'auto' ? 'auto' : taal(r.doelTaal, 'auto', VERTAAL_TALEN),
      prompt: {
        systeem: str(p.systeem, ''),
        temperatuur: getalTekst(p.temperatuur),
        topK: getalTekst(p.topK),
        taal: taal(p.taal, 'en', MODEL_TALEN),
        schema: str(p.schema, '', 8000),
        samplingMode: keuze('prompt.samplingMode', p.samplingMode),
        toolUse: bool(p.toolUse, false),
      },
      summarizer: {
        type: keuze('summarizer.type', s.type),
        format: keuze('summarizer.format', s.format),
        length: keuze('summarizer.length', s.length),
        preference: keuze('summarizer.preference', s.preference),
        context: str(s.context, '', 1000),
        taal: taal(s.taal, 'en', MODEL_TALEN),
      },
      writer: { tone: keuze('writer.tone', w.tone), format: keuze('writer.format', w.format), length: keuze('writer.length', w.length), context: str(w.context, '', 1000), taal: taal(w.taal, 'en', MODEL_TALEN) },
      rewriter: { tone: keuze('rewriter.tone', rw.tone), format: keuze('rewriter.format', rw.format), length: keuze('rewriter.length', rw.length), context: str(rw.context, '', 1000), taal: taal(rw.taal, 'en', MODEL_TALEN) },
      translator: { bron: tr.bron === 'auto' ? 'auto' : taal(tr.bron, 'auto', VERTAAL_TALEN), doel: tr.doel === 'auto' ? 'auto' : taal(tr.doel, 'auto', VERTAAL_TALEN) },
      proofreader: { taal: taal(pr.taal, 'en', MODEL_TALEN) },
      embedder: {},
      decisions: { schema: str(dc.schema, '', 8000) },
      proefTokens: str(r.proefTokens, '', 20000),
    };
  }

  /** Past een gedeeltelijke wijziging toe met strikte scheiding tussen veilige velden en «!»-velden. */
  function pasPatchToe(huidig, ruwPatch, { bevestigGevaar = false } = {}) {
    const basis = opschonen(huidig);
    const p = ruwPatch && typeof ruwPatch === 'object' && !Array.isArray(ruwPatch) ? ruwPatch : {};
    const kopie = JSON.parse(JSON.stringify(basis));
    const toegepast = [];
    const geweigerdeGevaarVelden = [];

    if (typeof p.aan === 'boolean') { kopie.aan = p.aan; toegepast.push('aan'); }
    if (Array.isArray(p.apis)) {
      const set = new Set(p.apis.filter((x) => API_IDS.includes(x)));
      for (const id of API_IDS) kopie.apis[id] = set.has(id);
      toegepast.push('apis');
    } else if (p.apis && typeof p.apis === 'object') {
      let geraakt = false;
      for (const id of API_IDS) {
        if (typeof p.apis[id] === 'boolean') { kopie.apis[id] = p.apis[id]; geraakt = true; }
      }
      if (geraakt) toegepast.push('apis');
    }
    for (const k of ['chatHulp', 'vertaalInvoer', 'vertaalUitvoer']) {
      if (typeof p[k] === 'boolean') { kopie[k] = p[k]; toegepast.push(k); }
    }
    if (p.doelTaal === 'auto' || (typeof p.doelTaal === 'string' && VERTAAL_TALEN.includes(p.doelTaal))) {
      kopie.doelTaal = p.doelTaal; toegepast.push('doelTaal');
    }
    for (const grp of ['prompt', 'summarizer', 'writer', 'rewriter', 'translator', 'proofreader', 'decisions']) {
      if (p[grp] && typeof p[grp] === 'object' && !Array.isArray(p[grp])) {
        kopie[grp] = { ...kopie[grp], ...p[grp] };
        toegepast.push(grp);
      }
    }
    if (typeof p.proefTokens === 'string') { kopie.proefTokens = p.proefTokens; toegepast.push('proefTokens'); }

    for (const k of GEVAAR_VELDEN) {
      if (typeof p[k] !== 'boolean') continue;
      if (bevestigGevaar === true) { kopie[k] = p[k]; toegepast.push(k); }
      else geweigerdeGevaarVelden.push(k);
    }
    return { nieuwCfg: opschonen(kopie), toegepast, geweigerdeGevaarVelden };
  }

  function getalTekst(v) {
    if (v === '' || v == null) return '';
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? String(n) : '';
  }
  async function laad() {
    try { const o = await chrome.storage.local.get(SLEUTEL); return opschonen(o && o[SLEUTEL]); } catch { return opschonen(null); }
  }
  async function bewaar(cfg) {
    const schoon = opschonen(cfg);
    await chrome.storage.local.set({ [SLEUTEL]: schoon });
    return schoon;
  }
  function bijWijziging(cb) {
    try {
      chrome.storage.onChanged.addListener((wijz, gebied) => { if (gebied === 'local' && wijz[SLEUTEL]) cb(opschonen(wijz[SLEUTEL].newValue)); });
    } catch { /* geen opslag-API */ }
  }

  // ---------------------------------------------------------------- origin-trial-tokens
  function plaatsProefTokens(cfg) {
    if (typeof document === 'undefined' || !document.head) return 0;
    for (const m of document.head.querySelectorAll('meta[data-mr-proef]')) m.remove();
    const regels = String((cfg && cfg.proefTokens) || '').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#') && /^[A-Za-z0-9+/=]{20,}$/.test(x));
    for (const tok of regels.slice(0, 10)) {
      const m = document.createElement('meta');
      m.httpEquiv = 'origin-trial'; m.content = tok; m.setAttribute('data-mr-proef', '1');
      document.head.append(m);
    }
    return regels.length;
  }

  // ---------------------------------------------------------------- beschikbaarheid
  const glob = (id) => (API[id] && typeof globalThis[API[id].glob] === 'function' ? globalThis[API[id].glob] : (API[id] && globalThis[API[id].glob] && typeof globalThis[API[id].glob] === 'object' ? globalThis[API[id].glob] : null));
  function normaal(v) {
    const m = { readily: 'available', 'after-download': 'downloadable', no: 'unavailable' };
    const s = String(v || '');
    return m[s] || (['available', 'downloadable', 'downloading', 'unavailable'].includes(s) ? s : 'unavailable');
  }
  const STAND_TEKST = Object.freeze({
    available: ['готово до роботи', 'klaar voor gebruik'],
    downloadable: ['модель треба завантажити', 'model moet gedownload worden'],
    downloading: ['модель завантажується…', 'model wordt gedownload…'],
    unavailable: ['недоступно на цьому пристрої або з цими налаштуваннями', 'niet beschikbaar op dit apparaat of met deze instellingen'],
    stil: ['Chrome не відповідає (компонент моделі ще не зареєстровано) — перевірте chrome://on-device-internals', 'Chrome antwoordt niet (modelcomponent nog niet geregistreerd) — controleer chrome://on-device-internals'],
    ontbreekt: ['немає в цій версії Chrome (див. прапорці нижче)', 'ontbreekt in deze Chrome-versie (zie de vlaggen hieronder)'],
    uit: ['вимкнено в налаштуваннях', 'uitgeschakeld in de instellingen'],
    fout: ['помилка перевірки', 'fout bij controleren'],
  });
  const standTekst = (s) => (STAND_TEKST[s] ? t(STAND_TEKST[s][0], STAND_TEKST[s][1]) : String(s));

  const BESCHIKBAAR_MS = 15000;
  function binnen(belofte, ms, waarde) {
    let tm;
    return Promise.race([Promise.resolve(belofte), new Promise((r) => { tm = setTimeout(() => r(waarde), ms); })]).finally(() => clearTimeout(tm));
  }
  function afbreekbaar(belofte, signal) {
    if (!signal) return Promise.resolve(belofte);
    if (signal.aborted) return Promise.reject(new DOMException('Afgebroken', 'AbortError'));
    return new Promise((ok, nee) => {
      const stop = () => nee(new DOMException('Afgebroken', 'AbortError'));
      signal.addEventListener('abort', stop, { once: true });
      Promise.resolve(belofte).then((x) => { signal.removeEventListener('abort', stop); ok(x); }, (e) => { signal.removeEventListener('abort', stop); nee(e); });
    });
  }
  function voorBeschikbaarheid(opts) {
    const o = { ...(opts || {}) };
    delete o.monitor; delete o.signal; delete o.initialPrompts; delete o.tools;
    return o;
  }
  async function beschikbaarheid(id, cfg, extra) {
    if (cfg && (!cfg.aan || !cfg.apis[id])) return { stand: 'uit' };
    const G = glob(id);
    if (!G) return { stand: 'ontbreekt' };
    try {
      const opts = voorBeschikbaarheid(optiesVoor(id, cfg || opschonen(null), extra));
      const vraag = typeof G.availability === 'function' ? G.availability(opts) : (typeof G.capabilities === 'function' ? Promise.resolve(G.capabilities()).then((c) => c.available) : 'unavailable');
      const v = await binnen(vraag, BESCHIKBAAR_MS, 'GEEN_ANTWOORD');
      if (v === 'GEEN_ANTWOORD') return { stand: 'stil' };
      return { stand: normaal(v) };
    } catch (e) { return { stand: 'fout', fout: foutTekst(e) }; }
  }
  /** Перевіряє, чи приймає модель мову напряму (актуально для Gemma 4 з uk/nl без посередника Translator). */
  async function isTaalDirectOndersteund(id, cfg, taal) {
    if (!taal || BASIS_MODEL_TALEN.includes(taal)) return true;
    const G = glob(id);
    if (!G || typeof G.availability !== 'function') return false;
    try {
      const probe = id === 'prompt'
        ? { expectedInputs: [{ type: 'text', languages: [taal] }], expectedOutputs: [{ type: 'text', languages: [taal] }] }
        : { expectedInputLanguages: [taal], outputLanguage: taal };
      const v = await binnen(G.availability(probe), 3000, 'unavailable');
      const n = normaal(v);
      return n === 'available' || n === 'downloadable' || n === 'downloading';
    } catch { return false; }
  }

  async function promptParams() {
    const G = glob('prompt');
    if (!G || typeof G.params !== 'function') return null;
    try { const p = await G.params(); return p && typeof p === 'object' ? { defaultTopK: p.defaultTopK, maxTopK: p.maxTopK, defaultTemperature: p.defaultTemperature, maxTemperature: p.maxTemperature } : null; } catch { return null; }
  }

  // ---------------------------------------------------------------- opties per API
  function optiesVoor(id, cfg, extra = {}) {
    const ctx = (s) => (s ? { sharedContext: s } : {});
    switch (id) {
      case 'prompt': {
        const p = cfg.prompt;
        const modelTaal = extra.directTaal || p.taal;
        const invoer = [{ type: 'text', languages: [modelTaal] }];
        if (cfg.multimodaal && extra.afbeelding) invoer.push({ type: 'image' });
        if (cfg.multimodaal && extra.audio) invoer.push({ type: 'audio' });
        const o = { expectedInputs: invoer, expectedOutputs: [{ type: 'text', languages: [modelTaal] }] };
        if (p.systeem) o.initialPrompts = [{ role: 'system', content: p.systeem }];
        if (p.temperatuur !== '' && p.topK !== '') { o.temperature = Number(p.temperatuur); o.topK = Math.max(1, Math.round(Number(p.topK))); }
        if (p.samplingMode && p.samplingMode !== 'default') o.samplingMode = p.samplingMode;
        if (p.toolUse && Array.isArray(extra.tools) && extra.tools.length) o.tools = extra.tools;
        return o;
      }
      case 'summarizer': {
        const s = cfg.summarizer;
        const modelTaal = extra.directTaal || s.taal;
        const o = { type: s.type, format: s.format, length: s.length, expectedInputLanguages: [extra.invoerTaal || modelTaal], outputLanguage: modelTaal, ...ctx(s.context) };
        if (s.preference && s.preference !== 'auto') o.preference = s.preference;
        return o;
      }
      case 'writer': { const w = cfg.writer; const m = extra.directTaal || w.taal; return { tone: w.tone, format: w.format, length: w.length, expectedInputLanguages: [extra.invoerTaal || m], outputLanguage: m, ...ctx(w.context) }; }
      case 'rewriter': { const w = cfg.rewriter; const m = extra.directTaal || w.taal; return { tone: w.tone, format: w.format, length: w.length, expectedInputLanguages: [extra.invoerTaal || m], outputLanguage: m, ...ctx(w.context) }; }
      case 'translator': return { sourceLanguage: extra.bron || 'en', targetLanguage: extra.doel || doelTaalVan(cfg) };
      case 'detector': return {};
      case 'proofreader': return { expectedInputLanguages: [extra.directTaal || cfg.proofreader.taal] };
      case 'embedder': return {};
      case 'decisions': {
        const schema = extra.schema || (cfg.decisions && cfg.decisions.schema);
        if (schema && typeof schema === 'string') {
          try { return { schema: JSON.parse(schema) }; } catch { return {}; }
        }
        return {};
      }
      default: return {};
    }
  }
  const doelTaalVan = (cfg) => (cfg.doelTaal && cfg.doelTaal !== 'auto' ? cfg.doelTaal : uiTaal());

  // ---------------------------------------------------------------- instanties
  const cache = new Map();
  function sleutelVan(id, opts) { return `${id}:${JSON.stringify(opts)}`; }
  function vergeetAlles() {
    for (const p of cache.values()) Promise.resolve(p).then((x) => { try { x && typeof x.destroy === 'function' && x.destroy(); } catch { /* al weg */ } }, () => undefined);
    cache.clear();
  }
  class LokaleFout extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail || ''; } }

  async function instantie(id, cfg, { extra, magDownloaden = false, opVoortgang, signal, nieuw = false } = {}) {
    if (!cfg.aan) throw new LokaleFout('UIT');
    if (!cfg.apis[id]) throw new LokaleFout('API_UIT', id);
    const G = glob(id);
    if (!G) throw new LokaleFout('ONTBREEKT', id);
    const opts = optiesVoor(id, cfg, extra);
    const k = sleutelVan(id, opts);
    if (!nieuw && cache.has(k)) return afbreekbaar(cache.get(k), signal);
    const stand = (await beschikbaarheid(id, cfg, extra)).stand;
    if (stand === 'unavailable' || stand === 'fout' || stand === 'ontbreekt') throw new LokaleFout('NIET_BESCHIKBAAR', `${id}: ${standTekst(stand)}`);
    const groot = id !== 'translator' && id !== 'detector';
    if (groot && (stand === 'downloadable' || stand === 'downloading' || stand === 'stil') && !magDownloaden && !cfg.autoDownload) throw new LokaleFout('MODEL_NIET_GELADEN', id);
    const p = Promise.resolve(G.create({
      ...opts,
      ...(signal ? { signal } : {}),
      monitor(m) {
        try { m.addEventListener('downloadprogress', (e) => { if (typeof opVoortgang === 'function') opVoortgang(voortgang(e)); }); } catch { /* geen monitor */ }
      },
    }));
    if (!nieuw) cache.set(k, p);
    p.catch(() => cache.delete(k));
    return afbreekbaar(p, signal);
  }
  function voortgang(e) {
    const l = Number(e && e.loaded), tot = Number(e && e.total);
    if (Number.isFinite(l) && Number.isFinite(tot) && tot > 1) return Math.max(0, Math.min(1, l / tot));
    return Number.isFinite(l) ? Math.max(0, Math.min(1, l)) : 0;
  }

  // ---------------------------------------------------------------- streams
  async function leesStroom(stroom, opStuk) {
    let tekst = '';
    const verwerk = (stuk) => {
      const s = String(stuk == null ? '' : stuk);
      tekst = tekst && s.startsWith(tekst) && s.length > tekst.length ? s : tekst + s;
      if (typeof opStuk === 'function') opStuk(tekst);
    };
    if (stroom && typeof stroom[Symbol.asyncIterator] === 'function') { for await (const stuk of stroom) verwerk(stuk); return tekst; }
    const lezer = stroom.getReader();
    try { for (;;) { const { done, value } = await lezer.read(); if (done) break; verwerk(value); } } finally { try { lezer.releaseLock(); } catch { /* klaar */ } }
    return tekst;
  }

  async function pasIn(inst, tekst) {
    try {
      if (!inst || typeof inst.measureInputUsage !== 'function' || !Number.isFinite(inst.inputQuota)) return { tekst, ingekort: false };
      let s = tekst;
      for (let i = 0; i < 6; i++) {
        const gebruik = await inst.measureInputUsage(s);
        if (gebruik <= inst.inputQuota) return { tekst: s, ingekort: s.length < tekst.length };
        s = s.slice(0, Math.floor(s.length * (inst.inputQuota / gebruik) * 0.9));
      }
      return { tekst: s, ingekort: true };
    } catch { return { tekst, ingekort: false }; }
  }

  // ---------------------------------------------------------------- taal: herkennen en vertalen
  async function herken(cfg, tekst, o = {}) {
    const inst = await instantie('detector', cfg, o);
    const r = await inst.detect(String(tekst));
    return (Array.isArray(r) ? r : []).filter((x) => x && x.detectedLanguage && x.detectedLanguage !== 'und').slice(0, 5)
      .map((x) => ({ taal: String(x.detectedLanguage), zeker: Number(x.confidence) || 0 }));
  }
  async function vertaal(cfg, tekst, bron, doel, o = {}) {
    if (!tekst || bron === doel) return tekst;
    const inst = await instantie('translator', cfg, { ...o, extra: { bron, doel } });
    if (typeof inst.translateStreaming === 'function' && typeof o.opStuk === 'function') return leesStroom(inst.translateStreaming(String(tekst), o.signal ? { signal: o.signal } : undefined), o.opStuk);
    return inst.translate(String(tekst), o.signal ? { signal: o.signal } : undefined);
  }
  async function bronTaal(cfg, tekst, gekozen, o) {
    if (gekozen && gekozen !== 'auto') return gekozen;
    if (!cfg.apis.detector || !glob('detector')) return 'en';
    try { const r = await herken(cfg, tekst, o); return r.length && r[0].zeker >= 0.5 ? r[0].taal.split('-')[0] : 'en'; } catch { return 'en'; }
  }

  /** Підготовка входу: якщо Gemma 4 підтримує мову напряму (availability() підтверджено) — переклад не потрібен. */
  async function voorbereidInvoer(id, cfg, tekst, modelTaal, o, notities) {
    const bron = await bronTaal(cfg, tekst, 'auto', o);
    if (BASIS_MODEL_TALEN.includes(bron)) return { tekst, taal: bron };
    if (await isTaalDirectOndersteund(id, cfg, bron)) {
      notities.push(t(`пряма мова моделі: ${bron} (без перекладу)`, `directe modeltaal: ${bron} (zonder vertaling)`));
      return { tekst, taal: bron };
    }
    if (!cfg.vertaalInvoer || !cfg.apis.translator) return { tekst, taal: modelTaal };
    try {
      const v = await vertaal(cfg, tekst, bron, modelTaal, o);
      notities.push(t(`вхід перекладено ${bron}→${modelTaal}`, `invoer vertaald ${bron}→${modelTaal}`));
      return { tekst: v, taal: modelTaal };
    } catch (e) {
      notities.push(t(`вхід не перекладено (${foutTekst(e)})`, `invoer niet vertaald (${foutTekst(e)})`));
      return { tekst, taal: modelTaal };
    }
  }
  async function naarUiTaal(cfg, tekst, vanTaal, o, notities) {
    const doel = doelTaalVan(cfg);
    if (!cfg.vertaalUitvoer || !cfg.apis.translator || !tekst || vanTaal === doel) return tekst;
    try { const v = await vertaal(cfg, tekst, vanTaal, doel, { ...o, opStuk: o.opStuk }); notities.push(t(`відповідь перекладено ${vanTaal}→${doel}`, `antwoord vertaald ${vanTaal}→${doel}`)); return v; }
    catch (e) { notities.push(t(`переклад відповіді не вдався (${foutTekst(e)})`, `vertalen van het antwoord mislukt (${foutTekst(e)})`)); return tekst; }
  }

  // ---------------------------------------------------------------- vectoren en beslissingen
  function cosinus(a, b) {
    let dot = 0, na = 0, nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  }
  function pakVector(res) {
    if (!res) return [];
    if (ArrayBuffer.isView(res)) return Array.from(res);
    if (Array.isArray(res)) return Array.isArray(res[0]) || ArrayBuffer.isView(res[0]) ? Array.from(res[0]) : res;
    if (Array.isArray(res.embedding) || ArrayBuffer.isView(res.embedding)) return Array.from(res.embedding);
    if (Array.isArray(res.embeddings) && res.embeddings[0]) return Array.from(res.embeddings[0]);
    return [];
  }

  // ---------------------------------------------------------------- bewerkingen (één ingang voor de UI)
  async function voer(modus, invoer, cfg, o = {}) {
    const tekst = String(invoer || '').trim();
    if (!tekst && modus !== 'prompt') throw new LokaleFout('LEEG');
    if (modus === 'prompt' && !tekst && !o.afbeelding && !o.audio) throw new LokaleFout('LEEG');
    const notities = [];
    const io = { signal: o.signal, opVoortgang: o.opVoortgang, magDownloaden: o.magDownloaden };
    const sig = o.signal ? { signal: o.signal } : {};
    switch (modus) {
      case 'summarizer': case 'writer': case 'rewriter': {
        const c = cfg[modus];
        const prep = await voorbereidInvoer(modus, cfg, tekst, c.taal, io, notities);
        const inst = await instantie(modus, cfg, { ...io, extra: { directTaal: prep.taal } });
        const pas = await pasIn(inst, prep.tekst);
        if (pas.ingekort) notities.push(t('текст скорочено до ліміту моделі', 'tekst ingekort tot de limiet van het model'));
        const methode = { summarizer: 'summarize', writer: 'write', rewriter: 'rewrite' }[modus];
        let uit;
        if (typeof inst[`${methode}Streaming`] === 'function' && typeof o.opStuk === 'function') uit = await leesStroom(inst[`${methode}Streaming`](pas.tekst, sig), o.opStuk);
        else uit = await inst[methode](pas.tekst, sig);
        uit = await naarUiTaal(cfg, uit, prep.taal, { ...io, opStuk: o.opStuk }, notities);
        return { tekst: uit, notities };
      }
      case 'translator': {
        const bron = await bronTaal(cfg, tekst, cfg.translator.bron, io);
        const doel = cfg.translator.doel === 'auto' ? doelTaalVan(cfg) : cfg.translator.doel;
        if (bron === doel) { notities.push(t(`текст уже мовою ${doel}`, `tekst is al in ${doel}`)); return { tekst, notities }; }
        notities.push(`${bron} → ${doel}`);
        return { tekst: await vertaal(cfg, tekst, bron, doel, { ...io, opStuk: o.opStuk }), notities };
      }
      case 'detector': {
        const r = await herken(cfg, tekst, io);
        if (tekst.length < 20) notities.push(t('дуже короткий текст — результат неточний', 'erg korte tekst — uitkomst onnauwkeurig'));
        return { tekst: r.map((x) => `${taalNaam(x.taal)} (${x.taal}) — ${Math.round(x.zeker * 100)}%`).join('\n') || t('мову не визначено', 'geen taal herkend'), notities, extra: { talen: r } };
      }
      case 'proofreader': {
        const inst = await instantie('proofreader', cfg, io);
        const r = await inst.proofread(tekst, sig);
        const corr = Array.isArray(r && r.corrections) ? r.corrections : [];
        notities.push(t(`виправлень: ${corr.length}`, `correcties: ${corr.length}`));
        const lijst = corr.slice(0, 50).map((c) => {
          const van = tekst.slice(Number(c.startIndex) || 0, Number(c.endIndex) || 0);
          return `• «${van}» → «${String(c.correction != null ? c.correction : '')}»`;
        });
        return { tekst: String((r && r.correctedInput) || tekst), notities, extra: { correcties: lijst } };
      }
      case 'embedder': {
        const inst = await instantie('embedder', cfg, io);
        const embedFn = typeof inst.embed === 'function' ? (s) => inst.embed(s, sig)
          : (typeof inst.getEmbeddings === 'function' ? (s) => inst.getEmbeddings(s, sig) : null);
        if (!embedFn) throw new LokaleFout('NIET_BESCHIKBAAR', 'SemanticEmbedder');
        const delen = tekst.split(/\n---\n/).map((x) => x.trim()).filter(Boolean);
        if (delen.length >= 2) {
          const v1 = pakVector(await embedFn(delen[0]));
          const v2 = pakVector(await embedFn(delen[1]));
          const sim = cosinus(v1, v2);
          notities.push(t(`вимірів: ${v1.length}`, `dimensies: ${v1.length}`));
          return { tekst: t(`Схожість за змістом: ${(sim * 100).toFixed(1)}% (cos = ${sim.toFixed(4)}, вимірність ${v1.length})`, `Betekenisovereenkomst: ${(sim * 100).toFixed(1)}% (cos = ${sim.toFixed(4)}, dimensie ${v1.length})`), notities };
        }
        const vec = pakVector(await embedFn(tekst));
        const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0));
        const preview = vec.slice(0, 6).map((x) => Number(x).toFixed(4)).join(', ');
        notities.push(t(`вимірів: ${vec.length}`, `dimensies: ${vec.length}`));
        return { tekst: t(`Отримано значеннєвий вектор: ${vec.length} вимірів (норма ${norm.toFixed(4)}).\nПочаток: [${preview}${vec.length > 6 ? ', …' : ''}]`, `Betekenisvector berekend: ${vec.length} dimensies (norm ${norm.toFixed(4)}).\nBegin: [${preview}${vec.length > 6 ? ', …' : ''}]`), notities };
      }
      case 'decisions': {
        const inst = await instantie('decisions', cfg, { ...io, extra: { schema: o.schema } });
        notities.push(t('Decisions API у Chrome 157 працює на CPU', 'Decisions API draait in Chrome 157 op de CPU'));
        const fn = typeof inst.decide === 'function' ? 'decide' : typeof inst.classify === 'function' ? 'classify' : typeof inst.evaluate === 'function' ? 'evaluate' : null;
        if (!fn) throw new LokaleFout('NIET_BESCHIKBAAR', 'DecisionModel');
        const r = await inst[fn](tekst, sig);
        return { tekst: typeof r === 'string' ? r : JSON.stringify(r, null, 2), notities };
      }
      case 'prompt': {
        const c = cfg.prompt;
        const prep = tekst ? await voorbereidInvoer('prompt', cfg, tekst, c.taal, io, notities) : { tekst: '', taal: c.taal };
        const sessie = o.sessie || await instantie('prompt', cfg, { ...io, extra: { afbeelding: !!o.afbeelding, audio: !!o.audio, directTaal: prep.taal, tools: o.tools }, nieuw: true });
        let bericht = prep.tekst;
        if ((o.afbeelding || o.audio) && cfg.multimodaal) {
          const inhoud = [];
          if (prep.tekst) inhoud.push({ type: 'text', value: prep.tekst });
          if (o.afbeelding) inhoud.push({ type: 'image', value: o.afbeelding });
          if (o.audio) inhoud.push({ type: 'audio', value: o.audio });
          bericht = [{ role: 'user', content: inhoud }];
        }
        const opties = { ...sig };
        if (c.schema) {
          try { opties.responseConstraint = JSON.parse(c.schema); notities.push(t('відповідь за JSON-схемою', 'antwoord volgens JSON-schema')); }
          catch { notities.push(t('JSON-схема недійсна — проігноровано', 'JSON-schema ongeldig — genegeerd')); }
        }
        let uit;
        if (typeof sessie.promptStreaming === 'function' && typeof o.opStuk === 'function') uit = await leesStroom(sessie.promptStreaming(bericht, opties), o.opStuk);
        else uit = await sessie.prompt(bericht, opties);
        if (!opties.responseConstraint) uit = await naarUiTaal(cfg, uit, prep.taal, { ...io, opStuk: o.opStuk }, notities);
        return { tekst: uit, notities, extra: { sessie, gebruik: gebruikVan(sessie) } };
      }
      default: throw new LokaleFout('ONBEKEND', modus);
    }
  }

  function gebruikVan(s) {
    if (!s) return null;
    const g = Number.isFinite(s.contextUsage) ? s.contextUsage : Number.isFinite(s.inputUsage) ? s.inputUsage : null;
    const m = Number.isFinite(s.contextWindow) ? s.contextWindow : Number.isFinite(s.inputQuota) ? s.inputQuota : null;
    return g != null && m ? { gebruikt: g, max: m } : null;
  }

  // ---------------------------------------------------------------- tabbladtekst
  const SITE_RE = /^https:\/\/([a-z0-9-]+\.)*tarasevych\.com\//i;
  async function tabbladTekst(cfg, { selectie = false } = {}) {
    if (!cfg.tabTekst) throw new LokaleFout('TAB_UIT');
    let tab = null;
    try { [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); } catch { tab = null; }
    if (!tab || !SITE_RE.test(String(tab.url || ''))) throw new LokaleFout('TAB_NIET_SITE');
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (alleenSelectie) => {
        const sel = String((window.getSelection && window.getSelection()) || '').trim();
        if (alleenSelectie || sel) return { tekst: sel, selectie: !!sel };
        const hoofd = document.querySelector('main, article, [role="main"]') || document.body;
        return { tekst: String((hoofd && hoofd.innerText) || '').trim(), selectie: false };
      },
      args: [selectie],
    });
    const v = r && r.result ? r.result : { tekst: '' };
    return { tekst: String(v.tekst || '').slice(0, 100000), selectie: !!v.selectie, titel: String(tab.title || '').slice(0, 200) };
  }

  // ---------------------------------------------------------------- foutteksten
  const FOUT = Object.freeze({
    UIT: ['Вбудований ШІ вимкнено в налаштуваннях розширення.', 'De ingebouwde AI staat uit in de instellingen van de extensie.'],
    API_UIT: ['Цю функцію вимкнено в налаштуваннях.', 'Deze functie staat uit in de instellingen.'],
    ONTBREEKT: ['Цього API немає у вашій версії Chrome. Оновіть Chrome або ввімкніть прапорець (налаштування → «Вбудований ШІ»).', 'Deze API ontbreekt in uw Chrome-versie. Werk Chrome bij of zet de vlag aan (instellingen → «Ingebouwde AI»).'],
    NIET_BESCHIKBAAR: ['Недоступно на цьому пристрої (потрібно ≥22 ГБ вільного місця, GPU >4 ГБ або 16 ГБ RAM) або з обраною мовою.', 'Niet beschikbaar op dit apparaat (≥22 GB vrij, GPU >4 GB of 16 GB RAM nodig) of met de gekozen taal.'],
    MODEL_NIET_GELADEN: ['Модель ще не завантажена. Натисніть «Завантажити модель» у налаштуваннях (кілька ГБ).', 'Het model is nog niet gedownload. Klik «Model downloaden» in de instellingen (enkele GB).'],
    LEEG: ['Введіть текст.', 'Voer tekst in.'],
    TAB_UIT: ['Читання вкладки вимкнено (налаштування → «Вбудований ШІ», позначка «!»).', 'Tabblad lezen staat uit (instellingen → «Ingebouwde AI», markering «!»).'],
    TAB_NIET_SITE: ['Активна вкладка не на tarasevych.com — розширення її не читає.', 'Het actieve tabblad is niet op tarasevych.com — de extensie leest het niet.'],
    AbortError: ['Зупинено.', 'Gestopt.'],
    NotSupportedError: ['Ця мова або комбінація налаштувань не підтримується моделлю.', 'Deze taal of combinatie van instellingen wordt door het model niet ondersteund.'],
    QuotaExceededError: ['Текст задовгий для моделі. Скоротіть його.', 'De tekst is te lang voor het model. Maak hem korter.'],
    NotAllowedError: ['Chrome не дозволив: потрібне натискання кнопки (для завантаження моделі) або політика блокує вбудований ШІ.', 'Chrome stond het niet toe: een klik is nodig (voor het downloaden) of een beleid blokkeert de ingebouwde AI.'],
    InvalidStateError: ['Сесію закрито — почніть нову.', 'De sessie is gesloten — begin een nieuwe.'],
    OperationError: ['Модель не змогла виконати запит. Спробуйте ще раз.', 'Het model kon het verzoek niet uitvoeren. Probeer het opnieuw.'],
    UnknownError: ['Невідома помилка моделі.', 'Onbekende fout van het model.'],
  });
  function foutTekst(e) {
    const code = (e && (e.code && typeof e.code === 'string' ? e.code : e.name)) || '';
    if (FOUT[code]) return t(FOUT[code][0], FOUT[code][1]) + (e && e.detail ? ` (${e.detail})` : '');
    return String((e && e.message) || e || '?').slice(0, 300);
  }

  function taalNaam(code) {
    try { return new Intl.DisplayNames([NL ? 'nl' : 'uk'], { type: 'language' }).of(code) || code; } catch { return code; }
  }

  globalThis.MR_LOKALE_AI = Object.freeze({
    SLEUTEL, API, API_IDS, MODEL_TALEN, VERTAAL_TALEN, GEVAAR_VELDEN, STANDAARD, KEUZES,
    laad, bewaar, opschonen, pasPatchToe, bijWijziging, plaatsProefTokens,
    beschikbaarheid, isTaalDirectOndersteund, promptParams, standTekst, instantie, vergeetAlles, voer, vertaal, herken, tabbladTekst,
    leesStroom, voortgang, normaal, gebruikVan, foutTekst, taalNaam, doelTaalVan, optiesVoor, LokaleFout,
  });
})();
