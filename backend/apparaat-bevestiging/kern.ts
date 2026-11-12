// APPARAAT-001 — de kern: een verzoek «Це ви?» aanmaken, tonen, bekrachtigen op het andere apparaat, weigeren, intrekken.
//
// Rollen: A = het vragende apparaat (zit in «Підтвердіть доступ» zonder toegangssleutel); B = een ander, al aangemeld apparaat
// (andere browser = ander anker) dat het verzoek ziet. Op A en B staan DEZELFDE symbolen in dezelfde volgorde; alleen A ziet
// welk symbool is uitgelicht; B tikt het en bekrachtigt met zijn toegangssleutel (of, als de beheerder en de gebruiker dat
// toestaan, met een authenticator-code). Eén poging per verzoek. «Ні, це не я» werkt altijd meteen, zonder aftelling of sleutel.
//
// Alles hier is server-waarheid: de browser kan niets afdwingen. De juiste positie verlaat de server alleen naar A (en nooit
// naar B); de aftelling en de éne poging worden hier gecontroleerd; de step-up voor A wordt hier vastgelegd (stap-op.ts).
import { randomInt } from 'node:crypto';
import { apparaat as apparaatLabel } from '../../server/platform/audit';
import { auditToevoegen } from '../../server/platform/audit';
import { meld } from '../melder';
import { eigenaarUserId } from '../integraties-kluis';
import { brusselsTijd } from '../nieuw-apparaat';
import { passkeyStapOpGeldig, sterkeStapOpGeldig, stapOpVoorSessieVastleggen, stapOpSessieId, type StapOpAuth } from '../stap-op';
import { ACTIES } from '../toegang-context';
import { INGEBOUWDE_ACTIES } from '../../shared/telegram-aanmelden/beleid';
import { publiceer } from './stroom';
import { herstellen, instellingen, levendeApparaten, misluktTellen, misluktWissen, sql, vlagVoor, voorkeuren, voorkeurenOpslaan } from './opslag';
import { effectieveSoort, type ApparaatInstellingen, type MethodeB, type Stand, type Tekst, type VerzoekPubliek } from '../../shared/apparaat-bevestiging/model';
import { keuzeGeldig, trek, trekkingGeldig, type VasteSoort } from '../../shared/apparaat-bevestiging/symbolen';

export const BEVESTIGING_GELDIG_MS = 5 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{12}$/;
export type Auth = StapOpAuth & { user: { id: string; email?: string; role?: string } };

export type Rij = {
  id: string; user_id: string; sessie_a: string; anker_a: string; tab_hash_a: string; actie: string; label: string; dienst: string; gevoelig: boolean;
  apparaat_a: string; regio_a: string; set_versie: string; soort: VasteSoort; kandidaten: number[]; juist: number; aftel_sec: number; stand: Stand;
  methode_b: MethodeB | ''; sessie_b: string; apparaat_b: string; reden: string; aangemaakt_op: Date; verloopt_op: Date; bevestigd_op: Date | null; afgerond_op: Date | null;
};

const nieuweId = (): string => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'; let s = ''; for (let i = 0; i < 12; i++) s += a[randomInt(a.length)]; return s; };
const ankerVan = (auth: Auth): string => String(auth.session?.id || '');
/** Regio uit de koppen van de tunnel (land/stad); nooit het IP zelf. */
export function regioUit(headers: Record<string, string | undefined> | undefined): string {
  const h = (n: string) => String(headers?.[n] || headers?.[n.toLowerCase()] || '');
  const schoon = (v: string) => v.replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40);
  return [schoon(h('cf-ipcity')), schoon(h('cf-region')), schoon(h('cf-ipcountry'))].filter(Boolean).join(', ').slice(0, 120);
}
const ACTIE_RE = /^[a-z][a-z0-9-]{1,40}$/;
/** Naam voor het andere apparaat: eerst wat de gebruiker echt deed (label uit ACTIES), anders de handeling uit de bevestigingstabel. */
const actieNaam = (actie: string, label = ''): Tekst => {
  const a = (ACTIES as Record<string, readonly [string, string]>)[label] || (label ? null : (ACTIES as Record<string, readonly [string, string]>)[actie]);
  if (a) return [a[0], a[1]];
  const s = INGEBOUWDE_ACTIES.find((x) => x.sleutel === actie);
  return s ? [s.naam[0], s.naam[1]] : ['Підтвердження доступу', 'Toegang bevestigen'];
};

