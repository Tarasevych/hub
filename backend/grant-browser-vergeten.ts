// IDENTITEIT-015 (приймання «sessies»): «Зберегти цей обліковий запис для наступних сесій» → вимкнути (або «Забути цей браузер» на
// поточному рядку «Запам’ятований браузер») має прибрати обліковий запис зі списку швидкого входу НА ЦЬОМУ ПРИСТРОЇ.
//
// Що було не так (e2e identiteit-015-sessies, крок D): маршрут security/items/:id/revoke (kind=grant) відкликав лише поточний грант.
// Але в тому самому браузері лишалися давніші гранти того самого облікового запису у вигляді «підказки» (revokedAt + hintOnlyAt —
// так їх лишає звичайний «Вийти», щоб показати «Підтвердити через Google · збережений на пристрої»). Після вимкнення й виходу
// екран входу далі показував цей обліковий запис, хоча текст під перемикачем обіцяє: «обліковий запис не залишиться у списку для швидкого
// входу».
//
// Тепер, коли відкликають грант САМЕ ЦЬОГО браузера (його cookie є в запиті), усі інші гранти цього ж облікового запису з cookie
// цього браузера стають «забутими»: revokedAt лишається (або ставиться), hintOnlyAt прибирається (підказки більше немає),
// menuHiddenAt ставиться (як «Забути на цьому пристрої» на екрані входу). Чужі облікові записи в тому самому браузері й гранти
// інших браузерів не зачіпаються. Нічого не відновлюється: це лише посилює відкликання.
// Account op dit apparaat vergeten: ook oudere «hint»-grants van hetzelfde account in deze browser verdwijnen uit snel aanmelden.
import { createHash } from 'node:crypto';

export const GRANT_COOKIE_VOORVOEGSEL = 'tsv_ot_grant_';
export type GrantRij = Record<string, unknown> & { userId?: unknown; tokenHash?: unknown; revokedAt?: unknown; hintOnlyAt?: unknown; menuHiddenAt?: unknown };
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

/** Id грантів, cookie яких надіслав цей браузер (лише формат id; токен звіряється пізніше). */
export function grantCookiesVanBrowser(cookies: Iterable<[string, string]>): Array<{ id: string; token: string }> {
  const uit: Array<{ id: string; token: string }> = [];
  for (const [naam, token] of cookies) {
    if (!naam.startsWith(GRANT_COOKIE_VOORVOEGSEL) || !token) continue;
    const id = naam.slice(GRANT_COOKIE_VOORVOEGSEL.length);
    if (/^[A-Za-z0-9_-]{8,120}$/.test(id)) uit.push({ id, token });
  }
  return uit;
}

/** Запис «забутого на цьому пристрої» гранту: відкликаний, без підказки, прихований у меню. Чиста функція. */
export function vergetenGrant(r: GrantRij, nu: number): GrantRij {
  const { hintOnlyAt: _hint, ...rest } = r;
  return { ...rest, revokedAt: Number(r.revokedAt) > 0 ? Number(r.revokedAt) : nu, menuHiddenAt: Number(r.menuHiddenAt) > 0 ? Number(r.menuHiddenAt) : nu };
}

/**
 * Які записи оновити, коли в браузері з цими cookie відкликали грант `doelId` облікового запису `userId`.
 * Порожньо, якщо cookie цього гранту в запиті немає (відкликають ІНШИЙ браузер — його підказки тут не видно й не чіпаємо).
 * Беруться лише гранти з cookie цього браузера, того самого userId, з правильним токеном; уже забуті (без підказки й прихований) — ні.
 */
export function teVergetenGrants(o: { cookies: Iterable<[string, string]>; doelId: string; userId: string; rijen: Map<string, GrantRij>; nu: number }): Array<{ id: string; record: GrantRij }> {
  const inBrowser = grantCookiesVanBrowser(o.cookies);
  const doel = inBrowser.find((c) => c.id === o.doelId);
  const doelRij = o.rijen.get(o.doelId);
  if (!doel || !doelRij || String(doelRij.userId) !== o.userId || doelRij.tokenHash !== sha(doel.token)) return [];
  const uit: Array<{ id: string; record: GrantRij }> = [];
  for (const c of inBrowser) {
    const r = o.rijen.get(c.id);
    if (!r || String(r.userId) !== o.userId || r.tokenHash !== sha(c.token)) continue;
    const alVergeten = Number(r.revokedAt) > 0 && !(Number(r.hintOnlyAt) > 0) && Number(r.menuHiddenAt) > 0;
    if (alVergeten) continue;
    uit.push({ id: c.id, record: vergetenGrant(r, o.nu) });
  }
  return uit;
}

/** Виконати: прочитати гранти з cookie цього браузера й записати «забуті». Повертає кількість змінених записів. */
export async function accountInBrowserVergeten(deps: { lees: (ids: string[]) => Promise<Array<GrantRij | null | undefined>>; schrijf: (rijen: Array<{ id: string; record: GrantRij }>) => Promise<unknown> }, o: { cookies: Iterable<[string, string]>; doelId: string; userId: string; nu?: number }): Promise<number> {
  const inBrowser = grantCookiesVanBrowser(o.cookies);
  if (!inBrowser.some((c) => c.id === o.doelId)) return 0;
  const ids = inBrowser.map((c) => c.id);
  const gelezen = await deps.lees(ids);
  const rijen = new Map<string, GrantRij>();
  ids.forEach((id, i) => { const r = gelezen[i]; if (r) rijen.set(id, r); });
  const wijzig = teVergetenGrants({ cookies: inBrowser.map((c) => [`${GRANT_COOKIE_VOORVOEGSEL}${c.id}`, c.token] as [string, string]), doelId: o.doelId, userId: o.userId, rijen, nu: o.nu ?? Date.now() });
  if (wijzig.length) await deps.schrijf(wijzig);
  return wijzig.length;
}
