// WERKBLAD v3 — vrij canvas op de server (etappe A, migratie 0114: app.werkblad_v3_lade / werkblad_layout / werkblad_items).
//
// Zelfde veiligheidsregels als backend/werkblad.ts (v2):
//   • de lade (userId + ruimte) komt uit de sessie en gegevensRuimteVeilig (werkbladLade) — nooit uit het verzoek;
//   • elke query draait onder alsGebruiker() (RLS 0114, één transactie) ÉN draagt zelf `user_id = $1 AND ruimte = $2`;
//   • alles wat binnenkomt gaat door shared/werkblad-v3.ts (normaliseerLaag) met de context van DEZE lade; onbekende velden vallen weg;
//   • versie per LAAG (user, ruimte, apparaat): de client stuurt de versie die hij laadde; wijkt die af van de server → 409
//     WERKBLAD_V3_VEROUDERD + de actuele laag (nooit stil overschrijven). Twee apparaatklassen botsen niet met elkaar.
//   • vlag 'werkblad-v3' (standaard uit) wordt op de server berekend (vlagAan wordt door backend/index.ts ingespoten, omdat alleen
//     index.ts backend/vlaggen mag importeren — tests/eenheid/vlaggen.test.ts). Vlag uit → v3-routes doen niets; v2 blijft exact
//     zoals het was; v3-gegevens blijven staan. Terugdraaien (v2-backup terugzetten) werkt ook met de vlag uit.
//   • overzetting v2 → v3: lui bij het eerste laden met vlag aan, ÉÉN keer per lade (INSERT … ON CONFLICT DO NOTHING in dezelfde
//     transactie als het lezen van de v2-rij); de v2-rij wordt NIET gewijzigd; een kopie staat in werkblad_v3_lade.v2_backup.
import { error, json } from '../server/platform';
import { alsGebruiker } from './ai-toestemmingen';
import { isEigenaar } from './tech-profiel';
import { werkbladLade } from './werkblad';
import { blokkenNaSchrijven, blokkenVoorSchrijven } from './werkblad-blokken';
import type { Lade } from '../shared/ruimte-scheiding';
import { achtergrondOf, normaliseerWerkblad, type WerkbladIndeling } from '../shared/werkblad-indeling';
import { APPARATEN, apparaatOf, migreerV2NaarV3, normaliseerLaag, type V3Context } from '../shared/werkblad-v3';
import { WERKBLAD_V3_FLAG, WERKBLAD_V3_LIMIETEN, type ApparaatKlasse, type CanvasLayout, type DesktopEntry, type WerkbladRuimte } from '../shared/werkblad-v3-types';
import { jsonbTekst } from '../shared/tekst-veilig';
import { persoonlijkItem, zonderTechDeuren, type PersoonlijkInvoer } from '../shared/werkblad-register';

export const WERKBLAD_SNELKOPPELINGEN_FLAG = 'werkblad-snelkoppelingen-v1';
export const MAX_PERSOONLIJK_ITEMS = 100;

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type LaagStand = { layout: CanvasLayout; versie: number; bijgewerktOp: number };
export type V3Stand = {
  ruimte: WerkbladRuimte; bestaat: boolean; achtergrond: string; herkomst: 'v2' | 'standaard' | ''; gemigreerdOp: number;
  heeftV2Backup: boolean; layouts: Partial<Record<ApparaatKlasse, LaagStand>>; persoonlijk: PersoonlijkInvoer[];
};

const ms = (v: unknown) => (v ? new Date(v as string).getTime() : 0);

