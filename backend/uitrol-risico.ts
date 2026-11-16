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
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

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

// ------------------------------------------------------------------------------------------------ пояснення людською мовою + «було → стало»
// Власник (16.11.2026): «треба розуміти, а не лише знати ці прапорці» і «треба знати, що конкретно в цьому файлі, до й після».
// Тому до кожного прапорця: що це за річ простими словами, що саме змінилося (різниця рядків), на що звернути увагу, і окремо —
// підозрілі нові рядки (завантаження з інтернету, root-права, ключі доступу…). Тексти uk + nl; різниця — справжній вміст файлів.
// Eigenaar: «begrijpen, niet alleen weten». Per vlag: uitleg in gewone taal, het echte verschil (voor → na) en verdachte nieuwe regels.

export type Tekst = { uk: string; nl: string };
export type RisicoItem = {
  vlag: string;
  /** Що це і чому важливо (простими словами). */ wat: Tekst;
  /** Що саме сталося з цією річчю в пакеті. */ wijziging: Tekst;
  /** На що звернути увагу перед схваленням. */ let: Tekst;
  /** Підозрілі нові рядки, знайдені в різниці. */ opvallend?: Tekst[];
  /** Що означають знайомі нові рядки (зокрема ті, що роблять безпечніше). */ betekenis?: Tekst[];
  /** Уніфікована різниця: рядки «-» = було (встановлена версія), «+» = стане (цей пакет). */ verschil?: string;
  verschilAfgekapt?: boolean;
  /** Для адміна без програмування: висновок, «було → стане» словами, порада. */ leesbaar?: Leesbaar;
  /** Ключ, за яким автор пояснює зміну в досьє (risicoUitleg[].pad) · sleutel voor de uitleg in het dossier. */ sleutel?: string;
  /** Пояснення автора з досьє випуску · uitleg van de maker uit het dossier. */ auteur?: Tekst;
};

const MAX_VERSCHIL_REGELS = 400;
const MAX_VERSCHIL_BYTES = 40_000;
const MAX_VERSCHIL_TOTAAL = 400_000;

function kap(tekst: string): { verschil: string; afgekapt: boolean } {
  let regels = tekst.split('\n'); let afgekapt = false;
  if (regels.length > MAX_VERSCHIL_REGELS) { regels = regels.slice(0, MAX_VERSCHIL_REGELS); afgekapt = true; }
  let uit = regels.join('\n');
  if (uit.length > MAX_VERSCHIL_BYTES) { uit = uit.slice(0, MAX_VERSCHIL_BYTES); afgekapt = true; }
  return { verschil: uit, afgekapt };
}
const isBinair = (b: Buffer) => b.subarray(0, 8000).includes(0);
const regelsMet = (teken: '+' | '-', tekst: string) => tekst.replace(/\n$/, '').split('\n').map((r) => teken + r).join('\n');

