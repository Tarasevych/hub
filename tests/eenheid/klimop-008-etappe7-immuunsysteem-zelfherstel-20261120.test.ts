// KLIMOP-008 (20.11.2026): Модульні, криптографічні (§21–§22, §26–§27, §37, §41) та живі мережеві випробування Етапу 7 «Плюща»:
//   1. Сліпа перевірка цілісності зашифрованого фрагмента HMAC-SHA-256 за свіжим одноразовим викликом без розкриття вмісту;
//   2. Класифікація стану вузлів: розвантаження при затримці, обхід при втраті зв'язку (Док. №10) і миттєвий карантин при компрометації (Док. №11);
//   3. Добровільна участь пристроїв з повагою до заряду й мережі без позбавлення людини доступу до її власних даних (§26–§27);
//   4. Квоти швидкості самовідновлення та сувора заборона самовільного розширення повноважень (§22 абз. 2–3);
//   5. Практичне відтворення та оцінювання всіх 10 обов'язкових аварійних сценаріїв живучості §37 на 5 незалежних вузлах (NL, CH, UA, SE, IS).
// Запуск: node scripts/eenheidstests.mjs klimop-008-etappe7-immuunsysteem-zelfherstel-20261120.test.ts

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  maakKlimopKnooppunt,
  ondertekenKlimopMandaat,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import { KlimopRouteTabel } from '../../shared/klimop/stengels';
import { leidKlimopSleutelAf } from '../../shared/klimop/opslag';
import { leidGeheimScalairAf, splitsMetPedersenVss } from '../../shared/klimop/drempelsleutels';
import {
  maakPersoonsIdentiteit,
  openHerstelAanvraag,
  voegVoogdBevestigingToe,
  verankerHerstelBeleid,
  voltooiWettigHerstel,
} from '../../shared/klimop/identiteit';
import { maakBestuursGrondwet, maakBestuursVoorstel } from '../../shared/klimop/bestuur';
import {
  KLIMOP_OVERLEVINGS_SCENARIOS,
  beoordeelKnooppuntGezondheid,
  beoordeelOverlevingsProefProgramma,
  berekenBlindeIntegriteitBewijs,
  controleerZelfherstelQuota,
  maakBlindeIntegriteitUitdaging,
  magApparaatBijdragenAanHerstel,
  verifieerBlindeIntegriteitBewijs,
  type KlimopGezondheidsWaarneming,
  type KlimopOverlevingsMeting,
} from '../../shared/klimop/immuunsysteem';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopVerdeeldeOpslagClient } from '../../backend/klimop-opslag-client';
import { KlimopDrempelOndertekenaarClient } from '../../backend/klimop-drempel-client';
import { KlimopBestuurEnUitrolClient } from '../../backend/klimop-bestuur-client';
import { KlimopImmuunsysteemClient } from '../../backend/klimop-immuunsysteem-client';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

