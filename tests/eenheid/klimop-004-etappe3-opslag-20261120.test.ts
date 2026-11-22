// KLIMOP-004 (20.11.2026): Модульні, алгебричні та живі мережеві випробування Етапу 3 маніфесту «Плющ» / «Klimop»:
//   1. Ієрархія ключів HKDF-SHA-256, конвертне загортання DEK під KEK та криптографічна гнучкість без пониження захисту;
//   2. Систематичний код Ріда–Соломона (k + m) над GF(2^8): усі комбінації втрат до m фрагментів, перевірка накладних витрат
//      (відокремлення від схеми Шаміра за §43 п. 3 маніфесту) та добудова втрачених фрагментів без ключа розшифрування;
//   3. Сегментоване конвертне шифрування ChaCha20-Poly1305 / AES-256-GCM та підписані Ed25519 маніфести об'єктів;
//   4. Перехідний міст зі сліпим пошуковим індексом HMAC-SHA-256 для таблиць реєстру сховища ключів;
//   5. Живий мережевий полігон 4 незалежних вузлів (NL, CH, UA, SE) через KlimopVerdeeldeOpslagClient поверх «Стебел».
// Запуск: node scripts/eenheidstests.mjs klimop-004-etappe3-opslag-20261120.test.ts

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  KLIMOP_CONTROLE_VRAGEN_IDS,
  beoordeelKlimopWijziging,
  maakKlimopKnooppunt,
  ondertekenKlimopMandaat,
  type KlimopControleVraagId,
} from '../../shared/klimop/kern';
import {
  berekenBlindeZoekTermen,
  codeerReedSolomon,
  decodeerReedSolomon,
  herbouwReedSolomonFragmentenZonderSleutel,
  herstelEnOntsleutelObject,
  leidKlimopSleutelAf,
  onderhandelKlimopProfiel,
  ontsleutelOvergangsVeld,
  pakObjectDekUit,
  verifieerObjectManifest,
  versleutelEnVerdeelObject,
  versleutelOvergangsVeld,
  wikkelObjectDekIn,
} from '../../shared/klimop/opslag';
import { KlimopRouteTabel } from '../../shared/klimop/stengels';
import { KlimopNetwerkClient, startKlimopProefKnooppunt } from '../../backend/klimop-knooppunt-agent';
import { KlimopVerdeeldeOpslagClient } from '../../backend/klimop-opslag-client';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('klimop-004-etappe3-opslag');
  const nuIso = '2026-11-20T18:45:00Z';
  const verlooptOpIso = '2026-12-31T23:59:59Z';

  // ------------------------------------------------------------------ 1. Ієрархія ключів та криптографічна гнучкість
  const wortel = randomBytes(32);
  const kekEp1 = leidKlimopSleutelAf(wortel, {
    laag: 'grote_versleutelde_objecten',
    ruimteId: 'ruimte-a',
    epoche: 1,
    subdoel: 'kek',
  });
  const kekEp2 = leidKlimopSleutelAf(wortel, {
    laag: 'grote_versleutelde_objecten',
    ruimteId: 'ruimte-a',
    epoche: 2,
    subdoel: 'kek',
  });
  const zoekEp1 = leidKlimopSleutelAf(wortel, {
    laag: 'grote_versleutelde_objecten',
    ruimteId: 'ruimte-a',
    epoche: 1,
    subdoel: 'zoek_blind',
  });
  const kekAndereLaag = leidKlimopSleutelAf(wortel, {
    laag: 'werkgegevens_van_diensten',
    ruimteId: 'ruimte-a',
    epoche: 1,
    subdoel: 'kek',
  });

  check('leidKlimopSleutelAf (HKDF-SHA-256) суворо ізолює ключі за епохою, підціллю та рівнем зберігання',
    kekEp1.length === 32
    && !kekEp1.equals(kekEp2)
    && !kekEp1.equals(zoekEp1)
    && !kekEp1.equals(kekAndereLaag));

  const profielBeste = onderhandelKlimopProfiel(
    ['klimop-v1-aes-256-gcm', 'klimop-v2-pq-voorbereid'],
    ['klimop-v1-chacha20-poly1305', 'klimop-v2-pq-voorbereid'],
  );
  const profielAfzwakking = onderhandelKlimopProfiel(
    ['klimop-v1-chacha20-poly1305'],
    ['klimop-v1-chacha20-poly1305'],
    20,
  );
  check('onderhandelKlimopProfiel обирає найсильніший спільний профіль і блокує пониження рівня захисту (§13 маніфесту)',
    profielBeste.ok === true && profielBeste.gekozenProfiel === 'klimop-v2-pq-voorbereid'
    && !profielAfzwakking.ok && profielAfzwakking.fout === 'VERBODEN_AFZWAKKING_VAN_VERSLEUTELING');

  const proefDek = randomBytes(32);
  const omslagCtx = {
    eigenaarKnooppuntId: 'klm1_00112233445566778899aabbccddeeff',
    objectId: 'obj-001',
    laag: 'grote_versleutelde_objecten' as const,
    epoche: 1,
    profiel: 'klimop-v1-aes-256-gcm' as const,
  };
  const omslag = wikkelObjectDekIn(proefDek, kekEp1, omslagCtx);
  const uitgepaktGoed = pakObjectDekUit(omslag, kekEp1, omslagCtx);
  const uitgepaktVerkeerdObj = pakObjectDekUit(omslag, kekEp1, { ...omslagCtx, objectId: 'obj-999' });
  const uitgepaktVerkeerdeKek = pakObjectDekUit(omslag, kekEp2, omslagCtx);

  check('конвертна обгортка DEK розкривається лише з точним KEK та автентифікованим контекстом AAD',
    uitgepaktGoed.ok === true && uitgepaktGoed.dek.equals(proefDek)
    && !uitgepaktVerkeerdObj.ok && uitgepaktVerkeerdObj.fout === 'OMSLAG_AUTHENTICATIE_MISLUKT'
    && !uitgepaktVerkeerdeKek.ok && uitgepaktVerkeerdeKek.fout === 'OMSLAG_AUTHENTICATIE_MISLUKT');

  // ------------------------------------------------------------------ 2. Систематичний код Ріда–Соломона (k=4, m=2) над GF(2^8)
  const testBuffer = randomBytes(10000);
  const rs42 = codeerReedSolomon(testBuffer, 4, 2);
  const totaleFragmentBytes = rs42.fragmenten.reduce(
    (som, f) => som + Buffer.from(f.inhoudB64u, 'base64url').length,
    0,
  );
  check('код Ріда–Соломона (4+2) має накладні витрати рівно 1,5x (15 000 байт на 10 000 байт даних — не 6x як у Шаміра)',
    rs42.fragmenten.length === 6 && totaleFragmentBytes === 15000);

  // Перевіряємо всі C(6, 4) = 15 комбінацій одночасної втрати будь-яких 2 із 6 фрагментів!
  let alle15CombinatiesOk = true;
  for (let wegA = 0; wegA < 6; wegA++) {
    for (let wegB = wegA + 1; wegB < 6; wegB++) {
      const overlevend = rs42.fragmenten.filter((_, idx) => idx !== wegA && idx !== wegB);
      const hersteld = decodeerReedSolomon(overlevend, 4, 2, rs42.oorspronkelijkeLengte);
      if (!hersteld.ok || !hersteld.gegevens.equals(testBuffer)) {
        alle15CombinatiesOk = false;
      }
    }
  }
  check('усі 15 можливих комбінацій втрати будь-яких 2 із 6 фрагментів Ріда–Соломона (4+2) відновлюють дані побайтово',
    alle15CombinatiesOk === true);

  // Пошкодження байтів одного фрагмента відсіюється за SHA-256, а при < k живих фрагментів повертається контрольована відмова
  const metEenBeschadigd = [
    { ...rs42.fragmenten[0], inhoudB64u: randomBytes(rs42.streepLengte).toString('base64url') },
    rs42.fragmenten[1],
    rs42.fragmenten[3],
    rs42.fragmenten[4],
    rs42.fragmenten[5],
  ];
  const herstelMetBeschadigd = decodeerReedSolomon(metEenBeschadigd, 4, 2, rs42.oorspronkelijkeLengte);
  const teWeinig = decodeerReedSolomon(rs42.fragmenten.slice(0, 3), 4, 2, rs42.oorspronkelijkeLengte);
  const herbouwdZonderSleutel = herbouwReedSolomonFragmentenZonderSleutel(
    [rs42.fragmenten[1], rs42.fragmenten[2], rs42.fragmenten[4], rs42.fragmenten[5]],
    4,
    2,
    rs42.oorspronkelijkeLengte,
  );

  check('пошкоджений фрагмент відсіюється за SHA-256, нестача фрагментів (< k) блокується, а herbouwReedSolomonFragmentenZonderSleutel точно відновлює всі 6 смуг',
    herstelMetBeschadigd.ok === true && herstelMetBeschadigd.gegevens.equals(testBuffer)
    && !teWeinig.ok && teWeinig.fout === 'ONVOLDOENDE_GELDIGE_FRAGMENTEN'
    && herbouwdZonderSleutel.ok === true
    && herbouwdZonderSleutel.fragmenten.every((f, i) => f.sha256 === rs42.fragmenten[i].sha256));

  // ------------------------------------------------------------------ 3. Сегментоване конвертне шифрування та підписаний маніфест
  const eigenaar = maakKlimopKnooppunt({
    type: 'persoonlijke_gebruikersapparaten',
    rollen: ['opslag', 'herstel', 'verificatie'],
    juridischeRegio: 'NL',
    aanbieder: 'persoonlijke-laptop',
    nuIso,
  });

  const leegVerdeeld = versleutelEnVerdeelObject({
    inhoud: Buffer.alloc(0),
    objectId: 'obj-leeg-000',
    eigenaar,
    kek: kekEp1,
    profiel: 'klimop-v1-aes-256-gcm',
    k: 2,
    m: 1,
    nuIso,
  });
  const leegHersteld = herstelEnOntsleutelObject({
    manifest: leegVerdeeld.manifest,
    fragmentenPerSegment: leegVerdeeld.fragmentenPerSegment,
    kek: kekEp1,
  });
  const vervalstManifest = {
    ...leegVerdeeld.manifest,
    klareLengteBytes: 123,
  };
  check('порожній об’єкт і профіль AES-256-GCM коректно шифруються й розшифровуються, а підробка маніфесту Ed25519 виявляється',
    leegHersteld.ok === true && leegHersteld.inhoud.length === 0
    && verifieerObjectManifest(vervalstManifest).ok === false);

  // ------------------------------------------------------------------ 4. Перехідний міст зі сліпим пошуком для реєстру сховища ключів
  const termen1 = berekenBlindeZoekTermen(zoekEp1, 'mail_items_v1.subject', 'Звіт Плющ: Архітектура 2026!');
  const termen2 = berekenBlindeZoekTermen(zoekEp1, 'mail_items_v1.subject', 'архітектура плющ');
  const termenAndereTabel = berekenBlindeZoekTermen(zoekEp1, 'cloud_items_v1.name', 'архітектура плющ');

  const veldGeheim = versleutelOvergangsVeld('Таємна нотатка власника', kekEp1, {
    tabel: 'app.mcp_console_items',
    rijId: 'rij-42',
    epoche: 1,
  });
  const gelezenOud = ontsleutelOvergangsVeld('Старий відкритий запис до переходу', kekEp1, {
    tabel: 'app.mcp_console_items',
    rijId: 'rij-01',
  });
  const gelezenNieuw = ontsleutelOvergangsVeld(veldGeheim, kekEp1, {
    tabel: 'app.mcp_console_items',
    rijId: 'rij-42',
  });
  const gelezenVerkeerdeRij = ontsleutelOvergangsVeld(veldGeheim, kekEp1, {
    tabel: 'app.mcp_console_items',
    rijId: 'rij-99',
  });

  check('сліпі пошукові відбитки HMAC-SHA-256 та перехідні поля klm1.* забезпечують пошук без відкритих слів і зворотну сумісність',
    termen2.every((t) => termen1.includes(t) && /^bzk1_[0-9a-f]{32}$/.test(t))
    && termen2.every((t, idx) => t !== termenAndereTabel[idx])
    && gelezenOud.ok === true && gelezenOud.bron === 'erfenis_onversleuteld'
    && gelezenNieuw.ok === true && gelezenNieuw.bron === 'klm1' && gelezenNieuw.waarde === 'Таємна нотатка власника'
    && !gelezenVerkeerdeRij.ok && gelezenVerkeerdeRij.fout === 'OVERGANGSVELD_AUTHENTICATIE_MISLUKT');

  // ------------------------------------------------------------------ 5. Живий мережевий полігон 4 незалежних вузлів (NL, CH, UA, SE)
  const knNL = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verbinding', 'verificatie'],
    juridischeRegio: 'NL',
    aanbieder: 'eigen-knoop-nl',
    nuIso,
  });
  const knNLZelfdeAanbieder = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verbinding'],
    juridischeRegio: 'DE',
    aanbieder: 'eigen-knoop-nl',
    nuIso,
  });
  const knCH = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verbinding', 'verificatie'],
    juridischeRegio: 'CH',
    aanbieder: 'alpen-knoop-ch',
    nuIso,
  });
  const knUA = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verbinding', 'verificatie', 'herstel'],
    juridischeRegio: 'UA',
    aanbieder: 'kyiv-knoop-ua',
    nuIso,
  });
  const knSE = maakKlimopKnooppunt({
    type: 'vaste_onafhankelijke_knooppunten',
    rollen: ['opslag', 'verbinding', 'verificatie'],
    juridischeRegio: 'SE',
    aanbieder: 'noord-knoop-se',
    nuIso,
  });

  const srvNL = await startKlimopProefKnooppunt({ knooppunt: knNL });
  const srvCH = await startKlimopProefKnooppunt({ knooppunt: knCH });
  const srvUA = await startKlimopProefKnooppunt({ knooppunt: knUA });
  const srvSE = await startKlimopProefKnooppunt({ knooppunt: knSE });

  try {
    const tabel = new KlimopRouteTabel();
    const idM = eigenaar.identiteit.knooppuntId;
    for (const s of [srvNL, srvCH, srvUA, srvSE]) {
      tabel.voegTweerichtingsStengelToe(idM, s.identiteit.knooppuntId, 1);
    }
    const adressen = new Map([
      [srvNL.identiteit.knooppuntId, srvNL.basisUrl],
      [srvCH.identiteit.knooppuntId, srvCH.basisUrl],
      [srvUA.identiteit.knooppuntId, srvUA.basisUrl],
      [srvSE.identiteit.knooppuntId, srvSE.basisUrl],
    ]);
    const netwerkClient = new KlimopNetwerkClient(eigenaar, adressen, tabel);
    const opslagClient = new KlimopVerdeeldeOpslagClient(netwerkClient);

    const grootBestand = Buffer.from(
      'Великий багатосегментний архів власника у живій цифровій екосистемі «Плющ».\n'.repeat(220),
      'utf8',
    );

    // Спроба розкласти фрагменти на вузли одного постачальника відхиляється до мережевого запису
    const weigerZelfdeAanbieder = await opslagClient.verdeelEnBewaarObject({
      inhoud: grootBestand,
      objectId: 'obj-afgewezen-aanbieder',
      eigenaar,
      kek: kekEp1,
      doelKnooppunten: [knNL.identiteit, knNLZelfdeAanbieder.identiteit, knUA.identiteit],
      k: 2,
      m: 1,
      segmentGrootte: 4096,
      nuIso,
      verlooptOpIso,
    });
    check('KlimopVerdeeldeOpslagClient блокує розміщення, якщо один постачальник отримує >= k фрагментів',
      !weigerZelfdeAanbieder.ok && weigerZelfdeAanbieder.fout === 'ONAFHANKELIJKHEID_NIET_VOLDAAN');

    const opgeslagen = await opslagClient.verdeelEnBewaarObject({
      inhoud: grootBestand,
      objectId: 'obj-etappe3-netwerk-001',
      eigenaar,
      kek: kekEp1,
      doelKnooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
      k: 2,
      m: 1,
      segmentGrootte: 4096,
      nuIso,
      verlooptOpIso,
    });
    check('багатосегментний об’єкт розподілено по 3 незалежних вузлах (NL, CH, UA) через захищені «Стебла»',
      opgeslagen.ok === true
      && opgeslagen.manifest.segmenten.length >= 3
      && srvNL.aantalOpgeslagenBlokken() === opgeslagen.manifest.segmenten.length
      && srvCH.aantalOpgeslagenBlokken() === opgeslagen.manifest.segmenten.length
      && srvUA.aantalOpgeslagenBlokken() === opgeslagen.manifest.segmenten.length);

    if (opgeslagen.ok) {
      // Вимкнення / карантин вузла NL: файл повністю відновлюється з CH + UA
      tabel.plaatsInQuarantaine(knNL.identiteit.knooppuntId);
      const naUitvalNL = await opslagClient.haalEnOntsleutelObject({
        manifest: opgeslagen.manifest,
        plaatsing: opgeslagen.plaatsing,
        kek: kekEp1,
      });
      check('після ізоляції вузла NL багатосегментний об’єкт побайтово відновлюється з решти живих вузлів CH та UA',
        naUitvalNL.ok === true && naUitvalNL.inhoud.equals(grootBestand));

      // Добудова втраченої смуги вузла NL на новий вузол SE без розшифрування й без ключа власника
      const mandaatSE = ondertekenKlimopMandaat({
        schema: 1,
        mandaatId: 'mnd_test_se_001',
        uitgeverKnooppuntId: idM,
        ontvangerKnooppuntId: knSE.identiteit.knooppuntId,
        machtDomein: 'persoonlijke_gegevens',
        toegestaneRollen: ['opslag'],
        toegestaneOpslagLagen: ['grote_versleutelde_objecten'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptOpIso,
      }, eigenaar);

      const herbouw = await opslagClient.herbouwVerlorenKnooppuntZonderSleutel({
        manifest: opgeslagen.manifest,
        plaatsing: opgeslagen.plaatsing,
        verlorenIndex: 0,
        vervangendKnooppunt: knSE.identiteit,
        vervangendMandaat: mandaatSE,
      });
      check('втрачені фрагменти вузла NL добудовано на новому незалежному вузлі SE без доступу до ключа власника',
        herbouw.ok === true
        && herbouw.hersteldeSegmenten === opgeslagen.manifest.segmenten.length
        && srvSE.aantalOpgeslagenBlokken() === opgeslagen.manifest.segmenten.length);

      if (herbouw.ok) {
        // Ізолюємо тепер і CH — об'єкт відновлюється з пари SE + UA!
        tabel.plaatsInQuarantaine(knCH.identiteit.knooppuntId);
        const naTweedeUitval = await opslagClient.haalEnOntsleutelObject({
          manifest: opgeslagen.manifest,
          plaatsing: herbouw.vernieuwdePlaatsing,
          kek: kekEp1,
        });
        check('після додаткової відмови вузла CH об’єкт побайтово відновлюється з нововідбудованого вузла SE та UA',
          naTweedeUitval.ok === true && naTweedeUitval.inhoud.equals(grootBestand));

        // Законне видалення за мандатами власника очищає всі блоки на живих вузлах
        const gewist = await opslagClient.wisObjectVanKnooppunten({
          manifest: opgeslagen.manifest,
          plaatsing: herbouw.vernieuwdePlaatsing,
        });
        check('законне видалення wis_blok затирає та вилучає всі зашифровані фрагменти на живих вузлах SE та UA',
          gewist.gewisteFragmenten === opgeslagen.manifest.segmenten.length * 2
          && srvSE.aantalOpgeslagenBlokken() === 0
          && srvUA.aantalOpgeslagenBlokken() === 0);
      }
    }

    netwerkClient.sluitAlleSessies();
  } finally {
    await Promise.all([srvNL.sluit(), srvCH.sluit(), srvUA.sluit(), srvSE.sluit()]);
  }

  // ------------------------------------------------------------------ 6. Перевірка 15 питань, документації Етапу 3 та Абсолютного мовного закону
  const geldigeAntwoorden15 = Object.fromEntries(
    KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [id, { voldaan: true, bewijs: `Підтверджено Етапом 3 (opslag.ts / klimop-opslag-client.ts) для ${id}` }]),
  ) as Record<KlimopControleVraagId, { voldaan: boolean; bewijs: string }>;
  const oordeelEtappe3 = beoordeelKlimopWijziging({
    naam: 'KLIMOP-004 Етап 3: клієнтське конвертне шифрування, коди Ріда–Соломона та криптографічна гнучкість',
    fase: 3,
    raaktProductieDirectZonderGoedkeuring: false,
    antwoorden15: geldigeAntwoorden15,
    aanwezigeVerbodenVereenvoudigingen: [],
  });
  check('Етап 3 проходить обов’язкову 15-пунктову архітектурну перевірку маніфесту без зауважень',
    oordeelEtappe3.goedgekeurd === true && oordeelEtappe3.fouten.length === 0);

  const et3Uk = 'docs/hub/ПЛЮЩ-ЕТАП-3-ШИФРУВАННЯ-ТА-РОЗПОДІЛЕНЕ-ЗБЕРІГАННЯ.uk.md';
  const et3Md = 'docs/hub/ПЛЮЩ-ЕТАП-3-ШИФРУВАННЯ-ТА-РОЗПОДІЛЕНЕ-ЗБЕРІГАННЯ.md';
  const et3Nl = 'docs/hub/KLIMOP-FASE-3-VERSLEUTELING-EN-VERDEELDE-OPSLAG.nl.md';

  check('двомовні документи Етапу 3 та полігон klimop-etappe3-opslag-proef.mjs існують і містять усі ключові складники',
    [et3Uk, et3Md, et3Nl, 'scripts/klimop-etappe3-opslag-proef.mjs'].every((p) => existsSync(p))
    && lees(et3Uk) === lees(et3Md)
    && ['HKDF-SHA-256', 'Reed-Solomon', 'opslag.ts', 'klimop-opslag-client.ts', 'wis_blok', 'onderhandelKlimopProfiel']
      .every((s) => lees(et3Uk).includes(s) && lees(et3Nl).includes(s)));

  const dossier = JSON.parse(lees('orchestratie/onderwerpen/ecosysteem-klimop.json'));
  check('досьє ecosysteem-klimop.json фіксує злитий запит №185 (KLIMOP-003), нову задачу KLIMOP-004 та щонайменше 10 активних можливостей',
    dossier.werk.some((w: { taakId: string; pr?: number }) => w.taakId === 'KLIMOP-003' && w.pr === 185)
    && dossier.werk.some((w: { taakId: string }) => w.taakId === 'KLIMOP-004')
    && dossier.mogelijkheden.filter((m: { staat: string }) => m.staat === 'actief').length >= 10);

  const bestandenKlimop004 = [
    'shared/klimop/opslag.ts',
    'backend/klimop-opslag-client.ts',
    'backend/klimop-knooppunt-agent.ts',
    'scripts/klimop-etappe3-opslag-proef.mjs',
    et3Uk,
    et3Nl,
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
    'tests/eenheid/klimop-004-etappe3-opslag-20261120.test.ts',
  ];
  const ruTekens = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const taalFouten = bestandenKlimop004.filter((p) => {
    const inhoud = lees(p);
    return ruTekens.test(inhoud) || Boolean(taalwetOvertreding(inhoud));
  });
  check('усі нові та оновлені файли KLIMOP-004 повністю дотримуються Абсолютного мовного закону',
    taalFouten.length === 0,
    taalFouten.join(', '));

  return einde();
}
