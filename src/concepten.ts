// Menu v2 fase B1 — versleutelde concepten (RISICO, standaard UIT; aan te zetten in Налаштування → Меню).
// Velden met `data-concept="<naam>"` (alleen <textarea> en tekstvelden, NOOIT wachtwoord-/code-/verborgen velden) worden tijdens
// het typen versleuteld in deze browser bewaard en na herladen/terugkomen teruggezet, met een melding «Чернетку відновлено»
// (knop «Відкинути»). Een leeg veld (bijv. na verzenden) wist het concept.
// Versleuteling: AES-GCM 256 met een NIET-exporteerbare sleutel per account (WebCrypto), bewaard in IndexedDB van dit onderdeel.
// Bewaard: alleen ciphertext + IV + tijdstip, onder een SHA-256-afgeleide van het account-id (niet het id zelf). Max. 7 dagen,
// max. 20 000 tekens per veld, max. 50 concepten. Alleen voor een goedgekeurd account. Instelling uit → alle concepten en sleutels weg.
// Beperking (eerlijk): beschermt tegen meelezen van opslag/back-ups en tegen een ánder account in dezelfde browser, niet tegen
// iemand die als dít account in deze browser is aangemeld (die kan het veld toch al zien).
import { emitCanonicalNotice } from './canoniek-meldingen';
import { leesCacheAccountId } from './lees-cache';
import { abonneerZijbalk, zijbalkVoorkeuren } from './zijbalk-voorkeuren';

const DB = 'tsv-concepten', VERSIE = 1, SLEUTELS = 'sleutels', CONCEPTEN = 'concepten';
const MAX_LEEFTIJD = 7 * 24 * 3600_000, MAX_TEKENS = 20000, MAX_AANTAL = 50, WACHT_MS = 600;
const NAAM = /^[a-z0-9][a-z0-9-]{1,40}$/;
type Rij = { id: string; account: string; iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer; op: number };

const aan = () => zijbalkVoorkeuren().snelheid.concepten && !!leesCacheAccountId() && typeof indexedDB !== 'undefined' && !!globalThis.crypto?.subtle;
const taal = () => (document.documentElement.lang === 'nl' ? 'nl' : 'uk');

/** Mag dit element een concept hebben? Alleen tekstachtige velden met een geldige naam. */
export function conceptVeld(el: Element | null): el is HTMLTextAreaElement | HTMLInputElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  const naam = el.getAttribute('data-concept') || '';
  if (!NAAM.test(naam)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return ['text', 'search', 'url', 'email', ''].includes(el.type) && !/one-time-code|password/i.test(el.autocomplete || '');
  return false;
}

