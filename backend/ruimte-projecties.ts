// DE OVERZICHTSPROJECTIES EN DE GESCHEIDEN GEGEVENSRUIMTES (kern: shared/ruimte-scheiding.ts, backend/ruimte-scheiding.ts).
//
// WAAROM DIT BESTAND BESTAAT — EEN GAT DAT ECHT OPEN STOND (klacht 1 van de eigenaar, 20.10.2026):
//   «У технічному профілі поштові акаунти не підключені, але при цьому я бачу пошту в обох акаунтах.»
//
//   De poort van post (backend/mail-ruimte.ts) hangt vóór ELKE route onder /api/owner/mail/ en /api/owner/contacten/, en de
//   poort van de hmara en de agenda (backend/ruimte-cloud-agenda.ts) vóór elke route onder /api/owner/cloud/ en
//   /api/owner/agenda/. Maar TWEE routes lezen diezelfde gegevens en staan onder een ANDER pad, dus buiten beide poorten:
//     • POST /api/owner/hub/blocks/data  (backend/hub-blok-gegevens.ts) — de blokken van de hub: onderwerpen en afzenders van
//       post, bestanden van de hmara en van Drive, komende afspraken. Dit is de LANDINGSPAGINA, dus precies het scherm
//       waarop de eigenaar zijn post zag staan in een technisch profiel waar post nooit verbonden was;
//     • POST /api/owner/global-search   (backend/globaal-zoek.ts) — «Пошук усюди»: onderwerpen, afzenders én BRIEFTEKST,
//       plus hmara, Drive en agenda. Deze route is bovendien het hulpmiddel `site_search` van de AI
//       (backend/site-hulpmiddelen.ts), dus het gat stond ook open voor elke connector.
//   Beide lazen `db.list(tabel, { filter: { ownerUserId } })`: één mens = één lade, in BEIDE richtingen fout. In de
//   technische ruimte gaf dat de persoonlijke post te zien (waarover de klacht gaat) en in de persoonlijke ruimte de
//   technische rijen — ook dat is «пошту в обох акаунтах».
//
// WAT HIER STAAT, EN NIETS MEER
//   Eén manier om vanuit zo'n projectieroute dezelfde vraag te stellen die de poorten stellen, en één manier om rijen op hun
//   lade te filteren. Geen tweede waarheid: de ruimte komt uit `gegevensLade`, de regel «rij zonder `ruimte` is persoonlijk»
//   uit `hoortBij`, en de teksten uit shared/ruimte-scheiding.ts. Bij elke twijfel: GEEN rijen.
import { gegevensLade } from './ruimte-scheiding';
import { DIENST_NAAM, hoortBij, type DeelbareDienst, type LadeBesluit } from '../shared/ruimte-scheiding';
import { huidigeRuimte } from './mcp-namens';

/** Waar het verzoek vandaan komt. Zelfde vorm als backend/ruimte-cloud-agenda.ts → Herkomst. */
export type ProjectieHerkomst = { userId: string; rol?: string | null; tabContext?: unknown };

const bodyOf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
/** De herkomst uit het lichaam van het verzoek: het tabblad van de site, of (zonder tabblad) de ruimte van de AI-verbinding. */
export const herkomstUitBody = (userId: string, rol: string | null | undefined, body: unknown): ProjectieHerkomst =>
  ({ userId, rol: rol ?? null, tabContext: String(bodyOf(body).tabContext || '') });

/**
 * Uit welke lade mag deze projectie lezen? Precies dezelfde poort als de routes van post, hmara en agenda: de ruimte wordt
 * live uit de database berekend en de herkomst (tabblad of AI-verbinding) kan haar alleen VERKLEINEN.
 */
export async function projectieLade(h: ProjectieHerkomst, dienst: DeelbareDienst): Promise<LadeBesluit> {
  const tab = typeof h.tabContext === 'string' ? h.tabContext : '';
  return gegevensLade({ userId: h.userId, rol: h.rol ?? null, tabContext: tab, aiRuimte: tab ? null : huidigeRuimte(), dienst });
}
/** Meerdere diensten in één keer (de hub-blokken en de zoekroute lezen post, hmara en agenda naast elkaar). */
export async function projectieLaden<T extends DeelbareDienst>(h: ProjectieHerkomst, diensten: readonly T[]): Promise<Record<T, LadeBesluit>> {
  const uit = {} as Record<T, LadeBesluit>;
  const besluiten = await Promise.all(diensten.map((d) => projectieLade(h, d)));
  diensten.forEach((d, i) => { uit[d] = besluiten[i]; });
  return uit;
}

/**
 * Alleen de rijen die bij de toegestane lade horen. Weigerde de poort, dan is het antwoord LEEG — nooit «dan toch maar de
 * andere lade». Een rij zonder `ruimte` is persoonlijk (hoortBij), dus geen bestaande rij raakt zoek.
 */
export const rijenInLade = <T extends object>(rijen: readonly T[], besluit: LadeBesluit): T[] =>
  besluit.ok ? rijen.filter((r) => hoortBij(r as { ownerUserId?: unknown; ruimte?: unknown }, besluit.lade)) : [];

/** Mag deze dienst hier iets tonen? (voor velden die geen rij zijn: koppelingsstanden, tellers, momentopnamen.) */
export const ladeOpen = (besluit: LadeBesluit): boolean => besluit.ok;

export type ProjectieGesloten = { dienst: DeelbareDienst; dienstNaam: { uk: string; nl: string }; code: string; uitleg: { uk: string; nl: string } };
/**
 * De eerlijke uitleg bij een weigering, in beide talen — zodat het scherm kan zeggen WAAROM er niets staat in plaats van een
 * lege lijst te tonen die er «normaal» uitziet. `null` als de lade wél open is.
 */
export const projectieGesloten = (dienst: DeelbareDienst, besluit: LadeBesluit): ProjectieGesloten | null =>
  besluit.ok ? null : { dienst, dienstNaam: DIENST_NAAM[dienst], code: besluit.code, uitleg: besluit.uitleg };
/** Alle weigeringen van een reeks diensten, op een rij (lege lijst = alles mocht). */
export const geslotenDiensten = (besluiten: Partial<Record<DeelbareDienst, LadeBesluit>>): ProjectieGesloten[] =>
  (Object.entries(besluiten) as Array<[DeelbareDienst, LadeBesluit]>)
    .map(([d, b]) => projectieGesloten(d, b))
    .filter((x): x is ProjectieGesloten => x !== null);
