// Gescheiden gegevensruimtes: OPSLAG, POORT EN BEVRIEZING (migratie 0082, model in shared/ruimte-scheiding.ts).
//
// DE POORT IS HET ENIGE WAT ANDERE DIENSTEN NODIG HEBBEN:
//
//     import { gegevensLade } from './ruimte-scheiding';
//
//     const besluit = await gegevensLade({ userId: auth.user.id, rol: auth.user.role, tabContext: body.tabContext, dienst: 'mail' });
//     if (!besluit.ok) return error(besluit.code, 403);           // uitleg in besluit.uitleg (uk + nl), nooit een leeg scherm
//     const lade = besluit.lade;                                   // { userId, ruimte: 'prive' | 'technisch' }
//     const rijen = await q(`SELECT * FROM app.mail_berichten WHERE ${sqlLadeWaar('ruimte', lade, 1)}`, [lade.userId]);
//     await db.add('cloud_items', [{ ...nieuw, ...ladeVelden(lade) }]);
//
// Drie dingen om te onthouden:
//  1. de ruimte komt ALTIJD uit de live berekening hieronder (gegevensRuimteVeilig: rol, status, profiel en de lopende
//     activering uit de database). De aanroeper kan haar niet meegeven; hij kan alleen zijn eigen HERKOMST noemen (het
//     tabblad, of de ruimte van zijn AI-verbinding) en die kan de lade uitsluitend VERKLEINEN;
//  1b. twee gescheiden vragen, bewust niet in één functie: «heeft deze mens technische toegang (en dus een eigen lade)»
//     staat hier (technischeRechten); «welke technische HULPMIDDELEN mag een AI zien» blijft in backend/ai-ruimte-poort.ts
//     (effectieveRuimte, nog altijd alleen de servereigenaar). Een eigen lade geeft nul nieuwe mogelijkheden;
//  2. een rij zonder `ruimte` is PERSOONLIJK. Daarom gaat er bij de overstap niets verloren en verandert er niets voor wie geen
//     technisch profiel heeft;
//  3. elke twijfel (geen keuze, dienst uit, bevroren, onbekende dienst, databasefout) is een WEIGERING met uitleg — nooit stil
//     de andere lade.
//
// Bevriezing (beslissing 3 van de eigenaar): zodra iemand zijn technische rechten kwijt is — rol niet meer 'owner', technisch
// profiel ingetrokken, account geblokkeerd of verwijderd — worden ALLE technische verbindingen op datzelfde moment ingetrokken
// (dezelfde soort ingreep als «Стоп» in backend/ai-toestemmingen.ts → stopAll, maar precies op de technische kant) en gaat elke dienst
// naar 'bevroren'. De gegevens blijven heel en zijn onbereikbaar tot de eigenaar van de server beslist. Twee wegen leiden naar
// die bevriezing, en ze dekken elkaar af:
//   • actief: rechtenVerloren() wordt aangeroepen op elke plek waar rechten verdwijnen (tech-profiel.intrekken,
//     accountSessiesIntrekken bij blokkeren/verwijderen, het wijzigen van een rol);
//   • passief: de poort zelf controleert bij ELK verzoek de live rechten en bevriest wat nog niet bevroren was. Ook als een
//     nieuwe weg om rechten te verliezen ooit vergeten wordt, geeft de poort dus geen gegevens meer.
import { getPool } from '../server/platform/pg';
import {
  DEELBARE_DIENSTEN, JOURNAAL, STAND_BIJ_KEUZE, dienstOf, keuzeOf, ladeVoor, magEigenLade, overgang, oorzaakOf, standOf,
  type DeelbareDienst, type DienstStand, type Keuze, type Lade, type LadeBesluit, type Oorzaak, type Overgang,
} from '../shared/ruimte-scheiding';
import type { AiRuimte } from '../shared/ai-ruimte';
import { journaalSchrijf } from './beheer-journaal';
import { actieveActivatie, bijTechRechtenVerlies, lopendeActivatie, TAB_RE } from './tech-profiel';

const sys = () => getPool('systeem');

export class RuimteFout extends Error { constructor(public code: string, public status = 400) { super(code); } }
/** Expliciet `never`-type op de variabele: zo weet TypeScript dat na een `fout(...)` niets meer volgt (geen `as`-casts nodig). */
const fout: (code: string, status?: number) => never = (code, status = 400) => { throw new RuimteFout(code, status); };

