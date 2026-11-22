#!/usr/bin/env node
// KLIMOP-011 (20.11.2026, Етап 10 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний ізольований полігон керованого розширення мережі («Вусики»), між'юрисдикційного приєднання,
// протидії атакам Сивілли й поведінці комп'ютерного хробака, справедливого обміну ресурсами («Живлення»)
// та безпечного виведення вузлів із кворуму (§1.4–1.5, §4–§5.2, §26–§27, §36 Етап 10, Документ №15):
//   - жодного підключення до живої бази PostgreSQL чи робочого сервера;
//   - перевірка відмови всім ознакам комп'ютерного хробака та несанкціонованому залученню сторонніх ресурсів без рішення власника;
//   - приєднання нових незалежних вузлів SE та IS до кворуму NL/CH/UA за двосторонніми свідоцтвами;
//   - відбиття атаки Сивілли (8 клонів одного постачальника + 3 тимчасові вузли);
//   - підписані квитанції ресурсів та безумовний доступ пасивного учасника (0 балів внеску) до власних даних;
//   - безпечне виведення вузла SE після перенесення смуг і заборона єдиної точки входу.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

async function laadEtappe10Bundel(tijdelijkeMap) {
  const ingangPad = join(tijdelijkeMap, 'etappe10-ingang.ts');
  const uitvoerPad = join(tijdelijkeMap, 'etappe10-bundel.mjs');
  const wortel = process.cwd();

  await writeFile(
    ingangPad,
    `
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/kern.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/stengels.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/hechtranken.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-knooppunt-agent.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-hechtranken-client.ts'))};
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

function bouwGeldigeAanvraag(kandidaatIdentiteit, netwerkVoorvoegsel, gevraagdeRollen) {
  return {
    kandidaatIdentiteit,
    netwerkVoorvoegsel,
    gevraagdeRollen,
    maxOpslagMiB: 4096,
    maxBandbreedteMiBPerDag: 8192,
    maxToegestaneReplicas: 6,
    uitdrukkelijkeToestemmingApparaatEigenaar: true,
    geenZelfstandigeInstallatie: true,
    geenOngevraagdeKopieVanPriveInhoud: true,
    geenVerborgenRekenkrachtGebruik: true,
    automatischeRechtenUitbreidingViaVerbinding: false,
    vertrouwdAlleenWegensNetwerkNabijheid: false,
    externeMiddelenBelastingEenheden: 0,
    uitdrukkelijkeKostenGoedkeuringEigenaar: false,
  };
}

async function voerEtappe10ProefUit() {
  const tijdelijkeMap = await mkdtemp(join(tmpdir(), 'klimop-etappe10-'));
  try {
    const m = await laadEtappe10Bundel(tijdelijkeMap);
    const t0Ms = Date.now();
    const nuIso = new Date(t0Ms).toISOString();

    const knCoordinator = m.maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['verificatie', 'opslag'],
      juridischeRegio: 'NL',
      aanbieder: 'coordinator-toestel-011',
      nuIso,
    });
    const knNL = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'NL',
      aanbieder: 'onafh-knoop-nl',
      nuIso,
    });
    const knCH = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'CH',
      aanbieder: 'onafh-knoop-ch',
      nuIso,
    });
    const knUA = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'UA',
      aanbieder: 'onafh-knoop-ua',
      nuIso,
    });
    const knSE = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'SE',
      aanbieder: 'noordse-knoop-se',
      nuIso,
    });
    const knIS = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'IS',
      aanbieder: 'pool-knoop-is',
      nuIso,
    });

    const srvNL = await m.startKlimopProefKnooppunt({ knooppunt: knNL });
    const srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knCH });
    const srvUA = await m.startKlimopProefKnooppunt({ knooppunt: knUA });
    const alleServers = [srvNL, srvCH, srvUA];

    try {
      const adressen = new Map([
        [knNL.identiteit.knooppuntId, srvNL.basisUrl],
        [knCH.identiteit.knooppuntId, srvCH.basisUrl],
        [knUA.identiteit.knooppuntId, srvUA.basisUrl],
      ]);
      const tabel = new m.KlimopRouteTabel();
      for (const s of alleServers) {
        tabel.voegTweerichtingsStengelToe(knCoordinator.identiteit.knooppuntId, s.identiteit.knooppuntId, 10);
      }

      const netwerkClient = new m.KlimopNetwerkClient(knCoordinator, adressen, tabel);
      const hechtrankenClient = new m.KlimopHechtrankenEnVoedingClient(netwerkClient);

      const groepRes = hechtrankenClient.maakUitbreidingsQuorumGroep({
        groepId: 'hechtrank011',
        coordinator: knCoordinator,
        knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
        quorumMinimum: 2,
        nuIso,
      });
      if (!groepRes.ok) throw new Error(`Quorumgroep mislukt: ${groepRes.fout}`);
      const groep = groepRes.groep;

      // -------------------------------------------------------------------------------------------
      // 1. Відбиття поведінки комп'ютерного хробака (§5.2) та залучення сторонніх ресурсів без дозволу
      // -------------------------------------------------------------------------------------------
      const wormPogingZelfInstallatie = m.valideerKnooppuntToetredingsAanvraag({
        ...bouwGeldigeAanvraag(knSE.identiteit, '193.10.40.0/24', ['opslag']),
        geenZelfstandigeInstallatie: false,
      });
      const wormPogingVerborgenCpu = m.valideerKnooppuntToetredingsAanvraag({
        ...bouwGeldigeAanvraag(knSE.identiteit, '193.10.40.0/24', ['opslag']),
        geenVerborgenRekenkrachtGebruik: false,
      });
      const wormPogingRechtenUitbreiding = m.valideerKnooppuntToetredingsAanvraag({
        ...bouwGeldigeAanvraag(knSE.identiteit, '193.10.40.0/24', ['opslag']),
        automatischeRechtenUitbreidingViaVerbinding: true,
      });
      const kostenZonderToestemming = m.valideerKnooppuntToetredingsAanvraag({
        ...bouwGeldigeAanvraag(knSE.identiteit, '193.10.40.0/24', ['opslag']),
        externeMiddelenBelastingEenheden: 12,
        uitdrukkelijkeKostenGoedkeuringEigenaar: false,
      });
      const wormEnKostenGeblokkeerdOk =
        !wormPogingZelfInstallatie.ok
        && wormPogingZelfInstallatie.fout === 'WORMGEDRAG_ZELFSTANDIGE_INSTALLATIE_VERBODEN'
        && !wormPogingVerborgenCpu.ok
        && wormPogingVerborgenCpu.fout === 'WORMGEDRAG_VERBORGEN_MIDDELENVERBRUIK_VERBODEN'
        && !wormPogingRechtenUitbreiding.ok
        && wormPogingRechtenUitbreiding.fout === 'WORMGEDRAG_AUTOMATISCHE_RECHTENUITBREIDING_VERBODEN'
        && !kostenZonderToestemming.ok
        && kostenZonderToestemming.fout === 'KOSTEN_ZONDER_EIGENAARSGOEDKEURING_VERBODEN';

      // -------------------------------------------------------------------------------------------
      // 2. Кероване між'юрисдикційне розширення (NL, CH, UA + SE, IS) і відбиття атаки Сивілли
      // -------------------------------------------------------------------------------------------
      const sponsorSleutels = {
        publiekeSleutelDerB64u: knCoordinator.identiteit.publiekeSleutelDerB64u,
        geheimeSleutelPkcs8B64u: knCoordinator.geheimeSleutelPkcs8B64u,
      };
      const erkendeSponsors = [sponsorSleutels.publiekeSleutelDerB64u];

      const echteKandidaten = [
        { knoop: knNL, voorvoegsel: '185.12.10.0/24' },
        { knoop: knCH, voorvoegsel: '194.42.20.0/24' },
        { knoop: knUA, voorvoegsel: '91.200.30.0/24' },
        { knoop: knSE, voorvoegsel: '193.10.40.0/24' },
        { knoop: knIS, voorvoegsel: '82.221.90.0/24' },
      ];

      for (const item of echteKandidaten) {
        const bew = m.maakHechtrankToetredingsBewijs({
          aanvraag: bouwGeldigeAanvraag(item.knoop.identiteit, item.voorvoegsel, ['verificatie', 'opslag', 'verbinding']),
          kandidaatGeheimPkcs8B64u: item.knoop.geheimeSleutelPkcs8B64u,
          sponsorSleutels,
          nuIso,
        });
        if (!bew.ok) throw new Error(`Toetredingsbewijs mislukt: ${bew.fout}`);
        const pubRes = await hechtrankenClient.publiceerToetredingOpQuorum({
          groep,
          bewijs: bew.bewijs,
          erkendeSponsorPubSleutels: erkendeSponsors,
          nuIso,
        });
        if (!pubRes.ok) throw new Error(`Quorumpublicatie toetreding mislukt: ${pubRes.fout}`);
      }

      // Нападник намагається залити мережу 8 клонами в одному хмарному постачальнику та 3 тимчасовими вузлами
      for (let i = 0; i < 8; i++) {
        const sybilKnoop = m.maakKlimopKnooppunt({
          type: 'vaste_onafhankelijke_knooppunten',
          rollen: ['opslag', 'verbinding'],
          juridischeRegio: 'DE',
          aanbieder: 'sybil-massa-wolk',
          nuIso,
        });
        const sybilBew = m.maakHechtrankToetredingsBewijs({
          aanvraag: bouwGeldigeAanvraag(sybilKnoop.identiteit, `10.88.${i}.0/24`, ['opslag', 'verbinding']),
          kandidaatGeheimPkcs8B64u: sybilKnoop.geheimeSleutelPkcs8B64u,
          sponsorSleutels,
          nuIso,
        });
        if (!sybilBew.ok) throw new Error('Sybil-proefbewijs mislukt');
        await hechtrankenClient.publiceerToetredingOpQuorum({
          groep,
          bewijs: sybilBew.bewijs,
          erkendeSponsorPubSleutels: erkendeSponsors,
          nuIso,
        });
      }

      for (let j = 0; j < 3; j++) {
        const tijdelijk = m.maakKlimopKnooppunt({
          type: 'tijdelijke_toetredingsknooppunten',
          rollen: ['verbinding'],
          juridischeRegio: 'FR',
          aanbieder: `tijdelijk-relais-${j}`,
          nuIso,
        });
        const tijdBew = m.maakHechtrankToetredingsBewijs({
          aanvraag: bouwGeldigeAanvraag(tijdelijk.identiteit, `172.20.${j}.0/24`, ['verbinding']),
          kandidaatGeheimPkcs8B64u: tijdelijk.geheimeSleutelPkcs8B64u,
          sponsorSleutels,
          nuIso,
        });
        if (!tijdBew.ok) throw new Error('Tijdelijk bewijs mislukt');
        await hechtrankenClient.publiceerToetredingOpQuorum({
          groep,
          bewijs: tijdBew.bewijs,
          erkendeSponsorPubSleutels: erkendeSponsors,
          nuIso,
        });
      }

      // -------------------------------------------------------------------------------------------
      // 3. Справедливий обмін ресурсами «Живлення» (§26–§27) та безумовний доступ пасивного учасника
      // -------------------------------------------------------------------------------------------
      const zelfKwitantie = m.maakMiddelenBijdrageKwitantie({
        leverancierKnooppuntId: knSE.identiteit.knooppuntId,
        controleur: knSE,
        geleverdeOpslagMiB: 9999,
        beschikbaarheidMinuten: 9999,
        overgedragenVersleuteldeMiB: 9999,
        geverifieerdeOperaties: 9999,
        betrouwbaarheidRatio: 1,
        nuIso,
      });

      const kw1 = m.maakMiddelenBijdrageKwitantie({
        leverancierKnooppuntId: knIS.identiteit.knooppuntId,
        controleur: knNL,
        geleverdeOpslagMiB: 2400,
        beschikbaarheidMinuten: 1440,
        overgedragenVersleuteldeMiB: 900,
        geverifieerdeOperaties: 600,
        betrouwbaarheidRatio: 1,
        nuIso,
      });
      if (!kw1.ok) throw new Error('Kwitantie mislukt');
      await hechtrankenClient.publiceerMiddelenKwitantieOpQuorum({ groep, kwitantie: kw1.kwitantie });

      const overzichtActief = await hechtrankenClient.raadpleegUitbreidingEnVoedingVanQuorum({
        groep,
        deelnemerId: knIS.identiteit.knooppuntId,
        vereisteDrempel: 5,
      });
      const overzichtPassief = await hechtrankenClient.raadpleegUitbreidingEnVoedingVanQuorum({
        groep,
        deelnemerId: 'klid1_passieve_gebruiker_zonder_server',
        vereisteDrempel: 5,
      });
      if (!overzichtActief.ok || !overzichtPassief.ok) throw new Error('Raadpleging mislukt');

      const sybilWeerstandEnSpreidingOk =
        overzichtActief.sybilVerslag.veiligTegenSybilOvername === true
        && overzichtActief.sybilVerslag.totaalAangemeldeKnopen === 16 // 5 справжніх + 8 Сивілли + 3 тимчасові
        && overzichtActief.sybilVerslag.genegeerdeTijdelijkeKnopen === 3
        && overzichtActief.sybilVerslag.begrensdeDubbeleAanbiederOfSubnetKnopen === 7
        && overzichtActief.sybilVerslag.effectieveOnafhankelijkeStemmen === 6 // 5 справжніх + щонайбільше 1 від усієї хмари Сивілли
        && overzichtActief.sybilVerslag.uniekeJuridischeRegios === 6;

      const eerlijkeVoedingEnPassiefLidOk =
        !zelfKwitantie.ok
        && zelfKwitantie.fout === 'ZELF_ONDERTEKENDE_BIJDRAGE_ONGELDIG'
        && m.APPARAAT_KLASSE_RICHTWAARDEN.ouder_zuinig_toestel.alleenTijdensOpladenStandaard === true
        && m.APPARAAT_KLASSE_RICHTWAARDEN.moderne_telefoon.gelijkVerbruikBelofteOpAlleTelefoons === false
        && overzichtActief.voedingBalans.prioriteitVoorExtraNetwerkRepliek === 'kern_ondersteuner'
        && overzichtPassief.voedingBalans.bijdragePunten === 0
        && overzichtPassief.voedingBalans.prioriteitVoorExtraNetwerkRepliek === 'basis_passief_lid'
        && overzichtPassief.voedingBalans.toegangTotEigenGegevensOnvoorwaardelijk === true
        && overzichtPassief.voedingBalans.verplichteRekenkrachtDeelname === false;

      // -------------------------------------------------------------------------------------------
      // 4. Обрив зв'язку до CH, безпечне виведення вузла SE з кворуму та заборона єдиної точки входу
      // -------------------------------------------------------------------------------------------
      tabel.markeerStengelStaat(knCoordinator.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');

      const teVroegeUittreding = m.planVeiligeKnooppuntUittreding({
        uittredendKnooppunt: knSE,
        alleActieveKnooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit, knIS.identiteit],
        vereisteQuorumDrempel: 4,
        openstaandeTeVerplaatsenStrepen: 3,
        nuIso,
      });

      const veiligeUittredingSE = m.planVeiligeKnooppuntUittreding({
        uittredendKnooppunt: knSE,
        alleActieveKnooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit, knIS.identiteit],
        vereisteQuorumDrempel: 4,
        openstaandeTeVerplaatsenStrepen: 0,
        nuIso,
      });
      if (!veiligeUittredingSE.ok) throw new Error(`Veilige uittreding SE mislukt: ${veiligeUittredingSE.fout}`);

      const uitPub = await hechtrankenClient.publiceerVeiligeUittredingOpQuorum({
        groep,
        uittreding: veiligeUittredingSE.bewijs,
      });
      const naUittreding = await hechtrankenClient.raadpleegUitbreidingEnVoedingVanQuorum({
        groep,
        deelnemerId: knIS.identiteit.knooppuntId,
        vereisteDrempel: 4,
      });

      const ingangCheckVeilig = m.controleerGeenEnkelToetredingsknooppunt({
        actieveIngangsPunten: [
          { knooppuntId: 'ingang_oud', aanbieder: 'tijdelijk-start', juridischeRegio: 'NL' },
          { knooppuntId: knUA.identiteit.knooppuntId, aanbieder: 'onafh-knoop-ua', juridischeRegio: 'UA' },
          { knooppuntId: knIS.identiteit.knooppuntId, aanbieder: 'pool-knoop-is', juridischeRegio: 'IS' },
        ],
        teSluitenKnooppuntId: 'ingang_oud',
      });
      const ingangCheckGevaarlijk = m.controleerGeenEnkelToetredingsknooppunt({
        actieveIngangsPunten: [
          { knooppuntId: 'ingang_oud', aanbieder: 'tijdelijk-start', juridischeRegio: 'NL' },
          { knooppuntId: knIS.identiteit.knooppuntId, aanbieder: 'pool-knoop-is', juridischeRegio: 'IS' },
        ],
        teSluitenKnooppuntId: 'ingang_oud',
      });

      const veiligeUittredingEnIngangOk =
        !teVroegeUittreding.ok
        && teVroegeUittreding.onmiddellijkStoppenAchtergrondToegestaan === true
        && teVroegeUittreding.fout === 'EERST_STREPEN_HERPLAATSEN_VOOR_UITTREDING'
        && uitPub.ok
        && naUittreding.ok
        && naUittreding.uitgetredenKnooppuntIds.includes(knSE.identiteit.knooppuntId)
        && !naUittreding.actieveKnooppuntIds.includes(knSE.identiteit.knooppuntId)
        && naUittreding.sybilVerslag.veiligTegenSybilOvername === true
        && ingangCheckVeilig.ok === true
        && ingangCheckGevaarlijk.ok === false;

      const resultaat = {
        wormEnKostenGeblokkeerdOk,
        sybilWeerstandEnSpreidingOk,
        eerlijkeVoedingEnPassiefLidOk,
        veiligeUittredingEnIngangOk,
      };

      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(resultaat, null, 2));
      } else {
        console.log('KLIMOP Етап 10 · Кероване розширення («Вусики»), між’юрисдикційна стійкість і обмін ресурсами («Живлення»)');
        console.log(`  Блокування поведінки комп’ютерного хробака (§5.2) та несанкціонованих платних ресурсів без згоди власника: ok=${resultaat.wormEnKostenGeblokkeerdOk}`);
        console.log(`  Приєднання вузлів SE/IS до NL/CH/UA та відбиття атаки Сивілли (8 клонів + 3 тимчасові вузли): ok=${resultaat.sybilWeerstandEnSpreidingOk}`);
        console.log(`  Справедливий баланс «Живлення» і безумовний доступ пасивного учасника (0 внеску) до власних даних: ok=${resultaat.eerlijkeVoedingEnPassiefLidOk}`);
        console.log(`  Безпечне виведення вузла SE на кворумі NL/UA (при обриві CH) та заборона єдиної точки входу: ok=${resultaat.veiligeUittredingEnIngangOk}`);
      }

      if (
        !resultaat.wormEnKostenGeblokkeerdOk
        || !resultaat.sybilWeerstandEnSpreidingOk
        || !resultaat.eerlijkeVoedingEnPassiefLidOk
        || !resultaat.veiligeUittredingEnIngangOk
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

voerEtappe10ProefUit().catch((err) => {
  console.error('Збій полігона Етапу 10:', err);
  process.exitCode = 1;
});
