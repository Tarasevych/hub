// SSH-CA beheren vanaf de site (18.10.2026): root-kant van `mijn-ruimte-ssh-ca beheer` met de ECHTE sshd (`sshd -t`/`-T`),
// de echte passkey-hulp (verifieer-ssh-ca, nep-passkey met echte handtekeningen), echte certificaten (ssh-keygen) en een echte
// KRL (`ssh-keygen -Q`, dezelfde controle als sshd). systemctl is een stub (logt; kan een mislukt herladen nabootsen).
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, chownSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-toegangssleutel';
import { checker } from './hulp/nep-google';

const SCRIPT = resolve('deploy/ssh-ca/mijn-ruimte-ssh-ca.sh');
const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');
const ALS_ROOT = process.getuid?.() === 0;
const NIEMAND = 65534;
const RP = 'tarasevych.com'; const ORIGIN = 'https://admin.tarasevych.com';
const SSHD = '/usr/sbin/sshd';

function omgeving() {
  const w = mkdtempSync(join(tmpdir(), 'ssh-ca-beheer-'));
  const p = {
    w, ca: join(w, 'ca'), inbox: join(w, 'inbox'), beheer: join(w, 'beheer'), werk: join(w, 'werk'), uit: join(w, 'uit'), status: join(w, 'status'),
    rechten: join(w, 'mcp-rechten.json'), sshd: join(w, 'sshd'), dropDir: join(w, 'sshd', 'sshd_config.d'), dropin: join(w, 'sshd', 'sshd_config.d', '50-mijn-ruimte-ssh-ca.conf'),
    config: join(w, 'sshd', 'sshd_config'), log: join(w, 'systemctl.log'), faal: join(w, 'reload-faalt'), goed: join(w, 'goed'),
  };
  for (const d of [p.ca, p.inbox, p.beheer, p.werk, p.uit, p.status, p.sshd, p.dropDir, p.goed, join(p.goed, 'staat')]) mkdirSync(d, { recursive: true });
  spawnSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-f', join(p.sshd, 'host'), '-N', '']);
  writeFileSync(p.config, `Include ${p.dropDir}/*.conf\nHostKey ${join(p.sshd, 'host')}\nPidFile none\nUsePAM no\n`);
  writeFileSync(p.rechten, JSON.stringify({ read: true, uitrol: true, 'ssh-ca': false }, null, 2));
  chmodSync(p.rechten, 0o640);
  const systemctl = join(p.w, 'systemctl');
  const pstaat = join(p.w, 'path-unit');
  writeFileSync(systemctl, `#!/bin/bash\necho "$*" >> "${p.log}"\nif [ "$1" = reload ] && [ -e "${p.faal}" ]; then echo "Job for ssh.service failed" >&2; exit 1; fi\n[ "$1" = enable ] && echo enabled > "${pstaat}"\n[ "$1" = disable ] && echo disabled > "${pstaat}"\n[ "$1" = is-enabled ] && cat "${pstaat}" 2>/dev/null\nexit 0\n`);
  // Echte passkey-hulp van root, met testpaden (zoals in uitrol-goedkeuring.test.ts).
  const passkey = join(p.w, 'passkey');
  const sleutels = join(p.goed, 'goedkeur-passkeys.json');
  writeFileSync(passkey, `#!/bin/bash\nexport GOEDKEUR_SLEUTELS="${sleutels}" GOEDKEUR_RECHTEN="${p.rechten}" GOEDKEUR_STAAT="${join(p.goed, 'staat')}" GOEDKEUR_INBOX="${p.goed}" GOEDKEUR_STATUS_DIR="${p.status}" GOEDKEUR_GROEP=nogroup\nexec "${process.execPath}" "${HULP}" "$@"\n`);
  chmodSync(systemctl, 0o755); chmodSync(passkey, 0o755);
  if (ALS_ROOT) spawnSync('chown', ['-R', `${NIEMAND}:${NIEMAND}`, w]);
  const env = {
    ...process.env, MIJN_RUIMTE_SSH_CA_DIR: p.ca, MIJN_RUIMTE_SSH_CA_INBOX: p.inbox, MIJN_RUIMTE_SSH_CA_WERK: p.werk, MIJN_RUIMTE_SSH_CA_UIT: p.uit,
    MIJN_RUIMTE_SSH_CA_STATUS: p.status, MIJN_RUIMTE_SSH_CA_RECHTEN: p.rechten, MIJN_RUIMTE_SSH_CA_GROEP: 'nogroup',
    MIJN_RUIMTE_SSH_CA_BEHEER_INBOX: p.beheer, MIJN_RUIMTE_SSH_CA_SSHD_DROPIN: p.dropin, MIJN_RUIMTE_SSH_CA_SSHD_CONFIG: p.config,
    MIJN_RUIMTE_SSH_CA_SSHD_BIN: SSHD, MIJN_RUIMTE_SSH_CA_SYSTEMCTL: systemctl, MIJN_RUIMTE_SSH_CA_PASSKEY: passkey, MIJN_RUIMTE_SSH_CA_ACCOUNT: 'beheer',
  };
  const run = (...args: string[]) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env, ...(ALS_ROOT ? { uid: NIEMAND, gid: NIEMAND } : {}) });
  const eigen = (pad: string) => { if (ALS_ROOT) chownSync(pad, NIEMAND, NIEMAND); };
  return { p, run, sleutels, eigen };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('ssh-ca-beheer');
  if (!existsSync(SSHD)) { check('sshd aanwezig voor de test (apt install openssh-server)', false); return einde(); }
  const o = omgeving();
  const { p, run } = o;
  const eigenaar: NepPasskey = nieuwePasskey('es256', 1);
  const reg = kern.verifieerRegistratie({ ...registreer(eigenaar, 'c'), verwachteUitdaging: 'c', rpId: RP, origins: [ORIGIN] });
  if (!reg.ok) throw new Error('registratie');
  writeFileSync(o.sleutels, JSON.stringify({ versie: 1, rpId: RP, origins: [ORIGIN], sleutels: [{ credentialId: reg.credentialId, alg: reg.alg, jwk: reg.jwk, label: 'telefoon', vingerafdruk: reg.vingerafdruk, toegevoegd: new Date().toISOString(), door: 'test' }] }));
  o.eigen(o.sleutels);

  const lees = (pad: string) => { try { return JSON.parse(readFileSync(pad, 'utf8')); } catch { return null; } };
  const rechten = () => lees(p.rechten) || {};
  const logboek = () => (existsSync(p.log) ? readFileSync(p.log, 'utf8') : '');
  /** Verzoek zoals de site het schrijft; `pk` = passkey die tekent (of null = geen assertie). */
  const verzoek = (actie: string, extra: Record<string, unknown> = {}, pk: NepPasskey | null = null, tekenActie = actie) => {
    const id = randomUUID();
    const body: Record<string, unknown> = { id, actie, ...extra };
    if (pk) {
      const v = { actie: tekenActie, nonce: randomBytes(32).toString('base64url'), verloopt: Date.now() + 240_000 };
      Object.assign(body, { doel: 'ssh-ca', nonce: v.nonce, verloopt: v.verloopt, assertie: bevestig(pk, kern.uitdagingVoor('ssh-ca', v)) });
    }
    const pad = join(p.beheer, `${id}.json`);
    writeFileSync(pad, JSON.stringify(body));
    o.eigen(pad);
    return { id, pad, body };
  };
  const doe = (actie: string, extra: Record<string, unknown> = {}, pk: NepPasskey | null = null, tekenActie = actie) => {
    const v = verzoek(actie, extra, pk, tekenActie);
    const r = run('beheer');
    return { ...v, r, res: lees(join(p.uit, `beheer-${v.id}.json`)) || {} };
  };

  try {
    // ------------------------------------------------------------------ stand
    const s0r = run('status');
    const s0 = lees(join(p.uit, 'beheer-status.json')) || {};
    check('status: geen CA, sshd vertrouwt niets, schakelaar uit, Include gevonden', s0r.status === 0 && s0.ca === false && s0.sshdVertrouwt === false && s0.schakelaar === false && s0.include === true && s0.dropin === false, s0r.stderr + JSON.stringify(s0));
    check('status-bestand leesbaar voor de app (0640)', (statSync(join(p.uit, 'beheer-status.json')).mode & 0o777) === 0o640);

    // ------------------------------------------------------------------ inrichten: alleen met root-passkey
    const zonder = doe('inrichten');
    check('inrichten zonder passkey: geweigerd door root, geen CA-sleutel, geen drop-in', zonder.res.ok === false && zonder.res.code === 'SSH_CA_PASSKEY' && !existsSync(join(p.ca, 'ca')) && !existsSync(p.dropin), JSON.stringify(zonder.res));
    const vreemd = doe('inrichten', {}, nieuwePasskey());
    check('inrichten met een passkey die root niet kent: geweigerd', vreemd.res.code === 'SSH_CA_PASSKEY' && !existsSync(join(p.ca, 'ca')), JSON.stringify(vreemd.res));
    const andereActie = doe('inrichten', {}, eigenaar, 'aan');
    check('assertie voor «aan» telt niet voor «inrichten» (actie zit in de challenge)', andereActie.res.code === 'SSH_CA_PASSKEY' && !existsSync(join(p.ca, 'ca')));

    // Include ontbreekt → hoofdconfig wordt niet bewerkt, niets gewijzigd.
    const cfg = readFileSync(p.config, 'utf8');
    writeFileSync(p.config, cfg.replace(/^Include .*\n/m, ''));
    const geenInc = doe('inrichten', {}, eigenaar);
    check('zonder Include in sshd_config: SSH_CA_SSHD_GEEN_INCLUDE, sshd_config ongewijzigd, geen drop-in', geenInc.res.code === 'SSH_CA_SSHD_GEEN_INCLUDE' && !/Include/.test(readFileSync(p.config, 'utf8')) && !existsSync(p.dropin), JSON.stringify(geenInc.res));
    writeFileSync(p.config, cfg);

    // sshd -t faalt (kapotte andere drop-in) → terug naar de vorige drop-in, sshd niet herladen.
    writeFileSync(p.dropin, '# vorige versie (met de hand)\n');
    const kapot = join(p.dropDir, '40-kapot.conf');
    writeFileSync(kapot, 'DitBestaatNiet ja\n');
    o.eigen(p.dropin); o.eigen(kapot);
    const ongeldig = doe('inrichten', {}, eigenaar);
    check('sshd -t keurt af → SSH_CA_SSHD_ONGELDIG, vorige drop-in teruggezet, geen reload', ongeldig.res.code === 'SSH_CA_SSHD_ONGELDIG' && readFileSync(p.dropin, 'utf8') === '# vorige versie (met de hand)\n' && !/^reload/m.test(logboek()) && /Bad configuration option|DitBestaatNiet/.test(String(ongeldig.res.detail || '')), JSON.stringify(ongeldig.res));
    rmSync(kapot);

    // Herladen mislukt → ook terug.
    writeFileSync(p.faal, '1');
    const herlaad = doe('inrichten', {}, eigenaar);
    check('reload mislukt → SSH_CA_SSHD_HERLADEN, vorige drop-in teruggezet', herlaad.res.code === 'SSH_CA_SSHD_HERLADEN' && readFileSync(p.dropin, 'utf8') === '# vorige versie (met de hand)\n', JSON.stringify(herlaad.res));
    rmSync(p.faal);

    const ok = doe('inrichten', {}, eigenaar);
    const drop = existsSync(p.dropin) ? readFileSync(p.dropin, 'utf8') : '';
    const t = spawnSync(SSHD, ['-t', '-f', p.config], { encoding: 'utf8' });
    check('inrichten met root-passkey: CA, KRL, principals, drop-in; sshd -t geldig; reload', ok.res.ok === true && existsSync(join(p.ca, 'ca')) && existsSync(join(p.ca, 'krl')) && readFileSync(join(p.ca, 'principals', 'beheer'), 'utf8') === 'beheer\n'
      && drop.includes(`TrustedUserCAKeys ${join(p.ca, 'ca.pub')}`) && drop.includes(`RevokedKeys ${join(p.ca, 'krl')}`) && t.status === 0 && /^reload ssh\.service/m.test(logboek()), JSON.stringify(ok.res) + ok.r.stderr);
    const s1 = ok.res.stand || {};
    check('stand na inrichten (via sshd -T): sshd vertrouwt de CA, KRL actief, schakelaar nog uit', s1.ca === true && s1.sshdVertrouwt === true && s1.krl === true && s1.schakelaar === false && s1.pathUnit === false && /^SHA256:/.test(s1.vinger), JSON.stringify(s1));
    check('sshd_config zelf nooit herschreven', readFileSync(p.config, 'utf8') === cfg);
    const herhaal = doe('inrichten', {}, eigenaar);
    writeFileSync(herhaal.pad, JSON.stringify(herhaal.body)); o.eigen(herhaal.pad);
    run('beheer');
    check('dezelfde assertie werkt maar één keer (nonce verbruikt door root)', herhaal.res.ok === true && lees(join(p.uit, `beheer-${herhaal.id}.json`))?.code === 'SSH_CA_PASSKEY');

    // ------------------------------------------------------------------ aan / uit
    const aanZonder = doe('aan');
    check('aan zonder passkey: geweigerd, schakelaar blijft false', aanZonder.res.code === 'SSH_CA_PASSKEY' && rechten()['ssh-ca'] === false);
    const aan = doe('aan', {}, eigenaar);
    check('aan met root-passkey: ssh-ca = true (boolean), andere schakelaars en rechten 0640 behouden, path-unit aan', aan.res.ok === true && rechten()['ssh-ca'] === true && rechten().uitrol === true && rechten().read === true
      && (statSync(p.rechten).mode & 0o777) === 0o640 && /^enable --now mijn-ruimte-ssh-ca\.path/m.test(logboek()) && aan.res.stand?.pathUnit === true && aan.res.stand?.schakelaar === true, JSON.stringify(aan.res));

    // ------------------------------------------------------------------ certificaten 5–60 min, principals uit de root-lijst
    const gebruiker = join(p.w, 'gebruiker');
    spawnSync('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-f', gebruiker, '-N', '']);
    const pub = readFileSync(`${gebruiker}.pub`, 'utf8').trim().split(/\s+/).slice(0, 2).join(' ');
    const teken = (extra: Record<string, unknown>) => {
      const id = randomUUID();
      const pad = join(p.inbox, `${id}.json`);
      writeFileSync(pad, JSON.stringify({ id, publiek: pub, identiteit: 'pavlo', ...extra }));
      o.eigen(pad);
      run('tekenen', id);
      return lees(join(p.uit, `${id}.json`)) || {};
    };
    const c5 = teken({ minuten: 5, toegang: ['beheer'] });
    const certPad = join(p.w, 'c5-cert.pub');
    writeFileSync(certPad, `${c5.cert}\n`); o.eigen(certPad);
    const L = spawnSync('/usr/bin/ssh-keygen', ['-L', '-f', certPad], { encoding: 'utf8' }).stdout;
    const van = /Valid: from (\S+) to (\S+)/.exec(L);
    const duur = van ? (Date.parse(van[2]) - Date.parse(van[1])) / 60000 : 0;
    check('certificaat 5 min: ssh-keygen -L — principal beheer, serie, 5 min + 5 min speling, alleen permit-pty', c5.ok === true && c5.minuten === 5 && Number.isInteger(c5.serie) && new RegExp(`Serial: ${c5.serie}\\b`).test(L) && /^\s+beheer$/m.test(L) && duur === 10 && /permit-pty/.test(L) && !/permit-port-forwarding/.test(L), L);
    const c61 = teken({ minuten: 61 });
    const c4 = teken({ minuten: 4 });
    check('duur buiten 5–60 min geweigerd', c61.code === 'SSH_CA_DUUR' && c4.code === 'SSH_CA_DUUR');
    const croot = teken({ toegang: ['root'] });
    check('principal buiten de root-lijst (root) geweigerd', croot.code === 'SSH_CA_PRINCIPAL');
    const c2 = teken({ minuten: 30 });
    const cert2 = join(p.w, 'c2-cert.pub'); writeFileSync(cert2, `${c2.cert}\n`); o.eigen(cert2);

    // ------------------------------------------------------------------ KRL: intrekken werkt meteen
    const Q = (c: string) => spawnSync('/usr/bin/ssh-keygen', ['-Q', '-f', join(p.ca, 'krl'), c], { encoding: 'utf8' });
    const voorQ = Q(certPad);
    check('vóór intrekken: KRL laat het certificaat door (ssh-keygen -Q, zoals sshd)', voorQ.status === 0 && /ok/.test(voorQ.stdout), voorQ.stdout + voorQ.stderr);
    const vies = doe('intrekken', { series: ['1; id'] });
    const nul = doe('intrekken', { series: [] });
    check('intrekken met ongeldige serienummers geweigerd', vies.res.code === 'SSH_CA_SERIE' && nul.res.code === 'SSH_CA_SERIE');
    const trek = doe('intrekken', { series: [c5.serie] });
    const naQ = Q(certPad);
    const anderQ = Q(cert2);
    check('na intrekken (zonder passkey: veilige richting): certificaat REVOKED, het andere blijft geldig', trek.res.ok === true && naQ.status !== 0 && /REVOKED/.test(naQ.stdout + naQ.stderr) && anderQ.status === 0 && (trek.res.stand?.ingetrokken === 1), naQ.stdout + naQ.stderr + JSON.stringify(trek.res));
    const nogeens = doe('intrekken', { series: [c2.serie] });
    check('KRL groeit: eerder ingetrokken serie blijft ingetrokken', nogeens.res.ok === true && Q(certPad).status !== 0 && Q(cert2).status !== 0);

    // ------------------------------------------------------------------ uit / ontmantelen
    const uit = doe('uit');
    check('uit (zonder passkey): ssh-ca = false, path-unit uit', uit.res.ok === true && rechten()['ssh-ca'] === false && /^disable --now mijn-ruimte-ssh-ca\.path/m.test(logboek()));
    const naUit = teken({ minuten: 10 });
    check('na uit: root tekent niet meer', naUit.code === 'SSH_CA_UIT');
    const weg = doe('ontmantelen');
    check('ontmantelen: drop-in weg, sshd -t + reload, CA-sleutel blijft', weg.res.ok === true && !existsSync(p.dropin) && existsSync(join(p.ca, 'ca')) && weg.res.stand?.sshdVertrouwt === false && spawnSync(SSHD, ['-t', '-f', p.config]).status === 0);
    const aanNaWeg = doe('aan', {}, eigenaar);
    check('aan zonder sshd-vertrouwen: SSH_CA_NIET_GEREED (eerst voorbereiden)', aanNaWeg.res.code === 'SSH_CA_NIET_GEREED' && rechten()['ssh-ca'] === false, JSON.stringify(aanNaWeg.res));

    // ------------------------------------------------------------------ inbox-hygiëne
    const raar = doe('rm-rf');
    check('onbekende actie geweigerd', raar.res.code === 'SSH_CA_ACTIE');
    const link = join(p.beheer, `${randomUUID()}.json`);
    symlinkSync('/etc/passwd', link);
    const slecht = join(p.beheer, 'geen-uuid.json');
    writeFileSync(slecht, '{}'); o.eigen(slecht);
    run('beheer');
    check('symlink en een naam die geen uuid is: opgeruimd, niet gelezen', !existsSync(link) && !existsSync(slecht) && !readdirSync(p.uit).some((n) => n.includes('geen-uuid')));
    const oud = verzoek('uit');
    const toen = new Date(Date.now() - 10 * 60_000); utimesSync(oud.pad, toen, toen);
    run('beheer');
    check('verzoek ouder dan 5 minuten: SSH_CA_TE_OUD', lees(join(p.uit, `beheer-${oud.id}.json`))?.code === 'SSH_CA_TE_OUD');
    check('werkmap leeg na afloop (verzoeken met assertie blijven niet liggen)', readdirSync(p.werk).filter((n) => n.startsWith('beheer-')).length === 0, readdirSync(p.werk).join(','));
    const nietRoot = spawnSync('bash', [SCRIPT, 'beheer'], { encoding: 'utf8', env: { ...process.env, MIJN_RUIMTE_SSH_CA_DIR: p.ca, MIJN_RUIMTE_SSH_CA_INBOX: p.inbox, MIJN_RUIMTE_SSH_CA_WERK: p.werk, MIJN_RUIMTE_SSH_CA_UIT: p.uit, MIJN_RUIMTE_SSH_CA_STATUS: p.status }, ...(ALS_ROOT ? { uid: NIEMAND, gid: NIEMAND } : {}) });
    check('beheer buiten root met de echte /etc/ssh en /etc/mijn-ruimte: geweigerd («alleen root»)', nietRoot.status === 1 && /alleen root/.test(nietRoot.stderr));

    // ------------------------------------------------------------------ statisch: unit, polkit, script
    const bron = readFileSync(SCRIPT, 'utf8');
    const unit = readFileSync('deploy/mijn-ruimte-ssh-ca-beheer.service', 'utf8');
    const regels = readFileSync('deploy/opdracht/50-mijn-ruimte-opdracht.rules', 'utf8');
    const unitCode = unit.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    check('beheer-unit: vaste ExecStart, ProtectSystem=strict, geen netwerk, sshd_config zelf niet schrijfbaar', /ExecStart=\/usr\/local\/sbin\/mijn-ruimte-ssh-ca beheer\n/.test(unitCode) && /ProtectSystem=strict/.test(unitCode) && /PrivateNetwork=yes/.test(unitCode) && !/ReadWritePaths=[^\n]*\/etc\/ssh(\s|$)/.test(unitCode) && /\/etc\/ssh\/sshd_config\.d/.test(unitCode));
    check('polkit: app mag alleen «start» van de beheer-unit (geen stop/restart, geen andere units)', /"mijn-ruimte-ssh-ca-beheer\.service"/.test(regels) && /lookup\("verb"\) === "start"/.test(regels));
    check('script: sshd -t vóór reload, terugzetten bij fout; hoofdconfig alleen gelezen', bron.indexOf('run([sshd_bin, "-t", "-f", sshd_config])') < bron.indexOf('run([systemctl, "reload", "ssh.service"])') && /zet\(vorig\)/.test(bron) && !/open\(sshd_config, ["']w/.test(bron));
    check('script: «inrichten» en «aan» roepen de root-passkey-controle aan, de veilige richtingen niet', /passkey_ok\(pad, "inrichten"\)/.test(bron) && /passkey_ok\(pad, "aan"\)/.test(bron) && (bron.match(/passkey_ok\(pad, "/g) || []).length === 2);
  } finally { rmSync(p.w, { recursive: true, force: true }); }
  return einde();
}
