// Testhulp (geen test zelf): een nagebootste Google Calendar. `fetch` wordt onderschept; er gaat niets naar buiten.
//
// De nabootsing doet de dingen WAAROP de tweerichtingsagenda leunt, en precies zoals Google ze doet:
//   • events.insert met een EIGEN id: een tweede insert met hetzelfde id geeft 409 (daarop rust de idempotentie);
//   • etags die bij elke wijziging veranderen, en If-Match → 412 bij een oude etag (geen stille overschrijving);
//   • events.list met syncToken, nextPageToken en 410 GONE;
//   • events.move, events.patch en DELETE (204 zonder body), ook met If-Match.
import { randomBytes } from 'node:crypto';

export type NepGebeurtenis = Record<string, unknown> & { id: string; etag: string };
export type NepVerzoek = { methode: string; url: string; pad: string; koppen: Record<string, string>; lichaam: Record<string, unknown> | null };

export type NepKalenderOpties = {
  /** Scopes die het token-eindpunt teruggeeft (zoals Google: alle toegestane scopes). */
  scopes: string[];
  agendas?: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string; timeZone?: string }>;
};

export function nepKalender(opties: NepKalenderOpties) {
  const echteFetch = globalThis.fetch;
  const verzoeken: NepVerzoek[] = [];
  const agendas = new Map<string, Map<string, NepGebeurtenis>>();
  /** Antwoorden die de test voor events.list klaarzet (volgorde = volgorde van de aanroepen). */
  const lijstRij: Array<{ status?: number; items?: Record<string, unknown>[]; nextPageToken?: string; nextSyncToken?: string }> = [];
  let scopes = [...opties.scopes];
  const kalenderLijst = opties.agendas || [{ id: 'primary', summary: 'Hoofdagenda', primary: true, accessRole: 'owner', timeZone: 'Europe/Brussels' }];

  const map = (agendaId: string) => { let m = agendas.get(agendaId); if (!m) { m = new Map(); agendas.set(agendaId, m); } return m; };
  const etag = () => `"${randomBytes(8).toString('hex')}"`;
  const antwoord = (status: number, data: unknown) => new Response(status === 204 ? null : JSON.stringify(data ?? {}), { status, headers: { 'content-type': 'application/json' } });

  /** Een afspraak rechtstreeks neerzetten (beginsituatie van een test). */
  const zet = (agendaId: string, gebeurtenis: Record<string, unknown>) => {
    const id = String(gebeurtenis.id || `bestaand-${randomBytes(4).toString('hex')}`);
    const rij = { ...gebeurtenis, id, etag: String(gebeurtenis.etag || etag()) } as NepGebeurtenis;
    map(agendaId).set(id, rij);
    return rij;
  };
  const lees = (agendaId: string, id: string) => map(agendaId).get(id) || null;
  /** De afspraak buiten onze rug om wijzigen — zo ontstaat een echt versieconflict. */
  const wijzigBuitenOm = (agendaId: string, id: string, patch: Record<string, unknown>) => {
    const rij = map(agendaId).get(id);
    if (!rij) return null;
    const nieuw = { ...rij, ...patch, etag: etag() } as NepGebeurtenis;
    map(agendaId).set(id, nieuw);
    return nieuw;
  };
  const zetScopes = (nieuw: string[]) => { scopes = [...nieuw]; };
  const planLijst = (antwoorden: typeof lijstRij) => { lijstRij.length = 0; lijstRij.push(...antwoorden); };

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const methode = String(init?.method || 'GET').toUpperCase();
    const koppen = Object.fromEntries(Object.entries((init?.headers || {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), String(v)]));
    let lichaam: Record<string, unknown> | null = null;
    try { lichaam = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null; } catch { lichaam = null; }
    const pad = url.replace(/^https:\/\/[^/]+/, '').split('?')[0];
    verzoeken.push({ methode, url, pad, koppen, lichaam });

    if (url === 'https://oauth2.googleapis.com/token') return antwoord(200, { access_token: `nep-${randomBytes(4).toString('hex')}`, scope: scopes.join(' '), expires_in: 3600 });
    if (pad === '/calendar/v3/users/me/calendarList') return antwoord(200, { items: kalenderLijst });

    const eventsPad = /^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?(\/move)?$/.exec(pad);
    if (!eventsPad) return antwoord(599, { error: 'nep-onbekend' });
    const agendaId = decodeURIComponent(eventsPad[1]);
    const gebeurtenisId = eventsPad[2] ? decodeURIComponent(eventsPad[2]) : '';
    const isMove = Boolean(eventsPad[3]);

    if (isMove && methode === 'POST') {
      const doel = new URL(url).searchParams.get('destination') || '';
      const rij = map(agendaId).get(gebeurtenisId);
      if (!rij) return antwoord(404, { error: { code: 404 } });
      map(agendaId).delete(gebeurtenisId);
      const verplaatst = { ...rij, etag: etag() } as NepGebeurtenis;
      map(doel).set(gebeurtenisId, verplaatst);
      return antwoord(200, verplaatst);
    }
    if (!gebeurtenisId && methode === 'POST') {
      const id = String(lichaam?.id || `nep-${randomBytes(6).toString('hex')}`);
      if (map(agendaId).has(id)) return antwoord(409, { error: { code: 409, message: 'The requested identifier already exists.' } });
      const rij = { ...(lichaam || {}), id, etag: etag(), status: 'confirmed', updated: new Date().toISOString(), htmlLink: `https://calendar.google.com/${id}` } as NepGebeurtenis;
      map(agendaId).set(id, rij);
      return antwoord(200, rij);
    }
    if (!gebeurtenisId && methode === 'GET') {
      const gepland = lijstRij.shift();
      if (!gepland) return antwoord(200, { items: [], nextSyncToken: `sync-${randomBytes(4).toString('hex')}` });
      if (gepland.status && gepland.status !== 200) return antwoord(gepland.status, { error: { code: gepland.status } });
      return antwoord(200, { items: gepland.items || [], ...(gepland.nextPageToken ? { nextPageToken: gepland.nextPageToken } : {}), ...(gepland.nextSyncToken ? { nextSyncToken: gepland.nextSyncToken } : {}) });
    }
    const bestaand = map(agendaId).get(gebeurtenisId);
    if (methode === 'GET') return bestaand ? antwoord(200, bestaand) : antwoord(404, { error: { code: 404 } });
    if (!bestaand) return antwoord(404, { error: { code: 404 } });
    const ifMatch = koppen['if-match'] || '';
    if (ifMatch && ifMatch !== bestaand.etag) return antwoord(412, { error: { code: 412, message: 'Precondition Failed' } });
    if (methode === 'DELETE') { map(agendaId).delete(gebeurtenisId); return antwoord(204, null); }
    if (methode === 'PUT') { const rij = { ...(lichaam || {}), id: gebeurtenisId, etag: etag(), status: 'confirmed', updated: new Date().toISOString(), htmlLink: bestaand.htmlLink } as NepGebeurtenis; map(agendaId).set(gebeurtenisId, rij); return antwoord(200, rij); }
    if (methode === 'PATCH') { const rij = { ...bestaand, ...(lichaam || {}), id: gebeurtenisId, etag: etag(), updated: new Date().toISOString() } as NepGebeurtenis; map(agendaId).set(gebeurtenisId, rij); return antwoord(200, rij); }
    return antwoord(599, { error: 'nep-methode' });
  }) as typeof fetch;

  const herstel = () => { globalThis.fetch = echteFetch; };
  const schoon = () => { verzoeken.length = 0; };
  return { verzoeken, zet, lees, wijzigBuitenOm, zetScopes, planLijst, herstel, schoon, agendas };
}
