// План стирання акаунта (блок 8). Лише текст SQL. Виконання — backend/account-wissen.ts.
const NAAM = /^[a-z_][a-z0-9_]*$/;
export const STANDAARD_KOLOM = ['owner_id', 'user_id', 'account_id'] as const;

export type WisTabel = { schema: string; tabel: string; kolommen: string[]; uuidKolommen?: string[] };
/** `tel` — лише для «сухого» підрахунку (accountWisTelling), коли sql не DELETE (UPDATE відв’язування). */
export type WisOpdracht = { sql: string; params: string[]; tel?: string };

/**
 * Таблиці app, де рядок явно належить акаунту, але колонка називається інакше
 * (імена з міграцій, не вигадані).
 */
export const EXTRA_WIS: WisTabel[] = [
  { schema: 'app', tabel: 'invites', kolommen: ['created_by'] },
  { schema: 'app', tabel: 'ondersteuning_verzoeken', kolommen: ['aanvrager_id', 'doel_id'] },
  { schema: 'app', tabel: 'impersonatie_sessies', kolommen: ['beheerder_id', 'doel_id'] },
  { schema: 'app', tabel: 'uitrol_github_instellingen', kolommen: ['eigenaar_id'] },
  // SEC-002 (slot-z, 13.11.2026): door_user_id — хто запросив до оселі (0212). Запрошення від стертої людини нікому не потрібне:
  // приймати його вже не можна (huis-vnext.ts звіряє door_user_id з власником оселі), а рядок несе її id. Видаляємо.
  // De uitnodiging VAN een gewiste persoon is dood (aanvaarden eist dat door_user_id nog eigenaar is) en draagt haar id: weg.
  { schema: 'app', tabel: 'huis_uitnodigingen', kolommen: ['door_user_id'] },
];

/**
 * SEC-002 (slot-z): колонка з назвою, схожою на колонку акаунта, але в ЦІЙ таблиці вона про інше. Лише для названої таблиці:
 * в інших таблицях та сама назва (doel_id) — справжній id людини й стирається.
 * Kolom met een accountachtige naam die in DEZE tabel iets anders betekent (alleen voor die tabel).
 */
export const GEEN_ACCOUNT_KOLOM: Record<string, Record<string, string>> = {
  cloud_deel_koppelingen: {
    doel_id: 'id файла, теки чи вибірки, яку поширює посилання (0210), не id людини / id van het gedeelde bestand of de map, geen account',
  },
};

/**
 * SEC-002 (slot-z): рядок належить ІНШІЙ людині, але несе дані того, кого стирають. Не видаляємо чужий рядок — відв’язуємо
 * (UPDATE … WHERE …, завжди з $1 = id того, кого стирають). `kolommen` — колонки акаунта, які це відв’язування покриває
 * замість DELETE. Rij van IEMAND ANDERS met gegevens van de gewiste persoon: niet weg, wel losgekoppeld.
 */
/** `veld` — колонка, яку змінює UPDATE: за нею план знаходить таблицю й тоді, коли колонки облікового запису в ній немає
 *  (журнал оселі, спільний прапорець). De kolom die de UPDATE wijzigt; zo vindt het plan ook tabellen zonder accountkolom. */