// ------------------------------------------------------------------------------------------------ IndexedDB
let dbBelofte: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbBelofte) return dbBelofte;
  dbBelofte = new Promise((ok, fout) => {
    const r = indexedDB.open(DB, VERSIE);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(SLEUTELS)) d.createObjectStore(SLEUTELS, { keyPath: 'id' }); if (!d.objectStoreNames.contains(CONCEPTEN)) d.createObjectStore(CONCEPTEN, { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => { dbBelofte = null; fout(r.error); };
  });
  return dbBelofte;
}
const tx = async <T>(store: string, modus: IDBTransactionMode, doe: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const d = await open();
  return new Promise((ok, fout) => { const t = d.transaction(store, modus); const r = doe(t.objectStore(store)); r.onsuccess = () => ok(r.result); r.onerror = () => fout(r.error); });
};

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const accountSleutels = new Map<string, Promise<{ acc: string; key: CryptoKey }>>();
async function accountSleutel(): Promise<{ acc: string; key: CryptoKey }> {
  const id = leesCacheAccountId();
  let p = accountSleutels.get(id);
  if (!p) {
    p = (async () => {
      const acc = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tsv-concept|${id}`))).slice(0, 32);
      const bestaand = await tx<{ id: string; key: CryptoKey } | undefined>(SLEUTELS, 'readonly', (s) => s.get(acc));
      if (bestaand?.key) return { acc, key: bestaand.key };
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await tx(SLEUTELS, 'readwrite', (s) => s.put({ id: acc, key }));
      return { acc, key };
    })();
    p.catch(() => accountSleutels.delete(id));
    accountSleutels.set(id, p);
  }
  return p;
}
const conceptId = (acc: string, naam: string) => `${acc}|${location.host}|${naam}`;

export async function conceptBewaren(naam: string, tekst: string) {
  if (!aan() || !NAAM.test(naam)) return;
  const { acc, key } = await accountSleutel();
  const id = conceptId(acc, naam);
  if (!tekst.trim()) { await tx(CONCEPTEN, 'readwrite', (s) => s.delete(id)); return; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(id) }, key, new TextEncoder().encode(tekst.slice(0, MAX_TEKENS)));
  await tx(CONCEPTEN, 'readwrite', (s) => s.put({ id, account: acc, iv, data, op: Date.now() } satisfies Rij));
  await opruimenOud();
}
export async function conceptLezen(naam: string): Promise<{ tekst: string; op: number } | null> {
  if (!aan() || !NAAM.test(naam)) return null;
  const { acc, key } = await accountSleutel();
  const id = conceptId(acc, naam);
  const r = await tx<Rij | undefined>(CONCEPTEN, 'readonly', (s) => s.get(id));
  if (!r || r.account !== acc) return null;
  if (Date.now() - r.op > MAX_LEEFTIJD) { await tx(CONCEPTEN, 'readwrite', (s) => s.delete(id)); return null; }
  try {
    const tekst = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv, additionalData: new TextEncoder().encode(id) }, key, r.data));
    return { tekst, op: r.op };
  } catch { await tx(CONCEPTEN, 'readwrite', (s) => s.delete(id)); return null; } // gemanipuleerd of andere sleutel: weg
}
export async function conceptWissen(naam: string) { if (!NAAM.test(naam) || !leesCacheAccountId()) return; try { const { acc } = await accountSleutel(); await tx(CONCEPTEN, 'readwrite', (s) => s.delete(conceptId(acc, naam))); } catch { /* niets */ } }
async function opruimenOud() {
  const alle = await tx<Rij[]>(CONCEPTEN, 'readonly', (s) => s.getAll() as IDBRequest<Rij[]>);
  const nu = Date.now(), weg = alle.filter((r) => nu - r.op > MAX_LEEFTIJD).map((r) => r.id);
  const rest = alle.filter((r) => nu - r.op <= MAX_LEEFTIJD).sort((a, b) => b.op - a.op);
  weg.push(...rest.slice(MAX_AANTAL).map((r) => r.id));
  for (const id of weg) await tx(CONCEPTEN, 'readwrite', (s) => s.delete(id));
}
/** Instelling uit (of op verzoek): alle concepten én sleutels van dit onderdeel in deze browser weg. */
export async function alleConceptenWissen() {
  accountSleutels.clear();
  try { await tx(CONCEPTEN, 'readwrite', (s) => s.clear()); await tx(SLEUTELS, 'readwrite', (s) => s.clear()); } catch { /* geen IndexedDB */ }
}
/** IDENTITEIT-013: кількість збережених чернеток для діалогу «буде видалено N»; -1, якщо сховища немає. */
export const conceptAantal = (): Promise<number> => __conceptAantal();
export async function __conceptAantal() { try { return (await tx<number>(CONCEPTEN, 'readonly', (s) => s.count())); } catch { return -1; } }

// ------------------------------------------------------------------------------------------------ velden koppelen
const zetWaarde = (el: HTMLTextAreaElement | HTMLInputElement, v: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v); // via de native setter, zodat React het als invoer ziet
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const wachtend = new WeakMap<Element, number>();
const bekeken = new WeakSet<Element>();
async function herstel(el: HTMLTextAreaElement | HTMLInputElement) {
  if (bekeken.has(el)) return; bekeken.add(el);
  const naam = el.getAttribute('data-concept') || '';
  let c: { tekst: string; op: number } | null = null;
  try { c = await conceptLezen(naam); } catch { return; }
  if (!c || !el.isConnected || el.value || el.disabled || el.readOnly) return;
  zetWaarde(el, c.tekst);
  el.dataset.conceptHersteld = '1';
  const nl = taal() === 'nl';
  emitCanonicalNotice({ kind: 'info', source: 'concepten', text: nl ? 'Concept hersteld (versleuteld bewaard in deze browser).' : 'Чернетку відновлено (зберігалася зашифрованою в цьому браузері).',
    action: { label: nl ? 'Weggooien' : 'Відкинути', onAction: () => { if (el.isConnected) zetWaarde(el, ''); void conceptWissen(naam); } } });
}
function scan(root: ParentNode) {
  if (!aan()) return;
  const lijst = root instanceof Element && root.matches('[data-concept]') ? [root] : [];
  lijst.push(...Array.from(root.querySelectorAll?.('[data-concept]') || []));
  for (const el of lijst) if (conceptVeld(el)) void herstel(el);
}
let geinstalleerd = false, waarnemer: MutationObserver | null = null, wasAan = false;
export function installeerConcepten() {
  if (geinstalleerd || typeof document === 'undefined') return; geinstalleerd = true;
  document.addEventListener('input', (e) => {
    const el = e.target as Element | null;
    if (!conceptVeld(el) || !aan()) return;
    window.clearTimeout(wachtend.get(el));
    const naam = el.getAttribute('data-concept') || '', waarde = el.value;
    if (!waarde) { void conceptWissen(naam); return; }
    wachtend.set(el, window.setTimeout(() => { void conceptBewaren(naam, waarde).catch(() => undefined); }, WACHT_MS));
  }, true);
  const start = () => { if (waarnemer || !document.body) return; waarnemer = new MutationObserver((m) => { for (const r of m) for (const n of Array.from(r.addedNodes)) if (n instanceof Element) scan(n); }); waarnemer.observe(document.body, { childList: true, subtree: true }); scan(document.body); };
  const volg = () => {
    const nu = aan();
    if (nu && !wasAan) start();
    if (!nu && waarnemer) { waarnemer.disconnect(); waarnemer = null; }
    if (!zijbalkVoorkeuren().snelheid.concepten && wasAanIngesteld) void alleConceptenWissen();
    wasAanIngesteld = zijbalkVoorkeuren().snelheid.concepten;
    wasAan = nu;
  };
  let wasAanIngesteld = zijbalkVoorkeuren().snelheid.concepten;
  if (!wasAanIngesteld) { try { indexedDB.deleteDatabase(DB); } catch { /* geen IndexedDB */ } } // uit → geen restanten in deze browser
  abonneerZijbalk(volg);
  volg();
}
