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
import { KANALEN, SHA40, herkenKanaal, padVeilig, valideerOverdracht, vergelijkBestanden, versheid, wachtrijVoegToe } from './kern.mjs';

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

/** Якщо архів має одну верхню теку (як mijn-ruimte-<versie>/), заходимо в неї. */
function wortelVanUitgepakt(map) {
  const items = readdirSync(map).filter((n) => n !== '__MACOSX');
  if (items.length === 1 && statSync(join(map, items[0])).isDirectory() && !existsSync(join(map, 'ORCH-OVERDRACHT.json'))) return join(map, items[0]);
  return map;
}

function pakUit(bron, kanaal, werk) {
  const doel = join(werk, 'uitgepakt'); mkdirSync(doel, { recursive: true });
  if (kanaal === 'zip') {
    const r = spawnSync('unzip', ['-o', '-q', bron, '-d', doel], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`UITPAKKEN_MISLUKT: unzip: ${(r.stderr || r.error?.message || '').trim()}`);
  } else if (kanaal === 'tar_gz') {
    // Без абсолютних шляхів і «..» (tar відкидає їх сам), без спецфайлів.
    const r = spawnSync('tar', ['-xzf', bron, '-C', doel, '--no-same-owner', '--no-same-permissions'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`UITPAKKEN_MISLUKT: tar: ${(r.stderr || '').trim()}`);
  } else if (kanaal === 'lokaal_bestand') {
    cpSync(bron, doel, { recursive: true, dereference: false, filter: (src) => padVeilig(relative(bron, src) || 'x') || relative(bron, src) === '' });
  } else throw new Error(`KANAAL_ONBEKEND: ${kanaal}`);
  return wortelVanUitgepakt(doel);
}

/** Знаходить гілку/ref для каналу github_pr: гілка в origin, PR-URL або pr/N. */
function githubRef(git, bron) {
  const pr = /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/.exec(bron) || /^pr\/(\d+)$/.exec(bron);
  if (pr) { const lokaal = `inlevering/pr-${pr[1]}`; if (git('fetch', 'origin', `pull/${pr[1]}/head:${lokaal}`) === null) throw new Error(`FETCH_MISLUKT: pull/${pr[1]}/head`); return lokaal; }
  if (git('rev-parse', '--verify', '-q', bron) !== null) return bron;
  if (git('fetch', 'origin', bron) !== null && git('rev-parse', '--verify', '-q', `origin/${bron}`) !== null) return `origin/${bron}`;
  throw new Error(`REF_ONBEKEND: ${bron}`);
}

/**
 * Головний конвеєр. opties: { wortel, beleid, lock, bron, kanaal?, overdrachtPad?, taakId?, tests?: string[], zonderTests?: string,
 *                             integratieRef?, bewaarTak?: boolean, nu? }
 * Повертає запис передачі (inlevering) — його ж пише orch.mjs у orchestratie/inleveringen/ і додає в чергу при «aanvaard».
 */
export function inleveren(o) {
  const nu = o.nu ?? new Date().toISOString();
  const git = gitIn(o.wortel);
  const z = []; const record = { schema: 1, id: '', taakId: null, agent: null, kanaal: null, bron: String(o.bron), bronSha256: null, basisCommit: null, tak: null, commit: null,
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
    let inhoud = null; let ref = null; let patchPad = null;
    const fysiekKanaal = ['mcp', 'http_api', 'web_upload'].includes(kanaal) ? herkenKanaal(o.bron, !!bronPad && statSync(bronPad).isDirectory(), null) : kanaal;
    if (['zip', 'tar_gz', 'lokaal_bestand'].includes(fysiekKanaal)) { if (!bronPad) { z.push(fout('BRON_ONTBREEKT', `файл/тека «${o.bron}» не існує`, `bestand/map «${o.bron}» bestaat niet`)); return record; } inhoud = pakUit(bronPad, fysiekKanaal, werk); }
    else if (fysiekKanaal === 'git_patch') { if (!bronPad) { z.push(fout('BRON_ONTBREEKT', `patch «${o.bron}» не існує`, `patch «${o.bron}» bestaat niet`)); return record; } patchPad = bronPad; }
    else if (fysiekKanaal === 'github_pr') ref = githubRef(git, o.bron);
    else { z.push(fout('BRON_ONTBREEKT', `для каналу ${kanaal} потрібен файл .zip/.tar.gz/.patch або тека`, `kanaal ${kanaal} vraagt een .zip/.tar.gz/.patch of map`)); return record; }

    // 2. ORCH-OVERDRACHT.json: у архіві/теці, або --overdracht, або (для git-гілки) з реєстрації задачі.
    let od = null; const odPad = o.overdrachtPad ? resolve(o.overdrachtPad) : inhoud && existsSync(join(inhoud, 'ORCH-OVERDRACHT.json')) ? join(inhoud, 'ORCH-OVERDRACHT.json') : null;
    if (odPad) { try { od = JSON.parse(readFileSync(odPad, 'utf8')); } catch { z.push(fout('OVERDRACHT_ONGELDIG', 'ORCH-OVERDRACHT.json не є дійсним JSON', 'ORCH-OVERDRACHT.json is geen geldige JSON')); return record; } }
    else if (ref && o.taakId && existsSync(join(o.wortel, 'orchestratie/taken', `${o.taakId}.json`))) {
      const t = JSON.parse(readFileSync(join(o.wortel, 'orchestratie/taken', `${o.taakId}.json`), 'utf8'));
      od = { taakId: t.id, agent: t.agent, basisCommit: t.basisCommit, regelsVersie: t.regelsVersie, regelsHash: t.regelsHash, tak: t.tak, kanaal: 'github_pr', samenvatting: { uk: t.omschrijving || `Передача задачі ${t.id} через git-гілку`, nl: t.omschrijving || `Overdracht van ${t.id} via git-tak` } };
    }
    if (!od) { z.push(fout('OVERDRACHT_ONTBREEKT', 'немає ORCH-OVERDRACHT.json (у архіві/теці або через --overdracht; для git-гілки — --taak <ID> зареєстрованої задачі). Шаблон: orchestratie/sjablonen/ORCH-OVERDRACHT.json', 'ORCH-OVERDRACHT.json ontbreekt (in archief/map of via --overdracht; voor een git-tak --taak <ID>). Sjabloon: orchestratie/sjablonen/ORCH-OVERDRACHT.json')); return record; }
    z.push(...valideerOverdracht(od, o.beleid));
    if (z.some((x) => x.ernst === 'fout')) return record;
    Object.assign(record, { taakId: od.taakId, agent: od.agent, basisCommit: od.basisCommit, overdracht: od });

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
    const beschermd = record.bestanden.filter((p) => BESCHERMDE_STAAT.test(p));
    if (beschermd.length) { z.push(fout('BESCHERMDE_BESTANDEN', `передача змінює файли стану координації: ${beschermd.join(', ')} — їх пише лише orch/власник; правила (AGENTS.md, beleid.json, BESLUITEN.md) пропонуйте окремою задачею`, `overdracht wijzigt coördinatiestaat: ${beschermd.join(', ')} — die schrijft alleen orch/de eigenaar`, { bestanden: beschermd })); return record; }

    // 6. Свіжість (правила + база відносно integratie) і реальні конфлікти злиття (git merge-tree, без зміни integratie).
    const voor = integratieRef ? (git('rev-list', '--reverse', `${od.basisCommit}..${integratieRef}`) || '').split('\n').filter(Boolean) : [];
    const integratieVoorsprong = voor.map((sha) => ({ sha, bestanden: (git('diff-tree', '--no-commit-id', '--name-only', '-r', sha) || '').split('\n').filter(Boolean) }));
    z.push(...versheid({ taak: taakVoorVersheid, fase: 'overdracht', regelsVersie: o.beleid.regelsVersie, regelsHash: o.lock?.hash ?? null, headIsAfstammeling: true, integratieVoorsprong, eigenBestanden: record.bestanden, schoon: true }));
    if (integratieRef) {
      const mt = spawnSync('git', ['merge-tree', '--write-tree', '--name-only', integratieRef, record.commit], { cwd: o.wortel, encoding: 'utf8' });
      if (mt.status === 1) { record.conflicten = mt.stdout.trim().split('\n').slice(1).filter(Boolean); z.push(fout('CONFLICT', `злиття з ${integratieRef} конфліктує у: ${record.conflicten.join(', ')} — перебазуйте гілку ${tak} і передайте знову`, `samenvoegen met ${integratieRef} geeft conflicten in: ${record.conflicten.join(', ')} — rebase ${tak} en lever opnieuw in`)); }
      else if (mt.status !== 0) z.push(waarsch('MERGE_TREE_ONBEKEND', `git merge-tree не дав відповіді: ${(mt.stderr || '').trim()}`, 'git merge-tree gaf geen uitslag'));
    } else z.push(waarsch('GEEN_INTEGRATIE', 'інтеграційну гілку не знайдено — конфлікти не перевірено', 'geen integratietak gevonden — conflicten niet gecontroleerd'));

    // 7. Тести у робочому дереві передачі (не в головному!). Пропуск лише з явною причиною, яка лишається в записі.
    const tests = o.tests ?? o.beleid.inlevering.standaardTests ?? [];
    if (o.zonderTests) record.tests = { overgeslagen: true, reden: String(o.zonderTests), geslaagd: 0, mislukt: 0, uitvoer: [] };
    else if (tests.length) {
      const map = werkboom ?? (() => { const b = join(werk, 'boom-ref'); git('worktree', 'add', '-q', '--detach', b, record.commit); werkboom = b; return b; })();
      if (existsSync(join(o.wortel, 'node_modules')) && !existsSync(join(map, 'node_modules'))) { try { execFileSync('ln', ['-s', join(o.wortel, 'node_modules'), join(map, 'node_modules')]); } catch { /* без node_modules тести самі скажуть */ } }
      record.tests = { overgeslagen: false, geslaagd: 0, mislukt: 0, uitvoer: [] };
      for (const cmd of tests) {
        const r = spawnSync('sh', ['-c', cmd], { cwd: map, encoding: 'utf8', timeout: 600_000 });
        const ok = r.status === 0; record.tests[ok ? 'geslaagd' : 'mislukt']++;
        record.tests.uitvoer.push({ cmd, status: r.status, laatste: `${r.stdout}${r.stderr}`.trim().split('\n').slice(-6).join('\n') });
        if (!ok) z.push(fout('TESTS_MISLUKT', `тест «${cmd}» впав (код ${r.status})`, `test «${cmd}» faalde (code ${r.status})`));
      }
    } else record.tests = { overgeslagen: true, reden: 'geen tests geconfigureerd', geslaagd: 0, mislukt: 0, uitvoer: [] };
    if (z.some((x) => x.ernst === 'fout')) return record;
    record.uitkomst = 'aanvaard';
    return record;
  } catch (e) {
    z.push(fout(String(e.message).split(':')[0] || 'INLEVEREN_MISLUKT', e.message, e.message)); return record;
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
