// KLIMOP-007 (20.11.2026): Модульні, криптографічні (§39–§40 маніфесту) та живі мережеві випробування Етапу 6 «Плюща»:
//   1. Сім розмежованих категорій повноважень без одноосібної влади й без влади випадкової більшості вузлів (§2, §19);
//   2. Захисні часові замки (0 год для щоденних дій пошти/файлів/календаря та 24/48/72 год для ризикових змін, §20),
//      аварійне перехідне вето, заборона самосхвалення ШІ-агентами й ініціаторами (§32, §34) та геш-пов'язаний журнал FROST;
//   3. Чотирирівнева перевірка метаданих випусків за принципами TUF (doelenRol + webClientManifest + FROST momentopname + tijdstempel, §25);
//   4. Хвильове встановлення на 4 вузлах (NL, CH, UA, SE) із міжхвильовою сумісністю сусідніх версій та автоматичною зупинкою й відкочуванням
//      Хвилі 1 при порушенні показників безпеки (§24), без зачіпання вузлів наступних хвиль.
// Запуск: node scripts/eenheidstests.mjs klimop-007-etappe6-drempelbestuur-uitrol-20261120.test.ts

import { createHash, generateKeyPairSync } from 'node:crypto';
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
  ALLE_BESTUURS_CATEGORIEEN,
  STANDAARD_CATEGORIE_BELEID,
  bekrachtigBestuursBesluitMetFrost,
  beoordeelUitrolGezondheid,
  maakBestuursGrondwet,
  maakBestuursVoorstel,
  maakMomentopnameFrostBoodschap,
  maakUitgaveDoelenMetadata,
  maakUitgaveTijdstempelMetadata,
  pasOvergangsNoodVetoToe,
  verifieerBestuursBesluitLogboek,
  verifieerUitgaveBundel,
  verifieerWebClientBundelIntegriteit,
  zijnKnooppuntVersiesOnderlingCompatibel,
} from '../../shared/klimop/bestuur';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopDrempelOndertekenaarClient } from '../../backend/klimop-drempel-client';
import { KlimopBestuurEnUitrolClient } from '../../backend/klimop-bestuur-client';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const sha256Hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

