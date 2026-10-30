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
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-toegangssleutel';
import { checker } from './hulp/nep-google';

const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');
const UITROL = resolve('deploy/uitrol/mijn-ruimte-uitrol.sh');
const RP = 'tarasevych.com'; const ORIGIN = 'https://admin.tarasevych.com';
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
  // §13.10: recht intrekken via de app (zonder assertie, met reden) → root onthoudt het; terug alleen via SSH.
  const intrek = (fp: string, extra: Record<string, unknown> = {}) => {
    writeFileSync(join(o.inbox, `sleutel-intrekken-${fp.slice(0, 32)}.json`), JSON.stringify({ doel: 'sleutel-intrekken', vingerafdruk: fp, reden: 'Telefoon verloren in de trein', door: 'eigenaar@test', sessie: 'abcd1234', wijziging: '00000000-0000-4000-8000-000000000001', ...extra }));
    hulp(o, 'verwerk');
    return JSON.parse(readFileSync(join(o.statusDir, 'goedkeur-sleutels.json'), 'utf8')).code as string;
  };
  const s1 = { ...eerste, label: 'telefoon' } as typeof s2;
  check('root: sleutel weer toevoegen met assertie (nooit via de app ingetrokken) mag', verzoek('sleutel-toevoegen', s1.vingerafdruk, tweede, { nieuw: s1 }) === 'OK' && leesSleutels(o).length === 2);
  check('root: intrekken zonder (lange genoeg) reden geweigerd', intrek(s1.vingerafdruk, { reden: 'kort' }) === 'REDEN_ONGELDIG' && leesSleutels(o).length === 2);
  check('root: intrekken van een onbekende sleutel → NIET_GEVONDEN', intrek(nepFp) === 'NIET_GEVONDEN' && leesSleutels(o).length === 2);
  const gebeurtenissenVoor = readFileSync(join(o.statusDir, 'gebeurtenissen.jsonl'), 'utf8').split('\n').filter(Boolean).length;
  check('root: intrekken via de app (zonder assertie) haalt precies die sleutel weg', intrek(s1.vingerafdruk) === 'OK' && leesSleutels(o).length === 1 && leesSleutels(o)[0].vingerafdruk === s2.vingerafdruk);
  const staat1 = JSON.parse(readFileSync(join(o.env.GOEDKEUR_STAAT!, 'staat.json'), 'utf8'));
  check('root: onthoudt wie/waarom (staat.ingetrokken) en meldt PASSKEY_INGETROKKEN', staat1.ingetrokken?.[s1.vingerafdruk]?.reden === 'Telefoon verloren in de trein' && staat1.ingetrokken[s1.vingerafdruk].sessie === 'abcd1234'
    && readFileSync(join(o.statusDir, 'gebeurtenissen.jsonl'), 'utf8').split('\n').filter(Boolean).slice(gebeurtenissenVoor).some((l) => JSON.parse(l).code === 'PASSKEY_INGETROKKEN'));
  check('root: via de app ingetrokken sleutel komt NIET terug met een assertie (OPNIEUW_VIA_SSH)', verzoek('sleutel-toevoegen', s1.vingerafdruk, tweede, { nieuw: s1 }) === 'OPNIEUW_VIA_SSH' && leesSleutels(o).length === 1);
  check('root: intrekverzoek wordt na verwerking verwijderd', !readdirSync(o.inbox).some((n) => n.startsWith('sleutel-intrekken-')));
  check('root: SSH «toevoegen» zet hem terug en wist de markering', (() => {
    writeFileSync(join(o.inbox, `sleutel-aanmelding-${s1.vingerafdruk}.json`), JSON.stringify({ credentialId: s1.credentialId, alg: s1.alg, jwk: s1.jwk, label: 'telefoon', aangemaakt: new Date().toISOString() }));
    const ok = hulp(o, 'toevoegen', s1.vingerafdruk.slice(0, 20)).status === 0 && leesSleutels(o).length === 2;
    const st = JSON.parse(readFileSync(join(o.env.GOEDKEUR_STAAT!, 'staat.json'), 'utf8'));
    return ok && !st.ingetrokken?.[s1.vingerafdruk];
  })());
  check('root: (opruimen) telefoon weer weg met de andere passkey', verzoek('sleutel-verwijderen', s1.vingerafdruk, tweede, { vingerafdruk: s1.vingerafdruk }) === 'OK' && leesSleutels(o).length === 1);
  check('root: verwijderde sleutel kan niet meer goedkeuren', hulp(o, 'verifieer-goedkeuring', pakket, goedkeuringBestand(o, eigenaar, pakket, versie), versie).uit?.code === 'SLEUTEL_ONBEKEND');
  check('root: alles-intrekken via SSH', hulp(o, 'alles-intrekken').status === 0 && leesSleutels(o).length === 0 && hulp(o, 'verifieer-goedkeuring', pakket, goedkeuringBestand(o, tweede, pakket, versie), versie).uit?.code === 'GEEN_SLEUTELS');
  check('root: verwijderen via SSH', (() => { zetSleutels(o, [s2]); return hulp(o, 'verwijderen', s2.vingerafdruk.slice(0, 20)).status === 0 && leesSleutels(o).length === 0; })());
  check('root: staat (nonces) staat buiten de app (0600)', (Number(readFileSync(join(o.env.GOEDKEUR_STAAT!, 'staat.json')).length) > 0) && ((spawnSync('stat', ['-c', '%a', join(o.env.GOEDKEUR_STAAT!, 'staat.json')], { encoding: 'utf8' }).stdout.trim()) === '600'));
}

