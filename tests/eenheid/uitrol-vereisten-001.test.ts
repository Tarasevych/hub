// UITROL-001 · Перевірка вимог до завантаження й проба міграцій на копії схеми.
// Echte gedragscontroles: pure regels, de beoordeling met een nep-omgeving, het verwerken van een echte proefuitslag, en — als
// PROEF_PG_URL (superuser-URL van een TEST-PostgreSQL) gezet is — het root-script zelf onder uid 65534 met shims voor runuser en
// systemd-run, tegen een echte database met het gebroken 0200-geval (301 tekens tegen CHECK ≤ 300).
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beoordeelToegepasteMigraties, fragmentRond, pgUitleg, positieNaarRegel, regelVoorTabel, teLangeTekst, telVereisten, oorzaakUitProef, type MigratieProefUitslag } from '../../shared/uitrol-vereisten';
import { _sessies, proefVerwerken, proefVoorArchief, vereistenBeoordelen, type VereistenOmgeving } from '../../backend/uitrol-vereisten';
import { pakketVoorcontrole } from '../../backend/uitrol-voorcontrole';
import { createHash } from 'node:crypto';
import { proefUrl } from '../../server/migratie-proef';
import { checker } from './hulp/nep-google';
import { gzipSync } from 'node:zlib';
import { leesPakket } from '../../src/platform/tar-lezen';
import { rapportTekst, zonderUrlWachtwoord } from '../../src/uitrol/probleem-rapport';
import { archiefBeschrijving, vereistenControleren } from '../../src/uitrol/vereisten-client';
import { api } from '../../src/platform/client';
import type { VereistenAntwoord } from '../../shared/uitrol-vereisten';

/** Minimale ustar-kop + inhoud (zelfde vorm als tests/eenheid/tar-lezen.test.ts). */
function tarKop(naam: string, grootte: number, type = '0') {
  const b = Buffer.alloc(512);
  b.write(naam, 0, 100); b.write('0000644\0', 100); b.write('0000000\0', 108); b.write('0000000\0', 116);
  b.write(grootte.toString(8).padStart(11, '0') + '\0', 124); b.write('00000000000\0', 136); b.write('        ', 148); b.write(type, 156); b.write('ustar\0', 257); b.write('00', 263);
  let som = 0; for (const x of b) som += x; b.write(som.toString(8).padStart(6, '0') + '\0 ', 148);
  return b;
}
const tarBestand = (naam: string, tekst: string) => { const d = Buffer.from(tekst); return [tarKop(naam, d.length), Buffer.concat([d, Buffer.alloc((512 - (d.length % 512)) % 512)])]; };

