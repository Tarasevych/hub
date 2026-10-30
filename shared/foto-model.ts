// UI-002 — «Фото»: het GEDEELDE contract van de fotodienst (browser src/foto/*, server backend/foto-dienst.ts, tests).
// Puur: geen DOM, geen node-API's. Draait in de browser (archief lezen bij import) én op de server (controle, groeperen).
//
// EERLIJKHEIDSREGEL (zelfde als shared/cloud-vnext-model.ts): per bron staat hier wat VANDAAG in de code zit.
//   live    — rechtstreeks gekoppeld en bijgehouden (alleen eigen opslag en «Хмарне сховище»: zelfde server);
//   kiezer  — officiële koppeling waarbij de gebruiker zelf kiest wat binnenkomt (Google Photos Picker API — Google sloot
//             het volledig lezen van de bibliotheek voor derden op 31.03.2025);
//   archief — alleen import van een export/ZIP/map die de gebruiker zelf bij de dienst ophaalt; geen automatische sync;
//   gepland — er bestaat een officiële weg, maar die is hier nog niet gebouwd (meestal: sleutels/goedkeuring van de eigenaar).
// Niets heet «синхронізується» als het dat niet doet.

export const FOTO_VLAG = 'foto-dienst';
export const FOTO_LIMIETEN = Object.freeze({
  itemMaxBytes: 256 * 1024 * 1024,   // één foto/video via de upload-weg (heel bestand in het geheugen bij opslaan) — eerlijk begrensd
  stukMaxBytes: 4 * 1024 * 1024,
  inhoudMaxBytes: 64 * 1024 * 1024,  // één weergave-/download-antwoord
  miniatuurMaxBytes: 24 * 1024,
  pagina: 120,
  tagMax: 40, tagsMax: 30, titelMax: 300, beschrijvingMax: 2000, albumNaamMax: 120, albumsMax: 2000,
  zoekMax: 200,
});

export type FotoSoort = 'foto' | 'video';
export type Toegang = 'live' | 'kiezer' | 'archief' | 'gepland';
export type Tweetalig = { uk: string; nl: string };
export type BronDef = {
  id: string; naam: string; groep: 'eigen' | 'cloud' | 'sociaal' | 'apparaat';
  toegang: Toegang[];               // wat vandaag kan (volgorde = voorkeur)
  uitleg: Tweetalig;                // één zin, eerlijk
  archief?: Tweetalig;              // waar haalt de gebruiker de export
  gepland?: Tweetalig;              // wat nodig is voor een live koppeling
  site?: string;
};

