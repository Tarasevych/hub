// 0.9.0: ingebouwde AI van Chrome (Gemini Nano op DIT apparaat) — Prompt, Summarizer, Writer, Rewriter, Translator, LanguageDetector,
// Proofreader. Klassiek script (CSP script-src 'self'), gedeeld door opties en zijpaneel: globalThis.MR_LOKALE_AI.
// Regels:
//  - Alles draait lokaal: er gaat GEEN tekst naar een server (ook niet naar mcp.tarasevych.com). Past bij BYOS.
//  - Niets wordt hard geblokkeerd. Riskante functies (groot model downloaden zonder klik, tabbladtekst lezen, afbeeldingen) staan
//    standaard UIT en worden in de UI met «!» gemarkeerd.
//  - De API's bestaan alleen in vensters (extensiepagina's), niet in de service worker: daarom draait dit in opties/zijpaneel.
//  - Tabbladtekst alleen van https://*.tarasevych.com (zelfde grens als de rest van de extensie) en alleen als de gebruiker het aanzette.
(() => {
  'use strict';
  const SLEUTEL = 'lokaleAi';

  // Officiële namen van de globale API's + vlag in chrome://flags (alleen nodig als de API in deze Chrome-versie nog niet standaard aan is).
  const API = Object.freeze({
    prompt: { glob: 'LanguageModel', naam: ['Діалог (Prompt API)', 'Gesprek (Prompt API)'], vlag: 'prompt-api-for-gemini-nano', proef: false },
    summarizer: { glob: 'Summarizer', naam: ['Стислий виклад (Summarizer)', 'Samenvatten (Summarizer)'], vlag: 'summarization-api-for-gemini-nano', proef: false },
    writer: { glob: 'Writer', naam: ['Написання тексту (Writer)', 'Tekst schrijven (Writer)'], vlag: 'writer-api-for-gemini-nano', proef: true },
    rewriter: { glob: 'Rewriter', naam: ['Переписування (Rewriter)', 'Herschrijven (Rewriter)'], vlag: 'rewriter-api-for-gemini-nano', proef: true },
    translator: { glob: 'Translator', naam: ['Переклад (Translator)', 'Vertalen (Translator)'], vlag: 'translation-api', proef: false },
    detector: { glob: 'LanguageDetector', naam: ['Визначення мови (Language Detector)', 'Taal herkennen (Language Detector)'], vlag: 'language-detection-api', proef: false },
    proofreader: { glob: 'Proofreader', naam: ['Коректура (Proofreader)', 'Proeflezen (Proofreader)'], vlag: 'proofreader-api-for-gemini-nano', proef: true },
  });
  const API_IDS = Object.freeze(Object.keys(API));

  // Talen die Gemini Nano volgens de documentatie als in-/uitvoer aanvaardt (Oekraïens en Nederlands NIET → via Translator).
  const MODEL_TALEN = Object.freeze(['en', 'es', 'ja', 'de', 'fr']);
  // Translator kan wel uk/nl; dit is de lijst die de UI aanbiedt (de echte beschikbaarheid zegt Translator.availability()).
  const VERTAAL_TALEN = Object.freeze(['uk', 'nl', 'en', 'de', 'fr', 'es', 'it', 'pl', 'pt', 'ja', 'zh', 'ko', 'ru', 'tr', 'ar', 'hi']);

  const STANDAARD = Object.freeze({
    aan: true,                       // hoofdschakelaar: alleen op klik wordt iets uitgevoerd
    apis: Object.freeze({ prompt: true, summarizer: true, writer: true, rewriter: true, translator: true, detector: true, proofreader: true }),
    autoDownload: false,             // «!» model (≈ GB's) automatisch downloaden zonder aparte klik
    tabTekst: false,                 // «!» tekst van het actieve tarasevych.com-tabblad aan de lokale AI geven
    multimodaal: false,              // «!» afbeeldingen als invoer voor de Prompt API (experimenteel)
    chatHulp: true,                  // knoppen in de zijpaneelchat (proeflezen/herschrijven invoer, antwoord vertalen)
    vertaalInvoer: true,             // invoer in een taal die het model niet kent eerst naar het Engels vertalen
    vertaalUitvoer: true,            // uitvoer terugvertalen naar de taal van de interface (uk/nl)
    doelTaal: 'auto',                // 'auto' = taal van de interface
    prompt: Object.freeze({ systeem: '', temperatuur: '', topK: '', taal: 'en', schema: '' }),
    summarizer: Object.freeze({ type: 'key-points', format: 'plain-text', length: 'medium', context: '', taal: 'en' }),
    writer: Object.freeze({ tone: 'neutral', format: 'plain-text', length: 'medium', context: '', taal: 'en' }),
    rewriter: Object.freeze({ tone: 'as-is', format: 'as-is', length: 'as-is', context: '', taal: 'en' }),
    translator: Object.freeze({ bron: 'auto', doel: 'auto' }),
    proofreader: Object.freeze({ taal: 'en' }),
    proefTokens: '',                 // origin-trial-tokens (één per regel) voor Writer/Rewriter/Proofreader
  });

  // Toegestane waarden (alles wat uit de opslag komt wordt hiertegen gecontroleerd — niets blind overnemen).
  const KEUZES = Object.freeze({
    'summarizer.type': ['key-points', 'tldr', 'teaser', 'headline'],
    'summarizer.format': ['plain-text', 'markdown'],
    'summarizer.length': ['short', 'medium', 'long'],
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
    const p = sub('prompt'), s = sub('summarizer'), w = sub('writer'), rw = sub('rewriter'), tr = sub('translator'), pr = sub('proofreader');
    return {
      aan: bool(r.aan, STANDAARD.aan), apis,
      autoDownload: bool(r.autoDownload, false), tabTekst: bool(r.tabTekst, false), multimodaal: bool(r.multimodaal, false),
      chatHulp: bool(r.chatHulp, true), vertaalInvoer: bool(r.vertaalInvoer, true), vertaalUitvoer: bool(r.vertaalUitvoer, true),
      doelTaal: r.doelTaal === 'auto' ? 'auto' : taal(r.doelTaal, 'auto', VERTAAL_TALEN),
      prompt: { systeem: str(p.systeem, ''), temperatuur: getalTekst(p.temperatuur), topK: getalTekst(p.topK), taal: taal(p.taal, 'en', MODEL_TALEN), schema: str(p.schema, '', 8000) },
      summarizer: { type: keuze('summarizer.type', s.type), format: keuze('summarizer.format', s.format), length: keuze('summarizer.length', s.length), context: str(s.context, '', 1000), taal: taal(s.taal, 'en', MODEL_TALEN) },
      writer: { tone: keuze('writer.tone', w.tone), format: keuze('writer.format', w.format), length: keuze('writer.length', w.length), context: str(w.context, '', 1000), taal: taal(w.taal, 'en', MODEL_TALEN) },
      rewriter: { tone: keuze('rewriter.tone', rw.tone), format: keuze('rewriter.format', rw.format), length: keuze('rewriter.length', rw.length), context: str(rw.context, '', 1000), taal: taal(rw.taal, 'en', MODEL_TALEN) },
      translator: { bron: tr.bron === 'auto' ? 'auto' : taal(tr.bron, 'auto', VERTAAL_TALEN), doel: tr.doel === 'auto' ? 'auto' : taal(tr.doel, 'auto', VERTAAL_TALEN) },
      proofreader: { taal: taal(pr.taal, 'en', MODEL_TALEN) },
      proefTokens: str(r.proefTokens, '', 20000),
    };
  }
  /** '' of een eindig getal als tekst (lege velden = standaard van het model). */
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
  /** Luister naar wijzigingen (andere pagina zette iets om) → callback met de schone instellingen. */
  function bijWijziging(cb) {
    try {
      chrome.storage.onChanged.addListener((wijz, gebied) => { if (gebied === 'local' && wijz[SLEUTEL]) cb(opschonen(wijz[SLEUTEL].newValue)); });
    } catch { /* geen opslag-API */ }
  }

  // ---------------------------------------------------------------- origin-trial-tokens (Writer/Rewriter/Proofreader)
  // Een <meta http-equiv="origin-trial"> die via script wordt toegevoegd, telt voor de pagina zelf. Ook mogelijk: tokens in het
  // manifest onder "trial_tokens". Lege regels en commentaar (#) worden genegeerd. Tokens zijn geen geheimen (ze staan in elke pagina).
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
  /** Oude Chrome-waarden ('readily', 'after-download', 'no') naar de huidige. */
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
  /** Belofte met tijdslimiet: na `ms` komt `waarde` terug (de oorspronkelijke belofte loopt gewoon door). */
  function binnen(belofte, ms, waarde) {
    let tm;
    return Promise.race([Promise.resolve(belofte), new Promise((r) => { tm = setTimeout(() => r(waarde), ms); })]).finally(() => clearTimeout(tm));
  }
  /**
   * Afbreekbaar wachten: sommige Chrome-versies negeren `signal` in create() (getest: Translator.create bleef hangen zonder
   * voortgang). «Стоп» moet dan toch meteen werken — de UI wacht niet langer, ook al loopt de download in Chrome door.
   */
  function afbreekbaar(belofte, signal) {
    if (!signal) return Promise.resolve(belofte);
    if (signal.aborted) return Promise.reject(new DOMException('Afgebroken', 'AbortError'));
    return new Promise((ok, nee) => {
      const stop = () => nee(new DOMException('Afgebroken', 'AbortError'));
      signal.addEventListener('abort', stop, { once: true });
      Promise.resolve(belofte).then((x) => { signal.removeEventListener('abort', stop); ok(x); }, (e) => { signal.removeEventListener('abort', stop); nee(e); });
    });
  }
  /** Opties zonder monitor/signal/initialPrompts (availability() wil dezelfde opties als create(), maar niet die drie). */
  function voorBeschikbaarheid(opts) {
    const o = { ...(opts || {}) };
    delete o.monitor; delete o.signal; delete o.initialPrompts;
    return o;
  }
  async function beschikbaarheid(id, cfg, extra) {
    if (cfg && (!cfg.aan || !cfg.apis[id])) return { stand: 'uit' };
    const G = glob(id);
    if (!G) return { stand: 'ontbreekt' };
    try {
      const opts = voorBeschikbaarheid(optiesVoor(id, cfg || opschonen(null), extra));
      const vraag = typeof G.availability === 'function' ? G.availability(opts) : (typeof G.capabilities === 'function' ? Promise.resolve(G.capabilities()).then((c) => c.available) : 'unavailable');
      // Getest in echte Chrome 157: zonder geregistreerde modelcomponent (nieuw profiel, componentupdates uit) blijft availability()
      // eeuwig hangen. Dan niet eindeloos «…» tonen maar «geen antwoord» met een verwijzing naar chrome://on-device-internals.
      const v = await binnen(vraag, BESCHIKBAAR_MS, 'GEEN_ANTWOORD');
      if (v === 'GEEN_ANTWOORD') return { stand: 'stil' };
      return { stand: normaal(v) };
    } catch (e) { return { stand: 'fout', fout: foutTekst(e) }; }
  }
  /** Prompt API: grenzen van temperatuur/topK (alleen voor extensies). */
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
        const invoer = [{ type: 'text', languages: [p.taal] }];
        if (cfg.multimodaal && extra.afbeelding) invoer.push({ type: 'image' });
        const o = { expectedInputs: invoer, expectedOutputs: [{ type: 'text', languages: [p.taal] }] };
        if (p.systeem) o.initialPrompts = [{ role: 'system', content: p.systeem }];
        // Extensies: temperatuur en topK samen of geen van beide (anders gooit create() een fout).
        if (p.temperatuur !== '' && p.topK !== '') { o.temperature = Number(p.temperatuur); o.topK = Math.max(1, Math.round(Number(p.topK))); }
        return o;
      }
      case 'summarizer': { const s = cfg.summarizer; return { type: s.type, format: s.format, length: s.length, expectedInputLanguages: [extra.invoerTaal || s.taal], outputLanguage: s.taal, ...ctx(s.context) }; }
      case 'writer': { const w = cfg.writer; return { tone: w.tone, format: w.format, length: w.length, expectedInputLanguages: [extra.invoerTaal || w.taal], outputLanguage: w.taal, ...ctx(w.context) }; }
      case 'rewriter': { const w = cfg.rewriter; return { tone: w.tone, format: w.format, length: w.length, expectedInputLanguages: [extra.invoerTaal || w.taal], outputLanguage: w.taal, ...ctx(w.context) }; }
      case 'translator': return { sourceLanguage: extra.bron || 'en', targetLanguage: extra.doel || doelTaalVan(cfg) };
      case 'detector': return {};
      case 'proofreader': return { expectedInputLanguages: [cfg.proofreader.taal] };
      default: return {};
    }
  }
  const doelTaalVan = (cfg) => (cfg.doelTaal && cfg.doelTaal !== 'auto' ? cfg.doelTaal : uiTaal());

  // ---------------------------------------------------------------- instanties (hergebruik zolang de opties gelijk zijn)
  const cache = new Map(); // sleutel → Promise<instantie>
  function sleutelVan(id, opts) { return `${id}:${JSON.stringify(opts)}`; }
  function vergeetAlles() {
    for (const p of cache.values()) Promise.resolve(p).then((x) => { try { x && typeof x.destroy === 'function' && x.destroy(); } catch { /* al weg */ } }, () => undefined);
    cache.clear();
  }
  class LokaleFout extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail || ''; } }

  /**
   * Maak (of hergebruik) een instantie. Downloaden van het model gebeurt alleen als `magDownloaden` (expliciete klik) of
   * cfg.autoDownload («!»). create() vraagt voor een download een gebruikersgebaar: roep dit dus direct vanuit een klik aan.
   */
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
    // Alleen het grote taalmodel (Gemini Nano, enkele GB) wacht op een aparte klik; taalpakketten voor vertalen/herkennen zijn klein.
    // 'stil' (Chrome antwoordt niet) behandelen we als «misschien te downloaden»: proberen mag, met «Стоп» als uitweg.
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
  /** downloadprogress: e.loaded is in huidige Chrome een fractie 0..1; oudere versies gaven bytes + total. */
  function voortgang(e) {
    const l = Number(e && e.loaded), tot = Number(e && e.total);
    if (Number.isFinite(l) && Number.isFinite(tot) && tot > 1) return Math.max(0, Math.min(1, l / tot));
    return Number.isFinite(l) ? Math.max(0, Math.min(1, l)) : 0;
  }

  // ---------------------------------------------------------------- streams
  /**
   * Lees een ReadableStream van tekst. Chrome gaf vroeger cumulatieve stukken (elk stuk = alles tot nu), nu losse stukken:
   * we herkennen beide, zodat de tekst nooit dubbel verschijnt.
   */
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

  /** Past de invoer in het quotum van de instantie (inputQuota/measureInputUsage), anders inkorten met melding. */
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
  /** Bepaal de brontaal: gekozen, of herkend (alleen als detector aan staat), anders 'en'. */
  async function bronTaal(cfg, tekst, gekozen, o) {
    if (gekozen && gekozen !== 'auto') return gekozen;
    if (!cfg.apis.detector || !glob('detector')) return 'en';
    try { const r = await herken(cfg, tekst, o); return r.length && r[0].zeker >= 0.5 ? r[0].taal.split('-')[0] : 'en'; } catch { return 'en'; }
  }
  /**
   * Invoer voorbereiden voor een model dat geen uk/nl kent: herkennen → (optioneel) naar de modeltaal vertalen.
   * Lukt vertalen niet, dan gaat de originele tekst door (niet blokkeren) met een notitie.
   */
  async function voorbereidInvoer(cfg, tekst, modelTaal, o, notities) {
    if (!cfg.vertaalInvoer || !cfg.apis.translator) return tekst;
    const bron = await bronTaal(cfg, tekst, 'auto', o);
    if (MODEL_TALEN.includes(bron)) return tekst;
    try { const v = await vertaal(cfg, tekst, bron, modelTaal, o); notities.push(t(`вхід перекладено ${bron}→${modelTaal}`, `invoer vertaald ${bron}→${modelTaal}`)); return v; }
    catch (e) { notities.push(t(`вхід не перекладено (${foutTekst(e)})`, `invoer niet vertaald (${foutTekst(e)})`)); return tekst; }
  }
  async function naarUiTaal(cfg, tekst, vanTaal, o, notities) {
    const doel = doelTaalVan(cfg);
    if (!cfg.vertaalUitvoer || !cfg.apis.translator || !tekst || vanTaal === doel) return tekst;
    try { const v = await vertaal(cfg, tekst, vanTaal, doel, { ...o, opStuk: o.opStuk }); notities.push(t(`відповідь перекладено ${vanTaal}→${doel}`, `antwoord vertaald ${vanTaal}→${doel}`)); return v; }
    catch (e) { notities.push(t(`переклад відповіді не вдався (${foutTekst(e)})`, `vertalen van het antwoord mislukt (${foutTekst(e)})`)); return tekst; }
  }

  // ---------------------------------------------------------------- bewerkingen (één ingang voor de UI)
  /**
   * voer(modus, invoer, cfg, o) → { tekst, notities[], extra }
   *  modus: 'prompt' | 'summarizer' | 'writer' | 'rewriter' | 'translator' | 'detector' | 'proofreader'
   *  o: { signal, opStuk(tekst), opVoortgang(fractie), magDownloaden, afbeelding (Blob), sessie (Prompt-sessie hergebruiken) }
   */
  async function voer(modus, invoer, cfg, o = {}) {
    const tekst = String(invoer || '').trim();
    if (!tekst && modus !== 'prompt') throw new LokaleFout('LEEG');
    if (modus === 'prompt' && !tekst && !o.afbeelding) throw new LokaleFout('LEEG');
    const notities = [];
    const io = { signal: o.signal, opVoortgang: o.opVoortgang, magDownloaden: o.magDownloaden };
    const sig = o.signal ? { signal: o.signal } : {};
    switch (modus) {
      case 'summarizer': case 'writer': case 'rewriter': {
        const c = cfg[modus];
        const inTekst = await voorbereidInvoer(cfg, tekst, c.taal, io, notities);
        const inst = await instantie(modus, cfg, io);
        const pas = await pasIn(inst, inTekst);
        if (pas.ingekort) notities.push(t('текст скорочено до ліміту моделі', 'tekst ingekort tot de limiet van het model'));
        const methode = { summarizer: 'summarize', writer: 'write', rewriter: 'rewrite' }[modus];
        let uit;
        if (typeof inst[`${methode}Streaming`] === 'function' && typeof o.opStuk === 'function') uit = await leesStroom(inst[`${methode}Streaming`](pas.tekst, sig), o.opStuk);
        else uit = await inst[methode](pas.tekst, sig);
        uit = await naarUiTaal(cfg, uit, c.taal, { ...io, opStuk: o.opStuk }, notities);
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
      case 'prompt': {
        const c = cfg.prompt;
        const inTekst = tekst ? await voorbereidInvoer(cfg, tekst, c.taal, io, notities) : '';
        const sessie = o.sessie || await instantie('prompt', cfg, { ...io, extra: { afbeelding: !!o.afbeelding }, nieuw: true });
        let bericht = inTekst;
        if (o.afbeelding && cfg.multimodaal) bericht = [{ role: 'user', content: [...(inTekst ? [{ type: 'text', value: inTekst }] : []), { type: 'image', value: o.afbeelding }] }];
        const opties = { ...sig };
        if (c.schema) {
          try { opties.responseConstraint = JSON.parse(c.schema); notities.push(t('відповідь за JSON-схемою', 'antwoord volgens JSON-schema')); }
          catch { notities.push(t('JSON-схема недійсна — проігноровано', 'JSON-schema ongeldig — genegeerd')); }
        }
        let uit;
        if (typeof sessie.promptStreaming === 'function' && typeof o.opStuk === 'function') uit = await leesStroom(sessie.promptStreaming(bericht, opties), o.opStuk);
        else uit = await sessie.prompt(bericht, opties);
        if (!opties.responseConstraint) uit = await naarUiTaal(cfg, uit, c.taal, { ...io, opStuk: o.opStuk }, notities);
        return { tekst: uit, notities, extra: { sessie, gebruik: gebruikVan(sessie) } };
      }
      default: throw new LokaleFout('ONBEKEND', modus);
    }
  }
  /** Contextgebruik van een Prompt-sessie (nieuwe namen contextUsage/contextWindow, oude inputUsage/inputQuota). */
  function gebruikVan(s) {
    if (!s) return null;
    const g = Number.isFinite(s.contextUsage) ? s.contextUsage : Number.isFinite(s.inputUsage) ? s.inputUsage : null;
    const m = Number.isFinite(s.contextWindow) ? s.contextWindow : Number.isFinite(s.inputQuota) ? s.inputQuota : null;
    return g != null && m ? { gebruikt: g, max: m } : null;
  }

  // ---------------------------------------------------------------- tabbladtekst (alleen tarasevych.com, alleen met «!»-schakelaar)
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
    SLEUTEL, API, API_IDS, MODEL_TALEN, VERTAAL_TALEN, STANDAARD, KEUZES,
    laad, bewaar, opschonen, bijWijziging, plaatsProefTokens,
    beschikbaarheid, promptParams, standTekst, instantie, vergeetAlles, voer, vertaal, herken, tabbladTekst,
    leesStroom, voortgang, normaal, gebruikVan, foutTekst, taalNaam, doelTaalVan, optiesVoor, LokaleFout,
  });
})();
