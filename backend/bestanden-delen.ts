// Gedeelde koppelingen voor Cloud vNext (CLOUD-001, migratie 0210):
//   • delen van mappen (volledige boom of gekozen selectie), losse bestanden, archief-onderdelen én exacte bestandsdelen
//     (regelbereik voor tekst/code, paginabereik voor PDF via pdf-lib, of bytebereik via positionele opslag);
//   • twee deelmodi: open koppeling (`link`, optioneel met scrypt-wachtwoord) of geregistreerde accounts (`accounts`);
//   • eigen naam en notitie per koppeling, starttijd (`actief_vanaf`), vervaltijd (`verloopt_op`), limieten op weergaven en
//     downloads, pauzeren, onmiddellijk intrekken en gedetailleerde statistiek per koppeling en per dag.
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { db, envKey32, error, json, openWithEnvKey, rateLimit, sealWithEnvKey } from '../server/platform';
import { alsSysteem, gebruikerVanContext, huidigeContext, isAlleenLezen } from '../server/platform/context';
import { appRolActief, getPool } from '../server/platform/pg';
import type { LambdaEvent, RouterMiddleware } from '../server/platform/router';
import { denyMutation } from './rbac';
import { limietSleutel } from '../shared/ip-limiet';
import { ladeOf } from './ruimte-cloud-agenda';
import type { Lade } from '../shared/ruimte-scheiding';
import { jsonbTekst } from '../shared/tekst-veilig';
import {
  cloudSoort, schoneNaam, veiligUploadMime,
  type CloudArchiefIngang, type CloudBestand, type CloudDeelBereik, type CloudDeelDagStat,
  type CloudDeelDoelSoort, type CloudDeelGebeurtenis, type CloudDeelKoppeling, type CloudDeelModus,
  type CloudDeelOntvanger, type CloudDeelRechten, type CloudDeelStatus, type CloudGedeeldMetMij, type CloudMap,
} from '../shared/cloud-vnext-model';
import { leesArchiefUitBuffer, leesLadeBestandVoorDelen, leesLadeInventarisVoorDelen } from './cloud-vnext-bestanden';

// ------------------------------------------------------------------------------------------------ hulpfuncties & DB-laag
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const idOfNull = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 200 ? v.trim() : null);
// SEC-002 (slot s, eind-omzeiling 7): het id van een KOPPELING is een uuid-kolom — een ander id gaf «invalid input syntax for type uuid»
// en dus 500 (die de zekering voedt). Nu vóór de SQL: KOPPELING_ONBEKEND (404). / Ідентифікатор посилання — uuid; інше — 404, не 500.
const KOPPELING_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const koppelingIdOfNull = (v: unknown): string | null => { const id = idOfNull(v); return id && KOPPELING_ID_RE.test(id) ? id : null; };
const sha256Hex = (waarde: string | Buffer): string => createHash('sha256').update(waarde).digest('hex');
const fout = (code: string): never => { throw new Error(code); };
const KOPPELING_CODE_RE = /^[A-Za-z0-9_-]{16,96}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_BUNDEL_MAX = 48 * 1024 * 1024;
const TEKST_DEEL_MAX = 4 * 1024 * 1024;
const PDF_DEEL_MAX = 32 * 1024 * 1024;

type DbRij = Record<string, any>;

async function deelSql(
  sql: string,
  params: unknown[] = [],
  opties: { lezen?: boolean; alsSysteem?: boolean } = {},
): Promise<{ rows: DbRij[]; rowCount: number | null }> {
  if (!opties.lezen && isAlleenLezen()) fout('IMPERSONATIE_ALLEEN_LEZEN');
  const gebruiker = opties.alsSysteem ? null : gebruikerVanContext();
  if (!gebruiker || !appRolActief()) {
    return getPool('systeem').query(sql, params);
  }
  const client = await getPool('app').connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.service', $2, true), set_config('app.route', $3, true)",
      [gebruiker.userId, gebruiker.service, String(huidigeContext()?.route || '').slice(0, 200)],
    );
    const ctx = huidigeContext();
    if (ctx?.alleenLezen) await client.query('SET LOCAL transaction_read_only = on');
    if (ctx?.ruimte) await client.query("SELECT set_config('app.ruimte', $1, true)", [ctx.ruimte]);
    const res = await client.query(sql, params);
    await client.query('COMMIT');
    return res;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------------------------------------ versleuteling & wachtwoorden
function lokaalTestSleutel(): Buffer {
  return createHash('sha256').update(`mijn-ruimte-cloud-delen-lokaal:${process.env.SESSION_PEPPER || 'ontwikkel'}`).digest();
}

function zegelCode(code: string, userId: string): string {
  const aad = `cloud-deel:${userId}`;
  if (envKey32('TOTP_ENCRYPTION_KEY_V1')) {
    return sealWithEnvKey('TOTP_ENCRYPTION_KEY_V1', code, aad);
  }
  if (process.env.NODE_ENV === 'production') fout('SLEUTEL_ONTBREEKT');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', lokaalTestSleutel(), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const enc = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `lok1.${iv.toString('base64url')}.${enc.toString('base64url')}.${tag.toString('base64url')}`;
}

function openCode(zegel: string, userId: string): string {
  const aad = `cloud-deel:${userId}`;
  if (zegel.startsWith('lok1.')) {
    if (process.env.NODE_ENV === 'production') return '';
    const [, ivB64, encB64, tagB64] = zegel.split('.');
    if (!ivB64 || !encB64 || !tagB64) return '';
    try {
      const decipher = createDecipheriv('aes-256-gcm', lokaalTestSleutel(), Buffer.from(ivB64, 'base64url'));
      decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(encB64, 'base64url')), decipher.final()]).toString('utf8');
    } catch { return ''; }
  }
  try {
    return openWithEnvKey('TOTP_ENCRYPTION_KEY_V1', zegel, aad) || '';
  } catch { return ''; }
}

function maakWachtwoordHash(wachtwoord: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(wachtwoord, salt, 32);
  return `scrypt1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function controleerWachtwoord(opgeslagen: string | null | undefined, kandidaat: string): boolean {
  const tekst = str(opgeslagen);
  if (!tekst) return true;
  if (!kandidaat || kandidaat.length > 200) return false;
  const [versie, saltHex, hashHex] = tekst.split('$');
  if (versie !== 'scrypt1' || !saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const verwacht = Buffer.from(hashHex, 'hex');
    const berekend = scryptSync(kandidaat, salt, verwacht.length);
    return berekend.length === verwacht.length && timingSafeEqual(berekend, verwacht);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------------------------------------ URL, apparaat & status
function kopWaarde(event: Record<string, unknown>, naam: string): string {
  const headers = (event?.headers && typeof event.headers === 'object' ? event.headers : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === naam) return String(v ?? '').trim();
  }
  return '';
}

function maakDeelUrl(event: Record<string, unknown>, code: string): string {
  const rauweHost = (kopWaarde(event, 'x-forwarded-host') || kopWaarde(event, 'host')).split(',')[0].trim();
  const proto = (kopWaarde(event, 'x-forwarded-proto').split(',')[0].trim() || (rauweHost.startsWith('localhost') || rauweHost.startsWith('127.') ? 'http' : 'https'));
  const pad = `/gedeeld/${encodeURIComponent(code)}`;
  if (!rauweHost) return `https://cloud.tarasevych.com${pad}`;
  const zonderPoort = rauweHost.replace(/:\d+$/, '').toLowerCase();
  if (zonderPoort === 'tarasevych.com' || zonderPoort.endsWith('.tarasevych.com')) {
    return `https://cloud.tarasevych.com${pad}`;
  }
  return `${proto}://${rauweHost}${pad}`;
}

function ipUitEvent(event: Record<string, unknown>): string {
  const xff = kopWaarde(event, 'x-forwarded-for');
  if (xff) return xff.split(',')[0].trim().slice(0, 80);
  const realIp = kopWaarde(event, 'x-real-ip');
  if (realIp) return realIp.slice(0, 80);
  return str((event?.requestContext as Record<string, any>)?.http?.sourceIp || 'onbekend').slice(0, 80);
}

function kortApparaatLabel(uaRauw: string): string {
  const ua = String(uaRauw || '');
  if (!ua) return 'Onbekend apparaat';
  const mobiel = /Android|iPhone|iPad|Mobile/i.test(ua);
  const os = /Windows/i.test(ua) ? 'Windows'
    : /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/i.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : 'Systeem';
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Chrome\//i.test(ua) && !/Edg\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) && !/Chrome\//i.test(ua) ? 'Safari' : 'Browser';
  return `${browser} · ${os}${mobiel ? ' (mobiel)' : ''}`;
}

