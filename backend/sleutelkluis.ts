// DE SLEUTELKLUIS — per mens en per ruimte een eigen gegevenssleutel (DEK) die de server nooit in platte vorm bewaart.
// Migratie 0092; gedeelde regels/teksten/register in shared/sleutelkluis.ts; routes in backend/sleutelkluis-routes.ts.
//
// BESLUIT VAN DE EIGENAAR (20.10.2026): «ключ користувача + фон під час сесії». Dat betekent hier precies:
//   1. De DEK (32 bytes, per (userId, ruimte)) staat in de database ALLEEN omgeslagen (app.sleutelkluis_omslag):
//        • 'passkey'     KEK = HKDF(PRF-uitkomst van de passkey). Het omslaan én het openen gebeuren IN DE BROWSER
//                        (src/platform/sleutelkluis-client.ts); de browser stuurt de geopende DEK over TLS naar de server, die
//                        hem tegen `controle` verifieert en in het GEHEUGEN houdt. Waarom niet de KEK sturen: dan zou de server
//                        bij elk ontgrendelen het langlevende omslagsgeheim zien; nu ziet hij alleen wat hij toch nodig heeft.
//        • 'herstelcode' KEK = scrypt(herstelcode) met hoge parameters (N=2^16, r=8, p=1, 64 MiB). Eén keer getoond.
//        • 'grant'       KEK = HKDF(token van de AI-verbinding + serverpepper). Het token heeft alleen de agent (de server
//                        bewaart er een hash van). Twee omslagen per verbinding: 'toegang' (access-token, elk verzoek) en
//                        'vernieuw' (refresh-token, bij roteren). BEWUST COMPROMIS uit het besluit: een agent werkt zonder mens,
//                        maar uitsluitend zolang zijn token geldig is; intrekken of verlopen = dicht, en de omslagen worden
//                        verwijderd. Zonder geldig token kan ook de beheerder (DB + pepper) de DEK niet openen.
//      Er bestaat GEEN omslag met alleen een serversleutel. Dat is de hele belofte: back-up + omgeving ≠ gegevens.
//   2. Het geheugen van de server: Map (userId|ruimte) → { dek, houders }. Een houder is een sessie of een AI-verbinding, met
//      een eindtijd; zonder houders verdwijnt de DEK (buffer genuld). Houders worden ook LUI gecontroleerd tegen de database
//      (sessie ingetrokken/afgemeld, verbinding ingetrokken/verlopen), zodat ELKE uitlogweg — ook «overal afmelden» — de sleutel
//      sluit, ook waar niemand expliciet sleutelSluiten() aanriep. Nooit in logs: er wordt nergens een DEK of KEK gelogd.
//   3. Achtergrondtaken vragen `kluisStand(lade)`: 'open' → werken; 'gesloten' → overslaan met de eerlijke code
//      SLEUTELKLUIS_GESLOTEN (zichtbaar in de UI van de dienst); 'uit' → de oude weg (serversleutel).
//   4. Twee ruimtes = twee ONAFHANKELIJKE DEK's (niet afgeleid). Afleiden (technisch = HKDF(persoonlijk)) zou betekenen dat wie de
//      persoonlijke sleutel heeft ook de technische heeft — dat is de goede richting, maar het dwingt ook één gezamenlijke
//      omslag af en koppelt de levensduur. Onafhankelijk is eenvoudiger te bewijzen: een technisch profiel krijgt van de routes
//      alleen de technische DEK, en de AAD van elke envelop en elke omslag draagt de ruimte, dus zelfs een verwisselde rij gaat
//      niet open.
//   5. Bestaande rijen ('v1.' met de serversleutel) blijven leesbaar. Lezen via de oude weg terwijl de kluis aanstaat wordt
//      geteld in app.sleutelkluis_journaal ('serversleutel-gelezen'), en «Перешифрувати мої дані зараз» zet ze om.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { clearLoginFailures, envKey32, openWithEnvKey, pogingReserveren, sealWithEnvKey } from '../server/platform/beveiliging';
import { auditToevoegen } from '../server/platform/audit';
import type { AiRuimte } from '../shared/ai-ruimte';
import {
  DEK_ENVELOP, HERSTELCODE_ALFABET, HERSTELCODE_LENGTE, KEK_INFO, OMSLAG, SLEUTEL_GESLOTEN_CODE, SLEUTELKLUIS_REGISTER,
  herstelcodeGeldig, isDekEnvelop, isServerEnvelop, normaliseerHerstelcode, omslagAad, type KluisStand,
} from '../shared/sleutelkluis';

export type KluisLade = { userId: string; ruimte: AiRuimte };
export class SleutelkluisFout extends Error { constructor(public code: string, public status = 400) { super(code); } }
const fout = (code: string, status = 400): never => { throw new SleutelkluisFout(code, status); };
export const isGeslotenFout = (e: unknown): boolean => (e as { code?: string } | null)?.code === SLEUTEL_GESLOTEN_CODE || (e as Error | null)?.message === SLEUTEL_GESLOTEN_CODE;

const sys = () => getPool('systeem');
const ruimteOf = (r: unknown): AiRuimte => (r === 'technisch' ? 'technisch' : 'prive');
const sleutelVan = (l: KluisLade) => `${l.userId}|${ruimteOf(l.ruimte)}`;
const CONTROLE_TEKST = 'mijn-ruimte-sleutelkluis-controle-v1';
export const controleVan = (dek: Buffer): string => createHmac('sha256', dek).update(CONTROLE_TEKST).digest('hex');
const veiligGelijk = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

