// ZOEKKERN v2 — DE INDEX IN POSTGRESQL (Z1, 22.10.2026; migraties 0093 + 0094 + 0100). Contract: scratchpad/zoek-API.md en
// shared/zoek-model.ts. Dit is de ENIGE zoekroute: backend/globaal-zoek.ts (oude vorm + /api/owner/zoek), het AI-hulpmiddel
// site_search en de bronnen van Z2 (indexeer/verwijder/stand) komen allemaal hier.
//
// ISOLATIE — NIET ONDERHANDELBAAR
//   • de lade (userId + ruimte) komt UITSLUITEND van de server (poort backend/ruimte-projecties.ts / gegevensLade);
//     nooit uit het verzoek. zoekInLaden() accepteert alleen laden van ÉÉN gebruiker.
//   • elke query draait onder alsGebruiker() (RLS 0094: user_id = app.huidige_gebruiker()) ÉN draagt zelf
//     `user_id = $1 AND ruimte = …` — dubbel, zodat ook de systeemrol (zonder RLS) nooit kruist;
//   • alles is geparametriseerd; tsquery-tekst wordt uit tokens [a-z0-9] (of \p{L}\p{N} voor de stemmers) opgebouwd en
//     als PARAMETER aan to_tsquery() gegeven — nooit geïnterpoleerd;
//   • suggesties/correcties komen alleen uit de lade van de aanroeper (en het ingebouwde woordenboek).
import { maskeerGeheimen } from '../shared/geheim-patronen';
import { createHash } from 'node:crypto';
import { alsGebruiker } from './ai-toestemmingen';
import { verrijkDiepeRoutes } from './zoek/diepe-link';
import type { Lade } from '../shared/ruimte-scheiding';
import {
  BRON_NAAM, PG_STEMMER, SOORT_RANG, ZOEK_BRONNEN, ZOEK_VERSIE, isZoekBron, isZoekSoort, isZoekTaal,
  type BronStandNaam, type ZoekAntwoord, type ZoekBron, type ZoekBronStand, type ZoekFacets, type ZoekObject, type ZoekRoute, type ZoekSoort,
  type ZoekSuggestie, type ZoekSynoniemGroep, type ZoekTaal, type ZoekTreffer, type ZoekVraag,
} from '../shared/zoek-model';
import { lichteStam, lichteStamTekst, samengesteldeDelen, taalRaden, transposities, tsToken, varianten, zoekNorm, zoekTokens, zoekWoorden } from '../shared/zoek-normalisatie';
import { SYNONIEM_GROEPEN, breidUit, synoniemen } from '../shared/zoek-synoniemen';
import { BONUS, MIN_DEKKING, VELD_GEWICHTEN, VERSHEID_DAGEN, fragmentMetPosities, percentVan, trigramSimilariteit, uitlegVan, vraagGroepen, type ZoekSignalen } from '../shared/zoek-rangschikking';

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
const LIMIETEN = Object.freeze({ titel: 2000, omschrijving: 8000, trefwoorden: 8000, tekst: 200000, pad: 1000, id: 700, extraBytes: 8192, batch: 200 });
const CYRILLISCH = /[\u0400-\u04ff]/;

/** Achterwaartse compatibiliteit: vroeger stond de index alleen aan met ZOEK_INDEX=aan; nu altijd. */
export const zoekIndexAan = (): boolean => true;

const ladeOk = (lade: Lade | null | undefined): lade is Lade => !!lade && typeof lade.userId === 'string' && lade.userId.length > 0 && (lade.ruimte === 'prive' || lade.ruimte === 'technisch');
const eis = (lade: Lade | null | undefined): Lade => { if (!ladeOk(lade)) throw new Error('ZOEK_LADE_ONGELDIG'); return lade; };
const tekst = (v: unknown, max: number) => String(v ?? '').replace(/\u0000/g, '').slice(0, max);
const ms = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

// ------------------------------------------------------------------------------------------------ geheimen nooit in de index
/** Tokens/wachtwoorden/sleutels in vrije tekst worden vervangen vóór opslag. Eén lijst voor kern, bronnen (Z2) en uitrol-voorcontrole:
 *  shared/geheim-patronen.ts (22.10.2026; voorheen stond hier een eigen, tweede lijst). */
export function geheimenVerbergen(s: string): string { return maskeerGeheimen(s).tekst; }

// ------------------------------------------------------------------------------------------------ object → rij
type Rij = {
  bron: string; bronId: string; soort: string; titel: string; titels: Record<string, string>; omschrijving: string; tekst: string; trefwoorden: string;
  pad: string; route: ZoekRoute | null; taal: string; formaat: string; versie: string; integratie: string; fragmentBron: string; extra: Record<string, unknown>;
  aangemaaktOp: number; bijgewerktOp: number; titelNorm: string; trefwoordenNorm: string; omschrijvingNorm: string; tekstNorm: string; stamNorm: string;
};
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function objectNaarRij(o: ZoekObject): Rij {
  if (!isZoekBron(o.bron)) throw new Error('ZOEK_BRON_ONBEKEND');
  const bronId = tekst(o.id, LIMIETEN.id).trim(); if (!bronId) throw new Error('ZOEK_ID_ONTBREEKT');
  const soort = isZoekSoort(o.soort) ? o.soort : 'overig';
  const titel = tekst(o.titel, LIMIETEN.titel).trim();
  const titels: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.titels || {})) if (isZoekTaal(k) && typeof v === 'string' && v.trim()) titels[k] = tekst(v, LIMIETEN.titel).trim();
  const omschrijving = geheimenVerbergen(tekst(o.omschrijving, LIMIETEN.omschrijving));
  const inhoud = geheimenVerbergen(tekst(o.tekst, LIMIETEN.tekst));
  const trefwoorden = (o.trefwoorden || []).map(w => tekst(w, 200).trim()).filter(Boolean).slice(0, 200).join(' ; ').slice(0, LIMIETEN.trefwoorden);
  const pad = tekst(o.pad, LIMIETEN.pad);
  const route = o.route && typeof o.route === 'object' && typeof o.route.pad === 'string' ? { host: o.route.host, pad: tekst(o.route.pad, 500), ...(o.route.hash ? { hash: tekst(o.route.hash, 200) } : {}), ...(o.route.params ? { params: Object.fromEntries(Object.entries(o.route.params).slice(0, 20).map(([k, v]) => [tekst(k, 60), tekst(v, 1100)])) } : {}) } as ZoekRoute : null;
  const taal: ZoekTaal | '' = isZoekTaal(o.taal) ? o.taal : taalRaden(`${titel} ${omschrijving} ${inhoud.slice(0, 3000)}`);
  const formaat = tekst(o.formaat, 40).toLowerCase();
  let extra: Record<string, unknown> = o.extra && typeof o.extra === 'object' ? { ...o.extra } : {};
  if (Buffer.byteLength(JSON.stringify(extra)) > LIMIETEN.extraBytes) extra = { afgekapt: true };
  const versie = tekst(o.versie, 128) || sha256(JSON.stringify([titel, titels, omschrijving, inhoud, trefwoorden, pad, route, taal, formaat, extra, soort]));
  const titelNorm = zoekNorm([titel, ...Object.values(titels)].join(' '), 4000);
  const trefwoordenNorm = [zoekNorm(trefwoorden, 8000), ...samengesteldeDelen(titelNorm)].filter(Boolean).join(' ').slice(0, 8000);   // «mijn-ruimte-backup.timer» → ook backup, timer
  const omschrijvingNorm = zoekNorm(omschrijving, 8000);
  const tekstBasis = zoekNorm(inhoud, LIMIETEN.tekst);
  const tekstNorm = [tekstBasis, ...samengesteldeDelen(tekstBasis).slice(0, 200)].join(' ').slice(0, LIMIETEN.tekst);   // bestandsnamen/hostnamen in de tekst ook per deel
  const stamNorm = PG_STEMMER[taal as ZoekTaal] ? '' : lichteStamTekst(`${titelNorm} ${omschrijvingNorm} ${tekstNorm}`, LIMIETEN.tekst);
  return {
    bron: o.bron, bronId, soort, titel, titels, omschrijving, tekst: inhoud, trefwoorden, pad, route, taal, formaat, versie, integratie: tekst(o.rechten?.integratie, 120),
    fragmentBron: tekst(o.fragmentBron, 20), extra, aangemaaktOp: ms(o.aangemaaktOp) || ms(o.bijgewerktOp) || Date.now(), bijgewerktOp: ms(o.bijgewerktOp) || Date.now(),
    titelNorm, trefwoordenNorm, omschrijvingNorm, tekstNorm, stamNorm,
  };
}

