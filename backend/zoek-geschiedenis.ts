// ZOEKEN — GESCHIEDENIS OP DE SERVER (zone Z4, 22.10.2026; specificatie §10; migratie 0103 app.zoek_geschiedenis).
//
// WAT HIER STAAT
//   • de lade (userId + ruimte) van een geschiedenisverzoek: dezelfde live berekening als elke dienstpoort
//     (backend/ruimte-scheiding.ts → gegevensRuimteVeilig: rol, status, profiel en lopende activering uit de database; het
//     tabblad kan haar alleen VERKLEINEN). De ruimte komt dus nooit uit het verzoek en nooit uit de client;
//   • elke query draait onder alsGebruiker() (RLS 0103: user_id = app.huidige_gebruiker()) ÉN draagt zelf
//     `user_id = $1 AND ruimte = $2` — dubbel, zodat ook de systeemrol (zonder RLS) nooit kruist;
//   • bewaren = upsert op (lade, genormaliseerde vraag, filters): de laatste uitvoering wint, aantal_keer telt op;
//   • samenvoegen(momentopname, actueel) — zuiver: wat is NIEUW (nu wel, toen niet), wat is WEG (toen wel, nu niet), zonder dubbels;
//   • de routes /api/owner/zoek/geschiedenis/{lijst,open,bewaren,wis,wis-alles} — door dezelfde sessiecontrole als de rest.
//
// WAT ER NIET IN STAAT: geen titel, geen fragment, geen tekst van documenten — alleen (bron, id). Wie de tabel leest, leest
// geen inhoud; bij het heropenen legt de client de ids opnieuw tegen de echte zoekroute (poort + RLS), dus een ingetrokken
// recht laat een oud id gewoon als «niet meer beschikbaar» verdwijnen.
import { error, json } from '../server/platform';
import { alsGebruiker } from './ai-toestemmingen';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import type { Lade } from '../shared/ruimte-scheiding';
import { zoekNorm } from '../shared/zoek-normalisatie';
import { jsonbTekst } from '../shared/tekst-veilig';

export type Treffer = { bron: string; id: string };
export type GeschiedenisStand = 'vers' | 'verouderd' | 'vernieuwd' | 'fout';
export type GeschiedenisRij = {
  id: string; vraag: string; vraagNorm: string; filters: Record<string, unknown>; laatstOp: number; aantalKeer: number;
  algoritmeVersie: string; indexVersie: string; treffers: Treffer[]; totaal: number; stand: GeschiedenisStand;
};
export type BewaarInvoer = { vraag: string; filters?: unknown; treffers?: unknown; totaal?: unknown; algoritmeVersie?: unknown; indexVersie?: unknown; stand?: unknown };

export const GESCHIEDENIS_MAX = 100;       // rijen per lade die we bewaren (oudere gaan weg bij bewaren)
export const TREFFERS_MAX = 200;           // verwijzingen per rij (0103 CHECK)
const LIJST_MAX = 50;

const tekst = (v: unknown, max: number) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);

/** Alleen (bron, id): elke andere sleutel (titel, tekst, url, …) valt weg. Geen dubbels, begrensd. */
export function treffersSchonen(ruw: unknown): Treffer[] {
  if (!Array.isArray(ruw)) return [];
  const gezien = new Set<string>(); const uit: Treffer[] = [];
  for (const t of ruw) {
    if (!t || typeof t !== 'object') continue;
    const bron = tekst((t as Record<string, unknown>).bron, 40).toLowerCase().replace(/[^a-z_]/g, ''), id = tekst((t as Record<string, unknown>).id, 500);
    if (!bron || !id) continue;
    const k = `${bron}\u0000${id}`; if (gezien.has(k)) continue; gezien.add(k);
    uit.push({ bron, id });
    if (uit.length >= TREFFERS_MAX) break;
  }
  return uit;
}

