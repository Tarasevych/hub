// Korte ingang voor iedereen die een BEHEER-gebeurtenis in het beheerlogboek (admin.tarasevych.com/audit) wil schrijven.
// Dun laagje op backend/beheer-journaal.ts → journaalSchrijf() (hashketen app.audit; geheimen worden eruit gefilterd; gooit nooit).
//
// Gebruik:
//   import { schrijfBeheerAudit } from './audit-gebeurtenis';
//   await schrijfBeheerAudit({
//     actor: { id: eigenaar.id },                                   // WIE het deed (account-id)
//     doel: { soort: 'agent', id: 'claude', naam: 'Claude' },       // WIE/WAT het trof (account, agent, geheim, integratie, test, …)
//     actie: 'owner.agent.grant.termijn',                           // stabiele code; zie shared/beheer-journaal.ts (ACTIE_LABELS / CATEGORIEEN)
//     categorie: 'ai',                                              // optioneel; anders afgeleid uit de actiecode
//     voor: '7 dagen', na: 'onbepaald',                             // was → werd (korte tekst of klein object)
//     reden: 'op verzoek van de eigenaar',                          // verplicht bij intrekken/weigeren
//     resultaat: 'success',                                         // success | denied | failure
//     agent: 'claude',                                              // optioneel: slug van de AI-agent
//   });
//
// Actiecodes en categorieën (de categorie volgt uit het PREFIX van de actie, zie CATEGORIEEN):
//   beheer.agent.*  / owner.agent.*      → «ШІ та агенти»        (ai)
//   secret.* / owner.app.geheim.*         → «Секрети та ключі»    (geheimen)  — gebruik vault/google-contour in de code als dat past
//   integration.* / owner.connectors.*    → «Інтеграції»          (integraties)
//   diag.* / owner.diagnose.*             → «Діагностика»         (diagnose)
// Voor een nieuw prefix: voeg het toe aan het patroon in shared/beheer-journaal.ts (anders valt de regel onder «overig»; filteren blijft werken).
//   beheer.agent.*, agent.*, secret.*, integration.*, diag.* zijn al aangemeld.
import { journaalSchrijf } from './beheer-journaal';
import type { CategorieId } from '../shared/beheer-journaal';

export type BeheerAuditInvoer = {
  actor: { id: string; email?: string } | string | null;
  doel?: { soort: string; id?: string; naam?: string };
  actie: string;
  categorie?: CategorieId;
  voor?: unknown;
  na?: unknown;
  reden?: string;
  resultaat?: 'success' | 'denied' | 'failure' | string;
  agent?: string;
  /** account waarop het effect zit (standaard: de actor) */ eigenaar?: string | null;
  details?: Record<string, unknown>;
  service?: string;
};

/** Schrijft één regel. `categorie` is alleen documentatie: de categorie volgt uit het actie-prefix (shared/beheer-journaal.ts → CATEGORIEEN). */
export async function schrijfBeheerAudit(i: BeheerAuditInvoer) {
  const actorId = i.actor && typeof i.actor === 'object' ? i.actor.id : (i.actor as string | null);
  const details: Record<string, unknown> = { ...(i.details || {}) };
  if (i.actor && typeof i.actor === 'object' && i.actor.email) details.actorEmail = i.actor.email;
  const heeftWijziging = i.voor !== undefined || i.na !== undefined;
  return journaalSchrijf({
    actie: i.actie, actor: actorId, eigenaar: i.eigenaar, resultaat: i.resultaat, doel: i.doel, reden: i.reden, agent: i.agent, service: i.service,
    wijziging: heeftWijziging ? { van: i.voor, naar: i.na } : undefined, details,
  });
}