// ------------------------------------------------------------------------------------------------ waarnemer (zone D, 22.10.2026)
// Het indexvenster (backend/zoek/beheer.ts) telt live wat een handmatige run doet: per lade en bron hoeveel objecten erbij kwamen,
// bijgewerkt, overgeslagen of verwijderd werden en hoeveel via OCR. Alleen tellers — nooit titels of tekst. Geen waarnemer = niets.
export type ZoekGebeurtenis = { lade: Lade; bron: ZoekBron; toegevoegd: number; bijgewerkt: number; overgeslagen: number; verwijderd: number; ocr: number };
const waarnemers = new Set<(g: ZoekGebeurtenis) => void>();
export function zoekWaarnemen(f: (g: ZoekGebeurtenis) => void): () => void { waarnemers.add(f); return () => { waarnemers.delete(f); }; }
const meld = (g: ZoekGebeurtenis) => { for (const f of waarnemers) { try { f(g); } catch { /* een waarnemer breekt het indexeren nooit */ } } };

// ------------------------------------------------------------------------------------------------ indexeer / verwijder
export type IndexeerUitkomst = { toegevoegd: number; bijgewerkt: number; overgeslagen: number };

/** Upsert per (lade, bron, id); ongewijzigde versie = overslaan. Elk object MOET in de lade liggen, anders wordt alles geweigerd. */
export async function indexeer(lade: Lade, objecten: readonly ZoekObject[]): Promise<IndexeerUitkomst> {
  const { userId, ruimte } = eis(lade);
  const uit: IndexeerUitkomst = { toegevoegd: 0, bijgewerkt: 0, overgeslagen: 0 };
  if (!objecten.length) return uit;
  if (objecten.some(o => !o.rechten || o.rechten.userId !== userId || o.rechten.ruimte !== ruimte)) throw new Error('ZOEK_LADE_MISMATCH');
  const rijen = objecten.map(objectNaarRij);
  const perBron = new Map<string, { toegevoegd: number; bijgewerkt: number; overgeslagen: number; ocr: number }>();
  return alsGebruiker(userId, async q => {
    for (let i = 0; i < rijen.length; i += LIMIETEN.batch) {
      const deel = rijen.slice(i, i + LIMIETEN.batch);
      const bestaand = await q(
        `SELECT bron, bron_id, versie FROM app.zoek_objecten WHERE user_id = $1 AND ruimte = $2 AND bron = ANY($3::text[]) AND bron_id = ANY($4::text[])`,
        [userId, ruimte, [...new Set(deel.map(r => r.bron))], deel.map(r => r.bronId)],
      );
      const versies = new Map(bestaand.rows.map(r => [`${r.bron}\u0000${r.bron_id}`, String(r.versie || '')]));
      for (const r of deel) {
        if (versies.get(`${r.bron}\u0000${r.bronId}`) === r.versie) { uit.overgeslagen++; if (waarnemers.size) { const t = perBron.get(r.bron) || { toegevoegd: 0, bijgewerkt: 0, overgeslagen: 0, ocr: 0 }; t.overgeslagen++; perBron.set(r.bron, t); } continue; }
        const res = await q(
          `INSERT INTO app.zoek_objecten (user_id, ruimte, bron, bron_id, soort, titel, titels, omschrijving, tekst, trefwoorden, pad, route, taal, formaat, versie, integratie, fragment_bron, extra,
             aangemaakt_op, bijgewerkt_op, geindexeerd_op, titel_norm, trefwoorden_norm, omschrijving_norm, tekst_norm, stam_norm)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18::jsonb,
             to_timestamp($19 / 1000.0), to_timestamp($20 / 1000.0), now(), $21, $22, $23, $24, $25)
           ON CONFLICT (user_id, ruimte, bron, bron_id) DO UPDATE SET soort = EXCLUDED.soort, titel = EXCLUDED.titel, titels = EXCLUDED.titels,
             omschrijving = EXCLUDED.omschrijving, tekst = EXCLUDED.tekst, trefwoorden = EXCLUDED.trefwoorden, pad = EXCLUDED.pad, route = EXCLUDED.route,
             taal = EXCLUDED.taal, formaat = EXCLUDED.formaat, versie = EXCLUDED.versie, integratie = EXCLUDED.integratie, fragment_bron = EXCLUDED.fragment_bron,
             extra = EXCLUDED.extra, bijgewerkt_op = EXCLUDED.bijgewerkt_op, geindexeerd_op = now(), titel_norm = EXCLUDED.titel_norm,
             trefwoorden_norm = EXCLUDED.trefwoorden_norm, omschrijving_norm = EXCLUDED.omschrijving_norm, tekst_norm = EXCLUDED.tekst_norm, stam_norm = EXCLUDED.stam_norm
           RETURNING (xmax = 0) AS ingevoegd`,
          [userId, ruimte, r.bron, r.bronId, r.soort, r.titel, JSON.stringify(r.titels), r.omschrijving, r.tekst, r.trefwoorden, r.pad, r.route ? JSON.stringify(r.route) : null,
            r.taal, r.formaat, r.versie, r.integratie, r.fragmentBron, JSON.stringify(r.extra), r.aangemaaktOp, r.bijgewerktOp, r.titelNorm, r.trefwoordenNorm, r.omschrijvingNorm, r.tekstNorm, r.stamNorm],
        );
        if (res.rows[0]?.ingevoegd) uit.toegevoegd++; else uit.bijgewerkt++;
        if (waarnemers.size) { const t = perBron.get(r.bron) || { toegevoegd: 0, bijgewerkt: 0, overgeslagen: 0, ocr: 0 }; if (res.rows[0]?.ingevoegd) t.toegevoegd++; else t.bijgewerkt++; if (r.extra.ocr === true) t.ocr++; perBron.set(r.bron, t); }
      }
    }
    for (const [bron, t] of perBron) meld({ lade: { userId, ruimte }, bron: bron as ZoekBron, ...t, verwijderd: 0 });
    return uit;
  });
}

export async function verwijder(lade: Lade, bron: ZoekBron, ids: readonly string[]): Promise<number> {
  const { userId, ruimte } = eis(lade);
  if (!isZoekBron(bron) || !ids.length) return 0;
  const n = await alsGebruiker(userId, async q => (await q('DELETE FROM app.zoek_objecten WHERE user_id = $1 AND ruimte = $2 AND bron = $3 AND bron_id = ANY($4::text[])', [userId, ruimte, bron, [...ids]])).rowCount || 0);
  if (n && waarnemers.size) meld({ lade: { userId, ruimte }, bron, toegevoegd: 0, bijgewerkt: 0, overgeslagen: 0, verwijderd: n, ocr: 0 });
  return n;
}
export async function verwijderBron(lade: Lade, bron: ZoekBron): Promise<number> {
  const { userId, ruimte } = eis(lade);
  if (!isZoekBron(bron)) return 0;
  const n = await alsGebruiker(userId, async q => (await q('DELETE FROM app.zoek_objecten WHERE user_id = $1 AND ruimte = $2 AND bron = $3', [userId, ruimte, bron])).rowCount || 0);
  if (n && waarnemers.size) meld({ lade: { userId, ruimte }, bron, toegevoegd: 0, bijgewerkt: 0, overgeslagen: 0, verwijderd: n, ocr: 0 });
  return n;
}
/** Alle id's van een bron in de lade (voor Z2: wat er weg moet na een volledige scan). */
export async function idsVanBron(lade: Lade, bron: ZoekBron): Promise<Array<{ id: string; versie: string }>> {
  const { userId, ruimte } = eis(lade);
  if (!isZoekBron(bron)) return [];
  return alsGebruiker(userId, async q => (await q('SELECT bron_id, versie FROM app.zoek_objecten WHERE user_id = $1 AND ruimte = $2 AND bron = $3', [userId, ruimte, bron])).rows.map(r => ({ id: String(r.bron_id), versie: String(r.versie || '') })));
}
export async function aantalInLade(lade: Lade, bronnen?: readonly ZoekBron[]): Promise<number> {
  const { userId, ruimte } = eis(lade);
  return alsGebruiker(userId, async q => Number((await q(`SELECT count(*)::int AS n FROM app.zoek_objecten WHERE user_id = $1 AND ruimte = $2${bronnen?.length ? ' AND bron = ANY($3::text[])' : ''}`, bronnen?.length ? [userId, ruimte, [...bronnen]] : [userId, ruimte])).rows[0]?.n || 0));
}

