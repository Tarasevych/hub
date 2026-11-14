// WERKBLAD «Blokken» (0116) — opslag van «blok in blok» op widgets/mappen van een v3-laag, plekken buiten het canvas,
// momentopname (blokken_backup) en herstel. Stroom A. Ontwerp: docs/ontwerp/WERKBLAD-BLOKKEN.md.
//
// Zelfde veiligheidsregels als backend/werkblad-v3.ts:
//   • lade (userId + ruimte) uit de sessie via werkbladLade — nooit uit het verzoek; ruimte (privé/technisch) dus ALTIJD door de server;
//   • elke query onder alsGebruiker() (RLS) én met `user_id = $1 AND ruimte = $2`;
//   • alles wat binnenkomt door valideerBlok (streng) met de registerhaak van DEZE ruimte en DIT apparaat; bij lezen mild
//     (een item dat intussen niet meer mag, valt stil weg — er lekt niets van technisch naar privé);
//   • versie: blokken op een DesktopEntry delen de LAAGVERSIE van v3 (werkblad_layout.versie) → 409 WERKBLAD_V3_VEROUDERD;
//     plekken hebben een eigen versie per plek;
//   • vlag 'werkblad-blokken' uit → laden {aan:false}, schrijven 403; de kolom wordt genegeerd, NIET gewist. Herstellen werkt altijd.
//   • vóór en na elke schrijf die blokken raakt: momentopname in werkblad_v3_lade.blokken_backup ({voor, na}).
import { error, json } from '../server/platform';
import { alsGebruiker } from './ai-toestemmingen';
import { isEigenaar } from './tech-profiel';
import { werkbladLade } from './werkblad';
import { overzetten } from './werkblad-v3';
import type { Lade } from '../shared/ruimte-scheiding';
import { APPARATEN, apparaatOf, type V3Context } from '../shared/werkblad-v3';
import type { ApparaatKlasse, ItemSoort, WerkbladRuimte } from '../shared/werkblad-v3-types';
import { jsonbTekst } from '../shared/tekst-veilig';
import {
  BLOKKEN_OPSLAG, PLEK_ID_RE, WERKBLAD_BLOKKEN_VLAG,
  type BlokInhoud, type BlokkenBackup, type BlokkenLaag, type BlokkenMomentopname, type BlokkenStand, type PlekStand,
} from '../shared/werkblad-blokken';
import { knoopIds, normaliseerBlok, valideerBlok } from '../shared/werkblad-blokken-boom';

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type ItemHaak = (itemId: string, kind: ItemSoort, ruimte: WerkbladRuimte, apparaat: ApparaatKlasse, config?: Record<string, unknown>) => boolean;
export type BlokkenContext = { ruimte: WerkbladRuimte; eigenaar?: boolean; itemToegestaan?: ItemHaak; v3?: V3Context };

const ms = (v: unknown) => (v ? new Date(v as string).getTime() : 0);
const soortVan = (itemId: string): ItemSoort => (itemId.startsWith('wdg:') ? 'widget' : 'shortcut');
/** Veilige standaard zonder register: alleen vorm + wdg:tech-* alleen technisch (zoals shared/werkblad-v3 standaardItemToegestaan). */
const standaardHaak: ItemHaak = (itemId, _k, ruimte) => !/^(wdg|svc|pg|cmd):tech[-.]/.test(itemId) || ruimte === 'technisch';
const magOp = (ctx: BlokkenContext, apparaat: ApparaatKlasse | null) => (itemId: string, config?: Record<string, unknown>) => {
  const h = ctx.itemToegestaan ?? standaardHaak;
  return apparaat ? h(itemId, soortVan(itemId), ctx.ruimte, apparaat, config) : APPARATEN.some((a) => h(itemId, soortVan(itemId), ctx.ruimte, a, config));
};
const mild = (raw: unknown, ctx: BlokkenContext, apparaat: ApparaatKlasse | null): BlokInhoud | null =>
  normaliseerBlok(raw, { toegestaan: magOp(ctx, apparaat), streng: false }).waarde;

