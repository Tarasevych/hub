// Наскрізні вимогоорієнтовані випробування Рівня 3 консолідованого оновлення (CONSOLIDATIE-001, Laag 3):
// попарна та групова взаємосумісність усіх прапорців можливостей у стані одночасного ввімкнення,
// збереження користувацьких перемикачів альтернативних подань та наскрізна маршрутизація посилань сповіщень.
// Uitgebreide integratietests van Laag 3: onderlinge verenigbaarheid van alle functievlaggen, weergaveschakelaars en meldingsroutering.

import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

import { nodeTestSuite } from './hulp/node-test-main';
import { nepBrowser } from './hulp/nep-browser';
import { nepGeheim } from './hulp/nep-geheim';

import { SERVICE_HOSTS } from '../../backend/deployment-identiteit';
import { emmer, evalueer, VLAG_UITLEG, type Uitkomst, type Vlag } from '../../shared/vlaggen';
import {
  LEGACY_ALIAS,
  LINK_DIENSTEN,
  TAB_SLUG,
  dienstVoorHost,
  dienstVoorSoort,
  padBestaat,
  routeerMeldingLink,
} from '../../shared/melding-link';
import { DIEPE_PARAMS, agendaItemId, bordDoel, diepeRoute, diepeWaarde } from '../../shared/zoek-diepe-link';
import { DIENST_IDS, MENU_PAGINAS } from '../../shared/menu-model';
import { DIENST_DEF, WERKBLAD_REGISTER, registerItem } from '../../shared/werkblad-register';
import { toegestaan as werkbladToegestaan, werkbladWidget } from '../../shared/werkblad-indeling';
import { bureauWidget, plaatsbaar } from '../../shared/bureau-indeling';
import { MAAT_AUTO, STANDAARD_INDELING, type Blok } from '../../shared/werkblad-blokken';
import { beoordeelNeerzetting, maakPlek } from '../../shared/werkblad-plekken';
import { CLOUD_VNEXT_AANBIEDERS } from '../../shared/cloud-vnext-model';
import { bronDef } from '../../shared/foto-model';
import { ACTIE_LABELS, categorieVan } from '../../shared/beheer-journaal';
import { bouwMeldingRegisterOverzicht } from '../../shared/meldingen-register-overzicht';
import { REGISTER as UITLEG_REGISTER } from '../../shared/meldingen-v2/uitleg-register';
import type { V2Melding } from '../../shared/meldingen-v2/groepering';
import { interpreteerGebeurtenis } from '../../shared/meldingen-ecosysteem/tolk';

const { test, main: basisMain } = nodeTestSuite();

mkdirSync(resolve('rapporten'), { recursive: true });
const dynMap = mkdtempSync(join(resolve('rapporten'), 'dyn-e2e-laag3-'));
process.once('exit', () => {
  try {
    rmSync(dynMap, { recursive: true, force: true });
  } catch {
    /* тимчасова тека вже прибрана */
  }
});

const lees = (relPad: string): string => readFileSync(resolve(process.cwd(), relPad), 'utf8');

/** Єдине спільне складання серверних модулів зі збереженням спільних пулів БД та проміжних сховищ у пам’яті процесу. */
const SERVER_INGANGEN = [
  'server/platform/pg.ts',
  'backend/index.ts',
  'backend/stap-op.ts',
  'backend/vlaggen.ts',
  'backend/tech-profiel.ts',
  'backend/tech-ruimtes-kern.ts',
  'backend/ruimte-sessie.ts',
  'backend/cloud-m5-catalogue-routes.ts',
] as const;

type PgPoolClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  release: () => void;
};
type PgPool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect: () => Promise<PgPoolClient>;
};
type GebruikerKort = { id: string; email?: string; role?: string; status?: string };
type ServerBundel = {
  pg: {
    getPool: (rol?: 'app' | 'systeem' | 'migratie') => PgPool;
    closePool: () => Promise<void>;
  };
  index: {
    handler: (event: Record<string, unknown>) => Promise<{ statusCode: number; headers?: Record<string, string>; body: string }>;
  };
  stapOp: {
    totpStapOpVastleggen: (ctx: unknown) => Promise<void>;
  };
  vlaggen: {
    berekenen: (u: GebruikerKort, sleutels?: unknown) => Promise<Uitkomst[]>;
    standZetten: (u: GebruikerKort, tab: string, input: Record<string, unknown>) => Promise<unknown>;
    testen: (u: GebruikerKort, tab: string, sleutel: unknown, waarde: unknown) => Promise<unknown>;
    vlagGeheugenLeeg: () => void;
  };
  techProfiel: {
    tabHash: (tabContext: string) => string;
    profielVan: (u: GebruikerKort) => Promise<{ profielId: string; rollen: string[]; maxMinuten: number; ingetrokkenOp?: unknown } | null>;
  };
  techRuimtes: {
    v2Aan: (userId: string) => Promise<boolean>;
    schaduwAan: (userId: string) => Promise<boolean>;
    _vlagCacheLeeg: () => void;
  };
  ruimteSessie: {
    scheidingAan: (userId: string | null | undefined) => Promise<boolean>;
    _scheidingCacheLeeg: () => void;
  };
  cloudM5: {
    createM5ProviderCatalogueRoutes: (
      authorize: (event: Record<string, unknown>, body: unknown) => Promise<{ service: string; user: { id: string; status: string } } | { errorCode: string }>,
    ) => Record<string, Array<(ctx: { event: Record<string, unknown>; body: unknown }) => Promise<{ statusCode: number; body: string }>>>;
  };
};

let serverBundelBelofte: Promise<ServerBundel> | null = null;
function laadServerBundel(): Promise<ServerBundel> {
  if (serverBundelBelofte) return serverBundelBelofte;
  serverBundelBelofte = (async () => {
    const subMap = join(dynMap, 'srv-gedeeld');
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
    const [pg, index, stapOp, vlaggen, techProfiel, techRuimtes, ruimteSessie, cloudM5] = await Promise.all([
      imp<ServerBundel['pg']>('server/platform/pg.ts'),
      imp<ServerBundel['index']>('backend/index.ts'),
      imp<ServerBundel['stapOp']>('backend/stap-op.ts'),
      imp<ServerBundel['vlaggen']>('backend/vlaggen.ts'),
      imp<ServerBundel['techProfiel']>('backend/tech-profiel.ts'),
      imp<ServerBundel['techRuimtes']>('backend/tech-ruimtes-kern.ts'),
      imp<ServerBundel['ruimteSessie']>('backend/ruimte-sessie.ts'),
      imp<ServerBundel['cloudM5']>('backend/cloud-m5-catalogue-routes.ts'),
    ]);
    return { pg, index, stapOp, vlaggen, techProfiel, techRuimtes, ruimteSessie, cloudM5 };
  })();
  return serverBundelBelofte;
}

/** Динамічне складання та імпорт модуля проєкту (зокрема нових .ts/.tsx із .css з віх M1..M5) без помилок на базовій гілці. */
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

/** Імпорт наявного .mjs-сценарію за прямою файловою адресою (щоб складач не запускав його головну гілку). */
async function laadMjsScript<T = Record<string, unknown>>(relPad: string): Promise<T> {
  const volPad = resolve(process.cwd(), relPad);
  return (await import(pathToFileURL(volPad).href)) as T;
}

/** Встановлює робочий диспетчер подій, кореневі методи DOM, matchMedia та безпечний локальний fetch на імітованому об'єкті window. */
function zorgWindowGebeurtenissen(): void {
  nepBrowser('https://hub.tarasevych.com', 'uk');
  const g = globalThis as unknown as Record<string, unknown>;
  const docEl = (g.document as { documentElement?: Record<string, unknown> } | undefined)?.documentElement;
  if (docEl) {
    docEl.addEventListener ??= () => undefined;
    docEl.removeEventListener ??= () => undefined;
    docEl.setAttribute ??= () => undefined;
    docEl.getAttribute ??= () => null;
    docEl.removeAttribute ??= () => undefined;
    const stijl = docEl.style as Record<string, unknown> | undefined;
    if (stijl) {
      stijl.removeProperty ??= () => '';
      stijl.getPropertyValue ??= () => '';
    }
    const klassen = docEl.classList as Record<string, unknown> | undefined;
    if (klassen) {
      klassen.toggle ??= () => false;
    }
  }
  g.matchMedia ??= () => ({
    matches: false,
    media: '',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
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
    for (const fn of [...(kaart.get(soort) ?? [])]) {
      fn(ev);
    }
    return true;
  };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, vlaggen: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
  w.__mrEchteGebeurtenissen = true;
}

/** Створює тимчасову якірну сесію з активованим технічним профілем (сумісно і до, і після увімкнення tech-ruimtes-v2 / ruimtes-scheiding). */
async function maakActieveTechSessie(
  userId: string,
  profielId: string,
  rollen: string[],
): Promise<{
  tab: string;
  roepBeheer: (pad: string, body: Record<string, unknown>) => Promise<{ status: number; data: Record<string, unknown> }>;
  opruimen: () => Promise<void>;
}> {
  const { pg, index, stapOp, techProfiel } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
  const sessieId = randomUUID();
  const ruw = randomBytes(32).toString('base64url');
  const tab = randomBytes(24).toString('hex');
  const nu = Date.now();
  const host = SERVICE_HOSTS.hub;

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
      tokenHash: createHash('sha256').update(ruw).digest('hex'),
      userId,
      service: 'hub',
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
      ip: '203.0.113.19',
      userAgent: 'e2e-laag3',
    },
  ]);

  const cookie = `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${sessieId}.${ruw}`)}`;
  const roepBeheer = async (pad: string, body: Record<string, unknown>) => {
    const r = await index.handler({
      headers: {
        host,
        origin: `https://${host}`,
        'content-type': 'application/json',
        cookie,
        'user-agent': 'e2e-laag3',
      },
      body: JSON.stringify({ service: 'hub', tabContext: tab, sourceOrigin: `https://${host}`, ...body }),
      isBase64Encoded: false,
      rawPath: pad,
      rawQueryString: '',
      queryStringParameters: {},
      requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.19', userAgent: 'e2e-laag3' } },
    });
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(String(r.body || '{}')) as Record<string, unknown>;
    } catch {
      /* порожня відповідь */
    }
    return { status: r.statusCode, data };
  };

  // Записуємо класичну активацію вкладки (з канонічним префіксом tech-tab:) та v2-сесію технічного простору
  await pool.query(
    `INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, sessie_id, rollen, modus, reden, eind_op)
     VALUES ($1, $2, $3, $4, $5, 'tijd', 'Перевірка прапорців', now() + interval '2 hours')`,
    [userId, profielId, techProfiel.tabHash(tab), sessieId, rollen],
  );
  await stapOp.totpStapOpVastleggen({ user: { id: userId }, session: { id: sessieId, createdAt: nu } });
  await roepBeheer('/api/owner/hub/tech/ruimtes/starten', { modus: 'tijd', minuten: 60, reden: 'Перевірка прапорців' }).catch(
    () => undefined,
  );

  return {
    tab,
    roepBeheer,
    opruimen: async () => {
      await pool.query('DELETE FROM app.tech_activaties WHERE user_id = $1 AND sessie_id = $2', [userId, sessieId]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = $1 AND sessie_id = $2', [userId, sessieId]).catch(() => undefined);
      await pool.query("DELETE FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND id = $1", [sessieId]).catch(() => undefined);
    },
  };
}

