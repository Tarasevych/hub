// Tellers voor 404/401 (en 403) per routegroep (29.10.2026). Aanleiding: «Технічні модулі не завантажено» — elke /assets/tech/* gaf 404,
// maar de grafieken op admin.* telden alleen gebruikers, sessies, gebeurtenissen en diensten; de storing was nergens te zien.
// Alleen in het geheugen van het serverproces (per uur, 48 uur), geen paden, geen IP, geen gebruikers: alleen aantallen per groep.
// Het beheeroverzicht neemt ze op in de momentopnamen (backend/beheer-overzicht-momentopnamen.ts) en toont ze als grafiek.
// Na een herstart van de dienst beginnen de tellers opnieuw (dat staat zo in de uitleg op de pagina).

export const ROUTEGROEPEN = ['tech-bundels', 'tech-api', 'beheer-api', 'api', 'paginas', 'tech-melding'] as const;
export type Routegroep = (typeof ROUTEGROEPEN)[number];
export type GroepTelling = { n404: number; n401: number; n403: number };
export type Telling = Record<Routegroep, GroepTelling>;

const UUR = 3_600_000;
const BEWAAR_UREN = 48;
const leeg = (): Telling => Object.fromEntries(ROUTEGROEPEN.map((g) => [g, { n404: 0, n401: 0, n403: 0 }])) as Telling;
const perUur = new Map<number, Telling>();

/** PUUR: in welke groep valt dit pad? */
export function routegroep(pad: string): Routegroep {
  if (pad.startsWith('/assets/tech/')) return 'tech-bundels';
  if (pad.startsWith('/api/owner/tech/') || pad.startsWith('/api/owner/tech-')) return 'tech-api';
  if (pad.startsWith('/api/owner/admin/') || pad.startsWith('/api/owner/uitrol') || pad.startsWith('/api/owner/besluit/') || pad.startsWith('/api/mcp/server/')) return 'beheer-api';
  if (pad.startsWith('/api/')) return 'api';
  return 'paginas';
}

/** Eén antwoord tellen (alleen 401, 403 en 404). */
export function telStatus(pad: string, status: number, nu = Date.now(), groep?: Routegroep) {
  if (status !== 404 && status !== 401 && status !== 403) return;
  const emmer = Math.floor(nu / UUR);
  let t = perUur.get(emmer);
  if (!t) {
    t = leeg(); perUur.set(emmer, t);
    for (const k of perUur.keys()) if (k < emmer - BEWAAR_UREN) perUur.delete(k);
  }
  const g = t[groep ?? routegroep(pad)];
  if (status === 404) g.n404++; else if (status === 401) g.n401++; else g.n403++;
}

/** Melding van de pagina «Технічні модулі не завантажено» (POST /api/storing/tech-bundel): telt als 404 in de groep tech-melding. */
export const telTechMelding = (nu = Date.now()) => telStatus('', 404, nu, 'tech-melding');

const optellen = (a: Telling, b: Telling) => { for (const g of ROUTEGROEPEN) { a[g].n404 += b[g].n404; a[g].n401 += b[g].n401; a[g].n403 += b[g].n403; } return a; };

/** Telling van één uur (emmer = floor(t / uur)); leeg als er niets was. */
export function tellingUur(emmer: number): Telling { return optellen(leeg(), perUur.get(emmer) || leeg()); }
/** Som van de uren vanaf `vanEmmer` t/m `totEmmer`. */
export function tellingBereik(vanEmmer: number, totEmmer: number): Telling {
  const uit = leeg();
  for (const [k, t] of perUur) if (k >= vanEmmer && k <= totEmmer) optellen(uit, t);
  return uit;
}
/** Live stand: dit uur en de laatste 24 uur. */
export function tellerStand(nu = Date.now()) {
  const e = Math.floor(nu / UUR);
  return { ditUur: tellingUur(e), laatste24: tellingBereik(e - 23, e), sindsStart: procesStart };
}
export const totaal = (t: Telling) => ROUTEGROEPEN.reduce((s, g) => ({ n404: s.n404 + t[g].n404, n401: s.n401 + t[g].n401 + t[g].n403 }), { n404: 0, n401: 0 });
const procesStart = new Date().toISOString();
/** Voor tests. */
export const _tellersLeeg = () => perUur.clear();

/** Inhoud van POST /api/storing/tech-bundel → soort (alleen hoofdletters en _), voor het journaal. */
export function meldingSoort(body: string): string {
  try { const j = JSON.parse(body || '{}') as { soort?: unknown }; if (typeof j.soort === 'string' && /^[A-Z_]{3,40}$/.test(j.soort)) return j.soort; } catch { /* geen JSON */ }
  return 'ONBEKEND';
}

/** POST /api/storing/tech-bundel: tellen en één regel in het journaal (geen IP, geen gebruiker). */
export function techMeldingVerwerken(body: string, host: string): { ok: true } {
  telTechMelding();
  console.error(`[storing] technische onderdelen niet geladen: ${meldingSoort(body)} host=${String(host).slice(0, 60)}`);
  return { ok: true };
}
