// CalDAV (RFC 4791) — een ECHTE cliënt, maar bewust alleen LEZEN.
//
// Wat werkt: ontdekken (PROPFIND naar current-user-principal → calendar-home-set → de agenda's) en ophalen
// (REPORT calendar-query met een tijdvenster). De .ics-blokken uit het antwoord gaan door dezelfde ontleder als
// een ICS-abonnement, dus iCloud, Fastmail en Nextcloud leveren dezelfde afspraken in dezelfde spiegel.
//
// Wat NIET werkt: schrijven. Dat is geen knop die niets doet — shared/agenda-caldav-model.ts →
// AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT somt in beide talen op wat er precies nog voor nodig is (PUT/DELETE met
// If-Match, zelf VCALENDAR opbouwen, sync-collection, scheduling RFC 6638, en de omleidingen van iCloud), en de
// winkel op /agenda laat die lijst zien. caldavSchrijven() hieronder weigert dus altijd, met die lijst erbij.
//
// Veiligheid: alleen https (shared → veiligCaldavAdres), backend/veilige-fetch.ts (DNS-pinning tegen SSRF, geen
// automatische omleidingen, time-out, maximum aan bytes), en het app-wachtwoord staat versleuteld met
// AES-256-GCM (sealWithEnvKey, sleutel AGENDA_ABONNEMENT_SLEUTEL_V1) met de rij als AAD — nooit in platte tekst
// en nooit in een URL. Hrefs uit het antwoord moeten op DEZELFDE host staan, anders weigeren we ze.
import { randomUUID } from 'node:crypto';
import { herversleutelEnvelop, isGeslotenFout, kluisStand, ontzegel, registreerHerversleutelaar, verzegel } from './sleutelkluis';
import { SLEUTEL_GESLOTEN_CODE, isServerEnvelop } from '../shared/sleutelkluis';
import { getPool } from '../server/platform/pg';
import {
  AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT, CALDAV_AGENDAS_LICHAAM, CALDAV_HOME_LICHAAM, CALDAV_MAX_AGENDAS,
  CALDAV_MAX_BYTES, CALDAV_PRINCIPAL_LICHAAM, CALDAV_STANDAARD_MINUTEN, CALDAV_TIMEOUT_MS,
  caldavAbsoluut, caldavEersteHref, caldavQueryLichaam, ontleedCaldavAgendas, ontleedCaldavGegevens,
  veiligCaldavAdres, type CaldavAgenda,
} from '../shared/agenda-caldav-model';
import { ICS_VENSTER_TERUG_DAGEN, ICS_VENSTER_VOORUIT_DAGEN, binnenIcsVenster, ontleedIcs } from '../shared/agenda-ics-model';
import { externeSpiegelVervang, externeSpiegelWis, type ExterneRij } from './agenda-spiegel';
import { pinnedFetch } from './veilige-fetch';

import { sqlLadeWaar, type Lade } from '../shared/ruimte-scheiding';
import type { AiRuimte } from '../shared/ai-ruimte';
import { ladeNogGeldig, ladeOf, metLade } from './ruimte-cloud-agenda';

const sys = () => getPool('systeem');
const kort = (value: unknown, max = 500) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
/** De sleutel waarmee het app-wachtwoord wordt versleuteld. Ontbreekt hij, dan kan CalDAV niet gekoppeld worden. */
export const CALDAV_SLEUTEL_NAAM = 'AGENDA_ABONNEMENT_SLEUTEL_V1';
/**
 * De AAD van de wachtwoord-envelop. GESCHEIDEN GEGEVENSRUIMTES (0084): de technische lade krijgt haar eigen context,
 * zodat een envelop die bij de technische ruimte hoort niet in de persoonlijke rij te gebruiken is (en omgekeerd) —
 * ook niet als de twee laden hetzelfde CalDAV-adres volgen, wat sinds 0084 mag. Voor de PERSOONLIJKE lade blijft de
 * tekst byte voor byte gelijk aan vroeger, dus elke bestaande envelop blijft leesbaar en er gaat niets verloren.
 */
const aad = (ownerUserId: string, id: string, ruimte: AiRuimte = 'prive') =>
  ruimte === 'technisch' ? `agenda-caldav|technisch|${ownerUserId}|${id}` : `agenda-caldav|${ownerUserId}|${id}`;

