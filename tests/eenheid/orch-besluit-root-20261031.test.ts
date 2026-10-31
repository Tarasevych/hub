// ORCH-001 етап 3 (31.10.2026): рішення власника «orch-regels» (passkey) на боці ROOT — справжній root-скрипт
// deploy/besluit/mijn-ruimte-besluit.sh (bash + python; під root через setpriv як uid 65534) зі справжньою root-хулпою
// goedkeur-hulp.mjs і справжніми підписами nep-passkey. Root НІЧОГО не виконує в git: він лише фіксує підтвердження у власному журналі
// (werk/orch-regels-bevestigd.jsonl, 0600) і переписує файл стану для застосунку (status/orch-regels-bevestigd.json, 0640).
// Далі по ланцюжку: застосунок (backend/orch-opslag.ts rootBevestigingen) читає цей файл; GitOps (deploy/gitops/gitops-ophalen.sh,
// блок PYMODUS — виконується ТОЙ САМИЙ python-код зі скрипта) приймає lock з eigenaar.soort=passkey лише за записом у root-журналі.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as bk from '../../deploy/goedkeuring/besluit-kern.mjs';
import { ALS_ROOT, HEEFT_SETPRIV, ORIGIN_ADMIN, RP, besluitBestand, omgeving, sleutelUit, type Besluit } from './besluit-root-20261022.test';
import { nieuwePasskey, type NepPasskey } from './hulp/nep-toegangssleutel';
import { checker } from './hulp/nep-google';

const hex = (n: number) => randomBytes(n).toString('hex');
const lees = (p: string) => readFileSync(p, 'utf8');
const GITOPS = 'deploy/gitops/gitops-ophalen.sh';

