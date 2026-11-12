import {api} from './platform/client';

export type PrimaryLoginService =
  | 'hub'
  | 'ai'
  | 'mail'
  | 'cloud'
  | 'github'
  | 'huis'
  | 'identity'
  | 'api'
  | 'admin'
  | 'mcp';

// 'step-up': opnieuw aanmelden (prompt=login) voor een gevoelige actie; vereist een bestaande sessie (audit-fix 5).
export type PrimaryLoginIntent = 'login' | 'replace-tab' | 'step-up';
export type PrimaryLoginLocale = 'uk' | 'nl';

export type StartInput = {
  service: PrimaryLoginService;
  tabContext: string;
  sourceOrigin: string;
  locale: PrimaryLoginLocale;
  intent: PrimaryLoginIntent;
  remember?: boolean;
  hintGrantId?: string;
};

export type StartResult = {held: boolean; reasonCode: string};

export class AanmeldStartFout extends Error {
  readonly reasonCode: string;
  readonly status: number;
  readonly retryAfter: number;
  readonly maxAttempts?: number;
  readonly windowSec?: number;
  constructor(
    reasonCode: string,
    status = 0,
    retryAfter = 0,
    maxAttempts?: number,
    windowSec?: number,
  ) {
    super(reasonCode);
    this.name = 'AanmeldStartFout';
    this.reasonCode = reasonCode;
    this.status = status;
    this.retryAfter =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(86_400, Math.max(1, Math.ceil(retryAfter)))
        : 0;
    if (maxAttempts !== undefined && Number.isFinite(maxAttempts) && maxAttempts > 0) {
      this.maxAttempts = Math.round(maxAttempts);
    }
    if (windowSec !== undefined && Number.isFinite(windowSec) && windowSec > 0) {
      this.windowSec = Math.round(windowSec);
    }
  }
}

const FORBIDDEN =
  /^(state|code|error|auth_resume|token|proof|handoff|transaction|redeem|request|oauth_code|oauth_error)$/i;

// Toelatingslijst van Google-omleidingsadressen. Zelf gehost: alleen id.tarasevych.com.
const ALLOWED_REDIRECT_URIS = new Set([
  'https://id.tarasevych.com/',
]);

export const cleanRedirectReturnTo = () => {
  const url = new URL(location.href);
  for (const key of [...url.searchParams.keys()]) {
    if (FORBIDDEN.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
};

const failure = (
  reasonCode: string,
  status = 0,
  retryAfter = 0,
  maxAttempts?: number,
  windowSec?: number,
) => new AanmeldStartFout(reasonCode, status, retryAfter, maxAttempts, windowSec);

const LOGIN_SERVICES: PrimaryLoginService[] = [
  'hub',
  'ai',
  'mail',
  'cloud',
  'github',
  'huis',
  'identity',
  'api',
  'admin',
  'mcp',
];

export const redirectStartReason = (caught: unknown) => {
  const value = caught as {
    status?: unknown;
    reasonCode?: unknown;
    message?: unknown;
    response?: {
      status?: number;
      data?: {error?: unknown; reasonCode?: unknown};
      responseText?: unknown;
    };
    data?: {error?: unknown; reasonCode?: unknown};
    responseText?: unknown;
  };
  const direct = String(
    value?.reasonCode ||
      value?.response?.data?.reasonCode ||
      value?.response?.data?.error ||
      value?.data?.reasonCode ||
      value?.data?.error ||
      '',
  ).trim();
  if (direct) return direct;
  const raw = String(value?.response?.responseText || value?.responseText || '');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {error?: unknown; reasonCode?: unknown};
      const code = String(parsed.reasonCode || parsed.error || '').trim();
      if (code) return code;
    } catch {}
  }
  const status = Number(value?.status || value?.response?.status || 0) || 0;
  if (status === 429) return 'RATE_LIMITED';
  return typeof value?.message === 'string' &&
    /^(OWNER_|GOOGLE_|RATE_LIMITED$|NETWORK_ERROR$|ACCESS_)/.test(value.message)
    ? value.message
    : 'OWNER_REDIRECT_START_NETWORK_FAILED';
};

export const redirectStartRetryAfter = (caught: unknown): number => {
  if (!caught || typeof caught !== 'object') return 0;
  const item = caught as {
    retryAfter?: unknown;
    response?: {data?: {retryAfter?: unknown}};
    data?: {retryAfter?: unknown};
  };
  const n = Number(item.retryAfter || item.response?.data?.retryAfter || item.data?.retryAfter || 0);
  return Number.isFinite(n) && n > 0 ? Math.min(86_400, Math.max(1, Math.ceil(n))) : 0;
};

export async function startPrimaryRedirectLogin(input: StartInput): Promise<StartResult> {
  if (!LOGIN_SERVICES.includes(input.service)) throw failure('OWNER_TRANSACTION_SERVICE_INVALID');
  const hintGrantId =
    typeof input.hintGrantId === 'string' && /^[A-Za-z0-9_-]{8,120}$/.test(input.hintGrantId.trim())
      ? input.hintGrantId.trim()
      : '';
  let response: {data: any};
  try {
    response = await api.post('/api/owner/identity/transactions/create', {
      service: input.service,
      tabContext: input.tabContext,
      sourceOrigin: input.sourceOrigin,
      locale: input.locale,
      intent: input.intent,
      flowMode: 'redirect',
      returnTo: cleanRedirectReturnTo(),
      remember: input.remember !== false,
      ...(hintGrantId ? {hintGrantId} : {}),
    });
  } catch (caught) {
    const item = (caught && typeof caught === 'object' ? caught : {}) as {
      status?: unknown;
      maxAttempts?: unknown;
      windowSec?: unknown;
      response?: {
        status?: unknown;
        data?: {maxAttempts?: unknown; windowSec?: unknown};
      };
    };
    const status = Number(item.status || item.response?.status || 0) || 0;
    const maxAttempts = Number(item.maxAttempts || item.response?.data?.maxAttempts || 0) || undefined;
    const windowSec = Number(item.windowSec || item.response?.data?.windowSec || 0) || undefined;
    throw failure(
      redirectStartReason(caught),
      status,
      redirectStartRetryAfter(caught),
      maxAttempts,
      windowSec,
    );
  }
  const data = (response.data || {}) as Record<string, unknown>;
  const reasonCode = String(data.reasonCode || 'OK');
  const authUrl = String(data.authUrl || '');
  const redirectUri = String(data.redirectUri || '');
  let parsed: URL;
  try {
    parsed = new URL(authUrl);
  } catch {
    throw failure('OWNER_REDIRECT_AUTH_URL_INVALID');
  }
  if (parsed.origin !== 'https://accounts.google.com') {
    throw failure('OWNER_REDIRECT_AUTH_ORIGIN_INVALID');
  }
  if (!ALLOWED_REDIRECT_URIS.has(redirectUri)) {
    throw failure('OWNER_REDIRECT_URI_INVALID');
  }
  if (data.flowMode !== 'redirect') throw failure('OWNER_REDIRECT_MODE_INVALID');
  try {
    location.assign(authUrl);
  } catch {
    throw failure('OWNER_REDIRECT_NAVIGATION_FAILED');
  }
  return {held: false, reasonCode};
}
