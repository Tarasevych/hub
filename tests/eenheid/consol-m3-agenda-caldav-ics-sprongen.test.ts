// Випробування Віхи M3 (Блок Б — Частина 2): Генератор .ics (RFC 5545), двосторонній запис CalDAV (PUT/DELETE з If-Match/If-None-Match)
// та безвмістові переходи з картки події до Пошти й Контактів без розкриття електронної адреси в URL.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../server/platform';
import { closePool, getPool } from '../../server/platform/pg';
import { metLade } from '../../backend/ruimte-cloud-agenda';
import { caldavKoppelen, zetCaldavVerzoekerVoorTest, type CaldavVerzoek } from '../../backend/agenda-caldav';
import {
  caldavBewaarGebeurtenis,
  caldavControleerSchrijfrecht,
  caldavWisGebeurtenis,
  zetAgendaKoppelingenVlagVoorTest,
  zetCaldavSchrijfVerzoekerVoorTest,
  type CaldavSchrijfVerzoek,
} from '../../backend/agenda-caldav-schrijven';
import { agendaItems } from '../../backend/agenda-spiegel';
import { leesEnWisContactSprong, maakDeelnemerSprong } from '../../backend/agenda-notities-brug';
import { bouwIcsGebeurtenis, ontleedIcs, vouwIcsRegel } from '../../shared/agenda-ics-model';
import { caldavAbsoluut, heeftCaldavSchrijfrecht } from '../../shared/agenda-caldav-model';
import { privateAddress } from '../../backend/veilige-fetch';
import { checker } from './hulp/nep-google';
import { nepGeheim } from './hulp/nep-geheim';

