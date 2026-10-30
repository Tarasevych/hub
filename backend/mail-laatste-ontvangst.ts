// Блок 2.3: лише дата останнього листа у Вхідних, без теми й уривка.
// Два запити на скриньку (id, потім internalDate). Токен — той самий, що й для решти Gmail.
import { googleSuitePrincipalAccessToken } from './google-suite-inrichting';

export type LaatsteOntvangst = {
  accountId: string;
  latestReceivedAt: number;
  empty: boolean;
  checkedAt: number;
  errorCode: '' | 'REAUTH' | 'CHECK_FAILED';
};

const TIJD = 8_000;

async function gmail(url: string, token: string): Promise<Response> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIJD);
  try {
    return await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: stop.signal });
  } finally {
    clearTimeout(timer);
  }
}

const reauth = (status: number) => status === 400 || status === 401 || status === 403;

export async function googleSuiteMailLaatsteOntvangst(ownerUserId: string, accountIds: unknown): Promise<LaatsteOntvangst[]> {
  const ids = [...new Set((Array.isArray(accountIds) ? accountIds : []).map((id) => String(id || '').trim()).filter((id) => /^[A-Za-z0-9_-]{3,180}$/.test(id)))].slice(0, 12);
  const checkedAt = Date.now();
  return Promise.all(ids.map(async (accountId): Promise<LaatsteOntvangst> => {
    const leeg = (errorCode: LaatsteOntvangst['errorCode'], empty = false): LaatsteOntvangst => ({ accountId, latestReceivedAt: 0, empty, checkedAt, errorCode });
    try {
      const token = await googleSuitePrincipalAccessToken(ownerUserId, accountId, 'mail');
      const lijst = await gmail('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&labelIds=INBOX&fields=messages/id', token);
      if (reauth(lijst.status)) return leeg('REAUTH');
      if (!lijst.ok) return leeg('CHECK_FAILED');
      const lichaam = await lijst.json() as { messages?: Array<{ id?: string }> };
      const id = String(lichaam.messages?.[0]?.id || '');
      if (!id) return leeg('', true);
      const bericht = await gmail(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=minimal&fields=internalDate`, token);
      if (reauth(bericht.status)) return leeg('REAUTH');
      if (!bericht.ok) return leeg('CHECK_FAILED');
      const data = await bericht.json() as { internalDate?: string };
      const latestReceivedAt = Number(data.internalDate || 0);
      return { accountId, latestReceivedAt, empty: !latestReceivedAt, checkedAt, errorCode: '' };
    } catch (e) {
      const code = String((e as Error)?.message || '');
      return leeg(/GRANT_UNAVAILABLE|PRINCIPAL_NOT_FOUND|SCOPE_GUARD|REAUTH/i.test(code) ? 'REAUTH' : 'CHECK_FAILED');
    }
  }));
}