// ------------------------------------------------------------------------------------------------ AES-256-GCM
const gcmDicht = (prefix: string, key: Buffer, plaintext: Buffer, aad: string): string => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return [prefix, iv.toString('base64url'), ct.toString('base64url'), c.getAuthTag().toString('base64url')].join('.');
};
const gcmOpen = (prefix: string, key: Buffer, envelop: string, aad: string): Buffer => {
  const [v, iv, ct, tag, extra] = String(envelop || '').split('.');
  if (v !== prefix || !iv || ct === undefined || !tag || extra !== undefined) throw new SleutelkluisFout('ENVELOP_ONGELDIG');
  const ivBuf = Buffer.from(iv, 'base64url');
  const tagBuf = Buffer.from(tag, 'base64url');
  if (ivBuf.length !== 12 || tagBuf.length !== 16) throw new SleutelkluisFout('ENVELOP_ONGELDIG');
  const d = createDecipheriv('aes-256-gcm', key, ivBuf, { authTagLength: 16 });
  d.setAAD(Buffer.from(aad, 'utf8'));
  d.setAuthTag(tagBuf);
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]);
};
/** Een waarde onder de DEK: 'dek1.<iv>.<ct>.<tag>'. */
export const verzegelMetDek = (dek: Buffer, plaintext: string, aad: string): string => gcmDicht(DEK_ENVELOP, dek, Buffer.from(plaintext, 'utf8'), aad);
export const ontzegelMetDek = (dek: Buffer, envelop: string, aad: string): string => gcmOpen(DEK_ENVELOP, dek, envelop, aad).toString('utf8');
/** De DEK onder een KEK: 'omslag1.…' (zelfde vorm voor alle omslagsoorten; ook de browser maakt deze vorm). */
export const omslaan = (kek: Buffer, dek: Buffer, aad: string): string => gcmDicht(OMSLAG, kek, dek, aad);
export const omslagOpenen = (kek: Buffer, envelop: string, aad: string): Buffer => gcmOpen(OMSLAG, kek, envelop, aad);

// ------------------------------------------------------------------------------------------------ KEK-afleiding
export const SCRYPT = Object.freeze({ N: 1 << 16, r: 8, p: 1, maxmem: 160 * 1024 * 1024 });
export const kekUitHerstelcode = (code: string, salt: Buffer, p: { N: number; r: number; p: number } = SCRYPT): Buffer =>
  scryptSync(normaliseerHerstelcode(code), salt, 32, { N: p.N, r: p.r, p: p.p, maxmem: SCRYPT.maxmem });
/** KEK uit de PRF-uitkomst (32 bytes) van een passkey — de browser rekent dit; hier alleen voor tests en documentatie. */
export const kekUitPrf = (prf: Buffer): Buffer => Buffer.from(hkdfSync('sha256', prf, Buffer.alloc(0), KEK_INFO, 32));
/** Pepper voor grant-omslagen: eigen sleutel, anders de TOTP-sleutel (bestaat op elke uitrol); zonder = geen grant-omslagen. */
const pepper = (): Buffer | null => envKey32('SLEUTELKLUIS_SLEUTEL_V1') || envKey32('TOTP_ENCRYPTION_KEY_V1');
const kekUitToken = (token: string, p: Buffer): Buffer => Buffer.from(hkdfSync('sha256', Buffer.from(token, 'utf8'), p, `${KEK_INFO}|grant`, 32));

export const nieuweHerstelcode = (): string => { let s = ''; const b = randomBytes(HERSTELCODE_LENGTE); for (let i = 0; i < HERSTELCODE_LENGTE; i++) s += HERSTELCODE_ALFABET[b[i] % HERSTELCODE_ALFABET.length]; return s; };

// ------------------------------------------------------------------------------------------------ geheugen
export type HouderSoort = 'sessie' | 'grant' | 'intern';
type Houder = { id: string; soort: HouderSoort; tot: number; gecontroleerd: number };
type Open = { dek: Buffer; houders: Map<string, Houder> };
const geheugen = new Map<string, Open>();
/** Hoe lang een sessie-houder hoogstens meegaat zonder vernieuwing (de lui-controle sluit hem eerder bij uitloggen). */
export const SESSIE_HOUDER_MS = 12 * 60 * 60 * 1000;
const CONTROLE_INTERVAL_MS = 60 * 1000;
const houderId = (soort: HouderSoort, id: string) => `${soort}:${id}`;

