// Рівень 2 наскрізних випробувань консолідованого оновлення (CONSOLIDATIE-001):
// Межові, хибні та змагально-безпекові стани ядра платформи «Мій простір» (Mijn Ruimte).
// Tweede laag van de consolidatietests: grensgevallen, ongeldige invoer en beveiligingscontracten.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import http from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import type pg from 'pg';

import { nodeTestSuite } from './hulp/node-test-main.ts';
import { nepGeheim } from './hulp/nep-geheim.ts';
import { nepBrowser } from './hulp/nep-browser.ts';
import { contrast as wcagContrast, luminantie, ACHTERGROND } from './hulp/kleur.ts';
import { taalFouten } from './hulp/taalcontrole.ts';
import { routesMetStapOp, onopgelosteSjablonen } from './hulp/stap-op-routes.ts';

import {
  SLEUTELKLUIS_REGISTER,
  SLEUTEL_GESLOTEN_CODE,
  isDekEnvelop,
  omslagAad,
  type KluisStand,
} from '../../shared/sleutelkluis.ts';
import { API_PLATFORM_CAPABILITIES, apiPlatformContractPayload } from '../../src/api-platform-contract.ts';
import { KlimopFout, klimopCodeTekst, type KlimopSpiegelLogboekOverzicht } from '../../shared/klimop-overzicht-model.ts';
import { KLIMOP_ELF_DIENSTEN } from '../../shared/klimop/diensten-catalogus.ts';
import { actieVoorPad } from '../../shared/stap-op-acties.ts';
import { beschrijfStapOp } from '../../shared/stap-op-beschrijving.ts';
import { VLAG_UITLEG, evalueer, vlagFout, type Uitkomst, type Vlag } from '../../shared/vlaggen.ts';
import {
  CALDAV_MAX_WAARDEN,
  caldavAbsoluut,
  caldavWaarden,
  veiligCaldavAdres,
} from '../../shared/agenda-caldav-model.ts';
import { CLOUD_VNEXT_AANBIEDERS } from '../../shared/cloud-vnext-model.ts';
import {
  MAIL_IMAP_AANBIEDERS,
  MAIL_IMAP_GEHEIME_VELDEN,
  geldigMailAdres,
  mailAanbieder,
  mailAanbiederVolledig,
  schoonAppWachtwoord,
} from '../../shared/mail-aanbieders.ts';
import { MERK_EIGEN_MAX_BYTES, cssLaadtIets, ontsmetSvg } from '../../shared/merk-eigen.ts';
import { mediaSoort, mimeVoor, schoneTekst } from '../../shared/foto-model.ts';
import { VN_MAX_INHOUD, type NotitieInvoer } from '../../shared/notities-vnext-model.ts';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem.ts';
import type { LadeBesluit } from '../../shared/ruimte-scheiding.ts';
import type { AiRuimte } from '../../shared/ai-ruimte.ts';

const { test, main: basisMain } = nodeTestSuite();

mkdirSync(resolve('rapporten'), { recursive: true });
const dynMap = mkdtempSync(join(resolve('rapporten'), 'dyn-l2-'));
process.once('exit', () => {
  try {
    rmSync(dynMap, { recursive: true, force: true });
  } catch {
    /* тимчасова тека вже прибрана */
  }
});

// ============================================================================
// Типізований контракт серверних модулів ядра (спільний граф пам'яті в esbuild)
// ============================================================================

interface RouterResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  filePath?: string;
}

interface LambdaEvent {
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: false;
  rawPath: string;
  rawQueryString: string;
  queryStringParameters: Record<string, string>;
  requestContext: { http: { method: string; path: string; sourceIp: string; userAgent: string } };
}

interface RouterContext {
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
  event: LambdaEvent;
}

type RouterMiddleware = (ctx: RouterContext) => Promise<RouterResponse | void> | RouterResponse | void;
type RouterRoutes = Record<string, RouterMiddleware[]>;
type RouterHandler = ((event: LambdaEvent) => Promise<RouterResponse>) & { patronen: string[] };
type JsonWeigering = { patroon: string; headers: Record<string, string> | undefined; ip: string };

interface KernBundel {
  pg: {
    appRolActief: () => boolean;
    closePool: () => Promise<void>;
    getPool: (soort?: 'systeem' | 'app' | 'migratie') => pg.Pool;
    pgTijdslimieten: () => { statement_timeout?: number; idle_in_transaction_session_timeout?: number };
  };
  dbMod: {
    db: {
      add: (tbl: string, items: Array<Record<string, unknown>>) => Promise<string[]>;
    };
  };
  context: {
    metVerzoek: <T>(route: string, fn: () => Promise<T> | T) => Promise<T>;
    zetGebruiker: (actor: string, dienst?: string, tab?: string, sessieId?: string) => void;
    sessieGeverifieerd: () => void;
  };
  routerMod: {
    isCanoniekPad: (p: string) => boolean;
    alleenJsonAfwijzing: (m: string, h: Record<string, string> | undefined, b: string | undefined) => boolean;
    registreerJsonWeigeringMelder: (fn: ((w: JsonWeigering) => void) | null) => void;
    nulUitWaarden: (w: unknown) => boolean;
    bevatNul: (w: unknown) => boolean;
    router: (routes: RouterRoutes) => RouterHandler;
    json: (data: unknown, status?: number) => RouterResponse;
    error: (msg: string, status?: number) => RouterResponse;
  };
  startMod: {
    clientIp: (req: http.IncomingMessage) => string;
    createServer: () => http.Server;
  };
  rbac: {
    SCHRIJFWACHT: symbol;
    _rbacWeigeringenLeeg: () => void;
    can: (u: Record<string, unknown> | null | undefined, p: string) => boolean;
    canDestroyOwner: () => boolean;
    canManageRole: (a: Record<string, unknown>, doelRol: 'owner' | 'admin' | 'member' | 'viewer') => boolean;
    denyPending: (u: Record<string, unknown>, write: boolean) => RouterResponse | undefined;
    denyMutation: (u: Record<string, unknown>, p: string) => RouterResponse | undefined;
    metSchrijfwacht: (
      routes: Record<string, RouterMiddleware[]>,
      authorize: (e: Record<string, unknown>, b: unknown) => Promise<unknown>,
      perm: string,
      zonderSchrijfrecht: ReadonlySet<string>,
    ) => RouterRoutes;
    rbacWeigeringVastleggen: (
      w: { userId: string; route?: string; recht?: string; reden: string },
      nu?: number,
    ) => Promise<boolean>;
    rejectForeignOwnerUserId: (u: Record<string, unknown>, body: unknown) => RouterResponse | undefined;
  };
  ruimteSessie: {
    _scheidingCacheLeeg: () => void;
    bindingBeschikbaar: () => boolean;
    bindingWaarde: (siteSessieId: string, ruimteSessieId: string, generatie: number) => string | null;
    bindingKlopt: (
      opgeslagen: string | null | undefined,
      siteSessieId: string,
      ruimteSessieId: string,
      generatie: number,
    ) => boolean;
    ruimteVanSessie: () => Promise<'prive' | 'technisch'>;
    installeerRuimteKoppen: () => void;
  };
  ruimteScheiding: {
    RuimteFout: new (code: string, status?: number) => Error & { code: string; status: number };
    keuzeZetten: (
      userId: string,
      ruw: unknown,
      doorId: string,
    ) => Promise<{ keuze: { keuze: string }; standen: Array<{ dienst: string; stand: string }> }>;
    gegevensRuimteVeilig: (
      userId: string,
      herkomst?: { tabContext?: string | null; aiRuimte?: AiRuimte | null },
    ) => Promise<AiRuimte>;
    gegevensLade: (v: { userId: string; tabContext?: string | null; dienst: unknown }) => Promise<LadeBesluit>;
  };
  techProfiel: {
    TechFout: new (code: string, status?: number) => Error & { code: string; status: number };
    profielVan: (u: {
      id: string;
      email?: string;
      role?: string;
      status?: string;
    }) => Promise<{ profielId: string; rollen: string[]; ingetrokkenOp: number | null } | null>;
    activeren: (
      u: { id: string; email?: string; role?: string; status?: string },
      tab: string,
      minuten: number,
      reden: string,
    ) => Promise<unknown>;
    toekennen: (
      door: { id: string; email?: string; role?: string; status?: string },
      tab: string,
      invoer: { email: string; rollen: string[]; maxMinuten: number },
    ) => Promise<unknown>;
    beeindigen: (u: { id: string }, tab: string) => Promise<unknown>;
  };
  techRuimtes: {
    starten: (
      u: { id: string; email?: string; role?: string; status?: string },
      s: { id: string; createdAt: number },
      tab: string,
      modusIn: unknown,
      minutenIn: unknown,
      redenIn: unknown,
    ) => Promise<unknown>;
  };
  sleutelkluis: {
    SleutelkluisFout: new (code: string, status?: number) => Error & { code: string; status: number };
    verzegelMetDek: (dek: Buffer, plaintext: string, aad: string) => string;
    ontzegelMetDek: (dek: Buffer, envelop: string, aad: string) => string;
    omslaan: (kek: Buffer, dek: Buffer, aad: string) => string;
    omslagOpenen: (kek: Buffer, envelop: string, aad: string) => Buffer;
    inschakelen: (
      lade: { userId: string; ruimte: AiRuimte },
      houder: { soort: 'sessie' | 'grant' | 'intern'; id: string },
    ) => Promise<{ herstelcode: string }>;
    sleutelOpen: (lade: { userId: string; ruimte: AiRuimte }) => Buffer | null;
    sleutelSluitenVoorHouder: (soort: 'sessie' | 'grant' | 'intern', id: string) => number;
    sleutelVergrendelenVoorGebruiker: (userId: string) => void;
    kluisStand: (lade: { userId: string; ruimte: AiRuimte }) => Promise<KluisStand>;
    standCacheLeeg: (lade?: { userId: string; ruimte: AiRuimte }) => void;
  };
  voorcontrole: {
    SQL_RISICO: Array<[RegExp, string, string]>;
  };
  apiTokens: {
    API_MACHINE_TOKEN_TABLE: string;
    API_PAT_FORBIDDEN_SCOPES: readonly string[];
    createApiPlatformRoutes: (deps: {
      requireSession: (
        event: Record<string, unknown>,
        body: unknown,
      ) => Promise<{ errorCode: string } | { user: { id: string; email: string; role: string; status: string }; service: string }>;
      respond: (data: unknown, status?: number) => RouterResponse;
      fail: (message: string, status?: number) => RouterResponse;
      audit: () => Promise<unknown>;
      body: (b: unknown) => Record<string, unknown>;
    }) => RouterRoutes;
    resolveApiMachineToken: (
      event: Record<string, unknown>,
      query?: Record<string, string>,
    ) => Promise<{ errorCode: string; status: number } | { token: { id: string; scopes: string[] } }>;
  };
  klimopOpslag: {
    schakelKlimopDienstOverdracht: (raw: unknown, opties?: { staatMap?: string }) => unknown;
    leesKlimopSpiegelLogboek: (opties?: { staatMap?: string }) => KlimopSpiegelLogboekOverzicht;
  };
  stapOpNood: {
    stapOpUitKaart: (
      nu?: number,
      env?: Record<string, string | undefined>,
    ) => { uit: boolean; ernst: '' | 'rood' | 'oranje'; tekst: [string, string] };
    stapOpUitMelden: (
      nu: number,
      env: Record<string, string | undefined>,
      deps: {
        log?: (r: string) => void;
        audit?: (i: { actie: string; reden: string; na: Record<string, unknown> }) => Promise<unknown>;
        eigenaarId?: () => Promise<string>;
        melden?: (userId: string, titel: string, tekst: string) => Promise<unknown>;
      },
    ) => Promise<'' | 'rood' | 'oranje'>;
  };
  vlaggenBeheer: {
    vlagGeheugenLeeg: () => void;
    berekenen: (u: { id: string; email?: string; role?: string; status?: string }, sleutels?: unknown) => Promise<Uitkomst[]>;
    beheerLijst: (u: { id: string; email?: string; role?: string; status?: string }, tab: string) => Promise<unknown>;
    flagsRoutes: (
      requireSession: (
        e: Record<string, unknown>,
        b: unknown,
      ) => Promise<{ user: { id: string; email?: string; role?: string; status?: string }; service: string }>,
    ) => RouterRoutes;
  };
  veiligeFetch: {
    privateAddress: (v: string) => boolean;
    pinnedFetch: (url: string) => Promise<Response>;
    pinnedStream: (url: string) => Promise<unknown>;
  };
  cloudM4: {
    createM4CloudRoutes: (authorize: () => Promise<{ service: string; user: { id: string; email: string; status: string } }>) => RouterRoutes;
  };
  cloudM6: {
    createCloudM6AdminRoutes: (
      authorize: () => Promise<{ service: string; user: { id: string; email?: string; status: string; role?: string } }>,
    ) => RouterRoutes;
  };
  cloudM8: {
    createM8CloudRoutes: (
      authorize: () => Promise<{ service: string; user: { id: string; status: string } }>,
      runtime?: unknown,
    ) => RouterRoutes;
  };
  cloudM10: {
    createM10CloudAdminRoutes: (
      authorize: () => Promise<{ service: string; user: { id: string; email?: string; status: string; role?: string } }>,
      stepUp: () => Promise<null>,
    ) => RouterRoutes;
  };
  mailImap: {
    mailImapAad: (userId: string, id: string, ruimte?: AiRuimte) => string;
    mailAanbiedersVoorPagina: () => Array<Record<string, unknown>>;
    createMailImapRoutes: (
      authorize: () => Promise<{ service: string; user: { id: string; status: string; email?: string } }>,
    ) => RouterRoutes;
  };
  tgCrypto: {
    gelijk: (a: string | Buffer, b: string | Buffer) => boolean;
    widgetControle: (
      velden: Record<string, unknown>,
      botToken: string,
      nuSec?: number,
    ) => { ok: boolean; vers: boolean; reden: string };
    initDataControle: (
      initData: string,
      botToken: string,
      nuSec?: number,
    ) => { ok: boolean; vers: boolean; reden: string };
    knopSleutel: (webhookGeheim: string) => Buffer;
    knopTekenen: (sleutel: Buffer, letter: 'b' | 'n' | 'i', id: string, telegramId: string, verlooptOpSec: number) => string;
    knopLezen: (data: string) => { letter: 'b' | 'n' | 'i'; id: string; sig: string } | null;
    knopHandtekeningKlopt: (
      sleutel: Buffer,
      k: { letter: 'b' | 'n' | 'i'; id: string; sig: string },
      telegramId: string,
      verlooptOpSec: number,
    ) => boolean;
    nieuweId: () => string;
  };
  tgVenster: {
    vensterKiezen: (d: Record<string, unknown>) => Promise<{ uitkomst: string }>;
    vensterCode: (d: Record<string, unknown>) => Promise<{ ok: boolean; uitkomst: string }>;
    vensterWeigeren: (d: Record<string, unknown>) => Promise<{ uitkomst: string }>;
  };
  mcpOrigin: {
    ORIGIN_403: { error: string; reasonCode: string; uk: string; nl: string };
    isMcpRpcPad: (pad: string) => boolean;
    normaliseerOrigin: (v: unknown) => string | null;
    mcpOriginBesluit: (
      origin: unknown,
      eigen: Iterable<string>,
      opties?: { modus?: 'weigeren' | 'melden'; extra?: string[] },
    ) => { soort: 'geen' } | { soort: 'toegestaan'; origin: string } | { soort: 'geweigerd'; origin: string; blokkeren: boolean };
  };
  notitiesVnext: {
    zoekGrens: { tijdslimietMs: number };
    notitieMaken: (lade: { userId: string; ruimte: AiRuimte }, invoer: NotitieInvoer) => Promise<unknown>;
    notitiesLijst: (lade: { userId: string; ruimte: AiRuimte }, vraag: { vraag?: string }) => Promise<unknown>;
  };
  identiteit: {
    ECOSYSTEM_COOKIE: string;
    SERVICE_HOSTS: Record<string, string>;
  };
  backendIndex: {
    handler: RouterHandler;
  };
}

let kernBelofte: Promise<KernBundel> | null = null;

/** Єдине пакування серверного ядра в один граф ESM (спільні пули PG, контекст запиту та проміжні сховища). */
function kern(): Promise<KernBundel> {
  if (!kernBelofte) {
    kernBelofte = (async () => {
      const uitPad = join(dynMap, 'kern-bundel.mjs');
      const inhoud = [
        "export * as pg from './server/platform/pg.ts';",
        "export * as dbMod from './server/platform/db.ts';",
        "export * as context from './server/platform/context.ts';",
        "export * as routerMod from './server/platform/router.ts';",
        "export * as startMod from './server/start.ts';",
        "export * as rbac from './backend/rbac.ts';",
        "export * as ruimteSessie from './backend/ruimte-sessie.ts';",
        "export * as ruimteScheiding from './backend/ruimte-scheiding.ts';",
        "export * as techProfiel from './backend/tech-profiel.ts';",
        "export * as techRuimtes from './backend/tech-ruimtes-kern.ts';",
        "export * as sleutelkluis from './backend/sleutelkluis.ts';",
        "export * as voorcontrole from './backend/uitrol-voorcontrole.ts';",
        "export * as apiTokens from './backend/api-platform-tokens.ts';",
        "export * as klimopOpslag from './backend/klimop-overdracht-opslag.ts';",
        "export * as stapOpNood from './backend/stap-op-noodschakelaar.ts';",
        "export * as vlaggenBeheer from './backend/vlaggen.ts';",
        "export * as veiligeFetch from './backend/veilige-fetch.ts';",
        "export * as cloudM4 from './backend/cloud-verbinding-m4-routes.ts';",
        "export * as cloudM6 from './backend/cloud-m6-beheer-routes.ts';",
        "export * as cloudM8 from './backend/cloud-m8-routes.ts';",
        "export * as cloudM10 from './backend/cloud-m10-beheer-brug.ts';",
        "export * as mailImap from './backend/mail-imap.ts';",
        "export * as tgCrypto from './backend/telegram-aanmelden/cryptografie.ts';",
        "export * as tgVenster from './backend/telegram-aanmelden/venster.ts';",
        "export * as mcpOrigin from './backend/mcp-origin.ts';",
        "export * as notitiesVnext from './backend/notities-vnext.ts';",
        "export * as identiteit from './backend/deployment-identiteit.ts';",
        "export * as backendIndex from './backend/index.ts';",
      ].join('\n');
      await build({
        stdin: { contents: inhoud, resolveDir: process.cwd(), loader: 'ts' },
        outfile: uitPad,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node24',
        packages: 'external',
        loader: { '.css': 'empty' },
        logLevel: 'silent',
      });
      return (await import(pathToFileURL(uitPad).href)) as KernBundel;
    })();
  }
  return kernBelofte;
}

/** Динамічне складання й завантаження окремого модуля віх M1–M5 (відсутнього на 95fda93a). */
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

/** Завантаження чистого модуля сценарію .mjs зі scripts/. */
async function laadScriptModule<T = Record<string, unknown>>(relPad: string): Promise<T> {
  const volPad = resolve(process.cwd(), relPad);
  return (await import(pathToFileURL(volPad).href)) as T;
}

/** Внутрішня черга для перевірок, що тимчасово змінюють спільний стан процесу чи налаштування БД. */
let slotKeten: Promise<void> = Promise.resolve();
async function metSlot<T>(fn: () => Promise<T>): Promise<T> {
  const vorig = slotKeten;
  let vrijgeven!: () => void;
  slotKeten = new Promise<void>((r) => {
    vrijgeven = r;
  });
  await vorig;
  try {
    return await fn();
  } finally {
    vrijgeven();
  }
}

function maakLambdaEvent(opties: {
  method?: string;
  rawPath?: string;
  headers?: Record<string, string>;
  body?: string;
  query?: Record<string, string>;
  sourceIp?: string;
}): LambdaEvent {
  const method = opties.method ?? 'POST';
  const rawPath = opties.rawPath ?? '/api/proef';
  return {
    headers: opties.headers ?? { 'content-type': 'application/json' },
    body: opties.body ?? '',
    isBase64Encoded: false,
    rawPath,
    rawQueryString: '',
    queryStringParameters: opties.query ?? {},
    requestContext: {
      http: {
        method,
        path: rawPath,
        sourceIp: opties.sourceIp ?? '203.0.113.42',
        userAgent: 'eenheid-laag2',
      },
    },
  };
}

const sha256Hex = (tekst: string | Buffer): string => createHash('sha256').update(tekst).digest('hex');
const nieuwTabbladId = (): string => randomBytes(24).toString('hex');

let aangemaakteEigenaarId: string | null = null;

/** Повертає наявного власника із бази даних або створює єдиного власника без порушення records_een_eigenaar. */
async function zorgEigenaar(): Promise<{ id: string; email: string; role: 'owner'; status: 'approved' }> {
  const { pg } = await kern();
  const sys = pg.getPool('systeem');
  const r = await sys.query(
    "SELECT id, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1",
  );
  if (r.rows[0]) {
    const email = String(r.rows[0].email || 'eigenaar@example.invalid');
    process.env.OWNER_EMAIL = email;
    return { id: String(r.rows[0].id), email, role: 'owner', status: 'approved' };
  }
  const id = randomUUID();
  const email = String(process.env.OWNER_EMAIL || 'eigenaar@example.invalid');
  process.env.OWNER_EMAIL = email;
  const ingevoegd = await sys.query(
    'INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id',
    ['users', id, { email, role: 'owner', status: 'approved', name: 'Власник' }],
  );
  if (ingevoegd.rows[0]?.id) {
    aangemaakteEigenaarId = String(ingevoegd.rows[0].id);
  }
  const na = await sys.query(
    "SELECT id, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1",
  );
  const gekozenEmail = String(na.rows[0].email || email);
  process.env.OWNER_EMAIL = gekozenEmail;
  return { id: String(na.rows[0].id), email: gekozenEmail, role: 'owner', status: 'approved' };
}