export type Ontkoppeling = { schema: 'app'; tabel: string; veld: string; kolommen: string[]; zet: string; waar: string; reden: string };
export const ONTKOPPELEN: Ontkoppeling[] = [
  {
    // Запрошення до ЧУЖОЇ оселі, адресоване тому, кого стирають. DELETE зробив би видно власнику оселі, що за цією адресою
    // БУВ обліковий запис (рядок зник би з його списку) — саме це 0212 закриває. Тому рядок стає таким, як запрошення на адресу
    // без облікового запису (як у uitnodigingKoppelen: user_id = NULL), і просто спливає за 14 днів. Адресу ввів власник оселі.
    // Uitnodiging AAN de gewiste persoon: geen DELETE (dan zag de eigenaar van de woning dat er een account was), maar terug
    // naar «adres zonder account» — ook afwijzing en meldtijd weg; de uitnodiging verloopt vanzelf.
    schema: 'app', tabel: 'huis_uitnodigingen', veld: 'user_id', kolommen: ['user_id'],
    zet: 'user_id = NULL, afgewezen_op = NULL, gemeld_op = NULL', waar: 'user_id = $1',
    reden: 'запрошення від власника оселі на адресу; той, кого стирають, лише адресат',
  },
  {
    // Посилання ІНШОЇ людини «для облікових записів», де той, кого стирають, — одержувач: у JSON лишалися його id та ім’я.
    // Адресу (ontvanger_emails, email) ввів власник посилання — лишається; id та ім’я прибираємо, geregistreerd = false.
    // Deellink van iemand anders met de gewiste persoon als ontvanger: userId en naam uit de JSON, het adres blijft.
    schema: 'app', tabel: 'cloud_deel_koppelingen', veld: 'ontvangers', kolommen: [],
    zet: "ontvangers = COALESCE((SELECT jsonb_agg(CASE WHEN o->>'userId' = $1 THEN jsonb_build_object('email', o->'email', 'geregistreerd', false) ELSE o END ORDER BY n) FROM jsonb_array_elements(ontvangers) WITH ORDINALITY AS x(o, n)), '[]'::jsonb)",
    waar: "user_id <> $1 AND ontvangers @> jsonb_build_array(jsonb_build_object('userId', $1::text))",
    reden: 'одержувач у чужому посиланні: id та ім’я з JSON прибрано, адреса лишається власнику посилання',
  },
  {
    // SEC-002 (slot-z, продовження): журнал ЧУЖОЇ оселі (0128). Події «учасника додано / прибрано / роль змінено / запрошення
    // прийнято / вийшов сам» (backend/huis-vnext.ts) несуть у gegevens.userId id людини. Рядок належить оселі (woning_id, без
    // колонки облікового запису), тож стандартне стирання його не бачило. Подію НЕ видаляємо (це журнал власника оселі, текст
    // події без імен), прибираємо лише id цієї людини та, про всяк випадок, її ім’я й адресу з того самого об’єкта. Події власної
    // оселі того, кого стирають, ідуть каскадом разом з оселею.
    // Logboek van een ANDERE woning: gebeurtenis blijft, alleen userId (en eventueel naam/email) van de gewiste persoon gaat weg.
    schema: 'app', tabel: 'huis_gebeurtenissen', veld: 'gegevens', kolommen: [],
    zet: "gegevens = gegevens - ARRAY['userId', 'naam', 'email']",
    waar: "gegevens->>'userId' = $1",
    reden: 'подія в журналі чужої оселі: лишається, з gegevens прибрано id (та ім’я/адресу) того, кого стирають',
  },
  {
    // SEC-002 (slot-z, продовження): спільний прапорець функції (0038) з адресним увімкненням — масив gebruikers містить id людей.
    // Рядок прапорця сайту не видаляємо; прибираємо з масиву лише id того, кого стирають. На те, чи прапорець «для всіх»,
    // масив не впливає (voorIedereen у backend/vlaggen.ts), тож охоплення не розширюється.
    // Gedeelde vlag: alleen het id van de gewiste persoon uit gebruikers; de vlag zelf en de andere ids blijven.
    schema: 'app', tabel: 'feature_flags', veld: 'gebruikers', kolommen: [],
    zet: 'gebruikers = array_remove(gebruikers, $1::text)',
    waar: '$1::text = ANY(gebruikers)',
    reden: 'спільний прапорець сайту: з адресного списку gebruikers прибрано id того, кого стирають, прапорець лишається',
  },
];