export type CaldavAccount = {
  id: string; naam: string; adres: string; gebruikersnaam: string; actief: boolean; intervalMinuten: number;
  agendas: CaldavAgenda[]; laatstOp: number; laatstKlaarOp: number; laatsteStaat: string; fout: string; aantal: number;
  /** Eerlijk in het antwoord: schrijven kan niet, en dit is waarom. */
  schrijven: false; schrijvenOntbreekt: readonly (readonly [string, string])[];
};
const uit = (rij: Record<string, unknown>): CaldavAccount => ({
  id: String(rij.id || ''), naam: String(rij.naam || ''), adres: String(rij.adres || ''),
  gebruikersnaam: String(rij.gebruikersnaam || ''), actief: rij.actief !== false,
  intervalMinuten: Number(rij.interval_minuten || CALDAV_STANDAARD_MINUTEN),
  agendas: Array.isArray(rij.agendas) ? (rij.agendas as CaldavAgenda[]) : [],
  laatstOp: rij.laatst_op ? new Date(String(rij.laatst_op)).getTime() : 0,
  laatstKlaarOp: rij.laatst_klaar_op ? new Date(String(rij.laatst_klaar_op)).getTime() : 0,
  laatsteStaat: String(rij.laatste_staat || 'nieuw'), fout: String(rij.fout || ''), aantal: Number(rij.aantal || 0),
  schrijven: false, schrijvenOntbreekt: AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT,
});

// GESCHEIDEN GEGEVENSRUIMTES (migraties 0082 + 0084): elke vraag draagt de LADE van de huidige aanroep. Zie de kop
// van backend/agenda-ics.ts; voor CalDAV geldt bovendien dat het versleutelde WACHTWOORD per lade aan een eigen AAD
// hangt (`aad` hierboven), zodat een geheim van de ene lade in de andere niet te openen is.
export async function caldavLijst(ownerUserId: string): Promise<CaldavAccount[]> {
  const rijen = await sys().query(`SELECT * FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND bron = 'caldav' ORDER BY aangemaakt_op`, [ownerUserId]);
  return (rijen.rows as Record<string, unknown>[]).map(uit);
}

type Verzoek = { methode: 'PROPFIND' | 'REPORT'; url: string; diepte: '0' | '1'; lichaam: string; gebruikersnaam: string; wachtwoord: string };
const echtVerzoek = async ({ methode, url, diepte, lichaam, gebruikersnaam, wachtwoord }: Verzoek): Promise<Response> => {
  const auth = Buffer.from(`${gebruikersnaam}:${wachtwoord}`, 'utf8').toString('base64');
  return pinnedFetch(url, {
    method: methode,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/xml; charset=utf-8', Depth: diepte, 'User-Agent': 'mijn-ruimte/1 (CalDAV)' },
    body: lichaam,
  }, CALDAV_TIMEOUT_MS, CALDAV_MAX_BYTES, 'CALDAV_ANTWOORD_TE_GROOT');
};
/** Alleen voor tests (iCloud nagebootst, tests/eenheid/dev-rechten-gebruiker-20261021.test.ts): de echte verbinding vervangen. */
let doeVerzoek: (v: Verzoek) => Promise<Response> = echtVerzoek;
export type CaldavVerzoek = Verzoek;
export const zetCaldavVerzoekerVoorTest = (fn: ((v: Verzoek) => Promise<Response>) | null) => { doeVerzoek = fn ?? echtVerzoek; };
const foutCode = (gevangen: unknown) => {
  const bericht = gevangen instanceof Error ? gevangen.message : '';
  if (bericht === 'CALDAV_ANTWOORD_TE_GROOT') return 'CALDAV_ANTWOORD_TE_GROOT';
  if (bericht === 'REMOTE_TIMEOUT') return 'CALDAV_TIJD_OVERSCHREDEN';
  if (bericht === 'SSRF_ADRES_GEWEIGERD') return 'CALDAV_ADRES_GEWEIGERD';
  if (bericht === 'REMOTE_URL_INVALID') return 'CALDAV_ADRES_ONGELDIG';
  return 'CALDAV_VERBINDING_MISLUKT';
};
const statusCode = (status: number) => (status === 401 ? 'CALDAV_AANMELDEN_GEWEIGERD'
  : status === 403 ? 'CALDAV_GEEN_TOEGANG'
    : status === 404 ? 'CALDAV_NIET_GEVONDEN'
      : status >= 300 && status < 400 ? 'CALDAV_OMLEIDING_NIET_GEVOLGD' : 'CALDAV_AANBIEDER_FOUT');

