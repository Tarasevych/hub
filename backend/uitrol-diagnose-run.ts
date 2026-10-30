// Admin → «Оновлення» → «Діагностика» → «Перевірки»: alleen-lezen controles die de eigenaar vanaf de site kan uitvoeren
// (in plaats van opdrachten te kopiëren naar SSH). Veiligheidsregels, allemaal hier afgedwongen:
//  - een VASTE whitelist van controle-id's (shared/uitrol-diagnose-controles.ts); de client stuurt alleen een id, nooit een opdracht
//    of argumenten. Een id buiten de lijst (of met andere tekens dan a-z, 0-9 en '-') wordt geweigerd vóór er iets draait;
//  - externe programma's alleen via child_process.execFile (geen shell), met absolute paden uit een vaste lijst, een schone
//    omgeving (alleen PATH en LC_ALL), een korte timeout (SIGKILL) en een maximale uitvoer;
//  - de uitvoer wordt gemaskeerd (tokens, wachtwoorden, sleutels, cookies, URL-wachtwoorden, PEM-blokken) en afgekapt;
//  - geen sudo en geen extra rechten: wat de app-gebruiker niet mag lezen (journalctl, systemctl van root, lock), komt uit de
//    momentopname diagnose.json die root zelf elke minuut schrijft — de uitslag zegt dat expliciet («root-momentopname» + leeftijd);
//  - slechts één controle tegelijk (anders 429 DIAGNOSE_BEZIG), 60 per 10 minuten per eigenaar, elke uitvoering in het logboek.
// Toegang: precies als de andere /api/owner/uitrol/*-routes — eigenaar (OWNER_EMAIL) op admin.tarasevych.com; de site toont de
// pagina alleen bij een actief technisch profiel.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsc } from 'node:fs';
import { access, lstat, readdir, readFile, readlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { error, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { rateLimit } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { CHECK_IDS, type CheckStatus, type CheckUitslag } from '../shared/uitrol-diagnose-controles';
import { isEigenaar, leesSleutels, schakelaarAan } from './uitrol-goedkeuring';

export const MAX_UITVOER = 24_000;   // tekens in het antwoord
export const MAX_REGEL = 400;        // tekens per regel
export const MAX_BUFFER = 256 * 1024; // bytes van een programma
export const TIMEOUT_MS = 6_000;
const ID_VORM = /^[a-z0-9][a-z0-9-]{1,39}$/;

export class DiagnoseFout extends Error { constructor(public code: string, public status = 400) { super(code); } }

const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
const inboxDir = () => process.env.GOEDKEUR_INBOX || '/srv/mijn-ruimte/goedkeur-inbox';
const voorstelDir = () => process.env.UITROL_VOORSTEL_DIR || path.join(process.env.UPLOADS_DIR || '/srv/data/uploads', 'uitrol-voorstellen');
const appRoot = () => process.env.UITROL_APP_ROOT || '/srv/mijn-ruimte';
const rootScript = () => process.env.UITROL_ROOT_SCRIPT || '/usr/local/sbin/mijn-ruimte-uitrol';
const sys = () => getPool('systeem');

// ------------------------------------------------------------------------------------------------ maskeren en afkappen
const GEHEIM_WOORD = /(token|secret|password|passwd|wachtwoord|passphrase|api[_-]?key|private[_-]?key|credential|cookie|authorization|bearer|sessie|session[_-]?id)/i;
/** Verwijdert wat een geheim kan zijn. Liever te veel dan te weinig: een regel met een geheim-woord + waarde verliest de waarde. */
export function maskeer(invoer: string): string {
  let t = String(invoer ?? '');
  t = t.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[sleutel verborgen]');
  t = t.replace(/\b(postgres(?:ql)?|mysql|redis|amqp|mongodb(?:\+srv)?|https?):\/\/([^\s:@/]+):([^\s@/]+)@/gi, '$1://$2:***@');
  t = t.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ***');
  t = t.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[jwt verborgen]');
  t = t.replace(/\b(tvh|sk|pk|ghp|gho|ghs|github_pat|xox[abprs]|AKIA)[_-]?[A-Za-z0-9_-]{16,}/g, '[token verborgen]');
  t = t.split('\n').map((regel) => {
    if (!GEHEIM_WOORD.test(regel)) return regel;
    // «naam=waarde», «naam: waarde», «"naam": "waarde"» → waarde weg; staat er geen scheidingsteken, dan de hele regel.
    const m = regel.match(/^(.*?(?:token|secret|password|passwd|wachtwoord|passphrase|api[_-]?key|private[_-]?key|credential|cookie|authorization|bearer|sessie|session[_-]?id)[A-Za-z0-9_"'-]*\s*["']?\s*[=:]\s*)(.*)$/i);
    return m ? `${m[1]}***` : '[regel met geheim-woord verborgen]';
  }).join('\n');
  return t;
}
export function kap(invoer: string, max = MAX_UITVOER, maxRegel = MAX_REGEL): { tekst: string; afgekapt: boolean } {
  let afgekapt = false;
  const regels = String(invoer ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').split('\n').map((r) => {
    if (r.length > maxRegel) { afgekapt = true; return `${r.slice(0, maxRegel)}…`; }
    return r;
  });
  let tekst = regels.join('\n');
  if (tekst.length > max) { afgekapt = true; tekst = tekst.slice(0, max); }
  return { tekst, afgekapt };
}

// ------------------------------------------------------------------------------------------------ programma's (execFile, geen shell)
const BIN_MAPPEN = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
export async function vindProgramma(naam: string): Promise<string | null> {
  if (!/^[a-z][a-z0-9-]{1,20}$/.test(naam)) return null;
  for (const m of BIN_MAPPEN) { const p = `${m}/${naam}`; try { await access(p, fsc.X_OK); return p; } catch { /* volgende map */ } }
  return null;
}
export type Draai = { code: number | null; uit: string; fout: string; timeout: boolean; ontbreekt: boolean };
/** Eén programma uitvoeren: absolute naam uit BIN_MAPPEN, vaste argumenten, korte timeout, begrensde uitvoer, schone omgeving. */
export async function draai(naam: string, args: readonly string[], opties: { timeoutMs?: number; maxBuffer?: number } = {}): Promise<Draai> {
  const bin = await vindProgramma(naam);
  if (!bin) return { code: null, uit: '', fout: `${naam}: programma niet gevonden`, timeout: false, ontbreekt: true };
  return new Promise((klaar) => {
    execFile(bin, [...args], {
      timeout: opties.timeoutMs ?? TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: opties.maxBuffer ?? MAX_BUFFER, encoding: 'utf8', windowsHide: true,
      env: { PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C' },
    }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { killed?: boolean; signal?: string; code?: number | string }) | null;
      const timeout = !!e && (e.killed === true || e.signal === 'SIGKILL') && !String(e.code).startsWith('ERR_');
      const code = e ? (typeof e.code === 'number' ? e.code : String(e.code).startsWith('ERR_CHILD_PROCESS_STDIO_MAXBUFFER') ? 0 : null) : 0;
      klaar({ code, uit: String(stdout ?? ''), fout: String(stderr ?? ''), timeout, ontbreekt: false });
    });
  });
}

// ------------------------------------------------------------------------------------------------ momentopname van root
type Snap = { tijd?: string; gezond?: boolean; problemen?: Array<{ code: string; uk: string }>; eenheden?: Record<string, Record<string, string>>;
  lock?: { bezet?: boolean; door?: string; bestaat?: boolean }; schijf?: Record<string, { vrijMB: number; totaalMB: number }>; journaal?: string[];
  inbox?: { bestaat?: boolean; bestanden?: Array<{ naam: string; bytes: number; tijd: string }> } };
async function momentopname(): Promise<{ d: Snap; leeftijdSec: number } | null> {
  try {
    const d = JSON.parse(await readFile(path.join(statusDir(), 'diagnose.json'), 'utf8')) as Snap;
    const t = Date.parse(String(d.tijd));
    return { d, leeftijdSec: Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 1000)) : 0 };
  } catch { return null; }
}

type Intern = { status: CheckStatus; bron: CheckUitslag['bron']; leeftijdSec?: number; uitvoer: string; samenvatting: readonly [string, string] };
const GEEN_SNAP: Intern = {
  status: 'let-op', bron: 'root-momentopname', samenvatting: ['Немає ні прямого доступу, ні знімка від root.', 'Geen rechtstreekse toegang en geen momentopname van root.'],
  uitvoer: 'Сайт не має прав читати це напряму, а файл diagnose.json від root відсутній.\nDe site mag dit niet rechtstreeks lezen en diagnose.json van root ontbreekt.',
};
const leeftijdTekst = (s: number) => (s < 90 ? `${s} с` : s < 5400 ? `${Math.round(s / 60)} хв` : `${Math.round(s / 3600)} год`);
const kopRoot = (s: number) => `# Взято зі знімка від root (вік ${leeftijdTekst(s)}), а не виконано наживо\n# Uit de momentopname van root (leeftijd ${leeftijdTekst(s)}), niet live uitgevoerd\n`;

// ------------------------------------------------------------------------------------------------ systemd-units
const EENHEDEN_KETEN = ['mijn-ruimte-goedkeuring.path', 'mijn-ruimte-goedkeuring.service', 'mijn-ruimte-goedkeuring-wacht.timer'] as const;
const EENHEDEN_ALLE = [...EENHEDEN_KETEN, 'mijn-ruimte-uitrol.path', 'mijn-ruimte-uitrol.service', 'mijn-ruimte.service'] as const;
type Eenheid = { geladen: string; actief: string; sub: string; bestand: string; resultaat: string; exit: string; einde: string };
async function eenheidLive(naam: string): Promise<Eenheid | null> {
  if (!/^[a-z0-9-]+\.(service|path|timer)$/.test(naam)) return null;
  const r = await draai('systemctl', ['show', naam, '--no-pager', '-p', 'LoadState,ActiveState,SubState,UnitFileState,Result,ExecMainStatus,ExecMainExitTimestamp']);
  if (r.ontbreekt || r.timeout || !r.uit.includes('LoadState=')) return null;
  const d: Record<string, string> = {};
  for (const regel of r.uit.split('\n')) { const i = regel.indexOf('='); if (i > 0) d[regel.slice(0, i)] = regel.slice(i + 1); }
  return { geladen: d.LoadState || '?', actief: d.ActiveState || '?', sub: d.SubState || '?', bestand: d.UnitFileState || '', resultaat: d.Result || '', exit: d.ExecMainStatus || '', einde: d.ExecMainExitTimestamp || '' };
}
function eenhedenTekst(rijen: Array<[string, Eenheid]>): { uitvoer: string; status: CheckStatus } {
  let status: CheckStatus = 'ok';
  const lijnen = rijen.map(([naam, e]) => {
    const kind = naam.split('.').pop();
    const goed = e.geladen === 'loaded' && (kind === 'service' ? e.resultaat === '' || e.resultaat === 'success' : e.actief === 'active');
    if (e.geladen !== 'loaded') { if (status === 'ok') status = 'let-op'; }
    else if (!goed) status = 'fout';
    const markering = goed ? '✅' : e.geladen !== 'loaded' ? '⚪' : '❌';
    const stand = e.geladen !== 'loaded' ? 'не встановлено / niet geïnstalleerd' : `${e.actief}/${e.sub}`;
    const extra = e.resultaat && e.resultaat !== 'success' ? `  результат/resultaat=${e.resultaat} exit=${e.exit}` : e.einde ? `  einde=${e.einde}` : '';
    return `${markering} ${naam.padEnd(38)} ${stand}${e.bestand ? `  [${e.bestand}]` : ''}${extra}`;
  });
  return { uitvoer: lijnen.join('\n'), status };
}
async function eenhedenCheck(namen: readonly string[]): Promise<Intern> {
  const live = await Promise.all(namen.map(async (n) => [n, await eenheidLive(n)] as const));
  if (live.every(([, e]) => e)) {
    const t = eenhedenTekst(live.map(([n, e]) => [n, e as Eenheid] as [string, Eenheid]));
    return { status: t.status, bron: 'live', uitvoer: t.uitvoer, samenvatting: t.status === 'ok' ? ['Усе справно', 'Alles in orde'] : t.status === 'fout' ? ['Є юніт із помилкою', 'Een unit heeft een fout'] : ['Деяких юнітів не встановлено', 'Sommige units zijn niet geïnstalleerd'] };
  }
  const s = await momentopname();
  if (!s?.d.eenheden) return GEEN_SNAP;
  const rijen = namen.filter((n) => s.d.eenheden![n]).map((n) => {
    const e = s.d.eenheden![n];
    return [n, { geladen: e.geladen || '?', actief: e.actief || '?', sub: e.sub || '?', bestand: e.bestand || '', resultaat: e.resultaat || '', exit: e.exit || '', einde: e.einde || '' }] as [string, Eenheid];
  });
  const t = eenhedenTekst(rijen);
  return { status: s.leeftijdSec > 180 && t.status === 'ok' ? 'let-op' : t.status, bron: 'root-momentopname', leeftijdSec: s.leeftijdSec, uitvoer: kopRoot(s.leeftijdSec) + t.uitvoer,
    samenvatting: ['Знімок від root (systemctl недоступний для сайту)', 'Momentopname van root (systemctl is voor de site niet beschikbaar)'] };
}

// ------------------------------------------------------------------------------------------------ de controles
const FOUT_ACHTER = /(failed with result|\bfailed\b|\berror\b|\bfout\b|помилк|GEEN_[A-Z_]+|NIET_[A-Z_]+|_MISLUKT|_ONGELDIG|weiger)/i;
const GEEN_TOEGANG_JOURNAAL = /(not seeing messages|No journal files|Permission denied|Hint: You are currently)/i;
const BESTAND_REGEL = (naam: string, bytes: number, tijd: Date) => `${tijd.toISOString().replace('T', ' ').slice(0, 19)}  ${String(bytes).padStart(11)}  ${naam.replace(/[\u0000-\u001f]/g, '?').slice(0, 120)}`;
const mbTekst = (n: number) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function staart(pad: string, regels: number): Promise<{ tekst: string; mtime: Date } | null> {
  try {
    const st = await stat(pad);
    if (!st.isFile()) return null;
    const raw = await readFile(pad, 'utf8');
    return { tekst: raw.split('\n').filter((l) => l.length).slice(-regels).join('\n'), mtime: st.mtime };
  } catch { return null; }
}

type Uitvoerder = () => Promise<Intern>;
const UITVOERDERS: Record<string, Uitvoerder> = {
  'goedkeur-diensten': () => eenhedenCheck(EENHEDEN_KETEN),
  'systeemdiensten': () => eenhedenCheck(EENHEDEN_ALLE),
  'site-dienst': () => eenhedenCheck(['mijn-ruimte.service']),

  'goedkeur-journaal': async () => {
    const r = await draai('journalctl', ['-u', 'mijn-ruimte-goedkeuring.service', '-n', '80', '--no-pager', '-o', 'short-iso'], { timeoutMs: 8000 });
    const regels = r.uit.split('\n').filter((l) => l.trim() && !l.startsWith('-- '));
    if (!r.ontbreekt && !r.timeout && r.code === 0 && regels.length && !GEEN_TOEGANG_JOURNAAL.test(r.uit + r.fout)) {
      const slecht = regels.slice(-20).some((l) => FOUT_ACHTER.test(l));
      return { status: slecht ? 'let-op' : 'ok', bron: 'live', uitvoer: regels.join('\n'), samenvatting: slecht ? ['У кінці журналу є помилки', 'In het journaal staan fouten'] : ['Журнал без помилок', 'Journaal zonder fouten'] };
    }
    const s = await momentopname();
    if (!s?.d.journaal?.length) return { ...GEEN_SNAP, uitvoer: `${GEEN_SNAP.uitvoer}\n(journalctl: ${(r.fout || r.uit).trim().split('\n')[0]?.slice(0, 160) || 'geen toegang'})` };
    const slecht = s.d.journaal.slice(-20).some((l) => FOUT_ACHTER.test(l));
    return { status: slecht ? 'let-op' : 'ok', bron: 'root-momentopname', leeftijdSec: s.leeftijdSec, uitvoer: kopRoot(s.leeftijdSec) + s.d.journaal.join('\n'),
      samenvatting: ['Знімок від root (journalctl недоступний для сайту)', 'Momentopname van root (journalctl is voor de site niet beschikbaar)'] };
  },

  'inbox': async () => {
    try {
      const namen = (await readdir(inboxDir())).sort().slice(0, 40);
      if (!namen.length) return { status: 'ok', bron: 'live', uitvoer: '(порожньо — це нормально / leeg — dat is normaal)', samenvatting: ['Черга порожня', 'Wachtrij is leeg'] };
      let oud = false;
      const lijnen: string[] = [];
      for (const n of namen) {
        try { const st = await lstat(path.join(inboxDir(), n)); lijnen.push(BESTAND_REGEL(n, st.size, st.mtime)); if (n.endsWith('.tar.gz') && Date.now() - st.mtimeMs > 180_000) oud = true; }
        catch { lijnen.push(`?  ${n.slice(0, 120)}`); }
      }
      return { status: oud ? 'let-op' : 'info', bron: 'live', uitvoer: lijnen.join('\n'),
        samenvatting: oud ? ['Пакет лежить у черзі понад 3 хв — root його не бере', 'Pakket ligt langer dan 3 min in de wachtrij — root pakt het niet op'] : ['У черзі є файли (root їх обробляє)', 'Er liggen bestanden in de wachtrij (root verwerkt ze)'] };
    } catch {
      return { status: 'info', bron: 'live', uitvoer: `Теки ${inboxDir()} немає або вона нечитна для сайту.\nDe map ${inboxDir()} bestaat niet of is voor de site onleesbaar.`, samenvatting: ['Теку не видно', 'Map niet zichtbaar'] };
    }
  },

  'blokkering': async () => {
    const r = await draai('lslocks', ['-n', '-r', '-o', 'COMMAND,PID,PATH']);
    if (!r.ontbreekt && !r.timeout && r.code === 0) {
      const regel = r.uit.split('\n').find((l) => l.includes('mijn-ruimte-uitrol'));
      return { status: regel ? 'info' : 'ok', bron: 'live', uitvoer: regel ? `вдержується / vastgehouden: ${regel.trim().split(/\s+/).slice(0, 2).join(' pid ')}` : 'вільне / vrij — ніхто не тримає uitrol.lock',
        samenvatting: regel ? ['Встановлення зараз іде', 'Er loopt nu een installatie'] : ['Блокування вільне', 'Vergrendeling is vrij'] };
    }
    const s = await momentopname();
    if (!s?.d.lock) return GEEN_SNAP;
    return { status: s.d.lock.bezet ? 'info' : 'ok', bron: 'root-momentopname', leeftijdSec: s.leeftijdSec,
      uitvoer: kopRoot(s.leeftijdSec) + (s.d.lock.bezet ? `вдержується / vastgehouden: ${s.d.lock.door || '?'}` : 'вільне / vrij'), samenvatting: s.d.lock.bezet ? ['Блокування утримується (знімок)', 'Vergrendeling vastgehouden (momentopname)'] : ['Блокування вільне (знімок)', 'Vergrendeling vrij (momentopname)'] };
  },

  'root-script': async () => {
    const pad = rootScript();
    try {
      const st = await stat(pad);
      const uitvoerbaar = !!(st.mode & 0o111);
      let sha = '';
      try { sha = createHash('sha256').update(await readFile(pad)).digest('hex').slice(0, 12); } catch { /* onleesbaar voor de site */ }
      return { status: uitvoerbaar ? 'ok' : 'fout', bron: 'live', uitvoer: `${pad}\n${uitvoerbaar ? 'виконуваний / uitvoerbaar' : 'НЕ виконуваний / NIET uitvoerbaar'}  ${st.size} B  ${st.mtime.toISOString().slice(0, 19)}Z${sha ? `\nsha256 ${sha}…` : ''}`,
        samenvatting: uitvoerbaar ? ['Скрипт на місці', 'Script aanwezig'] : ['Скрипт не виконуваний', 'Script niet uitvoerbaar'] };
    } catch {
      const s = await momentopname();
      if (s) return { status: 'let-op', bron: 'root-momentopname', leeftijdSec: s.leeftijdSec, uitvoer: kopRoot(s.leeftijdSec) + `скрипт: ${JSON.stringify((s.d as { script?: unknown }).script ?? null)}`, samenvatting: ['Сайт не бачить скрипт — подивіться знімок', 'De site ziet het script niet — zie de momentopname'] };
      return { status: 'fout', bron: 'live', uitvoer: `${pad}: не знайдено / niet gevonden`, samenvatting: ['Скрипта немає', 'Script ontbreekt'] };
    }
  },

  'root-momentopname': async () => {
    const s = await momentopname();
    if (!s) return { status: 'fout', bron: 'root-momentopname', uitvoer: `${path.join(statusDir(), 'diagnose.json')}\nвідсутній або нечитний / ontbreekt of onleesbaar`, samenvatting: ['Знімка від root немає', 'Geen momentopname van root'] };
    const p = s.d.problemen ?? [];
    const regels = [`tijd: ${s.d.tijd}`, `вік / leeftijd: ${leeftijdTekst(s.leeftijdSec)}`, `проблем / problemen: ${p.length}`, ...p.map((x) => `  - ${x.code}: ${x.uk}`),
      `юнітів / units: ${Object.keys(s.d.eenheden ?? {}).length}`, `inbox: ${s.d.inbox?.bestanden?.length ?? 0} файлів/bestanden`, `диск / schijf: ${Object.entries(s.d.schijf ?? {}).map(([k, v]) => `${k} ${v.vrijMB} MB vrij`).join('; ') || '—'}`];
    const status: CheckStatus = p.length ? 'fout' : s.leeftijdSec > 180 ? 'let-op' : 'ok';
    return { status, bron: 'root-momentopname', leeftijdSec: s.leeftijdSec, uitvoer: regels.join('\n'),
      samenvatting: p.length ? [`Root знайшов проблем: ${p.length}`, `Root vond problemen: ${p.length}`] : s.leeftijdSec > 180 ? ['Знімок застарів', 'Momentopname is verouderd'] : ['Знімок свіжий, проблем немає', 'Momentopname vers, geen problemen'] };
  },

  'passkeys-root': async () => {
    const sl = await leesSleutels();
    const aan = await schakelaarAan();
    const lijnen = [`перемикач passkey-goedkeuring / schakelaar: ${aan ? 'увімкнено / aan' : 'вимкнено / uit'}`, `rpId: ${sl.rpId}`, `ключів / sleutels: ${sl.sleutels.length}`,
      ...sl.sleutels.map((k: { label: string; vingerafdruk: string; toegevoegd: string; door: string }) => `  - ${k.label || '(без назви)'}  ${String(k.vingerafdruk).slice(0, 12)}…  ${k.toegevoegd || ''}  ${k.door || ''}`.trimEnd())];
    const ok = aan && sl.sleutels.length > 0;
    return { status: ok ? 'ok' : 'let-op', bron: 'live', uitvoer: lijnen.join('\n'), samenvatting: ok ? ['Ключі є, схвалення ввімкнене', 'Sleutels aanwezig, goedkeuring aan'] : !aan ? ['Схвалення через passkey вимкнене', 'Goedkeuren met passkey staat uit'] : ['Немає жодного ключа', 'Geen enkele sleutel'] };
  },

  'site-gezondheid': async () => {
    const t0 = Date.now();
    try {
      // Audit 19.10.2026 (A2): met Host-kop van de admin-site, anders antwoordt server/start.ts 404 «Onbekende host» (zie haalLokaal).
      const { haalLokaal } = await import('./beheer-diagnostiek');
      const res = await haalLokaal('/api/_healthcheck');
      const ok = res.status >= 200 && res.status < 300;
      return { status: ok ? 'ok' : 'fout', bron: 'app', uitvoer: `HTTP ${res.status} · ${Date.now() - t0} ms\n${res.tekst.slice(0, 300)}`, samenvatting: ok ? ['Сайт відповідає', 'De site antwoordt'] : [`Сайт відповів помилкою ${res.status}`, `De site antwoordde met fout ${res.status}`] };
    } catch (e) {
      return { status: 'fout', bron: 'app', uitvoer: `Немає відповіді / geen antwoord na ${Date.now() - t0} ms: ${(e as Error).name}`, samenvatting: ['Сайт не відповів', 'De site antwoordde niet'] };
    }
  },

  'releases': async () => {
    const dir = path.join(appRoot(), 'releases');
    try {
      const namen = (await readdir(dir)).filter((n) => /^\d{8}-\d{6}$/.test(n)).sort().reverse().slice(0, 10);
      let huidig = '';
      try { huidig = path.basename(await readlink(path.join(appRoot(), 'current'))); } catch { /* geen symlink */ }
      const lijnen = [`активний / actief (current): ${huidig || '—'}`, '', ...namen.map((n) => `${n === huidig ? '▶' : ' '} ${n}`)];
      const ok = namen.length >= 2 && namen.includes(huidig);
      return { status: ok ? 'ok' : 'let-op', bron: 'live', uitvoer: lijnen.join('\n'), samenvatting: ok ? [`Активна ${huidig}, є куди відкотитись`, `Actief ${huidig}, er is een release om naar terug te draaien`] : ['Немає запасного релізу або current не збігається', 'Geen reserve-release of current klopt niet'] };
    } catch {
      return { status: 'info', bron: 'live', uitvoer: `${dir}\nнедоступна / niet beschikbaar (dit is niet de server?)`, samenvatting: ['Теку релізів не видно', 'Releasemap niet zichtbaar'] };
    }
  },

  'database': async () => {
    const t0 = Date.now();
    try {
      await sys().query('SELECT 1');
      const ms = Date.now() - t0;
      const m = (await sys().query('SELECT version, applied_at FROM app.schema_migrations ORDER BY version DESC LIMIT 5')).rows;
      const n = Number((await sys().query('SELECT count(*)::int AS n FROM app.schema_migrations')).rows[0]?.n ?? 0);
      return { status: 'ok', bron: 'database', uitvoer: [`PostgreSQL відповідає / antwoordt: ${ms} ms`, `міграцій / migraties: ${n}`, ...m.map((r) => `  ${String(r.version)}  ${new Date(r.applied_at).toISOString().slice(0, 16).replace('T', ' ')}`)].join('\n'),
        samenvatting: [`База відповідає (${ms} мс), міграцій: ${n}`, `Database antwoordt (${ms} ms), migraties: ${n}`] };
    } catch (e) {
      return { status: 'fout', bron: 'database', uitvoer: `Помилка бази / databasefout: ${(e as Error).message.slice(0, 200)}`, samenvatting: ['База не відповідає', 'Database antwoordt niet'] };
    }
  },

  'voorstellen': async () => {
    try {
      const tel = (await sys().query('SELECT status, count(*)::int AS n FROM app.uitrol_voorstellen GROUP BY status ORDER BY status')).rows;
      const laatste = (await sys().query('SELECT versie, status, bytes, aangemaakt_op, voorbereider_label FROM app.uitrol_voorstellen ORDER BY aangemaakt_op DESC LIMIT 8')).rows;
      const stil = (await sys().query(`SELECT count(*)::int AS n FROM app.uitrol_voorstellen WHERE status = 'goedgekeurd' AND beslist_op < now() - interval '5 minutes'`)).rows[0]?.n ?? 0;
      const lijnen = [`за статусами / per status: ${tel.map((r) => `${r.status}=${r.n}`).join(', ') || '—'}`, '', ...laatste.map((r) => `${String(r.versie)}  ${String(r.status).padEnd(20)} ${mbTekst(Number(r.bytes)).padStart(9)}  ${String(r.voorbereider_label).slice(0, 40)}`)];
      return { status: stil > 0 ? 'let-op' : 'ok', bron: 'database', uitvoer: lijnen.join('\n'), samenvatting: stil > 0 ? [`Схвалених без відповіді root: ${stil}`, `Goedgekeurd zonder antwoord van root: ${stil}`] : ['Нічого не застрягло', 'Er blijft niets hangen'] };
    } catch (e) {
      return { status: 'fout', bron: 'database', uitvoer: `Помилка бази / databasefout: ${(e as Error).message.slice(0, 200)}`, samenvatting: ['Не вдалося прочитати пропозиції', 'Voorstellen konden niet worden gelezen'] };
    }
  },

  'uploads-map': async () => {
    try {
      const namen = await readdir(voorstelDir());
      let totaal = 0; const lijnen: string[] = [];
      for (const n of namen.sort().slice(-40)) { try { const st = await lstat(path.join(voorstelDir(), n)); totaal += st.size; lijnen.push(BESTAND_REGEL(n, st.size, st.mtime)); } catch { /* verdwenen */ } }
      return { status: 'ok', bron: 'live', uitvoer: `файлів / bestanden: ${namen.length} · разом / totaal: ${mbTekst(totaal)}\n${lijnen.join('\n')}`, samenvatting: [`Файлів: ${namen.length}, ${mbTekst(totaal)}`, `Bestanden: ${namen.length}, ${mbTekst(totaal)}`] };
    } catch {
      return { status: 'info', bron: 'live', uitvoer: `${voorstelDir()}\nнедоступна / niet beschikbaar`, samenvatting: ['Теки немає', 'Map ontbreekt'] };
    }
  },

  'statusmap': async () => {
    try {
      const namen = (await readdir(statusDir())).sort();
      const lijnen: string[] = [];
      for (const n of namen.slice(0, 60)) {
        try { const st = await lstat(path.join(statusDir(), n)); lijnen.push(`${BESTAND_REGEL(n + (st.isDirectory() ? '/' : ''), st.size, st.mtime)}  (${Math.max(0, Math.round((Date.now() - st.mtimeMs) / 1000))} с тому)`); } catch { /* verdwenen */ }
      }
      const heeft = (n: string) => namen.includes(n);
      const mist = ['status.json', 'stappen.jsonl', 'diagnose.json'].filter((n) => !heeft(n));
      return { status: mist.length ? 'let-op' : 'ok', bron: 'live', uitvoer: lijnen.join('\n') || '(порожньо / leeg)', samenvatting: mist.length ? [`Бракує: ${mist.join(', ')}`, `Ontbreekt: ${mist.join(', ')}`] : ['Усі ключові файли є', 'Alle belangrijke bestanden aanwezig'] };
    } catch {
      return { status: 'fout', bron: 'live', uitvoer: `${statusDir()}\nтеки немає або доступ заборонено / map ontbreekt of geen toegang (root:mijnruimte 0750?)`, samenvatting: ['Сайт не бачить теку статусу', 'De site ziet de statusmap niet'] };
    }
  },

  'stappen-recent': async () => {
    const t = await staart(path.join(statusDir(), 'stappen.jsonl'), 20);
    if (!t) return { status: 'info', bron: 'live', uitvoer: 'stappen.jsonl відсутній або нечитний / ontbreekt of onleesbaar', samenvatting: ['Кроків ще немає', 'Nog geen stappen'] };
    const laatste = t.tekst.split('\n').pop() || '';
    return { status: /"stap"\s*:\s*"klaar"/.test(laatste) ? 'ok' : 'info', bron: 'live', uitvoer: t.tekst, samenvatting: [`Оновлено ${t.mtime.toISOString().slice(0, 16).replace('T', ' ')}Z`, `Bijgewerkt ${t.mtime.toISOString().slice(0, 16).replace('T', ' ')}Z`] };
  },

  'installatielog': async () => {
    const t = await staart(path.join(statusDir(), 'installeer.log'), 60);
    if (!t) return { status: 'info', bron: 'live', uitvoer: 'installeer.log відсутній або нечитний / ontbreekt of onleesbaar', samenvatting: ['Журналу ще немає', 'Nog geen logboek'] };
    const slecht = /(terugdraaien|rollback|mislukt|FOUT|ERROR)/i.test(t.tekst.split('\n').slice(-15).join('\n'));
    return { status: slecht ? 'let-op' : 'ok', bron: 'live', uitvoer: t.tekst, samenvatting: slecht ? ['В кінці є помилка або відкат', 'Aan het eind staat een fout of terugdraaien'] : ['Без помилок у кінці', 'Geen fouten aan het eind'] };
  },

  'schijf': async () => {
    const r = await draai('df', ['-P', '-k', appRoot(), statusDir(), '/tmp']);
    if (!r.ontbreekt && !r.timeout && r.uit.trim()) {
      const regels = r.uit.trim().split('\n');
      const data = regels.slice(1).map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 6);
      const vrijMin = Math.min(...data.map((c) => Number(c[3]) / 1024).filter(Number.isFinite));
      const vol = data.some((c) => parseInt(c[4], 10) >= 90);
      const status: CheckStatus = vrijMin < 800 ? 'fout' : vol ? 'let-op' : 'ok';
      return { status, bron: 'live', uitvoer: regels.map((l, i) => (i === 0 ? l : l.trim().split(/\s+/).map((c, j) => (j === 1 || j === 2 || j === 3 ? mbTekst(Number(c) * 1024) : c)).join('  '))).join('\n'),
        samenvatting: status === 'fout' ? [`Мало місця: ${Math.round(vrijMin)} МБ`, `Weinig ruimte: ${Math.round(vrijMin)} MB`] : vol ? ['Диск заповнений понад 90 %', 'Schijf voor meer dan 90 % vol'] : ['Місця достатньо', 'Genoeg ruimte'] };
    }
    const s = await momentopname();
    if (!s?.d.schijf) return GEEN_SNAP;
    const v = Object.entries(s.d.schijf);
    const laag = v.some(([, x]) => x.vrijMB < 800);
    return { status: laag ? 'fout' : 'ok', bron: 'root-momentopname', leeftijdSec: s.leeftijdSec, uitvoer: kopRoot(s.leeftijdSec) + v.map(([k, x]) => `${k}  ${mbTekst(x.vrijMB * 1048576)} вільно/vrij van ${mbTekst(x.totaalMB * 1048576)}`).join('\n'),
      samenvatting: laag ? ['Мало місця (знімок)', 'Weinig ruimte (momentopname)'] : ['Місця достатньо (знімок)', 'Genoeg ruimte (momentopname)'] };
  },

  'geheugen': async () => {
    const r = await draai('free', ['-m']);
    if (r.ontbreekt || r.timeout || !r.uit.trim()) return { status: 'info', bron: 'live', uitvoer: 'free недоступний / niet beschikbaar', samenvatting: ['Немає даних', 'Geen gegevens'] };
    const mem = r.uit.split('\n').find((l) => l.startsWith('Mem:'))?.trim().split(/\s+/);
    const beschikbaar = mem ? Number(mem[6] ?? mem[3]) : NaN;
    const status: CheckStatus = Number.isFinite(beschikbaar) ? (beschikbaar < 200 ? 'fout' : beschikbaar < 500 ? 'let-op' : 'ok') : 'info';
    return { status, bron: 'live', uitvoer: r.uit.trim(), samenvatting: Number.isFinite(beschikbaar) ? [`Доступно ${beschikbaar} МБ`, `Beschikbaar ${beschikbaar} MB`] : ['Немає даних', 'Geen gegevens'] };
  },

  'belasting': async () => {
    const r = await draai('uptime', []);
    if (r.ontbreekt || r.timeout || !r.uit.trim()) return { status: 'info', bron: 'live', uitvoer: 'uptime недоступний / niet beschikbaar', samenvatting: ['Немає даних', 'Geen gegevens'] };
    const m = r.uit.match(/load average:\s*([\d.,]+)/i);
    const load = m ? Number(m[1].replace(',', '.')) : NaN;
    const cores = (await import('node:os')).cpus().length || 1;
    const status: CheckStatus = Number.isFinite(load) ? (load > cores * 2 ? 'fout' : load > cores ? 'let-op' : 'ok') : 'info';
    return { status, bron: 'live', uitvoer: `${r.uit.trim()}\nядер / cores: ${cores}`, samenvatting: Number.isFinite(load) ? [`Навантаження ${load} на ${cores} ядер`, `Belasting ${load} op ${cores} cores`] : ['Немає даних', 'Geen gegevens'] };
  },
};

