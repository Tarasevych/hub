// Step-up (opnieuw bevestigen) voor gevoelige acties (beveiliging fase 3).
// Een actie mag als binnen 5 minuten op DEZE sessie (sessie-id, tab-overlay of anker):
//   a) een Google-aanmelding is afgerond waarvan Google zelf bevestigt (auth_time in het id_token) dat de
//      gebruiker zich minder dan 5 minuten geleden echt heeft aangemeld, óf een expliciete step-up-transactie
//      (venster «Підтвердіть доступ») met een net uitgegeven id_token voor hetzelfde Google-account (googleUitgifteVoorStapOpVers). Onthouden browser (complete-remembered)
//      en handoff tellen nooit: daar is geen nieuw id_token. (Audit-fix 5.)
//   b) een geldige TOTP-code is ingevoerd via POST /api/owner/access/stap-op (of, met methode 'herstelcode', een ongebruikte
//      herstelcode: eenmalig verbruikt, zelfde lockout als TOTP, en de gebruiker krijgt een melding).
//   c) een geldige passkey-assertie (UV) van een eigen passkey via POST /api/owner/access/stap-op/passkey (backend/toegangssleutels.ts).
// Opt-in noodpad: STAP_OP_GOOGLE_ZONDER_AUTH_TIME=1 laat een expliciete step-up-transactie (prompt=login) zonder
// auth_time-claim tellen als het OAuth-verloop binnen 5 minuten na de start is afgerond. Standaard uit.
// Noodschakelaar: STAP_OP_UIT=1 (alles mag weer zonder step-up, zoals vóór fase 3).
// Opslag: één record per account in owner_step_up_v1 (eigen rij → werkt onder RLS).
//
// «Запам'ятати цей браузер (не питати знову до виходу)»: na een geslaagde bevestiging mag de gebruiker die bevestiging laten
// onthouden voor DEZE browser en DIT account (POST /api/owner/access/stap-op/onthouden, toegangslaag.ts). Dat is één rij
// (sessie-id → tijdstip) in hetzelfde record: hoogstens STAP_OP_ONTHOUD_MS geldig, onbereikbaar na uitloggen (het sessie-id
// kan dan niet meer aanmelden), per account apart, en NOOIT genoeg voor «sterke» acties of voor de acties in NOOIT_ONTHOUDEN.
import { db } from '../server/platform';
import { actieVoorPad } from '../shared/stap-op-acties';
export { actieVoorPad } from '../shared/stap-op-acties';

export const STAP_OP_TABEL = 'owner_step_up_v1';
export const STAP_OP_MS = 5 * 60 * 1000;
/** «Запам'ятати цей браузер»: hoe lang een onthouden bevestiging hoogstens meegaat (nooit oneindig). */
export const STAP_OP_ONTHOUD_MS = 12 * 60 * 60 * 1000;
type StapOpRecord = { id: string; userId: string; googleAt?: number; sessies?: Record<string, number>; passkeySessies?: Record<string, number>; sterkSessies?: Record<string, number>; onthoudSessies?: Record<string, number>; methodes?: Record<string, string>; updatedAt: number };
const TOEKOMST_SPELING_MS = 60 * 1000;
export type StapOpSessie = { id: string; createdAt: number; userId?: string };
export type StapOpAuth = { user: { id: string }; session?: StapOpSessie | null; tabSession?: StapOpSessie | null };

export const stapOpUit = () => process.env.STAP_OP_UIT === '1';
const sessieVan = (auth: StapOpAuth): StapOpSessie | null => auth.tabSession || auth.session || null;
/**
 * Waaraan een onthouden bevestiging hangt: de browser-sessie (anker), zodat elk tabblad van DEZE browser meeprofiteert.
 * Hoort het anker bij een ANDER account (een tabblad met een tweede account bovenop), dan hangt het onthouden aan het
 * tabblad zelf: zo haalt «onthouden» in het ene account nooit de vraag weg in het andere.
 */
export function onthoudSessie(auth: StapOpAuth): StapOpSessie | null {
  const s = auth.session;
  if (s && (!s.userId || s.userId === auth.user.id)) return s;
  return auth.tabSession || null;
}
export const onthoudSessieId = (auth: StapOpAuth): string => onthoudSessie(auth)?.id || '';

