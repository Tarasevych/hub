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
import { BAND_KLEUREN, isBandKleur, isBandPatroon, isTechRol, maxMinutenVoor, mogelijkhedenVan, openEindeToegestaan, STANDAARD_BAND, type TechMogelijkheid, type TechRol } from '../shared/tech-rollen';

const sys = () => getPool('systeem');
/** Technische ruimtes v2 (0115): dynamisch geladen (geen kringverwijzing). Vlag UIT → nergens gebruikt behalve de schaduw. */
const kern = () => import('./tech-ruimtes-kern');
async function v2(userId: string): Promise<typeof import('./tech-ruimtes-kern') | null> {
  try { const k = await kern(); return (await k.v2Aan(userId)) ? k : null; } catch { return null; }
}
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
  /** Migratie 0080: mag een NIEUW tabblad een open activering erven (0071)? Standaard false = nieuwe tabbladen zijn gebruikerstabbladen. */
  ervenNieuweTabbladen: boolean;
};
export type ActivatieModus = 'tijd' | 'tot-uitloggen' | 'tot-verlaten';
/** Herkomst (migratie 0071): 'eigen' = in dit tabblad geactiveerd; 'geerfd' = kopie van een open activering van dezelfde sessie;
 *  'gedeeld' = kopie van een activering op tijd, voor een tabblad dat vanuit het bron-tabblad is geopend. */
export type ActivatieHerkomst = 'eigen' | 'geerfd' | 'gedeeld';
export type Activatie = { id: string; profielId: string; rollen: TechRol[]; mogelijkheden: TechMogelijkheid[]; reden: string; begin: number; eind: number; modus: ActivatieModus; sessieId: string | null; tabSessieId: string | null; herkomst: ActivatieHerkomst };
/** De aanmeldsessie waaraan een activering hangt (migratie 0060): ankersessie + eventuele tab-overlay. */
export type Sessie = { id: string; createdAt: number; tabSessieId?: string | null };
/** Reden van beëindiging bij het intrekken van sessies (zie migratie 0060). */
export type BeeindigReden = 'uitgelogd' | 'revoke' | 'revoke-all' | 'revoke-others' | 'emergency' | 'handmatig';

const profielUit = (r: any): Profiel => ({
  userId: r.user_id, profielId: r.profiel_id, rollen: (r.rollen as string[]).filter(isTechRol), maxMinuten: Number(r.max_minuten),
  band: { kleur: isBandKleur(r.band?.kleur) ? r.band.kleur : STANDAARD_BAND.kleur, patroon: isBandPatroon(r.band?.patroon) ? r.band.patroon : STANDAARD_BAND.patroon },
  toegekendDoor: r.toegekend_door, toegekendOp: new Date(r.toegekend_op).getTime(), laatstActief: r.laatst_actief ? new Date(r.laatst_actief).getTime() : null,
  ingetrokkenOp: r.ingetrokken_op ? new Date(r.ingetrokken_op).getTime() : null, notitie: String(r.notitie || ''),
  ervenNieuweTabbladen: r.erven_nieuwe_tabbladen === true,
});
const activatieUit = (r: any): Activatie => ({
  id: String(r.id), profielId: r.profiel_id, rollen: (r.rollen as string[]).filter(isTechRol), mogelijkheden: mogelijkhedenVan(r.rollen),
  reden: String(r.reden), begin: new Date(r.begin_op).getTime(), eind: new Date(r.eind_op).getTime(),
  modus: r.modus === 'tot-uitloggen' || r.modus === 'tot-verlaten' ? r.modus : 'tijd',
  sessieId: r.sessie_id ? String(r.sessie_id) : null, tabSessieId: r.tab_sessie_id ? String(r.tab_sessie_id) : null,
  herkomst: r.herkomst === 'geerfd' || r.herkomst === 'gedeeld' ? r.herkomst : 'eigen',
});
const nieuwProfielId = () => `tech-${randomBytes(6).toString('hex')}`;
// Een mislukte auditregel breekt de actie niet, maar verdwijnt ook nooit stil: altijd in het servicelogboek.
const audit = (ownerId: string, actorId: string, action: string, details: Record<string, unknown>, result = 'success') =>
  auditToevoegen({ ownerId, actorId, action, type: 'beveiliging', result, details })
    .catch((err) => { console.error(`[tech-profiel] AUDIT MISLUKT (${action}):`, (err as Error).message); });

/** Hardste grens van een activering OP TIJD in de database (tech_activaties_duur): 8 uur. */
export const ACTIVERING_MAX_MINUTEN = 480;
/** «Tot uitloggen» / «tot verlaten» hebben geen tijdsgrens; eind_op is NOT NULL, dus een technische achtervang (migratie 0048). */
export const ACTIVERING_OPEN_DAGEN = 366;

