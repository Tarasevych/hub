// UPD-012: локальне сховище IndexedDB для відновлення обраного архіву .tar.gz і стану майстра оновлень
// після обриву або вивантаження вкладки оглядачем при переході в Telegram чи іншу програму.
// Lokale IndexedDB-opslag om het gekozen .tar.gz-archief en de staat van de updatewizard te herstellen.

const DB_NAAM = 'tsv-uitrol-herstel-v1';
const DB_VERSIE = 1;
const STORE_NAAM = 'concept';
const META_SLEUTEL = 'meta';
const BESTAND_SLEUTEL = 'bestand';
export const MAX_HERSTEL_BESTAND_BYTES = 300 * 1024 * 1024;
export const MAX_HERSTEL_LEEFTIJD_MS = 6 * 60 * 60 * 1000;

export type UploadConceptInvoer = {
  accountId: string;
  bestand: Blob;
  bestandNaam: string;
  grootte: number;
  lastModified: number;
  versie: string;
  sha256: string;
  soort: string;
  voorstelId: string;
  verzonden: number;
  voortgang: number;
  opgeslagenOp: number;
};

type ConceptMeta = {
  accountId: string;
  bestandNaam: string;
  grootte: number;
  lastModified: number;
  versie: string;
  sha256: string;
  soort: string;
  voorstelId: string;
  verzonden: number;
  voortgang: number;
  opgeslagenOp: number;
  heeftBestand: boolean;
};

export type HersteldUploadConcept = ConceptMeta & {
  bestand: File | null;
};

function heeftIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (!heeftIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAAM, DB_VERSIE);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAAM)) {
          db.createObjectStore(STORE_NAAM);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function leesWaarde<T>(store: IDBObjectStore, sleutel: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const req = store.get(sleutel);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function schrijfTransactie(
  db: IDBDatabase,
  bewerking: (store: IDBObjectStore) => void,
): Promise<{ ok: boolean; quota: boolean }> {
  return new Promise((resolve) => {
    let afgehandeld = false;
    const klaar = (ok: boolean, quota = false) => {
      if (afgehandeld) return;
      afgehandeld = true;
      resolve({ ok, quota });
    };
    try {
      const tx = db.transaction(STORE_NAAM, 'readwrite');
      const store = tx.objectStore(STORE_NAAM);
      bewerking(store);
      tx.oncomplete = () => klaar(true, false);
      tx.onerror = () => {
        const err = tx.error;
        const quota = err?.name === 'QuotaExceededError' || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
        klaar(false, quota);
      };
      tx.onabort = () => {
        const err = tx.error;
        const quota = err?.name === 'QuotaExceededError' || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
        klaar(false, quota);
      };
    } catch (e) {
      const naam = (e as { name?: string } | null)?.name || '';
      klaar(false, naam === 'QuotaExceededError' || naam === 'NS_ERROR_DOM_QUOTA_REACHED');
    }
  });
}

function bouwMeta(invoer: UploadConceptInvoer, heeftBestand: boolean): ConceptMeta {
  return {
    accountId: String(invoer.accountId || ''),
    bestandNaam: String(invoer.bestandNaam || ''),
    grootte: Math.max(0, Number(invoer.grootte || 0)),
    lastModified: Math.max(0, Number(invoer.lastModified || 0)),
    versie: String(invoer.versie || ''),
    sha256: String(invoer.sha256 || ''),
    soort: String(invoer.soort || ''),
    voorstelId: String(invoer.voorstelId || ''),
    verzonden: Math.max(0, Number(invoer.verzonden || 0)),
    voortgang: Math.max(0, Math.min(100, Number(invoer.voortgang || 0))),
    opgeslagenOp: Number(invoer.opgeslagenOp || Date.now()),
    heeftBestand,
  };
}

function zelfdeBestand(oud: ConceptMeta | null, nieuw: UploadConceptInvoer): boolean {
  if (!oud || !oud.heeftBestand) return false;
  if (oud.bestandNaam !== nieuw.bestandNaam) return false;
  if (oud.grootte !== nieuw.grootte) return false;
  if (oud.lastModified !== nieuw.lastModified) return false;
  if (oud.sha256 && nieuw.sha256 && oud.sha256 !== nieuw.sha256) return false;
  return true;
}

/**
 * Зберігає обраний архів (до 300 МБ) і поточний стан майстра оновлень у IndexedDB.
 * За повторних оновлень поступу того самого файла оновлює лише легкі метадані.
 * При QuotaExceededError зберігає принаймні метадані без падіння.
 */
export async function bewaarUploadConcept(invoer: UploadConceptInvoer): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    let bestaandeMeta: ConceptMeta | null = null;
    try {
      const readTx = db.transaction(STORE_NAAM, 'readonly');
      bestaandeMeta = await leesWaarde<ConceptMeta>(readTx.objectStore(STORE_NAAM), META_SLEUTEL);
    } catch {
      bestaandeMeta = null;
    }

    const bestandPast = invoer.bestand instanceof Blob
      && invoer.bestand.size > 0
      && invoer.bestand.size <= MAX_HERSTEL_BESTAND_BYTES
      && invoer.grootte <= MAX_HERSTEL_BESTAND_BYTES;

    if (bestandPast && zelfdeBestand(bestaandeMeta, invoer)) {
      const metaAlleen = bouwMeta(invoer, true);
      const r = await schrijfTransactie(db, (store) => {
        store.put(metaAlleen, META_SLEUTEL);
      });
      return r.ok;
    }

    if (bestandPast) {
      const metaMetBestand = bouwMeta(invoer, true);
      const r = await schrijfTransactie(db, (store) => {
        store.put(metaMetBestand, META_SLEUTEL);
        store.put(invoer.bestand, BESTAND_SLEUTEL);
      });
      if (r.ok) return true;
      // При нестачі квоти або збої запису великого архіву зберігаємо хоча б метадані.
      const metaZonder = bouwMeta(invoer, false);
      const rMeta = await schrijfTransactie(db, (store) => {
        store.delete(BESTAND_SLEUTEL);
        store.put(metaZonder, META_SLEUTEL);
      });
      return rMeta.ok;
    }

    const metaZonder = bouwMeta(invoer, false);
    const rMeta = await schrijfTransactie(db, (store) => {
      store.delete(BESTAND_SLEUTEL);
      store.put(metaZonder, META_SLEUTEL);
    });
    return rMeta.ok;
  } catch {
    return false;
  } finally {
    try { db.close(); } catch { /* ігноруємо закриття */ }
  }
}

