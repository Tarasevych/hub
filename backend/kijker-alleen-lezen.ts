// SEC-002 (autorisatie-08, afwerking A): de rol «лише перегляд» (viewer, of accessLevel 'limited') mag op de HELE routetabel alleen LEZEN.
// Роль «лише перегляд» може лише ЧИТАТИ — одна загальна перевірка в диспетчері для всіх маршрутів, а не по одному.
//
// Hoe het werkt (geen extra databasewerk per verzoek):
//  - kijkerWacht(routes) omhult elke routeketen in de tabel van backend/index.ts. Tijdens de keten staat de routesleutel in een eigen
//    AsyncLocalStorage;
//  - de centrale sessiecontroles (ownerRequireSession, sessionContext in backend/index.ts) roepen kijkerControle(user) aan zodra het
//    account bekend is — dat is altijd vóór de route iets wijzigt. Is het account een kijker en staat de route NIET in de leeslijst of
//    in «eigen instellingen en afmelden», dan gooit kijkerControle een KijkerWeigering;
//  - kijkerWacht vangt die op: 403 RBAC_FORBIDDEN en een regel in het journaal (hoogstens één per 10 min per account en route).
// Weigeren tenzij ingedeeld: een nieuwe route die hier niet als lezen of eigen staat, is voor een kijker dicht. Andere rollen merken niets.
import { AsyncLocalStorage } from 'node:async_hooks';
import { error } from '../server/platform/antwoord';
import type { RouterMiddleware, RouterContext } from '../server/platform/router';
import { canonicalWorkspaceRole, rbacWeigeringVastleggen } from './rbac';
import { ZONDER_SCHRIJFRECHT as MAIL_ZONDER_SCHRIJFRECHT } from './google-suite-mail-browser';
import { KIJKER_INTREKKEN } from './kijker-intrekken';

/** Laatste letterlijke padsegmenten die alleen lezen (lijst, overzicht, stand, details, voorbeeld…). */
export const KIJKER_LEESWOORDEN: ReadonlySet<string> = new Set([
  'status', 'overzicht', 'stand', 'list', 'lijst', 'overview', 'bootstrap', 'load', 'laden', 'detail', 'preview', 'voorbeeld', 'search', 'zoeken',
  'zoek', 'health', 'een', 'inhoud', 'info', 'geschiedenis', 'historie', 'statistiek', 'stats', 'kandidaten', 'releases', 'aanbieders',
  'extensie-status', 'extensie-matrix', 'matrix', 'mijn-aanvragen', 'voor-mij', 'sessies', 'sessions', 'platform-status', 'messages', 'message',
  'thread', 'threads', 'capabilities', 'journaal', 'version', 'services', 'permissions', 'traffic', 'lezen', 'resultaat', 'revisies', 'mappen',
  'vertrouwde-toestellen', 'woningen', 'ruimtes', 'scenes', 'automatiseringen', 'gebeurtenissen', 'energie', 'voorstellen', 'leden', 'bestanden',
  'versies', 'bibliotheek', 'album', 'bronnen', 'kaarten', 'verschil', 'graaf', 'rapport', 'mogelijkheden', 'koppelingen', 'plaatsing-lezen',
  'profielen', 'apparaten', 'opdracht-stand', 'log', 'logs', 'runs', 'pogingen', 'vereisten', 'wijzigingen', 'me', 'meta', 'metadata', 'methoden',
  'catalog', 'catalogue', 'snapshot', 'snapshots', 'tools', 'approvals', 'verbindingen', 'grants', 'repos', 'repo', 'issues', 'commits', 'readme',
  'projects', 'installaties', 'branches', 'tree', 'compare', 'workflows', 'browse', 'period-bounds', 'attachment', 'raw', 'calendars',
  'deelnemers', 'suggesties', 'global-search', 'manifest', 'contract', 'tellers', 'sync-health', 'migration-inventory', 'laatste-ontvangst', 'who',
  'pagina', 'diagnostics', 'ontwerp-context', 'beschikbaar', 'subscriptions', 'get', 'privacy', 'terms', '_healthcheck',
]);