// ------------------------------------------------------------------------------------------------ woordenboek van de eigenaar
const eigenCache = new Map<string, { tot: number; groepen: ZoekSynoniemGroep[] }>();
export async function eigenSynoniemen(lade: Lade): Promise<ZoekSynoniemGroep[]> {
  const { userId, ruimte } = eis(lade);
  const sleutel = `${userId}\u0000${ruimte}`, nu = Date.now(), c = eigenCache.get(sleutel);
  if (c && c.tot > nu) return c.groepen;
  const groepen = await alsGebruiker(userId, async q => (await q('SELECT canoniek, taal, synoniemen FROM app.zoek_synoniemen_eigenaar WHERE user_id = $1 AND ruimte = $2 LIMIT 500', [userId, ruimte])).rows
    .map(r => ({ canoniek: String(r.canoniek), taal: (String(r.taal || 'multi') as ZoekSynoniemGroep['taal']), synoniemen: [String(r.canoniek), ...(r.synoniemen || []).map(String)], bron: 'eigenaar' as const })));
  eigenCache.set(sleutel, { tot: nu + 60000, groepen });
  return groepen;
}
export async function eigenSynoniemZetten(lade: Lade, groep: { canoniek: string; taal?: ZoekSynoniemGroep['taal']; synoniemen: readonly string[] }): Promise<void> {
  const { userId, ruimte } = eis(lade);
  const canoniek = tekst(groep.canoniek, 120).trim(); if (!canoniek) throw new Error('ZOEK_CANONIEK_ONTBREEKT');
  const syn = [...new Set(groep.synoniemen.map(w => tekst(w, 120).trim()).filter(Boolean))].slice(0, 64);
  const taal = groep.taal && (groep.taal === 'multi' || isZoekTaal(groep.taal)) ? groep.taal : 'multi';
  await alsGebruiker(userId, q => q(
    `INSERT INTO app.zoek_synoniemen_eigenaar (user_id, ruimte, canoniek, taal, synoniemen) VALUES ($1, $2, $3, $4, $5::text[])
     ON CONFLICT (user_id, ruimte, canoniek) DO UPDATE SET taal = EXCLUDED.taal, synoniemen = EXCLUDED.synoniemen, bijgewerkt_op = now()`, [userId, ruimte, canoniek, taal, syn]));
  eigenCache.delete(`${userId}\u0000${ruimte}`);
}
export async function eigenSynoniemVerwijderen(lade: Lade, canoniek: string): Promise<number> {
  const { userId, ruimte } = eis(lade);
  const n = await alsGebruiker(userId, async q => (await q('DELETE FROM app.zoek_synoniemen_eigenaar WHERE user_id = $1 AND ruimte = $2 AND canoniek = $3', [userId, ruimte, tekst(canoniek, 120).trim()])).rowCount || 0);
  eigenCache.delete(`${userId}\u0000${ruimte}`);
  return n;
}

// ------------------------------------------------------------------------------------------------ stand per bron
export async function standZetten(lade: Lade, bron: ZoekBron, patch: Partial<{ stand: BronStandNaam; voortgang: number; fout: string; versie: string; laatsteOk: number; laatstePoging: number; documenten: number }>): Promise<void> {
  const { userId, ruimte } = eis(lade);
  if (!isZoekBron(bron)) throw new Error('ZOEK_BRON_ONBEKEND');
  const stand = patch.stand && ['niet_gekoppeld', 'indexeert', 'gedeeltelijk', 'fout', 'klaar'].includes(patch.stand) ? patch.stand : null;
  await alsGebruiker(userId, q => q(
    `INSERT INTO app.zoek_bron_stand (user_id, ruimte, bron, stand, voortgang, versie, laatste_fout, laatste_fout_op, laatste_succes_op, laatste_poging_op, documenten, bijgewerkt_op)
     VALUES ($1, $2, $3, COALESCE($4::text, 'niet_gekoppeld'), COALESCE($5::int, 0), COALESCE($6::text, ''), COALESCE($7::text, ''), CASE WHEN $7::text IS NOT NULL AND $7::text <> '' THEN now() END,
             CASE WHEN $8::bigint > 0 THEN to_timestamp($8::bigint / 1000.0) END, CASE WHEN $9::bigint > 0 THEN to_timestamp($9::bigint / 1000.0) END, COALESCE($10::int, 0), now())
     ON CONFLICT (user_id, ruimte, bron) DO UPDATE SET
       stand = COALESCE($4::text, app.zoek_bron_stand.stand), voortgang = COALESCE($5::int, app.zoek_bron_stand.voortgang), versie = COALESCE($6::text, app.zoek_bron_stand.versie),
       laatste_fout = COALESCE($7::text, app.zoek_bron_stand.laatste_fout), laatste_fout_op = CASE WHEN $7::text IS NOT NULL AND $7::text <> '' THEN now() ELSE app.zoek_bron_stand.laatste_fout_op END,
       laatste_succes_op = CASE WHEN $8::bigint > 0 THEN to_timestamp($8::bigint / 1000.0) ELSE app.zoek_bron_stand.laatste_succes_op END,
       laatste_poging_op = CASE WHEN $9::bigint > 0 THEN to_timestamp($9::bigint / 1000.0) ELSE app.zoek_bron_stand.laatste_poging_op END,
       documenten = COALESCE($10::int, app.zoek_bron_stand.documenten), bijgewerkt_op = now()`,
    [userId, ruimte, bron, stand, patch.voortgang === undefined ? null : Math.max(0, Math.min(100, Math.round(Number(patch.voortgang) || 0))), patch.versie === undefined ? null : tekst(patch.versie, 120),
      patch.fout === undefined ? null : tekst(patch.fout, 300), ms(patch.laatsteOk), ms(patch.laatstePoging), patch.documenten === undefined ? null : Math.max(0, Math.round(Number(patch.documenten) || 0))],
  ));
}
export async function standenVanLade(lade: Lade, bronnen: readonly ZoekBron[] = ZOEK_BRONNEN): Promise<ZoekBronStand[]> {
  const { userId, ruimte } = eis(lade);
  const gevraagd = bronnen.filter(isZoekBron);
  return alsGebruiker(userId, async q => {
    const tel = new Map((await q('SELECT bron, count(*)::int AS n FROM app.zoek_objecten WHERE user_id = $1 AND ruimte = $2 GROUP BY bron', [userId, ruimte])).rows.map(r => [String(r.bron), Number(r.n)]));
    const rijen = new Map((await q('SELECT * FROM app.zoek_bron_stand WHERE user_id = $1 AND ruimte = $2', [userId, ruimte])).rows.map(r => [String(r.bron), r]));
    return gevraagd.map(bron => {
      const r = rijen.get(bron), aantal = tel.get(bron) || 0;
      const t = (v: unknown) => (v ? new Date(v as string).getTime() : 0);
      return {
        bron, stand: (r?.stand as BronStandNaam) || (aantal > 0 ? 'klaar' : 'niet_gekoppeld'), voortgang: r ? Number(r.voortgang || 0) : aantal > 0 ? 100 : 0, aantal,
        laatsteOk: t(r?.laatste_succes_op), laatstePoging: t(r?.laatste_poging_op), fout: String(r?.laatste_fout || ''), versie: String(r?.versie || ''), bijgewerktOp: t(r?.bijgewerkt_op),
      };
    });
  });
}
export const standVanBron = async (lade: Lade, bron: ZoekBron): Promise<ZoekBronStand> => (await standenVanLade(lade, [bron]))[0];

// ------------------------------------------------------------------------------------------------ de zoekvraag → SQL
type Zin = { tokens: string[]; groepen: string[][]; groepTs: string[]; groepTsA: string[]; groepStam: string[]; qOf: string; qEn: string; qEnA: string; qTrans: string; stamSimple: string[]; stamRuw: string[]; configs: string[]; cyrillisch: boolean };

