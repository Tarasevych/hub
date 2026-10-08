// Updates goedkeuren met de passkey van de eigenaar (RUNBOOK-VEILIGE-UITROL.md §13): WebAuthn-kern, root-hulp (onafhankelijke
// controle, replay, eerste sleutel via SSH), mijn-ruimte-uitrol --goedkeuring end-to-end, en het contract van de app
// (grants, voorbereiden, eigenaar-only, eenmalige challenge, agents keuren nooit goed). Echte handtekeningen via nep-passkey.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { closePool, getPool } from '../../server/platform/pg';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-passkey';
import { checker } from './hulp/nep-google';

const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');
const UITROL = resolve('deploy/uitrol/mijn-ruimte-uitrol.sh');
const RP = 'admin.tarasevych.com'; const ORIGIN = `https://${RP}`;
const shaHex = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const nonce = () => randomBytes(32).toString('base64url');
type Check = (n: string, ok: boolean, i?: string) => void;

function sleutelUit(pk: NepPasskey, label = 'telefoon') {
  const r = kern.verifieerRegistratie({ ...registreer(pk, 'c'), verwachteUitdaging: 'c', rpId: RP, origins: [ORIGIN] });
  if (!r.ok) throw new Error(`registratie: ${r.code}`);
  return { credentialId: r.credentialId, alg: r.alg, jwk: r.jwk, label, vingerafdruk: r.vingerafdruk, toegevoegd: new Date().toISOString(), door: 'test' };
}

// ------------------------------------------------------------------------------------------------ A. kern
function kernTests(check: Check) {
  const pk = nieuwePasskey();
  const reg = registreer(pk, 'uitdaging-1');
  const r = kern.verifieerRegistratie({ ...reg, verwachteUitdaging: 'uitdaging-1', rpId: RP, origins: [ORIGIN] });
  check('kern: registratie (attestation none) geeft ES256-sleutel + vingerafdruk', r.ok && r.alg === -7 && /^[0-9a-f]{64}$/.test(r.vingerafdruk));
  const reg2 = (o: Parameters<typeof registreer>[2], u = 'uitdaging-1') => kern.verifieerRegistratie({ ...registreer(pk, u, o), verwachteUitdaging: 'uitdaging-1', rpId: RP, origins: [ORIGIN] });
  check('kern: registratie met verkeerde rpId geweigerd', !reg2({ rpId: 'evil.example' }).ok && (reg2({ rpId: 'evil.example' }) as { code: string }).code === 'ORIGIN_ONJUIST' || (reg2({ rpId: 'evil.example', origin: ORIGIN }) as { code: string }).code === 'RPID_ONJUIST');
  check('kern: registratie zonder UV geweigerd', (reg2({ uv: false }) as { code: string }).code === 'GEEN_VERIFICATIE');
  check('kern: registratie met andere challenge geweigerd', (reg2({}, 'iets-anders') as { code: string }).code === 'UITDAGING_ONJUIST');
  check('kern: registratie van een andere origin geweigerd', (reg2({ origin: 'https://hub.tarasevych.com' }) as { code: string }).code === 'ORIGIN_ONJUIST');

  const sleutel = sleutelUit(pk);
  const velden = { voorstelId: randomUUID(), versie: '20261008-120000', sha256: shaHex('pakket-A'), nonce: nonce(), verloopt: Date.now() + 240000 };
  const u = kern.uitdagingVoor('goedkeuren', velden);
  const v = (a: ReturnType<typeof bevestig>, uitdaging = u, sleutels = [sleutel]) => kern.verifieerAssertie({ assertie: a, verwachteUitdaging: uitdaging, rpId: RP, origins: [ORIGIN], sleutels });
  const code = (x: ReturnType<typeof v>) => (x.ok ? 'OK' : x.code);
  check('kern: geldige assertie voor dit pakket', code(v(bevestig(pk, u))) === 'OK');
  check('kern: verkeerde rpId geweigerd', code(v(bevestig(pk, u, { rpId: 'hub.tarasevych.com', origin: ORIGIN }))) === 'RPID_ONJUIST');
  check('kern: verkeerde origin geweigerd', code(v(bevestig(pk, u, { origin: 'https://evil.example' }))) === 'ORIGIN_ONJUIST');
  check('kern: crossOrigin geweigerd', code(v(bevestig(pk, u, { crossOrigin: true }))) === 'CROSS_ORIGIN');
  check('kern: type webauthn.create als assertie geweigerd', code(v(bevestig(pk, u, { type: 'webauthn.create' }))) === 'TYPE_ONJUIST');
  const uB = kern.uitdagingVoor('goedkeuren', { ...velden, sha256: shaHex('pakket-B') });
  check('kern: assertie voor een ander pakket (andere sha256) geweigerd', code(v(bevestig(pk, uB))) === 'UITDAGING_ONJUIST');
  check('kern: challenge bevat doel: sleutel-assertie telt niet als goedkeuring', kern.uitdagingVoor('sleutel-toevoegen', { vingerafdruk: velden.sha256, nonce: velden.nonce, verloopt: velden.verloopt }) !== u);
  check('kern: zonder UV (alleen aanraken) geweigerd', code(v(bevestig(pk, u, { uv: false }))) === 'GEEN_VERIFICATIE');
  check('kern: zonder UP geweigerd', code(v(bevestig(pk, u, { up: false }))) === 'GEEN_AANWEZIGHEID');
  const vreemd = nieuwePasskey();
  check('kern: passkey die niet van de eigenaar is (onbekende credentialId) geweigerd', code(v(bevestig(vreemd, u))) === 'SLEUTEL_ONBEKEND');
  check('kern: vreemde sleutel met de credentialId van de eigenaar: handtekening ongeldig', code(v(bevestig(vreemd, u, { credentialId: pk.credentialId }))) === 'HANDTEKENING_ONGELDIG');
  const ed = nieuwePasskey('ed25519');
  const edS = sleutelUit(ed);
  check('kern: Ed25519-passkey werkt ook', edS.alg === -8 && code(v(bevestig(ed, u), u, [edS])) === 'OK');
  check('kern: vervaltijd verlopen / te lang / ongeldig', kern.verlooptGeldig(Date.now() - 61000) === 'VERLOPEN' && kern.verlooptGeldig(Date.now() + 7 * 60000) === 'VERLOOPT_TE_LAAT' && kern.verlooptGeldig(NaN) === 'VERLOOPT_ONGELDIG' && kern.verlooptGeldig(Date.now() + 200000) === null);
  check('kern: teller (0/0 mag, gelijk of lager niet)', kern.tellerOk(0, 0) && kern.tellerOk(undefined, 0) && kern.tellerOk(5, 6) && !kern.tellerOk(5, 5) && !kern.tellerOk(5, 4));
  check('kern: sleutelbestand normaliseren rekent de vingerafdruk zelf uit', kern.normaliseerSleutelbestand({ sleutels: [{ ...sleutel, vingerafdruk: 'f'.repeat(64) }] }).sleutels[0].vingerafdruk === sleutel.vingerafdruk);
}

