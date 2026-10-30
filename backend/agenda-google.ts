// Google Calendar — SCHRIJVEN. Hiermee is de agenda van de hub werkelijk tweerichtings: aanmaken, wijzigen,
// verplaatsen (ook naar een andere agenda), wissen, deelnemers erbij of eraf, en zelf antwoorden op een
// uitnodiging (RSVP). Lezen deed de site al (backend/google-suite-agenda-fotos.ts en de synchronisatie in
// backend/google-suite-agenda-sync.ts).
//
// Drie regels waaraan alles hier hangt:
//
// 1. RECHT. Zonder de scope `calendar.events` in de canonieke grant schrijft deze module NIETS: elke
//    schrijffunctie begint met googleSuiteAgendaScopeStatus en geeft anders AGENDA_SCHRIJFRECHT_ONTBREEKT.
//    Wie eerder alleen-lezen koppelde, krijgt géén foutmelding maar de uitbreidingsstap
//    (googleSuiteStartAgendaUitbreiding) — incrementele autorisatie, geen nieuwe koppeling.
//
// 2. VERSIES (geen stille overschrijving). Elke wijziging en elke verwijdering gaat met
//    `If-Match: <etag>` van de versie die wij kenden. Google antwoordt 412 als de afspraak intussen in Google
//    is veranderd. Dan overschrijven we NIETS: we halen de verse versie op en geven die met AGENDA_CONFLICT
//    terug, zodat de mens (of de AI, met zijn bevestiging) beslist. Google is de waarheidsbron
//    (shared/agenda-model.ts → WAARHEIDSBRON) — onze tabel is een spiegel.
//    Wie bewust wil overschrijven, stuurt `negeerVersie: true` mee; dan laten we If-Match weg. Dat is een
//    expliciete keuze van de aanroeper en nooit de standaard.
//
// 3. IDEMPOTENTIE. Elke aanroep draagt een `idempotentieSleutel` mee.
//    • Aanmaken: het Google-gebeurtenis-id wordt DETERMINISTISCH uit die sleutel afgeleid (sha256 →
//      base32hex, wat events.insert als eigen id accepteert). Een tweede poging met dezelfde sleutel levert
//      dus hetzelfde id; Google weigert dat met 409 en wij geven de bestaande afspraak terug als «ok».
//    • Wijzigen/wissen/RSVP: de sleutel staat in app.agenda_koppeling met de uitslag van de eerste poging; een
//      tweede, gelijke poging leest die uitslag en verstuurt niets.
import { createHash } from 'node:crypto';
import { AGENDA_FOUT, gebeurtenisIdUitDigest, naarGoogleLichaam, normaliseerVorm, schrijfUitslag, uitGoogleGebeurtenis, vormFouten, type AgendaVorm, type Antwoord } from '../shared/agenda-model';
import { AGENDA_SCHRIJF_SCOPE, googleSuiteAgendaScopeStatusVoorEmail, googleSuitePrincipalAccessToken } from './google-suite-inrichting';
import { koppelAf, koppelClaim, koppelLees, koppelVanLokaal, laatsteEtag, spiegelLeg, spiegelRijUitGoogle, spiegelWis, spiegelZoek, type KoppelActie } from './agenda-spiegel';

