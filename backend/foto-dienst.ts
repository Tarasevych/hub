// UI-002 — «Фото»: de server van de fotodienst (vlag foto-dienst, migratie 0153). Contract: shared/foto-model.ts.
//
// OPSLAG (geen nieuwe tabellen): app.records-collecties
//   foto_media_v1  — één record per foto/video in de bibliotheek;
//   foto_albums_v1 — albums en collecties;
//   foto_import_v1 — één record per import (bron, archief, tellingen) voor de geschiedenis.
// Bytes: bestaande opslag (server/platform/opslag.ts) onder het cloudvoorvoegsel van de lade (`foto-<uuid>.<ext>`).
// Foto's uit «Хмарне сховище» worden NIET gekopieerd: het record verwijst naar cloud_items_v1 (opslag 'cloud').
//
// VASTE BESLISSINGEN
//   • de server is de poort: vlag foto-dienst UIT → 404 FOTO_DIENST_UIT (ook al verbergt de UI hem al);
//   • alles per lade (prive/technisch), dubbele controle hoortBij() ná het filter, zoals backend/cloud-vnext-bestanden.ts;
//   • een import met een sha256 die al in de bibliotheek staat maakt GEEN tweede bestand: de herkomst wordt bijgeschreven
//     (één foto, meerdere bronnen) — zo groeit het archief niet bij elke herhaalde import;
//   • «ontkoppelen» haalt een item alleen uit de bibliotheek; het origineel in «Хмарне сховище» of een externe dienst blijft;
//     het definitief wissen van een EIGEN kopie vraagt bevestiging 'WISSEN' en kan alleen als het item geen andere bron heeft
//     die alleen hier staat — externe diensten worden door deze code nooit aangeraakt (er is geen schrijfweg naar buiten).
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, error, json, storage } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import {
  BRON_IDS, FOTO_BRONNEN, FOTO_LIMIETEN as L, duplicaatGroepen, gelijkendeGroepen, mediaSoort, mimeVoor, extVan,
  leesExif, schoneTag, schoneTekst, type Exif, type FotoAlbum, type FotoHerkomst, type FotoItem,
} from '../shared/foto-model';
import { hoortBij, ladeFilter, ladeVelden, type Lade } from '../shared/ruimte-scheiding';
import { cloudVoorvoegsel, ladeOf, padInLade } from './ruimte-cloud-agenda';

const MEDIA = 'foto_media_v1', ALBUMS = 'foto_albums_v1', IMPORTS = 'foto_import_v1', CLOUD_ITEMS = 'cloud_items_v1';
const PLAFOND = 50_000;

type MediaRec = {
  ownerUserId?: string; ruimte?: string; naam?: string; titel?: string; beschrijving?: string; mime?: string; bytes?: number; sha256?: string;
  breedte?: number | null; hoogte?: number | null; genomenOp?: string | null; datumBron?: FotoItem['datumBron']; plaats?: { lat: number; lon: number } | null;
  camera?: string; tags?: string[]; albums?: string[]; favoriet?: boolean; verborgen?: boolean; herkomst?: FotoHerkomst[];
  opslag?: 'eigen' | 'cloud'; storagePath?: string; cloudItemId?: string; miniatuur?: string | null; dhash?: string | null;
  backupOp?: string | null; backupOk?: boolean | null; createdAt?: number; updatedAt?: number;
};
type AlbumRec = { ownerUserId?: string; ruimte?: string; naam?: string; soort?: 'album' | 'collectie'; bron?: string; omslagId?: string; createdAt?: number };
type CloudRec = { ownerUserId?: string; ruimte?: string; title?: string; originalName?: string; mimeType?: string; sizeBytes?: number; storagePath?: string; sha256?: string; verwijderdOp?: string | null; createdAt?: number; kind?: string };
type MetId<T> = T & { id: string };

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const fout = (code: string): never => { throw new Error(code); };
const idOf = (v: unknown) => { const s = str(v); return /^[A-Za-z0-9_-]{1,80}$/.test(s) ? s : ''; };
const isoOf = (v: unknown): string | null => { const s = str(v); if (!s) return null; const t = Date.parse(s); return Number.isNaN(t) || t < 0 || t > Date.now() + 86400_000 * 2 ? null : new Date(t).toISOString(); };

async function alle<T>(tbl: string, lade: Lade): Promise<Array<MetId<T>>> {
  const uit: Array<MetId<T>> = []; let token: string | undefined;
  while (uit.length < PLAFOND) {
    const blad = await db.list<T>(tbl, { filter: ladeFilter(lade), limit: 1000, ...(token ? { nextToken: token } : {}) });
    uit.push(...(blad.items as unknown as Array<MetId<T>>)); if (!blad.nextToken) break; token = blad.nextToken;
  }
  return uit.filter((r) => hoortBij(r as never, lade));
}
async function een<T>(tbl: string, lade: Lade, id: unknown): Promise<MetId<T> | null> {
  const s = idOf(id); if (!s) return null; const [r] = await db.get<T>(tbl, [s]); return r && hoortBij(r as never, lade) ? { ...(r as T), id: s } : null;
}

