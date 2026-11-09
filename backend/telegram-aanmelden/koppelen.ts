// TELEGRAM-AANMELDEN v1 — koppelen (punt A/B). Alleen vanaf de site, in een geldige sessie, nooit vanuit de bot.
//   1. site: «Прив’язати Telegram» → verzoek (12 tekens, 10 min, gebonden aan deze sessie) → deeplink t.me/<bot>?start=k_<id>
//   2. bot: /start k_<id> → identiteit uit Telegram (id, @nikneim, naam) → «📱 Поділитися номером» (request_contact)
//      Alleen een contact met user_id == afzender telt; een getypt nummer of andermans contact wordt geweigerd.
//   3. site: toont ALLES volledig (id, nummer tot het laatste cijfer, @nikneim, naam, foto) → bevestigen met een verse passkey.
// Atomisch: de koppeling ontstaat in één transactie, met de limiet en dubbele koppelingen gecontroleerd binnen die transactie.
import { createHash } from 'node:crypto';
import { botAanroep, botBestand } from './bot-api';
import { botSleutel } from './sleutels';
import { nieuweId } from './cryptografie';
import { instellingen, koppelingenVanGebruiker, sql, transactie, vlagVoor, gebeurtenis } from './opslag';
import { audit, siteMelding, accountNaam } from './meldingen';
import { stuur, succesTonen, taalVoor, strook, SITE_BASIS } from './berichten';
import { normaliseerTelefoon } from '../../shared/telegram-aanmelden/wijziging';
import { invullen, t, TEKST } from '../../shared/telegram-aanmelden/teksten';
import { isKoppelRecht, type KoppelRecht } from '../../shared/telegram-aanmelden/model';