/**
 * Eén token → tsquery-deel: token:* | varianten:* | transposities:* | synoniemen (exact; meerwoordig als a <-> b).
 * `label` = gewichtslabel ('A' → alleen titelposities: titelwoorden/titeldekking zonder to_tsvector per rij).
 */
function tsGroep(token: string, groep: readonly string[], label = ''): string {
  const delen = new Set<string>();
  const pre = (x: string) => `${x}:*${label}`, los = (x: string) => (label ? `${x}:${label}` : x);
  const t = tsToken(token); if (t.length >= 2) delen.add(pre(t));
  for (const v of varianten(token)) { const x = tsToken(v); if (x.length >= 2) delen.add(pre(x)); }
  for (const s of groep) {
    if (s === token) continue;
    const woorden = zoekWoorden(s).map(tsToken).filter(w => w.length >= 2);
    if (!woorden.length) continue;
    delen.add(woorden.length === 1 ? los(woorden[0]) : `(${woorden.map(los).join(' <-> ')})`);
  }
  return delen.size ? `(${[...delen].slice(0, 96).join(' | ')})` : '';
}
/** Stam-tsquery van een groep: lichte stammen van het token én van de synoniemen (скриньку ↔ «Облікові записи» ↔ accounts). */
function tsGroepStam(token: string, groep: readonly string[]): string {
  const delen = new Set<string>();
  const st = tsToken(lichteStam(token)); if (st.length >= 3) delen.add(st);
  for (const s of groep) {
    const woorden = zoekWoorden(s).map(w => tsToken(lichteStam(w))).filter(w => w.length >= 3);
    if (!woorden.length) continue;
    delen.add(woorden.length === 1 ? woorden[0] : `(${woorden.join(' <-> ')})`);
  }
  return delen.size ? `(${[...delen].slice(0, 96).join(' | ')})` : '';
}
/** OF-groepen → tekst voor to_tsquery('simple', …). Oude handtekening, nog gebruikt door tests. */
export function tsQueryTekst(groepen: readonly string[][]): string {
  return groepen.map(g => [...new Set(g.flatMap(t => t.split(/[^a-z0-9]+/)).map(tsToken).filter(t => t.length >= 2))]).filter(g => g.length).map(g => `(${g.map(t => `${t}:*`).join(' | ')})`).join(' & ');
}

function zinVan(q: string, extra: ReadonlyArray<ZoekSynoniemGroep>, metSynoniemen: boolean): Zin | null {
  const tokens = zoekTokens(q, 8);
  if (!tokens.length) return null;
  const groepen = metSynoniemen ? breidUit(tokens, extra) : tokens.map(t => [t]);
  const idx = groepen.map((g, i) => (tsGroep(tokens[i], g) ? i : -1)).filter(i => i >= 0);
  if (!idx.length) return null;
  const groepTs = idx.map(i => tsGroep(tokens[i], groepen[i])), groepTsA = idx.map(i => tsGroep(tokens[i], groepen[i], 'A')), groepStam = idx.map(i => tsGroepStam(tokens[i], groepen[i]));
  const cyrillisch = CYRILLISCH.test(q);
  // Stemmers (PG-configs): ruwe woorden (alleen letters/cijfers, dus nooit operators) — ALLEEN de woorden die ook token zijn (geen stopwoorden).
  const ruw = [...new Set(String(q).toLocaleLowerCase('und').split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2 && tokens.includes(zoekNorm(w))))].slice(0, 8);
  const configs = cyrillisch ? ['russian'] : ['dutch', 'english', 'german', 'french', 'romanian'];
  // Typefout-kanaal (aparte kleine query): omzettingen van aangrenzende letters, als prefix.
  const qTrans = idx.map(i => transposities(tokens[i]).map(tsToken).filter(x => x.length >= 3).map(x => `${x}:*`)).filter(g => g.length).map(g => `(${g.join(' | ')})`).join(' | ');
  return { tokens: idx.map(i => tokens[i]), groepen: idx.map(i => groepen[i]), groepTs, groepTsA, groepStam, qOf: groepTs.join(' | '), qEn: groepTs.join(' & '), qEnA: groepTsA.join(' & '), qTrans, stamSimple: groepStam.filter(Boolean), stamRuw: ruw, configs, cyrillisch };
}

type Sql = { tekst: string; params: unknown[] };
type LadeGroep = { lade: Lade; bronnen: readonly ZoekBron[] };
const UI_BRONNEN = ['ui', 'pagina', 'instelling', 'hulp'] as const;
/** Rang van een interface-object: echte pagina's/menu (bron pagina) 1.0 > instelling 0.7 > hulp 0.5 > onderdelen van een pagina (bron ui: sectie/knop/dialoog/veld) ≤ 0.4. */
const SOORT_RANG_SQL = `(CASE o.bron WHEN 'pagina' THEN 1.0 WHEN 'instelling' THEN 0.7 WHEN 'hulp' THEN 0.5 WHEN 'ui' THEN 0.4 * (CASE o.soort ${Object.entries(SOORT_RANG).map(([k, v]) => `WHEN '${k}' THEN ${v}`).join(' ')} ELSE 0.5 END) ELSE 0 END)`;

/**
 * Bouwt de CTE's q (alle tsquery's één keer), v (signalen per rij, alleen id's) en s (score, dedupe van gelijknamige knoppen).
 * $1 = userId. `minDekking` = 0.5 (strikt) of 0 (verzwakt). `vaag` = true → alleen het trigram-kanaal (tweede, kleine query).
 */
