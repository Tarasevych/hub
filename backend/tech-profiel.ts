// Technisch profiel (architectuur 13.10.2026): toekennen, intrekken, op tijd activeren per tabblad, band. Zie shared/tech-rollen.ts.
//
// Veiligheidsregels (elk afgedwongen hier, op de server):
//  - een profiel geeft op zich niets; rechten bestaan alleen in een lopende rij van app.tech_activaties (eind_op in de toekomst,
//    niet beëindigd) voor DIT tabblad (sha256 van de tabcontext) en DIT account;
//  - activeren vraagt een verse bevestiging van de aanmelding (stap-op) en een reden; de duur ≤ het plafond van de strengste rol en
//    van het profiel (en ≤ 8 uur in de database);
//  - toekennen/intrekken alleen vanuit een LOPENDE activering met 'roles.delegate', alleen rollen die de gever zelf heeft,
//    nooit aan zichzelf, nooit aan of van de eigenaar van de server;
//  - de eigenaar (OWNER_EMAIL) krijgt automatisch een profiel 'eigenaar' en kan het via de site niet verliezen;
//  - alles in het onveranderlijke logboek (owner.tech.*). Schrijven uitsluitend via de systeemrol.
import { createHash, randomBytes } from 'node:crypto';
import { isOwnerEmail } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import { BAND_KLEUREN, isBandKleur, isBandPatroon, isTechRol, maxMinutenVoor, mogelijkhedenVan, STANDAARD_BAND, type TechMogelijkheid, type TechRol } from '../shared/tech-rollen';

const sys = () => getPool('systeem');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const TAB_RE = /^[a-f0-9]{48}$/;
export const tabHash = (tabContext: string) => sha(`tech-tab:${tabContext}`);

export class TechFout extends Error { constructor(public code: string, public status = 400) { super(code); } }
const fout = (code: string, status = 400): never => { throw new TechFout(code, status); };

export type Gebruiker = { id: string; email?: string; role?: string; status?: string };
export const isEigenaar = (u: Gebruiker) => u.role === 'owner' && isOwnerEmail(u.email);

export type Profiel = {
  userId: string; profielId: string; rollen: TechRol[]; maxMinuten: number; band: { kleur: string; patroon: string };
  toegekendDoor: string; toegekendOp: number; laatstActief: number | null; ingetrokkenOp: number | null; notitie: string;
};
export type Activatie = { id: string; profielId: string; rollen: TechRol[]; mogelijkheden: TechMogelijkheid[]; reden: string; begin: number; eind: number };

const profielUit = (r: any): Profiel => ({
  userId: r.user_id, profielId: r.profiel_id, rollen: (r.rollen as string[]).filter(isTechRol), maxMinuten: Number(r.max_minuten),
  band: { kleur: isBandKleur(r.band?.kleur) ? r.band.kleur : STANDAARD_BAND.kleur, patroon: isBandPatroon(r.band?.patroon) ? r.band.patroon : STANDAARD_BAND.patroon },
  toegekendDoor: r.toegekend_door, toegekendOp: new Date(r.toegekend_op).getTime(), laatstActief: r.laatst_actief ? new Date(r.laatst_actief).getTime() : null,
  ingetrokkenOp: r.ingetrokken_op ? new Date(r.ingetrokken_op).getTime() : null, notitie: String(r.notitie || ''),
});
const activatieUit = (r: any): Activatie => ({
  id: String(r.id), profielId: r.profiel_id, rollen: (r.rollen as string[]).filter(isTechRol), mogelijkheden: mogelijkhedenVan(r.rollen),
  reden: String(r.reden), begin: new Date(r.begin_op).getTime(), eind: new Date(r.eind_op).getTime(),
});
const nieuwProfielId = () => `tech-${randomBytes(6).toString('hex')}`;
const audit = (ownerId: string, actorId: string, action: string, details: Record<string, unknown>, result = 'success') =>
  auditToevoegen({ ownerId, actorId, action, type: 'beveiliging', result, details }).catch(() => undefined);

