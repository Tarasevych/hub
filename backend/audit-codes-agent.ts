// Codes van het beheerjournaal voor RECHTEN VAN AI-AGENTS (wie gaf wie wat, wanneer, waarom). Alleen documentatie + een lijst voor tests;
// het schrijven gebeurt in backend/agent-audit.ts (agentAudit → bestaande hashketen server/platform/audit, dus achteraf niet te wijzigen).
// Opmerking: de opdracht noemde `beheer.agent.*`; de codes heten `agent.grant.*` / `agent.policy.*` omdat ze al zo in gebruik zijn
// (backend/uitrol-goedkeuring.ts, backend/uitrol-beleid-sync.ts, backend/ai-beleid.ts) en shared/beheer-journaal.ts ze zo indeelt
// (categorie «ШІ та агенти», labels uk/nl).
//
//  agent.grant.gegeven          eigenaar gaf een agent/token/koppeling/account het recht updates voor te bereiden (termijn of «tot intrekking»)
//  agent.grant.ingetrokken      eigenaar zette dat recht uit (reden verplicht; het getroffen account krijgt een melding)
//  agent.grant.termijn          termijn gewijzigd (verlengd, ingekort of «tot intrekking»), met vóór/na
//  agent.grant.auto_gegeven     recht automatisch aangemaakt omdat «Розгортати сайт» in het ondertekende AI-beleid is aangezet (actor: systeem)
//  agent.grant.auto_ingetrokken automatisch ingetrokken omdat die mogelijkheid is uitgezet of weggehaald (actor: systeem, met reden)
//  agent.policy.gewijzigd       ondertekend AI-beleid gewijzigd (passkey)
//  agent.policy.geweigerd       wijziging geweigerd (ongeldig, verlopen, andere versie, …)
//  agent.policy.aangeboden      wijziging klaargezet voor ondertekening
//
// Velden in details: actor {id,email,type}, target {type,id,label}, agent (slug|null), before, after, reason, + extra (grantId, dagen, onbepaald, account).
export const AGENT_AUDIT_CODES = [
  'agent.grant.gegeven', 'agent.grant.ingetrokken', 'agent.grant.termijn', 'agent.grant.auto_gegeven', 'agent.grant.auto_ingetrokken',
  'agent.policy.gewijzigd', 'agent.policy.geweigerd', 'agent.policy.aangeboden',
] as const;
