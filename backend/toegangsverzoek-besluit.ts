/**
 * SEC-002 (aanv-gat-a-01): bewaking van het besluit over een toegangsverzoek (POST /api/owner/admin/access-requests/:id).
 * Захист рішення щодо запиту доступу.
 *
 * Vroeger veranderde dit besluit rol en status van een account zonder de controles van de naburige beheerroute
 * POST /api/owner/admin/users/:id: een al lang beslist verzoek kon opnieuw beslist worden (een geblokkeerd account
 * deblokkeren, iemand terug naar «new» zetten), het eigenaarsaccount was niet beschermd en twee gelijktijdige besluiten
 * overschreven elkaar. Deze module bevat die controles; de route vraagt daarnaast opnieuw bevestiging van de aanmelding
 * (step-up), net als users/:id.
 * Раніше рішення змінювало роль і статус без перевірок сусіднього маршруту users/:id: повторне рішення над старим
 * запитом, незахищений обліковий запис власника, гонитва двох рішень. Тут — ці перевірки; маршрут додатково вимагає step-up.
 */
import { db, isOwnerEmail } from '../server/platform';
import { canManageRole, grantFromDecision } from './rbac';

type Verzoek = { status?: unknown };
type Doel = { email?: string; role?: string; status?: string; retiredAt?: unknown };
type Actor = { id?: string; email?: string; role?: string; status?: string; accessLevel?: string };

/** Foutcode → HTTP-status voor de route. / Код помилки → HTTP-статус. */
export const TOEGANGSBESLUIT_HTTP: Readonly<Record<string, number>> = Object.freeze({
  ADMIN_ACCESS_REQUEST_NOT_PENDING: 409,
  ADMIN_ACCESS_REQUEST_TARGET_LOCKED: 409,
  ADMIN_OWNER_ACCOUNT_PROTECTED: 400,
  RBAC_ROLE_FORBIDDEN: 403,
  ADMIN_ACCESS_REQUEST_UPDATE_FAILED: 503,
});

/**
 * Waarom dit besluit NIET mag (foutcode), of null als het mag.
 *  - alleen een verzoek dat nog «pending» is;
 *  - nooit het eigenaarsaccount;
 *  - nooit een geblokkeerd, verwijderd of gepensioneerd account (deblokkeren en herstellen gaan via users/:id en
 *    users/:id/recover, met hun eigen controles);
 *  - de beslisser moet de toegekende rol mogen beheren.
 */
export function toegangsBesluitFout(invoer: { verzoek: Verzoek; doel: Doel; actor: Actor | null; besluit: string }): string | null {
  const { verzoek, doel, actor, besluit } = invoer;
  if (String(verzoek?.status || '') !== 'pending') return 'ADMIN_ACCESS_REQUEST_NOT_PENDING';
  if (isOwnerEmail(doel?.email) || doel?.role === 'owner') return 'ADMIN_OWNER_ACCOUNT_PROTECTED';
  if (doelVergrendeld(doel) && !alleenVerzoekSluiten(doel, besluit)) return 'ADMIN_ACCESS_REQUEST_TARGET_LOCKED';
  if (actor && !canManageRole(actor, grantFromDecision(besluit).role)) return 'RBAC_ROLE_FORBIDDEN';
  return null;
}

/** Geblokkeerd, verwijderd of gepensioneerd account: zijn status verandert via dit besluit nooit. */
export const doelVergrendeld = (doel: Doel): boolean => doel?.status === 'blocked' || doel?.status === 'deleted' || Number(doel?.retiredAt || 0) > 0;
/**
 * toets-g11 №5: het verzoek van een vergrendeld account mag wel GESLOTEN worden met «weigeren» — dan wordt alleen het verzoek
 * «denied», het account zelf blijft onaangeroerd (anders bleef zo'n verzoek eeuwig in de lijst en de teller staan).
 * Запит заблокованого можна закрити відмовою — змінюється лише запит, не обліковий запис.
 */
export const alleenVerzoekSluiten = (doel: Doel, besluit: string): boolean => doelVergrendeld(doel) && grantFromDecision(besluit).status === 'new';

/**
 * Neemt het verzoek atomair in beslag (één UPDATE die alleen slaagt als `besluit.genomen` nog niet bestaat).
 * Van twee gelijktijdige besluiten wint er precies één. true = in beslag genomen.
 * Атомарно «бере» запит: з двох одночасних рішень проходить рівно одне.
 */
export async function toegangsVerzoekClaimen(verzoekId: string, nu = Date.now()): Promise<boolean> {
  return db.zetEenmaligInMap('access_requests', verzoekId, 'besluit', 'genomen', nu);
}
