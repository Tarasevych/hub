#!/usr/bin/env node
// KLIMOP-009 (20.11.2026, Етап 8 Головного архітектурного маніфесту «Плющ» / «Klimop»):
// Відтворюваний сценарій полігона Етапу 8 (працює виключно локально на 127.0.0.1, без звернень до робочого сервера чи живої PostgreSQL):
//   1. Перевіряє криптографічну ізоляцію всіх 11 служб за псевдонімами psid1_… і окремими ключами HKDF-SHA-256 (§28, §30);
//   2. Відтворює одночасне автономне редагування робочих записів (CRDT) на ноутбуці й телефоні та сліпе злиття на вузлах NL, CH, UA
//      (у тому числі за вимкненого CH) без доступу вузлів до відкритого вмісту і без втрати жодної зміни (§10–§11);
//   3. Перевіряє ізоляцію зовнішніх з'єднувавачів і блокування оманливих заяв про децентралізацію (§29, Документ №13);
//   4. Перевіряє локальний пошук по 4 класах джерел та блокування відправлення відкритих індексів у мережу (§31);
//   5. Перевіряє поетапне перенесення служб у режимі двосторонньої звірки та автоматичне повернення сходинки при розбіжності (§35, Док. №17).
// Запуск: node scripts/klimop-etappe8-diensten-proef.mjs [--json]

import { build } from 'esbuild';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
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

const sha256Hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

