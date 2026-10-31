// ORCH-001 незалежний аудит перед інтеграцією (31.10.2026): регресійні тести на виправлення безпеки, збірки та сумісності з SEC-001.
// Перевіряє:
//   1. Блокування RCE через orch_inleveren_klaar / uploadKlaar (заборона довільних shell-команд у tests + невиконання коду з пакета агента);
//   2. Очищення змінних середовища (veiligeTestEnv не передає DATABASE_URL/ключів/секретів дочірнім процесам);
//   3. Захист SEC-001-05: усі /api/owner/orch/* заборонені під час імперсонації (навіть metActies=true) та для agent-namens;
//   4. Ізоляція пошукового каталогу інтерфейсу: TabOrch, вкладка #orch і hulp:orch.* доступні лише у технічному профілі на mcp/agents;
//   5. Посилення verifieerSshsig (namespaces=..., cert-authority, версія SSHSIG, зайві байти) та реальна перевірка SSH-підпису в GitOps PYMODUS;
//   6. Попередня перевірка архівів (symlink / traversal до розпакування), padVeilig (.git, \, :), захист githubRef від git option injection;
//   7. Прив’язка besluit.id до запису root-журналу та ізольований git worktree у voorstelToepassen.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID, sign as cryptoSign } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as k from '../../scripts/orch/kern.mjs';
import { inleveren, veiligeTestEnv } from '../../scripts/orch/inleveren.mjs';
import { controleerTarGzVooraf, controleerZipVooraf } from '../../scripts/orch/pakket.mjs';
import { ORCH_TOOLS } from '../../backend/orch-hulpmiddeldefinities';
import { agentRouteVerboden } from '../../backend/agent-namens';
import { _uiCatalogusLeeg, uiObjectenVoor } from '../../backend/zoek/catalogus-ui';
import { routeOordeel } from '../../shared/impersonatie';
import { ORCH_ROUTES } from '../../shared/orch-model';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const json = (p: string) => JSON.parse(lees(p));
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function pythonCmd(): string {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'import sys; sys.exit(0)'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  return 'python3';
}

