// Passkeys per gebruiker — Instellingen → «Способи входу» / «Aanmeldmethoden» (id.tarasevych.com/methods).
//
// Elke goedgekeurde gebruiker kan hier eigen passkeys registreren, hernoemen en verwijderen (verwijderen en registreren vragen
// een recente herbevestiging). Een passkey bevestigt gevoelige acties ("step-up") in plaats van een TOTP-code of opnieuw
// inloggen met Google. IDENTITEIT-015: aanmelden zonder Google met alleen een passkey kan nu ook — achter de vlag
// aanmelden-passkey, via backend/aanmelden-methoden.ts (discoverable credential, eenmalige uitdaging, zelfde sessie-uitgifte).
//
// rpId: tarasevych.com (PASSKEY_RP_ID). Origins die de app accepteert: id/admin/hub (PASSKEY_ORIGINS). Root (goedkeur-hulp)
// controleert zelf opnieuw, met zijn eigen bestand /etc/mijn-ruimte/goedkeur-passkeys.json (alleen admin + id).
//
// Alleen de eigenaar ziet per passkey «Може схвалювати оновлення сервера». Aanzetten = de app legt een aanmelding in de
// goedkeur-inbox; root voegt de sleutel pas toe na `sudo mijn-ruimte-passkey toevoegen <prefix>` (eerste sleutel) of na een
// assertie van een sleutel die root al vertrouwt. Deze module beslist dus nooit zelf wie mag goedkeuren.
//
// IDENTITEIT-015 (sleutels-gasten): «Довірений» per sleutel (migratie 0274, vertrouwd_op/-door/-sessie) — een eigen besluit over
// een concreet apparaat, los van «er is een sleutel»; zetten en intrekken met sterke step-up, audit en melding (vertrouwenZetten).
//
// Opslag: app.passkeys en app.passkey_uitdagingen (migratie 0023, RLS per gebruiker via alsGebruiker()).
import { createHash, randomBytes } from 'node:crypto';
import * as kern from '../deploy/goedkeuring/webauthn-kern.mjs';
import { error, isOwnerEmail, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { rateLimit } from '../server/platform/beveiliging';
import type { RouterMiddleware } from '../server/platform/router';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { alsGebruiker } from './ai-toestemmingen';
import { passkeyOmslagenWeg } from './sleutelkluis-opruimen';
import { meld } from './melder';
import { onthoudMagVoorActie, onthoudVastleggen, passkeyStapOpVastleggen, stapOpSessieId, type StapOpAuth } from './stap-op';
import { ToegangFout, gebruikVastleggen, gebruikVoor, redenVan, sessieInfo, sterkeStapOpFout, viaAppIngetrokken, wijzigingVastleggen, wijzigingenVoor, type Gebruik, type WijzigingRij } from './toegang-context';
import { aanmeldVlagVoor, laatsteWegFout } from './aanmeld-wegen';
import { UitrolFout, aanmeldingIntrekken, aanmeldingSchrijven, intrekkenLopend, leesSleutels, schakelaarAan, sleutelIntrekkenAanvragen, sleutelUitdaging, sleutelVerzoek, sshOpdracht, wachtendeAanmeldingen } from './uitrol-goedkeuring';

export const PASSKEY_LIMIETEN = { perGebruiker: 10, uitdagingMs: 5 * 60 * 1000, naam: 60 } as const;
const STANDAARD_ORIGINS = ['https://id.tarasevych.com', 'https://admin.tarasevych.com', 'https://hub.tarasevych.com'];

/** rpId en toegestane origins van de app. Origins buiten het rpId-domein (of met poort/pad) vallen altijd weg. */
export function passkeyRp(): { rpId: string; origins: string[] } {
  const rpId = String(process.env.PASSKEY_RP_ID || kern.STANDAARD_RP.rpId).trim().toLowerCase();
  const lijst = String(process.env.PASSKEY_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  const origins = (lijst.length ? lijst : STANDAARD_ORIGINS).filter((o) => kern.originHoortBijRp(o, rpId));
  return { rpId, origins };
}
/**
 * Step-up («Підтвердіть доступ») kan op elke dienst nodig zijn (bijv. toestemming voor Claude op mcp.*). De passkey zelf is
 * gebonden aan rpId tarasevych.com; als extra origin telt alleen die van de dienst van DEZE sessie (niet alle diensten).
 */
export function stapOpOrigins(service: string): string[] {
  const rp = passkeyRp();
  const host = (SERVICE_HOSTS as Record<string, string>)[service];
  const eigen = host ? `https://${host}` : '';
  return [...new Set([...rp.origins, ...(eigen && kern.originHoortBijRp(eigen, rp.rpId) ? [eigen] : [])])];
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

/** Soort passkey voor de lijst (zoals GitHub): wachtwoordbeheerder, telefoon (via QR/hybrid), beveiligingssleutel of dit apparaat. */
export type PasskeySoort = 'wachtwoordbeheerder' | 'telefoon' | 'beveiligingssleutel' | 'apparaat' | 'onbekend';
const BEHEERDERS = new Set(['Google Password Manager', 'iCloud Keychain', '1Password', 'Bitwarden', 'Samsung Pass', 'Chrome (macOS)']);
export function passkeySoort(aaguid: string, transports: string[] = [], synchroniseerbaar = false): PasskeySoort {
  const naam = aaguidNaam(aaguid);
  const t = new Set(transports);
  if (BEHEERDERS.has(naam)) return 'wachtwoordbeheerder';
  if (/^YubiKey/.test(naam)) return 'beveiligingssleutel';
  if (naam === 'Windows Hello') return 'apparaat';
  if (t.has('hybrid') && !t.has('internal')) return 'telefoon';
  if (!t.has('internal') && (t.has('usb') || t.has('nfc') || t.has('ble') || t.has('smart-card'))) return 'beveiligingssleutel';
  if (t.has('internal')) return synchroniseerbaar ? 'wachtwoordbeheerder' : 'apparaat';
  if (t.has('hybrid')) return 'telefoon';
  return 'onbekend';
}
/**
 * transports voor allowCredentials: de opgeslagen lijst plus 'hybrid', zodat de browser ook «телефон або планшет» (QR + Bluetooth)
 * aanbiedt, bv. op Windows voor een passkey die op de Android-telefoon staat. Geen opgeslagen lijst = niets beperken (veld weglaten).
 */
export const transportsVoorGet = (opgeslagen: string[] | null | undefined) => (opgeslagen?.length ? [...new Set([...opgeslagen, 'hybrid'])] : undefined);

export class PasskeyFout extends Error { constructor(public code: string, public status = 400, public retryAfter?: number) { super(code); } }
function fout(code: string, status = 400, retryAfter?: number): never { throw new PasskeyFout(code, status, retryAfter); }
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
type Rij = { id: string; user_id: string; credential_id: string; alg: number; jwk: kern.Jwk; vingerafdruk: string; naam: string; aaguid: string; transports: string[]; backup_eligible: boolean; backup_state: boolean; sign_count: string | number; aangemaakt_op: Date; laatst_gebruikt_op: Date | null;
  /** IDENTITEIT-015 (міграція 0274): довіра людини до цього ключа; старі рядки — NULL (не довірений). */
  vertrouwd_op?: Date | null; vertrouwd_wie?: string | null };

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

type Goedkeuring = 'alleen-aanmelden' | 'wacht' | 'kan-goedkeuren' | 'wordt-ingetrokken';
type Extra = { gebruik?: Gebruik[]; geschiedenis?: Geschiedenis[] };
/** Eén regel in «Історія» van een passkey: een wijziging (wie/wanneer/waarom) of een gebeurtenis bij root. */
type Geschiedenis = { soort: string; op: string; wijziging?: WijzigingRij; door?: string };
function rijUit(r: Rij, goedkeuring?: { status: Goedkeuring; sshOpdracht?: string }, extra: Extra = {}) {
  return {
    gebruik: extra.gebruik || [], ...(extra.geschiedenis ? { geschiedenis: extra.geschiedenis } : {}),
    id: String(r.id), naam: r.naam, aanbieder: aaguidNaam(r.aaguid), aaguid: r.aaguid,
    synchroniseerbaar: !!r.backup_eligible, gesynchroniseerd: !!r.backup_state, transports: r.transports || [],
    soort: passkeySoort(r.aaguid, r.transports || [], !!r.backup_eligible), viaTelefoon: (r.transports || []).includes('hybrid'),
    aangemaaktOp: new Date(r.aangemaakt_op).toISOString(), laatstGebruiktOp: r.laatst_gebruikt_op ? new Date(r.laatst_gebruikt_op).toISOString() : null,
    vingerafdrukKort: kern.vingerafdrukKort(r.vingerafdruk),
    vertrouwdOp: r.vertrouwd_op ? new Date(r.vertrouwd_op).toISOString() : null,
    ...(goedkeuring ? { goedkeuring: goedkeuring.status, ...(goedkeuring.sshOpdracht ? { sshOpdracht: goedkeuring.sshOpdracht } : {}) } : {}),
  };
}

/** Lijst voor de pagina. Alleen voor de eigenaar: per sleutel de status bij root en de stand van de root-instelling. */
export async function lijst(auth: PasskeyAuth) {
  const rijen = await eigenRijen(auth.user.id);
  const rp = passkeyRp();
  const gebruik = await gebruikVoor(auth.user.id, 'passkey', rijen.map((r) => String(r.id)));
  // IDENTITEIT-015 (sleutels-gasten): чи відкриває ключ ВХІД для цієї людини (прапорець aanmelden-passkey), чи лише підтверджує дії.
  const aanmelden = await aanmeldVlagVoor(auth.user.id, 'aanmelden-passkey');
  if (!isEigenaarGebruiker(auth.user)) return { rpId: rp.rpId, aanmelden, passkeys: rijen.map((r) => rijUit(r, undefined, { gebruik: gebruik.get(String(r.id)) })), limiet: PASSKEY_LIMIETEN.perGebruiker };
  const b = await leesSleutels();
  const wacht = new Set((await wachtendeAanmeldingen()).map((w) => w.vingerafdruk));
  const inRoot = new Map(b.sleutels.map((s) => [s.vingerafdruk, s]));
  const eersteViaSsh = b.sleutels.length === 0;
  const wijzigingen = await wijzigingenVoor(auth.user.id, { vingerafdrukken: rijen.map((r) => r.vingerafdruk) });
  const ingetrokken = new Set(wijzigingen.filter((w) => w.soort === 'goedkeur-recht-ingetrokken' || w.soort === 'goedkeur-passkey-verwijderd').map((w) => w.vingerafdruk));
  const lopend = new Set<string>();
  for (const r of rijen) if (inRoot.has(r.vingerafdruk) && await intrekkenLopend(r.vingerafdruk)) lopend.add(r.vingerafdruk);
  const geschiedenis = (r: Rij): Geschiedenis[] => {
    const uit: Geschiedenis[] = wijzigingen.filter((w) => w.vingerafdruk === r.vingerafdruk).map((w) => ({ soort: w.soort, op: w.op, wijziging: w }));
    const s = inRoot.get(r.vingerafdruk) as { toegevoegd?: string; door?: string } | undefined;
    if (s?.toegevoegd) uit.push({ soort: 'root-toegevoegd', op: String(s.toegevoegd), door: String(s.door || '') });
    return uit.sort((a, c) => Date.parse(c.op) - Date.parse(a.op));
  };
  return {
    rpId: rp.rpId, limiet: PASSKEY_LIMIETEN.perGebruiker, aanmelden,
    passkeys: rijen.map((r) => rijUit(r, lopend.has(r.vingerafdruk) ? { status: 'wordt-ingetrokken' } : inRoot.has(r.vingerafdruk) ? { status: 'kan-goedkeuren' }
      : wacht.has(r.vingerafdruk) ? { status: 'wacht', ...(eersteViaSsh || ingetrokken.has(r.vingerafdruk) ? { sshOpdracht: sshOpdracht(r.vingerafdruk) } : {}) } : { status: 'alleen-aanmelden' },
    { gebruik: gebruik.get(String(r.id)), geschiedenis: geschiedenis(r) })),
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
      // Geen authenticatorAttachment en geen hints: de browser toont zijn volledige keuze (dit apparaat, «Використовувати телефон
      // або планшет» met QR + Bluetooth, beveiligingssleutel), net als bij GitHub. hints ['client-device', …] liet Chrome op Windows
      // meteen naar Windows Hello gaan; dat willen we niet afdwingen.
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

/**
 * IDENTITEIT-015 (sleutels-gasten): «Довірений» — окреме рішення людини про КОНКРЕТНИЙ ключ (свій пристрій чи обладнання).
 * «Є ключ» = ним можна підтверджувати дії (і входити, якщо ввімкнено вхід ключем); «довіра» нових прав НЕ дає: сайт не перевіряє
 * виробника обладнання (attestation 'none'), позначка лише фіксує, хто, коли й у якому сеансі підтвердив, що ключ — його.
 * Маршрут вимагає посиленого підтвердження (ключ/код застосунку/код відновлення). Ідемпотентно: повторне натискання (або
 * перервана й повторена дія) дає той самий стан без нового запису в журналі й без нового сповіщення — UPDATE змінює рядок лише
 * тоді, коли стан справді інший, і лише в рядку цієї людини (RLS 0023 + user_id).
 */
export async function vertrouwenZetten(auth: PasskeyAuth, input: Record<string, unknown>, aan: boolean) {
  const rij = await eigenRij(auth.user.id, input.id);
  const sessie = sessieInfo(auth).sessieId.slice(0, 8);
  const door = String(auth.user.email || auth.user.id).slice(0, 200);
  const gewijzigd = await alsGebruiker(auth.user.id, async (q) => (await q(
    `UPDATE app.passkeys SET vertrouwd_op = CASE WHEN $3 THEN now() ELSE NULL END, vertrouwd_wie = CASE WHEN $3 THEN $4 ELSE NULL END,
       vertrouwd_sessie = CASE WHEN $3 THEN $5 ELSE NULL END
     WHERE id = $1 AND user_id = $2 AND (vertrouwd_op IS NULL) = $3 RETURNING vertrouwd_op`,
    [rij.id, auth.user.id, aan, door, sessie])).rows[0] as { vertrouwd_op: Date | null } | undefined);
  const nu = await eigenRij(auth.user.id, rij.id);
  if (gewijzigd) {
    await auditeer(auth.user.id, aan ? 'passkey_vertrouwd' : 'passkey_vertrouwen_ingetrokken', 'success',
      { vingerafdruk: rij.vingerafdruk.slice(0, 16), label: rij.naam, sessie }, auth.service);
    await meld(auth.user.id, aan ? 'passkey_vertrouwd' : 'passkey_vertrouwen_ingetrokken',
      aan ? `Ключ «${rij.naam}» позначено довіреним / Sleutel «${rij.naam}» als vertrouwd gemarkeerd` : `Довіру до ключа «${rij.naam}» відкликано / Vertrouwen in sleutel «${rij.naam}» ingetrokken`,
      aan
        ? `Позначив: ${door}, сеанс ${sessie}. Довіра нових прав не дає — це ваша позначка «це мій пристрій». Якщо це були не ви — відкличте довіру й видаліть ключ. / Door: ${door}, sessie ${sessie}. Vertrouwen geeft geen nieuwe rechten — het is uw label «dit is mijn apparaat». Was u het niet, trek het vertrouwen in en verwijder de sleutel.`
        : `Відкликав: ${door}, сеанс ${sessie}. Ключ і далі діє, лише без позначки «Довірений». / Door: ${door}, sessie ${sessie}. De sleutel werkt verder, alleen zonder het label «Vertrouwd».`,
      'https://id.tarasevych.com/security#aanmeldmethoden-passkeys');
  }
  return { ok: true, id: String(rij.id), vertrouwd: !!nu.vertrouwd_op, vertrouwdOp: nu.vertrouwd_op ? new Date(nu.vertrouwd_op).toISOString() : null, gewijzigd: !!gewijzigd };
}

/** Mag deze passkey updates goedkeuren (staat hij in het root-bestand)? Dan is verwijderen ook een recht intrekken (§13.10). */
export async function isGoedkeurSleutel(auth: PasskeyAuth, id: unknown): Promise<boolean> {
  if (!isEigenaarGebruiker(auth.user) || !UUID.test(String(id || ''))) return false;
  const rij = await alsGebruiker(auth.user.id, async (q) => (await q('SELECT vingerafdruk FROM app.passkeys WHERE id = $1 AND user_id = $2', [String(id), auth.user.id])).rows[0] as { vingerafdruk: string } | undefined);
  return !!rij && (await leesSleutels()).sleutels.some((s) => s.vingerafdruk === rij.vingerafdruk);
}
/** Publieke gegevens om een verwijderde passkey bij «Це був не я» terug te zetten (geen geheimen: een passkey heeft hier alleen een publieke sleutel). */
const herstelVan = (r: Rij) => ({ id: String(r.id), credentialId: r.credential_id, alg: r.alg, jwk: r.jwk, vingerafdruk: r.vingerafdruk, naam: r.naam, aaguid: r.aaguid,
  transports: r.transports || [], backupEligible: !!r.backup_eligible, backupState: !!r.backup_state, signCount: Number(r.sign_count) || 0, aangemaaktOp: new Date(r.aangemaakt_op).toISOString() });
const linkWijziging = (id: string) => `https://id.tarasevych.com/methods?wijziging=${id}`;

export async function verwijderen(auth: PasskeyAuth, input: Record<string, unknown>) {
  const rij = await eigenRij(auth.user.id, input.id);
  // IDENTITEIT-015 (aanmelden): тепер ключем доступу можна ВХОДИТИ. Останній ключ, коли він — єдиний робочий шлях входу, не прибирається
  // (той самий захист від блокування, що й для Google і пароля). Інші ключі цієї людини лишаються — тоді прибрати можна.
  let gecontroleerd = false;
  if ((await passkeyAantal(auth.user.id)) <= 1) {
    const blok = await laatsteWegFout(auth.user, 'passkey');
    if (blok) fout(blok, 409);
    gecontroleerd = true;
  }
  let wijziging = '';
  if (isEigenaarGebruiker(auth.user)) {
    // Een sleutel die updates mag goedkeuren: alleen met een reden (de route eist dan ook een sterke step-up). Root krijgt eerst
    // het intrekverzoek; anders blijft een sleutel goedkeuren die hier niet meer zichtbaar is.
    if ((await leesSleutels()).sleutels.some((s) => s.vingerafdruk === rij.vingerafdruk)) {
      if (input.reden === undefined || input.reden === null || input.reden === '') fout('PASSKEY_KAN_GOEDKEUREN', 409);
      const reden = redenUit(input.reden);
      wijziging = await wijzigingVastleggen({ userId: auth.user.id, actor: auth.user, soort: 'goedkeur-passkey-verwijderd', sleutel: String(rij.id), vingerafdruk: rij.vingerafdruk, label: rij.naam, reden, auth, herstel: herstelVan(rij) });
      await sleutelIntrekkenAanvragen({ id: auth.user.id, email: auth.user.email }, rij.vingerafdruk, { reden, sessie: sessieInfo(auth).sessieId, wijziging });
    }
    await aanmeldingIntrekken({ id: auth.user.id, email: auth.user.email }, rij.vingerafdruk).catch(() => undefined);
  }
  // IDENTITEIT-015 (herstel): підрахунок і DELETE — під одним замком на людину. Два одночасні видалення РІЗНИХ ключів раніше обидва
  // бачили «2» і обидва проходили; тепер другий бачить «1» і проходить захист від втрати останнього способу входу. / Telling + DELETE onder één slot.
  const wis = (gecontroleerdNu: boolean) => alsGebruiker(auth.user.id, async (q) => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`passkey-weg:${auth.user.id}`]);
    const n = Number((await q('SELECT count(*)::int AS n FROM app.passkeys WHERE user_id = $1', [auth.user.id])).rows[0]?.n || 0);
    if (n <= 1 && !gecontroleerdNu) return 'opnieuw' as const;
    await q('DELETE FROM app.passkeys WHERE id = $1 AND user_id = $2', [rij.id, auth.user.id]);
    return 'weg' as const;
  });
  if ((await wis(gecontroleerd)) === 'opnieuw') {
    const blok = await laatsteWegFout(auth.user, 'passkey');
    if (blok) fout(blok, 409);
    await wis(true);
  }
  // SEC-002 geheimen-05: een verwijderde passkey mag de gegevenssleutel niet meer kunnen openen — zijn omslag in beide ruimtes weg.
  await passkeyOmslagenWeg(auth.user.id, String(rij.id));
  await auditeer(auth.user.id, wijziging ? 'goedkeur_passkey_verwijderd' : 'passkey_verwijderd', 'success', { vingerafdruk: rij.vingerafdruk.slice(0, 16), label: rij.naam, ...(wijziging ? { wijziging, reden: String(input.reden || '').slice(0, 500), sessie: sessieInfo(auth).sessieId.slice(0, 8) } : {}) }, auth.service);
  if (wijziging) await meldWasDitU(auth, wijziging, rij.naam, 'verwijderd');
  else await meld(auth.user.id, 'security', 'Passkey видалено / Passkey verwijderd', `«${rij.naam}» більше не є способом входу. / «${rij.naam}» is geen aanmeldmethode meer.`);
  return { ok: true, id: rij.id, ...(wijziging ? { wijziging } : {}) };
}

const redenUit = (v: unknown) => { try { return redenVan(v); } catch (e) { return fout((e as ToegangFout).code || 'REDEN_TE_KORT', 400); } };
/** Melding in Google-stijl «Це були ви?» met een link naar de wijziging en de knop «Це був не я». */
async function meldWasDitU(auth: PasskeyAuth, wijziging: string, naam: string, wat: 'ingetrokken' | 'verwijderd') {
  const s = sessieInfo(auth);
  const tijd = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  await meld(auth.user.id, 'security_warning',
    wat === 'verwijderd' ? 'Це були ви? Passkey для схвалення оновлень видалено / Was u dit? Goedkeur-passkey verwijderd' : 'Це були ви? Право схвалювати оновлення відкликано / Was u dit? Recht om updates goed te keuren ingetrokken',
    `«${naam}» · ${tijd} · сесія ${s.sessieId.slice(0, 8)}. Якщо це були не ви — відкрийте зміну й натисніть «Це був не я». / «${naam}» · ${tijd} · sessie ${s.sessieId.slice(0, 8)}. Was u dit niet? Open de wijziging en kies «Dit was ik niet».`,
    linkWijziging(wijziging));
}

/**
 * Recht «Може схвалювати оновлення» intrekken (§13.10). Alleen de eigenaar, met een reden (≥ 10 tekens) en een sterke step-up
 * (passkey, TOTP of herstelcode; Google alleen telt niet als er iets sterkers is) — dat eist de route. Root krijgt een verzoek
 * zonder assertie (intrekken is de veilige richting) en laat dezelfde sleutel daarna alleen nog via SSH terug toe.
 */
export async function rechtIntrekken(auth: PasskeyAuth, input: Record<string, unknown>) {
  const reden = redenUit(input.reden);
  const rij = await eigenRij(auth.user.id, input.id);
  if (!(await leesSleutels()).sleutels.some((s) => s.vingerafdruk === rij.vingerafdruk)) fout('NIET_GEVONDEN', 404);
  if (await intrekkenLopend(rij.vingerafdruk)) fout('INTREKKEN_LOOPT_AL', 409);
  const wijziging = await wijzigingVastleggen({ userId: auth.user.id, actor: auth.user, soort: 'goedkeur-recht-ingetrokken', sleutel: String(rij.id), vingerafdruk: rij.vingerafdruk, label: rij.naam, reden, auth });
  await sleutelIntrekkenAanvragen({ id: auth.user.id, email: auth.user.email }, rij.vingerafdruk, { reden, sessie: sessieInfo(auth).sessieId, wijziging });
  await auditeer(auth.user.id, 'goedkeur_recht_ingetrokken', 'success', { vingerafdruk: rij.vingerafdruk.slice(0, 16), label: rij.naam, reden, wijziging, sessie: sessieInfo(auth).sessieId.slice(0, 8) }, auth.service);
  await meldWasDitU(auth, wijziging, rij.naam, 'ingetrokken');
  return { ok: true, id: rij.id, status: 'wordt-ingetrokken' as const, wijziging };
}

/** «Це був не я»: een verwijderde passkey terugzetten uit de bewaarde publieke gegevens (alleen als hij er nog niet is). */
export async function passkeyHerstellen(userId: string, h: Record<string, unknown>): Promise<boolean> {
  const id = String(h.id || '');
  if (!UUID.test(id) || !/^[0-9a-f]{64}$/.test(String(h.vingerafdruk || ''))) return false;
  try {
    return await alsGebruiker(userId, async (q) => {
      const r = await q(`INSERT INTO app.passkeys (id, user_id, credential_id, alg, jwk, vingerafdruk, naam, aaguid, transports, backup_eligible, backup_state, sign_count, aangemaakt_op)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT DO NOTHING RETURNING id`,
      [id, userId, String(h.credentialId), Number(h.alg), JSON.stringify(h.jwk), String(h.vingerafdruk), String(h.naam || 'Passkey').slice(0, 60), String(h.aaguid || ''),
        Array.isArray(h.transports) ? h.transports.map(String).filter((t) => TRANSPORTS.has(t)) : [], !!h.backupEligible, !!h.backupState, Math.max(0, Number(h.signCount) || 0), String(h.aangemaaktOp || new Date().toISOString())]);
      return (r.rowCount || 0) > 0;
    });
  } catch (err) { console.error('[passkeys] herstellen mislukt:', (err as Error).message); return false; }
}
/** Rij voor een aanmelding bij root (opnieuw aanvragen na «Це був не я»). */
export async function rijVoorAanmelding(userId: string, id: string) { return eigenRij(userId, id); }

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
      allowCredentials: rijen.map((r) => { const t = transportsVoorGet(r.transports); return { type: 'public-key', id: r.credential_id, ...(t ? { transports: t } : {}) }; }),
    },
  };
}

