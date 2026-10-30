// Het REGISTER van vreemde MCP-servers per gebruiker (migratie 0078) en hun gekeurde lijst met hulpmiddelen.
//
// Regels, net als in de buurmodules (backend/agenda-ics.ts):
//   • elke query draagt `user_id` expliciet mee — óók al staat er RLS op de tabellen (0078). Twee hekken.
//   • de RUIMTE (privé of technisch) kiest de eigenaar bij het koppelen en wordt nooit gemengd: een technische
//     AI-verbinding ziet nooit een privéserver en omgekeerd (shared/ai-ruimte.ts).
//   • het token staat in de eigen kluis (owner_vault_v1); hier staat alleen de NAAM van die sleutel.
//   • de stand komt uit feiten: `staat` wordt pas 'klaar' na een gelukte `initialize`.
import { randomUUID } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { MCP_FOUT, MCP_GRENZEN, externSleutel, type ExterneTool, type McpAuthWijze, type McpVervoer } from '../shared/mcp-klant-model';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';

const sys = () => getPool('systeem');
const kort = (waarde: unknown, max = 500) => String(waarde ?? '').replace(/\u0000/g, '').trim().slice(0, max);

export type VerbindingRij = {
  id: string; naam: string; adres: string; ruimte: AiRuimte; authWijze: McpAuthWijze; sleutelNaam: string;
  vervoer: McpVervoer | 'onbekend'; protocolVersie: string; serverNaam: string; serverVersie: string;
  mogelijkheden: Record<string, unknown>; instructies: string; actief: boolean;
  staat: 'nieuw' | 'bezig' | 'klaar' | 'fout'; fout: string;
  laatstOkOp: number; laatstFoutOp: number; toolsBijgewerktOp: number; aantalTools: number;
  aangemaaktOp: number;
};
export type ToolRij = {
  verbindingId: string; naam: string; titel: string; beschrijving: string; invoerSchema: Record<string, unknown>;
  alleenLezen: boolean; destructief: boolean; aan: boolean; gezienOp: number;
};

const ms = (waarde: unknown) => (waarde ? new Date(String(waarde)).getTime() : 0);
const uit = (rij: Record<string, unknown>): VerbindingRij => ({
  id: String(rij.id || ''), naam: String(rij.naam || ''), adres: String(rij.adres || ''), ruimte: ruimteOf(rij.ruimte),
  authWijze: (['geen', 'bearer', 'oauth'].includes(String(rij.auth_wijze)) ? String(rij.auth_wijze) : 'geen') as McpAuthWijze,
  sleutelNaam: String(rij.sleutel_naam || ''),
  vervoer: (['streamable', 'sse'].includes(String(rij.vervoer)) ? String(rij.vervoer) : 'onbekend') as McpVervoer | 'onbekend',
  protocolVersie: String(rij.protocol_versie || ''), serverNaam: String(rij.server_naam || ''), serverVersie: String(rij.server_versie || ''),
  mogelijkheden: (rij.mogelijkheden && typeof rij.mogelijkheden === 'object' ? rij.mogelijkheden : {}) as Record<string, unknown>,
  instructies: String(rij.instructies || ''), actief: rij.actief !== false,
  staat: (['nieuw', 'bezig', 'klaar', 'fout'].includes(String(rij.staat)) ? String(rij.staat) : 'nieuw') as VerbindingRij['staat'],
  fout: String(rij.fout || ''),
  laatstOkOp: ms(rij.laatst_ok_op), laatstFoutOp: ms(rij.laatst_fout_op), toolsBijgewerktOp: ms(rij.tools_bijgewerkt_op),
  aantalTools: Number(rij.aantal_tools || 0), aangemaaktOp: ms(rij.aangemaakt_op),
});
const toolUit = (rij: Record<string, unknown>): ToolRij => ({
  verbindingId: String(rij.verbinding_id || ''), naam: String(rij.naam || ''), titel: String(rij.titel || ''),
  beschrijving: String(rij.beschrijving || ''),
  invoerSchema: (rij.invoer_schema && typeof rij.invoer_schema === 'object' ? rij.invoer_schema : {}) as Record<string, unknown>,
  alleenLezen: rij.alleen_lezen === true, destructief: rij.destructief === true, aan: rij.aan !== false, gezienOp: ms(rij.gezien_op),
});