/** Filters in vaste vorm: alleen bekende sleutels, lege waarden weg, lijsten gesorteerd → dezelfde filters = dezelfde rij. */
export function filtersSchonen(ruw: unknown): Record<string, unknown> {
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) return {};
  const uit: Record<string, unknown> = {};
  for (const k of Object.keys(ruw as object).sort()) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,30}$/.test(k)) continue;
    const v = (ruw as Record<string, unknown>)[k];
    if (Array.isArray(v)) { const l = [...new Set(v.map(x => tekst(x, 80)).filter(Boolean))].sort().slice(0, 40); if (l.length) uit[k] = l; }
    else if (typeof v === 'number' && Number.isFinite(v) && v !== 0) uit[k] = v;
    else if (typeof v === 'boolean' && v) uit[k] = v;
    else if (typeof v === 'string') { const s = tekst(v, 120); if (s && s !== 'any' && s !== 'all') uit[k] = s; }
  }
  return uit;
}

/** Zuiver: wat is nieuw en wat is weg tussen de momentopname en de actuele uitkomst. Geen dubbels (sleutel bron+id). */
export function samenvoegen(momentopname: readonly Treffer[], actueel: readonly Treffer[]): { nieuw: Treffer[]; weg: Treffer[]; gebleven: Treffer[] } {
  const sleutel = (t: Treffer) => `${t.bron}\u0000${t.id}`;
  const toen = new Map(momentopname.map(t => [sleutel(t), t])), nu = new Map(actueel.map(t => [sleutel(t), t]));
  return {
    nieuw: [...nu.values()].filter(t => !toen.has(sleutel(t))),
    weg: [...toen.values()].filter(t => !nu.has(sleutel(t))),
    gebleven: [...nu.values()].filter(t => toen.has(sleutel(t))),
  };
}

/**
 * De lade van dit geschiedenisverzoek. Persoonlijk tabblad → prive; tabblad met een geldige technische activering (en de
 * rechten daarvoor, live uit de database) → technisch. Elke fout → prive (minste rechten). De client kan nooit 'technisch'
 * afdwingen: gegevensRuimteVeilig gelooft het tabblad alleen als de activering in de database staat.
 */
export async function geschiedenisLade(userId: string, body: unknown): Promise<Lade> {
  const tab = body && typeof body === 'object' ? String((body as Record<string, unknown>).tabContext || '') : '';
  try { return { userId, ruimte: await gegevensRuimteVeilig(userId, { tabContext: tab }) }; } catch { return { userId, ruimte: 'prive' }; }
}

const rij = (r: Record<string, unknown>): GeschiedenisRij => ({
  id: String(r.id), vraag: String(r.vraag || ''), vraagNorm: String(r.vraag_norm || ''), filters: (r.filters as Record<string, unknown>) || {},
  laatstOp: Number(r.laatst || 0), aantalKeer: Number(r.aantal_keer || 1), algoritmeVersie: String(r.algoritme_versie || ''), indexVersie: String(r.index_versie || ''),
  treffers: treffersSchonen(r.treffers), totaal: Number(r.totaal || 0), stand: (['vers', 'verouderd', 'vernieuwd', 'fout'].includes(String(r.stand)) ? String(r.stand) : 'vers') as GeschiedenisStand,
});
const KOLOMMEN = `id, vraag, vraag_norm, filters, (extract(epoch FROM laatst_op) * 1000)::bigint AS laatst, aantal_keer, algoritme_versie, index_versie, treffers, totaal, stand`;

export async function geschiedenisLijst(lade: Lade, limiet = 30): Promise<GeschiedenisRij[]> {
  const n = Math.max(1, Math.min(LIJST_MAX, Math.floor(limiet) || 30));
  return alsGebruiker(lade.userId, async q => (await q(
    `SELECT ${KOLOMMEN} FROM app.zoek_geschiedenis WHERE user_id = $1 AND ruimte = $2 ORDER BY laatst_op DESC LIMIT $3`,
    [lade.userId, lade.ruimte, n])).rows.map(rij));
}

