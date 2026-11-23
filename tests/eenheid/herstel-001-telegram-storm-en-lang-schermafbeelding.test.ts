// Комплексне модульне та інтеграційне випробування HERSTEL-001 (Частина А + Частина Б):
// 1. Повна відсутність тривожних чи відновлювальних сповіщень після короткочасних збоїв Telegram ('tijdelijk' < 10 хв).
// 2. Спрацьовування спокійного сповіщення про відновлення лише після підтверджених збоїв 'lang' або 'vast' + закриття попередніх карток збою.
// 3. Згортання повторюваних дочірніх служб у PulsOorzaakKetenKaart та bundelOorzaakKetens в один чип із лічильником «×N» без дублів підряд.
// 4. Адитивність, безпечність та ідемпотентність міграції 0338_telegram_alarm_storm_opruimen.sql без вилучення історії.
// 5. Наявність мобільного режиму довгих знімків екрана (data-mel-mobiel-langscroll="1") та інтерактивного повзунка mel-scroll-schuif.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { registreerMelder } from '../../backend/melder';
import { LANG_NA_MS, controleNu, statusMeldingBesluit, volgendeStand } from '../../backend/telegram-aanmelden/status';
import { ACTIE_LABELS, categorieVan } from '../../shared/beheer-journaal';
import { MELDINGEN } from '../../shared/meldingen-catalogus';
import {
  normaliseerGebeurtenis,
  standaardProfiel,
  type MeldingEcosysteemGebeurtenis,
} from '../../shared/meldingen-ecosysteem';
import {
  bundelOorzaakKetens,
  groepeerOorzaakGevolgen,
  verrijkGebeurtenisVoorPuls,
  type OorzaakGevolgDienst,
} from '../../shared/meldingen-puls';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const lees = (pad: string) => readFileSync(resolve(pad), 'utf8');

