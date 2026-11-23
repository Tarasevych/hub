// Cloud vNext (29.10.2026, vlag cloud-vnext): het GEDEELDE contract van de vernieuwde cloudpagina — browser (src/cloud-vnext/*),
// server (backend/cloud-vnext-*.ts) en tests spreken dit bestand.
//
// REGELS DIE HIER VASTLIGGEN
//   • Eigen bestanden blijven in de bestaande opslag (app.records-collecties cloud_items_v1 + bytes via server/platform/opslag.ts):
//     vNext voegt mappen, labels, favorieten, prullenbak en versies toe als VELDEN en een nieuwe collectie cloud_mappen_v1 —
//     geen datamigratie, de oude pagina blijft dezelfde records lezen.
//   • De prullenbak bewaart 30 dagen (PRULLENBAK_DAGEN); «verwijderen» is altijd eerst soft-delete.
//   • Uploaden gaat in stukken (base64, STUK_MAX) tot UPLOAD_MAX; downloaden tot DOWNLOAD_MAX in één antwoord — groter bestaat
//     eerlijk niet in deze release (geen stream), en de UI zegt dat.
//   • De catalogus hieronder zegt per aanbieder wat VANDAAG in de code zit (stand), wat erna werkt (richting) en wat ontbreekt —
//     dezelfde eerlijkheidsregel als shared/agenda-catalogus.ts en shared/integraties-catalogus.ts. Niets heet «підключено»
//     zonder de levende servercontrole.
import type { Tweetalig } from './notities-model';
export type { Tweetalig };

export const CLOUD_VNEXT_VLAG = 'cloud-vnext';

// ------------------------------------------------------------------------------- grenzen (server dwingt ze af; UI toont ze)
export const CLOUD_VNEXT_LIMIETEN = Object.freeze({
  // Eigen opslag heeft GEEN verzonnen plafond meer: de echte grens is de vrije schijf (SCHIJF_VOL met cijfers).
  // Deze waarde is alleen de bovengrens van wat de upload-weg aankan (stromend, in stukken, hervattbaar); de eigenaar
  // kan haar met de omgeving CLOUD_EIGEN_MAX_BYTES verleggen. Zie shared/cloud-overdracht-model.ts voor de grenzen per dienst.
  uploadMaxBytes: 32 * 1024 * 1024 * 1024, // 32 GiB via de upload-weg; de schijf beslist het echte maximum
  stukMaxBytes: 4 * 1024 * 1024,         // één upload-stuk vóór base64; stukken mogen parallel en in elke volgorde
  downloadMaxBytes: 32 * 1024 * 1024,    // één download-antwoord in ÉÉN stuk; groter gaat in delen (offset/lengte)
  downloadDeelBytes: 4 * 1024 * 1024,    // één deel bij download in delen
  naamMax: 200,
  tagMax: 40, tagsMax: 24,
  mapDiepteMax: 12, mappenMax: 2000,
  lijstPagina: 200,
  versiesMax: 20,                        // per bestand bewaarde vorige versies
  prullenbakDagen: 30,
  zoekMax: 120,
});