export async function geschiedenisOpenen(lade: Lade, id: string): Promise<GeschiedenisRij | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return alsGebruiker(lade.userId, async q => { const r = (await q(`SELECT ${KOLOMMEN} FROM app.zoek_geschiedenis WHERE user_id = $1 AND ruimte = $2 AND id = $3`, [lade.userId, lade.ruimte, id])).rows[0]; return r ? rij(r) : null; });
}

/**
 * Bewaren na een uitgevoerde zoekopdracht (upsert op lade + genormaliseerde vraag + filters). Bestond de rij al, dan geeft
 * `nieuw`/`weg` het verschil met de vorige momentopname (het heropenen uit §10); de momentopname wordt vervangen door de
 * actuele uitkomst (zonder dubbels), de datum bijgewerkt en de stand 'vernieuwd' (bestond ze) of 'vers' (nieuw).
 */
export async function geschiedenisBewaren(lade: Lade, invoer: BewaarInvoer): Promise<{ item: GeschiedenisRij; nieuw: Treffer[]; weg: Treffer[]; bestond: boolean } | null> {
  const vraag = tekst(invoer.vraag, 300), vraagNorm = zoekNorm(vraag, 300);
  if (vraag.length < 2 || !vraagNorm) return null;
  const filters = filtersSchonen(invoer.filters), treffers = treffersSchonen(invoer.treffers);
  const totaal = Math.max(treffers.length, Math.min(1_000_000, Math.floor(Number(invoer.totaal) || 0)));
  const alg = tekst(invoer.algoritmeVersie, 80), idx = tekst(invoer.indexVersie, 80);
  const standGevraagd = String(invoer.stand || '') === 'fout' ? 'fout' : null;
  return alsGebruiker(lade.userId, async q => {
    const vorige = (await q(`SELECT ${KOLOMMEN} FROM app.zoek_geschiedenis WHERE user_id = $1 AND ruimte = $2 AND vraag_norm = $3 AND filters_sleutel = md5($4::jsonb::text)`,
      [lade.userId, lade.ruimte, vraagNorm, jsonbTekst(filters)])).rows[0];
    const bestond = !!vorige;
    const verschil = bestond ? samenvoegen(rij(vorige).treffers, treffers) : { nieuw: [] as Treffer[], weg: [] as Treffer[], gebleven: [] as Treffer[] };
    const stand: GeschiedenisStand = standGevraagd ?? (bestond ? 'vernieuwd' : 'vers');
    // Bij een mislukte vernieuwing blijft de oude momentopname staan; alleen stand en datum veranderen.
    const bewaarTreffers = stand === 'fout' && bestond ? rij(vorige).treffers : treffers;
    const bewaarTotaal = stand === 'fout' && bestond ? rij(vorige).totaal : totaal;
    const r = (await q(
      `INSERT INTO app.zoek_geschiedenis (user_id, ruimte, vraag, vraag_norm, filters, laatst_op, aantal_keer, algoritme_versie, index_versie, treffers, totaal, stand)
       VALUES ($1, $2, $3, $4, $5::jsonb, now(), 1, $6, $7, $8::jsonb, $9, $10)
       ON CONFLICT (user_id, ruimte, vraag_norm, filters_sleutel) DO UPDATE SET
         vraag = EXCLUDED.vraag, laatst_op = now(), aantal_keer = app.zoek_geschiedenis.aantal_keer + 1,
         algoritme_versie = EXCLUDED.algoritme_versie, index_versie = EXCLUDED.index_versie,
         treffers = EXCLUDED.treffers, totaal = EXCLUDED.totaal, stand = EXCLUDED.stand
       RETURNING ${KOLOMMEN}`,
      [lade.userId, lade.ruimte, vraag, vraagNorm, jsonbTekst(filters), alg, idx, jsonbTekst(bewaarTreffers), bewaarTotaal, stand])).rows[0];
    // Begrenzing per lade: de oudste rijen boven GESCHIEDENIS_MAX gaan weg (binnen dezelfde lade, dubbel beveiligd).
    await q(`DELETE FROM app.zoek_geschiedenis WHERE user_id = $1 AND ruimte = $2 AND id IN (
               SELECT id FROM app.zoek_geschiedenis WHERE user_id = $1 AND ruimte = $2 ORDER BY laatst_op DESC OFFSET $3)`, [lade.userId, lade.ruimte, GESCHIEDENIS_MAX]);
    return { item: rij(r), nieuw: verschil.nieuw, weg: verschil.weg, bestond };
  });
}

