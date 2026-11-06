// ZOEKDIEP-001 (05.11.2026): ÉÉN afspraak voor de diepe links van zoekresultaten.
//
// Tot nu toe schreef de zoekindex (backend/zoek/adapters.ts) `bericht`, `item`, `drive` en `afspraak` in de route, terwijl de
// pagina's iets anders lazen (пошта — `open_message_id`, хмара — `open_item_id`, Google Drive — `open_file_id`) of niets. De kaart
// opende dus de juiste вкладка, maar niet de лист, файл of нотатку zelf. Hier staan de namen die de pagina's ECHT lezen, de
// vertaling van de oude namen (objecten die al in de index staan, worden niet opnieuw geschreven zolang ze niet veranderen) en
// de zuivere hulpjes om een parameter te lezen en daarna uit de adresbalk te halen.
//
// Wie leest wat:
//   open_message_id + open_mail_account (+ open_attachment_id)  src/GoogleMailWerkruimte.tsx  → openMessageById (+ openAttachment)
//   open_item_id   (cloud)                                       src/CloudFunctioneelWeergave.tsx, src/cloud-vnext/CloudPagina.tsx
//   open_file_id + open_drive_principal                          src/DriveBrowser.tsx (cloud → вкладка google)
//   open_event_id  (google:<agenda>:<gebeurtenis>)               src/agenda/Agenda.tsx (hub → вкладка calendar)
//   open_item_id   (hub → notes)                                 src/HubNotities.tsx, src/notities/NotitiesPagina.tsx (zelfde id, 0127)
//   doel=bord:<id> (mcp → board)                                 src/platform/focus-doel.ts → [data-zoek-doel] in McpDienstWeergave
import type { ZoekRoute } from './zoek-model';

export const DIEPE_PARAMS = {
  bericht: 'open_message_id', mailAccount: 'open_mail_account', bijlage: 'open_attachment_id',
  item: 'open_item_id', bestand: 'open_file_id', drivePrincipal: 'open_drive_principal',
  afspraak: 'open_event_id', doel: 'doel',
} as const;

/** Oude parameternamen (vóór 05.11.2026) → de namen die de pagina's lezen. */
export const OUDE_PARAMS: Readonly<Record<string, string>> = {
  bericht: DIEPE_PARAMS.bericht, bijlage: DIEPE_PARAMS.bijlage, item: DIEPE_PARAMS.item, drive: DIEPE_PARAMS.bestand, afspraak: DIEPE_PARAMS.afspraak,
};

/** Agenda-item-id zoals backend/agenda-spiegel.ts het bouwt (google:<agenda>:<gebeurtenis>). */
export const agendaItemId = (agendaId: string, gebeurtenisId: string) => `google:${agendaId || 'primary'}:${gebeurtenisId}`;
/** Doel-sleutel van een bord-item op mcp/board (data-zoek-doel). */
export const bordDoel = (id: string) => `bord:${id}`;

/**
 * Een route uit de index → de vorm die de pagina's lezen. Zuiver; gebruikt voor objecten die al in de index staan.
 * Oude namen worden vertaald. Een taak van het bord ging naar hub/tasks (daar staat geen bord); zij gaat nu naar mcp/board,
 * waar elke taak een eigen kaart heeft. Een nieuwe route blijft ongewijzigd.
 */
export function diepeRoute(route: ZoekRoute | null | undefined, soort?: string): ZoekRoute | null {
  if (!route || typeof route !== 'object') return null;
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(route.params || {})) { if (!v) continue; const nieuw = OUDE_PARAMS[k] || k; if (!params[nieuw]) params[nieuw] = String(v); }
  if (route.host === 'hub' && route.pad === 'tasks' && soort === 'taak' && params[DIEPE_PARAMS.item]) {
    return { host: 'mcp', pad: 'board', params: { [DIEPE_PARAMS.doel]: bordDoel(params[DIEPE_PARAMS.item]) } };
  }
  if (route.host === 'cloud' && route.pad === 'accounts' && params[DIEPE_PARAMS.bestand]) return { ...route, pad: 'google', params };
  if (route.host === 'cloud' && route.pad === 'calendar' && params[DIEPE_PARAMS.afspraak]) return { ...route, host: 'hub', pad: 'calendar', params };
  return { ...route, ...(Object.keys(params).length ? { params } : {}) };
}

/** Is deze route nog oud (een id van het eigen record in plaats van het id dat de pagina opent)? Dan zoekt de server het op. */
export function oudeRecordRoute(route: ZoekRoute | null | undefined): 'mail' | 'drive' | 'agenda' | '' {
  const p = route?.params || {};
  if (p.bericht && !p[DIEPE_PARAMS.bericht]) return 'mail';
  if (p.drive && !p[DIEPE_PARAMS.bestand]) return 'drive';
  if (p.afspraak && !p[DIEPE_PARAMS.afspraak]) return 'agenda';
  return '';
}

// ------------------------------------------------------------------------------------------------ in de browser
const ID_OK = /^[\x21-\x7e]{1,1100}$/;
/** De waarde van een diepe parameter uit een zoekreeks (zuiver; alleen zichtbare ASCII, ≤ 1100 tekens). */
export function diepeWaarde(search: string, naam: string): string {
  try { const v = new URLSearchParams(search).get(naam) || ''; return ID_OK.test(v) ? v : ''; } catch { return ''; }
}
/** Haalt de genoemde parameters uit de adresbalk (zonder nieuwe geschiedenisstap). */
export function wisDiepeParams(...namen: string[]): void {
  // Via globalThis: deze module hoort ook bij de server (tsconfig.server.json kent geen DOM).
  const w = globalThis as unknown as { location?: { href: string }; history?: { state: unknown; replaceState: (s: unknown, t: string, u: string) => void } };
  try {
    if (!w.location || !w.history) return;
    const u = new URL(w.location.href); let weg = false;
    for (const n of namen) if (u.searchParams.has(n)) { u.searchParams.delete(n); weg = true; }
    if (weg) w.history.replaceState(w.history.state, '', `${u.pathname}${u.search}${u.hash}`);
  } catch { /* geen browser */ }
}
