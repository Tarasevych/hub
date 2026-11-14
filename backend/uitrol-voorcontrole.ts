// Voorcontrole van een uitrolpakket, VÓÓR de goedkeuring met de passkey.
//
// Waarom: de goedkeuring met passkey is de enige weg om de site op afstand bij te werken. Dan moet de eigenaar vooraf weten of dit pakket de
// site kan breken. Deze module pakt het pakket in een tijdelijke map uit en voert alleen STATISCHE controles uit (nooit code uit het pakket):
//   structuur   één bovenmap, gewone bestanden en mappen, geen links/apparaten/paden buiten de map, redelijke omvang
//               (SEC-002: drie lagen — de inhoudslijst moet VOLLEDIG te ontleden zijn; na het uitpakken wordt de map zelf nagelopen;
//               elk bestand uit het pakket wordt zonder het volgen van links gelezen; een map zonder rwx of een bestand zonder r voor
//               de eigenaar wordt geweigerd, en het opruimen van de werkmap hangt niet af van de rechten in het pakket)
//   versie      UITROL-VERSIE klopt met het voorstel en is nieuwer dan de actieve versie
//   metadata    AUTEUR, AGENT en SAMENVATTING (≥ 20 tekens) — dezelfde regels als root (deploy/uitrol/mijn-ruimte-uitrol.sh)
//   commit      BRON-COMMIT = 40-hex git-commit (ok) of «zonder-git:<reden>» (waarschuwing); anders fout GEEN_BRON_COMMIT (regel 3)
//   scripts     `bash -n` (syntaxis) van alle shell-scripts onder deploy/ — het installatiescript en het root-script worden als root gebruikt
//   bouwen      package.json (geldig, build-script), package-lock.json, vite- en server-bouwbestanden, de ingangen van de app
//   migraties   naamreeks, geen dubbele nummers; NIEUWE migraties met DROP TABLE/COLUMN, TRUNCATE, DELETE zonder WHERE of RENAME → waarschuwing
//               (een databasemigratie wordt bij een terugdraaien niet teruggedraaid)
//   geheimen    privésleutels, tokens of .env-bestanden in het pakket → waarschuwing (alleen bestandsnamen, nooit inhoud)
// Uitkomst: { ok, fouten, waarschuwingen, controles[] }. «fout» blokkeert de goedkeuring; «waarschuwing» niet. Bouwen (npm ci + vite) en
// migreren gebeuren pas bij de installatie, geïsoleerd, met database-back-up, gezondheidscontrole, nabewaking en automatisch terugdraaien.
import { MANIFEST_BESTAND, MANIFEST_MAX, TESTRESULTATEN_MAX, leesTestresultaten, manifestVerplicht, testDetails, valideerManifest } from '../shared/uitrol-manifest';
import { ONTWIKKELARCHIEF_BESTAND, ONTWIKKELARCHIEF_MAX, ontwikkelArchiefVerplicht, leesOntwikkelArchief, type OntwikkelArchief } from '../shared/ontwikkelarchief';
import { controleerOntwikkelArchiefOnline, sha256VanBestand, type ArchiefControle } from './uitrol-ontwikkelarchief';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as FS } from 'node:fs';
import { chmod, lstat, mkdtemp, open, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
import { bronCommit } from '../shared/bron-commit';
import { GEHEIM_PATRONEN_STRIKT } from '../shared/geheim-patronen';
import { beoordeelToegepasteMigraties } from '../shared/uitrol-vereisten';
export type Niveau = 'ok' | 'waarschuwing' | 'fout';
export type Controle = { id: string; niveau: Niveau; uk: string; nl: string; details?: string[] };
export type PakketMeta = { auteur: string; agent: string; samenvatting: string; bestanden: number; bytesUitgepakt: number; commit: string; bovenmap: string;
  /** UI-010: gevalideerd manifest (deelnemers, beschrijving uk+nl); blijft in uitrol_voorstellen.pakket_meta, ook na intrekken van rechten. */
  manifest?: import('../shared/uitrol-manifest').Manifest | null; ontwikkelArchiefUrl?: string };
export type Voorcontrole = { versie: 1; tijd: string; ok: boolean; fouten: number; waarschuwingen: number; controles: Controle[] };
export type VoorcontroleUitkomst = { resultaat: Voorcontrole; meta: PakketMeta };

const VERSIE = /^[0-9]{8}-[0-9]{6}$/;
const MAX_UITGEPAKT = 1.5 * 1024 ** 3;
const MAX_BESTANDEN = 60000;
const TAR = ['/usr/bin/tar', '/bin/tar'];
const BASH = ['/usr/bin/bash', '/bin/bash'];
const eerste = async (kandidaten: string[]) => { for (const k of kandidaten) { try { await stat(k); return k; } catch { /* volgende */ } } return kandidaten[0]; };

type Regel = { type: string; rechten: string; bytes: number; naam: string };
type Lijst = { regels: Regel[]; onleesbaar: number; voorbeelden: string[] };
const zichtbaar = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '?');
/**
 * Inhoudslijst van het archief (`tar --list --verbose`), één post per regel.
 * SEC-002 (server-uitrol-01): een regel die NIET te ontleden is, wordt geteld en niet meer stil overgeslagen. Vroeger viel een post
 * met een eigenaarsnaam met een spatie («a b/root»), een datum buiten vier jaarcijfers of een bestandsnaam met een regeleinde buiten
 * de typecontrole: zo kwam een symbolische link ongezien in de uitgepakte map en las de voorcontrole een bestand BUITEN het archief
 * (bv. /proc/self/environ) in SAMENVATTING. `--numeric-owner` haalt de vrije tekst van eigenaar en groep uit de regel.
 * Список вмісту архіву: рядок, який не вдалося розібрати, тепер рахується і блокує пакет (раніше його мовчки пропускали).
 */