export async function lijst(userId: string, ruimte?: AiRuimte): Promise<VerbindingRij[]> {
  const rijen = ruimte
    ? await sys().query('SELECT * FROM app.externe_mcp_verbinding WHERE user_id = $1 AND ruimte = $2 ORDER BY aangemaakt_op', [userId, ruimte])
    : await sys().query('SELECT * FROM app.externe_mcp_verbinding WHERE user_id = $1 ORDER BY aangemaakt_op', [userId]);
  return (rijen.rows as Record<string, unknown>[]).map(uit);
}

export async function een(userId: string, id: string): Promise<VerbindingRij | null> {
  const rijen = await sys().query('SELECT * FROM app.externe_mcp_verbinding WHERE user_id = $1 AND id = $2', [userId, kort(id, 120)]);
  return rijen.rows.length ? uit(rijen.rows[0] as Record<string, unknown>) : null;
}

/** De korte sleutel uit een hulpmiddelnaam (`extern_<sleutel>_…`) terug naar de verbinding, binnen één ruimte. */
export async function viaSleutel(userId: string, sleutel: string, ruimte: AiRuimte): Promise<VerbindingRij | null> {
  const alles = await lijst(userId, ruimte);
  return alles.find((rij) => externSleutel(rij.id) === sleutel) ?? null;
}

export type ToevoegUitslag = { ok: true; verbinding: VerbindingRij } | { ok: false; fout: string };
export async function toevoegen(userId: string, invoer: {
  adres: string; naam?: unknown; ruimte?: unknown; authWijze?: McpAuthWijze; sleutelNaam?: string;
}): Promise<ToevoegUitslag> {
  const aantal = await sys().query('SELECT count(*)::int AS n FROM app.externe_mcp_verbinding WHERE user_id = $1', [userId]);
  if (Number(aantal.rows[0]?.n || 0) >= MCP_GRENZEN.maxVerbindingen) return { ok: false, fout: MCP_FOUT.teVeel };
  const id = randomUUID();
  try {
    const rij = await sys().query(
      `INSERT INTO app.externe_mcp_verbinding (user_id, id, naam, adres, ruimte, auth_wijze, sleutel_naam, actief, staat)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,'nieuw')
       ON CONFLICT (user_id, adres) DO UPDATE SET
         actief = true,
         naam = COALESCE(NULLIF(EXCLUDED.naam, ''), app.externe_mcp_verbinding.naam),
         auth_wijze = EXCLUDED.auth_wijze,
         sleutel_naam = EXCLUDED.sleutel_naam,
         bijgewerkt_op = now()
       RETURNING *`,
      [userId, id, kort(invoer.naam, 200), invoer.adres, ruimteOf(invoer.ruimte), invoer.authWijze ?? 'geen', kort(invoer.sleutelNaam, 80)]);
    return { ok: true, verbinding: uit(rij.rows[0] as Record<string, unknown>) };
  } catch { return { ok: false, fout: MCP_FOUT.opslaan }; }
}

export async function schakelen(userId: string, id: string, actief: boolean): Promise<boolean> {
  const uitslag = await sys().query(
    'UPDATE app.externe_mcp_verbinding SET actief = $3, bijgewerkt_op = now() WHERE user_id = $1 AND id = $2',
    [userId, kort(id, 120), Boolean(actief)]);
  return Boolean(uitslag.rowCount);
}

/** Verwijderen haalt de verbinding ÉN haar geheugen van hulpmiddelen weg (de pagina moet niets ouds tonen). */
export async function verwijderen(userId: string, id: string): Promise<boolean> {
  const bestaat = await een(userId, id);
  if (!bestaat) return false;
  await toolsWissen(userId, id);
  await sys().query('DELETE FROM app.externe_mcp_verbinding WHERE user_id = $1 AND id = $2', [userId, kort(id, 120)]);
  return true;
}