function naarBuiten(r: MetId<MediaRec>, cloudBestaat?: (id: string) => boolean): FotoItem {
  const naam = str(r.naam) || 'foto';
  const herkomst = Array.isArray(r.herkomst) ? r.herkomst.slice(0, 20) : [];
  const beschikbaar = r.opslag === 'cloud' ? (cloudBestaat ? cloudBestaat(str(r.cloudItemId)) : true) : Boolean(r.storagePath);
  return {
    id: r.id, naam, titel: str(r.titel) || naam, beschrijving: str(r.beschrijving), soort: mediaSoort(naam, str(r.mime)) || 'foto', mime: str(r.mime),
    bytes: num(r.bytes), sha256: str(r.sha256), breedte: r.breedte ?? null, hoogte: r.hoogte ?? null, genomenOp: r.genomenOp ?? null, datumBron: r.datumBron || 'onbekend',
    plaats: r.plaats ?? null, camera: str(r.camera), tags: Array.isArray(r.tags) ? r.tags : [], albums: Array.isArray(r.albums) ? r.albums : [],
    favoriet: r.favoriet === true, verborgen: r.verborgen === true, bron: herkomst[0]?.bron || (r.opslag === 'cloud' ? 'cloud' : 'eigen'), herkomst,
    opslag: r.opslag === 'cloud' ? 'cloud' : 'eigen', beschikbaar,
    backup: { kopie: r.opslag !== 'cloud' && Boolean(r.storagePath), gecontroleerdOp: r.backupOp ?? null, ok: r.backupOk ?? null },
    miniatuur: typeof r.miniatuur === 'string' && r.miniatuur.startsWith('data:image/') ? r.miniatuur : null, dhash: r.dhash ?? null,
    toegevoegdOp: new Date(num(r.createdAt) || 0).toISOString(),
  };
}
const schoneMiniatuur = (v: unknown): string | null => { const s = str(v); return /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= L.miniatuurMaxBytes * 1.4 ? s : null; };
const schoneHash = (v: unknown) => (/^[0-9a-f]{16}$/.test(str(v)) ? str(v) : null);
const schonePlaats = (v: unknown) => { const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>; const a = Number(o.lat), b = Number(o.lon); return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lon: b } : null; };
const schoneTags = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(schoneTag).filter(Boolean))].slice(0, L.tagsMax);

// ------------------------------------------------------------------------------------------------ uploadsessies
type Sessie = { lade: Lade; pad: string; map: string; bytes: number; ontvangen: number; meta: Record<string, unknown>; tot: number };
const sessies = new Map<string, Sessie>();
const opruimen = async () => { const nu = Date.now(); for (const [id, s] of sessies) if (s.tot < nu) { sessies.delete(id); await rm(s.map, { recursive: true, force: true }).catch(() => undefined); } };

async function albumVoorNaam(lade: Lade, naam: string, bron: string, cache: Map<string, string>): Promise<string> {
  const sleutel = naam.toLowerCase(); const al = cache.get(sleutel); if (al) return al;
  const bestaand = (await alle<AlbumRec>(ALBUMS, lade)).find((a) => str(a.naam).toLowerCase() === sleutel);
  if (bestaand) { cache.set(sleutel, bestaand.id); return bestaand.id; }
  const [id] = await db.add(ALBUMS, [{ ...ladeVelden(lade), naam, soort: 'album', bron, createdAt: Date.now() }]);
  if (!id) fout('FOTO_OPSLAG_MISLUKT'); cache.set(sleutel, id!); return id!;
}

// ------------------------------------------------------------------------------------------------ routes
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
const DIENSTEN = ['hub', 'cloud'];
const NIET_GEVONDEN = new Set(['ITEM_ONBEKEND', 'ALBUM_ONBEKEND', 'UPLOAD_ONBEKEND', 'FOTO_DIENST_UIT']);

export const fotoProef = { wisSessies: () => sessies.clear(), vlagNegeren: false };