function gitopsPyModus(bron: string, journal: string, ondertekenaars?: string) {
  const s = lees('deploy/gitops/gitops-ophalen.sh');
  const a = s.indexOf("<<'PYMODUS'\n"); const b = s.indexOf('\nPYMODUS\n', a);
  if (a < 0 || b < 0) throw new Error('PYMODUS niet gevonden');
  const py = pythonCmd();
  const argv = ['-I', '-', bron, journal, ...(ondertekenaars ? [ondertekenaars] : [])];
  const r = spawnSync(py, argv, { input: s.slice(a + "<<'PYMODUS'\n".length, b + 1), encoding: 'utf8' });
  return { code: r.status ?? -1, uit: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

function sshSignEd25519(namespace: string, bericht: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pubRaw = Buffer.from((publicKey.export({ format: 'jwk' }) as { x: string }).x, 'base64url');
  const s = (b: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(b.length); return Buffer.concat([l, b]); };
  const pub = Buffer.concat([s(Buffer.from('ssh-ed25519')), s(pubRaw)]);
  const ruw = cryptoSign(null, k.sshsigGegevens(namespace, Buffer.from(bericht)), privateKey);
  const sig = Buffer.concat([s(Buffer.from('ssh-ed25519')), s(ruw)]);
  const ver = Buffer.alloc(4); ver.writeUInt32BE(1);
  const blob = Buffer.concat([Buffer.from('SSHSIG'), ver, s(pub), s(Buffer.from(namespace)), s(Buffer.alloc(0)), s(Buffer.from('sha512')), s(sig)]);
  return {
    blob,
    pubB64: pub.toString('base64'),
    handtekening: `-----BEGIN SSH SIGNATURE-----\n${blob.toString('base64').match(/.{1,70}/g)!.join('\n')}\n-----END SSH SIGNATURE-----\n`,
  };
}

function maakOrchRepo() {
  const R = mkdtempSync(join(tmpdir(), 'orch-rev-repo-'));
  for (const p of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'ANTIGRAVITY.md', 'CHATGPT.md', 'CODEX.md', 'GROK.md', '.cursorrules', 'scripts/orch.mjs', 'scripts/orch', 'orchestratie/beleid.json', 'orchestratie/BESLUITEN.md', 'orchestratie/eigenaar-ondertekenaars', 'orchestratie/sjablonen']) {
    cpSync(p, join(R, p), { recursive: true });
  }
  cpSync('.github/copilot-instructions.md', join(R, '.github/copilot-instructions.md'));
  mkdirSync(join(R, 'src'), { recursive: true });
  writeFileSync(join(R, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(join(R, 'orchestratie/wachtrij.json'), JSON.stringify({ schema: 1, integratieTak: 'integratie', integratieHoofd: null, bezig: null, wachtrij: [] }, null, 2));
  git(R, 'init', '-q', '-b', 'integratie');
  git(R, 'config', 'user.email', 'eigenaar@test.invalid');
  git(R, 'config', 'user.name', 'eigenaar');
  execFileSync(process.execPath, [join(R, 'scripts/orch.mjs'), 'vergrendel'], { cwd: R });
  execFileSync(process.execPath, [join(R, 'scripts/orch.mjs'), 'context'], { cwd: R });
  git(R, 'add', '-A');
  git(R, 'commit', '-q', '-m', 'basis');
  return { R, basis: git(R, 'rev-parse', 'HEAD'), beleid: json(join(R, 'orchestratie/beleid.json')), lock: json(join(R, 'orchestratie/regels.lock.json')) };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('orch-beoordeling');

  // ---------------------------------------------------------------- 1. SEC-001-05: impersonatie & agent-namens
  const alleOrchRoutes = Object.values(ORCH_ROUTES).map((r) => `POST ${r}`);
  check('impersonatie: alle /api/owner/orch/* verboden (alleen-lezen én metActies=true)',
    alleOrchRoutes.every((r) => routeOordeel(r, false) === 'IMPERSONATIE_VERBODEN' && routeOordeel(r, true) === 'IMPERSONATIE_VERBODEN'));
  check('agent-namens: alle /api/owner/orch/* verboden voor agenten namens eigenaar',
    alleOrchRoutes.every((r) => agentRouteVerboden(r) === true));

  // ---------------------------------------------------------------- 2. UI-zoekcatalogus: TabOrch & #orch alleen technisch op mcp/agents
  _uiCatalogusLeeg();
  const iedereen = uiObjectenVoor('iedereen');
  const technisch = uiObjectenVoor('technisch');
  check('zoekcatalogus: geen TabOrch, geen #orch-tabblad en geen hulp:orch.* voor gewone gebruikers (iedereen)',
    !iedereen.some((o) => o.extra?.bestand === 'src/agenten/TabOrch.tsx' || o.route?.hash === '#orch' || o.id.startsWith('hulp:orch.')));
  check('zoekcatalogus: TabOrch, #orch en hulp:orch.* staan wél in technisch profiel',
    technisch.some((o) => o.extra?.bestand === 'src/agenten/TabOrch.tsx' && o.route.host === 'mcp')
    && technisch.some((o) => o.route?.hash === '#orch')
    && technisch.some((o) => o.id === 'hulp:orch.regels' && o.route.host === 'mcp'));
  const { genereer, naarTs } = await import(pathToFileURL(join(process.cwd(), 'scripts/zoek-ui-catalogus.mjs')).href);
  check('zoekcatalogus: shared/zoek-ui-knoppen.generated.ts is actueel na toevoeging van TabOrch.tsx',
    naarTs(genereer(process.cwd())) === lees(join(process.cwd(), 'shared/zoek-ui-knoppen.generated.ts')));

  // ---------------------------------------------------------------- 3. padVeilig & verifieerSshsig
  check('padVeilig: weigert genest .git, backslashes, dubbele punt, lege segmenten en ..',
    !k.padVeilig('sub/.git/hooks/post-checkout') && !k.padVeilig('src\\a.ts') && !k.padVeilig('C:src/a.ts')
    && !k.padVeilig('./src/a.ts') && !k.padVeilig('src//a.ts') && !k.padVeilig('src/../a.ts') && k.padVeilig('src/orch/orch.css'));

  const bericht = 'mijn-ruimte-regels\nregelsVersie=1.3.0\nkritiekHash=' + 'a'.repeat(64) + '\n';
  const sig = sshSignEd25519('mijn-ruimte-regels', bericht);
  check('verifieerSshsig: geldige namespaces="mijn-ruimte-regels" → ok',
    k.verifieerSshsig({ handtekening: sig.handtekening, bericht, namespace: 'mijn-ruimte-regels', toegestaan: `eigenaar@mijn-ruimte namespaces="mijn-ruimte-regels" ssh-ed25519 ${sig.pubB64}\n` }).ok === true);
  check('verifieerSshsig: sleutel beperkt tot namespaces="mijn-ruimte-uitrol" → geweigerd voor mijn-ruimte-regels',
    k.verifieerSshsig({ handtekening: sig.handtekening, bericht, namespace: 'mijn-ruimte-regels', toegestaan: `eigenaar@mijn-ruimte namespaces="mijn-ruimte-uitrol" ssh-ed25519 ${sig.pubB64}\n` }).ok === false);
  check('verifieerSshsig: negatie namespaces="mijn-ruimte-*,!mijn-ruimte-regels" → geweigerd',
    k.verifieerSshsig({ handtekening: sig.handtekening, bericht, namespace: 'mijn-ruimte-regels', toegestaan: `eigenaar@mijn-ruimte namespaces="mijn-ruimte-*,!mijn-ruimte-regels" ssh-ed25519 ${sig.pubB64}\n` }).ok === false);
  check('verifieerSshsig: cert-authority regel mag geen gewone sleutelhandtekening valideren',
    k.verifieerSshsig({ handtekening: sig.handtekening, bericht, namespace: 'mijn-ruimte-regels', toegestaan: `eigenaar@mijn-ruimte cert-authority,namespaces="mijn-ruimte-regels" ssh-ed25519 ${sig.pubB64}\n` }).ok === false);
  const extraBlob = Buffer.concat([sig.blob, Buffer.from([0x00])]);
  const extraSig = `-----BEGIN SSH SIGNATURE-----\n${extraBlob.toString('base64')}\n-----END SSH SIGNATURE-----\n`;
  check('verifieerSshsig: extra bytes achter SSHSIG-structuur → geweigerd',
    k.verifieerSshsig({ handtekening: extraSig, bericht, namespace: 'mijn-ruimte-regels', toegestaan: `eigenaar@mijn-ruimte ssh-ed25519 ${sig.pubB64}\n` }).ok === false);

  // ---------------------------------------------------------------- 4. veiligeTestEnv
  const schoonEnv = veiligeTestEnv({
    PATH: '/usr/bin',
    TEMP: '/tmp',
    DATABASE_URL: 'postgres://geheim',
    DATABASE_URL_SYSTEM: 'postgres://geheim2',
    TOTP_ENCRYPTION_KEY_V1: 'geheim3',
    RECOVERY_CODE_PEPPER: 'geheim4',
    CODEWOORD_PEPER: 'geheim5',
    SESSION_SECRET: 'geheim6',
  });
  check('veiligeTestEnv: verwijdert alle database- en applicatiegeheimen uit subprocess-omgeving',
    schoonEnv.PATH === '/usr/bin' && !('DATABASE_URL' in schoonEnv) && !('DATABASE_URL_SYSTEM' in schoonEnv)
    && !('TOTP_ENCRYPTION_KEY_V1' in schoonEnv) && !('RECOVERY_CODE_PEPPER' in schoonEnv)
    && !('CODEWOORD_PEPER' in schoonEnv) && !('SESSION_SECRET' in schoonEnv));

  // ---------------------------------------------------------------- 5. MCP-schema, RCE-preventie, archief-voorcontrole & voorstelToepassen
  const klaarTool = ORCH_TOOLS.find((t) => t.name === 'orch_inleveren_klaar')!;
  check('mcp-schema: orch_inleveren_klaar accepteert geen willekeurige tests-array meer',
    !Object.prototype.hasOwnProperty.call((klaarTool.inputSchema as { properties: Record<string, unknown> }).properties, 'tests'));

  const { R, basis, beleid, lock } = maakOrchRepo();
  const T = mkdtempSync(join(tmpdir(), 'orch-rev-tmp-'));
  const oudEnv = {
    ORCH_WORTEL: process.env.ORCH_WORTEL,
    ORCH_INBOX: process.env.ORCH_INBOX,
    OPDRACHT_STATUS_DIR: process.env.OPDRACHT_STATUS_DIR,
    MCP_RECHTEN_PAD: process.env.MCP_RECHTEN_PAD,
  };
  Object.assign(process.env, {
    ORCH_WORTEL: R,
    ORCH_INBOX: join(T, 'inbox'),
    OPDRACHT_STATUS_DIR: join(T, 'status'),
    MCP_RECHTEN_PAD: join(T, 'mcp-rechten.json'),
  });
  mkdirSync(join(T, 'status'), { recursive: true });

  try {
    // 5a. git option injection in github_pr
    const optInj = inleveren({ wortel: R, beleid, lock, bron: '--upload-pack=evil', kanaal: 'github_pr' });
    check('githubRef: weigert git-optie-injectie (--upload-pack=…) met REF_ONGELDIG',
      optInj.uitkomst === 'geweigerd' && optInj.zaken.some((z: { code: string }) => z.code === 'REF_ONGELDIG'));

    // 5b. tar.gz met symlink of traversal wordt VÓÓR uitpakken geweigerd
    const py = pythonCmd();
    const kwaadTar = join(T, 'symlink.tar.gz');
    const pyTar = spawnSync(py, ['-c', `
import io, sys, tarfile
with tarfile.open(sys.argv[1], "w:gz") as tf:
    ti = tarfile.TarInfo("sub/link")
    ti.type = tarfile.SYMTYPE
    ti.linkname = "/etc/passwd"
    tf.addfile(ti)
`, kwaadTar], { encoding: 'utf8' });
    if (pyTar.status === 0) {
      const vt = controleerTarGzVooraf(kwaadTar);
      check('archief-voorcontrole: tar.gz met symlink wordt vóór uitpakken geweigerd met INHOUD_ONVEILIG', vt?.code === 'INHOUD_ONVEILIG');
    }

    else console.log('  OVERGESLAGEN: python ontbreekt — tar.gz met symlink niet gebouwd');

    // 5b2. Archiefbommen en zip-voorcontrole (adversariële review): de grens geldt voor de WERKELIJK uitgepakte bytes, niet voor wat de koppen
    // beweren; een sparse tar-bestand telt met zijn volle grootte; zip met symlink/«..» wordt vóór het uitpakken geweigerd.
    const MB = 1024 * 1024;
    const bom = join(T, 'bommen'); mkdirSync(bom, { recursive: true });
    const pyBom = spawnSync(py, ['-I', '-c', `
import os, struct, sys, tarfile, zipfile
d = sys.argv[1]; n = 20 * 1024 * 1024
for naam in ("eerlijk", "vals"):
    with zipfile.ZipFile(os.path.join(d, naam + ".zip"), "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("nul.bin", b"\\0" * n)
data = bytearray(open(os.path.join(d, "vals.zip"), "rb").read())
struct.pack_into("<I", data, 22, 10)
cd = data.find(b"PK\\x01\\x02"); struct.pack_into("<I", data, cd + 24, 10)
open(os.path.join(d, "vals.zip"), "wb").write(data)
open(os.path.join(d, "nul.bin"), "wb").write(b"\\0" * n)
with tarfile.open(os.path.join(d, "bom.tar.gz"), "w:gz") as tf:
    tf.add(os.path.join(d, "nul.bin"), arcname="nul.bin")
with zipfile.ZipFile(os.path.join(d, "klein.zip"), "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("src/a.ts", "export const a = 1;\\n")
with zipfile.ZipFile(os.path.join(d, "slip.zip"), "w") as zf:
    zf.writestr("../buiten.txt", "x")
with zipfile.ZipFile(os.path.join(d, "link.zip"), "w") as zf:
    zi = zipfile.ZipInfo("sub/link"); zi.create_system = 3; zi.external_attr = (0o120777 << 16)
    zf.writestr(zi, "/etc/passwd")
`, bom], { encoding: 'utf8' });
    if (pyBom.status === 0) {
      const ll = spawnSync('unzip', ['-Z', '-l', join(bom, 'vals.zip')], { encoding: 'utf8' }).stdout;
      const v1 = controleerZipVooraf(join(bom, 'eerlijk.zip'), { maxBytes: 10 * MB });
      const v2 = controleerZipVooraf(join(bom, 'vals.zip'), { maxBytes: 10 * MB });
      check('zip-bom (20 MiB nullen in 20 KiB) → INHOUD_TE_GROOT vóór uitpakken', v1?.code === 'INHOUD_TE_GROOT', JSON.stringify(v1));
      check('zip-bom met VERVALSTE grootte in de koppen (unzip -Z zegt «10 bytes») → toch INHOUD_TE_GROOT: telt werkelijke bytes',
        /\b10 bytes uncompressed\b/.test(ll) && v2?.code === 'INHOUD_TE_GROOT', `${JSON.stringify(v2)} | ${ll.trim().split('\n').pop()}`);
      const v3 = controleerTarGzVooraf(join(bom, 'bom.tar.gz'), { maxBytes: 10 * MB });
      check('tar.gz-bom (20 MiB nullen) → INHOUD_TE_GROOT vóór uitpakken', v3?.code === 'INHOUD_TE_GROOT', JSON.stringify(v3));
      check('kleine zip onder de grens → geen bezwaar; standaardgrens 1 GiB ruim boven de repo (~35 MB)', controleerZipVooraf(join(bom, 'klein.zip'), { maxBytes: 10 * MB }) === null && controleerZipVooraf(join(bom, 'eerlijk.zip')) === null);
      check('zip-voorcontrole: «../buiten.txt» → INHOUD_ONVEILIG (Zip-Slip) vóór uitpakken', controleerZipVooraf(join(bom, 'slip.zip'))?.code === 'INHOUD_ONVEILIG');
      check('zip-voorcontrole: symlink-item (0120777) → INHOUD_ONVEILIG vóór uitpakken', controleerZipVooraf(join(bom, 'link.zip'))?.code === 'INHOUD_ONVEILIG', JSON.stringify(controleerZipVooraf(join(bom, 'link.zip'))));
      const werkMappen = () => readdirSync(tmpdir()).filter((n) => n.startsWith('orch-inlever-')).length;
      const voor = werkMappen();
      const eind = inleveren({ wortel: R, beleid, lock, bron: join(bom, 'vals.zip'), maxUitgepaktBytes: 10 * MB });
      check('inleveren met zip-bom (vervalste koppen) → geweigerd met INHOUD_TE_GROOT (uk én nl), geen werkmap achtergelaten',
        eind.uitkomst === 'geweigerd' && eind.zaken.some((z: { code: string; uk: string; nl: string }) => z.code === 'INHOUD_TE_GROOT' && /архівну бомбу/.test(z.uk) && /archiefbom/.test(z.nl)) && werkMappen() === voor, JSON.stringify(eind.zaken));
    } else console.log('  OVERGESLAGEN: python ontbreekt — archiefbommen niet gebouwd', pyBom.stderr);
    // Sparse tar: 64 MiB «zichtbaar» uit een stroom van een paar KiB — de gz-stroom is klein, de tar-koppen niet.
    const sparseBron = join(bom, 'sparse.bin');
    const sp = spawnSync(py, ['-I', '-c', 'import sys\nf = open(sys.argv[1], "wb"); f.seek(64 * 1024 * 1024 - 1); f.write(b"\\0"); f.close()', sparseBron], { encoding: 'utf8' });
    const spTar = sp.status === 0 ? spawnSync('tar', ['--sparse', '--format=posix', '-czf', join(bom, 'sparse.tar.gz'), '-C', bom, 'sparse.bin'], { encoding: 'utf8' }) : null;
    if (spTar?.status === 0) {
      const gz = Number(spawnSync('sh', ['-c', 'gzip -dc -- "$1" | wc -c', 'sh', join(bom, 'sparse.tar.gz')], { encoding: 'utf8' }).stdout.trim());
      const vs = controleerTarGzVooraf(join(bom, 'sparse.tar.gz'), { maxBytes: 10 * MB });
      check('sparse tar (64 MiB zichtbaar, gz-stroom < 1 MiB) → INHOUD_TE_GROOT uit de tar-koppen, vóór uitpakken', gz < MB && vs?.code === 'INHOUD_TE_GROOT', `gz=${gz} ${JSON.stringify(vs)}`);
    } else console.log('  OVERGESLAGEN: tar --sparse niet beschikbaar — sparse-bom niet getest');

    // 5c. kwaadaardig pakket dat scripts/orch.mjs overschrijft mag NOOIT worden uitgevoerd bij uploadKlaar / inleveren
    const pwnPad = join(T, 'PWNED.txt');
    const pakBron = join(T, 'pakbron');
    mkdirSync(join(pakBron, 'scripts'), { recursive: true });
    writeFileSync(join(pakBron, 'scripts/orch.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(pwnPad)}, 'RCE');\nprocess.exit(0);\n`);
    writeFileSync(join(pakBron, 'ORCH-OVERDRACHT.json'), JSON.stringify({
      schema: 1,
      taakId: 'SEC-999',
      agent: 'grok',
      tak: 'feature/sec-999-20261031-170000',
      basisCommit: basis,
      regelsVersie: beleid.regelsVersie,
      regelsHash: lock.hash,
      kanaal: 'tar_gz',
      zonderGit: 'regressietest RCE',
      samenvatting: { uk: 'Тестова перевірка: змінений scripts/orch.mjs у пакеті агента не виконується', nl: 'Test: gewijzigde scripts/orch.mjs in pakket wordt niet uitgevoerd' },
    }));
    const goedTar = join(T, 'sec-999.tar.gz');
    const mkTar = spawnSync(py, ['-c', `
import os, sys, tarfile
bron, uit = sys.argv[1], sys.argv[2]
with tarfile.open(uit, "w:gz") as tf:
    tf.add(os.path.join(bron, "scripts/orch.mjs"), arcname="scripts/orch.mjs")
    tf.add(os.path.join(bron, "ORCH-OVERDRACHT.json"), arcname="ORCH-OVERDRACHT.json")
`, pakBron, goedTar], { encoding: 'utf8' });
    check('testpakket met gewijzigde scripts/orch.mjs gebouwd', mkTar.status === 0);

    const { orchRoutes } = await import('../../backend/orch-routes');
    const { voerOrchToolUit } = await import('../../backend/orch-hulpmiddelen');
    const opslag = await import('../../backend/orch-opslag');
    const EIGENAAR = 'eigenaar@test.invalid';
    const besluiten = new Map<string, import('../../backend/orch-opslag').BesluitVoorToepassen>();
    const routes = orchRoutes({
      requireSession: async () => ({ user: { id: 'u-owner', role: 'owner', email: EIGENAAR, status: 'approved' }, service: 'mcp' } as never),
      isOwnerEmail: (e) => e === EIGENAAR,
      besluitZoeken: async (_e, id) => besluiten.get(id) ?? null,
      audit: async () => undefined,
    });
    const call = async (route: string, body: Record<string, unknown> = {}) => {
      const res = await routes[`POST ${route}`][0]({ event: { headers: {} }, body } as never) as { statusCode: number; body: string };
      return { status: res.statusCode, data: JSON.parse(res.body) };
    };

    const tarBytes = readFileSync(goedTar);
    const b1 = await call(ORCH_ROUTES.inleveringBegin, { naam: 'sec-999.tar.gz', grootte: tarBytes.length, sha256: sha256(tarBytes) });
    await call(ORCH_ROUTES.inleveringStuk, { id: b1.data.id, offset: 0, data: tarBytes.toString('base64') });

    // Poging tot shell-injectie via HTTP
    const rceHttp = await call(ORCH_ROUTES.inleveringKlaar, { id: b1.data.id, tests: [`node -e "require('fs').writeFileSync(${JSON.stringify(pwnPad)}, 'SHELL')"`] });
    check('uploadKlaar (HTTP): willekeurige shell-testopdracht geweigerd met 400 TESTS_NIET_TOEGESTAAN',
      rceHttp.status === 400 && rceHttp.data.error === 'TESTS_NIET_TOEGESTAAN' && !existsSync(pwnPad));

    // Прив'язка до актора (PR #13): завантаження, почате власником через HTTP, для MCP-агента не існує — ні stuk, ні klaar, ні annuleren.
    const grok = { userId: 'u-owner', clientName: 'Grok', agent: 'grok', tokenId: '0f9d2c4b-grant-a' };
    const vreemdStuk = await voerOrchToolUit(grok, 'orch_inleveren_stuk', { id: b1.data.id, offset: tarBytes.length, data: 'AAAA' });
    const vreemdKlaar = await voerOrchToolUit(grok, 'orch_inleveren_klaar', { id: b1.data.id });
    const vreemdAnnuleren = (() => { try { opslag.uploadAnnuleren({ id: b1.data.id }, 'iemand-anders@test.invalid'); return null; } catch (e) { return e as InstanceType<typeof opslag.OrchFout>; } })();
    check('actor-binding: MCP-agent en andere actor krijgen UPLOAD_ONBEKEND (404) op de HTTP-upload van de eigenaar; de upload blijft intact',
      vreemdStuk.isError === true && vreemdStuk.content[0].text.startsWith('UPLOAD_ONBEKEND:')
      && vreemdKlaar.isError === true && vreemdKlaar.content[0].text.startsWith('UPLOAD_ONBEKEND:')
      && vreemdAnnuleren?.code === 'UPLOAD_ONBEKEND' && vreemdAnnuleren.status === 404
      && opslag.uploadsLijst().some((x) => x.id === b1.data.id && x.ontvangen === tarBytes.length && x.staat === 'bezig'),
      `${vreemdStuk.content[0].text} | ${vreemdKlaar.content[0].text} | ${vreemdAnnuleren?.code}`);

    // Poging tot shell-injectie via MCP — op een upload die Grok zelf via MCP begon (eigen actor, dus wél bevoegd)
    const bM = JSON.parse((await voerOrchToolUit(grok, 'orch_inleveren_begin', { naam: 'sec-999.tar.gz', grootte: tarBytes.length, sha256: sha256(tarBytes) })).content[0].text) as { id: string };
    const sM = await voerOrchToolUit(grok, 'orch_inleveren_stuk', { id: bM.id, offset: 0, data: tarBytes.toString('base64') });
    check('actor-binding: dezelfde MCP-actor vult zijn eigen upload aan', sM.isError !== true && JSON.parse(sM.content[0].text).klaarVoorAfronden === true, sM.content[0].text);
    const rceMcp = await voerOrchToolUit(grok, 'orch_inleveren_klaar', { id: bM.id, tests: ['id'] });
    check('orch_inleveren_klaar (MCP): willekeurige tests-parameter geweigerd met TESTS_NIET_TOEGESTAAN',
      rceMcp.isError === true && rceMcp.content[0].text.startsWith('TESTS_NIET_TOEGESTAAN:') && !existsSync(pwnPad));
    // Власник через HTTP і інший агент через MCP не можуть завершити завантаження Grok; сам Grok може його скасувати.
    const eigenaarOpMcp = await call(ORCH_ROUTES.inleveringKlaar, { id: bM.id });
    const andereAgent = await voerOrchToolUit({ userId: 'u-owner', clientName: 'Grok', agent: 'codex', tokenId: '0f9d2c4b-grant-a' }, 'orch_inleveren_klaar', { id: bM.id });
    // Та сама назва клієнта й той самий агент, але ІНШИЙ grant/токен (друге підключення «Grok (grok)») — теж чужий актор.
    const zelfdeNaamAndereGrant = await voerOrchToolUit({ userId: 'u-owner', clientName: 'Grok', agent: 'grok', tokenId: '7a1e5b90-grant-b' }, 'orch_inleveren_klaar', { id: bM.id });
    check('actor-binding: eigenaar (HTTP), een andere agent (MCP) én dezelfde naam via een andere grant krijgen UPLOAD_ONBEKEND op de MCP-upload van Grok',
      eigenaarOpMcp.status === 404 && eigenaarOpMcp.data.error === 'UPLOAD_ONBEKEND' && andereAgent.isError === true && andereAgent.content[0].text.startsWith('UPLOAD_ONBEKEND:')
      && zelfdeNaamAndereGrant.isError === true && zelfdeNaamAndereGrant.content[0].text.startsWith('UPLOAD_ONBEKEND:'),
      `${eigenaarOpMcp.status} ${JSON.stringify(eigenaarOpMcp.data).slice(0, 120)} | ${andereAgent.content[0].text} | ${zelfdeNaamAndereGrant.content[0].text}`);
    check('actor-binding: door van een MCP-upload bevat de grant/token-id, niet alleen de clientnaam',
      opslag.uploadsLijst().some((x) => x.id === bM.id && /^Grok \(grok\) via mcp \[0f9d2c4b-grant-a\]$/.test(x.door)), opslag.uploadsLijst().find((x) => x.id === bM.id)?.door);
    const grokUpload = opslag.uploadsLijst().find((x) => x.id === bM.id);
    const grokAnnuleert = grokUpload ? opslag.uploadAnnuleren({ id: bM.id }, grokUpload.door) : null;
    check('actor-binding: alleen de actor die begon kan annuleren (door uit het record) → geannuleerd en weg uit de lijst',
      grokAnnuleert?.geannuleerd === true && !opslag.uploadsLijst().some((x) => x.id === bM.id));

    // Agent-identiteit (adversariële review): de verbinding van Grok kan geen pakket «van claude» inleveren en geen taak op naam van claude
    // registreren; het record bewaart wie het werkelijk deed (door, met grant-id).
    const pakBron3 = join(T, 'pakbron3'); mkdirSync(join(pakBron3, 'src'), { recursive: true });
    writeFileSync(join(pakBron3, 'src/van-claude.ts'), 'export const vanClaude = 1;\n');
    writeFileSync(join(pakBron3, 'ORCH-OVERDRACHT.json'), JSON.stringify({ ...JSON.parse(lees(join(pakBron, 'ORCH-OVERDRACHT.json'))), taakId: 'SEC-997', agent: 'claude', tak: 'feature/sec-997-20261031-170200', samenvatting: { uk: 'Тест: чужий агент у пакеті', nl: 'Test: andere agent in het pakket' } }));
    const vreemdTar = join(T, 'sec-997.tar.gz');
    spawnSync(py, ['-c', 'import os, sys, tarfile\nwith tarfile.open(sys.argv[2], "w:gz") as tf:\n    tf.add(os.path.join(sys.argv[1], "src/van-claude.ts"), arcname="src/van-claude.ts")\n    tf.add(os.path.join(sys.argv[1], "ORCH-OVERDRACHT.json"), arcname="ORCH-OVERDRACHT.json")\n', pakBron3, vreemdTar], { encoding: 'utf8' });
    const vBytes = readFileSync(vreemdTar);
    const bV = JSON.parse((await voerOrchToolUit(grok, 'orch_inleveren_begin', { naam: 'sec-997.tar.gz', grootte: vBytes.length, sha256: sha256(vBytes) })).content[0].text) as { id: string };
    await voerOrchToolUit(grok, 'orch_inleveren_stuk', { id: bV.id, offset: 0, data: vBytes.toString('base64') });
    const kV = await voerOrchToolUit(grok, 'orch_inleveren_klaar', { id: bV.id });
    const kVd = JSON.parse(kV.content[0].text) as { uitkomst: string; zaken: Array<{ code: string }>; id: string };
    const recV = (() => { try { return json(join(R, 'orchestratie/inleveringen', `${kVd.id}.json`)); } catch { return null; } })();
    check('agent-identiteit: Grok (MCP) levert een pakket in met agent «claude» → geweigerd met AGENT_VERSCHILT; record bewaart door met grant-id',
      kVd.uitkomst === 'geweigerd' && kVd.zaken.some((z) => z.code === 'AGENT_VERSCHILT') && /^Grok \(grok\) via mcp \[0f9d2c4b-grant-a\]$/.test(recV?.door ?? ''), `${kV.content[0].text.slice(0, 300)} | door=${recV?.door}`);
    const taakVreemd = await voerOrchToolUit(grok, 'orch_taak_start', { id: 'CLD-777', agent: 'claude', tak: 'feature/cld-777-20261031-170300', basisCommit: basis, omschrijving: 'probeer op naam van claude' });
    check('agent-identiteit: Grok registreert een taak met agent «claude» → AGENT_VERSCHILT, geen taakbestand', taakVreemd.isError === true && taakVreemd.content[0].text.startsWith('AGENT_VERSCHILT:') && !existsSync(join(R, 'orchestratie/taken/CLD-777.json')), taakVreemd.content[0].text);
    const taakEigen = await voerOrchToolUit(grok, 'orch_taak_start', { id: 'GRK-777', tak: 'feature/grk-777-20261031-170300', basisCommit: basis, omschrijving: 'eigen taak zonder agent-veld' });
    check('agent-identiteit: zonder agent-veld registreert Grok op zijn eigen naam (agent uit de verbinding)', taakEigen.isError !== true && json(join(R, 'orchestratie/taken/GRK-777.json')).agent === 'grok', taakEigen.content[0].text.slice(0, 200));

    // Limiet via MCP (zoals HTTP: uploadsPerUur per eigenaar, over al zijn verbindingen) — voor begin én klaar.
    const { _mcpLimietenLeeg } = await import('../../backend/orch-hulpmiddelen');
    _mcpLimietenLeeg();
    const limWie = { userId: 'u-limiet', clientName: 'Codex', agent: 'codex', tokenId: 'limiet-a' };
    const limWie2 = { ...limWie, tokenId: 'limiet-b' };
    const pogingen: string[] = [];
    for (let i = 0; i < 20; i++) pogingen.push((await voerOrchToolUit(i % 2 ? limWie2 : limWie, 'orch_inleveren_begin', { naam: 'x.zip', grootte: 0 })).content[0].text);
    const teVeel = await voerOrchToolUit(limWie, 'orch_inleveren_begin', { naam: 'x.zip', grootte: 0 });
    const teVeelKlaar = await (async () => { let t = ''; for (let i = 0; i < 21; i++) t = (await voerOrchToolUit(limWie2, 'orch_inleveren_klaar', { id: '0'.repeat(16) })).content[0].text; return t; })();
    const anderePersoon = await voerOrchToolUit({ ...limWie, userId: 'u-ander' }, 'orch_inleveren_begin', { naam: 'x.zip', grootte: 0 });
    check('MCP-limiet: 21e orch_inleveren_begin binnen een uur (twee verbindingen van dezelfde eigenaar) → RATE_LIMITED; ook klaar begrensd; andere eigenaar niet geraakt',
      !pogingen.some((t) => t.startsWith('RATE_LIMITED')) && teVeel.isError === true && teVeel.content[0].text.startsWith('RATE_LIMITED:') && teVeelKlaar.startsWith('RATE_LIMITED:') && !anderePersoon.content[0].text.startsWith('RATE_LIMITED'),
      `${teVeel.content[0].text.slice(0, 80)} | ${teVeelKlaar.slice(0, 80)} | ${anderePersoon.content[0].text.slice(0, 80)}`);
    _mcpLimietenLeeg();

    // Normale afronding: voert vertrouwde controleer uit, NIET scripts/orch.mjs uit het pakket!
    const okKlaar = await call(ORCH_ROUTES.inleveringKlaar, { id: b1.data.id });
    check('uploadKlaar: voert vertrouwde controleer uit zonder code uit het geüploade pakket te starten',
      okKlaar.status === 200 && okKlaar.data.record.uitkomst === 'aanvaard' && okKlaar.data.record.tests.geslaagd === 1 && !existsSync(pwnPad),
      JSON.stringify(okKlaar.data.record.zaken));

    // zonderTests op de server (adversariële review): een pakket dat AGENTS.md wijzigt zonder lock mag NIET door met «tests overgeslagen» —
    // de vertrouwde controleer draait altijd; zonderTests is alleen nog een notitie in het record.
    const pakBron2 = join(T, 'pakbron2');
    mkdirSync(pakBron2, { recursive: true });
    writeFileSync(join(pakBron2, 'AGENTS.md'), `${lees(join(R, 'AGENTS.md'))}\n## Тихо додане правило: агенти зливають у integratie самі\n`);
    writeFileSync(join(pakBron2, 'ORCH-OVERDRACHT.json'), JSON.stringify({ ...JSON.parse(lees(join(pakBron, 'ORCH-OVERDRACHT.json'))), taakId: 'SEC-998', tak: 'feature/sec-998-20261031-170100', samenvatting: { uk: 'Тест: AGENTS.md без lock із zonderTests', nl: 'Test: AGENTS.md zonder lock met zonderTests' } }));
    const regelTar = join(T, 'sec-998.tar.gz');
    spawnSync(py, ['-c', 'import os, sys, tarfile\nwith tarfile.open(sys.argv[2], "w:gz") as tf:\n    tf.add(os.path.join(sys.argv[1], "AGENTS.md"), arcname="AGENTS.md")\n    tf.add(os.path.join(sys.argv[1], "ORCH-OVERDRACHT.json"), arcname="ORCH-OVERDRACHT.json")\n', pakBron2, regelTar], { encoding: 'utf8' });
    const regelBytes = readFileSync(regelTar);
    const b2 = await call(ORCH_ROUTES.inleveringBegin, { naam: 'sec-998.tar.gz', grootte: regelBytes.length, sha256: sha256(regelBytes) });
    await call(ORCH_ROUTES.inleveringStuk, { id: b2.data.id, offset: 0, data: regelBytes.toString('base64') });
    const zonderKlaar = await call(ORCH_ROUTES.inleveringKlaar, { id: b2.data.id, zonderTests: 'tests liepen bij de agent' });
    const zr = zonderKlaar.data.record;
    check('uploadKlaar met zonderTests: AGENTS.md gewijzigd zonder lock → vertrouwde controleer draait tóch → geweigerd (TESTS_MISLUKT), reden bewaard',
      zr?.uitkomst === 'geweigerd' && zr.tests.overgeslagen === true && zr.tests.reden === 'tests liepen bij de agent' && zr.tests.mislukt === 1 && zr.tests.uitvoer[0].vertrouwd === true
      && zr.zaken.some((x: { code: string }) => x.code === 'TESTS_MISLUKT'), `${zonderKlaar.status} ${JSON.stringify(zr?.tests)} ${JSON.stringify(zr?.zaken)}`);

    // 5d. voorstelToepassen: eist exacte besluit-id in root-bestand én laat ORCH_WORTEL op integratie
    const rg = (await call(ORCH_ROUTES.regelsOverzicht)).data;
    const nieuwVersie = beleid.regelsVersie.replace(/(\d+)$/, (m: string) => String(Number(m) + 1));
    const bNieuw = JSON.parse(rg.bestanden['orchestratie/beleid.json']); bNieuw.regelsVersie = nieuwVersie;
    const vr = await call(ORCH_ROUTES.regelsVoorstel, {
      bestanden: {
        'orchestratie/beleid.json': `${JSON.stringify(bNieuw, null, 2)}\n`,
        'orchestratie/BESLUITEN.md': `${rg.bestanden['orchestratie/BESLUITEN.md']}\n## B-098 · 2026-10-31 · ${nieuwVersie} · voorstel\n\nTest.\n`,
      },
    });
    const v = vr.data.voorstel;
    const besluitA = randomUUID();
    const besluitB = randomUUID();
    besluiten.set(besluitA, { id: besluitA, passkey: '11223344', inhoud: { regelsVersie: v.regelsVersie, hash: v.hash, kritiekHash: v.kritiekHash, voorstel: v.id } });
    // Root-bestand bevat besluitB (ander besluit-id voor hetzelfde voorstel) → besluitA mag NIET slagen
    writeFileSync(join(T, 'status/orch-regels-bevestigd.json'), JSON.stringify({
      bijgewerkt: new Date().toISOString(),
      bevestigingen: [{ regelsVersie: v.regelsVersie, hash: v.hash, kritiekHash: v.kritiekHash, voorstel: v.id, passkey: '11223344', besluit: besluitB.replace(/-/g, ''), tijd: new Date().toISOString() }],
    }));
    const foutBesluit = await call(ORCH_ROUTES.regelsToepassen, { id: v.id, besluit: besluitA });
    check('voorstelToepassen: weigert wanneer besluit-id niet overeenkomt met het root-journal',
      foutBesluit.status === 409 && foutBesluit.data.error === 'NIET_BEVESTIGD_DOOR_ROOT');

    besluiten.set(besluitB, { id: besluitB, passkey: '11223344', inhoud: { regelsVersie: v.regelsVersie, hash: v.hash, kritiekHash: v.kritiekHash, voorstel: v.id } });
    const goedToepas = await call(ORCH_ROUTES.regelsToepassen, { id: v.id, besluit: besluitB });
    check('voorstelToepassen: slaagt in geïsoleerde worktree met exact besluit-id; ORCH_WORTEL blijft op integratie',
      goedToepas.status === 200 && git(R, 'branch', '--show-current') === 'integratie' && /^regels\//.test(goedToepas.data.tak));
    // Scherper dan «HEAD staat nu op integratie» (een oude implementatie die checkout deed en terugschakelde slaagde daar ook):
    // de reflog van de hoofdwerkkopie toont geen enkele checkout naar regels/*, en de tak heeft exact de gecontroleerde HEAD als ouder.
    const reflog = git(R, 'reflog', '-n', '30', '--format=%gs', 'HEAD');
    const worktrees = () => git(R, 'worktree', 'list', '--porcelain').split('\n').filter((l) => l.startsWith('worktree ')).length;
    check('voorstelToepassen: hoofdwerkkopie nooit omgeschakeld (reflog zonder checkout naar regels/*), ouder van de tak = gecontroleerde HEAD (SHA), geen worktree over',
      !/checkout: moving from \S+ to regels\//.test(reflog) && git(R, 'rev-parse', `${goedToepas.data.tak}^`) === git(R, 'rev-parse', 'HEAD') && worktrees() === 1, reflog);

    // compactContext.bestand buiten orchestratie/ (of over een regelbestand heen) → het voorstel wordt al bij de beoordeling geweigerd.
    for (const slecht of ['../../buiten.md', 'AGENTS.md', 'orchestratie/sub/x.md', 'deploy/RUNBOOK-VEILIGE-UITROL.md']) {
      const bSlecht = { ...bNieuw, compactContext: { ...bNieuw.compactContext, bestand: slecht } };
      const vs = await call(ORCH_ROUTES.regelsVoorstel, { bestanden: { 'orchestratie/beleid.json': `${JSON.stringify(bSlecht, null, 2)}\n`, 'orchestratie/BESLUITEN.md': `${rg.bestanden['orchestratie/BESLUITEN.md']}\n## B-098 · 2026-10-31 · ${nieuwVersie} · voorstel\n\nTest.\n` } });
      check(`regelvoorstel: compactContext.bestand «${slecht}» → CONTEXT_PAD, geen voorstel`, JSON.stringify(vs.data).includes('CONTEXT_PAD') && !vs.data?.voorstel?.id, `${vs.status} ${JSON.stringify(vs.data).slice(0, 200)}`);
    }

    // Mislukte worktree add (post-checkout hook met code 1: git laat dan boom én tak achter) → GIT_FOUT, en GEEN regels/*-tak of worktree over.
    await new Promise((r) => setTimeout(r, 1100)); // andere seconde → andere taknaam dan goedToepas
    const vr2 = await call(ORCH_ROUTES.regelsVoorstel, { bestanden: { 'orchestratie/beleid.json': `${JSON.stringify(bNieuw, null, 2)}\n`, 'orchestratie/BESLUITEN.md': `${rg.bestanden['orchestratie/BESLUITEN.md']}\n## B-098 · 2026-10-31 · ${nieuwVersie} · voorstel\n\nTest 2.\n` } });
    const v2 = vr2.data.voorstel; const besluitC = randomUUID();
    besluiten.set(besluitC, { id: besluitC, passkey: '11223344', inhoud: { regelsVersie: v2.regelsVersie, hash: v2.hash, kritiekHash: v2.kritiekHash, voorstel: v2.id } });
    writeFileSync(join(T, 'status/orch-regels-bevestigd.json'), JSON.stringify({ bijgewerkt: new Date().toISOString(), bevestigingen: [{ regelsVersie: v2.regelsVersie, hash: v2.hash, kritiekHash: v2.kritiekHash, voorstel: v2.id, passkey: '11223344', besluit: besluitC.replace(/-/g, ''), tijd: new Date().toISOString() }] }));
    const takkenVoor = git(R, 'branch', '--list', 'regels/*');
    const hook = join(git(R, 'rev-parse', '--absolute-git-dir'), 'hooks/post-checkout');
    mkdirSync(join(hook, '..'), { recursive: true }); writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    const mislukt = await call(ORCH_ROUTES.regelsToepassen, { id: v2.id, besluit: besluitC });
    rmSync(hook, { force: true });
    check('voorstelToepassen: worktree add mislukt (hook) → GIT_FOUT; geen achtergebleven regels/*-tak en geen extra worktree',
      mislukt.status === 500 && mislukt.data.error === 'GIT_FOUT' && JSON.stringify(mislukt.data).includes('worktree add') && git(R, 'branch', '--list', 'regels/*') === takkenVoor && worktrees() === 1,
      `${mislukt.status} ${JSON.stringify(mislukt.data).slice(0, 200)} | ${git(R, 'branch', '--list', 'regels/*')}`);

    // orch_overzicht voor een agent: geen e-mail van de eigenaar, geen uploads van anderen, geen passkey-vingerafdruk/besluit-id.
    const bE = await call(ORCH_ROUTES.inleveringBegin, { naam: 'eigen.zip', grootte: 10, sha256: 'a'.repeat(64) });
    const ovAgent = (await voerOrchToolUit(grok, 'orch_overzicht', {})).content[0].text;
    const ovEigenaar = opslag.overzicht();
    check('orch_overzicht (MCP): maskeert eigenaar-e-mail, uploads van anderen, passkey en besluit-id (terwijl het volledige overzicht ze wél heeft)',
      ovEigenaar.uploads.some((u) => u.id === bE.data.id && u.door === EIGENAAR) && ovEigenaar.bevestigingen.some((b) => b.passkey === '11223344')
      && !ovAgent.includes(EIGENAAR) && !ovAgent.includes(bE.data.id) && !ovAgent.includes('11223344') && !ovAgent.includes(besluitC.replace(/-/g, '')) && ovAgent.includes(v2.kritiekHash),
      ovAgent.slice(0, 300));

    // 5e. GitOps PYMODUS: weigert vervalste SSH-handtekening, accepteert echte ssh-keygen handtekening tegen root-bestand — op een ECHTE
    // release (regelbestanden + lock met kloppende afdrukken): PYMODUS controleert nu ook lock ↔ bestanden (adversariële review).
    const gBron = join(T, 'gitops-bron');
    mkdirSync(join(gBron, 'orchestratie'), { recursive: true });
    const gBeleid = { ...json('orchestratie/beleid.json') };
    gBeleid.kritiek = { ...gBeleid.kritiek, installatieModi: { ...gBeleid.kritiek.installatieModi, toegestaan: ['handmatig', 'na_bevestiging', 'automatisch_beperkt'] } };
    const gTeksten: Record<string, string> = { 'AGENTS.md': lees('AGENTS.md'), 'orchestratie/BESLUITEN.md': lees('orchestratie/BESLUITEN.md'), 'orchestratie/beleid.json': JSON.stringify(gBeleid, null, 2) + '\n' };
    for (const [p, t] of Object.entries(gTeksten)) writeFileSync(join(gBron, p), t);
    const gAfdruk = k.regelsAfdruk(gTeksten);
    const kritHash = k.kritiekAfdruk(gBeleid);
    const gVersie = gBeleid.regelsVersie as string;
    const ondertekenaarsPad = join(T, 'eigenaar-ondertekenaars');
    const gSig = sshSignEd25519('mijn-ruimte-regels', k.kritiekBericht({ regelsVersie: gVersie, kritiekHash: kritHash }));
    writeFileSync(ondertekenaarsPad, `eigenaar@mijn-ruimte namespaces="mijn-ruimte-regels" ssh-ed25519 ${gSig.pubB64}\n`);
    writeFileSync(join(gBron, 'orchestratie/regels.lock.json'), JSON.stringify({
      schema: 1, regelsVersie: gVersie, hash: gAfdruk.hash, kritiekHash: kritHash, bestanden: gAfdruk.bestanden,
      eigenaar: { kritiekHash: kritHash, regelsVersie: gVersie, handtekening: '-----BEGIN SSH SIGNATURE-----\nx\n-----END SSH SIGNATURE-----', op: new Date().toISOString() },
    }));
    const nepUit = gitopsPyModus(gBron, join(T, 'geen.jsonl'), ondertekenaarsPad);
    check('gitops PYMODUS: vervalste SSH-handtekening ("x") wordt geweigerd', nepUit.code !== 0 && /past bij geen enkele sleutel|ongeldig|ontbreekt/.test(nepUit.uit), nepUit.uit);

    if (spawnSync('ssh-keygen', ['-?'], { encoding: 'utf8' }).error === undefined) {
      writeFileSync(join(gBron, 'orchestratie/regels.lock.json'), JSON.stringify({
        schema: 1, regelsVersie: gVersie, hash: gAfdruk.hash, kritiekHash: kritHash, bestanden: gAfdruk.bestanden,
        eigenaar: { kritiekHash: kritHash, regelsVersie: gVersie, handtekening: gSig.handtekening, op: new Date().toISOString() },
      }));
      const echtUit = gitopsPyModus(gBron, join(T, 'geen.jsonl'), ondertekenaarsPad);
      check('gitops PYMODUS: echte SSH-handtekening voor mijn-ruimte-regels tegen root eigenaar-ondertekenaars → toegestaan', echtUit.code === 0 && echtUit.uit === '', echtUit.uit);
      // Zelfde geldige handtekening + lock, maar een agent zet in beleid.json een ANDERE kritieke regel (privésleutels naar agenten).
      writeFileSync(join(gBron, 'orchestratie/beleid.json'), JSON.stringify({ ...gBeleid, kritiek: { ...gBeleid.kritiek, privesleutelsNaarAgenten: true } }, null, 2) + '\n');
      const omzeilUit = gitopsPyModus(gBron, join(T, 'geen.jsonl'), ondertekenaarsPad);
      check('gitops PYMODUS: geldige handtekening, maar kritiek in beleid.json gewijzigd → geweigerd (kritiekHash)', omzeilUit.code !== 0 && /kritiekHash/.test(omzeilUit.uit), omzeilUit.uit);
    } else console.log('  OVERGESLAGEN: ssh-keygen ontbreekt — echte SSH-handtekening in GitOps NIET getest (installeer openssh-client)');
  } finally {
    for (const [sleutel, waarde] of Object.entries(oudEnv)) {
      if (waarde === undefined) delete process.env[sleutel]; else process.env[sleutel] = waarde;
    }
    rmSync(R, { recursive: true, force: true });
    rmSync(T, { recursive: true, force: true });
  }

  return einde();
}
