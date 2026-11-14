// SEC-002 (geheimen-04) — de herstelcode van de sleutelkluis zonder valkuil, en het herstellen van een kluis zonder omslag.
//
// WAT ER MIS KON GAAN (backend/sleutelkluis.ts, ontgrendelMetHerstelcode): de gebruikte code werd vervangen VOORDAT de mens de
// nieuwe had gezien. Kwam het antwoord niet aan (mobiel net, dicht tabblad), dan had hij de oude niet meer en de nieuwe nooit
// gehad; zonder passkey met PRF waren na het einde van de sessie alle gegevens onder de eigen sleutel verloren.
//
// HOE HET NU GAAT (de routes gebruiken dit bestand):
//   • ontgrendelen met de code → de NIEUWE code komt als WACHTENDE omslag (houder 'herstelcode-nieuw'); de gebruikte code blijft
//     de actieve omslag (houder 'herstelcode') tot de mens bevestigt dat hij de nieuwe bewaard heeft («Я зберіг код» → Готово),
//     of tot hij de nieuwe code zelf gebruikt (dan heeft hij haar aantoonbaar). Pas dan vervalt de oude.
//   • een tweede keer ontgrendelen met de oude code (het antwoord ging verloren) werkt dus, en geeft opnieuw een nieuwe code;
//     de vorige wachtende (die niemand zag) is daarmee vervangen.
//   • «Новий код» (herstelcodeVernieuwenVeilig) vervangt alles: actieve én wachtende.
// De AAD van de wachtende omslag is die van de actieve ('herstelcode'): promoveren is dan alleen de kolom `houder` omzetten,
// zonder de KEK (de code) nodig te hebben. Tussen twee herstelcode-omslagen van DEZELFDE mens en ruimte valt niets te winnen
// met verwisselen: beide codes zijn aan die mens gegeven.
//
// KLUIS ZONDER OMSLAG («wees»): een kluisrij zonder één omslag kan niets openen en niets versleutelen. Dat kon ontstaan door
// het vroegere inschakelen in twee losse stappen. Er bestaan dan aantoonbaar geen rijen onder die sleutel (de sleutel is nooit
// open geweest), dus opruimen is zonder verlies: de kluis gaat terug naar «uit» en de mens kan opnieuw inschakelen.
import { randomBytes } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { clearLoginFailures, pogingReserveren } from '../server/platform/beveiliging';
import { auditToevoegen } from '../server/platform/audit';
import { SLEUTEL_GESLOTEN_CODE, herstelcodeGeldig, omslagAad } from '../shared/sleutelkluis';
import { kekUitHerstelcodeAsync } from './sleutelkluis-kdf';
import { meldBeveiligingsWijziging } from './beveiliging-meldingen'; // toets-g10b #3: dezelfde meldingen als de oude weg (privacy-logboek-03)
import {
  SCRYPT, SleutelkluisFout, herstelcodeVernieuwen, isIngeschakeld, nieuweHerstelcode, omslaan, omslagOpenen, sleutelIsOpen,
  sleutelOpenen, sleutelVergrendelen, standCacheLeeg, type HouderSoort, type KluisLade,
} from './sleutelkluis';

export const HERSTEL_ACTIEF = 'herstelcode';
export const HERSTEL_WACHT = 'herstelcode-nieuw';

const sys = () => getPool('systeem');
const ruimteOf = (r: unknown) => (r === 'technisch' ? 'technisch' : 'prive');
const fout = (code: string, status = 400): never => { throw new SleutelkluisFout(code, status); };
const nul = (b: Buffer) => { try { b.fill(0); } catch { /* niets */ } };
const herstelAad = (lade: KluisLade) => omslagAad(lade.userId, ruimteOf(lade.ruimte), 'herstelcode', HERSTEL_ACTIEF);

type Rij = { id: string; houder: string; parameters: { N?: number; r?: number; p?: number; salt?: string }; envelop: string };
async function herstelRijen(lade: KluisLade): Promise<Rij[]> {
  const r = await sys().query(
    `SELECT id::text AS id, houder, parameters, envelop FROM app.sleutelkluis_omslag
      WHERE user_id = $1 AND ruimte = $2 AND soort = 'herstelcode' AND houder = ANY($3::text[])`,
    [lade.userId, ruimteOf(lade.ruimte), [HERSTEL_ACTIEF, HERSTEL_WACHT]]);
  return r.rows as Rij[];
}

/** Staat er een nieuwe herstelcode te wachten op bevestiging? (voor de pagina: de vorige code werkt dan nog) */
export async function herstelcodeWacht(lade: KluisLade): Promise<boolean> {
  const r = await sys().query(`SELECT 1 FROM app.sleutelkluis_omslag WHERE user_id = $1 AND ruimte = $2 AND soort = 'herstelcode' AND houder = $3`, [lade.userId, ruimteOf(lade.ruimte), HERSTEL_WACHT]);
  return (r.rowCount ?? 0) > 0;
}

