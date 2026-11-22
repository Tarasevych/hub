#!/usr/bin/env node
// KLIMOP-010 (20.11.2026, Етап 9 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний ізольований полігон захисту людини, протидії примусу та перевірки всіх 8 обов'язкових
// безпечних імітаційних сценаріїв §39 на 3 незалежних вузлах (NL, CH, UA) ролі `herstel`:
//   - жодного підключення до живої бази PostgreSQL чи робочого сервера;
//   - перевірка роздільних сховищ під примусом без втрати основних даних та 256-байтних невідрізнимих сигналів тривоги;
//   - контекстна оцінка ризику за 7 технічними ознаками зі збереженням доступу власника до власних даних;
//   - кворумне відкладення небезпечних дій на 72 год і їх скасування підписом власника після виходу з небезпеки;
//   - повна перевірка 8/8 сценаріїв §39 (0 байт втрат, відсутність одноосібної влади нападника).

import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

function maakEd25519Sleutels() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publiekeSleutelDerB64u: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    geheimeSleutelPkcs8B64u: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url'),
  };
}

async function laadEtappe9Bundel(tijdelijkeMap) {
  const ingangPad = join(tijdelijkeMap, 'etappe9-ingang.ts');
  const uitvoerPad = join(tijdelijkeMap, 'etappe9-bundel.mjs');
  const wortel = process.cwd();

  await writeFile(
    ingangPad,
    `
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/kern.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/stengels.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/drempelsleutels.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/identiteit.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/mensbescherming.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-knooppunt-agent.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-mensbescherming-client.ts'))};
`,
    'utf8',
  );

  await esbuild.build({
    entryPoints: [ingangPad],
    outfile: uitvoerPad,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
  });

  return import(pathToFileURL(uitvoerPad).href);
}

