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
  pdf: 'application/pdf', json: 'application/json', xml: 'application/xml', md: 'text/markdown',
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
  if (ONVEILIG_BROWSER_MIME.test(m)) {
    return ['exe', 'dll', 'msi', 'com', 'bin'].includes(ext) ? 'application/octet-stream' : 'text/plain';
  }
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

// ------------------------------------------------------------------------------- integratiecatalogus (eerlijk, 29.10.2026)
// stand:
//   'werkt'            vandaag in production te koppelen én te gebruiken; `levend` zegt welke servercontrole dat bevestigt.
//   'sleutels-nodig'   de code (OAuth + lijst/preview) staat in het repo, maar de EIGENAAR moet eerst app-sleutels aanmaken en
//                      als omgeving zetten (`vereist` noemt ze) en de staging-vlag aanzetten; daarna werkt het echt.
//   'gepland'          er is hoogstens transport-/lijstcode zonder onboarding of routes — niet te koppelen, knop bestaat niet.
//   'niet-mogelijk'    de aanbieder heeft geen publieke web-API (of versleutelt aan de clientzijde): een site KAN dit niet,
//                      en dat staat op de kaart, met de eerlijke omweg erbij.
export type CloudAanbiederStand = 'werkt' | 'sleutels-nodig' | 'gepland' | 'niet-mogelijk';
export type CloudRichting = 'lezen' | 'lezen-en-schrijven' | 'importeren' | 'geen';
export type CloudLevend = 'google' | 'm4' | 'photos';
export type CloudVnextAanbieder = {
  id: string; naam: string; monogram: string; site: string;
  stand: CloudAanbiederStand; richting: CloudRichting;
  uitleg: Tweetalig;
  /** Wat er vandaag ECHT werkt zodra gekoppeld (of waarom niet). Verplicht. */
  detail: Tweetalig;
  /** Alleen bij 'sleutels-nodig': de omgevingsvariabelen/vlaggen die de eigenaar moet zetten. */
  vereist?: readonly string[];
  /** Alleen bij 'niet-mogelijk' of 'gepland': de eerlijke omweg die vandaag al kan. */
  omweg?: Tweetalig;
  levend?: CloudLevend;
};
export const CLOUD_VNEXT_AANBIEDERS: readonly CloudVnextAanbieder[] = Object.freeze([
  { id: 'google-drive', naam: 'Google Drive', monogram: 'G', site: 'https://drive.google.com', stand: 'werkt', richting: 'lezen-en-schrijven', levend: 'google',
    uitleg: ['Повне підключення через Google-доступ: перегляд тек, пошук, завантаження, перейменування, переміщення, кошик, зірочки; кілька акаунтів.', 'Volledige koppeling via Google-toegang: mappen, zoeken, uploaden, hernoemen, verplaatsen, prullenbak, sterren; meerdere accounts.'],
    detail: ['Межі сьогодні: завантаження на Drive до 5 МБ за раз, прев’ю до 32 МБ (відео 128 МБ), спільні диски не показуються.', 'Grenzen vandaag: upload naar Drive tot 5 MB per keer, preview tot 32 MB (video 128 MB), gedeelde schijven worden niet getoond.'] },
  { id: 'google-photos', naam: 'Google Photos', monogram: 'GP', site: 'https://photos.google.com', stand: 'werkt', richting: 'importeren', levend: 'photos',
    uitleg: ['Офіційний Picker: ви обираєте фото у вікні Google, до 10 за раз зберігаються у вашу хмару.', 'De officiële Picker: u kiest foto’s in het Google-venster; tot 10 per keer worden in uw cloud bewaard.'],
    detail: ['Лише імпорт за вашим вибором — Google не дає сайтам читати всю бібліотеку.', 'Alleen import op uw keuze — Google laat sites niet de hele bibliotheek lezen.'] },
  { id: 'onedrive', naam: 'Microsoft OneDrive', monogram: '1D', site: 'https://onedrive.live.com', stand: 'sleutels-nodig', richting: 'lezen', levend: 'm4',
    uitleg: ['OAuth, список тек і безпечне прев’ю вже в коді (особистий і робочий OneDrive).', 'OAuth, mappenlijst en veilige preview staan al in de code (persoonlijke én werk-OneDrive).'],
    detail: ['Щоб увімкнути: зареєструйте застосунок у Microsoft Entra і задайте CLOUD_MICROSOFT_CLIENT_ID/SECRET + CLOUD_M4_CONNECTIONS_STAGING; поки що лише читання+прев’ю, запис/синхронізація — наступний крок.', 'Aanzetten: registreer een app in Microsoft Entra en zet CLOUD_MICROSOFT_CLIENT_ID/SECRET + CLOUD_M4_CONNECTIONS_STAGING; voorlopig lezen+preview, schrijven/synchronisatie is de volgende stap.'],
    vereist: ['CLOUD_MICROSOFT_CLIENT_ID', 'CLOUD_MICROSOFT_CLIENT_SECRET', 'CLOUD_M4_CONNECTIONS_STAGING', 'CLOUD_M10_STAGING_RUNTIME', 'CLOUD_M8_DIRECTORY_STAGING'] },
  { id: 'dropbox', naam: 'Dropbox', monogram: 'Dx', site: 'https://www.dropbox.com', stand: 'sleutels-nodig', richting: 'lezen', levend: 'm4',
    uitleg: ['OAuth (PKCE), список тек і прев’ю в коді; чанкові завантаження підготовлені.', 'OAuth (PKCE), mappenlijst en preview in de code; upload in stukken is voorbereid.'],
    detail: ['Щоб увімкнути: створіть застосунок у Dropbox App Console і задайте CLOUD_DROPBOX_CLIENT_ID/SECRET + ті самі staging-прапорці.', 'Aanzetten: maak een app in de Dropbox App Console en zet CLOUD_DROPBOX_CLIENT_ID/SECRET + dezelfde staging-vlaggen.'],
    vereist: ['CLOUD_DROPBOX_CLIENT_ID', 'CLOUD_DROPBOX_CLIENT_SECRET', 'CLOUD_M4_CONNECTIONS_STAGING', 'CLOUD_M10_STAGING_RUNTIME', 'CLOUD_M8_DIRECTORY_STAGING'] },
  { id: 'box', naam: 'Box', monogram: 'Bx', site: 'https://www.box.com', stand: 'sleutels-nodig', richting: 'lezen', levend: 'm4',
    uitleg: ['OAuth, список і прев’ю в коді (Box API).', 'OAuth, lijst en preview in de code (Box API).'],
    detail: ['Щоб увімкнути: застосунок у Box Developer Console і CLOUD_BOX_CLIENT_ID/SECRET + staging-прапорці.', 'Aanzetten: een app in de Box Developer Console en CLOUD_BOX_CLIENT_ID/SECRET + staging-vlaggen.'],
    vereist: ['CLOUD_BOX_CLIENT_ID', 'CLOUD_BOX_CLIENT_SECRET', 'CLOUD_M4_CONNECTIONS_STAGING', 'CLOUD_M10_STAGING_RUNTIME', 'CLOUD_M8_DIRECTORY_STAGING'] },
  { id: 'icloud-drive', naam: 'iCloud Drive', monogram: 'iC', site: 'https://www.icloud.com/iclouddrive', stand: 'niet-mogelijk', richting: 'geen',
    uitleg: ['Файли iCloud Drive з вебсайту недоступні.', 'iCloud Drive-bestanden zijn vanaf een website niet bereikbaar.'],
    detail: ['Apple не має публічного API для iCloud Drive (CloudKit працює лише всередині застосунків розробника). Жоден сайт не може чесно «підключити iCloud Drive».', 'Apple heeft geen publieke API voor iCloud Drive (CloudKit werkt alleen binnen de apps van de ontwikkelaar). Geen enkele site kan iCloud Drive eerlijk «koppelen».'],
    omweg: ['Обхід: на iPhone/iPad поділіться файлом у цю хмару (Завантажити тут) або тримайте файли в теці, яку синхронізує інший сервіс. Календар iCloud — підключається (див. Агенду).', 'Omweg: deel op iPhone/iPad het bestand naar deze cloud (hier uploaden) of bewaar bestanden in een map die een andere dienst synchroniseert. De iCloud-agenda koppelt wél (zie Agenda).'] },
  { id: 'mega', naam: 'MEGA', monogram: 'M', site: 'https://mega.io', stand: 'gepland', richting: 'geen',
    uitleg: ['Сховище з наскрізним шифруванням.', 'Opslag met end-to-end-versleuteling.'],
    detail: ['Адаптера в коді немає: у MEGA власний протокол шифрування на боці клієнта; чесна інтеграція вимагає окремого клієнта, якого ще не збудовано.', 'Er is geen adapter in de code: MEGA versleutelt met een eigen protocol aan de clientzijde; een eerlijke integratie vraagt een aparte cliënt die nog niet gebouwd is.'],
    omweg: ['Обхід: експортуйте потрібні файли з MEGA і завантажте сюди.', 'Omweg: exporteer de bestanden uit MEGA en upload ze hier.'] },
  { id: 'nextcloud', naam: 'Nextcloud', monogram: 'N', site: 'https://nextcloud.com', stand: 'gepland', richting: 'geen',
    uitleg: ['Self-hosted сховище з відкритим WebDAV.', 'Self-hosted opslag met open WebDAV.'],
    detail: ['У коді вже є читання списків через WebDAV PROPFIND (модуль M9), але немає підключення акаунта (адреса+пароль застосунку), маршрутів і UI — тому чесно «заплановано», без кнопки.', 'De code leest al lijsten via WebDAV PROPFIND (module M9), maar er is geen accountkoppeling (adres+app-wachtwoord), geen routes en geen UI — dus eerlijk «gepland», zonder knop.'],
    omweg: ['Обхід: синхронізуйте теку Nextcloud на ПК і завантажуйте звідти.', 'Omweg: synchroniseer de Nextcloud-map op de pc en upload van daaruit.'] },
  { id: 'pcloud', naam: 'pCloud', monogram: 'P', site: 'https://www.pcloud.com', stand: 'gepland', richting: 'geen',
    uitleg: ['Європейське сховище з OAuth API.', 'Europese opslag met een OAuth-API.'],
    detail: ['Транспорт і OAuth-ескіз є в модулі M5, але без онбордингу, маршрутів і сховища токенів — «заплановано».', 'Transport en een OAuth-schets staan in module M5, maar zonder onboarding, routes en tokenopslag — «gepland».'] },
  { id: 'proton-drive', naam: 'Proton Drive', monogram: 'Pr', site: 'https://proton.me/drive', stand: 'niet-mogelijk', richting: 'geen',
    uitleg: ['Сховище з наскрізним шифруванням від Proton.', 'End-to-end-versleutelde opslag van Proton.'],
    detail: ['Proton не має публічного API для Drive: файли зашифровані на боці клієнта, сторонній сайт їх прочитати не може. Будь-яка кнопка «підключити Proton Drive» була б обманом.', 'Proton heeft geen publieke API voor Drive: bestanden zijn aan de clientzijde versleuteld; een site kan ze niet lezen. Elke knop «Proton Drive koppelen» zou bedrog zijn.'],
    omweg: ['Обхід: завантажте файл з Proton і додайте сюди вручну.', 'Omweg: download het bestand uit Proton en voeg het hier handmatig toe.'] },
  { id: 'nas-webdav', naam: 'NAS / WebDAV / SFTP', monogram: 'NAS', site: 'https://www.synology.com/en-global/dsm/feature/webdav', stand: 'gepland', richting: 'geen',
    uitleg: ['Власний NAS (Synology, QNAP, TrueNAS…) через WebDAV або SFTP.', 'Een eigen NAS (Synology, QNAP, TrueNAS…) via WebDAV of SFTP.'],
    detail: ['Той самий WebDAV-рушій, що для Nextcloud (M9), покриє NAS; SFTP-клієнта немає. Онбордингу й маршрутів ще немає — «заплановано». Порти NAS в інтернет не відкриваємо: лише вихідне з’єднання з сервера в LAN/VPN.', 'Dezelfde WebDAV-motor als voor Nextcloud (M9) dekt een NAS; een SFTP-cliënt is er niet. Onboarding en routes ontbreken nog — «gepland». NAS-poorten gaan niet open naar internet: alleen een uitgaande verbinding vanaf de server in LAN/VPN.'] },
  { id: 'gmail-bijlagen', naam: 'Gmail-вкладення', monogram: '@', site: 'https://mail.google.com', stand: 'werkt', richting: 'importeren', levend: 'google',
    uitleg: ['Вкладення з Пошти зберігаються у хмару через сторінку Пошти.', 'Bijlagen uit E-mail bewaart u in de cloud via de mailpagina.'],
    detail: ['Працює з боку Пошти (вікно листа → вкладення → зберегти); окремого масового імпорту тут ще немає.', 'Werkt vanaf de mailkant (bericht → bijlage → bewaren); een aparte massa-import bestaat hier nog niet.'] },
]);
export const cloudVnextAanbieder = (id: unknown) => CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === id);
export const CLOUD_STAND_LABEL: Record<CloudAanbiederStand, Tweetalig> = Object.freeze({
  werkt: ['працює', 'werkt'], 'sleutels-nodig': ['потрібні ключі власника', 'sleutels van de eigenaar nodig'],
  gepland: ['заплановано', 'gepland'], 'niet-mogelijk': ['неможливо з вебу', 'niet mogelijk vanaf het web'],
});
export const CLOUD_RICHTING_LABEL: Record<CloudRichting, Tweetalig> = Object.freeze({
  lezen: ['лише читання', 'alleen lezen'], 'lezen-en-schrijven': ['читання й запис', 'lezen en schrijven'],
  importeren: ['імпорт за вибором', 'import op keuze'], geen: ['ще нічого', 'nog niets'],
});

export const cloudTekst = (p: Tweetalig, lang: 'uk' | 'nl') => (lang === 'uk' ? p[0] : p[1]);
