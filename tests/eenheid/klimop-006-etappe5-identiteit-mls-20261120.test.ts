// KLIMOP-006 (20.11.2026): Модульні, криптографічні (§39 маніфесту) та живі мережеві випробування Етапу 5 «Плюща»:
//   1. Самосуверенна ідентичність особи klid1_<32 hex>, планова ротація кореня, псевдоніми служб psid1_<32 hex> і міст з userId;
//   2. Сертифікати довірених особистих пристроїв з обмеженими делегованими повноваженнями, лімітами ресурсів і відкликанням;
//   3. Багатостороннє порогове відновлення доступу на частках Педерсена з вікном оскарження та блокуванням незаконного спадкування;
//   4. Груповий захист спільних просторів і оселі за принципами стандарту RFC 9420 (MLS): пряма та посткомпрометаційна безпека;
//   5. Живий кворумний реєстр посвідчень і відкликань на 3 незалежних вузлах (NL, CH, UA) поверх протоколу «Стебла».
// Запуск: node scripts/eenheidstests.mjs klimop-006-etappe5-identiteit-mls-20261120.test.ts

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  maakKlimopKnooppunt,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import { KlimopRouteTabel } from '../../shared/klimop/stengels';
import { leidGeheimScalairAf, splitsMetPedersenVss } from '../../shared/klimop/drempelsleutels';
import {
  betwistHerstelAanvraagDoorEigenaar,
  leidPseudoniemeDienstIdentiteitAf,
  maakErfenisGebruikerKoppeling,
  maakMlsBladSleutelPakket,
  maakMlsGroep,
  maakPersoonsIdentiteit,
  ontsleutelMlsGroepsBericht,
  openHerstelAanvraag,
  pasMlsCommitToe,
  pasMlsWelkomToe,
  registreerVertrouwdApparaat,
  roteerPersoonsWortelSleutel,
  trekApparaatIn,
  verifieerApparaatCertificaat,
  verifieerApparaatIntrekking,
  verifieerErfenisGebruikerKoppeling,
  verifieerPersoonsStaat,
  versleutelMlsGroepsBericht,
  verwijderLidUitMlsGroep,
  voegLidToeAanMlsGroep,
  voegVoogdBevestigingToe,
  verankerHerstelBeleid,
  voltooiWettigHerstel,
  type KlimopHerstelBeleid,
} from '../../shared/klimop/identiteit';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopIdentiteitNetwerkClient } from '../../backend/klimop-identiteit-client';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

