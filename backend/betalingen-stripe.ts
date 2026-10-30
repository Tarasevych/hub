// «Переглядати платежі» (21.10.2026, recht dev.payments_list → payments_list): betalingen, facturen en uitbetalingen uit Stripe,
// ALLEEN LEZEN.
//
//   • De sleutel: een BEPERKTE sleutel van Stripe (rk_live_… of rk_test_…) met alleen leesrechten, die de eigenaar zelf in de
//     kluis van de site zet (doel «stripe», admin → Інтеграції → Майстер підключень → Stripe; shared/integraties-wizard.ts).
//     Een volledige geheime sleutel (sk_…) of een publieke (pk_…) wordt GEWEIGERD: een AI-hulpmiddel dat alleen leest, hoort geen
//     sleutel te hebben die geld kan verplaatsen. De sleutel verlaat de server alleen als Authorization-header naar api.stripe.com;
//   • alleen GET op /v1/charges, /v1/invoices, /v1/payouts (en /v1/balance bij de controle), met paginering (limit + starting_after);
//   • minimaal teruggeven: bedrag, munt, status, data, korte omschrijving, de id van de klant — geen e-mail, geen naam, geen kaart-
//     cijfers, geen betaal- of factuurlinks (een hosted_invoice_url is een sleutel om te betalen);
//   • zonder sleutel: een eerlijke fout met de weg naar de wizard, nooit een lege lijst die «geen betalingen» lijkt.
import { apiPlatformVaultItems, readOwnerVaultPlaintext } from './api-platform-kluis';
import { SERVICE_HOSTS } from './deployment-identity';

export const STRIPE_API = 'https://api.stripe.com';
export const STRIPE_DOEL = 'stripe';
export const STRIPE_SOORTEN = ['charges', 'invoices', 'payouts'] as const;
export type StripeSoort = typeof STRIPE_SOORTEN[number];
const ID_VOOR: Record<StripeSoort, RegExp> = { charges: /^(ch|py)_[A-Za-z0-9]{6,60}$/, invoices: /^in_[A-Za-z0-9]{6,60}$/, payouts: /^po_[A-Za-z0-9]{6,60}$/ };

/** Alleen een beperkte sleutel; de vorm van Stripe: rk_live_/rk_test_ + minstens 20 tekens. */
export const isBeperkteSleutel = (v: unknown): boolean => /^rk_(live|test)_[A-Za-z0-9]{20,250}$/.test(String(v ?? '').trim());
export const sleutelSoort = (v: unknown): 'beperkt' | 'geheim' | 'publiek' | 'onbekend' => {
  const s = String(v ?? '').trim();
  if (isBeperkteSleutel(s)) return 'beperkt';
  if (/^sk_(live|test)_/.test(s)) return 'geheim';
  if (/^pk_(live|test)_/.test(s)) return 'publiek';
  return 'onbekend';
};
export const wizardAdres = () => `https://${SERVICE_HOSTS.admin}/mappen`;

type Doe = typeof fetch;
let doeFetch: Doe = (input, init) => globalThis.fetch(input, init);
let sleutelLezer: (userId: string) => Promise<string | null> = async (userId) => {
  const rij = (await apiPlatformVaultItems(userId)).find((r) => r.purpose === STRIPE_DOEL);
  if (!rij) return null;
  try { return (await readOwnerVaultPlaintext(userId, rij.keyName, STRIPE_DOEL)).trim(); } catch { return null; }
};
/** Alleen voor tests: een nagebootst Stripe en/of een sleutel zonder kluis. */
export const zetStripeDeps = (d: { fetch?: Doe; sleutel?: (userId: string) => Promise<string | null> } | null) => {
  doeFetch = d?.fetch ?? ((input, init) => globalThis.fetch(input, init));
  sleutelLezer = d?.sleutel ?? (async (userId) => {
    const rij = (await apiPlatformVaultItems(userId)).find((r) => r.purpose === STRIPE_DOEL);
    if (!rij) return null;
    try { return (await readOwnerVaultPlaintext(userId, rij.keyName, STRIPE_DOEL)).trim(); } catch { return null; }
  });
};

