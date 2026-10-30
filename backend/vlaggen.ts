// Feature flags (etap F): opslag, berekening per gebruiker, beheer en tests. Zie shared/vlaggen.ts voor het waarom.
// Regels hier, op de server:
//  - berekenen: elke ingelogde, goedgekeurde gebruiker, alleen voor ZICHZELF (user_id uit de sessie, nooit uit de body);
//  - beheren (aanmaken, wijzigen, verwijderen): actief technisch profiel in dit tabblad met diensten.beheren (Адміністратор, Власник);
//  - testen voor zichzelf: actief technisch profiel met flags.test; de test vervalt met het einde van die activering;
//  - lijst bekijken: een van beide rechten.
// Deze module wordt door geen enkele autorisatiemodule geïmporteerd (tests/eenheid/vlaggen.test.ts): een vlag is nooit een recht.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { evalueer, MAX_GEBRUIKERS, SLEUTEL_RE, vlagFout, type Uitkomst, type Vlag } from '../shared/vlaggen';
import { actieveActivatie, isEigenaar, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';

const sys = () => getPool('systeem');
const fout = (code: string, status = 400): never => { throw new TechFout(code, status); };
const audit = (actorId: string, action: string, details: Record<string, unknown>) =>
  auditToevoegen({ ownerId: actorId, actorId, action, type: 'beveiliging', result: 'success', details }).catch(() => undefined);

const vlagUit = (r: any): Vlag => ({
  sleutel: String(r.sleutel), omschrijving: String(r.omschrijving ?? ''), aan: r.aan === true, standaard: r.standaard === true,
  percentage: Number(r.percentage) || 0, gebruikers: Array.isArray(r.gebruikers) ? r.gebruikers.map(String) : [],
});
/** Alleen weergave (migratie 0124): evalueer leest dit nooit. */
const gearchiveerd = new Map<string, boolean>();
/** «Voor iedereen aan»: hoofdschakelaar aan en (100 % of standaard aan zonder procent-uitrol). Zelfde regel als evalueer. */
export const voorIedereen = (v: Vlag) => v.aan && (v.percentage >= 100 || (v.percentage === 0 && v.standaard));

async function vlaggen(sleutels?: string[]): Promise<Map<string, Vlag>> {
  const rows = sleutels
    ? (await sys().query('SELECT * FROM app.feature_flags WHERE sleutel = ANY($1::text[])', [sleutels])).rows
    : (await sys().query('SELECT * FROM app.feature_flags ORDER BY sleutel')).rows;
  for (const r of rows) gearchiveerd.set(String(r.sleutel), !!r.gearchiveerd_op);
  return new Map(rows.map((r) => [String(r.sleutel), vlagUit(r)]));
}

async function eigenTests(userId: string): Promise<Map<string, { waarde: boolean; tot: number }>> {
  const rows = (await sys().query('SELECT sleutel, waarde, tot FROM app.feature_flag_tests WHERE user_id = $1 AND tot > now()', [userId])).rows;
  return new Map(rows.map((r) => [String(r.sleutel), { waarde: r.waarde === true, tot: new Date(r.tot).getTime() }]));
}

/** Waarden voor de gebruiker zelf. Zonder sleutels: alle vlaggen. Met sleutels: precies die (onbekend = FLAG_NOT_FOUND, false). */
export async function berekenen(u: Gebruiker, sleutels?: unknown): Promise<Uitkomst[]> {
  let lijst: string[] | undefined;
  if (sleutels !== undefined) {
    if (!Array.isArray(sleutels) || sleutels.length > 100 || !sleutels.every((s) => typeof s === 'string' && SLEUTEL_RE.test(s))) fout('SLEUTEL_ONGELDIG');
    lijst = [...new Set(sleutels as string[])];
  }
  const [v, t] = await Promise.all([vlaggen(lijst), eigenTests(u.id)]);
  return (lijst ?? [...v.keys()]).map((k) => evalueer(k, v.get(k), u.id, t.get(k)?.waarde ?? null));
}

async function rechten(u: Gebruiker, tab: string) {
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  const a = await actieveActivatie(u.id, tab);
  const beheren = !!a?.mogelijkheden.includes('diensten.beheren');
  const testen = !!a?.mogelijkheden.includes('flags.test');
  return { a, beheren, testen };
}

/** Een test mag hoogstens 8 uur lopen (CHECK in migratie 0038). Profielen «tot uitloggen» / «tot verlaten» hebben een technisch
 *  einde over 366 dagen; zonder deze grens gaf «Тест: так» een databasefout (500). Iets korter dan 8 uur voor klokruimte. */
export const TEST_MAX_MS = 8 * 3600_000 - 60_000;
export const testEinde = (eind: number, nu = Date.now()) => Math.min(eind, nu + TEST_MAX_MS);

async function emailsVan(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = (await sys().query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND id = ANY($1::text[])`, [ids])).rows;
  return new Map(rows.map((r) => [String(r.id), String(r.email || '')]));
}

/** Lijst voor het venster «Прапорці»: alleen in een actief technisch profiel met diensten.beheren of flags.test. */
export async function beheerLijst(u: Gebruiker, tab: string) {
  const { a, beheren, testen } = await rechten(u, tab);
  if (!beheren && !testen) fout('TECH_FLAGS_VEREIST', 403);
  const [v, t] = await Promise.all([vlaggen(), eigenTests(u.id)]);
  const mails = beheren ? await emailsVan([...new Set([...v.values()].flatMap((x) => x.gebruikers))]) : new Map<string, string>();
  return {
    magBeheren: beheren, magTesten: testen, testTot: testEinde(a!.eind),
    rollen: a!.rollen, eigenaar: isEigenaar(u),
    vlaggen: [...v.values()].map((x) => ({
      sleutel: x.sleutel, omschrijving: x.omschrijving, aan: x.aan, standaard: x.standaard, percentage: x.percentage,
      // Testers zien alleen het aantal gerichte gebruikers, niet wie (dat is beheer).
      gebruikers: beheren ? x.gebruikers.map((id) => mails.get(id) || id) : [], aantalGebruikers: x.gebruikers.length,
      voorMij: evalueer(x.sleutel, x, u.id, t.get(x.sleutel)?.waarde ?? null),
      mijnTest: t.has(x.sleutel) ? t.get(x.sleutel)!.waarde : null,
      mijnTestTot: t.get(x.sleutel)?.tot ?? null,
      ikInLijst: x.gebruikers.includes(u.id), alleenIk: x.gebruikers.length === 1 && x.gebruikers[0] === u.id,
      voorIedereen: voorIedereen(x), gearchiveerd: gearchiveerd.get(x.sleutel) === true,
    })),
  };
}

async function idsVanEmails(emails: unknown): Promise<string[]> {
  if (!Array.isArray(emails) || emails.length > MAX_GEBRUIKERS) fout('GEBRUIKERS_ONGELDIG');
  const schoon = [...new Set((emails as unknown[]).map((e) => String(e ?? '').trim().toLowerCase()).filter(Boolean))];
  if (schoon.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200)) fout('EMAIL_ONGELDIG');
  if (!schoon.length) return [];
  const rows = (await sys().query(`SELECT id, lower(data->>'email') AS email FROM app.records WHERE tbl = 'users' AND lower(data->>'email') = ANY($1::text[])
      AND COALESCE((data->>'deletedAt')::numeric, 0) = 0`, [schoon])).rows;
  const per = new Map<string, string[]>();
  for (const r of rows) per.set(String(r.email), [...(per.get(String(r.email)) ?? []), String(r.id)]);
  const onbekend = schoon.filter((e) => (per.get(e)?.length ?? 0) !== 1);
  if (onbekend.length) throw new TechFout(`GEBRUIKER_NIET_GEVONDEN:${onbekend[0]}`, 404);
  return schoon.map((e) => per.get(e)![0]);
}

/** Aanmaken of wijzigen (diensten.beheren). Gebruikers komen als e-mail binnen en worden id's. */
export async function zetten(u: Gebruiker, tab: string, input: Record<string, unknown>) {
  const { beheren } = await rechten(u, tab);
  if (!beheren) fout('TECH_FLAGS_BEHEER_VEREIST', 403);
  const gebruikers = await idsVanEmails(input.gebruikers ?? []);
  const v: Vlag = {
    sleutel: String(input.sleutel ?? ''), omschrijving: String(input.omschrijving ?? '').trim(),
    aan: input.aan === true, standaard: input.standaard === true, percentage: Number(input.percentage ?? 0), gebruikers,
  };
  const f = vlagFout(v);
  if (f) fout(f);
  const r = (await sys().query(`INSERT INTO app.feature_flags (sleutel, omschrijving, aan, standaard, percentage, gebruikers, gewijzigd_door)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (sleutel) DO UPDATE SET omschrijving = EXCLUDED.omschrijving, aan = EXCLUDED.aan, standaard = EXCLUDED.standaard,
        percentage = EXCLUDED.percentage, gebruikers = EXCLUDED.gebruikers, gewijzigd_door = EXCLUDED.gewijzigd_door, gewijzigd_op = now()
      RETURNING (xmax = 0) AS nieuw`, [v.sleutel, v.omschrijving, v.aan, v.standaard, v.percentage, v.gebruikers, u.id])).rows[0];
  if (!voorIedereen(v)) await sys().query('UPDATE app.feature_flags SET gearchiveerd_op = NULL WHERE sleutel = $1', [v.sleutel]);
  await audit(u.id, 'owner.flags.gewijzigd', { sleutel: v.sleutel, nieuw: r?.nieuw === true, aan: v.aan, standaard: v.standaard, percentage: v.percentage, gebruikers: v.gebruikers.length });
  return beheerLijst(u, tab);
}

/**
 * Eén stand in gewone woorden (venster «Перемикачі функцій», 20261028). Vertaalt naar dezelfde velden als «zetten»:
 *  uit   → hoofdschakelaar uit (lijst en procent blijven bewaard, zodat «terug aan» niets kwijt is);
 *  mij   → aan, alleen de beheerder zelf in de lijst, geen procent, standaard uit;
 *  lijst → aan, precies deze e-mails, geen procent, standaard uit;
 *  deel  → aan, procent 1–99, standaard uit (lijst blijft: die mensen houden het);
 *  alle  → aan, procent 0, standaard aan (lijst blijft).
 * Niet meer «voor iedereen» → uit het archief. Geen nieuwe berekening: evalueer blijft de enige regel.
 */
export const STANDEN = ['uit', 'mij', 'lijst', 'deel', 'alle'] as const;
export type Stand = typeof STANDEN[number];
export async function standZetten(u: Gebruiker, tab: string, input: Record<string, unknown>) {
  const { beheren } = await rechten(u, tab);
  if (!beheren) fout('TECH_FLAGS_BEHEER_VEREIST', 403);
  const s = String(input.sleutel ?? '');
  if (!SLEUTEL_RE.test(s)) fout('SLEUTEL_ONGELDIG');
  const stand = String(input.stand ?? '') as Stand;
  if (!STANDEN.includes(stand)) fout('STAND_ONGELDIG');
  const oud = (await vlaggen([s])).get(s);
  if (!oud) fout('VLAG_NIET_GEVONDEN', 404);
  const v: Vlag = { ...oud! };
  if (stand === 'uit') v.aan = false;
  else if (stand === 'mij') Object.assign(v, { aan: true, gebruikers: [u.id], percentage: 0, standaard: false });
  else if (stand === 'lijst') {
    const ids = await idsVanEmails(input.gebruikers ?? []);
    if (!ids.length) fout('LIJST_LEEG');
    Object.assign(v, { aan: true, gebruikers: ids, percentage: 0, standaard: false });
  } else if (stand === 'deel') {
    const p = Number(input.percentage);
    if (!Number.isInteger(p) || p < 1 || p > 99) fout('PERCENTAGE_ONGELDIG');
    Object.assign(v, { aan: true, percentage: p, standaard: false });
  } else Object.assign(v, { aan: true, percentage: 0, standaard: true });
  const f = vlagFout(v);
  if (f) fout(f);
  await sys().query(`UPDATE app.feature_flags SET aan = $2, standaard = $3, percentage = $4, gebruikers = $5, gewijzigd_door = $6, gewijzigd_op = now(),
      gearchiveerd_op = CASE WHEN $7 THEN gearchiveerd_op ELSE NULL END WHERE sleutel = $1`,
    [s, v.aan, v.standaard, v.percentage, v.gebruikers, u.id, voorIedereen(v)]);
  await audit(u.id, 'owner.flags.stand', { sleutel: s, stand, percentage: v.percentage, gebruikers: v.gebruikers.length });
  return beheerLijst(u, tab);
}

/** Archief: alleen weergave. In het archief zetten mag alleen als de functie voor iedereen aan staat (anders verdwijnt iets halfs uit beeld). */
export async function archiveren(u: Gebruiker, tab: string, sleutel: unknown, inArchief: unknown) {
  const { beheren } = await rechten(u, tab);
  if (!beheren) fout('TECH_FLAGS_BEHEER_VEREIST', 403);
  const s = String(sleutel ?? '');
  if (!SLEUTEL_RE.test(s)) fout('SLEUTEL_ONGELDIG');
  if (typeof inArchief !== 'boolean') fout('WAARDE_ONGELDIG');
  const v = (await vlaggen([s])).get(s);
  if (!v) fout('VLAG_NIET_GEVONDEN', 404);
  if (inArchief && !voorIedereen(v!)) fout('ARCHIEF_ALLEEN_VOOR_IEDEREEN');
  await sys().query(`UPDATE app.feature_flags SET gearchiveerd_op = ${inArchief ? 'now()' : 'NULL'}, gewijzigd_door = $2, gewijzigd_op = now() WHERE sleutel = $1`, [s, u.id]);
  await audit(u.id, 'owner.flags.archief', { sleutel: s, inArchief });
  return beheerLijst(u, tab);
}

export async function verwijderen(u: Gebruiker, tab: string, sleutel: unknown) {
  const { beheren } = await rechten(u, tab);
  if (!beheren) fout('TECH_FLAGS_BEHEER_VEREIST', 403);
  const s = String(sleutel ?? '');
  if (!SLEUTEL_RE.test(s)) fout('SLEUTEL_ONGELDIG');
  const n = (await sys().query('DELETE FROM app.feature_flags WHERE sleutel = $1', [s])).rowCount ?? 0;
  if (!n) fout('VLAG_NIET_GEVONDEN', 404);
  await audit(u.id, 'owner.flags.verwijderd', { sleutel: s });
  return beheerLijst(u, tab);
}

/** Test voor zichzelf (flags.test): waarde true/false tot het einde van de activering; null = test weg. */
export async function testen(u: Gebruiker, tab: string, sleutel: unknown, waarde: unknown) {
  const { a, testen: mag } = await rechten(u, tab);
  // Geen lopend technisch profiel in dit tabblad (verlopen, gepauzeerd, verlaten): dat is iets anders dan «rol mist het recht».
  if (!a) fout('TECH_PROFIEL_NIET_ACTIEF', 403);
  if (!mag) fout('TECH_FLAGS_TEST_VEREIST', 403);
  const s = String(sleutel ?? '');
  if (!SLEUTEL_RE.test(s)) fout('SLEUTEL_ONGELDIG');
  if (waarde === null) {
    await sys().query('DELETE FROM app.feature_flag_tests WHERE user_id = $1 AND sleutel = $2', [u.id, s]);
  } else {
    if (typeof waarde !== 'boolean') fout('WAARDE_ONGELDIG');
    const r = await sys().query(`INSERT INTO app.feature_flag_tests (user_id, sleutel, waarde, tot)
        SELECT $1, sleutel, $3, to_timestamp($4 / 1000.0) FROM app.feature_flags WHERE sleutel = $2
        ON CONFLICT (user_id, sleutel) DO UPDATE SET waarde = EXCLUDED.waarde, gezet_op = now(), tot = EXCLUDED.tot`, [u.id, s, waarde, testEinde(a!.eind)]);
    if (!r.rowCount) fout('VLAG_NIET_GEVONDEN', 404);
  }
  await audit(u.id, 'owner.flags.getest', { sleutel: s, waarde, tot: waarde === null ? null : testEinde(a!.eind) });
  return beheerLijst(u, tab);
}

// ---------------------------------------------------------------- routes
type SessionOk = { user: Gebruiker; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown; params?: Record<string, string> };
const bodyOf = (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {});

export function flagsRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  const gate = (run: (ctx: Ctx, u: Gebruiker, b: Record<string, unknown>) => Promise<ReturnType<typeof json>>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    try { return await run(ctx, auth.user, bodyOf(ctx.body)); }
    catch (err) {
      if (err instanceof TechFout) return error(err.code, err.status);
      // Geen kale «Internal server error» meer: een vaste code die het venster in gewone woorden uitlegt; details alleen in het serverlog.
      console.error('[vlaggen] onverwachte fout', err);
      return error('VLAG_SERVERFOUT', 500);
    }
  }) as RouterMiddleware;
  // OpenFeature Remote Evaluation Protocol (OFREP): antwoordvorm van de spec; een OFREP-provider met baseUrl https://<host>/api werkt.
  const ofrep = (x: Uitkomst) => ({ key: x.key, value: x.value, reason: x.reason, variant: x.variant, ...(x.errorCode ? { errorCode: x.errorCode, errorDetails: 'flag not found' } : {}), metadata: x.metadata ?? {} });
  return {
    'POST /api/flags': [gate(async (_ctx, u, b) => json({ vlaggen: await berekenen(u, b.sleutels) }))],
    'POST /api/ofrep/v1/evaluate/flags': [gate(async (_ctx, u) => json({ flags: (await berekenen(u)).map(ofrep) }))],
    'POST /api/ofrep/v1/evaluate/flags/:key': [gate(async (ctx, u) => {
      const key = String(ctx.params?.key ?? '');
      if (!SLEUTEL_RE.test(key)) return json({ key, errorCode: 'INVALID_CONTEXT', errorDetails: 'invalid flag key' }, 400);
      const [x] = await berekenen(u, [key]);
      return x.errorCode ? json(ofrep(x), 404) : json(ofrep(x));
    })],
    'POST /api/beheer/flags': [gate(async (_ctx, u, b) => json(await beheerLijst(u, String(b.tabContext || ''))))],
    'POST /api/beheer/flags/zetten': [gate(async (_ctx, u, b) => json(await zetten(u, String(b.tabContext || ''), bodyOf(b.vlag))))],
    'POST /api/beheer/flags/stand': [gate(async (_ctx, u, b) => json(await standZetten(u, String(b.tabContext || ''), b)))],
    'POST /api/beheer/flags/archief': [gate(async (_ctx, u, b) => json(await archiveren(u, String(b.tabContext || ''), b.sleutel, b.inArchief)))],
    'POST /api/beheer/flags/verwijderen': [gate(async (_ctx, u, b) => json(await verwijderen(u, String(b.tabContext || ''), b.sleutel)))],
    'POST /api/beheer/flags/test': [gate(async (_ctx, u, b) => json(await testen(u, String(b.tabContext || ''), b.sleutel, b.waarde === undefined ? null : b.waarde)))],
  };
}
