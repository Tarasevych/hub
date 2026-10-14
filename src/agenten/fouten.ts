// Vriendelijke foutteksten voor /agents (en de MCP-pagina): nooit een kale code als «RATE_LIMITED» op het scherm.
// De code zelf staat er klein achter, voor wie technisch wil weten wat er misging.
type Tr = (uk: string, nl: string) => string;

export function foutCode(e: unknown): { code: string; status: number; retryAfter: number } {
  const x = e as { response?: { data?: { error?: string; reasonCode?: string; retryAfter?: number }; status?: number }; status?: number; message?: string };
  const data = x?.response?.data;
  const code = String(data?.error || data?.reasonCode || x?.message || '').slice(0, 80);
  return { code, status: Number(x?.status || x?.response?.status || 0), retryAfter: Number(data?.retryAfter || 0) };
}

/** Eén zin in gewone taal; `wat` beschrijft de mislukte handeling («Не вдалося відкликати»). */
export function foutTekst(e: unknown, tr: Tr, wat?: [string, string]): string {
  const { code, status, retryAfter } = foutCode(e);
  const begin = wat ? `${tr(wat[0], wat[1])}. ` : '';
  const met = (uk: string, nl: string) => `${begin}${tr(uk, nl)}${code ? ` (${tr('код', 'code')}: ${code})` : ''}`;
  if (code === 'RATE_LIMITED' || status === 429 || /_RATE_LIMITED$/.test(code)) {
    const s = retryAfter > 0 ? retryAfter : 60;
    // Hier bewust zonder code erachter: de gebruiker zag eerder alleen «RATE_LIMITED»; de zin zegt alles.
    return `${begin}${tr(`Забагато запитів за короткий час. Зачекайте ${s} с і спробуйте ще раз; списки оновляться самі.`, `Te veel verzoeken in korte tijd. Wacht ${s} s en probeer opnieuw; de lijsten verversen vanzelf.`)}`;
  }
  if (/STEP_UP/.test(code)) return met('Потрібно підтвердити доступ ще раз.', 'U moet de toegang opnieuw bevestigen.');
  if (/SESSION_REQUIRED|SESSION_EXPIRED/.test(code) || status === 401) return met('Сесія закінчилася. Оновіть сторінку й увійдіть знову.', 'De sessie is verlopen. Ververs de pagina en meld u opnieuw aan.');
  if (/NOT_FOUND$/.test(code) || status === 404) return met('Цього вже немає — можливо, його відкликано в іншій вкладці.', 'Dit bestaat niet meer — misschien al ingetrokken in een ander tabblad.');
  if (/^PERMISSION_OFF/.test(code)) return met('Вимкнено у файлі дозволів на сервері.', 'Uitgeschakeld in het rechtenbestand op de server.');
  if (code === 'TOKEN_LIMIT_REACHED') return met('Досягнуто ліміт токенів. Відкличте непотрібні.', 'Limiet van tokens bereikt. Trek overbodige in.');
  if (code === 'AGENT_LIMIT_REACHED') return met('Досягнуто ліміт пристроїв (10). Відключіть непотрібні.', 'Limiet van 10 apparaten bereikt. Koppel overbodige los.');
  if (code === 'USER_BLOCKED') return met('Доступ ШІ для облікового запису заблоковано.', 'AI-toegang voor het account is geblokkeerd.');
  if (code === 'CAPABILITY_OFF' || code === 'CAP_UIT') return met('Цю можливість вимкнено для всіх на сайті.', 'Deze mogelijkheid staat uit voor iedereen op de site.');
  if (code === 'AGENT_UIT') return met('Цей ШІ вимкнено для всіх на сайті.', 'Deze AI staat uit voor iedereen op de site.');
  if (code === 'METHODE_UIT') return met('Цей спосіб підключення вимкнено для всіх на сайті.', 'Deze manier van koppelen staat uit voor iedereen op de site.');
  if (code === 'METHODE_NIET') return met('Цей ШІ так не підключається.', 'Deze AI koppelt niet op deze manier.');
  if (code === 'DEUR_VERBODEN') return met('Двері сервера з приватного підключення недоступні.', 'De serverdeur is niet beschikbaar vanuit een privéverbinding.');
  if (code === 'BELEID_PLAFOND') return met('Підписана політика ШІ зараз стеля. Змінити це тут не можна.', 'Het ondertekende AI-beleid is nu het plafond. Dat wijzigt u hier niet.');
  if (code === 'CAP_TECHNISCH') return met('Це керування сайтом. У вашому підключенні його немає.', 'Dit is sitebeheer. Uw verbinding heeft dat niet.');
  if ((status === 0 && !code) || /Failed to fetch|NetworkError|Network Error|ERR_NETWORK|HTTP_0/.test(code)) return met('Немає зв’язку із сервером. Перевірте мережу.', 'Geen verbinding met de server. Controleer het netwerk.');
  if (status >= 500) return met('Помилка на сервері. Спробуйте трохи згодом.', 'Fout op de server. Probeer het later opnieuw.');
  return met('Спробуйте ще раз.', 'Probeer het opnieuw.');
}