// ---------------------------------------------------------------- lezen
async function laagBlokken(q: Q, lade: Lade, apparaat: ApparaatKlasse, ctx: BlokkenContext, slot = false): Promise<(BlokkenLaag & { id: string }) | null> {
  const l = (await q(`SELECT id, versie FROM app.werkblad_layout WHERE user_id = $1 AND ruimte = $2 AND apparaat = $3${slot ? ' FOR UPDATE' : ''}`, [lade.userId, lade.ruimte, apparaat])).rows[0];
  if (!l) return null;
  const blokken: Record<string, BlokInhoud> = {};
  for (const r of (await q(`SELECT instance_id, blok FROM app.werkblad_items WHERE layout_id = $1 AND user_id = $2 AND ruimte = $3 AND blok IS NOT NULL ORDER BY z`, [l.id, lade.userId, lade.ruimte])).rows) {
    const b = mild(r.blok, ctx, apparaat); if (b) blokken[r.instance_id] = b;
  }
  return { id: String(l.id), versie: Number(l.versie), blokken };
}
async function plekkenLezen(q: Q, lade: Lade, ctx: BlokkenContext): Promise<PlekStand[]> {
  const uit: PlekStand[] = [];
  for (const r of (await q(`SELECT plek_id, blok, versie, bijgewerkt_op FROM app.werkblad_plekken WHERE user_id = $1 AND ruimte = $2 ORDER BY plek_id`, [lade.userId, lade.ruimte])).rows) {
    const b = mild(r.blok, ctx, null); if (b) uit.push({ plekId: r.plek_id, blok: b, versie: Number(r.versie), bijgewerktOp: ms(r.bijgewerkt_op) });
  }
  return uit;
}
/** Ruwe momentopname (zonder filter: de backup moet ALLES bewaren, ook wat nu tijdelijk niet getoond mag worden). */
async function momentopname(q: Q, lade: Lade): Promise<BlokkenMomentopname> {
  const m: BlokkenMomentopname = { lagen: {}, plekken: {} };
  for (const r of (await q(`SELECT apparaat, instance_id, blok FROM app.werkblad_items WHERE user_id = $1 AND ruimte = $2 AND blok IS NOT NULL`, [lade.userId, lade.ruimte])).rows) {
    const a = r.apparaat as ApparaatKlasse; (m.lagen[a] ??= {})[r.instance_id] = r.blok;
  }
  for (const r of (await q(`SELECT plek_id, blok FROM app.werkblad_plekken WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte])).rows) m.plekken[r.plek_id] = r.blok;
  return m;
}
const isLeeg = (m: BlokkenMomentopname | null) => !m || (!Object.keys(m.plekken).length && !Object.values(m.lagen).some((l) => l && Object.keys(l).length));

async function backupSchrijven(q: Q, lade: Lade, voor: BlokkenMomentopname | null): Promise<void> {
  const na = await momentopname(q, lade);
  let b: BlokkenBackup = { op: Date.now(), voor: isLeeg(voor) ? null : voor, na: isLeeg(na) ? null : na };
  if (JSON.stringify(b).length > BLOKKEN_OPSLAG.maxBytesBackup) b = { ...b, voor: null };
  if (JSON.stringify(b).length > BLOKKEN_OPSLAG.maxBytesBackup) return; // te groot: liever de oude backup houden dan een halve
  await q(`UPDATE app.werkblad_v3_lade SET blokken_backup = $3::jsonb WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte, jsonbTekst(b)]);
}
async function backupInfo(q: Q, lade: Lade): Promise<BlokkenStand['backup']> {
  const r = (await q(`SELECT blokken_backup AS b FROM app.werkblad_v3_lade WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte])).rows[0]?.b;
  return r ? { op: Number(r.op || 0), heeftVoor: Boolean(r.voor), heeftNa: Boolean(r.na) } : null;
}

// ---------------------------------------------------------------- haak voor backend/werkblad-v3.ts laagSchrijven (DELETE + INSERT)
export type BewaardeBlokken = { voor: BlokkenMomentopname; rijen: Array<{ instanceId: string; kind: string; itemId: string; blok: unknown }> } | null;
/** Vóór de DELETE: blokken van deze laag onthouden (+ momentopname). Leeg → null (v3 zonder blokken betaalt bijna niets). */
export async function blokkenVoorSchrijven(q: Q, lade: Lade, layoutId: string): Promise<BewaardeBlokken> {
  const rijen = (await q(`SELECT instance_id, kind, item_id, blok FROM app.werkblad_items WHERE layout_id = $1 AND user_id = $2 AND ruimte = $3 AND blok IS NOT NULL`, [layoutId, lade.userId, lade.ruimte])).rows
    .map((r) => ({ instanceId: String(r.instance_id), kind: String(r.kind), itemId: String(r.item_id), blok: r.blok }));
  return rijen.length ? { voor: await momentopname(q, lade), rijen } : null;
}
/** Na de INSERT: blok terugzetten op items met dezelfde instanceId, soort en itemId (vlag aan of uit — de kolom wordt nooit stil gewist). */
export async function blokkenNaSchrijven(q: Q, lade: Lade, layoutId: string, b: BewaardeBlokken): Promise<void> {
  if (!b) return;
  await q(
    `UPDATE app.werkblad_items i SET blok = r.blok FROM jsonb_to_recordset($4::jsonb) AS r("instanceId" text, kind text, "itemId" text, blok jsonb)
     WHERE i.layout_id = $1 AND i.user_id = $2 AND i.ruimte = $3 AND i.instance_id = r."instanceId" AND i.kind = r.kind AND i.item_id = r."itemId"`,
    [layoutId, lade.userId, lade.ruimte, jsonbTekst(b.rijen)]);
  await backupSchrijven(q, lade, b.voor);
}

// ---------------------------------------------------------------- bewerkingen
export async function blokkenLaden(lade: Lade, ctx: BlokkenContext, apparaat?: ApparaatKlasse | null): Promise<BlokkenStand> {
  return alsGebruiker(lade.userId, async (q) => {
    const lagen: BlokkenStand['lagen'] = {};
    for (const a of apparaat ? [apparaat] : APPARATEN) { const l = await laagBlokken(q, lade, a, ctx); if (l) lagen[a] = { versie: l.versie, blokken: l.blokken }; }
    return { ruimte: lade.ruimte as WerkbladRuimte, lagen, plekken: await plekkenLezen(q, lade, ctx), backup: await backupInfo(q, lade) };
  });
}

export type BlokBewaarUitkomst =
  | { ok: true; apparaat: ApparaatKlasse; laag: BlokkenLaag }
  | { ok: false; status: 409; code: 'WERKBLAD_V3_VEROUDERD'; apparaat: ApparaatKlasse; laag: BlokkenLaag | null }
  | { ok: false; status: 400 | 404 | 413; code: string; fouten?: string[] };

/** Blok van één widget/map zetten (blok=null → weghalen, de widget tekent dan weer automatisch). `versie` = laagversie. */
export async function blokBewaren(lade: Lade, ctx: BlokkenContext, apparaat: ApparaatKlasse, invoer: { instanceId: unknown; blok: unknown; versie: unknown }): Promise<BlokBewaarUitkomst> {
  const instanceId = typeof invoer.instanceId === 'string' && /^[a-z0-9-]{1,40}$/.test(invoer.instanceId) ? invoer.instanceId : null;
  if (!instanceId) return { ok: false, status: 400, code: 'WERKBLAD_BLOKKEN_GEEN_ITEM' };
  if (JSON.stringify(invoer.blok ?? null).length > BLOKKEN_OPSLAG.maxBytesBlok) return { ok: false, status: 413, code: 'WERKBLAD_BLOKKEN_TE_GROOT' };
  let blok: BlokInhoud | null = null;
  if (invoer.blok !== null && invoer.blok !== undefined) {
    const v = valideerBlok(invoer.blok, magOp(ctx, apparaat));
    if (!v.ok) return { ok: false, status: 400, code: 'WERKBLAD_BLOKKEN_ONGELDIG', fouten: v.fouten.slice(0, 10) };
    blok = { ...v.waarde, bron: v.waarde.bron ?? 'eigen' };
  }
  const versieClient = Math.max(0, Math.trunc(Number(invoer.versie) || 0));
  return alsGebruiker(lade.userId, async (q) => {
    if (ctx.v3) await overzetten(q, lade, ctx.v3);
    await q(`SELECT 1 FROM app.werkblad_v3_lade WHERE user_id = $1 AND ruimte = $2 FOR UPDATE`, [lade.userId, lade.ruimte]);
    const laag = await laagBlokken(q, lade, apparaat, ctx, true);
    if (!laag || laag.versie !== versieClient) return { ok: false as const, status: 409 as const, code: 'WERKBLAD_V3_VEROUDERD' as const, apparaat, laag: laag ? { versie: laag.versie, blokken: laag.blokken } : null };
    const item = (await q(`SELECT kind FROM app.werkblad_items WHERE layout_id = $1 AND user_id = $2 AND ruimte = $3 AND instance_id = $4`, [laag.id, lade.userId, lade.ruimte, instanceId])).rows[0];
    if (!item || (item.kind !== 'widget' && item.kind !== 'folder')) return { ok: false as const, status: 404 as const, code: 'WERKBLAD_BLOKKEN_GEEN_ITEM' };
    if (blok) { // knoop-ids uniek over de hele laag
      const anderen = new Set(Object.entries(laag.blokken).filter(([k]) => k !== instanceId).flatMap(([, b]) => knoopIds(b.wortel)));
      const dubbel = knoopIds(blok.wortel).filter((i) => anderen.has(i));
      if (dubbel.length) return { ok: false as const, status: 400 as const, code: 'WERKBLAD_BLOKKEN_ONGELDIG', fouten: dubbel.slice(0, 10).map((i) => `dubbele-id:${i}`) };
    }
    const voor = await momentopname(q, lade);
    await q(`UPDATE app.werkblad_items SET blok = $5::jsonb WHERE layout_id = $1 AND user_id = $2 AND ruimte = $3 AND instance_id = $4`, [laag.id, lade.userId, lade.ruimte, instanceId, blok ? jsonbTekst(blok) : null]);
    await q(`UPDATE app.werkblad_layout SET versie = versie + 1, bijgewerkt_op = now() WHERE id = $1 AND user_id = $2 AND ruimte = $3`, [laag.id, lade.userId, lade.ruimte]);
    await backupSchrijven(q, lade, voor);
    const na = (await laagBlokken(q, lade, apparaat, ctx))!;
    return { ok: true as const, apparaat, laag: { versie: na.versie, blokken: na.blokken } };
  });
}

export type PlekBewaarUitkomst =
  | { ok: true; plek: PlekStand | null; plekId: string }
  | { ok: false; status: 409; code: 'WERKBLAD_V3_VEROUDERD'; plekId: string; plek: PlekStand | null }
  | { ok: false; status: 400 | 413; code: string; fouten?: string[] };

/** Plek buiten het canvas zetten of (blok=null) leegmaken. versie 0 = plek bestond nog niet. */
export async function plekBewaren(lade: Lade, ctx: BlokkenContext, invoer: { plekId: unknown; blok: unknown; versie: unknown }): Promise<PlekBewaarUitkomst> {
  const plekId = typeof invoer.plekId === 'string' && PLEK_ID_RE.test(invoer.plekId) ? invoer.plekId : null;
  if (!plekId) return { ok: false, status: 400, code: 'WERKBLAD_BLOKKEN_PLEK_ONGELDIG' };
  if (JSON.stringify(invoer.blok ?? null).length > BLOKKEN_OPSLAG.maxBytesBlok) return { ok: false, status: 413, code: 'WERKBLAD_BLOKKEN_TE_GROOT' };
  let blok: BlokInhoud | null = null;
  if (invoer.blok !== null && invoer.blok !== undefined) {
    const v = valideerBlok(invoer.blok, magOp(ctx, null));
    if (!v.ok) return { ok: false, status: 400, code: 'WERKBLAD_BLOKKEN_ONGELDIG', fouten: v.fouten.slice(0, 10) };
    blok = { ...v.waarde, bron: v.waarde.bron ?? 'eigen' };
  }
  const versieClient = Math.max(0, Math.trunc(Number(invoer.versie) || 0));
  return alsGebruiker(lade.userId, async (q) => {
    if (ctx.v3) await overzetten(q, lade, ctx.v3);
    const lade0 = (await q(`SELECT 1 FROM app.werkblad_v3_lade WHERE user_id = $1 AND ruimte = $2 FOR UPDATE`, [lade.userId, lade.ruimte])).rows[0];
    if (!lade0) return { ok: false as const, status: 400 as const, code: 'WERKBLAD_BLOKKEN_GEEN_ITEM' };
    const huidig = (await q(`SELECT plek_id, blok, versie, bijgewerkt_op FROM app.werkblad_plekken WHERE user_id = $1 AND ruimte = $2 AND plek_id = $3 FOR UPDATE`, [lade.userId, lade.ruimte, plekId])).rows[0];
    const stand = (r: any): PlekStand | null => { const b = r ? mild(r.blok, ctx, null) : null; return r && b ? { plekId, blok: b, versie: Number(r.versie), bijgewerktOp: ms(r.bijgewerkt_op) } : null; }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if ((huidig ? Number(huidig.versie) : 0) !== versieClient) return { ok: false as const, status: 409 as const, code: 'WERKBLAD_V3_VEROUDERD' as const, plekId, plek: stand(huidig) };
    if (!huidig && blok) {
      const n = Number((await q(`SELECT count(*)::int AS n FROM app.werkblad_plekken WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte])).rows[0].n);
      if (n >= BLOKKEN_OPSLAG.maxPlekken) return { ok: false as const, status: 413 as const, code: 'WERKBLAD_BLOKKEN_TE_GROOT' };
    }
    const voor = await momentopname(q, lade);
    if (!blok) await q(`DELETE FROM app.werkblad_plekken WHERE user_id = $1 AND ruimte = $2 AND plek_id = $3`, [lade.userId, lade.ruimte, plekId]);
    else await q(
      `INSERT INTO app.werkblad_plekken (user_id, ruimte, plek_id, blok) VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (user_id, ruimte, plek_id) DO UPDATE SET blok = EXCLUDED.blok, versie = app.werkblad_plekken.versie + 1, bijgewerkt_op = now()
       WHERE app.werkblad_plekken.user_id = $1 AND app.werkblad_plekken.ruimte = $2`, [lade.userId, lade.ruimte, plekId, jsonbTekst(blok)]);
    await backupSchrijven(q, lade, voor);
    const na = (await q(`SELECT plek_id, blok, versie, bijgewerkt_op FROM app.werkblad_plekken WHERE user_id = $1 AND ruimte = $2 AND plek_id = $3`, [lade.userId, lade.ruimte, plekId])).rows[0];
    return { ok: true as const, plekId, plek: stand(na) };
  });
}

