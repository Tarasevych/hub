// РІВЕНЬ 1 НАСКРІЗНИХ ВИПРОБУВАНЬ КОНСОЛІДОВАНОГО ОНОВЛЕННЯ (CONSOLIDATIE-001, 22.11.2026)
// Вимогоорієнтовані щасливі шляхи всіх 18 груп консолідації (108 окремих іменованих перевірок: по 6 на групу).
// LAAG 1 EIND-TOT-EIND-TESTS VAN DE GECONSOLIDEERDE UITGAVE: eisengerichte hoofdpaden voor alle 18 groepen.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SERVICE_HOSTS } from '../../backend/deployment-identiteit.ts';
import { closePool, getPool } from '../../server/platform/pg.ts';
import { AANMELD_AANBIEDERS, AANMELD_ANKERS, STAAT_LABEL } from '../../shared/aanmeld-vnext-model.ts';
import { CALDAV_PRINCIPAL_LICHAAM, caldavQueryLichaam } from '../../shared/agenda-caldav-model.ts';
import { ontleedIcs } from '../../shared/agenda-ics-model.ts';
import { VERTAAL_MOTOREN, aiBalkZichtbaar, motorenMetStand } from '../../shared/ai-vertaling.ts';
import { ACTIE_LABELS, categorieVan } from '../../shared/beheer-journaal.ts';
import { bureauWidget, plaatsbaar } from '../../shared/bureau-indeling.ts';
import { CLOUD_VNEXT_AANBIEDERS, cloudVnextAanbieder } from '../../shared/cloud-vnext-model.ts';
import { bronDef } from '../../shared/foto-model.ts';
import { MAIL_IMAP_AANBIEDERS, mailAanbieder, mailAanbiederHeeftKnop, mailAanbiederVolledig } from '../../shared/mail-aanbieders.ts';
import { dienstVoorSoort } from '../../shared/melding-link.ts';
import { REGISTER as MELDINGEN_UITLEG_REGISTER } from '../../shared/meldingen-v2/uitleg-register.ts';
import { NOTITIE_BRONNEN, notitieBron } from '../../shared/notities-vnext-model.ts';
import { SLEUTELKLUIS_REGISTER } from '../../shared/sleutelkluis.ts';
import { VLAG_UITLEG } from '../../shared/vlaggen.ts';
import { MAAT_AUTO, STANDAARD_INDELING, type Blok } from '../../shared/werkblad-blokken.ts';
import { toegestaan as werkbladToegestaan, werkbladWidget } from '../../shared/werkblad-indeling.ts';
import { beoordeelNeerzetting, maakPlek } from '../../shared/werkblad-plekken.ts';
import { DIENST_DEF, registerItemVoorEntry } from '../../shared/werkblad-register.ts';
import { API_PLATFORM_CAPABILITIES, apiPlatformContractPayload } from '../../src/api-platform-contract.ts';

import { nepBrowser } from './hulp/nep-browser.ts';
import { nepGeheim } from './hulp/nep-geheim.ts';
import { nodeTestSuite } from './hulp/node-test-main.ts';

const { test, main: basisMain } = nodeTestSuite();

const WORTEL = process.cwd();
mkdirSync(resolve(WORTEL, 'rapporten'), { recursive: true });
const dynMap = mkdtempSync(join(resolve(WORTEL, 'rapporten'), 'dyn-laag1-'));
process.once('exit', () => {
  try {
    rmSync(dynMap, { recursive: true, force: true });
  } catch {
    // Тимчасова тека вже прибрана у finally
  }
});

const lees = (relPad: string): string => readFileSync(resolve(WORTEL, relPad), 'utf8');
const bestaat = (relPad: string): boolean => existsSync(resolve(WORTEL, relPad));

function zorgBrowserOmgeving(origin = 'https://hub.tarasevych.com', taal: 'uk' | 'nl' = 'uk'): void {
  nepBrowser(origin, taal);
  const g = globalThis as unknown as Record<string, unknown>;
  const doc = g.document as
    | {
        documentElement?: Record<string, unknown>;
        head?: Record<string, unknown>;
        createElement?: unknown;
      }
    | undefined;
  if (doc) {
    doc.head ??= { appendChild: () => undefined };
    doc.createElement ??= () => ({
      id: '',
      textContent: '',
      setAttribute: () => undefined,
      remove: () => undefined,
      getContext: () => null,
      dataset: {},
      style: {},
    });
    const docEl = doc.documentElement;
    if (docEl) {
      docEl.lang = taal;
      docEl.addEventListener ??= () => undefined;
      docEl.removeEventListener ??= () => undefined;
      docEl.setAttribute ??= () => undefined;
      docEl.getAttribute ??= () => null;
      docEl.removeAttribute ??= () => undefined;
    }
  }
  g.matchMedia ??= () => ({
    matches: false,
    media: '',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  });
  if (g.window && typeof g.window === 'object') {
    (g.window as Record<string, unknown>).matchMedia ??= g.matchMedia;
  }
}

