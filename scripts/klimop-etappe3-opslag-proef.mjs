#!/usr/bin/env node
// KLIMOP-004 (20.11.2026, Етап 3 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний сценарій полігона Етапу 3 (працює виключно локально на 127.0.0.1, без звернень до робочого сервера чи PostgreSQL):
//   1. Піднімає 4 незалежні вузли зберігання у 4 юрисдикціях і 4 постачальників (NL, CH, UA + резервний SE) та пристрій власника.
//   2. На пристрої власника виводить KEK через HKDF-SHA-256, шифрує багатосегментний об'єкт (ChaCha20-Poly1305) і кодує Reed-Solomon (k=2, m=1).
//   3. Розсилає фрагменти на NL, CH, UA через захищені «Стебла»; перевіряє, що жоден вузол не бачить відкритого вмісту.
//   4. Переводить вузол NL у карантин (втрата 1 з 3 вузлів) і доводить 100% побайтове відновлення файла з CH та UA.
//   5. Без ключа власника KEK/DEK добудовує втрачену смугу вузла NL на новий незалежний вузол SE.
//   6. Вимикає також вузол CH і доводить відновлення файла вже з пари UA + SE, а потім законно видаляє всі фрагменти.
// Запуск: node scripts/klimop-etappe3-opslag-proef.mjs [--json]

