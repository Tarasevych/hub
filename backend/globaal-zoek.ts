import { db, error, json } from '../server/platform';
/**
 * GESCHEIDEN GEGEVENSRUIMTES — HET TWEEDE GAT VAN KLACHT 1 (eigenaar, 20.10.2026). «Пошук усюди» leest de projecties van
 * post (ONDERWERP, AFZENDER ÉN BRIEFTEKST), van de hmara, van Drive en van de agenda, maar staat onder /api/owner/global-search
 * en dus buiten de poort van post (backend/mail-ruimte.ts) en die van hmara en agenda (backend/ruimte-cloud-agenda.ts). Zij
 * filterde op alleen `ownerUserId`: één mens = één lade. Daarmee kon in de technische ruimte de PERSOONLIJKE post worden
 * doorzocht ook als post daar nooit verbonden was — en omgekeerd verschenen technische rijen in de persoonlijke ruimte.
 * Deze route is bovendien het AI-hulpmiddel `site_search` (backend/site-hulpmiddelen.ts), dus het gat stond ook open voor elke
 * connector. Nu gaat elke bron door dezelfde poort als haar dienst (backend/ruimte-projecties.ts); een gesloten dienst
 * levert GEEN resultaten en wordt met tweetalige uitleg gemeld in `gesloten`.
 *
 * ZOEKKERN v2 (Z1, 22.10.2026). Eén kern voor alles (backend/zoek-index.ts, contract docs/zoek/ZOEKEN.nl.md §4):
 *  • POST /api/owner/zoek            — ZoekVraag → ZoekAntwoord (facets, pagina's, uitleg, percent 0–100, fragment met posities);
 *  • POST /api/owner/zoek/suggesties — autoaanvulling/correcties uit de EIGEN lade;
 *  • POST /api/owner/zoek/stand      — echte stand per bron (geteld, niet beweerd);
 *  • POST /api/owner/global-search   — de OUDE vorm (hub-pagina van Etap D, AI-hulpmiddel site_search) bovenop dezelfde kern.
 * De index is altijd aan (ZOEK_INDEX is weg). Alleen als de index voor deze laden LEEG is, zoekt de oude route in het geheugen
 * (db.list ≤ 1000 rijen per bron) en meldt dat met `index:false` / `bron:'live'`.
 * Laden: elke bron met een dienst gaat door projectieLaden (gedeeld = de persoonlijke lade; uit/bevroren = niets); bronnen
 * zonder dienst (ui/pagina/instelling/hulp) liggen in de basisruimte van dit tabblad (gegevensRuimteVeilig).
 */
import { geslotenDiensten, herkomstUitBody, projectieLaden, rijenInLade } from './ruimte-projecties';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import { huidigeRuimte } from './mcp-namens';
import { DEELBARE_DIENSTEN, type Lade, type LadeBesluit } from '../shared/ruimte-scheiding';
import { breidUit } from '../shared/zoek-synoniemen';
import { zoekNorm, zoekTokens } from '../shared/zoek-normalisatie';
import { fragmentMetPosities, percentVan, scoreVanSignalen, signalenInGeheugen, uitlegVan, vraagGroepen, type Veld } from '../shared/zoek-rangschikking';
import { DIENST_VAN_BRON, ZOEK_BRONNEN, ZOEK_VERSIE, isZoekBron, isZoekSoort, isZoekTaal, type ZoekAntwoord, type ZoekBron, type ZoekTreffer, type ZoekVraag } from '../shared/zoek-model';
import { aantalInLade, standenVanLade, suggesties as kernSuggesties, zoekInLaden } from './zoek-index';

