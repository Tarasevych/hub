// SEC-002 (slot s): lijst van routes waarmee een kijker («лише перегляд») EIGEN toegang intrekt of loskoppelt. Zonder imports, zodat
// backend/rbac.ts en backend/kijker-alleen-lezen.ts hem allebei kunnen gebruiken zonder kringverwijzing.
// Перелік маршрутів, якими роль «лише перегляд» відкликає ВЛАСНІ доступи.
/**
 * SEC-002 (slot s, eind-omzeiling 2): INTREKKEN en LOSKOPPELEN van eigen toegang verkleint het risico — een kijker mag dat (na het
 * verlagen van de rol blijven tokens, OAuth-toegang, PAT's, ontgrendelingen en deelkoppelingen van vroeger anders open zonder dat hij
 * ze kan sluiten). Elke route hieronder werkt alleen op rijen van de aanvrager zelf (user_id / ownerUserId = sessie; nagekeken in de
 * handler; waar de handler naar iets anders kijkt dan de rol op de site — de rol in een gedeelde ruimte, een technische activering —
 * dwingt kijkerAlleenEigen() in backend/kijker-alleen-lezen.ts «alleen eigen» af, slot v); nieuwe toegang maken blijft dicht. Twee plekken lezen deze lijst: de kijkerwacht (backend/kijker-alleen-lezen.ts) en de
 * schrijfwacht van de modules (denyMutation in backend/rbac.ts — anders weigerde de module zelf alsnog met RBAC_FORBIDDEN). Відкликати й від'єднувати ВЛАСНІ доступи viewer може: це зменшує ризик.
 */
export const KIJKER_INTREKKEN: ReadonlySet<string> = new Set<string>([
  ...[
    'owner/agents/:id/revoke', // connectors-routes: store.revokeAgent(auth.user.id, id)
    'owner/agents/ontgrendeling/intrekken', // eigen ontgrendeling van de extensie
    'owner/agents/extensie-beheer/intrekken', // alleen userId = de kijker zelf (kijkerAlleenEigen in backend/extensie-beheer.ts, slot v)
    'owner/mcp-connector/grants/:id/revoke', 'owner/mcp-connector/deur/intrekken', // eigen OAuth-toegang van ШІ
    'owner/connector-v2/intrekken', // v2.intrekken(auth.user.id, …)
    'owner/api-platform/tokens/:id/revoke', // PAT: raw.ownerUserId === auth.user.id
    'mcp/tokens/revoke', // UPDATE … WHERE user_id = $1
    'owner/ai/grants/revoke', // grants.revokeGrants(auth.user.id, auth.user.id, …)
    'owner/agent-namens/intrekken', // namensIntrekken(auth.user.id, …)
    'owner/access/toegangscodes/intrekken', 'owner/access/gast-sessies/intrekken', // eigen gastcodes en gastsessies
    'owner/github/ontkoppelen', // eigen koppeling van de huidige lade (token bij GitHub ingetrokken)
    'owner/mail/google-suite/account/disconnect', // lokale post blijft staan
    'owner/cloud/providers/google/disconnect', // lokale kopieën blijven verplicht staan (retainLocalCopies)
    'owner/mail/imap/ontkoppelen', // eigen IMAP-koppeling (wachtwoord weg)
    // slot v (slot-toets 1): de handlers kijken naar de rol IN DE RUIMTE; voor een kijker dus extra kijkerAlleenEigen in backend/index.ts:
    // share/revoke alleen zelf vertrekken, share/link/revoke alleen een koppeling die hij zelf maakte. Чуже — 403 «лише перегляд».
    'share/link/revoke', 'share/revoke',
    'owner/cloud/vnext/delen/intrekken', // eigen openbare koppeling op een bestand
  ].map((pad) => `POST /api/${pad}`),
]);
