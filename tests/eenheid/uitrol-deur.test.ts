// Veilige uitrol / MCP-deur (audit 2026-10-08, C1/C3/C4/H5):
//  - het root-uitrolscript installeert alleen pakketten met een geldige ssh-handtekening van de eigenaar;
//  - niet-ondertekend, gewijzigd, andere sleutel, symlink-lid, oudere versie of versieverschil wordt geweigerd en nooit uitgevoerd;
//  - de MCP-deur (deploy/mcp/server.mjs) heeft geen pad naar root, bewaart alleen token-hashes en kan alleen een pakket in de inbox zetten;
//  - plafondconstanten: elke verboden constructie faalt de test als ze terugkomt.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

const SCRIPT = 'deploy/uitrol/mijn-ruimte-uitrol.sh';
const sh = (cmd: string, cwd?: string) => spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' });

function sleutel(map: string, naam: string) {
  const f = join(map, naam);
  const r = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'uitrol@mijn-ruimte', '-f', f], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ssh-keygen: ${r.stderr}`);
  return f;
}

/** Bouwt een pakket zoals maak-uitrolpakket.sh (één bovenmap met UITROL-VERSIE en deploy/installeer-app.sh). */
function pakket(werk: string, versie: string, opties: { inhoudVersie?: string; symlink?: boolean; extra?: string } = {}) {
  const top = join(werk, `bron-${versie}-${randomBytes(3).toString('hex')}`);
  const binnen = join(top, `mijn-ruimte-${versie}`);
  mkdirSync(join(binnen, 'deploy'), { recursive: true });
  writeFileSync(join(binnen, 'UITROL-VERSIE'), `${opties.inhoudVersie ?? versie}\n`);
  writeFileSync(join(binnen, 'deploy/installeer-app.sh'), '#!/bin/bash\necho "ECHTE INSTALLER MAG IN DE TEST NIET DRAAIEN"; exit 99\n');
  if (opties.extra) writeFileSync(join(binnen, 'extra.txt'), opties.extra);
  if (opties.symlink) symlinkSync('/etc/shadow', join(binnen, 'deploy/schaduw'));
  const uit = join(werk, `mijn-ruimte-${versie}.tar.gz`);
  const r = sh(`tar -czf "${uit}" -C "${top}" "mijn-ruimte-${versie}"`);
  if (r.status !== 0) throw new Error(r.stderr);
  return uit;
}
const onderteken = (bestand: string, key: string) => {
  rmSync(`${bestand}.sig`, { force: true });
  const r = spawnSync('ssh-keygen', ['-q', '-Y', 'sign', '-f', key, '-n', 'mijn-ruimte-uitrol', bestand], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`sign: ${r.stderr}`);
};

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-deur');
  if (spawnSync('ssh-keygen', ['-?'], { encoding: 'utf8' }).error) { console.log('overgeslagen: ssh-keygen ontbreekt'); return 0; }
  const basis = mkdtempSync(join(tmpdir(), 'uitrol-test-'));
  try {
    const goed = sleutel(basis, 'goed');
    const fout = sleutel(basis, 'fout');
    const inbox = join(basis, 'inbox'); const werk = join(basis, 'werk'); const statusMap = join(basis, 'status'); const pk = join(basis, 'pk');
    mkdirSync(inbox); mkdirSync(pk);
    const ondertekenaars = join(basis, 'ondertekenaars');
    writeFileSync(ondertekenaars, `uitrol@mijn-ruimte namespaces="mijn-ruimte-uitrol" ${readFileSync(`${goed}.pub`, 'utf8').trim()}\n`);
    const spoor = join(basis, 'installer-spoor');
    const stub = join(basis, 'stub-installer.sh');
    const modusBestand = join(basis, 'modus');
    writeFileSync(stub, `#!/bin/bash\necho "$1 $2" >> "${spoor}"\ncat "$2/UITROL-VERSIE" >> "${spoor}"\nprintf '%s\\n' "\${MIJN_RUIMTE_UITROL_MODUS:-}" > "${modusBestand}"\n`); chmodSync(stub, 0o755);
    const env = { ...process.env, UITROL_INBOX: inbox, UITROL_WERK: werk, UITROL_STATUS_DIR: statusMap, UITROL_ONDERTEKENAARS: ondertekenaars, UITROL_INSTALLEER: stub, UITROL_LOCK: join(basis, 'lock'), UITROL_GROEP: 'nogroup' };
    const draai = () => spawnSync('bash', [SCRIPT], { env, encoding: 'utf8' });
    const status = () => { try { return JSON.parse(readFileSync(join(statusMap, 'status.json'), 'utf8')); } catch { return {}; } };
    const spoorRegels = () => existsSync(spoor) ? readFileSync(spoor, 'utf8').trim().split('\n').filter(Boolean) : [];
    const leg = (bestand: string, metSig = true) => {
      const naam = bestand.split('/').pop()!;
      writeFileSync(join(inbox, naam), readFileSync(bestand));
      if (metSig) writeFileSync(join(inbox, `${naam}.sig`), readFileSync(`${bestand}.sig`));
      return naam;
    };

    if (process.getuid?.() === 0) console.log('let op: test draait als root; het uitrolscript negeert dan de UITROL_*-paden niet? (verwacht: wel)');

    // 1. niet ondertekend
    const p1 = pakket(pk, '20261008-100000');
    leg(p1, false);
    let r = draai();
    check('niet-ondertekend pakket geweigerd (exit 2, SIG_ONTBREEKT)', r.status === 2 && status().code === 'SIG_ONTBREEKT', `${r.status} ${status().code}`);
    check('geweigerd pakket uit de inbox verwijderd', readdirSync(inbox).length === 0, readdirSync(inbox).join(','));
    check('installer niet uitgevoerd na weigering', spoorRegels().length === 0);

    // 2. gewijzigd na ondertekenen
    const p2 = pakket(pk, '20261008-100100');
    onderteken(p2, goed);
    const naam2 = leg(p2);
    const bytes = readFileSync(join(inbox, naam2)); bytes[bytes.length - 5] ^= 0xff; writeFileSync(join(inbox, naam2), bytes);
    r = draai();
    check('gewijzigd pakket geweigerd (HANDTEKENING_ONGELDIG)', r.status === 2 && status().code === 'HANDTEKENING_ONGELDIG', `${r.status} ${status().code}`);

    // 3. andere sleutel
    const p3 = pakket(pk, '20261008-100200');
    onderteken(p3, fout); leg(p3);
    r = draai();
    check('pakket met vreemde sleutel geweigerd', r.status === 2 && status().code === 'HANDTEKENING_ONGELDIG', `${r.status} ${status().code}`);

    // 4. verkeerde naamruimte (handtekening voor iets anders hergebruikt)
    const p4 = pakket(pk, '20261008-100300');
    spawnSync('ssh-keygen', ['-q', '-Y', 'sign', '-f', goed, '-n', 'file', p4]); leg(p4);
    r = draai();
    check('handtekening met andere naamruimte geweigerd', r.status === 2 && status().code === 'HANDTEKENING_ONGELDIG', `${r.status} ${status().code}`);

    // 5. symlink in het pakket (ondertekend!)
    const p5 = pakket(pk, '20261008-100400', { symlink: true });
    onderteken(p5, goed); leg(p5);
    r = draai();
    check('ondertekend pakket met symlink geweigerd (INHOUD_ONVEILIG)', r.status === 2 && status().code === 'INHOUD_ONVEILIG', `${r.status} ${status().code}`);

    // 6. versie in pakket ≠ naam (hernoemen om terugrol-bescherming te omzeilen)
    const p6 = pakket(pk, '20261008-100500', { inhoudVersie: '20261008-090000' });
    onderteken(p6, goed); leg(p6);
    r = draai();
    check('versieverschil naam/inhoud geweigerd', r.status === 2 && status().code === 'VERSIE_VERSCHILT', `${r.status} ${status().code}`);
    check('nog steeds geen installatie', spoorRegels().length === 0);

    // 7. geldig pakket → installer (stub) met de gecontroleerde kopie, niet met de inbox
    const p7 = pakket(pk, '20261008-110000', { extra: 'x' });
    onderteken(p7, goed); leg(p7);
    r = draai();
    const regels = spoorRegels();
    check('geldig ondertekend pakket geïnstalleerd (klaar)', r.status === 0 && status().staat === 'klaar', `${r.status} ${JSON.stringify(status())} ${r.stderr.slice(-300)}`);
    const audit = () => existsSync(join(statusMap, 'gebeurtenissen.jsonl')) ? readFileSync(join(statusMap, 'gebeurtenissen.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    check('ondertekende uitrol schrijft auditregel met herkomst handtekening', audit().some((e) => e.bron === 'uitrol' && e.code === 'OK' && e.herkomst === 'handtekening' && e.tag === '20261008-110000'));
    check('weigering zonder handtekening staat in dezelfde audit', audit().some((e) => e.code === 'SIG_ONTBREEKT' && e.herkomst === 'handtekening'));
    check('installer erft modus handtekening', readFileSync(modusBestand, 'utf8').trim() === 'handtekening');
    check('installer kreeg de kopie in de werkmap (niet de inbox)', regels.length === 2 && regels[0].startsWith(`installeren ${werk}/`) && regels[1] === '20261008-110000', regels.join(' | '));
    check('laatste-versie bijgewerkt', readFileSync(join(werk, 'laatste-versie'), 'utf8').trim() === '20261008-110000');
    check('inbox leeg na installatie', readdirSync(inbox).filter(n => n !== 'aanvraag').length === 0);
    check('werkmap 0700', (statSync(werk).mode & 0o777) === 0o700);

    // 8. oudere (geldig ondertekende) versie → terugrol geweigerd
    const p8 = pakket(pk, '20261008-105900');
    onderteken(p8, goed); leg(p8);
    r = draai();
    check('oudere versie geweigerd (NIET_NIEUWER)', r.status === 2 && status().code === 'NIET_NIEUWER', `${r.status} ${status().code}`);
    // zelfde versie opnieuw
    onderteken(p7, goed); leg(p7);
    r = draai();
    check('zelfde versie nogmaals geweigerd', r.status === 2 && status().code === 'NIET_NIEUWER');

    // 9. pakket als symlink in de inbox
    const p9 = pakket(pk, '20261008-120000'); onderteken(p9, goed);
    symlinkSync(p9, join(inbox, 'mijn-ruimte-20261008-120000.tar.gz')); writeFileSync(join(inbox, 'mijn-ruimte-20261008-120000.tar.gz.sig'), readFileSync(`${p9}.sig`));
    r = draai();
    check('symlink in de inbox wordt niet als pakket gekozen', status().code !== 'OK' || status().versie !== '20261008-120000', JSON.stringify(status()));
    check('installer na alle aanvallen precies één keer gedraaid', spoorRegels().length === 2);
    rmSync(join(inbox, 'mijn-ruimte-20261008-120000.tar.gz'), { force: true });

    // 10. ondertekenaarsbestand ontbreekt
    const p10 = pakket(pk, '20261008-130000'); onderteken(p10, goed); leg(p10);
    r = spawnSync('bash', [SCRIPT], { env: { ...env, UITROL_ONDERTEKENAARS: join(basis, 'bestaat-niet') }, encoding: 'utf8' });
    check('zonder publieke sleutel geen uitrol (GEEN_SLEUTEL)', r.status === 2 && status().code === 'GEEN_SLEUTEL');

    // ---------------------------------------------------------------- MCP-deur: OAuth + alleen inbox
    await deurTests(basis, check, goed);

    // ---------------------------------------------------------------- plafondconstanten
    plafond(check);
  } finally {
    rmSync(basis, { recursive: true, force: true });
  }
  return einde();
}