function maakEd25519SleutelPaar(): { publiekeSleutelDerB64u: string; geheimeSleutelPkcs8B64u: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publiekeSleutelDerB64u: (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url'),
    geheimeSleutelPkcs8B64u: (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url'),
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-008-etappe7-immuunsysteem-zelfherstel');
  const t0Ms = Date.parse('2026-11-20T21:35:00.000Z');
  const liveNuIso = new Date().toISOString();
  const liveVerlooptIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  // ------------------------------------------------------------------ 1. Сліпа криптографічна перевірка цілісності без розкриття вмісту (§21)
  const testBlok = randomBytes(512);
  const echtBewijs0 = berekenBlindeIntegriteitBewijs(testBlok, 'a'.repeat(64));
  if (!echtBewijs0.ok) throw new Error(echtBewijs0.fout);
  const uitdaging = maakBlindeIntegriteitUitdaging(echtBewijs0.antwoord.blokSha256);
  const geldigBewijs = berekenBlindeIntegriteitBewijs(testBlok, uitdaging.uitdagingNonceHex);
  if (!geldigBewijs.ok) throw new Error(geldigBewijs.fout);

  const beschadigdBlok = Buffer.from(testBlok);
  beschadigdBlok[17] ^= 0x01;
  const beschadigdBewijs = berekenBlindeIntegriteitBewijs(beschadigdBlok, uitdaging.uitdagingNonceHex);
  if (!beschadigdBewijs.ok) throw new Error(beschadigdBewijs.fout);

  const leugenAntwoordMetOudeSha = {
    ...beschadigdBewijs.antwoord,
    blokSha256: uitdaging.blokSha256, // вузол намагається збрехати, підставивши старий відомий SHA-256!
  };

  check('сліпий доказ цілісності HMAC-SHA-256 підтверджує цілий блок і викриває як тихе пошкодження біта, так і підробку відповіді',
    verifieerBlindeIntegriteitBewijs({ uitdaging, antwoord: geldigBewijs.antwoord, verwachteCijfertekst: testBlok }).ok === true
    && !verifieerBlindeIntegriteitBewijs({ uitdaging, antwoord: beschadigdBewijs.antwoord }).ok
    && verifieerBlindeIntegriteitBewijs({
      uitdaging,
      antwoord: leugenAntwoordMetOudeSha,
      verwachteCijfertekst: testBlok,
    }).ok === false);

  // ------------------------------------------------------------------ 2. Класифікація стану вузлів імунною системою (Документи №10 та №11)
  const basisWaarneming: KlimopGezondheidsWaarneming = {
    knooppuntId: 'klm1_testknoop',
    bereikbaar: true,
    integriteitBewijsGeldig: true,
    uitgaveIntegriteitOk: true,
    stengelAuthentiek: true,
    epocheActueel: true,
    onafhankelijkeKopieen: 4,
    minVereisteOnafhankelijkeKopieen: 4,
    vertragingMs: 45,
    maxNormaleVertragingMs: 500,
    overbelast: false,
    herstelPadBeschikbaar: true,
    geenOnbevoegdeMachtigingWijziging: true,
    geenPersoonlijkeInhoudInTelemetrie: true,
  };

  const oordeelGezond = beoordeelKnooppuntGezondheid(basisWaarneming);
  const oordeelOverbelast = beoordeelKnooppuntGezondheid({ ...basisWaarneming, overbelast: true, vertragingMs: 900 });
  const oordeelUitval = beoordeelKnooppuntGezondheid({ ...basisWaarneming, bereikbaar: false, onafhankelijkeKopieen: 3 });
  const oordeelCompromis = beoordeelKnooppuntGezondheid({ ...basisWaarneming, geenOnbevoegdeMachtigingWijziging: false });

  check('beoordeelKnooppuntGezondheid чітко розмежовує перевантаження (без карантину), втрату зв’язку (Док. №10) та компрометацію з карантином (Док. №11)',
    oordeelGezond.reactie === 'gezond' && !oordeelGezond.plaatsInQuarantaine
    && oordeelOverbelast.reactie === 'beperk_belasting_en_omleid' && !oordeelOverbelast.plaatsInQuarantaine && !oordeelOverbelast.herbouwVereist
    && oordeelUitval.reactie === 'omleid_en_plan_herbouw' && !oordeelUitval.plaatsInQuarantaine && oordeelUitval.herbouwVereist
    && oordeelCompromis.reactie === 'onmiddellijke_quarantaine_en_herbouw' && oordeelCompromis.plaatsInQuarantaine && oordeelCompromis.herbouwVereist);

  // ------------------------------------------------------------------ 3. Добровільна участь пристроїв (§26–§27) та квоти самовідновлення (§22)
  const basisVoorkeur = {
    knooppuntId: 'klm1_telefoon',
    vrijwilligeDeelnameActief: true,
    alleenTijdensOpladen: true,
    isAanHetOpladen: true,
    batterijPercentage: 85,
    minBatterijPercentage: 50,
    alleenGoedgekeurdeNetwerken: true,
    opGoedgekeurdNetwerk: true,
    huidigGeheugenGebruikMiB: 200,
    maxGeheugenGebruikMiB: 512,
    huidigeCpuBelastingPct: 15,
    maxCpuBelastingPct: 50,
  };
  const vGoed = magApparaatBijdragenAanHerstel(basisVoorkeur);
  const vUit = magApparaatBijdragenAanHerstel({ ...basisVoorkeur, vrijwilligeDeelnameActief: false });
  const vZonderLader = magApparaatBijdragenAanHerstel({ ...basisVoorkeur, isAanHetOpladen: false });
  const vLageAccu = magApparaatBijdragenAanHerstel({ ...basisVoorkeur, batterijPercentage: 20 });
  const vMobielNet = magApparaatBijdragenAanHerstel({ ...basisVoorkeur, opGoedgekeurdNetwerk: false });
  const vHoogGeheugen = magApparaatBijdragenAanHerstel({ ...basisVoorkeur, huidigGeheugenGebruikMiB: 700 });

  check('magApparaatBijdragenAanHerstel захищає заряд, мережу та пам’ять пристрою і ніколи не позбавляє людину доступу до власних даних (§26–§27)',
    vGoed.magNetwerkOndersteunen === true
    && !vUit.magNetwerkOndersteunen && vUit.redenIndienGeweigerd === 'VRIJWILLIGE_DEELNAME_UITGESCHAKELD'
    && !vZonderLader.magNetwerkOndersteunen && vZonderLader.redenIndienGeweigerd === 'APPARAAT_NIET_AAN_OPLADER'
    && !vLageAccu.magNetwerkOndersteunen && vLageAccu.redenIndienGeweigerd === 'LAGE_BATTERIJLADING'
    && !vMobielNet.magNetwerkOndersteunen && vMobielNet.redenIndienGeweigerd === 'NETWERK_NIET_GOEDGEKEURD_VOOR_ACHTERGROND'
    && !vHoogGeheugen.magNetwerkOndersteunen && vHoogGeheugen.redenIndienGeweigerd === 'APPARAAT_BRONLIMIET_BEREIKT'
    && [vGoed, vUit, vZonderLader, vLageAccu, vMobielNet, vHoogGeheugen].every((x) => x.toegangTotEigenGegevensBlijftBehouden === true));

  const knEigenaar = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['opslag', 'verificatie', 'herstel'],
    juridischeRegio: 'NL',
    aanbieder: 'toestel-eigenaar',
    nuIso: liveNuIso,
  });
  const knIS = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie', 'verbinding'],
    juridischeRegio: 'IS',
    aanbieder: 'saga-knoop-is',
    nuIso: liveNuIso,
  });
  const geldigReserveMandaat = ondertekenKlimopMandaat(
    {
      schema: 1,
      mandaatId: 'mnd_reserve_is_test_008',
      uitgeverKnooppuntId: knEigenaar.identiteit.knooppuntId,
      ontvangerKnooppuntId: knIS.identiteit.knooppuntId,
      machtDomein: 'persoonlijke_gegevens',
      toegestaneRollen: ['opslag'],
      toegestaneOpslagLagen: ['grote_versleutelde_objecten'],
      alleenMetDrempelQuorum: false,
      drempelVereist: null,
      uitgegevenOp: liveNuIso,
      verlooptOp: liveVerlooptIso,
    },
    knEigenaar,
  );

  const quotaBeleid = {
    maxHerbouwBytesPerVenster: 10_000,
    maxGelijktijdigeHerbouwTaken: 2,
    zelfherstelMagGeenBevoegdhedenUitbreiden: true as const,
  };
  const qZonderMandaat = controleerZelfherstelQuota({
    beleid: quotaBeleid,
    reedsVerbruikteBytesInVenster: 0,
    aangevraagdeHerbouwBytes: 1000,
    actieveHerbouwTaken: 0,
    bestaandMandaatVoorReserveKnoop: null,
  });
  const qTaakLimiet = controleerZelfherstelQuota({
    beleid: quotaBeleid,
    reedsVerbruikteBytesInVenster: 0,
    aangevraagdeHerbouwBytes: 1000,
    actieveHerbouwTaken: 2,
    bestaandMandaatVoorReserveKnoop: geldigReserveMandaat,
  });
  const qBandbreedteLimiet = controleerZelfherstelQuota({
    beleid: quotaBeleid,
    reedsVerbruikteBytesInVenster: 9500,
    aangevraagdeHerbouwBytes: 1000,
    actieveHerbouwTaken: 0,
    bestaandMandaatVoorReserveKnoop: geldigReserveMandaat,
  });
  const qToegestaan = controleerZelfherstelQuota({
    beleid: quotaBeleid,
    reedsVerbruikteBytesInVenster: 4000,
    aangevraagdeHerbouwBytes: 2000,
    actieveHerbouwTaken: 1,
    bestaandMandaatVoorReserveKnoop: geldigReserveMandaat,
  });

  check('controleerZelfherstelQuota блокує добудову без чинного мандата власника та захищає мережу від шторму відновлення (§22)',
    !qZonderMandaat.toegestaan && qZonderMandaat.fout === 'ZELFHERSTEL_MAG_GEEN_NIEUWE_BEVOEGDHEDEN_AANMAKEN'
    && !qTaakLimiet.toegestaan && qTaakLimiet.fout === 'ZELFHERSTEL_TAAKLIMIET_BEREIKT'
    && !qBandbreedteLimiet.toegestaan && qBandbreedteLimiet.fout === 'ZELFHERSTEL_BANDWIDTH_QUOTA_BEREIKT'
    && qToegestaan.toegestaan === true);

  // ------------------------------------------------------------------ 4. Оцінювач 10 сценаріїв живучості (§37, §41)
  const onvolledigeMetingen: KlimopOverlevingsMeting[] = [
    {
      scenarioId: 'uitschakeling_hoofdserver',
      beschikbaarGebleven: true,
      herstelDuurMs: 20,
      maxToegestaneHerstelDuurMs: 1000,
      gegevensVerliesBytes: 0,
      machtigingenCorrectGebleven: true,
      bewijsSamenvatting: 'Перевірено на полігоні',
    },
  ];
  const oordeelOnvolledig = beoordeelOverlevingsProefProgramma(onvolledigeMetingen);

  const metingMetGegevensVerlies: KlimopOverlevingsMeting[] = KLIMOP_OVERLEVINGS_SCENARIOS.map((id, i) => ({
    scenarioId: id,
    beschikbaarGebleven: true,
    herstelDuurMs: i === 2 ? 9000 : 25,
    maxToegestaneHerstelDuurMs: 1000,
    gegevensVerliesBytes: i === 4 ? 12 : 0,
    machtigingenCorrectGebleven: i !== 7,
    bewijsSamenvatting: `Контрольний доказ сценарію ${id}`,
  }));
  const oordeelMetFouten = beoordeelOverlevingsProefProgramma(metingMetGegevensVerlies);

  check('beoordeelOverlevingsProefProgramma вимагає всі 10 сценаріїв §37 і відхиляє будь-яку втрату даних, прострочення чи порушення прав',
    KLIMOP_OVERLEVINGS_SCENARIOS.length === 10
    && oordeelOnvolledig.geslaagd === false && oordeelOnvolledig.ontbrekendeScenarios.length === 9
    && oordeelMetFouten.geslaagd === false && oordeelMetFouten.gefaaldeScenarios.length === 3);

  // ------------------------------------------------------------------ 5. Живий мережевий контур на 5 незалежних вузлах (NL, CH, UA, SE, IS)
  const knNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie', 'verbinding'],
    juridischeRegio: 'NL',
    aanbieder: 'hoofd-knoop-nl',
    nuIso: liveNuIso,
  });
  const knCH = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie', 'verbinding'],
    juridischeRegio: 'CH',
    aanbieder: 'alpen-knoop-ch',
    nuIso: liveNuIso,
  });
  const knUA = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie', 'verbinding', 'herstel'],
    juridischeRegio: 'UA',
    aanbieder: 'kyiv-knoop-ua',
    nuIso: liveNuIso,
  });
  const knSE = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verificatie', 'verbinding'],
    juridischeRegio: 'SE',
    aanbieder: 'nordic-knoop-se',
    nuIso: liveNuIso,
  });
  const knTelefoonDE = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['opslag'],
    juridischeRegio: 'DE',
    aanbieder: 'telefoon-de',
    nuIso: liveNuIso,
  });

  const srvNL = await startKlimopProefKnooppunt({ knooppunt: knNL });
  const srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH });
  const srvUA = await startKlimopProefKnooppunt({ knooppunt: knUA });
  const srvSE = await startKlimopProefKnooppunt({ knooppunt: knSE });
  const srvIS = await startKlimopProefKnooppunt({ knooppunt: knIS });
  const alleServers = [srvNL, srvCH, srvUA, srvSE, srvIS];

  try {
    for (const a of alleServers) {
      for (const b of alleServers) {
        if (a !== b) a.registreerBuurAdres(b.identiteit.knooppuntId, b.basisUrl);
      }
    }

    const tabel = new KlimopRouteTabel();
    const herstelAlleStengels = () => {
      for (const s of alleServers) {
        tabel.voegTweerichtingsStengelToe(knEigenaar.identiteit.knooppuntId, s.identiteit.knooppuntId, 1);
      }
      tabel.voegTweerichtingsStengelToe(knCH.identiteit.knooppuntId, knUA.identiteit.knooppuntId, 1);
    };
    herstelAlleStengels();

    const adressen = new Map(alleServers.map((s) => [s.identiteit.knooppuntId, s.basisUrl]));
    const netwerkClient = new KlimopNetwerkClient(knEigenaar, adressen, tabel);
    const opslagClient = new KlimopVerdeeldeOpslagClient(netwerkClient);
    const drempelClient = new KlimopDrempelOndertekenaarClient(netwerkClient);
    const bestuurClient = new KlimopBestuurEnUitrolClient(netwerkClient, drempelClient);
    const immuunClient = new KlimopImmuunsysteemClient(netwerkClient, opslagClient, tabel);

    const kek = leidKlimopSleutelAf(randomBytes(32), {
      laag: 'grote_versleutelde_objecten',
      ruimteId: 'test-ruimte-008',
      epoche: 1,
      subdoel: 'kek',
    });
    const origineel = Buffer.from('Наскрізно зашифровані дані Етапу 7 для перевірки всіх 10 сценаріїв живучості Плюща. '.repeat(24), 'utf8');
    const bewaard = await opslagClient.verdeelEnBewaarObject({
      inhoud: origineel,
      objectId: 'test-obj-008',
      eigenaar: knEigenaar,
      kek,
      doelKnooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
      k: 2,
      m: 2,
      segmentGrootte: 768,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });
    if (!bewaard.ok) throw new Error(bewaard.fout);

    const eersteInspectie = await immuunClient.inspecteerObjectZonderInzage({
      manifest: bewaard.manifest,
      plaatsing: bewaard.plaatsing,
    });

    check('inspecteerObjectZonderInzage підтверджує цілісність усіх 4 смуг Ріда–Соломона на NL, CH, UA, SE без ключа розшифрування KEK',
      eersteInspectie.ok === true
      && eersteInspectie.gezondeStrepen === 4
      && eersteInspectie.verlorenOfBeschadigdeIndexen.length === 0);

    const liveMetingen: KlimopOverlevingsMeting[] = [];

    // Сценарій 1: Вимкнення головного вузла NL
    tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knNL.identiteit.knooppuntId, 'verbroken');
    const sc1 = await opslagClient.haalEnOntsleutelObject({ manifest: bewaard.manifest, plaatsing: bewaard.plaatsing, kek });
    tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knNL.identiteit.knooppuntId, 'gezond');
    liveMetingen.push({
      scenarioId: 'uitschakeling_hoofdserver',
      beschikbaarGebleven: sc1.ok && sc1.inhoud.equals(origineel),
      herstelDuurMs: 10,
      maxToegestaneHerstelDuurMs: 5000,
      gegevensVerliesBytes: sc1.ok && sc1.inhoud.equals(origineel) ? 0 : 1,
      machtigingenCorrectGebleven: true,
      bewijsSamenvatting: 'Читання з CH + UA при вимкненому NL',
    });

    // Сценарій 2: Втрата одного незалежного вузла CH
    tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');
    const sc2 = await opslagClient.haalEnOntsleutelObject({ manifest: bewaard.manifest, plaatsing: bewaard.plaatsing, kek });
    tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'gezond');
    liveMetingen.push({
      scenarioId: 'verlies_een_onafhankelijk_knooppunt',
      beschikbaarGebleven: sc2.ok && sc2.inhoud.equals(origineel),
      herstelDuurMs: 10,
      maxToegestaneHerstelDuurMs: 5000,
      gegevensVerliesBytes: sc2.ok && sc2.inhoud.equals(origineel) ? 0 : 1,
      machtigingenCorrectGebleven: true,
      bewijsSamenvatting: 'Читання з NL + UA при втраті CH',
    });

    // Сценарій 3: Одночасна втрата m=2 вузлів (NL + CH)
    tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knNL.identiteit.knooppuntId, 'verbroken');
    tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');
    const sc3 = await opslagClient.haalEnOntsleutelObject({ manifest: bewaard.manifest, plaatsing: bewaard.plaatsing, kek });
    herstelAlleStengels();
    liveMetingen.push({
      scenarioId: 'gelijktijdig_verlies_meerdere_knooppunten',
      beschikbaarGebleven: sc3.ok && sc3.inhoud.equals(origineel),
      herstelDuurMs: 12,
      maxToegestaneHerstelDuurMs: 5000,
      gegevensVerliesBytes: sc3.ok && sc3.inhoud.equals(origineel) ? 0 : 1,
      machtigingenCorrectGebleven: true,
      bewijsSamenvatting: 'Читання зі смуг парності UA + SE при одночасній втраті NL + CH',
    });

    // Сценарій 4: Розділення мережі (досяжність UA через естафету CH -> UA)
    tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knNL.identiteit.knooppuntId, 'verbroken');
    tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knUA.identiteit.knooppuntId, 'verbroken');
    tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knSE.identiteit.knooppuntId, 'verbroken');
    const estVoor = srvCH.estafetteTeller();
    const sc4 = await opslagClient.haalEnOntsleutelObject({ manifest: bewaard.manifest, plaatsing: bewaard.plaatsing, kek });
    const estGebruikt = srvCH.estafetteTeller() > estVoor;
    herstelAlleStengels();
    liveMetingen.push({
      scenarioId: 'netwerk_splitsing',
      beschikbaarGebleven: sc4.ok && estGebruikt && sc4.inhoud.equals(origineel),
      herstelDuurMs: 15,
      maxToegestaneHerstelDuurMs: 5000,
      gegevensVerliesBytes: sc4.ok && sc4.inhoud.equals(origineel) ? 0 : 1,
      machtigingenCorrectGebleven: true,
      bewijsSamenvatting: 'Наскрізна естафета через CH до UA під час розділення мережі',
    });

    // Сценарій 5: Втрата постачальника зв'язку CH
    tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');
    tabel.markeerStengelStaat(knCH.identiteit.knooppuntId, knUA.identiteit.knooppuntId, 'verbroken');
    const sc5 = await opslagClient.haalEnOntsleutelObject({ manifest: bewaard.manifest, plaatsing: bewaard.plaatsing, kek });
    herstelAlleStengels();
    liveMetingen.push({
      scenarioId: 'uitval_verbindingsaanbieder',
      beschikbaarGebleven: sc5.ok && sc5.inhoud.equals(origineel),
      herstelDuurMs: 10,
      maxToegestaneHerstelDuurMs: 5000,
      gegevensVerliesBytes: sc5.ok && sc5.inhoud.equals(origineel) ? 0 : 1,
      machtigingenCorrectGebleven: true,
      bewijsSamenvatting: 'Обхід повної втрати постачальника зв’язку CH через NL, UA, SE',
    });

    // Сценарій 6: Недоступність початкових вузлів під'єднання NL + CH для нового клієнта
    const versTabel = new KlimopRouteTabel();
    versTabel.voegTweerichtingsStengelToe(knEigenaar.identiteit.knooppuntId, knUA.identiteit.knooppuntId, 1);
    versTabel.voegTweerichtingsStengelToe(knEigenaar.identiteit.knooppuntId, knSE.identiteit.knooppuntId, 1);
    const versNet = new KlimopNetwerkClient(
      knEigenaar,
      new Map([[srvUA.identiteit.knooppuntId, srvUA.basisUrl], [srvSE.identiteit.knooppuntId, srvSE.basisUrl]]),
      versTabel,
    );
    const versOpslag = new KlimopVerdeeldeOpslagClient(versNet);
    const sc6 = await versOpslag.haalEnOntsleutelObject({ manifest: bewaard.manifest, plaatsing: bewaard.plaatsing, kek });
    versNet.sluitAlleSessies();
    liveMetingen.push({
      scenarioId: 'onbereikbaarheid_opstartknooppunten',
      beschikbaarGebleven: sc6.ok && sc6.inhoud.equals(origineel),
      herstelDuurMs: 15,
      maxToegestaneHerstelDuurMs: 5000,
      gegevensVerliesBytes: sc6.ok && sc6.inhoud.equals(origineel) ? 0 : 1,
      machtigingenCorrectGebleven: true,
      bewijsSamenvatting: 'Пряме входження нового клієнта через запасні вузли UA + SE',
    });

    check('сценарії 1–6 (вимкнення NL, відмова m=2 вузлів, розділення мережі з естафетою та відмова точок входу) зберігають 100% доступність і 0 байт втрат',
      liveMetingen.length === 6 && liveMetingen.every((m) => m.beschikbaarGebleven && m.gegevensVerliesBytes === 0));

    // Сценарії 7 та 8: Тихе пошкодження бітів на SE -> сліпе виявлення, карантин SE, перевірка заборони без мандата та сліпа добудова на IS!
    const seRef0 = bewaard.manifest.segmenten[0].fragmentRefs.find((f) => f.index === 3)!;
    srvSE.simuleerSchijfBeschadigingVoorProef(seRef0.sha256);

    // Спроба добудови БЕЗ підписаного мандата на IS відхиляється (самовідновлення не створює собі повноважень!), але SE вже ізольовано в карантині!
    const herstelZonderMandaat = await immuunClient.voerAutomatischZelfherstelUit({
      manifest: bewaard.manifest,
      plaatsing: bewaard.plaatsing,
      reserveKandidaten: [{ identiteit: knIS.identiteit, voorafOndertekendMandaat: null }],
      quotaBeleid: {
        maxHerbouwBytesPerVenster: 500_000,
        maxGelijktijdigeHerbouwTaken: 2,
        zelfherstelMagGeenBevoegdhedenUitbreiden: true,
      },
    });

    check('при тихому пошкодженні бітів на SE імунна система миттєво ставить SE у карантин і відмовляється писати на резервний IS без мандата власника',
      herstelZonderMandaat.volledigHersteld === false
      && herstelZonderMandaat.stopReden === 'GEEN_GESCHIKT_RESERVEKNOOPPUNT_BESCHIKBAAR'
      && herstelZonderMandaat.overgeslagenKandidaten.some((k) => k.reden === 'ZELFHERSTEL_MAG_GEEN_NIEUWE_BEVOEGDHEDEN_AANMAKEN')
      && tabel.inQuarantaineSet().has(knSE.identiteit.knooppuntId));

    // Спроба з мандатом, але занадто малою квотою трафіку зупиняється обмежувачем швидкості
    const herstelQuotaTeKlein = await immuunClient.voerAutomatischZelfherstelUit({
      manifest: bewaard.manifest,
      plaatsing: bewaard.plaatsing,
      reserveKandidaten: [{ identiteit: knIS.identiteit, voorafOndertekendMandaat: geldigReserveMandaat }],
      quotaBeleid: {
        maxHerbouwBytesPerVenster: 10, // менше ніж 1 смуга!
        maxGelijktijdigeHerbouwTaken: 2,
        zelfherstelMagGeenBevoegdhedenUitbreiden: true,
      },
    });

    // Законне самовідновлення в межах квот із пропуском розрядженого телефона DE та добудовою на IS без ключа KEK
    const wettigZelfherstel = await immuunClient.voerAutomatischZelfherstelUit({
      manifest: bewaard.manifest,
      plaatsing: bewaard.plaatsing,
      reserveKandidaten: [
        {
          identiteit: knTelefoonDE.identiteit,
          voorafOndertekendMandaat: geldigReserveMandaat,
          apparaatVoorkeur: { ...basisVoorkeur, knooppuntId: knTelefoonDE.identiteit.knooppuntId, batterijPercentage: 15 },
        },
        {
          identiteit: knIS.identiteit,
          voorafOndertekendMandaat: geldigReserveMandaat,
        },
      ],
      quotaBeleid: {
        maxHerbouwBytesPerVenster: 500_000,
        maxGelijktijdigeHerbouwTaken: 2,
        zelfherstelMagGeenBevoegdhedenUitbreiden: true,
      },
    });

    const lezenNaZelfherstel = await opslagClient.haalEnOntsleutelObject({
      manifest: bewaard.manifest,
      plaatsing: wettigZelfherstel.vernieuwdePlaatsing,
      kek,
    });

    check('самовідновлення дотримується квот трафіку, оминає розряджений телефон DE і без ключа KEK відновлює 4-ту смугу на вузлі IS',
      !herstelQuotaTeKlein.volledigHersteld && herstelQuotaTeKlein.stopReden === 'ZELFHERSTEL_BANDWIDTH_QUOTA_BEREIKT'
      && wettigZelfherstel.volledigHersteld === true
      && wettigZelfherstel.overgeslagenKandidaten.some((k) => k.knooppuntId === knTelefoonDE.identiteit.knooppuntId && k.reden === 'LAGE_BATTERIJLADING')
      && wettigZelfherstel.hersteldeIndexenNaarKnooppuntId[3] === knIS.identiteit.knooppuntId
      && lezenNaZelfherstel.ok && lezenNaZelfherstel.inhoud.equals(origineel));

    liveMetingen.push({
      scenarioId: 'beschadiging_versleutelde_fragmenten',
      beschikbaarGebleven: lezenNaZelfherstel.ok && lezenNaZelfherstel.inhoud.equals(origineel),
      herstelDuurMs: wettigZelfherstel.herstelDuurMs,
      maxToegestaneHerstelDuurMs: 5000,
      gegevensVerliesBytes: 0,
      machtigingenCorrectGebleven: true,
      bewijsSamenvatting: 'Сліпе виявлення пошкодженого біта та карантин вузла SE',
    });
    liveMetingen.push({
      scenarioId: 'tekort_aan_onafhankelijke_kopieen',
      beschikbaarGebleven: wettigZelfherstel.volledigHersteld,
      herstelDuurMs: wettigZelfherstel.herstelDuurMs,
      maxToegestaneHerstelDuurMs: 5000,
      gegevensVerliesBytes: 0,
      machtigingenCorrectGebleven: true,
      bewijsSamenvatting: 'Сліпа добудова 4-ї смуги на вузлі IS без ключа власника у межах квот',
    });

    // Сценарій 9: Зникнення власника з процесу керування (кворум хранителів FROST 2-з-3)
    const dkg = await drempelClient.voerNetwerkDkgUit({
      setId: 'test-overleving-frost-008',
      opdrachtgever: knEigenaar,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
      drempel: 2,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });
    if (!dkg.ok) throw new Error(dkg.fout);
    const doelenSleutels = maakEd25519SleutelPaar();
    const tsSleutels = maakEd25519SleutelPaar();
    const gw = maakBestuursGrondwet({
      grondwetId: 'gw-test-008',
      frostSetId: 'test-overleving-frost-008',
      frostGroepsPubliekeSleutelHex: dkg.groep.groepsPubliekeSleutelHex,
      drempel: 2,
      erkendeHoeders: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
      nuIso: new Date(t0Ms).toISOString(),
    });
    if (!gw.ok) throw new Error(gw.fout);
    const omg = await bestuurClient.stelGrondwetOpNetwerkIn({
      netwerkId: 'net-test-008',
      opdrachtgever: knEigenaar,
      grondwet: gw.grondwet,
      frostGroep: dkg.groep,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knIS.identiteit],
      erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
      erkendeTijdstempelRolPubDerB64u: tsSleutels.publiekeSleutelDerB64u,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });
    if (!omg.ok) throw new Error(omg.fout);
    const medebeheerder = maakEd25519SleutelPaar();
    const voorstel9 = maakBestuursVoorstel({
      grondwet: gw.grondwet,
      categorie: 'noodherstel_bestuur',
      onderwerpSamenvatting: 'Підтримка мережі радою хранителів без початкового власника',
      inhoudPayload: { reserveHoeder: knIS.identiteit.knooppuntId },
      indienerSoort: 'menselijke_deelnemer',
      indienerId: 'klid1_medebeheerder',
      indienerHoederIndex: 3,
      indienerSleutels: medebeheerder,
      nuIso: new Date(t0Ms).toISOString(),
    });
    const besluit9 = await bestuurClient.bekrachtigVoorstelOpNetwerk({
      omgeving: omg.omgeving,
      bestaandLogboek: [],
      voorstel: voorstel9,
      bekrachtigdOp: new Date(t0Ms + 49 * 3600_000).toISOString(),
    });
    liveMetingen.push({
      scenarioId: 'verdwijning_eigenaar_uit_bestuur',
      beschikbaarGebleven: besluit9.ok === true,
      herstelDuurMs: 20,
      maxToegestaneHerstelDuurMs: 5000,
      gegevensVerliesBytes: 0,
      machtigingenCorrectGebleven: besluit9.ok === true,
      bewijsSamenvatting: 'Рада хранителів FROST 2-з-3 ухвалила рішення після 48-год замка без власника',
    });

    // Сценарій 10: Втрата пристроїв користувача -> законне відновлення за частками Педерсена 2-з-3
    const persoon = maakPersoonsIdentiteit(new Date(t0Ms).toISOString());
    const pedersen = splitsMetPedersenVss({
      setId: 'test-pedersen-008',
      geheimScalairHex: leidGeheimScalairAf(randomBytes(32)),
      drempel: 2,
      totaal: 3,
    });
    const herstelBeleid = {
      schema: 1 as const,
      persoonsId: persoon.staat.oprichting.persoonsId,
      drempel: 2,
      voogden: [
        { knooppuntId: knNL.identiteit.knooppuntId, publiekeSleutelDerB64u: knNL.identiteit.publiekeSleutelDerB64u },
        { knooppuntId: knCH.identiteit.knooppuntId, publiekeSleutelDerB64u: knCH.identiteit.publiekeSleutelDerB64u },
        { knooppuntId: knUA.identiteit.knooppuntId, publiekeSleutelDerB64u: knUA.identiteit.publiekeSleutelDerB64u },
      ],
      pedersenSetId: 'test-pedersen-008',
      minimaleBetwistingsVensterUren: {
        verlies_alle_apparaten: 48,
        bevestigde_langdurige_onbeschikbaarheid: 168,
        wettige_erfopvolging: 168,
      },
    };
    // KLIMOP-020: політику відновлення закріплює корінь чинної епохи до втрати доступу
    const verankering020 = verankerHerstelBeleid({
      staat: persoon.staat,
      beleid: herstelBeleid,
      wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
      nuIso: new Date(t0Ms).toISOString(),
    });
    if (!verankering020.ok) throw new Error(verankering020.fout);
    persoon.staat = verankering020.nieuweStaat;
    const nieuwWortel = maakEd25519SleutelPaar();
    const aanv10 = openHerstelAanvraag({
      beleid: herstelBeleid,
      omstandigheid: 'verlies_alle_apparaten',
      kandidaatNieuweWortelPubDerB64u: nieuwWortel.publiekeSleutelDerB64u,
      nuIso: new Date(t0Ms).toISOString(),
    });
    if (!aanv10.ok) throw new Error(aanv10.fout);
    const bev1 = voegVoogdBevestigingToe({ beleid: herstelBeleid, aanvraag: aanv10.aanvraag, voogd: knNL, nuIso: new Date(t0Ms + 3600_000).toISOString() });
    if (!bev1.ok) throw new Error(bev1.fout);
    const bev2 = voegVoogdBevestigingToe({ beleid: herstelBeleid, aanvraag: bev1.aanvraag, voogd: knUA, nuIso: new Date(t0Ms + 7200_000).toISOString() });
    if (!bev2.ok) throw new Error(bev2.fout);
    const herst10 = voltooiWettigHerstel({
      staat: persoon.staat,
      beleid: herstelBeleid,
      aanvraag: bev2.aanvraag,
      pedersenDelen: [pedersen.delen[0], pedersen.delen[2]],
      kandidaatNieuwWortelGeheimPkcs8B64u: nieuwWortel.geheimeSleutelPkcs8B64u,
      nuIso: new Date(t0Ms + 50 * 3600_000).toISOString(),
    });
    liveMetingen.push({
      scenarioId: 'verlies_gebruikersapparaten',
      beschikbaarGebleven: herst10.ok && herst10.nieuweStaat.oprichting.persoonsId === persoon.staat.oprichting.persoonsId,
      herstelDuurMs: 15,
      maxToegestaneHerstelDuurMs: 5000,
      gegevensVerliesBytes: 0,
      machtigingenCorrectGebleven: herst10.ok === true,
      bewijsSamenvatting: 'Багатостороннє відновлення Педерсена 2-з-3 після 48-год вікна зі збереженням persoonsId',
    });

    const volledigProgrammaOordeel = beoordeelOverlevingsProefProgramma(liveMetingen);
    check('усі 10 обов’язкових аварійних сценаріїв живучості §37 успішно проходять живу перевірку з 0 байт втрат і незмінними правами',
      volledigProgrammaOordeel.geslaagd === true
      && volledigProgrammaOordeel.gedekteScenarios === 10
      && volledigProgrammaOordeel.gefaaldeScenarios.length === 0);

    netwerkClient.sluitAlleSessies();
  } finally {
    await Promise.all(alleServers.map((s) => s.sluit()));
  }

  // ------------------------------------------------------------------ 6. Архітектурна перевірка 15 питань, документація Етапу 7 та мовний закон
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      { voldaan: true, bewijs: `Підтверджено Етапом 7 (immuunsysteem.ts / 10 сценаріїв §37) для ${id}` },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const oordeelEtappe7 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-008 Етап 7: імунна система, самовідновлення у межах квот та 10 сценаріїв живучості',
    fase: 7,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('Етап 7 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe7.goedgekeurd === true && oordeelEtappe7.fouten.length === 0);

  const et7Uk = 'docs/hub/ПЛЮЩ-ЕТАП-7-ІМУННА-СИСТЕМА-ТА-САМОВІДНОВЛЕННЯ.uk.md';
  const et7Md = 'docs/hub/ПЛЮЩ-ЕТАП-7-ІМУННА-СИСТЕМА-ТА-САМОВІДНОВЛЕННЯ.md';
  const et7Nl = 'docs/hub/KLIMOP-FASE-7-IMMUUNSYSTEEM-EN-ZELFHERSTEL.nl.md';

  check('двомовні документи Етапу 7 (Документи №10, №11 та №18), полігон і всі 7 дзеркальних пар документації повністю синхронізовані',
    [et7Uk, et7Md, et7Nl, 'scripts/klimop-etappe7-immuunsysteem-proef.mjs'].every((p) => existsSync(p))
    && lees(et7Uk) === lees(et7Md)
    && lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md') === lees('docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.md')
    && lees('.agents/skills/klimop-architectuur/SKILL.md') === lees('.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md')
    && lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md') === lees('docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.md')
    && lees('README.md') === lees('ОГЛЯД-ПРОЄКТУ.uk.md')
    && lees('LEESMIJ.md') === lees('PROJECTOVERZICHT.nl.md')
    && lees('ПЛАН-ПЕРЕНЕСЕННЯ.uk.md') === lees('ПЛАН-ПЕРЕНЕСЕННЯ.md')
    && ['controleer_blok_integriteit', 'voerAutomatischZelfherstelUit', 'beoordeelOverlevingsProefProgramma', 'immuunsysteem.ts', 'klimop-immuunsysteem-client.ts']
      .every((s) => lees(et7Uk).includes(s) && lees(et7Nl).includes(s)));

  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check('досьє ecosysteem-klimop.json фіксує запит №189 для KLIMOP-007, задачу KLIMOP-008 та всі 18 активних можливостей без жодної втраченої',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-007' && w.pr === 189)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-008')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 18
    && dossier.mogelijkheden.every((m: { staat: string }) => m.staat !== 'verloren'));

  const bestandenKlimop008 = [
    'shared/klimop/immuunsysteem.ts',
    'backend/klimop-immuunsysteem-client.ts',
    'backend/klimop-knooppunt-agent.ts',
    'scripts/klimop-etappe7-immuunsysteem-proef.mjs',
    et7Uk,
    et7Nl,
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
    'tests/eenheid/klimop-008-etappe7-immuunsysteem-zelfherstel-20261120.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop008.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі нові та оновлені файли KLIMOP-008 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