export type CaldavOntdekking = { ok: true; principal: string; home: string; agendas: CaldavAgenda[] } | { ok: false; fout: string };
/** De drie PROPFIND-stappen. Zonder agenda's is er niets te lezen, en dat zeggen we ook zo. */
export async function caldavOntdekken(basis: string, gebruikersnaam: string, wachtwoord: string): Promise<CaldavOntdekking> {
  const { adres, fout } = veiligCaldavAdres(basis);
  if (fout) return { ok: false, fout };
  try {
    const stap1 = await doeVerzoek({ methode: 'PROPFIND', url: adres, diepte: '0', lichaam: CALDAV_PRINCIPAL_LICHAAM, gebruikersnaam, wachtwoord });
    if (!stap1.ok && stap1.status !== 207) return { ok: false, fout: statusCode(stap1.status) };
    // De principal staat IN <current-user-principal>; de eerste href van het antwoord is de resource zelf (iCloud: «/»).
    const stap1Tekst = (await stap1.text()).replace(/<[A-Za-z0-9_.:-]*href[^>]*\/>/gi, '');
    const principalBlok = /<[A-Za-z0-9_.:-]*current-user-principal[^>]*>([\s\S]*?)<\/[A-Za-z0-9_.:-]*current-user-principal>/i.exec(stap1Tekst);
    const principalHref = caldavEersteHref(principalBlok ? principalBlok[1] : stap1Tekst);
    const principal = caldavAbsoluut(adres, principalHref) || adres;
    const stap2 = await doeVerzoek({ methode: 'PROPFIND', url: principal, diepte: '0', lichaam: CALDAV_HOME_LICHAAM, gebruikersnaam, wachtwoord });
    if (!stap2.ok && stap2.status !== 207) return { ok: false, fout: statusCode(stap2.status) };
    const stap2Tekst = await stap2.text();
    // De eerste href in het antwoord is de resource zelf; de home-set staat in <calendar-home-set>.
    const homeBlok = /<[A-Za-z0-9_.:-]*calendar-home-set[^>]*>([\s\S]*?)<\/[A-Za-z0-9_.:-]*calendar-home-set>/i.exec(stap2Tekst);
    const home = caldavAbsoluut(adres, caldavEersteHref(homeBlok ? homeBlok[1] : '')) || principal;
    const stap3 = await doeVerzoek({ methode: 'PROPFIND', url: home, diepte: '1', lichaam: CALDAV_AGENDAS_LICHAAM, gebruikersnaam, wachtwoord });
    if (!stap3.ok && stap3.status !== 207) return { ok: false, fout: statusCode(stap3.status) };
    // De agenda's staan onder de home-set: hrefs daartegen oplossen (bij iCloud is dat een partitiehost, zie caldavAbsoluut).
    const agendas = ontleedCaldavAgendas(await stap3.text(), home).slice(0, CALDAV_MAX_AGENDAS);
    if (!agendas.length) return { ok: false, fout: 'CALDAV_GEEN_AGENDAS' };
    return { ok: true, principal, home, agendas };
  } catch (gevangen) { return { ok: false, fout: foutCode(gevangen) }; }
}

export const CALDAV_MAX_ACCOUNTS = 10;
export type CaldavKoppelUitslag = { ok: true; account: CaldavAccount } | { ok: false; fout: string };
/**
 * Koppelen: eerst ontdekken (zo weet de gebruiker meteen of het wachtwoord werkt en wélke agenda's er zijn),
 * dan pas opslaan. Een mislukte poging laat GEEN half account achter.
 */