// ------------------------------------------------------------------------------------------------ B. root-hulp (CLI)
type RootOmg = { dir: string; env: NodeJS.ProcessEnv; sleutels: string; rechten: string; inbox: string; statusDir: string };
function rootOmgeving(basis: string, schakelaar = true): RootOmg {
  const dir = join(basis, `root-${randomBytes(3).toString('hex')}`);
  const inbox = join(dir, 'inbox'); const statusDir = join(dir, 'status');
  mkdirSync(inbox, { recursive: true }); mkdirSync(statusDir, { recursive: true });
  const sleutels = join(dir, 'goedkeur-passkeys.json'); const rechten = join(dir, 'mcp-rechten.json');
  writeFileSync(sleutels, JSON.stringify({ versie: 1, rpId: RP, origins: [ORIGIN], sleutels: [] }));
  writeFileSync(rechten, JSON.stringify({ uitrol: true, 'passkey-goedkeuring': schakelaar }));
  const env = { ...process.env, GOEDKEUR_SLEUTELS: sleutels, GOEDKEUR_RECHTEN: rechten, GOEDKEUR_STAAT: join(dir, 'staat'), GOEDKEUR_INBOX: inbox, GOEDKEUR_STATUS_DIR: statusDir, GOEDKEUR_GROEP: 'nogroup' };
  return { dir, env, sleutels, rechten, inbox, statusDir };
}
const hulp = (o: RootOmg, ...args: string[]) => {
  const r = spawnSync(process.execPath, [HULP, ...args], { env: o.env, encoding: 'utf8' });
  let uit: any = null; try { uit = JSON.parse(r.stdout.trim().split('\n').pop() || ''); } catch { uit = null; }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, uit };
};
const zetSleutels = (o: RootOmg, sleutels: unknown[]) => writeFileSync(o.sleutels, JSON.stringify({ versie: 1, rpId: RP, origins: [ORIGIN], sleutels }));
const leesSleutels = (o: RootOmg) => JSON.parse(readFileSync(o.sleutels, 'utf8')).sleutels as Array<{ vingerafdruk: string; door: string }>;
function goedkeuringBestand(o: RootOmg, pk: NepPasskey, pakket: string, versie: string, extra: { sha256?: string; verloopt?: number; origin?: string; voorstelId?: string; ondertekenSha?: string } = {}) {
  const v = { voorstelId: extra.voorstelId ?? randomUUID(), versie, sha256: extra.sha256 ?? shaHex(readFileSync(pakket)), nonce: nonce(), verloopt: extra.verloopt ?? Date.now() + 240000 };
  const teken = { ...v, sha256: extra.ondertekenSha ?? v.sha256 };
  const assertie = bevestig(pk, kern.uitdagingVoor('goedkeuren', teken), { origin: extra.origin });
  const p = join(o.dir, `goedkeuring-${randomBytes(3).toString('hex')}.json`);
  writeFileSync(p, JSON.stringify({ doel: 'goedkeuren', ...v, assertie }));
  return p;
}

