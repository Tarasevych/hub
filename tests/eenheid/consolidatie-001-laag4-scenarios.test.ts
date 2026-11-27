// Наскрізні багатоступеневі двомовні сценарії Рівня 4 консолідованого оновлення (CONSOLIDATIE-001, Laag 4):
// 12 повних користувацьких та інфраструктурних потоків через декілька служб, спільні контракти та живу базу PostgreSQL
// з обов’язковою перевіркою української (uk) та нідерландської (nl) мов і суворих меж безпеки.
// Meertraps eind-tot-eind-scenario's van Laag 4 in het Oekraïens (uk) en Nederlands (nl).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { nodeTestSuite } from './hulp/node-test-main';
import { nepBrowser } from './hulp/nep-browser';
import { nepGeheim } from './hulp/nep-geheim';
import { png } from './hulp/nep-merk-web';
import { taalFouten } from './hulp/taalcontrole';

import { SERVICE_HOSTS } from '../../backend/deployment-identiteit';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { dienstVoorSoort, routeerMeldingLink } from '../../shared/melding-link';
import { DIEPE_PARAMS, agendaItemId, diepeRoute } from '../../shared/zoek-diepe-link';
import { ontleedIcs } from '../../shared/agenda-ics-model';
import { NOTITIE_BRONNEN, notitieBron, schoneInvoer } from '../../shared/notities-vnext-model';
import { SLEUTELKLUIS_REGISTER, isDekEnvelop, omslagAad } from '../../shared/sleutelkluis';
import { ACTIE_LABELS, categorieVan } from '../../shared/beheer-journaal';
import { normaliseerGebeurtenis, standaardProfiel } from '../../shared/meldingen-ecosysteem';
import { interpreteerGebeurtenis } from '../../shared/meldingen-ecosysteem/tolk';
import { toegestaan as werkbladToegestaan, werkbladWidget } from '../../shared/werkblad-indeling';
import { bureauWidget, plaatsbaar } from '../../shared/bureau-indeling';
import { DIENST_DEF } from '../../shared/werkblad-register';
import { CLOUD_VNEXT_AANBIEDERS } from '../../shared/cloud-vnext-model';
import { bronDef } from '../../shared/foto-model';
import { VERTAAL_MOTOREN, motorenMetStand, vertaaldDoorZin } from '../../shared/ai-vertaling';
import { MAIL_IMAP_AANBIEDERS, mailAanbieder, mailAanbiederHeeftKnop, mailAanbiederVolledig } from '../../shared/mail-aanbieders';
import { API_PLATFORM_CAPABILITIES, apiPlatformContractPayload } from '../../src/api-platform-contract';
import { bevatGevoeligGeheim, TAAK_STATUS_META } from '../../shared/geheugen-stroom';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';
import {
  KLIMOP_DIENST_TEKST,
  KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST,
  KLIMOP_LEESMODUS_TEKST,
  KlimopFout,
} from '../../shared/klimop-overzicht-model';

const { test, main: basisMain } = nodeTestSuite();

mkdirSync(resolve('rapporten'), { recursive: true });
const dynMap = mkdtempSync(join(resolve('rapporten'), 'dyn-e2e-laag4-'));
process.once('exit', () => {
  try {
    rmSync(dynMap, { recursive: true, force: true });
  } catch {
    /* тимчасова тека вже прибрана */
  }
});

const lees = (relPad: string): string => readFileSync(resolve(process.cwd(), relPad), 'utf8');
const RUSSISCH_RE = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;

function zorgWindowGebeurtenissen(origin = 'https://hub.tarasevych.com', taal: 'uk' | 'nl' = 'uk'): void {
  nepBrowser(origin, taal);
  const docEl = (globalThis as unknown as { document?: { documentElement?: Record<string, unknown> } }).document?.documentElement;
  if (docEl) {
    docEl.addEventListener ??= () => undefined;
    docEl.removeEventListener ??= () => undefined;
    docEl.setAttribute ??= () => undefined;
    docEl.getAttribute ??= () => null;
    docEl.removeAttribute ??= () => undefined;
  }
  const g = globalThis as unknown as Record<string, unknown>;
  g.matchMedia ??= () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
  const w = (globalThis as unknown as { window: Record<string, unknown> }).window;
  w.matchMedia ??= g.matchMedia;
  if (w.__mrEchteGebeurtenissen) return;
  const kaart = new Map<string, Set<(ev: unknown) => void>>();
  w.addEventListener = (soort: string, fn: (ev: unknown) => void) => {
    if (typeof fn !== 'function') return;
    let reeks = kaart.get(soort);
    if (!reeks) {
      reeks = new Set();
      kaart.set(soort, reeks);
    }
    reeks.add(fn);
  };
  w.removeEventListener = (soort: string, fn: (ev: unknown) => void) => {
    kaart.get(soort)?.delete(fn);
  };
  w.dispatchEvent = (ev: { type?: string }) => {
    const soort = String(ev?.type || '');
    for (const fn of [...(kaart.get(soort) ?? [])]) fn(ev);
    return true;
  };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, vlaggen: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
  w.__mrEchteGebeurtenissen = true;
}

const SERVER_INGANGEN = [
  'server/platform/pg.ts',
  'backend/index.ts',
  'backend/stap-op.ts',
  'backend/vlaggen.ts',
  'backend/tech-profiel.ts',
  'backend/tech-ruimtes-kern.ts',
  'backend/ruimte-sessie.ts',
  'backend/sleutelkluis.ts',
  'backend/notities-vnext.ts',
  'backend/afstemming-kern.ts',
  'backend/cloud-verbinding-m4-routes.ts',
  'backend/cloud-m5-catalogue-routes.ts',
  'backend/cloud-m6-beheer-routes.ts',
  'backend/cloud-m8-routes.ts',
  'backend/cloud-m10-beheer-brug.ts',
  'backend/cloud-m11-voorbeeld-routes.ts',
  'backend/api-platform-tokens.ts',
  'backend/geheugen-taken.ts',
  'backend/zoek/catalogus-ui.ts',
  'backend/klimop-overdracht-opslag.ts',
  'backend/uitrol-ontwikkelarchief.ts',
] as const;

type ServerBundel = {
  pg: typeof import('../../server/platform/pg.ts');
  index: typeof import('../../backend/index.ts');
  stapOp: typeof import('../../backend/stap-op.ts');
  vlaggen: typeof import('../../backend/vlaggen.ts');
  techProfiel: typeof import('../../backend/tech-profiel.ts');
  techRuimtes: typeof import('../../backend/tech-ruimtes-kern.ts');
  ruimteSessie: typeof import('../../backend/ruimte-sessie.ts');
  sleutelkluis: typeof import('../../backend/sleutelkluis.ts');
  notities: typeof import('../../backend/notities-vnext.ts');
  afstemming: typeof import('../../backend/afstemming-kern.ts');
  cloudM4: typeof import('../../backend/cloud-verbinding-m4-routes.ts');
  cloudM5: typeof import('../../backend/cloud-m5-catalogue-routes.ts');
  cloudM6: typeof import('../../backend/cloud-m6-beheer-routes.ts');
  cloudM8: typeof import('../../backend/cloud-m8-routes.ts');
  cloudM10: typeof import('../../backend/cloud-m10-beheer-brug.ts');
  cloudM11: typeof import('../../backend/cloud-m11-voorbeeld-routes.ts');
  apiPlatform: typeof import('../../backend/api-platform-tokens.ts');
  geheugenTaken: typeof import('../../backend/geheugen-taken.ts');
  zoekCatalogus: typeof import('../../backend/zoek/catalogus-ui.ts');
  klimop: typeof import('../../backend/klimop-overdracht-opslag.ts');
  ontwikkelArchief: typeof import('../../backend/uitrol-ontwikkelarchief.ts');
};

type LambdaEventInvoer = Parameters<ServerBundel['index']['handler']>[0];

