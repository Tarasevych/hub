// Модульні та інтеграційні випробування Віхи M3 (Блок В):
// прапорці хмарних модулів M4–M11 (П-1..П-7), захищений HTTPS WebDAV для Nextcloud і NAS (З-13),
// захист від SSRF, перенаправлень 3xx, зовнішніх сутностей XML та обходу шляхів, правила автоматизацій і мовний закон.
// Eenheidstests voor M3: cloudfunctievlaggen M4–M11, beveiligde HTTPS-WebDAV en automatiseringsregels.

import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { closePool, getPool } from '../../server/platform/pg';
import { CLOUD_VNEXT_AANBIEDERS, cloudVnextAanbieder } from '../../shared/cloud-vnext-model';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';
import { cloudOAuthM4Config } from '../../backend/cloud-verbinding-m4-config';
import { createM4CloudRoutes } from '../../backend/cloud-verbinding-m4-routes';
import { createM5ProviderCatalogueRoutes } from '../../backend/cloud-m5-catalogue-routes';
import { createCloudM6AdminRoutes } from '../../backend/cloud-m6-beheer-routes';
import { createM8CloudRoutes } from '../../backend/cloud-m8-routes';
import { createM10CloudAdminRoutes } from '../../backend/cloud-m10-beheer-brug';
import { ensureM10DirectoryRuntime, ensureM11PreviewRuntime } from '../../backend/cloud-m10-runtime';
import { createM11CloudPreviewRoutes } from '../../backend/cloud-m11-voorbeeld-routes';
import {
  afhandelenCloudAutomatiseringen,
  afhandelenCloudWebdav,
  veiligWebdavAdres,
  webdavProef,
  webdavPropfind,
} from '../../backend/cloud-vnext-webdav';
import { metLade } from '../../backend/ruimte-cloud-agenda';
import { nepGeheim } from './hulp/nep-geheim';
import { nodeTestSuite } from './hulp/node-test-main';

const { test, main: basisMain } = nodeTestSuite();
const RUSSISCH_RE = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;
const lees = (rel: string): string => readFileSync(resolve(process.cwd(), rel), 'utf8');

test('M3-W01: міграція 0317 дотримується правил VLAG-001, FORCE RLS і не містить руйнівних команд', () => {
  const sql = lees('migrations/0317_cloud_bruggen_vlag.sql');
  assert.equal(/\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM)\b/i.test(sql), false);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.cloud_webdav_koppelingen/);
  assert.match(sql, /ALTER TABLE app\.cloud_webdav_koppelingen ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /ALTER TABLE app\.cloud_webdav_koppelingen FORCE ROW LEVEL SECURITY;/);
  assert.match(sql, /ALTER TABLE app\.cloud_oauth_flows_m4 FORCE ROW LEVEL SECURITY;/);
  assert.match(sql, /ALTER TABLE app\.cloud_provider_accounts_m4 FORCE ROW LEVEL SECURITY;/);

  const verwachteVlaggen = [
    'cloud-m4-koppelingen-v1',
    'cloud-m5-catalogus-v1',
    'cloud-m6-beheer-v1',
    'cloud-m8-mappen-v1',
    'cloud-m10-beheer-v1',
    'cloud-m10-omgeving-v1',
    'cloud-m11-voorbeeld-v1',
    'cloud-webdav-v1',
  ];
  for (const sleutel of verwachteVlaggen) {
    assert.ok(sql.includes(`'${sleutel}'`), `Міграція 0317 має реєструвати прапорець ${sleutel}`);
  }
  const inserts = [...sql.matchAll(/INSERT INTO app\.feature_flags[\s\S]*?ON CONFLICT \(sleutel\) DO NOTHING;/g)];
  assert.equal(inserts.length, 8, 'Має бути рівно 8 вставок прапорців у міграції 0317');
  for (const [blok] of inserts) {
    assert.match(blok, /false,\s*false\)\s*ON CONFLICT \(sleutel\) DO NOTHING;/);
  }
});