export type DienstRij = {
  dienst: DeelbareDienst; stand: DienstStand; vorigeStand: DienstStand; gewijzigdOp: number;
  bevestigdDoor: string; bevrorenOp: number | null; bevrorenOorzaak: Oorzaak | '';
  /** Laatste besluit van de servereigenaar over een bevroren lade, met het verslag van wat er feitelijk gebeurde (0087). */
  besluit: Besluit | ''; besluitOp: number | null; besluitDoor: string; verslag: BesluitVerslag | null;
};
const rijUit = (r: Record<string, unknown>): DienstRij => ({
  dienst: dienstOf(r.dienst) as DeelbareDienst,
  stand: standOf(r.stand),
  vorigeStand: standOf(r.vorige_stand),
  gewijzigdOp: r.gewijzigd_op ? new Date(String(r.gewijzigd_op)).getTime() : 0,
  bevestigdDoor: String(r.bevestigd_door ?? ''),
  bevrorenOp: r.bevroren_op ? new Date(String(r.bevroren_op)).getTime() : null,
  bevrorenOorzaak: r.bevroren_oorzaak ? oorzaakOf(r.bevroren_oorzaak) : '',
  besluit: (['teruggeven', 'overdragen', 'verwijderen'] as const).find((b) => b === String(r.besluit ?? '')) ?? '',
  besluitOp: r.besluit_op ? new Date(String(r.besluit_op)).getTime() : null,
  besluitDoor: String(r.besluit_door ?? ''),
  verslag: r.verslag && typeof r.verslag === 'object' && Object.keys(r.verslag as object).length ? r.verslag as BesluitVerslag : null,
});

// ------------------------------------------------------------------------------------------------ de eenmalige keuze
export type KeuzeRij = { keuze: Keuze; op: number; door: string };
/** De keuze van deze mens, of null («nog niet gekozen» → technische ruimte leeg). Een databasefout geeft ook null: minste rechten. */
export async function keuzeVan(userId: string): Promise<KeuzeRij | null> {
  if (!userId) return null;
  try {
    const r = (await sys().query('SELECT gekozen, gekozen_op, gekozen_door FROM app.ruimte_keuze WHERE user_id = $1', [userId])).rows[0];
    const k = keuzeOf(r?.gekozen);
    return k ? { keuze: k, op: new Date(String(r.gekozen_op)).getTime(), door: String(r.gekozen_door ?? '') } : null;
  } catch (err) { console.error('[ruimte-scheiding] keuze onleesbaar, terug naar «niet gekozen»:', (err as Error).message); return null; }
}

/**
 * De keuze ÉÉN KEER vastleggen (beslissing 2). Daarna is zij niet meer te «herkiezen»: wat erna verandert, verandert per dienst,
 * want dat is de plek waar bevestiging en logboek horen. De keuze vult alleen de beginstand van elke dienst, en nooit over een
 * bevroren dienst heen.
 */
export async function keuzeZetten(userId: string, ruw: unknown, doorId: string): Promise<{ keuze: KeuzeRij; standen: DienstRij[] }> {
  const k = keuzeOf(ruw) ?? fout('KEUZE_ONGELDIG');
  if (!userId) fout('GEEN_GEBRUIKER', 403);
  const bestaand = await keuzeVan(userId);
  if (bestaand) fout('KEUZE_AL_GEMAAKT', 409);
  const beginstand = STAND_BIJ_KEUZE[k as Keuze];
  await sys().query(`INSERT INTO app.ruimte_keuze (user_id, gekozen, gekozen_door) VALUES ($1, $2, $3)
    ON CONFLICT (user_id) DO NOTHING`, [userId, k, doorId || userId]);
  // Beginstand per dienst; een reeds bevroren dienst blijft bevroren (daarover beslist alleen de servereigenaar).
  for (const d of DEELBARE_DIENSTEN) {
    await sys().query(`INSERT INTO app.ruimte_dienst_stand (user_id, dienst, stand, vorige_stand, bevestigd_door)
      VALUES ($1, $2, $3, 'uit', $4)
      ON CONFLICT (user_id, dienst) DO UPDATE SET stand = EXCLUDED.stand, gewijzigd_op = now(), bevestigd_door = EXCLUDED.bevestigd_door
      WHERE app.ruimte_dienst_stand.stand <> 'bevroren'`, [userId, d, beginstand, doorId || userId]);
  }
  await journaalSchrijf({
    actie: JOURNAAL.keuze, actor: doorId || userId, eigenaar: userId, resultaat: 'success',
    doel: { soort: 'ruimte', id: userId, naam: 'technische ruimte' }, wijziging: { van: null, naar: k },
    details: { beginstand, diensten: DEELBARE_DIENSTEN.length },
  });
  return { keuze: (await keuzeVan(userId)) as KeuzeRij, standen: await standenVan(userId) };
}