/** De wachtende omslag wordt de actieve; de vorige actieve vervalt. Eén transactie: nooit een moment zonder herstelcode-omslag. */
async function promoveer(lade: KluisLade): Promise<boolean> {
  const client = await sys().connect();
  try {
    await client.query('BEGIN');
    const wacht = await client.query(`SELECT id FROM app.sleutelkluis_omslag WHERE user_id = $1 AND ruimte = $2 AND soort = 'herstelcode' AND houder = $3 FOR UPDATE`, [lade.userId, ruimteOf(lade.ruimte), HERSTEL_WACHT]);
    if (!wacht.rowCount) { await client.query('ROLLBACK'); return false; }
    await client.query(`DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1 AND ruimte = $2 AND soort = 'herstelcode' AND houder = $3`, [lade.userId, ruimteOf(lade.ruimte), HERSTEL_ACTIEF]);
    await client.query(`UPDATE app.sleutelkluis_omslag SET houder = $4 WHERE user_id = $1 AND ruimte = $2 AND soort = 'herstelcode' AND houder = $3`, [lade.userId, ruimteOf(lade.ruimte), HERSTEL_WACHT, HERSTEL_ACTIEF]);
    await client.query('COMMIT');
    return true;
  } catch (e) { await client.query('ROLLBACK').catch(() => undefined); throw e; } finally { client.release(); }
}

/**
 * Ontgrendelen met de herstelcode (route). Lockout zoals bij aanmelden. De nieuwe code komt EENMALIG terug en wacht op
 * bevestiging; tot dan opent ook de zojuist gebruikte code nog (zie de kop van dit bestand).
 */
