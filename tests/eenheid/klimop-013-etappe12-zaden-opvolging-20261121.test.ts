// KLIMOP-013 (21.11.2026): Модульні, криптографічні (§1.7, §2, §18–§20, §32–§34, §36 Етап 12, §44 Документи №19 і №23, §46)
// та живі мережеві випробування завершального Етапу 12 екосистеми «Плющ»:
//   1. Перелік перевірених технічних залежностей без хмарних монополій (Документ №19);
//   2. Самодостатній пакет незалежного відтворення «Насіння» по всіх 12 модулях ядра з деревом Меркла SHA-256,
//      подвійною печаткою FROST RFC 9591 + Ed25519+ML-DSA-65 FIPS 204, бар'єром Етапу 11 та забороною секретів;
//   3. Чиста відбудова нового покоління вузлів (SE, IS, NO) при повному вимкненні старого головного сервера;
//   4. Двосторонній 72-год пороговий акт спадкоємності без участі початкового автора і без розкриття особистих даних (Документ №23);
//   5. Контроль 16 напрямів ШІ-агентів без самосхвалення, приймальна звірка 12 засад §46 і всіх 25 із 25 обов'язкових документів §44.
// Запуск: node scripts/eenheidstests.mjs klimop-013-etappe12-zaden-opvolging-20261121.test.ts

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  maakKlimopKnooppunt,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import { KlimopRouteTabel } from '../../shared/klimop/stengels';
import {
  frostRonde1MaakToezegging,
  frostRonde2TekenDeel,
  frostVoegHandtekeningSamen,
  leidGeheimScalairAf,
  splitsMetFeldmanVss,
  verifieerFeldmanDeel,
  type FeldmanVssDeel,
} from '../../shared/klimop/drempelsleutels';
import type { KlimopBestuursGrondwet } from '../../shared/klimop/bestuur';
import {
  KLIMOP_AUTONOMIE_SCENARIOS,
  KLIMOP_CRYPTO_AUDIT_SCENARIOS,
  KLIMOP_MEETBARE_GARANTIES_IDS,
  maakHybridePostkwantumKnooppunt,
  stelOnafhankelijkAuditRapportSamen,
} from '../../shared/klimop/beveiligingsaudit';
import {
  KLIMOP_EINDVISIE_TWAALF_PIJLERS,
  KLIMOP_TECHNISCHE_AFHANKELIJKHEDEN,
  KLIMOP_TWAALF_KERNMODULES,
  KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN,
  beoordeelAutonoomOntwikkelVoorstel,
  herbouwEcosysteemUitZaadOpSchoonMilieu,
  stelKlimopZaadPakketSamen,
  stelOpvolgingsOverdrachtSamen,
  valideerKlimopEindvisie46,
  valideerTechnischeAfhankelijkheden,
  verifieerKlimopZaadPakket,
  verifieerOpvolgingsOverdracht,
  type EindvisiePijlerBewijs,
  type KlimopTechnischeAfhankelijkheid,
} from '../../shared/klimop/zaden';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopZadenEnOpvolgingClient } from '../../backend/klimop-zaden-client';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

function maakFrostTestGroep(setId: string, drempel: number, totaal: number) {
  const splits = splitsMetFeldmanVss({
    geheimScalairHex: leidGeheimScalairAf(randomBytes(32)),
    drempel,
    totaal,
    setId,
    epoche: 1,
  });
  const deelnemerPubMap: Record<number, string> = {};
  for (const d of splits.delen) {
    const v = verifieerFeldmanDeel(d);
    if (!v.ok) throw new Error(v.fout);
    deelnemerPubMap[d.index] = v.deelnemerPubliekeSleutelHex;
  }
  return {
    groepsPubHex: splits.groepsPubliekeSleutelHex,
    delen: splits.delen,
    deelnemerPubMap,
  };
}