/**
 * «Відновити блоки»: momentopname terugzetten. welke='na' (standaard) = stand na de laatste schrijf (na een oude release die `blok`
 * wiste); 'voor' = de stand daarvóór (laatste wijziging ongedaan). Items die niet meer bestaan worden overgeslagen (geteld).
 * Elke geraakte laag krijgt versie +1 (open tabbladen krijgen 409 en laden opnieuw). Het herstel zelf is weer ongedaan te maken.
 */
export async function blokkenHerstellen(lade: Lade, welke: 'voor' | 'na' = 'na'): Promise<{ ok: boolean; code?: string; hersteld: number; overgeslagen: number; plekken: number }> {
  return alsGebruiker(lade.userId, async (q) => {
    const b = (await q(`SELECT blokken_backup AS b FROM app.werkblad_v3_lade WHERE user_id = $1 AND ruimte = $2 FOR UPDATE`, [lade.userId, lade.ruimte])).rows[0]?.b as BlokkenBackup | undefined;
    const m = b?.[welke];
    if (!b || (welke === 'voor' && !m) || (welke === 'na' && !m && !b.voor)) return { ok: false, code: 'WERKBLAD_BLOKKEN_GEEN_BACKUP', hersteld: 0, overgeslagen: 0, plekken: 0 };
    const doel: BlokkenMomentopname = m ?? { lagen: {}, plekken: {} };
    const voor = await momentopname(q, lade);
    let hersteld = 0, overgeslagen = 0;
    for (const a of APPARATEN) {
      const l = (await q(`SELECT id FROM app.werkblad_layout WHERE user_id = $1 AND ruimte = $2 AND apparaat = $3 FOR UPDATE`, [lade.userId, lade.ruimte, a])).rows[0];
      const gewenst = doel.lagen[a] ?? {};
      if (!l) { overgeslagen += Object.keys(gewenst).length; continue; }
      const wis = await q(`UPDATE app.werkblad_items SET blok = NULL WHERE layout_id = $1 AND user_id = $2 AND ruimte = $3 AND blok IS NOT NULL AND NOT (instance_id = ANY($4))`, [l.id, lade.userId, lade.ruimte, Object.keys(gewenst)]);
      let n = 0;
      for (const [inst, blok] of Object.entries(gewenst)) {
        const r = await q(`UPDATE app.werkblad_items SET blok = $5::jsonb WHERE layout_id = $1 AND user_id = $2 AND ruimte = $3 AND instance_id = $4 AND kind IN ('widget', 'folder')`, [l.id, lade.userId, lade.ruimte, inst, jsonbTekst(blok)]);
        if (r.rowCount) n++; else overgeslagen++;
      }
      hersteld += n;
      if (n || wis.rowCount) await q(`UPDATE app.werkblad_layout SET versie = versie + 1, bijgewerkt_op = now() WHERE id = $1`, [l.id]);
    }
    await q(`DELETE FROM app.werkblad_plekken WHERE user_id = $1 AND ruimte = $2 AND NOT (plek_id = ANY($3))`, [lade.userId, lade.ruimte, Object.keys(doel.plekken)]);
    for (const [pid, blok] of Object.entries(doel.plekken)) {
      await q(`INSERT INTO app.werkblad_plekken (user_id, ruimte, plek_id, blok) VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (user_id, ruimte, plek_id) DO UPDATE SET blok = EXCLUDED.blok, versie = app.werkblad_plekken.versie + 1, bijgewerkt_op = now()`, [lade.userId, lade.ruimte, pid, jsonbTekst(blok)]);
    }
    await backupSchrijven(q, lade, voor);
    return { ok: true, hersteld, overgeslagen, plekken: Object.keys(doel.plekken).length };
  });
}

