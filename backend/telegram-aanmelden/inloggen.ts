// TELEGRAM-AANMELDEN v1 — aanmelden met Telegram (punt B + D).
// De site start een gewone aanmeldtransactie (zelfde tabel en zelfde voltooiing als Google: backend/index.ts) en koppelt daar een
// Telegram-verzoek aan: id (12 tekens, publiek in de directe verwijzing) + geheim (32 bytes, alleen in deze browser, als sha256 bewaard).
// Goedkeuren gebeurt in Telegram met een eenmalige, ondertekende knop (of via het officiële aanmeldvenster); de sessie maakt
// uitsluitend de browser met het geheim én de bindingscookie van de transactie. Een Telegram-aanmelding geeft GEEN extra bevestiging.
import { createHash } from 'node:crypto';
import { apparaat as apparaatLabel } from '../../server/platform/audit';
import { getPool } from '../../server/platform/pg';
import { apparaatSleutel, brusselsTijd } from '../nieuw-apparaat';
import { botSleutel } from './sleutels';
import { eenmaligClaimen, gebeurtenis, instellingen, koppeling as koppelingLezen, koppelingenVanTelegram, sql, vlagHoofdschakelaar, vlagVoor, type KoppelRij } from './opslag';
import { gelijk, nieuweId, nieuwGeheim, sha256hex, widgetControle } from './cryptografie';
import { codeControleren } from './code';
import { beschikbaarVoor, eisVoor } from './beleid-poort';
import { vingerafdrukControleren } from './wijzigingen';
import { accountNaam, audit, beheerAlarm, siteMelding, tijdTekst } from './meldingen';
import { knoppenMaken, stuur, strook, succesTonen, taalVoor, type BotTaal, type Knop } from './berichten';
import { deeplink, magTelegram, type TgGebruiker } from './koppelen';
import { invullen, t, TEKST } from '../../shared/telegram-aanmelden/teksten';
import type { Eis, Methode } from '../../shared/telegram-aanmelden/beleid';

export const INLOG_MINUTEN = 3;
const ID_RE = /^[A-Za-z0-9_-]{12}$/;

type InlogRij = { id: string; geheim_hash: string; transactie_id: string; apparaat: string; telegram_id: string | null; user_id: string | null; koppeling_id: string | null;
  stand: 'wacht' | 'goedgekeurd' | 'geweigerd' | 'verlopen' | 'ingewisseld'; code_nodig: boolean; code_ok: boolean; verloopt_op: Date; sessie_id: string | null; methode: string; reden: string };
const inlog = async (id: string): Promise<InlogRij | null> => (ID_RE.test(id) ? (await sql<InlogRij>('SELECT * FROM app.tg_inlog_verzoeken WHERE id = $1', [id]))[0] ?? null : null);
const verlopen = (r: InlogRij): boolean => new Date(r.verloopt_op).getTime() < Date.now();

/** Welke stand heeft de methode volgens de statusdienst? (voor eerlijke uitleg vóór de start) */
export async function methodeStand(): Promise<{ stand: string; soort: string; oorzaak: string }> {
  const [r] = await sql<{ stand: string; soort: string; oorzaak: string }>("SELECT stand, soort, oorzaak FROM app.tg_status WHERE methode = 'telegram'");
  return r ?? { stand: 'onbekend', soort: '', oorzaak: '' };
}

/** Publiek (aanmeldscherm): mag de Telegram-knop getoond worden, en hoe heet de bot? Nooit iets geheims. */
export async function publiekeConfig(): Promise<{ zichtbaar: boolean; bot: string; botId: string; stand: string; soort: string }> {
  const inst = await instellingen();
  const zichtbaar = (await vlagHoofdschakelaar()) && inst.aan && inst.wieMag !== 'niemand' && !!(await botSleutel());
  const s = await methodeStand();
  const sleutel = zichtbaar ? await botSleutel() : '';
  return { zichtbaar, bot: inst.botGebruikersnaam, botId: sleutel.split(':')[0] || '', stand: s.stand, soort: s.soort };
}