/** Profiel van dit account (ook ingetrokken, voor de geschiedenis). De eigenaar krijgt er automatisch één. */
export async function profielVan(u: Gebruiker): Promise<Profiel | null> {
  const r = (await sys().query('SELECT * FROM app.tech_profielen WHERE user_id = $1', [u.id])).rows[0];
  if (r) {
    // De eigenaar kan zijn profiel niet verliezen (ook niet als het ooit werd ingetrokken): herstellen.
    if (isEigenaar(u) && (r.ingetrokken_op || !(r.rollen as string[]).includes('eigenaar'))) {
      const n = (await sys().query(`UPDATE app.tech_profielen SET rollen = ARRAY['eigenaar'], ingetrokken_op = NULL, ingetrokken_door = NULL, ingetrokken_reden = NULL,
        max_minuten = GREATEST(max_minuten, 480), gewijzigd_op = now() WHERE user_id = $1 RETURNING *`, [u.id])).rows[0];
      return profielUit(n);
    }
    return profielUit(r);
  }
  if (!isEigenaar(u)) return null;
  const n = (await sys().query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['eigenaar'], 480, 'systeem')
    ON CONFLICT (user_id) DO NOTHING RETURNING *`, [u.id, nieuwProfielId()])).rows[0];
  if (n) await audit(u.id, u.id, 'owner.tech.toegekend', { profielId: n.profiel_id, rollen: ['eigenaar'], door: 'systeem' });
  return n ? profielUit(n) : profielVan(u);
}

/**
 * Lopende activering voor dit account in dit tabblad; verlopen rijen worden meteen als 'verlopen' afgesloten.
 * Met `sessie` (de huidige aanmeldsessie) telt alleen een activering die bij DIE sessie hoort: sessie_id gelijk, of — voor rijen van
 * vóór migratie 0060 zonder sessie_id — begonnen ná het begin van de huidige sessie. Zo kan een activering nooit een sessie-intrekking
 * «overleven» doordat iemand in hetzelfde tabblad opnieuw aanmeldt (audit 18.10.2026, punt 3).
 */
export async function actieveActivatie(userId: string, tabContext: string, sessie?: Sessie | null): Promise<Activatie | null> {
  if (!TAB_RE.test(tabContext)) return null;
  // v2: één beslissing (shared/ruimte-toegang.ts). Met sessie: die aanmelding; zonder: het geregistreerde tabblad (S7).
  const k2 = await v2(userId);
  if (k2) {
    if (sessie?.id) await k2.registreerTab(userId, String(sessie.id), tabContext).catch(() => undefined);
    return k2.alsActivatie(await k2.besluit(userId, sessie?.id ? { bron: 'site', sessieId: String(sessie.id), tab: tabContext } : { bron: 'site', tab: tabContext }));
  }
  const oud = await actieveActivatieOud(userId, tabContext, sessie);
  if (oud && !sessie) void kern().then(async (k) => { const st = await k.strengOpOudeRij(oud.sessieId); k.schaduwVerschil(userId, 'tab-zonder-sessie', true, st.ok, st.reden); }).catch(() => undefined);
  return oud;
}
async function actieveActivatieOud(userId: string, tabContext: string, sessie?: Sessie | null): Promise<Activatie | null> {
  // Verlopen rijen afsluiten én één keer in het logboek zetten (anders is het einde van een activering nergens te zien).
  const verlopen = (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = eind_op, beeindigd_reden = 'verlopen' WHERE user_id = $1 AND beeindigd_op IS NULL AND eind_op <= now() RETURNING id, profiel_id`, [userId])).rows;
  for (const r of verlopen) await audit(userId, userId, 'owner.tech.beeindigd', { profielId: r.profiel_id, activatie: r.id, reden: 'verlopen' });
  const sessieVoorwaarde = sessie ? ` AND (a.sessie_id = $3 OR (a.sessie_id IS NULL AND a.begin_op >= to_timestamp($4::double precision / 1000) - interval '60 seconds'))` : '';
  const params: unknown[] = [userId, tabHash(tabContext)];
  if (sessie) params.push(String(sessie.id), Number(sessie.createdAt) || 0);
  const r = (await sys().query(`SELECT a.* FROM app.tech_activaties a JOIN app.tech_profielen p ON p.user_id = a.user_id AND p.profiel_id = a.profiel_id AND p.ingetrokken_op IS NULL
     WHERE a.user_id = $1 AND a.tab_hash = $2 AND a.beeindigd_op IS NULL AND a.eind_op > now()${sessieVoorwaarde} ORDER BY a.begin_op DESC LIMIT 1`, params)).rows[0];
  return r ? activatieUit(r) : null;
}