export type CloudSoort = 'afbeelding' | 'video' | 'audio' | 'document' | 'werkblad' | 'presentatie' | 'pdf' | 'archief' | 'code' | 'tekst' | 'notitie' | 'link' | 'overig';
export const CLOUD_SOORT_LABEL: Record<CloudSoort, Tweetalig> = Object.freeze({
  afbeelding: ['Фото', 'Foto’s'], video: ['Відео', 'Video’s'], audio: ['Аудіо', 'Audio'], document: ['Документи', 'Documenten'],
  werkblad: ['Таблиці', 'Werkbladen'], presentatie: ['Презентації', 'Presentaties'], pdf: ['PDF', 'PDF'], archief: ['Архіви', 'Archieven'],
  code: ['Код', 'Code'], tekst: ['Текст', 'Tekst'], notitie: ['Нотатки', 'Notities'], link: ['Посилання', 'Links'], overig: ['Інше', 'Overig'],
});
/** MIME → soort; samen met de bestandsnaam (extensie als MIME generiek is). Puur, geen I/O. */
export function cloudSoort(mime: string, naam = ''): CloudSoort {
  const m = String(mime || '').toLowerCase(); const lager = String(naam || '').toLowerCase();
  const ext = (lager.match(/\.([a-z0-9]{1,8})$/i)?.[1] || '').toLowerCase();
  if (m.startsWith('image/')) return 'afbeelding';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/spreadsheetml|oasis\.opendocument\.spreadsheet|ms-excel/.test(m) || ['xlsx', 'xls', 'ods', 'csv'].includes(ext)) return m === 'text/csv' || ext === 'csv' ? 'werkblad' : 'werkblad';
  if (/presentationml|oasis\.opendocument\.presentation|ms-powerpoint/.test(m) || ['pptx', 'ppt', 'odp'].includes(ext)) return 'presentatie';
  if (/wordprocessingml|oasis\.opendocument\.text|msword|rtf/.test(m) || ['docx', 'doc', 'odt', 'rtf'].includes(ext)) return 'document';
  if (/zip|x-7z|x-rar|vnd\.rar|gzip|x-tar|x-bzip|x-xz|zstd/.test(m) || lager.endsWith('.tar.gz') || lager.endsWith('.tar.bz2') || lager.endsWith('.tar.xz') || ['zip', '7z', 'rar', 'gz', 'tgz', 'tar', 'bz2', 'tbz2', 'xz', 'txz', 'zst', 'iso'].includes(ext)) return 'archief';
  if (/javascript|typescript|json|xml|x-sh|x-python/.test(m) || ['js', 'ts', 'tsx', 'jsx', 'mjs', 'cjs', 'py', 'sh', 'json', 'xml', 'yml', 'yaml', 'sql', 'css', 'html', 'toml', 'ini', 'go', 'rs', 'java', 'kt', 'c', 'cpp', 'h', 'cs', 'php', 'rb'].includes(ext)) return 'code';
  if (m === 'text/markdown' || ext === 'md') return 'tekst';
  if (m.startsWith('text/') || ['txt', 'log', 'env'].includes(ext)) return 'tekst';
  return 'overig';
}

const VEILIG_EXT_MIME: Readonly<Record<string, string>> = Object.freeze({
  zip: 'application/zip', tar: 'application/x-tar', gz: 'application/gzip', tgz: 'application/gzip',
  '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar', bz2: 'application/x-bzip2',
  tbz2: 'application/x-bzip2', xz: 'application/x-xz', txz: 'application/x-xz', zst: 'application/zstd',
  pdf: 'application/pdf', json: 'application/json', xml: 'text/plain' /* SEC-002 wolk-09: XML kan XHTML/SVG met scripts dragen */, md: 'text/markdown',
  txt: 'text/plain', log: 'text/plain', csv: 'text/csv', yml: 'text/plain', yaml: 'text/plain',
  toml: 'text/plain', ini: 'text/plain', sql: 'text/plain', py: 'text/plain', ts: 'text/plain',
  tsx: 'text/plain', js: 'text/plain', jsx: 'text/plain', mjs: 'text/plain', cjs: 'text/plain',
  css: 'text/css', html: 'text/plain', htm: 'text/plain', svg: 'text/plain', sh: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
});
const ONVEILIG_BROWSER_MIME = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|application\/(x-msdownload|x-msdos-program|x-sh|x-httpd-php|hta))$|javascript/;

