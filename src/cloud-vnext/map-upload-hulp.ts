// Mappenboom-upload (CLOUD-001): ondersteunt zowel de mapkiezer (<input webkitdirectory>) als het slepen van hele
// mappen en geneste submappen vanaf het bureaublad (DataTransferItem.webkitGetAsEntry + herhaalde readEntries-aanroepen).
// Maakt eerst in één atomaire aanroep alle ontbrekende submappen aan op de server en zet daarna elk bestand (ook 0-byte
// bestanden zoals .gitkeep) netjes op de juiste plek in de wachtrij.
import { schoneNaam, veiligUploadMime } from '../../shared/cloud-vnext-model';
import { cloudClient } from './cloud-client';
import { bronVanFile, overdrachten } from './overdracht-beheer';

export type BoomUploadStuk = { file: File; relPad: string[] };

type FsIngang = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (f: File) => void, fout?: (err: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (lijst: FsIngang[]) => void, fout?: (err: unknown) => void) => void };
};

const OVERSLAAN_NAMEN = new Set(['.DS_Store', 'Thumbs.db']);

function maakSegmentenSchoon(rauwPad: string): string[] {
  const delen = String(rauwPad || '')
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && s !== '.' && s !== '..');
  if (delen.some((d) => d === '__MACOSX')) return [];
  const uit = delen.map((s) => schoneNaam(s)).filter(Boolean);
  return uit.length === delen.length ? uit : [];
}

/** Bouwt relatieve paden uit een `<input type="file" webkitdirectory>`-lijst. */
export function leesMapInputFiles(files: ArrayLike<File>): BoomUploadStuk[] {
  const uit: BoomUploadStuk[] = [];
  for (const f of Array.from(files)) {
    if (OVERSLAAN_NAMEN.has(f.name)) continue;
    const rel = String((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
    const segs = maakSegmentenSchoon(rel);
    if (!segs.length) continue;
    uit.push({ file: f, relPad: segs.slice(0, -1) });
  }
  return uit;
}

async function leesAlleMapIngangen(ingang: FsIngang): Promise<FsIngang[]> {
  if (!ingang.createReader) return [];
  const lezer = ingang.createReader();
  const alles: FsIngang[] = [];
  for (let ronde = 0; ronde < 200; ronde += 1) {
    const deel = await new Promise<FsIngang[]>((resolve) => {
      lezer.readEntries((items) => resolve(Array.isArray(items) ? items : []), () => resolve([]));
    });
    if (!deel.length) break;
    alles.push(...deel);
  }
  return alles;
}

async function loopIngangAf(ingang: FsIngang, ouderPad: string[], uit: BoomUploadStuk[], legeMappen: string[][]): Promise<void> {
  const schoon = schoneNaam(ingang.name);
  if (!schoon || OVERSLAAN_NAMEN.has(ingang.name) || ingang.name === '__MACOSX') return;
  if (ingang.isFile && ingang.file) {
    const bestand = await new Promise<File | null>((resolve) => {
      ingang.file!((f) => resolve(f), () => resolve(null));
    });
    if (bestand) uit.push({ file: bestand, relPad: ouderPad });
    return;
  }
  if (ingang.isDirectory) {
    const nieuwPad = [...ouderPad, schoon];
    const kinderen = await leesAlleMapIngangen(ingang);
    if (!kinderen.length) {
      legeMappen.push(nieuwPad);
      return;
    }
    for (const kind of kinderen) {
      await loopIngangAf(kind, nieuwPad, uit, legeMappen);
    }
  }
}

/**
 * Leest gesleepte bestanden én mappen uit `DataTransfer`.
 * Belangrijk: `webkitGetAsEntry()` moet synchroon in de drop-gebeurtenis worden uitgelezen vóór de eerste `await`.
 */
export async function leesDropBoom(dt: DataTransfer): Promise<{ stukken: BoomUploadStuk[]; legeMappen: string[][]; heeftMappen: boolean }> {
  const synchroneIngangen: FsIngang[] = [];
  let heeftMappen = false;
  if (dt.items && dt.items.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind !== 'file') continue;
      const haal = (item as DataTransferItem & { webkitGetAsEntry?: () => FsIngang | null }).webkitGetAsEntry;
      const ingang = typeof haal === 'function' ? haal.call(item) : null;
      if (ingang) {
        if (ingang.isDirectory) heeftMappen = true;
        synchroneIngangen.push(ingang);
      }
    }
  }
  if (!synchroneIngangen.length) {
    const losse = Array.from(dt.files || []).filter((f) => !OVERSLAAN_NAMEN.has(f.name)).map((file) => ({ file, relPad: [] }));
    return { stukken: losse, legeMappen: [], heeftMappen: false };
  }
  const stukken: BoomUploadStuk[] = [];
  const legeMappen: string[][] = [];
  for (const ing of synchroneIngangen) {
    await loopIngangAf(ing, [], stukken, legeMappen);
  }
  if (stukken.some((s) => s.relPad.length > 0) || legeMappen.length > 0) heeftMappen = true;
  return { stukken, legeMappen, heeftMappen };
}

/** Maakt de benodigde mappenboom op de server en voegt alle bestanden (ook 0-byte bestanden) toe. */
export async function verwerkBoomUpload(
  stukken: BoomUploadStuk[],
  huidigeMapId: string | null,
  legeMappen: string[][] = [],
): Promise<{ aangemaakteMappen: number; bestandenGeplaatst: number; legeBestanden: number }> {
  const padSleutels = new Map<string, string[]>();
  for (const s of stukken) {
    if (s.relPad.length) padSleutels.set(s.relPad.join('/'), s.relPad);
  }
  for (const lm of legeMappen) {
    if (lm.length) padSleutels.set(lm.join('/'), lm);
  }
  let kaart: Record<string, string> = {};
  let aangemaakteMappen = 0;
  if (padSleutels.size > 0) {
    const gezorgd = await cloudClient.mapPadenZorg(huidigeMapId, [...padSleutels.values()]);
    kaart = gezorgd.kaart || {};
    aangemaakteMappen = gezorgd.aangemaakt || 0;
  }

  let bestandenGeplaatst = 0;
  let legeBestanden = 0;
  for (const { file, relPad } of stukken) {
    const doelMapId = relPad.length ? (kaart[relPad.join('/')] ?? huidigeMapId) : huidigeMapId;
    if (file.size === 0) {
      await cloudClient.bestandNieuwLeeg(file.name, veiligUploadMime(file.type, file.name), doelMapId);
      legeBestanden += 1;
    } else {
      overdrachten().voegUploadToe(bronVanFile(file), doelMapId);
    }
    bestandenGeplaatst += 1;
  }
  return { aangemaakteMappen, bestandenGeplaatst, legeBestanden };
}
