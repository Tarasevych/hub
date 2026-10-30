// Ondertekend AI-beleid → rechten «updates voorbereiden» (Хто готує оновлення).
//
// Probleem dat dit oplost: de eigenaar zet in «Доступ ШІ» bij een agent de mogelijkheid «Розгортати сайт» (deploy.release) aan, maar die agent
// stond daarna niet in «Хто готує оновлення» — twee lijsten die los van elkaar draaiden. Nu volgt het recht het beleid:
//   • de eigenaar heeft «Розгортати сайт» (deploy.release) voor die agent UITDRUKKELIJK gezet op «Завжди» of «Питати»
//     ⇒ er is een recht (soort 'agent', technische ruimte, tot intrekking) met bron 'ai-beleid'. Alleen de standaard («усе інше: Питати щоразу»)
//     telt niet als keuze: anders stond elke agent in het beleid meteen in de lijst;
//   • staat het op «Вимкнено», is de uitdrukkelijke keuze weggehaald, of staat de agent niet meer in het beleid ⇒ dat automatische recht wordt ingetrokken;
//   • handmatig gegeven rechten (bron 'handmatig') worden NOOIT door de synchronisatie aangemaakt of ingetrokken: wat de eigenaar zelf koos, blijft.
// Alleen de eigenaar krijgt zo'n recht (grant hoort bij zijn account); het beleid zelf is van de eigenaar en alleen met passkey te wijzigen.
// Het beleid blijft áltijd het plafond: ook een handmatig recht werkt niet zolang het beleid «Вимкнено» zegt (zie backend/ai-beleid.ts).
// Veilig falen: is het beleid niet ingesteld of ongeldig, dan verandert de synchronisatie niets (ze trekt dus nooit iets in op een leesfout).
// Elke aanmaak/intrekking komt als 'agent.grant.auto_gegeven' / 'agent.grant.auto_ingetrokken' in het journaal (actor: systeem, met reden).
import { V2_AGENTEN, type AgentSlug } from '../shared/connector-v2/agenten';
import { evaluate } from '../shared/ai-beleid/model';
import { getPool } from '../server/platform/pg';
import { agentVoor, leesStand } from './ai-beleid';
import { agentAudit } from './agent-audit';

export const UITROL_CAPABILITY = 'deploy.release';
export type BeleidModus = 'always' | 'ask' | 'off';
export type BeleidAgent = { slug: AgentSlug; modus: BeleidModus | null; code: string; beleidId: string | null; uitdrukkelijk: boolean };
const sys = () => getPool('systeem');

/** Per agent: wat zegt het beleid over «Розгортати сайт»? modus null = beleid niet (geldig) ingesteld of agent niet in het beleid. */
export async function beleidPerAgent(nu = Date.now()): Promise<{ staat: string; agents: BeleidAgent[] }> {
  const stand = await leesStand();
  if (stand.staat !== 'geldig') return { staat: stand.staat, agents: V2_AGENTEN.map((a) => ({ slug: a.slug, modus: null, code: stand.staat, beleidId: null, uitdrukkelijk: false })) };
  return {
    staat: 'geldig',
    agents: V2_AGENTEN.map((a) => {
      const id = agentVoor(stand.beleid, a.naam, a.slug);
      if (!id) return { slug: a.slug, modus: null, code: 'agent_unknown', beleidId: null, uitdrukkelijk: false };
      const d = evaluate(stand.beleid, id, UITROL_CAPABILITY, nu);
      return { slug: a.slug, modus: (d.effect === 'allow' ? 'always' : d.effect === 'ask' ? 'ask' : 'off') as BeleidModus, code: d.code, beleidId: id, uitdrukkelijk: Object.prototype.hasOwnProperty.call(stand.beleid.agents[id]?.capabilities ?? {}, UITROL_CAPABILITY) };
    }),
  };
}