const VIJF_UITROEP_VLAGGEN = [
  'gastcodes-iedereen',
  'aanmelden-passkey',
  'aanmelden-wachtwoord',
  'aanmelden-extern',
  'aanmelden-sms',
] as const;

const VERPLICHTE_TOEPASSING_VLAGGEN = [
  'ssh-certificaat',
  'werkblad-v3',
  'werkblad-blokken',
  'agenda-v3',
  'notities-vnext',
  'huis-vnext',
  'cloud-vnext',
  'bijlage-viewer-v2',
  'bijlage-weergave-gedeeld-v1',
  'klantrelatiebeheer-v1',
  'accountmenu-v2',
  'accountmenu-v3',
  'meldingen-v2',
  'meldingen-uitleg-v3',
  'mail-zoeken-v2',
  'verbindingen-centrum-v2',
  'foto-dienst',
  'menu-kalender-foto-eigen',
  'uitrol-weergave-v2',
  'integraties-catalogus-v2',
  'afstemming-vnext',
  'aanmeldmethoden-vnext',
  'identiteit-account-atelier',
  'identiteit-account-maquette',
  'mobiel-breedte-veilig-v1',
] as const;

let aangemaakteEigenaarId: string | null = null;

/** Знаходить єдиного власника сайту в тестовій базі або створює його без порушення унікального індексу records_een_eigenaar. */
async function zorgTestEigenaar(): Promise<{ id: string; email: string; role: 'owner'; status: 'approved' }> {
  const { pg } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const bestaand = (
    await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1`)
  ).rows[0] as { id?: string; email?: string } | undefined;
  let eigenaarId: string;
  let gekozenEmail: string;
  if (bestaand?.id) {
    eigenaarId = String(bestaand.id);
    gekozenEmail = String(bestaand.email || 'eigenaar@example.invalid');
  } else {
    const id = randomUUID();
    const email = process.env.OWNER_EMAIL || 'eigenaar@example.invalid';
    process.env.OWNER_EMAIL = email;
    const ingevoegd = await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id', [
      'users',
      id,
      { email, role: 'owner', status: 'approved', name: 'Власник випробувань' },
    ]);
    if (ingevoegd.rows[0]?.id) {
      aangemaakteEigenaarId = String(ingevoegd.rows[0].id);
    }
    const na = (
      await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1`)
    ).rows[0] as { id?: string; email?: string };
    eigenaarId = String(na?.id || id);
    gekozenEmail = String(na?.email || email);
  }
  process.env.OWNER_EMAIL = gekozenEmail;
  await pool.query(
    `UPDATE app.feature_flags
     SET gebruikers = array_append(gebruikers, $1::text)
     WHERE sleutel = ANY($2::text[]) AND aan = true AND standaard = false AND NOT ($1::text = ANY(gebruikers))`,
    [eigenaarId, [...VIJF_UITROEP_VLAGGEN]],
  );
  return { id: eigenaarId, email: gekozenEmail, role: 'owner', status: 'approved' };
}

/** Виконує справжній клієнтський маршрутизатор public/canonical-service.js для перевірки адреси без ефекту мовчазного 404. */
const ROUTER_BRON = lees('public/canonical-service.js');
function echteRoute(href: string): { service: string; tab: string; onbekend: boolean } {
  const u = new URL(href);
  const el = () => ({
    style: {},
    dataset: {},
    setAttribute() {},
    getAttribute: () => null,
    appendChild() {},
    remove() {},
    classList: { add() {}, remove() {} },
  });
  const loc = {
    href: u.href,
    hostname: u.hostname,
    host: u.host,
    pathname: u.pathname,
    search: u.search,
    hash: u.hash,
    origin: u.origin,
    protocol: u.protocol,
    replace() {},
    assign() {},
  };
  const doc = {
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: el,
    documentElement: { classList: { add() {}, remove() {}, contains: () => false }, dataset: {}, style: {}, lang: 'uk', setAttribute() {} },
    head: { appendChild() {} },
    body: { appendChild() {} },
    cookie: '',
    title: '',
  };
  const opslag = { getItem: () => null, setItem() {}, removeItem() {} };
  const w: Record<string, unknown> = {
    location: loc,
    document: doc,
    history: { replaceState() {}, pushState() {} },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    localStorage: opslag,
    sessionStorage: opslag,
    navigator: { language: 'uk' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  w.window = w;
  w.self = w;
  const namen = Object.keys(w);
  new Function(...namen, ROUTER_BRON)(...namen.map((k) => w[k]));
  const r = (w.__TSV_CANONICAL_SERVICE__ as { resolve: () => { service: string; tab: string; onbekend?: boolean } }).resolve();
  return { service: r.service, tab: r.tab, onbekend: r.onbekend === true };
}

function isGeldigeSitePagina(href: string): boolean {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || !dienstVoorHost(u.hostname)) return false;
  if (u.hostname === SERVICE_HOSTS.identity && u.pathname === '/toegang') return true;
  return !echteRoute(u.href).onbekend;
}

function alleTsBestanden(mapPad: string): string[] {
  const volMap = resolve(process.cwd(), mapPad);
  if (!existsSync(volMap)) return [];
  const uit: string[] = [];
  for (const naam of readdirSync(volMap)) {
    const p = join(volMap, naam);
    if (statSync(p).isDirectory()) {
      if (naam !== 'node_modules') uit.push(...alleTsBestanden(join(mapPad, naam)));
    } else if (/\.tsx?$/.test(naam) && !/\.d\.ts$/.test(naam)) {
      uit.push(join(mapPad, naam));
    }
  }
  return uit;
}

// ============================================================================
// 3.1. Обчислення evalueer / berekenen та стан одночасного увімкнення прапорців (L3-C01 .. L3-C06)
// ============================================================================

test('L3-C01: У консолідованому стані після міграції 0335 власник сайту має одночасно увімкнені всі прикладні та безпекові прапорці без помилок', async () => {
  const migratieBestanden = readdirSync(resolve(process.cwd(), 'migrations')).filter((f) => /^0335_.*\.sql$/.test(f));
  assert.ok(migratieBestanden.length > 0, 'Очікується завершальна міграція 0335 увімкнення прапорців у каталозі migrations/');

  const { pg, vlaggen } = await laadServerBundel();
  const eigenaar = await zorgTestEigenaar();
  const pool = pg.getPool('systeem');
  vlaggen.vlagGeheugenLeeg();

  const rijen = (await pool.query('SELECT sleutel FROM app.feature_flags WHERE gearchiveerd_op IS NULL ORDER BY sleutel')).rows as Array<{
    sleutel: string;
  }>;
  assert.ok(rijen.length >= 40, `У таблиці app.feature_flags очікується щонайменше 40 активних прапорців, знайдено: ${rijen.length}`);

  const uitkomsten = await vlaggen.berekenen(eigenaar);
  const perSleutel = new Map(uitkomsten.map((u) => [u.key, u]));

  for (const verplichteSleutel of [...VIJF_UITROEP_VLAGGEN, ...VERPLICHTE_TOEPASSING_VLAGGEN]) {
    const u = perSleutel.get(verplichteSleutel);
    assert.ok(u, `Прапорець ${verplichteSleutel} має бути присутній у обчисленому наборі власника`);
    assert.equal(u.value, true, `Прапорець ${verplichteSleutel} для власника має бути увімкнений (отримано reason=${u.reason})`);
  }

  const uitgeschakeld = rijen.map((r) => perSleutel.get(r.sleutel)).filter((u) => !u || u.value !== true || u.reason === 'ERROR');
  assert.equal(
    uitgeschakeld.length,
    0,
    `Для власника сайту всі неархівовані прапорці мають давати value=true без ERROR, вимкнені: ${uitgeschakeld.map((u) => `${u?.key}:${u?.reason}`).join(', ')}`,
  );
});

test('L3-C02: У консолідованому стані після міграції 0335 звичайний схвалений користувач отримує увімкненими всі прикладні прапорці й вимкненими п’ять безпекових прапорців', async () => {
  const { pg, vlaggen } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const uid = randomUUID();
  const email = `gewoon-l3c02-${uid.slice(0, 8)}@example.invalid`;
  await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
    'users',
    uid,
    { email, role: 'user', status: 'approved', name: 'Звичайний учасник' },
  ]);

  try {
    vlaggen.vlagGeheugenLeeg();
    const gewoneGebruiker = { id: uid, email, role: 'user', status: 'approved' };
    const uitkomsten = await vlaggen.berekenen(gewoneGebruiker);
    const perSleutel = new Map(uitkomsten.map((u) => [u.key, u]));

    for (const beveiligingsVlag of VIJF_UITROEP_VLAGGEN) {
      const u = perSleutel.get(beveiligingsVlag);
      assert.ok(u, `Безпековий прапорець ${beveiligingsVlag} має існувати в базі даних`);
      assert.equal(u.value, false, `Безпековий прапорець ${beveiligingsVlag} не може бути відкритий для звичайного користувача`);
      assert.equal(u.reason, 'STATIC', `Для звичайного користувача безпековий прапорець ${beveiligingsVlag} має давати причину STATIC`);
    }

    const ontbrekendOfUit: string[] = [];
    for (const toepassingsVlag of VERPLICHTE_TOEPASSING_VLAGGEN) {
      const u = perSleutel.get(toepassingsVlag);
      if (!u || u.value !== true) ontbrekendOfUit.push(`${toepassingsVlag}:${u ? u.reason : 'відсутній'}`);
    }
    assert.equal(
      ontbrekendOfUit.length,
      0,
      `Усі прикладні прапорці мають бути увімкнені для звичайного користувача після 0335, проте вимкнені або відсутні: ${ontbrekendOfUit.join(', ')}`,
    );
  } finally {
    await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [uid]).catch(() => undefined);
  }
});

