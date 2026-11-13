// Toegangssleutels in context (id.tarasevych.com/methods, RUNBOOK-VEILIGE-UITROL.md §13.10).
//
//  1. Gebruikscontext: elke keer dat een passkey of herstelcode iets bevestigt, leggen we vast WAARVOOR (actie uit de vaste lijst
//     ACTIES hieronder; de client stuurt alleen een label, de server neemt het alleen over als het in de lijst staat), WAAR (host
//     uit de dienst van de sessie, niet uit de client), het apparaat (grof label uit de user-agent) en de IP-hash. Per sleutel de
//     laatste 20 (app.toegang_gebruik, migratie 0024, RLS per gebruiker).
//  2. Privénotities per passkey, herstelcodeset, losse herstelcode of toegangscode (app.toegang_notities, RLS per gebruiker).
//  3. Wijzigingen aan rechten (intrekken van «Може схвалювати оновлення», een goedkeur-passkey verwijderen, een voorbereider-recht
//     intrekken): wie, sessie, apparaat, IP-hash, wanneer, waarom en welke sleutel (app.toegang_wijzigingen). Schrijven via de
//     systeemrol; de getroffen gebruiker leest alleen eigen rijen. «Це був не я» draait terug wat technisch kan en trekt de sessie
//     in die de wijziging deed.
//  4. «Sterke» step-up: wie een passkey, TOTP of herstelcodes heeft, moet voor zulke wijzigingen daarmee bevestigen; opnieuw
//     inloggen bij Google is dan niet genoeg (STEP_UP_STRONG_REQUIRED).
import { db } from '../server/platform';
import { apparaat, ipHash } from '../server/platform/audit';
import { huidigeContext } from '../server/platform/context';
import { getPool } from '../server/platform/pg';
import { alsGebruiker } from './ai-toestemmingen';
import { stapOpGeldig, stapOpMethode, stapOpSessieId, stapOpUit, sterkeStapOpGeldig, type StapOpAuth } from './stap-op';
import { jsonbTekst } from '../shared/tekst-veilig';

// ------------------------------------------------------------------------------------------------ acties (vaste lijst)
/** Waarvoor een sleutel gebruikt is. Sleutel = wat de client mag sturen; waarde = [uk, nl]. Onbekend → 'onbekend'. */
export const ACTIES = Object.freeze({
  inloggen: ['Вхід', 'Aanmelden'],
  bevestigen: ['Підтвердження доступу', 'Toegang bevestigen'],
  'herstelcodes-nieuw': ['Створення нових кодів', 'Nieuwe codes maken'],
  'herstelcodes-intrekken': ['Відкликання кодів відновлення', 'Herstelcodes intrekken'],
  'passkey-toevoegen': ['Додавання passkey', 'Passkey toevoegen'],
  'passkey-verwijderen': ['Видалення passkey', 'Passkey verwijderen'],
  'goedkeur-recht-aanvragen': ['Запит права схвалювати оновлення', 'Recht om updates goed te keuren aanvragen'],
  'goedkeur-recht-bevestigen': ['Надання права схвалювати оновлення', 'Recht om updates goed te keuren bevestigen'],
  'goedkeur-recht-intrekken': ['Відкликання права схвалювати оновлення', 'Recht om updates goed te keuren intrekken'],
  'wijziging-terugdraaien': ['Скасування зміни («Це був не я»)', 'Wijziging terugdraaien («Dit was ik niet»)'],
  'toegangscode-maken': ['Створення коду доступу для іншої людини', 'Toegangscode voor iemand anders maken'],
  'toegangscode-verlengen': ['Продовження коду доступу', 'Toegangscode verlengen'],
  'uitrol-goedkeuren': ['Схвалення оновлення', 'Update goedkeuren'],
  voorbereider: ['Право готувати оновлення', 'Recht om updates voor te bereiden'],
  'totp-wijzigen': ['Зміна застосунку-автентифікатора', 'Authenticator-app wijzigen'],
  'totp-uitschakelen': ['Вимкнення застосунку-автентифікатора', 'Authenticator-app uitschakelen'],
  wachtwoord: ['Зміна пароля', 'Wachtwoord wijzigen'],
  aanmeldmethode: ['Зміна способів входу', 'Aanmeldmethoden wijzigen'],
  beheer: ['Адміністрування', 'Beheer'],
  agenten: ['Агенти й токени', 'Agents en tokens'],
  export: ['Експорт даних', 'Gegevens exporteren'],
  'account-verwijderen': ['Видалення акаунта', 'Account verwijderen'],
  sleutelkluis: ['Шифрування моїх даних', 'Versleuteling van mijn gegevens'],
  // APPARAAT-001: de toegangssleutel op apparaat B bekrachtigt een verzoek van apparaat A; en de instellingen van de methode zelf.
  'apparaat-bevestigen': ['Підтвердження дії для іншого пристрою', 'Handeling voor een ander apparaat bevestigen'],
  'apparaat-instellingen': ['Налаштування підтвердження з іншого пристрою', 'Instellingen voor bevestigen vanaf een ander apparaat'],
  onbekend: ['Інша дія', 'Andere actie'],
} as const satisfies Record<string, readonly [string, string]>);
export type Actie = keyof typeof ACTIES;
export const actieVan = (v: unknown): Actie => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(ACTIES, v) ? v as Actie : 'onbekend');