export function publiek(r: Rij, voorA: boolean, extra: Partial<VerzoekPubliek> = {}): VerzoekPubliek {
  return {
    id: r.id, actie: r.actie, actieNaam: actieNaam(r.actie, r.label), dienst: r.dienst, gevoelig: r.gevoelig, soort: r.soort, kandidaten: [...r.kandidaten],
    ...(voorA ? { juist: r.juist } : {}), stand: standNu(r), apparaatA: r.apparaat_a, regioA: r.regio_a, aftelSec: r.aftel_sec,
    aangemaaktOp: new Date(r.aangemaakt_op).toISOString(), verlooptOp: new Date(r.verloopt_op).toISOString(),
    methodeB: r.methode_b, apparaatB: r.apparaat_b, reden: r.reden, ...extra,
  };
}
const standNu = (r: Rij): Stand => (r.stand === 'wacht' && new Date(r.verloopt_op).getTime() < Date.now() ? 'verlopen' : r.stand);

async function audit(userId: string | null, actie: string, resultaat: string, details: Record<string, unknown> = {}): Promise<void> {
  await auditToevoegen({ ownerId: userId, actorId: userId, action: `apparaat.${actie}`.slice(0, 120), type: 'identity', result: resultaat, details }).catch(() => undefined);
}
async function siteMelding(userId: string, titel: Tekst, tekst: Tekst, link = '/aanmeldmethoden'): Promise<void> {
  await meld(userId, 'security', `${titel[0]} / ${titel[1]}`, `${tekst[0]} / ${tekst[1]}`, `https://id.tarasevych.com${link}`).catch(() => undefined);
}
async function beheerAlarm(soort: string, details: Record<string, unknown>, tekst: Tekst): Promise<void> {
  const eigenaar = await eigenaarUserId().catch(() => '');
  await auditToevoegen({ ownerId: eigenaar || null, action: `apparaat.alarm.${soort}`.slice(0, 120), type: 'identity', result: 'alarm', details }).catch(() => undefined);
  if (eigenaar) await meld(eigenaar, 'security', '🚨 Інший пристрій: тривога безпеки / Ander apparaat: beveiligingsalarm', `${tekst[0]} / ${tekst[1]}`, 'https://id.tarasevych.com/aanmeldmethoden-beheer').catch(() => undefined);
}

// ------------------------------------------------------------------------------------------------ beschikbaarheid
export type Beschikbaarheid = { ok: boolean; reden: '' | 'VLAG_UIT' | 'UITGESCHAKELD' | 'NIET_TOEGESTAAN' | 'METHODE_UIT' | 'METHODE_PAUZE' | 'GEEN_ANDER_APPARAAT'; apparaten: number; pauzeTot: string | null; inst: ApparaatInstellingen };
/** Kan deze gebruiker nu vanaf een ander apparaat bevestigen? Eerlijk: elke reden apart, zodat het venster het kan uitleggen. */
export async function beschikbaarheid(userId: string, rol: string | undefined, behalveAnker = ''): Promise<Beschikbaarheid> {
  const inst = await instellingen();
  const uit = (reden: Beschikbaarheid['reden'], apparaten = 0, pauzeTot: string | null = null): Beschikbaarheid => ({ ok: false, reden, apparaten, pauzeTot, inst });
  if (!(await vlagVoor(userId))) return uit('VLAG_UIT');
  if (!inst.aan) return uit('UITGESCHAKELD');
  if (inst.wieMag === 'eigenaar' && rol !== 'owner') return uit('NIET_TOEGESTAAN');
  const vk = await voorkeuren(userId);
  if (!vk.waarde.aan) return uit('UITGESCHAKELD');
  if (vk.uitgeschakeld) return uit('METHODE_UIT');
  if (vk.pauzeTot && new Date(vk.pauzeTot).getTime() > Date.now()) return uit('METHODE_PAUZE', 0, new Date(vk.pauzeTot).toISOString());
  const apparaten = (await levendeApparaten(userId, inst.levendMinuten, behalveAnker)).length;
  if (!apparaten) return uit('GEEN_ANDER_APPARAAT');
  return { ok: true, reden: '', apparaten, pauzeTot: null, inst };
}
/** Voor de poort van TELEGRAM-001 (beschikbaarVoor): één ja/nee zonder het eigen anker (de poort kent het verzoek niet). */
export const apparaatBeschikbaar = async (userId: string, rol?: string): Promise<boolean> => (await beschikbaarheid(userId, rol)).ok;