/** Створює тимчасовий сеанс екосистеми у базі даних для перевірки маршрутів через головний обробник. */
async function maakSessieVoorDienst(
  userId: string,
  dienst: string,
): Promise<{ sessieId: string; cookie: string; host: string }> {
  const { pg, identiteit } = await kern();
  const sys = pg.getPool('systeem');
  const host = identiteit.SERVICE_HOSTS[dienst] || identiteit.SERVICE_HOSTS.hub;
  const sessieId = randomUUID();
  const geheim = randomBytes(32).toString('base64url');
  const nu = Date.now();
  const ep = Number(
    (
      await sys.query(
        "SELECT (data->>'epoch')::int AS e FROM app.records WHERE tbl = 'owner_revocation_state_v1' AND data->>'userId' = $1 ORDER BY (data->>'epoch')::int DESC LIMIT 1",
        [userId],
      )
    ).rows[0]?.e || 0,
  );
  await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
    'owner_service_sessions_v1',
    sessieId,
    {
      tokenHash: sha256Hex(geheim),
      userId,
      service: dienst,
      sourceOrigin: `https://${host}`,
      tabHash: sha256Hex('ecosystem'),
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
      ip: '203.0.113.42',
      userAgent: 'eenheid-laag2',
    },
  ]);
  return {
    sessieId,
    host,
    cookie: `${identiteit.ECOSYSTEM_COOKIE}=${encodeURIComponent(`${sessieId}.${geheim}`)}`,
  };
}

/** Відкриває активну технічну вкладку сумісно і з v1, і з tech-ruimtes-v2 + ruimtes-scheiding (після міграції 0335). */
async function maakActieveTechTab(
  gebruiker: { id: string; email?: string; role?: string; status?: string },
  dienst: string,
  tab: string,
  minuten: number,
  reden: string,
): Promise<{
  sessieId: string;
  metTechContext: <T>(fn: () => Promise<T> | T) => Promise<T>;
  opruimen: () => Promise<void>;
}> {
  const { pg, context, techProfiel, techRuimtes } = await kern();
  const sys = pg.getPool('systeem');
  const sessie = await maakSessieVoorDienst(gebruiker.id, dienst);
  const nu = Date.now();
  const profiel = await techProfiel.profielVan(gebruiker);
  if (!profiel || profiel.ingetrokkenOp) {
    throw new techProfiel.TechFout('GEEN_TECH_PROFIEL', 403);
  }
  await sys.query(
    `INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, sessie_id, rollen, modus, reden, eind_op)
     VALUES ($1, $2, $3, $4, $5, 'tijd', $6, now() + make_interval(mins => $7::int))`,
    [gebruiker.id, profiel.profielId, sha256Hex(`tech-tab:${tab}`), sessie.sessieId, profiel.rollen, reden, minuten],
  );
  await techRuimtes.starten(gebruiker, { id: sessie.sessieId, createdAt: nu }, tab, 'tijd', minuten, reden);
  return {
    sessieId: sessie.sessieId,
    metTechContext: <T>(fn: () => Promise<T> | T) =>
      context.metVerzoek(`POST /api/proef/${dienst}`, () => {
        context.zetGebruiker(gebruiker.id, dienst, tab, sessie.sessieId);
        context.sessieGeverifieerd();
        return fn();
      }),
    opruimen: async () => {
      await sys
        .query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = $1 AND sessie_id = $2', [gebruiker.id, sessie.sessieId])
        .catch(() => undefined);
      await sys
        .query('DELETE FROM app.tech_activaties WHERE user_id = $1 AND sessie_id = $2', [gebruiker.id, sessie.sessieId])
        .catch(() => undefined);
      await sys.query("DELETE FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND id = $1", [sessie.sessieId]).catch(() => undefined);
    },
  };
}

/** Рекурсивний перелік текстових файлів каталогу з заданими розширеннями. */
function verzamelBestanden(wortelMap: string, extensies: readonly string[]): string[] {
  const volWortel = resolve(process.cwd(), wortelMap);
  if (!existsSync(volWortel)) return [];
  const uit: string[] = [];
  const loop = (map: string) => {
    for (const naam of readdirSync(map)) {
      if (naam === 'node_modules' || naam === '.git' || naam === 'dist' || naam === 'dist-server') continue;
      const p = join(map, naam);
      const st = statSync(p);
      if (st.isDirectory()) loop(p);
      else if (extensies.some((ext) => naam.endsWith(ext))) uit.push(p);
    }
  };
  loop(volWortel);
  return uit.sort();
}

const VIJF_VEILIGHEID_VLAGGEN = [
  'gastcodes-iedereen',
  'aanmelden-passkey',
  'aanmelden-wachtwoord',
  'aanmelden-extern',
  'aanmelden-sms',
] as const;

const RU_VERB_TEKENS_RE = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

// ============================================================================
// Контур 2.1. Вхідні протокольні бар'єри маршрутизатора та сервера (9 перевірок)
// ============================================================================

test('L2-B01: isCanoniekPad та маршрутизатор відхиляють подвійні скісні риски // у шляху кодом 404 · dubbele schuine streep geeft 404', async () => {
  const { routerMod } = await kern();
  assert.equal(routerMod.isCanoniekPad('/api//flags'), false, 'Шлях із // не може визнаватися канонічним');
  assert.equal(routerMod.isCanoniekPad('//api/flags'), false, 'Початкова подвійна скісна риска має відхилятися');
  let aangeroepen = false;
  const r = routerMod.router({
    'POST /api/flags': [() => { aangeroepen = true; return routerMod.json({ ok: true }); }],
  });
  const antw = await r(maakLambdaEvent({ rawPath: '/api//flags', body: '{}' }));
  assert.equal(antw.statusCode, 404, 'Маршрутизатор мусить повертати 404 на подвійну скісну риску');
  assert.equal(aangeroepen, false, 'Обробник маршруту не повинен виконуватися на неканонічному шляху');
});

test('L2-B02: isCanoniekPad відхиляє кінцеву скісну риску /api/flags/ кодом 404, зберігаючи корінь / · afsluitende streep geeft 404', async () => {
  const { routerMod } = await kern();
  assert.equal(routerMod.isCanoniekPad('/'), true, 'Кореневий шлях / має залишатися канонічним');
  assert.equal(routerMod.isCanoniekPad('/api/flags/'), false, 'Кінцева скісна риска мусить відхилятися');
  const r = routerMod.router({
    'GET /': [() => routerMod.json({ wortel: true })],
    'POST /api/flags': [() => routerMod.json({ vlaggen: [] })],
  });
  const okWortel = await r(maakLambdaEvent({ method: 'GET', rawPath: '/' }));
  const foutPad = await r(maakLambdaEvent({ method: 'POST', rawPath: '/api/flags/', body: '{}' }));
  assert.equal(okWortel.statusCode, 200);
  assert.equal(foutPad.statusCode, 404);
});

test('L2-B03: isCanoniekPad відхиляє сегменти обходу каталогів /.. та /. кодом 404 · padsegmenten . en .. geven 404', async () => {
  const { routerMod } = await kern();
  for (const pad of ['/api/../geheim', '/api/.', '/..', '/.', '/api/v1/../../etc']) {
    assert.equal(routerMod.isCanoniekPad(pad), false, `Шлях ${pad} мусить бути відхилений`);
  }
  const r = routerMod.router({
    'GET /geheim': [() => routerMod.json({ lek: true })],
  });
  const antw = await r(maakLambdaEvent({ method: 'GET', rawPath: '/api/../geheim' }));
  assert.equal(antw.statusCode, 404);
});

test('L2-B04: пошкоджене відсоткове кодування у параметрі шляху (:id з %E0%A4%A) дає 404 без збою 500 · ongeldige URI-codering geeft 404', async () => {
  const { routerMod } = await kern();
  const r = routerMod.router({
    'POST /api/proef/:id': [(ctx) => routerMod.json({ id: ctx.params.id })],
  });
  const antw = await r(maakLambdaEvent({ rawPath: '/api/proef/%E0%A4%A', body: '{}' }));
  assert.equal(antw.statusCode, 404, 'Помилка decodeURIComponent має давати 404, а не 500');
});

test('L2-B05: запит зі зміною стану з реп’яшком і тілом поза форматом JSON відхиляється кодом 415 JSON_VEREIST · formulier met cookie geeft 415', async () => {
  const { routerMod } = await kern();
  assert.equal(
    routerMod.alleenJsonAfwijzing('POST', { cookie: 'sessie=1', 'content-type': 'application/x-www-form-urlencoded' }, 'a=1'),
    true,
  );
  assert.equal(
    routerMod.alleenJsonAfwijzing('DELETE', { Cookie: 'sessie=1', 'Content-Type': 'text/plain' }, 'wissen'),
    true,
  );
  await metSlot(async () => {
    const meldingen: JsonWeigering[] = [];
    routerMod.registreerJsonWeigeringMelder((w) => meldingen.push(w));
    try {
      const r = routerMod.router({
        'POST /api/proef/actie': [() => routerMod.json({ ok: true })],
      });
      const antw = await r(
        maakLambdaEvent({
          method: 'POST',
          rawPath: '/api/proef/actie',
          headers: { cookie: 'mr_s=1', 'content-type': 'application/x-www-form-urlencoded' },
          body: 'actie=wis',
          sourceIp: '198.51.100.25',
        }),
      );
      assert.equal(antw.statusCode, 415);
      assert.equal(JSON.parse(antw.body).error, 'JSON_VEREIST');
      assert.equal(meldingen.length, 1);
      assert.equal(meldingen[0].patroon, 'POST /api/proef/actie');
      assert.equal(meldingen[0].ip, '198.51.100.25');
    } finally {
      routerMod.registreerJsonWeigeringMelder(null);
    }
  });
});

test('L2-B06: запити читання GET/HEAD/OPTIONS, звернення без реп’яшка та типи +json не блокуються правилом 415 · veilige uitzonderingen op 415', async () => {
  const { routerMod } = await kern();
  assert.equal(routerMod.alleenJsonAfwijzing('GET', { cookie: 's=1', 'content-type': 'text/plain' }, 'x'), false);
  assert.equal(routerMod.alleenJsonAfwijzing('HEAD', { cookie: 's=1' }, 'x'), false);
  assert.equal(routerMod.alleenJsonAfwijzing('OPTIONS', { cookie: 's=1' }, 'x'), false);
  assert.equal(routerMod.alleenJsonAfwijzing('POST', { 'content-type': 'text/plain' }, 'ruw-bericht'), false);
  assert.equal(routerMod.alleenJsonAfwijzing('POST', { cookie: 's=1' }, ''), false);
  assert.equal(
    routerMod.alleenJsonAfwijzing('POST', { cookie: 's=1', 'content-type': 'application/vnd.api+json; charset=utf-8' }, '{}'),
    false,
  );
  assert.equal(
    routerMod.alleenJsonAfwijzing('PUT', { cookie: 's=1', 'content-type': 'application/problem+json' }, '{}'),
    false,
  );
});

test('L2-B07: нульовий символ U+0000 у ключі JSON-тіла, рядку запиту або параметрі шляху відхиляється кодом 400 INVOER_NUL · NUL in sleutel/query/pad geeft 400', async () => {
  const { routerMod } = await kern();
  assert.equal(routerMod.bevatNul({ q: 'a\u0000b' }), true);
  const r = routerMod.router({
    'POST /api/proef/:id': [(ctx) => routerMod.json({ id: ctx.params.id })],
  });
  const inSleutel = await r(
    maakLambdaEvent({ rawPath: '/api/proef/normaal', body: '{"veld\\u0000naam":"waarde"}' }),
  );
  const inQuery = await r(
    maakLambdaEvent({ rawPath: '/api/proef/normaal', body: '{}', query: { zoek: 'tekst\u0000staart' } }),
  );
  const inPad = await r(
    maakLambdaEvent({ rawPath: '/api/proef/abc%00def', body: '{}' }),
  );
  for (const antw of [inSleutel, inQuery, inPad]) {
    assert.equal(antw.statusCode, 400);
    assert.equal(JSON.parse(antw.body).error, 'INVOER_NUL');
  }
});

test('L2-B08: нульовий символ U+0000 у текстових значеннях JSON-тіла охайно очищається на вході · NUL in JSON-waarden wordt verwijderd', async () => {
  const { routerMod } = await kern();
  const invoer = {
    titel: 'При\u0000віт',
    lijst: ['еле\u0000мент', { вкладене: 'чис\u0000то' }],
  };
  const ok = routerMod.nulUitWaarden(invoer);
  assert.equal(ok, true);
  assert.equal(invoer.titel, 'Привіт');
  assert.equal(invoer.lijst[0], 'елемент');
  assert.equal((invoer.lijst[1] as { вкладене: string }).вкладене, 'чисто');
});

test('L2-B09: clientIp довіряє cf-connecting-ip лише від локального сокета, а сервер віддає CSP без unsafe-eval, HSTS, nosniff і DENY · clientIp en beveiligingskoppen', async () => {
  const { startMod, identiteit } = await kern();
  const nepExtern = {
    socket: { remoteAddress: '198.51.100.7' },
    headers: { 'cf-connecting-ip': '1.2.3.4' },
  } as unknown as http.IncomingMessage;
  const nepLokaal = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'cf-connecting-ip': '198.51.100.99' },
  } as unknown as http.IncomingMessage;
  const nepIpv6Lokaal = {
    socket: { remoteAddress: '::ffff:127.0.0.1' },
    headers: { 'cf-connecting-ip': '2001:db8::5' },
  } as unknown as http.IncomingMessage;

  assert.equal(startMod.clientIp(nepExtern), '198.51.100.7', 'Зовнішній сокет не може підробити cf-connecting-ip');
  assert.equal(startMod.clientIp(nepLokaal), '198.51.100.99', 'Локальний тунель передає справжню адресу клієнта');
  assert.equal(startMod.clientIp(nepIpv6Lokaal), '2001:db8::5');

  const srv = startMod.createServer();
  await new Promise<void>((res) => srv.listen(0, '127.0.0.1', () => res()));
  try {
    const adr = srv.address();
    assert.ok(adr && typeof adr === 'object', 'Очікується відкритий локальний порт');
    const antw = await new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((res, rej) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: adr.port,
          path: '/privacy',
          method: 'GET',
          headers: { Host: identiteit.SERVICE_HOSTS.hub },
        },
        (r) => {
          r.resume();
          r.on('end', () => res({ status: r.statusCode ?? 0, headers: r.headers }));
        },
      );
      req.on('error', rej);
      req.end();
    });
    assert.equal(antw.status, 200);
    assert.match(String(antw.headers['strict-transport-security'] || ''), /max-age=31536000/);
    assert.equal(antw.headers['x-content-type-options'], 'nosniff');
    assert.equal(antw.headers['x-frame-options'], 'DENY');
    const csp = String(antw.headers['content-security-policy'] || '');
    assert.match(csp, /frame-ancestors 'none'/);
    assert.ok(!/(?<![a-z-])'unsafe-eval'/.test(csp), 'Політика CSP не може містити unsafe-eval');
  } finally {
    await new Promise<void>((res) => srv.close(() => res()));
  }
});

// ============================================================================
// Контур 2.2. Міжкористувацька ізоляція, ролі RBAC та рядковий захист RLS (8 перевірок)
// ============================================================================

test('L2-B10: rejectForeignOwnerUserId відхиляє підміну чужого ownerUserId кодом 403 RBAC_FOREIGN_OWNER_REJECTED · vreemde ownerUserId geweigerd', async () => {
  const { rbac } = await kern();
  const geweigerd = rbac.rejectForeignOwnerUserId({ id: 'gebruiker-a' }, { ownerUserId: 'gebruiker-b' });
  assert.ok(geweigerd, 'Підміна чужого ownerUserId має повертати помилку');
  assert.equal(geweigerd.statusCode, 403);
  assert.equal(JSON.parse(geweigerd.body).error, 'RBAC_FOREIGN_OWNER_REJECTED');

  const eigen = rbac.rejectForeignOwnerUserId({ id: 'gebruiker-a' }, { ownerUserId: 'gebruiker-a' });
  assert.equal(eigen, undefined, 'Власний ownerUserId не повинен відхилятися');
});

test('L2-B11: непідтверджений обліковий запис (status !== approved) блокується кодом 403 RBAC_PENDING_CANNOT_MUTATE · niet-goedgekeurd account krijgt 403', async () => {
  const { rbac } = await kern();
  const p = rbac.denyPending({ id: 'u-wacht', role: 'member', status: 'pending' }, true);
  assert.ok(p);
  assert.equal(p.statusCode, 403);
  assert.equal(JSON.parse(p.body).error, 'RBAC_PENDING_CANNOT_MUTATE');

  const m = rbac.denyMutation({ id: 'u-nieuw', role: 'member', status: 'new' }, 'workspace.write');
  assert.ok(m);
  assert.equal(m.statusCode, 403);
  assert.equal(JSON.parse(m.body).error, 'RBAC_PENDING_CANNOT_MUTATE');
});

test('L2-B12: роль глядача (viewer / limited) має лише дозволи читання й отримує 403 RBAC_FORBIDDEN при записі · kijker mag alleen lezen', async () => {
  const { rbac } = await kern();
  const kijker = { id: 'kijker-1', role: 'viewer', status: 'approved', accessLevel: 'limited' };
  assert.equal(rbac.can(kijker, 'mail.read'), true);
  assert.equal(rbac.can(kijker, 'cloud.read'), true);
  assert.equal(rbac.can(kijker, 'calendar.read'), true);
  for (const schrijfRecht of ['mail.write', 'cloud.write', 'calendar.write', 'workspace.write', 'photos.write'] as const) {
    assert.equal(rbac.can(kijker, schrijfRecht), false, `Глядач не повинен мати права ${schrijfRecht}`);
    const weigering = rbac.denyMutation(kijker, schrijfRecht);
    assert.ok(weigering);
    assert.equal(weigering.statusCode, 403);
    assert.equal(JSON.parse(weigering.body).error, 'RBAC_FORBIDDEN');
  }
});

test('L2-B13: власника неможливо знищити або понизити, а адміністратор не керує роллю owner · eigenaar is onverwijderbaar', async () => {
  const { rbac } = await kern();
  assert.equal(rbac.canDestroyOwner(), false);
  assert.equal(rbac.canManageRole({ role: 'admin', status: 'approved' }, 'owner'), false);
  assert.equal(rbac.canManageRole({ role: 'owner', status: 'approved' }, 'owner'), false);
  assert.equal(rbac.canManageRole({ role: 'owner', status: 'approved' }, 'admin'), true);
  assert.equal(rbac.canManageRole({ role: 'member', status: 'approved' }, 'admin'), false);
});

test('L2-B14: metSchrijfwacht захищає всі маршрути поза zonderSchrijfrecht позначкою SCHRIJFWACHT і блокує глядача кодом 403 · metSchrijfwacht weigert standaard', async () => {
  const { rbac, routerMod } = await kern();
  const vrijgesteld = new Set(['POST /api/proef/lezen']);
  const omwikkeld = rbac.metSchrijfwacht(
    {
      'POST /api/proef/lezen': [async () => routerMod.json({ ok: true })],
      'POST /api/proef/stille-actie': [async () => routerMod.json({ gewijzigd: true })],
    },
    async () => ({ user: { id: 'v1', role: 'viewer', status: 'approved', accessLevel: 'limited' } }),
    'workspace.write',
    vrijgesteld,
  );
  assert.equal(Boolean((omwikkeld['POST /api/proef/lezen'][0] as unknown as Record<symbol, unknown>)[rbac.SCHRIJFWACHT]), false);
  assert.equal((omwikkeld['POST /api/proef/stille-actie'][0] as unknown as Record<symbol, unknown>)[rbac.SCHRIJFWACHT], 'workspace.write');

  const r = routerMod.router(omwikkeld);
  const magLezen = await r(maakLambdaEvent({ rawPath: '/api/proef/lezen', body: '{}' }));
  const magNietSchrijven = await r(maakLambdaEvent({ rawPath: '/api/proef/stille-actie', body: '{}' }));
  assert.equal(magLezen.statusCode, 200);
  assert.equal(magNietSchrijven.statusCode, 403);
  assert.equal(JSON.parse(magNietSchrijven.body).error, 'RBAC_FORBIDDEN');
});

test('L2-B15: rbacWeigeringVastleggen записує rbac.geweigerd у app.audit не частіше одного разу на 10 хвилин · rbac-weigering met 10-minuten-drempel', async () => {
  const { rbac, pg } = await kern();
  await metSlot(async () => {
    rbac._rbacWeigeringenLeeg();
    const proefGebruiker = `rbac-audit-${randomUUID()}`;
    const t0 = 1_700_000_000_000;
    const eerste = await rbac.rbacWeigeringVastleggen(
      { userId: proefGebruiker, route: 'POST /api/proef/schrijf', recht: 'mail.write', reden: 'RBAC_FORBIDDEN' },
      t0,
    );
    const binnenVenster = await rbac.rbacWeigeringVastleggen(
      { userId: proefGebruiker, route: 'POST /api/proef/schrijf', recht: 'mail.write', reden: 'RBAC_FORBIDDEN' },
      t0 + 60_000,
    );
    const naVenster = await rbac.rbacWeigeringVastleggen(
      { userId: proefGebruiker, route: 'POST /api/proef/schrijf', recht: 'mail.write', reden: 'RBAC_FORBIDDEN' },
      t0 + 10 * 60_000 + 1,
    );
    assert.equal(eerste, true);
    assert.equal(binnenVenster, false, 'Повторна відмова в межах 10 хвилин має приглушуватися');
    assert.equal(naVenster, true, 'Через 10 хвилин відмова знову фіксується в журналі');

    const rijen = await pg.getPool('systeem').query(
      "SELECT action, result, details FROM app.audit WHERE owner_id = $1 AND action = 'rbac.geweigerd'",
      [proefGebruiker],
    );
    assert.equal(rijen.rows.length, 2);
    assert.equal(rijen.rows[0].result, 'denied');
    assert.equal(rijen.rows[0].details?.reden, 'RBAC_FORBIDDEN');
  });
});