async function recordVan(userId: string): Promise<StapOpRecord | null> {
  const rows = await db.list<Omit<StapOpRecord, 'id'>>(STAP_OP_TABEL, { filter: { userId }, limit: 1 });
  return (rows.items[0] as StapOpRecord | undefined) || null;
}
async function schrijf(userId: string, wijzig: (r: Omit<StapOpRecord, 'id'>) => Omit<StapOpRecord, 'id'>) {
  const bestaand = await recordVan(userId);
  const nu = Date.now();
  const basis: Omit<StapOpRecord, 'id'> = bestaand ? (({ id: _id, ...rest }) => rest)(bestaand) : { userId, sessies: {}, updatedAt: nu };
  const vers = (m?: Record<string, number>) => Object.fromEntries(Object.entries(m || {}).filter(([, at]) => nu - at < STAP_OP_MS));
  // Onthouden browsers hebben hun eigen (langere, maar eindige) termijn; verlopen rijen verdwijnen bij elke schrijfactie.
  const versOnthoud = (m?: Record<string, number>) => Object.fromEntries(Object.entries(m || {}).filter(([, at]) => nu - at < STAP_OP_ONTHOUD_MS).slice(-50));
  const volgend = wijzig({ ...basis, sessies: vers(basis.sessies), passkeySessies: vers(basis.passkeySessies), sterkSessies: vers(basis.sterkSessies), onthoudSessies: versOnthoud(basis.onthoudSessies),
    methodes: Object.fromEntries(Object.entries(basis.methodes || {}).filter(([id]) => (basis.sessies || {})[id] && nu - Number((basis.sessies || {})[id]) < STAP_OP_MS)), updatedAt: nu });
  if (bestaand) await db.update(STAP_OP_TABEL, [{ id: bestaand.id, record: volgend }]);
  else await db.add(STAP_OP_TABEL, [volgend]);
}

/** Is een Google auth_time (ms) vers genoeg voor step-up? */
export function googleAuthTijdVers(authTimeMs: number, nu = Date.now()): boolean {
  return Number.isFinite(authTimeMs) && authTimeMs > 0 && authTimeMs <= nu + TOEKOMST_SPELING_MS && nu - authTimeMs < STAP_OP_MS;
}
/** Google negeert prompt=login/max_age vaak: auth_time blijft dan oud. Een step-up-transactie telt daarom ook als het
 * ondertekende id_token NET is uitgegeven: iat hoogstens 2 min oud (60 s klokspeling), niet vóór de klik (start van de
 * transactie, 60 s speling) en de transactie zelf jonger dan 10 min. Nonce, state, PKCE, binding en hetzelfde
 * Google-subject controleert backend/index.ts (ownerGoogleUserFromCode). RUNBOOK-VEILIGE-UITROL.md §13.8. */
export const STAP_OP_IAT_MS = 2 * 60 * 1000;
export function googleUitgifteVoorStapOpVers(iatMs: number, txStartMs: number, nu = Date.now()): boolean {
  if (!Number.isFinite(iatMs) || iatMs <= 0 || !Number.isFinite(txStartMs) || txStartMs <= 0) return false;
  if (iatMs > nu + TOEKOMST_SPELING_MS || nu - iatMs > STAP_OP_IAT_MS) return false;
  if (iatMs < txStartMs - TOEKOMST_SPELING_MS) return false;
  return nu - txStartMs < 10 * 60 * 1000;
}
/**
 * Aanroepen nadat een Google-aanmelding sessie(s) heeft opgeleverd. Legt step-up vast voor precies die sessie-id's,
 * alleen als auth_time vers is. Tijdstip = auth_time (dus de 5 minuten lopen vanaf de echte aanmelding).
 */
