#!/usr/bin/env node
// KLIMOP-005 (20.11.2026, Етап 4 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний сценарій полігона Етапу 4 (працює виключно локально на 127.0.0.1, без звернень до робочого сервера чи PostgreSQL):
//   1. Піднімає 3 незалежні вузли у 3 країнах і 3 постачальників (NL, CH, UA) та пристрій координації.
//   2. Проводить розподілене створення порогового ключа 2-з-3 без єдиного дилера (DKG) — повний закритий ключ НІКОЛИ не існує в одному місці!
//   3. Переводить у карантин вузол CH і створює пороговий підпис FROST(Ed25519, SHA-512) за RFC 9591 силами пари NL + UA;
//      перевіряє 64-байтний підпис стандартним вбудованим node:crypto.verify за публічним ключем SPKI DER Ed25519.
//   4. Повертає CH, симулює перервану ротацію епохи (безпечне відкочування на епоху 1 без втрати працездатності),
//      а потім виконує повний перехід в епоху 2 (проактивне оновлення часток без зміни публічного ключа групи!).
//   5. Переводить у карантин вузол NL і в епосі 2 створює новий пороговий підпис FROST силами пари CH + UA,
//      який знову перевіряється тим самим незмінним груповим публічним ключем Ed25519 у node:crypto.verify!
//   6. KLIMOP-019: готує перехід в епоху 3, вимикає процес CH після підготовки (втрата зв'язку), підтверджує
//      рішення на NL і UA, перезапускає CH із зашифрованого файла стану й повторює те саме підтвердження —
//      усі три вузли опиняються в епосі 3, а пара CH + UA підписує під тим самим ключем групи.
// Запуск: node scripts/klimop-etappe4-frost-proef.mjs [--json]