// ------------------------------------------------------------------------------------------------ de standen per dienst
/** Alle diensten met hun stand. Ontbrekende rij = 'uit'; een databasefout geeft overal 'uit' (minste rechten). */
export async function standenVan(userId: string): Promise<DienstRij[]> {
  const leeg = (d: DeelbareDienst): DienstRij => ({ dienst: d, stand: 'uit', vorigeStand: 'uit', gewijzigdOp: 0, bevestigdDoor: '', bevrorenOp: null, bevrorenOorzaak: '', besluit: '', besluitOp: null, besluitDoor: '', verslag: null });
  if (!userId) return DEELBARE_DIENSTEN.map(leeg);
  try {
    const rows = (await sys().query('SELECT * FROM app.ruimte_dienst_stand WHERE user_id = $1', [userId])).rows;
    const per = new Map(rows.map((r) => [String(r.dienst), rijUit(r)]));
    return DEELBARE_DIENSTEN.map((d) => per.get(d) ?? leeg(d));
  } catch (err) {
    console.error('[ruimte-scheiding] standen onleesbaar, alles «uit»:', (err as Error).message);
    return DEELBARE_DIENSTEN.map(leeg);
  }
}
/** De stand van één dienst. Onbekende dienst of fout → 'uit'. */
export async function standVan(userId: string, dienst: unknown): Promise<DienstStand> {
  const d = dienstOf(dienst);
  if (!d || !userId) return 'uit';
  try {
    const r = (await sys().query('SELECT stand FROM app.ruimte_dienst_stand WHERE user_id = $1 AND dienst = $2', [userId, d])).rows[0];
    return standOf(r?.stand);
  } catch (err) { console.error('[ruimte-scheiding] stand onleesbaar, «uit»:', (err as Error).message); return 'uit'; }
}

// ------------------------------------------------------------------------------------------------ live rechten
export type Rechten = { ok: true; rollen: string[]; profielId: string; ikEigenaar: boolean } | { ok: false; oorzaak: Oorzaak };
/**
 * VRAAG (a): HEEFT DEZE MENS TECHNISCHE TOEGANG, en dus recht op een eigen gegevenslade?
 *
 * Tot 20.10.2026 stond hier «de rol moet 'owner' zijn». Dat was te smal: de opdracht van de eigenaar gaat over IEDEREEN met
 * technische toegang («користувачі, які на сайті мають технічний доступ, мають розділятися»), niet alleen over hemzelf. De
 * grens zit daarom nu op het technische PROFIEL, niet op de accountrol:
 *   • het account bestaat en is goedgekeurd (geblokkeerd/verwijderd → geen rechten);
 *   • er is een technisch profiel dat niet is ingetrokken (app.tech_profielen, backend/tech-profiel.ts);
 *   • dat profiel heeft minstens één rol die in de technische ruimte WERKT (shared/ruimte-scheiding.ts → magEigenLade;
 *     vandaag: tester, ontwikkelaar, beheerder, eigenaar). Alleen-lezen rollen (ondersteuning, auditor) maken daar geen eigen
 *     gegevens en krijgen dus ook geen lade.
 *
 * Dit zegt NIETS over vraag (b) — wat iemand in de technische ruimte mag doen. Releases, serverdeur, terminals, SSH en
 * gebruikersbeheer blijven volledig bij shared/tech-rollen.ts en de poorten die die mogelijkheden afdwingen; een eigen lade
 * voegt daar geen enkele mogelijkheid aan toe. `ikEigenaar` staat er alleen bij omdat BESLISSINGEN OVER BEVROREN GEGEVENS
 * voorbehouden blijven aan de eigenaar van de server.
 *
 * Een databasefout geeft «geen rechten»: de veilige richting.
 */
export async function technischeRechten(userId: string): Promise<Rechten> {
  if (!userId) return { ok: false, oorzaak: 'rol-weg' };
  const u = (await sys().query("SELECT data->>'role' AS rol, data->>'status' AS status FROM app.records WHERE tbl = 'users' AND id = $1", [userId])).rows[0];
  if (!u) return { ok: false, oorzaak: 'account-verwijderd' };
  const status = String(u.status ?? '');
  if (status === 'deleted') return { ok: false, oorzaak: 'account-verwijderd' };
  if (status !== 'approved') return { ok: false, oorzaak: 'account-geblokkeerd' };
  const p = (await sys().query('SELECT profiel_id, rollen FROM app.tech_profielen WHERE user_id = $1 AND ingetrokken_op IS NULL', [userId])).rows[0];
  if (!p) return { ok: false, oorzaak: 'profiel-ingetrokken' };
  const ikEigenaar = String(u.rol ?? '') === 'owner';
  // De rol 'eigenaar' in een profiel telt ALLEEN zolang het account werkelijk de eigenaarsrol heeft. Zakt die rol (of werd
  // hij ooit verkeerd gezet), dan valt die rol weg; blijft er dan niets over, dan is dat 'rol-weg' en wordt de lade bevroren.
  // Zo blijft «rol gewijzigd» een echte weg naar rechtenverlies, ook nu technische toegang aan het PROFIEL hangt.
  const rollen = (Array.isArray(p.rollen) ? (p.rollen as unknown[]).map((r) => String(r)) : []).filter((r) => r !== 'eigenaar' || ikEigenaar);
  // Een profiel dat alleen mag LEZEN (ondersteuning, auditor) heeft geen eigen lade: 'rol-weg' is dan de juiste oorzaak,
  // ook als het profiel zelf geldig is — er is immers geen rol meer die een lade rechtvaardigt.
  if (!magEigenLade(rollen)) return { ok: false, oorzaak: 'rol-weg' };
  return { ok: true, rollen, profielId: String(p.profiel_id), ikEigenaar };
}