// ------------------------------------------------------------------------------- MIME-keuring (SEC-002 wolk-09, 12.11.2026)
// Eén keuring voor alles wat de eigen opslag IN gaat (upload, archief, Drive→eigen) en UIT gaat (lijst, download).
//   • ACTIEF = wat een browser als pagina, script of plug-in zou uitvoeren: html, xhtml, svg, alles met «javascript»,
//     vbscript, flash, server-scripttypen (x-httpd-*) en uitvoerbare download-typen. Uploaden met zo'n type → geweigerd;
//     een bestaand record met zo'n type verlaat de server als application/octet-stream.
//   • De XML-FAMILIE (…/xml, …+xml, text/xsl) mag erin, maar alleen als text/plain: XML met de naamruimte van XHTML of SVG
//     voert scripts uit zodra iemand het als document opent.
const MIME_VORM = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const MIME_ACTIEF = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/vbscript|application\/x-shockwave-flash|application\/(x-msdownload|x-msdos-program|x-sh|hta|x-httpd-[a-z0-9.+-]+))$|javascript|vbscript|ecmascript/;
const MIME_XML = /(^[a-z0-9!#$&^_.-]+\/xml$)|(\+xml$)|(^text\/xsl$)|(^application\/xslt\+xml$)/;
/** Normaliseren: kleine letters, zonder parameters. */
const mimeNorm = (raw: unknown): string => String(typeof raw === 'string' ? raw : '').split(';')[0].trim().toLowerCase().slice(0, 160);
/** Mag een bestand met dit (genormaliseerde) type de eigen opslag in? Nee voor een ongeldig of ACTIEF type. */
export const mimeToegestaan = (mime: string): boolean => MIME_VORM.test(mime) && !MIME_ACTIEF.test(mime);
/** Het type waarmee een bestand de opslag in- én uitgaat: actief/ongeldig → octet-stream, XML-familie → text/plain. */
export function veiligeMime(raw: unknown): string {
  const m = mimeNorm(raw);
  if (!MIME_VORM.test(m) || MIME_ACTIEF.test(m)) return 'application/octet-stream';
  if (MIME_XML.test(m)) return 'text/plain';
  return m;
}

/**
 * Maakt van elk door de browser gemeld bestandstype een veilige upload-MIME:
 *   • ontbrekende MIME (veel mappen, archieven en codebestanden) krijgt een passend type op extensie of octet-stream;
 *   • typen die een browser als actieve pagina of script zou uitvoeren (html, svg, js, sh, exe) worden opgeslagen als
 *     onschadelijke tekst of ruwe bytes, zodat elke projectmap probleemloos geüpload kan worden zonder scriptuitvoering.
 */
export function veiligUploadMime(rawMime: unknown, naam = ''): string {
  const m = String(rawMime || '').split(';')[0].trim().toLowerCase().slice(0, 160);
  const lager = String(naam || '').toLowerCase();
  if (lager.endsWith('.tar.gz')) return 'application/gzip';
  const ext = (lager.match(/\.([a-z0-9]{1,10})$/i)?.[1] || '').toLowerCase();
  if (!m || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(m)) {
    return VEILIG_EXT_MIME[ext] || 'application/octet-stream';
  }
  if (ONVEILIG_BROWSER_MIME.test(m) || MIME_ACTIEF.test(m)) {
    return ['exe', 'dll', 'msi', 'com', 'bin', 'swf'].includes(ext) ? 'application/octet-stream' : 'text/plain';
  }
  if (MIME_XML.test(m)) return 'text/plain';
  return m;
}

// ------------------------------------------------------------------------------- mappen en bestanden (eigen opslag)
export type CloudMap = { id: string; naam: string; ouderId: string | null; aangemaaktOp: string; aantal?: number };
export type CloudVersie = { pad: string; bytes: number; sha256: string; op: string };
export type CloudBestand = {
  id: string; naam: string; soort: CloudSoort; mime: string; bytes: number; sha256: string;
  mapId: string | null; workspaceId: string | null; tags: string[]; favoriet: boolean;
  kind: 'file' | 'note' | 'link'; url?: string;
  aangemaaktOp: string; bijgewerktOp: string; geopendOp: string | null;
  verwijderdOp: string | null; versies: number; bron: string;
};
export type CloudSortering = 'naam' | 'datum' | 'grootte' | 'soort';
export const CLOUD_SORTERING: readonly CloudSortering[] = Object.freeze(['naam', 'datum', 'grootte', 'soort']);

// ------------------------------------------------------------------------------- archieven & gedeelde koppelingen (CLOUD-001)
export type CloudArchiefIngang = {
  pad: string; naam: string; map: boolean; bytes: number; soort: CloudSoort; gewijzigdOp: string | null;
};
export type CloudDeelDoelSoort = 'bestand' | 'map' | 'selectie' | 'bestand_deel' | 'archief_pad';
export type CloudDeelDeelSoort = 'regels' | 'paginas' | 'bytes';
export type CloudDeelModus = 'link' | 'accounts';
export type CloudDeelRechten = 'bekijken' | 'downloaden';
export type CloudDeelStatus = 'actief' | 'gepland' | 'gepauzeerd' | 'verlopen' | 'limiet_bereikt' | 'ingetrokken';

export type CloudDeelBereik = {
  /** Voor map of selectie: lege lijst bij `doelSoort === 'map'` betekent de hele map inclusief alle submappen; anders alleen deze id's. */
  bestandIds?: string[];
  mapIds?: string[];
  /** Voor `bestand_deel`: welk stuk van het bestand zichtbaar en downloadbaar is (niets erbuiten verlaat de server). */
  deelSoort?: CloudDeelDeelSoort;
  vanRegel?: number;
  totRegel?: number;
  vanPagina?: number;
  totPagina?: number;
  vanByte?: number;
  totByte?: number;
  /** Voor `archief_pad`: toegestane paden binnen het archief (.zip / .tar / .tar.gz). */
  archiefPaden?: string[];
};

export type CloudDeelOntvanger = {
  email: string;
  userId?: string;
  naam?: string;
  geregistreerd: boolean;
  toegevoegdOp: string;
};

export type CloudDeelKoppeling = {
  id: string;
  code: string;
  url: string;
  naam: string;
  notitie: string;
  doelSoort: CloudDeelDoelSoort;
  doelId: string;
  doelNaam: string;
  bereik: CloudDeelBereik;
  modus: CloudDeelModus;
  ontvangers: CloudDeelOntvanger[];
  rechten: CloudDeelRechten;
  heeftWachtwoord: boolean;
  actiefVanaf: string | null;
  verlooptOp: string | null;
  maxWeergaven: number | null;
  maxDownloads: number | null;
  gepauzeerd: boolean;
  ingetrokkenOp: string | null;
  status: CloudDeelStatus;
  weergavenAantal: number;
  downloadsAantal: number;
  uniekeBezoekers: number;
  laatstBekekenOp: string | null;
  aangemaaktOp: string;
  bijgewerktOp: string;
};

export type CloudDeelGebeurtenis = {
  id: number;
  soort: 'weergave' | 'inhoud' | 'download' | 'map_archief' | 'geweigerd';
  doelPad: string;
  ontvangerEmail: string;
  apparaat: string;
  aangemaaktOp: string;
};

export type CloudDeelDagStat = { dag: string; weergaven: number; downloads: number };

export type CloudGedeeldMetMij = {
  id: string;
  code: string;
  url: string;
  naam: string;
  notitie: string;
  doelSoort: CloudDeelDoelSoort;
  doelNaam: string;
  rechten: CloudDeelRechten;
  eigenaarNaam: string;
  eigenaarEmail: string;
  verlooptOp: string | null;
  aangemaaktOp: string;
};

const KOPPELING_CODE_PATROON = /^[A-Za-z0-9_-]{16,96}$/;
/** Haalt de gedeelde koppelingscode uit `/gedeeld/<code >` of `?koppeling=<code>`. Puur, geen DOM. */
export function leesGedeeldKoppelingUitPadOfZoek(pathname: string, search: string): string {
  const delen = String(pathname || '/').split('/').filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  if ((delen[0] === 'gedeeld' || delen[0] === 'shared') && delen[1] && KOPPELING_CODE_PATROON.test(delen[1])) {
    return delen[1];
  }
  const q = new URLSearchParams(String(search || ''));
  const k = String(q.get('koppeling') || '').trim();
  return KOPPELING_CODE_PATROON.test(k) ? k : '';
}

/** Naam schoonmaken zoals de server het doet: één regel, geen pad-tekens, 1..naamMax. '' = ongeldig. */
export function schoneNaam(raw: unknown): string {
  const n = String(raw ?? '').replace(/[\u0000-\u001f/\\]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n && n !== '.' && n !== '..' ? n.slice(0, CLOUD_VNEXT_LIMIETEN.naamMax) : '';
}
/** Tag schoonmaken: kleine letters/cijfers/koppelteken/underscore/dubbele punt, ook cyrillisch. '' = ongeldig. */
export function schoneTag(raw: unknown): string {
  const t = String(raw ?? '').toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}:_-]/gu, '').slice(0, CLOUD_VNEXT_LIMIETEN.tagMax);
  return /\p{L}|\p{N}/u.test(t) ? t : '';
}