async function deurTests(basis: string, check: (n: string, ok: boolean, i?: string) => void, key: string) {
  const d = join(basis, 'deur'); mkdirSync(d);
  const site = join(d, 'site'); mkdirSync(site); writeFileSync(join(site, 'leesmij.txt'), 'hallo');
  const inbox = join(d, 'inbox'); mkdirSync(inbox);
  const rechten = join(d, 'rechten.json'); writeFileSync(rechten, '{"read": true, "uitrol": false}');
  const tokenFile = join(d, 'mcp.token'); const deurToken = randomBytes(24).toString('hex'); writeFileSync(tokenFile, deurToken);
  const stateFile = join(d, 'state.json');
  // oude toestand met klare tekst-tokens: moet worden omgezet naar hashes
  writeFileSync(stateFile, JSON.stringify({ access: { 'oud-access-token': { exp: Date.now() + 1e9 } }, refresh: { 'oud-refresh-token': { exp: Date.now() + 1e9 } } }));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['deploy/mcp/server.mjs'], {
    env: { ...process.env, MCP_PORT: String(port), MCP_ROOT: site, MCP_TOKEN_FILE: tokenFile, MCP_RECHTEN_FILE: rechten, MCP_INTREKKEN_FILE: join(d, 'intrekken'),
      MCP_STATE_FILE: stateFile, MCP_UITROL_INBOX: inbox, MCP_UITROL_STATUS: join(d, 'status.json'), MCP_RELEASES_DIR: d, MCP_HEALTH_URL: `http://127.0.0.1:1/x`, MCP_ISSUER: 'https://mcp.example.test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; proc.stdout.on('data', b => { log += b; }); proc.stderr.on('data', b => { log += b; });
  try {
    for (let i = 0; i < 50 && !log.includes('mijn-ruimte-mcp'); i++) await new Promise(r => setTimeout(r, 100));
    const B = `http://127.0.0.1:${port}`;
    const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
    const post = (p: string, body: string, headers: Record<string, string> = {}) => fetch(B + p, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, redirect: 'manual' });

    const st = JSON.parse(readFileSync(stateFile, 'utf8'));
    const tekst = JSON.stringify(st);
    check('deur: oude klare-tekst-tokens niet meer in de toestand', !tekst.includes('oud-access-token') && !tekst.includes('oud-refresh-token'), tekst.slice(0, 200));

    let res = await post('/oauth/register', JSON.stringify({ redirect_uris: ['https://evil.example/cb'] }), { 'content-type': 'application/json' });
    check('deur: DCR met vreemde redirect geweigerd', res.status === 400);
    res = await post('/oauth/register', JSON.stringify({ redirect_uris: ['https://grok.com/oauth/callback'], client_name: 'Grok' }), { 'content-type': 'application/json' });
    const client = await res.json() as { client_id: string };
    check('deur: DCR geeft unieke client-id (geen vaste "grok")', res.status === 201 && /^mr_/.test(client.client_id), JSON.stringify(client));

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const auth = { client_id: client.client_id, redirect_uri: 'https://grok.com/oauth/callback', code_challenge: challenge, code_challenge_method: 'S256', response_type: 'code', state: 's1' };
    res = await post('/oauth/authorize', form({ ...auth, bridge_token: 'fout' }));
    check('deur: verkeerd deurtoken → 401', res.status === 401);
    res = await post('/oauth/authorize', form({ ...auth, client_id: 'grok', bridge_token: deurToken }));
    check('deur: vaste client "grok" niet meer geaccepteerd', res.status === 400);
    res = await post('/oauth/authorize', form({ ...auth, bridge_token: deurToken }));
    const loc = new URL(res.headers.get('location') || 'https://x/');
    const code = loc.searchParams.get('code') || '';
    check('deur: autorisatiecode uitgegeven', res.status === 302 && code.length > 20);
    res = await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: client.client_id, code, redirect_uri: auth.redirect_uri, code_verifier: 'verkeerd'.padEnd(43, 'x') }));
    check('deur: verkeerde PKCE-verifier geweigerd', res.status === 400);
    res = await post('/oauth/authorize', form({ ...auth, bridge_token: deurToken }));
    const code2 = new URL(res.headers.get('location') || 'https://x/').searchParams.get('code') || '';
    res = await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: client.client_id, code: code2, redirect_uri: auth.redirect_uri, code_verifier: verifier }));
    const tok = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    check('deur: token met korte levensduur (≤ 1 uur)', res.status === 200 && tok.expires_in <= 3600, JSON.stringify(tok).slice(0, 120));
    const opslag = readFileSync(stateFile, 'utf8');
    check('deur: tokens alleen als hash opgeslagen', !opslag.includes(tok.access_token) && !opslag.includes(tok.refresh_token));

    // refresh-rotatie + hergebruikdetectie
    res = await post('/oauth/token', form({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: tok.refresh_token }));
    const tok2 = await res.json() as { access_token: string; refresh_token: string };
    check('deur: refresh roteert', res.status === 200 && tok2.refresh_token !== tok.refresh_token);
    res = await post('/oauth/token', form({ grant_type: 'refresh_token', client_id: client.client_id, refresh_token: tok.refresh_token }));
    check('deur: hergebruik van oud refresh-token geweigerd', res.status === 400);
    const rpc = async (token: string, method: string, params: unknown = {}) => {
      const r2 = await fetch(`${B}/Grok`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      return { status: r2.status, body: r2.status === 200 ? await r2.json() as { result?: { content?: { text: string }[]; isError?: boolean; tools?: { name: string }[] } } : null };
    };
    let out = await rpc(tok2.access_token, 'tools/list');
    check('deur: na hergebruik is de hele familie ingetrokken', out.status === 401, String(out.status));

    // nieuwe sessie
    res = await post('/oauth/authorize', form({ ...auth, bridge_token: deurToken }));
    const code3 = new URL(res.headers.get('location') || 'https://x/').searchParams.get('code') || '';
    res = await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: client.client_id, code: code3, redirect_uri: auth.redirect_uri, code_verifier: verifier }));
    const tok3 = await res.json() as { access_token: string };
    out = await rpc(deurToken, 'tools/list');
    check('deur: het deurtoken zelf is geen Bearer-token', out.status === 401);
    out = await rpc(tok3.access_token, 'tools/list');
    const namen = (out.body?.result?.tools || []).map(t => t.name);
    check('deur: geen schrijf-, uitvoer- of installatietools', !namen.some(n => /write|exec|install|shell|run|door|backup|staging|kit/.test(n)), namen.join(','));
    check('deur: uitrol-tools aanwezig', namen.includes('rollout_upload_begin') && namen.includes('rollout_status'));
    out = await rpc(tok3.access_token, 'tools/call', { name: 'read_file', arguments: { path: 'leesmij.txt' } });
    check('deur: lezen werkt', out.body?.result?.content?.[0]?.text?.includes('hallo') === true, JSON.stringify(out.body).slice(0, 200));

    // uitrol uit → upload geweigerd
    const pak = readFileSync(join(basis, 'pk', 'mijn-ruimte-20261008-130000.tar.gz'));
    const sha = createHash('sha256').update(pak).digest('hex');
    out = await rpc(tok3.access_token, 'tools/call', { name: 'rollout_upload_begin', arguments: { version: '20261008-130000', bytes: pak.length, sha256: sha } });
    check('deur: upload geweigerd zolang "uitrol" uit staat (root-bestand)', out.body?.result?.isError === true && readdirSync(inbox).length === 0, JSON.stringify(out.body).slice(0, 200));

    writeFileSync(rechten, '{"read": true, "uitrol": true}');
    out = await rpc(tok3.access_token, 'tools/call', { name: 'rollout_upload_begin', arguments: { version: '20261008-130000', bytes: pak.length, sha256: sha } });
    for (let i = 0; i < pak.length; i += 400_000) await rpc(tok3.access_token, 'tools/call', { name: 'rollout_upload_chunk', arguments: { version: '20261008-130000', data: pak.subarray(i, i + 400_000).toString('base64') } });
    out = await rpc(tok3.access_token, 'tools/call', { name: 'rollout_upload_finish', arguments: { version: '20261008-130000', signature: 'geen handtekening' } });
    check('deur: finish zonder ssh-handtekening geweigerd', out.body?.result?.isError === true);
    out = await rpc(tok3.access_token, 'tools/call', { name: 'rollout_upload_finish', arguments: { version: '20261008-130000', signature: readFileSync(join(basis, 'pk', 'mijn-ruimte-20261008-130000.tar.gz.sig'), 'utf8') } });
    const inh = readdirSync(inbox).sort();
    check('deur: upload zet alleen pakket + .sig + aanvraag in de inbox', JSON.stringify(inh) === JSON.stringify(['aanvraag', 'mijn-ruimte-20261008-130000.tar.gz', 'mijn-ruimte-20261008-130000.tar.gz.sig']), inh.join(','));
    check('deur: geüpload pakket byte-gelijk', createHash('sha256').update(readFileSync(join(inbox, 'mijn-ruimte-20261008-130000.tar.gz'))).digest('hex') === sha);
    out = await rpc(tok3.access_token, 'tools/call', { name: 'rollout_upload_begin', arguments: { version: '../../etc/x', bytes: 10, sha256: sha } });
    check('deur: pad-truc in versie geweigerd', out.body?.result?.isError === true);
    void key;

    // alles intrekken via het root-bestand
    writeFileSync(join(d, 'intrekken'), String(Date.now() + 1000));
    out = await rpc(tok3.access_token, 'tools/list');
    check('deur: intrekbestand maakt alle sessies ongeldig', out.status === 401);
  } finally {
    proc.kill('SIGTERM');
  }
}