type User = { id: string; status: string; role?: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
type Source = 'mail' | 'drive' | 'cloud' | 'calendar' | ZoekBron;
type Result = { id: string; source: Source; title: string; subtitle: string; excerpt: string; updatedAt: number; score: number; relevance: number; targetService: 'mail' | 'cloud' | 'hub' | 'id' | 'mcp' | 'ai'; targetTab: string; route?: unknown; percent?: number; uitleg?: unknown; pad?: string; soort?: string };

const safe = (v: unknown, m = 1000) => String(v || '').replace(/\u0000/g, '').trim().slice(0, m);
const bodyOf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
const authOf = async (authorize: Authorize, ctx: Context) => { const auth = await authorize(ctx.event, ctx.body); return 'errorCode' in auth || auth.user.status !== 'approved' ? null : auth; };
const list = async <T extends object>(table: string, ownerUserId: string) => (await db.list<T>(table, { filter: { ownerUserId }, limit: 1000 })).items as Array<T & { id: string }>;
const DOEL: Record<string, { targetService: Result['targetService']; targetTab: string }> = {
  mail: { targetService: 'mail', targetTab: 'inbox' }, bijlage: { targetService: 'mail', targetTab: 'inbox' }, contact: { targetService: 'mail', targetTab: 'contacts' },
  cloud: { targetService: 'cloud', targetTab: 'search' }, drive: { targetService: 'cloud', targetTab: 'accounts' }, calendar: { targetService: 'cloud', targetTab: 'calendar' }, agenda: { targetService: 'cloud', targetTab: 'calendar' },
  bord: { targetService: 'hub', targetTab: 'bord' }, github: { targetService: 'hub', targetTab: 'github' }, ui: { targetService: 'hub', targetTab: '' }, pagina: { targetService: 'hub', targetTab: '' },
  instelling: { targetService: 'hub', targetTab: 'instellingen' }, hulp: { targetService: 'hub', targetTab: 'hulp' }, apparaat: { targetService: 'mcp', targetTab: 'apparaten' },
};

// ------------------------------------------------------------------------------------------------ laden per bron
type Laden = Record<(typeof DEELBARE_DIENSTEN)[number], LadeBesluit>;
type LadeGroep = { lade: Lade; bronnen: ZoekBron[] };
/** Welke (lade, bronnen)-groepen mag dit verzoek doorzoeken? Gesloten dienst → haar bronnen vallen weg. */
export async function ladeGroepen(userId: string, rol: string | null | undefined, body: unknown): Promise<{ groepen: LadeGroep[]; laden: Laden; basis: Lade; perBron: Record<string, string> }> {
  const herkomst = herkomstUitBody(userId, rol, body);
  const tab = typeof herkomst.tabContext === 'string' ? herkomst.tabContext : '';
  const [laden, basisRuimte] = await Promise.all([projectieLaden(herkomst, DEELBARE_DIENSTEN), gegevensRuimteVeilig(userId, { tabContext: tab, aiRuimte: tab ? null : huidigeRuimte() })]);
  const basis: Lade = { userId, ruimte: basisRuimte };
  const perLade = new Map<string, LadeGroep>(); const perBron: Record<string, string> = {};
  const voeg = (lade: Lade, bron: ZoekBron) => { const k = lade.ruimte; const g = perLade.get(k) || { lade, bronnen: [] }; g.bronnen.push(bron); perLade.set(k, g); perBron[bron] = lade.ruimte; };
  for (const bron of ZOEK_BRONNEN) {
    const dienst = DIENST_VAN_BRON[bron];
    if (!dienst) { voeg(basis, bron); continue; }
    const b = laden[dienst]; if (b?.ok) voeg(b.lade, bron);
  }
  return { groepen: [...perLade.values()], laden, basis, perBron };
}

const vraagUitBody = (body: Record<string, unknown>): ZoekVraag => {
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(x => String(x)) : typeof v === 'string' && v ? [v] : []);
  const sorteer = String(body.sorteer || 'relevantie');
  return {
    q: safe(body.q ?? body.query, 300), bronnen: arr(body.bronnen).filter(isZoekBron), soorten: arr(body.soorten).filter(isZoekSoort), formaten: arr(body.formaten).slice(0, 20), talen: arr(body.talen).filter(isZoekTaal),
    sinds: Number(body.sinds) || undefined, tot: Number(body.tot) || undefined, sorteer: (['relevantie', 'nieuwste', 'oudste', 'titel'].includes(sorteer) ? sorteer : 'relevantie') as ZoekVraag['sorteer'],
    pagina: Number(body.pagina) || 1, perPagina: Number(body.perPagina) || 20, vaag: body.vaag !== false, synoniemen: body.synoniemen !== false, facets: body.facets !== false,
  };
};