/** Справжня різниця двох версій файла (diff -u із системи; код із пакета не виконується, файли лише читаються). */
export async function bestandsVerschil(oudPad: string | null, nieuwPad: string | null, naam: string): Promise<{ verschil: string; afgekapt: boolean }> {
  const oud = oudPad ? await leesGewoon(oudPad, 8 * 1024 * 1024) : null;
  const nieuw = nieuwPad ? await leesGewoon(nieuwPad, 8 * 1024 * 1024) : null;
  if ((oud && isBinair(oud)) || (nieuw && isBinair(nieuw))) {
    const h = (b: Buffer | null) => (b ? createHash('sha256').update(b).digest('hex').slice(0, 16) : '—');
    return { verschil: `(двійковий файл · binair bestand) ${naam}\n- sha256 ${h(oud)}… (${oud?.length ?? 0} B)\n+ sha256 ${h(nieuw)}… (${nieuw?.length ?? 0} B)`, afgekapt: false };
  }
  if (!oud && nieuw) return kap(`--- (не було · bestond niet)\n+++ ${naam} (новий пакет · nieuw pakket)\n` + regelsMet('+', nieuw.toString('utf8')));
  if (oud && !nieuw) return kap(`--- ${naam} (встановлена версія · geïnstalleerd)\n+++ (прибрано · verwijderd)\n` + regelsMet('-', oud.toString('utf8')));
  if (!oud || !nieuw) return { verschil: '', afgekapt: false };
  try {
    await run('/usr/bin/diff', ['-u', '--label', `${naam} (було · voorheen)`, '--label', `${naam} (стане · straks)`, oudPad!, nieuwPad!], { maxBuffer: 16 * 1024 * 1024, timeout: 15_000, env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' } });
    return { verschil: '', afgekapt: false }; // diff 0 = однакові
  } catch (e) {
    const x = e as { code?: number; stdout?: string };
    if (x.code === 1 && typeof x.stdout === 'string') return kap(x.stdout.replace(/\n$/, ''));
    // Без diff: показуємо обидві версії повністю.
    return kap(`--- ${naam} (було · voorheen)\n+++ ${naam} (стане · straks)\n` + regelsMet('-', oud.toString('utf8')) + '\n' + regelsMet('+', nieuw.toString('utf8')));
  }
}

/** Підозрілі НОВІ рядки (лише ті, що починаються з «+»). Пояснення, а не вирок: власник вирішує сам. */
const OPVALLEND: Array<[RegExp, string, string]> = [
  [/\b(?:curl|wget|Invoke-WebRequest|iwr)\b/i, 'завантаження чогось з інтернету (curl/wget): перевірте адресу; якщо результат одразу виконується (| bash, | sh) — це прямий запуск чужого коду з правами root', 'iets van internet downloaden (curl/wget): controleer het adres; wordt het meteen uitgevoerd (| bash, | sh), dan is dat vreemde code met root-rechten'],
  [/\|\s*(?:ba)?sh\b|\beval\b|base64\s+(?:-d|--decode)/i, 'виконання тексту як команди (| bash, eval, base64 -d): так ховають шкідливий код', 'tekst als opdracht uitvoeren (| bash, eval, base64 -d): zo wordt kwaadaardige code verstopt'],
  [/\b(?:nc|ncat|socat|telnet)\s+-?\w*\s*[\w.-]+\s+\d+|\/dev\/tcp\//i, 'пряме мережеве з’єднання (nc, /dev/tcp): так відкривають «задні двері» до сервера', 'rechtstreekse netwerkverbinding (nc, /dev/tcp): zo opent men een achterdeur'],
  [/authorized_keys|ssh-keygen|\bAuthorizedKeys/i, 'робота з SSH-ключами: хтось може додати свій ключ і заходити на сервер без пароля', 'werken met SSH-sleutels: iemand kan zijn eigen sleutel toevoegen en zonder wachtwoord inloggen'],
  [/NOPASSWD|\bsudoers\b|\bvisudo\b/i, 'права sudo: хтось отримує право виконувати команди від root без пароля', 'sudo-rechten: iemand mag opdrachten als root uitvoeren zonder wachtwoord'],
  [/\b(?:useradd|adduser|usermod|passwd|chpasswd)\b/i, 'створення або зміна користувачів сервера чи паролів', 'gebruikers of wachtwoorden van de server aanmaken of wijzigen'],
  [/chmod\s+(?:-R\s+)?(?:[0-7]?777|[ugoa]*\+s|u\+s|4[0-7]{3})/i, 'відкриті права (777) або setuid: файл зможе змінити будь-хто або він запускатиметься від root', 'open rechten (777) of setuid: iedereen kan het bestand wijzigen of het draait als root'],
  [/\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|\bshred\b|\bmkfs\b|\bdd\s+if=/i, 'масове видалення чи затирання (rm -rf, shred, dd): перевірте, що саме видаляється', 'massaal verwijderen of overschrijven (rm -rf, shred, dd): controleer wat er weg gaat'],
  [/^\+\s*(?:User|Group)\s*=\s*root\b|^\+\s*User\s*=\s*$/im, 'служба запускатиметься від імені root (повні права)', 'de dienst draait voortaan als root (volledige rechten)'],
  [/\b(?:CapabilityBoundingSet|AmbientCapabilities)\b|\bNoNewPrivileges\s*=\s*(?:no|false)|\bProtectSystem\s*=\s*(?:no|false)|\bPrivateTmp\s*=\s*(?:no|false)/i, 'послаблення захисту служби (можливості, NoNewPrivileges, ProtectSystem)', 'beveiliging van de dienst afgezwakt (capabilities, NoNewPrivileges, ProtectSystem)'],
  [/\$\{\{\s*secrets\.|pull_request_target|workflow_run|permissions:\s*write-all|contents:\s*write/i, 'процес GitHub отримує секрети або права запису: украдений токен дав би більше влади', 'GitHub-werkstroom krijgt geheimen of schrijfrechten: een gestolen token geeft dan meer macht'],
  [/uses:\s*[^\s#]+@(?![0-9a-f]{40}\b)/i, 'стороння дія GitHub не закріплена за хешем: її автор може непомітно змінити код', 'externe GitHub-actie niet vastgezet op een hash: de maker kan de code ongemerkt wijzigen'],
  [/\b(?:https?:\/\/(?!(?:[\w-]+\.)*(?:tarasevych\.com|github\.com|githubusercontent\.com|npmjs\.org|nodejs\.org|debian\.org|ubuntu\.com|cloudflare\.com|google\.com|googleapis\.com)\b)[\w.-]+)/i, 'нова адреса в інтернеті поза звичними (GitHub, npm, Google, Cloudflare, власний домен): перевірте, кому вона належить', 'nieuw internetadres buiten de gebruikelijke (GitHub, npm, Google, Cloudflare, eigen domein): controleer van wie het is'],
];
export function opvallendeRegels(verschil: string): Tekst[] {
  // Лише справді нові рядки: рядок, що просто переїхав (є і серед прибраних «-»), не підозрілий.
  const weg = new Set(verschil.split('\n').filter((r) => r.startsWith('-') && !r.startsWith('---')).map((r) => r.slice(1).trim()));
  const nieuw = verschil.split('\n').filter((r) => r.startsWith('+') && !r.startsWith('+++') && !weg.has(r.slice(1).trim())).join('\n');
  if (!nieuw) return [];
  const uit: Tekst[] = [];
  for (const [re, uk, nl] of OPVALLEND) {
    const m = nieuw.split('\n').find((r) => re.test(r));
    if (m) uit.push({ uk: `${uk}. Рядок: ${m.slice(1).trim().slice(0, 160)}`, nl: `${nl}. Regel: ${m.slice(1).trim().slice(0, 160)}` });
  }
  return uit;
}


/** Знайомі нові рядки, які роблять систему БЕЗПЕЧНІШОЮ або є звичайними: пояснюємо, щоб власник не гадав. */
const BETEKENIS: Array<[RegExp, string, string]> = [
  [/uses:\s*[^\s#]+@[0-9a-f]{40}\b/i, 'дію GitHub закріплено за точною версією (хешем): її автор уже не зможе непомітно підмінити код. Це безпечніше', 'GitHub-actie vastgezet op een exacte versie (hash): de maker kan de code niet meer ongemerkt wijzigen. Dat is veiliger'],
  [/persist-credentials:\s*false/i, 'після завантаження коду токен GitHub не лишається на диску, тож наступні кроки його не бачать. Це безпечніше', 'na het ophalen van de code blijft het GitHub-token niet op schijf staan, dus volgende stappen zien het niet. Dat is veiliger'],
  [/--ignore-scripts/i, 'пакети npm встановлюються без запуску їхніх власних скриптів. Це безпечніше', 'npm-pakketten worden geïnstalleerd zonder hun eigen scripts uit te voeren. Dat is veiliger'],
  [/^\+\s*permissions:|contents:\s*read/im, 'процесу GitHub дано лише право читання. Це безпечніше', 'de GitHub-werkstroom krijgt alleen leesrecht. Dat is veiliger'],
  [/NoNewPrivileges\s*=\s*(?:yes|true)|ProtectSystem\s*=\s*(?:strict|full)|PrivateTmp\s*=\s*(?:yes|true)|ProtectHome\s*=\s*(?:yes|true|read-only)/i, 'службу додатково обмежено (не може підвищити права чи змінювати систему). Це безпечніше', 'de dienst is extra beperkt (kan geen rechten verhogen of het systeem wijzigen). Dat is veiliger'],
  [/^\+\s*#/m, 'додано коментарі: пояснення в тексті файла, на роботу не впливають', 'opmerkingen toegevoegd: uitleg in het bestand, geen invloed op de werking'],
];
export function betekenisRegels(verschil: string): Tekst[] {
  const nieuw = verschil.split('\n').filter((r) => r.startsWith('+') && !r.startsWith('+++'));
  const uit: Tekst[] = [];
  for (const [re, uk, nl] of BETEKENIS) {
    const n = nieuw.filter((r) => re.test(r)).length;
    if (n) uit.push({ uk: `${uk} (${n} ${n === 1 ? 'рядок' : 'рядків'})`, nl: `${nl} (${n} ${n === 1 ? 'regel' : 'regels'})` });
  }
  return uit;
}

/** Що це за файл у deploy/ — простими словами. */
function watRootBestand(f: string): Tekst {
  const b = path.posix.basename(f);
  if (/sudoers/i.test(f)) return { uk: 'Правило sudo: визначає, кому на сервері дозволено виконувати команди від імені root (найвищі права).', nl: 'sudo-regel: bepaalt wie op de server opdrachten als root (hoogste rechten) mag uitvoeren.' };
  if (/\.service$/.test(b)) return { uk: 'Служба systemd: програма, яку сервер сам запускає й тримає ввімкненою. У ній записано, що саме запускається (ExecStart), від чийого імені (User) і до чого має доступ.', nl: 'systemd-dienst: een programma dat de server zelf start en draaiende houdt. Erin staat wat er start (ExecStart), als wie (User) en waar het bij mag.' };
  if (/\.timer$/.test(b)) return { uk: 'Таймер systemd: розклад, за яким сервер автоматично запускає певну службу (наприклад, щогодини).', nl: 'systemd-timer: een schema waarop de server automatisch een dienst start (bijvoorbeeld elk uur).' };
  if (/\.path$/.test(b)) return { uk: 'Стеження за текою (systemd .path): сервер запускає дію, щойно в теці з’являється чи змінюється файл. Так, наприклад, працює схвалення оновлень.', nl: 'Mapbewaking (systemd .path): de server start een actie zodra er een bestand in een map verschijnt of verandert. Zo werkt bijvoorbeeld het goedkeuren van updates.' };
  if (/\.(?:sh|bash)$/.test(b)) return { uk: 'Скрипт командного рядка, який виконується від імені root, тобто з повними правами на сервері: може змінити, прочитати або видалити будь-що.', nl: 'Shell-script dat als root draait, dus met volledige rechten op de server: het kan alles wijzigen, lezen of verwijderen.' };
  if (/\.(?:py|mjs|js|cjs|ts)$/.test(b)) return { uk: 'Програма, яку сервер запускає під час встановлення чи обслуговування, часто з правами root.', nl: 'Programma dat de server tijdens installatie of onderhoud uitvoert, vaak met root-rechten.' };
  if (/^deploy\/opa\//.test(f)) return { uk: 'Правило доступу (OPA): вирішує, що дозволено агентам і користувачам. Зміна може відкрити доступ, який раніше був заборонений.', nl: 'Toegangsregel (OPA): bepaalt wat agenten en gebruikers mogen. Een wijziging kan toegang openen die eerder verboden was.' };
  if (/\.(?:json|ya?ml|conf|cfg|ini|toml)$/.test(b)) return { uk: 'Файл налаштувань, який сервер установлює з правами root (наприклад, для служб, мережі чи прав).', nl: 'Instellingenbestand dat de server met root-rechten installeert (bijvoorbeeld voor diensten, netwerk of rechten).' };
  return { uk: 'Файл із теки deploy/: сервер установлює або використовує його з правами root.', nl: 'Bestand uit deploy/: de server installeert of gebruikt het met root-rechten.' };
}

const SQL_UITLEG: Array<[RegExp, Tekst]> = [
  [/SECURITY DEFINER/, { uk: 'Функція в базі виконується з правами власника бази, а не того, хто її викликає. Якщо в ній помилка чи навмисна дірка, звичайний користувач обійде обмеження доступу до чужих даних.', nl: 'Een databasefunctie draait met de rechten van de eigenaar, niet van wie haar aanroept. Bevat ze een fout of een opzettelijk gat, dan omzeilt een gewone gebruiker de toegangsregels.' }],
  [/ROLE|SUPERUSER|BYPASSRLS|CREATEROLE/, { uk: 'Створення або зміна ролі бази (облікового запису). BYPASSRLS чи SUPERUSER дають право бачити всі дані всіх користувачів.', nl: 'Een databaserol (account) aanmaken of wijzigen. BYPASSRLS of SUPERUSER geven toegang tot alle gegevens van alle gebruikers.' }],
  [/ROW LEVEL SECURITY/, { uk: 'Вимкнення захисту рядків (RLS): саме він не дає одному користувачеві бачити дані іншого.', nl: 'Rijbeveiliging (RLS) uitgezet: juist die voorkomt dat de ene gebruiker de gegevens van de andere ziet.' }],
  [/DEFAULT PRIVILEGES/, { uk: 'Права за замовчуванням: усі МАЙБУТНІ таблиці автоматично отримають ці права.', nl: 'Standaardrechten: alle TOEKOMSTIGE tabellen krijgen deze rechten automatisch.' }],
  [/PUBLIC/, { uk: 'Права «для всіх» (PUBLIC): доступ отримує кожна роль бази.', nl: 'Rechten «voor iedereen» (PUBLIC): elke databaserol krijgt toegang.' }],
  [/PROGRAM/, { uk: 'COPY … PROGRAM: база запускає команду операційної системи сервера.', nl: 'COPY … PROGRAM: de database voert een opdracht van het besturingssysteem uit.' }],
  [/EXTENSION|LANGUAGE/, { uk: 'Розширення чи мова в базі: додає до бази нові можливості, деякі з них можуть звертатися до файлів чи мережі.', nl: 'Extensie of taal in de database: voegt mogelijkheden toe, sommige kunnen bestanden of het netwerk bereiken.' }],
  [/файл|bestand/, { uk: 'Доступ бази до файлів сервера чи інших баз (pg_read_file, lo_import, dblink).', nl: 'Toegang van de database tot bestanden van de server of andere databases (pg_read_file, lo_import, dblink).' }],
];

/** Рядки міграції, через які спрацював прапорець, з номерами (лише текст SQL, без виконання). */
function sqlFragment(sql: string, vlag: string): string {
  const re = SQL_RECHTEN.find(([, t]) => vlag.endsWith(t))?.[0];
  const regels = sql.split('\n');
  const uit: string[] = [];
  regels.forEach((r, i) => { if (re && re.test(r)) for (let j = Math.max(0, i - 2); j <= Math.min(regels.length - 1, i + 2); j++) uit.push(`${String(j + 1).padStart(4)}  ${regels[j]}`); });
  return [...new Set(uit)].join('\n') || regels.slice(0, 40).map((r, i) => `${String(i + 1).padStart(4)}  ${r}`).join('\n');
}

const ZIN: Record<string, Tekst> = {
  '+': { uk: 'Це НОВИЙ файл: у встановленій версії його не було. Нижче весь його вміст.', nl: 'Dit is een NIEUW bestand: het bestond niet in de geïnstalleerde versie. Hieronder de hele inhoud.' },
  '~': { uk: 'Файл ЗМІНЕНО. Нижче різниця: рядки з «−» (червоні) були у встановленій версії, рядки з «+» (зелені) з’являться після встановлення.', nl: 'Het bestand is GEWIJZIGD. Hieronder het verschil: regels met «−» (rood) stonden in de geïnstalleerde versie, regels met «+» (groen) komen erbij.' },
  '−': { uk: 'Файл ПРИБРАНО: після встановлення його не буде. Нижче, що в ньому було.', nl: 'Het bestand wordt VERWIJDERD. Hieronder wat erin stond.' },
};

/** Пояснення й різниця для кожного прапорця. Сервер зберігає це разом із перевіркою; сайт показує при розгортанні. */
export async function verklaarVlaggen(vlaggen: string[], p: { bron: string; geinstalleerd: string | null | undefined; nieuweMigraties: ReadonlyMap<string, string> }): Promise<RisicoItem[]> {
  const inst = p.geinstalleerd && (await lstat(path.join(p.geinstalleerd, 'package.json')).catch(() => null))?.isFile() ? p.geinstalleerd : null;
  const items: RisicoItem[] = []; let totaal = 0;
  const metVerschil = (item: RisicoItem, v: { verschil: string; afgekapt: boolean }) => {
    if (!v.verschil) return item;
    if (totaal + v.verschil.length > MAX_VERSCHIL_TOTAAL) return { ...item, verschil: '(різниця не вміщається в запис перевірки; подивіться коміт на GitHub · verschil past niet; zie de commit op GitHub)', verschilAfgekapt: true };
    totaal += v.verschil.length;
    const opv = opvallendeRegels(v.verschil); const bet = betekenisRegels(v.verschil);
    return { ...item, verschil: v.verschil, ...(v.afgekapt ? { verschilAfgekapt: true } : {}), ...(opv.length ? { opvallend: opv } : {}), ...(bet.length ? { betekenis: bet } : {}) };
  };
  for (const vlag of vlaggen) {
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(vlag); const soort = m?.[1] ?? '!'; const rest = m?.[2] ?? vlag;
    if (soort === 'root' || soort === 'CI') {
      const teken = rest[0] as '+' | '~' | '−'; const f = rest.slice(2).trim();
      const wat = soort === 'root' ? watRootBestand(f) : { uk: 'Процес GitHub Actions: інструкція, за якою GitHub сам збирає й публікує випуск. Від неї залежить, що саме потрапить в архів для сервера.', nl: 'GitHub Actions-werkstroom: het recept waarmee GitHub de release bouwt en publiceert. Het bepaalt wat er in het archief voor de server komt.' };
      const v = await bestandsVerschil(teken === '+' ? null : inst ? path.join(inst, f) : null, teken === '−' ? null : path.join(p.bron, f), f);
      const lt: Tekst = soort === 'root'
        ? { uk: 'Перегляньте зелені рядки (+). Якщо ви не замовляли цієї зміни або не розумієте, навіщо вона, — відхиліть пакет і спитайте автора. Особливо насторожують: завантаження з інтернету, нові ключі чи користувачі, sudo, root.', nl: 'Bekijk de groene regels (+). Hebt u deze wijziging niet gevraagd of begrijpt u niet waarom, wijs het pakket dan af en vraag het de maker. Extra verdacht: downloads van internet, nieuwe sleutels of gebruikers, sudo, root.' }
        : { uk: 'Погано, якщо в нових рядках з’явилися секрети (secrets.), запис у репозиторій, нові сторонні дії без хеша або запуск на чужому коді (pull_request_target).', nl: 'Slecht als nieuwe regels geheimen (secrets.), schrijfrechten, externe acties zonder hash of uitvoering op vreemde code (pull_request_target) toevoegen.' };
      items.push(metVerschil({ vlag, wat, wijziging: ZIN[teken] ?? ZIN['~'], let: lt }, v));
    } else if (soort === 'npm') {
      const pkg = /^([+~−])\s+(@?[^@\s:]+)(?:@|:\s*)?(.*)$/.exec(rest);
      const wat = { uk: 'Пакет npm — це чужий готовий код, який сайт використовує. Під час збирання на сервері він завантажується з інтернету й виконується.', nl: 'Een npm-pakket is kant-en-klare code van anderen die de site gebruikt. Bij het bouwen op de server wordt het gedownload en uitgevoerd.' };
      let wijziging: Tekst; let lt: Tekst; let verschil = '';
      if (/скрипт встановлення|installatiescript/.test(rest)) {
        wijziging = { uk: 'Змінено скрипт npm, що запускається АВТОМАТИЧНО під час встановлення пакетів.', nl: 'Een npm-script dat AUTOMATISCH draait bij het installeren van pakketten is gewijzigd.' };
        lt = { uk: 'Саме так найчастіше підкидають шкідливий код. Якщо ви цього не замовляли — відхиліть.', nl: 'Zo wordt het vaakst kwaadaardige code binnengesmokkeld. Niet gevraagd? Afwijzen.' };
      } else if (/overrides/.test(rest)) {
        wijziging = { uk: 'Змінено overrides: примусова заміна версій пакетів усередині інших пакетів.', nl: 'overrides gewijzigd: versies van pakketten binnen andere pakketten worden geforceerd.' };
        lt = { uk: 'Переконайтеся, що заміна потрібна (зазвичай для виправлення вразливості).', nl: 'Controleer dat de vervanging nodig is (meestal om een lek te dichten).' };
      } else if (pkg?.[1] === '+') {
        wijziging = { uk: `Додано новий пакет «${pkg[2]}» версії ${pkg[3]}.`, nl: `Nieuw pakket «${pkg[2]}» versie ${pkg[3]} toegevoegd.` };
        lt = { uk: `Перевірте назву літера в літеру: шахраї публікують пакети зі схожими назвами. Відкрийте https://www.npmjs.com/package/${pkg[2]} — чи це відомий пакет із багатьма завантаженнями?`, nl: `Controleer de naam letter voor letter: oplichters publiceren pakketten met lijkende namen. Open https://www.npmjs.com/package/${pkg[2]} — is het een bekend pakket met veel downloads?` };
        verschil = `+ "${pkg[2]}": "${pkg[3].replace(/\s*\(.*$/, '')}"`;
      } else if (pkg?.[1] === '~') {
        const [a, b] = pkg[3].replace(/\s*\(.*$/, '').split(' → ');
        wijziging = { uk: `Пакет «${pkg[2]}» оновлено: було ${a}, стане ${b}.`, nl: `Pakket «${pkg[2]}» bijgewerkt: was ${a}, wordt ${b}.` };
        lt = { uk: 'Оновлення зазвичай безпечні. Насторожує, якщо версія стрибнула незвично (наприклад, з 2.x на 9.x) або пакет маловідомий.', nl: 'Updates zijn meestal veilig. Verdacht bij een ongewone sprong (bv. 2.x → 9.x) of een onbekend pakket.' };
        verschil = `- "${pkg[2]}": "${a}"\n+ "${pkg[2]}": "${b}"`;
      } else {
        wijziging = { uk: `Пакет «${pkg?.[2] ?? rest}» прибрано.`, nl: `Pakket «${pkg?.[2] ?? rest}» verwijderd.` };
        lt = { uk: 'Прибрання пакета зазвичай безпечне.', nl: 'Een pakket verwijderen is meestal veilig.' };
        verschil = `- "${pkg?.[2] ?? rest}"`;
      }
      items.push({ vlag, wat, wijziging, let: lt, ...(verschil ? { verschil } : {}) });
    } else if (soort === 'lock') {
      const url = rest.split(': ').slice(1).join(': ');
      items.push({ vlag, wat: { uk: 'package-lock.json — точний список, звідки сервер завантажує кожен пакет npm.', nl: 'package-lock.json — de exacte lijst waar de server elk npm-pakket vandaan haalt.' },
        wijziging: { uk: `Один пакет завантажуватиметься не з офіційного реєстру npm, а з адреси ${url}.`, nl: `Eén pakket komt niet uit het officiële npm-register maar van ${url}.` },
        let: { uk: 'Безпечно лише якщо ви знаєте цю адресу і довіряєте їй. Чужа адреса = чужий код на сервері.', nl: 'Alleen veilig als u dit adres kent en vertrouwt. Vreemd adres = vreemde code op de server.' }, verschil: `+ "resolved": "${url}"` });
    } else if (soort === 'SQL') {
      const naam = rest.split(':')[0]; const sql = p.nieuweMigraties.get(naam) ?? '';
      const u = SQL_UITLEG.find(([re]) => re.test(rest))?.[1] ?? { uk: 'Зміна прав у базі даних.', nl: 'Wijziging van rechten in de database.' };
      items.push({ vlag, wat: { uk: `Міграція «${naam}» — інструкція, яка змінює будову бази даних. Вона виконується один раз під час встановлення і при відкаті НЕ скасовується.`, nl: `Migratie «${naam}» — een opdracht die de opbouw van de database wijzigt. Ze draait één keer bij de installatie en wordt bij terugdraaien NIET teruggedraaid.` },
        wijziging: u, let: { uk: 'Нижче рядки, через які спрацював прапорець. Якщо незрозуміло, навіщо їх додано, — попросіть автора пояснити до схвалення.', nl: 'Hieronder de regels die de vlag gaven. Is niet duidelijk waarom ze er staan, vraag de maker dan om uitleg vóór het goedkeuren.' },
        ...(sql ? { verschil: kap(sqlFragment(sql, vlag)).verschil } : {}) });
    } else if (soort === 'GitHub') {
      items.push({ vlag, wat: { uk: 'Випуск на GitHub — місце, звідки сайт бере архів оновлення. Зазвичай архів туди кладе сам GitHub Actions після автоматичної збірки й тестів.', nl: 'De GitHub-release is waar de site het update-archief vandaan haalt. Normaal zet GitHub Actions het daar na de automatische build en tests.' },
        wijziging: { uk: `Цей архів поклала людина вручну (${rest.match(/\(([^)]+)\)/)?.[1] ?? 'невідомо'}), а не автоматична збірка.`, nl: `Dit archief is met de hand geplaatst (${rest.match(/\(([^)]+)\)/)?.[1] ?? 'onbekend'}), niet door de automatische build.` },
        let: { uk: 'Якщо це зробили ви — усе гаразд. Якщо ні — відхиліть пакет і змініть пароль та токени GitHub: так виглядає підробка з украденим доступом.', nl: 'Deed u dat zelf, dan is het goed. Zo niet: afwijzen en uw GitHub-wachtwoord en tokens wijzigen — zo ziet een vervalsing met gestolen toegang eruit.' } });
    } else {
      items.push({ vlag, wat: { uk: 'Сайт не зміг порівняти пакет із встановленою версією.', nl: 'De site kon het pakket niet met de geïnstalleerde versie vergelijken.' },
        wijziging: { uk: 'Тому не видно, що саме змінено у файлах root і залежностях.', nl: 'Daardoor is niet te zien wat er in root-bestanden en afhankelijkheden verandert.' },
        let: { uk: 'Схвалюйте лише пакет, про зміст якого ви знаєте з інших джерел (опис випуску, PR).', nl: 'Keur alleen een pakket goed waarvan u de inhoud uit andere bron kent (releasebeschrijving, PR).' } });
    }
  }
  return items.map((it) => ({ ...it, leesbaar: leesbaarVoor(it) }));
}

// ------------------------------------------------------------------------------------------------ для адміна без програмування
// Власник (16.11.2026): «якщо встановлює адмін, а не програміст, йому ці коди нічого не скажуть … треба людською мовою, що має
// бути та що є, і що йому робити». Тому з різниці виводимо: «було → стане» звичайними реченнями (для знайомих налаштувань),
// висновок (безпечніше / звичайна зміна / потребує уваги) і одну пораду, що робити. Код лишається лише «для програміста».
// Voor een beheerder zonder programmeerkennis: voor → na in gewone zinnen, een oordeel en één advies wat te doen.

export type Oordeel = 'veiliger' | 'gewoon' | 'aandacht';
export type VoorNa = { voor: Tekst | null; na: Tekst | null; keer?: number };
export type Leesbaar = { oordeel: Oordeel; kort: Tekst; voorNa: VoorNa[]; overig: number; doen: Tekst;
  /** Без пояснення автора таку зміну не схвалити: перевірка пакета блокує встановлення · zonder uitleg blokkeert de voorcontrole. */ uitlegNodig?: boolean };

type Zin = { uk: string; nl: string; veiliger?: boolean; risico?: boolean } | null;
/** Один рядок налаштувань → речення. null = незнайомий рядок (логіка програми). */
function zinVoor(r: string): Zin | 'stil' {
  const t = r.trim();
  if (!t || /^#/.test(t) || /^\/\//.test(t)) return 'stil';
  let m = /^-?\s*uses:\s*([^@\s]+)@(\S+)(?:\s*#\s*(\S+))?/.exec(t);
  if (m) {
    const naam = m[1]; const hash = /^[0-9a-f]{40}$/.test(m[2]);
    return hash ? { uk: `готовий модуль GitHub «${naam}» точної версії ${m[3] || m[2].slice(0, 7)} (закріплено, підмінити не можна)`, nl: `kant-en-klare GitHub-module «${naam}» exacte versie ${m[3] || m[2].slice(0, 7)} (vastgezet, niet te vervangen)`, veiliger: true }
      : { uk: `готовий модуль GitHub «${naam}» за міткою «${m[2]}» (його автор може непомітно змінити вміст)`, nl: `kant-en-klare GitHub-module «${naam}» via label «${m[2]}» (de maker kan de inhoud ongemerkt wijzigen)` };
  }
  if (/^persist-credentials:\s*false/.test(t)) return { uk: 'ключ доступу GitHub не зберігається на диску після завантаження коду', nl: 'de GitHub-toegangssleutel blijft na het ophalen van de code niet op schijf', veiliger: true };
  if ((m = /\bnpm\s+(ci|install|i)\b(.*)$/.exec(t))) return /--ignore-scripts/.test(m[2])
    ? { uk: 'встановлення пакетів без запуску їхніх власних програм', nl: 'pakketten installeren zonder hun eigen programma’s te starten', veiliger: true }
    : { uk: 'встановлення пакетів разом із запуском їхніх власних програм', nl: 'pakketten installeren én hun eigen programma’s starten', risico: true };
  if ((m = /^User\s*=\s*(\S*)/.exec(t))) return m[1] === 'root' || !m[1] ? { uk: 'служба працює від імені root (повні права на сервері)', nl: 'de dienst draait als root (volledige rechten op de server)', risico: true } : { uk: `служба працює від імені обмеженого користувача «${m[1]}»`, nl: `de dienst draait als beperkte gebruiker «${m[1]}»` };
  if ((m = /^ExecStart\w*\s*=\s*(.+)$/.exec(t))) return { uk: `служба запускає: ${m[1].slice(0, 120)}`, nl: `de dienst start: ${m[1].slice(0, 120)}` };
  if ((m = /^OnCalendar\s*=\s*(.+)$/.exec(t))) return { uk: `автоматичний запуск за розкладом: ${kalender(m[1], 'uk')}`, nl: `automatisch starten volgens schema: ${kalender(m[1], 'nl')}` };
  if ((m = /^OnUnitActiveSec\s*=\s*(.+)$/.exec(t))) return { uk: `повторний запуск кожні ${m[1]}`, nl: `opnieuw starten elke ${m[1]}` };
  if ((m = /^Environment\s*=\s*"?([A-Z0-9_]+)=/.exec(t))) return { uk: `налаштування служби «${m[1]}» (значення не показуємо)`, nl: `dienstinstelling «${m[1]}» (waarde niet getoond)` };
  if ((m = /^(ReadWritePaths|ReadOnlyPaths)\s*=\s*(.+)$/.exec(t))) return m[1] === 'ReadWritePaths' ? { uk: `служба може змінювати теки: ${m[2].slice(0, 120)}`, nl: `de dienst mag mappen wijzigen: ${m[2].slice(0, 120)}` } : { uk: `служба може лише читати теки: ${m[2].slice(0, 120)}`, nl: `de dienst mag mappen alleen lezen: ${m[2].slice(0, 120)}`, veiliger: true };
  if (/^(NoNewPrivileges\s*=\s*(yes|true)|ProtectSystem\s*=\s*(strict|full)|PrivateTmp\s*=\s*(yes|true)|ProtectHome\s*=\s*(yes|true|read-only))/i.test(t)) return { uk: `додаткове обмеження служби (${t.split('=')[0].trim()})`, nl: `extra beperking van de dienst (${t.split('=')[0].trim()})`, veiliger: true };
  if ((m = /^(contents|packages|id-token|actions|pull-requests|issues):\s*(read|write|none)/.exec(t))) return m[2] === 'write' ? { uk: `процес GitHub може ЗМІНЮВАТИ «${m[1]}»`, nl: `de GitHub-werkstroom mag «${m[1]}» WIJZIGEN`, risico: true } : { uk: `процес GitHub може лише читати «${m[1]}»`, nl: `de GitHub-werkstroom mag «${m[1]}» alleen lezen`, veiliger: true };
  if (/^(on:|pull_request_target|workflow_run|issue_comment)/.test(t) && /pull_request_target|workflow_run|issue_comment/.test(t)) return { uk: 'процес GitHub запускається на чужому коді з правами репозиторію', nl: 'de GitHub-werkstroom draait op vreemde code met de rechten van de repository', risico: true };
  if (/\$\{\{\s*secrets\./.test(t)) return { uk: 'процес GitHub читає секретні ключі репозиторію', nl: 'de GitHub-werkstroom leest geheime sleutels van de repository', risico: true };
  return null;
}
function kalender(v: string, taal: 'uk' | 'nl'): string {
  const s = v.trim();
  const w: Record<string, [string, string]> = { hourly: ['щогодини', 'elk uur'], daily: ['щодня', 'dagelijks'], weekly: ['щотижня', 'wekelijks'], monthly: ['щомісяця', 'maandelijks'] };
  if (w[s]) return w[s][taal === 'uk' ? 0 : 1];
  const m = /^\*-\*-\*\s+(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (m) return taal === 'uk' ? `щодня о ${m[1].padStart(2, '0')}:${m[2]}` : `dagelijks om ${m[1].padStart(2, '0')}:${m[2]}`;
  return s;
}

/** Різницю (diff -u) → пари «було → стане» звичайними словами + кількість рядків логіки, яку словами не пояснити. */
export function leesbaarVerschil(verschil: string): { voorNa: VoorNa[]; overig: number; veiliger: number; risico: number } {
  const voorNa: VoorNa[] = []; let overig = 0; let veiliger = 0; let risico = 0;
  const blokken: Array<{ min: string[]; plus: string[] }> = []; let cur: { min: string[]; plus: string[] } | null = null;
  for (const r of verschil.split('\n')) {
    if (r.startsWith('---') || r.startsWith('+++') || r.startsWith('@@')) { cur = null; continue; }
    if (r[0] === '-' || r[0] === '+') {
      if (!cur || (r[0] === '-' && cur.plus.length)) { cur = { min: [], plus: [] }; blokken.push(cur); }
      (r[0] === '-' ? cur.min : cur.plus).push(r.slice(1));
    } else cur = null;
  }
  // Речення, що є і серед «було», і серед «стане» (рядок переїхав або змінено лише відступ), — не зміна.
  const alleMin = new Set(blokken.flatMap((b) => b.min.map(zinVoor)).filter((z): z is Exclude<Zin, null> => !!z && z !== 'stil').map((z) => z.uk));
  const allePlus = new Set(blokken.flatMap((b) => b.plus.map(zinVoor)).filter((z): z is Exclude<Zin, null> => !!z && z !== 'stil').map((z) => z.uk));
  for (const b of blokken) {
    const zm = b.min.map(zinVoor).filter((z) => z !== 'stil'); const zp = b.plus.map(zinVoor).filter((z) => z !== 'stil');
    const n = Math.max(zm.length, zp.length);
    for (let i = 0; i < n; i++) {
      const a = zm[i] ?? null; const c = zp[i] ?? null;
      if ((a === null && i < zm.length) || (c === null && i < zp.length)) { overig++; continue; }
      if (!a && !c) continue;
      const za = a as Exclude<Zin, null> | null; const zc = c as Exclude<Zin, null> | null;
      if (za && zc && za.uk === zc.uk) continue;
      if ((zc && !za && alleMin.has(zc.uk)) || (za && !zc && allePlus.has(za.uk))) continue;
      if (zc?.veiliger && !zc.risico) veiliger++;
      if (zc?.risico) risico++;
      // Однакові пари (той самий модуль у кількох місцях файла) показуємо один раз із кількістю.
      const dubbel = voorNa.find((x) => x.voor?.uk === za?.uk && x.na?.uk === zc?.uk);
      if (dubbel) dubbel.keer = (dubbel.keer ?? 1) + 1;
      else if (voorNa.length < 30) voorNa.push({ voor: za ? { uk: za.uk, nl: za.nl } : null, na: zc ? { uk: zc.uk, nl: zc.nl } : null });
    }
  }
  return { voorNa, overig, veiliger, risico };
}

/**
 * Ключ пояснення в досьє (risicoUitleg[].pad) для прапорця, або null, якщо пояснення тут не має сенсу
 * (архів, покладений вручну, чи невдале порівняння — для них лишається окреме підтвердження).
 * root/CI → шлях файла; npm → «npm:назва», «npm:overrides», «npm-script:назва»; lock → «package-lock.json»; SQL → назва міграції.
 */
export function uitlegSleutel(vlag: string): string | null {
  const m = /^\[([^\]]+)\]\s*(.*)$/.exec(vlag); if (!m) return null;
  const [, soort, rest] = m;
  if (soort === 'root' || soort === 'CI') return /^[+~−] /.test(rest) ? rest.slice(2).trim() : null;
  if (soort === 'npm') {
    const p = /^[+~−]\s+(@?[^@\s:]+)/.exec(rest); if (p) return `npm:${p[1]}`;
    if (/overrides/.test(rest)) return 'npm:overrides';
    const sc = /«([^»]+)»/.exec(rest); return sc ? `npm-script:${sc[1]}` : null;
  }
  if (soort === 'lock') return 'package-lock.json';
  if (soort === 'SQL') return rest.split(':')[0].trim() || null;
  return null;
}

/** Висновок і порада для адміна без програмування; позначає, чи потрібне пояснення автора. */
export function leesbaarVoor(item: RisicoItem): Leesbaar {
  const l = leesbaarBasis(item);
  const teken = /^\[[^\]]+\]\s*([+~−])?/.exec(item.vlag)?.[1];
  // Пояснення потрібне там, де порада адміну інакше звучала б «спитайте автора» або «подивіться опис оновлення».
  const nodig = uitlegSleutel(item.vlag) !== null && teken !== '−' && (l.oordeel === 'aandacht' || /опис[іу]? оновлення/.test(l.doen.uk));
  return { ...l, uitlegNodig: nodig };
}

const NA_UITLEG: Tekst = { uk: 'Автор пояснив цю зміну (нижче). Прочитайте пояснення й порівняйте з тим, що змінилося: якщо воно збігається — можна схвалювати; якщо ні — натисніть «Відхилити».', nl: 'De maker heeft deze wijziging uitgelegd (hieronder). Lees de uitleg en vergelijk met wat er veranderde: klopt het, dan kunt u goedkeuren; zo niet, kies «Afwijzen».' };

/**
 * Додає до прапорців пояснення автора з досьє (risicoUitleg) і повертає ключі, яких бракує.
 * Якщо бракує хоч одного — перевірка пакета блокує встановлення (рівень «fout»).
 */
export function pasUitlegToe(items: RisicoItem[], uitleg: ReadonlyArray<{ pad: string; uk: string; nl?: string }>): { items: RisicoItem[]; ontbreekt: string[] } {
  const per = new Map(uitleg.map((u) => [u.pad, u]));
  const ontbreekt = new Set<string>();
  const uit = items.map((it) => {
    const sleutel = uitlegSleutel(it.vlag); const u = sleutel ? per.get(sleutel) : undefined;
    const basis: RisicoItem = sleutel ? { ...it, sleutel } : it;
    if (u) return { ...basis, auteur: { uk: u.uk, nl: u.nl ?? u.uk }, ...(basis.leesbaar?.uitlegNodig ? { leesbaar: { ...basis.leesbaar, doen: NA_UITLEG } } : {}) };
    if (sleutel && basis.leesbaar?.uitlegNodig) ontbreekt.add(sleutel);
    return basis;
  });
  return { items: uit, ontbreekt: [...ontbreekt] };
}

function leesbaarBasis(item: RisicoItem): Leesbaar {
  const m = /^\[([^\]]+)\]\s*([+~−])?/.exec(item.vlag); const soort = m?.[1] ?? '!'; const teken = m?.[2];
  const uitleg = item.verschil && (soort === 'root' || soort === 'CI') ? leesbaarVerschil(item.verschil) : { voorNa: [], overig: 0, veiliger: 0, risico: 0 };
  const verdacht = (item.opvallend?.length ?? 0) > 0 || uitleg.risico > 0;
  const VRAAG: Tekst = { uk: 'Перш ніж схвалити, попросіть автора оновлення пояснити цю зміну одним реченням. Якщо пояснення немає або воно вас не переконує — натисніть «Відхилити».', nl: 'Vraag vóór het goedkeuren de maker van de update deze wijziging in één zin uit te leggen. Geen of geen overtuigende uitleg? Kies «Afwijzen».' };
  if (soort === 'GitHub') return { oordeel: 'aandacht', kort: { uk: 'Архів поклали на GitHub вручну', nl: 'Archief met de hand op GitHub gezet' }, voorNa: [], overig: 0,
    doen: { uk: 'Якщо архів на GitHub клали ви самі або людина, яку ви про це просили, — можна схвалювати. Якщо ні — натисніть «Відхилити» і змініть пароль до GitHub.', nl: 'Hebt u of iemand die u dat vroeg het archief zelf geplaatst, dan kunt u goedkeuren. Zo niet: «Afwijzen» en uw GitHub-wachtwoord wijzigen.' } };
  if (soort === '!') return { oordeel: 'aandacht', kort: { uk: 'Не вдалося порівняти з поточною версією', nl: 'Vergelijken met de huidige versie lukte niet' }, voorNa: [], overig: 0, doen: VRAAG };
  if (soort === 'npm') {
    const plus = teken === '+'; const upd = teken === '~';
    return { oordeel: plus || /скрипт|overrides/.test(item.vlag) ? 'aandacht' : 'gewoon', kort: item.wijziging, voorNa: [], overig: 0,
      doen: plus ? { uk: 'Подивіться опис оновлення: чи згадано там цей новий пакет і навіщо він. Якщо так — можна схвалювати; якщо ні — попросіть автора пояснити.', nl: 'Kijk in de beschrijving van de update of dit nieuwe pakket en het doel ervan genoemd worden. Zo ja: goedkeuren; zo niet: vraag de maker om uitleg.' }
        : upd ? { uk: 'Оновлення версії пакета — звичайна справа. Можна схвалювати, якщо решта прапорців у порядку.', nl: 'Een pakketversie bijwerken is gewoon. U kunt goedkeuren als de andere vlaggen in orde zijn.' }
          : /скрипт|overrides/.test(item.vlag) ? VRAAG : { uk: 'Прибрання пакета зазвичай безпечне. Можна схвалювати.', nl: 'Een pakket verwijderen is meestal veilig. U kunt goedkeuren.' } };
  }
  if (soort === 'lock') return { oordeel: 'aandacht', kort: { uk: 'Пакет завантажуватиметься з нестандартної адреси', nl: 'Pakket komt van een ongebruikelijk adres' }, voorNa: [], overig: 0, doen: VRAAG };
  if (soort === 'SQL') return { oordeel: 'aandacht', kort: { uk: 'Зміна прав доступу в базі даних', nl: 'Wijziging van toegangsrechten in de database' }, voorNa: [], overig: 0, doen: VRAAG };
  // root / CI
  const ding = soort === 'CI' ? { uk: 'процес збирання на GitHub', nl: 'het bouwproces op GitHub' } : { uk: 'програма сервера з правами root', nl: 'serverprogramma met root-rechten' };
  if (teken === '+') return { oordeel: verdacht ? 'aandacht' : 'gewoon', kort: { uk: `Додано нову річ: ${ding.uk}`, nl: `Nieuw toegevoegd: ${ding.nl}` }, ...uitleg,
    doen: verdacht ? VRAAG : { uk: 'Подивіться опис оновлення: чи згадано там цю нову можливість. Якщо так — можна схвалювати; якщо ні — попросіть автора пояснити.', nl: 'Kijk of de beschrijving van de update deze nieuwe functie noemt. Zo ja: goedkeuren; zo niet: vraag de maker om uitleg.' } };
  if (teken === '−') return { oordeel: 'gewoon', kort: { uk: `Прибрано: ${ding.uk}`, nl: `Verwijderd: ${ding.nl}` }, ...uitleg,
    doen: { uk: 'Прибрання зазвичай безпечне. Можна схвалювати, якщо в описі оновлення сказано, що ця річ більше не потрібна.', nl: 'Verwijderen is meestal veilig. U kunt goedkeuren als de beschrijving zegt dat dit niet meer nodig is.' } };
  if (verdacht) return { oordeel: 'aandacht', kort: { uk: `Змінено: ${ding.uk}. Є підозрілі місця`, nl: `${ding.nl} gewijzigd: er zijn verdachte plekken` }, ...uitleg, doen: VRAAG };
  if (uitleg.veiliger > 0 && uitleg.overig === 0) return { oordeel: 'veiliger', kort: { uk: `Змінено: ${ding.uk}. Стало безпечніше`, nl: `${ding.nl} gewijzigd: veiliger geworden` }, ...uitleg,
    doen: { uk: 'Ця зміна лише посилює захист. Можна схвалювати.', nl: 'Deze wijziging versterkt alleen de beveiliging. U kunt goedkeuren.' } };
  return { oordeel: 'gewoon', kort: { uk: `Змінено: ${ding.uk}${uitleg.overig ? ` (${uitleg.overig} рядк. логіки програми)` : ''}`, nl: `${ding.nl} gewijzigd${uitleg.overig ? ` (${uitleg.overig} regel(s) programmalogica)` : ''}` }, ...uitleg,
    doen: uitleg.overig ? { uk: 'Підозрілих місць не знайдено, але зміни в логіці програми словами не пояснити. Можна схвалювати, якщо в описі оновлення сказано, навіщо змінено цю програму; інакше попросіть автора пояснити.', nl: 'Geen verdachte plekken gevonden, maar wijzigingen in de programmalogica zijn niet in woorden te vatten. Goedkeuren als de beschrijving van de update zegt waarom dit programma veranderde; anders de maker om uitleg vragen.' }
      : { uk: 'Підозрілих місць не знайдено. Можна схвалювати.', nl: 'Geen verdachte plekken gevonden. U kunt goedkeuren.' } };
}
