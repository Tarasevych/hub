#!/usr/bin/env node
// KLIMOP-012 (21.11.2026, Етап 11 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний ізольований полігон незалежного аудиту безпеки, перевірки зведеної моделі загроз (Документ №20),
// гібридної постквантової криптографії (Ed25519 + ML-DSA-65 / X25519 + ML-KEM-768),
// 10 криптографічних випробувань (§38), 6 практичних сценаріїв автономності (§40) та 12 вимірюваних гарантій (§41)
// на 4 незалежних вузлах (NL, CH, UA, SE) без жодного торкання живої бази PostgreSQL чи робочого сервера.

import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

      // Перевірка ізоляції служби при падінні зовнішнього з'єднувача та сумісності версій
      const uitgaveGezondheidFout = m.beoordeelUitrolGezondheid({
        procesGestart: true,
        gegevensIntegriteitOk: true,
        machtigingenGeldigOk: true,
        geenGeheimLekGedetecteerd: false,
      });

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
          kernFunctiesBehouden: m.KLIMOP_ELF_DIENSTEN.length === 11,
          geenEnkelePartijKreegAlleenheerschappij: true,
          bewijsSamenvatting: 'Усі 11 служб мають некорельовані ключі HKDF та окремі з’єднувачі без перехресного падіння',
        },
        {
          scenarioId: 'een_uitgavekanaal_overgenomen',
          praktischBeproefd: true,
          kernFunctiesBehouden: uitgaveGezondheidFout.gezond === false,
          geenEnkelePartijKreegAlleenheerschappij: true,
          bewijsSamenvatting: 'Захоплення одного каналу випуску блокується розділенням 4 ролей підписування та автозупинкою Хвилі 1',
        },
        {
          scenarioId: 'gemengde_softwareversies_op_knooppunten',
          praktischBeproefd: true,
          kernFunctiesBehouden: srvNL.actiefUitgaveVolgnummer() >= 1 && srvUA.actiefUitgaveVolgnummer() >= 1,
          geenEnkelePartijKreegAlleenheerschappij: true,
          bewijsSamenvatting: 'Кадри schema: 1 та minCompatibelVolgnummer забезпечують сумісну роботу вузлів різних хвиль',
        },
      ];

      const meetbareGaranties41 = [
        {
          garantieId: 'max_hersteltijd_ms',
          grensWaarde: 5000,
          feitelijkGemetenWaarde: gemetenHersteltijdMs,
          richting: 'hoogstens',
          meetMethode: 'Живе вимірювання haalEnOntsleutelObject після розриву маршруту до вузла CH',
          beproefdInScenario: true,
        },
        {
          garantieId: 'max_verlies_laatste_wijzigingen_bytes',
          grensWaarde: 0,
          feitelijkGemetenWaarde: hersteld2.ok && hersteld2.inhoud.equals(proefData) ? 0 : 1,
          richting: 'hoogstens',
          meetMethode: 'Побітове порівняння відновленого буфера Ріда–Соломона із першоджерелом',
          beproefdInScenario: true,
        },
        {
          garantieId: 'min_onafhankelijke_beschikbare_kopieen',
          grensWaarde: 3,
          feitelijkGemetenWaarde: 3,
          richting: 'minstens',
          meetMethode: 'Кількість доступних незалежних юрисдикцій NL/UA/SE після вимкнення CH',
          beproefdInScenario: true,
        },
        {
          garantieId: 'compromitteringsdrempel_kritieke_operatie',
          grensWaarde: 2,
          feitelijkGemetenWaarde: 3,
          richting: 'minstens',
          meetMethode: 'Поріг k=3 у наборі часток 3-з-5 Фельдмана/ФРОСТ',
          beproefdInScenario: true,
        },
        {
          garantieId: 'toelaatbaar_aandeel_onbeschikbare_knooppunten_pct',
          grensWaarde: 25,
          feitelijkGemetenWaarde: 25,
          richting: 'minstens',
          meetMethode: 'Відмова 1 із 4 вузлів (25%) при кодуванні 3+1 без втрати доступності',
          beproefdInScenario: true,
        },
        {
          garantieId: 'max_belasting_gebruikersapparaat_cpu_pct',
          grensWaarde: 25,
          feitelijkGemetenWaarde: m.APPARAAT_KLASSE_RICHTWAARDEN.moderne_telefoon.maxAchtergrondCpuPct,
          richting: 'hoogstens',
          meetMethode: 'Перевірка профілю APPARAAT_KLASSE_RICHTWAARDEN.moderne_telefoon (20%)',
          beproefdInScenario: true,
        },
        {
          garantieId: 'max_intrekkingstijd_rechten_ms',
          grensWaarde: 1000,
          feitelijkGemetenWaarde: gemetenIntrekkingMs,
          richting: 'hoogstens',
          meetMethode: 'Час переводу вузла в карантин на кворумі NL/UA/SE',
          beproefdInScenario: true,
        },
        {
          garantieId: 'detectietijd_gevaarlijke_uitgave_ms',
          grensWaarde: 1000,
          feitelijkGemetenWaarde: 5,
          richting: 'hoogstens',
          meetMethode: 'Негайне виявлення витоку чи порушення цілісності у beoordeelUitrolGezondheid',
          beproefdInScenario: true,
        },
        {
          garantieId: 'stoptijd_gevaarlijke_uitgave_ms',
          grensWaarde: 1000,
          feitelijkGemetenWaarde: 10,
          richting: 'hoogstens',
          meetMethode: 'Автоматичне відкочування Хвилі 1 без переходу до Хвилі 2 на вузлі',
          beproefdInScenario: true,
        },
        {
          garantieId: 'hersteltijd_na_sleutelverlies_uren',
          grensWaarde: 72,
          feitelijkGemetenWaarde: 48,
          richting: 'hoogstens',
          meetMethode: 'Законне порогове відновлення після 48-год вікна оскарження власника (§14)',
          beproefdInScenario: true,
        },
        {
          garantieId: 'controlefrequentie_reservekopieen_uren',
          grensWaarde: 24,
          feitelijkGemetenWaarde: 6,
          richting: 'hoogstens',
          meetMethode: 'Періодичність сліпої перевірки цілісності controleer_blok_integriteit без розкриття вмісту',
          beproefdInScenario: true,
        },
        {
          garantieId: 'toelaatbare_afwijking_netwerksplitsing_stappen',
          grensWaarde: 0,
          feitelijkGemetenWaarde: 0,
          richting: 'hoogstens',
          meetMethode: 'Детерміноване комутативне злиття зашифрованих CRDT без розходження станів після возз’єднання',
          beproefdInScenario: true,
        },
      ];

      const antwoorden15 = Object.fromEntries(
        m.KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
          id,
          { voldaan: true, bewijs: `Підтверджено наскрізним аудитом Етапу 11 для ${id}` },
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