// ------------------------------------------------------------------------------------------------ C. mijn-ruimte-uitrol --goedkeuring
function pakketMaken(werk: string, versie: string, volledig = false, zonder = '') {
  const top = join(werk, `bron-${versie}-${randomBytes(3).toString('hex')}`);
  const binnen = join(top, `mijn-ruimte-${versie}`);
  mkdirSync(join(binnen, 'deploy'), { recursive: true });
  writeFileSync(join(binnen, 'UITROL-VERSIE'), `${versie}\n`);
  // Verplichte release-metadata (regel van 15 oktober): zonder AUTEUR/AGENT/SAMENVATTING weigert root het pakket (GEEN_AUTEUR…).
  writeFileSync(join(binnen, 'AUTEUR'), 'Test Auteur\n');
  writeFileSync(join(binnen, 'AGENT'), 'claude\n');
  writeFileSync(join(binnen, 'SAMENVATTING'), 'Testpakket voor de uitrol: wat en waarom, wat was en wat er bijkwam.\n');
  // Regel 3 (audit 18.10.2026): zonder geldige BRON-COMMIT (40 hex of «zonder-git:<reden>») weigert root (GEEN_BRON_COMMIT).
  writeFileSync(join(binnen, 'BRON-COMMIT'), `${createHash('sha1').update(versie).digest('hex')}\n`);
  writeFileSync(join(binnen, 'deploy/installeer-app.sh'), '#!/bin/bash\necho "ECHTE INSTALLER MAG IN DE TEST NIET DRAAIEN"; exit 99\n');
  if (volledig) {
    // Wat de voorcontrole van de site (backend/uitrol-voorcontrole.ts) minimaal verwacht om een pakket door te laten.
    for (const [f, inh] of Object.entries({ 'package.json': '{"scripts":{"build":"vite build"}}', 'package-lock.json': '{}', 'index.html': '<html></html>', 'vite.config.ts': 'export default {}',
      'server/migrate.ts': '//', 'scripts/build-server.mjs': '//', 'backend/index.ts': '//' })) { mkdirSync(join(binnen, f, '..'), { recursive: true }); writeFileSync(join(binnen, f), inh); }
  }
  if (zonder) rmSync(join(binnen, zonder), { force: true });
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
  writeFileSync(stub, `#!/bin/bash\necho "$1 $2" >> "${spoor}"\ncat "$2/UITROL-VERSIE" >> "${spoor}"\necho "stub-installatieregel voor $1"\necho "wachtwoord=GEHEIM-NIET-TONEN"\nsleep 3\n`); chmodSync(stub, 0o755);
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
  check('uitrol --goedkeuring: installatielogboek gepubliceerd in de statusmap (groep-leesbaar, geheimen gemaskeerd)', (() => {
    const lp = join(statusMap, 'installeer.log'); if (!existsSync(lp)) return false;
    const t = readFileSync(lp, 'utf8'); return /stub-installatieregel/.test(t) && !/GEHEIM-NIET-TONEN/.test(t) && /\*\*\*/.test(t);
  })(), existsSync(join(statusMap, 'installeer.log')) ? readFileSync(join(statusMap, 'installeer.log'), 'utf8') : 'geen installeer.log');
  check('uitrol --goedkeuring: gebeurtenissen GOEDGEKEURD + OK (bron uitrol, herkomst passkey)', (() => { const l = readFileSync(join(statusMap, 'gebeurtenissen.jsonl'), 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x)); return l.some((e) => e.code === 'GOEDGEKEURD' && e.herkomst === 'passkey') && l.some((e) => e.bron === 'uitrol' && e.code === 'OK' && e.herkomst === 'passkey'); })());
  const stappenAlle = readFileSync(join(statusMap, 'stappen.jsonl'), 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x));
  const stappenRun = stappenAlle.filter((x) => x.versie === '20261008-140002');
  check('uitrol --goedkeuring: stappen.jsonl toont ontvangen → kopie → echtheid → inhoud → installeren → klaar (allemaal ok, zelfde run-id)',
    ['ontvangen', 'kopie', 'echtheid', 'inhoud', 'installeren', 'klaar'].every((id) => stappenRun.some((x) => x.stap === id && x.staat === 'ok')) && new Set(stappenRun.map((x) => x.run)).size === 1 && stappenRun.every((x) => x.methode === 'passkey' && /^\d{8}T\d{6}Z-[0-9a-f]{8}$/.test(x.run)), JSON.stringify(stappenRun.map((x) => `${x.stap}:${x.staat}`)));
  const runLogPad = join(statusMap, 'runs', `${stappenRun[0]?.run}.log`);
  const runLog = existsSync(runLogPad) ? readFileSync(runLogPad, 'utf8') : '';
  check('uitrol --goedkeuring: runs/<run>.log bevat de controles én de installatie, geheimen gemaskeerd', /passkey-goedkeuring geldig/.test(runLog) && /stub-installatieregel/.test(runLog) && /klaar: 20261008-140002/.test(runLog) && !/GEHEIM-NIET-TONEN/.test(runLog), runLog.slice(0, 400));
  check('uitrol --goedkeuring: een geweigerd pakket krijgt ook een run met de stap waar het stokte (echtheid → fout)', stappenAlle.some((x) => x.versie === '20261008-140001' && x.stap === 'echtheid' && x.staat === 'fout'));
  check('uitrol --goedkeuring: een pakket zonder goedkeuringsbestand stokt in de eerste stap (ontvangen → fout) en is toch zichtbaar', stappenAlle.some((x) => x.versie === '20261008-140000' && x.stap === 'ontvangen' && x.staat === 'fout'));
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
  // De voorcontrole vergelijkt met de actieve versie (releaseInfo): een eigen, oude release in een tijdelijke map.
  { const rel = join(o.dir, 'actieve-release'); mkdirSync(join(rel, 'dist'), { recursive: true }); writeFileSync(join(rel, 'UITROL-VERSIE'), '20200101-000000\n'); process.env.DIST_DIR = join(rel, 'dist'); (await import('../../backend/uitgave-info'))._resetReleaseInfo(); }
  const OWNER = `ug-owner-${randomUUID()}`, HELPER = `ug-helper-${randomUUID()}`, ANDER = `ug-ander-${randomUUID()}`, NEPEIGENAAR = `ug-nep-${randomUUID()}`;
  const users: Record<string, any> = {
    [OWNER]: { id: OWNER, role: 'owner', status: 'approved', email: process.env.OWNER_EMAIL || 'eigenaar@test.invalid' },
    [HELPER]: { id: HELPER, role: 'user', status: 'approved', email: `h-${HELPER}@example.test` },
    [ANDER]: { id: ANDER, role: 'user', status: 'approved', email: `a-${ANDER}@example.test` },
    [NEPEIGENAAR]: { id: NEPEIGENAAR, role: 'owner', status: 'approved', email: `nep-${NEPEIGENAAR}@example.test` },
  };
  for (const u of Object.values(users)) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [u.id, { email: u.role === 'owner' ? `${u.id}@example.test` : u.email, role: u.role === 'owner' ? 'member' : u.role, status: u.status }]); // één eigenaar per database (records_een_eigenaar) en OWNER_EMAIL niet bezetten (aanmelden-test); de sessie-mock geeft rol + e-mail
  let stepUp = false;
  let sterk = false; // «sterke» step-up (passkey/TOTP/herstelcode) — §13.10
  const sterkMock = async () => (sterk ? null : { statusCode: 403, headers: {}, body: JSON.stringify({ error: stepUp ? 'STEP_UP_STRONG_REQUIRED' : 'STEP_UP_REQUIRED' }) } as any);
  let pcall: (route: string, who: string, body?: Record<string, unknown>, extra?: Record<string, unknown>) => Promise<{ status: number; data: any; fout: string }> = async () => ({ status: 0, data: null, fout: '' });
  let passkeyId = '';
  let tcall: typeof pcall = async () => ({ status: 0, data: null, fout: '' });
  const routes = m.uitrolGoedkeuringRoutes({ requireSession: async (event: any) => ({ user: users[event.who], service: event.service ?? 'admin' }) as any,
    stepUp: async () => (stepUp ? null : { statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_REQUIRED' }) } as any), sterkeStapOp: sterkMock });
  const call = async (route: string, who: string, body: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const res: any = await routes[route][0]({ event: { who, headers: {}, ...extra }, body } as any);
    let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
    return { status: res.statusCode as number, data, fout: String(data?.error || data?.reasonCode || '') };
  };
  const upload = async (who: string, versie: string, chunk = 3000, zonder = '') => {
    const p = pakketMaken(o.dir, versie, true, zonder); const buf = readFileSync(p);
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
    const gs = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'account', onderwerp: HELPER, dagen: 3 });
    check('app: grant geven vraagt step-up', gs.fout === 'STEP_UP_REQUIRED', JSON.stringify(gs));
    stepUp = true;
    check('app: grant langer dan 30 dagen geweigerd', (await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'account', onderwerp: HELPER, dagen: 31 })).fout === 'DUUR_ONGELDIG');
    const g = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'account', onderwerp: HELPER, dagen: 3 });
    stepUp = false;
    check('app: grant gegeven (account, 3 dagen)', g.status === 200 && g.data.voorbereider.status === 'actief');
    const auditGrant = (await sys.query("SELECT 1 FROM app.audit WHERE action = 'uitrol_voorbereider_gegeven' AND details->>'onderwerp' = $1", [HELPER]).catch(() => ({ rows: [] }))).rows.length;
    check('app: grant staat in de audit', auditGrant === 1);

    const u1 = await upload(HELPER, '20261008-150001');
    check('app: voorbereider uploadt in stukken → wacht-op-goedkeuring', u1.klaar?.data?.status === 'wacht-op-goedkeuring', JSON.stringify(u1.begin.data) + JSON.stringify(u1.klaar?.data));
    check('app: voorcontrole bij «klaar» is opgeslagen en meegegeven (tien controles incl. commit en — sinds UI-010 — manifest, ok)', u1.klaar?.data?.voorcontrole?.ok === true && u1.klaar.data.voorcontrole.controles.length === 10 && u1.klaar.data.voorcontrole.controles.some((c: any) => c.id === 'manifest') && u1.klaar.data.voorcontrole.controles.some((c: any) => c.id === 'commit' && c.niveau === 'ok'), JSON.stringify(u1.klaar?.data?.voorcontrole?.controles?.map((c: any) => c.id + ':' + c.niveau)));
    { const slecht = await upload(HELPER, '20261008-150050', 3000, 'SAMENVATTING');
      check('app: pakket zonder SAMENVATTING (geen beschrijving) → afgebroken met VOORCONTROLE_MISLUKT en uitleg, nooit goedkeurbaar',
        slecht.klaar?.data?.status === 'afgebroken' && slecht.klaar.data.code === 'VOORCONTROLE_MISLUKT' && slecht.klaar.data.voorcontrole.controles.some((c: any) => c.id === 'metadata' && c.niveau === 'fout'), JSON.stringify(slecht.klaar?.data));
      { const g = await call('POST /api/owner/uitrol/voorstel/goedkeuren', OWNER, { id: slecht.id, uitdagingId: randomUUID(), assertie: {} }); check('app: afgebroken pakket kan niet worden goedgekeurd', g.status >= 400, JSON.stringify(g)); } }
    { const ov = await call('POST /api/owner/uitrol/overzicht', OWNER); const v1 = ov.data?.voorstellen?.find((x: any) => x.id === u1.id);
      check('app: beschrijving komt uit SAMENVATTING in het pakket (niet uit wat de voorbereider opgaf)', /Testpakket voor de uitrol/.test(v1?.wijzigingen || '') && v1?.pakketMeta?.agent === 'claude' && v1?.pakketMeta?.auteur === 'Test Auteur', JSON.stringify(v1?.pakketMeta)); }
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

    // Passkey toevoegen in «Способи входу» (backend/toegangssleutels.ts), dan «Може схвалювати оновлення сервера» → aanmelding → root via SSH.
    const pkm = await import('../../backend/toegangssleutels');
    const sessieMock = async (event: any) => ({ user: users[event.who], service: event.service ?? 'identity', session: { id: event.sessie ?? `sessie-${event.who}`, createdAt: Date.now() } }) as any;
    const pr = pkm.passkeyRoutes({ requireSession: sessieMock,
      stepUp: async () => (stepUp ? null : { statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_REQUIRED' }) } as any), sterkeStapOp: sterkMock });
    const tr = (await import('../../backend/toegang-routes')).toegangRoutes({ requireSession: sessieMock, sterkeStapOp: sterkMock });
    tcall = async (route: string, who: string, body: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
      const res: any = await tr[route][0]({ event: { who, headers: {}, ...extra }, body } as any);
      let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
      return { status: res.statusCode as number, data, fout: String(data?.error || data?.reasonCode || '') };
    };
    pcall = async (route: string, who: string, body: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
      const res: any = await pr[route][0]({ event: { who, headers: {}, ...extra }, body } as any);
      let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
      return { status: res.statusCode as number, data, fout: String(data?.error || data?.reasonCode || '') };
    };
    check('app: passkey toevoegen vraagt step-up', (await pcall('POST /api/owner/access/passkeys/registreren/opties', OWNER)).fout === 'STEP_UP_REQUIRED');
    stepUp = true;
    const opt = await pcall('POST /api/owner/access/passkeys/registreren/opties', OWNER);
    const telefoon = nieuwePasskey('es256', 7);
    const reg = await pcall('POST /api/owner/access/passkeys/registreren', OWNER, { uitdagingId: opt.data.uitdagingId, naam: 'Telefoon', ...registreer(telefoon, opt.data.publicKey.challenge) });
    passkeyId = String(reg.data?.passkey?.id || '');
    check('app: registratie-opties: UV required, attestation none, rpId tarasevych.com', opt.data.publicKey.authenticatorSelection.userVerification === 'required' && opt.data.publicKey.attestation === 'none' && opt.data.publicKey.rp.id === RP);
    check('app: nieuwe passkey van de eigenaar is eerst «Лише вхід» (geen aanmelding bij root)', reg.status === 200 && reg.data.passkey.goedkeuring === 'alleen-aanmelden' && !readdirSync(o.inbox).some((f) => f.startsWith('sleutel-aanmelding-')), JSON.stringify(reg.data));
    check('app: niet-eigenaar kan het recht om goed te keuren niet aanvragen', (await pcall('POST /api/owner/access/passkeys/goedkeuring/aanvragen', HELPER, { id: passkeyId })).fout === 'OWNER_REQUIRED');
    check('app: eigenaar op hub mag het recht niet aanvragen (alleen id/admin)', (await pcall('POST /api/owner/access/passkeys/goedkeuring/aanvragen', OWNER, { id: passkeyId }, { service: 'hub' })).fout === 'OWNER_REQUIRED');
    const aan = await pcall('POST /api/owner/access/passkeys/goedkeuring/aanvragen', OWNER, { id: passkeyId });
    stepUp = false;
    const aanmelding = readdirSync(o.inbox).find((f) => f.startsWith('sleutel-aanmelding-')) || '';
    const fp = aanmelding.replace(/^sleutel-aanmelding-|\.json$/g, '');
    check('app: aanvragen schrijft alleen een aanmelding + SSH-opdracht (niet het root-bestand)', aan.status === 200 && aan.data.eerste === true && String(aan.data.sshOpdracht).startsWith('sudo mijn-ruimte-passkey toevoegen ') && JSON.parse(readFileSync(o.sleutels, 'utf8')).sleutels.length === 0 && /^[0-9a-f]{64}$/.test(fp), JSON.stringify(aan.data));
    const l1 = await pcall('POST /api/owner/access/passkeys/lijst', OWNER);
    check('app: status «Чекає підтвердження сервером» met SSH-opdracht', l1.data.passkeys[0]?.goedkeuring === 'wacht' && !!l1.data.passkeys[0]?.sshOpdracht && l1.data.goedkeuring.rpKlopt === true);
    check('app: eerste passkey bevestigen met een passkey kan niet (alleen SSH)', (await pcall('POST /api/owner/access/passkeys/goedkeuring/bevestigen/opties', OWNER, { id: passkeyId })).fout === 'EERSTE_VIA_SSH');
    const ssh = hulp(o, 'toevoegen', aan.data.sshOpdracht.split(' ').pop());
    check('bootstrap: root bevestigt de aanmelding met de SSH-opdracht uit de app', ssh.status === 0 && JSON.parse(readFileSync(o.sleutels, 'utf8')).sleutels.length === 1, ssh.stderr);
    check('app: status daarna «Може схвалювати оновлення»', (await pcall('POST /api/owner/access/passkeys/lijst', OWNER)).data.passkeys[0]?.goedkeuring === 'kan-goedkeuren');

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
    writeFileSync(join(o.statusDir, 'gebeurtenissen.jsonl'), [
      { id: '20261013T190000123456Z-aaaa1111', tijd: '2026-10-13T19:00:00.000Z', bron: 'uitrol', code: 'OK', niveau: 'info', uk: 'підпис', nl: 'handtekening', tag: '20261008-150001', herkomst: 'handtekening' },
      { id: '20261013T190100123456Z-bbbb2222', tijd: '2026-10-13T19:01:00.000Z', bron: 'uitrol', code: 'SSH_OK', niveau: 'info', uk: 'з SSH', nl: 'via SSH', tag: '20261013-220754', herkomst: 'ssh', wie: 'beheer', pakket: '20261008-150001', release: '20261013-220754', commit: 'abcdef1234567890', adres: '10.77.0.5' },
      { id: '20261013T190200123456Z-cccc3333', tijd: '2026-10-13T19:02:00.000Z', bron: 'uitrol', code: 'OK', niveau: 'info', uk: 'passkey', nl: 'passkey', tag: '20261008-150001', herkomst: 'passkey' },
      { id: 'slecht', bron: 'uitrol', code: 'SSH_OK' },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n');
    const ov = await call('POST /api/owner/uitrol/overzicht', OWNER);
    check('app: overzicht neemt de root-uitkomst over (geinstalleerd)', ov.data.voorstellen.find((v: any) => v.id === u1.id)?.status === 'geinstalleerd' && ov.data.schakelaar === true && ov.data.passkeys.length === 1);
    check('app: SSH-regel staat in de geschiedenis; passkey en al geïnstalleerde handtekening niet dubbel', ov.data.installaties?.length === 1 && ov.data.installaties[0].code === 'SSH_OK' && ov.data.installaties[0].wie === 'beheer' && ov.data.installaties[0].release === '20261013-220754' && ov.data.installaties[0].adres === '10.77.0.5');
    writeFileSync(join(o.statusDir, 'status.json'), JSON.stringify({ staat: 'klaar', code: 'SSH_OK', versie: '20261008-150003', methode: 'ssh', uk: 'з SSH', nl: 'via SSH', tijd: new Date().toISOString() }));
    const ovSsh = await call('POST /api/owner/uitrol/overzicht', OWNER);
    check('app: status.json met methode ssh installeert geen wachtend voorstel', ovSsh.data.voorstellen.find((v: any) => v.id === u2.id)?.status === 'wacht-op-goedkeuring' && ovSsh.data.voorstellen.find((v: any) => v.id === u1.id)?.status === 'geinstalleerd');
    check('app: afwijzen door de eigenaar', (await call('POST /api/owner/uitrol/voorstel/afwijzen', OWNER, { id: u2.id, reden: 'nee' })).data?.status === 'afgewezen');

    // Agents: alleen voorbereiden en status.
    check('agents: MCP-hulpmiddelen bevatten geen goedkeuren', m.UITROL_TOOLS.every((t) => !m.isGoedkeurPoging(t.name)) && m.UITROL_TOOLS.length === 5);
    let geweigerd = '';
    try { await m.voerUitrolToolUit([{ soort: 'account', id: HELPER, accountId: HELPER }], 'uitrol_voorstel_goedkeuren', { id: u1.id }); } catch (e) { geweigerd = (e as { code?: string }).code || ''; }
    check('agents: "uitrol_voorstel_goedkeuren" geweigerd (ALLEEN_EIGENAAR_MET_PASSKEY)', geweigerd === 'ALLEEN_EIGENAAR_MET_PASSKEY');
    const tok = (await sys.query("INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, ruimte) VALUES ($1, 'robot', 'tvh_test', $2, 'technisch') RETURNING id", [ANDER, shaHex(randomUUID())])).rows[0].id;
    const tokOnderwerp = [{ soort: 'agenttoken' as const, id: String(tok), accountId: ANDER }];
    check('agents: token zonder grant ziet de hulpmiddelen niet', !(await m.heeftVoorbereiderGrant(tokOnderwerp)));
    stepUp = true;
    const tg = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'agenttoken', onderwerp: String(tok), dagen: 1 });
    stepUp = false;
    check('agents: grant voor één agenttoken', tg.status === 200 && await m.heeftVoorbereiderGrant(tokOnderwerp) && !(await m.heeftVoorbereiderGrant([{ soort: 'account', id: ANDER, accountId: ANDER }])));
    const st = await m.voerUitrolToolUit(tokOnderwerp, 'uitrol_voorstel_status', {}) as { voorstellen: unknown[] };
    check('agents: status lezen met grant', Array.isArray(st.voorstellen));
    // Grant per AGENT: blijft gelden voor elke (nieuwe) koppeling van die agent van dit account; andere agent/ander account niet.
    const agOnd = (slug: string, acc: string) => [{ soort: 'agent' as const, id: slug, accountId: acc }];
    check('agent-grant: zonder grant geen toegang', !(await m.heeftVoorbereiderGrant(agOnd('claude', OWNER))));
    stepUp = true;
    const ag = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'agent', onderwerp: 'claude', dagen: 7 });
    const agFout = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'agent', onderwerp: 'onbekende-ai', dagen: 7 });
    stepUp = false;
    check('agent-grant: gegeven voor "claude" (7 dagen)', ag.status === 200 && ag.data.voorbereider.soort === 'agent' && ag.data.voorbereider.label === 'Claude', JSON.stringify(ag.data));
    check('agent-grant: onbekende agent geweigerd', agFout.status === 404 || agFout.fout === 'ONDERWERP_ONBEKEND', JSON.stringify(agFout));
    check('agent-grant: geldt voor claude van de eigenaar', await m.heeftVoorbereiderGrant(agOnd('claude', OWNER)));
    check('agent-grant: geldt NIET voor gpt, en niet voor claude van een ander account', !(await m.heeftVoorbereiderGrant(agOnd('gpt', OWNER))) && !(await m.heeftVoorbereiderGrant(agOnd('claude', ANDER))));
    const ovAg = await call('POST /api/owner/uitrol/overzicht', OWNER, {});
    check('agent-grant: overzicht biedt agents als kandidaten', Array.isArray(ovAg.data?.kandidaten?.agents) && ovAg.data.kandidaten.agents.some((a: { id: string }) => a.id === 'claude'));
    // De lijst «Хто готує оновлення» toont naam + foto van het account (alleen Google-/data-afbeeldingen; niets anders wordt doorgegeven).
    await sys.query("UPDATE app.records SET data = data || $2::jsonb WHERE tbl = 'users' AND id = $1", [OWNER, JSON.stringify({ name: 'Тест Власник', picture: 'https://lh3.googleusercontent.com/a/test=s96-c' })]);
    const ovFoto = await call('POST /api/owner/uitrol/overzicht', OWNER, {});
    const grFoto = (ovFoto.data?.voorbereiders || []).find((g: { id: string }) => g.id === ag.data.voorbereider.id);
    check('grants: kaart krijgt naam en foto van het account', grFoto?.eigenaar?.naam === 'Тест Власник' && String(grFoto.eigenaar.foto).startsWith('https://lh3.googleusercontent.com/'), JSON.stringify(grFoto?.eigenaar));
    // 20.10.2026: het overzicht stuurt hoogstens KANDIDATEN_MAX accounts mee. Op een server (of in deze gedeelde test-DB) met meer
    // goedgekeurde mensen viel iedereen achteraan het alfabet er STIL uit — daarom zoekt de eigenaar nu, en dat pad testen we hier.
    const ovZoek = await call('POST /api/owner/uitrol/kandidaten', OWNER, { zoek: 'Тест Власник' });
    const gevondenAcc = [...(ovFoto.data?.kandidaten?.accounts || []), ...(ovZoek.data?.kandidaten?.accounts || [])];
    check('grants: kandidaten-accounts hebben naam en foto (ook via zoeken buiten het eerste blok)',
      gevondenAcc.some((a: { id: string; naam?: string; foto?: string }) => a.id === OWNER && a.naam === 'Тест Власник' && !!a.foto), JSON.stringify(ovZoek.data?.kandidaten?.accountsTotaal));
    check('grants: het overzicht zegt eerlijk hoeveel accounts er in totaal zijn (nooit stil afkappen)',
      typeof ovFoto.data?.kandidaten?.accountsTotaal === 'number'
      && ovFoto.data.kandidaten.accountsTotaal >= (ovFoto.data.kandidaten.accounts || []).length
      && ovFoto.data.kandidaten.accountsAfgekapt === (ovFoto.data.kandidaten.accountsTotaal > (ovFoto.data.kandidaten.accounts || []).length),
      JSON.stringify({ t: ovFoto.data?.kandidaten?.accountsTotaal, n: (ovFoto.data?.kandidaten?.accounts || []).length, a: ovFoto.data?.kandidaten?.accountsAfgekapt }));
    await sys.query("UPDATE app.records SET data = data || $2::jsonb WHERE tbl = 'users' AND id = $1", [OWNER, JSON.stringify({ picture: 'https://evil.example/x.png' })]);
    const ovFout = await call('POST /api/owner/uitrol/overzicht', OWNER, {});
    check('grants: vreemde foto-URL wordt niet doorgegeven', (ovFout.data?.voorbereiders || []).find((g: { id: string }) => g.id === ag.data.voorbereider.id)?.eigenaar?.foto === '');
    // «Tot intrekking» (zonder einddatum), termijn wijzigen en het journaal van rechten (agent.grant.*).
    stepUp = true;
    const onb = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'agent', onderwerp: 'gpt', onbepaald: true, dagen: 1 });
    const dag31 = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'agent', onderwerp: 'grok', dagen: 31 });
    const onbString = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'agent', onderwerp: 'gemini', onbepaald: 'ja', dagen: 1 });
    stepUp = false;
    check('onbepaald: grant zonder einddatum (vlag + verre datum), status actief', onb.status === 200 && onb.data.voorbereider.onbepaald === true && /^9999-12-31/.test(onb.data.voorbereider.verlooptOp) && onb.data.voorbereider.status === 'actief', JSON.stringify(onb.data));
    check('onbepaald: geldt (heeftVoorbereiderGrant) en bron is handmatig', await m.heeftVoorbereiderGrant(agOnd('gpt', OWNER)) && onb.data.voorbereider.bron === 'handmatig');
    check('onbepaald: 31 dagen blijft geweigerd (DUUR_ONGELDIG)', dag31.fout === 'DUUR_ONGELDIG', JSON.stringify(dag31));
    check('onbepaald: alleen echte true telt; de tekst "ja" geeft de gewone termijn van 1 dag', onbString.status === 200 && onbString.data.voorbereider.onbepaald === false && !/^9999/.test(onbString.data.voorbereider.verlooptOp));
    check('onbepaald: de databasecontrole weigert een lange termijn zonder vlag', await sys.query("UPDATE app.uitrol_voorbereiders SET verloopt_op = now() + interval '40 days' WHERE id = $1", [onbString.data.voorbereider.id]).then(() => false, () => true));
    stepUp = true;
    const tm = await call('POST /api/owner/uitrol/voorbereiders/termijn', OWNER, { id: onb.data.voorbereider.id, dagen: 7 });
    const tmFout = await call('POST /api/owner/uitrol/voorbereiders/termijn', OWNER, { id: onb.data.voorbereider.id, dagen: 99 });
    const tmTerug = await call('POST /api/owner/uitrol/voorbereiders/termijn', OWNER, { id: onb.data.voorbereider.id, onbepaald: true });
    stepUp = false;
    check('termijn: van "tot intrekking" naar 7 dagen', tm.status === 200 && tm.data.voorbereider.onbepaald === false && Date.parse(tm.data.voorbereider.verlooptOp) - Date.now() < 7.1 * 86_400_000 && Date.parse(tm.data.voorbereider.verlooptOp) - Date.now() > 6.9 * 86_400_000, JSON.stringify(tm.data));
    check('termijn: 99 dagen geweigerd; terug naar "tot intrekking" kan', tmFout.fout === 'DUUR_ONGELDIG' && tmTerug.data?.voorbereider?.onbepaald === true);
    const auditAg = async (actie: string, agentSlug: string) => (await sys.query("SELECT details, result FROM app.audit WHERE action = $1 AND details->>'agent' = $2 AND owner_id = $3 ORDER BY seq", [actie, agentSlug, OWNER])).rows;
    const aGegeven = await auditAg('agent.grant.gegeven', 'claude');
    check('journaal: agent.grant.gegeven met actor, doel, agent, vóór/na en termijn', aGegeven.length === 1 && aGegeven[0].details.actor.id === OWNER && aGegeven[0].details.target.id === 'claude' && aGegeven[0].details.before === 'geen recht' && /7 dagen/.test(aGegeven[0].details.after), JSON.stringify(aGegeven));
    const aTermijn = await auditAg('agent.grant.termijn', 'gpt');
    check('journaal: agent.grant.termijn met vóór ("tot intrekking") en na (7 dagen), daarna de terugkeer', aTermijn.length === 2 && aTermijn[0].details.before === 'tot intrekking' && /7 dagen/.test(aTermijn[0].details.after) && aTermijn[1].details.after === 'tot intrekking', JSON.stringify(aTermijn));
    stepUp = true; sterk = true;
    const intr = await call('POST /api/owner/uitrol/voorbereiders/intrekken', OWNER, { id: onb.data.voorbereider.id, reden: 'GPT hoeft dit niet meer te doen' });
    stepUp = false; sterk = false;
    const aIntrek = await auditAg('agent.grant.ingetrokken', 'gpt');
    check('journaal: agent.grant.ingetrokken met reden en vóór/na', intr.status === 200 && aIntrek.length === 1 && aIntrek[0].details.reason === 'GPT hoeft dit niet meer te doen' && aIntrek[0].details.after === 'geen recht', JSON.stringify(aIntrek));
    const aOverzicht = await call('POST /api/owner/uitrol/overzicht', OWNER, {});
    check('overzicht: kandidaten tellen privéverbindingen (uitleg bij een lege lijst) en bevatten het beleid', typeof aOverzicht.data?.kandidaten?.uitgesloten?.koppelingenPrive === 'number' && 'beleid' in aOverzicht.data);
    await sys.query('DELETE FROM app.uitrol_voorbereiders WHERE id = $1', [ag.data.voorbereider.id]);
    await sys.query("UPDATE app.records SET data = data || '{\"status\":\"blocked\"}'::jsonb WHERE tbl = 'users' AND id = $1", [ANDER]);
    check('agents: geblokkeerd account → grant werkt niet meer', !(await m.heeftVoorbereiderGrant(tokOnderwerp)));

    // Intrekken en verlopen
    const loopt = await call('POST /api/uitrol/voorstel/begin', HELPER, { version: '20261008-150004', bytes: 100, sha256: 'c'.repeat(64) });
    stepUp = true;
    check('app: grant intrekken zonder reden geweigerd (≥ 10 tekens)', (await call('POST /api/owner/uitrol/voorbereiders/intrekken', OWNER, { id: g.data.voorbereider.id, reden: 'kort' })).fout === 'REDEN_TE_KORT');
    check('app: grant intrekken met alleen Google-step-up geweigerd (sterke methode nodig)', (await call('POST /api/owner/uitrol/voorbereiders/intrekken', OWNER, { id: g.data.voorbereider.id, reden: 'Project afgerond, geen uploads meer' })).fout === 'STEP_UP_STRONG_REQUIRED');
    sterk = true;
    check('app: grant intrekken (audit) stopt lopende uploads', (await call('POST /api/owner/uitrol/voorbereiders/intrekken', OWNER, { id: g.data.voorbereider.id, reden: 'Project afgerond, geen uploads meer' })).data?.voorbereider?.status === 'ingetrokken'
      && (await sys.query('SELECT status FROM app.uitrol_voorstellen WHERE id = $1', [loopt.data.id])).rows[0].status === 'afgebroken');
    sterk = false; stepUp = false;
    const wv = (await sys.query("SELECT * FROM app.toegang_wijzigingen WHERE user_id = $1 AND soort = 'voorbereider-ingetrokken'", [HELPER])).rows[0];
    check('app: getroffen gebruiker heeft de wijziging (wie, waarom) in de eigen geschiedenis', wv && wv.actor_id === OWNER && wv.reden === 'Project afgerond, geen uploads meer'
      && (await sys.query("SELECT 1 FROM app.audit WHERE owner_id = $1 AND action = 'uitrol_voorbereider_ingetrokken'", [HELPER]).catch(() => ({ rows: [] }))).rows.length === 1);
    check('app: ingetrokken grant → voorbereiden geweigerd', (await call('POST /api/uitrol/voorstel/begin', HELPER, { version: '20261008-150005', bytes: 10, sha256: 'd'.repeat(64) })).fout === 'GEEN_VOORBEREIDER_GRANT');
    stepUp = true;
    const g2 = await call('POST /api/owner/uitrol/voorbereiders/toevoegen', OWNER, { soort: 'account', onderwerp: HELPER, dagen: 1 });
    stepUp = false;
    await sys.query("UPDATE app.uitrol_voorbereiders SET gegeven_op = now() - interval '2 days', verloopt_op = now() - interval '1 second' WHERE id = $1", [g2.data.voorbereider.id]);
    check('app: verlopen grant → voorbereiden geweigerd', (await call('POST /api/uitrol/voorstel/begin', HELPER, { version: '20261008-150006', bytes: 10, sha256: 'e'.repeat(64) })).fout === 'GEEN_VOORBEREIDER_GRANT');

    // §13.10 Recht intrekken: eigenaar, reden ≥ 10 tekens, verse STERKE step-up; root haalt de sleutel pas bij verwerk weg.
    const sleutelsN = () => JSON.parse(readFileSync(o.sleutels, 'utf8')).sleutels.length as number;
    const intrekBestand = () => readdirSync(o.inbox).some((f) => f.startsWith('sleutel-intrekken-'));
    const REDEN = 'Telefoon verloren in de trein';
    stepUp = true;
    check('app: passkey die mag goedkeuren kan niet zonder reden verwijderd worden', (await pcall('POST /api/owner/access/passkeys/verwijderen', OWNER, { id: passkeyId })).fout === 'PASSKEY_KAN_GOEDKEUREN');
    check('app: recht intrekken zonder reden geweigerd', (await pcall('POST /api/owner/access/passkeys/goedkeuring/recht-intrekken', OWNER, { id: passkeyId, reden: '   kort   ' })).fout === 'REDEN_TE_KORT');
    check('app: recht intrekken met alleen Google-step-up geweigerd (passkey/TOTP/herstelcode nodig)', (await pcall('POST /api/owner/access/passkeys/goedkeuring/recht-intrekken', OWNER, { id: passkeyId, reden: REDEN })).fout === 'STEP_UP_STRONG_REQUIRED' && !intrekBestand());
    check('app: niet-eigenaar kan geen recht intrekken', (await pcall('POST /api/owner/access/passkeys/goedkeuring/recht-intrekken', HELPER, { id: passkeyId, reden: REDEN })).fout === 'OWNER_REQUIRED');
    sterk = true;
    const ri = await pcall('POST /api/owner/access/passkeys/goedkeuring/recht-intrekken', OWNER, { id: passkeyId, reden: REDEN }, { sessie: 'aanvaller-sessie-1' });
    check('app: recht intrekken → alleen een intrekverzoek in de inbox (root beslist), sleutel nog in root', ri.status === 200 && sleutelsN() === 1 && intrekBestand() && existsSync(join(o.inbox, 'sleutel-aanvraag')), JSON.stringify(ri.data));
    const w1 = (await sys.query("SELECT * FROM app.toegang_wijzigingen WHERE user_id = $1 AND soort = 'goedkeur-recht-ingetrokken' ORDER BY op DESC LIMIT 1", [OWNER])).rows[0];
    check('app: wijziging vastgelegd: wie, sessie, reden, welke sleutel, methode', w1 && w1.actor_id === OWNER && w1.reden === REDEN && w1.sessie_id === 'aanvaller-sessie-1' && w1.vingerafdruk === fp && w1.host === 'id.tarasevych.com', JSON.stringify(w1 || {}));
    check('app: tweede intrekverzoek terwijl het eerste loopt → INTREKKEN_LOOPT_AL', (await pcall('POST /api/owner/access/passkeys/goedkeuring/recht-intrekken', OWNER, { id: passkeyId, reden: REDEN })).fout === 'INTREKKEN_LOOPT_AL');
    const lw = await pcall('POST /api/owner/access/passkeys/lijst', OWNER);
    const pw = lw.data.passkeys.find((p: any) => p.id === passkeyId);
    check('app: status «wordt ingetrokken» + geschiedenis met reden', pw?.goedkeuring === 'wordt-ingetrokken' && pw.geschiedenis.some((g: any) => g.soort === 'goedkeur-recht-ingetrokken' && g.wijziging?.reden === REDEN), JSON.stringify(pw));
    // «Це був не я» vóór root: verzoek weghalen → recht blijft; de sessie van de wijziging wordt ingetrokken (niet de huidige).
    const tv = await tcall('POST /api/owner/access/toegang/wijziging', OWNER, { id: w1.id });
    check('app: wijziging bekijken (link uit de melding)', tv.status === 200 && tv.data.wijziging.reden === REDEN && tv.data.stand.recht === 'wordt-ingetrokken' && tv.data.kanTerugdraaien === true, JSON.stringify(tv.data));
    check('app: wijziging van een ander account niet zichtbaar', (await tcall('POST /api/owner/access/toegang/wijziging', HELPER, { id: w1.id })).status === 404);
    sterk = false;
    check('app: terugdraaien vraagt ook een sterke step-up', (await tcall('POST /api/owner/access/toegang/wijziging/terugdraaien', OWNER, { id: w1.id })).fout === 'STEP_UP_STRONG_REQUIRED');
    sterk = true;
    const td = await tcall('POST /api/owner/access/toegang/wijziging/terugdraaien', OWNER, { id: w1.id }, { sessie: 'eigenaar-sessie-2' });
    check('app: terugdraaien vóór root → recht behouden, intrekverzoek weg', td.status === 200 && td.data.uitkomst.recht === 'behouden' && !intrekBestand() && td.data.stand.recht === 'kan-goedkeuren', JSON.stringify(td.data));
    check('app: terugdraaien legt vast (ongedaan door, uitkomst) en kan maar één keer', !!td.data.wijziging.ongedaanOp && (await tcall('POST /api/owner/access/toegang/wijziging/terugdraaien', OWNER, { id: w1.id }, { sessie: 'eigenaar-sessie-2' })).fout === 'AL_TERUGGEDRAAID');
    check('app: terugdraaien staat in de audit', (await sys.query("SELECT 1 FROM app.audit WHERE owner_id = $1 AND action = 'toegang_wijziging_ongedaan' AND details->>'wijziging' = $2", [OWNER, w1.id]).catch(() => ({ rows: [] }))).rows.length === 1);
    // Nu echt intrekken en root laten verwerken.
    const ri2 = await pcall('POST /api/owner/access/passkeys/goedkeuring/recht-intrekken', OWNER, { id: passkeyId, reden: REDEN }, { sessie: 'aanvaller-sessie-3' });
    hulp(o, 'verwerk');
    check('root: verwerkt het intrekverzoek van de app (zonder assertie)', ri2.status === 200 && sleutelsN() === 0 && !intrekBestand());
    const w2 = (await sys.query("SELECT id FROM app.toegang_wijzigingen WHERE user_id = $1 AND soort = 'goedkeur-recht-ingetrokken' AND ongedaan_op IS NULL ORDER BY op DESC LIMIT 1", [OWNER])).rows[0];
    const td2 = await tcall('POST /api/owner/access/toegang/wijziging/terugdraaien', OWNER, { id: w2.id }, { sessie: 'eigenaar-sessie-2' });
    check('app: terugdraaien ná root → eerlijk: alleen via SSH (aanmelding + SSH-opdracht)', td2.status === 200 && td2.data.uitkomst.recht === 'ssh-nodig' && String(td2.data.uitkomst.sshOpdracht).startsWith('sudo mijn-ruimte-passkey toevoegen ') && existsSync(join(o.inbox, `sleutel-aanmelding-${fp}.json`)), JSON.stringify(td2.data));
    check('app: opnieuw aanvragen via de app ná intrekken → SSH (OPNIEUW_VIA_SSH of eerste sleutel)', (await (async () => { const l = await pcall('POST /api/owner/access/passkeys/lijst', OWNER); return String(l.data.passkeys.find((p: any) => p.id === passkeyId)?.sshOpdracht || ''); })()).startsWith('sudo mijn-ruimte-passkey toevoegen '));
    check('root: SSH zet het recht terug', hulp(o, 'toevoegen', fp.slice(0, 20)).status === 0 && sleutelsN() === 1);
    // Verwijderen van een goedkeur-passkey: met reden + sterke step-up; terugdraaien vóór root zet de passkey terug.
    const vw = await pcall('POST /api/owner/access/passkeys/verwijderen', OWNER, { id: passkeyId, reden: 'Oude telefoon weggegeven' }, { sessie: 'aanvaller-sessie-4' });
    check('app: goedkeur-passkey verwijderen met reden → rij weg + intrekverzoek', vw.status === 200 && intrekBestand() && (await sys.query('SELECT 1 FROM app.passkeys WHERE id = $1', [passkeyId])).rows.length === 0, JSON.stringify(vw.data));
    const w3 = (await sys.query("SELECT id FROM app.toegang_wijzigingen WHERE user_id = $1 AND soort = 'goedkeur-passkey-verwijderd' ORDER BY op DESC LIMIT 1", [OWNER])).rows[0];
    const td3 = await tcall('POST /api/owner/access/toegang/wijziging/terugdraaien', OWNER, { id: w3.id }, { sessie: 'eigenaar-sessie-2' });
    check('app: terugdraaien zet de passkey terug en het recht blijft (vóór root)', td3.status === 200 && td3.data.uitkomst.passkeyTerug === true && td3.data.uitkomst.recht === 'behouden' && (await sys.query('SELECT 1 FROM app.passkeys WHERE id = $1', [passkeyId])).rows.length === 1 && sleutelsN() === 1, JSON.stringify(td3.data));
    // Opruimen zoals vroeger: intrekken, root verwerkt, daarna gewoon verwijderen.
    await pcall('POST /api/owner/access/passkeys/goedkeuring/recht-intrekken', OWNER, { id: passkeyId, reden: REDEN });
    hulp(o, 'verwerk');
    sterk = false;
    check('app: daarna kan de passkey weg (gewone step-up)', (await pcall('POST /api/owner/access/passkeys/verwijderen', OWNER, { id: passkeyId })).status === 200 && sleutelsN() === 0);
    stepUp = false;

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
    await sys.query('DELETE FROM app.passkeys WHERE user_id = ANY($1)', [Object.keys(users)]).catch(() => undefined);
    await sys.query('DELETE FROM app.passkey_uitdagingen WHERE user_id = ANY($1)', [Object.keys(users)]).catch(() => undefined);
    await sys.query('DELETE FROM app.mcp_console_tokens WHERE user_id = ANY($1)', [Object.keys(users)]);
    for (const t of ['toegang_wijzigingen', 'toegang_gebruik', 'toegang_notities']) await sys.query(`DELETE FROM app.${t} WHERE user_id = ANY($1)`, [Object.keys(users)]).catch(() => undefined);
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
  check('plafond: root-hulp gebruikt alleen node-ingebouwde modules + de kernen (WebAuthn, AI-beleid, besluit)', [...hulpSrc.matchAll(/from "([^"]+)"/g)].every((x) => x[1].startsWith('node:') || x[1] === './webauthn-kern.mjs' || x[1] === './ai-beleid-kern.mjs' || x[1] === './besluit-kern.mjs'));
  check('plafond: de besluit-kern zelf gebruikt alleen node-ingebouwde modules', [...readFileSync('deploy/goedkeuring/besluit-kern.mjs', 'utf8').matchAll(/from "([^"]+)"/g)].every((x) => x[1].startsWith('node:')));
  const beleidKern = readFileSync('deploy/goedkeuring/ai-beleid-kern.mjs', 'utf8');
  check('plafond: de AI-beleidkern zelf gebruikt alleen node-ingebouwde modules', [...beleidKern.matchAll(/from "([^"]+)"/g)].every((x) => x[1].startsWith('node:')));
  check('plafond: installer zet de AI-beleidkern naast de hulp en maakt de keten-map (root, leesbaar)', /ai-beleid-kern\.mjs/.test(inst) && /\/var\/lib\/mijn-ruimte\/ai-beleid/.test(inst));
  check('plafond: root-hulp neemt paden uit de omgeving alleen over als niet-root', /const omg = \(naam, standaard\) => \(!IS_ROOT && process\.env\[naam\]\)/.test(hulpSrc));
  check('plafond: uitrol --goedkeuring controleert de passkey vóór het uitpakken/installeren', uitrol.indexOf('verifieer-goedkeuring') > 0 && uitrol.lastIndexOf('verifieer-goedkeuring') < uitrol.indexOf('tarfile.open') && uitrol.lastIndexOf('verifieer-goedkeuring') < uitrol.indexOf('cmd=( "$INSTALLEER"') && /unset [^\n]*UITROL_GOEDKEUR_HULP/.test(uitrol.replace(/\\\n\s*/g, ' ')));
  check('plafond: installer zet de root-hulp uit het pakket ($doel), root-eigendom, en maakt de schakelaar standaard uit', /install -m 0644 -o root -g root "\$doel\/deploy\/goedkeuring\/webauthn-kern\.mjs"/.test(inst) && /"passkey-goedkeuring": false/.test(inst));
  check('plafond: wrapper wist de omgeving en vergrendelt', /env -i PATH=\/usr\/bin:\/bin/.test(readFileSync('deploy/goedkeuring/mijn-ruimte-passkey.sh', 'utf8')) && /flock/.test(readFileSync('deploy/goedkeuring/mijn-ruimte-passkey.sh', 'utf8')));
  const ui = readFileSync('src/BeheerUitrolWeergave.tsx', 'utf8') + readFileSync('src/ToegangssleutelsSectie.tsx', 'utf8') + readFileSync('src/uitrol/Zijkant.tsx', 'utf8');
  const wa = readFileSync('src/platform/webauthn.ts', 'utf8');
  check('ui: tekstpaar per melding (tr(lang, uk, nl)) en userVerification required', /userVerification: 'required'/.test(wa) && (ui.match(/tr\(lang,/g) || []).length > 40);
  check('ui: admin «Оновлення» registreert zelf geen passkeys meer (alleen een link naar «Способи входу»)', !/credentials\.create|passkeyAanmaken/.test(readFileSync('src/BeheerUitrolWeergave.tsx', 'utf8')) && /canonicalNavigationUrl\('identity',\s*'methods'/.test(ui));
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