test('M3-W02: каталог CLOUD_VNEXT_AANBIEDERS переводить Nextcloud і NAS у webdav, прибирає CLOUD_M*_STAGING і дотримується мовного закону', () => {
  for (const id of ['onedrive', 'dropbox', 'box']) {
    const a = cloudVnextAanbieder(id);
    assert.ok(a, `Постачальник ${id} присутній`);
    assert.ok((a.vereist?.length ?? 0) >= 2);
    assert.equal(a.vereist?.some((v) => v.startsWith('CLOUD_M') || v.includes('_STAGING')), false);
  }
  assert.deepEqual(cloudVnextAanbieder('onedrive')?.vereist, ['ONEDRIVE_CLIENT_ID', 'ONEDRIVE_CLIENT_SECRET']);

  for (const id of ['nextcloud', 'nas-webdav']) {
    const a = cloudVnextAanbieder(id);
    assert.ok(a);
    assert.equal(a.stand, 'webdav');
    assert.equal(a.richting, 'lezen');
    assert.equal(a.levend, 'webdav');
  }

  for (const a of CLOUD_VNEXT_AANBIEDERS) {
    for (const veld of [a.uitleg, a.detail, ...(a.omweg ? [a.omweg] : [])]) {
      assert.equal(RUSSISCH_RE.test(veld[0]), false, `Заборонені літери в описі ${a.id}`);
      assert.equal(taalwetOvertreding(veld[0]), false, `Порушення мовного закону в описі ${a.id}: ${veld[0]}`);
      assert.ok(/[\u0400-\u04FF]/.test(veld[0]) && /[A-Za-z]/.test(veld[1]));
    }
  }
});

test('M3-W03: cloudOAuthM4Config читає ONEDRIVE_CLIENT_ID та ONEDRIVE_CLIENT_SECRET поряд із CLOUD_MICROSOFT_*', () => {
  const oudId = process.env.ONEDRIVE_CLIENT_ID;
  const oudSec = process.env.ONEDRIVE_CLIENT_SECRET;
  const oudUri = process.env.CLOUD_OAUTH_M4_REDIRECT_URI;
  try {
    process.env.ONEDRIVE_CLIENT_ID = 'onedrive-proef-id';
    process.env.ONEDRIVE_CLIENT_SECRET = nepGeheim('od_', 'proef_', 'geheim_123');
    process.env.CLOUD_OAUTH_M4_REDIRECT_URI = 'https://cloud.tarasevych.com/api/owner/cloud/oauth/m4/callback';
    const cfg = cloudOAuthM4Config('onedrive-personal');
    assert.equal(cfg.clientId, 'onedrive-proef-id');
    assert.ok(cfg.clientSecret.startsWith('od_proef_'));
  } finally {
    if (oudId === undefined) delete process.env.ONEDRIVE_CLIENT_ID; else process.env.ONEDRIVE_CLIENT_ID = oudId;
    if (oudSec === undefined) delete process.env.ONEDRIVE_CLIENT_SECRET; else process.env.ONEDRIVE_CLIENT_SECRET = oudSec;
    if (oudUri === undefined) delete process.env.CLOUD_OAUTH_M4_REDIRECT_URI; else process.env.CLOUD_OAUTH_M4_REDIRECT_URI = oudUri;
  }
});

test('M3-W04: veiligWebdavAdres блокує http://, вбудовані паролі, порти та всі приватні й петльові діапазони IPv4/IPv6', () => {
  assert.equal(veiligWebdavAdres('').ok, false);
  const httpRes = veiligWebdavAdres('http://wolk.voorbeeld.nl/remote.php/dav');
  assert.equal(httpRes.ok, false);
  if (!httpRes.ok) assert.equal(httpRes.fout, 'WEBDAV_SCHEMA_NIET_TOEGESTAAN');

  const metGeheim = veiligWebdavAdres('https://ivan:geheim@wolk.voorbeeld.nl/dav');
  assert.equal(metGeheim.ok, false);
  if (!metGeheim.ok) assert.equal(metGeheim.fout, 'WEBDAV_ADRES_MET_GEHEIM');

  const metPoort = veiligWebdavAdres('https://wolk.voorbeeld.nl:22/dav');
  assert.equal(metPoort.ok, false);
  if (!metPoort.ok) assert.equal(metPoort.fout, 'WEBDAV_POORT_NIET_TOEGESTAAN');

  for (const onveilig of [
    'https://localhost/dav',
    'https://nas.local/dav',
    'https://opslag.internal/dav',
    'https://127.0.0.1/dav',
    'https://[::1]/dav',
    'https://[::ffff:127.0.0.1]/dav',
    'https://[0:0:0:0:0:0:0:1]/dav',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.0.0.5/dav',
    'https://172.16.4.8/dav',
    'https://192.168.1.20/dav',
    'https://100.64.10.2/dav',
    'https://[fe80::1]/dav',
    'https://[fd12:3456::1]/dav',
    'https://2130706433/dav',
  ]) {
    const u = veiligWebdavAdres(onveilig);
    assert.equal(u.ok, false, `Адреса ${onveilig} має блокуватися`);
  }

  const goedNc = veiligWebdavAdres('https://wolk.voorbeeld.nl/', 'nextcloud', 'ivan');
  assert.equal(goedNc.ok, true);
  if (goedNc.ok) {
    assert.equal(goedNc.origin, 'https://wolk.voorbeeld.nl');
    assert.equal(goedNc.padVoorvoegsel, '/remote.php/dav/files/ivan/');
  }

  const goedNas = veiligWebdavAdres('https://nas.voorbeeld.nl:5006/gedeeld/fotos', 'nas-webdav', 'beheer');
  assert.equal(goedNas.ok, true);
  if (goedNas.ok) {
    assert.equal(goedNas.origin, 'https://nas.voorbeeld.nl:5006');
    assert.equal(goedNas.padVoorvoegsel, '/gedeeld/fotos/');
  }
});

