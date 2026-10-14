// SSH-CA (etap C, deel 2): root tekent alleen met de schakelaar aan, alleen ed25519, alleen principal beheer,
// alleen permit-pty, hoogstens ~65 minuten. De site weigert zonder terminal.servers; een vlag verbergt de knop en is geen recht.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync, chownSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

const SCRIPT = 'deploy/ssh-ca/mijn-ruimte-ssh-ca.sh';
const ALS_ROOT = process.getuid?.() === 0;
const NIEMAND = 65534;
const TAB = 'a'.repeat(48);

function sleutel(map: string, naam: string, soort: 'ed25519' | 'rsa') {
  const f = join(map, naam);
  const args = soort === 'rsa' ? ['-q', '-t', 'rsa', '-b', '2048', '-f', f, '-N', ''] : ['-q', '-t', 'ed25519', '-f', f, '-N', ''];
  const r = spawnSync('/usr/bin/ssh-keygen', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return readFileSync(`${f}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
}

function omg(limiet = '12') {
  const wortel = mkdtempSync(join(tmpdir(), 'ssh-ca-'));
  const p = { ca: join(wortel, 'ca'), inbox: join(wortel, 'inbox'), werk: join(wortel, 'werk'), uit: join(wortel, 'uit'), status: join(wortel, 'status'), rechten: join(wortel, 'rechten.json'), wortel };
  for (const d of [p.ca, p.inbox, p.werk, p.uit, p.status]) mkdirSync(d);
  // Als root negeert het script testpaden (bewust: dan geldt alleen /etc/mijn-ruimte). Daarom draait de test het dan als nobody.
  if (ALS_ROOT) for (const d of [wortel, p.ca, p.inbox, p.werk, p.uit, p.status]) chownSync(d, NIEMAND, NIEMAND);
  const env = {
    ...process.env, MIJN_RUIMTE_SSH_CA_DIR: p.ca, MIJN_RUIMTE_SSH_CA_INBOX: p.inbox, MIJN_RUIMTE_SSH_CA_WERK: p.werk,
    MIJN_RUIMTE_SSH_CA_UIT: p.uit, MIJN_RUIMTE_SSH_CA_STATUS: p.status, MIJN_RUIMTE_SSH_CA_RECHTEN: p.rechten,
    MIJN_RUIMTE_SSH_CA_GROEP: 'nogroup', MIJN_RUIMTE_SSH_CA_LIMIET: limiet,
  };
  const run = (args: string[]) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env, ...(ALS_ROOT ? { uid: NIEMAND, gid: NIEMAND } : {}) });
  return { p, env, run };
}

function verzoek(inbox: string, publiek: string, extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  writeFileSync(join(inbox, `${id}.json`), JSON.stringify({ id, publiek, identiteit: 'pavlo', ...extra }));
  return id;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('ssh-ca');
  const { uitgeven, parseUitgifte } = await import('../../backend/ssh-ca');
  const { identiteitVan, publiekeSleutel, schakelaarAan } = await import('../../shared/ssh-ca');
  const { parseRootGebeurtenissen } = await import('../../backend/server-beheer');
  const { TechFout } = await import('../../backend/tech-profiel');

  const w = omg();
  try {
    writeFileSync(w.p.rechten, '{"ssh-ca": false, "uitrol": false}\n');
    const voor = readFileSync(join(w.p.ca, '..', 'rechten.json'));
    const eerst = w.run(['inrichten']);
    const na = readFileSync(w.p.rechten);
    const pub1 = readFileSync(join(w.p.ca, 'ca.pub'), 'utf8');
    const geheim1 = readFileSync(join(w.p.ca, 'ca'));
    const tweede = w.run(['inrichten']);
    check('inrichten maakt een CA en zet de schakelaar niet aan', eerst.status === 0 && na.equals(voor) && /ssh-ed25519 /.test(pub1) && /лишається вимкненим/.test(eerst.stdout) && !/OPENSSH PRIVATE KEY/.test(eerst.stdout), eerst.stderr);
    check('inrichten overschrijft een bestaande CA niet', tweede.status === 0 && readFileSync(join(w.p.ca, 'ca')).equals(geheim1));
    const voorPubliek = readFileSync(join(w.p.ca, 'ca'));
    const tekst = w.run(['publiek']);
    check('publiek legt de sshd-regels uit en schrijft niets', tekst.status === 0 && /TrustedUserCAKeys/.test(tekst.stdout) && /вручну/.test(tekst.stdout) && readFileSync(join(w.p.ca, 'ca')).equals(voorPubliek));

    const pub = sleutel(w.p.wortel, 'user', 'ed25519');
    check('ed25519-sleutel heeft de vaste lengte', publiekeSleutel(pub) === pub && !publiekeSleutel(`restrict ${pub}`) && !publiekeSleutel(`${pub} commentaar`));
    const idUit = verzoek(w.p.inbox, pub, { principal: 'root', ttl: '+999d', opties: ['permit-port-forwarding'], 'source-address': '1.2.3.4' });
    const uitZonder = w.run(['tekenen', idUit]);
    const resUit = existsSync(join(w.p.uit, `${idUit}.json`)) ? JSON.parse(readFileSync(join(w.p.uit, `${idUit}.json`), 'utf8')) : {};
    check('schakelaar uit of false: geen certificaat', uitZonder.status === 0 && resUit.ok === false && resUit.code === 'SSH_CA_UIT' && !existsSync(join(w.p.werk, `${idUit}-cert.pub`)), JSON.stringify(resUit));
    writeFileSync(w.p.rechten, '{"ssh-ca": "true"}\n');
    const idStr = verzoek(w.p.inbox, pub);
    w.run(['tekenen', idStr]);
    check('de tekst "true" is geen aan', JSON.parse(readFileSync(join(w.p.uit, `${idStr}.json`), 'utf8')).code === 'SSH_CA_UIT');

    writeFileSync(w.p.rechten, '{"ssh-ca": true}\n');
    const id = verzoek(w.p.inbox, pub, { principal: 'root', ttl: '+999d', opties: ['permit-port-forwarding', 'permit-agent-forwarding'], identiteit: '../../root' });
    const getekend = w.run(['tekenen', id]);
    const res = JSON.parse(readFileSync(join(w.p.uit, `${id}.json`), 'utf8'));
    writeFileSync(join(w.p.wortel, 'controle.pub'), res.cert + '\n');
    const L = spawnSync('/usr/bin/ssh-keygen', ['-L', '-f', join(w.p.wortel, 'controle.pub')], { encoding: 'utf8' }).stdout;
    const van = /Valid: from (\S+) to (\S+)/.exec(L);
    const delta = van ? (Date.parse(van[2]) - Date.parse(van[1])) / 1000 : 0;
    check('aan: certificaat, alleen beheer, alleen permit-pty, ongeveer een uur', getekend.status === 0 && res.ok === true && res.principal === 'beheer' && /user certificate/.test(L) && /Key ID: "mijn-ruimte"/.test(L) && /^\s+beheer$/m.test(L) && !/permit-port-forwarding|permit-agent-forwarding|permit-X11|permit-user-rc/.test(L) && /permit-pty/.test(L) && /Critical Options: \(none\)/.test(L) && delta >= 64 * 60 && delta <= 66 * 60 && !existsSync(join(w.p.werk, `${id}-cert.pub`)), `${getekend.stderr}\n${L}`);
    check('echte uitvoer van root komt door de controle van de site (alleen type + sleutel, geen serverpad)', res.cert.split(' ').length === 2 && !res.cert.includes(w.p.werk) && parseUitgifte(JSON.stringify(res)).ok === true, res.cert.slice(-60));
    const gebeurtenissen = parseRootGebeurtenissen(readFileSync(join(w.p.status, 'gebeurtenissen.jsonl'), 'utf8'));
    const okRegel = gebeurtenissen.find((g) => g.code === 'SSH_CA_OK');
    check('journaal: bron ssh-ca en vingerafdruk, geen certificaat in de regel', !!okRegel && okRegel.bron === 'ssh-ca' && okRegel.vinger === res.vinger && !/ssh-ed25519-cert/.test(JSON.stringify(okRegel)), JSON.stringify(okRegel));
    // 14.10: auditbestand in dezelfde vorm als uitrol/gitops (0640, onder slot herschreven), en alle verzoeken in één ronde.
    const auditMode = statSync(join(w.p.status, 'gebeurtenissen.jsonl')).mode & 0o777;
    check('auditbestand 0640 (de app moet het kunnen lezen), niet 0600', auditMode === 0o640, auditMode.toString(8));
    const twee = [verzoek(w.p.inbox, pub), verzoek(w.p.inbox, pub)];
    w.run(['verwerk']);
    check('verwerk tekent alle verzoeken in de inbox in één ronde', twee.every((x) => existsSync(join(w.p.uit, `${x}.json`)) && JSON.parse(readFileSync(join(w.p.uit, `${x}.json`), 'utf8')).ok === true)
      && readdirSync(w.p.inbox).filter((n) => n.endsWith('.json')).length === 0);

    const rsa = sleutel(w.p.wortel, 'rsa', 'rsa');
    const idRsa = verzoek(w.p.inbox, rsa);
    w.run(['tekenen', idRsa]);
    check('rsa geweigerd', JSON.parse(readFileSync(join(w.p.uit, `${idRsa}.json`), 'utf8')).code === 'SSH_CA_SLEUTEL');
    const idRot = verzoek(w.p.inbox, 'ssh-ed25519 AAAA');
    w.run(['tekenen', idRot]);
    check('rommel geweigerd', JSON.parse(readFileSync(join(w.p.uit, `${idRot}.json`), 'utf8')).code === 'SSH_CA_SLEUTEL');

    const idOud = randomUUID();
    const oudPad = join(w.p.inbox, `${idOud}.json`);
    writeFileSync(oudPad, JSON.stringify({ publiek: pub, identiteit: 'pavlo' }));
    const toen = new Date(Date.now() - 10 * 60_000);
    utimesSync(oudPad, toen, toen);
    w.run(['tekenen', idOud]);
    check('een verzoek ouder dan 90 seconden wordt niet getekend', JSON.parse(readFileSync(join(w.p.uit, `${idOud}.json`), 'utf8')).code === 'SSH_CA_TE_OUD');

    const idLink = randomUUID();
    symlinkSync('/etc/passwd', join(w.p.inbox, `${idLink}.json`));
    const linkRun = w.run(['tekenen', idLink]);
    check('een symlink in de inbox wordt niet gelezen', linkRun.status === 0 && !existsSync(join(w.p.uit, `${idLink}.json`)) && !/root:x:/.test(linkRun.stdout + linkRun.stderr));
    const vuil = w.run(['tekenen', '../etc/passwd']);
    check('een id buiten de inbox wordt geweigerd', vuil.status === 2);

    const krap = omg('1');
    try {
      w.run(['inrichten']); // CA staat al in w; krap heeft een lege CA
      const ini = krap.run(['inrichten']);
      writeFileSync(krap.p.rechten, '{"ssh-ca": true}\n');
      const pub2 = sleutel(krap.p.wortel, 'u2', 'ed25519');
      const a = verzoek(krap.p.inbox, pub2);
      const b = verzoek(krap.p.inbox, pub2);
      krap.run(['tekenen', a]);
      krap.run(['tekenen', b]);
      check('limiet: het tweede certificaat in hetzelfde uur wordt geweigerd', ini.status === 0 && JSON.parse(readFileSync(join(krap.p.uit, `${a}.json`), 'utf8')).ok === true && JSON.parse(readFileSync(join(krap.p.uit, `${b}.json`), 'utf8')).code === 'SSH_CA_LIMIET');
    } finally { rmSync(krap.p.wortel, { recursive: true, force: true }); }
  } finally { rmSync(w.p.wortel, { recursive: true, force: true }); }

  // ---------------------------------------------------------------- de site
  const servers = { id: 'act-1', mogelijkheden: ['terminal.servers', 'ssh.host'] as const };
  const beheerder = { id: 'act-3', mogelijkheden: ['terminal.servers'] as const };
  const dev = { id: 'act-2', mogelijkheden: ['terminal.test'] as const };
  const pubVast = 'ssh-ed25519 ' + 'A'.repeat(68);
  check('synthetische sleutel telt alleen als de lengte klopt', publiekeSleutel(pubVast) === pubVast);
  const cert = 'ssh-ed25519-cert-v01@openssh.com ' + 'B'.repeat(80);
  const vinger = 'SHA256:' + 'C'.repeat(43);
  const ioVan = (schakelaar: boolean, antwoord: string | null) => {
    const gezien: string[] = [];
    return {
      gezien,
      schakelaar: async () => schakelaar,
      schrijf: async (_id: string, body: string) => { gezien.push(body); },
      wis: async () => { gezien.push('wis'); },
      start: async () => { gezien.push('start'); },
      lees: async () => antwoord,
    };
  };
  const okIo = ioVan(true, JSON.stringify({ ok: true, code: 'SSH_CA_OK', cert, geldigTot: '2026-10-14T10:00:00', vinger, principal: 'beheer' }));
  const uit = await uitgeven({ id: 'u1', email: 'pavlo@example.com' }, TAB, pubVast, okIo, servers, { wachtMs: 500, slaapMs: 10 });
  const lichaam = JSON.parse(okIo.gezien[0]);
  check('eigenaar (ssh.host) krijgt een certificaat; het verzoek kiest geen principal of duur', uit.principal === 'beheer' && uit.minuten === 60 && lichaam.identiteit === 'pavlo' && lichaam.publiek === pubVast && !('principal' in lichaam) && !('ttl' in lichaam) && okIo.gezien.includes('start'));
  const behIo = ioVan(true, null);
  let behCode = '';
  try { await uitgeven({ id: 'u3', email: 'beh@example.com' }, TAB, pubVast, behIo, beheerder, { wachtMs: 200, slaapMs: 10 }); } catch (e) { behCode = e instanceof TechFout ? e.code : 'ANDERS'; }
  check('beheerder (alleen terminal.servers, geen ssh.host) krijgt niets: SSH als beheer is toegang tot de host', behCode === 'TECH_SSH_CA_VEREIST' && behIo.gezien.length === 0);
  const devIo = ioVan(true, null);
  let devCode = '';
  try { await uitgeven({ id: 'u2', email: 'dev@example.com' }, TAB, pubVast, devIo, dev, { wachtMs: 200, slaapMs: 10 }); } catch (e) { devCode = e instanceof TechFout ? e.code : 'ANDERS'; }
  check('ontwikkelaar (alleen terminal.test) krijgt niets, ook als de vlag aan zou staan', devCode === 'TECH_SSH_CA_VEREIST' && devIo.gezien.length === 0);
  const uitIo = ioVan(false, null);
  let uitCode = '';
  try { await uitgeven({ id: 'u1' }, TAB, pubVast, uitIo, servers, { wachtMs: 200, slaapMs: 10 }); } catch (e) { uitCode = e instanceof TechFout ? e.code : 'ANDERS'; }
  check('schakelaar uit: de site schrijft geen verzoek', uitCode === 'SSH_CA_UIT' && uitIo.gezien.length === 0);
  let sleutelCode = '';
  try { await uitgeven({ id: 'u1', email: 'beheer;id@x' }, TAB, 'ssh-rsa AAAA', ioVan(true, null), servers, { wachtMs: 200, slaapMs: 10 }); } catch (e) { sleutelCode = e instanceof TechFout ? e.code : 'ANDERS'; }
  check('rsa en een vieze identiteit komen niet bij root', sleutelCode === 'SSH_CA_SLEUTEL' && identiteitVan('beheer;id@x') === 'beheerid' && identiteitVan('') === 'mijn-ruimte');
  const leeg = ioVan(true, null);
  let geen = '';
  try { await uitgeven({ id: 'u1' }, TAB, pubVast, leeg, servers, { wachtMs: 80, slaapMs: 30 }); } catch (e) { geen = e instanceof TechFout ? e.code : 'ANDERS'; }
  check('geen antwoord: verzoek wordt teruggenomen', geen === 'SSH_CA_GEEN_ANTWOORD' && leeg.gezien.includes('wis'));
  const lieg = parseUitgifte(JSON.stringify({ ok: true, code: 'SSH_CA_OK', cert, geldigTot: '2026-10-14T10:00:00', vinger, principal: 'root' }));
  check('een antwoord dat root als principal noemt, gaat niet naar de browser', !lieg.ok);
  check('schakelaar is alleen de boolean true', schakelaarAan({ 'ssh-ca': true }) && !schakelaarAan({ 'ssh-ca': 'true' }) && !schakelaarAan({}));

  const site = readFileSync('backend/ssh-ca.ts', 'utf8');
  const routes = readFileSync('backend/ssh-ca-routes.ts', 'utf8');
  const laag = readFileSync('src/tech/TechLaag.tsx', 'utf8');
  const venster = readFileSync('src/ssh/SshCertificaat.tsx', 'utf8');
  const inst = readFileSync('deploy/installeer-app.sh', 'utf8');
  const bron = readFileSync(SCRIPT, 'utf8');
  const unit = readFileSync('deploy/mijn-ruimte-ssh-ca.service', 'utf8');
  check('de site importeert geen vlaggen (een vlag is geen recht)', !/from ['"].*flags['"]/.test(site) && !/evalueer\(/.test(site));
  check('uitgifte vraagt stap-op en ssh.host', /stepUp: true/.test(routes) && /includes\('ssh\.host'\)/.test(site) && /vinger: r\.vinger/.test(site) && !/cert: r\.cert/.test(site));
  check('knop: vlag én ssh.host, met «?»', /sshZichtbaar && techMag\('ssh\.host'/.test(laag) && /SSH_CA_VLAG/.test(laag) && /HELP_SSH/.test(venster) && /<Vraag /.test(venster));
  check('installer zet ssh-ca niet aan en start de path-unit niet', /"ssh-ca": false/.test(inst) && !/"ssh-ca": true/.test(inst) && !/systemctl enable[^\n]*mijn-ruimte-ssh-ca/.test(inst) && /ssh_ca_inrichten "\$doel"/.test(inst) && !/ssh-keygen/.test(inst));
  check('script wist padoverschrijvingen als root, vóór het lezen', bron.indexOf('unset MIJN_RUIMTE_SSH_CA_DIR') < bron.indexOf('CA_DIR="${MIJN_RUIMTE_SSH_CA_DIR'));
  const unitCode = unit.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  check('signer kan sshd niet schrijven', /ProtectSystem=strict/.test(unitCode) && !/sshd|\/etc\/ssh/.test(unitCode));
  const sshdRegels = bron.split('\n').filter((l) => /sshd/.test(l) && !/^\s*#/.test(l) && !/^\s*echo /.test(l) && !l.includes("cat <<'EOT'") && l.trim() !== 'EOT');
  check('sshd komt alleen in de uitleg voor', sshdRegels.every((l) => /TrustedUserCAKeys|AuthorizedPrincipalsFile|auth_principals|ssh-ca|вручну|hand|systemctl enable/.test(l) || l.includes('#')) || sshdRegels.length === 0, sshdRegels.join(' | '));
  return einde();
}
