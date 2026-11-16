// UITROL-002 (16.11.2026) · Продовження встановлення з місця обриву + термінал мовою сайту.
//   1. shared/uitrol-hervatten: wanneer het archief op de server blijft, welk voorstel «hetzelfde bestand» is, uitleg.
//   2. deploy/installeer-app.sh (hervat_*): een al gebouwde release van hetzelfde archief wordt hervat; eigenaar, inhoud en sha256
//      worden gecontroleerd; andere onvolledige releases worden opgeruimd; na een fout ná het bouwen blijft de map staan.
//   3. shared/terminal-taal: eigen meldingen én bekende regels van npm/vite/systemd in de paginataal (uk en nl); tweetalige regels.
//   4. shared/uitrol-duur + src/uitrol/terminal-voortgang: gebruikelijke duur uit eerdere runs, voortgangsregel boven de terminal.
//   5. src/uitrol/geschiedenis-tijdlijn: «Продовжити з місця зупинки» ook als het archief nog op de server ligt.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import type { Run, Regel, Voorstel } from '../../src/uitrol/types';

const SHA = 'a'.repeat(64);
const voorstel = (o: Partial<Voorstel> & { id: string; status: string }): Voorstel => ({
  versie: '20261116-100000', bytes: 1000, sha256: SHA, ontvangen: 1000, voorbereider: 'a@b', commit: '', wijzigingen: '', tests: {}, diffSamenvatting: '', aangemaaktOp: '2026-11-16T08:00:00.000Z', beslistOp: '', beslistDoor: '', uitkomstCode: '', uitkomst: null, ...o,
});

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-hervatten');

  // ---------------------------------------------------------------- 1. shared/uitrol-hervatten
  const h = await import('../../shared/uitrol-hervatten');
  check('bewaren: mislukt + technische code → archief blijft', h.pakketBewarenNaUitkomst('mislukt', 'INSTALLATIE_MISLUKT') && h.pakketBewarenNaUitkomst('mislukt', 'rook_teruggedraaid') && h.pakketBewarenNaUitkomst('verlopen', 'GEEN_UITKOMST') && h.pakketBewarenNaUitkomst('afgebroken', 'GESTOPT'));
  check('bewaren: geweigerd (inhoud), afgewezen (eigenaar), geïnstalleerd → archief weg', !h.pakketBewarenNaUitkomst('geweigerd', 'HERGEBRUIKT') && !h.pakketBewarenNaUitkomst('afgewezen', 'AFGEWEZEN') && !h.pakketBewarenNaUitkomst('geinstalleerd', 'OK') && !h.pakketBewarenNaUitkomst('mislukt', 'HANDTEKENING_ONGELDIG'));
  const lijst = [
    voorstel({ id: 'oud', status: 'mislukt', pakketAanwezig: true, bijgewerktOp: '2026-11-15T08:00:00.000Z', uitkomstCode: 'INSTALLATIE_MISLUKT', uitkomst: { uk: 'збій на кроці «міграції»', nl: 'mislukt in stap «migraties»' } }),
    voorstel({ id: 'nieuw', status: 'mislukt', pakketAanwezig: true, bijgewerktOp: '2026-11-16T08:00:00.000Z', uitkomstCode: 'GESTOPT' }),
    voorstel({ id: 'weg', status: 'mislukt', pakketAanwezig: false, bijgewerktOp: '2026-11-16T09:00:00.000Z' }),
    voorstel({ id: 'anders', status: 'mislukt', pakketAanwezig: true, sha256: 'b'.repeat(64), bijgewerktOp: '2026-11-16T09:00:00.000Z' }),
    voorstel({ id: 'afgewezen', status: 'afgewezen', pakketAanwezig: true, bijgewerktOp: '2026-11-16T09:30:00.000Z' }),
    voorstel({ id: 'grootte', status: 'mislukt', pakketAanwezig: true, bytes: 999, bijgewerktOp: '2026-11-16T09:40:00.000Z' }),
  ];
  const kandidaat = h.hervatKandidaat(lijst, { sha256: SHA, bytes: 1000, versie: '20261116-100000' });
  check('kandidaat: zelfde sha256 + grootte + versie, archief aanwezig, status hervatbaar; de jongste wint', kandidaat?.id === 'nieuw', kandidaat?.id);
  check('kandidaat: zonder pakketAanwezig van de server telt het niet; andere sha/grootte/versie niet', !h.hervatKandidaat(lijst, { sha256: 'c'.repeat(64), bytes: 1000, versie: '20261116-100000' }) && !h.hervatKandidaat(lijst, { sha256: SHA, bytes: 1001, versie: '20261116-100000' }) && !h.hervatKandidaat(lijst, { sha256: SHA, bytes: 1000, versie: '20261116-100001' }) && !h.hervatKandidaat(lijst, { sha256: 'nee', bytes: 1000, versie: '20261116-100000' }));
  check('hervatbare lijst: alleen aanwezig én mislukt/verlopen/afgebroken', h.hervatbareVoorstellen(lijst).map((v) => v.id).join(',') === 'oud,nieuw,anders,grootte');
  check('stap uit de uitkomsttekst (uk en nl)', h.stapUitUitkomst({ uk: 'збій на кроці «міграції»' }) === 'міграції' && h.stapUitUitkomst({ nl: 'mislukt in stap «bouwen»' }) === 'bouwen' && h.stapUitUitkomst(null) === '');
  const uUk = h.hervatUitleg('uk', lijst[0], '15.11.2026 09:00'), uNl = h.hervatUitleg('nl', lijst[0], '15-11-2026 09:00');
  check('uitleg uk/nl: datum, stap, reden en «passkey opnieuw»', /уже є на сервері/.test(uUk.kop) && /15\.11\.2026 09:00/.test(uUk.uitleg) && /«міграції»/.test(uUk.uitleg) && h.stapUitUitkomst({ uk: 'на кроці «міграції»', nl: 'in stap «migraties»' }, 'uk') === 'міграції' && /passkey/.test(uUk.uitleg) && /staat al op de server/.test(uNl.kop) && /«migraties»/.test(uNl.uitleg), uUk.uitleg);
  check('bewaartermijn 7 dagen', h.HERVAT_LIMIETEN.bewaarDagen === 7);

  // ---------------------------------------------------------------- 2. installeer-app.sh: hervat_*
  const script = readFileSync('deploy/installeer-app.sh', 'utf8');
  const van = script.indexOf('ONVOLTOOID=""'), tot = script.indexOf('# ---- UITROL-002: hervatten einde ----');
  check('installer: hervat-blok aanwezig en installeren() gebruikt het', van > 0 && tot > van && /hervat="\$\(hervat_kandidaat \|\| true\)"/.test(script) && /hervat_markeren "\$doel"/.test(script) && /rm -f -- "\$\(hervat_markering "\$doel"\)"/.test(script));
  check('root-script geeft de sha256 van zijn EIGEN kopie door', /MIJN_RUIMTE_PAKKET_SHA256="\$\(sha256sum -- "\$WERK\/pakket\.tar\.gz" \| cut -c1-64\)"; export MIJN_RUIMTE_PAKKET_SHA256/.test(readFileSync('deploy/uitrol/mijn-ruimte-uitrol.sh', 'utf8')));
  const werk = mkdtempSync(join(tmpdir(), 'hervat-'));
  const releases = join(werk, 'releases'); mkdirSync(releases);
  const sh = join(werk, 'hervat.sh');
  writeFileSync(sh, `#!/bin/bash
set -uo pipefail
RELEASES="$1"; MIJN_RUIMTE_PAKKET_SHA256="\${2:-}"; ACTIEF="\${3:-}"; GEBRUIKER="$(id -un)"
melding() { echo "[installeer] $*"; }
actieve_release() { echo "$ACTIEF"; }
${script.slice(van, tot)}
case "$4" in
  kandidaat) hervat_kandidaat ;;
  markeren) hervat_markeren "$5"; echo "BEWAAR=$ONVOLTOOID_BEWAAR" ;;
  opruimen) hervat_opruimen "\${5:-}" ;;
  afbreken) ONVOLTOOID="$5"; ONVOLTOOID_BEWAAR="$6"; opruimen_bij_afbreken ;;
esac
`);
  const run = (...a: string[]) => { const r = spawnSync('bash', [sh, releases, ...a], { encoding: 'utf8' }); return { uit: (r.stdout + r.stderr).trim(), status: r.status }; };
  const maakRelease = (naam: string, opties: { gebouwd?: boolean; commit?: string } = {}) => { const d = join(releases, naam); mkdirSync(join(d, 'dist'), { recursive: true }); mkdirSync(join(d, 'dist-server'), { recursive: true }); if (opties.gebouwd !== false) { writeFileSync(join(d, 'dist', 'index.html'), '<html>'); writeFileSync(join(d, 'dist-server', 'start.mjs'), '//'); } writeFileSync(join(d, 'RELEASE-COMMIT'), `${opties.commit || 'abc123'}\n`); return d; };
  const A = maakRelease('20261116-100000');
  check('markeren: zonder sha256 (SSH-installatie) gebeurt er niets', !existsSync(join(A, '.onvoltooid.json')) && /BEWAAR=0/.test(run('', '', 'markeren', A).uit));
  const mk = run(SHA, '', 'markeren', A);
  const markering = existsSync(join(A, '.onvoltooid.json')) ? JSON.parse(readFileSync(join(A, '.onvoltooid.json'), 'utf8')) : null;
  check('markeren: .onvoltooid.json met sha256, commit, stappen t/m bouwen; ONVOLTOOID_BEWAAR=1', /BEWAAR=1/.test(mk.uit) && markering?.sha256 === SHA && markering.commit === 'abc123' && markering.stappen.includes('bouwen'), mk.uit);
  check('kandidaat: zelfde sha256 → de gebouwde release', run(SHA, '', 'kandidaat').uit === A);
  check('kandidaat: andere sha256 → niets (alles opnieuw bouwen)', run('b'.repeat(64), '', 'kandidaat').uit === '' && run('', '', 'kandidaat').uit === '');
  const B = maakRelease('20261116-110000', { gebouwd: false }); run(SHA, '', 'markeren', B);
  check('kandidaat: markering zonder dist/ (niet gebouwd) telt niet — de jongere B wordt overgeslagen, A blijft de kandidaat', run(SHA, '', 'kandidaat').uit === A);
  const C = maakRelease('20261116-120000'); symlinkSync(join(A, '.onvoltooid.json'), join(C, '.onvoltooid.json'));
  check('kandidaat: markering als symlink wordt genegeerd', run(SHA, '', 'kandidaat').uit === A);
  const D = maakRelease('20261116-130000'); writeFileSync(join(D, '.onvoltooid.json'), '{"sha256":"' + SHA + '","stappen":["proef","kopie"]}');
  check('kandidaat: markering zonder «bouwen» in de stappen telt niet', run(SHA, '', 'kandidaat').uit === A);
  const E = maakRelease('20261116-140000'); writeFileSync(join(E, '.onvoltooid.json'), 'geen json');
  check('kandidaat: kapotte markering telt niet', run(SHA, '', 'kandidaat').uit === A);
  const opr = run(SHA, D, 'opruimen', A);
  check('opruimen: andere gemarkeerde releases weg (B, C, E), de kandidaat A en de actieve D blijven', !existsSync(B) && !existsSync(C) && !existsSync(E) && existsSync(A) && existsSync(D) && /oude onvolledige release verwijderd: 20261116-110000/.test(opr.uit), opr.uit);
  const F = maakRelease('20261116-150000'); run(SHA, '', 'markeren', F);
  const afb = run(SHA, '', 'afbreken', F, '1');
  check('afbreken ná het bouwen: de gemarkeerde release blijft (bewaard om te hervatten), tweetalige melding', existsSync(F) && /bewaard om te hervatten/.test(afb.uit) && /незавершений випуск збережено/.test(afb.uit), afb.uit);
  const G = maakRelease('20261116-160000');
  const afb2 = run(SHA, '', 'afbreken', G, '0');
  check('afbreken vóór het bouwen (geen markering): de release wordt verwijderd zoals vroeger', !existsSync(G) && /verwijderd/.test(afb2.uit), afb2.uit);
  rmSync(werk, { recursive: true, force: true });

  // ---------------------------------------------------------------- 3. terminal-taal
  const t = await import('../../shared/terminal-taal');
  const uk = (s: string) => t.vertaalRegel(s, 'uk'), nl = (s: string) => t.vertaalRegel(s, 'nl');
  check('tweetalig: «nl / uk» → de helft in de paginataal', t.tweetaligeHelft('onvolledige release X bewaard / незавершений випуск збережено', 'uk') === 'незавершений випуск збережено' && t.tweetaligeHelft('onvolledige release X bewaard / незавершений випуск збережено', 'nl') === 'onvolledige release X bewaard' && t.tweetaligeHelft('a / b', 'uk') === null);
  check('eigen (uk): hervat-regel toont alleen de Oekraïense helft', uk('[installeer] onvolledige release /srv/r/x bewaard om te hervatten: hetzelfde archief slaat kopie, npm ci en bouwen over / незавершений випуск збережено для продовження').tekst === '[installeer] незавершений випуск збережено для продовження');
  check('eigen (nl): dezelfde regel toont de Nederlandse helft', nl('[installeer] onvolledige release /srv/r/x bewaard om te hervatten: hetzelfde archief slaat kopie, npm ci en bouwen over / незавершений випуск збережено для продовження').tekst === '[installeer] onvolledige release /srv/r/x bewaard om te hervatten: hetzelfde archief slaat kopie, npm ci en bouwen over');
  check('eigen (uk): stap-regel met tweetalige beschrijving (hervat)', uk('[installeer] stap: npm (55%) overgeslagen: afhankelijkheden al geïnstalleerd (hervat) / пропущено: залежності вже встановлено').tekst === '[installeer] крок: залежності (npm ci) [npm] (55%) пропущено: залежності вже встановлено');
  check('eigen (nl): stap-regel met tweetalige beschrijving', nl('[installeer] stap: npm (55%) overgeslagen: afhankelijkheden al geïnstalleerd (hervat) / пропущено: залежності вже встановлено').tekst === '[installeer] stap: npm (55%) overgeslagen: afhankelijkheden al geïnstalleerd (hervat)');
  check('eigen (uk): installer-meldingen', uk('[installeer] bron kopiëren naar /srv/r/20261116-100000…').tekst === '[installeer] копіювання коду до /srv/r/20261116-100000…' && uk('[installeer] klaar: release 20261116-100000 (commit abc)').tekst === '[installeer] готово: випуск 20261116-100000 (коміт abc)' && uk('[installeer] stap: proef (44%) nieuwe migraties proberen op een kopie van het schema').tekst === '[installeer] крок: проба міграцій [proef] (44%) проба нових міграцій на копії схеми' && uk('[installeer] LET OP: nabewaking: gezondheidscontrole mislukt (2/3)').tekst === '[installeer] УВАГА: нагляд: перевірка роботи сайту не вдалася (2/3)');
  check('eigen (uk): root-meldingen', uk('[uitrol] basis van het pakket: 20261116-031827 @ bf157145 (geïnstalleerd: 20261116-031827 @ bf157145)').tekst === '[uitrol] основа пакета: 20261116-031827 @ bf157145 (встановлено: 20261116-031827 @ bf157145)' && uk('[uitrol] LET OP: pakket zonder UITROL-BASIS (oud formaat) — basisversie en -commit niet gecontroleerd').vertaald);
  check('eigen (nl): Oekraïense root-regel → Nederlands', nl('[uitrol] метадані випуску: автор=Pavlo агент=claude commit=abc').tekst === '[uitrol] metadata van de uitgave: auteur=Pavlo agent=claude commit=abc');
  check('eigen (nl): Nederlandse regel blijft ongewijzigd', !nl('[installeer] bron kopiëren naar /x…').vertaald);
  check('derden (uk): npm-samenvatting, vite-bouw, systemd-run', uk('added 1203 packages, and audited 1204 packages in 41s').tekst === 'npm: додано пакетів: 1203, перевірено: 1204 за 41s' && uk('found 0 vulnerabilities').tekst === 'npm: вразливостей не знайдено' && uk('✓ 2817 modules transformed.').tekst === '✓ vite: перетворено модулів: 2817' && uk('✓ built in 12.30s').tekst === '✓ vite: зібрано за 12.30s' && uk('Finished with result: success').tekst === 'systemd: завершено з результатом «успіх»' && uk('Running as unit: mijn-ruimte-bouw-x.service').tekst === 'systemd: запущено як юніт mijn-ruimte-bouw-x.service');
  check('derden (nl): dezelfde regels in het Nederlands', nl('added 1203 packages, and audited 1204 packages in 41s').tekst === 'npm: 1203 pakketten toegevoegd, 1204 gecontroleerd in 41s' && nl('✓ built in 12.30s').tekst === '✓ vite: gebouwd in 12.30s' && nl('Finished with result: success').tekst === 'systemd: afgerond met resultaat «geslaagd»' && nl('npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported').tekst === 'npm waarschuwing: verouderd pakket glob@7.2.3: Glob versions prior to v9 are no longer supported');
  check('derden: vrije tekst (stacktrace, bestandslijst) blijft letterlijk', !uk('    at Object.<anonymous> (/srv/x.mjs:12:3)').vertaald && !uk('dist/assets/index-abc.js   412.03 kB │ gzip: 120.11 kB').vertaald && !nl('> mijn-ruimte@1.0.0 build').vertaald);
  check('ANSI-codes blijven staan', uk('\x1b[32m✓ built in 1.0s').tekst === '\x1b[32m✓ vite: зібрано за 1.0s');

  // ---------------------------------------------------------------- 4. duur + voortgang
  const d = await import('../../shared/uitrol-duur');
  const T0 = Date.parse('2026-11-16T10:00:00.000Z');
  const regel = (ms: number, tekst: string, nr = 1): Regel => ({ nr, tijd: new Date(T0 + ms).toISOString(), niveau: 'info', tekst });
  const stap = (ms: number, id: string, pct: number, nr: number) => regel(ms, `[installeer] stap: ${id} (${pct}%)`, nr);
  const duren = d.stapDurenUitRegels([stap(0, 'proef', 44, 1), regel(5_000, 'x', 2), stap(10_000, 'kopie', 45, 3), stap(40_000, 'npm', 55, 4), stap(100_000, 'bouwen', 70, 5)], new Date(T0 + 160_000).toISOString());
  check('duur: per onderdeel tot de volgende «stap:», de laatste tot het einde', duren.proef === 10_000 && duren.kopie === 30_000 && duren.npm === 60_000 && duren.bouwen === 60_000, JSON.stringify(duren));
  check('mediaan', d.mediaan([5, 1, 3]) === 3 && d.mediaan([4, 1, 3, 2]) === 3 && d.mediaan([]) === null);
  const verwacht = d.verwachtUitRuns([{ duren: { npm: 60_000, bouwen: 80_000 }, totaalMs: 300_000 }, { duren: { npm: 40_000, bouwen: 100_000 }, totaalMs: 240_000 }, { duren: { npm: 50_000 }, totaalMs: 400_000 }]);
  check('verwacht: mediaan per onderdeel en van het totaal, aantal runs', verwacht.stappen.npm === 50_000 && verwacht.stappen.bouwen === 90_000 && verwacht.totaalMs === 300_000 && verwacht.uitRuns === 3);
  const tv = await import('../../src/uitrol/terminal-voortgang');
  const basisRun: Run = { id: 'r', methode: 'passkey', versie: '20261116-100000', release: '', staat: 'bezig', stap: 'installeren', sub: '', pct: 55, code: '', uk: '', nl: '', stappen: [{ stap: 'ontvangen', staat: 'ok', pct: 2, tijd: new Date(T0).toISOString(), uk: '', nl: '' }, { stap: 'echtheid', staat: 'bezig', pct: 10, tijd: new Date(T0 + 3_000).toISOString(), uk: '', nl: '' }], voorstelId: '', sha256: '', bytes: 0, commit: '', voorbereider: '', goedgekeurdDoor: '', wijzigingen: '', wie: '', adres: '', logRegels: 0, gestart: new Date(T0).toISOString(), bijgewerkt: '', geeindigd: '' };
  const v1 = tv.voortgangStand(basisRun, [], verwacht, T0 + 8_000);
  check('voortgang vóór de installer: root-controle «echtheid», verstreken 5 s, totaal 8 s, resterend uit de gebruikelijke duur', v1?.id === 'root-echtheid' && v1.uk === 'перевірка passkey і sha256' && v1.stapMs === 5_000 && v1.totaalMs === 8_000 && v1.verwachtTotaalMs === 300_000 && v1.resterendMs === 292_000 && v1.pct === 10, JSON.stringify(v1));
  const v2 = tv.voortgangStand(basisRun, [stap(10_000, 'kopie', 45, 1), stap(40_000, 'npm', 55, 2)], verwacht, T0 + 70_000);
  check('voortgang tijdens npm: onderdeel, 55 %, 30 s op het onderdeel (gewoonlijk 50 s), totaal 70 s', v2?.id === 'npm' && v2.pct === 55 && v2.stapMs === 30_000 && v2.verwachtStapMs === 50_000 && v2.totaalMs === 70_000 && !v2.klaar, JSON.stringify(v2));
  const v3 = tv.voortgangStand(basisRun, [stap(40_000, 'npm', 55, 2)], null, T0 + 110_000);
  check('voortgang zonder geschiedenis: resterend geschat uit het percentage', v3?.verwachtTotaalMs === null && v3.resterendMs === 90_000, JSON.stringify(v3));
  const klaarRun: Run = { ...basisRun, staat: 'klaar', pct: 100, geeindigd: new Date(T0 + 200_000).toISOString() };
  const v4 = tv.voortgangStand(klaarRun, [stap(40_000, 'npm', 55, 2), stap(150_000, 'nabewaken', 98, 3)], verwacht, T0 + 999_000);
  check('voortgang na afloop: 100 %, klaar, totaal tot het einde van de run (niet tot nu)', v4?.pct === 100 && v4.klaar && v4.totaalMs === 200_000 && v4.resterendMs === null && v4.id === 'nabewaken', JSON.stringify(v4));
  check('voortgang zonder run → null', tv.voortgangStand(null, [], verwacht) === null);
  check('duurtekst uk/nl in seconden, minuten, uren', tv.duurTekst('uk', 35_000) === '35 с' && tv.duurTekst('uk', 250_000) === '4 хв 10 с' && tv.duurTekst('uk', 3_720_000) === '1 год 02 хв' && tv.duurTekst('nl', 250_000) === '4 min 10 s' && tv.duurTekst('nl', 3_720_000) === '1 u 02 min');

  // ---------------------------------------------------------------- 5. tijdlijn: hervat als het archief nog op de server ligt
  const tl = await import('../../src/uitrol/geschiedenis-tijdlijn');
  const runM: Run = { ...basisRun, id: 'rm', staat: 'mislukt', code: 'INSTALLATIE_MISLUKT', voorstelId: 'vm', gestart: '2026-11-16T09:00:00.000Z', geeindigd: '2026-11-16T09:10:00.000Z', bijgewerkt: '2026-11-16T09:10:00.000Z' };
  const items = tl.bouwTijdlijn({ runs: [runM], pogingen: [], voorstellen: [voorstel({ id: 'vm', status: 'mislukt', pakketAanwezig: true, beslistOp: '2026-11-16T09:10:00.000Z' }), voorstel({ id: 'vx', status: 'mislukt', versie: '20261116-110000', pakketAanwezig: false, beslistOp: '2026-11-16T09:30:00.000Z' })], actieveVersie: '20261116-031827' });
  check('tijdlijn: mislukte run met archief op de server → «Продовжити з місця зупинки» (hervat); zonder archief → gewoon opnieuw', items.find((i) => i.id === 'run:rm')?.opnieuw.hervat === true && items.find((i) => i.id === 'run:rm')?.opnieuw.kan === true && items.find((i) => i.id === 'voorstel:vx')?.opnieuw.hervat === false, JSON.stringify(items.map((i) => [i.id, i.opnieuw])));

  return einde();
}
