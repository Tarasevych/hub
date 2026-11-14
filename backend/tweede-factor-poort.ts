// IDENTITEIT-015 (етап 1.4): правило «другий чинник обов'язковий» (POST /api/owner/access/policy/save, mfa='required') тепер
// ДІЄ під час входу. Раніше правило лише зберігалося: після Google людина одразу отримувала повний сеанс.
//
// Як це працює (так само, як ворота кодового слова в backend/codewoord.ts):
//   • після Google сеанс існує, але, поки на ЦЬОМУ вході не підтверджено другий чинник (код із застосунку, ключ доступу або
//     код відновлення як запасний шлях), ownerRequireSession відмовляє всім маршрутам, крім вільних (вхід, вихід, вікно
//     «Підтвердіть доступ»); bootstrap віддає лише ознаку `tweedeFactorPoort: true` без даних;
//   • підтвердження записує stap-op.ts (totpStapOpVastleggen / passkeyStapOpVastleggen) — на сесію (вкладку і якір свого акаунта);
//   • СУМІСНІСТЬ: правило стосується лише людей, які МАЮТЬ другий чинник (TOTP або ключ доступу). Без нього ворота не зачиняються —
//     інакше власник без TOTP заблокував би себе; збереження правила без власного другого чинника сервер відхиляє
//     (ACCESS_MFA_EIGEN_FACTOR_VEREIST). Аварійний вимикач STAP_OP_UIT_TOT (backend/stap-op.ts) відчиняє й ці ворота.
// Tweede factor verplicht bij aanmelden: na Google is de sessie pas volledig na TOTP, passkey of (reserve) een herstelcode.
import { getPool } from '../server/platform/pg';

const TBL = 'tweede_factor_login_v1';
const idVan = (userId: string) => `tweede-factor:${userId}`;
/** Скільки діє підтвердження на одному вході: стільки ж, скільки абсолютне життя сеансу власника (30 діб). */
export const TWEEDE_FACTOR_LOGIN_MS = 30 * 24 * 60 * 60 * 1000;
const SPELING_MS = 60_000;

/** Ці маршрути лишаються відчиненими, доки другий чинник не підтверджено: інакше його нікуди ввести й ніяк вийти. */
const VRIJ = new Set([
  'POST /api/owner/session/bootstrap',
  'POST /api/owner/session/codewoord',
  'POST /api/owner/session/logout-current',
  'POST /api/owner/session/logout-browser-all',
  'POST /api/owner/session/logout-account-browser',
  'POST /api/owner/session/accounts',
  'POST /api/owner/browser/accounts',
  'POST /api/owner/access/stap-op',
  'POST /api/owner/access/stap-op/methoden',
  'POST /api/owner/access/stap-op/passkey/opties',
  'POST /api/owner/access/stap-op/passkey',
]);
export const tweedeFactorRouteVrij = (route: string): boolean => VRIJ.has(route);

/** Чи позначка часу ще чинна для цього входу. */
export const tweedeFactorVers = (op: number, nu = Date.now()): boolean =>
  Number.isFinite(op) && op > 0 && op <= nu + SPELING_MS && nu - op < TWEEDE_FACTOR_LOGIN_MS;

/** Чисте рішення (для тесту): чи зачинені ворота. */
export function poortDicht(input: { beleid: 'optional' | 'required'; heeftFactor: boolean; bevestigdOp: number; noodschakelaar: boolean; nu?: number }): boolean {
  if (input.noodschakelaar || input.beleid !== 'required' || !input.heeftFactor) return false;
  return !tweedeFactorVers(input.bevestigdOp, input.nu ?? Date.now());
}