const HOSTS: Readonly<Record<string, string>> = { identity: 'id.tarasevych.com', admin: 'admin.tarasevych.com', hub: 'hub.tarasevych.com', ai: 'ai.tarasevych.com', mail: 'mail.tarasevych.com', cloud: 'cloud.tarasevych.com', github: 'github.tarasevych.com', huis: 'huis.tarasevych.com', api: 'api.tarasevych.com', mcp: 'mcp.tarasevych.com' };
/** Host bij een dienst (identity → id.tarasevych.com). Alleen bekende diensten; anders ''. */
export const hostVoorDienst = (dienst?: string | null) => HOSTS[String(dienst || '')] || '';
const SLEUTEL = /^[A-Za-z0-9:._-]{1,120}$/;
export const GEBRUIK_MAX = 20;

// ------------------------------------------------------------------------------------------------ gebruik
export type GebruikSoort = 'passkey' | 'herstelcode';
export type Gebruik = { actie: Actie; host: string; apparaat: string | null; /** eerste 12 tekens van de HMAC van het IP (nooit het IP zelf) */ ipKort: string | null; op: string };
/** Leg één gebruik vast (faalt stil: de bevestiging zelf is al gelukt). Houdt per sleutel de laatste GEBRUIK_MAX. */
export async function gebruikVastleggen(userId: string, soort: GebruikSoort, sleutel: string, actie: unknown, opts: { dienst?: string } = {}): Promise<void> {
  if (!userId || !SLEUTEL.test(String(sleutel || ''))) return;
  const c = huidigeContext();
  const host = hostVoorDienst(opts.dienst || c?.service);
  const ip = ipHash(c?.ip);
  try {
    await alsGebruiker(userId, async (q) => {
      await q('INSERT INTO app.toegang_gebruik (user_id, soort, sleutel, actie, host, apparaat, ip_hash) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [userId, soort, sleutel, actieVan(actie), host, apparaat(c?.ua), ip]);
      await q(`DELETE FROM app.toegang_gebruik WHERE id IN (SELECT id FROM app.toegang_gebruik WHERE user_id = $1 AND soort = $2 AND sleutel = $3
        ORDER BY op DESC, id DESC OFFSET $4)`, [userId, soort, sleutel, GEBRUIK_MAX]);
    });
  } catch (err) { console.error('[toegang] gebruik vastleggen mislukt:', (err as Error).message); }
}
/** Gebruik per sleutel (nieuwste eerst). */
export async function gebruikVoor(userId: string, soort: GebruikSoort, sleutels: string[]): Promise<Map<string, Gebruik[]>> {
  const uit = new Map<string, Gebruik[]>();
  const geldig = sleutels.filter((s) => SLEUTEL.test(s));
  if (!userId || !geldig.length) return uit;
  try {
    const rijen = await alsGebruiker(userId, async (q) => (await q(`SELECT sleutel, actie, host, apparaat, ip_hash, op FROM app.toegang_gebruik
      WHERE user_id = $1 AND soort = $2 AND sleutel = ANY($3) ORDER BY op DESC, id DESC`, [userId, soort, geldig])).rows);
    for (const r of rijen) {
      const lijst = uit.get(r.sleutel) || [];
      if (lijst.length < GEBRUIK_MAX) lijst.push({ actie: actieVan(r.actie), host: String(r.host || ''), apparaat: r.apparaat || null, ipKort: r.ip_hash ? String(r.ip_hash).slice(0, 12) : null, op: new Date(r.op).toISOString() });
      uit.set(r.sleutel, lijst);
    }
  } catch (err) { console.error('[toegang] gebruik lezen mislukt:', (err as Error).message); }
  return uit;
}

// ------------------------------------------------------------------------------------------------ notities
export const NOTITIE_SOORTEN = ['passkey', 'herstelset', 'herstelcode', 'toegangscode'] as const;
export type NotitieSoort = typeof NOTITIE_SOORTEN[number];
export const NOTITIE_MAX = 500;
export class ToegangFout extends Error { constructor(public code: string, public status = 400, public retryAfter?: number) { super(code); } }
const fout = (code: string, status = 400, retryAfter?: number): never => { throw new ToegangFout(code, status, retryAfter); };
/** Opschonen: geen stuurtekens (behalve regeleinde), witruimte aan de randen weg. */
export const notitieTekst = (v: unknown) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
export async function notitiesLijst(userId: string) {
  return alsGebruiker(userId, async (q) => (await q('SELECT soort, sleutel, tekst, bijgewerkt_op FROM app.toegang_notities WHERE user_id = $1 ORDER BY bijgewerkt_op DESC LIMIT 500', [userId])).rows
    .map((r: { soort: string; sleutel: string; tekst: string; bijgewerkt_op: Date }) => ({ soort: r.soort, sleutel: r.sleutel, tekst: r.tekst, bijgewerktOp: new Date(r.bijgewerkt_op).toISOString() })));
}
/** Notitie opslaan (leeg = verwijderen). Hoogstens 500 tekens; langer = NOTITIE_TE_LANG (nooit stil inkorten). */
export async function notitieOpslaan(userId: string, input: { soort?: unknown; sleutel?: unknown; tekst?: unknown }) {
  const soort = String(input.soort || '') as NotitieSoort;
  if (!NOTITIE_SOORTEN.includes(soort)) fout('NOTITIE_SOORT_ONGELDIG');
  const sleutel = String(input.sleutel || '');
  if (!SLEUTEL.test(sleutel)) fout('NOTITIE_SLEUTEL_ONGELDIG');
  const tekst = notitieTekst(input.tekst);
  if ([...tekst].length > NOTITIE_MAX) fout('NOTITIE_TE_LANG');
  return alsGebruiker(userId, async (q) => {
    if (!tekst) { await q('DELETE FROM app.toegang_notities WHERE user_id = $1 AND soort = $2 AND sleutel = $3', [userId, soort, sleutel]); return { soort, sleutel, tekst: '', bijgewerktOp: null }; }
    const n = Number((await q('SELECT count(*)::int AS n FROM app.toegang_notities WHERE user_id = $1', [userId])).rows[0]?.n || 0);
    if (n >= 300) fout('NOTITIE_LIMIET', 409);
    const r = (await q(`INSERT INTO app.toegang_notities (user_id, soort, sleutel, tekst) VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, soort, sleutel) DO UPDATE SET tekst = EXCLUDED.tekst, bijgewerkt_op = now() RETURNING bijgewerkt_op`, [userId, soort, sleutel, tekst])).rows[0];
    return { soort, sleutel, tekst, bijgewerktOp: new Date(r.bijgewerkt_op).toISOString() };
  });
}

// ------------------------------------------------------------------------------------------------ sterke step-up
type Methoden = { passkey: boolean; totp: boolean; herstelcode: boolean };
let methodenBron: ((userId: string) => Promise<Methoden>) | null = null;
/** toegangslaag.ts registreert hoe we zien welke sterke manieren een gebruiker heeft (passkeys, TOTP, ongebruikte herstelcodes). */
export function registreerMethodenBron(fn: (userId: string) => Promise<Methoden>) { methodenBron = fn; }
export async function sterkeMethoden(userId: string): Promise<Methoden> {
  try { return methodenBron ? await methodenBron(userId) : { passkey: false, totp: false, herstelcode: false }; }
  catch { return { passkey: false, totp: false, herstelcode: false }; }
}
/**
 * '' = mag door. Heeft de gebruiker een passkey, TOTP of herstelcodes, dan alleen met een verse bevestiging daarmee op deze sessie
 * (STEP_UP_STRONG_REQUIRED); zonder zulke manier is een gewone step-up (Google) genoeg (STEP_UP_REQUIRED).
 */
export async function sterkeStapOpFout(auth: StapOpAuth): Promise<'' | 'STEP_UP_REQUIRED' | 'STEP_UP_STRONG_REQUIRED'> {
  if (stapOpUit()) return '';
  const m = await sterkeMethoden(auth.user.id);
  if (m.passkey || m.totp || m.herstelcode) return (await sterkeStapOpGeldig(auth)) ? '' : 'STEP_UP_STRONG_REQUIRED';
  // Sterke acties: een onthouden browser telt hier NOOIT (ook niet als Google de enige manier is) — altijd opnieuw vragen.
  return (await stapOpGeldig(auth, Date.now(), { onthoud: false })) ? '' : 'STEP_UP_REQUIRED';
}

// ------------------------------------------------------------------------------------------------ reden
export const REDEN_MIN = 10;
export const REDEN_MAX = 500;
/** Verplichte reden: 10–500 tekens na opschonen; anders REDEN_TE_KORT / REDEN_TE_LANG. */
export function redenVan(v: unknown): string {
  const r = notitieTekst(v).replace(/\s+/g, ' ');
  if ([...r].length < REDEN_MIN) fout('REDEN_TE_KORT');
  if ([...r].length > REDEN_MAX) fout('REDEN_TE_LANG');
  return r;
}

// ------------------------------------------------------------------------------------------------ wijzigingen
export type WijzigingSoort = 'goedkeur-recht-aangevraagd' | 'goedkeur-recht-ingetrokken' | 'goedkeur-passkey-verwijderd' | 'voorbereider-ingetrokken';
type SessieAuth = StapOpAuth & { service?: string; session?: (StapOpAuth['session'] & { grantId?: string }) | null; tabSession?: (StapOpAuth['tabSession'] & { anchorSessionId?: string; grantId?: string }) | null };
/** Welke sessie(s) doen dit verzoek: tab-sessie, anker-sessie en onthouden browser (voor «Це був не я»). */
export function sessieInfo(auth: SessieAuth) {
  const tab = auth.tabSession || null;
  const anker = tab?.anchorSessionId || auth.session?.id || '';
  const grant = tab?.grantId || auth.session?.grantId || '';
  return { sessieId: stapOpSessieId(auth), tab: tab?.id || '', anker: String(anker || ''), grant: String(grant || '') };
}
const sys = () => getPool('systeem');
export type WijzigingInvoer = {
  userId: string; actor: { id: string; email?: string }; soort: WijzigingSoort; sleutel?: string; vingerafdruk?: string; label?: string;
  reden?: string | null; auth?: SessieAuth; herstel?: Record<string, unknown> | null;
};
export async function wijzigingVastleggen(w: WijzigingInvoer): Promise<string> {
  const c = huidigeContext();
  const s = w.auth ? sessieInfo(w.auth) : { sessieId: '', tab: '', anker: '', grant: '' };
  const methode = w.auth ? await stapOpMethode(w.auth).catch(() => '') : '';
  const { rows } = await sys().query(`INSERT INTO app.toegang_wijzigingen (user_id, actor_id, actor_email, soort, sleutel, vingerafdruk, label, reden, sessie_id, sessies, stap_op, host, apparaat, ip_hash, herstel)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15::jsonb) RETURNING id`,
  [w.userId, w.actor.id, String(w.actor.email || '').slice(0, 200), w.soort, String(w.sleutel || '').slice(0, 120), w.vingerafdruk || '', String(w.label || '').slice(0, 120), w.reden ?? null,
    s.sessieId, jsonbTekst({ tab: s.tab, anker: s.anker, grant: s.grant }), methode, hostVoorDienst(w.auth?.service || c?.service), apparaat(c?.ua), ipHash(c?.ip),
    w.herstel ? jsonbTekst(w.herstel) : null]);
  return String(rows[0].id);
}
export type WijzigingRij = {
  id: string; userId: string; actorId: string; actorEmail: string; soort: WijzigingSoort; sleutel: string; vingerafdruk: string; label: string; reden: string | null;
  sessieId: string; stapOp: string; host: string; apparaat: string | null; ipKort: string | null; op: string; ongedaanOp: string | null; ongedaanDoor: string | null;
  ongedaanUitkomst: Record<string, unknown> | null; doorZelf: boolean;
};
const wijzigingUit = (r: any, userId: string): WijzigingRij => ({
  id: String(r.id), userId: String(r.user_id), actorId: String(r.actor_id), actorEmail: String(r.actor_email || ''), soort: r.soort, sleutel: String(r.sleutel || ''),
  vingerafdruk: String(r.vingerafdruk || ''), label: String(r.label || ''), reden: r.reden ?? null, sessieId: String(r.sessie_id || '').slice(0, 8), stapOp: String(r.stap_op || ''),
  host: String(r.host || ''), apparaat: r.apparaat || null, ipKort: r.ip_hash ? String(r.ip_hash).slice(0, 12) : null, op: new Date(r.op).toISOString(),
  ongedaanOp: r.ongedaan_op ? new Date(r.ongedaan_op).toISOString() : null, ongedaanDoor: r.ongedaan_door || null, ongedaanUitkomst: r.ongedaan_uitkomst || null,
  doorZelf: String(r.actor_id) === userId,
});
/** Eigen wijzigingen (RLS), eventueel alleen voor één vingerafdruk of sleutel. Nieuwste eerst. */
export async function wijzigingenVoor(userId: string, filter: { vingerafdrukken?: string[]; sleutels?: string[] } = {}): Promise<WijzigingRij[]> {
  try {
    const rijen = await alsGebruiker(userId, async (q) => (await q(`SELECT * FROM app.toegang_wijzigingen WHERE user_id = $1
      AND ($2::text[] IS NULL OR vingerafdruk = ANY($2)) AND ($3::text[] IS NULL OR sleutel = ANY($3)) ORDER BY op DESC LIMIT 200`,
    [userId, filter.vingerafdrukken ?? null, filter.sleutels ?? null])).rows);
    return rijen.map((r: any) => wijzigingUit(r, userId));
  } catch (err) { console.error('[toegang] wijzigingen lezen mislukt:', (err as Error).message); return []; }
}
/** Eén wijziging van deze gebruiker, met de ruwe herstel- en sessiegegevens (alleen voor de server). */
export async function wijzigingMetHerstel(userId: string, id: unknown) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) fout('NIET_GEVONDEN', 404);
  const r = (await sys().query('SELECT * FROM app.toegang_wijzigingen WHERE id = $1 AND user_id = $2', [String(id), userId])).rows[0];
  if (!r) fout('NIET_GEVONDEN', 404);
  return { rij: wijzigingUit(r, userId), herstel: (r.herstel || null) as Record<string, unknown> | null, sessies: (r.sessies || {}) as { tab?: string; anker?: string; grant?: string }, sessieId: String(r.sessie_id || '') };
}
/** Markeer als teruggedraaid (eenmalig, atomisch). false = al teruggedraaid. */
export async function wijzigingOngedaanMaken(id: string, door: string, uitkomst: Record<string, unknown>): Promise<boolean> {
  const { rowCount } = await sys().query('UPDATE app.toegang_wijzigingen SET ongedaan_op = now(), ongedaan_door = $2, ongedaan_uitkomst = $3::jsonb WHERE id = $1 AND ongedaan_op IS NULL', [id, door.slice(0, 200), JSON.stringify(uitkomst)]);
  return (rowCount || 0) > 0;
}
/** Vingerafdrukken die via de app zijn ingetrokken: root voegt die alleen via SSH opnieuw toe (OPNIEUW_VIA_SSH). */
export async function viaAppIngetrokken(userId: string): Promise<Set<string>> {
  const r = await wijzigingenVoor(userId);
  return new Set(r.filter((w) => (w.soort === 'goedkeur-recht-ingetrokken' || w.soort === 'goedkeur-passkey-verwijderd') && w.vingerafdruk).map((w) => w.vingerafdruk));
}