function maakGeb(
  id: string,
  velden: Partial<MeldingEcosysteemGebeurtenis> & { titel: string },
): MeldingEcosysteemGebeurtenis {
  const nu = 1_763_920_000_000;
  return normaliseerGebeurtenis(
    {
      id,
      externeSleutel: velden.externeSleutel ?? `ext:${id}`,
      ruimte: velden.ruimte ?? 'technisch',
      kanaal: velden.kanaal ?? 'beveiliging',
      subdomein: velden.subdomein ?? 'admin',
      bron: velden.bron ?? 'security',
      prioriteit: velden.prioriteit ?? 'hoog',
      status: velden.status ?? 'nieuw',
      titel: velden.titel,
      bericht: velden.bericht ?? '',
      uitleg: velden.uitleg ?? '',
      contextLabel: velden.contextLabel ?? '',
      herhalingen: velden.herhalingen ?? 1,
      bijlagen: velden.bijlagen ?? [],
      acties: velden.acties ?? [],
      meta: velden.meta ?? {},
      aangemaaktOp: velden.aangemaaktOp ?? nu - 60_000,
      bijgewerktOp: velden.bijgewerktOp ?? nu,
    },
    velden.ruimte ?? 'technisch',
  )!;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('herstel-001-telegram-storm-en-lang-schermafbeelding');

  // ── 1. Чисті правила стану Telegram: жодної лавини після короткого 'tijdelijk' ──────────────────────────────────────
  const beginStand = { stand: 'werkt' as const, soort: '' as const, sinds: 1_000 };
  const kortStoring = volgendeStand(beginStand, { ok: false, duurMs: 120, fout: 'tijdelijk' }, 2_000);
  const kortHersteld = volgendeStand(kortStoring, { ok: true, duurMs: 85 }, 62_000);
  const kortTraagHersteld = volgendeStand(kortStoring, { ok: true, duurMs: 4_200 }, 62_000);

  check(
    '1a короткий тимчасовий збій (< 10 хв) та його відновлення за хвилину дають рішення geen (0 тривог і 0 карток відновлення)',
    kortStoring.stand === 'storing' &&
      kortStoring.soort === 'tijdelijk' &&
      statusMeldingBesluit(beginStand, kortStoring) === 'geen' &&
      kortHersteld.stand === 'werkt' &&
      statusMeldingBesluit(kortStoring, kortHersteld) === 'geen' &&
      kortTraagHersteld.stand === 'traag' &&
      statusMeldingBesluit(kortStoring, kortTraagHersteld) === 'geen',
  );

  // Імітуємо 211 коротких однохвилинних гиків мережі кожні ~8 хвилин (як у випадку власника):
  let tellerMeldingen = 0;
  let lopend = beginStand;
  let tSim = 10_000;
  for (let i = 0; i < 211; i += 1) {
    const hik = volgendeStand(lopend, { ok: false, duurMs: 500, fout: 'tijdelijk' }, tSim);
    if (statusMeldingBesluit(lopend, hik) !== 'geen') tellerMeldingen += 1;
    tSim += 60_000; // через 1 хвилину getMe знову відповідає успішно
    const weerOk = volgendeStand(hik, { ok: true, duurMs: 90 }, tSim);
    if (statusMeldingBesluit(hik, weerOk) !== 'geen') tellerMeldingen += 1;
    lopend = weerOk;
    tSim += 7 * 60_000; // ще 7 хвилин штатної роботи
  }
  check('1b серія з 211 коротких мережевих гиків кожні ~8 хвилин породжує рівно 0 сповіщень', tellerMeldingen === 0);

  // ── 2. Справжнє відновлення лише після 'lang' або 'vast' + реєстр сповіщень ────────────────────────────────────────
  const langStoring = volgendeStand(kortStoring, { ok: false, duurMs: 300, fout: 'tijdelijk' }, 2_000 + LANG_NA_MS);
  const naLangHersteld = volgendeStand(langStoring, { ok: true, duurMs: 110 }, 2_000 + LANG_NA_MS + 60_000);
  const naLangUitgezet = volgendeStand(langStoring, { ok: false, duurMs: 0, fout: 'geen-sleutel' }, 2_000 + LANG_NA_MS + 60_000);
  const vastStoring = volgendeStand(beginStand, { ok: false, duurMs: 90, fout: 'vast' }, 5_000);
  const naVastHersteld = volgendeStand(vastStoring, { ok: true, duurMs: 95 }, 95_000);

  check(
    '2a тривога виникає при переході у lang або vast, а відновлення — виключно після lang або vast (і не при geen-sleutel)',
    statusMeldingBesluit(kortStoring, langStoring) === 'alarm-lang' &&
      statusMeldingBesluit(langStoring, langStoring) === 'geen' &&
      statusMeldingBesluit(langStoring, naLangHersteld) === 'hersteld' &&
      statusMeldingBesluit(langStoring, naLangUitgezet) === 'geen' &&
      statusMeldingBesluit(beginStand, vastStoring) === 'alarm-vast' &&
      statusMeldingBesluit(vastStoring, naVastHersteld) === 'hersteld',
  );

  check(
    '2b каталог MELDINGEN та ACTIE_LABELS містять спокійне відновлення Telegram зі схемою S15, рівнем gewoon та без категорії overig',
    MELDINGEN.some(
      (m) =>
        m.id === 'bel.telegram-aanmelden-meldingen.security.hersteld' &&
        m.bestand === 'backend/telegram-aanmelden/meldingen.ts' &&
        m.niveau === 'gewoon' &&
        m.schema === 'S15',
    ) &&
      ['telegram.status.hersteld', 'telegram.alarm.status-lang', 'telegram.alarm.status-vast', 'telegram.alarm.status-hersteld'].every(
        (code) => Boolean(ACTIE_LABELS[code]?.[0] && ACTIE_LABELS[code]?.[1]) && categorieVan(code) === 'toegang',
      ),
  );

  const herstelKaart = maakGeb('tg-hersteld-1', {
    titel: '✅ Telegram: зв’язок відновлено / verbinding hersteld',
    bericht: 'Вхід через Telegram знову працює. / Aanmelden met Telegram werkt weer.',
  });
  const verrijktHerstel = verrijkGebeurtenisVoorPuls(herstelKaart, 'uk');
  const ketenMetHerstel = bundelOorzaakKetens(
    [
      herstelKaart,
      maakGeb('tg-hersteld-2', {
        subdomein: 'id',
        titel: '🚨 Telegram: тривога безпеки / beveiligingsalarm',
        bericht: 'Вхід через Telegram знову працює.',
      }),
    ],
    'uk',
  );
  check(
    '2c картка відновлення зв’язку має спокійний рівень gewoon і ніколи не затягується в граф активних збоїв першопричини',
    verrijktHerstel.niveau === 'gewoon' &&
      verrijktHerstel.schemaId === 'S15' &&
      ketenMetHerstel.every((e) => e.soort === 'los'),
  );

  // ── 3. Групування повторюваних служб у PulsOorzaakKetenKaart (78 × Адміністрування + 5 × Обліковий запис і ключі) ───
  const veelStoringen: MeldingEcosysteemGebeurtenis[] = [];
  for (let i = 0; i < 78; i += 1) {
    veelStoringen.push(
      maakGeb(`tg-adm-${i}`, {
        kanaal: 'systeem',
        subdomein: 'admin',
        prioriteit: 'hoog',
        titel: 'Вхід через Telegram тимчасово недоступний (помилка шлюзу)',
        bericht: 'Вхід через Telegram не працює вже понад 10 хвилин.',
        aangemaaktOp: 1_000 + i * 100,
      }),
    );
  }
  for (let i = 0; i < 5; i += 1) {
    veelStoringen.push(
      maakGeb(`tg-id-${i}`, {
        kanaal: 'beveiliging',
        subdomein: 'id',
        prioriteit: 'kritiek',
        titel: 'Потрібна перевірка ключа бота Telegram у розділі входу',
        bericht: 'Вхід через Telegram не працює: перевірте ключ.',
        aangemaaktOp: 500 + i * 100,
      }),
    );
  }

  const gebundeld83 = bundelOorzaakKetens(veelStoringen, 'uk');
  const keten83 = gebundeld83.find((x) => x.soort === 'keten');
  check(
    '3a 83 події двох служб склеюються в 1 ланцюжок із 83 подіями всередині, але лише 2 компактними чипами (×78 та ×5)',
    gebundeld83.length === 1 &&
      keten83?.soort === 'keten' &&
      keten83.keten.alleIds.length === 83 &&
      keten83.keten.gevolgen.length === 2 &&
      keten83.keten.gevolgen.some((g) => g.label === 'Обліковий запис і ключі · ×5' && g.aantal === 5) &&
      keten83.keten.gevolgen.some((g) => g.label === 'Адміністрування · ×78' && g.aantal === 78),
  );

  // Навіть якщо в PulsOorzaakKetenKaart передати 15 незгрупованих чипів підряд, компонент сам їх згортає
  const ruwe15: OorzaakGevolgDienst[] = Array.from({ length: 15 }, (_, idx) => ({
    id: `ruw-${idx}`,
    gebeurtenisId: `g-${idx}`,
    label: 'Адміністрування',
    merkSleutel: 'telegram',
    icoon: 'schild-ok',
    toon: 'beveiliging',
    herstelTekst: 'Відновиться одразу після дії',
  }));
  const gegroepeerd15 = groepeerOorzaakGevolgen(ruwe15);
  check(
    '3b groepeerOorzaakGevolgen згортає 15 однакових чипів поспіль в 1 рядок «Адміністрування · ×15»',
    gegroepeerd15.length === 1 && gegroepeerd15[0].label === 'Адміністрування · ×15' && gegroepeerd15[0].aantal === 15,
  );

  nepBrowser('https://admin.tarasevych.com/sso', 'uk');
  const { default: PulsOorzaakKetenKaart } = await import('../../src/meldingen/puls/PulsOorzaakKetenKaart');
  const { default: MeldingenPortaal } = await import('../../src/meldingen/ecosysteem/MeldingenPortaal');

  if (keten83?.soort === 'keten') {
    const ketenHtml = renderToStaticMarkup(
      createElement(PulsOorzaakKetenKaart, {
        lang: 'uk',
        keten: { ...keten83.keten, gevolgen: ruwe15 },
        onSelect: () => undefined,
        onHerstelKeten: () => undefined,
        renderLosseKaart: () => null,
        alleGebeurtenissenMap: new Map(),
      }),
    );
    const aantalChipsInHtml = (ketenHtml.match(/class="puls-dienst-chip/g) || []).length;
    check(
      '3c відмальований HTML PulsOorzaakKetenKaart містить рівно 1 згрупований чип «Адміністрування · ×15» замість 15 дублів',
      aantalChipsInHtml === 1 &&
        ketenHtml.includes('Адміністрування · ×15') &&
        ketenHtml.includes('— Відновиться одразу після дії'),
    );
  }

  // ── 4. Міграція 0338 та жива перевірка переходів у PostgreSQL ───────────────────────────────────────────────────────
  const mig0338 = lees('migrations/0338_telegram_alarm_storm_opruimen.sql');
  check(
    '4a міграція 0338 є чисто адитивною (без вилучення рядків), оновлює site_notifications і melding_ecosysteem_gebeurtenissen',
    !/\b(DELETE|DROP|TRUNCATE)\b/i.test(mig0338) &&
      !VERBODEN_LETTERS.test(mig0338) &&
      mig0338.includes("tbl = 'site_notifications'") &&
      mig0338.includes("jsonb_set(data, '{read}', 'true'::jsonb") &&
      mig0338.includes('UPDATE app.melding_ecosysteem_gebeurtenissen') &&
      mig0338.includes("SET status = 'opgelost'") &&
      mig0338.includes('Вхід через Telegram знову працює') &&
      mig0338.includes('Aanmelden met Telegram werkt weer'),
  );

  if (process.env.DATABASE_URL) {
    const { closePool, getPool } = await import('../../server/platform/pg');
    const sleutels = await import('../../backend/telegram-aanmelden/sleutels');
    const opslag = await import('../../backend/telegram-aanmelden/opslag');
    const pool = getPool('systeem');
    const migPool = getPool('migratie');

    const testUserId = `herstel001-u-${randomUUID()}`;
    const nepStormNotifId1 = `herstel001-sn-1-${randomUUID()}`;
    const nepStormNotifId2 = `herstel001-sn-2-${randomUUID()}`;
    const echtOngelezenNotifId = `herstel001-sn-echt-${randomUUID()}`;
    const nepStormEcoId = randomUUID();
    const echtActiefEcoId = randomUUID();
    const tgStoringNotifId = `herstel001-tg-storing-${randomUUID()}`;
    const tgStoringEcoId = randomUUID();

    let eigenaarId = testUserId;
    let eigenaarTijdelijk = false;
    const vorigTgStatus = (await pool.query("SELECT stand, soort, oorzaak, sinds, reeks FROM app.tg_status WHERE methode = 'telegram'")).rows[0];

    let nepTgAntwoord: 'ok' | 'tijdelijk-502' | 'vast-401' = 'ok';
    const nepServer = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      if (nepTgAntwoord === 'ok') {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, result: { id: 123456789, is_bot: true, username: 'MijnRuimte_Bot', first_name: 'Мій простір' } }));
      } else if (nepTgAntwoord === 'tijdelijk-502') {
        res.statusCode = 502;
        res.end(JSON.stringify({ ok: false, error_code: 502, description: 'Bad Gateway' }));
      } else {
        res.statusCode = 401;
        res.end(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }));
      }
    });
    await new Promise<void>((ok) => nepServer.listen(0, '127.0.0.1', () => ok()));
    const poort = (nepServer.address() as { port: number }).port;
    const oudApiBasis = process.env.TELEGRAM_API_BASIS;
    process.env.TELEGRAM_API_BASIS = `http://127.0.0.1:${poort}`;

    const opgevangenMeldingen: Array<{ userId: string; kind: string; title: string; message: string }> = [];
    registreerMelder(async (userId, _email, kind, title, message) => {
      opgevangenMeldingen.push({ userId, kind, title, message });
    });

    try {
      const bestaandEigenaar = (await pool.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1")).rows[0];
      if (bestaandEigenaar?.id) {
        eigenaarId = String(bestaandEigenaar.id);
      } else {
        eigenaarTijdelijk = true;
        await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)', [
          'users',
          eigenaarId,
          JSON.stringify({ email: `eig-${eigenaarId.slice(0, 8)}@eenheid.test`, role: 'owner', status: 'approved' }),
        ]);
      }

      // Перевірка міграції 0338 на справжній таблиці PostgreSQL + ідемпотентність
      await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb), ($1, $4, $5::jsonb), ($1, $6, $7::jsonb)', [
        'site_notifications',
        nepStormNotifId1,
        JSON.stringify({
          recipientUserId: testUserId,
          kind: 'security',
          title: '🚨 Telegram: тривога безпеки / beveiligingsalarm',
          message: 'Вхід через Telegram знову працює. / Aanmelden met Telegram werkt weer.',
          read: false,
          createdAt: Date.now() - 500_000,
        }),
        nepStormNotifId2,
        JSON.stringify({
          recipientUserId: testUserId,
          kind: 'security',
          title: '🚨 Telegram: beveiligingsalarm',
          message: 'Aanmelden met Telegram werkt weer.',
          read: false,
          createdAt: Date.now() - 200_000,
        }),
        echtOngelezenNotifId,
        JSON.stringify({
          recipientUserId: testUserId,
          kind: 'security',
          title: 'Новий вхід на новому пристрої',
          message: 'Перевірте сеанс облікового запису.',
          read: false,
          createdAt: Date.now() - 100_000,
        }),
      ]);

      await pool.query(
        `INSERT INTO app.melding_ecosysteem_gebeurtenissen
          (id, user_id, ruimte, externe_sleutel, kanaal, subdomein, bron, prioriteit, status, titel, bericht)
         VALUES
          ($1::uuid, $2, 'technisch', $3, 'beveiliging', 'admin', 'security', 'hoog', 'nieuw', '🚨 Telegram: тривога безпеки', 'Вхід через Telegram знову працює. / Aanmelden met Telegram werkt weer.'),
          ($4::uuid, $2, 'technisch', $5, 'beveiliging', 'id', 'security', 'kritiek', 'nieuw', 'Новий пристрій', 'Підтвердьте вхід у систему.')`,
        [nepStormEcoId, testUserId, `ext:${nepStormEcoId}`, echtActiefEcoId, `ext:${echtActiefEcoId}`],
      );

      await migPool.query(mig0338);
      await migPool.query(mig0338); // повторний запуск для перевірки ідемпотентності

      const naNotifs = (
        await pool.query<{ id: string; gelezen: boolean }>(
          `SELECT id, (data->>'read')::boolean AS gelezen
             FROM app.records
            WHERE tbl = 'site_notifications' AND id = ANY($1)`,
          [[nepStormNotifId1, nepStormNotifId2, echtOngelezenNotifId]],
        )
      ).rows;
      const naEco = (
        await pool.query<{ id: string; status: string }>(
          `SELECT id::text AS id, status
             FROM app.melding_ecosysteem_gebeurtenissen
            WHERE id = ANY($1::uuid[])`,
          [[nepStormEcoId, echtActiefEcoId]],
        )
      ).rows;

      check(
        '4b міграція 0338 переводить усі накопичені хибні картки «знову працює» у read=true / opgelost, зберігаючи їх в історії й не чіпаючи інші події',
        naNotifs.length === 3 &&
          naNotifs.find((r) => r.id === nepStormNotifId1)?.gelezen === true &&
          naNotifs.find((r) => r.id === nepStormNotifId2)?.gelezen === true &&
          naNotifs.find((r) => r.id === echtOngelezenNotifId)?.gelezen === false &&
          naEco.length === 2 &&
          naEco.find((r) => r.id === nepStormEcoId)?.status === 'opgelost' &&
          naEco.find((r) => r.id === echtActiefEcoId)?.status === 'nieuw',
      );

      // Живий прогін controleNu(): 1) короткий збій 502 → відновлення 200 (0 карток); 2) стійкий збій 401 → відновлення 200 (закриває стару тривогу і шле спокійне ✅)
      sleutels.zetKluisVoorTest({
        lees: async () => '',
        leesIntegratie: async () => ({ waarde: '123456789:AAEproefsleutelproefsleutel000000000', naam: 'telegram-bot-token' }),
        bewaar: async () => undefined,
        wis: async () => undefined,
        eigenaar: async () => eigenaarId,
      });
      opslag.instellingenCacheWissen();

      await pool.query(
        `INSERT INTO app.tg_status (methode, stand, soort, oorzaak, sinds, laatste_controle, reeks)
         VALUES ('telegram', 'werkt', '', '', now(), now(), '[]'::jsonb)
         ON CONFLICT (methode) DO UPDATE SET stand = 'werkt', soort = '', oorzaak = '', sinds = now(), laatste_controle = now()`,
      );
      opgevangenMeldingen.length = 0;

      nepTgAntwoord = 'tijdelijk-502';
      const uitHik = await controleNu();
      nepTgAntwoord = 'ok';
      const uitNaHik = await controleNu();

      check(
        '4c живий прогін controleNu(): перехід werkt → storing(tijdelijk) → werkt не надсилає жодного сповіщення власнику',
        uitHik.stand === 'storing' &&
          uitHik.soort === 'tijdelijk' &&
          uitNaHik.stand === 'werkt' &&
          opgevangenMeldingen.length === 0,
      );

      // Додаємо відкриту картку про збій Telegram для власника, потім моделюємо vast-401 → ok-200
      await pool.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)', [
        'site_notifications',
        tgStoringNotifId,
        JSON.stringify({
          recipientUserId: eigenaarId,
          kind: 'security',
          title: '🚨 Telegram: тривога безпеки / beveiligingsalarm',
          message: 'Вхід через Telegram не працює: BOT_SLEUTEL_ONGELDIG.',
          read: false,
          createdAt: Date.now() - 60_000,
        }),
      ]);
      await pool.query(
        `INSERT INTO app.melding_ecosysteem_gebeurtenissen
          (id, user_id, ruimte, externe_sleutel, kanaal, subdomein, bron, prioriteit, status, titel, bericht)
         VALUES ($1::uuid, $2, 'technisch', $3, 'beveiliging', 'admin', 'security', 'kritiek', 'nieuw', '🚨 Telegram: тривога безпеки', 'Вхід через Telegram не працює: BOT_SLEUTEL_ONGELDIG.')`,
        [tgStoringEcoId, eigenaarId, `ext:${tgStoringEcoId}`],
      );

      nepTgAntwoord = 'vast-401';
      const uitVast = await controleNu();
      const aantalNaVast = opgevangenMeldingen.length;
      nepTgAntwoord = 'ok';
      const uitHerstel = await controleNu();

      const [geslotenRec] = (
        await pool.query<{ gelezen: boolean }>(
          `SELECT (data->>'read')::boolean AS gelezen FROM app.records WHERE tbl = 'site_notifications' AND id = $1`,
          [tgStoringNotifId],
        )
      ).rows;
      const [geslotenEco] = (
        await pool.query<{ status: string }>(
          `SELECT status FROM app.melding_ecosysteem_gebeurtenissen WHERE id = $1::uuid`,
          [tgStoringEcoId],
        )
      ).rows;

      const laatsteMelding = opgevangenMeldingen[opgevangenMeldingen.length - 1];
      check(
        '4d живий прогін controleNu(): після справжнього збою vast відновлення надсилає спокійний заголовок «✅ Telegram: зв’язок відновлено» і закриває попередню тривогу',
        uitVast.soort === 'vast' &&
          aantalNaVast === 1 &&
          uitHerstel.stand === 'werkt' &&
          opgevangenMeldingen.length === 2 &&
          Boolean(laatsteMelding?.title.startsWith('✅ Telegram: зв’язок відновлено')) &&
          geslotenRec?.gelezen === true &&
          geslotenEco?.status === 'opgelost',
      );
    } finally {
      registreerMelder(() => Promise.resolve());
      sleutels.zetKluisVoorTest(null);
      if (oudApiBasis === undefined) delete process.env.TELEGRAM_API_BASIS;
      else process.env.TELEGRAM_API_BASIS = oudApiBasis;
      nepServer.close();
      await pool
        .query("DELETE FROM app.records WHERE tbl = 'site_notifications' AND id = ANY($1)", [
          [nepStormNotifId1, nepStormNotifId2, echtOngelezenNotifId, tgStoringNotifId],
        ])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM app.melding_ecosysteem_gebeurtenissen WHERE id = ANY($1::uuid[])', [
          [nepStormEcoId, echtActiefEcoId, tgStoringEcoId],
        ])
        .catch(() => undefined);
      if (eigenaarTijdelijk) {
        await pool.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [eigenaarId]).catch(() => undefined);
      }
      if (vorigTgStatus) {
        await pool
          .query(
            `UPDATE app.tg_status SET stand = $1, soort = $2, oorzaak = $3, sinds = $4, reeks = $5::jsonb WHERE methode = 'telegram'`,
            [vorigTgStatus.stand, vorigTgStatus.soort, vorigTgStatus.oorzaak, vorigTgStatus.sinds, JSON.stringify(vorigTgStatus.reeks || [])],
          )
          .catch(() => undefined);
      } else {
        await pool.query("DELETE FROM app.tg_status WHERE methode = 'telegram'").catch(() => undefined);
      }
      await closePool().catch(() => undefined);
    }
  }

  // ── 5. Мобільний режим довгих знімків екрана (data-mel-mobiel-langscroll="1") та повзунок mel-scroll-schuif ──────────
  const ecoCss = lees('src/meldingen/ecosysteem/meldingen-ecosysteem.css');
  check(
    '5a стилі містять html[data-mel-mobiel-langscroll="1"] з прокручуванням документа, sticky шапку/вкладки/підвал, видимий скролбар .mel-lijst та .mel-scroll-schuif',
    ecoCss.includes('html[data-mel-mobiel-langscroll="1"]') &&
      ecoCss.includes('overflow-y: auto;') &&
      ecoCss.includes('position: sticky;') &&
      ecoCss.includes('.mel-lijst::-webkit-scrollbar') &&
      ecoCss.includes('.mel-scroll-schuif') &&
      ecoCss.includes('.mel-scroll-duim') &&
      !ecoCss.includes('!important'),
  );

  // На вузькому смартфоні (360×800) у розгорнутому режимі вмикається is-mobiel-langscroll і рендериться mel-scroll-schuif
  (globalThis.window as unknown as { innerWidth: number; innerHeight: number }).innerWidth = 360;
  (globalThis.window as unknown as { innerWidth: number; innerHeight: number }).innerHeight = 800;
  const profielMobiel = standaardProfiel('technisch');
  const mobielHtml = renderToStaticMarkup(
    createElement(MeldingenPortaal, {
      lang: 'uk',
      open: true,
      compactBijBel: false,
      ruimte: 'technisch',
      subdomeinNu: 'admin',
      profiel: profielMobiel,
      stroom: veelStoringen.slice(0, 10),
      laden: false,
      sound: true,
      onSluiten: () => undefined,
      onOpenen: () => undefined,
      onToggleSound: () => undefined,
      onVervers: () => undefined,
      onSlaGeometrieOp: () => undefined,
      onStatusWijzigen: async () => undefined,
      onOntleden: async () => ({
        aanbieder: 'intern-lokaal',
        modus: 'intern',
        samenvatting: 'Підсумок',
        watGebeurde: 'Опис',
        waaromBelangrijk: 'Значення',
        aanbevolenStappen: [],
        veiligheidsOpmerking: '',
        gegenereerdOp: Date.now(),
      }),
      onMarkAll: () => undefined,
      onSwitchToClassic: () => undefined,
    }),
  );
  (globalThis.window as unknown as { innerWidth: number; innerHeight: number }).innerWidth = 1280;

  check(
    '5b MeldingenPortaal на ширині 360px вмикає режим is-mobiel-langscroll (data-mel-langscroll="1"), .mel-lijst та інтерактивний повзунок mel-scroll-schuif',
    mobielHtml.includes('is-mobiel-langscroll') &&
      mobielHtml.includes('data-mel-langscroll="1"') &&
      mobielHtml.includes('mel-stroom-kolom mel-lijst') &&
      mobielHtml.includes('data-qa-id="mel-scroll-schuif"') &&
      mobielHtml.includes('role="scrollbar"') &&
      !mobielHtml.includes('is-tweekolom'),
  );

  // ── 6. Мовна чистота всіх змінених і нових файлів завдання ──────────────────────────────────────────────────────────
  const gecontroleerdeBestanden = [
    'backend/telegram-aanmelden/status.ts',
    'backend/telegram-aanmelden/meldingen.ts',
    'shared/meldingen-catalogus.ts',
    'shared/beheer-journaal.ts',
    'shared/meldingen-puls/kern.ts',
    'src/meldingen/puls/PulsOorzaakKetenKaart.tsx',
    'src/meldingen/ecosysteem/MeldingenPortaal.tsx',
    'src/meldingen/ecosysteem/meldingen-ecosysteem.css',
    'migrations/0338_telegram_alarm_storm_opruimen.sql',
  ];
  for (const pad of gecontroleerdeBestanden) {
    check(`6 мовна чистота (${pad}): відсутні заборонені не-українські кириличні літери`, !VERBODEN_LETTERS.test(lees(pad)));
  }

  return einde();
}