export async function bezig(userId: string, id: string): Promise<void> {
  await sys().query("UPDATE app.externe_mcp_verbinding SET staat = 'bezig', bijgewerkt_op = now() WHERE user_id = $1 AND id = $2", [userId, kort(id, 120)]);
}

/** Na een GELUKTE initialize: de feiten van de server opschrijven. */
export async function gelukt(userId: string, id: string, feiten: {
  vervoer: McpVervoer; protocolVersie: string; serverNaam: string; serverVersie: string;
  mogelijkheden: Record<string, unknown>; instructies: string; naam?: string;
}): Promise<void> {
  await sys().query(
    `UPDATE app.externe_mcp_verbinding
        SET staat = 'klaar', fout = '', vervoer = $3, protocol_versie = $4, server_naam = $5, server_versie = $6,
            mogelijkheden = $7::jsonb, instructies = $8,
            naam = COALESCE(NULLIF($9, ''), NULLIF(naam, ''), $5),
            laatst_ok_op = now(), bijgewerkt_op = now()
      WHERE user_id = $1 AND id = $2`,
    [userId, kort(id, 120), feiten.vervoer, kort(feiten.protocolVersie, 12), kort(feiten.serverNaam, 200), kort(feiten.serverVersie, 80),
      JSON.stringify(feiten.mogelijkheden ?? {}), kort(feiten.instructies, 2000), kort(feiten.naam, 200)]);
}

/** Na een MISLUKTE poging: alleen onze eigen stabiele code, nooit tekst van de aanbieder. */
export async function mislukt(userId: string, id: string, code: string): Promise<void> {
  await sys().query(
    `UPDATE app.externe_mcp_verbinding
        SET staat = 'fout', fout = CASE WHEN $3 ~ '^[A-Z0-9_]{1,60}$' THEN $3 ELSE '' END,
            laatst_fout_op = now(), bijgewerkt_op = now()
      WHERE user_id = $1 AND id = $2`,
    [userId, kort(id, 120), kort(code, 60)]);
}

export async function toolsLijst(userId: string, id: string): Promise<ToolRij[]> {
  const rijen = await sys().query('SELECT * FROM app.externe_mcp_hulpmiddel WHERE user_id = $1 AND verbinding_id = $2 ORDER BY naam', [userId, kort(id, 120)]);
  return (rijen.rows as Record<string, unknown>[]).map(toolUit);
}

export async function toolsWissen(userId: string, id: string): Promise<void> {
  await sys().query('DELETE FROM app.externe_mcp_hulpmiddel WHERE user_id = $1 AND verbinding_id = $2', [userId, kort(id, 120)]);
}

/**
 * Het geheugen vervangen door wat `tools/list` nu zegt. De keuze van de gebruiker (aan/uit per hulpmiddel)
 * blijft staan voor hulpmiddelen die blijven bestaan; wat de server niet meer aanbiedt, verdwijnt.
 */
export async function toolsVervangen(userId: string, id: string, tools: readonly ExterneTool[]): Promise<number> {
  const verbindingId = kort(id, 120);
  const oud = new Map((await toolsLijst(userId, verbindingId)).map((rij) => [rij.naam, rij.aan]));
  await toolsWissen(userId, verbindingId);
  for (const tool of tools.slice(0, MCP_GRENZEN.maxTools)) {
    await sys().query(
      `INSERT INTO app.externe_mcp_hulpmiddel (user_id, verbinding_id, naam, titel, beschrijving, invoer_schema, alleen_lezen, destructief, aan, gezien_op)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,now())
       ON CONFLICT (user_id, verbinding_id, naam) DO UPDATE SET
         titel = EXCLUDED.titel, beschrijving = EXCLUDED.beschrijving, invoer_schema = EXCLUDED.invoer_schema,
         alleen_lezen = EXCLUDED.alleen_lezen, destructief = EXCLUDED.destructief, gezien_op = now()`,
      [userId, verbindingId, tool.naam, kort(tool.titel, 200), kort(tool.beschrijving, 4000),
        JSON.stringify(tool.invoerSchema ?? {}), tool.alleenLezen, tool.destructief, oud.get(tool.naam) ?? true]);
  }
  const n = Math.min(tools.length, MCP_GRENZEN.maxTools);
  await sys().query(
    'UPDATE app.externe_mcp_verbinding SET aantal_tools = $3, tools_bijgewerkt_op = now(), bijgewerkt_op = now() WHERE user_id = $1 AND id = $2',
    [userId, verbindingId, n]);
  return n;
}

