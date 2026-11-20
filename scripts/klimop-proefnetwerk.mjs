#!/usr/bin/env node
// KLIMOP-003 (20.11.2026, Етап 2 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний сценарій локальної випробувальної мережі з 3 незалежних вузлів (NL, CH, UA) та особистого пристрою власника.
// Працює виключно на тимчасових портах 127.0.0.1 у пам'яті, не торкається бойового сервера і не відкриває з'єднань до PostgreSQL.
// Запуск: node scripts/klimop-proefnetwerk.mjs [--json]

import { build } from 'esbuild';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function draaiProefnetwerk() {
  await mkdir('rapporten', { recursive: true });
  const tijdelijkeMap = await mkdtemp(join('rapporten', 'klimop-proef-'));
  const bundelPad = resolve(tijdelijkeMap, 'proefnetwerk-bundel.mjs');

  try {
    await build({
      stdin: {
        contents: `
          export * from './shared/klimop/kern.ts';
          export * from './shared/klimop/stengels.ts';
          export * from './backend/klimop-knooppunt-agent.ts';
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

    // 1. Створення 3 постійних незалежних вузлів у різних юрисдикціях і постачальників + особистого пристрою власника даних
    const knoopNL = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verbinding', 'verificatie'],
      juridischeRegio: 'NL',
      aanbieder: 'eigen-knoop-nl',
    });
    const knoopCH = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verbinding', 'verificatie', 'opslag'],
      juridischeRegio: 'CH',
      aanbieder: 'onafhankelijke-knoop-ch',
    });
    const knoopUA = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verificatie', 'herstel'],
      juridischeRegio: 'UA',
      aanbieder: 'onafhankelijke-knoop-ua',
    });
    const mensApparaat = m.maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['opslag', 'herstel', 'verificatie'],
      juridischeRegio: 'NL',
      aanbieder: 'persoonlijk-toestel',
    });

    const spreiding = m.controleerKnooppuntOnafhankelijkheid(
      [knoopNL.identiteit, knoopCH.identiteit, knoopUA.identiteit],
      2,
    );

    const srvNL = await m.startKlimopProefKnooppunt({ knooppunt: knoopNL });
    const srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knoopCH });
    const srvUA = await m.startKlimopProefKnooppunt({ knooppunt: knoopUA });

    try {
      for (const a of [srvNL, srvCH, srvUA]) {
        for (const b of [srvNL, srvCH, srvUA]) {
          if (a.identiteit.knooppuntId !== b.identiteit.knooppuntId) {
            a.registreerBuurAdres(b.identiteit.knooppuntId, b.basisUrl);
          }
        }
      }

      const adressen = new Map([
        [srvNL.identiteit.knooppuntId, srvNL.basisUrl],
        [srvCH.identiteit.knooppuntId, srvCH.basisUrl],
        [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
      ]);

      const routeTabel = new m.KlimopRouteTabel();
      routeTabel.voegTweerichtingsStengelToe(mensApparaat.identiteit.knooppuntId, srvNL.identiteit.knooppuntId, 1);
      routeTabel.voegTweerichtingsStengelToe(mensApparaat.identiteit.knooppuntId, srvCH.identiteit.knooppuntId, 1);
      routeTabel.voegTweerichtingsStengelToe(mensApparaat.identiteit.knooppuntId, srvUA.identiteit.knooppuntId, 1);
      routeTabel.voegTweerichtingsStengelToe(srvNL.identiteit.knooppuntId, srvCH.identiteit.knooppuntId, 1);
      routeTabel.voegTweerichtingsStengelToe(srvCH.identiteit.knooppuntId, srvUA.identiteit.knooppuntId, 1);
      routeTabel.voegTweerichtingsStengelToe(srvNL.identiteit.knooppuntId, srvUA.identiteit.knooppuntId, 2);

      const clientMens = new m.KlimopNetwerkClient(mensApparaat, adressen, routeTabel);

      // 2. Сценарій А: клієнтське шифрування блока на пристрої людини й прямий запис на вузол UA за мандатом Ed25519
      const dekMens = randomBytes(32);
      const ivBlok = randomBytes(12);
      const klareGegevens = Buffer.from('Особистий зашифрований запис екосистеми Плющ · Етап 2', 'utf8');
      const cipher = createCipheriv('chacha20-poly1305', dekMens, ivBlok, { authTagLength: 16 });
      const versleuteldBlok = Buffer.concat([ivBlok, cipher.update(klareGegevens), cipher.final(), cipher.getAuthTag()]);
      const blokSha256 = createHash('sha256').update(versleuteldBlok).digest('hex');

      const nu = Date.now();
      const mandaatUA = m.ondertekenKlimopMandaat(
        {
          schema: 1,
          mandaatId: 'proef-mnd-ua-001',
          uitgeverKnooppuntId: mensApparaat.identiteit.knooppuntId,
          ontvangerKnooppuntId: srvUA.identiteit.knooppuntId,
          machtDomein: 'persoonlijke_gegevens',
          toegestaneRollen: ['opslag'],
          toegestaneOpslagLagen: ['grote_versleutelde_objecten'],
          alleenMetDrempelQuorum: false,
          drempelVereist: null,
          uitgegevenOp: new Date(nu - 60_000).toISOString(),
          verlooptOp: new Date(nu + 3_600_000).toISOString(),
        },
        mensApparaat,
      );

      const directOpslaan = await clientMens.roepOpdrachtAan(srvUA.identiteit.knooppuntId, {
        actie: 'bewaar_blok',
        blokSha256,
        cijfertekstB64u: versleuteldBlok.toString('base64url'),
        mandaat: mandaatUA,
      });

      // 3. Сценарій Б: розрив прямого стебла (Пристрій людини ↔ Вузол UA) та автоматична доставка через естафетний вузол CH
      routeTabel.markeerStengelStaat(mensApparaat.identiteit.knooppuntId, srvUA.identiteit.knooppuntId, 'verbroken');
      const viaEstafetteOphalen = await clientMens.roepOpdrachtAan(srvUA.identiteit.knooppuntId, {
        actie: 'haal_blok',
        blokSha256,
        mandaat: mandaatUA,
      });

      // 4. Сценарій В: переведення вузла NL у карантин та перевірка безперебійної роботи CH + UA
      srvCH.plaatsKnooppuntInQuarantaine(srvNL.identiteit.knooppuntId);
      srvUA.plaatsKnooppuntInQuarantaine(srvNL.identiteit.knooppuntId);
      routeTabel.plaatsInQuarantaine(srvNL.identiteit.knooppuntId);

      const naQuarantaineNaarNL = await clientMens.roepOpdrachtAan(srvNL.identiteit.knooppuntId, {
        actie: 'ping',
        bericht: 'перевірка карантину',
      });
      const gezondCH = await clientMens.roepOpdrachtAan(srvCH.identiteit.knooppuntId, {
        actie: 'ping',
        bericht: 'мережа живе після ізоляції одного вузла',
      });

      clientMens.sluitAlleSessies();
      dekMens.fill(0);

      return {
        schema: 1,
        code: 'KLIMOP-ETAPPE-2-PROEFNETWERK',
        spreidingOk: spreiding.ok,
        uniekeRegios: spreiding.uniekeRegios,
        uniekeAanbieders: spreiding.uniekeAanbieders,
        directOpslaanOk: directOpslaan.antwoord.ok === true && directOpslaan.gebruiktPad.length === 2,
        estafetteOmleidingOk:
          viaEstafetteOphalen.antwoord.ok === true
          && viaEstafetteOphalen.gebruiktPad.length === 3
          && srvCH.estafetteTeller() >= 1
          && srvCH.aantalOpgeslagenBlokken() === 0,
        quarantaineIsolatieOk:
          naQuarantaineNaarNL.antwoord.ok === false
          && gezondCH.antwoord.ok === true,
      };
    } finally {
      await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit()]);
    }
  } finally {
    await rm(tijdelijkeMap, { recursive: true, force: true });
  }
}

const rapport = await draaiProefnetwerk();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rapport, null, 2));
} else {
  console.log('KLIMOP Етап 2 · Випробувальна мережа з 3 незалежних вузлів (NL, CH, UA)');
  console.log(`  Незалежність юрисдикцій і постачальників: ok=${rapport.spreidingOk} (регіонів=${rapport.uniekeRegios}, постачальників=${rapport.uniekeAanbieders})`);
  console.log(`  Пряме захищене стебло (X25519 + Ed25519 + ChaCha20-Poly1305): ok=${rapport.directOpslaanOk}`);
  console.log(`  Автоматичний обхід обриву через естафетний вузол CH без розкриття даних: ok=${rapport.estafetteOmleidingOk}`);
  console.log(`  Карантин вузла зі збереженням роботи решти мережі: ok=${rapport.quarantaineIsolatieOk}`);
}
if (!rapport.spreidingOk || !rapport.directOpslaanOk || !rapport.estafetteOmleidingOk || !rapport.quarantaineIsolatieOk) {
  process.exit(1);
}