export async function stapOp(auth: PasskeyAuth, input: Record<string, unknown>) {
  const limiet = await rateLimit(`passkey-stap-op:${auth.user.id}`, 20, 600);
  if (!limiet.ok) fout('RATE_LIMITED', 429, limiet.retryAfter);
  const uitdaging = await uitdagingVerbruiken(auth, input.uitdagingId, 'stap-op');
  const a = (input.assertie && typeof input.assertie === 'object' ? input.assertie : {}) as Record<string, unknown>;
  const assertie: kern.Assertie = {
    credentialId: b64uVeld(a.credentialId, 1400), clientDataJSON: b64uVeld(a.clientDataJSON, 8192),
    authenticatorData: b64uVeld(a.authenticatorData, 8192), signature: b64uVeld(a.signature, 2048),
  };
  const rijen = await eigenRijen(auth.user.id);
  const rp = passkeyRp();
  const r = kern.verifieerAssertie({ assertie, verwachteUitdaging: uitdaging, rpId: rp.rpId, origins: stapOpOrigins(auth.service),
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
  // «Запам'ятати цей браузер»: alleen als de gebruiker het aanvinkte EN deze actie onthouden mag (NOOIT_ONTHOUDEN).
  const onthoudTot = input.onthoud === true && onthoudMagVoorActie(input.actie) ? await onthoudVastleggen(auth as unknown as StapOpAuth).catch(() => 0) : 0;
  await auditeer(auth.user.id, 'passkey_stap_op', 'success', { vingerafdruk: rij.vingerafdruk.slice(0, 16), onthouden: onthoudTot > 0 }, auth.service);
  // Waarvoor (label uit de vaste lijst; onbekend → 'onbekend'), waar (dienst van de sessie), apparaat en IP-hash.
  await gebruikVastleggen(auth.user.id, 'passkey', String(rij.id), input.actie, { dienst: auth.service });
  return { ok: true, geldigMs: 5 * 60 * 1000, onthouden: onthoudTot > 0, onthoudTot };
}

// ------------------------------------------------------------------------------------------------ eigenaar: updates goedkeuren
export async function goedkeuringAanvragen(auth: PasskeyAuth, input: Record<string, unknown>) {
  const rij = await eigenRij(auth.user.id, input.id);
  const uit = await aanmeldingSchrijven({ id: auth.user.id, email: auth.user.email }, { credentialId: rij.credential_id, alg: rij.alg, jwk: rij.jwk, label: rij.naam, aaguid: rij.aaguid });
  await wijzigingVastleggen({ userId: auth.user.id, actor: auth.user, soort: 'goedkeur-recht-aangevraagd', sleutel: String(rij.id), vingerafdruk: rij.vingerafdruk, label: rij.naam, auth }).catch(() => '');
  // Eerder via de app ingetrokken: root neemt hem alleen nog via SSH terug.
  const viaSsh = uit.eerste || (await viaAppIngetrokken(auth.user.id)).has(rij.vingerafdruk);
  return { ok: true, id: rij.id, status: 'wacht' as const, eerste: uit.eerste, viaSsh, ...(viaSsh ? { sshOpdracht: uit.sshOpdracht } : {}) };
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
  if (!limiet.ok) fout('RATE_LIMITED', 429, limiet.retryAfter);
  return sleutelVerzoek({ id: auth.user.id, email: auth.user.email }, doel, input);
}

// ------------------------------------------------------------------------------------------------ routes
type SessionOk = PasskeyAuth;
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type PasskeyRouteDeps = { requireSession: RequireSession; stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null>; sterkeStapOp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };
/** Standaard sterke step-up (STEP_UP_STRONG_REQUIRED als er een passkey/TOTP/herstelcode is). */
export const sterkeStapOpStandaard = async (_ctx: unknown, auth: SessionOk): Promise<Resp | null> => { const f = await sterkeStapOpFout(auth); return f ? error(f, 403) : null; };
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
/** Diensten waarop de pagina «Способи входу» draait; de eigenaarsroutes alleen op id en admin (zelfde origins als root). */
const DIENSTEN = new Set(['identity', 'admin', 'hub']);
const EIGENAAR_DIENSTEN = new Set(['identity', 'admin']);

export function passkeyRoutes(deps: PasskeyRouteDeps): Record<string, RouterMiddleware[]> {
  const route = (opts: { stepUp?: boolean; eigenaar?: boolean; reden?: boolean; elkeDienst?: boolean; sterkAls?: (auth: SessionOk, b: Record<string, unknown>) => Promise<boolean> }, run: (auth: SessionOk, b: Record<string, unknown>) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    if (!opts.elkeDienst && !DIENSTEN.has(auth.service)) return error('SERVICE_NOT_ALLOWED', 403);
    if (opts.eigenaar && (!isEigenaarGebruiker(auth.user) || !EIGENAAR_DIENSTEN.has(auth.service))) return error('OWNER_REQUIRED', 403);
    // Eerst de reden (geen bevestigingsvenster voor een verzoek dat toch geweigerd wordt).
    if (opts.reden) { try { redenVan(lichaam(ctx.body).reden); } catch (e) { return error((e as ToegangFout).code || 'REDEN_TE_KORT', 400); } }
    // Sterke step-up (rechten intrekken): passkey/TOTP/herstelcode; Google alleen telt niet als er iets sterkers is.
    let sterk = false;
    try { sterk = !!opts.sterkAls && await opts.sterkAls(auth, lichaam(ctx.body)); } catch { sterk = false; }
    if (sterk) {
      const su = await (deps.sterkeStapOp || sterkeStapOpStandaard)(ctx, auth);
      if (su) return su;
    } else if (opts.stepUp) {
      if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403);
      const su = await deps.stepUp(ctx, auth);
      if (su) return su;
    }
    try { return json(await run(auth, lichaam(ctx.body))); }
    catch (err) {
      if (err instanceof PasskeyFout || err instanceof ToegangFout) return error(err.code, err.status, err.retryAfter ? { retryAfter: err.retryAfter } : undefined);
      if (err instanceof UitrolFout) return error(err.code, err.status);
      console.error('[passkeys]', (err as Error).message);
      return error('PASSKEY_FOUT', 500);
    }
  }) as RouterMiddleware;
  const P = '/api/owner/access/passkeys';
  return {
    [`POST ${P}/lijst`]: [route({}, (a) => lijst(a))],
    [`POST ${P}/registreren/opties`]: [route({ stepUp: true }, (a) => registratieOpties(a))],
    [`POST ${P}/registreren`]: [route({}, (a, b) => registreren(a, b))],
    // IDENTITEIT-012: перейменування теж із підтвердженням доступу — назва допомагає впізнати чужий ключ, її не можна тихо змінити.
    [`POST ${P}/hernoemen`]: [route({ stepUp: true }, (a, b) => hernoemen(a, b))],
    // IDENTITEIT-015 (sleutels-gasten): довіра до ключа — дати й відкликати лише з посиленим підтвердженням (Google сам не годиться).
    [`POST ${P}/vertrouwen`]: [route({ sterkAls: async () => true }, (a, b) => vertrouwenZetten(a, b, true))],
    [`POST ${P}/vertrouwen-intrekken`]: [route({ sterkAls: async () => true }, (a, b) => vertrouwenZetten(a, b, false))],
    // Een goedkeur-passkey verwijderen = een recht intrekken: met reden (anders PASSKEY_KAN_GOEDKEUREN) en sterke step-up.
    [`POST ${P}/verwijderen`]: [route({ stepUp: true, sterkAls: async (a, b) => !!b.reden && await isGoedkeurSleutel(a, b.id) }, (a, b) => verwijderen(a, b))],
    // Step-up met een passkey: onder /stap-op/ zodat de client bij een 403 niet opnieuw om step-up vraagt.
    // Op elke dienst: het venster verschijnt waar de beveiligde actie gebeurt (mcp, api, mail …), niet alleen op id/admin/hub.
    'POST /api/owner/access/stap-op/passkey/opties': [route({ elkeDienst: true }, (a) => stapOpOpties(a))],
    'POST /api/owner/access/stap-op/passkey': [route({ elkeDienst: true }, (a, b) => stapOp(a, b))],
    // Alleen eigenaar: «Може схвалювати оновлення сервера» (root beslist).
    [`POST ${P}/goedkeuring/aanvragen`]: [route({ eigenaar: true, stepUp: true }, (a, b) => goedkeuringAanvragen(a, b))],
    [`POST ${P}/goedkeuring/annuleren`]: [route({ eigenaar: true }, (a, b) => goedkeuringAnnuleren(a, b))],
    [`POST ${P}/goedkeuring/bevestigen/opties`]: [route({ eigenaar: true }, (a, b) => goedkeuringUitdaging(a, b, 'sleutel-toevoegen'))],
    [`POST ${P}/goedkeuring/bevestigen`]: [route({ eigenaar: true }, (a, b) => goedkeuringVerzoek(a, b, 'sleutel-toevoegen'))],
    // Intrekken: met reden + sterke step-up, zonder assertie van een root-sleutel (afnemen is de veilige richting; §13.10).
    [`POST ${P}/goedkeuring/recht-intrekken`]: [route({ eigenaar: true, reden: true, sterkAls: async () => true }, (a, b) => rechtIntrekken(a, b))],
  };
}