export const KOPPEL_MINUTEN = 10;
export const MAX_ACCOUNTS_PER_TELEGRAM = 5;
export const NAAM_RE = /^[\p{L}\p{N} .'’_-]{0,40}$/u;
const bindingHash = (sessieId: string): string => createHash('sha256').update(`tg-koppel\u0000${sessieId}`).digest('hex');

export type Gebruiker = { id: string; role?: string; status?: string; email?: string };
export async function magTelegram(u: Gebruiker): Promise<'' | 'VLAG_UIT' | 'UITGESCHAKELD' | 'NIET_TOEGESTAAN'> {
  if (!(await vlagVoor(u.id))) return 'VLAG_UIT';
  const inst = await instellingen();
  if (!inst.aan) return 'UITGESCHAKELD';
  if (inst.wieMag === 'niemand') return 'NIET_TOEGESTAAN';
  if (inst.wieMag === 'eigenaar' && u.role !== 'owner') return 'NIET_TOEGESTAAN';
  if (u.role !== 'owner' && u.status !== 'approved') return 'NIET_TOEGESTAAN';
  return '';
}

export async function botGebruikersnaam(): Promise<string> { return (await instellingen()).botGebruikersnaam; }
export const deeplink = (bot: string, start: string): string => `https://t.me/${encodeURIComponent(bot)}?start=${encodeURIComponent(start)}`;

/** Stap 1 (site). */
export async function koppelStart(u: Gebruiker, sessieId: string, o: { naam?: unknown; metCode?: unknown; siteTaal?: unknown }): Promise<{ id: string; deeplink: string; bot: string; verlooptOp: string }> {
  const weigering = await magTelegram(u);
  if (weigering) throw new Error(weigering);
  if (!sessieId) throw new Error('SESSIE_ONBEKEND');
  const inst = await instellingen();
  if ((await koppelingenVanGebruiker(u.id)).length >= inst.koppelLimiet) throw new Error('LIMIET_BEREIKT');
  const naam = String(o.naam ?? '').trim().slice(0, 40);
  if (!NAAM_RE.test(naam)) throw new Error('NAAM_ONGELDIG');
  // Eén open verzoek per account tegelijk: een vorig open verzoek vervalt.
  await sql("UPDATE app.tg_koppel_verzoeken SET stand = 'verlopen' WHERE user_id = $1 AND stand IN ('wacht-bot','wacht-telefoon','wacht-passkey')", [u.id]);
  const [{ n }] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM app.tg_koppel_verzoeken WHERE user_id = $1 AND aangemaakt_op > now() - interval '1 hour'", [u.id]);
  if (n >= 10) throw new Error('RATE_LIMITED');
  const id = nieuweId();
  const verloopt = new Date(Date.now() + KOPPEL_MINUTEN * 60_000);
  await sql('INSERT INTO app.tg_koppel_verzoeken (id, user_id, sessie_id, binding_hash, naam, met_code, verloopt_op) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, u.id, sessieId, bindingHash(sessieId), naam, o.metCode === true, verloopt]);
  await sql('UPDATE app.tg_koppel_verzoeken SET profiel = jsonb_build_object(\'siteTaal\', $2::text) WHERE id = $1', [id, o.siteTaal === 'nl' ? 'nl' : 'uk']);
  await audit(u.id, 'koppelen.start', 'pending', { verzoek: id });
  const bot = inst.botGebruikersnaam;
  return { id, deeplink: deeplink(bot, `k_${id}`), bot, verlooptOp: verloopt.toISOString() };
}

type VerzoekRij = { id: string; user_id: string; sessie_id: string; telegram_id: string | null; chat_id: string | null; telefoon: string | null; profiel: Record<string, string>;
  binding_hash: string; stand: string; naam: string; met_code: boolean; verloopt_op: Date };
const verzoek = async (id: string): Promise<VerzoekRij | null> => (/^[A-Za-z0-9_-]{12}$/.test(id) ? (await sql<VerzoekRij>('SELECT * FROM app.tg_koppel_verzoeken WHERE id = $1', [id]))[0] ?? null : null);

export type TgGebruiker = { id: number; username?: string; first_name?: string; last_name?: string; language_code?: string; is_bot?: boolean };

/** Stap 2a (bot): /start k_<id>. Geeft de tekst terug die de bot moet tonen (of null = al afgehandeld). */
export async function koppelVanBot(id: string, van: TgGebruiker, chatId: string): Promise<'telefoon' | 'verlopen' | 'onbekend' | 'al-gekoppeld' | 'te-veel'> {
  const v = await verzoek(id);
  if (!v) return 'onbekend';
  if (v.stand !== 'wacht-bot' || new Date(v.verloopt_op).getTime() < Date.now()) return 'verlopen';
  if (van.is_bot) return 'onbekend';
  const tg = String(van.id);
  const [{ n }] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM app.tg_koppelingen WHERE telegram_id = $1 AND stand <> 'uitgeschakeld'", [tg]);
  if (n >= MAX_ACCOUNTS_PER_TELEGRAM) return 'te-veel';
  const [al] = await sql("SELECT 1 FROM app.tg_koppelingen WHERE telegram_id = $1 AND user_id = $2 AND stand <> 'uitgeschakeld'", [tg, v.user_id]);
  if (al) return 'al-gekoppeld';
  const profiel = { ...v.profiel, gebruikersnaam: String(van.username || '').slice(0, 64), voornaam: String(van.first_name || '').slice(0, 128), achternaam: String(van.last_name || '').slice(0, 128) };
  // Eenmalig: alleen de eerste Telegram die de link opent, claimt het verzoek (stand-overgang in één UPDATE).
  const r = await sql("UPDATE app.tg_koppel_verzoeken SET telegram_id = $2, chat_id = $3, profiel = $4::jsonb, stand = 'wacht-telefoon' WHERE id = $1 AND stand = 'wacht-bot' RETURNING id", [id, tg, chatId, JSON.stringify(profiel)]);
  return r.length ? 'telefoon' : 'verlopen';
}

/** Stap 2b (bot): gedeeld contact. Alleen eigen contact via de knop. */
export async function contactVanBot(van: TgGebruiker, contact: { user_id?: number; phone_number?: string }): Promise<'ok' | 'vreemd' | 'geen-verzoek'> {
  const tg = String(van.id);
  const [v] = await sql<VerzoekRij>("SELECT * FROM app.tg_koppel_verzoeken WHERE telegram_id = $1 AND stand = 'wacht-telefoon' AND verloopt_op > now() ORDER BY aangemaakt_op DESC LIMIT 1", [tg]);
  if (!v) return 'geen-verzoek';
  if (!contact.user_id || String(contact.user_id) !== tg) return 'vreemd';
  const telefoon = normaliseerTelefoon(contact.phone_number);
  if (!/^\+[0-9]{6,20}$/.test(telefoon)) return 'vreemd';
  const fotoId = await profielFotoId(tg);
  await sql("UPDATE app.tg_koppel_verzoeken SET telefoon = $2, profiel = profiel || jsonb_build_object('fotoId', $3::text), stand = 'wacht-passkey' WHERE id = $1 AND stand = 'wacht-telefoon'", [v.id, telefoon, fotoId]);
  return 'ok';
}

/** file_unique_id van de huidige profielfoto ('' = geen foto of niet zichtbaar door privacy). */
export async function profielFotoId(telegramId: string): Promise<string> {
  try {
    const r = await botAanroep<{ total_count: number; photos: Array<Array<{ file_id: string; file_unique_id: string; width: number }>> }>(await botSleutel(), 'getUserProfilePhotos', { user_id: Number(telegramId), limit: 1 });
    return String(r.photos?.[0]?.[0]?.file_unique_id || '').slice(0, 128);
  } catch { return ''; }
}
/** Kleine profielfoto als data-URL (alleen voor de eigenaar van het verzoek/de koppeling; niets wordt opgeslagen). */
export async function profielFotoData(telegramId: string): Promise<string> {
  try {
    const sleutel = await botSleutel();
    const r = await botAanroep<{ photos: Array<Array<{ file_id: string; width: number }>> }>(sleutel, 'getUserProfilePhotos', { user_id: Number(telegramId), limit: 1 });
    const klein = r.photos?.[0]?.slice().sort((a, b) => a.width - b.width)[0];
    if (!klein) return '';
    const f = await botAanroep<{ file_path?: string }>(sleutel, 'getFile', { file_id: klein.file_id });
    const b = f.file_path ? await botBestand(sleutel, f.file_path) : null;
    return b ? `data:image/jpeg;base64,${b.toString('base64')}` : '';
  } catch { return ''; }
}

export type KoppelStatus = { stand: string; verlooptOp: string; identiteit?: { telegramId: string; telefoon: string; gebruikersnaam: string; voornaam: string; achternaam: string; heeftFoto: boolean; foto: string } };
/** Stap 3a (site): pollen. Alleen dezelfde gebruiker + dezelfde sessie. Identiteit volledig, niets gemaskeerd. */
export async function koppelStatus(userId: string, sessieId: string, id: string): Promise<KoppelStatus> {
  const v = await verzoek(id);
  if (!v || v.user_id !== userId || v.binding_hash !== bindingHash(sessieId)) throw new Error('VERZOEK_ONBEKEND');
  const verlopen = new Date(v.verloopt_op).getTime() < Date.now() && v.stand !== 'klaar';
  if (verlopen && v.stand !== 'verlopen') await sql("UPDATE app.tg_koppel_verzoeken SET stand = 'verlopen' WHERE id = $1 AND stand <> 'klaar'", [id]);
  const stand = verlopen ? 'verlopen' : v.stand;
  const uit: KoppelStatus = { stand, verlooptOp: new Date(v.verloopt_op).toISOString() };
  if (stand === 'wacht-passkey' && v.telegram_id) {
    uit.identiteit = { telegramId: v.telegram_id, telefoon: String(v.telefoon || ''), gebruikersnaam: String(v.profiel.gebruikersnaam || ''), voornaam: String(v.profiel.voornaam || ''),
      achternaam: String(v.profiel.achternaam || ''), heeftFoto: !!v.profiel.fotoId, foto: v.profiel.fotoId ? await profielFotoData(v.telegram_id) : '' };
  }
  return uit;
}

/** Stap 3b (site): bevestigen. De route heeft de poort 'koppelen' (verse passkey) al gepasseerd. */
export async function koppelBevestigen(userId: string, sessieId: string, id: string, o: { rechten?: unknown }): Promise<{ koppelingId: string; metCode: boolean }> {
  const v = await verzoek(id);
  if (!v || v.user_id !== userId || v.binding_hash !== bindingHash(sessieId)) throw new Error('VERZOEK_ONBEKEND');
  if (new Date(v.verloopt_op).getTime() < Date.now()) throw new Error('VERLOPEN');
  if (v.stand !== 'wacht-passkey' || !v.telegram_id || !v.chat_id || !v.telefoon) throw new Error('NOG_NIET_KLAAR');
  const inst = await instellingen();
  const rechten: KoppelRecht[] = Array.isArray(o.rechten) ? [...new Set(o.rechten.filter(isKoppelRecht))] : ['aanmelden', 'bevestigen', 'meldingen'];
  if (!rechten.length) throw new Error('RECHTEN_LEEG');
  const koppelingId = await transactie(async (q) => {
    const [claim] = await q("UPDATE app.tg_koppel_verzoeken SET stand = 'klaar' WHERE id = $1 AND stand = 'wacht-passkey' RETURNING id", [id]);
    if (!claim) throw new Error('AL_AFGEHANDELD');
    const actief = await q<{ kleur: number; telegram_id: string }>("SELECT kleur, telegram_id FROM app.tg_koppelingen WHERE user_id = $1 AND stand <> 'uitgeschakeld' FOR UPDATE", [userId]);
    if (actief.length >= inst.koppelLimiet) throw new Error('LIMIET_BEREIKT');
    if (actief.some((a) => a.telegram_id === v.telegram_id)) throw new Error('AL_GEKOPPELD');
    const vrij = [0, 1, 2, 3, 4].find((k) => !actief.some((a) => Number(a.kleur) === k)) ?? 0;
    const [rij] = await q<{ id: string }>(`INSERT INTO app.tg_koppelingen (user_id, telegram_id, chat_id, telefoon, gebruikersnaam, voornaam, achternaam, foto_id, naam, rechten, kleur, site_taal)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11,$12) RETURNING id`,
      [userId, v.telegram_id, v.chat_id, v.telefoon, String(v.profiel.gebruikersnaam || ''), String(v.profiel.voornaam || ''), String(v.profiel.achternaam || ''), String(v.profiel.fotoId || ''),
        v.naam || (v.profiel.voornaam ? String(v.profiel.voornaam).slice(0, 40) : 'Telegram'), rechten, vrij, v.profiel.siteTaal === 'nl' ? 'nl' : 'uk']);
    return rij.id;
  });
  await gebeurtenis('koppelen', true, userId);
  await audit(userId, 'koppelen.klaar', 'success', { koppeling: koppelingId, telegramId: v.telegram_id, telefoon: v.telefoon, gebruikersnaam: v.profiel.gebruikersnaam || '', rechten });
  const naam = await accountNaam(userId);
  try {
    const { taal } = await taalVoor(v.telegram_id);
    await stuur(v.chat_id, `${strook(naam, 0, taal)}\n\n${taal === 'beide' ? `${invullen(TEKST.gekoppeld.uk, { account: naam })}\n\n${invullen(TEKST.gekoppeld.nl, { account: naam })}` : invullen(TEKST.gekoppeld[taal], { account: naam })}`, taal,
      { kaart: 'gelukt', antwoordToetsenbord: { remove_keyboard: true } });
    await succesTonen(v.chat_id);
  } catch { /* de koppeling staat; de bevestiging in Telegram is een extra */ }
  await siteMelding(userId, { uk: '✅ Telegram прив’язано', nl: '✅ Telegram gekoppeld' },
    { uk: `Прив’язано Telegram ${v.profiel.gebruikersnaam ? `@${v.profiel.gebruikersnaam}` : v.telegram_id}, номер ${v.telefoon}. Якщо це були не ви, відв’яжіть його на сторінці «Способи входу».`,
      nl: `Telegram ${v.profiel.gebruikersnaam ? `@${v.profiel.gebruikersnaam}` : v.telegram_id} gekoppeld, nummer ${v.telefoon}. Was u dit niet, ontkoppel hem dan op de pagina «Aanmeldmethoden».` });
  return { koppelingId, metCode: v.met_code };
}

export async function koppelAnnuleren(userId: string, sessieId: string, id: string): Promise<void> {
  const v = await verzoek(id);
  if (!v || v.user_id !== userId || v.binding_hash !== bindingHash(sessieId)) return;
  await sql("UPDATE app.tg_koppel_verzoeken SET stand = 'geannuleerd' WHERE id = $1 AND stand <> 'klaar'", [id]);
  if (v.chat_id && v.stand === 'wacht-telefoon') {
    const { taal } = await taalVoor(String(v.telegram_id));
    await stuur(v.chat_id, t(TEKST.koppelVerlopen, taal), taal, { antwoordToetsenbord: { remove_keyboard: true } }).catch(() => undefined);
  }
}

export { SITE_BASIS };
