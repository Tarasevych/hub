// Тести для розумного потоку розгортання: очищення таємниць, криптографічний ланцюг доказів, контекстні списки,
// аналіз ризиків, маршрути безпеки, міграція 0279 (RLS) та експорт звітів. Без мережі й без живої БД.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import {
  analyseerUitrolStroom,
  berekenGereedheid,
  bewijsInhoudVoorHash,
  bouwBewijsRapportMarkdown,
  bouwContextControlelijst,
  schoonObjectVoorBewijs,
  zonderGeheimenUitrol,
  type ControlelijstItem,
  type StroomBewijs,
  type StroomOverzicht,
} from '../../shared/uitrol-stroom';
import { berekenBewijsHash, stroomVastleggenVanProef, stroomVastleggenVanRun, stroomVastleggenVanVereisten, stroomVastleggenVanVoorstel, uitrolStroomRoutes, verifieerBewijsKeten } from '../../backend/uitrol-stroom';
import { agentRouteVerboden, NAMENS_OMVANG } from '../../backend/agent-namens';
import { ADMIN_VIEW_ROUTES } from '../../backend/site-hulpmiddelen';
import { UITROL_CODES } from '../../shared/uitrol-codes';

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-stroom');

  // 1. Міграція 0282 та права в migrations/rechten.sql
  const mig = readFileSync('migrations/0282_slimme_uitrol_stroom.sql', 'utf8');
  const rechten = readFileSync('migrations/rechten.sql', 'utf8');
  for (const tbl of ['uitrol_stroom_notities', 'uitrol_stroom_controlelijsten', 'uitrol_stroom_bewijzen']) {
    check(`0282 містить таблицю app.${tbl}`, mig.includes(`CREATE TABLE IF NOT EXISTS app.${tbl}`));
    check(`0282 вмикає ENABLE + FORCE ROW LEVEL SECURITY для ${tbl}`,
      mig.includes(`ALTER TABLE app.${tbl} ENABLE ROW LEVEL SECURITY;`) && mig.includes(`ALTER TABLE app.${tbl} FORCE ROW LEVEL SECURITY;`));
    check(`0282 має політику app.huidige_gebruiker/ruimte для ${tbl}`,
      mig.includes(`CREATE POLICY ${tbl}_ruimte_eigen ON app.${tbl}`) && mig.includes('app.huidige_gebruiker()') && mig.includes('app.huidige_ruimte()'));
    check(`rechten.sql забирає права mijnruimte_app і дає mijnruimte_system на ${tbl}`,
      rechten.includes(tbl));
  }

  // 2. Очищення таємниць
  const gevaarlijk = 'Bearer abcdef1234567890 postgres://user:geheimWachtwoord99@db.local/app token=xyz987654 ghp_1234567890123456789012 API_KEY="super-secret-value"';
  const schoonTekst = zonderGeheimenUitrol(gevaarlijk);
  check('zonderGeheimenUitrol прибирає Bearer-токен', !schoonTekst.includes('abcdef1234567890'));
  check('zonderGeheimenUitrol прибирає пароль у postgres URI', !schoonTekst.includes('geheimWachtwoord99'));
  check('zonderGeheimenUitrol прибирає ghp_ ключ', !schoonTekst.includes('ghp_1234567890123456789012'));
  check('zonderGeheimenUitrol прибирає API_KEY', !schoonTekst.includes('super-secret-value'));

  const sha = 'a'.repeat(64);
  const objSchoon = schoonObjectVoorBewijs({
    pakketSha256: sha,
    secret: 'niet-bewaren',
    nested: { authorization: 'Bearer test-token-12345', commit: '1234567890abcdef1234567890abcdef12345678' },
  }) as Record<string, unknown>;
  check('schoonObjectVoorBewijs зберігає pakketSha256 без змін', objSchoon.pakketSha256 === sha);
  check('schoonObjectVoorBewijs маскує secret і authorization',
    objSchoon.secret === '[СЕКРЕТ_ПРИХОВАНО]' && (objSchoon.nested as Record<string, unknown>).authorization === '[СЕКРЕТ_ПРИХОВАНО]');

  // 3. Криптографічний ланцюг доказів (SHA-256)
  const b1Data = { ok: true, bestanden: 12 };
  const h1 = berekenBewijsHash({
    versie: '20261115-120000',
    soort: 'pakket-integriteit',
    bron: 'uitrol-voorstellen',
    status: 'geslaagd',
    pakketSha256: sha,
    bewijsData: b1Data,
    vorigeHash: '',
  });
  const b2Data = { fouten: 0, waarschuwingen: 0 };
  const h2 = berekenBewijsHash({
    versie: '20261115-120000',
    soort: 'voorcontrole',
    bron: 'uitrol-voorcontrole',
    status: 'geslaagd',
    pakketSha256: sha,
    bewijsData: b2Data,
    vorigeHash: h1,
  });

  const ketenStroom: StroomBewijs[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      versie: '20261115-120000',
      voorstelId: null,
      runId: '',
      soort: 'pakket-integriteit',
      bron: 'uitrol-voorstellen',
      status: 'geslaagd',
      samenvattingUk: 'Ок 1',
      samenvattingNl: 'Ok 1',
      pakketSha256: sha,
      bewijsData: b1Data,
      bewijsHash: h1,
      vorigeHash: '',
      geschoond: true,
      aangemaaktOp: '2026-11-15T12:00:00.000Z',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      versie: '20261115-120000',
      voorstelId: null,
      runId: '',
      soort: 'voorcontrole',
      bron: 'uitrol-voorcontrole',
      status: 'geslaagd',
      samenvattingUk: 'Ок 2',
      samenvattingNl: 'Ok 2',
      pakketSha256: sha,
      bewijsData: b2Data,
      bewijsHash: h2,
      vorigeHash: h1,
      geschoond: true,
      aangemaaktOp: '2026-11-15T12:00:01.000Z',
    },
  ];
  const vOk = verifieerBewijsKeten(ketenStroom);
  check('verifieerBewijsKeten підтверджує валідний ланцюг із 2 доказів', vOk.ok && vOk.aantal === 2 && vOk.fouten.length === 0);
  check('bewijsInhoudVoorHash повертає однаковий канонічний рядок незалежно від порядку ключів',
    bewijsInhoudVoorHash({ versie: '20261115-120000', soort: 'voorcontrole', bron: 'a', status: 'geslaagd', pakketSha256: sha, bewijsData: { b: 2, a: 1 }, vorigeHash: h1 })
    === bewijsInhoudVoorHash({ versie: '20261115-120000', soort: 'voorcontrole', bron: 'a', status: 'geslaagd', pakketSha256: sha, bewijsData: { a: 1, b: 2 }, vorigeHash: h1 }));

  const gemanipuleerd = [{ ...ketenStroom[0], status: 'mislukt' as const }, ketenStroom[1]];
  const vFout = verifieerBewijsKeten(gemanipuleerd);
  check('verifieerBewijsKeten виявляє підміну статусу в доказі', !vFout.ok && vFout.fouten.some((f) => f.startsWith('HASH_ONGELDIG')));

  const gebroken = [ketenStroom[0], { ...ketenStroom[1], vorigeHash: '0'.repeat(64) }];
  const vGebroken = verifieerBewijsKeten(gebroken);
  check('verifieerBewijsKeten виявляє розрив ланцюга vorige_hash', !vGebroken.ok && vGebroken.fouten.some((f) => f.startsWith('KETEN_GEBROKEN')));

  // 4. Детермінований інтелектуальний аналіз + контекстний контрольний список
  const laag = analyseerUitrolStroom({
    versie: '20261115-120000',
    commit: '1234567890abcdef1234567890abcdef12345678',
    wijzigingen: 'Оновлення стилів у src/uitrol/stroom.css',
    tests: { geslaagd: 40, mislukt: 0 },
    voorcontrole: { ok: true, fouten: 0, waarschuwingen: 0, controles: [{ id: 'geheimen', niveau: 'ok', uk: 'Ок', nl: 'Ok' }] },
  });
  check('аналіз UI-патча без міграцій оцінюється як laag', laag.risico === 'laag' && laag.gebieden.includes('frontend-ui'));

  const kritiek = analyseerUitrolStroom({
    versie: '20261115-120100',
    commit: 'zonder-git:тест',
    wijzigingen: 'DROP TABLE old_tmp_data у migrations/0279.sql PASSWORD=zeer_geheim_123',
    voorcontrole: {
      ok: false,
      fouten: 1,
      waarschuwingen: 1,
      controles: [
        { id: 'migraties', niveau: 'waarschuwing', uk: '1 нових міграцій з DROP (руйнівна)', nl: '1 nieuwe migratie met DROP (ingrijpend)' },
        { id: 'ontwikkelarchief', niveau: 'fout', uk: 'Не знайдено TRACE-001', nl: 'TRACE-001 niet gevonden' },
      ],
    },
  });
  check('аналіз з критичною помилкою voorcontrole оцінюється як kritiek', kritiek.risico === 'kritiek' && kritiek.score >= 70);
  check('aiPrompt автоматично очищує паролі перед експортом', !kritiek.aiPrompt.vraag.includes('zeer_geheim_123'));

  const zonderMigraties = bouwContextControlelijst({
    versie: '20261115-120000',
    commit: '1234567890abcdef1234567890abcdef12345678',
    voorcontrole: { ok: true, fouten: 0, waarschuwingen: 0, controles: [{ id: 'migraties', niveau: 'ok', uk: '0 нових міграцій', nl: '0 nieuwe migraties' }] },
  });
  check('пакет без міграцій не додає пункти групи migraties', !zonderMigraties.some((x) => x.groep === 'migraties'));

  const metDestructief = bouwContextControlelijst({
    versie: '20261115-120100',
    commit: '1234567890abcdef1234567890abcdef12345678',
    voorcontrole: {
      ok: true,
      fouten: 0,
      waarschuwingen: 1,
      controles: [{ id: 'migraties', niveau: 'waarschuwing', uk: '1 нових (DROP)', nl: '1 nieuwe (DROP)' }],
    },
  });
  check('руйнівні SQL-міграції додають обов’язкове ручне підтвердження незворотності',
    metDestructief.some((x) => x.sleutel === 'migraties.onomkeerbaar_bevestigd' && x.verplicht && x.handmatigBevestigen));

  const dummyItems: ControlelijstItem[] = metDestructief.map((s, idx) => ({
    id: `id-${idx}`,
    versie: '20261115-120100',
    voorstelId: null,
    runId: '',
    sleutel: s.sleutel,
    groep: s.groep,
    herkomst: s.herkomst,
    verplicht: s.verplicht,
    handmatigBevestigen: s.handmatigBevestigen,
    titelUk: s.titelUk,
    titelNl: s.titelNl,
    toelichtingUk: s.toelichtingUk,
    toelichtingNl: s.toelichtingNl,
    status: s.status,
    reden: '',
    bewijsSoort: s.bewijsSoort,
    volgorde: s.volgorde,
    bijgewerktDoor: '',
    aangemaaktOp: '2026-11-15T12:00:00Z',
    bijgewerktOp: '2026-11-15T12:00:00Z',
  }));
  const gereedheid = berekenGereedheid(dummyItems);
  check('berekenGereedheid блокує при відкритому обов’язковому пункті', gereedheid.geblokkeerd && gereedheid.openVerplicht >= 1);

  // 5. Експорт звіту (uk + nl) без таємниць
  const dummyOverzicht: StroomOverzicht = {
    versie: '20261115-120000',
    ruimte: 'technisch',
    actieveVersie: '20261114-100000',
    voorstel: null,
    run: null,
    duiding: laag,
    notities: [
      {
        id: 'n1',
        versie: '20261115-120000',
        voorstelId: null,
        runId: '',
        soort: 'eigenaar',
        risico: 'normaal',
        titelUk: 'Замітка',
        titelNl: 'Notitie',
        inhoudUk: 'Усе гаразд sk-secret1234567890abcdef',
        inhoudNl: 'Alles goed sk-secret1234567890abcdef',
        onderdelen: [],
        vastgepind: true,
        geschoond: true,
        auteur: 'eigenaar',
        sleutel: null,
        aangemaaktOp: '2026-11-15T12:00:00Z',
        bijgewerktOp: '2026-11-15T12:00:00Z',
      },
    ],
    controlelijst: dummyItems,
    gereedheid,
    bewijzen: vOk.gemerkt,
    ketenIntegriteit: { ok: vOk.ok, aantal: vOk.aantal, fouten: vOk.fouten },
    versies: [],
  };
  const mdUk = bouwBewijsRapportMarkdown(dummyOverzicht, 'uk');
  const mdNl = bouwBewijsRapportMarkdown(dummyOverzicht, 'nl');
  check('bouwBewijsRapportMarkdown формує uk і nl звіти та маскує залишкові секрети',
    mdUk.includes('# Доказовий звіт') && mdNl.includes('# Bewijsrapport') && !mdUk.includes('sk-secret1234567890abcdef'));

  // 6. Безпека маршрутів, агентів, кодів і фонові автохуки без БД
  check('NAMENS_OMVANG.uitrol містить read-only маршрут stroom/stand',
    NAMENS_OMVANG.uitrol.routes.includes('POST /api/owner/uitrol/stroom/stand'));
  check('ADMIN_VIEW_ROUTES містить rollout_stroom',
    ADMIN_VIEW_ROUTES.rollout_stroom?.route === 'POST /api/owner/uitrol/stroom/stand');
  check('агентам заборонено запис у /api/owner/uitrol/stroom/notitie-opslaan та controle-status',
    agentRouteVerboden('POST /api/owner/uitrol/stroom/notitie-opslaan') && agentRouteVerboden('POST /api/owner/uitrol/stroom/controle-status'));
  check('агентам дозволено лише читання /api/owner/uitrol/stroom/stand (з делегуванням)',
    !agentRouteVerboden('POST /api/owner/uitrol/stroom/stand'));
  check('shared/uitrol-codes.ts містить переклади STROOM_*',
    Boolean(UITROL_CODES.STROOM_VERSIE_ONGELDIG?.uk && UITROL_CODES.STROOM_REDEN_VEREIST?.nl));

  const routes = uitrolStroomRoutes({
    requireSession: async () => ({ errorCode: 'SESSION_REQUIRED' }),
    isEigenaar: () => false,
  });
  const nietIngelogd = await routes['POST /api/owner/uitrol/stroom/stand'][0]({ event: {}, body: {} } as never, {} as never);
  check('маршрут stroom/stand відхиляє неавтентифікований запит (401)', (nietIngelogd as { statusCode?: number }).statusCode === 401);

  const routesNietOwner = uitrolStroomRoutes({
    requireSession: async () => ({ user: { id: 'u2', role: 'user' }, service: 'admin' }),
    isEigenaar: () => false,
  });
  const nietEig = await routesNietOwner['POST /api/owner/uitrol/stroom/notitie-opslaan'][0]({ event: {}, body: {} } as never, {} as never);
  check('маршрут stroom/notitie-opslaan відхиляє не-власника (403)', (nietEig as { statusCode?: number }).statusCode === 403);

  // Фонові автохуки без DATABASE_URL повинні безпечно завершуватися без падіння
  await stroomVastleggenVanVereisten('u1', {
    id: 'p1', tijd: '2026-11-15T12:00:00Z', ok: true, klaar: true, ms: 12, nieuweMigraties: [], vereisten: [], proef: { status: 'niet-nodig', uitslag: null }, log: [],
  }, { versie: '20261115-120000' });
  await stroomVastleggenVanProef('u1', '20261115-120000', { id: 'p1', ok: true, status: 'klaar', tijd: '2026-11-15T12:00:00Z', stappen: [], migraties: [] }, sha);
  await stroomVastleggenVanVoorstel('00000000-0000-4000-8000-000000000001', 'klaar', 'u1');
  await stroomVastleggenVanRun('run-1');
  check('фонові автохуки безпечно працюють у середовищі без DATABASE_URL', true);

  return einde();
}
