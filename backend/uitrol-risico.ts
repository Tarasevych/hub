// ЧЕРВОНІ ПРАПОРЦІ перед схваленням (SEC-PAKKET-001, 16.11.2026, вибір власника «Підпис і прапорці»).
// RODE VLAGGEN vóór de goedkeuring.
//
// Навіщо: якщо хтось викраде токен GitHub і протягне шкідливу зміну через збірку GitHub Actions, пакет пройде всі перевірки
// справжності. Тоді останній захист — уважний погляд власника. Але переглядати сотні файлів кожного випуску ніхто не стане.
// Тому сайт порівнює пакет із ВСТАНОВЛЕНИМ випуском і окремо показує лише те, що дає найбільшу владу над сервером:
//   root      змінені, нові або прибрані файли в deploy/ (скрипти, служби systemd, sudoers, правила — їх виконує або ставить root)
//   залежності нові/прибрані/змінені пакети npm у package.json і скрипти встановлення (preinstall/install/postinstall/prepare)
//   джерела   у package-lock.json з’явилося нове джерело пакета поза registry.npmjs.org
//   процеси   змінені процеси GitHub Actions (.github/workflows)
//   SQL-права нові міграції з SECURITY DEFINER, ролями, вимкненням RLS, правами за замовчуванням, COPY … PROGRAM, розширеннями
// Знахідка = рівень «waarschuwing» з переліком; кнопка «Схвалити» вимагає окремого підтвердження (і сайт, і сервер перевіряють).
// Waarom: wie een GitHub-token steelt, kan een kwaadaardige wijziging door de echte build laten gaan; de laatste verdediging is de blik van
// de eigenaar. Daarom tonen we apart alleen wat de meeste macht over de server geeft, met een eigen bevestiging vóór het goedkeuren.
//
// Читаємо лише звичайні файли без переходу за посиланнями; код із пакета ніколи не виконується.
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const RISICO_MAX_VLAGGEN = 40;

/** Документація в deploy/ не виконується — її зміни не прапорці. Documentatie in deploy/ draait niet. */
const ROOT_DOC = /\.(?:md|txt)$/i;
const isRootBestand = (rel: string) => rel.startsWith('deploy/') && !ROOT_DOC.test(rel);
const isWerkstroom = (rel: string) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(rel);

const SQL_RECHTEN: Array<[RegExp, string]> = [
  [/\bSECURITY\s+DEFINER\b/i, 'SECURITY DEFINER (функція з правами власника схеми · functie met rechten van de eigenaar)'],
  [/\b(?:CREATE|ALTER)\s+(?:ROLE|USER)\b/i, 'CREATE/ALTER ROLE'],
  [/\b(?:SUPERUSER|BYPASSRLS|CREATEROLE)\b/i, 'SUPERUSER/BYPASSRLS/CREATEROLE'],
  [/\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i, 'DISABLE ROW LEVEL SECURITY'],
  [/\bNO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\b/i, 'NO FORCE ROW LEVEL SECURITY'],
  [/\bALTER\s+DEFAULT\s+PRIVILEGES\b/i, 'ALTER DEFAULT PRIVILEGES'],
  [/\bGRANT\b[^;]*\bTO\s+PUBLIC\b/i, 'GRANT … TO PUBLIC'],
  [/\bCOPY\b[^;]*\bPROGRAM\b/i, 'COPY … PROGRAM (команда ОС · opdracht van het besturingssysteem)'],
  [/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:EXTENSION|LANGUAGE)\b/i, 'CREATE EXTENSION/LANGUAGE'],
  [/\b(?:pg_read_file|pg_read_binary_file|pg_ls_dir|lo_import|lo_export|dblink|pg_execute_server_program)\b/i, 'доступ до файлів сервера · toegang tot bestanden van de server'],
];

/** Рядок SQL без коментарів (щоб «-- SECURITY DEFINER не потрібен» не давав прапорця). */
const zonderCommentaar = (sql: string) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

