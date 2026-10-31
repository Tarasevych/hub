// Besluiten van de eigenaar met passkey (22.10.2026, zone B; RUNBOOK §15): de ROOT-kant end-to-end met de echte root-hulp
// (goedkeur-hulp.mjs verifieer-besluit, echte handtekeningen via nep-passkey), het echte root-script deploy/besluit/mijn-ruimte-besluit.sh
// (bash + python) met testpaden, en een nagebootste installer die «terugdraaien <release>» uitvoert door de symlink te wisselen.
// Aanvallen: vervalste handtekening, hergebruikte nonce, verlopen challenge, andere (niet-root) passkey, inhoud gewijzigd na het tekenen,
// verkeerde origin, schakelaar dicht, verouderde stand (actieve release veranderd), onbekende release, 10-minutenlimiet, kapotte
// bestanden en symlinks in de inbox. Plus de goede weg: terugdraaien (installer + gebeurtenis) en externe hosts (atomisch, reservekopie).
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import * as bk from '../../deploy/goedkeuring/besluit-kern.mjs';
import { bevestig, nieuwePasskey, registreer, type NepPasskey } from './hulp/nep-toegangssleutel';
import { checker } from './hulp/nep-google';

const SCRIPT = resolve('deploy/besluit/mijn-ruimte-besluit.sh');
const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');
export const RP = 'tarasevych.com'; export const ORIGIN_MCP = 'https://mcp.tarasevych.com'; export const ORIGIN_ADMIN = 'https://admin.tarasevych.com';
const nonce = () => randomBytes(32).toString('base64url');
export const id32 = () => randomBytes(16).toString('hex');

// ORCH-001 етап 3 (31.10.2026): als root (cloud-sessie) negeert het script de testpaden (BESLUIT_*) en zou het de ECHTE /srv- en /var-paden
// raken. Daarom draaien script en root-hulp dan als uid 65534 via setpriv (zelfde patroon als orch-uitrol-basis-20261031); alle testmappen
// worden eigendom van 65534 (chown -R) zodat het script erin kan schrijven. Zonder setpriv wordt de test als root overgeslagen.
export const ALS_ROOT = process.getuid?.() === 0;
export const HEEFT_SETPRIV = ALS_ROOT && spawnSync('setpriv', ['--help'], { encoding: 'utf8' }).status === 0;
const TESTGEBRUIKER = ['--reuid=65534', '--regid=65534', '--clear-groups'];
/** bash/node als testgebruiker: als root via setpriv (uid 65534), anders gewoon. */
export const alsTest = (cmd: string, args: string[], env: NodeJS.ProcessEnv) => (ALS_ROOT ? spawnSync('setpriv', [...TESTGEBRUIKER, cmd, ...args], { encoding: 'utf8', env }) : spawnSync(cmd, args, { encoding: 'utf8', env }));

export function sleutelUit(pk: NepPasskey, label = 'telefoon') {
  const r = kern.verifieerRegistratie({ ...registreer(pk, 'c'), verwachteUitdaging: 'c', rpId: RP, origins: [ORIGIN_ADMIN] });
  if (!r.ok) throw new Error(`registratie: ${r.code}`);
  return { credentialId: r.credentialId, alg: r.alg, jwk: r.jwk, label, vingerafdruk: r.vingerafdruk, toegevoegd: new Date().toISOString(), door: 'test' };
}