/** Start (publiek, vóór de sessie). transactieId = id van de aanmeldtransactie die backend/index.ts net aanmaakte. */
export async function inlogStart(transactieId: string, ua: string): Promise<{ id: string; geheim: string; deeplink: string; bot: string; verlooptOp: string }> {
  const cfg = await publiekeConfig();
  if (!cfg.zichtbaar) throw new Error('TELEGRAM_UIT');
  if (cfg.stand === 'storing' && cfg.soort !== 'tijdelijk') throw new Error(cfg.soort === 'vast' ? 'METHODE_STORING_VAST' : 'METHODE_STORING_LANG');
  const id = nieuweId();
  const geheim = nieuwGeheim();
  const verloopt = new Date(Date.now() + INLOG_MINUTEN * 60_000);
  await sql('INSERT INTO app.tg_inlog_verzoeken (id, geheim_hash, transactie_id, apparaat, verloopt_op) VALUES ($1,$2,$3,$4,$5)',
    [id, sha256hex(geheim), transactieId, (apparaatLabel(ua) || 'onbekend/onbekend').slice(0, 80), verloopt]);
  return { id, geheim, deeplink: deeplink(cfg.bot, `i_${id}`), bot: cfg.bot, verlooptOp: verloopt.toISOString() };
}

const geheimKlopt = (r: InlogRij, geheim: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(geheim) && gelijk(r.geheim_hash, sha256hex(geheim));

// ------------------------------------------------------------------------------------------------ welke accounts mogen
type Kandidaat = { k: KoppelRij; naam: string };
/** Actieve koppelingen van deze Telegram met recht «aanmelden», na de vingerafdrukcontrole en zonder geblokkeerd apparaat. */
async function kandidaten(telegramId: string, profiel: { gebruikersnaam?: string; voornaam?: string; achternaam?: string }, apparaat: string, bron: string): Promise<{ lijst: Kandidaat[]; gepauzeerd: number; geblokkeerd: number }> {
  const lijst: Kandidaat[] = [];
  let gepauzeerd = 0;
  let geblokkeerd = 0;
  for (const k of await koppelingenVanTelegram(telegramId)) {
    if (!k.rechten.includes('aanmelden')) continue;
    if (!(await vlagVoor(k.user_id))) continue;
    if (k.stand !== 'actief') { gepauzeerd++; continue; }
    const c = await vingerafdrukControleren(k, { telegramId, gebruikersnaam: profiel.gebruikersnaam ?? '', voornaam: profiel.voornaam ?? '', achternaam: profiel.achternaam ?? '' }, bron);
    if (c.soort !== 'gelijk') { gepauzeerd++; continue; }
    const [geblokt] = await sql('SELECT 1 FROM app.tg_geblokkeerd WHERE user_id = $1 AND sleutel = $2', [k.user_id, apparaat]);
    if (geblokt) { geblokkeerd++; continue; }
    const u = await gebruikerVan(k.user_id);
    if (!u || (await magTelegram(u))) continue;
    lijst.push({ k, naam: (await accountNaam(k.user_id)) || k.naam });
  }
  return { lijst, gepauzeerd, geblokkeerd };
}
async function gebruikerVan(userId: string): Promise<{ id: string; role?: string; status?: string; email?: string } | null> {
  const r = await getPool('systeem').query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [userId]).catch(() => ({ rows: [] as Array<{ data: Record<string, unknown> }> }));
  const d = r.rows[0]?.data as Record<string, unknown> | undefined;
  if (!d || d.deletedAt || d.status === 'blocked' || d.status === 'deleted') return null;
  return { id: userId, role: String(d.role || ''), status: String(d.status || ''), email: String(d.email || '') };
}