/**
 * Levende rechten (20.10.2026) — een LOPENDE activering van dit account, ongeacht het tabblad.
 *
 * De MCP-connector heeft geen tabblad: een AI roept van buiten aan, zonder browsersessie en zonder tabcontext. Toch moet
 * «technisch» daar precies zo lang bestaan als op de site. Daarom kijkt deze functie naar het ACCOUNT: is er op dit moment
 * ergens een niet-beëindigde activering met een geldig profiel? Zodra de mens het technische profiel verlaat, uitlogt of
 * de tijd om is (tech_activaties.eind_op), is het antwoord meteen `null` — en verdwijnen de technische hulpmiddelen uit
 * tools/list én uit tools/call. Verlopen rijen worden hier ook afgesloten, zodat het logboek het einde blijft tonen.
 */
export async function lopendeActivatie(userId: string): Promise<Activatie | null> {
  if (!userId) return null;
  // v2: de AI/MCP gebruikt DEZELFDE beslissing (bron 'mcp'): levende, niet-gepauzeerde sessie + expliciete AI-instelling (S4).
  const k2 = await v2(userId);
  if (k2) return k2.alsActivatie(await k2.besluit(userId, { bron: 'mcp' }));
  const oud = await lopendeActivatieOud(userId);
  if (oud) void kern().then(async (k) => { const st = await k.strengOpOudeRij(oud.sessieId); k.schaduwVerschil(userId, 'mcp-account-breed', true, st.ok, st.reden); }).catch(() => undefined);
  return oud;
}
async function lopendeActivatieOud(userId: string): Promise<Activatie | null> {
  const verlopen = (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = eind_op, beeindigd_reden = 'verlopen' WHERE user_id = $1 AND beeindigd_op IS NULL AND eind_op <= now() RETURNING id, profiel_id`, [userId])).rows;
  for (const r of verlopen) await audit(userId, userId, 'owner.tech.beeindigd', { profielId: r.profiel_id, activatie: r.id, reden: 'verlopen' });
  const r = (await sys().query(`SELECT a.* FROM app.tech_activaties a JOIN app.tech_profielen p ON p.user_id = a.user_id AND p.profiel_id = a.profiel_id AND p.ingetrokken_op IS NULL
     WHERE a.user_id = $1 AND a.beeindigd_op IS NULL AND a.eind_op > now() ORDER BY a.begin_op DESC LIMIT 1`, [userId])).rows[0];
  return r ? activatieUit(r) : null;
}

export async function activeren(u: Gebruiker, tabContext: string, minuten: number, reden: string, sessie?: Sessie | null): Promise<Activatie> {
  if (!TAB_RE.test(tabContext)) fout('TAB_ONGELDIG');
  if (await v2(u.id)) fout('GEBRUIK_RUIMTES_V2', 409);
  const p = await profielVan(u);
  if (!p || p.ingetrokkenOp) fout('GEEN_TECH_PROFIEL', 403);
  const profiel = p as Profiel;
  const max = maxMinutenVoor(profiel.rollen, profiel.maxMinuten);
  const m = Math.round(Number(minuten));
  const totUitlog = m === 0;
  const totTechUit = m === -1;
  const open = totUitlog || totTechUit;
  // «Tot uitloggen» (0) en «tot verlaten» (-1) hebben geen tijdsgrens: ze eindigen bij uitloggen resp. bij het verlaten van het profiel
  // (beeindigen / beeindigenBijUitloggen). Alleen profielen waarvan elke rol een plafond ≥ 4 uur heeft mogen dit (een beheerder, met
  // een plafond van 1 uur, niet: die rol mag gebruikers en rollen beheren). Activeringen op tijd blijven ≤ rolplafond en ≤ 8 uur.
  if (open && !openEindeToegestaan(profiel.rollen)) fout('DUUR_ONGELDIG');
  if (!open && (!Number.isFinite(m) || m < 15 || m > max)) fout('DUUR_ONGELDIG');
  const duur = open ? ACTIVERING_OPEN_DAGEN * 1440 : m;
  const modus: ActivatieModus = totUitlog ? 'tot-uitloggen' : totTechUit ? 'tot-verlaten' : 'tijd';
  const r = String(reden || '').trim().replace(/\s+/g, ' ');
  if (r.length < 3 || r.length > 300) fout('REDEN_ONGELDIG');
  const h = tabHash(tabContext);
  // Een nieuwe activering in hetzelfde tabblad vervangt de vorige (verlengen = opnieuw activeren met stap-op).
  const vervangen = (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'vervangen' WHERE user_id = $1 AND tab_hash = $2 AND beeindigd_op IS NULL RETURNING id`, [u.id, h])).rows.map((r: any) => String(r.id));
  // Open modi: '366 days' als interval (niet 527040 minuten): in een tijdzone met zomertijd verschilt dat een uur en brak de CHECK
  // tech_activaties_duur (gezien 27.10.2026, database-tijdzone Europe/Brussels).
  // Het einde wordt in de database uitgerekend (now() + duur): zo is eind - begin exact de duur en kan een klokverschil tussen app en
  // database de CHECK tech_activaties_duur (≤ 8 uur) nooit raken.
  const row = (await sys().query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op, modus, sessie_id, tab_sessie_id) VALUES ($1, $2, $3, $4, $5, now() + CASE WHEN $7 = 'tijd' THEN make_interval(mins => $6::int) ELSE interval '366 days' END, $7, $8, $9) RETURNING *`,
    [u.id, profiel.profielId, h, profiel.rollen, r, duur, modus, sessie?.id ? String(sessie.id) : null, sessie?.tabSessieId ? String(sessie.tabSessieId) : null])).rows[0];
  // Kopieën in andere tabbladen (0071) van de vervangen rij: bij een nieuwe OPEN activering volgen ze de nieuwe rij; wordt het een
  // activering op tijd, dan eindigen ze (de gebruiker koos bewust voor «alleen deze vensters, op tijd»).
  if (vervangen.length) {
    if (open) await sys().query(`UPDATE app.tech_activaties SET ouder_id = $3 WHERE user_id = $1 AND ouder_id = ANY($2::uuid[]) AND beeindigd_op IS NULL`, [u.id, vervangen, row.id]);
    else {
      const weg = (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'vervangen' WHERE user_id = $1 AND ouder_id = ANY($2::uuid[]) AND beeindigd_op IS NULL RETURNING id, profiel_id`, [u.id, vervangen])).rows;
      for (const k of weg) await audit(u.id, u.id, 'owner.tech.beeindigd', { profielId: k.profiel_id, activatie: k.id, reden: 'vervangen', ouder: vervangen[0] });
    }
    // De vervangen activering is voorbij: wat eraan hing (ontgrendeling van de browserextensie, extern bureaublad) meteen laten controleren.
    meldTechEinde(u.id);
  }
  await sys().query('UPDATE app.tech_profielen SET laatst_actief = now() WHERE user_id = $1', [u.id]);
  await audit(u.id, u.id, 'owner.tech.geactiveerd', {
    profielId: profiel.profielId, rollen: profiel.rollen, minuten: open ? null : duur, modus, reden: r, activatie: row.id,
    ...(sessie?.id ? { sessie: String(sessie.id) } : {}), ...(vervangen.length ? { vervangen } : {}),
  });
  return activatieUit(row);
}