function maakEd25519SleutelPaar(): { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publiekeSleutelDerB64u: (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url'),
    geheimeSleutelPkcs8B64u: (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url'),
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-007-etappe6-drempelbestuur-uitrol');
  const t0Ms = Date.parse('2026-11-20T20:40:00.000Z');
  const t0Iso = new Date(t0Ms).toISOString();
  const liveNuIso = new Date().toISOString();
  const liveVerlooptIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  // ------------------------------------------------------------------ 1. Сім розмежованих категорій повноважень (§19–§20)
  const dagelijkseCategorieen = [
    'eigen_gegevens_rechten',
    'persoonlijk_apparaat_beheer',
    'operationeel_knooppunt_beheer',
    'software_onderhoud',
  ] as const;
  const geenEnkeleAgentZelfGoedkeuring = ALLE_BESTUURS_CATEGORIEEN.every(
    (c) => STANDAARD_CATEGORIE_BELEID[c].magDoorAiAgentZelfstandigWordenGoedgekeurd === false,
  );
  const alleenEigenaarLeestGeheimen = ALLE_BESTUURS_CATEGORIEEN.every(
    (c) => STANDAARD_CATEGORIE_BELEID[c].magPersoonlijkeGeheimeGegevensLezen === (c === 'eigen_gegevens_rechten'),
  );

  check('матриця 7 категорій повноважень відокремлює права власника даних (0 год затримки) від кворумних змін (24/48/72 год) і забороняє самосхвалення ШІ-агентів',
    ALLE_BESTUURS_CATEGORIEEN.length === 7
    && dagelijkseCategorieen.every((c) => STANDAARD_CATEGORIE_BELEID[c].minimaleWachttijdUren === 0 && !STANDAARD_CATEGORIE_BELEID[c].vereistFrostQuorum)
    && STANDAARD_CATEGORIE_BELEID.cryptografische_goedkeuring_kritiek.minimaleWachttijdUren === 24
    && STANDAARD_CATEGORIE_BELEID.noodherstel_bestuur.minimaleWachttijdUren === 48
    && STANDAARD_CATEGORIE_BELEID.ecosysteem_regels_wijziging.minimaleWachttijdUren === 72
    && geenEnkeleAgentZelfGoedkeuring
    && alleenEigenaarLeestGeheimen);

  // ------------------------------------------------------------------ 2. Перевірка конституції керування (§2, §18–§19)
  const knCoord = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['verificatie', 'herstel'],
    juridischeRegio: 'NL',
    aanbieder: 'toestel-eigenaar',
    nuIso: liveNuIso,
  });
  const knNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'verbinding'],
    juridischeRegio: 'NL',
    aanbieder: 'eigen-knoop-nl',
    nuIso: liveNuIso,
  });
  const knCH = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'verbinding'],
    juridischeRegio: 'CH',
    aanbieder: 'alpen-knoop-ch',
    nuIso: liveNuIso,
  });
  const knUA = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'verbinding', 'herstel'],
    juridischeRegio: 'UA',
    aanbieder: 'kyiv-knoop-ua',
    nuIso: liveNuIso,
  });
  const knSE = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'opslag'],
    juridischeRegio: 'SE',
    aanbieder: 'nordic-knoop-se',
    nuIso: liveNuIso,
  });
  const knNL2ZelfdeAanbieder = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie'],
    juridischeRegio: 'NL',
    aanbieder: 'eigen-knoop-nl',
    nuIso: liveNuIso,
  });
  const knTijdelijk = maakKlimopKnooppunt({
    type: 'tijdelijke_toetredingsknooppunten',
    rollen: ['verbinding'],
    juridischeRegio: 'DE',
    aanbieder: 'gast-knoop-de',
    nuIso: liveNuIso,
  });
  const knGespecialiseerd = maakKlimopKnooppunt({
    type: 'gespecialiseerde_knooppunten',
    rollen: ['rekenkracht'],
    juridischeRegio: 'FI',
    aanbieder: 'reken-knoop-fi',
    nuIso: liveNuIso,
  });

  const nepFrostSleutelHex = 'a'.repeat(64);
  const eenpersoonsGrondwet = maakBestuursGrondwet({
    grondwetId: 'gw-fout-1',
    frostSetId: 'set-1',
    frostGroepsPubliekeSleutelHex: nepFrostSleutelHex,
    drempel: 1,
    erkendeHoeders: [knNL.identiteit, knCH.identiteit],
  });
  const tijdelijkeGrondwet = maakBestuursGrondwet({
    grondwetId: 'gw-fout-2',
    frostSetId: 'set-1',
    frostGroepsPubliekeSleutelHex: nepFrostSleutelHex,
    drempel: 2,
    erkendeHoeders: [knNL.identiteit, knTijdelijk.identiteit],
  });
  const gespecialiseerdeGrondwet = maakBestuursGrondwet({
    grondwetId: 'gw-fout-3',
    frostSetId: 'set-1',
    frostGroepsPubliekeSleutelHex: nepFrostSleutelHex,
    drempel: 2,
    erkendeHoeders: [knNL.identiteit, knGespecialiseerd.identiteit],
  });
  const afhankelijkeGrondwet = maakBestuursGrondwet({
    grondwetId: 'gw-fout-4',
    frostSetId: 'set-1',
    frostGroepsPubliekeSleutelHex: nepFrostSleutelHex,
    drempel: 2,
    erkendeHoeders: [knNL.identiteit, knNL2ZelfdeAanbieder.identiteit],
  });

  check('maakBestuursGrondwet відхиляє одноосібну владу (drempel < 2), випадкову більшість тимчасових/спеціалізованих вузлів і залежних операторів',
    !eenpersoonsGrondwet.ok && eenpersoonsGrondwet.fout === 'GRONDWET_DREMPEL_VERBIEDT_EENPERSOONSMACHT'
    && !tijdelijkeGrondwet.ok && tijdelijkeGrondwet.fout === 'WILLEKEURIGE_MEERDERHEID_GEEN_GROND_VOOR_BESTUUR'
    && !gespecialiseerdeGrondwet.ok && gespecialiseerdeGrondwet.fout === 'WILLEKEURIGE_MEERDERHEID_GEEN_GROND_VOOR_BESTUUR'
    && !afhankelijkeGrondwet.ok && afhankelijkeGrondwet.fout === 'GRONDWET_HOEDERS_NIET_ONAFHANKELIJK');

  // ------------------------------------------------------------------ 3. Захист часових замків, перехідне вето та заборона самосхвалення
  const vetoSleutels = maakEd25519SleutelPaar();
  const vreemdeSleutels = maakEd25519SleutelPaar();
  const agentSleutels = maakEd25519SleutelPaar();
  const mensSleutels = maakEd25519SleutelPaar();

  const basisGwUit = maakBestuursGrondwet({
    grondwetId: 'gw-unit-v1',
    frostSetId: 'set-unit',
    frostGroepsPubliekeSleutelHex: nepFrostSleutelHex,
    drempel: 2,
    erkendeHoeders: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
    overgangsNoodVetoPubDerB64u: vetoSleutels.publiekeSleutelDerB64u,
    nuIso: t0Iso,
  });
  if (!basisGwUit.ok) throw new Error(basisGwUit.fout);

  const voorstelVerlaagd24 = maakBestuursVoorstel({
    grondwet: basisGwUit.grondwet,
    categorie: 'cryptografische_goedkeuring_kritiek',
    onderwerpSamenvatting: 'Оновлення криптографічного профілю з’єднувача',
    inhoudPayload: { profiel: 'v2' },
    indienerSoort: 'menselijke_deelnemer',
    indienerId: 'klid1_mens',
    indienerHoederIndex: 1,
    indienerSleutels: mensSleutels,
    aangevraagdeWachttijdUren: 0,
    nuIso: t0Iso,
  });
  const voorstelVerlaagd48 = maakBestuursVoorstel({
    grondwet: basisGwUit.grondwet,
    categorie: 'noodherstel_bestuur',
    onderwerpSamenvatting: 'Надзвичайна заміна недоступного хранителя ролі',
    inhoudPayload: { vervangIndex: 2 },
    indienerSoort: 'menselijke_deelnemer',
    indienerId: 'klid1_mens',
    indienerSleutels: mensSleutels,
    aangevraagdeWachttijdUren: 2,
    nuIso: t0Iso,
  });
  const voorstelVerlaagd72 = maakBestuursVoorstel({
    grondwet: basisGwUit.grondwet,
    categorie: 'ecosysteem_regels_wijziging',
    onderwerpSamenvatting: 'Спроба скоротити власний часовий замок конституції',
    inhoudPayload: { nieuwTijdslot: 1 },
    indienerSoort: 'ai_agent',
    indienerId: 'agent:antigravity',
    indienerSleutels: agentSleutels,
    aangevraagdeWachttijdUren: 1,
    nuIso: t0Iso,
  });

  check('maakBestuursVoorstel примусово піднімає спроби занизити часовий замок до конституційних 24, 48 та 72 годин (§20)',
    voorstelVerlaagd24.wachttijdUren === 24
    && voorstelVerlaagd48.wachttijdUren === 48
    && voorstelVerlaagd72.wachttijdUren === 72
    && Date.parse(voorstelVerlaagd72.uitvoerbaarVanaf) - Date.parse(t0Iso) === 72 * 3600 * 1000);

  const valsVeto = pasOvergangsNoodVetoToe({
    grondwet: basisGwUit.grondwet,
    voorstel: voorstelVerlaagd24,
    reden: 'Підроблене вето стороннім ключем',
    vetoGeheimPkcs8B64u: vreemdeSleutels.geheimeSleutelPkcs8B64u,
    nuIso: new Date(t0Ms + 3600_000).toISOString(),
  });
  const geldigVeto = pasOvergangsNoodVetoToe({
    grondwet: basisGwUit.grondwet,
    voorstel: voorstelVerlaagd24,
    reden: 'Зупинено власником під час вікна перевірки',
    vetoGeheimPkcs8B64u: vetoSleutels.geheimeSleutelPkcs8B64u,
    nuIso: new Date(t0Ms + 3600_000).toISOString(),
  });
  const bekrachtigNaVeto = geldigVeto.ok
    ? bekrachtigBestuursBesluitMetFrost({
      grondwet: basisGwUit.grondwet,
      bestaandLogboek: [],
      voorstel: geldigVeto.gevetoodVoorstel,
      frostOndertekenaarIndexen: [1, 2],
      frostHandtekeningHex: 'b'.repeat(128),
      bekrachtigdOp: new Date(t0Ms + 30 * 3600_000).toISOString(),
    })
    : { ok: false as const, fout: 'VETO_MISLUKT' };

  check('перехідне аварійне вето відхиляє чужий ключ і надійно блокує ветовану пропозицію до її затвердження',
    !valsVeto.ok && valsVeto.fout === 'NOODVETO_HANDTEKENING_ONGELDIG'
    && geldigVeto.ok === true
    && !bekrachtigNaVeto.ok && bekrachtigNaVeto.fout === 'VOORSTEL_IS_GEVETOOD');

  const vervalstVoorstel = { ...voorstelVerlaagd24, onderwerpSamenvatting: 'Підмінений опис після підпису' };
  const foutHandtekening = bekrachtigBestuursBesluitMetFrost({
    grondwet: basisGwUit.grondwet,
    bestaandLogboek: [],
    voorstel: vervalstVoorstel,
    frostOndertekenaarIndexen: [2, 3],
    frostHandtekeningHex: 'b'.repeat(128),
    bekrachtigdOp: new Date(t0Ms + 25 * 3600_000).toISOString(),
  });
  const foutOnvoldoendeQuorum = bekrachtigBestuursBesluitMetFrost({
    grondwet: basisGwUit.grondwet,
    bestaandLogboek: [],
    voorstel: voorstelVerlaagd24,
    frostOndertekenaarIndexen: [1],
    frostHandtekeningHex: 'b'.repeat(128),
    bekrachtigdOp: new Date(t0Ms + 25 * 3600_000).toISOString(),
  });
  // Повтор однакових індексів [1, 1] або відсутність іншого хранителя крім ініціатора (indienerHoederIndex = 1)
  const gwMetLagereDrempelTest = { ...basisGwUit.grondwet, drempel: 1 };
  const foutZelfGoedkeuring = bekrachtigBestuursBesluitMetFrost({
    grondwet: gwMetLagereDrempelTest,
    bestaandLogboek: [],
    voorstel: voorstelVerlaagd24,
    frostOndertekenaarIndexen: [1],
    frostHandtekeningHex: 'b'.repeat(128),
    bekrachtigdOp: new Date(t0Ms + 25 * 3600_000).toISOString(),
  });

  check('bekrachtigBestuursBesluitMetFrost виявляє підробку підпису пропозиції та блокує недостатній кворум і самосхвалення ініціатором (§32, §34)',
    !foutHandtekening.ok && foutHandtekening.fout === 'VOORSTEL_INDIENER_HANDTEKENING_ONGELDIG'
    && !foutOnvoldoendeQuorum.ok && foutOnvoldoendeQuorum.fout === 'EENPERSOONS_OF_ONVOLDOENDE_QUORUM_GEWEIGERD'
    && !foutZelfGoedkeuring.ok && foutZelfGoedkeuring.fout === 'EENPERSOONS_OF_AGENT_ZELFGOEDKEURING_GEWEIGERD');

  // ------------------------------------------------------------------ 4. Метадані випусків TUF, вебклієнт та критерії здоров'я (§24–§25)
  const doelenSleutels = maakEd25519SleutelPaar();
  const tijdstempelSleutels = maakEd25519SleutelPaar();
  const pakketBuf = Buffer.from('klimop-uitgave-pakket-binair', 'utf8');
  const webBuf = Buffer.from('export const versie = "2.0.0";', 'utf8');

  let onomkeerbaarZonderPlanGeweigerd = false;
  try {
    maakUitgaveDoelenMetadata({
      versieLabel: 'fout-v2',
      uitgaveVolgnummer: 2,
      minCompatibelVolgnummer: 1,
      pakketInhoud: pakketBuf,
      webClientBundelInhoud: webBuf,
      afhankelijkhedenBoomSha256: sha256Hex('deps'),
      bronCommitSha40: '72bc067577443de9385bcd24e23f27046767f076',
      ontwikkelarchiefSha256: sha256Hex('archief'),
      isOnomkeerbareMigratie: true,
      auteurSoort: 'menselijke_deelnemer',
      auteurId: 'klid1_mens',
      doelenRolSleutels: doelenSleutels,
    });
  } catch {
    onomkeerbaarZonderPlanGeweigerd = true;
  }

  const doelenOk = maakUitgaveDoelenMetadata({
    versieLabel: '20261120-v2',
    uitgaveVolgnummer: 2,
    minCompatibelVolgnummer: 1,
    pakketInhoud: pakketBuf,
    webClientBundelInhoud: webBuf,
    afhankelijkhedenBoomSha256: sha256Hex('deps'),
    bronCommitSha40: '72bc067577443de9385bcd24e23f27046767f076',
    ontwikkelarchiefSha256: sha256Hex('archief'),
    isOnomkeerbareMigratie: true,
    onomkeerbareHerstelProcedureId: 'HERSTEL-PLAN-MIGRATIE-002',
    auteurSoort: 'menselijke_deelnemer',
    auteurId: 'klid1_mens',
    doelenRolSleutels: doelenSleutels,
  });
  const { doelenMetadataSha256 } = maakMomentopnameFrostBoodschap(basisGwUit.grondwet.grondwetId, doelenOk);
  const nepMoment = {
    schema: 1 as const,
    grondwetId: basisGwUit.grondwet.grondwetId,
    uitgaveVolgnummer: 2,
    doelenMetadataSha256,
    frostOndertekenaarIndexen: [1, 2],
    frostHandtekeningHex: 'c'.repeat(128),
  };
  // Навмисно підписуємо tijdstempel ТИМ САМИМ ключем, що й doelenRol — мусить спрацювати заборона об'єднання ролей!
  const zelfdeSleutelTijdstempel = maakUitgaveTijdstempelMetadata({
    momentopname: nepMoment,
    tijdstempelRolSleutels: doelenSleutels,
    nuIso: t0Iso,
  });
  const rollenscheidingTest = verifieerUitgaveBundel({
    grondwet: basisGwUit.grondwet,
    bundel: { doelen: doelenOk, momentopname: nepMoment, tijdstempel: zelfdeSleutelTijdstempel },
    huidigGeinstalleerdVolgnummer: 1,
    ontvangenPakketInhoud: pakketBuf,
    ontvangenWebClientInhoud: webBuf,
    nuIso: t0Iso,
  });

  check('незворотні оновлення вимагають явного плану відновлення, а суміщення ключів doelenRol і tijdstempelRol негайно блокується (§24, §25)',
    onomkeerbaarZonderPlanGeweigerd === true
    && !rollenscheidingTest.ok && rollenscheidingTest.fout === 'UITGAVE_ROLLENSCHEIDING_GESCHONDEN');

  const webIntegriteitGoed = verifieerWebClientBundelIntegriteit(
    doelenOk.webClientManifest,
    webBuf,
    doelenSleutels.publiekeSleutelDerB64u,
  );
  const webIntegriteitVervalst = verifieerWebClientBundelIntegriteit(
    doelenOk.webClientManifest,
    Buffer.from('window.lek = document.cookie;', 'utf8'),
    doelenSleutels.publiekeSleutelDerB64u,
  );
  const webIntegriteitVreemdeSleutel = verifieerWebClientBundelIntegriteit(
    doelenOk.webClientManifest,
    webBuf,
    vreemdeSleutels.publiekeSleutelDerB64u,
  );

  check('verifieerWebClientBundelIntegriteit захищає користувача від підміни клієнтського коду скомпрометованим сервером (§25 абз. 4)',
    webIntegriteitGoed.ok === true
    && !webIntegriteitVervalst.ok && webIntegriteitVervalst.fout === 'WEBCLIENT_BUNDEL_INTEGRITEIT_FOUT'
    && !webIntegriteitVreemdeSleutel.ok && webIntegriteitVreemdeSleutel.fout === 'WEBCLIENT_ONBEKENDE_BOUWERSLEUTEL');

  const gezondheidVolledig = beoordeelUitrolGezondheid({
    procesGestart: true,
    gegevensIntegriteitOk: true,
    machtigingenGeldigOk: true,
    geenGeheimLekGedetecteerd: true,
  });
  const gezondheidAlleenStartMaarLek = beoordeelUitrolGezondheid({
    procesGestart: true,
    gegevensIntegriteitOk: true,
    machtigingenGeldigOk: false,
    geenGeheimLekGedetecteerd: false,
  });

  check('beoordeelUitrolGezondheid не вважає простий запуск процесу успіхом при порушенні дозволів чи витоку секретів, а сусідні версії узгоджуються коректно',
    gezondheidVolledig.gezond === true
    && gezondheidAlleenStartMaarLek.gezond === false
    && gezondheidAlleenStartMaarLek.gefaaldeControles.includes('MACHTIGINGEN_ONGELDIG')
    && gezondheidAlleenStartMaarLek.gefaaldeControles.includes('GEHEIMLEK_GEDETECTEERD')
    && zijnKnooppuntVersiesOnderlingCompatibel({ actiefVolgnummer: 2, minCompatibelVolgnummer: 1 }, { actiefVolgnummer: 1, minCompatibelVolgnummer: 1 }) === true
    && zijnKnooppuntVersiesOnderlingCompatibel({ actiefVolgnummer: 3, minCompatibelVolgnummer: 3 }, { actiefVolgnummer: 1, minCompatibelVolgnummer: 1 }) === false);

  // ------------------------------------------------------------------ 5. Живе мережеве порогове керування та 3-хвильові випуски на 4 вузлах (NL, CH, UA, SE)
  const srvNL = await startKlimopProefKnooppunt({ knooppunt: knNL });
  const srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH });
  const srvUA = await startKlimopProefKnooppunt({ knooppunt: knUA });
  const srvSE = await startKlimopProefKnooppunt({ knooppunt: knSE });

  try {
    const tabel = new KlimopRouteTabel();
    for (const s of [srvNL, srvCH, srvUA, srvSE]) {
      tabel.voegTweerichtingsStengelToe(knCoord.identiteit.knooppuntId, s.identiteit.knooppuntId, 1);
    }
    const adressen = new Map([
      [srvNL.identiteit.knooppuntId, srvNL.basisUrl],
      [srvCH.identiteit.knooppuntId, srvCH.basisUrl],
      [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
      [srvSE.identiteit.knooppuntId, srvSE.basisUrl],
    ]);

    const netwerkClient = new KlimopNetwerkClient(knCoord, adressen, tabel);
    const drempelClient = new KlimopDrempelOndertekenaarClient(netwerkClient);
    const bestuurClient = new KlimopBestuurEnUitrolClient(netwerkClient, drempelClient);

    const dkgUit = await drempelClient.voerNetwerkDkgUit({
      setId: 'test-bestuur-frost-set',
      opdrachtgever: knCoord,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
      drempel: 2,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });
    if (!dkgUit.ok) throw new Error(dkgUit.fout);

    const gwV1Uit = maakBestuursGrondwet({
      grondwetId: 'klimop-gw-live-v1',
      versieVolgnummer: 1,
      frostSetId: 'test-bestuur-frost-set',
      frostGroepsPubliekeSleutelHex: dkgUit.groep.groepsPubliekeSleutelHex,
      drempel: 2,
      erkendeHoeders: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
      overgangsNoodVetoPubDerB64u: vetoSleutels.publiekeSleutelDerB64u,
      nuIso: t0Iso,
    });
    if (!gwV1Uit.ok) throw new Error(gwV1Uit.fout);

    const omgUit = await bestuurClient.stelGrondwetOpNetwerkIn({
      netwerkId: 'live-net-007',
      opdrachtgever: knCoord,
      grondwet: gwV1Uit.grondwet,
      frostGroep: dkgUit.groep,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
      erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tijdstempelSleutels.publiekeSleutelDerB64u,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });

    check('бездилерський DKG 2-з-3 ради керування (NL, CH, UA) та конституція v1 встановлюються на всіх 4 незалежних вузлах',
      omgUit.ok === true && omgUit.bevestigdeKnooppuntIds.length === 4);
    if (!omgUit.ok) throw new Error(omgUit.fout);

    // Затвердження двох послідовних рішень при карантинному вузлі CH (NL + UA підписують за FROST RFC 9591)
    tabel.plaatsInQuarantaine(knCH.identiteit.knooppuntId);

    const voorstel1 = maakBestuursVoorstel({
      grondwet: gwV1Uit.grondwet,
      categorie: 'cryptografische_goedkeuring_kritiek',
      onderwerpSamenvatting: 'Затвердження політики ізольованих з’єднувачів',
      inhoudPayload: { connectorBeleid: 'strikt-v1' },
      indienerSoort: 'menselijke_deelnemer',
      indienerId: 'klid1_eigenaar',
      indienerSleutels: mensSleutels,
      nuIso: t0Iso,
    });
    const teVroeg1 = await bestuurClient.bekrachtigVoorstelOpNetwerk({
      omgeving: omgUit.omgeving,
      bestaandLogboek: [],
      voorstel: voorstel1,
      bekrachtigdOp: new Date(t0Ms + 12 * 3600_000).toISOString(),
    });
    const besluit1 = await bestuurClient.bekrachtigVoorstelOpNetwerk({
      omgeving: omgUit.omgeving,
      bestaandLogboek: [],
      voorstel: voorstel1,
      bekrachtigdOp: new Date(t0Ms + 25 * 3600_000).toISOString(),
    });
    if (!besluit1.ok) throw new Error(besluit1.fout);

    const voorstel2Gw = maakBestuursVoorstel({
      grondwet: gwV1Uit.grondwet,
      categorie: 'ecosysteem_regels_wijziging',
      onderwerpSamenvatting: 'Перехід конституції керування на редакцію v2 після 72 годин перевірки',
      inhoudPayload: { doelVersieVolgnummer: 2 },
      indienerSoort: 'ai_agent',
      indienerId: 'agent:antigravity',
      indienerSleutels: agentSleutels,
      nuIso: new Date(t0Ms + 26 * 3600_000).toISOString(),
    });
    const besluit2Gw = await bestuurClient.bekrachtigVoorstelOpNetwerk({
      omgeving: omgUit.omgeving,
      bestaandLogboek: [besluit1.besluit],
      voorstel: voorstel2Gw,
      bekrachtigdOp: new Date(t0Ms + 100 * 3600_000).toISOString(),
    });
    if (!besluit2Gw.ok) throw new Error(besluit2Gw.fout);

    const logboekTwee = [besluit1.besluit, besluit2Gw.besluit];
    const logboekOk = verifieerBestuursBesluitLogboek(gwV1Uit.grondwet, logboekTwee);
    const vervalstLogboek = [
      besluit1.besluit,
      { ...besluit2Gw.besluit, vorigeBesluitSha256: 'f'.repeat(64) },
    ];
    const logboekVervalst = verifieerBestuursBesluitLogboek(gwV1Uit.grondwet, vervalstLogboek);

    check('при карантинному CH кворум NL + UA блокує рішення до часового замка, підписує ланцюжок FROST після спливу і виявляє розрив журналу',
      !teVroeg1.ok && teVroeg1.fout === 'BESTUUR_TIJDSLOT_NOG_NIET_VERSTREKEN'
      && logboekOk.ok === true
      && !logboekVervalst.ok && logboekVervalst.fout === 'BESLUITLOGBOEK_KETEN_GEBROKEN');

    tabel.haalUitQuarantaine(knCH.identiteit.knooppuntId);

    // Спроба оновити конституцію до v2 без 72-год рішення FROST відхиляється, а з повним журналом — приймається!
    const gwV2Uit = maakBestuursGrondwet({
      grondwetId: 'klimop-gw-live-v1',
      versieVolgnummer: 2,
      frostSetId: 'test-bestuur-frost-set',
      frostGroepsPubliekeSleutelHex: dkgUit.groep.groepsPubliekeSleutelHex,
      drempel: 2,
      erkendeHoeders: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
      overgangsNoodVetoPubDerB64u: vetoSleutels.publiekeSleutelDerB64u,
      nuIso: new Date(t0Ms + 100 * 3600_000).toISOString(),
    });
    if (!gwV2Uit.ok) throw new Error(gwV2Uit.fout);

    const gwZonderLogboek = await bestuurClient.stelGrondwetOpNetwerkIn({
      netwerkId: 'live-net-007',
      opdrachtgever: knCoord,
      grondwet: gwV2Uit.grondwet,
      frostGroep: dkgUit.groep,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
      erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tijdstempelSleutels.publiekeSleutelDerB64u,
      bekrachtigdLogboek: [besluit1.besluit], // лише 24-год рішення, а не 72-год ecosysteem_regels_wijziging!
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });
    const gwMet72uLogboek = await bestuurClient.stelGrondwetOpNetwerkIn({
      netwerkId: 'live-net-007',
      opdrachtgever: knCoord,
      grondwet: gwV2Uit.grondwet,
      frostGroep: dkgUit.groep,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
      erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tijdstempelSleutels.publiekeSleutelDerB64u,
      bekrachtigdLogboek: logboekTwee,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });

    check('живі вузли блокують підміну чинної конституції без 72-годинного рішення правил і приймають оновлення v2 із підтвердженим журналом FROST',
      !gwZonderLogboek.ok && gwZonderLogboek.fout === 'GRONDWET_WIJZIGING_VEREIST_FROST_BESLUIT_72U'
      && gwMet72uLogboek.ok === true && gwMet72uLogboek.bevestigdeKnooppuntIds.length === 4);
    if (!gwMet72uLogboek.ok) throw new Error(gwMet72uLogboek.fout);

    // 3-хвильове розгортання v2 ([NL] -> [CH, UA] -> [SE])
    const golven = [
      [knNL.identiteit.knooppuntId],
      [knCH.identiteit.knooppuntId, knUA.identiteit.knooppuntId],
      [knSE.identiteit.knooppuntId],
    ];
    const pakketV2 = Buffer.from('klimop-uitgave-v2-tar', 'utf8');
    const webV2 = Buffer.from('console.log("webclient-v2");', 'utf8');
    const bundelV2 = await bestuurClient.stelOndertekendeUitgaveBundelSamen({
      omgeving: gwMet72uLogboek.omgeving,
      versieLabel: '20261120-v2',
      uitgaveVolgnummer: 2,
      minCompatibelVolgnummer: 1,
      pakketInhoud: pakketV2,
      webClientBundelInhoud: webV2,
      afhankelijkhedenBoomSha256: sha256Hex('deps-v2'),
      bronCommitSha40: '72bc067577443de9385bcd24e23f27046767f076',
      ontwikkelarchiefSha256: sha256Hex('archief-v2'),
      auteurSoort: 'menselijke_deelnemer',
      auteurId: 'klid1_eigenaar',
      doelenRolSleutels: doelenSleutels,
      tijdstempelRolSleutels: tijdstempelSleutels,
      nuIso: t0Iso,
    });
    if (!bundelV2.ok) throw new Error(bundelV2.fout);

    const uitrolV2 = await bestuurClient.voerGefaseerdeUitrolUit({
      omgeving: gwMet72uLogboek.omgeving,
      bundel: bundelV2.bundel,
      pakketInhoud: pakketV2,
      webClientBundelInhoud: webV2,
      golven,
      nuIso: new Date(t0Ms + 600_000).toISOString(),
    });

    check('3-хвильове розгортання v2 послідовно переводить усі 4 вузли на v2 зі збереженням сумісності сусідніх версій між хвилями',
      uitrolV2.voltooid === true
      && uitrolV2.status === 'alle_golven_voltooid'
      && uitrolV2.voltooideGolven === 3
      && uitrolV2.tussentijdseVersieCompatibiliteitOk === true
      && [srvNL, srvCH, srvUA, srvSE].every((s) => s.actiefUitgaveVolgnummer() === 2));

    // Відбиття атак захопленого каналу оновлень: rollback, freeze та підміна серверного пакета
    const pakketV3 = Buffer.from('klimop-uitgave-v3-tar', 'utf8');
    const webV3 = Buffer.from('console.log("webclient-v3");', 'utf8');
    const bundelV3 = await bestuurClient.stelOndertekendeUitgaveBundelSamen({
      omgeving: gwMet72uLogboek.omgeving,
      versieLabel: '20261120-v3',
      uitgaveVolgnummer: 3,
      minCompatibelVolgnummer: 2,
      pakketInhoud: pakketV3,
      webClientBundelInhoud: webV3,
      afhankelijkhedenBoomSha256: sha256Hex('deps-v3'),
      bronCommitSha40: '72bc067577443de9385bcd24e23f27046767f076',
      ontwikkelarchiefSha256: sha256Hex('archief-v3'),
      auteurSoort: 'menselijke_deelnemer',
      auteurId: 'klid1_eigenaar',
      doelenRolSleutels: doelenSleutels,
      tijdstempelRolSleutels: tijdstempelSleutels,
      nuIso: t0Iso,
      tijdstempelGeldigheidUren: 24,
    });
    if (!bundelV3.ok) throw new Error(bundelV3.fout);

    const aanvalRollback = await bestuurClient.voerGefaseerdeUitrolUit({
      omgeving: gwMet72uLogboek.omgeving,
      bundel: bundelV2.bundel,
      pakketInhoud: pakketV2,
      webClientBundelInhoud: webV2,
      golven: [[knNL.identiteit.knooppuntId]],
      nuIso: new Date(t0Ms + 900_000).toISOString(),
    });
    const aanvalBevroren = await bestuurClient.voerGefaseerdeUitrolUit({
      omgeving: gwMet72uLogboek.omgeving,
      bundel: bundelV3.bundel,
      pakketInhoud: pakketV3,
      webClientBundelInhoud: webV3,
      golven: [[knNL.identiteit.knooppuntId]],
      nuIso: new Date(t0Ms + 72 * 3600_000).toISOString(),
    });
    const aanvalPakketVervalst = await bestuurClient.voerGefaseerdeUitrolUit({
      omgeving: gwMet72uLogboek.omgeving,
      bundel: bundelV3.bundel,
      pakketInhoud: Buffer.from('kwaadaardig-pakket-zonder-handtekening', 'utf8'),
      webClientBundelInhoud: webV3,
      golven: [[knNL.identiteit.knooppuntId]],
      nuIso: new Date(t0Ms + 1800_000).toISOString(),
    });

    check('вузли відбивають відкочування до старої версії, заморожене свідоцтво свіжості та підміну бінарного пакета до початку встановлення (§25)',
      aanvalRollback.status === 'afgewezen_voor_installatie' && aanvalRollback.stopFout === 'UITGAVE_TERUGDRAAI_AANVAL_GEWEIGERD'
      && aanvalBevroren.status === 'afgewezen_voor_installatie' && aanvalBevroren.stopFout === 'UITGAVE_TIJDSTEMPEL_BEVROREN_OF_VERLOPEN'
      && aanvalPakketVervalst.status === 'afgewezen_voor_installatie' && aanvalPakketVervalst.stopFout === 'UITGAVE_PAKKET_SHA256_FOUT'
      && srvNL.actiefUitgaveVolgnummer() === 2);

    // Небезпечний випуск v3: Хвиля 1 (NL) запустила процес, але порушила цілісність дозволів і спричинила витік секретів -> авто-стоп і відкочування!
    const foutUitrolV3 = await bestuurClient.voerGefaseerdeUitrolUit({
      omgeving: gwMet72uLogboek.omgeving,
      bundel: bundelV3.bundel,
      pakketInhoud: pakketV3,
      webClientBundelInhoud: webV3,
      golven,
      gesimuleerdeMetingPerKnooppuntId: {
        [knNL.identiteit.knooppuntId]: {
          procesGestart: true,
          gegevensIntegriteitOk: true,
          machtigingenGeldigOk: false,
          geenGeheimLekGedetecteerd: false,
        },
      },
      nuIso: new Date(t0Ms + 1800_000).toISOString(),
    });

    check('при порушенні безпеки на Хвилі 1 (NL) система автоматично відкочує NL на v2 і миттєво зупиняє оновлення без зачіпання Хвиль 2 і 3 (CH, UA, SE)',
      !foutUitrolV3.voltooid
      && foutUitrolV3.status === 'automatisch_gestopt_en_teruggedraaid'
      && foutUitrolV3.voltooideGolven === 0
      && foutUitrolV3.nietAangeraakteKnooppuntIds.length === 3
      && srvNL.aantalUitgaveTerugdraaiingen() === 1
      && [srvNL, srvCH, srvUA, srvSE].every((s) => s.actiefUitgaveVolgnummer() === 2));

    netwerkClient.sluitAlleSessies();
  } finally {
    await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit(), srvSE.sluit()]);
  }

  // ------------------------------------------------------------------ 6. Архітектурна перевірка 15 питань, документація Етапу 6 та Абсолютний мовний закон
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      { voldaan: true, bewijs: `Підтверджено Етапом 6 (bestuur.ts / TUF / FROST) для ${id}` },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const oordeelEtappe6 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-007 Етап 6: розподілене порогове керування, 7 категорій повноважень, часові замки та безпечні хвильові випуски',
    fase: 6,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('Етап 6 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe6.goedgekeurd === true && oordeelEtappe6.fouten.length === 0);

  const et6Uk = 'docs/hub/ПЛЮЩ-ЕТАП-6-РОЗПОДІЛЕНЕ-КЕРУВАННЯ-ТА-БЕЗПЕЧНІ-ВИПУСКИ.uk.md';
  const et6Md = 'docs/hub/ПЛЮЩ-ЕТАП-6-РОЗПОДІЛЕНЕ-КЕРУВАННЯ-ТА-БЕЗПЕЧНІ-ВИПУСКИ.md';
  const et6Nl = 'docs/hub/KLIMOP-FASE-6-DREMPELBESTUUR-EN-VEILIGE-UITGAVEN.nl.md';

  check('двомовні документи Етапу 6 (Документи №8 та №14), полігон і всі 6 дзеркальних пар документації повністю синхронізовані',
    [et6Uk, et6Md, et6Nl, 'scripts/klimop-etappe6-bestuur-proef.mjs'].every((p) => existsSync(p))
    && lees(et6Uk) === lees(et6Md)
    && lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md') === lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.md')
    && lees('.agents/skills/klimop-architectuur/SKILL.md') === lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('ПЛАН-ПЕРЕНЕСЕННЯ.uk.md') === lees('ПЛАН-ПЕРЕНЕСЕННЯ.md')
    && ['TUF', 'FROST', 'verifieerWebClientBundelIntegriteit', 'voerGefaseerdeUitrolUit', 'bestuur.ts', 'klimop-bestuur-client.ts']
      .every((s) => lees(et6Uk).includes(s) && lees(et6Nl).includes(s)));

  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check('досьє ecosysteem-klimop.json фіксує запит №188 для KLIMOP-006, задачу KLIMOP-007 та всі 16 активних можливостей без жодної втраченої',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-006' && w.pr === 188)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-007')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 16
    && dossier.mogelijkheden.every((m: { staat: string }) => m.staat !== 'verloren'));

  const bestandenKlimop007 = [
    'shared/klimop/bestuur.ts',
    'backend/klimop-bestuur-client.ts',
    'backend/klimop-knooppunt-agent.ts',
    'scripts/klimop-etappe6-bestuur-proef.mjs',
    et6Uk,
    et6Nl,
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
    'tests/eenheid/klimop-007-etappe6-drempelbestuur-uitrol-20261120.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop007.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі нові та оновлені файли KLIMOP-007 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
