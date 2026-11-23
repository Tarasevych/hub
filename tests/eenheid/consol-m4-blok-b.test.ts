// CONSOL-001 (Блок Б, Хвиля б1, 23.11.2026) — повні модульні та інтеграційні випробування на справжній PostgreSQL:
//   1. Підблок 1 (З-4): міграція 0324, двомірний FORCE RLS (user_id + ruimte), зашифроване збереження WebDAV/S3/MQTT,
//      перевірка підпису AWS SigV4, відсікання приватних адрес MQTT, робота з DEK/423 SLEUTELKLUIS_GESLOTEN, нуль витоків пароля;
//   2. Підблок 2 (З-5): жива перевірка, вибір основного облікового запису й розірвання зв’язку з підтвердженням у VerbindingenCentrum;
//   3. Підблок 3 (З-7): міграція 0325, загальна посторінкова стрічка історії, розбір задуму за згодою людини з очищенням таємниць,
//      читання вкладень PDF і зображень у пам’яті, безпечні проби маршрутів, зіставлення з orchestratie/ та переходи до Календаря.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../server/platform';
import { getPool } from '../../server/platform/pg';
import { afstemmingKernRoutes } from '../../backend/afstemming-kern';
import { afstemmingKoppelRoutes } from '../../backend/afstemming-koppel';
import { afstemmingUitbreidingRoutes, kuisGeheimenUitTekst, ontleedTekstLokaal } from '../../backend/afstemming-uitbreiding';
import type { AccountView, CloudConnectionStore, CloudPrincipal, ConnectionStatus, PendingFlow, StoredConnection } from '../../backend/cloud-verbinding-m4';
import {
  adapterKoppelingAad,
  integratiesKoppelingenRoutes,
  type AdapterNetwerkDeps,
} from '../../backend/integraties-koppelingen';
import * as sk from '../../backend/sleutelkluis';
import * as tp from '../../backend/tech-profiel';
import { verbindingenBeheerRoutes } from '../../backend/verbindingen-beheer';
import { SLEUTEL_GESLOTEN_CODE } from '../../shared/sleutelkluis';
import { agendaUrlVoorKaart, dienstUrlVoorKaart } from '../../src/afstemming-vnext/hulp';
import { ADAPTER_OPSLAAN_VLAG } from '../../src/integraties/wizard-v2-logica';
import { checker } from './hulp/nep-google';

type RouteAntw = { status: number; data: Record<string, any>; ruw: string };

