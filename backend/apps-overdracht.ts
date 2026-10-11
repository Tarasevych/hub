// «Додатки» (BYOS-PaaS): overdracht van grote of geheime gegevens naar de agent ZONDER dat ze in de database of in de chat komen.
//
// - Opdrachten (app.agent_commands.params) worden bewaard en in het overzicht getoond. Daarom staan de bestanden van een uitrol en
//   de waarde van een geheim daar nooit in: alleen een eenmalig ticket. De agent haalt de inhoud één keer op met zijn eigen token
//   (POST /api/owner/agents/overdracht), alleen het eigen ticket, binnen de geldigheid; daarna is het weg.
// - Geheimen typt de EIGENAAR zelf op een eigen pagina (mcp.*/apps?geheim=<id>): de AI krijgt alleen een link en ziet de waarde nooit.
// - Alles leeft alleen in het geheugen van dit proces (na een herstart opnieuw vragen); niets wordt gelogd.
import { randomBytes } from 'node:crypto';

export type OverdrachtSoort = 'bundel' | 'geheim';
type Ticket = { agentId: string; userId: string; soort: OverdrachtSoort; payload: unknown; bytes: number; verloopt: number };
export type GeheimVerzoek = {
  id: string; userId: string; agentId: string; agentNaam: string; app: string; sleutel: string; uitleg: string;
  verloopt: number; status: 'open' | 'ingevuld' | 'verlopen'; commandId?: string; aangemaakt: number;
};

export const TICKET_RE = /^[A-Za-z0-9_-]{40,64}$/;
export const TICKET_TTL_MS = 10 * 60_000;      // dekt de goedkeuring (max. 5 min) plus wachttijd
export const VERZOEK_TTL_MS = 30 * 60_000;
const MAX_TOTAAL = 96 * 1024 * 1024;           // niet meer dan dit in het geheugen
const MAX_PER_GEBRUIKER = 12;

const tickets = new Map<string, Ticket>();
const verzoeken = new Map<string, GeheimVerzoek>();
const nieuwId = () => randomBytes(32).toString('base64url');

function opruimen(nu = Date.now()) {
  for (const [k, t] of tickets) if (t.verloopt <= nu) tickets.delete(k);
  for (const [k, v] of verzoeken) {
    if (v.verloopt <= nu && v.status === 'open') v.status = 'verlopen';
    if (v.verloopt + VERZOEK_TTL_MS <= nu) verzoeken.delete(k);
  }
}

/** Nieuw eenmalig ticket voor precies deze agent. Gooit bij te veel of te groot (de aanroeper meldt dat aan het model). */
export function maakTicket(agentId: string, userId: string, soort: OverdrachtSoort, payload: unknown, ttlMs = TICKET_TTL_MS): string {
  opruimen();
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  const totaal = [...tickets.values()].reduce((s, t) => s + t.bytes, 0);
  if (totaal + bytes > MAX_TOTAAL) throw new Error('OVERDRACHT_VOL');
  if ([...tickets.values()].filter((t) => t.userId === userId).length >= MAX_PER_GEBRUIKER) throw new Error('OVERDRACHT_TE_VEEL');
  const id = nieuwId();
  tickets.set(id, { agentId, userId, soort, payload, bytes, verloopt: Date.now() + ttlMs });
  return id;
}

/** Eén keer ophalen, alleen door de agent waarvoor het ticket gemaakt is. Fout ticket of andere agent → null (en het ticket blijft niet bestaan). */
export function haalTicket(agentId: string, id: string): { soort: OverdrachtSoort; payload: unknown } | null {
  opruimen();
  if (!TICKET_RE.test(id)) return null;
  const t = tickets.get(id);
  if (!t) return null;
  tickets.delete(id); // eenmalig, ook bij een verkeerde agent (een gelekt ticket is daarna waardeloos)
  if (t.agentId !== agentId) return null;
  return { soort: t.soort, payload: t.payload };
}

export function vergeetTicket(id: string) { tickets.delete(id); }

export function maakGeheimVerzoek(v: Omit<GeheimVerzoek, 'id' | 'verloopt' | 'status' | 'aangemaakt'>): GeheimVerzoek {
  opruimen();
  if ([...verzoeken.values()].filter((x) => x.userId === v.userId && x.status === 'open').length >= MAX_PER_GEBRUIKER) throw new Error('VERZOEK_TE_VEEL');
  const r: GeheimVerzoek = { ...v, id: nieuwId(), verloopt: Date.now() + VERZOEK_TTL_MS, status: 'open', aangemaakt: Date.now() };
  verzoeken.set(r.id, r);
  return r;
}

/** Alleen de eigenaar van het verzoek ziet het (andere gebruikers krijgen null, ook als ze het id kennen). */
export function geheimVerzoek(userId: string, id: string): GeheimVerzoek | null {
  opruimen();
  if (!TICKET_RE.test(id)) return null;
  const v = verzoeken.get(id);
  return v && v.userId === userId ? v : null;
}

export function geheimVerzoekenVan(userId: string): GeheimVerzoek[] {
  opruimen();
  return [...verzoeken.values()].filter((v) => v.userId === userId).sort((a, b) => b.aangemaakt - a.aangemaakt);
}

/** Publieke weergave (zonder ids van andere gebruikers; de waarde bestaat hier nooit). */
export const verzoekPubliek = (v: GeheimVerzoek) => ({
  id: v.id, app: v.app, sleutel: v.sleutel, uitleg: v.uitleg, apparaat: v.agentNaam, status: v.status, verloopt: v.verloopt, aangemaakt: v.aangemaakt, commandId: v.commandId ?? null,
});

/** Alleen voor tests. */
export function _reset() { tickets.clear(); verzoeken.clear(); }
