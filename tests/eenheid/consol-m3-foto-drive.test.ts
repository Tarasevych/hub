// Модульні та інтеграційні випробування Віхи M3 (Блок В):
// служба «Фото» з прямим показом світлин із підключеного Google Диску та WebDAV за явною згодою користувача (З-14),
// реактивні клієнтські обгортки прапорців mr:vlaggen-vernieuwd, чесні пояснення для iCloud і Proton Drive та мовний закон.
// Eenheidstests voor M3: foto-indexering uit Google Drive en WebDAV met uitdrukkelijke toestemming per ruimte.

import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { closePool, getPool } from '../../server/platform/pg';
import { FOTO_BRONNEN, bronDef } from '../../shared/foto-model';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';
import { fotoDienstRoutes, fotoProef } from '../../backend/foto-dienst';
import { metLade } from '../../backend/ruimte-cloud-agenda';
import { png } from './hulp/nep-merk-web';
import { nodeTestSuite } from './hulp/node-test-main';

const { test, main: basisMain } = nodeTestSuite();
const RUSSISCH_RE = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;
const lees = (rel: string): string => readFileSync(resolve(process.cwd(), rel), 'utf8');

test('M3-F01: міграція 0318 реєструє таблицю app.foto_externe_bronnen під FORCE RLS та прапорець foto-google-drive-v1 за VLAG-001', () => {
  const sql = lees('migrations/0318_foto_dienst_afwerking.sql');
  assert.equal(/\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM)\b/i.test(sql), false);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.foto_externe_bronnen/);
  assert.match(sql, /ALTER TABLE app\.foto_externe_bronnen ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /ALTER TABLE app\.foto_externe_bronnen FORCE ROW LEVEL SECURITY;/);
  assert.match(sql, /'foto-google-drive-v1'/);
  assert.match(sql, /false,\s*false\)\s*ON CONFLICT \(sleutel\) DO NOTHING;/);
});

test('M3-F02: модель FOTO_BRONNEN відкриває live для google-drive, nextcloud і nas, зберігає контракти та дотримується мовного закону', () => {
  const gd = bronDef('google-drive');
  assert.ok(gd);
  assert.deepEqual(gd.toegang, ['live', 'archief']);
  assert.equal(gd.gepland, undefined);

  const nc = bronDef('nextcloud');
  const nas = bronDef('nas');
  assert.ok(nc && nc.toegang.includes('live') && nc.gepland === undefined);
  assert.ok(nas && nas.toegang.includes('live') && nas.gepland === undefined);

  // Чесні пояснення без фальшивого live для закритих хмар
  const icloud = bronDef('icloud');
  const proton = bronDef('proton-drive');
  assert.ok(icloud && icloud.toegang.join(',') === 'archief');
  assert.ok(proton && proton.toegang.join(',') === 'archief');

  // Зворотна сумісність із foto-dienst-20261029.test.ts
  assert.equal(bronDef('instagram')?.toegang.join(','), 'archief');
  assert.equal(bronDef('google-photos')?.toegang.join(','), 'kiezer,archief');
  assert.equal(bronDef('eigen')?.toegang.join(','), 'live');

  for (const b of FOTO_BRONNEN) {
    assert.equal(RUSSISCH_RE.test(b.uitleg.uk), false, `Заборонені літери в описі ${b.id}`);
    assert.equal(taalwetOvertreding(b.uitleg.uk), false, `Порушення мовного закону в описі ${b.id}: ${b.uitleg.uk}`);
    assert.ok(/[\u0400-\u04FF]/.test(b.uitleg.uk) && /[A-Za-z]/.test(b.uitleg.nl));
    if (b.archief) {
      assert.equal(RUSSISCH_RE.test(b.archief.uk), false);
      assert.equal(taalwetOvertreding(b.archief.uk), false);
    }
    if (b.gepland) {
      assert.equal(RUSSISCH_RE.test(b.gepland.uk), false);
      assert.equal(taalwetOvertreding(b.gepland.uk), false);
    }
  }
});

test('M3-F03: клієнтські обгортки прапорців Хмари і Фото реактивно оновлюються через mr:vlaggen-vernieuwd, заглушку автоматизацій знято', () => {
  const cloudVlag = lees('src/cloud-vnext/cloud-vlag.ts');
  const fotoVlag = lees('src/foto/foto-vlaggen.ts');
  assert.ok(cloudVlag.includes('mr:vlaggen-vernieuwd'));
  assert.ok(fotoVlag.includes('mr:vlaggen-vernieuwd'));

  const integraties = lees('src/cloud-vnext/onderdelen/Integraties.tsx');
  assert.equal(integraties.includes('Автоматизації: заплановано'), false);
  assert.equal(integraties.includes('Automatiseringen: gepland'), false);
  assert.ok(integraties.includes('export function SleutelsChecklist'));

  for (const docPad of [
    'docs/cloud/КОНСОЛІДАЦІЯ-ХМАРА.uk.md',
    'docs/cloud/CONSOLIDATIE-CLOUD.nl.md',
    'docs/foto/КОНСОЛІДАЦІЯ-ФОТО.uk.md',
    'docs/foto/CONSOLIDATIE-FOTO.nl.md',
  ]) {
    const inhoud = lees(docPad);
    assert.ok(inhoud.length > 400, `Документ ${docPad} має бути змістовним`);
    assert.equal(RUSSISCH_RE.test(inhoud), false, `Документ ${docPad} не містить заборонених літер`);
  }
});

