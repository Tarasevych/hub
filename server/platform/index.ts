// Zelf-gehoste vervanging van `@appdeploy/sdk` (zie PORTEERPLAN.md §2).
// Backend-bestanden importeren alles via '../server/platform'.
export { db } from './db';
export { storage } from './storage';
export { secrets } from './secrets';
export { ai } from './ai';
export { invites, isInviteError, InviteError } from './invites';
export { router, json, error } from './router';
export { rateLimit, lockoutRemaining, registerLoginFailure, clearLoginFailures, pogingReserveren, envKey32, sealWithEnvKey, openWithEnvKey, pepperedHash, ownerEmail, isOwnerEmail } from './beveiliging';
export type { RouterResponse, RouterContext, RouterMiddleware, RouterRoutes, LambdaEvent } from './router';