test('L2-B16: жива міжкористувацька ізоляція RLS на app.records під роллю mijnruimte_app між користувачами А і Б · RLS op app.records tussen A en B', async () => {
  const { pg } = await kern();
  assert.equal(pg.appRolActief(), true, 'Очікується налаштована окрема роль mijnruimte_app у тестовій базі');
  await metSlot(async () => {
    const sys = pg.getPool('systeem');
    const mig = pg.getPool('migratie');
    const gebruikerA = randomUUID();
    const gebruikerB = randomUUID();
    const tabel = 'eenheid_consolidatie_rls_v1';
    const rijA = randomUUID();
    const rijB = randomUUID();
    const vorigeStand =
      (await mig.query("SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'")).rows[0]?.waarde === 'aan'
        ? 'aan'
        : 'uit';

    try {
      await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3), ($1, $4, $5)', [
        tabel,
        rijA,
        { ownerUserId: gebruikerA, notitie: 'дані користувача А' },
        rijB,
        { ownerUserId: gebruikerB, notitie: 'дані користувача Б' },
      ]);
      await mig.query("UPDATE app.rls_instellingen SET waarde = 'aan', bijgewerkt = now() WHERE sleutel = 'afdwingen'");

      const c = await pg.getPool('app').connect();
      try {
        await c.query('BEGIN');
        const zonderGebruiker = (
          await c.query('SELECT count(*)::int AS n FROM app.records WHERE id = ANY($1)', [[rijA, rijB]])
        ).rows[0].n;
        assert.equal(zonderGebruiker, 0, 'Без app.user_id роль mijnruimte_app має бачити 0 рядків');

        await c.query("SELECT set_config('app.user_id', $1, true)", [gebruikerA]);
        const zichtbaarVoorA = (
          await c.query('SELECT id FROM app.records WHERE id = ANY($1)', [[rijA, rijB]])
        ).rows.map((r) => String(r.id));
        assert.deepEqual(zichtbaarVoorA, [rijA], 'Користувач А бачить лише власний рядок');

        const gewijzigd = (
          await c.query("UPDATE app.records SET data = data || '{\"gekaapt\":true}' WHERE id = $1", [rijB])
        ).rowCount;
        const verwijderd = (await c.query('DELETE FROM app.records WHERE id = $1', [rijB])).rowCount;
        assert.equal(gewijzigd, 0, 'Користувач А не може змінити рядок користувача Б');
        assert.equal(verwijderd, 0, 'Користувач А не може видалити рядок користувача Б');
        await c.query('COMMIT');
      } finally {
        await c.query('ROLLBACK').catch(() => undefined);
        c.release();
      }
    } finally {
      await mig
        .query("UPDATE app.rls_instellingen SET waarde = $1, bijgewerkt = now() WHERE sleutel = 'afdwingen'", [vorigeStand])
        .catch(() => undefined);
      await sys.query('DELETE FROM app.records WHERE id = ANY($1)', [[rijA, rijB]]).catch(() => undefined);
    }
  });
});

test('L2-B17: міжкористувацька ізоляція на новій таблиці app.klantrelatieboek та маршрутах служби клієнтів між А і Б · RLS-isolatie op app.klantrelatieboek', async () => {
  const { pg, identiteit, backendIndex } = await kern();
  const sys = pg.getPool('systeem');
  const reg = (await sys.query("SELECT to_regclass('app.klantrelatieboek') AS rel")).rows[0]?.rel;
  assert.ok(reg, 'Очікується таблиця app.klantrelatieboek із віхи M1 (KLANT-001, міграція 0310)');

  const gebruikerA = randomUUID();
  const gebruikerB = randomUUID();
  const dossierId = randomUUID();
  let sessieAId = '';
  try {
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3), ($1, $4, $5)', [
      'users',
      gebruikerA,
      { email: `klant-a-${gebruikerA.slice(0, 8)}@example.invalid`, role: 'member', status: 'approved', name: 'Учасник А' },
      gebruikerB,
      { email: `klant-b-${gebruikerB.slice(0, 8)}@example.invalid`, role: 'member', status: 'approved', name: 'Учасник Б' },
    ]);
    await sys.query(
      "INSERT INTO app.klantrelatieboek (gebruiker, ruimte, id, soort, klant_id, inhoud) VALUES ($1, 'prive', $2, 'klant', $2, $3)",
      [gebruikerB, dossierId, 'dek1.aaaaaaaaaaaabbbb.cccccccc.ddddddddddddddddddddAA'],
    );

    const c = await pg.getPool('app').connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.user_id', $1, true)", [gebruikerA]);
      await c.query("SELECT set_config('app.ruimte', 'prive', true)");
      const sel = await c.query('SELECT id FROM app.klantrelatieboek WHERE id = $1', [dossierId]);
      const upd = await c.query("UPDATE app.klantrelatieboek SET inhoud = 'gekaapt' WHERE id = $1", [dossierId]);
      const del = await c.query('DELETE FROM app.klantrelatieboek WHERE id = $1', [dossierId]);
      assert.equal(sel.rowCount, 0, 'Користувач А не бачить досьє клієнта користувача Б у mijnruimte_app');
      assert.equal(upd.rowCount, 0, 'Користувач А не може перезаписати досьє користувача Б');
      assert.equal(del.rowCount, 0, 'Користувач А не може стерти досьє користувача Б');
      await c.query('ROLLBACK');
    } finally {
      await c.query('ROLLBACK').catch(() => undefined);
      c.release();
    }

    if ('crm' in identiteit.SERVICE_HOSTS || backendIndex.handler.patronen.some((p) => p.includes('/api/owner/klantrelatiebeheer/'))) {
      const dienstSleutel = 'crm' in identiteit.SERVICE_HOSTS ? 'crm' : 'hub';
      const sessieA = await maakSessieVoorDienst(gebruikerA, dienstSleutel);
      sessieAId = sessieA.sessieId;
      const antw = await backendIndex.handler(
        maakLambdaEvent({
          method: 'POST',
          rawPath: '/api/owner/klantrelatiebeheer/wissen',
          headers: {
            host: sessieA.host,
            origin: `https://${sessieA.host}`,
            'content-type': 'application/json',
            cookie: sessieA.cookie,
          },
          body: JSON.stringify({ id: dossierId, klantId: dossierId }),
        }),
      );
      assert.notEqual(antw.statusCode, 200, 'Сеанс користувача А не може стерти чуже досьє клієнта Б');
      const nogAanwezig = await sys.query('SELECT 1 FROM app.klantrelatieboek WHERE gebruiker = $1 AND id = $2', [
        gebruikerB,
        dossierId,
      ]);
      assert.equal(nogAanwezig.rowCount, 1, 'Досьє користувача Б мусить залишитися цілим');
    }
  } finally {
    await sys.query('DELETE FROM app.klantrelatieboek WHERE id = $1', [dossierId]).catch(() => undefined);
    if (sessieAId) await sys.query('DELETE FROM app.records WHERE id = $1', [sessieAId]).catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE id = ANY($1)', [[gebruikerA, gebruikerB]]).catch(() => undefined);
  }
});

// ============================================================================
// Контур 2.3. Міжпросторова ізоляція prive проти technisch (7 перевірок)
// ============================================================================

test('L2-B18: bindingWaarde та bindingKlopt прив’язують технічний сеанс через HMAC-SHA256 у сталий час · HMAC-SHA256 sessiebinding', async () => {
  const { ruimteSessie } = await kern();
  const sig = ruimteSessie.bindingWaarde('site-sessie-1', 'ruimte-sessie-1', 1);
  assert.ok(sig && /^[0-9a-f]{64}$/.test(sig), 'Очікується 64-символьний шістнадцятковий підпис HMAC-SHA256');
  assert.equal(ruimteSessie.bindingKlopt(sig, 'site-sessie-1', 'ruimte-sessie-1', 1), true);
  assert.equal(ruimteSessie.bindingKlopt(sig, 'site-sessie-2', 'ruimte-sessie-1', 1), false, 'Інший якірний сеанс має відхилятися');
  assert.equal(ruimteSessie.bindingKlopt(sig, 'site-sessie-1', 'ruimte-sessie-2', 1), false, 'Інший технічний сеанс має відхилятися');
  assert.equal(ruimteSessie.bindingKlopt(sig, 'site-sessie-1', 'ruimte-sessie-1', 2), false, 'Інше покоління має відхилятися');
  const vervalst = `${sig.slice(0, 63)}${sig.endsWith('0') ? '1' : '0'}`;
  assert.equal(ruimteSessie.bindingKlopt(vervalst, 'site-sessie-1', 'ruimte-sessie-1', 1), false);
  assert.equal(ruimteSessie.bindingKlopt('geen-geldige-hex', 'site-sessie-1', 'ruimte-sessie-1', 1), false);
});

test('L2-B19: за відсутності серверних ключів прив’язки bindingWaarde повертає null і технічний простір закритий · zonder sleutel geen binding', async () => {
  const { ruimteSessie } = await kern();
  await metSlot(async () => {
    const oudRuimte = process.env.RUIMTE_BINDING_SLEUTEL_V1;
    const oudTotp = process.env.TOTP_ENCRYPTION_KEY_V1;
    try {
      delete process.env.RUIMTE_BINDING_SLEUTEL_V1;
      delete process.env.TOTP_ENCRYPTION_KEY_V1;
      assert.equal(ruimteSessie.bindingBeschikbaar(), false);
      assert.equal(ruimteSessie.bindingWaarde('site-1', 'ruimte-1', 1), null);
      assert.equal(ruimteSessie.bindingKlopt('a'.repeat(64), 'site-1', 'ruimte-1', 1), false);
    } finally {
      if (oudRuimte !== undefined) process.env.RUIMTE_BINDING_SLEUTEL_V1 = oudRuimte;
      if (oudTotp !== undefined) process.env.TOTP_ENCRYPTION_KEY_V1 = oudTotp;
    }
  });
});

test('L2-B20: ruimteVanSessie та gegevensRuimteVeilig ігнорують підміну поля ruimte у тілі запиту · ruimteVanSessie negeert body-veld ruimte', async () => {
  const { pg, context, routerMod, ruimteSessie, ruimteScheiding } = await kern();
  assert.equal(await ruimteSessie.ruimteVanSessie(), 'prive', 'Поза перевіреним сеансом простір завжди prive');
  const gewoneId = randomUUID();
  const sys = pg.getPool('systeem');
  try {
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
      'users',
      gewoneId,
      { email: `ruimte-gewoon-${gewoneId.slice(0, 8)}@example.invalid`, role: 'member', status: 'approved' },
    ]);
    const r = routerMod.router({
      'POST /api/proef/ruimte': [
        async () => {
          context.zetGebruiker(gewoneId, 'hub', nieuwTabbladId(), 'sessie-x');
          context.sessieGeverifieerd();
          return routerMod.json({ ruimte: await ruimteSessie.ruimteVanSessie() });
        },
      ],
    });
    const antw = await r(
      maakLambdaEvent({
        rawPath: '/api/proef/ruimte',
        body: JSON.stringify({ ruimte: 'technisch', space: 'technisch' }),
      }),
    );
    assert.equal(antw.statusCode, 200);
    assert.equal(JSON.parse(antw.body).ruimte, 'prive', 'Поле ruimte у тілі запиту ніколи не вмикає технічний простір');
    assert.equal(await ruimteScheiding.gegevensRuimteVeilig(gewoneId, { tabContext: nieuwTabbladId() }), 'prive');
  } finally {
    await sys.query('DELETE FROM app.records WHERE id = $1', [gewoneId]).catch(() => undefined);
  }
});

test('L2-B21: за увімкненого прапорця ruimtes-scheiding авторизовані відповіді /api/* отримують Cache-Control: no-store, Vary: Cookie та X-Ruimte · antwoordkoppen bij ruimtes-scheiding', async () => {
  const { pg, context, routerMod, ruimteSessie, vlaggenBeheer } = await kern();
  await metSlot(async () => {
    const sys = pg.getPool('systeem');
    const proefGebruiker = randomUUID();
    const oudeRij = (
      await sys.query('SELECT aan, gebruikers FROM app.feature_flags WHERE sleutel = $1', ['ruimtes-scheiding'])
    ).rows[0];
    try {
      await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
        'users',
        proefGebruiker,
        { email: `kop-${proefGebruiker.slice(0, 8)}@example.invalid`, role: 'member', status: 'approved' },
      ]);
      await sys.query(
        'UPDATE app.feature_flags SET aan = true, gebruikers = array_append(gebruikers, $1) WHERE sleutel = $2',
        [proefGebruiker, 'ruimtes-scheiding'],
      );
      vlaggenBeheer.vlagGeheugenLeeg();
      ruimteSessie._scheidingCacheLeeg();
      ruimteSessie.installeerRuimteKoppen();

      const r = routerMod.router({
        'POST /api/proef/koppen': [
          async () => {
            context.zetGebruiker(proefGebruiker, 'hub', undefined, 'sessie-kop');
            context.sessieGeverifieerd();
            return routerMod.json({ ok: true });
          },
        ],
      });
      const antw = await r(maakLambdaEvent({ rawPath: '/api/proef/koppen', body: '{}' }));
      assert.equal(antw.statusCode, 200);
      assert.equal(antw.headers['Cache-Control'], 'no-store');
      assert.match(String(antw.headers.Vary || ''), /\bCookie\b/);
      assert.equal(antw.headers['X-Ruimte'], 'prive');
    } finally {
      if (oudeRij) {
        await sys
          .query('UPDATE app.feature_flags SET aan = $1, gebruikers = $2 WHERE sleutel = $3', [
            oudeRij.aan,
            oudeRij.gebruikers,
            'ruimtes-scheiding',
          ])
          .catch(() => undefined);
      }
      vlaggenBeheer.vlagGeheugenLeeg();
      ruimteSessie._scheidingCacheLeeg();
      await sys.query('DELETE FROM app.records WHERE id = $1', [proefGebruiker]).catch(() => undefined);
    }
  });
});

test('L2-B22: одноразовий вибір keuzeZetten блокує повторний перевибір кодом 409 KEUZE_AL_GEMAAKT і не розморожує служби bevroren · eenmalige ruimtekeuze', async () => {
  const { pg, ruimteScheiding } = await kern();
  const sys = pg.getPool('systeem');
  const uid = randomUUID();
  try {
    await sys.query(
      "INSERT INTO app.ruimte_dienst_stand (user_id, dienst, stand, vorige_stand, bevestigd_door, bevroren_op, bevroren_oorzaak) VALUES ($1, 'mail', 'bevroren', 'eigen', $1, now(), 'rol-weg')",
      [uid],
    );
    const eerste = await ruimteScheiding.keuzeZetten(uid, 'apart', uid);
    assert.equal(eerste.keuze.keuze, 'apart');
    const mailStand = eerste.standen.find((s) => s.dienst === 'mail');
    assert.equal(mailStand?.stand, 'bevroren', 'Заморожена служба не повинна розморожуватися початковим вибором');

    await assert.rejects(
      () => ruimteScheiding.keuzeZetten(uid, 'samen', uid),
      (err: unknown) => err instanceof ruimteScheiding.RuimteFout && err.code === 'KEUZE_AL_GEMAAKT' && err.status === 409,
    );
  } finally {
    await sys.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id = $1', [uid]).catch(() => undefined);
    await sys.query('DELETE FROM app.ruimte_keuze WHERE user_id = $1', [uid]).catch(() => undefined);
  }
});

test('L2-B23: заморожена технічна шухляда закриває доступ у gegevensLade з двомовним поясненням без підміни простору · bevroren lade geeft eerlijke weigering', async () => {
  const { pg, techProfiel, ruimteScheiding } = await kern();
  const sys = pg.getPool('systeem');
  const eig = await zorgEigenaar();
  const proefGebruiker = randomUUID();
  const devEmail = `bevries-${proefGebruiker.slice(0, 8)}@example.invalid`;
  const tab = nieuwTabbladId();
  const tabEig = nieuwTabbladId();
  let eigTech: Awaited<ReturnType<typeof maakActieveTechTab>> | null = null;
  let devTech: Awaited<ReturnType<typeof maakActieveTechTab>> | null = null;
  try {
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
      'users',
      proefGebruiker,
      { email: devEmail, role: 'member', status: 'approved', name: 'Розробник' },
    ]);
    eigTech = await maakActieveTechTab(eig, 'admin', tabEig, 30, 'призначення профілю');
    await eigTech.metTechContext(() =>
      techProfiel.toekennen(eig, tabEig, {
        email: devEmail,
        rollen: ['ontwikkelaar'],
        maxMinuten: 60,
      }),
    );
    await eigTech.opruimen();
    eigTech = null;

    devTech = await maakActieveTechTab(
      { id: proefGebruiker, email: devEmail, role: 'member', status: 'approved' },
      'mail',
      tab,
      30,
      'робота в технічній шухляді',
    );
    await ruimteScheiding.keuzeZetten(proefGebruiker, 'apart', proefGebruiker);
    await sys.query(
      "UPDATE app.ruimte_dienst_stand SET stand = 'bevroren', bevroren_op = now(), bevroren_oorzaak = 'profiel-ingetrokken' WHERE user_id = $1 AND dienst = 'mail'",
      [proefGebruiker],
    );

    const besluit = await devTech.metTechContext(() =>
      ruimteScheiding.gegevensLade({ userId: proefGebruiker, tabContext: tab, dienst: 'mail' }),
    );
    assert.equal(besluit.ok, false, 'Заморожена технічна шухляда не може видавати дані');
    if (!besluit.ok) {
      assert.ok(besluit.uitleg.uk.length > 10 && besluit.uitleg.nl.length > 10, 'Очікується двомовне пояснення відмови');
    }
  } finally {
    if (eigTech) await eigTech.opruimen();
    if (devTech) await devTech.opruimen();
    await sys.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id = $1', [proefGebruiker]).catch(() => undefined);
    await sys.query('DELETE FROM app.ruimte_keuze WHERE user_id = $1', [proefGebruiker]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = $1', [proefGebruiker]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [proefGebruiker]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [proefGebruiker]).catch(() => undefined);
    await sys
      .query("DELETE FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = $1", [proefGebruiker])
      .catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE id = $1', [proefGebruiker]).catch(() => undefined);
  }
});

test('L2-B24: міжпросторова ізоляція prive проти technisch у таблиці app.klantrelatieboek для одного користувача · ruimte-isolatie op klantrelatieboek', async () => {
  const { pg, sleutelkluis } = await kern();
  const klantModel = await laadProjectModule<Record<string, unknown>>('shared/klantrelatiebeheer.ts');
  const sys = pg.getPool('systeem');
  const reg = (await sys.query("SELECT to_regclass('app.klantrelatieboek') AS rel")).rows[0]?.rel;
  assert.ok(reg && klantModel, 'Очікується таблиця app.klantrelatieboek та модуль shared/klantrelatiebeheer.ts із віхи M1');

  const gebruiker = randomUUID();
  const idPrive = randomUUID();
  const idTech = randomUUID();
  const dekPrive = randomBytes(32);
  const zegelPrive = sleutelkluis.verzegelMetDek(
    dekPrive,
    'Особистий замовник',
    `app.klantrelatieboek|${gebruiker}|prive|klant|${idPrive}`,
  );

  try {
    await sys.query(
      "INSERT INTO app.klantrelatieboek (gebruiker, ruimte, id, soort, klant_id, inhoud) VALUES ($1, 'prive', $2, 'klant', $2, $3), ($1, 'technisch', $4, 'klant', $4, $5)",
      [gebruiker, idPrive, zegelPrive, idTech, 'dek1.aaaaaaaaaaaabbbb.cccccccc.ddddddddddddddddddddAA'],
    );

    const c = await pg.getPool('app').connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.user_id', $1, true)", [gebruiker]);
      await c.query("SELECT set_config('app.ruimte', 'technisch', true)");
      const rijenTech = (await c.query('SELECT id FROM app.klantrelatieboek WHERE gebruiker = $1', [gebruiker])).rows.map(
        (r) => String(r.id),
      );
      assert.deepEqual(rijenTech, [idTech], 'Із простору technisch не повинно бути видно записів простору prive');
      await c.query('ROLLBACK');
    } finally {
      await c.query('ROLLBACK').catch(() => undefined);
      c.release();
    }

    assert.throws(
      () => sleutelkluis.ontzegelMetDek(dekPrive, zegelPrive, `app.klantrelatieboek|${gebruiker}|technisch|klant|${idPrive}`),
      'Конверт простору prive не повинен відкриватися з контекстом AAD простору technisch',
    );
  } finally {
    await sys.query('DELETE FROM app.klantrelatieboek WHERE gebruiker = $1', [gebruiker]).catch(() => undefined);
  }
});

// ============================================================================
// Контур 2.4. Сховище ключів Sleutelkluis (AES-256-GCM, AAD, затирання пам'яті) (6 перевірок)
// ============================================================================

test('L2-B25: verzegelMetDek та ontzegelMetDek прив’язують конверт dek1.* до повного контексту AAD · strikte AAD-binding op dek1', async () => {
  const { sleutelkluis } = await kern();
  const dek = randomBytes(32);
  const aad = 'app.klantrelatieboek|gebruiker-1|prive|klant|rij-1';
  const envelop = sleutelkluis.verzegelMetDek(dek, 'Конфіденційна угода', aad);
  assert.equal(isDekEnvelop(envelop), true);
  assert.equal(sleutelkluis.ontzegelMetDek(dek, envelop, aad), 'Конфіденційна угода');

  for (const valseAad of [
    'app.klantrelatieboek|gebruiker-2|prive|klant|rij-1',
    'app.klantrelatieboek|gebruiker-1|technisch|klant|rij-1',
    'app.klantrelatieboek|gebruiker-1|prive|klant|rij-2',
    'app.mail_imap_koppeling|gebruiker-1|prive|klant|rij-1',
  ]) {
    assert.throws(
      () => sleutelkluis.ontzegelMetDek(dek, envelop, valseAad),
      `Зміна AAD на ${valseAad} мусить викликати помилку автентифікації GCM`,
    );
  }
});