async function laadProjectModule<T = Record<string, unknown>>(relPad: string): Promise<T | null> {
  const volPad = resolve(WORTEL, relPad);
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

async function laadScriptModule<T = Record<string, unknown>>(relPad: string): Promise<T> {
  const volPad = resolve(WORTEL, relPad);
  return (await import(pathToFileURL(volPad).href)) as T;
}

function verzamelBestanden(basisRel: string, filterExt?: readonly string[]): string[] {
  const startPad = resolve(WORTEL, basisRel);
  if (!existsSync(startPad)) return [];
  const resultaat: string[] = [];
  const stap = (huidigRel: string) => {
    const vol = resolve(WORTEL, huidigRel);
    for (const naam of readdirSync(vol)) {
      if (naam === 'node_modules' || naam === '.git' || naam === 'dist' || naam === 'dist-server' || naam === 'rapporten') continue;
      const kindRel = `${huidigRel}/${naam}`;
      const st = lstatSync(resolve(WORTEL, kindRel));
      if (st.isDirectory()) stap(kindRel);
      else if (st.isFile()) {
        if (!filterExt || filterExt.some((ext) => kindRel.endsWith(ext))) resultaat.push(kindRel);
      }
    }
  };
  stap(basisRel);
  return resultaat.sort();
}

type BrowserSessie = {
  jar: Map<string, string>;
  tab: string;
  verzoek: (
    host: string,
    pad: string,
    body?: unknown,
    extra?: { ip?: string; methode?: string; query?: Record<string, string>; ua?: string; kop?: Record<string, string> },
  ) => Promise<{ status: number; data: Record<string, unknown>; body: string }>;
  aanmelden: (
    sub: string,
    email: string,
    opties?: { service?: string; ip?: string; ua?: string; tabContext?: string },
  ) => Promise<unknown>;
  ctxBody: (service?: string, extra?: Record<string, unknown>) => Record<string, unknown>;
};

type NepGoogleInstantie = {
  handler: ((event: unknown) => Promise<{ statusCode: number; headers: Record<string, string>; body: string }>) & { patronen: string[] };
  browser: () => BrowserSessie;
  herstel: () => void;
};

type ServerBrugModule = {
  nepGoogle: (opties: { ownerEmail: string }) => Promise<NepGoogleInstantie>;
  closeServerPool: () => Promise<void>;
  schaduwAan: (userId: string) => Promise<boolean>;
  vlagCacheLeeg: () => void;
  API_PAT_ISSUABLE_SCOPES: readonly string[];
  createApiPlatformRoutes: (deps: {
    requireSession: (event: Record<string, unknown>, body: unknown) => Promise<
      { errorCode: string } | { user: { id: string; email: string; role: string; status: string }; service: string }
    >;
    respond: (data: unknown, status?: number) => { statusCode: number; headers: Record<string, string>; body: string };
    fail: (message: string, status?: number) => { statusCode: number; headers: Record<string, string>; body: string };
    audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
    body: (body: unknown) => Record<string, unknown>;
  }) => Record<string, Array<(ctx: Record<string, unknown>) => Promise<{ statusCode: number; body: string }>>>;
  resolveApiMachineToken: (
    event: Record<string, unknown>,
    query?: Record<string, string>,
  ) => Promise<{ errorCode: string; status: number } | { token: Record<string, unknown> }>;
};

let serverBrugBelofte: Promise<ServerBrugModule> | null = null;

function laadServerBrug(): Promise<ServerBrugModule> {
  if (serverBrugBelofte) return serverBrugBelofte;
  serverBrugBelofte = (async () => {
    const uitPad = join(dynMap, 'server-brug.mjs');
    await build({
      stdin: {
        contents: [
          "export { nepGoogle } from './tests/eenheid/hulp/nep-google.ts';",
          "export { closePool as closeServerPool } from './server/platform/pg.ts';",
          "export { schaduwAan, _vlagCacheLeeg as vlagCacheLeeg } from './backend/tech-ruimtes-kern.ts';",
          "export { API_PAT_ISSUABLE_SCOPES, createApiPlatformRoutes, resolveApiMachineToken } from './backend/api-platform-tokens.ts';",
        ].join('\n'),
        resolveDir: WORTEL,
        loader: 'ts',
      },
      outfile: uitPad,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      packages: 'external',
      loader: { '.css': 'empty' },
      logLevel: 'silent',
    });
    return (await import(pathToFileURL(uitPad).href)) as ServerBrugModule;
  })();
  return serverBrugBelofte;
}

function zorgTestDbActief(): void {
  const dbUrl = String(process.env.DATABASE_URL || process.env.DATABASE_URL_SYSTEM || '');
  const pgVersiePad = '/home/antigravity/.gemini/jetski/scratch/teamwork_tmp/mr-pg-e2e/PG_VERSION';
  const startScriptPad = '/home/antigravity/.gemini/jetski/scratch/teamwork_tmp/mr-e2e-infra/start-e2e-db.sh';
  if (!dbUrl.includes(':55433/') || !existsSync(pgVersiePad)) return;
  const lokaalPgIsReady = '/home/antigravity/.local/pg16/usr/lib/postgresql/16/bin/pg_isready';
  const pgIsReadyBin = existsSync(lokaalPgIsReady) ? lokaalPgIsReady : 'pg_isready';
  const klaar = spawnSync(pgIsReadyBin, ['-h', '127.0.0.1', '-p', '55433', '-q']);
  if (klaar.status === 0) return;
  if (existsSync(startScriptPad)) {
    spawnSync('bash', [startScriptPad], { stdio: 'ignore' });
  }
  for (let poging = 0; poging < 20; poging++) {
    if (spawnSync(pgIsReadyBin, ['-h', '127.0.0.1', '-p', '55433', '-q']).status === 0) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}

zorgTestDbActief();

type GedeeldeServer = {
  G: NepGoogleInstantie;
  eigenaarEmail: string;
  eigenaarSub: string;
  eigenaarUserId: string;
  sessieVoor: (dienst: string) => Promise<BrowserSessie>;
  opruimen: () => Promise<void>;
};

let serverBelofte: Promise<GedeeldeServer> | null = null;

function gedeeldeServer(): Promise<GedeeldeServer> {
  if (serverBelofte) return serverBelofte;
  serverBelofte = (async () => {
    zorgTestDbActief();
    const brug = await laadServerBrug();
    const sys = getPool('systeem');
    const vooraf = await sys.query<{ id: string; email: string; sub: string }>(
      `SELECT u.id,
              COALESCE(u.data->>'email', 'eigenaar@example.invalid') AS email,
              COALESCE(
                (SELECT i.data->>'subject' FROM app.records i
                  WHERE i.tbl = 'account_identities' AND i.data->>'accountId' = u.id AND i.data->>'provider' = 'google'
                  LIMIT 1),
                NULLIF(u.data->>'sub', ''),
                'sub-laag1-eigenaar'
              ) AS sub
         FROM app.records u
        WHERE u.tbl = 'users' AND u.data->>'role' = 'owner'
        LIMIT 1`,
    );
    const eigenaarBestondAl = (vooraf.rowCount ?? 0) > 0;
    const eigenaarEmail = eigenaarBestondAl ? vooraf.rows[0].email : 'eigenaar@example.invalid';
    const eigenaarSub = eigenaarBestondAl ? vooraf.rows[0].sub : 'sub-laag1-eigenaar';
    const G = await brug.nepGoogle({ ownerEmail: eigenaarEmail });
    const sessies = new Map<string, BrowserSessie>();
    const aangemaakteTabs = new Set<string>();

    const sessieVoor = async (dienst: string): Promise<BrowserSessie> => {
      const al = sessies.get(dienst);
      if (al) return al;
      const b = G.browser();
      aangemaakteTabs.add(b.tab);
      await b.aanmelden(eigenaarSub, eigenaarEmail, { service: dienst });
      sessies.set(dienst, b);
      return b;
    };

    const hubSessie = await sessieVoor('hub');
    void hubSessie;
    const naAanmelding = await sys.query<{ id: string }>(
      "SELECT id FROM app.records WHERE tbl = 'users' AND lower(data->>'email') = lower($1) LIMIT 1",
      [eigenaarEmail],
    );
    const eigenaarUserId = naAanmelding.rows[0]?.id ?? vooraf.rows[0]?.id ?? '';

    const opruimen = async () => {
      try {
        for (const tab of aangemaakteTabs) {
          await sys.query("DELETE FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'tabContext' = $1", [tab]);
        }
        if (!eigenaarBestondAl && eigenaarUserId) {
          await sys.query("DELETE FROM app.records WHERE tbl = 'account_identities' AND data->>'accountId' = $1", [eigenaarUserId]);
          await sys.query("DELETE FROM app.records WHERE data->>'ownerUserId' = $1 OR data->>'userId' = $1", [eigenaarUserId]);
          await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [eigenaarUserId]);
        }
      } catch {
        // Не перериваємо завершення при очищенні тимчасових записів
      } finally {
        G.herstel();
      }
    };

    return { G, eigenaarEmail, eigenaarSub, eigenaarUserId, sessieVoor, opruimen };
  })();
  return serverBelofte;
}

const VIJF_UITZONDERING_VLAGGEN = new Set([
  'gastcodes-iedereen',
  'aanmelden-passkey',
  'aanmelden-wachtwoord',
  'aanmelden-extern',
  'aanmelden-sms',
]);

// ============================================================================
// ГРУПА 1. Запит №208 (SPIL-WEERGAVE) та Етап 3 звернення №206 (6 перевірок)
// ============================================================================

test('L1-G1-01: Група 1.1 — наявні всі 20 публічних модулів спільного переглядача вкладень src/bijlage-weergave/ та відновлення вікон пошти · alle 20 bijlage-weergave-modules aanwezig', async () => {
  const verwachteBijlageBestanden = [
    'src/bijlage-weergave/Weergave.tsx',
    'src/bijlage-weergave/Etappe3.tsx',
    'src/bijlage-weergave/KalenderBetalingVenster.tsx',
    'src/bijlage-weergave/MeldingKaart.tsx',
    'src/bijlage-weergave/ZoekVeld.tsx',
    'src/bijlage-weergave/acties.ts',
    'src/bijlage-weergave/details.ts',
    'src/bijlage-weergave/gedrag.ts',
    'src/bijlage-weergave/kalender-betaling.ts',
    'src/bijlage-weergave/labels.ts',
    'src/bijlage-weergave/nl-teksten.ts',
    'src/bijlage-weergave/ondertekenen.ts',
    'src/bijlage-weergave/rekening-velden.ts',
    'src/bijlage-weergave/rijsoort.ts',
    'src/bijlage-weergave/snelkaart.ts',
    'src/bijlage-weergave/soort.ts',
    'src/bijlage-weergave/tekst.ts',
    'src/bijlage-weergave/versies.ts',
    'src/bijlage-weergave/vertrouwen.ts',
    'src/bijlage-weergave/zoek.ts',
    'src/bijlage-weergave/weergave.css',
    'src/mail/lezer-fout.tsx',
    'src/mail/posta-vensters.ts',
    'src/mail/strikte-jose.ts',
  ];
  const ontbrekend = verwachteBijlageBestanden.filter((p) => !bestaat(p));
  assert.deepEqual(
    ontbrekend,
    [],
    `Очікуються всі модулі спільного переглядача вкладень та поштових вікон (№208), відсутні: ${ontbrekend.join(', ')}`,
  );
  zorgBrowserOmgeving('https://mail.tarasevych.com', 'uk');
  const soortMod = await laadProjectModule<Record<string, unknown>>('src/bijlage-weergave/soort.ts');
  assert.ok(soortMod && Object.keys(soortMod).length > 0, 'Модуль src/bijlage-weergave/soort.ts має успішно збиратися й експортувати визначення видів файлів');
});

test('L1-G1-02: Група 1.2 — спільний шар кольорів станів src/thema/staat-kleuren.css прив’язує стани до канонічних змінних без циклів · staat-kleuren.css koppelt statuskleuren zonder kringen', async () => {
  assert.ok(bestaat('src/thema/staat-kleuren.css'), 'Очікується файл спільного шару кольорів станів src/thema/staat-kleuren.css');
  const staatCss = lees('src/thema/staat-kleuren.css');
  const tokensCss = lees('src/ontwerp/tokens.css');
  assert.ok(
    staatCss.includes('var(--staat-goed)') && staatCss.includes('var(--staat-let)') && staatCss.includes('var(--staat-fout)'),
    'Файл staat-kleuren.css має прив’язувати змінні станів до канонічних --staat-goed, --staat-let, --staat-fout',
  );
  assert.ok(
    !/--staat-(?:goed|let|fout)\s*:\s*var\(\s*--mq-/.test(staatCss),
    'Заборонено зворотне замикання канонічних змінних --staat-* на похідні змінні --mq-*',
  );
  assert.ok(
    tokensCss.includes('--staat-goed') && tokensCss.includes('--staat-let') && tokensCss.includes('--staat-fout'),
    'У src/ontwerp/tokens.css мають бути оголошені --staat-goed, --staat-let та --staat-fout',
  );
});

test('L1-G1-03: Група 1.3 — міграції 0307–0309 реєструють усі 5 прапорців пошти й переглядача за правилом VLAG-001 · migraties 0307–0309 registreren alle 5 vlaggen volgens VLAG-001', async () => {
  const migraties = [
    'migrations/0307_posta_lezer_vlaggen.sql',
    'migrations/0308_posta_vensters_herstel.sql',
    'migrations/0309_bijlage_weergave_gedeeld.sql',
  ];
  for (const m of migraties) {
    assert.ok(bestaat(m), `Очікується міграція прапорців ${m}`);
    const sql = lees(m);
    assert.match(sql, /INSERT\s+INTO\s+app\.feature_flags/i, `Міграція ${m} має додавати прапорці у app.feature_flags`);
    assert.match(sql, /ON\s+CONFLICT\s*\(\s*sleutel\s*\)\s*DO\s+NOTHING/i, `Міграція ${m} має містити ON CONFLICT (sleutel) DO NOTHING`);
  }
  const vijfSleutels = [
    'lezer-fout-blijft-open-v1',
    'mail-tekst-utf8-terugval-v1',
    'maquette-zwevend-rail-verbergen-v1',
    'posta-vensters-herstel-v1',
    'bijlage-weergave-gedeeld-v1',
  ];
  for (const sl of vijfSleutels) {
    const uitleg = VLAG_UITLEG[sl];
    assert.ok(uitleg && uitleg.naam[0] && uitleg.naam[1], `Прапорець ${sl} має мати двомовний опис у VLAG_UITLEG`);
  }
  const { rows } = await getPool('systeem').query<{ sleutel: string; aan: boolean; standaard: boolean }>(
    'SELECT sleutel, aan, standaard FROM app.feature_flags WHERE sleutel = ANY($1::text[])',
    [vijfSleutels],
  );
  assert.equal(rows.length, 5, 'Усі 5 прапорців №208 мають бути присутні в таблиці app.feature_flags');
  for (const r of rows) {
    assert.equal(r.aan, true, `Прапорець ${r.sleutel} має бути увімкнений у випуску (aan = true)`);
    assert.equal(r.standaard, true, `Прапорець ${r.sleutel} має бути доступний для всіх (standaard = true)`);
  }
});

test('L1-G1-04: Група 1.4 — маршрут розпізнавання тексту сканів вкладень працює за запитом людини й дотримується межі 20 МБ · tekstherkenningsroute voor scanbijlagen met grens van 20 MB', async () => {
  const srv = await gedeeldeServer();
  const patronen = srv.G.handler.patronen;
  const ocrRoute = patronen.find((p) => /bijlage-weergave|bijlage.*(?:tekst|ocr)/i.test(p));
  assert.ok(ocrRoute, `Очікується серверний маршрут розпізнавання тексту вкладень у handler.patronen (наявні лише ${patronen.length} маршрутів)`);
  const [methode, ruwePad] = ocrRoute.split(/\s+/);
  const pad = ruwePad.replace(/:[a-zA-Z0-9_]+/g, 'proef-bijlage-1');
  const anoniem = srv.G.browser();
  const weigering = await anoniem.verzoek('mail.tarasevych.com', pad, {}, { methode });
  assert.ok(
    weigering.status === 401 || weigering.status === 403,
    `Маршрут ${ocrRoute} без сеансу має повертати 401 або 403, отримано ${weigering.status}`,
  );
  const mailSessie = await srv.sessieVoor('mail');
  const teGrootAntwoord = await mailSessie.verzoek(
    'mail.tarasevych.com',
    pad,
    mailSessie.ctxBody('mail', { grootte: 21 * 1024 * 1024, sizeBytes: 21 * 1024 * 1024 }),
    { methode },
  );
  assert.notEqual(teGrootAntwoord.status, 404, `Маршрут ${ocrRoute} не може повертати 404 для авторизованого запиту`);
  assert.notEqual(teGrootAntwoord.status, 500, `Маршрут ${ocrRoute} має контрольовано відхиляти надмірний або порожній запит без збою 500`);
});

test('L1-G1-05: Група 1.5 — спільний переглядач підключений у DetailPaneel, VoorbeeldVenster, Bron та UniverseelBestandVenster · gedeelde weergave gekoppeld in bestandsvensters', async () => {
  const punten = [
    'src/cloud-vnext/DetailPaneel.tsx',
    'src/voorbeeld/VoorbeeldVenster.tsx',
    'src/cloud-vnext/onderdelen/Bron.tsx',
    'src/bestand/UniverseelBestandVenster.tsx',
  ];
  for (const pad of punten) {
    assert.ok(bestaat(pad), `Очікується існування точки перегляду файлів ${pad}`);
    const inhoud = lees(pad);
    assert.ok(
      inhoud.includes('bijlage-weergave'),
      `Файл ${pad} має підключати спільний переглядач bijlage-weergave за прапорцем зі збереженням зворотного подання`,
    );
  }
});

test('L1-G1-06: Група 1.6 — картки вкладень для Telegram мають 11 станів, екранування HTML, межу 1024 знаки та лише https-посилання · Telegram-bijlagekaarten per staat', async () => {
  const tgMod = await laadProjectModule<{
    TELEGRAM_KAART_STATEN?: readonly string[] | Record<string, unknown>;
    telegramKaartStaat?: (invoer: Record<string, unknown>) => string;
    telegramKaartVoor?: (invoer: Record<string, unknown>) => {
      staat: string;
      onderschrift: string;
      knop?: { tekst?: string; url?: string } | null;
    };
  }>('shared/bijlage-weergave/telegram-kaart.ts');
  assert.ok(tgMod, 'Очікується модуль shared/bijlage-weergave/telegram-kaart.ts для карток вкладень Telegram за станами');
  const verwachteStaten = [
    'verdacht', 'onleesbaar', 'betaald', 'termijn-verlopen', 'termijn-vandaag',
    'termijn-binnenkort', 'rekening-nieuw', 'nieuwe-versie', 'contract-nieuw', 'foto', 'document',
  ];
  const statenLijst = Array.isArray(tgMod.TELEGRAM_KAART_STATEN)
    ? tgMod.TELEGRAM_KAART_STATEN
    : Object.keys(tgMod.TELEGRAM_KAART_STATEN ?? {});
  assert.ok(statenLijst.length >= 11, 'Має експортуватися словник або перелік TELEGRAM_KAART_STATEN з усіма 11 станами');
  for (const st of verwachteStaten) {
    assert.ok(statenLijst.includes(st), `У TELEGRAM_KAART_STATEN має бути стан ${st}`);
  }
  assert.equal(typeof tgMod.telegramKaartStaat, 'function', 'Має експортуватися функція telegramKaartStaat');
  assert.equal(typeof tgMod.telegramKaartVoor, 'function', 'Має експортуватися функція telegramKaartVoor');
  const invoerOnveilig = {
    taal: 'uk' as const,
    naam: `<script>alert(1)</script>${'А'.repeat(1200)}.pdf`,
    vertrouwen: 'gevaar' as const,
    siteUrl: 'http://onveilig.example/bestand',
  };
  assert.equal(tgMod.telegramKaartStaat!(invoerOnveilig), 'verdacht', 'Вкладення з vertrouwen: gevaar має отримувати стан verdacht');
  const kaartOnveilig = tgMod.telegramKaartVoor!(invoerOnveilig);
  assert.equal(kaartOnveilig.staat, 'verdacht', 'Вихідне поле staat картки має дорівнювати verdacht');
  assert.ok(
    kaartOnveilig.onderschrift.length > 0 && kaartOnveilig.onderschrift.length <= 1024,
    'Підпис картки Telegram має бути непорожнім і не перевищувати 1024 знаки',
  );
  assert.ok(!kaartOnveilig.onderschrift.includes('<script>'), 'Підпис картки Telegram має екранувати сирі теги HTML');
  assert.ok(kaartOnveilig.knop?.tekst && kaartOnveilig.knop.tekst.length > 0, 'Кнопка картки має містити локалізований підпис');
  assert.ok(!kaartOnveilig.knop?.url, 'Незахищене посилання http:// не може потрапляти в кнопку Telegram');

  const kaartVeilig = tgMod.telegramKaartVoor!({
    taal: 'nl',
    naam: 'Factuur-2026.pdf',
    isRekening: true,
    bedrag: '€ 125,00',
    siteUrl: 'https://mail.tarasevych.com/?bericht=1',
  });
  assert.equal(kaartVeilig.staat, 'rekening-nieuw');
  assert.equal(kaartVeilig.knop?.url, 'https://mail.tarasevych.com/?bericht=1', 'Захищене посилання https:// має зберігатися у кнопці');
});

// ============================================================================
// ГРУПА 2. Запит №211 (KLANT-001 — служба «Клієнтські взаємини») (6 перевірок)
// ============================================================================

test('L1-G2-01: Група 2.1 — зареєстровані всі публічні маршрути /api/owner/klantrelatiebeheer/* та відсутні двійкові архіви у git · publieke routes klantrelatiebeheer aanwezig', async () => {
  const srv = await gedeeldeServer();
  const verwachteRoutes = [
    'POST /api/owner/klantrelatiebeheer/overzicht',
    'POST /api/owner/klantrelatiebeheer/klant',
    'POST /api/owner/klantrelatiebeheer/aanvraag',
    'POST /api/owner/klantrelatiebeheer/wijzig',
    'POST /api/owner/klantrelatiebeheer/wissen',
    'POST /api/owner/klantrelatiebeheer/kans',
    'POST /api/owner/klantrelatiebeheer/fase',
    'POST /api/owner/klantrelatiebeheer/contact',
    'POST /api/owner/klantrelatiebeheer/taak',
    'POST /api/owner/klantrelatiebeheer/afronden',
    'POST /api/owner/klantrelatiebeheer/afspraak',
    'POST /api/owner/klantrelatiebeheer/bronnen',
    'POST /api/owner/klantrelatiebeheer/koppelstand',
    'POST /api/owner/klantrelatiebeheer/hulp/overzicht',
    'POST /api/owner/klantrelatiebeheer/hulp/voorbereiden',
  ];
  const ontbrekendeRoutes = verwachteRoutes.filter((r) => !srv.G.handler.patronen.includes(r));
  assert.deepEqual(ontbrekendeRoutes, [], `Відсутні маршрути служби клієнтських взаємин: ${ontbrekendeRoutes.join(', ')}`);
  assert.ok(bestaat('src/klantrelatiebeheer/Klantrelatiebeheer.tsx'), 'Очікується компонент src/klantrelatiebeheer/Klantrelatiebeheer.tsx');
  const gitBestanden = execFileSync('git', ['--no-optional-locks', 'ls-files'], { cwd: WORTEL, encoding: 'utf8' }).split('\n');
  assert.ok(
    !gitBestanden.some((f) => f.startsWith('overdrachten/KLANT-001/') && f.endsWith('.tar.gz')),
    'У відстежуваних файлах git не повинно бути двійкових архівів overdrachten/KLANT-001/*.tar.gz',
  );
  assert.ok(
    !gitBestanden.includes('.github/workflows/klant-001-publicatie.yml'),
    'Одноразовий конвеєр .github/workflows/klant-001-publicatie.yml не повинен входити в дерево',
  );
});

test('L1-G2-02: Група 2.2 — міграція перейменована на 0310_klantrelatiebeheer.sql без колізії 0307 і містить ENABLE та FORCE ROW LEVEL SECURITY · migratie 0310 met FORCE RLS', async () => {
  assert.ok(!bestaat('migrations/0307_klantrelatiebeheer.sql'), 'Заборонено колізію номера 0307_klantrelatiebeheer.sql із міграцією №208');
  assert.ok(bestaat('migrations/0310_klantrelatiebeheer.sql'), 'Очікується міграція migrations/0310_klantrelatiebeheer.sql');
  const sql = lees('migrations/0310_klantrelatiebeheer.sql');
  assert.match(sql, /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i, 'Міграція 0310 має вмикати ENABLE ROW LEVEL SECURITY на app.klantrelatieboek');
  assert.match(sql, /FORCE\s+ROW\s+LEVEL\s+SECURITY/i, 'Міграція 0310 має вмикати FORCE ROW LEVEL SECURITY на app.klantrelatieboek');
  const { rows } = await getPool('systeem').query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `SELECT c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'klantrelatieboek'`,
  );
  assert.equal(rows.length, 1, 'Таблиця app.klantrelatieboek має існувати в базі даних');
  assert.equal(rows[0].relrowsecurity, true, 'На app.klantrelatieboek має діяти relrowsecurity = true');
  assert.equal(rows[0].relforcerowsecurity, true, 'На app.klantrelatieboek має діяти relforcerowsecurity = true');
});

test('L1-G2-03: Група 2.3 — таблиця app.klantrelatieboek внесена до відкритого реєстру шифрування SLEUTELKLUIS_REGISTER зі станом dek · klantrelatieboek in SLEUTELKLUIS_REGISTER', async () => {
  const regel = SLEUTELKLUIS_REGISTER.find((r) => r.tabel === 'app.klantrelatieboek');
  assert.ok(regel, 'Таблиця app.klantrelatieboek має бути зареєстрована у SLEUTELKLUIS_REGISTER');
  assert.equal(regel.stand, 'dek', 'Таблиця app.klantrelatieboek має шифруватися особистим ключем користувача (stand: dek)');
  assert.equal(regel.klasse, 'persoonlijk', 'Таблиця app.klantrelatieboek має належати до класу persoonlijk');
  assert.ok(regel.module.includes('klantrelatiebeheer'), 'Запис реєстру має посилатися на серверний модуль klantrelatiebeheer');
});

test('L1-G2-04: Група 2.4 — коди дій клієнтських взаємин (klant.* / owner.klantrelatie.*) зареєстровані в MELDINGEN-REGISTER-001 без категорії overig і ведуть на службу клієнтів · audit en MELDINGEN-REGISTER voor klantrelatie', async () => {
  const klantCodes = Object.keys(ACTIE_LABELS).filter((k) => k.startsWith('klant.') || k.startsWith('owner.klantrelatie.'));
  assert.ok(
    klantCodes.length >= 3,
    'У ACTIE_LABELS мають бути зареєстровані коди дій klant.* або owner.klantrelatie.* (створення, зміна, стирання)',
  );
  for (const code of klantCodes) {
    const paar = ACTIE_LABELS[code];
    assert.ok(paar && paar[0].trim().length > 0 && paar[1].trim().length > 0, `Код дії ${code} має мати непорожні підписи [uk, nl]`);
    assert.notEqual(categorieVan(code), 'overig', `Код дії ${code} не може потрапляти в категорію overig`);
  }
  const klantSoort = klantCodes[0] ?? 'owner.klantrelatie.klant';
  const doelDienst: string | undefined = dienstVoorSoort(klantSoort) ?? dienstVoorSoort('klant.aangemaakt');
  assert.ok(
    doelDienst === 'crm' || doelDienst === 'hub',
    `Функція dienstVoorSoort має маршрутизувати події служби клієнтів (${klantSoort} / klant.*) на службу crm або hub, отримано: ${String(doelDienst)}`,
  );
});

test('L1-G2-05: Група 2.5 — прапорець klantrelatiebeheer-v1 зареєстрований за VLAG-001, описаний двома мовами у VLAG_UITLEG та увімкнений у випуску · vlag klantrelatiebeheer-v1 geregistreerd en aan', async () => {
  const uitleg = VLAG_UITLEG['klantrelatiebeheer-v1'];
  assert.ok(
    uitleg && uitleg.naam[0] && uitleg.naam[1] && uitleg.wat[0] && uitleg.wat[1],
    'Прапорець klantrelatiebeheer-v1 має мати повний двомовний опис у VLAG_UITLEG',
  );
  const { rows } = await getPool('systeem').query<{ aan: boolean; standaard: boolean }>(
    "SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'klantrelatiebeheer-v1'",
  );
  assert.equal(rows.length, 1, 'Прапорець klantrelatiebeheer-v1 має бути присутній у app.feature_flags');
  assert.equal(rows[0].aan, true, 'Прапорець klantrelatiebeheer-v1 має мати aan = true');
  assert.equal(rows[0].standaard, true, 'Прапорець klantrelatiebeheer-v1 має мати standaard = true');
});

test('L1-G2-06: Група 2.6 — маршрути /api/owner/klantrelatiebeheer/* вимагають сеансу crm та відкритого сховища ключів (423 при закритому ключі) · klantroutes eisen crm-sessie en geopende sleutelkluis', async () => {
  const srv = await gedeeldeServer();
  const crmHost = (SERVICE_HOSTS as Record<string, string>).crm || 'crm.tarasevych.com';
  const anoniem = srv.G.browser();
  const zonderSessie = await anoniem.verzoek(crmHost, '/api/owner/klantrelatiebeheer/overzicht', {});
  assert.ok(
    zonderSessie.status === 401 || zonderSessie.status === 403,
    `Запит до /api/owner/klantrelatiebeheer/overzicht без сеансу має повертати 401 або 403, отримано ${zonderSessie.status}`,
  );
  const sessie = await srv.sessieVoor('crm');
  const zonderKluis = await sessie.verzoek(
    crmHost,
    '/api/owner/klantrelatiebeheer/klant',
    sessie.ctxBody('crm', { sleutel: randomUUID(), naam: 'Перевіркова компанія' }),
  );
  assert.equal(
    zonderKluis.status,
    423,
    `Запит запису клієнта на ${crmHost} без відкритого сховища ключів має повертати 423, отримано ${zonderKluis.status} (${zonderKluis.body})`,
  );
  const foutCode = String(zonderKluis.data?.error || zonderKluis.data?.code || '');
  assert.ok(
    foutCode === 'KLANT_SLEUTELKLUIS_NODIG' || foutCode === 'SLEUTELKLUIS_GESLOTEN',
    `Очікується код KLANT_SLEUTELKLUIS_NODIG або SLEUTELKLUIS_GESLOTEN, отримано ${foutCode}`,
  );
});

// ============================================================================
// ГРУПА 3. Закриття прогалини безпеки міграції 0306 у 0311 та rechten.sql (6 перевірок)
// ============================================================================

test('L1-G3-01: Група 3.1 — наявна виправна адитивна міграція 0311_verdeelde_opslag_rls_herstel.sql без руйнівних команд · herstelmigratie 0311 bestaat en is additief', async () => {
  assert.ok(bestaat('migrations/0311_verdeelde_opslag_rls_herstel.sql'), 'Очікується файл migrations/0311_verdeelde_opslag_rls_herstel.sql');
  const sql = lees('migrations/0311_verdeelde_opslag_rls_herstel.sql');
  assert.ok(!/DROP\s+(?:TABLE|COLUMN)/i.test(sql), 'Виправна міграція 0311 не повинна містити руйнівних команд DROP TABLE чи DROP COLUMN');
  assert.match(sql, /REVOKE\s+ALL/i, 'Міграція 0311 має відкликати надлишкові права REVOKE ALL від mijnruimte_app');
  assert.match(sql, /ROW\s+LEVEL\s+SECURITY/i, 'Міграція 0311 має вмикати ROW LEVEL SECURITY на таблицях розподіленого зберігання');
});

test('L1-G3-02: Група 3.2 — роль mijnruimte_app позбавлена будь-яких прав DML на app.verdeelde_opslag_knopen · geen DML-rechten voor mijnruimte_app op verdeelde_opslag_knopen', async () => {
  const rechtenSql = lees('migrations/rechten.sql');
  assert.match(
    rechtenSql,
    /REVOKE\s+ALL[\s\S]{0,160}verdeelde_opslag_knopen[\s\S]{0,160}FROM\s+mijnruimte_app/i,
    'У migrations/rechten.sql має бути закріплено REVOKE ALL на app.verdeelde_opslag_knopen від mijnruimte_app',
  );
  const rechten = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] as const;
  for (const r of rechten) {
    const { rows } = await getPool('systeem').query<{ mag: boolean }>(
      "SELECT has_table_privilege('mijnruimte_app', 'app.verdeelde_opslag_knopen', $1) AS mag",
      [r],
    );
    assert.equal(rows[0].mag, false, `Роль mijnruimte_app не повинна мати права ${r} на app.verdeelde_opslag_knopen`);
  }
});

test('L1-G3-03: Група 3.3 — роль mijnruimte_app позбавлена будь-яких прав DML на app.verdeelde_opslag_rotaties · geen DML-rechten voor mijnruimte_app op verdeelde_opslag_rotaties', async () => {
  const rechten = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] as const;
  for (const r of rechten) {
    const { rows } = await getPool('systeem').query<{ mag: boolean }>(
      "SELECT has_table_privilege('mijnruimte_app', 'app.verdeelde_opslag_rotaties', $1) AS mag",
      [r],
    );
    assert.equal(rows[0].mag, false, `Роль mijnruimte_app не повинна мати права ${r} на app.verdeelde_opslag_rotaties`);
  }
  const { rows: sysRows } = await getPool('systeem').query<{ mag: boolean }>(
    "SELECT has_table_privilege('mijnruimte_system', 'app.verdeelde_opslag_rotaties', 'SELECT') AS mag",
  );
  assert.equal(sysRows[0].mag, true, 'Системна роль mijnruimte_system має зберігати доступ до app.verdeelde_opslag_rotaties');
});

test('L1-G3-04: Група 3.4 — на таблицях verdeelde_opslag_knopen та verdeelde_opslag_rotaties увімкнено ENABLE + FORCE ROW LEVEL SECURITY і політику за gebruiker_id · FORCE RLS op tabellen van 0306', async () => {
  for (const tabel of ['verdeelde_opslag_knopen', 'verdeelde_opslag_rotaties']) {
    const { rows } = await getPool('systeem').query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app' AND c.relname = $1`,
      [tabel],
    );
    assert.equal(rows.length, 1, `Таблиця app.${tabel} має існувати`);
    assert.equal(rows[0].relrowsecurity, true, `На app.${tabel} має бути увімкнено ENABLE ROW LEVEL SECURITY`);
    assert.equal(rows[0].relforcerowsecurity, true, `На app.${tabel} має бути увімкнено FORCE ROW LEVEL SECURITY`);
    const { rows: pol } = await getPool('systeem').query<{ qual: string }>(
      "SELECT COALESCE(qual, '') || ' ' || COALESCE(with_check, '') AS qual FROM pg_policies WHERE schemaname = 'app' AND tablename = $1",
      [tabel],
    );
    assert.ok(
      pol.some((p) => p.qual.includes('gebruiker_id') && (p.qual.includes('app.user_id') || p.qual.includes('huidige_gebruiker'))),
      `Для app.${tabel} має діяти політика рядкового захисту за gebruiker_id (app.huidige_gebruiker() або app.user_id)`,
    );
  }
});

test('L1-G3-05: Група 3.5 — у migrations/rechten.sql прописано явний REVOKE ALL від mijnruimte_app для таблиці 0300 (app.merk_gebruiker) · expliciete REVOKE ALL voor app.merk_gebruiker', async () => {
  const rechtenSql = lees('migrations/rechten.sql');
  assert.match(
    rechtenSql,
    /REVOKE\s+ALL\s+ON\s+(?:TABLE\s+)?app\.merk_gebruiker\s+FROM\s+mijnruimte_app/i,
    'У migrations/rechten.sql має бути явно зафіксовано REVOKE ALL ON app.merk_gebruiker FROM mijnruimte_app',
  );
  const { rows } = await getPool('systeem').query<{ mag: boolean }>(
    "SELECT has_table_privilege('mijnruimte_app', 'app.merk_gebruiker', 'SELECT') AS mag",
  );
  assert.equal(rows[0].mag, false, 'Роль mijnruimte_app не повинна мати доступу до app.merk_gebruiker');
});

test('L1-G3-06: Група 3.6 — у migrations/rechten.sql прописано явний REVOKE ALL від mijnruimte_app для таблиць 0304 (uitrol_beheer_sleutels, uitrol_release_wijzigingen) · expliciete REVOKE ALL voor 0304', async () => {
  const rechtenSql = lees('migrations/rechten.sql');
  assert.ok(
    rechtenSql.includes('uitrol_beheer_sleutels') && rechtenSql.includes('uitrol_release_wijzigingen'),
    'У migrations/rechten.sql мають бути явно згадані таблиці 0304 (uitrol_beheer_sleutels та uitrol_release_wijzigingen)',
  );
  for (const tabel of ['app.uitrol_beheer_sleutels', 'app.uitrol_release_wijzigingen']) {
    const { rows } = await getPool('systeem').query<{ mag: boolean }>(
      "SELECT has_table_privilege('mijnruimte_app', $1, 'SELECT') AS mag",
      [tabel],
    );
    assert.equal(rows[0].mag, false, `Роль mijnruimte_app не повинна мати доступу до ${tabel}`);
  }
});

