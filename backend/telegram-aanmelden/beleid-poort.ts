// TELEGRAM-AANMELDEN v1 — DE centrale poort. Elke bewaakte route roept poort() aan via bewaakt(); er bestaat geen andere weg.
// tests/eenheid/telegram-beleid-poort.test.ts somt alle routes van backend/telegram-aanmelden/routes.ts op en faalt als een
// niet-publieke route niet door bewaakt() of alleenSessie() (lezen van eigen gegevens) loopt.
//
// Wat telt als «voldaan» voor een handeling in DEZE sessie:
//   toegangssleutel  — passkeyStapOpGeldig (backend/stap-op.ts): binnen 5 minuten op deze sessie met een eigen toegangssleutel bevestigd.
//              Google, TOTP, herstelcode of «onthouden browser» tellen NIET (gevoelige handelingen: punt D).
//   telegram — een rij in app.tg_bevestigingen (methode telegram) voor dezelfde gebruiker + sessie + handeling, bevestigd binnen
//              5 minuten met een tik in Telegram op een eenmalige knop, nog niet gebruikt;
//   code     — idem met methode code (geheime code op de site ingevoerd, nooit in de chat).
// Een sessie die via Telegram is aangemaakt krijgt GEEN extra bevestiging (backend/index.ts geeft voor Telegram geen Google-tijd door),
// dus alles wat gevoelig is vraagt daar vanzelf nog een toegangssleutel.
import { passkeyStapOpGeldig, stapOpSessieId, type StapOpAuth } from '../stap-op';
import { actieSoorten, instellingen, sql } from './opslag';
import { beoordeel, werkelijkeEis, type ActieSoort, type Beoordeling, type KeuzeId, type Methode } from '../../shared/telegram-aanmelden/beleid';

export const BEVESTIGING_GELDIG_MS = 5 * 60 * 1000;
export type PoortAuth = StapOpAuth & { user: { id: string; role?: string; email?: string } };

export async function keuzesVan(userId: string): Promise<Record<string, KeuzeId>> {
  const [r] = await sql<{ keuzes: Record<string, KeuzeId> }>('SELECT keuzes FROM app.tg_matrix WHERE user_id = $1', [userId]);
  return r?.keuzes && typeof r.keuzes === 'object' ? r.keuzes : {};
}

export async function soortVan(actie: string): Promise<ActieSoort | null> {
  return (await actieSoorten()).find((s) => s.sleutel === actie) ?? null;
}

export async function eisVoor(userId: string, actie: string) {
  const soort = await soortVan(actie);
  if (!soort) return null;
  const inst = await instellingen();
  const keuzes = await keuzesVan(userId);
  return { soort, eis: werkelijkeEis(soort, keuzes[actie], { codeVerplicht: inst.code.verplichtVoor.includes(actie) }) };
}

/** Welke methoden heeft deze gebruiker en werken ze nu? (eerlijk: een methode in storing telt niet als beschikbaar) */
export async function beschikbaarVoor(userId: string): Promise<Set<Methode>> {
  const uit = new Set<Methode>();
  const inst = await instellingen();
  const [tg] = await sql("SELECT count(*)::int AS n FROM app.tg_koppelingen WHERE user_id = $1 AND stand = 'actief' AND 'bevestigen' = ANY(rechten)", [userId]);
  const [st] = await sql<{ stand: string; soort: string }>("SELECT stand, soort FROM app.tg_status WHERE methode = 'telegram'");
  const telegramWerkt = !st || st.stand === 'werkt' || st.stand === 'traag' || st.stand === 'onbekend';
  const [c] = await sql<{ uitgeschakeld: boolean; pauze_tot: Date | null; reden: string }>('SELECT uitgeschakeld, pauze_tot, reden FROM app.tg_geheime_codes WHERE user_id = $1', [userId]);
  // Te veel foute codes of een code in de chat gezien: Telegram-bevestiging staat uit tot een aanmelding met toegangssleutel (punt F).
  const telegramGesloten = !!c && c.uitgeschakeld && (c.reden === 'te-veel-pogingen' || c.reden === 'in-chat-gezien' || c.reden === 'alarm');
  if (inst.aan && Number(tg?.n || 0) > 0 && telegramWerkt && !telegramGesloten) uit.add('telegram');
  const [pk] = await sql('SELECT count(*)::int AS n FROM app.passkeys WHERE user_id = $1', [userId]).catch(() => [{ n: 0 }]);
  if (Number(pk?.n || 0) > 0) uit.add('passkey');
  if (c && !c.uitgeschakeld && (!c.pauze_tot || new Date(c.pauze_tot).getTime() < Date.now())) uit.add('code');
  return uit;
}

export async function voldaanVoor(auth: PoortAuth, actie: string, nu = Date.now()): Promise<Set<Methode>> {
  const uit = new Set<Methode>();
  if (await passkeyStapOpGeldig(auth, nu)) uit.add('passkey');
  const sessie = stapOpSessieId(auth);
  if (sessie) {
    const rijen = await sql<{ methode: Methode }>(`SELECT DISTINCT methode FROM app.tg_bevestigingen WHERE user_id = $1 AND sessie_id = $2 AND actie = $3
      AND stand = 'bevestigd' AND bevestigd_op > $4`, [auth.user.id, sessie, actie, new Date(nu - BEVESTIGING_GELDIG_MS)]);
    for (const r of rijen) uit.add(r.methode);
  }
  return uit;
}

export type PoortUitkomst = { ok: true; beoordeling: Beoordeling } | { ok: false; status: number; fout: string; beoordeling: Beoordeling | null };

/** DE beslissing. Volgorde: onbekende handeling → weigeren; dan beoordeel(); toegangssleutel eerst (de browser opent het venster vanzelf). */
export async function poort(auth: PoortAuth, actie: string): Promise<PoortUitkomst> {
  const e = await eisVoor(auth.user.id, actie);
  if (!e) return { ok: false, status: 400, fout: 'ONBEKENDE_ACTIE', beoordeling: null };
  const b = beoordeel(e.eis, await voldaanVoor(auth, actie), await beschikbaarVoor(auth.user.id));
  if (b.toegestaan) return { ok: true, beoordeling: b };
  if (b.geblokkeerd) return { ok: false, status: 409, fout: 'METHODE_ONBESCHIKBAAR', beoordeling: b };
  if (b.ontbreekt.includes('passkey')) return { ok: false, status: 403, fout: 'STEP_UP_PASSKEY_REQUIRED', beoordeling: b };
  return { ok: false, status: 403, fout: 'TELEGRAM_BEVESTIGING_NODIG', beoordeling: b };
}

/** Na een geslaagde handeling: Telegram- en codebevestigingen voor deze handeling zijn verbruikt (eenmalig). */
export async function verbruik(auth: PoortAuth, actie: string): Promise<void> {
  const sessie = stapOpSessieId(auth);
  if (!sessie) return;
  await sql("UPDATE app.tg_bevestigingen SET stand = 'gebruikt' WHERE user_id = $1 AND sessie_id = $2 AND actie = $3 AND stand = 'bevestigd'", [auth.user.id, sessie, actie]);
}

/** Merkteken op routes die door de poort lopen (de test leest het uit). */
export const BEWAAKT = Symbol.for('telegram-aanmelden.bewaakt');
export const ALLEEN_SESSIE = Symbol.for('telegram-aanmelden.alleen-sessie');
export const OPENBAAR = Symbol.for('telegram-aanmelden.openbaar');