export async function caldavKoppelen(ownerUserId: string, invoer: { adres: unknown; gebruikersnaam: unknown; wachtwoord: unknown; naam?: unknown; intervalMinuten?: unknown }): Promise<CaldavKoppelUitslag> {
  const { adres, fout } = veiligCaldavAdres(invoer.adres);
  if (fout) return { ok: false, fout };
  const gebruikersnaam = kort(invoer.gebruikersnaam, 320), wachtwoord = String(invoer.wachtwoord ?? '').slice(0, 500);
  if (!gebruikersnaam || !wachtwoord) return { ok: false, fout: 'CALDAV_AANMELDGEGEVENS_VEREIST' };
  let envelop = '';
  const lade = ladeOf(ownerUserId);
  // Sleutelkluis (0092): eigen gegevenssleutel zodra de mens die aanzette (open vereist), anders de serversleutel als vroeger.
  try { envelop = await verzegel(lade, 'app.agenda_abonnement', wachtwoord, aad(ownerUserId, adres, lade.ruimte), CALDAV_SLEUTEL_NAAM); }
  catch (e) { return { ok: false, fout: isGeslotenFout(e) ? SLEUTEL_GESLOTEN_CODE : 'CALDAV_SLEUTEL_ONTBREEKT' }; }
  // De grens geldt PER LADE: de technische ruimte eet de persoonlijke ruimte niet op en omgekeerd.
  const aantal = await sys().query(`SELECT count(*)::int AS n FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND bron = 'caldav'`, [ownerUserId]);
  if (Number(aantal.rows[0]?.n || 0) >= CALDAV_MAX_ACCOUNTS) return { ok: false, fout: 'CALDAV_TE_VEEL_ACCOUNTS' };
  const ontdekking = await caldavOntdekken(adres, gebruikersnaam, wachtwoord);
  if (!ontdekking.ok) return { ok: false, fout: ontdekking.fout };
  const id = randomUUID();
  try {
    const rij = await sys().query(
      `INSERT INTO app.agenda_abonnement (user_id, ruimte, id, bron, naam, adres, gebruikersnaam, geheim, interval_minuten, actief, agendas, laatste_staat)
       VALUES ($1,$9,$2,'caldav',$3,$4,$5,$6,$7,true,$8::jsonb,'nieuw')
       ON CONFLICT (user_id, ruimte, bron, adres) DO UPDATE SET
         gebruikersnaam = EXCLUDED.gebruikersnaam, geheim = EXCLUDED.geheim, agendas = EXCLUDED.agendas,
         naam = COALESCE(NULLIF(EXCLUDED.naam, ''), app.agenda_abonnement.naam), actief = true, bijgewerkt_op = now()
       RETURNING *`,
      [ownerUserId, id, kort(invoer.naam, 200), adres, gebruikersnaam, envelop,
        Math.max(15, Math.min(10080, Math.trunc(Number(invoer.intervalMinuten)) || CALDAV_STANDAARD_MINUTEN)),
        JSON.stringify(ontdekking.agendas).slice(0, 16000), lade.ruimte]);
    // De envelop is aan `adres` gebonden, niet aan het rij-id: bij ON CONFLICT houdt het bestaande id en blijft
    // de AAD dus kloppen.
    return { ok: true, account: uit(rij.rows[0] as Record<string, unknown>) };
  } catch { return { ok: false, fout: 'CALDAV_OPSLAAN_MISLUKT' }; }
}

export async function caldavVerwijderen(ownerUserId: string, id: string): Promise<boolean> {
  const lade = ladeOf(ownerUserId);
  const bestaat = await sys().query(`SELECT id FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND id = $2 AND bron = 'caldav'`, [ownerUserId, kort(id, 120)]);
  if (!bestaat.rows.length) return false;
  await externeSpiegelWis(ownerUserId, kort(id, 120));
  await sys().query(`DELETE FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND id = $2`, [ownerUserId, kort(id, 120)]);
  return true;
}

const vensterRand = (nu: number) => ({
  vanaf: new Date(nu - ICS_VENSTER_TERUG_DAGEN * 86400000).toISOString().replace(/\.\d+/, ''),
  tot: new Date(nu + ICS_VENSTER_VOORUIT_DAGEN * 86400000).toISOString().replace(/\.\d+/, ''),
});