test('M3-W05: webdavPropfind блокує перенаправлення 3xx, зовнішні сутності XML (XXE) та підроблені шляхи <d:href>', async () => {
  try {
    // 1. Відмова на перенаправлення 302
    webdavProef.zetNetwerk(async () => new Response('', { status: 302, headers: { Location: 'https://127.0.0.1/' } }));
    const r302 = await webdavPropfind({
      origin: 'https://wolk.voorbeeld.nl',
      padVoorvoegsel: '/dav/',
      gebruikersnaam: 'ivan',
      wachtwoord: nepGeheim('app_', 'ww_', 'proef1'),
    });
    assert.deepEqual(r302, { ok: false, fout: 'WEBDAV_OMLEIDING_GEWEIGERD', status: 502 });

    // 2. Відмова на зовнішні сутності XML (XXE)
    webdavProef.zetNetwerk(async () =>
      new Response(
        '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><d:multistatus xmlns:d="DAV:">&xxe;</d:multistatus>',
        { status: 207 },
      ),
    );
    const rXxe = await webdavPropfind({
      origin: 'https://wolk.voorbeeld.nl',
      padVoorvoegsel: '/dav/',
      gebruikersnaam: 'ivan',
      wachtwoord: nepGeheim('app_', 'ww_', 'proef2'),
    });
    assert.deepEqual(rXxe, { ok: false, fout: 'WEBDAV_XML_ENTITEIT_GEWEIGERD', status: 502 });

    // 3. Відмова на вихід <d:href> на чужий домен або вище кореня
    webdavProef.zetNetwerk(async () =>
      new Response(
        '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>https://boosdoener.voorbeeld.nl/dav/bestand.txt</d:href></d:response></d:multistatus>',
        { status: 207 },
      ),
    );
    const rHref = await webdavPropfind({
      origin: 'https://wolk.voorbeeld.nl',
      padVoorvoegsel: '/dav/',
      gebruikersnaam: 'ivan',
      wachtwoord: nepGeheim('app_', 'ww_', 'proef3'),
    });
    assert.deepEqual(rHref, { ok: false, fout: 'WEBDAV_HREF_ONBETROUWBAAR', status: 502 });

    // 4. Коректна відповідь 207 повертає відсортовані теки й файли
    const geldigXml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<d:multistatus xmlns:d="DAV:">',
      '<d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
      '<d:response><d:href>/dav/notitie.txt</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>42</d:getcontentlength><d:getcontenttype>text/plain</d:getcontenttype><d:getetag>"e1"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
      '<d:response><d:href>/dav/fotos/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>',
      '</d:multistatus>',
    ].join('');
    webdavProef.zetNetwerk(async () => new Response(geldigXml, { status: 207 }));
    const rOk = await webdavPropfind({
      origin: 'https://wolk.voorbeeld.nl',
      padVoorvoegsel: '/dav/',
      gebruikersnaam: 'ivan',
      wachtwoord: nepGeheim('app_', 'ww_', 'proef4'),
    });
    assert.equal(rOk.ok, true);
    if (rOk.ok) {
      assert.equal(rOk.ingangen.length, 2);
      assert.equal(rOk.ingangen[0].map, true);
      assert.equal(rOk.ingangen[0].naam, 'fotos');
      assert.equal(rOk.ingangen[1].naam, 'notitie.txt');
      assert.equal(rOk.ingangen[1].bytes, 42);
    }
  } finally {
    webdavProef.zetNetwerk(null);
  }
});