export async function toolSchakelen(userId: string, id: string, naam: string, aan: boolean): Promise<boolean> {
  const uitslag = await sys().query(
    'UPDATE app.externe_mcp_hulpmiddel SET aan = $4 WHERE user_id = $1 AND verbinding_id = $2 AND naam = $3',
    [userId, kort(id, 120), kort(naam, 120), Boolean(aan)]);
  return Boolean(uitslag.rowCount);
}

/** Voor de AI: alle AANGEZETTE hulpmiddelen van ACTIEVE, geslaagde verbindingen in één ruimte. */
export async function actieveTools(userId: string, ruimte: AiRuimte): Promise<Array<{ verbinding: VerbindingRij; tool: ToolRij }>> {
  const rijen = await sys().query(
    `SELECT v.*, h.naam AS t_naam, h.titel AS t_titel, h.beschrijving AS t_beschrijving, h.invoer_schema AS t_schema,
            h.alleen_lezen AS t_alleen_lezen, h.destructief AS t_destructief, h.gezien_op AS t_gezien_op
       FROM app.externe_mcp_verbinding v
       JOIN app.externe_mcp_hulpmiddel h ON h.user_id = v.user_id AND h.verbinding_id = v.id
      WHERE v.user_id = $1 AND v.ruimte = $2 AND v.actief AND v.staat = 'klaar' AND h.aan
      ORDER BY v.aangemaakt_op, h.naam`, [userId, ruimte]);
  return (rijen.rows as Record<string, unknown>[]).map((rij) => ({
    verbinding: uit(rij),
    tool: {
      verbindingId: String(rij.id || ''), naam: String(rij.t_naam || ''), titel: String(rij.t_titel || ''),
      beschrijving: String(rij.t_beschrijving || ''),
      invoerSchema: (rij.t_schema && typeof rij.t_schema === 'object' ? rij.t_schema : {}) as Record<string, unknown>,
      alleenLezen: rij.t_alleen_lezen === true, destructief: rij.t_destructief === true, aan: true, gezienOp: ms(rij.t_gezien_op),
    },
  }));
}

/** Eén aangezet hulpmiddel van één verbinding (voor de aanroep door de AI). */
export async function actieveTool(userId: string, verbindingId: string, naam: string): Promise<ToolRij | null> {
  const rijen = await sys().query(
    'SELECT * FROM app.externe_mcp_hulpmiddel WHERE user_id = $1 AND verbinding_id = $2 AND naam = $3',
    [userId, kort(verbindingId, 120), kort(naam, 120)]);
  return rijen.rows.length ? toolUit(rijen.rows[0] as Record<string, unknown>) : null;
}

/** De NAAM van de kluissleutel bij een verbinding zetten (de waarde zelf staat alleen in de kluis). */
export async function sleutelZetten(userId: string, id: string, sleutelNaam: string): Promise<boolean> {
  const uitslag = await sys().query(
    'UPDATE app.externe_mcp_verbinding SET sleutel_naam = $3, bijgewerkt_op = now() WHERE user_id = $1 AND id = $2',
    [userId, kort(id, 120), kort(sleutelNaam, 80)]);
  return Boolean(uitslag.rowCount);
}

/**
 * Dezelfde sleutel, maar ONGEACHT de ruimte. Alleen voor het goedkeuren van een wachtende aanroep: die aanroep
 * is al door de ruimtepoort gegaan toen ze ontstond, en de eigenaar die goedkeurt zit in zijn eigen sessie
 * (zonder AI-ruimte). Nooit gebruiken om een lijst voor een AI op te bouwen.
 */
export async function viaSleutelAlle(userId: string, sleutel: string): Promise<VerbindingRij | null> {
  const alles = await lijst(userId);
  return alles.find((rij) => externSleutel(rij.id) === sleutel) ?? null;
}