export type CaldavHaalUitslag = { staat: 'klaar' | 'fout'; aantal: number; agendas: number; fout: string };
/** Alle agenda's van één CalDAV-account ophalen (REPORT per agenda, binnen het venster). */
export async function caldavOphalen(ownerUserId: string, id: string): Promise<CaldavHaalUitslag> {
  const lade = ladeOf(ownerUserId);
  const rijen = await sys().query(`SELECT * FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND id = $2 AND bron = 'caldav'`, [ownerUserId, kort(id, 120)]);
  const rij = rijen.rows[0] as Record<string, unknown> | undefined;
  if (!rij) return { staat: 'fout', aantal: 0, agendas: 0, fout: 'CALDAV_ACCOUNT_ONBEKEND' };
  const adres = kort(rij.adres, 2000), gebruikersnaam = kort(rij.gebruikersnaam, 320);
  let wachtwoord = '';
  try { wachtwoord = await ontzegel(lade, 'app.agenda_abonnement', String(rij.geheim || ''), aad(ownerUserId, adres, lade.ruimte), CALDAV_SLEUTEL_NAAM); }
  catch (e) {
    // Sleutel gesloten: geen fout van de koppeling, maar een eerlijke staat («після входу»); de rij blijft zoals hij was.
    const code = isGeslotenFout(e) ? SLEUTEL_GESLOTEN_CODE : 'CALDAV_GEHEIM_ONLEESBAAR';
    await caldavAfronden(ownerUserId, id, 'fout', 0, code); return { staat: 'fout', aantal: 0, agendas: 0, fout: code };
  }
  await sys().query(`UPDATE app.agenda_abonnement SET laatste_staat = 'bezig', laatst_op = now(), bijgewerkt_op = now() WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND id = $2`, [ownerUserId, kort(id, 120)]);
  const bekend = Array.isArray(rij.agendas) ? (rij.agendas as CaldavAgenda[]) : [];
  const agendas = bekend.length ? bekend : (await caldavOntdekken(adres, gebruikersnaam, wachtwoord).then((o) => (o.ok ? o.agendas : [])));
  if (!agendas.length) { await caldavAfronden(ownerUserId, id, 'fout', 0, 'CALDAV_GEEN_AGENDAS'); return { staat: 'fout', aantal: 0, agendas: 0, fout: 'CALDAV_GEEN_AGENDAS' }; }
  const { vanaf, tot } = vensterRand(Date.now());
  const lichaam = caldavQueryLichaam(vanaf, tot);
  let totaal = 0;
  for (const agenda of agendas.slice(0, CALDAV_MAX_AGENDAS)) {
    try {
      const respons = await doeVerzoek({ methode: 'REPORT', url: agenda.url, diepte: '1', lichaam, gebruikersnaam, wachtwoord });
      if (!respons.ok && respons.status !== 207) { await caldavAfronden(ownerUserId, id, 'fout', totaal, statusCode(respons.status)); return { staat: 'fout', aantal: totaal, agendas: agendas.length, fout: statusCode(respons.status) }; }
      const bronnen = ontleedCaldavGegevens(await respons.text());
      const nu = Date.now();
      const rijen2: ExterneRij[] = [];
      for (const bron of bronnen) {
        for (const gebeurtenis of ontleedIcs(bron.ics).gebeurtenissen) {
          if (!binnenIcsVenster(gebeurtenis, nu)) continue;
          rijen2.push({
            abonnementId: kort(id, 120), agendaUrl: agenda.url, uid: gebeurtenis.uid, titel: gebeurtenis.titel,
            locatie: gebeurtenis.locatie, beschrijving: gebeurtenis.beschrijving, begin: gebeurtenis.begin,
            einde: gebeurtenis.einde, heleDag: gebeurtenis.heleDag, tijdzone: gebeurtenis.tijdzone,
            rrule: gebeurtenis.rrule, status: gebeurtenis.status, reeks: gebeurtenis.reeks,
            gewijzigdOp: gebeurtenis.gewijzigdOp, url: gebeurtenis.url,
          });
        }
      }
      await externeSpiegelVervang(ownerUserId, kort(id, 120), agenda.url, rijen2);
      totaal += rijen2.length;
    } catch (gevangen) {
      const code = foutCode(gevangen);
      await caldavAfronden(ownerUserId, id, 'fout', totaal, code);
      return { staat: 'fout', aantal: totaal, agendas: agendas.length, fout: code };
    }
  }
  await caldavAfronden(ownerUserId, id, 'klaar', totaal, '', agendas);
  return { staat: 'klaar', aantal: totaal, agendas: agendas.length, fout: '' };
}

async function caldavAfronden(ownerUserId: string, id: string, staat: 'klaar' | 'fout', aantal: number, fout: string, agendas?: CaldavAgenda[]) {
  await sys().query(
    `UPDATE app.agenda_abonnement SET laatste_staat = $3, aantal = $4,
       fout = CASE WHEN $5 ~ '^[A-Z0-9_]{1,60}$' THEN $5 ELSE '' END,
       agendas = COALESCE($6::jsonb, agendas),
       poging = CASE WHEN $3 = 'fout' THEN LEAST(100, poging + 1) ELSE 0 END,
       laatst_klaar_op = CASE WHEN $3 = 'fout' THEN laatst_klaar_op ELSE now() END,
       bijgewerkt_op = now()
     WHERE ${sqlLadeWaar('ruimte', ladeOf(ownerUserId), 1)} AND id = $2`,
    [ownerUserId, kort(id, 120), staat, Math.max(0, Math.trunc(aantal)), kort(fout, 60), agendas ? JSON.stringify(agendas).slice(0, 16000) : null]);
}