/** Rijen waarvan de indexversie afwijkt markeren als 'verouderd' (aanroep door wie de index bijwerkt; optioneel). */
export async function geschiedenisVerouderen(lade: Lade, indexVersie: string): Promise<number> {
  const v = tekst(indexVersie, 80); if (!v) return 0;
  return alsGebruiker(lade.userId, async q => (await q(`UPDATE app.zoek_geschiedenis SET stand = 'verouderd' WHERE user_id = $1 AND ruimte = $2 AND stand <> 'verouderd' AND index_versie <> $3`, [lade.userId, lade.ruimte, v])).rowCount || 0);
}

export async function geschiedenisWissen(lade: Lade, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return alsGebruiker(lade.userId, async q => ((await q(`DELETE FROM app.zoek_geschiedenis WHERE user_id = $1 AND ruimte = $2 AND id = $3`, [lade.userId, lade.ruimte, id])).rowCount || 0) > 0);
}

export async function geschiedenisAllesWissen(lade: Lade): Promise<number> {
  return alsGebruiker(lade.userId, async q => (await q(`DELETE FROM app.zoek_geschiedenis WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte])).rowCount || 0);
}

// ---------------------------------------------------------------- routes
type User = { id: string; status: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
const bodyOf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});

/** Zelfde vorm als createGlobalSearchRoutes: de sessiecontrole van backend/index.ts (ownerRequireSession) beslist wie. */
export const createZoekGeschiedenisRoutes = (authorize: Authorize) => {
  const met = (fn: (lade: Lade, body: Record<string, unknown>) => Promise<unknown>) => [async (ctx: Context) => {
    const auth = await authorize(ctx.event, ctx.body);
    if ('errorCode' in auth || auth.user.status !== 'approved') return error('OWNER_ZOEK_GESCHIEDENIS_REQUIRED', 403);
    const lade = await geschiedenisLade(auth.user.id, ctx.body);
    try { return json({ ruimte: lade.ruimte, ...(await fn(lade, bodyOf(ctx.body)) as object) }); }
    catch (err) { console.error('[zoek-geschiedenis]', String((err as Error)?.message || err).slice(0, 200)); return error('ZOEK_GESCHIEDENIS_MISLUKT', 500); }
  }];
  return {
    'POST /api/owner/zoek/geschiedenis/lijst': met(async (lade, b) => ({ items: await geschiedenisLijst(lade, Number(b.limiet) || 30) })),
    'POST /api/owner/zoek/geschiedenis/open': met(async (lade, b) => { const item = await geschiedenisOpenen(lade, String(b.id || '')); return item ? { item } : { item: null, fout: 'ZOEK_GESCHIEDENIS_ONBEKEND' }; }),
    'POST /api/owner/zoek/geschiedenis/bewaren': met(async (lade, b) => (await geschiedenisBewaren(lade, b as BewaarInvoer)) || { item: null, nieuw: [], weg: [], bestond: false }),
    'POST /api/owner/zoek/geschiedenis/wis': met(async (lade, b) => ({ ok: await geschiedenisWissen(lade, String(b.id || '')) })),
    'POST /api/owner/zoek/geschiedenis/wis-alles': met(async (lade) => ({ ok: true, aantal: await geschiedenisAllesWissen(lade) })),
  };
};