import { build } from 'esbuild';
import { createPublicKey, verify } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function voerEtappe4ProefUit() {
  await mkdir('rapporten', { recursive: true });
  const tijdelijkeMap = await mkdtemp(join('rapporten', 'klimop-etappe4-proef-'));
  const bundelPad = resolve(tijdelijkeMap, 'etappe4-bundel.mjs');

  try {
    await build({
      stdin: {
        contents: `
          export * from './shared/klimop/kern.ts';
          export * from './shared/klimop/stengels.ts';
          export * from './shared/klimop/drempelsleutels.ts';
          export * from './backend/klimop-knooppunt-agent.ts';
          export * from './backend/klimop-drempel-client.ts';
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

    const opdrachtgever = m.maakKlimopKnooppunt({
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

    const srvNL = await m.startKlimopProefKnooppunt({ knooppunt: knNL });
    const staatBestandCH = resolve(tijdelijkeMap, 'knooppunt-ch.staat');
    let srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knCH, staatBestand: staatBestandCH });
    const srvUA = await m.startKlimopProefKnooppunt({ knooppunt: knUA });

    try {
      const tabel = new m.KlimopRouteTabel();
      const idO = opdrachtgever.identiteit.knooppuntId;
      for (const s of [srvNL, srvCH, srvUA]) {
        tabel.voegTweerichtingsStengelToe(idO, s.identiteit.knooppuntId, 1);
      }
      const adressen = new Map([
        [srvNL.identiteit.knooppuntId, srvNL.basisUrl],
        [srvCH.identiteit.knooppuntId, srvCH.basisUrl],
        [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
      ]);

      const netwerkClient = new m.KlimopNetwerkClient(opdrachtgever, adressen, tabel);
      const drempelClient = new m.KlimopDrempelOndertekenaarClient(netwerkClient);

      // 1. Бездилерський DKG 2-з-3 між NL, CH та UA
      const dkgUit = await drempelClient.voerNetwerkDkgUit({
        setId: 'frost-groep-proef-001',
        opdrachtgever,
        knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
        drempel: 2,
        nuIso,
        verlooptOpIso,
      });
      if (!dkgUit.ok) throw new Error(`Збій DKG: ${dkgUit.fout}`);

      const spkiSleutel = createPublicKey({
        key: Buffer.from(dkgUit.groep.groepsPubliekeSleutelSpkiB64u, 'base64url'),
        format: 'der',
        type: 'spki',
      });

      // 2. Пороговий підпис FROST 2-з-3 у епосі 1 при недоступному CH (підписують NL + UA)
      tabel.plaatsInQuarantaine(knCH.identiteit.knooppuntId);
      const boodschapEp1 = Buffer.from('Кворумне схвалення випуску екосистеми «Плющ» — епоха 1', 'utf8');
      const sigEp1 = await drempelClient.tekenMetFrostQuorum({
        groep: dkgUit.groep,
        boodschap: boodschapEp1,
      });
      const sigEp1GeldigInNodeCrypto =
        sigEp1.ok && verify(null, boodschapEp1, spkiSleutel, Buffer.from(sigEp1.handtekeningHex, 'hex'));

      // 3. Відновлюємо CH, перевіряємо безпечне відкочування перерваної ротації, а далі переводимо всі частки в епоху 2
      tabel.haalUitQuarantaine(knCH.identiteit.knooppuntId);
      const afgebroken = await drempelClient.verversEpocheOpNetwerk({
        groep: dkgUit.groep,
        simuleerAfbrekingVoorBevestiging: true,
      });
      const afbrekingBehoudtEp1 =
        afgebroken.ok
        && afgebroken.afgerondeActie === 'afbreken'
        && srvNL.actieveDrempelEpoche('frost-groep-proef-001') === 1;

      const ververst = await drempelClient.verversEpocheOpNetwerk({
        groep: dkgUit.groep,
      });
      if (!ververst.ok) throw new Error(`Збій оновлення епохи: ${ververst.fout}`);

      const alleOpEpoche2 =
        ververst.vernieuwdeGroep.epoche === 2
        && srvNL.actieveDrempelEpoche('frost-groep-proef-001') === 2
        && srvCH.actieveDrempelEpoche('frost-groep-proef-001') === 2
        && srvUA.actieveDrempelEpoche('frost-groep-proef-001') === 2
        && ververst.vernieuwdeGroep.groepsPubliekeSleutelHex === dkgUit.groep.groepsPubliekeSleutelHex;

      // 4. Вимикаємо тепер вузол NL і підписуємо іншою парою (CH + UA) в епосі 2 — під тим самим публічним ключем!
      tabel.plaatsInQuarantaine(knNL.identiteit.knooppuntId);
      const boodschapEp2 = Buffer.from('Кворумне схвалення після проактивної зміни епохи — епоха 2', 'utf8');
      const sigEp2 = await drempelClient.tekenMetFrostQuorum({
        groep: ververst.vernieuwdeGroep,
        boodschap: boodschapEp2,
      });
      const sigEp2GeldigInNodeCrypto =
        sigEp2.ok && verify(null, boodschapEp2, spkiSleutel, Buffer.from(sigEp2.handtekeningHex, 'hex'));

      // 5. KLIMOP-019: стійкий двофазний перехід в епоху 3 із перезапуском CH між фазами
      tabel.haalUitQuarantaine(knNL.identiteit.knooppuntId);
      const vb3 = await drempelClient.bereidEpocheVerversingVoorOpNetwerk({ groep: ververst.vernieuwdeGroep });
      if (!vb3.ok) throw new Error(`Збій підготовки епохи 3: ${vb3.fout}`);
      await srvCH.sluit();
      const zonderCH = await drempelClient.rondEpocheVerversingAfOpNetwerk({
        groep: ververst.vernieuwdeGroep,
        voorbereiding: vb3.voorbereiding,
        besluit: 'bevestig',
        maxPogingen: 1,
        wachtMs: 0,
      });
      const onvoltooidZonderCH = !zonderCH.ok
        && zonderCH.fout === 'AFRONDING_ONVOLTOOID'
        && JSON.stringify(zonderCH.openstaandeIndexen) === JSON.stringify([2]);
      srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knCH, staatBestand: staatBestandCH });
      adressen.set(knCH.identiteit.knooppuntId, srvCH.basisUrl);
      netwerkClient.sluitAlleSessies();
      const herhaald = await drempelClient.rondEpocheVerversingAfOpNetwerk({
        groep: ververst.vernieuwdeGroep,
        voorbereiding: vb3.voorbereiding,
        besluit: 'bevestig',
        maxPogingen: 2,
        wachtMs: 50,
      });
      const alleOpEpoche3NaHerstart = onvoltooidZonderCH
        && herhaald.ok
        && herhaald.vernieuwdeGroep.epoche === 3
        && srvNL.actieveDrempelEpoche('frost-groep-proef-001') === 3
        && srvCH.actieveDrempelEpoche('frost-groep-proef-001') === 3
        && srvUA.actieveDrempelEpoche('frost-groep-proef-001') === 3;
      let sigEp3GeldigInNodeCrypto = false;
      if (herhaald.ok) {
        tabel.plaatsInQuarantaine(knNL.identiteit.knooppuntId);
        const boodschapEp3 = Buffer.from('Кворумне схвалення після перезапуску вузла між фазами — епоха 3', 'utf8');
        const sigEp3 = await drempelClient.tekenMetFrostQuorum({ groep: herhaald.vernieuwdeGroep, boodschap: boodschapEp3 });
        sigEp3GeldigInNodeCrypto = sigEp3.ok && verify(null, boodschapEp3, spkiSleutel, Buffer.from(sigEp3.handtekeningHex, 'hex'));
      }

      netwerkClient.sluitAlleSessies();

      const resultaat = {
        code: 'KLIMOP-ETAPPE-4-FROST-PROEF',
        dkgOk: dkgUit.ok,
        sigEp1GeldigInNodeCrypto,
        ondertekenaarsEp1: sigEp1.ok ? sigEp1.ondertekenaarIndexen : [],
        afbrekingBehoudtEp1,
        alleOpEpoche2,
        sigEp2GeldigInNodeCrypto,
        ondertekenaarsEp2: sigEp2.ok ? sigEp2.ondertekenaarIndexen : [],
        alleOpEpoche3NaHerstart,
        sigEp3GeldigInNodeCrypto,
      };

      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(resultaat, null, 2));
      } else {
        console.log('KLIMOP Етап 4 · Бездилерський DKG, порогові підписи FROST (RFC 9591) та проактивні епохи');
        console.log(`  Розподілене створення ключа 2-з-3 без єдиного дилера (NL, CH, UA): ok=${resultaat.dkgOk}`);
        console.log(`  Пороговий підпис FROST в епосі 1 при вимкненому CH (перевірено node:crypto.verify): ok=${resultaat.sigEp1GeldigInNodeCrypto}`);
        console.log(`  Безпечне відкочування при перерваній процедурі оновлення часток: ok=${resultaat.afbrekingBehoudtEp1}`);
        console.log(`  Проактивний перехід в епоху 2 зі збереженням незмінного публічного ключа групи: ok=${resultaat.alleOpEpoche2}`);
        console.log(`  Пороговий підпис FROST в епосі 2 парою CH + UA під тим самим ключем Ed25519: ok=${resultaat.sigEp2GeldigInNodeCrypto}`);
        console.log(`  Перехід в епоху 3 завершено після перезапуску CH між фазами (стан із файла): ok=${resultaat.alleOpEpoche3NaHerstart}`);
        console.log(`  Пороговий підпис FROST в епосі 3 парою CH + UA після перезапуску: ok=${resultaat.sigEp3GeldigInNodeCrypto}`);
      }

      if (
        !sigEp1GeldigInNodeCrypto || !afbrekingBehoudtEp1 || !alleOpEpoche2 || !sigEp2GeldigInNodeCrypto
        || !alleOpEpoche3NaHerstart || !sigEp3GeldigInNodeCrypto
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

voerEtappe4ProefUit().catch((err) => {
  console.error('Збій полігона Етапу 4:', err);
  process.exitCode = 1;
});
