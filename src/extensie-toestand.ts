// Toestandsmachine van de browserextensie op de site (0.4): één bron voor wat de gebruiker ziet en welke knoppen er zijn.
// not_installed → installed → paired → connected → enabled | disabled(reden). Elke toestand heeft precies de acties die
// daar werken (geen dode knoppen); 'test' is er altijd zodra de extensie aanwezig is.
// Ook: berichten aan de extensie via externally_connectable (PING, PAIR, OPEN_OPTIONS) met het extensie-id uit de "hello".

export type ExtState = 'checking' | 'not_installed' | 'installed' | 'paired' | 'connected' | 'enabled' | 'disabled';
export type DisabledReason = 'blocked' | 'no_grants' | 'account_mismatch' | 'browser_off' | 'not_armed' | 'outdated';
export type ExtAction = 'install' | 'pair' | 'repair' | 'enable' | 'grant' | 'relogin' | 'update' | 'test' | 'stop' | 'options';

export interface ExtInputs {
  presence: 'checking' | 'present' | 'absent';
  version?: string;            // uit PING/hello
  minVersion?: string;         // vereiste versie (0.4.0)
  paired: boolean;             // extensie heeft een token
  online: boolean;             // server ziet de WebSocket
  account: 'ok' | 'mismatch' | 'unknown';
  blocked: boolean;            // AI-toegang van het account geblokkeerd
  activeGrants: number;        // geldige grants voor deze browser
  browserEnabled: boolean;     // hoofdschakelaar op de site
  armed: boolean;              // ingelogd-bevestiging (heartbeat)
}

export interface ExtView { state: ExtState; reason?: DisabledReason; actions: ExtAction[] }

const num = (v: string) => v.split('.').map((x) => Number.parseInt(x, 10) || 0);
export function versionAtLeast(have: string | undefined, want: string | undefined): boolean {
  if (!want) return true;
  if (!have) return false;
  const a = num(have), b = num(want);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0); }
  return true;
}

export function deriveExtState(i: ExtInputs): ExtView {
  if (i.presence === 'checking') return { state: 'checking', actions: [] };
  if (i.presence === 'absent') return { state: 'not_installed', actions: ['install'] };
  if (!versionAtLeast(i.version, i.minVersion)) return { state: 'disabled', reason: 'outdated', actions: ['update', 'test'] };
  if (!i.paired) return { state: 'installed', actions: ['pair', 'test', 'options'] };
  if (!i.online) return { state: 'paired', actions: ['repair', 'test', 'options'] };
  const base: ExtAction[] = ['test', 'stop', 'options'];
  if (i.blocked) return { state: 'disabled', reason: 'blocked', actions: ['test', 'options'] };
  if (i.account === 'mismatch') return { state: 'disabled', reason: 'account_mismatch', actions: ['relogin', ...base] };
  if (!i.browserEnabled) return { state: 'disabled', reason: 'browser_off', actions: ['enable', ...base] };
  if (i.activeGrants <= 0) return { state: 'disabled', reason: 'no_grants', actions: ['grant', ...base] };
  if (!i.armed) return { state: 'disabled', reason: 'not_armed', actions: ['relogin', ...base] };
  return { state: 'enabled', actions: ['grant', ...base] };
}

/** Teksten (uk + nl) per toestand en reden. */
export const EXT_TEXT: Record<ExtState | DisabledReason, [string, string]> = {
  checking: ['Перевіряю розширення…', 'Extensie controleren…'],
  not_installed: ['Розширення не встановлено в цьому браузері.', 'De extensie is niet geïnstalleerd in deze browser.'],
  installed: ['Розширення встановлено, але ще не підключене до вашого облікового запису.', 'De extensie is geïnstalleerd, maar nog niet gekoppeld aan uw account.'],
  paired: ['Підключено, але зараз немає з’єднання із сервером.', 'Gekoppeld, maar er is nu geen verbinding met de server.'],
  connected: ['З’єднано із сервером.', 'Verbonden met de server.'],
  enabled: ['Працює: ШІ може робити лише те, що ви дозволили нижче.', 'Actief: de AI kan alleen wat u hieronder toestaat.'],
  disabled: ['Вимкнено.', 'Uit.'],
  blocked: ['Доступ ШІ для цього облікового запису заблоковано.', 'AI-toegang voor dit account is geblokkeerd.'],
  no_grants: ['Немає жодного дозволу: ШІ нічого не може. Оберіть набір нижче.', 'Geen enkele toestemming: de AI kan niets. Kies hieronder een set.'],
  account_mismatch: ['На цій вкладці увійшов інший обліковий запис. Розширення відмовляє в командах (значок жовтий).', 'Op dit tabblad is een ander account aangemeld. De extensie weigert opdrachten (gele badge).'],
  browser_off: ['Головний вимикач цього браузера вимкнено.', 'De hoofdschakelaar van deze browser staat uit.'],
  not_armed: ['Чекає входу на сайті в цьому браузері.', 'Wacht op aanmelding op de site in deze browser.'],
  outdated: ['Застаріла версія розширення. Встановіть 0.4.0 і підключіть знову.', 'Verouderde versie van de extensie. Installeer 0.4.0 en koppel opnieuw.'],
};

// ---------------------------------------------------------------- externally_connectable
type ChromeRuntime = { sendMessage: (id: string, msg: unknown, cb: (res: unknown) => void) => void; lastError?: { message?: string } };
const runtime = (): ChromeRuntime | null => {
  const c = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime && typeof c.runtime.sendMessage === 'function' ? c.runtime : null;
};
export const EXTENSION_ID_RE = /^[a-p]{32}$/;

/** Stuurt een bericht naar de extensie; null bij geen extensie, verkeerd id of time-out. */
export function sendToExtension<T = Record<string, unknown>>(extensionId: string, message: Record<string, unknown>, timeoutMs = 8000): Promise<T | null> {
  const rt = runtime();
  if (!rt || !EXTENSION_ID_RE.test(extensionId)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      rt.sendMessage(extensionId, message, (res) => { clearTimeout(timer); void rt.lastError; resolve((res ?? null) as T | null); });
    } catch { clearTimeout(timer); resolve(null); }
  });
}
