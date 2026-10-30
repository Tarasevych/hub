// ICS-abonnementen: een ECHTE ophaler die op een schema een `.ics` van een adres haalt, de VEVENT's ontleedt
// en ze in de spiegel van de agenda zet. Hiermee werkt elke agenda die een link geeft — Fastmail, een
// Proton-export, een rooster, feestdagen, een sportkalender — zonder dat die aanbieder een API hoeft te hebben.
//
// Alles wat van buiten komt is onbetrouwbaar, dus:
//   • ALLEEN https. webcal:// wordt https:// (dat bedoelt iedereen ermee); http, file, data en de rest worden
//     geweigerd (shared/agenda-ics-model.ts → veiligIcsAdres, en de database weigert het nog eens: 0076).
//   • Geen adres met gebruikersnaam/wachtwoord: een geheim hoort niet in een URL.
//   • backend/veilige-fetch.ts (pinnedFetch): DNS-pinning tegen SSRF, geen automatische omleidingen, een harde
//     time-out en een maximum aan bytes. Een rooster dat 500 MB stuurt, kan de server dus niet platleggen.
//   • Een grens op het aantal afspraken (ICS_MAX_GEBEURTENISSEN) en een venster (ICS_VENSTER_*): een kalender
//     van 1998 hoeft niet in de spiegel.
//   • Nooit vaker dan ICS_MIN_MINUTEN bij dezelfde aanbieder langs; If-None-Match/If-Modified-Since als de
//     aanbieder een ETag gaf, zodat een onveranderde kalender bijna niets kost (304).
//
// Lezen, en niets anders: een ICS-abonnement is per definitie eenrichting. Dat staat zo in de winkel.
import { randomUUID } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import {
  ICS_MAX_BYTES, ICS_TIMEOUT_MS, ICS_VENSTER_TERUG_DAGEN, ICS_VENSTER_VOORUIT_DAGEN,
  binnenIcsVenster, icsIsAanDeBeurt, normaliseerIcsInterval, ontleedIcs, veiligIcsAdres,
} from '../shared/agenda-ics-model';
import { externeSpiegelVervang, externeSpiegelWis, type ExterneRij } from './agenda-spiegel';
import { pinnedFetch } from './veilige-fetch';
import { sqlLadeWaar, type Lade } from '../shared/ruimte-scheiding';
import { ladeNogGeldig, ladeOf, metLade } from './ruimte-cloud-agenda';

const sys = () => getPool('systeem');
const kort = (value: unknown, max = 500) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);

export type IcsAbonnement = {
  id: string; naam: string; adres: string; actief: boolean; intervalMinuten: number;
  laatstOp: number; laatstKlaarOp: number; laatsteStaat: string; fout: string; aantal: number; poging: number;
};
const uit = (rij: Record<string, unknown>): IcsAbonnement => ({
  id: String(rij.id || ''), naam: String(rij.naam || ''), adres: String(rij.adres || ''), actief: rij.actief !== false,
  intervalMinuten: Number(rij.interval_minuten || 60),
  laatstOp: rij.laatst_op ? new Date(String(rij.laatst_op)).getTime() : 0,
  laatstKlaarOp: rij.laatst_klaar_op ? new Date(String(rij.laatst_klaar_op)).getTime() : 0,
  laatsteStaat: String(rij.laatste_staat || 'nieuw'), fout: String(rij.fout || ''),
  aantal: Number(rij.aantal || 0), poging: Number(rij.poging || 0),
});

// GESCHEIDEN GEGEVENSRUIMTES (migraties 0082 + 0084). Elke vraag hieronder draagt de LADE van de huidige aanroep:
// `ladeOf(ownerUserId)` geeft binnen een bewaakte agendaroute de lade die de poort berekende, en daarbuiten de
// PERSOONLIJKE lade (ook voor elke rij van vóór 0084). Een ICS-abonnement van de technische ruimte is dus onzichtbaar
// in het persoonlijke profiel en omgekeerd, en sinds 0084 kunnen de twee laden hetzelfde adres los van elkaar volgen
// (de unieke sleutel is (user_id, ruimte, bron, adres), niet meer (user_id, bron, adres)).
export async function icsLijst(ownerUserId: string): Promise<IcsAbonnement[]> {
  const rijen = await sys().query(
    `SELECT * FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND bron = 'ics' ORDER BY aangemaakt_op`, [ownerUserId]);
  return (rijen.rows as Record<string, unknown>[]).map(uit);
}

