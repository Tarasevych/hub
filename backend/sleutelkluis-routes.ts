// Routes van de sleutelkluis — Instellingen → «Способи входу» → «Шифрування моїх даних» (id.*), maar bruikbaar op elke dienst:
// het ontgrendelvenster hoort te verschijnen waar de mens zijn gegevens nodig heeft (mail, cloud, hub).
//
// De RUIMTE komt NOOIT uit het verzoek: gegevensRuimteVeilig() leest rol, profiel en lopende activering uit de database (zelfde
// poort als post, hmara, agenda). Een technisch profiel krijgt dus uitsluitend de TECHNISCHE sleutel te zien, te openen en
// om te slaan — de persoonlijke staat erbuiten. De HOUDER van een geopende sleutel is de sessie (tab-overlay of anker), zodat
// uitloggen hem sluit (lui gecontroleerd in backend/sleutelkluis.ts, plus de expliciete aanroep in de uitlogroute).
//
// Passkey + PRF: de server geeft assertie-opties mét de PRF-salt per omslag en (bij koppelen, na sterke step-up en met open
// sleutel) de DEK zelf; de browser doet navigator.credentials.get({ extensions: { prf } }), rekent de KEK en slaat om of opent.
// De server controleert de WebAuthn-assertie (zelfde kern als step-up: rpId, origin, UV, teller) en bij ontgrendelen de DEK
// tegen `controle`. Een passkey zonder PRF: eerlijke melding (KLUIS_TEKST.geenPrf) en de weg via de herstelcode.
import { randomBytes } from 'node:crypto';
import * as kern from '../deploy/goedkeuring/webauthn-kern.mjs';
import { error, json } from '../server/platform';
import { rateLimit } from '../server/platform/beveiliging';
import { auditToevoegen } from '../server/platform/audit';
import type { RouterMiddleware } from '../server/platform/router';
import { alsGebruiker } from './ai-toestemmingen';
import { PASSKEY_LIMIETEN, stapOpOrigins, passkeyRp, transportsVoorGet } from './toegangssleutels';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import { stapOpSessieId, stapOpVerbruiken, type StapOpAuth } from './stap-op';
import { KEK_INFO, KLUIS_TEKST, omslagAad } from '../shared/sleutelkluis';
import {
  SleutelkluisFout, dekVoorBrowser, herversleutelen, inschakelen, ontgrendelMetPasskey,
  overzicht, passkeyOmslagOpslaan, passkeyOmslagWeg, passkeyOmslagen, sleutelSluitenVoorHouder, type KluisLade,
} from './sleutelkluis';
import {
  herstelcodeBevestigen, herstelcodeVernieuwenVeilig, herstelcodeWacht, kluisZonderOmslag, ontgrendelMetHerstelcodeVeilig, weesKluisHerstellen,
} from './sleutelkluis-herstel';
import { magEigenToegang } from '../shared/eigen-toegang'; // IDENTITEIT-012