// ------------------------------------------------------------------------------------------------ geheugen (terugval)
/** Het oude zoeken in het geheugen: alleen de vier projectiebronnen, ≤ 1000 rijen per bron. Dezelfde poort (rijenInLade). */
async function zoekLive(userId: string, laden: Laden, query: string): Promise<Result[]> {
  const queryTokens = zoekTokens(query), groepen = vraagGroepen(queryTokens, breidUit(queryTokens)), qNorm = zoekNorm(query, 300);
  // Dezelfde signalen/formule als de index (shared/zoek-rangschikking.ts), incl. de dekkingsregel (≥ ½ van de groepen):
  // velden met gewicht ≥ 5 tellen als «titel/omschrijving», de rest als tekst.
  const score = (titel: unknown, fields: Veld[], bijgewerktOp: number) => {
    const s = signalenInGeheugen({ vraagNorm: qNorm, groepen, titel: safe(titel, 2000), omschrijving: fields.filter(([, w]) => w >= 5).map(([v]) => safe(v, 2000)).join(' '), tekst: fields.filter(([, w]) => w < 5).map(([v]) => safe(v, 20000)).join(' '), bijgewerktOp });
    return s ? scoreVanSignalen(s) : 0;
  };
  const excerpt = (value: unknown) => { const text = safe(value, 5000); if (!text) return ''; const n = zoekNorm(text); const pos = queryTokens.map(t => n.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0] || 0; const start = Math.max(0, pos - 80); return `${start ? '…' : ''}${text.slice(start, start + 360)}${text.length > start + 360 ? '…' : ''}`; };
  const [mailRuw, cloudRuw, driveRuw, calendarRuw] = await Promise.all([list<Record<string, unknown>>('mail_items_v1', userId), list<Record<string, unknown>>('cloud_items_v1', userId), list<Record<string, unknown>>('google_suite_drive_projection_v1', userId), list<Record<string, unknown>>('google_suite_calendar_events_v1', userId)]);
  const results: Result[] = [];
  for (const row of rijenInLade(mailRuw, laden.mail)) { const v = score(row.subject, [[row.subject, 9], [row.senderName, 6], [row.senderEmail, 6], [row.body, 2], [row.labelIds, 2], [row.taskTitle, 3]], Number(row.receivedAt || row.updatedAt || 0)); if (v) results.push({ id: row.id, source: 'mail', title: safe(row.subject, 500), subtitle: [safe(row.senderName, 200), safe(row.senderEmail, 320)].filter(Boolean).join(' · '), excerpt: excerpt(row.body), updatedAt: Number(row.receivedAt || row.updatedAt || 0), score: v, relevance: v, ...DOEL.mail }); }
  for (const row of rijenInLade(cloudRuw, laden.cloud)) { const v = score(row.title || row.originalName, [[row.title, 9], [row.originalName, 7], [row.description, 5], [row.textContent, 2], [row.tags, 5], [row.people, 4], [row.mimeType, 1]], Number(row.updatedAt || row.createdAt || 0)); if (v) results.push({ id: row.id, source: 'cloud', title: safe(row.title, 500) || safe(row.originalName, 500), subtitle: safe(row.description, 500), excerpt: excerpt(row.textContent || row.sourceUrl), updatedAt: Number(row.updatedAt || row.createdAt || 0), score: v, relevance: v, ...DOEL.cloud }); }
  for (const row of rijenInLade(driveRuw, laden.cloud)) { const v = score(row.name, [[row.name, 10], [row.description, 4], [row.mimeType, 2], [row.parentIds, 1]], Number(row.modifiedAt || row.updatedAt || 0)); if (v) results.push({ id: row.id, source: 'drive', title: safe(row.name, 500), subtitle: safe(row.mimeType, 200), excerpt: excerpt(row.description), updatedAt: Number(row.modifiedAt || row.updatedAt || 0), score: v, relevance: v, ...DOEL.drive }); }
  for (const row of rijenInLade(calendarRuw, laden.agenda)) { const v = score(row.summary, [[row.summary, 10], [row.description, 4], [row.location, 5], [row.start, 2]], Number(row.providerUpdatedAt || row.updatedAt || 0)); if (v) results.push({ id: row.id, source: 'calendar', title: safe(row.summary, 500), subtitle: [safe(row.start, 100), safe(row.location, 300)].filter(Boolean).join(' · '), excerpt: excerpt(row.description), updatedAt: Number(row.providerUpdatedAt || row.updatedAt || 0), score: v, relevance: v, ...DOEL.calendar }); }
  // `relevance`/`percent` = 0–100 t.o.v. het maximum van DEZE zoekopdracht (zelfde methode als de index); `score` = ruwe score.
  const max = results.reduce((m, r) => Math.max(m, r.score), 0);
  for (const r of results) { r.relevance = percentVan(r.score, max); r.percent = r.relevance; }
  return results;
}
/** Live-rijen → ZoekAntwoord (uitleg, percent, fragment, facets, pagina) zodat /api/owner/zoek ook zonder index werkt. */
function liveNaarAntwoord(results: Result[], vraag: ZoekVraag, t0: number): ZoekAntwoord {
  const tokens = zoekTokens(vraag.q), groepen = vraagGroepen(tokens, breidUit(tokens)), qNorm = zoekNorm(vraag.q, 300), cyr = /[\u0400-\u04ff]/.test(vraag.q);
  const bronVan = (s: Source): ZoekBron => (s === 'calendar' ? 'agenda' : s as ZoekBron);
  let alle = results.map(r => {
    const s = signalenInGeheugen({ vraagNorm: qNorm, groepen, titel: r.title, omschrijving: r.subtitle, tekst: r.excerpt, bijgewerktOp: r.updatedAt });
    const { fragment, afgeleid } = fragmentMetPosities({ titel: r.title, omschrijving: r.subtitle, tekst: r.excerpt }, groepen, cyr);
    const sig = s ? { ...s, ...afgeleid } : null;
    return { r, score: r.score, fragment, uitleg: sig ? uitlegVan(sig) : [] };
  }).filter(x => !vraag.bronnen?.length || vraag.bronnen.includes(bronVan(x.r.source)));
  if (vraag.sinds) alle = alle.filter(x => x.r.updatedAt >= Number(vraag.sinds)); if (vraag.tot) alle = alle.filter(x => x.r.updatedAt <= Number(vraag.tot));
  alle.sort((a, b) => (vraag.sorteer === 'nieuwste' ? b.r.updatedAt - a.r.updatedAt : vraag.sorteer === 'oudste' ? a.r.updatedAt - b.r.updatedAt : vraag.sorteer === 'titel' ? a.r.title.localeCompare(b.r.title) : b.score - a.score || b.r.updatedAt - a.r.updatedAt));
  const max = alle[0]?.score || 0, perPagina = Math.max(1, Math.min(100, vraag.perPagina || 20)), pagina = Math.max(1, vraag.pagina || 1);
  const facets = { bron: {} as Record<string, number>, soort: {} as Record<string, number>, formaat: {} as Record<string, number>, taal: {} as Record<string, number> };
  for (const x of alle) { const b = bronVan(x.r.source); facets.bron[b] = (facets.bron[b] || 0) + 1; }
  const items: ZoekTreffer[] = alle.slice((pagina - 1) * perPagina, pagina * perPagina).map(x => ({
    id: x.r.id, bron: bronVan(x.r.source), soort: x.r.source === 'mail' ? 'bericht' : x.r.source === 'calendar' ? 'afspraak' : 'bestand', titel: x.r.title, titels: {}, omschrijving: x.r.subtitle, pad: '', route: { host: x.r.targetService === 'mail' ? 'mail' : 'cloud', pad: '/', params: { tab: x.r.targetTab, id: x.r.id } },
    taal: '', formaat: '', bijgewerktOp: x.r.updatedAt, extra: {}, integratie: '', score: x.score, percent: percentVan(x.score, max), uitleg: x.uitleg, fragment: x.fragment,
  }));
  return { q: vraag.q, qNorm, items, ...(vraag.facets !== false ? { facets } : {}), suggesties: [], totaal: alle.length, pagina, perPagina, bron: 'live', duurMs: Date.now() - t0, versie: ZOEK_VERSIE };
}