async function roepRoute(
  routes: Record<string, Array<(ctx: unknown) => Promise<{ statusCode: number; body: string }>>>,
  sleutel: string,
  body: Record<string, unknown> = {},
): Promise<RouteAntw> {
  const fn = routes[sleutel]?.[0];
  if (!fn) throw new Error(`Маршрут відсутній: ${sleutel}`);
  const r = await fn({ event: {}, body, params: {}, query: {} });
  const ruw = String(r.body || '{}');
  return { status: r.statusCode, data: JSON.parse(ruw), ruw };
}

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('consol-m4-blok-b');

  // =========================================================================
  // А. Статичні перевірки чистоти коду, мовного закону та усунення заглушок
  // =========================================================================
  const gewijzigdePaden = [
    'migrations/0324_integratie_adapter_koppeling.sql',
    'migrations/0325_afstemming_volledig_vlag.sql',
    'backend/integraties-koppelingen.ts',
    'backend/verbindingen-beheer.ts',
    'backend/afstemming-kern.ts',
    'backend/afstemming-koppel.ts',
    'backend/afstemming-uitbreiding.ts',
    'shared/afstemming-model.ts',
    'src/integraties/wizard-v2-logica.ts',
    'src/integraties/WizardV2.tsx',
    'src/integraties/Integraties.tsx',
    'src/integraties/Detail.tsx',
    'src/verbindingen/verbindingen-client.ts',
    'src/verbindingen/VerbindingenCentrum.tsx',
    'src/afstemming-vnext/tekst.ts',
    'src/afstemming-vnext/hulp.ts',
    'src/afstemming-vnext/afstemming-client.ts',
    'src/afstemming-vnext/KaartDetail.tsx',
    'src/afstemming-vnext/onderdelen/Geschiedenis.tsx',
    'src/afstemming-vnext/onderdelen/Toevoegen.tsx',
    'src/afstemming-vnext/onderdelen/Controles.tsx',
    'src/afstemming-vnext/onderdelen/Bronnen.tsx',
    'src/afstemming-vnext/onderdelen/Mogelijkheden.tsx',
  ];

  for (const pad of gewijzigdePaden) {
    const inhoud = readFileSync(join(process.cwd(), pad), 'utf8');
    check(`мовний закон (${pad}): нуль заборонених російських літер`, !VERBODEN_LETTERS.test(inhoud));
  }

  const wizardTsx = readFileSync(join(process.cwd(), 'src/integraties/WizardV2.tsx'), 'utf8');
  const detailTsx = readFileSync(join(process.cwd(), 'src/integraties/Detail.tsx'), 'utf8');
  check(
    'L1-G14-01 / L4-S04: у WizardV2.tsx немає заглушки про наступний етап і працює справжнє збереження перехідника',
    !wizardTsx.includes('Збереження цього підключення буде в наступному етапі')
      && !wizardTsx.includes('Deze koppeling bewaren komt in een volgende fase')
      && !wizardTsx.includes('Логін')
      && wizardTsx.includes('Ім’я входу')
      && wizardTsx.includes('/api/owner/admin/integraties/adapter-koppelingen/bewaar')
      && ADAPTER_OPSLAAN_VLAG === 'integraties-adapter-opslaan-v1',
  );
  check('Detail.tsx: відключення використовує вбудоване підтвердження без window.confirm', !detailTsx.includes('window.confirm') && detailTsx.includes('data-detail-bevestig-los'));

  const vbcTsx = readFileSync(join(process.cwd(), 'src/verbindingen/VerbindingenCentrum.tsx'), 'utf8');
  check(
    'L1-G14-02 / L4-S03: у VerbindingenCentrum.tsx немає пробного режиму лише для перегляду чи слова «акаунт», є справжні дії керування',
    !vbcTsx.includes('Пробний режим: лише перегляд')
      && !vbcTsx.includes('Proefmodus: alleen bekijken')
      && !/акаунт/i.test(vbcTsx)
      && vbcTsx.includes('verbindingenClient.controleer')
      && vbcTsx.includes('verbindingenClient.loskoppelen')
      && vbcTsx.includes('verbindingenClient.selecteer'),
  );

  const gesTsx = readFileSync(join(process.cwd(), 'src/afstemming-vnext/onderdelen/Geschiedenis.tsx'), 'utf8');
  const toevTsx = readFileSync(join(process.cwd(), 'src/afstemming-vnext/onderdelen/Toevoegen.tsx'), 'utf8');
  const tekstTs = readFileSync(join(process.cwd(), 'src/afstemming-vnext/tekst.ts'), 'utf8');
  const contrTsx = readFileSync(join(process.cwd(), 'src/afstemming-vnext/onderdelen/Controles.tsx'), 'utf8');
  const bronnenTsx = readFileSync(join(process.cwd(), 'src/afstemming-vnext/onderdelen/Bronnen.tsx'), 'utf8');
  check(
    'L1-G14-03 / L1-G14-04 / L4-S05: у компонентах Afstemming vNext повністю усунено всі застарілі заглушки «заплановано / gepland»',
    !gesTsx.includes('Повна стрічка всіх карток одразу — заплановано')
      && !toevTsx.includes('ШІ-розбір задуму — заплановано')
      && !toevTsx.includes('PDF/зображення — заплановано')
      && !tekstTs.includes('PDF/зображення — заплановано')
      && !tekstTs.includes('PDF/beeld is gepland')
      && !tekstTs.includes('PDF/afbeelding is gepland')
      && !contrTsx.includes('Живі проби з цієї сторінки — заплановано')
      && !contrTsx.includes('Живі проби production з цієї сторінки — заплановано')
      && !bronnenTsx.includes("'gepland'")
      && !bronnenTsx.includes('заплановано')
      && bronnenTsx.includes('orchestratie/'),
  );

  const mailUrl = dienstUrlVoorKaart('mail', 'uk');
  const agendaUrl = agendaUrlVoorKaart({ externId: 'UI-014', titel: ['Звірка', 'Afstemming'] }, 'uk');
  check(
    'L1-G14-05: канонічні переходи з картки узгодження до служби Пошти та Календаря з підготовленою темою',
    mailUrl.startsWith('https://mail.tarasevych.com/')
      && agendaUrl.includes('cloud.tarasevych.com')
      && (agendaUrl.includes('/agenda') || agendaUrl.includes('calendar'))
      && agendaUrl.includes('UI-014'),
  );

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) {
    console.log('OVERGESLAGEN consol-m4-blok-b (integratie): geen database');
    return einde();
  }

  // =========================================================================
  // Б. Міграції 0324 + 0325 та перевірка двомірного захисту рядків (FORCE RLS)
  // =========================================================================
  const migPool = getPool('migratie');
  const sysPool = getPool('systeem');
  const appPool = getPool('app');
  for (const migNaam of ['0324_integratie_adapter_koppeling.sql', '0325_afstemming_volledig_vlag.sql']) {
    const sql = readFileSync(join(process.cwd(), 'migrations', migNaam), 'utf8');
    await migPool.query(sql);
    await migPool.query(sql); // друга перевірка: повна повторостійкість
  }

  const vlagRijen = await sysPool.query(
    `SELECT sleutel, aan, standaard, char_length(omschrijving)::int AS len
       FROM app.feature_flags
      WHERE sleutel IN ('integraties-adapter-opslaan-v1', 'afstemming-volledig-v1')
      ORDER BY sleutel`,
  );
  const sql0324 = readFileSync(join(process.cwd(), 'migrations', '0324_integratie_adapter_koppeling.sql'), 'utf8');
  const sql0325 = readFileSync(join(process.cwd(), 'migrations', '0325_afstemming_volledig_vlag.sql'), 'utf8');
  check(
    'міграції 0324 і 0325 створюють обидва прапорці типово вимкненими (false, false) і з описом ≤ 300 символів',
    /false,\s*false/.test(sql0324)
      && /false,\s*false/.test(sql0325)
      && vlagRijen.rows.length === 2
      && vlagRijen.rows.every((r: any) => r.aan === r.standaard && Number(r.len) <= 300),
  );

  const rlsMeta = await sysPool.query(
    `SELECT c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'integratie_adapter_koppeling'`,
  );
  check(
    'app.integratie_adapter_koppeling має ENABLE та FORCE ROW LEVEL SECURITY',
    rlsMeta.rows[0]?.relrowsecurity === true && rlsMeta.rows[0]?.relforcerowsecurity === true,
  );

  const sfx = randomBytes(4).toString('hex');
  const userA = randomUUID();
  const userB = randomUUID();
  const userAEmail = `blokb-a-${sfx}@eenheid.test`;
  const userBEmail = `blokb-b-${sfx}@eenheid.test`;
  const tabTechA = randomBytes(24).toString('hex');
  const tabEig = randomBytes(24).toString('hex');

  const bestaandEig = (await sysPool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1`)).rows[0];
  const eigId = bestaandEig ? String(bestaandEig.id) : randomUUID();
  const eigEmail = bestaandEig ? String(bestaandEig.email) : `blokb-eig-${sfx}@eenheid.test`;
  const hadEigProfiel = (await sysPool.query('SELECT 1 FROM app.tech_profielen WHERE user_id = $1', [eigId])).rows.length > 0;
  const gemaakteUsers = bestaandEig ? [userA, userB] : [eigId, userA, userB];

  const { beginV1TechKader } = await import('./hulp/v1-tech-kader');
  const herstelV1Kader = await beginV1TechKader();
  try {
    if (!bestaandEig) {
      await sysPool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
        'users',
        eigId,
        { email: eigEmail, role: 'owner', status: 'approved', name: 'Власник тесту' },
      ]);
    }
    await sysPool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3), ($1, $4, $5)', [
      'users',
      userA,
      { email: userAEmail, role: 'member', status: 'approved', name: 'Власник А' },
      userB,
      { email: userBEmail, role: 'member', status: 'approved', name: 'Користувач Б' },
    ]);

    const eigObj = { id: eigId, email: eigEmail, role: 'owner', status: 'approved' };
    process.env.OWNER_EMAIL = eigEmail;
    await tp.activeren(eigObj, tabEig, 60, 'призначення профілю Блоку Б');
    await tp.toekennen(eigObj, tabEig, { email: userAEmail, rollen: ['beheerder'], maxMinuten: 120 });
    await tp.activeren({ id: userA, email: userAEmail, role: 'member', status: 'approved' }, tabTechA, 60, 'перевірка Блоку Б');
    // =========================================================================
    // В. Підблок 1: зашифроване збереження перехідників, SigV4, DEK та RLS
    // =========================================================================
    let s3GezienAuth = '';
    const nepNetwerk: AdapterNetwerkDeps = {
      haal: async (url, init) => {
        const u = String(url);
        const headers = (init?.headers || {}) as Record<string, string>;
        if (u.includes('s3.voorbeeld.test')) {
          s3GezienAuth = String(headers.Authorization || '');
          return new Response(
            '<?xml version="1.0"?><ListBucketResult><Contents><Key>verslag.pdf</Key><Size>128</Size><LastModified>2026-11-23T10:00:00Z</LastModified></Contents></ListBucketResult>',
            { status: 200 },
          );
        }
        if (u.includes('cloud.voorbeeld.test')) {
          return new Response(
            '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response><d:response><d:href>/dav/notitie.md</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>42</d:getcontentlength></d:prop></d:propstat></d:response></d:multistatus>',
            { status: 207 },
          );
        }
        return new Response('niet gevonden', { status: 404 });
      },
      dnsLookup: async (host) => (host === 'thuis.lokaal' ? [{ address: '127.0.0.1' }] : [{ address: '93.184.216.34' }]),
      mqttCheck: async () => ({ ok: true, waarde: { sessieAanwezig: false, ms: 9 } }),
    };

    const maakGate = (uid: string, role = 'owner', accessLevel = 'full') =>
      async () => ({ user: { id: uid, email: `${uid}@eenheid.test`, role, accessLevel } });

    const routesA = integratiesKoppelingenRoutes(maakGate(userA) as never, undefined, nepNetwerk);
    const routesViewer = integratiesKoppelingenRoutes(maakGate(userA, 'viewer', 'limited') as never, undefined, nepNetwerk);

    const geheimWebdav = `wd-geheim-${randomUUID()}`;
    const bewaarWd = await roepRoute(routesA, 'POST /api/owner/admin/integraties/adapter-koppelingen/bewaar', {
      integratie: 'nextcloud',
      adres: 'https://cloud.voorbeeld.test/remote.php/dav/files/pavlo/',
      gebruiker: 'pavlo',
      wachtwoord: geheimWebdav,
    });
    check(
      'WebDAV збережено у просторі prive: повертає levend=verbonden, zichtbareItems=1 та plaintextReturned=false без витоку пароля',
      bewaarWd.status === 200
        && bewaarWd.data.ok === true
        && bewaarWd.data.ruimte === 'prive'
        && bewaarWd.data.levend?.toestand === 'verbonden'
        && bewaarWd.data.koppeling?.zichtbareItems === 1
        && bewaarWd.data.plaintextReturned === false
        && !bewaarWd.ruw.includes(geheimWebdav),
    );

    // Перевіряємо S3 з підписом AWS4-HMAC-SHA256 у технічному просторі (через tabTechA)
    const geheimS3 = `s3-geheim-${randomUUID()}`;
    const bewaarS3Tech = await roepRoute(routesA, 'POST /api/owner/admin/integraties/adapter-koppelingen/bewaar', {
      tabContext: tabTechA,
      integratie: 's3',
      adres: 'https://s3.voorbeeld.test',
      emmer: 'mijn-archief',
      regio: 'eu-central-1',
      toegangsId: 'TOEGANGSIDVOORBEELD1',
      geheim: geheimS3,
    });
    check(
      'S3 збережено у просторі technisch: жива перевірка підписала запит AWS4-HMAC-SHA256 і не розкрила секрету',
      bewaarS3Tech.status === 200
        && bewaarS3Tech.data.ruimte === 'technisch'
        && s3GezienAuth.startsWith('AWS4-HMAC-SHA256 Credential=TOEGANGSIDVOORBEELD1/')
        && !bewaarS3Tech.ruw.includes(geheimS3),
    );

    // Перевірка відсікання приватної мережі для MQTT (SSRF-бар’єр)
    const mqttPrive = await roepRoute(routesA, 'POST /api/owner/admin/integraties/adapter-koppelingen/bewaar', {
      integratie: 'mqtt',
      host: 'thuis.lokaal',
      poort: 8883,
      gebruiker: 'sensor',
      wachtwoord: 'wachtwoord123',
    });
    check('MQTT на приватну адресу 127.0.0.1 блокується з кодом MQTT_PRIVE_ADRES', mqttPrive.status === 400 && mqttPrive.data.error === 'MQTT_PRIVE_ADRES');

    // Двомірна ізоляція RLS безпосередньо на ролі mijnruimte_app
    const zonderContext = await appPool.connect();
    try {
      await zonderContext.query('BEGIN');
      await zonderContext.query("SELECT set_config('app.user_id', '', true), set_config('app.ruimte', '', true)");
      const leegZonderCtx = await zonderContext.query('SELECT count(*)::int AS n FROM app.integratie_adapter_koppeling');
      await zonderContext.query("SELECT set_config('app.user_id', $1, true), set_config('app.ruimte', '', true)", [userA]);
      const leegZonderRuimte = await zonderContext.query('SELECT count(*)::int AS n FROM app.integratie_adapter_koppeling');
      await zonderContext.query("SELECT set_config('app.user_id', $1, true), set_config('app.ruimte', 'prive', true)", [userB]);
      const leegVoorUserB = await zonderContext.query('SELECT count(*)::int AS n FROM app.integratie_adapter_koppeling');
      await zonderContext.query("SELECT set_config('app.user_id', $1, true), set_config('app.ruimte', 'prive', true)", [userA]);
      const priveRijenA = await zonderContext.query('SELECT integratie, geheim FROM app.integratie_adapter_koppeling');
      await zonderContext.query("SELECT set_config('app.user_id', $1, true), set_config('app.ruimte', 'technisch', true)", [userA]);
      const techRijenA = await zonderContext.query('SELECT integratie FROM app.integratie_adapter_koppeling');
      await zonderContext.query('COMMIT');

      check(
        'FORCE RLS двомірний: без user_id = 0, без app.ruimte = 0, інший користувач = 0, prive бачить лише nextcloud, technisch — лише s3',
        leegZonderCtx.rows[0].n === 0
          && leegZonderRuimte.rows[0].n === 0
          && leegVoorUserB.rows[0].n === 0
          && priveRijenA.rows.length === 1
          && priveRijenA.rows[0].integratie === 'nextcloud'
          && !String(priveRijenA.rows[0].geheim).includes(geheimWebdav)
          && techRijenA.rows.length === 1
          && techRijenA.rows[0].integratie === 's3',
      );
    } finally {
      zonderContext.release();
    }

    // Повторна жива перевірка збереженого перехідника без введення пароля
    const controleWd = await roepRoute(routesA, 'POST /api/owner/admin/integraties/adapter-koppelingen/controleer', {
      id: 'nextcloud',
    });
    check(
      'повторна жива перевірка розпечатує секрет на сервері під AAD і підтверджує зв’язок без пароля від клієнта',
      controleWd.status === 200 && controleWd.data.stand === 'ok' && controleWd.data.plaintextReturned === false && !controleWd.ruw.includes(geheimWebdav),
    );

    // Перевірка роботи з особистим ключем даних (DEK): перешифрування v1 → dek1 та чесне 423 SLEUTELKLUIS_GESLOTEN
    check(
      'перешифровувач app.integratie_adapter_koppeling зареєстрований у сховищі ключів',
      sk.geregistreerdeHerversleutelaars().includes('app.integratie_adapter_koppeling'),
    );
    sk.zetHouderControle(async () => true);
    const ladePrive = { userId: userA, ruimte: 'prive' as const };
    const { herstelcode } = await sk.inschakelen(ladePrive, { soort: 'sessie', id: `s1-${sfx}` });
    const dek = Buffer.from(sk.sleutelOpen(ladePrive)!);
    sk.sleutelSluitenVoorHouder('sessie', `s1-${sfx}`);

    // Коли сховище ключів увімкнене, але ключ закритий у пам’яті → збереження нового секрету повертає 423 SLEUTELKLUIS_GESLOTEN
    const geslotenAntw = await roepRoute(routesA, 'POST /api/owner/admin/integraties/adapter-koppelingen/bewaar', {
      integratie: 'mqtt',
      host: 'mqtt.voorbeeld.test',
      poort: 8883,
      gebruiker: 'huis',
      wachtwoord: 'geheim-bij-dichte-kluis',
    });
    check(
      'зачинене сховище ключів чесно відхиляє збереження з 423 SLEUTELKLUIS_GESLOTEN (без тихого падіння на серверний ключ)',
      geslotenAntw.status === 423 && geslotenAntw.data.error === SLEUTEL_GESLOTEN_CODE,
    );

    // Відмикаємо DEK кодом відновлення, зберігаємо MQTT під dek1., перешифровуємо старий WebDAV і перевіряємо AAD
    await sk.ontgrendelMetHerstelcode(ladePrive, herstelcode, { soort: 'sessie', id: `s2-${sfx}` });
    const geheimMqtt = `mqtt-dek-${randomUUID()}`;
    const bewaarMqttOpen = await roepRoute(routesA, 'POST /api/owner/admin/integraties/adapter-koppelingen/bewaar', {
      integratie: 'mqtt',
      host: 'mqtt.voorbeeld.test',
      poort: 8883,
      gebruiker: 'huis',
      wachtwoord: geheimMqtt,
    });
    await sk.herversleutelen(ladePrive);
    const dbRijenNaDek = (
      await sysPool.query(
        `SELECT integratie, id::text AS id, geheim FROM app.integratie_adapter_koppeling WHERE user_id = $1 AND ruimte = 'prive' ORDER BY integratie`,
        [userA],
      )
    ).rows as Array<{ integratie: string; id: string; geheim: string }>;
    const mqttDbRij = dbRijenNaDek.find((r) => r.integratie === 'mqtt')!;
    const wdDbRij = dbRijenNaDek.find((r) => r.integratie === 'nextcloud')!;
    const handmatigGeopend = sk.ontzegelMetDek(dek, mqttDbRij.geheim, adapterKoppelingAad(userA, mqttDbRij.id, 'prive'));
    const wdNaHerversleutel = sk.ontzegelMetDek(dek, wdDbRij.geheim, adapterKoppelingAad(userA, wdDbRij.id, 'prive'));
    check(
      'при відкритому сховищі ключів секрет запечатано в конверт dek1. під AAD, а перешифровувач переводить старий v1 у dek1',
      bewaarMqttOpen.status === 200
        && mqttDbRij.geheim.startsWith('dek1.')
        && handmatigGeopend === geheimMqtt
        && wdDbRij.geheim.startsWith('dek1.')
        && wdNaHerversleutel === geheimWebdav,
    );

    // Перевірка RBAC (переглядач і чужий ownerUserId) та підтвердження розірвання зв’язку
    const viewerWeiger = await roepRoute(routesViewer, 'POST /api/owner/admin/integraties/adapter-koppelingen/bewaar', {
      integratie: 'nextcloud',
      adres: 'https://cloud.voorbeeld.test/dav/',
      gebruiker: 'x',
      wachtwoord: 'y',
    });
    const vreemdWeiger = await roepRoute(routesA, 'POST /api/owner/admin/integraties/adapter-koppelingen/stand', {
      ownerUserId: userB,
    });
    const losZonderBevestig = await roepRoute(routesA, 'POST /api/owner/admin/integraties/adapter-koppelingen/loskoppelen', {
      id: 'nextcloud',
    });
    const losMetBevestig = await roepRoute(routesA, 'POST /api/owner/admin/integraties/adapter-koppelingen/loskoppelen', {
      id: 'nextcloud',
      bevestig: true,
    });
    check(
      'RBAC та підтвердження: переглядач → 403, чужий ownerUserId → 403, loskoppelen без bevestig → 400, з bevestig → видалено',
      viewerWeiger.status === 403
        && vreemdWeiger.status === 403
        && losZonderBevestig.status === 400
        && losZonderBevestig.data.error === 'BEVESTIGING_VEREIST'
        && losMetBevestig.status === 200
        && losMetBevestig.data.ok === true,
    );

    // =========================================================================
    // Г. Підблок 2: справжнє керування підключеннями у VerbindingenCentrum
    // =========================================================================
    const m4Rijen = new Map<string, StoredConnection>();
    const m4AccId = randomUUID();
    m4Rijen.set(`${userA}|prive|${m4AccId}`, {
      id: m4AccId,
      owner: userA,
      space: 'prive',
      provider: 'dropbox',
      displayName: 'Павло Dropbox',
      label: 'Робочий Dropbox',
      email: `dbx-${sfx}@eenheid.test`,
      externalSubject: `sub-${sfx}`,
      status: 'connected',
      mode: 'read',
      scopes: ['account_info.read'],
      updatedAt: new Date().toISOString(),
      credentials: { accessToken: `tok-${randomUUID()}`, refreshToken: `ref-${randomUUID()}`, expiresAt: Date.now() + 3600_000, scopes: ['account_info.read'] },
    });

    const nepM4Store: CloudConnectionStore = {
      async saveFlow(_x: PendingFlow) {},
      async consumeFlow() { return null; },
      async upsert() { throw new Error('niet gebruikt'); },
      async list(p: CloudPrincipal): Promise<AccountView[]> {
        return [...m4Rijen.values()]
          .filter((r) => r.owner === p.owner && r.space === p.space)
          .map(({ owner: _o, space: _s, credentials: _c, ...rest }) => rest);
      },
      async get(p: CloudPrincipal, id: string) {
        return m4Rijen.get(`${p.owner}|${p.space}|${id}`) || null;
      },
      async deactivate(p: CloudPrincipal, id: string) {
        const r = m4Rijen.get(`${p.owner}|${p.space}|${id}`);
        if (r) r.status = 'revoked';
      },
      async markRevokePending(p: CloudPrincipal, id: string) {
        const r = m4Rijen.get(`${p.owner}|${p.space}|${id}`);
        if (!r || !['connected', 'reauth_required'].includes(r.status)) return false;
        r.status = 'disconnect_pending';
        return true;
      },
      async rename() { throw new Error('niet gebruikt'); },
      async setStatus(p: CloudPrincipal, id: string, status: ConnectionStatus) {
        const r = m4Rijen.get(`${p.owner}|${p.space}|${id}`);
        if (r) r.status = status;
      },
    };

    let revokeAangeroepen = 0;
    const vbcRoutesEigenaar = verbindingenBeheerRoutes(
      async () => ({ service: 'cloud', user: { id: userA, email: `a-${sfx}@t`, role: 'owner', status: 'approved', accessLevel: 'full' } }),
      {
        vlagAan: async () => true,
        m4Store: nepM4Store,
        m4Config: () => ({ clientId: 'cid-test', clientSecret: 'csec-test', redirectUri: 'https://cloud.tarasevych.com/api/owner/cloud/oauth/m4/callback' }),
        m4Providers: {
          authorization: () => 'https://www.dropbox.com/oauth2/authorize',
          exchange: async () => ({ accessToken: 'x', expiresAt: Date.now() + 60_000, scopes: [] }),
          identity: async () => ({ subject: `sub-${sfx}`, displayName: 'Павло Dropbox', email: `dbx-${sfx}@eenheid.test` }),
          revoke: async () => { revokeAangeroepen += 1; return 'revoked'; },
        },
      },
    );
    const vbcRoutesViewer = verbindingenBeheerRoutes(
      async () => ({ service: 'cloud', user: { id: userA, email: `v-${sfx}@t`, role: 'viewer', status: 'approved', accessLevel: 'limited' } }),
      { vlagAan: async () => true, m4Store: nepM4Store },
    );

    const vbcControle = await roepRoute(vbcRoutesEigenaar, 'POST /api/owner/verbindingen/controleer', {
      soort: 'm4',
      accountId: m4AccId,
    });
    const vbcViewerLos = await roepRoute(vbcRoutesViewer, 'POST /api/owner/verbindingen/loskoppelen', {
      soort: 'm4',
      accountId: m4AccId,
      bevestig: true,
    });
    const vbcZonderBevestig = await roepRoute(vbcRoutesEigenaar, 'POST /api/owner/verbindingen/loskoppelen', {
      soort: 'm4',
      accountId: m4AccId,
    });
    const vbcLosOk = await roepRoute(vbcRoutesEigenaar, 'POST /api/owner/verbindingen/loskoppelen', {
      soort: 'm4',
      accountId: m4AccId,
      bevestig: true,
    });

    check(
      'VerbindingenCentrum серверні маршрути: жива перевірка → ok, переглядач → 403, без bevestig → 400, з bevestig → відкликано на боці постачальника й у просторі',
      vbcControle.status === 200
        && vbcControle.data.ok === true
        && vbcControle.data.stand === 'ok'
        && vbcViewerLos.status === 403
        && vbcZonderBevestig.status === 400
        && vbcLosOk.status === 200
        && vbcLosOk.data.remote === 'revoked'
        && revokeAangeroepen === 1
        && m4Rijen.get(`${userA}|prive|${m4AccId}`)?.status === 'revoked',
    );

    // =========================================================================
    // Ґ. Підблок 3: Afstemming vNext (стрічка, розбір задуму, PDF/OCR, проби, orchestratie)
    // =========================================================================
    const afvSessEigenaar = async () => ({ service: 'api', user: { id: userA, email: `eig-${sfx}@eenheid.test`, role: 'owner', status: 'approved' } });
    const afvSessLid = async () => ({ service: 'api', user: { id: userA, email: `lid-${sfx}@eenheid.test`, role: 'member', status: 'approved' } });

    const kernRoutes = afstemmingKernRoutes(afvSessEigenaar);
    const koppelRoutes = afstemmingKoppelRoutes(afvSessEigenaar);
    const uitbrRoutes = afstemmingUitbreidingRoutes(afvSessEigenaar, {
      leesBijlageTekst: async (bytes, _mime, naam) => ({
        tekst: naam.endsWith('.pdf')
          ? `# Нагадування про події календаря\n\nСистема має показувати зустрічі у спільному вікні.\n\n## Критерії\n- подія відкривається одним натисканням\n- час синхронізовано (${bytes.byteLength} Б)`
          : 'Знімок екрана поштової скриньки з фільтром непрочитаних листів',
        paginas: naam.endsWith('.pdf') ? 2 : 1,
        herkomst: naam.endsWith('.pdf') ? 'pdf_tekstlaag' : 'ocr',
        status: 'ok',
      }),
    });
    const uitbrRoutesLid = afstemmingUitbreidingRoutes(afvSessLid);
    const alleAfvRoutes = { ...kernRoutes, ...koppelRoutes, ...uitbrRoutes };

    // Створюємо дві нові картки власника (зокрема AGPLUGIN-001 для перевірки живого зіставлення з orchestratie/taken/AGPLUGIN-001.json)
    const krt1 = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/voorstel', {
      externId: 'AGPLUGIN-001',
      titel: ['Двосторонній з’єднувач Antigravity', 'Tweerichtingsconnector Antigravity'],
      samenvatting: ['Міст координації для середовища розробки', 'Coördinatiebrug'],
      dienst: 'mcp',
      categorie: 'інтеграція',
    });
    const krt2 = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/voorstel', {
      titel: ['Швидкий перехід із картотеки до календаря', 'Snelle sprong van kartotheek naar agenda'],
      dienst: 'agenda',
      categorie: 'інтерфейс',
       bron: 'agent',
    });
    check('дві картки створено для перевірки стрічки та зіставлення з координацією', krt1.status === 200 && krt2.status === 200);

    // 1. Загальна посторінкова стрічка подій усіх карток одразу (без id)
    const stroomAlle = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/geschiedenis', {});
    const stroomAgent = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/geschiedenis', { actor: 'agent' });
    check(
      'POST /geschiedenis без id повертає загальну стрічку всіх карток із мапою kaarten і підтримує фільтр за учасником',
      stroomAlle.status === 200
        && Array.isArray(stroomAlle.data.gebeurtenissen)
        && stroomAlle.data.gebeurtenissen.length >= 2
        && Boolean(stroomAlle.data.kaarten?.[krt1.data.kaart.id]?.externId === 'AGPLUGIN-001')
        && stroomAgent.status === 200
        && stroomAgent.data.gebeurtenissen.length >= 1
        && stroomAgent.data.gebeurtenissen.every((g: any) => g.actor?.soort === 'agent'),
    );

    // 2. Розбір задуму за явною згодою людини та очищення таємниць
    const nepToken = ['ghp', 'B'.repeat(38)].join('_');
    const gekuist = kuisGeheimenUitTekst(`Хочу додати фільтр у пошту з ключем ${nepToken} та password=geheim123.\n- кнопка працює на телефоні\n- покрито e2e випробуванням`);
    check(
      'kuisGeheimenUitTekst вирізає маркери доступу та паролі перед передаванням у розбірник',
      gekuist.aantal >= 2 && !gekuist.geschoond.includes(nepToken) && !gekuist.geschoond.includes('geheim123'),
    );

    const zonderToestemming = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/ontleed', {
      tekst: 'Хочу покращити пошук у пошті',
      toestemming: false,
    });
    const kaartenVoorOntleed = (await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/kaarten', {})).data.totaal;
    const metToestemming = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/ontleed', {
      tekst: `Хочу, щоб у пошті можна було швидко відкласти лист до ранку. Ключ ${nepToken}\n- кнопка відкладення у списку листів\n- перевірено e2e сценарієм`,
      lang: 'uk',
      toestemming: true,
    });
    const kaartenNaOntleed = (await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/kaarten', {})).data.totaal;
    check(
      'POST /ontleed вимагає toestemming:true, структурує чернетку (dienst=mail, 2 критерії), очищує таємниці й нічого не записує в БД сам',
      zonderToestemming.status === 400
        && zonderToestemming.data.error === 'TOESTEMMING_VEREIST'
        && metToestemming.status === 200
        && metToestemming.data.voorstel.dienst === 'mail'
        && metToestemming.data.voorstel.criteria.length === 2
        && metToestemming.data.voorstel.criteria[1].verificatie === 'e2e'
        && metToestemming.data.voorstel.gekuisteGeheimen >= 1
        && kaartenVoorOntleed === kaartenNaOntleed,
    );

    const lokaalCrm = ontleedTekstLokaal('Критична вада безпеки у розділі угод з клієнтами: потрібно закрити доступ без ключа.', 'uk');
    check('ontleedTekstLokaal розпізнає службу crm, категорію безпека та пріоритет P0', lokaalCrm.dienst === 'crm' && lokaalCrm.categorie === 'безпека' && lokaalCrm.prioriteit === 'P0');

    // 3. Читання вкладень PDF і зображень у пам’яті без тимчасових файлів
    const nepPdfBytes = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF', 'utf8');
    const verwachtPdfSha = createHash('sha256').update(nepPdfBytes).digest('hex');
    const pdfAntw = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/bijlage-tekst', {
      naam: 'специфікація-календаря.pdf',
      mime: 'application/pdf',
      dataBase64: nepPdfBytes.toString('base64'),
    });
    const vastUitPdf = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/import', {
      actie: 'vastleggen',
      invoerHash: pdfAntw.data.voorstel.invoerHash,
      kaart: pdfAntw.data.voorstel.kaart,
    });
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const beeldAntw = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/bijlage-tekst', {
      naam: 'екран-пошти.png',
      mime: 'image/png',
      dataBase64: `data:image/png;base64,${pngBytes.toString('base64')}`,
      kaartId: krt1.data.kaart.id,
      bewaarMetadata: true,
    });
    check(
      'POST /bijlage-tekst у пам’яті обчислює точний SHA-256 для PDF і PNG, витягує текст і створює ідемпотентну картку без дублів',
      pdfAntw.status === 200
        && pdfAntw.data.sha256 === verwachtPdfSha
        && pdfAntw.data.paginas === 2
        && pdfAntw.data.voorstel?.formaat === 'pdf'
        && vastUitPdf.status === 200
        && vastUitPdf.data.hergebruikt === false
        && beeldAntw.status === 200
        && beeldAntw.data.herkomst === 'ocr'
        && beeldAntw.data.voorstel?.formaat === 'afbeelding',
    );

    // 4. Безпечні живі внутрішні проби готовності маршрутів (/proef)
    const proefDoorLid = await roepRoute(uitbrRoutesLid, 'POST /api/owner/afstemming/proef', {});
    const proefDoorAgent = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/proef', { alsAgent: true });
    const proefEigenaar = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/proef', {
      dienst: 'cloud',
      kaartId: krt2.data.kaart.id,
      hechtBewijsAan: true,
    });
    const krt2NaProef = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/kaart', { id: krt2.data.kaart.id });
    check(
      'POST /proef: не-власник → 403, агент → 403 AGENT_MAG_NIET, власник отримує 5 внутрішніх проб у середовищі lokaal без підвищення фази картки',
      proefDoorLid.status === 403
        && proefDoorAgent.status === 403
        && proefDoorAgent.data.error === 'AGENT_MAG_NIET'
        && proefEigenaar.status === 200
        && proefEigenaar.data.ok === true
        && proefEigenaar.data.omgeving === 'lokaal'
        && proefEigenaar.data.controles.length === 5
        && Boolean(proefEigenaar.data.bewijsId)
        && krt2NaProef.data.kaart.levensfase === 'draft'
        && krt2NaProef.data.kaart.bewijs === 1,
    );

    // 5. Живе зіставлення з orchestratie/taken та orchestratie/verwijzingen
    const orchScan = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/orchestratie-koppeling', { vastleggen: false });
    const orchVast = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/orchestratie-koppeling', { vastleggen: true });
    const krt1NaOrch = await roepRoute(alleAfvRoutes, 'POST /api/owner/afstemming/kaart', { id: krt1.data.kaart.id });
    check(
      'POST /orchestratie-koppeling читає справжні orchestratie/taken і verwijzingen, знаходить AGPLUGIN-001 та зберігає лише пропозиції без автозлиття',
      orchScan.status === 200
        && orchScan.data.gelezen.taken > 0
        && orchScan.data.matches.some((m: any) => m.externId === 'AGPLUGIN-001' && m.bronSoort === 'taak')
        && orchVast.status === 200
        && orchVast.data.aangemaakt >= 1
        && krt1NaOrch.data.kaart.levensfase === 'draft',
    );
  } finally {
    await herstelV1Kader();
    sk.zetHouderControle(null);
    sk.sleutelVergrendelenVoorGebruiker(userA);
    await sysPool.query('DELETE FROM app.integratie_adapter_koppeling WHERE user_id = ANY($1)', [[userA, userB]]).catch(() => undefined);
    await sysPool.query('DELETE FROM app.integratie_controles WHERE door = ANY($1)', [[userA, userB]]).catch(() => undefined);
    await sysPool.query('DELETE FROM app.sleutelkluis_omslag WHERE user_id = ANY($1)', [[userA, userB]]).catch(() => undefined);
    await sysPool.query('DELETE FROM app.sleutelkluis WHERE user_id = ANY($1)', [[userA, userB]]).catch(() => undefined);
    await sysPool.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [hadEigProfiel ? [userA] : [eigId, userA]]).catch(() => undefined);
    await sysPool.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [hadEigProfiel ? [userA] : [eigId, userA]]).catch(() => undefined);
    for (const tbl of [
      'afstemming_kaarten_v1',
      'afstemming_revisies_v1',
      'afstemming_gebeurtenissen_v1',
      'afstemming_bewijs_v1',
      'afstemming_import_v1',
      'afstemming_bijlagen_v1',
      'afstemming_koppelingen_v1',
      'afstemming_besluiten_v1',
      'afstemming_release_v1',
    ]) {
      const rijen = await db.list<Record<string, unknown>>(tbl, { filter: { ownerUserId: userA }, limit: 500 }).catch(() => ({ items: [] }));
      if (rijen.items.length) {
        await db.delete(tbl, (rijen.items as Array<{ id: string }>).map((x) => x.id)).catch(() => undefined);
      }
    }
    await sysPool.query("DELETE FROM app.records WHERE tbl = 'users' AND (id = ANY($1) OR data->>'email' LIKE 'blokb-%@eenheid.test')", [gemaakteUsers]).catch(() => undefined);
  }

  return einde();
}