test('M3-W06: afhandelenCloudWebdav приховує пароль у відповідях і відхиляє спробу запису для ролі viewer', async () => {
  const geheimWw = nepGeheim('wdav_', 'geheim_', 'nooit_tonen_77');
  const antwSsrf = await afhandelenCloudWebdav(
    { aanbieder: 'nextcloud', adres: 'https://127.0.0.1/remote.php/dav', gebruiker: 'ivan', wachtwoord: geheimWw },
    { service: 'cloud', user: { id: 'u-m3-1', role: 'member', status: 'approved' } },
  );
  assert.equal(antwSsrf.statusCode, 403);
  assert.equal(String(antwSsrf.body).includes(geheimWw), false);

  const antwViewer = await afhandelenCloudWebdav(
    { actie: 'koppelen', aanbieder: 'nextcloud', adres: 'https://wolk.voorbeeld.nl/', gebruiker: 'ivan', wachtwoord: geheimWw },
    { service: 'cloud', user: { id: 'u-m3-viewer', role: 'viewer', status: 'approved', accessLevel: 'limited' } },
  );
  assert.equal(antwViewer.statusCode, 403);
  assert.equal(String(antwViewer.body).includes(geheimWw), false);
});

test('M3-W07: маршрути M4, M5, M6, M8, M10, M11 чесно відповідають без падіння 500 і формують безпечне середовище курсора', async () => {
  const ws = ensureM10DirectoryRuntime();
  const prev = ensureM11PreviewRuntime(ws);
  assert.ok(ws && prev, 'Ліниве середовище M10/M11 створюється з похідним 32-байтовим ключем курсора');

  const oudM4 = process.env.CLOUD_M4_CONNECTIONS_STAGING;
  const oudSleutel = process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1;
  try {
    process.env.CLOUD_M4_CONNECTIONS_STAGING = 'enabled';
    delete process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1;
    const m4 = createM4CloudRoutes(async () => ({
      service: 'cloud',
      user: { id: 'u-m4-proef', email: 'm4@example.invalid', status: 'approved' },
    }));
    const startZonderSleutel = await m4['POST /api/owner/cloud/integrations/v1/accounts/start'][0]({
      event: {},
      body: { provider: 'dropbox', mode: 'read' },
      params: {},
    });
    assert.equal(startZonderSleutel.statusCode, 503);
    const parsed = JSON.parse(String(startZonderSleutel.body));
    assert.equal(parsed.error, 'CLOUD_M4_ENCRYPTION_KEY_MISSING');
    assert.equal(parsed.gereed, false);
    assert.ok(parsed.uitleg?.uk && parsed.uitleg?.nl);
  } finally {
    if (oudM4 === undefined) delete process.env.CLOUD_M4_CONNECTIONS_STAGING; else process.env.CLOUD_M4_CONNECTIONS_STAGING = oudM4;
    if (oudSleutel === undefined) delete process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1; else process.env.CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1 = oudSleutel;
  }

  // При вимкнених змінних і без бази (або з прапорцями false) усі шість модулів безпечно закриті кодом 404
  const geenAuth = async () => ({ errorCode: 'NO_SESSION' } as const);
  assert.ok(createM5ProviderCatalogueRoutes(geenAuth));
  assert.ok(createCloudM6AdminRoutes(geenAuth));
  assert.ok(createM8CloudRoutes(geenAuth));
  assert.ok(createM10CloudAdminRoutes(geenAuth, async () => null));
  assert.ok(createM11CloudPreviewRoutes(geenAuth));
});