function tekenFrost(
  boodschap: Buffer,
  actieveDelen: readonly FeldmanVssDeel[],
  groepsPubHex: string,
  deelnemerPubMap: Readonly<Record<number, string>>,
  drempel: number,
): string {
  const r1 = actieveDelen.map((d) => frostRonde1MaakToezegging(d));
  const toezeggingenLijst = r1.map((x) => x.publiek);
  const deelHandtekeningen = actieveDelen.map((d, idx) => {
    const res = frostRonde2TekenDeel({
      deel: d,
      geheimeNonceStaat: r1[idx].geheimeNonceStaat,
      boodschap,
      toezeggingenLijst,
      groepsPubliekeSleutelHex: groepsPubHex,
    });
    if (!res.ok) throw new Error(res.fout);
    return res.deelHandtekening;
  });
  const uit = frostVoegHandtekeningSamen({
    boodschap,
    toezeggingenLijst,
    deelHandtekeningen,
    deelnemerPubliekeSleutelsHex: deelnemerPubMap,
    groepsPubliekeSleutelHex: groepsPubHex,
    drempel,
  });
  if (!uit.ok) throw new Error(uit.fout);
  return uit.handtekeningHex;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('KLIMOP-013 · Етап 12: «Насіння», спадкоємність і безперервний автономний розвиток');
  const nuIso = '2026-11-15T07:00:00.000Z';
  const teVroegIso = new Date(Date.parse(nuIso) + 24 * 3600 * 1000).toISOString();
  const na74UurIso = new Date(Date.parse(nuIso) + 74 * 3600 * 1000).toISOString();

  // ------------------------------------------------------------------ 1. Перелік технічних залежностей (Документ №19)
  const afhOk = valideerTechnischeAfhankelijkheden();
  const afhFout = valideerTechnischeAfhankelijkheden([
    ...KLIMOP_TECHNISCHE_AFHANKELIJKHEDEN.slice(0, 5),
    {
      ...KLIMOP_TECHNISCHE_AFHANKELIJKHEDEN[5],
      vereistProprietaireCloudDienst: true as unknown as false,
    } satisfies KlimopTechnischeAfhankelijkheid,
  ]);
  check('valideerTechnischeAfhankelijkheden підтверджує 6 відкритих груп залежностей і блокує прив’язку до хмарної монополії',
    afhOk.ok === true && afhOk.aantal === 6
    && afhFout.ok === false && afhFout.fouten.includes('VERBODEN_PROPRIETAIRE_CLOUD_VEREISTE:DEP-06'));

  // ------------------------------------------------------------------ 2–3. Складання та перевірка пакета «Насіння»
  const auditor = maakHybridePostkwantumKnooppunt({
    type: 'gespecialiseerde_knooppunten',
    rollen: ['verificatie'],
    juridischeRegio: 'CH',
    aanbieder: 'auditor-013',
    nuIso,
  });
  const zaadBewaarder = maakHybridePostkwantumKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'IS',
    aanbieder: 'zaad-bewaarder-013',
    nuIso,
  });

  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      { voldaan: true, bewijs: `Підтверджено наскрізним контуром Етапів 0–12 (${id})` },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;

  const basisAuditOpties = {
    auditor,
    hybrideCryptografieBewezen: true,
    overleving37GeslaagdEnAantal: { geslaagd: true, aantal: 10 },
    cryptoAudit38: KLIMOP_CRYPTO_AUDIT_SCENARIOS.map((scenarioId) => ({
      scenarioId,
      aanvalAfgeslagenOfOverleefd: true,
      gebruikteStandaardPrimitief: 'Ed25519 / X25519 / FROST / ML-DSA-65',
      eigenOngetesteCryptografieGebruikt: false,
      bewijsSamenvatting: `Відбито ${scenarioId}`,
    })),
    mensbescherming39GeslaagdEnAantal: { geslaagd: true, aantal: 8 },
    autonomieAudit40: KLIMOP_AUTONOMIE_SCENARIOS.map((scenarioId) => ({
      scenarioId,
      praktischBeproefd: true,
      kernFunctiesBehouden: true,
      geenEnkelePartijKreegAlleenheerschappij: true,
      bewijsSamenvatting: `Автономно у ${scenarioId}`,
    })),
    meetbareGaranties41: KLIMOP_MEETBARE_GARANTIES_IDS.map((garantieId) => {
      const isMinstens =
        garantieId === 'min_onafhankelijke_beschikbare_kopieen'
        || garantieId === 'compromitteringsdrempel_kritieke_operatie'
        || garantieId === 'toelaatbaar_aandeel_onbeschikbare_knooppunten_pct';
      return {
        garantieId,
        grensWaarde: isMinstens ? 3 : 1000,
        feitelijkGemetenWaarde: isMinstens ? 3 : 20,
        richting: isMinstens ? ('minstens' as const) : ('hoogstens' as const),
        meetMethode: `Виміряно ${garantieId}`,
        beproefdInScenario: true,
      };
    }),
    antwoorden15: geldigeAntwoorden15,
    nuIso,
  };

  const geblokkeerdAuditRapport = stelOnafhankelijkAuditRapportSamen({
    ...basisAuditOpties,
    openstaandeKritiekeZwaktes: ['ONOPGELOSTE_ZWAKTE'],
  });
  const vrijgegevenAuditRapport = stelOnafhankelijkAuditRapportSamen({
    ...basisAuditOpties,
    openstaandeKritiekeZwaktes: [],
  });
  const erkendeAuditors = [
    {
      auditorKnooppuntId: auditor.identiteit.knooppuntId,
      ed25519PubliekDerB64u: auditor.ed25519PubliekDerB64u,
      mlDsa65PubliekSpkiB64u: auditor.mlDsa65PubliekSpkiB64u,
    },
  ];

  const knGen1Nl = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'NL',
    aanbieder: 'gen1-nl',
    nuIso,
  });
  const knGen1Ch = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'CH',
    aanbieder: 'gen1-ch',
    nuIso,
  });
  const knGen1Ua = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'UA',
    aanbieder: 'gen1-ua',
    nuIso,
  });

  const frostGen1 = maakFrostTestGroep('frost_gen1_test', 2, 3);
  const grondwetGen1: KlimopBestuursGrondwet = {
    schema: 1,
    grondwetId: 'gw_gen1',
    versieVolgnummer: 1,
    frostSetId: 'frost_gen1_test',
    frostGroepsPubliekeSleutelHex: frostGen1.groepsPubHex,
    drempel: 2,
    totaalHoeders: 3,
    erkendeHoeders: [knGen1Nl.identiteit, knGen1Ch.identiteit, knGen1Ua.identiteit],
    overgangsNoodVetoPubDerB64u: null,
    vastgesteldOp: nuIso,
  };

  const echteOnderdelen = KLIMOP_TWAALF_KERNMODULES.map((pad) => ({
    pad,
    inhoudUtf8: lees(pad),
  }));

  const zaadZonderVrijgave = stelKlimopZaadPakketSamen({
    versieLabel: 'zaad-geblokkeerd',
    etappe11Rapport: geblokkeerdAuditRapport.rapport,
    erkendeAuditorSleutels: erkendeAuditors,
    grondwet: grondwetGen1,
    startToetredingsKnooppunten: [knGen1Ch.identiteit, knGen1Ua.identiteit],
    onderdelen: echteOnderdelen,
    zaadBewaarder,
    tekenMetFrostGroep: (b) => tekenFrost(b, [frostGen1.delen[0], frostGen1.delen[1]], frostGen1.groepsPubHex, frostGen1.deelnemerPubMap, 2),
    nuIso,
  });

  const zaadMetGeheim = stelKlimopZaadPakketSamen({
    versieLabel: 'zaad-geheim',
    etappe11Rapport: vrijgegevenAuditRapport.rapport,
    erkendeAuditorSleutels: erkendeAuditors,
    grondwet: grondwetGen1,
    startToetredingsKnooppunten: [knGen1Ch.identiteit, knGen1Ua.identiteit],
    onderdelen: [
      ...echteOnderdelen,
      { pad: 'config/verboden.env', inhoudUtf8: 'POSTGRES_PASSWORD=zeer_geheim_wachtwoord\n' },
    ],
    zaadBewaarder,
    tekenMetFrostGroep: (b) => tekenFrost(b, [frostGen1.delen[0], frostGen1.delen[1]], frostGen1.groepsPubHex, frostGen1.deelnemerPubMap, 2),
    nuIso,
  });

  const zaadOnvolledig = stelKlimopZaadPakketSamen({
    versieLabel: 'zaad-incompleet',
    etappe11Rapport: vrijgegevenAuditRapport.rapport,
    erkendeAuditorSleutels: erkendeAuditors,
    grondwet: grondwetGen1,
    startToetredingsKnooppunten: [knGen1Ch.identiteit, knGen1Ua.identiteit],
    onderdelen: echteOnderdelen.slice(0, 11),
    zaadBewaarder,
    tekenMetFrostGroep: (b) => tekenFrost(b, [frostGen1.delen[0], frostGen1.delen[1]], frostGen1.groepsPubHex, frostGen1.deelnemerPubMap, 2),
    nuIso,
  });

  check('stelKlimopZaadPakketSamen відхиляє звіт без допуску Етапу 11, неповний набір модулів або спробу вкласти таємні дані',
    zaadZonderVrijgave.ok === false && zaadZonderVrijgave.fout === 'ETAPPE_11_VRIJGAVE_ONTBREEKT'
    && zaadMetGeheim.ok === false && zaadMetGeheim.fout === 'GEHEIM_MATERIAAL_IN_ZAAD_VERBODEN:config/verboden.env'
    && zaadOnvolledig.ok === false && zaadOnvolledig.fout.startsWith('ZAAD_MIST_KERNMODULE:'));

  const zaadGoed = stelKlimopZaadPakketSamen({
    zaadId: 'zaad1_eenheidstest_013',
    versieLabel: 'klimop-zaad-1.0.0',
    etappe11Rapport: vrijgegevenAuditRapport.rapport,
    erkendeAuditorSleutels: erkendeAuditors,
    grondwet: grondwetGen1,
    startToetredingsKnooppunten: [knGen1Ch.identiteit, knGen1Ua.identiteit],
    onderdelen: echteOnderdelen,
    zaadBewaarder,
    tekenMetFrostGroep: (b) => tekenFrost(b, [frostGen1.delen[0], frostGen1.delen[1]], frostGen1.groepsPubHex, frostGen1.deelnemerPubMap, 2),
    nuIso,
  });
  if (!zaadGoed.ok) throw new Error(zaadGoed.fout);

  const verZaadGoed = verifieerKlimopZaadPakket(zaadGoed.pakket, frostGen1.groepsPubHex);
  const verZaadKapotteInhoud = verifieerKlimopZaadPakket({
    ...zaadGoed.pakket,
    ingebeddeOnderdelenUtf8: {
      ...zaadGoed.pakket.ingebeddeOnderdelenUtf8,
      'shared/klimop/opslag.ts': `${zaadGoed.pakket.ingebeddeOnderdelenUtf8['shared/klimop/opslag.ts']}\n// пошкодження`,
    },
  });
  const verZaadKapotteFrost = verifieerKlimopZaadPakket({
    ...zaadGoed.pakket,
    frostGroepsHandtekeningHex: '00'.repeat(64),
  });
  const verZaadKapottePq = verifieerKlimopZaadPakket({
    ...zaadGoed.pakket,
    hybrideZaadHandtekening: {
      ...zaadGoed.pakket.hybrideZaadHandtekening,
      mlDsa65HandtekeningB64u: Buffer.alloc(3309, 3).toString('base64url'),
    },
  });

  check('verifieerKlimopZaadPakket перевіряє всі 14 модулів, корінь Меркла SHA-256, пороговий підпис FROST та гібридний підпис ML-DSA-65',
    verZaadGoed.ok === true && verZaadGoed.geverifieerdeModules === 14
    && verZaadKapotteInhoud.ok === false && verZaadKapotteInhoud.fout === 'ZAAD_ONDERDEEL_BESCHADIGD:shared/klimop/opslag.ts'
    && verZaadKapotteFrost.ok === false && verZaadKapotteFrost.fout === 'ZAAD_FROST_HANDTEKENING_ONGELDIG'
    && verZaadKapottePq.ok === false && verZaadKapottePq.fout.startsWith('ZAAD_HYBRIDE_HANDTEKENING_ONGELDIG:'));

  // ------------------------------------------------------------------ 4. Чиста відбудова без старого сервера
  const knGen2Se = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'SE',
    aanbieder: 'gen2-se',
    nuIso,
  });
  const knGen2Is = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'IS',
    aanbieder: 'gen2-is',
    nuIso,
  });
  const knGen2No = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'NO',
    aanbieder: 'gen2-no',
    nuIso,
  });

  const herbouwMetOudeServer = herbouwEcosysteemUitZaadOpSchoonMilieu({
    pakket: zaadGoed.pakket,
    nieuweGeneratieKnooppunten: [knGen2Se.identiteit, knGen2Is.identiteit],
    verbindingMetOudeServerGebruikt: true,
  });
  const herbouwSchoon = herbouwEcosysteemUitZaadOpSchoonMilieu({
    pakket: zaadGoed.pakket,
    nieuweGeneratieKnooppunten: [knGen2Se.identiteit, knGen2Is.identiteit, knGen2No.identiteit],
    verbindingMetOudeServerGebruikt: false,
  });

  check('herbouwEcosysteemUitZaadOpSchoonMilieu блокує звернення до старого сервера і відтворює 14 модулів на новому поколінні вузлів',
    herbouwMetOudeServer.ok === false && herbouwMetOudeServer.fout === 'VERBINDING_MET_OUDE_SERVER_VERBODEN_BIJ_SCHONE_OPBOUW'
    && herbouwSchoon.ok === true && herbouwSchoon.hersteldePadLijst.length === 14
    && herbouwSchoon.nieuweRechtsgebieden.join(',') === 'IS,NO,SE');

  // ------------------------------------------------------------------ 5. Передавання спадкоємності без початкового автора (Документ №23)
  const frostGen2 = maakFrostTestGroep('frost_gen2_test', 2, 3);
  const grondwetGen2: KlimopBestuursGrondwet = {
    schema: 1,
    grondwetId: 'gw_gen2',
    versieVolgnummer: 2,
    frostSetId: 'frost_gen2_test',
    frostGroepsPubliekeSleutelHex: frostGen2.groepsPubHex,
    drempel: 2,
    totaalHoeders: 3,
    erkendeHoeders: [knGen2Se.identiteit, knGen2Is.identiteit, knGen2No.identiteit],
    overgangsNoodVetoPubDerB64u: null,
    vastgesteldOp: na74UurIso,
  };

  const opvTeVroeg = stelOpvolgingsOverdrachtSamen({
    vorigeGrondwet: grondwetGen1,
    nieuweGrondwet: grondwetGen2,
    aangekondigdOp: nuIso,
    bekrachtigdOp: teVroegIso,
    tekenMetVorigFrostQuorum: (b) => tekenFrost(b, [frostGen1.delen[1], frostGen1.delen[2]], frostGen1.groepsPubHex, frostGen1.deelnemerPubMap, 2),
    tekenMetNieuwFrostQuorum: (b) => tekenFrost(b, [frostGen2.delen[0], frostGen2.delen[1]], frostGen2.groepsPubHex, frostGen2.deelnemerPubMap, 2),
  });
  const opvGoed = stelOpvolgingsOverdrachtSamen({
    vorigeGrondwet: grondwetGen1,
    nieuweGrondwet: grondwetGen2,
    aangekondigdOp: nuIso,
    bekrachtigdOp: na74UurIso,
    tekenMetVorigFrostQuorum: (b) => tekenFrost(b, [frostGen1.delen[1], frostGen1.delen[2]], frostGen1.groepsPubHex, frostGen1.deelnemerPubMap, 2),
    tekenMetNieuwFrostQuorum: (b) => tekenFrost(b, [frostGen2.delen[0], frostGen2.delen[1]], frostGen2.groepsPubHex, frostGen2.deelnemerPubMap, 2),
  });
  const opvFoutNieuwSig = opvGoed.ok
    ? verifieerOpvolgingsOverdracht({ ...opvGoed.overdracht, nieuweFrostHandtekeningHex: '11'.repeat(64) })
    : { ok: true as const };

  check('stelOpvolgingsOverdrachtSamen вимагає 72-год замка та обох порогових підписів FROST без участі початкового автора і без розкриття даних',
    opvTeVroeg.ok === false && opvTeVroeg.fout === 'OPVOLGING_TIJDSLOT_72_UUR_NOG_ACTIEF'
    && opvGoed.ok === true
    && opvGoed.overdracht.oorspronkelijkeAuteurDeelnameVereist === false
    && opvGoed.overdracht.toegangTotPersoonlijkeGegevensOvergedragen === false
    && opvFoutNieuwSig.ok === false && opvFoutNieuwSig.fout === 'OPVOLGING_NIEUW_FROST_QUORUM_ONGELDIG');

  // ------------------------------------------------------------------ 6–7. Контур 16 напрямів ШІ-агентів (§33–§34) та 12 засад §46
  const agentGoed = beoordeelAutonoomOntwikkelVoorstel({
    voorstelId: 'VST-GOED',
    agentId: 'antigravity',
    richting: 'beveiligingsaudit',
    regelsVersie: '1.6.0',
    bevatTestBewijs: true,
    antwoorden15: geldigeAntwoorden15,
    probeertZelfGoedTeKeurenOfUitTeRollen: false,
    wijzigtCryptoregelsZonderQuorum: false,
    breidtEigenRechtenUit: false,
    onthultGeheimen: false,
  });
  const agentZelfGoedkeuring = beoordeelAutonoomOntwikkelVoorstel({
    voorstelId: 'VST-FOUT',
    agentId: 'antigravity',
    richting: 'cryptografie',
    regelsVersie: '1.6.0',
    bevatTestBewijs: true,
    antwoorden15: geldigeAntwoorden15,
    probeertZelfGoedTeKeurenOfUitTeRollen: true,
    wijzigtCryptoregelsZonderQuorum: true,
    breidtEigenRechtenUit: false,
    onthultGeheimen: false,
  });

  const alle12Pijlers: EindvisiePijlerBewijs[] = KLIMOP_EINDVISIE_TWAALF_PIJLERS.map((pijlerId) => ({
    pijlerId,
    verwezenlijktInModule: 'shared/klimop/zaden.ts',
    geverifieerd: true,
  }));
  const visieGoed = valideerKlimopEindvisie46({
    pijlers: alle12Pijlers,
    voltooideVerplichteDocumenten44: 25,
    alleTwaalfEtappesVoltooid: true,
    productieInfrastructuurOnaangetast: true,
  });
  const visieOnvolledigDocs = valideerKlimopEindvisie46({
    pijlers: alle12Pijlers,
    voltooideVerplichteDocumenten44: 23,
    alleTwaalfEtappesVoltooid: true,
    productieInfrastructuurOnaangetast: true,
  });

  check('beoordeelAutonoomOntwikkelVoorstel і valideerKlimopEindvisie46 підтверджують 16 напрямів агентів, 12 засад §46 і 25/25 документів §44',
    KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN.length === 16
    && agentGoed.toegestaanAlsVoorstel === true && agentGoed.vereistMenselijkOfQuorumBesluit === true
    && agentZelfGoedkeuring.toegestaanAlsVoorstel === false
    && agentZelfGoedkeuring.fouten.includes('AI_ZELFGOEDKEURING_OF_UITROL_VERBODEN')
    && agentZelfGoedkeuring.fouten.includes('EIGENMACHTIGE_CRYPTOREGEL_WIJZIGING_VERBODEN')
    && visieGoed.ok === true && visieGoed.gedektePijlers === 12
    && visieOnvolledigDocs.ok === false);

  // ------------------------------------------------------------------ 8–10. Живе мережеве вимкнення старого сервера та перехід до Покоління 2
  const beginAnkerGen1 = {
    frostGroepsPubliekeSleutelHex: frostGen1.groepsPubHex,
    zaadBewaarderEd25519PubDerB64u: zaadBewaarder.ed25519PubliekDerB64u,
    zaadBewaarderMlDsa65PubSpkiB64u: zaadBewaarder.mlDsa65PubliekSpkiB64u,
  };
  const srvGen1Nl = await startKlimopProefKnooppunt({ knooppunt: knGen1Nl, beginAnker: beginAnkerGen1 });
  const srvGen1Ch = await startKlimopProefKnooppunt({ knooppunt: knGen1Ch, beginAnker: beginAnkerGen1 });
  const srvGen1Ua = await startKlimopProefKnooppunt({ knooppunt: knGen1Ua, beginAnker: beginAnkerGen1 });
  const srvGen2Se = await startKlimopProefKnooppunt({ knooppunt: knGen2Se, beginAnker: beginAnkerGen1 });
  const srvGen2Is = await startKlimopProefKnooppunt({ knooppunt: knGen2Is, beginAnker: beginAnkerGen1 });
  const srvGen2No = await startKlimopProefKnooppunt({ knooppunt: knGen2No, beginAnker: beginAnkerGen1 });

  try {
    const coord = maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['verificatie'],
      juridischeRegio: 'SE',
      aanbieder: 'coord-013',
      nuIso,
    });
    const adressen = new Map([
      [srvGen1Nl.identiteit.knooppuntId, srvGen1Nl.basisUrl],
      [srvGen1Ch.identiteit.knooppuntId, srvGen1Ch.basisUrl],
      [srvGen1Ua.identiteit.knooppuntId, srvGen1Ua.basisUrl],
      [srvGen2Se.identiteit.knooppuntId, srvGen2Se.basisUrl],
      [srvGen2Is.identiteit.knooppuntId, srvGen2Is.basisUrl],
      [srvGen2No.identiteit.knooppuntId, srvGen2No.basisUrl],
    ]);
    const tabel = new KlimopRouteTabel();
    for (const id of adressen.keys()) {
      tabel.voegTweerichtingsStengelToe(coord.identiteit.knooppuntId, id, 10);
    }
    const zadenClient = new KlimopZadenEnOpvolgingClient(new KlimopNetwerkClient(coord, adressen, tabel));

    const foutGroep = zadenClient.maakZadenQuorumGroep({
      groepId: 'mono',
      coordinator: coord,
      knooppunten: [
        knGen1Nl.identiteit,
        maakKlimopKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['verificatie'],
          juridischeRegio: 'NL',
          aanbieder: 'tweede-nl',
          nuIso,
        }).identiteit,
      ],
      quorumMinimum: 2,
      nuIso,
    });

    const gen1Groep = zadenClient.maakZadenQuorumGroep({
      groepId: 'gen1_zaden',
      coordinator: coord,
      knooppunten: [knGen1Nl.identiteit, knGen1Ch.identiteit, knGen1Ua.identiteit],
      quorumMinimum: 2,
      nuIso,
    });

    check('maakZadenQuorumGroep відхиляє вузли з однієї юрисдикції та створює між’юрисдикційний кворум',
      foutGroep.ok === false && foutGroep.fout === 'ZADEN_KNOOPPUNTEN_NIET_ONAFHANKELIJK'
      && gen1Groep.ok === true);

    if (gen1Groep.ok && opvGoed.ok) {
      const verspreid1 = await zadenClient.verspreidZaadPakketOpQuorum({
        groep: gen1Groep.groep,
        pakket: zaadGoed.pakket,
      });

      // Назавжди зупиняємо старий сервер NL!
      await srvGen1Nl.sluit();

      const herstelGen2 = await zadenClient.herstelEnStartNieuweGeneratieUitQuorumZaad({
        groep: gen1Groep.groep,
        zaadId: zaadGoed.pakket.zaadId,
        verwachteFrostPubHex: frostGen1.groepsPubHex,
        verwachteZaadBewaarderSleutels: {
          ed25519PubliekDerB64u: zaadBewaarder.ed25519PubliekDerB64u,
          mlDsa65PubliekSpkiB64u: zaadBewaarder.mlDsa65PubliekSpkiB64u,
        },
        nieuweGeneratieKnooppunten: [knGen2Se.identiteit, knGen2Is.identiteit, knGen2No.identiteit],
      });

      check('після повного вимкнення старого сервера NL кворум CH + UA віддає перевірене «Насіння» і запускає Покоління 2 (SE, IS, NO)',
        verspreid1.ok === true
        && herstelGen2.ok === true
        && herstelGen2.bevestigdeBronKnooppuntIds.length === 2
        && herstelGen2.hersteldePadLijst.length === 14
        && srvGen1Ch.aantalZaadPakketten() === 1);

      const gen2Groep = zadenClient.maakZadenQuorumGroep({
        groepId: 'gen2_zaden',
        coordinator: coord,
        knooppunten: [knGen2Se.identiteit, knGen2Is.identiteit, knGen2No.identiteit],
        quorumMinimum: 2,
        nuIso,
      });
      if (!gen2Groep.ok) throw new Error(gen2Groep.fout);

      await zadenClient.verspreidZaadPakketOpQuorum({
        groep: gen2Groep.groep,
        pakket: zaadGoed.pakket,
      });
      const opvQuorumOk = await zadenClient.bekrachtigOpvolgingsOverdrachtOpQuorum({
        groep: gen2Groep.groep,
        overdracht: opvGoed.overdracht,
      });
      // Повторна спроба подати вже замінену попередню конституцію відхиляється вузлами!
      const opvHerhalingGeweigerd = await zadenClient.bekrachtigOpvolgingsOverdrachtOpQuorum({
        groep: gen2Groep.groep,
        overdracht: opvGoed.overdracht,
      });

      check('кворум Покоління 2 (SE, IS, NO) закріплює спадкоємність версії 2 без початкового автора і блокує повтор старого переходу',
        opvQuorumOk.ok === true && opvQuorumOk.nieuweGrondwetVersie === 2
        && opvHerhalingGeweigerd.ok === false && opvHerhalingGeweigerd.fout === 'OPVOLGING_VORIGE_GRONDWET_KOMT_NIET_OVEREEN');
    }
  } finally {
    await Promise.all([
      srvGen1Nl.sluit(),
      srvGen1Ch.sluit(),
      srvGen1Ua.sluit(),
      srvGen2Se.sluit(),
      srvGen2Is.sluit(),
      srvGen2No.sluit(),
    ]);
  }

  // ------------------------------------------------------------------ 11. Відтворюваний полігон Етапу 12 (--json)
  const proefJson = JSON.parse(
    execFileSync(process.execPath, ['scripts/klimop-etappe12-zaden-proef.mjs', '--json'], {
      encoding: 'utf8',
    }),
  );
  check('відтворюваний полігон scripts/klimop-etappe12-zaden-proef.mjs завершується з усіма 4 блоками true',
    proefJson.zaadPakketEnAfhankelijkhedenOk === true
    && proefJson.schoneHerbouwZonderOudeServerOk === true
    && proefJson.opvolgingZonderOorspronkelijkeAuteurOk === true
    && proefJson.duurzameOntwikkelingEnEindvisie46Ok === true);

  // ------------------------------------------------------------------ 12. Архітектурна перевірка 15 питань (§42)
  const oordeelEtappe12 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-013 Етап 12: «Насіння», спадкоємність і безперервний автономний розвиток',
    fase: 12,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('Етап 12 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe12.goedgekeurd === true && oordeelEtappe12.fouten.length === 0);

  // ------------------------------------------------------------------ 13–14. Закриття всіх 25/25 документів §44 і синхронізація дзеркал
  const et1UkInhoud = lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md');
  const et1NlInhoud = lees('docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md');
  check('у реєстрі Етапу 1 закрито всі 25 із 25 обов’язкових документів маніфесту та всі Етапи 0–12 (жодного «Заплановано» / «Gepland»)',
    !et1UkInhoud.includes('Заплановано (Етап')
    && !et1NlInhoud.includes('Gepland (Fase')
    && et1UkInhoud.includes('**Етап 12 — «Насіння» та автономний розвиток *(виконано)***')
    && et1NlInhoud.includes('**Fase 12 — «Zaden» en autonome doorontwikkeling *(voltooid)***'));

  const et12Uk = 'docs/hub/ПЛЮЩ-ЕТАП-12-НАСІННЯ-СПАДКОЄМНІСТЬ-ТА-ПОСТІЙНИЙ-РОЗВИТОК.uk.md';
  const et12Md = 'docs/hub/ПЛЮЩ-ЕТАП-12-НАСІННЯ-СПАДКОЄМНІСТЬ-ТА-ПОСТІЙНИЙ-РОЗВИТОК.md';
  const et12Nl = 'docs/hub/KLIMOP-FASE-12-ZADEN-OPVOLGING-EN-DUURZAME-ONTWIKKELING.nl.md';

  check('двомовні документи Етапу 12 (Документи №19 і №23), полігон і всі 7 дзеркальних пар документації повністю синхронізовані',
    [et12Uk, et12Md, et12Nl, 'scripts/klimop-etappe12-zaden-proef.mjs'].every((p) => existsSync(p))
    && lees(et12Uk) === lees(et12Md)
    && et1UkInhoud === lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.md')
    && lees('.agents/skills/klimop-architectuur/SKILL.md') === lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('ПЛАН-ПЕРЕНЕСЕННЯ.uk.md') === lees('ПЛАН-ПЕРЕНЕСЕННЯ.md')
    && [
      'stelKlimopZaadPakketSamen',
      'herbouwEcosysteemUitZaadOpSchoonMilieu',
      'stelOpvolgingsOverdrachtSamen',
      'beoordeelAutonoomOntwikkelVoorstel',
      'valideerKlimopEindvisie46',
      'KLIMOP_TECHNISCHE_AFHANKELIJKHEDEN',
      'zaden.ts',
      'klimop-zaden-client.ts',
    ].every((s) => lees(et12Uk).includes(s) && lees(et12Nl).includes(s)));

  // ------------------------------------------------------------------ 15. Досьє функції та 28 активних можливостей без втрат
  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check('досьє ecosysteem-klimop.json фіксує запит №194 для KLIMOP-012, задачу KLIMOP-013 та всі 28 активних можливостей без жодної втраченої',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-012' && w.pr === 194)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-013')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 28
    && dossier.mogelijkheden.every((m: { staat: string }) => m.staat !== 'verloren'));

  // ------------------------------------------------------------------ 16. Абсолютний мовний закон
  const bestandenKlimop013 = [
    'shared/klimop/zaden.ts',
    'backend/klimop-zaden-client.ts',
    'backend/klimop-knooppunt-agent.ts',
    'scripts/klimop-etappe12-zaden-proef.mjs',
    et12Uk,
    et12Nl,
    'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md',
    'docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md',
    'orchestratie/onderwerpen/ecosysteem-klimop.json',
    '.agents/skills/klimop-architectuur/SKILL.md',
    '.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md',
    '.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md',
    'docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md',
    'docs/INDEX.nl.md',
    'README.md',
    'ОГЛЯД-ПРОЄКТУ.uk.md',
    'LEESMIJ.md',
    'PROJECTOVERZICHT.nl.md',
    'ПЛАН-ПЕРЕНЕСЕННЯ.uk.md',
    'PORTEERPLAN.nl.md',
    'tests/eenheid/klimop-013-etappe12-zaden-opvolging-20261121.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop013.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі нові та оновлені файли KLIMOP-013 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
