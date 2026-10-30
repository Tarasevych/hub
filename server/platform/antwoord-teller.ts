// Tellers van antwoorden in emmers van 10 s (laatste 30 min, alleen in het geheugen, geen id's of inhoud).
// Voor de zekering van de beschermingen (backend/beveiliging-schakelaars.ts): na het aanzetten van auth-poort, OPA-afdwingen of RLS
// kijkt die 10 minuten of 5xx, 403, 401 van de poort, «OPA onbereikbaar» of RLS-fouten (42501) plots pieken.
// Router (alle antwoorden en onverwachte fouten), auth-poort (401 van het vangnet) en beleid (BELEID_ONBEREIKBAAR) tellen hier.
export type TelSoort = 'totaal' | '5xx' | '403' | 'poort401' | 'opa' | 'rls';
export const SOORTEN: readonly TelSoort[] = ['totaal', '5xx', '403', 'poort401', 'opa', 'rls'];
const EMMER_MS = 10_000;
const BEWAAR = 180; // 30 minuten
type Emmer = Record<TelSoort, number>;
const emmers = new Map<number, Emmer>();
const leeg = (): Emmer => ({ totaal: 0, '5xx': 0, '403': 0, poort401: 0, opa: 0, rls: 0 });

export function tel(soort: TelSoort, n = 1, nu = Date.now()): void {
  const k = Math.floor(nu / EMMER_MS);
  let e = emmers.get(k);
  if (!e) {
    e = leeg(); emmers.set(k, e);
    if (emmers.size > BEWAAR + 5) for (const oud of [...emmers.keys()]) if (oud < k - BEWAAR) emmers.delete(oud);
  }
  e[soort] += n;
}

// Bewaker (de zekering): hoogstens elke 15 s na een antwoord, buiten het verzoek om. Zonder verkeer geen piek, dus geen timer nodig.
let bewaker: ((nu: number) => Promise<unknown> | unknown) | null = null;
let laatsteBewaking = 0;
export function registreerBewaker(fn: (nu: number) => Promise<unknown> | unknown): void { bewaker = fn; }

/** Eén antwoord van de router. */
export function telAntwoord(status: number, nu = Date.now()): void {
  tel('totaal', 1, nu);
  if (status >= 500) tel('5xx', 1, nu);
  else if (status === 403) tel('403', 1, nu);
  if (bewaker && nu - laatsteBewaking >= 15_000) {
    laatsteBewaking = nu;
    const fn = bewaker;
    setImmediate(() => { try { void Promise.resolve(fn(Date.now())).catch(() => undefined); } catch { /* nooit het verzoek raken */ } });
  }
}

/** Onverwachte fout in een route: 500, en een RLS-weigering (Postgres 42501 «row-level security») apart. */
export function telFout(err: unknown, nu = Date.now()): void {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (e && (e.code === '42501' || /row-level security/i.test(String(e.message || '')))) tel('rls', 1, nu);
}

/** Som per soort over [vanaf, tot). */
export function som(vanaf: number, tot = Date.now()): Emmer {
  const uit = leeg();
  const a = Math.floor(vanaf / EMMER_MS), b = Math.floor((tot - 1) / EMMER_MS);
  for (const [k, e] of emmers) if (k >= a && k <= b) for (const s of SOORTEN) uit[s] += e[s];
  return uit;
}
export const _tellerLeeg = () => { emmers.clear(); laatsteBewaking = 0; };
