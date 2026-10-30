/** Universal File Workspace v0.3 bridge. Only already-authorized Blobs can cross this client boundary. */
import { CANONICAL_AUTH_CHANGE } from '../canoniek-gebeurtenissen';
export type BestandBron = 'mail'|'microsoft-mail'|'google-drive'|'onedrive'|'dropbox'|'private-cloud'|'github'|'gitlab'|'browser-file'|'device-agent'|'notes'|'tasks'|'ai'|'plugin';
export type OpenBestand = {
  bron: BestandBron;
  bestand: Blob;
  bestandsnaam: string;
  contentType?: string;
  bronLabel?: string;
};

export const VOORBEELD_MAX_BYTES = 32 * 1024 * 1024;
export const MAX_OPEN_VENSTERS = 4;
/** Conservative rollout: Mail keeps its previous behavior until authenticated Chrome smoke tests pass. */
export const UNIVERSELE_MAIL_ENABLED = false;
type Ontvanger = (intent: OpenBestand) => void;
let ontvanger: Ontvanger | null = null;
let wachtend: OpenBestand[] = [];
let laden: Promise<void> | null = null;

/** All sources must enforce their own account/space authorization BEFORE providing the bytes. */
export function openUniverseelBestand(intent: OpenBestand): void {
  if (!(intent.bestand instanceof Blob)) throw new Error('UNIVERSEEL_BESTAND_VEREIST_BLOB');
  if (!intent.bestandsnaam || intent.bestandsnaam.length > 512) throw new Error('ONGELDIGE_BESTANDSNAAM');
  if (!(['mail','microsoft-mail','google-drive','onedrive','dropbox','private-cloud','github','gitlab','browser-file','device-agent','notes','tasks','ai','plugin'] as string[]).includes(intent.bron)) throw new Error('ONGELDIGE_BRON');
  const veilig: OpenBestand = { bron: intent.bron, bestand: intent.bestand, bestandsnaam: intent.bestandsnaam,
    contentType: intent.contentType || intent.bestand.type || 'application/octet-stream',
    bronLabel: (intent.bronLabel || '').slice(0, 200) };
  if (ontvanger) { ontvanger(veilig); return; }
  wachtend = [...wachtend.slice(-(MAX_OPEN_VENSTERS-1)), veilig];
  if (!laden) {
    laden = import('./UniverseelBestandVenster').then(({ startUniverseelBestandVenster }) => startUniverseelBestandVenster())
      .catch(() => { wachtend = []; laden = null;
        void import('../canoniek-meldingen').then(({emitCanonicalNotice}) => emitCanonicalNotice({
          text:'Універсальне вікно не завантажилось. Оновіть сторінку та спробуйте знову.',
          kind:'error',source:'bestanden'
        })).catch(() => {});
      });
    // Opening is fire-and-forget from trusted user event; avoid unhandled promise rejection.
    void laden.catch(() => {});
  }
}

export function verbindUniverseelBestand(onOpen: Ontvanger): () => void {
  ontvanger = onOpen;
  const reeks = wachtend.splice(0);
  reeks.forEach(onOpen);
  return () => { if (ontvanger === onOpen) ontvanger = null; };
}

/** Never retain preview blobs after a canonical account switch/logout. */
export function wisWachtendeBestanden(): void { wachtend = []; }

if (typeof window !== 'undefined') window.addEventListener(CANONICAL_AUTH_CHANGE, wisWachtendeBestanden);