test('L3-C03: Неавторизований гість і сеанс після виходу отримують безпечний порожній набір прапорців без зайвих мережевих запитів 401', async () => {
  zorgWindowGebeurtenissen();
  const origFetch = globalThis.fetch;
  let aantalAanroepen = 0;
  globalThis.fetch = (async () => {
    aantalAanroepen += 1;
    return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401 });
  }) as typeof fetch;

  try {
    const fv = await import('../../src/functievlag-lezen');
    fv.vlaggenGebruiker(null);
    const kaart = await fv.laadVlaggen();
    assert.equal(kaart.size, 0, 'Для вийденого користувача або гостя набір прапорців має бути порожнім');
    assert.equal(aantalAanroepen, 0, 'Після vlaggenGebruiker(null) клієнт не повинен надсилати мережеві запити до /api/flags');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('L3-C04: Тестувальник може локально вимкнути загальноувімкнений прапорець лише для себе без жодного впливу на інших людей', async () => {
  const { pg, vlaggen } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const kort = randomBytes(4).toString('hex');
  const sleutel = `proef-l3-c04-${kort}`;
  const testerId = randomUUID();
  const gewoonId = randomUUID();

  await pool.query(
    `INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard, percentage, gebruikers)
     VALUES ($1, 'Тимчасовий прапорець перевірки ізоляції тестувальника', true, true, 0, '{}')`,
    [sleutel],
  );
  await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3), ($1, $4, $5)', [
    'users',
    testerId,
    { email: `tester-${kort}@example.invalid`, role: 'user', status: 'approved', name: 'Тестувальник' },
    gewoonId,
    { email: `gewoon-${kort}@example.invalid`, role: 'user', status: 'approved', name: 'Учасник' },
  ]);
  const profielId = `tech-${randomBytes(6).toString('hex')}`;
  await pool.query(
    `INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door)
     VALUES ($1, $2, ARRAY['tester'], 480, 'proef')`,
    [testerId, profielId],
  );
  const techSessie = await maakActieveTechSessie(testerId, profielId, ['tester']);

  try {
    vlaggen.vlagGeheugenLeeg();
    const testerGebruiker = { id: testerId, email: `tester-${kort}@example.invalid`, role: 'user', status: 'approved' };
    const gewoneGebruiker = { id: gewoonId, email: `gewoon-${kort}@example.invalid`, role: 'user', status: 'approved' };

    const antwTest = await techSessie.roepBeheer('/api/beheer/flags/test', { sleutel, waarde: false });
    assert.equal(antwTest.status, 200, `Встановлення особистої перевірки прапорця має повертати 200, отримано: ${antwTest.status}`);

    const [voorTester] = await vlaggen.berekenen(testerGebruiker, [sleutel]);
    const [voorGewoon] = await vlaggen.berekenen(gewoneGebruiker, [sleutel]);

    assert.equal(voorTester?.value, false, 'Для самого тестувальника прапорець має тимчасово стати false');
    assert.equal(voorTester?.reason, 'TARGETING_MATCH', 'Причина особистої перевизначки має бути TARGETING_MATCH');
    assert.equal(voorTester?.metadata?.test, true, 'Поле metadata.test має дорівнювати true');
    assert.equal(voorGewoon?.value, true, 'Для іншого звичайного користувача загальноувімкнений прапорець залишається true');
    assert.equal(voorGewoon?.reason, 'STATIC', 'Для звичайного користувача причина залишається STATIC');
  } finally {
    await techSessie.opruimen();
    await pool.query('DELETE FROM app.feature_flag_tests WHERE sleutel = $1', [sleutel]).catch(() => undefined);
    await pool.query('DELETE FROM app.feature_flags WHERE sleutel = $1', [sleutel]).catch(() => undefined);
    await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [testerId]).catch(() => undefined);
    await pool
      .query("DELETE FROM app.records WHERE tbl IN ('owner_step_up_v1', 'tweede_factor_login_v1') AND data->>'userId' = $1", [testerId])
      .catch(() => undefined);
    await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1::text[])", [[testerId, gewoonId]]).catch(() => undefined);
    vlaggen.vlagGeheugenLeeg();
  }
});

test('L3-C05: Функція розподілу за кошиками emmer монотонна й детермінована при зростанні частки для всіх відомих ключів прапорців', () => {
  const sleutels = Object.keys(VLAG_UITLEG);
  assert.ok(sleutels.length >= 25, 'Словник VLAG_UITLEG має містити щонайменше 25 відомих прапорців');
  const gebruikers = Array.from({ length: 500 }, (_, i) => `gebruiker-monotoon-${i}`);

  for (const sleutel of sleutels) {
    const maakVlag = (percentage: number): Vlag => ({
      sleutel,
      omschrijving: 'Перевірка монотонності',
      aan: true,
      standaard: false,
      percentage,
      gebruikers: [],
    });
    const v20 = maakVlag(20);
    const v50 = maakVlag(50);
    const v80 = maakVlag(80);
    const v100 = maakVlag(100);

    for (const uid of gebruikers) {
      const b1 = emmer(sleutel, uid);
      const b2 = emmer(sleutel, uid);
      assert.equal(b1, b2, `Кошик для (${sleutel}, ${uid}) має бути детермінованим`);
      assert.ok(b1 >= 0 && b1 <= 99, `Кошик ${b1} має лежати в межах 0..99`);

      const a20 = evalueer(sleutel, v20, uid).value;
      const a50 = evalueer(sleutel, v50, uid).value;
      const a80 = evalueer(sleutel, v80, uid).value;
      const a100 = evalueer(sleutel, v100, uid).value;

      if (a20) assert.equal(a50, true, `Хто мав прапорець ${sleutel} при 20%, не може втратити його при 50%`);
      if (a50) assert.equal(a80, true, `Хто мав прапорець ${sleutel} при 50%, не може втратити його при 80%`);
      assert.equal(a100, true, `При 100% прапорець ${sleutel} має бути увімкнений для кожного користувача`);
    }
  }
});

test('L3-C06: Одночасна зміна прапорця на сервері та подія mr:vlaggen-vernieuwd синхронно оновлюють серверні читачі й усі 18 клієнтських обгорток', async () => {
  const vijfServerBestanden = [
    'backend/ai-prijzen.ts',
    'backend/apparaat-bevestiging/opslag.ts',
    'backend/index.ts',
    'backend/telegram-aanmelden/opslag.ts',
    'backend/telegram-aanmelden/venster-sleutel.ts',
  ];
  const rechtstreeksSql: string[] = [];
  for (const pad of vijfServerBestanden) {
    const bron = lees(pad);
    if (/FROM\s+app\.feature_flags/i.test(bron)) {
      rechtstreeksSql.push(pad);
    }
  }
  assert.equal(
    rechtstreeksSql.length,
    0,
    `П'ять серверних читачів мають користуватися спільним 15-секундним проміжним сховищем прапорців замість прямого SQL: ${rechtstreeksSql.join(', ')}`,
  );

  const achttienClientWrappers = [
    'src/foto/foto-vlaggen.ts',
    'src/huis/huis-vlag.ts',
    'src/aanmeld-vnext/aanmeld-vlag.ts',
    'src/accountmenu-v2/vlag.ts',
    'src/afstemming-vnext/afstemming-vlag.ts',
    'src/agenda/v3/agenda-vlag.ts',
    'src/apparaat-bevestiging/vlag.ts',
    'src/bijlage-v2/vlag.ts',
    'src/cloud-vnext/cloud-vlag.ts',
    'src/integraties/catalogus-vlag.ts',
    'src/mail-zoeken-v2/vlag.ts',
    'src/meldingen/v2/vlag.ts',
    'src/meldingen/v2/vlag-uitleg.ts',
    'src/notities/notities-vlag.ts',
    'src/tech/ruimtes/ruimtes-vlag.ts',
    'src/telegram-aanmelden/vlag.ts',
    'src/uitrol/uitrol-vlag.ts',
    'src/verbindingen/verbindingen-vlag.ts',
  ];
  const nietReactief: string[] = [];
  for (const pad of achttienClientWrappers) {
    const bron = lees(pad);
    const gekoppeld = bron.includes('functievlag-lezen') || bron.includes('mr:vlaggen-vernieuwd');
    if (!gekoppeld) nietReactief.push(pad);
  }
  assert.equal(
    nietReactief.length,
    0,
    `Усі 18 клієнтських обгорток прапорців мають реактивно оновлюватися через functievlag-lezen або подію mr:vlaggen-vernieuwd, не підключені: ${nietReactief.join(', ')}`,
  );

  // Додаткова жива перевірка скидання серверного проміжного сховища на тимчасовому прапорці
  const { pg, vlaggen, techProfiel } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const eigenaar = await zorgTestEigenaar();
  const kort = randomBytes(4).toString('hex');
  const sleutel = `proef-l3-c06-${kort}`;
  const profiel = await techProfiel.profielVan(eigenaar);
  assert.ok(profiel, 'Власник сайту завжди має чинний технічний профіль');

  await pool.query(
    `INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard, percentage, gebruikers)
     VALUES ($1, 'Перевірка миттєвого скидання серверної пам’яті прапорців', false, false, 0, '{}')`,
    [sleutel],
  );
  const techSessie = await maakActieveTechSessie(eigenaar.id, profiel.profielId, profiel.rollen);

  try {
    vlaggen.vlagGeheugenLeeg();
    assert.equal((await vlaggen.berekenen(eigenaar, [sleutel]))[0]?.value, false, 'Початково прапорець вимкнений');
    const standAntw = await techSessie.roepBeheer('/api/beheer/flags/stand', { sleutel, stand: 'alle' });
    assert.equal(standAntw.status, 200);
    assert.equal(
      (await vlaggen.berekenen(eigenaar, [sleutel]))[0]?.value,
      true,
      'Відразу після зміни стану проміжне сховище сервера має оновитися на value=true без очікування 15 секунд',
    );
  } finally {
    await techSessie.opruimen();
    await pool.query('DELETE FROM app.feature_flags WHERE sleutel = $1', [sleutel]).catch(() => undefined);
    vlaggen.vlagGeheugenLeeg();
  }
});