export const ICS_MAX_ABONNEMENTEN = 25;
export type IcsToevoegUitslag = { ok: true; abonnement: IcsAbonnement } | { ok: false; fout: string };
/** Toevoegen. Het adres wordt eerst opgeschoond; een onbruikbaar adres komt de database niet eens in. */
export async function icsToevoegen(ownerUserId: string, invoer: { adres: unknown; naam?: unknown; intervalMinuten?: unknown }): Promise<IcsToevoegUitslag> {
  const { adres, fout } = veiligIcsAdres(invoer.adres);
  if (fout) return { ok: false, fout };
  const lade = ladeOf(ownerUserId);
  // De grens geldt PER LADE: de technische ruimte eet de persoonlijke ruimte niet op en omgekeerd.
  const aantal = await sys().query(`SELECT count(*)::int AS n FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND bron = 'ics'`, [ownerUserId]);
  if (Number(aantal.rows[0]?.n || 0) >= ICS_MAX_ABONNEMENTEN) return { ok: false, fout: 'ICS_TE_VEEL_ABONNEMENTEN' };
  const id = randomUUID();
  try {
    const rij = await sys().query(
      `INSERT INTO app.agenda_abonnement (user_id, ruimte, id, bron, naam, adres, interval_minuten, actief, laatste_staat)
       VALUES ($1,$6,$2,'ics',$3,$4,$5,true,'nieuw')
       ON CONFLICT (user_id, ruimte, bron, adres) DO UPDATE SET actief = true, naam = COALESCE(NULLIF(EXCLUDED.naam, ''), app.agenda_abonnement.naam), bijgewerkt_op = now()
       RETURNING *`,
      [ownerUserId, id, kort(invoer.naam, 200), adres, normaliseerIcsInterval(invoer.intervalMinuten), lade.ruimte]);
    return { ok: true, abonnement: uit(rij.rows[0] as Record<string, unknown>) };
  } catch { return { ok: false, fout: 'ICS_OPSLAAN_MISLUKT' }; }
}

export async function icsVerwijderen(ownerUserId: string, id: string): Promise<boolean> {
  const lade = ladeOf(ownerUserId);
  const bestaat = await sys().query(`SELECT id FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND id = $2 AND bron = 'ics'`, [ownerUserId, kort(id, 120)]);
  if (!bestaat.rows.length) return false;
  await externeSpiegelWis(ownerUserId, kort(id, 120));
  await sys().query(`DELETE FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND id = $2`, [ownerUserId, kort(id, 120)]);
  return true;
}
export async function icsSchakelen(ownerUserId: string, id: string, actief: boolean, intervalMinuten?: unknown): Promise<boolean> {
  const uitslag = await sys().query(
    `UPDATE app.agenda_abonnement SET actief = $3, interval_minuten = COALESCE($4, interval_minuten), bijgewerkt_op = now()
      WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND id = $2 AND bron = 'ics'`,
    [ownerUserId, kort(id, 120), Boolean(actief), intervalMinuten === undefined ? null : normaliseerIcsInterval(intervalMinuten)]);
  return Boolean(uitslag.rowCount);
}

const vensterRand = (nu: number) => ({
  vanaf: new Date(nu - ICS_VENSTER_TERUG_DAGEN * 86400000).toISOString(),
  tot: new Date(nu + ICS_VENSTER_VOORUIT_DAGEN * 86400000).toISOString(),
});

export type IcsHaalUitslag = { staat: 'klaar' | 'onveranderd' | 'fout'; aantal: number; fout: string; vevents: number; afgekapt: boolean };
/**
 * Eén abonnement ophalen. Geeft 'onveranderd' bij 304 (dan laten we de spiegel staan: die is nog goed).
 * De foutcodes zijn stabiel en zonder details van de aanbieder — ze komen in de database en op de pagina.
 */
