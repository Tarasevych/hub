// KLIMOP-005 (20.11.2026): Модульні, криптографічні (§38 маніфесту) та живі мережеві випробування Етапу 4 «Плюща»:
//   1. Перевірюваний пороговий поділ секретів Фельдмана (Feldman VSS) та приховувальний поділ Педерсена (Pedersen VSS);
//   2. Двофазне проактивне епохальне оновлення часток із захистом від перерваної ротації та від накопичення старих часток;
//   3. Розподілене створення порогового ключа без єдиного дилера (DKG) та двораундові порогові цифрові підписи Шнорра
//      FROST(Ed25519, SHA-512) за стандартом RFC 9591 із поіменним виявленням підробки та перевіркою в node:crypto.verify;
//   4. Живий мережевий полігон 3 незалежних вузлів (NL, CH, UA) через KlimopDrempelOndertekenaarClient поверх «Стебел».
// Запуск: node scripts/eenheidstests.mjs klimop-005-etappe4-drempelsleutels-20261120.test.ts

import { createPublicKey, randomBytes, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  maakKlimopKnooppunt,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import {
  bereidEpocheVerversingVoor,
  berekenDeelnemerPubliekeSleutelsUitToezeggingen,
  combineerDkgBijdragenVoorDeelnemer,
  frostRonde1MaakToezegging,
  frostRonde2TekenDeel,
  frostVoegHandtekeningSamen,
  herstelUitFeldmanDelen,
  herstelUitPedersenDelen,
  leidGeheimScalairAf,
  maakDkgDeelnemerBijdrage,
  maakProactieveNulBijdrage,
  rondEpocheVerversingAf,
  splitsMetFeldmanVss,
  splitsMetPedersenVss,
  verifieerFeldmanDeel,
  verifieerPedersenDeel,
  verifieerProactieveNulBijdrageVoorOntvanger,
  verifieerStandaardEd25519Handtekening,
} from '../../shared/klimop/drempelsleutels';
import { KlimopRouteTabel } from '../../shared/klimop/stengels';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopDrempelOndertekenaarClient } from '../../backend/klimop-drempel-client';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-005-etappe4-drempelsleutels');
  const nuIso = '2026-11-20T19:05:00Z';
  const verlooptOpIso = '2026-12-31T23:59:59Z';

  // ------------------------------------------------------------------ 1. Перевірюваний поділ Фельдмана (3-з-5)
  const geheimHex = leidGeheimScalairAf(randomBytes(32));
  const feldman = splitsMetFeldmanVss({
    geheimScalairHex: geheimHex,
    drempel: 3,
    totaal: 5,
    setId: 'vss-feldman-test-001',
    epoche: 1,
  });

  check('усі 5 часток Фельдмана проходять публічну перевірку s_i*B == Sum i^j*C_j без розкриття секрету',
    feldman.delen.every((d) => verifieerFeldmanDeel(d).ok === true));

  // Перевіряємо всі C(5, 3) = 10 комбінацій відновлення з будь-яких 3 часток із 5!
  let alle10FeldmanOk = true;
  for (let a = 0; a < 5; a++) {
    for (let b = a + 1; b < 5; b++) {
      for (let c = b + 1; c < 5; c++) {
        const h = herstelUitFeldmanDelen([feldman.delen[a], feldman.delen[b], feldman.delen[c]]);
        if (!h.ok || h.geheimScalairHex !== geheimHex) alle10FeldmanOk = false;
      }
    }
  }
  check('усі 10 комбінацій будь-яких 3 із 5 часток Фельдмана точно відновлюють початковий секрет',
    alle10FeldmanOk === true);

  const vervalstFeldmanDeel = {
    ...feldman.delen[0],
    scalairHex: leidGeheimScalairAf(randomBytes(32)),
  };
  const teWeinigFeldman = herstelUitFeldmanDelen([feldman.delen[0], feldman.delen[1]]);
  const tegenstrijdigeFeldman = herstelUitFeldmanDelen([
    feldman.delen[0],
    feldman.delen[1],
    { ...feldman.delen[2], toezeggingenHex: [feldman.toezeggingenHex[1], feldman.toezeggingenHex[0], feldman.toezeggingenHex[2]] },
  ]);

  check('схема Фельдмана виявляє підроблену частку, суперечливі зобов’язання та спробу обійти поріг (< t часток)',
    !verifieerFeldmanDeel(vervalstFeldmanDeel).ok
    && !teWeinigFeldman.ok
    && !tegenstrijdigeFeldman.ok && tegenstrijdigeFeldman.fout === 'TEGENSTRIJDIGE_TOEZEGGINGEN_TUSSEN_DELEN');

  // ------------------------------------------------------------------ 2. Інформаційно-теоретично приховувальний поділ Педерсена
  const ped1 = splitsMetPedersenVss({
    geheimScalairHex: geheimHex,
    drempel: 2,
    totaal: 3,
    setId: 'vss-pedersen-001',
  });
  const ped2 = splitsMetPedersenVss({
    geheimScalairHex: geheimHex,
    drempel: 2,
    totaal: 3,
    setId: 'vss-pedersen-002',
  });
  const pedHersteld = herstelUitPedersenDelen([ped1.delen[0], ped1.delen[2]]);
  const pedVervalstBlind = verifieerPedersenDeel({
    ...ped1.delen[1],
    blindheidScalairHex: leidGeheimScalairAf(randomBytes(32)),
  });

  check('схема Педерсена повністю приховує секрет у зобов’язанні P_0 (P_0^(1) != P_0^(2)), перевіряє сліпий скаляр і відновлює секрет',
    ped1.toezeggingenHex[0] !== ped2.toezeggingenHex[0]
    && ped1.delen.every((d) => verifieerPedersenDeel(d).ok)
    && pedHersteld.ok === true && pedHersteld.geheimScalairHex === geheimHex
    && !pedVervalstBlind.ok && pedVervalstBlind.fout === 'PEDERSEN_TOEZEGGING_KLOPT_NIET');

  // ------------------------------------------------------------------ 3. Двофазні проактивні епохи та захист від накопичення старих часток
  const nul1 = maakProactieveNulBijdrage({ setId: 'vss-feldman-test-001', vanEpoche: 1, afzenderIndex: 1, drempel: 3, totaal: 5 });
  const nul2 = maakProactieveNulBijdrage({ setId: 'vss-feldman-test-001', vanEpoche: 1, afzenderIndex: 2, drempel: 3, totaal: 5 });

  // Спроба підсунути ненульовий вільний член (підробка підчастки)
  const kwaadwilligeNul = {
    ...nul1,
    subdelenPerOntvanger: { ...nul1.subdelenPerOntvanger, 1: leidGeheimScalairAf(randomBytes(32)) },
  };
  check('перевірка проактивного вкладу відхиляє спробу підмінити вільний член delta(0) != 0 (PROACTIEVE_NULBIJDRAGE_VERVALST)',
    !verifieerProactieveNulBijdrageVoorOntvanger(kwaadwilligeNul, 1).ok);

  const voorbereidAlle = feldman.delen.map((d) => bereidEpocheVerversingVoor(d, [nul1, nul2]));
  check('двофазна підготовка епохи 2 успішна на всіх 5 учасниках',
    voorbereidAlle.every((v) => v.ok === true));

  // Якщо процедуру перервано — відкочування зберігає епоху 1
  const teruggerold0 = voorbereidAlle[0].ok ? rondEpocheVerversingAf(voorbereidAlle[0].staat, 'afbreken') : feldman.delen[0];
  const bevestigdEp2 = voorbereidAlle.map((v) => (v.ok ? rondEpocheVerversingAf(v.staat, 'bevestig') : feldman.delen[0]));

  const herstelEp2 = herstelUitFeldmanDelen([bevestigdEp2[1], bevestigdEp2[3], bevestigdEp2[4]]);
  const aanvalOudeEnNieuweGemengd = herstelUitFeldmanDelen([feldman.delen[0], bevestigdEp2[1], bevestigdEp2[2]]);

  check('відкочування зберігає епоху 1, підтверджена епоха 2 зберігає C_0 і секрет при нових частках, а змішування епох 1 і 2 блокується (§38)',
    teruggerold0.epoche === 1 && teruggerold0.scalairHex === feldman.delen[0].scalairHex
    && bevestigdEp2.every((d, i) => d.epoche === 2 && d.scalairHex !== feldman.delen[i].scalairHex && d.toezeggingenHex[0] === feldman.groepsPubliekeSleutelHex)
    && herstelEp2.ok === true && herstelEp2.geheimScalairHex === geheimHex
    && !aanvalOudeEnNieuweGemengd.ok && aanvalOudeEnNieuweGemengd.fout === 'EPOCHE_VAN_DELEN_VERSCHILT');

  // ------------------------------------------------------------------ 4. Бездилерський DKG та пороговий підпис FROST (RFC 9591)
  const dkg1 = maakDkgDeelnemerBijdrage({ setId: 'dkg-unit-01', afzenderIndex: 1, drempel: 2, totaal: 3 });
  const dkg2 = maakDkgDeelnemerBijdrage({ setId: 'dkg-unit-01', afzenderIndex: 2, drempel: 2, totaal: 3 });
  const dkg3 = maakDkgDeelnemerBijdrage({ setId: 'dkg-unit-01', afzenderIndex: 3, drempel: 2, totaal: 3 });

  const vervalstDkg2 = {
    ...dkg2,
    subdelenPerOntvanger: { ...dkg2.subdelenPerOntvanger, 1: leidGeheimScalairAf(randomBytes(32)) },
  };
  const dkgDetectie = combineerDkgBijdragenVoorDeelnemer(1, [dkg1, vervalstDkg2, dkg3]);
  check('бездилерський DKG поіменно виявляє учасника, який надіслав недійсну підчастку (verdachteAfzenderIndex === 2)',
    !dkgDetectie.ok && dkgDetectie.verdachteAfzenderIndex === 2);

  const uit1 = combineerDkgBijdragenVoorDeelnemer(1, [dkg1, dkg2, dkg3]);
  const uit2 = combineerDkgBijdragenVoorDeelnemer(2, [dkg1, dkg2, dkg3]);
  const uit3 = combineerDkgBijdragenVoorDeelnemer(3, [dkg1, dkg2, dkg3]);
  if (!uit1.ok || !uit2.ok || !uit3.ok) return einde();

  const dkgDelen = [uit1.deel, uit2.deel, uit3.deel];
  const groepsHex = uit1.groepsPubliekeSleutelHex;
  const deelnemerPub = berekenDeelnemerPubliekeSleutelsUitToezeggingen(uit1.deel.toezeggingenHex, 3);

  // Перевірка захисту від повторного використання одноразового нонса у FROST
  const r1Hergebruik = frostRonde1MaakToezegging(1);
  const r1Partner = frostRonde1MaakToezegging(2);
  const msgTest = Buffer.from('Перевірка одноразовості нонса FROST', 'utf8');
  const eersteGebruik = frostRonde2TekenDeel({
    deel: uit1.deel,
    geheimeNonceStaat: r1Hergebruik.geheimeNonceStaat,
    boodschap: msgTest,
    toezeggingenLijst: [r1Hergebruik.publiek, r1Partner.publiek],
    groepsPubliekeSleutelHex: groepsHex,
  });
  const tweedeGebruik = frostRonde2TekenDeel({
    deel: uit1.deel,
    geheimeNonceStaat: r1Hergebruik.geheimeNonceStaat,
    boodschap: msgTest,
    toezeggingenLijst: [r1Hergebruik.publiek, r1Partner.publiek],
    groepsPubliekeSleutelHex: groepsHex,
  });
  check('одноразовий стан нонса FROST затирається нулями після Раунду 2 і блокує повторне використання (FROST_NONCE_REEDS_VERBRUIKT)',
    eersteGebruik.ok === true
    && r1Hergebruik.geheimeNonceStaat.dScalairBuf.every((b) => b === 0)
    && !tweedeGebruik.ok && tweedeGebruik.fout === 'FROST_NONCE_REEDS_VERBRUIKT');

  // Поіменне виявлення скомпрометованої частки підпису та перевірка всіх 3 пар {1,2}, {1,3}, {2,3} у node:crypto.verify
  let alle3ParenFrostOk = true;
  for (const paar of [[0, 1], [0, 2], [1, 2]]) {
    const dA = dkgDelen[paar[0]];
    const dB = dkgDelen[paar[1]];
    const nA = frostRonde1MaakToezegging(dA.index);
    const nB = frostRonde1MaakToezegging(dB.index);
    const lijst = [nA.publiek, nB.publiek];
    const zA = frostRonde2TekenDeel({ deel: dA, geheimeNonceStaat: nA.geheimeNonceStaat, boodschap: msgTest, toezeggingenLijst: lijst, groepsPubliekeSleutelHex: groepsHex });
    const zB = frostRonde2TekenDeel({ deel: dB, geheimeNonceStaat: nB.geheimeNonceStaat, boodschap: msgTest, toezeggingenLijst: lijst, groepsPubliekeSleutelHex: groepsHex });
    if (!zA.ok || !zB.ok) {
      alle3ParenFrostOk = false;
      continue;
    }
    const sig = frostVoegHandtekeningSamen({
      boodschap: msgTest,
      toezeggingenLijst: lijst,
      deelHandtekeningen: [zA.deelHandtekening, zB.deelHandtekening],
      deelnemerPubliekeSleutelsHex: deelnemerPub,
      groepsPubliekeSleutelHex: groepsHex,
      drempel: 2,
    });
    if (!sig.ok || !verifieerStandaardEd25519Handtekening(msgTest, sig.handtekeningHex, groepsHex)) {
      alle3ParenFrostOk = false;
    }
  }

  const nGoed = frostRonde1MaakToezegging(1);
  const nSlecht = frostRonde1MaakToezegging(2);
  const zGoed = frostRonde2TekenDeel({
    deel: uit1.deel,
    geheimeNonceStaat: nGoed.geheimeNonceStaat,
    boodschap: msgTest,
    toezeggingenLijst: [nGoed.publiek, nSlecht.publiek],
    groepsPubliekeSleutelHex: groepsHex,
  });
  const valseSamenvoeging = zGoed.ok
    ? frostVoegHandtekeningSamen({
        boodschap: msgTest,
        toezeggingenLijst: [nGoed.publiek, nSlecht.publiek],
        deelHandtekeningen: [
          zGoed.deelHandtekening,
          { deelnemerIndex: 2, zDeelHex: leidGeheimScalairAf(randomBytes(32)) },
        ],
        deelnemerPubliekeSleutelsHex: deelnemerPub,
        groepsPubliekeSleutelHex: groepsHex,
        drempel: 2,
      })
    : { ok: true as const, handtekeningHex: '', handtekeningB64u: '' };

  check('усі 3 кворумні пари FROST 2-з-3 генерують дійсний стандартний підпис Ed25519, а підроблена частка підпису виявляє порушника №2',
    alle3ParenFrostOk === true
    && !valseSamenvoeging.ok
    && JSON.stringify(valseSamenvoeging.verdachteDeelnemers) === JSON.stringify([2]));

  // ------------------------------------------------------------------ 5. Живий мережевий полігон 3 незалежних вузлів (NL, CH, UA)
  const opdrachtgever = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['verificatie', 'herstel'],
    juridischeRegio: 'NL',
    aanbieder: 'persoonlijk-toestel',
    nuIso,
  });
  const knNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'verbinding'],
    juridischeRegio: 'NL',
    aanbieder: 'eigen-knoop-nl',
    nuIso,
  });
  const knCH = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'verbinding'],
    juridischeRegio: 'CH',
    aanbieder: 'alpen-knoop-ch',
    nuIso,
  });
  const knUA = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'verbinding', 'herstel'],
    juridischeRegio: 'UA',
    aanbieder: 'kyiv-knoop-ua',
    nuIso,
  });

  const srvNL = await startKlimopProefKnooppunt({ knooppunt: knNL });
  const srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH });
  const srvUA = await startKlimopProefKnooppunt({ knooppunt: knUA });

  try {
    const tabel = new KlimopRouteTabel();
    const idO = opdrachtgever.identiteit.knooppuntId;
    for (const s of [srvNL, srvCH, srvUA]) {
      tabel.voegTweerichtingsStengelToe(idO, s.identiteit.knooppuntId, 1);
    }
    const adressen = new Map([
      [srvNL.identiteit.knooppuntId, srvNL.basisUrl],
      [srvCH.identiteit.knooppuntId, srvCH.basisUrl],
      [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
    ]);
    const netwerkClient = new KlimopNetwerkClient(opdrachtgever, adressen, tabel);
    const drempelClient = new KlimopDrempelOndertekenaarClient(netwerkClient);

    const dkgNetwerk = await drempelClient.voerNetwerkDkgUit({
      setId: 'netwerk-frost-001',
      opdrachtgever,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
      drempel: 2,
      nuIso,
      verlooptOpIso,
    });
    check('мережевий бездилерський DKG між живими вузлами NL, CH, UA встановлює єдиний публічний ключ Ed25519 без збирання секрету',
      dkgNetwerk.ok === true && srvNL.actieveDrempelEpoche('netwerk-frost-001') === 1);

    if (dkgNetwerk.ok) {
      const pubSpki = createPublicKey({
        key: Buffer.from(dkgNetwerk.groep.groepsPubliekeSleutelSpkiB64u, 'base64url'),
        format: 'der',
        type: 'spki',
      });

      tabel.plaatsInQuarantaine(knCH.identiteit.knooppuntId);
      const mEp1 = Buffer.from('Порогове рішення мережі — епоха 1', 'utf8');
      const sig1 = await drempelClient.tekenMetFrostQuorum({ groep: dkgNetwerk.groep, boodschap: mEp1 });
      check('живі вузли NL та UA підписують повідомлення через FROST при недоступному CH (перевірено node:crypto.verify)',
        sig1.ok === true
        && JSON.stringify(sig1.ondertekenaarIndexen) === JSON.stringify([1, 3])
        && verify(null, mEp1, pubSpki, Buffer.from(sig1.handtekeningHex, 'hex')));

      tabel.haalUitQuarantaine(knCH.identiteit.knooppuntId);
      const afgebroken = await drempelClient.verversEpocheOpNetwerk({
        groep: dkgNetwerk.groep,
        simuleerAfbrekingVoorBevestiging: true,
      });
      const epocheNaAfbreken = srvNL.actieveDrempelEpoche('netwerk-frost-001');
      const ververst = await drempelClient.verversEpocheOpNetwerk({ groep: dkgNetwerk.groep });
      check('мережеве проактивне оновлення безпечно відкочує перервану спробу і переводить усі 3 вузли в епоху 2 при незмінному ключі групи',
        afgebroken.ok === true && epocheNaAfbreken === 1
        && ververst.ok === true && ververst.vernieuwdeGroep.epoche === 2
        && srvNL.actieveDrempelEpoche('netwerk-frost-001') === 2
        && srvCH.actieveDrempelEpoche('netwerk-frost-001') === 2
        && ververst.vernieuwdeGroep.groepsPubliekeSleutelHex === dkgNetwerk.groep.groepsPubliekeSleutelHex);

      if (ververst.ok) {
        tabel.plaatsInQuarantaine(knNL.identiteit.knooppuntId);
        const mEp2 = Buffer.from('Порогове рішення мережі після оновлення часток — епоха 2', 'utf8');
        const sig2 = await drempelClient.tekenMetFrostQuorum({ groep: ververst.vernieuwdeGroep, boodschap: mEp2 });
        check('після проактивного оновлення в епоху 2 пара CH + UA генерує дійсний підпис Ed25519 під тим самим публічним ключем групи',
          sig2.ok === true
          && JSON.stringify(sig2.ondertekenaarIndexen) === JSON.stringify([2, 3])
          && verify(null, mEp2, pubSpki, Buffer.from(sig2.handtekeningHex, 'hex')));
      }
    }

    netwerkClient.sluitAlleSessies();
  } finally {
    await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit()]);
  }

  // ------------------------------------------------------------------ 6. Перевірка 15 питань, документації Етапу 4 та Абсолютного мовного закону
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [id, { voldaan: true, bewijs: `Підтверджено Етапом 4 (drempelsleutels.ts / FROST RFC 9591) для ${id}` }]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const oordeelEtappe4 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-005 Етап 4: перевірюваний поділ секретів, проактивні епохи та порогові підписи FROST',
    fase: 4,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('Етап 4 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe4.goedgekeurd === true && oordeelEtappe4.fouten.length === 0);

  const et4Uk = 'docs/hub/ПЛЮЩ-ЕТАП-4-РОЗПОДІЛЕНІ-КЛЮЧІ-ТА-ПОРОГОВІ-ПІДПИСИ.uk.md';
  const et4Md = 'docs/hub/ПЛЮЩ-ЕТАП-4-РОЗПОДІЛЕНІ-КЛЮЧІ-ТА-ПОРОГОВІ-ПІДПИСИ.md';
  const et4Nl = 'docs/hub/KLIMOP-FASE-4-GEDISTRIBUEERDE-SLEUTELS-EN-DREMPELHANDTEKENINGEN.nl.md';

  check('двомовні документи Етапу 4 та полігон klimop-etappe4-frost-proef.mjs існують і містять усі ключові складники',
    [et4Uk, et4Md, et4Nl, 'scripts/klimop-etappe4-frost-proef.mjs'].every((p) => existsSync(p))
    && lees(et4Uk) === lees(et4Md)
    && ['RFC 9591', 'splitsMetFeldmanVss', 'splitsMetPedersenVss', 'drempelsleutels.ts', 'klimop-drempel-client.ts']
      .every((s) => lees(et4Uk).includes(s) && lees(et4Nl).includes(s)));

  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check('досьє ecosysteem-klimop.json фіксує злитий запит №186 (KLIMOP-004), нову задачу KLIMOP-005 та щонайменше 12 активних можливостей',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-004' && w.pr === 186)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-005')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 12);

  const bestandenKlimop005 = [
    'shared/klimop/drempelsleutels.ts',
    'backend/klimop-drempel-client.ts',
    'backend/klimop-knooppunt-agent.ts',
    'scripts/klimop-etappe4-frost-proef.mjs',
    et4Uk,
    et4Nl,
    'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md',
    'docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md',
    'orchestratie/onderwerpen/ecosysteem-klimop.json',
    'orchestratie/onderwerpen/verdeelde-versleutelde-opslag.json',
    '.agents/skills/klimop-architectuur/SKILL.md',
    '.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md',
    '.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md',
    'docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md',
    'docs/INDEX.nl.md',
    'ОГЛЯД-ПРОЄКТУ.uk.md',
    'PROJECTOVERZICHT.nl.md',
    'ПЛАН-ПЕРЕНЕСЕННЯ.uk.md',
    'PORTEERPLAN.nl.md',
    'tests/eenheid/klimop-005-etappe4-drempelsleutels-20261120.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop005.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі нові та оновлені файли KLIMOP-005 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