/** Не стираємо цілим DELETE: окремий шлях або це не рядок акаунта. */
export const WIS_UITZONDERING: Record<string, string> = {
  users: 'надгробок без персональних даних у wisRecordsVanAccount, не DELETE',
  records: 'JSON-рядки й файли стирає wisRecordsVanAccount; owner_id додано в 0003',
  audit: 'append-only: DELETE лише через app.audit_verwijderen; actor_id чужого ланцюга не чіпаємо',
  audit_kop: 'голова геш-ланцюга app.audit (seq, hash, без персональних даних); rechten.sql забороняє DELETE для mijnruimte_system',
  audit_beheerders: 'root-список адміністраторів аудиту (db-rollen-instellen.sh); rechten.sql забороняє DELETE для mijnruimte_system',
  feature_flags: 'gewijzigd_door — підпис на спільному рядку ваги; id того, кого стирають, з масиву gebruikers прибирає ONTKOPPELEN (slot-z)',
  ai_site_schakelaars: 'gewijzigd_door на спільному перемикачі сайту',
  merk_bron_instelling: 'gewijzigd_door на спільному налаштуванні',
  beveiliging_schakelaars: 'door_id — хто востаннє перемкнув захист сайту',
  integratie_beleid: 'bijgewerkt_door на політиці сайту; voor_gebruikers — boolean',
  integratie_controles: 'door — журнал перевірок сайту',
  diagnostiek_uitslagen: 'door — журнал діагностики сайту',
  uitrol_github_publicaties: 'door — «automatisch» або пошта в спільному журналі релізів',
  uitrol_runs: 'спільний журнал викладів сайту; goedgekeurd_door — підпис, не рядок акаунта',
  ai_media_generator: 'bijgewerkt_door на спільному налаштуванні генератора',
  extensie_beleid: 'user_id стирається стандартно; gewijzigd_door — хто змінив політику',
  extensie_matrix: 'user_id стирається стандартно; gewijzigd_door — хто змінив матрицю',
  tg_instellingen: 'door — хто востаннє змінив спільні налаштування входу через Telegram (рядок сайту, не облікового запису); прив’язки, коди й запити стираються стандартно за user_id',
  // APPARAAT-001: zelfde patroon als tg_instellingen — 'door' is wie de site-instelling het laatst wijzigde; verzoeken en voorkeuren gaan standaard weg via user_id.
  apparaat_instellingen: 'door — хто востаннє змінив спільні налаштування підтвердження з іншого пристрою (рядок сайту, не облікового запису); запити й уподобання стираються стандартно за user_id',
  aanmeld_plaatsing: 'door — хто востаннє змінив розміщення способів входу на сторінці входу (рядок сайту, не облікового запису)',
  cloud_provider_policy_audit_m6: 'append-only журнал політики хмарних провайдерів сайту (actor_id власника, без DELETE)',
};

const OVERSLAAN = new Set(['users', 'records', 'audit', 'audit_kop', 'audit_beheerders']);
/** SEC-002 (slot-z): EXTRA-колонки лише своєї таблиці (раніше — спільна множина на всі таблиці: doel_id з ondersteuning_verzoeken
 * потрапив би в OR для cloud_deel_koppelingen, де doel_id — id файла). */
const extraVan = (schema: string, tabel: string) => new Set(EXTRA_WIS.filter((e) => e.schema === schema && e.tabel === tabel).flatMap((e) => e.kolommen));
const ontkoppelVan = (schema: string, tabel: string) => ONTKOPPELEN.filter((o) => o.schema === schema && o.tabel === tabel);
const geenAccount = (tabel: string, kolom: string) => Boolean(GEEN_ACCOUNT_KOLOM[tabel]?.[kolom]);

/** Колонка з id людини, але це не «свій рядок»: чужий журнал або підпис на спільному стані. */
export const NIET_EIGEN_KOLOM = ['actor_id', 'gewijzigd_door', 'bijgewerkt_door', 'door_id', 'door', 'beeindigd_door', 'ingetrokken_door', 'besluit_door', 'goedgekeurd_door', 'toegekend_door', 'besloten_door', 'gelezen_door', 'gekozen_door', 'bevestigd_door', 'ongedaan_door', 'verbonden_door', 'geverifieerd_door', 'gegeven_door', 'beslist_door'] as const;