async function lijst(pakket: string): Promise<Lijst> {
  const tar = await eerste(TAR);
  const { stdout } = await run(tar, ['--list', '--verbose', '--numeric-owner', '--gzip', '--quoting-style=literal', '--file', pakket], { maxBuffer: 64 * 1024 * 1024, timeout: 60_000, env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' } });
  const uit: Lijst = { regels: [], onleesbaar: 0, voorbeelden: [] };
  const ruw = stdout.split('\n');
  if (ruw[ruw.length - 1] === '') ruw.pop(); // alleen het regeleinde na de laatste post
  for (const r of ruw) {
    const m = /^(.)(\S{9})\s+\S+\s+(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s(.*)$/.exec(r);
    if (m) uit.regels.push({ type: m[1], rechten: m[2], bytes: Number(m[3]), naam: m[1] === 'l' || m[1] === 'h' ? m[4].replace(/ (?:->|link to) .*$/, '') : m[4] });
    else { uit.onleesbaar += 1; if (uit.voorbeelden.length < 4) uit.voorbeelden.push(zichtbaar(r).slice(0, 80)); }
  }
  return uit;
}

const kaal = (s: string) => s.replace(/\r/g, '').replace(/\0/g, '').trim();

/**
 * SEC-002 (na de controle, g01-5): de uitkomst van de voorcontrole gaat via voorstelKlaar/voorstelStatus naar de voorbereider (een agent).
 * Teksten van uitzonderingen bevatten interne paden (uploadmap, tijdelijke werkmap) en volledige opdrachtregels: die gaan alleen naar het
 * logboek van de dienst, nooit in `details`.
 * Внутрішні шляхи й рядки команд — лише в журнал служби, не в подробиці, які бачить підготовник.
 */
function logIntern(waar: string, e: unknown) {
  console.error(`[uitrol-voorcontrole] ${waar}: ${String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 400)}`);
}
/** Een melding van bash over een script in de werkmap: het absolute pad → de naam binnen het pakket; overige werkmap-paden weg. */
function zonderWerkpad(tekst: string, werk: string, bron: string, rel: string): string {
  let t = tekst.split(path.join(bron, rel)).join(rel);
  if (werk) t = t.split(werk + path.sep).join('').split(werk).join('');
  return t.replace(/\/\S*uitrol-voorcontrole-[^\s/:]*\/?/g, '');
}

/**
 * SEC-002, tweede laag: de uitgepakte map nalopen VÓÓR er iets uit gelezen wordt. Alleen gewone bestanden en mappen mogen bestaan;
 * een symbolische link, harde link, FIFO, socket of apparaat blokkeert het pakket — ongeacht wat de inhoudslijst liet zien.
 * Другий шар: після розпакування й до першого читання — лише звичайні файли й теки; будь-яке посилання блокує пакет.
 */
export async function _controleerUitgepakt(wortel: string): Promise<string[]> {
  const slecht: string[] = []; const rij: string[] = [wortel]; let geteld = 0;
  // g01-5: deze regels ziet de (Oekraïenstalige) eigenaar in src/uitrol/Voorcontrole.tsx — daarom elk detail als paar uk · nl.
  const soort = (st: import('node:fs').Stats) => st.isSymbolicLink() ? 'символьне посилання · symbolische link' : st.isFIFO() ? 'FIFO' : st.isSocket() ? 'сокет · socket' : st.isBlockDevice() || st.isCharacterDevice() ? 'пристрій · apparaat' : 'невідомий тип · onbekend';
  while (rij.length) {
    const dir = rij.pop()!;
    for (const naam of await readdir(dir)) {
      const p = path.join(dir, naam); const rel = zichtbaar(path.relative(wortel, p)).slice(0, 80);
      const st = await lstat(p);
      // g01-1: een map die de eigenaar niet kan lezen/betreden/legen wordt gemeld en NIET betreden (als root zou readdir gewoon slagen,
      // als dienstgebruiker gooit het EACCES); een bestand zonder leesrecht voor de eigenaar is evenmin een gewoon pakketbestand.
      if (st.isDirectory()) { if ((st.mode & 0o700) !== 0o700) slecht.push(`тека без прав для власника · map zonder rechten voor de eigenaar: ${rel}`); else rij.push(p); }
      else if (!st.isFile()) slecht.push(`не звичайний файл · geen gewoon bestand (${soort(st)}): ${rel}`);
      else if (st.nlink > 1) slecht.push(`жорстке посилання · harde link: ${rel}`);
      else if (!(st.mode & 0o400)) slecht.push(`файл недоступний власникові для читання · bestand niet leesbaar voor de eigenaar: ${rel}`);
      if (++geteld > MAX_BESTANDEN * 3) { slecht.push('забагато записів у розпакованій теці · te veel posten in de uitgepakte map'); return slecht; }
      if (slecht.length >= 12) return slecht;
    }
  }
  return slecht;
}

/**
 * SEC-002 (na de controle, g01-1): de werkmap van de voorcontrole verwijderen, ONAFHANKELIJK van de rechten binnen die map.
 * Vroeger: `rm(...).catch(() => undefined)` — een map zonder rechten (modus 000 of zonder schrijfrecht) kon de dienst (geen root) niet
 * in of niet legen; de fout werd stil ingeslikt en tot 1,5 GB per poging bleef in de tijdelijke map van de dienst staan.
 * Nu: lukt het verwijderen niet, dan krijgt de eigenaar op elke MAP weer rwx (nalopen met lstat: een link wordt nooit gevolgd en
 * nooit van rechten veranderd) en wordt het opnieuw geprobeerd. Lukt het dan nog niet → één regel in het logboek van de dienst.
 * Прибирання тимчасової теки не залежить від прав усередині неї; невдача більше не замовчується (рядок у журналі служби).
 */
export async function _ruimWerkmapOp(werk: string): Promise<boolean> {
  const weg = () => rm(werk, { recursive: true, force: true });
  try { await weg(); return true; } catch { /* rechten herstellen en opnieuw */ }
  const rij: string[] = [werk]; let geteld = 0;
  while (rij.length && geteld < MAX_BESTANDEN * 6) {
    const dir = rij.pop()!;
    try {
      if (!(await lstat(dir)).isDirectory()) continue; // nooit een link volgen: chmod werkt op het DOEL van een link
      await chmod(dir, 0o700);
      for (const naam of await readdir(dir)) {
        geteld += 1; const p = path.join(dir, naam);
        if ((await lstat(p)).isDirectory()) rij.push(p);
      }
    } catch { /* verder met de rest; de tweede poging hieronder beslist */ }
  }
  try { await weg(); return true; } catch (e) {
    console.error(`[uitrol-voorcontrole] OPRUIMEN MISLUKT: tijdelijke map ${werk} is niet verwijderd (${String((e as NodeJS.ErrnoException).code || 'fout')}) — handmatig verwijderen`);
    return false;
  }
}

/**
 * SEC-002, derde laag: hoogstens `max` bytes van een GEWOON bestand binnen `wortel` lezen, zonder ooit een link te volgen:
 * het echte pad moet letterlijk wortel/rel zijn (geen link in enig tussenliggend deel), openen met O_NOFOLLOW (en O_NONBLOCK, zodat
 * een FIFO niet blijft hangen) en daarna fstat().isFile() op de geopende descriptor. null = niet (veilig) leesbaar.
 * Третій шар: читання без переходу за посиланнями; null, якщо це не звичайний файл усередині теки пакета.
 */
export async function _leesVeilig(wortel: string, rel: string, max: number): Promise<Buffer | null> {
  let fh: import('node:fs/promises').FileHandle | null = null;
  try {
    const echteWortel = await realpath(wortel);
    const doel = path.resolve(echteWortel, rel);
    if (doel !== echteWortel && !doel.startsWith(echteWortel + path.sep)) return null;
    if ((await realpath(doel)) !== doel) return null;
    fh = await open(doel, FS.O_RDONLY | (FS.O_NOFOLLOW ?? 0) | (FS.O_NONBLOCK ?? 0));
    const st = await fh.stat();
    if (!st.isFile()) return null;
    const buf = Buffer.alloc(Math.max(0, Math.min(max, st.size)));
    let gelezen = 0;
    while (gelezen < buf.length) { const { bytesRead } = await fh.read(buf, gelezen, buf.length - gelezen, gelezen); if (!bytesRead) break; gelezen += bytesRead; }
    return buf.subarray(0, gelezen);
  } catch { return null; } finally { await fh?.close().catch(() => undefined); }
}
async function alleBestanden(dir: string, basis = dir, uit: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') await alleBestanden(p, basis, uit); } else if (e.isFile()) uit.push(path.relative(basis, p));
    if (uit.length > MAX_BESTANDEN) break;
  }
  return uit;
}

const SQL_RISICO: Array<[RegExp, string, string]> = [
  [/\bDROP\s+(?:TABLE|COLUMN|SCHEMA|DATABASE|TYPE)\b/i, 'DROP TABLE/COLUMN/SCHEMA', 'DROP TABLE/COLUMN/SCHEMA'],
  [/\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/i, 'DROP COLUMN', 'DROP COLUMN'],
  [/\bTRUNCATE\b/i, 'TRUNCATE', 'TRUNCATE'],
  [/\bDELETE\s+FROM\s+[\w."]+\s*(?:;|$)/im, 'DELETE FROM zonder WHERE', 'DELETE FROM zonder WHERE'],
  [/\bALTER\s+TABLE\b[^;]*\bRENAME\b/i, 'RENAME', 'RENAME'],
  [/\bALTER\s+COLUMN\b[^;]*\b(?:SET\s+DATA\s+)?TYPE\b/i, 'kolomtype wijzigen', 'kolomtype wijzigen'],
];
// De patronen staan sinds 22.10.2026 in shared/geheim-patronen.ts (GEHEIM_PATRONEN_STRIKT), gedeeld met de zoekindex.
const GEHEIM_PATRONEN = GEHEIM_PATRONEN_STRIKT;

/** UITROL-001: de proef vóór het uploaden (backend/uitrol-vereisten.ts → proefVoorArchief), met per migratie de SHA-256 van de geprobeerde SQL. */
export type ProefVoorControle = { id: string; ok: boolean; status: string; sqlSha256: ReadonlyMap<string, string> };
export async function pakketVoorcontrole(pakket: string, opties: { versie: string; actieveVersie?: string; toegepasteMigraties?: ReadonlySet<string> | null; tests?: { geslaagd?: number | null; mislukt?: number | null } | null; archiefToken?: string; archiefControle?: (ref: OntwikkelArchief, pakketSha: string) => Promise<ArchiefControle>; proef?: ProefVoorControle | null }): Promise<VoorcontroleUitkomst> {
  const controles: Controle[] = [];
  const voeg = (id: string, niveau: Niveau, uk: string, nl: string, details?: string[]) => { controles.push({ id, niveau, uk, nl, ...(details?.length ? { details: details.slice(0, id === 'tests' || id === 'manifest' ? 120 : 12) } : {}) }); };
  const meta: PakketMeta = { auteur: '', agent: '', samenvatting: '', bestanden: 0, bytesUitgepakt: 0, commit: '', bovenmap: '' };
  let werk = '';
  try {
    // ---- 1. structuur (lijst, nog niet uitpakken)
    let regels: Regel[] = []; let onleesbaar = 0; let voorbeelden: string[] = [];
    try { ({ regels, onleesbaar, voorbeelden } = await lijst(pakket)); } catch (e) {
      // g01-5: de foutmelding van tar bevat de volledige opdrachtregel met het pad van de uploadmap — alleen naar het logboek van de
      // dienst; de voorbereider (agent) ziet een neutrale tekst.
      logIntern('inhoudslijst', e);
      voeg('structuur', 'fout', 'Архів не читається як tar.gz.', 'Het archief is niet te lezen als tar.gz.', ['tar не зміг прочитати список вмісту (пошкоджений або не gzip-архів) · tar kon de inhoudslijst niet lezen (beschadigd of geen gzip-archief)']);
      return afronden(controles, meta);
    }
    const slecht: string[] = []; const toppen = new Set<string>(); let wortelBestand = false; let bytes = 0;
    // SEC-002: fail closed — één post die we niet kunnen lezen, kan een link of apparaat zijn.
    if (onleesbaar) slecht.push(`рядків списку вмісту, які не вдалося розібрати (незвична дата, тип або ім’я з переведенням рядка): ${onleesbaar} · ${onleesbaar} regel(s) van de inhoudslijst niet te ontleden (ongewone datum, soort of bestandsnaam met een regeleinde): ${voorbeelden.join(' | ')}`);
    for (const r of regels) {
      const naam = r.naam.replace(/^\.\//, '');
      const delen = naam.split('/').filter((d) => d && d !== '.');
      if (naam.startsWith('/') || delen.includes('..') || naam.includes('\\')) slecht.push(`onveilig pad: ${naam.slice(0, 80)}`);
      if (!['-', 'd', '0'].includes(r.type)) slecht.push(`niet-toegestaan type '${r.type}': ${naam.slice(0, 80)}`);
      // SEC-002 (na de controle, g01-1): tar maakt een map met modus 000 precies zo aan. De dienst is geen root: het nalopen faalde dan
      // met EACCES en het opruimen kon de map niet meer in. De eigenaar moet elke map kunnen lezen, betreden en legen (rwx; «s» = x met
      // setuid) en elk bestand kunnen lezen — anders weigeren we het pakket hier, vóór het uitpakken.
      // Тека без rwx для власника або файл без r — відхиляємо ще за списком, до розпакування.
      else if (r.type === 'd' ? !/^rw[xs]/.test(r.rechten) : !r.rechten.startsWith('r')) slecht.push(`${r.type === 'd' ? 'тека' : 'файл'} без прав для власника · ${r.type === 'd' ? 'map' : 'bestand'} zonder rechten voor de eigenaar (${r.rechten}): ${naam.slice(0, 80)}`);
      if (delen.length === 1 && r.type !== 'd') wortelBestand = true; else if (delen.length) toppen.add(delen[0]);
      bytes += r.bytes;
    }
    meta.bestanden = regels.filter((r) => r.type !== 'd').length; meta.bytesUitgepakt = bytes;
    if (toppen.size > 1 || (toppen.size === 1 && wortelBestand)) slecht.push('het archief moet precies één bovenmap hebben');
    if (!regels.length) slecht.push('het archief is leeg');
    if (bytes > MAX_UITGEPAKT || meta.bestanden > MAX_BESTANDEN) slecht.push(`te groot na uitpakken (${Math.round(bytes / 1048576)} MB, ${meta.bestanden} bestanden)`);
    if (slecht.length) { voeg('structuur', 'fout', 'Структура архіву небезпечна або некоректна.', 'De structuur van het archief is onveilig of onjuist.', slecht); return afronden(controles, meta); }

    // ---- uitpakken (alleen bestanden; geen uitvoering)
    werk = await mkdtemp(path.join(tmpdir(), 'uitrol-voorcontrole-'));
    await run(await eerste(TAR), ['--extract', '--gzip', '--no-same-owner', '--no-same-permissions', '--file', pakket, '-C', werk], { timeout: 90_000, maxBuffer: 8 * 1024 * 1024, env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' } });
    // SEC-002: de map zelf nalopen vóór het eerste lezen — wat er werkelijk staat, telt; niet wat de lijst beweerde.
    const vreemd = await _controleerUitgepakt(werk);
    if (vreemd.length) { voeg('structuur', 'fout', 'Після розпакування в пакеті знайдено посилання, особливі файли або записи без прав доступу для власника — пакет відхилено, нічого з нього не прочитано.', 'Na het uitpakken staan er links, bijzondere bestanden of posten zonder rechten voor de eigenaar in het pakket — pakket geweigerd, er is niets uit gelezen.', vreemd); return afronden(controles, meta); }
    voeg('structuur', 'ok', `Структура в порядку: одна тека, ${meta.bestanden} файлів, ${Math.round(bytes / 1048576)} МБ після розпакування.`, `Structuur in orde: één map, ${meta.bestanden} bestanden, ${Math.round(bytes / 1048576)} MB uitgepakt.`);
    let bron = werk;
    if (!(await lstat(path.join(werk, 'UITROL-VERSIE')).catch(() => null))?.isFile()) {
      const top = await readdir(werk);
      if (top.length === 1) bron = path.join(werk, top[0]);
      meta.bovenmap = top.length === 1 ? top[0] : '';
    }
    // Alles uit het pakket wordt via _leesVeilig gelezen (binnen `werk`, geen links); `bestaat` = een gewoon bestand, zonder een link te volgen.
    const relBron = path.relative(werk, bron);
    const lees = (rel: string, max: number) => _leesVeilig(werk, path.join(relBron, rel), max);
    const leesMeta = async (_dir: string, naam: string, max: number) => { const b = await lees(naam, max); return b ? kaal(b.toString('utf8')) : ''; };
    const bestaat = async (p: string) => !!(await lstat(path.join(bron, p)).catch(() => null))?.isFile();

    // ---- 2. versie
    const inhoudVersie = await leesMeta(bron, 'UITROL-VERSIE', 64).then((v) => v.replace(/\s+/g, ''));
    if (!inhoudVersie) voeg('versie', 'fout', 'У архіві немає файлу UITROL-VERSIE.', 'UITROL-VERSIE ontbreekt in het archief.');
    else if (!VERSIE.test(inhoudVersie)) voeg('versie', 'fout', `UITROL-VERSIE «${inhoudVersie.slice(0, 20)}» має бути РРРРММДД-ГГХХСС.`, `UITROL-VERSIE «${inhoudVersie.slice(0, 20)}» moet JJJJMMDD-UUMMSS zijn.`);
    else if (inhoudVersie !== opties.versie) voeg('versie', 'fout', `Версія в архіві (${inhoudVersie}) не збігається із заявленою (${opties.versie}).`, `Versie in het archief (${inhoudVersie}) wijkt af van de opgegeven versie (${opties.versie}).`);
    else if (opties.actieveVersie && VERSIE.test(opties.actieveVersie) && !(inhoudVersie > opties.actieveVersie)) voeg('versie', 'fout', `Версія ${inhoudVersie} не новіша за встановлену (${opties.actieveVersie}) — сервер відхилить такий пакет.`, `Versie ${inhoudVersie} is niet nieuwer dan de geïnstalleerde (${opties.actieveVersie}) — de server weigert zo’n pakket.`);
    else voeg('versie', 'ok', `Версія ${inhoudVersie}${opties.actieveVersie ? ` новіша за встановлену (${opties.actieveVersie})` : ''}.`, `Versie ${inhoudVersie}${opties.actieveVersie ? ` is nieuwer dan de geïnstalleerde (${opties.actieveVersie})` : ''}.`);

    // ---- 3. metadata (zelfde regels als root)
    meta.auteur = await leesMeta(bron, 'AUTEUR', 200);
    meta.agent = await leesMeta(bron, 'AGENT', 40);
    meta.samenvatting = (await leesMeta(bron, 'SAMENVATTING', 8000)).replace(/\n{3,}/g, '\n\n');
    const bc = bronCommit(await leesMeta(bron, 'BRON-COMMIT', 200));
    meta.commit = bc.waarde;
    const m: string[] = [];
    if (!meta.auteur) m.push('AUTEUR ontbreekt (хто автор)'); else if (meta.auteur.length < 3) m.push('AUTEUR is te kort');
    if (!meta.agent) m.push('AGENT ontbreekt (через якого агента зроблено)'); else if (!/^[a-z][a-z0-9-]{1,31}$/.test(meta.agent)) m.push('AGENT moet kleine letters zijn, bv. claude/cursor/gpt');
    if (!meta.samenvatting) m.push('SAMENVATTING ontbreekt — опису змін немає, встановлення неможливе'); else if (meta.samenvatting.replace(/\s+/g, ' ').length < 20) m.push('SAMENVATTING is te kort (minstens 20 tekens)');
    if (m.length) voeg('metadata', 'fout', 'Метадані випуску неповні — сервер відхилить пакет: ' + m.join('; ') + '.', 'Metadata van de release onvolledig — de server weigert het pakket: ' + m.join('; ') + '.');
    else voeg('metadata', 'ok', `Метадані є: автор ${meta.auteur}, агент ${meta.agent}, опис ${meta.samenvatting.replace(/\s+/g, ' ').length} символів.`, `Metadata aanwezig: auteur ${meta.auteur}, agent ${meta.agent}, beschrijving ${meta.samenvatting.replace(/\s+/g, ' ').length} tekens.`);

    // ---- 3a. UI-010: UITROL-MANIFEST.json (tweetalige beschrijving + deelnemers). Zelfde regels als de browser (shared/uitrol-manifest.ts).
    {
      const ruw = (await bestaat(MANIFEST_BESTAND)) ? await leesMeta(bron, MANIFEST_BESTAND, MANIFEST_MAX) : null;
      if (ruw != null) {
        const r = valideerManifest(ruw, inhoudVersie);
        if (r.fouten.length) voeg('manifest', 'fout', `MANIFEST_ONGELDIG: у ${MANIFEST_BESTAND} бракує або неправильні поля (${r.fouten.length}). Виправте їх і зберіть пакет знову.`, `MANIFEST_ONGELDIG: ${MANIFEST_BESTAND} heeft ontbrekende of ongeldige velden (${r.fouten.length}). Herstel ze en bouw het pakket opnieuw.`, r.fouten.map((f) => `${f.veld}: ${f.uk} · ${f.nl}`));
        else { const m = r.manifest!; meta.manifest = m; const ai = m.deelnemers.filter((d) => d.soort === 'ai'); voeg('manifest', 'ok', `Опис українською й нідерландською є; учасників ${m.deelnemers.length}${m.zonderAi ? ' (без ШІ)' : `, ШІ-агентів ${ai.length}`}.`, `Beschrijving in het Oekraïens en Nederlands aanwezig; ${m.deelnemers.length} deelnemer(s)${m.zonderAi ? ' (zonder AI)' : `, ${ai.length} AI-agent(en)`}.`, m.deelnemers.map((d) => `${d.soort}: ${d.naam}${d.platform ? ` · ${d.platform}` : ''}${d.soort === 'ai' ? ` · model ${d.model?.id || 'onbekend'} (${d.model?.bron})` : ''} · ${d.rollen.join(',')}`)); }
      } else if (manifestVerplicht(inhoudVersie)) voeg('manifest', 'fout', `GEEN_MANIFEST: у пакеті немає ${MANIFEST_BESTAND} (опис uk+nl і учасники) — для нових випусків він обов’язковий.`, `GEEN_MANIFEST: ${MANIFEST_BESTAND} ontbreekt (beschrijving uk+nl en deelnemers) — verplicht voor nieuwe releases.`, ['deploy/REGELS-UITROLPAKKET.md §5']);
      else voeg('manifest', 'waarschuwing', 'Старий формат пакета: опис лише мовою оригіналу, без переліку ШІ-агентів і моделей. Встановлення дозволене.', 'Oud pakketformaat: beschrijving alleen in de oorspronkelijke taal, zonder lijst van AI-agenten en modellen. Installeren mag.');
    }

    // ---- 3b. commit (regel 3, shared/bron-commit.ts; root weigert met dezelfde regel): blokkeert bij ontbreken, waarschuwt bij «zonder git».
    if (bc.status === 'git') voeg('commit', 'ok', `Коміт ${bc.commit.slice(0, 12)} — випуск відтворюваний з git.`, `Commit ${bc.commit.slice(0, 12)} — de release is te herleiden tot git.`);
    else if (bc.status === 'zonder-git') voeg('commit', 'waarschuwing', `Пакет зібрано поза git (явно вказано): ${bc.reden}. Відтворити збірку з коміту не вийде.`, `Pakket buiten git gebouwd (uitdrukkelijk opgegeven): ${bc.reden}. De build is niet uit een commit te herhalen.`);
    else voeg('commit', 'fout', 'GEEN_BRON_COMMIT: у пакеті немає дійсного BRON-COMMIT (40-символьний git-коміт або «zonder-git:<причина>»). Сервер відхилить пакет — див. deploy/REGELS-UITROLPAKKET.md.', 'GEEN_BRON_COMMIT: het pakket heeft geen geldige BRON-COMMIT (40-tekens git-commit of «zonder-git:<reden>»). De server weigert het pakket — zie deploy/REGELS-UITROLPAKKET.md.', [bc.status === 'ontbreekt' ? 'BRON-COMMIT ontbreekt of is leeg' : 'BRON-COMMIT heeft een ongeldige vorm (bv. «unknown» of een korte hash)']);

    // TRACE-001: het dossier én de exacte TAR.GZ moeten echt op GitHub staan.
    // Niet het URL-veld uit het pakket ophalen: uitsluitend canonieke GitHub API-routes.
    if (ontwikkelArchiefVerplicht(inhoudVersie)) {
      const tekst = await bestaat(ONTWIKKELARCHIEF_BESTAND)
        ? await leesMeta(bron, ONTWIKKELARCHIEF_BESTAND, ONTWIKKELARCHIEF_MAX + 1) : null;
      if (!tekst) {
        voeg('ontwikkelarchief', 'fout',
          'GEEN_ONTWIKKELARCHIEF: у пакеті відсутнє обов’язкове посилання на історію розробки на GitHub.',
          'GEEN_ONTWIKKELARCHIEF: verplichte GitHub-ontwikkelherkomst ontbreekt.');
      } else {
        const archief = leesOntwikkelArchief(tekst, inhoudVersie, bc.commit);
        if (archief.fouten.length || !archief.ref || bc.status !== 'git') {
          voeg('ontwikkelarchief', 'fout',
            'ONTWIKKELARCHIEF_ONGELDIG: дані архіву розробки або BRON-COMMIT недійсні.',
            'ONTWIKKELARCHIEF_ONGELDIG: ontwikkeldossier of BRON-COMMIT is ongeldig.',
            archief.fouten);
        } else {
          const sha = await sha256VanBestand(pakket);
          const online = await (opties.archiefControle
            ? opties.archiefControle(archief.ref, sha)
            : controleerOntwikkelArchiefOnline(archief.ref, sha, { token: opties.archiefToken }));
          if (!online.ok) voeg('ontwikkelarchief', 'fout',
            `${online.code}: GitHub не підтвердив історію розробки й саме цей інсталяційний архів.`,
            `${online.code}: GitHub bevestigt het dossier en deze exacte tar.gz niet.`,
            [online.reden]);
          else {
            meta.ontwikkelArchiefUrl = archief.ref.url;
            voeg('ontwikkelarchief', 'ok',
              'GitHub: документ історії, коміт, гілку та SHA-256 точного пакета перевірено.',
              'GitHub: dossier, commit, tak en SHA-256 van het exacte pakket bevestigd.',
              [archief.ref.url, archief.ref.release]);
          }
        }
      }
    }

    // ---- 4. scripts (syntaxis)
    const alle = await alleBestanden(bron);
    const scripts = alle.filter((f) => /^deploy\/.*\.sh$/.test(f.replace(/\\/g, '/')));
    const kapot: string[] = [];
    for (const s of scripts.slice(0, 120)) {
      try { await run(await eerste(BASH), ['-n', path.join(bron, s)], { timeout: 10_000, env: { PATH: '/usr/bin:/bin' } }); }
      // g01-5: bash noemt het volledige pad in de tijdelijke werkmap — dat pad vervangen door de naam binnen het pakket.
      catch (e) { kapot.push(`${s}: ${zonderWerkpad(String((e as { stderr?: string }).stderr || (e as Error).message).split('\n')[0], werk, bron, s).slice(0, 120)}`); }
    }
    if (!(await bestaat('deploy/installeer-app.sh'))) voeg('scripts', 'fout', 'Немає deploy/installeer-app.sh.', 'deploy/installeer-app.sh ontbreekt.');
    else if (kapot.length) voeg('scripts', 'fout', `У ${kapot.length} скриптах синтаксична помилка — вони виконуються від root.`, `${kapot.length} script(s) hebben een syntaxisfout — ze draaien als root.`, kapot);
    else voeg('scripts', 'ok', `Синтаксис ${scripts.length} shell-скриптів у порядку (bash -n).`, `Syntaxis van ${scripts.length} shell-scripts in orde (bash -n).`);

    // ---- 5. bouwen
    const bouw: string[] = []; const bouwWaarschuwing: string[] = [];
    let pkg: { scripts?: Record<string, string>; dependencies?: Record<string, string> } | null = null;
    try { const b = await lees('package.json', 8 * 1024 * 1024); if (!b) throw new Error('ontbreekt'); pkg = JSON.parse(b.toString('utf8')); } catch { bouw.push('package.json ontbreekt of is geen geldige JSON'); }
    if (pkg && !pkg.scripts?.build) bouw.push('package.json heeft geen "build"-script');
    if (!(await bestaat('package-lock.json'))) bouw.push('package-lock.json ontbreekt (npm ci faalt)');
    for (const f of ['index.html', 'server/migrate.ts', 'scripts/build-server.mjs', 'backend/index.ts']) if (!(await bestaat(f))) bouw.push(`${f} ontbreekt`);
    if (!(await bestaat('vite.config.ts')) && !(await bestaat('vite.config.js')) && !(await bestaat('vite.config.mjs'))) bouwWaarschuwing.push('geen vite-configuratie gevonden');
    if (bouw.length) voeg('bouwen', 'fout', 'Бракує файлів, потрібних для збірки на сервері.', 'Bestanden die de build op de server nodig heeft, ontbreken.', bouw);
    else if (bouwWaarschuwing.length) voeg('bouwen', 'waarschuwing', 'Збірка: є зауваження.', 'Bouwen: er zijn opmerkingen.', bouwWaarschuwing);
    else voeg('bouwen', 'ok', 'Усі файли для збірки на місці (package.json, lock-файл, vite, серверна збірка).', 'Alle bouwbestanden aanwezig (package.json, lockbestand, vite, serverbundel).');

    // ---- 6. migraties
    const mig = alle.map((f) => f.replace(/\\/g, '/')).filter((f) => /^migrations\/[^/]+\.sql$/.test(f)).sort();
    const migFout: string[] = []; const migNamen: string[] = []; const nummers = new Set<string>(); const nieuw: string[] = []; const risico: string[] = []; const nieuwSha = new Map<string, string>();
    for (const f of mig) {
      const naam = path.basename(f, '.sql');
      if (!/^\d{4}_[a-z0-9_]+$/.test(naam) && naam !== 'rechten') { if (naam !== 'rechten') migFout.push(`ongeldige naam: ${naam}`); continue; }
      if (naam === 'rechten') continue;
      migNamen.push(naam);
      const nr = naam.slice(0, 4);
      if (nummers.has(nr)) migFout.push(`dubbel nummer ${nr}`); nummers.add(nr);
      const toegepast = opties.toegepasteMigraties;
      if (toegepast && !toegepast.has(naam)) {
        nieuw.push(naam);
        const inhoud = await lees(f, 64 * 1024 * 1024);
        if (!inhoud) { migFout.push(`niet leesbaar als gewoon bestand: ${naam}`); continue; }
        const ruw = inhoud.toString('utf8');
        nieuwSha.set(naam, createHash('sha256').update(ruw, 'utf8').digest('hex'));
        const sql = ruw.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const [re, , nl] of SQL_RISICO) if (re.test(sql)) risico.push(`${naam}: ${nl}`);
      }
    }
    const { echtOntbrekend, historischHernoemd } = beoordeelToegepasteMigraties(migNamen, opties.toegepasteMigraties);
    for (const ontbr of echtOntbrekend) migFout.push(`MIGRATIES_ONTBREKEN: ${ontbr}`);
    // ---- 6b. UITROL-001: binding met de proef vóór het uploaden. De browser las de SQL en root probeerde die op een kopie van het schema;
    // hier moet de SQL in het ÉCHT ontvangen archief byte voor byte dezelfde zijn (SHA-256 per migratie). Anders: fout → nooit goedkeurbaar.
    // Прив’язка до проби: SQL нових міграцій у завантаженому архіві має збігатися з перевіреним; інакше — відхилення.
    if (opties.toegepasteMigraties) {
      const proef = opties.proef;
      if (!nieuw.length) voeg('migratie-proef', 'ok', 'Нових міграцій немає — проба на копії схеми не потрібна.', 'Geen nieuwe migraties — een proef op een kopie van het schema is niet nodig.');
      else if (!proef) voeg('migratie-proef', 'waarschuwing', `Пробу нових міграцій (${nieuw.length}) на копії схеми до завантаження не виконано або не знайдено (інший пристрій, застаріла сесія). Root повторить її першим кроком установлення.`, `De proef van de nieuwe migraties (${nieuw.length}) op een kopie van het schema is vóór het uploaden niet uitgevoerd of niet gevonden (ander apparaat, verlopen sessie). Root herhaalt haar als eerste installatiestap.`);
      else {
        const afwijkend = nieuw.filter((n) => proef.sqlSha256.get(n) !== nieuwSha.get(n));
        if (afwijkend.length) voeg('migratie-proef', 'fout', `SQL міграцій у завантаженому архіві НЕ збігається з перевіреним пробою (${afwijkend.join(', ')}). Архів змінено після перевірки або підмінено — пакет відхилено.`, `De SQL van de migraties in het geüploade archief komt NIET overeen met wat de proef controleerde (${afwijkend.join(', ')}). Het archief is na de controle gewijzigd of verwisseld — pakket geweigerd.`, afwijkend.map((n) => `${n}: proef ${(proef.sqlSha256.get(n) || '—').slice(0, 16)}… ≠ archief ${(nieuwSha.get(n) || '—').slice(0, 16)}…`));
        else if (!proef.ok) voeg('migratie-proef', 'fout', `Проба нових міграцій на копії схеми не пройшла (${proef.status}); пакет із такими міграціями не можна схвалити.`, `De proef van de nieuwe migraties op een kopie van het schema mislukte (${proef.status}); een pakket met deze migraties kan niet worden goedgekeurd.`);
        else voeg('migratie-proef', 'ok', `Проба пройдена й прив’язана до цього архіву: SQL ${nieuw.length} нових міграцій збігається з перевіреним (SHA-256), проба ${proef.id.slice(0, 8)}.`, `Proef geslaagd en aan dit archief gebonden: de SQL van ${nieuw.length} nieuwe migraties is gelijk aan de gecontroleerde (SHA-256), proef ${proef.id.slice(0, 8)}.`);
      }
    }
    if (migFout.length) {
      const heeftOntbrekend = echtOntbrekend.length > 0;
      voeg(
        'migraties',
        'fout',
        heeftOntbrekend
          ? `MIGRATIES_ONTBREKEN: в архіві відсутні вже застосовані на сервері міграції (${echtOntbrekend.slice(0, 4).join(', ')}) — пакунок відхилено для захисту від перезапису новіших змін.`
          : 'Міграції: помилка в нумерації/назвах.',
        heeftOntbrekend
          ? `MIGRATIES_ONTBREKEN: al op de server toegepaste migraties ontbreken in het archief (${echtOntbrekend.slice(0, 4).join(', ')}) — pakket geweigerd om overschrijven van nieuwere wijzigingen te voorkomen.`
          : 'Migraties: fout in nummering/namen.',
        migFout,
      );
    } else if (risico.length) voeg('migraties', 'waarschuwing', `Нові міграції містять руйнівні команди (${risico.length}). Міграції при відкаті НЕ відкочуються — стара версія коду має працювати з новою схемою.`, `Nieuwe migraties bevatten ingrijpende opdrachten (${risico.length}). Migraties worden bij terugdraaien NIET teruggedraaid — de oude code moet met het nieuwe schema werken.`, risico);
    else {
      const hernoemdUk = historischHernoemd.length ? `; підтверджено історичні перейменування: ${historischHernoemd.length}` : '';
      const hernoemdNl = historischHernoemd.length ? `; historische hernoemingen bevestigd: ${historischHernoemd.length}` : '';
      voeg(
        'migraties',
        'ok',
        opties.toegepasteMigraties ? `Міграції в порядку: ${mig.length} усього, ${nieuw.length} нових${nieuw.length ? ` (${nieuw.join(', ')})` : ''}${hernoemdUk}; руйнівних команд немає.` : `Міграції в порядку: ${mig.length} файлів.`,
        opties.toegepasteMigraties ? `Migraties in orde: ${mig.length} in totaal, ${nieuw.length} nieuw${nieuw.length ? ` (${nieuw.join(', ')})` : ''}${hernoemdNl}; geen ingrijpende opdrachten.` : `Migraties in orde: ${mig.length} bestanden.`,
        historischHernoemd.length ? historischHernoemd.map((h) => `${h.oud} → ${h.nieuw}`) : undefined,
      );
    }

    // ---- 7. geheimen (alleen namen)
    const gevonden: string[] = [];
    for (const f of alle) {
      const n = f.replace(/\\/g, '/');
      if (/(^|\/)\.env(\.|$)/.test(n) && !/\.(example|sample|dist)$/.test(n)) gevonden.push(`${n}: .env-bestand`);
      if (/\.(pem|key|p12|pfx)$/i.test(n) && !/^tests?\//.test(n)) gevonden.push(`${n}: sleutelbestand`);
    }
    for (const f of alle.filter((x) => /\.(ts|tsx|js|mjs|json|sh|md|txt|ya?ml|env|sql)$/i.test(x) && !/(^|\/)package-lock\.json$/.test(x)).slice(0, 4000)) {
      if (gevonden.length > 20) break;
      const st = await lstat(path.join(bron, f)).catch(() => null); if (!st || !st.isFile() || st.size > 2 * 1024 * 1024) continue;
      const t = (await lees(f, 2 * 1024 * 1024))?.toString('utf8') ?? '';
      for (const [re, soort] of GEHEIM_PATRONEN) if (re.test(t)) { gevonden.push(`${f.replace(/\\/g, '/')}: ${soort}`); break; }
    }
    if (gevonden.length) voeg('geheimen', 'waarschuwing', 'Схоже, у пакеті є секрети (ключі/токени/.env). Перевірте перед схваленням.', 'Het pakket lijkt geheimen te bevatten (sleutels/tokens/.env). Controleer vóór het goedkeuren.', gevonden);
    else voeg('geheimen', 'ok', 'Явних секретів (приватні ключі, токени, .env) не знайдено.', 'Geen duidelijke geheimen (privésleutels, tokens, .env) gevonden.');

    // ---- 8. tests van de voorbereider (informatief): uit het voorstel (MCP-weg), en anders uit het bestand TESTRESULTATEN
    // in het pakket zelf (JSON {geslaagd, mislukt, samenvatting}; deploy/uitrol/maak-voorstelpakket.sh schrijft het mee).
    // Zo draagt ook een pakket dat als los .tar.gz via de wizard of SSH binnenkomt zijn eigen testuitslag — tot 29.10.2026
    // stuurde de wizard altijd «tests: {}» en stond hier bij elke release «де voorbereider meldde geen testresultaten».
    // UI-010 (eis van de eigenaar): niet alleen «61 mislukt», maar WELKE bestanden en of ze ook op de basis faalden.
    // De lijst komt altijd uit TESTRESULTATEN in het pakket (ook als het voorstel alleen getallen meegaf).
    const uitPakket = leesTestresultaten(await leesMeta(bron, 'TESTRESULTATEN', TESTRESULTATEN_MAX));
    const voorstel = opties.tests && (opties.tests.geslaagd != null || opties.tests.mislukt != null) ? { geslaagd: opties.tests.geslaagd ?? null, mislukt: opties.tests.mislukt ?? null } : null;
    const tests = voorstel ? { ...voorstel, uitPakket: false } : uitPakket ? { geslaagd: uitPakket.geslaagd, mislukt: uitPakket.mislukt, uitPakket: true } : null;
    const bronTekst = tests?.uitPakket ? [' (файл TESTRESULTATEN у пакеті)', ' (bestand TESTRESULTATEN in het pakket)'] : ['', ''];
    const det = uitPakket ? testDetails(uitPakket) : [];
    const bekend = uitPakket?.falend ? uitPakket.falend.filter((f) => f.ookOpBasis === true).length : 0;
    const nieuwF = uitPakket?.falend ? uitPakket.falend.filter((f) => f.ookOpBasis === false).length : 0;
    const basis = uitPakket?.basis;
    const basisTekst = basis ? [` На базовій версії ${basis.versie || '—'}: пройдено ${basis.geslaagd ?? '—'}, не пройдено ${basis.mislukt ?? '—'}.`, ` Op de basisversie ${basis.versie || '—'}: ${basis.geslaagd ?? '—'} geslaagd, ${basis.mislukt ?? '—'} mislukt.`] : ['', ''];
    const uitleg = uitPakket?.uitleg ? [` ${uitPakket.uitleg.uk || uitPakket.uitleg.nl}`, ` ${uitPakket.uitleg.nl || uitPakket.uitleg.uk}`] : ['', ''];
    const detailTekst = !uitPakket?.falend ? [' Деталі (які саме тести) недоступні в цьому пакеті.', ' Details (welke tests) zijn niet beschikbaar in dit pakket.']
      : [` Файлів із помилками: ${uitPakket.falend.length} — ті самі й на базовій версії: ${bekend}, нові: ${nieuwF}.`, ` Bestanden met fouten: ${uitPakket.falend.length} — ook op de basis: ${bekend}, nieuw: ${nieuwF}.`];
    if (tests && tests.mislukt != null && tests.mislukt > 0) voeg('tests', 'waarschuwing', `Пройдено ${tests.geslaagd ?? '—'}, не пройдено ${tests.mislukt}${bronTekst[0]}.${detailTekst[0]}${basisTekst[0]}${uitleg[0]}`, `${tests.geslaagd ?? '—'} geslaagd, ${tests.mislukt} mislukt${bronTekst[1]}.${detailTekst[1]}${basisTekst[1]}${uitleg[1]}`, det);
    else if (tests && tests.geslaagd != null && tests.geslaagd > 0) voeg('tests', 'ok', `Підготовник повідомив: ${tests.geslaagd} тестів пройдено${bronTekst[0]}.`, `De voorbereider meldde: ${tests.geslaagd} tests geslaagd${bronTekst[1]}.`);
    else voeg('tests', 'waarschuwing', 'Підготовник не повідомив результатів тестів (ані в пропозиції, ані файлом TESTRESULTATEN у пакеті).', 'De voorbereider meldde geen testresultaten (niet in het voorstel en niet via TESTRESULTATEN in het pakket).');
  } catch (e) {
    // g01-5: de tekst van de uitzondering (paden in de tijdelijke map, opdrachtregels) alleen naar het logboek van de dienst.
    logIntern('voorcontrole', e);
    const code = /^[A-Z][A-Z0-9_]{1,31}$/.test(String((e as NodeJS.ErrnoException)?.code ?? '')) ? String((e as NodeJS.ErrnoException).code) : 'ONBEKEND';
    voeg('voorcontrole', 'fout', 'Перевірку пакета не вдалося виконати.', 'De voorcontrole kon niet worden uitgevoerd.', [`внутрішня помилка перевірки (код ${code}) · interne fout van de controle (code ${code})`]);
  } finally {
    // g01-1: opruimen dat niet afhangt van de rechten in het pakket en een mislukking niet meer stil inslikt.
    if (werk) await _ruimWerkmapOp(werk);
  }
  return afronden(controles, meta);
}

function afronden(controles: Controle[], meta: PakketMeta): VoorcontroleUitkomst {
  const fouten = controles.filter((c) => c.niveau === 'fout').length;
  const waarschuwingen = controles.filter((c) => c.niveau === 'waarschuwing').length;
  return { resultaat: { versie: 1, tijd: new Date().toISOString(), ok: fouten === 0, fouten, waarschuwingen, controles }, meta };
}
