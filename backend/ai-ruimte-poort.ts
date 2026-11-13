// Poort naar de technische AI-ruimte (shared/ai-ruimte.ts). Twee vragen, twee functies:
//
//  1. `ruimteUitVerzoek` — WIE MAG KIEZEN op de site: wie mag een apparaat, een agenttoken of een beheerhandeling in de ruimte
//     'technisch' zetten? Alleen de eigenaar van de server, en alleen vanuit een tabblad met actief technisch profiel
//     (backend/tech-profiel.ts) — dezelfde poort als de beheerpagina's.
//  2. `effectieveRuimte` — WAT GELDT NU voor een AI-aanroep (20.10.2026, «levende rechten»). Vóór deze datum werd de ruimte bij
//     het geven van de toestemming in de grant gezet (mcp_oauth_tokens.ruimte, connector_v2_rechten.kanten) en leefde ze daarna
//     haar eigen leven: wie zijn technische profiel verliet, hield zijn technische hulpmiddelen tot de koppeling verliep. Nu is
//     de ruimte geen eigenschap van de connector maar van de HUIDIGE staat van de mens: bij elke tools/list en elke tools/call
//     kijkt de server opnieuw. Dat is strikt strenger dan voorheen — technische toegang verdwijnt op het moment dat het profiel
//     uitgaat, niet pas bij de volgende toestemming.
//
// De privéruimte staat voor iedereen open die de connector mag gebruiken; daar verandert hier niets aan.
import { getPool } from '../server/platform/pg';
import { isOwnerEmail } from '../server/platform';
import { isAiRuimte, type AiRuimte } from '../shared/ai-ruimte';
import { TAB_RE, actieveActivatie, isEigenaar, lopendeActivatie, type Gebruiker } from './tech-profiel';
import { gegevensLade, gegevensRuimteVeilig, standVan } from './ruimte-scheiding';
import { STAND_UITLEG, WEIGERING_UITLEG, type DienstStand, type LadeWeigering } from '../shared/ruimte-scheiding';

export type RuimteWeigering = 'RUIMTE_ONGELDIG' | 'OWNER_REQUIRED' | 'TECH_PROFIEL_VEREIST'
  /** De dienst «ai» staat uit, is bevroren of de eenmalige keuze ontbreekt (shared/ruimte-scheiding.ts). */
  | 'RUIMTE_DIENST_UIT' | 'RUIMTE_DIENST_BEVROREN' | 'RUIMTE_KEUZE_ONTBREEKT' | 'RUIMTE_DIENST_GEDEELD';

/**
 * Leest de gevraagde ruimte uit de body ('prive' als ze ontbreekt) en controleert of deze mens haar mag kiezen.
 * Geeft de ruimte, of een foutcode (403 bij OWNER_REQUIRED/TECH_PROFIEL_VEREIST, 400 bij RUIMTE_ONGELDIG).
 *
 * LET OP (20.10.2026): deze functie stelt alleen de vraag «mag deze mens 'technisch' KIEZEN». Zij is bewust NIET
 * ondergeschikt gemaakt aan de stand van de dienst «ai», omdat `technischeRuimte` hieronder haar hergebruikt voor
 * handelingen die alleen in de technische ruimte LEVEN (de serverdeur, de lijst met deurverbindingen) en die de eigenaar
 * ook moet kunnen opruimen terwijl zijn dienst «ai» uit staat. Wie een NIEUWE AI-verbinding koppelt — een apparaat, een
 * grant van het oude /mcp, een vreemde MCP-server — gebruikt `aiVerbindingRuimte` onderaan dit bestand.
 * Het agenttoken van de MCP-console (backend/mcp-console.ts) gebruikt nog deze functie, bij het UITGEVEN. Bij elk GEBRUIK wordt
 * een technisch token opnieuw getoetst: op /mcp via `technischNuGeldig` → aiPoortNu, en op POST /api/mcp/agent sinds
 * SEC-002 (ai-mcp-06, 12.11.2026) rechtstreeks met aiPoortNu (vóór die datum NIET — daar telde alleen de kolom ruimte van het
 * token). Geen lopend technisch profiel of dienst «ai» niet aan in de technische ruimte → TECH_PROFILE_OFF, niets uitgevoerd.
 */
