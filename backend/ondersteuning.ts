// «Підтримка від імені» met toestemming (architectuur 13.10.2026, etap 7). Zie migrations/0035_ondersteuning.sql.
//
// Bewuste keuze voor deze eerste versie (en waarom niet «volledig inloggen als»): de ondersteuner krijgt GEEN sessie van de gebruiker.
// Hij ziet, alleen-lezen, een vast OVERZICHT van metadata (status, instellingen, apparaten, AI-verbindingen, diagnoseverslagen,
// recente acties). Zo verandert de sessiecontrole van de hele site niet (geen nieuw aanvalspad), en kan een ondersteuner nooit iets
// schrijven, sturen of lezen wat niet in het overzicht staat (geen mailinhoud, geen sleutels, geen wachtwoorden). Volledige
// «увійти як» (UI van de gebruiker zien) is een latere stap, pas na deze ervaring en met een lijst van toegestane leesroutes.
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { actieveActivatie, isEigenaar, tabHash, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';
import { isEmailAdres } from '../shared/adres-controle';
import { modusVan } from './weergave';

const sys = () => getPool('systeem');
const fout = (code: string, status = 400): never => { throw new TechFout(code, status); };
export type Melder = (userId: string, email: string, kind: string, titel: string, tekst: string) => Promise<void>;
export const ANTWOORD_MINUTEN = 15; // zo lang mag een verzoek op antwoord wachten

const audit = (ownerId: string, actorId: string, action: string, details: Record<string, unknown>) =>
  auditToevoegen({ ownerId, actorId, action, type: 'beveiliging', result: 'success', details }).catch(() => undefined);

async function vereisTech(u: Gebruiker, tab: string) {
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  const a = await actieveActivatie(u.id, tab);
  if (!a || !a.mogelijkheden.includes('impersonatie.aanvragen')) fout('TECH_ONDERSTEUNING_VEREIST', 403);
  return a!;
}

async function gebruikerOpEmail(email: string) {
  const e = String(email || '').trim().toLowerCase();
  if (!isEmailAdres(e, 200)) /* SEC-002 (aanv-gat-c-02): lengte eerst, lineair */ fout('EMAIL_ONGELDIG');
  const r = (await sys().query(`SELECT id, data->>'email' AS email, data->>'role' AS role, data->>'status' AS status FROM app.records
     WHERE tbl = 'users' AND lower(data->>'email') = $1 AND COALESCE((data->>'deletedAt')::numeric, 0) = 0 LIMIT 2`, [e])).rows;
  if (r.length !== 1) fout('GEBRUIKER_NIET_GEVONDEN', 404);
  return { id: String(r[0].id), email: String(r[0].email), role: r[0].role, status: r[0].status } as Gebruiker & { email: string };
}
const emailVan = async (id: string) => String((await sys().query(`SELECT data->>'email' AS e FROM app.records WHERE tbl='users' AND id=$1`, [id])).rows[0]?.e || '');

/** Verlopen verzoeken en toegang afsluiten (lui, bij elke aanroep). */
async function opruimen() {
  await sys().query(`UPDATE app.ondersteuning_verzoeken SET status = 'verlopen' WHERE status = 'wacht' AND aangevraagd_op < now() - make_interval(mins => $1)`, [ANTWOORD_MINUTEN]);
  await sys().query(`UPDATE app.ondersteuning_verzoeken SET status = 'verlopen' WHERE status = 'goedgekeurd' AND eind_op <= now()`);
}

const uit = (r: any) => ({
  id: String(r.id), reden: String(r.reden), minuten: Number(r.minuten), nood: !!r.nood, status: String(r.status), bereik: String(r.bereik),
  aangevraagd: new Date(r.aangevraagd_op).getTime(), besloten: r.besloten_op ? new Date(r.besloten_op).getTime() : null, eind: r.eind_op ? new Date(r.eind_op).getTime() : null,
  ...(r.aanvrager_email !== undefined ? { aanvrager: String(r.aanvrager_email || '') } : {}), ...(r.doel_email !== undefined ? { doel: String(r.doel_email || '') } : {}),
});

export async function aanvragen(u: Gebruiker, tab: string, input: { email: unknown; reden: unknown; minuten: unknown; nood?: unknown }, meld: Melder) {
  const a = await vereisTech(u, tab);
  await opruimen();
  const doel = await gebruikerOpEmail(String(input.email ?? ''));
  if (doel.id === u.id) fout('NIET_AAN_JEZELF', 403);
  if (isEigenaar(doel)) fout('EIGENAAR_ONAANTASTBAAR', 403);
  if (doel.status !== 'approved') fout('GEBRUIKER_NIET_GOEDGEKEURD', 409);
  const reden = String(input.reden ?? '').trim().replace(/\s+/g, ' ');
  if (reden.length < 3 || reden.length > 300) fout('REDEN_ONGELDIG');
  const minuten = Math.round(Number(input.minuten));
  if (!Number.isFinite(minuten) || minuten < 5 || minuten > 30) fout('DUUR_ONGELDIG');
  const nood = input.nood === true;
  if (nood && !a.rollen.includes('eigenaar')) fout('NOOD_ALLEEN_EIGENAAR', 403);
  // Eén open verzoek per paar: een nieuw verzoek vervangt een wachtend of lopend.
  await sys().query(`UPDATE app.ondersteuning_verzoeken SET status = 'ingetrokken', beeindigd_door = $1 WHERE aanvrager_id = $1 AND doel_id = $2 AND status IN ('wacht', 'goedgekeurd')`, [u.id, doel.id]);
  const r = (await sys().query(nood
    ? `INSERT INTO app.ondersteuning_verzoeken (aanvrager_id, doel_id, aanvrager_tab, reden, minuten, nood, status, besloten_op, eind_op) VALUES ($1,$2,$3,$4,$5,true,'goedgekeurd',now(),now() + make_interval(mins => $5)) RETURNING *`
    : `INSERT INTO app.ondersteuning_verzoeken (aanvrager_id, doel_id, aanvrager_tab, reden, minuten) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [u.id, doel.id, tabHash(tab), reden, minuten])).rows[0];
  const wie = u.email || 'ondersteuning';
  await audit(doel.id, u.id, nood ? 'owner.ondersteuning.nood' : 'owner.ondersteuning.gevraagd', { verzoek: r.id, door: wie, minuten, reden, viaActivatie: a.id });
  if (doel.id !== u.id) await audit(u.id, u.id, nood ? 'owner.ondersteuning.nood' : 'owner.ondersteuning.gevraagd', { verzoek: r.id, aan: doel.email, minuten });
  await meld(doel.id, doel.email, 'ondersteuning',
    nood ? 'Термінова підтримка переглядає ваш простір' : 'Підтримка просить дозволу переглянути ваш простір',
    nood ? `${wie} переглядає огляд вашого облікового запису (лише читання) до ${new Date(r.eind_op).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}. Причина: ${reden}. Завершити можна в меню облікового запису.`
      : `${wie} просить ${minuten} хв на перегляд огляду вашого облікового запису (лише читання). Причина: ${reden}. Дозволити чи відхилити — у вікні на сайті (діє ${ANTWOORD_MINUTEN} хв).`).catch(() => undefined);
  return { ...uit(r), doel: doel.email };
}

/** Voor de gebruiker zelf: wachtende en lopende verzoeken (met wie het vraagt). */
export async function voorMij(u: Gebruiker) {
  await opruimen();
  const rows = (await sys().query(`SELECT v.*, COALESCE(a.data->>'email', '') AS aanvrager_email FROM app.ondersteuning_verzoeken v
      LEFT JOIN app.records a ON a.tbl = 'users' AND a.id = v.aanvrager_id
     WHERE v.doel_id = $1 AND v.status IN ('wacht', 'goedgekeurd') ORDER BY v.aangevraagd_op DESC LIMIT 10`, [u.id])).rows;
  return rows.map(uit);
}

export async function beslissen(u: Gebruiker, id: string, ja: boolean) {
  if (!/^[0-9a-f-]{36}$/.test(id)) fout('ID_ONGELDIG');
  await opruimen();
  const r = (await sys().query(ja
    ? `UPDATE app.ondersteuning_verzoeken SET status = 'goedgekeurd', besloten_op = now(), eind_op = now() + make_interval(mins => minuten) WHERE id = $1 AND doel_id = $2 AND status = 'wacht' RETURNING *`
    : `UPDATE app.ondersteuning_verzoeken SET status = 'geweigerd', besloten_op = now() WHERE id = $1 AND doel_id = $2 AND status = 'wacht' RETURNING *`, [id, u.id])).rows[0];
  if (!r) fout('VERZOEK_NIET_OPEN', 404);
  await audit(u.id, u.id, ja ? 'owner.ondersteuning.toegestaan' : 'owner.ondersteuning.geweigerd', { verzoek: id, aan: await emailVan(r.aanvrager_id), minuten: r.minuten });
  await audit(r.aanvrager_id, u.id, ja ? 'owner.ondersteuning.toegestaan' : 'owner.ondersteuning.geweigerd', { verzoek: id, door: u.email || u.id });
  return uit(r);
}

/** Beëindigen: door de gebruiker (doel) of door de aanvrager, op elk moment. */
export async function beeindigen(u: Gebruiker, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) fout('ID_ONGELDIG');
  const r = (await sys().query(`UPDATE app.ondersteuning_verzoeken SET status = 'beeindigd', beeindigd_door = $2, eind_op = LEAST(COALESCE(eind_op, now()), now())
     WHERE id = $1 AND (doel_id = $2 OR aanvrager_id = $2) AND status IN ('wacht', 'goedgekeurd') RETURNING *`, [id, u.id])).rows[0];
  if (!r) fout('VERZOEK_NIET_OPEN', 404);
  await audit(r.doel_id, u.id, 'owner.ondersteuning.beeindigd', { verzoek: id, door: u.email || u.id });
  if (r.aanvrager_id !== r.doel_id) await audit(r.aanvrager_id, u.id, 'owner.ondersteuning.beeindigd', { verzoek: id });
  return uit(r);
}

/** Voor de ondersteuner: eigen verzoeken (alleen in een actief technisch profiel). */
export async function mijnAanvragen(u: Gebruiker, tab: string) {
  await vereisTech(u, tab);
  await opruimen();
  const rows = (await sys().query(`SELECT v.*, COALESCE(d.data->>'email', '') AS doel_email FROM app.ondersteuning_verzoeken v
      LEFT JOIN app.records d ON d.tbl = 'users' AND d.id = v.doel_id
     WHERE v.aanvrager_id = $1 ORDER BY v.aangevraagd_op DESC LIMIT 20`, [u.id])).rows;
  return rows.map((r) => ({ ...uit(r), ditTabblad: r.aanvrager_tab === tabHash(tab) }));
}

/**
 * Het overzicht zelf. Alleen: toegestaan, niet verlopen, dezelfde aanvrager, HETZELFDE tabblad als de aanvraag, en het technisch
 * profiel loopt nog. Alleen metadata; elke keer in het logboek van de gebruiker.
 */
export async function overzicht(u: Gebruiker, tab: string, id: string) {
  await vereisTech(u, tab);
  if (!/^[0-9a-f-]{36}$/.test(id)) fout('ID_ONGELDIG');
  await opruimen();
  const v = (await sys().query(`SELECT * FROM app.ondersteuning_verzoeken WHERE id = $1`, [id])).rows[0];
  if (!v || v.aanvrager_id !== u.id) fout('VERZOEK_NIET_GEVONDEN', 404);
  if (v.status !== 'goedgekeurd' || new Date(v.eind_op).getTime() <= Date.now()) fout('GEEN_TOESTEMMING', 403);
  if (v.aanvrager_tab !== tabHash(tab)) fout('ANDER_TABBLAD', 403);
  const d = v.doel_id as string;
  const [acc, agenten, ai, diag, acties, tech] = await Promise.all([
    sys().query(`SELECT data->>'email' AS email, COALESCE(data->>'name', '') AS naam, data->>'status' AS status, data->>'role' AS rol, (data->>'createdAt')::numeric AS aangemaakt FROM app.records WHERE tbl='users' AND id=$1`, [d]),
    sys().query(`SELECT name, platform, status, last_seen_at, browser_enabled, agent_version FROM app.agents WHERE user_id = $1 AND revoked_at IS NULL ORDER BY last_seen_at DESC NULLS LAST LIMIT 20`, [d]),
    sys().query(`SELECT client_name, max(last_used_at) AS laatst, max(refresh_expires_at) AS tot, count(*)::int AS n FROM app.mcp_oauth_tokens WHERE user_id = $1 AND revoked_at IS NULL AND refresh_expires_at > now() GROUP BY client_name ORDER BY 2 DESC NULLS LAST LIMIT 20`, [d]).catch(() => ({ rows: [] })),
    sys().query(`SELECT oordeel, dienst, uitslagen, aangemaakt_op FROM app.diagnose_meldingen WHERE user_id = $1 ORDER BY aangemaakt_op DESC LIMIT 5`, [d]),
    sys().query(`SELECT action, result, service, created_at FROM app.audit WHERE owner_id = $1 AND action NOT LIKE 'owner.ondersteuning.%' ORDER BY id DESC LIMIT 20`, [d]),
    sys().query(`SELECT rollen FROM app.tech_profielen WHERE user_id = $1 AND ingetrokken_op IS NULL`, [d]),
  ]);
  const a = acc.rows[0] || {};
  await audit(d, u.id, 'owner.ondersteuning.bekeken', { verzoek: id, door: u.email || u.id, _ctx: { namens: id } });
  return {
    verzoek: uit(v),
    account: { email: String(a.email || ''), naam: String(a.naam || ''), status: String(a.status || ''), rol: String(a.rol || ''), aangemaakt: a.aangemaakt ? Number(a.aangemaakt) : null },
    weergave: (await modusVan({ id: d, email: a.email, role: a.rol, status: a.status })).modus,
    techRollen: (tech.rows[0]?.rollen as string[] | undefined) ?? [],
    apparaten: agenten.rows.map((r) => ({ naam: r.name, platform: r.platform || '', status: r.status, laatst: r.last_seen_at ? new Date(r.last_seen_at).getTime() : null, browser: !!r.browser_enabled, versie: r.agent_version || '' })),
    aiVerbindingen: ai.rows.map((r: any) => ({ klant: r.client_name, laatst: r.laatst ? new Date(r.laatst).getTime() : null, tot: r.tot ? new Date(r.tot).getTime() : null, aantal: r.n })),
    diagnose: diag.rows.map((r) => ({ oordeel: r.oordeel, dienst: r.dienst, op: new Date(r.aangemaakt_op).getTime(), problemen: (r.uitslagen as Array<{ id: string; stand: string; code?: string }>).filter((x) => x.stand !== 'ok' && x.stand !== 'onbekend').map((x) => `${x.id}:${x.code || x.stand}`) })),
    recenteActies: acties.rows.map((r) => ({ actie: r.action, resultaat: r.result, dienst: r.service || '', op: new Date(r.created_at).getTime() })),
  };
}