function kernSql(userId: string, laden: ReadonlyArray<LadeGroep>, zin: Zin, v: ZoekVraag, minDekking: number, vaag = false): Sql {
  const p: unknown[] = [userId];
  const $ = (x: unknown) => { p.push(x); return `$${p.length}`; };
  const ladeDelen = laden.map(({ lade, bronnen }) => `(o.ruimte = ${$(lade.ruimte)} AND o.bron = ANY(${$([...bronnen])}::text[]))`);
  const qn = $(zoekNorm(v.q, 300));
  // ts_rank (niet ts_rank_cd): gemeten op 5000 rijen met een vraag van 60 termen (synoniemen in 9 talen) kost ts_rank_cd
  // 790 ms en ts_rank 29 ms; dekking + de titelbonussen vangen de structuur die cover density zou geven.
  const stamDelen: string[] = [];
  if (zin.stamSimple.length) stamDelen.push(`to_tsquery('simple', ${$(zin.stamSimple.join(' | '))})`);
  if (zin.stamRuw.length) for (const cfg of zin.configs) stamDelen.push(`to_tsquery('${cfg}'::regconfig, ${$(zin.stamRuw.join(' | '))})`);
  const qStam = stamDelen.length ? `(${stamDelen.join(' || ')})` : `to_tsquery('simple', '')`;
  const g: string[] = [], gA: string[] = [], gs: string[] = [];
  zin.groepTs.forEach((groep, i) => {
    g.push(`to_tsquery('simple', ${$(groep)})`);
    gA.push(`to_tsquery('simple', ${$(zin.groepTsA[i])})`);
    const delen: string[] = [];
    if (zin.groepStam[i]) delen.push(`to_tsquery('simple', ${$(zin.groepStam[i])})`);
    const ruwWoord = zin.stamRuw.find(w => zoekNorm(w) === zin.tokens[i]);
    if (ruwWoord) for (const cfg of zin.configs) delen.push(`to_tsquery('${cfg}'::regconfig, ${$(ruwWoord)})`);
    gs.push(delen.length ? `(${delen.join(' || ')})` : `to_tsquery('simple', '')`);
  });
  const n = zin.groepTs.length;
  // Eén groep: dekking = de FTS-treffer zelf en titelgroepen = q_en_a (bespaart 3 tsquery-evaluaties per rij).
  const dekking = n === 1 ? `(CASE WHEN o.zoek_vector @@ q.q_of OR o.zoek_stam @@ q.q_stam THEN 1 ELSE 0 END)` : Array.from({ length: n }, (_, i) => `(CASE WHEN o.zoek_vector @@ q.g[${i + 1}] OR o.zoek_stam @@ q.gs[${i + 1}] THEN 1 ELSE 0 END)`).join(' + ');
  const titelgroepen = n === 1 ? `(CASE WHEN o.zoek_vector @@ q.q_en_a THEN 1 ELSE 0 END)` : Array.from({ length: n }, (_, i) => `(CASE WHEN o.zoek_vector @@ q.ga[${i + 1}] THEN 1 ELSE 0 END)`).join(' + ');
  const filters: string[] = [];
  if (v.soorten?.length) filters.push(`o.soort = ANY(${$([...v.soorten].map(String))}::text[])`);
  if (v.formaten?.length) filters.push(`o.formaat = ANY(${$([...v.formaten].map(x => String(x).toLowerCase()))}::text[])`);
  if (v.talen?.length) filters.push(`o.taal = ANY(${$([...v.talen].map(String))}::text[])`);
  if (ms(v.sinds)) filters.push(`o.bijgewerkt_op >= to_timestamp(${$(ms(v.sinds))} / 1000.0)`);
  if (ms(v.tot)) filters.push(`o.bijgewerkt_op <= to_timestamp(${$(ms(v.tot))} / 1000.0)`);
  const kort = zin.tokens.length <= 4;
  const w = VELD_GEWICHTEN;
  const fts = `(o.zoek_vector @@ q.q_of OR o.zoek_stam @@ q.q_stam)`;
  const tekst = `
    WITH q AS (
      SELECT to_tsquery('simple', ${$(zin.qOf)}) AS q_of, to_tsquery('simple', ${$(zin.qEn)}) AS q_en, to_tsquery('simple', ${$(zin.qEnA)}) AS q_en_a, ${qStam} AS q_stam,
             ARRAY[${g.join(', ')}]::tsquery[] AS g, ARRAY[${gA.join(', ')}]::tsquery[] AS ga, ARRAY[${gs.join(', ')}]::tsquery[] AS gs, ${qn}::text AS qn
    ), v AS (
      SELECT o.id, o.bron, o.soort, o.formaat, o.taal, o.titel_norm, o.pad,
             (extract(epoch FROM o.bijgewerkt_op) * 1000)::bigint AS bijgewerkt,
             (o.zoek_vector @@ q.q_of) AS fts,
             (o.zoek_stam @@ q.q_stam) AS stam_hit,
             ts_rank('{${w[0]},${w[1]},${w[2]},${w[3]}}'::float4[], o.zoek_vector, q.q_of, 32) AS rank_simple,
             ts_rank('{${w[0]},${w[1]},${w[2]},${w[3]}}'::float4[], o.zoek_stam, q.q_stam, 32) AS rank_stam,
             (${dekking})::float / ${n} AS dekking,
             LEAST(1.0, (${titelgroepen})::float / GREATEST(1, coalesce(array_length(string_to_array(o.titel_norm, ' '), 1), 1))) AS titeldekking,
             (o.titel_norm = q.qn) AS exacte_titel,
             (o.titel_norm <> q.qn AND (' ' || o.titel_norm || ' ') LIKE ('% ' || q.qn || ' %')) AS volledige_zin,
             (o.titel_norm <> q.qn AND o.titel_norm LIKE (q.qn || '%')) AS voorvoegsel,
             (o.zoek_vector @@ q.q_en_a) AS titelwoorden,
             ${kort ? 'true' : 'false'} AS handeling,
             ${SOORT_RANG_SQL} AS soortrang,
             exp(-GREATEST(0, extract(epoch FROM now() - o.bijgewerkt_op)) / ${VERSHEID_DAGEN * 86400}) AS versheid,
             word_similarity(q.qn, o.titel_norm) AS vaag,
             ${vaag && zin.qTrans ? `(o.zoek_vector @@ to_tsquery('simple', ${$(zin.qTrans)}))` : 'false'} AS o_trans
        FROM app.zoek_objecten o CROSS JOIN q
       WHERE o.user_id = $1 AND (${ladeDelen.join(' OR ')})
         ${filters.length ? `AND ${filters.join(' AND ')}` : ''}
         AND ${vaag ? `(q.qn <% o.titel_norm${zin.qTrans ? ` OR o.zoek_vector @@ to_tsquery('simple', ${$(zin.qTrans)})` : ''}) AND NOT ${fts}` : fts}
    ), s0 AS (
      SELECT v.*,
             (CASE WHEN fts OR stam_hit THEN dekking * dekking * (rank_simple + ${BONUS.stam} * rank_stam)
                 + (CASE WHEN exacte_titel THEN ${BONUS.exacteTitel} ELSE 0 END) + (CASE WHEN volledige_zin THEN ${BONUS.volledigeZin} ELSE 0 END)
                 + (CASE WHEN voorvoegsel THEN ${BONUS.voorvoegsel} ELSE 0 END) + (CASE WHEN titelwoorden THEN ${BONUS.titelwoorden} ELSE 0 END)
                 + (CASE WHEN dekking >= 1 AND ${n} >= 2 THEN ${BONUS.volledig} ELSE 0 END)
                 + ${BONUS.titeldekking} * titeldekking + (CASE WHEN handeling THEN ${BONUS.soortrang} * soortrang * dekking ELSE 0 END)
               ELSE 0 END)
             + ${BONUS.vers} * versheid
             + ${BONUS.vaag} * GREATEST(0, ${vaag && zin.qTrans ? `GREATEST(vaag, CASE WHEN o_trans THEN 0.75 ELSE 0 END)` : 'vaag'} - ${BONUS.vaagDrempel}) AS score
        FROM v
       WHERE ${vaag ? 'true' : n >= 2 && minDekking > 0 ? `dekking >= ${minDekking}` : 'true'}
    ), s AS MATERIALIZED (
      -- gelijknamige knoppen/velden binnen één pagina (zelfde soort + titel + pad) → één rij, de beste, met een teller
      SELECT s0.*, count(*) OVER (PARTITION BY sleutel) AS gelijknamig FROM (
        SELECT s0.*, CASE WHEN bron = ANY('{${UI_BRONNEN.join(',')}}'::text[]) THEN bron || '|' || soort || '|' || titel_norm || '|' || pad ELSE id::text END AS sleutel,
               row_number() OVER (PARTITION BY CASE WHEN bron = ANY('{${UI_BRONNEN.join(',')}}'::text[]) THEN bron || '|' || soort || '|' || titel_norm || '|' || pad ELSE id::text END ORDER BY score DESC, bijgewerkt DESC, id ASC) AS rn
          FROM s0) s0
       WHERE rn = 1
    )`;
  return { tekst, params: p };
}

const ORDER: Record<string, string> = { relevantie: 'score DESC, bijgewerkt DESC, id ASC', nieuwste: 'bijgewerkt DESC, score DESC, id ASC', oudste: 'bijgewerkt ASC, score DESC, id ASC', titel: 'titel_norm ASC, score DESC, id ASC' };
const FACET_SQL = `, (SELECT json_object_agg(bron, n) FROM (SELECT bron, count(*)::int AS n FROM s GROUP BY bron) x) AS f_bron,
           (SELECT json_object_agg(soort, n) FROM (SELECT soort, count(*)::int AS n FROM s GROUP BY soort) x) AS f_soort,
           (SELECT json_object_agg(formaat, n) FROM (SELECT formaat, count(*)::int AS n FROM s GROUP BY formaat) x) AS f_formaat,
           (SELECT json_object_agg(taal, n) FROM (SELECT taal, count(*)::int AS n FROM s GROUP BY taal) x) AS f_taal`;
type Rijen = { rows: any[]; totaal: number; facets?: ZoekFacets };

/** Eén statement: pagina (teruggekoppeld aan de rij), totaal, maximum en facetten als scalaire subquery's over de gematerialiseerde s. */
async function paginaLezen(run: Q, kern: Sql, sorteer: string, perPagina: number, pagina: number, metFacets: boolean): Promise<Rijen> {
  const fac = metFacets ? FACET_SQL : '';
  const rows = (await run(
    `${kern.tekst}, pagina AS (SELECT s.*, count(*) OVER () AS totaal, max(score) OVER () AS max_score FROM s ORDER BY ${ORDER[sorteer]} LIMIT $${kern.params.length + 1} OFFSET $${kern.params.length + 2})
     SELECT pagina.*, o.bron_id, o.titel, o.titels, o.omschrijving, left(o.tekst, 3000) AS tekst, o.route, o.integratie, o.extra${fac}
       FROM pagina JOIN app.zoek_objecten o ON o.id = pagina.id AND o.user_id = $1 ORDER BY ${ORDER[sorteer]}`,
    [...kern.params, perPagina, (pagina - 1) * perPagina])).rows;
  let totaal = rows.length ? Number(rows[0].totaal) : 0;
  let facets: ZoekFacets | undefined;
  if (metFacets) {
    facets = { bron: {}, soort: {}, formaat: {}, taal: {} };
    const r0 = rows[0];
    if (r0) { facets.bron = r0.f_bron || {}; facets.soort = r0.f_soort || {}; facets.formaat = r0.f_formaat || {}; facets.taal = r0.f_taal || {}; }
    else if (pagina > 1) {
      // Lege pagina voorbij het einde: facetten en totaal toch leveren (kleine tweede query zonder pagina).
      const f = (await run(`${kern.tekst} SELECT count(*)::int AS totaal${fac} FROM s LIMIT 1`, kern.params)).rows[0];
      if (f) { totaal = Number(f.totaal || 0); facets.bron = f.f_bron || {}; facets.soort = f.f_soort || {}; facets.formaat = f.f_formaat || {}; facets.taal = f.f_taal || {}; }
    }
  }
  return { rows, totaal, facets };
}