/** Routes die lezen maar geen leeswoord als laatste segment hebben (exacte sleutels). */
export const KIJKER_LEZEN_EXTRA: ReadonlySet<string> = new Set<string>([
  // leesroutes van de Google-mailmodule (zelfde lijst als haar eigen schrijfwacht, sec-002-g10c bewaakt die)
  ...MAIL_ZONDER_SCHRIJFRECHT,
  ...[
    // weergave, voorkeuren en vlaggen LEZEN
    'flags', 'ofrep/v1/evaluate/flags', 'ofrep/v1/evaluate/flags/:key', 'owner/weergave', 'owner/ui/sidebar', 'owner/ui/weergave', 'owner/ui/preferences',
    'owner/meldingen/regels', 'diagnose/meldingen', 'owner/diagnostiek/mijn-diensten', 'owner/agents/kleuren', 'owner/agents/extensie-beheer',
    'owner/telegram/mijn',
    // inhoud lezen of downloaden (geen wijziging)
    'notities/export', 'owner/foto/export', 'owner/cloud/vnext/download', 'cloud/gedeeld/download', 'owner/foto/item', 'owner/cloud/google-suite/drive/file',
    'owner/cloud/google-suite/calendar/events', 'owner/agenda/gebeurtenis', 'owner/mail/accounts/:id/labels', 'owner/mail/search/local-period',
    'owner/mail/search/advanced', 'owner/hub/blocks/data', 'owner/mail/afzender-beelden', 'owner/mail/ai-vertaling/state',
    'huis/opdrachten', 'huis/beveiliging', 'owner/cloud/vnext/integraties', 'owner/cloud/vnext/taken',
    'owner/github/labels', 'owner/github/actions', 'owner/github/activity', 'owner/github/file', 'owner/github/commit', 'owner/github/koppeling',
    // hervatpunt van de eigen weergave (g03: bewust toegestaan voor de kijker, de module zelf weigert schrijven)
    'owner/cloud/resume', 'owner/mail/resume', 'owner/cloud/items/:id/open',
    // SEC-002 (slot s, eind-regressie midden-1): de hele routetabel nagelopen — POST-routes die alleen LEZEN zonder leeswoord aan het
    // eind. Elk gecontroleerd in de handler (geen INSERT/UPDATE/DELETE van gebruikersgegevens; hoogstens een cache van afgeleide gegevens
    // zoals DNS-bewijs of merklogo's, net als in de basis). Тест: sec-002-slot-s (кожен маршрут — viewer доходить до обробника).
    // Маршрути, що лише читають, без «слова читання» в кінці: кожен перевірено в обробнику.
    'diagnose/server', // backend/diagnose.ts — uitslagen van de servercontroles (cache)
    'owner/merk-beeld', // backend/merk-bron.ts — merklogo's lezen (haalt alleen de merken van de site zelf op)
    'owner/mail/ruimte', // backend/mail-ruimte-routes.ts — stand van de postruimte
    'owner/mail/afzenders/controle', 'owner/mail/afzenders/nu', // backend/mail-afzenders.ts — afzender beoordelen (DNS-bewijs in cache)
    'owner/mail/sender-avatar/data', // backend/mail-weergave-voorkeuren.ts — eigen afzenderfoto's lezen
    'owner/ai-bord', 'owner/ai-toegang/beheer', 'owner/ai-site-schakelaars', 'owner/mcp-connector/duren', // backend/mcp-connector-routes.ts
    'owner/github/spiegel', // backend/github-werkruimte.ts — wRoute(..., false): overzicht van de spiegel
    'owner/agenda/lokaal', // backend/agenda-routes.ts — koppeling van een gebeurtenis lezen
    'terminal/opdrachten', // backend/terminal-opdrachten.ts — lijst van eigen opdrachten
    'owner/agents/activity', 'owner/agents/:id/commands', 'owner/apps/geheimen', 'owner/apps/geheimen/:id', // backend/connectors-routes.ts
    'owner/api-platform/connections', 'owner/api-platform/tokens', 'owner/api-platform/vault', // lijsten zonder geheime waarden
    'owner/google-contour', 'owner/google-contour/keys', // backend/google-contour.ts — publieke kaart, plaintextReturned:false
    'owner/cloud/integrations/v1/transfer/plan', // backend/cloud-integratie-routes.ts — readOnly:true, executionRoute:null
    'owner/cloud/providers/status/verify', // backend/cloud-google-drive.ts — stand van de aanbieder
    // NIET hier (lezen én schrijven in dezelfde route): owner/ai/settings (zet altijd het plafond) en owner/connector-v2/instellingen
    // (schrijft met extraBevestigen) — die laatste staat lezend in KIJKER_ALS_LIJF.
  ].map((pad) => `POST /api/${pad}`),
]);