// ---------------------------------------------------------------- routes
type User = { id: string; status: string; role?: string; email?: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<{ service: string; user: User } | { errorCode: string }>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
export type BlokkenRouteOpties = {
  /** Server-side: vlag 'werkblad-v3' ÉN 'werkblad-blokken' voor deze gebruiker (backend/index.ts). Fout → uit. */
  vlagAan: (user: User) => Promise<boolean>;
  register?: { itemToegestaan: ItemHaak } & Partial<Pick<V3Context, 'grenzen' | 'singleton'>>;
};
const bodyOf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});

export const createWerkbladBlokkenRoutes = (authorize: Authorize, opties: BlokkenRouteOpties) => {
  const met = (vlagNodig: boolean, fn: (lade: Lade, ctx: BlokkenContext, body: Record<string, unknown>) => Promise<ReturnType<typeof json>>) => [async (c: Context) => {
    const auth = await authorize(c.event, c.body);
    if ('errorCode' in auth || auth.service !== 'hub' || auth.user.status !== 'approved') return error('OWNER_HUB_WERKBLAD_REQUIRED', 403);
    const lade = await werkbladLade(auth.user.id, c.body);
    let aan = false;
    try { aan = (await opties.vlagAan(auth.user)) === true; } catch { aan = false; }
    if (vlagNodig && !aan) return error('WERKBLAD_BLOKKEN_UIT', 403);
    const ruimte = lade.ruimte as WerkbladRuimte, eigenaar = isEigenaar(auth.user);
    const ctx: BlokkenContext = { ruimte, eigenaar, itemToegestaan: opties.register?.itemToegestaan, v3: { ruimte, eigenaar, ...(opties.register ?? {}) } };
    try { return await fn(lade, ctx, { ...bodyOf(c.body), __aan: aan }); }
    catch (err) { console.error('[werkblad-blokken]', String((err as Error)?.message || err).slice(0, 200)); return error('WERKBLAD_BLOKKEN_MISLUKT', 500); }
  }];
  const B = '/api/owner/hub/werkblad/v3/blokken';
  return {
    [`POST ${B}/laden`]: met(false, async (lade, ctx, b) => {
      if (!b.__aan) return json({ source: 'server_werkblad_blokken_0116', aan: false, vlag: WERKBLAD_BLOKKEN_VLAG, ruimte: lade.ruimte });
      const ap = b.apparaat === undefined || b.apparaat === null || b.apparaat === '' ? null : apparaatOf(b.apparaat);
      if (b.apparaat && !ap) return error('WERKBLAD_V3_APPARAAT_ONGELDIG', 400);
      return json({ source: 'server_werkblad_blokken_0116', aan: true, ...(await blokkenLaden(lade, ctx, ap)) });
    }),
    [`POST ${B}/bewaren`]: met(true, async (lade, ctx, b) => {
      const apparaat = apparaatOf(b.apparaat);
      if (!apparaat) return error('WERKBLAD_V3_APPARAAT_ONGELDIG', 400);
      const u = await blokBewaren(lade, ctx, apparaat, { instanceId: b.instanceId, blok: b.blok, versie: b.versie });
      if (u.ok) return json({ ok: true, source: 'server_werkblad_blokken_0116', ruimte: lade.ruimte, apparaat, laag: u.laag });
      if (u.status === 409) return json({ ok: false, code: u.code, ruimte: lade.ruimte, apparaat, laag: u.laag }, 409);
      return json({ ok: false, code: u.code, fouten: u.fouten ?? [] }, u.status);
    }),
    [`POST ${B}/plek-bewaren`]: met(true, async (lade, ctx, b) => {
      const u = await plekBewaren(lade, ctx, { plekId: b.plekId, blok: b.blok, versie: b.versie });
      if (u.ok) return json({ ok: true, ruimte: lade.ruimte, plekId: u.plekId, plek: u.plek });
      if (u.status === 409) return json({ ok: false, code: u.code, ruimte: lade.ruimte, plekId: u.plekId, plek: u.plek }, 409);
      return json({ ok: false, code: u.code, fouten: u.fouten ?? [] }, u.status);
    }),
    /** «Відновити блоки». Werkt OOK met de vlag uit. */
    [`POST ${B}/herstellen`]: met(false, async (lade, _ctx, b) => {
      const u = await blokkenHerstellen(lade, b.welke === 'voor' ? 'voor' : 'na');
      return u.ok ? json({ ruimte: lade.ruimte, ...u }) : json({ ...u, ruimte: lade.ruimte }, 404);
    }),
  };
};
