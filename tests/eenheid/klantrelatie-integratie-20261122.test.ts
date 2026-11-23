// Модульне та інтеграційне випробування CONSOL-001 / KLANT-001 (Потоки 08 та 04, 22.11.2026):
// перевірка міграції 0310 (FORCE RLS + прапорець klantrelatiebeheer-v1), SLEUTELKLUIS_REGISTER,
// захисту маршрутів за прапорцем, безвмістового аудиту всіх 11 мутацій, MELDINGEN-REGISTER-001,
// міжпотокового коду owner.meldingen.bijlage.telegram та української назви «Клієнтські взаємини» у 6 точках.
// Eenheids- en integratietest voor KLANT-001 binnen CONSOL-001.

import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { klantrelatieRoutes } from '../../backend/klantrelatiebeheer-routes';
import { relatiehulpRoutes } from '../../backend/klantrelatie-hulp';
import { SITE_RUIS, sourceOfAudit } from '../../backend/site-activiteit';
import { inschakelen, registerZonderHerversleutelaar, sleutelVergrendelen, zetHouderControle } from '../../backend/sleutelkluis';
import { sqlRechtenVlaggen } from '../../backend/uitrol-risico';
import { SQL_RISICO } from '../../backend/uitrol-voorcontrole';
import { appRolActief, closePool, getPool, poolUrl } from '../../server/platform/pg';
import { ACTIE_LABELS, categorieVan, isRuis } from '../../shared/beheer-journaal';
import { MELDINGEN } from '../../shared/meldingen-catalogus';
import { SLEUTELKLUIS_REGISTER, isDekEnvelop } from '../../shared/sleutelkluis';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { DIENST_DEF } from '../../shared/werkblad-register';
import { MENU_CATALOG } from '../../src/menu-voorkeuren';
import { checker } from './hulp/nep-google';

const KLANT_ACTIES = [
  'owner.klantrelatie.klant',
  'owner.klantrelatie.aanvraag',
  'owner.klantrelatie.wijzig',
  'owner.klantrelatie.wissen',
  'owner.klantrelatie.kans',
  'owner.klantrelatie.fase',
  'owner.klantrelatie.contact',
  'owner.klantrelatie.taak',
  'owner.klantrelatie.afronden',
  'owner.klantrelatie.afspraak',
  'owner.klantrelatie.hulp',
] as const;