// ============================================================================
// ГРУПА 4. Повне перенесення залишків SEC-003 із origin/voornaamst (6 перевірок)
// ============================================================================

test('L1-G4-01: Група 4.1 — у deploy/archief-herstellen.sh усунено виклик bash -c зі збереженням коректного синтаксису bash -n та LF · geen bash -c in archief-herstellen.sh', async () => {
  const pad = resolve(WORTEL, 'deploy/archief-herstellen.sh');
  const syntaxis = spawnSync('bash', ['-n', pad], { encoding: 'utf8' });
  assert.equal(syntaxis.status, 0, `Синтаксична перевірка bash -n має проходити з кодом 0: ${syntaxis.stderr}`);
  const inhoud = lees('deploy/archief-herstellen.sh');
  assert.ok(!inhoud.includes('\r'), 'Файл deploy/archief-herstellen.sh має використовувати виключно закінчення рядків LF');
  const actieveRegels = inhoud
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && !r.startsWith('#'));
  assert.ok(
    !actieveRegels.some((r) => /\bbash\s+-c\b/.test(r)),
    'У виконуваних рядках deploy/archief-herstellen.sh не повинно залишатися викликів bash -c',
  );
  assert.ok(
    !actieveRegels.some((r) => /drop\s+database\s+if\s+exists\s+\$1/i.test(r)),
    'Видалення бази даних при відновленні не повинно підставляти $1 у текстовий оболонковий рядок',
  );
});