export function sqlRechtenVlaggen(naam: string, sql: string): string[] {
  const s = zonderCommentaar(sql);
  return SQL_RECHTEN.filter(([re]) => re.test(s)).map(([, t]) => `[SQL] ${naam}: ${t}`);
}

type Pkg = { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; overrides?: unknown; scripts?: Record<string, string> };
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'preprepare', 'postprepare'];

export function pakketJsonVlaggen(oudTekst: string | null, nieuwTekst: string | null): string[] {
  const lees = (t: string | null): Pkg | null => { if (!t) return null; try { const j = JSON.parse(t); return j && typeof j === 'object' ? j as Pkg : null; } catch { return null; } };
  const oud = lees(oudTekst); const nieuw = lees(nieuwTekst);
  if (!nieuw) return [];
  if (!oud) return ['[npm] package.json встановленої версії не прочитано — залежності не порівняно · package.json van de geïnstalleerde versie niet gelezen'];
  const uit: string[] = [];
  for (const groep of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
    const a = oud[groep] || {}; const b = nieuw[groep] || {};
    for (const n of Object.keys(b)) {
      if (!(n in a)) uit.push(`[npm] + ${n}@${String(b[n]).slice(0, 60)} (${groep})`);
      else if (String(a[n]) !== String(b[n])) uit.push(`[npm] ~ ${n}: ${String(a[n]).slice(0, 40)} → ${String(b[n]).slice(0, 40)} (${groep})`);
    }
    for (const n of Object.keys(a)) if (!(n in b)) uit.push(`[npm] − ${n} (${groep})`);
  }
  if (JSON.stringify(oud.overrides ?? null) !== JSON.stringify(nieuw.overrides ?? null)) uit.push('[npm] змінено overrides · overrides gewijzigd');
  for (const s of INSTALL_SCRIPTS) {
    const a = oud.scripts?.[s]; const b = nieuw.scripts?.[s];
    if ((a ?? null) !== (b ?? null)) uit.push(`[npm] скрипт встановлення «${s}» ${a == null ? 'додано' : b == null ? 'прибрано' : 'змінено'} · installatiescript «${s}» ${a == null ? 'toegevoegd' : b == null ? 'verwijderd' : 'gewijzigd'}`);
  }
  return uit;
}

/** Джерела пакетів у package-lock.json поза офіційним реєстром, яких не було у встановленій версії. */
export function lockBronVlaggen(oudTekst: string | null, nieuwTekst: string | null): string[] {
  const bronnen = (t: string | null) => {
    const s = new Set<string>(); if (!t) return s;
    for (const m of t.matchAll(/"resolved"\s*:\s*"([^"]{1,500})"/g)) if (!m[1].startsWith('https://registry.npmjs.org/')) s.add(m[1]);
    return s;
  };
  const oud = bronnen(oudTekst); const nieuw = bronnen(nieuwTekst);
  return [...nieuw].filter((u) => !oud.has(u)).sort().map((u) => `[lock] нове джерело пакета · nieuwe pakketbron: ${u.slice(0, 160)}`);
}

async function leesGewoon(pad: string, max = 4 * 1024 * 1024): Promise<Buffer | null> {
  const st = await lstat(pad).catch(() => null);
  if (!st || !st.isFile() || st.size > max) return null;
  return readFile(pad).catch(() => null);
}

/** Усі звичайні файли під `map` (відносно `wortel`), без переходу за посиланнями. */
async function lijstOnder(wortel: string, map: string, max = 5000): Promise<string[]> {
  const uit: string[] = [];
  const loop = async (rel: string) => {
    if (uit.length >= max) return;
    const items = await readdir(path.join(wortel, rel), { withFileTypes: true }).catch(() => []);
    for (const it of items) {
      const r = path.posix.join(rel, it.name);
      if (it.isDirectory()) await loop(r); else if (it.isFile()) uit.push(r);
    }
  };
  await loop(map);
  return uit;
}

export type RisicoUitkomst = { vergeleken: boolean; vlaggen: string[] };

