// BUG-002 (29.10.2026) «Перевірка всіх адрес» springt zelf open en dicht. Regressietests van src/afzenders/scan-weergave.ts
// (de scheiding tussen de achtergrondcontrole en het venster) en van de bron van melding/paneel/api. Het echte gedrag in de browser
// (HTTP_502, time-out, tabwissel, hermount, verversen, computer + telefoon) staat in tests/e2e/scan-melding.e2e.ts.
import { readFileSync } from 'node:fs';
import {
  bewaarKeuze, eenmaligAuto, eenStart, hervattenKlaar, hervattenTerug, leesKeuze, reserveerHervatten, scanVraagtAandacht, scanZichtbaar,
  SCAN_AUTO_INTERVAL_MS, SCAN_HERVAT_PAUZE_MS, SCAN_MAX_AUTO_HERVAT, SCAN_NAGLOEI_MS, _herstelVoorTest,
} from '../../src/afzenders/scan-weergave';
import type { ScanStand } from '../../src/afzenders/api';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const stand = (o: Partial<ScanStand> = {}, fase: 'volledig' | 'bijwerken' = 'volledig', acc = 'bezig'): ScanStand => ({
  staat: 'bezig', loopt: true, verwerkt: 100, schatting: 1000, eersteKlaarOp: null, bijgewerktOp: null,
  accounts: [{ accountId: 'a', email: 'x@y', staat: acc, fase, verwerkt: 100, schatting: 1000, fout: '', eersteKlaarOp: null, bijgewerktOp: null }],
  tellers: { contacten: 0, geverifieerd: 0, verdacht: 0, geschreven: 0, officieel: 0, dns: 0 }, ...o });