export type SyncUitkomst = { gegeven: AgentSlug[]; ingetrokken: AgentSlug[]; overgeslagen: string | null };
/** Gelijktrekken (idempotent). Aanroepen na een beleidswijziging en bij het openen van het updates-overzicht. */
export async function synchroniseerGrants(eigenaar: { id: string; email?: string }, reden: string, nu = Date.now()): Promise<SyncUitkomst> {
  const stand = await beleidPerAgent(nu);
  const uit: SyncUitkomst = { gegeven: [], ingetrokken: [], overgeslagen: null };
  if (stand.staat !== 'geldig') { uit.overgeslagen = stand.staat; return uit; }
  const systeem = { id: 'systeem:ai-beleid', type: 'systeem' as const };
  for (const a of stand.agents) {
    const naam = V2_AGENTEN.find((x) => x.slug === a.slug)?.naam || a.slug;
    if (a.uitdrukkelijk && (a.modus === 'always' || a.modus === 'ask')) {
      // Eén statement (geen controle-dan-invoegen): twee gelijktijdige overzichten maken zo nooit twee rijen.
      const { rows } = await sys().query(
        `INSERT INTO app.uitrol_voorbereiders (soort, onderwerp, account_id, label, gegeven_door, verloopt_op, onbepaald, bron)
         SELECT 'agent', $1, $2, $3, 'ai-beleid', timestamptz '9999-12-31 00:00:00+00', true, 'ai-beleid'
          WHERE NOT EXISTS (SELECT 1 FROM app.uitrol_voorbereiders g WHERE g.soort = 'agent' AND g.onderwerp = $1 AND g.account_id = $2
                              AND g.ingetrokken_op IS NULL AND g.verloopt_op > now())
         RETURNING id`, [a.slug, eigenaar.id, naam]);
      if (rows[0]) {
        uit.gegeven.push(a.slug);
        await agentAudit({ ownerId: eigenaar.id, actor: systeem, action: 'agent.grant.auto_gegeven', target: { type: 'agent', id: a.slug, label: naam }, agent: a.slug,
          before: 'geen recht om updates voor te bereiden', after: 'mag updates voorbereiden — tot intrekking (volgt het AI-beleid)',
          reason: `«Розгортати сайт» staat in het ondertekende AI-beleid op ${a.modus === 'always' ? 'Завжди' : 'Питати'} (${reden})`, extra: { grantId: String(rows[0].id), beleidModus: a.modus, bron: 'ai-beleid' } });
      }
    } else {
      // Beleid zegt uit (of de agent is uit het beleid): alleen het AUTOMATISCHE recht verdwijnt.
      const { rows } = await sys().query(
        `UPDATE app.uitrol_voorbereiders SET ingetrokken_op = now(), ingetrokken_door = 'ai-beleid'
          WHERE soort = 'agent' AND onderwerp = $1 AND account_id = $2 AND bron = 'ai-beleid' AND ingetrokken_op IS NULL RETURNING id`, [a.slug, eigenaar.id]);
      for (const r of rows) {
        uit.ingetrokken.push(a.slug);
        await agentAudit({ ownerId: eigenaar.id, actor: systeem, action: 'agent.grant.auto_ingetrokken', target: { type: 'agent', id: a.slug, label: naam }, agent: a.slug,
          before: 'mag updates voorbereiden — tot intrekking (volgt het AI-beleid)', after: 'geen recht',
          reason: a.modus === 'off' ? `«Розгортати сайт» is in het ondertekende AI-beleid op Вимкнено gezet (${reden})` : a.modus === null ? `agent staat niet meer in het AI-beleid (${reden})` : `«Розгортати сайт» is in het AI-beleid niet meer uitdrukkelijk aangezet (${reden})`, extra: { grantId: String(r.id), beleidModus: a.modus, bron: 'ai-beleid' } });
      }
    }
  }
  return uit;
}

export type AgentTegel = {
  slug: AgentSlug; naam: string; modus: BeleidModus | null; beleidCode: string; uitdrukkelijk: boolean;
  recht: { id: string; onbepaald: boolean; verlooptOp: string; bron: 'handmatig' | 'ai-beleid' } | null;
  verbindingen: { technisch: number; prive: number; laatstGebruikt: string };
};
/** Alle agents die op de site kunnen aansluiten, met hun beleid, hun recht en hun verbindingen (voor het scherm «Усі агенти»). */
export async function agentTegels(eigenaarId: string, nu = Date.now()): Promise<AgentTegel[]> {
  const beleid = await beleidPerAgent(nu);
  const rechten = (await sys().query(`SELECT DISTINCT ON (onderwerp) id, onderwerp, onbepaald, verloopt_op, bron FROM app.uitrol_voorbereiders
     WHERE soort = 'agent' AND account_id = $1 AND ingetrokken_op IS NULL AND verloopt_op > now() ORDER BY onderwerp, verloopt_op DESC`, [eigenaarId])).rows;
  let verb: any[] = [];
  try {
    verb = (await sys().query(`SELECT agent, ruimte, count(*)::int AS n, max(last_used_at) AS laatst FROM app.mcp_oauth_tokens
       WHERE user_id = $1 AND revoked_at IS NULL AND refresh_expires_at > now() GROUP BY agent, ruimte`, [eigenaarId])).rows;
  } catch { verb = []; }
  return V2_AGENTEN.map((a) => {
    const b = beleid.agents.find((x) => x.slug === a.slug)!;
    const r = rechten.find((x) => x.onderwerp === a.slug);
    const mijn = verb.filter((x) => x.agent === a.slug);
    const laatst = mijn.map((x) => x.laatst).filter(Boolean).sort().pop();
    return {
      slug: a.slug, naam: a.naam, modus: b.modus, beleidCode: b.code, uitdrukkelijk: b.uitdrukkelijk,
      recht: r ? { id: String(r.id), onbepaald: r.onbepaald === true, verlooptOp: new Date(r.verloopt_op).toISOString(), bron: r.bron === 'ai-beleid' ? 'ai-beleid' : 'handmatig' } : null,
      verbindingen: { technisch: mijn.filter((x) => x.ruimte === 'technisch').reduce((s, x) => s + x.n, 0), prive: mijn.filter((x) => x.ruimte !== 'technisch').reduce((s, x) => s + x.n, 0), laatstGebruikt: laatst ? new Date(laatst).toISOString() : '' },
    };
  });
}
