// Zelftest van de browserextensie (SELF_TEST, extension/background.js selfTest) → weergave op de site (HUB-07, 19.10.2026).
// De extensie meldt {ok, version, checks:[{id, ok, detail}]} met ids per slot ('prive.paired', 'technisch.unlocked') en rauwe
// NL/EN-details ('till 2026-11-18', 'locked', 'epoch 3, 5 capabilities', 'profiel — gebruiker'). Hier:
//  - het OORDEEL komt van de site: alle VERPLICHTE controles (gekoppeld, sleutel, verbinding, instellingen) moeten slagen; informatieve
//    controles (ontgrendeld, debugger, diagnose, tabblad, brug, account, profiel) tellen niet mee en krijgen geen ✗ maar ○;
//  - elke regel in uk/nl, met het slot ervoor («як користувач» / «технічний»);
//  - «відкрита вкладка» = het tabblad waarin de test is gestart (deze pagina), niet het tabblad dat de extensie toevallig koos.
type Tr = (uk: string, nl: string) => string;
export type ZelftestCheck = { id: string; ok: boolean; detail?: string };
export type Zelftest = { ok: boolean; version?: string; checks?: ZelftestCheck[] };
export type ZelftestRegel = { id: string; soort: 'verplicht' | 'info'; ok: boolean; tekst: string; detail: string };

const SLOT_TEKST: Record<string, [string, string]> = { prive: ['як користувач', 'als gebruiker'], technisch: ['технічний', 'technisch'] };
export const CHECK_TEXT: Record<string, [string, string]> = {
  paired: ['підключено до облікового запису', 'gekoppeld aan het account'], command_key: ['ключ підпису команд', 'sleutel voor ondertekende opdrachten'],
  connected: ['з’єднання із сервером', 'verbinding met de server'], settings: ['дозволи отримано', 'toestemmingen ontvangen'],
  debugger_permission: ['дозвіл debugger', 'debugger-recht'], unlocked: ['доступ відкрито', 'toegang open'], diag_opt_in: ['діагностика ввімкнена', 'diagnose aan'],
  site_tab: ['відкрита вкладка сайту', 'open tabblad van de site'], bridge: ['зв’язок зі сторінкою', 'verbinding met de pagina'], account: ['той самий обліковий запис', 'hetzelfde account'],
  profiel: ['профіль вкладки', 'profiel van het tabblad'], extension: ['розширення', 'extensie'],
};
/** Informatief (zelfde lijst als de extensie): telt niet mee voor het oordeel. */
const INFO = new Set(['debugger_permission', 'diag_opt_in', 'site_tab', 'bridge', 'account', 'profiel', 'unlocked']);

const splits = (id: string): { slot: string; basis: string } => { const m = /^(prive|technisch)\.(.+)$/.exec(id); return m ? { slot: m[1], basis: m[2] } : { slot: '', basis: id }; };
export const isInfoCheck = (c: ZelftestCheck): boolean => { const { slot, basis } = splits(c.id); return INFO.has(basis) || (basis === 'paired' && !!slot && !c.ok); };

/** Rauw detail van de extensie → gewone taal. Onbekend → ongewijzigd. */
export function detailTekst(id: string, detail: string | undefined, tr: Tr, host: string): string {
  const d = String(detail || '').trim();
  const { basis } = splits(id);
  if (basis === 'site_tab') return host ? tr(`поточна вкладка — ${host}`, `huidig tabblad — ${host}`) : '';
  if (!d) return '';
  let m: RegExpExecArray | null;
  if ((m = /^till (\d{4}-\d{2}-\d{2})$/.exec(d))) return tr(`до ${m[1]}`, `tot ${m[1]}`);
  if ((m = /^till (\d{2}:\d{2}) UTC, (\d+) caps$/.exec(d))) return tr(`до ${m[1]} UTC, можливостей: ${m[2]}`, `tot ${m[1]} UTC, ${m[2]} mogelijkheden`);
  if (d === 'locked') return tr('заблоковано', 'vergrendeld');
  if ((m = /^epoch (-?\d+), (\d+) capabilities$/.exec(d))) return tr(`версія налаштувань ${m[1]}, можливостей: ${m[2]}`, `instellingen versie ${m[1]}, ${m[2]} mogelijkheden`);
  if ((m = /^buffer (\d+)$/.exec(d))) return tr(`у буфері: ${m[1]}`, `buffer: ${m[1]}`);
  if (basis === 'account') return d === 'ok' ? tr('збігається', 'komt overeen') : d === 'mismatch' ? tr('інший обліковий запис', 'ander account') : tr('невідомо', 'onbekend');
  if (basis === 'profiel') { const p = d.replace(/^profiel\s*[—-]\s*/i, ''); return p === 'technisch' ? tr('технічний', 'technisch') : p === 'gebruiker' ? tr('користувач', 'gebruiker') : p; }
  return d;
}

export function regelVan(c: ZelftestCheck, tr: Tr, host: string): ZelftestRegel {
  const { slot, basis } = splits(c.id);
  const naam = CHECK_TEXT[basis] ? tr(...CHECK_TEXT[basis]) : basis;
  const tekst = slot ? `${tr(...SLOT_TEKST[slot])}: ${naam}` : naam;
  return { id: c.id, soort: isInfoCheck(c) ? 'info' : 'verplicht', ok: !!c.ok, tekst, detail: detailTekst(c.id, c.detail, tr, host) };
}

/** Oordeel + regels. `ok` = alle verplichte controles geslaagd (en er is er minstens één). */
export function zelftestWeergave(test: Zelftest | null, tr: Tr, host = typeof location !== 'undefined' ? location.host : ''): { ok: boolean; versie: string; regels: ZelftestRegel[]; verplicht: number; mislukt: number } {
  const regels = (test?.checks ?? []).map((c) => regelVan(c, tr, host));
  const verplicht = regels.filter((r) => r.soort === 'verplicht');
  const mislukt = verplicht.filter((r) => !r.ok).length;
  return { ok: verplicht.length > 0 && mislukt === 0, versie: test?.version ? String(test.version) : '', regels, verplicht: verplicht.length, mislukt };
}
