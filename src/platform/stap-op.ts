// Step-up («Підтвердіть доступ» / «Toegang bevestigen»). De server antwoordt 403 STEP_UP_REQUIRED bij gevoelige acties
// (passkey toevoegen, herstelcodes, beheeracties, export…). client.ts vraagt dan hier om bevestiging; daarna wordt het verzoek
// één keer herhaald. Geen window.prompt/confirm/alert meer: een eigen venster zoals GitHub «Confirm access» (sudo mode), in één
// taal (de taal van de pagina), met alleen de manieren die deze gebruiker echt heeft: passkey, code uit de authenticator-app,
// herstelcode en altijd opnieuw inloggen bij Google (prompt=select_account, max_age=0; RUNBOOK §13.8). Na een geslaagde bevestiging geldt die 5 minuten
// voor deze sessie (backend/stap-op.ts).
//
// Hervatten na Google: Google verlaat de pagina. Vóór het doorsturen bewaren we in sessionStorage alleen WAT de gebruiker wilde
// doen (bijv. {actie:'passkey-toevoegen', gegevens:{naam:'Telefoon'}}) — nooit geheimen of codes. Na terugkeer haalt de pagina die
// intentie op (neemHervat) en voert de actie zelf opnieuw uit; de server controleert de step-up zoals altijd.
import { foutCode, kanPasskey, passkeyBevestigen, type AssertieOpties } from './webauthn';

export type StapOpMethode = 'passkey' | 'totp' | 'herstelcode' | 'google';
export type HervatIntentie = { actie: string; gegevens?: Record<string, string | number | boolean> };
export type StapOpUitkomst = { ok: true; methode: StapOpMethode; code?: string } | { ok: false; reden?: string };
type Post = (url: string, data: unknown) => Promise<unknown>;

const SERVICES = new Set(['hub', 'ai', 'mail', 'cloud', 'github', 'huis', 'identity', 'api', 'admin', 'mcp']);
export const HERVAT_SLEUTEL = 'mijn-ruimte-bevestig-hervat';
export const HERVAT_MAX_MS = 10 * 60 * 1000;
type Opgeslagen = HervatIntentie & { pad: string; at: number };

/** Taal van de pagina (App/UnifiedServiceApp zetten <html lang>). Nooit beide talen tegelijk. */
export const paginaTaal = (): 'uk' | 'nl' => (typeof document !== 'undefined' && document.documentElement.lang === 'nl' ? 'nl' : 'uk');

/** Leesbare uitleg voor een STEP_UP_REQUIRED-fout (voor meldingen in de app), in de taal van de pagina. */
export const stapOpUitleg = () => (paginaTaal() === 'nl'
  ? 'Voor deze actie is een bevestiging nodig. Probeer het opnieuw.'
  : 'Для цієї дії потрібне підтвердження. Спробуйте ще раз.');

// ------------------------------------------------------------------------------------------------ uitkomst na Google
// Mislukt de Google-step-up (ander account, geen verse bevestiging…), dan zet de callback-pagina de reden hier neer en
// stuurt terug naar de pagina. Het venster toont die reden dan meteen, in plaats van stil opnieuw te openen.
export const STAP_OP_FOUT_SLEUTEL = 'mijn-ruimte-stap-op-fout';
const REDEN = /^[A-Z][A-Z0-9_]{2,60}$/;
export function bewaarStapOpFout(reden: string) {
  try { sessionStorage.setItem(STAP_OP_FOUT_SLEUTEL, JSON.stringify({ reden: REDEN.test(reden) ? reden : 'GOOGLE_CALLBACK_FAILED', at: Date.now() })); } catch { /* negeren */ }
}
export function neemStapOpFout(): string {
  try {
    const raw = sessionStorage.getItem(STAP_OP_FOUT_SLEUTEL);
    if (!raw) return '';
    sessionStorage.removeItem(STAP_OP_FOUT_SLEUTEL);
    const r = JSON.parse(raw) as { reden?: string; at?: number };
    return r && typeof r.at === 'number' && Date.now() - r.at < HERVAT_MAX_MS && REDEN.test(String(r.reden || '')) ? String(r.reden) : '';
  } catch { return ''; }
}
let terugVanGoogle = false;
/** Voor het venster: waarom vragen we opnieuw? Eenmalig: de bewaarde reden, of — als we net van Google terug zijn en de
 * server tóch opnieuw om bevestiging vraagt — STEP_UP_GOOGLE_NIET_BEVESTIGD. '' = gewoon openen. */
export function neemTerugMelding(): string {
  const f = neemStapOpFout();
  const terug = terugVanGoogle; terugVanGoogle = false;
  return f || (terug ? 'STEP_UP_GOOGLE_NIET_BEVESTIGD' : '');
}

