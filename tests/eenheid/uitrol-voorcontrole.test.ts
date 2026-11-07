// Voorcontrole van uitrolpakketten (backend/uitrol-voorcontrole.ts): wat blokkeert de goedkeuring, wat is alleen een waarschuwing.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pakketVoorcontrole } from '../../backend/uitrol-voorcontrole';
import { checker } from './hulp/nep-google';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';

const V = '20261103-211554'; // TRACE-001: bestaande testcases testen oude vorm zonder verplicht ontwikkelarchief
type Opties = { zonder?: string[]; extra?: Record<string, string>; versie?: string; link?: boolean; tweeMappen?: boolean; pad?: string };

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-voorcontrole');
  const basis = mkdtempSync(join(tmpdir(), 'voorcontrole-'));
  let n = 0;
  const maak = (o: Opties = {}) => {
    const naam = `pkg${++n}`; const map = join(basis, naam, `mijn-ruimte-${V}`); mkdirSync(map, { recursive: true });
    const bestanden: Record<string, string> = {
      'UITROL-VERSIE': `${o.versie ?? V}\n`, AUTEUR: 'Claude (Anthropic)\n', AGENT: 'claude\n', SAMENVATTING: 'Nieuwe uitrol-pagina: stappen, voorcontrole en nazorg. Niets verwijderd.\n', 'BRON-COMMIT': 'a'.repeat(40),
      'package.json': JSON.stringify({ name: 'x', scripts: { build: 'vite build' } }), 'package-lock.json': '{}', 'index.html': '<html></html>', 'vite.config.ts': 'export default {}',
      'server/migrate.ts': '//', 'scripts/build-server.mjs': '//', 'backend/index.ts': '//', 'deploy/installeer-app.sh': '#!/bin/bash\necho ok\n',
      'migrations/0001_basis.sql': 'CREATE TABLE a(id int);', 'migrations/0002_nieuw.sql': 'ALTER TABLE a ADD COLUMN b int;', 'UITROL-MANIFEST.json': manifestVoor(o.versie ?? V), ...(o.extra || {}),
    };
    for (const z of o.zonder || []) delete bestanden[z];
    for (const [p, inh] of Object.entries(bestanden)) { const vol = join(map, p); mkdirSync(join(vol, '..'), { recursive: true }); writeFileSync(vol, inh); if (p.endsWith('.sh')) chmodSync(vol, 0o755); }
    if (o.link) symlinkSync('/etc/passwd', join(map, 'link'));
    if (o.tweeMappen) { mkdirSync(join(basis, naam, 'andere'), { recursive: true }); writeFileSync(join(basis, naam, 'andere', 'x'), 'x'); }
    const tgz = join(basis, `${naam}.tar.gz`);
    if (o.pad) execFileSync('tar', ['-czPf', tgz, '-C', join(basis, naam), '--transform', `s,^,${o.pad},`, `mijn-ruimte-${V}`]);
    else execFileSync('tar', ['-czf', tgz, '-C', join(basis, naam), ...(o.tweeMappen ? ['mijn-ruimte-' + V, 'andere'] : ['mijn-ruimte-' + V])]);
    return tgz;
  };
  const opties = { versie: V, actieveVersie: '20261102-000000', toegepasteMigraties: new Set(['0001_basis']), tests: { geslaagd: 158, mislukt: 0 } };
  const niv = (r: Awaited<ReturnType<typeof pakketVoorcontrole>>, id: string) => r.resultaat.controles.find((c) => c.id === id)?.niveau;
  try {
    const goed = await pakketVoorcontrole(maak(), opties);
    check('goed pakket: ok, geen fouten, geen waarschuwingen', goed.resultaat.ok && goed.resultaat.fouten === 0 && goed.resultaat.waarschuwingen === 0, JSON.stringify(goed.resultaat.controles.map((c) => c.id + ':' + c.niveau)));
    check('metadata uit het pakket: auteur, agent, samenvatting, commit', goed.meta.auteur === 'Claude (Anthropic)' && goed.meta.agent === 'claude' && goed.meta.samenvatting.startsWith('Nieuwe uitrol-pagina') && goed.meta.commit === 'a'.repeat(40), JSON.stringify(goed.meta));
    check('alle controles aanwezig (incl. commit en manifest)', ['manifest', 'structuur', 'versie', 'metadata', 'commit', 'scripts', 'bouwen', 'migraties', 'geheimen', 'tests'].every((id) => niv(goed, id)));

    // TRACE-001: de toekomstige sitevoorcontrole weigert zonder bevestigd GitHub-dossier.
    const traceVersie = '20261103-215555', traceCommit = 'a'.repeat(40);
    const traceBasis = { ...opties, versie: traceVersie, actieveVersie: V };
    const zonderTrace = await pakketVoorcontrole(maak({ versie: traceVersie }), traceBasis);
    check('TRACE-001: nieuwe versie zonder ONTWIKKELARCHIEF.json geweigerd',
      niv(zonderTrace,'ontwikkelarchief') === 'fout' &&
      zonderTrace.resultaat.controles.find((c)=>c.id === 'ontwikkelarchief')?.nl.includes('GEEN_ONTWIKKELARCHIEF'));
    const tracePad='orchestratie/ontwikkelarchieven/TRACE-001.json';
    const traceRef={schema:1,taakId:'TRACE-001',repo:'Tarasevych/hub',
      tak:'feature/trace-001-20261103-214810',commit:traceCommit,pad:tracePad,sha256:'b'.repeat(64),
      url:`https://github.com/Tarasevych/hub/blob/${traceCommit}/${tracePad}`,
      release:`https://github.com/Tarasevych/hub/releases/tag/${traceVersie}`,pakket:`mijn-ruimte-${traceVersie}.tar.gz`};
    const tracePakket=maak({ versie: traceVersie, extra:{ 'ONTWIKKELARCHIEF.json': JSON.stringify(traceRef) }});
    const traceGoed = await pakketVoorcontrole(tracePakket,{...traceBasis,
      archiefControle:async()=>({ok:true,code:'OK',reden:'test',url:traceRef.url})});
    check('TRACE-001: geverifieerd dossier wordt getoond',
      niv(traceGoed,'ontwikkelarchief')==='ok' && traceGoed.meta.ontwikkelArchiefUrl===traceRef.url);
    const traceKapot=await pakketVoorcontrole(tracePakket,{...traceBasis,
      archiefControle:async()=>({ok:false,code:'ONTWIKKELARCHIEF_PAKKET_SHA_VERSCHILT',reden:'SHA ongelijk'})});
    check('TRACE-001: afwijkende GitHub SHA-256 → blokkerende fout',
      niv(traceKapot,'ontwikkelarchief')==='fout' &&
      traceKapot.resultaat.controles.find((c)=>c.id==='ontwikkelarchief')?.nl.includes('ONTWIKKELARCHIEF_PAKKET_SHA_VERSCHILT'));

    const geenOmschrijving = await pakketVoorcontrole(maak({ zonder: ['SAMENVATTING'] }), opties);
    check('SAMENVATTING ontbreekt → fout «опису змін немає», pakket geblokkeerd', !geenOmschrijving.resultaat.ok && niv(geenOmschrijving, 'metadata') === 'fout' && /опису змін немає/.test(geenOmschrijving.resultaat.controles.find((c) => c.id === 'metadata')!.uk));
    check('SAMENVATTING te kort → fout', niv(await pakketVoorcontrole(maak({ extra: { SAMENVATTING: 'kort' } }), opties), 'metadata') === 'fout');
    check('AGENT ontbreekt / ongeldig → fout', niv(await pakketVoorcontrole(maak({ zonder: ['AGENT'] }), opties), 'metadata') === 'fout' && niv(await pakketVoorcontrole(maak({ extra: { AGENT: 'Claude Code!' } }), opties), 'metadata') === 'fout');
    check('AUTEUR ontbreekt → fout', niv(await pakketVoorcontrole(maak({ zonder: ['AUTEUR'] }), opties), 'metadata') === 'fout');
    // Regel 3 (audit 18.10.2026, punt 10): BRON-COMMIT verplicht; vroeger werd «unknown» stil geaccepteerd (live: commit «unknown»).
    check('BRON-COMMIT 40 hex → controle «commit» ok', niv(goed, 'commit') === 'ok' && goed.meta.commit === 'a'.repeat(40));
    const zonderCommit = await pakketVoorcontrole(maak({ zonder: ['BRON-COMMIT'] }), opties);
    check('BRON-COMMIT ontbreekt → fout GEEN_BRON_COMMIT, pakket geblokkeerd', !zonderCommit.resultaat.ok && niv(zonderCommit, 'commit') === 'fout' && /GEEN_BRON_COMMIT/.test(zonderCommit.resultaat.controles.find((c) => c.id === 'commit')!.uk));
    const unknown = await pakketVoorcontrole(maak({ extra: { 'BRON-COMMIT': 'unknown\n' } }), opties);
    check('BRON-COMMIT «unknown» → fout GEEN_BRON_COMMIT', !unknown.resultaat.ok && niv(unknown, 'commit') === 'fout' && unknown.meta.commit === '');
    check('BRON-COMMIT korte hash (abc1234) → fout (geen volledige commit)', niv(await pakketVoorcontrole(maak({ extra: { 'BRON-COMMIT': 'abc1234\n' } }), opties), 'commit') === 'fout');
    const zg = await pakketVoorcontrole(maak({ extra: { 'BRON-COMMIT': 'zonder-git: gebouwd in een sandbox zonder git\n' } }), opties);
    check('«zonder-git:<reden>» → waarschuwing (niet blokkerend), reden zichtbaar, commit = «zonder-git:<reden>»', zg.resultaat.ok && niv(zg, 'commit') === 'waarschuwing' && /sandbox zonder git/.test(zg.resultaat.controles.find((c) => c.id === 'commit')!.nl) && zg.meta.commit === 'zonder-git:gebouwd in een sandbox zonder git', JSON.stringify(zg.meta));
    check('«zonder-git:» zonder reden → fout', niv(await pakketVoorcontrole(maak({ extra: { 'BRON-COMMIT': 'zonder-git:\n' } }), opties), 'commit') === 'fout');
    check('versie wijkt af van het voorstel → fout', niv(await pakketVoorcontrole(maak({ versie: '20270301-111111' }), opties), 'versie') === 'fout');
    check('versie niet nieuwer dan actief → fout', niv(await pakketVoorcontrole(maak(), { ...opties, actieveVersie: V }), 'versie') === 'fout');
    check('UITROL-VERSIE ontbreekt → fout', niv(await pakketVoorcontrole(maak({ zonder: ['UITROL-VERSIE'] }), opties), 'versie') === 'fout');
    check('symbolische link in het pakket → structuur-fout', niv(await pakketVoorcontrole(maak({ link: true }), opties), 'structuur') === 'fout');
    check('twee bovenmappen → structuur-fout', niv(await pakketVoorcontrole(maak({ tweeMappen: true }), opties), 'structuur') === 'fout');
    check('pad buiten de map (../) → structuur-fout', niv(await pakketVoorcontrole(maak({ pad: '../' }), opties), 'structuur') === 'fout');
    check('geen tar.gz → structuur-fout (geen crash)', niv(await pakketVoorcontrole(join(basis, 'bestaat-niet.tar.gz'), opties), 'structuur') === 'fout');
    check('shell-syntaxisfout in deploy/*.sh → scripts-fout met bestandsnaam', (() => true)() && niv(await pakketVoorcontrole(maak({ extra: { 'deploy/kapot.sh': 'if then fi (\n' } }), opties), 'scripts') === 'fout');
    check('package-lock.json ontbreekt → bouwen-fout', niv(await pakketVoorcontrole(maak({ zonder: ['package-lock.json'] }), opties), 'bouwen') === 'fout');
    check('package.json zonder build-script → bouwen-fout', niv(await pakketVoorcontrole(maak({ extra: { 'package.json': '{"scripts":{}}' } }), opties), 'bouwen') === 'fout');
    check('dubbel migratienummer → fout', niv(await pakketVoorcontrole(maak({ extra: { 'migrations/0002_ander.sql': 'SELECT 1;' } }), opties), 'migraties') === 'fout');
    const risico = await pakketVoorcontrole(maak({ extra: { 'migrations/0003_weg.sql': 'ALTER TABLE a DROP COLUMN b;\nTRUNCATE a;' } }), opties);
    check('nieuwe migratie met DROP COLUMN/TRUNCATE → waarschuwing, maar niet geblokkeerd', risico.resultaat.ok && niv(risico, 'migraties') === 'waarschuwing' && risico.resultaat.controles.find((c) => c.id === 'migraties')!.details!.length >= 2);
    check('oude (al toegepaste) migratie met DROP wordt niet gemeld', niv(await pakketVoorcontrole(maak({ extra: { 'migrations/0001_basis.sql': 'DROP TABLE a;' } }), opties), 'migraties') === 'ok');
    const geheim = await pakketVoorcontrole(maak({ extra: { 'src/x.ts': '// -----BEGIN PRIVATE' + ' KEY-----\nabc', '.env': 'A=1' } }), opties);
    check('geheimen: privésleutel en .env → waarschuwing met alleen bestandsnamen, niet geblokkeerd', geheim.resultaat.ok && niv(geheim, 'geheimen') === 'waarschuwing' && !JSON.stringify(geheim.resultaat).includes('abc'));
    check('mislukte tests van de voorbereider → waarschuwing', niv(await pakketVoorcontrole(maak(), { ...opties, tests: { geslaagd: 10, mislukt: 2 } }), 'tests') === 'waarschuwing');
    // 29.10.2026: tests ook uit het pakket zelf (TESTRESULTATEN), zodat een upload via wizard/SSH niet altijd «geen testresultaten» geeft.
    const trOk = await pakketVoorcontrole(maak({ extra: { TESTRESULTATEN: '{"geslaagd":42,"mislukt":0,"samenvatting":"alles groen"}' } }), { ...opties, tests: null });
    check('TESTRESULTATEN in het pakket, geen tests in het voorstel → «tests» ok met bronvermelding', niv(trOk, 'tests') === 'ok' && /TESTRESULTATEN/.test(trOk.resultaat.controles.find((c) => c.id === 'tests')!.uk), JSON.stringify(trOk.resultaat.controles.find((c) => c.id === 'tests')));
    check('TESTRESULTATEN met mislukte tests → waarschuwing', niv(await pakketVoorcontrole(maak({ extra: { TESTRESULTATEN: '{"geslaagd":40,"mislukt":2}' } }), { ...opties, tests: null }), 'tests') === 'waarschuwing');
    check('voorstel-tests gaan vóór TESTRESULTATEN', /158/.test((await pakketVoorcontrole(maak({ extra: { TESTRESULTATEN: '{"geslaagd":1}' } }), opties)).resultaat.controles.find((c) => c.id === 'tests')!.uk));
    check('kapot of ontbrekend TESTRESULTATEN → dezelfde waarschuwing als vroeger', niv(await pakketVoorcontrole(maak({ extra: { TESTRESULTATEN: 'geen json' } }), { ...opties, tests: null }), 'tests') === 'waarschuwing' && niv(await pakketVoorcontrole(maak(), { ...opties, tests: null }), 'tests') === 'waarschuwing');
    // UI-010: manifest verplicht voor nieuwe releases; oude formaten blijven installeerbaar met een waarschuwing.
    const geenM = await pakketVoorcontrole(maak({ zonder: ['UITROL-MANIFEST.json'] }), opties);
    check('UI-010: nieuwe release zonder manifest → fout GEEN_MANIFEST (blokkeert)', niv(geenM, 'manifest') === 'fout' && !geenM.resultaat.ok && /GEEN_MANIFEST/.test(geenM.resultaat.controles.find((c) => c.id === 'manifest')!.uk));
    const kapotM = await pakketVoorcontrole(maak({ extra: { 'UITROL-MANIFEST.json': manifestVoor(V, { beschrijving: { nl: { titel: 'x', samenvatting: 'te kort' } } }) } }), opties);
    const kd = kapotM.resultaat.controles.find((c) => c.id === 'manifest');
    check('UI-010: manifest zonder vertaling → fout met concrete veldnamen', kd?.niveau === 'fout' && !!kd.details?.some((x) => x.startsWith('beschrijving.uk.titel')) && !!kd.details?.some((x) => x.startsWith('beschrijving.nl.samenvatting')), JSON.stringify(kd));
    const oudV = '20261029-131639';
    const oudP = await pakketVoorcontrole(maak({ versie: oudV, zonder: ['UITROL-MANIFEST.json'] }), { ...opties, versie: oudV, actieveVersie: '20261001-000000' });
    check('UI-010: oud pakket (vóór de grens) zonder manifest → alleen waarschuwing, installeerbaar', niv(oudP, 'manifest') === 'waarschuwing' && oudP.resultaat.ok, JSON.stringify(oudP.resultaat.controles.map((c) => c.id + ':' + c.niveau)));
    const tr2 = await pakketVoorcontrole(maak({ extra: { TESTRESULTATEN: JSON.stringify({ geslaagd: 100, mislukt: 3, basis: { versie: '20261029-131639', geslaagd: 90, mislukt: 3 }, falend: [{ bestand: 'tests/eenheid/a.test.ts', aantal: 2, ookOpBasis: true }, { bestand: 'tests/eenheid/b.test.ts', aantal: 1, ookOpBasis: false }] }) } }), { ...opties, tests: { geslaagd: 100, mislukt: 3 } });
    const td = tr2.resultaat.controles.find((c) => c.id === 'tests')!;
    check('UI-010: TESTRESULTATEN v2 → welke bestanden, bekend/nieuw, basis, ook als het voorstel alleen getallen gaf', td.niveau === 'waarschuwing' && td.details?.length === 2 && /ті самі й на базовій версії: 1, нові: 1/.test(td.uk) && /20261029-131639/.test(td.uk), JSON.stringify(td));
    const tr1 = await pakketVoorcontrole(maak({ extra: { TESTRESULTATEN: '{"geslaagd":40,"mislukt":2}' } }), { ...opties, tests: null });
    check('UI-010: oud TESTRESULTATEN → «деталі недоступні в цьому пакеті»', /недоступні в цьому пакеті/.test(tr1.resultaat.controles.find((c) => c.id === 'tests')!.uk));
    // De geheimenscan blijft onverzwakt óók onder tests/ gelden: een echt PEM-blok daar waarschuwt nog steeds. (De eigen
    // testbestanden van de site knippen hun neppe sleutels daarom op in de BRON — zie bv. tests/eenheid/zoek-isolatie.)
    const pemInTests = await pakketVoorcontrole(maak({ extra: { 'tests/eenheid/fixture.ts': `const pem = \`-----BEGIN PRIVATE` + ` KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\n-----END PRIVATE` + ` KEY-----\`;` } }), opties);
    check('een echt PEM-blok onder tests/ waarschuwt nog steeds (scan niet verzwakt)', niv(pemInTests, 'geheimen') === 'waarschuwing');
    check('tijdelijke map is opgeruimd', !execFileSync('sh', ['-c', `ls -d ${tmpdir()}/uitrol-voorcontrole-* 2>/dev/null | wc -l`]).toString().trim().replace(/^0$/, '') );
  } finally { rmSync(basis, { recursive: true, force: true }); }
  return einde();
}