/**
 * VRAAG: KOMT DIT VERZOEK UIT DE TECHNISCHE RUIMTE? Twee herkomsten, en beide kunnen de technische lade alleen VERKLEINEN,
 * nooit vergroten:
 *   • `tabContext` — een verzoek van de site: dan geldt de lopende activering van DAT tabblad (backend/tech-profiel.ts),
 *     precies zoals het menu en het uiterlijk dat al doen (ownerMenuRuimte, shared/uiterlijk.ts);
 *   • `aiRuimte` — een aanroep van een AI-connector, die geen tabblad heeft. De connector bepaalt de ruimte van de
 *     VERBINDING zelf met backend/ai-ruimte-poort.ts → effectieveRuimte (ongewijzigd: technische HULPMIDDELEN blijven bij de
 *     eigenaar). Zegt hij 'prive', dan is deze lade persoonlijk — ook als de mens zelf een technisch profiel open heeft; zo
 *     leest een privé-AI nooit de technische lade. Zegt hij 'technisch', dan controleert de server hier alsnog zelf de
 *     rechten én een lopende activering.
 * Zonder herkomst: 'prive'. Elke fout: 'prive'.
 */
export async function gegevensRuimteVeilig(userId: string, herkomst: { tabContext?: string | null; aiRuimte?: AiRuimte | null } = {}): Promise<AiRuimte> {
  if (!userId) return 'prive';
  const tab = String(herkomst.tabContext ?? '');
  const viaTab = TAB_RE.test(tab);
  if (!viaTab && herkomst.aiRuimte !== 'technisch') return 'prive';
  try {
    const rechten = await technischeRechten(userId);
    if (!rechten.ok) return 'prive';
    const a = viaTab ? await actieveActivatie(userId, tab) : await lopendeActivatie(userId);
    // Niet alleen «er loopt iets», maar: loopt er iets met een rol die een eigen lade rechtvaardigt?
    return a && magEigenLade(a.rollen) ? 'technisch' : 'prive';
  } catch (err) { console.error('[ruimte-scheiding] gegevensruimte onbepaalbaar, terug naar prive:', (err as Error).message); return 'prive'; }
}

// ------------------------------------------------------------------------------------------------ DE POORT
export type LadeVraag = {
  userId: string;
  /** Alleen een hint uit de sessie; de poort leest rol, status en profiel ZELF uit de database (een sessie kan oud zijn). */
  rol?: string | null;
  /** Verzoek van de site: het tabblad waarvan de technische activering geldt. */
  tabContext?: string | null;
  /** Aanroep van een AI-connector: de ruimte van de VERBINDING (effectieveRuimte). Kan alleen verkleinen, nooit vergroten. */
  aiRuimte?: AiRuimte | null;
  dienst: unknown;
};
/**
 * Uit welke lade mag dit verzoek lezen en schrijven? Zie de kop van dit bestand voor het voorbeeld.
 * Geeft {ok:true, lade} of {ok:false, code, uitleg} — nooit een uitzondering, nooit stil de verkeerde lade.
 */
export async function gegevensLade(v: LadeVraag): Promise<LadeBesluit> {
  const dienst = dienstOf(v.dienst);
  if (!dienst) return ladeVoor({ userId: v.userId, ruimte: 'prive', dienst: v.dienst, stand: 'uit', keuzeGemaakt: false });
  // De ruimte komt NOOIT uit het verzoek: gegevensRuimteVeilig leest rol, status, profiel en de lopende activering zelf uit
  // de database. Een sessie kan oud zijn (wie net zijn rol verloor draagt die rol nog mee), dus niets wordt hier geloofd.
  let ruimte: 'prive' | 'technisch' = await gegevensRuimteVeilig(v.userId, { tabContext: v.tabContext, aiRuimte: v.aiRuimte });
  if (ruimte === 'prive') {
    // Niet in de technische ruimte? Dan de persoonlijke lade — maar eerst: zijn de rechten wéG (niet alleen «profiel niet
    // actief»)? Dan hoort alles van de technische kant bevroren te zijn, ook als niemand dat eerder meldde.
    void naVerliesControleren(v.userId);
    return ladeVoor({ userId: v.userId, ruimte: 'prive', dienst, stand: 'eigen', keuzeGemaakt: true });
  }
  const keuze = await keuzeVan(v.userId);
  const stand = await standVan(v.userId, dienst);
  const besluit = ladeVoor({ userId: v.userId, ruimte, dienst, stand, keuzeGemaakt: !!keuze });
  if (!besluit.ok) {
    await journaalSchrijf({
      actie: JOURNAAL.geweigerd, actor: v.userId, eigenaar: v.userId, resultaat: 'geweigerd',
      doel: { soort: 'dienst', id: dienst }, reden: besluit.code, details: { ruimte, stand },
    });
  }
  return besluit;
}

