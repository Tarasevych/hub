// Віха M2 (CONSOL-001): модульні та інтеграційні випробування Блоку 4 та мовної чистоти:
//   · М-2 — 4 взаємосумісні режими спадного меню облікового запису (orbita, kaart, v2, klassiek) + чесне читання value: false у accountmenu-v3/vlag.ts;
//   · П-8 — керування тіньовим режимом schaduwAan виключно прапорцем tech-ruimtes-v2-schaduw з бази даних без process.env;
//   · реактивність усіх клієнтських обгорток прапорців до події mr:vlaggen-vernieuwd та перевірка мовної чистоти нових і змінених файлів.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { closePool, getPool } from '../../server/platform/pg';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import * as techRuimtesKern from '../../backend/tech-ruimtes-kern';
import { nepBrowser } from './hulp/nep-browser';
import { checker } from './hulp/nep-google';
import { taalFouten } from './hulp/taalcontrole';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('consol-m2-menu-en-ruimtes');
  nepBrowser('https://hub.tarasevych.com', 'uk');

  const echteFetch = globalThis.fetch;
  const sys = getPool('systeem');
  const proefUserId = randomUUID();
  const oorspronkelijkSchaduw = (
    await sys.query<{ aan: boolean; standaard: boolean; gebruikers: string[] }>(
      "SELECT aan, standaard, gebruikers FROM app.feature_flags WHERE sleutel = 'tech-ruimtes-v2-schaduw'",
    )
  ).rows[0];
  const oudeEnvSchaduw = process.env.TECH_RUIMTES_V2_SCHADUW;

  try {
    // ---------------------------------------------------------------- 1. Чесне поважання серверного value: false у accountmenu-v3/vlag.ts
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          vlaggen: [{ key: 'accountmenu-v3', value: false, variant: 'uit', reason: 'DISABLED' }],
          key: 'accountmenu-v3',
          value: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    const fv = await import('../../src/functievlag-lezen');
    fv.vlaggenGebruiker('proef-gebruiker-m2');
    await fv.laadVlaggen(true);

    const v3VlagMod = await import('../../src/accountmenu-v3/vlag');
    const uitBijServerFalse = await v3VlagMod.laadAccountmenuV3Vlag(true);
    check(
      'laadAccountmenuV3Vlag(true) повертає false, коли сервер повертає value: false навіть без metadata.test',
      uitBijServerFalse === false,
    );

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          vlaggen: [{ key: 'accountmenu-v3', value: true, variant: 'aan', reason: 'STATIC' }],
          key: 'accountmenu-v3',
          value: true,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;
    await fv.laadVlaggen(true);
    const uitBijServerTrue = await v3VlagMod.laadAccountmenuV3Vlag(true);
    check('laadAccountmenuV3Vlag(true) повертає true, коли сервер повертає value: true', uitBijServerTrue === true);

    // ---------------------------------------------------------------- 2. Чотири взаємосумісні режими спадного меню облікового запису
    const voorkeurenMod = await import('../../src/accountmenu-v3/accountmenu-v3-voorkeuren');
    (globalThis.localStorage as Storage).clear();
    check(
      'типовою розкладкою меню облікового запису залишається orbita, а ACCOUNTMENU_V3_INDELINGEN містить усі 4 режими',
      voorkeurenMod.leesAccountmenuV3Voorkeuren().indeling === 'orbita' &&
        JSON.stringify(voorkeurenMod.ACCOUNTMENU_V3_INDELINGEN) === JSON.stringify(['orbita', 'kaart', 'v2', 'klassiek']),
    );
    for (const modus of ['orbita', 'kaart', 'v2', 'klassiek'] as const) {
      voorkeurenMod.zetAccountmenuV3Indeling(modus);
      check(
        `zetAccountmenuV3Indeling('${modus}') зберігає та читає вибраний режим '${modus}'`,
        voorkeurenMod.leesAccountmenuV3Voorkeuren().indeling === modus,
      );
    }
    voorkeurenMod.zetAccountmenuV3Indeling('onbekend' as never);
    check(
      'невідоме значення режиму ігнорується без пошкодження збереженого вибору',
      voorkeurenMod.leesAccountmenuV3Voorkeuren().indeling === 'klassiek',
    );
    voorkeurenMod.zetAccountmenuV3Indeling('orbita');

    const menuBron = lees('src/CanoniekAccountMenu.tsx');
    const instBron = lees('src/accountmenu-v3/AccountMenuV3Instellingen.tsx');
    check(
      'CanoniekAccountMenu.tsx та AccountMenuV3Instellingen.tsx узгоджено підтримують усі 4 варіанти (orbita, kaart, v2, klassiek)',
      menuBron.includes('AccountMenuV3') &&
        menuBron.includes('useAccountmenuV2') &&
        menuBron.includes('useAccountmenuV3Voorkeuren') &&
        menuBron.includes("'v2'") &&
        menuBron.includes("'klassiek'") &&
        ['orbita', 'kaart', 'v2', 'klassiek'].every((m) => instBron.includes(`'${m}'`)),
    );

    // ---------------------------------------------------------------- 3. Реактивність клієнтських обгорток прапорців до mr:vlaggen-vernieuwd
    const vlagBestanden = [
      'src/aanmeld-vnext/aanmeld-vlag.ts',
      'src/aanmeldmethoden-v2/vlag.ts',
      'src/accountmenu-v3/vlag.ts',
      'src/accountmenu-v2/vlag.ts',
      'src/apparaat-bevestiging/vlag.ts',
      'src/tech/ruimtes/ruimtes-vlag.ts',
      'src/telegram-aanmelden/vlag.ts',
    ];
    check(
      'усі клієнтські обгортки прапорців домену ідентичності та просторів реактивно оновлюються при mr:vlaggen-vernieuwd або через useVlag',
      vlagBestanden.every((pad) => {
        const s = lees(pad);
        return s.includes('mr:vlaggen-vernieuwd') || s.includes('useVlag(');
      }),
    );

    // ---------------------------------------------------------------- 4. П-8: schaduwAan у backend/tech-ruimtes-kern.ts через реєстр БД
    const kernBron = lees('backend/tech-ruimtes-kern.ts');
    check(
      'backend/tech-ruimtes-kern.ts не містить прихованої залежності від process.env.TECH_RUIMTES_V2_SCHADUW',
      !kernBron.includes('process.env.TECH_RUIMTES_V2_SCHADUW'),
    );
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
      'users',
      proefUserId,
      { email: `m2-schaduw-${proefUserId.slice(0, 8)}@eenheid.test`, role: 'member', status: 'approved' },
    ]);

    delete process.env.TECH_RUIMTES_V2_SCHADUW;
    await sys.query("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = 'tech-ruimtes-v2-schaduw'");
    techRuimtesKern._vlagCacheLeeg();
    check(
      'при увімкненому прапорці tech-ruimtes-v2-schaduw у БД schaduwAan повертає true без змінної середовища',
      (await techRuimtesKern.schaduwAan(proefUserId)) === true,
    );

    process.env.TECH_RUIMTES_V2_SCHADUW = '1';
    await sys.query("UPDATE app.feature_flags SET aan = false, standaard = false, gebruikers = '{}' WHERE sleutel = 'tech-ruimtes-v2-schaduw'");
    techRuimtesKern._vlagCacheLeeg();
    check(
      'при вимкненому прапорці у БД schaduwAan повертає false навіть за встановленої TECH_RUIMTES_V2_SCHADUW=1 у середовищі',
      (await techRuimtesKern.schaduwAan(proefUserId)) === false,
    );

    // ---------------------------------------------------------------- 5. Мовна чистота нових записів VLAG_UITLEG та змінених файлів
    const vlagTaalFouten: string[] = [];
    for (const sl of ['aanmeldmethoden-kaart-v2', 'telegram-aanmeld-maket-v1', 'telegram-v2']) {
      const u = VLAG_UITLEG[sl]!;
      // Офіційна назва марки «Telegram» прибирається перед перевіркою латиниці в українському тексті
      const zonderMerk = (t: string) => t.replace(/\bTelegram\b/g, 'Телеграм');
      vlagTaalFouten.push(
        ...taalFouten(`${sl}.naam`, zonderMerk(u.naam[0]), u.naam[1]),
        ...taalFouten(`${sl}.wat`, zonderMerk(u.wat[0]), u.wat[1]),
        ...taalFouten(`${sl}.wanneer`, zonderMerk(u.wanneer[0]), u.wanneer[1]),
        ...taalFouten(`${sl}.gevolg`, zonderMerk(u.gevolg[0]), u.gevolg[1]),
      );
    }
    check(
      'нові двомовні пояснення у VLAG_UITLEG проходять сувору перевірку taalFouten (нуль англіцизмів)',
      vlagTaalFouten.length === 0,
      vlagTaalFouten.join(' | '),
    );

    const gecontroleerdeBestanden = [
      'migrations/0321_aanmeldmethoden_kaart_v2_vlag.sql',
      'src/aanmeldmethoden-v2/aanmeldmethoden-model.ts',
      'src/aanmeldmethoden-v2/vlag.ts',
      'src/aanmeldmethoden-v2/iconen.tsx',
      'src/aanmeldmethoden-v2/MethodeHeroV2.tsx',
      'src/aanmeldmethoden-v2/MethodeFilterV2.tsx',
      'src/aanmeldmethoden-v2/MethodeKaartV2.tsx',
      'src/aanmeldmethoden-v2/MethodeDetailsV2.tsx',
      'src/aanmeldmethoden-v2/BeveiligingExtrasV2.tsx',
      'src/aanmeldmethoden-v2/AanmeldmethodenKaartV2.tsx',
      'src/aanmeldmethoden-v2/aanmeldmethoden-v2.css',
      'src/telegram-aanmelden/TelegramInlogMaketHulp.tsx',
      'src/sessies/niet-ik-actie.ts',
      'src/accountmenu-v3/AccountMenuV3Instellingen.tsx',
    ];
    const russischeTekens = gecontroleerdeBestanden.filter((p) => /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/.test(lees(p)));
    check('у жодному зі створених чи оновлених файлів Віхи M2 немає заборонених російських літер', russischeTekens.length === 0, russischeTekens.join(', '));
  } finally {
    globalThis.fetch = echteFetch;
    if (oudeEnvSchaduw === undefined) delete process.env.TECH_RUIMTES_V2_SCHADUW;
    else process.env.TECH_RUIMTES_V2_SCHADUW = oudeEnvSchaduw;
    if (oorspronkelijkSchaduw) {
      await sys
        .query('UPDATE app.feature_flags SET aan = $1, standaard = $2, gebruikers = $3 WHERE sleutel = $4', [
          oorspronkelijkSchaduw.aan,
          oorspronkelijkSchaduw.standaard,
          oorspronkelijkSchaduw.gebruikers,
          'tech-ruimtes-v2-schaduw',
        ])
        .catch(() => undefined);
    }
    techRuimtesKern._vlagCacheLeeg();
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [proefUserId]).catch(() => undefined);
    await closePool().catch(() => undefined);
  }
  return einde();
}