function rootTests(basis: string, check: Check) {
  const o = rootOmgeving(basis);
  const eigenaar = nieuwePasskey('es256', 1);
  const pakket = join(o.dir, 'pakket.tar.gz'); writeFileSync(pakket, randomBytes(4096));
  const versie = '20261008-130000';

  // Bootstrap: de eerste sleutel kan NIET via de inbox (ook niet met een geldige zelf-ondertekende assertie), alleen via SSH.
  const eersteReg = registreer(eigenaar, 'x');
  const eerste = kern.verifieerRegistratie({ ...eersteReg, verwachteUitdaging: 'x', rpId: RP, origins: [ORIGIN] });
  if (!eerste.ok) throw new Error('registratie');
  writeFileSync(join(o.inbox, `sleutel-aanmelding-${eerste.vingerafdruk}.json`), JSON.stringify({ credentialId: eerste.credentialId, alg: eerste.alg, jwk: eerste.jwk, label: 'telefoon', aangemaakt: new Date().toISOString(), vingerafdruk: '0'.repeat(64) }));
  const n1 = nonce(); const vl1 = Date.now() + 200000;
  writeFileSync(join(o.inbox, `sleutel-toevoegen-${eerste.vingerafdruk.slice(0, 32)}.json`), JSON.stringify({ doel: 'sleutel-toevoegen', nonce: n1, verloopt: vl1, nieuw: { credentialId: eerste.credentialId, alg: eerste.alg, jwk: eerste.jwk, label: 'x' }, assertie: bevestig(eigenaar, kern.uitdagingVoor('sleutel-toevoegen', { vingerafdruk: eerste.vingerafdruk, nonce: n1, verloopt: vl1 })) }));
  const v0 = hulp(o, 'verwerk');
  const st0 = JSON.parse(readFileSync(join(o.statusDir, 'goedkeur-sleutels.json'), 'utf8'));
  check('root: eerste sleutel via de inbox (app) geweigerd: EERSTE_SLEUTEL_VIA_SSH', v0.status !== 0 && st0.code === 'EERSTE_SLEUTEL_VIA_SSH' && leesSleutels(o).length === 0);
  check('root: wachtend toont de zelf uitgerekende vingerafdruk (niet die van de app)', hulp(o, 'wachtend').stdout.includes(eerste.vingerafdruk) && !hulp(o, 'wachtend').stdout.includes('0'.repeat(64)));
  check('root: toevoegen met te kort prefix geweigerd', hulp(o, 'toevoegen', eerste.vingerafdruk.slice(0, 8)).status === 1);
  const t = hulp(o, 'toevoegen', kern.vingerafdrukKort(eerste.vingerafdruk));
  check('root: eerste sleutel via SSH (toevoegen <vingerafdruk zoals op de telefoon>)', t.status === 0 && leesSleutels(o).length === 1 && leesSleutels(o)[0].door === 'ssh' && !existsSync(join(o.inbox, `sleutel-aanmelding-${eerste.vingerafdruk}.json`)));
  check('root: gebeurtenis voor de app (bron goedkeuring)', readFileSync(join(o.statusDir, 'gebeurtenissen.jsonl'), 'utf8').split('\n').filter(Boolean).some((l) => JSON.parse(l).bron === 'goedkeuring' && JSON.parse(l).code === 'PASSKEY_TOEGEVOEGD'));

  const geldig = goedkeuringBestand(o, eigenaar, pakket, versie);
  const ok = hulp(o, 'verifieer-goedkeuring', pakket, geldig, versie);
  check('root: geldige goedkeuring (eigen sha256, root-sleutel, UV, nonce nieuw)', ok.status === 0 && ok.uit?.ok === true && ok.uit?.vingerafdruk === eerste.vingerafdruk, JSON.stringify(ok.uit));
  const replay = hulp(o, 'verifieer-goedkeuring', pakket, geldig, versie);
  check('root: dezelfde goedkeuring nogmaals (replay) geweigerd: HERGEBRUIKT', replay.status === 2 && replay.uit?.code === 'HERGEBRUIKT');
  check('root: teller die teruggaat geweigerd (gekopieerde sleutel)', (() => { const p = join(o.dir, 'teller.json'); const v = { voorstelId: randomUUID(), versie, sha256: shaHex(readFileSync(pakket)), nonce: nonce(), verloopt: Date.now() + 200000 }; writeFileSync(p, JSON.stringify({ doel: 'goedkeuren', ...v, assertie: bevestig(eigenaar, kern.uitdagingVoor('goedkeuren', v), { teller: 1 }) })); return hulp(o, 'verifieer-goedkeuring', pakket, p, versie).uit?.code === 'TELLER_TERUG'; })());

  // Gecompromitteerde app: kan alles in de inbox schrijven, maar heeft de passkey niet.
  const kwaad = join(o.dir, 'kwaad.tar.gz'); writeFileSync(kwaad, randomBytes(4096));
  const g1 = goedkeuringBestand(o, eigenaar, kwaad, versie, { ondertekenSha: shaHex(readFileSync(pakket)) });
  check('gecompromitteerde app: echte assertie (voor het goede pakket) onder een ander pakket: geweigerd', hulp(o, 'verifieer-goedkeuring', kwaad, g1, versie).uit?.code === 'UITDAGING_ONJUIST');
  const g2 = goedkeuringBestand(o, eigenaar, pakket, versie, { sha256: shaHex(readFileSync(pakket)) });
  check('gecompromitteerde app: pakket na goedkeuring verwisseld: PAKKET_GEWIJZIGD (root hasht zijn eigen kopie)', hulp(o, 'verifieer-goedkeuring', kwaad, g2, versie).uit?.code === 'PAKKET_GEWIJZIGD');
  const appSleutel = nieuwePasskey();
  check('gecompromitteerde app: eigen sleutel (niet in het root-bestand) geweigerd', hulp(o, 'verifieer-goedkeuring', kwaad, goedkeuringBestand(o, appSleutel, kwaad, versie), versie).uit?.code === 'SLEUTEL_ONBEKEND');
  check('gecompromitteerde app: ongeldig/leeg goedkeuringsbestand geweigerd', (() => { const p = join(o.dir, 'leeg.json'); writeFileSync(p, '{"doel":"goedkeuren"}'); return hulp(o, 'verifieer-goedkeuring', pakket, p, versie).uit?.code === 'GOEDKEURING_ONGELDIG'; })());
  check('root: verlopen challenge geweigerd', hulp(o, 'verifieer-goedkeuring', pakket, goedkeuringBestand(o, eigenaar, pakket, versie, { verloopt: Date.now() - 120000 }), versie).uit?.code === 'VERLOPEN');
  check('root: challenge die langer dan 5 min geldig is geweigerd', hulp(o, 'verifieer-goedkeuring', pakket, goedkeuringBestand(o, eigenaar, pakket, versie, { verloopt: Date.now() + 3600000 }), versie).uit?.code === 'VERLOOPT_TE_LAAT');
  check('root: assertie van een andere origin geweigerd', hulp(o, 'verifieer-goedkeuring', pakket, goedkeuringBestand(o, eigenaar, pakket, versie, { origin: 'https://evil.example' }), versie).uit?.code === 'ORIGIN_ONJUIST');
  check('root: versie in de goedkeuring ≠ pakketversie geweigerd', hulp(o, 'verifieer-goedkeuring', pakket, goedkeuringBestand(o, eigenaar, pakket, versie), '20261008-130001').uit?.code === 'VERSIE_VERSCHILT');
  writeFileSync(o.rechten, JSON.stringify({ uitrol: true, 'passkey-goedkeuring': false }));
  check('root: schakelaar "passkey-goedkeuring" uit: alles geweigerd', hulp(o, 'verifieer-goedkeuring', pakket, goedkeuringBestand(o, eigenaar, pakket, versie), versie).uit?.code === 'UIT');
  writeFileSync(o.rechten, JSON.stringify({ uitrol: true }));
  check('root: schakelaar ontbreekt = uit (standaard false)', hulp(o, 'verifieer-goedkeuring', pakket, goedkeuringBestand(o, eigenaar, pakket, versie), versie).uit?.code === 'UIT');
  writeFileSync(o.rechten, JSON.stringify({ uitrol: true, 'passkey-goedkeuring': true }));

  // Tweede sleutel: alleen met een assertie van een bestaande sleutel.
  const tweede = nieuwePasskey(); const s2 = sleutelUit(tweede, 'laptop');
  const verzoek = (doel: 'sleutel-toevoegen' | 'sleutel-verwijderen', fp: string, ondertekenaar: NepPasskey, extra: Record<string, unknown> = {}) => {
    const n = nonce(); const vl = Date.now() + 200000;
    writeFileSync(join(o.inbox, `${doel}-${fp.slice(0, 32)}.json`), JSON.stringify({ doel, nonce: n, verloopt: vl, ...extra, assertie: bevestig(ondertekenaar, kern.uitdagingVoor(doel, { vingerafdruk: fp, nonce: n, verloopt: vl })) }));
    hulp(o, 'verwerk');
    return JSON.parse(readFileSync(join(o.statusDir, 'goedkeur-sleutels.json'), 'utf8')).code as string;
  };
  check('root: sleutel toevoegen ondertekend door een onbekende sleutel geweigerd', verzoek('sleutel-toevoegen', s2.vingerafdruk, tweede, { nieuw: s2 }) === 'SLEUTEL_ONBEKEND' && leesSleutels(o).length === 1);
  const nepFp = sleutelUit(nieuwePasskey()).vingerafdruk;
  check('root: toevoegen-assertie voor een ándere sleutel (vingerafdruk) dan in het verzoek geweigerd', (() => { const n = nonce(); const vl = Date.now() + 200000; writeFileSync(join(o.inbox, `sleutel-toevoegen-${s2.vingerafdruk.slice(0, 32)}.json`), JSON.stringify({ doel: 'sleutel-toevoegen', nonce: n, verloopt: vl, nieuw: s2, assertie: bevestig(eigenaar, kern.uitdagingVoor('sleutel-toevoegen', { vingerafdruk: nepFp, nonce: n, verloopt: vl })) })); hulp(o, 'verwerk'); return leesSleutels(o).length === 1; })());
  check('root: sleutel toevoegen met assertie van de bestaande sleutel', verzoek('sleutel-toevoegen', s2.vingerafdruk, eigenaar, { nieuw: s2 }) === 'OK' && leesSleutels(o).length === 2 && leesSleutels(o)[1].door.startsWith('passkey:'));
  check('root: verzoekbestanden worden na verwerking verwijderd', !readdirSync(o.inbox).some((n) => n.startsWith('sleutel-toevoegen-')));
  check('root: verloren telefoon: verwijderen met de andere passkey', verzoek('sleutel-verwijderen', eerste.vingerafdruk, tweede, { vingerafdruk: eerste.vingerafdruk }) === 'OK' && leesSleutels(o).length === 1 && leesSleutels(o)[0].vingerafdruk === s2.vingerafdruk);
  check('root: verwijderde sleutel kan niet meer goedkeuren', hulp(o, 'verifieer-goedkeuring', pakket, goedkeuringBestand(o, eigenaar, pakket, versie), versie).uit?.code === 'SLEUTEL_ONBEKEND');
  check('root: alles-intrekken via SSH', hulp(o, 'alles-intrekken').status === 0 && leesSleutels(o).length === 0 && hulp(o, 'verifieer-goedkeuring', pakket, goedkeuringBestand(o, tweede, pakket, versie), versie).uit?.code === 'GEEN_SLEUTELS');
  check('root: verwijderen via SSH', (() => { zetSleutels(o, [s2]); return hulp(o, 'verwijderen', s2.vingerafdruk.slice(0, 20)).status === 0 && leesSleutels(o).length === 0; })());
  check('root: staat (nonces) staat buiten de app (0600)', (Number(readFileSync(join(o.env.GOEDKEUR_STAAT!, 'staat.json')).length) > 0) && ((spawnSync('stat', ['-c', '%a', join(o.env.GOEDKEUR_STAAT!, 'staat.json')], { encoding: 'utf8' }).stdout.trim()) === '600'));
}