/** Treffer uit de kern → oude vorm (hub-pagina Etap D en site_search). */
const trefferNaarResult = (t: ZoekTreffer): Result => {
  const doel = DOEL[t.bron] || DOEL.ui;
  const tab = t.route?.params?.tab || doel.targetTab;
  return { id: t.id, source: (t.bron === 'agenda' ? 'calendar' : t.bron) as Source, title: safe(t.titel, 500), subtitle: safe(t.omschrijving || t.pad, 500), excerpt: safe(t.fragment.tekst, 400), updatedAt: t.bijgewerktOp, score: t.percent, relevance: t.percent, targetService: (t.route?.host as Result['targetService']) || doel.targetService, targetTab: tab, route: t.route, percent: t.percent, uitleg: t.uitleg, pad: t.pad, soort: t.soort };
};

export const createGlobalSearchRoutes = (authorize: Authorize) => ({
  // ---------------------------------------------------------------------------------------------- de kern
  'POST /api/owner/zoek': [async (ctx: Context) => {
    const auth = await authOf(authorize, ctx); if (!auth) return error('OWNER_GLOBAL_SEARCH_REQUIRED', 403);
    const t0 = Date.now(), body = bodyOf(ctx.body), vraag = vraagUitBody(body);
    if (vraag.q.length < 2 || !zoekTokens(vraag.q).length) return error('GLOBAL_SEARCH_QUERY_REQUIRED', 400);
    const { groepen, laden, perBron } = await ladeGroepen(auth.user.id, auth.user.role, ctx.body);
    let antwoord: ZoekAntwoord;
    const aantal = (await Promise.all(groepen.map(g => aantalInLade(g.lade, g.bronnen).catch(() => 0)))).reduce((s, n) => s + n, 0);
    if (aantal > 0) antwoord = await zoekInLaden(groepen, vraag);
    else antwoord = liveNaarAntwoord(await zoekLive(auth.user.id, laden, vraag.q), vraag, t0);
    return json({ ...antwoord, laden: perBron, gesloten: geslotenDiensten(laden) });
  }],
  'POST /api/owner/zoek/suggesties': [async (ctx: Context) => {
    const auth = await authOf(authorize, ctx); if (!auth) return error('OWNER_GLOBAL_SEARCH_REQUIRED', 403);
    const body = bodyOf(ctx.body), prefix = safe(body.prefix ?? body.q, 200);
    if (!prefix) return json({ prefix, suggesties: [] });
    const { groepen } = await ladeGroepen(auth.user.id, auth.user.role, ctx.body);
    const gevraagd = Array.isArray(body.bronnen) ? body.bronnen.map(String).filter(isZoekBron) : [];
    const uit = (await Promise.all(groepen.map(g => kernSuggesties(g.lade, prefix, { bronnen: gevraagd.length ? g.bronnen.filter(b => gevraagd.includes(b)) : g.bronnen, max: 12 }).catch(() => [])))).flat();
    const gezien = new Set<string>();
    return json({ prefix, suggesties: uit.filter(s => { const k = `${s.soort}:${s.tekst}:${s.id || ''}:${s.bron || ''}`; if (gezien.has(k)) return false; gezien.add(k); return true; }).slice(0, 15) });
  }],
  'POST /api/owner/zoek/stand': [async (ctx: Context) => {
    const auth = await authOf(authorize, ctx); if (!auth) return error('OWNER_GLOBAL_SEARCH_REQUIRED', 403);
    const { groepen, laden, perBron } = await ladeGroepen(auth.user.id, auth.user.role, ctx.body);
    const standen = (await Promise.all(groepen.map(g => standenVanLade(g.lade, g.bronnen).catch(() => [])))).flat();
    return json({ standen, laden: perBron, gesloten: geslotenDiensten(laden) });
  }],
  // ---------------------------------------------------------------------------------------------- de oude vorm (hub Etap D, site_search)
  'POST /api/owner/global-search': [async (ctx: Context) => {
    const auth = await authOf(authorize, ctx); if (!auth) return error('OWNER_GLOBAL_SEARCH_REQUIRED', 403);
    const body = bodyOf(ctx.body), query = safe(body.query, 300);
    if (query.length < 2 || !zoekTokens(query).length) return error('GLOBAL_SEARCH_QUERY_REQUIRED', 400);
    const currentService = safe(body.currentService, 40), currentTab = safe(body.currentTab, 80);
    const { groepen, laden } = await ladeGroepen(auth.user.id, auth.user.role, ctx.body);
    const aantal = (await Promise.all(groepen.map(g => aantalInLade(g.lade, g.bronnen).catch(() => 0)))).reduce((s, n) => s + n, 0);
    let results: Result[]; let index = aantal > 0;
    if (index) {
      try { results = (await zoekInLaden(groepen, { q: query, perPagina: 100, facets: false })).items.map(trefferNaarResult); }
      catch (err) { console.warn('[global-search] zoekindex niet bruikbaar, terug naar geheugen:', String((err as Error)?.message || err).slice(0, 200)); index = false; results = await zoekLive(auth.user.id, laden, query); }
    } else results = await zoekLive(auth.user.id, laden, query);
    const preferred: Source = currentService === 'mail' ? 'mail' : currentService === 'cloud' && currentTab === 'calendar' ? 'calendar' : currentService === 'cloud' && currentTab === 'accounts' ? 'drive' : 'cloud';
    const volgorde: Source[] = [preferred, ...(['mail', 'drive', 'cloud', 'calendar'] as Source[]).filter(s => s !== preferred), ...[...new Set(results.map(r => r.source))].filter(s => !['mail', 'drive', 'cloud', 'calendar'].includes(s))];
    const groups = volgorde.map(source => ({ source, current: source === preferred, items: results.filter(r => r.source === source).sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt).slice(0, 20) })).filter(g => g.items.length);
    return json({ query, mode: index ? 'zoek_kern_2' : 'owner_scoped_projection_search_v1', ranking: index ? 'zoek_kern_2_percent' : 'relevance_0_100_v1', index, preferredSource: preferred, total: groups.reduce((s, g) => s + g.items.length, 0), groups, gesloten: geslotenDiensten(laden) });
  }],
});