export async function googleStapOpVastleggen(userId: string, sessieIds: Array<string | null | undefined>, authTimeMs: number): Promise<boolean> {
  const ids = sessieIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (!ids.length || !googleAuthTijdVers(authTimeMs)) return false;
  const at = Math.min(authTimeMs, Date.now());
  await schrijf(userId, (r) => { const { googleAt: _oud, ...rest } = r; return { ...rest, sessies: { ...(r.sessies || {}), ...Object.fromEntries(ids.map((id) => [id, at])) }, methodes: { ...(r.methodes || {}), ...Object.fromEntries(ids.map((id) => [id, 'google'])) } }; });
  return true;
}
/** Aanroepen na een geldige TOTP-code (of herstelcode, methode 'herstelcode') op deze sessie. Telt ook als «sterke» step-up. */
export async function totpStapOpVastleggen(auth: StapOpAuth, methode: 'totp' | 'herstelcode' = 'totp'): Promise<void> {
  const s = sessieVan(auth);
  if (!s) return;
  const nu = Date.now();
  await schrijf(auth.user.id, (r) => ({ ...r, sessies: { ...(r.sessies || {}), [s.id]: nu }, sterkSessies: { ...(r.sterkSessies || {}), [s.id]: nu }, methodes: { ...(r.methodes || {}), [s.id]: methode } }));
}

/** Aanroepen na een geldig codewoord op deze sessie. Telt als gewone én sterke step-up. */
export async function codewoordStapOpVastleggen(auth: StapOpAuth): Promise<void> {
  const s = sessieVan(auth);
  if (!s) return;
  const nu = Date.now();
  await schrijf(auth.user.id, (r) => ({ ...r, sessies: { ...(r.sessies || {}), [s.id]: nu }, sterkSessies: { ...(r.sterkSessies || {}), [s.id]: nu }, methodes: { ...(r.methodes || {}), [s.id]: 'codewoord' } }));
}

/** Aanroepen na een geldige passkey-assertie op deze sessie. Telt als gewone step-up én apart als passkey-step-up. */
export async function passkeyStapOpVastleggen(auth: StapOpAuth): Promise<boolean> {
  const s = sessieVan(auth);
  if (!s) return false;
  const nu = Date.now();
  await schrijf(auth.user.id, (r) => ({ ...r, sessies: { ...(r.sessies || {}), [s.id]: nu }, passkeySessies: { ...(r.passkeySessies || {}), [s.id]: nu }, sterkSessies: { ...(r.sterkSessies || {}), [s.id]: nu }, methodes: { ...(r.methodes || {}), [s.id]: 'passkey' } }));
  return true;
}
/** Is er op deze sessie binnen 5 minuten met een passkey bevestigd? (Strenger dan stapOpGeldig: Google telt hier niet.) */
export async function passkeyStapOpGeldig(auth: StapOpAuth, nu = Date.now()): Promise<boolean> {
  const s = sessieVan(auth);
  if (!s) return false;
  const r = await recordVan(auth.user.id);
  const at = Number(r?.passkeySessies?.[s.id] || 0);
  return at > 0 && nu - at < STAP_OP_MS;
}
export const stapOpSessieId = (auth: StapOpAuth): string => sessieVan(auth)?.id || '';

/**
 * «Sterke» step-up (§13.10): binnen 5 minuten op DEZE sessie bevestigd met een passkey, TOTP-code of herstelcode — opnieuw
 * inloggen bij Google telt hier niet. Voor het intrekken van rechten (bv. «Може схвалювати оновлення») en «Це був не я».
 */
export async function sterkeStapOpGeldig(auth: StapOpAuth, nu = Date.now()): Promise<boolean> {
  if (stapOpUit()) return true;
  const s = sessieVan(auth);
  if (!s) return false;
  const r = await recordVan(auth.user.id);
  const at = Number(r?.sterkSessies?.[s.id] || 0);
  return at > 0 && nu - at < STAP_OP_MS;
}
/**
 * Eenmalig gebruik: na een geslaagde gevoelige actie (geheim tonen/wijzigen/verwijderen) wordt de bevestiging van DEZE sessie
 * ingetrokken, zodat de volgende actie opnieuw om passkey/code vraagt. Alleen het record van deze sessie; andere sessies blijven.
 */
