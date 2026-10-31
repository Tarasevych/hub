// ORCH-001 етап 2 · Універсальні випуски: сумісний mijn-ruimte-<versie>.tar.gz (через deploy/uitrol/maak-voorstelpakket.sh, нічого не дублюємо)
// + єдиний пакет передачі mijn-ruimte-<versie>-<agent>-overdracht.zip: інсталяційний архів, SHA-256, метадані (ORCH-OVERDRACHT.json,
// UITROL-MANIFEST.json), звіт (RAPPORT.md), тести (TESTRESULTATEN.json), коміти (COMMITS.txt + commits.bundle), агенти (AGENTEN.json),
// підпис (.sig, якщо є). Приватні ключі власника сюди НІКОЛИ не потрапляють — підписує лише власник на своєму ПК.
// Universele releases: compatibele tar.gz + één overdrachtzip met alles wat de eigenaar en de installer nodig hebben.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { OVERDRACHT_ZIP, SHA40, TAR_NAAM, VERSIE, basisBestandTekst, controleerBasis, leesBasisBestand, maakRapport, overdrachtZipNaam, valideerOverdracht } from './kern.mjs';

const fout = (code, uk, nl, extra = {}) => ({ code, ernst: 'fout', uk, nl, ...extra });
const waarsch = (code, uk, nl, extra = {}) => ({ code, ernst: 'waarschuwing', uk, nl, ...extra });
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const gitIn = (cwd) => (...a) => { try { return execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; } };
const versieNu = (nu) => nu.replace(/[-:]/g, '').replace(/^(\d{8})T(\d{6}).*$/, '$1-$2');

/** Базова (встановлена) версія: факт установки (geinstalleerd.json) переважає над заявленою базою в beleid.json. */
export function basisVoorPakket(wortel, beleid) {
  const gp = join(wortel, beleid.geinstalleerd?.bestand ?? 'orchestratie/geinstalleerd.json');
  if (existsSync(gp)) { const g = JSON.parse(readFileSync(gp, 'utf8')); if (VERSIE.test(g.versie || '') && SHA40.test(g.bronCommit || '')) return { versie: g.versie, commit: g.bronCommit, bron: `geinstalleerd.json (${g.bron ?? 'onbekend'})` }; }
  return { versie: beleid.basis.versie, commit: beleid.basis.bronCommit, bron: `beleid.json (${beleid.basis.verificatie})` };
}

/**
 * Збирає tar.gz (через maak-voorstelpakket.sh) і пакет передачі. opties: { wortel, beleid, lock, taakId, auteur, agent?, versie?, uit, samenvatting?,
 * manifestPad?, testresultatenPad?, sigPad?, agentPlatform?, model?, nietGedaan?, nu? }. Повертає { zaken, zipPad, ... } — zaken з ernst fout = не зібрано.
 */