const SQL_0200 = `-- opmerking\nINSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard)\nVALUES ('x',\n  '${'а'.repeat(301)}',\n  false, false)\nON CONFLICT (sleutel) DO NOTHING;\n`;

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-vereisten-001');

  // ---- pure regels
  check('positie → regel (1-gebaseerd, ook met meerdere regels)', positieNaarRegel('a\nb\ncdef', 6) === 3 && positieNaarRegel('abc', 0) === null);
  const tl = teLangeTekst(SQL_0200, 'CHECK ((char_length(omschrijving) <= 300))');
  check('teLangeTekst: 301 > 300 op regel 4', tl?.lengte === 301 && tl?.grens === 300 && tl?.regel === 4, JSON.stringify(tl));
  check('teLangeTekst: < N telt als N-1', teLangeTekst("'abcd'", 'CHECK (length(x) < 4)')?.grens === 3);
  check('teLangeTekst: binnen de grens → null', teLangeTekst("'abc'", 'CHECK ((char_length(o) <= 300))') === null);
  check('regelVoorTabel: INSERT INTO app.feature_flags → regel 2', regelVoorTabel(SQL_0200, 'feature_flags') === 2);
  check('fragmentRond toont regelnummer en buren', /   4 │ /.test(fragmentRond(SQL_0200, 4)) && fragmentRond(SQL_0200, 4).split('\n').length === 3);
  const u = pgUitleg('23514', 'feature_flags_omschrijving_check', 'CHECK ((char_length(omschrijving) <= 300))', { lengte: 301, grens: 300 });
  check('uitleg bij te lange tekst noemt 301 en 300 (uk + nl)', /301/.test(u.uitlegUk) && /300/.test(u.uitlegUk) && /301/.test(u.uitlegNl) && /1 знак/.test(u.actieUk));
  check('onbekende code → algemene uitleg', /помилкою бази/.test(pgUitleg('XX000').uitlegUk));
  check('telVereisten: fout blokkeert', telVereisten([{ niveau: 'ok' }, { niveau: 'fout' }, { niveau: 'waarschuwing' }]).blokkeert === true && telVereisten([{ niveau: 'ok' }, { niveau: 'waarschuwing' }]).blokkeert === false);
  const bmOk = beoordeelToegepasteMigraties(['0093_zoek_index', '0094_zoek_rls', '0198_x'], ['0093_globaal_zoeken_laatste', '0093_zoek_index', '0094_zoekindex', '0094_zoek_rls', '0198_x', 'rechten']);
  check('beoordeelToegepasteMigraties: oktober-hernoeming met aanwezige opvolger → ok, niet ontbrekend', bmOk.echtOntbrekend.length === 0 && bmOk.historischHernoemd.length === 2 && bmOk.historischHernoemd[0].nieuw === '0093_zoek_index');
  const bmZonderOpvolger = beoordeelToegepasteMigraties(['0198_x'], ['0093_globaal_zoeken_laatste', '0198_x', '0205_nieuw']);
  check('beoordeelToegepasteMigraties: zonder opvolger of echt verdwenen → echtOntbrekend', bmZonderOpvolger.echtOntbrekend.join(',') === '0093_globaal_zoeken_laatste,0205_nieuw' && bmZonderOpvolger.historischHernoemd.length === 0);
  let weigert = false; try { proefUrl({ DATABASE_URL_MIGRATIE: 'postgres://m:p@127.0.0.1/live' }, 'mijnruimte_live'); } catch { weigert = true; }
  check('proefUrl weigert elke naam behalve mijnruimte_proef_*', weigert);
  check('proefUrl buigt de database om, rol blijft', proefUrl({ DATABASE_URL_MIGRATIE: 'postgres://m:p@127.0.0.1:5432/live' }, 'mijnruimte_proef_1').endsWith('/mijnruimte_proef_1') && proefUrl({ DATABASE_URL: 'postgres://m:p@h/live' }, 'mijnruimte_proef_1').startsWith('postgres://m:p@'));

  // ---- beoordeling met nep-omgeving
  const omg = (o: Partial<VereistenOmgeving> = {}): VereistenOmgeving => ({
    actief: () => ({ versie: '20261109-060206', commit: 'a'.repeat(40) }), toegepast: async () => new Set(['0198_x', '0199_y']), pg: async () => ({ tekst: '16.4', melding: null }),
    lopendeInstallatie: async () => false, vrijeSchijf: async () => 50 * 1024 ** 3, rootLeeftijdSec: async () => 30, passkeyKlaar: async () => true, proefBeschikbaar: async () => true,
    archiefOnline: async () => ({ ok: true, code: 'OK', reden: '' }), ...o });
  const dossier = (versie: string) => JSON.stringify({ schema: 1, taakId: 'UITROL-001', repo: 'Tarasevych/hub', tak: 'feature/uitrol-001-20261109-100000', commit: 'b'.repeat(40),
    pad: 'orchestratie/ontwikkelarchieven/UITROL-001.json', sha256: 'e'.repeat(64), url: `https://github.com/Tarasevych/hub/blob/${'b'.repeat(40)}/orchestratie/ontwikkelarchieven/UITROL-001.json`,
    release: `https://github.com/Tarasevych/hub/releases/tag/${versie}`, pakket: `mijn-ruimte-${versie}.tar.gz` });
  const archief = (o: Record<string, unknown> = {}) => ({ bestand: 'mijn-ruimte-20261109-065647.tar.gz', bytes: 40_000_000, versie: '20261109-065647', commit: 'b'.repeat(40), bovenmap: 'm', bestanden: 900,
    auteur: 'Павло', agent: 'claude', samenvattingTekens: 120, manifest: true, manifestFouten: 0, installer: true, basis: { versie: '20261109-060206', commit: 'a'.repeat(40) },
    migraties: [{ naam: '0198_x', bytes: 1 }, { naam: '0199_y', bytes: 1 }, { naam: '0200_identiteit_account_maquette', bytes: 900 }], problemen: [], leesMs: 120, sha256: 'c'.repeat(64), ontwikkelArchief: dossier(String(o.versie || '20261109-065647')), ...o }) as never;
  const a1 = await vereistenBeoordelen(archief(), omg());
  const v = (id: string) => a1.vereisten.find((x) => x.id === id);
  check('nieuwe migratie gevonden en proef wacht op SQL', a1.nieuweMigraties.join() === '0200_identiteit_account_maquette' && a1.proef.status === 'wacht-op-sql' && v('migratie-proef')?.niveau === 'wacht' && a1.klaar === false);
  check('alle overige vereisten ok → nog niet blokkerend', a1.ok === true && a1.vereisten.filter((x) => x.niveau === 'fout').length === 0, a1.vereisten.filter((x) => x.niveau === 'fout').map((x) => `${x.id}: ${x.waardeNl}`).join('; '));
  check('GitHub-dossier bevestigd → «github» ok', a1.vereisten.find((x) => x.id === 'github')?.niveau === 'ok');
  check('elke vereiste heeft uitleg «waarom» in uk + nl', a1.vereisten.every((x) => x.waaromUk.length > 30 && x.waaromNl.length > 30));
  check('elke vereiste (behalve de proef) heeft een duur', a1.vereisten.filter((x) => x.id !== 'migratie-proef').every((x) => typeof x.ms === 'number'));
  check('log heeft tijdstempels', a1.log.length > 5 && a1.log.every((r) => !Number.isNaN(Date.parse(r.t))));
  const a2 = await vereistenBeoordelen(archief({ basis: { versie: '20261109-051901', commit: 'd'.repeat(40) } }), omg());
  check('basis ouder dan geïnstalleerd → fout (BASIS_VEROUDERD vóór de upload)', a2.vereisten.find((x) => x.id === 'basis')?.niveau === 'fout' && a2.ok === false);
  const a3 = await vereistenBeoordelen(archief({ versie: '20261109-050000' }), omg());
  check('niet nieuwer → fout', a3.vereisten.find((x) => x.id === 'versie')?.niveau === 'fout');
  const a4 = await vereistenBeoordelen(archief(), omg({ vrijeSchijf: async () => 1024 ** 3 }));
  check('te weinig schijfruimte → fout', a4.vereisten.find((x) => x.id === 'schijf')?.niveau === 'fout');
  const a5 = await vereistenBeoordelen(archief(), omg({ proefBeschikbaar: async () => false }));
  check('proefdienst nog niet op de server → waarschuwing, niet blokkeren', a5.vereisten.find((x) => x.id === 'migratie-proef')?.niveau === 'waarschuwing' && a5.proef.status === 'niet-beschikbaar' && a5.klaar === true);
  const a6 = await vereistenBeoordelen(archief({ migraties: [{ naam: '0198_x', bytes: 1 }, { naam: '0199_y', bytes: 1 }, { naam: '0199_z', bytes: 1 }] }), omg());
  check('dubbel migratienummer → fout', a6.vereisten.find((x) => x.id === 'migratie-namen')?.niveau === 'fout');
  const a7 = await vereistenBeoordelen(archief({ versie: '20261110-000000', ontwikkelArchief: null }), omg());
  check('verplicht ontwikkeldossier ontbreekt → fout «github»', a7.vereisten.find((x) => x.id === 'github')?.niveau === 'fout');
  const a8 = await vereistenBeoordelen(archief({ migraties: [{ naam: '0198_x', bytes: 1 }, { naam: '0199_y', bytes: 1 }] }), omg());
  check('geen nieuwe migraties → proef niet nodig, klaar', a8.proef.status === 'niet-nodig' && a8.klaar === true && a8.vereisten.find((x) => x.id === 'migratie-proef')?.niveau === 'ok');
  const a8b = await vereistenBeoordelen(
    archief({ migraties: [{ naam: '0093_zoek_index', bytes: 1 }, { naam: '0094_zoek_rls', bytes: 1 }, { naam: '0198_x', bytes: 1 }, { naam: '0199_y', bytes: 1 }] }),
    omg({ toegepast: async () => new Set(['0093_globaal_zoeken_laatste', '0093_zoek_index', '0094_zoekindex', '0094_zoek_rls', '0198_x', '0199_y']) }),
  );
  const mnHernoemd = a8b.vereisten.find((x) => x.id === 'migratie-namen');
  check('historisch hernoemde oktober-migraties met aanwezige opvolger → ok, geen vals alarm', mnHernoemd?.niveau === 'ok' && a8b.ok === true && !!mnHernoemd?.details?.includes('0093_globaal_zoeken_laatste → 0093_zoek_index'));
  const a8c = await vereistenBeoordelen(archief({ migraties: [{ naam: '0198_x', bytes: 1 }] }), omg());
  const mnOntbreekt = a8c.vereisten.find((x) => x.id === 'migratie-namen');
  check('echt verdwenen toegepaste migratie → blokkerende fout MIGRATIES_ONTBREKEN vóór upload', mnOntbreekt?.niveau === 'fout' && a8c.ok === false && /MIGRATIES_ONTBREKEN/.test(mnOntbreekt?.waardeUk || '') && /0199_y/.test(mnOntbreekt?.waardeUk || ''));

  // ---- proefuitslag verwerken (vorm = echte uitvoer van server/migratie-proef.ts)
  const uitslag: MigratieProefUitslag = { id: a1.id, ok: false, status: 'mislukt', code: 'MIGRATIE_PROEF_MISLUKT', tijd: new Date().toISOString(), pg: '16.4',
    stappen: [{ id: 'kopie', ms: 80, ok: true }, { id: 'schema', ms: 1100, ok: true }, { id: 'migraties', ms: 5, ok: false }, { id: 'opruimen', ms: 40, ok: true }],
    migraties: [{ naam: '0200_identiteit_account_maquette', ms: 3, ok: false, fout: { code: '23514', bericht: 'new row for relation "feature_flags" violates check constraint "feature_flags_omschrijving_check"', constraint: 'feature_flags_omschrijving_check', tabel: 'feature_flags', regel: 4, definitie: 'CHECK ((char_length(omschrijving) <= 300))', teLang: { lengte: 301, grens: 300 } } }] };
  const a9 = proefVerwerken(a1, uitslag, () => SQL_0200);
  const pv = a9.vereisten.find((x) => x.id === 'migratie-proef');
  check('mislukte proef → fout, blokkeert, klaar', pv?.niveau === 'fout' && a9.ok === false && a9.klaar === true && a9.proef.status === 'klaar');
  check('oorzaak: migratie, regel 4, 301 > 300, fragment uit de SQL', pv?.oorzaak?.migratie === '0200_identiteit_account_maquette' && pv?.oorzaak?.regel === 4 && /301/.test(pv?.oorzaak?.uitlegUk || '') && /   4 │/.test(pv?.oorzaak?.fragment || ''));
  check('duur van de proef = som van de stappen', pv?.ms === 1225);
  check('proeflog noemt kopie/schema/migraties en de fout', a9.log.some((r) => /kopie 80 ms · schema 1100 ms/.test(r.tekst)) && a9.log.some((r) => r.niveau === 'fout' && /0200/.test(r.tekst)));
  const goed = proefVerwerken(a1, { ...uitslag, ok: true, status: 'klaar', migraties: [{ naam: '0200_identiteit_account_maquette', ms: 41, ok: true }] });
  check('geslaagde proef → ok en duur per migratie in de waarde', goed.ok === true && goed.vereisten.find((x) => x.id === 'migratie-proef')?.niveau === 'ok' && /41 мс/.test(goed.vereisten.find((x) => x.id === 'migratie-proef')?.waardeUk || ''));
  const nb = proefVerwerken(a1, { ...uitslag, ok: false, status: 'niet-beschikbaar', code: 'GEEN_PROEFSCRIPT', migraties: [] });
  check('proef niet uitvoerbaar → waarschuwing, niet blokkeren', nb.ok === true && nb.vereisten.find((x) => x.id === 'migratie-proef')?.niveau === 'waarschuwing');
  check('oorzaakUitProef zonder fout → null', oorzaakUitProef({ ...uitslag, migraties: [] }) === null);

  // ---- root-script: syntaxis altijd; echte proef alleen met een test-PostgreSQL
  check('root-script: bash -n', spawnSync('bash', ['-n', 'deploy/uitrol/mijn-ruimte-migratie-proef.sh']).status === 0);
  const tekstScript = readFileSync('deploy/uitrol/mijn-ruimte-migratie-proef.sh', 'utf8');
  check('root-script draait pakket-SQL nooit via psql of als postgres', !/pg_root\s+psql[^\n]*\$map/.test(tekstScript) && /-p User="\$GEBRUIKER"/.test(tekstScript) && /NoNewPrivileges=yes/.test(tekstScript));
  check('installer probeert migraties vóór kopiëren en bouwen', (() => { const s = readFileSync('deploy/installeer-app.sh', 'utf8'); const i = s.indexOf('  migratie_proef "$bron"'); return i > 0 && i < s.indexOf('voortgang kopie 45'); })());
  const PG = process.env.PROEF_PG_URL;
  if (PG && existsSync('/usr/bin/setpriv')) {
    const d = mkdtempSync(join(tmpdir(), 'proef-test-')); chmodSync(d, 0o777);
    const shims = join(d, 'bin'); mkdirSync(shims); chmodSync(shims, 0o755);
    const u = new URL(PG);
    // runuser -u postgres -- cmd… → cmd met de superuser-URL (alleen in deze test).
    writeFileSync(join(shims, 'runuser'), `#!/bin/bash\nshift 3\nexport PGHOST=${u.hostname} PGPORT=${u.port || 5432} PGUSER=${u.username} PGPASSWORD=${decodeURIComponent(u.password)}\nexec "$@"\n`, { mode: 0o755 });
    writeFileSync(join(shims, 'id'), `#!/bin/bash\n[ "$1" = postgres ] && exit 0\nexec /usr/bin/id "$@"\n`, { mode: 0o755 });
    // systemd-run: alleen -E en EnvironmentFile overnemen, dan het programma uitvoeren.
    writeFileSync(join(shims, 'systemd-run'), `#!/bin/bash\nargs=()\nwhile [ $# -gt 0 ]; do case "$1" in -E) export "$2"; shift 2;; -p) case "$2" in EnvironmentFile=*) f="\${2#EnvironmentFile=}"; f="\${f#-}"; [ -f "$f" ] && { set -a; . "$f"; set +a; };; esac; shift 2;; --*) shift;; *) break;; esac; done\nexec "$@"\n`, { mode: 0o755 });
    const mig = join(d, 'mig'); mkdirSync(mig); writeFileSync(join(mig, '0200_identiteit_account_maquette.sql'), readFileSync('tests/fixtures/uitrol/0200-omschrijving-301.sql', 'utf8'));
    const env = join(d, 'migratie.env'); writeFileSync(env, `DATABASE_URL_MIGRATIE=${process.env.PROEF_MIGRATOR_URL}\n`); chmodSync(env, 0o644);
    const script = join(d, 'migratie-proef.mjs');
    execFileSync('node_modules/.bin/esbuild', ['server/migratie-proef.ts', '--bundle', '--platform=node', '--format=esm', '--external:pg-native', `--outfile=${script}`, '--log-level=error', "--banner:js=import { createRequire as __c } from 'node:module'; const require = __c(import.meta.url);"]);
    for (const f of [mig, join(mig, '0200_identiteit_account_maquette.sql'), script]) chmodSync(f, 0o755);
    const uit = join(d, 'uitslag.json');
    const t0 = Date.now();
    const r = spawnSync('setpriv', ['--reuid=65534', '--regid=65534', '--clear-groups', 'bash', 'deploy/uitrol/mijn-ruimte-migratie-proef.sh', '--map', mig, '--uit', uit, '--script', script],
      { encoding: 'utf8', env: { PATH: `${shims}:${process.env.PATH}`, PROEF_WERK: join(d, 'werk'), PROEF_STATUS_DIR: d, PROEF_GEHEIMEN: join(d, 'geen.env'), PROEF_MIGRATIE_ENV: env, PROEF_GEBRUIKER: 'nogroup', NODE: process.execPath, HOME: d } });
    const ms = Date.now() - t0;
    let j: MigratieProefUitslag | null = null; try { j = JSON.parse(readFileSync(uit, 'utf8')); } catch { /* */ }
    const f = j?.migraties[0]?.fout;
    check('root-script: gebroken 0200 → exitcode 4', r.status === 4, `status ${r.status}; ${String(r.stderr).split('\n').slice(-4).join(' | ')}`);
    check('root-script: uitslag noemt 23514, de beperking, regel 7 en 301 > 300', f?.code === '23514' && f?.constraint === 'feature_flags_omschrijving_check' && f?.regel === 7 && f?.teLang?.lengte === 301 && f?.teLang?.grens === 300, JSON.stringify(f || j));
    check('root-script: vier stappen met duur, binnen 30 s', j?.stappen.map((s) => s.id).join() === 'kopie,schema,migraties,opruimen' && ms < 30_000, `${ms} ms`);
    const over = execFileSync('psql', [PG, '-At', '-c', "SELECT count(*) FROM pg_database WHERE datname LIKE 'mijnruimte\\_proef\\_%'"], { encoding: 'utf8' }).trim();
    check('root-script: geen proefdatabase achtergebleven', over === '0', over);
    const live = new URL(process.env.PROEF_MIGRATOR_URL || PG); live.username = u.username; live.password = u.password;
    const nog = execFileSync('psql', [live.toString(), '-At', '-c', "SELECT count(*) FROM app.schema_migrations WHERE version = '0200_identiteit_account_maquette'"], { encoding: 'utf8' }).trim();
    check('root-script: productiedatabase onaangeroerd (0200 niet toegepast)', nog === '0', nog);
  } else console.log('(root-script-proef overgeslagen: PROEF_PG_URL niet gezet)');
  // ---------------------------------------------------------------- browserkant: archief lezen → beschrijving → proef → stand
  {
    const sql0200 = readFileSync('tests/fixtures/uitrol/0200-omschrijving-301.sql', 'utf8');
    const P = 'mijn-ruimte-20261109-065647';
    const tgz = gzipSync(Buffer.concat([
      ...tarBestand(`${P}/UITROL-VERSIE`, '20261109-065647'), ...tarBestand(`${P}/deploy/installeer-app.sh`, '#!/bin/bash\n'),
      ...tarBestand(`${P}/UITROL-BASIS`, `versie=20261109-060206\ncommit=${'b'.repeat(40)}\nregelsVersie=1\n`),
      ...tarBestand(`${P}/ONTWIKKELARCHIEF.json`, '{"taak":"IDENTITEIT-007"}'),
      ...tarBestand(`${P}/migrations/0199_iets.sql`, 'SELECT 1;'), ...tarBestand(`${P}/migrations/0200_identiteit_account_maquette.sql`, sql0200),
      ...tarBestand(`${P}/migrations/LEESMIJ.md`, 'geen migratie'), ...tarBestand(`${P}/src/migrations/0300_x.sql`, 'SELECT 3;'),
      Buffer.alloc(1024)]));
    const { info, sha256 } = await leesPakket(new Blob([tgz]));
    check('browser: migraties (naam + grootte) uit migrations/ direct onder de bovenmap; geen andere .sql of .md', info.migraties.map((m) => m.naam).join() === '0199_iets,0200_identiteit_account_maquette' && info.migraties[1].bytes === Buffer.byteLength(sql0200), JSON.stringify(info.migraties));
    check('browser: SQL-tekst in het geheugen, exact', info.migratieSql.get('0200_identiteit_account_maquette') === sql0200 && info.migratieSql.size === 2);
    check('browser: UITROL-BASIS versie/commit gelezen', info.basis?.versie === '20261109-060206' && info.basis?.commit === 'b'.repeat(40), JSON.stringify(info.basis));
    check('browser: ONTWIKKELARCHIEF.json als ruwe tekst', info.ontwikkelArchief === '{"taak":"IDENTITEIT-007"}');
    const besch = archiefBeschrijving(info, { name: 'x.tar.gz', size: tgz.length }, 12.4);
    check('beschrijving: alleen namen en groottes van migraties, geen SQL', JSON.stringify(besch).includes('0200_identiteit') && !JSON.stringify(besch).includes('feature_flags') && besch.leesMs === 12);

    // vereistenControleren met een nep-API: start → proef (alleen de nieuwe SQL) → stand tot klaar.
    const verzoeken: Array<{ url: string; body: Record<string, unknown> }> = [];
    const basisAnt = (stand: VereistenAntwoord['proef']['status'], extra: Partial<VereistenAntwoord> = {}): VereistenAntwoord => ({ id: 'v1', tijd: new Date().toISOString(), ok: true, klaar: stand !== 'wacht-op-sql' && stand !== 'bezig', ms: 30, vereisten: [], nieuweMigraties: stand === 'wacht-op-sql' ? ['0200_identiteit_account_maquette'] : [], proef: { status: stand }, log: [], ...extra });
    let standen = 0;
    const origineel = api.post;
    (api as { post: unknown }).post = async (url: string, body: Record<string, unknown>) => {
      verzoeken.push({ url, body });
      if (url.endsWith('/vereisten')) return { data: basisAnt('wacht-op-sql') };
      if (url.endsWith('/vereisten/proef')) return { data: basisAnt('bezig') };
      standen++;
      return { data: standen < 2 ? basisAnt('bezig') : basisAnt('klaar', { ok: false, klaar: true }) };
    };
    const tussen: string[] = [];
    try {
      const eind = await vereistenControleren({}, { info, sha256, bestand: { name: 'x.tar.gz', size: tgz.length }, leesMs: 5 }, (a) => tussen.push(a.proef.status));
      const proefBody = verzoeken.find((v) => v.url.endsWith('/proef'))?.body as { migraties?: Array<{ naam: string; sql: string }> } | undefined;
      check('client: volgorde vereisten → proef → stand…', verzoeken.map((v) => v.url.split('/').pop()).join() === 'vereisten,proef,stand,stand', verzoeken.map((v) => v.url).join());
      check('client: proef krijgt ALLEEN de nieuwe migratie (0200), met de exacte SQL', proefBody?.migraties?.length === 1 && proefBody.migraties[0].naam === '0200_identiteit_account_maquette' && proefBody.migraties[0].sql === sql0200);
      check('client: start stuurt sha256 en ontwikkelArchief mee, geen SQL', (verzoeken[0].body.archief as { sha256?: string }).sha256 === sha256 && !JSON.stringify(verzoeken[0].body).includes('feature_flags'));
      check('client: eindstand klaar + blokkeert; tussenstanden gemeld', eind.klaar && !eind.ok && tussen.join() === 'wacht-op-sql,bezig,bezig,klaar', tussen.join());
      // Te grote SQL: niets versturen, eerlijke waarschuwing (root probeert bij de installatie).
      verzoeken.length = 0;
      const groot = { ...info, migratieSql: new Map([['0200_identiteit_account_maquette', 'x'.repeat(1024 * 1024 + 10)]]) };
      const g = await vereistenControleren({}, { info: groot, sha256, bestand: { name: 'x', size: 1 }, leesMs: 1 }, () => undefined);
      check('client: SQL > 1 MB → geen proefverzoek, klaar met «niet-beschikbaar»', verzoeken.length === 1 && g.klaar && g.proef.status === 'niet-beschikbaar' && g.log.some((l) => l.tekst.includes('proef overgeslagen')));
    } finally { (api as { post: unknown }).post = origineel; }

    // Probleemrapport: alles in één tekst, zonder geheimen.
    const ant = proefVerwerken(basisAnt('wacht-op-sql', { vereisten: [{ id: 'migratie-proef', groep: 'compatibiliteit', niveau: 'wacht', uk: 'Проба', nl: 'Proef', waaromUk: '', waaromNl: '' }], log: [{ t: '2026-11-09T09:13:47.100Z', niveau: 'info', tekst: 'start postgres://mijnruimte_migrator:geheim123@127.0.0.1/db' }] }),
      { id: 'v1', ok: false, status: 'mislukt', tijd: '', stappen: [{ id: 'migraties', ms: 40, ok: false }], migraties: [{ naam: '0200_identiteit_account_maquette', ms: 40, ok: false, fout: { code: '23514', bericht: 'new row violates check constraint', constraint: 'feature_flags_omschrijving_check', definitie: 'CHECK ((char_length(omschrijving) <= 300))', regel: 7, teLang: { lengte: 301, grens: 300 } } }], pg: '16.4' },
      (n) => (n === '0200_identiteit_account_maquette' ? sql0200 : undefined));
    const rap = rapportTekst({ lang: 'uk', beschrijving: 'Встановлював через Admin. Токен ghp_' + 'A'.repeat(36), antwoord: ant, archief: { bestand: 'x.tar.gz', bytes: 1, versie: '20261109-065647', commit: 'c'.repeat(40), sha256, agent: 'claude', auteur: 'Claude' },
      omgeving: { actieveVersie: '20261109-060206', site: 'api.tarasevych.com', browser: 'test', tijdzone: 'Europe/Brussels' }, delen: { oorzaak: true, vereisten: true, log: true, context: true } });
    check('rapport: oorzaak met migratie, regel, beperking, 301 > 300 en wat te doen', ['0200_identiteit_account_maquette', 'рядок 7', 'feature_flags_omschrijving_check', '301 > 300', 'Що робити'].every((x) => rap.tekst.includes(x)), rap.tekst.slice(0, 600));
    check('rapport: geen wachtwoord uit een URL en geen GitHub-token', !rap.tekst.includes('geheim123') && !rap.tekst.includes('ghp_' + 'A'.repeat(36)) && rap.gemaskeerd.length >= 1, rap.gemaskeerd.join());
    check('rapport: journaal met tijd tot ms; context met versies', rap.tekst.includes('09:13:47.100') && rap.tekst.includes('20261109-060206') && rap.tekst.includes('Europe/Brussels'));
    const zonder = rapportTekst({ lang: 'nl', beschrijving: '', antwoord: ant, archief: null, omgeving: { actieveVersie: '', site: '', browser: '', tijdzone: '' }, delen: { oorzaak: true, vereisten: false, log: false, context: false } });
    check('rapport: uitgeschakelde delen ontbreken (nl)', zonder.tekst.includes('Oorzaak') && !zonder.tekst.includes('## Logboek') && !zonder.tekst.includes('## Context'));
    check('zonderUrlWachtwoord: https://u:p@h → https://u:***@h', zonderUrlWachtwoord('x https://user:pw@host/y') === 'x https://user:***@host/y');

    // ---------------------------------------------------------------- binding proef ↔ archief (UITROL-001, eigenaar 09.11.2026: «niets mag te vervalsen zijn»)
    // De browser legde SQL voor aan de proef; bij «klaar» moet de SQL in het ÉCHT geüploade archief daar byte voor byte mee overeenkomen.
    const map = mkdtempSync(join(tmpdir(), 'vereisten-binding-'));
    const archief = join(map, 'pakket.tar.gz'); writeFileSync(archief, tgz);
    const toegepast = new Set(['0199_iets']);
    const klaarAnt = proefVerwerken(basisAnt('wacht-op-sql', { vereisten: [{ id: 'migratie-proef', groep: 'compatibiliteit', niveau: 'wacht', uk: 'Проба', nl: 'Proef', waaromUk: '', waaromNl: '' }], log: [], nieuweMigraties: ['0200_identiteit_account_maquette'] }),
      { id: 'proef-ok', ok: true, status: 'klaar', tijd: '', stappen: [], migraties: [{ naam: '0200_identiteit_account_maquette', ms: 5, ok: true }], log: [] });
    _sessies.set('proef-ok', { antwoord: { ...klaarAnt, id: 'proef-ok' }, eigenaar: 'eig', gemaakt: Date.now(), proefSinds: 0, sha256, sql: new Map([['0200_identiteit_account_maquette', sql0200]]) });
    const binding = proefVoorArchief(sha256);
    check('binding: proef op sha256 van het archief gevonden, met SHA-256 per migratie', binding?.id === 'proef-ok' && binding.ok && binding.sqlSha256.get('0200_identiteit_account_maquette') === createHash('sha256').update(sql0200).digest('hex'));
    check('binding: andere sha256 → geen proef', proefVoorArchief('f'.repeat(64)) === null && proefVoorArchief('kort') === null);
    const vcZonder = await pakketVoorcontrole(archief, { versie: '20261109-065647', toegepasteMigraties: toegepast });
    const mp = (vc: { resultaat: { controles: Array<{ id: string; niveau: string; nl: string }> } }) => vc.resultaat.controles.find((c) => c.id === 'migratie-proef');
    check('voorcontrole: zonder proef → waarschuwing (root herhaalt de proef), geen fout', mp(vcZonder)?.niveau === 'waarschuwing', JSON.stringify(mp(vcZonder)));
    const vcGoed = await pakketVoorcontrole(archief, { versie: '20261109-065647', toegepasteMigraties: toegepast, proef: binding });
    check('voorcontrole: proef gebonden aan dit archief → ok (SQL gelijk)', mp(vcGoed)?.niveau === 'ok' && /proef-ok/.test(mp(vcGoed)?.nl || ''), JSON.stringify(mp(vcGoed)));
    const vervalst = { ...binding!, sqlSha256: new Map([['0200_identiteit_account_maquette', createHash('sha256').update(sql0200 + ' ').digest('hex')]]) };
    const vcFout = await pakketVoorcontrole(archief, { versie: '20261109-065647', toegepasteMigraties: toegepast, proef: vervalst });
    check('voorcontrole: SQL in het archief wijkt af van de geprobeerde → fout, pakket nooit goedkeurbaar', mp(vcFout)?.niveau === 'fout' && vcFout.resultaat.ok === false && /0200_identiteit_account_maquette/.test(mp(vcFout)?.nl || ''), JSON.stringify(mp(vcFout)));
    const vcMislukt = await pakketVoorcontrole(archief, { versie: '20261109-065647', toegepasteMigraties: toegepast, proef: { ...binding!, ok: false, status: 'mislukt' } });
    check('voorcontrole: mislukte proef op dezelfde SQL → fout', mp(vcMislukt)?.niveau === 'fout' && vcMislukt.resultaat.ok === false);
    const vcGeen = await pakketVoorcontrole(archief, { versie: '20261109-065647', toegepasteMigraties: new Set(['0199_iets', '0200_identiteit_account_maquette']) });
    check('voorcontrole: geen nieuwe migraties → proef niet nodig (ok)', mp(vcGeen)?.niveau === 'ok');
    _sessies.delete('proef-ok');
  }
  return einde();
}