/** Leeft deze houder nog volgens de database? Vervangbaar in tests. Sessies: tab-overlay of ankersessie; grants: mcp_oauth_tokens. */
let houderLeeft: (h: Houder) => Promise<boolean> = async (h) => {
  try {
    if (h.soort === 'sessie') {
      const r = await sys().query(
        `SELECT tbl, data FROM app.records WHERE id = $1 AND tbl IN ('owner_tab_sessions_v1', 'owner_service_sessions_v1')`, [h.id]);
      const rij = r.rows[0] as { tbl: string; data: Record<string, unknown> } | undefined;
      if (!rij) return false;
      const d = rij.data, nu = Date.now();
      if (d.revokedAt) return false;
      if (rij.tbl === 'owner_tab_sessions_v1' && d.status === 'signed_out') return false;
      if (Number(d.idleExpiresAt || 0) > 0 && Number(d.idleExpiresAt) < nu) return false;
      if (Number(d.absoluteExpiresAt || 0) > 0 && Number(d.absoluteExpiresAt) < nu) return false;
      return true;
    }
    if (h.soort === 'grant') {
      const r = await sys().query(`SELECT 1 FROM app.mcp_oauth_tokens WHERE id::text = $1 AND revoked_at IS NULL AND refresh_expires_at > now()`, [h.id]);
      return (r.rowCount ?? 0) > 0;
    }
    return true;
  } catch { return true; } // een databasestoring sluit de sleutel niet (hij heeft toch een eindtijd)
};
export const zetHouderControle = (fn: typeof houderLeeft | null) => { houderLeeft = fn ?? houderLeeft; };

const nul = (b: Buffer) => { try { b.fill(0); } catch { /* niets */ } };
const opruimen = (sleutel: string, o: Open, nu = Date.now()) => {
  for (const [k, h] of o.houders) if (h.tot <= nu) o.houders.delete(k);
  if (!o.houders.size) { nul(o.dek); geheugen.delete(sleutel); }
};
/** Lui: houders die lang niet gecontroleerd zijn, nameten tegen de database (fire-and-forget, dus nooit op het pad van een verzoek). */
const luiControleren = (sleutel: string, o: Open) => {
  const nu = Date.now();
  for (const h of o.houders.values()) {
    if (nu - h.gecontroleerd < CONTROLE_INTERVAL_MS) continue;
    h.gecontroleerd = nu;
    void houderLeeft(h).then((leeft) => { if (!leeft) { o.houders.delete(houderId(h.soort, h.id)); opruimen(sleutel, o); } }).catch(() => undefined);
  }
};
/** De open DEK van deze lade, of null. NOOIT loggen. */
export function sleutelOpen(lade: KluisLade): Buffer | null {
  const k = sleutelVan(lade);
  const o = geheugen.get(k);
  if (!o) return null;
  opruimen(k, o);
  if (!geheugen.has(k)) return null;
  luiControleren(k, o);
  return o.dek;
}
export const sleutelIsOpen = (lade: KluisLade): boolean => sleutelOpen(lade) !== null;
/** Alle laden waarvan de sleutel NU open staat (voor de achtergrondronde in het serverproces). */
export function openLaden(): KluisLade[] {
  const uit: KluisLade[] = [];
  for (const [k, o] of [...geheugen]) { opruimen(k, o); if (geheugen.has(k)) { const [userId, ruimte] = k.split('|'); uit.push({ userId, ruimte: ruimteOf(ruimte) }); } }
  return uit;
}
/** Heeft deze mens een kluis die in DIT proces dicht is? Dan hoort een achtergrondtaak hem over te slaan (anders sterven zijn taken aan mislukte pogingen). */
export async function kluisGeslotenVoorGebruiker(userId: string): Promise<boolean> {
  return (await kluisStand({ userId, ruimte: 'prive' })) === 'gesloten' || (await kluisStand({ userId, ruimte: 'technisch' })) === 'gesloten';
}
/** Alle houders van deze sleutel (voor de pagina: «відкритий для сесії / для N ШІ-підключень»). */
export function houdersVan(lade: KluisLade): Array<{ soort: HouderSoort; tot: number }> {
  const o = geheugen.get(sleutelVan(lade));
  if (!o) return [];
  return [...o.houders.values()].map((h) => ({ soort: h.soort, tot: h.tot }));
}
/** DEK in het geheugen zetten voor een houder; verifieert eerst tegen `controle` in de database. */
export async function sleutelOpenen(lade: KluisLade, dek: Buffer, houder: { soort: HouderSoort; id: string; tot?: number }): Promise<void> {
  if (!Buffer.isBuffer(dek) || dek.length !== 32) fout('SLEUTELKLUIS_DEK_ONGELDIG', 403);
  const k = await kluisVan(lade);
  if (!k) fout('SLEUTELKLUIS_UIT', 409);
  if (!veiligGelijk(controleVan(dek), k!.controle)) fout('SLEUTELKLUIS_DEK_ONGELDIG', 403);
  const sleutel = sleutelVan(lade);
  const nu = Date.now();
  const h: Houder = { id: String(houder.id), soort: houder.soort, tot: houder.tot ?? nu + SESSIE_HOUDER_MS, gecontroleerd: nu };
  const bestaand = geheugen.get(sleutel);
  if (bestaand) { bestaand.houders.set(houderId(h.soort, h.id), h); return; }
  geheugen.set(sleutel, { dek: Buffer.from(dek), houders: new Map([[houderId(h.soort, h.id), h]]) });
}
/** Een sessie of verbinding is weg: haal haar als houder weg; zonder houders verdwijnt de DEK uit het geheugen. */
export function sleutelSluitenVoorHouder(soort: HouderSoort, id: string): number {
  let n = 0;
  for (const [k, o] of geheugen) { if (o.houders.delete(houderId(soort, id))) n++; opruimen(k, o); }
  return n;
}
/** De sleutel van deze lade helemaal uit het geheugen (alle houders). */
export function sleutelVergrendelen(lade: KluisLade): void {
  const k = sleutelVan(lade);
  const o = geheugen.get(k);
  if (!o) return;
  o.houders.clear(); nul(o.dek); geheugen.delete(k);
}
/** Alle sleutels van deze mens dicht (blokkeren, verwijderen, «overal afmelden»). */
export function sleutelVergrendelenVoorGebruiker(userId: string): void {
  sleutelVergrendelen({ userId, ruimte: 'prive' });
  sleutelVergrendelen({ userId, ruimte: 'technisch' });
}
/** Alleen voor tests: alles dicht. */
export function geheugenLeeg(): void { for (const [k, o] of geheugen) { o.houders.clear(); nul(o.dek); geheugen.delete(k); } }