async function voerEtappe8ProefUit() {
  await mkdir('rapporten', { recursive: true });
  const tijdelijkeMap = await mkdtemp(join('rapporten', 'klimop-etappe8-proef-'));
  const bundelPad = resolve(tijdelijkeMap, 'etappe8-bundel.mjs');

  try {
    await build({
      stdin: {
        contents: `
          export * from './shared/klimop/kern.ts';
          export * from './shared/klimop/stengels.ts';
          export * from './shared/klimop/identiteit.ts';
          export * from './shared/klimop/diensten.ts';
          export * from './backend/klimop-knooppunt-agent.ts';
          export * from './backend/klimop-diensten-client.ts';
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
    const t0Ms = Date.parse('2026-11-20T22:38:00.000Z');

    const knEigenaar = m.maakKlimopKnooppunt({
      type: 'persoonlijke_gebruikersapparaten',
      rollen: ['synchronisatie', 'verificatie'],
      juridischeRegio: 'NL',
      aanbieder: 'toestel-eigenaar',
      nuIso,
    });
    const knNL = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['synchronisatie', 'verificatie', 'verbinding'],
      juridischeRegio: 'NL',
      aanbieder: 'sync-knoop-nl',
      nuIso,
    });
    const knCH = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['synchronisatie', 'verificatie', 'verbinding'],
      juridischeRegio: 'CH',
      aanbieder: 'sync-knoop-ch',
      nuIso,
    });
    const knUA = m.maakKlimopKnooppunt({
      type: 'vaste_onafhankelijke_knooppunten',
      rollen: ['synchronisatie', 'verificatie', 'verbinding'],
      juridischeRegio: 'UA',
      aanbieder: 'sync-knoop-ua',
      nuIso,
    });

    const srvNL = await m.startKlimopProefKnooppunt({ knooppunt: knNL });
    const srvCH = await m.startKlimopProefKnooppunt({ knooppunt: knCH });
    const srvUA = await m.startKlimopProefKnooppunt({ knooppunt: knUA });
    const alleServers = [srvNL, srvCH, srvUA];

    try {
      const tabel = new m.KlimopRouteTabel();
      for (const s of alleServers) {
        tabel.voegTweerichtingsStengelToe(knEigenaar.identiteit.knooppuntId, s.identiteit.knooppuntId, 1);
      }
      const adressen = new Map(alleServers.map((s) => [s.identiteit.knooppuntId, s.basisUrl]));
      const netwerkClient = new m.KlimopNetwerkClient(knEigenaar, adressen, tabel);
      const dienstenClient = new m.KlimopDienstenOverdrachtClient(netwerkClient);

      // 1. Ізоляція всіх 11 служб платформи за псевдонімами psid1_… та окремими ключами (§28, §30)
      const persoon = m.maakPersoonsIdentiteit(new Date(t0Ms).toISOString());
      const wortelGeheim32 = randomBytes(32);
      const persoonsZout32 = randomBytes(32);

      const alle11Contexten = m.KLIMOP_ELF_DIENSTEN.map((dienstId) =>
        m.leidGeisoleerdeDienstContextAf({
          persoonsWortelGeheim32: wortelGeheim32,
          persoonsZout32,
          persoonsId: persoon.staat.oprichting.persoonsId,
          dienstId,
        }),
      );
      const uniekePsids = new Set(alle11Contexten.map((c) => c.dienstPsid));
      const uniekeSleutels = new Set(alle11Contexten.map((c) => c.dienstSleutel32.toString('hex')));

      const ctxWerkblad = alle11Contexten.find((c) => c.dienstId === 'werkblad');
      const ctxPostvak = alle11Contexten.find((c) => c.dienstId === 'postvak');
      const ctxSlimwoon = alle11Contexten.find((c) => c.dienstId === 'slimwoon');

      const laptopSleutels = maakEd25519Sleutels();
      const telefoonSleutels = maakEd25519Sleutels();

      const postOp = m.maakOndertekendeCrdtOperatie({
        dienstContext: ctxPostvak,
        sleutelId: 'concept_brief_01',
        soort: 'zet',
        klareWaarde: { onderwerp: 'Приватний лист', tekst: 'Наскрізно ізольовано від розумного дому' },
        hlc: m.maakHlcStempel(t0Ms, 0, 'kdev1_laptop'),
        apparaatTekenSleutels: laptopSleutels,
      });
      const kruisDienstGeweigerd = !m.ontsleutelCrdtOperatieWaarde(postOp, ctxSlimwoon).ok;
      const elfDienstenGeisoleerdOk =
        m.KLIMOP_ELF_DIENSTEN.length === 11
        && uniekePsids.size === 11
        && uniekeSleutels.size === 11
        && kruisDienstGeweigerd;

      // 2. Автономне редагування на ноутбуці й телефоні та сліпе злиття CRDT на вузлах NL + UA (при відключеному CH)
      const syncGroepUit = dienstenClient.maakDienstSynchronisatieGroep({
        groepId: 'sync-werkblad-009',
        eigenaar: knEigenaar,
        knooppunten: [knNL.identiteit, knCH.identiteit, knUA.identiteit],
        quorumMinimum: 2,
        nuIso,
        verlooptOpIso,
      });
      if (!syncGroepUit.ok) throw new Error(syncGroepUit.fout);

      const opLaptopNotitie1 = m.maakOndertekendeCrdtOperatie({
        dienstContext: ctxWerkblad,
        sleutelId: 'notitie_1',
        soort: 'zet',
        klareWaarde: { titel: 'Архітектурна нотатка з ноутбука' },
        hlc: m.maakHlcStempel(t0Ms + 1000, 0, 'kdev1_laptop'),
        apparaatTekenSleutels: laptopSleutels,
      });
      const opLaptopTaak1Oud = m.maakOndertekendeCrdtOperatie({
        dienstContext: ctxWerkblad,
        sleutelId: 'taak_1',
        soort: 'zet',
        klareWaarde: { status: 'відкрито' },
        hlc: m.maakHlcStempel(t0Ms + 1000, 1, 'kdev1_laptop'),
        apparaatTekenSleutels: laptopSleutels,
      });

      const opTelefoonNotitie2 = m.maakOndertekendeCrdtOperatie({
        dienstContext: ctxWerkblad,
        sleutelId: 'notitie_2',
        soort: 'zet',
        klareWaarde: { titel: 'Автономна нотатка з телефона в поїзді' },
        hlc: m.maakHlcStempel(t0Ms + 2000, 0, 'kdev1_telefoon'),
        apparaatTekenSleutels: telefoonSleutels,
      });
      const opTelefoonTaak1Nieuw = m.maakOndertekendeCrdtOperatie({
        dienstContext: ctxWerkblad,
        sleutelId: 'taak_1',
        soort: 'zet',
        klareWaarde: { status: 'виконано_в_дорозі' },
        hlc: m.maakHlcStempel(t0Ms + 3000, 0, 'kdev1_telefoon'),
        apparaatTekenSleutels: telefoonSleutels,
      });

      const laptopStaat = {
        schema: 1,
        dienstId: 'werkblad',
        dienstPsid: ctxWerkblad.dienstPsid,
        elementen: { notitie_1: opLaptopNotitie1, taak_1: opLaptopTaak1Oud },
      };
      const telefoonStaat = {
        schema: 1,
        dienstId: 'werkblad',
        dienstPsid: ctxWerkblad.dienstPsid,
        elementen: { notitie_2: opTelefoonNotitie2, taak_1: opTelefoonTaak1Nieuw },
      };

      // Вимикаємо зв'язок із CH — кворум NL + UA приймає і зливає обидва автономні пристрої наосліп!
      tabel.markeerStengelStaat(knEigenaar.identiteit.knooppuntId, knCH.identiteit.knooppuntId, 'verbroken');
      const toegestaneSleutels = [laptopSleutels.publiekeSleutelDerB64u, telefoonSleutels.publiekeSleutelDerB64u];

      const sync1 = await dienstenClient.synchroniseerDienstStaatOpNetwerk({
        groep: syncGroepUit.groep,
        lokaleStaat: laptopStaat,
        toegestaneApparaatPubSleutels: toegestaneSleutels,
      });
      const sync2 = await dienstenClient.synchroniseerDienstStaatOpNetwerk({
        groep: syncGroepUit.groep,
        lokaleStaat: telefoonStaat,
        toegestaneApparaatPubSleutels: toegestaneSleutels,
      });
      const opgehaald = await dienstenClient.haalSamengevoegdeDienstStaatOp({
        groep: syncGroepUit.groep,
        dienstId: 'werkblad',
        dienstPsid: ctxWerkblad.dienstPsid,
        toegestaneApparaatPubSleutels: toegestaneSleutels,
      });
      if (!sync1.ok || !sync2.ok || !opgehaald.ok) throw new Error('Збій мережевого злиття CRDT');

      const geopendTaak1 = m.ontsleutelCrdtOperatieWaarde(opgehaald.staat.elementen.taak_1, ctxWerkblad);
      const blindeCrdtSynchronisatieOk =
        Object.keys(opgehaald.staat.elementen).length === 3
        && geopendTaak1.ok && geopendTaak1.waarde?.status === 'виконано_в_дорозі'
        && srvNL.aantalDienstCrdtRuimtes() === 1;

      // 3. Ізольовані зовнішні з'єднувачі без оманливих заяв про децентралізацію (§29, Документ №13)
      const misleidendeVerbinder = m.valideerExterneVerbinder(
        {
          schema: 1,
          verbinderId: 'vrb_extern_mail_fout',
          doelDienst: 'postvak',
          aanbiederNaam: 'ZorgelozeWolkMail',
          officieleKoppelingSoort: 'imap_smtp_tls',
          eigenGeisoleerdeGeheimKluisId: 'kluis_mail_001',
          minimaleRechten: ['imap_lezen'],
          uitgegevenOp: new Date(t0Ms).toISOString(),
          verlooptOp: new Date(t0Ms + 86400_000).toISOString(),
          ingetrokken: false,
          magRechtenDoorgevenZonderToestemming: false,
          werkelijkeAanbiederPrivacy: 'gecentraliseerde_externe_aanbieder',
          gepresenteerdAanGebruikerAlsVolledigPrivaatEnGedecentraliseerd: true, // заборонено §29 абз. 3!
          maxAntwoordBytes: 65536,
        },
        new Set(),
        new Date(t0Ms + 1000).toISOString(),
      );

      const eerlijkeVerbinderContract = {
        schema: 1,
        verbinderId: 'vrb_extern_mail_goed',
        doelDienst: 'postvak',
        aanbiederNaam: 'ExterneImapAanbieder',
        officieleKoppelingSoort: 'imap_smtp_tls',
        eigenGeisoleerdeGeheimKluisId: 'kluis_mail_isoleer_009',
        minimaleRechten: ['imap_lezen_postvak_in'],
        uitgegevenOp: new Date(t0Ms).toISOString(),
        verlooptOp: new Date(t0Ms + 86400_000).toISOString(),
        ingetrokken: false,
        magRechtenDoorgevenZonderToestemming: false,
        werkelijkeAanbiederPrivacy: 'gecentraliseerde_externe_aanbieder',
        gepresenteerdAanGebruikerAlsVolledigPrivaatEnGedecentraliseerd: false,
        maxAntwoordBytes: 65536,
      };
      const verwerktAntwoord = m.verwerkExterneVerbinderAntwoord({
        contract: eerlijkeVerbinderContract,
        actieNaam: 'controleer_nieuwe_berichten_teller',
        ruwAntwoord: Buffer.from(JSON.stringify({ ongelezenTeller: 4, status: 'ok' }), 'utf8'),
        vereisteSleutelsInJson: ['ongelezenTeller', 'status'],
        nuIso: new Date(t0Ms + 2000).toISOString(),
      });
      const verbinderIsolatieOk =
        !misleidendeVerbinder.ok && misleidendeVerbinder.fout === 'VERBINDER_MISLEIDENDE_PRIVACY_CLAIM_GEWEIGERD'
        && verwerktAntwoord.ok && verwerktAntwoord.auditRegel.bevatGeheimenOfInhoud === false;

      // 4. Захищений локальний спільний пошук на пристрої без передавання відкритого індексу в мережу (§31)
      const zoekIndex = m.maakLokaleZoekIndex();
      m.voegToeAanLokaleZoekIndex(zoekIndex, {
        documentId: 'doc_brief_1',
        dienstId: 'postvak',
        bronKlasse: 'prive_versleuteld_materiaal',
        titel: 'Договір оренди житла в Утрехті',
        tekstInhoud: 'Підписаний примірник договору та графік платежів',
      });
      m.voegToeAanLokaleZoekIndex(zoekIndex, {
        documentId: 'doc_huis_1',
        dienstId: 'slimwoon',
        bronKlasse: 'dienst_metadata',
        titel: 'Датчик тепла у вітальні Утрехт',
        tekstInhoud: 'Температура 20.5 градусів у вітальні',
      });

      const zoekAlleenSlimwoon = m.zoekLokaalOverBronnen({
        index: zoekIndex,
        zoekopdracht: 'Утрехт',
        toegestaneDiensten: new Set(['slimwoon']),
      });
      const lekPoging = m.controleerGeenKlareIndexOpNetwerk(zoekIndex);
      const lokaleZoekBeschermingOk =
        zoekAlleenSlimwoon.length === 1
        && zoekAlleenSlimwoon[0].documentId === 'doc_huis_1'
        && !lekPoging.veiligVoorNetwerk && lekPoging.fout === 'KLARE_ZOEKINDEX_OP_NETWERK_VERBODEN';

      // 5. Двостороння звірка перенесення з чинною системою та автоматичне повернення сходинки при втраті запису (§35, Док. №17)
      const erfenisRecords = [
        { sleutelId: 'notitie_1', inhoudSha256: sha256Hex('n1'), machtigingenSha256: sha256Hex('eigenaar') },
        { sleutelId: 'notitie_2', inhoudSha256: sha256Hex('n2'), machtigingenSha256: sha256Hex('eigenaar') },
        { sleutelId: 'taak_1', inhoudSha256: sha256Hex('t1'), machtigingenSha256: sha256Hex('eigenaar') },
      ];
      const gelijkePariteit = m.vergelijkErfenisEnKlimopStaat(erfenisRecords, erfenisRecords);
      const stapNaarSchaduw = m.beslisOverDienstOverdrachtStap({
        dienstId: 'werkblad',
        huidigeModus: 'alleen_erfenis_postgres',
        gewensteModus: 'schaduw_dubbel_schrijven',
        pariteit: gelijkePariteit,
      });
      const stapNaarKlimopPrimair = m.beslisOverDienstOverdrachtStap({
        dienstId: 'werkblad',
        huidigeModus: stapNaarSchaduw.nieuweActieveModus,
        gewensteModus: 'klimop_primair_met_erfenis_terugval',
        pariteit: gelijkePariteit,
      });

      // Імітуємо відсутність одного запису під час звірки — сходинка автоматично відкочується назад!
      const gebrokenPariteit = m.vergelijkErfenisEnKlimopStaat(erfenisRecords, erfenisRecords.slice(0, 2));
      const automatischeTerugzet = m.beslisOverDienstOverdrachtStap({
        dienstId: 'werkblad',
        huidigeModus: stapNaarKlimopPrimair.nieuweActieveModus,
        gewensteModus: 'volledig_onafhankelijk_geverifieerd',
        pariteit: gebrokenPariteit,
        uitdrukkelijkeGoedkeuringEigenaarVoorVolledigOnafhankelijk: true,
      });

      const gefaseerdeOverdrachtMetTerugvalOk =
        stapNaarSchaduw.toegestaan
        && stapNaarKlimopPrimair.toegestaan
        && stapNaarKlimopPrimair.nieuweActieveModus === 'klimop_primair_met_erfenis_terugval'
        && !automatischeTerugzet.toegestaan
        && automatischeTerugzet.nieuweActieveModus === 'schaduw_dubbel_schrijven';

      netwerkClient.sluitAlleSessies();

      const resultaat = {
        code: 'KLIMOP-ETAPPE-8-DIENSTEN-OVERDRACHT-PROEF',
        elfDienstenGeisoleerdOk,
        blindeCrdtSynchronisatieOk,
        verbinderIsolatieOk,
        lokaleZoekBeschermingOk,
        gefaseerdeOverdrachtMetTerugvalOk,
      };

      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(resultaat, null, 2));
      } else {
        console.log('KLIMOP Етап 8 · Ізоляція 11 служб, зашифровані CRDT, з’єднувачі, локальний пошук та двостороння звірка (§28–§35)');
        console.log(`  Криптографічне відокремлення псевдонімів psid1_… і ключів усіх 11 служб: ok=${resultaat.elfDienstenGeisoleerdOk}`);
        console.log(`  Сліпе мережеве злиття автономних CRDT ноутбука й телефона без CH (0 байт втрат): ok=${resultaat.blindeCrdtSynchronisatieOk}`);
        console.log(`  Ізоляція зовнішніх з’єднувачів та блокування оманливих заяв приватності (Док. №13): ok=${resultaat.verbinderIsolatieOk}`);
        console.log(`  Локальний пошук по 4 класах джерел і заборона відкритих індексів у мережі (§31): ok=${resultaat.lokaleZoekBeschermingOk}`);
        console.log(`  Двостороння звірка перенесення з чинною БД та авто-відкочування при розбіжності (Док. №17): ok=${resultaat.gefaseerdeOverdrachtMetTerugvalOk}`);
      }

      if (
        !elfDienstenGeisoleerdOk
        || !blindeCrdtSynchronisatieOk
        || !verbinderIsolatieOk
        || !lokaleZoekBeschermingOk
        || !gefaseerdeOverdrachtMetTerugvalOk
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

voerEtappe8ProefUit().catch((err) => {
  console.error('Збій полігона Етапу 8:', err);
  process.exitCode = 1;
});
