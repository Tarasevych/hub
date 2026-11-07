// «Подивитися як користувач» (impersonatie) — alleen met uitdrukkelijke toestemming van de gebruiker. Zie migrations/0068_impersonatie.sql.
//
// Verloop:
//   1. Een beheerder (technisch profiel met 'impersonatie.aanvragen': rol «ondersteuning» of de eigenaar), in een LOPENDE activering,
//      vraagt met reden en duur (5–60 min, standaard 15) en met een verse bevestiging van zijn eigen aanmelding.
//   2. De gebruiker krijgt een melding met wie, waarom, hoe lang en wat zichtbaar is, en beslist zelf. «Дозволити» vraagt een verse
//      STERKE bevestiging (passkey, TOTP of herstelcode — Google alleen telt niet), die daarna verbruikt is. Optioneel «з правом дій».
//   3. De beheerder krijgt GEEN cookie of token van de gebruiker. Zijn eigen tabblad stuurt elke aanroep via POST /api/impersonatie/aanroep;
//      hier wordt per aanroep de rij gecontroleerd (actief, niet verlopen, dezelfde beheerder, HETZELFDE tabblad, technisch profiel loopt
//      nog), daarna routeOordeel (shared/impersonatie.ts) en pas dan de route in-process uitgevoerd als de gebruiker (site-dispatch).
//   4. Einde: tijd om, de gebruiker («Завершити негайно»), de beheerder, uitloggen of einde van het technisch profiel van de beheerder
//      (lui gecontroleerd bij elke aanroep), intrekking van zijn profiel. Daarna is het journaal van wat hij deed voor beiden te zien.
// AI-agenten kunnen niets van dit alles: /api/impersonatie/* staat in AGENT_VERBODEN (backend/agent-namens.ts), dus callSite en
// ownerRequireSession weigeren het voor elke gedelegeerde aanroep; een impersonatie-aanroep zelf kan ook nooit /api/impersonatie raken.
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { actieveActivatie, isEigenaar, tabHash, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';
import { sterkeStapOpGeldig, stapOpMethode, stapOpVerbruiken, type StapOpAuth } from './stap-op';
import { IMPERSONATIE_ANTWOORD_MIN, IMPERSONATIE_MAX, IMPERSONATIE_MIN, IMPERSONATIE_STANDAARD, IMPERSONATIE_ZICHTBAAR, isImpersonatieDienst, isLeesRoute, routeOordeel } from '../shared/impersonatie';

const sys = () => getPool('systeem');
const fout = (code: string, status = 400): never => { throw new TechFout(code, status); };
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type Melder = (userId: string, email: string, kind: string, titel: string, tekst: string) => Promise<void>;
export type Aanroeper = (doelId: string, service: string, route: string, body: Record<string, unknown>, imp: { id: string; beheerderId: string; beheerderEmail?: string; metActies: boolean }) => Promise<{ status: number; data: any; geblokkeerd: boolean }>;

let aanroeper: Aanroeper = async (...a) => (await import('./site-aanroep')).roepAlsImpersonatie(...a);
/** Alleen voor tests: een nagebootste site (de echte gebruikt site-dispatch). */
export const zetImpersonatieAanroeper = (fn: Aanroeper | null) => { aanroeper = fn ?? (async (...a) => (await import('./site-aanroep')).roepAlsImpersonatie(...a)); };

/** Eén journaalregel in de keten van de gebruiker (owner_id = doel), altijd met de beheerder als actor en actorType 'impersonatie'. */
const journaal = (doelId: string, actorId: string, action: string, sessie: string, details: Record<string, unknown>, result = 'success') =>
  auditToevoegen({ ownerId: doelId, actorId, action, type: 'beveiliging', result, details: { ...details, sessie, ...(actorId !== doelId ? { actorType: 'impersonatie', namensId: doelId } : {}), _ctx: { namens: sessie } } }).catch(() => undefined);
const eigenJournaal = (beheerderId: string, action: string, sessie: string, details: Record<string, unknown>) =>
  auditToevoegen({ ownerId: beheerderId, actorId: beheerderId, action, type: 'beveiliging', result: 'success', details: { ...details, sessie } }).catch(() => undefined);

async function vereisTech(u: Gebruiker, tab: string) {
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  const a = await actieveActivatie(u.id, tab);
  if (!a || !a.mogelijkheden.includes('impersonatie.aanvragen')) fout('TECH_IMPERSONATIE_VEREIST', 403);
  return a!;
}

async function gebruikerOpEmail(email: string) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) fout('EMAIL_ONGELDIG');
  const r = (await sys().query(`SELECT id, data->>'email' AS email, COALESCE(data->>'name', '') AS naam, data->>'role' AS role, data->>'status' AS status FROM app.records
     WHERE tbl = 'users' AND lower(data->>'email') = $1 AND COALESCE((data->>'deletedAt')::numeric, 0) = 0 LIMIT 2`, [e])).rows;
  if (r.length !== 1) fout('GEBRUIKER_NIET_GEVONDEN', 404);
  return { id: String(r[0].id), email: String(r[0].email), naam: String(r[0].naam || ''), role: r[0].role, status: r[0].status } as Gebruiker & { email: string; naam: string };
}