test('L2-B26: omslagAad унеможливлює відкриття обгортки ключа omslag1.* одного простору для іншого простору · omslagAad scheidt ruimtes', async () => {
  const { sleutelkluis } = await kern();
  const kek = randomBytes(32);
  const dek = randomBytes(32);
  const omgeslagen = sleutelkluis.omslaan(kek, dek, omslagAad('u1', 'prive', 'herstelcode', 'h1'));
  assert.ok(omgeslagen.startsWith('omslag1.'));
  assert.deepEqual(sleutelkluis.omslagOpenen(kek, omgeslagen, omslagAad('u1', 'prive', 'herstelcode', 'h1')), dek);

  assert.throws(() => sleutelkluis.omslagOpenen(kek, omgeslagen, omslagAad('u1', 'technisch', 'herstelcode', 'h1')));
  assert.throws(() => sleutelkluis.omslagOpenen(kek, omgeslagen, omslagAad('u2', 'prive', 'herstelcode', 'h1')));
});

test('L2-B27: weigerNulSleutel блокує шифрування та розшифрування нульовим 32-байтовим буфером кодом 423 SLEUTELKLUIS_GESLOTEN · nulsleutel geweigerd', async () => {
  const { sleutelkluis } = await kern();
  const nulSleutel = Buffer.alloc(32, 0);
  const echteSleutel = randomBytes(32);
  const geldigEnvelop = sleutelkluis.verzegelMetDek(echteSleutel, 'дані', 'proef|u1|rij1');

  assert.throws(
    () => sleutelkluis.verzegelMetDek(nulSleutel, 'дані', 'proef|u1|rij1'),
    (e: unknown) =>
      e instanceof sleutelkluis.SleutelkluisFout && e.code === SLEUTEL_GESLOTEN_CODE && e.status === 423,
  );
  assert.throws(
    () => sleutelkluis.ontzegelMetDek(nulSleutel, geldigEnvelop, 'proef|u1|rij1'),
    (e: unknown) =>
      e instanceof sleutelkluis.SleutelkluisFout && e.code === SLEUTEL_GESLOTEN_CODE && e.status === 423,
  );
});

test('L2-B28: пошкоджені форми конвертів відхиляються кодом ENVELOP_ONGELDIG · ongeldige envelopvorm geweigerd', async () => {
  const { sleutelkluis } = await kern();
  const dek = randomBytes(32);
  const iv12 = randomBytes(12).toString('base64url');
  const tag16 = randomBytes(16).toString('base64url');
  const kort = randomBytes(6).toString('base64url');

  for (const kapot of [
    `v1.${iv12}.abcd.${tag16}`,
    `dek1.${kort}.abcd.${tag16}`,
    `dek1.${iv12}.abcd.${kort}`,
    `dek1.${iv12}.abcd.${tag16}.extra`,
    'dek1..abcd',
    '',
  ]) {
    assert.throws(
      () => sleutelkluis.ontzegelMetDek(dek, kapot, 'aad'),
      (e: unknown) => e instanceof sleutelkluis.SleutelkluisFout && e.code === 'ENVELOP_ONGELDIG',
      `Конверт "${kapot}" має відхилятися з ENVELOP_ONGELDIG`,
    );
  }
});

test('L2-B29: закриття останнього тримача сеансу затирає буфер DEK у пам’яті нулями · DEK-buffer genuld bij sluiten', async () => {
  const { pg, sleutelkluis } = await kern();
  const sys = pg.getPool('systeem');
  const uid = `kluis-nul-${randomUUID()}`;
  const lade = { userId: uid, ruimte: 'prive' as const };
  const sessieHouderId = `sessie-${randomUUID()}`;
  try {
    const aan = await sleutelkluis.inschakelen(lade, { soort: 'intern', id: sessieHouderId });
    assert.ok(aan.herstelcode.length >= 20);
    const openBuffer = sleutelkluis.sleutelOpen(lade);
    assert.ok(openBuffer && openBuffer.length === 32);
    assert.equal(openBuffer.every((b) => b === 0), false, 'Відкритий ключ DEK має містити ненульову ентропію');

    const geslotenAantal = sleutelkluis.sleutelSluitenVoorHouder('intern', sessieHouderId);
    assert.equal(geslotenAantal, 1);
    assert.equal(openBuffer.every((b) => b === 0), true, 'Буфер DEK у пам’яті мусить бути затертий нулями після закриття');
    assert.equal(await sleutelkluis.kluisStand(lade), 'gesloten');
    assert.throws(
      () => sleutelkluis.verzegelMetDek(openBuffer, 'tekst', 'aad'),
      (e: unknown) => e instanceof sleutelkluis.SleutelkluisFout && e.code === SLEUTEL_GESLOTEN_CODE,
    );
  } finally {
    sleutelkluis.sleutelVergrendelenVoorGebruiker(uid);
    sleutelkluis.standCacheLeeg(lade);
    await sys
      .query("DELETE FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = $1", [uid])
      .catch(() => undefined);
    await sys.query('DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1', [uid]).catch(() => undefined);
    await sys.query('DELETE FROM app.sleutelkluis_journaal WHERE user_id = $1', [uid]).catch(() => undefined);
    await sys.query('DELETE FROM app.sleutelkluis WHERE user_id = $1', [uid]).catch(() => undefined);
  }
});

test('L2-B30: кожен запис зі станом nog-niet у SLEUTELKLUIS_REGISTER має двомовне обґрунтування без заборонених літер · nog-niet-regels hebben tweetalige reden', async () => {
  const nogNiet = SLEUTELKLUIS_REGISTER.filter((r) => r.stand === 'nog-niet');
  assert.ok(nogNiet.length > 0);
  for (const regel of nogNiet) {
    assert.ok(regel.reden?.uk && regel.reden.uk.trim().length >= 15, `Бракує українського пояснення для ${regel.tabel}`);
    assert.ok(regel.reden?.nl && regel.reden.nl.trim().length >= 15, `Бракує нідерландського пояснення для ${regel.tabel}`);
    assert.equal(RU_VERB_TEKENS_RE.test(regel.reden.uk), false, `Заборонені літери в описі ${regel.tabel}`);
    assert.equal(RU_VERB_TEKENS_RE.test(regel.reden.nl), false);
  }
});

// ============================================================================
// Контур 2.5. Трирівневі ролі PostgreSQL, незмінність app.audit та міграції (9 перевірок)
// ============================================================================

test('L2-B31: роль mijnruimte_app не має BYPASSRLS чи SUPERUSER і обмежена часовими межами pgTijdslimieten · mijnruimte_app zonder BYPASSRLS of SUPERUSER', async () => {
  const { pg } = await kern();
  const sys = pg.getPool('systeem');
  const rol = (
    await sys.query("SELECT rolsuper, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = 'mijnruimte_app'")
  ).rows[0];
  assert.ok(rol, 'Роль mijnruimte_app має існувати в базі даних');
  assert.equal(rol.rolsuper, false);
  assert.equal(rol.rolbypassrls, false);

  const limieten = pg.pgTijdslimieten();
  assert.ok((limieten.statement_timeout ?? 0) > 0 && (limieten.statement_timeout ?? 0) <= 120_000);
  assert.ok(
    (limieten.idle_in_transaction_session_timeout ?? 0) > 0 &&
      (limieten.idle_in_transaction_session_timeout ?? 0) <= 60_000,
  );
});

test('L2-B32: роль mijnruimte_app позбавлена прямого DML на app.audit, app.audit_kop та app.audit_beheerders · app.audit onveranderlijk voor mijnruimte_app', async () => {
  const { pg } = await kern();
  const appPool = pg.getPool('app');
  for (const sqlOpdracht of [
    'SELECT 1 FROM app.audit LIMIT 1',
    "INSERT INTO app.audit (action, type, result) VALUES ('nep', 'nep', 'ok')",
    "UPDATE app.audit SET result = 'ok' WHERE false",
    'DELETE FROM app.audit WHERE false',
    'SELECT 1 FROM app.audit_kop LIMIT 1',
    'SELECT 1 FROM app.audit_beheerders LIMIT 1',
  ]) {
    await assert.rejects(
      () => appPool.query(sqlOpdracht),
      (err: unknown) => (err as { code?: string })?.code === '42501',
      `Запит "${sqlOpdracht}" мусить відхилятися з кодом прав PostgreSQL 42501`,
    );
  }
  const sys = pg.getPool('systeem');
  const magFunctie = (
    await sys.query(
      "SELECT has_function_privilege('mijnruimte_app', 'app.audit_toevoegen(text,text,text,text,text,jsonb,text,text,text)', 'EXECUTE') AS ok",
    )
  ).rows[0]?.ok;
  assert.equal(magFunctie, true, 'Роль mijnruimte_app має записувати аудит лише через функцію app.audit_toevoegen');
});

test('L2-B33: ні mijnruimte_app, ні mijnruimte_system не можуть напряму змінити app.rls_instellingen або app.schema_migrations · bescherming van rls_instellingen en schema_migrations', async () => {
  const { pg } = await kern();
  const appPool = pg.getPool('app');
  const sysPool = pg.getPool('systeem');

  for (const p of [appPool, sysPool]) {
    for (const sqlOpdracht of [
      "UPDATE app.rls_instellingen SET waarde = 'uit' WHERE false",
      'DELETE FROM app.rls_instellingen WHERE false',
      "INSERT INTO app.schema_migrations (version) VALUES ('9999_nep')",
      'DELETE FROM app.schema_migrations WHERE false',
    ]) {
      await assert.rejects(
        () => p.query(sqlOpdracht),
        (err: unknown) => (err as { code?: string })?.code === '42501',
      );
    }
  }

  const heeftSchakelaars = (
    await sysPool.query("SELECT has_table_privilege('mijnruimte_app', 'app.beveiliging_schakelaars', 'SELECT') AS mag")
  ).rows[0]?.mag;
  assert.equal(heeftSchakelaars, false, 'Роль mijnruimte_app не повинна мати доступу до app.beveiliging_schakelaars');
  if ((await sysPool.query("SELECT to_regprocedure('app.rls_afdwingen_zetten(text)') AS p")).rows[0]?.p) {
    const magZetten = (
      await sysPool.query("SELECT has_function_privilege('mijnruimte_app', 'app.rls_afdwingen_zetten(text)', 'EXECUTE') AS mag")
    ).rows[0]?.mag;
    assert.equal(magZetten, false);
  }
});

test('L2-B34: роль mijnruimte_app не має жодних прав DML (42501) на системні таблиці 0283, 0300, 0304 та 0306 · mijnruimte_app buitengesloten van systeemtabellen', async () => {
  const { pg } = await kern();
  const sys = pg.getPool('systeem');
  const appPool = pg.getPool('app');
  const systeemTabellen = [
    'app.verdeelde_opslag_knopen',
    'app.verdeelde_opslag_rotaties',
    'app.merk_gebruiker',
    'app.uitrol_beheer_sleutels',
    'app.uitrol_release_wijzigingen',
    'app.uitrol_telegram_instellingen',
    'app.uitrol_github_ontvangen',
  ];
  const rechten = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] as const;
  const lekkendeRechten: string[] = [];

  for (const tabel of systeemTabellen) {
    const bestaat = (await sys.query('SELECT to_regclass($1) AS rel', [tabel])).rows[0]?.rel;
    assert.ok(bestaat, `Системна таблиця ${tabel} має існувати`);
    for (const recht of rechten) {
      const mag = (await sys.query('SELECT has_table_privilege($1, $2, $3) AS mag', ['mijnruimte_app', tabel, recht]))
        .rows[0]?.mag;
      if (mag) lekkendeRechten.push(`${tabel}:${recht}`);
    }
    try {
      await appPool.query(`SELECT 1 FROM ${tabel} LIMIT 1`);
      lekkendeRechten.push(`${tabel}:LIVE_SELECT_TOEGESTAAN`);
    } catch (err) {
      if ((err as { code?: string })?.code !== '42501') {
        lekkendeRechten.push(`${tabel}:ONVERWACHTE_FOUT_${String((err as { code?: string })?.code)}`);
      }
    }
  }
  assert.deepEqual(
    lekkendeRechten,
    [],
    `Виявлено надлишкові права mijnruimte_app на системних таблицях (очікується закриття прогалини 0306 у міграції 0311 віхи M1): ${lekkendeRechten.join(', ')}`,
  );
});

test('L2-B35: унікальний частковий індекс records_een_eigenaar унеможливлює створення другого власника (23505) · hoogstens één eigenaar', async () => {
  await zorgEigenaar();
  const { pg } = await kern();
  const sys = pg.getPool('systeem');
  const idx = await sys.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'app' AND indexname = 'records_een_eigenaar'",
  );
  assert.equal(idx.rowCount, 1);

  const c = await sys.connect();
  try {
    await c.query('BEGIN');
    await assert.rejects(
      () =>
        c.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
          'users',
          randomUUID(),
          { email: 'tweede-eigenaar@example.invalid', role: 'owner', status: 'approved' },
        ]),
      (err: unknown) => (err as { code?: string })?.code === '23505',
      'Другий запис власника мусить блокуватися унікальним індексом 23505',
    );
    await c.query('ROLLBACK');
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
    c.release();
  }
});

test('L2-B36: усі файли migrations/NNNN_*.sql мають суворо унікальні чотиризначні префікси номерів · unieke viercijferige migratienummers', async () => {
  const bestanden = readdirSync(resolve('migrations'))
    .filter((naam) => /^\d{4}_[a-z0-9_]+\.sql$/.test(naam))
    .sort();
  assert.ok(bestanden.length >= 180, 'Очікується повний набір міграцій у каталозі migrations/');
  const gezien = new Map<string, string>();
  const dubbelen: string[] = [];
  for (const bestand of bestanden) {
    const nr = bestand.slice(0, 4);
    const eerder = gezien.get(nr);
    if (eerder) dubbelen.push(`${nr}: ${eerder} + ${bestand}`);
    else gezien.set(nr, bestand);
  }
  assert.deepEqual(dubbelen, [], `Виявлено колізію номерів міграцій: ${dubbelen.join('; ')}`);
});

test('L2-B37: жодна міграція починаючи з 0286 не містить руйнівних команд зі списку SQL_RISICO · migraties vanaf 0286 achterwaarts compatibel', async () => {
  const { voorcontrole } = await kern();
  const bestanden = readdirSync(resolve('migrations'))
    .filter((naam) => /^\d{4}_[a-z0-9_]+\.sql$/.test(naam) && naam.slice(0, 4) >= '0286')
    .sort();
  assert.ok(bestanden.length > 0);
  const overtredingen: string[] = [];
  for (const bestand of bestanden) {
    const ruw = readFileSync(resolve('migrations', bestand), 'utf8');
    const zonderCommentaar = ruw.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [patroon, labelUk] of voorcontrole.SQL_RISICO) {
      if (patroon.test(zonderCommentaar)) overtredingen.push(`${bestand}: ${labelUk}`);
    }
  }
  assert.deepEqual(overtredingen, [], `Нові міграції не можуть містити руйнівних команд: ${overtredingen.join(', ')}`);
});

test('L2-B38: таблиця app.klantrelatieboek та всі нові користувацькі таблиці міграцій >= 0307 мають ENABLE та FORCE ROW LEVEL SECURITY · FORCE RLS op klantrelatieboek en nieuwe tabellen', async () => {
  const { pg } = await kern();
  const sys = pg.getPool('systeem');
  const nieuweMigraties = readdirSync(resolve('migrations'))
    .filter((naam) => /^\d{4}_[a-z0-9_]+\.sql$/.test(naam) && naam.slice(0, 4) >= '0307')
    .sort();

  const gecreerdeTabellen = new Set<string>(['klantrelatieboek']);
  for (const bestand of nieuweMigraties) {
    const sql = readFileSync(resolve('migrations', bestand), 'utf8');
    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?app\.([a-z0-9_]+)/gi)) {
      gecreerdeTabellen.add(m[1].toLowerCase());
    }
  }

  const fouten: string[] = [];
  for (const relnaam of gecreerdeTabellen) {
    const volNaam = `app.${relnaam}`;
    const info = (
      await sys.query(
        `SELECT c.relrowsecurity, c.relforcerowsecurity,
                has_table_privilege('mijnruimte_app', $1, 'SELECT') OR has_table_privilege('mijnruimte_app', $1, 'INSERT') AS app_toegang,
                (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname = 'app' AND p.tablename = $2) AS aantal_policies
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'app' AND c.relname = $2`,
        [volNaam, relnaam],
      )
    ).rows[0];

    if (!info) {
      if (relnaam === 'klantrelatieboek') fouten.push(`${volNaam}: таблиця ще відсутня (очікує міграцію 0310 у вісі M1)`);
      continue;
    }
    if (relnaam === 'klantrelatieboek' || info.app_toegang) {
      if (!info.relrowsecurity) fouten.push(`${volNaam}: не увімкнено ENABLE ROW LEVEL SECURITY`);
      if (!info.relforcerowsecurity) fouten.push(`${volNaam}: не увімкнено FORCE ROW LEVEL SECURITY`);
      if (Number(info.aantal_policies) < 1) fouten.push(`${volNaam}: відсутня політика в pg_policies`);
    }
  }
  assert.deepEqual(fouten, [], fouten.join('; '));
});

test('L2-B39: повторне виконання migrations/rechten.sql на базі mijnruimte_test_e2e є повністю ідемпотентним · rechten.sql is idempotent', async () => {
  const { pg } = await kern();
  await metSlot(async () => {
    const mig = pg.getPool('migratie');
    const rechtenSql = readFileSync(resolve('migrations/rechten.sql'), 'utf8');
    assert.ok(rechtenSql.includes('REVOKE ALL'), 'Сценарій migrations/rechten.sql має містити явні правила REVOKE ALL');
    await mig.query(rechtenSql);
    await mig.query(rechtenSql);
    const controle = (
      await mig.query(
        "SELECT has_table_privilege('mijnruimte_app', 'app.audit', 'SELECT') AS audit_lek, has_schema_privilege('mijnruimte_app', 'app', 'USAGE') AS schema_ok",
      )
    ).rows[0];
    assert.equal(controle?.audit_lek, false, 'Після подвійного виконання rechten.sql роль mijnruimte_app не отримує читання app.audit');
    assert.equal(controle?.schema_ok, true, 'Після подвійного виконання rechten.sql роль mijnruimte_app зберігає USAGE на схемі app');
  });
});

// ============================================================================
// Контур 2.6А. Заборонені області API Platform та межі маркерів tsv_... (9 перевірок)
// ============================================================================

async function maakApiPlatformTestRoutes(eigenaar: { id: string; email: string; role: string; status: string }) {
  const { apiTokens, routerMod } = await kern();
  return apiTokens.createApiPlatformRoutes({
    requireSession: async () => ({ user: eigenaar, service: 'api' }),
    respond: (data, status = 200) => routerMod.json(data, status),
    fail: (message, status = 400) => routerMod.error(message, status),
    audit: async () => undefined,
    body: (b) => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {}),
  });
}

test('L2-B40: контракт apiPlatformContractPayload утримує hash-only, writeScopesEnabled=false та 4 руйнівні області у стані forbidden · API-contract houdt verboden scopes vast', async () => {
  const { apiTokens } = await kern();
  const contract = apiPlatformContractPayload(
    { id: 'eig-1', email: 'eigenaar@example.invalid', role: 'owner' },
    { tokenCount: 1, vaultCount: 2, vaultReady: true, connectionsConfigured: 1 },
  );
  assert.equal(contract.tokenIssuance, 'hash-only');
  assert.equal(contract.writeScopesEnabled, false);
  for (const verbodenScope of ['site.deploy', 'source.write', 'vault.write', 'device.command'] as const) {
    assert.ok(contract.forbidden.includes(verbodenScope), `Область ${verbodenScope} мусить входити до forbidden`);
    const cap = API_PLATFORM_CAPABILITIES.find((c) => c.id === verbodenScope);
    assert.ok(cap);
    assert.equal(cap.status, 'forbidden');
    assert.equal(cap.actor, 'none');
    assert.ok(apiTokens.API_PAT_FORBIDDEN_SCOPES.includes(verbodenScope));
  }
});

test('L2-M2-01: спроба випустити маркер API Platform з областю site.deploy відхиляється кодом 403 API_TOKEN_SCOPE_FORBIDDEN · site.deploy geweigerd met 403', async () => {
  const { routerMod } = await kern();
  const eig = await zorgEigenaar();
  const r = routerMod.router(await maakApiPlatformTestRoutes(eig));
  const antw = await r(
    maakLambdaEvent({
      rawPath: '/api/owner/api-platform/tokens/create',
      body: JSON.stringify({ scopes: ['site.deploy'], label: 'Заборонена спроба' }),
    }),
  );
  assert.equal(antw.statusCode, 403);
  assert.equal(JSON.parse(antw.body).error, 'API_TOKEN_SCOPE_FORBIDDEN');
});

test('L2-M2-02: спроба випустити маркер API Platform з областю source.write відхиляється кодом 403 API_TOKEN_SCOPE_FORBIDDEN · source.write geweigerd met 403', async () => {
  const { routerMod } = await kern();
  const eig = await zorgEigenaar();
  const r = routerMod.router(await maakApiPlatformTestRoutes(eig));
  const antw = await r(
    maakLambdaEvent({
      rawPath: '/api/owner/api-platform/tokens/create',
      body: JSON.stringify({ scopes: ['source.write'] }),
    }),
  );
  assert.equal(antw.statusCode, 403);
  assert.equal(JSON.parse(antw.body).error, 'API_TOKEN_SCOPE_FORBIDDEN');
});

test('L2-M2-03: спроба випустити маркер API Platform з областю vault.write відхиляється кодом 403 API_TOKEN_SCOPE_FORBIDDEN · vault.write geweigerd met 403', async () => {
  const { routerMod } = await kern();
  const eig = await zorgEigenaar();
  const r = routerMod.router(await maakApiPlatformTestRoutes(eig));
  const antw = await r(
    maakLambdaEvent({
      rawPath: '/api/owner/api-platform/tokens/create',
      body: JSON.stringify({ scopes: ['vault.write'] }),
    }),
  );
  assert.equal(antw.statusCode, 403);
  assert.equal(JSON.parse(antw.body).error, 'API_TOKEN_SCOPE_FORBIDDEN');
});