// ------------------------------------------------------------------------------------------------ hervatten
let lopende: HervatIntentie | null = null;
/** Voer fn uit met een hervat-intentie: vraagt de server tussendoor om step-up en kiest de gebruiker Google, dan wordt die bewaard. */
export async function metHervat<T>(intentie: HervatIntentie, fn: () => Promise<T>): Promise<T> {
  const vorige = lopende; lopende = intentie;
  try { return await fn(); } finally { lopende = vorige; }
}
const huidigPad = () => `${location.pathname}${location.search}`;
const schoon = (g?: HervatIntentie['gegevens']) => Object.fromEntries(Object.entries(g || {})
  .filter(([k, v]) => /^[a-z][a-zA-Z0-9]{0,30}$/.test(k) && (typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && v.length <= 120)))
  .slice(0, 8));
export function bewaarHervat(intentie: HervatIntentie | null) {
  try {
    const actie = /^[a-z][a-z0-9-]{0,40}$/.test(intentie?.actie || '') ? intentie!.actie : '';
    const rij: Opgeslagen = { actie, gegevens: schoon(intentie?.gegevens), pad: huidigPad(), at: Date.now() };
    sessionStorage.setItem(HERVAT_SLEUTEL, JSON.stringify(rij));
  } catch { /* sessionStorage niet beschikbaar: dan alleen geen automatische hervatting */ }
}
function leesHervat(): Opgeslagen | null {
  try {
    const raw = sessionStorage.getItem(HERVAT_SLEUTEL);
    if (!raw) return null;
    const r = JSON.parse(raw) as Opgeslagen;
    if (!r || typeof r.at !== 'number' || Date.now() - r.at > HERVAT_MAX_MS || Date.now() < r.at - 60_000) { sessionStorage.removeItem(HERVAT_SLEUTEL); return null; }
    return r;
  } catch { return null; }
}
/** Na terugkeer van Google: de bewaarde intentie voor deze actie op deze pagina (eenmalig). */
export function neemHervat(actie: string): HervatIntentie | null {
  const r = leesHervat();
  if (!r || r.actie !== actie || r.pad.split('?')[0] !== location.pathname) return null;
  try { sessionStorage.removeItem(HERVAT_SLEUTEL); } catch { /* negeren */ }
  terugVanGoogle = true;
  return { actie: r.actie, gegevens: r.gegevens || {} };
}
/** Algemene terugkeer (geen bekende actie): eenmalig een korte melding «Доступ підтверджено — повторіть дію». */
export function neemAlgemeneHervat(): boolean {
  const r = leesHervat();
  if (!r || r.actie || r.pad.split('?')[0] !== location.pathname) return false;
  try { sessionStorage.removeItem(HERVAT_SLEUTEL); } catch { /* negeren */ }
  return true;
}

// ------------------------------------------------------------------------------------------------ passkey
/** Step-up met een eigen passkey. Geeft '' bij succes, anders een foutcode (NotAllowedError, GEEN_PASSKEY, PASSKEY_…). */
export async function passkeyStapOpCode(service: string, tabContext: string, post: Post): Promise<string> {
  if (!kanPasskey()) return 'GEEN_WEBAUTHN';
  let opties: { uitdagingId: string; publicKey: AssertieOpties };
  try { opties = ((await post('/api/owner/access/stap-op/passkey/opties', { service, tabContext })) as { data: typeof opties }).data; }
  catch (c) { return foutCode(c) || 'NETWORK_ERROR'; }
  try {
    const assertie = await passkeyBevestigen(opties.publicKey);
    await post('/api/owner/access/stap-op/passkey', { service, tabContext, uitdagingId: opties.uitdagingId, assertie });
    return '';
  } catch (c) { return foutCode(c) || 'PASSKEY_FOUT'; }
}
/** Oude naam (zonder dialoog): true = bevestigd. */
export async function passkeyStapOp(service: string, tabContext: string, post: Post): Promise<boolean> {
  return (await passkeyStapOpCode(service, tabContext, post)) === '';
}

// ------------------------------------------------------------------------------------------------ venster
export type BevestigOpties = {
  service: string; tabContext: string; post: Post;
  /** Welke manieren hier gelden (standaard alle vier). Bijv. herstelcodes vervangen met TOTP: alleen passkey of de TOTP-code. */
  toegestaan?: StapOpMethode[];
  /** true: een TOTP-/herstelcode niet naar /stap-op sturen maar teruggeven (de actie zelf controleert de code). */
  codeTerug?: boolean;
  hervat?: HervatIntentie | null;
};
/** Toon «Підтвердіть доступ». Kiest de gebruiker Google, dan verlaat de pagina zich en is de uitkomst {ok:false, reden:'google'}. */
export async function bevestigToegang(opties: BevestigOpties): Promise<StapOpUitkomst> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return { ok: false };
  const { toonBevestigVenster } = await import('./bevestig-toegang');
  return toonBevestigVenster(opties);
}

/** Door client.ts bij 403 STEP_UP_REQUIRED. true = bevestigd (verzoek mag één keer opnieuw). */
export async function stapOpVragen(body: unknown, post: Post): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const service = String(b.service || ''), tabContext = String(b.tabContext || '');
  if (!SERVICES.has(service) || !tabContext) return false;
  const uit = await bevestigToegang({ service, tabContext, post, hervat: lopende });
  if (!uit.ok && uit.reden === 'VENSTER_FOUT') throw new Error('VENSTER_FOUT');
  return uit.ok;
}