/**
 * Порівнює розпакований пакет (`bron`) із встановленим випуском (`geinstalleerd`, корінь релізу з deploy/, package.json).
 * `pakketBestanden` — відносні шляхи файлів пакета; `nieuweMigraties` — назва → SQL лише НОВИХ міграцій.
 */
export async function risicoVlaggen(p: { bron: string; pakketBestanden: string[]; geinstalleerd: string | null | undefined; nieuweMigraties: ReadonlyMap<string, string> }): Promise<RisicoUitkomst> {
  const vlaggen: string[] = [];
  for (const [naam, sql] of p.nieuweMigraties) vlaggen.push(...sqlRechtenVlaggen(naam, sql));
  const inst = p.geinstalleerd && (await lstat(path.join(p.geinstalleerd, 'package.json')).catch(() => null))?.isFile() ? p.geinstalleerd : null;
  const pakket = p.pakketBestanden.map((f) => f.replace(/\\/g, '/'));
  const leesP = async (rel: string) => (await leesGewoon(path.join(p.bron, rel)))?.toString('utf8') ?? null;
  const leesI = async (rel: string) => (inst ? (await leesGewoon(path.join(inst, rel)))?.toString('utf8') ?? null : null);

  if (!inst) {
    // Без встановленої версії порівняти нема з чим: кажемо про це чесно, а шляхи root — усі «нові».
    vlaggen.unshift('[!] Встановлену версію не знайдено — пакет не порівняно з нею; перегляньте зміни особливо уважно · Geïnstalleerde versie niet gevonden — niet vergeleken');
    return { vergeleken: false, vlaggen: vlaggen.slice(0, RISICO_MAX_VLAGGEN) };
  }

  // root: deploy/ (крім документації) — нові, змінені, прибрані.
  const rootP = pakket.filter(isRootBestand).sort();
  const rootI = new Set((await lijstOnder(inst, 'deploy')).filter(isRootBestand));
  for (const f of rootP) {
    if (!rootI.has(f)) { vlaggen.push(`[root] + ${f}`); continue; }
    const a = await leesGewoon(path.join(inst, f)); const b = await leesGewoon(path.join(p.bron, f));
    if (!a || !b || !a.equals(b)) vlaggen.push(`[root] ~ ${f}`);
  }
  const rootPSet = new Set(rootP);
  for (const f of [...rootI].sort()) if (!rootPSet.has(f)) vlaggen.push(`[root] − ${f}`);

  // процеси GitHub Actions — лише якщо встановлена версія їх містить (інакше порівнювати нема з чим).
  const wfI = new Set((await lijstOnder(inst, '.github/workflows')).filter(isWerkstroom));
  if (wfI.size) {
    for (const f of pakket.filter(isWerkstroom).sort()) {
      if (!wfI.has(f)) vlaggen.push(`[CI] + ${f}`);
      else if ((await leesI(f)) !== (await leesP(f))) vlaggen.push(`[CI] ~ ${f}`);
    }
  }

  vlaggen.push(...pakketJsonVlaggen(await leesI('package.json'), await leesP('package.json')));
  vlaggen.push(...lockBronVlaggen(await leesI('package-lock.json'), await leesP('package-lock.json')));
  return { vergeleken: true, vlaggen: vlaggen.slice(0, RISICO_MAX_VLAGGEN) };
}

/** Чи вимагає ця перевірка окремого підтвердження власника (і сайт, і сервер беруть це правило звідси). */
export const vraagtRisicoBevestiging = (vc: { controles?: Array<{ id: string; niveau: string }> } | null | undefined): boolean =>
  !!vc?.controles?.some((c) => c.id === 'risico' && c.niveau !== 'ok');

/** Корінь встановленого випуску (той самий, з якого /api/version читає UITROL-VERSIE): на рівень вище dist. */
export const geinstalleerdeRelease = (): string => path.resolve(process.env.DIST_DIR || path.join(process.cwd(), 'dist'), '..');