// KIJKER_INTREKKEN staat in backend/kijker-intrekken.ts (zonder imports): backend/rbac.ts (denyMutation) gebruikt dezelfde lijst.
export { KIJKER_INTREKKEN } from './kijker-intrekken';

/**
 * Routes die voor een kijker alleen in een bepaalde vorm van het lijf zijn toegestaan (lezen, of loskoppelen ZONDER gegevens te wissen).
 * kijkerWacht kent het lijf; de centrale sessiecontrole niet. Залежить від тіла запиту: лише читання або від'єднання без видалення даних.
 */
export const KIJKER_ALS_LIJF: Readonly<Record<string, (lijf: Record<string, unknown>) => boolean>> = {
  // zonder extraBevestigen alleen lezen; met extraBevestigen zou een kijker een beveiliging aan/uit zetten
  'POST /api/owner/connector-v2/instellingen': (b) => typeof b.extraBevestigen !== 'boolean',
  // loskoppelen mag, het wissen van de lokale post niet (retainLocalData:false + bevestiging DELETE_MAIL_ACCOUNT_DATA)
  'POST /api/owner/mail/accounts/:id/disconnect': (b) => b.retainLocalData !== false,
  'POST /api/owner/mail/google/accounts/:id/disconnect': (b) => b.retainLocalData !== false,
};
/** Mag een kijker deze route met dit lijf? (lezen, eigen, intrekken, of toegestaan in deze lijfvorm). Puur. */
export function kijkerMagVerzoek(sleutel: string, lijf: unknown): boolean {
  if (kijkerMagRoute(sleutel)) return true;
  const regel = KIJKER_ALS_LIJF[sleutel];
  const b = lijf && typeof lijf === 'object' && !Array.isArray(lijf) ? lijf as Record<string, unknown> : {};
  return !!regel && regel(b);
}
/** Voor modules met een eigen schrijfwacht (denyMutation): zie backend/rbac.ts (zonder kringverwijzing via dit bestand). */
export { kijkerMagIntrekken } from './rbac';

/** Routes met een leeswoord die toch iets wijzigen: voor een kijker dicht (exacte sleutels). */
export const KIJKER_LEESWOORD_SCHRIJFT: ReadonlySet<string> = new Set<string>([
  'POST /api/owner/cloud/items/:id/status', // zet de status van een cloud-item (wolk-08)
  'POST /api/owner/api-platform/connections/:id/status', // zet de status van een verbinding
]);