export function omgeving() {
  const w = mkdtempSync(join(tmpdir(), 'besluit-root-'));
  const p = { w, inbox: join(w, 'inbox'), werk: join(w, 'werk'), status: join(w, 'status'), rechten: join(w, 'mcp-rechten.json'), app: join(w, 'srv'), goed: join(w, 'goed'), sleutels: join(w, 'goed', 'goedkeur-passkeys.json'), installeerLog: join(w, 'installeer.log') };
  for (const d of [p.inbox, p.werk, p.status, join(p.app, 'releases'), p.goed, join(p.goed, 'staat')]) mkdirSync(d, { recursive: true });
  // Drie releases: 20261022-120000 (actief), 20261021-120000 (vorige), 20261020-120000 (ouder), 20261019-120000 (onvolledig: geen start.mjs).
  for (const r of ['20261022-120000', '20261021-120000', '20261020-120000']) { mkdirSync(join(p.app, 'releases', r, 'dist-server'), { recursive: true }); writeFileSync(join(p.app, 'releases', r, 'dist-server', 'start.mjs'), '// start\n'); writeFileSync(join(p.app, 'releases', r, 'RELEASE-COMMIT'), `${r.replace(/-/g, '')}abcdef\n`); }
  mkdirSync(join(p.app, 'releases', '20261019-120000'), { recursive: true });
  symlinkSync(join(p.app, 'releases', '20261022-120000'), join(p.app, 'current'));
  writeFileSync(join(p.app, 'VORIGE'), `${join(p.app, 'releases', '20261021-120000')}\n`);
  writeFileSync(p.rechten, JSON.stringify({ read: true, uitrol: false, 'passkey-goedkeuring': true, externeMcpHosts: ['api.githubcopilot.com'], opdracht: { status: true, terugdraaien: false } }, null, 2));
  chmodSync(p.rechten, 0o640);
  // Nagebootste installer: `terugdraaien <release>` wisselt de symlink en schrijft VORIGE, zoals de echte; `KAPOT` laat hem falen.
  const installeer = join(w, 'installeer');
  writeFileSync(installeer, `#!/bin/bash\necho "modus=\${MIJN_RUIMTE_UITROL_MODUS:-} args=$*" >> "${p.installeerLog}"\n[ "$1" = terugdraaien ] || exit 64\n[ -e "${w}/KAPOT" ] && { echo "FOUT: nagebootst" >&2; exit 1; }\nd="${p.app}/releases/$2"\n[ -f "$d/dist-server/start.mjs" ] || { echo "geen release" >&2; exit 1; }\nreadlink -f "${p.app}/current" > "${p.app}/VORIGE"\nln -sfn "$d" "${p.app}/current.tmp" && mv -T "${p.app}/current.tmp" "${p.app}/current"\necho "[installeer] teruggedraaid naar $2"\n`);
  const passkey = join(w, 'passkey');
  writeFileSync(passkey, `#!/bin/bash\nexport GOEDKEUR_SLEUTELS="${p.sleutels}" GOEDKEUR_RECHTEN="${p.rechten}" GOEDKEUR_STAAT="${join(p.goed, 'staat')}" GOEDKEUR_INBOX="${p.goed}" GOEDKEUR_STATUS_DIR="${p.status}" GOEDKEUR_GROEP=nogroup\nexec "${process.execPath}" "${HULP}" "$@"\n`);
  chmodSync(installeer, 0o755); chmodSync(passkey, 0o755);
  // Als root: de hele testboom aan de testgebruiker (script, hulp en installer-stub schrijven erin); bestanden die de test later als root
  // neerlegt (inbox, sleutels) zijn 0644 en dus leesbaar; hernoemen/verwijderen lukt omdat de mappen van 65534 zijn.
  if (ALS_ROOT) spawnSync('chown', ['-R', '65534:65534', w]);
  const env = { ...process.env, BESLUIT_INBOX: p.inbox, BESLUIT_WERK: p.werk, BESLUIT_STATUS: p.status, BESLUIT_RECHTEN: p.rechten, BESLUIT_PASSKEY: passkey, BESLUIT_INSTALLEER: installeer, BESLUIT_APP_ROOT: p.app, BESLUIT_GROEP: 'nogroup', BESLUIT_WACHT_TERUG: '600' };
  const run = (...args: string[]) => alsTest('bash', [SCRIPT, ...args], env);
  const hulp = (...args: string[]) => { const r = alsTest(process.execPath, [HULP, ...args], { GOEDKEUR_SLEUTELS: p.sleutels, GOEDKEUR_RECHTEN: p.rechten, GOEDKEUR_STAAT: join(p.goed, 'staat'), GOEDKEUR_INBOX: p.goed, GOEDKEUR_STATUS_DIR: p.status, GOEDKEUR_GROEP: 'nogroup', PATH: process.env.PATH }); let uit: any = null; try { uit = JSON.parse(r.stdout.trim().split('\n').pop() || ''); } catch { uit = null; } return { status: r.status, uit, stderr: r.stderr }; };
  return { p, env, run, hulp };
}

