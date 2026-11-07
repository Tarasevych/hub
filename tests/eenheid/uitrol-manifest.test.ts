// UI-010 / BUG-004: shared/uitrol-manifest.ts — tweetalige metadata, deelnemers, modellen, TESTRESULTATEN v2.
import { kiesBeschrijving, leesTestresultaten, manifestVerplicht, testDetails, valideerManifest } from '../../shared/uitrol-manifest';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-manifest');
  const V = '20261102-101010';
  const goed = valideerManifest(manifestVoor(V), V);
  check('geldig manifest met meerdere agents/modellen → geen fouten', !!goed.manifest && goed.fouten.length === 0 && goed.manifest.deelnemers.filter((d) => d.soort === 'ai').length === 2, JSON.stringify(goed.fouten));
  const veld = (r: ReturnType<typeof valideerManifest>) => r.fouten.map((f) => f.veld);
  const j = JSON.parse(manifestVoor(V));
  const zonderUk = valideerManifest(JSON.stringify({ ...j, beschrijving: { nl: j.beschrijving.nl } }), V);
  check('zonder Oekraïense vertaling → fout beschrijving.uk.titel/samenvatting', veld(zonderUk).includes('beschrijving.uk.titel') && veld(zonderUk).includes('beschrijving.uk.samenvatting'), JSON.stringify(veld(zonderUk)));
  const nlAlsUk = valideerManifest(JSON.stringify({ ...j, beschrijving: { ...j.beschrijving, uk: j.beschrijving.nl } }), V);
  check('Nederlandse tekst in het uk-veld → fout (geen Cyrillisch)', veld(nlAlsUk).includes('beschrijving.uk.samenvatting'));
  const ongelijk = valideerManifest(JSON.stringify({ ...j, beschrijving: { ...j.beschrijving, nl: { ...j.beschrijving.nl, wijzigingen: ['a', 'b'] } } }), V);
  check('uk en nl ongelijk aantal punten → fout «beschrijving»', veld(ongelijk).includes('beschrijving'));
  const familie = valideerManifest(manifestVoor(V, { deelnemers: [{ soort: 'ai', naam: 'claude', platform: 'Claude Code', tool: 'CLI', model: { id: 'Claude', versie: null, bron: 'auteur' }, rollen: ['ontwikkeling'] }] }), V);
  check('model-id «Claude» (alleen familie) → fout deelnemers[0].model.id', veld(familie).includes('deelnemers[0].model.id'), JSON.stringify(veld(familie)));
  const geraden = valideerManifest(manifestVoor(V, { deelnemers: [{ soort: 'ai', naam: 'grok', platform: 'Grok Bot', tool: 'x', model: { id: 'grok-4', versie: null, bron: 'onbekend' }, rollen: ['ontwikkeling'] }] }), V);
  check('bron «onbekend» met toch een id → fout (niet raden)', veld(geraden).includes('deelnemers[0].model.id'));
  const zonderAgentMeta = valideerManifest(manifestVoor(V, { deelnemers: [{ soort: 'ai', naam: 'gpt', rollen: ['ontwikkeling'] }] }), V);
  check('AI zonder platform/tool/model.bron → concrete veldnamen', ['deelnemers[0].platform', 'deelnemers[0].tool', 'deelnemers[0].model.bron'].every((v) => veld(zonderAgentMeta).includes(v)), JSON.stringify(veld(zonderAgentMeta)));
  const mens = valideerManifest(manifestVoor(V, { zonderAi: true, deelnemers: [{ soort: 'mens', naam: 'Eigenaar Test', rollen: ['ontwikkeling', 'verpakken'] }] }), V);
  check('handmatige release zonder AI (zonderAi: true) → geldig', mens.fouten.length === 0 && mens.manifest?.zonderAi === true, JSON.stringify(mens.fouten));
  const mensImpliciet = valideerManifest(manifestVoor(V, { deelnemers: [{ soort: 'mens', naam: 'Pavlo', rollen: ['ontwikkeling'] }] }), V);
  check('alleen mens zonder zonderAi → fout «zonderAi» (expliciet menselijk auteurschap)', veld(mensImpliciet).includes('zonderAi'));
  check('versie ≠ UITROL-VERSIE → fout «versie»', veld(valideerManifest(manifestVoor('20261102-000000'), V)).includes('versie'));
  check('kapotte JSON → fout met bestandsnaam', veld(valideerManifest('{kapot', V)).includes('UITROL-MANIFEST.json'));
  check('beleid: oude versie niet verplicht, nieuwe wel', !manifestVerplicht('20261029-131639') && manifestVerplicht('20261101-000000') && manifestVerplicht(V));
  const V2 = '20261107-114500';
  const striktAlias = valideerManifest(manifestVoor(V2, { auteur: 'Власник', deelnemers: [{ soort: 'mens', naam: 'Власник', rollen: ['auteur'] }, { soort: 'ai', naam: 'antigravity', platform: 'Google Antigravity', tool: 'Antigravity IDE', model: { id: null, versie: null, bron: 'onbekend' }, rollen: ['ontwikkeling', 'verpakken'] }] }), V2);
  check('vanaf 20261106: alias «Власник» en «model onbekend» verboden → fouten auteur, deelnemers[0].naam, deelnemers[1].model.bron, deelnemers[1].model.id',
    ['auteur', 'deelnemers[0].naam', 'deelnemers[1].model.bron', 'deelnemers[1].model.id'].every((v) => veld(striktAlias).includes(v)), JSON.stringify(veld(striktAlias)));
  const striktGoed = valideerManifest(manifestVoor(V2, { auteur: 'Тарасевич Павло (tarasevych.pavlo@gmail.com)', deelnemers: [{ soort: 'mens', naam: 'Тарасевич Павло (tarasevych.pavlo@gmail.com)', rollen: ['auteur'] }, { soort: 'ai', naam: 'antigravity', platform: 'Google Antigravity', tool: 'Antigravity IDE', model: { id: 'claude-opus-4-6', versie: '20260205', bron: 'omgeving' }, rollen: ['ontwikkeling', 'controle', 'testen', 'verpakken'] }] }), V2);
  check('vanaf 20261106: echte accountnaam en concreet AI-model → geldig', striktGoed.fouten.length === 0 && !!striktGoed.manifest, JSON.stringify(striktGoed.fouten));

  // taalkeuze en terugval
  const m = goed.manifest!;
  check('taalkeuze uk → Oekraïense tekst', kiesBeschrijving(m, 'uk', null).tekst?.titel === 'Хмара нового покоління');
  check('taalkeuze nl → Nederlandse tekst', kiesBeschrijving(m, 'nl', null).tekst?.titel === 'Cloud vNext');
  const oud = kiesBeschrijving(null, 'uk', 'Cloud vNext: nieuwe cloudpagina');
  check('historisch pakket zonder manifest → oorspronkelijke tekst, taal «origineel», niets vertaald', oud.tekst === null && oud.oud === 'Cloud vNext: nieuwe cloudpagina' && oud.taal === 'origineel');

  // TESTRESULTATEN
  const v1 = leesTestresultaten('{"geslaagd":10103,"mislukt":61}');
  check('formaat 1 → getallen, falend null («деталі недоступні»)', v1?.mislukt === 61 && v1.falend === null);
  const v2 = leesTestresultaten(JSON.stringify({ geslaagd: 10103, mislukt: 61, basis: { versie: '20261029-131639', geslaagd: 9893, mislukt: 62 }, falend: [{ bestand: 'tests/eenheid/agent-namens.test.ts', aantal: 3, ookOpBasis: true, reden: 'omgeving: geen DB-rol' }, { bestand: 'tests/eenheid/x.test.ts', aantal: 1, ookOpBasis: false }], uitleg: { uk: 'Старі тести', nl: 'Oude tests' } }));
  const d = v2 ? testDetails(v2) : [];
  check('formaat 2 → lijst met [ook op basis]/[NIEUW] en basisvergelijking', d.length === 2 && d[0].startsWith('[ook op basis] tests/eenheid/agent-namens') && d[1].startsWith('[NIEUW]') && v2?.basis?.mislukt === 62, JSON.stringify(d));
  check('kapot TESTRESULTATEN → null', leesTestresultaten('geen json') === null);
  return einde();
}