// ------------------------------------------------------------------------------------------------ database
export type Kluis = { controle: string; ingeschakeldOp: number; herversleuteldOp: number };
/** Korte cache voor «staat de kluis aan?» — dit wordt op elk verzegel/ontzegelpad gevraagd. */
const standCache = new Map<string, { kluis: Kluis | null; tot: number }>();
const STAND_CACHE_MS = 5000;
export const standCacheLeeg = (lade?: KluisLade) => { if (lade) standCache.delete(sleutelVan(lade)); else standCache.clear(); };
export async function kluisVan(lade: KluisLade): Promise<Kluis | null> {
  const k = sleutelVan(lade);
  const c = standCache.get(k);
  if (c && c.tot > Date.now()) return c.kluis;
  const r = await sys().query('SELECT controle, ingeschakeld_op, herversleuteld_op FROM app.sleutelkluis WHERE user_id = $1 AND ruimte = $2', [lade.userId, ruimteOf(lade.ruimte)]);
  const rij = r.rows[0] as { controle: string; ingeschakeld_op: Date; herversleuteld_op: Date | null } | undefined;
  const kluis = rij ? { controle: rij.controle, ingeschakeldOp: new Date(rij.ingeschakeld_op).getTime(), herversleuteldOp: rij.herversleuteld_op ? new Date(rij.herversleuteld_op).getTime() : 0 } : null;
  standCache.set(k, { kluis, tot: Date.now() + STAND_CACHE_MS });
  return kluis;
}
export const isIngeschakeld = async (lade: KluisLade): Promise<boolean> => (await kluisVan(lade)) !== null;
/** Voor achtergrondtaken en de UI: 'uit' (oude weg), 'gesloten' (overslaan), 'open' (werken). */
export async function kluisStand(lade: KluisLade): Promise<KluisStand> {
  if (!(await isIngeschakeld(lade))) return 'uit';
  return sleutelIsOpen(lade) ? 'open' : 'gesloten';
}

type OmslagRij = { id: string; soort: 'passkey' | 'herstelcode' | 'grant'; houder: string; deel: string; parameters: Record<string, unknown>; envelop: string; aangemaakt_op: Date; laatst_gebruikt_op: Date | null };
async function omslagen(lade: KluisLade, soort?: OmslagRij['soort'], houder?: string): Promise<OmslagRij[]> {
  const r = await sys().query(
    `SELECT id::text AS id, soort, houder, deel, parameters, envelop, aangemaakt_op, laatst_gebruikt_op FROM app.sleutelkluis_omslag
      WHERE user_id = $1 AND ruimte = $2 AND ($3::text IS NULL OR soort = $3) AND ($4::text IS NULL OR houder = $4) ORDER BY aangemaakt_op`,
    [lade.userId, ruimteOf(lade.ruimte), soort ?? null, houder ?? null]);
  return r.rows as OmslagRij[];
}
async function omslagSchrijven(lade: KluisLade, soort: OmslagRij['soort'], houder: string, deel: string, parameters: Record<string, unknown>, envelop: string): Promise<void> {
  await sys().query(
    `INSERT INTO app.sleutelkluis_omslag (user_id, ruimte, soort, houder, deel, parameters, envelop)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (user_id, ruimte, soort, houder, deel) DO UPDATE SET parameters = EXCLUDED.parameters, envelop = EXCLUDED.envelop, aangemaakt_op = now(), laatst_gebruikt_op = NULL`,
    [lade.userId, ruimteOf(lade.ruimte), soort, houder, deel, JSON.stringify(parameters), envelop]);
}
const omslagGebruikt = (id: string) => sys().query('UPDATE app.sleutelkluis_omslag SET laatst_gebruikt_op = now() WHERE id = $1::uuid', [id]).catch(() => undefined);

/** Journaal: tellers per tabel (geen inhoud). Fire-and-forget. */
export function journaalTellen(lade: KluisLade, tabel: string, soort: 'serversleutel-gelezen' | 'herversleuteld' | 'gesloten-overgeslagen', aantal = 1): void {
  if (!/^[a-z0-9_.]{1,80}$/.test(tabel) || aantal <= 0) return;
  void sys().query(
    `INSERT INTO app.sleutelkluis_journaal (user_id, ruimte, tabel, soort, aantal, laatst_op) VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (user_id, ruimte, tabel, soort) DO UPDATE SET aantal = app.sleutelkluis_journaal.aantal + EXCLUDED.aantal, laatst_op = now()`,
    [lade.userId, ruimteOf(lade.ruimte), tabel, soort, aantal]).catch(() => undefined);
}
export async function journaalVan(lade: KluisLade): Promise<Array<{ tabel: string; soort: string; aantal: number; laatstOp: number }>> {
  const r = await sys().query('SELECT tabel, soort, aantal, laatst_op FROM app.sleutelkluis_journaal WHERE user_id = $1 AND ruimte = $2 ORDER BY tabel, soort', [lade.userId, ruimteOf(lade.ruimte)]);
  return r.rows.map((x) => ({ tabel: String(x.tabel), soort: String(x.soort), aantal: Number(x.aantal), laatstOp: new Date(x.laatst_op).getTime() }));
}