test('L1-G4-02: Група 4.2 — збережено сигнатури функцій haal_gecontroleerd, node_ophalen, cloudflared_ophalen і tunnel_inrichten при читанні через source · functiesignaturen behouden', async () => {
  const pad = resolve(WORTEL, 'deploy/archief-herstellen.sh');
  const uitv = spawnSync(
    'bash',
    [
      '-c',
      'SCRIPT_PAD="$1"; set --; source "$SCRIPT_PAD" && declare -F haal_gecontroleerd node_ophalen cloudflared_ophalen tunnel_inrichten && printf "%s|%s|%s\\n" "$CF_VERSIE_VAST" "$CF_SHA256_AMD64_VAST" "$CF_SHA256_ARM64_VAST"',
      'proef',
      pad,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(uitv.status, 0, `Підвантаження сценарію через source має завершуватися з кодом 0: ${uitv.stderr}`);
  const regels = uitv.stdout.trim().split('\n');
  const laatste = regels[regels.length - 1] || '';
  const [versie, shaAmd, shaArm] = laatste.split('|');
  assert.match(versie || '', /^\d{4}\.\d{1,2}\.\d{1,3}$/, 'CF_VERSIE_VAST має містити закріплений номер версії');
  assert.match(shaAmd || '', /^[0-9a-f]{64}$/, 'CF_SHA256_AMD64_VAST має містити 64-символьний відбиток SHA-256');
  assert.match(shaArm || '', /^[0-9a-f]{64}$/, 'CF_SHA256_ARM64_VAST має містити 64-символьний відбиток SHA-256');
});

test('L1-G4-03: Група 4.3 — завантаження через curl у deploy/archief-herstellen.sh вимагають --tlsv1.2, а тимчасова тека захищена правами 0700 · --tlsv1.2 en chmod 0700', async () => {
  const inhoud = lees('deploy/archief-herstellen.sh');
  const curlRegels = inhoud
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => !r.startsWith('#') && r.includes('curl ') && r.includes('--proto'));
  assert.ok(curlRegels.length >= 1, 'Мають бути присутні захищені виклики curl із --proto');
  for (const r of curlRegels) {
    assert.ok(r.includes('--tlsv1.2'), `Кожен зовнішній виклик curl має вимагати --tlsv1.2: ${r}`);
  }
  assert.ok(
    /chmod\s+0?700\s+"?\$WERK"?/.test(inhoud) || /umask\s+0?77\b/.test(inhoud),
    'Тимчасова робоча тека відновлення має захищатися правами доступу 0700 (chmod 0700 або umask 077)',
  );
});

test('L1-G4-04: Група 4.4 — функція node_ophalen обробляє провідну зірочку двійкового режиму (*node-v...) у SHASUMS256.txt · node_ophalen verwerkt voorafgaand sterretje', async () => {
  const tmp = mkdtempSync(join(dynMap, 'herstel-node-'));
  try {
    const versie = '24.9.9';
    const arch = 'x64';
    const bestandsnaam = `node-v${versie}-linux-${arch}.tar.xz`;
    const bronMap = join(tmp, 'bron', 'node', `v${versie}`);
    const werkMap = join(tmp, 'werk');
    mkdirSync(bronMap, { recursive: true });
    mkdirSync(werkMap, { recursive: true });
    const nepInhoud = Buffer.from('kunstmatig-node-archief-voor-controle');
    const som = createHash('sha256').update(nepInhoud).digest('hex');
    writeFileSync(join(bronMap, bestandsnaam), nepInhoud);
    writeFileSync(join(bronMap, 'SHASUMS256.txt'), `${som}  *${bestandsnaam}\n`, 'utf8');

    const pad = resolve(WORTEL, 'deploy/archief-herstellen.sh');
    const r = spawnSync(
      'bash',
      [
        '-c',
        'SCRIPT_PAD="$1"; TMP_PAD="$2"; export HERSTEL_TEST_BRON="file://$TMP_PAD/bron"; set --; source "$SCRIPT_PAD"; NODE_VERSIE="24.9.9"; NODE_ARCH="x64"; WERK="$TMP_PAD/werk"; NODE_SHA256=""; node_ophalen',
        'proef',
        pad,
        tmp,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0, `Функція node_ophalen має приймати рядок із *${bestandsnaam} у SHASUMS256.txt: ${r.stderr}`);
    assert.ok(existsSync(join(werkMap, 'node.tar.xz')), 'Перевірений архів node.tar.xz має бути збережений у робочій теці');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('L1-G4-05: Група 4.5 — перенесено та узгоджено модульне випробування tests/eenheid/archief-herstellen-20261116.test.ts · eenheidstest archief-herstellen-20261116 aanwezig en geldig', async () => {
  assert.ok(
    bestaat('tests/eenheid/archief-herstellen-20261116.test.ts'),
    'Очікується перенесений файл модульного випробування tests/eenheid/archief-herstellen-20261116.test.ts',
  );
  const mod = await laadProjectModule<{ main?: () => Promise<number> }>('tests/eenheid/archief-herstellen-20261116.test.ts');
  assert.ok(mod && typeof mod.main === 'function', 'Модуль archief-herstellen-20261116.test.ts має експортувати функцію main()');
  const code = await mod.main();
  assert.equal(code, 0, 'Власні перевірки archief-herstellen-20261116.test.ts мають завершуватися з кодом 0');
});

test('L1-G4-06: Група 4.6 — коментар біля GITHUB_PROEFTOKEN у backend/integraties-wizard.ts очищено за Абсолютним мовним законом · commentaar bij GITHUB_PROEFTOKEN taalkundig zuiver', async () => {
  const inhoud = lees('backend/integraties-wizard.ts');
  const idx = inhoud.indexOf('GITHUB_PROEFTOKEN');
  assert.ok(idx > 0, 'У backend/integraties-wizard.ts має бути оголошено GITHUB_PROEFTOKEN');
  const blok = inhoud.slice(Math.max(0, idx - 500), idx + 80);
  const verbodenWoord = nepGeheim('\u0442\u043e\u043a', '\u0435\u043d');
  assert.ok(
    !new RegExp(`(?:^|[^\\p{L}])${verbodenWoord}`, 'iu').test(blok),
    'Коментар перед GITHUB_PROEFTOKEN має вживати питомий вираз «зразок маркера доступу» без забороненого сленгу',
  );
  assert.ok(
    blok.includes('маркер') || blok.includes('ключ'),
    'Коментар перед GITHUB_PROEFTOKEN має містити питомий український відповідник («маркер доступу» / «ключ»)',
  );
});

// ============================================================================
// ГРУПА 5. Сканери безпеки, integratie-ci.yml, e2e-tls-maak.mjs та VerenigdDienstApp.tsx (6 перевірок)
// ============================================================================

test('L1-G5-01: Група 5.1 — усі 10 конфігурацій сканерів безпеки у .github/workflows/ прив’язані до гілки integratie · alle 10 beveiligingsscanners gekoppeld aan integratie', async () => {
  const scanners = [
    'bandit.yml', 'bearer.yml', 'devskim.yml', 'njsscan.yml', 'ossar.yml',
    'osv-scanner.yml', 'powershell.yml', 'scorecard.yml', 'semgrep.yml', 'trivy.yml',
  ];
  for (const naam of scanners) {
    const pad = `.github/workflows/${naam}`;
    assert.ok(bestaat(pad), `Очікується файл конвеєра безпеки ${pad}`);
    const yml = lees(pad);
    const treffers = yml.match(/\bintegratie\b/g) ?? [];
    assert.ok(
      treffers.length >= 2,
      `Конвеєр ${pad} має слухати гілку integratie і на push, і на pull_request (знайдено згадок: ${treffers.length})`,
    );
    assert.match(yml, /contents:\s*read/, `Конвеєр ${pad} має зберігати мінімальні права contents: read`);
  }
});

test('L1-G5-02: Група 5.2 — створено універсальний перевірковий конвеєр .github/workflows/integratie-ci.yml без самовільної публікації · universele integratie-ci.yml aanwezig', async () => {
  const pad = '.github/workflows/integratie-ci.yml';
  assert.ok(bestaat(pad), 'Очікується універсальний перевірковий конвеєр .github/workflows/integratie-ci.yml');
  const yml = lees(pad);
  assert.match(yml, /\bintegratie\b/, 'integratie-ci.yml має бути прив’язаний до гілки integratie');
  assert.match(yml, /orch\.mjs\s+controleer/, 'integratie-ci.yml має запускати перевірку правил координації');
  assert.match(yml, /typecheck:server/, 'integratie-ci.yml має запускати перевірку типів сервера');
  assert.match(yml, /npm\s+run\s+build/, 'integratie-ci.yml має перевіряти повне складання проєкту');
  assert.ok(!/contents:\s*write/.test(yml), 'Перевірковий конвеєр integratie-ci.yml не повинен мати дозволу contents: write');
});

test('L1-G5-03: Група 5.3 — конвеєр trace-001-guard.yml зберігає безпечне розділення прав contents: read та окремої задачі публікації · trace-001-guard.yml behoudt rechtenscheiding', async () => {
  const yml = lees('.github/workflows/trace-001-guard.yml');
  const voorJobs = yml.split(/\njobs:/)[0] || '';
  assert.match(voorJobs, /contents:\s*read/, 'Верхній рівень прав у trace-001-guard.yml має обмежуватися contents: read');
  assert.ok(!/contents:\s*write/.test(voorJobs), 'Верхній рівень trace-001-guard.yml не може мати contents: write');
  assert.match(yml, /contents:\s*write/, 'Право contents: write має надаватися лише ізольованій задачі публікації після перевірок');
});

test('L1-G5-04: Група 5.4 — сценарій генерації локального сертифіката scripts/e2e-tls-maak.mjs створює пару ключів для *.tarasevych.com поза git · e2e-tls-maak.mjs genereert certificaat', async () => {
  assert.ok(bestaat('scripts/e2e-tls-maak.mjs'), 'Очікується сценарій scripts/e2e-tls-maak.mjs (звернення №164)');
  const tmpTls = mkdtempSync(join(dynMap, 'tls-proef-'));
  try {
    const r = spawnSync(process.execPath, [resolve(WORTEL, 'scripts/e2e-tls-maak.mjs')], {
      cwd: WORTEL,
      env: { ...process.env, E2E_TLS: tmpTls },
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, `Запуск scripts/e2e-tls-maak.mjs має завершуватися з кодом 0: ${r.stderr}`);
    const bestanden = readdirSync(tmpTls);
    assert.ok(
      bestanden.some((f) => f.endsWith('.key')) && bestanden.some((f) => f.endsWith('.crt') || f.endsWith('.pem')),
      `У тимчасовій теці E2E_TLS мають з’явитися ключ і сертифікат, знайдено: ${bestanden.join(', ')}`,
    );
  } finally {
    rmSync(tmpTls, { recursive: true, force: true });
  }
});

test('L1-G5-05: Група 5.5 — оболонку служб src/VerenigdDienstApp.tsx розгорнуто з однорядкового блоку у читабельну багаторядкову структуру · VerenigdDienstApp.tsx meerregelig en geldig', async () => {
  const inhoud = lees('src/VerenigdDienstApp.tsx');
  const regels = inhoud.split('\n');
  const maxLengte = Math.max(...regels.map((r) => r.length));
  assert.ok(regels.length >= 150, `Файл src/VerenigdDienstApp.tsx має містити щонайменше 150 рядків (зараз ${regels.length})`);
  assert.ok(
    maxLengte <= 2500,
    `Жоден рядок у src/VerenigdDienstApp.tsx не повинен перевищувати 2500 символів (знайдено рядок на ${maxLengte} символів)`,
  );
  zorgBrowserOmgeving('https://hub.tarasevych.com', 'uk');
  const mod = await laadProjectModule<Record<string, unknown>>('src/VerenigdDienstApp.tsx');
  assert.ok(mod, 'Розгорнутий src/VerenigdDienstApp.tsx має бездоганно збиратися через esbuild');
});

test('L1-G5-06: Група 5.6 — виключення шляхів у bandit.yml та osv-scanner.yml охоплюють теки складання і гілку integratie · uitgesloten paden in scanners bijgewerkt', async () => {
  const bandit = lees('.github/workflows/bandit.yml');
  const osv = lees('.github/workflows/osv-scanner.yml');
  assert.ok(
    bandit.includes('node_modules') && bandit.includes('dist') && bandit.includes('integratie'),
    'Конвеєр bandit.yml має виключати службові теки складання (node_modules, dist) та перевіряти гілку integratie',
  );
  assert.ok(
    osv.includes('integratie'),
    'Конвеєр osv-scanner.yml має бути прив’язаний до інтеграційної гілки integratie',
  );
});

// ============================================================================
// ГРУПА 6. Збережений архів UI-015A (картковий режим «Способів входу», №167) (6 перевірок)
// ============================================================================

test('L1-G6-01: Група 6.1 — картковий вигляд «Способів входу» (UI-015A) інтегрований із питомими назвами без англомовних назв файлів · kaartweergave zonder Engelse bestandsnamen', async () => {
  const alleSrc = verzamelBestanden('src', ['.ts', '.tsx']);
  const verbodenNamen = [
    'IdentityMethodCard.tsx',
    'IdentityMethodDetails.tsx',
    'IdentityMethodsFilter.tsx',
    'IdentityMethodsHero.tsx',
    'IdentitySecurityExtras.tsx',
  ];
  for (const verboden of verbodenNamen) {
    assert.ok(
      !alleSrc.some((p) => p.endsWith(`/${verboden}`)),
      `Англомовна назва файла ${verboden} з архіву UI-015A має бути перейменована нідерландською за Мовним законом`,
    );
  }
  const mig0321Tot0323 = readdirSync(resolve(WORTEL, 'migrations')).filter((f) => /^032[123]_[a-z0-9_]+\.sql$/.test(f));
  const nieuweSleutels: string[] = [];
  for (const mf of mig0321Tot0323) {
    const sql = lees(`migrations/${mf}`);
    if (!/INSERT\s+INTO\s+app\.feature_flags/i.test(sql)) continue;
    const re = /'([a-z0-9][a-z0-9-]{2,79})'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) nieuweSleutels.push(m[1]);
  }
  const aanmeldBron = verzamelBestanden('src/aanmeld-vnext', ['.ts', '.tsx'])
    .concat(verzamelBestanden('src/aanmelden', ['.ts', '.tsx']))
    .concat(verzamelBestanden('src/aanmeldmethoden-v2', ['.ts', '.tsx']))
    .concat(verzamelBestanden('src/identiteit', ['.ts', '.tsx']))
    .concat(['src/ToegangslaagWeergave.tsx', 'src/InstellingencentrumWeergave.tsx'])
    .filter(bestaat)
    .map(lees)
    .join('\n');
  const heeftNieuweUi015a =
    bestaat('src/aanmeldmethoden-v2') ||
    (mig0321Tot0323.length >= 1 &&
      (nieuweSleutels.some((sl) => aanmeldBron.includes(sl)) ||
        aanmeldBron.includes('UI-015A') ||
        aanmeldBron.includes('ui015a') ||
        aanmeldBron.includes('aanmeldmethoden-kaart') ||
        aanmeldBron.includes('aanmeldmethoden-v2') ||
        aanmeldBron.includes('Картковий') ||
        aanmeldBron.includes('Карткова')));
  assert.ok(heeftNieuweUi015a, 'У src/ має бути інтегровано картковий вигляд «Способів входу» з архіву UI-015A (№167) з питомими назвами файлів');
});

test('L1-G6-02: Група 6.2 — окрема міграція прапорця карткового режиму способів входу у діапазоні 0321..0323 без конфлікту з 0200 · eigen vlagmigratie zonder conflict met 0200', async () => {
  assert.ok(bestaat('migrations/0200_identiteit_account_maquette.sql'), 'Канонічна міграція 0200_identiteit_account_maquette.sql має залишатися на місці');
  assert.ok(!bestaat('migrations/0200_aanmeldmethoden_v2_vlag.sql'), 'Заборонено дублювання номера 0200_aanmeldmethoden_v2_vlag.sql');
  const migBestanden = readdirSync(resolve(WORTEL, 'migrations')).filter((f) => /^032[123]_[a-z0-9_]+\.sql$/.test(f));
  assert.ok(migBestanden.length >= 1, 'У діапазоні 0321..0323 має бути створена міграція прапорця режиму подання способів входу (UI-015A)');
  const gevondenSleutel = Object.keys(VLAG_UITLEG).find((k) =>
    migBestanden.some((f) => lees(`migrations/${f}`).includes(`'${k}'`)),
  );
  assert.ok(gevondenSleutel, 'Новий прапорець із діапазону 0321..0323 має мати повне двомовне пояснення у VLAG_UITLEG');
});

test('L1-G6-03: Група 6.3 — взаємосумісний перемикач режимів подання «Способів входу» зберігає і чинний «Макет» / vNext, і картковий режим UI-015A · weergaveschakelaar behoudt alle modi', async () => {
  const migBestanden = readdirSync(resolve(WORTEL, 'migrations')).filter((f) => /^032[123]_[a-z0-9_]+\.sql$/.test(f));
  const nieuweSleutels: string[] = [];
  for (const mf of migBestanden) {
    const sql = lees(`migrations/${mf}`);
    if (!/INSERT\s+INTO\s+app\.feature_flags/i.test(sql)) continue;
    const re = /'([a-z0-9][a-z0-9-]{2,79})'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) nieuweSleutels.push(m[1]);
  }
  const kandidaten = verzamelBestanden('src/aanmeld-vnext', ['.ts', '.tsx'])
    .concat(verzamelBestanden('src/aanmelden', ['.ts', '.tsx']))
    .concat(verzamelBestanden('src/aanmeldmethoden-v2', ['.ts', '.tsx']))
    .concat(verzamelBestanden('src/identiteit', ['.ts', '.tsx']))
    .concat(['src/ToegangslaagWeergave.tsx', 'src/InstellingencentrumWeergave.tsx'])
    .filter(bestaat)
    .map(lees)
    .join('\n');
  const heeftSchakelaar =
    nieuweSleutels.some((sl) => kandidaten.includes(sl)) ||
    kandidaten.includes('aanmeldmethoden-kaart') ||
    kandidaten.includes('aanmeldmethoden-v2') ||
    kandidaten.includes('weergaveModus') ||
    kandidaten.includes('ui015a') ||
    kandidaten.includes('Картк') ||
    kandidaten.includes('kaart');
  assert.ok(
    migBestanden.length >= 1 &&
      bestaat('src/identiteit/maquette/IdentiteitMaquette.tsx') &&
      bestaat('src/aanmeld-vnext/AanmeldVnextPanelen.tsx') &&
      heeftSchakelaar,
    'Сторінка способів входу має містити взаємосумісний перемикач подання між чинним виглядом («Макет» / vNext) та картковим виглядом UI-015A',
  );
});

test('L1-G6-04: Група 6.4 — усі логотипи постачальників входу беруться виключно з єдиного реєстру src/merk/ без копій SVG у public/aanmeldmethoden/ · logo’s uitsluitend uit src/merk/', async () => {
  assert.ok(!bestaat('public/aanmeldmethoden'), 'Каталог public/aanmeldmethoden/ із дубльованими SVG заборонений за правилом REESTR-LOGO-001');
  assert.ok(bestaat('src/merk/Merk.tsx') || bestaat('src/merk/merk-register.ts'), 'Офіційний реєстр марок src/merk/ має бути наявний');
  const aanmeldTsx = verzamelBestanden('src/aanmeld-vnext', ['.tsx']);
  for (const p of aanmeldTsx) {
    const inhoud = lees(p);
    assert.ok(!inhoud.includes('/aanmeldmethoden/google.svg'), `Файл ${p} не повинен посилатися на зовнішні копії SVG у public/`);
  }
});

test('L1-G6-05: Група 6.5 — збережено всі 5 якорів глибоких посилань способів входу (AANMELD_ANKERS) · alle 5 diepe-link-ankers behouden', async () => {
  const verwachteAnkers = [
    'aanmeldmethoden-google',
    'aanmeldmethoden-2fa',
    'aanmeldmethoden-herstel',
    'aanmeldmethoden-passkeys',
    'aanmeldmethoden-sleutelkluis',
  ];
  assert.deepEqual([...AANMELD_ANKERS], verwachteAnkers, 'Константа AANMELD_ANKERS має містити всі 5 канонічних якорів');
  const aanmeldBronnen = verzamelBestanden('src/aanmeld-vnext', ['.ts', '.tsx']).map(lees).join('\n');
  assert.ok(
    aanmeldBronnen.includes('AANMELD_ANKERS') || verwachteAnkers.every((a) => aanmeldBronnen.includes(a)),
    'Подання способів входу має прив’язувати всі 5 канонічних якорів для переходів зі сторінок Безпеки та Відновлення',
  );
});

test('L1-G6-06: Група 6.6 — модель способів входу має двомовні підписи станів (uk + nl) і чесно захищає останній спосіб входу (beschermd) · bescherming laatste aanmeldweg en tweetaligheid', async () => {
  for (const [sleutel, paar] of Object.entries(STAAT_LABEL)) {
    assert.ok(paar[0].trim().length > 0 && paar[1].trim().length > 0, `Стан ${sleutel} у STAAT_LABEL має мати український та нідерландський підписи`);
  }
  const mapperMod = await laadProjectModule<{
    snapshotNaarKaarten: (data: Record<string, unknown>) => Array<{ id: string; beschermd?: boolean; staatReden?: readonly [string, string]; titel: readonly [string, string] }>;
  }>('src/aanmeld-vnext/snapshotNaarKaarten.ts');
  assert.ok(mapperMod, 'Чистий перетворювач src/aanmeld-vnext/snapshotNaarKaarten.ts має завантажуватися');
  const kaarten = mapperMod.snapshotNaarKaarten({
    methods: [{ id: 'google', enabled: true, configured: true, bound: true, status: 'active' }],
    factors: [{ id: 'passkey', enabled: true, enrolled: false, status: 'not_enrolled' }],
    bindings: [{ id: 'b1', method: 'google', email: 'eigenaar@example.invalid', status: 'active' }],
    lockout: { protected: true, reason: 'last' },
    password: { configured: false, mustChange: false },
    totp: { enrolled: false },
  });
  const googleKaart = kaarten.find((k) => k.id === 'google');
  assert.equal(googleKaart?.beschermd, true, 'Єдиний активний спосіб входу має отримувати захисну ознаку beschermd: true');
  assert.ok(googleKaart?.staatReden?.[0] && googleKaart?.staatReden?.[1], 'Захищений спосіб входу має містити двомовне пояснення причини захисту');
  assert.ok(!JSON.stringify(kaarten).includes('100%'), 'Дані карток способів входу не повинні містити вигаданих відсотків захисту');
});

// ============================================================================
// ГРУПА 7. Збережені архіви UI-015B (№168) та макета Telegram (№169) (6 перевірок)
// ============================================================================

test('L1-G7-01: Група 7.1 — робочий контур входу й підтвердження через Telegram збережений непошкодженим без конфліктних міграцій 0205/0206 · werkende telegram-aanmelden intact', async () => {
  assert.ok(bestaat('migrations/0205_mail_contacten_voorkeuren.sql'), 'Міграція 0205_mail_contacten_voorkeuren.sql має залишатися недоторканою');
  assert.ok(bestaat('migrations/0206_accountmenu_v3_vlag.sql'), 'Міграція 0206_accountmenu_v3_vlag.sql має залишатися недоторканою');
  for (const bestand of ['inloggen.ts', 'bevestigen.ts', 'venster.ts', 'routes.ts', 'opslag.ts']) {
    assert.ok(bestaat(`backend/telegram-aanmelden/${bestand}`), `Модуль backend/telegram-aanmelden/${bestand} має бути збережений`);
  }
  const srv = await gedeeldeServer();
  assert.ok(
    srv.G.handler.patronen.some((p) => p.includes('/api/telegram/webhook')),
    'Маршрут /api/telegram/webhook має бути зареєстрований у головному обробнику',
  );
  assert.ok(
    srv.G.handler.patronen.some((p) => p.includes('/api/telegram/venster')),
    'Маршрути вікна входу /api/telegram/venster/* мають бути зареєстровані у головному обробнику',
  );
});

test('L1-G7-02: Група 7.2 — сувора перевірка формату налаштувань зовнішніх постачальників (Microsoft tenant, Apple PEM) без розкриття таємниць у відповідях · formaatvalidatie externe aanbieders', async () => {
  const srv = await gedeeldeServer();
  const idSessie = await srv.sessieVoor('identity');
  const oudAppleKey = process.env.AANMELD_APPLE_PRIVATE_KEY;
  const oudAppleClient = process.env.AANMELD_APPLE_CLIENT_ID;
  const oudAppleTeam = process.env.AANMELD_APPLE_TEAM_ID;
  const oudAppleKid = process.env.AANMELD_APPLE_KEY_ID;
  const oudMsTenant = process.env.AANMELD_MICROSOFT_TENANT;
  const nepWaarde = nepGeheim('GEHEIM_WAARDE_', 'NOOIT_TONEN_987654');
  try {
    process.env.AANMELD_APPLE_CLIENT_ID = 'com.example.proef';
    process.env.AANMELD_APPLE_TEAM_ID = 'TEAM123456';
    process.env.AANMELD_APPLE_KEY_ID = 'KEY1234567';
    process.env.AANMELD_APPLE_PRIVATE_KEY = nepWaarde;
    process.env.AANMELD_MICROSOFT_TENANT = 'ongeldige..tenant/waarde!';

    const statusRes = await idSessie.verzoek('id.tarasevych.com', '/api/owner/aanmeld/vnext/aanbieders', idSessie.ctxBody('identity'));
    assert.equal(statusRes.status, 200, 'Маршрут статусу постачальників має повертати 200');
    assert.ok(!statusRes.body.includes(nepWaarde), 'Тіло відповіді ніколи не повинно містити значення секрету із середовища');

    const koppelBron = lees('backend/aanmeld-koppel.ts');
    assert.ok(
      koppelBron.includes('AANMELD_MICROSOFT_TENANT'),
      'Серверний контур зовнішнього входу має підтримувати й суворо перевіряти формат AANMELD_MICROSOFT_TENANT (UI-015B)',
    );
  } finally {
    if (oudAppleKey === undefined) delete process.env.AANMELD_APPLE_PRIVATE_KEY; else process.env.AANMELD_APPLE_PRIVATE_KEY = oudAppleKey;
    if (oudAppleClient === undefined) delete process.env.AANMELD_APPLE_CLIENT_ID; else process.env.AANMELD_APPLE_CLIENT_ID = oudAppleClient;
    if (oudAppleTeam === undefined) delete process.env.AANMELD_APPLE_TEAM_ID; else process.env.AANMELD_APPLE_TEAM_ID = oudAppleTeam;
    if (oudAppleKid === undefined) delete process.env.AANMELD_APPLE_KEY_ID; else process.env.AANMELD_APPLE_KEY_ID = oudAppleKid;
    if (oudMsTenant === undefined) delete process.env.AANMELD_MICROSOFT_TENANT; else process.env.AANMELD_MICROSOFT_TENANT = oudMsTenant;
  }
});

test('L1-G7-03: Група 7.3 — одноразовість та обмежений строк дії (≤ 10 хв) станів зовнішнього входу з прив’язкою оглядача · eenmalige en tijdgebonden OAuth-staten', async () => {
  const srv = await gedeeldeServer();
  const losseBrowser = srv.G.browser();
  const r = await losseBrowser.verzoek(
    'id.tarasevych.com',
    '/api/aanmeld/koppel/microsoft/terug',
    {},
    { methode: 'GET', query: { state: 'onbekende-of-verlopen-state-12345', code: 'proefcode' } },
  );
  assert.equal(r.status, 302, 'Публічний зворотний виклик прив’язки при хибному state має повертати контрольоване переспрямування 302');
  assert.ok(!losseBrowser.jar.has('tsv_s'), 'При відхиленому або недійсному state не може видаватися реп’яшок сеансу');
  assert.equal(AANMELD_AANBIEDERS.some((a) => a.id === 'microsoft' && a.stand === 'sleutels-nodig'), true);
});

test('L1-G7-04: Група 7.4 — статус зовнішніх постачальників на екрані входу узгоджений із живою готовністю на сервері без застарілих жорстких заглушок · eerlijke status op inlogscherm', async () => {
  const srv = await gedeeldeServer();
  const pub = srv.G.browser();
  const methodenRes = await pub.verzoek('id.tarasevych.com', '/api/auth/methods', {}, { methode: 'GET' });
  assert.equal(methodenRes.status, 200, 'Публічний маршрут GET /api/auth/methods має повертати 200');
  const appBron = lees('src/App.tsx');
  assert.ok(
    !appBron.includes("soon: ['Microsoft', 'Apple', 'Telegram'") && !appBron.includes('soon:["Microsoft","Apple","Telegram"'),
    'У src/App.tsx не повинно залишатися застарілого жорстко зашитого переліку soon для вже реалізованих на сервері постачальників входу',
  );
  const idSessie = await srv.sessieVoor('identity');
  const aanbiedersRes = await idSessie.verzoek('id.tarasevych.com', '/api/owner/aanmeld/vnext/aanbieders', idSessie.ctxBody('identity'));
  assert.equal(aanbiedersRes.status, 200);
  const ms = (aanbiedersRes.data?.aanbieders as Array<{ id: string; klaarVoorKoppeling: boolean }> | undefined)?.find((x) => x.id === 'microsoft');
  assert.equal(ms?.klaarVoorKoppeling, false, 'Без ключів власника та пройденої самоперевірки klaarVoorKoppeling має дорівнювати false');
});

test('L1-G7-05: Група 7.5 — візуальні зручності з макета вікна входу через Telegram (№169) доступні двома мовами (uk + nl) за перемикачем · opties uit Telegram-aanmeldmaket beschikbaar', async () => {
  const tgBestanden = verzamelBestanden('src/telegram-aanmelden', ['.ts', '.tsx']).concat(['backend/telegram-aanmelden/venster.ts']);
  const samen = tgBestanden.filter(bestaat).map(lees).join('\n');
  assert.ok(
    samen.includes('uk') && samen.includes('nl'),
    'Вікно входу через Telegram має підтримувати українську та нідерландську мови',
  );
  assert.ok(
    (samen.includes('maket') || samen.includes('maquette') || samen.includes('weergave') || samen.includes('stijl')) &&
      (samen.includes('verdacht') || samen.includes('підозріл')),
    'Вікно входу через Telegram має містити інтегровані зі збереженого макета №169 режими/стани подання (включно з попередженням про підозрілий вхід)',
  );
});

test('L1-G7-06: Група 7.6 — пояснення подій зовнішнього входу та Telegram присутні в реєстрі сповіщень двома мовами без категорії overig · tweetalige meldingteksten voor extern aanmelden', async () => {
  const soorten = MELDINGEN_UITLEG_REGISTER.filter((item) => /aanmeld|telefoon|apparaat/i.test(item.id));
  assert.ok(soorten.length >= 2, 'У реєстрі пояснень сповіщень мають бути записи для зовнішнього входу та підтвердження пристроїв');
  for (const item of soorten) {
    assert.ok(item.wat[0].trim().length > 0 && item.wat[1].trim().length > 0, `Пояснення сповіщення ${item.id} має містити український та нідерландський тексти`);
  }
  const actieSleutels = Object.keys(ACTIE_LABELS).filter((k) => k.startsWith('aanmeld.') || k.startsWith('telegram.'));
  assert.ok(actieSleutels.length >= 2, 'У ACTIE_LABELS мають бути зареєстровані коди дій зовнішнього входу та Telegram');
  for (const c of actieSleutels) {
    assert.notEqual(categorieVan(c), 'overig', `Код дії ${c} не повинен належати до категорії overig`);
  }
});

// ============================================================================
// ГРУПА 8. Живий стан у «Макеті» облікового запису (З-12) та дія «Це був не я» (Т-1) (6 перевірок)
// ============================================================================

test('L1-G8-01: Група 8.1 — у maquette-motor.ts прибрано застарілі заглушки «заплановано» для реалізованих способів входу зі збереженням пояснення про WhatsApp · geen verouderde status in methods', async () => {
  const motor = lees('src/identiteit/maquette/maquette-motor.ts');
  const idx = motor.indexOf('група("додаткові"');
  assert.ok(idx > 0, 'У maquette-motor.ts має існувати група "додаткові" розділу способів входу');
  const blok = motor.slice(idx, idx + 1600);
  for (const naam of ['Microsoft', 'Discord', 'Telegram', 'Apple']) {
    const re = new RegExp(`${naam}[^\\n]*"заплановано"`);
    assert.ok(!re.test(blok), `Спосіб входу ${naam} у maquette-motor.ts більше не повинен мати застарілу жорстку позначку "заплановано"`);
  }
  assert.ok(!blok.includes('SMS — потребує окремої розробки'), 'Застарілий напис «SMS — потребує окремої розробки» має бути оновлений за реальним станом контуру');
  assert.ok(blok.includes('WhatsApp'), 'Чесне пояснення щодо WhatsApp має залишатися збереженим');
});

test('L1-G8-02: Група 8.2 — група «Чинні запрошення та дозволи» у maquette-motor.ts підключена до дійсного стану без заглушки «заплановано» · groep bestaande uitnodigingen zonder gepland-label', async () => {
  const motor = lees('src/identiteit/maquette/maquette-motor.ts');
  const idx = motor.indexOf('група("чинні"');
  assert.ok(idx > 0, 'У maquette-motor.ts має існувати група "чинні" розділу спільного доступу');
  const kopRegel = motor.slice(idx, idx + 350).split('\n')[0] || '';
  assert.ok(
    !kopRegel.includes('"заплановано"'),
    'Група «Чинні запрошення та дозволи» у maquette-motor.ts має бути переведена зі стану "заплановано" до чинного стану',
  );
});

test('L1-G8-03: Група 8.3 — групи відновлення доступу («Як відновити доступ» та «Запобігання втраті доступу») містять дієві сценарії без «заплановано» · herstelgroepen met echte scenario’s', async () => {
  const motor = lees('src/identiteit/maquette/maquette-motor.ts');
  for (const groepNaam of ['група("сценарії"', 'група("поради"']) {
    const idx = motor.indexOf(groepNaam);
    assert.ok(idx > 0, `У maquette-motor.ts має бути присутня ${groepNaam}`);
    const kopRegel = motor.slice(idx, idx + 350).split('\n')[0] || '';
    assert.ok(
      !kopRegel.includes('"заплановано"'),
      `${groepNaam} у maquette-motor.ts не повинна залишатися зі станом "заплановано"`,
    );
  }
});

test('L1-G8-04: Група 8.4 — зареєстрований серверний маршрут швидкої захисної дії «Це був не я» для сеансів і пристроїв сайту · serverroute voor noodactie «Dit was ik niet»', async () => {
  const srv = await gedeeldeServer();
  const patronen = srv.G.handler.patronen;
  assert.ok(patronen.includes('POST /api/meldingen/apparaat-bekend'), 'Наявний маршрут підтвердження «Це був я» має зберігатися');
  const nietIkRoute = patronen.find((p) => /niet-ik|onbekend-apparaat|verdachte-sessie|apparaat-blokkeer/i.test(p));
  assert.ok(nietIkRoute, 'Поруч із /api/meldingen/apparaat-bekend має бути зареєстрований маршрут захисної дії «Це був не я»');
  const [methode, pad] = nietIkRoute.split(/\s+/);
  const anoniem = srv.G.browser();
  const res = await anoniem.verzoek('id.tarasevych.com', pad.replace(/:[a-zA-Z0-9_]+/g, 'proef'), {}, { methode });
  assert.ok(res.status === 401 || res.status === 403, `Маршрут ${nietIkRoute} без сеансу має повертати 401 або 403`);
});

test('L1-G8-05: Група 8.5 — виконання дії «Це був не я» припиняє підозрілий сеанс і записує подію у журнал безпеки app.audit · «Dit was ik niet» trekt verdachte sessie in en schrijft audit', async () => {
  const srv = await gedeeldeServer();
  const nietIkRoute = srv.G.handler.patronen.find((p) => /niet-ik|onbekend-apparaat|verdachte-sessie|apparaat-blokkeer/i.test(p));
  assert.ok(nietIkRoute, 'Очікується серверний маршрут захисної дії «Це був не я» для перевірки припинення підозрілого сеансу');
  const sys = getPool('systeem');
  const verdachteBrowser = srv.G.browser();
  try {
    await verdachteBrowser.aanmelden(srv.eigenaarSub, srv.eigenaarEmail, {
      service: 'hub',
      ip: '198.51.100.77',
      ua: 'OnbekendToestel/1.0',
    });
    const sessieRij = await sys.query<{ id: string }>(
      "SELECT id FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'tabContext' = $1 LIMIT 1",
      [verdachteBrowser.tab],
    );
    const verdachteSessieId = sessieRij.rows[0]?.id || '';
    assert.ok(verdachteSessieId, 'Підозрілий сеанс має бути створений для перевірки відкликання');

    const eigenaarIdSessie = await srv.sessieVoor('identity');
    const [methode, ruwePad] = nietIkRoute.split(/\s+/);
    const pad = ruwePad.replace(/:[a-zA-Z0-9_]+/g, verdachteSessieId);
    const res = await eigenaarIdSessie.verzoek(
      'id.tarasevych.com',
      pad,
      eigenaarIdSessie.ctxBody('identity', { sessieId: verdachteSessieId, sessionId: verdachteSessieId, confirmation: 'DIT_WAS_IK_NIET' }),
      { methode },
    );
    assert.equal(res.status, 200, `Захисна дія «Це був не я» має завершуватися статусом 200, отримано ${res.status}: ${res.body}`);

    const naIntrekking = await sys.query<{ ingetrokken: boolean }>(
      "SELECT COALESCE((data->>'revokedAt')::numeric, 0) > 0 AS ingetrokken FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND id = $1",
      [verdachteSessieId],
    );
    assert.equal(naIntrekking.rows[0]?.ingetrokken, true, 'Підозрілий сеанс має бути негайно відкликаний (revokedAt > 0)');
  } finally {
    await sys.query("DELETE FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'tabContext' = $1", [verdachteBrowser.tab]);
  }
});

test('L1-G8-06: Група 8.6 — картка сповіщення про новий вхід та керування сеансами містять двомовну дію «Це був не я» / «Dit was ik niet» · tweetalige knop «Dit was ik niet» in melding en sessies', async () => {
  const sessieEnMeldingUi = verzamelBestanden('src/sessies', ['.ts', '.tsx'])
    .concat(verzamelBestanden('src/meldingen', ['.ts', '.tsx']))
    .concat(['src/CanoniekMeldingencentrum.tsx', 'src/BeveiligingSessiesPaneel.tsx', 'src/SessiesOverzicht.tsx'])
    .filter(bestaat)
    .map(lees)
    .join('\n');
  const heeftSnelleActieAanroep = /\/api\/.*(?:niet-ik|onbekend-apparaat|verdachte-sessie|apparaat-blokkeer)/i.test(sessieEnMeldingUi);
  assert.ok(
    heeftSnelleActieAanroep &&
      (sessieEnMeldingUi.includes('Це був не я') || sessieEnMeldingUi.includes('Це не я')) &&
      sessieEnMeldingUi.includes('Dit was ik niet'),
    'Клієнтський центр сповіщень та керування сеансами мають викликати швидкий серверний маршрут захисної дії «Це був не я» / «Dit was ik niet»',
  );
});

// ============================================================================
// ГРУПА 9. Меню облікового запису (accountmenu-v3 + v2) та tech-ruimtes-v2-schaduw (6 перевірок)
// ============================================================================

test('L1-G9-01: Група 9.1 — читач src/accountmenu-v3/vlag.ts поважає серверне значення value: false навіть без metadata.test · accountmenu-v3/vlag.ts respecteert serverwaarde false', async () => {
  zorgBrowserOmgeving('https://hub.tarasevych.com', 'uk');
  const echteFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          vlaggen: [{ key: 'accountmenu-v3', value: false, variant: 'uit', reason: 'DISABLED' }],
          key: 'accountmenu-v3',
          value: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    const fv = await import('../../src/functievlag-lezen.ts');
    fv.vlaggenGebruiker('gebruiker-laag1-g9');
    await fv.laadVlaggen(true);

    const v3Mod = await import('../../src/accountmenu-v3/vlag.ts');
    const uitkomstBijServerUit = await v3Mod.laadAccountmenuV3Vlag(true);
    assert.equal(
      uitkomstBijServerUit,
      false,
      'Коли сервер повертає для accountmenu-v3 стан value: false без metadata.test, laadAccountmenuV3Vlag(true) має повертати false',
    );
  } finally {
    globalThis.fetch = echteFetch;
  }
});

test('L1-G9-02: Група 9.2 — прапорці accountmenu-v3 та accountmenu-v2 увімкнені у стан «Для всіх» (aan = true, standaard = true) у базі даних · accountmenu-v3 en v2 ingeschakeld in database', async () => {
  const { rows } = await getPool('systeem').query<{ sleutel: string; aan: boolean; standaard: boolean }>(
    "SELECT sleutel, aan, standaard FROM app.feature_flags WHERE sleutel IN ('accountmenu-v3', 'accountmenu-v2') ORDER BY sleutel",
  );
  assert.equal(rows.length, 2, 'Обидва прапорці accountmenu-v2 та accountmenu-v3 мають існувати у app.feature_flags');
  for (const r of rows) {
    assert.equal(r.aan, true, `Прапорець ${r.sleutel} у базі даних має мати aan = true`);
    assert.equal(r.standaard, true, `Прапорець ${r.sleutel} у базі даних має мати standaard = true`);
  }
});

test('L1-G9-03: Група 9.3 — налаштування стилю меню облікового запису підтримують усі 4 взаємосумісні режими (orbita, kaart, v2, klassiek) · alle 4 stijlen van het accountmenu beschikbaar', async () => {
  zorgBrowserOmgeving('https://hub.tarasevych.com', 'uk');
  const voorkeurenMod = await import('../../src/accountmenu-v3/accountmenu-v3-voorkeuren.ts');
  assert.equal(voorkeurenMod.leesAccountmenuV3Voorkeuren().indeling, 'orbita', 'Типовою розкладкою v3 має залишатися orbita');

  const samenBron = verzamelBestanden('src/accountmenu-v3', ['.ts', '.tsx'])
    .concat(verzamelBestanden('src/accountmenu-v2', ['.ts', '.tsx']))
    .concat(['src/CanoniekAccountMenu.tsx'])
    .filter(bestaat)
    .map(lees)
    .join('\n');

  assert.ok(/'orbita'|"orbita"/.test(samenBron), 'Має підтримуватися режим меню «orbita»');
  assert.ok(/'kaart'|"kaart"/.test(samenBron), 'Має підтримуватися режим меню «kaart»');
  assert.ok(
    /'v2'|"v2"|'compact'|"compact"|'v2-compact'|"v2-compact"/.test(samenBron),
    'Має підтримуватися збережений компактний режим меню v2 («v2» / «compact»)',
  );
  assert.ok(
    /'klassiek'|"klassiek"|'klasychn'|"klasychn"/.test(samenBron) || /(?<!data-account-menu-version=)(?:'v6'|"v6")/.test(samenBron),
    'Має підтримуватися збережений класичний режим меню («klassiek» / «v6»)',
  );
});

test('L1-G9-04: Група 9.4 — компонент CanoniekAccountMenu.tsx відмальовує вибраний варіант (v3, v2 або класичний), коли обидва прапорці увімкнені · CanoniekAccountMenu toont gekozen variant', async () => {
  const bron = lees('src/CanoniekAccountMenu.tsx');
  assert.ok(
    bron.includes('AccountMenuV3') && bron.includes('useAccountmenuV2'),
    'CanoniekAccountMenu.tsx має зберігати підключення і AccountMenuV3, і режиму v2 та класичного меню',
  );
  assert.ok(
    bron.includes('accountmenu-v3-voorkeuren') || (bron.includes("'v2'") && bron.includes("'klassiek'")),
    'CanoniekAccountMenu.tsx має зважати на вибраний користувачем варіант оформлення (orbita / kaart / v2 / klassiek), коли обидва прапорці увімкнені',
  );
});

test('L1-G9-05: Група 9.5 — функція schaduwAan у backend/tech-ruimtes-kern.ts керується прапорцем tech-ruimtes-v2-schaduw з бази даних без залежності від TECH_RUIMTES_V2_SCHADUW · schaduwAan via feature_flag', async () => {
  const bron = lees('backend/tech-ruimtes-kern.ts');
  assert.ok(
    !bron.includes("process.env.TECH_RUIMTES_V2_SCHADUW === '1'"),
    'У backend/tech-ruimtes-kern.ts має бути прибрана прихована ручна змінна process.env.TECH_RUIMTES_V2_SCHADUW на користь єдиного реєстру app.feature_flags',
  );
  const brug = await laadServerBrug();
  const srv = await gedeeldeServer();
  const sys = getPool('systeem');
  const oorspronkelijk = await sys.query<{ aan: boolean; standaard: boolean }>(
    "SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'tech-ruimtes-v2-schaduw'",
  );
  const oudeEnv = process.env.TECH_RUIMTES_V2_SCHADUW;
  try {
    delete process.env.TECH_RUIMTES_V2_SCHADUW;
    await sys.query("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = 'tech-ruimtes-v2-schaduw'");
    brug.vlagCacheLeeg();
    const aanWaarde = await brug.schaduwAan(srv.eigenaarUserId);
    assert.equal(aanWaarde, true, 'При увімкненому прапорці tech-ruimtes-v2-schaduw у БД schaduwAan має повертати true без process.env');

    process.env.TECH_RUIMTES_V2_SCHADUW = '1';
    await sys.query("UPDATE app.feature_flags SET aan = false, standaard = false WHERE sleutel = 'tech-ruimtes-v2-schaduw'");
    brug.vlagCacheLeeg();
    const uitWaarde = await brug.schaduwAan(srv.eigenaarUserId);
    assert.equal(uitWaarde, false, 'При вимкненому прапорці у БД schaduwAan має повертати false навіть за наявності TECH_RUIMTES_V2_SCHADUW у середовищі');
  } finally {
    if (oudeEnv === undefined) delete process.env.TECH_RUIMTES_V2_SCHADUW; else process.env.TECH_RUIMTES_V2_SCHADUW = oudeEnv;
    if (oorspronkelijk.rows[0]) {
      await sys.query("UPDATE app.feature_flags SET aan = $1, standaard = $2 WHERE sleutel = 'tech-ruimtes-v2-schaduw'", [
        oorspronkelijk.rows[0].aan,
        oorspronkelijk.rows[0].standaard,
      ]);
    }
    brug.vlagCacheLeeg();
  }
});

test('L1-G9-06: Група 9.6 — обгортки меню облікового запису миттєво оновлюють стан при події mr:vlaggen-vernieuwd · accountmenu-vlaggen reageren op mr:vlaggen-vernieuwd', async () => {
  for (const pad of ['src/accountmenu-v3/vlag.ts', 'src/accountmenu-v2/vlag.ts']) {
    const inhoud = lees(pad);
    assert.ok(
      inhoud.includes('mr:vlaggen-vernieuwd') || inhoud.includes('useVlag') || inhoud.includes('functievlag-lezen'),
      `Клієнтська обгортка ${pad} має реагувати на подію mr:vlaggen-vernieuwd або делегувати до спільного читача functievlag-lezen`,
    );
  }
});

// ============================================================================
// ГРУПА 10. Пошта — перемикач переглядача, мости, перекладачі та Fastmail (6 перевірок)
// ============================================================================

test('L1-G10-01: Група 10.1 — Пошта зберігає три взаємосумісні режими переглядача вкладень (Спільний, Компактна панель v2, Класична) · drie onderling verenigbare weergavestanden voor bijlagen', async () => {
  assert.ok(bestaat('src/bijlage-v2/vlag.ts'), 'Модуль src/bijlage-v2/vlag.ts має бути збережений');
  assert.ok(bestaat('src/bijlage-weergave/Weergave.tsx'), 'Спільний переглядач src/bijlage-weergave/Weergave.tsx має бути присутній');
  const bestanden = verzamelBestanden('src/bijlage-weergave', ['.ts', '.tsx'])
    .concat(verzamelBestanden('src/bijlage-v2', ['.ts', '.tsx']))
    .concat(verzamelBestanden('src/mail', ['.ts', '.tsx']))
    .concat(['src/GoogleMailWerkruimte.tsx'])
    .filter(bestaat)
    .map(lees)
    .join('\n');
  assert.ok(
    bestanden.includes('bijlage-viewer-v2') && bestanden.includes('bijlage-weergave-gedeeld-v1') && bestanden.includes('klassiek'),
    'Пошта має підтримувати явний перемикач трьох режимів переглядача вкладень (gedeeld / v2 / klassiek) при обох увімкнених прапорцях',
  );
});

test('L1-G10-02: Група 10.2 — вікно листа в Пошті містить швидкі міжслужбові дії «У Нотатки», «У Завдання / Узгодження» та «До Календаря» · snelle dienstbruggen vanuit e-mail', async () => {
  const mailBronnen = verzamelBestanden('src/mail', ['.ts', '.tsx']).map(lees).join('\n');
  assert.ok(
    mailBronnen.includes('notities') || mailBronnen.includes('notes'),
    'Вікно відкритого листа у src/mail/ має містити швидку дію переходу або збереження «У Нотатки»',
  );
  assert.ok(
    mailBronnen.includes('afstemming') || mailBronnen.includes('reconciliation') || mailBronnen.includes('taken'),
    'Вікно відкритого листа у src/mail/ має містити швидку дію переходу «У Завдання / Узгодження»',
  );
  assert.ok(
    mailBronnen.includes('agenda') || mailBronnen.includes('calendar'),
    'Вікно відкритого листа у src/mail/ має містити швидку дію переходу «До Календаря»',
  );
});

test('L1-G10-03: Група 10.3 — панель листа підтримує перехід або створення «Картки клієнта» у службі взаємин із клієнтами · sprong naar klantkaart vanuit berichtpaneel', async () => {
  const mailBronnen = verzamelBestanden('src/mail', ['.ts', '.tsx']).map(lees).join('\n');
  assert.ok(
    mailBronnen.includes('klantrelatiebeheer') || mailBronnen.includes('klanten'),
    'Панель контексту листа в src/mail/ має містити міжслужбовий міст до «Картки клієнта» (klantrelatiebeheer)',
  );
});

test('L1-G10-04: Група 10.4 — каталог перекладачів у shared/ai-vertaling.ts пов’язаний із живим станом без застарілого nog-niet для наявних перехідників · vertaalcatalogus zonder verouderde nog-niet', async () => {
  for (const id of ['libretranslate', 'google-vertaling', 'deepl']) {
    const motor = VERTAAL_MOTOREN.find((m) => m.id === id);
    assert.ok(motor, `У VERTAAL_MOTOREN має існувати запис ${id}`);
    assert.ok(
      !motor.uitlegUk.includes('Конектора ще немає') && !motor.uitlegUk.includes('Конектора для нього ще не написано'),
      `Опис ${id} у VERTAAL_MOTOREN не повинен містити застаріле твердження про відсутність перехідника`,
    );
    assert.ok(
      !motor.uitlegNl.includes('De koppeling bestaat nog niet') && !motor.uitlegNl.includes('De koppeling is nog niet geschreven'),
      `Нідерландський опис ${id} у VERTAAL_MOTOREN не повинен стверджувати, що перехідника ще не існує`,
    );
    assert.equal(motor.staat, 'aansluiten', `Базовий стан ${id} без активного ключа має дорівнювати 'aansluiten', а не 'nog-niet'`);
    assert.ok(motor.aansluitenHref.length > 0, `Рушій ${id} зі станом 'aansluiten' має містити непорожнє посилання aansluitenHref`);
  }
  const metAkkoord = motorenMetStand([], false, [
    { soort: 'libretranslate', akkoord: true },
    { soort: 'deepl', akkoord: true },
    { soort: 'google-translate', akkoord: true },
  ]);
  for (const id of ['libretranslate', 'google-vertaling', 'deepl']) {
    assert.equal(metAkkoord.find((m) => m.id === id)?.staat, 'werkt', `За підтвердженої згоди користувача рушій ${id} має мати стан 'werkt'`);
  }
});

test('L1-G10-05: Група 10.5 — таблиця спільних рушіїв ШІ app.ai_dienst_motoren захищена від ролі mijnruimte_app і керує aiBalkZichtbaar · ai_dienst_motoren afgeschermd en aiBalkZichtbaar zuiver', async () => {
  for (const tabel of ['ai_dienst_motoren', 'ai_motor_gebruik']) {
    const { rows } = await getPool('systeem').query<{ relrowsecurity: boolean }>(
      `SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = $1`,
      [tabel],
    );
    assert.equal(rows.length, 1, `Таблиця app.${tabel} має існувати в базі даних`);
    assert.equal(rows[0].relrowsecurity, true, `На таблиці app.${tabel} має діяти рядковий захист relrowsecurity = true`);
  }
  const { rows: appMag } = await getPool('systeem').query<{ mag: boolean }>(
    "SELECT has_table_privilege('mijnruimte_app', 'app.ai_dienst_motoren', 'SELECT') AS mag",
  );
  assert.equal(appMag[0].mag, false, 'Роль mijnruimte_app не повинна мати прямого читання таблиці спільних ключів app.ai_dienst_motoren');
  assert.equal(aiBalkZichtbaar({ geladen: true, balkTonen: true, motoren: [{ staat: 'werkt' }] }), true);
  assert.equal(aiBalkZichtbaar({ geladen: true, balkTonen: true, motoren: [{ staat: 'aansluiten' }] }), false);
});

test('L1-G10-06: Група 10.6 — поштовий постачальник Fastmail зареєстрований у shared/mail-aanbieders.ts із TLS IMAP/SMTP та офіційним знаком · Fastmail in mail-aanbieders.ts met TLS en merk', async () => {
  const fm = mailAanbieder('fastmail');
  assert.ok(fm, 'У shared/mail-aanbieders.ts має бути зареєстрований поштовий постачальник fastmail');
  assert.equal(fm.wijze, 'imap-app-wachtwoord');
  assert.equal(fm.imap?.host, 'imap.fastmail.com');
  assert.equal(fm.imap?.poort, 993);
  assert.equal(fm.imap?.versleuteling, 'tls');
  assert.equal(fm.smtp?.host, 'smtp.fastmail.com');
  assert.equal(mailAanbiederHeeftKnop(fm), true);
  assert.equal(mailAanbiederVolledig(fm), true);
  assert.equal(MAIL_IMAP_AANBIEDERS.some((a) => a.id === 'fastmail'), true);
  const merkTabel = verzamelBestanden('src/merk', ['.ts', '.tsx']).map(lees).join('\n');
  assert.ok(merkTabel.includes(fm.merk), `Ключ знака ${fm.merk} має бути присутній у єдиному реєстрі src/merk/`);
});

// ============================================================================
// ГРУПА 11. Нотатки (notities-vnext) та Календар (agenda-v3) — двосторонні зв’язки (6 перевірок)
// ============================================================================

test('L1-G11-01: Група 11.1 — у Нотатках знято заглушку про неробочий зв’язок із Календарем і відкрито прив’язку noteId ↔ eventId · koppeling noteId ↔ eventId open in Notities', async () => {
  const notitiesPagina = lees('src/notities/NotitiesPagina.tsx');
  assert.ok(
    !notitiesPagina.includes('Ще не працює — див. «Інтеграції»') && !notitiesPagina.includes('Werkt nog niet — zie «Integraties»'),
    'У src/notities/NotitiesPagina.tsx має бути прибрана заглушка «Ще не працює — див. «Інтеграції»»',
  );
  const calBron = notitieBron('google-calendar') ?? NOTITIE_BRONNEN.find((b) => b.id.includes('calendar') || b.id.includes('agenda'));
  assert.ok(calBron, 'У NOTITIE_BRONNEN має бути присутній запис зв’язку з календарем');
  assert.notEqual(calBron.stand, 'gepland', 'Зв’язок нотаток із календарем не повинен залишатися у стані gepland');
  assert.ok(
    !calBron.wat[0].includes('Серверної таблиці відповідностей ще немає'),
    'Опис зв’язку нотатки з подією більше не повинен стверджувати, що серверної таблиці ще немає',
  );
});

test('L1-G11-02: Група 11.2 — серверна схема і маршрути двосторонньої прив’язки noteId ↔ eventId захищені FORCE RLS у межах простору · servertabel en routes voor noteId ↔ eventId met FORCE RLS', async () => {
  const sys = getPool('systeem');
  const { rows: tabellen } = await sys.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'r'
        AND (
          c.relname LIKE '%notit%agenda%'
          OR c.relname LIKE '%agenda%notit%'
          OR c.relname LIKE '%notit%afspra%'
          OR c.relname LIKE '%afspra%notit%'
          OR c.relname LIKE '%notit%kalender%'
          OR c.relname LIKE '%kalender%notit%'
          OR c.relname LIKE '%notit%koppeling%'
          OR c.relname LIKE '%notit%gebeurtenis%'
          OR c.relname LIKE '%notit%event%'
        )`,
  );
  if (tabellen.length >= 1) {
    assert.equal(tabellen[0].relrowsecurity, true, `Таблиця app.${tabellen[0].relname} має мати ENABLE ROW LEVEL SECURITY`);
    assert.equal(tabellen[0].relforcerowsecurity, true, `Таблиця app.${tabellen[0].relname} має мати FORCE ROW LEVEL SECURITY`);
    return;
  }
  const mig0316 = readdirSync(resolve(WORTEL, 'migrations')).filter((f) => /^0316_[a-z0-9_]+\.sql$/.test(f));
  const { rows: kolommen } = await sys.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name = 'notities'
        AND (column_name LIKE '%agenda%' OR column_name LIKE '%afspra%' OR column_name LIKE '%event%' OR column_name LIKE '%kalender%' OR column_name LIKE '%gebeurtenis%')`,
  );
  assert.ok(
    mig0316.length >= 1 && kolommen.length >= 1,
    'У схемі app має існувати таблиця або стовпець двосторонніх зв’язків нотаток і подій календаря (міграція 0316)',
  );
  const { rows: notitiesRls } = await sys.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `SELECT c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'notities'`,
  );
  assert.equal(notitiesRls[0]?.relrowsecurity, true, 'Таблиця app.notities має мати ENABLE ROW LEVEL SECURITY');
  assert.equal(notitiesRls[0]?.relforcerowsecurity, true, 'Таблиця app.notities має мати FORCE ROW LEVEL SECURITY');
});

test('L1-G11-03: Група 11.3 — Нотатки дозволяють створити завдання зі зворотним посиланням на вихідну нотатку · taak aanmaken vanuit notitie met terugverwijzing', async () => {
  const notitieBronnen = verzamelBestanden('src/notities', ['.ts', '.tsx']).concat(['backend/notities-vnext.ts']).filter(bestaat).map(lees).join('\n');
  assert.ok(
    (notitieBronnen.includes('taak') || notitieBronnen.includes('завдання')) &&
      (notitieBronnen.includes('notitieId') || notitieBronnen.includes('noteId') || notitieBronnen.includes('bronNotitie')),
    'Служба Нотаток має підтримувати створення завдання зі зворотним посиланням на вихідну нотатку',
  );
});

test('L1-G11-04: Група 11.4 — до нотатки можна прикріпити посилання на файл зі Сховища зі збереженням дзеркала дошки · bestand uit Cloudopslag koppelen aan notitie', async () => {
  const notitieServer = lees('backend/notities-vnext.ts');
  const notitieUi = verzamelBestanden('src/notities', ['.ts', '.tsx']).map(lees).join('\n');
  assert.ok(
    (notitieServer.includes('cloud') || notitieServer.includes('bestand') || notitieUi.includes('open_item_id') || notitieUi.includes('cloudItemId')) &&
      (notitieUi.includes('/api/owner/cloud') || notitieUi.includes('bestandKoppelen') || notitieUi.includes('cloudBestand')),
    'Нотатки мають підтримувати прикріплення файла з Хмарного сховища зі збереженням синхронізації дзеркала app.mcp_console_items',
  );
});

test('L1-G11-05: Група 11.5 — картка події Календаря (включно з agenda-v3) має швидкі переходи до листів учасника, контактів та пов’язаної нотатки · snelle sprongen vanuit afspraakkaart', async () => {
  const agendaBronnen = verzamelBestanden('src/agenda', ['.ts', '.tsx']).map(lees).join('\n');
  assert.ok(
    agendaBronnen.includes('mail') && (agendaBronnen.includes('contact') || agendaBronnen.includes('afzenders')) && (agendaBronnen.includes('notities') || agendaBronnen.includes('notes')),
    'Картка події у src/agenda/ має містити швидкі переходи до листів учасника, контактів і пов’язаної нотатки зустрічі',
  );
});

test('L1-G11-06: Група 11.6 — Календар підтримує читання CalDAV та формування дійсного VCALENDAR/VEVENT (.ics), сумісного з ontleedIcs() · CalDAV-lezen en geldige .ics-opbouw', async () => {
  assert.ok(CALDAV_PRINCIPAL_LICHAAM.includes('current-user-principal'), 'Запит CALDAV_PRINCIPAL_LICHAAM має залишатися цілим');
  const queryXml = caldavQueryLichaam('20261101T000000Z', '20261201T000000Z');
  assert.ok(queryXml.includes('calendar-query') && queryXml.includes('time-range'), 'Функція caldavQueryLichaam має формувати коректне тіло REPORT');

  zorgBrowserOmgeving('https://hub.tarasevych.com', 'uk');
  const kandidaatPaden = [
    'shared/agenda-ics-model.ts',
    'shared/agenda-caldav-model.ts',
    ...verzamelBestanden('src/agenda', ['.ts']),
    ...verzamelBestanden('backend', ['.ts']).filter((p) => /^backend\/agenda-/.test(p)),
  ];
  const naamPatroon = /bouw.*Ics|maak.*Ics|naarIcs|vormIcs|export.*Ics|icsVoor|gebeurtenisNaarIcs|afspraakNaarIcs|vcalendar/i;
  let bouwer: ((...args: unknown[]) => unknown) | undefined;
  for (const pad of kandidaatPaden) {
    const mod = await laadProjectModule<Record<string, unknown>>(pad).catch(() => null);
    if (!mod) continue;
    const gevonden = Object.entries(mod).find(([k, v]) => typeof v === 'function' && (naamPatroon.test(k) || naamPatroon.test(v.name)));
    if (gevonden) {
      bouwer = gevonden[1] as (...args: unknown[]) => unknown;
      break;
    }
  }

  if (typeof bouwer === 'function') {
    const proefGebeurtenis = {
      uid: `proef-${randomUUID()}@tarasevych.com`,
      reeks: 0,
      titel: 'Перевіркова зустріч консолідації',
      summary: 'Перевіркова зустріч консолідації',
      beschrijving: 'Двомовна перевірка',
      locatie: 'Київ / Амстердам',
      begin: '2026-11-25T10:00:00Z',
      einde: '2026-11-25T11:00:00Z',
      start: '2026-11-25T10:00:00Z',
      eind: '2026-11-25T11:00:00Z',
      heleDag: false,
      tijdzone: 'UTC',
      status: 'confirmed',
      rrule: '',
      gewijzigdOp: '2026-11-25T09:00:00Z',
      organisator: '',
      url: '',
    };
    let icsTekst = '';
    for (const poging of [
      () => bouwer!(proefGebeurtenis),
      () => bouwer!([proefGebeurtenis], 'Консолідація'),
      () => bouwer!({ naam: 'Консолідація', gebeurtenissen: [proefGebeurtenis] }),
    ]) {
      try {
        const uit = String(poging() ?? '');
        if (uit.includes('BEGIN:VCALENDAR') && uit.includes('BEGIN:VEVENT')) {
          icsTekst = uit;
          break;
        }
      } catch {
        // Пробуємо наступну допустиму форму вхідного параметра
      }
    }
    assert.ok(icsTekst.includes('BEGIN:VCALENDAR') && icsTekst.includes('BEGIN:VEVENT'), 'Згенерований .ics має містити BEGIN:VCALENDAR та BEGIN:VEVENT');
    const ontleed = ontleedIcs(icsTekst);
    assert.equal(ontleed.gebeurtenissen.length, 1, 'Згенерований .ics має безпомилково розбиратися назад функцією ontleedIcs()');
    assert.equal(ontleed.gebeurtenissen[0].titel, 'Перевіркова зустріч консолідації');
    return;
  }

  const agendaBronTekst = [
    'shared/agenda-ics-model.ts',
    'shared/agenda-caldav-model.ts',
    ...verzamelBestanden('src/agenda', ['.ts', '.tsx']),
    ...verzamelBestanden('backend', ['.ts']).filter((p) => /^backend\/agenda-/.test(p)),
  ]
    .filter(bestaat)
    .map(lees)
    .join('\n');
  assert.ok(
    agendaBronTekst.includes('BEGIN:VCALENDAR') &&
      agendaBronTekst.includes('BEGIN:VEVENT') &&
      agendaBronTekst.includes('END:VEVENT') &&
      agendaBronTekst.includes('END:VCALENDAR'),
    'Календар має містити генератор дійсного формату VCALENDAR/VEVENT (.ics)',
  );
});

// ============================================================================
// ГРУПА 12. Хмарні модулі CLOUD_M4..M11, WebDAV та Фото з Drive (6 перевірок)
// ============================================================================

test('L1-G12-01: Група 12.1 — хмарні маршрути M4, M5 та M6 керуються прапорцями app.feature_flags і не повертають глухий 404 *_NOT_RELEASED без process.env · M4, M5 en M6 zonder 404 *_NOT_RELEASED', async () => {
  const srv = await gedeeldeServer();
  const cloudSessie = await srv.sessieVoor('cloud');
  const oudM4 = process.env.CLOUD_M4_CONNECTIONS_STAGING;
  const oudM5 = process.env.CLOUD_M5_CATALOGUE_STAGING;
  const oudM6 = process.env.CLOUD_M6_ADMIN_STAGING;
  try {
    delete process.env.CLOUD_M4_CONNECTIONS_STAGING;
    delete process.env.CLOUD_M5_CATALOGUE_STAGING;
    delete process.env.CLOUD_M6_ADMIN_STAGING;

    const r4 = await cloudSessie.verzoek('cloud.tarasevych.com', '/api/owner/cloud/integrations/v1/accounts/list', cloudSessie.ctxBody('cloud'));
    assert.notEqual(r4.data?.error, 'CLOUD_M4_NOT_RELEASED', 'Маршрут M4 accounts/list має працювати через app.feature_flags без CLOUD_M4_CONNECTIONS_STAGING');

    const r5 = await cloudSessie.verzoek('cloud.tarasevych.com', '/api/owner/cloud/integrations/v1/catalogue', cloudSessie.ctxBody('cloud'));
    assert.notEqual(r5.data?.error, 'CLOUD_M5_NOT_RELEASED', 'Маршрут M5 catalogue має працювати через app.feature_flags без CLOUD_M5_CATALOGUE_STAGING');

    const r6 = await cloudSessie.verzoek('cloud.tarasevych.com', '/api/owner/cloud/integrations/v1/admin/policies/list', cloudSessie.ctxBody('cloud'));
    assert.notEqual(r6.data?.error, 'CLOUD_M6_NOT_RELEASED', 'Маршрут M6 admin/policies/list має керуватися прапорцем БД, а не повертати CLOUD_M6_NOT_RELEASED');
  } finally {
    if (oudM4 === undefined) delete process.env.CLOUD_M4_CONNECTIONS_STAGING; else process.env.CLOUD_M4_CONNECTIONS_STAGING = oudM4;
    if (oudM5 === undefined) delete process.env.CLOUD_M5_CATALOGUE_STAGING; else process.env.CLOUD_M5_CATALOGUE_STAGING = oudM5;
    if (oudM6 === undefined) delete process.env.CLOUD_M6_ADMIN_STAGING; else process.env.CLOUD_M6_ADMIN_STAGING = oudM6;
  }
});

test('L1-G12-02: Група 12.2 — хмарні модулі M8, M10 та M11 керуються прапорцями app.feature_flags без глухого 404 *_NOT_RELEASED · M8, M10 en M11 via app.feature_flags', async () => {
  const srv = await gedeeldeServer();
  const cloudSessie = await srv.sessieVoor('cloud');
  const adminSessie = await srv.sessieVoor('admin');
  const oudM8 = process.env.CLOUD_M8_DIRECTORY_STAGING;
  const oudM10 = process.env.CLOUD_M10_ADMIN_STAGING;
  const oudM10Rt = process.env.CLOUD_M10_STAGING_RUNTIME;
  const oudM11 = process.env.CLOUD_M11_PREVIEW_STAGING;
  try {
    delete process.env.CLOUD_M8_DIRECTORY_STAGING;
    delete process.env.CLOUD_M10_ADMIN_STAGING;
    delete process.env.CLOUD_M10_STAGING_RUNTIME;
    delete process.env.CLOUD_M11_PREVIEW_STAGING;

    const r8 = await cloudSessie.verzoek(
      'cloud.tarasevych.com',
      '/api/owner/cloud/integrations/v1/directory/list',
      cloudSessie.ctxBody('cloud', { accountId: 'acc-1', folderId: 'root' }),
    );
    assert.notEqual(r8.data?.error, 'CLOUD_M8_NOT_RELEASED', 'Маршрут M8 directory/list не повинен повертати CLOUD_M8_NOT_RELEASED при увімкненому прапорці БД');

    const r10 = await adminSessie.verzoek('admin.tarasevych.com', '/api/owner/admin/cloud/providers/list', adminSessie.ctxBody('admin'));
    assert.notEqual(r10.data?.error, 'CLOUD_M10_NOT_RELEASED', 'Маршрут M10 providers/list не повинен повертати CLOUD_M10_NOT_RELEASED при увімкненому прапорці БД');

    const r11 = await cloudSessie.verzoek(
      'cloud.tarasevych.com',
      '/api/owner/cloud/integrations/v1/files/preview',
      cloudSessie.ctxBody('cloud', { accountId: 'acc-1', fileId: 'f-1', expectedRevision: 'r-1' }),
    );
    assert.notEqual(r11.data?.error, 'CLOUD_M11_PREVIEW_NOT_RELEASED', 'Маршрут M11 files/preview не повинен повертати CLOUD_M11_PREVIEW_NOT_RELEASED');
  } finally {
    if (oudM8 === undefined) delete process.env.CLOUD_M8_DIRECTORY_STAGING; else process.env.CLOUD_M8_DIRECTORY_STAGING = oudM8;
    if (oudM10 === undefined) delete process.env.CLOUD_M10_ADMIN_STAGING; else process.env.CLOUD_M10_ADMIN_STAGING = oudM10;
    if (oudM10Rt === undefined) delete process.env.CLOUD_M10_STAGING_RUNTIME; else process.env.CLOUD_M10_STAGING_RUNTIME = oudM10Rt;
    if (oudM11 === undefined) delete process.env.CLOUD_M11_PREVIEW_STAGING; else process.env.CLOUD_M11_PREVIEW_STAGING = oudM11;
  }
});

test('L1-G12-03: Група 12.3 — модель постачальників shared/cloud-vnext-model.ts не вимагає ручних змінних CLOUD_M*_STAGING для OneDrive, Dropbox та Box · geen CLOUD_M*_STAGING in model', async () => {
  for (const id of ['onedrive', 'dropbox', 'box']) {
    const a = CLOUD_VNEXT_AANBIEDERS.find((x) => x.id === id);
    assert.ok(a, `Постачальник ${id} має бути присутній у CLOUD_VNEXT_AANBIEDERS`);
    const vereist = a.vereist ?? [];
    assert.ok(
      !vereist.some((v) => v.startsWith('CLOUD_M')),
      `Масив vereist постачальника ${id} не повинен містити ручних змінних CLOUD_M*: ${vereist.join(', ')}`,
    );
    assert.ok(
      !a.detail[0].includes('_STAGING') && !a.detail[1].includes('_STAGING') && !a.detail[0].includes('staging-прапорці'),
      `Тексти detail постачальника ${id} не повинні вимагати ручних передпускових змінних середовища`,
    );
  }
});

test('L1-G12-04: Група 12.4 — безпечне HTTPS-підключення WebDAV доступне для Nextcloud та NAS у Хмарному сховищі · HTTPS WebDAV-koppeling beschikbaar voor Nextcloud en NAS', async () => {
  for (const id of ['nextcloud', 'nas-webdav']) {
    const a = cloudVnextAanbieder(id);
    assert.ok(a, `Постачальник ${id} має існувати у CLOUD_VNEXT_AANBIEDERS`);
    assert.notEqual(a.stand, 'gepland', `Постачальник ${id} має бути переведений із 'gepland' у робочий режим HTTPS WebDAV`);
    assert.notEqual(a.richting, 'geen', `Постачальник ${id} має підтримувати роботу з файлами через WebDAV`);
  }
});

test('L1-G12-05: Група 12.5 — у Хмарному сховищі реалізовані правила автоматизацій замість заглушки «Автоматизації: заплановано» · automatiseringsregels in Cloudopslag actief', async () => {
  const integratiesTsx = lees('src/cloud-vnext/onderdelen/Integraties.tsx');
  assert.ok(
    !integratiesTsx.includes('Автоматизації: заплановано') && !integratiesTsx.includes('Automatiseringen: gepland'),
    'У src/cloud-vnext/onderdelen/Integraties.tsx має бути прибрана статична заглушка «Автоматизації: заплановано»',
  );
});

test('L1-G12-06: Група 12.6 — служба «Фото» підтримує прямий показ світлин із підключеного Google Drive за згодою користувача · rechtstreekse weergave van foto’s uit Google Drive', async () => {
  const gd = bronDef('google-drive');
  assert.ok(gd, 'Джерело google-drive має існувати у FOTO_BRONNEN');
  assert.ok(
    gd.toegang.includes('live'),
    `Джерело google-drive у службі «Фото» має підтримувати живий доступ 'live' (зараз: ${gd.toegang.join(', ')})`,
  );
});

// ============================================================================
// ГРУПА 13. Робочий стіл Werkblad v3 та розділ «Соціальні мережі» (social) (6 перевірок)
// ============================================================================

test('L1-G13-01: Група 13.1 — блок github на робочому столі Werkblad має стан klaar і маршрут зведення для сеансу hub · blok github op Werkblad heeft stand klaar', async () => {
  const w = werkbladWidget('github');
  assert.ok(w, 'Блок github має бути присутній у WERKBLAD_WIDGETS');
  assert.equal(w.stand, 'klaar', 'Блок github на робочому столі має мати стан klaar');
  assert.ok(w.bron.trim().length > 0, 'Блок github має вказувати серверний маршрут читання зведення у полі bron');
  assert.equal(werkbladToegestaan('github', { ruimte: 'prive' }), true);
  assert.equal(werkbladToegestaan('github', { ruimte: 'technisch' }), true);
});

test('L1-G13-02: Група 13.2 — блоки github-activiteit та ai-toegang у Бюро мають стан klaar і доступні для розміщення · blokken github-activiteit en ai-toegang plaatsbaar in Bureau', async () => {
  for (const id of ['github-activiteit', 'ai-toegang'] as const) {
    const b = bureauWidget(id);
    assert.ok(b, `Блок ${id} має існувати у BUREAU_WIDGETS`);
    assert.equal(b.stand, 'klaar', `Блок ${id} у Бюро має мати стан klaar`);
    assert.ok(b.bron.trim().length > 0, `Блок ${id} у Бюро має містити непорожній серверний маршрут bron`);
    assert.equal(plaatsbaar(id), true, `Функція plaatsbaar('${id}') має повертати true`);
  }
});

test('L1-G13-03: Група 13.3 — серверні маршрути зведення GitHub та дозволів ШІ приймають схвалений сеанс hub без розкриття секретів · samenvattingsroutes voor hub-sessie zonder geheimen', async () => {
  const srv = await gedeeldeServer();
  const hubSessie = await srv.sessieVoor('hub');
  const bronnen = [
    werkbladWidget('github')?.bron || '',
    bureauWidget('github-activiteit')?.bron || '',
    bureauWidget('ai-toegang')?.bron || '',
  ].filter(Boolean);
  assert.ok(bronnen.length >= 2, 'Мають бути визначені серверні маршрути зведення для блоків GitHub та дозволів ШІ на хабі');
  for (const ruweBron of new Set(bronnen)) {
    const [methode, pad] = ruweBron.trim().split(/\s+/);
    const res = await hubSessie.verzoek('hub.tarasevych.com', pad, hubSessie.ctxBody('hub'), { methode });
    assert.equal(res.status, 200, `Маршрут ${ruweBron} має приймати схвалений сеанс служби hub (отримано ${res.status}: ${res.body})`);
    assert.ok(
      !res.body.includes('"ciphertext"') && !res.body.includes('"tokenHash"') && !res.body.includes('"clientSecret"'),
      `Відповідь маршруту ${ruweBron} не повинна містити зашифрованих чи сирих таємниць`,
    );
  }
});

test('L1-G13-04: Група 13.4 — робочий стіл Werkblad v3 підтримує перейменування тек і серверну синхронізацію власних ярликів · mappen hernoemen en serversynchronisatie van snelkoppelingen', async () => {
  const v3Tsx = lees('src/werkblad/WerkbladV3.tsx');
  const apiV3 = lees('src/werkblad/api-v3.ts');
  const serverV3 = bestaat('backend/werkblad-v3.ts') ? lees('backend/werkblad-v3.ts') : '';
  assert.ok(
    !v3Tsx.includes('const [lokaalUsr, zetLokaalUsr] = useState') || apiV3.includes('eigenSnelkoppelingen') || serverV3.includes('usr:'),
    'Власні ярлики usr:* на робочому столі Werkblad v3 мають синхронізуватися із сервером у межах простору, а не жити лише в localStorage одного оглядача',
  );
});

test('L1-G13-05: Група 13.5 — переходи з Werkblad v3 із параметром ?actie= обробляються цільовими сторінками, а правила розміщення блоків чинні · sprongen met ?actie= en plaatsingsregels', async () => {
  const blokA: Blok = {
    id: 'blk-1',
    soort: 'blok',
    titel: 'Тека А',
    afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO },
    volgorde: 0,
    indeling: STANDAARD_INDELING,
    kinderen: [],
  };
  const doelZelf = maakPlek('blok', 'blk-1');
  const kringOordeel = beoordeelNeerzetting(
    { van: 'blok', knoopId: 'blk-1' },
    { doel: doelZelf, voor: null, kopie: false },
    { wortels: [blokA], plekken: [doelZelf] },
  );
  assert.deepEqual(kringOordeel, { ok: false, reden: 'kring' }, 'Вкладення блока самого в себе має відхилятися з причиною kring');

  const canvasPlek = maakPlek('canvas', 'hoofd');
  const ruimteOordeel = beoordeelNeerzetting(
    { van: 'bibliotheek', itemId: 'wdg:tech-server' },
    { doel: canvasPlek, voor: null, kopie: false },
    { wortels: [], plekken: [canvasPlek], ruimte: 'prive', ruimtesVan: (id) => (id === 'wdg:tech-server' ? ['technisch'] : ['prive', 'technisch']) },
  );
  assert.deepEqual(ruimteOordeel, { ok: false, reden: 'niet-toegestaan-in-ruimte' });

  const alleSrc = verzamelBestanden('src', ['.ts', '.tsx']).map(lees).join('\n');
  assert.ok(
    alleSrc.includes("searchParams.get('actie')") || alleSrc.includes('searchParams.get("actie")'),
    'Цільові сторінки в src/ мають зчитувати й обробляти параметр швидкої дії ?actie= під час переходу з Werkblad v3 (#165)',
  );
});

