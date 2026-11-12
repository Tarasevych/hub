// UITROL-001 · Конвеєр (src/uitrol/conveyor-stand.ts) en gekleurde labels (shared/terminal-tags.ts): puur, zonder database.
// Стан восьми вузлів із реального журналу (тривалості підетапів), відображення кроків майстра, зупинка власником, мітки рядків.
import { conveyorStand, installerOnderdelen, KNOPEN } from '../../src/uitrol/conveyor-stand';
import type { Flow, Regel, Run } from '../../src/uitrol/types';
import { regelTags, TAGS } from '../../shared/terminal-tags';
import { checker } from './hulp/nep-google';

const iso = (ms: number) => new Date(ms).toISOString();
const T0 = Date.parse('2027-03-01T10:00:00Z');
const regel = (nr: number, ms: number, tekst: string, niveau: Regel['niveau'] = 'info'): Regel => ({ nr, tijd: iso(ms), niveau, tekst });
const run = (extra: Partial<Run>): Run => ({
  id: '20270301T100000Z-aaaaaaaa', methode: 'passkey', versie: '20270301-095900', release: '', staat: 'bezig', stap: 'installeren', sub: '', pct: 55, code: '', uk: '', nl: '',
  stappen: [], voorstelId: 'v1', sha256: 'a'.repeat(64), bytes: 1, commit: '', voorbereider: '', goedgekeurdDoor: 'eigenaar', wijzigingen: '',
  wie: '', adres: '', logRegels: 0, gestart: iso(T0), bijgewerkt: iso(T0 + 60_000), geeindigd: '', ...extra,
} as Run);
const stapRegel = (ms: number, id: string, pct: number) => regel(pct, ms, `[installeer] stap: ${id} (${pct}%)`);
const LOG: Regel[] = [
  regel(1, T0, '[uitrol] pakket ontvangen: 20270301-095900'),
  stapRegel(T0 + 5_000, 'proef', 44), stapRegel(T0 + 8_000, 'kopie', 45), stapRegel(T0 + 10_000, 'npm', 55),
  regel(3, T0 + 11_000, 'npm warn deprecated inflight@1.0.6'), regel(4, T0 + 30_000, 'added 412 packages in 19s'),
  stapRegel(T0 + 31_000, 'bouwen', 70), regel(5, T0 + 32_000, 'vite v6.0.0 building for production...'), regel(6, T0 + 50_000, '✓ built in 18.2s'),
  stapRegel(T0 + 51_000, 'pgversie', 74), stapRegel(T0 + 52_000, 'backup', 75), stapRegel(T0 + 60_000, 'migraties', 80),
];

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-conveyor');
  const ids = (k: ReturnType<typeof conveyorStand>) => k.map((x) => `${x.id}:${x.stand}`).join(' ');

  // ---- onderdelen uit de logregels
  const ond = installerOnderdelen(LOG, undefined, T0 + 90_000);
  check('onderdelen: alle acht «stap:»-regels herkend, in volgorde', ond.map((o) => o.id).join(',') === 'proef,kopie,npm,bouwen,pgversie,backup,migraties');
  check('onderdelen: duur = tot het volgende onderdeel (npm 21 s)', ond.find((o) => o.id === 'npm')?.duurMs === 21_000 && ond.find((o) => o.id === 'bouwen')?.duurMs === 20_000);
  check('onderdelen: het laatste loopt nog, duur tot «nu» (30 s)', ond[ond.length - 1].stand === 'actief' && ond[ond.length - 1].duurMs === 30_000 && ond[0].stand === 'ok');
  check('onderdelen: pct en knoop', ond.find((o) => o.id === 'migraties')?.pct === 80 && ond.find((o) => o.id === 'migraties')?.knoop === 'database' && ond.find((o) => o.id === 'bouwen')?.knoop === 'voorbereiding');
  const metEind = installerOnderdelen(LOG, iso(T0 + 70_000), T0 + 999_999);
  check('onderdelen: bij een geëindigde run telt «eind», niet «nu»', metEind[metEind.length - 1].duurMs === 10_000);
  check('onderdelen: dubbele of onbekende stap-regels worden genegeerd', installerOnderdelen([stapRegel(T0, 'npm', 55), stapRegel(T0 + 1, 'npm', 55), stapRegel(T0 + 2, 'onzin', 1)]).length === 1);

  // ---- A. wizard (Flow)
  const flow = (f: Partial<Flow>): Flow => ({ fase: 'vereisten', versie: '', detail: '', ...f } as Flow);
  let k = conveyorStand({ run: null, regels: [], flow: flow({ stap: 'vereisten', stand: 'bezig', detail: 'SHA-256 wordt berekend' }), nieuweFlow: true, wachtend: 0, goedgekeurd: 0 });
  check('wizard: vereisten actief, de rest wacht', ids(k) === 'vereisten:actief upload:wacht controle:wacht goedkeuring:wacht voorbereiding:wacht database:wacht overschakelen:wacht gezondheid:wacht');
  check('wizard: detail van de flow wordt het lopende onderdeel', k[0].sub === 'SHA-256 wordt berekend');
  k = conveyorStand({ run: null, regels: [], flow: flow({ stap: 'upload', stand: 'bezig' }), nieuweFlow: true, wachtend: 0, goedgekeurd: 0 });
  check('wizard: upload actief → vereisten ok', k[0].stand === 'ok' && k[1].stand === 'actief' && k[2].stand === 'wacht');
  k = conveyorStand({ run: null, regels: [], flow: flow({ stap: 'controle', stand: 'fout', detail: 'MIGRATIE_PROEF' }), nieuweFlow: true, wachtend: 0, goedgekeurd: 0 });
  check('wizard: fout bij de controle → knoop «fout», detail bewaard', k[2].stand === 'fout' && k[2].sub === 'MIGRATIE_PROEF');
  k = conveyorStand({ run: null, regels: [], flow: flow({ fase: 'goedkeuring' }), nieuweFlow: true, wachtend: 0, goedgekeurd: 0 });
  check('wizard: fase goedkeuring zonder stap → goedkeuring actief', k[3].stand === 'actief' && k[2].stand === 'ok');

  // ---- C. zonder run: wachtend / goedgekeurd
  k = conveyorStand({ run: null, regels: [], nieuweFlow: false, wachtend: 1, goedgekeurd: 0 });
  check('wachtend op passkey: controle ok, goedkeuring actief', k[2].stand === 'ok' && k[3].stand === 'actief' && k[4].stand === 'wacht');
  k = conveyorStand({ run: null, regels: [], nieuweFlow: false, wachtend: 0, goedgekeurd: 1 });
  check('goedgekeurd, root pakt op: voorbereiding actief', k[3].stand === 'ok' && k[4].stand === 'actief');
  k = conveyorStand({ run: null, regels: [], nieuweFlow: false, wachtend: 0, goedgekeurd: 0 });
  check('rust: alles wacht', k.every((x) => x.stand === 'wacht') && k.length === KNOPEN.length);

  // ---- B. lopende run (passkey)
  k = conveyorStand({ run: run({ staat: 'bezig', stappen: [{ stap: 'ontvangen', staat: 'ok', pct: 5, tijd: iso(T0), uk: '', nl: '' }, { stap: 'echtheid', staat: 'ok', pct: 25, tijd: iso(T0 + 2000), uk: '', nl: '' }] as Run['stappen'] }), regels: LOG, nieuweFlow: false, wachtend: 0, goedgekeurd: 0, nu: T0 + 90_000 });
  check('run bezig: vier wizardknopen ok, voorbereiding ok, database actief', ids(k) === 'vereisten:ok upload:ok controle:ok goedkeuring:ok voorbereiding:ok database:actief overschakelen:wacht gezondheid:wacht');
  check('run bezig: lopend onderdeel = migraties (uk/nl)', k[5].sub === 'міграції бази даних' && k[5].subNl === 'databasemigraties');
  check('run bezig: duur van «Підготовка» = som van de onderdelen incl. root-controles (51 s)', k[4].duurMs === 51_000);
  check('run bezig: root-controles vooraan bij «Підготовка», met duur', k[4].onderdelen[0].id === 'root-ontvangen' && k[4].onderdelen[0].duurMs === 2000 && k[4].onderdelen[1].id === 'root-echtheid' && k[4].onderdelen[1].duurMs === 3000);
  check('run bezig: goedkeurder als onderdeel van «Схвалення»', k[3].sub === 'eigenaar');

  // ---- B. run zonder installer-regels: root-controles lopen
  k = conveyorStand({ run: run({ staat: 'bezig', stappen: [{ stap: 'ontvangen', staat: 'ok', pct: 5, tijd: iso(T0), uk: '', nl: '' }, { stap: 'kopie', staat: 'bezig', pct: 8, tijd: iso(T0 + 1000), uk: '', nl: '' }] as Run['stappen'] }), regels: [], nieuweFlow: false, wachtend: 0, goedgekeurd: 0, nu: T0 + 5000 });
  check('run net begonnen: voorbereiding actief met de root-stap als onderdeel', k[4].stand === 'actief' && k[4].sub === 'копія в робочу теку root' && k[5].stand === 'wacht');

  // ---- B. klaar
  k = conveyorStand({ run: run({ staat: 'klaar', pct: 100, geeindigd: iso(T0 + 120_000) }), regels: [...LOG, stapRegel(T0 + 70_000, 'activeren', 90), stapRegel(T0 + 80_000, 'gezondheid', 95), stapRegel(T0 + 100_000, 'nabewaken', 98)], nieuweFlow: false, wachtend: 0, goedgekeurd: 0, nu: T0 + 999_999 });
  check('run klaar: alle acht ok', k.every((x) => x.stand === 'ok'));
  check('run klaar: gezondheid 40 s (20 + 20 tot geëindigd)', k[7].duurMs === 40_000 && k[6].duurMs === 10_000);

  // ---- B. gestopt door de eigenaar (stop.json) tijdens npm
  const stopLog = [...LOG.slice(0, 5), regel(9, T0 + 20_000, '[uitrol] STOP: eigenaar vraagt te stoppen bij 55 % (test) — installatie wordt afgebroken'), regel(10, T0 + 20_100, '[installeer] stap: gestopt (55%) зупинено власником / gestopt door de eigenaar'), regel(11, T0 + 20_200, '[uitrol] installatie gestopt door de eigenaar (afsluitcode 143)')];
  k = conveyorStand({ run: run({ staat: 'mislukt', code: 'GESTOPT', geeindigd: iso(T0 + 20_300) }), regels: stopLog, nieuweFlow: false, wachtend: 0, goedgekeurd: 0 });
  check('gestopt: knoop «Підготовка» = gestopt, de rest wacht', k[4].stand === 'gestopt' && k[5].stand === 'wacht' && k[7].stand === 'wacht');
  check('gestopt: onderdeel «gestopt» in de lijst met stand gestopt', k[4].onderdelen.some((o) => o.id === 'gestopt' && o.stand === 'gestopt'));
  k = conveyorStand({ run: run({ staat: 'mislukt', code: 'GESTOPT' }), regels: LOG.slice(0, 4), nieuweFlow: false, wachtend: 0, goedgekeurd: 0 });
  check('gestopt zonder stap-regel: code GESTOPT volstaat', k[4].stand === 'gestopt');

  // ---- B. mislukt bij migraties
  k = conveyorStand({ run: run({ staat: 'mislukt', code: 'MIGRATIE', geeindigd: iso(T0 + 65_000) }), regels: LOG, nieuweFlow: false, wachtend: 0, goedgekeurd: 0 });
  check('mislukt: database fout, voorbereiding ok, erna wacht', k[4].stand === 'ok' && k[5].stand === 'fout' && k[6].stand === 'wacht');

  // ---- B. ssh
  k = conveyorStand({ run: run({ methode: 'ssh', staat: 'klaar' }), regels: [], nieuweFlow: false, wachtend: 0, goedgekeurd: 0 });
  check('ssh: wizard- en rootknopen n.v.t., gezondheid ok', k.slice(0, 7).every((x) => x.stand === 'overgeslagen') && k[7].stand === 'ok');

  // ---- labels
  const tags = regelTags([...LOG, regel(9, T0, '[uitrol] STOP: eigenaar vraagt te stoppen bij 55 % (test)'), regel(10, T0, '[installeer] FOUT: npm ci mislukt'), regel(11, T0, 'systemctl restart mijn-ruimte.service'), regel(12, T0, 'ERROR:  relation "x" does not exist')].map((r) => r.tekst));
  const t = (i: number) => tags[i].map((x) => x.id).join(',');
  check('labels: [uitrol] → root', t(0) === 'root');
  check('labels: stap-regel → installer + onderdeel', t(1) === 'installer,proef' && t(3) === 'installer,npm');
  check('labels: npm-uitvoer erft het lopende onderdeel npm (één label, geen dubbel)', t(4) === 'npm' && t(5) === 'npm');
  check('labels: vite-uitvoer → bouwen + vite', t(7) === 'bouwen,vite' && t(8) === 'bouwen,vite');
  check('labels: STOP-regel van root → root + stop', t(12) === 'root,stop');
  check('labels: [installeer] FOUT → installer + fout', t(13) === 'installer,fout');
  check('labels: systemd en database herkend, met foutwoord', t(14) === 'migraties,systemd' && t(15) === 'migraties,db,fout');
  check('labels: alle labels hebben uk én nl', Object.values(TAGS).every((x) => x.uk && x.nl));
  check('labels: ANSI-codes storen de herkenning niet', regelTags(['\u001b[32m[uitrol]\u001b[0m klaar'])[0][0].id === 'root');
  check('labels: lege en vreemde invoer → geen labels, geen crash', regelTags(['', '   ', '🚀 emoji regel'])[2].length === 0);

  return einde();
}

if (process.argv[1] && /uitrol-conveyor\.test\.ts$/.test(process.argv[1])) main().then((c) => process.exit(c));