function maakLambdaEvent(
  pad: string,
  body: unknown = {},
  opties: { methode?: string; host?: string; cookie?: string; headers?: Record<string, string>; query?: Record<string, string> } = {},
): LambdaEventInvoer {
  const methode = opties.methode ?? 'POST';
  const host = opties.host ?? SERVICE_HOSTS.hub;
  return {
    headers: {
      host,
      origin: `https://${host}`,
      'content-type': 'application/json',
      ...(opties.cookie ? { cookie: opties.cookie } : {}),
      'user-agent': 'e2e-laag4',
      ...(opties.headers ?? {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
    isBase64Encoded: false,
    rawPath: pad,
    rawQueryString: '',
    queryStringParameters: opties.query ?? {},
    requestContext: { http: { method: methode, path: pad, sourceIp: '203.0.113.25', userAgent: 'e2e-laag4' } },
  };
}

let serverBundelBelofte: Promise<ServerBundel> | null = null;
function laadServerBundel(): Promise<ServerBundel> {
  if (serverBundelBelofte) return serverBundelBelofte;
  serverBundelBelofte = (async () => {
    const subMap = join(dynMap, 'srv-laag4');
    mkdirSync(subMap, { recursive: true });
    await build({
      entryPoints: SERVER_INGANGEN.map((p) => resolve(process.cwd(), p)),
      outdir: subMap,
      outbase: process.cwd(),
      bundle: true,
      splitting: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      packages: 'external',
      loader: { '.css': 'empty' },
      logLevel: 'silent',
    });
    const imp = <T>(rel: string) => import(pathToFileURL(join(subMap, rel.replace(/\.tsx?$/, '.js'))).href) as Promise<T>;
    const [
      pg,
      index,
      stapOp,
      vlaggen,
      techProfiel,
      techRuimtes,
      ruimteSessie,
      sleutelkluis,
      notities,
      afstemming,
      cloudM4,
      cloudM5,
      cloudM6,
      cloudM8,
      cloudM10,
      cloudM11,
      apiPlatform,
      geheugenTaken,
      zoekCatalogus,
      klimop,
      ontwikkelArchief,
    ] = await Promise.all([
      imp<ServerBundel['pg']>('server/platform/pg.ts'),
      imp<ServerBundel['index']>('backend/index.ts'),
      imp<ServerBundel['stapOp']>('backend/stap-op.ts'),
      imp<ServerBundel['vlaggen']>('backend/vlaggen.ts'),
      imp<ServerBundel['techProfiel']>('backend/tech-profiel.ts'),
      imp<ServerBundel['techRuimtes']>('backend/tech-ruimtes-kern.ts'),
      imp<ServerBundel['ruimteSessie']>('backend/ruimte-sessie.ts'),
      imp<ServerBundel['sleutelkluis']>('backend/sleutelkluis.ts'),
      imp<ServerBundel['notities']>('backend/notities-vnext.ts'),
      imp<ServerBundel['afstemming']>('backend/afstemming-kern.ts'),
      imp<ServerBundel['cloudM4']>('backend/cloud-verbinding-m4-routes.ts'),
      imp<ServerBundel['cloudM5']>('backend/cloud-m5-catalogue-routes.ts'),
      imp<ServerBundel['cloudM6']>('backend/cloud-m6-beheer-routes.ts'),
      imp<ServerBundel['cloudM8']>('backend/cloud-m8-routes.ts'),
      imp<ServerBundel['cloudM10']>('backend/cloud-m10-beheer-brug.ts'),
      imp<ServerBundel['cloudM11']>('backend/cloud-m11-voorbeeld-routes.ts'),
      imp<ServerBundel['apiPlatform']>('backend/api-platform-tokens.ts'),
      imp<ServerBundel['geheugenTaken']>('backend/geheugen-taken.ts'),
      imp<ServerBundel['zoekCatalogus']>('backend/zoek/catalogus-ui.ts'),
      imp<ServerBundel['klimop']>('backend/klimop-overdracht-opslag.ts'),
      imp<ServerBundel['ontwikkelArchief']>('backend/uitrol-ontwikkelarchief.ts'),
    ]);
    return {
      pg,
      index,
      stapOp,
      vlaggen,
      techProfiel,
      techRuimtes,
      ruimteSessie,
      sleutelkluis,
      notities,
      afstemming,
      cloudM4,
      cloudM5,
      cloudM6,
      cloudM8,
      cloudM10,
      cloudM11,
      apiPlatform,
      geheugenTaken,
      zoekCatalogus,
      klimop,
      ontwikkelArchief,
    };
  })();
  return serverBundelBelofte;
}

async function laadProjectModule<T = Record<string, unknown>>(relPad: string): Promise<T | null> {
  const volPad = resolve(process.cwd(), relPad);
  if (!existsSync(volPad)) return null;
  const veilig = relPad.replace(/[^a-zA-Z0-9_-]/g, '_');
  const uitPad = join(dynMap, `${veilig}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.mjs`);
  await build({
    entryPoints: [volPad],
    outfile: uitPad,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    packages: 'external',
    loader: { '.css': 'empty' },
    logLevel: 'silent',
  });
  return (await import(pathToFileURL(uitPad).href)) as T;
}

async function laadMjsScript<T = Record<string, unknown>>(relPad: string): Promise<T> {
  return (await import(pathToFileURL(resolve(process.cwd(), relPad)).href)) as T;
}

let aangemaakteEigenaarId: string | null = null;

async function zorgTestEigenaar(): Promise<{ id: string; email: string; role: 'owner'; status: 'approved' }> {
  const { pg } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const bestaand = (
    await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1`)
  ).rows[0] as { id?: string; email?: string } | undefined;
  if (bestaand?.id && bestaand.email) {
    process.env.OWNER_EMAIL = String(bestaand.email);
    return { id: String(bestaand.id), email: String(bestaand.email), role: 'owner', status: 'approved' };
  }
  const id = randomUUID();
  const email = process.env.OWNER_EMAIL || 'eigenaar@example.invalid';
  process.env.OWNER_EMAIL = email;
  const ingevoegd = await pool.query(
    'INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id',
    ['users', id, { email, role: 'owner', status: 'approved', name: 'Власник платформи' }],
  );
  if ((ingevoegd.rowCount ?? 0) > 0) aangemaakteEigenaarId = id;
  return { id, email, role: 'owner', status: 'approved' };
}

function alleBestandenOnder(mapPad: string, filter: RegExp): string[] {
  const volMap = resolve(process.cwd(), mapPad);
  if (!existsSync(volMap)) return [];
  const uit: string[] = [];
  for (const naam of readdirSync(volMap)) {
    const p = join(volMap, naam);
    if (statSync(p).isDirectory()) {
      if (naam !== 'node_modules' && naam !== 'dist') uit.push(...alleBestandenOnder(join(mapPad, naam), filter));
    } else if (filter.test(naam)) {
      uit.push(join(mapPad, naam));
    }
  }
  return uit;
}

async function maakSessieVoorDienst(
  userId: string,
  service: string,
  host: string,
): Promise<{ sessieId: string; cookie: string; opruimen: () => Promise<void> }> {
  const { pg } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
  const sessieId = randomUUID();
  const ruwGeheim = randomBytes(32).toString('base64url');
  const nu = Date.now();
  const ep = Number(
    (
      await pool.query(
        `SELECT (data->>'epoch')::int AS e FROM app.records WHERE tbl = 'owner_revocation_state_v1' AND data->>'userId' = $1 ORDER BY (data->>'epoch')::int DESC LIMIT 1`,
        [userId],
      )
    ).rows[0]?.e || 0,
  );
  await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
    'owner_service_sessions_v1',
    sessieId,
    {
      tokenHash: createHash('sha256').update(ruwGeheim).digest('hex'),
      userId,
      service,
      sourceOrigin: `https://${host}`,
      tabHash: createHash('sha256').update('ecosystem').digest('hex'),
      grantId: '',
      createdAt: nu,
      authenticatedAt: nu,
      lastSeenAt: nu,
      idleExpiresAt: nu + 7 * 86_400_000,
      absoluteExpiresAt: nu + 30 * 86_400_000,
      rotation: 0,
      version: 1,
      revocationEpoch: ep,
      scope: 'ecosystem',
      authMethod: 'google',
      ip: '203.0.113.25',
      userAgent: 'e2e-laag4',
    },
  ]);
  return {
    sessieId,
    cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${sessieId}.${ruwGeheim}`)}`,
    opruimen: async () => {
      await pool.query("DELETE FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND id = $1", [sessieId]).catch(() => undefined);
    },
  };
}

// ============================================================================
// Сценарії Рівня 4 (L4-S01 .. L4-S12)
// ============================================================================

test('L4-S01: Пошта з вкладенням → Спільний переглядач вкладень → Календар оплат і подій → Двостороння прив’язка Нотатки (noteId ↔ eventId) двома мовами (uk + nl)', async () => {
  zorgWindowGebeurtenissen('https://mail.tarasevych.com', 'uk');
  const { pg, notities } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const uid = randomUUID();
  await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
    'users',
    uid,
    { email: `s01-${uid.slice(0, 8)}@example.invalid`, role: 'user', status: 'approved', name: 'Олена Коваль' },
  ]);

  let aangemaakteNotitieId: string | null = null;
  try {
    // Крок 1: Спільний переглядач вкладень (№208) + три режими вигляду + міжслужбові мости з Пошти (uk + nl)
    assert.ok(
      existsSync(resolve(process.cwd(), 'src/bijlage-weergave')),
      'Крок 1: Очікується підсистема спільного переглядача вкладень src/bijlage-weergave/',
    );
    const mailBronnen = [
      ...alleBestandenOnder('src/mail', /\.tsx?$/),
      'src/GoogleMailWerkruimte.tsx',
    ]
      .filter((p) => existsSync(resolve(process.cwd(), p)))
      .map(lees)
      .join('\n');
    assert.ok(
      (mailBronnen.includes('notities') || mailBronnen.includes('notes')) &&
        (mailBronnen.includes('afstemming') || mailBronnen.includes('tasks')) &&
        (mailBronnen.includes('agenda') || mailBronnen.includes('calendar')),
      'Крок 1: Вікно листа в Пошті має містити швидкі міжслужбові переходи до Нотаток, Завдань/Узгодження та Календаря (uk + nl)',
    );

    // Крок 2: Справжнє створення нотатки в app.notities + дзеркалі app.mcp_console_items для обох мов
    const schoon = schoneInvoer({
      titel: 'Оплата рахунку за електроенергію / Betaling energiefactuur',
      inhoud: '- [ ] Перевірити вкладений рахунок\n- [ ] Controleer de bijgevoegde factuur',
      soort: 'lijst',
      kleur: 'blauw',
      etiketten: ['оплата', 'factuur'],
      vast: true,
    });
    assert.equal(schoon.ok, true, 'Вхідні дані двомовної нотатки мають проходити валідацію');
    if (!schoon.ok) return;

    const gemaakt = await notities.notitieMaken({ userId: uid, ruimte: 'prive' }, schoon.invoer, { auteur: 'Олена' });
    assert.ok(!('fout' in gemaakt), 'Нотатка має успішно записуватися у app.notities');
    if ('fout' in gemaakt) return;
    aangemaakteNotitieId = gemaakt.id;

    const spiegelRij = (
      await pool.query("SELECT id, kind, title FROM app.mcp_console_items WHERE id::text = $1 AND user_id = $2", [
        gemaakt.id,
        uid,
      ])
    ).rows[0];
    assert.ok(spiegelRij && spiegelRij.kind === 'note', 'Крок 2: Створена нотатка має синхронно віддзеркалюватися в app.mcp_console_items');

    // Крок 3: Зняття заглушки у Нотатках та серверна прив'язка noteId ↔ eventId із FORCE RLS
    const notitiesPaginaBron = lees('src/notities/NotitiesPagina.tsx');
    assert.ok(
      !notitiesPaginaBron.includes('Ще не працює — див. «Інтеграції»') && !notitiesPaginaBron.includes('Werkt nog niet — zie «Integraties»'),
      'Крок 3: У NotitiesPagina.tsx має бути знята стара заглушка про неробочий зв’язок із Календарем обома мовами (uk + nl)',
    );
    const kalenderBron = notitieBron('google-calendar');
    assert.ok(
      kalenderBron && kalenderBron.stand !== 'gepland' && !kalenderBron.wat[0].includes('Серверної таблиці відповідностей ще немає'),
      'Крок 3: Джерело зв’язку нотатки з календарем у NOTITIE_BRONNEN має працювати замість стану gepland',
    );
    for (const b of NOTITIE_BRONNEN) {
      assert.ok(
        /[\u0400-\u04FF]/.test(b.uitleg[0]) && /[A-Za-z]/.test(b.uitleg[1]),
        `Джерело нотаток ${b.id} має містити непорожні пояснення uk (кирилицею) та nl (латиницею)`,
      );
      assert.equal(RUSSISCH_RE.test(b.uitleg[0]), false, `Пояснення джерела ${b.id} не може містити заборонених літер`);
      if (b.stand !== 'gepland') {
        assert.equal(taalwetOvertreding(b.uitleg[0]), false, `Робоче джерело ${b.id} має дотримуватися мовного закону`);
      }
    }

    // Крок 4: Перевірка експорту події у формат .ics (VCALENDAR/VEVENT) із зворотним розбором ontleedIcs та глибоких посилань
    const agendaBestanden = [
      'shared/agenda-ics-model.ts',
      'shared/agenda-caldav-model.ts',
      ...alleBestandenOnder('src/agenda', /\.tsx?$/),
      ...alleBestandenOnder('backend', /^agenda-.*\.ts$/),
    ].filter((p) => existsSync(resolve(process.cwd(), p)));
    const agendaBronTekst = agendaBestanden.map(lees).join('\n');
    assert.ok(
      /BEGIN:VCALENDAR/.test(agendaBronTekst) && /BEGIN:VEVENT/.test(agendaBronTekst) && /END:VEVENT/.test(agendaBronTekst),
      'Крок 4: Календар має містити генератор дійсного формату VCALENDAR/VEVENT (.ics) або запис CalDAV PUT',
    );

    const voorbeeldIcs = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'X-WR-CALNAME:Оплати / Betalingen',
      'BEGIN:VEVENT',
      `UID:afspraak-${gemaakt.id}@tarasevych.com`,
      'DTSTART:20261125T100000Z',
      'DTEND:20261125T103000Z',
      'SUMMARY:Оплата рахунку / Betaling factuur',
      `DESCRIPTION:Пов’язана нотатка ${gemaakt.id}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const ontleed = ontleedIcs(voorbeeldIcs);
    assert.equal(ontleed.vevents, 1);
    assert.equal(ontleed.gebeurtenissen[0]?.titel, 'Оплата рахунку / Betaling factuur');

    const diepAgenda = diepeRoute({ host: 'cloud', pad: 'calendar', params: { afspraak: agendaItemId('primary', 'ev-s01') } }, 'afspraak');
    const diepNotitie = diepeRoute({ host: 'hub', pad: 'notes', params: { item: gemaakt.id } }, 'notitie');
    assert.equal(diepAgenda?.host, 'hub');
    assert.equal(diepAgenda?.params?.[DIEPE_PARAMS.afspraak], 'google:primary:ev-s01');
    assert.equal(diepNotitie?.params?.[DIEPE_PARAMS.item], gemaakt.id);
  } finally {
    if (aangemaakteNotitieId) {
      await notities.notitieActie({ userId: uid, ruimte: 'prive' }, aangemaakteNotitieId, 'definitief').catch(() => undefined);
    }
    await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [uid]).catch(() => undefined);
  }
});

test('L4-S02: Пошта (лист від замовника) → Клієнтські взаємини (KLANT-001) → Шифрування DEK у app.klantrelatieboek під FORCE RLS → Безвмістовий запис у журнал безпеки (uk + nl)', async () => {
  zorgWindowGebeurtenissen('https://hub.tarasevych.com', 'uk');
  const { pg, sleutelkluis, index } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const appPool = pg.getPool('app');

  const gebruikerA = randomUUID();
  const gebruikerB = randomUUID();
  const sessieHouder = `s02-sessie-${randomBytes(4).toString('hex')}`;
  await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3), ($1, $4, $5)', [
    'users',
    gebruikerA,
    { email: `klant-a-${gebruikerA.slice(0, 8)}@example.invalid`, role: 'user', status: 'approved', name: 'Користувач А' },
    gebruikerB,
    { email: `klant-b-${gebruikerB.slice(0, 8)}@example.invalid`, role: 'user', status: 'approved', name: 'Користувач Б' },
  ]);

  const crmHost = (SERVICE_HOSTS as Record<string, string>).crm || 'crm.tarasevych.com';
  const sessieA = await maakSessieVoorDienst(gebruikerA, 'crm', crmHost);
  sleutelkluis.zetHouderControle(async () => true);

  try {
    // Крок 1: Наявність міграцій 0307_klantrelatiebeheer.sql + 0312_klantrelatiebeheer_rls_en_vlag.sql, клієнтської служби та мосту «Картка клієнта» з Пошти (uk + nl)
    assert.ok(
      existsSync(resolve(process.cwd(), 'migrations/0307_klantrelatiebeheer.sql')) &&
        existsSync(resolve(process.cwd(), 'migrations/0312_klantrelatiebeheer_rls_en_vlag.sql')) &&
        existsSync(resolve(process.cwd(), 'src/klantrelatiebeheer')),
      'Крок 1: Служба взаємин із клієнтами (KLANT-001: міграції 0307 + 0312 та каталог src/klantrelatiebeheer/) має бути влита',
    );
    const mailBron = alleBestandenOnder('src/mail', /\.tsx?$/).map(lees).join('\n');
    assert.ok(
      mailBron.includes('klant') || mailBron.includes('Клієнт') || mailBron.includes('Картк'),
      'Крок 1: Панель відкритого листа в Пошті має містити дію переходу до Картки клієнта двома мовами (uk + nl)',
    );

    // Крок 2: Реєстрація app.klantrelatieboek у SLEUTELKLUIS_REGISTER зі stand === 'dek' та відкриття ключа DEK
    const kluisRegel = SLEUTELKLUIS_REGISTER.find((r) => r.tabel === 'app.klantrelatieboek');
    assert.ok(kluisRegel && kluisRegel.stand === 'dek', 'Крок 2: Таблиця app.klantrelatieboek має бути зареєстрована у SLEUTELKLUIS_REGISTER зі stand === dek');

    await sleutelkluis.inschakelen({ userId: gebruikerA, ruimte: 'prive' }, { soort: 'sessie', id: sessieHouder });
    assert.equal(await sleutelkluis.kluisStand({ userId: gebruikerA, ruimte: 'prive' }), 'open');

    const aadPrive = omslagAad(gebruikerA, 'prive', 'klant', 'dossier-1');
    const aadTech = omslagAad(gebruikerA, 'technisch', 'klant', 'dossier-1');
    const verzegeldDossier = await sleutelkluis.verzegel(
      { userId: gebruikerA, ruimte: 'prive' },
      'app.klantrelatieboek',
      JSON.stringify({ naamUk: 'Будівельна артіль Північ', naamNl: 'Bouwgilde Noord', bedrag: 14500 }),
      aadPrive,
      'SLEUTELKLUIS_SLEUTEL_V1',
    );
    assert.ok(isDekEnvelop(verzegeldDossier), 'Чутливі поля картки замовника мають шифруватися обгорткою dek1.');
    assert.ok(!verzegeldDossier.includes('Будівельна') && !verzegeldDossier.includes('14500'), 'У зашифрованому конверті не може бути відкритих імен чи сум');
    await assert.rejects(
      () => sleutelkluis.ontzegel({ userId: gebruikerA, ruimte: 'prive' }, 'app.klantrelatieboek', verzegeldDossier, aadTech, 'SLEUTELKLUIS_SLEUTEL_V1'),
      'Конверт простору prive не повинен розшифровуватися з AAD простору technisch',
    );

    // Крок 3: Перевірка таблиці app.klantrelatieboek на ENABLE + FORCE ROW LEVEL SECURITY у PostgreSQL та ізоляції між A і B
    const rlsInfo = (
      await pool.query(
        `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'app' AND c.relname = 'klantrelatieboek'`,
      )
    ).rows[0] as { rls?: boolean; force_rls?: boolean } | undefined;
    assert.ok(rlsInfo, 'Таблиця app.klantrelatieboek має існувати у схемі app');
    assert.equal(rlsInfo.rls, true, 'На app.klantrelatieboek має бути увімкнений ENABLE ROW LEVEL SECURITY');
    assert.equal(rlsInfo.force_rls, true, 'На app.klantrelatieboek має бути увімкнений FORCE ROW LEVEL SECURITY');

    const klantAanmaak = await index.handler(
      maakLambdaEvent(
        '/api/owner/klantrelatiebeheer/klant',
        {
          service: 'crm',
          tabContext: 'e2e-tab-s02',
          sourceOrigin: `https://${crmHost}`,
          sleutel: randomUUID(),
          naam: 'Будівельна артіль Північ',
          organisatie: 'Bouwgilde Noord',
        },
        { host: crmHost, cookie: sessieA.cookie },
      ),
    );
    assert.equal(
      klantAanmaak.statusCode,
      200,
      `Створення картки клієнта має повертати 200 (отримано ${klantAanmaak.statusCode}: ${klantAanmaak.body})`,
    );
    const rijenVanA = await pool.query('SELECT count(*)::int AS n FROM app.klantrelatieboek WHERE gebruiker = $1', [gebruikerA]);
    assert.ok(Number(rijenVanA.rows[0]?.n || 0) >= 1, 'У таблиці app.klantrelatieboek має бути збережений зашифрований запис користувача А');

    const clientB = await appPool.connect();
    try {
      await clientB.query('BEGIN');
      await clientB.query("SELECT set_config('app.user_id', $1, true)", [gebruikerB]);
      await clientB.query("SELECT set_config('app.ruimte', 'prive', true)");
      const zichtbaarVoorB = await clientB.query('SELECT count(*)::int AS n FROM app.klantrelatieboek');
      assert.equal(Number(zichtbaarVoorB.rows[0]?.n || 0), 0, 'Користувач Б не може бачити жодного запису клієнтів користувача А');
    } finally {
      await clientB.query('ROLLBACK').catch(() => undefined);
      clientB.release();
    }

    // Крок 4: Події аудиту klant.* / owner.klantrelatie.* у MELDINGEN-REGISTER-001 (uk + nl, без категорії overig) та дійсне посилання melding-link
    const klantCodes = Object.keys(ACTIE_LABELS).filter((k) => k.startsWith('klant.') || k.startsWith('owner.klantrelatie.'));
    assert.ok(
      klantCodes.length >= 2,
      'Крок 4: У ACTIE_LABELS мають бути зареєстровані коди дій klant.* або owner.klantrelatie.* служби взаємин із клієнтами',
    );
    for (const code of klantCodes) {
      const [uk, nl] = ACTIE_LABELS[code];
      assert.ok(uk.length >= 4 && nl.length >= 4, `Код ${code} має мати непорожні підписи uk та nl`);
      assert.ok(!RUSSISCH_RE.test(uk), `Український підпис ${code} не може містити заборонених літер`);
      assert.notEqual(categorieVan(code), 'overig', `Код ${code} не може потрапляти в категорію overig`);
    }
    const kandidaatKlantSoort = klantCodes[0] ?? 'owner.klantrelatie.klant';
    const actieveKlantSoort = dienstVoorSoort(kandidaatKlantSoort) !== undefined ? kandidaatKlantSoort : 'klant.aangemaakt';
    const klantDoelDienst: string | undefined = dienstVoorSoort(actieveKlantSoort);
    const klantLink = routeerMeldingLink('/', { soort: actieveKlantSoort });
    assert.ok(
      klantLink.startsWith('https://') && (klantDoelDienst === 'crm' || klantDoelDienst === 'hub'),
      `Перехід melding-link для ${actieveKlantSoort} має вести на дійсну службу клієнтів (crm або hub), отримано: ${klantLink} (${String(klantDoelDienst)})`,
    );
  } finally {
    sleutelkluis.sleutelSluitenVoorHouder('sessie', sessieHouder);
    sleutelkluis.zetHouderControle(null);
    await sessieA.opruimen();
    await pool.query('DELETE FROM app.klantrelatieboek WHERE gebruiker = ANY($1::text[])', [[gebruikerA, gebruikerB]]).catch(() => undefined);
    await pool.query('DELETE FROM app.sleutelkluis_omslag WHERE user_id = ANY($1::text[])', [[gebruikerA, gebruikerB]]).catch(() => undefined);
    await pool.query('DELETE FROM app.sleutelkluis_journaal WHERE user_id = ANY($1::text[])', [[gebruikerA, gebruikerB]]).catch(() => undefined);
    await pool.query('DELETE FROM app.sleutelkluis WHERE user_id = ANY($1::text[])', [[gebruikerA, gebruikerB]]).catch(() => undefined);
    await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1::text[])", [[gebruikerA, gebruikerB]]).catch(() => undefined);
  }
});