// Elke id in de catalogus heeft een uitvoerder en omgekeerd (getest).
export const UITVOERBARE_IDS: readonly string[] = Object.keys(UITVOERDERS);
if (UITVOERBARE_IDS.slice().sort().join() !== CHECK_IDS.slice().sort().join()) console.error('[uitrol-diagnose-run] catalogus en uitvoerders lopen uiteen');

let bezig = false;
/** Eén controle uitvoeren. Gooit DiagnoseFout bij een onbekende id of als er al een controle loopt; de uitvoer is gemaskeerd en afgekapt. */
export async function voerCheckUit(idRaw: unknown): Promise<CheckUitslag> {
  const id = typeof idRaw === 'string' ? idRaw : '';
  if (!ID_VORM.test(id) || !Object.prototype.hasOwnProperty.call(UITVOERDERS, id)) throw new DiagnoseFout('CHECK_ONBEKEND', 400);
  if (bezig) throw new DiagnoseFout('DIAGNOSE_BEZIG', 429);
  bezig = true;
  const t0 = Date.now();
  try {
    let res: Intern;
    try { res = await Promise.race([UITVOERDERS[id](), new Promise<Intern>((_, nee) => setTimeout(() => nee(new Error('TIMEOUT')), 20_000).unref())]); }
    catch (e) { res = { status: 'fout', bron: 'app', uitvoer: `Перевірка не вдалася / controle mislukt: ${(e as Error).message === 'TIMEOUT' ? 'час вичерпано / time-out' : 'onverwachte fout'}`, samenvatting: ['Перевірка не вдалася', 'Controle mislukt'] }; }
    const { tekst, afgekapt } = kap(maskeer(res.uitvoer));
    return { id, status: res.status, bron: res.bron, ...(res.leeftijdSec != null ? { leeftijdSec: res.leeftijdSec } : {}), duurMs: Date.now() - t0, afgekapt, uitvoer: tekst, samenvatting: res.samenvatting, tijd: new Date().toISOString() };
  } finally { bezig = false; }
}

