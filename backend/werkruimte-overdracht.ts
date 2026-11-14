// IDENTITEIT-015 (крок «profiel-blokken»): передача володіння ПРОСТОРОМ іншому учасникові — наприклад, перед видаленням
// облікового запису, щоб простір і його блоки не пішли в архів разом з ним.
// Eigendom van een WERKRUIMTE overdragen aan een ander lid (bv. vóór het verwijderen van het account), zodat de ruimte
// niet mee het archief in gaat.
//
// Правила (сервер вирішує сам; інтерфейс лише показує):
//   • передає лише теперішній власник простору; простір не в архіві й не технічний (у технічному просторі немає учасників);
//   • новий власник — АКТИВНИЙ учасник цього простору з роллю «Адміністратор» або «Редагування» і схваленим обліковим записом
//     (глядача не можна: він не погоджувався керувати простором; спершу підвищте роль);
//   • точка фіксації — ОДИН умовний UPDATE (ownerUserId = старий → новий). Два одночасні запити: виграє один, другий отримує 409.
//   • після фіксації (і під час повторної спроби, якщо щось перервалося) — «доведення»: власні блоки старого власника переходять
//     новому, рядок учасника нового власника зникає, старий власник стає адміністратором простору. Кожен крок ідемпотентний.
// Puur waar het kan; de databasestappen gebruiken de systeemrol (bewuste stap: de oude eigenaar schrijft rijen van een ander).
import { getPool } from '../server/platform/pg';
import { werkruimteRol, type WerkruimteRol } from '../shared/werkruimte-rechten';

export type OverdrachtLid = { id: string; workspaceId: string; userId: string; email: string; permission: string; workspaceRole?: string; status: string };
export type OverdrachtWerkruimte = { id: string; ownerUserId: string; name: string; ruimte?: string; archivedAt?: number; overgedragenVan?: string; overgedragenAan?: string; overgedragenOp?: number; overdrachtAfgerondOp?: number };
export type OverdrachtKandidaat = { userId: string; naam: string; email: string; rol: WerkruimteRol };

/** Welke rollen mogen eigenaar worden: alleen wie de ruimte al mee beheert of bewerkt. / Ролі, яким можна передати простір. */
export const OVERDRACHT_ROLLEN: readonly WerkruimteRol[] = Object.freeze(['admin', 'member']);

export type OverdrachtFout =
  | 'WERKRUIMTE_NIET_GEVONDEN' | 'WERKRUIMTE_NIET_EIGENAAR' | 'WERKRUIMTE_GEARCHIVEERD' | 'WERKRUIMTE_TECHNISCH'
  | 'OVERDRACHT_ZELF' | 'OVERDRACHT_GEEN_LID' | 'OVERDRACHT_ROL' | 'OVERDRACHT_ACCOUNT';

/**
 * Чиста перевірка: чи може `eigenaarId` передати простір людині `doelId`. Повертає код відмови або ''.
 * `lid` — активний рядок учасника цілі в цьому просторі (або null), `doelStatus` — статус її облікового запису.
 */
export function overdrachtFout(input: { werkruimte: OverdrachtWerkruimte | null; eigenaarId: string; doelId: string; lid: OverdrachtLid | null; doelStatus: string }): OverdrachtFout | '' {
  const w = input.werkruimte;
  if (!w) return 'WERKRUIMTE_NIET_GEVONDEN';
  if (w.ownerUserId !== input.eigenaarId) return 'WERKRUIMTE_NIET_EIGENAAR';
  if (Number(w.archivedAt || 0) > 0) return 'WERKRUIMTE_GEARCHIVEERD';
  if (String(w.ruimte || 'prive') === 'technisch') return 'WERKRUIMTE_TECHNISCH';
  if (!input.doelId || input.doelId === input.eigenaarId) return 'OVERDRACHT_ZELF';
  if (!input.lid || input.lid.status !== 'active' || input.lid.workspaceId !== w.id || input.lid.userId !== input.doelId) return 'OVERDRACHT_GEEN_LID';
  const rol = werkruimteRol(input.lid);
  if (!rol || !OVERDRACHT_ROLLEN.includes(rol)) return 'OVERDRACHT_ROL';
  if (input.doelStatus !== 'approved') return 'OVERDRACHT_ACCOUNT';
  return '';
}