/** Kan dit account met Telegram (± geheime code) aan de eisen voldoen? Toegangssleutel kan hier nooit (die hoort bij een andere weg). */
export function telegramWegVoor(eisen: Eis[], beschikbaar: ReadonlySet<Methode>): { kan: boolean; code: boolean } {
  let code = false;
  for (const eis of eisen) {
    const opties = eis.filter((a) => a.every((m) => m === 'telegram' || (m === 'code' && beschikbaar.has('code'))));
    if (!opties.length) return { kan: false, code: false };
    if (!opties.some((a) => !a.includes('code'))) code = true;
  }
  return { kan: true, code };
}
async function apparaatBekend(userId: string, label: string): Promise<boolean> {
  const r = await getPool('systeem').query('SELECT 1 FROM app.bekende_apparaten WHERE user_id = $1 AND sleutel = $2', [userId, apparaatSleutel(userId, label)]).catch(() => ({ rows: [] }));
  return r.rows.length > 0;
}
export async function eisenVoorAanmelden(userId: string, label: string): Promise<{ kan: boolean; code: boolean; nieuwApparaat: boolean }> {
  const eisen: Eis[] = [];
  const a = await eisVoor(userId, 'aanmelden');
  if (a) eisen.push(a.eis);
  const nieuwApparaat = !(await apparaatBekend(userId, label));
  if (nieuwApparaat) { const n = await eisVoor(userId, 'nieuw-apparaat'); if (n) eisen.push(n.eis); }
  return { ...telegramWegVoor(eisen, await beschikbaarVoor(userId)), nieuwApparaat };
}

// ------------------------------------------------------------------------------------------------ bot: /start i_<id>
export async function inlogVanBot(id: string, van: TgGebruiker, chatId: string): Promise<'gevraagd' | 'verlopen' | 'niet-gekoppeld' | 'gepauzeerd' | 'apparaat-geblokkeerd'> {
  const r = await inlog(id);
  if (!r || r.stand !== 'wacht' || verlopen(r)) return 'verlopen';
  const tg = String(van.id);
  if (r.telegram_id && r.telegram_id !== tg) return 'verlopen';
  const claim = await sql('UPDATE app.tg_inlog_verzoeken SET telegram_id = $2 WHERE id = $1 AND (telegram_id IS NULL OR telegram_id = $2) AND stand = \'wacht\' RETURNING id', [id, tg]);
  if (!claim.length) return 'verlopen';
  const { lijst, gepauzeerd, geblokkeerd } = await kandidaten(tg, { gebruikersnaam: van.username, voornaam: van.first_name, achternaam: van.last_name }, r.apparaat, 'bot');
  if (!lijst.length) { const reden = gepauzeerd ? 'gepauzeerd' : geblokkeerd ? 'apparaat-geblokkeerd' : 'niet-gekoppeld'; await inlogAfwijzen(id, reden); return reden; }
  await inlogVraagSturen(r, tg, chatId, lijst);
  return 'gevraagd';
}

/** De site meteen eerlijk laten weten waarom het niet lukt (in plaats van tot het verlopen te wachten). */
async function inlogAfwijzen(id: string, reden: 'niet-gekoppeld' | 'gepauzeerd' | 'apparaat-geblokkeerd'): Promise<void> {
  await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'geweigerd', reden = $2, afgehandeld_op = now() WHERE id = $1 AND stand = 'wacht'", [id, reden]);
}