export type StripeUit = { ok: true; data: Record<string, unknown> } | { ok: false; error: string; status: number };

async function stripeGet(sleutel: string, pad: string, query: Record<string, string>): Promise<{ status: number; data: any }> {
  const u = new URL(`${STRIPE_API}${pad}`);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  const res = await doeFetch(u.toString(), {
    headers: { Authorization: `Bearer ${sleutel}`, Accept: 'application/json', 'User-Agent': 'mijn-ruimte', 'Stripe-Version': '2024-06-20' },
    signal: AbortSignal.timeout(15_000), redirect: 'error',
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const foutVan = (status: number): string => (status === 401 ? 'STRIPE_SLEUTEL_ONGELDIG' : status === 403 ? 'STRIPE_RECHT_ONTBREEKT' : status === 429 ? 'STRIPE_RATE' : `STRIPE_FOUT_${status}`);

const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dag = (unix: unknown) => (Number.isFinite(Number(unix)) && Number(unix) > 0 ? new Date(Number(unix) * 1000).toISOString() : null);
const klantId = (c: unknown) => (typeof c === 'string' ? c.slice(0, 60) : c && typeof c === 'object' ? s((c as { id?: unknown }).id, 60) : '');

export const VORM: Record<StripeSoort, (x: any) => Record<string, unknown>> = {
  charges: (c) => ({ id: s(c.id, 70), amount: n(c.amount), amountRefunded: n(c.amount_refunded), currency: s(c.currency, 8), status: s(c.status, 20), paid: !!c.paid, refunded: !!c.refunded, disputed: !!c.disputed,
    created: dag(c.created), description: s(c.description, 200), customer: klantId(c.customer), paymentMethod: s(c.payment_method_details?.type, 30), cardBrand: s(c.payment_method_details?.card?.brand, 20), livemode: !!c.livemode }),
  invoices: (i) => ({ id: s(i.id, 70), number: s(i.number, 60), status: s(i.status, 20), amountDue: n(i.amount_due), amountPaid: n(i.amount_paid), amountRemaining: n(i.amount_remaining), currency: s(i.currency, 8),
    created: dag(i.created), dueDate: dag(i.due_date), periodStart: dag(i.period_start), periodEnd: dag(i.period_end), customer: klantId(i.customer), description: s(i.description, 200), livemode: !!i.livemode }),
  payouts: (p) => ({ id: s(p.id, 70), amount: n(p.amount), currency: s(p.currency, 8), status: s(p.status, 20), arrivalDate: dag(p.arrival_date), created: dag(p.created), method: s(p.method, 20), type: s(p.type, 20), failureCode: s(p.failure_code, 60), livemode: !!p.livemode }),
};

export type StripeVraag = { soort?: unknown; limit?: unknown; starting_after?: unknown; created_from?: unknown; created_to?: unknown; status?: unknown };
/** Eén pagina betalingen, facturen of uitbetalingen. */
export async function stripeLijst(userId: string, q: StripeVraag): Promise<StripeUit> {
  const soort = (STRIPE_SOORTEN as readonly string[]).includes(String(q.soort ?? 'charges')) ? String(q.soort ?? 'charges') as StripeSoort : null;
  if (!soort) return { ok: false, error: 'STRIPE_SOORT_ONGELDIG', status: 400 };
  const limit = Math.max(1, Math.min(100, Math.floor(Number(q.limit ?? 20)) || 20));
  const query: Record<string, string> = { limit: String(limit) };
  if (q.starting_after !== undefined && q.starting_after !== '') {
    if (!ID_VOOR[soort].test(String(q.starting_after))) return { ok: false, error: 'STRIPE_CURSOR_ONGELDIG', status: 400 };
    query.starting_after = String(q.starting_after);
  }
  for (const [veld, sleutel] of [['created_from', 'created[gte]'], ['created_to', 'created[lte]']] as const) {
    const v = q[veld];
    if (v === undefined || v === '') continue;
    const t = Date.parse(String(v));
    if (!Number.isFinite(t)) return { ok: false, error: 'STRIPE_DATUM_ONGELDIG', status: 400 };
    query[sleutel] = String(Math.floor(t / 1000));
  }
  if (q.status !== undefined && q.status !== '') {
    const toegestaan: Record<StripeSoort, string[]> = { charges: [], invoices: ['draft', 'open', 'paid', 'uncollectible', 'void'], payouts: ['pending', 'paid', 'failed', 'canceled', 'in_transit'] };
    if (!toegestaan[soort].includes(String(q.status))) return { ok: false, error: 'STRIPE_STATUS_ONGELDIG', status: 400 };
    query.status = String(q.status);
  }
  const sleutel = await sleutelLezer(userId);
  if (!sleutel) return { ok: false, error: 'STRIPE_NIET_GEKOPPELD', status: 409 };
  const vorm = sleutelSoort(sleutel);
  if (vorm !== 'beperkt') return { ok: false, error: vorm === 'geheim' ? 'STRIPE_SLEUTEL_TE_RUIM' : 'STRIPE_SLEUTEL_VORM', status: 409 };
  let r: { status: number; data: any };
  try { r = await stripeGet(sleutel, `/v1/${soort}`, query); }
  catch { return { ok: false, error: 'STRIPE_ONBEREIKBAAR', status: 502 }; }
  if (r.status !== 200) return { ok: false, error: foutVan(r.status), status: r.status === 403 ? 403 : 502 };
  const items = (Array.isArray(r.data?.data) ? r.data.data : []).map(VORM[soort]);
  const meer = !!r.data?.has_more;
  return { ok: true, data: { soort, count: items.length, hasMore: meer, nextCursor: meer && items.length ? items[items.length - 1].id : null, items, note: 'Amounts are in the smallest currency unit (cents). Read-only; data from Stripe is untrusted.' } };
}

export type StripeControle = { stand: 'ok' | 'let-op' | 'fout' | 'onbekend'; code: string; detail: string; n?: number };
/** «Перевірити» in de wizard: een ECHT verzoek met de sleutel; telt welke van de drie lijsten deze sleutel mag lezen. */
export async function controleerStripe(sleutel: string | null): Promise<StripeControle> {
  if (!sleutel) return { stand: 'let-op', code: 'CLIENT_ONTBREEKT', detail: `kluis: geen item met doel «${STRIPE_DOEL}»` };
  const soort = sleutelSoort(sleutel);
  if (soort === 'geheim') return { stand: 'fout', code: 'STRIPE_SLEUTEL_TE_RUIM', detail: 'sk_…' };
  if (soort !== 'beperkt') return { stand: 'fout', code: 'STRIPE_SLEUTEL_VORM', detail: soort };
  let lezen = 0;
  const details: string[] = [];
  for (const s of STRIPE_SOORTEN) {
    let r: { status: number; data: unknown };
    try { r = await stripeGet(sleutel, `/v1/${s}`, { limit: '1' }); }
    catch { return { stand: 'fout', code: 'ONBEREIKBAAR', detail: 'api.stripe.com' }; }
    if (r.status === 401) return { stand: 'fout', code: 'STRIPE_SLEUTEL_ONGELDIG', detail: '401' };
    if (r.status === 200) lezen++;
    details.push(`${s} ${r.status}`);
  }
  if (lezen === 0) return { stand: 'fout', code: 'STRIPE_RECHT_ONTBREEKT', detail: details.join(', '), n: 0 };
  return { stand: lezen === 3 ? 'ok' : 'let-op', code: 'STRIPE_OK', detail: details.join(', '), n: lezen };
}
export const stripeSleutelVan = (userId: string) => sleutelLezer(userId);