export async function ruimteUitVerzoek(user: Gebruiker, body: Record<string, unknown>): Promise<{ ruimte: AiRuimte } | { fout: RuimteWeigering; status: 400 | 403 }> {
  const gevraagd = body.ruimte === undefined || body.ruimte === null || body.ruimte === '' ? 'prive' : body.ruimte;
  if (!isAiRuimte(gevraagd)) return { fout: 'RUIMTE_ONGELDIG', status: 400 };
  if (gevraagd === 'prive') return { ruimte: 'prive' };
  if (!isEigenaar(user)) return { fout: 'OWNER_REQUIRED', status: 403 };
  const tab = String(body.tabContext ?? '');
  if (!(await actieveActivatie(user.id, tab))) return { fout: 'TECH_PROFIEL_VEREIST', status: 403 };
  return { ruimte: 'technisch' };
}

/** Voor handelingen die ALLEEN in de technische ruimte bestaan (serverdeur, server koppelen): dezelfde poort, zonder keuze. */
export const technischeRuimte = (user: Gebruiker, body: Record<string, unknown>) => ruimteUitVerzoek(user, { ...body, ruimte: 'technisch' });

async function emailVanAccount(userId: string): Promise<string> {
  const { rows } = await getPool('systeem').query("SELECT data->>'email' AS email FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
  return String(rows[0]?.email || '');
}
/** Rol van dit account uit de database (nooit uit het verzoek van de AI-klant). Onbekend of verwijderd → geen rol. */
async function rolVanAccount(userId: string): Promise<string | null> {
  const { rows } = await getPool('systeem').query("SELECT data->>'role' AS role FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
  return rows[0]?.role ? String(rows[0].role) : null;
}

/**
 * De ruimte die op DIT MOMENT voor deze mens geldt. Twee voorwaarden, beide live:
 *   • de rol is nog 'owner' (iemand die de eigenaarsrol verloor, zakt meteen naar 'prive');
 *   • er loopt een activering van het technische profiel. Met een tabcontext (een verzoek van de site) geldt DAT tabblad;
 *     zonder tabcontext (een AI-aanroep van buiten, die geen tabblad heeft) geldt: ergens een lopende activering van dit account.
 *
 * Elke fout — geen rol, geen profiel, databasefout bij de aanroeper — geeft 'prive': de veilige richting.
 */
export async function effectieveRuimte(userId: string, rol?: string | null, tabContext?: string | null, verbindingId?: string | null): Promise<AiRuimte> {
  if (!userId) return 'prive';
  const r = rol === undefined ? await rolVanAccount(userId) : rol;
  if (r !== 'owner') return 'prive';
  // Technische ruimtes v2: «eigenaar» = één definitie (rol owner ÉN OWNER_EMAIL), zoals de site (audit S5). Schaduw: alleen loggen.
  {
    const k = await import('./tech-ruimtes-kern');
    if (await k.v2Aan(userId)) { if (!isOwnerEmail(await emailVanAccount(userId))) return 'prive'; }
    else void emailVanAccount(userId).then((e) => k.schaduwVerschil(userId, 'eigenaar-definitie', true, isOwnerEmail(e), isOwnerEmail(e) ? 'ok' : 'rol-zonder-owner-email')).catch(() => undefined);
  }
  const tab = String(tabContext ?? '');
  if (TAB_RE.test(tab)) return (await actieveActivatie(userId, tab)) ? 'technisch' : 'prive';
  return (await lopendeActivatie(userId, verbindingId)) ? 'technisch' : 'prive';
}

/**
 * Zelfde vraag, maar valt bij een storing nooit open: een databasefout geeft 'prive'. De connector gebruikt deze variant,
 * zodat een kapotte verbinding met de database technische hulpmiddelen wegneemt in plaats van ze te laten staan.
 */
export async function effectieveRuimteVeilig(userId: string, rol?: string | null, tabContext?: string | null, verbindingId?: string | null): Promise<AiRuimte> {
  try { return await effectieveRuimte(userId, rol, tabContext, verbindingId); }
  catch (err) { console.error('[ai-ruimte-poort] levende ruimte onbepaalbaar, terug naar prive:', (err as Error).message); return 'prive'; }
}

// ------------------------------------------------------------------------------------------------ ÉÉN WAARHEID VOOR DE DIENST «ai»
/**
 * DE DERDE WAARHEID WEG (20.10.2026, avond).
 *
 * Er waren drie plaatsen die elk voor zich beslisten of de technische kant van de AI bestond:
 *   1. de KOLOM `ruimte` op de rijen zelf (app.agents, app.mcp_oauth_tokens, app.mcp_console_tokens,
 *      app.externe_mcp_verbinding) — gezet op het moment van koppelen;
 *   2. `effectieveRuimte` hierboven — de LEVENDE staat van de mens (nog eigenaar + lopende activering);
 *   3. de STAND van de dienst «ai» in de kern (app.ruimte_dienst_stand: eigen / gedeeld / uit / bevroren) — die niemand
 *      aan de AI-kant las, zodat een eigenaar die «ai» op 'uit' zette toch zijn volledige technische connector hield.
 *
 * Vanaf nu is (3) de baas en zijn (1) en (2) ondergeschikt. `aiPoortNu` is de ENIGE plek waar die drie samenkomen:
 *
 *   • `ruimte` — WELKE HULPMIDDELEN bestaan nu (vraag b, onveranderd eigenaar-only), maar alleen als de stand van «ai»
 *     een technische kant toestaat: 'eigen' of 'gedeeld'. Bij 'uit', 'bevroren' of een ontbrekende keuze is het 'prive',
 *     dus verdwijnen ALLE _beheer-hulpmiddelen en elke technische aanroep wordt geweigerd;
 *   • `lade` — UIT WELKE RIJEN gelezen en geschreven wordt (vraag a): bij 'eigen' de technische lade (eigen verbindingen,
 *     eigen apparaten, eigen externe MCP), bij 'gedeeld' de PERSOONLIJKE lade (de bewuste samenvoeging van de eigenaar).
 *
 * De twee zijn bewust niet hetzelfde: bij 'gedeeld' blijft de technische GEREEDSCHAPSKIST technisch (releases, serverdeur)
 * terwijl de GEGEVENS persoonlijk zijn. De zes voorwaarden van het technische browserslot
 * (shared/browser-technisch-slot.ts) worden daar niet losser van: die blijven op `ruimte` staan, nooit op `lade`.
 *
 * Elke fout geeft 'prive' met een uitleg: de veilige richting. De weigering zelf staat al in het logboek, want de kern
 * schrijft hem (backend/ruimte-scheiding.ts → gegevensLade → JOURNAAL.geweigerd).
 */
export type AiPoort = {
  /** Ruimte van de HULPMIDDELEN nu — 'technisch' alleen als de stand van «ai» dat toestaat. */
  ruimte: AiRuimte;
  /** Ruimte van de GEGEVENS nu (verbindingen, apparaten, externe MCP). Bij 'gedeeld' is dit 'prive'. */
  lade: AiRuimte;
  stand: DienstStand;
  /** true = de technische ruimte gebruikt de PERSOONLIJKE verbindingen van deze mens (stand 'gedeeld'). */
  gedeeld: boolean;
  /** Wat `effectieveRuimte` zei vóór de onderwerping — alleen om te kunnen uitleggen waarom iets wegviel. */
  basis: AiRuimte;
  code: LadeWeigering | null;
  uitleg: { uk: string; nl: string } | null;
};

const PRIVE_POORT = (basis: AiRuimte, stand: DienstStand, code: LadeWeigering | null): AiPoort => ({
  ruimte: 'prive', lade: 'prive', stand, gedeeld: false, basis, code,
  uitleg: code ? WEIGERING_UITLEG[code] : null,
});

/**
 * De poort van de dienst «ai»: hulpmiddelruimte + gegevenslade, in één beslissing. Gebruik deze functie — niet
 * `effectieveRuimte(Veilig)` — overal waar een AI-aanroep beslist wat zij ziet of mag.
 */
export async function aiPoortNu(userId: string, herkomst: { rol?: string | null; tabContext?: string | null; verbindingId?: string | null } = {}): Promise<AiPoort> {
  if (!userId) return PRIVE_POORT('prive', 'uit', null);
  const basis = await effectieveRuimteVeilig(userId, herkomst.rol, herkomst.tabContext, herkomst.verbindingId);
  if (basis !== 'technisch') return PRIVE_POORT(basis, await aiStandVeilig(userId), null);
  // De kern beslist (en logt): de eenmalige keuze, de stand van «ai» en de live rechten van deze mens.
  try {
    const besluit = await gegevensLade({
      userId,
      ...(herkomst.rol ? { rol: herkomst.rol } : {}),
      ...(herkomst.tabContext ? { tabContext: herkomst.tabContext } : {}),
      ...(herkomst.verbindingId ? { verbindingId: herkomst.verbindingId } : {}),
      aiRuimte: 'technisch',
      dienst: 'ai',
    });
    if (!besluit.ok) return PRIVE_POORT(basis, await aiStandVeilig(userId), besluit.code);
    // 'prive' kan hier niet uit een technische herkomst komen; mocht het ooit toch, dan is dat GEEN technische ruimte.
    if (besluit.stand !== 'eigen' && besluit.stand !== 'gedeeld') return PRIVE_POORT(basis, besluit.stand, 'DIENST_UIT');
    return { ruimte: 'technisch', lade: besluit.lade.ruimte, stand: besluit.stand, gedeeld: besluit.gedeeld, basis, code: null, uitleg: null };
  } catch (err) {
    console.error('[ai-ruimte-poort] stand van de dienst «ai» onbepaalbaar, terug naar prive:', (err as Error).message);
    return PRIVE_POORT(basis, 'uit', 'DIENST_UIT');
  }
}

/** De stand van de dienst «ai» van deze mens; elke fout → 'uit' (minste rechten). Alleen om te kunnen uitleggen. */
export async function aiStandVeilig(userId: string): Promise<DienstStand> {
  try { return await standVan(userId, 'ai'); }
  catch { return 'uit'; }
}

/**
 * BESTAAT DE TECHNISCHE KANT VAN DE DIENST «ai» NU VOOR DEZE MENS? — zonder de eigenaarseis.
 *
 * Bewust NIET via `aiPoortNu`. Die stelt ook de oude vraag (b) «mag deze mens technische HULPMIDDELEN van een AI zien», en
 * die blijft voorbehouden aan de eigenaar van de server. Het technische BROWSERSLOT en het koppelen van een technisch
 * apparaat staan al sinds extensie 0.6 open voor iedereen met een lopende technische activering — niet alleen de eigenaar —
 * en dat mag deze wijziging niet terugdraaien. Hier geldt dus precies de vraag die erbij komt: heeft deze mens technische
 * toegang (het PROFIEL, via de kern) én staat de dienst «ai» in haar technische ruimte aan ('eigen' of 'gedeeld')?
 *
 * Elke fout, elke ontbrekende keuze en elke bevroren lade geeft `false`: de veilige richting.
 */
export async function aiTechnischToegestaan(userId: string, tabContext?: string | null): Promise<boolean> {
  if (!userId) return false;
  try {
    // Eerst de rechten (de kern leest rol, status, profiel en de lopende activering zelf uit de database); staat deze mens
    // niet in de technische ruimte, dan is er niets om toe te staan. `gegevensLade` zou voor haar namelijk de PERSOONLIJKE
    // lade teruggeven — ok, maar dat is geen technische kant.
    if ((await gegevensRuimteVeilig(userId, { ...(tabContext ? { tabContext } : {}), aiRuimte: 'technisch' })) !== 'technisch') return false;
    const besluit = await gegevensLade({ userId, ...(tabContext ? { tabContext } : {}), aiRuimte: 'technisch', dienst: 'ai' });
    return besluit.ok && (besluit.stand === 'eigen' || besluit.stand === 'gedeeld');
  } catch (err) {
    console.error('[ai-ruimte-poort] technische kant van «ai» onbepaalbaar, terug naar nee:', (err as Error).message);
    return false;
  }
}

/**
 * DE KEUZE BIJ HET KOPPELEN (apparaat, agenttoken, OAuth-grant, externe MCP-server) — ondergeschikt aan dezelfde stand.
 *
 * `ruimteUitVerzoek` vraagt alleen «mag deze mens 'technisch' kiezen». Dat is te weinig: zolang de dienst «ai» op 'uit'
 * of 'bevroren' staat bestaan er in de technische ruimte GEEN verbindingen, dus mag er ook geen nieuwe bij. En bij
 * 'gedeeld' gebruikt de technische ruimte de PERSOONLIJKE verbindingen: een nieuwe rij met ruimte='technisch' zou daar
 * onzichtbaar blijven staan, dus die weigeren we met een eerlijke uitleg in plaats van hem stil aan te maken.
 *
 * `eisEigen` (standaard true) = er moet een EIGEN technische lade zijn ('eigen'). Zet hem op false voor een handeling die
 * alleen maar in de technische ruimte LEEFT en niets nieuws koppelt.
 */
export async function aiVerbindingRuimte(
  user: Gebruiker, body: Record<string, unknown>, opties: { eisEigen?: boolean } = {},
): Promise<{ ruimte: AiRuimte } | { fout: RuimteWeigering; status: 400 | 403 | 409; uitleg?: { uk: string; nl: string } }> {
  const basis = await ruimteUitVerzoek(user, body);
  if ('fout' in basis || basis.ruimte !== 'technisch') return basis;
  const stand = await aiStandVeilig(user.id);
  if (stand === 'bevroren') return { fout: 'RUIMTE_DIENST_BEVROREN', status: 403, uitleg: WEIGERING_UITLEG.BEVROREN };
  if (stand === 'uit') {
    // Nog nooit gekozen? Dan is dat de eerlijke oorzaak, niet «de dienst staat uit».
    const poort = await aiPoortNu(user.id, { tabContext: String(body.tabContext ?? '') || null });
    if (poort.code === 'KEUZE_ONTBREEKT') return { fout: 'RUIMTE_KEUZE_ONTBREEKT', status: 403, uitleg: WEIGERING_UITLEG.KEUZE_ONTBREEKT };
    return { fout: 'RUIMTE_DIENST_UIT', status: 403, uitleg: WEIGERING_UITLEG.DIENST_UIT };
  }
  if (stand === 'gedeeld' && opties.eisEigen !== false) return { fout: 'RUIMTE_DIENST_GEDEELD', status: 409, uitleg: STAND_UITLEG.gedeeld };
  return { ruimte: 'technisch' };
}

/**
 * ALLEEN DE STAND VAN DE DIENST, zonder enige rechtenvraag: staat «ai» in de technische ruimte van deze mens aan, en zo ja,
 * uit welke lade leest zij dan? Dit is de voorwaarde die er bij KOMT; wie er technische toegang heeft (profiel, activering,
 * eigenaarsrol) blijft elders staan waar het stond — `technischNuGeldig`, `recht()`, de ontgrendeling en de zes voorwaarden
 * van het browserslot. Zo wordt niets losser en niets dubbel afgedwongen.
 *   { aan: false }                 — 'uit', 'bevroren', geen keuze, of onleesbaar: er is geen technische kant;
 *   { aan: true, lade:'technisch'} — 'eigen': de technische ruimte heeft eigen verbindingen en apparaten;
 *   { aan: true, lade:'prive' }    — 'gedeeld': zij gebruikt de PERSOONLIJKE (de bewuste samenvoeging van de eigenaar).
 */
export async function aiDienstStand(userId: string): Promise<{ aan: boolean; stand: DienstStand; lade: AiRuimte }> {
  const stand = await aiStandVeilig(userId);
  if (stand === 'eigen') return { aan: true, stand, lade: 'technisch' };
  if (stand === 'gedeeld') return { aan: true, stand, lade: 'prive' };
  return { aan: false, stand, lade: 'prive' };
}