const API = 'https://www.googleapis.com/calendar/v3';
const TIJD_MS = 20000;
const kort = (value: unknown, max = 1200) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
/** Een agenda-id is een e-mailachtige sleutel of 'primary'; nooit een pad met schuine strepen. */
export const geldigAgendaId = (waarde: unknown): string => {
  const id = kort(waarde, 500) || 'primary';
  return /^[A-Za-z0-9._%+@#=-]{1,500}$/.test(id) ? id : '';
};
export const geldigGebeurtenisId = (waarde: unknown): string => {
  const id = kort(waarde, 1024);
  return /^[A-Za-z0-9_@.-]{5,1024}$/.test(id) ? id : '';
};

const fetchMetTijd = async (url: string, init: RequestInit, reden: string) => {
  const stuurder = new AbortController(), klok = setTimeout(() => stuurder.abort(), TIJD_MS);
  try { return await fetch(url, { ...init, signal: stuurder.signal }); } catch { throw new Error(reden); } finally { clearTimeout(klok); }
};

/**
 * GESCHEIDEN GEGEVENSRUIMTES (migraties 0082 + 0084): hier staat BEWUST geen `ruimte` in, en dat is geen vergetelheid.
 * Dit bestand praat met Google en raakt zelf geen enkele tabel aan; álles wat het leest of schrijft gaat door
 *   • backend/google-suite-inrichting.ts  (de koppeling, de scopes, het toegangstoken) en
 *   • backend/agenda-spiegel.ts           (de spiegel, de etags, het idempotentiegeheugen),
 * en die twee halen de lade uit de lopende aanroep (`ladeOf`, backend/ruimte-cloud-agenda.ts). Zou de lade hier ook
 * nog in de context staan, dan waren er twee waarheden en kon er één van de twee verkeerd zijn. Daarom één:
 * de poort om de routes (`ladePoort` in backend/agenda-routes.ts) zet haar, en dit bestand merkt er niets van.
 */
export type AgendaContext = { ownerUserId: string; email: string };
type Recht = { token: string; principalId: string; schrijven: boolean };

/** Toegang klaarzetten: het recht controleren en een vers toegangstoken halen (tokens staan nooit op schijf). */
async function rechtVoor(ctx: AgendaContext, schrijvenNodig: boolean): Promise<Recht | { fout: string }> {
  const stand = await googleSuiteAgendaScopeStatusVoorEmail(ctx.ownerUserId, ctx.email);
  if (!stand.principalId) return { fout: 'GOOGLE_SUITE_PRIMARY_PRINCIPAL_NOT_FOUND' };
  if (!stand.lezen) return { fout: 'AGENDA_LEESRECHT_ONTBREEKT' };
  if (schrijvenNodig && !stand.schrijven) return { fout: AGENDA_FOUT.recht };
  const token = await googleSuitePrincipalAccessToken(ctx.ownerUserId, stand.principalId, 'calendar');
  return { token, principalId: stand.principalId, schrijven: stand.schrijven };
}

type Antwoordje = { status: number; data: Record<string, unknown> };
async function api(token: string, pad: string, init: { method?: string; lichaam?: unknown; etag?: string } = {}): Promise<Antwoordje> {
  const koppen: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // If-Match alleen als we een versie kennen: een lege If-Match zou «elke versie» betekenen en dat is precies
  // de stille overschrijving die we willen voorkomen.
  if (init.etag) koppen['If-Match'] = init.etag;
  const respons = await fetchMetTijd(`${API}${pad}`, {
    method: init.method || 'GET', headers: koppen,
    ...(init.lichaam === undefined ? {} : { body: JSON.stringify(init.lichaam) }),
  }, 'AGENDA_GOOGLE_TIJD_OVERSCHREDEN');
  let data: Record<string, unknown> = {};
  try { data = (await respons.json()) as Record<string, unknown>; } catch { data = {}; }
  return { status: respons.status, data };
}

/** De agenda's van de gebruiker, met of ze beschrijfbaar zijn (owner/writer bij Google, plus ons eigen recht). */
export async function agendaLijst(ctx: AgendaContext): Promise<{ agendas: Array<{ id: string; naam: string; primair: boolean; rol: string; schrijfbaar: boolean; tijdzone: string; kleur: string }>; schrijven: boolean } | { fout: string }> {
  const recht = await rechtVoor(ctx, false);
  if ('fout' in recht) return recht;
  const uit = await api(recht.token, '/users/me/calendarList?maxResults=250&fields=items(id,summary,primary,accessRole,backgroundColor,timeZone)');
  if (uit.status < 200 || uit.status >= 300) return { fout: 'AGENDA_LIJST_MISLUKT' };
  const items = Array.isArray(uit.data.items) ? uit.data.items : [];
  return {
    schrijven: recht.schrijven,
    agendas: items.map((item) => {
      const rij = (item || {}) as Record<string, unknown>;
      const rol = kort(rij.accessRole, 80);
      return {
        id: kort(rij.id, 500), naam: kort(rij.summary, 300), primair: Boolean(rij.primary), rol,
        // Eerlijk: schrijfbaar is ALLEEN waar als Google ons die rol geeft ÉN wij de scope hebben.
        schrijfbaar: recht.schrijven && (rol === 'owner' || rol === 'writer'),
        tijdzone: kort(rij.timeZone, 80), kleur: kort(rij.backgroundColor, 40),
      };
    }).filter((rij) => rij.id),
  };
}

/** Één afspraak verse uit Google (voor een conflict, of om de spiegel bij te werken). */
export async function gebeurtenisLees(ctx: AgendaContext, agendaId: string, gebeurtenisId: string): Promise<{ gebeurtenis: Record<string, unknown>; vorm: AgendaVorm } | { fout: string }> {
  const recht = await rechtVoor(ctx, false);
  if ('fout' in recht) return recht;
  const uit = await api(recht.token, `/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(gebeurtenisId)}`);
  const uitslag = schrijfUitslag(uit.status);
  if (uitslag === 'weg') return { fout: AGENDA_FOUT.weg };
  if (uitslag !== 'ok') return { fout: AGENDA_FOUT.fout };
  return { gebeurtenis: uit.data, vorm: uitGoogleGebeurtenis(uit.data, agendaId) };
}

export type SchrijfAntwoord = {
  ok: boolean;
  /** 'ok' | 'conflict' | 'weg' | 'geen-recht' | 'fout' | 'herhaald' (de sleutel was al gebruikt). */
  uitslag: string;
  fout?: string;
  gebeurtenisId?: string;
  agendaId?: string;
  etag?: string;
  /** Bij een conflict: de versie die NU in Google staat, zodat de mens kan vergelijken. */
  google?: AgendaVorm;
  vorm?: AgendaVorm;
  koppeling?: string;
  /** Wat de aanroeper moet doen als het recht ontbreekt. */
  uitbreiding?: { nodig: boolean; scope: string };
};

const uitbreidingHint = (fout: string) => (fout === AGENDA_FOUT.recht ? { uitbreiding: { nodig: true, scope: AGENDA_SCHRIJF_SCOPE } } : {});

/** De uitslag van een eerdere, gelijke poging teruggeven — zonder iets naar Google te sturen. */
const herhaaldAntwoord = (rij: NonNullable<Awaited<ReturnType<typeof koppelLees>>>): SchrijfAntwoord => ({
  ok: rij.staat === 'klaar', uitslag: rij.staat === 'klaar' ? 'herhaald' : rij.staat,
  ...(rij.staat === 'klaar' ? {} : { fout: rij.fout || AGENDA_FOUT.fout }),
  gebeurtenisId: rij.providerGebeurtenisId, agendaId: rij.agendaId, etag: rij.etag,
  koppeling: kort((rij.uitslag as Record<string, unknown>).koppeling, 1600),
});
/** Hoe lang een verliezer van de wedloop op de winnaar wacht voordat hij «nog bezig» antwoordt. */
const WACHT_STAPPEN = 10;
const WACHT_MS = 300;
const rust = (ms: number) => new Promise<void>((klaar) => { setTimeout(klaar, ms); });
/**
 * Twee gelijke verzoeken tegelijk: één claimt de sleutel en schrijft, de ander komt hier. Die stuurt NIETS naar
 * Google — hij wacht kort op de uitslag van de winnaar en geeft die terug, zodat de aanroeper één duidelijk
 * antwoord krijgt in plaats van «probeer nog eens». Blijft het te lang stil, dan zeggen we dat ook eerlijk
 * (uitslag 'bezig'): de aanroeper mag dezelfde sleutel opnieuw gebruiken, dat is immers onschadelijk.
 */
async function herhaaldOf(ownerUserId: string, sleutel: string, rij: NonNullable<Awaited<ReturnType<typeof koppelLees>>>): Promise<SchrijfAntwoord> {
  let laatste = rij;
  for (let stap = 0; stap < WACHT_STAPPEN && laatste.staat === 'bezig'; stap += 1) {
    await rust(WACHT_MS);
    laatste = (await koppelLees(ownerUserId, sleutel)) || laatste;
  }
  if (laatste.staat !== 'bezig') return herhaaldAntwoord(laatste);
  return { ok: false, uitslag: 'bezig', fout: 'AGENDA_BEZIG', agendaId: laatste.agendaId, gebeurtenisId: laatste.providerGebeurtenisId };
}

/** sha256(sleutel|eigenaar) → een geldig, eigen Google-gebeurtenis-id. Deterministisch: dat IS de idempotentie. */
export const gebeurtenisIdVoor = (ownerUserId: string, sleutel: string): string =>
  gebeurtenisIdUitDigest(createHash('sha256').update(`mijn-ruimte-agenda:${ownerUserId}:${sleutel}`).digest('hex'));

async function bewaarUitslag(ctx: AgendaContext, sleutel: string, agendaId: string, gebeurtenis: Record<string, unknown>, principalId: string, actie: KoppelActie, lokaalId: string): Promise<SchrijfAntwoord> {
  const rij = spiegelRijUitGoogle(ctx.ownerUserId, principalId, agendaId, gebeurtenis, { lokaalId });
  await spiegelLeg(ctx.ownerUserId, rij);
  await koppelAf(ctx.ownerUserId, sleutel, {
    staat: 'klaar', providerGebeurtenisId: rij.providerEventId, etag: rij.etag,
    // Zodra Google de afspraak heeft, is Google de waarheidsbron. Daarvoor stond hier 'lokaal'.
    waarheidsbron: 'google', uitslag: { koppeling: rij.htmlLink, actie },
  });
  return { ok: true, uitslag: 'ok', gebeurtenisId: rij.providerEventId, agendaId, etag: rij.etag, koppeling: rij.htmlLink, vorm: uitGoogleGebeurtenis(gebeurtenis, agendaId) };
}

async function conflictAntwoord(ctx: AgendaContext, sleutel: string, agendaId: string, gebeurtenisId: string): Promise<SchrijfAntwoord> {
  const vers = await gebeurtenisLees(ctx, agendaId, gebeurtenisId);
  const google = 'fout' in vers ? undefined : vers.vorm;
  if (!('fout' in vers)) {
    const recht = await rechtVoor(ctx, false);
    // De spiegel meteen op de ECHTE versie zetten: anders blijft de volgende poging op dezelfde oude etag stuiten.
    if (!('fout' in recht)) await spiegelLeg(ctx.ownerUserId, spiegelRijUitGoogle(ctx.ownerUserId, recht.principalId, agendaId, vers.gebeurtenis));
  }
  await koppelAf(ctx.ownerUserId, sleutel, { staat: 'conflict', fout: AGENDA_FOUT.conflict, etag: google?.etag || '', uitslag: { conflict: true } });
  return { ok: false, uitslag: 'conflict', fout: AGENDA_FOUT.conflict, agendaId, gebeurtenisId, google };
}

export type AanmaakVerzoek = { sleutel: string; lokaalId?: string; vorm: unknown; meldDeelnemers?: 'all' | 'externalOnly' | 'none' };
/** Aanmaken, idempotent: hetzelfde `sleutel` levert altijd dezelfde afspraak, nooit een tweede. */
export async function gebeurtenisAanmaken(ctx: AgendaContext, verzoek: AanmaakVerzoek): Promise<SchrijfAntwoord> {
  const sleutel = verzoek.sleutel;
  const vorm = normaliseerVorm(verzoek.vorm);
  const agendaId = geldigAgendaId(vorm.agendaId);
  if (!agendaId) return { ok: false, uitslag: 'fout', fout: AGENDA_FOUT.agenda };
  const fouten = vormFouten(vorm);
  if (fouten.length) return { ok: false, uitslag: 'fout', fout: fouten[0] };
  const recht = await rechtVoor(ctx, true);
  if ('fout' in recht) return { ok: false, uitslag: recht.fout === AGENDA_FOUT.recht ? 'geen-recht' : 'fout', fout: recht.fout, ...uitbreidingHint(recht.fout) };
  const lokaalId = kort(verzoek.lokaalId, 120) || sleutel;
  const eigenId = gebeurtenisIdVoor(ctx.ownerUserId, sleutel);
  const claim = await koppelClaim(ctx.ownerUserId, sleutel, 'aanmaken', lokaalId, agendaId, eigenId);
  if (!claim.nieuw && claim.rij) return herhaaldOf(ctx.ownerUserId, sleutel, claim.rij);
  const vraag = new URLSearchParams({ conferenceDataVersion: '0', sendUpdates: verzoek.meldDeelnemers || 'none' });
  const uit = await api(recht.token, `/calendars/${encodeURIComponent(agendaId)}/events?${vraag}`, { method: 'POST', lichaam: { ...naarGoogleLichaam(vorm), id: eigenId } });
  const uitslag = schrijfUitslag(uit.status);
  if (uitslag === 'ok') return bewaarUitslag(ctx, sleutel, agendaId, uit.data, recht.principalId, 'aanmaken', lokaalId);
  if (uitslag === 'bestaat') {
    // 409: het eigen id bestaat al — dus de vorige poging IS gelukt. Dat is geen fout, dat is idempotentie.
    const vers = await gebeurtenisLees(ctx, agendaId, eigenId);
    if (!('fout' in vers)) return { ...await bewaarUitslag(ctx, sleutel, agendaId, vers.gebeurtenis, recht.principalId, 'aanmaken', lokaalId), uitslag: 'herhaald' };
  }
  const fout = uitslag === 'geen-recht' ? AGENDA_FOUT.recht : AGENDA_FOUT.fout;
  await koppelAf(ctx.ownerUserId, sleutel, { staat: 'fout', fout, uitslag: { status: uit.status } });
  return { ok: false, uitslag, fout, agendaId, ...uitbreidingHint(fout) };
}

export type WijzigVerzoek = { sleutel: string; agendaId: string; gebeurtenisId: string; vorm: unknown; etag?: string; negeerVersie?: boolean; meldDeelnemers?: 'all' | 'externalOnly' | 'none' };
/** Wijzigen met versiecontrole. Zonder `negeerVersie` gaat de bekende etag als If-Match mee. */
export async function gebeurtenisWijzigen(ctx: AgendaContext, verzoek: WijzigVerzoek): Promise<SchrijfAntwoord> {
  const sleutel = verzoek.sleutel;
  const agendaId = geldigAgendaId(verzoek.agendaId), gebeurtenisId = geldigGebeurtenisId(verzoek.gebeurtenisId);
  if (!agendaId || !gebeurtenisId) return { ok: false, uitslag: 'fout', fout: AGENDA_FOUT.agenda };
  const vorm = normaliseerVorm({ ...(verzoek.vorm && typeof verzoek.vorm === 'object' ? verzoek.vorm : {}), agendaId, gebeurtenisId });
  const fouten = vormFouten(vorm);
  if (fouten.length) return { ok: false, uitslag: 'fout', fout: fouten[0] };
  const recht = await rechtVoor(ctx, true);
  if ('fout' in recht) return { ok: false, uitslag: recht.fout === AGENDA_FOUT.recht ? 'geen-recht' : 'fout', fout: recht.fout, ...uitbreidingHint(recht.fout) };
  const claim = await koppelClaim(ctx.ownerUserId, sleutel, 'wijzigen', kort(verzoek.gebeurtenisId, 120), agendaId, gebeurtenisId);
  if (!claim.nieuw && claim.rij) return herhaaldOf(ctx.ownerUserId, sleutel, claim.rij);
  const etag = verzoek.negeerVersie === true ? '' : (kort(verzoek.etag, 300) || await laatsteEtag(ctx.ownerUserId, agendaId, gebeurtenisId));
  const vraag = new URLSearchParams({ sendUpdates: verzoek.meldDeelnemers || 'none' });
  const uit = await api(recht.token, `/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(gebeurtenisId)}?${vraag}`, { method: 'PUT', lichaam: naarGoogleLichaam(vorm), etag });
  const uitslag = schrijfUitslag(uit.status);
  if (uitslag === 'ok') return bewaarUitslag(ctx, sleutel, agendaId, uit.data, recht.principalId, 'wijzigen', kort(verzoek.gebeurtenisId, 120));
  if (uitslag === 'conflict') return conflictAntwoord(ctx, sleutel, agendaId, gebeurtenisId);
  if (uitslag === 'weg') { await spiegelWis(ctx.ownerUserId, agendaId, gebeurtenisId); await koppelAf(ctx.ownerUserId, sleutel, { staat: 'weg', fout: AGENDA_FOUT.weg }); return { ok: false, uitslag, fout: AGENDA_FOUT.weg, agendaId, gebeurtenisId }; }
  const fout = uitslag === 'geen-recht' ? AGENDA_FOUT.recht : AGENDA_FOUT.fout;
  await koppelAf(ctx.ownerUserId, sleutel, { staat: 'fout', fout, uitslag: { status: uit.status } });
  return { ok: false, uitslag, fout, agendaId, gebeurtenisId, ...uitbreidingHint(fout) };
}

export type VerplaatsVerzoek = { sleutel: string; agendaId: string; gebeurtenisId: string; naarAgendaId: string; meldDeelnemers?: 'all' | 'externalOnly' | 'none' };
/**
 * Verplaatsen naar een ANDERE agenda (events.move). Let op: dit verzet de afspraak van agenda naar agenda.
 * Een afspraak naar een ander TIJDSTIP verzetten is gewoon «wijzigen» (begin/einde) — dat heeft If-Match en dus
 * versiecontrole. events.move kent geen If-Match; daarom lezen we de afspraak eerst en vergelijken we de etag
 * zelf, zodat ook hier niets stil overschreven wordt.
 */
export async function gebeurtenisVerplaatsen(ctx: AgendaContext, verzoek: VerplaatsVerzoek & { etag?: string; negeerVersie?: boolean }): Promise<SchrijfAntwoord> {
  const sleutel = verzoek.sleutel;
  const agendaId = geldigAgendaId(verzoek.agendaId), gebeurtenisId = geldigGebeurtenisId(verzoek.gebeurtenisId), doel = geldigAgendaId(verzoek.naarAgendaId);
  if (!agendaId || !gebeurtenisId || !doel) return { ok: false, uitslag: 'fout', fout: AGENDA_FOUT.agenda };
  const recht = await rechtVoor(ctx, true);
  if ('fout' in recht) return { ok: false, uitslag: recht.fout === AGENDA_FOUT.recht ? 'geen-recht' : 'fout', fout: recht.fout, ...uitbreidingHint(recht.fout) };
  const claim = await koppelClaim(ctx.ownerUserId, sleutel, 'verplaatsen', kort(verzoek.gebeurtenisId, 120), doel, gebeurtenisId);
  if (!claim.nieuw && claim.rij) return herhaaldOf(ctx.ownerUserId, sleutel, claim.rij);
  const verwacht = verzoek.negeerVersie === true ? '' : (kort(verzoek.etag, 300) || await laatsteEtag(ctx.ownerUserId, agendaId, gebeurtenisId));
  if (verwacht) {
    const vers = await gebeurtenisLees(ctx, agendaId, gebeurtenisId);
    if ('fout' in vers) { await koppelAf(ctx.ownerUserId, sleutel, { staat: vers.fout === AGENDA_FOUT.weg ? 'weg' : 'fout', fout: vers.fout }); return { ok: false, uitslag: vers.fout === AGENDA_FOUT.weg ? 'weg' : 'fout', fout: vers.fout, agendaId, gebeurtenisId }; }
    if (vers.vorm.etag && vers.vorm.etag !== verwacht) return conflictAntwoord(ctx, sleutel, agendaId, gebeurtenisId);
  }
  const vraag = new URLSearchParams({ destination: doel, sendUpdates: verzoek.meldDeelnemers || 'none' });
  const uit = await api(recht.token, `/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(gebeurtenisId)}/move?${vraag}`, { method: 'POST' });
  const uitslag = schrijfUitslag(uit.status);
  if (uitslag === 'ok') { await spiegelWis(ctx.ownerUserId, agendaId, gebeurtenisId); return bewaarUitslag(ctx, sleutel, doel, uit.data, recht.principalId, 'verplaatsen', kort(verzoek.gebeurtenisId, 120)); }
  if (uitslag === 'weg') { await spiegelWis(ctx.ownerUserId, agendaId, gebeurtenisId); await koppelAf(ctx.ownerUserId, sleutel, { staat: 'weg', fout: AGENDA_FOUT.weg }); return { ok: false, uitslag, fout: AGENDA_FOUT.weg, agendaId, gebeurtenisId }; }
  const fout = uitslag === 'geen-recht' ? AGENDA_FOUT.recht : AGENDA_FOUT.fout;
  await koppelAf(ctx.ownerUserId, sleutel, { staat: 'fout', fout, uitslag: { status: uit.status } });
  return { ok: false, uitslag, fout, agendaId, gebeurtenisId, ...uitbreidingHint(fout) };
}

export type WisVerzoek = { sleutel: string; agendaId: string; gebeurtenisId: string; etag?: string; negeerVersie?: boolean; meldDeelnemers?: 'all' | 'externalOnly' | 'none' };
/** Wissen met versiecontrole. Al weg (404/410) telt als gelukt: de bedoeling is bereikt. */
export async function gebeurtenisVerwijderen(ctx: AgendaContext, verzoek: WisVerzoek): Promise<SchrijfAntwoord> {
  const sleutel = verzoek.sleutel;
  const agendaId = geldigAgendaId(verzoek.agendaId), gebeurtenisId = geldigGebeurtenisId(verzoek.gebeurtenisId);
  if (!agendaId || !gebeurtenisId) return { ok: false, uitslag: 'fout', fout: AGENDA_FOUT.agenda };
  const recht = await rechtVoor(ctx, true);
  if ('fout' in recht) return { ok: false, uitslag: recht.fout === AGENDA_FOUT.recht ? 'geen-recht' : 'fout', fout: recht.fout, ...uitbreidingHint(recht.fout) };
  const claim = await koppelClaim(ctx.ownerUserId, sleutel, 'verwijderen', kort(verzoek.gebeurtenisId, 120), agendaId, gebeurtenisId);
  if (!claim.nieuw && claim.rij) return herhaaldOf(ctx.ownerUserId, sleutel, claim.rij);
  const etag = verzoek.negeerVersie === true ? '' : (kort(verzoek.etag, 300) || await laatsteEtag(ctx.ownerUserId, agendaId, gebeurtenisId));
  const vraag = new URLSearchParams({ sendUpdates: verzoek.meldDeelnemers || 'none' });
  const uit = await api(recht.token, `/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(gebeurtenisId)}?${vraag}`, { method: 'DELETE', etag });
  const uitslag = schrijfUitslag(uit.status);
  if (uitslag === 'ok' || uitslag === 'weg') {
    await spiegelWis(ctx.ownerUserId, agendaId, gebeurtenisId);
    await koppelAf(ctx.ownerUserId, sleutel, { staat: 'klaar', waarheidsbron: 'google', uitslag: { actie: 'verwijderen', alWeg: uitslag === 'weg' } });
    return { ok: true, uitslag: 'ok', agendaId, gebeurtenisId };
  }
  if (uitslag === 'conflict') return conflictAntwoord(ctx, sleutel, agendaId, gebeurtenisId);
  const fout = uitslag === 'geen-recht' ? AGENDA_FOUT.recht : AGENDA_FOUT.fout;
  await koppelAf(ctx.ownerUserId, sleutel, { staat: 'fout', fout, uitslag: { status: uit.status } });
  return { ok: false, uitslag, fout, agendaId, gebeurtenisId, ...uitbreidingHint(fout) };
}

export type DeelnemerVerzoek = { sleutel: string; agendaId: string; gebeurtenisId: string; toevoegen?: unknown; verwijderen?: unknown; etag?: string; negeerVersie?: boolean; meldDeelnemers?: 'all' | 'externalOnly' | 'none' };
/**
 * Deelnemers erbij of eraf. Google's `attendees` is één lijst die je in zijn geheel meestuurt; daarom lezen we
 * de afspraak eerst, passen we de lijst aan en schrijven we die terug met If-Match. Zo gaat niemand verloren
 * doordat twee mensen tegelijk iemand uitnodigen — de tweede krijgt AGENDA_CONFLICT.
 */
export async function gebeurtenisDeelnemers(ctx: AgendaContext, verzoek: DeelnemerVerzoek): Promise<SchrijfAntwoord> {
  const sleutel = verzoek.sleutel;
  const agendaId = geldigAgendaId(verzoek.agendaId), gebeurtenisId = geldigGebeurtenisId(verzoek.gebeurtenisId);
  if (!agendaId || !gebeurtenisId) return { ok: false, uitslag: 'fout', fout: AGENDA_FOUT.agenda };
  const recht = await rechtVoor(ctx, true);
  if ('fout' in recht) return { ok: false, uitslag: recht.fout === AGENDA_FOUT.recht ? 'geen-recht' : 'fout', fout: recht.fout, ...uitbreidingHint(recht.fout) };
  const claim = await koppelClaim(ctx.ownerUserId, sleutel, 'deelnemers', kort(verzoek.gebeurtenisId, 120), agendaId, gebeurtenisId);
  if (!claim.nieuw && claim.rij) return herhaaldOf(ctx.ownerUserId, sleutel, claim.rij);
  const vers = await gebeurtenisLees(ctx, agendaId, gebeurtenisId);
  if ('fout' in vers) { await koppelAf(ctx.ownerUserId, sleutel, { staat: vers.fout === AGENDA_FOUT.weg ? 'weg' : 'fout', fout: vers.fout }); return { ok: false, uitslag: vers.fout === AGENDA_FOUT.weg ? 'weg' : 'fout', fout: vers.fout, agendaId, gebeurtenisId }; }
  const verwacht = verzoek.negeerVersie === true ? '' : (kort(verzoek.etag, 300) || await laatsteEtag(ctx.ownerUserId, agendaId, gebeurtenisId));
  if (verwacht && vers.vorm.etag && vers.vorm.etag !== verwacht) return conflictAntwoord(ctx, sleutel, agendaId, gebeurtenisId);
  const erbij = normaliseerVorm({ deelnemers: verzoek.toevoegen }).deelnemers;
  const eraf = new Set(normaliseerVorm({ deelnemers: verzoek.verwijderen }).deelnemers.map((d) => d.email));
  const lijst = [...vers.vorm.deelnemers.filter((d) => !eraf.has(d.email))];
  for (const nieuw of erbij) if (!lijst.some((d) => d.email === nieuw.email)) lijst.push(nieuw);
  const nieuweVorm: AgendaVorm = { ...vers.vorm, deelnemers: lijst };
  const vraag = new URLSearchParams({ sendUpdates: verzoek.meldDeelnemers || 'all' });
  const uit = await api(recht.token, `/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(gebeurtenisId)}?${vraag}`, { method: 'PUT', lichaam: naarGoogleLichaam(nieuweVorm), etag: vers.vorm.etag });
  const uitslag = schrijfUitslag(uit.status);
  if (uitslag === 'ok') return bewaarUitslag(ctx, sleutel, agendaId, uit.data, recht.principalId, 'deelnemers', kort(verzoek.gebeurtenisId, 120));
  if (uitslag === 'conflict') return conflictAntwoord(ctx, sleutel, agendaId, gebeurtenisId);
  const fout = uitslag === 'geen-recht' ? AGENDA_FOUT.recht : AGENDA_FOUT.fout;
  await koppelAf(ctx.ownerUserId, sleutel, { staat: 'fout', fout, uitslag: { status: uit.status } });
  return { ok: false, uitslag, fout, agendaId, gebeurtenisId, ...uitbreidingHint(fout) };
}

export type AntwoordVerzoek = { sleutel: string; agendaId: string; gebeurtenisId: string; antwoord: Antwoord; opmerking?: string; etag?: string; negeerVersie?: boolean };
/**
 * RSVP: antwoorden op een uitnodiging. Google heeft hier geen eigen route voor — je zet `responseStatus` van
 * de deelnemer die JIJ bent (`self: true`) en stuurt de lijst terug. Daarom: lezen, de eigen rij aanpassen,
 * en met If-Match terugschrijven via events.patch (alleen `attendees`, zodat we niets anders aanraken).
 */
export async function gebeurtenisAntwoord(ctx: AgendaContext, verzoek: AntwoordVerzoek): Promise<SchrijfAntwoord> {
  const sleutel = verzoek.sleutel;
  const agendaId = geldigAgendaId(verzoek.agendaId), gebeurtenisId = geldigGebeurtenisId(verzoek.gebeurtenisId);
  if (!agendaId || !gebeurtenisId) return { ok: false, uitslag: 'fout', fout: AGENDA_FOUT.agenda };
  const recht = await rechtVoor(ctx, true);
  if ('fout' in recht) return { ok: false, uitslag: recht.fout === AGENDA_FOUT.recht ? 'geen-recht' : 'fout', fout: recht.fout, ...uitbreidingHint(recht.fout) };
  const claim = await koppelClaim(ctx.ownerUserId, sleutel, 'rsvp', kort(verzoek.gebeurtenisId, 120), agendaId, gebeurtenisId);
  if (!claim.nieuw && claim.rij) return herhaaldOf(ctx.ownerUserId, sleutel, claim.rij);
  const vers = await gebeurtenisLees(ctx, agendaId, gebeurtenisId);
  if ('fout' in vers) { await koppelAf(ctx.ownerUserId, sleutel, { staat: vers.fout === AGENDA_FOUT.weg ? 'weg' : 'fout', fout: vers.fout }); return { ok: false, uitslag: vers.fout === AGENDA_FOUT.weg ? 'weg' : 'fout', fout: vers.fout, agendaId, gebeurtenisId }; }
  const verwacht = verzoek.negeerVersie === true ? '' : (kort(verzoek.etag, 300) || vers.vorm.etag);
  const eigen = vers.vorm.deelnemers.find((d) => d.zelf) || vers.vorm.deelnemers.find((d) => d.email === String(ctx.email || '').toLowerCase());
  if (!eigen) { await koppelAf(ctx.ownerUserId, sleutel, { staat: 'fout', fout: 'AGENDA_GEEN_DEELNEMER' }); return { ok: false, uitslag: 'fout', fout: 'AGENDA_GEEN_DEELNEMER', agendaId, gebeurtenisId }; }
  const lichaam = {
    attendees: vers.vorm.deelnemers.map((d) => ({
      email: d.email, ...(d.naam ? { displayName: d.naam } : {}), ...(d.optioneel ? { optional: true } : {}),
      responseStatus: d.email === eigen.email ? verzoek.antwoord : d.antwoord,
      ...(d.email === eigen.email && verzoek.opmerking ? { comment: kort(verzoek.opmerking, 1000) } : {}),
    })),
  };
  const uit = await api(recht.token, `/calendars/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(gebeurtenisId)}?sendUpdates=all`, { method: 'PATCH', lichaam, etag: verwacht });
  const uitslag = schrijfUitslag(uit.status);
  if (uitslag === 'ok') return bewaarUitslag(ctx, sleutel, agendaId, uit.data, recht.principalId, 'rsvp', kort(verzoek.gebeurtenisId, 120));
  if (uitslag === 'conflict') return conflictAntwoord(ctx, sleutel, agendaId, gebeurtenisId);
  const fout = uitslag === 'geen-recht' ? AGENDA_FOUT.recht : AGENDA_FOUT.fout;
  await koppelAf(ctx.ownerUserId, sleutel, { staat: 'fout', fout, uitslag: { status: uit.status } });
  return { ok: false, uitslag, fout, agendaId, gebeurtenisId, ...uitbreidingHint(fout) };
}

/** Terugvinden wat er met één lokaal id is gebeurd (de browser maakt het id vóór het verzoek, zodat hij kan hervatten). */
export async function gebeurtenisVanLokaal(ctx: AgendaContext, lokaalId: string) {
  const rij = await koppelVanLokaal(ctx.ownerUserId, lokaalId);
  if (!rij) return null;
  const spiegel = await spiegelZoek(ctx.ownerUserId, rij.agendaId, rij.providerGebeurtenisId);
  return { ...rij, aanwezig: Boolean(spiegel), titel: spiegel?.summary || '' };
}
