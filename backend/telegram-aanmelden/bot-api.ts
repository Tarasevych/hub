// TELEGRAM-AANMELDEN v1 — kleine client voor de Telegram Bot API. Vaste host (api.telegram.org); in tests overschrijfbaar met
// TELEGRAM_API_BASIS (de nagebootste Bot API in tests/eenheid/hulp/nep-telegram.ts). De botsleutel komt alleen van
// botSleutel() (kluis van de eigenaar) en verschijnt nooit in een fout, logregel of antwoord: fouten dragen alleen een code.
//
// Foutsoorten voor de statusdienst:
//   tijdelijk — netwerk, time-out, 5xx, 429 (opnieuw proberen helpt);
//   vast      — 401/404 op de bot zelf (sleutel fout of ingetrokken), 403 «bot was blocked» per chat;
//   verzoek   — 400 (ons verzoek klopt niet; opnieuw proberen helpt niet).

export type BotFoutSoort = 'tijdelijk' | 'vast' | 'verzoek';
export class BotFout extends Error {
  constructor(public soort: BotFoutSoort, public code: string, public status = 0, public wachtSeconden = 0) { super(code); }
}

const basis = (): string => String(process.env.TELEGRAM_API_BASIS || 'https://api.telegram.org').replace(/\/+$/, '');
const TIJDSLIMIET_MS = 10_000;

/** Eén aanroep. `sleutel` is de botsleutel; `methode` een Bot API-methode (bv. «sendMessage»). */
export async function botAanroep<T = unknown>(sleutel: string, methode: string, gegevens: Record<string, unknown> = {}, opties: { tijdslimietMs?: number; bestand?: { veld: string; naam: string; type: string; inhoud: Buffer } } = {}): Promise<T> {
  if (!/^[0-9]{3,20}:[A-Za-z0-9_-]{20,80}$/.test(sleutel)) throw new BotFout('vast', 'SLEUTEL_ONGELDIG');
  if (!/^[a-zA-Z]{3,40}$/.test(methode)) throw new BotFout('verzoek', 'METHODE_ONGELDIG');
  const url = `${basis()}/bot${sleutel}/${methode}`;
  let lichaam: FormData | string;
  const koppen: Record<string, string> = {};
  if (opties.bestand) {
    const f = new FormData();
    for (const [k, v] of Object.entries(gegevens)) if (v !== undefined) f.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    f.set(opties.bestand.veld, new Blob([new Uint8Array(opties.bestand.inhoud)], { type: opties.bestand.type }), opties.bestand.naam);
    lichaam = f;
  } else {
    koppen['content-type'] = 'application/json';
    lichaam = JSON.stringify(gegevens);
  }
  let r: Response;
  try {
    r = await fetch(url, { method: 'POST', headers: koppen, body: lichaam, signal: AbortSignal.timeout(opties.tijdslimietMs ?? TIJDSLIMIET_MS), redirect: 'error' });
  } catch (e) {
    throw new BotFout('tijdelijk', (e as Error)?.name === 'TimeoutError' ? 'TIJDSLIMIET' : 'NETWERK');
  }
  const data = (await r.json().catch(() => null)) as { ok?: boolean; result?: T; error_code?: number; description?: string; parameters?: { retry_after?: number } } | null;
  if (r.ok && data?.ok) return data.result as T;
  const status = Number(data?.error_code || r.status || 0);
  const beschrijving = String(data?.description || '').toLowerCase();
  if (status === 429) throw new BotFout('tijdelijk', 'TE_VEEL_VERZOEKEN', status, Number(data?.parameters?.retry_after || 5));
  if (status >= 500 || status === 0) throw new BotFout('tijdelijk', 'TELEGRAM_STORING', status);
  if (status === 401 || status === 404) throw new BotFout('vast', 'SLEUTEL_INGETROKKEN', status);
  if (status === 403) throw new BotFout('vast', beschrijving.includes('blocked') ? 'BOT_GEBLOKKEERD' : 'GEEN_TOEGANG', status);
  if (beschrijving.includes('message is not modified')) throw new BotFout('verzoek', 'NIET_GEWIJZIGD', status);
  if (beschrijving.includes('query is too old') || beschrijving.includes('query id is invalid')) throw new BotFout('verzoek', 'KNOP_TE_OUD', status);
  throw new BotFout('verzoek', 'VERZOEK_ONGELDIG', status);
}

export type BotMij = { id: number; is_bot: boolean; username: string; first_name: string };
export type WebhookInfo = { url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string };

/** Downloadt een bestand van Telegram (profielfoto). Alleen paden zoals Telegram ze geeft; max. 1 MB. */
export async function botBestand(sleutel: string, pad: string): Promise<Buffer | null> {
  if (!/^[A-Za-z0-9_./-]{3,200}$/.test(pad) || pad.includes('..')) return null;
  try {
    const r = await fetch(`${basis()}/file/bot${sleutel}/${pad}`, { signal: AbortSignal.timeout(TIJDSLIMIET_MS), redirect: 'error' });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length <= 1_000_000 ? b : null;
  } catch { return null; }
}