type Gebruiker = { id: string; email?: string; name?: string; role?: string; status?: string };
type Auth = StapOpAuth & { user: Gebruiker; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<Auth | { errorCode: string }>;
type Resp = ReturnType<typeof json>;
export type SleutelkluisRouteDeps = {
  requireSession: RequireSession; sterkeStapOp: (ctx: unknown, auth: Auth) => Promise<Resp | null>;
  /** SEC-002 (g06): «sterke bevestiging controleren en verbruiken» als één ondeelbare stap rond de actie (backend/index.ts geeft
   *  metStapOpEenmalig met sterkeStapOpGeldig). Zonder (tests met een eigen sterkeStapOp): actie en daarna verbruiken, zoals vroeger. */
  stapOpEenmalig?: <T>(auth: Auth, actie: () => Promise<T>) => Promise<{ ok: true; uit: T } | { ok: false }>;
};
type Ctx = { event: Record<string, unknown>; body: unknown };
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64U = /^[A-Za-z0-9_-]+$/;

type Rij = { id: string; credential_id: string; alg: number; jwk: kern.Jwk; vingerafdruk: string; naam: string; transports: string[]; sign_count: string | number };
const eigenPasskeys = (userId: string) => alsGebruiker(userId, async (q) => (await q('SELECT id, credential_id, alg, jwk, vingerafdruk, naam, transports, sign_count FROM app.passkeys WHERE user_id = $1 ORDER BY aangemaakt_op, id', [userId])).rows as Rij[]);

async function uitdagingMaken(auth: Auth): Promise<{ uitdagingId: string; uitdaging: string }> {
  const sessie = stapOpSessieId(auth);
  if (!sessie) throw new SleutelkluisFout('SESSIE_VEREIST', 403);
  const uitdaging = randomBytes(32).toString('base64url');
  const { id } = await alsGebruiker(auth.user.id, async (q) => (await q(
    `INSERT INTO app.passkey_uitdagingen (user_id, sessie, doel, uitdaging, verloopt_op) VALUES ($1, $2, 'sleutelkluis', $3, now() + make_interval(secs => $4)) RETURNING id`,
    [auth.user.id, sessie, uitdaging, PASSKEY_LIMIETEN.uitdagingMs / 1000])).rows[0] as { id: string });
  return { uitdagingId: String(id), uitdaging };
}
async function uitdagingVerbruiken(auth: Auth, id: unknown): Promise<string> {
  const sessie = stapOpSessieId(auth);
  if (!sessie || !UUID.test(String(id || ''))) throw new SleutelkluisFout('UITDAGING_ONGELDIG', 403);
  const rij = await alsGebruiker(auth.user.id, async (q) => (await q(
    `UPDATE app.passkey_uitdagingen SET gebruikt_op = now() WHERE id = $1 AND user_id = $2 AND sessie = $3 AND doel = 'sleutelkluis' AND gebruikt_op IS NULL AND verloopt_op > now() RETURNING uitdaging`,
    [String(id), auth.user.id, sessie])).rows[0] as { uitdaging: string } | undefined);
  if (!rij) throw new SleutelkluisFout('UITDAGING_ONGELDIG', 403);
  return rij.uitdaging;
}
/** Assertie controleren (zelfde kern en dezelfde origins als step-up) en de rij van de gebruikte passkey teruggeven. */
async function assertieControleren(auth: Auth, input: Record<string, unknown>): Promise<Rij> {
  const uitdaging = await uitdagingVerbruiken(auth, input.uitdagingId);
  const a = (input.assertie && typeof input.assertie === 'object' ? input.assertie : {}) as Record<string, unknown>;
  const veld = (v: unknown, max: number) => { const t = String(v ?? ''); if (!t || t.length > max || !B64U.test(t)) throw new SleutelkluisFout('PASSKEY_ANTWOORD_ONGELDIG'); return t; };
  const assertie: kern.Assertie = { credentialId: veld(a.credentialId, 1400), clientDataJSON: veld(a.clientDataJSON, 8192), authenticatorData: veld(a.authenticatorData, 8192), signature: veld(a.signature, 2048) };
  const rijen = await eigenPasskeys(auth.user.id);
  const r = kern.verifieerAssertie({ assertie, verwachteUitdaging: uitdaging, rpId: passkeyRp().rpId, origins: stapOpOrigins(auth.service),
    sleutels: rijen.map((x) => ({ credentialId: x.credential_id, alg: x.alg, jwk: x.jwk, label: x.naam, vingerafdruk: x.vingerafdruk })) });
  if (!r.ok) throw new SleutelkluisFout(`PASSKEY_${r.code}`, 403);
  const ok = r as Extract<typeof r, { ok: true }>;
  const rij = rijen.find((x) => x.credential_id === ok.credentialId)!;
  if (!kern.tellerOk(Number(rij.sign_count), ok.signCount)) throw new SleutelkluisFout('PASSKEY_TELLER_TERUG', 403);
  await alsGebruiker(auth.user.id, (q) => q('UPDATE app.passkeys SET sign_count = GREATEST(sign_count, $3), laatst_gebruikt_op = now() WHERE id = $1 AND user_id = $2', [rij.id, auth.user.id, Math.max(0, ok.signCount)]));
  return rij;
}
/** Opties voor navigator.credentials.get met de PRF-extensie: per passkey haar salt (nieuw bij koppelen). */
const prfOpties = (rijen: Rij[], salts: Map<string, string>, uitdaging: string) => ({
  challenge: uitdaging, rpId: passkeyRp().rpId, timeout: 120000, userVerification: 'required',
  allowCredentials: rijen.map((r) => { const t = transportsVoorGet(r.transports); return { type: 'public-key', id: r.credential_id, ...(t ? { transports: t } : {}) }; }),
  extensions: { prf: { evalByCredential: Object.fromEntries(rijen.filter((r) => salts.has(String(r.id))).map((r) => [r.credential_id, { first: salts.get(String(r.id)) }])) } },
});

export function sleutelkluisRoutes(deps: SleutelkluisRouteDeps): Record<string, RouterMiddleware[]> {
  const route = (opts: { sterk?: boolean }, run: (auth: Auth, lade: KluisLade, b: Record<string, unknown>) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!magEigenToegang(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403); // IDENTITEIT-012: спільна умова
    if (opts.sterk) { const su = await deps.sterkeStapOp(ctx, auth); if (su) return su; }
    const b = lichaam(ctx.body);
    const ruimte = await gegevensRuimteVeilig(auth.user.id, { tabContext: typeof b.tabContext === 'string' ? b.tabContext : null });
    try { return json(await run(auth, { userId: auth.user.id, ruimte }, b)); }
    catch (err) {
      if (err instanceof SleutelkluisFout) return error(err.code, err.status);
      // SEC-002 (geheimen-02): de rij van de sleutelafleiding is vol — eerlijk «te druk», geen 500.
      if ((err as { code?: string } | null)?.code === 'SLEUTELKLUIS_BEZET') return error('SLEUTELKLUIS_BEZET', 429);
      console.error('[sleutelkluis]', (err as Error).message);
      return error('SLEUTELKLUIS_FOUT', 500);
    }
  }) as RouterMiddleware;
  const houder = (auth: Auth) => { const id = stapOpSessieId(auth); if (!id) throw new SleutelkluisFout('SESSIE_VEREIST', 403); return { soort: 'sessie' as const, id }; };
  // SEC-002 (geheimen-02): elke actie die een zware sleutelafleiding (scrypt, 64 MiB) of veel schrijfwerk start, heeft een eigen
  // grens PER MENS. De algemene grens per IP (600/min) was hier de enige rem; daarmee was de hele site stil te leggen.
  const begrens = async (a: Auth, naam: string, aantal: number, seconden: number) => {
    const limiet = await rateLimit(`sleutelkluis-${naam}:${a.user.id}`, aantal, seconden, { failClosed: true });
    if (!limiet.ok) {
      // toets-g10b #7: de eerste weigering in het venster komt in het auditlogboek (één regel per venster, geen vloed).
      if (limiet.hits === limiet.limit + 1) await auditToevoegen({ ownerId: a.user.id, actorId: a.user.id, action: 'sleutelkluis.te_vaak', type: 'beveiliging', result: 'denied', details: { actie: naam, limiet: aantal, seconden } }).catch(() => undefined);
      throw new SleutelkluisFout('SLEUTELKLUIS_TE_VAAK', 429);
    }
  };
  // Eén sterke bevestiging = één gevoelige actie (zoals de kluis van geheimen): de volgende vraagt opnieuw passkey of code.
  const verbruik = (a: Auth) => stapOpVerbruiken(a).catch((e) => console.error('[sleutelkluis] bevestiging verbruiken mislukt:', (e as Error).message));
  const eenmalig = async <T,>(a: Auth, actie: () => Promise<T>): Promise<T> => {
    if (!deps.stapOpEenmalig) { const uit = await actie(); await verbruik(a); return uit; }
    const stap = await deps.stapOpEenmalig(a, actie);
    if (!stap.ok) throw new SleutelkluisFout('STEP_UP_STRONG_REQUIRED', 403);
    return stap.uit;
  };
  const P = '/api/owner/sleutelkluis';
  return {
    [`POST ${P}/stand`]: [route({}, async (a, lade) => {
      const o = await overzicht(lade);
      const rijen = await eigenPasskeys(a.user.id);
      // Per passkey van de mens: naam en of hij al een omslag van DEZE ruimte heeft (zo ziet de pagina wat nog te koppelen is).
      const passkeys = rijen.map((r) => ({ id: String(r.id), naam: r.naam, gekoppeld: o.omslagen.passkeys.some((p) => p.passkeyId === String(r.id)) }));
      // SEC-002 (geheimen-04): wacht er een nieuwe herstelcode op bevestiging, en is dit een kluis zonder één omslag?
      const aan = o.stand !== 'uit';
      return { ...o, passkeys, teksten: KLUIS_TEKST, herstelcodeWacht: aan ? await herstelcodeWacht(lade) : false, zonderOmslag: aan ? await kluisZonderOmslag(lade) : false };
    })],
    // Inschakelen: sterke step-up (passkey/TOTP/herstelcode). De herstelcode komt EENMALIG terug; de sleutel staat meteen open.
    [`POST ${P}/inschakelen`]: [route({ sterk: true }, async (a, lade) => {
      await begrens(a, 'aan', 5, 3600);
      // De bevestiging blijft hier staan: direct na het inschakelen hoort de mens zijn passkey als sleutel te kunnen koppelen.
      return { ok: true, ...(await inschakelen(lade, houder(a))), eenmalig: true };
    })],
    [`POST ${P}/herstelcode/vernieuwen`]: [route({ sterk: true }, async (a, lade) => {
      await begrens(a, 'herstel-nieuw', 3, 3600);
      const uit = await eenmalig(a, () => herstelcodeVernieuwenVeilig(lade));
      return { ok: true, ...uit, eenmalig: true };
    })],
    [`POST ${P}/ontgrendelen/herstelcode`]: [route({}, async (a, lade, b) => {
      const limiet = await rateLimit(`sleutelkluis-herstel:${a.user.id}`, 10, 600, { failClosed: true });
      if (!limiet.ok) throw new SleutelkluisFout('SLEUTELKLUIS_HERSTELCODE_GEBLOKKEERD', 429);
      const uit = await ontgrendelMetHerstelcodeVeilig(lade, b.code, houder(a));
      // SEC-002 (geheimen-04): de nieuwe code komt EENMALIG mee; de gebruikte blijft geldig tot de mens bevestigt dat hij de
      // nieuwe bewaard heeft (herstelcode/bevestigen) of de nieuwe zelf gebruikt. Een verloren antwoord sluit zo niets af.
      return { ok: true, stand: 'open', ...uit, eenmalig: true };
    })],
    [`POST ${P}/herstelcode/bevestigen`]: [route({}, async (a, lade) => {
      await begrens(a, 'herstel-bevestig', 20, 600);
      return { ok: true, ...(await herstelcodeBevestigen(lade)) };
    })],
    // Kluis zonder één omslag (kon ontstaan door het vroegere inschakelen in twee stappen): terug naar «uit», zonder verlies.
    [`POST ${P}/herstellen`]: [route({ sterk: true }, async (a, lade) => {
      await begrens(a, 'herstellen', 5, 3600);
      const uit = await eenmalig(a, () => weesKluisHerstellen(lade));
      return { ok: true, ...uit };
    })],
    [`POST ${P}/vergrendelen`]: [route({}, async (a) => ({ ok: true, gesloten: sleutelSluitenVoorHouder('sessie', houder(a).id) }))],
    // Passkey koppelen: opties (+ de DEK om om te slaan, alleen hier en alleen na sterke step-up met open sleutel), dan opslaan.
    [`POST ${P}/passkey/koppelen/opties`]: [route({ sterk: true }, async (a, lade) => {
      // SEC-002 (geheimen-07): dit antwoord bevat de gegevenssleutel zelf. Daarom begrensd per mens: een gekaapte sessie
      // haalt de sleutel binnen de vijf minuten van de sterke bevestiging niet onbeperkt vaak op.
      await begrens(a, 'dek-uitgifte', 10, 3600);
      const rijen = await eigenPasskeys(a.user.id);
      if (!rijen.length) throw new SleutelkluisFout('GEEN_PASSKEY', 409);
      const dek = dekVoorBrowser(lade);
      const { uitdagingId, uitdaging } = await uitdagingMaken(a);
      const salts = new Map(rijen.map((r) => [String(r.id), randomBytes(32).toString('base64url')]));
      return { uitdagingId, dek, kekInfo: KEK_INFO, passkeys: rijen.map((r) => ({ id: String(r.id), credentialId: r.credential_id, naam: r.naam, salt: salts.get(String(r.id)), aad: omslagAad(lade.userId, lade.ruimte, 'passkey', String(r.id)) })), publicKey: prfOpties(rijen, salts, uitdaging) };
    })],
    [`POST ${P}/passkey/koppelen`]: [route({}, async (a, lade, b) => {
      const rij = await assertieControleren(a, b);
      if (b.prfOndersteund === false) return { ok: false, prf: false, uitleg: KLUIS_TEKST.geenPrf, passkeyId: String(rij.id) };
      await passkeyOmslagOpslaan(lade, String(rij.id), String(b.salt || ''), String(b.envelop || ''), true);
      return { ok: true, prf: true, passkeyId: String(rij.id) };
    })],
    [`POST ${P}/passkey/ontkoppelen`]: [route({ sterk: true }, async (_a, lade, b) => ({ ok: await passkeyOmslagWeg(lade, String(b.passkeyId || '')) }))],
    // Ontgrendelen: opties met per gekoppelde passkey haar salt én omslag; de browser opent en stuurt de DEK terug.
    [`POST ${P}/passkey/ontgrendelen/opties`]: [route({}, async (a, lade) => {
      const omslagen = await passkeyOmslagen(lade);
      if (!omslagen.length) throw new SleutelkluisFout('SLEUTELKLUIS_PASSKEY_GEEN_OMSLAG', 404);
      const alle = await eigenPasskeys(a.user.id);
      const rijen = alle.filter((r) => omslagen.some((o) => o.passkeyId === String(r.id)));
      if (!rijen.length) throw new SleutelkluisFout('SLEUTELKLUIS_PASSKEY_GEEN_OMSLAG', 404);
      const { uitdagingId, uitdaging } = await uitdagingMaken(a);
      const salts = new Map(omslagen.map((o) => [o.passkeyId, o.salt]));
      return { uitdagingId, kekInfo: KEK_INFO, omslagen: omslagen.map((o) => ({ passkeyId: o.passkeyId, credentialId: rijen.find((r) => String(r.id) === o.passkeyId)?.credential_id || '', salt: o.salt, envelop: o.envelop, aad: omslagAad(lade.userId, lade.ruimte, 'passkey', o.passkeyId) })), publicKey: prfOpties(rijen, salts, uitdaging) };
    })],
    [`POST ${P}/passkey/ontgrendelen`]: [route({}, async (a, lade, b) => {
      const limiet = await rateLimit(`sleutelkluis-passkey:${a.user.id}`, 20, 600);
      if (!limiet.ok) throw new SleutelkluisFout('RATE_LIMITED', 429);
      const rij = await assertieControleren(a, b);
      await ontgrendelMetPasskey(lade, String(rij.id), b.dek, houder(a));
      return { ok: true, stand: 'open' };
    })],
    // IDENTITEIT-015 (етап 1.3): старт скидає перебіг; maxTabellen — скільки таблиць за цей запит (сторінка робить кроки по одній
    // й показує «оброблено N з M»). Без maxTabellen — усе одразу, як раніше.
    [`POST ${P}/herversleutelen`]: [route({ sterk: true }, async (a, lade, b) => {
      await begrens(a, 'herversleutelen', 6, 3600);
      return { ok: true, ...(await herversleutelen(lade, { maxTabellen: Number(b.maxTabellen) || undefined })) };
    })],
    // «Продовжити»: лише ще не оброблені таблиці роботи, яку вже підтвердили сильним step-up на старті (перериванням вважається
    // закритий ключ або закрита вкладка). Потрібні відкритий ключ і незавершений стан; власний ліміт, бо одна робота = M кроків.
    [`POST ${P}/herversleutelen/verder`]: [route({}, async (a, lade, b) => {
      await begrens(a, 'herversleutelen-verder', 240, 3600);
      return { ok: true, ...(await herversleutelen(lade, { verder: true, maxTabellen: Number(b.maxTabellen) || undefined })) };
    })],
  };
}