export function maakOverdrachtPakket(o) {
  const nu = o.nu ?? new Date().toISOString(); const z = []; const git = gitIn(o.wortel);
  const taakPad = join(o.wortel, 'orchestratie/taken', `${o.taakId}.json`);
  if (!existsSync(taakPad)) return { zaken: [fout('TAAK_ONBEKEND', `задача ${o.taakId} не зареєстрована (orchestratie/taken)`, `taak ${o.taakId} niet geregistreerd`)] };
  const taak = JSON.parse(readFileSync(taakPad, 'utf8'));
  const agent = o.agent ?? taak.agent;
  if (!o.auteur || String(o.auteur).trim().length < 3) return { zaken: [fout('GEEN_AUTEUR', 'вкажіть --auteur (людина-автор випуску, ≥ 3 символи)', 'geef --auteur (menselijke auteur, ≥ 3 tekens)')] };
  if ((git('status', '--porcelain', '--untracked-files=no') ?? 'x') !== '') return { zaken: [fout('NIET_GECOMMIT', 'є незакомічені зміни — пакет збирається лише з HEAD', 'niet-gecommitte wijzigingen — alleen HEAD wordt verpakt')] };
  const head = git('rev-parse', 'HEAD'); const tak = git('branch', '--show-current') || taak.tak;
  const versie = o.versie ?? versieNu(nu);
  if (!VERSIE.test(versie)) return { zaken: [fout('VERSIE_ONGELDIG', `версія ${versie}: РРРРММДД-ГГХХСС`, `versie ${versie}: JJJJMMDD-UUMMSS`)] };
  // Дві бази, свідомо різні: (1) ВСТАНОВЛЕНА (geinstalleerd.json/beleid.basis) → UITROL-BASIS у tar — її звіряє root-інсталятор;
  // (2) база ГІЛКИ задачі (taak.basisCommit — від чого агент відгалузився) → basisCommit в ORCH-OVERDRACHT — від неї inleveren відтворює
  // зміни й рахує коміти/файли. Twee bases: geïnstalleerde (voor de installer) en de basis van de taak-tak (voor inleveren).
  const takBasis = String(taak.basisCommit || '');
  if (!SHA40.test(takBasis)) return { zaken: [fout('TAAK_BASIS', `задача ${o.taakId}: basisCommit не є повним SHA`, `taak ${o.taakId}: basisCommit is geen volledige SHA`)] };
  if (git('merge-base', '--is-ancestor', takBasis, head) === null) return { zaken: [fout('BASIS_NIET_IN_HEAD', `база гілки ${takBasis.slice(0, 12)} (taak.basisCommit) не є предком HEAD — роботу зроблено не від заявленої бази`, `basis van de tak ${takBasis.slice(0, 12)} is geen voorouder van HEAD`)] };
  const basis = basisVoorPakket(o.wortel, o.beleid);
  if (git('cat-file', '-e', `${basis.commit}^{commit}`) === null) z.push(waarsch('BASIS_ONBEKEND', `встановлений commit ${basis.commit.slice(0, 12)} невідомий локально — підсумок «від установки» не пораховано`, `geïnstalleerde commit ${basis.commit.slice(0, 12)} lokaal onbekend — geen samenvatting sinds de installatie`));
  const basisBekend = !z.length;
  if (basisBekend && git('merge-base', '--is-ancestor', basis.commit, head) === null) return { zaken: [fout('INSTALLATIE_NIET_IN_HEAD', `встановлена база ${basis.commit.slice(0, 12)} не є предком HEAD — пакет ставив би код, що не містить установленого; спершу rebase на integratie`, `geïnstalleerde basis ${basis.commit.slice(0, 12)} is geen voorouder van HEAD — eerst rebase`)] };
  if (versie <= basis.versie) return { zaken: [fout('NIET_NIEUWER', `версія ${versie} не новіша за встановлену ${basis.versie}`, `versie ${versie} is niet nieuwer dan de geïnstalleerde ${basis.versie}`)] };
  const sam = o.samenvatting ?? { uk: taak.omschrijving ?? '', nl: taak.omschrijving ?? '' };
  if (!sam.uk || sam.uk.trim().length < 20) return { zaken: [fout('SAMENVATTING_TE_KORT', 'підсумок (uk) має бути ≥ 20 символів — --samenvatting або omschrijving задачі', 'samenvatting (uk) ≥ 20 tekens — --samenvatting of omschrijving van de taak')] };

  const werk = mkdtempSync(join(tmpdir(), 'orch-pakket-'));
  try {
    const env = { ...process.env, AUTEUR: String(o.auteur), AGENT: agent, SAMENVATTING: sam.uk, BASIS_VERSIE: basis.versie, BASIS_COMMIT: basis.commit, UITROL_VERSIE_OVERRIDE: versie };
    if (o.manifestPad) env.MANIFEST = resolve(o.manifestPad);
    if (o.testresultatenPad) env.TESTRESULTATEN_BESTAND = resolve(o.testresultatenPad);
    const r = spawnSync('bash', [join(o.wortel, 'deploy/uitrol/maak-voorstelpakket.sh'), werk, basisBekend ? basis.commit : 'HEAD'], { cwd: o.wortel, env, encoding: 'utf8' });
    if (r.status !== 0) return { zaken: [fout('PAKKET_BOUW_MISLUKT', `maak-voorstelpakket.sh: ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ')}`, 'maak-voorstelpakket.sh mislukt')] };
    const tarPad = join(werk, `mijn-ruimte-${versie}.tar.gz`); const voorstel = JSON.parse(readFileSync(join(werk, `mijn-ruimte-${versie}.voorstel.json`), 'utf8'));
    const sha = sha256(tarPad); const bytes = statSync(tarPad).size;
    if (sha !== voorstel.sha256) return { zaken: [fout('INTEGRITEIT', 'sha256 архіву не збігається з .voorstel.json', 'sha256 van het archief wijkt af van .voorstel.json')] };
    const bereik = `${takBasis}..${head}`;
    const commits = (git('log', '--no-merges', '--format=%H%x1f%an%x1f%s', bereik) || '').split('\n').filter(Boolean).map((l) => { const [sha, auteur, onderwerp] = l.split('\x1f'); return { sha, auteur, onderwerp }; });
    const status = (git('diff', '--name-status', bereik) || '').split('\n').filter(Boolean).map((l) => l.split('\t'));
    const sindsInstallatie = basisBekend ? { commits: Number(git('rev-list', '--count', `${basis.commit}..${head}`) || 0), bestanden: (git('diff', '--name-only', `${basis.commit}..${head}`) || '').split('\n').filter(Boolean).length } : null;
    const bestanden = { gewijzigd: status.filter((s) => s[0].startsWith('M')).map((s) => s[1]), toegevoegd: status.filter((s) => s[0].startsWith('A')).map((s) => s[1]), verwijderd: status.filter((s) => s[0].startsWith('D')).map((s) => s[1]), hernoemd: status.filter((s) => s[0].startsWith('R')).map((s) => `${s[1]} → ${s[2]}`) };
    const alle = status.map((s) => s[s.length - 1]);
    const map = join(werk, 'overdracht'); mkdirSync(map);
    copyFileSync(tarPad, join(map, basename(tarPad)));
    writeFileSync(join(map, `${basename(tarPad)}.sha256`), `${sha}  ${basename(tarPad)}\n`);
    copyFileSync(join(werk, `mijn-ruimte-${versie}.voorstel.json`), join(map, `mijn-ruimte-${versie}.voorstel.json`));
    if (o.manifestPad) copyFileSync(resolve(o.manifestPad), join(map, 'UITROL-MANIFEST.json'));
    let tests = null;
    if (o.testresultatenPad) { copyFileSync(resolve(o.testresultatenPad), join(map, 'TESTRESULTATEN.json')); try { tests = JSON.parse(readFileSync(resolve(o.testresultatenPad), 'utf8')); } catch { tests = null; } }
    else writeFileSync(join(map, 'TESTRESULTATEN.json'), JSON.stringify({ geslaagd: null, mislukt: null, uitleg: { uk: 'результати тестів не додано до пакета', nl: 'geen testresultaten meegegeven' } }, null, 2));
    let handtekening = false;
    if (o.sigPad) { if (!existsSync(o.sigPad)) return { zaken: [fout('SIG_ONTBREEKT', `підпис ${o.sigPad} не знайдено`, `handtekening ${o.sigPad} niet gevonden`)] }; copyFileSync(resolve(o.sigPad), join(map, `${basename(tarPad)}.sig`)); handtekening = true; }
    writeFileSync(join(map, 'COMMITS.txt'), `# коміти гілки задачі ${o.taakId}: від бази гілки ${takBasis} до ${head} (${commits.length})\n# встановлена база: ${basis.versie} @ ${basis.commit}${sindsInstallatie ? ` — від установки ${sindsInstallatie.commits} комітів, ${sindsInstallatie.bestanden} файлів` : ''}\n${commits.map((c) => `${c.sha} ${c.auteur}: ${c.onderwerp}`).join('\n')}\n`);
    // git bundle потребує ref у діапазоні (голий SHA → «Refusing to create empty bundle»): HEAD == head, бо дерево чисте й нічого не комітилось.
    if (commits.length) { const b = spawnSync('git', ['bundle', 'create', join(map, 'commits.bundle'), `${takBasis}..HEAD`], { cwd: o.wortel, encoding: 'utf8' }); if (b.status !== 0) z.push(waarsch('BUNDLE_MISLUKT', `commits.bundle не створено: ${(b.stderr || '').trim().split('\n').pop()}`, 'commits.bundle niet gemaakt')); }
    let deelnemers;
    if (o.manifestPad) { try { deelnemers = JSON.parse(readFileSync(resolve(o.manifestPad), 'utf8')).deelnemers ?? []; } catch { deelnemers = []; } }
    if (!deelnemers?.length) {
      const ag = (o.beleid.agenten ?? []).find((a) => a.id === agent);
      deelnemers = [{ soort: 'mens', naam: String(o.auteur), rollen: ['auteur', 'controle'] }, { soort: 'ai', naam: agent, platform: o.agentPlatform ?? ag?.weergave ?? agent, tool: o.agentPlatform ?? 'onbekend', model: o.model ?? { id: null, versie: null, bron: 'onbekend' }, rollen: ['ontwikkeling', 'verpakken'] }];
    }
    writeFileSync(join(map, 'AGENTEN.json'), JSON.stringify({ schema: 1, deelnemers, taakId: o.taakId, aangemaakt: nu }, null, 2));
    const overdracht = {
      schema: 1, taakId: o.taakId, agent, agentPlatform: o.agentPlatform ?? null, model: o.model ?? { id: null, versie: null, bron: 'onbekend' },
      basisCommit: takBasis, basisVersie: basis.versie, basisBron: basis.bron, installatie: { versie: basis.versie, commit: basis.commit, bron: basis.bron, inHead: basisBekend }, sindsInstallatie, regelsVersie: o.beleid.regelsVersie, regelsHash: o.lock?.hash ?? null, kritiekBevestigd: !!o.lock?.eigenaar,
      tak, kanaal: 'zip', zonderGit: null, commits: commits.map((c) => c.sha), bestanden, samenvatting: sam, tests, nietGedaan: o.nietGedaan ?? { uk: '', nl: '' }, conflicten: [],
      pakket: { naam: basename(tarPad), versie, sha256: sha, bytes, bronCommit: head, handtekening, modus: o.beleid.kritiek.installatieModi.standaard },
      aangemaakt: nu,
    };
    writeFileSync(join(map, 'ORCH-OVERDRACHT.json'), `${JSON.stringify(overdracht, null, 2)}\n`);
    writeFileSync(join(map, 'RAPPORT.md'), maakRapport({ versie, taakId: o.taakId, agent, agentPlatform: o.agentPlatform, model: o.model, auteur: o.auteur, bytes, sha256: sha, commit: head, basisVersie: basis.versie, basisCommit: basis.commit, basisBron: basis.bron, takBasis, tak, sindsInstallatie, regelsVersie: o.beleid.regelsVersie, regelsHash: o.lock?.hash, kritiekBevestigd: !!o.lock?.eigenaar, modus: o.beleid.kritiek.installatieModi.standaard, handtekening, samenvatting: sam, commits, bestanden: alle, tests, deelnemers, nietGedaan: o.nietGedaan }));
    writeFileSync(join(map, 'LEESMIJ.txt'), `Mijn Ruimte — пакет передачі ${versie} (агент ${agent}, задача ${o.taakId}).\nВстановлюється ЛИШЕ ${basename(tarPad)} через інсталятор Mijn Ruimte (майстер «Нове оновлення» + passkey власника, або підписаний .sig в inbox).\nПеревірка: node scripts/orch.mjs pakket-controleer --bron ${overdrachtZipNaam(versie, agent)}\nІмпорт без git: node scripts/orch.mjs inleveren --bron ${overdrachtZipNaam(versie, agent)}\nДив. RAPPORT.md.\n`);
    mkdirSync(o.uit, { recursive: true });
    const zipPad = join(resolve(o.uit), overdrachtZipNaam(versie, agent));
    rmSync(zipPad, { force: true });
    const zr = spawnSync('zip', ['-q', '-j', zipPad, ...readdirSync(map).map((n) => join(map, n))], { encoding: 'utf8' });
    if (zr.status !== 0) return { zaken: [fout('ZIP_MISLUKT', `zip: ${(zr.stderr || zr.error?.message || '').trim()}`, 'zip mislukt')] };
    copyFileSync(tarPad, join(resolve(o.uit), basename(tarPad)));
    taak.releaseVersie = versie; taak.releaseSha256 = sha; taak.releaseCommit = head; taak.releaseZip = basename(zipPad); taak.bijgewerkt = nu;
    writeFileSync(taakPad, `${JSON.stringify(taak, null, 2)}\n`);
    return { zaken: z, zipPad, tarPad: join(resolve(o.uit), basename(tarPad)), versie, sha256: sha, bytes, commits: commits.length, bestanden: alle.length, basis, handtekening };
  } finally { rmSync(werk, { recursive: true, force: true }); }
}