export function fotoDienstRoutes(requireSession: RequireSession, opties: { vlagAan?: (u: SessionOk['user']) => Promise<boolean> } = {}): Record<string, RouterMiddleware[]> {
  const vlagAan = opties.vlagAan ?? (async () => false); /* vlag-evaluatie komt uit backend/index.ts (architectuurregel) */
  type Run = (lade: Lade, d: Record<string, unknown>, auth: SessionOk) => Promise<Resp>;
  const route = (run: Run): RouterMiddleware[] => [(async (raw: unknown) => {
    const ctx = raw as Ctx; const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!DIENSTEN.includes(auth.service)) return error('OWNER_HUB_SESSION_REQUIRED', 403);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    try {
      if (!fotoProef.vlagNegeren && !(await vlagAan(auth.user).catch(() => false))) return error('FOTO_DIENST_UIT', 404);
      const d = ctx.body && typeof ctx.body === 'object' ? (ctx.body as Record<string, unknown>) : {};
      return await run(ladeOf(auth.user.id), d, auth);
    } catch (err) {
      const code = String((err as Error)?.message || '');
      if (/^[A-Z][A-Z_]{2,39}$/.test(code) && !code.startsWith('DB_')) return error(code, NIET_GEVONDEN.has(code) ? 404 : 400);
      console.error('[foto-dienst]', code.slice(0, 200)); return error('FOTO_FOUT', 500);
    }
  }) as unknown as RouterMiddleware];

  // ---- bibliotheek: één tijdlijn, filters, facetten, paginering
  const bibliotheek: Run = async (lade, d) => {
    const [rauw, albums, cloud] = await Promise.all([alle<MediaRec>(MEDIA, lade), alle<AlbumRec>(ALBUMS, lade), alle<CloudRec>(CLOUD_ITEMS, lade)]);
    const cloudOk = new Set(cloud.filter((c) => !str(c.verwijderdOp)).map((c) => c.id));
    const albumNaam = new Map(albums.map((a) => [a.id, str(a.naam)]));
    const items = rauw.map((r) => naarBuiten(r, (id) => cloudOk.has(id)));
    const zoek = str(d.zoek).trim().toLowerCase().slice(0, L.zoekMax);
    const f = {
      bron: str(d.bron), jaar: num(d.jaar), maand: num(d.maand), soort: str(d.soort), formaat: str(d.formaat).toLowerCase(), album: idOf(d.album), tag: schoneTag(d.tag),
      favoriet: d.favoriet === true, verborgen: d.verborgen === true, metPlaats: d.metPlaats === true, zonderDatum: d.zonderDatum === true, camera: str(d.camera),
      van: isoOf(d.van), tot: isoOf(d.tot),
    };
    const past = (i: FotoItem, zonder?: string) => {
      if (i.verborgen !== f.verborgen) return false;
      if (zonder !== 'bron' && f.bron && !i.herkomst.some((h) => h.bron === f.bron) && i.bron !== f.bron) return false;
      const jaar = i.genomenOp ? Number(i.genomenOp.slice(0, 4)) : 0;
      if (zonder !== 'jaar' && f.jaar && jaar !== f.jaar) return false;
      if (f.maand && (!i.genomenOp || Number(i.genomenOp.slice(5, 7)) !== f.maand)) return false;
      if (f.soort && i.soort !== f.soort) return false;
      if (zonder !== 'formaat' && f.formaat && extVan(i.naam) !== f.formaat) return false;
      if (f.album && !i.albums.includes(f.album)) return false;
      if (f.tag && !i.tags.includes(f.tag)) return false;
      if (f.favoriet && !i.favoriet) return false;
      if (f.metPlaats && !i.plaats) return false;
      if (f.zonderDatum && i.genomenOp) return false;
      if (f.camera && i.camera !== f.camera) return false;
      if (f.van && (!i.genomenOp || i.genomenOp < f.van)) return false;
      if (f.tot && (!i.genomenOp || i.genomenOp > f.tot)) return false;
      if (zoek) { const hooi = [i.titel, i.naam, i.beschrijving, i.camera, ...i.tags, ...i.albums.map((a) => albumNaam.get(a) || ''), ...i.herkomst.map((h) => h.pad || '')].join(' ').toLowerCase(); if (!zoek.split(/\s+/).every((w) => hooi.includes(w))) return false; }
      return true;
    };
    const gefilterd = items.filter((i) => past(i));
    const sorteer = str(d.sorteer) || 'genomen';
    const sleutel = (i: FotoItem) => (sorteer === 'toegevoegd' ? i.toegevoegdOp : sorteer === 'grootte' ? String(i.bytes).padStart(14, '0') : sorteer === 'naam' ? i.titel.toLowerCase() : i.genomenOp || i.toegevoegdOp);
    gefilterd.sort((a, b) => (d.oplopend === true ? sleutel(a).localeCompare(sleutel(b)) : sleutel(b).localeCompare(sleutel(a))) || a.id.localeCompare(b.id));
    const start = Math.max(0, Math.min(num(Number(d.token) || 0), gefilterd.length));
    const pagina = gefilterd.slice(start, start + L.pagina);
    const tel = (lijst: FotoItem[], k: (i: FotoItem) => string[]) => { const m: Record<string, number> = {}; for (const i of lijst) for (const s of k(i)) if (s) m[s] = (m[s] || 0) + 1; return m; };
    const zichtbaar = items.filter((i) => !i.verborgen);
    return json({
      items: pagina, totaal: gefilterd.length, volgende: start + L.pagina < gefilterd.length ? String(start + L.pagina) : null,
      facetten: {
        jaren: tel(items.filter((i) => past(i, 'jaar')), (i) => [i.genomenOp ? i.genomenOp.slice(0, 4) : 'onbekend']),
        bronnen: tel(items.filter((i) => past(i, 'bron')), (i) => [...new Set([i.bron, ...i.herkomst.map((h) => h.bron)])]),
        formaten: tel(items.filter((i) => past(i, 'formaat')), (i) => [extVan(i.naam) || '?']),
        soorten: tel(zichtbaar, (i) => [i.soort]),
        cameras: tel(zichtbaar, (i) => [i.camera]),
      },
      stats: { totaal: zichtbaar.length, verborgen: items.length - zichtbaar.length, favorieten: zichtbaar.filter((i) => i.favoriet).length, bytes: zichtbaar.reduce((s, i) => s + i.bytes, 0), metPlaats: zichtbaar.filter((i) => i.plaats).length, zonderKopie: zichtbaar.filter((i) => !i.backup.kopie).length, onbeschikbaar: zichtbaar.filter((i) => !i.beschikbaar).length },
      albums: albums.map((a): FotoAlbum => { const leden = zichtbaar.filter((i) => i.albums.includes(a.id)); return { id: a.id, naam: str(a.naam), soort: a.soort === 'collectie' ? 'collectie' : 'album', bron: str(a.bron) || 'eigen', aantal: leden.length, omslag: leden.find((i) => i.miniatuur)?.miniatuur ?? null, createdAt: new Date(num(a.createdAt)).toISOString() }; }).sort((a, b) => a.naam.localeCompare(b.naam, 'uk')),
    });
  };

  // ---- indexeren: foto's en video's uit «Хмарне сховище» virtueel opnemen (geen kopie)
  const indexeer: Run = async (lade) => {
    const [cloud, media] = await Promise.all([alle<CloudRec>(CLOUD_ITEMS, lade), alle<MediaRec>(MEDIA, lade)]);
    const bekend = new Set(media.map((m) => str(m.cloudItemId)).filter(Boolean));
    const shaBekend = new Map(media.filter((m) => m.sha256).map((m) => [str(m.sha256), m]));
    const nieuw: Record<string, unknown>[] = []; let gekoppeld = 0;
    let gelezen = 0;
    for (const c of cloud) {
      if (str(c.verwijderdOp) || bekend.has(c.id) || !c.storagePath) continue;
      const naam = str(c.originalName) || str(c.title); if (!mediaSoort(naam, str(c.mimeType))) continue;
      // Inhoud lezen (begrensd): sha256 voor duplicaten en EXIF (datum, camera, plaats) — de cloud bewaart die niet altijd.
      let shaC = str(c.sha256); let exif: Exif = {};
      if (gelezen < 300 && num(c.sizeBytes) <= L.inhoudMaxBytes) {
        const [g] = await storage.read([str(c.storagePath)], { eigenaar: lade.userId }).catch(() => [null]);
        if (g?.content) { const b = Buffer.from(g.content, 'base64'); gelezen++; shaC ||= createHash('sha256').update(b).digest('hex'); if (/jpe?g$/i.test(naam) || str(c.mimeType) === 'image/jpeg') exif = leesExif(new Uint8Array(b.subarray(0, 256 * 1024))); }
      }
      const dubbel = shaC ? shaBekend.get(shaC) : undefined;
      if (dubbel) { // al als eigen kopie aanwezig: alleen de herkomst bijschrijven (één foto, twee plekken)
        const h = [...(dubbel.herkomst || []), { bron: 'cloud', pad: naam, op: new Date().toISOString() }].slice(0, 20);
        const { id: did, ...rest } = dubbel; await db.update(MEDIA, [{ id: did, record: { ...rest, herkomst: h, cloudItemId: c.id, updatedAt: Date.now() } }]); bekend.add(c.id); gekoppeld++; continue;
      }
      const rec = { ...ladeVelden(lade), naam, titel: str(c.title) || naam, mime: mimeVoor(naam, str(c.mimeType)), bytes: num(c.sizeBytes), sha256: shaC, genomenOp: exif.genomenOp ?? null, datumBron: exif.genomenOp ? 'exif' : 'onbekend', plaats: exif.plaats ?? null, camera: exif.camera ?? '', breedte: exif.breedte ?? null, hoogte: exif.hoogte ?? null, tags: [], albums: [], favoriet: false, verborgen: false, herkomst: [{ bron: 'cloud', pad: naam, op: new Date().toISOString() }], opslag: 'cloud', cloudItemId: c.id, createdAt: num(c.createdAt) || Date.now(), updatedAt: Date.now() };
      nieuw.push(rec); // twee gelijke cloudbestanden blijven twee items: «Упорядкувати» toont ze als duplicaat
    }
    for (let k = 0; k < nieuw.length; k += 200) await db.add(MEDIA, nieuw.slice(k, k + 200));
    return json({ nieuw: nieuw.length, gekoppeld, totaalCloud: cloud.length });
  };

  // ---- bytes lezen (weergave/download/kopie)
  const bytesVan = async (lade: Lade, r: MetId<MediaRec>): Promise<Buffer> => {
    let pad = str(r.storagePath);
    if (r.opslag === 'cloud') { const c = await een<CloudRec>(CLOUD_ITEMS, lade, r.cloudItemId); if (!c || str(c.verwijderdOp)) fout('BRON_NIET_BESCHIKBAAR'); pad = str(c!.storagePath); }
    if (!pad) fout('BRON_NIET_BESCHIKBAAR');
    const [g] = await storage.read([pad], { eigenaar: lade.userId });
    if (!g?.content) fout('BRON_NIET_BESCHIKBAAR');
    return Buffer.from(g!.content!, 'base64');
  };
  const inhoud: Run = async (lade, d) => {
    const r = await een<MediaRec>(MEDIA, lade, d.id); if (!r) fout('ITEM_ONBEKEND');
    if (num(r!.bytes) > L.inhoudMaxBytes) fout('TE_GROOT_VOOR_WEERGAVE');
    const b = await bytesVan(lade, r!);
    return json({ id: r!.id, mime: str(r!.mime) || mimeVoor(str(r!.naam)), naam: str(r!.naam), bytes: b.length, sha256: createHash('sha256').update(b).digest('hex'), data: b.toString('base64') });
  };

  // ---- acties op items
  const item: Run = async (lade, d) => {
    const actie = str(d.actie);
    const ids = (Array.isArray(d.ids) ? d.ids : [d.id]).map(idOf).filter(Boolean).slice(0, 500);
    if (!ids.length) fout('ITEM_ONBEKEND');
    const recs = (await Promise.all(ids.map((id) => een<MediaRec>(MEDIA, lade, id)))).filter(Boolean) as Array<MetId<MediaRec>>;
    if (recs.length !== ids.length) fout('ITEM_ONBEKEND');
    const bewaar = async (r: MetId<MediaRec>, delta: Partial<MediaRec>) => { const { id, ...rest } = r; await db.update(MEDIA, [{ id, record: { ...rest, ...delta, updatedAt: Date.now() } }]); return { ...r, ...delta }; };
    const uit: FotoItem[] = [];
    if (actie === 'ontkoppel') { // alleen uit de bibliotheek; cloudbestand blijft. Een eigen kopie zonder andere plek → eerst 'wis' gebruiken.
      for (const r of recs) if (r.opslag !== 'cloud' && r.storagePath) fout('EIGEN_KOPIE_GEBRUIK_WISSEN');
      await db.delete(MEDIA, recs.map((r) => r.id)); return json({ ok: true, aantal: recs.length });
    }
    if (actie === 'wis') { // definitief: alleen de EIGEN kopie op deze server, met expliciete bevestiging
      if (d.bevestiging !== 'WISSEN') fout('BEVESTIGING_VEREIST');
      for (const r of recs) if (r.opslag === 'cloud') fout('ALLEEN_EIGEN_KOPIE');
      await storage.delete(recs.map((r) => str(r.storagePath)).filter((p) => padInLade(p, lade)));
      await db.delete(MEDIA, recs.map((r) => r.id)); return json({ ok: true, aantal: recs.length });
    }
    for (const r of recs) {
      let n: MetId<MediaRec> = r;
      if (actie === 'favoriet') n = await bewaar(r, { favoriet: d.waarde === true });
      else if (actie === 'verberg') n = await bewaar(r, { verborgen: d.waarde !== false });
      else if (actie === 'tags') n = await bewaar(r, { tags: schoneTags(d.tags) });
      else if (actie === 'tag-erbij') n = await bewaar(r, { tags: schoneTags([...(r.tags || []), d.tag]) });
      else if (actie === 'titel') { const t = schoneTekst(d.titel, L.titelMax); if (!t) fout('NAAM_ONGELDIG'); n = await bewaar(r, { titel: t }); }
      else if (actie === 'beschrijving') n = await bewaar(r, { beschrijving: schoneTekst(d.beschrijving, L.beschrijvingMax) });
      else if (actie === 'datum') { const t = isoOf(d.genomenOp); if (!t) fout('DATUM_ONGELDIG'); n = await bewaar(r, { genomenOp: t, datumBron: 'bestand' }); }
      else if (actie === 'miniatuur') n = await bewaar(r, { miniatuur: schoneMiniatuur(d.miniatuur) ?? r.miniatuur ?? null, dhash: schoneHash(d.dhash) ?? r.dhash ?? null, ...(num(d.breedte) && !r.breedte ? { breedte: num(d.breedte), hoogte: num(d.hoogte) } : {}) });
      else if (actie === 'album-erbij' || actie === 'album-eraf') {
        const a = await een<AlbumRec>(ALBUMS, lade, d.album); if (!a) fout('ALBUM_ONBEKEND');
        const set = new Set(r.albums || []); if (actie === 'album-erbij') set.add(a!.id); else set.delete(a!.id); n = await bewaar(r, { albums: [...set] });
      } else if (actie === 'kopieer') { // back-up: bestand uit «Хмарне сховище» als eigen kopie bewaren (origineel blijft)
        if (r.opslag !== 'cloud') { uit.push(naarBuiten(r)); continue; }
        if (num(r.bytes) > L.itemMaxBytes) fout('TE_GROOT');
        const b = await bytesVan(lade, r); const pad = `${cloudVoorvoegsel(lade)}/foto-${randomUUID()}.${extVan(str(r.naam)) || 'bin'}`;
        const [ok] = await storage.write([{ path: pad, content: b.toString('base64'), contentType: str(r.mime) || 'application/octet-stream', ownerId: lade.userId }]);
        if (!ok) fout('FOTO_OPSLAG_MISLUKT');
        const sha = createHash('sha256').update(b).digest('hex');
        n = await bewaar(r, { opslag: 'eigen', storagePath: pad, sha256: sha, bytes: b.length, backupOp: new Date().toISOString(), backupOk: true });
      } else if (actie === 'controleer') { // back-up nagaan: is de kopie er nog en klopt de sha256?
        try { const b = await bytesVan(lade, r); const sha = createHash('sha256').update(b).digest('hex'); n = await bewaar(r, { backupOp: new Date().toISOString(), backupOk: !r.sha256 || sha === r.sha256, ...(r.sha256 ? {} : { sha256: sha }) }); }
        catch { n = await bewaar(r, { backupOp: new Date().toISOString(), backupOk: false }); }
      } else fout('ACTIE_ONGELDIG');
      uit.push(naarBuiten(n));
    }
    return json({ items: uit });
  };

  // ---- albums en collecties
  const album: Run = async (lade, d) => {
    const actie = str(d.actie);
    if (actie === 'nieuw') {
      const naam = schoneTekst(d.naam, L.albumNaamMax); if (!naam) fout('NAAM_ONGELDIG');
      if ((await alle<AlbumRec>(ALBUMS, lade)).length >= L.albumsMax) fout('LIMIET_BEREIKT');
      const [id] = await db.add(ALBUMS, [{ ...ladeVelden(lade), naam, soort: d.soort === 'collectie' ? 'collectie' : 'album', bron: 'eigen', createdAt: Date.now() }]);
      return json({ album: { id, naam } });
    }
    const a = await een<AlbumRec>(ALBUMS, lade, d.id); if (!a) fout('ALBUM_ONBEKEND');
    if (actie === 'hernoem') { const naam = schoneTekst(d.naam, L.albumNaamMax); if (!naam) fout('NAAM_ONGELDIG'); const { id, ...rest } = a!; await db.update(ALBUMS, [{ id, record: { ...rest, naam } }]); return json({ album: { id, naam } }); }
    if (actie === 'verwijder') { // het album weg; de foto's blijven in de bibliotheek
      const leden = (await alle<MediaRec>(MEDIA, lade)).filter((m) => (m.albums || []).includes(a!.id));
      for (const m of leden) { const { id, ...rest } = m; await db.update(MEDIA, [{ id, record: { ...rest, albums: (m.albums || []).filter((x) => x !== a!.id) } }]); }
      await db.delete(ALBUMS, [a!.id]); return json({ ok: true, losgemaakt: leden.length });
    }
    return fout('ACTIE_ONGELDIG');
  };

  // ---- upload van één mediabestand (uit een import of rechtstreeks), in stukken
  const upload: Run = async (lade, d) => {
    await opruimen();
    const actie = str(d.actie);
    if (actie === 'begin') {
      const naam = schoneTekst(str(d.naam).split('/').pop(), 240); const bytes = num(d.bytes);
      if (!naam || naam === '.' || naam === '..') fout('NAAM_ONGELDIG');
      if (!mediaSoort(naam, str(d.mime))) fout('GEEN_MEDIA');
      if (bytes <= 0 || bytes > L.itemMaxBytes) fout('TE_GROOT');
      const bron = str(d.bron) || 'eigen'; if (!BRON_IDS.has(bron)) fout('BRON_ONBEKEND');
      // Bekende sha256 vooraf? Dan hoeft er niets te komen: alleen de herkomst bijschrijven (snelle herhaalde import).
      const sha = /^[0-9a-f]{64}$/.test(str(d.sha256)) ? str(d.sha256) : '';
      if (sha) {
        const bestaand = (await alle<MediaRec>(MEDIA, lade)).find((m) => m.sha256 === sha);
        if (bestaand) return json({ bekend: true, item: naarBuiten(await herkomstErbij(lade, bestaand, d)) });
      }
      const map = await mkdtemp(join(tmpdir(), 'foto-up-')); const id = randomUUID();
      sessies.set(id, { lade, pad: join(map, 'inhoud'), map, bytes, ontvangen: 0, meta: d, tot: Date.now() + 30 * 60_000 });
      await (await open(join(map, 'inhoud'), 'w')).close();
      return json({ id, stukMax: L.stukMaxBytes });
    }
    const s = sessies.get(idOf(d.id)); if (!s || s.lade.userId !== lade.userId || s.lade.ruimte !== lade.ruimte) fout('UPLOAD_ONBEKEND');
    if (actie === 'afbreken') { sessies.delete(idOf(d.id)); await rm(s!.map, { recursive: true, force: true }); return json({ ok: true }); }
    if (actie === 'stuk') {
      if (num(d.offset) !== s!.ontvangen) fout('STUK_BUITEN_ORDE');
      const b = Buffer.from(str(d.data), 'base64'); if (!b.length || b.length > L.stukMaxBytes || s!.ontvangen + b.length > s!.bytes) fout('TE_GROOT');
      const fh = await open(s!.pad, 'a'); try { await fh.write(b); } finally { await fh.close(); }
      s!.ontvangen += b.length; return json({ ontvangen: s!.ontvangen });
    }
    if (actie === 'klaar') {
      if (s!.ontvangen !== s!.bytes) fout('STUK_BUITEN_ORDE');
      const b = await readFile(s!.pad); sessies.delete(idOf(d.id)); await rm(s!.map, { recursive: true, force: true });
      const sha = createHash('sha256').update(b).digest('hex');
      if (str(d.sha256) && str(d.sha256) !== sha) fout('SHA_MISMATCH');
      const m = s!.meta; const naam = schoneTekst(str(m.naam).split('/').pop(), 240);
      const bestaand = (await alle<MediaRec>(MEDIA, lade)).find((x) => x.sha256 === sha);
      if (bestaand) return json({ bekend: true, item: naarBuiten(await herkomstErbij(lade, bestaand, m)) });
      const pad = `${cloudVoorvoegsel(lade)}/foto-${randomUUID()}.${extVan(naam) || 'bin'}`;
      const mime = mimeVoor(naam, str(m.mime));
      const [ok] = await storage.write([{ path: pad, content: b.toString('base64'), contentType: mime, ownerId: lade.userId }]);
      if (!ok) fout('FOTO_OPSLAG_MISLUKT');
      const cache = new Map<string, string>(); const bron = str(m.bron) || 'eigen';
      const albumNaam = schoneTekst(m.album, L.albumNaamMax);
      const albums = albumNaam ? [await albumVoorNaam(lade, albumNaam, bron, cache)] : [];
      const datum = isoOf(m.genomenOp);
      const rec: MediaRec = {
        ...ladeVelden(lade), naam, titel: schoneTekst(m.titel, L.titelMax) || naam, beschrijving: schoneTekst(m.beschrijving, L.beschrijvingMax), mime, bytes: b.length, sha256: sha,
        breedte: num(m.breedte) || null, hoogte: num(m.hoogte) || null, genomenOp: datum, datumBron: datum ? (['exif', 'sidecar', 'bestand'].includes(str(m.datumBron)) ? (m.datumBron as FotoItem['datumBron']) : 'bestand') : 'onbekend',
        plaats: schonePlaats(m.plaats), camera: schoneTekst(m.camera, 120), tags: schoneTags(m.tags), albums, favoriet: false, verborgen: false,
        herkomst: [{ bron, ...(str(m.pad) ? { pad: schoneTekst(m.pad, 500) } : {}), ...(str(m.archief) ? { archief: schoneTekst(m.archief, 200) } : {}), op: new Date().toISOString() }],
        opslag: 'eigen', storagePath: pad, miniatuur: schoneMiniatuur(m.miniatuur), dhash: schoneHash(m.dhash), backupOp: new Date().toISOString(), backupOk: true, createdAt: Date.now(), updatedAt: Date.now(),
      };
      const [id] = await db.add(MEDIA, [rec as Record<string, unknown>]); if (!id) { await storage.delete([pad]); fout('FOTO_OPSLAG_MISLUKT'); }
      return json({ bekend: false, item: naarBuiten({ ...rec, id: id! }) });
    }
    return fout('ACTIE_ONGELDIG');
  };
  const herkomstErbij = async (lade: Lade, r: MetId<MediaRec>, m: Record<string, unknown>) => {
    const bron = BRON_IDS.has(str(m.bron)) ? str(m.bron) : 'eigen';
    const h = [...(r.herkomst || [])];
    if (!h.some((x) => x.bron === bron && x.pad === str(m.pad))) h.push({ bron, ...(str(m.pad) ? { pad: schoneTekst(m.pad, 500) } : {}), ...(str(m.archief) ? { archief: schoneTekst(m.archief, 200) } : {}), op: new Date().toISOString() });
    const albumNaam = schoneTekst(m.album, L.albumNaamMax);
    const albums = new Set(r.albums || []); if (albumNaam) albums.add(await albumVoorNaam(lade, albumNaam, bron, new Map()));
    // ontbrekende metadata aanvullen, nooit overschrijven
    const datum = isoOf(m.genomenOp);
    const delta: Partial<MediaRec> = { herkomst: h.slice(0, 20), albums: [...albums], ...(datum && !r.genomenOp ? { genomenOp: datum, datumBron: (m.datumBron as FotoItem['datumBron']) || 'bestand' } : {}), ...(!r.plaats && schonePlaats(m.plaats) ? { plaats: schonePlaats(m.plaats) } : {}), ...(!r.beschrijving && m.beschrijving ? { beschrijving: schoneTekst(m.beschrijving, L.beschrijvingMax) } : {}), ...(!r.miniatuur && schoneMiniatuur(m.miniatuur) ? { miniatuur: schoneMiniatuur(m.miniatuur), dhash: schoneHash(m.dhash) } : {}) };
    const { id, ...rest } = r; await db.update(MEDIA, [{ id, record: { ...rest, ...delta, updatedAt: Date.now() } }]);
    return { ...r, ...delta };
  };

  // ---- organiseren: duplicaten en gelijkende foto's
  const organiseer: Run = async (lade) => {
    const media = (await alle<MediaRec>(MEDIA, lade)).filter((m) => !m.verborgen).map((m) => naarBuiten(m));
    const per = new Map(media.map((m) => [m.id, m]));
    const dup = duplicaatGroepen(media.map((m) => ({ id: m.id, sha256: m.sha256 || undefined, bytes: m.bytes, genomenOp: m.genomenOp || undefined })));
    const gel = gelijkendeGroepen(media.map((m) => ({ id: m.id, dhash: m.dhash || undefined, genomenOp: m.genomenOp || undefined, camera: m.camera || undefined })));
    const vul = (ids: string[]) => ids.map((id) => per.get(id)!).filter(Boolean);
    return json({ duplicaten: dup.slice(0, 300).map((g) => ({ soort: g.soort, items: vul(g.ids) })), gelijkend: gel.slice(0, 300).map((g) => ({ items: vul(g) })) });
  };

  // ---- bronnen: catalogus + tellingen + importgeschiedenis
  const bronnen: Run = async (lade) => {
    const [media, imports] = await Promise.all([alle<MediaRec>(MEDIA, lade), alle<Record<string, unknown>>(IMPORTS, lade)]);
    const tel: Record<string, number> = {}; for (const m of media) for (const b of new Set((m.herkomst || []).map((h) => h.bron))) tel[b] = (tel[b] || 0) + 1;
    return json({ bronnen: FOTO_BRONNEN.map((b) => ({ ...b, aantal: tel[b.id] || 0 })), imports: imports.sort((a, b) => num(b.createdAt) - num(a.createdAt)).slice(0, 50).map((i) => ({ id: i.id, bron: i.bron, archief: i.archief, soort: i.soort, nieuw: i.nieuw, bekend: i.bekend, overgeslagen: i.overgeslagen, mislukt: i.mislukt, klaar: i.klaar === true, createdAt: new Date(num(i.createdAt)).toISOString() })) });
  };
  const importLog: Run = async (lade, d) => {
    const velden = { bron: BRON_IDS.has(str(d.bron)) ? str(d.bron) : 'map', archief: schoneTekst(d.archief, 200), soort: schoneTekst(d.soort, 20), nieuw: num(d.nieuw), bekend: num(d.bekend), overgeslagen: num(d.overgeslagen), mislukt: num(d.mislukt), klaar: d.klaar === true };
    if (idOf(d.id)) { const r = await een<Record<string, unknown>>(IMPORTS, lade, d.id); if (!r) fout('ITEM_ONBEKEND'); const { id, ...rest } = r!; await db.update(IMPORTS, [{ id, record: { ...rest, ...velden } }]); return json({ id }); }
    const [id] = await db.add(IMPORTS, [{ ...ladeVelden(lade), ...velden, createdAt: Date.now() }]); return json({ id });
  };
  // ---- export: metadata van een selectie (de browser haalt de originelen op en pakt ze in)
  const exporteer: Run = async (lade, d) => {
    const ids = new Set((Array.isArray(d.ids) ? d.ids : []).map(idOf).filter(Boolean));
    const albums = new Map((await alle<AlbumRec>(ALBUMS, lade)).map((a) => [a.id, str(a.naam)]));
    const items = (await alle<MediaRec>(MEDIA, lade)).filter((m) => !ids.size || ids.has(m.id)).slice(0, 5000).map((m) => { const b = naarBuiten(m); return { ...b, miniatuur: null, albums: b.albums.map((a) => albums.get(a) || a) }; });
    return json({ items, gemaaktOp: new Date().toISOString(), formaat: 'mijn-ruimte-foto-v1' });
  };

  const R = (pad: string, run: Run) => [`POST /api/owner/foto/${pad}`, route(run)] as const;
  return Object.fromEntries([
    R('bibliotheek', bibliotheek), R('indexeer', indexeer), R('inhoud', inhoud), R('item', item), R('album', album), R('upload', upload),
    R('organiseer', organiseer), R('bronnen', bronnen), R('import', importLog), R('export', exporteer),
  ]);
}