/** Zoeken in meerdere laden van ÉÉN gebruiker (gedeelde diensten: de technische ruimte leest de persoonlijke lade van post). */
export async function zoekInLaden(groepen: ReadonlyArray<LadeGroep>, vraag: ZoekVraag): Promise<ZoekAntwoord> {
  const t0 = Date.now();
  const q = tekst(vraag.q, 300).trim();
  const perPagina = Math.max(1, Math.min(100, Math.floor(Number(vraag.perPagina) || 20))), pagina = Math.max(1, Math.floor(Number(vraag.pagina) || 1));
  const leeg = (qNorm: string): ZoekAntwoord => ({ q, qNorm, items: [], ...(vraag.facets !== false ? { facets: { bron: {}, soort: {}, formaat: {}, taal: {} } } : {}), suggesties: [], totaal: 0, pagina, perPagina, bron: 'index', duurMs: Date.now() - t0, versie: ZOEK_VERSIE });
  const laden = groepen.filter(g => ladeOk(g.lade)).map(g => ({ lade: g.lade, bronnen: [...new Set(g.bronnen.filter(isZoekBron).filter(b => !vraag.bronnen?.length || vraag.bronnen.includes(b)))] })).filter(g => g.bronnen.length);
  if (!laden.length || q.length < 2) return leeg(zoekNorm(q));
  const userId = laden[0].lade.userId;
  if (laden.some(g => g.lade.userId !== userId)) throw new Error('ZOEK_LADEN_MEERDERE_GEBRUIKERS');
  const extra = vraag.synoniemen === false ? [] : (await Promise.all(laden.map(g => eigenSynoniemen(g.lade).catch(() => [] as ZoekSynoniemGroep[])))).flat();
  const zin = zinVan(q, extra, vraag.synoniemen !== false);
  const qNorm = zoekNorm(q, 300);
  if (!zin) return leeg(qNorm);
  const sorteer = ORDER[String(vraag.sorteer || 'relevantie')] ? String(vraag.sorteer || 'relevantie') : 'relevantie';
  const metFacets = vraag.facets !== false;
  const uit = await alsGebruiker(userId, async run => {
    const tSql = Date.now();
    // 1. strikt: ≥ ½ van de woordgroepen
    let r = await paginaLezen(run, kernSql(userId, laden, zin, vraag, MIN_DEKKING), sorteer, perPagina, pagina, metFacets);
    let verzwakt = false;
    // 2. (bijna) niets? dan elke groep (gedeeltelijk) — de vraag «де подивитися хто входив у мій акаунт» mag niet leeg blijven;
    //    de strikte treffers zitten daar ook in (hogere dekking → hogere score), dus niets gaat verloren.
    if (r.totaal < 3 && zin.groepTs.length >= 2) { const r2 = await paginaLezen(run, kernSql(userId, laden, zin, vraag, 0), sorteer, perPagina, pagina, metFacets); if (r2.totaal > r.totaal) { r = r2; verzwakt = true; } }
    // 3. mager? dan het typefout-kanaal (trigram op de titel, drempel 0,45) als aparte kleine query — alleen op pagina 1
    let vaagRows: any[] = [];
    if (vraag.vaag !== false && r.totaal < 5 && pagina === 1) {
      await run(`SET LOCAL pg_trgm.word_similarity_threshold = ${BONUS.vaagDrempel}`);
      const vr = await paginaLezen(run, kernSql(userId, laden, zin, vraag, 0, true), 'relevantie', Math.max(1, perPagina - r.rows.length), 1, false);
      vaagRows = vr.rows; r.totaal += vr.totaal;
      if (r.facets) for (const x of vaagRows) { r.facets.bron[x.bron] = (r.facets.bron[x.bron] || 0) + 1; r.facets.soort[x.soort] = (r.facets.soort[x.soort] || 0) + 1; r.facets.formaat[x.formaat || ''] = (r.facets.formaat[x.formaat || ''] || 0) + 1; r.facets.taal[x.taal || ''] = (r.facets.taal[x.taal || ''] || 0) + 1; }
    }
    if (process.env.ZOEK_DEBUG === 'aan') console.error(`[zoek] sql ${Date.now() - tSql} ms, ${r.rows.length}+${vaagRows.length} rijen, verzwakt=${verzwakt}`);   // alleen tijden, nooit de vraag of inhoud
    // Correcties alleen bij een mager resultaat: uit de titels van DEZE laden (nooit uit andere) + het ingebouwde woordenboek.
    const suggesties = r.totaal < 3 ? await correcties(run, laden, zin, q) : [];
    const rows = [...r.rows, ...vaagRows.map(x => ({ ...x, vaag_kanaal: true }))];
    if (vaagRows.length && sorteer === 'relevantie') rows.sort((a, b) => Number(b.score) - Number(a.score) || Number(b.bijgewerkt) - Number(a.bijgewerkt));
    return { rows, facets: r.facets, totaal: r.totaal, suggesties, verzwakt };
  });
  const tNode = Date.now();
  const maxScore = uit.rows.reduce((m, r) => Math.max(m, Number(r.score)), 0);
  const vg = vraagGroepen(zin.tokens, zin.groepen);
  const items: ZoekTreffer[] = uit.rows.map(r => {
    const signalen: ZoekSignalen = {
      dekking: Number(r.dekking), rankSimple: Number(r.rank_simple), rankStam: Number(r.rank_stam), exacteTitel: !!r.exacte_titel, volledigeZin: !!r.volledige_zin, voorvoegsel: !!r.voorvoegsel,
      titelwoorden: !!r.titelwoorden, handeling: !!r.handeling && Number(r.soortrang) > 0, versheid: Number(r.versheid), vaag: Number(r.vaag), ftsTreffer: !!(r.fts || r.stam_hit),
      titeldekking: Number(r.titeldekking), soortrang: Number(r.soortrang), gedeeltelijk: uit.verzwakt && Number(r.dekking) < MIN_DEKKING,
    };
    const { fragment, afgeleid } = fragmentMetPosities({ titel: String(r.titel || ''), omschrijving: String(r.omschrijving || ''), tekst: String(r.tekst || '') }, vg, zin.cyrillisch, 320, extra);
    Object.assign(signalen, afgeleid, { stam: afgeleid.stam || (!!r.stam_hit && !r.fts), inTrefwoord: false });
    const score = Number(r.score);
    const extraVeld = r.extra && typeof r.extra === 'object' ? { ...r.extra } : {};
    if (Number(r.gelijknamig) > 1) extraVeld.gelijknamig = Number(r.gelijknamig);
    return {
      id: String(r.bron_id), bron: r.bron as ZoekBron, soort: (isZoekSoort(r.soort) ? r.soort : 'overig') as ZoekSoort, titel: String(r.titel || ''), titels: (r.titels && typeof r.titels === 'object' ? r.titels : {}),
      omschrijving: String(r.omschrijving || ''), pad: String(r.pad || ''), route: (r.route && typeof r.route === 'object' ? r.route as ZoekRoute : null), taal: (isZoekTaal(r.taal) ? r.taal : '') as ZoekTaal | '',
      formaat: String(r.formaat || ''), bijgewerktOp: Number(r.bijgewerkt || 0), extra: extraVeld, integratie: String(r.integratie || ''),
      score, percent: percentVan(score, maxScore), uitleg: uitlegVan(signalen), fragment,
    };
  });
  // ZOEKDIEP-001: oude objecten → de parameters die de pagina's lezen (backend/zoek/diepe-link.ts).
  await verrijkDiepeRoutes(userId, items).catch(() => undefined);
  if (process.env.ZOEK_DEBUG === 'aan') console.error(`[zoek] node ${Date.now() - tNode} ms (fragmenten/uitleg voor ${items.length} rijen), totaal ${Date.now() - t0} ms`);
  return { q, qNorm, items, ...(uit.facets ? { facets: uit.facets } : {}), suggesties: uit.suggesties, totaal: uit.totaal, pagina, perPagina, bron: 'index', ...(uit.verzwakt ? { verzwakt: true } : {}), duurMs: Date.now() - t0, versie: ZOEK_VERSIE };
}
/** Zoeken in één lade. */
export const zoek = (lade: Lade, vraag: ZoekVraag): Promise<ZoekAntwoord> => zoekInLaden([{ lade: eis(lade), bronnen: vraag.bronnen?.length ? vraag.bronnen : ZOEK_BRONNEN }], vraag);

