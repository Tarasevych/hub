import { error, json } from '../server/platform';
import {
  googleSuiteDisconnectDriveAccount,
  googleSuiteDriveAccessToken,
  googleSuiteDrivePlatformStatus,
  googleSuiteDriveProviderSnapshot,
  googleSuitePolicySelfTest,
  googleSuiteSelectDriveAccount,
  googleSuiteStartDriveConsent
} from './google-suite-inrichting';

type CloudUser = { id: string; email: string; name: string; status: string };
type CloudAuthSuccess = { service: string; user: CloudUser };
type CloudAuthFailure = { errorCode: string };
type CloudAuthorize = (event: Record<string, unknown>, body: unknown) => Promise<CloudAuthSuccess | CloudAuthFailure>;
type CloudContext = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
type AccountRole = 'primary' | 'additional';
const bodyOf = (body: unknown) => body && typeof body === 'object' ? body as Record<string, unknown> : {};
const safeText = (value: unknown, max = 500) => String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
const cloudAuth = async (authorize: CloudAuthorize, ctx: CloudContext) => { const auth = await authorize(ctx.event, ctx.body); return 'errorCode' in auth || auth.service !== 'cloud' || auth.user.status !== 'approved' ? null : auth; };

export const cloudGoogleStateParts = (_state: string) => null;
export const cloudGoogleCallbackPost = async (_ctx?: unknown, _body?: unknown) => error('CLOUD_GOOGLE_LEGACY_STATE_RETIRED', 410);
export const cloudGoogleDriveAccessToken = googleSuiteDriveAccessToken;
export const cloudGoogleProviderPolicySelfTest = googleSuitePolicySelfTest;
export const cloudGoogleProviderPlatformStatus = googleSuiteDrivePlatformStatus;
export const cloudGoogleProviderSnapshot = googleSuiteDriveProviderSnapshot;

/**
 * GESCHEIDEN GEGEVENSRUIMTES (migraties 0082 + 0084): deze vier routes worden in backend/cloud-platform.ts in
 * `createCloudRoutes` gespreid, en die hele verzameling loopt door `ladePoort('cloud', ...)`. Ze zijn dus bewaakt
 * zonder dat hier iets staat — en de eenheidstest toont dat ook, door ze mee te nemen in de lijst die zij met een
 * bevroren lade aanroept. De Google-rekeningen zelf komen al per lade uit googleSuiteDriveProviderSnapshot.
 */
export const createCloudGoogleRoutes = (authorize: CloudAuthorize) => ({
  'POST /api/owner/cloud/providers/status/verify': [async (ctx: CloudContext) => {
    const auth = await cloudAuth(authorize, ctx);
    if (!auth) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    return json({ google: await googleSuiteDrivePlatformStatus(true), providers: await googleSuiteDriveProviderSnapshot(auth.user.id) });
  }],
  'POST /api/owner/cloud/providers/google/connect/start': [async (ctx: CloudContext) => {
    const auth = await cloudAuth(authorize, ctx);
    if (!auth) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    const body = bodyOf(ctx.body), accountRole: AccountRole = body.accountRole === 'additional' ? 'additional' : 'primary';
    return googleSuiteStartDriveConsent(auth, body, accountRole);
  }],
  'POST /api/owner/cloud/providers/google/account/select': [async (ctx: CloudContext) => {
    const auth = await cloudAuth(authorize, ctx);
    if (!auth) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    const account = await googleSuiteSelectDriveAccount(auth.user.id, safeText(bodyOf(ctx.body).accountId, 300));
    return account ? json({ ok: true, activeAccount: account }) : error('CLOUD_GOOGLE_CONNECTED_ACCOUNT_REQUIRED', 404);
  }],
  'POST /api/owner/cloud/providers/google/disconnect': [async (ctx: CloudContext) => {
    const auth = await cloudAuth(authorize, ctx);
    if (!auth) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    try {
      return json({ ok: true, ...(await googleSuiteDisconnectDriveAccount(auth.user.id, bodyOf(ctx.body))) });
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : 'CLOUD_GOOGLE_DISCONNECT_FAILED';
      const status = reason === 'CLOUD_GOOGLE_DISCONNECT_CONFIRMATION_REQUIRED' ? 400 : reason === 'CLOUD_LOCAL_COPY_DELETION_NOT_AVAILABLE' ? 409 : reason === 'CLOUD_GOOGLE_ACCOUNT_NOT_FOUND' ? 404 : 500;
      return error(reason, status);
    }
  }]
});
