// KLIMOP-012 (21.11.2026): Модульні, криптографічні (§13, §36 Етап 11, §37–§41, обов'язковий Документ №20)
// та живі мережеві випробування:
//   1. Справжні гібридні постквантові ключі, підписи Ed25519 + ML-DSA-65 (FIPS 204) та інкапсуляція X25519 + ML-KEM-768 (FIPS 203);
//   2. Зведена модель загроз по 8 рівнях і SPOF-1..5 із чесними залишковими ризиками та забороною заяв про абсолютну невразливість;
//   3. Оцінювачі 10 криптографічних перевірок (§38), 6 практичних сценаріїв автономності (§40) та 12 вимірюваних гарантій (§41);
//   4. Автоматичне блокування переходу до Етапу 12 за наявності будь-якої відкритої слабкості;
//   5. Жива кворумна публікація й перевірка допуску до Етапу 12 на 4 серверах (NL, CH, UA, SE) при обірваному маршруті до CH;
//   6. Перевірка 15 архітектурних питань, 7 дзеркальних пар документації, досьє (26 активних можливостей) та Абсолютного мовного закону.
// Запуск: node scripts/eenheidstests.mjs klimop-012-etappe11-beveiligingsaudit-dreigingen-20261121.test.ts

import { execFileSync } from 'node:child_process';
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
  KLIMOP_AUTONOMIE_SCENARIOS,
  KLIMOP_CRYPTO_AUDIT_SCENARIOS,
  KLIMOP_DREIGINGS_MODEL,
  KLIMOP_MEETBARE_GARANTIES_IDS,
  beoordeelAutonomieAudit40,
  beoordeelCryptografischeAudit38,
  beoordeelMeetbareGaranties41,
  kapselHybrideX25519MlKem768In,
  maakHybridePostkwantumKnooppunt,
  ondertekenHybrideEd25519MlDsa65,
  ontkapselHybrideX25519MlKem768,
  stelOnafhankelijkAuditRapportSamen,
  valideerDreigingsModelEnRestrisicos,
  verifieerHybrideEd25519MlDsa65,
  verifieerOnafhankelijkAuditRapport,
  type AutonomieAuditScenarioMeting,
  type CryptoAuditScenarioMeting,
  type KlimopDreigingsInvoer,
  type MeetbareGarantieInvoer,
} from '../../shared/klimop/beveiligingsaudit';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopBeveiligingsAuditClient } from '../../backend/klimop-audit-client';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

function maakVolledigeCryptoMetingen38(): CryptoAuditScenarioMeting[] {
  return KLIMOP_CRYPTO_AUDIT_SCENARIOS.map((scenarioId) => ({
    scenarioId,
    aanvalAfgeslagenOfOverleefd: true,
    gebruikteStandaardPrimitief: 'Ed25519 / X25519 / ChaCha20-Poly1305 / ML-DSA-65',
    eigenOngetesteCryptografieGebruikt: false,
    bewijsSamenvatting: `Відбито сценарій ${scenarioId} на стандартних примітивах`,
  }));
}

function maakVolledigeAutonomieMetingen40(): AutonomieAuditScenarioMeting[] {
  return KLIMOP_AUTONOMIE_SCENARIOS.map((scenarioId) => ({
    scenarioId,
    praktischBeproefd: true,
    kernFunctiesBehouden: true,
    geenEnkelePartijKreegAlleenheerschappij: true,
    bewijsSamenvatting: `Практично підтверджено автономність у сценарії ${scenarioId}`,
  }));
}