/**
 * Lui opruimen bij elke aanroep: geen antwoord binnen 15 min → verlopen; tijd om → verlopen; technisch profiel van de beheerder in DIT
 * tabblad beëindigd (uitloggen, zelf, intrekking, verlopen) → beëindigd. Elk einde één keer in beide journaals.
 */
export async function opruimen(): Promise<void> {
  const rijen = [
    ...(await sys().query(`UPDATE app.impersonatie_sessies SET status = 'verlopen', beeindigd_op = now(), beeindigd_reden = 'geen-antwoord'
        WHERE status = 'wacht' AND aangevraagd_op < now() - make_interval(mins => $1) RETURNING *`, [IMPERSONATIE_ANTWOORD_MIN])).rows,
    ...(await sys().query(`UPDATE app.impersonatie_sessies SET status = 'verlopen', beeindigd_op = eind_op, beeindigd_reden = 'tijd'
        WHERE status = 'actief' AND eind_op <= now() RETURNING *`)).rows,
    ...(await sys().query(`UPDATE app.impersonatie_sessies s SET status = 'beeindigd', beeindigd_op = now(), beeindigd_door = s.beheerder_id, beeindigd_reden = 'tech-beeindigd',
          eind_op = CASE WHEN s.status = 'actief' THEN LEAST(s.eind_op, now()) ELSE s.eind_op END
        WHERE s.status IN ('wacht', 'actief') AND NOT EXISTS (SELECT 1 FROM app.tech_activaties a
          WHERE a.user_id = s.beheerder_id AND a.tab_hash = s.beheerder_tab AND a.beeindigd_op IS NULL AND a.eind_op > now()) RETURNING *`)).rows,
  ];
  for (const r of rijen) {
    await journaal(r.doel_id, r.beheerder_id, 'owner.impersonatie.beeindigd', String(r.id), { reden: r.beeindigd_reden, acties: Number(r.acties), geweigerd: Number(r.geweigerd) });
    await eigenJournaal(r.beheerder_id, 'owner.impersonatie.beeindigd', String(r.id), { reden: r.beeindigd_reden });
  }
}