/** Het PYMODUS-blok van gitops-ophalen.sh zoals het in het script staat (geen kopie): python3 - <bron> <journal>. */
function gitopsModus(bron: string, journal: string) {
  const s = lees(GITOPS);
  const a = s.indexOf("<<'PYMODUS'\n"); const b = s.indexOf('\nPYMODUS\n', a);
  if (a < 0 || b < 0) throw new Error('PYMODUS niet gevonden in gitops-ophalen.sh');
  const r = spawnSync('python3', ['-I', '-', bron, journal], { input: s.slice(a + "<<'PYMODUS'\n".length, b + 1), encoding: 'utf8' });
  return { code: r.status ?? -1, uit: `${r.stdout}${r.stderr}`.trim() };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('orch-besluit-root');
  if (ALS_ROOT && !HEEFT_SETPRIV) { console.log('overgeslagen: root zonder setpriv — het root-script negeert als root de testpaden'); return 0; }
  const { p, run, hulp } = omgeving();
  const eigenaar = nieuwePasskey('es256', 1);
  const sleutel = sleutelUit(eigenaar);
  writeFileSync(p.sleutels, JSON.stringify({ versie: 1, rpId: RP, origins: [ORIGIN_ADMIN, 'https://id.tarasevych.com'], sleutels: [sleutel] }));
  const status = (id: string) => { try { return JSON.parse(lees(join(p.status, `besluit-${id}.json`))); } catch { return null; } };
  const events = () => { try { return lees(join(p.status, 'gebeurtenissen.jsonl')).split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const rechten = () => JSON.parse(lees(p.rechten));
  const leg = (pk: NepPasskey, b: Besluit) => { const f = besluitBestand(pk, b); writeFileSync(join(p.inbox, `besluit-${f.id}.json`), f.tekst); return f; };
  const doe = (pk: NepPasskey, b: Besluit) => { const f = leg(pk, b); const r = run('verwerk'); return { ...f, r, st: status(f.id) }; };
  const journalPad = join(p.werk, 'orch-regels-bevestigd.jsonl'); const standPad = join(p.status, 'orch-regels-bevestigd.json');
  const journal = (): any[] => (existsSync(journalPad) ? lees(journalPad).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const stand = () => { try { return JSON.parse(lees(standPad)); } catch { return null; } };
  const inhoud = { regelsVersie: '1.3.0', hash: hex(32), kritiekHash: hex(32), voorstel: hex(12) };
  const vinger = sleutel.vingerafdruk.slice(0, 16);

  try {
    // ---------------------------------------------------------------- kern (deploy/goedkeuring/besluit-kern.mjs)
    check('kern: BESLUIT_SOORTEN kent orch-regels', (bk.BESLUIT_SOORTEN as readonly string[]).includes('orch-regels'));
    check('kern: normaliseerInhoud orch-regels → precies 4 velden, hash in kleine letters, vreemde velden weg', JSON.stringify(bk.normaliseerInhoud('orch-regels', { ...inhoud, hash: inhoud.hash.toUpperCase(), extra: 1 })) === JSON.stringify(inhoud));
    check('kern: ongeldige velden (versie, hash, kritiekHash, voorstel) → INHOUD_ONGELDIG', [{ ...inhoud, regelsVersie: '1.3' }, { ...inhoud, hash: 'abc' }, { ...inhoud, kritiekHash: '' }, { ...inhoud, voorstel: 'xyz' }, { ...inhoud, voorstel: hex(20) }].every((i) => { try { bk.normaliseerInhoud('orch-regels', i); return false; } catch (e) { return (e as Error).message === 'INHOUD_ONGELDIG'; } }));
    check('kern: canonieke tekst noemt het soort; hash verschilt per voorstel (de eigenaar tekent wat hij ziet)', bk.canoniekeTekst('orch-regels', inhoud).includes('\norch-regels\n') && bk.besluitHash('orch-regels', inhoud) !== bk.besluitHash('orch-regels', { ...inhoud, voorstel: hex(12) }) && bk.besluitHash('orch-regels', inhoud) === bk.besluitHash('orch-regels', { ...inhoud, hash: inhoud.hash.toUpperCase() }));
    check('kern: schakelaar orch-regels-passkey — ontbreekt = open, false = dicht, true = open', bk.besluitKanaalOpen('orch-regels', {}) && !bk.besluitKanaalOpen('orch-regels', { 'orch-regels-passkey': false }) && bk.besluitKanaalOpen('orch-regels', { 'orch-regels-passkey': true }));

    // ---------------------------------------------------------------- root-hulp: verifieer-besluit
    const los = besluitBestand(eigenaar, { soort: 'orch-regels', inhoud: { ...inhoud, voorstel: hex(12) } });
    writeFileSync(join(p.w, 'h.json'), los.tekst);
    const v = hulp('verifieer-besluit', join(p.w, 'h.json'));
    check('hulp: geldig orch-regels-besluit → OK met soort, genormaliseerde inhoud en vingerafdruk', v.status === 0 && v.uit?.ok === true && v.uit.soort === 'orch-regels' && v.uit.inhoud?.hash === inhoud.hash && v.uit.inhoud?.regelsVersie === '1.3.0' && v.uit.vingerafdruk === sleutel.vingerafdruk, JSON.stringify(v.uit) + v.stderr);

    // ---------------------------------------------------------------- root-script: goede weg
    const rechtenVoor = lees(p.rechten);
    let r = doe(eigenaar, { soort: 'orch-regels', inhoud });
    check('script: orch-regels → klaar/OK; uitkomst noemt regelsVersie, hash, kritiekHash, voorstel, passkey', r.r.status === 0 && r.st?.uitkomst === 'klaar' && r.st.code === 'OK' && r.st.soort === 'orch-regels' && r.st.regelsVersie === '1.3.0' && r.st.hash === inhoud.hash && r.st.kritiekHash === inhoud.kritiekHash && r.st.voorstel === inhoud.voorstel && r.st.passkey === vinger && /1\.3\.0/.test(r.st.uk) && /passkey/.test(r.st.nl), JSON.stringify(r.st) + r.r.stderr);
    const j = journal();
    check('script: root-journal orch-regels-bevestigd.jsonl (0600): één regel met besluit-id, velden, passkey en tijd', j.length === 1 && j[0].besluit === r.id && j[0].regelsVersie === '1.3.0' && j[0].hash === inhoud.hash && j[0].kritiekHash === inhoud.kritiekHash && j[0].voorstel === inhoud.voorstel && j[0].passkey === vinger && /^\d{4}-\d{2}-\d{2}T/.test(j[0].tijd) && (statSync(journalPad).mode & 0o777) === 0o600, JSON.stringify(j));
    const s1 = stand();
    check('script: statusbestand orch-regels-bevestigd.json voor de app (0640): bijgewerkt + bevestigingen = journal', !!s1 && s1.bevestigingen?.length === 1 && JSON.stringify(s1.bevestigingen[0]) === JSON.stringify(j[0]) && /^\d{4}-/.test(s1.bijgewerkt) && (statSync(standPad).mode & 0o777) === 0o640, JSON.stringify(s1));
    check('script: root voert niets uit — rechtenbestand ongewijzigd, installer niet aangeroepen, inbox leeg, journaalregel', lees(p.rechten) === rechtenVoor && !existsSync(p.installeerLog) && !existsSync(join(p.inbox, `besluit-${r.id}.json`)) && lees(join(p.werk, 'journaal.jsonl')).includes(r.id));
    check('script: gebeurtenis BESLUIT_ORCH_REGELS_OK (info, bron besluit, tag = id) voor de site', events().some((e) => e.bron === 'besluit' && e.code === 'BESLUIT_ORCH_REGELS_OK' && e.niveau === 'info' && e.tag === r.id && /1\.3\.0/.test(e.uk) && /passkey/.test(e.nl)));
    check('script: besluit-stand.json toont de schakelaar orchRegelsPasskey (open)', JSON.parse(lees(join(p.status, 'besluit-stand.json'))).schakelaars.orchRegelsPasskey === true);

    // De app leest het root-bestand (backend/orch-opslag.ts rootBevestigingen) — zelfde velden als het journal.
    process.env.OPDRACHT_STATUS_DIR = p.status;
    const opslag = await import('../../backend/orch-opslag');
    const bev = opslag.rootBevestigingen();
    check('app: rootBevestigingen() leest het root-bestand (besluit, hash, kritiekHash, voorstel, passkey)', bev.length === 1 && bev[0].besluit === r.id && bev[0].hash === inhoud.hash && bev[0].kritiekHash === inhoud.kritiekHash && bev[0].voorstel === inhoud.voorstel && bev[0].passkey === vinger && bev[0].regelsVersie === '1.3.0', JSON.stringify(bev));

    const inhoud2 = { ...inhoud, voorstel: hex(12) };
    r = doe(eigenaar, { soort: 'orch-regels', inhoud: inhoud2 });
    check('script: tweede besluit (ander voorstel) → journal 2 regels, statusbestand 2 bevestigingen in volgorde', r.st?.uitkomst === 'klaar' && journal().length === 2 && stand().bevestigingen.length === 2 && stand().bevestigingen[1].voorstel === inhoud2.voorstel && stand().bevestigingen[1].besluit === r.id);

    // ---------------------------------------------------------------- root-script: aanvallen
    r = doe(eigenaar, { soort: 'orch-regels', inhoud: { ...inhoud, hash: 'kort' }, tekenInhoud: inhoud, hashClaim: bk.besluitHash('orch-regels', inhoud) });
    check('script: ongeldige inhoud (hash geen 64 hex) → BESLUIT_INHOUD_ONGELDIG, journal ongewijzigd', r.st?.uitkomst === 'geweigerd' && r.st.code === 'BESLUIT_INHOUD_ONGELDIG' && journal().length === 2, JSON.stringify(r.st));
    const vreemd = nieuwePasskey();
    r = doe(vreemd, { soort: 'orch-regels', inhoud: { ...inhoud, voorstel: hex(12) } });
    check('script: vreemde passkey → BESLUIT_PASSKEY_SLEUTEL_ONBEKEND, niets vastgelegd, waarschuwing in gebeurtenissen', r.st?.uitkomst === 'geweigerd' && r.st.code === 'BESLUIT_PASSKEY_SLEUTEL_ONBEKEND' && journal().length === 2 && events().some((e) => e.code === 'BESLUIT_PASSKEY_SLEUTEL_ONBEKEND' && e.niveau === 'waarschuwing' && e.tag === r.id), JSON.stringify(r.st));
    { const f = besluitBestand(eigenaar, { soort: 'orch-regels', inhoud: { ...inhoud, voorstel: hex(12) } });
      writeFileSync(join(p.inbox, `besluit-${f.id}.json`), f.tekst); run('verwerk'); const a = status(f.id);
      writeFileSync(join(p.inbox, `besluit-${f.id}.json`), f.tekst); run('verwerk'); const b = status(f.id);
      check('script: dezelfde handtekening nogmaals → BESLUIT_PASSKEY_HERGEBRUIKT; journal telt het één keer', a?.uitkomst === 'klaar' && b?.uitkomst === 'geweigerd' && b.code === 'BESLUIT_PASSKEY_HERGEBRUIKT' && journal().length === 3, JSON.stringify(b)); }
    r = doe(eigenaar, { soort: 'orch-regels', inhoud: { ...inhoud, voorstel: hex(12) }, tekenInhoud: { ...inhoud, voorstel: hex(12) } });
    check('script: voorstel verwisseld na het tekenen (hash eerlijk herberekend) → handtekening past niet, niets vastgelegd', r.st?.uitkomst === 'geweigerd' && r.st.code === 'BESLUIT_PASSKEY_UITDAGING_ONJUIST' && journal().length === 3, JSON.stringify(r.st));
    r = doe(eigenaar, { soort: 'orch-regels', inhoud: { ...inhoud, voorstel: hex(12) }, tekenInhoud: { ...inhoud, voorstel: hex(12) }, hashClaim: bk.besluitHash('orch-regels', inhoud) });
    check('script: app liegt over de hash → BESLUIT_HASH_VERSCHILT', r.st?.code === 'BESLUIT_HASH_VERSCHILT' && journal().length === 3, JSON.stringify(r.st));
    writeFileSync(p.rechten, JSON.stringify({ ...rechten(), 'orch-regels-passkey': false }));
    r = doe(eigenaar, { soort: 'orch-regels', inhoud: { ...inhoud, voorstel: hex(12) } });
    check('script: schakelaar "orch-regels-passkey": false → BESLUIT_UIT; stand toont orchRegelsPasskey = false', r.st?.code === 'BESLUIT_UIT' && journal().length === 3 && JSON.parse(lees(join(p.status, 'besluit-stand.json'))).schakelaars.orchRegelsPasskey === false, JSON.stringify(r.st));
    { const d = rechten(); delete d['orch-regels-passkey']; writeFileSync(p.rechten, JSON.stringify(d)); }
    check('script: andere soorten blijven werken naast orch-regels (externe hosts → klaar)', doe(eigenaar, { soort: 'externe-hosts', inhoud: { hosts: ['api.githubcopilot.com'] } }).st?.uitkomst === 'klaar' && journal().length === 3);

    // ---------------------------------------------------------------- GitOps: PYMODUS tegen het ECHTE root-journal
    const bron = join(p.w, 'bron'); mkdirSync(join(bron, 'orchestratie'), { recursive: true });
    const beleidAuto = { kritiek: { installatieModi: { toegestaan: ['handmatig', 'na_bevestiging', 'automatisch_beperkt'] } } };
    const schrijfBron = (beleid: unknown, lock: unknown) => { writeFileSync(join(bron, 'orchestratie/beleid.json'), JSON.stringify(beleid)); writeFileSync(join(bron, 'orchestratie/regels.lock.json'), JSON.stringify(lock)); };
    const uuidVan = (kort: string) => `${kort.slice(0, 8)}-${kort.slice(8, 12)}-${kort.slice(12, 16)}-${kort.slice(16, 20)}-${kort.slice(20)}`;
    const eig = { soort: 'passkey', kritiekHash: inhoud.kritiekHash, regelsVersie: '1.3.0', hash: inhoud.hash, voorstel: inhoud.voorstel, besluit: uuidVan(j[0].besluit), passkey: j[0].passkey, op: j[0].tijd };
    const lockP = { schema: 1, regelsVersie: '1.3.0', hash: inhoud.hash, kritiekHash: inhoud.kritiekHash, bestanden: {}, eigenaar: eig };
    schrijfBron(beleidAuto, lockP);
    let g = gitopsModus(bron, journalPad);
    check('gitops: lock met passkey-bevestiging die in het root-journal staat (uuid ↔ 32 hex) → toegestaan', g.code === 0 && g.uit === '', g.uit);
    g = gitopsModus(bron, join(p.w, 'bestaat-niet.jsonl'));
    check('gitops: geen root-journal → geweigerd («ontbreekt»)', g.code !== 0 && /ontbreekt/.test(g.uit), g.uit);
    schrijfBron(beleidAuto, { ...lockP, eigenaar: { ...eig, besluit: randomUUID() } });
    g = gitopsModus(bron, journalPad);
    check('gitops: besluit-id niet in het journal (een agent zet zelf soort=passkey in de repo) → geweigerd', g.code !== 0 && /root-journal/.test(g.uit), g.uit);
    schrijfBron(beleidAuto, { ...lockP, eigenaar: { ...eig, voorstel: hex(12) } });
    check('gitops: ander voorstel-id dan in het journal → geweigerd', gitopsModus(bron, journalPad).code !== 0);
    schrijfBron(beleidAuto, { ...lockP, eigenaar: { ...eig, hash: hex(32) } });
    check('gitops: andere regels-hash dan bevestigd → geweigerd', gitopsModus(bron, journalPad).code !== 0);
    schrijfBron(beleidAuto, { ...lockP, kritiekHash: hex(32) });
    check('gitops: kritiekHash van de lock ≠ bevestigde → geweigerd (niet (meer) bevestigd)', /niet \(meer\) door de eigenaar bevestigd/.test(gitopsModus(bron, journalPad).uit));
    schrijfBron(beleidAuto, { ...lockP, eigenaar: { ...eig, passkey: 'zz' } });
    check('gitops: onvolledige passkey-bevestiging in de lock → geweigerd', /onvolledig/.test(gitopsModus(bron, journalPad).uit));
    writeFileSync(join(p.w, 'kapot.jsonl'), '{niet json\n');
    schrijfBron(beleidAuto, lockP);
    check('gitops: kapot journal → geweigerd (onleesbaar), geen uitzondering', /onleesbaar/.test(gitopsModus(bron, join(p.w, 'kapot.jsonl')).uit));
    schrijfBron(beleidAuto, { ...lockP, eigenaar: { kritiekHash: inhoud.kritiekHash, regelsVersie: '1.3.0', handtekening: '-----BEGIN SSH SIGNATURE-----\nx\n-----END SSH SIGNATURE-----', op: j[0].tijd } });
    check('gitops: SSH-handtekening blijft de andere weg (geen journal nodig)', gitopsModus(bron, join(p.w, 'bestaat-niet.jsonl')).code === 0);
    schrijfBron(beleidAuto, { ...lockP, eigenaar: null });
    check('gitops: zonder eigenaar → geweigerd', gitopsModus(bron, journalPad).code !== 0);
    schrijfBron({ kritiek: { installatieModi: { toegestaan: ['handmatig', 'na_bevestiging'] } } }, lockP);
    check('gitops: automatisch_beperkt niet toegestaan → geweigerd, ook met geldige bevestiging', /automatisch_beperkt/.test(gitopsModus(bron, journalPad).uit));
    const gitops = lees(GITOPS);
    check('plafond: gitops leest het root-journal van mijn-ruimte-besluit en negeert GITOPS_ORCH_BEVESTIGD als root', gitops.includes('GITOPS_ORCH_BEVESTIGD:-/var/lib/mijn-ruimte/besluit/orch-regels-bevestigd.jsonl') && /unset [^\n]*\n?[^\n]*GITOPS_ORCH_BEVESTIGD/.test(gitops) && gitops.includes('"$BRON" "$ORCH_BEVESTIGD"'));
    check('plafond: het root-script schrijft het journal in zijn eigen werkmap (/var/lib/mijn-ruimte/besluit) — dezelfde als gitops leest', lees('deploy/besluit/mijn-ruimte-besluit.sh').includes('WERK="${BESLUIT_WERK:-/var/lib/mijn-ruimte/besluit}"') && lees('deploy/besluit/mijn-ruimte-besluit.sh').includes('os.path.join(werk, "orch-regels-bevestigd.jsonl")'));
  } finally {
    rmSync(p.w, { recursive: true, force: true });
  }
  return einde();
}