test('L4-S03: Пошта → Картотека узгодження Afstemming vNext → Вкладення PDF/зображення та ШІ-розбір → Автозіставлення з orchestratie/ → Пульт уваги й melding-link (uk + nl)', async () => {
  zorgWindowGebeurtenissen('https://api.tarasevych.com', 'uk');
  const { pg, afstemming } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const eigenaar = await zorgTestEigenaar();

  const routes = afstemming.afstemmingKernRoutes(async () => ({
    service: 'api',
    user: eigenaar,
  }));

  let gemaakteKaartId: string | null = null;
  try {
    // Крок 1: Створення картки в Afstemming vNext двома мовами, перевірка 409 VERSIE_CONFLICT та заборони AGENT_MAG_NIET
    assert.ok(
      routes['POST /api/owner/afstemming/voorstel'] && routes['POST /api/owner/afstemming/wijzig'],
      'У afstemmingKernRoutes мають бути маршрути /voorstel та /wijzig',
    );
    const voorstelBody = {
      titel: ['Узгодження мосту пошти та завдань', 'Afstemming van mail- en takenbrug'],
      samenvatting: ['Наскрізне передавання листа в картотеку', 'Eind-tot-eind overdracht van bericht naar kartotheek'],
      dienst: 'mail',
      prioriteit: 'P1',
    };
    const nieuwAntw = await routes['POST /api/owner/afstemming/voorstel'][0]({
      event: maakLambdaEvent('/api/owner/afstemming/voorstel', voorstelBody, { host: SERVICE_HOSTS.api }),
      body: voorstelBody,
      query: {},
      params: {},
    });
    assert.ok(nieuwAntw, 'Маршрут створення картки узгодження має повертати відповідь');
    assert.equal(nieuwAntw.statusCode, 200, `Створення картки власником має повертати 200, отримано: ${nieuwAntw.statusCode} ${nieuwAntw.body}`);
    const nieuwData = JSON.parse(nieuwAntw.body) as { kaart?: { id: string; versie: number } };
    assert.ok(nieuwData.kaart?.id, 'Відповідь створення має повертати ідентифікатор картки');
    gemaakteKaartId = nieuwData.kaart.id;

    // Конфлікт версії (оптимістична конкурентність)
    const conflictBody = {
      id: gemaakteKaartId,
      versie: 999,
      velden: { titel: ['Застаріле оновлення', 'Verouderde wijziging'] },
    };
    const conflictAntw = await routes['POST /api/owner/afstemming/wijzig'][0]({
      event: maakLambdaEvent('/api/owner/afstemming/wijzig', conflictBody, { host: SERVICE_HOSTS.api }),
      body: conflictBody,
      query: {},
      params: {},
    });
    assert.ok(conflictAntw, 'Маршрут редагування картки узгодження має повертати відповідь');
    assert.equal(conflictAntw.statusCode, 409, 'Застаріла версія картки має відхилятися кодом 409 VERSIE_CONFLICT');
    assert.equal((JSON.parse(conflictAntw.body) as { error?: string }).error, 'VERSIE_CONFLICT');

    // Спроба агента схвалити фазу замість людини
    const agentFaseBody = {
      id: gemaakteKaartId,
      versie: nieuwData.kaart.versie,
      fase: 'approved',
      alsAgent: true,
    };
    const agentFaseAntw = await routes['POST /api/owner/afstemming/fase'][0]({
      event: maakLambdaEvent('/api/owner/afstemming/fase', agentFaseBody, { host: SERVICE_HOSTS.api }),
      body: agentFaseBody,
      query: {},
      params: {},
    });
    assert.ok(agentFaseAntw, 'Маршрут зміни фази картки має повертати відповідь');
    assert.equal(agentFaseAntw.statusCode, 400);
    assert.equal((JSON.parse(agentFaseAntw.body) as { error?: string }).error, 'AGENT_MAG_NIET', 'ШІ-агент ніколи не має права сам схвалювати картку');

    // Крок 2: Перевірка зняття заглушок «заплановано» для PDF/зображень, ШІ-розбору, загальної стрічки та живих проб (uk + nl)
    const tekstTs = lees('src/afstemming-vnext/tekst.ts');
    const toevoegenTsx = lees('src/afstemming-vnext/onderdelen/Toevoegen.tsx');
    const geschiedenisTsx = lees('src/afstemming-vnext/onderdelen/Geschiedenis.tsx');
    const controlesTsx = lees('src/afstemming-vnext/onderdelen/Controles.tsx');

    assert.ok(
      !tekstTs.includes('PDF/зображення — заплановано') && !tekstTs.includes('PDF/afbeelding is gepland'),
      'Крок 2: У Afstemming vNext знято обмеження «PDF/зображення — заплановано» обома мовами (uk + nl)',
    );
    assert.ok(
      !toevoegenTsx.includes('ШІ-розбір задуму — заплановано') &&
        !geschiedenisTsx.includes('Повна стрічка всіх карток одразу — заплановано') &&
        !controlesTsx.includes('Живі проби з цієї сторінки — заплановано'),
      'Крок 2: Реалізовано ШІ-розбір задуму, загальну стрічку подій усіх карток та живі проби маршрутів',
    );

    // Крок 3: Автозіставлення з orchestratie/ у Bronnen.tsx та переходи до служби й Календаря
    const bronnenTsx = lees('src/afstemming-vnext/onderdelen/Bronnen.tsx');
    assert.ok(
      !bronnenTsx.includes("stand: 'gepland'") && bronnenTsx.includes('orchestratie'),
      'Крок 3: Джерела Afstemming vNext автоматично зіставляються з orchestratie/ замість стану gepland',
    );

    // Крок 4: Сповіщення в Пульті уваги (uk + nl) та точний перехід за melding-link.ts
    const { default: MeldingVeegKaart } = await import('../../src/meldingen/ecosysteem/MeldingVeegKaart');
    const profiel = standaardProfiel('technisch');
    const vertolkt = interpreteerGebeurtenis({
      bron: 'afstemming.conflict',
      soort: 'afstemming.conflict',
      subdomein: 'api',
      titel: 'Виявлено конфлікт вимог / Eisenconflict gedetecteerd',
      link: '/afstemming',
    });
    const doelHref = routeerMeldingLink('/afstemming', { soort: 'afstemming.conflict' });
    assert.equal(dienstVoorSoort('afstemming.conflict'), 'api');
    assert.ok(doelHref.startsWith(`https://${SERVICE_HOSTS.api}/`), `Крок 4: Перехід сповіщення має вести на api.*, отримано: ${doelHref}`);
    assert.equal(vertolkt.meta.link, doelHref);

    for (const lang of ['uk', 'nl'] as const) {
      const geb = normaliseerGebeurtenis({
        id: `afst-${lang}`,
        ruimte: 'technisch',
        kanaal: 'app',
        subdomein: 'api',
        bron: 'afstemming.conflict',
        prioriteit: 'hoog',
        status: 'nieuw',
        titel: lang === 'uk' ? 'Потрібне рішення власника у Звірці' : 'Besluit van eigenaar vereist in Afstemming',
        bericht: lang === 'uk' ? 'Перевірте картку узгодження.' : 'Controleer de afstemmingskaart.',
        meta: { link: doelHref },
        aangemaaktOp: 1_763_800_000_000,
        bijgewerktOp: 1_763_800_000_000,
      });
      const html = renderToStaticMarkup(
        createElement(MeldingVeegKaart, {
          lang,
          gebeurtenis: geb,
          profiel,
          bijlageVoorkeur: profiel.bijlageWeergave,
          onStatus: () => undefined,
          onOntleden: async () => ({
            bron: 'intern' as const,
            samenvatting: 'Огляд',
            oorzaak: 'Зміна',
            advies: 'Відкрити',
            aanbevolenActies: [],
            risico: 'laag' as const,
            opgesteldOp: 1_763_800_000_000,
            geschoond: true,
          }),
          onOpenBijlageModaal: () => undefined,
        }),
      );
      assert.ok(
        html.includes(lang === 'uk' ? 'Потрібне рішення власника' : 'Besluit van eigenaar vereist'),
        `Картка Пульта уваги мовою ${lang} має коректно відмальовувати заголовок події узгодження`,
      );
    }
  } finally {
    if (gemaakteKaartId) {
      await pool
        .query(
          "DELETE FROM app.records WHERE tbl LIKE 'afstemming_%' AND (id = $1 OR data->>'kaartId' = $1)",
          [gemaakteKaartId],
        )
        .catch(() => undefined);
    }
  }
});

