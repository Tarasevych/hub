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
  | 'admin';

export type PrimaryLoginIntent = 'login' | 'replace-tab';
export type PrimaryLoginLocale = 'uk' | 'nl';

type StartInput = {
  service: PrimaryLoginService;
  tabContext: string;
  sourceOrigin: string;
  locale: PrimaryLoginLocale;
  intent: PrimaryLoginIntent;
  remember?: boolean;
};

type StartResult = {held: boolean; reasonCode: string};

const FORBIDDEN =
  /^(state|code|error|auth_resume|token|proof|handoff|transaction|redeem|request|oauth_code|oauth_error)$/i;

// Allow-list van Google-redirect-URI's. Zelf gehost: alleen id.tarasevych.com (AppDeploy-origin verwijderd).
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

const failure = (reasonCode: string) => Object.assign(new Error(reasonCode), {reasonCode});

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
];

export const redirectStartReason = (caught: unknown) => {
  const value = caught as {
    reasonCode?: unknown;
    message?: unknown;
    response?: {
      status?: number;
      data?: {error?: unknown; reasonCode?: unknown};
      responseText?: unknown;
    };
    responseText?: unknown;
  };
  const direct = String(
    value?.reasonCode || value?.response?.data?.reasonCode || value?.response?.data?.error || '',
  );
  if (direct) return direct;
  const raw = String(value?.response?.responseText || value?.responseText || '');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {error?: unknown; reasonCode?: unknown};
      const code = String(parsed.reasonCode || parsed.error || '');
      if (code) return code;
    } catch {}
  }
  return typeof value?.message === 'string' && /^OWNER_|^GOOGLE_/.test(value.message)
    ? value.message
    : 'OWNER_REDIRECT_START_NETWORK_FAILED';
};

export async function startPrimaryRedirectLogin(input: StartInput): Promise<StartResult> {
  if (!LOGIN_SERVICES.includes(input.service)) throw failure('OWNER_TRANSACTION_SERVICE_INVALID');
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
    });
  } catch (caught) {
    throw failure(redirectStartReason(caught));
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