// ------------------------------------------------------------------------------------------------ A: aanvragen
export type Aanvraag = { /** handeling in de bevestigingstabel: 'stap-op' of een bewaakte handeling */ actie: string; /** wat de gebruiker echt deed (label uit ACTIES), alleen voor de tekst */ label?: string; dienst: string; ua?: string; headers?: Record<string, string | undefined>; gevoelig?: boolean };
export async function aanvragen(auth: Auth, a: Aanvraag): Promise<VerzoekPubliek> {
  const sessieA = stapOpSessieId(auth);
  if (!sessieA) throw new Error('SESSIE_ONBEKEND');
  const actie = ACTIE_RE.test(String(a.actie || '')) ? String(a.actie) : 'stap-op';
  const label = ACTIE_RE.test(String(a.label || '')) && String(a.label) in ACTIES ? String(a.label) : '';
  const b = await beschikbaarheid(auth.user.id, auth.user.role, ankerVan(auth));
  if (!b.ok) {
    const restPauze = b.reden === 'METHODE_PAUZE' && b.pauzeTot ? Math.max(1, Math.ceil((Date.parse(b.pauzeTot) - Date.now()) / 1000)) : 0;
    throw Object.assign(new Error(b.reden), restPauze > 0 ? { retryAfter: restPauze, pauzeTot: b.pauzeTot } : {});
  }
  const inst = b.inst;
  const [{ n, wacht }] = await sql<{ n: number; wacht: number | null }>("SELECT count(*)::int AS n, CEIL(EXTRACT(EPOCH FROM (min(aangemaakt_op) + interval '10 minutes' - now())))::int AS wacht FROM app.bevestigingen_apparaat WHERE user_id = $1 AND aangemaakt_op > now() - interval '10 minutes'", [auth.user.id]);
  if (n >= inst.maxPerTienMinuten) throw Object.assign(new Error('RATE_LIMITED'), { retryAfter: Math.max(1, Number(wacht || 60)), maxAttempts: inst.maxPerTienMinuten, windowSec: 600 });
  // Een nieuw verzoek van hetzelfde tabblad voor dezelfde handeling vervangt het vorige: nooit twee kaarten voor één vraag.
  const vorige = await sql<{ id: string }>("UPDATE app.bevestigingen_apparaat SET stand = 'ingetrokken', reden = 'vervangen', afgerond_op = now() WHERE user_id = $1 AND sessie_a = $2 AND actie = $3 AND stand = 'wacht' RETURNING id", [auth.user.id, sessieA, actie]);
  for (const v of vorige) publiceer(auth.user.id, { soort: 'apparaat.afgerond', id: v.id, stand: 'ingetrokken' });
  const vk = await voorkeuren(auth.user.id);
  const trekking = trek(effectieveSoort(inst, vk.waarde), inst.aantalKandidaten, randomInt);
  const gevoelig = a.gevoelig === true;
  const id = nieuweId();
  const verloopt = new Date(Date.now() + inst.wachtSeconden * 1000);
  const apparaatA = (apparaatLabel(a.ua) || 'onbekend/onbekend').slice(0, 40);
  const regioA = regioUit(a.headers);
  await sql(`INSERT INTO app.bevestigingen_apparaat (id, user_id, sessie_a, anker_a, tab_hash_a, actie, label, dienst, gevoelig, apparaat_a, regio_a, soort, kandidaten, juist, aftel_sec, verloopt_op)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [id, auth.user.id, sessieA, ankerVan(auth), String(auth.tabSession?.id || '').slice(0, 80), actie, label, String(a.dienst || '').slice(0, 20), gevoelig, apparaatA, regioA,
      trekking.soort, trekking.kandidaten, trekking.juist, gevoelig ? inst.aftelSecondenGevoelig : inst.aftelSeconden, verloopt]);
  const rij = await rijVan(id);
  if (!rij) throw new Error('VERZOEK_ONBEKEND');
  await audit(auth.user.id, 'aangevraagd', 'pending', { id, actie, soort: trekking.soort, apparaten: b.apparaten });
  // Naar alle andere browsers van dit account (niet naar het anker van A zelf): zwevend venster of regel in het meldingencentrum.
  publiceer(auth.user.id, { soort: 'apparaat.verzoek', verzoek: publiek(rij, false) }, { behalveAnker: ankerVan(auth) });
  if (vk.waarde.toonAls === 'melding') {
    await siteMelding(auth.user.id, ['Це ви? Підтвердьте дію з цього пристрою', 'Bent u het? Bevestig de handeling vanaf dit apparaat'],
      [`Пристрій «${apparaatA}»${regioA ? ` (${regioA})` : ''} просить підтвердити: ${actieNaam(actie, label)[0]} · ${brusselsTijd(Date.now(), 'uk')} (Брюссель). Відкрийте запит і натисніть символ, виділений на тому екрані.`,
        `Apparaat «${apparaatA}»${regioA ? ` (${regioA})` : ''} vraagt bevestiging: ${actieNaam(actie, label)[1]} · ${brusselsTijd(Date.now(), 'nl')} (Brussel). Open het verzoek en tik het symbool dat daar is uitgelicht.`], `/aanmeldmethoden?bevestiging=${id}`);
  }
  return publiek(rij, true, { apparaten: b.apparaten });
}

const rijVan = async (id: string): Promise<Rij | null> => (ID_RE.test(id) ? (await sql<Rij>('SELECT * FROM app.bevestigingen_apparaat WHERE id = $1', [id]))[0] ?? null : null);

/** A kijkt naar de stand van zijn eigen verzoek (alleen dezelfde gebruiker én dezelfde sessie). */
export async function stand(auth: Auth, id: string): Promise<VerzoekPubliek> {
  const r = await rijVan(id);
  if (!r || r.user_id !== auth.user.id || r.sessie_a !== stapOpSessieId(auth)) throw new Error('VERZOEK_ONBEKEND');
  if (r.stand === 'wacht' && new Date(r.verloopt_op).getTime() < Date.now()) {
    await sql("UPDATE app.bevestigingen_apparaat SET stand = 'verlopen', afgerond_op = now() WHERE id = $1 AND stand = 'wacht'", [id]);
    r.stand = 'verlopen';
  }
  const inst = await instellingen();
  return publiek(r, true, { apparaten: (await levendeApparaten(auth.user.id, inst.levendMinuten, ankerVan(auth))).length });
}
/** A trekt zijn verzoek in («Скасувати»). */
export async function intrekken(auth: Auth, id: string): Promise<void> {
  const r = await rijVan(id);
  if (!r || r.user_id !== auth.user.id || r.sessie_a !== stapOpSessieId(auth)) throw new Error('VERZOEK_ONBEKEND');
  const upd = await sql("UPDATE app.bevestigingen_apparaat SET stand = 'ingetrokken', reden = 'door-a', afgerond_op = now() WHERE id = $1 AND stand = 'wacht' RETURNING id", [id]);
  if (upd.length) { await audit(auth.user.id, 'ingetrokken', 'ok', { id }); publiceer(auth.user.id, { soort: 'apparaat.afgerond', id, stand: 'ingetrokken' }); }
}

// ------------------------------------------------------------------------------------------------ B: open verzoeken, bekrachtigen, weigeren
/** Open verzoeken voor dit account die een ANDER anker stelde (nooit het juiste symbool mee). */
export async function open(auth: Auth): Promise<{ verzoeken: VerzoekPubliek[]; totp: boolean; geluid: boolean; toonAls: 'venster' | 'melding' }> {
  const rijen = await sql<Rij>("SELECT * FROM app.bevestigingen_apparaat WHERE user_id = $1 AND stand = 'wacht' AND verloopt_op > now() ORDER BY aangemaakt_op DESC LIMIT 5", [auth.user.id]);
  const anker = ankerVan(auth);
  const [inst, vk] = await Promise.all([instellingen(), voorkeuren(auth.user.id)]);
  return {
    verzoeken: rijen.filter((r) => !anker || r.anker_a !== anker).filter((r) => trekkingGeldig(r.soort, r.kandidaten, r.juist)).map((r) => publiek(r, false)),
    totp: inst.totpToegestaan && vk.waarde.totpOpApparaat, geluid: vk.waarde.geluid, toonAls: vk.waarde.toonAls,
  };
}

export type Bekrachtiging = { ok: true; stand: 'bevestigd' } | { ok: false; stand: 'geweigerd'; uitkomst: 'fout' | 'pauze' | 'uit' };
/**
 * B tikt een symbool. Volgorde: eigen verzoek · nog open · ander anker · aftelling voorbij · geldige positie · bekrachtigd met
 * toegangssleutel (of authenticator-code als toegestaan) · dan ÉÉN atomische update: juist → bevestigd, anders → geweigerd.
 */
export async function bekrachtigen(auth: Auth, id: string, keuze: unknown, ua?: string): Promise<Bekrachtiging> {
  const r = await rijVan(id);
  if (!r || r.user_id !== auth.user.id) throw new Error('VERZOEK_ONBEKEND');
  if (r.stand !== 'wacht') throw new Error('AL_AFGEROND');
  if (new Date(r.verloopt_op).getTime() < Date.now()) { await sql("UPDATE app.bevestigingen_apparaat SET stand = 'verlopen', afgerond_op = now() WHERE id = $1 AND stand = 'wacht'", [id]); throw new Error('VERLOPEN'); }
  if (ankerVan(auth) && r.anker_a === ankerVan(auth)) throw new Error('ZELFDE_APPARAAT');
  const rest = new Date(r.aangemaakt_op).getTime() + r.aftel_sec * 1000 - 250 - Date.now();
  if (rest > 0) throw new Error('TE_SNEL');
  if (!keuzeGeldig(keuze, r.kandidaten.length)) throw new Error('KEUZE_ONGELDIG');
  const inst = await instellingen();
  const vk = await voorkeuren(auth.user.id);
  let methode: MethodeB | '' = '';
  if (await passkeyStapOpGeldig(auth)) methode = 'passkey';
  else if (inst.totpToegestaan && vk.waarde.totpOpApparaat && (await sterkeStapOpGeldig(auth))) methode = 'totp';
  if (!methode) throw new Error('STEP_UP_PASSKEY_REQUIRED');
  const apparaatB = (apparaatLabel(ua) || 'onbekend/onbekend').slice(0, 40);
  const sessieB = stapOpSessieId(auth).slice(0, 80);
  const juist = keuze === r.juist;
  const upd = await sql<{ id: string }>(`UPDATE app.bevestigingen_apparaat SET stand = $2, methode_b = $3, sessie_b = $4, apparaat_b = $5, reden = $6,
    bevestigd_op = CASE WHEN $2 = 'bevestigd' THEN now() ELSE NULL END, afgerond_op = now() WHERE id = $1 AND stand = 'wacht' RETURNING id`,
    [id, juist ? 'bevestigd' : 'geweigerd', methode, sessieB, apparaatB, juist ? '' : 'fout-symbool']);
  if (!upd.length) throw new Error('AL_AFGEROND');
  if (juist) {
    // De step-up voor A wordt NIET hier gezet: A haalt hem zelf op via POST /api/owner/access/stap-op/poort, dat de hele eis
    // van de bevestigingstabel voor «stap-op» beoordeelt (misschien is er ook nog een geheime code nodig). Zo is er één poort.
    await misluktWissen(auth.user.id);
    await audit(auth.user.id, 'bevestigd', 'success', { id, actie: r.actie, methodeB: methode, apparaatA: r.apparaat_a, apparaatB });
    publiceer(auth.user.id, { soort: 'apparaat.afgerond', id, stand: 'bevestigd' });
    return { ok: true, stand: 'bevestigd' };
  }
  const t = await misluktTellen(auth.user.id, inst);
  await audit(auth.user.id, 'fout-symbool', 'denied', { id, actie: r.actie, mislukt: t.mislukt, uitkomst: t.uitkomst });
  publiceer(auth.user.id, { soort: 'apparaat.afgerond', id, stand: 'geweigerd' });
  if (t.uitkomst === 'uit') {
    await siteMelding(auth.user.id, ['Підтвердження з іншого пристрою вимкнено', 'Bevestigen vanaf een ander apparaat uitgeschakeld'],
      [`Неправильний символ обрано ${t.mislukt} разів. Спосіб вимкнено, доки ви не відновите його ключем доступу у «Способах входу».`, `${t.mislukt} keer een verkeerd symbool. De methode staat uit tot u hem herstelt met uw toegangssleutel bij «Aanmeldmethoden».`]);
    await beheerAlarm('symbool-uit', { userId: auth.user.id, mislukt: t.mislukt }, ['Підтвердження з іншого пристрою вимкнено після забагатьох неправильних символів.', 'Bevestigen vanaf een ander apparaat uitgeschakeld na te veel verkeerde symbolen.']);
  }
  return { ok: false, stand: 'geweigerd', uitkomst: t.uitkomst };
}

/** «Ні, це не я» op B: meteen, zonder aftelling of sleutel. Blokkeert niets zelf, maar waarschuwt luid (zoals Telegram). */
export async function weigeren(auth: Auth, id: string, ua?: string): Promise<void> {
  const r = await rijVan(id);
  if (!r || r.user_id !== auth.user.id) throw new Error('VERZOEK_ONBEKEND');
  const upd = await sql("UPDATE app.bevestigingen_apparaat SET stand = 'geweigerd', reden = 'niet-ik', sessie_b = $2, apparaat_b = $3, afgerond_op = now() WHERE id = $1 AND stand = 'wacht' RETURNING id",
    [id, stapOpSessieId(auth).slice(0, 80), (apparaatLabel(ua) || 'onbekend/onbekend').slice(0, 40)]);
  if (!upd.length) throw new Error('AL_AFGEROND');
  await audit(auth.user.id, 'niet-ik', 'denied', { id, actie: r.actie, apparaatA: r.apparaat_a, regioA: r.regio_a });
  publiceer(auth.user.id, { soort: 'apparaat.afgerond', id, stand: 'geweigerd' });
  await siteMelding(auth.user.id, ['⛔ Запит з іншого пристрою відхилено', '⛔ Verzoek van een ander apparaat geweigerd'],
    [`Ви натиснули «Це не я» на запит з пристрою «${r.apparaat_a}»${r.regio_a ? ` (${r.regio_a})` : ''}. Якщо ви нічого там не робили — завершіть чужі сеанси й перевірте ключі доступу.`,
      `U tikte «Dit ben ik niet» bij een verzoek van apparaat «${r.apparaat_a}»${r.regio_a ? ` (${r.regio_a})` : ''}. Deed u daar niets, beëindig dan vreemde sessies en controleer uw toegangssleutels.`], '/sessions');
  await beheerAlarm('niet-ik', { userId: auth.user.id, actie: r.actie, apparaatA: r.apparaat_a }, ['Користувач відхилив запит підтвердження з іншого пристрою.', 'Een gebruiker weigerde een bevestigingsverzoek van een ander apparaat.']);
}

// ------------------------------------------------------------------------------------------------ poort van TELEGRAM-001
/** Is er voor deze sessie + handeling een verse bevestiging vanaf een ander apparaat (nog niet gebruikt)? */
export async function voldaan(userId: string, sessieId: string, actie: string, nu = Date.now()): Promise<boolean> {
  if (!sessieId) return false;
  const r = await sql<{ id: string }>("SELECT id FROM app.bevestigingen_apparaat WHERE user_id = $1 AND sessie_a = $2 AND actie = $3 AND stand = 'bevestigd' AND bevestigd_op > $4 LIMIT 1", [userId, sessieId, actie, new Date(nu - BEVESTIGING_GELDIG_MS)]);
  return r.length > 0;
}
/** Na een geslaagde bewaakte handeling: de bevestiging is verbruikt (eenmalig). */
export async function verbruik(userId: string, sessieId: string, actie: string): Promise<void> {
  if (!sessieId) return;
  await sql("UPDATE app.bevestigingen_apparaat SET stand = 'gebruikt' WHERE user_id = $1 AND sessie_a = $2 AND actie = $3 AND stand = 'bevestigd'", [userId, sessieId, actie]);
}

/**
 * Klassieke step-up voor A nadat de poort van TELEGRAM-001 de handeling «stap-op» heeft goedgekeurd (routes.ts, /stap-op/poort).
 * Kiest de sterkste bron: een bevestiging vanaf een ander apparaat met toegangssleutel (sterk, als de beheerder dat toestaat),
 * anders Telegram (nooit sterk). Geeft de vastgelegde methode terug, of '' als er niets te leggen was.
 */
export async function stapOpNaPoort(auth: Auth, voldaanMethoden: ReadonlySet<string>): Promise<'apparaat' | 'telegram' | ''> {
  const sessie = stapOpSessieId(auth);
  if (!sessie) return '';
  if (voldaanMethoden.has('apparaat')) {
    const [r] = await sql<{ methode_b: string }>("SELECT methode_b FROM app.bevestigingen_apparaat WHERE user_id = $1 AND sessie_a = $2 AND actie = 'stap-op' AND stand = 'bevestigd' ORDER BY bevestigd_op DESC LIMIT 1", [auth.user.id, sessie]);
    const inst = await instellingen();
    await stapOpVoorSessieVastleggen(auth.user.id, sessie, 'apparaat', { sterk: r?.methode_b === 'passkey' && inst.sterkBijPasskey });
    await audit(auth.user.id, 'stap-op', 'success', { methode: 'apparaat', sterk: r?.methode_b === 'passkey' && inst.sterkBijPasskey });
    return 'apparaat';
  }
  if (voldaanMethoden.has('telegram')) {
    await stapOpVoorSessieVastleggen(auth.user.id, sessie, 'telegram');
    await audit(auth.user.id, 'stap-op', 'success', { methode: 'telegram' });
    return 'telegram';
  }
  return '';
}

// ------------------------------------------------------------------------------------------------ gebruiker: overzicht, voorkeuren, herstel
export async function overzicht(auth: Auth) {
  const inst = await instellingen();
  const vk = await voorkeuren(auth.user.id);
  const b = await beschikbaarheid(auth.user.id, auth.user.role, ankerVan(auth));
  const recent = await sql<Rij>('SELECT * FROM app.bevestigingen_apparaat WHERE user_id = $1 ORDER BY aangemaakt_op DESC LIMIT 20', [auth.user.id]);
  return {
    vlag: await vlagVoor(auth.user.id),
    beheer: { aan: inst.aan, wachtSeconden: inst.wachtSeconden, aftelSeconden: inst.aftelSeconden, aftelSecondenGevoelig: inst.aftelSecondenGevoelig, symbolenStandaard: inst.symbolenStandaard, aantalKandidaten: inst.aantalKandidaten, totpToegestaan: inst.totpToegestaan, sterkBijPasskey: inst.sterkBijPasskey, telegramSymbolen: inst.telegramSymbolen, levendMinuten: inst.levendMinuten, wieMag: inst.wieMag },
    voorkeuren: vk.waarde,
    teller: { mislukt: vk.mislukt, pauzeTot: vk.pauzeTot ? new Date(vk.pauzeTot).toISOString() : null, uitgeschakeld: vk.uitgeschakeld, reden: vk.reden },
    beschikbaar: b.ok, reden: b.reden, apparaten: await levendeApparaten(auth.user.id, inst.levendMinuten, ankerVan(auth)).then((l) => l.map((x) => ({ laatstGezien: new Date(x.laatstGezien).toISOString(), dienst: x.dienst }))),
    recent: recent.map((r) => ({ ...publiek(r, true), juist: undefined })),
  };
}
export async function voorkeurenZetten(auth: Auth, invoer: unknown) { return voorkeurenOpslaan(auth.user.id, invoer); }
/** Herstel na «uit»: alleen met een verse toegangssleutel op DEZE sessie (de route controleert dat vóór de aanroep). */
export async function herstelNaSleutel(auth: Auth): Promise<void> { await herstellen(auth.user.id); await audit(auth.user.id, 'hersteld', 'success'); }

// ------------------------------------------------------------------------------------------------ beheer
export async function beheerOverzicht() {
  const inst = await instellingen();
  const [c] = await sql<{ dag: number; week: number; bevestigd: number; geweigerd: number; nietIk: number }>(`SELECT
    count(*) FILTER (WHERE aangemaakt_op > now() - interval '1 day')::int AS dag,
    count(*) FILTER (WHERE aangemaakt_op > now() - interval '7 days')::int AS week,
    count(*) FILTER (WHERE stand IN ('bevestigd','gebruikt') AND aangemaakt_op > now() - interval '7 days')::int AS bevestigd,
    count(*) FILTER (WHERE stand = 'geweigerd' AND reden = 'fout-symbool' AND aangemaakt_op > now() - interval '7 days')::int AS geweigerd,
    count(*) FILTER (WHERE stand = 'geweigerd' AND reden = 'niet-ik' AND aangemaakt_op > now() - interval '7 days')::int AS "nietIk"
    FROM app.bevestigingen_apparaat`);
  const [uit] = await sql<{ n: number }>('SELECT count(*)::int AS n FROM app.apparaat_voorkeuren WHERE uitgeschakeld').catch(() => [{ n: 0 }]);
  const [vorige] = await sql<{ id: string }>("SELECT id FROM app.apparaat_instellingen WHERE id = 'vorige'").catch(() => []);
  return { instellingen: inst, cijfers: { ...c, uitgeschakeldeAccounts: Number(uit?.n || 0) }, ongedaanMogelijk: !!vorige };
}

/** Opruimen (achtergrond): verlopen verzoeken sluiten, oude rijen weg (30 dagen). Nooit iets anders. */
export async function opruimen(): Promise<void> {
  await sql("UPDATE app.bevestigingen_apparaat SET stand = 'verlopen', afgerond_op = now() WHERE stand = 'wacht' AND verloopt_op < now()").catch(() => undefined);
  await sql("DELETE FROM app.bevestigingen_apparaat WHERE aangemaakt_op < now() - interval '30 days'").catch(() => undefined);
}