export async function main(): Promise<number> {
  const { check, einde } = checker('klantrelatie-integratie-20261122');

  // 1. Жива міграція 0307_klantrelatiebeheer.sql + міграція укріплення 0312_klantrelatiebeheer_rls_en_vlag.sql та архів KLANT-001.json
  const pad0307 = resolve('migrations/0307_klantrelatiebeheer.sql');
  const pad0312 = resolve('migrations/0312_klantrelatiebeheer_rls_en_vlag.sql');
  check('0307 + 0312: обидва файли міграцій існують для безшовної сумісності з живим сервером 20261122-171856',
    existsSync(pad0307) && existsSync(pad0312));

  const sql0312 = readFileSync(pad0312, 'utf8');
  check('0312: увімкнено ENABLE + FORCE ROW LEVEL SECURITY на app.klantrelatieboek',
    /ALTER\s+TABLE\s+app\.klantrelatieboek\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY\s*;/i.test(sql0312)
    && /ALTER\s+TABLE\s+app\.klantrelatieboek\s+FORCE\s+ROW\s+LEVEL\s+SECURITY\s*;/i.test(sql0312));
  check('0312: політика рядкового захисту перевіряє NULLIF для app.user_id та app.ruimte',
    /current_user::text\s*<>\s*'mijnruimte_app'[\s\S]*?gebruiker\s*=\s*NULLIF\(current_setting\('app\.user_id',\s*true\),\s*''\)\s*AND\s*ruimte\s*=\s*NULLIF\(current_setting\('app\.ruimte',\s*true\),\s*''\)/i.test(sql0312));
  check('0312: зареєстровано прапорець klantrelatiebeheer-v1 зі станом false, false та ON CONFLICT DO NOTHING',
    /INSERT\s+INTO\s+app\.feature_flags[\s\S]*?'klantrelatiebeheer-v1'[\s\S]*?'Клієнтські взаємини:[\s\S]*?false\s*,\s*false\s*\)\s*ON\s+CONFLICT\s*\(\s*sleutel\s*\)\s*DO\s+NOTHING/i.test(sql0312));
  check('0312: нуль попереджень sqlRechtenVlaggen та SQL_RISICO',
    sqlRechtenVlaggen('0312_klantrelatiebeheer_rls_en_vlag.sql', sql0312).length === 0
    && SQL_RISICO.every(([re]) => !re.test(sql0312)));

  const archiefKlant = readFileSync(resolve('orchestratie/ontwikkelarchieven/KLANT-001.json'), 'utf8');
  check('KLANT-001.json зберігає точну історичну прив’язку до migrations/0307_klantrelatiebeheer.sql',
    archiefKlant.includes('"migrations/0307_klantrelatiebeheer.sql"'));

  // 2. Прапорець klantrelatiebeheer-v1 у VLAG_UITLEG, відсутність прямого імпорту прапорців і SLEUTELKLUIS_REGISTER
  const uitleg = VLAG_UITLEG['klantrelatiebeheer-v1'];
  check('VLAG_UITLEG містить двомовний опис klantrelatiebeheer-v1',
    Boolean(uitleg && uitleg.naam[0] === 'Клієнтські взаємини' && uitleg.naam[1] === 'Klantrelatiebeheer'
      && uitleg.wat[0].length > 20 && uitleg.wat[1].length > 20));

  for (const relPad of [
    'backend/klantrelatiebeheer-routes.ts',
    'backend/klantrelatiebeheer-koppelingen.ts',
    'backend/klantrelatiebeheer-opslag.ts',
    'backend/klantrelatiebeheer-toegang.ts',
    'backend/klantrelatie-hulp.ts',
  ]) {
    const bron = readFileSync(resolve(relPad), 'utf8');
    check(`${relPad} не імпортує модуль прапорців напряму`, !/vlaggen['"]/.test(bron));
  }

  const kluisRegel = SLEUTELKLUIS_REGISTER.find((r) => r.tabel === 'app.klantrelatieboek');
  check('SLEUTELKLUIS_REGISTER містить app.klantrelatieboek зі станом dek і власним перешифровувачем',
    Boolean(kluisRegel && kluisRegel.stand === 'dek' && kluisRegel.module === 'backend/klantrelatiebeheer-opslag.ts')
    && !registerZonderHerversleutelaar().includes('app.klantrelatieboek'));

  // 3. Реєстр сповіщень і журналу керування (11 кодів owner.klantrelatie.* + шумовий owner.meldingen.bijlage.telegram)
  check('усі 11 кодів owner.klantrelatie.* мають двомовні підписи в ACTIE_LABELS і категорію integraties',
    KLANT_ACTIES.every((c) => {
      const paar = ACTIE_LABELS[c];
      return Boolean(paar && paar[0].trim().length > 3 && paar[1].trim().length > 3 && categorieVan(c) === 'integraties');
    }));
  const connBron = readFileSync(resolve('src/connector-activiteit.ts'), 'utf8');
  check('усі 11 кодів owner.klantrelatie.* маршрутизуються в crm, описані в SITE_LABELS та MELDINGEN',
    KLANT_ACTIES.every((c) => {
      const [uk, nl] = ACTIE_LABELS[c];
      const inSiteLabels = connBron.includes(`'${c}': ['${uk}', '${nl}']`);
      const inCatalogus = MELDINGEN.some((m) => m.kanaal === 'activiteit' && m.soort === c && m.bestand === 'src/connector-activiteit.ts');
      return sourceOfAudit(c) === 'crm' && inSiteLabels && inCatalogus;
    }));
  check('owner.meldingen.bijlage.telegram зареєстрований у ACTIE_LABELS (privacy) та фільтрується як шум',
    ACTIE_LABELS['owner.meldingen.bijlage.telegram']?.[0] === 'Надіслано картку вкладення у Telegram'
    && ACTIE_LABELS['owner.meldingen.bijlage.telegram']?.[1] === 'Bijlagekaart naar Telegram verzonden'
    && categorieVan('owner.meldingen.bijlage.telegram') === 'privacy'
    && isRuis('owner.meldingen.bijlage.telegram')
    && SITE_RUIS.test('owner.meldingen.bijlage.telegram')
    && sourceOfAudit('owner.meldingen.bijlage.telegram') === null);

  // 4. Синхронна українська назва «Клієнтські взаємини» у всіх 6 місцях та клієнтський захист прапорцем
  const menuCrm = MENU_CATALOG.find((m) => m.id === 'crm');
  const vdaBron = readFileSync(resolve('src/VerenigdDienstApp.tsx'), 'utf8');
  const recentBron = readFileSync(resolve('src/HubRecent.tsx'), 'utf8');
  const krBron = readFileSync(resolve('src/klantrelatiebeheer/Klantrelatiebeheer.tsx'), 'utf8');
  const htmlBron = readFileSync(resolve('index.html'), 'utf8');
  check('українська назва «Клієнтські взаємини» синхронна в усіх 6 клієнтських і спільних файлах',
    menuCrm?.uk === 'Клієнтські взаємини' && menuCrm?.nl === 'Klantrelatiebeheer'
    && DIENST_DEF.crm.titel.uk === 'Клієнтські взаємини' && DIENST_DEF.crm.titel.nl === 'Klantrelatiebeheer'
    && vdaBron.includes("crm:tr('Клієнтські взаємини','Klantrelatiebeheer')")
    && recentBron.includes("crm: ['Клієнтські взаємини', 'Klantrelatiebeheer']")
    && krBron.includes("t('Клієнтські взаємини', 'Klantrelatiebeheer')")
    && htmlBron.includes("crm:['Клієнтські взаємини — Мій простір'"));
  check('VerenigdDienstApp.tsx та Klantrelatiebeheer.tsx захищені гачком useVlag("klantrelatiebeheer-v1", false)',
    vdaBron.includes("useVlag('klantrelatiebeheer-v1',false)")
    && krBron.includes("useVlag('klantrelatiebeheer-v1', false)"));
  check('VerenigdDienstApp.tsx розгорнуто у багаторядкову структуру без наддовгих зліплених блоків коду',
    vdaBron.split('\n').length >= 220);

  // 5. Перевірка відмови 404 KLANT_DIENST_UIT на серверних маршрутах за вимкненого прапорця
  const nepGebruiker = { id: `klant-test-${randomUUID()}`, status: 'approved', role: 'owner', accessLevel: 'full' as const };
  const nepSessie = async () => ({ service: 'crm', user: nepGebruiker, tab: 'proef-tab' });
  const routesUit = {
    ...klantrelatieRoutes(nepSessie, { vlagAan: async () => false }),
    ...relatiehulpRoutes(nepSessie, { vlagAan: async () => false }),
  };
  for (const pad of [
    'POST /api/owner/klantrelatiebeheer/overzicht',
    'POST /api/owner/klantrelatiebeheer/klant',
    'POST /api/owner/klantrelatiebeheer/hulp/overzicht',
    'POST /api/owner/klantrelatiebeheer/hulp/voorbereiden',
  ]) {
    const antwoord = await routesUit[pad][0]({
      event: {},
      body: { sleutel: randomUUID(), naam: 'Перевірка' },
      params: {},
      query: {},
    } as never);
    const inhoud = JSON.parse(String(antwoord.body || '{}')) as { error?: string };
    check(`${pad} повертає 404 KLANT_DIENST_UIT, коли прапорець вимкнений`,
      antwoord.statusCode === 404 && inhoud.error === 'KLANT_DIENST_UIT');
  }

  // 6. Перевірка шифрування DEK, ізоляції RLS та безвмістового журналу в базі даних (якщо DATABASE_URL налаштовано)
  if (poolUrl('systeem')) {
    const sys = getPool('systeem');
    const gebruikerA = `klant-a-${randomUUID()}`;
    const gebruikerB = `klant-b-${randomUUID()}`;
    const geheimNaam = `Оксана Коваленко ${randomBytes(4).toString('hex')}`;
    const geheimMail = `oksana.${randomBytes(4).toString('hex')}@example.test`;
    const geheimTel = '+380501234567';
    const geheimTekst = `Таємна домовленість ${randomBytes(4).toString('hex')}`;
    try {
      await sys.query(
        `INSERT INTO app.records (tbl, id, data) VALUES
          ('users', $1, $3::jsonb),
          ('users', $2, $4::jsonb)`,
        [
          gebruikerA,
          gebruikerB,
          JSON.stringify({ email: `a-${gebruikerA}@example.test`, role: 'member', accessLevel: 'full', status: 'approved', name: 'Учасник А' }),
          JSON.stringify({ email: `b-${gebruikerB}@example.test`, role: 'member', status: 'approved', name: 'Учасник Б' }),
        ],
      );
      zetHouderControle(async () => true);
      await inschakelen({ userId: gebruikerA, ruimte: 'prive' }, { soort: 'sessie', id: `sessie-${gebruikerA}` });

      const sessieA = async () => ({
        service: 'crm',
        user: { id: gebruikerA, status: 'approved', role: 'member', accessLevel: 'full' as const },
        tab: 'tab-a',
      });
      const routesAan = klantrelatieRoutes(sessieA, { vlagAan: async () => true });
      const roep = async (soort: string, body: Record<string, unknown>) => {
        const res = await routesAan[`POST /api/owner/klantrelatiebeheer/${soort}`][0]({
          event: {},
          body,
          params: {},
          query: {},
        } as never);
        return { status: res.statusCode, data: JSON.parse(String(res.body || '{}')) as Record<string, string> };
      };

      const rKlant = await roep('klant', { sleutel: randomUUID(), naam: geheimNaam, organisatie: 'Спілка Плющ', mail: geheimMail, telefoon: geheimTel });
      const klantId = rKlant.data.id;
      check('БД: створення клієнта під відкритим DEK завершується зі статусом 200', rKlant.status === 200 && Boolean(klantId));

      const rWijzig = await roep('wijzig', { sleutel: randomUUID(), klantId, versie: 1, naam: geheimNaam, organisatie: 'Оновлена Спілка', mail: geheimMail, telefoon: geheimTel });
      const rKans = await roep('kans', { sleutel: randomUUID(), klantId, titel: geheimTekst, centen: 125000, fase: 'gesprek' });
      const kansId = rKans.data.id;
      const rFase = await roep('fase', { sleutel: randomUUID(), kansId, vorigeFase: 'gesprek', fase: 'voorstel' });
      const rContact = await roep('contact', { sleutel: randomUUID(), klantId, kansId, kanaal: 'post', richting: 'in', tekst: geheimTekst, minuten: 25 });
      const rTaak = await roep('taak', { sleutel: randomUUID(), klantId, kansId, titel: geheimTekst, datum: '2026-12-01' });
      const taakId = rTaak.data.id;
      const rAfronden = await roep('afronden', { sleutel: randomUUID(), taakId });
      const rAanvraag = await roep('aanvraag', { sleutel: randomUUID(), naam: geheimNaam, mail: geheimMail, kanaal: 'post', tekst: geheimTekst, titel: geheimTekst, datum: '2026-12-05' });
      const rWissen = await roep('wissen', { sleutel: randomUUID(), klantId: rAanvraag.data.id, versie: 1 });

      check('БД: усі 9 основних мутацій klantrelatieRoutes виконано зі статусом 200',
        [rWijzig, rKans, rFase, rContact, rTaak, rAfronden, rAanvraag, rWissen].every((r) => r.status === 200));

      const opslagRijen = (await sys.query<{ inhoud: string | null }>(
        'SELECT inhoud FROM app.klantrelatieboek WHERE gebruiker = $1 AND inhoud IS NOT NULL',
        [gebruikerA],
      )).rows;
      check('БД: усі непорожні рядки в app.klantrelatieboek зашифровані конвертом dek1. без відкритих персональних даних',
        opslagRijen.length >= 4
        && opslagRijen.every((r) => isDekEnvelop(r.inhoud) && !String(r.inhoud).includes(geheimNaam) && !String(r.inhoud).includes(geheimMail)));

      if (appRolActief()) {
        const appPool = getPool('app');
        const c = await appPool.connect();
        try {
          await c.query('BEGIN');
          await c.query("SELECT set_config('app.user_id', $1, true), set_config('app.ruimte', 'prive', true)", [gebruikerB]);
          const vreemd = (await c.query('SELECT count(*)::int AS n FROM app.klantrelatieboek')).rows[0]?.n;
          await c.query("SELECT set_config('app.user_id', $1, true), set_config('app.ruimte', 'technisch', true)", [gebruikerA]);
          const andereRuimte = (await c.query('SELECT count(*)::int AS n FROM app.klantrelatieboek')).rows[0]?.n;
          await c.query('COMMIT');
          check('БД RLS: інший користувач та інший простір бачать 0 чужих рядків у app.klantrelatieboek',
            vreemd === 0 && andereRuimte === 0, `vreemd=${vreemd}, andereRuimte=${andereRuimte}`);
        } finally {
          c.release();
        }
      }

      const auditRijen = (await sys.query<{ action: string; details: Record<string, unknown> }>(
        "SELECT action, details FROM app.audit WHERE owner_id = $1 AND action LIKE 'owner.klantrelatie.%' ORDER BY seq",
        [gebruikerA],
      )).rows;
      const gelogdeActies = new Set(auditRijen.map((r) => r.action));
      const auditTekst = JSON.stringify(auditRijen);
      check('БД аудит: усі 9 мутацій записані в app.audit з ruimte=prive та НУЛЕМ персональних даних (без імен, пошт, телефонів і текстів)',
        ['klant', 'wijzig', 'kans', 'fase', 'contact', 'taak', 'afronden', 'aanvraag', 'wissen'].every((s) => gelogdeActies.has(`owner.klantrelatie.${s}`))
        && !auditTekst.includes(geheimNaam)
        && !auditTekst.includes(geheimMail)
        && !auditTekst.includes(geheimTel)
        && !auditTekst.includes(geheimTekst));
    } finally {
      sleutelVergrendelen({ userId: gebruikerA, ruimte: 'prive' });
      zetHouderControle(null);
      await sys.query('DELETE FROM app.klantrelatieboek WHERE gebruiker = ANY($1::text[])', [[gebruikerA, gebruikerB]]).catch(() => undefined);
      await sys.query('DELETE FROM app.sleutelkluis_omslag WHERE user_id = ANY($1::text[])', [[gebruikerA, gebruikerB]]).catch(() => undefined);
      await sys.query('DELETE FROM app.sleutelkluis WHERE user_id = ANY($1::text[])', [[gebruikerA, gebruikerB]]).catch(() => undefined);
      await sys.query('DELETE FROM app.audit WHERE owner_id = ANY($1::text[])', [[gebruikerA, gebruikerB]]).catch(() => undefined);
      await sys.query('DELETE FROM app.records WHERE owner_id = ANY($1::text[]) OR id = ANY($1::text[])', [[gebruikerA, gebruikerB]]).catch(() => undefined);
      await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1::text[])", [[gebruikerA, gebruikerB]]).catch(() => undefined);
      await closePool().catch(() => undefined);
    }
  }

  return einde();
}