// ============================================================================
// 3.2. Взаємосумісність усіх пар альтернативних реалізацій із перемикачами вигляду (L3-C07 .. L3-C16)
// ============================================================================

test('L3-C07: Меню облікового запису при одночасному accountmenu-v3 та accountmenu-v2 зберігає всі чотири стилі й поважає серверне вимкнення', async () => {
  zorgWindowGebeurtenissen();
  const origFetch = globalThis.fetch;
  try {
    const serverVlaggen: Uitkomst[] = [{ key: 'accountmenu-v3', value: false, variant: 'uit', reason: 'DISABLED' }];
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ vlaggen: serverVlaggen, key: 'accountmenu-v3', value: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    const fv = await import('../../src/functievlag-lezen');
    fv.vlaggenGebruiker('u-l3c07');
    await fv.laadVlaggen(true);

    const am3Vlag = await import('../../src/accountmenu-v3/vlag');
    const uitkomstBijServerUit = await am3Vlag.laadAccountmenuV3Vlag(true);
    assert.equal(
      uitkomstBijServerUit,
      false,
      'Коли сервер повертає для accountmenu-v3 стан value=false (навіть без metadata.test), клієнт має поважати це й повертати false',
    );

    const voorkeurenMod = await import('../../src/accountmenu-v3/accountmenu-v3-voorkeuren');
    assert.equal(voorkeurenMod.leesAccountmenuV3Voorkeuren().indeling, 'orbita', 'Типовою розкладкою v3 має залишатися Орбіта світлин');

    const samenBron = [
      lees('src/accountmenu-v3/accountmenu-v3-voorkeuren.ts'),
      lees('src/CanoniekAccountMenu.tsx'),
      existsSync(resolve(process.cwd(), 'src/accountmenu-v3/AccountMenuV3.tsx')) ? lees('src/accountmenu-v3/AccountMenuV3.tsx') : '',
    ].join('\n');

    assert.ok(
      samenBron.includes('orbita') && samenBron.includes('kaart'),
      'Мають бути збережені обидва варіанти v3: Орбіта світлин та Секційна картка',
    );
    assert.ok(
      existsSync(resolve(process.cwd(), 'src/accountmenu-v2/vlag.ts')) && lees('src/CanoniekAccountMenu.tsx').includes('useAccountmenuV2'),
      'Реалізація компактного меню v2 має залишатися підключеною та непошкодженою',
    );
    const heeftVierStijlenKiezer =
      (samenBron.includes('v2') || samenBron.includes('compact')) &&
      (samenBron.includes('klassiek') || samenBron.includes('v6') || samenBron.includes('klasychn'));
    assert.ok(
      heeftVierStijlenKiezer,
      'При одночасному увімкненні accountmenu-v3 та accountmenu-v2 користувач має мати явний перемикач між 4 стилями меню (v3 Орбіта, v3 Секційна картка, v2 Компактне, Класичне)',
    );
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('L3-C08: Переглядач вкладень при одночасному ввімкненні п’яти прапорців спільного переглядача та bijlage-viewer-v2 зберігає три режими подання', async () => {
  zorgWindowGebeurtenissen();
  assert.ok(
    existsSync(resolve(process.cwd(), 'src/bijlage-weergave')),
    'Очікується каталог спільного переглядача вкладень src/bijlage-weergave/ після злиття запиту №208',
  );
  assert.ok(
    existsSync(resolve(process.cwd(), 'src/bijlage-v2/vlag.ts')) && existsSync(resolve(process.cwd(), 'src/bijlage-v2/BijlageV2Kop.tsx')),
    'Попередній компактний переглядач src/bijlage-v2/ має залишатися в сховищі без видалення',
  );

  const vijfSpilVlaggen = [
    'bijlage-weergave-gedeeld-v1',
    'posta-vensters-herstel-v1',
    'lezer-fout-blijft-open-v1',
    'mail-tekst-utf8-terugval-v1',
    'maquette-zwevend-rail-verbergen-v1',
  ];
  for (const v of vijfSpilVlaggen) {
    assert.ok(v in VLAG_UITLEG, `Прапорець ${v} із запиту №208 має мати двомовний опис у VLAG_UITLEG`);
  }

  const bijlageBestanden = [
    ...alleTsBestanden('src/bijlage-weergave'),
    ...alleTsBestanden('src/bijlage-v2'),
    ...alleTsBestanden('src/mail'),
    'src/GoogleMailWerkruimte.tsx',
  ].filter((p) => existsSync(resolve(process.cwd(), p)));
  const gecombineerdeBron = bijlageBestanden.map(lees).join('\n');

  assert.ok(
    gecombineerdeBron.includes('BijlageV2Kop') &&
      (gecombineerdeBron.includes('klassiek') || gecombineerdeBron.includes('Класичн')) &&
      (gecombineerdeBron.includes('gedeeld') || gecombineerdeBron.includes('Спільн')),
    'У пошті та переглядачі вкладень має працювати взаємосумісний вибір трьох режимів вигляду (Спільний, Компактна панель v2, Класична)',
  );
});

test('L3-C09: Пульт уваги MeldingenPortaal разом із meldingen-v2 та meldingen-uitleg-v3 працює узгоджено без відкочування основного вікна', async () => {
  zorgWindowGebeurtenissen();
  const ecoOpslag = await import('../../src/meldingen/ecosysteem/ecosysteem-opslag');

  assert.equal(
    ecoOpslag.leesEcosysteemModusActief(),
    true,
    'Основний режим Пульта уваги (ecosysteemModusActief) за замовчуванням має бути увімкненим навіть при активних meldingen-v2 та meldingen-uitleg-v3',
  );

  ecoOpslag.zetEcosysteemModusActief(false);
  assert.equal(ecoOpslag.leesEcosysteemModusActief(), false, 'Користувач може явно перемкнутися на компактне подання списку');
  ecoOpslag.zetEcosysteemModusActief(true);
  assert.equal(ecoOpslag.leesEcosysteemModusActief(), true, 'Користувач може повернутися до вікна Пульта уваги');

  const centrumBron = lees('src/CanoniekMeldingencentrum.tsx');
  const v2Bron = lees('src/meldingen/v2/MeldingenV2.tsx');
  const uitlegBestand = existsSync(resolve(process.cwd(), 'src/meldingen/v2/MeldingUitleg.tsx'));

  assert.ok(
    centrumBron.includes('MeldingenPortaal') && centrumBron.includes('MeldingenV2'),
    'CanoniekMeldingencentrum має підтримувати обидва подання: MeldingenPortaal та MeldingenV2',
  );
  assert.ok(
    (centrumBron.includes('Вікно') && centrumBron.includes('Venster')) || (v2Bron.includes('Вікно') && v2Bron.includes('Venster')),
    'У компактному режимі має бути двомовна кнопка повернення у вікно екосистеми («Вікно» / «Venster»)',
  );
  assert.ok(
    uitlegBestand && v2Bron.includes('useUitlegV3'),
    'Розгорнуті пояснення MeldingUitleg.tsx (uitleg-v3) мають залишатися підключеними до MeldingenV2',
  );
});

test('L3-C10: Центр облікового запису при одночасному identiteit-account-atelier та identiteit-account-maquette зберігає всі три вигляди', async () => {
  zorgWindowGebeurtenissen();
  const iv = await import('../../src/identiteit/identiteit-vormgeving');
  const russischRe = /[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/;

  assert.deepEqual([...iv.VORMGEVINGEN], ['maquette', 'studio', 'klassiek'], 'Порядок виглядів центру облікового запису має бути Макет, Студія, Класичний');
  assert.equal(iv.leesVormgeving(iv.VORMGEVINGEN), 'maquette', 'Типовим виглядом за увімкнених прапорців має бути Макет');

  for (const keuze of ['studio', 'klassiek', 'maquette'] as const) {
    iv.bewaarVormgeving(keuze);
    assert.equal(iv.leesVormgeving(iv.VORMGEVINGEN), keuze, `Збережений користувачем вигляд ${keuze} не повинен примусово скидатися`);
    const t = iv.VORMGEVING_TEKST[keuze];
    assert.ok(t.uk.length >= 4 && t.nl.length >= 4 && t.ukUitleg.length >= 20 && t.nlUitleg.length >= 20);
    assert.ok(!russischRe.test(`${t.uk} ${t.ukUitleg}`), `Українські тексти вигляду ${keuze} не містять заборонених літер`);
  }
});

test('L3-C11: Способи входу aanmeldmethoden-vnext, картковий режим UI-015A, вигляд Макет і Telegram v2 взаємосумісні без втрати жодного способу чи якоря', async () => {
  zorgWindowGebeurtenissen();
  assert.ok(existsSync(resolve(process.cwd(), 'src/aanmeld-vnext')), 'Каталог src/aanmeld-vnext/ має бути присутнім');

  const aanmeldBestanden = [
    ...alleTsBestanden('src/aanmeld-vnext'),
    'src/ToegangslaagWeergave.tsx',
    'src/InstellingencentrumWeergave.tsx',
  ].filter((p) => existsSync(resolve(process.cwd(), p)));
  const aanmeldBron = aanmeldBestanden.map(lees).join('\n');

  const migraties0321Tot0323 = readdirSync(resolve(process.cwd(), 'migrations')).filter((f) => /^032[123]_.*\.sql$/.test(f));
  const heeftKaartWeergave =
    migraties0321Tot0323.length > 0 &&
    (aanmeldBron.includes('kaart') || aanmeldBron.includes('ui015a') || aanmeldBron.includes('Картк'));
  assert.ok(
    heeftKaartWeergave,
    'Картковий режим способів входу з архіву UI-015A (№167) має бути інтегрований як взаємосумісний перемикач з власною міграцією прапорця у 0321..0323',
  );

  // Жоден якір безпеки та жоден спосіб входу не втрачені, вигляд Макет збережено
  assert.ok(existsSync(resolve(process.cwd(), 'src/identiteit/maquette/IdentiteitMaquette.tsx')), 'Вигляд Макет на id.tarasevych.com має залишатися цілим');
  const ankers: Array<[string, string]> = [
    ['id=\'toegangscodes\'', 'src/Toegangscodes.tsx'],
    ['id=\'aanmeldmethoden-herstel\'', 'src/HerstelcodesSectie.tsx'],
    ['id=\'aanmeldmethoden-passkeys\'', 'src/ToegangssleutelsSectie.tsx'],
  ];
  for (const [anker, pad] of ankers) {
    assert.ok(lees(pad).includes(anker), `Якір безпеки ${anker} у файлі ${pad} має залишатися на місці`);
  }
});

test('L3-C12: Робочий стіл Werkblad v3, вкладені блоки, перенесені Календар і Фото, живі віджети та розділ social працюють узгоджено', async () => {
  zorgWindowGebeurtenissen();
  const fotoVlaggen = await import('../../src/foto/foto-vlaggen');

  assert.deepEqual(
    fotoVlaggen.doorverwijzing('cloud', 'calendar', true),
    { dienst: 'hub', pagina: 'calendar' },
    'Стара адреса cloud/calendar при увімкненому menu-kalender-foto-eigen має переводити на hub/calendar',
  );
  assert.deepEqual(
    fotoVlaggen.doorverwijzing('cloud', 'photos', true),
    { dienst: 'hub', pagina: 'photos' },
    'Стара адреса cloud/photos при увімкненому menu-kalender-foto-eigen має переводити на hub/photos',
  );

  // Правила безпечного вкладення блоків у Werkblad
  const basisKnoop = { afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0, indeling: STANDAARD_INDELING };
  const wortelBlok: Blok = {
    ...basisKnoop,
    soort: 'blok',
    id: 'b-wortel',
    titel: 'Робоча тека',
    kinderen: [
      {
        ...basisKnoop,
        soort: 'blok',
        id: 'b-kind',
        titel: 'Підтека',
        kinderen: [{ ...basisKnoop, soort: 'blok', id: 'b-kleinkind', titel: 'Глибока тека', kinderen: [] }],
      },
    ],
  };
  const doelKind = maakPlek('blok', 'b-kind');
  const doelKleinkind = maakPlek('blok', 'b-kleinkind');
  const canvasPlek = maakPlek('canvas', 'hoofd');
  const ctxPrive = {
    wortels: [wortelBlok],
    plekken: [doelKind, doelKleinkind, canvasPlek],
    ruimte: 'prive' as const,
    ruimtesVan: (id: string) => registerItem(id)?.ruimtes,
  };

  const kringOordeel = beoordeelNeerzetting({ van: 'blok', knoopId: 'b-wortel' }, { doel: doelKind, voor: null, kopie: false }, ctxPrive);
  assert.deepEqual(kringOordeel, { ok: false, reden: 'kring' }, 'Вкладення блока у власного нащадка має блокуватися кодом kring');

  const techInPrive = beoordeelNeerzetting(
    { van: 'bibliotheek', itemId: 'wdg:tech-server' },
    { doel: canvasPlek, voor: null, kopie: false },
    ctxPrive,
  );
  assert.deepEqual(
    techInPrive,
    { ok: false, reden: 'niet-toegestaan-in-ruimte' },
    'Технічний віджет не може бути покладений на полотно особистого простору',
  );

  // Живі віджети та розблокований розділ social
  assert.equal(werkbladWidget('github')?.stand, 'klaar', 'Віджет github на Werkblad має мати стан klaar');
  assert.equal(werkbladToegestaan('github', { ruimte: 'prive' }), true, 'Віджет github має бути дозволеним у просторі prive');
  assert.ok(Boolean(bureauWidget('github-activiteit')?.bron), 'Віджет github-activiteit має містити маршрут джерела даних');
  assert.ok(Boolean(bureauWidget('ai-toegang')?.bron), 'Віджет ai-toegang має містити маршрут джерела даних');
  assert.equal(plaatsbaar('github-activiteit'), true, 'Віджет github-activiteit у Бюро має бути придатним до розміщення');
  assert.equal(plaatsbaar('ai-toegang'), true, 'Віджет ai-toegang у Бюро має бути придатним до розміщення');
  assert.notEqual(DIENST_DEF.social.planned, true, 'Розділ social у DIENST_DEF має бути розблокований (planned !== true)');
  assert.equal(registerItem('svc:social')?.beschikbaarheid, 'ready', 'Ярлик svc:social у WERKBLAD_REGISTER має мати стан ready');
});

test('L3-C13: Простори tech-ruimtes-v2, тіньова звірка tech-ruimtes-v2-schaduw та ruimtes-scheiding працюють одночасно без ручного process.env', async () => {
  const origEnv = process.env.TECH_RUIMTES_V2_SCHADUW;
  delete process.env.TECH_RUIMTES_V2_SCHADUW;

  const { pg, vlaggen, techRuimtes, ruimteSessie } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const uid = randomUUID();
  const email = `ruimte-l3c13-${uid.slice(0, 8)}@example.invalid`;
  await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
    'users',
    uid,
    { email, role: 'user', status: 'approved', name: 'Перевірка просторів' },
  ]);

  try {
    const kernBron = lees('backend/tech-ruimtes-kern.ts');
    assert.ok(
      !kernBron.includes('process.env.TECH_RUIMTES_V2_SCHADUW'),
      'Тіньова звірка в backend/tech-ruimtes-kern.ts має керуватися виключно прапорцем tech-ruimtes-v2-schaduw без ручної змінної process.env.TECH_RUIMTES_V2_SCHADUW',
    );

    vlaggen.vlagGeheugenLeeg();
    techRuimtes._vlagCacheLeeg();
    ruimteSessie._scheidingCacheLeeg();

    const v2Actief = await techRuimtes.v2Aan(uid);
    const schaduwActief = await techRuimtes.schaduwAan(uid);
    const scheidingActief = await ruimteSessie.scheidingAan(uid);

    assert.equal(v2Actief, true, 'Після консолідації прапорець tech-ruimtes-v2 має бути увімкнений');
    assert.equal(schaduwActief, true, 'Прапорець tech-ruimtes-v2-schaduw має працювати з бази даних без process.env');
    assert.equal(scheidingActief, true, 'Прапорець ruimtes-scheiding має бути одночасно активним');
  } finally {
    if (origEnv !== undefined) process.env.TECH_RUIMTES_V2_SCHADUW = origEnv;
    await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [uid]).catch(() => undefined);
    techRuimtes._vlagCacheLeeg();
    ruimteSessie._scheidingCacheLeeg();
  }
});

test('L3-C14: Хмарна екосистема cloud-vnext, Центр підключень, Каталог інтеграцій, CLOUD_M4..M11 та служба Фото узгоджені без ручних змінних', async () => {
  const stagingVars = [
    'CLOUD_M4_CONNECTIONS_STAGING',
    'CLOUD_M5_CATALOGUE_STAGING',
    'CLOUD_M6_ADMIN_STAGING',
    'CLOUD_M8_DIRECTORY_STAGING',
    'CLOUD_M10_ADMIN_STAGING',
    'CLOUD_M10_STAGING_RUNTIME',
    'CLOUD_M11_PREVIEW_STAGING',
  ] as const;
  const bewaard = new Map<string, string | undefined>();
  for (const k of stagingVars) {
    bewaard.set(k, process.env[k]);
    delete process.env[k];
  }

  try {
    for (const id of ['onedrive', 'dropbox', 'box']) {
      const aanbieder = CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === id);
      assert.ok(aanbieder, `Постачальник ${id} має бути присутній у CLOUD_VNEXT_AANBIEDERS`);
      const vereist = aanbieder.vereist ?? [];
      assert.ok(
        !vereist.some((v) => v.includes('_STAGING')),
        `Постачальник ${id} не повинен вимагати ручних змінних CLOUD_M*_STAGING у полі vereist: ${vereist.join(', ')}`,
      );
    }

    for (const webdavId of ['nextcloud', 'nas-webdav']) {
      const aanbieder = CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === webdavId);
      assert.ok(aanbieder && aanbieder.stand !== 'gepland', `Постачальник ${webdavId} має бути переведений зі стану gepland у робочий режим HTTPS WebDAV`);
    }

    assert.ok(
      bronDef('google-drive')?.toegang.includes('live'),
      'Джерело google-drive у службі Фото (shared/foto-model.ts) має підтримувати живий режим доступу live',
    );

    const { cloudM5 } = await laadServerBundel();
    const m5 = cloudM5.createM5ProviderCatalogueRoutes(async () => ({
      service: 'cloud',
      user: { id: 'u-cloud-l3c14', status: 'approved' },
    }));
    const r = await m5['POST /api/owner/cloud/integrations/v1/catalogue'][0]({ event: {}, body: {} });
    assert.notEqual(
      r.statusCode,
      404,
      'Маршрут каталогу постачальників M5 за увімкненого прапорця у БД не повинен повертати 404 CLOUD_M5_NOT_RELEASED без process.env',
    );
  } finally {
    for (const [k, v] of bewaard) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('L3-C15: Сім системних палітр, вісім акцентних відтінків, staat-kleuren.css та mobiel-breedte-veilig-v1 сумісні у світлій і темній темах', async () => {
  assert.ok(
    existsSync(resolve(process.cwd(), 'src/thema/staat-kleuren.css')),
    'Єдиний шар кольорів станів src/thema/staat-kleuren.css має існувати у сховищі',
  );

  const { pg } = await laadServerBundel();
  const pool = pg.getPool('systeem');
  const mobielRij = (
    await pool.query("SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'mobiel-breedte-veilig-v1'")
  ).rows[0] as { aan?: boolean; standaard?: boolean } | undefined;
  assert.equal(mobielRij?.aan, true, 'Прапорець mobiel-breedte-veilig-v1 у БД має мати aan = true');
  assert.equal(mobielRij?.standaard, true, 'Прапорець mobiel-breedte-veilig-v1 у БД має мати standaard = true');

  const mobielCss = lees('src/ontwerp/mobiel.css');
  assert.ok(
    mobielCss.includes(':not([data-mobiel-breedte-veilig])'),
    'Таблиця стилів src/ontwerp/mobiel.css має обмежувати важкий каскад селектором :not([data-mobiel-breedte-veilig])',
  );

  const contrastScript = await laadMjsScript<{
    controleer: () => Promise<{ fouten: string[]; paren: unknown[]; vlakken: number }>;
    contrast: (a: string, b: string) => number;
  }>('scripts/kleur-contrast-controle.mjs');
  const { fouten, paren } = await contrastScript.controleer();
  assert.equal(fouten.length, 0, `Усі системні палітри мають проходити перевірку контрасту WCAG без порушень: ${fouten.slice(0, 5).join('; ')}`);
  assert.ok(paren.length > 100, 'Перевірка контрасту має охоплювати понад 100 колірних пар');

  zorgWindowGebeurtenissen();
  const voorkeurenMod = await import('../../src/accountmenu-v3/accountmenu-v3-voorkeuren');
  assert.equal(voorkeurenMod.ACCOUNTMENU_V3_SYSTEEM_PALETTEN.length, 7, 'Має бути рівно 7 системних палітр');
  assert.equal(voorkeurenMod.ACCOUNTMENU_V3_VASTE_TINTEN.length, 8, 'Має бути рівно 8 фіксованих акцентних відтінків');
  for (const tint of voorkeurenMod.ACCOUNTMENU_V3_VASTE_TINTEN) {
    const w = voorkeurenMod.vasteTintWaarden(tint);
    assert.ok(contrastScript.contrast(w.licht.text, w.licht.bg) >= 4.5, `Світлий відтінок ${tint} має тримати контраст тексту ≥ 4.5`);
    assert.ok(contrastScript.contrast(w.donker.text, w.donker.bg) >= 4.5, `Темний відтінок ${tint} має тримати контраст тексту ≥ 4.5`);
  }
});

test('L3-C16: Реєстри навігації MENU_PAGINAS, MENU_CATALOG, DIENST_DEF, canonical-service.js та TAB_SLUG повністю синхронізовані', async () => {
  const slugMatch = /const TAB_SLUG=(\{[^}]*\})/.exec(ROUTER_BRON);
  const aliasMatch = /const LEGACY_ALIAS=(\{[^}]*\})/.exec(ROUTER_BRON);
  const tabsMatch = /const tabs=(\{[\s\S]*?\});\s*const isService=/.exec(ROUTER_BRON);
  assert.ok(slugMatch && aliasMatch && tabsMatch, 'У public/canonical-service.js мають бути присутні TAB_SLUG, LEGACY_ALIAS та tabs');

  const routerSlugs = new Function(`return ${slugMatch[1]}`)() as Record<string, string>;
  const routerAliassen = new Function(`return ${aliasMatch[1]}`)() as Record<string, string>;
  const routerTabs = new Function(`return ${tabsMatch[1]}`)() as Record<string, string[]>;

  assert.deepEqual(TAB_SLUG, routerSlugs, 'TAB_SLUG у shared/melding-link.ts має точно збігатися з public/canonical-service.js');
  assert.deepEqual(LEGACY_ALIAS, routerAliassen, 'LEGACY_ALIAS у shared/melding-link.ts має точно збігатися з public/canonical-service.js');

  for (const d of LINK_DIENSTEN) {
    assert.deepEqual(
      [...(MENU_PAGINAS[d] || [])],
      routerTabs[d] || [],
      `Перелік вкладок служби ${d} у MENU_PAGINAS має збігатися з tabs.${d} у public/canonical-service.js`,
    );
  }

  zorgWindowGebeurtenissen();
  const menuVoork = await import('../../src/menu-voorkeuren');
  for (const item of menuVoork.MENU_CATALOG) {
    assert.ok((DIENST_IDS as readonly string[]).includes(item.id), `Елемент MENU_CATALOG ${item.id} має входити до DIENST_IDS`);
    const def = DIENST_DEF[item.id as keyof typeof DIENST_DEF];
    assert.ok(def, `Елемент ${item.id} має мати визначення у DIENST_DEF`);
    assert.equal(item.uk, def.titel.uk, `Українська назва служби ${item.id} має збігатися між MENU_CATALOG і DIENST_DEF`);
    assert.equal(item.nl, def.titel.nl, `Нідерландська назва служби ${item.id} має збігатися між MENU_CATALOG і DIENST_DEF`);
    assert.equal(Boolean(item.planned), Boolean(def.planned), `Прапорець planned для ${item.id} має бути однаковим у MENU_CATALOG і DIENST_DEF`);
  }
  assert.ok(WERKBLAD_REGISTER.length > 50, 'Реєстр ярликів та віджетів робочого столу WERKBLAD_REGISTER має бути наповненим');
});

