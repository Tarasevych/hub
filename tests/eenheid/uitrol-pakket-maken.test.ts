// Audit 18.10.2026, punt 10: de pakketscripts schrijven altijd een herleidbare BRON-COMMIT. Vroeger kon een pakket buiten git worden
// gebouwd met BRON-COMMIT «unknown» (zo stond het live). Nu: in git → HEAD (40 hex); buiten git → weigeren, behalve met een uitdrukkelijke
// reden (--zonder-git "reden" → «zonder-git:<reden>»). Het resultaat voldoet aan dezelfde regel als root en de voorcontrole (bronCommit).
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bronCommit } from '../../shared/bron-commit';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-pakket-maken');
  if (spawnSync('git', ['--version']).error) { console.log('overgeslagen: git ontbreekt'); return 0; }
  const basis = mkdtempSync(join(tmpdir(), 'pakket-maken-'));
  const script = join(basis, 'maak-voorstelpakket.sh'); copyFileSync(resolve('deploy/uitrol/maak-voorstelpakket.sh'), script);
  const src = join(basis, 'src'), uit = join(basis, 'uit'); mkdirSync(join(src, 'deploy'), { recursive: true }); mkdirSync(uit);
  writeFileSync(join(src, 'a.txt'), 'hallo\n'); writeFileSync(join(src, 'deploy/installeer-app.sh'), '#!/bin/bash\n');
  const env = { ...process.env, AUTEUR: 'Test Auteur', AGENT: 'claude', SAMENVATTING: 'Een samenvatting van minstens twintig tekens', GIT_CONFIG_NOSYSTEM: '1', HOME: basis };
  const maak = (versie: string, args: string[] = []) => spawnSync('bash', [script, ...args, uit], { cwd: src, env: { ...env, UITROL_VERSIE_OVERRIDE: versie }, encoding: 'utf8' });
  const commitIn = (versie: string) => execFileSync('tar', ['-xzOf', join(uit, `mijn-ruimte-${versie}.tar.gz`), `mijn-ruimte-${versie}/BRON-COMMIT`], { encoding: 'utf8' });
  try {
    let r = maak('20261018-100000');
    check('buiten git zonder vlag → geweigerd (vroeger: pakket met BRON-COMMIT «unknown»)', r.status === 1 && /geen git-repository/.test(r.stderr) && /--zonder-git/.test(r.stderr) && !existsSync(join(uit, 'mijn-ruimte-20261018-100000.tar.gz')), r.stderr);
    r = maak('20261018-100100', ['--zonder-git', 'kort']);
    check('--zonder-git met te korte reden → geweigerd', r.status === 1 && /minstens 5 tekens/.test(r.stderr), r.stderr);
    r = maak('20261018-100200', ['--zonder-git', 'sandbox van de agent, geen git']);
    const zg = r.status === 0 ? commitIn('20261018-100200') : '';
    check('--zonder-git "reden" → pakket met BRON-COMMIT «zonder-git:<reden>» + waarschuwing', r.status === 0 && zg === 'zonder-git:sandbox van de agent, geen git' && /BUITEN git/.test(r.stderr), `${r.status} ${zg} ${r.stderr}`);
    check('… en dat voldoet aan regel 3 (status zonder-git, reden zichtbaar)', bronCommit(zg).status === 'zonder-git' && bronCommit(zg).reden === 'sandbox van de agent, geen git');
    execFileSync('git', ['init', '-q', '.'], { cwd: src, env }); execFileSync('git', ['add', '-A'], { cwd: src, env });
    execFileSync('git', ['-c', 'user.email=t@t.invalid', '-c', 'user.name=t', 'commit', '-qm', 'x'], { cwd: src, env });
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8', env }).trim();
    r = maak('20261018-100300');
    const gc = r.status === 0 ? commitIn('20261018-100300') : '';
    check('in git → BRON-COMMIT = HEAD (40 hex), status git', r.status === 0 && gc === head && bronCommit(gc).status === 'git', `${r.status} ${gc} ${r.stderr}`);

    // UITGAVE-001 (06.11.2026): de eerste echte release liep vast in CI: `git log | head -c 7900` knipte midden in een Cyrillisch
    // teken, het losse surrogaat in argv liet json.dump falen (UnicodeEncodeError → PAKKET_BOUW_MISLUKT). Перша справжня збірка
    // випуску впала саме так. Тут — історія з кириличними повідомленнями, де межа 7900 байт гарантовано ріже символ.
    // Alle git-aanroepen van de test met dezelfde geïsoleerde env als het script (HOME = tijdelijke map): een eigen core.abbrev of
    // commit.gpgsign van de gebruiker mag de referentie niet anders maken. / Той самий ізольований env, що й у скрипта.
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t.invalid', '-c', 'user.name=t', ...a], { cwd: src, env });
    git('tag', 'basis-utf8');
    // 70 bestanden in één commit → diff --stat telt 71 regels; de samenvattingsregel «70 files changed» moet blijven.
    // 70 файлів в одному коміті → diff --stat має 71 рядок; підсумковий рядок має лишитися.
    for (let f = 0; f < 70; f++) writeFileSync(join(src, `bestand-${String(f).padStart(2, '0')}.txt`), `${f}\n`);
    git('add', '-A'); git('commit', '-qm', 'DIFF-TEST: 70 bestanden');
    const log = () => git('log', '--no-merges', '--format=- %h %s', 'basis-utf8..HEAD');
    const streng = new TextDecoder('utf-8', { fatal: true });
    const knipMiddenInTeken = (b: Buffer) => { try { streng.decode(b.subarray(0, 7900)); return false; } catch { return true; } };
    let i = 0;
    while (i < 400 && !(log().length > 7900 && knipMiddenInTeken(log()))) {
      i++; git('commit', '--allow-empty', '-qm', `ORCH-001: зміна №${i} — перевірка кирилиці в журналі змін${'ї'.repeat(i % 7)}`);
    }
    const ruw = log();
    check('… testopzet: git log > 7900 bytes en de grens valt midden in een teken', ruw.length > 7900 && knipMiddenInTeken(ruw), `${ruw.length} na ${i} commits`);
    const maakMet = (versie: string, ref: string) => spawnSync('bash', [script, uit, ref], { cwd: src, env: { ...env, UITROL_VERSIE_OVERRIDE: versie }, encoding: 'utf8' });
    r = maakMet('20261018-100400', 'basis-utf8');
    const voorstelPad = join(uit, 'mijn-ruimte-20261018-100400.voorstel.json');
    const vs = r.status === 0 && existsSync(voorstelPad) ? JSON.parse(readFileSync(voorstelPad, 'utf8')) : null;
    const cl: string = vs?.changelog ?? '';
    const regels = cl.split('\n');
    const echt = ruw.toString('utf8').split('\n');
    check('Cyrillische changelog > 7900 bytes → pakket + voorstel.json (vroeger: UnicodeEncodeError, geen pakket)', r.status === 0 && vs !== null && !/UnicodeEncodeError|surrogates/.test(r.stderr), `${r.status} ${r.stderr.slice(-600)}`);
    check('… changelog is geldig UTF-8 zonder vervangtekens of losse surrogaten', cl.length > 0 && !cl.includes('�') && !/[\uD800-\uDFFF]/.test(cl), JSON.stringify(cl.slice(-80)));
    check('… afgeknipt op een hele regel binnen de grens en gemarkeerd met «- …»', Buffer.byteLength(cl, 'utf8') <= 7906 && cl.endsWith('\n- …')
      && regels.slice(0, -1).every((l, n) => l === echt[n]), `${Buffer.byteLength(cl, 'utf8')} ${JSON.stringify(regels.slice(-3))}`);
    const romp = regels.slice(0, -1), volgende = echt[romp.length] ?? '';
    check('… zo veel mogelijk hele regels: de volgende regel had niet meer gepast', romp.length > 1
      && Buffer.byteLength(romp.join('\n'), 'utf8') + 1 + Buffer.byteLength(volgende, 'utf8') > 7900, `${romp.length} regels, volgende ${JSON.stringify(volgende)}`);
    check('… de site neemt het geheel over (≤ 8000 tekens, backend tekst(…, 8000))', cl.length > 0 && cl.length <= 8000, String(cl.length));
    const echtDiff = git('diff', '--stat', 'basis-utf8..HEAD').toString('utf8').replace(/\n+$/, '').split('\n');
    const dr = String(vs?.diff_summary ?? '').split('\n');
    check('diff --stat > 60 regels → «…» vooraan + de laatste 60 regels met «70 files changed» (vroeger: stil vooraan weg)',
      echtDiff.length === 71 && dr.length === 61 && dr[0] === '…' && dr.slice(1).join('\n') === echtDiff.slice(-60).join('\n') && /70 files changed/.test(dr[60]),
      `${echtDiff.length} → ${dr.length}: ${JSON.stringify([dr[0], dr[60]])}`);
    r = maakMet('20261018-100500', 'HEAD~1');
    const kortVs = r.status === 0 ? JSON.parse(readFileSync(join(uit, 'mijn-ruimte-20261018-100500.voorstel.json'), 'utf8')) : {};
    const kort = String(kortVs.changelog ?? '');
    check('korte Cyrillische changelog blijft ongewijzigd (geen «…»), lege diff blijft leeg', r.status === 0 && kort === echt[0] && !kort.includes('…') && kortVs.diff_summary === '',
      `${r.status} ${JSON.stringify(kort)} ${JSON.stringify(kortVs.diff_summary)} ${r.stderr.slice(-300)}`);
    // Niet-UTF-8-locale (Windows/Git Bash, ISO-8859-*): zonder UTF-8-modus faalde Python op Cyrillische print()/json.dump.
    // PYTHONUTF8=0 + PYTHONCOERCECLOCALE=0 onder LC_ALL=C bootst dat na; het script zet zelf PYTHONUTF8=1.
    // Не-UTF-8 локаль: без режиму UTF-8 Python падав на кирилиці; скрипт сам вмикає PYTHONUTF8=1.
    r = spawnSync('bash', [script, uit, 'HEAD~1'], { cwd: src, encoding: 'utf8', env: { ...env, UITROL_VERSIE_OVERRIDE: '20261018-100550', LC_ALL: 'C', LANG: 'C',
      PYTHONUTF8: '0', PYTHONCOERCECLOCALE: '0', TESTS_GESLAAGD: '3', TESTS_MISLUKT: '0', TESTS_SAMENVATTING: 'Підсумок тестів кирилицею' } });
    const asciiVs = r.status === 0 ? JSON.parse(readFileSync(join(uit, 'mijn-ruimte-20261018-100550.voorstel.json'), 'utf8')) : {};
    const asciiTests = r.status === 0 ? JSON.parse(execFileSync('tar', ['-xzOf', join(uit, 'mijn-ruimte-20261018-100550.tar.gz'), 'mijn-ruimte-20261018-100550/TESTRESULTATEN'], { encoding: 'utf8' })) : {};
    check('niet-UTF-8-locale → toch geldige Cyrillische voorstel.json en TESTRESULTATEN in het pakket', r.status === 0 && asciiVs.changelog === echt[0]
      && asciiVs.tests?.summary === 'Підсумок тестів кирилицею' && asciiTests.samenvatting === 'Підсумок тестів кирилицею', `${r.status} ${JSON.stringify(asciiVs.changelog)} ${r.stderr.slice(-300)}`);

    // Grens precies op een regeleinde: $(...) haalde die \n weg, Python zag 7900 bytes en hield de afgeknipte lijst voor compleet
    // (geen «- …», de rest stil weg). Межа рівно на \n: раніше обрізаний список виглядав повним. Нова bovenste regel van L bytes
    // schuift alles L op, dus kies L zo dat er een \n op positie 7900 komt te staan (bij een andere %h-lengte: nog een poging).
    const opGrens = () => { const b = log(); return b.length > 7901 && b[7900] === 0x0a; };
    for (let poging = 0; poging < 5 && !opGrens(); poging++) {
      const b = log();
      const h = (/^- ([0-9a-f]+) /.exec(b.toString('utf8'))?.[1] ?? '').length || 7;
      const p = b.lastIndexOf(0x0a, 7900 - (h + 4 + 40));
      git('commit', '--allow-empty', '-qm', 'GRENS-TEST: regel eindigt op de grens '.padEnd(7900 - p - (h + 4), 'x'));
    }
    const ruw2 = log();
    check('… testopzet: byte 7900 van de git log is een regeleinde', opGrens(), `${ruw2.length} ${ruw2[7900]}`);
    r = maakMet('20261018-100600', 'basis-utf8');
    const cl2 = r.status === 0 ? String(JSON.parse(readFileSync(join(uit, 'mijn-ruimte-20261018-100600.voorstel.json'), 'utf8')).changelog) : '';
    check('grens precies op een regeleinde → alle hele regels + «- …» (vroeger: stil afgeknipt, zonder markering)',
      r.status === 0 && cl2 === ruw2.subarray(0, 7900).toString('utf8') + '\n- …', `${r.status} ${Buffer.byteLength(cl2)} ${JSON.stringify(cl2.slice(-60))} ${r.stderr.slice(-300)}`);
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err));
  } finally {
    rmSync(basis, { recursive: true, force: true });
  }
  return einde();
}