const isoOfNull = (waarde: unknown): string | null => {
  if (!waarde) return null;
  const d = waarde instanceof Date ? waarde : new Date(String(waarde));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

export function berekenDeelStatus(rij: DbRij, nuMs = Date.now()): CloudDeelStatus {
  if (rij.ingetrokken_op) return 'ingetrokken';
  if (rij.gepauzeerd === true) return 'gepauzeerd';
  const vanaf = rij.actief_vanaf ? new Date(rij.actief_vanaf).getTime() : null;
  if (vanaf !== null && Number.isFinite(vanaf) && vanaf > nuMs) return 'gepland';
  const tot = rij.verloopt_op ? new Date(rij.verloopt_op).getTime() : null;
  if (tot !== null && Number.isFinite(tot) && tot <= nuMs) return 'verlopen';
  const maxW = rij.max_weergaven !== null && rij.max_weergaven !== undefined ? Number(rij.max_weergaven) : null;
  if (maxW !== null && Number(rij.weergaven_aantal || 0) >= maxW) return 'limiet_bereikt';
  const maxD = rij.max_downloads !== null && rij.max_downloads !== undefined ? Number(rij.max_downloads) : null;
  if (rij.rechten === 'downloaden' && maxD !== null && maxD > 0 && Number(rij.downloads_aantal || 0) >= maxD && maxW === null) {
    // Weergave blijft mogelijk tenzij weergavelimiet bereikt is; status blijft actief zolang kijken mag.
    return 'actief';
  }
  return 'actief';
}

function naarBuitenKoppeling(rij: DbRij, event: Record<string, unknown>): CloudDeelKoppeling {
  const code = openCode(str(rij.code_zegel), str(rij.user_id));
  const bereik = (rij.bereik && typeof rij.bereik === 'object' ? rij.bereik : {}) as CloudDeelBereik;
  const ontvangers = Array.isArray(rij.ontvangers) ? (rij.ontvangers as CloudDeelOntvanger[]) : [];
  return {
    id: str(rij.id),
    code,
    url: code ? maakDeelUrl(event, code) : '',
    naam: str(rij.naam),
    notitie: str(rij.notitie),
    doelSoort: str(rij.doel_soort) as CloudDeelDoelSoort,
    doelId: str(rij.doel_id),
    doelNaam: str(rij.doel_naam),
    bereik,
    modus: (str(rij.modus) === 'accounts' ? 'accounts' : 'link') as CloudDeelModus,
    ontvangers,
    rechten: (str(rij.rechten) === 'bekijken' ? 'bekijken' : 'downloaden') as CloudDeelRechten,
    heeftWachtwoord: Boolean(str(rij.wachtwoord_hash)),
    actiefVanaf: isoOfNull(rij.actief_vanaf),
    verlooptOp: isoOfNull(rij.verloopt_op),
    maxWeergaven: rij.max_weergaven !== null && rij.max_weergaven !== undefined ? Number(rij.max_weergaven) : null,
    maxDownloads: rij.max_downloads !== null && rij.max_downloads !== undefined ? Number(rij.max_downloads) : null,
    gepauzeerd: rij.gepauzeerd === true,
    ingetrokkenOp: isoOfNull(rij.ingetrokken_op),
    status: berekenDeelStatus(rij),
    weergavenAantal: Number(rij.weergaven_aantal || 0),
    downloadsAantal: Number(rij.downloads_aantal || 0),
    uniekeBezoekers: Number(rij.unieke_bezoekers || 0),
    laatstBekekenOp: isoOfNull(rij.laatst_bekeken_op),
    aangemaaktOp: isoOfNull(rij.aangemaakt_op) || new Date().toISOString(),
    bijgewerktOp: isoOfNull(rij.bijgewerkt_op) || new Date().toISOString(),
  };
}

// ------------------------------------------------------------------------------------------------ accounts & bereik-validatie
type UserGidsRij = { email?: string; displayName?: string; name?: string; status?: string; role?: string; deletedAt?: number };

async function zoekAccountsOpEmails(emailsRauw: unknown[]): Promise<CloudDeelOntvanger[]> {
  const uniek: string[] = [];
  const gezien = new Set<string>();
  for (const r of emailsRauw.slice(0, 50)) {
    const e = String(r ?? '').trim().toLowerCase().slice(0, 200);
    if (!e) continue;
    if (!EMAIL_RE.test(e)) fout('EMAIL_ONGELDIG');
    if (!gezien.has(e)) { gezien.add(e); uniek.push(e); }
  }
  if (!uniek.length) return [];
  const nuIso = new Date().toISOString();
  const uit: CloudDeelOntvanger[] = [];
  for (const email of uniek) {
    const blad = await alsSysteem(() => db.list<UserGidsRij>('users', { filter: { email }, limit: 5 }));
    const gevonden = blad.items.find((u) => !u.deletedAt && (u.status === 'approved' || u.role === 'owner'));
    uit.push({
      email,
      ...(gevonden ? { userId: gevonden.id, naam: str(gevonden.displayName || gevonden.name) || email.split('@')[0] } : {}),
      geregistreerd: Boolean(gevonden),
      toegevoegdOp: nuIso,
    });
  }
  return uit;
}

async function eigenaarProfiel(userId: string): Promise<{ naam: string; email: string }> {
  try {
    const [u] = await alsSysteem(() => db.get<UserGidsRij>('users', [userId]));
    const email = str(u?.email);
    const naam = str(u?.displayName || u?.name) || (email ? email.split('@')[0] : 'Gebruiker');
    return { naam, email };
  } catch {
    return { naam: 'Gebruiker', email: '' };
  }
}

function nazatenVanMap(mappen: CloudMap[], wortelId: string): Set<string> {
  const uit = new Set<string>([wortelId]);
  let gegroeid = true;
  while (gegroeid) {
    gegroeid = false;
    for (const m of mappen) {
      if (m.ouderId && uit.has(m.ouderId) && !uit.has(m.id)) {
        uit.add(m.id);
        gegroeid = true;
      }
    }
  }
  return uit;
}

function isTekstBestand(b: CloudBestand): boolean {
  return b.kind === 'note' || b.soort === 'tekst' || b.soort === 'code' || b.mime.startsWith('text/') || b.mime === 'application/json' || b.mime === 'application/xml';
}

function snijdTekstRegels(volledig: string, vanRegel: number, totRegel: number): { tekst: string; totaalRegels: number; van: number; tot: number } {
  const genormaliseerd = volledig.replace(/\r\n/g, '\n');
  const regels = genormaliseerd.split('\n');
  const totaalRegels = regels.length;
  const van = Math.max(1, Math.min(vanRegel, totaalRegels));
  const tot = Math.max(van, Math.min(totRegel, totaalRegels));
  const deel = regels.slice(van - 1, tot).join('\n');
  return { tekst: deel, totaalRegels, van, tot };
}

async function snijdPdfPaginas(pdfBytes: Buffer, vanPagina: number, totPagina: number): Promise<{ bytes: Buffer; totaalPaginas: number; van: number; tot: number }> {
  let bronDoc: PDFDocument;
  try {
    bronDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  } catch {
    fout('PDF_ONLEESBAAR');
  }
  const totaalPaginas = bronDoc!.getPageCount();
  if (totaalPaginas < 1) fout('PDF_ONLEESBAAR');
  const van = Math.max(1, Math.min(vanPagina, totaalPaginas));
  const tot = Math.max(van, Math.min(totPagina, totaalPaginas));
  const nieuwDoc = await PDFDocument.create();
  const indexen: number[] = [];
  for (let p = van - 1; p <= tot - 1; p += 1) indexen.push(p);
  const gekopieerd = await nieuwDoc.copyPages(bronDoc!, indexen);
  for (const pag of gekopieerd) nieuwDoc.addPage(pag);
  const uit = await nieuwDoc.save();
  return { bytes: Buffer.from(uit), totaalPaginas, van, tot };
}

function parseerTijdstip(rauw: unknown, veldnaam: string): Date | null {
  if (rauw === null || rauw === undefined || rauw === '') return null;
  const d = new Date(String(rauw));
  if (!Number.isFinite(d.getTime())) fout(`${veldnaam}_ONGELDIG`);
  return d;
}

function parseerPositiefGeheel(rauw: unknown, max: number, foutcode: string): number | null {
  if (rauw === null || rauw === undefined || rauw === '') return null;
  const n = Number(rauw);
  if (!Number.isInteger(n) || n < 1 || n > max) fout(foutcode);
  return n;
}

async function valideerDoelEnBereik(
  lade: Lade,
  doelSoortRauw: unknown,
  doelIdRauw: unknown,
  bereikRauw: unknown,
): Promise<{ doelSoort: CloudDeelDoelSoort; doelId: string; doelNaam: string; bereik: CloudDeelBereik }> {
  const doelSoort = str(doelSoortRauw) as CloudDeelDoelSoort;
  if (!['bestand', 'map', 'selectie', 'bestand_deel', 'archief_pad'].includes(doelSoort)) fout('DOEL_ONGELDIG');
  const bIn = (bereikRauw && typeof bereikRauw === 'object' ? bereikRauw : {}) as Record<string, unknown>;
  const inventaris = await leesLadeInventarisVoorDelen(lade);
  const bestandenMap = new Map(inventaris.bestanden.map((b) => [b.id, b]));
  const mappenMap = new Map(inventaris.mappen.map((m) => [m.id, m]));

  if (doelSoort === 'bestand') {
    const id = idOfNull(doelIdRauw) || fout('BESTAND_ONBEKEND');
    const b = bestandenMap.get(id) ?? fout('BESTAND_ONBEKEND');
    return { doelSoort, doelId: b.id, doelNaam: b.naam, bereik: {} };
  }

  if (doelSoort === 'map') {
    const id = idOfNull(doelIdRauw) || fout('MAP_ONBEKEND');
    const m = mappenMap.get(id) ?? fout('MAP_ONBEKEND');
    const boomIds = nazatenVanMap(inventaris.mappen, m.id);
    const gekozenMappen = Array.isArray(bIn.mapIds)
      ? [...new Set((bIn.mapIds as unknown[]).map((x) => str(x).trim()).filter((x) => x && x !== m.id && boomIds.has(x)))].slice(0, 500)
      : [];
    const gekozenBestanden = Array.isArray(bIn.bestandIds)
      ? [...new Set((bIn.bestandIds as unknown[]).map((x) => str(x).trim()).filter((x) => {
          const item = bestandenMap.get(x);
          return Boolean(item && item.mapId && boomIds.has(item.mapId));
        }))].slice(0, 1000)
      : [];
    const bereik: CloudDeelBereik = {};
    if (gekozenMappen.length) bereik.mapIds = gekozenMappen;
    if (gekozenBestanden.length) bereik.bestandIds = gekozenBestanden;
    return { doelSoort, doelId: m.id, doelNaam: m.naam, bereik };
  }

  if (doelSoort === 'selectie') {
    const gekozenMappen = Array.isArray(bIn.mapIds)
      ? [...new Set((bIn.mapIds as unknown[]).map((x) => str(x).trim()).filter((x) => mappenMap.has(x)))].slice(0, 500)
      : [];
    const gekozenBestanden = Array.isArray(bIn.bestandIds)
      ? [...new Set((bIn.bestandIds as unknown[]).map((x) => str(x).trim()).filter((x) => bestandenMap.has(x)))].slice(0, 1000)
      : [];
    if (!gekozenMappen.length && !gekozenBestanden.length) fout('SELECTIE_LEEG');
    const eersteNaam = gekozenMappen.length
      ? mappenMap.get(gekozenMappen[0])!.naam
      : bestandenMap.get(gekozenBestanden[0])!.naam;
    const totaal = gekozenMappen.length + gekozenBestanden.length;
    const doelNaam = totaal === 1 ? eersteNaam : `${eersteNaam} (+${totaal - 1})`;
    const doelId = gekozenMappen[0] || gekozenBestanden[0];
    return { doelSoort, doelId, doelNaam, bereik: { mapIds: gekozenMappen, bestandIds: gekozenBestanden } };
  }

  if (doelSoort === 'archief_pad') {
    const id = idOfNull(doelIdRauw) || fout('BESTAND_ONBEKEND');
    const b = bestandenMap.get(id) ?? fout('BESTAND_ONBEKEND');
    const gelezen = (await leesLadeBestandVoorDelen(lade, b.id)) ?? fout('BESTAND_ONBEKEND');
    const archief = leesArchiefUitBuffer(gelezen.data, b.naam, { alleenLijst: true });
    if (!archief.ondersteund) fout(archief.reden || 'ARCHIEF_NIET_ONDERSTEUND');
    const bekendePaden = new Set(archief.ingangen.map((i) => i.pad));
    const gekozenPaden = Array.isArray(bIn.archiefPaden)
      ? [...new Set((bIn.archiefPaden as unknown[]).map((p) => str(p).trim().replace(/^\/+|\/+$/g, '')).filter((p) => bekendePaden.has(p)))].slice(0, 1000)
      : [];
    if (!gekozenPaden.length) fout('BEREIK_ONGELDIG');
    const label = gekozenPaden.length === 1 ? `${b.naam} → ${gekozenPaden[0]}` : `${b.naam} (${gekozenPaden.length})`;
    return { doelSoort, doelId: b.id, doelNaam: label.slice(0, 200), bereik: { archiefPaden: gekozenPaden } };
  }

  // doelSoort === 'bestand_deel'
  const id = idOfNull(doelIdRauw) || fout('BESTAND_ONBEKEND');
  const b = bestandenMap.get(id) ?? fout('BESTAND_ONBEKEND');
  const deelSoort = str(bIn.deelSoort);
  if (deelSoort === 'regels') {
    if (!isTekstBestand(b) || b.bytes > TEKST_DEEL_MAX) fout('DEEL_SOORT_NIET_ONDERSTEUND');
    const gelezen = (await leesLadeBestandVoorDelen(lade, b.id)) ?? fout('BESTAND_ONBEKEND');
    const regelsTotaal = Math.max(1, gelezen.data.toString('utf8').replace(/\r\n/g, '\n').split('\n').length);
    const vanRegel = Number(bIn.vanRegel);
    const totRegel = Number(bIn.totRegel);
    if (!Number.isInteger(vanRegel) || !Number.isInteger(totRegel) || vanRegel < 1 || totRegel < vanRegel || vanRegel > regelsTotaal) {
      fout('BEREIK_ONGELDIG');
    }
    const begrensdTot = Math.min(totRegel, regelsTotaal);
    return {
      doelSoort,
      doelId: b.id,
      doelNaam: `${b.naam} (${vanRegel}–${begrensdTot})`.slice(0, 200),
      bereik: { deelSoort: 'regels', vanRegel, totRegel: begrensdTot },
    };
  }
  if (deelSoort === 'paginas') {
    if (b.soort !== 'pdf' || b.bytes < 1 || b.bytes > PDF_DEEL_MAX) fout('DEEL_SOORT_NIET_ONDERSTEUND');
    const gelezen = (await leesLadeBestandVoorDelen(lade, b.id)) ?? fout('BESTAND_ONBEKEND');
    let paginasTotaal = 0;
    try {
      const doc = await PDFDocument.load(gelezen.data, { ignoreEncryption: true });
      paginasTotaal = doc.getPageCount();
    } catch { fout('PDF_ONLEESBAAR'); }
    const vanPagina = Number(bIn.vanPagina);
    const totPagina = Number(bIn.totPagina);
    if (!Number.isInteger(vanPagina) || !Number.isInteger(totPagina) || vanPagina < 1 || totPagina < vanPagina || vanPagina > paginasTotaal) {
      fout('BEREIK_ONGELDIG');
    }
    const begrensdTot = Math.min(totPagina, paginasTotaal);
    return {
      doelSoort,
      doelId: b.id,
      doelNaam: `${b.naam} (p. ${vanPagina}–${begrensdTot})`.slice(0, 200),
      bereik: { deelSoort: 'paginas', vanPagina, totPagina: begrensdTot },
    };
  }
  if (deelSoort === 'bytes') {
    if (b.bytes < 1) fout('BEREIK_ONGELDIG');
    const vanByte = Number(bIn.vanByte);
    const totByte = Number(bIn.totByte);
    if (!Number.isInteger(vanByte) || !Number.isInteger(totByte) || vanByte < 0 || totByte < vanByte || vanByte >= b.bytes) {
      fout('BEREIK_ONGELDIG');
    }
    const begrensdTot = Math.min(totByte, b.bytes - 1);
    if (begrensdTot - vanByte + 1 > PDF_DEEL_MAX) fout('TE_GROOT');
    return {
      doelSoort,
      doelId: b.id,
      doelNaam: `${b.naam} [${vanByte}..${begrensdTot} B]`.slice(0, 200),
      bereik: { deelSoort: 'bytes', vanByte, totByte: begrensdTot },
    };
  }
  return fout('BEREIK_ONGELDIG');
}

// ------------------------------------------------------------------------------------------------ toegestane boom voor ontvanger
type OntvangerBoom = {
  mappen: Array<{ id: string; naam: string; ouderId: string | null }>;
  bestanden: Array<{ id: string; naam: string; soort: string; mime: string; bytes: number; mapId: string | null; pad: string }>;
};

function bouwToegestaneBoom(
  doelSoort: CloudDeelDoelSoort,
  doelId: string,
  bereik: CloudDeelBereik,
  inventaris: { bestanden: CloudBestand[]; mappen: CloudMap[] },
): OntvangerBoom {
  const alleMappen = new Map(inventaris.mappen.map((m) => [m.id, m]));
  const toegestaneMapIds = new Set<string>();
  const toegestaneBestandIds = new Set<string>();
  let wortelMapId: string | null = null;

  if (doelSoort === 'map') {
    if (!alleMappen.has(doelId)) return { mappen: [], bestanden: [] };
    wortelMapId = doelId;
    const heleBoom = nazatenVanMap(inventaris.mappen, doelId);
    const heeftSubSelectie = Boolean((bereik.mapIds && bereik.mapIds.length) || (bereik.bestandIds && bereik.bestandIds.length));
    if (!heeftSubSelectie) {
      for (const id of heleBoom) if (id !== doelId) toegestaneMapIds.add(id);
      for (const b of inventaris.bestanden) if (b.mapId && heleBoom.has(b.mapId)) toegestaneBestandIds.add(b.id);
    } else {
      for (const mid of bereik.mapIds || []) {
        if (!heleBoom.has(mid)) continue;
        for (const sub of nazatenVanMap(inventaris.mappen, mid)) if (sub !== doelId) toegestaneMapIds.add(sub);
      }
      for (const b of inventaris.bestanden) {
        if (b.mapId && toegestaneMapIds.has(b.mapId)) toegestaneBestandIds.add(b.id);
      }
      for (const bid of bereik.bestandIds || []) {
        const b = inventaris.bestanden.find((x) => x.id === bid);
        if (b && b.mapId && heleBoom.has(b.mapId)) {
          toegestaneBestandIds.add(b.id);
          // Zorg dat tussenliggende mappen tot aan `doelId` zichtbaar zijn voor nette navigatie
          let cur: string | null = b.mapId;
          while (cur && cur !== doelId && alleMappen.has(cur)) {
            toegestaneMapIds.add(cur);
            cur = alleMappen.get(cur)!.ouderId;
          }
        }
      }
    }
  } else if (doelSoort === 'selectie') {
    for (const mid of bereik.mapIds || []) {
      if (!alleMappen.has(mid)) continue;
      for (const sub of nazatenVanMap(inventaris.mappen, mid)) toegestaneMapIds.add(sub);
    }
    for (const b of inventaris.bestanden) {
      if (b.mapId && toegestaneMapIds.has(b.mapId)) toegestaneBestandIds.add(b.id);
    }
    for (const bid of bereik.bestandIds || []) {
      if (inventaris.bestanden.some((x) => x.id === bid)) toegestaneBestandIds.add(bid);
    }
  }

  const mappenUit: Array<{ id: string; naam: string; ouderId: string | null }> = [];
  for (const id of toegestaneMapIds) {
    const m = alleMappen.get(id);
    if (!m) continue;
    const ouder = m.ouderId && m.ouderId !== wortelMapId && toegestaneMapIds.has(m.ouderId) ? m.ouderId : null;
    mappenUit.push({ id: m.id, naam: m.naam, ouderId: ouder });
  }
  mappenUit.sort((a, b) => a.naam.localeCompare(b.naam, 'uk'));

  const uitMap = new Map(mappenUit.map((m) => [m.id, m]));
  const mapPadTekst = (mapId: string | null): string => {
    const delen: string[] = [];
    const gezien = new Set<string>();
    let cur = mapId ? uitMap.get(mapId) : undefined;
    while (cur && !gezien.has(cur.id)) {
      gezien.add(cur.id);
      delen.unshift(cur.naam);
      cur = cur.ouderId ? uitMap.get(cur.ouderId) : undefined;
    }
    return delen.join('/');
  };

  const bestandenUit = inventaris.bestanden
    .filter((b) => toegestaneBestandIds.has(b.id))
    .map((b) => {
      const zichtbareMapId = b.mapId && b.mapId !== wortelMapId && uitMap.has(b.mapId) ? b.mapId : null;
      const voorPad = mapPadTekst(zichtbareMapId);
      return {
        id: b.id,
        naam: b.naam,
        soort: b.soort,
        mime: b.mime,
        bytes: b.bytes,
        mapId: zichtbareMapId,
        pad: voorPad ? `${voorPad}/${b.naam}` : b.naam,
      };
    })
    .sort((a, b) => a.pad.localeCompare(b.pad, 'uk'));

  return { mappen: mappenUit, bestanden: bestandenUit };
}

function filterArchiefIngangen(ingangen: CloudArchiefIngang[], bereik: CloudDeelBereik): CloudArchiefIngang[] {
  const paden = Array.isArray(bereik.archiefPaden) ? bereik.archiefPaden : [];
  if (!paden.length) return ingangen;
  return ingangen.filter((ing) => paden.some((p) => ing.pad === p || ing.pad.startsWith(`${p}/`)));
}

// ------------------------------------------------------------------------------------------------ gebeurtenissen loggen
async function noteerGebeurtenis(
  rij: DbRij,
  soort: CloudDeelGebeurtenis['soort'],
  event: Record<string, unknown>,
  doelPad = '',
  ontvanger?: { id?: string; email?: string } | null,
): Promise<{ nieuweBezoeker: boolean }> {
  const ip = ipUitEvent(event);
  const ua = kopWaarde(event, 'user-agent');
  const bezoekerHash = sha256Hex(`${str(rij.id)}|${ontvanger?.id || ip}|${ua.slice(0, 120)}`).slice(0, 40);
  const apparaat = kortApparaatLabel(ua).slice(0, 120);
  const email = str(ontvanger?.email).toLowerCase().slice(0, 200);
  const eigenaarUserId = str(rij.user_id);
  const ruimte = str(rij.ruimte) === 'technisch' ? 'technisch' : 'prive';
  let nieuweBezoeker = false;
  if (soort === 'weergave') {
    const eerder = await deelSql(
      `SELECT 1 FROM app.cloud_deel_gebeurtenissen WHERE koppeling_id = $1 AND soort = 'weergave' AND bezoeker_hash = $2 LIMIT 1`,
      [rij.id, bezoekerHash],
      { lezen: true, alsSysteem: true },
    );
    nieuweBezoeker = eerder.rows.length === 0;
  }
  await deelSql(
    `INSERT INTO app.cloud_deel_gebeurtenissen
       (koppeling_id, user_id, ruimte, soort, doel_pad, bezoeker_hash, ontvanger_email, apparaat)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [rij.id, eigenaarUserId, ruimte, soort, doelPad.slice(0, 400), bezoekerHash, email, apparaat],
    { alsSysteem: true },
  ).catch(() => undefined);
  return { nieuweBezoeker };
}

// ------------------------------------------------------------------------------------------------ EIGENAAR-ROUTES
type SessionOk = { user: { id: string; email?: string; displayName?: string; role?: string; status?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;

export type BestandenDelenEigenaarOpties = {
  meldOntvanger?: (recipientUserId: string, recipientEmail: string, titel: string, bericht: string, pad: string) => Promise<void>;
  /** SEC-002 (wolk-05, toets-g10d №5a): zoals de andere vNext-routes — vlag cloud-vnext uit voor deze mens → 404 CLOUD_VNEXT_UIT. */
  vlagAan?: (u: SessionOk['user']) => Promise<boolean>;
};

const bodyOf = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
const DIENSTEN = ['cloud', 'hub'] as const;
const EIGENAAR_404 = new Set(['MAP_ONBEKEND', 'BESTAND_ONBEKEND', 'KOPPELING_ONBEKEND']);
const CODE_PATROON = /^[A-Z][A-Z0-9_]{2,45}$/;

export function bestandenDelenEigenaarRoutes(
  requireSession: RequireSession,
  opties: BestandenDelenEigenaarOpties = {},
): Record<string, RouterMiddleware[]> {
  type Run = (ctx: Ctx, auth: SessionOk, lade: Lade, d: Record<string, unknown>) => Promise<Resp>;
  const route = (run: Run): RouterMiddleware[] => [(async (raw: unknown) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    if (opties.vlagAan && !(await opties.vlagAan(auth.user).catch(() => false))) return error('CLOUD_VNEXT_UIT', 404);
    try {
      return await run(ctx, auth, ladeOf(auth.user.id), bodyOf(ctx.body));
    } catch (err) {
      const code = String((err as Error)?.message || '');
      if (CODE_PATROON.test(code) && !code.startsWith('CLOUD_') && !code.startsWith('DB_')) {
        return error(code, EIGENAAR_404.has(code) ? 404 : 400);
      }
      console.error('[bestanden-delen]', code);
      return error('CLOUD_DELEN_FOUT', 500);
    }
  }) as unknown as RouterMiddleware];

  // ---------------------------------------------------------------- overzicht
  const overzicht: Run = async (ctx, auth, lade, d) => {
    const filterDoelId = idOfNull(d.doelId);
    const eigenRes = await deelSql(
      `SELECT * FROM app.cloud_deel_koppelingen WHERE user_id = $1 AND ruimte = $2 ORDER BY aangemaakt_op DESC LIMIT 500`,
      [auth.user.id, lade.ruimte],
      { lezen: true },
    );
    const alleKoppelingen = eigenRes.rows.map((r) => naarBuitenKoppeling(r, ctx.event));
    const perDoel: Record<string, { actief: number; totaal: number; weergaven: number; downloads: number }> = {};
    let actiefTotaal = 0;
    let weergavenTotaal = 0;
    let downloadsTotaal = 0;
    let uniekeBezoekersTotaal = 0;

    const telVoorDoel = (sleutel: string, k: CloudDeelKoppeling) => {
      if (!sleutel) return;
      const vak = perDoel[sleutel] ?? (perDoel[sleutel] = { actief: 0, totaal: 0, weergaven: 0, downloads: 0 });
      vak.totaal += 1;
      if (k.status === 'actief' || k.status === 'gepland') vak.actief += 1;
      vak.weergaven += k.weergavenAantal;
      vak.downloads += k.downloadsAantal;
    };

    for (const k of alleKoppelingen) {
      if (k.status === 'actief') actiefTotaal += 1;
      weergavenTotaal += k.weergavenAantal;
      downloadsTotaal += k.downloadsAantal;
      uniekeBezoekersTotaal += k.uniekeBezoekers;
      if (k.doelSoort === 'selectie') {
        for (const mid of k.bereik.mapIds || []) telVoorDoel(mid, k);
        for (const bid of k.bereik.bestandIds || []) telVoorDoel(bid, k);
      } else {
        telVoorDoel(k.doelId, k);
      }
    }

    const gefilterd = filterDoelId
      ? alleKoppelingen.filter((k) => k.doelId === filterDoelId || k.bereik.bestandIds?.includes(filterDoelId) || k.bereik.mapIds?.includes(filterDoelId))
      : alleKoppelingen;

    // Koppelingen die andere geregistreerde accounts met MIJN e-mailadres hebben gedeeld (alleen in persoonlijke ruimte)
    const mijnEmail = str(auth.user.email).trim().toLowerCase();
    const gedeeldMetMij: CloudGedeeldMetMij[] = [];
    if (mijnEmail && lade.ruimte === 'prive') {
      const metMijRes = await deelSql(
        `SELECT * FROM app.cloud_deel_koppelingen
          WHERE modus = 'accounts'
            AND user_id <> $1
            AND ingetrokken_op IS NULL
            AND NOT gepauzeerd
            AND (verloopt_op IS NULL OR verloopt_op > now())
            AND $2 = ANY(ontvanger_emails)
          ORDER BY aangemaakt_op DESC
          LIMIT 100`,
        [auth.user.id, mijnEmail],
        { lezen: true, alsSysteem: true },
      );
      const eigenaarCache = new Map<string, { naam: string; email: string }>();
      for (const r of metMijRes.rows) {
        const st = berekenDeelStatus(r);
        if (st !== 'actief' && st !== 'gepland') continue;
        const code = openCode(str(r.code_zegel), str(r.user_id));
        if (!code) continue;
        const eigId = str(r.user_id);
        let eig = eigenaarCache.get(eigId);
        if (!eig) { eig = await eigenaarProfiel(eigId); eigenaarCache.set(eigId, eig); }
        gedeeldMetMij.push({
          id: str(r.id),
          code,
          url: maakDeelUrl(ctx.event, code),
          naam: str(r.naam),
          notitie: str(r.notitie),
          doelSoort: str(r.doel_soort) as CloudDeelDoelSoort,
          doelNaam: str(r.doel_naam),
          rechten: (str(r.rechten) === 'bekijken' ? 'bekijken' : 'downloaden') as CloudDeelRechten,
          eigenaarNaam: eig.naam,
          eigenaarEmail: eig.email,
          verlooptOp: isoOfNull(r.verloopt_op),
          aangemaaktOp: isoOfNull(r.aangemaakt_op) || new Date().toISOString(),
        });
      }
    }

    return json({
      koppelingen: gefilterd,
      perDoel,
      samenvatting: {
        totaal: alleKoppelingen.length,
        actief: actiefTotaal,
        weergaven: weergavenTotaal,
        downloads: downloadsTotaal,
        uniekeBezoekers: uniekeBezoekersTotaal,
      },
      gedeeldMetMij,
    });
  };

  // ---------------------------------------------------------------- voorbereiden (inspectie voor DeelVenster)
  const voorbereiden: Run = async (_ctx, _auth, lade, d) => {
    if (Array.isArray(d.zoekAccounts)) {
      const accounts = await zoekAccountsOpEmails(d.zoekAccounts);
      return json({ accounts });
    }
    const doelSoort = str(d.doelSoort);
    const doelId = idOfNull(d.doelId);
    if (!doelId) fout('DOEL_ONGELDIG');
    const inventaris = await leesLadeInventarisVoorDelen(lade);

    if (doelSoort === 'map') {
      const wortel = inventaris.mappen.find((m) => m.id === doelId) ?? fout('MAP_ONBEKEND');
      const boomIds = nazatenVanMap(inventaris.mappen, wortel.id);
      const submappen = inventaris.mappen
        .filter((m) => m.id !== wortel.id && boomIds.has(m.id))
        .sort((a, b) => a.naam.localeCompare(b.naam, 'uk'));
      const bestanden = inventaris.bestanden
        .filter((b) => b.mapId && boomIds.has(b.mapId))
        .sort((a, b) => a.naam.localeCompare(b.naam, 'uk'));
      return json({ map: wortel, submappen, bestanden });
    }

    const bestand = inventaris.bestanden.find((b) => b.id === doelId) ?? fout('BESTAND_ONBEKEND');
    let tekstRegelsTotaal: number | null = null;
    let voorbeeldRegels: string[] = [];
    let pdfPaginasTotaal: number | null = null;
    let archiefOndersteund = false;
    let archiefIngangen: CloudArchiefIngang[] = [];

    if (isTekstBestand(bestand) && bestand.bytes <= TEKST_DEEL_MAX) {
      const gelezen = await leesLadeBestandVoorDelen(lade, bestand.id);
      if (gelezen) {
        const regels = gelezen.data.toString('utf8').replace(/\r\n/g, '\n').split('\n');
        tekstRegelsTotaal = regels.length;
        voorbeeldRegels = regels.slice(0, 300).map((r) => r.slice(0, 300));
      }
    } else if (bestand.soort === 'pdf' && bestand.bytes > 0 && bestand.bytes <= PDF_DEEL_MAX) {
      const gelezen = await leesLadeBestandVoorDelen(lade, bestand.id);
      if (gelezen) {
        try {
          const doc = await PDFDocument.load(gelezen.data, { ignoreEncryption: true });
          pdfPaginasTotaal = doc.getPageCount();
        } catch { pdfPaginasTotaal = null; }
      }
    } else if (bestand.soort === 'archief' && bestand.bytes <= 64 * 1024 * 1024) {
      const gelezen = await leesLadeBestandVoorDelen(lade, bestand.id);
      if (gelezen) {
        try {
          const uit = leesArchiefUitBuffer(gelezen.data, bestand.naam, { alleenLijst: true });
          archiefOndersteund = uit.ondersteund;
          archiefIngangen = uit.ingangen;
        } catch { archiefOndersteund = false; }
      }
    }

    return json({
      bestand,
      deelOpties: {
        totaalBytes: bestand.bytes,
        kanBytes: bestand.bytes > 0 && bestand.bytes <= PDF_DEEL_MAX,
        tekstRegelsTotaal,
        voorbeeldRegels,
        pdfPaginasTotaal,
        archiefOndersteund,
        archiefIngangen,
      },
    });
  };

  // ---------------------------------------------------------------- nieuw (nieuwe koppeling aanmaken)
  const nieuw: Run = async (ctx, auth, lade, d) => {
    const denied = denyMutation(auth.user, 'cloud.write'); if (denied) return denied;
    const gevalideerd = await valideerDoelEnBereik(lade, d.doelSoort, d.doelId, d.bereik);
    const naam = schoneNaam(d.naam) || gevalideerd.doelNaam;
    const notitie = str(d.notitie).trim().slice(0, 600);
    const modus: CloudDeelModus = str(d.modus) === 'accounts' ? 'accounts' : 'link';
    const rechten: CloudDeelRechten = str(d.rechten) === 'bekijken' ? 'bekijken' : 'downloaden';
    const rauweOntvangers = Array.isArray(d.ontvangers) ? d.ontvangers : [];
    const ontvangers = modus === 'accounts' ? await zoekAccountsOpEmails(rauweOntvangers) : [];
    if (modus === 'accounts' && ontvangers.length === 0) fout('ONTVANGERS_VEREIST');

    const wachtwoordRauw = str(d.wachtwoord);
    if (wachtwoordRauw && (wachtwoordRauw.length < 4 || wachtwoordRauw.length > 128)) fout('WACHTWOORD_ONGELDIG');
    const wachtwoordHash = wachtwoordRauw ? maakWachtwoordHash(wachtwoordRauw) : '';

    const actiefVanaf = parseerTijdstip(d.actiefVanaf, 'ACTIEF_VANAF');
    const verlooptOp = parseerTijdstip(d.verlooptOp, 'VERLOOPT_OP');
    if (actiefVanaf && verlooptOp && verlooptOp.getTime() <= actiefVanaf.getTime()) fout('TERMIJN_ONGELDIG');
    const maxWeergaven = parseerPositiefGeheel(d.maxWeergaven, 1_000_000, 'LIMIET_ONGELDIG');
    const maxDownloads = parseerPositiefGeheel(d.maxDownloads, 1_000_000, 'LIMIET_ONGELDIG');

    const telRes = await deelSql(
      `SELECT COUNT(*)::int AS n FROM app.cloud_deel_koppelingen WHERE user_id = $1 AND ingetrokken_op IS NULL`,
      [auth.user.id],
      { lezen: true },
    );
    if (Number(telRes.rows[0]?.n || 0) >= 500) fout('LIMIET_BEREIKT');

    const code = randomBytes(24).toString('base64url');
    const codeHash = sha256Hex(code);
    const codeZegel = zegelCode(code, auth.user.id);
    const ontvangerEmails = ontvangers.map((o) => o.email);

    const ins = await deelSql(
      `INSERT INTO app.cloud_deel_koppelingen (
         user_id, ruimte, code_hash, code_zegel, naam, notitie,
         doel_soort, doel_id, doel_naam, bereik, modus, ontvangers, ontvanger_emails,
         rechten, wachtwoord_hash, actief_vanaf, verloopt_op, max_weergaven, max_downloads
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::text[],$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        auth.user.id, lade.ruimte, codeHash, codeZegel, naam, notitie,
        gevalideerd.doelSoort, gevalideerd.doelId, gevalideerd.doelNaam, jsonbTekst(gevalideerd.bereik),
        modus, jsonbTekst(ontvangers), ontvangerEmails,
        rechten, wachtwoordHash, actiefVanaf, verlooptOp, maxWeergaven, maxDownloads,
      ],
    );
    const rij = ins.rows[0];
    if (!rij) throw new Error('CLOUD_DELEN_AANMAKEN_MISLUKT');
    const koppeling = naarBuitenKoppeling(rij, ctx.event);

    if (modus === 'accounts' && opties.meldOntvanger) {
      const afzender = str(auth.user.displayName || auth.user.email) || 'Mijn Ruimte';
      const pad = koppeling.url.startsWith('https://cloud.tarasevych.com/') ? koppeling.url : `/gedeeld/${encodeURIComponent(code)}`;
      for (const o of ontvangers) {
        if (!o.userId || o.userId === auth.user.id) continue;
        await opties.meldOntvanger(
          o.userId,
          o.email,
          `Спільний доступ: ${naam}`,
          `${afzender} відкрив(ла) вам доступ до «${gevalideerd.doelNaam}».`,
          pad,
        ).catch(() => undefined);
      }
    }

    return json({ koppeling });
  };

  // ---------------------------------------------------------------- bijwerken (naam, termijn, modus, rechten, pauze, wachtwoord)
  const bijwerken: Run = async (ctx, auth, lade, d) => {
    const denied = denyMutation(auth.user, 'cloud.write'); if (denied) return denied;
    const id = koppelingIdOfNull(d.id) || fout('KOPPELING_ONBEKEND');
    const bestaandRes = await deelSql(
      `SELECT * FROM app.cloud_deel_koppelingen WHERE id = $1 AND user_id = $2 AND ruimte = $3`,
      [id, auth.user.id, lade.ruimte],
      { lezen: true },
    );
    const oud = bestaandRes.rows[0] ?? fout('KOPPELING_ONBEKEND');
    if (oud.ingetrokken_op) fout('KOPPELING_REEDS_INGETROKKEN');

    const naam = d.naam !== undefined ? (schoneNaam(d.naam) || fout('NAAM_ONGELDIG')) : str(oud.naam);
    const notitie = d.notitie !== undefined ? str(d.notitie).trim().slice(0, 600) : str(oud.notitie);
    const modus: CloudDeelModus = d.modus !== undefined ? (str(d.modus) === 'accounts' ? 'accounts' : 'link') : (str(oud.modus) as CloudDeelModus);
    const rechten: CloudDeelRechten = d.rechten !== undefined ? (str(d.rechten) === 'bekijken' ? 'bekijken' : 'downloaden') : (str(oud.rechten) as CloudDeelRechten);
    const gepauzeerd = d.gepauzeerd !== undefined ? Boolean(d.gepauzeerd) : Boolean(oud.gepauzeerd);

    let ontvangers: CloudDeelOntvanger[] = Array.isArray(oud.ontvangers) ? oud.ontvangers : [];
    if (d.ontvangers !== undefined) {
      ontvangers = modus === 'accounts' ? await zoekAccountsOpEmails(Array.isArray(d.ontvangers) ? d.ontvangers : []) : [];
    } else if (modus === 'link') {
      ontvangers = [];
    }
    if (modus === 'accounts' && ontvangers.length === 0) fout('ONTVANGERS_VEREIST');

    let doelNaam = str(oud.doel_naam);
    let bereik: CloudDeelBereik = (oud.bereik && typeof oud.bereik === 'object' ? oud.bereik : {}) as CloudDeelBereik;
    if (d.bereik !== undefined) {
      const herkeurd = await valideerDoelEnBereik(lade, oud.doel_soort, oud.doel_id, d.bereik);
      doelNaam = herkeurd.doelNaam;
      bereik = herkeurd.bereik;
    }

    let wachtwoordHash: string = oud.wachtwoord_hash ? str(oud.wachtwoord_hash) : '';
    if (d.wachtwoordWissen === true) {
      wachtwoordHash = '';
    } else if (typeof d.wachtwoord === 'string' && d.wachtwoord.length > 0) {
      if (d.wachtwoord.length < 4 || d.wachtwoord.length > 128) fout('WACHTWOORD_ONGELDIG');
      wachtwoordHash = maakWachtwoordHash(d.wachtwoord);
    }

    const actiefVanaf = d.actiefVanaf !== undefined ? parseerTijdstip(d.actiefVanaf, 'ACTIEF_VANAF') : (oud.actief_vanaf ? new Date(oud.actief_vanaf) : null);
    const verlooptOp = d.verlooptOp !== undefined ? parseerTijdstip(d.verlooptOp, 'VERLOOPT_OP') : (oud.verloopt_op ? new Date(oud.verloopt_op) : null);
    if (actiefVanaf && verlooptOp && verlooptOp.getTime() <= actiefVanaf.getTime()) fout('TERMIJN_ONGELDIG');

    const maxWeergaven = d.maxWeergaven !== undefined ? parseerPositiefGeheel(d.maxWeergaven, 1_000_000, 'LIMIET_ONGELDIG') : (oud.max_weergaven ?? null);
    const maxDownloads = d.maxDownloads !== undefined ? parseerPositiefGeheel(d.maxDownloads, 1_000_000, 'LIMIET_ONGELDIG') : (oud.max_downloads ?? null);
    const ontvangerEmails = ontvangers.map((o) => o.email);

    const upd = await deelSql(
      `UPDATE app.cloud_deel_koppelingen
          SET naam = $1, notitie = $2, doel_naam = $3, bereik = $4::jsonb,
              modus = $5, ontvangers = $6::jsonb, ontvanger_emails = $7::text[],
              rechten = $8, wachtwoord_hash = $9, actief_vanaf = $10, verloopt_op = $11,
              max_weergaven = $12, max_downloads = $13, gepauzeerd = $14, bijgewerkt_op = now()
        WHERE id = $15 AND user_id = $16 AND ruimte = $17
        RETURNING *`,
      [
        naam, notitie, doelNaam, jsonbTekst(bereik),
        modus, jsonbTekst(ontvangers), ontvangerEmails,
        rechten, wachtwoordHash, actiefVanaf, verlooptOp,
        maxWeergaven, maxDownloads, gepauzeerd, id, auth.user.id, lade.ruimte,
      ],
    );
    const rij = upd.rows[0] ?? fout('KOPPELING_ONBEKEND');
    const koppeling = naarBuitenKoppeling(rij, ctx.event);

    // Meld pas toegevoegde geregistreerde ontvangers
    if (modus === 'accounts' && opties.meldOntvanger && koppeling.code) {
      const vorigeEmails = new Set(Array.isArray(oud.ontvanger_emails) ? (oud.ontvanger_emails as string[]) : []);
      const afzender = str(auth.user.displayName || auth.user.email) || 'Mijn Ruimte';
      const pad = koppeling.url.startsWith('https://cloud.tarasevych.com/') ? koppeling.url : `/gedeeld/${encodeURIComponent(koppeling.code)}`;
      for (const o of ontvangers) {
        if (!o.userId || o.userId === auth.user.id || vorigeEmails.has(o.email)) continue;
        await opties.meldOntvanger(
          o.userId,
          o.email,
          `Спільний доступ: ${naam}`,
          `${afzender} відкрив(ла) вам доступ до «${doelNaam}».`,
          pad,
        ).catch(() => undefined);
      }
    }

    return json({ koppeling });
  };

  // ---------------------------------------------------------------- intrekken / verwijderen
  const intrekken: Run = async (ctx, auth, lade, d) => {
    const denied = denyMutation(auth.user, 'cloud.write'); if (denied) return denied;
    if (d.allesVanDoel === true) {
      const doelId = idOfNull(d.doelId) || fout('DOEL_ONGELDIG');
      const res = await deelSql(
        `UPDATE app.cloud_deel_koppelingen
            SET ingetrokken_op = now(), bijgewerkt_op = now()
          WHERE user_id = $1 AND ruimte = $2 AND doel_id = $3 AND ingetrokken_op IS NULL`,
        [auth.user.id, lade.ruimte, doelId],
      );
      return json({ ok: true, ingetrokkenAantal: Number(res.rowCount || 0) });
    }
    const id = koppelingIdOfNull(d.id) || fout('KOPPELING_ONBEKEND');
    if (d.verwijder === true) {
      const del = await deelSql(
        `DELETE FROM app.cloud_deel_koppelingen WHERE id = $1 AND user_id = $2 AND ruimte = $3`,
        [id, auth.user.id, lade.ruimte],
      );
      if (!del.rowCount) fout('KOPPELING_ONBEKEND');
      return json({ ok: true, verwijderd: true });
    }
    const upd = await deelSql(
      `UPDATE app.cloud_deel_koppelingen
          SET ingetrokken_op = COALESCE(ingetrokken_op, now()), bijgewerkt_op = now()
        WHERE id = $1 AND user_id = $2 AND ruimte = $3
        RETURNING *`,
      [id, auth.user.id, lade.ruimte],
    );
    const rij = upd.rows[0] ?? fout('KOPPELING_ONBEKEND');
    return json({ ok: true, koppeling: naarBuitenKoppeling(rij, ctx.event) });
  };

  // ---------------------------------------------------------------- statistiek (per dag + recente gebeurtenissen)
  const statistiek: Run = async (ctx, auth, lade, d) => {
    const id = koppelingIdOfNull(d.id) || fout('KOPPELING_ONBEKEND');
    const kopRes = await deelSql(
      `SELECT * FROM app.cloud_deel_koppelingen WHERE id = $1 AND user_id = $2 AND ruimte = $3`,
      [id, auth.user.id, lade.ruimte],
      { lezen: true },
    );
    const rij = kopRes.rows[0] ?? fout('KOPPELING_ONBEKEND');
    const [dagenRes, gebRes] = await Promise.all([
      deelSql(
        `SELECT to_char(aangemaakt_op AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS dag,
                COUNT(*) FILTER (WHERE soort = 'weergave')::int AS weergaven,
                COUNT(*) FILTER (WHERE soort IN ('download', 'map_archief'))::int AS downloads
           FROM app.cloud_deel_gebeurtenissen
          WHERE koppeling_id = $1
            AND user_id = $2
            AND ruimte = $3
            AND aangemaakt_op >= now() - interval '14 days'
          GROUP BY 1
          ORDER BY 1 ASC`,
        [id, auth.user.id, lade.ruimte],
        { lezen: true },
      ),
      deelSql(
        `SELECT id, soort, doel_pad, ontvanger_email, apparaat, aangemaakt_op
           FROM app.cloud_deel_gebeurtenissen
          WHERE koppeling_id = $1 AND user_id = $2 AND ruimte = $3
          ORDER BY aangemaakt_op DESC
          LIMIT 100`,
        [id, auth.user.id, lade.ruimte],
        { lezen: true },
      ),
    ]);

    const dagKaart = new Map<string, { weergaven: number; downloads: number }>();
    for (const dr of dagenRes.rows) {
      dagKaart.set(str(dr.dag), { weergaven: Number(dr.weergaven || 0), downloads: Number(dr.downloads || 0) });
    }
    const perDag: CloudDeelDagStat[] = [];
    const vandaag = new Date();
    vandaag.setUTCHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i -= 1) {
      const dt = new Date(vandaag.getTime() - i * 86_400_000);
      const sleutel = dt.toISOString().slice(0, 10);
      const waardes = dagKaart.get(sleutel) || { weergaven: 0, downloads: 0 };
      perDag.push({ dag: sleutel, weergaven: waardes.weergaven, downloads: waardes.downloads });
    }

    const gebeurtenissen: CloudDeelGebeurtenis[] = gebRes.rows.map((g) => ({
      id: Number(g.id),
      soort: str(g.soort) as CloudDeelGebeurtenis['soort'],
      doelPad: str(g.doel_pad),
      ontvangerEmail: str(g.ontvanger_email),
      apparaat: str(g.apparaat),
      aangemaaktOp: isoOfNull(g.aangemaakt_op) || new Date().toISOString(),
    }));

    return json({ koppeling: naarBuitenKoppeling(rij, ctx.event), perDag, gebeurtenissen });
  };

  return {
    'POST /api/owner/cloud/vnext/delen/overzicht': route(overzicht),
    'POST /api/owner/cloud/vnext/delen/voorbereiden': route(voorbereiden),
    'POST /api/owner/cloud/vnext/delen/nieuw': route(nieuw),
    'POST /api/owner/cloud/vnext/delen/bijwerken': route(bijwerken),
    'POST /api/owner/cloud/vnext/delen/intrekken': route(intrekken),
    'POST /api/owner/cloud/vnext/delen/statistiek': route(statistiek),
  };
}