// ============================================================================
// 3.3. Наскрізна матриця маршрутизації shared/melding-link.ts та глибоких переходів (L3-C17 .. L3-C30)
// ============================================================================

test('L3-C17: Маршрутизація melding-link для сповіщень екосистеми Плющ (klimop.*) веде на https://mcp.tarasevych.com/agents#orch', () => {
  assert.equal(dienstVoorSoort('klimop.spiegel'), 'mcp', 'Події klimop.* мають прив’язуватися до служби mcp');
  assert.equal(dienstVoorSoort('klimop.sleutel.rotatie'), 'mcp', 'Події ротації часток klimop.* мають прив’язуватися до служби mcp');
  const doel = routeerMeldingLink('#orch', { soort: 'klimop.spiegel' });
  assert.equal(doel, `https://${SERVICE_HOSTS.mcp}/agents#orch`, 'Якір #orch для події klimop.* має розгортатися у вкладку /agents#orch');
  assert.ok(isGeldigeSitePagina(doel), `Маршрут ${doel} має відкриватися без 404 у canonical-service.js`);
});

test('L3-C18: Маршрутизація melding-link для сповіщень картотеки узгодження (afstemming.*) веде на піддомен api.tarasevych.com', () => {
  assert.equal(dienstVoorSoort('afstemming.conflict'), 'api', 'Події afstemming.* мають прив’язуватися до служби api');
  const doelPad = routeerMeldingLink('/afstemming', { soort: 'afstemming.conflict' });
  const doelWortel = routeerMeldingLink('/', { soort: 'afstemming.kaart' });
  assert.ok(doelPad.startsWith(`https://${SERVICE_HOSTS.api}/`), `Очікується перехід на піддомен api, отримано: ${doelPad}`);
  assert.ok(doelWortel.startsWith(`https://${SERVICE_HOSTS.api}/`), `Корінь сповіщення afstemming.* має вести на api, отримано: ${doelWortel}`);
  assert.ok(isGeldigeSitePagina(doelPad) && isGeldigeSitePagina(doelWortel), 'Обидві адреси afstemming.* мають бути дійсними сторінками');
});

