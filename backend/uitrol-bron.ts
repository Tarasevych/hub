// Eén bron van waarheid voor «wat draait er nu en hoe eindigde de laatste installatie» (audit 18.10.2026, punt 7).
//
// Het probleem: de stand stond op vier plekken die elk iets anders konden zeggen —
//   status.json (laatste stand van root; «versie» was de pakketversie bij passkey, maar de MAPNAAM bij SSH),
//   gebeurtenissen.jsonl (uitkomsten), app.uitrol_runs (geschiedenis), app.uitrol_voorstellen (passkey-voorstellen),
//   plus de releasemap (/srv/mijn-ruimte/current, VORIGE), /api/version (wat het draaiende proces zelf is) en de nazorg-bewaker.
// De modi opdracht/nazorg (terugdraaien via het dashboard of de bewaker) schreven helemaal niets.
//
// Nu: huidigeStand() leest ALLE bronnen, normaliseert (versie = altijd de pakketversie «JJJJMMDD-UUMMSS» uit UITROL-VERSIE;
// release = de mapnaam, apart), kiest één hoofdbron (standaard app.uitrol_runs — die wordt uit root-stappen, gebeurtenissen en
// voorstellen gevuld en overleeft een herstart), bewaart de samengevoegde stand in app.uitrol_stand (migratie 0062) en geeft de
// lijst afwijkingen terug: per bron welk veld afwijkt, wat er staat, wat de hoofdbron zegt en wat dat betekent (uk/nl).
// De andere bronnen worden nooit meer los gebruikt voor de UI of de MCP-tools; ze blijven zichtbaar op de kaart «Джерела статусу».
import { readFile, readlink, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { error, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { releaseInfo } from './uitgave-info';
import { leesOpdrachtResultaat, parseRootGebeurtenissen, type RootGebeurtenis } from './server-beheer';
import { runsSynchroniseren } from './uitrol-runs';

const VERSIE = /^\d{8}-\d{6}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
const appRoot = () => process.env.UITROL_APP_ROOT || '/srv/mijn-ruimte';
const sys = () => getPool('systeem');
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, n);
const iso = (v: unknown) => { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? new Date(t).toISOString() : ''; };

export type BronId = 'runs' | 'status' | 'events' | 'voorstellen' | 'releasemap' | 'vorige' | 'versie' | 'nazorg' | 'github' | 'backups';
export const HOOFDBRONNEN = ['runs', 'status', 'releasemap', 'versie'] as const;
export type Hoofdbron = (typeof HOOFDBRONNEN)[number];
export type Toestand = 'ok' | 'afwijking' | 'oud' | 'onbekend' | 'bezig';
export type BronStand = {
  id: BronId; beschikbaar: boolean; versie: string; release: string; commit: string; staat: string; methode: string; tijd: string;
  leeftijdSec: number | null; toestand: Toestand; detail: Record<string, unknown>; uk: string; nl: string;
};
export type Afwijking = { bron: BronId; veld: 'versie' | 'release' | 'staat' | 'commit'; waarde: string; verwacht: string; uk: string; nl: string; ernst: 'warn' | 'error' };
export type Stand = {
  versie: string; release: string; commit: string; staat: string; methode: string; tijd: string; hoofdbron: Hoofdbron; gebruikteBron: BronId; /** Bron van «versie» (wat echt draait: releasemap/current, anders het siteproces, anders de hoofdbron). Een siteproces dat ouder is dan current staat als aparte fout in de afwijkingen (niet herstart). */ versieBron: BronId; intervalSec: number;
  bronnen: BronStand[]; afwijkingen: Afwijking[]; kaart: Kaart; bijgewerkt: string;
};

// ------------------------------------------------------------------------------------------------ de kaart (wie voedt wie)
export type Knoop = { id: BronId | 'root' | 'installer' | 'app' | 'ui' | 'mcp'; uk: string; nl: string; soort: 'bron' | 'proces' | 'uit'; pad?: string };
export type Rand = { van: Knoop['id']; naar: Knoop['id']; uk: string; nl: string };
export type Kaart = { knopen: Knoop[]; randen: Rand[] };
/** Vaste structuur: de knopen zijn de echte modules/bestanden, de pijlen de echte gegevensstromen (zie de commentaren bovenaan uitrol-runs.ts en de scripts in deploy/). */
export const KAART: Kaart = {
  knopen: [
    { id: 'root', uk: 'Root-скрипт uitrol', nl: 'Root-script uitrol', soort: 'proces', pad: 'deploy/uitrol/mijn-ruimte-uitrol.sh' },
    { id: 'installer', uk: 'Інсталятор', nl: 'Installer', soort: 'proces', pad: 'deploy/installeer-app.sh' },
    { id: 'nazorg', uk: 'Наглядач (nazorg)', nl: 'Nazorg-bewaker', soort: 'bron', pad: 'deploy/uitrol/mijn-ruimte-nazorg.sh' },
    { id: 'status', uk: 'status.json', nl: 'status.json', soort: 'bron', pad: '/var/lib/mijn-ruimte-uitrol-status/status.json' },
    { id: 'events', uk: 'Події (gebeurtenissen.jsonl)', nl: 'Gebeurtenissen (gebeurtenissen.jsonl)', soort: 'bron', pad: '/var/lib/mijn-ruimte-uitrol-status/gebeurtenissen.jsonl' },
    { id: 'releasemap', uk: 'Тека релізів (current)', nl: 'Releasemap (current)', soort: 'bron', pad: '/srv/mijn-ruimte/current' },
    { id: 'vorige', uk: 'Попередній (VORIGE)', nl: 'Vorige (VORIGE)', soort: 'bron', pad: '/srv/mijn-ruimte/VORIGE' },
    { id: 'voorstellen', uk: 'Пропозиції (uitrol_voorstellen)', nl: 'Voorstellen (uitrol_voorstellen)', soort: 'bron', pad: 'app.uitrol_voorstellen' },
    { id: 'runs', uk: 'Історія запусків (uitrol_runs)', nl: 'Runs (uitrol_runs)', soort: 'bron', pad: 'app.uitrol_runs' },
    { id: 'versie', uk: 'Процес сайту (/api/version)', nl: 'Siteproces (/api/version)', soort: 'bron', pad: 'backend/uitgave-info.ts' },
    { id: 'github', uk: 'GitHub (теги)', nl: 'GitHub (tags)', soort: 'bron', pad: 'laatste-tag' },
    { id: 'backups', uk: 'Резервні копії', nl: 'Back-ups', soort: 'bron', pad: 'mijn-ruimte-backup.timer' },
    { id: 'app', uk: 'Сервер сайту (збір)', nl: 'Siteserver (samenvoeging)', soort: 'proces', pad: 'backend/uitrol-bron.ts' },
    { id: 'ui', uk: 'Сторінка «Оновлення»', nl: 'Pagina «Оновлення»', soort: 'uit', pad: 'src/uitrol' },
    { id: 'mcp', uk: 'MCP-інструменти', nl: 'MCP-tools', soort: 'uit', pad: 'get_live_release' },
  ],
  randen: [
    { van: 'root', naar: 'status', uk: 'останній стан', nl: 'laatste stand' },
    { van: 'root', naar: 'events', uk: 'підсумок кожного запуску', nl: 'uitkomst van elke run' },
    { van: 'root', naar: 'runs', uk: 'кроки (stappen.jsonl) і журнал', nl: 'stappen (stappen.jsonl) en logboek' },
    { van: 'root', naar: 'installer', uk: 'запускає', nl: 'start' },
    { van: 'installer', naar: 'releasemap', uk: 'нова тека + current', nl: 'nieuwe map + current' },
    { van: 'installer', naar: 'vorige', uk: 'записує попередню', nl: 'schrijft de vorige' },
    { van: 'installer', naar: 'events', uk: 'SSH / opdracht / nazorg', nl: 'SSH / opdracht / nazorg' },
    { van: 'installer', naar: 'status', uk: 'SSH / opdracht / nazorg', nl: 'SSH / opdracht / nazorg' },
    { van: 'installer', naar: 'nazorg', uk: 'маркер 30 хв', nl: 'markering 30 min' },
    { van: 'nazorg', naar: 'installer', uk: 'відкат при збої', nl: 'terugdraaien bij storing' },
    { van: 'nazorg', naar: 'events', uk: 'NAZORG_*', nl: 'NAZORG_*' },
    { van: 'releasemap', naar: 'versie', uk: 'файли релізу при старті', nl: 'releasebestanden bij start' },
    { van: 'events', naar: 'runs', uk: 'підсумки без кроків', nl: 'uitkomsten zonder stappen' },
    { van: 'voorstellen', naar: 'runs', uk: 'sha256, коміт, хто', nl: 'sha256, commit, wie' },
    { van: 'runs', naar: 'voorstellen', uk: 'результат схваленого', nl: 'uitkomst van het goedgekeurde' },
    { van: 'runs', naar: 'app', uk: 'основне джерело', nl: 'hoofdbron' },
    { van: 'status', naar: 'app', uk: 'порівняння', nl: 'vergelijking' },
    { van: 'events', naar: 'app', uk: 'порівняння', nl: 'vergelijking' },
    { van: 'releasemap', naar: 'app', uk: 'порівняння', nl: 'vergelijking' },
    { van: 'vorige', naar: 'app', uk: 'ціль відкату', nl: 'doel van terugdraaien' },
    { van: 'versie', naar: 'app', uk: 'порівняння', nl: 'vergelijking' },
    { van: 'voorstellen', naar: 'app', uk: 'порівняння', nl: 'vergelijking' },
    { van: 'nazorg', naar: 'app', uk: 'стан наглядача', nl: 'stand van de bewaker' },
    { van: 'github', naar: 'app', uk: 'останній тег', nl: 'laatste tag' },
    { van: 'backups', naar: 'app', uk: 'стан таймера', nl: 'stand van de timer' },
    { van: 'app', naar: 'ui', uk: 'одна стан + розбіжності', nl: 'één stand + afwijkingen' },
    { van: 'app', naar: 'mcp', uk: 'ті самі значення', nl: 'dezelfde waarden' },
  ],
};

// ------------------------------------------------------------------------------------------------ bronnen lezen
const leeftijd = (tijd: string, nu: number) => (tijd ? Math.max(0, Math.round((nu - Date.parse(tijd)) / 1000)) : null);
const leeg = (id: BronId, uk: string, nl: string): BronStand => ({ id, beschikbaar: false, versie: '', release: '', commit: '', staat: '', methode: '', tijd: '', leeftijdSec: null, toestand: 'onbekend', detail: {}, uk, nl });

const leesBestand = async (p: string, n = 4000) => { try { return (await readFile(p, 'utf8')).slice(0, n); } catch { return ''; } };
const leesKort = async (p: string, re: RegExp, n = 64) => { const v = (await leesBestand(p, n)).trim(); return re.test(v) ? v : ''; };

/** Pakketversie en commit van een releasemap (de twee bestanden die de installer daar neerzet). */
async function releaseMapInfo(map: string) {
  return { versie: await leesKort(path.join(map, 'UITROL-VERSIE'), VERSIE, 32), commit: await leesKort(path.join(map, 'RELEASE-COMMIT'), COMMIT, 64) || await leesKort(path.join(map, 'BRON-COMMIT'), COMMIT, 64) };
}

async function bronStatus(nu: number): Promise<BronStand> {
  const uit = leeg('status', 'Останній стан, який записав root (passkey/підпис/gitops) або інсталятор (SSH, opdracht, nazorg). Лише останній запис — історії тут немає.', 'Laatste stand die root (passkey/handtekening/gitops) of de installer (SSH, opdracht, nazorg) schreef. Alleen de laatste regel — geen geschiedenis.');
  let st: Record<string, unknown>;
  try { st = JSON.parse(await leesBestand(path.join(statusDir(), 'status.json'))) as Record<string, unknown>; } catch { return uit; }
  if (!st || typeof st !== 'object') return uit;
  const methode = tekst(st.methode, 20);
  let versie = VERSIE.test(String(st.versie || '')) ? String(st.versie) : '';
  let release = VERSIE.test(String(st.release || '')) ? String(st.release) : '';
  // Oud formaat (vóór 0062): bij SSH stond de MAPNAAM in «versie». Herkenbaar: er is geen «release»-veld en de map bestaat.
  let oudFormaat = false;
  if (!release && versie && methode === 'ssh') {
    const info = await releaseMapInfo(path.join(appRoot(), 'releases', versie));
    if (info.versie) { release = versie; versie = info.versie; oudFormaat = true; }
  }
  const tijd = iso(st.tijd);
  return { ...uit, beschikbaar: true, versie, release, commit: '', staat: tekst(st.staat, 20), methode, tijd, leeftijdSec: leeftijd(tijd, nu), toestand: 'ok',
    detail: { code: tekst(st.code, 40), oudFormaat, uk: tekst(st.uk, 300), nl: tekst(st.nl, 300) } };
}

const EINDCODES = new Set(['OK', 'SSH_OK', 'SSH_TERUG', 'TERUG_OK', 'NAZORG_TERUGGEDRAAID', 'INSTALLATIE_MISLUKT', 'NAZORG_MISLUKT', 'TERUG_MISLUKT']);
async function bronEvents(nu: number): Promise<BronStand> {
  const uit = leeg('events', 'Підсумки запусків (останні 500 рядків): успіх, відмова, відкат. Джерело для історії без кроків.', 'Uitkomsten van runs (laatste 500 regels): geslaagd, geweigerd, teruggedraaid. Bron voor geschiedenis zonder stappen.');
  const raw = await leesBestand(path.join(statusDir(), 'gebeurtenissen.jsonl'), 2_000_000);
  if (!raw) return uit;
  const alle = parseRootGebeurtenissen(raw).filter((g) => g.bron === 'uitrol');
  const laatste: RootGebeurtenis | undefined = alle.filter((g) => EINDCODES.has(g.code)).pop();
  if (!laatste) return { ...uit, beschikbaar: true, detail: { regels: alle.length } };
  const versie = laatste.pakket || (VERSIE.test(laatste.tag || '') && laatste.herkomst !== 'ssh' && !laatste.release ? String(laatste.tag) : '');
  const staat = laatste.code === 'INSTALLATIE_MISLUKT' || laatste.code === 'NAZORG_MISLUKT' || laatste.code === 'TERUG_MISLUKT' ? 'mislukt' : 'klaar';
  const tijd = iso(laatste.tijd);
  return { ...uit, beschikbaar: true, versie, release: laatste.release || '', commit: laatste.commit || '', staat, methode: laatste.herkomst || '', tijd, leeftijdSec: leeftijd(tijd, nu), toestand: 'ok',
    detail: { code: laatste.code, regels: alle.length, uk: laatste.uk, nl: laatste.nl } };
}

async function bronRuns(nu: number): Promise<BronStand> {
  const uit = leeg('runs', 'Історія в базі: кожен запуск із кроками, журналом, підсумком, sha256 і хто готував/схвалив. Переживає перезапуск і SSH-встановлення. Основне джерело за замовчуванням.', 'Geschiedenis in de database: elke run met stappen, logboek, uitkomst, sha256 en wie voorbereidde/goedkeurde. Overleeft een herstart en een SSH-installatie. Standaard de hoofdbron.');
  try {
    const bezig = (await sys().query(`SELECT id, versie, release, staat, methode, gestart_op FROM app.uitrol_runs WHERE staat = 'bezig' ORDER BY gestart_op DESC LIMIT 1`)).rows[0];
    const laatsteKlaar = (await sys().query(`SELECT id, versie, release, staat, methode, code, bron_commit, geeindigd_op, gestart_op FROM app.uitrol_runs WHERE staat = 'klaar' ORDER BY geeindigd_op DESC NULLS LAST, gestart_op DESC LIMIT 1`)).rows[0];
    const laatste = (await sys().query(`SELECT id, versie, release, staat, methode, code, geeindigd_op, gestart_op FROM app.uitrol_runs ORDER BY gestart_op DESC, id DESC LIMIT 1`)).rows[0];
    const n = Number((await sys().query('SELECT count(*)::int AS n FROM app.uitrol_runs')).rows[0]?.n || 0);
    if (!laatste) return { ...uit, beschikbaar: true, detail: { runs: 0 } };
    const basis = laatsteKlaar || laatste;
    const tijd = iso(basis.geeindigd_op || basis.gestart_op);
    return { ...uit, beschikbaar: true, versie: String(basis.versie || ''), release: String(basis.release || ''), commit: String(basis.bron_commit || ''), staat: bezig ? 'bezig' : String(laatste.staat),
      methode: String(basis.methode || ''), tijd, leeftijdSec: leeftijd(tijd, nu), toestand: bezig ? 'bezig' : 'ok',
      detail: { runs: n, laatsteRun: String(laatste.id), laatsteStaat: String(laatste.staat), laatsteCode: String(laatste.code || ''), laatsteKlaarRun: laatsteKlaar ? String(laatsteKlaar.id) : '', bezigRun: bezig ? String(bezig.id) : '', bezigVersie: bezig ? String(bezig.versie) : '' } };
  } catch (err) { return { ...uit, detail: { fout: (err as Error).message.slice(0, 200) } }; }
}

async function bronVoorstellen(nu: number): Promise<BronStand> {
  const uit = leeg('voorstellen', 'Пропозиції, завантажені агентом або з телефона, зі статусом схвалення. Лише passkey-шлях; SSH-встановлення тут не зʼявляються.', 'Voorstellen die een agent of de telefoon uploadde, met goedkeuringsstatus. Alleen de passkey-weg; SSH-installaties staan hier niet.');
  try {
    const laatste = (await sys().query(`SELECT id, versie, status, bron_commit, bijgewerkt_op FROM app.uitrol_voorstellen WHERE status = 'geinstalleerd' ORDER BY bijgewerkt_op DESC LIMIT 1`)).rows[0];
    const open = Number((await sys().query(`SELECT count(*)::int AS n FROM app.uitrol_voorstellen WHERE status IN ('goedgekeurd', 'wacht-op-goedkeuring', 'uploaden')`)).rows[0]?.n || 0);
    if (!laatste) return { ...uit, beschikbaar: true, detail: { open } };
    const tijd = iso(laatste.bijgewerkt_op);
    return { ...uit, beschikbaar: true, versie: String(laatste.versie || ''), release: '', commit: String(laatste.bron_commit || ''), staat: 'klaar', methode: 'passkey', tijd, leeftijdSec: leeftijd(tijd, nu), toestand: 'ok', detail: { id: String(laatste.id), open } };
  } catch (err) { return { ...uit, detail: { fout: (err as Error).message.slice(0, 200) } }; }
}

async function bronReleasemap(nu: number): Promise<BronStand> {
  const uit = leeg('releasemap', 'Що фактично активоване на диску: current → тека релізу з UITROL-VERSIE і RELEASE-COMMIT. Якщо це відрізняється від історії — встановлення пройшло поза відомими шляхами.', 'Wat werkelijk op schijf actief is: current → releasemap met UITROL-VERSIE en RELEASE-COMMIT. Wijkt dit af van de geschiedenis, dan ging een installatie buiten de bekende wegen om.');
  const huidig = path.join(appRoot(), 'current');
  let doel = '';
  try { doel = await realpath(huidig); } catch { try { doel = path.resolve(path.dirname(huidig), await readlink(huidig)); } catch { return uit; } }
  const release = VERSIE.test(path.basename(doel)) ? path.basename(doel) : '';
  const info = await releaseMapInfo(doel);
  let tijd = '';
  try { tijd = (await stat(doel)).mtime.toISOString(); } catch { tijd = ''; }
  return { ...uit, beschikbaar: true, versie: info.versie, release, commit: info.commit, staat: 'klaar', methode: '', tijd, leeftijdSec: leeftijd(tijd, nu), toestand: 'ok', detail: { pad: doel } };
}

async function bronVorige(nu: number): Promise<BronStand> {
  const uit = leeg('vorige', 'Куди повернеться відкат (UI, SSH або наглядач). Записує інсталятор при активації.', 'Waarnaar terugdraaien gaat (UI, SSH of bewaker). De installer schrijft dit bij activeren.');
  const pad = (await leesBestand(path.join(appRoot(), 'VORIGE'), 400)).trim();
  if (!pad) return uit;
  const release = VERSIE.test(path.basename(pad)) ? path.basename(pad) : '';
  const info = await releaseMapInfo(pad);
  let tijd = ''; let bestaat = true;
  try { tijd = (await stat(pad)).mtime.toISOString(); } catch { bestaat = false; }
  return { ...uit, beschikbaar: true, versie: info.versie, release, commit: info.commit, staat: bestaat ? 'klaar' : 'ontbreekt', methode: '', tijd, leeftijdSec: leeftijd(tijd, nu), toestand: bestaat ? 'ok' : 'afwijking', detail: { pad, bestaat } };
}

function bronVersie(nu: number): BronStand {
  const uit = leeg('versie', 'Що каже сам процес сайту (/api/version): файли релізу, прочитані при старті. Якщо відрізняється від теки релізів — сайт ще не перезапущено після встановлення.', 'Wat het siteproces zelf zegt (/api/version): releasebestanden gelezen bij de start. Wijkt dit af van de releasemap, dan is de site na de installatie nog niet herstart.');
  const r = releaseInfo();
  const wortel = path.resolve(process.env.DIST_DIR || path.join(process.cwd(), 'dist'), '..');
  const release = VERSIE.test(path.basename(wortel)) ? path.basename(wortel) : '';
  const start = new Date(nu - Math.round(process.uptime() * 1000)).toISOString();
  return { ...uit, beschikbaar: true, versie: r.versie && VERSIE.test(r.versie) ? r.versie : '', release, commit: r.releaseCommit && COMMIT.test(r.releaseCommit) ? r.releaseCommit : (r.commit && COMMIT.test(r.commit) ? r.commit : ''), staat: 'klaar', methode: '', tijd: start, leeftijdSec: leeftijd(start, nu), toestand: 'ok',
    detail: { auteur: r.auteur || '', agent: r.agent || '', commitRuw: r.commit || '', gestart: start } };
}

async function bronNazorg(nu: number): Promise<BronStand> {
  const uit = leeg('nazorg', 'Наглядач після встановлення (30 хв): відкочує, якщо сайт тричі не відповідає. Маркер лежить у root-теці; сайт бачить його лише через diagnose.json.', 'Bewaker na de installatie (30 min): draait terug als de site driemaal niet antwoordt. De markering staat in een root-map; de site ziet hem alleen via diagnose.json.');
  let d: Record<string, unknown>;
  try { d = JSON.parse(await leesBestand(path.join(statusDir(), 'diagnose.json'), 400_000)) as Record<string, unknown>; } catch { return uit; }
  const nz = d && typeof d.nazorg === 'object' && d.nazorg ? (d.nazorg as Record<string, unknown>) : null;
  const tijd = iso(d?.tijd);
  if (!nz) return { ...uit, beschikbaar: false, tijd, leeftijdSec: leeftijd(tijd, nu), detail: { reden: 'diagnose.json zonder nazorg-blok (ouder root-script)' } };
  const actief = !!nz.actief;
  const release = VERSIE.test(String(nz.release || '')) ? String(nz.release) : '';
  const vorige = VERSIE.test(String(nz.vorige || '')) ? String(nz.vorige) : '';
  return { ...uit, beschikbaar: true, versie: '', release, commit: '', staat: actief ? 'bewaakt' : 'rust', methode: 'nazorg', tijd, leeftijdSec: leeftijd(tijd, nu), toestand: 'ok',
    detail: { actief, vorige, tot: iso(nz.tot), fouten: Number(nz.fouten || 0) } };
}

async function bronOpdracht(nu: number): Promise<{ github: BronStand; backups: BronStand }> {
  const github = leeg('github', 'Останній підписаний тег uitrol-* на GitHub (GitOps). Не є джерелом встановленої версії, лише довідка.', 'Laatste ondertekende tag uitrol-* op GitHub (GitOps). Geen bron van de geïnstalleerde versie, alleen ter informatie.');
  const backups = leeg('backups', 'Таймер нічних резервних копій (бази + реліз). Відновлення коду старого випуску — лише звідси, поки архіви випусків не зберігаються.', 'Timer van de nachtelijke back-ups (database + release). Code van een oude release komt alleen hiervandaan zolang releasearchieven niet bewaard worden.');
  const r = await leesOpdrachtResultaat('status');
  if (!r || !r.gegevens || typeof r.gegevens !== 'object') return { github, backups };
  const g = r.gegevens as Record<string, unknown>;
  const tijd = iso(r.tijd);
  const tag = tekst(g.laatsteTag, 40);
  const diensten = (g.diensten && typeof g.diensten === 'object' ? g.diensten : {}) as Record<string, string>;
  return {
    github: { ...github, beschikbaar: true, versie: '', release: '', commit: '', staat: tag ? 'klaar' : 'geen', methode: 'gitops', tijd, leeftijdSec: leeftijd(tijd, nu), toestand: 'ok', detail: { laatsteTag: tag, gitops: g.gitops || null } },
    backups: { ...backups, beschikbaar: true, versie: '', release: '', commit: '', staat: diensten['mijn-ruimte-backup.timer'] || 'onbekend', methode: '', tijd, leeftijdSec: leeftijd(tijd, nu), toestand: 'ok', detail: { timer: diensten['mijn-ruimte-backup.timer'] || '' } },
  };
}

// ------------------------------------------------------------------------------------------------ samenvoegen
const OUD_SEC = 90 * 60;
type Instellingen = { hoofdbron: Hoofdbron; intervalSec: number };
async function instellingen(): Promise<Instellingen> {
  try {
    const r = (await sys().query(`SELECT hoofdbron, interval_sec FROM app.uitrol_stand WHERE id = 'huidig'`)).rows[0];
    if (r) return { hoofdbron: (HOOFDBRONNEN as readonly string[]).includes(String(r.hoofdbron)) ? (String(r.hoofdbron) as Hoofdbron) : 'runs', intervalSec: Number(r.interval_sec) || 20 };
  } catch { /* tabel ontbreekt nog (migratie 0062) */ }
  return { hoofdbron: 'runs', intervalSec: 20 };
}

function afwijkingenVan(bronnen: BronStand[], hoofd: BronStand): Afwijking[] {
  const uit: Afwijking[] = [];
  const per = Object.fromEntries(bronnen.map((b) => [b.id, b])) as Record<BronId, BronStand>;
  const zeg = (bron: BronId, veld: Afwijking['veld'], waarde: string, verwacht: string, uk: string, nl: string, ernst: Afwijking['ernst'] = 'warn') => uit.push({ bron, veld, waarde, verwacht, uk, nl, ernst });
  const hoofdNaam = hoofd.id;
  for (const b of bronnen) {
    if (b.id === hoofd.id || !b.beschikbaar) continue;
    if (['vorige', 'nazorg', 'github', 'backups'].includes(b.id)) continue;
    if (b.versie && hoofd.versie && b.versie !== hoofd.versie) {
      const nieuwer = b.versie > hoofd.versie;
      zeg(b.id, 'versie', b.versie, hoofd.versie,
        nieuwer ? `${naam(b.id)} каже про новішу версію ${b.versie}, ніж основне джерело (${naam(hoofdNaam)}: ${hoofd.versie}). Ймовірно, встановлення пройшло шляхом, який не залишив запису в історії (старий скрипт, ручне копіювання). Як «працює зараз» показано версію, яку реально запущено; стан і час — з ${naam(hoofdNaam)}.`
          : `${naam(b.id)} ще показує стару версію ${b.versie}; основне джерело (${naam(hoofdNaam)}) каже ${hoofd.versie}. Це джерело застаріло — його ніхто не оновив після останнього встановлення.`,
        nieuwer ? `${naam(b.id, 'nl')} noemt een nieuwere versie ${b.versie} dan de hoofdbron (${naam(hoofdNaam, 'nl')}: ${hoofd.versie}). Waarschijnlijk een installatie langs een weg die geen run achterliet (oud script, handmatig kopiëren). Als «draait nu» staat de versie die echt gestart is; staat en tijd komen van ${naam(hoofdNaam, 'nl')}.`
          : `${naam(b.id, 'nl')} toont nog de oude versie ${b.versie}; de hoofdbron (${naam(hoofdNaam, 'nl')}) zegt ${hoofd.versie}. Deze bron is verouderd — niemand werkte hem bij na de laatste installatie.`,
        b.id === 'releasemap' || b.id === 'versie' ? 'error' : 'warn');
    }
    if (b.release && hoofd.release && b.release !== hoofd.release) {
      zeg(b.id, 'release', b.release, hoofd.release,
        `Тека релізу за ${naam(b.id)} — ${b.release}, за основним джерелом — ${hoofd.release}. Версія пакета може збігатися, але активована інша копія.`,
        `Releasemap volgens ${naam(b.id, 'nl')} is ${b.release}, volgens de hoofdbron ${hoofd.release}. De pakketversie kan gelijk zijn, maar er is een andere kopie geactiveerd.`);
    }
    if (b.commit && hoofd.commit && b.commit !== hoofd.commit && !b.commit.startsWith(hoofd.commit) && !hoofd.commit.startsWith(b.commit)) {
      zeg(b.id, 'commit', b.commit, hoofd.commit, `Коміт за ${naam(b.id)} (${b.commit.slice(0, 12)}) не збігається з основним (${hoofd.commit.slice(0, 12)}).`, `Commit volgens ${naam(b.id, 'nl')} (${b.commit.slice(0, 12)}) wijkt af van de hoofdbron (${hoofd.commit.slice(0, 12)}).`);
    }
  }
  // Vastgelopen «bezig» in status.json terwijl de geschiedenis niets lopends kent.
  const st = per.status;
  if (st?.beschikbaar && st.staat === 'bezig' && per.runs?.beschikbaar && per.runs.toestand !== 'bezig' && (st.leeftijdSec ?? 0) > OUD_SEC) {
    zeg('status', 'staat', 'bezig', per.runs.staat || 'klaar',
      `status.json уже ${Math.round((st.leeftijdSec || 0) / 60)} хв каже «виконується», а в історії немає активного запуску. Root-скрипт обірвався, не записавши результат (див. журнал того запуску).`,
      `status.json zegt al ${Math.round((st.leeftijdSec || 0) / 60)} min «bezig», maar de geschiedenis kent geen lopende run. Het root-script brak af zonder uitkomst (zie het logboek van die run).`, 'error');
  }
  // Het draaiende proces is ouder dan de releasemap: herstart nodig.
  const v = per.versie, rm = per.releasemap;
  if (v?.beschikbaar && rm?.beschikbaar && v.release && rm.release && v.release !== rm.release && !uit.some((a) => a.bron === 'versie' && a.veld === 'release')) {
    zeg('versie', 'release', v.release, rm.release, `Процес сайту запущено з теки ${v.release}, а current вказує на ${rm.release}: сайт не перезапущено після активації.`, `Het siteproces draait uit map ${v.release}, maar current wijst naar ${rm.release}: de site is na het activeren niet herstart.`, 'error');
  }
  return uit;
}

const NAMEN: Record<BronId, [string, string]> = {
  runs: ['історія запусків', 'de runs'], status: ['status.json', 'status.json'], events: ['події', 'de gebeurtenissen'], voorstellen: ['пропозиції', 'de voorstellen'],
  releasemap: ['тека релізів', 'de releasemap'], vorige: ['VORIGE', 'VORIGE'], versie: ['процес сайту', 'het siteproces'], nazorg: ['наглядач', 'de bewaker'], github: ['GitHub', 'GitHub'], backups: ['резервні копії', 'de back-ups'],
};
const naam = (id: BronId, lang: 'uk' | 'nl' = 'uk') => NAMEN[id][lang === 'uk' ? 0 : 1];

/** Alle bronnen lezen, de hoofdbron kiezen, afwijkingen berekenen en de stand bewaren. */
let laatsteStand: { t: number; stand: Stand } | null = null;
export async function huidigeStand(opties: { vers?: boolean; nu?: number } = {}): Promise<Stand> {
  const nu = opties.nu ?? Date.now();
  if (!opties.vers && laatsteStand && nu - laatsteStand.t < 3000) return laatsteStand.stand;
  try { await runsSynchroniseren(); } catch { /* runs blijven zoals ze zijn */ }
  const inst = await instellingen();
  const [status, events, runs, voorstellen, releasemap, vorige, nazorg, opdracht] = await Promise.all([
    bronStatus(nu), bronEvents(nu), bronRuns(nu), bronVoorstellen(nu), bronReleasemap(nu), bronVorige(nu), bronNazorg(nu), bronOpdracht(nu),
  ]);
  const versie = bronVersie(nu);
  const bronnen: BronStand[] = [runs, status, events, voorstellen, releasemap, vorige, versie, nazorg, opdracht.github, opdracht.backups];
  // Hoofdbron: de ingestelde, anders de eerste bruikbare in vaste volgorde (runs → releasemap → versie → status).
  const volgorde: BronId[] = [inst.hoofdbron, 'runs', 'releasemap', 'versie', 'status', 'events'];
  const per = Object.fromEntries(bronnen.map((b) => [b.id, b])) as Record<BronId, BronStand>;
  const hoofd = volgorde.map((id) => per[id]).find((b) => b && b.beschikbaar && b.versie) || per[inst.hoofdbron];
  const afwijkingen = afwijkingenVan(bronnen, hoofd);
  for (const b of bronnen) {
    if (!b.beschikbaar) { b.toestand = 'onbekend'; continue; }
    if (afwijkingen.some((a) => a.bron === b.id)) b.toestand = 'afwijking';
    else if (b.toestand === 'ok' && b.leeftijdSec !== null && b.leeftijdSec > 30 * 86400 && ['status', 'events'].includes(b.id)) b.toestand = 'oud';
  }
  const staat = runs.toestand === 'bezig' ? 'bezig' : (hoofd.staat || '');
  // Welke versie DRAAIT er echt? Dat zegt de map waar current naar wijst (anders het siteproces), niet de geschiedenis: na een
  // installatie die geen run achterliet (oud script, handmatig) zou de hoofdbron anders een oudere versie als «live» tonen
  // (gevonden door mcp-spiegel, 18.10.2026). De afwijking blijft zichtbaar; staat/methode/tijd blijven van de hoofdbron.
  const draait = [releasemap, versie].find((b) => b.beschikbaar && b.versie) || null;
  const live = draait && draait.versie !== hoofd.versie ? draait : hoofd;
  const stand: Stand = {
    versie: live.versie || '', release: live.release || hoofd.release || releasemap.release || '', commit: live.commit || hoofd.commit || releasemap.commit || versie.commit || '',
    versieBron: live.id,
    staat: ['bezig', 'klaar', 'mislukt', 'geweigerd', 'afgebroken'].includes(staat) ? staat : '', methode: hoofd.methode || '', tijd: hoofd.tijd || '',
    hoofdbron: inst.hoofdbron, gebruikteBron: hoofd.id, intervalSec: inst.intervalSec, bronnen, afwijkingen, kaart: KAART, bijgewerkt: new Date(nu).toISOString(),
  };
  await bewaar(stand);
  laatsteStand = { t: nu, stand };
  return stand;
}

async function bewaar(s: Stand) {
  try {
    await sys().query(`INSERT INTO app.uitrol_stand (id, versie, release, commit, staat, methode, tijd, hoofdbron, interval_sec, bronnen, afwijkingen, bijgewerkt_op)
      VALUES ('huidig', $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET versie = EXCLUDED.versie, release = EXCLUDED.release, commit = EXCLUDED.commit, staat = EXCLUDED.staat, methode = EXCLUDED.methode, tijd = EXCLUDED.tijd,
        bronnen = EXCLUDED.bronnen, afwijkingen = EXCLUDED.afwijkingen, bijgewerkt_op = now()`,
    [s.versie, s.release, COMMIT.test(s.commit) ? s.commit : '', s.staat, tekst(s.methode, 20), s.tijd || null, s.hoofdbron, s.intervalSec,
      JSON.stringify(Object.fromEntries(s.bronnen.map((b) => [b.id, { beschikbaar: b.beschikbaar, versie: b.versie, release: b.release, staat: b.staat, tijd: b.tijd, toestand: b.toestand }]))), JSON.stringify(s.afwijkingen)]);
  } catch (err) { console.error('[uitrol-bron] stand bewaren mislukt:', (err as Error).message); }
}

/** Alleen voor tests. */
export const _resetStand = () => { laatsteStand = null; };

export async function instellingenZetten(v: { hoofdbron?: unknown; intervalSec?: unknown }): Promise<Instellingen> {
  const huidig = await instellingen();
  const hoofdbron = (HOOFDBRONNEN as readonly string[]).includes(String(v.hoofdbron)) ? (String(v.hoofdbron) as Hoofdbron) : huidig.hoofdbron;
  const intervalSec = Math.max(5, Math.min(300, Math.trunc(Number(v.intervalSec)) || huidig.intervalSec));
  await sys().query(`INSERT INTO app.uitrol_stand (id, hoofdbron, interval_sec) VALUES ('huidig', $1, $2)
    ON CONFLICT (id) DO UPDATE SET hoofdbron = EXCLUDED.hoofdbron, interval_sec = EXCLUDED.interval_sec, bijgewerkt_op = now()`, [hoofdbron, intervalSec]);
  laatsteStand = null;
  return { hoofdbron, intervalSec };
}

/** Compacte vorm voor /api/version-consumenten en de MCP-tool get_live_release: dezelfde waarden als de pagina. */
export async function liveStand() {
  const s = await huidigeStand();
  return { versie: s.versie, release: s.release, commit: s.commit, staat: s.staat, methode: s.methode, tijd: s.tijd, hoofdbron: s.hoofdbron, afwijkingen: s.afwijkingen.length, bijgewerkt: s.bijgewerkt };
}

// ------------------------------------------------------------------------------------------------ routes
type SessionOk = { user: { id: string; email?: string; role?: string }; service: string };
type Ctx = { event: Record<string, unknown>; body: unknown };
export type BronRouteDeps = { requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>; isEigenaar: (u: SessionOk['user']) => boolean };
export function uitrolBronRoutes(deps: BronRouteDeps): Record<string, RouterMiddleware[]> {
  const eigenaar = (run: (ctx: Ctx, auth: SessionOk) => Promise<unknown>): RouterMiddleware => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!deps.isEigenaar(auth.user)) return error('OWNER_REQUIRED', 403);
    try { return json(await run(ctx, auth)); }
    catch (err) { console.error('[uitrol-bron]', (err as Error).message); return error('UITROL_BRON_MISLUKT', 500); }
  }) as RouterMiddleware;
  return {
    'POST /api/owner/uitrol/bron': [eigenaar(async () => huidigeStand({ vers: true }))],
    'POST /api/owner/uitrol/bron/instellen': [eigenaar(async (ctx, auth) => {
      const b = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>;
      const voor = await instellingen();
      const na = await instellingenZetten({ hoofdbron: b.hoofdbron, intervalSec: b.intervalSec });
      await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: 'owner.uitrol.bron.ingesteld', type: 'beveiliging', result: 'success',
        details: { voor, na }, service: 'admin' }).catch((err) => console.error('[uitrol-bron] AUDIT MISLUKT:', (err as Error).message));
      return huidigeStand({ vers: true });
    })],
  };
}
