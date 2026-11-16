// SEC-002 (na de onafhankelijke controle van groep g03, 12.11.2026) — het SCHRIJFRECHT van de hmara (cloud.write) op één plek.
//
// Twee zwakke plekken die de controle vond in wat wolk-08 had gedicht:
//   • aantekening 2: de schrijfpoort van createCloudRoutes (backend/cloud-platform.ts) bewaakt alleen ROUTES. De functies die zelf een
//     bestand in de hmara van een mens schrijven (cloudImportExternalMedia, cloudAiBestandOpslaan) worden ook van buiten die
//     verzameling aangeroepen — «POST /api/owner/media/diagram», «…/media/afbeelding» (backend/dev-mg-routes.ts) en
//     «…/google-suite/photos/import» (backend/google-suite-agenda-fotos.ts). De rol «лише перегляд» schreef langs die weg toch.
//     De controle zit nu IN die functies (`vereisCloudSchrijfrecht`): elke aanroeper, ook een van morgen, is bewaakt.
//   • aantekening 3: een weigering liet geen spoor na. Elke weigering van de schrijfpoort en van de expliciete controles in
//     backend/cloud-google-drive.ts schrijft nu een regel in het auditboek van de hmara (cloud_audit_v1, in de lade van de
//     aanroep, result 'rejected' — dezelfde vorm als de afgewezen koppeling in backend/google-suite-inrichting.ts). Geen inhoud
//     van het verzoek: alleen de route en de code. Begrensd per mens en route, zodat herhaald klikken het boek niet vult.
//   • tweede controle, aantekening 5: ook de beschermende blokkade «te groot om te openen» (413 CLOUD_ITEM_TE_GROOT in
//     «items/:id/open», aanv-ronde1-04) laat zo'n regel na — `cloudBlokkadeVastleggen`, met reden en werkelijke grootte.
//
// Geen eigen regels: wie mag schrijven beslist backend/rbac.ts (denyMutation) — hier wordt alleen gelezen wie de mens IS.
import { db, error } from '../server/platform';
import { meld } from './melder';
import { alsSysteem } from '../server/platform/context';
import { ladeVelden } from '../shared/ruimte-scheiding';
import { denyMutation } from './rbac';
import { ladeOf } from './ruimte-cloud-agenda';

type Mens = { id: string; email?: string; role?: string; status?: string; accessLevel?: string };
type Antwoord = ReturnType<typeof error>;

const CLOUD_AUDIT = 'cloud_audit_v1';
/** Hoogstens één auditregel per mens, route en code in dit venster (herhaald klikken vult het boek niet). */
export const WEIGERING_VENSTER_MS = 10 * 60_000;
const laatsteWeigering = new Map<string, number>();
/** Voor tests: het geheugen van de begrenzing leegmaken. */
export const _weigeringGeheugenLeeg = () => laatsteWeigering.clear();

const codeVan = (antwoord: Antwoord): string => {
  try { return String((JSON.parse(String((antwoord as { body?: unknown }).body || '{}')) as { error?: unknown }).error || 'RBAC_FORBIDDEN'); }
  catch { return 'RBAC_FORBIDDEN'; }
};

/**
 * Schrijft (begrensd: één regel per mens, actie, onderwerp en reden per venster) een weigering of blokkade in het auditboek van
 * de hmara, in de lade van de aanroep. `details` bevat nooit inhoud van het verzoek of van een bestand. Faalt nooit naar buiten.
 */
export async function cloudBlokkadeVastleggen(userId: string, action: string, entityType: string, entityId: string, details: { reden: string } & Record<string, string | number>): Promise<void> {
  if (!userId) return;
  const sleutel = `${userId}|${action}|${entityType}|${entityId}|${details.reden}`, nu = Date.now();
  if (nu - (laatsteWeigering.get(sleutel) || 0) < WEIGERING_VENSTER_MS) return;
  laatsteWeigering.set(sleutel, nu);
  if (laatsteWeigering.size > 5000) for (const [k, t] of laatsteWeigering) if (nu - t >= WEIGERING_VENSTER_MS) laatsteWeigering.delete(k);
  try {
    await db.add(CLOUD_AUDIT, [{ ...ladeVelden(ladeOf(userId)), action, entityType, entityId: String(entityId).slice(0, 200), result: 'rejected', details, createdAt: nu }]);
  } catch (err) {
    console.error('[cloud-schrijfrecht] auditregel mislukt:', (err as Error).message);
  }
}

/** Schrijft (begrensd) één regel «schrijven geweigerd» in het auditboek van de hmara. */
export async function cloudWeigeringVastleggen(userId: string, route: string, code: string): Promise<void> {
  await cloudBlokkadeVastleggen(userId, 'cloud.schrijven.geweigerd', 'route', route, { reden: code });
  // SEC-002 (g03, afwerking A): de mens met «лише перегляд» krijgt ook een melding (soort cloud_alleen_lezen — uitleg in het
  // meldingencentrum), hoogstens één per uur: dan weet hij waarom opslaan niet lukte en bij wie hij schrijfrecht vraagt.
  if (code !== 'RBAC_FORBIDDEN' || !userId) return;
  const nu = Date.now();
  if (nu - (laatsteMelding.get(userId) || 0) < 60 * 60_000) return;
  laatsteMelding.set(userId, nu);
  if (laatsteMelding.size > 5000) for (const [k, t] of laatsteMelding) if (nu - t >= 60 * 60_000) laatsteMelding.delete(k);
  await meld(userId, 'cloud_alleen_lezen', 'Хмара: у вас лише перегляд / Cloud: u heeft alleen leesrechten',
    'Зміну не збережено: ваша роль — «лише перегляд», тож файли можна відкривати, але не змінювати. Щоб змінювати, попросіть власника простору надати роль «учасник». / De wijziging is niet opgeslagen: uw rol is «alleen bekijken», dus u kunt bestanden openen maar niet wijzigen. Vraag de eigenaar van de ruimte om de rol «lid» om te kunnen wijzigen.', '/cloud');
}
const laatsteMelding = new Map<string, number>();

/**
 * Voor een route: undefined als deze mens mag schrijven, anders het 403-antwoord van backend/rbac.ts
 * (RBAC_PENDING_CANNOT_MUTATE / RBAC_FORBIDDEN) — en dan staat de weigering in het auditboek.
 */
export async function cloudSchrijfWeigering(user: Mens, route: string): Promise<Antwoord | undefined> {
  const geweigerd = denyMutation(user, 'cloud.write');
  if (!geweigerd) return undefined;
  await cloudWeigeringVastleggen(String(user?.id || ''), route, codeVan(geweigerd));
  return geweigerd;
}

/**
 * Voor een functie die zelf in de hmara van `ownerUserId` schrijft: leest wie die mens IS (rol, status, toegangsniveau uit
 * `users`, niet uit de aanroep) en gooit de code van backend/rbac.ts als hij niet mag schrijven. Onbekende mens → RBAC_FORBIDDEN.
 */
export async function vereisCloudSchrijfrecht(ownerUserId: string, route: string): Promise<void> {
  const id = String(ownerUserId || '');
  const [rij] = id ? await alsSysteem(() => db.get<Omit<Mens, 'id'>>('users', [id])).catch(() => []) : [];
  if (!rij) { await cloudWeigeringVastleggen(id, route, 'RBAC_FORBIDDEN'); throw new Error('RBAC_FORBIDDEN'); }
  const geweigerd = await cloudSchrijfWeigering({ ...(rij as Omit<Mens, 'id'>), id }, route);
  if (geweigerd) throw new Error(codeVan(geweigerd));
}
