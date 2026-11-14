// SEC-002 extensie-06: de Chrome-debugger blijft alleen bruikbaar zolang het tabblad op een administratieve host van de eigen
// site staat. Zuivere hulpfuncties (geen chrome.*), zodat tests/eenheid/sec-002-g10b-20261112.test.ts ze los kan nalopen.
//
// Waarom: humanAttach() controleert het adres één keer, vlak voor het aanhaken. Navigeert het tabblad daarna (klik op een
// extern adres, «terug» in de geschiedenis), dan bleef de debugger hangen: diepe diagnose gaf netwerkadressen, consolefouten en
// uitzonderingen van de VREEMDE site terug, en evaluate_script kon in een race in het vreemde document draaien. Nu:
//   - debugAdresMag(url, domeinen): https, host ∈ ADMIN_HOSTS_TOEGESTAAN (ruimte 'technisch') én ∈ de domeinen van de ontgrendeling;
//   - contextWacht(domeinen): onthoudt welke uitvoeringscontexten (Runtime) en welke verzoeken (Network) bij een toegestaan
//     document horen; gebeurtenissen van alle andere worden niet gebruikt. Na een navigatie van het hoofdframe
//     (Runtime.executionContextsCleared) telt alleen wat daarna opnieuw op een toegestane host ontstaat.
import { DIAG_RUIMTE, adresInRuimte } from './shared.js';

/** Mag de debugger (nog) aan een tabblad met dit adres hangen? */
export function debugAdresMag(url, domeinen) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:' && adresInRuimte(DIAG_RUIMTE, u.href, Array.isArray(domeinen) ? domeinen : []);
  } catch { return false; }
}

/** Bewaker van één debuggersessie op één tabblad. `gebeurtenis` geeft true als de CDP-gebeurtenis gebruikt mag worden. */
export function contextWacht(domeinen) {
  const contexten = new Map(); // contextId → frameId (alleen contexten met een toegestane oorsprong)
  const verzoeken = new Set(); // requestId's van toegestane documenten
  const ctxMag = (id) => contexten.has(Number(id));
  return {
    gebeurtenis(method, p) {
      const x = p && typeof p === 'object' ? p : {};
      switch (method) {
        case 'Runtime.executionContextCreated': {
          const c = x.context || {};
          if (Number.isInteger(c.id) && debugAdresMag(`${String(c.origin || '')}/`, domeinen)) {
            contexten.set(c.id, { frameId: String((c.auxData && c.auxData.frameId) || ''), standaard: !!(c.auxData && c.auxData.isDefault) });
            return true;
          }
          return false;
        }
        case 'Runtime.executionContextDestroyed': contexten.delete(Number(x.executionContextId)); return false;
        case 'Runtime.executionContextsCleared': contexten.clear(); verzoeken.clear(); return false;
        case 'Runtime.consoleAPICalled': return ctxMag(x.executionContextId);
        case 'Runtime.exceptionThrown': return ctxMag(x.exceptionDetails && x.exceptionDetails.executionContextId);
        case 'Network.requestWillBeSent':
          if (debugAdresMag(x.documentURL, domeinen)) { verzoeken.add(String(x.requestId)); return true; }
          return false;
        case 'Network.responseReceived': case 'Network.loadingFinished': case 'Network.loadingFailed': {
          const ok = verzoeken.has(String(x.requestId));
          if (ok && method !== 'Network.responseReceived') verzoeken.delete(String(x.requestId));
          return ok;
        }
        default: return false;
      }
    },
    /** De standaardcontext van het hoofdframe, als die op een toegestane host draait; anders null. */
    hoofdContext(frameId) {
      for (const [id, c] of contexten) if (c.standaard && c.frameId === String(frameId || '')) return id;
      return null;
    },
  };
}