export async function icsOphalen(ownerUserId: string, id: string): Promise<IcsHaalUitslag> {
  const rijen = await sys().query(`SELECT * FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND id = $2 AND bron = 'ics'`, [ownerUserId, kort(id, 120)]);
  const rij = rijen.rows[0] as Record<string, unknown> | undefined;
  if (!rij) return { staat: 'fout', aantal: 0, fout: 'ICS_ABONNEMENT_ONBEKEND', vevents: 0, afgekapt: false };
  const { adres, fout: adresFout } = veiligIcsAdres(rij.adres);
  if (adresFout) { await afronden(ownerUserId, id, 'fout', 0, adresFout, ''); return { staat: 'fout', aantal: 0, fout: adresFout, vevents: 0, afgekapt: false }; }
  await sys().query(`UPDATE app.agenda_abonnement SET laatste_staat = 'bezig', laatst_op = now(), bijgewerkt_op = now() WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND id = $2`, [ownerUserId, kort(id, 120)]);
  const koppen: Record<string, string> = { Accept: 'text/calendar, text/plain;q=0.5, */*;q=0.1' };
  const vorigeEtag = kort(rij.etag, 300);
  if (vorigeEtag) koppen['If-None-Match'] = vorigeEtag;
  try {
    const respons = await pinnedFetch(adres, { method: 'GET', headers: koppen }, ICS_TIMEOUT_MS, ICS_MAX_BYTES, 'ICS_BESTAND_TE_GROOT');
    if (respons.status === 304) { await afronden(ownerUserId, id, 'onveranderd', Number(rij.aantal || 0), '', vorigeEtag); return { staat: 'onveranderd', aantal: Number(rij.aantal || 0), fout: '', vevents: 0, afgekapt: false }; }
    if (respons.status >= 300 && respons.status < 400) {
      // pinnedFetch volgt bewust geen omleidingen: een omleiding kan naar een intern adres wijzen.
      await afronden(ownerUserId, id, 'fout', 0, 'ICS_OMLEIDING_NIET_GEVOLGD', '');
      return { staat: 'fout', aantal: 0, fout: 'ICS_OMLEIDING_NIET_GEVOLGD', vevents: 0, afgekapt: false };
    }
    if (!respons.ok) {
      const code = respons.status === 401 || respons.status === 403 ? 'ICS_GEEN_TOEGANG' : respons.status === 404 ? 'ICS_NIET_GEVONDEN' : 'ICS_AANBIEDER_FOUT';
      await afronden(ownerUserId, id, 'fout', 0, code, '');
      return { staat: 'fout', aantal: 0, fout: code, vevents: 0, afgekapt: false };
    }
    const tekst = await respons.text();
    const agenda = ontleedIcs(tekst);
    if (!agenda.vevents && !/BEGIN:VCALENDAR/i.test(tekst)) {
      await afronden(ownerUserId, id, 'fout', 0, 'ICS_GEEN_AGENDA', '');
      return { staat: 'fout', aantal: 0, fout: 'ICS_GEEN_AGENDA', vevents: 0, afgekapt: false };
    }
    const nu = Date.now();
    const binnen: ExterneRij[] = agenda.gebeurtenissen
      .filter((g) => binnenIcsVenster(g, nu))
      .map((g) => ({
        abonnementId: kort(id, 120), agendaUrl: '', uid: g.uid, titel: g.titel, locatie: g.locatie, beschrijving: g.beschrijving,
        begin: g.begin, einde: g.einde, heleDag: g.heleDag, tijdzone: g.tijdzone, rrule: g.rrule, status: g.status,
        reeks: g.reeks, gewijzigdOp: g.gewijzigdOp, url: g.url,
      }));
    await externeSpiegelVervang(ownerUserId, kort(id, 120), '', binnen);
    const naam = kort(rij.naam, 200) || kort(agenda.naam, 200);
    await afronden(ownerUserId, id, 'klaar', binnen.length, '', kort(respons.headers.get('etag'), 300), naam);
    return { staat: 'klaar', aantal: binnen.length, fout: '', vevents: agenda.vevents, afgekapt: agenda.afgekapt };
  } catch (gevangen) {
    const bericht = gevangen instanceof Error ? gevangen.message : '';
    const code = bericht === 'ICS_BESTAND_TE_GROOT' ? 'ICS_BESTAND_TE_GROOT'
      : bericht === 'REMOTE_TIMEOUT' ? 'ICS_TIJD_OVERSCHREDEN'
        : bericht === 'SSRF_ADRES_GEWEIGERD' ? 'ICS_ADRES_GEWEIGERD'
          : bericht === 'REMOTE_URL_INVALID' ? 'ICS_ADRES_ONGELDIG' : 'ICS_OPHALEN_MISLUKT';
    await afronden(ownerUserId, id, 'fout', 0, code, '');
    return { staat: 'fout', aantal: 0, fout: code, vevents: 0, afgekapt: false };
  }
}