/**
 * Beëindigt lopende activeringen van dit account bij het intrekken van sessies (audit 18.10.2026, punt 3).
 *  - zonder `doel`: alle activeringen (revoke-all, emergency, «вийти всюди»);
 *  - `doel.behalveSessieId`: alles behalve de activeringen van die ankersessie (revoke-others); rijen zonder sessie_id tellen als «alle»;
 *  - `doel.sessieId`: de activeringen van die ankersessie (+ oude rijen zonder sessie_id);
 *  - `doel.tabSessieId`: de activeringen van die tab-overlay (+ rijen zonder tab_sessie_id die bij `doel.sessieId` horen of oud zijn).
 * Elke beëindigde rij komt met de reden in het logboek (owner.tech.beeindigd). Faalt nooit hard: het intrekken van sessies gaat door.
 */
export async function beeindigenBijIntrekken(userId: string, reden: BeeindigReden, doel: { sessieId?: string | null; tabSessieId?: string | null; behalveSessieId?: string | null } = {}, actorId = userId): Promise<number> {
  try {
    let where = 'user_id = $1 AND beeindigd_op IS NULL';
    const params: unknown[] = [userId, reden];
    if (doel.tabSessieId) {
      params.push(String(doel.tabSessieId), doel.sessieId ? String(doel.sessieId) : '');
      where += ` AND (tab_sessie_id = $3 OR (tab_sessie_id IS NULL AND (sessie_id IS NULL OR sessie_id = $4)))`;
    } else if (doel.sessieId) {
      params.push(String(doel.sessieId));
      where += ` AND (sessie_id IS NULL OR sessie_id = $3)`;
    } else if (doel.behalveSessieId) {
      params.push(String(doel.behalveSessieId));
      where += ` AND (sessie_id IS NULL OR sessie_id <> $3)`;
    }
    const rows = (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = $2 WHERE ${where} RETURNING id, profiel_id, sessie_id, tab_sessie_id`, params)).rows;
    for (const r of rows) await audit(userId, actorId, 'owner.tech.beeindigd', { profielId: r.profiel_id, activatie: r.id, reden, ...(r.sessie_id ? { sessie: r.sessie_id } : {}), ...(r.tab_sessie_id ? { tabSessie: r.tab_sessie_id } : {}) });
    const k2 = await v2(userId);
    const n2 = k2 ? await k2.bijIntrekken(userId, reden, doel) : 0;
    if (rows.length) meldTechEinde(userId);
    return rows.length + n2;
  } catch (err) { console.error(`[tech-profiel] beëindigen bij intrekken (${reden}) mislukt:`, (err as Error).message); return 0; }
}

export type SessieTech = { activatie: string; modus: ActivatieModus; begin: number; eind: number; reden: string; tabSessieId: string | null };
/**
 * Lopende activeringen per aanmeldsessie, voor de sessielijst («Користувацький» / «Користувацький + технічний»).
 * Sleutel = sessie_id (ankersessie) of tab_sessie_id; `los` = lopende activeringen van vóór migratie 0060 zonder sessie.
 */
export async function activatiesPerSessie(userId: string): Promise<{ perSessie: Record<string, SessieTech>; perTab: Record<string, SessieTech>; los: number }> {
  const perSessie: Record<string, SessieTech> = {}, perTab: Record<string, SessieTech> = {};
  let los = 0;
  try {
    // v2: de technische sessie hangt aan de aanmeldsessie zelf.
    const k2 = await v2(userId);
    if (k2) {
      const rows = (await sys().query(`SELECT * FROM app.tech_ruimte_sessies r WHERE r.user_id = $1 AND r.beeindigd_op IS NULL AND r.grens_op > now() AND (r.modus <> 'tijd' OR r.eind_op > now()) ORDER BY r.begin_op DESC`, [userId])).rows;
      for (const r of rows) if (!perSessie[r.sessie_id]) perSessie[r.sessie_id] = { activatie: String(r.id), modus: r.modus === 'tijd' ? 'tijd' : r.modus === 'tot-site-uitloggen' ? 'tot-uitloggen' : 'tot-verlaten', begin: new Date(r.begin_op).getTime(), eind: new Date(r.eind_op ?? r.grens_op).getTime(), reden: String(r.reden), tabSessieId: null };
      return { perSessie, perTab, los };
    }
    const rows = (await sys().query(`SELECT a.* FROM app.tech_activaties a JOIN app.tech_profielen p ON p.user_id = a.user_id AND p.profiel_id = a.profiel_id AND p.ingetrokken_op IS NULL
      WHERE a.user_id = $1 AND a.beeindigd_op IS NULL AND a.eind_op > now() ORDER BY a.begin_op DESC`, [userId])).rows;
    for (const r of rows) {
      const a = activatieUit(r);
      const t: SessieTech = { activatie: a.id, modus: a.modus, begin: a.begin, eind: a.eind, reden: a.reden, tabSessieId: a.tabSessieId };
      if (a.tabSessieId && !perTab[a.tabSessieId]) perTab[a.tabSessieId] = t;
      if (a.sessieId && !perSessie[a.sessieId]) perSessie[a.sessieId] = t;
      if (!a.sessieId && !a.tabSessieId) los += 1;
    }
  } catch (err) { console.error('[tech-profiel] activaties per sessie mislukt:', (err as Error).message); }
  return { perSessie, perTab, los };
}


/**
 * Haak voor het VERLIEZEN VAN TECHNISCHE RECHTEN (niet voor het gewone beëindigen van een activering!). Migratie 0082:
 * backend/ruimte-scheiding.ts hangt hier zijn bevriezing aan, zodat het intrekken van een profiel op datzelfde moment alle
 * technische verbindingen intrekt en de technische gegevens onbereikbaar maakt. Een luisteraar mag nooit gooien; daarom vangt
 * meldRechtenVerlies alles op. Andere plekken waar rechten verdwijnen (rol gewijzigd, account geblokkeerd of verwijderd)
 * melden het rechtstreeks in backend/index.ts; de poort zelf controleert het bovendien bij elk verzoek.
 */
export type RechtenVerliesOorzaak = 'profiel-ingetrokken' | 'rol-weg' | 'account-geblokkeerd' | 'account-verwijderd';
const rechtenVerliesLuisteraars: Array<(userId: string, oorzaak: RechtenVerliesOorzaak, actorId: string) => void> = [];
export function bijTechRechtenVerlies(f: (userId: string, oorzaak: RechtenVerliesOorzaak, actorId: string) => void): void { rechtenVerliesLuisteraars.push(f); }
export function meldRechtenVerlies(userId: string, oorzaak: RechtenVerliesOorzaak, actorId = 'system'): void {
  for (const f of rechtenVerliesLuisteraars) { try { f(userId, oorzaak, actorId); } catch (err) { console.error('[tech-profiel] luisteraar rechtenverlies faalde:', (err as Error).message); } }
}

/** Haak voor wat aan een activering hangt (extern bureaublad, uitvoerder D): na elk beëindigen meteen opnieuw controleren. */
const techEindeLuisteraars: Array<(userId: string) => void> = [];
export function bijTechEinde(f: (userId: string) => void): void { techEindeLuisteraars.push(f); }
/** Voor backend/tech-ruimtes-kern.ts: na het beëindigen/pauzeren van een v2-sessie dezelfde haak. */
export function meldTechEindeExtern(userId: string): void { meldTechEinde(userId); }
function meldTechEinde(userId: string): void { for (const f of techEindeLuisteraars) { try { f(userId); } catch { /* luisteraar faalt: periodieke controle vangt het op */ } } }

/** 0110 (zone E): haak voor wat bij ELK uitloggen van dit account moet eindigen, ook zonder lopende activering (ontgrendelingen «до виходу з акаунта»). */
const uitlogLuisteraars: Array<(userId: string, tabContext?: string) => void> = [];
export function bijUitloggen(f: (userId: string, tabContext?: string) => void): void { uitlogLuisteraars.push(f); }
/** Uitloggen = het technisch profiel verlaten: beëindigt de activering(en) van dit account (alleen dit tabblad als tabContext is gegeven). */
export async function beeindigenBijUitloggen(userId: string, tabContext?: string): Promise<number> {
  for (const f of uitlogLuisteraars) { try { f(userId, tabContext); } catch { /* luisteraar faalt: de periodieke veeg vangt het op */ } }
  // v2: uitloggen van de site sluit ALTIJD de technische sessie (één tabblad: zie tech-ruimtes-kern.bijUitloggen).
  const k2 = await v2(userId);
  if (k2) await k2.bijUitloggen(userId, tabContext);
  try {
    const rows = tabContext && TAB_RE.test(tabContext)
      ? (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'uitgelogd' WHERE user_id = $1 AND tab_hash = $2 AND beeindigd_op IS NULL RETURNING id, profiel_id`, [userId, tabHash(tabContext)])).rows
      : (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'uitgelogd' WHERE user_id = $1 AND beeindigd_op IS NULL RETURNING id, profiel_id`, [userId])).rows;
    for (const r of rows) await audit(userId, userId, 'owner.tech.beeindigd', { profielId: r.profiel_id, activatie: r.id, reden: 'uitgelogd' });
    if (rows.length) meldTechEinde(userId);
    return rows.length;
  } catch (err) { console.error('[tech-profiel] beëindigen bij uitloggen mislukt:', (err as Error).message); return 0; }
}

/**
 * «Вийти з технічного профілю» (zelf verlaten). Sinds 0071: in ELK tabblad van deze aanmeldsessie (open, geërfd én gedeeld) — wie het
 * profiel verlaat, verlaat het in de hele browser; andere sessies/browsers blijven ongemoeid. Zonder sessie: alleen dit tabblad.
 */
export async function beeindigen(u: Gebruiker, tabContext: string, sessie?: Sessie | null): Promise<number> {
  if (!TAB_RE.test(tabContext)) return 0;
  const k2 = await v2(u.id);
  if (k2) return k2.beeindigen(u, sessie ? { id: String(sessie.id), createdAt: sessie.createdAt } : null);
  const h = tabHash(tabContext);
  const rows = sessie?.id
    ? (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'zelf' WHERE user_id = $1 AND beeindigd_op IS NULL AND (tab_hash = $2 OR sessie_id = $3) RETURNING id, profiel_id, tab_hash`,
      [u.id, h, String(sessie.id)])).rows
    : (await sys().query(`UPDATE app.tech_activaties SET beeindigd_op = now(), beeindigd_reden = 'zelf' WHERE user_id = $1 AND tab_hash = $2 AND beeindigd_op IS NULL RETURNING id, profiel_id, tab_hash`,
      [u.id, h])).rows;
  for (const r of rows) await audit(u.id, u.id, 'owner.tech.beeindigd', { profielId: r.profiel_id, activatie: r.id, reden: 'zelf', ...(r.tab_hash !== h ? { via: 'ander tabblad' } : {}) });
  if (rows.length) meldTechEinde(u.id);
  return rows.length;
}

