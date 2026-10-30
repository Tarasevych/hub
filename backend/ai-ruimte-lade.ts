// DE BEVROREN LADE VAN DE DIENST «ai» ECHT OVERDRAGEN OF WISSEN (migratie 0085, register uit backend/ruimte-scheiding.ts).
//
// Het BESLUIT neemt de eigenaar van de server (backend/ruimte-scheiding.ts → eigenaarsBesluit: «повернути / передати собі /
// видалити»). Het VERPLAATSEN of WISSEN van rijen kan alleen de dienst zelf, want alleen die weet welke tabellen hij heeft.
// Daarom meldt deze module zich één keer bij het register aan en doet zij het werk voor «Підключення ШІ»:
//
//   app.agents                   apparaten (pc, server, browserslot) — app.agents.ruimte
//   app.ai_grants                de toestemmingen van die apparaten (geen eigen `ruimte`: ze hangen aan het apparaat)
//   app.agent_commands           wachtende en afgeronde opdrachten van die apparaten
//   app.extensie_ontgrendelingen lopende ontgrendelingen van die browsersloten
//   app.mcp_oauth_tokens         koppelingen van AI-klanten (Claude, Grok …) — ruimte
//   app.mcp_oauth_auth           de autorisatiecodes daarvan — ruimte
//   app.mcp_console_tokens       agenttokens van de site — ruimte
//   app.externe_mcp_verbinding   vreemde MCP-servers (migratie 0078) — ruimte, met app.externe_mcp_hulpmiddel eraan
//
// Drie regels, overgenomen uit de kop van het register en hier letterlijk nagekomen:
//  1. IDEMPOTENT — een tweede aanroep vindt niets meer en meldt `rijen: 0`, nooit een fout;
//  2. alleen de TECHNISCHE lade (`sqlLadeWaar('ruimte', lade)`); de PERSOONLIJKE lade van diezelfde mens blijft altijd heel.
//     Daarom staat in elke query óf `ruimte = 'technisch'`, óf een `IN (…)` op precies de technische apparaten/verbindingen;
//  3. faalt er iets, dan gooit de uitvoerder en blijft de dienst BEVROREN (UITVOEREN_MISLUKT) in plaats van «overgedragen»
//     te heten terwijl de rijen er nog staan.
//
// WAAROM «overdragen» NIET ALLES VERHUIST. Een overdracht aan de servereigenaar moet bruikbaar zijn, niet alleen compleet.
// Een TOESTEMMING (ai_grants), een lopende ONTGRENDELING en een wachtende OPDRACHT zijn aan een mens en een moment gebonden:
// die meeverhuizen zou de eigenaar rechten geven die niemand hem gaf. Daarom gaan de APPARATEN en de VERBINDINGEN over (met
// hun geschiedenis), en worden de levende rechten erop ingetrokken — precies zoals bij het bevriezen zelf. Het verslag zegt
// per tabel wat er gebeurde, zodat dit niets verzwijgt.
import { getPool } from '../server/platform/pg';
import { sqlLadeWaar, type Lade } from '../shared/ruimte-scheiding';
import { registreerLadeUitvoerder, type LadeRegel } from './ruimte-scheiding';

const sys = () => getPool('systeem');
const q = (sql: string, params: unknown[]) => sys().query(sql, params);
const n = (r: { rowCount?: number | null }) => r.rowCount ?? 0;

/** De technische apparaten van deze lade. Leeg = er is niets te doen aan de apparaatkant. */
async function technischeApparaten(lade: Lade): Promise<string[]> {
  const rows = (await q(`SELECT id FROM app.agents WHERE ${sqlLadeWaar('ruimte', lade, 1)}`, [lade.userId])).rows;
  return rows.map((r: { id: unknown }) => String(r.id));
}
/** De technische externe MCP-verbindingen van deze lade. */
async function technischeExterne(lade: Lade): Promise<string[]> {
  const rows = (await q(`SELECT id FROM app.externe_mcp_verbinding WHERE ${sqlLadeWaar('ruimte', lade, 1)}`, [lade.userId])).rows;
  return rows.map((r: { id: unknown }) => String(r.id));
}