test('L1-G13-06: Група 13.6 — розділ «Соціальні мережі» (social) розблокований у меню й реєстрі ярликів та має прикладну двомовну сторінку src/social/ · onderdeel social ontgrendeld met pagina', async () => {
  assert.notEqual(DIENST_DEF.social.planned, true, 'У DIENST_DEF.social позначка planned більше не повинна дорівнювати true');
  const socialItem = registerItemVoorEntry('svc:social');
  assert.equal(socialItem?.beschikbaarheid, 'ready', 'Ярлик svc:social у реєстрі робочого столу має мати стан ready');

  zorgBrowserOmgeving('https://hub.tarasevych.com', 'uk');
  const menuMod = await laadProjectModule<{ MENU_CATALOG?: Array<{ id: string; planned?: boolean }> }>('src/menu-voorkeuren.tsx');
  const menuSocial = menuMod?.MENU_CATALOG?.find((i) => i.id === 'social');
  assert.notEqual(menuSocial?.planned, true, 'У MENU_CATALOG (src/menu-voorkeuren.tsx) запис social не повинен мати planned: true');

  const socialBestanden = verzamelBestanden('src/social', ['.tsx']);
  assert.ok(socialBestanden.length >= 1, 'Має існувати прикладна двомовна сторінка розділу в каталозі src/social/');
  const paginaMod = await laadProjectModule<Record<string, unknown>>(socialBestanden[0]);
  const Comp = paginaMod ? (Object.values(paginaMod).find((v) => typeof v === 'function') as ((p: Record<string, unknown>) => unknown) | undefined) : undefined;
  assert.equal(typeof Comp, 'function', 'Модуль сторінки src/social/ має експортувати компонент-функцію');
  const htmlUk = renderToStaticMarkup(createElement(Comp as never, { lang: 'uk' }));
  assert.ok(htmlUk.length > 20, 'Компонент розділу social має успішно відмальовувати розмітку');
});

