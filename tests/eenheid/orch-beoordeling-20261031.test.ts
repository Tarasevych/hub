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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as k from '../../scripts/orch/kern.mjs';
import { inleveren, veiligeTestEnv } from '../../scripts/orch/inleveren.mjs';
import { controleerTarGzVooraf } from '../../scripts/orch/pakket.mjs';
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

    // Normale afronding: voert vertrouwde controleer uit, NIET scripts/orch.mjs uit het pakket!
    const okKlaar = await call(ORCH_ROUTES.inleveringKlaar, { id: b1.data.id });
    check('uploadKlaar: voert vertrouwde controleer uit zonder code uit het geüploade pakket te starten',
      okKlaar.status === 200 && okKlaar.data.record.uitkomst === 'aanvaard' && okKlaar.data.record.tests.geslaagd === 1 && !existsSync(pwnPad),
      JSON.stringify(okKlaar.data.record.zaken));

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

    // 5e. GitOps PYMODUS: weigert vervalste SSH-handtekening, accepteert echte ssh-keygen handtekening tegen root-bestand
    const gBron = join(T, 'gitops-bron');
    mkdirSync(join(gBron, 'orchestratie'), { recursive: true });
    writeFileSync(join(gBron, 'orchestratie/beleid.json'), JSON.stringify({ kritiek: { installatieModi: { toegestaan: ['handmatig', 'na_bevestiging', 'automatisch_beperkt'] } } }));
    const kritHash = 'c'.repeat(64);
    const ondertekenaarsPad = join(T, 'eigenaar-ondertekenaars');
    const gSig = sshSignEd25519('mijn-ruimte-regels', k.kritiekBericht({ regelsVersie: '1.3.0', kritiekHash: kritHash }));
    writeFileSync(ondertekenaarsPad, `eigenaar@mijn-ruimte namespaces="mijn-ruimte-regels" ssh-ed25519 ${gSig.pubB64}\n`);
    writeFileSync(join(gBron, 'orchestratie/regels.lock.json'), JSON.stringify({
      schema: 1, regelsVersie: '1.3.0', hash: 'd'.repeat(64), kritiekHash: kritHash, bestanden: {},
      eigenaar: { kritiekHash: kritHash, regelsVersie: '1.3.0', handtekening: '-----BEGIN SSH SIGNATURE-----\nx\n-----END SSH SIGNATURE-----', op: new Date().toISOString() },
    }));
    const nepUit = gitopsPyModus(gBron, join(T, 'geen.jsonl'), ondertekenaarsPad);
    check('gitops PYMODUS: vervalste SSH-handtekening ("x") wordt geweigerd', nepUit.code !== 0, nepUit.uit);

    if (spawnSync('ssh-keygen', ['-?'], { encoding: 'utf8' }).error === undefined) {
      writeFileSync(join(gBron, 'orchestratie/regels.lock.json'), JSON.stringify({
        schema: 1, regelsVersie: '1.3.0', hash: 'd'.repeat(64), kritiekHash: kritHash, bestanden: {},
        eigenaar: { kritiekHash: kritHash, regelsVersie: '1.3.0', handtekening: gSig.handtekening, op: new Date().toISOString() },
      }));
      const echtUit = gitopsPyModus(gBron, join(T, 'geen.jsonl'), ondertekenaarsPad);
      check('gitops PYMODUS: echte SSH-handtekening voor mijn-ruimte-regels tegen root eigenaar-ondertekenaars → toegestaan', echtUit.code === 0, echtUit.uit);
    }
  } finally {
    for (const [sleutel, waarde] of Object.entries(oudEnv)) {
      if (waarde === undefined) delete process.env[sleutel]; else process.env[sleutel] = waarde;
    }
    rmSync(R, { recursive: true, force: true });
    rmSync(T, { recursive: true, force: true });
  }

  return einde();
}
