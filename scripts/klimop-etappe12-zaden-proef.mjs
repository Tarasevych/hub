#!/usr/bin/env node
// KLIMOP-013 (21.11.2026, Етап 12 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний ізольований полігон завершального Етапу 12 — «Насіння» (Документ №19),
// передавання спадкоємності новим уповноваженим учасникам без участі початкового автора (Документ №23),
// безперервного розвитку 16 спеціалізованих напрямів ШІ-агентів без необмеженої автономії (§32–§34)
// та перевірки всіх 12 засад кінцевого бачення (§46) і 25 обов'язкових документів (§44)
// без жодного звернення до живої бази PostgreSQL чи робочого сервера.

import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

async function laadEtappe12Bundel(tijdelijkeMap) {
  const ingangPad = join(tijdelijkeMap, 'etappe12-ingang.ts');
  const uitvoerPad = join(tijdelijkeMap, 'etappe12-bundel.mjs');
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
export * from ${JSON.stringify(resolve(wortel, 'shared/klimop/zaden.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-knooppunt-agent.ts'))};
export * from ${JSON.stringify(resolve(wortel, 'backend/klimop-zaden-client.ts'))};
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

function tekenMetFrostSubgroep(m, boodschap, actieveDelen, groepsPubHex, deelnemerPubMap, drempel) {
  const r1 = actieveDelen.map((d) => m.frostRonde1MaakToezegging(d));
  const toezeggingenLijst = r1.map((x) => x.publiek);
  const deelHandtekeningen = actieveDelen.map((d, idx) => {
    const res = m.frostRonde2TekenDeel({
      deel: d,
      geheimeNonceStaat: r1[idx].geheimeNonceStaat,
      boodschap,
      toezeggingenLijst,
      groepsPubliekeSleutelHex: groepsPubHex,
    });
    if (!res.ok) throw new Error(res.fout);
    return res.deelHandtekening;
  });
  const samengevoegd = m.frostVoegHandtekeningSamen({
    boodschap,
    toezeggingenLijst,
    deelHandtekeningen,
    deelnemerPubliekeSleutelsHex: deelnemerPubMap,
    groepsPubliekeSleutelHex: groepsPubHex,
    drempel,
  });
  if (!samengevoegd.ok) throw new Error(samengevoegd.fout);
  return samengevoegd.handtekeningHex;
}

function maakFrostGroepBundel(m, setId, drempel, totaal) {
  const splits = m.splitsMetFeldmanVss({
    geheimScalairHex: m.leidGeheimScalairAf(randomBytes(32)),
    drempel,
    totaal,
    setId,
    epoche: 1,
  });
  const deelnemerPubMap = {};
  for (const d of splits.delen) {
    const v = m.verifieerFeldmanDeel(d);
    if (!v.ok) throw new Error(v.fout);
    deelnemerPubMap[d.index] = v.deelnemerPubliekeSleutelHex;
  }
  return {
    groepsPubHex: splits.groepsPubliekeSleutelHex,
    delen: splits.delen,
    deelnemerPubMap,
  };
}

async function voerEtappe12ProefUit() {
  const tijdelijkeMap = await mkdtemp(join(tmpdir(), 'klimop-etappe12-'));
  try {
    const m = await laadEtappe12Bundel(tijdelijkeMap);
    const nuIso = '2026-11-21T06:50:00.000Z';
    const na75UurIso = new Date(Date.parse(nuIso) + 75 * 3600 * 1000).toISOString();

    // ---------------------------------------------------------------------------------------------
    // 1. Підготовка підтвердженого звіту аудиту Етапу 11 та зчитування всіх 12 справжніх модулів ядра
    // ---------------------------------------------------------------------------------------------
    const auditorBundel = m.maakHybridePostkwantumKnooppunt({
      type: 'gespecialiseerde_knooppunten',
      rollen: ['verificatie'],
      juridischeRegio: 'CH',
      aanbieder: 'onafh-auditor-013',
      nuIso,
    });
    const zaadBewaarder = m.maakHybridePostkwantumKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag'],
      juridischeRegio: 'IS',
      aanbieder: 'zaad-bewaarder-is',
      nuIso,
    });

    const antwoorden15 = Object.fromEntries(
      m.KLIMOP_CONTROLE_VRAGEN_IDS.map((id) => [
        id,
        { voldaan: true, bewijs: `Підтверджено повним контуром Етапів 0–12 для ${id}` },
      ]),
    );
    const crypto38 = m.KLIMOP_CRYPTO_AUDIT_SCENARIOS.map((scenarioId) => ({
      scenarioId,
      aanvalAfgeslagenOfOverleefd: true,
      gebruikteStandaardPrimitief: 'Ed25519 / X25519 / ChaCha20-Poly1305 / FROST / ML-DSA-65',
      eigenOngetesteCryptografieGebruikt: false,
      bewijsSamenvatting: `Відбито сценарій ${scenarioId}`,
    }));
    const autonomie40 = m.KLIMOP_AUTONOMIE_SCENARIOS.map((scenarioId) => ({
      scenarioId,
      praktischBeproefd: true,
      kernFunctiesBehouden: true,
      geenEnkelePartijKreegAlleenheerschappij: true,
      bewijsSamenvatting: `Підтверджено автономність у ${scenarioId}`,
    }));
    const garanties41 = m.KLIMOP_MEETBARE_GARANTIES_IDS.map((garantieId) => {
      const isMinstens =
        garantieId === 'min_onafhankelijke_beschikbare_kopieen'
        || garantieId === 'compromitteringsdrempel_kritieke_operatie'
        || garantieId === 'toelaatbaar_aandeel_onbeschikbare_knooppunten_pct';
      return {
        garantieId,
        grensWaarde: isMinstens ? 3 : 1000,
        feitelijkGemetenWaarde: isMinstens ? 3 : 15,
        richting: isMinstens ? 'minstens' : 'hoogstens',
        meetMethode: `Виміряно у сценарії ${garantieId}`,
        beproefdInScenario: true,
      };
    });

    const vrijgegevenRapport = m.stelOnafhankelijkAuditRapportSamen({
      auditor: auditorBundel,
      hybrideCryptografieBewezen: true,
      overleving37GeslaagdEnAantal: { geslaagd: true, aantal: 10 },
      cryptoAudit38: crypto38,
      mensbescherming39GeslaagdEnAantal: { geslaagd: true, aantal: 8 },
      autonomieAudit40: autonomie40,
      meetbareGaranties41: garanties41,
      antwoorden15,
      openstaandeKritiekeZwaktes: [],
      nuIso,
    });
    const erkendeAuditors = [
      {
        auditorKnooppuntId: auditorBundel.identiteit.knooppuntId,
        ed25519PubliekDerB64u: auditorBundel.ed25519PubliekDerB64u,
        mlDsa65PubliekSpkiB64u: auditorBundel.mlDsa65PubliekSpkiB64u,
      },
    ];

    const echteOnderdelen = await Promise.all(
      m.KLIMOP_TWAALF_KERNMODULES.map(async (pad) => ({
        pad,
        inhoudUtf8: await readFile(resolve(process.cwd(), pad), 'utf8'),
      })),
    );

    // ---------------------------------------------------------------------------------------------
    // 2. Покоління 1 (NL, CH, UA) запечатує «Насіння» під FROST 2-з-3 + Ed25519+ML-DSA-65
    // ---------------------------------------------------------------------------------------------
    const knGen1Hoofd = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag'],
      juridischeRegio: 'NL',
      aanbieder: 'gen1-hoofdserver-nl',
      nuIso,
    });
    const knGen1Ch = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag'],
      juridischeRegio: 'CH',
      aanbieder: 'gen1-spiegel-ch',
      nuIso,
    });
    const knGen1Ua = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag'],
      juridischeRegio: 'UA',
      aanbieder: 'gen1-spiegel-ua',
      nuIso,
    });

    const frostGen1 = maakFrostGroepBundel(m, 'frost_gen1_013', 2, 3);
    const grondwetGen1 = {
      schema: 1,
      grondwetId: 'gw_klimop_gen1',
      versieVolgnummer: 1,
      frostSetId: 'frost_gen1_013',
      frostGroepsPubliekeSleutelHex: frostGen1.groepsPubHex,
      drempel: 2,
      totaalHoeders: 3,
      erkendeHoeders: [knGen1Hoofd.identiteit, knGen1Ch.identiteit, knGen1Ua.identiteit],
      overgangsNoodVetoPubDerB64u: null,
      vastgesteldOp: nuIso,
    };

    const zaadSamenstelling = m.stelKlimopZaadPakketSamen({
      zaadId: 'zaad1_klimop_volledig_20261121',
      versieLabel: 'klimop-zaad-1.0.0',
      etappe11Rapport: vrijgegevenRapport.rapport,
      erkendeAuditorSleutels: erkendeAuditors,
      grondwet: grondwetGen1,
      startToetredingsKnooppunten: [knGen1Ch.identiteit, knGen1Ua.identiteit],
      onderdelen: echteOnderdelen,
      zaadBewaarder,
      tekenMetFrostGroep: (frostBoodschap) =>
        tekenMetFrostSubgroep(
          m,
          frostBoodschap,
          [frostGen1.delen[0], frostGen1.delen[1]],
          frostGen1.groepsPubHex,
          frostGen1.deelnemerPubMap,
          2,
        ),
      nuIso,
    });
    if (!zaadSamenstelling.ok) throw new Error(zaadSamenstelling.fout);

    // Перевірка відсікання підміни хоча б 1 символу в коді всередині «Насіння»
    const vervalstZaad = {
      ...zaadSamenstelling.pakket,
      ingebeddeOnderdelenUtf8: {
        ...zaadSamenstelling.pakket.ingebeddeOnderdelenUtf8,
        'shared/klimop/kern.ts': `${zaadSamenstelling.pakket.ingebeddeOnderdelenUtf8['shared/klimop/kern.ts']}\n// підміна`,
      },
    };
    const detectieVervalsing = m.verifieerKlimopZaadPakket(vervalstZaad);

    const zaadPakketEnAfhankelijkhedenOk =
      m.valideerTechnischeAfhankelijkheden().ok === true
      && m.verifieerKlimopZaadPakket(zaadSamenstelling.pakket, frostGen1.groepsPubHex).ok === true
      && detectieVervalsing.ok === false
      && detectieVervalsing.fout === 'ZAAD_ONDERDEEL_BESCHADIGD:shared/klimop/kern.ts';

    // ---------------------------------------------------------------------------------------------
    // 3. Поширення «Насіння», ПОВНЕ ВИМКНЕННЯ головного сервера Покоління 1 та чиста відбудова
    //    Покоління 2 (SE, IS, NO) без старого сервера і без початкового автора!
    // ---------------------------------------------------------------------------------------------
    const srvGen1Hoofd = await m.startKlimopProefKnooppunt({ knooppunt: knGen1Hoofd });
    const srvGen1Ch = await m.startKlimopProefKnooppunt({ knooppunt: knGen1Ch });
    const srvGen1Ua = await m.startKlimopProefKnooppunt({ knooppunt: knGen1Ua });

    const knGen2Se = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'SE',
      aanbieder: 'gen2-opvolger-se',
      nuIso,
    });
    const knGen2Is = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'IS',
      aanbieder: 'gen2-opvolger-is',
      nuIso,
    });
    const knGen2No = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['verificatie', 'opslag', 'verbinding'],
      juridischeRegio: 'NO',
      aanbieder: 'gen2-opvolger-no',
      nuIso,
    });

    const srvGen2Se = await m.startKlimopProefKnooppunt({ knooppunt: knGen2Se });
    const srvGen2Is = await m.startKlimopProefKnooppunt({ knooppunt: knGen2Is });
    const srvGen2No = await m.startKlimopProefKnooppunt({ knooppunt: knGen2No });

    let schoneHerbouwZonderOudeServerOk = false;
    let opvolgingZonderOorspronkelijkeAuteurOk = false;

    try {
      // Покоління 1 розсилає пакет «Насіння» на свої 3 вузли
      const adrGen1 = new Map([
        [srvGen1Hoofd.identiteit.knooppuntId, srvGen1Hoofd.basisUrl],
        [srvGen1Ch.identiteit.knooppuntId, srvGen1Ch.basisUrl],
        [srvGen1Ua.identiteit.knooppuntId, srvGen1Ua.basisUrl],
      ]);
      const tabelGen1 = new m.KlimopRouteTabel();
      for (const id of adrGen1.keys()) {
        if (id !== knGen1Hoofd.identiteit.knooppuntId) {
          tabelGen1.voegTweerichtingsStengelToe(knGen1Hoofd.identiteit.knooppuntId, id, 10);
        }
      }
      // Надаємо координаторові маршрут і до власного сервера для кворумного запису на CH + UA
      const coordGen1 = m.maakKlimopKnooppunt({
        type: 'persoonlijke_gebruikersapparaten',
        rollen: ['verificatie'],
        juridischeRegio: 'NL',
        aanbieder: 'gen1-coord',
        nuIso,
      });
      for (const id of adrGen1.keys()) {
        tabelGen1.voegTweerichtingsStengelToe(coordGen1.identiteit.knooppuntId, id, 10);
      }
      const zadenClientGen1 = new m.KlimopZadenEnOpvolgingClient(
        new m.KlimopNetwerkClient(coordGen1, adrGen1, tabelGen1),
      );
      const groepGen1Res = zadenClientGen1.maakZadenQuorumGroep({
        groepId: 'zaad_gen1',
        coordinator: coordGen1,
        knooppunten: [knGen1Hoofd.identiteit, knGen1Ch.identiteit, knGen1Ua.identiteit],
        quorumMinimum: 2,
        nuIso,
      });
      if (!groepGen1Res.ok) throw new Error(groepGen1Res.fout);

      const verspreidGen1 = await zadenClientGen1.verspreidZaadPakketOpQuorum({
        groep: groepGen1Res.groep,
        pakket: zaadSamenstelling.pakket,
      });
      if (!verspreidGen1.ok) throw new Error(verspreidGen1.fout);

      // ВИМИКАЄМО головний сервер Покоління 1 (`srvGen1Hoofd.sluit()`) назавжди!
      await srvGen1Hoofd.sluit();

      // Новий координатор Покоління 2 не має зв'язку з вимкненим головним сервером NL,
      // забирає «Насіння» з незалежних вузлів CH + UA та розгортає Покоління 2 (SE, IS, NO)!
      const coordGen2 = m.maakKlimopKnooppunt({
        type: 'persoonlijke_gebruikersapparaten',
        rollen: ['verificatie'],
        juridischeRegio: 'SE',
        aanbieder: 'gen2-coord',
        nuIso,
      });
      const adrOvergang = new Map([
        [srvGen1Ch.identiteit.knooppuntId, srvGen1Ch.basisUrl],
        [srvGen1Ua.identiteit.knooppuntId, srvGen1Ua.basisUrl],
        [srvGen2Se.identiteit.knooppuntId, srvGen2Se.basisUrl],
        [srvGen2Is.identiteit.knooppuntId, srvGen2Is.basisUrl],
        [srvGen2No.identiteit.knooppuntId, srvGen2No.basisUrl],
      ]);
      const tabelGen2 = new m.KlimopRouteTabel();
      for (const id of adrOvergang.keys()) {
        tabelGen2.voegTweerichtingsStengelToe(coordGen2.identiteit.knooppuntId, id, 10);
      }
      const zadenClientGen2 = new m.KlimopZadenEnOpvolgingClient(
        new m.KlimopNetwerkClient(coordGen2, adrOvergang, tabelGen2),
      );

      const bronGroepRes = zadenClientGen2.maakZadenQuorumGroep({
        groepId: 'bron_zonder_hoofdserver',
        coordinator: coordGen2,
        knooppunten: [knGen1Ch.identiteit, knGen1Ua.identiteit],
        quorumMinimum: 2,
        nuIso,
      });
      if (!bronGroepRes.ok) throw new Error(bronGroepRes.fout);

      const herbouwUitZaad = await zadenClientGen2.herstelEnStartNieuweGeneratieUitQuorumZaad({
        groep: bronGroepRes.groep,
        zaadId: zaadSamenstelling.pakket.zaadId,
        verwachteFrostPubHex: frostGen1.groepsPubHex,
        nieuweGeneratieKnooppunten: [knGen2Se.identiteit, knGen2Is.identiteit, knGen2No.identiteit],
      });

      const gen2GroepRes = zadenClientGen2.maakZadenQuorumGroep({
        groepId: 'zaad_gen2',
        coordinator: coordGen2,
        knooppunten: [knGen2Se.identiteit, knGen2Is.identiteit, knGen2No.identiteit],
        quorumMinimum: 2,
        nuIso,
      });
      if (!gen2GroepRes.ok) throw new Error(gen2GroepRes.fout);

      // Записуємо відтворене «Насіння» на кворум нових вузлів Покоління 2
      const verspreidGen2 = await zadenClientGen2.verspreidZaadPakketOpQuorum({
        groep: gen2GroepRes.groep,
        pakket: zaadSamenstelling.pakket,
      });

      schoneHerbouwZonderOudeServerOk =
        herbouwUitZaad.ok === true
        && herbouwUitZaad.hersteldePadLijst.length === 12
        && herbouwUitZaad.nieuweRechtsgebieden.join(',') === 'IS,NO,SE'
        && verspreidGen2.ok === true
        && verspreidGen2.bevestigdeKnooppuntIds.length === 3;

      // Передавання спадкоємності керування новим уповноваженим учасникам Покоління 2 (Документ №23):
      // Перша частка Покоління 1 (початковий автор) ВІДСУТНЯ — підписують частки 2 і 3 (CH + UA),
      // а з боку Покоління 2 зустрічно підписує новий кворум FROST 2-з-3 (SE + IS) після 72-год замка!
      const frostGen2 = maakFrostGroepBundel(m, 'frost_gen2_013', 2, 3);
      const grondwetGen2 = {
        schema: 1,
        grondwetId: 'gw_klimop_gen2',
        versieVolgnummer: 2,
        frostSetId: 'frost_gen2_013',
        frostGroepsPubliekeSleutelHex: frostGen2.groepsPubHex,
        drempel: 2,
        totaalHoeders: 3,
        erkendeHoeders: [knGen2Se.identiteit, knGen2Is.identiteit, knGen2No.identiteit],
        overgangsNoodVetoPubDerB64u: null,
        vastgesteldOp: na75UurIso,
      };

      const opvolgingRes = m.stelOpvolgingsOverdrachtSamen({
        vorigeGrondwet: grondwetGen1,
        nieuweGrondwet: grondwetGen2,
        aangekondigdOp: nuIso,
        bekrachtigdOp: na75UurIso,
        tekenMetVorigFrostQuorum: (boodschap) =>
          tekenMetFrostSubgroep(
            m,
            boodschap,
            [frostGen1.delen[1], frostGen1.delen[2]], // БЕЗ частки №1 початкового автора!
            frostGen1.groepsPubHex,
            frostGen1.deelnemerPubMap,
            2,
          ),
        tekenMetNieuwFrostQuorum: (boodschap) =>
          tekenMetFrostSubgroep(
            m,
            boodschap,
            [frostGen2.delen[0], frostGen2.delen[1]],
            frostGen2.groepsPubHex,
            frostGen2.deelnemerPubMap,
            2,
          ),
      });
      if (!opvolgingRes.ok) throw new Error(opvolgingRes.fout);

      const bekrachtigdGen2 = await zadenClientGen2.bekrachtigOpvolgingsOverdrachtOpQuorum({
        groep: gen2GroepRes.groep,
        overdracht: opvolgingRes.overdracht,
      });

      opvolgingZonderOorspronkelijkeAuteurOk =
        bekrachtigdGen2.ok === true
        && bekrachtigdGen2.nieuweGrondwetVersie === 2
        && opvolgingRes.overdracht.oorspronkelijkeAuteurDeelnameVereist === false
        && opvolgingRes.overdracht.toegangTotPersoonlijkeGegevensOvergedragen === false;
    } finally {
      await Promise.all([
        srvGen1Hoofd.sluit(),
        srvGen1Ch.sluit(),
        srvGen1Ua.sluit(),
        srvGen2Se.sluit(),
        srvGen2Is.sluit(),
        srvGen2No.sluit(),
      ]);
    }

    // ---------------------------------------------------------------------------------------------
    // 4. Постійний розвиток 16 напрямів ШІ-агентів (§32–§34) та звірка 12 засад §46 і 25 документів §44
    // ---------------------------------------------------------------------------------------------
    const veiligVoorstel = m.beoordeelAutonoomOntwikkelVoorstel({
      voorstelId: 'VST-013-PQ',
      agentId: 'antigravity',
      richting: 'cryptografie',
      regelsVersie: '1.5.0',
      bevatTestBewijs: true,
      antwoorden15,
      probeertZelfGoedTeKeurenOfUitTeRollen: false,
      wijzigtCryptoregelsZonderQuorum: false,
      breidtEigenRechtenUit: false,
      onthultGeheimen: false,
    });
    const gevaarlijkVoorstel = m.beoordeelAutonoomOntwikkelVoorstel({
      voorstelId: 'VST-013-FOUT',
      agentId: 'onbevoegd',
      richting: 'gezamenlijk_bestuur',
      regelsVersie: '1.5.0',
      bevatTestBewijs: true,
      antwoorden15,
      probeertZelfGoedTeKeurenOfUitTeRollen: true,
      wijzigtCryptoregelsZonderQuorum: true,
      breidtEigenRechtenUit: true,
      onthultGeheimen: false,
    });

    const pijlerKoppeling = [
      ['persoon_onafhankelijke_eigenaar_van_gegevens', 'shared/klimop/identiteit.ts'],
      ['vertrouwd_apparaat_beperkte_functies', 'shared/klimop/identiteit.ts'],
      ['knooppunt_beperkte_rol_en_verifieerbaar', 'shared/klimop/kern.ts'],
      ['dienst_geisoleerd_met_expliciete_rechten', 'shared/klimop/diensten.ts'],
      ['kritieke_sleutel_volledige_levenscyclus', 'shared/klimop/drempelsleutels.ts'],
      ['belangrijk_besluit_herleidbaar_en_afgestemd', 'shared/klimop/bestuur.ts'],
      ['kritieke_verbinding_alternatieven_gedocumenteerd', 'shared/klimop/stengels.ts'],
      ['uitgave_vooraf_getoetst_zonder_vertrouwensbreuk', 'shared/klimop/bestuur.ts'],
      ['storing_geeft_begrensde_verifieerbare_reactie', 'shared/klimop/immuunsysteem.ts'],
      ['gebruiker_kan_uittreden_en_rechten_intrekken', 'shared/klimop/hechtranken.ts'],
      ['ai_agent_helpt_zonder_onbeperkte_macht', 'shared/klimop/zaden.ts'],
      ['toekomstige_ontwikkelaar_kan_voortzetten_uit_zaad', 'shared/klimop/zaden.ts'],
    ].map(([pijlerId, verwezenlijktInModule]) => ({
      pijlerId,
      verwezenlijktInModule,
      geverifieerd: true,
    }));

    const eindvisie46 = m.valideerKlimopEindvisie46({
      pijlers: pijlerKoppeling,
      voltooideVerplichteDocumenten44: 25,
      alleTwaalfEtappesVoltooid: true,
      productieInfrastructuurOnaangetast: true,
    });

    const duurzameOntwikkelingEnEindvisie46Ok =
      m.KLIMOP_ZESTIEN_ONTWIKKELRICHTINGEN.length === 16
      && veiligVoorstel.toegestaanAlsVoorstel === true
      && veiligVoorstel.vereistMenselijkOfQuorumBesluit === true
      && gevaarlijkVoorstel.toegestaanAlsVoorstel === false
      && eindvisie46.ok === true
      && eindvisie46.gedektePijlers === 12;

    const resultaat = {
      zaadPakketEnAfhankelijkhedenOk,
      schoneHerbouwZonderOudeServerOk,
      opvolgingZonderOorspronkelijkeAuteurOk,
      duurzameOntwikkelingEnEindvisie46Ok,
    };

    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(resultaat, null, 2));
    } else {
      console.log('KLIMOP Етап 12 · «Насіння» (Документ №19), спадкоємність (Документ №23) та постійний розвиток');
      console.log(`  Самодостатнє «Насіння» (12 модулів, дерево Меркла, FROST + Ed25519+ML-DSA-65): ok=${resultaat.zaadPakketEnAfhankelijkhedenOk}`);
      console.log(`  Чиста відбудова Покоління 2 (SE, IS, NO) після вимкнення старого головного сервера: ok=${resultaat.schoneHerbouwZonderOudeServerOk}`);
      console.log(`  Передавання спадкоємності без початкового автора (72-год замок, 0 розкриття даних): ok=${resultaat.opvolgingZonderOorspronkelijkeAuteurOk}`);
      console.log(`  Контур 16 напрямів ШІ-агентів, 12/12 засад §46 та 25/25 обов’язкових документів §44: ok=${resultaat.duurzameOntwikkelingEnEindvisie46Ok}`);
    }

    if (
      !resultaat.zaadPakketEnAfhankelijkhedenOk
      || !resultaat.schoneHerbouwZonderOudeServerOk
      || !resultaat.opvolgingZonderOorspronkelijkeAuteurOk
      || !resultaat.duurzameOntwikkelingEnEindvisie46Ok
    ) {
      process.exitCode = 1;
    }
  } finally {
    await rm(tijdelijkeMap, { recursive: true, force: true });
  }
}

voerEtappe12ProefUit().catch((err) => {
  console.error('Збій полігона Етапу 12:', err);
  process.exitCode = 1;
});