// ------------------------------------------------------------------------------------------------ verzegelen/ontzegelen (de twee wegen)
/**
 * Nieuwe rij schrijven. Kluis aan → ALLEEN onder de DEK (open vereist, anders SLEUTELKLUIS_GESLOTEN: nooit stil terugvallen op
 * de serversleutel, dat zou de belofte breken). Kluis uit → de oude weg (serversleutel uit de omgeving), exact als vroeger.
 */
export async function verzegel(lade: KluisLade, tabel: string, plaintext: string, aad: string, serverSleutel: string): Promise<string> {
  if (await isIngeschakeld(lade)) {
    const dek = sleutelOpen(lade);
    if (!dek) fout(SLEUTEL_GESLOTEN_CODE, 423);
    return verzegelMetDek(dek!, plaintext, aad);
  }
  return sealWithEnvKey(serverSleutel, plaintext, aad);
}
/** Lezen: 'dek1.' vraagt een open DEK; 'v1.' gaat via de serversleutel en wordt geteld als de kluis aanstaat. */
export async function ontzegel(lade: KluisLade, tabel: string, envelop: string, aad: string, serverSleutel: string): Promise<string> {
  if (isDekEnvelop(envelop)) {
    const dek = sleutelOpen(lade);
    if (!dek) fout(SLEUTEL_GESLOTEN_CODE, 423);
    return ontzegelMetDek(dek!, envelop, aad);
  }
  const uit = openWithEnvKey(serverSleutel, envelop, aad);
  if (await isIngeschakeld(lade)) journaalTellen(lade, tabel, 'serversleutel-gelezen');
  return uit;
}
/** Is deze rij nog van de oude weg? (voor «ще серверним ключем» in lijsten, zonder te ontsleutelen) */
export const nogServerSleutel = (envelop: unknown): boolean => isServerEnvelop(envelop);