const lees = (pad: string) => readFileSync(join(process.cwd(), pad), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('consol-m3-agenda-caldav-ics-sprongen');
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

  const userA = await maakGebruiker(`m3-caldav-a-${sfx}@eenheid.test`);
  const userB = await maakGebruiker(`m3-caldav-b-${sfx}@eenheid.test`);
  const ladePriveA = { userId: userA, ruimte: 'prive' as const };
  const ladeTechA = { userId: userA, ruimte: 'technisch' as const };

  try {
    await mig.query(lees('migrations/0315_agenda_koppelingen_vlag.sql'));

    // 1. Круговий цикл bouwIcsGebeurtenis ↔ ontleedIcs за RFC 5545 для всіх форм входу та UTF-8 згортання рядків.
    const langeTitel = 'Перевіркова зустріч архітектурної консолідації екосистеми Мій простір з дуже довгою українською назвою для перевірки згортання рядків за стандартом';
    const ics1 = bouwIcsGebeurtenis({
      uid: `ics-rond-${sfx}@tarasevych.com`,
      titel: langeTitel,
      beschrijving: 'Перший рядок; другий рядок, з комою\\та скісною рискою\nТретій рядок',
      locatie: 'Київ, вул. Хрещатик; зал 2',
      begin: '2026-11-29T10:00:00Z',
      einde: '2026-11-29T11:30:00Z',
      heleDag: false,
      tijdzone: 'UTC',
      rrule: 'RRULE:FREQ=WEEKLY;COUNT=4',
      organisator: 'eigenaar@tarasevych.com',
    });

    const regels = ics1.split('\r\n').filter(Boolean);
    check(
      'кожен згорнутий рядок .ics за RFC 5545 займає не більше 75 байтів UTF-8 і не містить розірваних сурогатів',
      regels.every((r) => Buffer.byteLength(r, 'utf8') <= 75 && !/[\uD800-\uDFFF]/.test(r)),
    );

    const ontleed1 = ontleedIcs(ics1);
    check(
      'ontleedIcs() безпомилково відновлює довгу українську назву, багаторядковий опис із комами й крапкою з комою та RRULE',
      ontleed1.gebeurtenissen.length === 1 &&
        ontleed1.gebeurtenissen[0].titel === langeTitel &&
        ontleed1.gebeurtenissen[0].beschrijving === 'Перший рядок; другий рядок, з комою\\та скісною рискою\nТретій рядок' &&
        ontleed1.gebeurtenissen[0].locatie === 'Київ, вул. Хрещатик; зал 2' &&
        ontleed1.gebeurtenissen[0].rrule === 'RRULE:FREQ=WEEKLY;COUNT=4',
    );

    // Цілоденна подія (ексклюзивний DTEND у .ics ↔ інклюзивний einde у моделі)
    const icsHeleDag = bouwIcsGebeurtenis(
      [
        {
          uid: `heledag-${sfx}@tarasevych.com`,
          titel: 'День відновлення',
          begin: '2026-12-05',
          einde: '2026-12-06',
          heleDag: true,
        },
      ],
      'Свята',
    );
    const ontleedHeleDag = ontleedIcs(icsHeleDag);
    check(
      'цілоденна подія зберігає інклюзивний кінець після кругового перетворення bouwIcsGebeurtenis → ontleedIcs',
      ontleedHeleDag.naam === 'Свята' &&
        ontleedHeleDag.gebeurtenissen[0]?.heleDag === true &&
        ontleedHeleDag.gebeurtenissen[0]?.begin === '2026-12-05' &&
        ontleedHeleDag.gebeurtenissen[0]?.einde === '2026-12-06',
    );

    // Перевірка згортання рядка з кирилицею рівно на межі 75 октетів
    const gevouwen = vouwIcsRegel(`SUMMARY:${'Ї'.repeat(60)}`);
    check(
      'vouwIcsRegel ніколи не розрізає двобайтову літеру Ї посередині',
      gevouwen.split('\r\n').every((deel) => Buffer.byteLength(deel, 'utf8') <= 75) && gevouwen.replace(/\r\n /g, '') === `SUMMARY:${'Ї'.repeat(60)}`,
    );

    // 2. Перевірка захисту від підроблення серверних запитів (SSRF) та прав CalDAV.
    check(
      'caldavAbsoluut відхиляє сторонній хост та небезпечні схеми, дозволяючи лише той самий хост https',
      caldavAbsoluut('https://caldav.fastmail.com/dav/', 'https://boosdoener.example.net/stelen.ics') === '' &&
        caldavAbsoluut('https://caldav.fastmail.com/dav/', 'http://caldav.fastmail.com/dav/a.ics') === '' &&
        caldavAbsoluut('https://caldav.fastmail.com/dav/', '/dav/calendars/user/werk/item.ics') === 'https://caldav.fastmail.com/dav/calendars/user/werk/item.ics',
    );
    check('privateAddress у veilige-fetch блокує локальні та внутрішні адреси', privateAddress('127.0.0.1') && privateAddress('169.254.169.254'));
    check(
      'heeftCaldavSchrijfrecht розрізняє колекцію з правом запису та колекцію лише для читання',
      heeftCaldavSchrijfrecht('<d:multistatus xmlns:d="DAV:"><d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set></d:multistatus>') === false &&
        heeftCaldavSchrijfrecht('<d:multistatus xmlns:d="DAV:"><d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set></d:multistatus>') === true,
    );

    // 3. Підключення тестового облікового запису CalDAV та повний життєвий цикл двостороннього запису PUT / 412 / DELETE.
    const nepWachtwoord = nepGeheim('caldav-app-', 'proef-sleutel-2026');
    const agendaUrl = 'https://caldav.fastmail.com/dav/calendars/user/werk/';

    zetCaldavVerzoekerVoorTest(async (v: CaldavVerzoek) => {
      if (v.url === 'https://caldav.fastmail.com/dav/') {
        return new Response('<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/dav/principals/user/</d:href></d:current-user-principal></d:prop></d:propstat></d:response></d:multistatus>', { status: 207 });
      }
      if (v.url.endsWith('/principals/user/')) {
        return new Response('<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/dav/principals/user/</d:href><d:propstat><d:prop><c:calendar-home-set><d:href>/dav/calendars/user/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>', { status: 207 });
      }
      return new Response(
        `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>/dav/calendars/user/werk/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Робочий CalDAV</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:propstat></d:response></d:multistatus>`,
        { status: 207 },
      );
    });

    const gekoppeld = await metLade(ladePriveA, 'agenda', () =>
      caldavKoppelen(userA, {
        adres: 'https://caldav.fastmail.com/dav/',
        gebruikersnaam: 'eigenaar@fastmail.com',
        wachtwoord: nepWachtwoord,
        naam: 'Fastmail перевірка',
      }),
    );
    if (!gekoppeld.ok) throw new Error(gekoppeld.fout);
    const accountId = gekoppeld.account.id;

    // Поки прапорець вимкнений — запис відхиляється з CALDAV_VLAG_UIT.
    zetAgendaKoppelingenVlagVoorTest(async () => false);
    const geweigerdDoorVlag = await metLade(ladePriveA, 'agenda', () =>
      caldavBewaarGebeurtenis(userA, {
        sleutel: `caldav-uit-${sfx}`,
        accountId,
        agendaUrl,
        vorm: { titel: 'Тест', heleDag: false, begin: '2026-11-30T09:00', einde: '2026-11-30T10:00', tijdzone: 'Europe/Kyiv' },
      }),
    );
    check('при вимкненому прапорці agenda-koppelingen-v1 запис у CalDAV заблокований (CALDAV_VLAG_UIT)', !geweigerdDoorVlag.ok && geweigerdDoorVlag.fout === 'CALDAV_VLAG_UIT');

    // Вмикаємо прапорець для перевірки двостороннього запису.
    zetAgendaKoppelingenVlagVoorTest(async () => true);

    let toestaatSchrijven = true;
    const opgeslagenOpServer = new Map<string, { etag: string; ics: string }>();
    const gezieneVerzoeken: CaldavSchrijfVerzoek[] = [];

    zetCaldavSchrijfVerzoekerVoorTest(async (v: CaldavSchrijfVerzoek) => {
      gezieneVerzoeken.push(v);
      if (v.methode === 'PROPFIND') {
        const xml = toestaatSchrijven
          ? '<d:multistatus xmlns:d="DAV:"><d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set></d:multistatus>'
          : '<d:multistatus xmlns:d="DAV:"><d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set></d:multistatus>';
        return new Response(xml, { status: 207 });
      }
      if (v.methode === 'PUT') {
        if (!toestaatSchrijven) return new Response('Forbidden', { status: 403 });
        const bestaand = opgeslagenOpServer.get(v.url);
        if (v.koppen['If-None-Match'] === '*' && bestaand) return new Response('Precondition Failed', { status: 412 });
        if (v.koppen['If-Match'] && bestaand && v.koppen['If-Match'] !== bestaand.etag) {
          return new Response('Precondition Failed', { status: 412 });
        }
        const nieuweEtag = `"etag-${opgeslagenOpServer.size + 1}-${gezieneVerzoeken.length}"`;
        opgeslagenOpServer.set(v.url, { etag: nieuweEtag, ics: v.lichaam || '' });
        return new Response(null, { status: bestaand ? 204 : 201, headers: { ETag: nieuweEtag } });
      }
      if (v.methode === 'GET') {
        const cur = opgeslagenOpServer.get(v.url);
        if (!cur) return new Response('Not Found', { status: 404 });
        return new Response(cur.ics, { status: 200, headers: { ETag: cur.etag } });
      }
      if (v.methode === 'DELETE') {
        const cur = opgeslagenOpServer.get(v.url);
        if (!cur) return new Response('Not Found', { status: 404 });
        if (v.koppen['If-Match'] && v.koppen['If-Match'] !== cur.etag) return new Response('Precondition Failed', { status: 412 });
        opgeslagenOpServer.delete(v.url);
        return new Response(null, { status: 204 });
      }
      return new Response('', { status: 400 });
    });

    // Перевірка відмови при календарі лише для читання
    toestaatSchrijven = false;
    const proefGeenRecht = await metLade(ladePriveA, 'agenda', () => caldavControleerSchrijfrecht(userA, accountId, agendaUrl));
    check('календар CalDAV без права write чесно повертає CALDAV_GEEN_SCHRIJFRECHT', !proefGeenRecht.ok && proefGeenRecht.fout === 'CALDAV_GEEN_SCHRIJFRECHT');

    // Успішне створення події (PUT з If-None-Match: *) та повторостійкість
    toestaatSchrijven = true;
    const maakSleutel = `caldav-maak-${sfx}`;
    const gemaakt1 = await metLade(ladePriveA, 'agenda', () =>
      caldavBewaarGebeurtenis(userA, {
        sleutel: maakSleutel,
        accountId,
        agendaUrl,
        vorm: {
          titel: 'Зустріч у зовнішньому CalDAV',
          beschrijving: 'Перевірка PUT',
          locatie: 'Амстердам',
          heleDag: false,
          begin: '2026-12-01T14:00',
          einde: '2026-12-01T15:00',
          tijdzone: 'Europe/Amsterdam',
        },
        organisatorEmail: 'eigenaar@fastmail.com',
      }),
    );
    const aantalPutNa1 = gezieneVerzoeken.filter((x) => x.methode === 'PUT').length;
    const gemaaktHerhaald = await metLade(ladePriveA, 'agenda', () =>
      caldavBewaarGebeurtenis(userA, {
        sleutel: maakSleutel,
        accountId,
        agendaUrl,
        vorm: {
          titel: 'Зустріч у зовнішньому CalDAV',
          heleDag: false,
          begin: '2026-12-01T14:00',
          einde: '2026-12-01T15:00',
          tijdzone: 'Europe/Amsterdam',
        },
      }),
    );
    const aantalPutNa2 = gezieneVerzoeken.filter((x) => x.methode === 'PUT').length;
    check(
      'створення події CalDAV надсилає PUT із If-None-Match: *, зберігає ETag, а повтор із тим самим ключем не дублює PUT',
      gemaakt1.ok &&
        Boolean(gemaakt1.etag) &&
        gemaaktHerhaald.ok &&
        aantalPutNa1 === 1 &&
        aantalPutNa2 === 1 &&
        gezieneVerzoeken.some((x) => x.methode === 'PUT' && x.koppen['If-None-Match'] === '*'),
    );

    // Перевірка, що зовнішнє дзеркало зберігає schrijfbaar: false у базовій проєкції, але передає caldavHref/caldavEtag
    const spiegelOverzicht = await metLade(ladePriveA, 'agenda', () =>
      agendaItems(userA, {
        schrijfbaar: true,
        naamVan: () => ({ naam: 'Робочий CalDAV', bron: 'caldav' }),
      }),
    );
    const caldavItem = spiegelOverzicht.items.find((i) => i.caldavUid === gemaakt1.gebeurtenisId);
    check(
      'подія CalDAV присутня у дзеркалі з bronHref та etag і не ламає інваріант schrijfbaar===false базової проєкції',
      Boolean(caldavItem && caldavItem.schrijfbaar === false && caldavItem.caldavEtag === gemaakt1.etag && caldavItem.caldavHref === gemaakt1.bronHref),
    );

    // Імітуємо зовнішню зміну події на сервері CalDAV → клієнт зі старим ETag отримує 412 AGENDA_CONFLICT зі свіжою версією!
    opgeslagenOpServer.set(gemaakt1.bronHref!, {
      etag: '"etag-extern-nieuw"',
      ics: bouwIcsGebeurtenis({
        uid: gemaakt1.gebeurtenisId!,
        titel: 'Оновлена на іншому пристрої назва',
        begin: '2026-12-01T16:00:00Z',
        einde: '2026-12-01T17:00:00Z',
        heleDag: false,
        tijdzone: 'UTC',
      }),
    });

    const conflictUit = await metLade(ladePriveA, 'agenda', () =>
      caldavBewaarGebeurtenis(userA, {
        sleutel: `caldav-conflict-${sfx}`,
        accountId,
        agendaUrl,
        uid: gemaakt1.gebeurtenisId,
        bronHref: gemaakt1.bronHref,
        etag: gemaakt1.etag, // старий ETag!
        vorm: {
          titel: 'Локальна спроба поверх чужої',
          heleDag: false,
          begin: '2026-12-01T14:30',
          einde: '2026-12-01T15:30',
          tijdzone: 'Europe/Amsterdam',
        },
      }),
    );
    check(
      'конфлікт версій 412 Precondition Failed не перезаписує подію на сервері, а повертає AGENDA_CONFLICT зі свіжою назвою',
      !conflictUit.ok &&
        conflictUit.uitslag === 'conflict' &&
        conflictUit.fout === 'AGENDA_CONFLICT' &&
        conflictUit.google?.titel === 'Оновлена на іншому пристрої назва',
    );

    // Видалення зі свіжим ETag (DELETE + If-Match)
    const gewist = await metLade(ladePriveA, 'agenda', () =>
      caldavWisGebeurtenis(userA, {
        sleutel: `caldav-wis-${sfx}`,
        accountId,
        agendaUrl,
        uid: gemaakt1.gebeurtenisId!,
        bronHref: gemaakt1.bronHref,
        etag: '"etag-extern-nieuw"',
      }),
    );
    check('DELETE зі свіжим If-Match видаляє ресурс на сервері та прибирає подію із зовнішнього дзеркала', gewist.ok && opgeslagenOpServer.size === 0);

    // 4. Безвмістові переходи з картки події до листів та контакту учасника (нуль електронної пошти в URL!).
    const deelnemerEmail = 'deelnemer.proef@example.org';
    const mailSprong = await maakDeelnemerSprong(ladePriveA, deelnemerEmail, 'mail');
    check(
      'перехід до листів учасника повертає безвмістовий шлях /all?resume_context=1 без електронної пошти в URL',
      mailSprong.ok && mailSprong.doel === 'mail' && mailSprong.pad === '/all?resume_context=1' && !mailSprong.pad.includes(deelnemerEmail),
    );

    const contactSprong = await maakDeelnemerSprong(ladePriveA, deelnemerEmail, 'contact');
    check(
      'перехід до контакту учасника повертає одноразовий UUID-квиток у шляху без електронної пошти в URL',
      contactSprong.ok &&
        contactSprong.doel === 'contact' &&
        !contactSprong.pad.includes(deelnemerEmail) &&
        !contactSprong.pad.includes('@'),
    );

    if (contactSprong.ok && contactSprong.doel === 'contact') {
      const pogingAnderAccount = await leesEnWisContactSprong(userB, 'prive', contactSprong.sprongId);
      const pogingAndereRuimte = await leesEnWisContactSprong(userA, 'technisch', contactSprong.sprongId);
      check('чужий користувач Б та інший простір technisch не можуть обміняти квиток контакту (і не знищують його)', !pogingAnderAccount.ok && !pogingAndereRuimte.ok);

      const eersteInwissel = await leesEnWisContactSprong(userA, 'prive', contactSprong.sprongId);
      const tweedeInwissel = await leesEnWisContactSprong(userA, 'prive', contactSprong.sprongId);
      check(
        'власник у своєму просторі отримує точну адресу учасника з квитка рівно один раз (повторне читання відхиляється)',
        eersteInwissel.ok && eersteInwissel.adres === deelnemerEmail && !tweedeInwissel.ok,
      );
    }

    const techZietCaldavPrive = await metLade(ladeTechA, 'agenda', () =>
      caldavControleerSchrijfrecht(userA, accountId, agendaUrl),
    );
    check('технічний простір не бачить обліковий запис CalDAV особистого простору', !techZietCaldavPrive.ok && techZietCaldavPrive.fout === 'CALDAV_ACCOUNT_ONBEKEND');
  } finally {
    zetCaldavVerzoekerVoorTest(null);
    zetCaldavSchrijfVerzoekerVoorTest(null);
    zetAgendaKoppelingenVlagVoorTest(null);
    await sys.query('DELETE FROM app.agenda_externe_gebeurtenis WHERE user_id IN ($1, $2)', [userA, userB]).catch(() => undefined);
    await sys.query('DELETE FROM app.agenda_abonnement WHERE user_id IN ($1, $2)', [userA, userB]).catch(() => undefined);
    await sys.query('DELETE FROM app.agenda_koppeling WHERE user_id IN ($1, $2)', [userA, userB]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl IN ('cognitive_resume_context_v1', 'agenda_contact_sprong_v1') AND data->>'ownerUserId' IN ($1, $2)", [userA, userB]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id IN ($1, $2)", [userA, userB]).catch(() => undefined);
    await closePool().catch(() => undefined);
  }

  return einde();
}