/** Profiel van dit account (ook ingetrokken, voor de geschiedenis). De eigenaar krijgt er automatisch één. */
export async function profielVan(u: Gebruiker): Promise<Profiel | null> {
  const r = (await sys().query('SELECT * FROM app.tech_profielen WHERE user_id = $1', [u.id])).rows[0];
  if (r) {
    // De eigenaar kan zijn profiel niet verliezen (ook niet als het ooit werd ingetrokken): herstellen.
    if (isEigenaar(u) && (r.ingetrokken_op || !(r.rollen as string[]).includes('eigenaar'))) {
      const n = (await sys().query(`UPDATE app.tech_profielen SET rollen = ARRAY['eigenaar'], ingetrokken_op = NULL, ingetrokken_door = NULL, ingetrokken_reden = NULL,
        max_minuten = GREATEST(max_minuten, 120), gewijzigd_op = now() WHERE user_id = $1 RETURNING *`, [u.id])).rows[0];
      return profielUit(n);
    }
    return profielUit(r);
  }
  if (!isEigenaar(u)) return null;
  const n = (await sys().query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['eigenaar'], 120, 'systeem')
    ON CONFLICT (user_id) DO NOTHING RETURNING *`, [u.id, nieuwProfielId()])).rows[0];
  if (n) await audit(u.id, u.id, 'owner.tech.toegekend', { profielId: n.profiel_id, rollen: ['eigenaar'], door: 'systeem' });
  return n ? profielUit(n) : profielVan(u);
}

/** Lopende activering voor dit account in dit tabblad; verlopen rijen worden meteen als 'verlopen' afgesloten. */
export async function actieveActivatie(userId: string, tabContext: string): Promise<Activatie | null> {
  if (!TAB_RE.test(tabContext)) return null;
  await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = eind_op, beeindigd_reden = 'verlopen' WHERE user_id = $1 AND beeindigd_op IS NULL AND eind_op <= now()`, [userId]);
  const r = (await sys().query(`SELECT a.* FROM app.tech_activaties a JOIN app.tech_profielen p ON p.user_id = a.user_id AND p.profiel_id = a.profiel_id AND p.ingetrokken_op IS NULL
     WHERE a.user_id = $1 AND a.tab_hash = $2 AND a.beeindigd_op IS NULL AND a.eind_op > now() ORDER BY a.begin_op DESC LIMIT 1`, [userId, tabHash(tabContext)])).rows[0];
  return r ? activatieUit(r) : null;
}

export async function activeren(u: Gebruiker, tabContext: string, minuten: number, reden: string): Promise<Activatie> {
  if (!TAB_RE.test(tabContext)) fout('TAB_ONGELDIG');
  const p = await profielVan(u);
  if (!p || p.ingetrokkenOp) fout('GEEN_TECH_PROFIEL', 403);
  const profiel = p as Profiel;
  const max = maxMinutenVoor(profiel.rollen, profiel.maxMinuten);
  const m = Math.round(Number(minuten));
  if (!Number.isFinite(m) || m < 15 || m > max) fout('DUUR_ONGELDIG');
  const r = String(reden || '').trim().replace(/\s+/g, ' ');
  if (r.length < 3 || r.length > 300) fout('REDEN_ONGELDIG');
  const h = tabHash(tabContext);
  // Een nieuwe activering in hetzelfde tabblad vervangt de vorige (verlengen = opnieuw activeren met stap-op).
  await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'vervangen' WHERE user_id = $1 AND tab_hash = $2 AND beeindigd_op IS NULL`, [u.id, h]);
  const row = (await sys().query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6)) RETURNING *`,
    [u.id, profiel.profielId, h, profiel.rollen, r, m])).rows[0];
  await sys().query('UPDATE app.tech_profielen SET laatst_actief = now() WHERE user_id = $1', [u.id]);
  await audit(u.id, u.id, 'owner.tech.geactiveerd', { profielId: profiel.profielId, rollen: profiel.rollen, minuten: m, reden: r, activatie: row.id });
  return activatieUit(row);
}