export const FOTO_BRONNEN: readonly BronDef[] = Object.freeze([
  { id: 'eigen', naam: 'Mijn Ruimte', groep: 'eigen', toegang: ['live'], uitleg: { uk: 'Фото, які ви завантажили сюди. Зберігаються на вашому сервері.', nl: 'Foto’s die u hier uploadt. Bewaard op uw eigen server.' } },
  { id: 'cloud', naam: 'Хмарне сховище', groep: 'eigen', toegang: ['live'], uitleg: { uk: 'Фото й відео з «Хмарного сховища» показуються тут без копіювання.', nl: 'Foto’s en video’s uit «Cloudopslag» verschijnen hier zonder kopie.' } },
  { id: 'google-photos', naam: 'Google Photos', groep: 'cloud', toegang: ['kiezer', 'archief'], site: 'https://photos.google.com',
    uitleg: { uk: 'Google дозволяє лише вибрати фото вручну (вікно Google) або імпортувати архів Takeout. Автоматичної синхронізації всієї бібліотеки Google не дає.', nl: 'Google staat alleen handmatig kiezen (Google-venster) of een Takeout-archief toe. Automatische sync van de hele bibliotheek biedt Google niet.' },
    archief: { uk: 'takeout.google.com → «Google Фото» → ZIP. Дати, місця, описи й альбоми відновлюються з файлів .json.', nl: 'takeout.google.com → «Google Foto’s» → ZIP. Datums, plaatsen, beschrijvingen en albums komen uit de .json-bestanden.' } },
  { id: 'google-drive', naam: 'Google Drive', groep: 'cloud', toegang: ['archief', 'gepland'], site: 'https://drive.google.com',
    uitleg: { uk: 'Імпорт архіву Takeout або завантаженої теки. Перегляд живого Drive — у «Хмарному сховищі».', nl: 'Import van een Takeout-archief of gedownloade map. Live Drive bekijkt u in «Cloudopslag».' },
    archief: { uk: 'takeout.google.com → «Диск» → ZIP.', nl: 'takeout.google.com → «Drive» → ZIP.' },
    gepland: { uk: 'Пряме індексування фото з Drive (через наявне підключення Google) — наступний етап.', nl: 'Rechtstreeks indexeren van foto’s uit Drive (via de bestaande Google-koppeling) — volgende stap.' } },
  { id: 'onedrive', naam: 'OneDrive', groep: 'cloud', toegang: ['archief', 'gepland'], uitleg: { uk: 'Зараз — імпорт завантаженої теки чи ZIP.', nl: 'Nu: import van een gedownloade map of ZIP.' }, archief: { uk: 'onedrive.live.com → виберіть теку «Зображення» → «Завантажити».', nl: 'onedrive.live.com → map «Afbeeldingen» → «Downloaden».' }, gepland: { uk: 'Пряме підключення — після ключів Microsoft від власника сайту.', nl: 'Live koppeling — na Microsoft-sleutels van de site-eigenaar.' } },
  { id: 'dropbox', naam: 'Dropbox', groep: 'cloud', toegang: ['archief', 'gepland'], uitleg: { uk: 'Зараз — імпорт завантаженої теки чи ZIP.', nl: 'Nu: import van een gedownloade map of ZIP.' }, archief: { uk: 'dropbox.com → тека → «Завантажити».', nl: 'dropbox.com → map → «Downloaden».' }, gepland: { uk: 'Пряме підключення — після ключів Dropbox від власника сайту.', nl: 'Live koppeling — na Dropbox-sleutels van de site-eigenaar.' } },
  { id: 'icloud', naam: 'iCloud', groep: 'cloud', toegang: ['archief'], uitleg: { uk: 'Apple не має відкритого API для Фото. Лише імпорт копії даних.', nl: 'Apple heeft geen open API voor Foto’s. Alleen import van een gegevenskopie.' }, archief: { uk: 'privacy.apple.com → «Отримати копію даних» → «iCloud Фото».', nl: 'privacy.apple.com → «Kopie van gegevens» → «iCloud-foto’s».' } },
  { id: 'nextcloud', naam: 'Nextcloud', groep: 'apparaat', toegang: ['archief', 'gepland'], uitleg: { uk: 'Зараз — імпорт теки чи ZIP.', nl: 'Nu: import van een map of ZIP.' }, gepland: { uk: 'Пряме підключення через WebDAV — наступний етап.', nl: 'Live koppeling via WebDAV — volgende stap.' } },
  { id: 'nas', naam: 'NAS', groep: 'apparaat', toegang: ['archief', 'gepland'], uitleg: { uk: 'Зараз — імпорт теки чи ZIP з NAS.', nl: 'Nu: import van een map of ZIP van de NAS.' }, gepland: { uk: 'Пряме підключення (WebDAV/SMB) — наступний етап.', nl: 'Live koppeling (WebDAV/SMB) — volgende stap.' } },
  { id: 'instagram', naam: 'Instagram', groep: 'sociaal', toegang: ['archief'], uitleg: { uk: 'Meta закрила API для особистих акаунтів. Імпорт архіву відновлює дати й підписи.', nl: 'Meta sloot de API voor persoonlijke accounts. Archiefimport herstelt datums en bijschriften.' }, archief: { uk: 'Instagram → «Центр акаунтів» → «Завантажити інформацію» → формат JSON.', nl: 'Instagram → «Accountcentrum» → «Je gegevens downloaden» → formaat JSON.' } },
  { id: 'facebook', naam: 'Facebook', groep: 'sociaal', toegang: ['archief'], uitleg: { uk: 'Імпорт архіву відновлює альбоми, дати, описи й місця.', nl: 'Archiefimport herstelt albums, datums, beschrijvingen en plaatsen.' }, archief: { uk: 'Facebook → «Центр акаунтів» → «Завантажити інформацію» → JSON.', nl: 'Facebook → «Accountcentrum» → «Je gegevens downloaden» → JSON.' } },
  { id: 'vk', naam: 'ВКонтакте', groep: 'sociaal', toegang: ['archief'], uitleg: { uk: 'Імпорт архіву даних VK; альбоми — за назвами тек.', nl: 'Import van het VK-gegevensarchief; albums volgens mapnamen.' }, archief: { uk: 'vk.com/data_protection → «Запросити архів» → «Фотографії».', nl: 'vk.com/data_protection → «Archief aanvragen» → «Foto’s».' } },
  { id: 'ok', naam: 'Однокласники', groep: 'sociaal', toegang: ['archief'], uitleg: { uk: 'Імпорт збережених фото (тека чи ZIP); дата — з EXIF, якщо збереглася.', nl: 'Import van bewaarde foto’s (map of ZIP); datum uit EXIF als die er nog is.' } },
  { id: 'flickr', naam: 'Flickr', groep: 'sociaal', toegang: ['archief'], uitleg: { uk: 'Імпорт архіву Flickr відновлює назви, дати, теги, альбоми й місця.', nl: 'Import van het Flickr-archief herstelt titels, datums, tags, albums en plaatsen.' }, archief: { uk: 'flickr.com → Налаштування → «Ваші дані Flickr» → «Запросити архів».', nl: 'flickr.com → Instellingen → «Je Flickr-gegevens» → «Archief aanvragen».' } },
  { id: 'pinterest', naam: 'Pinterest', groep: 'sociaal', toegang: ['archief'], uitleg: { uk: 'Імпорт архіву даних (зображення). Метадані Pinterest майже не зберігає.', nl: 'Import van het gegevensarchief (afbeeldingen). Pinterest bewaart nauwelijks metadata.' } },
  { id: 'telegram', naam: 'Telegram', groep: 'sociaal', toegang: ['archief'], uitleg: { uk: 'Експорт Telegram Desktop (JSON) відновлює дату й чат як альбом.', nl: 'Export van Telegram Desktop (JSON) herstelt datum en chat als album.' }, archief: { uk: 'Telegram Desktop → Налаштування → «Розширені» → «Експорт даних» → JSON.', nl: 'Telegram Desktop → Instellingen → «Geavanceerd» → «Gegevens exporteren» → JSON.' } },
  { id: 'map', naam: 'Тека / ZIP', groep: 'apparaat', toegang: ['archief'], uitleg: { uk: 'Будь-яка тека, ZIP чи резервна копія з телефону або комп’ютера.', nl: 'Elke map, ZIP of back-up van telefoon of computer.' } },
] as BronDef[]);
export const BRON_IDS = new Set(FOTO_BRONNEN.map((b) => b.id));
export const bronDef = (id: string) => FOTO_BRONNEN.find((b) => b.id === id);

