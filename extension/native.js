// Mijn Ruimte-extensie 0.6: OPTIONEEL tweede kanaal — een lokale AI-agent (MCP stdio op de pc van de beheerder) via Chrome
// Native Messaging (host com.tarasevych.mijnruimte, zie deploy/extensie-native/). Het hoofdkanaal blijft de WebSocket via de server.
//
// Regels (contract §7):
//  - verbinden alleen met de optionele permissie 'nativeMessaging' én een geldige ontgrendeling met lokaal === true;
//  - ALLEEN de zes leesopdrachten (eigen witte lijst hieronder); al het andere wordt geweigerd zonder voerUit aan te roepen;
//  - voerUit(type, params, 'lokaal') in background doet daarna ALLE controles (ontgrendeling, LOKAAL_CAPS, domeinen, profiel, account);
//  - 0.6: de lokale agent hoort bij precies één slot: het slot waarvan de ontgrendeling `lokaal` heeft (beide → technisch); status()
//    en voerUit() in background.js kiezen dat slot, native.js zelf weet niets van sloten;
//  - één opdracht tegelijk, hoogstens 30 per minuut, id volgens ID_RE, antwoord hoogstens 1 MB;
//  - naar de host gaan alleen {t:'status', staat, exp, caps} en {t:'vergrendeld'} — nooit sleutels, tokens of grant-handtekeningen.
//
// Gebruik in background.js:  const native = (await import('./native.js')).maakNative({ status, voerUit, opWijziging });
//   bij elke statuswijziging: await native.start()   (idempotent: verbindt, houdt open of sluit, afhankelijk van de toestand)
//   expliciet uitzetten:      native.stop()
//   in ExtStatus:             lokaal: native.info()  -> { toegestaan, verbonden }

export const NATIVE_HOST = 'com.tarasevych.mijnruimte';
/** Opdracht -> toegestane parameters (zelfde lijst als deploy/extensie-native/mr-native-gemeen.mjs). */
export const LOKAAL_OPDRACHTEN = Object.freeze({
  'browser.self_test': Object.freeze([]),
  'browser.snapshot': Object.freeze([]),
  'browser.diagnostics': Object.freeze([]),
  'browser.console': Object.freeze(['types']),
  'browser.network': Object.freeze(['failed_only']),
  'browser.audit': Object.freeze(['soort']),
});
export const LOKAAL_CAPS_NATIVE = Object.freeze(['browser.read']);
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_PER_MINUUT = 30;
export const MAX_ANTWOORD_BYTES = 1024 * 1024 - 1024; // ruimte voor {id, ok}
const MAX_PARAMS_BYTES = 2048;
const HERVERBIND_MS = [5_000, 30_000, 120_000];

const isLokaal = (t) => typeof t === 'string' && Object.prototype.hasOwnProperty.call(LOKAAL_OPDRACHTEN, t);
const bytes = (s) => new TextEncoder().encode(s).length;
const foutTekst = (e) => String((e && e.message) || e || 'fout').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);

/** Eigen controle van de parameters (background valideert daarna met valideerOpdracht). null = goed, anders fouttekst. */
export function controleerParams(type, params) {
  if (params === undefined || params === null) return null;
  if (typeof params !== 'object' || Array.isArray(params)) return 'params moet een object zijn';
  let json; try { json = JSON.stringify(params); } catch { return 'params niet leesbaar'; }
  if (bytes(json) > MAX_PARAMS_BYTES) return 'params te groot';
  const mag = LOKAAL_OPDRACHTEN[type];
  const vreemd = Object.keys(params).filter((k) => !mag.includes(k));
  return vreemd.length ? `onbekende parameter: ${vreemd.join(', ').slice(0, 60)}` : null;
}

/**
 * @param {{ status: () => any | Promise<any>, voerUit: (type: string, params: object, bron: 'lokaal') => Promise<any>, opWijziging?: () => void, nu?: () => number }} deps
 *   status()   -> ExtStatus (minstens { staat, ontgrendeling: { exp, caps, lokaal } | null })
 *   voerUit()  -> resolve met data of throw Error(bericht)
 */