export async function beeindigen(u: Gebruiker, tabContext: string): Promise<boolean> {
  if (!TAB_RE.test(tabContext)) return false;
  const rows = (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'zelf' WHERE user_id = $1 AND tab_hash = $2 AND beeindigd_op IS NULL RETURNING id, profiel_id`,
    [u.id, tabHash(tabContext)])).rows;
  for (const r of rows) await audit(u.id, u.id, 'owner.tech.beeindigd', { profielId: r.profiel_id, activatie: r.id, reden: 'zelf' });
  return rows.length > 0;
}

export async function bandZetten(u: Gebruiker, kleur: unknown, patroon: unknown): Promise<Profiel> {
  if (!isBandKleur(kleur) || !isBandPatroon(patroon)) fout('BAND_ONGELDIG');
  const p = await profielVan(u);
  if (!p) fout('GEEN_TECH_PROFIEL', 403);
  const r = (await sys().query(`UPDATE app.tech_profielen SET band = jsonb_build_object('kleur', $2::text, 'patroon', $3::text), gewijzigd_op = now() WHERE user_id = $1 RETURNING *`, [u.id, kleur, patroon])).rows[0];
  await audit(u.id, u.id, 'owner.tech.band', { kleur, patroon });
  return profielUit(r);
}

// ---------------------------------------------------------------- toekennen en intrekken (alleen vanuit een lopende activering)
async function gever(u: Gebruiker, tabContext: string): Promise<Activatie> {
  const a = await actieveActivatie(u.id, tabContext);
  if (!a) fout('TECH_NIET_ACTIEF', 403);
  if (!(a as Activatie).mogelijkheden.includes('roles.delegate')) fout('DELEGEREN_NIET_TOEGESTAAN', 403);
  return a as Activatie;
}
async function doelGebruiker(email: string): Promise<Gebruiker> {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) fout('EMAIL_ONGELDIG');
  const r = (await sys().query(`SELECT id, data->>'email' AS email, data->>'role' AS role, data->>'status' AS status FROM app.records
     WHERE tbl = 'users' AND lower(data->>'email') = $1 AND COALESCE((data->>'deletedAt')::numeric, 0) = 0 LIMIT 2`, [e])).rows;
  if (r.length !== 1) fout('GEBRUIKER_NIET_GEVONDEN', 404);
  if (r[0].status !== 'approved') fout('GEBRUIKER_NIET_GOEDGEKEURD', 409);
  return { id: String(r[0].id), email: r[0].email, role: r[0].role, status: r[0].status };
}

export async function toekennen(actor: Gebruiker, tabContext: string, input: { email: string; rollen: unknown; maxMinuten: unknown; notitie?: unknown }): Promise<Profiel> {
  const a = await gever(actor, tabContext);
  const rollen = Array.isArray(input.rollen) ? [...new Set(input.rollen)].filter(isTechRol) : [];
  if (!rollen.length || rollen.length !== (input.rollen as unknown[]).length) fout('ROLLEN_ONGELDIG');
  if (rollen.includes('eigenaar')) fout('EIGENAAR_NIET_TOE_TE_KENNEN', 403);
  // Escalatie voorkomen: alleen rollen die de gever zelf in deze activering heeft (de eigenaar mag alle gedelegeerde rollen geven).
  const eigen = new Set(a.rollen.includes('eigenaar') ? ['ondersteuning', 'tester', 'ontwikkelaar', 'beheerder', 'auditor'] : a.rollen);
  if (!rollen.every((r) => eigen.has(r))) fout('ROLLEN_BOVEN_EIGEN', 403);
  const max = Math.round(Number(input.maxMinuten));
  if (!Number.isFinite(max) || max < 15 || max > 480) fout('DUUR_ONGELDIG');
  const doel = await doelGebruiker(input.email);
  if (doel.id === actor.id) fout('NIET_AAN_JEZELF', 403);
  if (isEigenaar(doel)) fout('EIGENAAR_ONAANTASTBAAR', 403);
  const notitie = String(input.notitie ?? '').trim().slice(0, 300);
  const r = (await sys().query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door, notitie) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, max_minuten = EXCLUDED.max_minuten, toegekend_door = EXCLUDED.toegekend_door, notitie = EXCLUDED.notitie,
       toegekend_op = CASE WHEN app.tech_profielen.ingetrokken_op IS NULL THEN app.tech_profielen.toegekend_op ELSE now() END, gewijzigd_op = now(),
       ingetrokken_op = NULL, ingetrokken_door = NULL, ingetrokken_reden = NULL
     RETURNING *`, [doel.id, nieuwProfielId(), rollen, max, actor.id, notitie])).rows[0];
  // Rollen gewijzigd: lopende activeringen van de ontvanger houden hun OUDE rollen niet — afsluiten, hij activeert opnieuw.
  await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'ingetrokken' WHERE user_id = $1 AND beeindigd_op IS NULL`, [doel.id]);
  await audit(doel.id, actor.id, 'owner.tech.toegekend', { profielId: r.profiel_id, rollen, maxMinuten: max, door: actor.email || actor.id, viaActivatie: a.id });
  if (doel.id !== actor.id) await audit(actor.id, actor.id, 'owner.tech.toegekend', { aan: doel.email, profielId: r.profiel_id, rollen, maxMinuten: max, viaActivatie: a.id });
  return profielUit(r);
}

export async function intrekken(actor: Gebruiker, tabContext: string, userId: string, reden: unknown): Promise<boolean> {
  const a = await gever(actor, tabContext);
  if (userId === actor.id) fout('NIET_AAN_JEZELF', 403);
  const t = (await sys().query(`SELECT r.id, r.data->>'email' AS email, r.data->>'role' AS role, p.rollen FROM app.tech_profielen p JOIN app.records r ON r.tbl = 'users' AND r.id = p.user_id
     WHERE p.user_id = $1 AND p.ingetrokken_op IS NULL`, [String(userId || '')])).rows[0];
  if (!t) fout('PROFIEL_NIET_GEVONDEN', 404);
  if (isEigenaar({ id: t.id, email: t.email, role: t.role })) fout('EIGENAAR_ONAANTASTBAAR', 403);
  // Ook intrekken alleen binnen de eigen rollen: een beheerder kan geen profiel met een sterkere rol intrekken dan hij zelf heeft.
  const eigen = new Set(a.rollen.includes('eigenaar') ? ['ondersteuning', 'tester', 'ontwikkelaar', 'beheerder', 'auditor'] : a.rollen);
  if (!(t.rollen as string[]).every((r) => eigen.has(r))) fout('ROLLEN_BOVEN_EIGEN', 403);
  const r = String(reden ?? '').trim().slice(0, 300) || 'zonder reden';
  await sys().query(`UPDATE app.tech_profielen SET ingetrokken_op = now(), ingetrokken_door = $2, ingetrokken_reden = $3, gewijzigd_op = now() WHERE user_id = $1`, [t.id, actor.id, r]);
  const weg = (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'ingetrokken' WHERE user_id = $1 AND beeindigd_op IS NULL RETURNING id`, [t.id])).rows.length;
  await audit(t.id, actor.id, 'owner.tech.ingetrokken', { door: actor.email || actor.id, reden: r, beeindigdeActivaties: weg, viaActivatie: a.id });
  if (t.id !== actor.id) await audit(actor.id, actor.id, 'owner.tech.ingetrokken', { van: t.email, reden: r, viaActivatie: a.id });
  return true;
}

