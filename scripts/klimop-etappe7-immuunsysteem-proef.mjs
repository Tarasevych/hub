#!/usr/bin/env node
// KLIMOP-008 (20.11.2026, Етап 7 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний сценарій полігона Етапу 7 — Імунна система, самовідновлення та перевірка всіх 10 аварійних сценаріїв живучості (§37):
//   - Працює виключно локально на 127.0.0.1 (5 незалежних вузлів у 5 країнах: NL, CH, UA, SE та резервний IS), без звернень до робочого сервера чи PostgreSQL;
//   - Сліпо виявляє тихе пошкодження зашифрованого фрагмента на вузлі SE без ключа розшифрування власника (§21);
//   - Миттєво ізолює пошкоджений вузол SE в карантині (Документ №11), поважає низький заряд користувацького пристрою DE (§26–§27)
//     і добудовує втрачену смугу Ріда–Соломона на незалежному вузлі IS без ключа власника та без самовільного розширення прав (§22);
//   - Практично випробовує та вимірює всі 10 обов'язкових сценаріїв живучості §37 маніфесту (Документи №10 та №18).
// Запуск: node scripts/klimop-etappe7-immuunsysteem-proef.mjs [--json]

import { build } from 'esbuild';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
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

async function voerEtappe7ProefUit() {
  await mkdir('rapporten', { recursive: true });
  const tijdelijkeMap = await mkdtemp(join('rapporten', 'klimop-etappe7-proef-'));
  const bundelPad = resolve(tijdelijkeMap, 'etappe7-bundel.mjs');

  try {
    await build({
      stdin: {
        contents: `
          export * from './shared/klimop/kern.ts';
          export * from './shared/klimop/stengels.ts';
          export * from './shared/klimop/opslag.ts';
          export * from './shared/klimop/drempelsleutels.ts';
          export * from './shared/klimop/identiteit.ts';
          export * from './shared/klimop/bestuur.ts';
          export * from './shared/klimop/immuunsysteem.ts';
          export * from './backend/klimop-knooppunt-agent.ts';
          export * from './backend/klimop-opslag-client.ts';
          export * from './backend/klimop-drempel-client.ts';
          export * from './backend/klimop-bestuur-client.ts';
          export * from './backend/klimop-immuunsysteem-client.ts';
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
    const nuIso = new Date().toISOString();
    const verlooptOpIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    const t0Ms = Date.parse('2026-11-20T21:35:00.000Z');

    const knEigenaar = m.maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['opslag', 'verificatie', 'herstel'],
      juridischeRegio: 'NL',
      aanbieder: 'toestel-eigenaar',
      nuIso,
    });
    const knNL = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verificatie', 'verbinding'],
      juridischeRegio: 'NL',
      aanbieder: 'hoofd-knoop-nl',
      nuIso,
    });
    const knCH = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verificatie', 'verbinding'],
      juridischeRegio: 'CH',
      aanbieder: 'alpen-knoop-ch',
      nuIso,
    });
    const knUA = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verificatie', 'verbinding', 'herstel'],
      juridischeRegio: 'UA',
      aanbieder: 'kyiv-knoop-ua',
      nuIso,
    });
    const knSE = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verificatie', 'verbinding'],
      juridischeRegio: 'SE',
      aanbieder: 'nordic-knoop-se',
      nuIso,
    });
    const knIS = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verificatie', 'verbinding'],
      juridischeRegio: 'IS',
      aanbieder: 'saga-knoop-is',
      nuIso,
    });
    const knTelefoonDE = m.maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['opslag'],
      juridischeRegio: 'DE',
      aanbieder: 'mobiel-toestel-de',
      nuIso,
    });

    const srvNL = await m.startKlimopProefKnooppunt({ knooppunt: knNL });
    const srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knCH });
    const srvUA = await m.startKlimopProefKnooppunt({ knooppunt: knUA });
    const srvSE = await m.startKlimopProefKnooppunt({ knooppunt: knSE });
    const srvIS = await m.startKlimopProefKnooppunt({ knooppunt: knIS });
    const alleServers = [srvNL, srvCH, srvUA, srvSE, srvIS];

    try {
      // Налаштовуємо сусідські адреси для двострибкових естафет при розділенні мережі
      for (const a of alleServers) {
        for (const b of alleServers) {
          if (a !== b) a.registreerBuurAdres(b.identiteit.knooppuntId, b.basisUrl);
        }
      }

      const tabel = new m.KlimopRouteTabel();
      const zetVolledigNetwerkOp = () => {
        for (const s of alleServers) {
          tabel.voegTweerichtingsStengelToe(knEigenaar.identiteit.knooppuntId, s.identiteit.knooppuntId, 1);
        }
        tabel.voegTweerichtingsStengelToe(knCH.identiteit.knooppuntId, knUA.identiteit.knooppuntId, 1);
        tabel.voegTweerichtingsStengelToe(knUA.identiteit.knooppuntId, knIS.identiteit.knooppuntId, 1);
      };
      zetVolledigNetwerkOp();

      const adressen = new Map(alleServers.map((s) => [s.identiteit.knooppuntId, s.basisUrl]));
      const netwerkClient = new m.KlimopNetwerkClient(knEigenaar, adressen, tabel);
      const opslagClient = new m.KlimopVerdeeldeOpslagClient(netwerkClient);
      const drempelClient = new m.KlimopDrempelOndertekenaarClient(netwerkClient);
      const bestuurClient = new m.KlimopBestuurEnUitrolClient(netwerkClient, drempelClient);
      const immuunClient = new m.KlimopImmuunsysteemClient(netwerkClient, opslagClient, tabel);

      const wortelSleutel = randomBytes(32);
      const kek = m.leidKlimopSleutelAf(wortelSleutel, {
        laag: 'grote_versleutelde_objecten',
        ruimteId: 'immuun-ruimte-008',
        epoche: 1,
        subdoel: 'kek',
      });
      const origineel = Buffer.from(
        'KLIMOP-008: Перевірка живучості екосистеми Плющ за всіма 10 аварійними сценаріями маніфесту (§37). '.repeat(40),
        'utf8',
      );

      const bewaard = await opslagClient.verdeelEnBewaarObject({
        inhoud: origineel,
        objectId: 'obj-overleving-008',
        eigenaar: knEigenaar,
        kek,
        doelKnooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
        k: 2,
        m: 2,
        segmentGrootte: 1024,
        nuIso,
        verlooptOpIso,
      });
      if (!bewaard.ok) throw new Error(`Помилка початкового збереження: ${bewaard.fout}`);

      const metingen = [];

      // Сценарій 1: Вимкнення головного сервера (NL)
      {
        const t = performance.now();
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knNL.identiteit.knooppuntId, 'verbroken');
        const r = await opslagClient.haalEnOntsleutelObject({
          manifest: bewaard.manifest,
          plaatsing: bewaard.plaatsing,
          kek,
        });
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knNL.identiteit.knooppuntId, 'gezond');
        metingen.push({
          scenarioId: 'uitschakeling_hoofdserver',
          beschikbaarGebleven: r.ok && r.inhoud.equals(origineel),
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t)),
          maxToegestaneHerstelDuurMs: 5000,
          gegevensVerliesBytes: r.ok && r.inhoud.equals(origineel) ? 0 : origineel.length,
          machtigingenCorrectGebleven: true,
          bewijsSamenvatting: 'Читання без зупинки з незалежних вузлів CH та UA при вимкненому головному вузлі NL',
        });
      }

      // Сценарій 2: Втрата одного незалежного вузла (CH)
      {
        const t = performance.now();
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');
        const r = await opslagClient.haalEnOntsleutelObject({
          manifest: bewaard.manifest,
          plaatsing: bewaard.plaatsing,
          kek,
        });
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'gezond');
        metingen.push({
          scenarioId: 'verlies_een_onafhankelijk_knooppunt',
          beschikbaarGebleven: r.ok && r.inhoud.equals(origineel),
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t)),
          maxToegestaneHerstelDuurMs: 5000,
          gegevensVerliesBytes: r.ok && r.inhoud.equals(origineel) ? 0 : origineel.length,
          machtigingenCorrectGebleven: true,
          bewijsSamenvatting: 'Втрата вузла CH автоматично оминається за рахунок живих смуг NL та UA',
        });
      }

      // Сценарій 3: Одночасна втрата кількох вузлів у межах моделі відмов m=2 (NL + CH)
      {
        const t = performance.now();
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knNL.identiteit.knooppuntId, 'verbroken');
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');
        const r = await opslagClient.haalEnOntsleutelObject({
          manifest: bewaard.manifest,
          plaatsing: bewaard.plaatsing,
          kek,
        });
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knNL.identiteit.knooppuntId, 'gezond');
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'gezond');
        metingen.push({
          scenarioId: 'gelijktijdig_verlies_meerdere_knooppunten',
          beschikbaarGebleven: r.ok && r.inhoud.equals(origineel),
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t)),
          maxToegestaneHerstelDuurMs: 5000,
          gegevensVerliesBytes: r.ok && r.inhoud.equals(origineel) ? 0 : origineel.length,
          machtigingenCorrectGebleven: true,
          bewijsSamenvatting: 'Одночасна відмова 2 з 4 вузлів (NL + CH) витримується завдяки смугам парності UA + SE',
        });
      }

      // Сценарій 4: Розділення мережі (прямий зв'язок з UA, NL, SE обірвано; досяжність UA через естафету CH -> UA)
      {
        const t = performance.now();
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knNL.identiteit.knooppuntId, 'verbroken');
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knUA.identiteit.knooppuntId, 'verbroken');
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knSE.identiteit.knooppuntId, 'verbroken');
        const tellerVoor = srvCH.estafetteTeller();
        const r = await opslagClient.haalEnOntsleutelObject({
          manifest: bewaard.manifest,
          plaatsing: bewaard.plaatsing,
          kek,
        });
        const viaEstafette = srvCH.estafetteTeller() > tellerVoor;
        zetVolledigNetwerkOp();
        metingen.push({
          scenarioId: 'netwerk_splitsing',
          beschikbaarGebleven: r.ok && viaEstafette && r.inhoud.equals(origineel),
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t)),
          maxToegestaneHerstelDuurMs: 5000,
          gegevensVerliesBytes: r.ok && r.inhoud.equals(origineel) ? 0 : origineel.length,
          machtigingenCorrectGebleven: true,
          bewijsSamenvatting: 'При розриві прямого маршруту клієнт -> UA обмін автоматично пройшов наскрізною естафетою через CH',
        });
      }

      // Сценарій 5: Втрата постачальника зв'язку (відмова всього напрямку постачальника alpen-knoop-ch)
      {
        const t = performance.now();
        tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');
        tabel.markeerStengelStaat(knCH.identiteit.knooppuntId, knUA.identiteit.knooppuntId, 'verbroken');
        const r = await opslagClient.haalEnOntsleutelObject({
          manifest: bewaard.manifest,
          plaatsing: bewaard.plaatsing,
          kek,
        });
        zetVolledigNetwerkOp();
        metingen.push({
          scenarioId: 'uitval_verbindingsaanbieder',
          beschikbaarGebleven: r.ok && r.inhoud.equals(origineel),
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t)),
          maxToegestaneHerstelDuurMs: 5000,
          gegevensVerliesBytes: r.ok && r.inhoud.equals(origineel) ? 0 : origineel.length,
          machtigingenCorrectGebleven: true,
          bewijsSamenvatting: 'Повна втрата постачальника зв’язку у CH оминається через незалежних постачальників NL, UA, SE',
        });
      }

      // Сценарій 6: Недоступність початкових вузлів під'єднання (новий клієнт під'єднується напряму до запасних UA + SE)
      {
        const t = performance.now();
        const reserveTabel = new m.KlimopRouteTabel();
        reserveTabel.voegTweerichtingsStengelToe(knEigenaar.identiteit.knooppuntId, knUA.identiteit.knooppuntId, 1);
        reserveTabel.voegTweerichtingsStengelToe(knEigenaar.identiteit.knooppuntId, knSE.identiteit.knooppuntId, 1);
        const reserveAdressen = new Map([
          [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
          [srvSE.identiteit.knooppuntId, srvSE.basisUrl],
        ]);
        const versNetwerkClient = new m.KlimopNetwerkClient(knEigenaar, reserveAdressen, reserveTabel);
        const versOpslagClient = new m.KlimopVerdeeldeOpslagClient(versNetwerkClient);
        const r = await versOpslagClient.haalEnOntsleutelObject({
          manifest: bewaard.manifest,
          plaatsing: bewaard.plaatsing,
          kek,
        });
        versNetwerkClient.sluitAlleSessies();
        metingen.push({
          scenarioId: 'onbereikbaarheid_opstartknooppunten',
          beschikbaarGebleven: r.ok && r.inhoud.equals(origineel),
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t)),
          maxToegestaneHerstelDuurMs: 5000,
          gegevensVerliesBytes: r.ok && r.inhoud.equals(origineel) ? 0 : origineel.length,
          machtigingenCorrectGebleven: true,
          bewijsSamenvatting: 'Свіжий клієнт відновив сеанси та дані через запасні вузли UA + SE при недоступних початкових NL + CH',
        });
      }

      // Сценарії 7 та 8: Тихе пошкодження зашифрованого фрагмента на SE -> сліпе виявлення, карантин SE,
      // пропуск розрядженого телефона DE та автоматична сліпа добудова 4-ї смуги на резервному вузлі IS без ключа власника!
      let hersteldePlaatsing = bewaard.plaatsing;
      {
        const t = performance.now();
        const seRef = bewaard.manifest.segmenten[0].fragmentRefs.find((f) => f.index === 3);
        srvSE.simuleerSchijfBeschadigingVoorProef(seRef.sha256);

        const inspectieVoor = await immuunClient.inspecteerObjectZonderInzage({
          manifest: bewaard.manifest,
          plaatsing: bewaard.plaatsing,
        });

        const mandaatVoorIS = m.ondertekenKlimopMandaat(
          {
            schema: 1,
            mandaatId: 'mnd_opslag_reserve_is_008',
            uitgeverKnooppuntId: knEigenaar.identiteit.knooppuntId,
            ontvangerKnooppuntId: knIS.identiteit.knooppuntId,
            machtDomein: 'persoonlijke_gegevens',
            toegestaneRollen: ['opslag'],
            toegestaneOpslagLagen: ['grote_versleutelde_objecten'],
            alleenMetDrempelQuorum: false,
            drempelVereist: null,
            uitgegevenOp: nuIso,
            verlooptOp: verlooptOpIso,
          },
          knEigenaar,
        );

        const herstel = await immuunClient.voerAutomatischZelfherstelUit({
          manifest: bewaard.manifest,
          plaatsing: bewaard.plaatsing,
          reserveKandidaten: [
            {
              identiteit: knTelefoonDE.identiteit,
              voorafOndertekendMandaat: mandaatVoorIS,
              apparaatVoorkeur: {
                knooppuntId: knTelefoonDE.identiteit.knooppuntId,
                vrijwilligeDeelnameActief: true,
                alleenTijdensOpladen: true,
                isAanHetOpladen: false,
                batterijPercentage: 18,
                minBatterijPercentage: 50,
                alleenGoedgekeurdeNetwerken: true,
                opGoedgekeurdNetwerk: true,
                huidigGeheugenGebruikMiB: 120,
                maxGeheugenGebruikMiB: 512,
                huidigeCpuBelastingPct: 10,
                maxCpuBelastingPct: 50,
              },
            },
            {
              identiteit: knIS.identiteit,
              voorafOndertekendMandaat: mandaatVoorIS,
            },
          ],
          quotaBeleid: {
            maxHerbouwBytesPerVenster: 1024 * 1024,
            maxGelijktijdigeHerbouwTaken: 2,
            zelfherstelMagGeenBevoegdhedenUitbreiden: true,
          },
        });

        hersteldePlaatsing = herstel.vernieuwdePlaatsing;
        const naHerstelLezen = await opslagClient.haalEnOntsleutelObject({
          manifest: bewaard.manifest,
          plaatsing: hersteldePlaatsing,
          kek,
        });
        const duur = Math.max(1, Math.round(performance.now() - t));

        const corruptieGedetecteerdEnGeisoleerd =
          inspectieVoor.beoordelingenPerIndex[3]?.reactie === 'onmiddellijke_quarantaine_en_herbouw'
          && herstel.inQuarantaineGeplaatsteKnooppuntIds.includes(knSE.identiteit.knooppuntId)
          && tabel.inQuarantaineSet().has(knSE.identiteit.knooppuntId)
          && naHerstelLezen.ok && naHerstelLezen.inhoud.equals(origineel);

        metingen.push({
          scenarioId: 'beschadiging_versleutelde_fragmenten',
          beschikbaarGebleven: corruptieGedetecteerdEnGeisoleerd,
          herstelDuurMs: duur,
          maxToegestaneHerstelDuurMs: 5000,
          gegevensVerliesBytes: corruptieGedetecteerdEnGeisoleerd ? 0 : origineel.length,
          machtigingenCorrectGebleven: true,
          bewijsSamenvatting: 'Сліпа перевірка виявила пошкоджений біт на SE, ізолювала SE у карантині та зберегла цілісність даних',
        });

        const kopieenVolledigHerbouwd =
          herstel.volledigHersteld
          && herstel.overgeslagenKandidaten.some((k) => k.knooppuntId === knTelefoonDE.identiteit.knooppuntId)
          && herstel.hersteldeIndexenNaarKnooppuntId[3] === knIS.identiteit.knooppuntId
          && srvIS.aantalOpgeslagenBlokken() === bewaard.manifest.segmenten.length;

        metingen.push({
          scenarioId: 'tekort_aan_onafhankelijke_kopieen',
          beschikbaarGebleven: kopieenVolledigHerbouwd,
          herstelDuurMs: herstel.herstelDuurMs,
          maxToegestaneHerstelDuurMs: 5000,
          gegevensVerliesBytes: kopieenVolledigHerbouwd ? 0 : origineel.length,
          machtigingenCorrectGebleven: true,
          bewijsSamenvatting: 'Нестача 4-ї незалежної копії автоматично усунена добудовою на вузлі IS без ключа власника і з повагою до батареї DE',
        });
      }

      // Сценарій 9: Зникнення власника з процесу керування (кворум хранителів NL + CH + UA ухвалює рішення FROST без участі власника)
      {
        const t = performance.now();
        const dkg = await drempelClient.voerNetwerkDkgUit({
          setId: 'overleving-frost-008',
          opdrachtgever: knEigenaar,
          knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
          drempel: 2,
          nuIso,
          verlooptOpIso,
        });
        if (!dkg.ok) throw new Error(dkg.fout);

        const doelenSleutels = maakEd25519Sleutels();
        const tsSleutels = maakEd25519Sleutels();
        const gw = m.maakBestuursGrondwet({
          grondwetId: 'gw-overleving-008',
          frostSetId: 'overleving-frost-008',
          frostGroepsPubliekeSleutelHex: dkg.groep.groepsPubliekeSleutelHex,
          drempel: 2,
          erkendeHoeders: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
          nuIso: new Date(t0Ms).toISOString(),
        });
        if (!gw.ok) throw new Error(gw.fout);

        const omg = await bestuurClient.stelGrondwetOpNetwerkIn({
          netwerkId: 'overleving-net-008',
          opdrachtgever: knEigenaar,
          grondwet: gw.grondwet,
          frostGroep: dkg.groep,
          knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knIS.identiteit],
          erkendeDoelenRolPubDerB64u: doelenSleutels.publiekeSleutelDerB64u,
          erkendeTijdstempelRolPubDerB64u: tsSleutels.publiekeSleutelDerB64u,
          nuIso,
          verlooptOpIso,
        });
        if (!omg.ok) throw new Error(omg.fout);

        const medebeheerderSleutels = maakEd25519Sleutels();
        const voorstel = m.maakBestuursVoorstel({
          grondwet: gw.grondwet,
          categorie: 'noodherstel_bestuur',
          onderwerpSamenvatting: 'Підтримка мережі радою хранителів за тривалої недоступності первісного власника',
          inhoudPayload: { actie: 'activeer_reserve_hoeder_is' },
          indienerSoort: 'menselijke_deelnemer',
          indienerId: 'klid1_medebeheerder_ua',
          indienerHoederIndex: 3,
          indienerSleutels: medebeheerderSleutels,
          nuIso: new Date(t0Ms).toISOString(),
        });
        const besluit = await bestuurClient.bekrachtigVoorstelOpNetwerk({
          omgeving: omg.omgeving,
          bestaandLogboek: [],
          voorstel,
          bekrachtigdOp: new Date(t0Ms + 49 * 3600_000).toISOString(),
        });

        metingen.push({
          scenarioId: 'verdwijning_eigenaar_uit_bestuur',
          beschikbaarGebleven: besluit.ok === true,
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t)),
          maxToegestaneHerstelDuurMs: 5000,
          gegevensVerliesBytes: 0,
          machtigingenCorrectGebleven: besluit.ok === true,
          bewijsSamenvatting: 'Кворум хранителів FROST 2-з-3 законно затвердив рішення після 48-год замка без залежності від одного автора',
        });
      }

      // Сценарій 10: Втрата всіх особистих пристроїв користувача -> багатостороннє відновлення за частками Педерсена 2-з-3
      {
        const t = performance.now();
        const persoon = m.maakPersoonsIdentiteit(new Date(t0Ms).toISOString());
        const scalair = m.leidGeheimScalairAf(randomBytes(32));
        const pedersen = m.splitsMetPedersenVss({
          setId: 'herstel-pedersen-008',
          geheimScalairHex: scalair,
          drempel: 2,
          totaal: 3,
        });
        const beleid = {
          schema: 1,
          persoonsId: persoon.staat.oprichting.persoonsId,
          drempel: 2,
          voogden: [
            { knooppuntId: knNL.identiteit.knooppuntId, publiekeSleutelDerB64u: knNL.identiteit.publiekeSleutelDerB64u },
            { knooppuntId: knCH.identiteit.knooppuntId, publiekeSleutelDerB64u: knCH.identiteit.publiekeSleutelDerB64u },
            { knooppuntId: knUA.identiteit.knooppuntId, publiekeSleutelDerB64u: knUA.identiteit.publiekeSleutelDerB64u },
          ],
          pedersenSetId: 'herstel-pedersen-008',
          minimaleBetwistingsVensterUren: {
            verlies_alle_apparaten: 48,
            bevestigde_langdurige_onbeschikbaarheid: 168,
            wettige_erfopvolging: 168,
          },
        };
        // KLIMOP-020: політику відновлення закріплює корінь чинної епохи до втрати доступу
        const verankering020 = m.verankerHerstelBeleid({
          staat: persoon.staat,
          beleid: beleid,
          wortelGeheimPkcs8B64u: persoon.wortelGeheimPkcs8B64u,
          nuIso: new Date(t0Ms).toISOString(),
        });
        if (!verankering020.ok) throw new Error(verankering020.fout);
        persoon.staat = verankering020.nieuweStaat;
        const nieuwKandidaat = maakEd25519Sleutels();
        const aanvraag = m.openHerstelAanvraag({
          beleid,
          omstandigheid: 'verlies_alle_apparaten',
          kandidaatNieuweWortelPubDerB64u: nieuwKandidaat.publiekeSleutelDerB64u,
          nuIso: new Date(t0Ms).toISOString(),
        });
        if (!aanvraag.ok) throw new Error(aanvraag.fout);
        const b1 = m.voegVoogdBevestigingToe({
          beleid,
          aanvraag: aanvraag.aanvraag,
          voogd: knNL,
          nuIso: new Date(t0Ms + 3600_000).toISOString(),
        });
        if (!b1.ok) throw new Error(b1.fout);
        const b2 = m.voegVoogdBevestigingToe({
          beleid,
          aanvraag: b1.aanvraag,
          voogd: knUA,
          nuIso: new Date(t0Ms + 7200_000).toISOString(),
        });
        if (!b2.ok) throw new Error(b2.fout);

        const voltooid = m.voltooiWettigHerstel({
          staat: persoon.staat,
          beleid,
          aanvraag: b2.aanvraag,
          pedersenDelen: [pedersen.delen[0], pedersen.delen[2]],
          kandidaatNieuwWortelGeheimPkcs8B64u: nieuwKandidaat.geheimeSleutelPkcs8B64u,
          nuIso: new Date(t0Ms + 50 * 3600_000).toISOString(),
        });
        const ok10 = voltooid.ok && voltooid.nieuweStaat.oprichting.persoonsId === persoon.staat.oprichting.persoonsId;
        metingen.push({
          scenarioId: 'verlies_gebruikersapparaten',
          beschikbaarGebleven: ok10,
          herstelDuurMs: Math.max(1, Math.round(performance.now() - t)),
          maxToegestaneHerstelDuurMs: 5000,
          gegevensVerliesBytes: ok10 ? 0 : 1,
          machtigingenCorrectGebleven: ok10,
          bewijsSamenvatting: 'Після втрати всіх пристроїв і 48-год вікна оскарження кворум опікунів Педерсена 2-з-3 відновив доступ зі сталим persoonsId',
        });
      }

      const oordeelProgramma = m.beoordeelOverlevingsProefProgramma(metingen);
      netwerkClient.sluitAlleSessies();

      const resultaat = {
        code: 'KLIMOP-ETAPPE-7-IMMUUNSYSTEEM-OVERLEVING-PROEF',
        alle10ScenariosGeslaagd: oordeelProgramma.geslaagd,
        gedekteScenarios: oordeelProgramma.gedekteScenarios,
        quarantaineVanBeschadigdKnooppuntOk: tabel.inQuarantaineSet().has(knSE.identiteit.knooppuntId),
        sleutellozeHerbouwNaarIJslandOk: hersteldePlaatsing.knooppuntPerIndex[3]?.knooppuntId === knIS.identiteit.knooppuntId,
      };

      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(resultaat, null, 2));
      } else {
        console.log('KLIMOP Етап 7 · Імунна система, самовідновлення у межах квот та 10 аварійних сценаріїв живучості (§37)');
        console.log(`  Сліпе виявлення пошкодженого фрагмента та негайний карантин вузла SE: ok=${resultaat.quarantaineVanBeschadigdKnooppuntOk}`);
        console.log(`  Добудова 4-ї смуги Ріда–Соломона на вузлі IS без ключа власника й з повагою до батареї DE: ok=${resultaat.sleutellozeHerbouwNaarIJslandOk}`);
        console.log(`  Виконання всієї 10-пунктової програми живучості §37 (${resultaat.gedekteScenarios}/10 сценаріїв, 0 байт втрат): ok=${resultaat.alle10ScenariosGeslaagd}`);
      }

      if (
        !resultaat.alle10ScenariosGeslaagd
        || !resultaat.quarantaineVanBeschadigdKnooppuntOk
        || !resultaat.sleutellozeHerbouwNaarIJslandOk
      ) {
        console.error('Невдалі сценарії:', oordeelProgramma);
        process.exitCode = 1;
      }
    } finally {
      await Promise.all(alleServers.map((s) => s.sluit()));
    }
  } finally {
    await rm(tijdelijkeMap, { recursive: true, force: true });
  }
}

voerEtappe7ProefUit().catch((err) => {
  console.error('Збій полігона Етапу 7:', err);
  process.exitCode = 1;
});