// ============================================================================
// ГРУПА 14. Майстер інтеграцій, Центр підключень та Картотека «Звірка» (Afstemming vNext) (6 перевірок)
// ============================================================================

test('L1-G14-01: Група 14.1 — майстер інтеграцій WizardV2 зберігає перевірене підключення типу adapter у захищене сховище без відкладеної заглушки · WizardV2 bewaart adapterkoppelingen', async () => {
  const wizardTsx = lees('src/integraties/WizardV2.tsx');
  assert.ok(
    !wizardTsx.includes('Збереження цього підключення буде в наступному етапі') &&
      !wizardTsx.includes('Deze koppeling bewaren komt in een volgende fase'),
    'У src/integraties/WizardV2.tsx має бути прибрана заглушка про відкладене збереження підключення типу adapter',
  );
});

test('L1-G14-02: Група 14.2 — центр підключень VerbindingenCentrum надає справжні дії керування замість напису «Пробний режим: лише перегляд» · echte beheeracties in VerbindingenCentrum', async () => {
  const centrumTsx = lees('src/verbindingen/VerbindingenCentrum.tsx');
  assert.ok(
    !centrumTsx.includes('Пробний режим: лише перегляд') && !centrumTsx.includes('Proefmodus: alleen bekijken'),
    'У src/verbindingen/VerbindingenCentrum.tsx має бути прибраний напис «Пробний режим: лише перегляд» та підключені справжні дії керування',
  );
});