const padOnveiligInArchief = (naam) => {
  const n = String(naam || '').replace(/\r$/, '');
  if (!n || n.startsWith('/') || /[\\:\0]/.test(n)) return true;
  const delen = n.replace(/^\.\//, '').split('/').filter(Boolean);
  return delen.includes('..');
};

/** Перевіряє список і типи записів ZIP до розпакування (захист від Zip-Slip та символьних посилань). */
export function controleerZipVooraf(zipPad) {
  const l1 = spawnSync('unzip', ['-Z1', zipPad], { encoding: 'utf8' });
  if (l1.status !== 0) return fout('UITPAKKEN_MISLUKT', `unzip -Z1: ${(l1.stderr || l1.error?.message || '').trim()}`, 'unzip -Z1 mislukt');
  const paden = (l1.stdout || '').split('\n').map((s) => s.replace(/\r$/, '')).filter(Boolean);
  if (paden.length > 60_000) return fout('INHOUD_ONVEILIG', `забагато записів у zip (${paden.length})`, 'te veel items in zip');
  const slechtPad = paden.find(padOnveiligInArchief);
  if (slechtPad) return fout('INHOUD_ONVEILIG', `небезпечний шлях у zip: ${slechtPad.slice(0, 120)}`, `onveilig pad in zip: ${slechtPad.slice(0, 120)}`);
  const ll = spawnSync('unzip', ['-Z', '-l', zipPad], { encoding: 'utf8' });
  if (ll.status !== 0) return fout('UITPAKKEN_MISLUKT', `unzip -Z -l: ${(ll.stderr || '').trim()}`, 'unzip -Z -l mislukt');
  const slechtType = (ll.stdout || '').split('\n').find((r) => /^([lcbps])[-rwxstST]{9}\s/.test(r.trim()));
  if (slechtType) return fout('INHOUD_ONVEILIG', `zip містить символьне посилання або спецфайл: ${slechtType.trim().slice(0, 120)}`, 'zip bevat symlink of speciaal bestand');
  return null;
}

/** Перевіряє список і типи записів TAR.GZ до розпакування (лише звичайні файли й теки, без «..» і абсолютних шляхів). */
export function controleerTarGzVooraf(tarPad) {
  const l1 = spawnSync('tar', ['-tzf', tarPad], { encoding: 'utf8' });
  if (l1.status !== 0) return fout('UITPAKKEN_MISLUKT', `tar -tzf: ${(l1.stderr || l1.error?.message || '').trim()}`, 'tar -tzf mislukt');
  const paden = (l1.stdout || '').split('\n').map((s) => s.replace(/\r$/, '')).filter(Boolean);
  if (paden.length > 60_000) return fout('INHOUD_ONVEILIG', `забагато записів у tar.gz (${paden.length})`, 'te veel items in tar.gz');
  const slechtPad = paden.find(padOnveiligInArchief);
  if (slechtPad) return fout('INHOUD_ONVEILIG', `небезпечний шлях у tar.gz: ${slechtPad.slice(0, 120)}`, `onveilig pad in tar.gz: ${slechtPad.slice(0, 120)}`);
  const lv = spawnSync('tar', ['-tvzf', tarPad], { encoding: 'utf8' });
  if (lv.status !== 0) return fout('UITPAKKEN_MISLUKT', `tar -tvzf: ${(lv.stderr || '').trim()}`, 'tar -tvzf mislukt');
  for (const r of (lv.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(.)[-rwxstST]{9}(?:[+@.]|\s)/.exec(r);
    if (m && m[1] !== '-' && m[1] !== 'd') return fout('INHOUD_ONVEILIG', `tar.gz містить недозволений тип запису (${m[1]}): ${r.slice(0, 120)}`, `tar.gz bevat niet-toegestaan type (${m[1]})`);
  }
  return null;
}

/** Розпаковує пакет передачі й повертає {map, tarPad, overdracht, zaken}. Цілісність: .sha256 має збігатися з архівом. */
export function leesOverdrachtZip(zipPad, werk) {
  const z = []; const map = join(werk, 'overdracht'); mkdirSync(map, { recursive: true });
  const vooraf = controleerZipVooraf(zipPad);
  if (vooraf) return { zaken: [vooraf] };
  const r = spawnSync('unzip', ['-o', '-q', '-j', zipPad, '-d', map], { encoding: 'utf8' });
  if (r.status !== 0) return { zaken: [fout('UITPAKKEN_MISLUKT', `unzip: ${(r.stderr || '').trim()}`, 'unzip mislukt')] };
  const namen = readdirSync(map); const tar = namen.find((n) => TAR_NAAM.test(n));
  if (!tar) return { zaken: [fout('TAR_ONTBREEKT', 'у пакеті передачі немає mijn-ruimte-<versie>.tar.gz', 'overdrachtzip bevat geen mijn-ruimte-<versie>.tar.gz')] };
  const tarPad = join(map, tar);
  const shaBestand = namen.find((n) => n === `${tar}.sha256`);
  if (!shaBestand) z.push(fout('SHA256_ONTBREEKT', `немає ${tar}.sha256 — цілісність не підтверджена`, `${tar}.sha256 ontbreekt`));
  else { const verwacht = readFileSync(join(map, shaBestand), 'utf8').trim().split(/\s+/)[0]; if (verwacht !== sha256(tarPad)) z.push(fout('INTEGRITEIT', `sha256 архіву не збігається з ${shaBestand} — пакет змінено або пошкоджено`, `sha256 van het archief wijkt af van ${shaBestand} — pakket gewijzigd of beschadigd`)); }
  let overdracht = null;
  if (!namen.includes('ORCH-OVERDRACHT.json')) z.push(fout('OVERDRACHT_ONTBREEKT', 'у пакеті передачі немає ORCH-OVERDRACHT.json', 'ORCH-OVERDRACHT.json ontbreekt'));
  else { try { overdracht = JSON.parse(readFileSync(join(map, 'ORCH-OVERDRACHT.json'), 'utf8')); } catch { z.push(fout('OVERDRACHT_ONGELDIG', 'ORCH-OVERDRACHT.json не є дійсним JSON', 'ORCH-OVERDRACHT.json is geen geldige JSON')); } }
  return { map, tarPad, tar, overdracht, zaken: z, versie: TAR_NAAM.exec(tar)[1] };
}

const tarLees = (tarPad, lid) => { const r = spawnSync('tar', ['-xzOf', tarPad, lid], { encoding: 'utf8' }); return r.status === 0 ? r.stdout : null; };

/** Повна перевірка пакета передачі без встановлення: назва, цілісність, метадані, вміст tar (UITROL-VERSIE, UITROL-BASIS, BRON-COMMIT, AGENT), база. */
export function controleerOverdrachtPakket(zipPad, { beleid, lock, geinstalleerd } = {}) {
  const z = []; const naam = basename(zipPad);
  if (!OVERDRACHT_ZIP.test(naam)) z.push(waarsch('ZIP_NAAM', `назва «${naam}» не за шаблоном mijn-ruimte-<versie>-<agent>-overdracht.zip`, `naam «${naam}» volgt niet mijn-ruimte-<versie>-<agent>-overdracht.zip`));
  const werk = mkdtempSync(join(tmpdir(), 'orch-pc-'));
  try {
    const g = leesOverdrachtZip(zipPad, werk); z.push(...g.zaken);
    if (!g.tarPad || !g.overdracht) return { zaken: z, geslaagd: false };
    const od = g.overdracht; z.push(...valideerOverdracht(od, beleid));
    for (const b of ['RAPPORT.md', 'AGENTEN.json', 'COMMITS.txt', 'TESTRESULTATEN.json']) if (!readdirSync(g.map).includes(b)) z.push(waarsch('BIJLAGE_ONTBREEKT', `у пакеті немає ${b}`, `${b} ontbreekt`));
    const m = OVERDRACHT_ZIP.exec(naam);
    if (m && (m[1] !== g.versie || m[2] !== od.agent)) z.push(fout('ZIP_NAAM_VERSCHILT', `назва zip (${m[1]}, ${m[2]}) ≠ вміст (${g.versie}, ${od.agent})`, `zipnaam (${m[1]}, ${m[2]}) ≠ inhoud (${g.versie}, ${od.agent})`));
    const lijst = (spawnSync('tar', ['-tzf', g.tarPad], { encoding: 'utf8' }).stdout || '').split('\n').map((s) => s.replace(/\r$/, '')).filter(Boolean);
    const top = lijst[0]?.split('/')[0] ?? '';
    const lees = (n) => tarLees(g.tarPad, `${top}/${n}`);
    const uv = (lees('UITROL-VERSIE') ?? '').trim();
    if (uv !== g.versie) z.push(fout('VERSIE_VERSCHILT', `UITROL-VERSIE в архіві (${uv || '—'}) ≠ ${g.versie}`, `UITROL-VERSIE in het archief (${uv || '—'}) ≠ ${g.versie}`));
    const bc = (lees('BRON-COMMIT') ?? '').trim();
    if (od.pakket?.bronCommit && bc !== od.pakket.bronCommit) z.push(fout('BRON_COMMIT_VERSCHILT', `BRON-COMMIT в архіві (${bc.slice(0, 12)}) ≠ ORCH-OVERDRACHT (${od.pakket.bronCommit.slice(0, 12)})`, `BRON-COMMIT in archief ≠ ORCH-OVERDRACHT`));
    const ag = (lees('AGENT') ?? '').trim();
    if (ag !== od.agent) z.push(fout('AGENT_VERSCHILT', `AGENT в архіві (${ag || '—'}) ≠ ${od.agent}`, `AGENT in archief (${ag || '—'}) ≠ ${od.agent}`));
    const basis = leesBasisBestand(lees('UITROL-BASIS'));
    z.push(...controleerBasis(basis, geinstalleerd ?? null, g.versie));
    // UITROL-BASIS = встановлена база; в ORCH-OVERDRACHT це installatie (пакети до цього поля: basisVersie/basisCommit).
    const odInst = od.installatie ?? { versie: od.basisVersie, commit: od.basisCommit };
    if (basis && (basis.versie !== odInst.versie || basis.commit !== odInst.commit)) z.push(fout('BASIS_VERSCHILT', `UITROL-BASIS в архіві (${basis.versie} @ ${String(basis.commit).slice(0, 12)}) ≠ встановлена база в ORCH-OVERDRACHT.json (${odInst.versie} @ ${String(odInst.commit).slice(0, 12)})`, 'UITROL-BASIS in archief ≠ geïnstalleerde basis in ORCH-OVERDRACHT.json'));
    if (basis?.regelsHash && lock?.hash && basis.regelsHash !== lock.hash) z.push(waarsch('REGELS_ANDERS', `пакет зібрано за правилами ${basis.regelsVersie} (${basis.regelsHash.slice(0, 12)}…), чинні — ${lock.regelsVersie} (${lock.hash.slice(0, 12)}…)`, `pakket gebouwd onder regels ${basis.regelsVersie}, geldend is ${lock.regelsVersie}`));
    if (!lijst.some((p) => p === `${top}/deploy/installeer-app.sh`)) z.push(fout('GEEN_INSTALLER', 'в архіві немає deploy/installeer-app.sh', 'deploy/installeer-app.sh ontbreekt'));
    if (lijst.some((p) => /\/(node_modules|dist|\.git)\//.test(p))) z.push(fout('INHOUD_ONVEILIG', 'архів містить node_modules/dist/.git', 'archief bevat node_modules/dist/.git'));
    const sig = readdirSync(g.map).find((n) => n.endsWith('.sig'));
    z.push(waarsch(sig ? 'HANDTEKENING_AANWEZIG' : 'GEEN_HANDTEKENING', sig ? 'є підпис .sig власника — перевіряє root (ssh-keygen -Y verify)' : 'без підпису — установка лише після підтвердження власника (passkey) або вручну', sig ? '.sig aanwezig — root controleert' : 'geen handtekening — installatie alleen na bevestiging van de eigenaar of handmatig'));
    return { zaken: z, geslaagd: !z.some((x) => x.ernst === 'fout'), versie: g.versie, overdracht: od, basis };
  } finally { rmSync(werk, { recursive: true, force: true }); }
}