export async function ontgrendelMetHerstelcodeVeilig(lade: KluisLade, code: unknown, houder: { soort: HouderSoort; id: string }): Promise<{ herstelcode: string; bevestigen: true }> {
  if (!(await isIngeschakeld(lade))) fout('SLEUTELKLUIS_UIT', 409);
  if (!herstelcodeGeldig(code)) fout('SLEUTELKLUIS_HERSTELCODE_ONGELDIG', 403);
  const onderwerp = `sleutelkluis:${lade.userId}:${ruimteOf(lade.ruimte)}`;
  const poging = await pogingReserveren(onderwerp);
  if (!poging.toegestaan) fout('SLEUTELKLUIS_HERSTELCODE_GEBLOKKEERD', 429);
  const rijen = await herstelRijen(lade);
  let dek: Buffer | null = null;
  let via = '';
  // Eerst de actieve omslag, dan de wachtende (de mens kan de nieuwe code gebruiken zonder haar eerst te bevestigen).
  for (const naam of [HERSTEL_ACTIEF, HERSTEL_WACHT]) {
    const rij = rijen.find((r) => r.houder === naam);
    if (!rij) continue;
    const p = rij.parameters || {};
    try {
      const kek = await kekUitHerstelcodeAsync(String(code), Buffer.from(String(p.salt || ''), 'base64url'), { N: Number(p.N) || SCRYPT.N, r: Number(p.r) || SCRYPT.r, p: Number(p.p) || SCRYPT.p });
      try { dek = omslagOpenen(kek, rij.envelop, herstelAad(lade)); via = naam; } finally { nul(kek); }
      break;
    } catch (e) {
      if ((e as { code?: string }).code === 'SLEUTELKLUIS_BEZET') throw new SleutelkluisFout('SLEUTELKLUIS_BEZET', 429);
      /* deze omslag gaat met deze code niet open; de volgende proberen */
    }
  }
  if (!dek) fout('SLEUTELKLUIS_HERSTELCODE_ONGELDIG', 403);
  const open = dek!;
  try {
    await sleutelOpenen(lade, open, houder);
    // De mens gebruikte de NIEUWE code: hij heeft haar dus; de vorige vervalt nu.
    if (via === HERSTEL_WACHT) await promoveer(lade);
    const nieuw = nieuweHerstelcode();
    const salt = randomBytes(16);
    const envelop = omslaan(await kekUitHerstelcodeAsync(nieuw, salt, SCRYPT), open, herstelAad(lade));
    await sys().query(
      `INSERT INTO app.sleutelkluis_omslag (user_id, ruimte, soort, houder, deel, parameters, envelop)
       VALUES ($1, $2, 'herstelcode', $3, '', $4::jsonb, $5)
       ON CONFLICT (user_id, ruimte, soort, houder, deel) DO UPDATE SET parameters = EXCLUDED.parameters, envelop = EXCLUDED.envelop, aangemaakt_op = now(), laatst_gebruikt_op = NULL`,
      [lade.userId, ruimteOf(lade.ruimte), HERSTEL_WACHT, JSON.stringify({ kdf: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64url') }), envelop]);
    await sys().query(`UPDATE app.sleutelkluis_omslag SET laatst_gebruikt_op = now() WHERE user_id = $1 AND ruimte = $2 AND soort = 'herstelcode' AND houder = $3`, [lade.userId, ruimteOf(lade.ruimte), HERSTEL_ACTIEF]).catch(() => undefined);
    await clearLoginFailures(onderwerp);
    await auditToevoegen({ ownerId: lade.userId, actorId: lade.userId, action: 'sleutelkluis.ontgrendeld', type: 'beveiliging', result: 'success', details: { ruimte: ruimteOf(lade.ruimte), methode: 'herstelcode', nieuweCode: true, wachtOpBevestiging: true } }).catch(() => undefined);
    await meldBeveiligingsWijziging(lade.userId, 'kluis', { wat: 'geopend met herstelcode / відкрито кодом відновлення' });
    return { herstelcode: nieuw, bevestigen: true };
  } finally { nul(open); }
}

/**
 * «Ik heb de nieuwe code bewaard»: de wachtende code wordt de enige; de vorige werkt niet meer. Alleen met een OPEN sleutel in
 * deze sessie: zo kan de mens, mocht hij zich vergissen, meteen nog een nieuwe code maken en raakt hij nooit buitengesloten.
 */
export async function herstelcodeBevestigen(lade: KluisLade): Promise<{ bevestigd: boolean }> {
  if (!(await isIngeschakeld(lade))) fout('SLEUTELKLUIS_UIT', 409);
  if (!sleutelIsOpen(lade)) fout(SLEUTEL_GESLOTEN_CODE, 423);
  const bevestigd = await promoveer(lade);
  if (bevestigd) await auditToevoegen({ ownerId: lade.userId, actorId: lade.userId, action: 'sleutelkluis.herstelcode_bevestigd', type: 'beveiliging', result: 'success', details: { ruimte: ruimteOf(lade.ruimte) } }).catch(() => undefined);
  if (bevestigd) await meldBeveiligingsWijziging(lade.userId, 'kluis', { wat: 'nieuwe herstelcode bevestigd / новий код відновлення підтверджено' });
  return { bevestigd };
}

/** «Новий код» (route): nieuwe actieve code en GEEN wachtende meer — alle eerdere codes zijn daarmee waardeloos. */
export async function herstelcodeVernieuwenVeilig(lade: KluisLade): Promise<{ herstelcode: string }> {
  const uit = await herstelcodeVernieuwen(lade);
  await sys().query(`DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1 AND ruimte = $2 AND soort = 'herstelcode' AND houder = $3`, [lade.userId, ruimteOf(lade.ruimte), HERSTEL_WACHT]);
  return uit;
}

/** Staat de kluis «aan» zonder één omslag? Dan kan niemand hem ooit openen (zie de kop van dit bestand). */
export async function kluisZonderOmslag(lade: KluisLade): Promise<boolean> {
  const r = await sys().query(
    `SELECT 1 FROM app.sleutelkluis k WHERE k.user_id = $1 AND k.ruimte = $2
        AND NOT EXISTS (SELECT 1 FROM app.sleutelkluis_omslag o WHERE o.user_id = k.user_id AND o.ruimte = k.ruimte)`,
    [lade.userId, ruimteOf(lade.ruimte)]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Een kluis zonder omslag opruimen: terug naar «uit», zodat de mens opnieuw kan inschakelen. Weigert zodra er ook maar één
 * omslag bestaat (dan zijn er mogelijk gegevens onder die sleutel; die weg vraagt een besluit en staat hier bewust NIET).
 */
export async function weesKluisHerstellen(lade: KluisLade): Promise<{ hersteld: boolean }> {
  if (!(await isIngeschakeld(lade))) { standCacheLeeg(lade); return { hersteld: false }; }
  if (sleutelIsOpen(lade)) fout('SLEUTELKLUIS_HEEFT_OMSLAGEN', 409);
  const weg = await sys().query(
    `DELETE FROM app.sleutelkluis k WHERE k.user_id = $1 AND k.ruimte = $2
        AND NOT EXISTS (SELECT 1 FROM app.sleutelkluis_omslag o WHERE o.user_id = k.user_id AND o.ruimte = k.ruimte)`,
    [lade.userId, ruimteOf(lade.ruimte)]);
  standCacheLeeg(lade);
  if (!weg.rowCount) fout('SLEUTELKLUIS_HEEFT_OMSLAGEN', 409);
  sleutelVergrendelen(lade);
  await sys().query('DELETE FROM app.sleutelkluis_journaal WHERE user_id = $1 AND ruimte = $2', [lade.userId, ruimteOf(lade.ruimte)]).catch(() => undefined);
  await auditToevoegen({ ownerId: lade.userId, actorId: lade.userId, action: 'sleutelkluis.zonder_omslag_hersteld', type: 'beveiliging', result: 'success', details: { ruimte: ruimteOf(lade.ruimte) } }).catch(() => undefined);
  await meldBeveiligingsWijziging(lade.userId, 'kluis', { wat: 'kluis zonder omslag teruggezet / сховище без обгорток скинуто' });
  return { hersteld: true };
}