// ------------------------------------------------------------------------------------------------ sessie intrekken («Це був не я»)
const TAB = 'owner_tab_sessions_v1', SESSIE = 'owner_service_sessions_v1', GRANT = 'owner_browser_grants_v1';
const zonderId = <T extends { id?: string }>(r: T) => { const { id: _id, ...rest } = r; return rest; };
/**
 * Trek de sessie in die de wijziging deed: tab-sessie (afgemeld), anker-sessie en onthouden browser. Niet de sessie waarin de
 * gebruiker nu «Це був не я» drukt. Geeft terug wat er is ingetrokken.
 */
export async function sessieIntrekken(userId: string, s: { tab?: string; anker?: string; grant?: string }, huidig: { sessieId: string; anker: string; grant: string }) {
  const nu = Date.now();
  const uit = { tab: false, anker: false, grant: false, overgeslagen: '' };
  if (s.tab && s.tab === huidig.sessieId) { uit.overgeslagen = 'huidige-sessie'; return uit; }
  if (s.anker && (s.anker === huidig.sessieId || s.anker === huidig.anker)) { uit.overgeslagen = 'huidige-sessie'; return uit; }
  if (s.tab) {
    const [t] = await db.get<any>(TAB, [s.tab]);
    if (t && t.userId === userId && t.status !== 'signed_out') { await db.update(TAB, [{ id: s.tab, record: { ...zonderId(t), status: 'signed_out', revokedAt: nu } }]); uit.tab = true; }
  }
  if (s.anker) {
    const [a] = await db.get<any>(SESSIE, [s.anker]);
    if (a && a.userId === userId && !a.revokedAt) { await db.update(SESSIE, [{ id: s.anker, record: { ...zonderId(a), revokedAt: nu } }]); uit.anker = true; }
  }
  if (s.grant && s.grant !== huidig.grant) {
    const [g] = await db.get<any>(GRANT, [s.grant]);
    if (g && g.userId === userId && !g.revokedAt) { await db.update(GRANT, [{ id: s.grant, record: { ...zonderId(g), revokedAt: nu } }]); uit.grant = true; }
  }
  return uit;
}
