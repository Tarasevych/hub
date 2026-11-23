// Двосторонній записувач CalDAV (RFC 4791) за прапорцем можливості `agenda-koppelingen-v1`.
// Tweerichtings-CalDAV (PUT/DELETE met If-Match / If-None-Match, PROPFIND-voorrechtcontrole en pinnedFetch tegen SSRF).
import { createHash } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { pinnedFetch } from './veilige-fetch';
import { leesCaldavGeheimVoorLade } from './agenda-caldav';
import { ladeOf } from './ruimte-cloud-agenda';
import {
  externeSpiegelLeesEen,
  externeSpiegelWisEen,
  externeSpiegelZetEen,
  geldigeSleutel,
  koppelAf,
  koppelClaim,
} from './agenda-spiegel';
import {
  CALDAV_MAX_PROPFIND_BYTES,
  CALDAV_TIMEOUT_MS,
  CALDAV_VOORRECHT_LICHAAM,
  caldavAbsoluut,
  heeftCaldavSchrijfrecht,
} from '../shared/agenda-caldav-model';
import { bouwIcsGebeurtenis, ontleedIcs } from '../shared/agenda-ics-model';
import {
  AGENDA_FOUT,
  herhalingUitRrule,
  normaliseerVorm,
  rruleUitHerhaling,
  schrijfUitslag,
  vormFouten,
  type AgendaVorm,
} from '../shared/agenda-model';

export const AGENDA_KOPPELINGEN_VLAG = 'agenda-koppelingen-v1';

const sys = () => getPool('systeem');
const kort = (value: unknown, max = 500) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);