export async function caldavRondeVoorEigenaar(ownerUserId: string, forceren = false) {
  const lijst = await caldavLijst(ownerUserId);
  const nu = Date.now(), uitslagen: Array<{ id: string } & CaldavHaalUitslag> = [];
  for (const account of lijst) {
    if (!account.actief) continue;
    if (!forceren && nu - account.laatstOp < Math.max(15, account.intervalMinuten) * 60000) continue;
    uitslagen.push({ id: account.id, ...await caldavOphalen(ownerUserId, account.id) });
  }
  return uitslagen;
}
export async function caldavCronRonde(limiet = 5) {
  const rijen = await sys().query(
    `SELECT user_id, COALESCE(ruimte, 'prive') AS ruimte, id FROM app.agenda_abonnement
      WHERE bron = 'caldav' AND actief
        AND (laatst_op IS NULL OR laatst_op < now() - (interval_minuten || ' minutes')::interval)
      ORDER BY laatst_op NULLS FIRST LIMIT $1`, [Math.max(1, Math.min(25, limiet))]);
  const uitslagen: unknown[] = [];
  let overgeslagen = 0;
  for (const rij of rijen.rows as Record<string, unknown>[]) {
    // Zelfde regel als bij ICS: de planner haalt de lade uit de RIJ en vraagt voor een technische rij eerst of die
    // lade nog open is. Een bevroren technische ruimte leest in de achtergrond dus niets meer.
    const lade: Lade = { userId: String(rij.user_id), ruimte: String(rij.ruimte) === 'technisch' ? 'technisch' : 'prive' };
    if (!await ladeNogGeldig(lade.userId, lade.ruimte, 'agenda')) { overgeslagen += 1; continue; }
    // Sleutelkluis (0092): zonder open sleutel (geen sessie, geen AI-verbinding) slaat de planner deze mens over — eerlijk gemeld.
    if ((await kluisStand(lade)) === 'gesloten') { overgeslagen += 1; uitslagen.push({ id: String(rij.id).slice(0, 8), staat: 'fout', fout: SLEUTEL_GESLOTEN_CODE }); continue; }
    try { uitslagen.push({ id: String(rij.id).slice(0, 8), ...await metLade(lade, 'agenda', () => caldavOphalen(lade.userId, String(rij.id))) }); }
    catch { uitslagen.push({ id: String(rij.id).slice(0, 8), staat: 'fout', fout: 'CALDAV_VERBINDING_MISLUKT' }); }
  }
  return { accounts: rijen.rows.length, uitslagen, overgeslagen };
}

/**
 * Schrijven naar CalDAV. BESTAAT NIET in deze versie en doet dus niets — behalve eerlijk zeggen waarom, met de
 * volledige lijst van wat er nog voor nodig is. Er is nergens een knop die hiernaartoe leidt; deze functie staat
 * er zodat een aanroeper (de AI, een route) nooit kan denken dat schrijven stil mislukte.
 */
export const caldavSchrijven = () => ({ ok: false as const, fout: 'CALDAV_SCHRIJVEN_NIET_GEBOUWD', ontbreekt: AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT });

// Sleutelkluis (0092): oude v1-wachtwoorden van déze lade onder de DEK zetten («перешифрувати зараз»).
registreerHerversleutelaar('app.agenda_abonnement', async (lade, dek) => {
  const rijen = await sys().query(`SELECT id, adres, geheim FROM app.agenda_abonnement WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND bron = 'caldav'`, [lade.userId]);
  let gevonden = 0, herversleuteld = 0;
  for (const r of rijen.rows as Array<{ id: string; adres: string; geheim: string }>) {
    if (!isServerEnvelop(r.geheim)) continue;
    gevonden++;
    try {
      const nieuw = herversleutelEnvelop(dek, r.geheim, aad(lade.userId, kort(r.adres, 2000), lade.ruimte), CALDAV_SLEUTEL_NAAM);
      await sys().query(`UPDATE app.agenda_abonnement SET geheim = $2, bijgewerkt_op = now() WHERE ${sqlLadeWaar('ruimte', lade, 1)} AND id = $3`, [lade.userId, nieuw, r.id]);
      herversleuteld++;
    } catch { /* blijft v1 */ }
  }
  return { gevonden, herversleuteld };
});
