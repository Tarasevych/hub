// «Історія» als één tijdlijn (22.10.2026, zone B): src/uitrol/geschiedenis-tijdlijn.ts — sorteren op datum over runs, pogingen en
// voorstellen; de stand per regel (teruggedraaid/autoterug uit de codes ROOK_*/NAZORG_*/TERUG_OK); geen dubbele regels (voorstel met
// poging of run); het tijdvenster per pagina; en de regel voor «Спробувати знову» (uit met reden bij een nieuwere installatie, een
// oudere versie dan de actieve, een lopende run of zonder versie). Zuiver, zonder DOM.
import { checker } from './hulp/nep-google';
import type { PogingUit } from '../../shared/uitrol-pogingen';
import type { Run, Voorstel } from '../../src/uitrol/types';

const run = (o: Partial<Run> & { id: string; versie: string; staat: Run['staat']; gestart: string }): Run => ({
  methode: 'passkey', release: '', stap: 'klaar', sub: '', pct: 100, code: '', uk: 'uk', nl: 'nl', stappen: [], voorstelId: '', sha256: '', bytes: 0, commit: '', voorbereider: '', goedgekeurdDoor: '', wijzigingen: '',
  wie: '', adres: '', logRegels: 0, bijgewerkt: o.gestart, geeindigd: o.gestart, ...o,
});
const poging = (o: Partial<PogingUit> & { id: string; versie: string; tijd: string }): PogingUit => ({
  voorstelId: '', sha256: '', bytes: 1000, etappe: 'uploaden', verstuurd: 400, procent: 40, code: 'NETWORK_ERROR', redenBekend: true, poging: 1, bestand: 'x.tar.gz', gemeldDoor: 'browser', voorbereider: 'a@b', gemeldOp: o.tijd, hervatbaar: false, ontvangen: 0, voorstelStatus: 'afgebroken', ...o,
});
const voorstel = (o: Partial<Voorstel> & { id: string; versie: string; status: string; aangemaaktOp: string }): Voorstel => ({
  bytes: 10, sha256: '', ontvangen: 0, voorbereider: 'a@b', commit: '', wijzigingen: '', tests: {}, diffSamenvatting: '', beslistOp: '', beslistDoor: '', uitkomstCode: '', uitkomst: null, ...o,
});

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-geschiedenis-tijdlijn-20261022');
  const { bouwTijdlijn, opnieuwMogelijk, runStaat, tijdlijnTellers, tijdlijnStaatTekst, opnieuwRedenTekst, TIJDLIJN_STATEN } = await import('../../src/uitrol/geschiedenis-tijdlijn');
  const T = (d: string) => `2026-10-${d}T12:00:00.000Z`;

  const runs: Run[] = [
    run({ id: 'r1', versie: '20261010-120000', staat: 'klaar', gestart: T('10') }),
    run({ id: 'r2', versie: '20261012-120000', staat: 'mislukt', gestart: T('12'), code: 'INSTALLATIE_MISLUKT' }),
    run({ id: 'r3', versie: '20261014-120000', staat: 'klaar', gestart: T('14') }),
    run({ id: 'r4', versie: '20261014-120000', staat: 'klaar', gestart: T('15'), code: 'ROOK_TERUGGEDRAAID', methode: 'passkey' }),
    run({ id: 'r5', versie: '20261013-120000', staat: 'klaar', gestart: T('16'), code: 'TERUG_OK', methode: 'opdracht', wie: 'passkey' }),
    run({ id: 'r6', versie: '20261018-120000', staat: 'geweigerd', gestart: T('18'), code: 'HERGEBRUIKT' }),
  ];
  const pogingen: PogingUit[] = [
    poging({ id: 'p1', versie: '20261011-120000', tijd: T('11'), voorstelId: 'v1' }),
    poging({ id: 'p2', versie: '20261019-120000', tijd: T('19'), voorstelId: 'v3', hervatbaar: true, ontvangen: 400, voorstelStatus: 'uploaden' }),
  ];
  const voorstellen: Voorstel[] = [
    voorstel({ id: 'v1', versie: '20261011-120000', status: 'afgebroken', aangemaaktOp: T('11'), uitkomstCode: 'UPLOAD_STIL' }),          // heeft poging p1 → niet dubbel
    voorstel({ id: 'v2', versie: '20261017-120000', status: 'afgewezen', aangemaaktOp: T('17'), beslistOp: T('17'), uitkomst: { reden: 'te groot' } }),
    voorstel({ id: 'v3', versie: '20261019-120000', status: 'uploaden', aangemaaktOp: T('19') }),                                            // loopt nog → niet in de tijdlijn
    voorstel({ id: 'v4', versie: '20261014-120000', status: 'geinstalleerd', aangemaaktOp: T('14'), beslistOp: T('14') }),                    // heeft run r3 → niet apart
    voorstel({ id: 'v5', versie: '20261018-120000', status: 'geweigerd', aangemaaktOp: T('18'), beslistOp: T('18'), uitkomstCode: 'HERGEBRUIKT' }), // run r6 binnen 15 min → niet apart
    voorstel({ id: 'v6', versie: '20261020-120000', status: 'verlopen', aangemaaktOp: T('13'), bijgewerktOp: T('20'), uitkomstCode: 'GEEN_UITKOMST' }),
  ];
  const actieveVersie = '20261014-120000';
  const tl = bouwTijdlijn({ runs, pogingen, voorstellen, actieveVersie });

  check('runStaat: ROOK_/NAZORG_ → autoterug, TERUG_OK/SSH_TERUG → teruggedraaid, anders de staat van de run', runStaat({ staat: 'klaar', code: 'ROOK_TERUGGEDRAAID' }) === 'autoterug' && runStaat({ staat: 'klaar', code: 'NAZORG_TERUGGEDRAAID' }) === 'autoterug' && runStaat({ staat: 'klaar', code: 'TERUG_OK' }) === 'teruggedraaid' && runStaat({ staat: 'klaar', code: 'SSH_TERUG' }) === 'teruggedraaid' && runStaat({ staat: 'klaar', code: '' }) === 'klaar' && runStaat({ staat: 'mislukt', code: 'X' }) === 'mislukt');
  check('tijdlijn: één lijst, nieuwste eerst, op datum over de drie bronnen heen', tl.map((i) => i.id).join(',') === 'voorstel:v6,poging:p2,run:r6,voorstel:v2,run:r5,run:r4,run:r3,run:r2,poging:p1,run:r1', tl.map((i) => i.id).join(','));
  check('tijdlijn: geen dubbele regels (voorstel met poging, voorstel met run, lopende upload)', !tl.some((i) => ['voorstel:v1', 'voorstel:v3', 'voorstel:v4', 'voorstel:v5'].includes(i.id)));
  const st = Object.fromEntries(tl.map((i) => [i.id, i.staat]));
  check('tijdlijn: stand per regel', st['run:r4'] === 'autoterug' && st['run:r5'] === 'teruggedraaid' && st['poging:p2'] === 'afgebroken' && st['voorstel:v2'] === 'afgewezen' && st['voorstel:v6'] === 'verlopen' && st['run:r6'] === 'geweigerd' && st['run:r3'] === 'klaar', JSON.stringify(st));
  check('tijdlijn: tekst van een voorstel komt uit de uitkomst (reden), code uit uitkomstCode', tl.find((i) => i.id === 'voorstel:v2')?.uk === 'te groot' && tl.find((i) => i.id === 'voorstel:v6')?.code === 'GEEN_UITKOMST');
  const tellers = tijdlijnTellers(tl);
  check('tellers per stand kloppen', tellers.klaar === 2 && tellers.autoterug === 1 && tellers.teruggedraaid === 1 && tellers.mislukt === 1 && tellers.geweigerd === 1 && tellers.afgebroken === 2 && tellers.afgewezen === 1 && tellers.verlopen === 1 && tellers.bezig === 0, JSON.stringify(tellers));

  // «Спробувати знову»
  const op = Object.fromEntries(tl.map((i) => [i.id, `${i.opnieuw.kan ? 'ja' : i.opnieuw.reden}${i.opnieuw.hervat ? '+hervat' : ''}`]));
  check('opnieuw: gelukte installatie/terugdraaiing → niet van toepassing', op['run:r1'] === 'NIET_VAN_TOEPASSING' && op['run:r3'] === 'NIET_VAN_TOEPASSING' && op['run:r5'] === 'NIET_VAN_TOEPASSING');
  check('opnieuw: mislukte 20261012 waarna 20261014 is geïnstalleerd → uit (NIEUWER_GEINSTALLEERD)', op['run:r2'] === 'NIEUWER_GEINSTALLEERD', op['run:r2']);
  check('opnieuw: afgebroken 20261011 (ouder dan actief 20261014, en ingehaald) → uit', op['poging:p1'] === 'NIEUWER_GEINSTALLEERD');
  check('opnieuw: autoterug van 20261014 (= actieve versie, niets nieuwers erna) → kan', op['run:r4'] === 'ja', op['run:r4']);
  check('opnieuw: afgebroken upload 20261019 met bytes op de server → kan, hervatten', op['poging:p2'] === 'ja+hervat', op['poging:p2']);
  check('opnieuw: geweigerd 20261018 (nieuwer dan actief, niets nieuwers geïnstalleerd) → kan', op['run:r6'] === 'ja' && op['voorstel:v2'] === 'ja' && op['voorstel:v6'] === 'ja');
  check('opnieuw: een lopende run blokkeert alles', opnieuwMogelijk({ staat: 'mislukt', tijd: T('18'), versie: '20261018-120000' }, [...runs, run({ id: 'rb', versie: '20261021-120000', staat: 'bezig', gestart: T('21') })], actieveVersie).reden === 'BEZIG');
  check('opnieuw: zonder versie → GEEN_VERSIE', opnieuwMogelijk({ staat: 'afgebroken', tijd: T('18'), versie: '' }, runs, actieveVersie).reden === 'GEEN_VERSIE');
  check('opnieuw: versie ouder dan de actieve (zonder latere installatie) → OUDER_DAN_ACTIEF', opnieuwMogelijk({ staat: 'mislukt', tijd: T('19'), versie: '20261013-120000' }, runs, actieveVersie).reden === 'OUDER_DAN_ACTIEF');
  check('opnieuw: een terugdraaiing telt niet als «nieuwere installatie»', opnieuwMogelijk({ staat: 'mislukt', tijd: T('15'), versie: '20261014-120000' }, [run({ id: 'x', versie: '20261016-120000', staat: 'klaar', gestart: T('16'), code: 'TERUG_OK' })], '20261014-120000').kan === true);
  check('opnieuw: nieuwere installatie VÓÓR de poging telt niet (alleen erna)', opnieuwMogelijk({ staat: 'mislukt', tijd: T('17'), versie: '20261015-120000' }, [run({ id: 'x', versie: '20261016-120000', staat: 'klaar', gestart: T('16') })], '20261015-120000').kan === true);

  // Tijdvenster per pagina: alleen pogingen/voorstellen tussen de oudste en nieuwste run van die pagina.
  const venster = bouwTijdlijn({ runs: runs.slice(2, 5), pogingen, voorstellen, actieveVersie, venster: { van: Date.parse(T('14')), tot: Date.parse(T('16')) } });
  check('venster: buiten het tijdvenster van de pagina vallen pogingen en voorstellen weg', venster.map((i) => i.id).join(',') === 'run:r5,run:r4,run:r3', venster.map((i) => i.id).join(','));
  check('teksten: elke stand heeft uk ≠ nl; elke reden heeft tekst', TIJDLIJN_STATEN.every((s) => tijdlijnStaatTekst('uk', s) !== tijdlijnStaatTekst('nl', s)) && opnieuwRedenTekst('uk', 'NIEUWER_GEINSTALLEERD').length > 20 && opnieuwRedenTekst('nl', 'OUDER_DAN_ACTIEF').length > 20 && opnieuwRedenTekst('uk', '') === '');
  check('leeg: geen invoer → lege tijdlijn, tellers 0', bouwTijdlijn({ runs: [], pogingen: [], voorstellen: [], actieveVersie: '' }).length === 0 && tijdlijnTellers([]).klaar === 0);
  return einde();
}
