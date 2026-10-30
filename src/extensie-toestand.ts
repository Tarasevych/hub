// Toestandsmachine van de browserextensie op de site (0.4): één bron voor wat de gebruiker ziet en welke knoppen er zijn.
// not_installed → installed → paired → connected → enabled | disabled(reden). Elke toestand heeft precies de acties die
// daar werken (geen dode knoppen); 'test' is er altijd zodra de extensie aanwezig is.
// Ook: berichten aan de extensie via externally_connectable (PING, PAIR, OPEN_OPTIONS) met het extensie-id uit de "hello".
// 0.5 (18.10.2026): standaard vergrendeld. Geeft het paneel de live staat van de extensie mee (`ontgrendeling`, uit
// src/extensie/extensie-live.ts), dan wordt 'enabled' verfijnd tot 'locked' (wacht op passkey) → actie 'unlock',
// 'unlocked' (toegang open) of 'agent' (AI-agent verbonden) → actie 'revoke'. Zonder dat veld: precies het gedrag van 0.4.

export type ExtState = 'checking' | 'not_installed' | 'installed' | 'paired' | 'connected' | 'enabled' | 'disabled' | 'locked' | 'unlocked' | 'agent';
export type DisabledReason = 'blocked' | 'no_grants' | 'account_mismatch' | 'browser_off' | 'not_armed' | 'outdated';
export type ExtAction = 'install' | 'pair' | 'repair' | 'enable' | 'grant' | 'relogin' | 'update' | 'test' | 'stop' | 'options' | 'unlock' | 'revoke';

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
  /** 0.5: staat zoals de extensie/server hem meldt (ExtensieStaat of 'onbekend'). Weglaten = 0.4-gedrag ('enabled'). */
  ontgrendeling?: 'niet-gekoppeld' | 'vergrendeld' | 'ontgrendeld' | 'agent' | 'onbekend';
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
  if (i.ontgrendeling === undefined) return { state: 'enabled', actions: ['grant', ...base] };
  if (i.ontgrendeling === 'ontgrendeld') return { state: 'unlocked', actions: ['revoke', 'grant', ...base] };
  if (i.ontgrendeling === 'agent') return { state: 'agent', actions: ['revoke', 'grant', ...base] };
  // vergrendeld, onbekend of (nog) niet gemeld: standaard dicht — alleen ontgrendelen met passkey helpt.
  return { state: 'locked', actions: ['unlock', 'grant', ...base] };
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
  locked: ['Розширення заблоковане: ШІ нічого не може й нічого не збирається. Розблокуйте його з Passkey нижче.', 'De extensie is vergrendeld: de AI kan niets en er wordt niets verzameld. Ontgrendel hieronder met een passkey.'],
  unlocked: ['Доступ відкрито: ШІ може лише те, що дозволено, і лише до кінця розблокування.', 'Toegang open: de AI kan alleen wat is toegestaan, en alleen tot het einde van de ontgrendeling.'],
  agent: ['ШІ-агент підключено й зараз працює з цим браузером.', 'Een AI-agent is verbonden en werkt nu met deze browser.'],
  blocked: ['Доступ ШІ для цього облікового запису заблоковано.', 'AI-toegang voor dit account is geblokkeerd.'],
  no_grants: ['Немає жодного дозволу: ШІ нічого не може. Оберіть набір нижче.', 'Geen enkele toestemming: de AI kan niets. Kies hieronder een set.'],
  account_mismatch: ['На цій вкладці увійшов інший обліковий запис. Розширення відмовляє в командах (значок жовтий).', 'Op dit tabblad is een ander account aangemeld. De extensie weigert opdrachten (gele badge).'],
  browser_off: ['Головний вимикач цього браузера вимкнено.', 'De hoofdschakelaar van deze browser staat uit.'],
  not_armed: ['Чекає входу на сайті в цьому браузері.', 'Wacht op aanmelding op de site in deze browser.'],
  outdated: ['Застаріла версія розширення (потрібна щонайменше 0.4.0). Оновіть її — кнопки на смузі «Доступне оновлення» внизу сторінки — і підключіть знову.', 'Verouderde versie van de extensie (minstens 0.4.0 nodig). Werk bij met de knoppen op de strook «Update beschikbaar» onderaan en koppel opnieuw.'],
};

/** 0.6: slot «як користувач» — andere oorzaak en andere stap (step-up van de sessie, geen passkey of technisch profiel). */
export const EXT_TEXT_PRIVE: Readonly<Partial<Record<ExtState | DisabledReason, [string, string]>>> = Object.freeze({
  locked: ['Доступ як користувач закрито: ШІ нічого не може через розширення й нічого не збирається. Відкрийте його нижче (сайт попросить підтвердити доступ).', 'De toegang als gebruiker is dicht: de AI kan via de extensie niets en er wordt niets verzameld. Open hem hieronder (de site vraagt de toegang te bevestigen).'],
  unlocked: ['Доступ відкрито: ШІ може лише те, що ви дозволили, лише на ваших сторінках і до кінця строку.', 'Toegang open: de AI kan alleen wat u toestond, alleen op uw pagina’s en tot het einde van de termijn.'],
});
/** Tekst van een toestand voor een slot ('prive' heeft eigen teksten waar de oorzaak anders is). */
export const extTekst = (view: ExtView, slot?: 'prive' | 'technisch'): [string, string] => {
  const k = view.reason ?? view.state;
  return (slot === 'prive' ? EXT_TEXT_PRIVE[k] : undefined) ?? EXT_TEXT[k];
};

// ---------------------------------------------------------------- externally_connectable
type ChromeRuntime = { sendMessage: (id: string, msg: unknown, cb: (res: unknown) => void) => void; lastError?: { message?: string } };
const runtime = (): ChromeRuntime | null => {
  const c = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime && typeof c.runtime.sendMessage === 'function' ? c.runtime : null;
};
/** Meldingen van de installatiehulp («Розширення знайдено», «підключено», «дозволено», «Готово: ШІ активний») bij een overgang.
 *  E-01 (audit fase 2): «Готово» verscheen na «Відкликати зараз» — de wizard meldde bij ELKE wissel naar armed (bv. de agentlijst
 *  die na een actie even leeg is en dan terugkomt). Nu meldt hij alleen bij een echte overgang: beide metingen mét agent, en
 *  «enabled»/«Готово» alleen als de schakelaar zelf van uit naar aan ging (of de gebruiker hem net in deze hulp aanzette). */
export type WizardStand = { present: boolean; paired: boolean; hasAgent: boolean; enabled: boolean; armed: boolean };
export type WizardMelding = 'gevonden' | 'gekoppeld' | 'ingeschakeld' | 'klaar';
export function wizardMeldingen(vorig: WizardStand | null, nu: WizardStand, netAangezet = false): WizardMelding[] {
  if (!vorig) return []; // eerste meting = beginstand: niets melden
  const uit: WizardMelding[] = [];
  if (!vorig.present && nu.present) uit.push('gevonden');
  if (!vorig.paired && nu.paired && nu.hasAgent) uit.push('gekoppeld');
  // Alleen met een agent in beide metingen: een ontbrekende agent (lijst wordt herladen) is geen «uit».
  const echteOvergang = vorig.hasAgent && nu.hasAgent && (netAangezet || !vorig.enabled) && nu.enabled;
  if (echteOvergang && !vorig.enabled) uit.push('ingeschakeld');
  if (echteOvergang && !vorig.armed && nu.armed) uit.push('klaar');
  return uit;
}

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