async function laagLezen(q: Q, lade: Lade, apparaat: ApparaatKlasse, ctx: V3Context, slot = false): Promise<(LaagStand & { id: string }) | null> {
  const l = (await q(`SELECT id, modus, canvas_breedte, canvas_hoogte, versie, bijgewerkt_op FROM app.werkblad_layout WHERE user_id = $1 AND ruimte = $2 AND apparaat = $3${slot ? ' FOR UPDATE' : ''}`, [lade.userId, lade.ruimte, apparaat])).rows[0];
  if (!l) return null;
  const items = (await q(`SELECT instance_id, kind, item_id, x, y, w, h, z, locked, parent, title_override, icon_override, config FROM app.werkblad_items WHERE layout_id = $1 AND user_id = $2 AND ruimte = $3 AND apparaat = $4 ORDER BY z`, [l.id, lade.userId, lade.ruimte, apparaat])).rows
    .map((r): DesktopEntry => ({
      instanceId: r.instance_id, itemId: r.item_id, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, z: r.z,
      ...(r.locked ? { locked: true } : {}), ...(r.parent ? { parent: r.parent } : {}), ...(r.title_override ? { titleOverride: r.title_override } : {}),
      ...(r.icon_override ? { iconOverride: r.icon_override } : {}), ...(r.config ? { config: r.config } : {}),
    }));
  // Ook bij het lezen door de normalisatie: verandert het register (bv. een widget wordt technisch), dan lekt er niets.
  const layout = normaliseerLaag({ mode: l.modus, canvasWidth: l.canvas_breedte, canvasHeight: l.canvas_hoogte, items }, apparaat, ctx);
  return { id: String(l.id), layout, versie: Number(l.versie), bijgewerktOp: ms(l.bijgewerkt_op) };
}

async function laagSchrijven(q: Q, lade: Lade, apparaat: ApparaatKlasse, layout: CanvasLayout): Promise<void> {
  const l = (await q(
    `INSERT INTO app.werkblad_layout (user_id, ruimte, apparaat, modus, canvas_breedte, canvas_hoogte, versie)
     VALUES ($1, $2, $3, $4, $5, $6, 1)
     ON CONFLICT (user_id, ruimte, apparaat) DO UPDATE SET modus = EXCLUDED.modus, canvas_breedte = EXCLUDED.canvas_breedte, canvas_hoogte = EXCLUDED.canvas_hoogte,
       versie = app.werkblad_layout.versie + 1, bijgewerkt_op = now()
     WHERE app.werkblad_layout.user_id = $1 AND app.werkblad_layout.ruimte = $2
     RETURNING id`,
    [lade.userId, lade.ruimte, apparaat, layout.mode, layout.canvasWidth, layout.canvasHeight])).rows[0];
  const blokken = await blokkenVoorSchrijven(q, lade, String(l.id)); // 0116: kolom `blok` overleeft DELETE+INSERT (ook met vlag uit)
  await q(`DELETE FROM app.werkblad_items WHERE layout_id = $1 AND user_id = $2 AND ruimte = $3`, [l.id, lade.userId, lade.ruimte]);
  if (!layout.items.length) { await blokkenNaSchrijven(q, lade, String(l.id), blokken); return; }
  await q(
    `INSERT INTO app.werkblad_items (layout_id, user_id, ruimte, apparaat, instance_id, kind, item_id, x, y, w, h, z, locked, parent, title_override, icon_override, config)
     SELECT $1, $2, $3, $4, r."instanceId", r.kind, r."itemId", r.x, r.y, r.w, r.h, r.z, coalesce(r.locked, false), r.parent, r."titleOverride", r."iconOverride", r.config
     FROM jsonb_to_recordset($5::jsonb) AS r("instanceId" text, kind text, "itemId" text, x int, y int, w int, h int, z int, locked boolean, parent text, "titleOverride" text, "iconOverride" text, config jsonb)`,
    [l.id, lade.userId, lade.ruimte, apparaat, jsonbTekst(layout.items)]);
  await blokkenNaSchrijven(q, lade, String(l.id), blokken);
}

function schoonPersoonlijkLijst(ruw: unknown, lade: Lade, ctx: V3Context): PersoonlijkInvoer[] {
  if (!Array.isArray(ruw)) return [];
  const gezien = new Set<string>();
  const uit: PersoonlijkInvoer[] = [];
  for (const r of ruw) {
    if (uit.length >= MAX_PERSOONLIJK_ITEMS) break;
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const o = r as Record<string, unknown>;
    const inv: PersoonlijkInvoer = {
      id: String(o.id ?? ''),
      basis: String(o.basis ?? ''),
      ...(typeof o.titel === 'string' && o.titel.trim() ? { titel: o.titel } : {}),
      ...(typeof o.icoon === 'string' && o.icoon.trim() ? { icoon: o.icoon } : {}),
    };
    const item = persoonlijkItem(inv);
    if (!item || gezien.has(item.id) || !item.basis) continue;
    if (ctx.itemToegestaan && !ctx.itemToegestaan(item.id, 'shortcut', lade.ruimte as WerkbladRuimte, 'computer', { basis: item.basis, ...(inv.titel ? { titel: item.titel.uk } : {}), ...(inv.icoon ? { icoon: item.icoon } : {}) })) {
      continue;
    }
    gezien.add(item.id);
    uit.push({
      id: item.id,
      basis: item.basis,
      ...(inv.titel ? { titel: item.titel.uk } : {}),
      ...(inv.icoon && item.icoon === inv.icoon ? { icoon: item.icoon } : {}),
    });
  }
  return uit;
}

