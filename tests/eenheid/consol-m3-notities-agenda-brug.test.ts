// Випробування Віхи M3 (Блок Б — Частина 1): Міст між Нотатками, Календарем, Завданнями простору та Хмарним сховищем.
// Toets van migratie 0316, ENABLE + FORCE ROW LEVEL SECURITY onder mijnruimte_app, ruimtescheiding (prive ↔ technisch),
// herhaalbestendigheid, bevestigingseis, taakaanmaak met bronNotitie en bestandskoppeling uit Opslag zonder kopie van bytes.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../server/platform';
import { closePool, getPool } from '../../server/platform/pg';
import { alsGebruiker } from '../../backend/ai-toestemmingen';
import { cloudVoorvoegsel, metLade } from '../../backend/ruimte-cloud-agenda';
import { spiegelLeg } from '../../backend/agenda-spiegel';
import * as vn from '../../backend/notities-vnext';
import {
  bestandenVanNotitie,
  cloudBestandenKiezerLijst,
  koppelBestandAanNotitie,
  koppelNotitieAanEvent,
  koppelingenVoorEvent,
  koppelingenVoorNotitie,
  maakTaakUitNotitie,
  ontkoppelNotitieEvent,
  takenVanNotitie,
} from '../../backend/agenda-notities-brug';
import { NOTITIE_BRONNEN, notitieBron, openTakenUitChecklist, schoneInvoer } from '../../shared/notities-vnext-model';
import { taalwetOvertreding } from '../../shared/vaardigheden-ecosysteem';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(join(process.cwd(), pad), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('consol-m3-notities-agenda-brug');
  const sys = getPool('systeem');
  const mig = getPool('migratie');
  const sfx = randomBytes(4).toString('hex');

  const maakGebruiker = async (email: string) => {
    const id = randomUUID();
    await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', [
      'users',
      id,
      { email, role: 'member', status: 'approved' },
    ]);
    return id;
  };

  const userA = await maakGebruiker(`m3-brug-a-${sfx}@eenheid.test`);
  const userB = await maakGebruiker(`m3-brug-b-${sfx}@eenheid.test`);
  const ladePriveA = { userId: userA, ruimte: 'prive' as const };
  const ladeTechA = { userId: userA, ruimte: 'technisch' as const };
  const ladePriveB = { userId: userB, ruimte: 'prive' as const };

  const gemaakteRecordIds: Array<{ tbl: string; id: string }> = [];

  try {
    // 1. Ідемпотентність міграцій 0315 і 0316 та перевірка стану прапорців і FORCE RLS.
    const sql0315 = lees('migrations/0315_agenda_koppelingen_vlag.sql');
    const sql0316 = lees('migrations/0316_notities_agenda_brug.sql');
    await mig.query(sql0315);
    await mig.query(sql0315);
    await mig.query(sql0316);
    await mig.query(sql0316);
    check('міграції 0315 і 0316 виконуються двічі поспіль без помилок (ідемпотентні)', true);

    const { rows: vlaggenRijen } = await sys.query<{ sleutel: string; aan: boolean; standaard: boolean; len: number }>(
      `SELECT sleutel, aan, standaard, char_length(omschrijving)::int AS len
         FROM app.feature_flags
        WHERE sleutel IN ('agenda-koppelingen-v1', 'notities-agenda-brug-v1')`,
    );
    check(
      'обидва прапорці створені зі станом aan=false, standaard=false та описом <= 300 символів',
      vlaggenRijen.length === 2 && vlaggenRijen.every((v) => v.aan === false && v.standaard === false && v.len <= 300),
    );

    const { rows: rlsRijen } = await sys.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'app'
          AND c.relname IN ('notities', 'notities_mappen', 'notities_revisies', 'notities_agenda_koppelingen')`,
    );
    check(
      'усі 4 таблиці нотаток і прив’язок мають ENABLE та FORCE ROW LEVEL SECURITY',
      rlsRijen.length === 4 && rlsRijen.every((r) => r.relrowsecurity && r.relforcerowsecurity),
    );

    // 2. Зняття старої заглушки у NotitiesPagina.tsx та чесний стан у NOTITIE_BRONNEN.
    const paginaBron = lees('src/notities/NotitiesPagina.tsx');
    check(
      'у NotitiesPagina.tsx знято заглушку про неробочий зв’язок із Календарем обома мовами',
      !paginaBron.includes('Ще не працює — див. «Інтеграції»') && !paginaBron.includes('Werkt nog niet — zie «Integraties»'),
    );
    const kalBron = notitieBron('google-calendar');
    check(
      'запис google-calendar у NOTITIE_BRONNEN має стан koppeling без твердження про відсутність таблиці',
      Boolean(kalBron && kalBron.stand === 'koppeling' && !kalBron.wat[0].includes('Серверної таблиці відповідностей ще немає')),
    );
    check(
      'усі джерела у NOTITIE_BRONNEN дотримуються мовного закону',
      NOTITIE_BRONNEN.every((b) => !taalwetOvertreding(b.uitleg[0]) && !taalwetOvertreding(b.wat[0])),
    );

    // 3. Створення нотаток у prive та technisch і подій календаря в обох просторах.
    const schoonA = schoneInvoer({
      titel: 'Підготовка квартальної наради',
      inhoud: 'Порядок денний:\n- [ ] Узгодити кошторис\n- [x] Перевірити протокол\n- [ ] Підготувати звіт',
      soort: 'lijst',
      kleur: 'blauw',
      etiketten: ['нарада'],
    });
    if (!schoonA.ok) throw new Error(schoonA.fout);
    const notitiePriveA = await vn.notitieMaken(ladePriveA, schoonA.invoer, { auteur: 'operator' });
    if ('fout' in notitiePriveA) throw new Error(notitiePriveA.fout);

    const schoonTech = schoneInvoer({ titel: 'Технічний журнал вузла', inhoud: 'Перевірка служби', soort: 'tekst', kleur: 'grijs', etiketten: [] });
    if (!schoonTech.ok) throw new Error(schoonTech.fout);
    const notitieTechA = await vn.notitieMaken(ladeTechA, schoonTech.invoer, { auteur: 'operator' });
    if ('fout' in notitieTechA) throw new Error(notitieTechA.fout);

    const schoonB = schoneInvoer({ titel: 'Особиста нотатка іншої людини', inhoud: 'Таємний запис', soort: 'tekst', kleur: 'geel', etiketten: [] });
    if (!schoonB.ok) throw new Error(schoonB.fout);
    const notitiePriveB = await vn.notitieMaken(ladePriveB, schoonB.invoer, { auteur: 'ander' });
    if ('fout' in notitiePriveB) throw new Error(notitiePriveB.fout);

    // Додаємо подію в особистий простір користувача А і подію в особистий простір користувача Б.
    const spiegelIdA = await metLade(ladePriveA, 'agenda', () =>
      spiegelLeg(userA, {
        ownerUserId: userA,
        ruimte: 'prive',
        principalId: 'princ-a',
        calendarId: 'primary',
        calendarNaam: 'Основний',
        providerEventId: `ev-a-${sfx}`,
        iCalUID: `ev-a-${sfx}@tarasevych.com`,
        etag: '"etag-a-1"',
        status: 'confirmed',
        summary: 'Квартальна зустріч проєкту',
        description: '',
        location: 'Київ',
        start: '2026-11-28T10:00:00Z',
        end: '2026-11-28T11:00:00Z',
        heleDag: false,
        tijdzone: 'UTC',
        recurrence: '',
        attendees: [],
        organisator: '',
        htmlLink: '',
        lokaalId: '',
        updatedAt: Date.now(),
        providerUpdatedAt: Date.now(),
      }),
    );
    if (spiegelIdA) gemaakteRecordIds.push({ tbl: 'google_suite_calendar_events_v1', id: spiegelIdA });

    const spiegelIdB = await metLade(ladePriveB, 'agenda', () =>
      spiegelLeg(userB, {
        ownerUserId: userB,
        ruimte: 'prive',
        principalId: 'princ-b',
        calendarId: 'primary',
        calendarNaam: 'Основний Б',
        providerEventId: `ev-b-${sfx}`,
        iCalUID: `ev-b-${sfx}@tarasevych.com`,
        etag: '"etag-b-1"',
        status: 'confirmed',
        summary: 'Чужа подія іншого користувача',
        description: '',
        location: '',
        start: '2026-11-28T14:00:00Z',
        end: '2026-11-28T15:00:00Z',
        heleDag: false,
        tijdzone: 'UTC',
        recurrence: '',
        attendees: [],
        organisator: '',
        htmlLink: '',
        lokaalId: '',
        updatedAt: Date.now(),
        providerUpdatedAt: Date.now(),
      }),
    );
    if (spiegelIdB) gemaakteRecordIds.push({ tbl: 'google_suite_calendar_events_v1', id: spiegelIdB });

    const eventIdA = `google:primary:ev-a-${sfx}`;
    const eventIdB = `google:primary:ev-b-${sfx}`;

    // 4. Перевірка вимоги підтвердження, відсікання чужої події та повторостійкості.
    const zonderBevestiging = await koppelNotitieAanEvent(ladePriveA, {
      notitieId: notitiePriveA.id,
      eventId: eventIdA,
      idempotentieSleutel: `sleutel-geen-bev-${sfx}`,
      bevestigd: false,
    });
    check('прив’язка без підтвердження (bevestigd=false) відхиляється з BEVESTIGING_VEREIST', !zonderBevestiging.ok && zonderBevestiging.fout === 'BEVESTIGING_VEREIST');

    const vreemdEvent = await koppelNotitieAanEvent(ladePriveA, {
      notitieId: notitiePriveA.id,
      eventId: eventIdB,
      idempotentieSleutel: `sleutel-vreemd-${sfx}`,
      bevestigd: true,
    });
    check('спроба прив’язати подію іншого користувача відхиляється з EVENT_NIET_GEVONDEN', !vreemdEvent.ok && vreemdEvent.fout === 'EVENT_NIET_GEVONDEN');

    const sleutel1 = `sleutel-koppel-1-${sfx}`;
    const gekoppeld1 = await koppelNotitieAanEvent(ladePriveA, {
      notitieId: notitiePriveA.id,
      eventId: eventIdA,
      idempotentieSleutel: sleutel1,
      bevestigd: true,
    });
    const gekoppeld2 = await koppelNotitieAanEvent(ladePriveA, {
      notitieId: notitiePriveA.id,
      eventId: eventIdA,
      idempotentieSleutel: sleutel1,
      bevestigd: true,
    });
    check(
      'двостороння прив’язка noteId ↔ eventId працює та є повторостійкою за idempotentieSleutel',
      gekoppeld1.ok && gekoppeld2.ok && gekoppeld2.herhaald === true && gekoppeld1.koppeling.id === gekoppeld2.koppeling.id,
    );

    const voorNotitie = await koppelingenVoorNotitie(ladePriveA, notitiePriveA.id);
    const voorEvent = await koppelingenVoorEvent(ladePriveA, eventIdA);
    check(
      'прив’язка читається в обидва боки: і з нотатки, і з картки події з глибоким посиланням /notities?open_item_id=',
      voorNotitie.length === 1 && voorEvent.length === 1 && voorEvent[0].doelPad.includes(`open_item_id=${notitiePriveA.id}`),
    );

    // 5. Пряма перевірка FORCE RLS у ролі mijnruimte_app між користувачами А/Б та просторами prive/technisch.
    const zichtbaarVoorB = await koppelingenVoorNotitie(ladePriveB, notitiePriveA.id);
    const zichtbaarInTech = await koppelingenVoorNotitie(ladeTechA, notitiePriveA.id);
    check('ні інший користувач Б, ні технічний простір тієї самої людини не бачать особистої прив’язки', zichtbaarVoorB.length === 0 && zichtbaarInTech.length === 0);

    let rlsGeweigerd = false;
    try {
      await alsGebruiker(userB, async (q) => {
        await q("SELECT set_config('app.ruimte', 'prive', true)");
        await q(
          `INSERT INTO app.notities_agenda_koppelingen (user_id, ruimte, notitie_id, event_id, idempotentie_sleutel)
           VALUES ($1, 'prive', $2::uuid, $3, $4)`,
          [userA, notitiePriveA.id, eventIdA, `rls-aanval-${sfx}`],
        );
      });
    } catch {
      rlsGeweigerd = true;
    }
    check('FORCE ROW LEVEL SECURITY блокує прямий запис під чужим user_id у ролі mijnruimte_app', rlsGeweigerd);

    // 6. Перетворення невиконаних пунктів списку нотатки на завдання простору зі зворотним посиланням bronNotitie.
    const openPunten = openTakenUitChecklist(notitiePriveA.inhoud);
    check('openTakenUitChecklist виділяє рівно 2 невиконані пункти списку', openPunten.length === 2 && openPunten[0] === 'Узгодити кошторис');

    const taakUit = await maakTaakUitNotitie(ladePriveA, {
      notitieId: notitiePriveA.id,
      uitChecklist: true,
      actor: 'operator',
    });
    check('створено 2 завдання простору зі списку нотатки', taakUit.ok && taakUit.aangemaakt.length === 2);
    if (taakUit.ok) {
      const gelezenTaken = await takenVanNotitie(ladePriveA, taakUit.takenIds);
      const { rows: bordTaken } = await sys.query<{ body: string; ruimte: string }>(
        `SELECT body, ruimte FROM app.mcp_console_items WHERE id = $1::uuid`,
        [taakUit.takenIds[0]],
      );
      check(
        'завдання містить зворотне посилання bronNotitie з open_item_id на вихідну нотатку в тому самому просторі',
        gelezenTaken.length === 2 && Boolean(bordTaken[0]?.body.includes(`bronNotitie: /notities?open_item_id=${notitiePriveA.id}`)) && bordTaken[0]?.ruimte === 'prive',
      );
    }

    // 7. Прикріплення файла зі Сховища cloud-vnext без дублювання байтів зі збереженням синхронного дзеркала.
    const [cloudBestandId] = await db.add('cloud_items_v1', [
      {
        ownerUserId: userA,
        ruimte: 'prive',
        workspaceId: '',
        suggestedWorkspaceId: '',
        kind: 'file',
        title: 'Кошторис-зустрічі.pdf',
        originalName: 'Кошторис-зустрічі.pdf',
        description: '',
        textContent: '',
        sourceUrl: '',
        mimeType: 'application/pdf',
        sizeBytes: 8192,
        storagePath: `${cloudVoorvoegsel(ladePriveA)}/1700000000-koshtorys.pdf`,
        tags: [],
        people: [],
        status: 'captured',
        aiState: 'fallback',
        aiConfidence: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        openedAt: 0,
        mapId: null,
        favoriet: false,
        verwijderdOp: null,
        versies: [],
        sha256: 'a'.repeat(64),
        bron: 'upload',
      },
    ]);
    if (cloudBestandId) gemaakteRecordIds.push({ tbl: 'cloud_items_v1', id: cloudBestandId });

    const kiezerPrive = await cloudBestandenKiezerLijst(ladePriveA, 'Кошторис');
    const kiezerB = await cloudBestandenKiezerLijst(ladePriveB, 'Кошторис');
    check(
      'пошук файлів Сховища знаходить власний файл користувача А і не розкриває його користувачеві Б',
      kiezerPrive.bestanden.some((b) => b.id === cloudBestandId) && kiezerB.bestanden.length === 0,
    );

    const aantalCloudItemsVoor = Number(
      (await sys.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl = 'cloud_items_v1' AND data->>'ownerUserId' = $1`, [userA])).rows[0].n,
    );
    const bestandKoppelUit = await koppelBestandAanNotitie(ladePriveA, {
      notitieId: notitiePriveA.id,
      bestandId: cloudBestandId,
      actie: 'koppel',
    });
    const aantalCloudItemsNa = Number(
      (await sys.query(`SELECT count(*)::int AS n FROM app.records WHERE tbl = 'cloud_items_v1' AND data->>'ownerUserId' = $1`, [userA])).rows[0].n,
    );
    const spiegelNaBestand = (
      await sys.query(`SELECT id, kind, title FROM app.mcp_console_items WHERE id = $1::uuid AND user_id = $2`, [notitiePriveA.id, userA])
    ).rows[0];
    check(
      'файл Сховища прикріплено за посиланням без створення копії запису та зі збереженням дзеркала app.mcp_console_items',
      bestandKoppelUit.ok &&
        bestandKoppelUit.bestanden.length === 1 &&
        bestandKoppelUit.bestanden[0].doelPad.includes(`open_item_id=${cloudBestandId}`) &&
        aantalCloudItemsVoor === aantalCloudItemsNa &&
        spiegelNaBestand?.kind === 'note',
    );

    const gelezenBestanden = await bestandenVanNotitie(ladePriveA, [String(cloudBestandId)]);
    check('метадані прикріпленого файла читаються без звернення до фізичних байтів диска', gelezenBestanden.length === 1 && gelezenBestanden[0].naam === 'Кошторис-зустрічі.pdf');

    // Від’єднання події календаря
    const los = await ontkoppelNotitieEvent(ladePriveA, { notitieId: notitiePriveA.id, eventId: eventIdA });
    check('від’єднання події чисто прибирає запис із таблиці прив’язок', los && (await koppelingenVoorNotitie(ladePriveA, notitiePriveA.id)).length === 0);
  } finally {
    for (const r of gemaakteRecordIds) {
      await db.delete(r.tbl, [r.id]).catch(() => undefined);
    }
    await sys.query('DELETE FROM app.notities WHERE user_id IN ($1, $2)', [userA, userB]).catch(() => undefined);
    await sys.query('DELETE FROM app.mcp_console_items WHERE user_id IN ($1, $2)', [userA, userB]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id IN ($1, $2)", [userA, userB]).catch(() => undefined);
    await closePool().catch(() => undefined);
  }

  return einde();
}