export async function stapOpVerbruiken(auth: StapOpAuth): Promise<void> {
  const s = sessieVan(auth);
  if (!s || stapOpUit()) return;
  const r = await recordVan(auth.user.id);
  if (!r) return;
  const zonder = (m?: Record<string, number>) => Object.fromEntries(Object.entries(m || {}).filter(([id]) => id !== s.id));
  await schrijf(auth.user.id, (basis) => ({ ...basis, sessies: zonder(basis.sessies), passkeySessies: zonder(basis.passkeySessies), sterkSessies: zonder(basis.sterkSessies),
    methodes: Object.fromEntries(Object.entries(basis.methodes || {}).filter(([id]) => id !== s.id)) }));
}
/** Waarmee is deze sessie het laatst bevestigd ('passkey' | 'totp' | 'herstelcode' | 'google' | '')? Alleen voor de audit. */
export async function stapOpMethode(auth: StapOpAuth): Promise<string> {
  const s = sessieVan(auth);
  if (!s) return '';
  const r = await recordVan(auth.user.id);
  if (!r?.sessies?.[s.id]) return '';
  return String(r.methodes?.[s.id] || 'google');
}

// ------------------------------------------------------------------------------------------------ «Запам'ятати цей браузер»
// De gebruiker kan in het venster «Підтвердіть доступ» kiezen: niet opnieuw vragen in DEZE browser tot uitloggen. Dat is één
// rij per (account, sessie-id) in hetzelfde record. Omdat een sessie-id na uitloggen nooit meer kan aanmelden, is «tot
// uitloggen» geen belofte op papier maar een eigenschap van de sleutel: de onthouden rij is daarna onbereikbaar. Daarbovenop
// een harde termijn (STAP_OP_ONTHOUD_MS) en een lijst acties die NOOIT onthouden worden (hieronder).
/**
 * Acties waarvoor we ALTIJD opnieuw vragen, ook met «onthouden» aan: alles wat de beveiliging zelf verandert of onomkeerbaar
 * is. Het venster zegt dat ook letterlijk tegen de gebruiker (bevestig-toegang.tsx), zodat er geen stille uitzondering is.
 */
export const NOOIT_ONTHOUDEN: readonly string[] = Object.freeze([
  'onbekend', 'uitrol-goedkeuren', 'voorbereider',
  'passkey-toevoegen', 'passkey-verwijderen',
  'goedkeur-recht-aanvragen', 'goedkeur-recht-bevestigen', 'goedkeur-recht-intrekken',
  'herstelcodes-nieuw', 'herstelcodes-maken', 'herstelcodes-intrekken',
  'totp-wijzigen', 'totp-uitschakelen', 'wachtwoord', 'aanmeldmethode',
  'account-verwijderen', 'wijziging-terugdraaien', 'export', 'beheer',
  'toegangscode-maken', 'toegangscode-verlengen',
  // Gescheiden gegevensruimtes (0082): de technische ruimte met de persoonlijke verbinden, de eenmalige keuze, en elk besluit
  // van de servereigenaar over bevroren gegevens. Hier vragen we ALTIJD opnieuw: een onthouden browser is nooit genoeg om
  // persoonlijke gegevens in de technische ruimte te laten zien.
  'ruimte-verbinden', 'ruimte-keuze', 'ruimte-besluit',
]);
/** Mag deze actie onthouden worden? Leeg/onbekend label → nee (liever één keer te veel vragen dan één keer te weinig). */
export const onthoudMagVoorActie = (actie: unknown): boolean => {
  const a = typeof actie === 'string' ? actie : '';
  return /^[a-z][a-z0-9-]{1,40}$/.test(a) && !NOOIT_ONTHOUDEN.includes(a);
};
/** De enige pad→actielabel-tabel leeft in shared/stap-op-acties.ts (client en server). */
/** Mag een onthouden bevestiging dit pad doorlaten? Pad onbekend → nee. */
export const onthoudMagVoorPad = (pad: string): boolean => (pad ? onthoudMagVoorActie(actieVoorPad(pad)) : false);