// ------------------------------------------------------------------------------- API-contract (alle POST, hub-auth zoals de rest)
// backend/cloud-vnext-bestanden.ts implementeert; src/cloud-vnext/cloud-client.ts roept aan. Fouten: { error: CODE }.
//   /api/owner/cloud/vnext/overzicht      {} → { stats: { aantal, bytes, perSoort: Record<CloudSoort, { aantal; bytes }> },
//                                              recent: CloudBestand[], favorieten: CloudBestand[], prullenbak: number,
//                                              mappen: CloudMap[] (wortel), workspaces: Array<{id;titel;aantal}> }
//   /api/owner/cloud/vnext/bestanden      { mapId?, zoek?, soort?, tag?, favoriet?, prullenbak?, sorteer?, oplopend?, token? }
//                                           → { bestanden, mappen, pad: CloudMap[], volgende: string|null, totaal: number|null }
//   /api/owner/cloud/vnext/map            { actie: 'nieuw'|'hernoem'|'verplaats'|'verwijder', id?, naam?, ouderId? } → { map? }
//   /api/owner/cloud/vnext/bestand        { actie: 'hernoem'|'verplaats'|'tags'|'favoriet'|'verwijder'|'herstel'|'definitief',
//                                           id | ids: string[], naam?, mapId?, tags?, favoriet? } → { bestand? , aantal? }
//   /api/owner/cloud/vnext/upload         { actie: 'begin', naam, mime, bytes, mapId? } → { id, stukMax }
//                                         { actie: 'stuk', id, offset, data(b64) } → { ontvangen }   (parallel, elke volgorde)
//                                         { actie: 'status', id } → { id, naam, bytes, stukMax, ontvangen, ontbreekt: number[] }
//                                         { actie: 'zoek', naam, bytes, mapId? } → { sessie: { id, ontvangen } | null }
//                                         { actie: 'klaar', id, sha256 } → { bestand }   (stromende sha-controle server-side)
//                                         { actie: 'afbreken', id } → { ok }
//   /api/owner/cloud/vnext/download       { id, versie?, offset?, lengte? } → { naam, mime, bytes, sha256, offset?, data(b64) }
//                                         zonder offset alleen tot downloadMaxBytes (anders TE_GROOT → in delen halen)
//   /api/owner/cloud/vnext/versies        { id } → { versies: CloudVersie[] } ; { id, actie:'herstel', versie } → { bestand }
//   /api/owner/cloud/vnext/taken          achtergrond-overdrachten tussen diensten — contract in shared/cloud-overdracht-model.ts
// Foutcodes: NAAM_ONGELDIG, MAP_ONBEKEND, MAP_DIEPTE, MAP_VOL, BESTAND_ONBEKEND, TAG_ONGELDIG, TE_GROOT, STUK_BUITEN_ORDE,
//            SHA_MISMATCH, UPLOAD_ONBEKEND, PRULLENBAK_ALLEEN, NIET_IN_PRULLENBAK, MIME_NIET_TOEGESTAAN, LIMIET_BEREIKT,
//            SCHIJF_VOL, SESSIE_VERLOPEN, DEEL_BUITEN_BEREIK. Uploadsessies leven op de serverschijf (herstart-bestendig).