async function persoonlijkLezen(q: Q, lade: Lade, ctx: V3Context): Promise<PersoonlijkInvoer[]> {
  const reg = (await q("SELECT to_regclass('app.werkblad_usr_items') AS reg")).rows[0]?.reg;
  if (!reg) return [];
  const rijen = (await q(
    `SELECT item_id, basis, titel, icoon
       FROM app.werkblad_usr_items
      WHERE user_id = $1 AND ruimte = $2
      ORDER BY volgorde ASC, item_id ASC
      LIMIT $3`,
    [lade.userId, lade.ruimte, MAX_PERSOONLIJK_ITEMS],
  )).rows.map((r) => ({
    id: String(r.item_id),
    basis: String(r.basis),
    ...(r.titel ? { titel: String(r.titel) } : {}),
    ...(r.icoon ? { icoon: String(r.icoon) } : {}),
  }));
  return schoonPersoonlijkLijst(rijen, lade, ctx);
}

async function standLezen(q: Q, lade: Lade, ctx: V3Context, alleen?: ApparaatKlasse | null): Promise<V3Stand> {
  const k = (await q(`SELECT achtergrond, herkomst, gemigreerd_op, v2_backup IS NOT NULL AS backup FROM app.werkblad_v3_lade WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte])).rows[0];
  const layouts: V3Stand['layouts'] = {};
  if (k) for (const a of alleen ? [alleen] : APPARATEN) { const l = await laagLezen(q, lade, a, ctx); if (l) layouts[a] = { layout: l.layout, versie: l.versie, bijgewerktOp: l.bijgewerktOp }; }
  const persoonlijk = k ? await persoonlijkLezen(q, lade, ctx) : [];
  return {
    ruimte: lade.ruimte as WerkbladRuimte, bestaat: Boolean(k), achtergrond: k ? achtergrondOf(k.achtergrond) : 'nacht',
    herkomst: k ? k.herkomst : '', gemigreerdOp: k ? ms(k.gemigreerd_op) : 0, heeftV2Backup: Boolean(k?.backup), layouts, persoonlijk,
  };
}

/** Eenmalige overzetting (binnen een lopende transactie). true = nu overgezet, false = bestond al. */
export async function overzetten(q: Q, lade: Lade, ctx: V3Context): Promise<boolean> {
  const v2 = (await q(`SELECT indeling, versie FROM app.werkblad_indeling WHERE user_id = $1 AND ruimte = $2 FOR SHARE`, [lade.userId, lade.ruimte])).rows[0];
  const backup: WerkbladIndeling | null = v2 ? normaliseerWerkblad(v2.indeling, { ruimte: ctx.ruimte, eigenaar: ctx.eigenaar }) : null;
  const { v3 } = migreerV2NaarV3(backup ?? { v: 2, items: [], achtergrond: 'nacht' }, ctx);
  const ins = await q(
    `INSERT INTO app.werkblad_v3_lade (user_id, ruimte, achtergrond, herkomst, v2_backup, v2_versie) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (user_id, ruimte) DO NOTHING RETURNING user_id`,
    [lade.userId, lade.ruimte, v3.achtergrond, backup ? 'v2' : 'standaard', backup ? jsonbTekst(backup) : null, v2 ? Number(v2.versie) : null]);
  if (!ins.rowCount) return false;
  for (const a of APPARATEN) { const l = v3.layouts[a]; if (l) await laagSchrijven(q, lade, a, l); }
  return true;
}

export async function v3Laden(lade: Lade, ctx: V3Context, apparaat?: ApparaatKlasse | null): Promise<V3Stand & { netOvergezet: boolean }> {
  return alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    const netOvergezet = await overzetten(q, lade, ctx);
    return { ...(await standLezen(q, lade, ctx, apparaat)), netOvergezet };
  });
}

export type V3BewaarUitkomst = { ok: true; apparaat: ApparaatKlasse; laag: LaagStand; achtergrond: string } | { ok: false; code: 'WERKBLAD_V3_VEROUDERD'; apparaat: ApparaatKlasse; laag: LaagStand | null; achtergrond: string };

/** Eén laag atomair vervangen (pointerup = één bewaring). `versie` = versie die de client laadde (0 = laag bestond nog niet). */
export async function v3Bewaren(lade: Lade, ctx: V3Context, apparaat: ApparaatKlasse, invoer: { layout: unknown; versie: unknown; achtergrond?: unknown }): Promise<V3BewaarUitkomst> {
  const layout = normaliseerLaag(invoer.layout, apparaat, ctx);
  const versieClient = Math.max(0, Math.trunc(Number(invoer.versie) || 0));
  return alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    await overzetten(q, lade, ctx);
    await q(`SELECT 1 FROM app.werkblad_v3_lade WHERE user_id = $1 AND ruimte = $2 FOR UPDATE`, [lade.userId, lade.ruimte]);
    const huidig = await laagLezen(q, lade, apparaat, ctx, true);
    const achtergrondNu = async () => achtergrondOf((await q(`SELECT achtergrond FROM app.werkblad_v3_lade WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte])).rows[0]?.achtergrond);
    if ((huidig ? huidig.versie : 0) !== versieClient) {
      return { ok: false as const, code: 'WERKBLAD_V3_VEROUDERD' as const, apparaat, laag: huidig ? { layout: huidig.layout, versie: huidig.versie, bijgewerktOp: huidig.bijgewerktOp } : null, achtergrond: await achtergrondNu() };
    }
    await laagSchrijven(q, lade, apparaat, layout);
    if (invoer.achtergrond !== undefined) {
      await q(`UPDATE app.werkblad_v3_lade SET achtergrond = $3, versie = versie + 1, bijgewerkt_op = now() WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte, achtergrondOf(invoer.achtergrond)]);
    }
    const na = (await laagLezen(q, lade, apparaat, ctx))!;
    return { ok: true as const, apparaat, laag: { layout: na.layout, versie: na.versie, bijgewerktOp: na.bijgewerktOp }, achtergrond: await achtergrondNu() };
  });
}

/** Persoonlijke snelkoppelingen (usr:*) van deze lade atomair vervangen onder strikte FORCE RLS (gebruiker én ruimte). */
export async function v3PersoonlijkBewaren(lade: Lade, ctx: V3Context, itemsRuw: unknown): Promise<PersoonlijkInvoer[]> {
  const schoon = schoonPersoonlijkLijst(itemsRuw, lade, ctx);
  return alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    await overzetten(q, lade, ctx);
    await q(`SELECT 1 FROM app.werkblad_v3_lade WHERE user_id = $1 AND ruimte = $2 FOR UPDATE`, [lade.userId, lade.ruimte]);
    await q(`DELETE FROM app.werkblad_usr_items WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte]);
    if (schoon.length > 0) {
      const records = schoon.map((p, volgorde) => ({
        item_id: p.id,
        basis: p.basis,
        titel: p.titel ?? null,
        icoon: p.icoon ?? null,
        volgorde,
      }));
      await q(
        `INSERT INTO app.werkblad_usr_items (user_id, ruimte, item_id, basis, titel, icoon, volgorde, bijgewerkt_op)
         SELECT $1, $2, r.item_id, r.basis, r.titel, r.icoon, r.volgorde, now()
           FROM jsonb_to_recordset($3::jsonb) AS r(item_id text, basis text, titel text, icoon text, volgorde int)`,
        [lade.userId, lade.ruimte, jsonbTekst(records)],
      );
    }
    return persoonlijkLezen(q, lade, ctx);
  });
}