test('L2-M2-04: спроба випустити маркер API Platform з областю device.command відхиляється кодом 403 API_TOKEN_SCOPE_FORBIDDEN · device.command geweigerd met 403', async () => {
  const { routerMod } = await kern();
  const eig = await zorgEigenaar();
  const r = routerMod.router(await maakApiPlatformTestRoutes(eig));
  const antw = await r(
    maakLambdaEvent({
      rawPath: '/api/owner/api-platform/tokens/create',
      body: JSON.stringify({ scopes: ['device.command'] }),
    }),
  );
  assert.equal(antw.statusCode, 403);
  assert.equal(JSON.parse(antw.body).error, 'API_TOKEN_SCOPE_FORBIDDEN');
});

test('L2-M2-05: будь-яка область запису *.write (mail.write, calendar.write, files.write) відхиляється кодом 403 API_TOKEN_SCOPE_FORBIDDEN · alle *.write-scopes verboden', async () => {
  const { routerMod } = await kern();
  const eig = await zorgEigenaar();
  const r = routerMod.router(await maakApiPlatformTestRoutes(eig));
  for (const scopes of [
    ['identity.me.read', 'mail.write'],
    ['calendar.write'],
    ['files.write'],
    ['notes.write'],
  ]) {
    const antw = await r(
      maakLambdaEvent({
        rawPath: '/api/owner/api-platform/tokens/create',
        body: JSON.stringify({ scopes }),
      }),
    );
    assert.equal(antw.statusCode, 403, `Набір областей ${scopes.join(',')} має відхилятися з 403`);
    assert.equal(JSON.parse(antw.body).error, 'API_TOKEN_SCOPE_FORBIDDEN');
  }
});

test('L2-M2-06: перелік маркерів не розкриває відкритий ключ чи хеш, понад 60 запитів/хв дає 429, а відкликання дає 401 · geheimhouding, 60/min-limiet en intrekking', async () => {
  const { pg, context, routerMod, apiTokens } = await kern();
  const eig = await zorgEigenaar();
  const sys = pg.getPool('systeem');
  const r = routerMod.router(await maakApiPlatformTestRoutes(eig));
  let aangemaaktId = '';
  try {
    const maakAntw = await r(
      maakLambdaEvent({
        rawPath: '/api/owner/api-platform/tokens/create',
        body: JSON.stringify({ scopes: ['identity.me.read'], label: 'Перевірка меж' }),
      }),
    );
    assert.equal(maakAntw.statusCode, 200);
    const gemaakt = JSON.parse(maakAntw.body);
    aangemaaktId = String(gemaakt.item?.id || '');
    const openWaarde = String(gemaakt.plaintext || '');
    assert.ok(aangemaaktId && openWaarde.startsWith(nepGeheim('tsv', '_')));

    const lijstAntw = await r(maakLambdaEvent({ rawPath: '/api/owner/api-platform/tokens', body: '{}' }));
    assert.equal(lijstAntw.statusCode, 200);
    assert.equal(lijstAntw.body.includes(openWaarde), false, 'Перелік маркерів ніколи не розкриває відкритий ключ');
    assert.equal(lijstAntw.body.includes('tokenHash'), false, 'Перелік маркерів не повертає поле tokenHash');

    const authKop = { authorization: `Bearer ${openWaarde}` };
    for (let i = 0; i < 60; i++) {
      const u = await context.metVerzoek('GET /api/v1/me', () => apiTokens.resolveApiMachineToken({ headers: authKop }));
      assert.equal('token' in u, true, `Звернення №${i + 1} має проходити в межах 60/хв`);
    }
    const begrensd = await context.metVerzoek('GET /api/v1/me', () => apiTokens.resolveApiMachineToken({ headers: authKop }));
    assert.equal('errorCode' in begrensd && begrensd.errorCode, 'API_TOKEN_RATE_LIMITED');
    assert.equal('status' in begrensd && begrensd.status, 429);

    const intrekAntw = await r(
      maakLambdaEvent({
        rawPath: `/api/owner/api-platform/tokens/${aangemaaktId}/revoke`,
        body: '{}',
      }),
    );
    assert.equal(intrekAntw.statusCode, 200);

    const naIntrek = await context.metVerzoek('GET /api/v1/me', () => apiTokens.resolveApiMachineToken({ headers: authKop }));
    assert.equal('errorCode' in naIntrek && naIntrek.errorCode, 'API_TOKEN_REVOKED');
    assert.equal('status' in naIntrek && naIntrek.status, 401);
  } finally {
    if (aangemaaktId) {
      await sys
        .query('DELETE FROM app.records WHERE tbl = $1 AND id = $2', [apiTokens.API_MACHINE_TOKEN_TABLE, aangemaaktId])
        .catch(() => undefined);
    }
  }
});

test('L2-M2-07: дійсний маркер tsv_... одного власника отримує 403 API_TOKEN_FOREIGN_WORKSPACE при підміні чужого workspaceId · vreemde workspaceId geeft 403', async () => {
  const { pg, dbMod, context, routerMod, apiTokens } = await kern();
  const eig = await zorgEigenaar();
  const sys = pg.getPool('systeem');
  const vreemdeGebruiker = randomUUID();
  const vreemdeRuimte = `ws-vreemd-${randomUUID()}`;
  const r = routerMod.router(await maakApiPlatformTestRoutes(eig));
  let aangemaaktId = '';
  try {
    await dbMod.db.add('workspaces', [{ ownerUserId: vreemdeGebruiker, naam: 'Чужий простір' }]);
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
      'workspaces',
      vreemdeRuimte,
      { ownerUserId: vreemdeGebruiker, naam: 'Ізольований простір' },
    ]);

    const maakAntw = await r(
      maakLambdaEvent({
        rawPath: '/api/owner/api-platform/tokens/create',
        body: JSON.stringify({ scopes: ['identity.me.read'], label: 'Перевірка простору' }),
      }),
    );
    const gemaakt = JSON.parse(maakAntw.body);
    aangemaaktId = String(gemaakt.item?.id || '');
    const openWaarde = String(gemaakt.plaintext || '');

    const uitkomst = await context.metVerzoek('GET /api/v1/me', () =>
      apiTokens.resolveApiMachineToken(
        { headers: { authorization: `Bearer ${openWaarde}` } },
        { workspaceId: vreemdeRuimte },
      ),
    );
    assert.equal('errorCode' in uitkomst && uitkomst.errorCode, 'API_TOKEN_FOREIGN_WORKSPACE');
    assert.equal('status' in uitkomst && uitkomst.status, 403);
  } finally {
    if (aangemaaktId) {
      await sys
        .query('DELETE FROM app.records WHERE tbl = $1 AND id = $2', [apiTokens.API_MACHINE_TOKEN_TABLE, aangemaaktId])
        .catch(() => undefined);
    }
    await sys.query('DELETE FROM app.records WHERE tbl = $1 AND id = $2', ['workspaces', vreemdeRuimte]).catch(() => undefined);
    await sys
      .query("DELETE FROM app.records WHERE tbl = 'workspaces' AND data->>'ownerUserId' = $1", [vreemdeGebruiker])
      .catch(() => undefined);
  }
});

test('L2-M2-08: маркер лише з областю identity.me.read отримує 403 API_TOKEN_SCOPE_MISSING на маршрутах читання пошти, календаря і файлів /api/v1/* · ontbrekende scope op /api/v1/* geeft 403', async () => {
  const { pg, routerMod, apiTokens, identiteit, backendIndex } = await kern();
  const eig = await zorgEigenaar();
  const sys = pg.getPool('systeem');
  const apiRoutes = await maakApiPlatformTestRoutes(eig);
  const r = routerMod.router(apiRoutes);
  let aangemaaktId = '';
  try {
    const maakAntw = await r(
      maakLambdaEvent({
        rawPath: '/api/owner/api-platform/tokens/create',
        body: JSON.stringify({ scopes: ['identity.me.read'], label: 'Лише тотожність' }),
      }),
    );
    assert.equal(maakAntw.statusCode, 200);
    const gemaakt = JSON.parse(maakAntw.body);
    aangemaaktId = String(gemaakt.item?.id || '');
    const openWaarde = String(gemaakt.plaintext || '');

    const allePatronen = [...new Set([...Object.keys(apiRoutes), ...backendIndex.handler.patronen])];
    const mailPatroon = allePatronen.find((p) => /^(GET|POST)\s+\/api\/v1\/.*mail/i.test(p));
    const agendaPatroon = allePatronen.find((p) => /^(GET|POST)\s+\/api\/v1\/.*(calendar|agenda)/i.test(p));
    const bestandPatroon = allePatronen.find((p) => /^(GET|POST)\s+\/api\/v1\/.*(files|bestanden|cloud)/i.test(p));

    assert.ok(
      mailPatroon && agendaPatroon && bestandPatroon,
      'Очікуються опубліковані маршрути машинного читання /api/v1/* для пошти, календаря та метаданих файлів (віха M4, З-9)',
    );

    for (const patroon of [mailPatroon, agendaPatroon, bestandPatroon]) {
      const [methode, ruwPad] = patroon.trim().split(/\s+/);
      const pad = ruwPad.replace(/:([A-Za-z0-9_]+)/g, 'proef-id');
      const doel = Object.prototype.hasOwnProperty.call(apiRoutes, patroon) ? r : backendIndex.handler;
      const antw = await doel(
        maakLambdaEvent({
          method: methode,
          rawPath: pad,
          headers: {
            host: identiteit.SERVICE_HOSTS.api,
            authorization: `Bearer ${openWaarde}`,
            'content-type': 'application/json',
          },
          body: methode === 'GET' ? '' : '{}',
        }),
      );
      assert.equal(antw.statusCode, 403, `Маршрут ${patroon} без відповідної області читання мусить повертати 403`);
      assert.equal(JSON.parse(antw.body).error, 'API_TOKEN_SCOPE_MISSING');
    }
  } finally {
    if (aangemaaktId) {
      await sys
        .query('DELETE FROM app.records WHERE tbl = $1 AND id = $2', [apiTokens.API_MACHINE_TOKEN_TABLE, aangemaaktId])
        .catch(() => undefined);
    }
  }
});

// ============================================================================
// Контур 2.6Б. Непорушність Плюща, STAP_OP_UIT, правил 1.8.0 та VLAG-001 (11 перевірок)
// ============================================================================

test('L2-M2-09: спроба дії ontkoppel_erfenis_postgres у schakelKlimopDienstOverdracht блокується 403 KLIMOP_LOSKOPPELING_VERBODEN · loskoppelen van PostgreSQL verboden', async () => {
  const { klimopOpslag } = await kern();
  const staatMap = mkdtempSync(join(dynMap, 'klimop-m09-'));
  try {
    assert.throws(
      () => klimopOpslag.schakelKlimopDienstOverdracht({ actie: 'ontkoppel_erfenis_postgres', dienstId: 'identiteit' }, { staatMap }),
      (e: unknown) => (e instanceof KlimopFout || (e as { code?: string })?.code === 'KLIMOP_LOSKOPPELING_VERBODEN') && (e as { status?: number }).status === 403,
    );
    const uk = klimopCodeTekst('uk', 'KLIMOP_LOSKOPPELING_VERBODEN');
    const nl = klimopCodeTekst('nl', 'KLIMOP_LOSKOPPELING_VERBODEN');
    assert.ok(uk.length > 20 && nl.length > 20);
  } finally {
    rmSync(staatMap, { recursive: true, force: true });
  }
});

test('L2-M2-10: обхідні вектори вимкнення PostgreSQL блокуються 403, а primaireSchrijfBron усіх 11 служб лишається erfenis_postgres · alle 11 diensten behouden erfenis_postgres', async () => {
  const { klimopOpslag } = await kern();
  const staatMap = mkdtempSync(join(dynMap, 'klimop-m10-'));
  try {
    for (const aanval of [
      { actie: 'schakel_postgres_uit', dienstId: 'mail' },
      { actie: 'volledig_onafhankelijk', dienstId: 'cloud' },
      { actie: 'terug_naar_erfenis', dienstId: 'notities', ontkoppelErfenisDatabank: true },
    ]) {
      assert.throws(
        () => klimopOpslag.schakelKlimopDienstOverdracht(aanval, { staatMap }),
        (e: unknown) =>
          (e as { code?: string })?.code === 'KLIMOP_LOSKOPPELING_VERBODEN' &&
          (e as { status?: number })?.status === 403,
      );
    }
    const overzicht = klimopOpslag.leesKlimopSpiegelLogboek({ staatMap });
    assert.equal(overzicht.productieDatabankGewijzigd, false);
    assert.equal(overzicht.schakelaars.length, KLIMOP_ELF_DIENSTEN.length);
    for (const schakelaar of overzicht.schakelaars) {
      assert.equal(schakelaar.primaireSchrijfBron, 'erfenis_postgres');
    }
  } finally {
    rmSync(staatMap, { recursive: true, force: true });
  }
});

test('L2-M2-11: невідома служба, недійсна дія перемикача та пошкоджене тіло Плюща відхиляються кодами 400 · ongeldige Klimop-invoer geeft 400', async () => {
  const { klimopOpslag } = await kern();
  const staatMap = mkdtempSync(join(dynMap, 'klimop-m11-'));
  try {
    for (const slechtLichaam of [null, undefined, [], 'tekst']) {
      assert.throws(
        () => klimopOpslag.schakelKlimopDienstOverdracht(slechtLichaam, { staatMap }),
        (e: unknown) =>
          (e as { code?: string })?.code === 'KLIMOP_INVOER_ONGELDIG' && (e as { status?: number })?.status === 400,
      );
    }
    assert.throws(
      () => klimopOpslag.schakelKlimopDienstOverdracht({ actie: 'onbekende_actie', dienstId: 'mail' }, { staatMap }),
      (e: unknown) =>
        (e as { code?: string })?.code === 'KLIMOP_SCHAKELAAR_ACTIE_ONGELDIG' &&
        (e as { status?: number })?.status === 400,
    );
    assert.throws(
      () => klimopOpslag.schakelKlimopDienstOverdracht({ actie: 'terug_naar_erfenis', dienstId: 'niet_bestaande_dienst' }, { staatMap }),
      (e: unknown) =>
        (e as { code?: string })?.code === 'ONBEKENDE_KLIMOP_DIENST' && (e as { status?: number })?.status === 400,
    );
  } finally {
    rmSync(staatMap, { recursive: true, force: true });
  }
});

test('L2-M2-12: у штатному стані аварійний вимикач STAP_OP_UIT вимкнений (uit === false, ernst === "") · STAP_OP_UIT standaard uit', async () => {
  const { stapOpNood } = await kern();
  const leeg = stapOpNood.stapOpUitKaart(Date.now(), {});
  assert.equal(leeg.uit, false);
  assert.equal(leeg.ernst, '');
  assert.deepEqual(leeg.tekst, ['', '']);

  const huidig = stapOpNood.stapOpUitKaart(Date.now(), process.env);
  assert.equal(huidig.uit, false, 'У поточному середовищі STAP_OP_UIT має залишатися вимкненим');
  assert.equal(huidig.ernst, '');
});