const fnvEmmer = (sleutel: string, userId: string): number => {
  let h = 0x811c9dc5;
  const s = `${sleutel}:${userId}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
};

let vlagLezer: ((userId: string) => Promise<boolean>) | null = null;
export function zetAgendaKoppelingenVlagVoorTest(fn: ((userId: string) => Promise<boolean>) | null): void {
  vlagLezer = fn;
}

/** Пряма перевірка прапорця `agenda-koppelingen-v1` без імпорту модуля vlaggen. */
export async function isAgendaKoppelingenVlagAan(userId: string): Promise<boolean> {
  if (vlagLezer) return vlagLezer(userId);
  const uid = kort(userId, 200);
  if (!uid) return false;
  try {
    const eigen = await sys().query(
      'SELECT waarde FROM app.feature_flag_tests WHERE user_id = $1 AND sleutel = $2 AND tot > now() LIMIT 1',
      [uid, AGENDA_KOPPELINGEN_VLAG],
    );
    if (eigen.rows.length > 0) return Boolean((eigen.rows[0] as { waarde?: boolean }).waarde);
    const alg = await sys().query(
      'SELECT aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = $1 AND gearchiveerd_op IS NULL LIMIT 1',
      [AGENDA_KOPPELINGEN_VLAG],
    );
    const r = alg.rows[0] as { aan?: boolean; standaard?: boolean; percentage?: number; gebruikers?: string[] } | undefined;
    if (!r || r.aan !== true) return false;
    const gebruikers = Array.isArray(r.gebruikers) ? r.gebruikers.map(String) : [];
    if (gebruikers.includes(uid)) return true;
    const pct = Number(r.percentage) || 0;
    if (pct > 0) return fnvEmmer(AGENDA_KOPPELINGEN_VLAG, uid) < pct;
    return r.standaard === true;
  } catch {
    return false;
  }
}

export type CaldavSchrijfVerzoek = {
  methode: 'PROPFIND' | 'GET' | 'PUT' | 'DELETE';
  url: string;
  koppen: Record<string, string>;
  lichaam?: string;
  gebruikersnaam: string;
  wachtwoord: string;
};

const echtSchrijfVerzoek = async (v: CaldavSchrijfVerzoek): Promise<Response> => {
  const auth = Buffer.from(`${v.gebruikersnaam}:${v.wachtwoord}`, 'utf8').toString('base64');
  return pinnedFetch(
    v.url,
    {
      method: v.methode,
      headers: {
        Authorization: `Basic ${auth}`,
        'User-Agent': 'mijn-ruimte/1 (CalDAV)',
        ...v.koppen,
      },
      ...(v.lichaam !== undefined ? { body: v.lichaam } : {}),
    },
    CALDAV_TIMEOUT_MS,
    CALDAV_MAX_PROPFIND_BYTES,
    'CALDAV_ANTWOORD_TE_GROOT',
  );
};

let doeSchrijfVerzoek: (v: CaldavSchrijfVerzoek) => Promise<Response> = echtSchrijfVerzoek;
export function zetCaldavSchrijfVerzoekerVoorTest(fn: ((v: CaldavSchrijfVerzoek) => Promise<Response>) | null): void {
  doeSchrijfVerzoek = fn ?? echtSchrijfVerzoek;
}

const netwerkFoutCode = (gevangen: unknown): string => {
  const bericht = gevangen instanceof Error ? gevangen.message : '';
  if (bericht === 'CALDAV_ANTWOORD_TE_GROOT') return 'CALDAV_ANTWOORD_TE_GROOT';
  if (bericht === 'REMOTE_TIMEOUT') return 'CALDAV_TIJD_OVERSCHREDEN';
  if (bericht === 'SSRF_ADRES_GEWEIGERD') return 'CALDAV_ADRES_GEWEIGERD';
  if (bericht === 'REMOTE_URL_INVALID') return 'CALDAV_ADRES_ONGELDIG';
  if (bericht === 'REMOTE_STATUS_INVALID') return 'CALDAV_AANBIEDER_FOUT';
  return 'CALDAV_VERBINDING_MISLUKT';
};

const vormUitIcsGebeurtenis = (agendaUrl: string, uid: string, etag: string, icsTekst: string, standaardTijdzone = 'UTC'): AgendaVorm | null => {
  const ontleed = ontleedIcs(icsTekst);
  const g = ontleed.gebeurtenissen.find((x) => x.uid === uid) || ontleed.gebeurtenissen[0];
  if (!g) return null;
  const heleDag = g.heleDag;
  const snijTijd = (iso: string) => {
    if (heleDag) return String(iso || '').slice(0, 10);
    const ruw = String(iso || '');
    if (/Z$/i.test(ruw)) {
      const d = new Date(ruw);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 16);
    }
    return ruw.slice(0, 16);
  };
  return normaliseerVorm({
    agendaId: agendaUrl,
    gebeurtenisId: g.uid || uid,
    etag,
    titel: g.titel,
    beschrijving: g.beschrijving,
    locatie: g.locatie,
    heleDag,
    begin: snijTijd(g.begin),
    einde: snijTijd(g.einde || g.begin),
    tijdzone: g.tijdzone || ontleed.tijdzone || standaardTijdzone,
    herhaling: herhalingUitRrule(g.rrule),
  });
};

async function haalVerseConflictVersie(
  doelHref: string,
  agendaUrl: string,
  abonnementId: string,
  ownerUserId: string,
  uid: string,
  gebruikersnaam: string,
  wachtwoord: string,
): Promise<{ vorm: AgendaVorm | null; etag: string }> {
  try {
    const resp = await doeSchrijfVerzoek({
      methode: 'GET',
      url: doelHref,
      koppen: { Accept: 'text/calendar' },
      gebruikersnaam,
      wachtwoord,
    });
    if (!resp.ok) return { vorm: null, etag: '' };
    const verseEtag = kort(resp.headers.get('etag'), 300);
    const tekst = await resp.text();
    const vorm = vormUitIcsGebeurtenis(agendaUrl, uid, verseEtag, tekst);
    const ontleed = ontleedIcs(tekst);
    const eerste = ontleed.gebeurtenissen.find((x) => x.uid === uid) || ontleed.gebeurtenissen[0];
    if (eerste) {
      await externeSpiegelZetEen(ownerUserId, {
        abonnementId,
        agendaUrl,
        uid: eerste.uid || uid,
        titel: eerste.titel,
        locatie: eerste.locatie,
        beschrijving: eerste.beschrijving,
        begin: eerste.begin,
        einde: eerste.einde,
        heleDag: eerste.heleDag,
        tijdzone: eerste.tijdzone,
        rrule: eerste.rrule,
        status: eerste.status,
        reeks: eerste.reeks,
        gewijzigdOp: eerste.gewijzigdOp,
        url: eerste.url,
        bronHref: doelHref,
        etag: verseEtag,
      });
    }
    return { vorm, etag: verseEtag };
  } catch {
    return { vorm: null, etag: '' };
  }
}

export type CaldavSchrijfProefUitslag =
  | { ok: true; schrijfrecht: true; onbevestigd: boolean }
  | { ok: false; schrijfrecht: false; fout: string };

/** Перевіряє права запису до колекції CalDAV через PROPFIND Depth:0 (<current-user-privilege-set/>). */
export async function caldavControleerSchrijfrecht(
  ownerUserId: string,
  accountId: string,
  agendaUrl: string,
): Promise<CaldavSchrijfProefUitslag> {
  if (!(await isAgendaKoppelingenVlagAan(ownerUserId))) {
    return { ok: false, schrijfrecht: false, fout: 'CALDAV_VLAG_UIT' };
  }
  const geheim = await leesCaldavGeheimVoorLade(ownerUserId, accountId);
  if (!geheim.ok) return { ok: false, schrijfrecht: false, fout: geheim.fout };
  const veiligeAgenda = caldavAbsoluut(geheim.adres, agendaUrl);
  if (!veiligeAgenda) return { ok: false, schrijfrecht: false, fout: 'CALDAV_ADRES_GEWEIGERD' };
  if (geheim.agendas.length > 0 && !geheim.agendas.some((a) => caldavAbsoluut(geheim.adres, a.url) === veiligeAgenda)) {
    return { ok: false, schrijfrecht: false, fout: 'CALDAV_AGENDA_ONBEKEND' };
  }
  try {
    const resp = await doeSchrijfVerzoek({
      methode: 'PROPFIND',
      url: veiligeAgenda,
      koppen: { 'Content-Type': 'application/xml; charset=utf-8', Depth: '0' },
      lichaam: CALDAV_VOORRECHT_LICHAAM,
      gebruikersnaam: geheim.gebruikersnaam,
      wachtwoord: geheim.wachtwoord,
    });
    if (resp.status === 401 || resp.status === 403) {
      return { ok: false, schrijfrecht: false, fout: 'CALDAV_GEEN_SCHRIJFRECHT' };
    }
    if (!resp.ok && resp.status !== 207) {
      return { ok: false, schrijfrecht: false, fout: resp.status >= 300 && resp.status < 400 ? 'CALDAV_OMLEIDING_NIET_GEVOLGD' : 'CALDAV_AANBIEDER_FOUT' };
    }
    const recht = heeftCaldavSchrijfrecht(await resp.text());
    if (recht === false) return { ok: false, schrijfrecht: false, fout: 'CALDAV_GEEN_SCHRIJFRECHT' };
    return { ok: true, schrijfrecht: true, onbevestigd: recht === null };
  } catch (gevangen) {
    return { ok: false, schrijfrecht: false, fout: netwerkFoutCode(gevangen) };
  }
}

export type CaldavBewaarUitslag = {
  ok: boolean;
  uitslag: 'ok' | 'conflict' | 'weg' | 'bestaat' | 'geen-recht' | 'bezig' | 'fout';
  fout?: string;
  gebeurtenisId?: string;
  agendaId?: string;
  bronHref?: string;
  etag?: string;
  google?: AgendaVorm;
};

/** Створення або оновлення події CalDAV через PUT з If-None-Match / If-Match та повною повторостійкістю. */
export async function caldavBewaarGebeurtenis(
  ownerUserId: string,
  invoer: {
    sleutel: unknown;
    accountId: unknown;
    agendaUrl: unknown;
    uid?: unknown;
    bronHref?: unknown;
    etag?: unknown;
    negeerVersie?: boolean;
    vorm: unknown;
    organisatorEmail?: string;
  },
): Promise<CaldavBewaarUitslag> {
  if (!(await isAgendaKoppelingenVlagAan(ownerUserId))) {
    return { ok: false, uitslag: 'geen-recht', fout: 'CALDAV_VLAG_UIT' };
  }
  const sleutel = geldigeSleutel(invoer.sleutel);
  if (!sleutel) return { ok: false, uitslag: 'fout', fout: AGENDA_FOUT.sleutel };

  const fouten = vormFouten(invoer.vorm);
  if (fouten.length > 0) return { ok: false, uitslag: 'fout', fout: fouten[0] };
  const vorm = normaliseerVorm(invoer.vorm);

  const accountId = kort(invoer.accountId, 120);
  const geheim = await leesCaldavGeheimVoorLade(ownerUserId, accountId);
  if (!geheim.ok) {
    return { ok: false, uitslag: geheim.fout.includes('GESLOTEN') ? 'geen-recht' : 'fout', fout: geheim.fout };
  }

  const veiligeAgenda = caldavAbsoluut(geheim.adres, invoer.agendaUrl);
  if (!veiligeAgenda) return { ok: false, uitslag: 'fout', fout: 'CALDAV_ADRES_GEWEIGERD' };
  if (geheim.agendas.length > 0 && !geheim.agendas.some((a) => caldavAbsoluut(geheim.adres, a.url) === veiligeAgenda)) {
    return { ok: false, uitslag: 'fout', fout: 'CALDAV_AGENDA_ONBEKEND' };
  }

  const opgegevenUid = kort(invoer.uid || vorm.gebeurtenisId, 500).replace(/[\r\n]/g, '');
  const isWijziging = Boolean(opgegevenUid || kort(invoer.bronHref, 2000));
  const uid = opgegevenUid || `mr-${createHash('sha256').update(`${ownerUserId}|${geheim.ruimte}|${sleutel}`).digest('hex').slice(0, 32)}@mijn-ruimte.local`;

  const claim = await koppelClaim(ownerUserId, sleutel, isWijziging ? 'wijzigen' : 'aanmaken', sleutel, veiligeAgenda.slice(0, 500), uid);
  if (!claim.nieuw && claim.rij) {
    if (claim.rij.staat === 'bezig') return { ok: false, uitslag: 'bezig', fout: 'AGENDA_BEZIG' };
    if (claim.rij.staat === 'klaar') {
      return {
        ok: true,
        uitslag: 'ok',
        gebeurtenisId: claim.rij.providerGebeurtenisId || uid,
        agendaId: veiligeAgenda,
        bronHref: kort(claim.rij.uitslag.bronHref, 2000),
        etag: claim.rij.etag,
      };
    }
    return {
      ok: false,
      uitslag: claim.rij.staat === 'conflict' ? 'conflict' : claim.rij.staat === 'weg' ? 'weg' : 'fout',
      fout: claim.rij.fout || AGENDA_FOUT.fout,
    };
  }

  if (!isWijziging) {
    const proef = await caldavControleerSchrijfrecht(ownerUserId, accountId, veiligeAgenda);
    if (!proef.ok && proef.fout === 'CALDAV_GEEN_SCHRIJFRECHT') {
      await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: 'CALDAV_GEEN_SCHRIJFRECHT', uitslag: {} });
      return { ok: false, uitslag: 'geen-recht', fout: 'CALDAV_GEEN_SCHRIJFRECHT' };
    }
  }

  const spiegelBestaand = isWijziging ? await externeSpiegelLeesEen(ownerUserId, accountId, veiligeAgenda, uid) : null;
  const standaardHref = `${veiligeAgenda.replace(/\/?$/, '/')}${encodeURIComponent(uid)}.ics`;
  const kandidaatHref = kort(invoer.bronHref, 2000) || spiegelBestaand?.bronHref || standaardHref;
  const doelHref = caldavAbsoluut(veiligeAgenda, kandidaatHref);
  if (!doelHref) {
    await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: 'CALDAV_ADRES_GEWEIGERD', uitslag: {} });
    return { ok: false, uitslag: 'fout', fout: 'CALDAV_ADRES_GEWEIGERD' };
  }

  const bekendeEtag = kort(invoer.etag || vorm.etag || spiegelBestaand?.etag, 300);
  const reeks = (spiegelBestaand?.reeks ?? 0) + (isWijziging ? 1 : 0);
  const icsLichaam = bouwIcsGebeurtenis({
    uid,
    vorm,
    sequence: reeks,
    organisatorEmail: invoer.organisatorEmail,
  });

  const koppen: Record<string, string> = { 'Content-Type': 'text/calendar; charset=utf-8' };
  if (!isWijziging) {
    koppen['If-None-Match'] = '*';
  } else if (!invoer.negeerVersie && bekendeEtag) {
    koppen['If-Match'] = bekendeEtag;
  }

  try {
    const resp = await doeSchrijfVerzoek({
      methode: 'PUT',
      url: doelHref,
      koppen,
      lichaam: icsLichaam,
      gebruikersnaam: geheim.gebruikersnaam,
      wachtwoord: geheim.wachtwoord,
    });

    const betekenis = schrijfUitslag(resp.status);
    if (betekenis === 'conflict' || (!isWijziging && resp.status === 412)) {
      const vers = await haalVerseConflictVersie(doelHref, veiligeAgenda, accountId, ownerUserId, uid, geheim.gebruikersnaam, geheim.wachtwoord);
      await koppelAf(ownerUserId, sleutel, { staat: 'conflict', etag: vers.etag, fout: AGENDA_FOUT.conflict, uitslag: { bronHref: doelHref } });
      return {
        ok: false,
        uitslag: 'conflict',
        fout: AGENDA_FOUT.conflict,
        etag: vers.etag,
        ...(vers.vorm ? { google: vers.vorm } : {}),
      };
    }

    if (betekenis === 'geen-recht') {
      await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: 'CALDAV_GEEN_SCHRIJFRECHT', uitslag: {} });
      return { ok: false, uitslag: 'geen-recht', fout: 'CALDAV_GEEN_SCHRIJFRECHT' };
    }

    if (betekenis === 'weg') {
      await externeSpiegelWisEen(ownerUserId, accountId, veiligeAgenda, uid);
      await koppelAf(ownerUserId, sleutel, { staat: 'weg', fout: AGENDA_FOUT.weg, uitslag: {} });
      return { ok: false, uitslag: 'weg', fout: AGENDA_FOUT.weg };
    }

    if (resp.status >= 300 && resp.status < 400) {
      await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: 'CALDAV_OMLEIDING_NIET_GEVOLGD', uitslag: {} });
      return { ok: false, uitslag: 'fout', fout: 'CALDAV_OMLEIDING_NIET_GEVOLGD' };
    }

    if (betekenis !== 'ok') {
      await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: 'CALDAV_SCHRIJVEN_MISLUKT', uitslag: {} });
      return { ok: false, uitslag: 'fout', fout: 'CALDAV_SCHRIJVEN_MISLUKT' };
    }

    const nieuweEtag = kort(resp.headers.get('etag'), 300);
    const rrule = rruleUitHerhaling(vorm.herhaling);
    const beginWaarde = vorm.heleDag ? vorm.begin.slice(0, 10) : (vorm.tijdzone === 'UTC' ? `${vorm.begin.slice(0, 16)}:00Z` : `${vorm.begin.slice(0, 16)}:00`);
    const eindWaarde = vorm.heleDag ? vorm.einde.slice(0, 10) : (vorm.tijdzone === 'UTC' ? `${vorm.einde.slice(0, 16)}:00Z` : `${vorm.einde.slice(0, 16)}:00`);

    await externeSpiegelZetEen(ownerUserId, {
      abonnementId: accountId,
      agendaUrl: veiligeAgenda,
      uid,
      titel: vorm.titel,
      locatie: vorm.locatie,
      beschrijving: vorm.beschrijving,
      begin: beginWaarde,
      einde: eindWaarde,
      heleDag: vorm.heleDag,
      tijdzone: vorm.tijdzone,
      rrule,
      status: 'confirmed',
      reeks,
      gewijzigdOp: new Date().toISOString(),
      url: '',
      bronHref: doelHref,
      etag: nieuweEtag,
    });

    await koppelAf(ownerUserId, sleutel, {
      staat: 'klaar',
      providerGebeurtenisId: uid,
      etag: nieuweEtag,
      waarheidsbron: 'lokaal',
      fout: '',
      uitslag: { uid, bronHref: doelHref, etag: nieuweEtag },
    });

    await auditToevoegen({
      ownerId: ownerUserId,
      actorId: ownerUserId,
      action: 'agenda.caldav.opgeslagen',
      type: 'agenda',
      result: 'ok',
      details: { abonnement: accountId.slice(0, 8), bewerking: isWijziging ? 'wijzigen' : 'aanmaken', ruimte: ladeOf(ownerUserId).ruimte },
    }).catch(() => undefined);

    return {
      ok: true,
      uitslag: 'ok',
      gebeurtenisId: uid,
      agendaId: veiligeAgenda,
      bronHref: doelHref,
      etag: nieuweEtag,
    };
  } catch (gevangen) {
    const code = netwerkFoutCode(gevangen);
    await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: code, uitslag: {} });
    return { ok: false, uitslag: 'fout', fout: code };
  }
}

/** Видалення події із зовнішнього календаря CalDAV через DELETE з перевіркою версії If-Match. */
export async function caldavWisGebeurtenis(
  ownerUserId: string,
  invoer: {
    sleutel: unknown;
    accountId: unknown;
    agendaUrl: unknown;
    uid: unknown;
    bronHref?: unknown;
    etag?: unknown;
    negeerVersie?: boolean;
  },
): Promise<CaldavBewaarUitslag> {
  if (!(await isAgendaKoppelingenVlagAan(ownerUserId))) {
    return { ok: false, uitslag: 'geen-recht', fout: 'CALDAV_VLAG_UIT' };
  }
  const sleutel = geldigeSleutel(invoer.sleutel);
  if (!sleutel) return { ok: false, uitslag: 'fout', fout: AGENDA_FOUT.sleutel };

  const accountId = kort(invoer.accountId, 120);
  const uid = kort(invoer.uid, 500).replace(/[\r\n]/g, '');
  if (!uid) return { ok: false, uitslag: 'fout', fout: AGENDA_FOUT.agenda };

  const geheim = await leesCaldavGeheimVoorLade(ownerUserId, accountId);
  if (!geheim.ok) {
    return { ok: false, uitslag: geheim.fout.includes('GESLOTEN') ? 'geen-recht' : 'fout', fout: geheim.fout };
  }

  const veiligeAgenda = caldavAbsoluut(geheim.adres, invoer.agendaUrl);
  if (!veiligeAgenda) return { ok: false, uitslag: 'fout', fout: 'CALDAV_ADRES_GEWEIGERD' };

  const claim = await koppelClaim(ownerUserId, sleutel, 'verwijderen', sleutel, veiligeAgenda.slice(0, 500), uid);
  if (!claim.nieuw && claim.rij) {
    if (claim.rij.staat === 'bezig') return { ok: false, uitslag: 'bezig', fout: 'AGENDA_BEZIG' };
    if (claim.rij.staat === 'klaar') return { ok: true, uitslag: 'ok', gebeurtenisId: uid, agendaId: veiligeAgenda };
    return { ok: false, uitslag: claim.rij.staat === 'conflict' ? 'conflict' : 'fout', fout: claim.rij.fout || AGENDA_FOUT.fout };
  }

  const spiegelBestaand = await externeSpiegelLeesEen(ownerUserId, accountId, veiligeAgenda, uid);
  const standaardHref = `${veiligeAgenda.replace(/\/?$/, '/')}${encodeURIComponent(uid)}.ics`;
  const doelHref = caldavAbsoluut(veiligeAgenda, kort(invoer.bronHref, 2000) || spiegelBestaand?.bronHref || standaardHref);
  if (!doelHref) {
    await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: 'CALDAV_ADRES_GEWEIGERD', uitslag: {} });
    return { ok: false, uitslag: 'fout', fout: 'CALDAV_ADRES_GEWEIGERD' };
  }

  const bekendeEtag = kort(invoer.etag || spiegelBestaand?.etag, 300);
  const koppen: Record<string, string> = {};
  if (!invoer.negeerVersie && bekendeEtag) {
    koppen['If-Match'] = bekendeEtag;
  }

  try {
    const resp = await doeSchrijfVerzoek({
      methode: 'DELETE',
      url: doelHref,
      koppen,
      gebruikersnaam: geheim.gebruikersnaam,
      wachtwoord: geheim.wachtwoord,
    });

    if (resp.status === 412) {
      const vers = await haalVerseConflictVersie(doelHref, veiligeAgenda, accountId, ownerUserId, uid, geheim.gebruikersnaam, geheim.wachtwoord);
      await koppelAf(ownerUserId, sleutel, { staat: 'conflict', etag: vers.etag, fout: AGENDA_FOUT.conflict, uitslag: {} });
      return {
        ok: false,
        uitslag: 'conflict',
        fout: AGENDA_FOUT.conflict,
        etag: vers.etag,
        ...(vers.vorm ? { google: vers.vorm } : {}),
      };
    }

    if (resp.status === 401 || resp.status === 403) {
      await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: 'CALDAV_GEEN_SCHRIJFRECHT', uitslag: {} });
      return { ok: false, uitslag: 'geen-recht', fout: 'CALDAV_GEEN_SCHRIJFRECHT' };
    }

    if (resp.status >= 300 && resp.status < 400) {
      await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: 'CALDAV_OMLEIDING_NIET_GEVOLGD', uitslag: {} });
      return { ok: false, uitslag: 'fout', fout: 'CALDAV_OMLEIDING_NIET_GEVOLGD' };
    }

    if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
      await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: 'CALDAV_SCHRIJVEN_MISLUKT', uitslag: {} });
      return { ok: false, uitslag: 'fout', fout: 'CALDAV_SCHRIJVEN_MISLUKT' };
    }

    await externeSpiegelWisEen(ownerUserId, accountId, veiligeAgenda, uid);
    await koppelAf(ownerUserId, sleutel, {
      staat: 'klaar',
      providerGebeurtenisId: uid,
      etag: '',
      waarheidsbron: 'lokaal',
      fout: '',
      uitslag: { verwijderd: true },
    });

    await auditToevoegen({
      ownerId: ownerUserId,
      actorId: ownerUserId,
      action: 'agenda.caldav.verwijderd',
      type: 'agenda',
      result: 'ok',
      details: { abonnement: accountId.slice(0, 8), ruimte: ladeOf(ownerUserId).ruimte },
    }).catch(() => undefined);

    return { ok: true, uitslag: 'ok', gebeurtenisId: uid, agendaId: veiligeAgenda };
  } catch (gevangen) {
    const code = netwerkFoutCode(gevangen);
    await koppelAf(ownerUserId, sleutel, { staat: 'fout', fout: code, uitslag: {} });
    return { ok: false, uitslag: 'fout', fout: code };
  }
}
