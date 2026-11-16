// 0.9.1: offscreen-document voor de lokale AI. background.js (service worker) heeft geen toegang tot LanguageModel/Summarizer/…;
// dit onzichtbare document wel. Het voert alleen opdrachten uit die van de eigen service worker komen (doel: 'offscreen').
// Regels: nooit een model downloaden zonder gebruikersgebaar (dat bestaat hier niet) — behalve als «!» autoDownload aan staat;
// tabbladtekst lezen gebeurt hier nooit (alleen de tekst die de aanvrager zelf meestuurt).
(() => {
  'use strict';
  const L = globalThis.MR_LOKALE_AI;
  const lopend = new Map(); // id → AbortController
  const MODI = new Set(['summarizer', 'writer', 'rewriter', 'translator', 'detector', 'proofreader', 'prompt']);

  async function voer(m) {
    const cfg = await L.laad();
    L.plaatsProefTokens(cfg);
    if (!MODI.has(m.modus)) return { ok: false, reason: 'MODUS' };
    // Instellingen per aanvraag: alleen wat de achtergrond doorgeeft en door opschonen() komt (nooit «!»-schakelaars aanzetten).
    // EXT090-001 (0.9.2): ook autoDownload uit — een aanvraag van een pagina mag nooit een download van gigabytes starten (contract:
    // MODEL_NIET_GELADEN, downloaden alleen met een klik in de instellingen van de extensie).
    const c = { ...cfg, multimodaal: false, tabTekst: false, autoDownload: false };
    // Let op: `doel` is in deze berichten het ADRES ('offscreen'); talen heten vanTaal/naarTaal.
    if (m.modus === 'translator' && m.naarTaal) c.translator = { bron: m.vanTaal || 'auto', doel: m.naarTaal };
    // 0.9.6 (PR #117): modus 'prompt' — systeeminstructie en JSON-schema van DEZE aanvraag in plaats van die uit de instellingen.
    // De achtergrond controleerde al (lengte, geldig JSON); hier alleen nog het type.
    if (m.modus === 'prompt' && (typeof m.systeem === 'string' || typeof m.schema === 'string')) {
      c.prompt = { ...cfg.prompt, ...(typeof m.systeem === 'string' ? { systeem: m.systeem.slice(0, 2000) } : {}), ...(typeof m.schema === 'string' ? { schema: m.schema.slice(0, 8000) } : {}) };
    }
    const ab = new AbortController();
    if (m.id) lopend.set(m.id, ab);
    const tm = setTimeout(() => ab.abort(), Math.min(Number(m.limietMs) || 120000, 300000));
    try {
      const r = await L.voer(m.modus, String(m.tekst || '').slice(0, 20000), c, { signal: ab.signal, magDownloaden: false, rauw: m.modus === 'prompt' && m.rauw === true });
      // Elke aanvraag krijgt een eigen Prompt-sessie; hier loopt geen gesprek door → meteen vrijgeven (anders blijft het geheugen bezet).
      if (r.extra && r.extra.sessie && typeof r.extra.sessie.destroy === 'function') { try { r.extra.sessie.destroy(); } catch { /* al weg */ } }
      return { ok: true, tekst: String(r.tekst || ''), notities: r.notities || [], ...(r.extra && r.extra.correcties ? { correcties: r.extra.correcties } : {}) };
    } catch (e) {
      return { ok: false, reason: (e && (e.code || e.name)) || 'FOUT', detail: L.foutTekst(e) };
    } finally { clearTimeout(tm); if (m.id) lopend.delete(m.id); }
  }

  async function stand() {
    const cfg = await L.laad();
    L.plaatsProefTokens(cfg);
    const apis = {};
    await Promise.all(L.API_IDS.map(async (id) => { apis[id] = (await L.beschikbaarheid(id, cfg)).stand; }));
    return { ok: true, aan: cfg.aan, apis };
  }

  chrome.runtime.onMessage.addListener((m, sender, sendResponse) => {
    if (!m || m.doel !== 'offscreen') return false;          // berichten voor andere pagina's niet beantwoorden
    if (sender.id !== chrome.runtime.id || sender.tab) return false; // alleen de eigen service worker
    if (m.op === 'lokale-ai-voer') { voer(m).then(sendResponse); return true; }
    if (m.op === 'lokale-ai-stand') { stand().then(sendResponse); return true; }
    if (m.op === 'lokale-ai-stop') { const ab = lopend.get(m.id); if (ab) ab.abort(); sendResponse({ ok: true }); return false; }
    if (m.op === 'ping') { sendResponse({ ok: true }); return false; }
    return false;
  });
  L.bijWijziging(() => L.vergeetAlles());
})();