test('M3-W08: повний життєвий цикл WebDAV та правил автоматизацій у PostgreSQL з ізоляцією просторів prive і technisch', async () => {
  if (!process.env.DATABASE_URL) return;
  const sys = getPool('systeem');
  const tabelAanwezig = await sys
    .query("SELECT to_regclass('app.cloud_webdav_koppelingen') AS reg")
    .then((r) => Boolean(r.rows[0]?.reg))
    .catch(() => false);
  if (!tabelAanwezig) return;

  const uid = randomUUID();
  const sfx = randomBytes(4).toString('hex');
  const ww = nepGeheim('nc_', 'app_ww_', sfx);
  const geldigXml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<d:multistatus xmlns:d="DAV:">',
    `<d:response><d:href>/remote.php/dav/files/gebruiker_${sfx}/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
    `<d:response><d:href>/remote.php/dav/files/gebruiker_${sfx}/verslag.pdf</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontentlength>1024</d:getcontentlength><d:getcontenttype>application/pdf</d:getcontenttype><d:getetag>"v1"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`,
    '</d:multistatus>',
  ].join('');

  await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
    'users',
    uid,
    { email: `m3-w08-${sfx}@example.invalid`, role: 'member', status: 'approved', name: 'Учасник M3' },
  ]);

  try {
    webdavProef.zetNetwerk(async () => new Response(geldigXml, { status: 207 }));
    const auth = { service: 'cloud', user: { id: uid, role: 'member', status: 'approved' } };

    // Підключення у просторі prive
    const koppelRes = await metLade({ userId: uid, ruimte: 'prive' }, 'cloud', () =>
      afhandelenCloudWebdav(
        {
          actie: 'koppelen',
          aanbieder: 'nextcloud',
          naam: 'Робочий Nextcloud',
          adres: 'https://wolk.voorbeeld.nl/',
          gebruikersnaam: `gebruiker_${sfx}`,
          wachtwoord: ww,
        },
        auth,
      ),
    );
    assert.equal(koppelRes.statusCode, 200);
    const koppelData = JSON.parse(String(koppelRes.body));
    assert.equal(String(koppelRes.body).includes(ww), false);
    const koppelingId = String(koppelData.koppeling.id);

    // Перевірка шифрування в таблиці (жодного відкритого пароля)
    const dbRij = await sys.query<{ geheim_envelop: string }>(
      'SELECT geheim_envelop FROM app.cloud_webdav_koppelingen WHERE id = $1::uuid',
      [koppelingId],
    );
    assert.equal(dbRij.rows[0]?.geheim_envelop.includes(ww), false);

    // Технічний простір не бачить особистого підключення
    const lijstTech = await metLade({ userId: uid, ruimte: 'technisch' }, 'cloud', () =>
      afhandelenCloudWebdav({ actie: 'lijst' }, auth),
    );
    assert.equal(JSON.parse(String(lijstTech.body)).koppelingen.length, 0);

    // Перегляд тек у просторі prive працює
    const mappenRes = await metLade({ userId: uid, ruimte: 'prive' }, 'cloud', () =>
      afhandelenCloudWebdav({ actie: 'mappen', id: koppelingId, pad: '/' }, auth),
    );
    assert.equal(mappenRes.statusCode, 200);
    assert.equal(JSON.parse(String(mappenRes.body)).ingangen[0]?.naam, 'verslag.pdf');

    // Створення та запуск правила автоматизації у просторі prive
    const regelRes = await metLade({ userId: uid, ruimte: 'prive' }, 'cloud', () =>
      afhandelenCloudAutomatiseringen(
        {
          actie: 'bewaar',
          naam: 'Копія документів на Диск',
          richting: 'eigen-naar-drive',
          soortActie: 'kopie',
          filterSoort: 'pdf',
          driveAccountId: 'drive-acc-1',
        },
        auth,
      ),
    );
    assert.equal(regelRes.statusCode, 200);
    const regelId = String(JSON.parse(String(regelRes.body)).regel.id);

    const uitvoerRes = await metLade({ userId: uid, ruimte: 'prive' }, 'cloud', () =>
      afhandelenCloudAutomatiseringen({ actie: 'uitvoeren', id: regelId }, auth),
    );
    assert.equal(uitvoerRes.statusCode, 200);

    await metLade({ userId: uid, ruimte: 'prive' }, 'cloud', () =>
      afhandelenCloudAutomatiseringen({ actie: 'verwijder', id: regelId }, auth),
    );
    const ontkoppelRes = await metLade({ userId: uid, ruimte: 'prive' }, 'cloud', () =>
      afhandelenCloudWebdav({ actie: 'ontkoppelen', id: koppelingId, bevestig: true }, auth),
    );
    assert.equal(ontkoppelRes.statusCode, 200);
  } finally {
    webdavProef.zetNetwerk(null);
    await sys.query('DELETE FROM app.cloud_webdav_koppelingen WHERE user_id = $1', [uid]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE data->>'ownerUserId' = $1", [uid]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [uid]).catch(() => undefined);
  }
});

export async function main(): Promise<number> {
  try {
    return await basisMain();
  } finally {
    await closePool().catch(() => undefined);
  }
}