test('L3-C19: Маршрутизація melding-link для сповіщень Стріму пам’яті та естафети задач (geheugen.*) веде на дійсну сторінку агентів або ШІ', () => {
  const dienst = dienstVoorSoort('geheugen.taak');
  assert.ok(dienst === 'mcp' || dienst === 'ai', `Події geheugen.* мають належати службі mcp або ai, отримано: ${String(dienst)}`);
  const doel = routeerMeldingLink('/agents', { soort: 'geheugen.taak' });
  assert.ok(
    doel.startsWith(`https://${SERVICE_HOSTS.mcp}/`) || doel.startsWith(`https://${SERVICE_HOSTS.ai}/`),
    `Перехід для geheugen.taak має вести на mcp.* або ai.*, отримано: ${doel}`,
  );
  assert.ok(isGeldigeSitePagina(doel), `Маршрут ${doel} має відкривати дійсну вкладку без 404`);
});

test('L3-C20: Маршрутизація melding-link для сповіщень Розумного будинку (huis.*) веде на https://huis.tarasevych.com/...', () => {
  assert.equal(dienstVoorSoort('huis.beveiliging'), 'huis', 'Події huis.* мають прив’язуватися до служби huis');
  for (const pad of ['/beveiliging', '/kamers', '/automatiseringen']) {
    const doel = routeerMeldingLink(pad, { soort: 'huis.beveiliging' });
    assert.equal(doel, `https://${SERVICE_HOSTS.huis}${pad}`, `Шлях ${pad} для huis.* має вести точно на піддомен huis`);
    assert.ok(isGeldigeSitePagina(doel), `Адреса ${doel} має бути дійсною сторінкою Розумного будинку`);
  }
});

