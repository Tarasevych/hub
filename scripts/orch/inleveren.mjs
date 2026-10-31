// ORCH-001 етап 1 · Приймання результатів агентів з будь-якого каналу (GitHub-гілка/PR, MCP, HTTP API, локальна тека, ZIP, TAR.GZ,
// git patch, вебзавантаження) в ОДИН і той самий конвеєр: розпакувати → прочитати ORCH-OVERDRACHT.json → звірити правила й базу →
// накласти на чисту гілку від базового commit → виявити зміни → перевірити конфлікти з integratie → тести → запис → черга.
// Нічого не перезаписується тихо: кожна передача — власна гілка; integratie змінює лише «wachtrij klaar» після явного злиття.
// Inleveren van agentresultaten uit elk kanaal via één pijplijn; niets wordt stil overschreven.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { KANALEN, SHA40, TAR_NAAM, herkenKanaal, padVeilig, valideerOverdracht, vergelijkBestanden, versheid, wachtrijVoegToe } from './kern.mjs';
import { MAX_UITGEPAKT_BYTES, controleerTarGzVooraf, controleerZipVooraf, leesOverdrachtZip, omvangVanMap } from './pakket.mjs';

const fout = (code, uk, nl, extra = {}) => ({ code, ernst: 'fout', uk, nl, ...extra });
/** Стан координації: пише лише orch (команди) або власник; агентська передача з такими файлами відхиляється. */
export const BESCHERMDE_STAAT = /^orchestratie\/(taken|inleveringen)\/|^orchestratie\/(wachtrij|regels\.lock|geinstalleerd)\.json$/;
const waarsch = (code, uk, nl, extra = {}) => ({ code, ernst: 'waarschuwing', uk, nl, ...extra });