// ------------------------------------------------------------------------------------------------ inschakelen / herstelcode
export async function inschakelen(lade: KluisLade, houder: { soort: HouderSoort; id: string }): Promise<{ herstelcode: string }> {
  if (await isIngeschakeld(lade)) fout('SLEUTELKLUIS_AL_AAN', 409);
  const dek = randomBytes(32);
  const code = nieuweHerstelcode();
  const salt = randomBytes(16);
  const envelop = omslaan(kekUitHerstelcode(code, salt), dek, omslagAad(lade.userId, ruimteOf(lade.ruimte), 'herstelcode', 'herstelcode'));
  await sys().query('INSERT INTO app.sleutelkluis (user_id, ruimte, controle) VALUES ($1, $2, $3)', [lade.userId, ruimteOf(lade.ruimte), controleVan(dek)]);
  standCacheLeeg(lade);
  await omslagSchrijven(lade, 'herstelcode', 'herstelcode', '', { kdf: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64url') }, envelop);
  await sleutelOpenen(lade, dek, houder);
  nul(dek);
  await auditToevoegen({ ownerId: lade.userId, actorId: lade.userId, action: 'sleutelkluis.ingeschakeld', type: 'beveiliging', result: 'success', details: { ruimte: ruimteOf(lade.ruimte) } }).catch(() => undefined);
  return { herstelcode: code };
}
/** Nieuwe herstelcode (de oude werkt meteen niet meer). Alleen met een open sleutel. */
export async function herstelcodeVernieuwen(lade: KluisLade): Promise<{ herstelcode: string }> {
  if (!(await isIngeschakeld(lade))) fout('SLEUTELKLUIS_UIT', 409);
  const dek = sleutelOpen(lade);
  if (!dek) fout(SLEUTEL_GESLOTEN_CODE, 423);
  const code = nieuweHerstelcode();
  const salt = randomBytes(16);
  const envelop = omslaan(kekUitHerstelcode(code, salt), dek!, omslagAad(lade.userId, ruimteOf(lade.ruimte), 'herstelcode', 'herstelcode'));
  await omslagSchrijven(lade, 'herstelcode', 'herstelcode', '', { kdf: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64url') }, envelop);
  await auditToevoegen({ ownerId: lade.userId, actorId: lade.userId, action: 'sleutelkluis.herstelcode_vernieuwd', type: 'beveiliging', result: 'success', details: { ruimte: ruimteOf(lade.ruimte) } }).catch(() => undefined);
  return { herstelcode: code };
}
/**
 * Ontgrendelen met de herstelcode: lockout zoals bij aanmelden (5 pogingen, oplopend), KEK direct weggegooid. De code werkt
 * ÉÉN keer: na gebruik wordt meteen een nieuwe gemaakt en eenmalig teruggegeven (wie de oude ooit zag, kan er niets meer mee).
 */
export async function ontgrendelMetHerstelcode(lade: KluisLade, code: unknown, houder: { soort: HouderSoort; id: string }): Promise<{ herstelcode: string }> {
  if (!(await isIngeschakeld(lade))) fout('SLEUTELKLUIS_UIT', 409);
  if (!herstelcodeGeldig(code)) fout('SLEUTELKLUIS_HERSTELCODE_ONGELDIG', 403);
  const onderwerp = `sleutelkluis:${lade.userId}:${ruimteOf(lade.ruimte)}`;
  const poging = await pogingReserveren(onderwerp);
  if (!poging.toegestaan) fout('SLEUTELKLUIS_HERSTELCODE_GEBLOKKEERD', 429);
  const [rij] = await omslagen(lade, 'herstelcode', 'herstelcode');
  if (!rij) fout('SLEUTELKLUIS_HERSTELCODE_ONGELDIG', 403);
  const p = rij!.parameters as { N?: number; r?: number; p?: number; salt?: string };
  let dek: Buffer;
  try {
    const kek = kekUitHerstelcode(String(code), Buffer.from(String(p.salt || ''), 'base64url'), { N: Number(p.N) || SCRYPT.N, r: Number(p.r) || SCRYPT.r, p: Number(p.p) || SCRYPT.p });
    dek = omslagOpenen(kek, rij!.envelop, omslagAad(lade.userId, ruimteOf(lade.ruimte), 'herstelcode', 'herstelcode'));
    nul(kek);
  } catch { fout('SLEUTELKLUIS_HERSTELCODE_ONGELDIG', 403); }
  await sleutelOpenen(lade, dek!, houder);
  // Eenmalig: de oude omslag wordt NU vervangen door een nieuwe code (de oude gaat nooit meer open).
  const nieuw = nieuweHerstelcode();
  const salt = randomBytes(16);
  const envelop = omslaan(kekUitHerstelcode(nieuw, salt), dek!, omslagAad(lade.userId, ruimteOf(lade.ruimte), 'herstelcode', 'herstelcode'));
  await omslagSchrijven(lade, 'herstelcode', 'herstelcode', '', { kdf: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64url') }, envelop);
  nul(dek!);
  await clearLoginFailures(onderwerp);
  await auditToevoegen({ ownerId: lade.userId, actorId: lade.userId, action: 'sleutelkluis.ontgrendeld', type: 'beveiliging', result: 'success', details: { ruimte: ruimteOf(lade.ruimte), methode: 'herstelcode', nieuweCode: true } }).catch(() => undefined);
  return { herstelcode: nieuw };
}

// ------------------------------------------------------------------------------------------------ passkey (PRF, omslag door de browser)
/** De DEK voor de browser om om te slaan — ALLEEN binnen een open sessie na sterke step-up (route). Hex, over TLS, nooit gelogd. */
export function dekVoorBrowser(lade: KluisLade): string {
  const dek = sleutelOpen(lade);
  if (!dek) fout(SLEUTEL_GESLOTEN_CODE, 423);
  return dek!.toString('hex');
}
export async function passkeyOmslagOpslaan(lade: KluisLade, passkeyId: string, salt: string, envelop: string, prf: boolean): Promise<void> {
  if (!(await isIngeschakeld(lade))) fout('SLEUTELKLUIS_UIT', 409);
  if (!/^[0-9a-f-]{36}$/i.test(passkeyId)) fout('SLEUTELKLUIS_PASSKEY_ONBEKEND', 404);
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(salt) || !/^omslag1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(envelop) || envelop.length > 400) fout('SLEUTELKLUIS_OMSLAG_ONGELDIG');
  await omslagSchrijven(lade, 'passkey', passkeyId, '', { salt, prf: !!prf }, envelop);
  await auditToevoegen({ ownerId: lade.userId, actorId: lade.userId, action: 'sleutelkluis.passkey_gekoppeld', type: 'beveiliging', result: 'success', details: { ruimte: ruimteOf(lade.ruimte), passkey: passkeyId.slice(0, 8) } }).catch(() => undefined);
}
export async function passkeyOmslagen(lade: KluisLade): Promise<Array<{ passkeyId: string; salt: string; envelop: string; prf: boolean; aangemaaktOp: number; laatstGebruiktOp: number }>> {
  return (await omslagen(lade, 'passkey')).map((r) => ({ passkeyId: r.houder, salt: String(r.parameters.salt || ''), envelop: r.envelop, prf: r.parameters.prf !== false, aangemaaktOp: new Date(r.aangemaakt_op).getTime(), laatstGebruiktOp: r.laatst_gebruikt_op ? new Date(r.laatst_gebruikt_op).getTime() : 0 }));
}
export async function passkeyOmslagWeg(lade: KluisLade, passkeyId: string): Promise<boolean> {
  const r = await sys().query(`DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1 AND ruimte = $2 AND soort = 'passkey' AND houder = $3`, [lade.userId, ruimteOf(lade.ruimte), passkeyId]);
  return (r.rowCount ?? 0) > 0;
}
/** De browser opende de DEK met de PRF van een passkey en stuurt hem; de server verifieert en houdt hem in het geheugen. */
export async function ontgrendelMetPasskey(lade: KluisLade, passkeyId: string, dekHex: unknown, houder: { soort: HouderSoort; id: string }): Promise<void> {
  if (!(await isIngeschakeld(lade))) fout('SLEUTELKLUIS_UIT', 409);
  const [rij] = await omslagen(lade, 'passkey', passkeyId);
  if (!rij) fout('SLEUTELKLUIS_PASSKEY_GEEN_OMSLAG', 404);
  if (!/^[0-9a-f]{64}$/i.test(String(dekHex || ''))) fout('SLEUTELKLUIS_DEK_ONGELDIG', 403);
  const dek = Buffer.from(String(dekHex), 'hex');
  await sleutelOpenen(lade, dek, houder);
  nul(dek);
  void omslagGebruikt(rij!.id);
  await auditToevoegen({ ownerId: lade.userId, actorId: lade.userId, action: 'sleutelkluis.ontgrendeld', type: 'beveiliging', result: 'success', details: { ruimte: ruimteOf(lade.ruimte), methode: 'passkey', passkey: passkeyId.slice(0, 8) } }).catch(() => undefined);
}

// ------------------------------------------------------------------------------------------------ AI-verbinding (grant)
const GRANT_DELEN = ['toegang', 'vernieuw'] as const;
type GrantDeel = typeof GRANT_DELEN[number];
async function grantLade(grantId: string): Promise<(KluisLade & { tot: number }) | null> {
  const r = await sys().query(`SELECT user_id, ruimte, refresh_expires_at FROM app.mcp_oauth_tokens WHERE id::text = $1 AND revoked_at IS NULL AND refresh_expires_at > now()`, [grantId]);
  const rij = r.rows[0];
  return rij ? { userId: String(rij.user_id), ruimte: ruimteOf(rij.ruimte), tot: new Date(rij.refresh_expires_at).getTime() } : null;
}
/**
 * Bij uitgifte van een AI-verbinding (mens aanwezig, sleutel open): twee omslagen onder het token. Staat de sleutel niet open of
 * de kluis niet aan, dan gebeurt er niets (eerlijk: de agent ziet dan «ключ закритий» bij dek1-rijen). Geeft terug of er omslagen zijn.
 */
export async function grantVerzegelen(grantId: string, tokens: { toegang: string; vernieuw: string }): Promise<boolean> {
  const lade = await grantLade(grantId);
  if (!lade || !(await isIngeschakeld(lade))) return false;
  const dek = sleutelOpen(lade);
  const p = pepper();
  if (!dek || !p) return false;
  for (const deel of GRANT_DELEN) {
    const kek = kekUitToken(tokens[deel], p);
    await omslagSchrijven(lade, 'grant', grantId, deel, { kdf: 'hkdf' }, omslaan(kek, dek, omslagAad(lade.userId, lade.ruimte, 'grant', grantId, deel)));
    nul(kek);
  }
  // De verbinding zelf houdt de sleutel open zolang zij geldig is (besluit van de eigenaar: agenten werken zonder sessie).
  await sleutelOpenen(lade, dek, { soort: 'grant', id: grantId, tot: lade.tot });
  return true;
}
/** Een agentverzoek met zijn token: omslag openen → DEK in het geheugen (houder = de verbinding, tot het refresh-token verloopt). */
export async function grantOpenen(grantId: string, deel: GrantDeel, token: string): Promise<boolean> {
  const lade = await grantLade(grantId);
  if (!lade) return false;
  if (sleutelIsOpen(lade) && houdersVan(lade).some((h) => h.soort === 'grant')) return true;
  const p = pepper();
  if (!p) return false;
  const r = await sys().query(`SELECT id::text AS id, envelop FROM app.sleutelkluis_omslag WHERE user_id = $1 AND ruimte = $2 AND soort = 'grant' AND houder = $3 AND deel = $4`, [lade.userId, lade.ruimte, grantId, deel]);
  const rij = r.rows[0] as { id: string; envelop: string } | undefined;
  if (!rij) return false;
  try {
    const kek = kekUitToken(token, p);
    const dek = omslagOpenen(kek, rij.envelop, omslagAad(lade.userId, lade.ruimte, 'grant', grantId, deel));
    nul(kek);
    await sleutelOpenen(lade, dek, { soort: 'grant', id: grantId, tot: lade.tot });
    nul(dek);
    void omslagGebruikt(rij.id);
    return true;
  } catch { return false; }
}
/** Roteren van het refresh-token: met het OUDE vernieuw-token openen en onder beide NIEUWE tokens opnieuw omslaan. */
export async function grantRoteren(grantId: string, oudVernieuw: string, nieuw: { toegang: string; vernieuw: string }): Promise<boolean> {
  const lade = await grantLade(grantId);
  if (!lade) return false;
  if (!sleutelIsOpen(lade) && !(await grantOpenen(grantId, 'vernieuw', oudVernieuw))) return false;
  const dek = sleutelOpen(lade);
  const p = pepper();
  if (!dek || !p) return false;
  for (const deel of GRANT_DELEN) {
    const kek = kekUitToken(nieuw[deel], p);
    await omslagSchrijven(lade, 'grant', grantId, deel, { kdf: 'hkdf' }, omslaan(kek, dek, omslagAad(lade.userId, lade.ruimte, 'grant', grantId, deel)));
    nul(kek);
  }
  await sleutelOpenen(lade, dek, { soort: 'grant', id: grantId, tot: lade.tot });
  return true;
}
/** Intrekken/verlopen: de houder weg uit het geheugen én de omslagen weg uit de database. */
export async function grantSluiten(grantId: string): Promise<void> {
  sleutelSluitenVoorHouder('grant', grantId);
  await sys().query(`DELETE FROM app.sleutelkluis_omslag WHERE soort = 'grant' AND houder = $1`, [grantId]).catch(() => undefined);
}
export async function grantOmslagen(lade: KluisLade): Promise<Array<{ grantId: string; aangemaaktOp: number; laatstGebruiktOp: number }>> {
  const gezien = new Map<string, { grantId: string; aangemaaktOp: number; laatstGebruiktOp: number }>();
  for (const r of await omslagen(lade, 'grant')) {
    const b = gezien.get(r.houder) || { grantId: r.houder, aangemaaktOp: new Date(r.aangemaakt_op).getTime(), laatstGebruiktOp: 0 };
    b.laatstGebruiktOp = Math.max(b.laatstGebruiktOp, r.laatst_gebruikt_op ? new Date(r.laatst_gebruikt_op).getTime() : 0);
    gezien.set(r.houder, b);
  }
  return [...gezien.values()];
}

// ------------------------------------------------------------------------------------------------ herversleutelen (oude rijen → DEK)
export type Herversleutelaar = (lade: KluisLade, dek: Buffer) => Promise<{ gevonden: number; herversleuteld: number }>;
const herversleutelaars = new Map<string, Herversleutelaar>();
/** Elke module met een gevoelige tabel meldt zich hier (bij import). De naam = de tabel in shared/sleutelkluis.ts → register. */
export function registreerHerversleutelaar(tabel: string, fn: Herversleutelaar): void { herversleutelaars.set(tabel, fn); }
export const geregistreerdeHerversleutelaars = (): string[] => [...herversleutelaars.keys()].sort();
/** «Перешифрувати мої дані зараз»: alle oude v1-rijen van deze lade onder de DEK zetten. Alleen met een open sleutel. */
export async function herversleutelen(lade: KluisLade): Promise<{ tabellen: Array<{ tabel: string; gevonden: number; herversleuteld: number; fout?: string }> }> {
  if (!(await isIngeschakeld(lade))) fout('SLEUTELKLUIS_UIT', 409);
  const dek = sleutelOpen(lade);
  if (!dek) fout(SLEUTEL_GESLOTEN_CODE, 423);
  const tabellen: Array<{ tabel: string; gevonden: number; herversleuteld: number; fout?: string }> = [];
  for (const [tabel, fn] of herversleutelaars) {
    try {
      const u = await fn(lade, dek!);
      tabellen.push({ tabel, ...u });
      if (u.herversleuteld > 0) journaalTellen(lade, tabel, 'herversleuteld', u.herversleuteld);
    } catch (e) { tabellen.push({ tabel, gevonden: 0, herversleuteld: 0, fout: String((e as Error).message || e).slice(0, 80) }); }
  }
  await sys().query('UPDATE app.sleutelkluis SET herversleuteld_op = now() WHERE user_id = $1 AND ruimte = $2', [lade.userId, ruimteOf(lade.ruimte)]);
  standCacheLeeg(lade);
  await auditToevoegen({ ownerId: lade.userId, actorId: lade.userId, action: 'sleutelkluis.herversleuteld', type: 'beveiliging', result: 'success', details: { ruimte: ruimteOf(lade.ruimte), tabellen: tabellen.map((t) => `${t.tabel}:${t.herversleuteld}/${t.gevonden}`) } }).catch(() => undefined);
  return { tabellen };
}
/** Hulp voor herversleutelaars: één v1-envelop → dek1-envelop (zelfde AAD). */
export const herversleutelEnvelop = (dek: Buffer, envelop: string, aad: string, serverSleutel: string): string =>
  isServerEnvelop(envelop) ? verzegelMetDek(dek, openWithEnvKey(serverSleutel, envelop, aad), aad) : envelop;

/** Register-controle (voor de test): elke 'dek'-regel heeft een herversleutelaar — anders is «dek» een loze belofte. */
export const registerZonderHerversleutelaar = (): string[] =>
  SLEUTELKLUIS_REGISTER.filter((r) => r.stand === 'dek' && !herversleutelaars.has(r.tabel)).map((r) => r.tabel);

/** Samenvatting voor de pagina (nooit geheimen). */
export async function overzicht(lade: KluisLade) {
  const kluis = await kluisVan(lade);
  const stand: KluisStand = !kluis ? 'uit' : sleutelIsOpen(lade) ? 'open' : 'gesloten';
  const [pk, gr, journaal] = kluis ? await Promise.all([passkeyOmslagen(lade), grantOmslagen(lade), journaalVan(lade)]) : [[], [], []];
  const herstel = kluis ? (await omslagen(lade, 'herstelcode'))[0] : undefined;
  return {
    ruimte: ruimteOf(lade.ruimte), stand, ingeschakeldOp: kluis?.ingeschakeldOp || 0, herversleuteldOp: kluis?.herversleuteldOp || 0,
    houders: houdersVan(lade),
    omslagen: {
      herstelcode: herstel ? { aangemaaktOp: new Date(herstel.aangemaakt_op).getTime(), laatstGebruiktOp: herstel.laatst_gebruikt_op ? new Date(herstel.laatst_gebruikt_op).getTime() : 0 } : null,
      passkeys: pk.map(({ envelop: _e, salt: _s, ...rest }) => rest),
      grants: gr,
    },
    journaal,
    register: SLEUTELKLUIS_REGISTER,
    pepperAanwezig: !!pepper(),
  };
}