test('L2-M2-13: увімкнення STAP_OP_UIT=1 в ізольованому словнику підіймає червону тривогу й записує admin.beveiliging.uit · STAP_OP_UIT=1 geeft rood alarm en audit', async () => {
  const { stapOpNood } = await kern();
  const gelogd: string[] = [];
  const audits: Array<{ actie: string; reden: string }> = [];
  const meldingen: Array<{ userId: string; titel: string; tekst: string }> = [];

  const ernst = await stapOpNood.stapOpUitMelden(
    Date.now(),
    { STAP_OP_UIT: '1' },
    {
      log: (r) => gelogd.push(r),
      audit: async (i) => {
        audits.push({ actie: i.actie, reden: i.reden });
      },
      eigenaarId: async () => 'eigenaar-id-1',
      melden: async (userId, titel, tekst) => {
        meldingen.push({ userId, titel, tekst });
      },
    },
  );
  assert.equal(ernst, 'rood');
  assert.equal(gelogd.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actie, 'admin.beveiliging.uit');
  assert.equal(meldingen.length, 1);
  assert.equal(meldingen[0].userId, 'eigenaar-id-1');
  assert.match(meldingen[0].titel, /\//);
});

test('L2-M2-14: недійсний, прострочений або довший за 24 години STAP_OP_UIT_TOT залишає підтвердження увімкненим навіть поруч із STAP_OP_UIT=1 · ongeldige STAP_OP_UIT_TOT houdt bevestiging aan', async () => {
  const { stapOpNood } = await kern();
  const nu = Date.parse('2026-11-22T12:00:00Z');
  for (const totWaarde of [
    'geen-geldige-iso-datum',
    new Date(nu - 60_000).toISOString(),
    new Date(nu + 25 * 3_600_000).toISOString(),
  ]) {
    const kaart = stapOpNood.stapOpUitKaart(nu, { STAP_OP_UIT: '1', STAP_OP_UIT_TOT: totWaarde });
    assert.equal(kaart.uit, false, `При STAP_OP_UIT_TOT=${totWaarde} повторне підтвердження має залишатися увімкненим`);
    assert.equal(kaart.ernst, 'oranje');
  }
});

test('L2-M2-15: захисні бар’єри beveiliging_schakelaars та кореневі дозволи відсутні у таблиці app.feature_flags · beveiligingsschakelaars niet in feature_flags', async () => {
  const { pg } = await kern();
  const sys = pg.getPool('systeem');
  const sleutels = new Set(
    (await sys.query('SELECT sleutel FROM app.feature_flags')).rows.map((r) => String(r.sleutel)),
  );
  for (const beschermd of ['auth-poort', 'opa-afdwingen', 'rls', 'stap-op-uit', 'ssh-ca', 'orch-regels', 'terugdraaien']) {
    assert.equal(sleutels.has(beschermd), false, `Захисний перемикач ${beschermd} не може бути звичайним прапорцем`);
  }
});

test('L2-M2-16: кожен серверний маршрут із повторним підтвердженням особи має власний двомовний опис у shared/stap-op-beschrijving.ts · elke step-up-route heeft tweetalige beschrijving', async () => {
  const onopgelost = onopgelosteSjablonen('backend');
  assert.deepEqual(onopgelost, [], `Нерозв’язані шаблони маршрутів у backend/: ${onopgelost.join(', ')}`);

  const mechanisme = [/\/api\/owner\/access\/stap-op(\/|$)/, /\/api\/owner\/identity\/transactions\//];
  const routes = routesMetStapOp('backend').filter((r) => !mechanisme.some((re) => re.test(r.pad)));
  assert.ok(routes.length >= 20, 'Очікується перелік захищених маршрутів із підтвердженням доступу');
  const ontbrekend: string[] = [];
  for (const r of routes) {
    const b = beschrijfStapOp(actieVoorPad(r.voorbeeld), r.voorbeeld);
    if (!b.bekend || b.algemeen || !b.uk.trim() || !b.nl.trim()) {
      ontbrekend.push(`${r.methode} ${r.pad} (${r.bestand})`);
    }
  }
  assert.deepEqual(ontbrekend, [], `Маршрути без власного двомовного опису підтвердження: ${ontbrekend.join(', ')}`);

  execFileSync(process.execPath, ['scripts/stap-op-register-controle.mjs', '--stil'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
});

test('L2-B44: чисте ядро evalueer безпечно вимикає невідомі та вимкнені прапорці й шанує особисту перевірку тестувальника · evalueer faalt gesloten', async () => {
  const onbekend = evalueer('onbekende-vlag-xyz', undefined, 'gebruiker-1');
  assert.equal(onbekend.value, false);
  assert.equal(onbekend.reason, 'ERROR');
  assert.equal(onbekend.errorCode, 'FLAG_NOT_FOUND');

  const basisVlag: Vlag = {
    sleutel: 'proef-vlag',
    omschrijving: 'Перевірка',
    aan: false,
    standaard: true,
    percentage: 100,
    gebruikers: ['gebruiker-1'],
  };
  const uitgeschakeld = evalueer('proef-vlag', basisVlag, 'gebruiker-1');
  assert.equal(uitgeschakeld.value, false);
  assert.equal(uitgeschakeld.reason, 'DISABLED');

  const aanVoorAllen: Vlag = { ...basisVlag, aan: true, percentage: 0, standaard: true };
  const testerUit = evalueer('proef-vlag', aanVoorAllen, 'tester-1', false);
  assert.equal(testerUit.value, false);
  assert.equal(testerUit.metadata?.test, true);
});

test('L2-B45: перевіряльник пакунка controleerFunctievlaggen відхиляє початковий стан true, true і приймає двокрокову схему VLAG-001 · controleerFunctievlaggen handhaaft VLAG-001', async () => {
  const pakketMod = await laadScriptModule<{
    controleerFunctievlaggen: (o: {
      beleid: Record<string, unknown>;
      manifest: Record<string, unknown>;
      paden: string[];
      lees: (p: string) => string | null;
      versie: string;
    }) => Array<{ code: string; ernst: string }>;
  }>('scripts/orch/pakket.mjs');

  const beleid = JSON.parse(readFileSync(resolve('orchestratie/beleid.json'), 'utf8'));
  const versie = '20261123-120000';

  const zonderVlag = pakketMod.controleerFunctievlaggen({
    beleid,
    manifest: {},
    paden: ['src/App.tsx'],
    lees: () => 'inhoud',
    versie,
  });
  assert.ok(zonderVlag.some((z) => z.code === 'VLAG_ONTBREEKT' && z.ernst === 'fout'));

  const standaardAan = pakketMod.controleerFunctievlaggen({
    beleid,
    manifest: { functievlaggen: [{ sleutel: 'mijn-nieuwe-vlag', migratie: '0399_vlag.sql' }] },
    paden: ['src/App.tsx'],
    lees: (p) =>
      p === 'migrations/0399_vlag.sql'
        ? "INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard) VALUES ('mijn-nieuwe-vlag', 'опис', true, true) ON CONFLICT (sleutel) DO NOTHING;"
        : 'mijn-nieuwe-vlag',
    versie,
  });
  assert.ok(standaardAan.some((z) => z.code === 'VLAG_STANDAARD_AAN' && z.ernst === 'fout'));

  const tweetrapsGeldig = pakketMod.controleerFunctievlaggen({
    beleid,
    manifest: { functievlaggen: [{ sleutel: 'mijn-nieuwe-vlag', migratie: '0399_vlag.sql' }] },
    paden: ['src/App.tsx', 'migrations/0335_vlaggen_consolidatie_aan.sql'],
    lees: (p) =>
      p === 'migrations/0399_vlag.sql'
        ? "INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard) VALUES ('mijn-nieuwe-vlag', 'опис', false, false) ON CONFLICT (sleutel) DO NOTHING;"
        : p === 'migrations/0335_vlaggen_consolidatie_aan.sql'
          ? "UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = 'mijn-nieuwe-vlag';"
          : 'mijn-nieuwe-vlag',
    versie,
  });
  assert.deepEqual(
    tweetrapsGeldig.filter((z) => z.ernst === 'fout'),
    [],
    'Двокрокова схема (false, false у реєстрації + окрема UPDATE-міграція) мусить проходити без помилок',
  );
});

test('L2-B46: захищені файли правил AGENTS.md, orchestratie/beleid.json (1.8.0) та BESLUITEN.md збігаються з regels.lock.json · regels 1.8.0 en regels.lock.json ongewijzigd', async () => {
  const beleid = JSON.parse(readFileSync(resolve('orchestratie/beleid.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(resolve('orchestratie/regels.lock.json'), 'utf8'));
  assert.equal(beleid.regelsVersie, '1.8.0');
  assert.equal(lock.regelsVersie, '1.8.0');

  const bestandenMap = lock.bestanden as Record<string, string>;
  assert.ok(Object.keys(bestandenMap).length >= 3);
  for (const [relPad, verwachteHash] of Object.entries(bestandenMap)) {
    const feitelijkeHash = sha256Hex(readFileSync(resolve(relPad)));
    assert.equal(feitelijkeHash, verwachteHash, `Контрольна сума захищеного файла ${relPad} змінена без дозволу власника`);
  }
});

// ============================================================================
// Контур 2.6В. Обмеження 5 безпекових !-прапорців входу та права feature_flags (8 перевірок)
// ============================================================================

test('L2-B43: у таблиці app.feature_flags усі 5 безпекових прапорців способів входу мають standaard=false та percentage=0 · 5 aanmeldvlaggen standaard uit in DB', async () => {
  const { pg } = await kern();
  const sys = pg.getPool('systeem');
  const rijen = (
    await sys.query('SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)', [
      [...VIJF_VEILIGHEID_VLAGGEN],
    ])
  ).rows;
  assert.equal(rijen.length, 5, 'Усі 5 безпекових прапорців входу мають бути присутні в app.feature_flags');

  for (const r of rijen) {
    assert.equal(r.standaard, false, `Прапорець ${r.sleutel} не може мати standaard = true`);
    assert.equal(Number(r.percentage), 0, `Прапорець ${r.sleutel} не може мати відсоткового відкриття`);
    const vlagObj: Vlag = {
      sleutel: String(r.sleutel),
      omschrijving: '',
      aan: Boolean(r.aan),
      standaard: Boolean(r.standaard),
      percentage: Number(r.percentage),
      gebruikers: Array.isArray(r.gebruikers) ? r.gebruikers.map(String) : [],
    };
    const uitkomst = evalueer(vlagObj.sleutel, vlagObj, 'willekeurige-vreemde-gebruiker-999');
    assert.equal(uitkomst.value, false, `Випадковий сторонній користувач не може мати доступ до ${r.sleutel}`);
  }
});

test('L2-M2-17: схвалений звичайний користувач у живій БД отримує value === false (STATIC) у berekenen для всіх 5 безпекових прапорців · gewone gebruiker krijgt false op 5 aanmeldvlaggen', async () => {
  const { pg, vlaggenBeheer } = await kern();
  const sys = pg.getPool('systeem');
  const gewone = {
    id: randomUUID(),
    email: `gewoon-${randomBytes(4).toString('hex')}@example.invalid`,
    role: 'user',
    status: 'approved',
  };
  try {
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', gewone.id, gewone]);
    vlaggenBeheer.vlagGeheugenLeeg();
    const uitkomsten = await vlaggenBeheer.berekenen(gewone, [...VIJF_VEILIGHEID_VLAGGEN]);
    assert.equal(uitkomsten.length, 5);
    for (const u of uitkomsten) {
      assert.equal(u.value, false, `Звичайний користувач мусить отримувати false для ${u.key}`);
      assert.equal(u.reason, 'STATIC');
    }
  } finally {
    await sys.query('DELETE FROM app.records WHERE id = $1', [gewone.id]).catch(() => undefined);
  }
});

test('L2-M2-18: власник сайту у режимі «Тільки для мене» отримує TARGETING_MATCH (true), а ризикові прапорці в VLAG_UITLEG мають позначку ! · eigenaar krijgt TARGETING_MATCH en !-markering behouden', async () => {
  for (const metUitroepteken of [
    'gastcodes-iedereen',
    'aanmelden-passkey',
    'aanmelden-wachtwoord',
    'aanmelden-extern',
  ] as const) {
    const u = VLAG_UITLEG[metUitroepteken];
    assert.ok(u, `Бракує опису ${metUitroepteken} у VLAG_UITLEG`);
    assert.ok(u.naam[0].startsWith('! '), `Українська назва ${metUitroepteken} має починатися з "! "`);
    assert.ok(u.naam[1].startsWith('! '), `Нідерландська назва ${metUitroepteken} має починатися з "! "`);
  }
  assert.ok(VLAG_UITLEG['aanmelden-sms'], 'Опис aanmelden-sms має бути присутній у VLAG_UITLEG');

  const { pg, vlaggenBeheer } = await kern();
  await metSlot(async () => {
    const sys = pg.getPool('systeem');
    const eig = await zorgEigenaar();
    const oude = (
      await sys.query('SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)', [
        [...VIJF_VEILIGHEID_VLAGGEN],
      ])
    ).rows;
    try {
      await sys.query(
        'UPDATE app.feature_flags SET aan = true, standaard = false, percentage = 0, gebruikers = ARRAY[$1] WHERE sleutel = ANY($2)',
        [eig.id, [...VIJF_VEILIGHEID_VLAGGEN]],
      );
      vlaggenBeheer.vlagGeheugenLeeg();

      const voorEigenaar = await vlaggenBeheer.berekenen(eig, [...VIJF_VEILIGHEID_VLAGGEN]);
      for (const u of voorEigenaar) {
        assert.equal(u.value, true, `Власник має отримувати true для ${u.key}`);
        assert.equal(u.reason, 'TARGETING_MATCH');
      }
    } finally {
      for (const r of oude) {
        await sys
          .query('UPDATE app.feature_flags SET aan = $1, standaard = $2, percentage = $3, gebruikers = $4 WHERE sleutel = $5', [
            r.aan,
            r.standaard,
            r.percentage,
            r.gebruikers,
            r.sleutel,
          ])
          .catch(() => undefined);
      }
      vlaggenBeheer.vlagGeheugenLeeg();
    }
  });
});

test('L2-M2-19: користувач без активної технічної вкладки та тестувальник без прав адміністратора отримують відмови 403 при зміні прапорця · TECH_FLAGS_VEREIST en TECH_FLAGS_BEHEER_VEREIST', async () => {
  const { pg, context, routerMod, techProfiel, vlaggenBeheer } = await kern();
  const sys = pg.getPool('systeem');
  const eig = await zorgEigenaar();
  const sfx = randomBytes(4).toString('hex');
  const tester = {
    id: randomUUID(),
    email: `tester-vlag-${sfx}@example.invalid`,
    role: 'user',
    status: 'approved',
  };
  const tabEig = nieuwTabbladId();
  const tabTester = nieuwTabbladId();
  const tabZonder = nieuwTabbladId();
  let eigTech: Awaited<ReturnType<typeof maakActieveTechTab>> | null = null;
  let testerTech: Awaited<ReturnType<typeof maakActieveTechTab>> | null = null;

  try {
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', tester.id, tester]);
    eigTech = await maakActieveTechTab(eig, 'admin', tabEig, 30, 'надання ролі тестувальника');
    await eigTech.metTechContext(() =>
      techProfiel.toekennen(eig, tabEig, { email: tester.email, rollen: ['tester'], maxMinuten: 60 }),
    );
    await eigTech.opruimen();
    eigTech = null;

    await assert.rejects(
      () => vlaggenBeheer.beheerLijst(tester, tabZonder),
      (e: unknown) => e instanceof techProfiel.TechFout && e.code === 'TECH_FLAGS_VEREIST' && e.status === 403,
    );

    testerTech = await maakActieveTechTab(tester, 'admin', tabTester, 30, 'перевірка прав прапорців');
    const actieveTesterSessieId = testerTech.sessieId;
    const r = routerMod.router(
      vlaggenBeheer.flagsRoutes(async () => {
        context.zetGebruiker(tester.id, 'admin', tabTester, actieveTesterSessieId);
        context.sessieGeverifieerd();
        return { user: tester, service: 'admin' };
      }),
    );
    for (const [pad, lichaam] of [
      ['/api/beheer/flags/zetten', { tabContext: tabTester, vlag: { sleutel: `proef-${sfx}`, aan: true } }],
      ['/api/beheer/flags/stand', { tabContext: tabTester, sleutel: 'cloud-vnext', stand: 'alle' }],
      ['/api/beheer/flags/archief', { tabContext: tabTester, sleutel: 'cloud-vnext', inArchief: true }],
      ['/api/beheer/flags/verwijderen', { tabContext: tabTester, sleutel: 'cloud-vnext' }],
    ] as const) {
      const antw = await context.metVerzoek(`POST ${pad}`, () =>
        r(maakLambdaEvent({ method: 'POST', rawPath: pad, body: JSON.stringify(lichaam) })),
      );
      assert.equal(antw.statusCode, 403);
      assert.equal(JSON.parse(antw.body).error, 'TECH_FLAGS_BEHEER_VEREIST');
    }
  } finally {
    if (eigTech) await eigTech.opruimen();
    if (testerTech) await testerTech.opruimen();
    await sys.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = $1', [tester.id]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [tester.id]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [tester.id]).catch(() => undefined);
    await sys
      .query("DELETE FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = $1", [tester.id])
      .catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE id = $1', [tester.id]).catch(() => undefined);
  }
});

test('L2-M2-20: функція vlagFout відхиляє ключі з великими літерами, відсотки поза 0..100, наддовгі описи та списки > 200 осіб · vlagFout grenswaarden', async () => {
  const geldig: Vlag = {
    sleutel: 'geldige-sleutel-1',
    omschrijving: 'Короткий опис',
    aan: true,
    standaard: false,
    percentage: 0,
    gebruikers: [],
  };
  assert.equal(vlagFout(geldig), null);
  for (const slechteSleutel of ['Hoofd', 'ab', 'a'.repeat(42), '1start-cijfer', 'met_underscore']) {
    assert.equal(vlagFout({ ...geldig, sleutel: slechteSleutel }), 'SLEUTEL_ONGELDIG');
  }
  assert.equal(vlagFout({ ...geldig, percentage: -1 }), 'PERCENTAGE_ONGELDIG');
  assert.equal(vlagFout({ ...geldig, percentage: 101 }), 'PERCENTAGE_ONGELDIG');
  assert.equal(vlagFout({ ...geldig, percentage: 12.5 }), 'PERCENTAGE_ONGELDIG');
  assert.equal(vlagFout({ ...geldig, omschrijving: 'о'.repeat(301) }), 'OMSCHRIJVING_ONGELDIG');
  assert.equal(
    vlagFout({ ...geldig, gebruikers: Array.from({ length: 201 }, (_, i) => `u-${i}`) }),
    'GEBRUIKERS_ONGELDIG',
  );
});

test('L2-M2-21: база даних відхиляє особисту перевірку прапорця довшу за 8 годин і гасить прострочені тестові значення · 8-uursgrens op feature_flag_tests', async () => {
  const { pg, vlaggenBeheer } = await kern();
  const sys = pg.getPool('systeem');
  const testGebruiker = randomUUID();
  const vlagSleutel = `proef-8u-${randomBytes(3).toString('hex')}`;
  try {
    await sys.query(
      "INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard, percentage, gebruikers) VALUES ($1, 'проба', false, false, 0, '{}')",
      [vlagSleutel],
    );
    vlaggenBeheer.vlagGeheugenLeeg();

    await assert.rejects(
      () =>
        sys.query(
          "INSERT INTO app.feature_flag_tests (user_id, sleutel, waarde, gezet_op, tot) VALUES ($1, $2, true, now(), now() + interval '9 hours')",
          [testGebruiker, vlagSleutel],
        ),
      'Обмеження CHECK у app.feature_flag_tests не повинно пропускати інтервал 9 годин',
    );

    await sys.query(
      "INSERT INTO app.feature_flag_tests (user_id, sleutel, waarde, gezet_op, tot) VALUES ($1, $2, true, now() - interval '2 hours', now() - interval '1 minute')",
      [testGebruiker, vlagSleutel],
    );
    const [uitkomst] = await vlaggenBeheer.berekenen({ id: testGebruiker }, [vlagSleutel]);
    assert.equal(uitkomst.value, false, 'Прострочений запис у feature_flag_tests не повинен діяти');
  } finally {
    await sys.query('DELETE FROM app.feature_flag_tests WHERE sleutel = $1', [vlagSleutel]).catch(() => undefined);
    await sys.query('DELETE FROM app.feature_flags WHERE sleutel = $1', [vlagSleutel]).catch(() => undefined);
    vlaggenBeheer.vlagGeheugenLeeg();
  }
});

test('L2-M2-22: жоден серверний модуль перевірки повноважень не імпортує систему прапорців як джерело прав доступу · geen autorisatiemodule importeert vlaggen', async () => {
  const autorisatieBestanden = [
    'backend/rbac.ts',
    'backend/tech-profiel.ts',
    'backend/ruimte-scheiding.ts',
    'backend/stap-op.ts',
    'backend/api-recht.ts',
    'backend/beveiliging-schakelaars.ts',
    ...verzamelBestanden('server/platform', ['.ts']).map((p) => p.slice(process.cwd().length + 1)),
  ];
  const vlagImportRe = /from\s+['"][^'"]*\/vlaggen(?:\.ts)?['"]|import\s*\(\s*['"][^'"]*\/vlaggen(?:\.ts)?['"]\s*\)/;
  const overtreders = autorisatieBestanden.filter((rel) => vlagImportRe.test(readFileSync(resolve(rel), 'utf8')));
  assert.deepEqual(overtreders, [], `Модулі повноважень не можуть залежати від прапорців: ${overtreders.join(', ')}`);
});

test('L2-M2-23: за увімкнених хмарних прапорців без process.env звичайний користувач отримує 403 на маршрутах політик M6 і M10 · 403 voor niet-eigenaar op M6 en M10', async () => {
  const { pg, routerMod, vlaggenBeheer, cloudM6, cloudM10 } = await kern();
  await metSlot(async () => {
    const sys = pg.getPool('systeem');
    const gewone = {
      id: randomUUID(),
      email: `cloud-gewoon-${randomBytes(4).toString('hex')}@example.invalid`,
      role: 'user',
      status: 'approved',
    };
    const oudM6 = process.env.CLOUD_M6_ADMIN_STAGING;
    const oudM10 = process.env.CLOUD_M10_ADMIN_STAGING;
    const oudeCloudVlaggen = (
      await sys.query("SELECT sleutel, aan, standaard FROM app.feature_flags WHERE sleutel LIKE '%cloud%'")
    ).rows;
    try {
      delete process.env.CLOUD_M6_ADMIN_STAGING;
      delete process.env.CLOUD_M10_ADMIN_STAGING;
      await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', gewone.id, gewone]);
      await sys.query("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel LIKE '%cloud%'");
      vlaggenBeheer.vlagGeheugenLeeg();

      const m6 = routerMod.router(cloudM6.createCloudM6AdminRoutes(async () => ({ service: 'cloud', user: gewone })));
      const antwM6 = await m6(
        maakLambdaEvent({
          rawPath: '/api/owner/cloud/integrations/v1/admin/policies/change',
          body: JSON.stringify({ tabContext: nieuwTabbladId() }),
        }),
      );
      assert.equal(
        antwM6.statusCode,
        403,
        `Очікується 403 CLOUD_M6_OWNER_TECH_REQUIRED за прапорцем у БД замість ${antwM6.statusCode} (віхи M3 + M5)`,
      );
      assert.equal(JSON.parse(antwM6.body).error, 'CLOUD_M6_OWNER_TECH_REQUIRED');

      const m10 = routerMod.router(
        cloudM10.createM10CloudAdminRoutes(
          async () => ({ service: 'admin', user: gewone }),
          async () => null,
        ),
      );
      const antwM10 = await m10(
        maakLambdaEvent({
          rawPath: '/api/owner/admin/cloud/providers/change',
          body: JSON.stringify({ tabContext: nieuwTabbladId() }),
        }),
      );
      assert.equal(
        antwM10.statusCode,
        403,
        `Очікується 403 CLOUD_ADMIN_TECH_OWNER_REQUIRED за прапорцем у БД замість ${antwM10.statusCode} (віхи M3 + M5)`,
      );
      assert.equal(JSON.parse(antwM10.body).error, 'CLOUD_ADMIN_TECH_OWNER_REQUIRED');
    } finally {
      if (oudM6 !== undefined) process.env.CLOUD_M6_ADMIN_STAGING = oudM6;
      if (oudM10 !== undefined) process.env.CLOUD_M10_ADMIN_STAGING = oudM10;
      for (const r of oudeCloudVlaggen) {
        await sys
          .query('UPDATE app.feature_flags SET aan = $1, standaard = $2 WHERE sleutel = $3', [r.aan, r.standaard, r.sleutel])
          .catch(() => undefined);
      }
      vlaggenBeheer.vlagGeheugenLeeg();
      await sys.query('DELETE FROM app.records WHERE id = $1', [gewone.id]).catch(() => undefined);
    }
  });
});

// ============================================================================
// Контур 2.7А. Захист WebDAV / CalDAV / хмарних маршрутів від SSRF та меж (9 перевірок)
// ============================================================================

test('L2-M2-24: pinnedFetch та veiligCaldavAdres відхиляють http:// та посилання з вбудованими обліковими даними · geen HTTP of ingebedde wachtwoorden', async () => {
  const { veiligeFetch } = await kern();
  await assert.rejects(() => veiligeFetch.pinnedFetch('http://cloud.example.org/dav'), /REMOTE_URL_INVALID/);
  await assert.rejects(() => veiligeFetch.pinnedFetch('ftp://cloud.example.org/dav'), /REMOTE_URL_INVALID/);

  assert.equal(veiligCaldavAdres('http://nextcloud.example.org/dav').fout, 'CALDAV_SCHEMA_NIET_TOEGESTAAN');
  assert.equal(veiligCaldavAdres('https://gebruiker:geheim@cloud.example.org/dav').fout, 'CALDAV_ADRES_MET_WACHTWOORD');
  assert.equal(veiligCaldavAdres('').fout, 'CALDAV_ADRES_LEEG');
  const schoon = veiligCaldavAdres('https://cloud.example.org/remote.php/dav/?lek=1#anker');
  assert.equal(schoon.fout, '');
  assert.equal(schoon.adres, 'https://cloud.example.org/remote.php/dav/');
});

test('L2-M2-25: петльові адреси (127.0.0.1, ::1, ::ffff:127.0.0.1, 0:0:0:0:0:0:0:1) миттєво блокуються кодом SSRF_ADRES_GEWEIGERD · loopback geweigerd', async () => {
  const { veiligeFetch } = await kern();
  for (const lusAdres of ['127.0.0.1', '127.255.0.9', '::1', '::ffff:127.0.0.1', '0:0:0:0:0:0:0:1']) {
    assert.equal(veiligeFetch.privateAddress(lusAdres), true, `Петльова адреса ${lusAdres} мусить вважатися приватною`);
    const url = lusAdres.includes(':') ? `https://[${lusAdres}]/dav` : `https://${lusAdres}/dav`;
    await assert.rejects(() => veiligeFetch.pinnedFetch(url), /SSRF_ADRES_GEWEIGERD/);
  }
});

test('L2-M2-26: адреса служби метаданих хмар (169.254.169.254) та канальні адреси (fe80::1) блокуються кодом SSRF_ADRES_GEWEIGERD · cloud-metadata en link-local geweigerd', async () => {
  const { veiligeFetch } = await kern();
  await assert.rejects(() => veiligeFetch.pinnedFetch('https://169.254.169.254/latest/meta-data/'), /SSRF_ADRES_GEWEIGERD/);
  await assert.rejects(() => veiligeFetch.pinnedFetch('https://[fe80::1]/dav'), /SSRF_ADRES_GEWEIGERD/);
  await assert.rejects(() => veiligeFetch.pinnedStream('https://169.254.169.254/stroom'), /SSRF_ADRES_GEWEIGERD/);
});

test('L2-M2-27: приватні діапазони RFC 1918, CGNAT та ULA визначаються як непублічні у privateAddress · RFC1918, CGNAT en ULA niet-publiek', async () => {
  const { veiligeFetch } = await kern();
  for (const intern of ['10.0.0.1', '10.254.82.17', '172.16.10.5', '172.31.255.254', '192.168.1.1', '100.64.0.1', 'fd12:3456::1']) {
    assert.equal(veiligeFetch.privateAddress(intern), true, `Внутрішня адреса ${intern} має бути непублічною`);
  }
  assert.equal(veiligeFetch.privateAddress('93.184.216.34'), false, 'Публічна адреса не повинна блокуватися як приватна');
});

test('L2-M2-28: маршрут підключення хмарного WebDAV (Nextcloud / NAS) відхиляє http:// та внутрішні мережі проти SSRF і приховує пароль · WebDAV blokkeert SSRF en verbergt wachtwoord', async () => {
  const { pg, backendIndex } = await kern();
  const nc = CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === 'nextcloud');
  const nas = CLOUD_VNEXT_AANBIEDERS.find((a) => a.id === 'nas-webdav');
  assert.ok(
    nc && nc.stand !== 'gepland' && nas && nas.stand !== 'gepland',
    'Очікується переведення постачальників nextcloud та nas-webdav зі стану gepland у робочий WebDAV (віха M3, З-13)',
  );

  const webdavPatroon =
    backendIndex.handler.patronen.find((p) =>
      /^POST\s+\/api\/.*webdav.*(koppel|verbind|bewaar|nieuw|toevoeg|start|controleer|test|account)/i.test(p),
    ) ??
    backendIndex.handler.patronen.find(
      (p) => /^POST\s+\/api\/.*webdav/i.test(p) && !/lijst|list|ontkoppel|verwijder|delete/i.test(p),
    );
  assert.ok(webdavPatroon, 'Очікується зареєстрований серверний маршрут підключення/перевірки WebDAV у handler.patronen (віха M3)');

  const [, ruwPad] = webdavPatroon.trim().split(/\s+/);
  const pad = ruwPad.replace(/:([A-Za-z0-9_]+)/g, 'nextcloud');
  const sys = pg.getPool('systeem');
  const proefGebruiker = randomUUID();
  const proefWachtwoord = nepGeheim('wdav_', 'app_', 'wachtwoord_geheim_99');
  let sessieId = '';

  try {
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
      'users',
      proefGebruiker,
      { email: `webdav-${proefGebruiker.slice(0, 8)}@example.invalid`, role: 'member', status: 'approved', name: 'Учасник' },
    ]);
    const sessie = await maakSessieVoorDienst(proefGebruiker, 'cloud');
    sessieId = sessie.sessieId;

    for (const onveiligAdres of [
      'http://nextcloud.example.com/remote.php/dav',
      'https://127.0.0.1/remote.php/dav',
      'https://[::1]/remote.php/dav',
      'https://169.254.169.254/dav',
      'https://10.0.0.5/dav',
      'https://192.168.0.10/dav',
    ]) {
      const antw = await backendIndex.handler(
        maakLambdaEvent({
          method: 'POST',
          rawPath: pad,
          headers: {
            host: sessie.host,
            origin: `https://${sessie.host}`,
            'content-type': 'application/json',
            cookie: sessie.cookie,
          },
          body: JSON.stringify({
            aanbieder: 'nextcloud',
            provider: 'nextcloud',
            adres: onveiligAdres,
            url: onveiligAdres,
            serverUrl: onveiligAdres,
            gebruiker: 'gebruiker',
            username: 'gebruiker',
            wachtwoord: proefWachtwoord,
            password: proefWachtwoord,
          }),
        }),
      );
      assert.ok(
        antw.statusCode === 400 || antw.statusCode === 403,
        `Небезпечна адреса WebDAV ${onveiligAdres} має відхилятися кодом 400/403, отримано ${antw.statusCode}`,
      );
      assert.equal(antw.body.includes(proefWachtwoord), false, 'Пароль застосунку ніколи не повертається у відповіді');
    }
  } finally {
    if (sessieId) await sys.query('DELETE FROM app.records WHERE id = $1', [sessieId]).catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE id = $1', [proefGebruiker]).catch(() => undefined);
  }
});

test('L2-M2-29: caldavAbsoluut блокує перенаправлення href з відповіді PROPFIND на чужий домен або внутрішній вузол · caldavAbsoluut weigert vreemde host', async () => {
  assert.equal(caldavAbsoluut('https://caldav.fastmail.com/dav/', 'https://127.0.0.1/steal'), '');
  assert.equal(caldavAbsoluut('https://caldav.fastmail.com/dav/', 'https://p01-caldav.icloud.com/123/'), '');
  assert.equal(caldavAbsoluut('https://caldav.fastmail.com/dav/', 'http://caldav.fastmail.com/dav/x'), '');
  assert.equal(caldavAbsoluut('https://caldav.fastmail.com/dav/', 'https://u:p@caldav.fastmail.com/dav/x'), '');
  assert.equal(
    caldavAbsoluut('https://caldav.icloud.com/', 'https://p42-caldav.icloud.com/123/calendars/'),
    'https://p42-caldav.icloud.com/123/calendars/',
  );
});

test('L2-M2-30: лінійний розбирач caldavWaarden обробляє ворожу XML-відповідь із 50 000 незакритих тегів швидше ніж за 200 мс · lineaire XML-ontleder zonder vastlopen', async () => {
  const vijandigeXml = '<d:response><d:href>'.repeat(50_000);
  const start = performance.now();
  const waarden = caldavWaarden(vijandigeXml, 'href');
  const duurMs = performance.now() - start;
  assert.ok(duurMs < 200, `Розбір 50 000 незакритих тегів тривав ${duurMs.toFixed(1)} мс (межа 200 мс)`);
  assert.ok(waarden.length <= CALDAV_MAX_WAARDEN);
});

test('L2-M2-31: за прапорцем хмари від’єднання облікового запису без confirm: true відхиляється 400 CLOUD_DISCONNECT_EXPLICIT_CONFIRMATION_REQUIRED · disconnect vereist confirm: true', async () => {
  const { pg, routerMod, vlaggenBeheer, cloudM4 } = await kern();
  await metSlot(async () => {
    const sys = pg.getPool('systeem');
    const oudM4 = process.env.CLOUD_M4_CONNECTIONS_STAGING;
    const oudeCloudVlaggen = (
      await sys.query("SELECT sleutel, aan, standaard FROM app.feature_flags WHERE sleutel LIKE '%cloud%'")
    ).rows;
    try {
      delete process.env.CLOUD_M4_CONNECTIONS_STAGING;
      await sys.query("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel LIKE '%cloud%'");
      vlaggenBeheer.vlagGeheugenLeeg();

      const m4 = routerMod.router(
        cloudM4.createM4CloudRoutes(async () => ({
          service: 'cloud',
          user: { id: 'u-cloud-1', email: 'u1@example.invalid', status: 'approved' },
        })),
      );
      const antw = await m4(
        maakLambdaEvent({
          rawPath: '/api/owner/cloud/integrations/v1/accounts/acc-1/disconnect',
          body: JSON.stringify({ confirm: false }),
        }),
      );
      assert.equal(
        antw.statusCode,
        400,
        `Очікується 400 CLOUD_DISCONNECT_EXPLICIT_CONFIRMATION_REQUIRED за прапорцем хмари без process.env, отримано ${antw.statusCode} (віхи M3 + M5)`,
      );
      assert.equal(JSON.parse(antw.body).error, 'CLOUD_DISCONNECT_EXPLICIT_CONFIRMATION_REQUIRED');
    } finally {
      if (oudM4 !== undefined) process.env.CLOUD_M4_CONNECTIONS_STAGING = oudM4;
      for (const r of oudeCloudVlaggen) {
        await sys
          .query('UPDATE app.feature_flags SET aan = $1, standaard = $2 WHERE sleutel = $3', [r.aan, r.standaard, r.sleutel])
          .catch(() => undefined);
      }
      vlaggenBeheer.vlagGeheugenLeeg();
    }
  });
});

test('L2-M2-32: пакетний перегляд понад 8 тек (/directory/batch) та невідомий постачальник у /accounts/start за прапорцями хмари дають 400 · batchlimiet en providercontrole M4/M8', async () => {
  const { pg, routerMod, vlaggenBeheer, cloudM4, cloudM8 } = await kern();
  await metSlot(async () => {
    const sys = pg.getPool('systeem');
    const oudM4 = process.env.CLOUD_M4_CONNECTIONS_STAGING;
    const oudM8 = process.env.CLOUD_M8_DIRECTORY_STAGING;
    const oudeCloudVlaggen = (
      await sys.query("SELECT sleutel, aan, standaard FROM app.feature_flags WHERE sleutel LIKE '%cloud%'")
    ).rows;
    try {
      delete process.env.CLOUD_M4_CONNECTIONS_STAGING;
      delete process.env.CLOUD_M8_DIRECTORY_STAGING;
      await sys.query("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel LIKE '%cloud%'");
      vlaggenBeheer.vlagGeheugenLeeg();

      const authCloud = async () => ({
        service: 'cloud',
        user: { id: 'u-cloud-2', email: 'u2@example.invalid', status: 'approved' },
      });
      const nepRuntime = {
        list: async () => ({ entries: [], nextCursor: null }),
        across: async () => [],
      };
      const r = routerMod.router({
        ...cloudM4.createM4CloudRoutes(authCloud),
        ...cloudM8.createM8CloudRoutes(authCloud, nepRuntime),
      });

      const teGroteBatch = Array.from({ length: 9 }, (_, i) => ({ accountId: `acc-${i}`, folderId: 'root' }));
      const antwBatch = await r(
        maakLambdaEvent({
          rawPath: '/api/owner/cloud/integrations/v1/directory/batch',
          body: JSON.stringify({ requests: teGroteBatch }),
        }),
      );
      assert.equal(antwBatch.statusCode, 400, 'Очікується 400 CLOUD_M8_BATCH_INVALID за прапорцем хмари (віхи M3 + M5)');
      assert.equal(JSON.parse(antwBatch.body).error, 'CLOUD_M8_BATCH_INVALID');

      const antwProvider = await r(
        maakLambdaEvent({
          rawPath: '/api/owner/cloud/integrations/v1/accounts/start',
          body: JSON.stringify({ provider: 'kwaadaardige-wolk', mode: 'read' }),
        }),
      );
      assert.equal(antwProvider.statusCode, 400);
      assert.equal(JSON.parse(antwProvider.body).error, 'CLOUD_PROVIDER_OR_MODE_INVALID');
    } finally {
      if (oudM4 !== undefined) process.env.CLOUD_M4_CONNECTIONS_STAGING = oudM4;
      if (oudM8 !== undefined) process.env.CLOUD_M8_DIRECTORY_STAGING = oudM8;
      for (const r of oudeCloudVlaggen) {
        await sys
          .query('UPDATE app.feature_flags SET aan = $1, standaard = $2 WHERE sleutel = $3', [r.aan, r.standaard, r.sleutel])
          .catch(() => undefined);
      }
      vlaggenBeheer.vlagGeheugenLeeg();
    }
  });
});

// ============================================================================
// Контур 2.7Б. Поштовий контур IMAP/SMTP, криптографія Telegram, MCP Origin та SVG (12 перевірок)
// ============================================================================

test('L2-B48: маршрут POST /api/owner/mail/imap/koppelen відхиляє керувальні символи переносу рядка CR/LF та невідомі постачальники кодом 400 · IMAP-route weigert CR/LF vóór verbinding', async () => {
  const { routerMod, mailImap } = await kern();
  const imapRouter = routerMod.router(
    mailImap.createMailImapRoutes(async () => ({
      service: 'mail',
      user: { id: 'imap-gebruiker-1', status: 'approved', email: 'imap1@example.invalid' },
    })),
  );

  const metCrLfAdres = await imapRouter(
    maakLambdaEvent({
      rawPath: '/api/owner/mail/imap/koppelen',
      body: JSON.stringify({
        aanbieder: 'icloud',
        adres: 'persoon@icloud.com\r\na2 LOGOUT',
        wachtwoord: nepGeheim('abcd-', 'efgh-', 'ijkl-', 'mnop'),
      }),
    }),
  );
  assert.equal(metCrLfAdres.statusCode, 400);
  assert.equal(JSON.parse(metCrLfAdres.body).fout, 'MAIL_IMAP_ADRES_ONGELDIG');

  const metVrijeHost = await imapRouter(
    maakLambdaEvent({
      rawPath: '/api/owner/mail/imap/koppelen',
      body: JSON.stringify({
        aanbieder: '127.0.0.1\r\n',
        adres: 'persoon@icloud.com',
        wachtwoord: nepGeheim('abcd-', 'efgh-', 'ijkl-', 'mnop'),
      }),
    }),
  );
  assert.equal(metVrijeHost.statusCode, 400);
  assert.equal(JSON.parse(metVrijeHost.body).fout, 'MAIL_IMAP_AANBIEDER_ONBEKEND');
});

test('L2-M2-33: пошта приймає лише закріплені хости з MAIL_IMAP_AANBIEDERS (включно з fastmail) і відхиляє довільні хости та служби nog-niet · vaste IMAP-hosts inclusief fastmail', async () => {
  const { veiligeFetch } = await kern();
  assert.equal(mailAanbieder('127.0.0.1'), null);
  assert.equal(mailAanbieder('localhost'), null);
  assert.equal(mailAanbieder('onlineua')?.wijze, 'nog-niet');
  assert.equal(mailAanbieder('proton')?.wijze, 'nog-niet');

  const fastmail = mailAanbieder('fastmail');
  assert.ok(fastmail, 'Очікується шаблон постачальника fastmail у shared/mail-aanbieders.ts (віха M3, З-13)');
  assert.equal(fastmail.wijze, 'imap-app-wachtwoord');
  assert.equal(fastmail.imap?.host, 'imap.fastmail.com');
  assert.equal(fastmail.imap?.poort, 993);
  assert.equal(fastmail.imap?.versleuteling, 'tls');
  assert.equal(mailAanbiederVolledig(fastmail), true);
  assert.ok(MAIL_IMAP_AANBIEDERS.some((a) => a.id === 'fastmail'));

  for (const a of MAIL_IMAP_AANBIEDERS) {
    assert.ok(a.imap?.host && !veiligeFetch.privateAddress(a.imap.host) && !/[\s\r\n]/.test(a.imap.host));
    assert.ok(a.smtp?.host && !veiligeFetch.privateAddress(a.smtp.host) && !/[\s\r\n]/.test(a.smtp.host));
  }
});

test('L2-M2-34: функції geldigMailAdres та schoonAppWachtwoord очищають CR/LF/TAB, nulUitWaarden знімає NUL, а MAIL_IMAP_GEHEIME_VELDEN приховані · IMAP-reiniging en geheimvelden', async () => {
  const { mailImap, routerMod } = await kern();
  assert.equal(geldigMailAdres('a@b.nl\r\nLOGOUT'), '');
  assert.equal(geldigMailAdres('a@b.nl\nQUIT'), '');
  assert.equal(geldigMailAdres('a@b.nl\tAUTH'), '');
  assert.equal(geldigMailAdres(`${'x'.repeat(321)}@b.nl`), '');
  assert.equal(geldigMailAdres('Persoon@Example.NL '), 'persoon@example.nl');
  const metNul = { adres: 'a@b.nl\u0000' };
  assert.equal(routerMod.nulUitWaarden(metNul), true);
  assert.equal(metNul.adres, 'a@b.nl');
  assert.equal(schoonAppWachtwoord('abcd efgh\r\nLOGIN\u0009xyz'), 'abcdefghLOGINxyz');
  assert.deepEqual([...MAIL_IMAP_GEHEIME_VELDEN], ['geheim', 'wachtwoord', 'appWachtwoord', 'password']);

  for (const kaart of mailImap.mailAanbiedersVoorPagina()) {
    for (const geheimVeld of MAIL_IMAP_GEHEIME_VELDEN) {
      assert.equal(geheimVeld in kaart, false);
    }
  }
});

test('L2-M2-35: контекст mailImapAad криптографічно розділяє паролі застосунків між просторами prive та technisch · mailImapAad scheidt ruimtes', async () => {
  const { mailImap, sleutelkluis } = await kern();
  const aadPrive = mailImap.mailImapAad('gebruiker-1', 'koppeling-1', 'prive');
  const aadTech = mailImap.mailImapAad('gebruiker-1', 'koppeling-1', 'technisch');
  assert.notEqual(aadPrive, aadTech);

  const dek = randomBytes(32);
  const zegel = sleutelkluis.verzegelMetDek(dek, nepGeheim('imap-', 'geheim-', '1234'), aadPrive);
  assert.throws(() => sleutelkluis.ontzegelMetDek(dek, zegel, aadTech));
  assert.throws(() => sleutelkluis.ontzegelMetDek(dek, zegel, mailImap.mailImapAad('gebruiker-2', 'koppeling-1', 'prive')));
});

test('L2-B49: захищене вікно входу через Telegram відхиляє підроблений маркер вікна та зіпсовані initData без витоку ключа · Telegram-venster weigert vervalste invoer', async () => {
  const { tgVenster } = await kern();
  const nepBotSleutel = nepGeheim('123456789:', 'AAH_nep_telegram_sleutel_voor_proef_99');
  const k1 = await tgVenster.vensterKiezen({ t: 'vervalst.token.waarde', initData: 'hash=' + '0'.repeat(64), pos: 0 });
  const k2 = await tgVenster.vensterCode({ t: 'vervalst.token.waarde', code: '123456' });
  const k3 = await tgVenster.vensterWeigeren({ t: '' });

  assert.equal(k1.uitkomst, 'verlopen');
  assert.equal(k2.ok, false);
  assert.equal(k2.uitkomst, 'verlopen');
  assert.equal(k3.uitkomst, 'verlopen');
  assert.equal(JSON.stringify([k1, k2, k3]).includes(nepBotSleutel), false);
});

test('L2-M2-36: підроблений підпис віджета Telegram або підміна поля після підпису дає HANDTEKENING_ONGELDIG · widgetControle detecteert manipulatie', async () => {
  const { tgCrypto } = await kern();
  const botToken = nepGeheim('987654321:', 'AAFakeBotSleutelVoorCryptografieTest01');
  const nuSec = 1_760_000_000;
  const basisVelden = { auth_date: String(nuSec), first_name: 'Олена', id: '44556677', username: 'olena_ua' };
  const sleutel = createHash('sha256').update(botToken).digest();
  const reeks = Object.entries(basisVelden)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const hash = createHmac('sha256', sleutel).update(reeks).digest('hex');

  const geldig = tgCrypto.widgetControle({ ...basisVelden, hash }, botToken, nuSec);
  assert.equal(geldig.ok, true);
  assert.equal(geldig.vers, true);

  const gewijzigdeNaam = tgCrypto.widgetControle({ ...basisVelden, first_name: 'Зловмисник', hash }, botToken, nuSec);
  assert.equal(gewijzigdeNaam.ok, false);
  assert.equal(gewijzigdeNaam.reden, 'HANDTEKENING_ONGELDIG');

  const andereBit = `${hash.slice(0, 63)}${hash.endsWith('a') ? 'b' : 'a'}`;
  const gewijzigdeHash = tgCrypto.widgetControle({ ...basisVelden, hash: andereBit }, botToken, nuSec);
  assert.equal(gewijzigdeHash.ok, false);
  assert.equal(gewijzigdeHash.reden, 'HANDTEKENING_ONGELDIG');
});

test('L2-M2-37: прострочені (> 300 с) та майбутні (> +60 с) мітки auth_date у widgetControle та initDataControle дають VERLOPEN · tijdgrenzen op auth_date', async () => {
  const { tgCrypto } = await kern();
  const botToken = nepGeheim('987654321:', 'AAFakeBotSleutelVoorTijdgrensTest02');
  const nuSec = 1_760_000_000;
  const widgetSleutel = createHash('sha256').update(botToken).digest();
  const webAppGeheim = createHmac('sha256', 'WebAppData').update(botToken).digest();

  for (const authDate of [nuSec - 301, nuSec + 61]) {
    const velden = { auth_date: String(authDate), id: '778899' };
    const wHash = createHmac('sha256', widgetSleutel).update(`auth_date=${authDate}\nid=778899`).digest('hex');
    const wUit = tgCrypto.widgetControle({ ...velden, hash: wHash }, botToken, nuSec);
    assert.equal(wUit.vers, false);
    assert.equal(wUit.reden, 'VERLOPEN');

    const userJson = JSON.stringify({ id: 778899, first_name: 'Тарас' });
    const checkReeks = `auth_date=${authDate}\nuser=${userJson}`;
    const iHash = createHmac('sha256', webAppGeheim).update(checkReeks).digest('hex');
    const params = new URLSearchParams({ auth_date: String(authDate), user: userJson, hash: iHash });
    const iUit = tgCrypto.initDataControle(params.toString(), botToken, nuSec);
    assert.equal(iUit.vers, false);
    assert.equal(iUit.reden, 'VERLOPEN');
  }
});

test('L2-M2-38: initDataControle підтримує поле signature (Bot API 8.0+) і відхиляє пошкоджений JSON користувача з VELDEN_ONGELDIG · Bot API 8.0 signature en JSON-controle', async () => {
  const { tgCrypto } = await kern();
  const botToken = nepGeheim('987654321:', 'AAFakeBotSleutelVoorInitDataTest03');
  const nuSec = 1_760_000_000;
  const geheim = createHmac('sha256', 'WebAppData').update(botToken).digest();

  const userJson = JSON.stringify({ id: 112233, first_name: 'Ірина' });
  const metSigVelden: Record<string, string> = {
    auth_date: String(nuSec),
    query_id: 'AAHdF6IQAAAAAN0XohA',
    signature: 'ed25519_handtekening_van_telegram_bot_api_8',
    user: userJson,
  };
  const reeks = Object.entries(metSigVelden)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const hash = createHmac('sha256', geheim).update(reeks).digest('hex');
  const initTekst = new URLSearchParams({ ...metSigVelden, hash }).toString();

  const okUit = tgCrypto.initDataControle(initTekst, botToken, nuSec);
  assert.equal(okUit.ok, true);
  assert.equal(okUit.vers, true);
  assert.equal(okUit.reden, '');

  const kapotVelden: Record<string, string> = { auth_date: String(nuSec), user: '{kapotte-json' };
  const kapotReeks = `auth_date=${nuSec}\nuser={kapotte-json`;
  const kapotHash = createHmac('sha256', geheim).update(kapotReeks).digest('hex');
  const kapotUit = tgCrypto.initDataControle(new URLSearchParams({ ...kapotVelden, hash: kapotHash }).toString(), botToken, nuSec);
  assert.equal(kapotUit.ok, false);
  assert.equal(kapotUit.reden, 'VELDEN_ONGELDIG');
});

test('L2-M2-39: маркери кнопок бота відхиляють інший telegramId, змінений час дії, невідому дію та символи CR/LF · knoptokens gebonden en CR/LF-vrij', async () => {
  const { tgCrypto } = await kern();
  const sleutel = tgCrypto.knopSleutel(nepGeheim('webhook_', 'geheim_', 'voor_knoppen_test_32_tekens_lang'));
  const id = tgCrypto.nieuweId();
  const vervalt = 1_760_000_300;
  const getekend = tgCrypto.knopTekenen(sleutel, 'b', id, '55667788', vervalt);
  const gelezen = tgCrypto.knopLezen(getekend);
  assert.ok(gelezen);
  assert.equal(tgCrypto.knopHandtekeningKlopt(sleutel, gelezen, '55667788', vervalt), true);
  assert.equal(tgCrypto.knopHandtekeningKlopt(sleutel, gelezen, '99999999', vervalt), false);
  assert.equal(tgCrypto.knopHandtekeningKlopt(sleutel, gelezen, '55667788', vervalt + 1), false);
  assert.equal(tgCrypto.knopHandtekeningKlopt(sleutel, { ...gelezen, letter: 'n' }, '55667788', vervalt), false);

  assert.equal(tgCrypto.knopLezen(`${getekend}\r\n`), null);
  assert.equal(tgCrypto.knopLezen(`${getekend}\n`), null);
  assert.equal(tgCrypto.knopLezen(`q.${id}.${gelezen.sig}`), null, 'Невідома літера дії q має відхилятися');
});

test('L2-M2-40: порівняння секрету приймача подій у сталий час (gelijk) відхиляє порожні значення та рядки різної довжини · constante-tijd gelijk()', async () => {
  const { tgCrypto } = await kern();
  assert.equal(tgCrypto.gelijk('', 'geheim'), false);
  assert.equal(tgCrypto.gelijk('geheim', 'geheim2'), false);
  assert.equal(tgCrypto.gelijk('geheim\r', 'geheim'), false);
  assert.equal(tgCrypto.gelijk('geheim', 'geheim'), true);
});

test('L2-B50: перевірка Origin у backend/mcp-origin.ts відхиляє чужі походження на шляхах isMcpRpcPad і пропускає канонічні піддомени · MCP Origin-bescherming', async () => {
  const { mcpOrigin, identiteit } = await kern();
  assert.equal(mcpOrigin.isMcpRpcPad('/api/mcp-connector/rpc'), true);
  assert.equal(mcpOrigin.isMcpRpcPad('/api/connector-v2/claude/rpc'), true);
  assert.equal(mcpOrigin.isMcpRpcPad('/api/flags'), false);

  const eigenOrigins = Object.values(identiteit.SERVICE_HOSTS).map((h) => `https://${h}`);
  const kwaadaardig = mcpOrigin.mcpOriginBesluit('https://kwaadaardig.example', eigenOrigins, { modus: 'weigeren' });
  assert.equal(kwaadaardig.soort, 'geweigerd');
  if (kwaadaardig.soort === 'geweigerd') assert.equal(kwaadaardig.blokkeren, true);

  const nulOrigin = mcpOrigin.mcpOriginBesluit('null', eigenOrigins, { modus: 'weigeren' });
  assert.equal(nulOrigin.soort, 'geweigerd');

  assert.equal(mcpOrigin.normaliseerOrigin('https://*.tarasevych.com'), null);
  assert.equal(mcpOrigin.normaliseerOrigin('https://user:pass@hub.tarasevych.com'), null);
  assert.equal(mcpOrigin.mcpOriginBesluit(`https://${identiteit.SERVICE_HOSTS.mcp}`, eigenOrigins).soort, 'toegestaan');
  assert.equal(mcpOrigin.mcpOriginBesluit('https://claude.ai', eigenOrigins).soort, 'toegestaan');
  assert.equal(mcpOrigin.mcpOriginBesluit('', eigenOrigins).soort, 'geen');
  assert.equal(mcpOrigin.ORIGIN_403.error, 'ORIGIN_DENIED');
});

test('L2-B51: знезаражувач shared/merk-eigen.ts відхиляє SVG зі сценаріями <script>, обробниками onload/onerror, сутностями url() та > 200 КБ · ontsmetSvg weigert gevaarlijke SVG', async () => {
  const schoon = ontsmetSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></svg>');
  assert.equal(schoon.ok, true);

  for (const gevaarlijk of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="https://kwaadaardig.example/x.svg#id"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="&#117;rl(https://kwaadaardig.example/lek)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>',
  ]) {
    const uit = ontsmetSvg(gevaarlijk);
    assert.equal(uit.ok, false, `Небезпечний зразок SVG мусить відхилятися: ${gevaarlijk.slice(0, 60)}`);
  }

  assert.equal(cssLaadtIets('u\\72l(https://kwaadaardig.example/a.png)'), true);
  assert.equal(cssLaadtIets('url(#veilig-verloop)'), false);

  const teGroot = Buffer.alloc(MERK_EIGEN_MAX_BYTES + 1, 0x20);
  assert.equal(ontsmetSvg(teGroot).ok, false);
});

// ============================================================================
// Контур 2.8. Мобільна ширина 412 px, контраст WCAG, межа клієнт-сервер та Мовний закон (12 перевірок)
// ============================================================================

test('L2-M2-41: правила вузького екрана (412 px) у mobiel.css обмежують важкий каскад за data-mobiel-breedte-veilig, а begrensschaal затискає [0.78, 1.34] · mobiele breedte en begrensschaal', async () => {
  const { identiteit } = await kern();
  const mobielCss = readFileSync(resolve('src/ontwerp/mobiel.css'), 'utf8');
  assert.match(mobielCss, /@media\s*\(\s*max-width\s*:\s*700px\s*\)/);
  assert.match(mobielCss, /:not\(\[data-mobiel-breedte-veilig\]\)/);
  assert.match(mobielCss, /html\[data-mobiel-breedte-veilig\]/);
  assert.match(mobielCss, /min-height\s*:\s*var\(--tik-hoogte-mobiel\)/);
  assert.match(mobielCss, /font-size\s*:\s*max\(16px,\s*1em\)/);

  nepBrowser(`https://${identiteit.SERVICE_HOSTS.hub}`, 'uk');
  const g = globalThis as unknown as Record<string, unknown>;
  const docEl = (g.document as { documentElement?: Record<string, unknown> } | undefined)?.documentElement;
  if (docEl) {
    docEl.addEventListener ??= () => undefined;
    docEl.removeEventListener ??= () => undefined;
    docEl.setAttribute ??= () => undefined;
    docEl.getAttribute ??= () => null;
    docEl.removeAttribute ??= () => undefined;
  }
  g.matchMedia ??= () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  if (g.window && typeof g.window === 'object') {
    (g.window as Record<string, unknown>).matchMedia ??= g.matchMedia;
  }
  const voorkeurenMod = await import('../../src/accountmenu-v3/accountmenu-v3-voorkeuren.ts');
  assert.equal(voorkeurenMod.begrensschaal(Number.NaN), 1);
  assert.equal(voorkeurenMod.begrensschaal(0.1), 0.78);
  assert.equal(voorkeurenMod.begrensschaal(99), 1.34);
  assert.equal(voorkeurenMod.begrensschaal(1.12), 1.12);
});

test('L2-M2-42: сторожі plaatsing-controle.mjs та hulp-vraagtekens-controle.mjs блокують несанкціоновані fixed-шари та подвійні знаки довідки · plaatsing en hulp-vraagtekens slagen', async () => {
  const r1 = spawnSync(process.execPath, ['scripts/plaatsing-controle.mjs', '--stil'], { cwd: process.cwd(), encoding: 'utf8' });
  const r2 = spawnSync(process.execPath, ['scripts/hulp-vraagtekens-controle.mjs', '--stil'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(r1.status, 0, `Сторож plaatsing-controle.mjs завершився з помилкою: ${r1.stderr || r1.stdout}`);
  assert.equal(r2.status, 0, `Сторож hulp-vraagtekens-controle.mjs завершився з помилкою: ${r2.stderr || r2.stdout}`);
});

test('L2-M2-43: математичний контраст WCAG із ./hulp/kleur.ts відсіює слабкі пари (< 4.5:1) і підтверджує запас на всіх палітрах теми · WCAG-contrast via hulp/kleur.ts', async () => {
  assert.equal(luminantie('#000000'), 0);
  assert.equal(luminantie('#ffffff'), 1);
  assert.equal(wcagContrast('#000000', '#ffffff'), 21);
  assert.ok(wcagContrast('#777777', '#ffffff') < 4.5, 'Сірий #777777 на білому має відсіюватися порогом 4.5:1');
  assert.ok(wcagContrast('#aaaaaa', '#ffffff') < 3.0, 'Світло-сірий #aaaaaa на білому має відсіюватися порогом 3.0:1');
  assert.ok(ACHTERGROND.licht.length >= 4 && ACHTERGROND.donker.length >= 4);

  const contrastScript = await laadScriptModule<{
    allePaletten: () => Promise<{
      tokens: { licht: Record<string, string>; donker: Record<string, string> };
      vlakken: Array<{ naam: string; donker: boolean; w: Record<string, string> }>;
    }>;
  }>('scripts/kleur-contrast-controle.mjs');

  const { tokens, vlakken } = await contrastScript.allePaletten();
  assert.ok(vlakken.length >= 26, `Очікується щонайменше 26 палітр оформлення, знайдено ${vlakken.length}`);
  for (const v of vlakken) {
    const cBg = wcagContrast(v.w['--text'], v.w['--bg']);
    const cSurface = wcagContrast(v.w['--text'], v.w['--surface']);
    const t = tokens[v.donker ? 'donker' : 'licht'];
    const cFocus = wcagContrast(t['--focus'], v.w['--bg']);
    assert.ok(cBg >= 4.5, `${v.naam}: контраст тексту до тла ${cBg.toFixed(2)} < 4.5`);
    assert.ok(cSurface >= 4.5, `${v.naam}: контраст тексту до поверхні ${cSurface.toFixed(2)} < 4.5`);
    assert.ok(cFocus >= 3.0, `${v.naam}: контраст рамки фокуса ${cFocus.toFixed(2)} < 3.0`);
  }
});

test('L2-B52: повний сторож контрасту кольорів controleer() проходить з нулем помилок у світлій і темній темах · volledige kleur-contrast-controle slaagt', async () => {
  const contrastScript = await laadScriptModule<{
    controleer: () => Promise<{ fouten: string[]; paren: unknown[]; vlakken: number }>;
  }>('scripts/kleur-contrast-controle.mjs');
  const uitkomst = await contrastScript.controleer();
  assert.deepEqual(uitkomst.fouten, []);
  assert.ok(uitkomst.paren.length > 100);
});

test('L2-M2-44: служба Фото блокує обхід заборони SVG через змішаний регістр та параметри MIME · Foto-dienst blokkeert SVG-omzeiling', async () => {
  assert.equal(mimeVoor('foto.png', 'image/SVG+xml; charset=utf-8'), 'image/png');
  assert.equal(mimeVoor('aanval.svg', 'IMAGE/SVG+XML'), 'application/octet-stream');
  assert.equal(mimeVoor('aanval.svg', 'image/svg+xml'), 'application/octet-stream');
  assert.equal(mediaSoort('aanval.svg', 'image/SVG+xml'), null);
  assert.equal(schoneTekst('Назва\u0000\r\nсвітлини', 50), 'Назва   світлини');
});

test('L2-M2-45: перевищення часу запиту PostgreSQL 57014 у пошуку нотаток дає ZOEKEN_TE_ZWAAR без запису тексту запиту в app.audit · 57014 wordt ZOEKEN_TE_ZWAAR zonder zoektekst in audit', async () => {
  const { pg, notitiesVnext } = await kern();
  await metSlot(async () => {
    const sys = pg.getPool('systeem');
    const proefGebruiker = randomUUID();
    const lade = { userId: proefGebruiker, ruimte: 'prive' as const };
    const basisInvoer = { soort: 'tekst' as const, kleur: 'geen' as const, etiketten: [], mapId: null, vast: false };
    const geheimeZoekterm = `${'а'.repeat(63)}б`;
    const oudeLimiet = notitiesVnext.zoekGrens.tijdslimietMs;

    try {
      await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
        'users',
        proefGebruiker,
        { email: `zoek-grens-${proefGebruiker.slice(0, 8)}@example.invalid`, role: 'member', status: 'approved' },
      ]);
      await notitiesVnext.notitieMaken(lade, { ...basisInvoer, titel: 'Обсяг 1', inhoud: 'а'.repeat(VN_MAX_INHOUD) });
      await notitiesVnext.notitieMaken(lade, { ...basisInvoer, titel: 'Обсяг 2', inhoud: 'а'.repeat(VN_MAX_INHOUD) });

      notitiesVnext.zoekGrens.tijdslimietMs = 1;
      await assert.rejects(
        () => notitiesVnext.notitiesLijst(lade, { vraag: geheimeZoekterm }),
        (err: unknown) => (err as Error)?.message === 'ZOEKEN_TE_ZWAAR',
      );
      notitiesVnext.zoekGrens.tijdslimietMs = oudeLimiet;

      const sporen = (
        await sys.query("SELECT result, details FROM app.audit WHERE owner_id = $1 AND action = 'notitie.zoeken.te_zwaar'", [
          proefGebruiker,
        ])
      ).rows;
      assert.equal(sporen.length, 1);
      assert.equal(sporen[0].result, 'denied');
      assert.equal(Number(sporen[0].details?.woorden), 1);
      assert.equal(Number(sporen[0].details?.lengte), 64);
      assert.equal(
        JSON.stringify(sporen[0].details).includes('аааа'),
        false,
        'Текст пошукового запиту користувача ніколи не записується в журнал аудиту',
      );
    } finally {
      notitiesVnext.zoekGrens.tijdslimietMs = oudeLimiet;
      await sys
        .query("DELETE FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = $1", [proefGebruiker])
        .catch(() => undefined);
      await sys.query('DELETE FROM app.notities WHERE user_id = $1', [proefGebruiker]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_console_items WHERE user_id = $1', [proefGebruiker]).catch(() => undefined);
      await sys.query('DELETE FROM app.records WHERE id = $1', [proefGebruiker]).catch(() => undefined);
    }
  });
});

test('L2-M2-46: перевіряльники taalwetOvertreding та taalFouten виявляють заборонені літери, жаргон і англійську прозу · taalwetcontroleurs vangen overtredingen', async () => {
  const metRuTeken = `Текст із забороненою літерою ${String.fromCodePoint(0x044b)}`;
  const metRuTeken2 = `Інша заборонена літера ${String.fromCodePoint(0x044d)}`;
  const metJargon = `Неприпустимий ${String.fromCodePoint(0x0434, 0x0435, 0x043f, 0x043b, 0x043e, 0x0439)} у звіті`;
  assert.equal(taalwetOvertreding(metRuTeken), true);
  assert.equal(taalwetOvertreding(metRuTeken2), true);
  assert.equal(taalwetOvertreding(metJargon), true);
  assert.equal(taalwetOvertreding('Чисте українське складання та розгортання пакунка'), false);

  const engelseFout = taalFouten(
    'proef',
    'Увімкніть unseen option тут',
    `${['the', 'default', 'file', 'must', 'stay'].join(' ')}`,
  );
  assert.equal(engelseFout.length, 2);

  const zuiverPaar = taalFouten(
    'zuiver',
    'Складання та розгортання пакунка за правилами',
    'Samenstellen en uitrollen van het pakket volgens de regels',
  );
  assert.deepEqual(zuiverPaar, []);
});

test('L2-M2-47: сторож klant-servergrens-controle.mjs підтверджує нульове проникнення серверних модулів у клієнтський граф src/main.tsx · geen servermodules in clientbundel', async () => {
  const r = spawnSync(process.execPath, ['scripts/klant-servergrens-controle.mjs', '--stil'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `Сторож klant-servergrens-controle.mjs завершився з помилкою: ${r.stderr || r.stdout}`);
});

test('L2-B54: сторож meldingen-register-controle.mjs підтверджує реєстрацію всіх серверних кодів дій без категорії overig · MELDINGEN-REGISTER-001 zonder overig', async () => {
  const r = spawnSync(process.execPath, ['scripts/meldingen-register-controle.mjs', '--stil'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `Сторож meldingen-register-controle.mjs завершився з помилкою: ${r.stderr || r.stdout}`);
});

test('L2-M2-48: перевіряльник спадкоємності valideerGebeurtenis відхиляє закриття без української причини, видалення без laatsteCommit та заборонені літери · valideerGebeurtenis grensgevallen', async () => {
  const verwMod = await laadScriptModule<{
    valideerGebeurtenis: (r: Record<string, unknown>, opt?: { pad?: string }) => Array<{ code: string }>;
  }>('scripts/orch/verwijzingen.mjs');

  const tijd = '2026-11-22T20:00:00Z';
  const korteReden = verwMod.valideerGebeurtenis({
    schema: 1,
    soort: 'pr',
    id: 61,
    gebeurtenis: 'gesloten',
    tijd,
    wie: { naam: 'Координатор' },
    waarom: { uk: 'коротко' },
  });
  assert.ok(korteReden.some((z) => z.code === 'VERWIJZING_WAAROM'));

  const zonderLaatsteCommit = verwMod.valideerGebeurtenis({
    schema: 1,
    soort: 'tak',
    id: 'feature/oud-20261101-120000',
    gebeurtenis: 'verwijderd',
    tijd,
    wie: { naam: 'Координатор' },
    waarom: { uk: 'Повністю перенесено у зведений випуск' },
  });
  assert.ok(zonderLaatsteCommit.some((z) => z.code === 'VERWIJZING_LAATSTE'));

  const onveiligTakId = verwMod.valideerGebeurtenis({
    schema: 1,
    soort: 'tak',
    id: 'feature/../gevaar',
    gebeurtenis: 'gesloten',
    tijd,
    wie: { naam: 'Координатор' },
    waarom: { uk: 'Повністю перенесено у зведений випуск' },
  });
  assert.ok(onveiligTakId.some((z) => z.code === 'VERWIJZING_ID'));

  const verbodenTeken = verwMod.valideerGebeurtenis({
    schema: 1,
    soort: 'pr',
    id: 62,
    gebeurtenis: 'gesloten',
    tijd,
    wie: { naam: 'Координатор' },
    waarom: { uk: `Причина містить ${String.fromCodePoint(0x044b)} у слові` },
  });
  assert.ok(verbodenTeken.some((z) => z.code === 'VERWIJZING_TAAL'));
});

test('L2-B56a: у всіх файлах src/, backend/, server/, shared/ та migrations/ відсутні літери поза українською абеткою (U+0401..U+044D) · nul verboden letters in broncode en migraties', async () => {
  const mappen = ['src', 'backend', 'server', 'shared', 'migrations'];
  const gevonden: string[] = [];
  for (const map of mappen) {
    for (const pad of verzamelBestanden(map, ['.ts', '.tsx', '.js', '.mjs', '.css', '.sql'])) {
      // Прибираємо лише символьні класи регулярних виразів перевіряльників та односимвольні ключі таблиці антифішингових гомогліфів доменів
      const inhoud = readFileSync(pad, 'utf8')
        .replace(/\/\[[^\n/]*\]\/[gimsuy]*/g, '')
        .replace(/(^|[\s,{])['"]?[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]['"]?\s*:\s*['"][a-z]['"]/g, '$1');
      if (RU_VERB_TEKENS_RE.test(inhoud)) {
        const rel = pad.slice(process.cwd().length + 1);
        gevonden.push(rel);
      }
    }
  }
  assert.deepEqual(gevonden, [], `Виявлено заборонені літери поза українською абеткою у файлах: ${gevonden.join(', ')}`);
});

test('L2-B56b: в українських текстах інтерфейсу src/ усунено мовні вади звернення №163 · taalzuivering #163 in Oekraïense interfaceteksten van src/', async () => {
  const verbodenMcpUitdrukking = ['MCP-', String.fromCodePoint(0x0442, 0x043e, 0x043a, 0x0435, 0x043d)].join('');
  const treffers: string[] = [];

  for (const pad of verzamelBestanden('src', ['.ts', '.tsx'])) {
    if (pad.endsWith('.test.ts') || pad.endsWith('.test.tsx') || pad.endsWith('.d.ts')) continue;
    const zonderCommentaar = readFileSync(pad, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
    if (zonderCommentaar.includes(verbodenMcpUitdrukking)) {
      treffers.push(pad.slice(process.cwd().length + 1));
    }
  }
  assert.deepEqual(
    treffers,
    [],
    `В українських рядках інтерфейсу src/ ще залишилися неочищені жаргонізми зі звернення №163 (очікує віху M5): ${treffers.join(', ')}`,
  );
});

export async function main(): Promise<number> {
  try {
    return await basisMain();
  } finally {
    if (kernBelofte) {
      const k = await kernBelofte.catch(() => null);
      if (k && aangemaakteEigenaarId) {
        const sys = k.pg.getPool('systeem');
        await sys.query('DELETE FROM app.tech_ruimte_sessies WHERE user_id = $1', [aangemaakteEigenaarId]).catch(() => undefined);
        await sys.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [aangemaakteEigenaarId]).catch(() => undefined);
        await sys.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [aangemaakteEigenaarId]).catch(() => undefined);
        await sys
          .query(
            "DELETE FROM app.records WHERE (tbl = 'users' AND id = $1) OR data->>'ownerUserId' = $1 OR data->>'userId' = $1 OR data->>'recipientUserId' = $1",
            [aangemaakteEigenaarId],
          )
          .catch(() => undefined);
      }
      await k?.pg.closePool().catch(() => undefined);
    }
    rmSync(dynMap, { recursive: true, force: true });
  }
}
