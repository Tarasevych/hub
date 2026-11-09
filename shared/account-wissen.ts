// План стирання акаунта (блок 8). Лише текст SQL. Виконання — backend/account-wissen.ts.
const NAAM = /^[a-z_][a-z0-9_]*$/;
export const STANDAARD_KOLOM = ['owner_id', 'user_id', 'account_id'] as const;

export type WisTabel = { schema: string; tabel: string; kolommen: string[]; uuidKolommen?: string[] };
export type WisOpdracht = { sql: string; params: string[] };

/**
 * Таблиці app, де рядок явно належить акаунту, але колонка називається інакше
 * (імена з міграцій, не вигадані).
 */
export const EXTRA_WIS: WisTabel[] = [
  { schema: 'app', tabel: 'invites', kolommen: ['created_by'] },
  { schema: 'app', tabel: 'ondersteuning_verzoeken', kolommen: ['aanvrager_id', 'doel_id'] },
  { schema: 'app', tabel: 'impersonatie_sessies', kolommen: ['beheerder_id', 'doel_id'] },
  { schema: 'app', tabel: 'uitrol_github_instellingen', kolommen: ['eigenaar_id'] },
];

/** Не стираємо цілим DELETE: окремий шлях або це не рядок акаунта. */
export const WIS_UITZONDERING: Record<string, string> = {
  users: 'надгробок без персональних даних у wisRecordsVanAccount, не DELETE',
  records: 'JSON-рядки й файли стирає wisRecordsVanAccount; owner_id додано в 0003',
  audit: 'append-only: DELETE лише через app.audit_verwijderen; actor_id чужого ланцюга не чіпаємо',
  audit_kop: 'голова геш-ланцюга app.audit (seq, hash, без персональних даних); rechten.sql забороняє DELETE для mijnruimte_system',
  audit_beheerders: 'root-список адміністраторів аудиту (db-rollen-instellen.sh); rechten.sql забороняє DELETE для mijnruimte_system',
  feature_flags: 'gewijzigd_door і масив gebruikers на спільному рядку ваги, не дані акаунта',
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
  tg_instellingen: 'door — хто востаннє змінив спільні налаштування входу через Telegram (рядок сайту, не акаунта); прив’язки, коди й запити стираються стандартно за user_id',
  cloud_provider_policy_audit_m6: 'append-only журнал політики хмарних провайдерів сайту (actor_id власника, без DELETE)',
};

const OVERSLAAN = new Set(['users', 'records', 'audit', 'audit_kop', 'audit_beheerders']);
const EXTRA_KOLOM = new Set(EXTRA_WIS.flatMap((t) => t.kolommen));

/** Колонка з id людини, але це не «свій рядок»: чужий журнал або підпис на спільному стані. */
export const NIET_EIGEN_KOLOM = ['actor_id', 'gewijzigd_door', 'bijgewerkt_door', 'door_id', 'door', 'beeindigd_door', 'ingetrokken_door', 'besluit_door', 'goedgekeurd_door', 'toegekend_door', 'besloten_door', 'gelezen_door', 'gekozen_door', 'bevestigd_door', 'ongedaan_door', 'verbonden_door', 'geverifieerd_door', 'gegeven_door', 'beslist_door'] as const;

export const ACCOUNT_KOLOM = /^(owner_id|user_id|account_id|created_by|aanvrager_id|doel_id|beheerder_id|eigenaar_id|owner_key|actor_id|door_id|gewijzigd_door|bijgewerkt_door|door|beeindigd_door|ingetrokken_door|besluit_door|goedgekeurd_door|toegekend_door|besloten_door|gelezen_door|gekozen_door|bevestigd_door|ongedaan_door|verbonden_door|geverifieerd_door|gegeven_door|beslist_door)$/;

const expressie = (t: WisTabel, kolom: string) =>
  kolom === 'eigenaar_id' || (t.tabel === 'agent_namens_sessies' && kolom === 'user_id') || t.uuidKolommen?.includes(kolom)
    ? `${kolom}::text`
    : kolom;

/** Один DELETE на таблицю, завжди з WHERE на id цього акаунта. users, records і audit — окремо. */
export function wisOpdrachten(tabellen: WisTabel[], userId: string): WisOpdracht[] {
  const uit: WisOpdracht[] = [];
  const id = String(userId || '');
  if (!id) return uit;
  for (const t of tabellen) {
    if ((t.schema !== 'app' && t.schema !== 'public') || !NAAM.test(t.schema) || !NAAM.test(t.tabel)) continue;
    if (OVERSLAAN.has(t.tabel)) continue;
    const geldig = t.kolommen.filter((k) => NAAM.test(k));
    const hoofd = STANDAARD_KOLOM.find((k) => geldig.includes(k));
    const extra = geldig.filter((k) => EXTRA_KOLOM.has(k) && k !== hoofd);
    const cols = [...(hoofd ? [hoofd] : []), ...extra];
    if (!cols.length) continue;
    uit.push({ sql: `DELETE FROM ${t.schema}.${t.tabel} WHERE ${cols.map((k) => `${expressie(t, k)} = $1`).join(' OR ')}`, params: [id] });
  }
  return uit;
}

/**
 * Чи кожна колонка-ідентифікатор у CREATE TABLE покрита реєстром.
 * `geen` — колонки акаунта немає. `wissen` — стандартна або EXTRA. `uitzondering` — записана причина. `open` — дірка.
 */
export function dekking(tabel: string, kolommen: string[]): 'geen' | 'wissen' | 'uitzondering' | 'open' {
  const ids = [...new Set(kolommen.map((k) => k.toLowerCase()).filter((k) => ACCOUNT_KOLOM.test(k)))];
  if (!ids.length) return 'geen';
  if (OVERSLAAN.has(tabel)) return WIS_UITZONDERING[tabel] ? 'uitzondering' : 'open';
  const extra = new Set(EXTRA_WIS.filter((e) => e.tabel === tabel).flatMap((e) => e.kolommen));
  const niet = new Set<string>(NIET_EIGEN_KOLOM);
  const open = ids.filter((k) => !(STANDAARD_KOLOM as readonly string[]).includes(k) && !extra.has(k) && !niet.has(k));
  if (open.length) return 'open';
  const eigen = ids.filter((k) => !niet.has(k));
  if (!eigen.length) return WIS_UITZONDERING[tabel] ? 'uitzondering' : 'open';
  return 'wissen';
}