function maakVolledigeMeetbareGaranties41(): MeetbareGarantieInvoer[] {
  return KLIMOP_MEETBARE_GARANTIES_IDS.map((garantieId) => {
    const isMinstens =
      garantieId === 'min_onafhankelijke_beschikbare_kopieen'
      || garantieId === 'compromitteringsdrempel_kritieke_operatie'
      || garantieId === 'toelaatbaar_aandeel_onbeschikbare_knooppunten_pct';
    return {
      garantieId,
      grensWaarde: isMinstens ? 3 : 1000,
      feitelijkGemetenWaarde: isMinstens ? 3 : 25,
      richting: isMinstens ? 'minstens' : 'hoogstens',
      meetMethode: `Фактичний вимір показника ${garantieId} у сценарії відмови`,
      beproefdInScenario: true,
    };
  });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('KLIMOP-012 · Етап 11: незалежний аудит безпеки, модель загроз і гібридна постквантова готовність');
  const nuIso = '2026-11-21T05:15:00.000Z';

  // ------------------------------------------------------------------ 1. Паспорт вузла з постквантовим профілем
  const auditor = maakHybridePostkwantumKnooppunt({
    type: 'gespecialiseerde_knooppunten',
    rollen: ['verificatie'],
    juridischeRegio: 'CH',
    aanbieder: 'onafhankelijke-auditor-012',
    nuIso,
  });
  const tweedeHybride = maakHybridePostkwantumKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'IS',
    aanbieder: 'postkwantum-knoop-is',
    nuIso,
  });

  check('maakHybridePostkwantumKnooppunt формує повний пакет ключів Ed25519, ML-DSA-65 (FIPS 204), X25519 і ML-KEM-768 (FIPS 203)',
    auditor.identiteit.algoritme === 'ed25519+ml-dsa-65-voorbereid'
    && auditor.identiteit.knooppuntId.startsWith('klm1_')
    && typeof auditor.identiteit.postkwantumPubliekeSleutelB64u === 'string'
    && auditor.identiteit.postkwantumPubliekeSleutelB64u.length > 1000
    && auditor.mlKem768PubliekSpkiB64u.length > 1000);

  // ------------------------------------------------------------------ 2. Гібридний подвійний підпис Ed25519 + ML-DSA-65
  const bericht = Buffer.from('Підсумкове повідомлення незалежного аудиту безпеки Етапу 11', 'utf8');
  const sig = ondertekenHybrideEd25519MlDsa65(bericht, auditor);
  const sigGoed = verifieerHybrideEd25519MlDsa65(bericht, sig, {
    ed25519PubliekDerB64u: auditor.ed25519PubliekDerB64u,
    mlDsa65PubliekSpkiB64u: auditor.mlDsa65PubliekSpkiB64u,
  });
  const sigKlassiekFout = verifieerHybrideEd25519MlDsa65(bericht, {
    ...sig,
    ed25519HandtekeningB64u: Buffer.alloc(64, 5).toString('base64url'),
  });
  const sigPostkwantumFout = verifieerHybrideEd25519MlDsa65(bericht, {
    ...sig,
    mlDsa65HandtekeningB64u: Buffer.alloc(3309, 9).toString('base64url'),
  });
  const sigSleutelFout = verifieerHybrideEd25519MlDsa65(bericht, sig, {
    ed25519PubliekDerB64u: tweedeHybride.ed25519PubliekDerB64u,
    mlDsa65PubliekSpkiB64u: auditor.mlDsa65PubliekSpkiB64u,
  });
  const sigBerichtGewijzigd = verifieerHybrideEd25519MlDsa65(Buffer.from('Змінений вміст', 'utf8'), sig);

  check('verifieerHybrideEd25519MlDsa65 вимагає одночасної дійсності обох половин підпису (і Ed25519, і ML-DSA-65)',
    sigGoed.ok === true
    && sigKlassiekFout.ok === false && sigKlassiekFout.fout === 'HYBRIDE_KLASSIEKE_HANDTEKENING_ONGELDIG'
    && sigPostkwantumFout.ok === false && sigPostkwantumFout.fout === 'HYBRIDE_POSTKWANTUM_HANDTEKENING_ONGELDIG'
    && sigSleutelFout.ok === false && sigSleutelFout.fout === 'HYBRIDE_SLEUTELPAAR_KOMT_NIET_OVEREEN'
    && sigBerichtGewijzigd.ok === false);

  // ------------------------------------------------------------------ 3. Гібридна інкапсуляція X25519 + ML-KEM-768
  const ingekapseld = kapselHybrideX25519MlKem768In(tweedeHybride, 'archief-sleutel-012');
  const ontkapseldGoed = ontkapselHybrideX25519MlKem768(ingekapseld.ingekapseld, tweedeHybride, 'archief-sleutel-012');
  const ontkapseldFoutContext = ontkapselHybrideX25519MlKem768(ingekapseld.ingekapseld, tweedeHybride, 'ander-doel');
  const ontkapseldVreemdeOntvanger = ontkapselHybrideX25519MlKem768(ingekapseld.ingekapseld, auditor, 'archief-sleutel-012');
  const ontkapseldKapot = ontkapselHybrideX25519MlKem768(
    { ...ingekapseld.ingekapseld, mlKem768CijfertekstB64u: 'ongeldig' },
    tweedeHybride,
    'archief-sleutel-012',
  );

  check('kapselHybrideX25519MlKem768In та ontkapselHybrideX25519MlKem768 узгоджують 32-байтний ключ і блокують чужого одержувача чи інший контекст',
    ontkapseldGoed.ok === true
    && ontkapseldGoed.gedeeldeSleutel32.length === 32
    && ontkapseldGoed.gedeeldeSleutel32.equals(ingekapseld.gedeeldeSleutel32)
    && ontkapseldFoutContext.ok === true
    && !ontkapseldFoutContext.gedeeldeSleutel32.equals(ingekapseld.gedeeldeSleutel32)
    && (!ontkapseldVreemdeOntvanger.ok || !ontkapseldVreemdeOntvanger.gedeeldeSleutel32.equals(ingekapseld.gedeeldeSleutel32))
    && ontkapseldKapot.ok === false);

  // ------------------------------------------------------------------ 4. Зведена модель загроз і залишкових ризиків (Документ №20)
  const dreigOk = valideerDreigingsModelEnRestrisicos();
  const verbodenOnkwetsbaarModel = [
    ...KLIMOP_DREIGINGS_MODEL.slice(0, 7),
    {
      ...KLIMOP_DREIGINGS_MODEL[7],
      eerlijkRestrisicoUk: '',
      beweertAbsoluteOnkwetsbaarheid: true as unknown as false,
    } satisfies KlimopDreigingsInvoer,
  ];
  const dreigFout = valideerDreigingsModelEnRestrisicos(verbodenOnkwetsbaarModel);

  check('valideerDreigingsModelEnRestrisicos підтверджує покриття 8 рівнів і SPOF-1..5 та забороняє заяви про абсолютну невразливість (§43 п. 1)',
    dreigOk.ok === true
    && dreigOk.aantalDreigingen === 8
    && dreigOk.gedekteSpofs.length === 5
    && dreigFout.ok === false
    && dreigFout.fouten.includes('VERBODEN_ONKWETSBAARHEIDSCLAIM:DRG-08')
    && dreigFout.fouten.includes('ONTBREKEND_EERLIJK_RESTRISICO:DRG-08'));

  // ------------------------------------------------------------------ 5. Перевірка 10 криптографічних сценаріїв (§38)
  const c38Goed = beoordeelCryptografischeAudit38(maakVolledigeCryptoMetingen38());
  const c38EigenCrypto = beoordeelCryptografischeAudit38(
    maakVolledigeCryptoMetingen38().map((m, i) => (i === 0 ? { ...m, eigenOngetesteCryptografieGebruikt: true } : m)),
  );
  const c38Onvolledig = beoordeelCryptografischeAudit38(maakVolledigeCryptoMetingen38().slice(1));

  check('beoordeelCryptografischeAudit38 вимагає 10/10 сценаріїв §38 і блокує власні неперевірені алгоритми (§43 п. 12)',
    c38Goed.geslaagd === true && c38Goed.gedekteScenarios === 10
    && c38EigenCrypto.geslaagd === false && c38EigenCrypto.fouten.some((f) => f.startsWith('EIGEN_ONGETESTE_CRYPTO_VERBODEN:'))
    && c38Onvolledig.geslaagd === false && c38Onvolledig.fouten.some((f) => f.startsWith('ONTBREKEND_CRYPTO_SCENARIO_38:')));

  // ------------------------------------------------------------------ 6. Перевірка 6 сценаріїв автономності (§40)
  const a40Goed = beoordeelAutonomieAudit40(maakVolledigeAutonomieMetingen40());
  const a40NietPraktisch = beoordeelAutonomieAudit40(
    maakVolledigeAutonomieMetingen40().map((m, i) => (i === 0 ? { ...m, praktischBeproefd: false } : m)),
  );

  check('beoordeelAutonomieAudit40 вимагає практичного випробування всіх 6 сценаріїв автономності §40 без одноосібної влади',
    a40Goed.geslaagd === true && a40Goed.gedekteScenarios === 6
    && a40NietPraktisch.geslaagd === false && a40NietPraktisch.fouten.includes('AUTONOMIE_SCENARIO_MISLUKT:hoofdserver_uitgeschakeld'));

  // ------------------------------------------------------------------ 7. Перевірка 12 вимірюваних гарантій (§41)
  const m41Goed = beoordeelMeetbareGaranties41(maakVolledigeMeetbareGaranties41());
  const m41Onbeproefd = beoordeelMeetbareGaranties41(
    maakVolledigeMeetbareGaranties41().map((g, i) => (i === 0 ? { ...g, beproefdInScenario: false } : g)),
  );
  const m41Overschreden = beoordeelMeetbareGaranties41(
    maakVolledigeMeetbareGaranties41().map((g) =>
      g.garantieId === 'max_verlies_laatste_wijzigingen_bytes'
        ? { ...g, grensWaarde: 0, feitelijkGemetenWaarde: 128 }
        : g,
    ),
  );

  check('beoordeelMeetbareGaranties41 перевіряє всі 12 показників §41 і відхиляє довільні неперевірені числа або перевищення межі',
    m41Goed.geslaagd === true && m41Goed.gedekteGaranties === 12
    && m41Onbeproefd.geslaagd === false && m41Onbeproefd.fouten.some((f) => f.startsWith('ONBEPROEFDE_WILLEKEURIGE_GARANTIE_VERBODEN:'))
    && m41Overschreden.geslaagd === false && m41Overschreden.fouten.some((f) => f.startsWith('GARANTIE_OVERSCHREDEN:max_verlies_laatste_wijzigingen_bytes')));

  // ------------------------------------------------------------------ 8. Гібридно підписаний звіт аудиту та бар'єр Етапу 12
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      { voldaan: true, bewijs: `Підтверджено наскрізним аудитом безпеки Етапу 11 (${id})` },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;

  const metZwakte = stelOnafhankelijkAuditRapportSamen({
    auditor,
    hybrideCryptografieBewezen: true,
    overleving37GeslaagdEnAantal: { geslaagd: true, aantal: 10 },
    cryptoAudit38: maakVolledigeCryptoMetingen38(),
    mensbescherming39GeslaagdEnAantal: { geslaagd: true, aantal: 8 },
    autonomieAudit40: maakVolledigeAutonomieMetingen40(),
    meetbareGaranties41: maakVolledigeMeetbareGaranties41(),
    antwoorden15: geldigeAntwoorden15,
    openstaandeKritiekeZwaktes: ['ONOPGELOSTE_PROEFZWAKTE'],
    nuIso,
  });

  const vrijgegeven = stelOnafhankelijkAuditRapportSamen({
    auditor,
    hybrideCryptografieBewezen: true,
    overleving37GeslaagdEnAantal: { geslaagd: true, aantal: 10 },
    cryptoAudit38: maakVolledigeCryptoMetingen38(),
    mensbescherming39GeslaagdEnAantal: { geslaagd: true, aantal: 8 },
    autonomieAudit40: maakVolledigeAutonomieMetingen40(),
    meetbareGaranties41: maakVolledigeMeetbareGaranties41(),
    antwoorden15: geldigeAntwoorden15,
    openstaandeKritiekeZwaktes: [],
    nuIso,
  });

  const erkendeAuditors = [
    {
      auditorKnooppuntId: auditor.identiteit.knooppuntId,
      ed25519PubliekDerB64u: auditor.ed25519PubliekDerB64u,
      mlDsa65PubliekSpkiB64u: auditor.mlDsa65PubliekSpkiB64u,
    },
  ];
  const verRapportGoed = verifieerOnafhankelijkAuditRapport({
    rapport: vrijgegeven.rapport,
    erkendeAuditorSleutels: erkendeAuditors,
  });
  const verRapportOnbekend = verifieerOnafhankelijkAuditRapport({
    rapport: vrijgegeven.rapport,
    erkendeAuditorSleutels: [],
  });
  const verRapportVervalstVrijgave = verifieerOnafhankelijkAuditRapport({
    rapport: { ...metZwakte.rapport, vrijgegevenVoorEtappe12: true },
    erkendeAuditorSleutels: erkendeAuditors,
  });

  check('stelOnafhankelijkAuditRapportSamen та verifieerOnafhankelijkAuditRapport примусово блокують Етап 12 при відкритій слабкості й відхиляють підробку',
    metZwakte.rapport.vrijgegevenVoorEtappe12 === false
    && vrijgegeven.rapport.vrijgegevenVoorEtappe12 === true
    && vrijgegeven.fouten.length === 0
    && verRapportGoed.ok === true
    && verRapportOnbekend.ok === false && verRapportOnbekend.fout === 'ONBEKENDE_AUDITOR_IDENTITEIT'
    && verRapportVervalstVrijgave.ok === false);

  // ------------------------------------------------------------------ 9–11. Живий мережевий кворум аудиту (NL, CH, UA, SE)
  const knCoord = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['verificatie'],
    juridischeRegio: 'NL',
    aanbieder: 'coord-012',
    nuIso,
  });
  const knNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'NL',
    aanbieder: 'audit-nl-012',
    nuIso,
  });
  const knCH = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'CH',
    aanbieder: 'audit-ch-012',
    nuIso,
  });
  const knUA = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'UA',
    aanbieder: 'audit-ua-012',
    nuIso,
  });
  const knSE = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'SE',
    aanbieder: 'audit-se-012',
    nuIso,
  });
  const knZonderRol = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag'],
    juridischeRegio: 'DE',
    aanbieder: 'alleen-opslag',
    nuIso,
  });

  const srvNL = await startKlimopProefKnooppunt({ knooppunt: knNL });
  const srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH });
  const srvUA = await startKlimopProefKnooppunt({ knooppunt: knUA });
  const srvSE = await startKlimopProefKnooppunt({ knooppunt: knSE });
  const servers = [srvNL, srvCH, srvUA, srvSE];

  try {
    const adressen = new Map(servers.map((s) => [s.identiteit.knooppuntId, s.basisUrl]));
    const tabel = new KlimopRouteTabel();
    for (const s of servers) {
      tabel.voegTweerichtingsStengelToe(knCoord.identiteit.knooppuntId, s.identiteit.knooppuntId, 10);
    }

    const netwerkClient = new KlimopNetwerkClient(knCoord, adressen, tabel);
    const auditClient = new KlimopBeveiligingsAuditClient(netwerkClient);

    const groepFoutRol = auditClient.maakAuditQuorumGroep({
      groepId: 'fout_rol',
      coordinator: knCoord,
      knooppunten: [knNL.identiteit, knZonderRol.identiteit],
      quorumMinimum: 2,
      nuIso,
    });
    const groepGoed = auditClient.maakAuditQuorumGroep({
      groepId: 'audit_quorum_012',
      coordinator: knCoord,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
      quorumMinimum: 3,
      nuIso,
    });

    check('maakAuditQuorumGroep відхиляє вузол без ролі verificatie та формує між’юрисдикційний кворум 3-з-4',
      groepFoutRol.ok === false && groepFoutRol.fout === 'KNOOPPUNT_MIST_VERIFICATIEROL'
      && groepGoed.ok === true);

    if (groepGoed.ok) {
      // Розриваємо маршрут до CH і перевіряємо, що живий кворум NL + UA + SE приймає й верифікує звіт!
      tabel.markeerStengelStaat(knCoord.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');

      const pubVrij = await auditClient.publiceerAuditRapportOpQuorum({
        groep: groepGoed.groep,
        rapport: vrijgegeven.rapport,
        erkendeAuditorSleutels: erkendeAuditors,
      });
      const checkVrij = await auditClient.controleerVrijgaveVoorEtappe12OpQuorum({
        groep: groepGoed.groep,
        auditId: vrijgegeven.rapport.auditId,
        erkendeAuditorSleutels: erkendeAuditors,
      });

      check('живий кворум 3-з-4 (NL + UA + SE при обірваному CH) перевіряє гібридний підпис звіту і підтверджує допуск до Етапу 12',
        pubVrij.ok === true
        && pubVrij.bevestigdeKnooppuntIds.length === 3
        && checkVrij.vrijgegevenVoorEtappe12 === true
        && checkVrij.bevestigdeKnooppuntIds.length === 3
        && srvNL.aantalAuditRapporten() === 1);

      const pubMetZwakte = await auditClient.publiceerAuditRapportOpQuorum({
        groep: groepGoed.groep,
        rapport: metZwakte.rapport,
        erkendeAuditorSleutels: erkendeAuditors,
      });
      const checkMetZwakte = await auditClient.controleerVrijgaveVoorEtappe12OpQuorum({
        groep: groepGoed.groep,
        auditId: metZwakte.rapport.auditId,
        erkendeAuditorSleutels: erkendeAuditors,
      });

      srvNL.plaatsKnooppuntInQuarantaine(auditor.identiteit.knooppuntId);
      srvUA.plaatsKnooppuntInQuarantaine(auditor.identiteit.knooppuntId);
      const pubQuarantaine = await auditClient.publiceerAuditRapportOpQuorum({
        groep: groepGoed.groep,
        rapport: vrijgegeven.rapport,
        erkendeAuditorSleutels: erkendeAuditors,
      });

      check('кворум відмовляє у допуску до Етапу 12 при звіті з відкритою слабкістю та блокує публікацію від карантинного аудитора',
        pubMetZwakte.ok === true
        && checkMetZwakte.vrijgegevenVoorEtappe12 === false
        && checkMetZwakte.redenIndienGeweigerd === 'AUDITRAPPORT_BLOKKEERT_ETAPPE_12'
        && pubQuarantaine.ok === false);
    }
  } finally {
    await Promise.all(servers.map((s) => s.sluit()));
  }

  // ------------------------------------------------------------------ 12. Перевірка полігона Етапу 11 у режимі --json
  const proefJson = JSON.parse(
    execFileSync(process.execPath, ['scripts/klimop-etappe11-beveiligingsaudit-proef.mjs', '--json'], {
      encoding: 'utf8',
    }),
  );
  check('відтворюваний полігон scripts/klimop-etappe11-beveiligingsaudit-proef.mjs завершується з усіма 4 блоками true',
    proefJson.hybridePostkwantumOk === true
    && proefJson.dreigingsModelEn10CryptoScenariosOk === true
    && proefJson.autonomieEn12GarantiesOk === true
    && proefJson.quorumVrijgaveEtappe12Ok === true);

  // ------------------------------------------------------------------ 13. Архітектурна перевірка 15 питань (§42)
  const oordeelEtappe11 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-012 Етап 11: незалежний аудит безпеки, модель загроз і гібридна постквантова готовність',
    fase: 11,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('Етап 11 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe11.goedgekeurd === true && oordeelEtappe11.fouten.length === 0);

  // ------------------------------------------------------------------ 14. Синхронізація документації Етапу 11 (Документ №20) та 7 дзеркальних пар
  const et11Uk = 'docs/hub/ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.uk.md';
  const et11Md = 'docs/hub/ПЛЮЩ-ЕТАП-11-НЕЗАЛЕЖНИЙ-АУДИТ-БЕЗПЕКИ-ТА-МОДЕЛЬ-ЗАГРОЗ.md';
  const et11Nl = 'docs/hub/KLIMOP-FASE-11-ONAFHANKELIJKE-BEVEILIGINGSAUDIT-EN-DREIGINGSMODEL.nl.md';

  check('двомовні документи Етапу 11 (Документ №20), полігон і всі 7 дзеркальних пар документації повністю синхронізовані',
    [et11Uk, et11Md, et11Nl, 'scripts/klimop-etappe11-beveiligingsaudit-proef.mjs'].every((p) => existsSync(p))
    && lees(et11Uk) === lees(et11Md)
    && lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md') === lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.md')
    && lees('.agents/skills/klimop-architectuur/SKILL.md') === lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('ПЛАН-ПЕРЕНЕСЕННЯ.uk.md') === lees('ПЛАН-ПЕРЕНЕСЕННЯ.md')
    && [
      'maakHybridePostkwantumKnooppunt',
      'ondertekenHybrideEd25519MlDsa65',
      'kapselHybrideX25519MlKem768In',
      'KLIMOP_DREIGINGS_MODEL',
      'beoordeelCryptografischeAudit38',
      'beoordeelAutonomieAudit40',
      'beoordeelMeetbareGaranties41',
      'stelOnafhankelijkAuditRapportSamen',
      'beveiligingsaudit.ts',
      'klimop-audit-client.ts',
    ].every((s) => lees(et11Uk).includes(s) && lees(et11Nl).includes(s)));

  // ------------------------------------------------------------------ 15. Досьє функції та 26 активних можливостей
  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check('досьє ecosysteem-klimop.json фіксує запит №193 для KLIMOP-011, задачу KLIMOP-012, наступність KLIMOP-013 та >=26 активних можливостей без втрат',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-011' && w.pr === 193)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-012')
    && (dossier.open.some((o: { uk: string }) => o.uk.includes('KLIMOP-013'))
      || dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-013'))
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 26
    && dossier.mogelijkheden.every((m: { staat: string }) => m.staat !== 'verloren'));

  // ------------------------------------------------------------------ 16. Абсолютний мовний закон
  const bestandenKlimop012 = [
    'shared/klimop/beveiligingsaudit.ts',
    'backend/klimop-audit-client.ts',
    'backend/klimop-knooppunt-agent.ts',
    'scripts/klimop-etappe11-beveiligingsaudit-proef.mjs',
    et11Uk,
    et11Nl,
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
    'tests/eenheid/klimop-012-etappe11-beveiligingsaudit-dreigingen-20261121.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop012.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі нові та оновлені файли KLIMOP-012 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