export type Besluit = { soort: 'terugdraaien' | 'externe-hosts' | 'orch-regels'; inhoud: unknown; tekenInhoud?: unknown; verloopt?: number; origin?: string; nonce?: string; hashClaim?: string; doel?: string };
/** Het bestand zoals de app het schrijft; `pk` tekent de hash van `tekenInhoud` (standaard = inhoud). */
export function besluitBestand(pk: NepPasskey, b: Besluit) {
  const id = id32();
  const n = b.nonce ?? nonce(); const verloopt = b.verloopt ?? Date.now() + 240_000;
  const hash = bk.besluitHash(b.soort, b.tekenInhoud ?? b.inhoud);
  const assertie = bevestig(pk, kern.uitdagingVoor('eigenaar-besluit', { besluitHash: hash, nonce: n, verloopt }), { origin: b.origin ?? ORIGIN_MCP });
  const body = { doel: b.doel ?? 'eigenaar-besluit', id, soort: b.soort, inhoud: b.inhoud, besluitHash: b.hashClaim ?? bk.besluitHash(b.soort, b.inhoud), nonce: n, verloopt, assertie, door: 'eigenaar@test', tijd: new Date().toISOString() };
  return { id, body, tekst: JSON.stringify(body) };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('besluit-root-20261022');
  if (ALS_ROOT && !HEEFT_SETPRIV) { console.log('overgeslagen: root zonder setpriv — het root-script negeert als root de testpaden'); return 0; }
  const o = omgeving();
  const { p, run, hulp } = o;
  const eigenaar = nieuwePasskey('es256', 1);
  const sleutel = sleutelUit(eigenaar);
  writeFileSync(p.sleutels, JSON.stringify({ versie: 1, rpId: RP, origins: [ORIGIN_ADMIN, 'https://id.tarasevych.com'], sleutels: [sleutel] }));
  const actief = () => { try { return readlinkSync(join(p.app, 'current')).split('/').pop(); } catch { return ''; } };
  const status = (id: string) => { try { return JSON.parse(readFileSync(join(p.status, `besluit-${id}.json`), 'utf8')); } catch { return null; } };
  const rechten = () => JSON.parse(readFileSync(p.rechten, 'utf8'));
  const events = () => { try { return readFileSync(join(p.status, 'gebeurtenissen.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const leg = (pk: NepPasskey, b: Besluit) => { const f = besluitBestand(pk, b); writeFileSync(join(p.inbox, `besluit-${f.id}.json`), f.tekst); return f; };
  const doe = (pk: NepPasskey, b: Besluit) => { const f = leg(pk, b); const r = run('verwerk'); return { ...f, r, st: status(f.id) }; };
  const kaal = (f: ReturnType<typeof besluitBestand>) => { writeFileSync(join(p.inbox, `besluit-${f.id}.json`), f.tekst); return f; };

  try {
    // ---------------------------------------------------------------- kern
    const h1 = bk.besluitHash('externe-hosts', { hosts: ['API.Example.org', 'api.example.org', '*.foo.bar'] });
    check('kern: normaliseren is idempotent en hoofdletterongevoelig (dedupe)', h1 === bk.besluitHash('externe-hosts', { hosts: ['api.example.org', '*.foo.bar'] }) && JSON.stringify(bk.normaliseerInhoud('externe-hosts', { hosts: ['API.Example.org', 'api.example.org'] })) === '{"hosts":["api.example.org"]}');
    check('kern: andere volgorde = andere inhoud = andere hash (de eigenaar tekent wat hij ziet)', bk.besluitHash('externe-hosts', { hosts: ['a.org', 'b.org'] }) !== bk.besluitHash('externe-hosts', { hosts: ['b.org', 'a.org'] }));
    check('kern: «*» en lege/ongeldige hosts geweigerd', ['*', '', 'héllo.org', 'a..b', '-x.org', '*.'].every((h) => { try { bk.normaliseerInhoud('externe-hosts', { hosts: [h] }); return false; } catch { return true; } }));
    check('kern: terugdraaien eist twee verschillende releases in de vaste vorm', (() => { try { bk.normaliseerInhoud('terugdraaien', { van: '20261022-120000', naar: '20261022-120000' }); return false; } catch { /* ok */ } try { bk.normaliseerInhoud('terugdraaien', { van: 'x', naar: '20261021-120000' }); return false; } catch { return true; } })());
    check('kern: hash hangt aan het soort (zelfde velden, ander soort ≠)', bk.canoniekeTekst('terugdraaien', { van: '20261022-120000', naar: '20261021-120000' }).includes('\nterugdraaien\n'));
    check('kern: schakelaars — ontbreekt = open, false = dicht, true = open', bk.besluitKanaalOpen('terugdraaien', {}) && !bk.besluitKanaalOpen('terugdraaien', { 'terugdraaien-passkey': false }) && bk.besluitKanaalOpen('externe-hosts', { 'externe-hosts-passkey': true }) && !bk.besluitKanaalOpen('externe-hosts', { 'externe-hosts-passkey': false }) && !bk.besluitKanaalOpen('iets', {}));
    check('kern: challenge-doel eigenaar-besluit bestaat en eist een 64-hex hash', typeof kern.uitdagingVoor('eigenaar-besluit', { besluitHash: h1, nonce: nonce(), verloopt: Date.now() + 1000 }) === 'string' && (() => { try { kern.uitdagingVoor('eigenaar-besluit', { besluitHash: 'x', nonce: nonce(), verloopt: Date.now() + 1000 }); return false; } catch { return true; } })());

    // ---------------------------------------------------------------- root-hulp: verifieer-besluit (aanvallen)
    const goed = besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['api.githubcopilot.com', 'mcp.example.org'] } });
    const bestand = (f: ReturnType<typeof besluitBestand>, naam = `h-${f.id}.json`) => { const pad = join(p.w, naam); writeFileSync(pad, f.tekst); return pad; };
    let v = hulp('verifieer-besluit', bestand(goed));
    check('hulp: geldig besluit → OK met genormaliseerde inhoud, hash, vingerafdruk (origin mcp.* toegestaan voor dit doel)', v.status === 0 && v.uit?.ok === true && v.uit.hash === goed.body.besluitHash && v.uit.vingerafdruk === sleutel.vingerafdruk && JSON.stringify(v.uit.inhoud) === '{"hosts":["api.githubcopilot.com","mcp.example.org"]}', JSON.stringify(v.uit) + v.stderr);
    v = hulp('verifieer-besluit', bestand(goed, 'replay.json'));
    check('hulp: hetzelfde besluit nogmaals (nonce hergebruikt) → HERGEBRUIKT', v.status === 2 && v.uit?.code === 'HERGEBRUIKT');
    v = hulp('verifieer-besluit', bestand(besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['evil.example'] }, tekenInhoud: { hosts: ['api.githubcopilot.com'] }, hashClaim: bk.besluitHash('externe-hosts', { hosts: ['api.githubcopilot.com'] }) })));
    check('hulp: inhoud gewijzigd na het tekenen (app liegt over de hash) → BESLUIT_HASH_VERSCHILT', v.uit?.code === 'BESLUIT_HASH_VERSCHILT');
    v = hulp('verifieer-besluit', bestand(besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['evil.example'] }, tekenInhoud: { hosts: ['api.githubcopilot.com'] } })));
    check('hulp: inhoud gewijzigd na het tekenen (hash eerlijk herberekend) → UITDAGING_ONJUIST (handtekening past niet)', v.uit?.code === 'UITDAGING_ONJUIST');
    const vreemd = nieuwePasskey();
    v = hulp('verifieer-besluit', bestand(besluitBestand(vreemd, { soort: 'externe-hosts', inhoud: { hosts: ['evil.example'] } })));
    check('hulp: passkey die niet in het root-bestand staat → SLEUTEL_ONBEKEND', v.uit?.code === 'SLEUTEL_ONBEKEND');
    v = hulp('verifieer-besluit', bestand((() => { const f = besluitBestand(vreemd, { soort: 'externe-hosts', inhoud: { hosts: ['evil.example'] } }); f.body.assertie.credentialId = sleutel.credentialId; return { ...f, tekst: JSON.stringify(f.body) }; })()));
    check('hulp: vreemde sleutel met de credentialId van de eigenaar → HANDTEKENING_ONGELDIG', v.uit?.code === 'HANDTEKENING_ONGELDIG');
    v = hulp('verifieer-besluit', bestand(besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['a.org'] }, verloopt: Date.now() - 60_000 })));
    check('hulp: verlopen challenge → VERLOPEN', v.uit?.code === 'VERLOPEN');
    v = hulp('verifieer-besluit', bestand(besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['a.org'] }, verloopt: Date.now() + 3_600_000 })));
    check('hulp: challenge langer dan 5 min → VERLOOPT_TE_LAAT', v.uit?.code === 'VERLOOPT_TE_LAAT');
    v = hulp('verifieer-besluit', bestand(besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['a.org'] }, origin: 'https://evil.example' })));
    check('hulp: assertie van een vreemde origin → ORIGIN_ONJUIST', v.uit?.code === 'ORIGIN_ONJUIST');
    v = hulp('verifieer-besluit', bestand(besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['a.org'] }, origin: 'https://hub.tarasevych.com' })));
    check('hulp: hub.* is geen origin voor besluiten (alleen admin/id/mcp) → ORIGIN_ONJUIST', v.uit?.code === 'ORIGIN_ONJUIST');
    v = hulp('verifieer-besluit', bestand(besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['a.org'] }, doel: 'goedkeuren' })));
    check('hulp: ander doel in het bestand → BESLUIT_ONGELDIG', v.uit?.code === 'BESLUIT_ONGELDIG');
    { const f = besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['a.org'] } }); const pad = bestand(f); const old = f.body.assertie;
      // Een assertie voor doel «goedkeuren» (update) onder een besluit schuiven: de domeinscheiding in de challenge wijst het af.
      const upd = bevestig(eigenaar, kern.uitdagingVoor('goedkeuren', { voorstelId: '00000000-0000-4000-8000-000000000000', versie: '20261022-120000', sha256: f.body.besluitHash, nonce: f.body.nonce, verloopt: f.body.verloopt }), { origin: ORIGIN_ADMIN });
      writeFileSync(pad, JSON.stringify({ ...f.body, assertie: upd }));
      check('hulp: assertie van een ander doel (update-goedkeuring) telt niet als besluit → UITDAGING_ONJUIST', hulp('verifieer-besluit', pad).uit?.code === 'UITDAGING_ONJUIST'); void old; }
    writeFileSync(p.rechten, JSON.stringify({ ...rechten(), 'externe-hosts-passkey': false }));
    v = hulp('verifieer-besluit', bestand(besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['a.org'] } })));
    check('hulp: schakelaar "externe-hosts-passkey": false → BESLUIT_UIT (nonce niet verbruikt)', v.uit?.code === 'BESLUIT_UIT');
    writeFileSync(p.rechten, JSON.stringify({ ...rechten(), 'externe-hosts-passkey': true, 'terugdraaien-passkey': false }));
    v = hulp('verifieer-besluit', bestand(besluitBestand(eigenaar, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261021-120000' } })));
    check('hulp: schakelaar "terugdraaien-passkey": false → BESLUIT_UIT', v.uit?.code === 'BESLUIT_UIT');
    { const d = rechten(); delete d['terugdraaien-passkey']; writeFileSync(p.rechten, JSON.stringify(d)); }
    v = hulp('verifieer-besluit', bestand(besluitBestand(eigenaar, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261021-120000' } })));
    check('hulp: schakelaar ontbreekt = open → OK voor terugdraaien', v.uit?.ok === true && v.uit.soort === 'terugdraaien');
    check('hulp: ongeldige inhoud (host «*») → BESLUIT_INHOUD_ONGELDIG', hulp('verifieer-besluit', bestand({ ...goed, tekst: JSON.stringify({ ...goed.body, inhoud: { hosts: ['*'] }, besluitHash: 'a'.repeat(64) }) }, 'ster.json')).uit?.code === 'BESLUIT_INHOUD_ONGELDIG');
    check('hulp: leeg/kapot bestand → BESLUIT_ONGELDIG', (() => { const pad = join(p.w, 'kapot.json'); writeFileSync(pad, '{"doel":"eigenaar-besluit"'); return hulp('verifieer-besluit', pad).uit?.code === 'BESLUIT_ONGELDIG'; })());

    // ---------------------------------------------------------------- root-script: externe hosts (goede weg)
    let r = doe(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['api.githubcopilot.com', 'MCP.Example.org'] } });
    check('script: externe hosts → klaar, lijst in mcp-rechten.json (genormaliseerd), andere sleutels onaangeroerd', r.r.status === 0 && r.st?.uitkomst === 'klaar' && r.st.code === 'OK' && JSON.stringify(rechten().externeMcpHosts) === '["api.githubcopilot.com","mcp.example.org"]' && rechten().opdracht?.status === true && rechten()['passkey-goedkeuring'] === true, JSON.stringify(r.st) + r.r.stderr);
    check('script: uitkomst noemt toegevoegd/verwijderd en de passkey', JSON.stringify(r.st?.toegevoegd) === '["mcp.example.org"]' && JSON.stringify(r.st?.verwijderd) === '[]' && r.st?.passkey === sleutel.vingerafdruk.slice(0, 16));
    check('script: reservekopie van het rechtenbestand in de werkmap (alleen root), inbox leeg, journaalregel', readdirSync(p.werk).some((n) => /^mcp-rechten\..*\.bak$/.test(n)) && !readdirSync(p.inbox).some((n) => n.startsWith('besluit-')) && readFileSync(join(p.werk, 'journaal.jsonl'), 'utf8').includes(r.id));
    check('script: bestandsrechten van mcp-rechten.json behouden (0640)', (statSync(p.rechten).mode & 0o777) === 0o640);
    check('script: gebeurtenis BESLUIT_EXTERNE_HOSTS_OK (bron besluit) voor de site', events().some((e) => e.bron === 'besluit' && e.code === 'BESLUIT_EXTERNE_HOSTS_OK' && e.tag === r.id));
    const stand = JSON.parse(readFileSync(join(p.status, 'besluit-stand.json'), 'utf8'));
    check('script: besluit-stand.json: hosts, schakelaars (drie standen), actief/vorige, releases met «bruikbaar»', JSON.stringify(stand.hosts) === '["api.githubcopilot.com","mcp.example.org"]' && stand.schakelaars.terugdraaienDirect === false && stand.schakelaars.terugdraaienPasskey === true && stand.actief === '20261022-120000' && stand.vorige === '20261021-120000' && stand.releases.find((x: any) => x.naam === '20261019-120000')?.bruikbaar === false && stand.releases.find((x: any) => x.naam === '20261022-120000')?.actief === true, JSON.stringify(stand));
    r = doe(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: [] } });
    check('script: lege lijst is een geldig besluit (niets mag meer)', r.st?.uitkomst === 'klaar' && JSON.stringify(rechten().externeMcpHosts) === '[]' && JSON.stringify(r.st.verwijderd) === '["api.githubcopilot.com","mcp.example.org"]');

    // ---------------------------------------------------------------- root-script: aanvallen via de inbox
    r = doe(vreemd, { soort: 'externe-hosts', inhoud: { hosts: ['evil.example'] } });
    check('script: besluit met een vreemde passkey → geweigerd, bestand ongewijzigd, gebeurtenis met waarschuwing', r.st?.uitkomst === 'geweigerd' && r.st.code === 'BESLUIT_PASSKEY_SLEUTEL_ONBEKEND' && JSON.stringify(rechten().externeMcpHosts) === '[]' && events().some((e) => e.code === 'BESLUIT_PASSKEY_SLEUTEL_ONBEKEND' && e.niveau === 'waarschuwing'), JSON.stringify(r.st));
    { const f = besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['goed.org'] } }); kaal(f); run('verwerk'); const s1 = status(f.id); kaal(f); run('verwerk'); const s2 = status(f.id);
      check('script: dezelfde (al uitgevoerde) handtekening nogmaals neergelegd → HERGEBRUIKT, lijst blijft', s1?.uitkomst === 'klaar' && s2?.uitkomst === 'geweigerd' && s2.code === 'BESLUIT_PASSKEY_HERGEBRUIKT' && JSON.stringify(rechten().externeMcpHosts) === '["goed.org"]', JSON.stringify(s2)); }
    r = doe(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['evil.example'] }, tekenInhoud: { hosts: ['goed.org'] }, hashClaim: bk.besluitHash('externe-hosts', { hosts: ['goed.org'] }) });
    check('script: inhoud na het tekenen verwisseld → BESLUIT_HASH_VERSCHILT, lijst blijft', r.st?.code === 'BESLUIT_HASH_VERSCHILT' && JSON.stringify(rechten().externeMcpHosts) === '["goed.org"]');
    r = doe(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['x.org'] }, verloopt: Date.now() - 1000 });
    check('script: verlopen → BESLUIT_PASSKEY_VERLOPEN', r.st?.code === 'BESLUIT_PASSKEY_VERLOPEN');
    { const naam = `besluit-${id32()}.json`; symlinkSync(p.rechten, join(p.inbox, naam)); run('verwerk');
      check('script: symlink in de inbox wordt weggegooid en nooit gelezen (rechtenbestand onaangetast)', !existsSync(join(p.inbox, naam)) && JSON.stringify(rechten().externeMcpHosts) === '["goed.org"]'); }
    { writeFileSync(join(p.inbox, 'besluit-nietgeldig.json'), '{}'); writeFileSync(join(p.inbox, `besluit-${id32()}.json`), 'x'.repeat(70_000)); run('verwerk');
      check('script: verkeerde naam of te groot bestand → verwijderd zonder uitvoering', !readdirSync(p.inbox).some((n) => n.startsWith('besluit-'))); }
    { const f = besluitBestand(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['y.org'] } }); writeFileSync(join(p.inbox, `besluit-${f.id}.json`), JSON.stringify({ ...f.body, id: id32() })); run('verwerk');
      check('script: id in het bestand ≠ bestandsnaam → BESLUIT_ONGELDIG', status(f.id)?.code === 'BESLUIT_ONGELDIG'); }

    // ---------------------------------------------------------------- root-script: terugdraaien
    r = doe(eigenaar, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261021-120000' } });
    check('script: terugdraaien → installer «terugdraaien 20261021-120000» in modus besluit, symlink gewisseld, uitkomst klaar met actief', r.st?.uitkomst === 'klaar' && actief() === '20261021-120000' && r.st.actief === '20261021-120000' && readFileSync(p.installeerLog, 'utf8').includes('modus=besluit args=terugdraaien 20261021-120000'), JSON.stringify(r.st) + r.r.stderr);
    check('script: gebeurtenis BESLUIT_TERUGDRAAIEN_OK en installerlog in de werkmap (root)', events().some((e) => e.code === 'BESLUIT_TERUGDRAAIEN_OK') && existsSync(join(p.werk, `terugdraaien-${r.id}.log`)));
    r = doe(eigenaar, { soort: 'terugdraaien', inhoud: { van: '20261021-120000', naar: '20261022-120000' } });
    check('script: tweede terugdraaiing binnen 10 min → BESLUIT_TE_SNEL (nonce wel verbruikt, niets gewisseld)', r.st?.code === 'BESLUIT_TE_SNEL' && actief() === '20261021-120000');
    utimesSync(join(p.werk, 'terugdraaien.stempel'), new Date(Date.now() - 700_000), new Date(Date.now() - 700_000));
    r = doe(eigenaar, { soort: 'terugdraaien', inhoud: { van: '20261022-120000', naar: '20261020-120000' } });
    check('script: «van» ≠ actieve release (verouderd besluit) → BESLUIT_STAND_VERANDERD, niets gewisseld', r.st?.code === 'BESLUIT_STAND_VERANDERD' && actief() === '20261021-120000');
    r = doe(eigenaar, { soort: 'terugdraaien', inhoud: { van: '20261021-120000', naar: '20261019-120000' } });
    check('script: onvolledige release (geen start.mjs) → BESLUIT_RELEASE_ONBEKEND', r.st?.code === 'BESLUIT_RELEASE_ONBEKEND' && actief() === '20261021-120000');
    utimesSync(join(p.werk, 'terugdraaien.stempel'), new Date(Date.now() - 700_000), new Date(Date.now() - 700_000));
    writeFileSync(join(p.w, 'KAPOT'), '1');
    r = doe(eigenaar, { soort: 'terugdraaien', inhoud: { van: '20261021-120000', naar: '20261022-120000' } });
    check('script: installer faalt → uitkomst mislukt BESLUIT_TERUGDRAAIEN_MISLUKT met detail, gebeurtenis niveau fout', r.st?.uitkomst === 'mislukt' && r.st.code === 'BESLUIT_TERUGDRAAIEN_MISLUKT' && String(r.st.detail || '').includes('nagebootst') && events().some((e) => e.code === 'BESLUIT_TERUGDRAAIEN_MISLUKT' && e.niveau === 'fout'), JSON.stringify(r.st));
    rmSync(join(p.w, 'KAPOT'));
    { const voor = readFileSync(p.installeerLog, 'utf8').split('\n').length;
      r = doe(vreemd, { soort: 'terugdraaien', inhoud: { van: '20261021-120000', naar: '20261022-120000' } });
      check('script: terugdraaien met vreemde passkey → geweigerd, installer NIET aangeroepen', r.st?.uitkomst === 'geweigerd' && readFileSync(p.installeerLog, 'utf8').split('\n').length === voor); }
    check('script: `status` schrijft de stand zonder iets te doen', run('status').status === 0 && JSON.parse(readFileSync(join(p.status, 'besluit-stand.json'), 'utf8')).actief === '20261021-120000');
    check('script: buiten root alleen met testpaden (echte paden geweigerd)', alsTest('bash', [SCRIPT, 'verwerk'], { ...process.env, BESLUIT_INBOX: '/srv/mijn-ruimte/besluit-inbox', BESLUIT_WERK: p.werk, BESLUIT_STATUS: p.status, BESLUIT_RECHTEN: p.rechten, BESLUIT_APP_ROOT: p.app }).status === 1);
  } finally {
    rmSync(p.w, { recursive: true, force: true });
  }
  return einde();
}