/** Stille achtergrondcontrole: rechten weg én nog iets niet bevroren → nu bevriezen. Faalt nooit hard. */
async function naVerliesControleren(userId: string): Promise<void> {
  try {
    if (!userId) return;
    const iets = (await sys().query(`SELECT 1 FROM app.ruimte_dienst_stand WHERE user_id = $1 AND stand IN ('eigen', 'gedeeld') LIMIT 1`, [userId])).rows[0];
    if (!iets) return;
    const r = await technischeRechten(userId);
    if (r.ok) return;
    await rechtenVerloren(userId, r.oorzaak, 'system');
  } catch (err) { console.error('[ruimte-scheiding] controle na rechtenverlies mislukt:', (err as Error).message); }
}

// ------------------------------------------------------------------------------------------------ verbinden en ontkoppelen
export type ZetUitkomst = { overgang: Overgang & { ok: true }; standen: DienstRij[]; verslag?: BesluitVerslag };
/**
 * Eén dienst verbinden of ontkoppelen (beslissing 4). `stapOpGedaan` moet true zijn voor alles wat VERBINDT; de route vraagt die
 * bevestiging (backend/stap-op.ts) en zet de actie in de lijst «altijd vragen», zodat een onthouden browser hier nooit volstaat.
 * Ontkoppelen gaat onmiddellijk, zonder bevestiging. Elke uitkomst komt in het logboek.
 */
export async function dienstZetten(userId: string, dienst: unknown, actie: unknown, opties: { actorId?: string; stapOpGedaan?: boolean } = {}): Promise<ZetUitkomst> {
  const d = dienstOf(dienst) ?? fout('DIENST_ONBEKEND');
  if (!userId) fout('GEEN_GEBRUIKER', 403);
  const actor = opties.actorId || userId;
  const huidig = await standVan(userId, d);
  const keuze = await keuzeVan(userId);
  const o = overgang(huidig, actie, { keuzeGemaakt: !!keuze });
  if (!o.ok) return fout(o.fout, o.fout === 'BEVROREN' || o.fout === 'KEUZE_ONTBREEKT' ? 403 : 409);
  if (o.eigenaarsBesluit) fout('EIGENAARSBESLUIT_APART', 400); // via eigenaarsBesluit(), met de controles die daar horen
  if (o.stapOp && opties.stapOpGedaan !== true) fout('STEP_UP_REQUIRED', 403);
  // Losmaken trekt eerst de technische verbindingen van DEZE dienst in; pas daarna verandert de stand. Nooit omgekeerd:
  // anders bestond er een ogenblik waarin de stand «uit» zei en de verbinding nog leefde.
  if (o.naar === 'uit') await dienstVerbindingenIntrekken(userId, d, actor);
  await sys().query(`INSERT INTO app.ruimte_dienst_stand (user_id, dienst, stand, vorige_stand, gewijzigd_op, bevestigd_door, bevroren_op, bevroren_oorzaak)
    VALUES ($1, $2, $3, $4, now(), $5, NULL, '')
    ON CONFLICT (user_id, dienst) DO UPDATE SET stand = EXCLUDED.stand, vorige_stand = EXCLUDED.vorige_stand, gewijzigd_op = now(),
      bevestigd_door = EXCLUDED.bevestigd_door, bevroren_op = NULL, bevroren_oorzaak = ''`, [userId, d, o.naar, o.van, actor]);
  await journaalSchrijf({
    actie: o.naar === 'uit' ? JOURNAAL.ontkoppeld : JOURNAAL.verbonden, actor, eigenaar: userId, resultaat: 'success',
    doel: { soort: 'dienst', id: d, naam: d }, wijziging: { van: o.van, naar: o.naar },
    details: { actie: o.actie, bevestiging: o.stapOp ? 'step-up' : 'geen' },
  });
  return { overgang: o, standen: await standenVan(userId) };
}

// ------------------------------------------------------------------------------------------------ bevriezen bij rechtenverlies
/**
 * HET ENIGE PAD voor «technische rechten weg» (beslissing 3). Trekt alle technische verbindingen van deze mens in en zet elke
 * dienst die 'eigen' of 'gedeeld' was op 'bevroren', met de vorige stand bewaard. Idempotent: twee keer aanroepen verandert
 * niets meer. Gooit nooit: het intrekken van rechten mag hier niet op stuklopen.
 */
export async function rechtenVerloren(userId: string, ruweOorzaak: unknown, actorId = 'system'): Promise<{ bevroren: number; verbindingen: number }> {
  const oorzaak = oorzaakOf(ruweOorzaak);
  if (!userId) return { bevroren: 0, verbindingen: 0 };
  let verbindingen = 0;
  try { verbindingen = await technischeVerbindingenIntrekken(userId, actorId, oorzaak); }
  catch (err) { console.error('[ruimte-scheiding] technische verbindingen intrekken mislukt:', (err as Error).message); }
  let bevroren = 0;
  try {
    const rows = (await sys().query(`UPDATE app.ruimte_dienst_stand SET vorige_stand = stand, stand = 'bevroren', gewijzigd_op = now(),
      bevroren_op = now(), bevroren_oorzaak = $2 WHERE user_id = $1 AND stand IN ('eigen', 'gedeeld') RETURNING dienst, vorige_stand`, [userId, oorzaak])).rows;
    bevroren = rows.length;
    for (const r of rows) {
      await journaalSchrijf({
        actie: JOURNAAL.bevroren, actor: actorId, eigenaar: userId, resultaat: 'geweigerd',
        doel: { soort: 'dienst', id: String(r.dienst), naam: String(r.dienst) },
        wijziging: { van: standOf(r.vorige_stand), naar: 'bevroren' }, reden: oorzaak,
        details: { verbindingen },
      });
    }
  } catch (err) { console.error('[ruimte-scheiding] bevriezen mislukt:', (err as Error).message); }
  return { bevroren, verbindingen };
}