/** Eigen instellingen, eigen beveiliging, aanmelden en afmelden: een kijker mag die (alleen voor zichzelf). Exacte sleutels. */
export const KIJKER_EIGEN: ReadonlySet<string> = new Set<string>([
  ...[
    // meldingen van zichzelf als gelezen markeren, eigen meldingsregels
    'notifications/read', 'owner/notifications/read', 'service/notifications/read', 'owner/meldingen/gelezen', 'owner/meldingen/gelezen/toevoegen',
    'owner/meldingen/status/zetten', 'owner/meldingen/regels/opslaan', 'meldingen/apparaat-bekend', 'diagnose/melden', 'diagnose/gelezen',
    // eigen weergave en voorkeuren
    'owner/weergave/zet', 'owner/ruimte/keuze', 'owner/ruimte/dienst', 'owner/menu/tellers/weg', 'owner/menu/tellers/zet', 'owner/profile/photo', 'owner/profile/photo/link',
    'owner/mail/view-preferences/save', 'owner/mail/view-preferences/section-display', 'owner/mail/notification-preferences/save',
    'owner/hub/layouts/save', 'owner/vensters/opslaan', 'owner/hub/bureau/save', 'owner/mail/afzender-beelden/voorkeur',
    'owner/zoek/geschiedenis/open', 'owner/zoek/geschiedenis/bewaren', 'owner/zoek/geschiedenis/wis', 'owner/zoek/geschiedenis/wis-alles',
    // eigen beveiliging: codewoord, passkeys, TOTP, herstelcodes, wachtwoord, aanmeldmethoden, telefoon
    'owner/identity/codewoord/zetten', 'owner/identity/codewoord/controleren',
    'owner/access/passkeys/registreren/opties', 'owner/access/passkeys/registreren', 'owner/access/passkeys/hernoemen', 'owner/access/passkeys/verwijderen',
    'owner/access/passkeys/goedkeuring/aanvragen', 'owner/access/passkeys/goedkeuring/annuleren',
    'owner/access/webauthn/options', 'owner/access/webauthn/register', 'owner/access/webauthn/remove',
    'owner/access/totp/start', 'owner/access/totp/confirm', 'owner/access/totp/disable',
    'owner/access/recovery/rotate', 'owner/access/recovery/intrekken', 'owner/access/recovery/bekeken',
    'owner/access/password/login', 'owner/auth/password/login', 'owner/access/password/set', 'owner/access/password/remove',
    'owner/access/method/unbind', 'owner/access/binding/unbind', 'owner/access/method/herstel', 'owner/access/phone/save',
    'owner/sleutelkluis/ontgrendelen/herstelcode', 'owner/sleutelkluis/vergrendelen', 'owner/sleutelkluis/passkey/ontgrendelen/opties',
    'owner/sleutelkluis/passkey/ontgrendelen',
    'owner/telegram/koppelen/start', 'owner/telegram/koppelen/bevestigen', 'owner/telegram/koppelen/annuleren', 'owner/telegram/ontkoppelen',
    'owner/telegram/wijziging/getoond', 'owner/telegram/wijziging/antwoord', 'owner/telegram/code/instellen', 'owner/telegram/code/verwijderen',
    'owner/telegram/code/herstellen', 'owner/telegram/bevestiging/aanvragen', 'owner/telegram/bevestiging/code',
    'owner/bevestiging/apparaat/aanvragen', 'owner/bevestiging/apparaat/intrekken', 'owner/bevestiging/apparaat/open',
    'owner/bevestiging/apparaat/bekrachtigen', 'owner/bevestiging/apparaat/weigeren', 'owner/bevestiging/apparaat/voorkeuren',
    'owner/bevestiging/apparaat/herstellen',
    // om meer toegang vragen, ondersteuning vragen of beëindigen, eigen gegevens en eigen account
    'owner/access/request', 'access/request', 'ondersteuning/aanvragen', 'ondersteuning/beeindigen',
    'owner/identity/account/delete', 'identity/account/delete', 'account/delete', 'service/account/delete', 'account/recover', 'owner/identity/account/recover', // IDENTITEIT-015: нове відновлення
    'auth/logout', 'service/auth/logout',
    // een uitnodiging aannemen: het eigen lidmaatschap (de rol in die ruimte bepaalt de uitnodiger)
    'share/join',
  ].map((pad) => `POST /api/${pad}`),
]);
/** Idem, als voorvoegsel van het pad (aanmeld- en sessiestromen). */
export const KIJKER_EIGEN_VOORVOEGSEL: readonly string[] = [
  '/api/owner/session/', '/api/owner/identity/transactions/', '/api/owner/identity/redirect/', '/api/owner/identity/security/', '/api/owner/auth/',
  '/api/owner/google-suite/callback', '/api/owner/browser/accounts', '/api/owner/access/stap-op', '/api/owner/privacy/', '/api/owner/ui/',
  '/api/identity/security/', '/api/service/security/', '/api/auth/', '/api/ecosystem/', '/api/browser/accounts', '/api/aanmelden/', '/api/aanmeld/',
  '/api/gast/', '/api/service-handoff/',
];