// ------------------------------------------------------------------------------------------------ correcties en suggesties
const ladeWhere = (laden: ReadonlyArray<LadeGroep>, p: unknown[]) => laden.map(({ lade, bronnen }) => { p.push(lade.ruimte, [...bronnen]); return `(ruimte = $${p.length - 1} AND bron = ANY($${p.length}::text[]))`; }).join(' OR ');
/** Genormaliseerde woorden uit de titels van de 5000 recentste objecten van deze laden die op `woord` lijken (pg_trgm). */
async function lijkendeWoorden(run: Q, userId: string, laden: ReadonlyArray<LadeGroep>, woord: string, max = 3): Promise<string[]> {
  if (woord.length < 3) return [];
  const p: unknown[] = [userId]; const lw = ladeWhere(laden, p); p.push(woord);
  const r = await run(
    `SELECT w, count(*)::int AS n, similarity(w, $${p.length}) AS sim
       FROM (SELECT unnest(string_to_array(titel_norm, ' ')) AS w FROM (SELECT titel_norm FROM app.zoek_objecten WHERE user_id = $1 AND (${lw}) ORDER BY bijgewerkt_op DESC LIMIT 5000) t) x
      WHERE length(w) >= 3 AND w <> $${p.length} AND similarity(w, $${p.length}) >= 0.4
      GROUP BY w ORDER BY sim DESC, n DESC LIMIT ${max}`, p);
  return r.rows.map(x => String(x.w));
}
/**
 * Het ORIGINELE woord (uit titel/titels, in het schrift van de vraag) bij een genormaliseerd woord: «tekhnichnyy» → «Технічний».
 * Leest hoogstens 30 titels uit de lade die het woord bevatten; onbekend → het genormaliseerde woord zelf.
 */
async function origineleWoorden(run: Q, userId: string, laden: ReadonlyArray<LadeGroep>, normWoorden: readonly string[], cyrillisch: boolean): Promise<Map<string, string>> {
  const uit = new Map<string, string>();
  const nodig = [...new Set(normWoorden.filter(Boolean))]; if (!nodig.length) return uit;
  const p: unknown[] = [userId]; const lw = ladeWhere(laden, p); p.push(nodig.map(w => `%${w}%`));
  const r = await run(`SELECT titel, titels FROM app.zoek_objecten WHERE user_id = $1 AND (${lw}) AND titel_norm LIKE ANY($${p.length}::text[]) ORDER BY bijgewerkt_op DESC LIMIT 30`, p);
  const kandidaten = new Map<string, { cyr: string[]; lat: string[] }>();
  for (const x of r.rows) {
    const teksten = [String(x.titel || ''), ...Object.values((x.titels || {}) as Record<string, unknown>).map(String)];
    for (const t of teksten) for (const w of t.split(/[^\p{L}\p{N}'’ʼ-]+/u)) {
      if (!w) continue; const n = zoekNorm(w); if (!n) continue;
      const kandidaat = kandidaten.get(n) || { cyr: [], lat: [] }; (CYRILLISCH.test(w) ? kandidaat.cyr : kandidaat.lat).push(w); kandidaten.set(n, kandidaat);
    }
  }
  const meest = (a: string[]) => { const tel = new Map<string, number>(); for (const w of a) tel.set(w, (tel.get(w) || 0) + 1); return [...tel].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]?.[0]; };
  for (const n of nodig) { const k = kandidaten.get(n); const o = k ? (cyrillisch ? meest(k.cyr) || meest(k.lat) : meest(k.lat) || meest(k.cyr)) : undefined; uit.set(n, o || n); }
  return uit;
}
let woordenboekWoorden: Array<{ norm: string; origineel: string }> | null = null;
const woordenboek = () => (woordenboekWoorden ??= (() => { const m = new Map<string, string>(); for (const g of SYNONIEM_GROEPEN) for (const s of g.synoniemen) for (const w of s.split(/\s+/)) { const n = zoekNorm(w); if (n.length >= 4 && !m.has(n)) m.set(n, w.toLowerCase()); } return [...m].map(([norm, origineel]) => ({ norm, origineel })); })());
/** Correcties uit het woordenboek: [genormaliseerd, origineel in het schrift van de vraag]. */
function lijkendInWoordenboek(woord: string, cyrillisch: boolean, max = 2): Array<[string, string]> {
  if (woord.length < 4) return [];
  return woordenboek().filter(w => CYRILLISCH.test(w.origineel) === cyrillisch).map(w => [w, trigramSimilariteit(w.norm, woord)] as const).filter(([w, s]) => s >= 0.5 && w.norm !== woord).sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => [w.norm, w.origineel]);
}
const vervangWoord = (q: string, van: string, naar: string): string => q.split(/(\s+)/).map(w => (zoekNorm(w) === van ? naar : w)).join('');
async function correcties(run: Q, laden: ReadonlyArray<LadeGroep>, zin: Zin, q: string): Promise<ZoekSuggestie[]> {
  const uit: ZoekSuggestie[] = []; const gezien = new Set<string>(); const cyr = CYRILLISCH.test(q);
  for (const token of zin.tokens.slice(0, 3)) {
    if (token.length < 4) continue;
    const eigen = await lijkendeWoorden(run, laden[0].lade.userId, laden, token).catch(() => [] as string[]);
    const orig = await origineleWoorden(run, laden[0].lade.userId, laden, eigen, cyr).catch(() => new Map<string, string>());
    const kandidaten: Array<[string, string]> = [...eigen.map(w => [w, orig.get(w) || w] as [string, string]), ...lijkendInWoordenboek(token, cyr)];
    for (const [norm, origineel] of kandidaten.slice(0, 3)) {
      const nieuw = vervangWoord(q, token, origineel);
      if (gezien.has(nieuw) || zoekNorm(nieuw) === zoekNorm(q) || norm === token) continue; gezien.add(nieuw);
      uit.push({ soort: 'correctie', tekst: nieuw, label: { uk: `Можливо, ви мали на увазі «${nieuw}»`, nl: `Bedoelde u «${nieuw}»?` } });
    }
  }
  return uit.slice(0, 5);
}

/**
 * Autoaanvulling vanaf een voorvoegsel: functies/pagina's (ui/instelling/pagina/hulp), woordaanvullingen uit titels,
 * correcties, synoniemen/vertalingen uit het woordenboek en categorieën (bron met aantal). ALLEEN uit deze lade.
 * `tekst` is altijd het ORIGINELE woord (in het schrift van de vraag) + het eerder getypte deel; `label` uk/nl waar bekend.
 */