export const ACCOUNT_KOLOM = /^(owner_id|user_id|account_id|created_by|aanvrager_id|doel_id|beheerder_id|eigenaar_id|owner_key|actor_id|door_id|gewijzigd_door|bijgewerkt_door|door|beeindigd_door|ingetrokken_door|besluit_door|goedgekeurd_door|toegekend_door|besloten_door|gelezen_door|gekozen_door|bevestigd_door|ongedaan_door|verbonden_door|geverifieerd_door|gegeven_door|beslist_door|door_user_id)$/;

const expressie = (t: WisTabel, kolom: string) =>
  kolom === 'eigenaar_id' || (t.tabel === 'agent_namens_sessies' && kolom === 'user_id') || t.uuidKolommen?.includes(kolom)
    ? `${kolom}::text`
    : kolom;

/**
 * Один DELETE на таблицю, завжди з WHERE на id цього акаунта. users, records і audit — окремо.
 * SEC-002 (slot-z): колонки з ONTKOPPELEN не йдуть у DELETE — для них окремий UPDATE відв’язування (чужий рядок лишається);
 * колонки з GEEN_ACCOUNT_KOLOM ігноруються.
 */
export function wisOpdrachten(tabellen: WisTabel[], userId: string): WisOpdracht[] {
  const uit: WisOpdracht[] = [];
  const id = String(userId || '');
  if (!id) return uit;
  for (const t of tabellen) {
    if ((t.schema !== 'app' && t.schema !== 'public') || !NAAM.test(t.schema) || !NAAM.test(t.tabel)) continue;
    if (OVERSLAAN.has(t.tabel)) continue;
    const ontkoppel = ontkoppelVan(t.schema, t.tabel);
    const losKolom = new Set(ontkoppel.flatMap((o) => o.kolommen));
    const geldig = t.kolommen.filter((k) => NAAM.test(k) && !losKolom.has(k) && !geenAccount(t.tabel, k));
    const hoofd = STANDAARD_KOLOM.find((k) => geldig.includes(k));
    const eigenExtra = extraVan(t.schema, t.tabel);
    const extra = geldig.filter((k) => eigenExtra.has(k) && k !== hoofd);
    const cols = [...(hoofd ? [hoofd] : []), ...extra];
    if (cols.length) uit.push({ sql: `DELETE FROM ${t.schema}.${t.tabel} WHERE ${cols.map((k) => `${expressie(t, k)} = $1`).join(' OR ')}`, params: [id] });
    for (const o of ontkoppel) {
      uit.push({ sql: `UPDATE ${o.schema}.${o.tabel} SET ${o.zet} WHERE ${o.waar}`, params: [id], tel: `SELECT count(*)::int AS n FROM ${o.schema}.${o.tabel} WHERE ${o.waar}` });
    }
  }
  return uit;
}

/**
 * Чи кожна колонка-ідентифікатор у CREATE TABLE покрита реєстром.
 * `geen` — колонки акаунта немає. `wissen` — стандартна, EXTRA або ONTKOPPELEN (GEEN_ACCOUNT_KOLOM не рахується). `uitzondering` — записана причина. `open` — дірка.
 */
export function dekking(tabel: string, kolommen: string[]): 'geen' | 'wissen' | 'uitzondering' | 'open' {
  const ids = [...new Set(kolommen.map((k) => k.toLowerCase()).filter((k) => ACCOUNT_KOLOM.test(k) && !geenAccount(tabel, k)))];
  if (!ids.length) return 'geen';
  if (OVERSLAAN.has(tabel)) return WIS_UITZONDERING[tabel] ? 'uitzondering' : 'open';
  const extra = new Set([...EXTRA_WIS.filter((e) => e.tabel === tabel).flatMap((e) => e.kolommen), ...ONTKOPPELEN.filter((o) => o.tabel === tabel).flatMap((o) => o.kolommen)]);
  const niet = new Set<string>(NIET_EIGEN_KOLOM);
  const open = ids.filter((k) => !(STANDAARD_KOLOM as readonly string[]).includes(k) && !extra.has(k) && !niet.has(k));
  if (open.length) return 'open';
  const eigen = ids.filter((k) => !niet.has(k));
  if (!eigen.length) return WIS_UITZONDERING[tabel] ? 'uitzondering' : 'open';
  return 'wissen';
}
