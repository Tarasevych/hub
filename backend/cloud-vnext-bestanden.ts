// Cloud vNext — EIGEN BESTANDEN (vlag cloud-vnext, migratie 0130): mappen, labels, favorieten, prullenbak (30 dagen), versies,
// upload in stukken en download, bovenop de BESTAANDE opslag (app.records: cloud_items_v1 + nieuwe collectie cloud_mappen_v1;
// bytes via server/platform/opslag.ts). Het contract staat in shared/cloud-vnext-model.ts; de browserkant is
// src/cloud-vnext/cloud-client.ts. De oude pagina blijft DEZELFDE records lezen: vNext voegt alleen velden toe
// (mapId, favoriet, verwijderdOp, versies, sha256, bron) — een record zonder die velden is «wortel, geen favoriet, niet in
// de prullenbak, zonder versies», dus er is geen datamigratie en niets gaat verloren.
//
// VASTE BESLISSINGEN
//   • records lezen ALTIJD met paginering (db.list limit 1000 + nextToken-lus, plafond 20 000) — de oude 100-records-afkap
//     (DEFAULT_LIST_LIMIT in server/platform/db.ts) is een bekende bug die hier niet terug mag komen;
//   • elke rij wordt ná het filter nog met hoortBij() tegen de lade gelegd (ladeFilter 'prive' matcht ook technische rijen niet
//     — maar rijen zónder ruimteveld wél, dus de dubbele controle is verplicht, zie shared/ruimte-scheiding.ts);
//   • verwijderen is eerst soft-delete (verwijderdOp); definitief alleen vanuit de prullenbak, en de prullenbak ruimt zichzelf
//     lui op: ouder dan PRULLENBAK_DAGEN → bytes en record weg bij de eerstvolgende blik (overzicht of prullenbaklijst);
//   • bij vervangen (upload met dezelfde naam in dezelfde map) blijft de vorige inhoud als versie (pad+bytes+sha256+tijd,
//     tot versiesMax; wat eruit valt wordt ook uit de opslag verwijderd); een versie heeft geen eigen mime — die blijft
//     van het bestand;
//   • uploadsessies: stukken op schijf in een tijdelijke map buiten de uploads-wortel (mkdtemp), strikt op volgorde
//     (offset == ontvangen), stuk ≤ stukMaxBytes ná base64, sha256-controle vóór storage.write, TTL 30 minuten;
//   • de MIME-regel is hier bewust RUIMER dan de capture-witte-lijst in backend/cloud-platform.ts (dit is een
//     bestandsbeheerder, geen inbox): alles mag, BEHALVE wat een browser als pagina of script zou uitvoeren
//     (text/html, xhtml, svg, alles met «javascript», uitvoerbare download-typen) → MIME_NIET_TOEGESTAAN;
//   • alles respecteert de lade (prive/technisch): ladeOf(userId) geeft buiten een bewaakte route de PERSOONLIJKE lade
//     (minste rechten), en opslagpaden lopen door cloudVoorvoegsel/padInLade uit backend/ruimte-cloud-agenda.ts.
//
// Foutcodes uit het contract: NAAM_ONGELDIG, MAP_ONBEKEND, MAP_DIEPTE, MAP_VOL, BESTAND_ONBEKEND, TAG_ONGELDIG, TE_GROOT,
// STUK_BUITEN_ORDE, SHA_MISMATCH, UPLOAD_ONBEKEND, NIET_IN_PRULLENBAK, MIME_NIET_TOEGESTAAN, LIMIET_BEREIKT; aanvullend
// (additief, in dezelfde stijl): MAP_IN_ZICHZELF (map in haar eigen tak verplaatsen), VERSIE_ONBEKEND (onbekende versie),
// ACTIE_ONGELDIG (onbekende actie in map/bestand/upload).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readdir, readFile, rename, rm, statfs, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import { db, error, json, storage } from '../server/platform';
import { alsSysteem, isAlleenLezen } from '../server/platform/context';
import type { RouterMiddleware } from '../server/platform/router';
import { can, denyMutation } from './rbac';
import {
  CLOUD_SORTERING, CLOUD_VNEXT_LIMIETEN as LIMIET, cloudSoort, schoneNaam, schoneTag, veiligUploadMime,
  type CloudArchiefIngang, type CloudBestand, type CloudMap, type CloudSoort, type CloudSortering, type CloudVersie,
} from '../shared/cloud-vnext-model';
import { SESSIE_UREN_MAX, geldigStukOffset, ontbrekendeStukken, stukTotaal } from '../shared/cloud-overdracht-model';
import { hoortBij, ladeFilter, ladeVelden, type Lade } from '../shared/ruimte-scheiding';
import { cloudVoorvoegsel, ladeOf, padInLade } from './ruimte-cloud-agenda';

// ------------------------------------------------------------------------------------------------ opslagvormen
const ITEMS = 'cloud_items_v1';          // bestaande collectie van de oude pagina — zelfde records, extra velden
const MAPPEN = 'cloud_mappen_v1';        // nieuw (vNext): mappen per lade
const WERKRUIMTES = 'cloud_workspaces_v1';
const LEES_PLAFOND = 20_000;             // harde bovengrens van de nextToken-lus (tegen een ontspoorde collectie)

type Versie = { pad: string; bytes: number; sha256: string; op: string };
type ItemRecord = {
  ownerUserId?: string; ruimte?: string; workspaceId?: string; suggestedWorkspaceId?: string;
  kind?: 'file' | 'note' | 'link'; title?: string; originalName?: string; description?: string; textContent?: string;
  sourceUrl?: string; mimeType?: string; sizeBytes?: number; storagePath?: string; tags?: unknown; people?: string[];
  status?: string; aiState?: string; aiConfidence?: number; createdAt?: number; updatedAt?: number; openedAt?: number;
  // vNext-velden (ontbreken op oude records = wortel / geen favoriet / niet in de prullenbak / geen versies):
  mapId?: string | null; favoriet?: boolean; verwijderdOp?: string | null; versies?: Versie[]; sha256?: string; bron?: string;
};
type MapRecord = { ownerUserId?: string; ruimte?: string; naam?: string; ouderId?: string | null; createdAt?: number };
type WerkruimteRecord = { ownerUserId?: string; ruimte?: string; title?: string; status?: string; archivedAt?: number };
type MetId<T> = T & { id: string };

// ------------------------------------------------------------------------------------------------ kleine hulpjes (puur)
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const idOfNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null);
const iso = (ms: number): string => new Date(ms > 0 ? ms : Date.now()).toISOString();
const zonderId = <T extends { id?: string }>(r: T): Omit<T, 'id'> => { const { id: _id, ...rest } = r; return rest; };
const extensie = (naam: string): string => { const m = /\.([A-Za-z0-9]{1,10})$/.exec(naam); return m ? `.${m[1].toLowerCase()}` : ''; };
// Lineair (één tekenklasse, geen herhaalde groep): een groep-herhaling zoals (?:…{4})* laat de V8-regexmotor recursief
// terugkeren en gaf «Maximum call stack size exceeded» op een stuk van 4 MiB. De lengte-eis (veelvoud van 4) staat bij de aanroep.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const fout = (code: string): never => { throw new Error(code); };

/** MIME normaliseren (kleine letters, zonder parameters) en keuren. Ruimer dan capture — zie de kop van dit bestand. */
const MIME_VERBODEN = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|application\/(x-msdownload|x-msdos-program|x-sh|x-httpd-php|hta))$|javascript/;
export const schoneMime = (raw: unknown): string => str(raw).split(';')[0].trim().toLowerCase().slice(0, 160);
export const mimeToegestaan = (mime: string): boolean => /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime) && !MIME_VERBODEN.test(mime);

/** De soort van een record: notitie/link op kind, anders uit MIME + naam (shared/cloud-vnext-model.ts). */
const soortVan = (r: ItemRecord): CloudSoort => (r.kind === 'note' ? 'notitie' : r.kind === 'link' ? 'link' : cloudSoort(str(r.mimeType), str(r.originalName) || str(r.title)));
const buitenNaam = (r: ItemRecord): string => (str(r.title).trim() || str(r.originalName).trim() || 'Zonder naam').slice(0, LIMIET.naamMax);
const naarBuiten = (r: MetId<ItemRecord>): CloudBestand => ({
  id: r.id, naam: buitenNaam(r), soort: soortVan(r), mime: schoneMime(r.mimeType), bytes: num(r.sizeBytes),
  sha256: str(r.sha256), mapId: idOfNull(r.mapId), workspaceId: idOfNull(r.workspaceId),
  tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map((t) => String(t)).filter(Boolean).slice(0, LIMIET.tagsMax) : [],
  favoriet: r.favoriet === true, kind: r.kind === 'note' || r.kind === 'link' ? r.kind : 'file',
  ...(r.kind === 'link' && str(r.sourceUrl) ? { url: str(r.sourceUrl) } : {}),
  aangemaaktOp: iso(num(r.createdAt)), bijgewerktOp: iso(num(r.updatedAt) || num(r.createdAt)),
  geopendOp: num(r.openedAt) > 0 ? iso(num(r.openedAt)) : null, verwijderdOp: str(r.verwijderdOp) || null,
  versies: Array.isArray(r.versies) ? r.versies.length : 0,
  bron: str(r.bron) || (r.kind === 'note' ? 'notitie' : r.kind === 'link' ? 'link' : 'capture'),
});
const buitenMap = (m: MetId<MapRecord>, aantal?: number): CloudMap => ({ id: m.id, naam: str(m.naam) || 'Map', ouderId: idOfNull(m.ouderId), aangemaaktOp: iso(num(m.createdAt)), ...(aantal === undefined ? {} : { aantal }) });