export async function suggesties(lade: Lade, prefix: string, opties: { bronnen?: readonly ZoekBron[]; max?: number } = {}): Promise<ZoekSuggestie[]> {
  const { userId, ruimte } = eis(lade);
  const max = Math.max(1, Math.min(30, opties.max || 12));
  const ruw = tekst(prefix, 200).trim(), norm = zoekNorm(ruw, 200), cyr = CYRILLISCH.test(ruw);
  if (norm.length < 1) return [];
  const woorden = norm.split(' ').filter(Boolean), laatste = woorden[woorden.length - 1] || '';
  const ruwWoorden = ruw.split(/\s+/).filter(Boolean), eerderRuw = ruwWoorden.slice(0, -1).join(' ');
  const met = (w: string) => (eerderRuw ? `${eerderRuw} ${w}` : w);
  const bronnen = (opties.bronnen?.length ? opties.bronnen.filter(isZoekBron) : [...ZOEK_BRONNEN]);
  const laden: LadeGroep[] = [{ lade, bronnen }];
  return alsGebruiker(userId, async run => {
    const uit: ZoekSuggestie[] = []; const gezien = new Set<string>();
    const voeg = (s: ZoekSuggestie) => { const k = `${s.soort}:${s.tekst.toLowerCase()}:${s.id || ''}`; if (!gezien.has(k) && uit.length < max) { gezien.add(k); uit.push(s); } };
    // 1. functies / pagina's / instellingen van de site (handelingen eerst; pagina/menu vóór knoppen; titel in de taal van de vraag)
    if (norm.length >= 2) {
      const r = await run(
        `SELECT bron, bron_id, soort, titel, titels, route, pad FROM app.zoek_objecten
          WHERE user_id = $1 AND ruimte = $2 AND bron = ANY($3::text[]) AND bron IN ('ui', 'pagina', 'instelling', 'hulp')
            AND (titel_norm LIKE $4 || '%' OR titel_norm LIKE '% ' || $4 || '%' OR trefwoorden_norm LIKE '%' || $4 || '%' OR omschrijving_norm LIKE '%' || $4 || '%')
          ORDER BY (titel_norm LIKE $4 || '%') DESC, (titel_norm LIKE '% ' || $4 || '%') DESC, ${SOORT_RANG_SQL.replace(/\bo\./g, '')} DESC, length(titel_norm) ASC LIMIT 6`, [userId, ruimte, bronnen, norm]);
      for (const x of r.rows) {
        const t = cyr ? String(x.titels?.uk || x.titel || '') : String(x.titels?.nl || x.titel || '');
        voeg({ soort: x.soort === 'pagina' || x.soort === 'menu' ? 'pagina' : 'functie', tekst: t, label: { uk: String(x.titels?.uk || x.titel || ''), nl: String(x.titels?.nl || x.titel || '') }, bron: x.bron, id: String(x.bron_id), route: x.route || null });
      }
    }
    // 2. woordaanvullingen uit titels van deze lade — teruggegeven als het ORIGINELE woord
    if (laatste.length >= 2) {
      const r = await run(
        `SELECT w, count(*)::int AS n FROM (SELECT unnest(string_to_array(titel_norm, ' ')) AS w FROM (SELECT titel_norm FROM app.zoek_objecten WHERE user_id = $1 AND ruimte = $2 AND bron = ANY($3::text[]) ORDER BY bijgewerkt_op DESC LIMIT 5000) t) x
          WHERE w LIKE $4 || '%' AND w <> $4 AND length(w) >= 3 GROUP BY w ORDER BY n DESC, w ASC LIMIT 6`, [userId, ruimte, bronnen, laatste]);
      const orig = await origineleWoorden(run, userId, laden, r.rows.map(x => String(x.w)), cyr).catch(() => new Map<string, string>());
      for (const x of r.rows) { const o = orig.get(String(x.w)) || String(x.w); if (zoekNorm(o).startsWith(laatste)) voeg({ soort: 'aanvulling', tekst: met(o), label: { uk: o, nl: o }, aantal: Number(x.n) }); }
    }
    // 3. correcties (lade + woordenboek), origineel woord
    if (laatste.length >= 4) {
      const eigen = await lijkendeWoorden(run, userId, laden, laatste, 2).catch(() => [] as string[]);
      const orig = await origineleWoorden(run, userId, laden, eigen, cyr).catch(() => new Map<string, string>());
      for (const k of [...eigen.map(w => orig.get(w) || w), ...lijkendInWoordenboek(laatste, cyr, 1).map(([, o]) => o)]) voeg({ soort: 'correctie', tekst: met(k), label: { uk: `Можливо, ви мали на увазі «${met(k)}»`, nl: `Bedoelde u «${met(k)}»?` } });
    }
    // 4. synoniemen / vertalingen (ingebouwd + eigenaar) — originele vorm uit het woordenboek
    const eigenGroepen = await eigenSynoniemen(lade).catch(() => []);
    const origSyn = new Map<string, string>(); for (const g of [...eigenGroepen, ...SYNONIEM_GROEPEN]) for (const s of g.synoniemen) { const n = zoekNorm(s); if (!origSyn.has(n)) origSyn.set(n, s.toLowerCase()); }
    for (const s of synoniemen(laatste, eigenGroepen).slice(1, 5)) voeg({ soort: 'synoniem', tekst: met(origSyn.get(s) || s), label: { uk: origSyn.get(s) || s, nl: origSyn.get(s) || s } });
    // 5. categorieën met aantal (alleen als er echt iets is)
    if (norm.length >= 2) {
      const r = await run(`SELECT bron, count(*)::int AS n FROM app.zoek_objecten WHERE user_id = $1 AND ruimte = $2 AND bron = ANY($3::text[]) AND zoek_vector @@ to_tsquery('simple', $4) GROUP BY bron ORDER BY n DESC LIMIT 6`,
        [userId, ruimte, bronnen, woorden.map(tsToken).filter(w => w.length >= 2).map(w => `${w}:*`).join(' & ') || 'zzzz_niets']);
      for (const x of r.rows) if (isZoekBron(x.bron)) voeg({ soort: 'categorie', tekst: ruw, bron: x.bron, aantal: Number(x.n), label: BRON_NAAM[x.bron as ZoekBron] });
    }
    return uit;
  });
}

// ------------------------------------------------------------------------------------------------ achterwaartse compatibiliteit (Etap A+B)
export type IndexTreffer = { bron: ZoekBron; bronId: string; titel: string; inhoud: string; metadata: Record<string, unknown>; bijgewerktOp: number; relevantie: number };
/** Oude vorm: zoekInIndex(besluit, bronnen, vraag, groepen). Gesloten besluit → []. */
export async function zoekInIndex(besluit: { ok: boolean; lade?: Lade }, bronnen: readonly ZoekBron[], vraag: string, _groepen?: string[][], limiet = 20): Promise<IndexTreffer[]> {
  if (!besluit.ok || !besluit.lade || !bronnen.length) return [];
  const a = await zoekInLaden([{ lade: besluit.lade, bronnen }], { q: vraag, perPagina: Math.max(1, Math.min(100, limiet)), facets: false });
  return a.items.map(t => ({ bron: t.bron, bronId: t.id, titel: t.titel, inhoud: t.fragment.tekst, metadata: { ...t.extra, onderkop: t.omschrijving }, bijgewerktOp: t.bijgewerktOp, relevantie: t.percent }));
}
/** Oude vorm: objecten met {bron, bronId, soort, userId, ruimte, titel, inhoud, metadata, aangemaaktOp, bijgewerktOp}. */
export async function zoekIndexBijwerken(besluit: { ok: boolean; lade?: Lade }, objecten: ReadonlyArray<{ bron: string; bronId: string; soort?: string; userId: string; ruimte: Lade['ruimte']; titel: string; inhoud: string; metadata?: Record<string, unknown>; aangemaaktOp?: number; bijgewerktOp?: number }>): Promise<number> {
  if (!besluit.ok || !besluit.lade || !objecten.length) return 0;
  const { userId, ruimte } = besluit.lade;
  if (objecten.some(o => o.userId !== userId || o.ruimte !== ruimte)) throw new Error('ZOEK_INDEX_LADE_MISMATCH');
  const r = await indexeer(besluit.lade, objecten.map(o => ({
    id: o.bronId, bron: (o.bron === 'calendar' ? 'agenda' : o.bron) as ZoekBron, soort: (isZoekSoort(o.soort) ? o.soort : 'overig') as ZoekSoort, titel: o.titel, tekst: o.inhoud,
    omschrijving: typeof o.metadata?.onderkop === 'string' ? o.metadata.onderkop : '', extra: o.metadata || {}, bijgewerktOp: o.bijgewerktOp || Date.now(), aangemaaktOp: o.aangemaaktOp, rechten: { userId, ruimte },
  })));
  return r.toegevoegd + r.bijgewerkt + r.overgeslagen;
}
export const zoekIndexVerwijderen = (besluit: { ok: boolean; lade?: Lade }, bron: ZoekBron, bronIds: readonly string[]): Promise<number> => (!besluit.ok || !besluit.lade ? Promise.resolve(0) : verwijder(besluit.lade, bron, bronIds));