test('M3-F04: fotoDienstRoutes вимагає явної згоди toestemming: true і розмежовує індексовані світлини Google Диску за простором', async () => {
  // Без бази даних перевіряємо відмову для ролі viewer і відмову без toestemming: true
  const routesViewer = fotoDienstRoutes(
    async () => ({ service: 'hub', user: { id: 'u-viewer', role: 'viewer', status: 'approved' } }),
    { vlagAan: async () => true },
  );
  const viewerAntw = (await (routesViewer['POST /api/owner/foto/indexeer'][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({
    event: {},
    body: { bron: 'google-drive', toestemming: true },
  }));
  assert.equal(viewerAntw.statusCode, 403);

  const routesLid = fotoDienstRoutes(
    async () => ({ service: 'hub', user: { id: 'u-lid', role: 'member', status: 'approved' } }),
    { vlagAan: async () => true },
  );
  const zonderToestemming = (await (routesLid['POST /api/owner/foto/indexeer'][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({
    event: {},
    body: { bron: 'google-drive', toestemming: false },
  }));
  assert.equal(zonderToestemming.statusCode, 400);
  assert.equal(JSON.parse(zonderToestemming.body).error, 'TOESTEMMING_VEREIST');

  if (!process.env.DATABASE_URL) return;
  const sys = getPool('systeem');
  const heeftRecords = await sys
    .query("SELECT to_regclass('app.records') AS reg")
    .then((r) => Boolean(r.rows[0]?.reg))
    .catch(() => false);
  if (!heeftRecords) return;

  const sfx = randomBytes(4).toString('hex');
  const tmpBasis = process.env.TMPDIR || resolve('rapporten');
  mkdirSync(tmpBasis, { recursive: true });
  const uploadsPad = join(tmpBasis, `foto-m3-proef-${sfx}`);
  mkdirSync(uploadsPad, { recursive: true });
  const oudUploads = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = uploadsPad;

  const uid = randomUUID();
  const beeldBytes = Buffer.from(png());
  const verwachtSha = createHash('sha256').update(beeldBytes).digest('hex');

  await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
    'users',
    uid,
    { email: `foto-m3-${sfx}@example.invalid`, role: 'member', status: 'approved', name: 'Фотографія M3' },
  ]);

  try {
    fotoProef.zetDriveLezer({
      async lijst(lade) {
        if (lade.ruimte !== 'prive') return { gekoppeld: false, items: [] };
        return {
          gekoppeld: true,
          items: [
            {
              fileId: `drv-foto-${sfx}`,
              principalId: `prin-${sfx}`,
              accountId: `acc-${sfx}`,
              naam: 'karpaty-zima.png',
              mime: 'image/png',
              bytes: beeldBytes.length,
              aangemaaktMs: Date.parse('2025-01-15T12:00:00.000Z'),
            },
          ],
        };
      },
      async bytes(lade, fileId) {
        if (lade.ruimte !== 'prive' || fileId !== `drv-foto-${sfx}`) throw new Error('BRON_NIET_BESCHIKBAAR');
        return beeldBytes;
      },
    });

    const routes = fotoDienstRoutes(
      async () => ({ service: 'hub', user: { id: uid, role: 'member', status: 'approved' } }),
      { vlagAan: async () => true },
    );
    const roep = async (pad: string, body: Record<string, unknown>, ruimte: 'prive' | 'technisch' = 'prive') => {
      const r = await metLade({ userId: uid, ruimte }, 'cloud', () =>
        (routes[`POST /api/owner/foto/${pad}`][0] as unknown as (c: unknown) => Promise<{ statusCode: number; body: string }>)({
          event: {},
          body,
        }),
      );
      return { status: r.statusCode, data: JSON.parse(r.body) };
    };

    const idx1 = await roep('indexeer', { bron: 'google-drive', toestemming: true }, 'prive');
    assert.equal(idx1.status, 200);
    assert.equal(idx1.data.nieuw, 1);

    // Повторне індексування не дублює світлину
    const idx2 = await roep('indexeer', { bron: 'google-drive', toestemming: true }, 'prive');
    assert.equal(idx2.data.nieuw, 0);
    assert.equal(idx2.data.gekoppeld, 1);

    // У особистій бібліотеці світлина присутня і доступна для перегляду байтів
    const bibPrive = await roep('bibliotheek', { bron: 'google-drive' }, 'prive');
    assert.equal(bibPrive.data.totaal, 1);
    const fotoId = String(bibPrive.data.items[0].id);
    assert.equal(bibPrive.data.items[0].beschikbaar, true);

    const inh = await roep('inhoud', { id: fotoId }, 'prive');
    assert.equal(inh.status, 200);
    assert.equal(inh.data.sha256, verwachtSha);

    // Технічний простір не бачить ні світлини, ні згоди особистого простору
    const bibTech = await roep('bibliotheek', {}, 'technisch');
    assert.equal(bibTech.data.totaal, 0);
  } finally {
    fotoProef.zetDriveLezer(null);
    if (oudUploads === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = oudUploads;
    rmSync(uploadsPad, { recursive: true, force: true });
    await sys.query('DELETE FROM app.foto_externe_bronnen WHERE user_id = $1', [uid]).catch(() => undefined);
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