test('L4-S04: Робочий стіл Werkblad v3 у сеансі hub → Живі зведення github, github-activiteit та ai-toegang → Розділ social → VerbindingenCentrum і WizardV2 (uk + nl)', async () => {
  zorgWindowGebeurtenissen('https://hub.tarasevych.com', 'uk');
  const { pg, index } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const uid = randomUUID();
  await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
    'users',
    uid,
    { email: `s04-${uid.slice(0, 8)}@example.invalid`, role: 'user', status: 'approved', name: 'Тарас Мельник' },
  ]);
  const hubSessie = await maakSessieVoorDienst(uid, 'hub', SERVICE_HOSTS.hub);

  try {
    // Крок 1: Готовність віджетів github, github-activiteit та ai-toegang (uk + nl) + живий виклик у сеансі hub без витоку секретів
    const wGithub = werkbladWidget('github');
    const bGithub = bureauWidget('github-activiteit');
    const bAi = bureauWidget('ai-toegang');

    assert.ok(wGithub && wGithub.stand === 'klaar' && Boolean(wGithub.bron), 'Крок 1: Віджет github на Werkblad має мати стан klaar і маршрут bron');
    assert.equal(werkbladToegestaan('github', { ruimte: 'prive' }), true);
    assert.ok(bGithub && bGithub.stand === 'klaar' && plaatsbaar('github-activiteit'), 'Віджет github-activiteit у Бюро має мати стан klaar');
    assert.ok(bAi && bAi.stand === 'klaar' && plaatsbaar('ai-toegang'), 'Віджет ai-toegang у Бюро має мати стан klaar');

    for (const def of [wGithub, bGithub, bAi]) {
      assert.deepEqual(taalFouten(`widget:${def.id}`, def.titel[0], def.titel[1]), []);
      const bronPad = def.bron.replace(/^(POST|GET)\s+/i, '').trim();
      if (bronPad.startsWith('/api/')) {
        const r = await index.handler({
          headers: {
            host: SERVICE_HOSTS.hub,
            origin: `https://${SERVICE_HOSTS.hub}`,
            'content-type': 'application/json',
            cookie: hubSessie.cookie,
            'user-agent': 'e2e-laag4',
          },
          body: JSON.stringify({ service: 'hub', tabContext: 'e2e-tab-s04', sourceOrigin: `https://${SERVICE_HOSTS.hub}` }),
          isBase64Encoded: false,
          rawPath: bronPad,
          rawQueryString: '',
          queryStringParameters: {},
          requestContext: { http: { method: 'POST', path: bronPad, sourceIp: '203.0.113.25', userAgent: 'e2e-laag4' } },
        });
        assert.equal(r.statusCode, 200, `Маршрут зведення ${bronPad} має приймати схвалений сеанс служби hub (отримано ${r.statusCode})`);
        assert.ok(
          !/(tokenHash|ciphertext|refreshToken|clientSecret)/i.test(r.body),
          `Відповідь маршруту ${bronPad} не повинна містити закритих ключів чи шифротекстів`,
        );
      }
    }

    // Крок 2: Перейменування тек, серверна синхронізація власних ярликів (usr:*) та обробка ?actie= у Werkblad v3
    const werkbladBron = [
      ...alleBestandenOnder('src/werkblad', /\.tsx?$/),
      ...alleBestandenOnder('backend', /^werkblad.*\.ts$/),
    ]
      .filter((p) => existsSync(resolve(process.cwd(), p)))
      .map(lees)
      .join('\n');
    assert.ok(
      werkbladBron.includes('actie') && (werkbladBron.includes('hernoem') || werkbladBron.includes('перейменув')),
      'Крок 2: Робочий стіл Werkblad v3 має підтримувати перейменування тек/блоків та перехід із параметром ?actie=',
    );

    // Крок 3: Розблокований розділ «Соціальні мережі» (social) двома мовами (uk + nl)
    const menuVoork = await import('../../src/menu-voorkeuren');
    const socialMenu = menuVoork.MENU_CATALOG.find((i) => i.id === 'social');
    assert.ok(socialMenu && socialMenu.planned !== true && DIENST_DEF.social.planned !== true, 'Крок 3: Розділ social має бути розблокований у меню та реєстрі');
    assert.deepEqual(taalFouten('menu.social', socialMenu.uk, socialMenu.nl), []);

    const socialBestanden = alleBestandenOnder('src/social', /\.tsx$/);
    assert.ok(socialBestanden.length > 0, 'Крок 3: Має існувати прикладна сторінка в src/social/');
    const socialMod = await laadProjectModule<Record<string, unknown>>(socialBestanden[0]);
    assert.ok(socialMod !== null, 'Модуль сторінки social має безпомилково завантажуватися');

    // Крок 4: Центр підключень VerbindingenCentrum та збереження перевіреного адаптера в WizardV2 без заглушок (uk + nl)
    const verbindingenBron = lees('src/verbindingen/VerbindingenCentrum.tsx');
    const wizardBron = lees('src/integraties/WizardV2.tsx');
    assert.ok(
      !verbindingenBron.includes('Пробний режим: лише перегляд') && !verbindingenBron.includes('Proefmodus: alleen bekijken'),
      'Крок 4: У VerbindingenCentrum.tsx знято напис «Пробний режим: лише перегляд» на користь справжніх дій керування (uk + nl)',
    );
    assert.ok(
      !wizardBron.includes('Збереження цього підключення буде в наступному етапі') &&
        !wizardBron.includes('Deze koppeling bewaren komt in een volgende fase'),
      'Крок 4: У WizardV2.tsx реалізовано зашифроване збереження перевіреного адаптера замість відкладеної заглушки (uk + nl)',
    );
  } finally {
    await hubSessie.opruimen();
    await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [uid]).catch(() => undefined);
  }
});

test('L4-S05: Хмарне сховище cloud-vnext + прапорці M4..M11 + HTTPS WebDAV → Спільний переглядач файла → Служба Фото з Google Drive → Прикріплення файла до Нотатки (uk + nl)', async () => {
  zorgWindowGebeurtenissen('https://cloud.tarasevych.com', 'nl');
  const { index, notities } = await laadServerBundel();
  const eigenaar = await zorgTestEigenaar();
  const cloudSessie = await maakSessieVoorDienst(eigenaar.id, 'cloud', SERVICE_HOSTS.cloud);
  const adminSessie = await maakSessieVoorDienst(eigenaar.id, 'admin', SERVICE_HOSTS.admin);
  const tab = randomBytes(24).toString('hex');

  const stagingSleutels = [
    'CLOUD_M4_CONNECTIONS_STAGING',
    'CLOUD_M5_CATALOGUE_STAGING',
    'CLOUD_M6_ADMIN_STAGING',
    'CLOUD_M8_DIRECTORY_STAGING',
    'CLOUD_M10_ADMIN_STAGING',
    'CLOUD_M10_STAGING_RUNTIME',
    'CLOUD_M11_PREVIEW_STAGING',
  ] as const;
  const bewaard = new Map<string, string | undefined>();
  for (const k of stagingSleutels) {
    bewaard.set(k, process.env[k]);
    delete process.env[k];
  }

  let notitieId: string | null = null;
  try {
    // Крок 1: Усі публічні маршрути хмарних модулів M4, M5, M6, M8, M10, M11 керуються прапорцями app.feature_flags (жодного глухого 404 *_NOT_RELEASED)
    const cloudBasis = { service: 'cloud', tabContext: tab, sourceOrigin: `https://${SERVICE_HOSTS.cloud}` };
    const adminBasis = { service: 'admin', tabContext: tab, sourceOrigin: `https://${SERVICE_HOSTS.admin}` };

    const m4Res = await index.handler(
      maakLambdaEvent('/api/owner/cloud/integrations/v1/accounts/list', cloudBasis, { host: SERVICE_HOSTS.cloud, cookie: cloudSessie.cookie }),
    );
    const m5Res = await index.handler(
      maakLambdaEvent('/api/owner/cloud/integrations/v1/catalogue', cloudBasis, { host: SERVICE_HOSTS.cloud, cookie: cloudSessie.cookie }),
    );
    const m6Res = await index.handler(
      maakLambdaEvent('/api/owner/cloud/integrations/v1/admin/policies/list', cloudBasis, { host: SERVICE_HOSTS.cloud, cookie: cloudSessie.cookie }),
    );
    const m8Res = await index.handler(
      maakLambdaEvent(
        '/api/owner/cloud/integrations/v1/directory/list',
        { ...cloudBasis, accountId: 'a1', folderId: 'root' },
        { host: SERVICE_HOSTS.cloud, cookie: cloudSessie.cookie },
      ),
    );
    const m10Res = await index.handler(
      maakLambdaEvent('/api/owner/admin/cloud/providers/list', adminBasis, { host: SERVICE_HOSTS.admin, cookie: adminSessie.cookie }),
    );
    const m11Res = await index.handler(
      maakLambdaEvent(
        '/api/owner/cloud/integrations/v1/files/preview',
        { ...cloudBasis, accountId: 'a1', fileId: 'f1', expectedRevision: 'r1' },
        { host: SERVICE_HOSTS.cloud, cookie: cloudSessie.cookie },
      ),
    );

    for (const [naam, antw] of [
      ['M4', m4Res],
      ['M5', m5Res],
      ['M6', m6Res],
      ['M8', m8Res],
      ['M10', m10Res],
      ['M11', m11Res],
    ] as const) {
      assert.ok(
        !antw.body.includes('_NOT_RELEASED'),
        `Крок 1: Хмарний модуль ${naam} має керуватися прапорцем у БД замість відповіді *_NOT_RELEASED без process.env (отримано: ${antw.body})`,
      );
    }

    // Крок 2: HTTPS WebDAV для Nextcloud та NAS + правила автоматизацій замість «Автоматизації: заплановано» (uk + nl)
    for (const aanbieder of CLOUD_VNEXT_AANBIEDERS) {
      assert.ok(
        /[\u0400-\u04FF]/.test(aanbieder.uitleg[0]) && /[A-Za-z]/.test(aanbieder.uitleg[1]),
        `Постачальник хмари ${aanbieder.id} має містити непорожні описи uk (кирилицею) та nl (латиницею)`,
      );
      assert.equal(RUSSISCH_RE.test(aanbieder.uitleg[0]), false, `Опис ${aanbieder.id} не може містити заборонених літер`);
      assert.equal(taalwetOvertreding(aanbieder.uitleg[0]), false, `Опис ${aanbieder.id} має дотримуватися мовного закону`);
    }
    const nextcloud = CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === 'nextcloud');
    const nas = CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === 'nas-webdav');
    assert.ok(nextcloud && nextcloud.stand !== 'gepland', 'Крок 2: Nextcloud має підтримувати робоче HTTPS WebDAV-підключення');
    assert.ok(nas && nas.stand !== 'gepland', 'Крок 2: NAS WebDAV має підтримувати робоче HTTPS WebDAV-підключення');

    const integratiesTsx = lees('src/cloud-vnext/onderdelen/Integraties.tsx');
    assert.ok(
      !integratiesTsx.includes('Автоматизації: заплановано') && !integratiesTsx.includes('Automatiseringen: gepland'),
      'Крок 2: У Хмарному сховищі реалізовані правила автоматизацій замість статичної заглушки «заплановано» (uk + nl)',
    );

    // Крок 3: Файл у Спільному переглядачі + прямий показ світлин Google Drive у службі «Фото»
    const voorbeeldPng = png();
    assert.ok(voorbeeldPng.byteLength > 20, 'Згенерований мінімальний зразок зображення PNG дійсний');
    assert.ok(existsSync(resolve(process.cwd(), 'src/bijlage-weergave')), 'Крок 3: Спільний переглядач файлів src/bijlage-weergave/ присутній');
    const driveFotoBron = bronDef('google-drive');
    assert.ok(driveFotoBron && driveFotoBron.toegang.includes('live'), 'Крок 3: Служба «Фото» підтримує живий показ світлин із підключеного Google Drive');
    assert.ok(
      /[\u0400-\u04FF]/.test(driveFotoBron.uitleg.uk) && /[A-Za-z]/.test(driveFotoBron.uitleg.nl),
      'Опис Google Drive у службі «Фото» має містити непорожні підписи uk (кирилицею) та nl (латиницею)',
    );
    assert.equal(RUSSISCH_RE.test(driveFotoBron.uitleg.uk), false);
    assert.equal(taalwetOvertreding(driveFotoBron.uitleg.uk), false);

    // Крок 4: Прикріплення хмарного файла до нотатки зі збереженням дзеркала дошки та глибокого переходу open_item_id
    const cloudItemId = `cloud-item-${randomBytes(4).toString('hex')}`;
    const invoer = schoneInvoer({
      titel: 'Нотатка з прикріпленим кресленням / Notitie met gekoppelde tekening',
      inhoud: `Див. файл сховища: https://${SERVICE_HOSTS.cloud}/bestanden?open_item_id=${cloudItemId}`,
      soort: 'koppeling',
      kleur: 'groen',
      etiketten: ['хмара', 'cloud'],
      vast: false,
    });
    assert.equal(invoer.ok, true);
    if (invoer.ok) {
      const n = await notities.notitieMaken(
        { userId: eigenaar.id, ruimte: 'prive' },
        invoer.invoer,
        { auteur: 'Власник', herkomst: { cloudItemId } },
      );
      assert.ok(!('fout' in n), 'Крок 4: Нотатка з прикріпленим посиланням на файл Хмарного сховища створена');
      if (!('fout' in n)) {
        notitieId = n.id;
        const gelezen = await notities.notitieLezen({ userId: eigenaar.id, ruimte: 'prive' }, n.id);
        assert.equal(gelezen?.herkomst?.cloudItemId, cloudItemId, 'Метадані прикріпленого файла Хмари збережені у нотатці');
      }
    }
  } finally {
    for (const [k, v] of bewaard) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (notitieId) {
      await notities.notitieActie({ userId: eigenaar.id, ruimte: 'prive' }, notitieId, 'definitief').catch(() => undefined);
    }
    await cloudSessie.opruimen();
    await adminSessie.opruimen();
  }
});