test('L3-C21: Маршрутизація melding-link для сповіщень служби Фото (foto.*) веде на дійсну вкладку світлин у Моєму просторі', () => {
  const fotoDienst = dienstVoorSoort('foto.import');
  assert.ok(fotoDienst === 'cloud' || fotoDienst === 'hub', `Події foto.* мають прив’язуватися до служби cloud або hub, отримано: ${String(fotoDienst)}`);
  for (const pad of ['/fotos', '/photos']) {
    const doel = routeerMeldingLink(pad, { soort: 'foto.import' });
    assert.ok(
      doel.startsWith(`https://${SERVICE_HOSTS.cloud}/`) || doel.startsWith(`https://${SERVICE_HOSTS.hub}/`),
      `Шлях ${pad} для foto.* має вести на піддомен cloud або hub, отримано: ${doel}`,
    );
    assert.ok(isGeldigeSitePagina(doel), `Адреса ${doel} має відкриватися маршрутизатором без 404`);
  }
});

test('L3-C22: Маршрутизація melding-link для сповіщень служби взаємин із клієнтами (klant.* / owner.klantrelatie.*) веде на дійсну сторінку клієнтів', () => {
  const klantCodes = Object.keys(ACTIE_LABELS).filter((k) => k.startsWith('klant.') || k.startsWith('owner.klantrelatie.'));
  const kandidaatSoort = klantCodes[0] ?? 'owner.klantrelatie.klant';
  const actieveSoort = dienstVoorSoort(kandidaatSoort) !== undefined ? kandidaatSoort : 'klant.aangemaakt';
  const dienst: string | undefined = dienstVoorSoort(actieveSoort);
  assert.ok(
    dienst === 'crm' || dienst === 'hub',
    `Події служби клієнтів (${kandidaatSoort} / klant.*) мають прив’язуватися функцією dienstVoorSoort до служби crm або hub, отримано: ${String(dienst)}`,
  );
  const crmHost = (SERVICE_HOSTS as Record<string, string>).crm || 'crm.tarasevych.com';
  const doel = routeerMeldingLink('/', { soort: actieveSoort });
  assert.ok(
    doel.startsWith(`https://${crmHost}/`) || doel.startsWith(`https://${SERVICE_HOSTS.hub}/`),
    `Сповіщення ${actieveSoort} має вести на піддомен crm або hub, отримано: ${doel}`,
  );
  assert.ok(isGeldigeSitePagina(doel), `Сповіщення ${actieveSoort} має вести на дійсну https-сторінку без 404, отримано: ${doel}`);
});

test('L3-C23: Маршрутизація melding-link для подій Пошти (mail.*) безпомилково перетворює відносні та застарілі шляхи на mail.tarasevych.com', () => {
  assert.equal(dienstVoorSoort('mail.bericht'), 'mail');
  assert.equal(routeerMeldingLink('/mail'), `https://${SERVICE_HOSTS.mail}/`);
  assert.equal(routeerMeldingLink('/postvak-in', { soort: 'mail.nieuw' }), `https://${SERVICE_HOSTS.mail}/postvak-in`);
  assert.equal(routeerMeldingLink('/contacten', { soort: 'mail.contact' }), `https://${SERVICE_HOSTS.mail}/contacten`);
  assert.ok(isGeldigeSitePagina(`https://${SERVICE_HOSTS.mail}/postvak-in`));
});

test('L3-C24: Маршрутизація melding-link для Хмарного сховища (cloud.*) веде шляхи файлів і спільних посилань /gedeeld/<код> на cloud.tarasevych.com', () => {
  assert.equal(dienstVoorSoort('cloud.deel'), 'cloud');
  assert.equal(routeerMeldingLink('/cloud'), `https://${SERVICE_HOSTS.cloud}/`);
  const deelHref = routeerMeldingLink('/gedeeld/abc123def456ghi789', { soort: 'cloud.deel' });
  assert.equal(deelHref, `https://${SERVICE_HOSTS.cloud}/gedeeld/abc123def456ghi789`);
  assert.equal(padBestaat('cloud', '/gedeeld/abc123def456ghi789'), true, 'Публічне посилання /gedeeld/<код> має розпізнаватися padBestaat');
  assert.equal(routeerMeldingLink('/bestanden', { soort: 'cloud.bestand' }), `https://${SERVICE_HOSTS.cloud}/bestanden`);
});

test('L3-C25: Маршрутизація melding-link для подій Календаря (agenda.*) та Нотаток (notities.* і notitie.*) веде на hub.tarasevych.com', () => {
  assert.equal(dienstVoorSoort('agenda.afspraak'), 'hub', 'Події agenda.* мають належати службі hub');
  assert.equal(dienstVoorSoort('notities.bijgewerkt'), 'hub', 'Події notities.* мають належати службі hub');
  assert.equal(dienstVoorSoort('notitie.zoeken.te_zwaar'), 'hub', 'Події notitie.* мають належати службі hub');
  assert.equal(routeerMeldingLink('/agenda'), `https://${SERVICE_HOSTS.hub}/agenda`);
  assert.equal(routeerMeldingLink('/notities'), `https://${SERVICE_HOSTS.hub}/notities`);
});

test('L3-C26: Історичні шляхи OUDE_PADEN та синоніми LEGACY_ALIAS перетворюються на чинні адреси без пропуску небезпечних схем', () => {
  assert.equal(routeerMeldingLink('/aanmeldmethoden-beheer'), `https://${SERVICE_HOSTS.admin}/sso`);
  assert.equal(routeerMeldingLink('/diagnostiek'), `https://${SERVICE_HOSTS.admin}/diagnostiek`);
  assert.equal(routeerMeldingLink('/updates'), `https://${SERVICE_HOSTS.admin}/updates`);
  assert.equal(routeerMeldingLink(`https://${SERVICE_HOSTS.mcp}/#extensie`), `https://${SERVICE_HOSTS.mcp}/agents#extensie`);

  const opgelostConnections = echteRoute(`https://${SERVICE_HOSTS.api}/connections`);
  assert.equal(opgelostConnections.onbekend, false, 'Старий синонім /connections на api.* не повинен давати 404');
  assert.equal(opgelostConnections.tab, 'verbindingen', 'Синонім /connections має відкривати вкладку verbindingen');

  for (const gevaarlijk of ['javascript:alert(1)', 'data:text/html,<script>1</script>', '//evil.example/pad']) {
    const uit = routeerMeldingLink(gevaarlijk);
    assert.ok(!/^https:\/\/[a-z0-9-]+\.tarasevych\.com/i.test(uit), `Небезпечний рядок ${gevaarlijk} не може перетворюватися на довірену адресу сайту`);
  }
});

