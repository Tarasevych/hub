// UI-002: import in de BROWSER — ZIP (fflate, stromend per bestand), map (webkitdirectory) of losse bestanden.
// Waarom in de browser: een Takeout van tientallen GB hoeft zo nooit in één keer naar de server; alleen de media gaan,
// één voor één, met sha256 vooraf (een al bekende foto wordt niet opnieuw verstuurd), plus wat het archief over de foto
// weet (sidecar-JSON, EXIF), een kleine miniatuur en een beeldafdruk (dHash) voor «gelijkende foto's».
import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import { ARCHIEF_BRON, FOTO_LIMIETEN, archiefMetadata, herkenArchief, leesExif, mediaSoort, mimeVoor, type ArchiefMeta, type ArchiefSoort } from '../../shared/foto-model';
import { fotoClient } from './foto-client';

export type Invoer = { pad: string; grootte: number; lees: () => Promise<Uint8Array>; tijd?: number };
export type Voortgang = { fase: 'lezen' | 'uploaden' | 'klaar'; gedaan: number; totaal: number; nieuw: number; bekend: number; overgeslagen: number; mislukt: number; huidig?: string };

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: Uint8Array) => { let s = ''; for (let k = 0; k < b.length; k += 0x8000) s += String.fromCharCode(...b.subarray(k, k + 0x8000)); return btoa(s); };

/** Lees een ZIP-bestand naar een lijst invoer (media lui, JSON meteen). Werkt op File.stream(), dus zonder het hele archief in het geheugen. */
export async function zipInvoer(bestand: File): Promise<{ media: Invoer[]; json: Map<string, unknown> }> {
  const media: Invoer[] = []; const json = new Map<string, unknown>(); const inhoud = new Map<string, Uint8Array>();
  await new Promise<void>((klaar, fout) => {
    const uz = new Unzip((f) => {
      const naam = f.name; const isJson = /\.json$/i.test(naam); const isMedia = !!mediaSoort(naam);
      if (!isJson && !isMedia) return;
      if ((f.originalSize ?? 0) > FOTO_LIMIETEN.itemMaxBytes) { media.push({ pad: naam, grootte: f.originalSize ?? 0, lees: async () => { throw new Error('TE_GROOT'); } }); return; }
      const delen: Uint8Array[] = [];
      f.ondata = (err, d, eind) => { if (err) { fout(err); return; } delen.push(d); if (eind) { const tot = delen.reduce((s, x) => s + x.length, 0); const b = new Uint8Array(tot); let o = 0; for (const x of delen) { b.set(x, o); o += x.length; }
        if (isJson) { if (b.length < 20 * 1024 * 1024) try { json.set(naam, JSON.parse(new TextDecoder().decode(b))); } catch { /* kapotte JSON: overslaan */ } }
        else { inhoud.set(naam, b); media.push({ pad: naam, grootte: b.length, lees: async () => { const x = inhoud.get(naam)!; inhoud.delete(naam); return x; } }); } } };
      f.start();
    });
    uz.register(UnzipInflate); uz.register(UnzipPassThrough);
    const lezer = bestand.stream().getReader();
    const pomp = (): void => { void lezer.read().then(({ done, value }) => { try { if (done) { uz.push(new Uint8Array(0), true); klaar(); return; } uz.push(value); pomp(); } catch (e) { fout(e); } }, fout); };
    pomp();
  });
  return { media, json };
}
/** Bestanden uit een map of losse keuze (FileList). */
export async function lijstInvoer(lijst: File[]): Promise<{ media: Invoer[]; json: Map<string, unknown> }> {
  const media: Invoer[] = []; const json = new Map<string, unknown>();
  for (const f of lijst) {
    const pad = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    if (/\.json$/i.test(pad) && f.size < 20 * 1024 * 1024) { try { json.set(pad, JSON.parse(await f.text())); } catch { /* overslaan */ } continue; }
    if (mediaSoort(pad, f.type)) media.push({ pad, grootte: f.size, tijd: f.lastModified, lees: async () => new Uint8Array(await f.arrayBuffer()) });
  }
  return { media, json };
}