async function inlogVraagSturen(r: InlogRij, tg: string, chatId: string, lijst: Kandidaat[]): Promise<void> {
  const { taal } = await taalVoor(tg);
  const een = (tl: 'uk' | 'nl') => invullen(TEKST.inlogVraag[tl], { account: lijst.map((x) => x.naam).join(' / '), tijd: tijdTekst(tl), apparaat: r.apparaat });
  const tekst = taal === 'beide' ? `${een('uk')}\n\n${een('nl')}` : een(taal);
  const tl: 'uk' | 'nl' = taal === 'nl' ? 'nl' : 'uk';
  const knoppen: Knop[][] = lijst.length === 1
    ? [[{ letter: 'i', doel: `${r.id}:${lijst[0].k.id}`, tekst: t(TEKST.knopJaInloggen, tl) }], [{ letter: 'n', doel: r.id, tekst: t(TEKST.knopNietIk, tl) }]]
    : [...lijst.map((x) => [{ letter: 'i' as const, doel: `${r.id}:${x.k.id}`, tekst: `${['🔵', '🟢', '🟣', '🟠', '🟤'][x.k.kleur] ?? '🔵'} ${x.naam}`.slice(0, 60) }]), [{ letter: 'n', doel: r.id, tekst: t(TEKST.knopNietIk, tl) }]];
  const kop = lijst.length === 1 ? strook(lijst[0].naam, lijst[0].k.kleur, taal) : `${strook('', 0, taal)}\n${t(TEKST.welkAccount, taal)}`;
  const nieuw = await Promise.all(lijst.map((x) => apparaatBekend(x.k.user_id, r.apparaat))).then((b) => b.some((v) => !v));
  await stuur(chatId, `${kop}\n\n${tekst}`, taal, { kaart: nieuw ? 'nieuwApparaat' : 'gewoon', knoppen: await knoppenMaken(tg, `inlog-${r.id}`, knoppen) });
}

/** Knop «✅ Це я, увійти» (of een accountnaam). Geeft de tekst voor het bijgewerkte bericht. */
export async function inlogGoedkeuren(doel: string, tg: string): Promise<{ uitkomst: 'ok' | 'code' | 'passkey-nodig' | 'verlopen' | 'geweigerd'; taal: BotTaal }> {
  const { taal } = await taalVoor(tg);
  const [id, koppelingId] = doel.split(':');
  const r = await inlog(id || '');
  if (!r || r.stand !== 'wacht' || verlopen(r) || r.telegram_id !== tg) return { uitkomst: 'verlopen', taal };
  const k = await koppelingLezen(koppelingId || '');
  if (!k || k.telegram_id !== tg || k.stand !== 'actief' || !k.rechten.includes('aanmelden')) return { uitkomst: 'geweigerd', taal };
  const e = await eisenVoorAanmelden(k.user_id, r.apparaat);
  if (!e.kan) {
    await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'geweigerd', reden = 'passkey-nodig', user_id = $2, koppeling_id = $3, afgehandeld_op = now() WHERE id = $1 AND stand = 'wacht'", [id, k.user_id, k.id]);
    await audit(k.user_id, 'aanmelden.passkey-nodig', 'denied', { koppeling: k.id, nieuwApparaat: e.nieuwApparaat });
    return { uitkomst: 'passkey-nodig', taal };
  }
  const upd = await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'goedgekeurd', user_id = $2, koppeling_id = $3, code_nodig = $4, afgehandeld_op = now() WHERE id = $1 AND stand = 'wacht' RETURNING id", [id, k.user_id, k.id, e.code]);
  if (!upd.length) return { uitkomst: 'verlopen', taal };
  await sql('UPDATE app.tg_koppelingen SET laatst_gebruikt_op = now() WHERE id = $1', [k.id]);
  await audit(k.user_id, 'aanmelden.goedgekeurd', 'success', { koppeling: k.id, apparaat: r.apparaat, nieuwApparaat: e.nieuwApparaat, code: e.code });
  return { uitkomst: e.code ? 'code' : 'ok', taal };
}

