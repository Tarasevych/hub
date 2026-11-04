// Poort naar de technische AI-ruimte (shared/ai-ruimte.ts): wie mag een AI-verbinding, agenttoken of apparaat in de ruimte
// 'technisch' zetten? Alleen de eigenaar van de server, en alleen vanuit een tabblad met actief technisch profiel
// (backend/tech-profiel.ts) — dezelfde poort als de beheerpagina's. De privéruimte staat voor iedereen open die de
// connector mag gebruiken; daar verandert hier niets aan.
import { isAiRuimte, type AiRuimte } from '../shared/ai-ruimte';
import { actieveActivatie, isEigenaar, type Gebruiker } from './tech-profiel';

export type RuimteWeigering = 'RUIMTE_ONGELDIG' | 'OWNER_REQUIRED' | 'TECH_PROFIEL_VEREIST';

/**
 * Leest de gevraagde ruimte uit de body ('prive' als ze ontbreekt) en controleert of deze mens haar mag kiezen.
 * Geeft de ruimte, of een foutcode (403 bij OWNER_REQUIRED/TECH_PROFIEL_VEREIST, 400 bij RUIMTE_ONGELDIG).
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