// ------------------------------------------------------------------------------------------------ PUBLIEKE ROUTES (/api/cloud/gedeeld/*)
export type OptioneleSessieGebruiker = { id: string; email: string; displayName?: string };
export type LeesOptioneleSessie = (event: LambdaEvent, body: unknown) => Promise<OptioneleSessieGebruiker | null>;

type ToegangControleUit =
  | { ok: true; rij: DbRij; sessie: OptioneleSessieGebruiker | null; eigenaarLade: Lade }
  | { ok: false; antwoord: Resp };

async function controleerPubliekeKoppeling(
  event: LambdaEvent,
  body: Record<string, unknown>,
  leesOptioneleSessie: LeesOptioneleSessie,
  opties: { telWeergave?: boolean; eisDownload?: boolean } = {},
): Promise<ToegangControleUit> {
  const ip = ipUitEvent(event as unknown as Record<string, unknown>);
  // SEC-002 (http-rand-05 / g10h-toets-1): bij IPv6 telt het /64-net (shared/ip-limiet.ts), anders gaf elk adres uit het eigen net
  // van de aanvaller verse 10 wachtwoordpogingen per 5 minuten (beide emmers hieronder). IPv4: ongewijzigd.
  const ipBucket = sha256Hex(limietSleutel(ip)).slice(0, 24);
  const algemeneLimiet = await rateLimit(`cloud-gedeeld:${ipBucket}`, 120, 60);
  if (!algemeneLimiet.ok) return { ok: false, antwoord: error('RATE_LIMITED', 429) };

  const code = str(body.code).trim();
  if (!KOPPELING_CODE_RE.test(code)) return { ok: false, antwoord: error('KOPPELING_CODE_VEREIST', 400) };

  const codeHash = sha256Hex(code);
  const res = await deelSql(
    `SELECT * FROM app.cloud_deel_koppelingen WHERE code_hash = $1 LIMIT 1`,
    [codeHash],
    { lezen: true, alsSysteem: true },
  );
  const rij = res.rows[0];
  if (!rij) return { ok: false, antwoord: error('KOPPELING_NIET_GEVONDEN', 404) };

  const nu = Date.now();
  if (rij.ingetrokken_op) return { ok: false, antwoord: error('KOPPELING_INGETROKKEN', 410) };
  if (rij.gepauzeerd === true) return { ok: false, antwoord: error('KOPPELING_GEPAUZEERD', 403) };

  const vanafMs = rij.actief_vanaf ? new Date(rij.actief_vanaf).getTime() : null;
  if (vanafMs !== null && Number.isFinite(vanafMs) && vanafMs > nu) {
    return { ok: false, antwoord: json({ error: 'KOPPELING_NOG_NIET_ACTIEF', actiefVanaf: isoOfNull(rij.actief_vanaf), naam: str(rij.naam) }, 403) };
  }
  const totMs = rij.verloopt_op ? new Date(rij.verloopt_op).getTime() : null;
  if (totMs !== null && Number.isFinite(totMs) && totMs <= nu) {
    return { ok: false, antwoord: error('KOPPELING_VERLOPEN', 410) };
  }

  const sessie = await leesOptioneleSessie(event, body).catch(() => null);
  const evObj = event as unknown as Record<string, unknown>;

  if (str(rij.modus) === 'accounts') {
    if (!sessie?.email) {
      return { ok: false, antwoord: json({ error: 'ACCOUNT_VEREIST', naam: str(rij.naam), modus: 'accounts' }, 401) };
    }
    const sessieEmail = sessie.email.trim().toLowerCase();
    const toegestaneEmails = Array.isArray(rij.ontvanger_emails) ? (rij.ontvanger_emails as string[]).map((e) => String(e).toLowerCase()) : [];
    if (sessie.id !== str(rij.user_id) && !toegestaneEmails.includes(sessieEmail)) {
      await noteerGebeurtenis(rij, 'geweigerd', evObj, 'account', sessie);
      return { ok: false, antwoord: json({ error: 'ACCOUNT_GEWEIGERD', aangemeldEmail: sessieEmail }, 403) };
    }
  }

  if (str(rij.wachtwoord_hash)) {
    const kandidaat = str(body.wachtwoord);
    if (!kandidaat) {
      return { ok: false, antwoord: json({ error: 'WACHTWOORD_VEREIST', naam: str(rij.naam) }, 401) };
    }
    const wwLimiet = await rateLimit(`cloud-gedeeld-ww:${ipBucket}:${str(rij.id)}`, 10, 300, { failClosed: true });
    if (!wwLimiet.ok) return { ok: false, antwoord: error('RATE_LIMITED', 429) };
    if (!controleerWachtwoord(str(rij.wachtwoord_hash), kandidaat)) {
      await noteerGebeurtenis(rij, 'geweigerd', evObj, 'wachtwoord', sessie);
      return { ok: false, antwoord: error('WACHTWOORD_ONJUIST', 403) };
    }
  }

  const maxW = rij.max_weergaven !== null && rij.max_weergaven !== undefined ? Number(rij.max_weergaven) : null;
  if (opties.telWeergave) {
    if (maxW !== null && Number(rij.weergaven_aantal || 0) >= maxW) {
      return { ok: false, antwoord: error('LIMIET_WEERGAVEN_BEREIKT', 410) };
    }
    const { nieuweBezoeker } = await noteerGebeurtenis(rij, 'weergave', evObj, str(rij.doel_naam), sessie);
    const geteld = await deelSql(
      `UPDATE app.cloud_deel_koppelingen
          SET weergaven_aantal = weergaven_aantal + 1,
              unieke_bezoekers = unieke_bezoekers + $2,
              laatst_bekeken_op = now(),
              bijgewerkt_op = now()
        WHERE id = $1
          AND ingetrokken_op IS NULL
          AND NOT gepauzeerd
          AND (max_weergaven IS NULL OR weergaven_aantal < max_weergaven)
        RETURNING *`,
      [rij.id, nieuweBezoeker ? 1 : 0],
      { alsSysteem: true },
    );
    if (!geteld.rows[0]) return { ok: false, antwoord: error('LIMIET_WEERGAVEN_BEREIKT', 410) };
    Object.assign(rij, geteld.rows[0]);
  } else if (maxW !== null && Number(rij.weergaven_aantal || 0) > maxW) {
    return { ok: false, antwoord: error('LIMIET_WEERGAVEN_BEREIKT', 410) };
  }

  if (opties.eisDownload) {
    if (str(rij.rechten) !== 'downloaden') {
      return { ok: false, antwoord: error('DOWNLOAD_NIET_TOEGESTAAN', 403) };
    }
    const maxD = rij.max_downloads !== null && rij.max_downloads !== undefined ? Number(rij.max_downloads) : null;
    if (maxD !== null && Number(rij.downloads_aantal || 0) >= maxD) {
      return { ok: false, antwoord: error('LIMIET_DOWNLOADS_BEREIKT', 403) };
    }
  }

  const eigenaarLade: Lade = { userId: str(rij.user_id), ruimte: str(rij.ruimte) === 'technisch' ? 'technisch' : 'prive' };
  return { ok: true, rij, sessie, eigenaarLade };
}