const laatsteSegment = (sleutel: string): string => {
  const pad = sleutel.replace(/^[A-Z]+\s+/, '');
  const delen = pad.split('/').filter((s) => s && !s.startsWith(':'));
  return delen[delen.length - 1] || '';
};
/** Indeling van één routesleutel ('POST /api/x') voor een kijker. Puur. */
export function kijkerRouteSoort(sleutel: string): 'lezen' | 'eigen' | 'intrekken' | 'geweigerd' {
  const k = String(sleutel || '').trim();
  const methode = k.split(/\s+/)[0]?.toUpperCase() || '';
  const pad = k.replace(/^[A-Z]+\s+/, '');
  if (KIJKER_EIGEN.has(k) || KIJKER_EIGEN_VOORVOEGSEL.some((v) => pad.startsWith(v))) return 'eigen';
  if (KIJKER_INTREKKEN.has(k)) return 'intrekken';
  if (KIJKER_LEESWOORD_SCHRIJFT.has(k)) return 'geweigerd';
  if (methode === 'GET' || methode === 'HEAD' || methode === 'OPTIONS') return 'lezen';
  if (methode !== 'POST') return 'geweigerd';
  if (KIJKER_LEZEN_EXTRA.has(k) || KIJKER_LEESWOORDEN.has(laatsteSegment(k))) return 'lezen';
  return 'geweigerd';
}
export const kijkerMagRoute = (sleutel: string): boolean => kijkerRouteSoort(sleutel) !== 'geweigerd';

// ------------------------------------------------------------------------------------------------ wacht in de dispatcher
export class KijkerWeigering extends Error {
  constructor(readonly route: string, readonly userId: string) { super('RBAC_FORBIDDEN'); this.name = 'KijkerWeigering'; }
}
const lopend = new AsyncLocalStorage<{ route: string; geweigerd?: string; lijfToegestaan?: boolean; reden?: string }>();
type Gebruiker = { id?: string; email?: string; role?: string; status?: string; accessLevel?: string } | null | undefined;

/**
 * Door de centrale sessiecontrole aangeroepen zodra het account bekend is. Gooit KijkerWeigering voor een kijker op een route die niet
 * lezen of eigen is. Buiten kijkerWacht (cron, interne aanroep zonder routetabel) doet ze niets.
 */
export function kijkerControle(user: Gebruiker): void {
  const r = lopend.getStore();
  if (!r || !user) return;
  if (canonicalWorkspaceRole(user) !== 'viewer') return;
  if (kijkerMagRoute(r.route) || r.lijfToegestaan) return;
  // Ook onthouden in de verzoekcontext: vangt een route de fout zelf af (try/catch → eigen 500), dan maakt kijkerWacht er toch 403 van.
  r.geweigerd = String(user.id || '');
  throw new KijkerWeigering(r.route, r.geweigerd);
}

/**
 * SEC-002 (slot v, slot-toets 1): op de intrekroutes (KIJKER_INTREKKEN) laat de kijkerwacht een kijker door, maar ALLEEN voor zijn
 * EIGEN toegang. Waar de handler zelf beslist over iets van een ander (een ander lid uit een gedeelde ruimte halen, een deelkoppeling
 * van een ander intrekken, de ontgrendeling van een ander account sluiten) — omdat hij naar de rol IN DE RUIMTE of naar een
 * technische activering kijkt en niet naar de rol op de site — roept hij dit aan met `eigen` = «raakt dit alleen de aanvrager zelf?».
 * Kijker en niet eigen → KijkerWeigering; kijkerWacht maakt daar 403 RBAC_FORBIDDEN van (tweetalige tekst «лише перегляд» in
 * shared/weigering-tekst.ts), met een auditregel rbac.geweigerd (reden KIJKER_ALLEEN_EIGEN) en de melding toegang_alleen_lezen.
 * Voor iedereen die geen kijker is, doet ze niets (de module beslist zoals vroeger).
 * Роль «лише перегляд» на маршрутах відкликання може торкатися лише ВЛАСНИХ доступів; чуже — 403 RBAC_FORBIDDEN, запис аудиту, сповіщення.
 */
export function kijkerAlleenEigen(user: Gebruiker, eigen: boolean): void {
  if (eigen || !user || canonicalWorkspaceRole(user) !== 'viewer') return;
  const r = lopend.getStore();
  const id = String(user.id || '');
  if (r) { r.geweigerd = id; r.reden = 'KIJKER_ALLEEN_EIGEN'; }
  else void rbacWeigeringVastleggen({ userId: id, reden: 'KIJKER_ALLEEN_EIGEN' }); // buiten de routetabel: toch een auditregel
  throw new KijkerWeigering(r?.route || '', id);
}