/**
 * Terugdraaien: de v2-backup terug in app.werkblad_indeling (versie +1, zodat een open v2-tabblad met een oude versie 409 krijgt).
 * v3Wissen=true wist daarna ook de v3-lade (bij de volgende keer laden met vlag aan wordt opnieuw — eenmalig — overgezet).
 * Standaard blijven de v3-gegevens staan.
 */
export async function v3Terugdraaien(lade: Lade, opties: { v3Wissen?: boolean } = {}): Promise<{ hersteld: boolean; v2Versie: number; v3Gewist: boolean }> {
  return alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    const k = (await q(`SELECT v2_backup FROM app.werkblad_v3_lade WHERE user_id = $1 AND ruimte = $2 FOR UPDATE`, [lade.userId, lade.ruimte])).rows[0];
    let hersteld = false, v2Versie = 0;
    if (k?.v2_backup) {
      const ind = normaliseerWerkblad(k.v2_backup, { ruimte: lade.ruimte as WerkbladRuimte });
      const r = (await q(
        `INSERT INTO app.werkblad_indeling (user_id, ruimte, indeling, herkomst, versie) VALUES ($1, $2, $3::jsonb, 'eigen', 1)
         ON CONFLICT (user_id, ruimte) DO UPDATE SET indeling = EXCLUDED.indeling, versie = app.werkblad_indeling.versie + 1, bijgewerkt_op = now(),
           achtergrond_eigen = CASE WHEN (EXCLUDED.indeling->>'achtergrond') = 'eigen' THEN app.werkblad_indeling.achtergrond_eigen ELSE '' END
         WHERE app.werkblad_indeling.user_id = $1 AND app.werkblad_indeling.ruimte = $2
         RETURNING versie`, [lade.userId, lade.ruimte, jsonbTekst(ind)])).rows[0];
      hersteld = true; v2Versie = Number(r.versie);
    }
    let v3Gewist = false;
    if (opties.v3Wissen) v3Gewist = ((await q(`DELETE FROM app.werkblad_v3_lade WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte])).rowCount || 0) > 0;
    return { hersteld, v2Versie, v3Gewist };
  });
}

// ---------------------------------------------------------------- routes
type User = { id: string; status: string; role?: string; email?: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<{ service: string; user: User } | { errorCode: string }>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
export type V3RouteOpties = {
  /** Server-side vlag 'werkblad-v3' voor deze gebruiker (backend/index.ts: berekenen(u, ['werkblad-v3'])). Fout → uit. */
  vlagAan: (user: User) => Promise<boolean>;
  /** Server-side vlag 'werkblad-snelkoppelingen-v1' voor synchronisatie van eigen snelkoppelingen (0319). */
  snelkoppelingenVlagAan?: (user: User) => Promise<boolean>;
  /** Registerhaken van de bibliotheek (werker B); zonder: de veilige standaard van shared/werkblad-v3.ts. */
  register?: Pick<V3Context, 'itemToegestaan' | 'grenzen' | 'singleton'>;
  /**
   * BIB-002: heeft deze mens technische toegang (een niet-ingetrokken technisch profiel)? Zonder toegang vallen deuren naar technische
   * pagina's van de privélaag. Ontbreekt de functie of faalt ze → GEEN toegang (veilige kant).
   */
  techToegang?: (user: User) => Promise<boolean>;
};
/** BIB-002: registerhaken voor DIT verzoek — op de privélaag zonder technische toegang zonder deuren naar technische pagina's. */
export async function registerVoor<R extends { itemToegestaan?: V3Context['itemToegestaan'] }>(opties: { register?: R; techToegang?: (user: User) => Promise<boolean> }, user: User, ruimte: string): Promise<R | Record<string, never>> {
  const reg = opties.register;
  if (!reg?.itemToegestaan || ruimte !== 'prive') return reg ?? {};
  let toegang = false;
  try { toegang = opties.techToegang ? (await opties.techToegang(user)) === true : false; } catch { toegang = false; }
  return toegang ? reg : { ...reg, itemToegestaan: zonderTechDeuren(reg.itemToegestaan) };
}
const bodyOf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
const isLeegOfApparaat = (v: unknown) => v === undefined || v === null || v === '' || apparaatOf(v) !== null;

export const createWerkbladV3Routes = (authorize: Authorize, opties: V3RouteOpties) => {
  const met = (vlagNodig: boolean, fn: (lade: Lade, ctx: V3Context, body: Record<string, unknown>) => Promise<ReturnType<typeof json>>) => [async (c: Context) => {
    const auth = await authorize(c.event, c.body);
    if ('errorCode' in auth || auth.service !== 'hub' || auth.user.status !== 'approved') return error('OWNER_HUB_WERKBLAD_REQUIRED', 403);
    const lade = await werkbladLade(auth.user.id, c.body);
    let aan = false;
    try { aan = (await opties.vlagAan(auth.user)) === true; } catch { aan = false; }
    if (vlagNodig && !aan) return error('WERKBLAD_V3_UIT', 403);
    let snelkoppelingenAan = true;
    if (opties.snelkoppelingenVlagAan) {
      try { snelkoppelingenAan = (await opties.snelkoppelingenVlagAan(auth.user)) === true; } catch { snelkoppelingenAan = false; }
    }
    const ctx: V3Context = { ruimte: lade.ruimte as WerkbladRuimte, eigenaar: isEigenaar(auth.user), ...(await registerVoor(opties, auth.user, lade.ruimte)) };
    try { return await fn(lade, ctx, { ...bodyOf(c.body), __aan: aan, __snelkoppelingenAan: snelkoppelingenAan }); }
    catch (err) { console.error('[werkblad-v3]', String((err as Error)?.message || err).slice(0, 200)); return error('WERKBLAD_V3_MISLUKT', 500); }
  }];
  return {
    /** Laden. Vlag uit → 200 {aan:false} (de client blijft op v2, er wordt NIETS overgezet). */
    'POST /api/owner/hub/werkblad/v3/laden': met(false, async (lade, ctx, b) => {
      if (!b.__aan) return json({ source: 'server_werkblad_v3_0114', aan: false, vlag: WERKBLAD_V3_FLAG, ruimte: lade.ruimte });
      if (!isLeegOfApparaat(b.apparaat)) return error('WERKBLAD_V3_APPARAAT_ONGELDIG', 400);
      const s = await v3Laden(lade, ctx, apparaatOf(b.apparaat));
      return json({ source: 'server_werkblad_v3_0114', aan: true, ...s, ...(b.__snelkoppelingenAan ? {} : { persoonlijk: [] }) });
    }),
    'POST /api/owner/hub/werkblad/v3/bewaren': met(true, async (lade, ctx, b) => {
      const apparaat = apparaatOf(b.apparaat);
      if (!apparaat) return error('WERKBLAD_V3_APPARAAT_ONGELDIG', 400);
      if (JSON.stringify(b.layout ?? null).length > WERKBLAD_V3_LIMIETEN.maxBytesBody) return error('WERKBLAD_V3_TE_GROOT', 413);
      const ruw = (b.layout && typeof b.layout === 'object' ? (b.layout as Record<string, unknown>).items : null);
      if (Array.isArray(ruw) && ruw.length > WERKBLAD_V3_LIMIETEN.maxItemsPerLaag) return error('WERKBLAD_V3_TE_VEEL_ITEMS', 413);
      if (!b.layout || typeof b.layout !== 'object' || Array.isArray(b.layout)) return error('WERKBLAD_V3_LAYOUT_ONGELDIG', 400);
      const u = await v3Bewaren(lade, ctx, apparaat, { layout: b.layout, versie: b.versie, achtergrond: b.achtergrond });
      if (!u.ok) return json({ ok: false, code: u.code, ruimte: lade.ruimte, apparaat, laag: u.laag, achtergrond: u.achtergrond }, 409);
      return json({ ok: true, source: 'server_werkblad_v3_0114', ruimte: lade.ruimte, apparaat, laag: u.laag, achtergrond: u.achtergrond });
    }),
    /** Eigen snelkoppelingen (usr:*) per lade bewaren en synchroniseren tussen apparaten (0319). */
    'POST /api/owner/hub/werkblad/v3/persoonlijk': met(true, async (lade, ctx, b) => {
      if (!b.__snelkoppelingenAan) return error('VLAG_UIT', 404);
      if (JSON.stringify(b.items ?? null).length > WERKBLAD_V3_LIMIETEN.maxBytesBody) return error('WERKBLAD_V3_TE_GROOT', 413);
      if (!Array.isArray(b.items)) return error('WERKBLAD_V3_ITEMS_ONGELDIG', 400);
      if (b.items.length > MAX_PERSOONLIJK_ITEMS) return error('WERKBLAD_V3_TE_VEEL_ITEMS', 413);
      const persoonlijk = await v3PersoonlijkBewaren(lade, ctx, b.items);
      return json({ ok: true, source: 'server_werkblad_v3_0319', vlag: WERKBLAD_SNELKOPPELINGEN_FLAG, ruimte: lade.ruimte, persoonlijk });
    }),
    /** Terugdraaien naar de v2-backup. Werkt OOK met de vlag uit (dat is juist het moment om terug te willen). */
    'POST /api/owner/hub/werkblad/v3/terugdraaien': met(false, async (lade, _ctx, b) => {
      const u = await v3Terugdraaien(lade, { v3Wissen: b.v3Wissen === true });
      return json({ ok: true, ruimte: lade.ruimte, ...u });
    }),
  };
};