function gitIn(cwd) {
  return (...a) => { try { return execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (e) { return null; } };
}
const sha256Bestand = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** Усі файли теки (відносні шляхи), без службових. */
function loopBestanden(map) {
  const uit = [];
  const stap = (sub) => {
    for (const n of readdirSync(join(map, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${n.name}` : n.name;
      if (!padVeilig(rel)) continue;
      if (n.isSymbolicLink()) throw new Error(`INHOUD_ONVEILIG: символьне посилання ${rel}`);
      if (n.isDirectory()) stap(rel); else if (n.isFile()) uit.push(rel);
    }
  };
  stap(''); return uit.sort();
}

/** Зауваження (fout) → виняток, що зберігає і український, і нідерландський текст (раніше nl отримував український). */
const zaakFout = (z) => Object.assign(new Error(`${z.code}: ${z.uk}`), { nl: z.nl });

/** Якщо архів має одну верхню теку (як mijn-ruimte-<versie>/), заходимо в неї. */
function wortelVanUitgepakt(map) {
  const items = readdirSync(map).filter((n) => n !== '__MACOSX');
  if (items.length === 1 && statSync(join(map, items[0])).isDirectory() && !existsSync(join(map, 'ORCH-OVERDRACHT.json'))) return join(map, items[0]);
  return map;
}

/** Мінімальне середовище для дочірніх перевірок: жодних секретів застосунку (DATABASE_URL, SESSION_SECRET, ключів, перців). */
const VEILIGE_ENV_SLEUTELS = ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'NODE_NO_WARNINGS'];
export function veiligeTestEnv(bron = process.env) {
  const env = {};
  for (const k of VEILIGE_ENV_SLEUTELS) if (bron[k] !== undefined) env[k] = bron[k];
  return env;
}

/** Повертає { inhoud, odPad }: тека з файлами й (для пакета передачі) шлях до ORCH-OVERDRACHT.json поза tar. */
function pakUit(bron, kanaal, werk, maxBytes = MAX_UITGEPAKT_BYTES) {
  const doel = join(werk, 'uitgepakt'); mkdirSync(doel, { recursive: true });
  // Другий рубіж після розпакування: «видимий» обсяг файлів (ловить розріджені GNU-файли tar і будь-що, що пройшло повз вимір потоку).
  const nietTeGroot = (map) => { const n = omvangVanMap(map); if (n > maxBytes) throw zaakFout({ code: 'INHOUD_TE_GROOT', uk: `розпаковано ${Math.round(n / 1048576)} МіБ — більше за межу ${Math.round(maxBytes / 1048576)} МіБ`, nl: `${Math.round(n / 1048576)} MiB uitgepakt — meer dan de grens van ${Math.round(maxBytes / 1048576)} MiB` }); return map; };
  if (kanaal === 'zip') {
    const vz = controleerZipVooraf(bron, { maxBytes });
    if (vz) throw zaakFout(vz);
    const r = spawnSync('unzip', ['-o', '-q', bron, '-d', doel], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`UITPAKKEN_MISLUKT: unzip: ${(r.stderr || r.error?.message || '').trim()}`);
    // Пакет передачі (етап 2): zip з mijn-ruimte-<versie>.tar.gz + .sha256 + ORCH-OVERDRACHT.json → цілісність, потім вміст самого tar.gz.
    const w = wortelVanUitgepakt(doel);
    if (readdirSync(w).some((n) => TAR_NAAM.test(n)) && existsSync(join(w, 'ORCH-OVERDRACHT.json'))) {
      const g = leesOverdrachtZip(bron, join(werk, 'overdracht-zip'), { maxBytes });
      const f = g.zaken.find((x) => x.ernst === 'fout'); if (f) throw zaakFout(f);
      const vt = controleerTarGzVooraf(g.tarPad, { maxBytes });
      if (vt) throw zaakFout(vt);
      const tarDoel = join(werk, 'uitgepakt-tar'); mkdirSync(tarDoel);
      const t = spawnSync('tar', ['-xzf', g.tarPad, '-C', tarDoel, '--no-same-owner', '--no-same-permissions'], { encoding: 'utf8' });
      if (t.status !== 0) throw new Error(`UITPAKKEN_MISLUKT: tar in overdrachtzip: ${(t.stderr || '').trim()}`);
      return { inhoud: wortelVanUitgepakt(nietTeGroot(tarDoel)), odPad: join(g.map, 'ORCH-OVERDRACHT.json'), overdrachtZip: true };
    }
  } else if (kanaal === 'tar_gz') {
    const vt = controleerTarGzVooraf(bron, { maxBytes });
    if (vt) throw zaakFout(vt);
    const r = spawnSync('tar', ['-xzf', bron, '-C', doel, '--no-same-owner', '--no-same-permissions'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`UITPAKKEN_MISLUKT: tar: ${(r.stderr || '').trim()}`);
  } else if (kanaal === 'lokaal_bestand') {
    cpSync(bron, doel, { recursive: true, dereference: false, filter: (src) => padVeilig(relative(bron, src) || 'x') || relative(bron, src) === '' });
  } else throw new Error(`KANAAL_ONBEKEND: ${kanaal}`);
  return { inhoud: wortelVanUitgepakt(nietTeGroot(doel)), odPad: null, overdrachtZip: false };
}

/** Знаходить гілку/ref для каналу github_pr: гілка в origin, PR-URL або pr/N. Відхиляє прапорці git (початок з «-»). */
function githubRef(git, bron) {
  const b = String(bron || '').trim();
  if (!b || b.startsWith('-')) throw new Error(`REF_ONGELDIG: недопустиме посилання «${b.slice(0, 80)}»`);
  const pr = /^https?:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)\/?$/.exec(b) || /^pr\/(\d+)$/.exec(b);
  if (pr) { const lokaal = `inlevering/pr-${pr[1]}`; if (git('fetch', 'origin', `pull/${pr[1]}/head:${lokaal}`) === null) throw new Error(`FETCH_MISLUKT: pull/${pr[1]}/head`); return lokaal; }
  if (!/^[A-Za-z0-9._/-]+$/.test(b) || b.includes('..') || b.endsWith('.lock')) throw new Error(`REF_ONGELDIG: недопустиме посилання «${b.slice(0, 80)}»`);
  if (git('rev-parse', '--verify', '-q', `${b}^{commit}`) !== null) return b;
  if (git('fetch', 'origin', '--', b) !== null && git('rev-parse', '--verify', '-q', `origin/${b}^{commit}`) !== null) return `origin/${b}`;
  throw new Error(`REF_ONBEKEND: ${b}`);
}

/**
 * Головний конвеєр. opties: { wortel, beleid, lock, bron, kanaal?, overdrachtPad?, taakId?, tests?: string[] (shell — код із пакета!),
 *                             standaardTests?: boolean (beleid.inlevering.standaardTests, теж shell), zonderTests?: string, alleenVeiligeControle?,
 *                             verwachteAgent?: string (сервер: агент MCP-підключення), door?: string (хто доставив), maxUitgepaktBytes?,
 *                             integratieRef?, bewaarTak?: boolean, nu? }
 * Повертає запис передачі (inlevering) — його ж пише orch.mjs у orchestratie/inleveringen/ і додає в чергу при «aanvaard».
 */
export function inleveren(o) {
  const nu = o.nu ?? new Date().toISOString();
  const git = gitIn(o.wortel);
  const z = []; const record = { schema: 1, id: '', taakId: null, agent: null, door: o.door ? String(o.door).slice(0, 120) : null, kanaal: null, bron: String(o.bron), bronSha256: null, basisCommit: null, tak: null, commit: null,
    bestanden: [], conflicten: [], tests: null, zaken: z, uitkomst: 'geweigerd', aangemaakt: nu, integratieRef: null, pr: null };
  const werk = mkdtempSync(join(tmpdir(), 'orch-inlever-'));
  let werkboom = null; let takAangemaakt = false;
  try {
    const bronPad = existsSync(o.bron) ? resolve(o.bron) : null;
    const kanaal = herkenKanaal(o.bron, !!bronPad && statSync(bronPad).isDirectory(), o.kanaal);
    if (!kanaal) { z.push(fout('KANAAL_ONBEKEND', `не впізнаю джерело «${o.bron}» — вкажіть --kanaal (${KANALEN.join(', ')})`, `bron «${o.bron}» niet herkend — geef --kanaal`)); return record; }
    record.kanaal = kanaal;
    const viaBestand = ['zip', 'tar_gz', 'lokaal_bestand', 'mcp', 'http_api', 'web_upload'].includes(kanaal) && kanaal !== 'git_patch';
    if (bronPad && statSync(bronPad).isFile()) record.bronSha256 = sha256Bestand(bronPad);

    // 1. Вміст: архів/тека → розпакувати; patch → лишити; git → ref.
    let inhoud = null; let ref = null; let patchPad = null; let odBuiten = null;
    const fysiekKanaal = ['mcp', 'http_api', 'web_upload'].includes(kanaal) ? herkenKanaal(o.bron, !!bronPad && statSync(bronPad).isDirectory(), null) : kanaal;
    if (['zip', 'tar_gz', 'lokaal_bestand'].includes(fysiekKanaal)) { if (!bronPad) { z.push(fout('BRON_ONTBREEKT', `файл/тека «${o.bron}» не існує`, `bestand/map «${o.bron}» bestaat niet`)); return record; } const u = pakUit(bronPad, fysiekKanaal, werk, o.maxUitgepaktBytes ?? MAX_UITGEPAKT_BYTES); inhoud = u.inhoud; odBuiten = u.odPad; if (u.overdrachtZip) record.overdrachtZip = true; }
    else if (fysiekKanaal === 'git_patch') { if (!bronPad) { z.push(fout('BRON_ONTBREEKT', `patch «${o.bron}» не існує`, `patch «${o.bron}» bestaat niet`)); return record; } patchPad = bronPad; }
    else if (fysiekKanaal === 'github_pr') ref = githubRef(git, o.bron);
    else { z.push(fout('BRON_ONTBREEKT', `для каналу ${kanaal} потрібен файл .zip/.tar.gz/.patch або тека`, `kanaal ${kanaal} vraagt een .zip/.tar.gz/.patch of map`)); return record; }

    // 2. ORCH-OVERDRACHT.json: у архіві/теці, або --overdracht, або (для git-гілки) з реєстрації задачі.
    let od = null; const odPad = o.overdrachtPad ? resolve(o.overdrachtPad) : odBuiten ?? (inhoud && existsSync(join(inhoud, 'ORCH-OVERDRACHT.json')) ? join(inhoud, 'ORCH-OVERDRACHT.json') : null);
    if (odPad) { try { od = JSON.parse(readFileSync(odPad, 'utf8')); } catch { z.push(fout('OVERDRACHT_ONGELDIG', 'ORCH-OVERDRACHT.json не є дійсним JSON', 'ORCH-OVERDRACHT.json is geen geldige JSON')); return record; } }
    else if (ref && o.taakId && existsSync(join(o.wortel, 'orchestratie/taken', `${o.taakId}.json`))) {
      const t = JSON.parse(readFileSync(join(o.wortel, 'orchestratie/taken', `${o.taakId}.json`), 'utf8'));
      od = { taakId: t.id, agent: t.agent, basisCommit: t.basisCommit, regelsVersie: t.regelsVersie, regelsHash: t.regelsHash, tak: t.tak, kanaal: 'github_pr', samenvatting: { uk: t.omschrijving || `Передача задачі ${t.id} через git-гілку`, nl: t.omschrijving || `Overdracht van ${t.id} via git-tak` } };
    }
    if (!od) { z.push(fout('OVERDRACHT_ONTBREEKT', 'немає ORCH-OVERDRACHT.json (у архіві/теці або через --overdracht; для git-гілки — --taak <ID> зареєстрованої задачі). Шаблон: orchestratie/sjablonen/ORCH-OVERDRACHT.json', 'ORCH-OVERDRACHT.json ontbreekt (in archief/map of via --overdracht; voor een git-tak --taak <ID>). Sjabloon: orchestratie/sjablonen/ORCH-OVERDRACHT.json')); return record; }
    z.push(...valideerOverdracht(od, o.beleid));
    if (z.some((x) => x.ernst === 'fout')) return record;
    // Агент діє лише від власного імені: MCP-підключення агента X не може здати пакет «від» агента Y (сервер передає verwachteAgent).
    // taakId/agent уже провалідовані — записуємо їх у record, щоб відмова мала впізнаваний id (а не ONBEKEND-…).
    Object.assign(record, { taakId: od.taakId, agent: od.agent, basisCommit: od.basisCommit, overdracht: od });
    if (o.verwachteAgent && od.agent !== o.verwachteAgent) z.push(fout('AGENT_VERSCHILT', `пакет заявляє агента «${String(od.agent).slice(0, 32)}», а здає підключення агента «${o.verwachteAgent}» — агент діє лише від власного імені`, `pakket noemt agent «${String(od.agent).slice(0, 32)}», maar wordt ingeleverd door de verbinding van «${o.verwachteAgent}» — een agent handelt alleen op eigen naam`));
    if (z.some((x) => x.ernst === 'fout')) return record;

    // 3. База існує? Правила чинні?
    if (git('cat-file', '-e', `${od.basisCommit}^{commit}`) === null) { z.push(fout('BASIS_ONBEKEND', `базовий commit ${od.basisCommit.slice(0, 12)} невідомий у цьому репозиторії — зробіть git fetch або агент працював від неіснуючої бази`, `basiscommit ${od.basisCommit.slice(0, 12)} onbekend in deze repository`)); return record; }
    const integratieRef = o.integratieRef ?? [`origin/${o.beleid.integratie.tak}`, o.beleid.integratie.tak, `origin/${o.beleid.integratie.basisTak}`, o.beleid.integratie.basisTak].find((r) => r && git('rev-parse', '--verify', '-q', r) !== null) ?? null;
    record.integratieRef = integratieRef;
    const taakVoorVersheid = { id: od.taakId, basisCommit: od.basisCommit, regelsVersie: od.regelsVersie, regelsHash: od.regelsHash, staat: 'ter_integratie' };

    // 4. Накласти на чисту гілку від базового commit у тимчасовому worktree.
    const tak = od.tak && /^[a-z]+\/[a-z0-9-]+-\d{8}-\d{6}$/.test(od.tak) ? od.tak : `inlevering/${od.taakId.toLowerCase()}-${nu.replace(/[-:TZ.]/g, '').slice(0, 15).replace(/^(\d{8})(\d{6}).*$/, '$1-$2')}`;
    record.tak = tak;
    if (ref) {
      if (git('merge-base', '--is-ancestor', od.basisCommit, ref) === null) { z.push(fout('BASIS_NIET_IN_HEAD', `заявлена база не є предком ${ref}`, `opgegeven basis is geen voorouder van ${ref}`)); return record; }
      record.commit = git('rev-parse', ref);
      if (tak !== ref && git('rev-parse', '--verify', '-q', tak) === null) git('branch', tak, ref);
    } else {
      werkboom = join(werk, 'boom');
      if (git('rev-parse', '--verify', '-q', tak) !== null) { z.push(fout('TAK_BESTAAT', `гілка ${tak} уже існує — нова передача має нову часову мітку`, `tak ${tak} bestaat al — een nieuwe overdracht krijgt een nieuwe tijdstempel`)); return record; }
      if (git('worktree', 'add', '-q', '-b', tak, werkboom, od.basisCommit) === null) { z.push(fout('WERKBOOM_MISLUKT', 'не вдалося створити тимчасове робоче дерево', 'tijdelijke werkboom mislukt')); return record; }
      takAangemaakt = true;
      const gw = gitIn(werkboom);
      if (patchPad) {
        const tekst = readFileSync(patchPad, 'utf8');
        const am = /^From [0-9a-f]{40} /m.test(tekst) ? spawnSync('git', ['am', '-q', '--3way', patchPad], { cwd: werkboom, encoding: 'utf8' }) : null;
        if (am && am.status !== 0) { spawnSync('git', ['am', '--abort'], { cwd: werkboom }); z.push(fout('PATCH_PAST_NIET', `git am відхилив patch від бази ${od.basisCommit.slice(0, 12)}: ${(am.stderr || am.stdout).trim().split('\n').slice(-3).join(' | ')}`, `git am weigert de patch`)); return record; }
        if (!am) {
          const ap = spawnSync('git', ['apply', '--index', '--3way', patchPad], { cwd: werkboom, encoding: 'utf8' });
          if (ap.status !== 0) { z.push(fout('PATCH_PAST_NIET', `git apply відхилив patch: ${(ap.stderr || '').trim().split('\n').slice(-3).join(' | ')}`, 'git apply weigert de patch')); return record; }
          if (gw('commit', '-q', '-m', `ORCH ${od.taakId} (${od.agent}): ${typeof od.samenvatting === 'string' ? od.samenvatting : od.samenvatting.uk}`) === null) { z.push(fout('GEEN_WIJZIGINGEN', 'patch не змінив жодного файла', 'patch wijzigt geen bestand')); return record; }
        }
      } else {
        for (const rel of loopBestanden(inhoud)) { mkdirSync(dirname(join(werkboom, rel)), { recursive: true }); cpSync(join(inhoud, rel), join(werkboom, rel)); }
        for (const rel of od.bestanden?.verwijderd ?? []) if (padVeilig(rel) && existsSync(join(werkboom, rel))) rmSync(join(werkboom, rel), { recursive: true });
        gw('add', '-A');
        if ((gw('status', '--porcelain') || '') === '') { z.push(fout('GEEN_WIJZIGINGEN', 'архів/тека не відрізняється від бази — нічого передавати', 'archief/map verschilt niet van de basis')); return record; }
        gw('-c', `user.name=${od.agent}`, '-c', 'user.email=agent@mijn-ruimte.invalid', 'commit', '-q', '-m', `ORCH ${od.taakId} (${od.agent}): ${typeof od.samenvatting === 'string' ? od.samenvatting : od.samenvatting.uk}\n\nKanaal: ${kanaal}\nBasis: ${od.basisCommit}\nRegels: ${od.regelsVersie} ${od.regelsHash}`);
      }
      record.commit = gw('rev-parse', 'HEAD');
    }

    // 5. Фактичні зміни + звірка із заявленими.
    record.bestanden = (git('diff', '--name-only', `${od.basisCommit}..${record.commit}`) || '').split('\n').filter(Boolean);
    z.push(...vergelijkBestanden(od.bestanden, record.bestanden));
    // Файли стану координації змінює лише orch (черга, задачі, записи передач, lock, факт установки) — не передача агента.
    // Виняток: власний файл задачі orchestratie/taken/<taakId>.json — декларація агента (taak-start у його гілці); при злитті лишається
    // версія integratie (.gitattributes merge=orch-staat). Eigen taakbestand mag mee; de integratieversie wint bij het mergen.
    const eigenTaak = `orchestratie/taken/${od.taakId}.json`;
    const beschermd = record.bestanden.filter((p) => BESCHERMDE_STAAT.test(p) && p !== eigenTaak);
    if (beschermd.length) { z.push(fout('BESCHERMDE_BESTANDEN', `передача змінює файли стану координації: ${beschermd.join(', ')} — їх пише лише orch/власник; правила (AGENTS.md, beleid.json, BESLUITEN.md) пропонуйте окремою задачею`, `overdracht wijzigt coördinatiestaat: ${beschermd.join(', ')} — die schrijft alleen orch/de eigenaar`, { bestanden: beschermd })); return record; }

    // 6. Свіжість (правила + база відносно integratie) і реальні конфлікти злиття (git merge-tree, без зміни integratie).
    const voor = integratieRef ? (git('rev-list', '--reverse', `${od.basisCommit}..${integratieRef}`) || '').split('\n').filter(Boolean) : [];
    const integratieVoorsprong = voor.map((sha) => ({ sha, bestanden: (git('diff-tree', '--no-commit-id', '--name-only', '-r', sha) || '').split('\n').filter(Boolean) }));
    z.push(...versheid({ taak: taakVoorVersheid, fase: 'overdracht', regelsVersie: o.beleid.regelsVersie, regelsHash: o.lock?.hash ?? null, headIsAfstammeling: true, integratieVoorsprong, eigenBestanden: record.bestanden, schoon: true }));
    if (integratieRef) {
      const mt = spawnSync('git', ['merge-tree', '--write-tree', '--name-only', integratieRef, record.commit], { cwd: o.wortel, encoding: 'utf8' });
      if (mt.status === 1) { /* --name-only: regel 1 = tree, dan de conflictbestanden tot de eerste lege regel; daarna informatieve meldingen (Auto-merging …) — die horen niet in de lijst */ const mtRegels = mt.stdout.split('\n'); const leeg = mtRegels.indexOf('', 1); record.conflicten = [...new Set(mtRegels.slice(1, leeg < 0 ? undefined : leeg).filter(Boolean))]; z.push(fout('CONFLICT', `злиття з ${integratieRef} конфліктує у: ${record.conflicten.join(', ')} — перебазуйте гілку ${tak} і передайте знову`, `samenvoegen met ${integratieRef} geeft conflicten in: ${record.conflicten.join(', ')} — rebase ${tak} en lever opnieuw in`)); }
      else if (mt.status !== 0) z.push(waarsch('MERGE_TREE_ONBEKEND', `git merge-tree не дав відповіді: ${(mt.stderr || '').trim()}`, 'git merge-tree gaf geen uitslag'));
    } else z.push(waarsch('GEEN_INTEGRATIE', 'інтеграційну гілку не знайдено — конфлікти не перевірено', 'geen integratietak gevonden — conflicten niet gecontroleerd'));

    // Передача вже відхилена (конфлікт, застаріла база/правила…) → далі нічого не виконуємо, зокрема жодного коду з пакета.
    // Al geweigerd (conflict, verouderd …) → niets meer uitvoeren, zeker geen code uit het pakket.
    if (z.some((x) => x.ernst === 'fout')) return record;

    // 7. Перевірки у робочому дереві передачі (не в головному!).
    // Безпека (адверсарна перевірка 31.10.2026):
    //   - ЗАВЖДИ виконується довірений controleer: scripts/orch.mjs із o.wortel з --wortel <map>, без sh -c і без жодного коду з пакета агента.
    //     Його не вимикає й --zonder-tests / zonderTests — інакше пакет зі зміненими правилами без нового lock пройшов би неперевіреним.
    //   - Shell-тести виконують КОД ІЗ ПАКЕТА АГЕНТА (scripts/eenheidstests.mjs, tests/… — усе з пакета) з HOME оператора. Тому лише за явним
    //     вибором оператора CLI: --tests "cmd" або --standaardtests (beleid.inlevering.standaardTests). За замовчуванням — ні; на сервері
    //     (alleenVeiligeControle) — ніколи. --zonder-tests пропускає лише shell-тести; причина лишається в записі.
    // Altijd de vertrouwde controleer; shell-tests (code uit het pakket!) alleen op uitdrukkelijke keuze van de operator, nooit op de server.
    const VEILIGE_CONTROLE_CMD = 'node scripts/orch.mjs controleer';
    const isVeilig = (c) => String(c).trim() === VEILIGE_CONTROLE_CMD;
    const gevraagd = o.alleenVeiligeControle || o.zonderTests ? [] : (o.tests ?? (o.standaardTests ? (o.beleid.inlevering.standaardTests ?? []) : []));
    const shellTests = gevraagd.filter((c) => !isVeilig(c));
    const map = werkboom ?? (() => { const b = join(werk, 'boom-ref'); git('worktree', 'add', '-q', '--detach', b, record.commit); werkboom = b; return b; })();
    const env = veiligeTestEnv();
    if (shellTests.length && existsSync(join(o.wortel, 'node_modules')) && !existsSync(join(map, 'node_modules'))) { try { execFileSync('ln', ['-s', join(o.wortel, 'node_modules'), join(map, 'node_modules')]); } catch { /* без node_modules тести самі скажуть */ } }
    record.tests = { overgeslagen: !!o.zonderTests, ...(o.zonderTests ? { reden: String(o.zonderTests) } : {}), geslaagd: 0, mislukt: 0, uitvoer: [] };
    for (const cmd of [VEILIGE_CONTROLE_CMD, ...shellTests]) {
      const r = isVeilig(cmd)
        ? spawnSync(process.execPath, [join(o.wortel, 'scripts/orch.mjs'), 'controleer', '--wortel', map], { cwd: map, env, encoding: 'utf8', timeout: 120_000 })
        : spawnSync('sh', ['-c', cmd], { cwd: map, env, encoding: 'utf8', timeout: 600_000 });
      const ok = r.status === 0; record.tests[ok ? 'geslaagd' : 'mislukt']++;
      record.tests.uitvoer.push({ cmd, vertrouwd: isVeilig(cmd), status: r.status, laatste: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-6).join('\n') });
      if (!ok) z.push(fout('TESTS_MISLUKT', isVeilig(cmd) ? `перевірка правил (довірений controleer) «${cmd}» не пройшла (код ${r.status})` : `тест «${cmd}» впав (код ${r.status})`, `${isVeilig(cmd) ? 'regelcontrole (vertrouwde controleer)' : 'test'} «${cmd}» faalde (code ${r.status})`));
    }
    if (z.some((x) => x.ernst === 'fout')) return record;
    record.uitkomst = 'aanvaard';
    return record;
  } catch (e) {
    const code = /^[A-Z][A-Z_]+(?=:)/.exec(String(e.message))?.[0] ?? 'INLEVEREN_MISLUKT';
    z.push(fout(code, String(e.message).replace(/^[A-Z][A-Z_]+: /, ''), e.nl ?? String(e.message).replace(/^[A-Z][A-Z_]+: /, ''))); return record;
  } finally {
    if (werkboom) { spawnSync('git', ['worktree', 'remove', '--force', werkboom], { cwd: o.wortel }); }
    spawnSync('git', ['worktree', 'prune'], { cwd: o.wortel });
    rmSync(werk, { recursive: true, force: true });
    // Відхилена передача не лишає гілки, яку ми самі створили (чужі/готові гілки не чіпаємо).
    if (record.uitkomst === 'geweigerd' && takAangemaakt && !o.bewaarTak) spawnSync('git', ['branch', '-D', record.tak], { cwd: o.wortel });
    record.id = `${record.taakId ?? 'ONBEKEND'}-${nu.replace(/[-:.]/g, '').slice(0, 18)}`;
  }
}

/** Після «aanvaard»: запис у orchestratie/inleveringen, оновлення задачі, черга. Чисті дані → файли (тільки тут пишемо). */
export function registreerInlevering(wortel, record) {
  const map = join(wortel, 'orchestratie/inleveringen'); mkdirSync(map, { recursive: true });
  const pad = join(map, `${record.id}.json`);
  const { overdracht, ...rest } = record;
  writeFileSync(pad, `${JSON.stringify({ ...rest, overdracht: overdracht ? { ...overdracht } : null }, null, 2)}\n`);
  const uit = { recordPad: relative(wortel, pad), taakBijgewerkt: false, wachtrij: null };
  if (record.uitkomst !== 'aanvaard') return uit;
  const taakPad = join(wortel, 'orchestratie/taken', `${record.taakId}.json`);
  let taak = existsSync(taakPad) ? JSON.parse(readFileSync(taakPad, 'utf8')) : null;
  if (!taak) {
    // Агент без репозиторію не міг зареєструвати задачу — реєструємо з його передачі (видно, що пізніше).
    taak = { schema: 1, id: record.taakId, agent: record.agent, tak: record.tak, basisCommit: record.basisCommit, regelsVersie: record.overdracht.regelsVersie, regelsHash: record.overdracht.regelsHash, staat: 'in_progress', gestart: record.aangemaakt, bijgewerkt: record.aangemaakt, omschrijving: typeof record.overdracht.samenvatting === 'string' ? record.overdracht.samenvatting : record.overdracht.samenvatting.uk, kanaal: record.kanaal, overdrachten: [], geregistreerdBijInlevering: true };
    mkdirSync(dirname(taakPad), { recursive: true });
  }
  taak.staat = 'ter_integratie'; taak.tak = record.tak; taak.bijgewerkt = record.aangemaakt; taak.overdrachten = [...(taak.overdrachten ?? []), record.id];
  writeFileSync(taakPad, `${JSON.stringify(taak, null, 2)}\n`); uit.taakBijgewerkt = true;
  const wPad = join(wortel, 'orchestratie/wachtrij.json');
  const w = existsSync(wPad) ? JSON.parse(readFileSync(wPad, 'utf8')) : { schema: 1, integratieTak: 'integratie', integratieHoofd: null, bezig: null, wachtrij: [] };
  const r = wachtrijVoegToe(w, { taakId: record.taakId, agent: record.agent, tak: record.tak, basisCommit: record.basisCommit, commit: record.commit, ingediend: record.aangemaakt, kanaal: record.kanaal, inleveringId: record.id });
  if (r.fout) uit.wachtrij = r.fout; else { writeFileSync(wPad, `${JSON.stringify(r.w, null, 2)}\n`); uit.wachtrij = 'toegevoegd'; }
  return uit;
}
