#!/usr/bin/env node
// KLIMOP-006 (20.11.2026, Етап 5 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний сценарій полігона Етапу 5 (працює виключно локально на 127.0.0.1, без звернень до робочого сервера чи PostgreSQL):
//   1. Самосуверенна ідентичність klid1_<32 hex>, псевдонімні службові ідентичності psid1_<32 hex> та міст сумісності з чинним userId.
//   2. Довірені особисті пристрої (ноутбук і телефон) із чітко обмеженими правами без передавання кореневого ключа та кворумний реєстр на 3 вузлах (NL, CH, UA).
//   3. Груповий простір оселі за принципами стандарту RFC 9420 (MLS): пряма таємниця при додаванні учасника та посткомпрометаційна безпека при вилученні викраденого телефона.
//   4. Захист від незаконного спадкування чи ворожого перехоплення процедури відновлення: блокування заявки одним підписом живого власника.
//   5. Законне багатостороннє відновлення при втраті всіх пристроїв: кворум 2-з-3 опікунів + 48-годинне вікно оскарження + приховувальні частки Педерсена зі збереженням persoonsId.
// Запуск: node scripts/klimop-etappe5-identiteit-proef.mjs [--json]

import { build } from 'esbuild';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function voerEtappe5ProefUit() {
  await mkdir('rapporten', { recursive: true });
  const tijdelijkeMap = await mkdtemp(join('rapporten', 'klimop-etappe5-proef-'));
  const bundelPad = resolve(tijdelijkeMap, 'etappe5-bundel.mjs');

  try {
    await build({
      stdin: {
        contents: `
          export * from './shared/klimop/kern.ts';
          export * from './shared/klimop/stengels.ts';
          export * from './shared/klimop/drempelsleutels.ts';
          export * from './shared/klimop/identiteit.ts';
          export * from './backend/klimop-knooppunt-agent.ts';
          export * from './backend/klimop-identiteit-client.ts';
        `,
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      outfile: bundelPad,
    });

    const m = await import(pathToFileURL(bundelPad).href);
    const t0Ms = Date.parse('2026-11-20T20:00:00.000Z');
    const nuIso = new Date().toISOString();
    const verlooptOpIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    const knToestel = m.maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['verificatie', 'herstel'],
      juridischeRegio: 'NL',
      aanbieder: 'persoonlijk-toestel-eigenaar',
      nuIso,
    });
    const knNL = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'verbinding', 'herstel'],
      juridischeRegio: 'NL',
      aanbieder: 'eigen-knoop-nl',
      nuIso,
    });
    const knCH = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'verbinding', 'herstel'],
      juridischeRegio: 'CH',
      aanbieder: 'alpen-knoop-ch',
      nuIso,
    });
    const knUA = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'verbinding', 'herstel'],
      juridischeRegio: 'UA',
      aanbieder: 'kyiv-knoop-ua',
      nuIso,
    });

    const srvNL = await m.startKlimopProefKnooppunt({ knooppunt: knNL });
    const srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knCH });
    const srvUA = await m.startKlimopProefKnooppunt({ knooppunt: knUA });

    try {
      const tabel = new m.KlimopRouteTabel();
      for (const s of [srvNL, srvCH, srvUA]) {
        tabel.voegTweerichtingsStengelToe(knToestel.identiteit.knooppuntId, s.identiteit.knooppuntId, 1);
      }
      const adressen = new Map([
        [srvNL.identiteit.knooppuntId, srvNL.basisUrl],
        [srvCH.identiteit.knooppuntId, srvCH.basisUrl],
        [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
      ]);

      const netwerkClient = new m.KlimopNetwerkClient(knToestel, adressen, tabel);
      const idClient = new m.KlimopIdentiteitNetwerkClient(netwerkClient);

      const regGroepUit = idClient.maakIdentiteitRegisterGroep({
        registerId: 'id-reg-proef-001',
        opdrachtgever: knToestel,
        knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
        quorumDrempel: 2,
        nuIso,
        verlooptOpIso,
      });
      if (!regGroepUit.ok) throw new Error(`Збій реєстру ідентичності: ${regGroepUit.fout}`);

      // 1. Самосуверенна ідентичність особи + псевдоніми служб + міст із чинним userId
      const eigenaar = m.maakPersoonsIdentiteit(new Date(t0Ms).toISOString());
      const huisgenoot = m.maakPersoonsIdentiteit(new Date(t0Ms).toISOString());
      const zout = randomBytes(32);
      const pseudoMail = m.leidPseudoniemeDienstIdentiteitAf(zout, eigenaar.staat.oprichting.persoonsId, 'postvak');
      const pseudoOpslag = m.leidPseudoniemeDienstIdentiteitAf(zout, eigenaar.staat.oprichting.persoonsId, 'wolkopslag');
      const pseudoniemenGescheiden = pseudoMail.startsWith('psid1_') && pseudoOpslag.startsWith('psid1_') && pseudoMail !== pseudoOpslag;

      const erfenisBrug = m.maakErfenisGebruikerKoppeling(
        'usr_pavlo_bestaand_001',
        eigenaar.staat,
        eigenaar.wortelGeheimPkcs8B64u,
        new Date(t0Ms).toISOString(),
      );

      // 2. Два довірені пристрої власника (ноутбук і телефон) + пристрій співмешканця
      const laptop = m.registreerVertrouwdApparaat({
        staat: eigenaar.staat,
        wortelGeheimPkcs8B64u: eigenaar.wortelGeheimPkcs8B64u,
        naamLabel: 'Робочий ноутбук власника',
        toegestaneBevoegdheden: ['lezen_werkgegevens', 'schrijven_werkgegevens', 'groeps_mls_lid', 'nood_betwisting'],
        nuIso: new Date(t0Ms).toISOString(),
      });
      const telefoon = m.registreerVertrouwdApparaat({
        staat: eigenaar.staat,
        wortelGeheimPkcs8B64u: eigenaar.wortelGeheimPkcs8B64u,
        naamLabel: 'Кишеньковий телефон власника',
        toegestaneBevoegdheden: ['lezen_werkgegevens', 'groeps_mls_lid'],
        nuIso: new Date(t0Ms).toISOString(),
      });
      const huisgenootTablet = m.registreerVertrouwdApparaat({
        staat: huisgenoot.staat,
        wortelGeheimPkcs8B64u: huisgenoot.wortelGeheimPkcs8B64u,
        naamLabel: 'Планшет оселі',
        toegestaneBevoegdheden: ['groeps_mls_lid'],
        nuIso: new Date(t0Ms).toISOString(),
      });

      const pubInit = await idClient.publiceerPersoonsStaatOpNetwerk({
        groep: regGroepUit.groep,
        staat: eigenaar.staat,
      });
      if (!pubInit.ok) throw new Error(`Збій першої публікації: ${pubInit.fout}`);

      // 3. Груповий простір розумної оселі MLS (RFC 9420): пряма таємниця + вилучення викраденого телефона
      const mlsLaptop = m.maakMlsGroep({
        groepId: 'slimwoon-thuis-groep-001',
        oprichterBundel: laptop,
        nuIso: new Date(t0Ms).toISOString(),
      });
      // Повідомлення епохи 1 (ще до додавання телефона та планшета)
      const berichtEp1 = m.versleutelMlsGroepsBericht(mlsLaptop, Buffer.from('Історичний запис епохи 1', 'utf8'));

      const telBlad = m.maakMlsBladSleutelPakket(telefoon, new Date(t0Ms).toISOString());
      const addTel = m.voegLidToeAanMlsGroep(mlsLaptop, telBlad.pakket);
      const telWelkom = m.pasMlsWelkomToe(addTel.welkom, telefoon, telBlad.bladX25519GeheimPkcs8B64u);
      if (!telWelkom.ok) throw new Error(telWelkom.fout);
      const mlsTelefoon = telWelkom.staat;

      // Пряма таємниця: телефон, доданий в епосі 2, не може прочитати повідомлення епохи 1
      const voorwaartseGeheimhoudingOk = !m.ontsleutelMlsGroepsBericht(mlsTelefoon, berichtEp1).ok;

      const tabBlad = m.maakMlsBladSleutelPakket(huisgenootTablet, new Date(t0Ms).toISOString());
      const addTab = m.voegLidToeAanMlsGroep(mlsLaptop, tabBlad.pakket);
      if (!m.pasMlsCommitToe(mlsTelefoon, addTab.commit).ok) throw new Error('Збій MLS commit на телефоні');
      const tabWelkom = m.pasMlsWelkomToe(addTab.welkom, huisgenootTablet, tabBlad.bladX25519GeheimPkcs8B64u);
      if (!tabWelkom.ok) throw new Error(tabWelkom.fout);
      const mlsTablet = tabWelkom.staat;

      // Викрадення телефона: власник з ноутбука відкликає телефон (при карантинному CH кворум NL + UA приймає!)
      tabel.plaatsInQuarantaine(knCH.identiteit.knooppuntId);
      const telIntrekking = m.trekApparaatIn({
        staat: eigenaar.staat,
        ingetrokkenApparaatId: telefoon.certificaat.apparaatId,
        reden: 'verloren_of_gestolen',
        ondertekenaar: { soort: 'nood_apparaat', bundel: laptop },
        nuIso: new Date(t0Ms + 60_000).toISOString(),
      });
      const pubIntr = await idClient.publiceerPersoonsStaatOpNetwerk({
        groep: regGroepUit.groep,
        staat: eigenaar.staat,
        intrekkingen: [telIntrekking],
      });
      const telNetwerkControle = await idClient.controleerApparaatOpNetwerk({
        groep: regGroepUit.groep,
        certificaat: telefoon.certificaat,
        nuIso: new Date(t0Ms + 120_000).toISOString(),
      });
      const gestolenTelefoonGeweigerdOpNetwerk =
        pubIntr.ok && !telNetwerkControle.ok && telNetwerkControle.fout === 'APPARAAT_IS_INGETROKKEN';

      // Вилучення телефона з групи MLS (перехід в епоху 4 — посткомпрометаційна безпека!)
      const verwijderCommit = m.verwijderLidUitMlsGroep(
        mlsLaptop,
        laptop,
        telefoon.certificaat.apparaatId,
        new Date(t0Ms + 120_000).toISOString(),
      );
      const tabCommitOk = m.pasMlsCommitToe(mlsTablet, verwijderCommit).ok;
      const telKanCommitNietToepassen = !m.pasMlsCommitToe(mlsTelefoon, verwijderCommit).ok;
      const berichtEp4 = m.versleutelMlsGroepsBericht(
        mlsLaptop,
        Buffer.from('Код сигналізації оселі після вилучення телефона', 'utf8'),
      );
      const tabLeestEp4 = m.ontsleutelMlsGroepsBericht(mlsTablet, berichtEp4);
      const telLeestEp4 = m.ontsleutelMlsGroepsBericht(mlsTelefoon, berichtEp4);
      const postCompromisMlsOk =
        tabCommitOk && telKanCommitNietToepassen && tabLeestEp4.ok && !telLeestEp4.ok;

      tabel.haalUitQuarantaine(knCH.identiteit.knooppuntId);

      // 4. Захист від незаконного спадкування та ворожого відновлення (§17, §39)
      const herstelGeheimScalairHex = m.leidGeheimScalairAf(randomBytes(32));
      const pedersenPakket = m.splitsMetPedersenVss({
        geheimScalairHex: herstelGeheimScalairHex,
        setId: 'herstel-pedersen-001',
        drempel: 2,
        totaal: 3,
      });
      const herstelBeleid = {
        schema: 1,
        persoonsId: eigenaar.staat.oprichting.persoonsId,
        drempel: 2,
        voogden: [
          { knooppuntId: knNL.identiteit.knooppuntId, publiekeSleutelDerB64u: knNL.identiteit.publiekeSleutelDerB64u },
          { knooppuntId: knCH.identiteit.knooppuntId, publiekeSleutelDerB64u: knCH.identiteit.publiekeSleutelDerB64u },
          { knooppuntId: knUA.identiteit.knooppuntId, publiekeSleutelDerB64u: knUA.identiteit.publiekeSleutelDerB64u },
        ],
        pedersenSetId: 'herstel-pedersen-001',
        minimaleBetwistingsVensterUren: {
          verlies_alle_apparaten: 48,
          bevestigde_langdurige_onbeschikbaarheid: 168,
          wettige_erfopvolging: 168,
        },
      };
      // KLIMOP-020: політику відновлення закріплює корінь чинної епохи до втрати доступу
      const verankering020 = m.verankerHerstelBeleid({
        staat: eigenaar.staat,
        beleid: herstelBeleid,
        wortelGeheimPkcs8B64u: eigenaar.wortelGeheimPkcs8B64u,
        nuIso: new Date(t0Ms).toISOString(),
      });
      if (!verankering020.ok) throw new Error(verankering020.fout);
      eigenaar.staat = verankering020.nieuweStaat;

      const gewoneAfwezigheidGeweigerd = !m.openHerstelAanvraag({
        beleid: herstelBeleid,
        omstandigheid: 'gewone_afwezigheid',
        kandidaatNieuweWortelPubDerB64u: laptop.certificaat.apparaatTekenPubDerB64u,
        nuIso: new Date(t0Ms).toISOString(),
      }).ok;

      const vijandigPaar = generateKeyPairSync('ed25519');
      const vijandigPub = vijandigPaar.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
      const vijandigPriv = vijandigPaar.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url');
      const vijandigeAanvraagUit = m.openHerstelAanvraag({
        beleid: herstelBeleid,
        omstandigheid: 'wettige_erfopvolging',
        kandidaatNieuweWortelPubDerB64u: vijandigPub,
        nuIso: new Date(t0Ms).toISOString(),
      });
      if (!vijandigeAanvraagUit.ok) throw new Error(vijandigeAanvraagUit.fout);
      const betwistUit = m.betwistHerstelAanvraagDoorEigenaar({
        staat: eigenaar.staat,
        aanvraag: vijandigeAanvraagUit.aanvraag,
        ondertekenaar: { soort: 'nood_apparaat', bundel: laptop },
        nuIso: new Date(t0Ms + 3600_000).toISOString(),
      });
      const pogingNaBetwisting = m.voltooiWettigHerstel({
        staat: eigenaar.staat,
        beleid: herstelBeleid,
        aanvraag: betwistUit.geblokkeerdeAanvraag,
        pedersenDelen: [pedersenPakket.delen[0], pedersenPakket.delen[2]],
        kandidaatNieuwWortelGeheimPkcs8B64u: vijandigPriv,
        nuIso: new Date(t0Ms + 200 * 3600_000).toISOString(),
      });
      const onwettigeErfopvolgingGeblokkeerd =
        betwistUit.ok && !pogingNaBetwisting.ok && pogingNaBetwisting.fout === 'HERSTEL_GEBLOKKEERD_DOOR_EIGENAAR';

      // 5. Законне відновлення при втраті всіх пристроїв (2-з-3 опікунів + 48 год замок + частки Педерсена)
      const herstelWortelPaar = generateKeyPairSync('ed25519');
      const herstelWortelPub = herstelWortelPaar.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
      const herstelWortelPriv = herstelWortelPaar.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url');

      const wettigeAanvraagOpen = m.openHerstelAanvraag({
        beleid: herstelBeleid,
        omstandigheid: 'verlies_alle_apparaten',
        kandidaatNieuweWortelPubDerB64u: herstelWortelPub,
        nuIso: new Date(t0Ms + 7200_000).toISOString(),
      });
      if (!wettigeAanvraagOpen.ok) throw new Error(wettigeAanvraagOpen.fout);
      const s1 = m.voegVoogdBevestigingToe({
        beleid: herstelBeleid,
        aanvraag: wettigeAanvraagOpen.aanvraag,
        voogd: knNL,
        nuIso: new Date(t0Ms + 7500_000).toISOString(),
      });
      const s2 = m.voegVoogdBevestigingToe({
        beleid: herstelBeleid,
        aanvraag: s1.aanvraag,
        voogd: knUA,
        nuIso: new Date(t0Ms + 7600_000).toISOString(),
      });

      const teVroeg = m.voltooiWettigHerstel({
        staat: eigenaar.staat,
        beleid: herstelBeleid,
        aanvraag: s2.aanvraag,
        pedersenDelen: [pedersenPakket.delen[0], pedersenPakket.delen[2]],
        kandidaatNieuwWortelGeheimPkcs8B64u: herstelWortelPriv,
        nuIso: new Date(t0Ms + 12 * 3600_000).toISOString(),
      });
      const wettigVoltooid = m.voltooiWettigHerstel({
        staat: eigenaar.staat,
        beleid: herstelBeleid,
        aanvraag: s2.aanvraag,
        pedersenDelen: [pedersenPakket.delen[0], pedersenPakket.delen[2]],
        kandidaatNieuwWortelGeheimPkcs8B64u: herstelWortelPriv,
        nuIso: new Date(t0Ms + 52 * 3600_000).toISOString(),
      });
      if (!wettigVoltooid.ok) throw new Error(`Збій законного відновлення: ${wettigVoltooid.fout}`);

      const pubHersteld = await idClient.publiceerPersoonsStaatOpNetwerk({
        groep: regGroepUit.groep,
        staat: wettigVoltooid.nieuweStaat,
        intrekkingen: [telIntrekking],
        herstelAanvraag: wettigVoltooid.voltooideAanvraag,
      });
      // KLIMOP-022: після законного відновлення старий замінений корінь втрачає право прив'язки, а новий відновлений корінь перепідписує міст того самого userId
      const oudeErfenisBrugGeweigerd = !m.verifieerErfenisGebruikerKoppeling(erfenisBrug, wettigVoltooid.nieuweStaat);
      const hertekendeErfenisBrug = m.maakErfenisGebruikerKoppeling(
        'usr_pavlo_bestaand_001',
        wettigVoltooid.nieuweStaat,
        herstelWortelPriv,
        new Date(t0Ms + 52 * 3600_000 + 1000).toISOString(),
      );
      const erfenisBrugBlijftGeldig =
        oudeErfenisBrugGeweigerd
        && m.verifieerErfenisGebruikerKoppeling(hertekendeErfenisBrug, wettigVoltooid.nieuweStaat);
      const wettigHerstelOk =
        !teVroeg.ok
        && teVroeg.fout === 'BETWISTINGSTERMIJN_NOG_NIET_VERSTREKEN'
        && pubHersteld.ok
        && wettigVoltooid.nieuweStaat.oprichting.persoonsId === eigenaar.staat.oprichting.persoonsId
        && wettigVoltooid.nieuweStaat.actieveEpoche === 2
        && wettigVoltooid.hersteldGeheimScalairHex === herstelGeheimScalairHex
        && erfenisBrugBlijftGeldig;

      netwerkClient.sluitAlleSessies();

      const resultaat = {
        code: 'KLIMOP-ETAPPE-5-IDENTITEIT-MLS-PROEF',
        persoonsId: eigenaar.staat.oprichting.persoonsId,
        pseudoniemenGescheiden,
        voorwaartseGeheimhoudingOk,
        gestolenTelefoonGeweigerdOpNetwerk,
        postCompromisMlsOk,
        gewoneAfwezigheidGeweigerd,
        onwettigeErfopvolgingGeblokkeerd,
        wettigHerstelOk,
      };

      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(resultaat, null, 2));
      } else {
        console.log('KLIMOP Етап 5 · Самосуверенна ідентичність, довірені пристрої, групові простори MLS та законне відновлення');
        console.log(`  Коренева ідентичність особи (${resultaat.persoonsId}) і розділені службові псевдоніми: ok=${resultaat.pseudoniemenGescheiden}`);
        console.log(`  Пряма таємниця MLS (новий пристрій не читає попередніх епох): ok=${resultaat.voorwaartseGeheimhoudingOk}`);
        console.log(`  Кворумне відкликання викраденого телефона при карантинному вузлі CH: ok=${resultaat.gestolenTelefoonGeweigerdOpNetwerk}`);
        console.log(`  Посткомпрометаційна безпека MLS після вилучення викраденого телефона: ok=${resultaat.postCompromisMlsOk}`);
        console.log(`  Блокування незаконного спадкування та звичайної відсутності (§17, §39): ok=${resultaat.gewoneAfwezigheidGeweigerd && resultaat.onwettigeErfopvolgingGeblokkeerd}`);
        console.log(`  Законне порогове відновлення Педерсена 2-з-3 після 48-год вікна зі збереженням persoonsId: ok=${resultaat.wettigHerstelOk}`);
      }

      if (
        !pseudoniemenGescheiden
        || !voorwaartseGeheimhoudingOk
        || !gestolenTelefoonGeweigerdOpNetwerk
        || !postCompromisMlsOk
        || !gewoneAfwezigheidGeweigerd
        || !onwettigeErfopvolgingGeblokkeerd
        || !wettigHerstelOk
      ) {
        process.exitCode = 1;
      }
    } finally {
      await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit()]);
    }
  } finally {
    await rm(tijdelijkeMap, { recursive: true, force: true });
  }
}

voerEtappe5ProefUit().catch((err) => {
  console.error('Збій полігона Етапу 5:', err);
  process.exitCode = 1;
});