/** Knop «⛔ Це не я»: verzoek dicht, apparaat geblokkeerd voor de accounts van deze Telegram, eigenaar(s) en beheer ingelicht. */
export async function inlogWeigeren(id: string, tg: string): Promise<boolean> {
  const r = await inlog(id);
  if (!r || r.telegram_id !== tg || (r.stand !== 'wacht' && r.stand !== 'goedgekeurd')) return false;
  await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'geweigerd', reden = 'niet-ik', afgehandeld_op = now() WHERE id = $1 AND stand IN ('wacht','goedgekeurd')", [id]);
  for (const k of await koppelingenVanTelegram(tg)) {
    await sql('INSERT INTO app.tg_geblokkeerd (user_id, sleutel) VALUES ($1,$2) ON CONFLICT DO NOTHING', [k.user_id, r.apparaat]);
    await audit(k.user_id, 'aanmelden.niet-ik', 'denied', { koppeling: k.id, apparaat: r.apparaat });
    await siteMelding(k.user_id, { uk: '⛔ Спробу входу через Telegram заблоковано', nl: '⛔ Aanmeldpoging met Telegram geblokkeerd' },
      { uk: `Ви натиснули «Це не я» на запит входу з пристрою «${r.apparaat}» (${brusselsTijd(Date.now(), 'uk')}). Цей пристрій заблоковано для входу через Telegram.`,
        nl: `U tikte «Dit ben ik niet» bij een aanmeldverzoek van apparaat «${r.apparaat}» (${brusselsTijd(Date.now(), 'nl')}). Dit apparaat is geblokkeerd voor aanmelden met Telegram.` });
  }
  await beheerAlarm('inlog-niet-ik', { telegramId: tg, apparaat: r.apparaat }, { uk: `Користувач Telegram ${tg} відхилив спробу входу з пристрою «${r.apparaat}».`, nl: `Telegram-gebruiker ${tg} weigerde een aanmeldpoging van apparaat «${r.apparaat}».` });
  await gebeurtenis('aanmelden', false);
  return true;
}

// ------------------------------------------------------------------------------------------------ site: status, code, inwisselen
export type InlogStatus = { stand: InlogRij['stand']; reden: string; codeNodig: boolean; codeOk: boolean; verlooptOp: string };
export async function inlogStatus(id: string, geheim: string): Promise<InlogStatus> {
  const r = await inlog(id);
  if (!r || !geheimKlopt(r, geheim)) throw new Error('VERZOEK_ONBEKEND');
  let stand = r.stand;
  if ((stand === 'wacht' || stand === 'goedgekeurd') && verlopen(r)) {
    await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'verlopen' WHERE id = $1 AND stand IN ('wacht','goedgekeurd')", [id]);
    stand = 'verlopen';
  }
  return { stand, reden: stand === 'geweigerd' ? r.reden : '', codeNodig: r.code_nodig, codeOk: r.code_ok, verlooptOp: new Date(r.verloopt_op).toISOString() };
}