/**
 * Open activering van deze sessie erven (0071). Een tabblad zonder eigen lopende activering krijgt een kopie van de lopende OPEN
 * activering («tot uitloggen» / «tot verlaten») van DEZELFDE ankersessie, zonder stap-op. Nooit:
 *  - zonder sessie, of van een andere sessie/browser (sessie_id moet gelijk zijn);
 *  - van een activering op tijd (die blijft van haar tabblad; zie `delen`);
 *  - als dit tabblad in deze sessie sinds het begin van die open activering al een eigen rij had die eindigde (verlopen, vervangen,
 *    verlaten): een verlopen tabblad wordt niet stil opnieuw technisch.
 * Komt in het logboek als owner.tech.geerfd («успадковано вкладкою»).
 */
export async function ervenOpen(u: Gebruiker, tabContext: string, sessie?: Sessie | null): Promise<Activatie | null> {
  if (!TAB_RE.test(tabContext) || !sessie?.id) return null;
  // v2: geen erven — elk tabblad van dezelfde aanmelding hoort vanzelf bij de technische sessie (actieveActivatie registreert het).
  if (await v2(u.id)) return null;
  // Migratie 0080: alleen als de gebruiker dit zelf aanzette. Standaard is een nieuw tabblad een GEBRUIKERSTABBLAD, zodat de AI in
  // zijn privéruimte er mag lezen en werken (een technisch tabblad is voor haar altijd verboden).
  if (!(await ervenAan(u.id))) return null;
  const h = tabHash(tabContext), sid = String(sessie.id);
  const bron = (await sys().query(`SELECT a.* FROM app.tech_activaties a JOIN app.tech_profielen p ON p.user_id = a.user_id AND p.profiel_id = a.profiel_id AND p.ingetrokken_op IS NULL
     WHERE a.user_id = $1 AND a.sessie_id = $2 AND a.tab_hash <> $3 AND a.modus <> 'tijd' AND a.beeindigd_op IS NULL AND a.eind_op > now()
     ORDER BY (a.herkomst = 'eigen') DESC, a.begin_op DESC LIMIT 1`, [u.id, sid, h])).rows[0];
  if (!bron) return null;
  const ouder = bron.herkomst === 'eigen' || !bron.ouder_id ? bron.id : bron.ouder_id;
  // Eén statement: alleen invoegen als dit tabblad in deze sessie geen lopende rij heeft en geen rij die eindigde ná het begin van de bron.
  const row = (await sys().query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op, modus, sessie_id, tab_sessie_id, ouder_id, herkomst)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'geerfd'
     WHERE NOT EXISTS (SELECT 1 FROM app.tech_activaties x WHERE x.user_id = $1 AND x.tab_hash = $3
       AND ((x.beeindigd_op IS NULL AND x.eind_op > now()) OR (x.sessie_id = $8 AND x.beeindigd_op >= $11)))
     RETURNING *`, [u.id, bron.profiel_id, h, bron.rollen, bron.reden, bron.eind_op, bron.modus, sid, sessie.tabSessieId ? String(sessie.tabSessieId) : null, ouder, bron.begin_op])).rows[0];
  if (!row) return null;
  await audit(u.id, u.id, 'owner.tech.geerfd', { profielId: row.profiel_id, activatie: row.id, ouder, modus: row.modus, sessie: sid, herkomst: 'geerfd' });
  return activatieUit(row);
}

// ---------------------------------------------------------------- nieuwe tabbladen: technisch of gebruiker (migratie 0080)
/**
 * Mag een nieuw tabblad een open activering erven? Keuze van de gebruiker zelf; ontbreekt het profiel of de kolom (migratie nog
 * niet gedraaid), dan NEE — de veilige richting: een nieuw tabblad blijft een gebruikerstabblad en de AI van de gebruiker werkt er.
 */
export async function ervenAan(userId: string): Promise<boolean> {
  try {
    const r = (await sys().query('SELECT erven_nieuwe_tabbladen AS aan FROM app.tech_profielen WHERE user_id = $1 AND ingetrokken_op IS NULL', [userId])).rows[0];
    return r?.aan === true;
  } catch { return false; }
}
/** De keuze zetten (alleen voor zichzelf; de route vraagt een sessie). Komt in het logboek als owner.tech.erven_keuze. */
export async function ervenZetten(u: Gebruiker, aan: unknown): Promise<Profiel> {
  if (typeof aan !== 'boolean') fout('ERVEN_ONGELDIG');
  const p = await profielVan(u);
  if (!p || p.ingetrokkenOp) fout('GEEN_TECH_PROFIEL', 403);
  const r = (await sys().query('UPDATE app.tech_profielen SET erven_nieuwe_tabbladen = $2, gewijzigd_op = now() WHERE user_id = $1 RETURNING *', [u.id, aan])).rows[0];
  await audit(u.id, u.id, 'owner.tech.erven_keuze', { profielId: (p as Profiel).profielId, wijziging: { van: (p as Profiel).ervenNieuweTabbladen, naar: aan as boolean } });
  return profielUit(r);
}

/**
 * Activering op tijd delen met een NIEUW tabblad dat vanuit dit tabblad is geopend (0071). Het bron-tabblad roept dit aan (bewijst
 * zichzelf met zijn eigen tabcontext); het doel krijgt een kopie met HETZELFDE einde. Alleen: dezelfde sessie, bron actief, doel
 * geldig en anders dan de bron, doel had in deze sessie nog nooit een rij (nieuw tabblad). Logboek: owner.tech.gedeeld.
 */
export async function delen(u: Gebruiker, bronTab: string, doelTab: string, sessie?: Sessie | null): Promise<Activatie> {
  if (!TAB_RE.test(bronTab) || !TAB_RE.test(String(doelTab || ''))) fout('TAB_ONGELDIG');
  if (bronTab === doelTab) fout('TAB_ONGELDIG');
  if (!sessie?.id) fout('SESSIE_VEREIST', 403);
  if (await v2(u.id)) fout('GEBRUIK_RUIMTES_V2', 409);
  const bron = await actieveActivatie(u.id, bronTab, sessie);
  if (!bron || bron.sessieId !== String((sessie as Sessie).id)) fout('TECH_NIET_ACTIEF', 403);
  const b = bron as Activatie;
  const row = (await sys().query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op, modus, sessie_id, tab_sessie_id, ouder_id, herkomst)
     SELECT a.user_id, a.profiel_id, $3, a.rollen, a.reden, a.eind_op, a.modus, a.sessie_id, NULL, a.id, 'gedeeld' FROM app.tech_activaties a
     WHERE a.id = $2 AND a.user_id = $1 AND a.beeindigd_op IS NULL AND a.eind_op > now()
       AND NOT EXISTS (SELECT 1 FROM app.tech_activaties x WHERE x.user_id = $1 AND x.tab_hash = $3 AND (x.beeindigd_op IS NULL OR x.sessie_id = a.sessie_id))
     RETURNING *`, [u.id, b.id, tabHash(doelTab)])).rows[0];
  if (!row) fout('DOEL_NIET_NIEUW', 409);
  await audit(u.id, u.id, 'owner.tech.gedeeld', { profielId: row.profiel_id, activatie: row.id, ouder: b.id, modus: row.modus, eind: new Date(row.eind_op).toISOString(), herkomst: 'gedeeld' });
  return activatieUit(row);
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
     WHERE tbl = 'users' AND lower(data->>'email') = $1 AND COALESCE((data->>'deletedAt')::numeric, 0) = 0 AND COALESCE((data->>'retiredAt')::numeric, 0) = 0 LIMIT 2`, [e])).rows;
  // Audit-fix 18.10.2026: gepensioneerde accounts tellen niet mee; twee actieve accounts met hetzelfde adres (ander Google-subject) → eigen code, geen misleidend 404.
  if (r.length === 0) fout('GEBRUIKER_NIET_GEVONDEN', 404);
  if (r.length > 1) fout('EMAIL_NIET_UNIEK', 409);
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
  await kern().then((k) => k.profielWeg(doel.id)).catch(() => 0);
  meldTechEinde(doel.id);
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
  await kern().then((k) => k.profielWeg(t.id)).catch(() => 0);
  if (weg) meldTechEinde(t.id);
  await audit(t.id, actor.id, 'owner.tech.ingetrokken', { door: actor.email || actor.id, reden: r, beeindigdeActivaties: weg, viaActivatie: a.id });
  if (t.id !== actor.id) await audit(actor.id, actor.id, 'owner.tech.ingetrokken', { van: t.email, reden: r, viaActivatie: a.id });
  // 0082: het profiel is weg, dus de technische ruimte van deze mens wordt op dit moment bevroren (alle technische
  // verbindingen ingetrokken; de gegevens blijven heel maar onbereikbaar tot de servereigenaar beslist).
  meldRechtenVerlies(t.id, 'profiel-ingetrokken', actor.id);
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