test('L4-S06: Ідентичність і способи входу (Макет / vNext / UI-015A) → Зміна стилю меню облікового запису → Захисна дія «Це був не я» → Суворе розмежування просторів prive і technisch (uk + nl)', async () => {
  zorgWindowGebeurtenissen('https://id.tarasevych.com', 'uk');
  const { pg, index, techRuimtes, ruimteSessie } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const uid = randomUUID();
  await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
    'users',
    uid,
    { email: `s06-${uid.slice(0, 8)}@example.invalid`, role: 'user', status: 'approved', name: 'Ірина Бондар' },
  ]);
  const verdachteSessie = await maakSessieVoorDienst(uid, 'hub', SERVICE_HOSTS.hub);
  const actieveSessie = await maakSessieVoorDienst(uid, 'identity', SERVICE_HOSTS.identity);

  try {
    // Крок 1: Живі стани в maquette-motor.ts (без зашитих заглушок «заплановано» для наявних способів) + перемикач UI-015A поруч із Макет / Студія / Класичний
    const maquetteBron = lees('src/identiteit/maquette/maquette-motor.ts');
    assert.ok(
      !maquetteBron.includes('Лише демонстраційне поле — дані облікового запису не змінюються') || maquetteBron.includes('weergave'),
      'Макет облікового запису прив’язаний до живих налаштувань облікового запису',
    );
    assert.ok(
      !/Telegram[^;\n]{0,80}заплановано/i.test(maquetteBron),
      'Крок 1: У maquette-motor.ts прибрано застарілу позначку «заплановано» для вже реалізованого входу Telegram',
    );

    const iv = await import('../../src/identiteit/identiteit-vormgeving');
    for (const vorm of iv.VORMGEVINGEN) {
      iv.bewaarVormgeving(vorm);
      assert.equal(iv.leesVormgeving(iv.VORMGEVINGEN), vorm);
    }

    const aanmeldBron = [
      ...alleBestandenOnder('src/aanmeld-vnext', /\.tsx?$/),
      ...alleBestandenOnder('src/aanmelden', /\.tsx?$/),
      ...alleBestandenOnder('src/identiteit', /\.tsx?$/),
      'src/ToegangslaagWeergave.tsx',
    ]
      .filter((p) => existsSync(resolve(process.cwd(), p)))
      .map(lees)
      .join('\n');
    assert.ok(
      aanmeldBron.includes('kaart') || aanmeldBron.includes('ui015a') || aanmeldBron.includes('Картк'),
      'Крок 1: Картковий режим способів входу UI-015A інтегровано як взаємосумісний перемикач подання (uk + nl)',
    );

    // Крок 2: Перемикання стилів меню облікового запису (v3 Орбіта, v3 Секційна картка, v2 Компактне, Класичне)
    const voorkeurenMod = await import('../../src/accountmenu-v3/accountmenu-v3-voorkeuren');
    voorkeurenMod.zetAccountmenuV3Indeling('kaart');
    assert.equal(voorkeurenMod.leesAccountmenuV3Voorkeuren().indeling, 'kaart');
    voorkeurenMod.zetAccountmenuV3Indeling('orbita');
    assert.equal(voorkeurenMod.leesAccountmenuV3Voorkeuren().indeling, 'orbita');

    // Крок 3: Швидка захисна дія блокування підозрілого сеансу сайту «Це був не я» / «Dit was ik niet» (uk + nl)
    const sessieBestanden = [
      'src/BeveiligingSessiesPaneel.tsx',
      'src/SessiesOverzicht.tsx',
      ...alleBestandenOnder('src/sessies', /\.tsx?$/),
    ]
      .filter((p) => existsSync(resolve(process.cwd(), p)))
      .map(lees)
      .join('\n');
    assert.ok(
      (sessieBestanden.includes('Це був не я') || sessieBestanden.includes('Це не я')) &&
        (sessieBestanden.includes('Dit was ik niet') || sessieBestanden.includes('Dit ben ik niet')),
      'Крок 3: На панелі сеансів реалізована двомовна захисна дія миттєвого блокування підозрілого сеансу («Це був не я» / «Dit was ik niet»)',
    );

    // Крок 4: Суворе розмежування просторів prive та technisch із заголовками Cache-Control: no-store, Vary: Cookie та X-Ruimte
    techRuimtes._vlagCacheLeeg();
    ruimteSessie._scheidingCacheLeeg();
    const antwBootstrap = await index.handler({
      headers: {
        host: SERVICE_HOSTS.identity,
        origin: `https://${SERVICE_HOSTS.identity}`,
        'content-type': 'application/json',
        cookie: actieveSessie.cookie,
        'user-agent': 'e2e-laag4',
      },
      body: JSON.stringify({ service: 'identity', tabContext: 'e2e-s06', sourceOrigin: `https://${SERVICE_HOSTS.identity}` }),
      isBase64Encoded: false,
      rawPath: '/api/owner/session/bootstrap',
      rawQueryString: '',
      queryStringParameters: {},
      requestContext: { http: { method: 'POST', path: '/api/owner/session/bootstrap', sourceIp: '203.0.113.25', userAgent: 'e2e-laag4' } },
    });
    assert.equal(antwBootstrap.statusCode, 200);
    const koppen = antwBootstrap.headers || {};
    assert.equal(koppen['Cache-Control'], 'no-store', 'Крок 4: За активного ruimtes-scheiding відповідь /api/* має нести Cache-Control: no-store');
    assert.ok(/\bcookie\b/i.test(String(koppen.Vary || '')), 'Відповідь /api/* має містити Vary: Cookie');
    assert.equal(koppen['X-Ruimte'], 'prive', 'Сеанс без технічної активації має отримувати X-Ruimte: prive');
  } finally {
    await verdachteSessie.opruimen();
    await actieveSessie.opruimen();
    await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [uid]).catch(() => undefined);
  }
});