async function maakAfgesnedenBestandAntwoord(
  eigenaarLade: Lade,
  doelId: string,
  bereik: CloudDeelBereik,
): Promise<{ naam: string; origineleNaam: string; soort: string; mime: string; bytes: number; sha256: string; data: string; tekst?: string; deelMeta: Record<string, unknown> }> {
  const meta = (await leesLadeBestandVoorDelen(eigenaarLade, doelId, { enkelMeta: true, alsSysteemLezen: true })) ?? fout('DOEL_NIET_BESCHIKBAAR');
  const b = meta.bestand;

  if (bereik.deelSoort === 'bytes') {
    const vanByte = Math.max(0, Number(bereik.vanByte || 0));
    const totByte = Math.min(Math.max(vanByte, Number(bereik.totByte ?? vanByte)), Math.max(0, b.bytes - 1));
    const lengte = totByte - vanByte + 1;
    if (b.bytes < 1 || vanByte >= b.bytes || lengte < 1 || lengte > PDF_DEEL_MAX) fout('DEEL_BUITEN_BEREIK');
    const gelezen = (await leesLadeBestandVoorDelen(eigenaarLade, doelId, { offset: vanByte, lengte, alsSysteemLezen: true })) ?? fout('DOEL_NIET_BESCHIKBAAR');
    const basis = b.naam.replace(/(\.[A-Za-z0-9]{1,8})$/, '');
    const ext = /(\.[A-Za-z0-9]{1,8})$/.exec(b.naam)?.[1] || '.bin';
    const deelNaam = `${basis}-bytes-${vanByte}-${totByte}${ext}`;
    const tekst = isTekstBestand(b) && gelezen.data.length <= 512 * 1024 ? gelezen.data.toString('utf8') : undefined;
    return {
      naam: deelNaam,
      origineleNaam: b.naam,
      soort: b.soort,
      mime: b.mime || 'application/octet-stream',
      bytes: gelezen.data.length,
      sha256: sha256Hex(gelezen.data),
      data: gelezen.data.toString('base64'),
      ...(tekst !== undefined ? { tekst } : {}),
      deelMeta: { deelSoort: 'bytes', vanByte, totByte, totaalBytes: b.bytes },
    };
  }

  const volledig = (await leesLadeBestandVoorDelen(eigenaarLade, doelId, { alsSysteemLezen: true })) ?? fout('DOEL_NIET_BESCHIKBAAR');

  if (bereik.deelSoort === 'regels') {
    const gesneden = snijdTekstRegels(volledig.data.toString('utf8'), Number(bereik.vanRegel || 1), Number(bereik.totRegel || 1));
    const buf = Buffer.from(gesneden.tekst, 'utf8');
    const basis = b.naam.replace(/(\.[A-Za-z0-9]{1,8})$/, '');
    const ext = /(\.[A-Za-z0-9]{1,8})$/.exec(b.naam)?.[1] || '.txt';
    return {
      naam: `${basis}-${gesneden.van}-${gesneden.tot}${ext}`,
      origineleNaam: b.naam,
      soort: b.soort === 'code' ? 'code' : 'tekst',
      mime: 'text/plain',
      bytes: buf.length,
      sha256: sha256Hex(buf),
      data: buf.toString('base64'),
      tekst: gesneden.tekst,
      deelMeta: { deelSoort: 'regels', vanRegel: gesneden.van, totRegel: gesneden.tot },
    };
  }

  if (bereik.deelSoort === 'paginas') {
    const gesneden = await snijdPdfPaginas(volledig.data, Number(bereik.vanPagina || 1), Number(bereik.totPagina || 1));
    const basis = b.naam.replace(/\.pdf$/i, '');
    return {
      naam: `${basis}-p${gesneden.van}-${gesneden.tot}.pdf`,
      origineleNaam: b.naam,
      soort: 'pdf',
      mime: 'application/pdf',
      bytes: gesneden.bytes.length,
      sha256: sha256Hex(gesneden.bytes),
      data: gesneden.bytes.toString('base64'),
      deelMeta: { deelSoort: 'paginas', vanPagina: gesneden.van, totPagina: gesneden.tot, paginasAantal: gesneden.tot - gesneden.van + 1 },
    };
  }

  return fout('BEREIK_ONGELDIG');
}