// ------------------------------------------------------------------ джерела (реєструє toegangslaag.ts; без циклу імпортів)
type Beleid = 'optional' | 'required';
let beleidBron: (() => Promise<Beleid>) | null = null;
let beleidCache: { waarde: Beleid; tot: number } | null = null;
export function registreerTweedeFactorBeleid(fn: () => Promise<Beleid>): void { beleidBron = fn; beleidCache = null; }
/** Після збереження правила — одразу перечитати (а не чекати 10 с кешу). */
export function tweedeFactorBeleidVergeten(): void { beleidCache = null; }
export async function tweedeFactorBeleid(nu = Date.now()): Promise<Beleid> {
  if (beleidCache && beleidCache.tot > nu) return beleidCache.waarde;
  let waarde: Beleid = 'optional';
  try { waarde = beleidBron ? await beleidBron() : 'optional'; } catch { waarde = beleidCache?.waarde || 'optional'; }
  beleidCache = { waarde, tot: nu + 10_000 };
  return waarde;
}

// ------------------------------------------------------------------ підтвердження на вході
type Rij = { userId: string; sessies: Record<string, number>; updatedAt: number };
const bevestigd = new Map<string, number>(); // «userId|sessie» → коли підтверджено (лише як прискорення; джерело правди — база)

async function lees(userId: string): Promise<Rij | null> {
  const r = await getPool().query('SELECT data FROM app.records WHERE tbl = $1 AND id = $2', [TBL, idVan(userId)]);
  return (r.rows[0]?.data as Rij | undefined) || null;
}

/** Коли на цьому вході підтверджено другий чинник (0 — ще ні). */
export async function tweedeFactorBevestigdOp(userId: string, sessieId: string, nu = Date.now()): Promise<number> {
  if (!userId || !sessieId) return 0;
  const k = `${userId}|${sessieId}`, snel = bevestigd.get(k) || 0;
  if (tweedeFactorVers(snel, nu)) return snel;
  const rij = await lees(userId);
  const op = Number(rij?.sessies?.[sessieId] || 0);
  if (tweedeFactorVers(op, nu)) bevestigd.set(k, op);
  return op;
}

/**
 * Після коду із застосунку, ключа доступу або коду відновлення на цьому вході. Записує всі передані id (вкладку і якір свого
 * акаунта), щоб нова вкладка того ж браузера не питала знову. Повторний виклик лише оновлює час — ідемпотентно.
 */
export async function tweedeFactorVastleggen(userId: string, sessieIds: Array<string | null | undefined>): Promise<void> {
  const ids = [...new Set(sessieIds.filter((x): x is string => typeof x === 'string' && x.length >= 8 && x.length <= 200 && !x.startsWith('mcp-gedelegeerd:')))];
  if (!userId || !ids.length) return;
  const nu = Date.now();
  const vers = Object.fromEntries(ids.map((id) => [id, nu]));
  // Один UPDATE/INSERT: старі записи (понад 30 діб) відпадають, щонайбільше 60 останніх входів.
  await getPool().query(
    `INSERT INTO app.records AS r (tbl, id, data) VALUES ($1, $2, jsonb_build_object('userId', $3::text, 'sessies', $4::jsonb, 'updatedAt', $5::bigint))
     ON CONFLICT (tbl, id) DO UPDATE SET data = jsonb_build_object('userId', $3::text,
       'sessies', (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) FROM (
          SELECT e.key AS k, e.value AS v FROM jsonb_each(COALESCE(r.data->'sessies', '{}'::jsonb) || $4::jsonb) AS e
           WHERE (e.value #>> '{}')::numeric > $5::bigint - $6::bigint ORDER BY (e.value #>> '{}')::numeric DESC LIMIT 60) s),
       'updatedAt', $5::bigint), updated_at = now()`,
    [TBL, idVan(userId), userId, JSON.stringify(vers), nu, TWEEDE_FACTOR_LOGIN_MS],
  );
  for (const id of ids) bevestigd.set(`${userId}|${id}`, nu);
}

/** Для тестів і виходу: забути прискорення в пам'яті. */
export function tweedeFactorGeheugenLeeg(): void { bevestigd.clear(); beleidCache = null; }