// ------------------------------------------------------------------------------------------------ lezen mét paginering
/** ALLE records van een collectie voor dit filter: db.list in een nextToken-lus (limit 1000), plafond 20 000. */
async function alleRecords<T>(collectie: string, filter: Record<string, unknown>): Promise<Array<MetId<T>>> {
  const uit: Array<MetId<T>> = [];
  let token: string | undefined;
  while (uit.length < LEES_PLAFOND) {
    const blad = await db.list<T>(collectie, { filter, limit: 1000, ...(token ? { nextToken: token } : {}) });
    uit.push(...(blad.items as unknown as Array<MetId<T>>));
    if (!blad.nextToken) break;
    token = blad.nextToken;
  }
  return uit;
}
const eigenItems = async (lade: Lade) => (await alleRecords<ItemRecord>(ITEMS, ladeFilter(lade))).filter((r) => hoortBij(r, lade));
const eigenMappen = async (lade: Lade) => (await alleRecords<MapRecord>(MAPPEN, ladeFilter(lade))).filter((r) => hoortBij(r, lade));
const eenItem = async (lade: Lade, id: unknown): Promise<MetId<ItemRecord> | null> => {
  const schoon = idOfNull(id);
  if (!schoon) return null;
  const [r] = await db.get<ItemRecord>(ITEMS, [schoon]);
  return r && hoortBij(r, lade) ? { ...r, id: schoon } : null;
};

// ------------------------------------------------------------------------------------------------ mappenrekenen (puur)
/** De keten wortel → … → map (voor het broodkruimelpad en de dieptecontrole); veilig tegen kringen en kapotte ouders. */
function ketting(mappen: Array<MetId<MapRecord>>, id: string | null): Array<MetId<MapRecord>> {
  const perId = new Map(mappen.map((m) => [m.id, m]));
  const uit: Array<MetId<MapRecord>> = [];
  const gezien = new Set<string>();
  let huidig = id ? perId.get(id) : undefined;
  while (huidig && !gezien.has(huidig.id)) { gezien.add(huidig.id); uit.unshift(huidig); huidig = idOfNull(huidig.ouderId) ? perId.get(String(huidig.ouderId)) : undefined; }
  return uit;
}
const diepte = (mappen: Array<MetId<MapRecord>>, id: string | null): number => ketting(mappen, id).length;
/** Alle nazaten (kinderen, kleinkinderen, …) van een map. */
function nazaten(mappen: Array<MetId<MapRecord>>, id: string): Set<string> {
  const uit = new Set<string>([id]);
  let gegroeid = true;
  while (gegroeid) { gegroeid = false; for (const m of mappen) { const ouder = idOfNull(m.ouderId); if (ouder && uit.has(ouder) && !uit.has(m.id)) { uit.add(m.id); gegroeid = true; } } }
  uit.delete(id);
  return uit;
}
/** De hoogte van de tak onder (en mét) deze map: 1 = alleen zijzelf. Voor de dieptecontrole bij verplaatsen. */
function hoogte(mappen: Array<MetId<MapRecord>>, id: string): number {
  let hoogste = 1;
  for (const onder of nazaten(mappen, id)) {
    const k = ketting(mappen, onder);
    const vanaf = k.findIndex((m) => m.id === id);
    if (vanaf >= 0) hoogste = Math.max(hoogste, k.length - vanaf);
  }
  return hoogste;
}

// ------------------------------------------------------------------------------------------------ prullenbak en bytes
/** Bytes van dit record (huidige inhoud + alle versies) uit de opslag halen — alleen paden die écht in deze lade liggen. */
async function bytesWeg(lade: Lade, r: ItemRecord): Promise<void> {
  const paden = [str(r.storagePath), ...(Array.isArray(r.versies) ? r.versies.map((v) => str(v?.pad)) : [])]
    .filter((p) => p && padInLade(p, lade));
  if (paden.length) await storage.delete(paden).catch(() => undefined);
}
async function definitiefWeg(lade: Lade, r: MetId<ItemRecord>): Promise<void> {
  await bytesWeg(lade, r);
  await db.delete(ITEMS, [r.id]);
}
/** Lui opruimen: wat langer dan PRULLENBAK_DAGEN in de prullenbak ligt, verdwijnt echt. Geeft de overgebleven records terug. */
async function prullenbakOpruimen(lade: Lade, items: Array<MetId<ItemRecord>>): Promise<Array<MetId<ItemRecord>>> {
  const grens = Date.now() - LIMIET.prullenbakDagen * 24 * 3600 * 1000;
  const oud = items.filter((r) => { const op = Date.parse(str(r.verwijderdOp)); return Number.isFinite(op) && op < grens; });
  for (const r of oud) await definitiefWeg(lade, r);
  return oud.length ? items.filter((r) => !oud.includes(r)) : items;
}

// ------------------------------------------------------------------------------------------------ uploadsessies (OP SCHIJF)
// Sinds 29.10.2026 leeft elke uploadsessie op de SCHIJF van de server: `<UPLOADS_DIR>/.vnext-sessies/<uuid>/` met
// `sessie.json` (wie, wat, welke stukken binnen zijn) en het sparse-bestand `inhoud`. Daardoor overleeft een upload een
// netwerkbreuk, een gesloten tabblad én een serverherstart: de client vraagt 'status' of 'zoek' en gaat verder bij
// precies de ontbrekende stukken. Stukken mogen PARALLEL en in ELKE volgorde aankomen (positionele writes op het
// stukMax-raster; hetzelfde stuk nogmaals is idempotent). De geheugen-Map is alleen een cache; de waarheid staat op
// schijf en wordt atomisch (tmp+rename) bijgewerkt. TTL: SESSIE_UREN_MAX uur; opruimen gebeurt lui bij elke aanroep.
// De mapnaam begint met een punt: zulke paden kan resolveStoragePath nooit opleveren, dus de sessieboom en de echte
// opslag kunnen elkaar niet raken.
type UploadSessie = {
  userId: string; ruimte: Lade['ruimte']; naam: string; mime: string; bytes: number; mapId: string | null;
  stukken: Set<number>; laatst: number; slot: Promise<void>;
};
const sessies = new Map<string, UploadSessie>();
const SESSIE_TTL_MS = SESSIE_UREN_MAX * 3600 * 1000;
const SESSIES_PER_MENS = 8;
const SESSIE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sessieWortel = () => join(resolve(process.env.UPLOADS_DIR || '/srv/data/uploads'), '.vnext-sessies');
const sessieDir = (id: string) => { if (!SESSIE_ID.test(id)) fout('UPLOAD_ONBEKEND'); return join(sessieWortel(), id); };
const inhoudPad = (id: string) => join(sessieDir(id), 'inhoud');
const stukLengte = (index: number, bytes: number) => Math.min(LIMIET.stukMaxBytes, bytes - index * LIMIET.stukMaxBytes);
const ontvangenBytes = (s: UploadSessie) => { let n = 0; for (const i of s.stukken) n += stukLengte(i, s.bytes); return n; };