/** Leg vast: deze browser (sessie) hoeft tot uitloggen niet opnieuw te bevestigen. Geeft de einddatum (ms) of 0. */
export async function onthoudVastleggen(auth: StapOpAuth): Promise<number> {
  const s = onthoudSessie(auth);
  if (!s) return 0;
  const nu = Date.now();
  await schrijf(auth.user.id, (r) => ({ ...r, onthoudSessies: { ...(r.onthoudSessies || {}), [s.id]: nu } }));
  return nu + STAP_OP_ONTHOUD_MS;
}
/** «Забути цей браузер» uit het overzicht met sessies. true = er was iets te vergeten. */
export async function onthoudVergeten(userId: string, sessieId: string): Promise<boolean> {
  if (!userId || !sessieId) return false;
  const r = await recordVan(userId);
  if (!r?.onthoudSessies?.[sessieId]) return false;
  await schrijf(userId, (basis) => ({ ...basis, onthoudSessies: Object.fromEntries(Object.entries(basis.onthoudSessies || {}).filter(([id]) => id !== sessieId)) }));
  return true;
}
/** Alles vergeten (uitloggen overal, «Вийти всюди», noodknop). */
export async function onthoudAllesVergeten(userId: string): Promise<number> {
  const r = await recordVan(userId);
  const aantal = Object.keys(r?.onthoudSessies || {}).length;
  if (aantal) await schrijf(userId, (basis) => ({ ...basis, onthoudSessies: {} }));
  return aantal;
}
/** Welke sessies van dit account onthouden zijn: sessie-id → geldig tot (ms). Voor het overzicht met sessies. */
export async function onthoudenSessies(userId: string, nu = Date.now()): Promise<Record<string, number>> {
  const r = await recordVan(userId);
  return Object.fromEntries(Object.entries(r?.onthoudSessies || {})
    .filter(([, at]) => Number(at) > 0 && nu - Number(at) < STAP_OP_ONTHOUD_MS)
    .map(([id, at]) => [id, Number(at) + STAP_OP_ONTHOUD_MS]));
}
/** Is deze browser onthouden (en nog binnen de termijn)? Nooit genoeg voor sterke acties — die vragen altijd. */
export async function onthoudGeldig(auth: StapOpAuth, nu = Date.now()): Promise<boolean> {
  const s = onthoudSessie(auth);
  if (!s) return false;
  const r = await recordVan(auth.user.id);
  const at = Number(r?.onthoudSessies?.[s.id] || 0);
  return at > 0 && nu - at < STAP_OP_ONTHOUD_MS;
}

/** Is de step-up voor deze sessie nog vers? Met `onthoud: false` telt een onthouden browser niet mee (sterke/altijd-vragen-acties). */
export async function stapOpGeldig(auth: StapOpAuth, nu = Date.now(), opties: { onthoud?: boolean } = {}): Promise<boolean> {
  if (stapOpUit()) return true;
  const s = sessieVan(auth);
  if (!s) return false;
  const r = await recordVan(auth.user.id);
  if (!r) return false;
  // Alleen per sessie-id (Google met verse auth_time of TOTP). Het oude account-brede googleAt telt niet meer.
  const at = Number(r.sessies?.[s.id] || 0);
  if (at > 0 && nu - at < STAP_OP_MS) return true;
  if (opties.onthoud === false) return false;
  const o = onthoudSessie(auth);
  const oat = Number(o ? r.onthoudSessies?.[o.id] || 0 : 0);
  return oat > 0 && nu - oat < STAP_OP_ONTHOUD_MS;
}

/** Tot wanneer (ms) de step-up op deze sessie nog geldt; 0 = niet bevestigd. Alleen voor de uitleg in het venster «Підтвердіть доступ». */
export async function stapOpGeldigTot(auth: StapOpAuth, nu = Date.now()): Promise<number> {
  const s = sessieVan(auth);
  if (!s) return 0;
  const r = await recordVan(auth.user.id);
  const at = Number(r?.sessies?.[s.id] || 0);
  return at > 0 && nu - at < STAP_OP_MS ? at + STAP_OP_MS : 0;
}

/** Foutcode als step-up nodig is, anders ''. 403 (geen 401: de sessie zelf is geldig). */
export async function stapOpFout(auth: StapOpAuth, opties: { onthoud?: boolean } = {}): Promise<'' | 'STEP_UP_REQUIRED'> {
  return (await stapOpGeldig(auth, Date.now(), opties)) ? '' : 'STEP_UP_REQUIRED';
}
