// KLUIS-APPARAAT-001 (0206) — de browserhelft van «пам'ятати цей пристрій» voor de sleutelkluis.
//
// Wat hier bewaard wordt: X = DEK ⊕ S (hex), versleuteld met AES-256-GCM onder een NIET-EXPORTEERBARE CryptoKey die alleen in
// IndexedDB van dit origin leeft. Geen enkele code (ook deze niet) kan die sleutel uitlezen; hij kan alleen in deze browser gebruikt
// worden. De server heeft S; geen van beide helften opent de gegevens alleen (zie migrations/0206_sleutelkluis_apparaat.sql).
// Що тут зберігається: лише зашифрована половина X; ключ браузера не експортується, сервер його ніколи не бачить.
//
// Alles faalt stil (privévenster, geblokkeerde opslag, oude browser): dan is er gewoon geen geheugen en vraagt de pagina de knop.

const DB = 'mijn-ruimte-sleutelkluis';
const STORE = 'apparaat';
const VERSIE = 1;

export type ApparaatRecord = { apparaatId: string; ruimte: 'prive' | 'technisch'; sleutel: CryptoKey; iv: Uint8Array<ArrayBuffer>; ct: Uint8Array<ArrayBuffer>; opgeslagenOp: number };

const kan = () => typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

function openDb(): Promise<IDBDatabase> {
  return new Promise((ok, nee) => {
    const r = indexedDB.open(DB, VERSIE);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'apparaatId' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => nee(r.error);
    r.onblocked = () => nee(new Error('IDB_BLOCKED'));
  });
}
async function metStore<T>(modus: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((ok, nee) => {
      const tx = db.transaction(STORE, modus);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => nee(req.error);
    });
  } finally { db.close(); }
}
const aad = (apparaatId: string, ruimte: string) => enc.encode(`mijn-ruimte-kluis-apparaat|${apparaatId}|${ruimte}`);

/** X (hex) bewaren onder een nieuwe, niet-exporteerbare sleutel. Geeft false als de browser het niet kan. */
export async function apparaatBewaren(apparaatId: string, ruimte: 'prive' | 'technisch', deelHex: string): Promise<boolean> {
  if (!kan() || !/^[0-9a-f]{64}$/i.test(deelHex)) return false;
  try {
    const sleutel = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(apparaatId, ruimte) }, sleutel, enc.encode(deelHex)));
    // Alleen één record per ruimte op dit apparaat: een ouder record van dezelfde ruimte gaat weg.
    for (const r of await apparaatRecords()) if (r.ruimte === ruimte && r.apparaatId !== apparaatId) await apparaatVergetenLokaal(r.apparaatId);
    await metStore('readwrite', (s) => s.put({ apparaatId, ruimte, sleutel, iv, ct, opgeslagenOp: Date.now() } satisfies ApparaatRecord));
    return true;
  } catch { return false; }
}
export async function apparaatRecords(): Promise<ApparaatRecord[]> {
  if (!kan()) return [];
  try { return ((await metStore('readonly', (s) => s.getAll())) as ApparaatRecord[]) || []; } catch { return []; }
}
/** X openen voor één van de apparaat-id's die de server nog kent; null als dit apparaat er geen heeft. */
export async function apparaatDeel(bekendeIds: readonly string[], ruimte: 'prive' | 'technisch'): Promise<{ apparaatId: string; deel: string } | null> {
  for (const r of await apparaatRecords()) {
    if (r.ruimte !== ruimte || !bekendeIds.includes(r.apparaatId)) continue;
    try {
      const deel = dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: r.iv, additionalData: aad(r.apparaatId, r.ruimte) }, r.sleutel, r.ct));
      if (/^[0-9a-f]{64}$/i.test(deel)) return { apparaatId: r.apparaatId, deel };
    } catch { /* beschadigd record: overslaan */ }
  }
  return null;
}
/** Records die de server niet meer kent (vergeten, verlopen): weg. */
export async function apparaatOpruimen(bekendeIds: readonly string[], ruimte: 'prive' | 'technisch'): Promise<void> {
  for (const r of await apparaatRecords()) if (r.ruimte === ruimte && !bekendeIds.includes(r.apparaatId)) await apparaatVergetenLokaal(r.apparaatId);
}
export async function apparaatVergetenLokaal(apparaatId?: string): Promise<void> {
  if (!kan()) return;
  try { await metStore('readwrite', (s) => (apparaatId ? s.delete(apparaatId) : s.clear())); } catch { /* niets */ }
}
export const heeftLokaalApparaat = async (id: string) => (await apparaatRecords()).some((r) => r.apparaatId === id);