/** De vrije ruimte op de uploadschijf — overschrijfbaar voor tests (SCHIJF_VOL is anders niet na te bootsen). */
let vrijeBytes = async (): Promise<number | null> => {
  try { const s = await statfs(sessieWortel()); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
};
const SCHIJF_RESERVE = 256 * 1024 * 1024;

/** sessie.json atomisch wegschrijven; schrijfacties per sessie geserialiseerd via de slot-keten. */
function sessieBewaar(id: string, s: UploadSessie): Promise<void> {
  s.slot = s.slot.then(async () => {
    const tmp = join(sessieDir(id), `.json-${randomBytes(6).toString('hex')}`);
    const data = { userId: s.userId, ruimte: s.ruimte, naam: s.naam, mime: s.mime, bytes: s.bytes, mapId: s.mapId, stukken: [...s.stukken].sort((a, b) => a - b), laatst: s.laatst };
    await writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
    await rename(tmp, join(sessieDir(id), 'sessie.json'));
  }).catch(() => undefined);
  return s.slot;
}
/** Een sessie van schijf terughalen (na een herstart of in een ander proces-leven). null = bestaat niet of kapot. */
async function sessieLaad(id: string): Promise<UploadSessie | null> {
  try {
    const rauw = JSON.parse(await readFile(join(sessieDir(id), 'sessie.json'), 'utf8')) as Record<string, unknown>;
    const bytes = Number(rauw.bytes);
    if (!str(rauw.userId) || !Number.isInteger(bytes) || bytes < 1 || bytes > LIMIET.uploadMaxBytes) return null;
    const s: UploadSessie = {
      userId: str(rauw.userId), ruimte: rauw.ruimte === 'technisch' ? 'technisch' : 'prive', naam: schoneNaam(rauw.naam) || 'bestand',
      mime: schoneMime(rauw.mime) || 'application/octet-stream', bytes, mapId: idOfNull(rauw.mapId),
      stukken: new Set((Array.isArray(rauw.stukken) ? rauw.stukken : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < stukTotaal(bytes))),
      laatst: num(rauw.laatst) || Date.now(), slot: Promise.resolve(),
    };
    sessies.set(id, s);
    return s;
  } catch { return null; }
}
async function sessieWeg(id: string): Promise<void> {
  sessies.delete(id);
  if (SESSIE_ID.test(id)) await rm(join(sessieWortel(), id), { recursive: true, force: true }).catch(() => undefined);
}
/** Lui opruimen: verlopen sessies uit het geheugen én (begrensd) wees-mappen op schijf. */
async function sessiesOpruimen(): Promise<void> {
  const nu = Date.now();
  for (const [id, s] of sessies) if (nu - s.laatst > SESSIE_TTL_MS) await sessieWeg(id);
  try {
    const namen = (await readdir(sessieWortel())).filter((n) => SESSIE_ID.test(n)).slice(0, 200);
    for (const id of namen) {
      if (sessies.has(id)) continue;
      const s = await sessieLaad(id);
      if (!s || nu - s.laatst > SESSIE_TTL_MS) { sessies.delete(id); if (!s) await rm(join(sessieWortel(), id), { recursive: true, force: true }).catch(() => undefined); else await sessieWeg(id); }
    }
  } catch { /* geen sessieboom = niets op te ruimen */ }
}
/** De sessie van DEZE mens in DEZE lade — eerst het geheugen, dan de schijf. Verlopen → SESSIE_VERLOPEN. */
async function eigenSessie(id: unknown, userId: string, lade: Lade): Promise<{ id: string; s: UploadSessie }> {
  const schoon = idOfNull(id) || fout('UPLOAD_ONBEKEND');
  if (!SESSIE_ID.test(schoon)) fout('UPLOAD_ONBEKEND');
  const s = sessies.get(schoon) ?? await sessieLaad(schoon) ?? fout('UPLOAD_ONBEKEND');
  if (s.userId !== userId || s.ruimte !== lade.ruimte) fout('UPLOAD_ONBEKEND');
  if (Date.now() - s.laatst > SESSIE_TTL_MS) { await sessieWeg(schoon); fout('SESSIE_VERLOPEN'); }
  return { id: schoon, s };
}

/** Alleen voor tests: het geheugen leegmaken (nabootsing van een herstart) en de schijfmeting vervangen. */
export const cloudVnextProef = {
  wisSessieGeheugen: () => { sessies.clear(); },
  zetVrijeBytes: (fn: (() => Promise<number | null>) | null) => {
    vrijeBytes = fn ?? (async () => { try { const s = await statfs(sessieWortel()); return Number(s.bavail) * Number(s.bsize); } catch { return null; } });
  },
};

// ------------------------------------------------------------------------------------------------ mappenboom, lege bestanden & archieven (CLOUD-001)
const ARCHIEF_INVOER_MAX = 64 * 1024 * 1024;
const ARCHIEF_UITPAK_MAX = 128 * 1024 * 1024;
const ARCHIEF_ITEMS_MAX = 2500;

function schoonArchiefSegmenten(rauw: string): { segmenten: string[]; isMap: boolean } | null {
  const tekst = String(rauw || '').replace(/\\/g, '/').trim();
  if (!tekst || /[\u0000-\u001f]/.test(tekst)) return null;
  const isMap = tekst.endsWith('/');
  const rauweDelen = tekst.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (!rauweDelen.length) return null;
  if (rauweDelen.some((s) => s === '.' || s === '..')) return null;
  if (rauweDelen[0] === '__MACOSX' || rauweDelen[rauweDelen.length - 1] === '.DS_Store') return null;
  const segmenten = rauweDelen.map((s) => schoneNaam(s));
  if (segmenten.some((s) => !s)) return null;
  return { segmenten, isMap };
}

function leesTarBuffer(tarBuf: Buffer, alleenPaden?: Set<string>): { ingangen: CloudArchiefIngang[]; bestandenData: Map<string, Uint8Array>; totaalBytes: number } {
  const ingangen: CloudArchiefIngang[] = [];
  const bestandenData = new Map<string, Uint8Array>();
  const gezienePaden = new Set<string>();
  let totaalBytes = 0;
  let pos = 0;
  let langPad = '';
  const leesTekst = (vanaf: number, lengte: number): string => {
    const einde = Math.min(tarBuf.length, vanaf + lengte);
    let nul = vanaf;
    while (nul < einde && tarBuf[nul] !== 0) nul += 1;
    return tarBuf.subarray(vanaf, nul).toString('utf8').trim();
  };
  const leesOctaal = (vanaf: number, lengte: number): number => {
    const s = leesTekst(vanaf, lengte).replace(/[^0-7]/g, '');
    return s ? parseInt(s, 8) : 0;
  };
  while (pos + 512 <= tarBuf.length) {
    let leegBlok = true;
    for (let i = 0; i < 512; i += 1) { if (tarBuf[pos + i] !== 0) { leegBlok = false; break; } }
    if (leegBlok) break;
    const naamKop = leesTekst(pos, 100);
    const grootte = leesOctaal(pos + 124, 12);
    const tijdSec = leesOctaal(pos + 136, 12);
    const soortTeken = tarBuf[pos + 156] === 0 ? '0' : String.fromCharCode(tarBuf[pos + 156]);
    const voorvoegsel = leesTekst(pos + 345, 155);
    const dataStart = pos + 512;
    const blokken = Math.ceil(grootte / 512);
    const volgendePos = dataStart + blokken * 512;
    if (grootte < 0 || dataStart + grootte > tarBuf.length) fout('ARCHIEF_BESCHADIGD');
    if (soortTeken === 'L') {
      langPad = tarBuf.subarray(dataStart, dataStart + grootte).toString('utf8').replace(/\0+$/, '');
      pos = volgendePos;
      continue;
    }
    if (soortTeken === 'x' || soortTeken === 'g') {
      const paxTekst = tarBuf.subarray(dataStart, dataStart + grootte).toString('utf8');
      const m = /(?:^|\n)\d+ path=([^\n]+)\n/.exec(paxTekst);
      if (m?.[1]) langPad = m[1];
      pos = volgendePos;
      continue;
    }
    const volledigRauw = langPad || (voorvoegsel ? `${voorvoegsel}/${naamKop}` : naamKop);
    langPad = '';
    const isMap = soortTeken === '5' || volledigRauw.endsWith('/');
    const gewoonBestand = soortTeken === '0' || soortTeken === '\0' || soortTeken === '';
    if (isMap || gewoonBestand) {
      const schoon = schoonArchiefSegmenten(volledigRauw + (isMap ? '/' : ''));
      if (schoon) {
        const pad = schoon.segmenten.join('/');
        if (!gezienePaden.has(pad)) {
          gezienePaden.add(pad);
          if (ingangen.length >= ARCHIEF_ITEMS_MAX) fout('ARCHIEF_TE_VEEL_ITEMS');
          if (!isMap) {
            totaalBytes += grootte;
            if (totaalBytes > ARCHIEF_UITPAK_MAX) fout('ARCHIEF_TE_GROOT');
          }
          const naam = schoon.segmenten[schoon.segmenten.length - 1];
          const mime = isMap ? 'inode/directory' : veiligUploadMime('', naam);
          ingangen.push({
            pad,
            naam,
            map: isMap,
            bytes: isMap ? 0 : grootte,
            soort: isMap ? 'overig' : cloudSoort(mime, naam),
            gewijzigdOp: tijdSec > 0 ? new Date(tijdSec * 1000).toISOString() : null,
          });
          if (!isMap && (!alleenPaden || alleenPaden.has(pad))) {
            bestandenData.set(pad, new Uint8Array(tarBuf.subarray(dataStart, dataStart + grootte)));
          }
        }
      }
    }
    pos = volgendePos;
  }
  return { ingangen, bestandenData, totaalBytes };
}

function vulOuderMappenAan(ingangen: CloudArchiefIngang[]): CloudArchiefIngang[] {
  const geziene = new Set(ingangen.map((i) => i.pad));
  const extra: CloudArchiefIngang[] = [];
  for (const ing of ingangen) {
    const segs = ing.pad.split('/').filter(Boolean);
    for (let d = 1; d < segs.length; d += 1) {
      const ouderPad = segs.slice(0, d).join('/');
      if (!geziene.has(ouderPad)) {
        geziene.add(ouderPad);
        extra.push({
          pad: ouderPad,
          naam: segs[d - 1],
          map: true,
          bytes: 0,
          soort: 'overig',
          gewijzigdOp: null,
        });
      }
    }
  }
  return [...extra, ...ingangen];
}

/**
 * Leest en keurt een archiefbuffer (.zip, .tar, .tar.gz / .tgz) met strikte grenzen tegen archiefbommen en pad-ontsnapping.
 * Voor formaten zoals .7z/.rar/.xz/.zst geeft de functie eerlijk `{ ondersteund: false }` terug: opslaan en delen werken wél.
 */
export function leesArchiefUitBuffer(
  buf: Buffer,
  bestandsnaam: string,
  opties: { alleenLijst?: boolean; alleenPaden?: Set<string> } = {},
): { ondersteund: boolean; reden?: string; ingangen: CloudArchiefIngang[]; bestandenData: Map<string, Uint8Array>; totaalBytes: number } {
  if (buf.length > ARCHIEF_INVOER_MAX) fout('ARCHIEF_TE_GROOT');
  const lager = String(bestandsnaam || '').toLowerCase();
  const isZip = lager.endsWith('.zip') || (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b);
  const isTarGz = lager.endsWith('.tar.gz') || lager.endsWith('.tgz');
  const isTar = lager.endsWith('.tar');
  if (!isZip && !isTarGz && !isTar) {
    return { ondersteund: false, reden: 'ARCHIEF_FORMAAT_ALLEEN_OPSLAG', ingangen: [], bestandenData: new Map(), totaalBytes: 0 };
  }
  if (isTarGz || isTar) {
    let tarBuf = buf;
    if (isTarGz) {
      try { tarBuf = gunzipSync(buf, { maxOutputLength: ARCHIEF_UITPAK_MAX }); }
      catch (err) {
        const msg = String((err as Error)?.message || '');
        if (/maxOutputLength|Cannot create a Buffer/i.test(msg)) fout('ARCHIEF_TE_GROOT');
        fout('ARCHIEF_BESCHADIGD');
      }
    }
    const uit = leesTarBuffer(tarBuf, opties.alleenLijst ? new Set<string>() : opties.alleenPaden);
    return { ondersteund: true, ingangen: vulOuderMappenAan(uit.ingangen), bestandenData: uit.bestandenData, totaalBytes: uit.totaalBytes };
  }
  let totaalBytes = 0;
  let aantalGezien = 0;
  const rauwIngangen: Array<{ naam: string; bytes: number }> = [];
  let uitgepakt: Record<string, Uint8Array> = {};
  try {
    uitgepakt = unzipSync(new Uint8Array(buf), {
      filter: (info) => {
        aantalGezien += 1;
        if (aantalGezien > ARCHIEF_ITEMS_MAX) fout('ARCHIEF_TE_VEEL_ITEMS');
        const gr = Number(info.originalSize || 0);
        if (gr > 0) {
          totaalBytes += gr;
          if (totaalBytes > ARCHIEF_UITPAK_MAX) fout('ARCHIEF_TE_GROOT');
        }
        rauwIngangen.push({ naam: info.name, bytes: gr });
        if (opties.alleenLijst) return false;
        if (!opties.alleenPaden) return true;
        const schoon = schoonArchiefSegmenten(info.name);
        return Boolean(schoon && !schoon.isMap && opties.alleenPaden.has(schoon.segmenten.join('/')));
      },
    });
  } catch (err) {
    const code = String((err as Error)?.message || '');
    if (code === 'ARCHIEF_TE_GROOT' || code === 'ARCHIEF_TE_VEEL_ITEMS') throw err;
    fout('ARCHIEF_BESCHADIGD');
  }
  const ingangen: CloudArchiefIngang[] = [];
  const bestandenData = new Map<string, Uint8Array>();
  const gezienePaden = new Set<string>();
  for (const r of rauwIngangen) {
    const schoon = schoonArchiefSegmenten(r.naam);
    if (!schoon) continue;
    const pad = schoon.segmenten.join('/');
    if (gezienePaden.has(pad)) continue;
    gezienePaden.add(pad);
    const naam = schoon.segmenten[schoon.segmenten.length - 1];
    const mime = schoon.isMap ? 'inode/directory' : veiligUploadMime('', naam);
    const data = uitgepakt[r.naam];
    const bytes = schoon.isMap ? 0 : (data ? data.byteLength : Math.max(0, r.bytes));
    ingangen.push({
      pad,
      naam,
      map: schoon.isMap,
      bytes,
      soort: schoon.isMap ? 'overig' : cloudSoort(mime, naam),
      gewijzigdOp: null,
    });
    if (!schoon.isMap && data) bestandenData.set(pad, data);
  }
  return { ondersteund: true, ingangen: vulOuderMappenAan(ingangen), bestandenData, totaalBytes };
}

/** Zorgt idempotent voor alle gevraagde relatieve mappaden onder `ouderId` en geeft `relatiefPad -> mapId` terug. */
async function zorgMapPadenInLade(lade: Lade, ouderId: string | null, ruwePaden: string[][]): Promise<{ kaart: Record<string, string>; aangemaakt: number }> {
  const mappen = await eigenMappen(lade);
  if (ouderId && !mappen.some((m) => m.id === ouderId)) fout('MAP_ONBEKEND');
  const basisDiepte = diepte(mappen, ouderId);
  const schoneLijst: string[][] = [];
  for (const pad of ruwePaden.slice(0, 1000)) {
    if (!Array.isArray(pad) || !pad.length) continue;
    const segs = pad.map((s) => schoneNaam(s));
    if (segs.some((s) => !s)) fout('NAAM_ONGELDIG');
    if (basisDiepte + segs.length > LIMIET.mapDiepteMax) fout('MAP_DIEPTE');
    schoneLijst.push(segs);
  }
  const kinderenIndex = new Map<string, string>();
  for (const m of mappen) {
    const sleutel = `${idOfNull(m.ouderId) ?? ''}::${(str(m.naam) || '').toLowerCase()}`;
    if (!kinderenIndex.has(sleutel)) kinderenIndex.set(sleutel, m.id);
  }
  const kaart: Record<string, string> = {};
  if (ouderId) kaart[''] = ouderId;
  let totaalMappen = mappen.length;
  let aangemaakt = 0;
  const maxDiepte = schoneLijst.reduce((mx, p) => Math.max(mx, p.length), 0);
  for (let niveau = 1; niveau <= maxDiepte; niveau += 1) {
    const teMaken: Array<{ padSleutel: string; ouder: string | null; naam: string; indexSleutel: string }> = [];
    const gepland = new Set<string>();
    for (const segs of schoneLijst) {
      if (segs.length < niveau) continue;
      const voorPad = segs.slice(0, niveau - 1).join('/');
      const huidigePad = segs.slice(0, niveau).join('/');
      if (kaart[huidigePad]) continue;
      const ouder = niveau === 1 ? ouderId : (kaart[voorPad] || null);
      const naam = segs[niveau - 1];
      const idxSleutel = `${ouder ?? ''}::${naam.toLowerCase()}`;
      const bestaandId = kinderenIndex.get(idxSleutel);
      if (bestaandId) {
        kaart[huidigePad] = bestaandId;
      } else if (!gepland.has(idxSleutel)) {
        gepland.add(idxSleutel);
        teMaken.push({ padSleutel: huidigePad, ouder, naam, indexSleutel: idxSleutel });
      }
    }
    if (!teMaken.length) continue;
    if (totaalMappen + teMaken.length > LIMIET.mappenMax) fout('MAP_VOL');
    const nu = Date.now();
    const records = teMaken.map((item) => ({ ...ladeVelden(lade), naam: item.naam, ouderId: item.ouder, createdAt: nu }));
    const ids = await db.add(MAPPEN, records);
    for (let i = 0; i < teMaken.length; i += 1) {
      const nieuwId = ids[i];
      if (!nieuwId) throw new Error('CLOUD_MAP_AANMAKEN_MISLUKT');
      kinderenIndex.set(teMaken[i].indexSleutel, nieuwId);
      kaart[teMaken[i].padSleutel] = nieuwId;
      totaalMappen += 1;
      aangemaakt += 1;
    }
    for (const segs of schoneLijst) {
      if (segs.length < niveau) continue;
      const voorPad = segs.slice(0, niveau - 1).join('/');
      const huidigePad = segs.slice(0, niveau).join('/');
      if (!kaart[huidigePad]) {
        const ouder = niveau === 1 ? ouderId : (kaart[voorPad] || null);
        const gevonden = kinderenIndex.get(`${ouder ?? ''}::${segs[niveau - 1].toLowerCase()}`);
        if (gevonden) kaart[huidigePad] = gevonden;
      }
    }
  }
  return { kaart, aangemaakt };
}

/** Schrijft een buffer (inclusief 0 bytes) atomisch naar de lade-opslag en werkt `cloud_items_v1` (met versiebeheer) bij. */
async function schrijfBestandBufferInLade(
  lade: Lade,
  userId: string,
  naamRauw: string,
  mimeRauw: string,
  inhoud: Buffer,
  mapIdRauw: string | null,
  bestaandeLijst?: Array<MetId<ItemRecord>>,
  bron = 'upload',
): Promise<MetId<ItemRecord>> {
  const naam = schoneNaam(naamRauw) || fout('NAAM_ONGELDIG');
  const mime = schoneMime(veiligUploadMime(mimeRauw, naam));
  if (!mimeToegestaan(mime)) fout('MIME_NIET_TOEGESTAAN');
  const vrij = await vrijeBytes();
  if (vrij !== null && vrij < inhoud.length + SCHIJF_RESERVE) fout('SCHIJF_VOL');
  await mkdir(sessieWortel(), { recursive: true, mode: 0o700 });
  const tmpPad = join(sessieWortel(), `.direct-${randomUUID()}`);
  await writeFile(tmpPad, inhoud, { mode: 0o600 });
  const nu = Date.now();
  const storagePath = `${cloudVoorvoegsel(lade)}/${nu}-${randomBytes(10).toString('hex')}${extensie(naam)}`;
  try {
    const [geschreven] = await storage.writeVanPad([{ path: storagePath, vanPad: tmpPad, contentType: mime, ownerId: userId }]);
    if (!geschreven) throw new Error('CLOUD_OPSLAG_SCHRIJVEN_MISLUKT');
  } finally {
    await rm(tmpPad, { force: true }).catch(() => undefined);
  }
  const echt = createHash('sha256').update(inhoud).digest('hex');
  const items = bestaandeLijst ?? await eigenItems(lade);
  const bestaand = items.find((r) => !str(r.verwijderdOp) && (r.kind ?? 'file') === 'file' && buitenNaam(r) === naam && (idOfNull(r.mapId) ?? null) === mapIdRauw);
  if (bestaand) {
    const versies: Versie[] = [...(Array.isArray(bestaand.versies) ? bestaand.versies : [])];
    if (str(bestaand.storagePath)) versies.push({ pad: str(bestaand.storagePath), bytes: num(bestaand.sizeBytes), sha256: str(bestaand.sha256), op: iso(num(bestaand.updatedAt) || num(bestaand.createdAt)) });
    while (versies.length > LIMIET.versiesMax) {
      const afgevallen = versies.shift();
      if (afgevallen && padInLade(afgevallen.pad, lade)) await storage.delete([afgevallen.pad]).catch(() => undefined);
    }
    const record: ItemRecord = { ...zonderId(bestaand), storagePath, sizeBytes: inhoud.length, mimeType: mime, sha256: echt, versies, mapId: mapIdRauw, updatedAt: nu, bron: str(bestaand.bron) || bron };
    const [gelukt] = await db.update(ITEMS, [{ id: bestaand.id, record: record as Record<string, unknown> }]);
    if (!gelukt) { await storage.delete([storagePath]).catch(() => undefined); throw new Error('CLOUD_BIJWERKEN_MISLUKT'); }
    return { ...record, id: bestaand.id };
  }
  const record: ItemRecord = {
    ...ladeVelden(lade), workspaceId: '', suggestedWorkspaceId: '', kind: 'file', title: naam, originalName: naam,
    description: '', textContent: '', sourceUrl: '', mimeType: mime, sizeBytes: inhoud.length, storagePath,
    tags: [], people: [], status: 'captured', aiState: 'fallback', aiConfidence: 0, createdAt: nu, updatedAt: nu, openedAt: 0,
    mapId: mapIdRauw, favoriet: false, verwijderdOp: null, versies: [], sha256: echt, bron,
  };
  const [nieuwId] = await db.add(ITEMS, [record as Record<string, unknown>]);
  if (!nieuwId) { await storage.delete([storagePath]).catch(() => undefined); throw new Error('CLOUD_AANMAKEN_MISLUKT'); }
  return { ...record, id: nieuwId };
}

/** Poort voor `backend/bestanden-delen.ts`: leest de niet-verwijderde bestanden en mappen van één lade. */
export async function leesLadeInventarisVoorDelen(lade: Lade, alsSysteemLezen = false): Promise<{ bestanden: CloudBestand[]; mappen: CloudMap[] }> {
  const laad = async () => {
    const [items, mappen] = await Promise.all([eigenItems(lade), eigenMappen(lade)]);
    const actief = items.filter((r) => !str(r.verwijderdOp));
    const perMap = new Map<string, number>();
    for (const r of actief) { const m = idOfNull(r.mapId); if (m) perMap.set(m, (perMap.get(m) || 0) + 1); }
    return {
      bestanden: actief.map(naarBuiten),
      mappen: mappen.map((m) => buitenMap(m, perMap.get(m.id) || 0)),
    };
  };
  return alsSysteemLezen ? alsSysteem(laad) : laad();
}

/** Poort voor `backend/bestanden-delen.ts`: leest één niet-verwijderd bestand (of exact bytebereik) uit een gecontroleerde lade. */
export async function leesLadeBestandVoorDelen(
  lade: Lade,
  id: string,
  opties: { offset?: number; lengte?: number; enkelMeta?: boolean; alsSysteemLezen?: boolean } = {},
): Promise<{ bestand: CloudBestand; data: Buffer; totaalBytes: number } | null> {
  const laad = async () => {
    const r = await eenItem(lade, id);
    if (!r || str(r.verwijderdOp)) return null;
    const bestand = naarBuiten(r);
    if (opties.enkelMeta) return { bestand, data: Buffer.alloc(0), totaalBytes: bestand.bytes };
    const kind = r.kind === 'note' || r.kind === 'link' ? r.kind : 'file';
    if (kind !== 'file') {
      const volledig = Buffer.from(kind === 'note' ? str(r.textContent) : str(r.sourceUrl), 'utf8');
      if (opties.offset !== undefined) {
        const off = Math.max(0, opties.offset);
        const len = opties.lengte !== undefined ? Math.max(0, opties.lengte) : volledig.length - off;
        return { bestand: { ...bestand, bytes: volledig.length, mime: kind === 'note' ? 'text/plain' : 'text/uri-list' }, data: volledig.subarray(off, off + len), totaalBytes: volledig.length };
      }
      return { bestand: { ...bestand, bytes: volledig.length, mime: kind === 'note' ? 'text/plain' : 'text/uri-list' }, data: volledig, totaalBytes: volledig.length };
    }
    const pad = str(r.storagePath);
    if (!pad || !padInLade(pad, lade)) return null;
    const bytes = num(r.sizeBytes);
    if (bytes === 0) return { bestand, data: Buffer.alloc(0), totaalBytes: 0 };
    if (opties.offset !== undefined) {
      const off = opties.offset;
      const len = opties.lengte ?? LIMIET.downloadDeelBytes;
      if (!Number.isInteger(off) || off < 0 || off >= bytes || !Number.isInteger(len) || len < 1) return null;
      const deel = await storage.leesDeel(pad, off, len, { eigenaar: str(r.ownerUserId) || lade.userId });
      if (!deel) return null;
      return { bestand, data: deel.data, totaalBytes: deel.totaal };
    }
    if (bytes > LIMIET.downloadMaxBytes) fout('TE_GROOT');
    const [gelezen] = await storage.read([pad], { eigenaar: str(r.ownerUserId) || lade.userId });
    if (!gelezen || gelezen.content === null) return null;
    return { bestand, data: Buffer.from(gelezen.content, 'base64'), totaalBytes: bytes };
  };
  return opties.alsSysteemLezen ? alsSysteem(laad) : laad();
}

// ------------------------------------------------------------------------------------------------ routes
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
const bodyOf = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
const DIENSTEN = ['cloud', 'hub'] as const;
const FOUT_404 = new Set(['MAP_ONBEKEND', 'BESTAND_ONBEKEND', 'UPLOAD_ONBEKEND', 'VERSIE_ONBEKEND', 'ARCHIEF_BESTAND_ONBEKEND']);
const CODE_PATROON = /^[A-Z][A-Z_]{2,39}$/;

export function cloudVnextBestandenRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  type Run = (ctx: Ctx, auth: SessionOk, lade: Lade, d: Record<string, unknown>) => Promise<Resp>;
  const route = (run: Run): RouterMiddleware[] => [(async (raw: unknown) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    try { return await run(ctx, auth, ladeOf(auth.user.id), bodyOf(ctx.body)); }
    catch (err) {
      const code = String((err as Error)?.message || '');
      if (CODE_PATROON.test(code) && !code.startsWith('CLOUD_') && !code.startsWith('DB_')) return error(code, FOUT_404.has(code) ? 404 : 400);
      console.error('[cloud-vnext]', code);
      return error(code.slice(0, 80) || 'CLOUD_VNEXT_FOUT', 500);
    }
  }) as unknown as RouterMiddleware];

  // ---------------------------------------------------------------- overzicht
  const overzicht: Run = async (_c, auth, lade) => {
    const [itemsRauw, mappen, werkruimtes] = await Promise.all([
      eigenItems(lade), eigenMappen(lade),
      alleRecords<WerkruimteRecord>(WERKRUIMTES, ladeFilter(lade)),
    ]);
    const items = can(auth.user, 'cloud.write') && !isAlleenLezen() ? await prullenbakOpruimen(lade, itemsRauw) : itemsRauw;
    const actief = items.filter((r) => !str(r.verwijderdOp));
    const buiten = actief.map(naarBuiten);
    const perSoort: Partial<Record<CloudSoort, { aantal: number; bytes: number }>> = {};
    let totaalBytes = 0;
    for (const b of buiten) { const vak = perSoort[b.soort] ?? (perSoort[b.soort] = { aantal: 0, bytes: 0 }); vak.aantal += 1; vak.bytes += b.bytes; totaalBytes += b.bytes; }
    const laatst = (r: MetId<ItemRecord>) => Math.max(num(r.openedAt), num(r.updatedAt), num(r.createdAt));
    const recent = [...actief].sort((a, b) => laatst(b) - laatst(a)).slice(0, 8).map(naarBuiten);
    const favorieten = actief.filter((r) => r.favoriet === true).sort((a, b) => num(b.updatedAt) - num(a.updatedAt)).slice(0, 8).map(naarBuiten);
    const perMap = new Map<string, number>();
    for (const r of actief) { const m = idOfNull(r.mapId); if (m) perMap.set(m, (perMap.get(m) || 0) + 1); }
    const wortel = mappen.filter((m) => !idOfNull(m.ouderId)).map((m) => buitenMap(m, perMap.get(m.id) || 0)).sort((a, b) => a.naam.localeCompare(b.naam, 'uk'));
    const actieveWerkruimtes = werkruimtes.filter((w) => hoortBij(w, lade) && (w.status ?? 'active') === 'active' && !num(w.archivedAt));
    const workspaces = actieveWerkruimtes
      .map((w) => ({ id: w.id, titel: str(w.title) || 'Werkruimte', aantal: actief.filter((r) => str(r.workspaceId) === w.id).length }))
      .sort((a, b) => b.aantal - a.aantal);
    return json({ stats: { aantal: actief.length, bytes: totaalBytes, perSoort }, recent, favorieten, prullenbak: items.length - actief.length, mappen: wortel, workspaces });
  };

  // ---------------------------------------------------------------- bestanden (lijst met filters, sortering, paginering)
  const bestanden: Run = async (_c, auth, lade, d) => {
    // ZOEKDIEP-001 (05.11.2026): één bestand op id (diepe link ?open_item_id= uit de zoekindex). eenItem controleert de lade,
    // dus een id van iemand anders geeft gewoon een lege lijst.
    if (d.id !== undefined) {
      const r = await eenItem(lade, d.id);
      return json({ bestanden: r ? [naarBuiten(r)] : [], mappen: [], pad: [], volgende: null, totaal: r ? 1 : 0 });
    }
    const [itemsRauw, mappen] = await Promise.all([eigenItems(lade), eigenMappen(lade)]);
    const prullenbak = d.prullenbak === true;
    const items = prullenbak && can(auth.user, 'cloud.write') && !isAlleenLezen() ? await prullenbakOpruimen(lade, itemsRauw) : itemsRauw;
    const mapId = idOfNull(d.mapId);
    const huidige = mapId ? mappen.find((m) => m.id === mapId) ?? fout('MAP_ONBEKEND') : null;
    const zoek = str(d.zoek).trim().toLowerCase().slice(0, LIMIET.zoekMax);
    const soort = str(d.soort);
    const tagRauw = str(d.tag).trim();
    if (tagRauw && !schoneTag(tagRauw)) fout('TAG_ONGELDIG');
    const tag = tagRauw.toLowerCase();
    const favoriet = d.favoriet === true;
    const workspaceId = idOfNull(d.workspaceId);
    // Bladeren (één map tonen) alléén zonder dwarsfilters; mét een filter zoekt de lijst door ALLE mappen —
    // tenzij de vraag óók een mapId draagt, dan blijft die de grens.
    const bladeren = !prullenbak && !zoek && !soort && !tag && !favoriet && !workspaceId;
    const inScope = (r: MetId<ItemRecord>) => (mapId !== null || bladeren ? (idOfNull(r.mapId) ?? null) === (mapId ?? null) : true);
    const gefilterd = items.filter((r) => {
      if (Boolean(str(r.verwijderdOp)) !== prullenbak) return false;
      if (!inScope(r)) return false;
      if (favoriet && r.favoriet !== true) return false;
      if (workspaceId && str(r.workspaceId) !== workspaceId) return false;
      if (soort && soortVan(r) !== soort) return false;
      if (tag && !(Array.isArray(r.tags) && (r.tags as unknown[]).some((t) => String(t).toLowerCase() === tag))) return false;
      if (zoek) {
        const hooi = `${str(r.title)}\n${str(r.originalName)}\n${str(r.description)}\n${Array.isArray(r.tags) ? (r.tags as unknown[]).join(' ') : ''}`.toLowerCase();
        if (!hooi.includes(zoek)) return false;
      }
      return true;
    }).map(naarBuiten);
    const sorteer: CloudSortering = (CLOUD_SORTERING as readonly string[]).includes(str(d.sorteer)) ? (str(d.sorteer) as CloudSortering) : 'datum';
    const oplopend = typeof d.oplopend === 'boolean' ? d.oplopend : sorteer === 'naam';
    const kleiner = (a: CloudBestand, b: CloudBestand): number =>
      sorteer === 'naam' ? a.naam.localeCompare(b.naam, 'uk')
        : sorteer === 'grootte' ? a.bytes - b.bytes
          : sorteer === 'soort' ? (a.soort === b.soort ? a.naam.localeCompare(b.naam, 'uk') : a.soort.localeCompare(b.soort))
            : a.bijgewerktOp.localeCompare(b.bijgewerktOp);
    gefilterd.sort((a, b) => (oplopend ? kleiner(a, b) : kleiner(b, a)));
    const token = str(d.token);
    const vanaf = /^o\d{1,7}$/.test(token) ? Number(token.slice(1)) : 0;
    const pagina = gefilterd.slice(vanaf, vanaf + LIMIET.lijstPagina);
    const volgende = vanaf + LIMIET.lijstPagina < gefilterd.length ? `o${vanaf + LIMIET.lijstPagina}` : null;
    const perMap = new Map<string, number>();
    for (const r of items) if (!str(r.verwijderdOp)) { const m = idOfNull(r.mapId); if (m) perMap.set(m, (perMap.get(m) || 0) + 1); }
    const onderliggend = prullenbak ? [] : mappen
      .filter((m) => (idOfNull(m.ouderId) ?? null) === (mapId ?? null))
      .map((m) => buitenMap(m, perMap.get(m.id) || 0)).sort((a, b) => a.naam.localeCompare(b.naam, 'uk'));
    return json({ bestanden: pagina, mappen: onderliggend, pad: huidige ? ketting(mappen, huidige.id).map((m) => buitenMap(m)) : [], volgende, totaal: gefilterd.length });
  };

  // ---------------------------------------------------------------- map (nieuw / hernoem / verplaats / verwijder)
  const map: Run = async (_c, auth, lade, d) => {
    const denied = denyMutation(auth.user, 'cloud.write'); if (denied) return denied;
    const actie = str(d.actie);
    if (actie === 'paden_zorg') {
      const ouderId = idOfNull(d.ouderId);
      const rauwePaden = Array.isArray(d.paden)
        ? (d.paden as unknown[]).map((p) => (Array.isArray(p) ? p.map((s) => String(s ?? '')) : []))
        : [];
      const uit = await zorgMapPadenInLade(lade, ouderId, rauwePaden);
      return json(uit);
    }
    const mappen = await eigenMappen(lade);
    const eigenMap = (id: unknown) => mappen.find((m) => m.id === idOfNull(id)) ?? fout('MAP_ONBEKEND');
    if (actie === 'nieuw') {
      const naam = schoneNaam(d.naam) || fout('NAAM_ONGELDIG');
      const ouderId = idOfNull(d.ouderId);
      if (ouderId) eigenMap(ouderId);
      if (mappen.length >= LIMIET.mappenMax) fout('MAP_VOL');
      if (diepte(mappen, ouderId) + 1 > LIMIET.mapDiepteMax) fout('MAP_DIEPTE');
      const record = { ...ladeVelden(lade), naam, ouderId, createdAt: Date.now() };
      const [id] = await db.add(MAPPEN, [record]);
      if (!id) throw new Error('CLOUD_MAP_AANMAKEN_MISLUKT');
      return json({ map: buitenMap({ ...record, id }, 0) });
    }
    if (actie === 'hernoem') {
      const m = eigenMap(d.id);
      const naam = schoneNaam(d.naam) || fout('NAAM_ONGELDIG');
      const record = { ...zonderId(m), naam };
      await db.update(MAPPEN, [{ id: m.id, record }]);
      return json({ map: buitenMap({ ...record, id: m.id }) });
    }
    if (actie === 'verplaats') {
      const m = eigenMap(d.id);
      const ouderId = idOfNull(d.ouderId);
      if (ouderId) {
        eigenMap(ouderId);
        if (ouderId === m.id || nazaten(mappen, m.id).has(ouderId)) fout('MAP_IN_ZICHZELF');
      }
      if (diepte(mappen, ouderId) + hoogte(mappen, m.id) > LIMIET.mapDiepteMax) fout('MAP_DIEPTE');
      const record = { ...zonderId(m), ouderId };
      await db.update(MAPPEN, [{ id: m.id, record }]);
      return json({ map: buitenMap({ ...record, id: m.id }) });
    }
    if (actie === 'verwijder') {
      const m = eigenMap(d.id);
      const weg = new Set<string>([m.id, ...nazaten(mappen, m.id)]);
      const items = await eigenItems(lade);
      const nu = Date.now();
      const getroffen = items.filter((r) => { const in_ = idOfNull(r.mapId); return in_ !== null && weg.has(in_); });
      let naarPrullenbak = 0;
      const wijzigingen = getroffen.map((r) => {
        const record: ItemRecord = { ...zonderId(r), mapId: null, updatedAt: nu };
        if (!str(r.verwijderdOp)) { record.verwijderdOp = iso(nu); naarPrullenbak += 1; }
        return { id: r.id, record: record as Record<string, unknown> };
      });
      for (let i = 0; i < wijzigingen.length; i += 400) await db.update(ITEMS, wijzigingen.slice(i, i + 400));
      const mapIds = [...weg];
      for (let i = 0; i < mapIds.length; i += 400) await db.delete(MAPPEN, mapIds.slice(i, i + 400));
      return json({ aantal: naarPrullenbak });
    }
    return fout('ACTIE_ONGELDIG');
  };

  // ---------------------------------------------------------------- bestand (hernoem / verplaats / tags / favoriet / prullenbak / nieuw_leeg)
  const bestand: Run = async (_c, auth, lade, d) => {
    const denied = denyMutation(auth.user, 'cloud.write'); if (denied) return denied;
    const actie = str(d.actie);
    if (actie === 'nieuw_leeg') {
      const mapId = idOfNull(d.mapId);
      if (mapId) {
        const mappenLijst = await eigenMappen(lade);
        if (!mappenLijst.some((m) => m.id === mapId)) fout('MAP_ONBEKEND');
      }
      const uit = await schrijfBestandBufferInLade(lade, auth.user.id, str(d.naam), str(d.mime), Buffer.alloc(0), mapId);
      return json({ bestand: naarBuiten(uit) });
    }
    const enkel = !Array.isArray(d.ids);
    const ids = (Array.isArray(d.ids) ? d.ids.map(idOfNull).filter((x): x is string => x !== null) : [idOfNull(d.id)].filter((x): x is string => x !== null)).slice(0, 400);
    if (!ids.length) fout('BESTAND_ONBEKEND');
    const records: Array<MetId<ItemRecord>> = [];
    for (const id of ids) records.push((await eenItem(lade, id)) ?? fout('BESTAND_ONBEKEND'));
    const nu = Date.now();
    const mappen = actie === 'verplaats' || actie === 'herstel' ? await eigenMappen(lade) : [];
    let laatste: MetId<ItemRecord> | null = null;
    const pasToe = async (maak: (r: MetId<ItemRecord>) => ItemRecord | null): Promise<number> => {
      const wijzigingen: Array<{ id: string; record: Record<string, unknown> }> = [];
      for (const r of records) {
        const record = maak(r);
        if (!record) continue;
        wijzigingen.push({ id: r.id, record: record as Record<string, unknown> });
        laatste = { ...record, id: r.id };
      }
      if (wijzigingen.length) await db.update(ITEMS, wijzigingen);
      return wijzigingen.length;
    };
    let aantal = 0;
    if (actie === 'hernoem') {
      const naam = schoneNaam(d.naam) || fout('NAAM_ONGELDIG');
      aantal = await pasToe((r) => ({ ...zonderId(r), title: naam, updatedAt: nu }));
    } else if (actie === 'verplaats') {
      const mapId = idOfNull(d.mapId);
      if (mapId && !mappen.some((m) => m.id === mapId)) fout('MAP_ONBEKEND');
      aantal = await pasToe((r) => ({ ...zonderId(r), mapId, updatedAt: nu }));
    } else if (actie === 'tags') {
      if (!Array.isArray(d.tags)) fout('TAG_ONGELDIG');
      const rauw = d.tags as unknown[];
      if (rauw.length > LIMIET.tagsMax) fout('LIMIET_BEREIKT');
      const tags = [...new Set(rauw.map((t) => schoneTag(t)))];
      if (rauw.length && tags.some((t) => !t)) fout('TAG_ONGELDIG');
      aantal = await pasToe((r) => ({ ...zonderId(r), tags: tags.filter(Boolean), updatedAt: nu }));
    } else if (actie === 'favoriet') {
      const f = d.favoriet === true;
      aantal = await pasToe((r) => ({ ...zonderId(r), favoriet: f, updatedAt: nu }));
    } else if (actie === 'verwijder') {
      aantal = await pasToe((r) => (str(r.verwijderdOp) ? null : { ...zonderId(r), verwijderdOp: iso(nu), updatedAt: nu }));
    } else if (actie === 'herstel') {
      if (records.some((r) => !str(r.verwijderdOp))) fout('NIET_IN_PRULLENBAK');
      aantal = await pasToe((r) => {
        const mapId = idOfNull(r.mapId);
        return { ...zonderId(r), verwijderdOp: null, mapId: mapId && mappen.some((m) => m.id === mapId) ? mapId : null, updatedAt: nu };
      });
    } else if (actie === 'definitief') {
      if (records.some((r) => !str(r.verwijderdOp))) fout('NIET_IN_PRULLENBAK');
      for (const r of records) await definitiefWeg(lade, r);
      return json({ aantal: records.length });
    } else return fout('ACTIE_ONGELDIG');
    return enkel && laatste ? json({ bestand: naarBuiten(laatste) }) : json({ aantal });
  };

  // ---------------------------------------------------------------- upload (begin / stuk / status / zoek / klaar / afbreken)
  const upload: Run = async (_c, auth, lade, d) => {
    const actie = str(d.actie);
    if (actie !== 'status' && actie !== 'zoek') {
      const denied = denyMutation(auth.user, 'cloud.write'); if (denied) return denied;
      await sessiesOpruimen();
    }
    if (actie === 'begin') {
      const naam = schoneNaam(d.naam) || fout('NAAM_ONGELDIG');
      const mime = schoneMime(d.mime);
      if (!mimeToegestaan(mime)) fout('MIME_NIET_TOEGESTAAN');
      const bytes = Number(d.bytes);
      if (!Number.isInteger(bytes) || bytes < 1 || bytes > LIMIET.uploadMaxBytes) fout('TE_GROOT');
      // De enige ECHTE grens van de eigen opslag is de schijf: meten vóór we beginnen, met een reserve.
      const vrij = await vrijeBytes();
      if (vrij !== null && vrij < bytes + SCHIJF_RESERVE) return json({ error: 'SCHIJF_VOL', vrijBytes: vrij, nodigBytes: bytes + SCHIJF_RESERVE }, 400);
      const mapId = idOfNull(d.mapId);
      if (mapId) { const mappen = await eigenMappen(lade); if (!mappen.some((m) => m.id === mapId)) fout('MAP_ONBEKEND'); }
      let lopend = 0;
      for (const s of sessies.values()) if (s.userId === auth.user.id) lopend += 1;
      if (lopend >= SESSIES_PER_MENS) fout('LIMIET_BEREIKT');
      const id = randomUUID();
      await mkdir(sessieDir(id), { recursive: true, mode: 0o700 });
      await writeFile(inhoudPad(id), Buffer.alloc(0), { mode: 0o600 });
      const s: UploadSessie = { userId: auth.user.id, ruimte: lade.ruimte, naam, mime, bytes, mapId, stukken: new Set(), laatst: Date.now(), slot: Promise.resolve() };
      sessies.set(id, s);
      await sessieBewaar(id, s);
      return json({ id, stukMax: LIMIET.stukMaxBytes, ontvangen: 0 });
    }
    if (actie === 'stuk') {
      const { id, s } = await eigenSessie(d.id, auth.user.id, lade);
      const offset = Number(d.offset);
      if (!geldigStukOffset(offset, s.bytes)) fout('STUK_BUITEN_ORDE');
      const data = str(d.data);
      if (!data || data.length % 4 !== 0 || !BASE64.test(data)) fout('STUK_BUITEN_ORDE');
      const stuk = Buffer.from(data, 'base64');
      const index = offset / LIMIET.stukMaxBytes;
      // Elk stuk is exact zijn rasterlengte (het laatste korter): zo is «compleet» = «alle indexen binnen».
      if (stuk.length !== stukLengte(index, s.bytes)) fout(stuk.length > LIMIET.stukMaxBytes ? 'TE_GROOT' : 'STUK_BUITEN_ORDE');
      // Positioneel schrijven: stukken mogen parallel en in elke volgorde komen; hetzelfde stuk nogmaals is idempotent.
      const fh = await open(inhoudPad(id), 'r+');
      try { await fh.write(stuk, 0, stuk.length, offset); } finally { await fh.close(); }
      s.stukken.add(index);
      s.laatst = Date.now();
      await sessieBewaar(id, s);
      return json({ ontvangen: ontvangenBytes(s) });
    }
    if (actie === 'status') {
      const { id, s } = await eigenSessie(d.id, auth.user.id, lade);
      return json({ id, naam: s.naam, bytes: s.bytes, stukMax: LIMIET.stukMaxBytes, ontvangen: ontvangenBytes(s), ontbreekt: ontbrekendeStukken(s.bytes, s.stukken) });
    }
    if (actie === 'zoek') {
      // Hervatten na herladen: dezelfde naam + grootte (+ map) van DEZE mens in DEZE lade. Eerst de schijf inlezen.
      const naam = schoneNaam(d.naam);
      const bytes = Number(d.bytes);
      const mapId = idOfNull(d.mapId);
      if (!naam || !Number.isInteger(bytes) || bytes < 1) return json({ sessie: null });
      try { for (const nm of (await readdir(sessieWortel())).filter((n) => SESSIE_ID.test(n)).slice(0, 200)) if (!sessies.has(nm)) await sessieLaad(nm); } catch { /* geen boom */ }
      for (const [id, s] of sessies) {
        if (s.userId !== auth.user.id || s.ruimte !== lade.ruimte) continue;
        if (Date.now() - s.laatst > SESSIE_TTL_MS) continue;
        if (s.naam === naam && s.bytes === bytes && (s.mapId ?? null) === (mapId ?? null)) return json({ sessie: { id, ontvangen: ontvangenBytes(s) } });
      }
      return json({ sessie: null });
    }
    if (actie === 'klaar') {
      const { id, s } = await eigenSessie(d.id, auth.user.id, lade);
      if (s.stukken.size !== stukTotaal(s.bytes)) fout('STUK_BUITEN_ORDE');
      const beweerd = str(d.sha256).toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(beweerd)) { await sessieWeg(id); fout('SHA_MISMATCH'); }
      // Stromende sha256 — een bestand van gigabytes komt nooit heel in het geheugen.
      const hash = createHash('sha256');
      await new Promise<void>((klaarMee, mis) => { const str_ = createReadStream(inhoudPad(id)); str_.on('data', (deel) => hash.update(deel)); str_.on('end', () => klaarMee()); str_.on('error', mis); });
      const echt = hash.digest('hex');
      if (echt !== beweerd) { await sessieWeg(id); fout('SHA_MISMATCH'); }
      const [mappen, items] = await Promise.all([eigenMappen(lade), eigenItems(lade)]);
      const mapId = s.mapId && mappen.some((m) => m.id === s.mapId) ? s.mapId : null; // de map kan intussen verwijderd zijn → wortel
      const nu = Date.now();
      const storagePath = `${cloudVoorvoegsel(lade)}/${nu}-${randomBytes(10).toString('hex')}${extensie(s.naam)}`;
      // writeVanPad: ruwe bytes, stromende sha, nooit heel in RAM; de metadata-encoding is base64, dus read/leesDeel kloppen.
      const [geschreven] = await storage.writeVanPad([{ path: storagePath, vanPad: inhoudPad(id), contentType: s.mime, ownerId: auth.user.id }]);
      if (!geschreven) throw new Error('CLOUD_OPSLAG_SCHRIJVEN_MISLUKT');
      // Zelfde naam in dezelfde map (en niet in de prullenbak) = VERVANGEN: de vorige inhoud blijft als versie.
      const bestaand = items.find((r) => !str(r.verwijderdOp) && (r.kind ?? 'file') === 'file' && buitenNaam(r) === s.naam && (idOfNull(r.mapId) ?? null) === mapId);
      let uit: MetId<ItemRecord>;
      if (bestaand) {
        const versies: Versie[] = [...(Array.isArray(bestaand.versies) ? bestaand.versies : [])];
        if (str(bestaand.storagePath)) versies.push({ pad: str(bestaand.storagePath), bytes: num(bestaand.sizeBytes), sha256: str(bestaand.sha256), op: iso(num(bestaand.updatedAt) || num(bestaand.createdAt)) });
        while (versies.length > LIMIET.versiesMax) { const afgevallen = versies.shift(); if (afgevallen && padInLade(afgevallen.pad, lade)) await storage.delete([afgevallen.pad]).catch(() => undefined); }
        const record: ItemRecord = { ...zonderId(bestaand), storagePath, sizeBytes: s.bytes, mimeType: s.mime, sha256: echt, versies, mapId, updatedAt: nu, bron: str(bestaand.bron) || 'upload' };
        const [gelukt] = await db.update(ITEMS, [{ id: bestaand.id, record: record as Record<string, unknown> }]);
        if (!gelukt) { await storage.delete([storagePath]).catch(() => undefined); throw new Error('CLOUD_BIJWERKEN_MISLUKT'); }
        uit = { ...record, id: bestaand.id };
      } else {
        const record: ItemRecord = {
          ...ladeVelden(lade), workspaceId: '', suggestedWorkspaceId: '', kind: 'file', title: s.naam, originalName: s.naam,
          description: '', textContent: '', sourceUrl: '', mimeType: s.mime, sizeBytes: s.bytes, storagePath,
          tags: [], people: [], status: 'captured', aiState: 'fallback', aiConfidence: 0, createdAt: nu, updatedAt: nu, openedAt: 0,
          mapId, favoriet: false, verwijderdOp: null, versies: [], sha256: echt, bron: 'upload',
        };
        const [nieuwId] = await db.add(ITEMS, [record as Record<string, unknown>]);
        if (!nieuwId) { await storage.delete([storagePath]).catch(() => undefined); throw new Error('CLOUD_AANMAKEN_MISLUKT'); }
        uit = { ...record, id: nieuwId };
      }
      await sessieWeg(id);
      return json({ bestand: naarBuiten(uit) });
    }
    if (actie === 'afbreken') {
      const { id } = await eigenSessie(d.id, auth.user.id, lade);
      await sessieWeg(id);
      return json({ ok: true });
    }
    return fout('ACTIE_ONGELDIG');
  };

  // ---------------------------------------------------------------- download (hele inhoud of één versie, base64 in JSON)
  const download: Run = async (_c, auth, lade, d) => {
    const r = (await eenItem(lade, d.id)) ?? fout('BESTAND_ONBEKEND');
    const kind = r.kind === 'note' || r.kind === 'link' ? r.kind : 'file';
    if (kind !== 'file') {
      // Een notitie of koppeling heeft geen opslagbytes: de tekst zelf is de download (eerlijk en klein, ≤ 50k tekens).
      const tekst = kind === 'note' ? str(r.textContent) : str(r.sourceUrl);
      const buf = Buffer.from(tekst, 'utf8');
      return json({ naam: buitenNaam(r), mime: kind === 'note' ? 'text/plain' : 'text/uri-list', bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), data: buf.toString('base64') });
    }
    const sleutel = str(d.versie);
    const versies: Versie[] = Array.isArray(r.versies) ? r.versies : [];
    const gekozen = sleutel ? versies.find((v) => v.sha256 === sleutel || v.pad === sleutel) ?? fout('VERSIE_ONBEKEND') : null;
    const pad = gekozen ? gekozen.pad : str(r.storagePath);
    if (!pad || !padInLade(pad, lade)) fout('BESTAND_ONBEKEND'); // een pad buiten deze lade bestaat hier niet
    const bytes = gekozen ? gekozen.bytes : num(r.sizeBytes);
    if (bytes === 0) {
      if (d.offset !== undefined && Number(d.offset) !== 0) fout('DEEL_BUITEN_BEREIK');
      if (can(auth.user, 'cloud.write') && !isAlleenLezen()) await db.update(ITEMS, [{ id: r.id, record: { ...zonderId(r), openedAt: Date.now() } as Record<string, unknown> }]).catch(() => undefined);
      const legeSha = gekozen ? gekozen.sha256 : (str(r.sha256) || createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
      return json({ naam: buitenNaam(r), mime: schoneMime(r.mimeType) || 'application/octet-stream', bytes: 0, sha256: legeSha, ...(d.offset !== undefined ? { offset: 0 } : {}), data: '' });
    }
    // Downloaden IN DELEN (29.10.2026): met `offset` komt één deel terug (≤ downloadDeelBytes), geteld in
    // oorspronkelijke bytes — zo haalt de client élke grootte binnen, met herhaling per deel bij een netwerkbreuk.
    if (d.offset !== undefined) {
      const offset = Number(d.offset);
      if (!Number.isInteger(offset) || offset < 0 || offset >= Math.max(bytes, 1)) fout('DEEL_BUITEN_BEREIK');
      const lengteRauw = Number(d.lengte);
      const lengte = Math.min(Number.isInteger(lengteRauw) && lengteRauw > 0 ? lengteRauw : LIMIET.downloadDeelBytes, LIMIET.downloadDeelBytes);
      const deel = await storage.leesDeel(pad, offset, lengte, { eigenaar: str(r.ownerUserId) || undefined });
      if (!deel) fout('DEEL_BUITEN_BEREIK');
      if (can(auth.user, 'cloud.write') && !isAlleenLezen()) await db.update(ITEMS, [{ id: r.id, record: { ...zonderId(r), openedAt: Date.now() } as Record<string, unknown> }]).catch(() => undefined);
      return json({ naam: buitenNaam(r), mime: schoneMime(r.mimeType) || 'application/octet-stream', bytes: deel!.totaal, sha256: gekozen ? gekozen.sha256 : str(r.sha256), offset, data: deel!.data.toString('base64') });
    }
    if (bytes > LIMIET.downloadMaxBytes) fout('TE_GROOT');
    const [gelezen] = await storage.read([pad], { eigenaar: str(r.ownerUserId) || undefined });
    if (!gelezen || gelezen.content === null) throw new Error('CLOUD_OPSLAG_LEZEN_MISLUKT');
    // storage.read geeft base64 terug voor binaire inhoud en de (zelf al base64 geschreven) tekst voor tekst-typen:
    // in beide gevallen is `content` de base64 van de oorspronkelijke bytes.
    if (can(auth.user, 'cloud.write') && !isAlleenLezen()) await db.update(ITEMS, [{ id: r.id, record: { ...zonderId(r), openedAt: Date.now() } as Record<string, unknown> }]).catch(() => undefined);
    return json({ naam: buitenNaam(r), mime: schoneMime(r.mimeType) || 'application/octet-stream', bytes, sha256: gekozen ? gekozen.sha256 : str(r.sha256), data: gelezen.content });
  };

  // ---------------------------------------------------------------- versies (lijst en herstel)
  const versiesRoute: Run = async (_c, auth, lade, d) => {
    const r = (await eenItem(lade, d.id)) ?? fout('BESTAND_ONBEKEND');
    const lijst: Versie[] = Array.isArray(r.versies) ? r.versies : [];
    if (str(d.actie) !== 'herstel') return json({ versies: [...lijst].reverse() as CloudVersie[] });
    const denied = denyMutation(auth.user, 'cloud.write'); if (denied) return denied;
    const sleutel = str(d.versie) || fout('VERSIE_ONBEKEND');
    const plek = lijst.findIndex((v) => v.sha256 === sleutel || v.pad === sleutel);
    if (plek < 0) fout('VERSIE_ONBEKEND');
    const gekozen = lijst[plek];
    if (!padInLade(gekozen.pad, lade)) fout('VERSIE_ONBEKEND');
    const nu = Date.now();
    const nieuweLijst = lijst.filter((_, i) => i !== plek);
    if (str(r.storagePath)) nieuweLijst.push({ pad: str(r.storagePath), bytes: num(r.sizeBytes), sha256: str(r.sha256), op: iso(num(r.updatedAt) || num(r.createdAt)) });
    while (nieuweLijst.length > LIMIET.versiesMax) { const afgevallen = nieuweLijst.shift(); if (afgevallen && padInLade(afgevallen.pad, lade)) await storage.delete([afgevallen.pad]).catch(() => undefined); }
    const record: ItemRecord = { ...zonderId(r), storagePath: gekozen.pad, sizeBytes: gekozen.bytes, sha256: gekozen.sha256, versies: nieuweLijst, updatedAt: nu };
    const [gelukt] = await db.update(ITEMS, [{ id: r.id, record: record as Record<string, unknown> }]);
    if (!gelukt) throw new Error('CLOUD_BIJWERKEN_MISLUKT');
    return json({ bestand: naarBuiten({ ...record, id: r.id }) });
  };

  // ---------------------------------------------------------------- archief (inhoud / bestand / uitpakken)
  const archiefRoute: Run = async (_c, auth, lade, d) => {
    const actie = str(d.actie) || 'inhoud';
    if (actie !== 'inhoud' && actie !== 'bestand' && actie !== 'uitpakken') fout('ACTIE_ONGELDIG');
    if (actie === 'uitpakken') {
      const denied = denyMutation(auth.user, 'cloud.write'); if (denied) return denied;
    }
    const r = (await eenItem(lade, d.id)) ?? fout('BESTAND_ONBEKEND');
    if (str(r.verwijderdOp) || (r.kind ?? 'file') !== 'file') fout('BESTAND_ONBEKEND');
    const pad = str(r.storagePath);
    if (!pad || !padInLade(pad, lade)) fout('BESTAND_ONBEKEND');
    const bytes = num(r.sizeBytes);
    if (bytes > ARCHIEF_INVOER_MAX) fout('ARCHIEF_TE_GROOT');
    const [gelezen] = bytes === 0 ? [{ path: pad, content: '' }] : await storage.read([pad], { eigenaar: str(r.ownerUserId) || undefined });
    if (!gelezen || gelezen.content === null) throw new Error('CLOUD_OPSLAG_LEZEN_MISLUKT');
    const archiefBuf = Buffer.from(gelezen.content, 'base64');
    const bestandsnaam = buitenNaam(r);
    if (actie === 'inhoud') {
      const uit = leesArchiefUitBuffer(archiefBuf, bestandsnaam, { alleenLijst: true });
      return json({ ondersteund: uit.ondersteund, ...(uit.reden ? { reden: uit.reden } : {}), ingangen: uit.ingangen, totaalBytes: uit.totaalBytes });
    }
    if (actie === 'bestand') {
      const schoon = schoonArchiefSegmenten(str(d.pad)) ?? fout('ARCHIEF_BESTAND_ONBEKEND');
      if (schoon.isMap) fout('ARCHIEF_BESTAND_ONBEKEND');
      const doelPad = schoon.segmenten.join('/');
      const uit = leesArchiefUitBuffer(archiefBuf, bestandsnaam, { alleenPaden: new Set([doelPad]) });
      if (!uit.ondersteund) fout(uit.reden || 'ARCHIEF_NIET_ONDERSTEUND');
      const inhoud = uit.bestandenData.get(doelPad) ?? fout('ARCHIEF_BESTAND_ONBEKEND');
      const naam = schoon.segmenten[schoon.segmenten.length - 1];
      const mime = veiligUploadMime('', naam);
      const buf = Buffer.from(inhoud);
      return json({
        naam,
        pad: doelPad,
        mime,
        soort: cloudSoort(mime, naam),
        bytes: buf.length,
        sha256: createHash('sha256').update(buf).digest('hex'),
        data: buf.toString('base64'),
      });
    }
    // actie === 'uitpakken'
    const gekozenFilter = Array.isArray(d.paden)
      ? new Set(
          (d.paden as unknown[])
            .map((p) => schoonArchiefSegmenten(String(p ?? ''))?.segmenten.join('/') || '')
            .filter(Boolean),
        )
      : null;
    const uit = leesArchiefUitBuffer(archiefBuf, bestandsnaam);
    if (!uit.ondersteund) fout(uit.reden || 'ARCHIEF_NIET_ONDERSTEUND');
    const pastBijFilter = (p: string): boolean => {
      if (!gekozenFilter || !gekozenFilter.size) return true;
      for (const f of gekozenFilter) if (p === f || p.startsWith(`${f}/`)) return true;
      return false;
    };
    const teVerwerken = uit.ingangen.filter((ing) => pastBijFilter(ing.pad));
    let doelWortelId = idOfNull(d.doelMapId) ?? idOfNull(r.mapId);
    if (d.inEigenMap !== false) {
      const basisNaam = schoneNaam(bestandsnaam.replace(/\.(tar\.gz|tar\.bz2|tar\.xz|tgz|tbz2|txz|zip|tar|gz|7z|rar|bz2|xz|zst)$/i, '')) || 'Uitgepakt archief';
      const wortelZorg = await zorgMapPadenInLade(lade, doelWortelId, [[basisNaam]]);
      doelWortelId = wortelZorg.kaart[basisNaam] || doelWortelId;
    }
    const mapPaden: string[][] = [];
    for (const ing of teVerwerken) {
      const segs = ing.pad.split('/').filter(Boolean);
      const mapSegs = ing.map ? segs : segs.slice(0, -1);
      if (mapSegs.length) mapPaden.push(mapSegs);
    }
    const gezorgd = await zorgMapPadenInLade(lade, doelWortelId, mapPaden);
    const bestaandeItems = await eigenItems(lade);
    let uitgepakteBestanden = 0;
    for (const ing of teVerwerken) {
      if (ing.map) continue;
      const inhoud = uit.bestandenData.get(ing.pad);
      if (!inhoud) continue;
      const segs = ing.pad.split('/').filter(Boolean);
      const ouderSleutel = segs.slice(0, -1).join('/');
      const mapVoorBestand = ouderSleutel ? (gezorgd.kaart[ouderSleutel] ?? doelWortelId) : doelWortelId;
      const nieuw = await schrijfBestandBufferInLade(lade, auth.user.id, ing.naam, '', Buffer.from(inhoud), mapVoorBestand, bestaandeItems, 'archief');
      bestaandeItems.push(nieuw);
      uitgepakteBestanden += 1;
    }
    return json({ mapId: doelWortelId, uitgepakteBestanden, aangemaakteMappen: gezorgd.aangemaakt });
  };

  return {
    'POST /api/owner/cloud/vnext/overzicht': route(overzicht),
    'POST /api/owner/cloud/vnext/bestanden': route(bestanden),
    'POST /api/owner/cloud/vnext/map': route(map),
    'POST /api/owner/cloud/vnext/bestand': route(bestand),
    'POST /api/owner/cloud/vnext/upload': route(upload),
    'POST /api/owner/cloud/vnext/download': route(download),
    'POST /api/owner/cloud/vnext/versies': route(versiesRoute),
    'POST /api/owner/cloud/vnext/archief': route(archiefRoute),
  };
}