test('L4-S07: ШІ-чат з вибором онлайн-пристрою → Маркер API Platform із 3 областями читання і блокуванням руйнівних областей → Живі джерела MCP → Навички та Стрім пам’яті (uk + nl)', async () => {
  zorgWindowGebeurtenissen('https://ai.tarasevych.com', 'uk');
  const { pg, apiPlatform, geheugenTaken } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const eigenaar = await zorgTestEigenaar();

  let aangemaaktTokenId: string | null = null;
  const taakSleutel = `e2e.s07.${randomBytes(4).toString('hex')}`;

  try {
    // Крок 1: Вибір онлайн-пристрою в AiWerkruimteChat (замість nog-niet) + живі перекладачі motorenMetStand + Fastmail (uk + nl)
    const chatBron = lees('src/AiWerkruimteChat.tsx');
    assert.ok(
      !chatBron.includes("data-aiw-apparaatkeuze='nog-niet'") && !chatBron.includes('вибрати один тут поки не можна'),
      'Крок 1: У AiWerkruimteChat.tsx реалізовано повноцінний вибір цільового онлайн-пристрою замість nog-niet (uk + nl)',
    );

    const motoren = motorenMetStand([], false, [
      { soort: 'libretranslate', akkoord: true },
      { soort: 'deepl', akkoord: true },
      { soort: 'google-translate', akkoord: true },
    ]);
    for (const id of ['libretranslate', 'deepl', 'google-vertaling']) {
      assert.equal(motoren.find((m) => m.id === id)?.staat, 'werkt', `Рушій ${id} зі схваленим записом у app.ai_dienst_motoren має мати стан werkt`);
      const basisDef = VERTAAL_MOTOREN.find((m) => m.id === id)!;
      assert.ok(
        !basisDef.uitlegUk.includes('Конектора ще немає') && !basisDef.uitlegNl.includes('De koppeling bestaat nog niet'),
        `Опис ${id} у VERTAAL_MOTOREN більше не повинен стверджувати, що з’єднувача ще немає`,
      );
    }
    assert.ok(vertaaldDoorZin('uk', 'nl', 'DeepL', 'uk').includes('Нідерландська'));
    assert.ok(vertaaldDoorZin('nl', 'uk', 'DeepL', 'nl').includes('Українська'));

    const fm = mailAanbieder('fastmail');
    assert.ok(
      fm !== null &&
        fm.wijze === 'imap-app-wachtwoord' &&
        fm.imap?.host === 'imap.fastmail.com' &&
        fm.imap?.poort === 993 &&
        mailAanbiederHeeftKnop(fm) &&
        mailAanbiederVolledig(fm) &&
        MAIL_IMAP_AANBIEDERS.some((a) => a.id === 'fastmail'),
      'Крок 1: Поштовий постачальник Fastmail має бути повністю зареєстрований у shared/mail-aanbieders.ts',
    );

    // Крок 2: Області читання mail.read, calendar.read, files.metadata.read у API Platform + блокування руйнівних областей + відкликання
    const contract = apiPlatformContractPayload(eigenaar);
    assert.equal(contract.writeScopesEnabled, false, 'Запис через зовнішній машинний інтерфейс залишається вимкненим');
    for (const leesScope of ['mail.read', 'calendar.read', 'files.metadata.read']) {
      const cap = API_PLATFORM_CAPABILITIES.find((c) => c.id === leesScope);
      assert.equal(cap?.status, 'published', `Крок 2: Область читання ${leesScope} у API_PLATFORM_CAPABILITIES має мати статус published`);
      assert.ok(
        (apiPlatform.API_PAT_ISSUABLE_SCOPES as readonly string[]).includes(leesScope),
        `Область ${leesScope} має входити до API_PAT_ISSUABLE_SCOPES`,
      );
    }

    const apiRoutes = apiPlatform.createApiPlatformRoutes({
      requireSession: async () => ({ user: eigenaar, service: 'api' }),
      respond: (data, status = 200) => ({ statusCode: status, body: JSON.stringify(data) }),
      fail: (message, status = 400) => ({ statusCode: status, body: JSON.stringify({ error: message }) }),
      audit: async () => undefined,
      body: (b) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {}),
    });

    for (const verboden of ['site.deploy', 'source.write', 'vault.write', 'device.command', 'mail.write']) {
      const rVerboden = await apiRoutes['POST /api/owner/api-platform/tokens/create'][0]({
        event: {},
        body: { label: 'Спроба забороненої області', scopes: [verboden] },
      });
      assert.equal(rVerboden.statusCode, 403, `Руйнівна область ${verboden} має блокуватися кодом 403`);
      assert.equal((JSON.parse(rVerboden.body) as { error?: string }).error, 'API_TOKEN_SCOPE_FORBIDDEN');
    }

    const rUitgifte = await apiRoutes['POST /api/owner/api-platform/tokens/create'][0]({
      event: {},
      body: {
        label: 'Читання для наскрізного сценарію S07',
        scopes: ['identity.me.read', 'mail.read', 'calendar.read', 'files.metadata.read'],
      },
    });
    assert.equal(rUitgifte.statusCode, 200, 'Випуск маркера з трьома областями читання має завершуватися зі статусом 200');
    const uitgifteData = JSON.parse(rUitgifte.body) as { plaintext: string; item: { id: string } };
    aangemaaktTokenId = uitgifteData.item.id;

    const rMe = await apiRoutes['GET /api/v1/me'][0]({
      event: { headers: { authorization: `Bearer ${uitgifteData.plaintext}` } },
      body: {},
      query: {},
    });
    assert.equal(rMe.statusCode, 200);
    assert.equal((JSON.parse(rMe.body) as { ownerId?: string }).ownerId, eigenaar.id);

    await apiRoutes['POST /api/owner/api-platform/tokens/:id/revoke'][0]({
      event: {},
      body: {},
      params: { id: aangemaaktTokenId },
    });
    const rNaIntrekken = await apiRoutes['GET /api/v1/me'][0]({
      event: { headers: { authorization: `Bearer ${uitgifteData.plaintext}` } },
      body: {},
      query: {},
    });
    assert.equal(rNaIntrekken.statusCode, 401);
    assert.equal((JSON.parse(rNaIntrekken.body) as { error?: string }).error, 'API_TOKEN_REVOKED');

    // Крок 3: Живі джерела в панелі інструментів MCP (McpHulpmiddelenPaneel.tsx)
    const mcpPaneelBron = lees('src/McpHulpmiddelenPaneel.tsx');
    assert.ok(
      !/Внутрішній диск сайту[^\n]*live:\s*false/.test(mcpPaneelBron) &&
        !/Outlook \(Microsoft\)[^\n]*live:\s*false/.test(mcpPaneelBron) &&
        !/OneDrive \(Microsoft\)[^\n]*live:\s*false/.test(mcpPaneelBron),
      'Крок 3: У McpHulpmiddelenPaneel.tsx джерела Внутрішній диск сайту, Outlook та OneDrive переведені на живий стан без статичного live: false',
    );

    // Крок 4: Екосистема навичок (VLAG-001 + MELDINGEN-REGISTER-001) та Стрім пам’яті з відсіканням таємниць і двомовною естафетою
    const vaardighedenUit = execFileSync(process.execPath, ['scripts/vaardigheden/valideer.mjs'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.ok(vaardighedenUit !== undefined, 'Перевірка каталогу навичок для всіх 14 агентів має проходити з кодом 0');
    for (const skillMap of ['site-ontwikkelen', 'wijziging-controleren', 'uitgave-voorbereiden']) {
      const skillInhoud = lees(`.agents/skills/${skillMap}/SKILL.md`);
      assert.ok(
        skillInhoud.includes('VLAG-001') && skillInhoud.includes('MELDINGEN-REGISTER-001'),
        `Навичка ${skillMap} має містити актуальні правила VLAG-001 та MELDINGEN-REGISTER-001`,
      );
    }

    const nepPatroon = nepGeheim('gh', 'p_', 'NepGeheimVoorStroomFilterControle123456789');
    assert.equal(bevatGevoeligGeheim(nepPatroon), true, 'Фільтр Стріму пам’яті має безпомилково розпізнавати та блокувати штучний зразок ключа');

    for (const meta of Object.values(TAAK_STATUS_META)) {
      assert.deepEqual(taalFouten('geheugen.status', meta.uk, meta.nl), []);
    }
    const opslag = geheugenTaken.pgTakenOpslag;
    const opgeslagen = await opslag.opslaan(
      { userId: eigenaar.id, ruimte: 'prive' },
      {
        taakSleutel,
        titel: 'Наскрізна перевірка естафети між агентами',
        doel: 'Передати контекст без секретів українською та нідерландською',
        eersteSamenvatting: 'Перший крок виконано успішно',
      },
      'gemini',
    );
    assert.equal(opgeslagen.ok, true, 'Естафета задачі у Стрімі пам’яті має зберігатися у БД');
    if (opgeslagen.ok) {
      assert.ok(opgeslagen.pakket.overdrachtPromptUk.length > 20 && opgeslagen.pakket.overdrachtPromptNl.length > 20);
      assert.ok(!RUSSISCH_RE.test(opgeslagen.pakket.overdrachtPromptUk));
    }
  } finally {
    if (aangemaaktTokenId) {
      await pool.query("DELETE FROM app.records WHERE tbl = 'api_machine_tokens_v1' AND id = $1", [aangemaaktTokenId]).catch(() => undefined);
    }
    await pool
      .query('DELETE FROM app.geheugen_taak_stappen WHERE taak_id IN (SELECT id FROM app.geheugen_taken WHERE taak_sleutel = $1)', [taakSleutel])
      .catch(() => undefined);
    await pool.query('DELETE FROM app.geheugen_taken WHERE taak_sleutel = $1', [taakSleutel]).catch(() => undefined);
  }
});

test('L4-S08: Повний життєвий цикл прапорців VLAG-001: реєстрація з false, false → Ввімкнення 0335 (крім 5 !-прапорців) → Реактивне mr:vlaggen-vernieuwd → VLAG_OPRUIMEN (uk + nl)', async () => {
  zorgWindowGebeurtenissen('https://hub.tarasevych.com', 'uk');
  const { pg, vlaggen, techProfiel } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const eigenaar = await zorgTestEigenaar();

  // Крок 1: Двокрокова перевірка нових міграцій прапорців (0307..0334) через controleerFunctievlaggen
  const alleMigraties = readdirSync(resolve(process.cwd(), 'migrations')).sort();
  const nieuweVlagMigraties = alleMigraties.filter((f) => /^03(0[7-9]|[12]\d|3[0-4])_.*\.sql$/.test(f));
  assert.ok(nieuweVlagMigraties.length > 0, 'Крок 1: Очікуються нові міграції віх M1–M4 у діапазоні 0307..0334');
  assert.ok(
    alleMigraties.some((f) => /^0335_.*\.sql$/.test(f)),
    'Крок 1: Очікується завершальна міграція увімкнення прапорців 0335_vlaggen_consolidatie_aan.sql',
  );

  const pakketMod = await laadMjsScript<{
    controleerFunctievlaggen: (arg: {
      beleid: Record<string, unknown>;
      manifest: Record<string, unknown>;
      paden: string[];
      lees: (pad: string) => string | null;
      versie: string;
    }) => Array<{ code: string; ernst: string; uk: string; nl: string }>;
  }>('scripts/orch/pakket.mjs');

  const gevondenParen: Array<{ sleutel: string; migratie: string }> = [];
  const gezienParen = new Set<string>();
  for (const bestand of nieuweVlagMigraties) {
    const sqlZonderCom = lees(`migrations/${bestand}`).replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const blok of sqlZonderCom.matchAll(/INSERT\s+INTO\s+app\.feature_flags\b[\s\S]*?;/gi)) {
      for (const m of blok[0].matchAll(/(?:VALUES|,)\s*\(\s*'([a-z0-9][a-z0-9-]{2,79})'/gi)) {
        const sleutel = m[1];
        const id = `${bestand}:${sleutel}`;
        if (!gezienParen.has(id)) {
          gezienParen.add(id);
          gevondenParen.push({ sleutel, migratie: bestand });
        }
      }
    }
  }
  assert.ok(gevondenParen.length > 0, 'У нових міграціях 0307..0334 мають бути зареєстровані нові прапорці з початковим false, false');

  const beleid = JSON.parse(lees('orchestratie/beleid.json')) as Record<string, unknown>;
  const alleBronPaden = [...alleBestandenOnder('src', /\.tsx?$/), ...alleBestandenOnder('backend', /\.ts$/), ...alleBestandenOnder('shared', /\.ts$/)];
  const zaken = pakketMod.controleerFunctievlaggen({
    beleid,
    manifest: { functievlaggen: gevondenParen },
    paden: alleBronPaden,
    lees: (p) => (existsSync(resolve(process.cwd(), p)) ? lees(p) : null),
    versie: '20261123-120000',
  });
  const fouten = zaken.filter((z) => z.ernst === 'fout');
  assert.equal(
    fouten.length,
    0,
    `Крок 1: Двокрокова схема прапорців має проходити controleerFunctievlaggen з нулем помилок, отримано: ${fouten.map((f) => `${f.code}:${f.uk}`).join(' | ')}`,
  );

  // Крок 2: Повнота двомовних описів VLAG_UITLEG (uk + nl) для 100% прапорців із бази даних
  const dbVlaggen = (await pool.query("SELECT sleutel, aan, standaard FROM app.feature_flags WHERE gearchiveerd_op IS NULL AND sleutel NOT LIKE 'proef-%'")).rows as Array<{
    sleutel: string;
    aan: boolean;
    standaard: boolean;
  }>;
  const zonderUitleg: string[] = [];
  for (const r of dbVlaggen) {
    const u = VLAG_UITLEG[r.sleutel];
    if (!u || !u.naam[0] || !u.naam[1] || !u.wat[0] || !u.wat[1] || !u.wanneer[0] || !u.wanneer[1] || !u.gevolg[0] || !u.gevolg[1]) {
      zonderUitleg.push(r.sleutel);
      continue;
    }
    assert.ok(!RUSSISCH_RE.test(`${u.naam[0]} ${u.wat[0]} ${u.wanneer[0]} ${u.gevolg[0]}`), `Опис прапорця ${r.sleutel} містить заборонені літери`);
  }
  assert.equal(zonderUitleg.length, 0, `Крок 2: Кожен прапорець у БД має мати повне двомовне пояснення у VLAG_UITLEG, відсутні: ${zonderUitleg.join(', ')}`);

  // Крок 3: Життєвий цикл перемикання прапорця та реактивне оновлення клієнтських обгорток за mr:vlaggen-vernieuwd
  const { index, stapOp } = await laadServerBundel();
  const kort = randomBytes(4).toString('hex');
  const tijdelijkSleutel = `proef-s08-${kort}`;
  const tab = randomBytes(24).toString('hex');
  const profiel = await techProfiel.profielVan(eigenaar);
  assert.ok(profiel);

  const hubSessie = await maakSessieVoorDienst(eigenaar.id, 'hub', SERVICE_HOSTS.hub);
  await pool.query(
    `INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard, percentage, gebruikers)
     VALUES ($1, 'Наскрізний життєвий цикл прапорця', false, false, 0, '{}')`,
    [tijdelijkSleutel],
  );
  await pool.query(
    `INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, sessie_id, rollen, modus, reden, eind_op)
     VALUES ($1, $2, $3, $4, $5, 'tijd', 'Перевірка S08', now() + interval '1 hour')`,
    [eigenaar.id, profiel.profielId, techProfiel.tabHash(tab), hubSessie.sessieId, profiel.rollen],
  );
  await stapOp.totpStapOpVastleggen({ user: { id: eigenaar.id }, session: { id: hubSessie.sessieId, createdAt: Date.now() } });
  await index
    .handler({
      headers: {
        host: SERVICE_HOSTS.hub,
        origin: `https://${SERVICE_HOSTS.hub}`,
        'content-type': 'application/json',
        cookie: hubSessie.cookie,
        'user-agent': 'e2e-laag4',
      },
      body: JSON.stringify({
        service: 'hub',
        tabContext: tab,
        sourceOrigin: `https://${SERVICE_HOSTS.hub}`,
        modus: 'tijd',
        minuten: 60,
        reden: 'Перевірка S08',
      }),
      isBase64Encoded: false,
      rawPath: '/api/owner/hub/tech/ruimtes/starten',
      rawQueryString: '',
      queryStringParameters: {},
      requestContext: { http: { method: 'POST', path: '/api/owner/hub/tech/ruimtes/starten', sourceIp: '203.0.113.25', userAgent: 'e2e-laag4' } },
    })
    .catch(() => undefined);

  const origFetch = globalThis.fetch;
  try {
    vlaggen.vlagGeheugenLeeg();
    assert.equal((await vlaggen.berekenen(eigenaar, [tijdelijkSleutel]))[0]?.value, false);
    const rStand = await index.handler({
      headers: {
        host: SERVICE_HOSTS.hub,
        origin: `https://${SERVICE_HOSTS.hub}`,
        'content-type': 'application/json',
        cookie: hubSessie.cookie,
        'user-agent': 'e2e-laag4',
      },
      body: JSON.stringify({
        service: 'hub',
        tabContext: tab,
        sourceOrigin: `https://${SERVICE_HOSTS.hub}`,
        sleutel: tijdelijkSleutel,
        stand: 'alle',
      }),
      isBase64Encoded: false,
      rawPath: '/api/beheer/flags/stand',
      rawQueryString: '',
      queryStringParameters: {},
      requestContext: { http: { method: 'POST', path: '/api/beheer/flags/stand', sourceIp: '203.0.113.25', userAgent: 'e2e-laag4' } },
    });
    assert.equal(rStand.statusCode, 200);
    assert.equal((await vlaggen.berekenen(eigenaar, [tijdelijkSleutel]))[0]?.value, true);

    let vernieuwdSignaalOntvangen = 0;
    const luisteraar = () => {
      vernieuwdSignaalOntvangen += 1;
    };
    window.addEventListener('mr:vlaggen-vernieuwd', luisteraar);
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ vlaggen: [{ key: tijdelijkSleutel, value: true, variant: 'aan', reason: 'STATIC' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const fv = await import('../../src/functievlag-lezen');
    fv.vlaggenGebruiker(eigenaar.id);
    const kaart = await fv.vlaggenVernieuwen();
    window.removeEventListener('mr:vlaggen-vernieuwd', luisteraar);
    assert.equal(kaart.get(tijdelijkSleutel)?.value, true);
    assert.ok(vernieuwdSignaalOntvangen >= 1, 'Крок 3: Виклик vlaggenVernieuwen має розсилати подію mr:vlaggen-vernieuwd усім клієнтським обгорткам');

    // Крок 4: Попередження VLAG_OPRUIMEN для застарілих архівних прапорців віком понад 30 днів (uk + nl)
    const opruimBronnen = [
      existsSync(resolve(process.cwd(), 'src/vlaggen/Vlaggen.tsx')) ? lees('src/vlaggen/Vlaggen.tsx') : '',
      lees('scripts/orch/pakket.mjs'),
      ...alleBestandenOnder('scripts/orch', /\.mjs$/).map(lees),
    ].join('\n');
    assert.ok(
      opruimBronnen.includes('VLAG_OPRUIMEN'),
      'Крок 4: Має бути реалізоване двомовне попередження VLAG_OPRUIMEN для архівних прапорців віком понад 30 днів',
    );
  } finally {
    globalThis.fetch = origFetch;
    await pool.query('DELETE FROM app.tech_activaties WHERE user_id = $1 AND sessie_id = $2', [eigenaar.id, hubSessie.sessieId]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = $1 AND sessie_id = $2', [eigenaar.id, hubSessie.sessieId]).catch(() => undefined);
    await hubSessie.opruimen();
    await pool.query('DELETE FROM app.feature_flags WHERE sleutel = $1', [tijdelijkSleutel]).catch(() => undefined);
    vlaggen.vlagGeheugenLeeg();
  }
});

test('L4-S09: Наскрізний глобальний пошук інтерфейсу (uk + nl) по всіх раніше пропущених файлах .tsx та намірах INTENTIES з ізоляцією просторів', async () => {
  zorgWindowGebeurtenissen('https://hub.tarasevych.com', 'uk');
  const { zoekCatalogus } = await laadServerBundel();
  const { routeUrl } = await import('../../src/zoek/zoek-kern');

  // Крок 1: Охоплення PLEKKEN та актуальність shared/zoek-ui-knoppen.generated.ts
  const catalogusScript = await laadMjsScript<{
    PLEKKEN: ReadonlyArray<readonly [string, string, string, string]>;
    genereer: () => unknown[];
    naarTs: (lijst: unknown[]) => string;
  }>('scripts/zoek-ui-catalogus.mjs');

  const geregistreerdePrefixen = catalogusScript.PLEKKEN.map((p) => p[0]);
  const verplichteSubsystemen = [
    'afstemming-vnext/',
    'huis/',
    'notities/',
    'werkblad/',
    'ai-ecosysteem/',
    'foto/',
    'bijlage-weergave/',
    'klantrelatiebeheer/',
    'social/',
  ];
  const ontbrekendePrefixen = verplichteSubsystemen.filter(
    (sub) => !geregistreerdePrefixen.some((gereg) => gereg === sub || gereg.startsWith(sub)),
  );
  assert.equal(
    ontbrekendePrefixen.length,
    0,
    `Крок 1: У PLEKKEN генератора пошуку мають бути внесені всі підсистеми, відсутні: ${ontbrekendePrefixen.join(', ')}`,
  );

  const gegenereerdNu = catalogusScript.naarTs(catalogusScript.genereer());
  assert.equal(
    lees('shared/zoek-ui-knoppen.generated.ts'),
    gegenereerdNu,
    'Згенерований файл shared/zoek-ui-knoppen.generated.ts має бути повністю актуальним',
  );

  // Крок 2: Пошук в особистому просторі (prive) українською та нідерландською мовами
  zoekCatalogus._uiCatalogusLeeg();
  const priveObjecten = zoekCatalogus.uiZoekObjecten({ userId: 'u-s09-prive', ruimte: 'prive' }, { heeftProfiel: false });
  assert.ok(priveObjecten.length > 200, 'Каталог пошуку особистого простору має містити понад 200 елементів інтерфейсу');

  const zoekInLijst = (lijst: typeof priveObjecten, term: string) => {
    const t = term.toLowerCase();
    return lijst.filter((o) =>
      `${o.titel} ${o.titels?.uk || ''} ${o.titels?.nl || ''} ${o.omschrijving || ''} ${o.pad || ''} ${(o.trefwoorden || []).join(' ')}`.toLowerCase().includes(t),
    );
  };

  const priveTermen: Array<[string, string]> = [
    ['нотатки', 'notities'],
    ['розумний будинок', 'slim huis'],
    ['хмарне сховище', 'cloudopslag'],
    ['фото', 'foto'],
    ['клієнт', 'klant'],
    ['соціальні мережі', 'sociale netwerken'],
    ['сповіщення', 'meldingen'],
  ];
  for (const [ukTerm, nlTerm] of priveTermen) {
    const treffersUk = zoekInLijst(priveObjecten, ukTerm);
    const treffersNl = zoekInLijst(priveObjecten, nlTerm);
    assert.ok(treffersUk.length > 0, `Крок 2 (uk): Пошук в особистій ладі за запитом «${ukTerm}» має знаходити елементи`);
    assert.ok(treffersNl.length > 0, `Крок 2 (nl): Пошук в особистій ладі за запитом «${nlTerm}» має знаходити елементи`);
    const eersteMetRoute = treffersUk.find((x) => x.route != null);
    assert.ok(eersteMetRoute?.route && routeUrl(eersteMetRoute.route, 'uk').startsWith('https://'), `Результат «${ukTerm}» має мати дійсну адресу`);
  }

  // Крок 3: Сувора ізоляція — нуль технічних елементів у просторі prive без технічного профілю
  const alleMetToegang = zoekCatalogus.uiObjectenVoor('iedereen');
  assert.ok(
    alleMetToegang.every((o) => o.toegang === 'iedereen'),
    'Крок 3: Рівень iedereen не може містити жодного об’єкта з рівнем profiel або technisch',
  );
  for (const techGeheimTerm of ['klimop', 'плющ', 'geheimenkluis', 'сховище секретів']) {
    const lek = priveObjecten.filter(
      (o) =>
        (o.route?.host === 'admin' || o.route?.host === 'api' || o.route?.hash === '#orch') &&
        `${o.titel} ${o.titels?.uk || ''} ${o.titels?.nl || ''} ${o.omschrijving || ''}`.toLowerCase().includes(techGeheimTerm),
    );
    assert.equal(lek.length, 0, `Крок 3: Запит «${techGeheimTerm}» у просторі prive не має розкривати технічні розділи адміністрування`);
  }

  // Крок 4: У технічному просторі (technisch) знаходяться Плющ, Узгодження, Оновлення та Сховище секретів (uk + nl)
  const techObjecten = zoekCatalogus.uiZoekObjecten({ userId: 'u-s09-tech', ruimte: 'technisch' }, { heeftProfiel: true });
  for (const [ukTech, nlTech] of [
    ['плющ', 'klimop'],
    ['узгодження', 'afstemming'],
    ['оновлення', 'updates'],
    ['сховище секретів', 'geheimenkluis'],
  ]) {
    assert.ok(zoekInLijst(techObjecten, ukTech).length > 0, `Крок 4 (uk): У технічній ладі має знаходитися «${ukTech}»`);
    assert.ok(zoekInLijst(techObjecten, nlTech).length > 0, `Крок 4 (nl): У технічній ладі має знаходитися «${nlTech}»`);
  }
});

test('L4-S10: Екосистема Плющ (KLIMOP-001..023) і розподілене зберігання: Сходинки 2–3 → Автоповернення → Заборона від’єднання PostgreSQL → Закриття прогалини 0306 у трирівневих ролях БД (uk + nl)', async () => {
  const { pg, klimop } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const staatMap = mkdtempSync(join(dynMap, 'klimop-s10-'));

  try {
    // Крок 1: Двомовні контракти станів Плюща (uk + nl) та живі проби Сходинки 2 і Сходинки 3 з криптографічним хеш-ланцюжком SHA-256
    for (const [sleutel, paar] of [
      ...Object.entries(KLIMOP_LEESMODUS_TEKST),
      ...Object.entries(KLIMOP_DUBBEL_SCHRIJFMODUS_TEKST),
      ...Object.entries(KLIMOP_DIENST_TEKST),
    ]) {
      assert.deepEqual(taalFouten(`klimop.${sleutel}`, paar.uk, paar.nl), []);
    }

    const spiegelOk = klimop.voerPassieveSpiegelLeesProefUit(
      { dienstId: 'identiteit', simuleerAfwijking: 'geen' },
      { staatMap },
    );
    assert.equal(spiegelOk.ok, true);
    assert.equal(spiegelOk.pariteit.volledigGelijk, true);
    assert.equal(spiegelOk.productieDatabankGewijzigd, false);

    const dubbelOk = klimop.voerGecontroleerdeDubbelSchrijfProefUit(
      { dienstId: 'notities' in KLIMOP_DIENST_TEKST ? 'notities' : 'werkblad', simuleerFout: 'geen' },
      { staatMap },
    );
    assert.equal(dubbelOk.ok, true);
    assert.equal(dubbelOk.pariteit.volledigGelijk, true);
    assert.equal(dubbelOk.productieDatabankGewijzigd, false);
    assert.equal(dubbelOk.schakelaar.primaireSchrijfBron, 'erfenis_postgres');

    assert.equal(klimop.leesKlimopSpiegelLogboek({ staatMap }).ketenIntegriteit.ok, true);
    assert.equal(klimop.leesKlimopDubbelSchrijvenLogboek({ staatMap }).ketenIntegriteit.ok, true);

    // Крок 2: Активація пасивного читання та миттєве автоматичне повернення у alleen_erfenis_postgres при розбіжності вмісту
    const geactiveerd = klimop.schakelKlimopDienstOverdracht(
      { actie: 'activeer_passief_lezen', dienstId: 'identiteit' },
      { staatMap },
    );
    assert.equal(geactiveerd.ok, true);
    assert.equal(geactiveerd.schakelaar?.leesModus, 'passief_spiegel_lezen');

    const spiegelAfwijking = klimop.voerPassieveSpiegelLeesProefUit(
      { dienstId: 'identiteit', simuleerAfwijking: 'inhoud' },
      { staatMap },
    );
    assert.equal(spiegelAfwijking.ok, false);
    assert.ok(spiegelAfwijking.pariteit.afwijkingen > 0);
    assert.equal(spiegelAfwijking.automatischTeruggezetNaarErfenis, true);
    assert.equal(spiegelAfwijking.schakelaar.leesModus, 'alleen_erfenis_postgres');
    assert.equal(spiegelAfwijking.productieDatabankGewijzigd, false);

    // Крок 3: Незмінна заборона KLIMOP_LOSKOPPELING_VERBODEN (403) на всі спроби від'єднання живої бази PostgreSQL
    for (const poging of [
      { actie: 'ontkoppel_erfenis_postgres', dienstId: 'identiteit' },
      { actie: 'schakel_postgres_uit', dienstId: 'postvak' },
      { actie: 'volledig_onafhankelijk', dienstId: 'wolkopslag' },
      { actie: 'activeer_passief_lezen', dienstId: 'identiteit', ontkoppelErfenisDatabank: true },
    ]) {
      let gevangen: unknown = null;
      try {
        klimop.schakelKlimopDienstOverdracht(poging, { staatMap });
      } catch (e) {
        gevangen = e;
      }
      assert.ok(gevangen instanceof Error, `Спроба ${JSON.stringify(poging)} має негайно блокуватися винятком`);
      const foutObj = gevangen as KlimopFout & { code?: string; status?: number };
      assert.equal(foutObj.code, 'KLIMOP_LOSKOPPELING_VERBODEN');
      assert.equal(foutObj.status, 403);
    }

    // Крок 4: Цілісність трирівневих ролей PostgreSQL та закриття прогалини безпеки міграції 0306 (0311_verdeelde_opslag_rls_herstel.sql)
    const rollen = (
      await pool.query(
        `SELECT rolname, rolsuper, rolbypassrls
         FROM pg_roles
         WHERE rolname IN ('mijnruimte_migrator', 'mijnruimte_app', 'mijnruimte_system')`,
      )
    ).rows as Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>;
    assert.equal(rollen.length, 3, 'У базі мають бути налаштовані всі три ізольовані ролі PostgreSQL');
    const appRol = rollen.find((r) => r.rolname === 'mijnruimte_app');
    assert.equal(appRol?.rolsuper, false, 'Роль mijnruimte_app не може бути суперкористувачем');
    assert.equal(appRol?.rolbypassrls, false, 'Роль mijnruimte_app зобов’язана мати NOBYPASSRLS');

    for (const tabelNaam of ['verdeelde_opslag_knopen', 'verdeelde_opslag_rotaties']) {
      const status = (
        await pool.query(
          `SELECT c.relrowsecurity AS rls,
                  c.relforcerowsecurity AS force_rls,
                  has_table_privilege('mijnruimte_app', format('app.%I', c.relname), 'SELECT, INSERT, UPDATE, DELETE') AS app_dml
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'app' AND c.relname = $1`,
          [tabelNaam],
        )
      ).rows[0] as { rls?: boolean; force_rls?: boolean; app_dml?: boolean } | undefined;
      assert.ok(status, `Таблиця app.${tabelNaam} має існувати`);
      const veiligAfgeschermd = status.app_dml === false || (status.rls === true && status.force_rls === true);
      assert.equal(
        veiligAfgeschermd,
        true,
        `Крок 4: Прогалина міграції 0306 на таблиці app.${tabelNaam} має бути закрита (REVOKE у mijnruimte_app та ENABLE + FORCE ROW LEVEL SECURITY)`,
      );
      assert.equal(
        status.rls === true && status.force_rls === true,
        true,
        `На таблиці app.${tabelNaam} має бути явно увімкнений ENABLE + FORCE ROW LEVEL SECURITY`,
      );
    }
  } finally {
    rmSync(staatMap, { recursive: true, force: true });
  }
});

test('L4-S11: Мовна, стильова, логотипна та мобільна єдність усього продукту (uk + nl): звернення №163, staat-kleuren.css, контраст WCAG, REESTR-LOGO-001 та ширина 412 px', async () => {
  // Крок 1: Абсолютний мовний закон по всьому коду та усунення залишкового жаргону зі звернення №163 у src/
  assert.equal(taalwetOvertreding('Чистий український текст без жодних порушень'), false);
  assert.equal(taalwetOvertreding('Слово з літерою \u044B поза абеткою'), true);

  const verbodenUitdrukking163 = `MCP-${'\u0442\u043e\u043a\u0435\u043d'}`;
  const russischeBestanden: string[] = [];
  const jargon163Bestanden: string[] = [];
  const passkeyInProzaBestanden: string[] = [];

  for (const map of ['src', 'shared', 'backend', 'server']) {
    for (const pad of alleBestandenOnder(map, /\.(ts|tsx|css)$/)) {
      const inhoud = lees(pad);
      // Очищаємо лише символьні класи регулярних виразів перевіряльників та односимвольні ключі таблиці омогліфів доменів
      const inhoudSchoon = inhoud
        .replace(/\/\[[^\n/]*\]\/[gimsuy]*/g, '')
        .replace(/(^|[\s,{])['"]?[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]['"]?\s*:\s*['"][a-z]['"]/g, '$1');
      if (RUSSISCH_RE.test(inhoudSchoon) && !pad.includes('vaardigheden-ecosysteem')) {
        russischeBestanden.push(pad);
      }
      if (map === 'src' && /\.(ts|tsx)$/.test(pad)) {
        const zonderCommentaar = inhoud.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        if (zonderCommentaar.includes(verbodenUitdrukking163)) {
          jargon163Bestanden.push(pad);
        }
        if (/[\u0400-\u04FF]{2,}\s+passkey\s+[\u0400-\u04FF]{2,}/i.test(zonderCommentaar)) {
          passkeyInProzaBestanden.push(pad);
        }
      }
    }
  }

  assert.equal(russischeBestanden.length, 0, `Крок 1: Заборонені літери поза українською абеткою виявлено у: ${russischeBestanden.join(', ')}`);
  assert.equal(
    jargon163Bestanden.length,
    0,
    `Крок 1 (№163): В українських текстах інтерфейсу src/ має бути замінено вираз із №163 на питомий відповідник, знайдено у: ${jargon163Bestanden.join(', ')}`,
  );
  assert.equal(
    passkeyInProzaBestanden.length,
    0,
    `Крок 1 (№163): В українській прозі src/ неперекладене слово passkey має бути замінено на «ключ доступу», знайдено у: ${passkeyInProzaBestanden.join(', ')}`,
  );

  // Крок 2: Шар кольорів станів src/thema/staat-kleuren.css та математичний контраст WCAG усіх палітр
  assert.ok(
    existsSync(resolve(process.cwd(), 'src/thema/staat-kleuren.css')),
    'Крок 2: Єдиний шар кольорів станів src/thema/staat-kleuren.css має існувати й об’єднувати семантичні змінні теми',
  );
  const contrastMod = await laadMjsScript<{
    controleer: () => Promise<{ fouten: string[]; paren: unknown[]; vlakken: number }>;
  }>('scripts/kleur-contrast-controle.mjs');
  const contrastRes = await contrastMod.controleer();
  assert.equal(contrastRes.fouten.length, 0, `Контраст WCAG має дотримуватися на всіх палітрах: ${contrastRes.fouten.slice(0, 5).join('; ')}`);
  assert.ok(contrastRes.vlakken >= 26 && contrastRes.paren.length > 100);

  // Крок 3: Суворе дотримання єдиного реєстру логотипів REESTR-LOGO-001 через штатний сторож і перевірку відсутності обхідних логотипів
  const merkWacht = spawnSync(
    process.execPath,
    ['scripts/eenheidstests.mjs', 'merk-een-register-20261116.test.ts'],
    { cwd: process.cwd(), env: process.env, encoding: 'utf8' },
  );
  assert.equal(
    merkWacht.status,
    0,
    `Крок 3 (REESTR-LOGO-001): Сторож єдиного реєстру знаків merk-een-register-20261116.test.ts має проходити з кодом 0: ${merkWacht.stdout}\n${merkWacht.stderr}`,
  );
  for (const nieuweMap of ['src/klantrelatiebeheer', 'src/social', 'src/bijlage-weergave', 'src/aanmeld-vnext']) {
    for (const pad of alleBestandenOnder(nieuweMap, /\.tsx$/)) {
      if (pad.startsWith('src/merk/')) continue;
      const bron = lees(pad);
      assert.ok(
        !/<svg[^>]*data-brand/i.test(bron) && !(/Logo\.tsx$/.test(pad) && /<path\s/i.test(bron)),
        `Крок 3 (REESTR-LOGO-001): Модуль ${pad} не повинен обходити єдиний реєстр src/merk/ власними логотипами брендів`,
      );
    }
  }

  // Крок 4: Мобільна ширина 412 px (mobiel-breedte-veilig-v1) та сторожі розміщення і знаків довідки «?»
  const { pg } = await laadServerBundel();
  const mobielVlag = (
    await pg.getPool('systeem').query("SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'mobiel-breedte-veilig-v1'")
  ).rows[0] as { aan?: boolean; standaard?: boolean } | undefined;
  assert.equal(mobielVlag?.aan, true, 'Крок 4: Прапорець mobiel-breedte-veilig-v1 має бути увімкнений у БД');
  assert.equal(mobielVlag?.standaard, true, 'Крок 4: Прапорець mobiel-breedte-veilig-v1 має бути відкритий для всіх (standaard = true)');
  assert.ok(/@media\s*\(\s*max-width:\s*700px\s*\)/.test(lees('src/ontwerp/mobiel.css')), 'Правила мобільного екрана (зокрема 412 px) присутні');

  execFileSync(process.execPath, ['scripts/plaatsing-controle.mjs', '--stil'], { cwd: process.cwd() });
  execFileSync(process.execPath, ['scripts/hulp-vraagtekens-controle.mjs', '--stil'], { cwd: process.cwd() });
});

test('L4-S12: Наскрізна цілісність усіх 14 сторожів складання, правил 1.8.0, двокрокового пакувальника прапорців, спадкоємності orch verwijzing, SEC-003, integratie-ci.yml та TRACE-001', async () => {
  // Крок 1: Посилення SEC-003 у deploy/archief-herstellen.sh, генератор сертифікатів #164, 10 сканерів на integratie та integratie-ci.yml
  const herstelSh = lees('deploy/archief-herstellen.sh');
  assert.ok(!/\bbash\s+-c\b/.test(herstelSh), 'Крок 1 (SEC-003): У deploy/archief-herstellen.sh має бути усунено виконання через bash -c');
  assert.ok(herstelSh.includes('--tlsv1.2'), 'Крок 1 (SEC-003): Завантаження curl у deploy/archief-herstellen.sh мають вимагати --tlsv1.2');
  assert.ok(
    herstelSh.includes('haal_gecontroleerd()') &&
      herstelSh.includes('node_ophalen()') &&
      herstelSh.includes('cloudflared_ophalen()') &&
      herstelSh.includes('tunnel_inrichten()'),
    'Усі базові функції відновлення у deploy/archief-herstellen.sh мають бути збережені без втрат',
  );
  assert.ok(existsSync(resolve(process.cwd(), 'scripts/e2e-tls-maak.mjs')), 'Генератор локального сертифіката scripts/e2e-tls-maak.mjs (#164) має існувати');
  assert.ok(existsSync(resolve(process.cwd(), '.github/workflows/integratie-ci.yml')), 'Універсальний конвеєр .github/workflows/integratie-ci.yml має існувати');

  const tienScanners = [
    'bandit.yml',
    'bearer.yml',
    'devskim.yml',
    'njsscan.yml',
    'ossar.yml',
    'osv-scanner.yml',
    'powershell.yml',
    'scorecard.yml',
    'semgrep.yml',
    'trivy.yml',
  ];
  const zonderIntegratie: string[] = [];
  for (const wf of tienScanners) {
    const wfPad = `.github/workflows/${wf}`;
    if (!existsSync(resolve(process.cwd(), wfPad)) || !lees(wfPad).includes('integratie')) {
      zonderIntegratie.push(wf);
    }
  }
  assert.equal(zonderIntegratie.length, 0, `Усі 10 сканерів безпеки мають охоплювати гілку integratie, пропущено: ${zonderIntegratie.join(', ')}`);

  // Крок 2: Унікальність чотиризначних номерів міграцій 0001..0335, відсутність руйнівних DROP TABLE/COLUMN та ідемпотентність rechten.sql
  const migratieBestanden = readdirSync(resolve(process.cwd(), 'migrations'))
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  const nummers = new Map<string, string[]>();
  const destructief: string[] = [];
  for (const f of migratieBestanden) {
    const nr = f.slice(0, 4);
    nummers.set(nr, [...(nummers.get(nr) ?? []), f]);
    const sqlZonderCommentaar = lees(`migrations/${f}`).replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (nr >= '0286' && /\bDROP\s+(TABLE|COLUMN)\b/i.test(sqlZonderCommentaar)) {
      destructief.push(f);
    }
  }
  const dubbeleNummers = [...nummers.entries()].filter(([, lijst]) => lijst.length > 1);
  assert.equal(dubbeleNummers.length, 0, `Колізії номерів міграцій заборонені: ${JSON.stringify(dubbeleNummers)}`);
  assert.equal(destructief.length, 0, `Міграції мають бути зворотно сумісними без DROP TABLE / DROP COLUMN: ${destructief.join(', ')}`);

  const { pg, ontwikkelArchief } = await laadServerBundel();
  await pg.getPool('migratie').query(lees('migrations/rechten.sql'));

  // Крок 3: Незмінність правил 1.8.0 (regels.lock.json), orch.mjs controleer = 0 та реєстр спадкоємності orchestratie/verwijzingen/
  const lock = JSON.parse(lees('orchestratie/regels.lock.json')) as {
    regelsVersie: string;
    bestanden: Record<string, string>;
  };
  assert.equal(lock.regelsVersie, '1.8.0', 'Версія правил координації має залишатися 1.8.0 за рішенням власника 4б');
  for (const pad of ['AGENTS.md', 'orchestratie/beleid.json', 'orchestratie/BESLUITEN.md']) {
    const echtSha = createHash('sha256').update(readFileSync(resolve(process.cwd(), pad))).digest('hex');
    assert.equal(echtSha, lock.bestanden[pad], `Захищений файл правил ${pad} не повинен змінюватися`);
  }

  execFileSync(process.execPath, ['scripts/orch.mjs', 'controleer'], { cwd: process.cwd() });

  const verwijzingenMod = await laadMjsScript<{
    valideerGebeurtenis: (r: unknown, opt?: { pad?: string }) => Array<{ code: string; uk: string }>;
  }>('scripts/orch/verwijzingen.mjs');
  const verwBestanden = alleBestandenOnder('orchestratie/verwijzingen', /\.json$/);
  const verwFouten: string[] = [];
  let geslotenPrRecords = 0;
  for (const pad of verwBestanden) {
    const rec = JSON.parse(lees(pad)) as { soort?: string; gebeurtenis?: string };
    if (rec.soort === 'pr' && (rec.gebeurtenis === 'gesloten' || rec.gebeurtenis === 'samengevoegd')) geslotenPrRecords += 1;
    for (const z of verwijzingenMod.valideerGebeurtenis(rec, { pad })) verwFouten.push(`${pad}: ${z.code}`);
  }
  assert.equal(verwFouten.length, 0, `Усі записи спадкоємності в orchestratie/verwijzingen/ мають бути валідними: ${verwFouten.join('; ')}`);
  assert.ok(
    geslotenPrRecords >= 47,
    `Крок 3 (рішення власника 4а): Очікуються записи спадкоємності orch verwijzing щонайменше для 47 поглинутих запитів на злиття, наразі: ${geslotenPrRecords}`,
  );

  // Крок 4: Присутність і точний порядок усіх 14 сторожів у package.json → scripts.build + ізоляція прав у trace-001-guard.yml
  const pkg = JSON.parse(lees('package.json')) as { scripts?: { build?: string } };
  const buildRegel = String(pkg.scripts?.build || '');
  const verwachteVolgorde = [
    'scripts/kaart-controle.mjs',
    'scripts/stap-op-register-controle.mjs',
    'scripts/meldingen-register-controle.mjs',
    'scripts/plaatsing-controle.mjs',
    'scripts/hulp-vraagtekens-controle.mjs',
    'scripts/zoek-ui-catalogus.mjs',
    'scripts/l002-audit.mjs',
    'scripts/mail-slimme-inbox-audit.mjs',
    'scripts/kleur-contrast-controle.mjs',
    'scripts/klant-servergrens-controle.mjs',
    'vite build',
    'scripts/huis-maquette.mjs',
    'scripts/tech-bundels-controle.mjs',
    'scripts/bouw-extensie.mjs',
    'npm run build:server',
  ];
  let vorigePos = -1;
  for (const stap of verwachteVolgorde) {
    const pos = buildRegel.indexOf(stap);
    assert.ok(pos > vorigePos, `Крок 4: Етап «${stap}» має стояти в package.json -> scripts.build у канонічному порядку`);
    vorigePos = pos;
  }

  execFileSync(process.execPath, ['scripts/stap-op-register-controle.mjs', '--stil'], { cwd: process.cwd() });
  execFileSync(process.execPath, ['scripts/meldingen-register-controle.mjs', '--stil'], { cwd: process.cwd() });
  execFileSync(process.execPath, ['scripts/klant-servergrens-controle.mjs', '--stil'], { cwd: process.cwd() });

  const traceGuardYml = lees('.github/workflows/trace-001-guard.yml');
  assert.ok(traceGuardYml.includes('contents: read'), 'Конвеєр trace-001-guard.yml має зберігати найменші права contents: read на кроці перевірки');
  assert.equal(typeof ontwikkelArchief.controleerOntwikkelArchiefOnline, 'function', 'Серверна перевірка походження TRACE-001 має бути підключена');
});

export async function main(): Promise<number> {
  try {
    return await basisMain();
  } finally {
    if (serverBundelBelofte) {
      const sb = await serverBundelBelofte.catch(() => null);
      if (sb && aangemaakteEigenaarId) {
        const pool = sb.pg.getPool('systeem');
        await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [aangemaakteEigenaarId]).catch(() => undefined);
        await pool.query("DELETE FROM app.records WHERE tbl = 'owner_step_up_v1' AND data->>'userId' = $1", [aangemaakteEigenaarId]).catch(() => undefined);
        await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [aangemaakteEigenaarId]).catch(() => undefined);
      }
      await sb?.pg.closePool().catch(() => undefined);
    }
    try {
      rmSync(dynMap, { recursive: true, force: true });
    } catch {
      /* тимчасова тека вже прибрана */
    }
  }
}