/**
 * Alle verbindingen van de TECHNISCHE ruimte intrekken — dezelfde ingreep als «Стоп» (backend/ai-toestemmingen.ts → stopAll), maar
 * alleen op de technische kant, zodat de persoonlijke ruimte van dezelfde mens blijft werken:
 *   app.agents (ruimte='technisch')      technische pc-/browseragenten uit en ingetrokken; hun grants ingetrokken;
 *   app.mcp_oauth_tokens (technisch)     technische connectorkoppelingen;
 *   app.mcp_console_tokens (technisch)   technische agenttokens;
 *   app.externe_mcp_verbinding (tech)    vreemde MCP-servers in de technische ruimte (migratie 0078);
 *   app.agent_commands                   wachtende opdrachten van die agenten afgewezen.
 * De connector kijkt bij elke aanroep opnieuw in de database, dus dit werkt op hetzelfde moment.
 */
export async function technischeVerbindingenIntrekken(userId: string, actorId = 'system', reden = 'rol-weg'): Promise<number> {
  const q = (sql: string, params: unknown[]) => sys().query(sql, params);
  let aantal = 0;
  const agenten = (await q(`SELECT id FROM app.agents WHERE user_id = $1 AND ruimte = 'technisch' AND revoked_at IS NULL`, [userId])).rows.map((r: { id: unknown }) => String(r.id));
  if (agenten.length) {
    aantal += (await q(`UPDATE app.ai_grants SET revoked_at = now() WHERE user_id = $1 AND agent_id = ANY($2::uuid[]) AND revoked_at IS NULL`, [userId, agenten])).rowCount ?? 0;
    aantal += (await q(`UPDATE app.agent_commands SET status = 'rejected', decided_at = now(), finished_at = now(), result = '{"error":"technical space frozen"}'::jsonb
      WHERE user_id = $1 AND agent_id = ANY($2::uuid[]) AND status IN ('pending_approval', 'approved')`, [userId, agenten])).rowCount ?? 0;
    aantal += (await q(`UPDATE app.agents SET browser_enabled = false, armed_until = NULL, revoked_at = now() WHERE user_id = $1 AND id = ANY($2::uuid[]) AND revoked_at IS NULL`, [userId, agenten])).rowCount ?? 0;
  }
  aantal += (await q(`UPDATE app.mcp_oauth_tokens SET revoked_at = now() WHERE user_id = $1 AND ruimte = 'technisch' AND revoked_at IS NULL`, [userId])).rowCount ?? 0;
  aantal += (await q(`UPDATE app.mcp_console_tokens SET revoked_at = now() WHERE user_id = $1 AND ruimte = 'technisch' AND revoked_at IS NULL`, [userId])).rowCount ?? 0;
  aantal += (await q(`UPDATE app.externe_mcp_verbinding SET actief = false, bijgewerkt_op = now() WHERE user_id = $1 AND ruimte = 'technisch' AND actief`, [userId])).rowCount ?? 0;
  if (aantal) console.warn(`[ruimte-scheiding] technische verbindingen ingetrokken (${reden}) voor ${userId}: ${aantal}`);
  return aantal;
}

/** Hetzelfde, maar voor ÉÉN dienst bij het losmaken. Alleen 'ai' heeft vandaag eigen verbindingen; de rest heeft er geen. */
async function dienstVerbindingenIntrekken(userId: string, dienst: DeelbareDienst, actorId: string): Promise<number> {
  if (dienst !== 'ai') return 0;
  try { return await technischeVerbindingenIntrekken(userId, actorId, 'profiel-ingetrokken'); }
  catch (err) { console.error('[ruimte-scheiding] verbindingen van dienst intrekken mislukt:', (err as Error).message); return 0; }
}