/**
 * De levende rechten op de technische apparaten en verbindingen intrekken. Dit loopt vóór zowel «overdragen» als
 * «verwijderen»: wat er daarna ook met de rijen gebeurt, er mag op dat moment niets meer kunnen handelen.
 */
async function rechtenEraf(lade: Lade, apparaten: string[]): Promise<LadeRegel[]> {
  const uit: LadeRegel[] = [];
  if (apparaten.length) {
    uit.push({ tabel: 'app.ai_grants', rijen: n(await q(`UPDATE app.ai_grants SET revoked_at = now() WHERE user_id = $1 AND agent_id = ANY($2::uuid[]) AND revoked_at IS NULL`, [lade.userId, apparaten])), opmerking: 'ingetrokken' });
    uit.push({ tabel: 'app.extensie_ontgrendelingen', rijen: n(await q(`UPDATE app.extensie_ontgrendelingen SET ingetrokken_op = now(), reden_einde = 'tech-einde'
      WHERE user_id = $1 AND agent_id = ANY($2::text[]) AND ingetrokken_op IS NULL`, [lade.userId, apparaten])), opmerking: 'ingetrokken' });
  }
  uit.push({ tabel: 'app.mcp_oauth_tokens', rijen: n(await q(`UPDATE app.mcp_oauth_tokens SET revoked_at = now() WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND revoked_at IS NULL`, [lade.userId])), opmerking: 'ingetrokken' });
  uit.push({ tabel: 'app.mcp_console_tokens', rijen: n(await q(`UPDATE app.mcp_console_tokens SET revoked_at = now() WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND revoked_at IS NULL`, [lade.userId])), opmerking: 'ingetrokken' });
  return uit;
}