// ------------------------------------------------------------------------------------------------ route
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type Ctx = { event: Record<string, unknown>; body: unknown };
export type DiagnoseRunDeps = { requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }> };

export function uitrolDiagnoseRunRoutes(deps: DiagnoseRunDeps): Record<string, RouterMiddleware[]> {
  return {
    'POST /api/owner/uitrol/diagnose/uitvoeren': [(async (raw) => {
      const ctx = raw as unknown as Ctx;
      const auth = await deps.requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
      if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
      if (!isEigenaar(auth.user)) return error('OWNER_REQUIRED', 403);
      const b = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>;
      const limiet = await rateLimit(`uitrol-diagnose:${auth.user.id}`, 60, 600);
      if (!limiet.ok) return error('RATE_LIMITED', 429);
      const id = typeof b.id === 'string' ? b.id.slice(0, 60) : '';
      try {
        const uitslag = await voerCheckUit(b.id);
        await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: 'owner.uitrol.diagnose.uitgevoerd', type: 'beveiliging', result: 'success',
          details: { check: uitslag.id, status: uitslag.status, bron: uitslag.bron, duurMs: uitslag.duurMs }, service: 'admin' })
          .catch((err) => { console.error('[uitrol-diagnose-run] AUDIT MISLUKT:', (err as Error).message); });
        return json(uitslag);
      } catch (err) {
        if (err instanceof DiagnoseFout) {
          await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: 'owner.uitrol.diagnose.uitgevoerd', type: 'beveiliging', result: 'denied',
            details: { check: id.replace(/[^a-z0-9-]/gi, '_'), code: err.code }, service: 'admin' }).catch(() => undefined);
          return error(err.code, err.status);
        }
        console.error('[uitrol-diagnose-run]', (err as Error).message);
        return error('DIAGNOSE_FOUT', 500);
      }
    }) as RouterMiddleware],
  };
}
