// Віха M2 (CONSOL-001): модульні та інтеграційні випробування Блоку 3:
//   · З-12 — живий стан у «Макеті» облікового запису (maquette-motor.ts, zetLiveStand, відсутність застарілих позначок «заплановано»);
//   · Т-1  — швидка захисна дія «Це був не я» / «Dit was ik niet» на сервері та в інтерфейсі сеансів і пристроїв.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { nepBrowser } from './hulp/nep-browser';
import { checker, nepGoogle } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('consol-m2-maquette-en-niet-ik');

  // ---------------------------------------------------------------- 1. З-12: живий стан у «Макеті» облікового запису
  {
    const motor = lees('src/identiteit/maquette/maquette-motor.ts');
    const idxDodatkovi = motor.indexOf('група("додаткові"');
    check('у maquette-motor.ts присутня група "додаткові" розділу способів входу', idxDodatkovi > 0);
    const blokDodatkovi = motor.slice(idxDodatkovi, idxDodatkovi + 1600);
    for (const naam of ['Microsoft', 'Discord', 'Telegram', 'Apple']) {
      check(
        `спосіб входу ${naam} у maquette-motor.ts більше не має застарілої жорсткої позначки "заплановано"`,
        !new RegExp(`${naam}[^\\n]*"заплановано"`).test(blokDodatkovi),
      );
    }
    check(
      'застарілий напис «SMS — потребує окремої розробки» оновлено на власницький стан зі збереженням чесного рядка про WhatsApp',
      !blokDodatkovi.includes('SMS — потребує окремої розробки') &&
        blokDodatkovi.includes('SMS — потрібне налаштування власника') &&
        blokDodatkovi.includes('WhatsApp — такий вхід недоступний'),
    );

    for (const groepSleutel of ['група("чинні"', 'група("сценарії"', 'група("поради"']) {
      const idx = motor.indexOf(groepSleutel);
      const kop = motor.slice(idx, idx + 360).split('\n')[0] || '';
      check(
        `${groepSleutel} у maquette-motor.ts переведена зі стану "заплановано" до чинного стану "наявне"`,
        idx > 0 && !kop.includes('"заплановано"') && kop.includes('"наявне"'),
      );
    }

    const wrapper = lees('src/identiteit/maquette/IdentiteitMaquette.tsx');
    check(
      'двигун maquette-motor.ts та обгортка IdentiteitMaquette.tsx підтримують передачу живого зрізу zetLiveStand із сервера',
      motor.includes('zetLiveStand(stand)') &&
        motor.includes('прийнятиЖивийСтан') &&
        wrapper.includes('/api/owner/access/snapshot') &&
        wrapper.includes('/api/owner/aanmeld/vnext/aanbieders') &&
        wrapper.includes('zetLiveStand(stand)'),
    );
  }

  // ---------------------------------------------------------------- 2. Клієнтський модуль та двомовний інтерфейс дії «Це був не я»
  {
    nepBrowser('https://id.tarasevych.com', 'uk');
    const { meldNietIk, NIET_IK_ROUTE, NIET_IK_TEKST } = await import('../../src/sessies/niet-ik-actie');
    const aanroepen: Array<{ url: string; body: unknown }> = [];
    const uit = await meldNietIk(
      { sessieId: 'sessie-proef-1', kind: 'session' },
      async (url, body) => {
        aanroepen.push({ url, body });
        return { data: { ok: true, sessies: 1, adviesPad: '/methods' } };
      },
    );
    check(
      'meldNietIk викликає канонічний маршрут /api/owner/identity/security/niet-ik із confirmation=DIT_WAS_IK_NIET',
      uit.ok === true &&
        aanroepen.length === 1 &&
        aanroepen[0].url === NIET_IK_ROUTE &&
        (aanroepen[0].body as Record<string, unknown>).sessieId === 'sessie-proef-1' &&
        (aanroepen[0].body as Record<string, unknown>).confirmation === 'DIT_WAS_IK_NIET',
    );

    const uiSamen = [
      lees('src/sessies/niet-ik-actie.ts'),
      lees('src/BeveiligingSessiesPaneel.tsx'),
      lees('src/BekendeApparaten.tsx'),
      lees('src/SessiesOverzicht.tsx'),
    ].join('\n');
    check(
      'панелі сеансів та відомих пристроїв містять двомовну захисну дію «Це був не я» / «Dit was ik niet» і пораду перевірити способи входу',
      uiSamen.includes('Це був не я') &&
        uiSamen.includes('Dit was ik niet') &&
        NIET_IK_TEKST.adviesTekst[0].length > 20 &&
        NIET_IK_TEKST.adviesTekst[1].length > 20,
    );
  }

  // ---------------------------------------------------------------- 3. Серверна перевірка дії «Це був не я» проти справжнього PostgreSQL
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = {
    owner: process.env.OWNER_EMAIL,
    id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  };
  const eigenaarEmail = `m2-nietik-eig-${T}@example.test`;
  const vreemdeEmail = `m2-nietik-ander-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaarEmail });
  const sys = getPool('systeem');

  try {
    check(
      'маршрути /api/meldingen/apparaat-bekend та захисні маршрути niet-ik зареєстровані у головному маршрутизаторі',
      G.handler.patronen.includes('POST /api/meldingen/apparaat-bekend') &&
        G.handler.patronen.includes('POST /api/owner/identity/security/niet-ik') &&
        G.handler.patronen.includes('POST /api/owner/identity/security/verdachte-sessie/:id/niet-ik'),
    );

    // Анонімний виклик → 401
    const anoniem = G.browser();
    const anonRes = await anoniem.verzoek('id.tarasevych.com', '/api/owner/identity/security/niet-ik', { sessieId: 'proef' });
    check('анонімний виклик маршруту niet-ik відхиляється зі статусом 401', anonRes.status === 401);

    // Власний основний сеанс власника
    const eigenaarBrowser = G.browser();
    await eigenaarBrowser.aanmelden(`sub-eig-${T}`, eigenaarEmail, {
      service: 'identity',
      intent: 'login',
      remember: true,
      tabContext: eigenaarBrowser.tab,
    });
    const eigenaarUserId = String(
      (await sys.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'email' = $1 LIMIT 1", [eigenaarEmail])).rows[0]?.id || '',
    );
    const eigenSessieId = String(
      (
        await sys.query(
          "SELECT id FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'userId' = $1 ORDER BY seq DESC LIMIT 1",
          [eigenaarUserId],
        )
      ).rows[0]?.id || '',
    );
    check('основний сеанс власника створено успішно', Boolean(eigenaarUserId && eigenSessieId));

    // Виклик без параметрів → 400
    const leegRes = await eigenaarBrowser.verzoek(
      'id.tarasevych.com',
      '/api/owner/identity/security/niet-ik',
      eigenaarBrowser.ctxBody('identity', {}),
    );
    check('виклик niet-ik без sessieId чи apparaatId повертає 400 SESSIE_OF_APPARAAT_VEREIST', leegRes.status === 400);

    // Підозрілий другий сеанс того ж власника з іншого пристрою (разом із grant у owner_browser_grants_v1)
    const verdachteBrowser = G.browser();
    await verdachteBrowser.aanmelden(`sub-eig-${T}`, eigenaarEmail, {
      service: 'hub',
      intent: 'login',
      remember: true,
      ip: '198.51.100.88',
      ua: 'VerdachtToestel/2.0',
      tabContext: verdachteBrowser.tab,
    });
    const verdachteRij = (
      await sys.query<{ id: string; grant_id: string }>(
        `SELECT id, COALESCE(data->>'grantId', '') AS grant_id
           FROM app.records
          WHERE tbl = 'owner_service_sessions_v1' AND data->>'userId' = $1 AND data->>'ip' = '198.51.100.88'
          ORDER BY seq DESC
          LIMIT 1`,
        [eigenaarUserId],
      )
    ).rows[0];
    check('підозрілий сеанс із запам’ятованим оглядачем створено', Boolean(verdachteRij?.id));

    // Чужий сеанс іншого користувача — спроба власника відкликати чужий ID через niet-ik має повернути 404 і не зачепити чужий запис
    const anderBrowser = G.browser();
    await anderBrowser.aanmelden(`sub-ander-${T}`, vreemdeEmail, {
      service: 'identity',
      intent: 'login',
      remember: false,
      tabContext: anderBrowser.tab,
    });
    const anderUserId = String(
      (await sys.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'email' = $1 LIMIT 1", [vreemdeEmail])).rows[0]?.id || '',
    );
    await sys.query(`UPDATE app.records SET data = data || '{"status":"approved"}'::jsonb WHERE tbl = 'users' AND id = $1`, [anderUserId]);
    const anderSessieId = String(
      (
        await sys.query(
          "SELECT id FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'userId' = $1 ORDER BY seq DESC LIMIT 1",
          [anderUserId],
        )
      ).rows[0]?.id || '',
    );
    const kruisRes = await eigenaarBrowser.verzoek(
      'id.tarasevych.com',
      `/api/owner/identity/security/verdachte-sessie/${encodeURIComponent(anderSessieId)}/niet-ik`,
      eigenaarBrowser.ctxBody('identity', { sessieId: anderSessieId }),
    );
    const anderNogLevend = (
      await sys.query<{ levend: boolean }>(
        "SELECT COALESCE((data->>'revokedAt')::numeric, 0) = 0 AS levend FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND id = $1",
        [anderSessieId],
      )
    ).rows[0]?.levend;
    check(
      'ізоляція облікових записів: niet-ik для чужого сеансу повертає 404 SESSIE_NIET_GEVONDEN і залишає чужий сеанс живим',
      kruisRes.status === 404 && anderNogLevend === true,
    );

    // Виконання захисної дії «Це був не я» для власного підозрілого сеансу
    const nietIkRes = await eigenaarBrowser.verzoek(
      'id.tarasevych.com',
      `/api/owner/identity/security/verdachte-sessie/${encodeURIComponent(verdachteRij.id)}/niet-ik`,
      eigenaarBrowser.ctxBody('identity', { sessieId: verdachteRij.id, confirmation: 'DIT_WAS_IK_NIET' }),
    );
    check('захисна дія «Це був не я» завершується статусом 200 і повертає adviesPad=/methods', nietIkRes.status === 200 && nietIkRes.data?.adviesPad === '/methods');

    const verdachtNa = (
      await sys.query<{ ingetrokken: boolean }>(
        "SELECT COALESCE((data->>'revokedAt')::numeric, 0) > 0 AS ingetrokken FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND id = $1",
        [verdachteRij.id],
      )
    ).rows[0]?.ingetrokken;
    const eigenNa = (
      await sys.query<{ ingetrokken: boolean }>(
        "SELECT COALESCE((data->>'revokedAt')::numeric, 0) > 0 AS ingetrokken FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND id = $1",
        [eigenSessieId],
      )
    ).rows[0]?.ingetrokken;
    const grantIngetrokken = verdachteRij.grant_id
      ? (
          await sys.query<{ ingetrokken: boolean }>(
            "SELECT COALESCE((data->>'revokedAt')::numeric, 0) > 0 AS ingetrokken FROM app.records WHERE tbl = 'owner_browser_grants_v1' AND id = $1",
            [verdachteRij.grant_id],
          )
        ).rows[0]?.ingetrokken
      : true;
    const auditGeschreven = (
      await sys.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM app.audit WHERE owner_id = $1 AND action = 'aanmelden.niet-ik'",
        [eigenaarUserId],
      )
    ).rows[0]?.n;
    check(
      'підозрілий сеанс і його grant негайно відкликано, поточний сеанс власника збережено, а в app.audit записано подію aanmelden.niet-ik',
      verdachtNa === true && eigenNa === false && grantIngetrokken === true && Number(auditGeschreven) >= 1,
    );

    // Перевірка відкликання непідтвердженого відомого пристрою через apparaatId
    const appId = randomUUID();
    await sys.query(
      `INSERT INTO app.bekende_apparaten (id, user_id, sleutel, apparaat) VALUES ($1, $2, $3, $4)`,
      [appId, eigenaarUserId, randomBytes(16).toString('hex'), 'VreemdApparaat'],
    );
    const appNietIk = await eigenaarBrowser.verzoek(
      'id.tarasevych.com',
      '/api/owner/identity/security/niet-ik',
      eigenaarBrowser.ctxBody('identity', { apparaatId: appId, confirmation: 'DIT_WAS_IK_NIET' }),
    );
    const appOver = (await sys.query('SELECT 1 FROM app.bekende_apparaten WHERE id = $1', [appId])).rowCount;
    check(
      'дія «Це був не я» з apparaatId повертає 200 і негайно вилучає чужий пристрій із app.bekende_apparaten',
      appNietIk.status === 200 && appNietIk.data?.apparaatVerwijderd === true && appOver === 0,
    );
  } finally {
    const uids = (
      await sys
        .query<{ id: string }>("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'email' = ANY($1)", [[eigenaarEmail, vreemdeEmail]])
        .catch(() => ({ rows: [] as Array<{ id: string }> }))
    ).rows.map((r) => r.id);
    if (uids.length) {
      await sys.query('DELETE FROM app.bekende_apparaten WHERE user_id = ANY($1)', [uids]).catch(() => undefined);
      await sys
        .query(
          "DELETE FROM app.records WHERE id = ANY($1) OR data->>'userId' = ANY($1) OR data->>'accountId' = ANY($1) OR data->>'recipientUserId' = ANY($1) OR data->>'ownerUserId' = ANY($1)",
          [uids],
        )
        .catch(() => undefined);
    }
    G.herstel();
    for (const [k, v] of Object.entries({
      OWNER_EMAIL: vorige.owner,
      GOOGLE_OAUTH_CLIENT_ID: vorige.id,
      GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await closePool().catch(() => undefined);
  }
  return einde();
}