export type ProfielRij = Profiel & { email: string; naam: string; actiefTot: number | null };
export async function profielenLijst(actor: Gebruiker, tabContext: string): Promise<ProfielRij[]> {
  await gever(actor, tabContext);
  const rows = (await sys().query(`SELECT p.*, r.data->>'email' AS email, COALESCE(r.data->>'name', '') AS naam,
       (SELECT max(a.eind_op) FROM app.tech_activaties a WHERE a.user_id = p.user_id AND a.beeindigd_op IS NULL AND a.eind_op > now()) AS actief_tot
     FROM app.tech_profielen p LEFT JOIN app.records r ON r.tbl = 'users' AND r.id = p.user_id ORDER BY p.ingetrokken_op NULLS FIRST, p.toegekend_op DESC LIMIT 200`)).rows;
  return rows.map((r: any) => ({ ...profielUit(r), email: String(r.email || ''), naam: String(r.naam || ''), actiefTot: r.actief_tot ? new Date(r.actief_tot).getTime() : null }));
}

/** Voor andere routes (volgende stappen): heeft dit verzoek nu deze mogelijkheid? Zonder lopende activering: nee. */
export async function heeftTechMogelijkheid(userId: string, tabContext: string, m: TechMogelijkheid): Promise<boolean> {
  const a = await actieveActivatie(userId, tabContext);
  return !!a && a.mogelijkheden.includes(m);
}

export const bandKleuren = BAND_KLEUREN;