const laatsteKijkerMelding = new Map<string, number>();
/** Melding «лише перегляд» buiten de hmara: hoogstens één per uur per account. Geeft true als er gemeld is. */
export async function kijkerMelden(userId: string, route: string, nu = Date.now()): Promise<boolean> {
  if (!userId) return false;
  if (nu - (laatsteKijkerMelding.get(userId) ?? -Infinity) < 60 * 60_000) return false;
  laatsteKijkerMelding.set(userId, nu);
  if (laatsteKijkerMelding.size > 5000) for (const [k, v] of laatsteKijkerMelding) if (nu - v >= 60 * 60_000) laatsteKijkerMelding.delete(k);
  const pad = String(route || '').replace(/^[A-Z]+\s+/, '').slice(0, 120);
  const { meld } = await import('./melder');
  await meld(userId, 'toegang_alleen_lezen', 'Зміну відхилено: ваша роль — лише перегляд / Wijziging geweigerd: uw rol is alleen-lezen',
    `Дію «${pad}» не виконано: ваша роль — «лише перегляд», тож ви можете переглядати й читати, але не змінювати. Щоб змінювати, попросіть власника сайту чи простору надати роль «учасник». Нічого не змінено. / De actie «${pad}» is niet uitgevoerd: uw rol is «alleen bekijken», dus u kunt bekijken en lezen maar niets wijzigen. Vraag de eigenaar van de site of de ruimte om de rol «lid» als u wilt wijzigen. Er is niets gewijzigd.`);
  return true;
}
export const _kijkerMeldingLeeg = (): void => laatsteKijkerMelding.clear();

/** Omhult elke keten van de routetabel (één keer, in backend/index.ts, vóór router()). */
export function kijkerWacht<T extends Record<string, RouterMiddleware[]>>(routes: T): T {
  const uit: Record<string, RouterMiddleware[]> = {};
  for (const [sleutel, keten] of Object.entries(routes)) {
    const schakels = Array.isArray(keten) ? keten : [keten as unknown as RouterMiddleware];
    uit[sleutel] = [async (ctx: RouterContext) => {
      const staat: { route: string; geweigerd?: string; lijfToegestaan?: boolean; reden?: string } = { route: sleutel, lijfToegestaan: !kijkerMagRoute(sleutel) && kijkerMagVerzoek(sleutel, ctx.body) };
      const weiger = async () => {
        await rbacWeigeringVastleggen({ userId: staat.geweigerd || '', route: sleutel, reden: staat.reden || 'KIJKER_ALLEEN_LEZEN' });
        // Hmara/foto's: ook het cloudjournaal en (één per uur) de melding cloud_alleen_lezen voor de mens zelf.
        if (staat.geweigerd && /\/(cloud|drive|foto)/.test(sleutel)) await import('./cloud-schrijfrecht').then((m) => m.cloudWeigeringVastleggen(staat.geweigerd!, sleutel, 'RBAC_FORBIDDEN')).catch(() => undefined);
        // SEC-002 (slot s, eind-interface 1): buiten de hmara de melding toegang_alleen_lezen (uitleg in het meldingencentrum), hoogstens één
        // per uur per mens. / Поза хмарою — сповіщення toegang_alleen_lezen, не частіше разу на годину.
        else if (staat.geweigerd) await kijkerMelden(staat.geweigerd, sleutel).catch(() => undefined);
        return error('RBAC_FORBIDDEN', 403);
      };
      return lopend.run(staat, async () => {
        let uitkomst: Awaited<ReturnType<RouterMiddleware>> = undefined;
        try {
          for (const m of schakels) { uitkomst = await m(ctx); if (uitkomst) break; }
        } catch (e) {
          if (e instanceof KijkerWeigering || staat.geweigerd !== undefined) return weiger();
          throw e;
        }
        return staat.geweigerd !== undefined ? weiger() : uitkomst;
      });
    }];
  }
  return uit as T;
}