const ms = (v: unknown): number | null => (v ? new Date(v as string).getTime() : null);
const uit = (r: any) => ({
  id: String(r.id), reden: String(r.reden), minuten: Number(r.minuten), metActies: !!r.met_acties, status: String(r.status),
  aangevraagd: ms(r.aangevraagd_op), besloten: ms(r.besloten_op), eind: ms(r.eind_op), beeindigd: ms(r.beeindigd_op),
  beeindigdDoor: r.beeindigd_door ? (r.beeindigd_door === r.doel_id ? 'gebruiker' : 'beheerder') : null, beeindigdReden: String(r.beeindigd_reden || ''),
  acties: Number(r.acties || 0), geweigerd: Number(r.geweigerd || 0), laatstActief: ms(r.laatst_actief),
  ...(r.beheerder_email !== undefined ? { beheerder: String(r.beheerder_email || ''), beheerderNaam: String(r.beheerder_naam || '') } : {}),
  ...(r.doel_email !== undefined ? { doel: String(r.doel_email || ''), doelNaam: String(r.doel_naam || '') } : {}),
});
const MET_NAMEN = `SELECT s.*, COALESCE(b.data->>'email', '') AS beheerder_email, COALESCE(b.data->>'name', '') AS beheerder_naam,
    COALESCE(d.data->>'email', '') AS doel_email, COALESCE(d.data->>'name', '') AS doel_naam
  FROM app.impersonatie_sessies s LEFT JOIN app.records b ON b.tbl = 'users' AND b.id = s.beheerder_id LEFT JOIN app.records d ON d.tbl = 'users' AND d.id = s.doel_id`;

const tijd = (msv: number) => new Date(msv).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });

