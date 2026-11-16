// Moduletest voor deploy/archief-herstellen.sh en deploy/pakketgegevens.py (SEC-003, 16.11.2026).
// Controleert:
//   - bash -n, LF-regeleinden, mktemp -d + trap, SHASUMS256-controle voor Node.js, vastgepinde SHA-256 voor cloudflared,
//     afwezigheid van vaste /tmp-paden (/tmp/node.tar.xz, /tmp/cf.deb, /tmp/pg_restore.log);
//   - echte werking van --proefrun (en afwijzing van ongeldige controlesommen/invoer) + opruimen van de werkmap;
//   - echte SHA-256-controle in node_installeren en cloudflared_installeren via file://-bronnen;
//   - py_compile en foutafhandeling van deploy/pakketgegevens.py zonder stille except Exception: pass (Bandit B110).
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checker } from './hulp/nep-google';

const HERSTEL = resolve('deploy/archief-herstellen.sh');
const PAKKETGEGEVENS = resolve('deploy/pakketgegevens.py');
const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

export async function main(): Promise<number> {
  const { check, einde } = checker('archief-herstellen-20261116');
  const bronSh = readFileSync(HERSTEL, 'utf8');
  const bronPy = readFileSync(PAKKETGEGEVENS, 'utf8');

  // 1. Statische en syntactische controles op deploy/archief-herstellen.sh
  const bashSyntax = spawnSync('bash', ['-n', HERSTEL], { encoding: 'utf8' });
  check('archief-herstellen.sh: bash -n slaagt zonder fouten', bashSyntax.status === 0, bashSyntax.stderr);
  check('archief-herstellen.sh: uitsluitend LF-regeleinden (geen CR)', !bronSh.includes('\r'));
  check('archief-herstellen.sh: gebruikt mktemp -d en trap om werkmap te verwijderen', /mktemp\s+-d/.test(bronSh) && /trap\s+'[^']*rm\s+-rf[^']*WERKMAP[^']*'\s+EXIT/.test(bronSh));
  check('archief-herstellen.sh: haalt SHASUMS256.txt op en gebruikt sha256sum -c - voor Node.js', bronSh.includes('SHASUMS256.txt') && /sha256sum\s+-c\s+-/.test(bronSh));
  check('archief-herstellen.sh: geen vaste /tmp-paden (/tmp/node.tar.xz, /tmp/cf.deb, /tmp/pg_restore.log)',
    !bronSh.includes('/tmp/node.tar.xz') && !bronSh.includes('/tmp/cf.deb') && !bronSh.includes('/tmp/pg_restore.log'));
  check('archief-herstellen.sh: geen onveilige latest-download of bash -c', !bronSh.includes('releases/latest/download/') && !bronSh.includes('bash -c'));

  // 2. Functionele test --proefrun en opruimen van tijdelijke map
  const basis = mkdtempSync(join(tmpdir(), 'sec003-herstel-'));
  try {
    const archief = join(basis, 'archief');
    const tijdelijk = join(basis, 'tmp');
    mkdirSync(join(archief, 'kod'), { recursive: true });
    mkdirSync(tijdelijk, { recursive: true });

    const scriptKopie = join(archief, 'vidnovyty.sh');
    copyFileSync(HERSTEL, scriptKopie);
    writeFileSync(join(archief, 'manifest.json'), JSON.stringify({ node: 'v24.11.0' }) + '\n');
    writeFileSync(join(archief, 'kod', 'release.tar.gz'), 'neprelease\n');
    const sommen = [
      `${sha256(readFileSync(join(archief, 'manifest.json')))}  manifest.json`,
      `${sha256(readFileSync(join(archief, 'kod', 'release.tar.gz')))}  kod/release.tar.gz`,
      `${sha256(readFileSync(scriptKopie))}  vidnovyty.sh`,
    ].join('\n') + '\n';
    writeFileSync(join(archief, 'SHA256SUMS'), sommen);

    const sleutel = join(basis, 'herstelsleutel-age.txt');
    writeFileSync(sleutel, 'AGE-SECRET-KEY-1TESTSLEUTELALLEENVOOREENHEIDSTEST0000000000000000000000\n');

    const proef = spawnSync('bash', [scriptKopie, '--sleutel', sleutel, '--proefrun'], {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: tijdelijk },
    });
    check('proefrun: slaagt op geldig proefarchief', proef.status === 0, proef.stderr || proef.stdout);
    check('proefrun: werkmap wordt na afloop via trap verwijderd', readdirSync(tijdelijk).length === 0, JSON.stringify(readdirSync(tijdelijk)));

    // Ongeldige --db en besmette Node-versie in manifest worden geweigerd
    const slechtDb = spawnSync('bash', [scriptKopie, '--sleutel', sleutel, '--proefrun', '--db', 'mijnruimte;drop'], {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: tijdelijk },
    });
    check('proefrun: weigert ongeldige --db-naam', slechtDb.status !== 0);

    // Beschadigde manifest-versie in manifest.json (met geldige SHA256SUMS) moet worden geweigerd
    const archiefSlechtNode = join(basis, 'archief-slecht-node');
    mkdirSync(archiefSlechtNode, { recursive: true });
    copyFileSync(HERSTEL, join(archiefSlechtNode, 'vidnovyty.sh'));
    writeFileSync(join(archiefSlechtNode, 'manifest.json'), JSON.stringify({ node: '24.0.0;id' }) + '\n');
    writeFileSync(join(archiefSlechtNode, 'SHA256SUMS'), `${sha256(readFileSync(join(archiefSlechtNode, 'manifest.json')))}  manifest.json\n`);
    const slechtNode = spawnSync('bash', [join(archiefSlechtNode, 'vidnovyty.sh'), '--sleutel', sleutel, '--proefrun'], {
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: tijdelijk },
    });
    check('proefrun: weigert ongeldige Node-versie in manifest', slechtNode.status !== 0);

    // 3. Echte SHA-256-controle voor node_installeren en cloudflared_installeren (via file://)
    const bronMap = join(basis, 'node-dist');
    const pakInhoud = join(basis, 'pak-inhoud');
    const nodeVer = '24.11.0';
    const nodeArch = process.arch === 'arm64' ? 'arm64' : 'x64';
    const debArch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const nodeMapNaam = `node-v${nodeVer}-linux-${nodeArch}`;
    const nodeArchiefNaam = `${nodeMapNaam}.tar.xz`;

    mkdirSync(bronMap, { recursive: true });
    mkdirSync(join(pakInhoud, nodeMapNaam, 'bin'), { recursive: true });
    writeFileSync(join(pakInhoud, nodeMapNaam, 'bin', 'node'), '#!/bin/sh\necho node\n');
    writeFileSync(join(pakInhoud, nodeMapNaam, 'bin', 'npm'), '#!/bin/sh\necho npm\n');
    writeFileSync(join(pakInhoud, nodeMapNaam, 'bin', 'npx'), '#!/bin/sh\necho npx\n');
    chmodSync(join(pakInhoud, nodeMapNaam, 'bin', 'node'), 0o755);
    execFileSync('tar', ['-cJf', join(bronMap, nodeArchiefNaam), '-C', pakInhoud, nodeMapNaam]);

    const echteNodeSha = sha256(readFileSync(join(bronMap, nodeArchiefNaam)));
    writeFileSync(join(bronMap, 'SHASUMS256.txt'), `${'0'.repeat(64)}  node-v${nodeVer}-win-x64.zip\n${echteNodeSha}  ${nodeArchiefNaam}\n`);

    const nodeDoel = join(basis, 'node-doel');
    const nodeBinDoel = join(basis, 'node-bin');
    const nodeWerk = join(basis, 'node-werk');
    mkdirSync(nodeWerk, { recursive: true });
    const nodeOkRun = spawnSync('bash', ['-c', `source "${HERSTEL}"; WERKMAP="${nodeWerk}"; PROEF=0; NODE_VERSIE="${nodeVer}"; NODE_ARCH="${nodeArch}"; NODE_BRON="file://${bronMap}"; NODE_DOEL="${nodeDoel}"; NODE_BIN_DOEL="${nodeBinDoel}"; node_installeren`], { encoding: 'utf8' });
    check('node_installeren: geldig SHASUMS256-archief wordt gecontroleerd en uitgepakt',
      nodeOkRun.status === 0 && existsSync(join(nodeBinDoel, 'node')) && existsSync(join(nodeDoel, nodeMapNaam, 'bin', 'node')),
      nodeOkRun.stderr || nodeOkRun.stdout);

    // Nu foutieve SHA-256 in SHASUMS256.txt
    const nodeFoutDoel = join(basis, 'node-doel-fout');
    writeFileSync(join(bronMap, 'SHASUMS256.txt'), `${'f'.repeat(64)}  ${nodeArchiefNaam}\n`);
    const nodeFoutRun = spawnSync('bash', ['-c', `source "${HERSTEL}"; WERKMAP="${nodeWerk}"; PROEF=0; NODE_VERSIE="${nodeVer}"; NODE_ARCH="${nodeArch}"; NODE_BRON="file://${bronMap}"; NODE_DOEL="${nodeFoutDoel}"; NODE_BIN_DOEL="${join(basis, 'node-bin-fout')}"; node_installeren`], { encoding: 'utf8' });
    check('node_installeren: weigert archief bij afwijkende SHA-256 en pakt niets uit',
      nodeFoutRun.status !== 0 && !existsSync(nodeFoutDoel),
      nodeFoutRun.stderr);

    // cloudflared_installeren: geldige en ongeldige .deb
    const cfMap = join(basis, 'cf-dist');
    const cfWerk = join(basis, 'cf-werk');
    mkdirSync(cfMap, { recursive: true });
    mkdirSync(cfWerk, { recursive: true });
    const cfBestand = `cloudflared-linux-${debArch}.deb`;
    writeFileSync(join(cfMap, cfBestand), 'nep-deb-inhoud\n');
    const cfSha = sha256(readFileSync(join(cfMap, cfBestand)));
    const cfMarkering = join(basis, 'dpkg-aangeroepen.txt');
    const nepDpkg = join(basis, 'nep-dpkg.sh');
    writeFileSync(nepDpkg, `#!/bin/sh\necho "$*" > "${cfMarkering}"\n`);
    chmodSync(nepDpkg, 0o755);

    const shaVar = debArch === 'arm64' ? 'CLOUDFLARED_SHA256_ARM64' : 'CLOUDFLARED_SHA256_AMD64';
    const cfOkRun = spawnSync('bash', ['-c', `source "${HERSTEL}"; WERKMAP="${cfWerk}"; PROEF=0; DEB_ARCH="${debArch}"; CLOUDFLARED_BRON="file://${cfMap}"; ${shaVar}="${cfSha}"; DPKG_CMD="${nepDpkg}"; cloudflared_installeren`], { encoding: 'utf8' });
    check('cloudflared_installeren: geldige .deb slaagt SHA-256-controle en roept dpkg aan',
      cfOkRun.status === 0 && existsSync(cfMarkering),
      cfOkRun.stderr || cfOkRun.stdout);

    rmSync(cfMarkering, { force: true });
    const cfFoutRun = spawnSync('bash', ['-c', `source "${HERSTEL}"; WERKMAP="${cfWerk}"; PROEF=0; DEB_ARCH="${debArch}"; CLOUDFLARED_BRON="file://${cfMap}"; ${shaVar}="${'a'.repeat(64)}"; DPKG_CMD="${nepDpkg}"; cloudflared_installeren`], { encoding: 'utf8' });
    check('cloudflared_installeren: foutieve SHA-256 stopt vóór dpkg -i',
      cfFoutRun.status !== 0 && !existsSync(cfMarkering),
      cfFoutRun.stderr);

    // 4. deploy/pakketgegevens.py: geen except Exception: pass (Bandit B110), py_compile en foutafhandeling
    check('pakketgegevens.py: geen blind except Exception meer', !/except\s+Exception\s*:/.test(bronPy));
    const pyCache = join(basis, 'pycache');
    const pyCompile = spawnSync('python3', ['-m', 'py_compile', PAKKETGEGEVENS], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONPYCACHEPREFIX: pyCache },
    });
    check('pakketgegevens.py: python3 -m py_compile slaagt', pyCompile.status === 0, pyCompile.stderr);

    const relMap = join(basis, 'release-meta');
    mkdirSync(relMap, { recursive: true });
    writeFileSync(join(relMap, 'AUTEUR'), 'Test Eigenaar\n');
    writeFileSync(join(relMap, 'AGENT'), 'antigravity\n');
    writeFileSync(join(relMap, 'PAKKET-BRON-COMMIT'), 'a'.repeat(40) + '\n');

    const geldigExtra = JSON.stringify({ pakket_sha256: 'c'.repeat(64), pakket_bytes: 4096 });
    const pyOk = spawnSync('python3', [PAKKETGEGEVENS, relMap, geldigExtra], { encoding: 'utf8' });
    const pyOkData = JSON.parse(pyOk.stdout || '{}');
    check('pakketgegevens.py: geldige invoer geeft volledig JSON-record zonder stderr',
      pyOk.status === 0 && pyOkData.sha256 === 'c'.repeat(64) && pyOkData.bytes === 4096 && pyOk.stderr === '',
      pyOk.stderr);

    const pyKapot = spawnSync('python3', [PAKKETGEGEVENS, relMap, '{kapotte-json'], { encoding: 'utf8' });
    const pyKapotData = JSON.parse(pyKapot.stdout || '{}');
    check('pakketgegevens.py: kapotte JSON geeft geldige terugval op stdout en waarschuwing op stderr',
      pyKapot.status === 0 && pyKapotData.auteur === 'Test Eigenaar' && !('sha256' in pyKapotData) && pyKapot.stderr.includes('ongeldige UITROL_GEB_EXTRA-json'),
      pyKapot.stderr);

    const pyBool = spawnSync('python3', [PAKKETGEGEVENS, relMap, JSON.stringify({ pakket_bytes: true })], { encoding: 'utf8' });
    const pyBoolData = JSON.parse(pyBool.stdout || '{}');
    check('pakketgegevens.py: bool in pakket_bytes wordt niet als geldig getal aanvaard',
      pyBool.status === 0 && !('bytes' in pyBoolData));
  } finally {
    rmSync(basis, { recursive: true, force: true });
  }

  return einde();
}