async function afronden(ownerUserId: string, id: string, staat: 'klaar' | 'onveranderd' | 'fout', aantal: number, fout: string, etag: string, naam = '') {
  await sys().query(
    `UPDATE app.agenda_abonnement SET laatste_staat = $3, aantal = $4,
       fout = CASE WHEN $5 ~ '^[A-Z0-9_]{1,60}$' THEN $5 ELSE '' END,
       etag = $6, naam = COALESCE(NULLIF($7, ''), naam),
       poging = CASE WHEN $3 = 'fout' THEN LEAST(100, poging + 1) ELSE 0 END,
       laatst_klaar_op = CASE WHEN $3 = 'fout' THEN laatst_klaar_op ELSE now() END,
       bijgewerkt_op = now()
     WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND id = $2`,
    [ownerUserId, kort(id, 120), staat, Math.max(0, Math.trunc(aantal)), kort(fout, 60), kort(etag, 300), kort(naam, 200)]);
}

/** Alle abonnementen van één gebruiker die aan de beurt zijn (de knop «Оновити» doet ze allemaal). */
export async function icsRondeVoorEigenaar(ownerUserId: string, forceren = false) {
  const lijst = await icsLijst(ownerUserId);
  const nu = Date.now(), uitslagen: Array<{ id: string } & IcsHaalUitslag> = [];
  for (const abonnement of lijst) {
    if (!abonnement.actief) continue;
    if (!forceren && !icsIsAanDeBeurt(abonnement.laatstOp, abonnement.intervalMinuten, nu)) continue;
    uitslagen.push({ id: abonnement.id, ...await icsOphalen(ownerUserId, abonnement.id) });
  }
  return uitslagen;
}

/** De cron-ronde over alle gebruikers; begrensd, zodat één tik nooit te lang duurt. */
export async function icsCronRonde(limiet = 10) {
  const rijen = await sys().query(
    `SELECT user_id, COALESCE(ruimte, 'prive') AS ruimte, id, interval_minuten, COALESCE(laatst_op, to_timestamp(0)) AS laatst_op
       FROM app.agenda_abonnement
      WHERE bron = 'ics' AND actief
        AND (laatst_op IS NULL OR laatst_op < now() - (interval_minuten || ' minutes')::interval)
      ORDER BY laatst_op NULLS FIRST LIMIT $1`, [Math.max(1, Math.min(50, limiet))]);
  const uitslagen: unknown[] = [];
  let overgeslagen = 0;
  for (const rij of rijen.rows as Record<string, unknown>[]) {
    // De planner heeft geen sessie en geen tabblad, dus hij MOET de lade uit de rij zelf halen — en voor een
    // technische rij eerst vragen of die lade nog open is (`ladeNogGeldig`: stand 'eigen' én de rechten nog geldig).
    // Zonder deze twee regels zou een BEVROREN technische ruimte in de achtergrond vrolijk blijven doorlezen.
    const lade: Lade = { userId: String(rij.user_id), ruimte: String(rij.ruimte) === 'technisch' ? 'technisch' : 'prive' };
    if (!await ladeNogGeldig(lade.userId, lade.ruimte, 'agenda')) { overgeslagen += 1; continue; }
    try { uitslagen.push({ id: String(rij.id).slice(0, 8), ...await metLade(lade, 'agenda', () => icsOphalen(lade.userId, String(rij.id))) }); }
    catch { uitslagen.push({ id: String(rij.id).slice(0, 8), staat: 'fout', fout: 'ICS_OPHALEN_MISLUKT' }); }
  }
  return { abonnementen: rijen.rows.length, uitslagen, overgeslagen, venster: vensterRand(Date.now()) };
}