/**
 * Читає збережений архів і стан майстра оновлень з IndexedDB.
 * Повертає File + метадані, якщо запис не старіший за 6 годин; при помилці — null.
 */
export async function leesUploadConcept(accountId?: string): Promise<HersteldUploadConcept | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE_NAAM, 'readonly');
    const store = tx.objectStore(STORE_NAAM);
    const meta = await leesWaarde<ConceptMeta>(store, META_SLEUTEL);
    if (!meta || !meta.bestandNaam || typeof meta.opgeslagenOp !== 'number') return null;

    if (Date.now() - meta.opgeslagenOp > MAX_HERSTEL_LEEFTIJD_MS) {
      try { db.close(); } catch { /* ігноруємо */ }
      void wisUploadConcept();
      return null;
    }

    if (accountId && meta.accountId && meta.accountId !== accountId) {
      return null;
    }

    let bestand: File | null = null;
    if (meta.heeftBestand) {
      const blob = await leesWaarde<Blob>(store, BESTAND_SLEUTEL);
      if (blob instanceof Blob && blob.size > 0) {
        try {
          bestand = new File([blob], meta.bestandNaam, {
            type: blob.type || 'application/gzip',
            lastModified: meta.lastModified || meta.opgeslagenOp,
          });
        } catch {
          bestand = null;
        }
      }
    }

    return {
      ...meta,
      heeftBestand: bestand !== null,
      bestand,
    };
  } catch {
    return null;
  } finally {
    try { db.close(); } catch { /* ігноруємо закриття */ }
  }
}

/** Повністю очищає збережену чернетку завантаження в IndexedDB. */
export async function wisUploadConcept(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await schrijfTransactie(db, (store) => {
      store.clear();
    });
  } catch {
    /* ігноруємо збій очищення */
  } finally {
    try { db.close(); } catch { /* ігноруємо закриття */ }
  }
}
