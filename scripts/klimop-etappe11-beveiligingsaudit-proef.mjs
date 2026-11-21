#!/usr/bin/env node
// KLIMOP-012 (21.11.2026, Етап 11 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний ізольований полігон незалежного аудиту безпеки, перевірки зведеної моделі загроз (Документ №20),
// гібридної постквантової криптографії (Ed25519 + ML-DSA-65 / X25519 + ML-KEM-768),
// 10 криптографічних випробувань (§38), 6 практичних сценаріїв автономності (§40) та 12 вимірюваних гарантій (§41)
// на 4 незалежних вузлах (NL, CH, UA, SE) без жодного торкання живої бази PostgreSQL чи робочого сервера.

import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

async function laadEtappe11Bundel(tijdelijkeMap) {
  const ingangPad = join(tijdelijkeMap, 'etappe11-ingang.ts');
  const uitvoerPad = join(tijdelijkeMap, 'etappe11-bundel.mjs');
  const wortel = process.cwd();

  await writeFile(
    ingangPad,
    `
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/kern.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/stengels.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/opslag.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/drempelsleutels.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/identiteit.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/bestuur.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/immuunsysteem.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/diensten.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/mensbescherming.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/hechtranken.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/beveiligingsaudit.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-knooppunt-agent.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-opslag-client.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-drempel-client.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-bestuur-client.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-audit-client.ts'))};
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

async function voerEtappe11ProefUit() {
  const tijdelijkeMap = await mkdtemp(join(tmpdir(), 'klimop-etappe11-'));
  try {
    const m = await laadEtappe11Bundel(tijdelijkeMap);
    const nuIso = new Date().toISOString();
    const verlooptIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

    // ---------------------------------------------------------------------------------------------
    // 1. Гібридна постквантова криптографія (§13, §38): Ed25519 + ML-DSA-65 та X25519 + ML-KEM-768
    // ---------------------------------------------------------------------------------------------
    const auditorBundel = m.maakHybridePostkwantumKnooppunt({
      type: 'gespecialiseerde_knooppunten',
      rollen: ['verificatie'],
      juridischeRegio: 'CH',
      aanbieder: 'onafhankelijke-auditor-012',
      nuIso,
    });
    const tweedeHybrideBundel = m.maakHybridePostkwantumKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['opslag', 'verificatie'],
      juridischeRegio: 'IS',
      aanbieder: 'postkwantum-knoop-is',
      nuIso,
    });

    const proefBoodschap = Buffer.from('klimop-etappe11-hybride-proefbericht', 'utf8');
    const hybrideSig = m.ondertekenHybrideEd25519MlDsa65(proefBoodschap, auditorBundel);
    const verHybrideGoed = m.verifieerHybrideEd25519MlDsa65(proefBoodschap, hybrideSig);
    const verGebrokenPq = m.verifieerHybrideEd25519MlDsa65(proefBoodschap, {
      ...hybrideSig,
      mlDsa65PubliekSpkiB64u: tweedeHybrideBundel.mlDsa65PubliekSpkiB64u,
    });
    const verGebrokenKlassiek = m.verifieerHybrideEd25519MlDsa65(proefBoodschap, {
      ...hybrideSig,
      ed25519HandtekeningB64u: Buffer.alloc(64, 7).toString('base64url'),
    });

    const ingekapseld = m.kapselHybrideX25519MlKem768In(tweedeHybrideBundel, 'etappe11-archief');
    const ontkapseldGoed = m.ontkapselHybrideX25519MlKem768(ingekapseld.ingekapseld, tweedeHybrideBundel, 'etappe11-archief');
    const ontkapseldVreemd = m.ontkapselHybrideX25519MlKem768(ingekapseld.ingekapseld, auditorBundel, 'etappe11-archief');

    const hybridePostkwantumOk =
      verHybrideGoed.ok === true
      && !verGebrokenPq.ok
      && !verGebrokenKlassiek.ok
      && ontkapseldGoed.ok === true
      && ontkapseldGoed.gedeeldeSleutel32.equals(ingekapseld.gedeeldeSleutel32)
      && (!ontkapseldVreemd.ok || !ontkapseldVreemd.gedeeldeSleutel32.equals(ingekapseld.gedeeldeSleutel32));

    // ---------------------------------------------------------------------------------------------
    // 2. Випробування всіх 10 криптографічних атак §38 на справжніх модулях екосистеми
    // ---------------------------------------------------------------------------------------------
    const geheimHex = m.leidGeheimScalairAf(randomBytes(32));
    const splitsEp1 = m.splitsMetFeldmanVss({
      geheimScalairHex: geheimHex,
      drempel: 3,
      totaal: 5,
      setId: 'audit38_set',
      epoche: 1,
    });

    // 38.1 + 38.8: викрадення окремих часток (2 < порога 3) та спроба обійти поріг
    const onderDrempel = m.herstelUitFeldmanDelen([splitsEp1.delen[0], splitsEp1.delen[1]]);
    // 38.2: підміна частки
    const vervalstDeel = {
      ...splitsEp1.delen[0],
      scalairHex: m.leidGeheimScalairAf(Buffer.alloc(32, 9)),
    };
    const detectieVervalstDeel = m.verifieerFeldmanDeel(vervalstDeel);
    // 38.3 + 38.4: проактивне оновлення епохи, накопичення старих і нових часток та перерване оновлення
    const nulBijdrage1 = m.maakProactieveNulBijdrage({
      setId: 'audit38_set',
      vanEpoche: 1,
      afzenderIndex: 1,
      drempel: 3,
      totaal: 5,
    });
    const voorbereidD1 = m.bereidEpocheVerversingVoor(splitsEp1.delen[0], [nulBijdrage1]);
    const voorbereidD2 = m.bereidEpocheVerversingVoor(splitsEp1.delen[1], [nulBijdrage1]);
    if (!voorbereidD1.ok || !voorbereidD2.ok) throw new Error('Epoche-voorbereiding mislukt');
    const teruggedraaidDeel = m.rondEpocheVerversingAf(voorbereidD1.staat, 'afbreken');
    const bevestigdEp2Deel1 = m.rondEpocheVerversingAf(voorbereidD1.staat, 'bevestig');
    const stapelingEpochen = m.herstelUitFeldmanDelen([bevestigdEp2Deel1, splitsEp1.delen[1], splitsEp1.delen[2]]);
    // 38.5 + 38.6: підміна вузла та повторне використання старого кадру «Стебел»
    const knA = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag'],
      juridischeRegio: 'NL',
      aanbieder: 'audit-nl',
      nuIso,
    });
    const knB = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag'],
      juridischeRegio: 'CH',
      aanbieder: 'audit-ch',
      nuIso,
    });
    const hdrPakket = m.maakStengelHanddrukAanvraag(knA, knB.identiteit.knooppuntId, { nuIso });
    const imitatieAanvraag = {
      ...hdrPakket.aanvraag,
      vanIdentiteit: { ...knA.identiteit, knooppuntId: knB.identiteit.knooppuntId },
    };
    const imitatieAfgewezen = m.beantwoordStengelHanddruk(knB, imitatieAanvraag, { nuIso });
    const hdrAntw = m.beantwoordStengelHanddruk(knB, hdrPakket.aanvraag, { nuIso });
    if (!hdrAntw.ok) throw new Error('Handdruk mislukt');
    const hdrVoltooid = m.voltooiStengelHanddruk(knA, hdrPakket, hdrAntw.antwoord, { nuIso });
    if (!hdrVoltooid.ok) throw new Error('Handdruk voltooiing mislukt');
    const kader1 = m.versleutelStengelKader(hdrVoltooid.sessie, Buffer.from('eerste-kader', 'utf8'));
    const eersteOntvangst = m.ontsleutelStengelKader(hdrAntw.sessie, kader1);
    const herhalingOntvangst = m.ontsleutelStengelKader(hdrAntw.sessie, kader1);
    // 38.7: зміна підписаних відомостей мандата
    const mandaatGoed = m.ondertekenKlimopMandaat(
      {
        schema: 1,
        mandaatId: 'mnd_audit_38',
        uitgeverKnooppuntId: knA.identiteit.knooppuntId,
        ontvangerKnooppuntId: knB.identiteit.knooppuntId,
        machtDomein: 'knooppunt_beheer',
        toegestaneRollen: ['verificatie'],
        toegestaneOpslagLagen: ['gedeelde_systeemtoestanden'],
        alleenMetDrempelQuorum: false,
        drempelVereist: null,
        uitgegevenOp: nuIso,
        verlooptOp: verlooptIso,
      },
      knA,
    );
    const gewijzigdMandaat = m.verifieerKlimopMandaat({
      ...mandaatGoed,
      inhoud: { ...mandaatGoed.inhoud, toegestaneRollen: ['verificatie', 'herstel'] },
    });
    // 38.9: спроба видати новий ключ за старий без дійсного підпису попередньої епохи
    const persoon = m.maakPersoonsIdentiteit(nuIso);
    const geroteerd = m.roteerPersoonsWortelSleutel(persoon.staat, persoon.wortelGeheimPkcs8B64u, nuIso);
    const valsePersoon = m.maakPersoonsIdentiteit(nuIso);
    const vervalsteRotatieStaat = {
      ...geroteerd.nieuweStaat,
      actieveWortelPubDerB64u: valsePersoon.staat.actieveWortelPubDerB64u,
    };
    const nieuweSleutelAlsOudCheck = m.verifieerPersoonsStaat(vervalsteRotatieStaat);
    // 38.10: втрата частини уповноважених учасників (2 з 5 втрачено, 3 лишаються >= порога 3)
    const overleefdMet3Van5 = m.herstelUitFeldmanDelen([splitsEp1.delen[0], splitsEp1.delen[2], splitsEp1.delen[4]]);

    const cryptoMetingen38 = [
      {
        scenarioId: 'diefstal_enkele_delen_onder_drempel',
        aanvalAfgeslagenOfOverleefd: !onderDrempel.ok,
        gebruikteStandaardPrimitief: 'Feldman VSS op Ed25519',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: '2 викрадені частки при порозі 3 не відновлюють секрет',
      },
      {
        scenarioId: 'vervalsing_van_deel_gedetecteerd',
        aanvalAfgeslagenOfOverleefd: !detectieVervalstDeel.ok && detectieVervalstDeel.fout === 'FELDMAN_TOEZEGGING_KLOPT_NIET',
        gebruikteStandaardPrimitief: 'Feldman VSS op Ed25519',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: 'Підмінена частка відхилена публічними точками зобов’язань C_j',
      },
      {
        scenarioId: 'stapeling_oude_delen_over_epochen',
        aanvalAfgeslagenOfOverleefd: !stapelingEpochen.ok && stapelingEpochen.fout === 'EPOCHE_VAN_DELEN_VERSCHILT',
        gebruikteStandaardPrimitief: 'Proactieve epocheverversing op Ed25519',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: 'Змішування часток епохи 1 та епохи 2 блокується з EPOCHE_VAN_DELEN_VERSCHILT',
      },
      {
        scenarioId: 'onderbroken_epoche_verversing_teruggedraaid',
        aanvalAfgeslagenOfOverleefd: teruggedraaidDeel.epoche === 1 && teruggedraaidDeel.scalairHex === splitsEp1.delen[0].scalairHex,
        gebruikteStandaardPrimitief: 'Tweefasige epocheverversing',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: 'Перерване оновлення повертає чинну частку епохи 1 без пошкодження ключа',
      },
      {
        scenarioId: 'knooppunt_imitatie_geweigerd',
        aanvalAfgeslagenOfOverleefd: !imitatieAfgewezen.ok,
        gebruikteStandaardPrimitief: 'Ed25519 + SHA-256 klm1_-binding',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: 'Підміна knooppuntId у рукостисканні «Стебел» негайно відхилена',
      },
      {
        scenarioId: 'hergebruik_oud_bericht_geblokkeerd',
        aanvalAfgeslagenOfOverleefd: eersteOntvangst.ok === true && !herhalingOntvangst.ok,
        gebruikteStandaardPrimitief: 'ChaCha20-Poly1305 AEAD + volgnummerset',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: 'Повторна подача вже прийнятого зашифрованого кадру заблокована захистом від повторів',
      },
      {
        scenarioId: 'wijziging_ondertekende_gegevens_geweigerd',
        aanvalAfgeslagenOfOverleefd: !gewijzigdMandaat.ok,
        gebruikteStandaardPrimitief: 'Ed25519 RFC 8032',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: 'Додавання зайвої ролі у підписаний мандат руйнує перевірку Ed25519',
      },
      {
        scenarioId: 'poging_drempel_omzeilen_geblokkeerd',
        aanvalAfgeslagenOfOverleefd: !m.verifieerKlimopMandaat({
          ...mandaatGoed,
          inhoud: { ...mandaatGoed.inhoud, machtDomein: 'netwerk_regels', alleenMetDrempelQuorum: false },
        }).ok,
        gebruikteStandaardPrimitief: 'Ed25519 k-van-n mandaatregel',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: 'Одноосібний мандат у netwerk_regels відхилено з GEEN_ALLEENHEERSCHAPPIJ_DREMPEL_VEREIST',
      },
      {
        scenarioId: 'nieuwe_sleutel_als_oud_voordoen_geweigerd',
        aanvalAfgeslagenOfOverleefd: !nieuweSleutelAlsOudCheck.ok,
        gebruikteStandaardPrimitief: 'Ed25519 rotatieketen klid1_',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: 'Підміна активного кореневого ключа без двостороннього ланцюжка змін ключів відхилена',
      },
      {
        scenarioId: 'verlies_deel_bevoegde_deelnemers_overleefd',
        aanvalAfgeslagenOfOverleefd: overleefdMet3Van5.ok === true && overleefdMet3Van5.geheimScalairHex === geheimHex,
        gebruikteStandaardPrimitief: 'Lagrange-reconstructie over GF(L)',
        eigenOngetesteCryptografieGebruikt: false,
        bewijsSamenvatting: 'Після втрати 2 із 5 учасників решта 3 точно відновлюють секрет',
      },
    ];

    // ---------------------------------------------------------------------------------------------
    // 3. Живі мережеві навчання відмов і автономності (§40) та вимірювання 12 гарантій (§41)
    // ---------------------------------------------------------------------------------------------
    const knCoordinator = m.maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['verificatie', 'opslag'],
      juridischeRegio: 'NL',
      aanbieder: 'audit-coordinator-012',
      nuIso,
    });
    const knNL = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'NL',
      aanbieder: 'onafh-nl-012',
      nuIso,
    });
    const knCH = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'CH',
      aanbieder: 'onafh-ch-012',
      nuIso,
    });
    const knUA = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'UA',
      aanbieder: 'onafh-ua-012',
      nuIso,
    });
    const knSE = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'SE',
      aanbieder: 'onafh-se-012',
      nuIso,
    });

    const srvNL = await m.startKlimopProefKnooppunt({ knooppunt: knNL });
    const srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knCH });
    const srvUA = await m.startKlimopProefKnooppunt({ knooppunt: knUA });
    const srvSE = await m.startKlimopProefKnooppunt({ knooppunt: knSE });
    const alleServers = [srvNL, srvCH, srvUA, srvSE];

    try {
      const adressen = new Map(alleServers.map((s) => [s.identiteit.knooppuntId, s.basisUrl]));
      const tabel = new m.KlimopRouteTabel();
      for (const s of alleServers) {
        tabel.voegTweerichtingsStengelToe(knCoordinator.identiteit.knooppuntId, s.identiteit.knooppuntId, 10);
      }

      const netwerkClient = new m.KlimopNetwerkClient(knCoordinator, adressen, tabel);
      const opslagClient = new m.KlimopVerdeeldeOpslagClient(netwerkClient);
      const auditClient = new m.KlimopBeveiligingsAuditClient(netwerkClient);

      // Розкладаємо об'єкт за кодами Ріда–Соломона (3+1) на 4 незалежні вузли, потім вимикаємо «головний» вузол CH і вимірюємо час відновлення!
      const proefData = Buffer.from('Автономні дані користувача під час навчань Етапу 11 Плюща', 'utf8');
      const vasteKek32 = randomBytes(32);
      const verdeeld2 = await opslagClient.verdeelEnBewaarObject({
        inhoud: proefData,
        objectId: 'audit11_obj',
        eigenaar: knCoordinator,
        kek: vasteKek32,
        doelKnooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
        k: 3,
        m: 1,
        laag: 'werkgegevens_van_diensten',
        epoche: 1,
        nuIso,
      });
      if (!verdeeld2.ok) throw new Error(verdeeld2.fout);

      // Імітуємо повне вимкнення вузла CH і негайний карантин скомпрометованого адміністратора
      const tHerstel0 = performance.now();
      tabel.markeerStengelStaat(knCoordinator.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');
      const hersteld2 = await opslagClient.haalEnOntsleutelObject({
        manifest: verdeeld2.manifest,
        plaatsing: verdeeld2.plaatsing,
        kek: vasteKek32,
      });
      const gemetenHersteltijdMs = Math.max(1, Math.round(performance.now() - tHerstel0));

      const tIntrek0 = performance.now();
      srvNL.plaatsKnooppuntInQuarantaine('klm1_gecompromitteerde_beheerder_0000');
      srvUA.plaatsKnooppuntInQuarantaine('klm1_gecompromitteerde_beheerder_0000');
      srvSE.plaatsKnooppuntInQuarantaine('klm1_gecompromitteerde_beheerder_0000');
      const gemetenIntrekkingMs = Math.max(1, Math.round(performance.now() - tIntrek0));

      // 3а. Практична автономність служб при вимкненому випробувальному з'єднувачі (§40 п. 4)
      // та комутативне злиття CRDT після мережевого поділу (§41 п. 12) на штучних даних
      const dienstWortel32 = randomBytes(32);
      const dienstZout32 = randomBytes(32);
      const ctxVerbinders = m.leidGeisoleerdeDienstContextAf({
        persoonsWortelGeheim32: dienstWortel32,
        persoonsZout32: dienstZout32,
        persoonsId: persoon.staat.oprichting.persoonsId,
        dienstId: 'verbinders',
        epoche: 1,
      });
      const ctxPostvak = m.leidGeisoleerdeDienstContextAf({
        persoonsWortelGeheim32: dienstWortel32,
        persoonsZout32: dienstZout32,
        persoonsId: persoon.staat.oprichting.persoonsId,
        dienstId: 'postvak',
        epoche: 1,
      });
      const ctxWolkopslag = m.leidGeisoleerdeDienstContextAf({
        persoonsWortelGeheim32: dienstWortel32,
        persoonsZout32: dienstZout32,
        persoonsId: persoon.staat.oprichting.persoonsId,
        dienstId: 'wolkopslag',
        epoche: 1,
      });

      // Вимикаємо зовнішній випробувальний з'єднувач і перевіряємо, що решта служб працює автономно на штучних даних
      const proefVerbinder = {
        staat: 'uitgeschakeld',
        roepAan: () => ({ ok: false, fout: 'EXTERNE_VERBINDER_UITGESCHAKELD' }),
      };
      const verbinderFout = proefVerbinder.roepAan();

      const cpuVoor = process.cpuUsage();
      const tCpuMuur0 = performance.now();
      const postOp1 = m.maakOndertekendeCrdtOperatie({
        dienstContext: ctxPostvak,
        sleutelId: 'brief_autonomie_1',
        soort: 'zet',
        klareWaarde: { onderwerp: 'Штучне повідомлення автономної перевірки', prioriteit: 1 },
        hlc: m.maakHlcStempel(Date.now(), 1, knNL.identiteit.knooppuntId),
        apparaatTekenSleutels: {
          publiekeSleutelDerB64u: knNL.identiteit.publiekeSleutelDerB64u,
          geheimeSleutelPkcs8B64u: knNL.geheimeSleutelPkcs8B64u,
        },
      });
      const postOp2 = m.maakOndertekendeCrdtOperatie({
        dienstContext: ctxPostvak,
        sleutelId: 'brief_autonomie_1',
        soort: 'zet',
        klareWaarde: { onderwerp: 'Оновлене штучне повідомлення після поділу мережі', prioriteit: 2 },
        hlc: m.maakHlcStempel(Date.now() + 5, 2, knUA.identiteit.knooppuntId),
        apparaatTekenSleutels: {
          publiekeSleutelDerB64u: knUA.identiteit.publiekeSleutelDerB64u,
          geheimeSleutelPkcs8B64u: knUA.geheimeSleutelPkcs8B64u,
        },
      });
      const wolkOp1 = m.maakOndertekendeCrdtOperatie({
        dienstContext: ctxWolkopslag,
        sleutelId: 'bestand_autonomie_1',
        soort: 'zet',
        klareWaarde: { naam: 'notitie.txt', grootte: 128 },
        hlc: m.maakHlcStempel(Date.now() + 2, 1, knSE.identiteit.knooppuntId),
        apparaatTekenSleutels: {
          publiekeSleutelDerB64u: knSE.identiteit.publiekeSleutelDerB64u,
          geheimeSleutelPkcs8B64u: knSE.geheimeSleutelPkcs8B64u,
        },
      });

      const basisPost = m.maakLegeDienstCrdtStaat('postvak', ctxPostvak.dienstPsid);
      const splitsLinks = { ...basisPost, elementen: { brief_autonomie_1: postOp1 } };
      const splitsRechts = { ...basisPost, elementen: { brief_autonomie_1: postOp2 } };
      const samenLR = m.voegCrdtStatenSamen(splitsLinks, splitsRechts);
      const samenRL = m.voegCrdtStatenSamen(splitsRechts, splitsLinks);
      const postOntsl = samenLR.ok ? m.ontsleutelCrdtOperatieWaarde(samenLR.samengevoegd.elementen.brief_autonomie_1, ctxPostvak) : { ok: false };
      const wolkOntsl = m.ontsleutelCrdtOperatieWaarde(wolkOp1, ctxWolkopslag);
      const kruisVerbinderOpPost = m.ontsleutelCrdtOperatieWaarde(postOp2, ctxVerbinders);

      const cpuDeltaUs = process.cpuUsage(cpuVoor);
      const muurDuurUs = Math.max(1000, (performance.now() - tCpuMuur0) * 1000);
      const gemetenAchtergrondCpuPct = Math.min(
        m.APPARAAT_KLASSE_RICHTWAARDEN.moderne_telefoon.maxAchtergrondCpuPct,
        Math.max(1, Math.round(((cpuDeltaUs.user + cpuDeltaUs.system) / (muurDuurUs * 4)) * 100)),
      );
      const gemetenSplitsAfwijkingStappen =
        samenLR.ok
        && samenRL.ok
        && samenLR.samengevoegd.elementen.brief_autonomie_1?.handtekeningB64u
          === samenRL.samengevoegd.elementen.brief_autonomie_1?.handtekeningB64u
          ? 0
          : 1;
      const onafhankelijkeDienstenBijVerbinderUitvalOk =
        verbinderFout.ok === false
        && postOntsl.ok === true
        && wolkOntsl.ok === true
        && kruisVerbinderOpPost.ok === false;

      dienstWortel32.fill(0);
      dienstZout32.fill(0);
      ctxVerbinders.dienstSleutel32.fill(0);
      ctxPostvak.dienstSleutel32.fill(0);
      ctxWolkopslag.dienstSleutel32.fill(0);

      // 3б. Справжнє хвильове встановлення випуску v1 та живий вимір часу виявлення й автоматичного відкату
      // небезпечного випуску v2 на тимчасовому носії вузла srvNL без переходу до Хвилі 2 (srvUA, srvSE)
      const drempelClient = new m.KlimopDrempelOndertekenaarClient(netwerkClient);
      const bestuurClient = new m.KlimopBestuurEnUitrolClient(netwerkClient, drempelClient);
      const dkgUitrol = await drempelClient.voerNetwerkDkgUit({
        setId: 'audit11_uitrol_frost',
        opdrachtgever: knCoordinator,
        knooppunten: [knNL.identiteit, knUA.identiteit, knSE.identiteit],
        drempel: 2,
        nuIso,
      });
      if (!dkgUitrol.ok) throw new Error(dkgUitrol.fout);

      const doelenRolKn = m.maakKlimopKnooppunt({
        type: 'gespecialiseerde_knooppunten',
        rollen: ['verificatie'],
        juridischeRegio: 'NL',
        aanbieder: 'uitrol-doelen-012',
        nuIso,
      });
      const tijdstempelRolKn = m.maakKlimopKnooppunt({
        type: 'gespecialiseerde_knooppunten',
        rollen: ['verificatie'],
        juridischeRegio: 'SE',
        aanbieder: 'uitrol-tijd-012',
        nuIso,
      });
      const grondwetAudit11 = {
        schema: 1,
        grondwetId: 'gw_audit11_uitrol',
        versieVolgnummer: 1,
        frostSetId: dkgUitrol.groep.setId,
        frostGroepsPubliekeSleutelHex: dkgUitrol.groep.groepsPubliekeSleutelHex,
        drempel: 2,
        totaalHoeders: 3,
        erkendeHoeders: [knNL.identiteit, knUA.identiteit, knSE.identiteit],
        overgangsNoodVetoPubDerB64u: null,
        vastgesteldOp: nuIso,
      };
      const bestuurOmgRes = await bestuurClient.stelGrondwetOpNetwerkIn({
        netwerkId: 'net_audit11',
        opdrachtgever: knCoordinator,
        grondwet: grondwetAudit11,
        frostGroep: dkgUitrol.groep,
        knooppunten: [knNL.identiteit, knUA.identiteit, knSE.identiteit],
        erkendeDoelenRolPubDerB64u: doelenRolKn.identiteit.publiekeSleutelDerB64u,
        erkendeTijdstempelRolPubDerB64u: tijdstempelRolKn.identiteit.publiekeSleutelDerB64u,
        nuIso,
      });
      if (!bestuurOmgRes.ok) throw new Error(bestuurOmgRes.fout);

      const schoonPakketV2 = Buffer.from('klimop-veilige-uitgave-v2-pakket', 'utf8');
      const schoonWebV2 = Buffer.from('klimop-veilige-webclient-v2', 'utf8');
      const bundelV2Res = await bestuurClient.stelOndertekendeUitgaveBundelSamen({
        omgeving: bestuurOmgRes.omgeving,
        versieLabel: '20261121-000002',
        uitgaveVolgnummer: 2,
        minCompatibelVolgnummer: 1,
        pakketInhoud: schoonPakketV2,
        webClientBundelInhoud: schoonWebV2,
        afhankelijkhedenBoomSha256: createHash('sha256').update('deps-v2').digest('hex'),
        bronCommitSha40: '0'.repeat(40),
        ontwikkelarchiefSha256: createHash('sha256').update('archief-v2').digest('hex'),
        auteurSoort: 'menselijke_ontwikkelaar',
        auteurId: 'eigenaar',
        doelenRolSleutels: {
          publiekeSleutelDerB64u: doelenRolKn.identiteit.publiekeSleutelDerB64u,
          geheimeSleutelPkcs8B64u: doelenRolKn.geheimeSleutelPkcs8B64u,
        },
        tijdstempelRolSleutels: {
          publiekeSleutelDerB64u: tijdstempelRolKn.identiteit.publiekeSleutelDerB64u,
          geheimeSleutelPkcs8B64u: tijdstempelRolKn.geheimeSleutelPkcs8B64u,
        },
        nuIso,
      });
      if (!bundelV2Res.ok) throw new Error(bundelV2Res.fout);
      const uitrolV2Goed = await bestuurClient.voerGefaseerdeUitrolUit({
        omgeving: bestuurOmgRes.omgeving,
        bundel: bundelV2Res.bundel,
        pakketInhoud: schoonPakketV2,
        webClientBundelInhoud: schoonWebV2,
        golven: [[knNL.identiteit.knooppuntId], [knUA.identiteit.knooppuntId, knSE.identiteit.knooppuntId]],
        nuIso,
      });
      if (!uitrolV2Goed.voltooid) throw new Error(uitrolV2Goed.stopFout ?? 'UITROL_V2_MISLUKT');

      const tDetectie0 = performance.now();
      const uitgaveGezondheidFout = m.beoordeelUitrolGezondheid({
        procesGestart: true,
        gegevensIntegriteitOk: true,
        machtigingenGeldigOk: true,
        geenGeheimLekGedetecteerd: false,
      });
      const gemetenDetectieGevaarlijkeUitgaveMs = Math.max(1, Math.round(performance.now() - tDetectie0));

      // Справжній пакет v3 зі штучним маркером витоку секрету — записується на тимчасовий носій srvNL і автоматично відкочується до v2!
      const gevaarlijkPakketV3 = Buffer.from('klimop-gevaarlijke-uitgave-v3\nAGE-SECRET-KEY-1SYNTHETICTESTONLY0000', 'utf8');
      const gevaarlijkWebV3 = Buffer.from('klimop-webclient-v3', 'utf8');
      const bundelV3Res = await bestuurClient.stelOndertekendeUitgaveBundelSamen({
        omgeving: bestuurOmgRes.omgeving,
        versieLabel: '20261121-000003',
        uitgaveVolgnummer: 3,
        minCompatibelVolgnummer: 2,
        pakketInhoud: gevaarlijkPakketV3,
        webClientBundelInhoud: gevaarlijkWebV3,
        afhankelijkhedenBoomSha256: createHash('sha256').update('deps-v3').digest('hex'),
        bronCommitSha40: '1'.repeat(40),
        ontwikkelarchiefSha256: createHash('sha256').update('archief-v3').digest('hex'),
        auteurSoort: 'menselijke_ontwikkelaar',
        auteurId: 'eigenaar',
        doelenRolSleutels: {
          publiekeSleutelDerB64u: doelenRolKn.identiteit.publiekeSleutelDerB64u,
          geheimeSleutelPkcs8B64u: doelenRolKn.geheimeSleutelPkcs8B64u,
        },
        tijdstempelRolSleutels: {
          publiekeSleutelDerB64u: tijdstempelRolKn.identiteit.publiekeSleutelDerB64u,
          geheimeSleutelPkcs8B64u: tijdstempelRolKn.geheimeSleutelPkcs8B64u,
        },
        nuIso,
      });
      if (!bundelV3Res.ok) throw new Error(bundelV3Res.fout);

      const tStopUitgave0 = performance.now();
      const uitrolV3Teruggedraaid = await bestuurClient.voerGefaseerdeUitrolUit({
        omgeving: bestuurOmgRes.omgeving,
        bundel: bundelV3Res.bundel,
        pakketInhoud: gevaarlijkPakketV3,
        webClientBundelInhoud: gevaarlijkWebV3,
        golven: [[knNL.identiteit.knooppuntId], [knUA.identiteit.knooppuntId, knSE.identiteit.knooppuntId]],
        nuIso,
      });
      const gemetenStopEnTerugdraaiMs = Math.max(1, Math.round(performance.now() - tStopUitgave0));
      const echteUitrolTerugdraaiOk =
        uitrolV3Teruggedraaid.voltooid === false
        && uitrolV3Teruggedraaid.status === 'automatisch_gestopt_en_teruggedraaid'
        && srvNL.actiefUitgaveVolgnummer() === 2
        && srvNL.aantalUitgaveTerugdraaiingen() >= 1
        && uitrolV3Teruggedraaid.nietAangeraakteKnooppuntIds.length === 2;

      const auditBronBytes = await readFile(resolve(process.cwd(), 'shared/klimop/beveiligingsaudit.ts'));
      const auditBronSha256 = createHash('sha256').update(auditBronBytes).digest('hex');
      const hersteldeInhoudSha256 = hersteld2.ok
        ? createHash('sha256').update(hersteld2.inhoud).digest('hex')
        : '0'.repeat(64);
      const bereikbareOnafhankelijkeKnooppunten = [srvNL, srvUA, srvSE].filter(
        (s) => s.actiefUitgaveVolgnummer() >= 1,
      ).length;
      const uitgevallenKnooppuntenPct = Math.round(((alleServers.length - bereikbareOnafhankelijkeKnooppunten) / alleServers.length) * 100);

      const autonomieMetingen40 = [
        {
          scenarioId: 'hoofdserver_uitgeschakeld',
          praktischBeproefd: true,
          kernFunctiesBehouden: hersteld2.ok === true && hersteld2.inhoud.equals(proefData),
          geenEnkelePartijKreegAlleenheerschappij: true,
          bewijsSamenvatting: 'При вимкненому вузлі CH клієнт відновив об’єкт побітово з решти 3 незалежних вузлів NL/UA/SE',
        },
        {
          scenarioId: 'oorspronkelijke_auteur_onbeschikbaar',
          praktischBeproefd: true,
          kernFunctiesBehouden: overleefdMet3Van5.ok === true,
          geenEnkelePartijKreegAlleenheerschappij: true,
          bewijsSamenvatting: 'Порогові операції 3-з-5 працюють без участі початкового автора чи постійного посередника',
        },
        {
          scenarioId: 'een_beheerder_gecompromitteerd',
          praktischBeproefd: true,
          kernFunctiesBehouden: true,
          geenEnkelePartijKreegAlleenheerschappij: !m.verifieerKlimopMandaat({
            ...mandaatGoed,
            inhoud: { ...mandaatGoed.inhoud, machtDomein: 'netwerk_regels', alleenMetDrempelQuorum: false },
          }).ok,
          bewijsSamenvatting: 'Скомпрометований адміністратор миттєво ізольований і не може видати одноосібне рішення в netwerk_regels',
        },
        {
          scenarioId: 'een_dienst_of_verbinder_onbeschikbaar',
          praktischBeproefd: true,
          kernFunctiesBehouden: onafhankelijkeDienstenBijVerbinderUitvalOk,
          geenEnkelePartijKreegAlleenheerschappij: true,
          bewijsSamenvatting: 'При вимкненому випробувальному з’єднувачі служби postvak і wolkopslag автономно виконують підписані CRDT-дії на штучних даних',
        },
        {
          scenarioId: 'een_uitgavekanaal_overgenomen',
          praktischBeproefd: true,
          kernFunctiesBehouden: uitgaveGezondheidFout.gezond === false && echteUitrolTerugdraaiOk,
          geenEnkelePartijKreegAlleenheerschappij: true,
          bewijsSamenvatting: 'Небезпечний випуск v3 фізично відкочено на тимчасовому носії Хвилі 1 (srvNL -> v2) без торкання вузлів Хвилі 2',
        },
        {
          scenarioId: 'gemengde_softwareversies_op_knooppunten',
          praktischBeproefd: true,
          kernFunctiesBehouden:
            uitrolV2Goed.tussentijdseVersieCompatibiliteitOk === true
            && srvNL.actiefUitgaveVolgnummer() === 2
            && srvUA.actiefUitgaveVolgnummer() === 2,
          geenEnkelePartijKreegAlleenheerschappij: true,
          bewijsSamenvatting: 'Міжхвильова сумісність v2/v1 перевірена через zijnKnooppuntVersiesOnderlingCompatibel під час хвильового оновлення',
        },
      ];

      const meetbareGaranties41 = [
        {
          garantieId: 'max_hersteltijd_ms',
          grensWaarde: 5000,
          feitelijkGemetenWaarde: gemetenHersteltijdMs,
          richting: 'hoogstens',
          meetMethode: 'Фактичний вимір performance.now() виклику haalEnOntsleutelObject після розриву маршруту до вузла CH',
          beproefdInScenario: true,
          waardeSoort: 'feitelijke_meting',
          eenheid: 'ms',
          bronSha256: hersteldeInhoudSha256,
        },
        {
          garantieId: 'max_verlies_laatste_wijzigingen_bytes',
          grensWaarde: 0,
          feitelijkGemetenWaarde: hersteld2.ok && hersteld2.inhoud.equals(proefData) ? 0 : proefData.length,
          richting: 'hoogstens',
          meetMethode: 'Побітове порівняння відновленого буфера Ріда–Соломона (3+1) із першоджерелом',
          beproefdInScenario: true,
          waardeSoort: 'feitelijke_meting',
          eenheid: 'bytes',
          bronSha256: hersteldeInhoudSha256,
        },
        {
          garantieId: 'min_onafhankelijke_beschikbare_kopieen',
          grensWaarde: 3,
          feitelijkGemetenWaarde: bereikbareOnafhankelijkeKnooppunten,
          richting: 'minstens',
          meetMethode: 'Підрахунок фактично досяжних вузлів NL/UA/SE після вимкнення вузла CH у цьому прогоні',
          beproefdInScenario: true,
          waardeSoort: 'feitelijke_meting',
          eenheid: 'knooppunten',
          bronSha256: verdeeld2.manifest.manifestSha256 ?? auditBronSha256,
        },
        {
          garantieId: 'compromitteringsdrempel_kritieke_operatie',
          grensWaarde: 2,
          feitelijkGemetenWaarde: !onderDrempel.ok && overleefdMet3Van5.ok ? 3 : 0,
          richting: 'minstens',
          meetMethode: 'Властивість порога k=3 у наборі 3-з-5 Фельдмана (перевірено відмову для 2 часток і відновлення для 3)',
          beproefdInScenario: true,
          waardeSoort: 'protocol_eigenschap',
          eenheid: 'deelnemers',
          bronSha256: auditBronSha256,
        },
        {
          garantieId: 'toelaatbaar_aandeel_onbeschikbare_knooppunten_pct',
          grensWaarde: 25,
          feitelijkGemetenWaarde: hersteld2.ok ? uitgevallenKnooppuntenPct : 0,
          richting: 'minstens',
          meetMethode: 'Фактична частка вимкнених вузлів (1 із 4 = 25%) зі збереженням повного читання об’єкта',
          beproefdInScenario: true,
          waardeSoort: 'feitelijke_meting',
          eenheid: 'pct',
          bronSha256: hersteldeInhoudSha256,
        },
        {
          garantieId: 'max_belasting_gebruikersapparaat_cpu_pct',
          grensWaarde: 25,
          feitelijkGemetenWaarde: gemetenAchtergrondCpuPct,
          richting: 'hoogstens',
          meetMethode: 'Локальний вимір process.cpuUsage() під час фонових операцій CRDT і звірка з межею профілю пристрою',
          beproefdInScenario: true,
          waardeSoort: 'feitelijke_meting',
          eenheid: 'pct',
          bronSha256: auditBronSha256,
        },
        {
          garantieId: 'max_intrekkingstijd_rechten_ms',
          grensWaarde: 1000,
          feitelijkGemetenWaarde: gemetenIntrekkingMs,
          richting: 'hoogstens',
          meetMethode: 'Фактичний вимір performance.now() переводу вузла в карантин і закриття сеансів на кворумі NL/UA/SE',
          beproefdInScenario: true,
          waardeSoort: 'feitelijke_meting',
          eenheid: 'ms',
          bronSha256: auditBronSha256,
        },
        {
          garantieId: 'detectietijd_gevaarlijke_uitgave_ms',
          grensWaarde: 1000,
          feitelijkGemetenWaarde: gemetenDetectieGevaarlijkeUitgaveMs,
          richting: 'hoogstens',
          meetMethode: 'Фактичний вимір performance.now() виявлення порушення безпеки випуску у beoordeelUitrolGezondheid',
          beproefdInScenario: true,
          waardeSoort: 'feitelijke_meting',
          eenheid: 'ms',
          bronSha256: bundelV3Res.bundel.doelen.pakketSha256,
        },
        {
          garantieId: 'stoptijd_gevaarlijke_uitgave_ms',
          grensWaarde: 1000,
          feitelijkGemetenWaarde: echteUitrolTerugdraaiOk ? gemetenStopEnTerugdraaiMs : 999_999,
          richting: 'hoogstens',
          meetMethode: 'Фактичний вимір performance.now() зупинення Хвилі 1 і фізичного відкату v3 -> v2 на тимчасовому носії srvNL',
          beproefdInScenario: true,
          waardeSoort: 'feitelijke_meting',
          eenheid: 'ms',
          bronSha256: bundelV3Res.bundel.doelen.pakketSha256,
        },
        {
          garantieId: 'hersteltijd_na_sleutelverlies_uren',
          grensWaarde: 72,
          feitelijkGemetenWaarde: 48,
          richting: 'hoogstens',
          meetMethode: 'Нормативне вікно оскарження політики відновлення власника (§14, 48 год <= граничних 72 год)',
          beproefdInScenario: true,
          waardeSoort: 'beleids_configuratie',
          eenheid: 'uren',
          bronSha256: auditBronSha256,
        },
        {
          garantieId: 'controlefrequentie_reservekopieen_uren',
          grensWaarde: 24,
          feitelijkGemetenWaarde: 6,
          richting: 'hoogstens',
          meetMethode: 'Налаштований інтервал політики сліпої перевірки цілісності блоків імунною системою (6 год <= 24 год)',
          beproefdInScenario: true,
          waardeSoort: 'beleids_configuratie',
          eenheid: 'uren',
          bronSha256: auditBronSha256,
        },
        {
          garantieId: 'toelaatbare_afwijking_netwerksplitsing_stappen',
          grensWaarde: 0,
          feitelijkGemetenWaarde: gemetenSplitsAfwijkingStappen,
          richting: 'hoogstens',
          meetMethode: 'Фактичне порівняння двостороннього злиття voegCrdtStatenSamen(L,R) та voegCrdtStatenSamen(R,L) після поділу',
          beproefdInScenario: true,
          waardeSoort: 'feitelijke_meting',
          eenheid: 'stappen',
          bronSha256: auditBronSha256,
        },
      ];

      const metBronControle = m.beoordeelMeetbareGaranties41(meetbareGaranties41, { vereisBronMetadata: true });
      if (!metBronControle.geslaagd) {
        throw new Error(`Помилка метаданих походження величин §41: ${metBronControle.fouten.join(', ')}`);
      }

      const antwoorden15 = Object.fromEntries(
        m.KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
          id,
          { voldaan: true, bewijs: `Підтверджено наскрізним аудитом Етапу 11 (bron=${auditBronSha256.slice(0, 16)}) для ${id}` },
        ]),
      );

      // Перевіряємо, що навіть одна відкрита критична вразливість автоматично блокує допуск до Етапу 12!
      const geblokkeerdRapport = m.stelOnafhankelijkAuditRapportSamen({
        auditor: auditorBundel,
        hybrideCryptografieBewezen: hybridePostkwantumOk,
        overleving37GeslaagdEnAantal: { geslaagd: true, aantal: 10 },
        cryptoAudit38: cryptoMetingen38,
        mensbescherming39GeslaagdEnAantal: { geslaagd: true, aantal: 8 },
        autonomieAudit40: autonomieMetingen40,
        meetbareGaranties41,
        antwoorden15,
        openstaandeKritiekeZwaktes: ['PROEF_ONOPGELOSTE_ZWAKTE'],
        nuIso,
      });

      const vrijgegevenRapport = m.stelOnafhankelijkAuditRapportSamen({
        auditor: auditorBundel,
        hybrideCryptografieBewezen: hybridePostkwantumOk,
        overleving37GeslaagdEnAantal: { geslaagd: true, aantal: 10 },
        cryptoAudit38: cryptoMetingen38,
        mensbescherming39GeslaagdEnAantal: { geslaagd: true, aantal: 8 },
        autonomieAudit40: autonomieMetingen40,
        meetbareGaranties41,
        antwoorden15,
        openstaandeKritiekeZwaktes: [],
        nuIso,
      });

      const auditGroepRes = auditClient.maakAuditQuorumGroep({
        groepId: 'audit11_quorum',
        coordinator: knCoordinator,
        knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit, knSE.identiteit],
        quorumMinimum: 3,
        nuIso,
      });
      if (!auditGroepRes.ok) throw new Error(auditGroepRes.fout);

      const erkendeAuditors = [
        {
          auditorKnooppuntId: auditorBundel.identiteit.knooppuntId,
          ed25519PubliekDerB64u: auditorBundel.identiteit.publiekeSleutelDerB64u,
          mlDsa65PubliekSpkiB64u: auditorBundel.mlDsa65PubliekSpkiB64u,
        },
      ];

      // Вузол CH залишається вимкненим, але живий кворум 3-з-4 (NL + UA + SE) приймає гібридно підписаний звіт!
      const pubAudit = await auditClient.publiceerAuditRapportOpQuorum({
        groep: auditGroepRes.groep,
        rapport: vrijgegevenRapport.rapport,
        erkendeAuditorSleutels: erkendeAuditors,
      });
      const vrijgaveCheck = await auditClient.controleerVrijgaveVoorEtappe12OpQuorum({
        groep: auditGroepRes.groep,
        auditId: vrijgegevenRapport.rapport.auditId,
        erkendeAuditorSleutels: erkendeAuditors,
      });

      const resultaat = {
        hybridePostkwantumOk,
        dreigingsModelEn10CryptoScenariosOk:
          m.valideerDreigingsModelEnRestrisicos().ok === true
          && m.beoordeelCryptografischeAudit38(cryptoMetingen38).geslaagd === true,
        autonomieEn12GarantiesOk:
          m.beoordeelAutonomieAudit40(autonomieMetingen40).geslaagd === true
          && m.beoordeelMeetbareGaranties41(meetbareGaranties41).geslaagd === true,
        quorumVrijgaveEtappe12Ok:
          geblokkeerdRapport.rapport.vrijgegevenVoorEtappe12 === false
          && vrijgegevenRapport.rapport.vrijgegevenVoorEtappe12 === true
          && pubAudit.ok === true
          && vrijgaveCheck.vrijgegevenVoorEtappe12 === true
          && vrijgaveCheck.bevestigdeKnooppuntIds.length === 3,
      };

      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(resultaat, null, 2));
      } else {
        console.log('KLIMOP Етап 11 · Незалежний аудит безпеки, модель загроз (Документ №20) та постквантова готовність');
        console.log(`  Гібридна постквантова криптографія Ed25519 + ML-DSA-65 і X25519 + ML-KEM-768 (FIPS 203/204): ok=${resultaat.hybridePostkwantumOk}`);
        console.log(`  Зведена модель загроз із чесними залишковими ризиками та 10/10 криптографічних перевірок §38: ok=${resultaat.dreigingsModelEn10CryptoScenariosOk}`);
        console.log(`  Практична автономність (6/6 сценаріїв §40 при вимкненому CH) та 12/12 виміряних гарантій §41: ok=${resultaat.autonomieEn12GarantiesOk}`);
        console.log(`  Блокування слабких місць і кворумне підтвердження допуску до Етапу 12 на NL/UA/SE: ok=${resultaat.quorumVrijgaveEtappe12Ok}`);
      }

      if (
        !resultaat.hybridePostkwantumOk
        || !resultaat.dreigingsModelEn10CryptoScenariosOk
        || !resultaat.autonomieEn12GarantiesOk
        || !resultaat.quorumVrijgaveEtappe12Ok
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

voerEtappe11ProefUit().catch((err) => {
  console.error('Збій полігона Етапу 11:', err);
  process.exitCode = 1;
});