export async function main(): Promise<number> {
  const { check, einde } = checker('scan-weergave-20261029');
  const opslag = new Map<string, string>();
  (globalThis as any).sessionStorage = { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => { opslag.set(k, v); }, removeItem: (k: string) => { opslag.delete(k); } };

  // 1. keuze los van de controle
  check('keuze: zonder iets bewaard → null (telefoon begint ingeklapt, computer open)', leesKeuze() === null);
  bewaarKeuze('klein');
  check('keuze «klein» overleeft een nieuwe mount / verversen (sessionStorage)', leesKeuze() === 'klein');
  bewaarKeuze('weg');
  check('keuze «weg» blijft, ook via de oude sleutel (compatibel met eerdere versies)', leesKeuze() === 'weg' && opslag.get('tsv:mail-contacten-melding-weg') === '1');
  bewaarKeuze('open');
  check('keuze «open» wist de oude «weg»-sleutel', leesKeuze() === 'open' && !opslag.has('tsv:mail-contacten-melding-weg'));
  opslag.clear(); opslag.set('tsv:mail-contacten-melding-weg', '1');
  check('oude «weg» van vóór de fix telt nog als «weg» (geen heropenen na handmatig sluiten)', leesKeuze() === 'weg');

  // 2. aandacht en naglooi
  check('aandacht: volledige run die loopt → ja', scanVraagtAandacht(stand(), false));
  check('aandacht: het korte periodieke bijwerken (fase «bijwerken») opent het venster NIET zelf', !scanVraagtAandacht(stand({}, 'bijwerken'), false));
  check('aandacht: fout of onderbroken → ja, ook bij bijwerken', scanVraagtAandacht(stand({ staat: 'fout', loopt: false }, 'bijwerken', 'fout'), false) && scanVraagtAandacht(stand({ staat: 'onderbroken', loopt: false }), false));
  check('aandacht: de browser wacht op een nieuwe poging → ja', scanVraagtAandacht(stand({ staat: 'klaar', loopt: false }, 'volledig', 'klaar'), true));
  check('aandacht: klaar / gepauzeerd / gestopt → nee', ['klaar', 'gepauzeerd', 'gestopt'].every((st) => !scanVraagtAandacht(stand({ staat: st as ScanStand['staat'], loopt: false, automatisch: true }, 'volledig', st), false)));
  check('aandacht: geen stand → nee', !scanVraagtAandacht(null, false));
  const t = 1_000_000;
  check('naglooi: een korte wissel (aandacht kort weg) laat een staand venster staan', scanZichtbaar(false, true, t, t + 1000));
  check(`naglooi: na ${SCAN_NAGLOEI_MS} ms zonder aandacht verdwijnt het`, !scanZichtbaar(false, true, t, t + SCAN_NAGLOEI_MS));
  check('naglooi: wat niet stond, verschijnt niet zonder aandacht', !scanZichtbaar(false, false, null, t));

  // 3. levenscyclus: één auto-start, beperkte hervattingen, één start tegelijk
  _herstelVoorTest();
  let auto = 0; const f = () => { auto++; return Promise.resolve(); };
  eenmaligAuto(f, t); eenmaligAuto(f, t + 10); eenmaligAuto(f, t + 60_000);
  check('…/scan/auto: drie mounts kort na elkaar → één verzoek (vroeger: elke mount)', auto === 1);
  eenmaligAuto(f, t + SCAN_AUTO_INTERVAL_MS);
  check('…/scan/auto: na 15 min weer toegestaan (periodiek bijwerken blijft)', auto === 2);
  _herstelVoorTest();
  const r1 = reserveerHervatten(t), r2 = reserveerHervatten(t + 1);
  check('hervatten: één tegelijk (twee panelen tegelijk → één)', r1 && !r2);
  hervattenKlaar();
  check('hervatten: niet sneller dan elke 30 s', !reserveerHervatten(t + 1000) && reserveerHervatten(t + SCAN_HERVAT_PAUZE_MS));
  hervattenKlaar();
  let n = 2; for (let i = 0; i < 10; i++) { if (reserveerHervatten(t + SCAN_HERVAT_PAUZE_MS * (i + 2))) n++; hervattenKlaar(); }
  check(`hervatten: hoogstens ${SCAN_MAX_AUTO_HERVAT} per bezoek (vroeger eindeloos na elke nieuwe «fout»)`, n === SCAN_MAX_AUTO_HERVAT, String(n));
  hervattenTerug();
  check('hervatten: een handmatige actie zet de teller terug', reserveerHervatten(t + SCAN_HERVAT_PAUZE_MS * 50));
  hervattenKlaar();
  _herstelVoorTest();
  let starts = 0; let los!: (v: string) => void;
  const s1 = eenStart(() => { starts++; return new Promise<string>((r) => { los = r; }); }), s2 = eenStart(() => { starts++; return Promise.resolve('b'); });
  los('a');
  check('start: twee tegelijk → één verzoek, beide krijgen hetzelfde antwoord', starts === 1 && (await s1) === 'a' && (await s2) === 'a');
  await eenStart(() => { starts++; return Promise.resolve('c'); });
  check('start: na het antwoord kan een nieuwe start', starts === 2);

  // 4. bron: de melding gebruikt de scheiding
  const melding = lees('src/afzenders/ContactenScanMelding.tsx'), paneel = lees('src/afzenders/ScanPaneel.tsx'), api = lees('src/afzenders/api.ts');
  check('melding: «klein» wordt na (her)registratie teruggezet via vensterBeheer.minimaliseer', /if \(keuze === 'klein'\) vensterBeheer\.minimaliseer\(VENSTER_ID\)/.test(melding));
  check('melding: Згорнути / terughalen uit het dok wordt bewaard (alleen een echte wissel)', /kies\(k \? 'klein' : 'open'\)/.test(melding) && /vorig === undefined/.test(melding));
  check('melding: …/scan/auto via eenmaligAuto (niet per mount)', /eenmaligAuto\(\(\) => contactenApi\.scanAuto\(\)/.test(melding) && !/useEffect\(\(\) => \{ void contactenApi\.scanAuto\(\)/.test(melding));
  check('melding: telefoonstrook volgt de bewaarde keuze', /onClick=\{\(\) => kies\(ingeklapt \? 'open' : 'klein'\)\}/.test(melding));
  check('paneel: automatisch hervatten via reserveerHervatten, starten via eenStart', /if \(!reserveerHervatten\(\)\) return;/.test(paneel) && (paneel.match(/eenStart\(/g) || []).length >= 4);
  check('api: een mislukte statusvraag stopt het bijhouden niet meer (backoff, max 12)', /POLL_MAX_MISLUKT = 12/.test(api) && /plannenPoll\(Math\.min\(POLL_MAX_MS/.test(api) && !/scanStatus\(\)\.then\(zetScanStand\)\.catch\(\(\) => undefined\)/.test(api));
  return einde();
}
