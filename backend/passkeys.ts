// Passkeys per gebruiker — Instellingen → «Способи входу» / «Aanmeldmethoden» (id.tarasevych.com/methods).
//
// Elke goedgekeurde gebruiker kan hier eigen passkeys registreren, hernoemen en verwijderen (verwijderen en registreren vragen
// een recente herbevestiging). Een passkey bevestigt gevoelige acties ("step-up") in plaats van een TOTP-code of opnieuw
// inloggen met Google. Inloggen zonder Google met alleen een passkey kan (nog) NIET: zie RUNBOOK-VEILIGE-UITROL.md §13.
//
// rpId: tarasevych.com (PASSKEY_RP_ID). Origins die de app accepteert: id/admin/hub (PASSKEY_ORIGINS). Root (goedkeur-hulp)
// controleert zelf opnieuw, met zijn eigen bestand /etc/mijn-ruimte/goedkeur-passkeys.json (alleen admin + id).
//
// Alleen de eigenaar ziet per passkey «Може схвалювати оновлення сервера». Aanzetten = de app legt een aanmelding in de
// goedkeur-inbox; root voegt de sleutel pas toe na `sudo mijn-ruimte-passkey toevoegen <prefix>` (eerste sleutel) of na een
// assertie van een sleutel die root al vertrouwt. Deze module beslist dus nooit zelf wie mag goedkeuren.
//
// Opslag: app.passkeys en app.passkey_uitdagingen (migratie 0023, RLS per gebruiker via alsGebruiker()).
import { createHash, randomBytes } from 'node:crypto';
import * as kern from '../deploy/goedkeuring/webauthn-kern.mjs';
import { error, isOwnerEmail, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { rateLimit } from '../server/platform/beveiliging';
import type { RouterMiddleware } from '../server/platform/router';
import { alsGebruiker } from './ai-grants';
import { meld } from './melder';
import { passkeyStapOpVastleggen, stapOpSessieId, type StapOpAuth } from './stap-op';
import { UitrolFout, aanmeldingIntrekken, aanmeldingSchrijven, leesSleutels, schakelaarAan, sleutelUitdaging, sleutelVerzoek, sshOpdracht, wachtendeAanmeldingen } from './uitrol-goedkeuring';

export const PASSKEY_LIMIETEN = { perGebruiker: 10, uitdagingMs: 5 * 60 * 1000, naam: 60 } as const;
const STANDAARD_ORIGINS = ['https://id.tarasevych.com', 'https://admin.tarasevych.com', 'https://hub.tarasevych.com'];

/** rpId en toegestane origins van de app. Origins buiten het rpId-domein (of met poort/pad) vallen altijd weg. */
export function passkeyRp(): { rpId: string; origins: string[] } {
  const rpId = String(process.env.PASSKEY_RP_ID || kern.STANDAARD_RP.rpId).trim().toLowerCase();
  const lijst = String(process.env.PASSKEY_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  const origins = (lijst.length ? lijst : STANDAARD_ORIGINS).filter((o) => kern.originHoortBijRp(o, rpId));
  return { rpId, origins };
}

/** Bekende AAGUID's → leesbare naam van de passkey-aanbieder (alleen een hint; de attestatie wordt niet gecontroleerd). */
export const AAGUID_NAMEN: Readonly<Record<string, string>> = {
  ea9b8d664d011d213ce4b6b48cb575d4: 'Google Password Manager',
  fbfc3007154e4ecc8c0b6e020557d7bd: 'iCloud Keychain',
  '08987058cadc4b81b6e130de50dcbe96': 'Windows Hello',
  '9ddd1817af5a4672a2b93e3dd95000a9': 'Windows Hello',
  '6028b017b1d44c02b4b3afcdafc96bb2': 'Windows Hello',
  adce000235bcc60a648b0b25f1f05503: 'Chrome (macOS)',
  bada5566a7aa401fbd9645619a55120d: '1Password',
  d548826e79b4db40a3d811116f7e8349: 'Bitwarden',
  '53414d53554e47000000000000000000': 'Samsung Pass',
  ee882879721c491397753dfcce97072a: 'YubiKey 5',
  cb69481e8ff7403993ec0a2729a154a8: 'YubiKey 5',
  '2fc0579f811347eab116bb5a8db9202a': 'YubiKey 5 NFC',
  fa2b99dc9e3942578f924a30d23c4118: 'YubiKey 5 NFC',
};
export const aaguidNaam = (aaguid: string) => AAGUID_NAMEN[String(aaguid || '').toLowerCase()] || '';

export class PasskeyFout extends Error { constructor(public code: string, public status = 400) { super(code); } }
function fout(code: string, status = 400): never { throw new PasskeyFout(code, status); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64U = /^[A-Za-z0-9_-]+$/;
const TRANSPORTS = new Set(['usb', 'nfc', 'ble', 'internal', 'hybrid', 'smart-card']);
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const nonceNieuw = () => randomBytes(32).toString('base64url');
/** WebAuthn user.id: niet het ruwe account-id, wel stabiel per gebruiker. */
export const gebruikerHandle = (userId: string) => createHash('sha256').update(`mijn-ruimte-gebruiker:${userId}`).digest().subarray(0, 32).toString('base64url');

async function auditeer(userId: string, action: string, result: string, details: Record<string, unknown>, service = 'identity') {
  await auditToevoegen({ ownerId: userId, actorId: userId, action, type: 'beveiliging', result, details, service }).catch(() => undefined);
}

export type PasskeyGebruiker = { id: string; email?: string; name?: string; role?: string; status?: string };
export type PasskeyAuth = StapOpAuth & { user: PasskeyGebruiker; service: string };
type Rij = { id: string; user_id: string; credential_id: string; alg: number; jwk: kern.Jwk; vingerafdruk: string; naam: string; aaguid: string; transports: string[]; backup_eligible: boolean; backup_state: boolean; sign_count: string | number; aangemaakt_op: Date; laatst_gebruikt_op: Date | null };

export const isEigenaarGebruiker = (u: PasskeyGebruiker) => u.role === 'owner' && isOwnerEmail(u.email);

async function eigenRijen(userId: string): Promise<Rij[]> {
  return alsGebruiker(userId, async (q) => (await q('SELECT * FROM app.passkeys WHERE user_id = $1 ORDER BY aangemaakt_op, id', [userId])).rows as Rij[]);
}
async function eigenRij(userId: string, id: unknown): Promise<Rij> {
  if (!UUID.test(String(id || ''))) fout('NIET_GEVONDEN', 404);
  const rij = await alsGebruiker(userId, async (q) => (await q('SELECT * FROM app.passkeys WHERE id = $1 AND user_id = $2', [String(id), userId])).rows[0] as Rij | undefined);
  if (!rij) fout('NIET_GEVONDEN', 404);
  return rij!;
}
export async function passkeyAantal(userId: string): Promise<number> {
  try { return await alsGebruiker(userId, async (q) => Number((await q('SELECT count(*)::int AS n FROM app.passkeys WHERE user_id = $1', [userId])).rows[0]?.n || 0)); }
  catch { return 0; }
}

type Goedkeuring = 'alleen-aanmelden' | 'wacht' | 'kan-goedkeuren';
function rijUit(r: Rij, goedkeuring?: { status: Goedkeuring; sshOpdracht?: string }) {
  return {
    id: String(r.id), naam: r.naam, aanbieder: aaguidNaam(r.aaguid), aaguid: r.aaguid,
    synchroniseerbaar: !!r.backup_eligible, gesynchroniseerd: !!r.backup_state, transports: r.transports || [],
    aangemaaktOp: new Date(r.aangemaakt_op).toISOString(), laatstGebruiktOp: r.laatst_gebruikt_op ? new Date(r.laatst_gebruikt_op).toISOString() : null,
    vingerafdrukKort: kern.vingerafdrukKort(r.vingerafdruk),
    ...(goedkeuring ? { goedkeuring: goedkeuring.status, ...(goedkeuring.sshOpdracht ? { sshOpdracht: goedkeuring.sshOpdracht } : {}) } : {}),
  };
}

/** Lijst voor de pagina. Alleen voor de eigenaar: per sleutel de status bij root en de stand van de root-instelling. */
export async function lijst(auth: PasskeyAuth) {
  const rijen = await eigenRijen(auth.user.id);
  const rp = passkeyRp();
  if (!isEigenaarGebruiker(auth.user)) return { rpId: rp.rpId, passkeys: rijen.map((r) => rijUit(r)), limiet: PASSKEY_LIMIETEN.perGebruiker };
  const b = await leesSleutels();
  const wacht = new Set((await wachtendeAanmeldingen()).map((w) => w.vingerafdruk));
  const inRoot = new Set(b.sleutels.map((s) => s.vingerafdruk));
  const eersteViaSsh = b.sleutels.length === 0;
  return {
    rpId: rp.rpId, limiet: PASSKEY_LIMIETEN.perGebruiker,
    passkeys: rijen.map((r) => rijUit(r, inRoot.has(r.vingerafdruk) ? { status: 'kan-goedkeuren' }
      : wacht.has(r.vingerafdruk) ? { status: 'wacht', ...(eersteViaSsh ? { sshOpdracht: sshOpdracht(r.vingerafdruk) } : {}) } : { status: 'alleen-aanmelden' })),
    goedkeuring: {
      schakelaar: await schakelaarAan(), rootRpId: b.rpId, rpKlopt: b.rpId === rp.rpId, aantalBijRoot: b.sleutels.length,
      // Sleutels die root vertrouwt maar die hier niet (meer) staan, bv. nog van admin.tarasevych.com: alleen intrekken kan.
      onbekendBijRoot: b.sleutels.filter((s) => !rijen.some((r) => r.vingerafdruk === s.vingerafdruk)).map((s) => ({ vingerafdrukKort: kern.vingerafdrukKort(s.vingerafdruk), label: s.label })),
    },
  };
}

// ------------------------------------------------------------------------------------------------ challenges
function sessieVan(auth: PasskeyAuth) {
  const sessie = stapOpSessieId(auth);
  if (!sessie) fout('SESSIE_VEREIST', 403);
  return sessie;
}
async function uitdagingMaken(auth: PasskeyAuth, doel: 'registreren' | 'stap-op') {
  const sessie = sessieVan(auth);
  const uitdaging = nonceNieuw();
  const { id } = await alsGebruiker(auth.user.id, async (q) => {
    await q('DELETE FROM app.passkey_uitdagingen WHERE user_id = $1 AND verloopt_op < now() - interval \'1 day\'', [auth.user.id]);
    return (await q(`INSERT INTO app.passkey_uitdagingen (user_id, sessie, doel, uitdaging, verloopt_op) VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5)) RETURNING id`,
      [auth.user.id, sessie, doel, uitdaging, PASSKEY_LIMIETEN.uitdagingMs / 1000])).rows[0] as { id: string };
  });
  return { uitdagingId: String(id), uitdaging };
}
/** Eenmalig (atomisch); alleen dezelfde gebruiker én dezelfde sessie. */
async function uitdagingVerbruiken(auth: PasskeyAuth, id: unknown, doel: 'registreren' | 'stap-op') {
  const sessie = sessieVan(auth);
  if (!UUID.test(String(id || ''))) fout('UITDAGING_ONGELDIG', 403);
  const rij = await alsGebruiker(auth.user.id, async (q) => (await q(`UPDATE app.passkey_uitdagingen SET gebruikt_op = now()
    WHERE id = $1 AND user_id = $2 AND sessie = $3 AND doel = $4 AND gebruikt_op IS NULL AND verloopt_op > now() RETURNING uitdaging`,
  [String(id), auth.user.id, sessie, doel])).rows[0] as { uitdaging: string } | undefined);
  if (!rij) fout('UITDAGING_ONGELDIG', 403);
  return rij!.uitdaging;
}
const b64uVeld = (v: unknown, max: number, code = 'PASSKEY_ANTWOORD_ONGELDIG') => { const t = String(v ?? ''); if (!t || t.length > max || !B64U.test(t)) fout(code); return t; };

// ------------------------------------------------------------------------------------------------ registreren
export async function registratieOpties(auth: PasskeyAuth) {
  const rijen = await eigenRijen(auth.user.id);
  if (rijen.length >= PASSKEY_LIMIETEN.perGebruiker) fout('PASSKEY_LIMIET', 409);
  const { uitdagingId, uitdaging } = await uitdagingMaken(auth, 'registreren');
  const rp = passkeyRp();
  const naam = tekst(auth.user.email || auth.user.name || 'Mijn Ruimte', 64) || 'Mijn Ruimte';
  return {
    uitdagingId,
    publicKey: {
      challenge: uitdaging,
      rp: { id: rp.rpId, name: 'Mijn Ruimte' },
      user: { id: gebruikerHandle(auth.user.id), name: naam, displayName: tekst(auth.user.name || naam, 64) || naam },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -8 }, { type: 'public-key', alg: -257 }],
      timeout: 120000, attestation: 'none',
      authenticatorSelection: { residentKey: 'preferred', requireResidentKey: false, userVerification: 'required' },
      excludeCredentials: rijen.map((r) => ({ type: 'public-key', id: r.credential_id, ...(r.transports?.length ? { transports: r.transports } : {}) })),
    },
  };
}

export async function registreren(auth: PasskeyAuth, input: Record<string, unknown>) {
  const uitdaging = await uitdagingVerbruiken(auth, input.uitdagingId, 'registreren');
  const credentialId = b64uVeld(input.credentialId, 1400);
  const clientDataJSON = b64uVeld(input.clientDataJSON, 8192);
  const attestationObject = b64uVeld(input.attestationObject, 65536);
  const rp = passkeyRp();
  const r = kern.verifieerRegistratie({ credentialId, clientDataJSON, attestationObject, verwachteUitdaging: uitdaging, rpId: rp.rpId, origins: rp.origins });
  if (!r.ok) { await auditeer(auth.user.id, 'passkey_registratie_geweigerd', 'denied', { code: r.code }, auth.service); fout(`PASSKEY_${r.code}`, 403); }
  const ok = r as Extract<typeof r, { ok: true }>;
  const aaguid = /^[0-9a-f]{32}$/.test(ok.aaguid) && !/^0{32}$/.test(ok.aaguid) ? ok.aaguid : '';
  const naam = tekst(input.naam, PASSKEY_LIMIETEN.naam) || aaguidNaam(aaguid) || 'Passkey';
  const transports = Array.isArray(input.transports) ? [...new Set(input.transports.map(String).filter((t) => TRANSPORTS.has(t)))].slice(0, 6) : [];
  const vlaggen = Number(ok.vlaggen) || 0;
  let rij: Rij | undefined;
  try {
    rij = await alsGebruiker(auth.user.id, async (q) => {
      const n = Number((await q('SELECT count(*)::int AS n FROM app.passkeys WHERE user_id = $1', [auth.user.id])).rows[0]?.n || 0);
      if (n >= PASSKEY_LIMIETEN.perGebruiker) fout('PASSKEY_LIMIET', 409);
      return (await q(`INSERT INTO app.passkeys (user_id, credential_id, alg, jwk, vingerafdruk, naam, aaguid, transports, backup_eligible, backup_state, sign_count)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [auth.user.id, ok.credentialId, ok.alg, JSON.stringify(ok.jwk), ok.vingerafdruk, naam, aaguid, transports,
        (vlaggen & kern.VLAG.BE) !== 0, (vlaggen & kern.VLAG.BS) !== 0, Math.max(0, Number(ok.signCount) || 0)])).rows[0] as Rij;
    });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') fout('PASSKEY_BESTAAT_AL', 409);
    throw err;
  }
  await auditeer(auth.user.id, 'passkey_toegevoegd', 'success', { vingerafdruk: ok.vingerafdruk.slice(0, 16), aanbieder: aaguidNaam(aaguid) }, auth.service);
  await meld(auth.user.id, 'security', 'Новий passkey / Nieuwe passkey', `«${naam}» додано до способів входу. / «${naam}» is toegevoegd aan je aanmeldmethoden.`);
  return { passkey: rijUit(rij!, isEigenaarGebruiker(auth.user) ? { status: 'alleen-aanmelden' } : undefined) };
}

export async function hernoemen(auth: PasskeyAuth, input: Record<string, unknown>) {
  const naam = tekst(input.naam, PASSKEY_LIMIETEN.naam);
  if (!naam) fout('NAAM_ONGELDIG');
  const rij = await eigenRij(auth.user.id, input.id);
  await alsGebruiker(auth.user.id, (q) => q('UPDATE app.passkeys SET naam = $3 WHERE id = $1 AND user_id = $2', [rij.id, auth.user.id, naam]));
  return { ok: true, id: rij.id, naam };
}

export async function verwijderen(auth: PasskeyAuth, input: Record<string, unknown>) {
  const rij = await eigenRij(auth.user.id, input.id);
  if (isEigenaarGebruiker(auth.user)) {
    // Eerst bij root intrekken: anders blijft een sleutel updates goedkeuren die hier niet meer zichtbaar is.
    if ((await leesSleutels()).sleutels.some((s) => s.vingerafdruk === rij.vingerafdruk)) fout('PASSKEY_KAN_GOEDKEUREN', 409);
    await aanmeldingIntrekken({ id: auth.user.id, email: auth.user.email }, rij.vingerafdruk).catch(() => undefined);
  }
  await alsGebruiker(auth.user.id, (q) => q('DELETE FROM app.passkeys WHERE id = $1 AND user_id = $2', [rij.id, auth.user.id]));
  await auditeer(auth.user.id, 'passkey_verwijderd', 'success', { vingerafdruk: rij.vingerafdruk.slice(0, 16) }, auth.service);
  await meld(auth.user.id, 'security', 'Passkey видалено / Passkey verwijderd', `«${rij.naam}» більше не є способом входу. / «${rij.naam}» is geen aanmeldmethode meer.`);
  return { ok: true, id: rij.id };
}

// ------------------------------------------------------------------------------------------------ step-up met passkey
export async function stapOpOpties(auth: PasskeyAuth) {
  const rijen = await eigenRijen(auth.user.id);
  if (!rijen.length) fout('GEEN_PASSKEY', 409);
  sessieVan(auth);
  const { uitdagingId, uitdaging } = await uitdagingMaken(auth, 'stap-op');
  return {
    uitdagingId,
    publicKey: {
      challenge: uitdaging, rpId: passkeyRp().rpId, timeout: 120000, userVerification: 'required',
      allowCredentials: rijen.map((r) => ({ type: 'public-key', id: r.credential_id, ...(r.transports?.length ? { transports: r.transports } : {}) })),
    },
  };
}

export async function stapOp(auth: PasskeyAuth, input: Record<string, unknown>) {
  const limiet = await rateLimit(`passkey-stap-op:${auth.user.id}`, 20, 600);
  if (!limiet.ok) fout('RATE_LIMITED', 429);
  const uitdaging = await uitdagingVerbruiken(auth, input.uitdagingId, 'stap-op');
  const a = (input.assertie && typeof input.assertie === 'object' ? input.assertie : {}) as Record<string, unknown>;
  const assertie: kern.Assertie = {
    credentialId: b64uVeld(a.credentialId, 1400), clientDataJSON: b64uVeld(a.clientDataJSON, 8192),
    authenticatorData: b64uVeld(a.authenticatorData, 8192), signature: b64uVeld(a.signature, 2048),
  };
  const rijen = await eigenRijen(auth.user.id);
  const rp = passkeyRp();
  const r = kern.verifieerAssertie({ assertie, verwachteUitdaging: uitdaging, rpId: rp.rpId, origins: rp.origins,
    sleutels: rijen.map((x) => ({ credentialId: x.credential_id, alg: x.alg, jwk: x.jwk, label: x.naam, vingerafdruk: x.vingerafdruk })) });
  if (!r.ok) { await auditeer(auth.user.id, 'passkey_stap_op_geweigerd', 'denied', { code: r.code }, auth.service); fout(`PASSKEY_${r.code}`, 403); }
  const ok = r as Extract<typeof r, { ok: true }>;
  const rij = rijen.find((x) => x.credential_id === ok.credentialId)!;
  if (!kern.tellerOk(Number(rij.sign_count), ok.signCount)) {
    await auditeer(auth.user.id, 'passkey_stap_op_geweigerd', 'denied', { code: 'TELLER_TERUG', vingerafdruk: rij.vingerafdruk.slice(0, 16) }, auth.service);
    fout('PASSKEY_TELLER_TERUG', 403);
  }
  await alsGebruiker(auth.user.id, (q) => q(`UPDATE app.passkeys SET sign_count = GREATEST(sign_count, $3), laatst_gebruikt_op = now(), backup_state = $4 WHERE id = $1 AND user_id = $2`,
    [rij.id, auth.user.id, Math.max(0, ok.signCount), (ok.vlaggen & kern.VLAG.BS) !== 0]));
  if (!(await passkeyStapOpVastleggen(auth))) fout('SESSIE_VEREIST', 403);
  await auditeer(auth.user.id, 'passkey_stap_op', 'success', { vingerafdruk: rij.vingerafdruk.slice(0, 16) }, auth.service);
  return { ok: true, geldigMs: 5 * 60 * 1000 };
}

// ------------------------------------------------------------------------------------------------ eigenaar: updates goedkeuren
export async function goedkeuringAanvragen(auth: PasskeyAuth, input: Record<string, unknown>) {
  const rij = await eigenRij(auth.user.id, input.id);
  const uit = await aanmeldingSchrijven({ id: auth.user.id, email: auth.user.email }, { credentialId: rij.credential_id, alg: rij.alg, jwk: rij.jwk, label: rij.naam, aaguid: rij.aaguid });
  return { ok: true, id: rij.id, status: 'wacht' as const, eerste: uit.eerste, ...(uit.eerste ? { sshOpdracht: uit.sshOpdracht } : {}) };
}
export async function goedkeuringAnnuleren(auth: PasskeyAuth, input: Record<string, unknown>) {
  const rij = await eigenRij(auth.user.id, input.id);
  await aanmeldingIntrekken({ id: auth.user.id, email: auth.user.email }, rij.vingerafdruk);
  return { ok: true, id: rij.id, status: 'alleen-aanmelden' as const };
}
/** Assertie-opties van een sleutel die root al vertrouwt, om deze passkey toe te voegen (doel sleutel-toevoegen) of in te trekken. */
export async function goedkeuringUitdaging(auth: PasskeyAuth, input: Record<string, unknown>, doel: 'sleutel-toevoegen' | 'sleutel-verwijderen') {
  const rij = await eigenRij(auth.user.id, input.id);
  return sleutelUitdaging({ id: auth.user.id, email: auth.user.email }, doel, rij.vingerafdruk);
}
export async function goedkeuringVerzoek(auth: PasskeyAuth, input: Record<string, unknown>, doel: 'sleutel-toevoegen' | 'sleutel-verwijderen') {
  const limiet = await rateLimit(`passkey-root:${auth.user.id}`, 10, 600);
  if (!limiet.ok) fout('RATE_LIMITED', 429);
  return sleutelVerzoek({ id: auth.user.id, email: auth.user.email }, doel, input);
}

// ------------------------------------------------------------------------------------------------ routes
type SessionOk = PasskeyAuth;
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type PasskeyRouteDeps = { requireSession: RequireSession; stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
/** Diensten waarop de pagina «Способи входу» draait; de eigenaarsroutes alleen op id en admin (zelfde origins als root). */
const DIENSTEN = new Set(['identity', 'admin', 'hub']);
const EIGENAAR_DIENSTEN = new Set(['identity', 'admin']);

export function passkeyRoutes(deps: PasskeyRouteDeps): Record<string, RouterMiddleware[]> {
  const route = (opts: { stepUp?: boolean; eigenaar?: boolean }, run: (auth: SessionOk, b: Record<string, unknown>) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    if (!DIENSTEN.has(auth.service)) return error('SERVICE_NOT_ALLOWED', 403);
    if (opts.eigenaar && (!isEigenaarGebruiker(auth.user) || !EIGENAAR_DIENSTEN.has(auth.service))) return error('OWNER_REQUIRED', 403);
    if (opts.stepUp) {
      if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403);
      const su = await deps.stepUp(ctx, auth);
      if (su) return su;
    }
    try { return json(await run(auth, lichaam(ctx.body))); }
    catch (err) {
      if (err instanceof PasskeyFout || err instanceof UitrolFout) return error(err.code, err.status);
      console.error('[passkeys]', (err as Error).message);
      return error('PASSKEY_FOUT', 500);
    }
  }) as RouterMiddleware;
  const P = '/api/owner/access/passkeys';
  return {
    [`POST ${P}/lijst`]: [route({}, (a) => lijst(a))],
    [`POST ${P}/registreren/opties`]: [route({ stepUp: true }, (a) => registratieOpties(a))],
    [`POST ${P}/registreren`]: [route({}, (a, b) => registreren(a, b))],
    [`POST ${P}/hernoemen`]: [route({}, (a, b) => hernoemen(a, b))],
    [`POST ${P}/verwijderen`]: [route({ stepUp: true }, (a, b) => verwijderen(a, b))],
    // Step-up met een passkey: onder /stap-op/ zodat de client bij een 403 niet opnieuw om step-up vraagt.
    'POST /api/owner/access/stap-op/passkey/opties': [route({}, (a) => stapOpOpties(a))],
    'POST /api/owner/access/stap-op/passkey': [route({}, (a, b) => stapOp(a, b))],
    // Alleen eigenaar: «Може схвалювати оновлення сервера» (root beslist).
    [`POST ${P}/goedkeuring/aanvragen`]: [route({ eigenaar: true, stepUp: true }, (a, b) => goedkeuringAanvragen(a, b))],
    [`POST ${P}/goedkeuring/annuleren`]: [route({ eigenaar: true }, (a, b) => goedkeuringAnnuleren(a, b))],
    [`POST ${P}/goedkeuring/bevestigen/opties`]: [route({ eigenaar: true }, (a, b) => goedkeuringUitdaging(a, b, 'sleutel-toevoegen'))],
    [`POST ${P}/goedkeuring/bevestigen`]: [route({ eigenaar: true }, (a, b) => goedkeuringVerzoek(a, b, 'sleutel-toevoegen'))],
    [`POST ${P}/goedkeuring/intrekken/opties`]: [route({ eigenaar: true }, (a, b) => goedkeuringUitdaging(a, b, 'sleutel-verwijderen'))],
    [`POST ${P}/goedkeuring/intrekken`]: [route({ eigenaar: true }, (a, b) => goedkeuringVerzoek(a, b, 'sleutel-verwijderen'))],
  };
}