export function maakNative({ status, voerUit, opWijziging = () => {}, nu = () => Date.now() }) {
  let poort = null;
  let hostKlaar = false;      // host meldde {t:'hallo', luistert:true}
  let clientVerbonden = false; // een lokale AI-agent heeft zich bij de host aangemeld
  let toegestaan = false;
  let bezig = false;
  let laatsteStatusTekst = '';
  let laatsteFout = '';
  let doorOnsGesloten = false;
  let pogingen = 0;
  let herverbindTimer = null;
  let startLoopt = null;
  let laatstePoging = -Infinity;
  const tijden = [];

  const chromeApi = () => globalThis.chrome;
  const wijziging = () => { try { opWijziging(); } catch { /* background zelf */ } };
  const post = (obj) => { if (!poort) return false; try { poort.postMessage(obj); return true; } catch { return false; } };

  async function heeftPermissie() {
    try { return (await chromeApi().permissions.contains({ permissions: ['nativeMessaging'] })) === true; } catch { return false; }
  }
  function geldigeLokaal(st) {
    const g = st && st.ontgrendeling;
    return !!(g && g.lokaal === true && typeof g.exp === 'number' && g.exp > nu() && Array.isArray(g.caps) && g.caps.some((c) => LOKAAL_CAPS_NATIVE.includes(c)));
  }
  function statusBericht(st) {
    const g = st && st.ontgrendeling;
    return { t: 'status', staat: String((st && st.staat) || 'vergrendeld'), exp: g && typeof g.exp === 'number' ? g.exp : null, caps: g && Array.isArray(g.caps) ? g.caps.filter((c) => LOKAAL_CAPS_NATIVE.includes(c)) : [] };
  }
  function stuurStatus(st) {
    const b = statusBericht(st);
    const tekst = JSON.stringify(b);
    if (tekst === laatsteStatusTekst) return;
    if (post(b)) laatsteStatusTekst = tekst;
  }

  function sluitPoort() {
    clearTimeout(herverbindTimer); herverbindTimer = null;
    if (!poort) return false;
    const p = poort;
    doorOnsGesloten = true;
    post({ t: 'vergrendeld' });
    poort = null; hostKlaar = false; clientVerbonden = false; bezig = false; laatsteStatusTekst = '';
    try { p.disconnect(); } catch { /* al dicht */ }
    return true;
  }

  function verbind() {
    let p;
    doorOnsGesloten = false;
    laatstePoging = nu();
    try { p = chromeApi().runtime.connectNative(NATIVE_HOST); }
    catch (e) { laatsteFout = foutTekst(e); planHerverbinden(); return; }
    poort = p; hostKlaar = false; clientVerbonden = false; laatsteStatusTekst = '';
    p.onMessage.addListener((m) => { if (poort === p) void bijBericht(m); });
    p.onDisconnect.addListener(() => {
      if (poort !== p) return;
      const le = chromeApi().runtime && chromeApi().runtime.lastError;
      laatsteFout = le ? foutTekst(le.message || le) : 'host gestopt';
      poort = null; hostKlaar = false; clientVerbonden = false; bezig = false; laatsteStatusTekst = '';
      wijziging();
      if (!doorOnsGesloten) planHerverbinden();
    });
    wijziging();
  }

  function planHerverbinden() {
    if (!toegestaan || herverbindTimer || pogingen >= HERVERBIND_MS.length) return;
    const wacht = HERVERBIND_MS[pogingen++];
    herverbindTimer = setTimeout(() => { herverbindTimer = null; void start(); }, wacht);
  }

  async function bijBericht(m) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return;
    if (m.t === 'hallo') {
      hostKlaar = m.luistert === true;
      if (hostKlaar) pogingen = 0; else laatsteFout = `host: ${String(m.fout || 'luistert niet').slice(0, 40)}`;
      try { stuurStatus(await status()); } catch { /* status later */ }
      wijziging();
      return;
    }
    if (m.t === 'client') { clientVerbonden = m.verbonden === true; wijziging(); return; }
    if (m.t !== undefined) return;
    const id = m.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) return; // geen geldig id: geen antwoord mogelijk
    const antwoord = (ok, x) => {
      if (ok) {
        let tekst; try { tekst = JSON.stringify({ id, ok: true, data: x === undefined ? null : x }); } catch { return post({ id, ok: false, error: 'LOKAAL_FOUT: antwoord niet serialiseerbaar' }); }
        if (bytes(tekst) > MAX_ANTWOORD_BYTES) return post({ id, ok: false, error: 'LOKAAL_TE_GROOT: het antwoord is groter dan 1 MB' });
        return post({ id, ok: true, data: x === undefined ? null : x });
      }
      return post({ id, ok: false, error: foutTekst(x) });
    };
    const t = nu();
    while (tijden.length && t - tijden[0] > 60_000) tijden.shift();
    if (tijden.length >= MAX_PER_MINUUT) return antwoord(false, `LOKAAL_TE_SNEL: hoogstens ${MAX_PER_MINUUT} opdrachten per minuut`);
    tijden.push(t);
    if (!isLokaal(m.type)) return antwoord(false, 'LOKAAL_GEWEIGERD: via de lokale agent alleen lezen (status, snapshot, diagnose, console, netwerk, audit)');
    const pf = controleerParams(m.type, m.params);
    if (pf) return antwoord(false, `LOKAAL_GEWEIGERD: ${pf}`);
    if (bezig) return antwoord(false, 'LOKAAL_BEZIG: er loopt al een opdracht; één tegelijk');
    bezig = true;
    try {
      const st = await status();
      if (!geldigeLokaal(st)) { antwoord(false, 'EXTENSIE_VERGRENDELD: de lokale agent is niet ontgrendeld (toegang op de site openen met «локальний агент»)'); return; }
      const data = await voerUit(m.type, { ...(m.params || {}) }, 'lokaal');
      antwoord(true, data);
    } catch (e) {
      antwoord(false, e);
    } finally { bezig = false; }
  }

  /** Idempotent: verbindt als het mag, sluit als het niet (meer) mag, stuurt de status als hij veranderde. */
  async function start() {
    if (startLoopt) return startLoopt;
    startLoopt = (async () => {
      let st = null;
      try { st = await status(); } catch { st = null; }
      const mag = geldigeLokaal(st) && (await heeftPermissie());
      const was = toegestaan;
      toegestaan = mag;
      if (!mag) {
        pogingen = 0;
        if (sluitPoort() || was) wijziging();
        return info();
      }
      if (!was) pogingen = 0;
      // Na mislukte pogingen (host niet geïnstalleerd?) hoogstens één nieuwe poging per minuut vanuit start().
      if (!poort && !herverbindTimer && (!was || nu() - laatstePoging > 60_000)) verbind();
      if (poort && hostKlaar) stuurStatus(st);
      if (!was) wijziging();
      return info();
    })();
    try { return await startLoopt; } finally { startLoopt = null; }
  }

  function stop() {
    const was = toegestaan || !!poort;
    toegestaan = false; pogingen = 0;
    if (sluitPoort() || was) wijziging();
    return info();
  }

  /** toegestaan = permissie + grant.lokaal; verbonden = er is een lokale AI-agent aangemeld; host = de host draait. */
  function info() { return { toegestaan, verbonden: !!(poort && hostKlaar && clientVerbonden), host: !!(poort && hostKlaar), fout: laatsteFout || null }; }

  return { start, stop, info };
}