export function bestandenDelenPubliekeRoutes(leesOptioneleSessie: LeesOptioneleSessie): Record<string, RouterMiddleware[]> {
  const foutAntwoord = (err: unknown): Resp => {
    const code = String((err as Error)?.message || '');
    if (CODE_PATROON.test(code) && !code.startsWith('CLOUD_') && !code.startsWith('DB_')) {
      return error(code, code === 'DOEL_NIET_BESCHIKBAAR' ? 404 : 400);
    }
    console.error('[cloud-gedeeld]', code);
    return error('CLOUD_GEDEELD_FOUT', 500);
  };

  // ---------------------------------------------------------------- info (metadata + toegestane boom + weergaveteller)
  const info: RouterMiddleware = async (ctx) => {
    try {
      const d = bodyOf(ctx.body);
      const telWeergave = d.telWeergave !== false;
      const toegang = await controleerPubliekeKoppeling(ctx.event, d, leesOptioneleSessie, { telWeergave });
      if (!toegang.ok) return toegang.antwoord;
      const { rij, eigenaarLade } = toegang;
      const doelSoort = str(rij.doel_soort) as CloudDeelDoelSoort;
      const doelId = str(rij.doel_id);
      const bereik = (rij.bereik && typeof rij.bereik === 'object' ? rij.bereik : {}) as CloudDeelBereik;
      const eigenaar = await eigenaarProfiel(str(rij.user_id));

      const basisInfo = {
        naam: str(rij.naam),
        notitie: str(rij.notitie),
        doelSoort,
        doelNaam: str(rij.doel_naam),
        rechten: (str(rij.rechten) === 'bekijken' ? 'bekijken' : 'downloaden') as CloudDeelRechten,
        modus: (str(rij.modus) === 'accounts' ? 'accounts' : 'link') as CloudDeelModus,
        eigenaarNaam: eigenaar.naam,
        verlooptOp: isoOfNull(rij.verloopt_op),
        weergavenAantal: Number(rij.weergaven_aantal || 0),
        maxWeergaven: rij.max_weergaven !== null && rij.max_weergaven !== undefined ? Number(rij.max_weergaven) : null,
        downloadsAantal: Number(rij.downloads_aantal || 0),
        maxDownloads: rij.max_downloads !== null && rij.max_downloads !== undefined ? Number(rij.max_downloads) : null,
      };

      if (doelSoort === 'bestand') {
        const meta = await leesLadeBestandVoorDelen(eigenaarLade, doelId, { enkelMeta: true, alsSysteemLezen: true });
        if (!meta) return error('DOEL_NIET_BESCHIKBAAR', 404);
        const b = meta.bestand;
        return json({
          koppeling: basisInfo,
          bestand: { id: b.id, naam: b.naam, soort: b.soort, mime: b.mime, bytes: b.bytes, kind: b.kind, ...(b.url ? { url: b.url } : {}) },
          deelInfo: null,
          mappen: [],
          bestanden: [],
          archiefIngangen: [],
        });
      }

      if (doelSoort === 'bestand_deel') {
        const meta = await leesLadeBestandVoorDelen(eigenaarLade, doelId, { enkelMeta: true, alsSysteemLezen: true });
        if (!meta) return error('DOEL_NIET_BESCHIKBAAR', 404);
        const b = meta.bestand;
        return json({
          koppeling: basisInfo,
          bestand: { id: b.id, naam: b.naam, soort: bereik.deelSoort === 'paginas' ? 'pdf' : b.soort, mime: bereik.deelSoort === 'paginas' ? 'application/pdf' : b.mime, bytes: b.bytes, kind: b.kind },
          deelInfo: {
            deelSoort: bereik.deelSoort,
            ...(bereik.vanRegel !== undefined ? { vanRegel: bereik.vanRegel, totRegel: bereik.totRegel } : {}),
            ...(bereik.vanPagina !== undefined ? { vanPagina: bereik.vanPagina, totPagina: bereik.totPagina } : {}),
            ...(bereik.vanByte !== undefined ? { vanByte: bereik.vanByte, totByte: bereik.totByte } : {}),
          },
          mappen: [],
          bestanden: [],
          archiefIngangen: [],
        });
      }

      if (doelSoort === 'archief_pad') {
        const gelezen = await leesLadeBestandVoorDelen(eigenaarLade, doelId, { alsSysteemLezen: true });
        if (!gelezen) return error('DOEL_NIET_BESCHIKBAAR', 404);
        const archief = leesArchiefUitBuffer(gelezen.data, gelezen.bestand.naam, { alleenLijst: true });
        if (!archief.ondersteund) return error('DOEL_NIET_BESCHIKBAAR', 404);
        return json({
          koppeling: basisInfo,
          bestand: { id: gelezen.bestand.id, naam: gelezen.bestand.naam, soort: 'archief', mime: gelezen.bestand.mime, bytes: gelezen.bestand.bytes, kind: 'file' },
          deelInfo: null,
          mappen: [],
          bestanden: [],
          archiefIngangen: filterArchiefIngangen(archief.ingangen, bereik),
        });
      }

      // 'map' of 'selectie'
      const inventaris = await leesLadeInventarisVoorDelen(eigenaarLade, true);
      const boom = bouwToegestaneBoom(doelSoort, doelId, bereik, inventaris);
      return json({
        koppeling: basisInfo,
        bestand: null,
        deelInfo: null,
        mappen: boom.mappen,
        bestanden: boom.bestanden,
        archiefIngangen: [],
      });
    } catch (err) {
      return foutAntwoord(err);
    }
  };

  // ---------------------------------------------------------------- inhoud (voorvertoning van bestand of exact deel)
  const inhoud: RouterMiddleware = async (ctx) => {
    try {
      const d = bodyOf(ctx.body);
      const toegang = await controleerPubliekeKoppeling(ctx.event, d, leesOptioneleSessie);
      if (!toegang.ok) return toegang.antwoord;
      const { rij, sessie, eigenaarLade } = toegang;
      const doelSoort = str(rij.doel_soort) as CloudDeelDoelSoort;
      const doelId = str(rij.doel_id);
      const bereik = (rij.bereik && typeof rij.bereik === 'object' ? rij.bereik : {}) as CloudDeelBereik;
      const evObj = ctx.event as unknown as Record<string, unknown>;

      if (doelSoort === 'bestand_deel') {
        const uit = await maakAfgesnedenBestandAntwoord(eigenaarLade, doelId, bereik);
        await noteerGebeurtenis(rij, 'inhoud', evObj, uit.naam, sessie);
        return json(uit);
      }

      if (doelSoort === 'archief_pad') {
        const gevraagdPad = str(d.archiefPad).trim().replace(/^\/+|\/+$/g, '');
        if (!gevraagdPad) fout('ARCHIEF_BESTAND_ONBEKEND');
        const gelezen = await leesLadeBestandVoorDelen(eigenaarLade, doelId, { alsSysteemLezen: true });
        if (!gelezen) return error('DOEL_NIET_BESCHIKBAAR', 404);
        const archief = leesArchiefUitBuffer(gelezen.data, gelezen.bestand.naam, { alleenPaden: new Set([gevraagdPad]) });
        const toegestaan = filterArchiefIngangen(archief.ingangen, bereik);
        const ingang = toegestaan.find((i) => !i.map && i.pad === gevraagdPad);
        const bytes = archief.bestandenData.get(gevraagdPad);
        if (!ingang || !bytes) return error('ARCHIEF_BESTAND_ONBEKEND', 404);
        const buf = Buffer.from(bytes);
        const mime = veiligUploadMime('', ingang.naam);
        const soort = cloudSoort(mime, ingang.naam);
        const tekst = (soort === 'tekst' || soort === 'code') && buf.length <= 1024 * 1024 ? buf.toString('utf8') : undefined;
        await noteerGebeurtenis(rij, 'inhoud', evObj, ingang.pad, sessie);
        return json({
          naam: ingang.naam,
          soort,
          mime,
          bytes: buf.length,
          sha256: sha256Hex(buf),
          data: buf.toString('base64'),
          ...(tekst !== undefined ? { tekst } : {}),
        });
      }

      let teLezenId = doelId;
      if (doelSoort === 'map' || doelSoort === 'selectie') {
        const kandidaatId = idOfNull(d.bestandId) || fout('BESTAND_ONBEKEND');
        const inventaris = await leesLadeInventarisVoorDelen(eigenaarLade, true);
        const boom = bouwToegestaneBoom(doelSoort, doelId, bereik, inventaris);
        if (!boom.bestanden.some((b) => b.id === kandidaatId)) return error('BESTAND_ONBEKEND', 404);
        teLezenId = kandidaatId;
      }

      const gelezen = await leesLadeBestandVoorDelen(eigenaarLade, teLezenId, { alsSysteemLezen: true });
      if (!gelezen) return error('DOEL_NIET_BESCHIKBAAR', 404);
      const b = gelezen.bestand;
      const tekst = isTekstBestand(b) && gelezen.data.length <= 1024 * 1024 ? gelezen.data.toString('utf8') : undefined;
      await noteerGebeurtenis(rij, 'inhoud', evObj, b.naam, sessie);
      return json({
        naam: b.naam,
        soort: b.soort,
        mime: b.mime || 'application/octet-stream',
        bytes: gelezen.data.length,
        sha256: sha256Hex(gelezen.data),
        data: gelezen.data.toString('base64'),
        ...(b.url ? { url: b.url } : {}),
        ...(tekst !== undefined ? { tekst } : {}),
      });
    } catch (err) {
      return foutAntwoord(err);
    }
  };

  // ---------------------------------------------------------------- download (bestand, exact deel of volledige map-zip)
  const download: RouterMiddleware = async (ctx) => {
    try {
      const d = bodyOf(ctx.body);
      const toegang = await controleerPubliekeKoppeling(ctx.event, d, leesOptioneleSessie, { eisDownload: true });
      if (!toegang.ok) return toegang.antwoord;
      const { rij, sessie, eigenaarLade } = toegang;
      const doelSoort = str(rij.doel_soort) as CloudDeelDoelSoort;
      const doelId = str(rij.doel_id);
      const bereik = (rij.bereik && typeof rij.bereik === 'object' ? rij.bereik : {}) as CloudDeelBereik;
      const evObj = ctx.event as unknown as Record<string, unknown>;

      const reserveerDownload = async (): Promise<boolean> => {
        const r = await deelSql(
          `UPDATE app.cloud_deel_koppelingen
              SET downloads_aantal = downloads_aantal + 1,
                  laatst_bekeken_op = now(),
                  bijgewerkt_op = now()
            WHERE id = $1
              AND ingetrokken_op IS NULL
              AND NOT gepauzeerd
              AND rechten = 'downloaden'
              AND (max_downloads IS NULL OR downloads_aantal < max_downloads)
            RETURNING downloads_aantal`,
          [rij.id],
          { alsSysteem: true },
        );
        return Boolean(r.rows[0]);
      };

      if (doelSoort === 'bestand_deel') {
        const uit = await maakAfgesnedenBestandAntwoord(eigenaarLade, doelId, bereik);
        if (!(await reserveerDownload())) return error('LIMIET_DOWNLOADS_BEREIKT', 403);
        await noteerGebeurtenis(rij, 'download', evObj, uit.naam, sessie);
        return json({ naam: uit.naam, mime: uit.mime, bytes: uit.bytes, sha256: uit.sha256, data: uit.data });
      }

      if (doelSoort === 'archief_pad') {
        const gelezen = await leesLadeBestandVoorDelen(eigenaarLade, doelId, { alsSysteemLezen: true });
        if (!gelezen) return error('DOEL_NIET_BESCHIKBAAR', 404);
        if (d.allesZip === true) {
          const archief = leesArchiefUitBuffer(gelezen.data, gelezen.bestand.naam);
          const toegestaan = filterArchiefIngangen(archief.ingangen, bereik).filter((i) => !i.map);
          const bundel: Record<string, Uint8Array> = {};
          let som = 0;
          for (const ing of toegestaan) {
            const inhoudBytes = archief.bestandenData.get(ing.pad);
            if (!inhoudBytes) continue;
            som += inhoudBytes.byteLength;
            if (som > ZIP_BUNDEL_MAX) fout('TE_GROOT');
            bundel[ing.pad] = inhoudBytes;
          }
          const zipBytes = Buffer.from(zipSync(bundel, { level: 6 }));
          if (!(await reserveerDownload())) return error('LIMIET_DOWNLOADS_BEREIKT', 403);
          const zipNaam = `${schoneNaam(str(rij.naam)) || 'archief-selectie'}.zip`;
          await noteerGebeurtenis(rij, 'map_archief', evObj, zipNaam, sessie);
          return json({ naam: zipNaam, mime: 'application/zip', bytes: zipBytes.length, sha256: sha256Hex(zipBytes), data: zipBytes.toString('base64') });
        }
        const gevraagdPad = str(d.archiefPad).trim().replace(/^\/+|\/+$/g, '');
        if (!gevraagdPad) fout('ARCHIEF_BESTAND_ONBEKEND');
        const archief = leesArchiefUitBuffer(gelezen.data, gelezen.bestand.naam, { alleenPaden: new Set([gevraagdPad]) });
        const toegestaan = filterArchiefIngangen(archief.ingangen, bereik);
        const ingang = toegestaan.find((i) => !i.map && i.pad === gevraagdPad);
        const inhoudBytes = archief.bestandenData.get(gevraagdPad);
        if (!ingang || !inhoudBytes) return error('ARCHIEF_BESTAND_ONBEKEND', 404);
        if (!(await reserveerDownload())) return error('LIMIET_DOWNLOADS_BEREIKT', 403);
        const buf = Buffer.from(inhoudBytes);
        await noteerGebeurtenis(rij, 'download', evObj, ingang.pad, sessie);
        return json({
          naam: ingang.naam,
          mime: veiligUploadMime('', ingang.naam),
          bytes: buf.length,
          sha256: sha256Hex(buf),
          data: buf.toString('base64'),
        });
      }

      if ((doelSoort === 'map' || doelSoort === 'selectie') && d.allesZip === true) {
        const inventaris = await leesLadeInventarisVoorDelen(eigenaarLade, true);
        const boom = bouwToegestaneBoom(doelSoort, doelId, bereik, inventaris);
        if (!boom.bestanden.length) fout('SELECTIE_LEEG');
        const bundel: Record<string, Uint8Array> = {};
        let som = 0;
        const gebruiktePaden = new Set<string>();
        for (const item of boom.bestanden) {
          som += item.bytes;
          if (som > ZIP_BUNDEL_MAX) fout('TE_GROOT');
          const gelezen = await leesLadeBestandVoorDelen(eigenaarLade, item.id, { alsSysteemLezen: true });
          if (!gelezen) continue;
          let padInZip = item.pad;
          let teller = 2;
          while (gebruiktePaden.has(padInZip.toLowerCase())) {
            padInZip = item.pad.replace(/(\.[A-Za-z0-9]{1,8})?$/, ` (${teller})$1`);
            teller += 1;
          }
          gebruiktePaden.add(padInZip.toLowerCase());
          bundel[padInZip] = new Uint8Array(gelezen.data);
        }
        const zipBytes = Buffer.from(zipSync(bundel, { level: 6 }));
        if (!(await reserveerDownload())) return error('LIMIET_DOWNLOADS_BEREIKT', 403);
        const zipNaam = `${schoneNaam(str(rij.naam) || str(rij.doel_naam)) || 'gedeelde-map'}.zip`;
        await noteerGebeurtenis(rij, 'map_archief', evObj, zipNaam, sessie);
        return json({ naam: zipNaam, mime: 'application/zip', bytes: zipBytes.length, sha256: sha256Hex(zipBytes), data: zipBytes.toString('base64') });
      }

      let teDownloadenId = doelId;
      if (doelSoort === 'map' || doelSoort === 'selectie') {
        const kandidaatId = idOfNull(d.bestandId) || fout('BESTAND_ONBEKEND');
        const inventaris = await leesLadeInventarisVoorDelen(eigenaarLade, true);
        const boom = bouwToegestaneBoom(doelSoort, doelId, bereik, inventaris);
        if (!boom.bestanden.some((b) => b.id === kandidaatId)) return error('BESTAND_ONBEKEND', 404);
        teDownloadenId = kandidaatId;
      }

      const gelezen = await leesLadeBestandVoorDelen(eigenaarLade, teDownloadenId, { alsSysteemLezen: true });
      if (!gelezen) return error('DOEL_NIET_BESCHIKBAAR', 404);
      if (!(await reserveerDownload())) return error('LIMIET_DOWNLOADS_BEREIKT', 403);
      const b = gelezen.bestand;
      await noteerGebeurtenis(rij, 'download', evObj, b.naam, sessie);
      return json({
        naam: b.naam,
        mime: b.mime || 'application/octet-stream',
        bytes: gelezen.data.length,
        sha256: sha256Hex(gelezen.data),
        data: gelezen.data.toString('base64'),
      });
    } catch (err) {
      return foutAntwoord(err);
    }
  };

  return {
    'POST /api/cloud/gedeeld/info': [info],
    'POST /api/cloud/gedeeld/inhoud': [inhoud],
    'POST /api/cloud/gedeeld/download': [download],
  };
}
