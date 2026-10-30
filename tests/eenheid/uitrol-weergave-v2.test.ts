// UI-010 fase 2: effectieve toegang, herstelacties, voortgang per etappe, groeperen zonder auditverlies, recente problemen,
// terminalvertaling (alleen eigen meldingen, variabelen letterlijk), en de manifestcontrole in het root-script.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { effectieveToegang, groepeer, herstelActies, recenteProblemen, voortgang } from '../../src/uitrol/weergave-v2';
import { vertaalRegel } from '../../shared/terminal-taal';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-weergave-v2');
  const g = (o: Record<string, unknown>) => ({ id: 'g', soort: 'agent', onderwerp: 'claude', label: 'Claude', gegevenDoor: '', gegevenOp: '', verlooptOp: '2099-01-01T00:00:00Z', ingetrokkenOp: '', status: 'actief', ...o }) as any;
  const data = { beleid: { staat: 'geldig', agents: [], tegels: [{ slug: 'claude', modus: 'always' }, { slug: 'gpt', modus: 'off' }] }, kandidaten: { accounts: [], agenttokens: [{ id: 't1' }], koppelingen: [{ id: 'k1' }] } } as any;
  check('agent met beleid «always» → actief', effectieveToegang(g({}), data) === 'actief');
  check('agent met beleid «off» → beleid', effectieveToegang(g({ onderwerp: 'gpt' }), data) === 'beleid');
  check('verlopen datum → verlopen (ook als status nog actief)', effectieveToegang(g({ verlooptOp: '2000-01-01T00:00:00Z' }), data) === 'verlopen');
  check('ingetrokken → ingetrokken', effectieveToegang(g({ status: 'ingetrokken' }), data) === 'ingetrokken');
  check('koppeling bestaat niet meer → verweesd', effectieveToegang(g({ soort: 'mcp-koppeling', onderwerp: 'kX' }), data) === 'verweesd' && effectieveToegang(g({ soort: 'mcp-koppeling', onderwerp: 'k1' }), data) === 'actief');
  check('onbepaald → geen verloop', effectieveToegang(g({ onbepaald: true, verlooptOp: '2000-01-01T00:00:00Z' }), data) === 'actief');

  const p = (o: Record<string, unknown>) => ({ etappe: 'lezen', code: 'BESTAND_LEZEN|NotReadableError', hervatbaar: false, ontvangen: 0, procent: 100, bytes: 1000, verstuurd: 0, ...o }) as any;
  check('NotReadableError → alleen «Вибрати архів знову» (geen belofte van herstel)', JSON.stringify(herstelActies(p({}))) === '["archief-kiezen"]');
  check('hervatbaar → «Продовжити» eerst', herstelActies(p({ hervatbaar: true, ontvangen: 10, etappe: 'uploaden', code: 'NETWORK_ERROR' }))[0] === 'hervatten');
  check('voorcontrole → vereisten + controle herhalen', JSON.stringify(herstelActies(p({ etappe: 'voorcontrole', code: 'VOORCONTROLE_MISLUKT' }))) === '["vereisten","controle-herhalen"]');
  check('installeren → logboek + diagnose', JSON.stringify(herstelActies(p({ etappe: 'installeren', code: 'INSTALLATIE_MISLUKT' }))) === '["logboek","diagnose"]');
  const vg = voortgang(p({}));
  check('100% gelezen = etappe 2/8 «gelezen», niet geslaagd', vg.stap === 2 && vg.totaal === 8 && vg.soort === 'gelezen' && vg.procent === 100);
  check('uploaden → «verstuurd»', voortgang(p({ etappe: 'uploaden', procent: 40 })).soort === 'verstuurd');

  const it = (id: string, versie: string, staat: string) => ({ id, versie, staat }) as any;
  const gr = groepeer([it('a', 'V2', 'afgebroken'), it('b', 'V2', 'afgebroken'), it('c', 'V2', 'mislukt'), it('d', 'V2', 'klaar'), it('e', 'V1', 'afgebroken')]);
  check('3 mislukte pogingen van V2 in één groep; geslaagde run apart; niets verloren', gr.length === 3 && gr[0].items.length === 3 && gr.flatMap((x) => x.items).length === 5);

  const nu = Date.parse('2026-10-29T12:00:00Z');
  const pog = [{ id: '1', versie: '20261029-100000', tijd: '2026-10-29T10:00:00Z' }, { id: '2', versie: '20261020-100000', tijd: '2026-10-20T10:00:00Z' }, { id: '3', versie: '20261028-100000', tijd: '2026-10-28T10:00:00Z' }] as any;
  const runs = [{ staat: 'klaar', versie: '20261028-120000', gestart: '2026-10-28T12:00:00Z', geeindigd: '2026-10-28T12:10:00Z' }] as any;
  const rp = recenteProblemen(pog, runs, '20261028-120000', nu);
  check('recente problemen: ouder dan 7 dagen en ingehaalde pogingen vallen weg', rp.length === 1 && rp[0].id === '1', JSON.stringify(rp.map((x) => x.id)));
  check('geen actuele problemen → leeg', recenteProblemen([], runs, '', nu).length === 0);

  // terminal
  const t1 = vertaalRegel('[installeer] migraties uitvoeren…', 'uk');
  check('eigen melding → Oekraïens', t1.vertaald && t1.tekst === '[installeer] виконання міграцій…');
  const t2 = vertaalRegel('[installeer] stap: migraties (80%) databasemigraties', 'uk');
  check('voortgangsregel: id en % letterlijk, tekst vertaald', t2.tekst === '[installeer] крок: migraties (80%) міграції бази даних', t2.tekst);
  const t3 = vertaalRegel('[uitrol] archief bewaard: /srv/a/x.tar.gz (123 bytes, sha256 abc)', 'uk');
  check('pad, bytes en sha letterlijk behouden', t3.tekst === '[uitrol] архів збережено: /srv/a/x.tar.gz (123 байт, sha256 abc)', t3.tekst);
  check('uitvoer van derden (npm) nooit vertaald', !vertaalRegel('npm WARN deprecated foo@1.0', 'uk').vertaald && vertaalRegel('npm WARN deprecated foo@1.0', 'uk').tekst === 'npm WARN deprecated foo@1.0');
  const t4 = vertaalRegel('[installeer] LET OP: iets onbekends in /etc/x', 'uk');
  check('onbekende eigen waarschuwing: alleen voorvoegsel vertaald, rest letterlijk', t4.tekst === '[installeer] УВАГА: iets onbekends in /etc/x');
  check('nl → ongewijzigd', vertaalRegel('[installeer] migraties uitvoeren…', 'nl').tekst === '[installeer] migraties uitvoeren…');
  const ansi = '\x1b[32m[installeer] veilige uitrol ingericht';
  check('ANSI-kleur blijft vooraan staan', vertaalRegel(ansi, 'uk').tekst === '\x1b[32m[installeer] безпечне розгортання налаштовано');
  check('Cyrillisch/Unicode in variabelen blijft intact', vertaalRegel('[installeer] map: /srv/Мій простір ✓', 'uk').tekst === '[installeer] тека: /srv/Мій простір ✓');

  // root-script: de python-controle uit mijn-ruimte-uitrol.sh echt draaien
  const sh = readFileSync('deploy/uitrol/mijn-ruimte-uitrol.sh', 'utf8');
  const py = sh.slice(sh.indexOf('import json, re, sys'), sh.indexOf('\nPY\n)"'));
  const map = mkdtempSync(join(tmpdir(), 'rootmanifest-'));
  const draai = (inhoud: string, versie: string) => { const f = join(map, 'm.json'); writeFileSync(f, inhoud); writeFileSync(join(map, 'c.py'), py); return spawnSync('python3', [join(map, 'c.py'), f, versie], { encoding: 'utf8' }).stdout.trim(); };
  const V = '20261102-101010';
  check('root: geldig manifest → geen fout', draai(manifestVoor(V), V) === '', draai(manifestVoor(V), V));
  const zonderUk = JSON.parse(manifestVoor(V)); delete zonderUk.beschrijving.uk;
  check('root: zonder uk → beschrijving.uk.*', /beschrijving\.uk\.titel/.test(draai(JSON.stringify(zonderUk), V)));
  check('root: AI zonder platform/model.bron → veldnamen', /deelnemers\[0\]\.platform.*deelnemers\[0\]\.model\.bron/.test(draai(manifestVoor(V, { deelnemers: [{ soort: 'ai', naam: 'gpt', rollen: ['ontwikkeling'] }] }), V)));
  check('root: handmatig zonder AI met zonderAi → geldig', draai(manifestVoor(V, { zonderAi: true, deelnemers: [{ soort: 'mens', naam: 'Pavlo', rollen: ['ontwikkeling'] }] }), V) === '');
  check('root: kapotte JSON → melding', /geen geldige JSON/.test(draai('{kapot', V)));
  check('root-script: syntaxis ok', execFileSync('bash', ['-n', 'deploy/uitrol/mijn-ruimte-uitrol.sh']).length === 0);
  return einde();
}
