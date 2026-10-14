// Feature flags (etap F): opslag, berekening per gebruiker, beheer en tests. Zie shared/flags.ts voor het waarom.
// Regels hier, op de server:
//  - berekenen: elke ingelogde, goedgekeurde gebruiker, alleen voor ZICHZELF (user_id uit de sessie, nooit uit de body);
//  - beheren (aanmaken, wijzigen, verwijderen): actief technisch profiel in dit tabblad met diensten.beheren (Адміністратор, Власник);
//  - testen voor zichzelf: actief technisch profiel met flags.test; de test vervalt met het einde van die activering;
//  - lijst bekijken: een van beide rechten.
// Deze module wordt door geen enkele autorisatiemodule geïmporteerd (tests/eenheid/flags.test.ts): een vlag is nooit een recht.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { evalueer, MAX_GEBRUIKERS, SLEUTEL_RE, vlagFout, type Uitkomst, type Vlag } from '../shared/flags';
import { actieveActivatie, isEigenaar, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';

const sys = () => getPool('systeem');
const fout = (code: string, status = 400): never => { throw new TechFout(code, status); };
const audit = (actorId: string, action: string, details: Record<string, unknown>) =>
  auditToevoegen({ ownerId: actorId, actorId, action, type: 'beveiliging', result: 'success', details }).catch(() => undefined);

const vlagUit = (r: any): Vlag => ({
  sleutel: String(r.sleutel), omschrijving: String(r.omschrijving ?? ''), aan: r.aan === true, standaard: r.standaard === true,
  percentage: Number(r.percentage) || 0, gebruikers: Array.isArray(r.gebruikers) ? r.gebruikers.map(String) : [],
});

async function vlaggen(sleutels?: string[]): Promise<Map<string, Vlag>> {
  const rows = sleutels
    ? (await sys().query('SELECT * FROM app.feature_flags WHERE sleutel = ANY($1::text[])', [sleutels])).rows
    : (await sys().query('SELECT * FROM app.feature_flags ORDER BY sleutel')).rows;
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
    magBeheren: beheren, magTesten: testen, testTot: a!.eind,
    vlaggen: [...v.values()].map((x) => ({
      sleutel: x.sleutel, omschrijving: x.omschrijving, aan: x.aan, standaard: x.standaard, percentage: x.percentage,
      // Testers zien alleen het aantal gerichte gebruikers, niet wie (dat is beheer).
      gebruikers: beheren ? x.gebruikers.map((id) => mails.get(id) || id) : [], aantalGebruikers: x.gebruikers.length,
      voorMij: evalueer(x.sleutel, x, u.id, t.get(x.sleutel)?.waarde ?? null),
      mijnTest: t.has(x.sleutel) ? t.get(x.sleutel)!.waarde : null,
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
  await audit(u.id, 'owner.flags.gewijzigd', { sleutel: v.sleutel, nieuw: r?.nieuw === true, aan: v.aan, standaard: v.standaard, percentage: v.percentage, gebruikers: v.gebruikers.length });
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
  if (!mag) fout('TECH_FLAGS_TEST_VEREIST', 403);
  const s = String(sleutel ?? '');
  if (!SLEUTEL_RE.test(s)) fout('SLEUTEL_ONGELDIG');
  if (waarde === null) {
    await sys().query('DELETE FROM app.feature_flag_tests WHERE user_id = $1 AND sleutel = $2', [u.id, s]);
  } else {
    if (typeof waarde !== 'boolean') fout('WAARDE_ONGELDIG');
    const r = await sys().query(`INSERT INTO app.feature_flag_tests (user_id, sleutel, waarde, tot)
        SELECT $1, sleutel, $3, to_timestamp($4 / 1000.0) FROM app.feature_flags WHERE sleutel = $2
        ON CONFLICT (user_id, sleutel) DO UPDATE SET waarde = EXCLUDED.waarde, gezet_op = now(), tot = EXCLUDED.tot`, [u.id, s, waarde, a!.eind]);
    if (!r.rowCount) fout('VLAG_NIET_GEVONDEN', 404);
  }
  await audit(u.id, 'owner.flags.getest', { sleutel: s, waarde, tot: waarde === null ? null : a!.eind });
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
      throw err;
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
    'POST /api/beheer/flags/verwijderen': [gate(async (_ctx, u, b) => json(await verwijderen(u, String(b.tabContext || ''), b.sleutel)))],
    'POST /api/beheer/flags/test': [gate(async (_ctx, u, b) => json(await testen(u, String(b.tabContext || ''), b.sleutel, b.waarde === undefined ? null : b.waarde)))],
  };
}