function plafond(check: (n: string, ok: boolean, i?: string) => void) {
  const lees = (f: string) => existsSync(f) ? readFileSync(f, 'utf8') : '';
  const zonderCommentaar = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*#.*$/gm, '');
  const deur = zonderCommentaar(lees('deploy/mcp/server.mjs'));
  check('plafond: MCP-deur zonder child_process/spawn/exec', !/child_process|\bspawn\(|\bexecFile\(|\bexecSync\(/.test(deur));
  check('plafond: MCP-deur zonder sudo', !/\bsudo\b/.test(deur));
  check('plafond: MCP-deur leest geen app-schrijfbaar rechtenbestand', !/uploads\/mcp-permissions\.json/.test(deur) && /\/etc\/mijn-ruimte\/mcp-rechten\.json/.test(deur));
  const deployBestanden = sh('git ls-files deploy').stdout.trim().split('\n');
  check('plafond: geen patch-*.py meer in deploy/', !deployBestanden.some(f => /patch-.*\.py$/.test(f)), deployBestanden.filter(f => /patch-/.test(f)).join(','));
  check('plafond: geen mijn-ruimte-mcp-doen meer', !deployBestanden.some(f => /mcp-doen/.test(f)));
  const alles = deployBestanden.filter(f => !/RUNBOOK|\.md$/.test(f)).map(f => [f, lees(f)] as const);
  check('plafond: geen runpy/exec(compile) in deploy/', !alles.some(([, t]) => /\brunpy\b|exec\(compile\(/.test(t)), alles.filter(([, t]) => /\brunpy\b/.test(t)).map(([f]) => f).join(','));
  check('plafond: geen NoNewPrivileges=no in deploy/', !alles.some(([, t]) => /^\s*NoNewPrivileges\s*=\s*(no|false)/mi.test(t)));
  // (herstel-vm.sh geeft de menselijke beheerder 'beheer' sudo; dat is geen app-pad. De app-gebruiker mijnruimte krijgt nergens sudo.)
  // Uitzondering: deploy/opdracht/mijn-ruimte-opdracht.sudoers is de gedocumenteerde, NIET geïnstalleerde noodoplossing voor methode 3
  // (exact vijf vaste commando's; zie server-beheer.test.ts). De installer mag dat bestand nooit installeren.
  check('plafond: sudo-noodoplossing wordt niet door de installer gebruikt', !/mijn-ruimte-opdracht\.sudoers/.test(lees('deploy/installeer-app.sh')));
  check('plafond: geen sudo-regel voor de app-gebruiker in deploy/', !alles.filter(([f]) => f !== 'deploy/opdracht/mijn-ruimte-opdracht.sudoers').some(([, t]) => /^[^#\n]*\bmijnruimte\b[^\n]*ALL\s*=/m.test(zonderCommentaar(t)) || /^[^#\n]*\$GEBRUIKER[^\n]*ALL\s*=\s*\(/m.test(zonderCommentaar(t))));
  const inst = lees('deploy/installeer-app.sh');
  check('plafond: installer installeert geen root-hulp of patch meer', !/install[^\n]*mcp-doen|python3 "\$doel\/deploy\/patch-/.test(inst));
  check('plafond: installer schrijft niets naar /etc/sudoers.d', !/>\s*\/etc\/sudoers\.d|install[^\n]*\/etc\/sudoers\.d/.test(inst));
  const unit = lees('deploy/mcp/mijn-ruimte-mcp.service');
  check('plafond: MCP-unit met NoNewPrivileges=yes', /^NoNewPrivileges=yes/m.test(unit));
  const uitrol = lees(SCRIPT);
  check('plafond: uitrol controleert handtekening vóór uitpakken', uitrol.indexOf('ssh-keygen -Y verify') > 0 && uitrol.indexOf('ssh-keygen -Y verify') < uitrol.indexOf('extractall'));
  check('plafond: uitrol pakt uit met filter="data"', /filter="data"/.test(uitrol));
  check('plafond: uitrol negeert pad-overrides als root', /id -u\)" -eq 0 \]; then\s*\n?\s*unset UITROL_INBOX/.test(uitrol) || /unset UITROL_INBOX UITROL_WERK/.test(uitrol));
  const archief = lees('deploy/archief-maken.sh');
  check('plafond: archief in zijn geheel versleuteld (geen klare tar meer)', /\| versleutel "\$werk\/\$naam"/.test(archief) && !/tar --create --file "\$UIT\/\$naam/.test(archief));
  check('plafond: archief zonder sudoers', !/\/etc\/sudoers/.test(archief));
}