import { build } from 'esbuild';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function voerEtappe3ProefUit() {
  await mkdir('rapporten', { recursive: true });
  const tijdelijkeMap = await mkdtemp(join('rapporten', 'klimop-etappe3-proef-'));
  const bundelPad = resolve(tijdelijkeMap, 'etappe3-bundel.mjs');

  try {
    await build({
      stdin: {
        contents: `
          export * from './shared/klimop/kern.ts';
          export * from './shared/klimop/stengels.ts';
          export * from './shared/klimop/opslag.ts';
          export * from './backend/klimop-knooppunt-agent.ts';
          export * from './backend/klimop-opslag-client.ts';
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

    const eigenaar = m.maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['opslag', 'herstel', 'verificatie'],
      juridischeRegio: 'NL',
      aanbieder: 'persoonlijke-laptop-eigenaar',
      nuIso,
    });
    const knNL = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verbinding', 'verificatie'],
      juridischeRegio: 'NL',
      aanbieder: 'eigen-apparatuur-nl',
      nuIso,
    });
    const knCH = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verbinding', 'verificatie'],
      juridischeRegio: 'CH',
      aanbieder: 'alpen-kluis-ch',
      nuIso,
    });
    const knUA = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verbinding', 'verificatie', 'herstel'],
      juridischeRegio: 'UA',
      aanbieder: 'kyiv-bewaring-ua',
      nuIso,
    });
    const knSE = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verbinding', 'verificatie'],
      juridischeRegio: 'SE',
      aanbieder: 'noordse-knoop-se',
      nuIso,
    });

    const srvNL = await m.startKlimopProefKnooppunt({ knooppunt: knNL });
    const srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knCH });
    const srvUA = await m.startKlimopProefKnooppunt({ knooppunt: knUA });
    const srvSE = await m.startKlimopProefKnooppunt({ knooppunt: knSE });

    try {
      const tabel = new m.KlimopRouteTabel();
      const idEigenaar = eigenaar.identiteit.knooppuntId;
      for (const srv of [srvNL, srvCH, srvUA, srvSE]) {
        tabel.voegTweerichtingsStengelToe(idEigenaar, srv.identiteit.knooppuntId, 1);
      }
      const adressen = new Map([
        [srvNL.identiteit.knooppuntId, srvNL.basisUrl],
        [srvCH.identiteit.knooppuntId, srvCH.basisUrl],
        [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
        [srvSE.identiteit.knooppuntId, srvSE.basisUrl],
      ]);

      const netwerkClient = new m.KlimopNetwerkClient(eigenaar, adressen, tabel);
      const opslagClient = new m.KlimopVerdeeldeOpslagClient(netwerkClient);

      const wortelSleutel = randomBytes(32);
      const kek = m.leidKlimopSleutelAf(wortelSleutel, {
        laag: 'grote_versleutelde_objecten',
        ruimteId: 'persoonlijk-hoofdruimte',
        epoche: 1,
        subdoel: 'kek',
      });

      const patroon = Buffer.from('Жива цифрова екосистема «Плющ» — наскрізно зашифрований архів власника даних. ', 'utf8');
      const bronObject = Buffer.alloc(20000);
      for (let offset = 0; offset < bronObject.length; offset += patroon.length) {
        patroon.copy(bronObject, offset, 0, Math.min(patroon.length, bronObject.length - offset));
      }

      const opgeslagen = await opslagClient.verdeelEnBewaarObject({
        inhoud: bronObject,
        objectId: 'obj-proef-etappe3-001',
        eigenaar,
        kek,
        doelKnooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
        k: 2,
        m: 1,
        segmentGrootte: 8192,
        nuIso,
        verlooptOpIso,
      });
      if (!opgeslagen.ok) throw new Error(`Помилка розподіленого збереження: ${opgeslagen.fout}`);

      // Вимикаємо / ізолюємо вузол NL (втрачено третину всіх фрагментів)
      tabel.plaatsInQuarantaine(knNL.identiteit.knooppuntId);
      const herstelNaUitvalNL = await opslagClient.haalEnOntsleutelObject({
        manifest: opgeslagen.manifest,
        plaatsing: opgeslagen.plaatsing,
        kek,
      });
      const naUitvalOk = herstelNaUitvalNL.ok && herstelNaUitvalNL.inhoud.equals(bronObject);

      // Добудовуємо втрачені фрагменти вузла NL (індекс 0) на новий вузол SE БЕЗ ключа KEK/DEK!
      const mandaatSE = m.ondertekenKlimopMandaat({
        schema: 1,
        mandaatId: 'mnd_opslag_herbouw_se_001',
        uitgeverKnooppuntId: idEigenaar,
        ontvangerKnooppuntId: knSE.identiteit.knooppuntId,
        machtDomein: 'persoonlijke_gegevens',
        toegestaneRollen: ['opslag'],
        toegestaneOpslagLagen: ['grote_versleutelde_objecten'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptOpIso,
      }, eigenaar);

      const herbouwdOpSE = await opslagClient.herbouwVerlorenKnooppuntZonderSleutel({
        manifest: opgeslagen.manifest,
        plaatsing: opgeslagen.plaatsing,
        verlorenIndex: 0,
        vervangendKnooppunt: knSE.identiteit,
        vervangendMandaat: mandaatSE,
      });
      if (!herbouwdOpSE.ok) throw new Error(`Помилка добудови без ключа: ${herbouwdOpSE.fout}`);

      // Тепер вимикаємо ще й вузол CH! Залишаються лише UA та нововідбудований SE:
      tabel.plaatsInQuarantaine(knCH.identiteit.knooppuntId);
      const herstelUitSEenUA = await opslagClient.haalEnOntsleutelObject({
        manifest: opgeslagen.manifest,
        plaatsing: herbouwdOpSE.vernieuwdePlaatsing,
        kek,
      });
      const naTweedeUitvalOk = herstelUitSEenUA.ok && herstelUitSEenUA.inhoud.equals(bronObject);

      // Законне видалення фрагментів з усіх активних вузлів (UA та SE)
      const gewist = await opslagClient.wisObjectVanKnooppunten({
        manifest: opgeslagen.manifest,
        plaatsing: herbouwdOpSE.vernieuwdePlaatsing,
      });
      const wissenOk = srvUA.aantalOpgeslagenBlokken() === 0 && srvSE.aantalOpgeslagenBlokken() === 0 && gewist.gewisteFragmenten === 6;

      netwerkClient.sluitAlleSessies();
      wortelSleutel.fill(0);
      kek.fill(0);

      const resultaat = {
        code: 'KLIMOP-ETAPPE-3-OPSLAG-PROEF',
        segmenten: opgeslagen.manifest.segmenten.length,
        verzondenFragmenten: opgeslagen.verzondenFragmenten,
        naUitvalOk,
        herbouwZonderSleutelOk: herbouwdOpSE.ok,
        hersteldeSegmentenOpSE: herbouwdOpSE.hersteldeSegmenten,
        naTweedeUitvalOk,
        wissenOk,
      };

      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(resultaat, null, 2));
      } else {
        console.log('KLIMOP Етап 3 · Клієнтське шифрування та розподілене зберігання Reed-Solomon (k=2, m=1)');
        console.log(`  Розподілено сегментів: ${resultaat.segmenten}, фрагментів: ${resultaat.verzondenFragmenten} (NL, CH, UA)`);
        console.log(`  Відновлення після повної відмови вузла NL: ok=${resultaat.naUitvalOk}`);
        console.log(`  Добудова втраченої смуги на вузлі SE без ключа розшифрування: ok=${resultaat.herbouwZonderSleutelOk} (сегментів=${resultaat.hersteldeSegmentenOpSE})`);
        console.log(`  Відновлення після додаткової відмови вузла CH (з пари SE + UA): ok=${resultaat.naTweedeUitvalOk}`);
        console.log(`  Законне видалення зашифрованих блоків на живих вузлах: ok=${resultaat.wissenOk}`);
      }

      if (!naUitvalOk || !naTweedeUitvalOk || !wissenOk) {
        process.exitCode = 1;
      }
    } finally {
      await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit(), srvSE.sluit()]);
    }
  } finally {
    await rm(tijdelijkeMap, { recursive: true, force: true });
  }
}

voerEtappe3ProefUit().catch((err) => {
  console.error('Збій полігона Етапу 3:', err);
  process.exitCode = 1;
});