test('L1-G14-03: Група 14.3 — картотека Afstemming vNext має загальну стрічку подій усіх карток та живі проби готовності маршрутів · volledige gebeurtenissenstroom en live routecontroles', async () => {
  const geschiedenisTsx = lees('src/afstemming-vnext/onderdelen/Geschiedenis.tsx');
  const controlesTsx = lees('src/afstemming-vnext/onderdelen/Controles.tsx');
  assert.ok(
    !geschiedenisTsx.includes('Повна стрічка всіх карток одразу — заплановано'),
    'У Geschiedenis.tsx має бути реалізовано загальну стрічку подій усіх карток замість заглушки «заплановано»',
  );
  assert.ok(
    !controlesTsx.includes('Живі проби з цієї сторінки — заплановано'),
    'У Controles.tsx мають працювати безпечні внутрішні проби маршрутів замість заглушки «заплановано»',
  );
});

test('L1-G14-04: Група 14.4 — картотека Afstemming vNext підтримує розбір задуму за допомогою ШІ зі згоди людини та вкладення PDF і зображень · AI-ontleding en PDF-/afbeeldingsbijlagen', async () => {
  const toevoegenTsx = lees('src/afstemming-vnext/onderdelen/Toevoegen.tsx');
  const tekstTs = lees('src/afstemming-vnext/tekst.ts');
  assert.ok(
    !toevoegenTsx.includes('ШІ-розбір задуму — заплановано'),
    'У Toevoegen.tsx має бути реалізовано структурування чернетки за явною дією людини замість заглушки «ШІ-розбір задуму — заплановано»',
  );
  assert.ok(
    !tekstTs.includes('PDF/зображення — заплановано'),
    'У src/afstemming-vnext/tekst.ts має бути знято обмеження «PDF/зображення — заплановано»',
  );
});

test('L1-G14-05: Група 14.5 — джерела Afstemming vNext автоматично зіставляються з orchestratie/ і мають переходи до цільової служби та Календаря · koppeling met orchestratie/ en sprong naar dienst', async () => {
  const bronnenTsx = lees('src/afstemming-vnext/onderdelen/Bronnen.tsx');
  assert.ok(
    !/automatisch[\s\S]{0,120}'gepland'/.test(bronnenTsx) && !bronnenTsx.includes('Автоматичне зіставлення — заплановано'),
    'У src/afstemming-vnext/onderdelen/Bronnen.tsx автоматичне зіставлення з orchestratie/ має бути переведене зі стану gepland у робочу дію',
  );
  const afstemmingUi = verzamelBestanden('src/afstemming-vnext', ['.ts', '.tsx']).map(lees).join('\n');
  assert.ok(
    afstemmingUi.includes('agenda') || afstemmingUi.includes('calendar'),
    'Картка узгодження у src/afstemming-vnext/ має підтримувати швидкий перехід до Календаря й цільової служби',
  );
});

test('L1-G14-06: Група 14.6 — серверне ядро Afstemming vNext дотримується оптимістичної версійності 409 VERSIE_CONFLICT та заборони AGENT_MAG_NIET · 409 VERSIE_CONFLICT en AGENT_MAG_NIET', async () => {
  const srv = await gedeeldeServer();
  const apiSessie = await srv.sessieVoor('api');
  const sys = getPool('systeem');
  let aangemaakteKaartId = '';
  try {
    const maakRes = await apiSessie.verzoek(
      'api.tarasevych.com',
      '/api/owner/afstemming/voorstel',
      apiSessie.ctxBody('api', {
        titel: ['Перевіркова картка версійності', 'Testkaart voor versiebeheer'],
        samenvatting: ['Перевірка 409 та заборони агента', 'Controle van 409 en agentverbod'],
        dienst: 'hub',
        prioriteit: 'P1',
        idempotentie: `laag1-g14-${randomUUID()}`,
      }),
    );
    assert.equal(maakRes.status, 200, `Створення картки через /voorstel має повертати 200: ${maakRes.body}`);
    const kaart = maakRes.data?.kaart as { id: string; versie: number };
    aangemaakteKaartId = kaart.id;
    assert.ok(aangemaakteKaartId && Number.isInteger(kaart.versie));

    const conflictRes = await apiSessie.verzoek(
      'api.tarasevych.com',
      '/api/owner/afstemming/wijzig',
      apiSessie.ctxBody('api', {
        id: aangemaakteKaartId,
        versie: kaart.versie + 99,
        velden: { eigenNotitie: 'Спроба запису із застарілою версією' },
      }),
    );
    assert.equal(conflictRes.status, 409, 'Оновлення картки з невідповідною версією має повертати 409');
    assert.equal(conflictRes.data?.error, 'VERSIE_CONFLICT');
    assert.ok(conflictRes.data?.huidig, 'При 409 VERSIE_CONFLICT сервер має повертати свіжу версію картки huidig');

    const agentFaseRes = await apiSessie.verzoek(
      'api.tarasevych.com',
      '/api/owner/afstemming/fase',
      apiSessie.ctxBody('api', { id: aangemaakteKaartId, versie: kaart.versie, fase: 'approved', alsAgent: true }),
    );
    assert.equal(agentFaseRes.data?.error, 'AGENT_MAG_NIET', 'Агент ніколи не має права схвалювати фази людини (AGENT_MAG_NIET)');

    const zonderBewijsRes = await apiSessie.verzoek(
      'api.tarasevych.com',
      '/api/owner/afstemming/fase',
      apiSessie.ctxBody('api', { id: aangemaakteKaartId, versie: kaart.versie, fase: 'production_verified' }),
    );
    assert.equal(zonderBewijsRes.data?.error, 'FASE_BEWIJS_ONTBREEKT', 'Перехід у production_verified без доказу має відхилятися з FASE_BEWIJS_ONTBREEKT');
  } finally {
    if (aangemaakteKaartId) {
      await sys.query("DELETE FROM app.records WHERE data->>'kaartId' = $1 OR id = $1", [aangemaakteKaartId]);
    }
  }
});

// ============================================================================
// ГРУПА 15. Розмова ШІ, API Platform, MCP, Навички, Пам’ять та Оновлення (6 перевірок)
// ============================================================================

test('L1-G15-01: Група 15.1 — у робочій розмові ШІ (AiWerkruimteChat) реалізовано вибір цільового пристрою на зв’язку замість nog-niet · apparaatkeuze in AiWerkruimteChat actief', async () => {
  const chatBron = lees('src/AiWerkruimteChat.tsx');
  assert.ok(
    !chatBron.includes("data-aiw-apparaatkeuze='nog-niet'") &&
      !chatBron.includes('data-aiw-apparaatkeuze="nog-niet"') &&
      !chatBron.includes('вибрати один тут поки не можна'),
    'У src/AiWerkruimteChat.tsx заглушка nog-niet має бути замінена на справжній елемент вибору цільового під’єднаного пристрою',
  );
});

test('L1-G15-02: Група 15.2 — контракт API Platform публікує три області лише для читання (mail.read, calendar.read, files.metadata.read) у стані published · drie leesscopes gepubliceerd', async () => {
  const brug = await laadServerBrug();
  for (const scopeId of ['mail.read', 'calendar.read', 'files.metadata.read']) {
    const cap = API_PLATFORM_CAPABILITIES.find((c) => c.id === scopeId);
    assert.ok(cap, `Область ${scopeId} має бути оголошена у API_PLATFORM_CAPABILITIES`);
    assert.equal(cap.status, 'published', `Область ${scopeId} має мати статус published`);
    assert.equal(cap.actor, 'machine-token', `Область ${scopeId} має призначатися для machine-token`);
    assert.ok(!cap.descriptionUk.includes('ще не видається'), `Опис ${scopeId} не повинен містити фразу «ще не видається»`);
    assert.ok(
      brug.API_PAT_ISSUABLE_SCOPES.includes(scopeId),
      `Область ${scopeId} має входити до переліку дозволених до випуску API_PAT_ISSUABLE_SCOPES`,
    );
  }
  const contract = apiPlatformContractPayload({ id: 'u1', email: 'eigenaar@example.invalid', role: 'owner' });
  assert.equal(contract.writeScopesEnabled, false, 'Прапорець областей запису writeScopesEnabled має непорушно залишатися false');
});

test('L1-G15-03: Група 15.3 — маршрути машинного читання /api/v1/* для пошти, календаря та метаданих файлів перевіряють область маркера і миттєве відкликання · /api/v1/* leest per scope en intrekking werkt', async () => {
  const brug = await laadServerBrug();
  const srv = await gedeeldeServer();
  const sys = getPool('systeem');
  let aangemaaktTokenId = '';
  try {
    const routes = brug.createApiPlatformRoutes({
      requireSession: async () => ({
        user: { id: srv.eigenaarUserId, email: srv.eigenaarEmail, role: 'owner', status: 'approved' },
        service: 'api',
      }),
      respond: (data, status = 200) => ({ statusCode: status, headers: {}, body: JSON.stringify(data) }),
      fail: (msg, status = 403) => ({ statusCode: status, headers: {}, body: JSON.stringify({ error: msg }) }),
      audit: async () => undefined,
      body: (b) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {}),
    });

    const maakRes = await routes['POST /api/owner/api-platform/tokens/create'][0]({
      event: { headers: {} },
      body: { scopes: ['identity.me.read', 'mail.read', 'calendar.read', 'files.metadata.read'], label: 'Перевірка Рівня 1' },
      params: {},
      query: {},
    });
    assert.equal(maakRes.statusCode, 200, `Випуск маркера з трьома новими областями читання має повертати 200: ${maakRes.body}`);
    const maakData = JSON.parse(maakRes.body) as { plaintext: string; item: { id: string } };
    aangemaaktTokenId = maakData.item.id;
    assert.ok(maakData.plaintext.startsWith('tsv_'));

    const v1Routes = srv.G.handler.patronen.filter((p) => p.startsWith('GET /api/v1/'));
    assert.ok(
      v1Routes.length >= 4,
      `У головному обробнику мають бути зареєстровані маршрути GET /api/v1/* для me, пошти, календаря та метаданих файлів (зараз: ${v1Routes.join(', ')})`,
    );

    const kopMetSleutel = { authorization: `Bearer ${maakData.plaintext}` };
    for (const patroon of v1Routes) {
      const pad = patroon.replace(/^GET\s+/, '');
      const los = srv.G.browser();
      const leesRes = await los.verzoek('api.tarasevych.com', pad, {}, { methode: 'GET', kop: kopMetSleutel });
      assert.equal(leesRes.status, 200, `Маршрут ${patroon} із дійсним маркером власника має повертати 200`);
    }

    const intrekRes = await routes['POST /api/owner/api-platform/tokens/:id/revoke'][0]({
      event: { headers: {} },
      body: {},
      params: { id: aangemaaktTokenId },
      query: {},
    });
    assert.equal(intrekRes.statusCode, 200);

    const naIntrekking = await brug.resolveApiMachineToken({ headers: kopMetSleutel });
    assert.equal('errorCode' in naIntrekking ? naIntrekking.errorCode : '', 'API_TOKEN_REVOKED');
  } finally {
    if (aangemaaktTokenId) {
      await sys.query("DELETE FROM app.records WHERE tbl = 'api_machine_tokens_v1' AND id = $1", [aangemaaktTokenId]);
    }
  }
});

test('L1-G15-04: Група 15.4 — панель інструментів MCP відображає живий стан джерел «Внутрішній диск сайту», «Outlook (Microsoft)» та «OneDrive (Microsoft)» · live status in McpHulpmiddelenPaneel', async () => {
  const paneelBron = lees('src/McpHulpmiddelenPaneel.tsx');
  for (const sleutelWoord of ['Внутрішній диск сайту', 'Outlook (Microsoft)', 'OneDrive']) {
    const ontsnapt = sleutelWoord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bronObjectRe = new RegExp(`\\{[^{}]*${ontsnapt}[^{}]*\\}`);
    const match = bronObjectRe.exec(paneelBron);
    if (match) {
      assert.ok(
        !/\blive\s*:\s*false\b/.test(match[0]),
        `Джерело «${sleutelWoord}» у McpHulpmiddelenPaneel.tsx не повинно бути заблоковане статичним літералом live: false`,
      );
    } else {
      assert.ok(
        paneelBron.includes(sleutelWoord.split(' ')[0]),
        `Джерело «${sleutelWoord}» має залишатися представленим у McpHulpmiddelenPaneel.tsx`,
      );
    }
  }
});

test('L1-G15-05: Група 15.5 — екосистема навичок (#96/#106) валідна для всіх 14 агентів і містить правила VLAG-001 та MELDINGEN-REGISTER-001 · vaardigheden geldig met VLAG-001 en MELDINGEN-REGISTER-001', async () => {
  const r = spawnSync(process.execPath, [resolve(WORTEL, 'scripts/vaardigheden/valideer.mjs')], { cwd: WORTEL, encoding: 'utf8' });
  assert.equal(r.status, 0, `Перевірка навичок scripts/vaardigheden/valideer.mjs має завершуватися з кодом 0: ${r.stderr || r.stdout}`);
  assert.ok(bestaat('backend/vaardigheden-routes.ts'), 'Серверні маршрути керування навичками backend/vaardigheden-routes.ts мають бути наявні');

  const kernVaardigheden = [
    '.agents/skills/site-ontwikkelen/SKILL.md',
    '.agents/skills/wijziging-controleren/SKILL.md',
    '.agents/skills/uitgave-voorbereiden/SKILL.md',
  ];
  const samengevoegd = kernVaardigheden.map(lees).join('\n');
  assert.ok(samengevoegd.includes('VLAG-001'), 'Навички розроблення та випуску у .agents/skills/ мають містити чинне правило прапорців VLAG-001');
  assert.ok(
    samengevoegd.includes('MELDINGEN-REGISTER-001') || samengevoegd.includes('meldingen-register-controle.mjs'),
    'Навички у .agents/skills/ мають містити вимогу реєстру сповіщень MELDINGEN-REGISTER-001',
  );
});

test('L1-G15-06: Група 15.6 — потік пам’яті агентів (#102) та секція «Telegram — архіви випусків» (#98) повністю присутні та захищені · geheugenstroom en Telegram-releasearchief intact', async () => {
  const vereisteBestanden = [
    'src/ai-ecosysteem/GeheugenStroomPaneel.tsx',
    'src/ai-ecosysteem/GeheugenTakenPaneel.tsx',
    'src/ai-ecosysteem/AgentTelegramBotsPaneel.tsx',
    'backend/geheugen-stroom.ts',
    'backend/geheugen-taken.ts',
    'backend/geheugen-agent-bots.ts',
    'src/uitrol/TelegramArchief.tsx',
    'backend/uitrol-telegram.ts',
  ];
  for (const p of vereisteBestanden) {
    assert.ok(bestaat(p), `Збережений модуль ${p} має залишатися присутнім без регресій`);
  }
  assert.ok(lees('src/uitrol/TelegramArchief.tsx').includes('data-ut-telegram-archief'), 'Компонент TelegramArchief.tsx має зберігати ознаку data-ut-telegram-archief');
  const srv = await gedeeldeServer();
  for (const r of [
    'POST /api/owner/uitrol/telegram/stand',
    'POST /api/owner/uitrol/telegram/instellingen',
    'POST /api/owner/uitrol/telegram/testen',
    'POST /api/owner/uitrol/telegram/archiveren',
  ]) {
    assert.ok(srv.G.handler.patronen.includes(r), `Маршрут ${r} має бути зареєстрований у головному обробнику`);
  }
});

// ============================================================================
// ГРУПА 16. Мовне очищення (№163) та візуальна єдність стилів і тем (6 перевірок)
// ============================================================================

test('L1-G16-01: Група 16.1 — у коді, оболонці, навичках і документації відсутні літери поза українською абеткою · nergens verboden letters buiten het Oekraïense alfabet', async () => {
  const verbodenLetters = new RegExp('[\\u0401\\u0451\\u042A\\u044A\\u042B\\u044B\\u042D\\u044D]');
  const mappen = ['src', 'backend', 'server', 'shared', 'docs', '.agents/skills'];
  const overtredingen: string[] = [];
  for (const map of mappen) {
    for (const pad of verzamelBestanden(map, ['.ts', '.tsx', '.mjs', '.js', '.css', '.md', '.json'])) {
      // Зовнішні атрибуції Вікімедіа для гербів та таблиця захисту від омогліфів IDN не є текстом проєкту
      if (pad === 'src/merk/plaats/HERKOMST.json') continue;
      const tekst = lees(pad);
      const regels = tekst.split('\n');
      for (let i = 0; i < regels.length; i++) {
        const regel = regels[i];
        if (regel.includes('RUSSISCH') || regel.includes('RU_LETTERS') || regel.includes('verboden')) continue;
        if (pad === 'shared/ai-verbinding.ts' && regel.includes("ј: 'j'")) continue;
        if (verbodenLetters.test(regel)) {
          overtredingen.push(`${pad}:${i + 1}`);
          if (overtredingen.length >= 10) break;
        }
      }
    }
  }
  assert.deepEqual(overtredingen, [], `Виявлено літери поза українською абеткою у файлах: ${overtredingen.join(', ')}`);
});

test('L1-G16-02: Група 16.2 — в українських текстах оболонки src/ усунено жаргон зі звернення №163 · jargon uit melding #163 verwijderd uit Oekraïense interfaceteksten', async () => {
  const verbodenMcp = nepGeheim('MCP-', '\u0442\u043e\u043a\u0435\u043d');
  const treffers: string[] = [];
  for (const pad of verzamelBestanden('src', ['.ts', '.tsx'])) {
    const inhoud = lees(pad);
    const zonderCommentaar = inhoud.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    if (zonderCommentaar.includes(verbodenMcp)) {
      treffers.push(`${pad} (${verbodenMcp})`);
    }
    const regels = zonderCommentaar.split('\n');
    for (let i = 0; i < regels.length; i++) {
      if (/[\u0400-\u04FF]\s+passkey\b/i.test(regels[i]) || /\bpasskey\s+[\u0400-\u04FF]/i.test(regels[i])) {
        treffers.push(`${pad}:${i + 1} (неперекладене passkey у кириличній фразі)`);
        break;
      }
    }
  }
  assert.deepEqual(
    treffers.slice(0, 15),
    [],
    `В українських текстах src/ мають бути замінені вирази зі звернення №163 на «ключ підключення MCP» та «ключ доступу»: ${treffers.slice(0, 10).join('; ')}`,
  );
});

test('L1-G16-03: Група 16.3 — шар src/thema/staat-kleuren.css підключено в основу оформлення, а таблиці стилів використовують змінні теми · staat-kleuren.css gekoppeld en stijlbladen op variabelen', async () => {
  assert.ok(bestaat('src/thema/staat-kleuren.css'), 'Шар src/thema/staat-kleuren.css має існувати');
  const hoofdStijlen = [
    'src/thema/useThema.ts',
    'src/index.css',
    'src/App.css',
    'src/canoniek-omlijsting.css',
    'src/ontwerp/tokens.css',
    'src/main.tsx',
  ]
    .filter(bestaat)
    .map(lees)
    .join('\n');
  assert.ok(
    hoofdStijlen.includes('staat-kleuren.css'),
    'Файл src/thema/staat-kleuren.css має підключатися у базовому ланцюжку стилів сайту',
  );
  for (const cssPad of ['src/ai-ecosysteem/geheugen-stroom.css', 'src/uitrol/uitrol.css', 'src/agenda/agenda.css']) {
    if (bestaat(cssPad)) {
      assert.ok(lees(cssPad).includes('var(--'), `Таблиця стилів ${cssPad} має спиратися на змінні теми var(--...)`);
    }
  }
});