// // ------------------------------------------------------------------------------- integratiecatalogus (eerlijk, bijgewerkt in M3)
// stand:
//   'werkt'            vandaag gekoppeld én te gebruiken; `levend` zegt welke servercontrole dat bevestigt.
//   'webdav'           eigen HTTPS-WebDAV-koppeling (Nextcloud / NAS) met app-wachtwoord in de sleutelkluis en PROPFIND-mappenlijst.
//   'sleutels-nodig'   de OAuth- en lijstcode staat klaar, maar de EIGENAAR moet eerst toepassingsgegevens op de server instellen (`vereist`).
//   'gepland'          er is hoogstens transportcode zonder gebruikersroutes — niet te koppelen, knop bestaat niet.
//   'niet-mogelijk'    de aanbieder heeft geen openbare webkoppeling (of versleutelt aan de clientzijde): met eerlijke omweg.
export type CloudAanbiederStand = 'werkt' | 'webdav' | 'sleutels-nodig' | 'gepland' | 'niet-mogelijk';
export type CloudRichting = 'lezen' | 'lezen-en-schrijven' | 'importeren' | 'geen';
export type CloudLevend = 'google' | 'm4' | 'photos' | 'webdav';
export type CloudWebdavAanbieder = 'nextcloud' | 'nas-webdav';

export type CloudWebdavKoppeling = {
  id: string;
  aanbieder: CloudWebdavAanbieder;
  naam: string;
  origin: string;
  padVoorvoegsel: string;
  gebruikersnaam: string;
  status: 'connected' | 'reauth_required' | 'revoked';
  laatstGecontroleerdOp: string | null;
  bijgewerktOp: string;
};

export type CloudWebdavIngang = {
  pad: string;
  naam: string;
  map: boolean;
  bytes: number | null;
  mime: string;
  revisie: string;
};

export type CloudAutomatiseringRichting = 'eigen-naar-drive' | 'drive-naar-eigen';
export type CloudAutomatiseringRegel = {
  id: string;
  naam: string;
  actief: boolean;
  richting: CloudAutomatiseringRichting;
  soortActie: 'kopie' | 'verplaats';
  filterSoort: CloudSoort | 'alle';
  bronMapId: string | null;
  doelMapId: string | null;
  driveAccountId: string;
  laatstUitgevoerdOp: string | null;
  laatstTakenAantal: number;
  aangemaaktOp: string;
  bijgewerktOp: string;
};