// ---------------------------------------------------------------------------------------------- soorten / formaten
const FOTO_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff', 'dng', 'cr2', 'nef', 'arw'];
const VIDEO_EXT = ['mp4', 'mov', 'm4v', '3gp', 'avi', 'mkv', 'webm', 'mts'];
export const extVan = (naam: string) => (/\.([a-z0-9]{1,5})$/i.exec(naam)?.[1] || '').toLowerCase();
export function mediaSoort(naam: string, mime = ''): FotoSoort | null {
  const m = mime.toLowerCase();
  if (m.startsWith('image/') && !m.includes('svg')) return 'foto';
  if (m.startsWith('video/')) return 'video';
  const e = extVan(naam);
  if (FOTO_EXT.includes(e)) return 'foto';
  if (VIDEO_EXT.includes(e)) return 'video';
  return null;
}
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', dng: 'image/x-adobe-dng', cr2: 'image/x-canon-cr2', nef: 'image/x-nikon-nef', arw: 'image/x-sony-arw', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', '3gp': 'video/3gpp', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm', mts: 'video/mp2t' };
export const mimeVoor = (naam: string, mime = '') => (mime && /^(image|video)\//.test(mime) && !mime.includes('svg') ? mime.toLowerCase().split(';')[0] : MIME[extVan(naam)] || 'application/octet-stream');

export const schoneTag = (t: unknown): string => String(t ?? '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, FOTO_LIMIETEN.tagMax);
export const schoneTekst = (t: unknown, max: number): string => String(t ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------------------------------------- herkomst van een archief
export type ArchiefSoort = 'takeout' | 'instagram' | 'facebook' | 'telegram' | 'flickr' | 'vk' | 'icloud' | 'algemeen';
export function herkenArchief(paden: readonly string[]): ArchiefSoort {
  const p = paden.map((x) => x.replace(/\\/g, '/'));
  const heeft = (re: RegExp) => p.some((x) => re.test(x));
  if (heeft(/(^|\/)Takeout\//) || heeft(/\.(supplemental-metadata|suppl[a-z-]*)\.json$/i) || heeft(/(^|\/)Google (Photos|Фото|Foto’s|Foto's)\//i)) return 'takeout';
  if (heeft(/(^|\/)your_instagram_activity\//) || heeft(/(^|\/)content\/posts_\d+\.json$/) || heeft(/(^|\/)media\/posts\/\d{6}\//)) return 'instagram';
  if (heeft(/(^|\/)your_facebook_activity\//) || heeft(/(^|\/)photos_and_videos\//)) return 'facebook';
  if (heeft(/(^|\/)result\.json$/) && heeft(/(^|\/)(photos|video_files)\//)) return 'telegram';
  if (heeft(/(^|\/)photo_\d+\.json$/)) return 'flickr';
  if (heeft(/(^|\/)Photos\/Photo Details[^/]*\.csv$/i) || heeft(/iCloud Photos/i)) return 'icloud';
  if (heeft(/(^|\/)(photos|Фотографии|Фотографії)\/.+\.(html?|jpe?g)$/i) && heeft(/(^|\/)index\.html?$/i) && heeft(/(^|\/)(messages|wall|profile)\//)) return 'vk';
  return 'algemeen';
}
export const ARCHIEF_BRON: Record<ArchiefSoort, string> = { takeout: 'google-photos', instagram: 'instagram', facebook: 'facebook', telegram: 'telegram', flickr: 'flickr', vk: 'vk', icloud: 'icloud', algemeen: 'map' };

/** Wat we per mediabestand uit een archief halen (alles optioneel; ontbreekt = onbekend, nooit verzonnen). */
export type ArchiefMeta = {
  genomenOp?: string; datumBron?: 'exif' | 'sidecar' | 'bestand';
  titel?: string; beschrijving?: string; album?: string; plaats?: { lat: number; lon: number } | null; tags?: string[];
};
const geldigeLat = (lat: unknown, lon: unknown) => { const a = Number(lat), b = Number(lon); return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0) ? { lat: a, lon: b } : null; };
const isoVanSec = (s: unknown): string | undefined => { const n = Number(s); return Number.isFinite(n) && n > 86400 && n < 4102444800 ? new Date(n * 1000).toISOString() : undefined; };
const basisnaam = (p: string) => p.replace(/\\/g, '/').split('/').pop() || p;
const mapnaam = (p: string) => { const d = p.replace(/\\/g, '/').split('/'); return d.length > 1 ? d[d.length - 2] : ''; };
const normPad = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '');
/** Instagram/Facebook schrijven tekst als latin-1-bytes van UTF-8 («Ð¿Ñ€Ð¸Ð²Ñ–Ñ‚»). Herstel dat waar het duidelijk zo is. */
export function metaTekst(s: unknown): string {
  const t = String(s ?? '');
  if (!/[\u00c0-\u00ff][\u0080-\u00bf]/.test(t)) return t;
  try { const b = Uint8Array.from([...t].map((c) => c.charCodeAt(0) & 0xff)); return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return t; }
}

/**
 * Lees de bijgeleverde JSON-bestanden van een archief en geef metadata per mediapad (genormaliseerd, relatief aan de wortel).
 * `json` = pad → geparste inhoud (de aanroeper leest alleen .json-bestanden < 20 MB). `media` = alle mediapaden.
 */
export function archiefMetadata(soort: ArchiefSoort, media: readonly string[], json: ReadonlyMap<string, unknown>): Map<string, ArchiefMeta> {
  const uit = new Map<string, ArchiefMeta>();
  const mediaSet = new Map(media.map((m) => [normPad(m), m]));
  const zet = (pad: string, m: ArchiefMeta) => { const echt = mediaSet.get(normPad(pad)); if (echt) uit.set(echt, { ...(uit.get(echt) || {}), ...m }); };
  const zoekEind = (uri: string) => { const u = normPad(uri); for (const k of mediaSet.keys()) if (k === u || k.endsWith(`/${u}`)) return k; return null; };
  const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' ? (v as Record<string, any>) : {});

  if (soort === 'takeout') {
    // Sidecar: «IMG_1.jpg.json», «IMG_1.jpg.supplemental-metadata.json» (en door Google afgekapte namen), «IMG_1(1).jpg» ↔ «IMG_1.jpg(1).json».
    const albums = new Map<string, string>();
    for (const [p, v] of json) if (/(^|\/)metadata\.json$/.test(p) && obj(v).title) albums.set(normPad(p).replace(/\/?metadata\.json$/, ''), metaTekst(obj(v).title));
    const sidecars = [...json.keys()].filter((p) => !/(^|\/)metadata\.json$/.test(p));
    const perMap = new Map<string, string[]>();
    for (const s of sidecars) { const d = normPad(s).split('/').slice(0, -1).join('/'); (perMap.get(d) || perMap.set(d, []).get(d)!).push(s); }
    for (const m of mediaSet.keys()) {
      const d = m.split('/').slice(0, -1).join('/'), naam = basisnaam(m);
      const dup = /^(.*)\((\d+)\)(\.[^.]+)$/.exec(naam);
      const kandidaten = perMap.get(d) || [];
      const stam = dup ? `${dup[1]}${dup[3]}` : naam;
      let gevonden = kandidaten.find((k) => { const b = basisnaam(k); return dup ? b.startsWith(stam) && b.endsWith(`(${dup[2]}).json`) : b.startsWith(`${naam}.`) || b === `${naam}.json`; });
      if (!gevonden) { const kort = stam.slice(0, 46); gevonden = kandidaten.find((k) => basisnaam(k).startsWith(kort) && basisnaam(k).endsWith('.json') && (!dup || basisnaam(k).includes(`(${dup[2]})`))); }
      const map = mapnaam(m);
      const album = albums.get(d) || (map && !/^(Photos from \d{4}|Фото з \d{4}|Foto’s uit \d{4}|Foto's uit \d{4}|Google (Photos|Фото)|Takeout)$/i.test(map) ? map : undefined);
      const meta: ArchiefMeta = {};
      if (album) meta.album = album;
      if (gevonden) {
        const j = obj(json.get(gevonden));
        const t = isoVanSec(obj(j.photoTakenTime).timestamp) || isoVanSec(obj(j.creationTime).timestamp);
        if (t) { meta.genomenOp = t; meta.datumBron = 'sidecar'; }
        const g = geldigeLat(obj(j.geoDataExif).latitude, obj(j.geoDataExif).longitude) || geldigeLat(obj(j.geoData).latitude, obj(j.geoData).longitude);
        if (g) meta.plaats = g;
        if (j.description) meta.beschrijving = schoneTekst(j.description, FOTO_LIMIETEN.beschrijvingMax);
        if (j.title && j.title !== naam) meta.titel = schoneTekst(j.title, FOTO_LIMIETEN.titelMax);
      }
      if (Object.keys(meta).length) uit.set(mediaSet.get(m)!, meta);
    }
    return uit;
  }
  if (soort === 'instagram' || soort === 'facebook') {
    const bezoek = (v: unknown, album?: string) => {
      if (Array.isArray(v)) { for (const x of v) bezoek(x, album); return; }
      const o = obj(v); if (!Object.keys(o).length) return;
      const albumHier = o.name && Array.isArray(o.photos) ? metaTekst(o.name) : album;
      if (typeof o.uri === 'string') {
        const pad = zoekEind(o.uri);
        if (pad) {
          const exif = Array.isArray(obj(obj(o.media_metadata).photo_metadata).exif_data) ? obj(obj(o.media_metadata).photo_metadata).exif_data.map(obj) : [];
          const genomen = isoVanSec(exif.find((e: any) => e.taken_timestamp)?.taken_timestamp) || isoVanSec(o.creation_timestamp);
          const plaats = exif.map((e: any) => geldigeLat(e.latitude, e.longitude)).find(Boolean) || null;
          zet(pad, { ...(genomen ? { genomenOp: genomen, datumBron: 'sidecar' as const } : {}), ...(o.title ? { beschrijving: schoneTekst(metaTekst(o.title), FOTO_LIMIETEN.beschrijvingMax) } : {}), ...(o.description ? { beschrijving: schoneTekst(metaTekst(o.description), FOTO_LIMIETEN.beschrijvingMax) } : {}), ...(albumHier ? { album: schoneTekst(albumHier, FOTO_LIMIETEN.albumNaamMax) } : {}), ...(plaats ? { plaats } : {}) });
        }
      }
      for (const [k, x] of Object.entries(o)) if (k !== 'uri' && x && typeof x === 'object') bezoek(x, albumHier);
    };
    for (const [p, v] of json) {
      const standaard = soort === 'instagram' ? (/stories/i.test(p) ? 'Instagram · Stories' : /reels/i.test(p) ? 'Instagram · Reels' : /profile/i.test(p) ? 'Instagram · Профіль' : 'Instagram') : undefined;
      bezoek(v, standaard);
    }
    if (soort === 'instagram') for (const m of mediaSet.keys()) if (!uit.has(mediaSet.get(m)!)) zet(m, { album: 'Instagram' });
    return uit;
  }
  if (soort === 'telegram') {
    for (const [, v] of json) {
      const r = obj(v); const chats = Array.isArray(obj(r.chats).list) ? obj(r.chats).list : [r];
      for (const c of chats.map(obj)) for (const msg of (Array.isArray(c.messages) ? c.messages : []).map(obj)) {
        const f = typeof msg.photo === 'string' ? msg.photo : typeof msg.file === 'string' ? msg.file : '';
        if (!f) continue; const pad = zoekEind(f); if (!pad) continue;
        const t = isoVanSec(msg.date_unixtime);
        const tekst = Array.isArray(msg.text) ? msg.text.map((x: unknown) => (typeof x === 'string' ? x : obj(x).text || '')).join('') : String(msg.text || '');
        zet(pad, { ...(t ? { genomenOp: t, datumBron: 'sidecar' as const } : {}), album: schoneTekst(`Telegram · ${c.name || 'чат'}`, FOTO_LIMIETEN.albumNaamMax), ...(tekst ? { beschrijving: schoneTekst(tekst, FOTO_LIMIETEN.beschrijvingMax) } : {}) });
      }
    }
    return uit;
  }
  if (soort === 'flickr') {
    for (const [p, v] of json) {
      const j = obj(v); const id = /photo_(\d+)\.json$/.exec(p)?.[1] || String(j.id || ''); if (!id) continue;
      const pad = [...mediaSet.keys()].find((m) => new RegExp(`(^|[_/])${id}(_o)?\\.[a-z0-9]+$`, 'i').test(m)); if (!pad) continue;
      const dt = String(j.date_taken || ''); const t = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dt) ? new Date(dt.replace(' ', 'T') + 'Z').toISOString() : undefined;
      const geo = Array.isArray(j.geo) ? obj(j.geo[0]) : obj(j.geo);
      zet(pad, { ...(t ? { genomenOp: t, datumBron: 'sidecar' as const } : {}), ...(j.name ? { titel: schoneTekst(j.name, FOTO_LIMIETEN.titelMax) } : {}), ...(j.description ? { beschrijving: schoneTekst(j.description, FOTO_LIMIETEN.beschrijvingMax) } : {}),
        ...(Array.isArray(j.albums) && j.albums[0] ? { album: schoneTekst(obj(j.albums[0]).title, FOTO_LIMIETEN.albumNaamMax) } : {}), ...(Array.isArray(j.tags) ? { tags: j.tags.map((t: unknown) => schoneTag(obj(t).tag ?? t)).filter(Boolean).slice(0, FOTO_LIMIETEN.tagsMax) } : {}),
        plaats: geldigeLat(Number(geo.latitude) / (Math.abs(Number(geo.latitude)) > 90 ? 1e6 : 1), Number(geo.longitude) / (Math.abs(Number(geo.longitude)) > 180 ? 1e6 : 1)) });
    }
    return uit;
  }
  // vk / icloud / algemeen: album = map (behalve wortel en technische mapnamen).
  for (const m of mediaSet.keys()) { const map = mapnaam(m); if (map && !/^(photos|фотографии|фотографії|media|dcim|\d{3}[a-z]{5}|camera|images?)$/i.test(map)) zet(m, { album: schoneTekst(map, FOTO_LIMIETEN.albumNaamMax) }); }
  return uit;
}

// ---------------------------------------------------------------------------------------------- EXIF (JPEG, puur)
export type Exif = { genomenOp?: string; camera?: string; breedte?: number; hoogte?: number; plaats?: { lat: number; lon: number } | null; orientatie?: number };
/** Leest EXIF uit de eerste 256 KB van een JPEG. Geen bibliotheek: alleen de velden die we tonen. Kapot = {}. */
export function leesExif(b: Uint8Array): Exif {
  try {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return {};
    const uit: Exif = {};
    let i = 2;
    while (i + 4 < b.length) {
      if (b[i] !== 0xff) break;
      const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker) && i + 9 < b.length) { uit.hoogte ??= (b[i + 5] << 8) | b[i + 6]; uit.breedte ??= (b[i + 7] << 8) | b[i + 8]; }
      if (marker === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) Object.assign(uit, tiff(b, i + 10, Math.min(b.length, i + 2 + len)), { breedte: uit.breedte, hoogte: uit.hoogte });
      if (marker === 0xda) break;
      i += 2 + len;
    }
    return Object.fromEntries(Object.entries(uit).filter(([, v]) => v !== undefined)) as Exif;
  } catch { return {}; }
}
function tiff(b: Uint8Array, start: number, eind: number): Exif {
  const le = b[start] === 0x49;
  const u16 = (o: number) => (le ? b[start + o] | (b[start + o + 1] << 8) : (b[start + o] << 8) | b[start + o + 1]);
  const u32 = (o: number) => (le ? (b[start + o] | (b[start + o + 1] << 8) | (b[start + o + 2] << 16)) + b[start + o + 3] * 0x1000000 : b[start + o] * 0x1000000 + ((b[start + o + 1] << 16) | (b[start + o + 2] << 8) | b[start + o + 3]));
  const ascii = (o: number, n: number) => { let s = ''; for (let k = 0; k < n && start + o + k < eind; k++) { const c = b[start + o + k]; if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
  const ifd = (o: number) => { const tags = new Map<number, { type: number; n: number; off: number }>(); if (o <= 0 || start + o + 2 > eind) return tags; const n = u16(o); for (let k = 0; k < n && k < 400; k++) { const e = o + 2 + k * 12; if (start + e + 12 > eind) break; tags.set(u16(e), { type: u16(e + 2), n: u32(e + 4), off: e + 8 }); } return tags; };
  const waarde = (t?: { type: number; n: number; off: number }) => { if (!t) return undefined; if (t.type === 2) return ascii(t.n > 4 ? u32(t.off) : t.off, t.n); if (t.type === 3) return u16(t.off); if (t.type === 4) return u32(t.off); return undefined; };
  const rationals = (t?: { type: number; n: number; off: number }) => { if (!t || t.type !== 5) return []; const o = u32(t.off); return Array.from({ length: Math.min(t.n, 3) }, (_, k) => { const d = u32(o + k * 8 + 4); return d ? u32(o + k * 8) / d : 0; }); };
  const t0 = ifd(u32(4)); const uit: Exif = {};
  const merk = waarde(t0.get(0x010f)), model = waarde(t0.get(0x0110));
  if (model) uit.camera = String(model).startsWith(String(merk || '')) ? String(model) : `${merk || ''} ${model}`.trim();
  const or = waarde(t0.get(0x0112)); if (typeof or === 'number' && or >= 1 && or <= 8) uit.orientatie = or;
  const exifOff = waarde(t0.get(0x8769)); const te = typeof exifOff === 'number' ? ifd(exifOff) : new Map();
  const dt = String(waarde(te.get(0x9003)) || waarde(te.get(0x9004)) || waarde(t0.get(0x0132)) || '');
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dt);
  if (m && m[1] !== '0000') { const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])); if (!Number.isNaN(d.getTime())) uit.genomenOp = d.toISOString(); }
  const pw = waarde(te.get(0xa002)), ph = waarde(te.get(0xa003)); if (typeof pw === 'number' && typeof ph === 'number' && pw && ph) { uit.breedte = pw; uit.hoogte = ph; }
  const gpsOff = waarde(t0.get(0x8825));
  if (typeof gpsOff === 'number') {
    const g = ifd(gpsOff); const la = rationals(g.get(2)), lo = rationals(g.get(4));
    if (la.length === 3 && lo.length === 3) { const lat = (la[0] + la[1] / 60 + la[2] / 3600) * (waarde(g.get(1)) === 'S' ? -1 : 1); const lon = (lo[0] + lo[1] / 60 + lo[2] / 3600) * (waarde(g.get(3)) === 'W' ? -1 : 1); uit.plaats = geldigeLat(lat, lon); }
  }
  return uit;
}

// ---------------------------------------------------------------------------------------------- duplicaten en gelijkende foto's
export type GroepItem = { id: string; sha256?: string; bytes?: number; genomenOp?: string; dhash?: string; camera?: string; naam?: string };
/** Exacte duplicaten: zelfde sha256. Waarschijnlijke: zelfde grootte én zelfde opnametijd (verschillende bestanden van één opname). */
export function duplicaatGroepen(items: readonly GroepItem[]): Array<{ soort: 'exact' | 'waarschijnlijk'; ids: string[] }> {
  const per = (sleutel: (i: GroepItem) => string | null) => { const m = new Map<string, string[]>(); for (const i of items) { const k = sleutel(i); if (k) (m.get(k) || m.set(k, []).get(k)!).push(i.id); } return [...m.values()].filter((g) => g.length > 1); };
  const exact = per((i) => i.sha256 || null);
  const inExact = new Set(exact.flat());
  const waarsch = per((i) => (i.bytes && i.genomenOp ? `${i.bytes}|${i.genomenOp}` : null)).map((g) => g.filter((id) => !inExact.has(id))).filter((g) => g.length > 1);
  return [...exact.map((ids) => ({ soort: 'exact' as const, ids })), ...waarsch.map((ids) => ({ soort: 'waarschijnlijk' as const, ids }))];
}
export function hamming(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 64;
  let d = 0; for (let k = 0; k < 16; k++) { let x = parseInt(a[k], 16) ^ parseInt(b[k], 16); while (x) { d += x & 1; x >>= 1; } } return d;
}
/** Gelijkende foto's: beeldafdruk (dHash, 64 bit) met afstand ≤ drempel, of een reeks van dezelfde camera binnen 3 s. */
export function gelijkendeGroepen(items: readonly GroepItem[], drempel = 6, max = 6000): string[][] {
  const lijst = items.slice(0, max); const ouder = lijst.map((_, k) => k);
  const wortel = (k: number): number => (ouder[k] === k ? k : (ouder[k] = wortel(ouder[k])));
  const een = (a: number, b: number) => { ouder[wortel(a)] = wortel(b); };
  const metHash = lijst.map((i, k) => [i, k] as const).filter(([i]) => i.dhash);
  for (let x = 0; x < metHash.length; x++) for (let y = x + 1; y < metHash.length; y++) if (hamming(metHash[x][0].dhash!, metHash[y][0].dhash!) <= drempel) een(metHash[x][1], metHash[y][1]);
  const opTijd = lijst.map((i, k) => [i, k] as const).filter(([i]) => i.genomenOp && i.camera).sort((a, b) => a[0].genomenOp!.localeCompare(b[0].genomenOp!));
  for (let x = 1; x < opTijd.length; x++) { const [a] = opTijd[x - 1], [b] = opTijd[x]; if (a.camera === b.camera && Math.abs(Date.parse(b.genomenOp!) - Date.parse(a.genomenOp!)) <= 3000) een(opTijd[x - 1][1], opTijd[x][1]); }
  const groepen = new Map<number, string[]>(); lijst.forEach((i, k) => (groepen.get(wortel(k)) || groepen.set(wortel(k), []).get(wortel(k))!).push(i.id));
  return [...groepen.values()].filter((g) => g.length > 1);
}

// ---------------------------------------------------------------------------------------------- het buitenformaat
export type FotoHerkomst = { bron: string; pad?: string; archief?: string; op: string };
export type FotoItem = {
  id: string; naam: string; titel: string; beschrijving: string; soort: FotoSoort; mime: string; bytes: number; sha256: string;
  breedte: number | null; hoogte: number | null; genomenOp: string | null; datumBron: 'exif' | 'sidecar' | 'bestand' | 'onbekend';
  plaats: { lat: number; lon: number } | null; camera: string; tags: string[]; albums: string[]; favoriet: boolean; verborgen: boolean;
  bron: string; herkomst: FotoHerkomst[];
  opslag: 'eigen' | 'cloud';           // eigen = kopie in de fotodienst; cloud = virtueel, bestand blijft in «Хмарне сховище»
  beschikbaar: boolean;                // bytes nu leesbaar
  backup: { kopie: boolean; gecontroleerdOp: string | null; ok: boolean | null };
  miniatuur: string | null;            // data:-URL (klein JPEG) of null
  dhash: string | null; toegevoegdOp: string;
};
export type FotoAlbum = { id: string; naam: string; soort: 'album' | 'collectie'; bron: string; aantal: number; omslag: string | null; createdAt: string };