/** 1. Beheerder vraagt. */
export async function aanvragen(u: Gebruiker, tab: string, input: { email: unknown; reden: unknown; minuten?: unknown }, meld: Melder) {
  const a = await vereisTech(u, tab);
  await opruimen();
  const doel = await gebruikerOpEmail(String(input.email ?? ''));
  if (doel.id === u.id) fout('NIET_AAN_JEZELF', 403);
  if (isEigenaar(doel)) fout('EIGENAAR_ONAANTASTBAAR', 403);
  if (doel.status !== 'approved') fout('GEBRUIKER_NIET_GOEDGEKEURD', 409);
  const reden = String(input.reden ?? '').trim().replace(/\s+/g, ' ');
  if (reden.length < 3 || reden.length > 300) fout('REDEN_ONGELDIG');
  const minuten = input.minuten === undefined || input.minuten === null || input.minuten === '' ? IMPERSONATIE_STANDAARD : Math.round(Number(input.minuten));
  if (!Number.isFinite(minuten) || minuten < IMPERSONATIE_MIN || minuten > IMPERSONATIE_MAX) fout('DUUR_ONGELDIG');
  // Eén open verzoek per paar: een nieuw verzoek vervangt een wachtend of lopend.
  const oud = (await sys().query(`UPDATE app.impersonatie_sessies SET status = 'ingetrokken', beeindigd_op = now(), beeindigd_door = $1, beeindigd_reden = 'vervangen'
     WHERE beheerder_id = $1 AND doel_id = $2 AND status IN ('wacht', 'actief') RETURNING id`, [u.id, doel.id])).rows;
  for (const r of oud) await journaal(doel.id, u.id, 'owner.impersonatie.beeindigd', String(r.id), { reden: 'vervangen' });
  const r = (await sys().query(`INSERT INTO app.impersonatie_sessies (beheerder_id, doel_id, beheerder_tab, reden, minuten) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [u.id, doel.id, tabHash(tab), reden, minuten])).rows[0];
  const wie = u.email || 'адміністратор';
  await journaal(doel.id, u.id, 'owner.impersonatie.gevraagd', String(r.id), { door: wie, minuten, reden, viaActivatie: a.id });
  await eigenJournaal(u.id, 'owner.impersonatie.gevraagd', String(r.id), { aan: doel.email, minuten, reden });
  const z = IMPERSONATIE_ZICHTBAAR.uk;
  await meld(doel.id, doel.email, 'impersonatie', 'Адміністратор просить подивитися ваш акаунт вашими очима',
    `${wie} просить ${minuten} хв, щоб побачити сайт так, як бачите його ви. Причина: ${reden}. Буде видно: ${z.ziet}. Ніколи: ${z.nooit}. `
    + `Типово лише перегляд. «Дозволити» або «Відхилити» — у вікні на сайті (діє ${IMPERSONATIE_ANTWOORD_MIN} хв, дозвіл — з passkey або кодом).`).catch(() => undefined);
  return { ...uit(r), doel: doel.email, doelNaam: doel.naam };
}

/** Voor de gebruiker: wachtende en lopende verzoeken + recent afgelopen (24 u) met een samenvatting. */
export async function voorMij(u: Gebruiker) {
  await opruimen();
  const open = (await sys().query(`${MET_NAMEN} WHERE s.doel_id = $1 AND s.status IN ('wacht', 'actief') ORDER BY s.aangevraagd_op DESC LIMIT 10`, [u.id])).rows.map(uit);
  const recent = (await sys().query(`${MET_NAMEN} WHERE s.doel_id = $1 AND s.status NOT IN ('wacht', 'actief') AND COALESCE(s.beeindigd_op, s.besloten_op, s.aangevraagd_op) > now() - interval '24 hours'
     ORDER BY s.aangevraagd_op DESC LIMIT 10`, [u.id])).rows.map(uit);
  return { open, recent };
}

/** 2a. De gebruiker staat toe — alleen met een verse STERKE bevestiging van DEZE sessie, die daarna verbruikt is. */
export async function toestaan(auth: StapOpAuth & { user: Gebruiker }, id: string, metActies: boolean, meld: Melder) {
  const u = auth.user;
  if (!ID_RE.test(id)) fout('ID_ONGELDIG');
  await opruimen();
  const v = (await sys().query(`SELECT * FROM app.impersonatie_sessies WHERE id = $1 AND doel_id = $2`, [id, u.id])).rows[0];
  if (!v || v.status !== 'wacht') fout('VERZOEK_NIET_OPEN', 404);
  if (!(await sterkeStapOpGeldig(auth))) fout('STEP_UP_STRONG_REQUIRED', 403);
  const methode = (await stapOpMethode(auth)) || 'sterk';
  const r = (await sys().query(`UPDATE app.impersonatie_sessies SET status = 'actief', besloten_op = now(), eind_op = now() + make_interval(mins => minuten), met_acties = $3, stap_op_methode = $4
     WHERE id = $1 AND doel_id = $2 AND status = 'wacht' RETURNING *`, [id, u.id, metActies === true, methode])).rows[0];
  if (!r) fout('VERZOEK_NIET_OPEN', 404);
  await stapOpVerbruiken(auth);
  await journaal(u.id, u.id, 'owner.impersonatie.toegestaan', id, { metActies: !!r.met_acties, minuten: r.minuten, stapOp: methode, aan: r.beheerder_id });
  await eigenJournaal(r.beheerder_id, 'owner.impersonatie.toegestaan', id, { door: u.email || u.id, metActies: !!r.met_acties });
  await meld(r.beheerder_id, '', 'impersonatie.beheerder', 'Користувач дозволив перегляд', `${u.email || 'Користувач'} дозволив(ла) ${r.minuten} хв ${r.met_acties ? 'з правом дій' : 'лише перегляду'} до ${tijd(ms(r.eind_op)!)}.`).catch(() => undefined);
  return uit(r);
}

/** 2b. De gebruiker weigert. */
export async function weigeren(u: Gebruiker, id: string, meld: Melder) {
  if (!ID_RE.test(id)) fout('ID_ONGELDIG');
  await opruimen();
  const r = (await sys().query(`UPDATE app.impersonatie_sessies SET status = 'geweigerd', besloten_op = now(), beeindigd_op = now(), beeindigd_door = $2, beeindigd_reden = 'geweigerd'
     WHERE id = $1 AND doel_id = $2 AND status = 'wacht' RETURNING *`, [id, u.id])).rows[0];
  if (!r) fout('VERZOEK_NIET_OPEN', 404);
  await journaal(u.id, u.id, 'owner.impersonatie.geweigerd', id, { aan: r.beheerder_id });
  await eigenJournaal(r.beheerder_id, 'owner.impersonatie.geweigerd', id, { door: u.email || u.id });
  await meld(r.beheerder_id, '', 'impersonatie.beheerder', 'Користувач відхилив перегляд', `${u.email || 'Користувач'} відхилив(ла) ваш запит.`).catch(() => undefined);
  return uit(r);
}

/** 4. Beëindigen: door de gebruiker (doel) of door de beheerder, op elk moment, ook een wachtend verzoek (intrekken). */
export async function beeindigen(u: Gebruiker, id: string, meld?: Melder) {
  if (!ID_RE.test(id)) fout('ID_ONGELDIG');
  const r = (await sys().query(`UPDATE app.impersonatie_sessies SET status = CASE WHEN status = 'wacht' THEN 'ingetrokken' ELSE 'beeindigd' END, beeindigd_op = now(), beeindigd_door = $2,
       beeindigd_reden = CASE WHEN doel_id = $2 THEN 'gebruiker' ELSE 'beheerder' END, eind_op = CASE WHEN status = 'actief' THEN LEAST(eind_op, now()) ELSE eind_op END
     WHERE id = $1 AND (doel_id = $2 OR beheerder_id = $2) AND status IN ('wacht', 'actief') RETURNING *`, [id, u.id])).rows[0];
  if (!r) fout('VERZOEK_NIET_OPEN', 404);
  await journaal(r.doel_id, u.id === r.doel_id ? u.id : r.beheerder_id, 'owner.impersonatie.beeindigd', id, { reden: r.beeindigd_reden, acties: Number(r.acties), geweigerd: Number(r.geweigerd) });
  await eigenJournaal(r.beheerder_id, 'owner.impersonatie.beeindigd', id, { reden: r.beeindigd_reden });
  if (meld && u.id === r.doel_id) await meld(r.beheerder_id, '', 'impersonatie.beheerder', 'Перегляд завершено користувачем', `${u.email || 'Користувач'} завершив(ла) доступ.`).catch(() => undefined);
  return uit(r);
}

/** Voor de beheerder: eigen verzoeken (alleen in een actief technisch profiel), met «dit tabblad». */
export async function mijnAanvragen(u: Gebruiker, tab: string) {
  await vereisTech(u, tab);
  await opruimen();
  const rows = (await sys().query(`${MET_NAMEN} WHERE s.beheerder_id = $1 ORDER BY s.aangevraagd_op DESC LIMIT 20`, [u.id])).rows;
  return rows.map((r) => ({ ...uit(r), ditTabblad: r.beheerder_tab === tabHash(tab) }));
}

/** Controle van de rij voor een aanroep of de band; gooit IMPERSONATIE_BEEINDIGD als de toegang niet (meer) loopt. */
async function lopend(u: Gebruiker, tab: string, id: string) {
  if (!ID_RE.test(id)) fout('ID_ONGELDIG');
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  await opruimen();
  const v = (await sys().query(`${MET_NAMEN} WHERE s.id = $1`, [id])).rows[0];
  if (!v || v.beheerder_id !== u.id) fout('IMPERSONATIE_NIET_GEVONDEN', 404);
  if (v.status !== 'actief' || ms(v.eind_op)! <= Date.now()) fout('IMPERSONATIE_BEEINDIGD', 403);
  if (v.beheerder_tab !== tabHash(tab)) fout('ANDER_TABBLAD', 403);
  await vereisTech(u, tab);
  return v;
}

/** Voor de band van de beheerder: wie, tot wanneer, met of zonder acties. */
export async function band(u: Gebruiker, tab: string, id: string) { return uit(await lopend(u, tab, id)); }

// Leesaanroepen komen vaak (verversen elke paar seconden): één journaalregel per route per minuut; elke schrijfactie en elke weigering apart.
const laatstGelezen = new Map<string, number>();
const LEES_JOURNAAL_MS = 60_000;

/** 3. Eén aanroep van de site als de gebruiker. Geeft status en body van de route terug (nooit koppen of cookies). */
export async function aanroep(u: Gebruiker & { email?: string }, tab: string, input: { id: unknown; route: unknown; body?: unknown; service?: unknown }): Promise<{ status: number; data: unknown }> {
  const id = String(input.id || '');
  const v = await lopend(u, tab, id);
  const route = String(input.route || '').trim();
  const metActies = !!v.met_acties;
  const oordeel = routeOordeel(route, metActies);
  const pad = route.split(' ')[1] || '';
  if (oordeel) {
    await sys().query(`UPDATE app.impersonatie_sessies SET geweigerd = geweigerd + 1, laatst_actief = now() WHERE id = $1`, [id]);
    await journaal(v.doel_id, u.id, 'owner.impersonatie.geweigerd-route', id, { route: route.slice(0, 200), code: oordeel }, 'denied');
    fout(oordeel, 403);
  }
  const ruw = input.body && typeof input.body === 'object' && !Array.isArray(input.body) ? { ...(input.body as Record<string, unknown>) } : {};
  delete ruw.sessionToken; delete ruw.impersonatie;
  const service = isImpersonatieDienst(ruw.service) ? String(ruw.service) : isImpersonatieDienst(input.service) ? String(input.service) : 'hub';
  const body = { ...ruw, service, tabContext: tab };
  const res = await aanroeper(v.doel_id, service, route, body, { id, beheerderId: u.id, beheerderEmail: u.email, metActies });
  const code = String((res.data as Record<string, unknown> | null)?.error || '');
  if (res.geblokkeerd || /^IMPERSONATIE_/.test(code)) {
    const c2 = res.geblokkeerd ? 'IMPERSONATIE_ALLEEN_LEZEN' : code;
    await sys().query(`UPDATE app.impersonatie_sessies SET geweigerd = geweigerd + 1, laatst_actief = now() WHERE id = $1`, [id]);
    await journaal(v.doel_id, u.id, 'owner.impersonatie.geweigerd-route', id, { route: route.slice(0, 200), code: c2 }, 'denied');
    return { status: 403, data: { error: c2 } };
  }
  const lezen = isLeesRoute(route);
  await sys().query(`UPDATE app.impersonatie_sessies SET acties = acties + $2, laatst_actief = now() WHERE id = $1`, [id, lezen ? 0 : 1]);
  const sleutel = `${id} ${route}`;
  if (!lezen || (laatstGelezen.get(sleutel) || 0) < Date.now() - LEES_JOURNAAL_MS) {
    laatstGelezen.set(sleutel, Date.now());
    if (laatstGelezen.size > 2000) laatstGelezen.clear();
    await journaal(v.doel_id, u.id, lezen ? 'owner.impersonatie.bekeken' : 'owner.impersonatie.actie', id, { route: route.slice(0, 200), pad: pad.slice(0, 200), status: res.status, door: u.email || u.id }, res.status < 400 ? 'success' : 'failure');
  }
  return { status: res.status || 502, data: res.data };
}

/** Journaal van één sessie: wat de beheerder deed. Voor de gebruiker (doel) en de beheerder zelf. */
export async function sessieJournaal(u: Gebruiker, id: string) {
  if (!ID_RE.test(id)) fout('ID_ONGELDIG');
  const v = (await sys().query(`${MET_NAMEN} WHERE s.id = $1`, [id])).rows[0];
  if (!v || (v.doel_id !== u.id && v.beheerder_id !== u.id)) fout('IMPERSONATIE_NIET_GEVONDEN', 404);
  const rows = (await sys().query(`SELECT action, result, actor_id, details, service, (extract(epoch FROM created_at) * 1000)::bigint AS ms FROM app.audit
     WHERE owner_id = $1 AND ctx_namens = $2 ORDER BY id ASC LIMIT 500`, [v.doel_id, id])).rows;
  const regels = rows.map((r) => ({
    actie: String(r.action), resultaat: String(r.result || ''), op: Number(r.ms), dienst: String(r.service || ''),
    door: r.actor_id === v.beheerder_id ? 'beheerder' : r.actor_id === v.doel_id ? 'gebruiker' : 'systeem',
    actorType: String(r.details?.actorType || ''), route: String(r.details?.route || ''), code: String(r.details?.code || ''),
  }));
  return { sessie: uit(v), regels, samenvatting: { bekeken: regels.filter((r) => r.actie === 'owner.impersonatie.bekeken').length, acties: Number(v.acties || 0), geweigerd: Number(v.geweigerd || 0) } };
}