// ------------------------------------------------------------------------------------------------ C. mijn-ruimte-uitrol --goedkeuring
function pakketMaken(werk: string, versie: string) {
  const top = join(werk, `bron-${versie}-${randomBytes(3).toString('hex')}`);
  const binnen = join(top, `mijn-ruimte-${versie}`);
  mkdirSync(join(binnen, 'deploy'), { recursive: true });
  writeFileSync(join(binnen, 'UITROL-VERSIE'), `${versie}\n`);
  writeFileSync(join(binnen, 'deploy/installeer-app.sh'), '#!/bin/bash\necho "ECHTE INSTALLER MAG IN DE TEST NIET DRAAIEN"; exit 99\n');
  const uit = join(werk, `mijn-ruimte-${versie}.tar.gz`);
  const r = spawnSync('bash', ['-c', `tar -czf "${uit}" -C "${top}" "mijn-ruimte-${versie}"`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return uit;
}
function uitrolTests(basis: string, check: Check) {
  const o = rootOmgeving(basis);
  const eigenaar = nieuwePasskey(); zetSleutels(o, [sleutelUit(eigenaar)]);
  const werk = join(o.dir, 'werk'); const statusMap = o.statusDir; const bron = join(o.dir, 'bron'); mkdirSync(bron);
  const spoor = join(o.dir, 'spoor'); const stub = join(o.dir, 'stub.sh');
  writeFileSync(stub, `#!/bin/bash\necho "$1 $2" >> "${spoor}"\ncat "$2/UITROL-VERSIE" >> "${spoor}"\n`); chmodSync(stub, 0o755);
  const env = { ...o.env, UITROL_GOEDKEUR_INBOX: o.inbox, UITROL_INBOX: join(o.dir, 'sig-inbox'), UITROL_WERK: werk, UITROL_STATUS_DIR: statusMap, UITROL_ONDERTEKENAARS: join(o.dir, 'geen'), UITROL_INSTALLEER: stub, UITROL_LOCK: join(o.dir, 'lock'), UITROL_GROEP: 'nogroup', UITROL_GOEDKEUR_HULP: `${process.execPath} ${HULP}` };
  const draai = () => spawnSync('bash', [UITROL, '--goedkeuring'], { env, encoding: 'utf8' });
  const status = () => { try { return JSON.parse(readFileSync(join(statusMap, 'status.json'), 'utf8')); } catch { return {}; } };
  const spoorN = () => (existsSync(spoor) ? readFileSync(spoor, 'utf8').trim().split('\n').filter(Boolean).length : 0);
  const leg = (versie: string, goedkeuring: ((p: string) => string) | null) => {
    const p = pakketMaken(bron, versie); const naam = `mijn-ruimte-${versie}.tar.gz`;
    writeFileSync(join(o.inbox, naam), readFileSync(p));
    if (goedkeuring) writeFileSync(join(o.inbox, `${naam}.goedkeuring.json`), readFileSync(goedkeuring(p)));
    writeFileSync(join(o.inbox, 'aanvraag'), 'x');
  };

  leg('20261008-140000', null);
  let r = draai();
  check('uitrol --goedkeuring: pakket zonder .goedkeuring.json geweigerd, niets geïnstalleerd', status().code === 'GOEDKEURING_ONTBREEKT' && spoorN() === 0, r.stderr.slice(-300));
  check('uitrol --goedkeuring: geweigerd pakket uit de inbox verwijderd', !readdirSync(o.inbox).some((n) => n.endsWith('.tar.gz')));
  leg('20261008-140001', (p) => goedkeuringBestand(o, nieuwePasskey(), p, '20261008-140001'));
  r = draai();
  check('uitrol --goedkeuring: goedkeuring met een app-sleutel (gecompromitteerde app) geweigerd, niets geïnstalleerd', status().staat === 'geweigerd' && status().code === 'SLEUTEL_ONBEKEND' && spoorN() === 0, JSON.stringify(status()));
  check('uitrol --goedkeuring: melding in het Oekraïens en Nederlands', /passkey/.test(String(status().uk)) && /passkey/.test(String(status().nl)));
  const ondertekend = (p: string) => goedkeuringBestand(o, eigenaar, p, '20261008-140002');
  leg('20261008-140002', ondertekend);
  r = draai();
  check('uitrol --goedkeuring: geldige passkey-goedkeuring → installer draait met precies deze versie', status().staat === 'klaar' && status().methode === 'passkey' && spoorN() === 2 && readFileSync(spoor, 'utf8').includes('20261008-140002'), JSON.stringify(status()) + r.stderr.slice(-400));
  check('uitrol --goedkeuring: gebeurtenissen GOEDGEKEURD + OK (bron uitrol)', (() => { const l = readFileSync(join(statusMap, 'gebeurtenissen.jsonl'), 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x)); return l.some((e) => e.code === 'GOEDGEKEURD') && l.some((e) => e.bron === 'uitrol' && e.code === 'OK'); })());
  // Replay over runs heen: dezelfde goedkeuring + pakket opnieuw (nieuwere naam kan niet: versie zit in de challenge).
  const p3 = pakketMaken(bron, '20261008-140003'); const g3 = goedkeuringBestand(o, eigenaar, p3, '20261008-140003');
  for (let i = 0; i < 2; i++) { writeFileSync(join(o.inbox, 'mijn-ruimte-20261008-140003.tar.gz'), readFileSync(p3)); writeFileSync(join(o.inbox, 'mijn-ruimte-20261008-140003.tar.gz.goedkeuring.json'), readFileSync(g3)); draai(); if (i === 0) check('uitrol --goedkeuring: tweede geldige versie geïnstalleerd', status().staat === 'klaar' && spoorN() === 4); }
  check('uitrol --goedkeuring: dezelfde goedkeuring nog eens ingelegd → geweigerd (oudere/gelijke versie of HERGEBRUIKT), niet opnieuw geïnstalleerd', status().staat === 'geweigerd' && spoorN() === 4, JSON.stringify(status()));
  writeFileSync(o.rechten, JSON.stringify({ 'passkey-goedkeuring': false }));
  leg('20261008-140004', (p) => goedkeuringBestand(o, eigenaar, p, '20261008-140004'));
  draai();
  check('uitrol --goedkeuring: schakelaar uit → geweigerd', status().staat === 'geweigerd' && status().code === 'UIT' && spoorN() === 4);
}

// ------------------------------------------------------------------------------------------------ D. app-contract (database + routes)
async function appTests(basis: string, check: Check) {
  const m = await import('../../backend/uitrol-goedkeuring');
  const sys = getPool('systeem');
  const o = rootOmgeving(basis, false);
  const voorstelDir = join(o.dir, 'voorstellen');
  const oud = { a: process.env.UITROL_VOORSTEL_DIR, b: process.env.GOEDKEUR_INBOX, c: process.env.GOEDKEUR_SLEUTELS, d: process.env.MCP_RECHTEN_PAD, e: process.env.OPDRACHT_STATUS_DIR };
  Object.assign(process.env, { UITROL_VOORSTEL_DIR: voorstelDir, GOEDKEUR_INBOX: o.inbox, GOEDKEUR_SLEUTELS: o.sleutels, MCP_RECHTEN_PAD: o.rechten, OPDRACHT_STATUS_DIR: o.statusDir });
  const OWNER = `ug-owner-${randomUUID()}`, HELPER = `ug-helper-${randomUUID()}`, ANDER = `ug-ander-${randomUUID()}`, NEPEIGENAAR = `ug-nep-${randomUUID()}`;
  const users: Record<string, any> = {
    [OWNER]: { id: OWNER, role: 'owner', status: 'approved', email: process.env.OWNER_EMAIL || 'eigenaar@test.invalid' },
    [HELPER]: { id: HELPER, role: 'user', status: 'approved', email: `h-${HELPER}@example.test` },
    [ANDER]: { id: ANDER, role: 'user', status: 'approved', email: `a-${ANDER}@example.test` },
    [NEPEIGENAAR]: { id: NEPEIGENAAR, role: 'owner', status: 'approved', email: `nep-${NEPEIGENAAR}@example.test` },
  };
  for (const u of Object.values(users)) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [u.id, { email: u.role === 'owner' ? `${u.id}@example.test` : u.email, role: u.role === 'owner' ? 'member' : u.role, status: u.status }]); // één eigenaar per database (records_een_eigenaar) en OWNER_EMAIL niet bezetten (aanmelden-test); de sessie-mock geeft rol + e-mail
  let stepUp = false;
  const routes = m.uitrolGoedkeuringRoutes({ requireSession: async (event: any) => ({ user: users[event.who], service: event.service ?? 'admin' }) as any,
    stepUp: async () => (stepUp ? null : { statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_REQUIRED' }) } as any) });
  const call = async (route: string, who: string, body: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const res: any = await routes[route][0]({ event: { who, headers: {}, ...extra }, body } as any);
    let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
    return { status: res.statusCode as number, data, fout: String(data?.error || data?.reasonCode || '') };
  };
  const upload = async (who: string, versie: string, chunk = 3000) => {
    const p = pakketMaken(o.dir, versie); const buf = readFileSync(p);
    const b = await call('POST /api/uitrol/voorstel/begin', who, { version: versie, bytes: buf.length, sha256: shaHex(buf), commit: 'abcdef1234567', changelog: 'Test-wijziging', tests: { passed: 700, failed: 0, summary: 'alles groen' } });
    if (b.status !== 200) return { begin: b, id: '', buf };
    for (let off = 0; off < buf.length; off += chunk) await call('POST /api/uitrol/voorstel/stuk', who, { id: b.data.id, offset: off, data: buf.subarray(off, off + chunk).toString('base64') });
    const k = await call('POST /api/uitrol/voorstel/klaar', who, { id: b.data.id });
    return { begin: b, klaar: k, id: String(b.data.id), buf };
  };
  try {
    check('app: voorbereider zonder grant geweigerd', (await call('POST /api/uitrol/voorstel/begin', HELPER, { version: '20261008-150000', bytes: 10, sha256: 'a'.repeat(64) })).fout === 'GEEN_VOORBEREIDER_GRANT');
    check('app: niet-eigenaar ziet het overzicht niet', (await call('POST /api/owner/uitrol/overzicht', HELPER)).status === 403);
    check('app: rol owner met een ander e-mailadres is geen eigenaar', (await call('POST /api/owner/uitrol/overzicht', NEPEIGENAAR)).fout === 'OWNER_REQUIRED');
    check('app: eigenaar buiten admin.tarasevych.com geweigerd', (await call('POST /api/owner/uitrol/overzicht', OWNER, {}, { service: 'mcp' })).fout === 'ADMIN_SERVICE_REQUIRED');
    check('app: grant geven vraagt step-up', (await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'account', onderwerp: HELPER, dagen: 3 })).fout === 'STEP_UP_REQUIRED');
    stepUp = true;
    check('app: grant langer dan 30 dagen geweigerd', (await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'account', onderwerp: HELPER, dagen: 31 })).fout === 'DUUR_ONGELDIG');
    const g = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'account', onderwerp: HELPER, dagen: 3 });
    stepUp = false;
    check('app: grant gegeven (account, 3 dagen)', g.status === 200 && g.data.voorbereider.status === 'actief');
    const auditGrant = (await sys.query("SELECT 1 FROM app.audit WHERE action = 'uitrol_voorbereider_gegeven' AND details->>'onderwerp' = $1", [HELPER]).catch(() => ({ rows: [] }))).rows.length;
    check('app: grant staat in de audit', auditGrant === 1);

    const u1 = await upload(HELPER, '20261008-150001');
    check('app: voorbereider uploadt in stukken → wacht-op-goedkeuring', u1.klaar?.data?.status === 'wacht-op-goedkeuring', JSON.stringify(u1.begin.data) + JSON.stringify(u1.klaar?.data));
    check('app: upload installeert niets (inbox leeg)', readdirSync(o.inbox).length === 0);
    check('app: andere gebruiker (zonder grant) ziet de status niet', (await call('POST /api/uitrol/voorstel/status', ANDER)).fout === 'GEEN_VOORBEREIDER_GRANT');
    const fout1 = await upload(HELPER, '20261008-150001');
    check('app: dezelfde versie twee keer geweigerd', fout1.begin.fout === 'VERSIE_BESTAAT_AL');
    const halve = await call('POST /api/uitrol/voorstel/begin', HELPER, { version: '20261008-150002', bytes: 100, sha256: 'b'.repeat(64) });
    check('app: verkeerde offset geweigerd', (await call('POST /api/uitrol/voorstel/stuk', HELPER, { id: halve.data.id, offset: 5, data: Buffer.from('xx').toString('base64') })).fout === 'OFFSET_ONJUIST');
    await call('POST /api/uitrol/voorstel/stuk', HELPER, { id: halve.data.id, offset: 0, data: Buffer.alloc(100, 1).toString('base64') });
    check('app: verkeerde sha256 bij klaar → afgebroken', (await call('POST /api/uitrol/voorstel/klaar', HELPER, { id: halve.data.id })).fout === 'GEEN_GZIP');

    check('app: schakelaar uit → geen challenge', (await call('POST /api/owner/uitrol/voorstel/uitdaging', OWNER, { id: u1.id })).fout === 'PASSKEY_GOEDKEURING_UIT');
    writeFileSync(o.rechten, JSON.stringify({ 'passkey-goedkeuring': true }));
    check('app: nog geen root-passkey → geen challenge', (await call('POST /api/owner/uitrol/voorstel/uitdaging', OWNER, { id: u1.id })).fout === 'GEEN_PASSKEY');

    // Passkey registreren (eigenaar, step-up) → aanmelding in de inbox → root bevestigt via SSH.
    check('app: passkey registreren vraagt step-up', (await call('POST /api/owner/uitrol/passkey/registreren/opties', OWNER)).fout === 'STEP_UP_REQUIRED');
    check('app: niet-eigenaar kan geen passkey registreren', (await call('POST /api/owner/uitrol/passkey/registreren/opties', HELPER)).status === 403);
    stepUp = true;
    const opt = await call('POST /api/owner/uitrol/passkey/registreren/opties', OWNER);
    stepUp = false;
    check('app: registratie-opties: UV required, attestation none, rpId admin', opt.data.publicKey.authenticatorSelection.userVerification === 'required' && opt.data.publicKey.attestation === 'none' && opt.data.publicKey.rp.id === RP);
    const telefoon = nieuwePasskey('es256', 7);
    const reg = await call('POST /api/owner/uitrol/passkey/registreren', OWNER, { uitdagingId: opt.data.uitdagingId, label: 'Telefoon', ...registreer(telefoon, opt.data.publicKey.challenge) });
    check('app: registratie levert vingerafdruk + SSH-opdracht, schrijft alleen een aanmelding (niet het root-bestand)', reg.status === 200 && reg.data.eerste === true && reg.data.sshOpdracht.startsWith('sudo mijn-ruimte-passkey toevoegen ') && JSON.parse(readFileSync(o.sleutels, 'utf8')).sleutels.length === 0 && existsSync(join(o.inbox, `sleutel-aanmelding-${reg.data.vingerafdruk}.json`)));
    check('app: registratie-challenge is eenmalig', (await call('POST /api/owner/uitrol/passkey/registreren', OWNER, { uitdagingId: opt.data.uitdagingId, ...registreer(telefoon, opt.data.publicKey.challenge) })).fout === 'UITDAGING_ONGELDIG');
    check('app: eerste passkey bevestigen met een passkey kan niet (alleen SSH)', (await call('POST /api/owner/uitrol/passkey/toevoegen/opties', OWNER, { vingerafdruk: reg.data.vingerafdruk })).fout === 'EERSTE_VIA_SSH');
    const ssh = hulp(o, 'toevoegen', reg.data.sshOpdracht.split(' ').pop());
    check('bootstrap: root bevestigt de aanmelding met de SSH-opdracht uit de app', ssh.status === 0 && JSON.parse(readFileSync(o.sleutels, 'utf8')).sleutels.length === 1, ssh.stderr);

    // Goedkeuren
    const uit = await call('POST /api/owner/uitrol/voorstel/uitdaging', OWNER, { id: u1.id });
    check('app: challenge gebonden aan voorstel + sha256, UV required, ≤ 5 min', uit.status === 200 && uit.data.publicKey.userVerification === 'required' && uit.data.voorstel.sha256 === shaHex(u1.buf) && uit.data.verloopt - Date.now() <= 300000);
    check('app: agent/voorbereider kan geen challenge vragen', (await call('POST /api/owner/uitrol/voorstel/uitdaging', HELPER, { id: u1.id })).status === 403);
    const vreemd = nieuwePasskey();
    check('app: passkey die niet van de eigenaar is geweigerd', (await call('POST /api/owner/uitrol/voorstel/goedkeuren', OWNER, { id: u1.id, uitdagingId: uit.data.uitdagingId, assertie: bevestig(vreemd, uit.data.publicKey.challenge) })).fout === 'PASSKEY_SLEUTEL_ONBEKEND');
    check('app: challenge na een mislukte poging verbruikt (eenmalig)', (await call('POST /api/owner/uitrol/voorstel/goedkeuren', OWNER, { id: u1.id, uitdagingId: uit.data.uitdagingId, assertie: bevestig(telefoon, uit.data.publicKey.challenge) })).fout === 'UITDAGING_ONGELDIG');
    const u2 = await upload(HELPER, '20261008-150003');
    const uit2 = await call('POST /api/owner/uitrol/voorstel/uitdaging', OWNER, { id: u2.id });
    check('app: assertie voor een ander voorstel geweigerd', (await call('POST /api/owner/uitrol/voorstel/goedkeuren', OWNER, { id: u1.id, uitdagingId: uit2.data.uitdagingId, assertie: bevestig(telefoon, uit2.data.publicKey.challenge) })).fout === 'UITDAGING_ONGELDIG');
    const uit3 = await call('POST /api/owner/uitrol/voorstel/uitdaging', OWNER, { id: u1.id });
    check('app: assertie over een andere challenge (ander pakket) geweigerd', (await call('POST /api/owner/uitrol/voorstel/goedkeuren', OWNER, { id: u1.id, uitdagingId: uit3.data.uitdagingId, assertie: bevestig(telefoon, uit2.data.publicKey.challenge) })).fout === 'PASSKEY_UITDAGING_ONJUIST');
    const uit4 = await call('POST /api/owner/uitrol/voorstel/uitdaging', OWNER, { id: u1.id });
    await sys.query('UPDATE app.goedkeur_uitdagingen SET verloopt_ms = (extract(epoch FROM now()) * 1000)::bigint - 1000 WHERE id = $1', [uit4.data.uitdagingId]);
    check('app: verlopen challenge geweigerd', (await call('POST /api/owner/uitrol/voorstel/goedkeuren', OWNER, { id: u1.id, uitdagingId: uit4.data.uitdagingId, assertie: bevestig(telefoon, uit4.data.publicKey.challenge) })).fout === 'UITDAGING_ONGELDIG');
    const uit5 = await call('POST /api/owner/uitrol/voorstel/uitdaging', OWNER, { id: u1.id });
    check('app: assertie zonder UV geweigerd', (await call('POST /api/owner/uitrol/voorstel/goedkeuren', OWNER, { id: u1.id, uitdagingId: uit5.data.uitdagingId, assertie: bevestig(telefoon, uit5.data.publicKey.challenge, { uv: false }) })).fout === 'PASSKEY_GEEN_VERIFICATIE');
    const uit6 = await call('POST /api/owner/uitrol/voorstel/uitdaging', OWNER, { id: u1.id });
    const ok = await call('POST /api/owner/uitrol/voorstel/goedkeuren', OWNER, { id: u1.id, uitdagingId: uit6.data.uitdagingId, assertie: bevestig(telefoon, uit6.data.publicKey.challenge) });
    const naam = 'mijn-ruimte-20261008-150001.tar.gz';
    check('app: eigenaar keurt goed met de passkey → pakket + .goedkeuring.json + aanvraag in de goedkeur-inbox', ok.status === 200 && ok.data.status === 'goedgekeurd' && existsSync(join(o.inbox, naam)) && existsSync(join(o.inbox, `${naam}.goedkeuring.json`)) && existsSync(join(o.inbox, 'aanvraag')), JSON.stringify(ok.data));
    check('app: goedkeuring staat in de audit', (await sys.query("SELECT 1 FROM app.audit WHERE action = 'uitrol_voorstel_goedgekeurd' AND details->>'voorstel' = $1", [u1.id]).catch(() => ({ rows: [] }))).rows.length === 1);
    const root1 = hulp(o, 'verifieer-goedkeuring', join(o.inbox, naam), join(o.inbox, `${naam}.goedkeuring.json`), '20261008-150001');
    check('end-to-end: root accepteert precies deze goedkeuring van de app', root1.uit?.ok === true, JSON.stringify(root1.uit));
    check('end-to-end: root weigert dezelfde goedkeuring daarna (replay-opslag van root)', hulp(o, 'verifieer-goedkeuring', join(o.inbox, naam), join(o.inbox, `${naam}.goedkeuring.json`), '20261008-150001').uit?.code === 'HERGEBRUIKT');

    // Root meldt de uitkomst → de app neemt de status over.
    writeFileSync(join(o.statusDir, 'status.json'), JSON.stringify({ staat: 'klaar', code: 'OK', versie: '20261008-150001', methode: 'passkey', uk: 'Встановлено', nl: 'Geïnstalleerd', tijd: new Date().toISOString() }));
    const ov = await call('POST /api/owner/uitrol/overzicht', OWNER);
    check('app: overzicht neemt de root-uitkomst over (geinstalleerd)', ov.data.voorstellen.find((v: any) => v.id === u1.id)?.status === 'geinstalleerd' && ov.data.schakelaar === true && ov.data.passkeys.length === 1);
    check('app: afwijzen door de eigenaar', (await call('POST /api/owner/uitrol/voorstel/afwijzen', OWNER, { id: u2.id, reden: 'nee' })).data?.status === 'afgewezen');

    // Agents: alleen voorbereiden en status.
    check('agents: MCP-hulpmiddelen bevatten geen goedkeuren', m.UITROL_TOOLS.every((t) => !m.isGoedkeurPoging(t.name)) && m.UITROL_TOOLS.length === 5);
    let geweigerd = '';
    try { await m.voerUitrolToolUit([{ soort: 'account', id: HELPER, accountId: HELPER }], 'uitrol_voorstel_goedkeuren', { id: u1.id }); } catch (e) { geweigerd = (e as { code?: string }).code || ''; }
    check('agents: "uitrol_voorstel_goedkeuren" geweigerd (ALLEEN_EIGENAAR_MET_PASSKEY)', geweigerd === 'ALLEEN_EIGENAAR_MET_PASSKEY');
    const tok = (await sys.query("INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash) VALUES ($1, 'robot', 'tvh_test', $2) RETURNING id", [ANDER, shaHex(randomUUID())])).rows[0].id;
    const tokOnderwerp = [{ soort: 'agenttoken' as const, id: String(tok), accountId: ANDER }];
    check('agents: token zonder grant ziet de hulpmiddelen niet', !(await m.heeftVoorbereiderGrant(tokOnderwerp)));
    stepUp = true;
    const tg = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'agenttoken', onderwerp: String(tok), dagen: 1 });
    stepUp = false;
    check('agents: grant voor één agenttoken', tg.status === 200 && await m.heeftVoorbereiderGrant(tokOnderwerp) && !(await m.heeftVoorbereiderGrant([{ soort: 'account', id: ANDER, accountId: ANDER }])));
    const st = await m.voerUitrolToolUit(tokOnderwerp, 'uitrol_voorstel_status', {}) as { voorstellen: unknown[] };
    check('agents: status lezen met grant', Array.isArray(st.voorstellen));
    await sys.query("UPDATE app.records SET data = data || '{\"status\":\"blocked\"}'::jsonb WHERE tbl = 'users' AND id = $1", [ANDER]);
    check('agents: geblokkeerd account → grant werkt niet meer', !(await m.heeftVoorbereiderGrant(tokOnderwerp)));

    // Intrekken en verlopen
    const loopt = await call('POST /api/uitrol/voorstel/begin', HELPER, { version: '20261008-150004', bytes: 100, sha256: 'c'.repeat(64) });
    check('app: grant intrekken (audit) stopt lopende uploads', (await call('POST /api/owner/uitrol/voorbereiders/intrekken', OWNER, { id: g.data.voorbereider.id })).data?.voorbereider?.status === 'ingetrokken'
      && (await sys.query('SELECT status FROM app.uitrol_voorstellen WHERE id = $1', [loopt.data.id])).rows[0].status === 'afgebroken');
    check('app: ingetrokken grant → voorbereiden geweigerd', (await call('POST /api/uitrol/voorstel/begin', HELPER, { version: '20261008-150005', bytes: 10, sha256: 'd'.repeat(64) })).fout === 'GEEN_VOORBEREIDER_GRANT');
    stepUp = true;
    const g2 = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'account', onderwerp: HELPER, dagen: 1 });
    stepUp = false;
    await sys.query("UPDATE app.uitrol_voorbereiders SET gegeven_op = now() - interval '2 days', verloopt_op = now() - interval '1 second' WHERE id = $1", [g2.data.voorbereider.id]);
    check('app: verlopen grant → voorbereiden geweigerd', (await call('POST /api/uitrol/voorstel/begin', HELPER, { version: '20261008-150006', bytes: 10, sha256: 'e'.repeat(64) })).fout === 'GEEN_VOORBEREIDER_GRANT');

    // Passkey verwijderen met een passkey (eigenaar); root doet het pas bij verwerk.
    const vo = await call('POST /api/owner/uitrol/passkey/verwijderen/opties', OWNER, { vingerafdruk: reg.data.vingerafdruk });
    const vz = await call('POST /api/owner/uitrol/passkey/verwijderen', OWNER, { uitdagingId: vo.data.uitdagingId, assertie: bevestig(telefoon, vo.data.publicKey.challenge) });
    check('app: verwijderverzoek met passkey → alleen een verzoek in de inbox (root beslist)', vz.status === 200 && JSON.parse(readFileSync(o.sleutels, 'utf8')).sleutels.length === 1 && existsSync(join(o.inbox, 'sleutel-aanvraag')));
    hulp(o, 'verwerk');
    check('root: verwerkt het verwijderverzoek van de app', JSON.parse(readFileSync(o.sleutels, 'utf8')).sleutels.length === 0);

    // Database: de app-rol kan niet bij de nieuwe tabellen.
    let appRol = 'open';
    try { await getPool('app').query('SELECT * FROM app.uitrol_voorstellen LIMIT 1'); } catch { appRol = 'dicht'; }
    check('db: mijnruimte_app heeft geen toegang tot de uitrol-tabellen', appRol === 'dicht');
    let lang = 'ok';
    try { await sys.query("INSERT INTO app.goedkeur_uitdagingen (user_id, doel, onderwerp, nonce, uitdaging, verloopt_ms) VALUES ('x', 'goedkeuren', 'x', $1, 'x', (extract(epoch FROM now()) * 1000)::bigint + 3600000)", [nonce()]); } catch { lang = 'geweigerd'; }
    check('db: challenge langer dan ~5 min geldig kan niet (CHECK)', lang === 'geweigerd');
  } finally {
    await sys.query("DELETE FROM app.uitrol_voorstellen WHERE versie LIKE '20261008-15%'");
    await sys.query('DELETE FROM app.uitrol_voorbereiders WHERE account_id = ANY($1)', [Object.keys(users)]);
    await sys.query('DELETE FROM app.goedkeur_uitdagingen WHERE user_id = ANY($1)', [Object.keys(users)]);
    await sys.query('DELETE FROM app.mcp_console_tokens WHERE user_id = ANY($1)', [Object.keys(users)]);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [Object.keys(users)]);
    const herstel = (k: string, v?: string) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    herstel('UITROL_VOORSTEL_DIR', oud.a); herstel('GOEDKEUR_INBOX', oud.b); herstel('GOEDKEUR_SLEUTELS', oud.c); herstel('MCP_RECHTEN_PAD', oud.d); herstel('OPDRACHT_STATUS_DIR', oud.e);
  }
}