// ------------------------------------------------------------------------------------------------ uitvoerders per dienst
/**
 * HOE EEN DIENST ZIJN BEVROREN LADE ECHT OVERDRAAGT OF WIST (migratie 0087).
 *
 * Het besluit neemt de eigenaar van de server hier; het VERPLAATSEN of WISSEN van rijen kan alleen de dienst zelf, want
 * alleen die weet welke tabellen hij heeft. Daarom één register in plaats van vier eigen wegen: elke dienst meldt zich bij
 * het laden aan, en `eigenaarsBesluit()` roept alle aangemelde uitvoerders van die dienst aan vóórdat de stand verandert.
 *
 *   // backend/mail-platform.ts (één keer, op moduleniveau)
 *   registreerLadeUitvoerder({
 *     dienst: 'mail', naam: 'mail-platform',
 *     async overdragen({ vanUserId, naarUserId, lade }) {
 *       const n = (await q(`UPDATE app.mail_berichten SET user_id = $2, ruimte = 'prive'
 *                             WHERE ${'${sqlLadeWaar(\'ruimte\', lade, 1)}'}`, [vanUserId, naarUserId])).rowCount ?? 0;
 *       return [{ tabel: 'app.mail_berichten', rijen: n }];
 *     },
 *     async verwijderen({ userId, lade }) {
 *       const n = (await q(`DELETE FROM app.mail_berichten WHERE ${'${sqlLadeWaar(\'ruimte\', lade, 1)}'}`, [userId])).rowCount ?? 0;
 *       return [{ tabel: 'app.mail_berichten', rijen: n }];
 *     },
 *   });
 *
 * Drie regels voor een uitvoerder:
 *  1. IDEMPOTENT: een tweede aanroep mag niets meer vinden en moet dan `rijen: 0` melden, nooit een fout gooien;
 *  2. alleen de TECHNISCHE lade aanraken (`sqlLadeWaar(kolom, lade)` / `hoortBij(rij, lade)`) — de persoonlijke lade van
 *     diezelfde mens blijft altijd heel;
 *  3. gooit een uitvoerder wél, dan verandert de stand NIET (UITVOEREN_MISLUKT) en staat de fout in het logboek. Zo blijft
 *     «bevroren» staan tot het echt gelukt is, in plaats van een lade die open heet maar niet verplaatst is.
 */
export type LadeRegel = { tabel: string; rijen: number; opmerking?: string };
export type LadeUitvoerder = {
  dienst: DeelbareDienst;
  /** Korte, stabiele naam van de module (komt in het verslag en het logboek). */
  naam: string;
  overdragen(opdracht: { vanUserId: string; naarUserId: string; lade: Lade }): Promise<LadeRegel[]>;
  verwijderen(opdracht: { userId: string; lade: Lade }): Promise<LadeRegel[]>;
};
const uitvoerders = new Map<string, LadeUitvoerder>();
/** Eén keer per module aanroepen. Dezelfde naam twee keer = één inschrijving (herladen in tests maakt geen dubbelen). */
export function registreerLadeUitvoerder(u: LadeUitvoerder): void {
  const d = dienstOf(u.dienst);
  if (!d || !u.naam) { console.error('[ruimte-scheiding] uitvoerder geweigerd: onbekende dienst of naam', u.dienst, u.naam); return; }
  uitvoerders.set(`${d}:${u.naam}`, { ...u, dienst: d });
}
export const ladeUitvoerders = (dienst: DeelbareDienst): LadeUitvoerder[] => [...uitvoerders.values()].filter((u) => u.dienst === dienst);
/** Alleen voor tests: het register leegmaken. */
export const _wisUitvoerders = () => uitvoerders.clear();

/** Wat er feitelijk gebeurde. `volledig: false` = er was (nog) geen uitvoerder, dus er is niets verplaatst of gewist. */
export type BesluitVerslag = { besluit: 'teruggeven' | 'overdragen' | 'verwijderen'; uitvoerders: number; regels: Array<LadeRegel & { door: string }>; rijen: number; volledig: boolean };

async function uitvoeren(besluit: 'overdragen' | 'verwijderen', userId: string, dienst: DeelbareDienst, naarUserId: string): Promise<BesluitVerslag> {
  const lijst = ladeUitvoerders(dienst);
  const lade: Lade = { userId, ruimte: 'technisch' };
  const regels: Array<LadeRegel & { door: string }> = [];
  for (const u of lijst) {
    const uit = besluit === 'overdragen' ? await u.overdragen({ vanUserId: userId, naarUserId, lade }) : await u.verwijderen({ userId, lade });
    for (const r of uit) regels.push({ tabel: String(r.tabel).slice(0, 120), rijen: Number(r.rijen) || 0, ...(r.opmerking ? { opmerking: String(r.opmerking).slice(0, 200) } : {}), door: u.naam });
  }
  return { besluit, uitvoerders: lijst.length, regels, rijen: regels.reduce((n, r) => n + r.rijen, 0), volledig: lijst.length > 0 };
}

// ------------------------------------------------------------------------------------------------ besluit van de servereigenaar
export type Besluit = 'teruggeven' | 'overdragen' | 'verwijderen';
/**
 * Wat gebeurt er met bevroren gegevens? Alleen de EIGENAAR VAN DE SERVER beslist, en alleen met een verse bevestiging:
 *   'teruggeven'  — de dienst komt terug op de stand van vóór het bevriezen, maar nooit op 'gedeeld': persoonlijke gegevens
 *                   opnieuw samenvoegen is een nieuwe bewuste daad van de mens zelf;
 *   'overdragen'  — de lade gaat naar de servereigenaar: de dienst gaat 'uit' en de rijen worden overgezet door de dienst zelf
 *                   (die weet welke tabellen hij heeft); hier staat alleen het besluit en het logboek;
 *   'verwijderen' — de dienst gaat 'uit' en de rij verdwijnt; het echte wissen doet de dienst (zie het rapport).
 * `doorEigenaar` moet bewezen zijn door de aanroeper (route: isEigenaar + lopende activering + step-up).
 */