export type CloudVnextAanbieder = {
  id: string; naam: string; monogram: string; site: string;
  /** REESTR-LOGO-001: sleutel in het ene merkregister (src/merk); zonder = monogram (geen logo met eerlijke herkomst). */
  merk?: string;
  stand: CloudAanbiederStand; richting: CloudRichting;
  uitleg: Tweetalig;
  /** Wat er vandaag ECHT werkt zodra gekoppeld (of waarom niet). Verplicht. */
  detail: Tweetalig;
  /** Alleen bij 'sleutels-nodig': de omgevingsvariabelen die de eigenaar moet instellen. */
  vereist?: readonly string[];
  /** Alleen bij 'niet-mogelijk' of 'gepland': de eerlijke omweg die vandaag al kan. */
  omweg?: Tweetalig;
  levend?: CloudLevend;
};
export const CLOUD_VNEXT_AANBIEDERS: readonly CloudVnextAanbieder[] = Object.freeze([
  { id: 'google-drive', merk: 'googledrive', naam: 'Google Drive', monogram: 'G', site: 'https://drive.google.com', stand: 'werkt', richting: 'lezen-en-schrijven', levend: 'google',
    uitleg: ['Повне підключення через доступ Google: перегляд тек, пошук, завантаження, перейменування, переміщення, кошик, зірочки; кілька облікових записів.', 'Volledige koppeling via Google-toegang: mappen, zoeken, uploaden, hernoemen, verplaatsen, prullenbak, sterren; meerdere accounts.'],
    detail: ['Межі сьогодні: вивантаження на Диск до 5 МБ за раз, попередній перегляд до 32 МБ (відео 128 МБ), спільні диски не показуються.', 'Grenzen vandaag: upload naar Drive tot 5 MB per keer, voorbeeldweergave tot 32 MB (video 128 MB), gedeelde schijven worden niet getoond.'] },
  { id: 'google-photos', merk: 'googlephotos', naam: 'Google Photos', monogram: 'GP', site: 'https://photos.google.com', stand: 'werkt', richting: 'importeren', levend: 'photos',
    uitleg: ['Офіційне вікно вибору Google: ви самі обираєте світлини, до 10 за раз зберігаються у ваше сховище.', 'De officiële kiezer van Google: u kiest zelf foto’s in het Google-venster; tot 10 per keer worden in uw opslag bewaard.'],
    detail: ['Лише перенесення за вашим вибором — Google не дає зовнішнім сайтам читати всю бібліотеку.', 'Alleen import op uw keuze — Google laat externe sites niet de hele bibliotheek lezen.'] },
  { id: 'onedrive', merk: 'microsoftonedrive', naam: 'Microsoft OneDrive', monogram: '1D', site: 'https://onedrive.live.com', stand: 'sleutels-nodig', richting: 'lezen', levend: 'm4',
    uitleg: ['Підключення OAuth, перегляд тек і захищений попередній перегляд для особистого та робочого сховища.', 'OAuth-koppeling, mappenlijst en veilige voorbeeldweergave voor persoonlijke én zakelijke opslag.'],
    detail: ['Щоб увімкнути: зареєструйте застосунок у Microsoft Entra і задайте ONEDRIVE_CLIENT_ID та ONEDRIVE_CLIENT_SECRET у налаштуваннях сервера.', 'Om in te schakelen: registreer een toepassing in Microsoft Entra en stel ONEDRIVE_CLIENT_ID en ONEDRIVE_CLIENT_SECRET op de server in.'],
    vereist: ['ONEDRIVE_CLIENT_ID', 'ONEDRIVE_CLIENT_SECRET'] },
  { id: 'dropbox', merk: 'dropbox', naam: 'Dropbox', monogram: 'Dx', site: 'https://www.dropbox.com', stand: 'sleutels-nodig', richting: 'lezen', levend: 'm4',
    uitleg: ['Підключення OAuth із захистом коду обміну, список тек і попередній перегляд файлів; підготовлено передавання частинами.', 'OAuth-koppeling met PKCE, mappenlijst en voorbeeldweergave; overdracht in delen is voorbereid.'],
    detail: ['Щоб увімкнути: створіть застосунок у панелі розробника Dropbox і задайте CLOUD_DROPBOX_CLIENT_ID та CLOUD_DROPBOX_CLIENT_SECRET на сервері.', 'Om in te schakelen: maak een toepassing in het ontwikkelaarspaneel van Dropbox en stel CLOUD_DROPBOX_CLIENT_ID en CLOUD_DROPBOX_CLIENT_SECRET in.'],
    vereist: ['CLOUD_DROPBOX_CLIENT_ID', 'CLOUD_DROPBOX_CLIENT_SECRET'] },
  { id: 'box', merk: 'box', naam: 'Box', monogram: 'Bx', site: 'https://www.box.com', stand: 'sleutels-nodig', richting: 'lezen', levend: 'm4',
    uitleg: ['Підключення OAuth, перегляд тек і захищений попередній перегляд файлів через інтерфейс Box.', 'OAuth-koppeling, mappenlijst en veilige voorbeeldweergave via de programmaverbinding van Box.'],
    detail: ['Щоб увімкнути: створіть застосунок у панелі розробника Box і задайте CLOUD_BOX_CLIENT_ID та CLOUD_BOX_CLIENT_SECRET на сервері.', 'Om in te schakelen: maak een toepassing in het ontwikkelaarspaneel van Box en stel CLOUD_BOX_CLIENT_ID en CLOUD_BOX_CLIENT_SECRET in.'],
    vereist: ['CLOUD_BOX_CLIENT_ID', 'CLOUD_BOX_CLIENT_SECRET'] },
  { id: 'icloud-drive', merk: 'icloud', naam: 'iCloud Drive', monogram: 'iC', site: 'https://www.icloud.com/iclouddrive', stand: 'niet-mogelijk', richting: 'geen',
    uitleg: ['Файли сховища Apple з вебсайту напряму недоступні.', 'Bestanden uit Apple-opslag zijn vanaf een website niet rechtstreeks bereikbaar.'],
    detail: ['Компанія Apple не надає відкритого мережевого інтерфейсу для цього сховища (внутрішній набір працює лише у власних застосунках розробника). Жоден сайт не може чесно підключити його напряму.', 'Apple biedt geen openbare netwerkverbinding voor deze opslag (het interne raamwerk werkt alleen binnen de eigen toepassingen van de ontwikkelaar). Geen enkele site kan dit eerlijk rechtstreeks koppelen.'],
    omweg: ['Обхідний шлях: на телефоні чи планшеті поділіться файлом у це сховище або тримайте файли в теці іншої підключеної служби. Календар підключається окремо у розділі Календаря.', 'Omweg: deel op telefoon of tablet het bestand naar deze opslag of bewaar bestanden in een map van een andere gekoppelde dienst. De agenda koppelt afzonderlijk via Agenda.'] },
  { id: 'mega', merk: 'mega', naam: 'MEGA', monogram: 'M', site: 'https://mega.io', stand: 'gepland', richting: 'geen',
    uitleg: ['Хмарне сховище з наскрізним шифруванням на боці клієнта.', 'Cloudopslag met eind-tot-eind-versleuteling aan de clientzijde.'],
    detail: ['Окремого перехідника в коді ще немає: служба використовує власний протокол шифрування на боці клієнта, тож чесна інтеграція потребує окремого перевіреного модуля.', 'Er zit nog geen aparte koppeling in de code: de dienst versleutelt met een eigen protocol aan de clientzijde, dus een eerlijke integratie vraagt een afzonderlijk getoetste module.'],
    omweg: ['Обхідний шлях: вивантажте потрібні файли на пристрій і додайте їх у своє сховище.', 'Omweg: bewaar de gewenste bestanden op uw apparaat en voeg ze hier toe.'] },
  { id: 'nextcloud', merk: 'nextcloud', naam: 'Nextcloud', monogram: 'N', site: 'https://nextcloud.com', stand: 'webdav', richting: 'lezen', levend: 'webdav',
    uitleg: ['Власне сховище з відкритим протоколом WebDAV поверх захищеного з’єднання HTTPS.', 'Eigen gehoste opslag met het open WebDAV-protocol over een beveiligde HTTPS-verbinding.'],
    detail: ['Підключення за адресою сервера HTTPS та окремим паролем застосунку: перевірка зв’язку PROPFIND, перегляд тек у межах простору та шифрування пароля сховищем ключів.', 'Koppeling via een HTTPS-serveradres en een afzonderlijk toepassingswachtwoord: verbindingscontrole via PROPFIND, mappenoverzicht per ruimte en versleutelde wachtwoordopslag.'] },
  { id: 'pcloud', merk: 'pcloud', naam: 'pCloud', monogram: 'P', site: 'https://www.pcloud.com', stand: 'gepland', richting: 'geen',
    uitleg: ['Європейське хмарне сховище з мережевим протоколом OAuth.', 'Europese cloudopslag met een OAuth-programmaverbinding.'],
    detail: ['Передавач і заготовка OAuth закладені в модулі M5, але покрокове підключення, користувацькі маршрути та окреме сховище ключів доступу ще заплановані.', 'Vervoer en een OAuth-opzet zitten in module M5, maar stapsgewijze koppeling, gebruikersroutes en afzonderlijke sleutelopslag staan nog gepland.'] },
  { id: 'proton-drive', merk: 'protonmail', naam: 'Proton Drive', monogram: 'Pr', site: 'https://proton.me/drive', stand: 'niet-mogelijk', richting: 'geen',
    uitleg: ['Хмарне сховище з наскрізним шифруванням від компанії Proton.', 'Eind-tot-eind-versleutelde cloudopslag van Proton.'],
    detail: ['Компанія Proton не надає відкритого мережевого інтерфейсу для сховища: файли зашифровані на боці клієнта, сторонній вебсайт прочитати їх не може. Будь-яка кнопка прямого підключення була б неправдою.', 'Proton biedt geen openbare netwerkverbinding voor deze opslag: bestanden zijn aan de clientzijde versleuteld en een externe website kan ze niet lezen. Elke knop voor rechtstreeks koppelen zou misleidend zijn.'],
    omweg: ['Обхідний шлях: збережіть файл на пристрій і завантажте його у власне сховище вручну.', 'Omweg: bewaar het bestand op uw apparaat en voeg het handmatig aan uw eigen opslag toe.'] },
  { id: 'nas-webdav', naam: 'NAS / WebDAV', monogram: 'NAS', site: 'https://www.synology.com/en-global/dsm/feature/webdav', stand: 'webdav', richting: 'lezen', levend: 'webdav',
    uitleg: ['Мережеве сховище (Synology, QNAP, TrueNAS) через захищений протокол WebDAV (HTTPS).', 'Eigen netwerkopslag (Synology, QNAP, TrueNAS) via het beveiligde WebDAV-protocol (HTTPS).'],
    detail: ['Працює через перевірене зовнішнє з’єднання HTTPS та пароль застосунку з прив’язкою IP-адреси проти підроблення запитів і переглядом тек без розкриття пароля.', 'Werkt via een geverifieerde externe HTTPS-verbinding en toepassingswachtwoord met IP-vastzetting tegen verzoekvervalsing en mappenweergave zonder wachtwoordlek.'] },
  { id: 'gmail-bijlagen', merk: 'gmail', naam: 'Gmail-вкладення', monogram: '@', site: 'https://mail.google.com', stand: 'werkt', richting: 'importeren', levend: 'google',
    uitleg: ['Вкладення з електронних листів зберігаються у хмарне сховище через розділ Пошти.', 'Bijlagen uit e-mailberichten bewaart u in de cloudopslag via de postpagina.'],
    detail: ['Працює безпосередньо з вікна читання листа (вкладення → зберегти у сховище); окремого масового перенесення тут немає.', 'Werkt rechtstreeks vanuit het leesvenster van een bericht (bijlage → in opslag bewaren); een aparte bulkimport bestaat hier niet.'] },
]);
export const cloudVnextAanbieder = (id: unknown) => CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === id);
export const CLOUD_STAND_LABEL: Record<CloudAanbiederStand, Tweetalig> = Object.freeze({
  werkt: ['працює', 'werkt'], webdav: ['підключення WebDAV (HTTPS)', 'WebDAV-koppeling (HTTPS)'],
  'sleutels-nodig': ['потрібні ключі власника', 'sleutels van de eigenaar nodig'],
  gepland: ['заплановано', 'gepland'], 'niet-mogelijk': ['неможливо з вебу', 'niet mogelijk vanaf het web'],
});
export const CLOUD_RICHTING_LABEL: Record<CloudRichting, Tweetalig> = Object.freeze({
  lezen: ['лише читання', 'alleen lezen'], 'lezen-en-schrijven': ['читання й запис', 'lezen en schrijven'],
  importeren: ['імпорт за вибором', 'import op keuze'], geen: ['ще нічого', 'nog niets'],
});

export const cloudTekst = (p: Tweetalig, lang: 'uk' | 'nl') => (lang === 'uk' ? p[0] : p[1]);
