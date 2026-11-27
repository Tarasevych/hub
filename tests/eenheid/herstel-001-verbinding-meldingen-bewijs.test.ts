// Комплексне модульне випробування HERSTEL-001:
// 1. Повне входження сигналів сторінок (зокрема стану зв’язку з сервером) до єдиного реєстру сповіщень і огляду без категорії 'overig'.
// 2. Накопичення хронології спроб у клієнтському сховищі доказів, очищення таємниць, збереження події зі статусом 'opgelost' після відновлення.
// 3. Синхронізація інциденту зв’язку з сервером (slaGebeurtenisOp + серверний журнал audit) та перевірка міграцій 0336/0337 за правилом VLAG-001.
// 4. Відмальовування оновленої картки стану зв’язку двома мовами (uk, nl) та мовна чистота всіх змінених файлів.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { controleerFunctievlaggen } from '../../scripts/orch/pakket.mjs';
import { ACTIE_LABELS, categorieVan } from '../../shared/beheer-journaal';
import { MELDINGEN } from '../../shared/meldingen-catalogus';
import { interpreteerGebeurtenis } from '../../shared/meldingen-ecosysteem';
import { bouwMeldingRegisterOverzicht } from '../../shared/meldingen-register-overzicht';
import { SLEUTEL_RE, VLAG_UITLEG, vlagFout } from '../../shared/vlaggen';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const lees = (pad: string) => readFileSync(resolve(pad), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('herstel-001-verbinding-meldingen-bewijs');

  // 1. Єдиний реєстр сповіщень (MELDINGEN), огляд бази та ACTIE_LABELS
  const paginaItems = MELDINGEN.filter((m) => m.kanaal === 'pagina');
  const verbindingSoorten = ['server_storing', 'netwerk_offline', 'verbinding_hersteld'] as const;
  check(
    '1a MELDINGEN містить усі сигнали сторінок (kanaal: pagina), зокрема три стани зв’язку зі схемою S15',
    paginaItems.length >= 10 &&
      verbindingSoorten.every((s) =>
        paginaItems.some((m) => m.bestand === 'src/CanoniekVerbindingBand.tsx' && m.soort === s && m.schema === 'S15'),
      ),
  );

  const actieCodes = [
    'owner.systeem.verbinding.storing',
    'owner.systeem.verbinding.offline',
    'owner.systeem.verbinding.hersteld',
  ] as const;
  check(
    '1b ACTIE_LABELS містить двомовні назви кодів доказів зв’язку у предметній категорії diagnose без overig',
    actieCodes.every((c) => {
      const paar = ACTIE_LABELS[c];
      return Boolean(paar && paar[0].length > 10 && paar[1].length > 10 && categorieVan(c) === 'diagnose');
    }),
  );

  const overzicht = bouwMeldingRegisterOverzicht();
  check(
    '1c bouwMeldingRegisterOverzicht відображає сповіщення зв’язку та коди дій із категорією diagnose, схемою S15 та 0 overig',
    overzicht.statistiek.onbekendOverig === 0 &&
      verbindingSoorten.every((s) =>
        overzicht.rijen.some((r) => r.code === s && r.herkomst === 'melding' && r.categorie === 'diagnose' && r.schemaId === 'S15'),
      ) &&
      actieCodes.every((c) =>
        overzicht.rijen.some((r) => r.code === c && r.categorie === 'diagnose' && r.schemaId === 'S15'),
      ),
  );

  // 2. Клієнтське сховище доказів зв’язку, очищення таємниць та збереження в потоці дзвіночка після відновлення
  nepBrowser('https://admin.tarasevych.com/sso', 'uk');

  const opslag = await import('../../src/platform/verbinding-bewijs-opslag');
  const ecoOpslag = await import('../../src/meldingen/ecosysteem/ecosysteem-opslag');
  opslag._wisVerbindingIncidentenVoorTest();

  const vuileTekst =
    'Authorization: Bearer geheimSleutelWaarde1234567890abcd; cookie=sid=99887766554433221100aabbccddeeff; jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const vuileRoute = 'POST /api/owner/reset/abcdef0123456789abcdef0123456789?token=geheimWaarde999&key=sleutel777';
  const schoneTekst = opslag.schoonBewijsTekst(vuileTekst);
  const schoneRoute = opslag.schoonRouteBewijs(vuileRoute);

  check(
    '2a schoonBewijsTekst та schoonRouteBewijs надійно приховують Bearer, куки, JWT, параметри ключів і довгі шістнадцяткові рядки',
    !schoneTekst.includes('geheimSleutelWaarde1234567890abcd') &&
      !schoneTekst.includes('99887766554433221100aabbccddeeff') &&
      !schoneTekst.includes('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c') &&
      !schoneRoute.includes('geheimWaarde999') &&
      !schoneRoute.includes('sleutel777') &&
      !schoneRoute.includes('abcdef0123456789abcdef0123456789') &&
      schoneRoute.startsWith('POST /api/owner/reset/[приховано]'),
  );

  const t0 = Date.UTC(2026, 10, 23, 18, 11, 28);
  const inc1 = opslag.registreerVerbindingPoging({
    soort: 'server_storing',
    dienst: 'admin',
    ruimte: 'technisch',
    status: 524,
    code: 'HTTP_524',
    route: 'POST /api/owner/bevestiging/apparaat/open?token=geheim123',
    tijd: t0,
    poging: 1,
    lichaam: '524 A Timeout Occurred · Authorization: Bearer topGeheimTokenWaarde12345',
    uitrolStand: 'onbekend',
  });
  // Повторне уточнення тієї ж спроби (коли надійшов виміряний стан розгортання) не дублює запис у pogingen
  opslag.registreerVerbindingPoging({
    soort: 'server_storing',
    dienst: 'admin',
    ruimte: 'technisch',
    status: 524,
    code: 'HTTP_524',
    route: 'POST /api/owner/bevestiging/apparaat/open',
    tijd: t0,
    poging: 1,
    uitrolStand: 'nee',
  });
  const inc2 = opslag.registreerVerbindingPoging({
    soort: 'server_storing',
    dienst: 'admin',
    ruimte: 'technisch',
    status: 524,
    code: 'HTTP_524',
    route: 'GET /api/version',
    tijd: t0 + 6_000,
    poging: 2,
    uitrolStand: 'nee',
  });

  check(
    '2b registreerVerbindingPoging групує спроби одного інциденту, не дублює одну спробу й очищує вхідні докази без псування шляху API',
    inc1.id === inc2.id &&
      inc2.pogingen.length === 2 &&
      inc2.pogingen[0].nr === 1 &&
      inc2.pogingen[0].route === 'POST /api/owner/bevestiging/apparaat/open?token=[приховано]' &&
      inc2.pogingen[1].nr === 2 &&
      inc2.uitrolStand === 'nee' &&
      !inc2.rauwVoorbeeld.includes('topGeheimTokenWaarde12345') &&
      !inc2.laatsteRoute.includes('geheim123'),
  );

  // Потік під час активного збою: подія має статус 'nieuw'
  const stroomTijdensStoring = ecoOpslag.bouwUniformeStroom({
    lang: 'uk',
    ruimte: 'technisch',
    subdomeinNu: 'admin',
    serverGebeurtenissen: [],
    paginaSignalen: [
      {
        id: 'band:verbinding',
        bron: 'verbinding-band',
        kanaal: 'pagina',
        subdomein: 'admin',
        soort: 'server_storing',
        ernst: 'kritiek',
        titelUk: 'Звʼязок сторінки з сервером — не вдалося',
        titelNl: 'Verbinding van de pagina met de server — mislukt',
        bijgewerktOp: t0 + 6_000,
        actief: true,
        acties: [{ id: 'herprobeer', labelUk: 'Повторити перевірку', labelNl: 'Opnieuw proberen', primair: true }],
      },
    ],
    serverItems: [],
    techItems: [],
    localRows: [],
    activityEvents: [],
    activityRead: new Set(),
  });

  check(
    '2c під час збою bouwUniformeStroom містить єдину об’єднану подію інциденту зі статусом nieuw без дублювання з живою смугою',
    stroomTijdensStoring.length === 1 &&
      stroomTijdensStoring[0].externeSleutel === inc2.id &&
      stroomTijdensStoring[0].status === 'nieuw' &&
      stroomTijdensStoring[0].herhalingen === 2 &&
      stroomTijdensStoring[0].bijlagen.length === 2 &&
      stroomTijdensStoring[0].acties.some((a) => a.id === 'ps:band:verbinding:herprobeer'),
  );

  // Відновлення зв’язку: жива смуга зникає (paginaSignalen = []), але подія залишається в потоці зі статусом 'opgelost' і тривалістю!
  const hersteldeLijst = opslag.markeerVerbindingHersteld(t0 + 19_000);
  const stroomNaHerstel = ecoOpslag.bouwUniformeStroom({
    lang: 'uk',
    ruimte: 'technisch',
    subdomeinNu: 'admin',
    serverGebeurtenissen: [],
    paginaSignalen: [],
    serverItems: [],
    techItems: [],
    localRows: [],
    activityEvents: [],
    activityRead: new Set(),
  });
  const gebNl = opslag.incidentNaarEcosysteemGebeurtenis(hersteldeLijst[0], 'nl', 'UTC');

  check(
    '2d після відновлення зв’язку та зникнення банера подія НЕ зникає з дзвіночка: має статус opgelost, duurMs=19000 і 2 вкладення-докази',
    hersteldeLijst.length === 1 &&
      hersteldeLijst[0].duurMs === 19_000 &&
      stroomNaHerstel.length === 1 &&
      stroomNaHerstel[0].externeSleutel === inc2.id &&
      stroomNaHerstel[0].status === 'opgelost' &&
      stroomNaHerstel[0].herhalingen === 2 &&
      stroomNaHerstel[0].titel.includes('відновлено') &&
      gebNl.titel.includes('hersteld') &&
      gebNl.status === 'opgelost' &&
      stroomNaHerstel[0].bijlagen.some((b) => b.naam === 'verbinding-chronologie.json') &&
      stroomNaHerstel[0].bijlagen.some((b) => b.naam === 'verbinding-diagnose.txt'),
  );

  // Перевірка клієнтської синхронізації на сервер (включно з безпечним збереженням у 'prive' при 403 на 'technisch')
  const verzondenVerzoeken: Array<{ url: string; data: Record<string, unknown> }> = [];
  const aantalSync1 = await opslag.synchroniseerVerbindingBewijzenNaarServer(
    'gebruiker-proef-1',
    async (url, data) => {
      const d = data as Record<string, unknown>;
      verzondenVerzoeken.push({ url, data: d });
      if (d.ruimte === 'technisch') {
        const err = new Error('TECHNISCHE_RUIMTE_VEREIST') as Error & { status: number };
        err.status = 403;
        throw err;
      }
      return { status: 200, data: { ok: true } };
    },
    'uk',
  );
  const aantalSync2 = await opslag.synchroniseerVerbindingBewijzenNaarServer(
    'gebruiker-proef-1',
    async () => ({ status: 200, data: { ok: true } }),
    'uk',
  );

  check(
    '2e synchroniseerVerbindingBewijzenNaarServer переходить на prive при 403, фіксує gesynchroniseerdOp і не дублює відправлення',
    aantalSync1 === 1 &&
      aantalSync2 === 0 &&
      verzondenVerzoeken.length === 2 &&
      verzondenVerzoeken[0].data.ruimte === 'technisch' &&
      verzondenVerzoeken[1].data.ruimte === 'prive' &&
      verzondenVerzoeken[1].data.status === 'opgelost' &&
      verzondenVerzoeken[1].data.herhalingen === 2 &&
      opslag.leesVerbindingIncidenten()[0]?.gesynchroniseerdOp !== null,
  );

  // 3. Серверна функція slaGebeurtenisOp, інтерпретатор tolk.ts та правило прапорців VLAG-001 (0336 + 0337)
  const tolkOpgelost = interpreteerGebeurtenis(
    {
      id: 'proef-opgelost',
      externeSleutel: 'verbinding-incident:admin:1',
      bron: 'verbinding-bewijs',
      kanaal: 'pagina',
      subdomein: 'admin',
      soort: 'server_storing',
      status: 'opgelost',
      herhalingen: 4,
      titel: 'Перерва зв’язку — відновлено',
      aangemaaktOp: t0,
      bijgewerktOp: t0 + 12_000,
    },
    'technisch',
  );
  check(
    '3a interpreteerGebeurtenis зберігає переданий статус opgelost, herhalingen=4 та bijgewerktOp, не ламаючи типову поведінку',
    tolkOpgelost.status === 'opgelost' &&
      tolkOpgelost.herhalingen === 4 &&
      tolkOpgelost.bijgewerktOp === t0 + 12_000 &&
      interpreteerGebeurtenis({ id: 'standaard-1', titel: 'Звичайна' }, 'prive').status === 'nieuw',
  );

  const oudeDbUrl = process.env.DATABASE_URL;
  const origConnect = pg.Pool.prototype.connect;
  const origPoolQuery = pg.Pool.prototype.query;
  const sqlLog: Array<{ sql: string; params: unknown[] }> = [];
  const auditActies: string[] = [];

  try {
    process.env.DATABASE_URL = 'postgres://proef-gebruiker:proef@127.0.0.1:5432/mijnruimte_proef';
    (pg.Pool.prototype as unknown as { connect: () => Promise<unknown> }).connect = async () => ({
      query: async (sql: string, params: unknown[] = []) => {
        sqlLog.push({ sql, params });
        if (/INSERT INTO app\.melding_ecosysteem_gebeurtenissen/i.test(sql)) {
          return {
            rows: [
              {
                id: '11111111-2222-4333-8444-555555555555',
                ruimte: params[1],
                externe_sleutel: params[2],
                kanaal: params[3],
                subdomein: params[4],
                bron: params[5],
                prioriteit: params[6],
                status: params[7],
                titel: params[8],
                bericht: params[9],
                uitleg: params[10],
                context_label: params[11],
                herhalingen: params[12],
                uitgesteld_tot: null,
                bijlagen: JSON.parse(String(params[13] || '[]')),
                acties: JSON.parse(String(params[14] || '[]')),
                meta: JSON.parse(String(params[15] || '{}')),
                ai_samenvatting: null,
                aangemaakt_op: t0,
                bijgewerkt_op: t0 + 19_000,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    });
    (pg.Pool.prototype as unknown as { query: (sql: string, params?: unknown[]) => Promise<unknown> }).query = async (
      sql: string,
      params: unknown[] = [],
    ) => {
      if (/audit_toevoegen/i.test(sql) && typeof params[2] === 'string') {
        auditActies.push(params[2]);
      }
      return {
        rows: [
          {
            id: 'audit-1',
            owner_id: 'eigenaar-1',
            actor_id: 'eigenaar-1',
            action: String(params[2] || ''),
            type: 'diagnose',
            result: String(params[4] || 'ok'),
            details: {},
            seq: 1,
            prev_hash: '',
            hash: 'abc',
            created_at: new Date().toISOString(),
          },
        ],
        rowCount: 1,
      };
    };

    const { slaGebeurtenisOp } = await import('../../backend/meldingen-ecosysteem');
    const opgeslagenDb = await slaGebeurtenisOp(
      { userId: 'eigenaar-1', ruimte: 'technisch' },
      {
        externeSleutel: inc2.id,
        bron: 'verbinding-bewijs',
        kanaal: 'pagina',
        subdomein: 'admin',
        soort: 'server_storing',
        ernst: 'waarschuwing',
        status: 'opgelost',
        herhalingen: 3,
        titel: 'Перерва зв’язку з сервером (HTTP 524 · Адміністрування) — відновлено',
        bericht: 'Доказ збережено.',
        meta: { dienst: 'admin', foutCode: 'HTTP_524', statusCode: 524, duurMs: 19_000, pogingenAantal: 3, route: 'POST /api/owner/bevestiging/apparaat/open' },
      },
    );

    const insertQuery = sqlLog.find((q) => /INSERT INTO app\.melding_ecosysteem_gebeurtenissen/i.test(q.sql));
    check(
      '3b slaGebeurtenisOp передає herhalingen>=3, статус opgelost у GREATEST/CASE та записує серверний аудит storing + hersteld',
      Boolean(insertQuery) &&
        /GREATEST\(app\.melding_ecosysteem_gebeurtenissen\.herhalingen \+ 1, EXCLUDED\.herhalingen\)/.test(insertQuery!.sql) &&
        /WHEN EXCLUDED\.status = 'opgelost' THEN 'opgelost'/.test(insertQuery!.sql) &&
        opgeslagenDb.status === 'opgelost' &&
        opgeslagenDb.herhalingen === 3 &&
        auditActies.includes('owner.systeem.verbinding.storing') &&
        auditActies.includes('owner.systeem.verbinding.hersteld'),
    );
  } finally {
    pg.Pool.prototype.connect = origConnect;
    pg.Pool.prototype.query = origPoolQuery;
    const { closePool } = await import('../../server/platform/pg');
    await closePool();
    if (oudeDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oudeDbUrl;
  }

  // Перевірка міграцій 0336 та 0337 за правилом VLAG-001
  const m0336 = lees('migrations/0336_melding_verbinding_bewijs_vlag.sql');
  const m0337 = lees('migrations/0337_melding_verbinding_bewijs_aan.sql');
  const omschrijvingMatch = /'melding-verbinding-bewijs-v1'\s*,\s*'([^']+)'/.exec(m0336);
  const omschrijvingTekst = omschrijvingMatch ? omschrijvingMatch[1] : '';
  const beleid = JSON.parse(lees('orchestratie/beleid.json'));
  const gewijzigdePaden = [
    'src/CanoniekVerbindingBand.tsx',
    'src/platform/verbinding-bewijs-opslag.ts',
    'migrations/0336_melding_verbinding_bewijs_vlag.sql',
    'migrations/0337_melding_verbinding_bewijs_aan.sql',
  ];
  const vlagZaken = controleerFunctievlaggen({
    beleid,
    manifest: { functievlaggen: [{ sleutel: 'melding-verbinding-bewijs-v1', migratie: '0336_melding_verbinding_bewijs_vlag.sql' }] },
    paden: gewijzigdePaden,
    lees: (p: string) => {
      try {
        return lees(p);
      } catch {
        return null;
      }
    },
    versie: '20261124-120000',
  });

  check(
    '3c міграції 0336 та 0337 і запис у VLAG_UITLEG повністю відповідають правилу VLAG-001 (опис <= 300 символів, 0 зауважень)',
    SLEUTEL_RE.test('melding-verbinding-bewijs-v1') &&
      omschrijvingTekst.length > 20 &&
      omschrijvingTekst.length <= 300 &&
      omschrijvingTekst.includes(' | ') &&
      vlagFout({
        sleutel: 'melding-verbinding-bewijs-v1',
        omschrijving: omschrijvingTekst,
        aan: false,
        standaard: false,
        percentage: 0,
        gebruikers: [],
      }) === null &&
      /UPDATE\s+app\.feature_flags[\s\S]*SET\s+aan\s*=\s*true\s*,\s*standaard\s*=\s*true[\s\S]*WHERE\s+sleutel\s*=\s*'melding-verbinding-bewijs-v1'/i.test(m0337) &&
      Boolean(VLAG_UITLEG['melding-verbinding-bewijs-v1']) &&
      vlagZaken.length === 0,
  );

  // 4. Відмальовування компонента CanonicalConnectionBanner та перевірка мовної чистоти
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { meldServerAntwoord } = await import('../../src/platform/nieuwe-versie');
  const { default: CanonicalConnectionBanner } = await import('../../src/CanoniekVerbindingBand');

  meldServerAntwoord(524, {
    route: 'POST /api/owner/bevestiging/apparaat/open',
    code: 'HTTP_524',
    dienst: 'admin',
    lichaam: '524 timeout',
  });
  const htmlUk = renderToStaticMarkup(createElement(CanonicalConnectionBanner, { lang: 'uk' }));
  const htmlNl = renderToStaticMarkup(createElement(CanonicalConnectionBanner, { lang: 'nl' }));
  meldServerAntwoord(200, { route: 'GET /api/version' });

  check(
    '4a CanonicalConnectionBanner відмальовує фірмову картку vp-kaart із бейджем історії, кнопкою згортання та переходом до сповіщень (uk + nl)',
    htmlUk.includes('canonical-connection-banner vp-kaart') &&
      htmlUk.includes('ПЕРЕРВА ЗВ’ЯЗКУ') &&
      htmlUk.includes('Записано в історію') &&
      htmlUk.includes('В історії') &&
      htmlUk.includes('Згорнути в компактну смугу') &&
      htmlNl.includes('VERBINDINGSONDERBREKING') &&
      htmlNl.includes('Vastgelegd in historie') &&
      htmlNl.includes('In meldingen') &&
      htmlNl.includes('Inklappen tot compacte balk'),
  );

  const gecontroleerdeBestanden = [
    'src/platform/verbinding-bewijs-opslag.ts',
    'src/CanoniekVerbindingBand.tsx',
    'src/platform/verbinding-plakkaat.css',
    'src/meldingen/ecosysteem/ecosysteem-opslag.ts',
    'shared/meldingen-ecosysteem/tolk.ts',
    'backend/meldingen-ecosysteem.ts',
    'shared/meldingen-catalogus.ts',
    'shared/beheer-journaal.ts',
    'shared/meldingen-register-overzicht.ts',
    'scripts/meldingen-zoeken.mjs',
    'migrations/0336_melding_verbinding_bewijs_vlag.sql',
    'migrations/0337_melding_verbinding_bewijs_aan.sql',
    'shared/vlaggen.ts',
  ];
  const metVerbodenLetters = gecontroleerdeBestanden.filter((p) => VERBODEN_LETTERS.test(lees(p)));
  check(
    '4b жоден змінений або створений файл не містить заборонених не-українських літер',
    metVerbodenLetters.length === 0,
    metVerbodenLetters.join(', '),
  );

  opslag._wisVerbindingIncidentenVoorTest();
  return einde();
}