export async function eigenaarsBesluit(input: { userId: string; dienst: unknown; besluit: unknown; eigenaarId: string; doorEigenaar: boolean; stapOpGedaan: boolean }): Promise<ZetUitkomst> {
  if (!input.doorEigenaar) fout('OWNER_REQUIRED', 403);
  if (!input.stapOpGedaan) fout('STEP_UP_REQUIRED', 403);
  const d = dienstOf(input.dienst) ?? fout('DIENST_ONBEKEND');
  const huidig = await standVan(input.userId, d);
  const rij = (await standenVan(input.userId)).find((x) => x.dienst === d);
  const o = overgang(huidig, input.besluit, { keuzeGemaakt: true, naStand: rij?.vorigeStand });
  if (!o.ok) return fout(o.fout, o.fout === 'NIET_BEVROREN' ? 409 : 400);
  if (!o.eigenaarsBesluit) fout('GEEN_EIGENAARSBESLUIT', 400);
  // EERST het echte werk, DAN de stand. Mislukt een uitvoerder, dan blijft de dienst bevroren: liever een besluit dat nog
  // niet gelukt is dan een lade die «overgedragen» heet en er nog staat.
  let verslag: BesluitVerslag = { besluit: o.actie as Besluit, uitvoerders: 0, regels: [], rijen: 0, volledig: o.actie === 'teruggeven' };
  if (o.actie === 'overdragen' || o.actie === 'verwijderen') {
    try { verslag = await uitvoeren(o.actie, input.userId, d, input.eigenaarId); }
    catch (err) {
      await journaalSchrijf({
        actie: JOURNAAL.besluit, actor: input.eigenaarId, eigenaar: input.userId, resultaat: 'failure',
        doel: { soort: 'dienst', id: d, naam: d }, reden: String(o.actie), details: { besluit: o.actie, fout: (err as Error).message.slice(0, 200) },
      });
      fout('UITVOEREN_MISLUKT', 503);
    }
  }
  // De rij blijft bestaan, ook na «verwijderen»: zij is het bewijs van het besluit en maakt een tweede aanroep onschadelijk
  // (de stand is dan niet meer 'bevroren', dus het besluit wordt geweigerd met NIET_BEVROREN).
  await sys().query(`UPDATE app.ruimte_dienst_stand SET stand = $3, vorige_stand = 'bevroren', gewijzigd_op = now(),
      bevestigd_door = $4, bevroren_op = NULL, bevroren_oorzaak = '', besluit = $5, besluit_op = now(), besluit_door = $4, verslag = $6::jsonb
    WHERE user_id = $1 AND dienst = $2`, [input.userId, d, o.naar, input.eigenaarId, o.actie, JSON.stringify(verslag)]);
  await journaalSchrijf({
    actie: JOURNAAL.besluit, actor: input.eigenaarId, eigenaar: input.userId, resultaat: verslag.volledig || o.actie === 'teruggeven' ? 'success' : 'info',
    doel: { soort: 'dienst', id: d, naam: d }, wijziging: { van: 'bevroren', naar: o.naar },
    reden: String(o.actie), details: { besluit: o.actie, verslag },
  });
  return { overgang: o, standen: await standenVan(input.userId), verslag };
}

// ------------------------------------------------------------------------------------------------ overzicht voor het scherm
export type Overzicht = {
  keuze: KeuzeRij | null; standen: DienstRij[];
  /** `rollen` en `ikEigenaar` zijn voor het scherm: wie geen eigenaar is, ziet de drie besluiten over bevroren laden niet. */
  rechten: { ok: boolean; oorzaak?: Oorzaak; rollen?: string[]; ikEigenaar?: boolean }; nu: number;
};
export async function overzichtVan(userId: string): Promise<Overzicht> {
  const r = await technischeRechten(userId).catch(() => ({ ok: false, oorzaak: 'rol-weg' } as Rechten));
  return {
    keuze: await keuzeVan(userId), standen: await standenVan(userId),
    rechten: r.ok ? { ok: true, rollen: r.rollen, ikEigenaar: r.ikEigenaar } : { ok: false, oorzaak: r.oorzaak, ikEigenaar: false },
    nu: Date.now(),
  };
}

// ------------------------------------------------------------------------------------------------ aansluiting
// Weg 1 (actief): het intrekken van een technisch profiel meldt het verlies hier (backend/tech-profiel.ts → intrekken).
// Weg 2 (actief): rol gewijzigd / account geblokkeerd / verwijderd meldt het in backend/index.ts.
// Weg 3 (passief): de poort controleert het bij elk verzoek (naVerliesControleren), zodat een vergeten weg geen gat is.
bijTechRechtenVerlies((userId, oorzaak, actorId) => { void rechtenVerloren(userId, oorzaak, actorId); });