/** Geheime code bij aanmelden (alleen als het account het eist). Alarmcode: lijkt te slagen, het inwisselen mislukt dan stil. */
export async function inlogCode(id: string, geheim: string, code: string): Promise<{ ok: boolean; uitkomst: string }> {
  const r = await inlog(id);
  if (!r || !geheimKlopt(r, geheim) || verlopen(r)) throw new Error('VERZOEK_ONBEKEND');
  if (r.stand !== 'goedgekeurd' || !r.code_nodig || !r.user_id) throw new Error('GEEN_CODE_NODIG');
  const u = await codeControleren(r.user_id, String(code || '').slice(0, 64));
  if (u === 'ok') { await sql('UPDATE app.tg_inlog_verzoeken SET code_ok = true WHERE id = $1', [id]); return { ok: true, uitkomst: 'ok' }; }
  if (u === 'alarm') { await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'geweigerd' WHERE id = $1", [id]); return { ok: true, uitkomst: 'ok' }; }
  return { ok: false, uitkomst: u };
}

/** Eenmalig inwisselen: geeft de gebruiker en transactie terug; backend/index.ts maakt daarmee de sessie (zelfde weg als Google). */
export async function inlogInwisselen(id: string, geheim: string): Promise<{ userId: string; transactieId: string; koppelingId: string }> {
  const r = await inlog(id);
  if (!r || !geheimKlopt(r, geheim)) throw new Error('VERZOEK_ONBEKEND');
  if (verlopen(r)) throw new Error('VERLOPEN');
  if (r.stand === 'geweigerd') throw new Error('AANMELDEN_MISLUKT');
  if (r.stand !== 'goedgekeurd' || !r.user_id || !r.koppeling_id) throw new Error('NOG_NIET_GOEDGEKEURD');
  if (r.code_nodig && !r.code_ok) throw new Error('CODE_NODIG');
  const k = await koppelingLezen(r.koppeling_id);
  if (!k || k.stand !== 'actief') throw new Error('AANMELDEN_MISLUKT');
  const [claim] = await sql<{ id: string }>("UPDATE app.tg_inlog_verzoeken SET stand = 'ingewisseld' WHERE id = $1 AND stand = 'goedgekeurd' RETURNING id", [id]);
  if (!claim) throw new Error('AL_GEBRUIKT');
  await gebeurtenis('aanmelden', true, r.user_id);
  return { userId: r.user_id, transactieId: r.transactie_id, koppelingId: r.koppeling_id };
}

/** Na het aanmaken van de sessie: welke sessie hoort bij deze koppeling (om bij «Це не я» precies die te beëindigen). */
export async function inlogSessieVastleggen(id: string, sessieId: string): Promise<void> {
  await sql('UPDATE app.tg_inlog_verzoeken SET sessie_id = $2 WHERE id = $1', [id, String(sessieId || '').slice(0, 80)]);
}
/** Kaart «✅ Вхід виконано» in Telegram (na de sessie). */
export async function inlogGeluktMelden(koppelingId: string): Promise<void> {
  const k = await koppelingLezen(koppelingId);
  if (!k) return;
  try {
    const { taal } = await taalVoor(k.telegram_id);
    await stuur(k.chat_id, `${strook(await accountNaam(k.user_id), k.kleur, taal)}\n\n${t(TEKST.ingelogd, taal)}`, taal, { kaart: 'gelukt' });
    await succesTonen(k.chat_id);
  } catch { /* extra */ }
}

// ------------------------------------------------------------------------------------------------ aanmeldvenster (redirect-modus)
/** De terugkeer van het officiële widget (data-auth-url). Geeft de pagina waar de browser heen moet. */
export async function widgetTerug(q: Record<string, string>): Promise<{ id: string; fout: string }> {
  const id = String(q.i || '');
  const r = await inlog(id);
  if (!r || r.stand !== 'wacht' || verlopen(r)) return { id, fout: 'VERLOPEN' };
  const c = widgetControle(q, await botSleutel());
  if (!c.ok) { await audit(null, 'widget.handtekening', 'denied', {}); return { id, fout: 'HANDTEKENING_ONGELDIG' }; }
  if (!c.vers) return { id, fout: 'VERLOPEN' };
  if (!(await eenmaligClaimen(sha256hex(`widget\u0000${String(q.hash)}`)))) return { id, fout: 'AL_GEBRUIKT' };
  const tg = String(q.id || '');
  const claim = await sql("UPDATE app.tg_inlog_verzoeken SET telegram_id = $2, methode = 'widget' WHERE id = $1 AND telegram_id IS NULL AND stand = 'wacht' RETURNING id", [id, tg]);
  if (!claim.length) return { id, fout: 'AL_GEBRUIKT' };
  const { lijst, gepauzeerd, geblokkeerd } = await kandidaten(tg, { gebruikersnaam: q.username, voornaam: q.first_name, achternaam: q.last_name }, r.apparaat, 'widget');
  if (!lijst.length) { const reden = gepauzeerd ? 'gepauzeerd' : geblokkeerd ? 'apparaat-geblokkeerd' : 'niet-gekoppeld'; await inlogAfwijzen(id, reden); return { id, fout: reden === 'gepauzeerd' ? 'GEPAUZEERD' : reden === 'apparaat-geblokkeerd' ? 'APPARAAT_GEBLOKKEERD' : 'NIET_GEKOPPELD' }; }
  // Ook via het widget bevestigt de gebruiker in de bot (eenmalige knop): het widget bewijst wie, de knop bewijst dat hij het nu wil.
  await inlogVraagSturen(r, tg, lijst[0].k.chat_id, lijst);
  return { id, fout: '' };
}

export const hashVoorTest = (v: string): string => createHash('sha256').update(v).digest('hex');