const sys = () => getPool('systeem');
type Rij = { id: string; data: Record<string, unknown> };
const alsWerkruimte = (r: Rij | undefined): OverdrachtWerkruimte | null => (r ? { ...(r.data as OverdrachtWerkruimte), id: r.id, ownerUserId: String(r.data.ownerUserId || ''), name: String(r.data.name || '') } : null);
const alsLid = (r: Rij): OverdrachtLid => ({ ...(r.data as OverdrachtLid), id: r.id, workspaceId: String(r.data.workspaceId || ''), userId: String(r.data.userId || ''), email: String(r.data.email || ''), permission: String(r.data.permission || ''), status: String(r.data.status || '') });

export async function werkruimteLezen(id: string): Promise<OverdrachtWerkruimte | null> {
  const { rows } = await sys().query(`SELECT id, data FROM app.records WHERE tbl = 'workspaces' AND id = $1`, [String(id || '')]);
  return alsWerkruimte(rows[0] as Rij | undefined);
}
async function actieveLeden(workspaceId: string): Promise<OverdrachtLid[]> {
  const { rows } = await sys().query(`SELECT id, data FROM app.records WHERE tbl = 'workspace_members' AND data->>'workspaceId' = $1 AND data->>'status' = 'active' ORDER BY seq`, [workspaceId]);
  return (rows as Rij[]).map(alsLid);
}
async function accounts(ids: string[]): Promise<Map<string, { status: string; name: string; email: string }>> {
  const m = new Map<string, { status: string; name: string; email: string }>();
  if (!ids.length) return m;
  const { rows } = await sys().query(`SELECT id, data->>'status' AS status, data->>'name' AS name, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [ids]);
  for (const r of rows as Array<{ id: string; status: string | null; name: string | null; email: string | null }>) m.set(r.id, { status: String(r.status || 'new'), name: String(r.name || ''), email: String(r.email || '') });
  return m;
}

/**
 * Простори цього власника (активні, особисті) з людьми, яким їх можна передати. Простір без кандидатів теж у списку —
 * інтерфейс чесно пояснює, що спершу треба запросити людину з роллю «Адміністратор» або «Редагування».
 */
export async function overdrachtKandidaten(eigenaarId: string): Promise<Array<{ id: string; name: string; kandidaten: OverdrachtKandidaat[] }>> {
  const { rows } = await sys().query(
    `SELECT id, data FROM app.records WHERE tbl = 'workspaces' AND data->>'ownerUserId' = $1
        AND COALESCE((data->>'archivedAt')::numeric, 0) = 0 AND COALESCE(data->>'ruimte', 'prive') <> 'technisch' ORDER BY seq LIMIT 50`, [eigenaarId]);
  const uit: Array<{ id: string; name: string; kandidaten: OverdrachtKandidaat[] }> = [];
  for (const w of (rows as Rij[]).map(alsWerkruimte).filter((x): x is OverdrachtWerkruimte => !!x)) {
    const leden = (await actieveLeden(w.id)).filter((l) => l.userId && l.userId !== eigenaarId);
    const acc = await accounts([...new Set(leden.map((l) => l.userId))]);
    const per = new Map<string, OverdrachtKandidaat>();
    for (const l of leden) {
      const rol = werkruimteRol(l), a = acc.get(l.userId);
      if (!rol || !OVERDRACHT_ROLLEN.includes(rol) || a?.status !== 'approved') continue;
      const vorig = per.get(l.userId);
      if (!vorig || (vorig.rol === 'member' && rol === 'admin')) per.set(l.userId, { userId: l.userId, naam: a.name, email: a.email || l.email, rol });
    }
    uit.push({ id: w.id, name: w.name, kandidaten: [...per.values()] });
  }
  return uit;
}

export type OverdrachtUitslag =
  | { ok: true; alOverdragen: boolean; werkruimte: OverdrachtWerkruimte; vanId: string; naarId: string; blokken: number }
  | { ok: false; code: OverdrachtFout | 'OVERDRACHT_GELIJKTIJDIG' };

/** Доведення після фіксації (ідемпотентне): блоки, рядок нового власника, адміністраторська роль старого. Повертає кількість блоків. */
async function afronden(w: OverdrachtWerkruimte, vanId: string, naarId: string, vanEmail: string, nu: number): Promise<number> {
  const p = sys();
  // 1) Блоки, які належали старому власникові, — новому (блоки інших учасників лишаються в них, як і раніше).
  const blok = await p.query(
    `UPDATE app.records SET data = data || jsonb_build_object('ownerUserId', $3::text, 'ruimte', 'prive'), updated_at = now()
      WHERE tbl = 'workspace_blocks' AND data->>'workspaceId' = $1 AND data->>'ownerUserId' = $2`, [w.id, vanId, naarId]);
  // 2) Новий власник більше не «учасник» (інакше він бачив би простір двічі).
  await p.query(`DELETE FROM app.records WHERE tbl = 'workspace_members' AND data->>'workspaceId' = $1 AND data->>'userId' = $2`, [w.id, naarId]);
  // 3) Старий власник стає адміністратором (один рядок, навіть після повторної спроби).
  const bestaand = await p.query(`SELECT id FROM app.records WHERE tbl = 'workspace_members' AND data->>'workspaceId' = $1 AND data->>'userId' = $2 ORDER BY seq`, [w.id, vanId]);
  const lid = { workspaceId: w.id, userId: vanId, email: vanEmail, permission: 'editor', workspaceRole: 'admin', scopeBlockIds: [] as string[], status: 'active', updatedAt: nu };
  if (bestaand.rows.length) {
    await p.query(`UPDATE app.records SET data = data || $2::jsonb, updated_at = now() WHERE tbl = 'workspace_members' AND id = $1`, [bestaand.rows[0].id, JSON.stringify(lid)]);
    if (bestaand.rows.length > 1) await p.query(`DELETE FROM app.records WHERE tbl = 'workspace_members' AND id = ANY($1)`, [bestaand.rows.slice(1).map((r: { id: string }) => r.id)]);
  } else {
    await p.query(`INSERT INTO app.records (tbl, data) VALUES ('workspace_members', $1::jsonb)`, [JSON.stringify({ ...lid, createdAt: nu, viaOverdracht: true })]);
  }
  return blok.rowCount ?? 0;
}

/** Скільки часу після фіксації перервану передачу ще можна довести повтором (далі повтор нічого не змінює). */
export const OVERDRACHT_HERSTEL_MS = 15 * 60 * 1000;
/**
 * Чи треба доводити передачу на повторі: позначки «доведено» немає І фіксація свіжа. Старі записи без позначки (передані до цього
 * виправлення) після вікна вважаються завершеними. / Alleen onderbroken én recent: anders is een herhaling een no-op.
 */
export function overdrachtHerstelNodig(w: Pick<OverdrachtWerkruimte, 'overgedragenVan'> & { overgedragenOp?: unknown; overdrachtAfgerondOp?: unknown }, nu = Date.now()): boolean {
  if (!w.overgedragenVan || Number(w.overdrachtAfgerondOp || 0) > 0) return false;
  const op = Number(w.overgedragenOp || 0);
  return op > 0 && nu - op >= 0 && nu - op <= OVERDRACHT_HERSTEL_MS;
}
/** Позначка «доведено» — лише поки простір і далі в нового власника від того самого старого. */
async function afgerondMarkeren(id: string, vanId: string, naarId: string, nu: number): Promise<void> {
  await sys().query(`UPDATE app.records SET data = data || jsonb_build_object('overdrachtAfgerondOp', $4::bigint), updated_at = now()
    WHERE tbl = 'workspaces' AND id = $1 AND data->>'ownerUserId' = $3 AND data->>'overgedragenVan' = $2`, [id, vanId, naarId, nu]);
}

/**
 * Передає простір. Повторне натискання після успіху дає ok з alOverdragen=true і НІЧОГО не змінює; повтор після ПЕРЕРВАНОЇ спроби
 * (у межах OVERDRACHT_HERSTEL_MS) доводить незавершені кроки; простір, переданий КОМУСЬ ІНШОМУ одночасно, — 409 OVERDRACHT_GELIJKTIJDIG.
 */
export async function werkruimteOverdragen(input: { eigenaarId: string; eigenaarEmail: string; workspaceId: string; doelId: string }, nu = Date.now()): Promise<OverdrachtUitslag> {
  const w = await werkruimteLezen(input.workspaceId);
  if (w && w.ownerUserId === input.doelId && w.overgedragenVan === input.eigenaarId) {
    // IDENTITEIT-015 (herstel): доведення лише для ПЕРЕРВАНОЇ передачі (позначки «доведено» немає) і лише у вікні OVERDRACHT_HERSTEL_MS.
    // Раніше кожен повтор знову робив колишнього власника адміністратором — він міг повернути собі права після того, як новий
    // власник його прибрав чи понизив. Тепер повтор після завершення — нічого не змінює. / Alleen een onderbroken overdracht afronden.
    if (!overdrachtHerstelNodig(w, nu)) return { ok: true, alOverdragen: true, werkruimte: w, vanId: input.eigenaarId, naarId: input.doelId, blokken: 0 };
    const blokken = await afronden(w, input.eigenaarId, input.doelId, input.eigenaarEmail, nu);
    await afgerondMarkeren(w.id, input.eigenaarId, input.doelId, nu);
    return { ok: true, alOverdragen: true, werkruimte: w, vanId: input.eigenaarId, naarId: input.doelId, blokken };
  }
  const leden = w ? (await actieveLeden(w.id)).filter((l) => l.userId === input.doelId) : [];
  const lid = leden.sort((a, b) => (werkruimteRol(b) === 'admin' ? 1 : 0) - (werkruimteRol(a) === 'admin' ? 1 : 0))[0] || null;
  const doelStatus = (await accounts(input.doelId ? [input.doelId] : [])).get(input.doelId)?.status || '';
  const fout = overdrachtFout({ werkruimte: w, eigenaarId: input.eigenaarId, doelId: input.doelId, lid, doelStatus });
  if (fout || !w) return { ok: false, code: fout || 'WERKRUIMTE_NIET_GEVONDEN' };
  // Точка фіксації: лише якщо власник у базі ДОСІ той, хто просить.
  const r = await sys().query(
    `UPDATE app.records SET data = (data - 'overdrachtAfgerondOp') || jsonb_build_object('ownerUserId', $3::text, 'ruimte', 'prive', 'overgedragenVan', $2::text, 'overgedragenOp', $4::bigint, 'updatedAt', $4::bigint), updated_at = now()
      WHERE tbl = 'workspaces' AND id = $1 AND data->>'ownerUserId' = $2 RETURNING id`, [w.id, input.eigenaarId, input.doelId, nu]);
  if (!r.rowCount) return { ok: false, code: 'OVERDRACHT_GELIJKTIJDIG' };
  const blokken = await afronden(w, input.eigenaarId, input.doelId, input.eigenaarEmail, nu);
  await afgerondMarkeren(w.id, input.eigenaarId, input.doelId, nu);
  return { ok: true, alOverdragen: false, werkruimte: { ...w, ownerUserId: input.doelId, overgedragenVan: input.eigenaarId }, vanId: input.eigenaarId, naarId: input.doelId, blokken };
}

// «/» мінімізуємо: центр сповіщень ділить текст за першим « / » (src/canoniek-meldingen.ts).
const kort = (v: unknown, fallback: string) => { const s = String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s\/\s/g, ' – ').trim().slice(0, 80); return s || fallback; };
/** Тексти сповіщень обом людям (uk / nl), з наслідком. */
export function overdrachtMeldingTekst(voor: 'nieuw' | 'oud', d: { wie: unknown; ruimte: unknown }): { titel: string; tekst: string } {
  const wie = kort(d.wie, 'Учасник – Een lid'), ruimte = kort(d.ruimte, '—');
  if (voor === 'nieuw') return {
    titel: 'Вам передано володіння простором / U bent eigenaar geworden van een werkruimte',
    tekst: `${wie} передає вам простір «${ruimte}». Тепер ви його власник: керуєте учасниками, блоками й можете видалити простір. Якщо ви цього не очікували — зверніться до попереднього власника. / «${wie}» draagt de werkruimte «${ruimte}» aan u over. U bent nu de eigenaar: u beheert de leden en blokken en kunt de werkruimte verwijderen. Verwachtte u dit niet, neem dan contact op met de vorige eigenaar.`,
  };
  return {
    titel: 'Ви передали простір іншій людині / U hebt een werkruimte overgedragen',
    tekst: `Простір «${ruimte}» тепер належить ${wie}. Ви лишаєтеся в ньому адміністратором, доки новий власник не змінить вашу роль. Якщо це зробили не ви — негайно змініть спосіб входу й зверніться до нового власника. / De werkruimte «${ruimte}» is nu van «${wie}». U blijft er beheerder tot de nieuwe eigenaar uw rol wijzigt. Deed u dit niet zelf, wijzig dan meteen uw aanmelding en neem contact op met de nieuwe eigenaar.`,
  };
}
