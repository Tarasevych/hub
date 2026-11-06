// Mijn Ruimte-extensie 0.6: brug op de pagina's van tarasevych.com (ISOLATED world). Doet vijf dingen:
//  1. meldt aan de site dat de extensie er is en in welke staat (alleen de publieke velden per slot, zie naarPubliek) en leest de
//     accountclaim <meta name="mjn-account" content="userId:sessionTag"> en (0.6) het PROFIEL van dit tabblad
//     <meta name="mjn-profiel" content="gebruiker|technisch"> — bij laden en live bij elke wijziging (MutationObserver), zonder herladen;
//     koppelen gaat NIET via deze brug maar via externally_connectable rechtstreeks naar het achtergrondproces;
//  2. maakt een momentopname van de pagina (tekst, bedieningselementen, door de site aangeboden acties);
//  3. voert op verzoek een actie, klik of invoer uit. Wachtwoord- en betaalvelden worden nooit gelezen of ingevuld;
//  4. houdt de diagnosebuffer bij (≤ 200 regels, met TTL) ALLEEN in verzamelmodus, en die modus hoort bij precies één slot
//     ('prive' of 'technisch'; het achtergrondproces zet hem op 'diag-modus'). Wisselt het slot of het profiel van de pagina,
//     dan is de buffer meteen leeg: de AI van het ene slot krijgt nooit wat onder het andere is verzameld;
//  5. audit (browser.audit): prestaties, beveiligingsbevindingen en DOM-structuur, alleen getallen, hosts en codes.
// Elke opdracht van het achtergrondproces draagt `ruimte`; de brug controleert vlak voor de uitvoering zelf nog het profiel:
// technisch alleen als deze pagina NU technisch is, prive nooit op een technische pagina.
// Gebeurtenissen van de pagina (mr-diag, mr-perf, postMessage) zijn onbetrouwbare data: alleen gefilterde, begrensde velden.
(async () => {
  // 0.9.1 (EXT090-001): het achtergrondproces plaatst de brug zelf op tabbladen die al open waren (geen F5). Dubbel plaatsen mag
  // niets verdubbelen: leeft er in deze wereld al een brug van de WERKENDE extensie, dan stopt deze meteen (synchroon, vóór de
  // eerste await). Een verweesde brug van vóór de update/herladen (chrome.runtime.id weg) telt niet en zwijgt voortaan zelf.
  const leeft = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; } };
  if (globalThis.__mrBrug && typeof globalThis.__mrBrug.leeft === 'function' && globalThis.__mrBrug.leeft()) return;
  globalThis.__mrBrug = { leeft };
  const shared = await import(chrome.runtime.getURL('shared.js'));
  const { isSensitiveField, pickByName, ALLOWED_KEYS, parseAccountClaim, parseProfiel, profielToegestaan, isRuimte, pushDiag, stripQuery, markeringVoor } = shared;
  // 0.7.0 (zone E): uid per bedieningselement (zoals chrome-devtools-mcp); een oudere shared.js zonder deze functies → alleen op naam.
  const kiesElement = shared.kiesElement || ((items, params, filter) => pickByName(filter ? items.filter(filter) : items, params && params.name));
  const uidVan = shared.uidVan || null;
  // 0.6.1 (punt 8): de zichtbare markering zit in een eigen module met een eigen shadow DOM; faalt het laden, dan werkt de rest gewoon.
  const mark = await import(chrome.runtime.getURL('markering.js')).catch(() => null);
  // 0.6.2: WIE leest nu, en in welke kleur? Zuivere regels, gedeeld met de server en de tests (shared/markering-agenten.ts).
  const ma = await import(chrome.runtime.getURL('markering-agenten.js')).catch(() => null);
  const VERSION = chrome.runtime.getManifest().version;
  const PAIR_HOST = 'mcp.tarasevych.com';

  const say = (data) => window.postMessage({ mrExt: true, version: VERSION, ...data }, location.origin);
  const vanPagina = (event) => event.source === window && event.origin === location.origin && !!event.data && typeof event.data === 'object';
  const vanExtensie = (sender) => !sender || sender.id === chrome.runtime.id;

  // ---- 1a. accountclaim + profiel: bij laden en bij elke wijziging van de meta-tags (inloggen/uitloggen, tech-modus aan/uit) ----
  let lastClaim = null;
  let lastProfiel = null;
  const metaInhoud = (naam) => { const el = document.querySelector(`meta[name="${naam}"]`); return el ? String(el.getAttribute('content') || '') : ''; };
  const huidigProfiel = () => parseProfiel(metaInhoud('mjn-profiel'));
  const readClaim = () => {
    const raw = metaInhoud('mjn-account');
    const profiel = huidigProfiel();
    if (raw === lastClaim && profiel === lastProfiel) return;
    const profielGewisseld = lastProfiel !== null && profiel !== lastProfiel;
    lastClaim = raw; lastProfiel = profiel;
    // Profiel gewisseld: wat onder het vorige slot verzameld is, meteen weg (nog vóór het achtergrondproces antwoordt).
    if (profielGewisseld && bufferRuimte && !profielToegestaan(bufferRuimte, profiel)) zetDiagModus(false, null);
    // … en de markering hoort bij het slot van DIT profiel: meteen herberekenen (anders zou een technische rand blijven staan).
    if (profielGewisseld) zetMarkering(laatstePubliek);
    chrome.runtime.sendMessage({ op: 'account', claim: parseAccountClaim(raw), profiel }).catch(() => undefined);
  };

  // ---- 1b. publieke status (contract 0.6 §5): whitelist per slot, typen gecontroleerd, verder NIETS doorgeven ----
  const STATEN = ['niet-gekoppeld', 'vergrendeld', 'ontgrendeld', 'agent'];
  const CAPS = ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.debug'];
  const HOST_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
  const PUBLIEK_VELDEN = Object.freeze(['versie', 'profielTab', 'account', 'prive', 'technisch', 'lokaalVerbonden', 'diagnostiek',
    'gekoppeld', 'verbonden', 'staat', 'exp', 'caps', 'domeinen', 'aiVerbonden', 'agentId', 'lokaleAi']);
  /** 0.9.1: ingebouwde AI van Chrome — alleen de KEUZES van de gebruiker (hoofdschakelaar + welke API's aan), nooit tekst of uitvoer. */
  const LAI_APIS = Object.freeze(['prompt', 'summarizer', 'writer', 'rewriter', 'translator', 'detector', 'proofreader']);
  function laiPubliek(bron) {
    const d = bron && typeof bron === 'object' ? bron : null;
    return d ? { aan: d.aan === true, apis: Array.isArray(d.apis) ? [...new Set(d.apis.filter((x) => LAI_APIS.includes(x)))] : [] } : null;
  }
  /** 0.6.1 (punt 7): alleen deze vier velden over het debuggerrecht gaan naar de pagina; nooit paden, opslag of foutteksten. */
  const DIAG_STANDEN = Object.freeze(['ja', 'nee', 'geweigerd', 'ingetrokken', 'niet-aanvraagbaar']);
  function diagPubliek(bron) {
    const d = bron && typeof bron === 'object' ? bron : {};
    return { stand: DIAG_STANDEN.includes(d.stand) ? d.stand : 'nee', optIn: d.optIn === true, actief: d.actief === true, aanvraagbaar: d.aanvraagbaar === true };
  }
  const SLOT_VELDEN = Object.freeze(['gekoppeld', 'verbonden', 'staat', 'exp', 'caps', 'domeinen', 'aiVerbonden', 'agentId']);
  const tekst = (v, max, re) => (typeof v === 'string' && v.length <= max && re.test(v) ? v : '');
  const lijst = (v, ok) => (Array.isArray(v) ? [...new Set(v.filter(ok))].slice(0, 20) : []);
  /** Eén slot: uit ExtStatus-vorm (ontgrendeling/ai) of publieke vorm (exp/caps/aiVerbonden). */
  function slotPubliek(bron) {
    const s = bron && typeof bron === 'object' ? bron : {};
    const heeftOnt = Object.prototype.hasOwnProperty.call(s, 'ontgrendeling');
    const ont = heeftOnt && s.ontgrendeling && typeof s.ontgrendeling === 'object' ? s.ontgrendeling : null;
    const gekoppeld = s.gekoppeld === true;
    const ai = s.ai && typeof s.ai === 'object' ? s.ai : null;
    const uit = {
      gekoppeld,
      verbonden: s.verbonden === true,
      staat: STATEN.includes(s.staat) ? s.staat : (gekoppeld ? 'vergrendeld' : 'niet-gekoppeld'),
      exp: heeftOnt ? (ont && Number.isFinite(ont.exp) ? ont.exp : null) : (Number.isFinite(s.exp) ? s.exp : null),
      caps: lijst(heeftOnt ? ont && ont.caps : s.caps, (c) => CAPS.includes(c)),
      domeinen: lijst(heeftOnt ? ont && ont.domeinen : s.domeinen, (d) => typeof d === 'string' && d.length <= 100 && HOST_RE.test(d)),
      aiVerbonden: (s.aiVerbonden ?? (ai && ai.verbonden)) === true,
      agentId: tekst(s.agentId, 100, /^[A-Za-z0-9_.:-]+$/),
    };
    const schoon = {};
    for (const k of SLOT_VELDEN) schoon[k] = uit[k];
    return schoon;
  }
  /** Maakt van ExtStatus (op 'status', sloten.{prive,technisch}) of `publiek` (status-push) precies de publieke velden. */
  function naarPubliek(bron) {
    const s = bron && typeof bron === 'object' ? bron : {};
    const sl = s.sloten && typeof s.sloten === 'object' ? s.sloten : null;
    const prive = slotPubliek(sl ? sl.prive : s.prive);
    const rauwT = sl ? sl.technisch : s.technisch;
    const technisch = rauwT && typeof rauwT === 'object' ? slotPubliek(rauwT) : null;
    const profielTab = s.profielTab === 'technisch' || s.profielTab === 'gebruiker' ? s.profielTab : null;
    const lokaal = s.lokaal && typeof s.lokaal === 'object' ? s.lokaal : null;
    const spiegel = profielTab === 'technisch' && technisch ? technisch : prive;
    const uit = {
      versie: tekst(s.versie ?? s.version, 20, /^[0-9][0-9.]*$/) || VERSION,
      profielTab, account: ['ok', 'mismatch', 'unknown'].includes(s.account) ? s.account : 'unknown', prive, technisch,
      lokaalVerbonden: (s.lokaalVerbonden ?? (lokaal && lokaal.verbonden)) === true,
      diagnostiek: diagPubliek(s.diagnostiek),
      lokaleAi: laiPubliek(s.lokaleAi),
      ...spiegel, // platte velden = spiegel van het slot van dit tabblad (overgang voor de 0.5-site)
    };
    const schoon = {};
    for (const k of PUBLIEK_VELDEN) schoon[k] = uit[k];
    return schoon;
  }
  // ---- 1b-bis. zichtbare markering (0.6.1 punt 8, herzien 0.6.2 20.10.2026) ----
  // TWEE vragen, bewust los van elkaar:
  //   1. MAG er een markering zijn? — markeringVoor(): een slot dat echt open én verbonden is, op deze host, met dit profiel.
  //      Dit is de poort; zonder poort is er nooit iets te zien.
  //   2. IS er nu iets te zien? — markeringLezers(): alleen als een AI binnen de staart iets in DIT tabblad deed.
  //      Een open slot waarin niemand werkt geeft dus GEEN rand meer (precies de klacht van de eigenaar).
  /** Laatste publieke status, zodat een profielwissel de markering meteen kan herberekenen zonder nieuwe vraag. */
  let laatstePubliek = null;
  /** Levende lezers, zoals het achtergrondproces ze stuurt: [{slug, naam, accent, type, at}]. */
  let lezers = [];
  let staartTimer = null;
  const nederlandsTaal = () => String((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase().startsWith('nl');

  /** De poort: welk slot hoort bij dit tabblad en mag hier iets laten zien? null = niets, hoe dan ook. */
  function markeringPoort(pub) {
    const profiel = huidigProfiel();
    // Welk slot hoort bij dit tabblad? Technisch profiel → het technische slot, anders het privé-slot. Nooit beide.
    const ruimte = profiel === 'technisch' ? 'technisch' : 'prive';
    const slot = pub ? (ruimte === 'technisch' ? pub.technisch : pub.prive) : null;
    return markeringVoor(slot, ruimte, profiel, location.href);
  }

  /**
   * Hertekenen uit poort + lezers. Zet ook één timer op het moment waarop de oudste lezer verloopt, zodat de markering
   * zonder nieuw bericht van het achtergrondproces uitgaat (en zacht doodgaat in markering.js).
   */
  function hertekenMarkering() {
    if (!mark) return null;
    clearTimeout(staartTimer); staartTimer = null;
    const poort = markeringPoort(laatstePubliek);
    if (!poort) { lezers = []; try { mark.verwijder(); } catch { /* al weg */ } return null; }
    const nu = Date.now();
    const model = ma ? ma.markeringLezers(lezers.filter((l) => l.ruimte === poort.ruimte), nu) : null;
    try { mark.zetMarkering(model ? { ruimte: poort.ruimte, model, nederlands: nederlandsTaal() } : null); } catch { /* nooit de pagina breken */ }
    if (model && ma) {
      const jongste = Math.max(...model.lezers.map((l) => l.at));
      const over = Math.max(50, jongste + ma.MARKERING_STAART_MS - nu + 30);
      staartTimer = setTimeout(hertekenMarkering, over);
    }
    return model;
  }

  /** Een AI deed net iets in dit tabblad. Één rij per agent; een onbekende agent houdt zijn eigen rij («ШІ» zonder naam). */
  function meldLezer(bericht) {
    if (!ma) return null;
    const nu = Date.now();
    const slug = ma.agentSlugUitNaam(bericht.slug) ?? ma.agentSlugUitNaam(bericht.naam);
    const naam = slug ? '' : String(bericht.naam || '').slice(0, 40);
    const sleutel = `${bericht.ruimte}|${slug || naam.toLowerCase() || '?'}`;
    lezers = lezers.filter((l) => l.sleutel !== sleutel && nu - l.at <= ma.MARKERING_STAART_MS);
    lezers.push({ sleutel, ruimte: bericht.ruimte, slug, naam, accent: typeof bericht.accent === 'string' ? bericht.accent : '', type: String(bericht.type || ''), at: nu });
    return hertekenMarkering();
  }

  /** Oude naam, behouden zodat de rest van bridge.js ongewijzigd blijft: status veranderde → poort opnieuw beoordelen. */
  function zetMarkering(pub) {
    laatstePubliek = pub ?? laatstePubliek;
    return hertekenMarkering();
  }
  const meldStatus = (bron) => {
    const pub = naarPubliek(bron);
    laatstePubliek = pub;
    hertekenMarkering();
    window.postMessage({ mrExt: true, type: 'status', ...pub }, location.origin);
  };
  addEventListener('pagehide', () => { try { mark && mark.verwijder(); } catch { /* al weg */ } });
  // Eén verzoek tegelijk naar het achtergrondproces, hoe vaak de pagina ook vraagt.
  let statusBezig = null;
  const haalStatus = () => statusBezig || (statusBezig = chrome.runtime.sendMessage({ op: 'status' }).catch(() => null).finally(() => { statusBezig = null; }));

  // ---- 1c. aanwezigheid en status op verzoek (alleen berichten van de pagina zelf, zelfde oorsprong) ----
  window.addEventListener('message', async (event) => {
    if (!vanPagina(event)) return;
    // 0.9.1: een verweesde brug (extensie bijgewerkt of herladen) antwoordt niet meer — anders meldt ze «niet gekoppeld» naast de nieuwe.
    if (!leeft()) return;
    if (event.data.mrExtPing) {
      const pub = naarPubliek(await haalStatus());
      say({ type: 'hello', ...pub, paired: pub.gekoppeld || pub.prive.gekoppeld || !!(pub.technisch && pub.technisch.gekoppeld), connected: pub.verbonden, extensionId: chrome.runtime.id, version: VERSION });
      return;
    }
    if (event.data.mrExtStatus) { meldStatus(await haalStatus()); return; }
    if (event.data.mrExtPair) say({ type: 'pair-failed', reason: 'USE_EXTERNAL_PAIR' }); // 0.3-pad bestaat niet meer
  });
  say({ type: 'hello', paired: false, connected: false, extensionId: chrome.runtime.id, version: VERSION });
  haalStatus().then((s) => { if (s) meldStatus(s); }).catch(() => undefined);

  // ---- 4. verzamelmodus en diagnosebuffer ----
  let diagModus = false;
  /** Slot waarvoor de buffer verzameld is ('prive' | 'technisch' | null). Wisselt het, dan is de buffer leeg. */
  let bufferRuimte = null;
  let buffer = [];
  let spillQueue = [];
  let modusGezet = false; // een push van het achtergrondproces is nieuwer dan het antwoord op de beginvraag
  function zetDiagModus(aan, ruimte) {
    let r = aan === true && isRuimte(ruimte) ? ruimte : null;
    if (r && !profielToegestaan(r, huidigProfiel())) r = null; // nooit verzamelen voor een slot waar dit profiel niet bij past
    if (r !== bufferRuimte) { buffer = []; spillQueue = []; }
    bufferRuimte = r;
    diagModus = !!r;
    if (!diagModus) { buffer = []; spillQueue = []; }
    try { document.dispatchEvent(new CustomEvent('mr-diag-modus', { detail: diagModus ? 'aan' : 'uit' })); } catch { /* nooit de pagina breken */ }
  }
  readClaim();
  new MutationObserver(readClaim).observe(document.head || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['content', 'name'] });
  chrome.runtime.sendMessage({ op: 'diag-modus?' })
    .then((r) => { if (!modusGezet) zetDiagModus(!!(r && r.aan === true), r && r.ruimte); })
    .catch(() => { if (!modusGezet) zetDiagModus(false, null); });
  document.addEventListener('mr-diag', (event) => {
    if (!diagModus) return;
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
  const flushSpill = () => {
    if (!diagModus || !bufferRuimte || !spillQueue.length) { spillQueue = []; return; }
    const entries = spillQueue.slice(-200); spillQueue = [];
    chrome.runtime.sendMessage({ op: 'diag-spill', ruimte: bufferRuimte, url: location.origin + location.pathname, entries }).catch(() => undefined);
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
    // 0.5: van een gevoelig veld nooit eigen inhoud (ook geen standaardtekst van een textarea) als naam gebruiken.
    const own = isSensitiveField(el) ? '' : el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) ? el.value : textOf(el);
    if (own) return own.slice(0, 120);
    return (el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || '').trim();
  };
  const roleOf = (el) => el.getAttribute('role') || (el.tagName === 'A' ? 'link' : el.tagName === 'BUTTON' ? 'button' : el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textbox'
    : el.tagName === 'INPUT' ? (/^(checkbox|radio)$/i.test(el.type) ? el.type.toLowerCase() : /^(button|submit|reset)$/i.test(el.type) ? 'button' : 'textbox') : 'control');
  const controls = () => [...document.querySelectorAll(SELECTOR)].filter(visible).map((el) => ({ el, name: nameOf(el), role: roleOf(el) })).filter((c) => c.name);

  // De site biedt acties aan via window.postMessage (src/ai-site-acties.ts); een andere pagina antwoordt niet.
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
    const list = controls().slice(0, 200).map(({ el, name, role }, i) => {
      const item = { ...(uidVan ? { uid: uidVan(i, name) } : {}), role, name: name.slice(0, 120) };
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') item.disabled = true;
      if (isSensitiveField(el)) item.sensitive = true;
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
    const picked = kiesElement(controls(), params);
    if (picked.error) throw new Error(picked.error);
    const { el, name, role } = picked.item;
    if (isSensitiveField(el)) throw new Error('Refused: this is a password or payment field');
    if (el.closest && el.closest('[data-scherm-toetsenbord]')) throw new Error('Refused: on-screen keyboard is not an automation target');
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') throw new Error(`"${name}" is disabled`);
    el.scrollIntoView({ block: 'center' });
    el.click();
    return { clicked: name, role };
  }

  function type(params) {
    const picked = kiesElement(controls(), params, (c) => c.role === 'textbox');
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

  // ---- console en netwerk uit de buffer van de pagina (bron 'pagina'; het achtergrondproces voegt webRequest toe) ----
  /** Alleen de buffer van het slot dat vraagt; van een ander slot: leeg. */
  const bufferVoor = (ruimte) => (diagModus && ruimte === bufferRuimte ? fresh() : []);
  function consoleMessages(params) {
    const types = Array.isArray(params.types) && params.types.length ? params.types : null;
    const items = bufferVoor(params.ruimte).filter((e) => e.kind === 'exception' || (e.kind === 'console' && (!types || types.includes(e.level))));
    return { diagnostics: diagModus && params.ruimte === bufferRuimte, bron: 'pagina', messages: items.slice(-100).map((e) => ({ type: e.kind === 'exception' ? 'exception' : e.level, text: e.text, at: e.at, bron: 'pagina' })) };
  }
  function networkRequests(params) {
    const items = bufferVoor(params.ruimte).filter((e) => e.kind === 'request' && (!params.failed_only || e.error || (e.status || 0) >= 400));
    return { diagnostics: diagModus && params.ruimte === bufferRuimte, bron: 'pagina', requests: items.slice(-100).map((e) => ({ method: e.method, url: e.url, status: e.status, ms: e.ms, error: e.error, at: e.at, bron: 'pagina' })) };
  }
  function hover(params) {
    const picked = kiesElement(controls(), params);
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
      try { results.push({ ok: true, ...type({ name: item.name, uid: item.uid, text: item.value }) }); }
      catch (err) { results.push({ ok: false, name: String(item.name ?? item.uid ?? '').slice(0, 120), error: String((err && err.message) || err).slice(0, 200) }); }
    }
    return { filled: results.filter((r) => r.ok).length, results };
  }

  // ---- handelen (de server laat dit alleen door na goedkeuring van de gebruiker) ----
  function selectOption(params) {
    const picked = kiesElement(controls(), params, (c) => c.role === 'select');
    if (picked.error) throw new Error(picked.error);
    const { el, name } = picked.item;
    if (isSensitiveField(el)) throw new Error('Refused: this is a password or payment field'); // 0.5: bv. autocomplete="cc-exp-month"
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
      if (el.closest && el.closest('[data-scherm-toetsenbord]')) throw new Error('Refused: on-screen keyboard is not an automation target');
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

  // ---- 5. audit (browser.audit, contract §6). Leest alleen structuur: tagnamen, attribuutNAMEN, hosts en protocollen van adressen,
  //      een paar vaste attributen (rel, target, sandbox, integrity, method, autocomplete, type, http-equiv). Nooit .value, cookies,
  //      opslag of querystrings; geen tekst van de pagina. Alles begrensd. ----
  const AUDIT_SOORTEN = ['alles', 'prestaties', 'beveiliging', 'dom'];
  const MAX_BEVINDINGEN = 50;
  const MAX_ELEMENTEN = 50000;
  const ERNST_VOLGORDE = { hoog: 0, middel: 1, laag: 2, info: 3 };
  const getal = (v, max = 1e9, decimalen = 0) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    const f = 10 ** decimalen;
    return Math.round(Math.min(n, max) * f) / f;
  };
  const eigenSite = (h) => h === 'tarasevych.com' || h.endsWith('.tarasevych.com');
  /** {protocol, host} van een attribuutadres (zonder pad of query), of null. */
  const adresVan = (raw) => {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    try { const u = new URL(s, document.baseURI || location.href); return { protocol: u.protocol, host: u.hostname.slice(0, 100) }; } catch { return null; }
  };
  const kortAdres = (raw) => String(stripQuery(String(raw || ''))).split('#')[0].slice(0, 200);

  /** Vraagt collector.js (MAIN) om de samenvatting van LCP/CLS/longtasks. Antwoord = onbetrouwbaar: alleen getallen. */
  const vraagPerf = () => new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    let timer = null;
    const klaar = (v) => { document.removeEventListener('mr-perf', op); clearTimeout(timer); resolve(v); };
    const op = (event) => {
      let d; try { d = JSON.parse(String(event.detail || '')); } catch { return; }
      if (!d || typeof d !== 'object' || d.id !== id) return;
      const lt = d.longTasks && typeof d.longTasks === 'object' ? d.longTasks : null;
      klaar(d.actief === true ? { lcp: getal(d.lcp, 600000), cls: getal(d.cls, 100, 4), longTasks: lt ? { aantal: getal(lt.aantal, 1e6) ?? 0, totaalMs: getal(lt.totaalMs, 1e8) ?? 0 } : null } : null);
    };
    timer = setTimeout(() => klaar(null), 300);
    document.addEventListener('mr-perf', op);
    try { document.dispatchEvent(new CustomEvent('mr-perf?', { detail: id })); } catch { klaar(null); }
  });

  async function prestaties(ruimte) {
    const perf = typeof performance !== 'undefined' && performance && typeof performance.getEntriesByType === 'function' ? performance : null;
    let nav = null; let res = [];
    try { nav = perf ? perf.getEntriesByType('navigation')[0] || null : null; } catch { nav = null; }
    try { res = perf ? [...perf.getEntriesByType('resource')].slice(0, 3000) : []; } catch { res = []; }
    const bytesVan = (e) => getal(e.transferSize, 1e10) || getal(e.encodedBodySize, 1e10) || 0;
    const grootste = res.map((e) => ({ e, b: bytesVan(e) })).sort((a, b) => b.b - a.b).slice(0, 10)
      .map(({ e, b }) => ({ url: kortAdres(e.name), soort: String(e.initiatorType || '').slice(0, 20), bytes: b, ms: getal(e.duration, 1e7) ?? 0 }));
    const p = diagModus && ruimte === bufferRuimte ? await vraagPerf() : null;
    return {
      navigatie: { ttfb: nav ? getal(nav.responseStart, 1e7) : null, domContentLoaded: nav ? getal(nav.domContentLoadedEventEnd, 1e7) || null : null, load: nav ? getal(nav.loadEventEnd, 1e7) || null : null },
      lcp: p ? p.lcp : null,
      cls: p ? p.cls : null,
      longTasks: p && p.longTasks ? p.longTasks : { aantal: null, totaalMs: null },
      resources: { aantal: res.length, bytes: res.reduce((t, e) => t + bytesVan(e), 0), grootste },
      _mixed: location.protocol === 'https:' ? res.map((e) => adresVan(e.name)).filter((a) => a && a.protocol === 'http:').map((a) => a.host) : [],
    };
  }

  function doorloopDom() {
    const root = document.documentElement;
    const elementen = []; let diepte = 0; let afgekapt = false;
    const stapel = root ? [[root, 1]] : [];
    while (stapel.length) {
      const [el, d] = stapel.pop();
      if (elementen.length >= MAX_ELEMENTEN) { afgekapt = true; break; }
      elementen.push(el);
      if (d > diepte) diepte = d;
      const kinderen = el.children || [];
      for (let i = kinderen.length - 1; i >= 0; i -= 1) stapel.push([kinderen[i], d + 1]);
    }
    return { elementen, diepte, afgekapt };
  }

  function beveiligingEnDom(mixedHosts) {
    const { elementen, diepte, afgekapt } = doorloopDom();
    const bev = new Map();
    // Eén bevinding per code en ernst; hosts (≤ 5 genoemd) en aantal in het detail. Zo verdringen 80 externe scripts geen andere codes.
    const vind = (code, ernst, host = '', extra = '') => {
      const k = `${code}|${ernst}`;
      const b = bev.get(k) || { code, ernst, hosts: new Set(), extra, n: 0 };
      b.n += 1; if (host) b.hosts.add(host); if (extra && !b.extra) b.extra = extra;
      bev.set(k, b);
    };
    const attr = (el, n) => (el.getAttribute ? el.getAttribute(n) : null);
    const https = location.protocol === 'https:';
    const formulieren = []; let inline = 0; const scriptHosts = new Set(); const iframeHosts = new Set();
    let cspMeta = false; const handlerNamen = new Map(); let handlerElementen = 0;
    for (const el of elementen) {
      const tag = String(el.tagName || '').toUpperCase();
      // Inline handlers: alleen attribuutNAMEN tellen, nooit de inhoud.
      const namen = typeof el.getAttributeNames === 'function' ? el.getAttributeNames() : [];
      const on = namen.filter((n) => /^on[a-z]+$/i.test(n));
      if (on.length) { handlerElementen += 1; for (const n of on) handlerNamen.set(n.toLowerCase(), (handlerNamen.get(n.toLowerCase()) || 0) + 1); }
      if (tag === 'FORM') {
        const actie = adresVan(attr(el, 'action') || location.href);
        const methode = ['get', 'post', 'dialog'].includes(String(attr(el, 'method') || 'get').toLowerCase()) ? String(attr(el, 'method') || 'get').toLowerCase() : 'get';
        const velden = el.querySelectorAll ? [...el.querySelectorAll('input,select,textarea')] : [];
        const zichtbaar = velden.filter((v) => String(attr(v, 'type') || '').toLowerCase() !== 'hidden');
        const wachtwoord = velden.some((v) => isSensitiveField(v));
        if (formulieren.length < 20) formulieren.push({ actieHost: actie ? actie.host : '', methode, velden: zichtbaar.length, wachtwoord });
        if (actie && actie.protocol === 'http:') vind('FORM_HTTP_ACTIE', 'hoog', actie.host);
        if (actie && actie.host && actie.host !== location.hostname) vind('FORM_ANDERE_HOST', eigenSite(actie.host) ? 'laag' : 'hoog', actie.host);
        if (wachtwoord && methode === 'get') vind('FORM_GET_WACHTWOORD', 'hoog');
      } else if (tag === 'SCRIPT') {
        const src = attr(el, 'src');
        if (src == null || src === '') {
          const t = String(attr(el, 'type') || '').toLowerCase();
          if (!t || /javascript|module|ecmascript/.test(t)) inline += 1;
        } else {
          const a = adresVan(src);
          if (a && a.host && a.host !== location.hostname && scriptHosts.size < 20) scriptHosts.add(a.host);
          if (a && https && a.protocol === 'http:') vind('MIXED_CONTENT', 'hoog', a.host, 'script');
          if (a && a.host && !eigenSite(a.host) && !attr(el, 'integrity')) vind('SCRIPT_ZONDER_SRI_EXTERN', 'middel', a.host);
        }
      } else if (tag === 'IFRAME') {
        const a = adresVan(attr(el, 'src'));
        if (a && a.host) { if (iframeHosts.size < 20) iframeHosts.add(a.host); }
        if (a && https && a.protocol === 'http:') vind('MIXED_CONTENT', 'hoog', a.host, 'iframe');
        if (a && a.host && !eigenSite(a.host) && attr(el, 'sandbox') == null) vind('IFRAME_ZONDER_SANDBOX_EXTERN', 'middel', a.host);
      } else if (tag === 'A' || tag === 'AREA') {
        const href = attr(el, 'href');
        const a = adresVan(href);
        if (a && a.protocol === 'javascript:') vind('JAVASCRIPT_URL', 'laag');
        const target = String(attr(el, 'target') || '').toLowerCase();
        const rel = String(attr(el, 'rel') || '').toLowerCase().split(/\s+/);
        if (target === '_blank' && a && a.host && !eigenSite(a.host) && !rel.includes('noopener') && !rel.includes('noreferrer')) vind('TARGET_BLANK_ZONDER_NOOPENER', 'laag', a.host);
      } else if (tag === 'LINK') {
        const rel = String(attr(el, 'rel') || '').toLowerCase().split(/\s+/);
        const a = adresVan(attr(el, 'href'));
        if (rel.includes('stylesheet') || rel.includes('preload') || rel.includes('modulepreload')) {
          if (a && https && a.protocol === 'http:') vind('MIXED_CONTENT', 'hoog', a.host, 'link');
          if (rel.includes('stylesheet') && a && a.host && !eigenSite(a.host) && !attr(el, 'integrity')) vind('STYLESHEET_ZONDER_SRI_EXTERN', 'laag', a.host);
        }
      } else if (['IMG', 'AUDIO', 'VIDEO', 'SOURCE', 'EMBED', 'TRACK', 'OBJECT'].includes(tag)) {
        const a = adresVan(attr(el, tag === 'OBJECT' ? 'data' : 'src'));
        if (a && https && a.protocol === 'http:') vind('MIXED_CONTENT', tag === 'IMG' || tag === 'AUDIO' || tag === 'VIDEO' || tag === 'SOURCE' || tag === 'TRACK' ? 'middel' : 'hoog', a.host, tag.toLowerCase());
      } else if (tag === 'META') {
        const eq = String(attr(el, 'http-equiv') || '').toLowerCase();
        if (eq === 'content-security-policy') {
          cspMeta = true;
          const csp = String(attr(el, 'content') || '').toLowerCase();
          const scriptSrc = (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) || csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('default-src ')) || '');
          if (scriptSrc.includes("'unsafe-inline'")) vind('CSP_UNSAFE_INLINE', 'middel');
          if (scriptSrc.includes("'unsafe-eval'")) vind('CSP_UNSAFE_EVAL', 'middel');
        }
        if (String(attr(el, 'name') || '').toLowerCase() === 'referrer' && String(attr(el, 'content') || '').toLowerCase() === 'unsafe-url') vind('REFERRER_UNSAFE_URL', 'laag');
      } else if (tag === 'BASE') {
        const a = adresVan(attr(el, 'href'));
        if (a && a.host && a.host !== location.hostname) vind('BASE_ANDERE_HOST', 'hoog', a.host);
      } else if (tag === 'INPUT') {
        const t = String(attr(el, 'type') || '').toLowerCase();
        if (t === 'password') {
          const ac = String(attr(el, 'autocomplete') || '').toLowerCase().trim();
          if (!/(^|\s)(current-password|new-password|one-time-code)$/.test(ac)) vind('WACHTWOORD_AUTOCOMPLETE', 'laag', '', ac ? 'ongebruikelijke waarde' : 'ontbreekt');
        }
      }
    }
    for (const h of mixedHosts) vind('MIXED_CONTENT', 'hoog', h, 'resource');
    if (!https) vind('GEEN_HTTPS', 'hoog');
    if (!cspMeta) vind('GEEN_CSP_META', 'info', '', 'geen <meta> CSP; een CSP-header kan er wel zijn');
    if (handlerElementen) {
      const top = [...handlerNamen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${n}×${c}`).join(', ');
      bev.set('INLINE_HANDLERS|laag', { code: 'INLINE_HANDLERS', ernst: 'laag', hosts: new Set(), extra: top, n: handlerElementen });
    }
    if (inline) bev.set('INLINE_SCRIPTS|info', { code: 'INLINE_SCRIPTS', ernst: 'info', hosts: new Set(), extra: '', n: inline });
    const bevindingen = [...bev.values()]
      .sort((a, b) => ERNST_VOLGORDE[a.ernst] - ERNST_VOLGORDE[b.ernst] || b.n - a.n)
      .slice(0, MAX_BEVINDINGEN)
      .map((b) => {
        const hosts = [...b.hosts];
        const genoemd = hosts.length ? hosts.slice(0, 5).join(', ') + (hosts.length > 5 ? ` +${hosts.length - 5}` : '') : '';
        return { code: b.code, ernst: b.ernst, detail: [genoemd, b.extra, `${b.n}×`].filter(Boolean).join(' · ').slice(0, 200) };
      });
    const dom = { elementen: elementen.length, diepte, formulieren, scripts: { inline, extern: [...scriptHosts] }, iframes: [...iframeHosts] };
    if (afgekapt) dom.afgekapt = true;
    return { bevindingen, dom };
  }

  async function audit(params) {
    const soort = AUDIT_SOORTEN.includes(params && params.soort) ? params.soort : 'alles';
    const uit = { url: location.origin + location.pathname, soort };
    const wilP = soort === 'alles' || soort === 'prestaties';
    const wilB = soort === 'alles' || soort === 'beveiliging';
    const wilD = soort === 'alles' || soort === 'dom';
    let mixed = [];
    if (wilP || wilB) {
      const p = await prestaties(params.ruimte);
      mixed = p._mixed; delete p._mixed;
      if (wilP) uit.prestaties = p;
    }
    if (wilB || wilD) {
      const r = beveiligingEnDom(wilB ? mixed : []);
      if (wilB) uit.beveiliging = { bevindingen: r.bevindingen };
      if (wilD) uit.dom = r.dom;
    }
    return uit;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!vanExtensie(sender) || !message || typeof message !== 'object') return false;
    (async () => {
      try {
        // Van het achtergrondproces: verzamelmodus en status voor de pagina.
        if (message.op === 'diag-modus') { modusGezet = true; zetDiagModus(message.aan === true, message.ruimte); return sendResponse({ ok: true, data: { aan: diagModus, ruimte: bufferRuimte } }); }
        if (message.op === 'status-push') { meldStatus(message.status); return sendResponse({ ok: true }); }
        // Na het wekken van de service worker en vóór elke opdracht: ruwe accountclaim + profiel (het achtergrondproces parseert zelf).
        if (message.op === 'account?') return sendResponse({ ok: true, data: { claim: metaInhoud('mjn-account').slice(0, 300), profiel: huidigProfiel() } });
        if (message.op === 'diag-clear') { if (!isRuimte(message.ruimte) || message.ruimte === bufferRuimte) { buffer = []; spillQueue = []; } return sendResponse({ ok: true, data: { cleared: true } }); }
        // 0.9.1: levensteken voor zorgVoorBrug in het achtergrondproces (geen gegevens).
        if (message.op === 'brug?') return sendResponse({ ok: true, data: { versie: VERSION } });
        if (message.op === 'self_test') {
          const m = mark ? mark.markeringStand() : null;
          return sendResponse({ ok: true, data: { bridge: true, diagnostics: diagModus, ruimte: bufferRuimte, buffered: fresh().length, claim: !!parseAccountClaim(lastClaim || ''), profiel: huidigProfiel(), url: location.origin + location.pathname, markering: m ? m.ruimte : null, lezers: m ? m.lezers : 0 } });
        }
        // 0.6.2: een AI doet NU iets in dit tabblad — wie, en wat. Alleen voor het slot dat hier mag werken; de markering
        // verschijnt hierdoor (en alleen hierdoor) en gaat na de staart van shared/markering-agenten.ts zelf weer uit.
        if (message.op === 'markering-lezer') {
          if (!isRuimte(message.ruimte) || !profielToegestaan(message.ruimte, huidigProfiel())) return sendResponse({ ok: false, error: 'EXTENSIE_PROFIEL' });
          const model = meldLezer(message);
          return sendResponse({ ok: true, data: { lezers: model ? model.lezers.length : 0, extra: model ? model.extra : 0 } });
        }
        // Vlak vóór chrome.tabs.captureVisibleTab: de markering mag niet óp de momentopname staan (zij komt daarna terug).
        if (message.op === 'markering-verberg') { let uit = false; try { uit = mark ? mark.verberg(message.ms) : false; } catch { uit = false; } return sendResponse({ ok: true, data: { verborgen: uit } }); }
        if (message.op === 'markering-toon') { let uit = false; try { uit = mark ? mark.toon() : false; } catch { uit = false; } return sendResponse({ ok: true, data: { zichtbaar: uit } }); }
        // Alles hieronder leest of bedient de pagina: alleen met een slot, en alleen als het profiel van de pagina NU bij dat slot past.
        if (!isRuimte(message.ruimte)) return sendResponse({ ok: false, error: 'EXTENSIE_PROFIEL: no slot given' });
        if (!profielToegestaan(message.ruimte, huidigProfiel())) {
          return sendResponse({ ok: false, error: message.ruimte === 'technisch'
            ? 'EXTENSIE_PROFIEL: the tab is no longer in technical mode'
            : 'EXTENSIE_PROFIEL: the tab is in technical mode; a user-space AI never reads it' });
        }
        if (message.op === 'scroll') return sendResponse({ ok: true, data: scroll(message) });
        if (message.op === 'wait') return sendResponse({ ok: true, data: await waitForText(message) });
        if (message.op === 'select') return sendResponse({ ok: true, data: selectOption(message) });
        if (message.op === 'key') return sendResponse({ ok: true, data: pressKey(message) });
        if (message.op === 'snapshot') return sendResponse({ ok: true, data: await snapshot() });
        if (message.op === 'audit') return sendResponse({ ok: true, data: await audit(message) });
        if (message.op === 'invoke') return sendResponse({ ok: true, data: await invoke(message) });
        if (message.op === 'diagnostics') return sendResponse({ ok: true, data: await invoke({ action: 'get_diagnostics' }) });
        if (message.op === 'click') return sendResponse({ ok: true, data: click(message) });
        if (message.op === 'type') return sendResponse({ ok: true, data: type(message) });
        if (message.op === 'console') return sendResponse({ ok: true, data: consoleMessages(message) });
        if (message.op === 'network') return sendResponse({ ok: true, data: networkRequests(message) });
        if (message.op === 'hover') return sendResponse({ ok: true, data: hover(message) });
        if (message.op === 'fill_form') return sendResponse({ ok: true, data: fillForm(message) });
        return sendResponse({ ok: false, error: 'unknown operation' });
      } catch (err) { return sendResponse({ ok: false, error: String((err && err.message) || err).slice(0, 300) }); }
    })();
    return true;
  });
})();