registreerLadeUitvoerder({
  dienst: 'ai',
  naam: 'ai-verbindingen',

  /**
   * «Передати собі»: de apparaten en de externe MCP-servers gaan naar de servereigenaar en komen daar in zijn PERSOONLIJKE
   * lade terecht (`ruimte = 'prive'`), want de eigenaar heeft geen tweede technische lade nodig om ze te kunnen zien. De
   * levende rechten erop zijn eraf; de eigenaar koppelt zelf opnieuw wat hij wil gebruiken.
   */
  async overdragen({ vanUserId, naarUserId, lade }) {
    const regels: LadeRegel[] = [];
    const apparaten = await technischeApparaten(lade);
    const externe = await technischeExterne(lade);
    regels.push(...(await rechtenEraf(lade, apparaten)));
    if (apparaten.length) {
      // Wachtende opdrachten horen bij de oude mens en het oude moment: niet meeverhuizen, wel netjes afsluiten.
      regels.push({ tabel: 'app.agent_commands', rijen: n(await q(`UPDATE app.agent_commands SET status = 'rejected', decided_at = now(), finished_at = now(), result = '{"error":"technical drawer transferred to the server owner"}'::jsonb
        WHERE user_id = $1 AND agent_id = ANY($2::uuid[]) AND status IN ('pending_approval', 'approved')`, [vanUserId, apparaten])), opmerking: 'afgewezen' });
      regels.push({ tabel: 'app.agents', rijen: n(await q(`UPDATE app.agents SET user_id = $3, ruimte = 'prive', browser_enabled = false, armed_until = NULL
        WHERE user_id = $1 AND id = ANY($2::uuid[])`, [vanUserId, apparaten, naarUserId])), opmerking: 'overgedragen' });
    } else {
      regels.push({ tabel: 'app.agents', rijen: 0 });
    }
    if (externe.length) {
      regels.push({ tabel: 'app.externe_mcp_hulpmiddel', rijen: n(await q('UPDATE app.externe_mcp_hulpmiddel SET user_id = $3 WHERE user_id = $1 AND verbinding_id = ANY($2::text[])', [vanUserId, externe, naarUserId])), opmerking: 'overgedragen' });
      // `actief = false`: de eigenaar beslist zelf of hij een vreemde server van iemand anders wil gebruiken. Het token staat
      // in de kluis van de OUDE mens; `sleutel_naam` leegmaken voorkomt dat de nieuwe eigenaar naar een sleutel wijst die hij
      // niet heeft (de kluisrij zelf blijft bij zijn eigenaar en wordt hier nooit aangeraakt).
      regels.push({ tabel: 'app.externe_mcp_verbinding', rijen: n(await q(`UPDATE app.externe_mcp_verbinding SET user_id = $3, ruimte = 'prive', actief = false, sleutel_naam = '', auth_wijze = 'geen', bijgewerkt_op = now()
        WHERE user_id = $1 AND id = ANY($2::text[])`, [vanUserId, externe, naarUserId])), opmerking: 'overgedragen, uitgezet' });
    } else {
      regels.push({ tabel: 'app.externe_mcp_verbinding', rijen: 0 });
    }
    return regels;
  },

  /** «Видалити»: alles van de technische lade weg. De persoonlijke lade van diezelfde mens blijft volledig heel. */
  async verwijderen({ userId, lade }) {
    const regels: LadeRegel[] = [];
    const apparaten = await technischeApparaten(lade);
    const externe = await technischeExterne(lade);
    if (apparaten.length) {
      regels.push({ tabel: 'app.extensie_ontgrendelingen', rijen: n(await q('DELETE FROM app.extensie_ontgrendelingen WHERE user_id = $1 AND agent_id = ANY($2::text[])', [userId, apparaten])) });
      regels.push({ tabel: 'app.agent_commands', rijen: n(await q('DELETE FROM app.agent_commands WHERE user_id = $1 AND agent_id = ANY($2::uuid[])', [userId, apparaten])) });
      regels.push({ tabel: 'app.ai_grants', rijen: n(await q('DELETE FROM app.ai_grants WHERE user_id = $1 AND agent_id = ANY($2::uuid[])', [userId, apparaten])) });
      regels.push({ tabel: 'app.agents', rijen: n(await q('DELETE FROM app.agents WHERE user_id = $1 AND id = ANY($2::uuid[])', [userId, apparaten])) });
    } else {
      regels.push({ tabel: 'app.agents', rijen: 0 });
    }
    if (externe.length) {
      regels.push({ tabel: 'app.externe_mcp_hulpmiddel', rijen: n(await q('DELETE FROM app.externe_mcp_hulpmiddel WHERE user_id = $1 AND verbinding_id = ANY($2::text[])', [userId, externe])) });
      regels.push({ tabel: 'app.externe_mcp_verbinding', rijen: n(await q('DELETE FROM app.externe_mcp_verbinding WHERE user_id = $1 AND id = ANY($2::text[])', [userId, externe])) });
    } else {
      regels.push({ tabel: 'app.externe_mcp_verbinding', rijen: 0 });
    }
    regels.push({ tabel: 'app.mcp_oauth_auth', rijen: n(await q(`DELETE FROM app.mcp_oauth_auth WHERE ${sqlLadeWaar('ruimte', lade, 1)}`, [userId])) });
    regels.push({ tabel: 'app.mcp_oauth_tokens', rijen: n(await q(`DELETE FROM app.mcp_oauth_tokens WHERE ${sqlLadeWaar('ruimte', lade, 1)}`, [userId])) });
    regels.push({ tabel: 'app.mcp_console_tokens', rijen: n(await q(`DELETE FROM app.mcp_console_tokens WHERE ${sqlLadeWaar('ruimte', lade, 1)}`, [userId])) });
    return regels;
  },
});

/** Alleen om de module zichtbaar te kunnen importeren (de aanmelding gebeurt bij het laden). */
export const AI_LADE_UITVOERDER = 'ai-verbindingen' as const;