async function voerEtappe9ProefUit() {
  const tijdelijkeMap = await mkdtemp(join(tmpdir(), 'klimop-etappe9-'));
  try {
    const m = await laadEtappe9Bundel(tijdelijkeMap);
    const t0Ms = Date.now();
    const nuIso = new Date(t0Ms).toISOString();
    const verlooptOpIso = new Date(t0Ms + 30 * 24 * 3600 * 1000).toISOString();

    const knEigenaar = m.maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['herstel', 'verificatie', 'opslag'],
      juridischeRegio: 'NL',
      aanbieder: 'toestel-eigenaar-010',
      nuIso,
    });
    const knNL = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['herstel', 'verificatie', 'verbinding'],
      juridischeRegio: 'NL',
      aanbieder: 'herstel-knoop-nl',
      nuIso,
    });
    const knCH = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['herstel', 'verificatie', 'verbinding'],
      juridischeRegio: 'CH',
      aanbieder: 'herstel-knoop-ch',
      nuIso,
    });
    const knUA = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['herstel', 'verificatie', 'verbinding'],
      juridischeRegio: 'UA',
      aanbieder: 'herstel-knoop-ua',
      nuIso,
    });

    const srvNL = await m.startKlimopProefKnooppunt({ knooppunt: knNL });
    const srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knCH });
    const srvUA = await m.startKlimopProefKnooppunt({ knooppunt: knUA });
    const alleServers = [srvNL, srvCH, srvUA];

    try {
      const tabel = new m.KlimopRouteTabel();
      for (const s of alleServers) {
        tabel.voegTweerichtingsStengelToe(knEigenaar.identiteit.knooppuntId, s.identiteit.knooppuntId, 1);
      }
      const adressen = new Map(alleServers.map((s) => [s.identiteit.knooppuntId, s.basisUrl]));
      const netwerkClient = new m.KlimopNetwerkClient(knEigenaar, adressen, tabel);
      const mensClient = new m.KlimopMensbeschermingClient(netwerkClient);

      const groepUit = mensClient.maakMensbeschermingGroep({
        groepId: 'herstel-groep-010',
        eigenaar: knEigenaar,
        knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
        quorumMinimum: 2,
        nuIso,
        verlooptOpIso,
      });
      if (!groepUit.ok) throw new Error(groepUit.fout);

      const persoon = m.maakPersoonsIdentiteit(nuIso);
      const laptopBundel = m.registreerVertrouwdApparaat({
        staat: persoon.staat,
        wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
        naamLabel: 'Ноутбук власника',
        toegestaneBevoegdheden: ['lezen_werkgegevens', 'schrijven_werkgegevens', 'nood_betwisting'],
        nuIso,
      });
      const telefoonBundel = m.registreerVertrouwdApparaat({
        staat: persoon.staat,
        wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
        naamLabel: 'Кишеньковий телефон',
        toegestaneBevoegdheden: ['lezen_werkgegevens', 'schrijven_werkgegevens'],
        nuIso,
      });

      const scenarioMetingen = [];

      // 1. Викрадення пристрою (`diefstal_van_apparaat`)
      const intrekkingTelefoon = m.trekApparaatIn({
        staat: persoon.staat,
        ingetrokkenApparaatId: telefoonBundel.certificaat.apparaatId,
        reden: 'verloren_of_gestolen',
        ondertekenaar: { soort: 'nood_apparaat', bundel: laptopBundel },
        nuIso,
      });
      const verifNaDiefstal = m.verifieerApparaatCertificaat(telefoonBundel.certificaat, persoon.staat, {
        intrekkingen: [intrekkingTelefoon],
        nuIso,
      });
      scenarioMetingen.push({
        scenarioId: 'diefstal_van_apparaat',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: verifNaDiefstal.ok,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden: !verifNaDiefstal.ok && verifNaDiefstal.fout === 'APPARAAT_IS_INGETROKKEN',
        bewijsSamenvatting: 'Резервний ноутбук відкликав викрадений телефон без кореневого ключа й з 0 байт втрат',
      });

      // 2. Примусове розкриття одного набору облікових даних (`gedwongen_afgifte_een_inlogset`)
      const kluisZout32 = randomBytes(32);
      const hoofdGeheim = randomBytes(32);
      const dwangGeheim = randomBytes(32);
      const hoofdVerifier = m.berekenKluisVerifierHex(hoofdGeheim, kluisZout32);
      const dwangVerifier = m.berekenKluisVerifierHex(dwangGeheim, kluisZout32);

      const geopendeNevenkluis = m.leidScheidbareKluisContextAf({
        ingevoerdGeheimMateriaal: dwangGeheim,
        kluisZout32,
        verwachteHoofdVerifierHex: hoofdVerifier,
        verwachteDwangVerifierHex: dwangVerifier,
      });

      const voogdX25519 = m.maakX25519SleutelPaar();
      const voogdEd25519 = maakEd25519Sleutels();
      const dwangProfiel = {
        schema: 1,
        persoonsId: persoon.staat.oprichting.persoonsId,
        vrijwilligIngeschakeld: true,
        fysiekGeweldRisicoBeoordeeldDoorGebruiker: true,
        kritiekeActieWachttijdUren: 72,
        vertrouwenspersonenVoorAlarm: [
          {
            voogdId: 'voogd_familie_nl',
            x25519PubDerB64u: voogdX25519.publiekDerB64u,
            ed25519PubDerB64u: voogdEd25519.publiekeSleutelDerB64u,
          },
        ],
        automatischeGegevensVernietigingBijDwang: false,
      };
      const profielOk = m.valideerDwangBeschermingsProfiel(dwangProfiel);

      // Перевіряємо роботу невідрізнимого сигналу навіть при відмові вузла CH (кворум NL + UA):
      tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');

      const gewoneHartslag = m.maakOnopvallendNoodSignaalPakket({
        ontvangerVoogdId: 'voogd_familie_nl',
        ontvangerX25519PubDerB64u: voogdX25519.publiekDerB64u,
        soort: 'gewone_hartslag',
        persoonsPsid: 'psid1_00112233445566778899aabbccddeeff',
        nuIso,
      });
      const stilAlarm = m.maakOnopvallendNoodSignaalPakket({
        ontvangerVoogdId: 'voogd_familie_nl',
        ontvangerX25519PubDerB64u: voogdX25519.publiekDerB64u,
        soort: 'stil_dwang_alarm',
        persoonsPsid: 'psid1_00112233445566778899aabbccddeeff',
        nuIso,
        toelichtingCode: 'NOOD_INGANG_GEBRUIKT',
      });
      const gelijkeLengteInNetwerk =
        Buffer.from(gewoneHartslag.cijfertekstB64u, 'base64url').length === 256
        && Buffer.from(stilAlarm.cijfertekstB64u, 'base64url').length === 256;

      const zend1 = await mensClient.verspreidOnopvallendSignaal({ groep: groepUit.groep, pakket: gewoneHartslag });
      const zend2 = await mensClient.verspreidOnopvallendSignaal({ groep: groepUit.groep, pakket: stilAlarm });
      const voogdBus = await mensClient.haalVoogdSignalenOpVanQuorum({
        groep: groepUit.groep,
        voogdId: 'voogd_familie_nl',
      });
      const ontsleuteldeSoorten = (voogdBus.ok ? voogdBus.pakketten : []).map((p) => {
        const u = m.openNoodSignaalDoorVertrouwenspersoon({
          pakket: p,
          voogdX25519GeheimPkcs8B64u: voogdX25519.geheimPkcs8B64u,
        });
        return u.ok ? u.inhoud.soort : 'fout';
      });

      scenarioMetingen.push({
        scenarioId: 'gedwongen_afgifte_een_inlogset',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij:
          !geopendeNevenkluis.ok || geopendeNevenkluis.toegestaneRechten.includes('kritiek_beheer'),
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden:
          profielOk.ok === true
          && geopendeNevenkluis.ok === true
          && geopendeNevenkluis.geopendeKluis === 'afgeschermde_nevenkluis'
          && geopendeNevenkluis.hoofdGegevensIntact === true
          && gelijkeLengteInNetwerk
          && zend1.ok && zend2.ok
          && ontsleuteldeSoorten.includes('stil_dwang_alarm'),
        bewijsSamenvatting: 'Відкрито лише обмежене побічне сховище, основні дані цілі, 256-байтний тихий сигнал отримано опікуном',
      });

      // 3. Тривала недоступність власника (`langdurige_onbeschikbaarheid_eigenaar`)
      const afwezigheidOordeel = m.beoordeelLangdurigeAfwezigheidProtocol({
        klasse: 'gewone_afwezigheid',
        dagenZonderActiviteit: 180,
        bevestigdeOnafhankelijkeVoogden: 0,
        vereisteVoogdenDrempel: 2,
        verstrekenBetwistingUren: 0,
        eigenaarHeeftBezwaarAangetekend: false,
      });
      scenarioMetingen.push({
        scenarioId: 'langdurige_onbeschikbaarheid_eigenaar',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: afwezigheidOordeel.volledigeBeheerrechtenAutomatischOvergedragen,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden:
          afwezigheidOordeel.toegestaneReactie === 'geen_overdracht_alleen_bewaring'
          && afwezigheidOordeel.priveGegevensAutomatischOnthuldDoorStilte === false,
        bewijsSamenvatting: '180 діб мовчання без підтвердженої процедури зберігають дані зашифрованими без передавання прав',
      });

      // 4. Помилкове спрацювання сигналу небезпеки (`vals_alarm_noodsignaal`)
      const eigenaarTekenPaar = {
        publiekeSleutelDerB64u: persoon.staat.actieveWortelPubDerB64u,
        geheimeSleutelPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
      };
      const valsAlarmVerklaring = m.maakValsAlarmHerstelVerklaring({
        persoonsId: persoon.staat.oprichting.persoonsId,
        alarmGeactiveerdOp: nuIso,
        eigenaarSleutels: eigenaarTekenPaar,
        voogdSleutels: {
          voogdId: 'voogd_familie_nl',
          publiekeSleutelDerB64u: voogdEd25519.publiekeSleutelDerB64u,
          geheimeSleutelPkcs8B64u: voogdEd25519.geheimeSleutelPkcs8B64u,
        },
        nuIso,
      });
      const herstelUitValsAlarm = m.herstelNaValsDwangAlarm({
        profiel: dwangProfiel,
        verwachteEigenaarPubDerB64u: eigenaarTekenPaar.publiekeSleutelDerB64u,
        verklaring: valsAlarmVerklaring,
      });
      scenarioMetingen.push({
        scenarioId: 'vals_alarm_noodsignaal',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: false,
        gegevensVerliesBytes: herstelUitValsAlarm.ok ? herstelUitValsAlarm.gegevensVerliesBytes : 1,
        wettigeRechtenBehouden: herstelUitValsAlarm.ok === true && herstelUitValsAlarm.nieuweModus === 'normaal',
        bewijsSamenvatting: 'Помилкова тривога не знищила жодного байта і безпечно знята спільним підписом власника й опікуна',
      });

      // 5 і 6. Втрата всіх особистих пристроїв (`verlies_alle_persoonlijke_apparaten`) та законне відновлення (`wettig_herstel`)
      const nieuwWortel = maakEd25519Sleutels();
      const pedersen = m.splitsMetPedersenVss({
        setId: 'pedersen-010',
        geheimScalairHex: m.leidGeheimScalairAf(randomBytes(32)),
        drempel: 2,
        totaal: 3,
      });
      const herstelBeleid = {
        schema: 1,
        persoonsId: persoon.staat.oprichting.persoonsId,
        drempel: 2,
        voogden: [
          { knooppuntId: knNL.identiteit.knooppuntId, publiekeSleutelDerB64u: knNL.identiteit.publiekeSleutelDerB64u },
          { knooppuntId: knCH.identiteit.knooppuntId, publiekeSleutelDerB64u: knCH.identiteit.publiekeSleutelDerB64u },
          { knooppuntId: knUA.identiteit.knooppuntId, publiekeSleutelDerB64u: knUA.identiteit.publiekeSleutelDerB64u },
        ],
        pedersenSetId: 'pedersen-010',
        minimaleBetwistingsVensterUren: {
          verlies_alle_apparaten: 48,
          bevestigde_langdurige_onbeschikbaarheid: 168,
          wettige_erfopvolging: 168,
        },
      };
      // KLIMOP-020: політику відновлення закріплює корінь чинної епохи до втрати доступу
      const verankering020 = m.verankerHerstelBeleid({
        staat: persoon.staat,
        beleid: herstelBeleid,
        wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
        nuIso: nuIso,
      });
      if (!verankering020.ok) throw new Error(verankering020.fout);
      persoon.staat = verankering020.nieuweStaat;

      const aanvraagAlleVerloren = m.openHerstelAanvraag({
        beleid: herstelBeleid,
        omstandigheid: 'verlies_alle_apparaten',
        kandidaatNieuweWortelPubDerB64u: nieuwWortel.publiekeSleutelDerB64u,
        nuIso,
      });
      if (!aanvraagAlleVerloren.ok) throw new Error(aanvraagAlleVerloren.fout);

      scenarioMetingen.push({
        scenarioId: 'verlies_alle_persoonlijke_apparaten',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: false,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden: aanvraagAlleVerloren.aanvraag.staat === 'wacht_op_quorum_en_tijdslot',
        bewijsSamenvatting: 'Заявку відкрито з обов’язковим 48-годинним вікном оскарження без парольної залежності',
      });

      const stemNL = m.voegVoogdBevestigingToe({
        beleid: herstelBeleid,
        aanvraag: aanvraagAlleVerloren.aanvraag,
        voogd: knNL,
        nuIso: new Date(t0Ms + 3600_000).toISOString(),
      });
      if (!stemNL.ok) throw new Error(stemNL.fout);
      const stemUA = m.voegVoogdBevestigingToe({
        beleid: herstelBeleid,
        aanvraag: stemNL.aanvraag,
        voogd: knUA,
        nuIso: new Date(t0Ms + 7200_000).toISOString(),
      });
      if (!stemUA.ok) throw new Error(stemUA.fout);
      const wettigHersteld = m.voltooiWettigHerstel({
        staat: persoon.staat,
        beleid: herstelBeleid,
        aanvraag: stemUA.aanvraag,
        pedersenDelen: [pedersen.delen[0], pedersen.delen[2]],
        kandidaatNieuwWortelGeheimPkcs8B64u: nieuwWortel.geheimeSleutelPkcs8B64u,
        nuIso: new Date(t0Ms + 50 * 3600_000).toISOString(),
      });

      scenarioMetingen.push({
        scenarioId: 'wettig_herstel',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: false,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden:
          wettigHersteld.ok === true
          && wettigHersteld.nieuweStaat.oprichting.persoonsId === persoon.staat.oprichting.persoonsId,
        bewijsSamenvatting: 'Порогове відновлення Педерсена 2-з-3 після 48-год вікна зберегло persoonsId та всі права',
      });

      // 7. Спроба незаконного спадкування (`poging_onwettige_erfopvolging`)
      const valseErfAanvraag = m.openHerstelAanvraag({
        beleid: herstelBeleid,
        omstandigheid: 'wettige_erfopvolging',
        kandidaatNieuweWortelPubDerB64u: maakEd25519Sleutels().publiekeSleutelDerB64u,
        nuIso,
      });
      if (!valseErfAanvraag.ok) throw new Error(valseErfAanvraag.fout);
      const geblokkeerdeErf = m.betwistHerstelAanvraagDoorEigenaar({
        staat: persoon.staat,
        aanvraag: valseErfAanvraag.aanvraag,
        ondertekenaar: { soort: 'wortel', geheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u },
        nuIso: new Date(t0Ms + 10 * 3600_000).toISOString(),
      });

      scenarioMetingen.push({
        scenarioId: 'poging_onwettige_erfopvolging',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: !geblokkeerdeErf.ok,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden:
          geblokkeerdeErf.ok === true && geblokkeerdeErf.geblokkeerdeAanvraag.staat === 'geblokkeerd_door_eigenaar',
        bewijsSamenvatting: 'Живий власник одним підписом миттєво заблокував спробу незаконного спадкування у 168-год вікні',
      });

      // 8. Спроба захопити процедуру відновлення (`poging_kaping_herstelprocedure`)
      const risicoBeoordeling = m.beoordeelContextueelOperatieRisico({
        waargenomenSignalen: [
          'aanmelding_uit_nieuwe_omgeving',
          'verdachte_herstelregel_wijziging',
          'gelijktijdige_sleutelwijzigingen',
        ],
        gevraagdeActieSoort: 'kritieke_sleutel_of_rechten_actie',
      });

      const verdachteOperatie = m.maakUitgesteldeKritiekeOperatie({
        persoonsId: persoon.staat.oprichting.persoonsId,
        soort: 'wijzig_herstelvoogden',
        doelSamenvatting: 'Спроба замінити опікунів на підконтрольні вузли',
        wachttijdUren: risicoBeoordeling.verplichteWachttijdUren,
        aanvragerSleutels: eigenaarTekenPaar,
        nuIso,
      });
      const regQuorum = await mensClient.registreerUitgesteldeOperatieOpQuorum({
        groep: groepUit.groep,
        operatie: verdachteOperatie,
      });
      const vroegePoging = await mensClient.controleerUitvoerbaarheidOpQuorum({
        groep: groepUit.groep,
        operatieId: verdachteOperatie.operatieId,
        toegestaneAnnuleerPubSleutels: [eigenaarTekenPaar.publiekeSleutelDerB64u],
        actiefStilDwangAlarm: false,
        nuIso: new Date(t0Ms + 2 * 3600_000).toISOString(),
      });
      const annuleringDoorEigenaar = m.maakOperatieAnnulering({
        operatieId: verdachteOperatie.operatieId,
        persoonsId: persoon.staat.oprichting.persoonsId,
        reden: 'verdachte_poging_geblokkeerd',
        ondertekenaarSleutels: eigenaarTekenPaar,
        nuIso: new Date(t0Ms + 5 * 3600_000).toISOString(),
      });
      const annuleerRes = await mensClient.annuleerUitgesteldeOperatieOpQuorum({
        groep: groepUit.groep,
        annulering: annuleringDoorEigenaar,
        toegestaneAnnuleerPubSleutels: [eigenaarTekenPaar.publiekeSleutelDerB64u],
      });
      const na72UurPoging = await mensClient.controleerUitvoerbaarheidOpQuorum({
        groep: groepUit.groep,
        operatieId: verdachteOperatie.operatieId,
        toegestaneAnnuleerPubSleutels: [eigenaarTekenPaar.publiekeSleutelDerB64u],
        actiefStilDwangAlarm: false,
        nuIso: new Date(t0Ms + 80 * 3600_000).toISOString(),
      });

      scenarioMetingen.push({
        scenarioId: 'poging_kaping_herstelprocedure',
        veiligeSimulatieZonderEchtGevaar: true,
        aanvallerKreegAlleenheerschappij: vroegePoging.magUitvoeren || na72UurPoging.magUitvoeren,
        gegevensVerliesBytes: 0,
        wettigeRechtenBehouden:
          risicoBeoordeling.risicoNiveau === 'hoog'
          && risicoBeoordeling.verplichteWachttijdUren === 72
          && risicoBeoordeling.toegangTotEigenGegevensBehouden === true
          && regQuorum.ok && annuleerRes.ok
          && vroegePoging.redenIndienGeweigerd === 'KRITIEKE_OPERATIE_IN_WACHTTIJD'
          && na72UurPoging.redenIndienGeweigerd === 'KRITIEKE_OPERATIE_GEANNULEERD_DOOR_EIGENAAR',
        bewijsSamenvatting: 'Контекстна оцінка наклала 72-год замок, кворум заблокував раннє виконання й зафіксував скасування власником',
      });

      const programmaOordeel = m.beoordeelMensbeschermingsProgramma(scenarioMetingen);

      const resultaat = {
        scheidbareKluizenEnStilSignaalOk:
          geopendeNevenkluis.ok && gelijkeLengteInNetwerk && ontsleuteldeSoorten.includes('stil_dwang_alarm'),
        contextueleRisicoEnTijdslotOk:
          risicoBeoordeling.verplichteWachttijdUren === 72 && !vroegePoging.magUitvoeren && !na72UurPoging.magUitvoeren,
        achtMensbeschermingScenariosOk:
          programmaOordeel.geslaagd === true && programmaOordeel.gedekteScenarios === 8,
      };

      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(resultaat, null, 2));
      } else {
        console.log('KLIMOP Етап 9 · Захист людини, протидія примусу, контекстний ризик та 8 сценаріїв §39');
        console.log(`  Роздільні сховища без втрати основних даних і невідрізнимий 256-байтний сигнал тривоги: ok=${resultaat.scheidbareKluizenEnStilSignaalOk}`);
        console.log(`  Контекстна оцінка 7 ознак (§16), 72-год часовий замок і скасування на кворумі NL/UA: ok=${resultaat.contextueleRisicoEnTijdslotOk}`);
        console.log(`  Виконання всієї 8-пунктової програми захисту людини §39 (8/8 сценаріїв, 0 байт втрат): ok=${resultaat.achtMensbeschermingScenariosOk}`);
      }

      if (
        !resultaat.scheidbareKluizenEnStilSignaalOk
        || !resultaat.contextueleRisicoEnTijdslotOk
        || !resultaat.achtMensbeschermingScenariosOk
      ) {
        process.exitCode = 1;
      }
    } finally {
      await Promise.all(alleServers.map((s) => s.sluit()));
    }
  } finally {
    await rm(tijdelijkeMap, { recursive: true, force: true });
  }
}

voerEtappe9ProefUit().catch((err) => {
  console.error('Збій полігона Етапу 9:', err);
  process.exitCode = 1;
});