/** Kleine miniatuur (≤ 240 px, JPEG) en 64-bit dHash; null als de browser het formaat niet kan tekenen (HEIC, RAW, video). */
export async function miniatuurEnHash(b: Uint8Array, mime: string): Promise<{ miniatuur: string; dhash: string; breedte: number; hoogte: number } | null> {
  if (!mime.startsWith('image/') || typeof createImageBitmap !== 'function') return null;
  try {
    const bmp = await createImageBitmap(new Blob([b as BlobPart], { type: mime }), { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const schaal = Math.min(1, 240 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * schaal)); c.height = Math.max(1, Math.round(bmp.height * schaal));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    let kwal = 0.7, url = c.toDataURL('image/jpeg', kwal);
    while (url.length > FOTO_LIMIETEN.miniatuurMaxBytes * 1.3 && kwal > 0.3) { kwal -= 0.15; url = c.toDataURL('image/jpeg', kwal); }
    const h = document.createElement('canvas'); h.width = 9; h.height = 8; const hc = h.getContext('2d')!; hc.drawImage(bmp, 0, 0, 9, 8);
    const px = hc.getImageData(0, 0, 9, 8).data; let bits = '';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const g = (k: number) => px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114; const i = (y * 9 + x) * 4; bits += g(i) > g(i + 4) ? '1' : '0'; }
    const dhash = Array.from({ length: 16 }, (_, k) => parseInt(bits.slice(k * 4, k * 4 + 4), 2).toString(16)).join('');
    const uit = { miniatuur: url, dhash, breedte: bmp.width, hoogte: bmp.height }; bmp.close(); return uit;
  } catch { return null; }
}

/** De hele import: herkennen, metadata lezen, per bestand: sha → (bekend? alleen herkomst) : upload in stukken. */
export async function importeer(bron: { media: Invoer[]; json: Map<string, unknown> }, opties: { archief: string; bronId?: string; opVoortgang: (v: Voortgang) => void; afgebroken: () => boolean }): Promise<Voortgang & { soort: ArchiefSoort; bronId: string }> {
  const soort = herkenArchief([...bron.media.map((m) => m.pad), ...bron.json.keys()]);
  const bronId = opties.bronId && opties.bronId !== 'map' ? opties.bronId : ARCHIEF_BRON[soort];
  const meta = archiefMetadata(soort, bron.media.map((m) => m.pad), bron.json);
  const v: Voortgang = { fase: 'uploaden', gedaan: 0, totaal: bron.media.length, nieuw: 0, bekend: 0, overgeslagen: 0, mislukt: 0 };
  const log = await fotoClient.importLog({ bron: bronId, archief: opties.archief, soort }).catch(() => ({ id: '' }));
  for (const m of bron.media) {
    if (opties.afgebroken()) break;
    v.huidig = m.pad; opties.opVoortgang({ ...v });
    try {
      const b = await m.lees();
      const naam = m.pad.split('/').pop() || m.pad; const mime = mimeVoor(naam);
      const sha = hex(await crypto.subtle.digest('SHA-256', b as BufferSource));
      const exif = mime === 'image/jpeg' ? leesExif(b.subarray(0, 256 * 1024)) : {};
      const am: ArchiefMeta = meta.get(m.pad) || {};
      const genomenOp = exif.genomenOp || am.genomenOp || (m.tijd ? new Date(m.tijd).toISOString() : undefined);
      const datumBron = exif.genomenOp ? 'exif' : am.genomenOp ? 'sidecar' : m.tijd ? 'bestand' : undefined;
      const mini = await miniatuurEnHash(b, mime);
      const velden = { naam, mime, bytes: b.length, sha256: sha, bron: bronId, pad: m.pad.slice(0, 500), archief: opties.archief, genomenOp, datumBron, titel: am.titel, beschrijving: am.beschrijving, album: am.album, tags: am.tags, plaats: exif.plaats || am.plaats || null, camera: exif.camera, breedte: exif.breedte || mini?.breedte, hoogte: exif.hoogte || mini?.hoogte, miniatuur: mini?.miniatuur, dhash: mini?.dhash };
      const begin = await fotoClient.upload({ actie: 'begin', ...velden });
      if (begin.bekend) { v.bekend++; }
      else {
        const stuk = begin.stukMax || FOTO_LIMIETEN.stukMaxBytes;
        for (let o = 0; o < b.length; o += stuk) await fotoClient.upload({ actie: 'stuk', id: begin.id, offset: o, data: b64(b.subarray(o, o + stuk)) });
        const klaar = await fotoClient.upload({ ...velden, actie: 'klaar', id: begin.id });
        if (klaar.bekend) v.bekend++; else v.nieuw++;
      }
    } catch (e) { if (String((e as Error)?.message).includes('GEEN_MEDIA')) v.overgeslagen++; else v.mislukt++; }
    v.gedaan++; opties.opVoortgang({ ...v });
  }
  v.fase = 'klaar'; v.huidig = undefined; opties.opVoortgang({ ...v });
  if (log.id) await fotoClient.importLog({ id: log.id, bron: bronId, archief: opties.archief, soort, nieuw: v.nieuw, bekend: v.bekend, overgeslagen: v.overgeslagen, mislukt: v.mislukt, klaar: true }).catch(() => undefined);
  return { ...v, soort, bronId };
}