// ------------------------------------------------------------------------------------------------ E. plafond (statisch)
function plafondTests(check: Check) {
  const app = readFileSync('backend/uitrol-goedkeuring.ts', 'utf8');
  const hulpSrc = readFileSync(HULP, 'utf8');
  const uitrol = readFileSync(UITROL, 'utf8');
  const inst = readFileSync('deploy/installeer-app.sh', 'utf8');
  check('plafond: de app schrijft het root-sleutelbestand nooit (alleen lezen)', /readFile\(sleutelsPad\(\)/.test(app) && !/(writeFile|rename|copyFile|rm|unlink)\(sleutelsPad\(\)/.test(app));
  check('plafond: de app heeft geen goedkeur-tool voor agents', !/name: 'uitrol_[a-z_]*goedkeur/.test(app));
  check('plafond: root-hulp gebruikt alleen node-ingebouwde modules + de kern', [...hulpSrc.matchAll(/from "([^"]+)"/g)].every((x) => x[1].startsWith('node:') || x[1] === './webauthn-kern.mjs'));
  check('plafond: root-hulp neemt paden uit de omgeving alleen over als niet-root', /const omg = \(naam, standaard\) => \(!IS_ROOT && process\.env\[naam\]\)/.test(hulpSrc));
  check('plafond: uitrol --goedkeuring controleert de passkey vóór het uitpakken/installeren', uitrol.indexOf('verifieer-goedkeuring') > 0 && uitrol.lastIndexOf('verifieer-goedkeuring') < uitrol.indexOf('tarfile.open') && uitrol.lastIndexOf('verifieer-goedkeuring') < uitrol.indexOf('cmd=( "$INSTALLEER"') && /unset [^\n]*UITROL_GOEDKEUR_HULP/.test(uitrol.replace(/\\\n\s*/g, ' ')));
  check('plafond: installer zet de root-hulp uit het pakket ($doel), root-eigendom, en maakt de schakelaar standaard uit', /install -m 0644 -o root -g root "\$doel\/deploy\/goedkeuring\/webauthn-kern\.mjs"/.test(inst) && /"passkey-goedkeuring": false/.test(inst));
  check('plafond: wrapper wist de omgeving en vergrendelt', /env -i PATH=\/usr\/bin:\/bin/.test(readFileSync('deploy/goedkeuring/mijn-ruimte-passkey.sh', 'utf8')) && /flock/.test(readFileSync('deploy/goedkeuring/mijn-ruimte-passkey.sh', 'utf8')));
  const ui = readFileSync('src/AdminUitrolView.tsx', 'utf8');
  check('ui: tekstpaar per melding (tr(lang, uk, nl)) en userVerification required', /userVerification:'required'/.test(ui) && (ui.match(/tr\(lang,/g) || []).length > 40);
}

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-goedkeuring');
  const basis = mkdtempSync(join(tmpdir(), 'goedkeuring-test-'));
  try {
    kernTests(check);
    rootTests(basis, check);
    if (spawnSync('python3', ['-V']).error || spawnSync('flock', ['-V']).error) console.log('overgeslagen: python3/flock ontbreekt (uitrol-script)');
    else uitrolTests(basis, check);
    await appTests(basis, check);
    plafondTests(check);
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err));
  } finally {
    rmSync(basis, { recursive: true, force: true });
    await closePool().catch(() => undefined);
  }
  return einde();
}