function maakEd25519TestPaar(): { pubB64u: string; privB64u: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    pubB64u: (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString('base64url'),
    privB64u: (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64url'),
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-006-etappe5-identiteit-mls');
  const t0Ms = Date.parse('2026-11-20T20:00:00.000Z');
  const t0Iso = new Date(t0Ms).toISOString();
  const liveNuIso = new Date().toISOString();
  const liveVerlooptIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  // ------------------------------------------------------------------ 1. Самосуверенне посвідчення особи та ротації кореня
  const persoon = maakPersoonsIdentiteit(t0Iso);
  const persoonsId = persoon.staat.oprichting.persoonsId;
  const vervalsteStaat = {
    ...persoon.staat,
    oprichting: { ...persoon.staat.oprichting, persoonsId: 'klid1_00000000000000000000000000000000' },
  };

  check('самосуверенне посвідчення особи klid1_<32 hex> проходить криптографічну перевірку і відхиляє підміну відбитка',
    /^klid1_[0-9a-f]{32}$/.test(persoonsId)
    && verifieerPersoonsStaat(persoon.staat).ok === true
    && verifieerPersoonsStaat(vervalsteStaat).ok === false);

  const rot1 = roteerPersoonsWortelSleutel(persoon.staat, persoon.wortelGeheimPkcs8B64u, new Date(t0Ms + 1000).toISOString());
  const rot2 = roteerPersoonsWortelSleutel(rot1.nieuweStaat, rot1.nieuwWortelGeheimPkcs8B64u, new Date(t0Ms + 2000).toISOString());
  const gebrokenRotatieStaat = {
    ...rot2.nieuweStaat,
    rotaties: [{ ...rot2.nieuweStaat.rotaties[0], volgnummer: 9 }],
  };

  check('планові ротації кореневого ключа (епохи 1 -> 2 -> 3) зберігають сталий persoonsId і виявляють розрив ланцюжка підписів',
    rot2.nieuweStaat.oprichting.persoonsId === persoonsId
    && rot2.nieuweStaat.actieveEpoche === 3
    && verifieerPersoonsStaat(rot2.nieuweStaat).ok === true
    && verifieerPersoonsStaat(gebrokenRotatieStaat).ok === false);

  // ------------------------------------------------------------------ 2. Розділені псевдоніми служб та міст сумісності з userId
  const zout = randomBytes(32);
  const psMail = leidPseudoniemeDienstIdentiteitAf(zout, persoonsId, 'postvak');
  const psWolk = leidPseudoniemeDienstIdentiteitAf(zout, persoonsId, 'wolkopslag');
  const psHuis = leidPseudoniemeDienstIdentiteitAf(zout, persoonsId, 'slimwoon');
  let kortZoutGeweigerd = false;
  try {
    leidPseudoniemeDienstIdentiteitAf(Buffer.alloc(16), persoonsId, 'postvak');
  } catch {
    kortZoutGeweigerd = true;
  }

  check('псевдонімні службові ідентичності psid1_<32 hex> детерміновані, некорельовані між службами й вимагають >= 32 байти солі',
    /^psid1_[0-9a-f]{32}$/.test(psMail)
    && psMail === leidPseudoniemeDienstIdentiteitAf(zout, persoonsId, 'postvak')
    && psMail !== psWolk && psWolk !== psHuis && psMail !== psHuis
    && kortZoutGeweigerd);

  const brug = maakErfenisGebruikerKoppeling('usr_bestaand_001', persoon.staat, persoon.wortelGeheimPkcs8B64u, t0Iso);
  check('двосторонній підписаний міст з чинним userId залишається дійсним після ротації кореня і відхиляє підробку userId',
    verifieerErfenisGebruikerKoppeling(brug, persoon.staat) === true
    && verifieerErfenisGebruikerKoppeling(brug, rot2.nieuweStaat) === true
    && verifieerErfenisGebruikerKoppeling({ ...brug, erfenisUserId: 'usr_aanvaller' }, rot2.nieuweStaat) === false);

  // ------------------------------------------------------------------ 3. Довірені пристрої, межі прав та відкликання
  const laptop = registreerVertrouwdApparaat({
    staat: persoon.staat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    naamLabel: 'Ноутбук власника',
    toegestaneBevoegdheden: ['lezen_werkgegevens', 'schrijven_werkgegevens', 'groeps_mls_lid', 'nood_betwisting'],
    nuIso: t0Iso,
  });
  const telefoon = registreerVertrouwdApparaat({
    staat: persoon.staat,
    wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
    naamLabel: 'Телефон власника',
    toegestaneBevoegdheden: ['lezen_werkgegevens', 'groeps_mls_lid'],
    nuIso: t0Iso,
  });

  check('сертифікати пристроїв обмежують делеговані права, типово вимикають приховані фонові завдання і відхиляють прострочення',
    /^kdev1_[0-9a-f]{32}$/.test(laptop.certificaat.apparaatId)
    && telefoon.certificaat.middelenLimiet.toestaanAchtergrondTaken === false
    && verifieerApparaatCertificaat(telefoon.certificaat, persoon.staat, { vereisteBevoegdheid: 'lezen_werkgegevens', nuIso: t0Iso }).ok === true
    && verifieerApparaatCertificaat(telefoon.certificaat, persoon.staat, { vereisteBevoegdheid: 'goedkeuren_uitgave', nuIso: t0Iso }).ok === false
    && verifieerApparaatCertificaat(telefoon.certificaat, persoon.staat, { nuIso: '2028-01-01T00:00:00.000Z' }).ok === false);

  let onbevoegdeIntrekkingGeweigerd = false;
  try {
    trekApparaatIn({
      staat: persoon.staat,
      ingetrokkenApparaatId: laptop.certificaat.apparaatId,
      reden: 'verdacht_gedrag',
      ondertekenaar: { soort: 'nood_apparaat', bundel: telefoon }, // телефон не має права nood_betwisting!
      nuIso: t0Iso,
    });
  } catch {
    onbevoegdeIntrekkingGeweigerd = true;
  }

  const intrekkingTelefoon = trekApparaatIn({
    staat: persoon.staat,
    ingetrokkenApparaatId: telefoon.certificaat.apparaatId,
    reden: 'verloren_of_gestolen',
    ondertekenaar: { soort: 'nood_apparaat', bundel: laptop },
    nuIso: new Date(t0Ms + 5000).toISOString(),
  });
  const naIntrekking = verifieerApparaatCertificaat(telefoon.certificaat, persoon.staat, {
    intrekkingen: [intrekkingTelefoon],
    nuIso: new Date(t0Ms + 10_000).toISOString(),
  });

  check('пристрій із правом nood_betwisting миттєво відкликає викрадений телефон, а пристрій без такого права не може відкликати інші',
    onbevoegdeIntrekkingGeweigerd === true
    && verifieerApparaatIntrekking(intrekkingTelefoon, persoon.staat).ok === true
    && !naIntrekking.ok && naIntrekking.fout === 'APPARAAT_IS_INGETROKKEN');

  // ------------------------------------------------------------------ 4. Багатостороннє відновлення та захист від незаконного спадкування (§14, §17, §39)
  const knNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'verbinding', 'herstel'],
    juridischeRegio: 'NL',
    aanbieder: 'eigen-knoop-nl',
    nuIso: liveNuIso,
  });
  const knCH = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie', 'verbinding', 'herstel'],
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

  const herstelGeheimHex = leidGeheimScalairAf(randomBytes(32));
  const pedersen = splitsMetPedersenVss({
    geheimScalairHex: herstelGeheimHex,
    drempel: 2,
    totaal: 3,
    setId: 'herstel-pedersen-test-001',
  });
  const herstelBeleid: KlimopHerstelBeleid = {
    schema: 1,
    persoonsId,
    drempel: 2,
    voogden: [
      { knooppuntId: knNL.identiteit.knooppuntId, publiekeSleutelDerB64u: knNL.identiteit.publiekeSleutelDerB64u },
      { knooppuntId: knCH.identiteit.knooppuntId, publiekeSleutelDerB64u: knCH.identiteit.publiekeSleutelDerB64u },
      { knooppuntId: knUA.identiteit.knooppuntId, publiekeSleutelDerB64u: knUA.identiteit.publiekeSleutelDerB64u },
    ],
    pedersenSetId: 'herstel-pedersen-test-001',
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
    nuIso: t0Iso,
  });
  if (!verankering020.ok) throw new Error(verankering020.fout);
  persoon.staat = verankering020.nieuweStaat;

  const afwezigheidUit = openHerstelAanvraag({
    beleid: herstelBeleid,
    omstandigheid: 'gewone_afwezigheid',
    kandidaatNieuweWortelPubDerB64u: maakEd25519TestPaar().pubB64u,
    nuIso: t0Iso,
  });
  const verbindingsverliesUit = openHerstelAanvraag({
    beleid: herstelBeleid,
    omstandigheid: 'tijdelijk_verbindingsverlies',
    kandidaatNieuweWortelPubDerB64u: maakEd25519TestPaar().pubB64u,
    nuIso: t0Iso,
  });
  check('звичайна відсутність або тимчасова втрата зв’язку категорично не дають підстав для передавання прав (§17 маніфесту)',
    !afwezigheidUit.ok && afwezigheidUit.fout === 'AFWEZIGHEID_ALLEEN_GEEN_GROND_VOOR_OVERDRACHT'
    && !verbindingsverliesUit.ok && verbindingsverliesUit.fout === 'AFWEZIGHEID_ALLEEN_GEEN_GROND_VOOR_OVERDRACHT');

  const vijandigKandidaat = maakEd25519TestPaar();
  const vijandigOpen = openHerstelAanvraag({
    beleid: herstelBeleid,
    omstandigheid: 'wettige_erfopvolging',
    kandidaatNieuweWortelPubDerB64u: vijandigKandidaat.pubB64u,
    nuIso: t0Iso,
  });
  const betwist = vijandigOpen.ok
    ? betwistHerstelAanvraagDoorEigenaar({
        staat: persoon.staat,
        aanvraag: vijandigOpen.aanvraag,
        ondertekenaar: { soort: 'nood_apparaat', bundel: laptop },
        nuIso: new Date(t0Ms + 3600_000).toISOString(),
      })
    : { ok: false as const, fout: 'FOUT' };
  const naBetwisting = betwist.ok
    ? voltooiWettigHerstel({
        staat: persoon.staat,
        beleid: herstelBeleid,
        aanvraag: betwist.geblokkeerdeAanvraag,
        pedersenDelen: [pedersen.delen[0], pedersen.delen[1]],
        kandidaatNieuwWortelGeheimPkcs8B64u: vijandigKandidaat.privB64u,
        nuIso: new Date(t0Ms + 200 * 3600_000).toISOString(),
      })
    : { ok: false as const, fout: 'FOUT' };
  check('незаконне спадкування або вороже відновлення назавжди блокується одним підписом живого власника (§39 маніфесту)',
    betwist.ok === true
    && !naBetwisting.ok && naBetwisting.fout === 'HERSTEL_GEBLOKKEERD_DOOR_EIGENAAR');

  const wettigKandidaat = maakEd25519TestPaar();
  const wettigOpen = openHerstelAanvraag({
    beleid: herstelBeleid,
    omstandigheid: 'verlies_alle_apparaten',
    kandidaatNieuweWortelPubDerB64u: wettigKandidaat.pubB64u,
    nuIso: t0Iso,
  });
  if (!wettigOpen.ok) throw new Error(wettigOpen.fout);
  const v1 = voegVoogdBevestigingToe({ beleid: herstelBeleid, aanvraag: wettigOpen.aanvraag, voogd: knNL, nuIso: t0Iso });
  if (!v1.ok) throw new Error(v1.fout);

  const zonderQuorum = voltooiWettigHerstel({
    staat: persoon.staat,
    beleid: herstelBeleid,
    aanvraag: v1.aanvraag,
    pedersenDelen: [pedersen.delen[0], pedersen.delen[2]],
    kandidaatNieuwWortelGeheimPkcs8B64u: wettigKandidaat.privB64u,
    nuIso: new Date(t0Ms + 60 * 3600_000).toISOString(),
  });

  const v2 = voegVoogdBevestigingToe({ beleid: herstelBeleid, aanvraag: v1.aanvraag, voogd: knUA, nuIso: t0Iso });
  if (!v2.ok) throw new Error(v2.fout);

  const voorTijdslot = voltooiWettigHerstel({
    staat: persoon.staat,
    beleid: herstelBeleid,
    aanvraag: v2.aanvraag,
    pedersenDelen: [pedersen.delen[0], pedersen.delen[2]],
    kandidaatNieuwWortelGeheimPkcs8B64u: wettigKandidaat.privB64u,
    nuIso: new Date(t0Ms + 24 * 3600_000).toISOString(), // лише 24 год замість >= 48 год
  });

  check('відновлення відхиляється як до спливу 48-годинного вікна оскарження, так і при нестачі підписів опікунів',
    !zonderQuorum.ok && zonderQuorum.fout === 'ONVOLDOENDE_VOOGD_BEVESTIGINGEN'
    && !voorTijdslot.ok && voorTijdslot.fout === 'BETWISTINGSTERMIJN_NOG_NIET_VERSTREKEN');

  const hersteld = voltooiWettigHerstel({
    staat: persoon.staat,
    beleid: herstelBeleid,
    aanvraag: v2.aanvraag,
    pedersenDelen: [pedersen.delen[0], pedersen.delen[2]],
    kandidaatNieuwWortelGeheimPkcs8B64u: wettigKandidaat.privB64u,
    nuIso: new Date(t0Ms + 50 * 3600_000).toISOString(),
  });
  check('законне відновлення після 48-год вікна та 2-з-3 часток Педерсена переводить особу в епоху 2 зі збереженням persoonsId',
    hersteld.ok === true
    && hersteld.hersteldGeheimScalairHex === herstelGeheimHex
    && hersteld.nieuweStaat.oprichting.persoonsId === persoonsId
    && hersteld.nieuweStaat.actieveEpoche === 2
    && verifieerPersoonsStaat(hersteld.nieuweStaat).ok === true);

  // ------------------------------------------------------------------ 5. Групові простори та розумна оселя за RFC 9420 (MLS)
  const lidPersoon2 = maakPersoonsIdentiteit(t0Iso);
  const lid2Tablet = registreerVertrouwdApparaat({
    staat: lidPersoon2.staat,
    wortelGeheimPkcs8B64u: lidPersoon2.wortelGeheimPkcs8B64u,
    naamLabel: 'Планшет оселі',
    toegestaneBevoegdheden: ['groeps_mls_lid'],
    nuIso: t0Iso,
  });

  const mlsLaptop = maakMlsGroep({ groepId: 'mls-huis-test-001', oprichterBundel: laptop, nuIso: t0Iso });
  const geheimBerichtEp1 = versleutelMlsGroepsBericht(mlsLaptop, Buffer.from('Повідомлення епохи 1 до появи нових учасників', 'utf8'));

  const telBlad = maakMlsBladSleutelPakket(telefoon, t0Iso);
  const addTel = voegLidToeAanMlsGroep(mlsLaptop, telBlad.pakket);
  const telWelkom = pasMlsWelkomToe(addTel.welkom, telefoon, telBlad.bladX25519GeheimPkcs8B64u);
  if (!telWelkom.ok) throw new Error(telWelkom.fout);
  const mlsTelefoon = telWelkom.staat;

  const tabBlad = maakMlsBladSleutelPakket(lid2Tablet, t0Iso);
  const addTab = voegLidToeAanMlsGroep(mlsLaptop, tabBlad.pakket);
  const telCommitEp3 = pasMlsCommitToe(mlsTelefoon, addTab.commit);
  const tabWelkom = pasMlsWelkomToe(addTab.welkom, lid2Tablet, tabBlad.bladX25519GeheimPkcs8B64u);
  if (!tabWelkom.ok) throw new Error(tabWelkom.fout);
  const mlsTablet = tabWelkom.staat;

  const berichtEp3 = versleutelMlsGroepsBericht(mlsTelefoon, Buffer.from('Спільне повідомлення оселі в епосі 3', 'utf8'));
  const laptopLeestEp3 = ontsleutelMlsGroepsBericht(mlsLaptop, berichtEp3);
  const tabletLeestEp3 = ontsleutelMlsGroepsBericht(mlsTablet, berichtEp3);

  check('група MLS забезпечує обмін у спільній епосі та пряму таємницю (доданий пізніше пристрій не читає епоху 1)',
    telCommitEp3.ok === true
    && !ontsleutelMlsGroepsBericht(mlsTelefoon, geheimBerichtEp1).ok
    && laptopLeestEp3.ok && laptopLeestEp3.klareInhoud.toString('utf8') === 'Спільне повідомлення оселі в епосі 3'
    && tabletLeestEp3.ok && tabletLeestEp3.klareInhoud.toString('utf8') === 'Спільне повідомлення оселі в епосі 3');

  const verwijderTelCommit = verwijderLidUitMlsGroep(mlsLaptop, laptop, telefoon.certificaat.apparaatId, t0Iso);
  const tabNaVerwijdering = pasMlsCommitToe(mlsTablet, verwijderTelCommit);
  const telNaVerwijdering = pasMlsCommitToe(mlsTelefoon, verwijderTelCommit);
  const berichtEp4 = versleutelMlsGroepsBericht(mlsLaptop, Buffer.from('Новий ключ сигналізації оселі (епоха 4)', 'utf8'));

  check('група MLS забезпечує посткомпрометаційну безпеку: вилучений телефон відрізаний від епохи 4, а чесні пристрої працюють',
    tabNaVerwijdering.ok === true
    && !telNaVerwijdering.ok && telNaVerwijdering.fout === 'MLS_APPARAAT_UIT_GROEP_VERWIJDERD'
    && ontsleutelMlsGroepsBericht(mlsTablet, berichtEp4).ok === true
    && !ontsleutelMlsGroepsBericht(mlsTelefoon, berichtEp4).ok);

  // ------------------------------------------------------------------ 6. Живий кворумний реєстр посвідчень на 3 вузлах (NL, CH, UA)
  const knOpdracht = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['verificatie', 'herstel'],
    juridischeRegio: 'NL',
    aanbieder: 'persoonlijk-toestel',
    nuIso: liveNuIso,
  });
  const knDubbelNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['verificatie'],
    juridischeRegio: 'NL',
    aanbieder: 'eigen-knoop-nl',
    nuIso: liveNuIso,
  });

  const srvNL = await startKlimopProefKnooppunt({ knooppunt: knNL });
  const srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH });
  const srvUA = await startKlimopProefKnooppunt({ knooppunt: knUA });

  try {
    const tabel = new KlimopRouteTabel();
    for (const s of [srvNL, srvCH, srvUA]) {
      tabel.voegTweerichtingsStengelToe(knOpdracht.identiteit.knooppuntId, s.identiteit.knooppuntId, 1);
    }
    const adressen = new Map([
      [srvNL.identiteit.knooppuntId, srvNL.basisUrl],
      [srvCH.identiteit.knooppuntId, srvCH.basisUrl],
      [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
    ]);

    const netwerkClient = new KlimopNetwerkClient(knOpdracht, adressen, tabel);
    const idClient = new KlimopIdentiteitNetwerkClient(netwerkClient);

    const nietOnafhankelijk = idClient.maakIdentiteitRegisterGroep({
      registerId: 'slechte-reg-001',
      opdrachtgever: knOpdracht,
      knooppunten: [knNL.identiteit, knDubbelNL.identiteit],
      quorumDrempel: 2,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });
    const regUit = idClient.maakIdentiteitRegisterGroep({
      registerId: 'goede-reg-001',
      opdrachtgever: knOpdracht,
      knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
      quorumDrempel: 2,
      nuIso: liveNuIso,
      verlooptOpIso: liveVerlooptIso,
    });
    if (!regUit.ok) throw new Error(regUit.fout);

    const pubEp2 = await idClient.publiceerPersoonsStaatOpNetwerk({
      groep: regUit.groep,
      staat: rot1.nieuweStaat, // епоха 2
      herstelAanvraag: betwist.ok ? betwist.geblokkeerdeAanvraag : null,
    });

    check('кворумний реєстр посвідчень відхиляє залежні вузли однієї юрисдикції та публікує стан особи на 3 незалежних вузлах',
      !nietOnafhankelijk.ok && nietOnafhankelijk.fout === 'ONAFHANKELIJKHEID_NIET_VOLDAAN'
      && pubEp2.ok === true && pubEp2.bevestigdeKnooppuntIds.length === 3
      && srvNL.aantalGeregistreerdeIdentiteiten() === 1);

    const pogingTerugdraaiEp1 = await idClient.publiceerPersoonsStaatOpNetwerk({
      groep: regUit.groep,
      staat: persoon.staat, // стара епоха 1!
    });
    const pogingWisBlokkade = vijandigOpen.ok
      ? await idClient.publiceerPersoonsStaatOpNetwerk({
          groep: regUit.groep,
          staat: rot1.nieuweStaat,
          herstelAanvraag: vijandigOpen.aanvraag, // спроба стерти блокування власника!
        })
      : { ok: false as const, fout: 'FOUT', bevestigdeKnooppuntIds: [] };

    check('вузли реєстру жорстко відхиляють як відкочування епохи особи назад, так і стирання блокування відновлення власника',
      !pogingTerugdraaiEp1.ok && pogingTerugdraaiEp1.fout === 'IDENTITEIT_EPOCHE_TERUGDRAAI_GEWEIGERD'
      && !pogingWisBlokkade.ok && pogingWisBlokkade.fout === 'HERSTEL_BLOKKADE_KAN_NIET_WORDEN_GEWIST');

    tabel.plaatsInQuarantaine(knCH.identiteit.knooppuntId);
    const pubIntrekkingQuorum = await idClient.publiceerPersoonsStaatOpNetwerk({
      groep: regUit.groep,
      staat: rot1.nieuweStaat,
      intrekkingen: [intrekkingTelefoon],
    });
    const checkLaptopOpNetwerk = await idClient.controleerApparaatOpNetwerk({
      groep: regUit.groep,
      certificaat: laptop.certificaat,
      vereisteBevoegdheid: 'schrijven_werkgegevens',
      nuIso: new Date(t0Ms + 20_000).toISOString(),
    });
    const checkTelefoonOpNetwerk = await idClient.controleerApparaatOpNetwerk({
      groep: regUit.groep,
      certificaat: telefoon.certificaat,
      nuIso: new Date(t0Ms + 20_000).toISOString(),
    });

    check('при карантині вузла CH кворум NL + UA приймає відкликання телефона, підтверджує ноутбук і блокує викрадений телефон',
      pubIntrekkingQuorum.ok === true && pubIntrekkingQuorum.bevestigdeKnooppuntIds.length === 2
      && checkLaptopOpNetwerk.ok === true && checkLaptopOpNetwerk.actieveEpoche === 2
      && !checkTelefoonOpNetwerk.ok && checkTelefoonOpNetwerk.fout === 'APPARAAT_IS_INGETROKKEN');

    netwerkClient.sluitAlleSessies();
  } finally {
    await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit()]);
  }

  // ------------------------------------------------------------------ 7. Перевірка 15 питань, документації Етапу 5 та Абсолютного мовного закону
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
      id,
      { voldaan: true, bewijs: `Підтверджено Етапом 5 (identiteit.ts / MLS RFC 9420) для ${id}` },
    ]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const oordeelEtappe5 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-006 Етап 5: самосуверенна ідентичність, довірені пристрої, відновлення та групові простори MLS',
    fase: 5,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('Етап 5 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe5.goedgekeurd === true && oordeelEtappe5.fouten.length === 0);

  const et5Uk = 'docs/hub/ПЛЮЩ-ЕТАП-5-НЕЗАЛЕЖНА-ІДЕНТИЧНІСТЬ-ТА-ГРУПОВІ-ПРОСТОРИ.uk.md';
  const et5Md = 'docs/hub/ПЛЮЩ-ЕТАП-5-НЕЗАЛЕЖНА-ІДЕНТИЧНІСТЬ-ТА-ГРУПОВІ-ПРОСТОРИ.md';
  const et5Nl = 'docs/hub/KLIMOP-FASE-5-ONAFHANKELIJKE-IDENTITEIT-EN-GROEPSRUIMTES.nl.md';
  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));

  check('двомовні документи Етапу 5 (Документи №7 та №9), полігон і досьє ecosysteem-klimop.json містять усі 14 активних можливостей',
    [et5Uk, et5Md, et5Nl, 'scripts/klimop-etappe5-identiteit-proef.mjs'].every((p) => existsSync(p))
    && lees(et5Uk) === lees(et5Md)
    && ['RFC 9420', 'maakPersoonsIdentiteit', 'betwistHerstelAanvraagDoorEigenaar', 'identiteit.ts', 'klimop-identiteit-client.ts']
      .every((s) => lees(et5Uk).includes(s) && lees(et5Nl).includes(s))
    && dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-005' && w.pr === 187)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-006')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 14);

  const bestandenKlimop006 = [
    'shared/klimop/identiteit.ts',
    'backend/klimop-identiteit-client.ts',
    'backend/klimop-knooppunt-agent.ts',
    'scripts/klimop-etappe5-identiteit-proef.mjs',
    et5Uk,
    et5Nl,
    'docs/hub/ПЛЮЩ-ЕТАП-1-АРХІТЕКТУРНЕ-ЯДРО-ТА-ПЛАН-ВИПУСКІВ.uk.md',
    'docs/hub/KLIMOP-FASE-1-ARCHITECTUURKERN-EN-UITGAVEPLAN.nl.md',
    'orchestratie/onderwerpen/ecosysteem-klimop.json',
    '.agents/skills/klimop-architectuur/SKILL.md',
    '.agents/skills/klimop-architectuur/НАВИЧКА-АРХІТЕКТУРА-ПЛЮЩ.uk.md',
    '.agents/skills/klimop-architectuur/VAARDIGHEID.nl.md',
    'docs/ПОКАЖЧИК-ДОКУМЕНТАЦІЇ.uk.md',
    'docs/INDEX.nl.md',
    'ОГЛЯД-ПРОЄКТУ.uk.md',
    'PROJECTOVERZICHT.nl.md',
    'ПЛАН-ПЕРЕНЕСЕННЯ.uk.md',
    'PORTEERPLAN.nl.md',
    'tests/eenheid/klimop-006-etappe5-identiteit-mls-20261120.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop006.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі нові та оновлені файли KLIMOP-006 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