test('L3-C27: Усі виклики сповіщень meld, notify та siteMelding у всьому каталозі backend/ породжують виключно дійсні абсолютні адреси', () => {
  const MELDERS: Record<string, number> = { meld: 4, notify: 5, siteMelding: 3 };
  const gevonden: Array<{ plek: string; link: string }> = [];
  const onopgelost: string[] = [];

  const losWaardeOp = (node: ts.Node, sf: ts.SourceFile, consts: Map<string, ts.Node>, diepte = 0): string | undefined => {
    if (diepte > 4) return undefined;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isParenthesizedExpression(node)) return losWaardeOp(node.expression, sf, consts, diepte + 1);
    if (ts.isTemplateExpression(node)) {
      let s = node.head.text;
      for (const span of node.templateSpans) {
        const t = span.expression.getText(sf);
        const hostM = /^SERVICE_HOSTS\.(\w+)$/.exec(t);
        const deel = hostM
          ? ((SERVICE_HOSTS as Record<string, string>)[hostM[1]] ?? 'ONBEKENDE-HOST')
          : t === 'SITE_BASIS()'
            ? `https://${SERVICE_HOSTS.identity}`
            : t === 'SITE_MCP'
              ? `https://${SERVICE_HOSTS.mcp}`
              : (losWaardeOp(span.expression, sf, consts, diepte + 1) ?? 'x');
        s += deel + span.literal.text;
      }
      return s;
    }
    if (ts.isIdentifier(node) && consts.has(node.text)) return losWaardeOp(consts.get(node.text)!, sf, consts, diepte + 1);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && consts.has(node.expression.text)) {
      const fn = consts.get(node.expression.text)!;
      if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return losWaardeOp(fn.body, sf, consts, diepte + 1);
    }
    return undefined;
  };

  for (const pad of alleTsBestanden('backend')) {
    const src = lees(pad);
    if (!/\b(meld|notify|siteMelding)\(/.test(src)) continue;
    const sf = ts.createSourceFile(pad, src, ts.ScriptTarget.Latest, true);
    const eigenMelder = /type Melder = \(userId: string, email: string, kind: string, titel: string, tekst: string\)/.test(src);
    const consts = new Map<string, ts.Node>();
    const verzamel = (n: ts.Node) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) consts.set(n.name.text, n.initializer);
      ts.forEachChild(n, verzamel);
    };
    verzamel(sf);

    const bezoek = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text in MELDERS) {
        const idx = n.expression.text === 'meld' && eigenMelder ? 5 : MELDERS[n.expression.text];
        const arg = n.arguments[idx];
        const plek = `${pad}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
        const tekst = arg ? arg.getText(sf) : '';
        if (arg && !/\$\{link\}`$/.test(tekst) && !/^(link|l|pad|href)$/.test(tekst)) {
          const v = losWaardeOp(arg, sf, consts);
          if (v === undefined) onopgelost.push(`${plek}: ${tekst.slice(0, 80)}`);
          else gevonden.push({ plek, link: v });
        }
      }
      ts.forEachChild(n, bezoek);
    };
    bezoek(sf);

    const def = /async function siteMelding\([^)]*link = '([^']*)'\)[^{]*\{\s*await meld\([^;]*?, `([^`]*)\$\{link\}`\)/.exec(src);
    if (def) {
      const basis = def[2]
        .replace('${SITE_BASIS()}', `https://${SERVICE_HOSTS.identity}`)
        .replace(/\$\{SERVICE_HOSTS\.(\w+)\}/g, (_, k) => (SERVICE_HOSTS as Record<string, string>)[k]);
      gevonden.push({ plek: `${pad}:siteMelding(standaard)`, link: `${basis}${def[1]}` });
      for (const g of gevonden.filter((x) => x.plek.startsWith(pad) && x.link.startsWith('/'))) g.link = `${basis}${g.link}`;
    }
  }
  const tgBasis = `https://${SERVICE_HOSTS.identity}`;
  for (const g of gevonden) {
    if (g.link.startsWith('/') && /telegram-aanmelden|apparaat-bevestiging/.test(g.plek)) g.link = `${tgBasis}${g.link}`;
  }

  assert.ok(gevonden.length >= 40, `Очікується щонайменше 40 серверних посилань сповіщень у backend/, знайдено: ${gevonden.length}`);
  assert.equal(onopgelost.length, 0, `Нерозпізнані вирази посилань у backend/: ${onopgelost.slice(0, 5).join(' | ')}`);
  const relatief = gevonden.filter((g) => !/^https:\/\//.test(g.link));
  assert.equal(relatief.length, 0, `Сервер не має записувати відносні посилання: ${relatief.slice(0, 5).map((g) => `${g.plek}→${g.link}`).join(' | ')}`);
  const dood = gevonden.filter((g) => !isGeldigeSitePagina(g.link));
  assert.equal(dood.length, 0, `Виявлено биті маршрути 404 у сповіщеннях backend/: ${dood.slice(0, 5).map((g) => `${g.plek}→${g.link}`).join(' | ')}`);
});

test('L3-C28: Глибокі параметри переходів DIEPE_PARAMS зберігають ідентифікатори між службами без витоку секретів і керівних символів', () => {
  const mailRoute = diepeRoute({ host: 'mail', pad: 'inbox', params: { bericht: 'msg-42', bijlage: 'att-7' } }, 'bericht');
  assert.deepEqual(mailRoute, {
    host: 'mail',
    pad: 'inbox',
    params: { [DIEPE_PARAMS.bericht]: 'msg-42', [DIEPE_PARAMS.bijlage]: 'att-7' },
  });

  const taakRoute = diepeRoute({ host: 'hub', pad: 'tasks', params: { item: 'taak-99' } }, 'taak');
  assert.deepEqual(taakRoute, {
    host: 'mcp',
    pad: 'board',
    params: { [DIEPE_PARAMS.doel]: bordDoel('taak-99') },
  });

  const agendaRoute = diepeRoute(
    { host: 'cloud', pad: 'calendar', params: { afspraak: agendaItemId('primary', 'ev-123') } },
    'afspraak',
  );
  assert.deepEqual(agendaRoute, {
    host: 'hub',
    pad: 'calendar',
    params: { [DIEPE_PARAMS.afspraak]: 'google:primary:ev-123' },
  });

  const driveRoute = diepeRoute({ host: 'cloud', pad: 'accounts', params: { drive: 'drv-55' } }, 'bestand');
  assert.deepEqual(driveRoute, {
    host: 'cloud',
    pad: 'google',
    params: { [DIEPE_PARAMS.bestand]: 'drv-55' },
  });

  assert.equal(diepeWaarde('?open_item_id=notitie-uuid-1', DIEPE_PARAMS.item), 'notitie-uuid-1');
  assert.equal(diepeWaarde('?open_item_id=slecht%00teken', DIEPE_PARAMS.item), '', 'Нульовий байт має відсікатися у diepeWaarde');
  assert.equal(diepeWaarde('?open_item_id=met%20spatie', DIEPE_PARAMS.item), '', 'Пробіли не дозволені в ідентифікаторі diepeWaarde');
  assert.equal(diepeWaarde(`?open_item_id=${'x'.repeat(1101)}`, DIEPE_PARAMS.item), '', 'Наддовгі ідентифікатори (> 1100 знаків) мають відхилятися');

  const nepSleutel = nepGeheim('gh', 'p_', 'NepWaardeZonderLekInDiepeLink1234567890');
  const schoonPad = routeerMeldingLink('/notities?open_item_id=n-1', { soort: 'notities.bijgewerkt' });
  assert.ok(!schoonPad.includes(nepSleutel) && schoonPad.includes('open_item_id=n-1'), 'Безпечний параметр open_item_id зберігається під час маршрутизації');
});

test('L3-C29: Реєстр пояснень сповіщень v2/v3, живий каталог MELDINGEN-REGISTER-001 і тлумач екосистеми взаємоузгоджені для всіх подій', () => {
  const maakMelding = (soort: string, link?: string): V2Melding =>
    ({ id: 'm-1', dienst: 'site', soort, categorie: soort, titel: 'Перевірка', tijd: 0, link }) as unknown as V2Melding;

  const gebrokenRegels: string[] = [];
  for (const r of UITLEG_REGISTER) {
    const m = maakMelding(r.id);
    const doelen = [r.deeplink(m), ...r.acties.map((a) => a.href?.(m)).filter((x): x is string => Boolean(x))];
    for (const d of doelen) {
      if (!isGeldigeSitePagina(d)) gebrokenRegels.push(`${r.id} -> ${d}`);
    }
  }
  assert.equal(gebrokenRegels.length, 0, `Усі посилання deeplink у реєстрі пояснень мають вести на дійсні сторінки: ${gebrokenRegels.join('; ')}`);

  const overzicht = bouwMeldingRegisterOverzicht();
  assert.ok(overzicht.statistiek.totaal >= 500, 'Живий реєстр сповіщень має містити щонайменше 500 класифікованих записів');
  assert.equal(overzicht.statistiek.onbekendOverig, 0, 'Жоден запис у реєстрі сповіщень не може потрапляти у звалище overig');
  assert.ok(
    Object.keys(ACTIE_LABELS).every((code) => categorieVan(code) !== 'overig'),
    'Кожен код дії в ACTIE_LABELS повинен мати чітку предметну категорію',
  );

  const vertolkt = interpreteerGebeurtenis({ bron: 'agenda', soort: 'agenda', titel: 'Зустріч', link: '/agenda' });
  assert.equal(vertolkt.meta.link, `https://${SERVICE_HOSTS.hub}/agenda`, 'Тлумач екосистеми має нормалізувати відносний шлях через melding-link');
});

test('L3-C30: Головний клієнтський маршрутизатор src/VerenigdDienstApp.tsx розгорнуто у багаторядкові блоки та підключено social і клієнтів', async () => {
  const bron = lees('src/VerenigdDienstApp.tsx');
  const regels = bron.split('\n');

  assert.ok(
    regels.length > 120,
    `Файл src/VerenigdDienstApp.tsx має бути розгорнутий у читабельні багаторядкові блоки (> 120 рядків), наразі рядків: ${regels.length}`,
  );
  assert.ok(
    bron.includes('social') && existsSync(resolve(process.cwd(), 'src/social')),
    'Маршрутизатор VerenigdDienstApp.tsx має підключати прикладний розділ соціальних мереж (src/social/)',
  );
  assert.ok(
    (bron.includes('klant') || bron.includes('Klant')) && existsSync(resolve(process.cwd(), 'src/klantrelatiebeheer')),
    'Маршрутизатор VerenigdDienstApp.tsx має підключати службу взаємин із клієнтами (src/klantrelatiebeheer/)',
  );

  // Додаткова перевірка динамічного завантаження прикладної сторінки social, коли вона створена
  zorgWindowGebeurtenissen();
  const socialBestanden = alleTsBestanden('src/social');
  if (socialBestanden.length > 0) {
    const geladen = await laadProjectModule(socialBestanden[0]);
    assert.ok(geladen !== null, 'Модуль розділу social має успішно складатися та імпортуватися через esbuild');
  }
});

export async function main(): Promise<number> {
  try {
    return await basisMain();
  } finally {
    if (serverBundelBelofte) {
      const sb = await serverBundelBelofte.catch(() => null);
      if (sb && aangemaakteEigenaarId) {
        const pool = sb.pg.getPool('systeem');
        await pool.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = $1', [aangemaakteEigenaarId]).catch(() => undefined);
        await pool.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [aangemaakteEigenaarId]).catch(() => undefined);
        await pool.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [aangemaakteEigenaarId]).catch(() => undefined);
        await pool
          .query(
            "DELETE FROM app.records WHERE (tbl = 'users' AND id = $1) OR data->>'ownerUserId' = $1 OR data->>'userId' = $1 OR data->>'recipientUserId' = $1",
            [aangemaakteEigenaarId],
          )
          .catch(() => undefined);
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