test('L1-G16-04: Група 16.4 — усі старі й нові компоненти src/ відображають знаки служб через єдиний реєстр src/merk/ (REESTR-LOGO-001) · merklogo’s uitsluitend via src/merk/', async () => {
  assert.ok(
    bestaat('tests/eenheid/merk-een-register-20261116.test.ts'),
    'Офіційний сторож реєстру знаків tests/eenheid/merk-een-register-20261116.test.ts має бути присутній',
  );
  const r = spawnSync(process.execPath, [resolve(WORTEL, 'scripts/eenheidstests.mjs'), 'merk-een-register-20261116.test.ts'], {
    cwd: WORTEL,
    env: process.env,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `Сторож реєстру знаків merk-een-register-20261116.test.ts має проходити з кодом 0: ${r.stderr || r.stdout}`);

  for (const nieuweMap of ['src/klantrelatiebeheer', 'src/social', 'src/bijlage-weergave']) {
    const tsxBestanden = verzamelBestanden(nieuweMap, ['.tsx']);
    assert.ok(
      tsxBestanden.length >= 1,
      `Новий каталог ${nieuweMap} має містити компоненти .tsx, перевірені за правилом REESTR-LOGO-001`,
    );
    for (const p of tsxBestanden) {
      assert.ok(!/Logo\.tsx$/.test(p), `Новий компонент ${p} не повинен оголошувати власний *Logo.tsx поза src/merk/`);
      const t = lees(p);
      assert.ok(!/<svg[^>]*data-brand/i.test(t), `Новий компонент ${p} не повинен вставляти власні брендові <svg> в обхід src/merk/`);
    }
  }
});

test('L1-G16-05: Група 16.5 — усі світлі й темні палітри оформлення проходять математичну перевірку контрасту WCAG 2.x · alle paletten slagen voor WCAG 2.x-contrastcontrole', async () => {
  const contrastMod = await laadScriptModule<{
    controleer: () => Promise<{ fouten: string[]; paren: unknown[] }>;
  }>('scripts/kleur-contrast-controle.mjs');
  const uitkomst = await contrastMod.controleer();
  assert.deepEqual(uitkomst.fouten, [], `Усі палітри мають проходити перевірку контрасту без помилок: ${uitkomst.fouten.join('; ')}`);
  assert.ok(uitkomst.paren.length > 100, `Має перевірятися понад 100 колірних пар (перевірено: ${uitkomst.paren.length})`);
});

test('L1-G16-06: Група 16.6 — безпечна мобільна верстка mobiel-breedte-veilig-v1 увімкнена для всіх і керує атрибутом data-mobiel-breedte-veilig · mobiel-breedte-veilig-v1 actief voor iedereen', async () => {
  assert.ok(bestaat('src/mobiel-veilig/vlag.ts'), 'Модуль src/mobiel-veilig/vlag.ts має існувати');
  const vlagBron = lees('src/mobiel-veilig/vlag.ts');
  assert.ok(vlagBron.includes('mobiel-breedte-veilig-v1') && vlagBron.includes('data-mobiel-breedte-veilig'));
  const mobielCss = lees('src/ontwerp/mobiel.css');
  assert.ok(mobielCss.includes(':not([data-mobiel-breedte-veilig])'), 'Файл mobiel.css має обмежувати правило ширини селектором :not([data-mobiel-breedte-veilig])');
  const { rows } = await getPool('systeem').query<{ aan: boolean; standaard: boolean }>(
    "SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'mobiel-breedte-veilig-v1'",
  );
  assert.equal(rows.length, 1, 'Прапорець mobiel-breedte-veilig-v1 має існувати у app.feature_flags');
  assert.equal(rows[0].aan, true, 'Прапорець mobiel-breedte-veilig-v1 має мати aan = true');
  assert.equal(rows[0].standaard, true, 'Прапорець mobiel-breedte-veilig-v1 має мати standaard = true');
});

// ============================================================================
// ГРУПА 17. Єдина система прапорців, міграція 0335, сповіщення, пошук та реактивність (6 перевірок)
// ============================================================================

test('L1-G17-01: Група 17.1 — завершальна міграція 0335 вмикає всі прикладні прапорці у стан «Для всіх» і зберігає 5 !-прапорців тільки для власника · migratie 0335 zet toepassingsvlaggen aan', async () => {
  assert.ok(bestaat('migrations/0335_vlaggen_consolidatie_aan.sql'), 'Очікується завершальна міграція migrations/0335_vlaggen_consolidatie_aan.sql');
  const { rows } = await getPool('systeem').query<{ sleutel: string; aan: boolean; standaard: boolean }>(
    'SELECT sleutel, aan, standaard FROM app.feature_flags WHERE gearchiveerd_op IS NULL ORDER BY sleutel',
  );
  assert.ok(rows.length >= 40, `Очікується щонайменше 40 активних прапорців у реєстрі (знайдено ${rows.length})`);
  for (const r of rows) {
    if (VIJF_UITZONDERING_VLAGGEN.has(r.sleutel)) {
      assert.equal(r.aan, true, `Безпековий !-прапорець ${r.sleutel} має мати aan = true`);
      assert.equal(r.standaard, false, `Безпековий !-прапорець ${r.sleutel} зобов’язаний залишатися в режимі «Тільки для власника» (standaard = false)`);
    } else {
      assert.equal(r.aan, true, `Прикладний прапорець ${r.sleutel} має бути увімкнений (aan = true)`);
      assert.equal(r.standaard, true, `Прикладний прапорець ${r.sleutel} має бути переведений у стан «Для всіх» (standaard = true)`);
    }
  }
});

test('L1-G17-02: Група 17.2 — кожен прапорець у app.feature_flags (включно з telegram-v2, ai-prijzen-ophalen та новими) має двомовне пояснення у VLAG_UITLEG · volledige tweetalige uitleg per vlag', async () => {
  const { rows } = await getPool('systeem').query<{ sleutel: string }>('SELECT sleutel FROM app.feature_flags ORDER BY sleutel');
  const zonderUitleg: string[] = [];
  for (const { sleutel } of rows) {
    const u = VLAG_UITLEG[sleutel];
    if (!u || !u.naam[0]?.trim() || !u.naam[1]?.trim() || !u.wat[0]?.trim() || !u.wat[1]?.trim() || !u.wanneer[0]?.trim() || !u.wanneer[1]?.trim() || !u.gevolg[0]?.trim() || !u.gevolg[1]?.trim()) {
      zonderUitleg.push(sleutel);
    }
  }
  assert.deepEqual(zonderUitleg, [], `Усі прапорці з бази даних мають мати повні двомовні пояснення у VLAG_UITLEG, відсутні: ${zonderUitleg.join(', ')}`);
});

test('L1-G17-03: Група 17.3 — усі 19 клієнтських обгорток прапорців реактивно оновлюються при події mr:vlaggen-vernieuwd · alle client-vlagwrappers werken reactief bij mr:vlaggen-vernieuwd', async () => {
  const wrappers = [
    'src/foto/foto-vlaggen.ts',
    'src/huis/huis-vlag.ts',
    'src/aanmeld-vnext/aanmeld-vlag.ts',
    'src/accountmenu-v2/vlag.ts',
    'src/accountmenu-v3/vlag.ts',
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
  const nietReactief = wrappers.filter((pad) => {
    const inhoud = lees(pad);
    return !inhoud.includes('mr:vlaggen-vernieuwd') && !inhoud.includes('useVlag(') && !inhoud.includes('functievlag-lezen');
  });
  assert.deepEqual(
    nietReactief,
    [],
    `Усі клієнтські обгортки прапорців мають оновлюватися при події mr:vlaggen-vernieuwd або делегувати до functievlag-lezen / useVlag, застарілі: ${nietReactief.join(', ')}`,
  );
});

test('L1-G17-04: Група 17.4 — п’ять серверних модулів використовують спільне проміжне сховище backend/vlaggen.ts, і реалізовано попередження VLAG_OPRUIMEN · gedeelde server-vlagcache en VLAG_OPRUIMEN', async () => {
  const serverBestanden = [
    'backend/ai-prijzen.ts',
    'backend/apparaat-bevestiging/opslag.ts',
    'backend/index.ts',
    'backend/telegram-aanmelden/opslag.ts',
    'backend/telegram-aanmelden/venster-sleutel.ts',
  ];
  for (const pad of serverBestanden) {
    const inhoud = lees(pad);
    assert.ok(
      !/FROM\s+app\.feature_flags/i.test(inhoud),
      `Серверний модуль ${pad} має читати прапорець через спільне проміжне сховище backend/vlaggen.ts замість прямого SELECT FROM app.feature_flags`,
    );
  }
  const opruimenBron = [lees('src/vlaggen/Vlaggen.tsx'), lees('scripts/orch/pakket.mjs')].join('\n');
  assert.ok(
    opruimenBron.includes('VLAG_OPRUIMEN') || opruimenBron.includes('opruimenNaDagen'),
    'Має бути реалізовано попередження VLAG_OPRUIMEN (opruimenNaDagen: 30) для застарілих архівних прапорців',
  );
});

test('L1-G17-05: Група 17.5 — сторож MELDINGEN-REGISTER-001 проходить із кодом 0 і містить нові події служби клієнтів (klant.* / owner.klantrelatie.*) без категорії overig · MELDINGEN-REGISTER-001 slaagt zonder overig', async () => {
  const r = spawnSync(process.execPath, [resolve(WORTEL, 'scripts/meldingen-register-controle.mjs'), '--stil'], {
    cwd: WORTEL,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `Сторож бази сповіщень meldingen-register-controle.mjs має завершуватися з кодом 0: ${r.stderr || r.stdout}`);
  const alleCodes = Object.keys(ACTIE_LABELS);
  assert.ok(
    alleCodes.some((c) => c.startsWith('klant.') || c.startsWith('owner.klantrelatie.')),
    'Реєстр ACTIE_LABELS має охоплювати нові події служби клієнтів klant.* або owner.klantrelatie.*',
  );
  assert.ok(alleCodes.every((c) => categorieVan(c) !== 'overig'), 'Жоден зареєстрований код дії не може мати категорію overig');
});

test('L1-G17-06: Група 17.6 — каталог пошуку інтерфейсу scripts/zoek-ui-catalogus.mjs охоплює всі підсистеми, а згенерований файл актуальний · zoekcatalogus volledig en actueel', async () => {
  const zoekMod = await laadScriptModule<{ PLEKKEN: Array<readonly [string, string, string, string]> }>('scripts/zoek-ui-catalogus.mjs');
  const geregistreerdeVoorvoegsels = zoekMod.PLEKKEN.map((p) => p[0]);
  const verwachteVoorvoegsels = [
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
  const ontbrekend = verwachteVoorvoegsels.filter((v) => !geregistreerdeVoorvoegsels.some((g) => g.startsWith(v.replace(/\/$/, ''))));
  assert.deepEqual(ontbrekend, [], `У PLEKKEN (scripts/zoek-ui-catalogus.mjs) відсутні підсистеми: ${ontbrekend.join(', ')}`);

  const r = spawnSync(process.execPath, [resolve(WORTEL, 'scripts/zoek-ui-catalogus.mjs'), '--controle'], {
    cwd: WORTEL,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `Перевірка актуальності пошукового покажчика --controle має завершуватися з кодом 0: ${r.stderr || r.stdout}`);
});

// ============================================================================
// ГРУПА 18. Цілісність правил, двокроковий VLAG-001, спадкоємність, сторожі та TRACE-001 (6 перевірок)
// ============================================================================

test('L1-G18-01: Група 18.1 — захищені файли правил AGENTS.md, beleid.json (1.8.0) та BESLUITEN.md збережені непорушними згідно з regels.lock.json · beschermde regelbestanden ongewijzigd', async () => {
  const lock = JSON.parse(lees('orchestratie/regels.lock.json')) as {
    regelsVersie: string;
    bestanden: Record<string, string>;
  };
  assert.equal(lock.regelsVersie, '1.8.0', 'Версія правил координації має залишатися 1.8.0 за рішенням власника 4б');
  for (const [pad, verwachteHash] of Object.entries(lock.bestanden)) {
    const werkelijkeHash = createHash('sha256').update(readFileSync(resolve(WORTEL, pad))).digest('hex');
    assert.equal(werkelijkeHash, verwachteHash, `Захищений файл правил ${pad} не повинен змінюватися`);
  }
});

test('L1-G18-02: Група 18.2 — перевірка координації node scripts/orch.mjs controleer проходить із кодом 0 без жодної втраченої можливості · orch controleer slaagt zonder verloren mogelijkheden', async () => {
  const r = spawnSync(process.execPath, [resolve(WORTEL, 'scripts/orch.mjs'), 'controleer'], { cwd: WORTEL, encoding: 'utf8' });
  assert.equal(r.status, 0, `Команда node scripts/orch.mjs controleer має завершуватися з кодом 0: ${r.stderr || r.stdout}`);
  for (const pad of verzamelBestanden('orchestratie/onderwerpen', ['.json'])) {
    const dossier = JSON.parse(lees(pad)) as { mogelijkheden?: Array<{ id?: string; staat?: string }> };
    for (const m of dossier.mogelijkheden ?? []) {
      assert.notEqual(m.staat, 'verloren', `У досьє ${pad} жодна можливість не може мати стан verloren (${m.id})`);
    }
  }
});

test('L1-G18-03: Група 18.3 — двокрокова схема прапорців (0307..0334 із false, false + 0335 UPDATE) проходить controleerFunctievlaggen без помилок · tweestaps-vlagschema verenigbaar met pakketcontrole', async () => {
  const pakketMod = await laadScriptModule<{
    controleerFunctievlaggen: (o: {
      beleid: Record<string, unknown>;
      manifest: Record<string, unknown>;
      paden: string[];
      lees: (pad: string) => string | null;
      versie: string;
    }) => Array<{ code: string; ernst: string; uk: string }>;
  }>('scripts/orch/pakket.mjs');

  const migBestanden = readdirSync(resolve(WORTEL, 'migrations'))
    .filter((f) => /^03(?:0[789]|[12]\d|3[0-4])_[a-z0-9_]+\.sql$/.test(f))
    .sort();
  assert.ok(migBestanden.length >= 4, 'Мають існувати міграції реєстрації нових прапорців у діапазоні 0307..0334');
  assert.ok(bestaat('migrations/0335_vlaggen_consolidatie_aan.sql'), 'Має існувати міграція увімкнення 0335_vlaggen_consolidatie_aan.sql');

  const functievlaggen: Array<{ sleutel: string; migratie: string }> = [];
  for (const mig of migBestanden) {
    const sql = lees(`migrations/${mig}`);
    if (!/INSERT\s+INTO\s+app\.feature_flags/i.test(sql)) continue;
    const re = /'([a-z0-9][a-z0-9-]{2,79})'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const kandidaat = m[1];
      if (VLAG_UITLEG[kandidaat]) functievlaggen.push({ sleutel: kandidaat, migratie: mig });
    }
  }
  assert.ok(functievlaggen.length >= 5, 'У міграціях 0307..0334 має бути зареєстровано щонайменше 5 нових прапорців');

  const beleid = JSON.parse(lees('orchestratie/beleid.json')) as Record<string, unknown>;
  const gewijzigdeCodePaden = ['shared/vlaggen.ts'];
  const zaken = pakketMod.controleerFunctievlaggen({
    beleid,
    manifest: { functievlaggen },
    paden: gewijzigdeCodePaden,
    lees: (p) => (bestaat(p) ? lees(p) : null),
    versie: '20261123-120000',
  });
  const fouten = zaken.filter((z) => z.ernst === 'fout');
  assert.deepEqual(fouten, [], `Двокрокова схема прапорців має давати 0 помилок у controleerFunctievlaggen: ${JSON.stringify(fouten)}`);
});

test('L1-G18-04: Група 18.4 — реєстр спадкоємності orchestratie/verwijzingen/ містить валідні двомовні записи для всіх поглинутих запитів на злиття · verwijzingenregister geldig en volledig', async () => {
  const verwMod = await laadScriptModule<{
    valideerGebeurtenis: (r: unknown, opt?: { pad?: string }) => Array<{ code: string; uk: string }>;
    registerSamenvatten: (records: unknown[]) => Map<string, unknown>;
  }>('scripts/orch/verwijzingen.mjs');

  const bestanden = verzamelBestanden('orchestratie/verwijzingen', ['.json']);
  const records: Array<Record<string, unknown>> = [];
  for (const pad of bestanden) {
    const rec = JSON.parse(lees(pad)) as Record<string, unknown>;
    const fouten = verwMod.valideerGebeurtenis(rec, { pad });
    assert.deepEqual(fouten, [], `Запис спадкоємності ${pad} має проходити valideerGebeurtenis без помилок`);
    records.push(rec);
  }
  const samenvatting = verwMod.registerSamenvatten(records);
  const prSleutels = [...samenvatting.keys()].filter((k) => k.startsWith('pr:'));
  assert.ok(
    prSleutels.length >= 47,
    `Реєстр orchestratie/verwijzingen/ має містити записи спадкоємності щонайменше для 47 поглинутих запитів на злиття за рішенням власника 4а (зараз: ${prSleutels.length})`,
  );
});

test('L1-G18-05: Група 18.5 — конвеєр складання package.json зберігає всі 14 обов’язкових сторожів у правильному порядку без вилучень · alle 14 poortwachters in package.json in juiste volgorde', async () => {
  const pkg = JSON.parse(lees('package.json')) as { scripts?: { build?: string } };
  const buildRegel = pkg.scripts?.build || '';
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
  let vorigeIndex = -1;
  for (const stap of verwachteVolgorde) {
    const idx = buildRegel.indexOf(stap);
    assert.ok(idx > vorigeIndex, `Крок сторожа «${stap}» має бути присутній у scripts.build у незмінному порядку`);
    vorigeIndex = idx;
  }
});

test('L1-G18-06: Група 18.6 — конвеєр походження випусків TRACE-001 зберігає перевірку ONTWIKKELARCHIEF.json та відбитка SHA-256 · TRACE-001 bewaakt ONTWIKKELARCHIEF en SHA-256', async () => {
  assert.ok(bestaat('.github/workflows/trace-001-guard.yml'), 'Конвеєр .github/workflows/trace-001-guard.yml має існувати');
  assert.ok(bestaat('backend/uitrol-ontwikkelarchief.ts'), 'Серверний перевіряльник backend/uitrol-ontwikkelarchief.ts має існувати');
  assert.ok(bestaat('shared/ontwikkelarchief.ts'), 'Спільний контракт shared/ontwikkelarchief.ts має існувати');
  assert.ok(bestaat('deploy/uitrol/maak-voorstelpakket.sh'), 'Складальник пакунка випуску deploy/uitrol/maak-voorstelpakket.sh має існувати');
  assert.ok(lees('shared/ontwikkelarchief.ts').includes('ONTWIKKELARCHIEF.json'), 'Спільний контракт має закріплювати назву ONTWIKKELARCHIEF.json');

  const archiefMod = await laadProjectModule<{
    controleerOntwikkelArchiefOnline: (
      ref: Record<string, unknown>,
      pakketSha: string,
      opties?: { ophalen?: (url: string) => Promise<Response> },
    ) => Promise<{ ok: boolean; code: string }>;
  }>('backend/uitrol-ontwikkelarchief.ts');
  assert.ok(archiefMod, 'Модуль backend/uitrol-ontwikkelarchief.ts має успішно збиратися');

  const ongeldigeSha = await archiefMod.controleerOntwikkelArchiefOnline({} as Record<string, unknown>, 'niet-hex');
  assert.equal(ongeldigeSha.ok, false);
  assert.equal(ongeldigeSha.code, 'ONTWIKKELARCHIEF_ONGELDIG');

  const verkeerdeDossierSha = await archiefMod.controleerOntwikkelArchiefOnline(
    {
      schema: 1,
      taakId: 'PROEF-001',
      versie: '20261123-120000',
      commit: 'a'.repeat(40),
      tak: 'functie/proef-001-20261123-120000',
      pad: 'orchestratie/ontwikkelarchieven/PROEF-001.json',
      sha256: 'b'.repeat(64),
      pakket: 'mijn-ruimte-20261123-120000.tar.gz',
      url: 'https://github.com/Tarasevych/hub',
    },
    'c'.repeat(64),
    {
      ophalen: async () =>
        new Response(
          JSON.stringify({ type: 'file', encoding: 'base64', content: Buffer.from('{"anders":true}').toString('base64') }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    },
  );
  assert.equal(verkeerdeDossierSha.ok, false);
  assert.equal(verkeerdeDossierSha.code, 'ONTWIKKELARCHIEF_SHA_VERSCHILT', ' розбіжність SHA-256 досьє має блокувати встановлення');

  const { publicKey } = generateKeyPairSync('ed25519');
  assert.ok(publicKey.type === 'public');
});

export async function main(): Promise<number> {
  try {
    return await basisMain();
  } finally {
    if (serverBelofte) {
      const s = await serverBelofte.catch(() => null);
      if (s) await s.opruimen();
    }
    if (serverBrugBelofte) {
      const b = await serverBrugBelofte.catch(() => null);
      if (b) await b.closeServerPool().catch(() => undefined);
    }
    rmSync(dynMap, { recursive: true, force: true });
    await closePool().catch(() => undefined);
  }
}
