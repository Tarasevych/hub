// TELEGRAM-AANMELDEN v1 — aanmelden met Telegram (punt B + D).
// De site start een gewone aanmeldtransactie (zelfde tabel en zelfde voltooiing als Google: backend/index.ts) en koppelt daar een
// Telegram-verzoek aan: id (12 tekens, publiek in de directe verwijzing) + geheim (32 bytes, alleen in deze browser, als sha256 bewaard).
// Goedkeuren gebeurt in Telegram met een eenmalige, ondertekende knop (of via het officiële aanmeldvenster); de sessie maakt
// uitsluitend de browser met het geheim én de bindingscookie van de transactie. Een Telegram-aanmelding geeft GEEN extra bevestiging.
import { createHash } from 'node:crypto';
import { apparaat as apparaatLabel } from '../../server/platform/audit';
import { getPool } from '../../server/platform/pg';
import { apparaatCookieSleutel, apparaatSleutel, brusselsTijd } from '../nieuw-apparaat';
import { isApparaatHash } from '../apparaat-cookie';
import { botSleutel } from './sleutels';
import { eenmaligClaimen, gebeurtenis, instellingen, koppeling as koppelingLezen, koppelingenVanTelegram, sql, vlagHoofdschakelaar, vlagVoor, type KoppelRij } from './opslag';
import { gelijk, nieuweId, nieuwGeheim, sha256hex, widgetControle } from './cryptografie';
import { codeControleren } from './code';
import { beschikbaarVoor, eisVoor } from './beleid-poort';
import { vingerafdrukControleren } from './wijzigingen';
import { accountNaam, audit, beheerAlarm, siteMelding, tijdTekst } from './meldingen';
import { knoppenMaken, SITE_BASIS, stuur, strook, succesTonen, taalVoor, type BotTaal, type Knop } from './berichten';
import { deeplink, magTelegram, type TgGebruiker } from './koppelen';
import { invullen, t, TEKST } from '../../shared/telegram-aanmelden/teksten';
import type { Eis, Methode } from '../../shared/telegram-aanmelden/beleid';
import { PICTOGRAMMEN } from '../../shared/apparaat-bevestiging/symbolen';

/**
 * SEC-002 (aanmelden-04, afwerking A): symbool van een aanmeldverzoek — afgeleid van het (willekeurige, niet te kiezen) verzoek-id.
 * De site toont het naast de knop «Відкрити Telegram», de bot zet het in de kaart. Stuurt iemand een vreemde link
 * t.me/<bot>?start=i_<id> (het verzoek van een aanvaller), dan staat in de bot een symbool dat op het eigen scherm niet staat — of er
 * is helemaal geen eigen aanmeldscherm — en de kaart zegt: dan «Не я». Символ запиту для звіряння сайту й бота.
 */
export function inlogSymbool(id: string): { id: string; emoji: string; uk: string; nl: string } {
  const n = createHash('sha256').update(`tg-inlog-symbool:${id}`).digest().readUInt32BE(0);
  const p = PICTOGRAMMEN[n % PICTOGRAMMEN.length];
  return { id: p.id, emoji: p.emoji, uk: p.naam[0], nl: p.naam[1] };
}

export const INLOG_MINUTEN = 3;
const ID_RE = /^[A-Za-z0-9_-]{12}$/;
const EIGEN_ORIGINS: ReadonlySet<string> = new Set([
  'https://hub.tarasevych.com',
  'https://id.tarasevych.com',
  'https://mail.tarasevych.com',
  'https://cloud.tarasevych.com',
  'https://ai.tarasevych.com',
  'https://github.tarasevych.com',
  'https://huis.tarasevych.com',
  'https://admin.tarasevych.com',
  'https://api.tarasevych.com',
  'https://mcp.tarasevych.com',
]);

export type InlogContextMeta = {
  ua?: string;
  ip?: string;
  locatie?: string;
  browser?: string;
  os?: string;
  apparaatType?: string;
  apparaatLabel?: string;
  dienst?: string;
  onthouden?: boolean;
  terugAdres?: string;
  /** SEC-002: sha256 van de apparaatcookie van de browser die de aanmelding start (backend/apparaat-cookie.ts); leeg = nieuwe browser. */
  apparaatCookie?: string;
};

type InlogRij = {
  id: string; geheim_hash: string; transactie_id: string; apparaat: string;
  ip?: string; locatie?: string; browser?: string; os?: string; apparaat_type?: string;
  dienst?: string; onthouden?: boolean; terug_adres?: string;
  telegram_id: string | null; user_id: string | null; koppeling_id: string | null;
  stand: 'wacht' | 'goedgekeurd' | 'geweigerd' | 'verlopen' | 'ingewisseld';
  code_nodig: boolean; code_ok: boolean; verloopt_op: Date; sessie_id: string | null;
  sessie_ingetrokken_op?: Date | null; methode: string; reden: string;
  /** SEC-002 (migratie 0271): hash van de apparaatcookie van de startende browser; null = geen cookie = nieuw apparaat. */
  apparaat_sleutel?: string | null;
};
const inlog = async (id: string): Promise<InlogRij | null> => (ID_RE.test(id) ? (await sql<InlogRij>('SELECT * FROM app.tg_inlog_verzoeken WHERE id = $1', [id]))[0] ?? null : null);
const verlopen = (r: InlogRij): boolean => new Date(r.verloopt_op).getTime() < Date.now();

/** Controleert een terugkeeradres strikt tegen de witte lijst van eigen subdomeinen (*.tarasevych.com, alleen HTTPS, zonder inloggegevens). */
export function veiligEigenTerugAdres(kandidaat: unknown, standaard = `${SITE_BASIS()}/`): string {
  const veiligeStandaard = (() => {
    try {
      const s = new URL(standaard);
      if (s.protocol === 'https:' && !s.username && !s.password && (EIGEN_ORIGINS.has(s.origin) || /^https:\/\/([a-z0-9-]+\.)?tarasevych\.com$/i.test(s.origin))) return s.toString();
    } catch { /* terugval */ }
    return 'https://id.tarasevych.com/';
  })();
  if (typeof kandidaat !== 'string' || !kandidaat.trim()) return veiligeStandaard;
  try {
    const u = new URL(kandidaat.trim());
    if (u.protocol !== 'https:' || u.username || u.password) return veiligeStandaard;
    const basisOk = EIGEN_ORIGINS.has(u.origin) || (u.origin === SITE_BASIS() && /^https:\/\/([a-z0-9-]+\.)?tarasevych\.com$/i.test(u.origin));
    if (!basisOk) return veiligeStandaard;
    u.searchParams.delete('tg_inlog');
    u.searchParams.delete('tg_fout');
    return u.toString().slice(0, 500);
  } catch {
    return veiligeStandaard;
  }
}

async function leesTransactieContext(transactieId: string): Promise<{ dienst: string; onthouden: boolean | null; terugAdres: string }> {
  if (!transactieId) return { dienst: '', onthouden: null, terugAdres: '' };
  try {
    const r = await getPool('systeem').query("SELECT data FROM app.records WHERE tbl = 'owner_auth_transactions_v1' AND id = $1", [transactieId]);
    const d = r.rows[0]?.data as Record<string, unknown> | undefined;
    if (!d || d.authProvider !== 'telegram') return { dienst: '', onthouden: null, terugAdres: '' };
    const origin = typeof d.sourceOrigin === 'string' ? d.sourceOrigin : '';
    const ruwTerug = typeof d.returnTo === 'string' && d.returnTo ? d.returnTo : origin ? `${origin}/` : '';
    return {
      dienst: typeof d.targetService === 'string' ? d.targetService.slice(0, 32) : '',
      onthouden: typeof d.remember === 'boolean' ? d.remember : null,
      terugAdres: ruwTerug ? veiligEigenTerugAdres(ruwTerug) : '',
    };
  } catch {
    return { dienst: '', onthouden: null, terugAdres: '' };
  }
}

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
export async function inlogStart(transactieId: string, ua: string, meta: InlogContextMeta = {}): Promise<{ id: string; geheim: string; deeplink: string; bot: string; verlooptOp: string; symbool: ReturnType<typeof inlogSymbool> }> {
  const cfg = await publiekeConfig();
  if (!cfg.zichtbaar) throw new Error('TELEGRAM_UIT');
  if (cfg.stand === 'storing' && cfg.soort !== 'tijdelijk') throw new Error(cfg.soort === 'vast' ? 'METHODE_STORING_VAST' : 'METHODE_STORING_LANG');
  const id = nieuweId();
  const geheim = nieuwGeheim();
  const verloopt = new Date(Date.now() + INLOG_MINUTEN * 60_000);
  const txCtx = (!meta.terugAdres || !meta.dienst || meta.onthouden === undefined) ? await leesTransactieContext(transactieId) : { dienst: '', onthouden: null, terugAdres: '' };
  const grofApparaat = (meta.apparaatLabel || apparaatLabel(meta.ua || ua) || 'onbekend/onbekend').slice(0, 80);
  const dienst = String(meta.dienst || txCtx.dienst || '').slice(0, 32);
  const onthouden = meta.onthouden !== undefined ? meta.onthouden !== false : (txCtx.onthouden ?? true);
  const terugAdres = meta.terugAdres ? veiligEigenTerugAdres(meta.terugAdres) : txCtx.terugAdres;
  await sql(
    `INSERT INTO app.tg_inlog_verzoeken (id, geheim_hash, transactie_id, apparaat, ip, locatie, browser, os, apparaat_type, dienst, onthouden, terug_adres, verloopt_op, apparaat_sleutel)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id, sha256hex(geheim), transactieId, grofApparaat,
      String(meta.ip || '').slice(0, 64),
      String(meta.locatie || '').slice(0, 160),
      String(meta.browser || '').slice(0, 80),
      String(meta.os || '').slice(0, 80),
      String(meta.apparaatType || '').slice(0, 32),
      dienst,
      onthouden,
      terugAdres,
      verloopt,
      // SEC-002: alleen een hash van de vorm van apparaatCookieHash; alles anders = geen cookie = nieuw apparaat.
      isApparaatHash(meta.apparaatCookie) ? meta.apparaatCookie : null,
    ],
  );
  return { id, geheim, deeplink: deeplink(cfg.bot, `i_${id}`), bot: cfg.bot, verlooptOp: verloopt.toISOString(), symbool: inlogSymbool(id) };
}

const geheimKlopt = (r: InlogRij, geheim: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(geheim) && gelijk(r.geheim_hash, sha256hex(geheim));

// ------------------------------------------------------------------------------------------------ welke accounts mogen
type Kandidaat = { k: KoppelRij; naam: string };
/**
 * SEC-002 (integraties-04 / aanmelden-05): de sleutel waarop «Це не я» een apparaat blokkeert. Met apparaatcookie: label + een
 * stuk van de hash — alleen DIE browser; de aanvaller kan zo nooit meer de eigen browser van het slachtoffer laten blokkeren door
 * diens label na te bootsen. Zonder cookie: het label (zoals vroeger; geldt dan alleen voor browsers zonder apparaatcookie).
 */
export function blokSleutel(r: { apparaat: string; apparaat_sleutel?: string | null }): string {
  const label = String(r.apparaat || 'onbekend/onbekend');
  return isApparaatHash(r.apparaat_sleutel) ? `${label.slice(0, 50)} · ${r.apparaat_sleutel.slice(0, 16)}` : label.slice(0, 80);
}
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
/** SEC-002 (integraties-04 / aanmelden-05): «bekend» = DEZE browser (zijn apparaatcookie) meldde zich al eens bij dit account
 *  aan (backend/nieuw-apparaat.ts). Vroeger: het label «Browser/Systeem» — door de User-Agent na te bootsen. Geen cookie = nieuw. */
async function apparaatBekend(userId: string, apparaatCookie: string | null | undefined): Promise<boolean> {
  if (!isApparaatHash(apparaatCookie)) return false;
  const r = await getPool('systeem').query('SELECT 1 FROM app.bekende_apparaten WHERE user_id = $1 AND sleutel = $2', [userId, apparaatCookieSleutel(userId, apparaatCookie)]).catch(() => ({ rows: [] }));
  return r.rows.length > 0;
}
/**
 * SEC-002 (slot s, eind-regressie midden-2): sinds de apparaatcookie is elke browser na het bijwerken één keer «nieuw». De bescherming
 * blijft (geen herkenning op het label), maar wie GEEN toegangssleutel heeft, krijgt een duidelijke weg in plaats van een doodlopende
 * «потрібен ключ доступу»: in deze browser één keer met een andere manier aanmelden (Google), daarna is hij bekend.
 * Людина без ключа доступу: увійдіть у цьому браузері іншим способом (Google) — далі вхід через Telegram тут працюватиме.
 */
export const ANDERE_WEG_CODE = 'NIEUW_APPARAAT_ANDERE_WEG';
export const ANDERE_WEG_UITLEG = {
  uk: 'Цей браузер ще не відомий вашому обліковому запису: після оновлення безпеки кожен браузер один раз підтверджується, а ключа доступу у вас немає. Увійдіть у цьому браузері іншим способом — через Google. Після цього вхід через Telegram тут працюватиме без додаткових кроків. Ключ доступу можна додати в «Способах входу».',
  nl: 'Deze browser is nog niet bekend bij uw account: na de beveiligingsupdate wordt elke browser één keer bevestigd, en u hebt geen toegangssleutel. Meld u in deze browser aan op een andere manier — met Google. Daarna werkt aanmelden met Telegram hier zonder extra stappen. Een toegangssleutel kunt u toevoegen bij «Aanmeldmethoden».',
} as const;
/** Bestond er vóór de update een rij op het grove label van deze browser (oude sleutel)? Alleen lezen, voor de tekst van de kaart. */
async function oudLabelBekend(userId: string, label: string): Promise<boolean> {
  const r = await getPool('systeem').query('SELECT 1 FROM app.bekende_apparaten WHERE user_id = $1 AND sleutel = $2', [userId, apparaatSleutel(userId, String(label || '').slice(0, 80))]).catch(() => ({ rows: [] }));
  return r.rows.length > 0;
}
const OVERGANG_REGEL = {
  uk: 'ℹ️ Перший вхід із цього браузера після оновлення безпеки: раніше ви вже входили з такого пристрою, але тепер кожен браузер один раз підтверджується. Якщо вхід почали не ви — натисніть «⛔ Це не я».',
  nl: 'ℹ️ Eerste aanmelding vanuit deze browser na de beveiligingsupdate: u meldde zich eerder al aan vanaf zo’n apparaat, maar nu wordt elke browser één keer bevestigd. Bent u niet zelf begonnen met aanmelden, tik dan «⛔ Dit ben ik niet».',
};
const overgangRegel = (taal: BotTaal): string => (taal === 'nl' ? OVERGANG_REGEL.nl : taal === 'uk' ? OVERGANG_REGEL.uk : `${OVERGANG_REGEL.uk}\n${OVERGANG_REGEL.nl}`);
export async function eisenVoorAanmelden(userId: string, apparaatCookie: string | null | undefined): Promise<{ kan: boolean; code: boolean; nieuwApparaat: boolean; passkey: boolean }> {
  const eisen: Eis[] = [];
  const a = await eisVoor(userId, 'aanmelden');
  if (a) eisen.push(a.eis);
  const nieuwApparaat = !(await apparaatBekend(userId, apparaatCookie));
  if (nieuwApparaat) { const n = await eisVoor(userId, 'nieuw-apparaat'); if (n) eisen.push(n.eis); }
  const beschikbaar = await beschikbaarVoor(userId);
  return { ...telegramWegVoor(eisen, beschikbaar), nieuwApparaat, passkey: beschikbaar.has('passkey') };
}

// ------------------------------------------------------------------------------------------------ bot: /start i_<id>
export async function inlogVanBot(id: string, van: TgGebruiker, chatId: string): Promise<'gevraagd' | 'verlopen' | 'niet-gekoppeld' | 'gepauzeerd' | 'apparaat-geblokkeerd'> {
  const r = await inlog(id);
  if (!r || r.stand !== 'wacht' || verlopen(r)) return 'verlopen';
  const tg = String(van.id);
  if (r.telegram_id && r.telegram_id !== tg) return 'verlopen';
  const claim = await sql('UPDATE app.tg_inlog_verzoeken SET telegram_id = $2 WHERE id = $1 AND (telegram_id IS NULL OR telegram_id = $2) AND stand = \'wacht\' RETURNING id', [id, tg]);
  if (!claim.length) return 'verlopen';
  const { lijst, gepauzeerd, geblokkeerd } = await kandidaten(tg, { gebruikersnaam: van.username, voornaam: van.first_name, achternaam: van.last_name }, blokSleutel(r), 'bot');
  if (!lijst.length) { const reden = gepauzeerd ? 'gepauzeerd' : geblokkeerd ? 'apparaat-geblokkeerd' : 'niet-gekoppeld'; await inlogAfwijzen(id, reden); return reden; }
  await inlogVraagSturen(r, tg, chatId, lijst);
  return 'gevraagd';
}

/** De site meteen eerlijk laten weten waarom het niet lukt (in plaats van tot het verlopen te wachten). */
async function inlogAfwijzen(id: string, reden: 'niet-gekoppeld' | 'gepauzeerd' | 'apparaat-geblokkeerd'): Promise<void> {
  await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'geweigerd', reden = $2, afgehandeld_op = now() WHERE id = $1 AND stand = 'wacht'", [id, reden]);
}

function paginaWeergave(r: InlogRij): string {
  if (r.terug_adres) {
    try {
      const u = new URL(r.terug_adres);
      return `${u.host}${u.pathname === '/' ? '' : u.pathname}`.slice(0, 120);
    } catch { /* terugval */ }
  }
  if (r.dienst) {
    const host = r.dienst === 'identity' ? 'id.tarasevych.com' : `${r.dienst}.tarasevych.com`;
    return host;
  }
  return 'tarasevych.com';
}

async function inlogVraagSturen(r: InlogRij, tg: string, chatId: string, lijst: Kandidaat[]): Promise<void> {
  const { taal } = await taalVoor(tg);
  const k0 = lijst[0].k;
  const tgNaam = [k0.voornaam, k0.achternaam].filter(Boolean).join(' ');
  const tgTekst = `${tgNaam || 'Telegram'}${k0.gebruikersnaam ? ` (@${k0.gebruikersnaam})` : ''} · ID ${tg}`;
  const dienstTekst = paginaWeergave(r);
  const extraApparaat = [r.browser && !r.apparaat.includes(r.browser) ? r.browser : '', r.os && !r.apparaat.includes(r.os) ? r.os : ''].filter(Boolean).join(' · ');
  const apparaatVolledig = [r.apparaat, extraApparaat].filter(Boolean).join(' · ');
  const een = (tl: 'uk' | 'nl') => invullen(TEKST.inlogVraag[tl], {
    account: lijst.map((x) => x.naam).join(' / '),
    telegram: tgTekst,
    dienst: dienstTekst,
    apparaat: apparaatVolledig,
    netwerk: [r.ip, r.locatie].filter(Boolean).join(' · ') || (tl === 'nl' ? 'niet vastgesteld' : 'не визначено'),
    onthouden: r.onthouden !== false
      ? (tl === 'nl' ? 'Ja (op dit apparaat bewaren)' : 'Так (зберегти на цьому пристрої)')
      : (tl === 'nl' ? 'Nee (alleen deze sessie)' : 'Ні (лише поточний сеанс)'),
    tijd: tijdTekst(tl),
  });
  const tekst = taal === 'beide' ? `${een('uk')}\n\n${een('nl')}` : een(taal);
  const tl: 'uk' | 'nl' = taal === 'nl' ? 'nl' : 'uk';
  const knoppen: Knop[][] = lijst.length === 1
    ? [[{ letter: 'i', doel: `${r.id}:${lijst[0].k.id}`, tekst: t(TEKST.knopJaInloggen, tl) }], [{ letter: 'n', doel: r.id, tekst: t(TEKST.knopNietIk, tl) }]]
    : [...lijst.map((x) => [{ letter: 'i' as const, doel: `${r.id}:${x.k.id}`, tekst: `${['🔵', '🟢', '🟣', '🟠', '🟤'][x.k.kleur] ?? '🔵'} ${x.naam}`.slice(0, 60) }]), [{ letter: 'n', doel: r.id, tekst: t(TEKST.knopNietIk, tl) }]];
  const kop = lijst.length === 1 ? strook(lijst[0].naam, lijst[0].k.kleur, taal) : `${strook('', 0, taal)}\n${t(TEKST.welkAccount, taal)}`;
  const nieuw = await Promise.all(lijst.map((x) => apparaatBekend(x.k.user_id, r.apparaat_sleutel))).then((b) => b.some((v) => !v));
  // SEC-002: een nieuw apparaat staat er ook in woorden boven (niet alleen de kleur van de kaart).
  // SEC-002 (slot s, midden-2): kende het systeem deze browser al VÓÓR de update (oude rij op het label)? Dan een neutrale regel en een
  // gewone kaart in plaats van «⚠️ НОВИЙ пристрій» — de eis zelf (één keer bevestigen) blijft, en «Це не я» staat er nog steeds.
  const overgang = nieuw && (await Promise.all(lijst.map((x) => oudLabelBekend(x.k.user_id, r.apparaat)))).every(Boolean);
  const nieuwRegel = overgang ? `${overgangRegel(taal)}\n\n` : nieuw ? `${t(TEKST.inlogNieuwApparaat, taal)}\n\n` : '';
  // SEC-002 (aanmelden-04, afwerking A): symbool van dit verzoek — moet gelijk zijn aan het symbool op het eigen aanmeldscherm.
  const sym = inlogSymbool(r.id);
  const symUk = `Символ запиту: ${sym.emoji} ${sym.uk}. Він має збігатися із символом на вашому екрані входу. Немає такого екрана або символ інший — натисніть «⛔ Це не я».`;
  const symNl = `Symbool van het verzoek: ${sym.emoji} ${sym.nl}. Het moet gelijk zijn aan het symbool op uw aanmeldscherm. Geen aanmeldscherm of een ander symbool — kies «⛔ Dit ben ik niet».`;
  const symRegel = `${taal === 'beide' ? `${symUk}\n${symNl}` : taal === 'nl' ? symNl : symUk}\n\n`;
  await stuur(chatId, `${kop}\n\n${nieuwRegel}${symRegel}${tekst}`, taal, { kaart: nieuw && !overgang ? 'nieuwApparaat' : 'gewoon', knoppen: await knoppenMaken(tg, `inlog-${r.id}`, knoppen) });
}

/** Veilig terugkeeradres met ?tg_inlog=<id> voor een lopend of zojuist goedgekeurd aanmeldverzoek. */
export async function inlogTerugUrl(id: string, rijVooraf?: InlogRij | null): Promise<string> {
  const r = rijVooraf ?? (await inlog(id));
  if (!r) return '';
  let basis = r.terug_adres ? veiligEigenTerugAdres(r.terug_adres, '') : '';
  if (!basis) {
    const txCtx = await leesTransactieContext(r.transactie_id);
    basis = txCtx.terugAdres || veiligEigenTerugAdres(`${SITE_BASIS()}/`);
  }
  try {
    const doel = new URL(veiligEigenTerugAdres(basis));
    doel.searchParams.set('tg_inlog', r.id);
    return doel.toString();
  } catch {
    return '';
  }
}

/** Knop «✅ Це я, увійти» (of een accountnaam). Geeft de uitkomst + het gecontroleerde terugkeeradres voor het bijgewerkte bericht. */
export async function inlogGoedkeuren(doel: string, tg: string): Promise<{ uitkomst: 'ok' | 'code' | 'passkey-nodig' | 'verlopen' | 'geweigerd'; taal: BotTaal; terugUrl: string; andereWeg?: boolean }> {
  const { taal } = await taalVoor(tg);
  const [id, koppelingId] = doel.split(':');
  const r = await inlog(id || '');
  if (!r || r.stand !== 'wacht' || verlopen(r) || r.telegram_id !== tg) return { uitkomst: 'verlopen', taal, terugUrl: '' };
  const k = await koppelingLezen(koppelingId || '');
  if (!k || k.telegram_id !== tg || k.stand !== 'actief' || !k.rechten.includes('aanmelden')) return { uitkomst: 'geweigerd', taal, terugUrl: '' };
  const e = await eisenVoorAanmelden(k.user_id, r.apparaat_sleutel);
  if (!e.kan) {
    await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'geweigerd', reden = 'passkey-nodig', user_id = $2, koppeling_id = $3, afgehandeld_op = now() WHERE id = $1 AND stand = 'wacht'", [id, k.user_id, k.id]);
    await audit(k.user_id, 'aanmelden.passkey-nodig', 'denied', { koppeling: k.id, nieuwApparaat: e.nieuwApparaat, passkey: e.passkey });
    return { uitkomst: 'passkey-nodig', taal, terugUrl: '', andereWeg: e.nieuwApparaat && !e.passkey };
  }
  const upd = await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'goedgekeurd', user_id = $2, koppeling_id = $3, code_nodig = $4, afgehandeld_op = now() WHERE id = $1 AND stand = 'wacht' RETURNING id", [id, k.user_id, k.id, e.code]);
  if (!upd.length) return { uitkomst: 'verlopen', taal, terugUrl: '' };
  await sql('UPDATE app.tg_koppelingen SET laatst_gebruikt_op = now(), laatst_ip = $2, laatst_locatie = $3, laatst_apparaat = $4 WHERE id = $1',
    [k.id, String(r.ip || '').slice(0, 64), String(r.locatie || '').slice(0, 160), String(r.apparaat || '').slice(0, 120)]);
  await audit(k.user_id, 'aanmelden.goedgekeurd', 'success', { koppeling: k.id, apparaat: r.apparaat, ip: r.ip || '', dienst: r.dienst || '', onthouden: r.onthouden !== false, nieuwApparaat: e.nieuwApparaat, code: e.code });
  const terugUrl = await inlogTerugUrl(r.id, r);
  return { uitkomst: e.code ? 'code' : 'ok', taal, terugUrl };
}

/** Knop «⛔ Це не я»: verzoek dicht, apparaat geblokkeerd voor de accounts van deze Telegram, eigenaar(s) en beheer ingelicht. */
export async function inlogWeigeren(id: string, tg: string): Promise<boolean> {
  const r = await inlog(id);
  if (!r || r.telegram_id !== tg || (r.stand !== 'wacht' && r.stand !== 'goedgekeurd')) return false;
  await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'geweigerd', reden = 'niet-ik', afgehandeld_op = now() WHERE id = $1 AND stand IN ('wacht','goedgekeurd')", [id]);
  for (const k of await koppelingenVanTelegram(tg)) {
    await sql('INSERT INTO app.tg_geblokkeerd (user_id, sleutel) VALUES ($1,$2) ON CONFLICT DO NOTHING', [k.user_id, blokSleutel(r)]);
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
export type InlogStatus = { stand: InlogRij['stand']; reden: string; codeNodig: boolean; codeOk: boolean; verlooptOp: string; advies?: string; uitleg?: { uk: string; nl: string } };
export async function inlogStatus(id: string, geheim: string): Promise<InlogStatus> {
  const r = await inlog(id);
  if (!r || !geheimKlopt(r, geheim)) throw new Error('VERZOEK_ONBEKEND');
  let stand = r.stand;
  if ((stand === 'wacht' || stand === 'goedgekeurd') && verlopen(r)) {
    await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'verlopen' WHERE id = $1 AND stand IN ('wacht','goedgekeurd')", [id]);
    stand = 'verlopen';
  }
  const uit: InlogStatus = { stand, reden: stand === 'geweigerd' ? r.reden : '', codeNodig: r.code_nodig, codeOk: r.code_ok, verlooptOp: new Date(r.verloopt_op).toISOString() };
  // SEC-002 (slot s, midden-2): geweigerd omdat een sleutel nodig was, maar het account HEEFT er geen → de weg via een andere aanmelding.
  if (stand === 'geweigerd' && r.reden === 'passkey-nodig' && r.user_id && !(await beschikbaarVoor(r.user_id).catch(() => new Set<Methode>(['passkey']))).has('passkey')) {
    uit.advies = ANDERE_WEG_CODE; uit.uitleg = { ...ANDERE_WEG_UITLEG };
  }
  return uit;
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

// ------------------------------------------------------------------------------------------------ aanmeldvenster (omleidingsmodus)
/** Transactie-id en veilig basis-terugkeeradres bij een aanmeldverzoek (voor het officiële aanmeldvenster). */
export async function inlogTransactieId(id: string): Promise<string> {
  const r = await inlog(id);
  return r ? r.transactie_id : '';
}
export async function inlogTerugAdres(id: string): Promise<string> {
  const r = await inlog(id);
  if (!r) return veiligEigenTerugAdres(`${SITE_BASIS()}/`);
  if (r.terug_adres) return veiligEigenTerugAdres(r.terug_adres);
  const txCtx = await leesTransactieContext(r.transactie_id);
  return txCtx.terugAdres || veiligEigenTerugAdres(`${SITE_BASIS()}/`);
}

/** De terugkeer van het officiële aanmeldvenster (data-auth-url). Verzoek-id reist als `verzoek` (of `i`), zodat Telegrams eigen `id` (gebruikers-id) niets overschrijft. */
export async function widgetTerug(q: Record<string, string>): Promise<{ id: string; fout: string; transactieId: string; terugAdres: string }> {
  const id = String(q.verzoek || q.i || '');
  const r = await inlog(id);
  const standaardTerug = r?.terug_adres ? veiligEigenTerugAdres(r.terug_adres) : veiligEigenTerugAdres(`${SITE_BASIS()}/`);
  if (!r || r.stand !== 'wacht' || verlopen(r)) return { id: ID_RE.test(id) ? id : '', fout: 'VERLOPEN', transactieId: r?.transactie_id || '', terugAdres: standaardTerug };
  const txId = r.transactie_id;
  const c = widgetControle(q, await botSleutel());
  if (!c.ok) { await audit(null, 'widget.handtekening', 'denied', {}); return { id, fout: 'HANDTEKENING_ONGELDIG', transactieId: txId, terugAdres: standaardTerug }; }
  if (!c.vers) return { id, fout: 'VERLOPEN', transactieId: txId, terugAdres: standaardTerug };
  if (!(await eenmaligClaimen(sha256hex(`widget\u0000${String(q.hash)}`)))) return { id, fout: 'AL_GEBRUIKT', transactieId: txId, terugAdres: standaardTerug };
  const tg = String(q.id || '');
  const claim = await sql("UPDATE app.tg_inlog_verzoeken SET telegram_id = $2, methode = 'widget' WHERE id = $1 AND telegram_id IS NULL AND stand = 'wacht' RETURNING id", [id, tg]);
  if (!claim.length) return { id, fout: 'AL_GEBRUIKT', transactieId: txId, terugAdres: standaardTerug };
  const { lijst, gepauzeerd, geblokkeerd } = await kandidaten(tg, { gebruikersnaam: q.username, voornaam: q.first_name, achternaam: q.last_name }, blokSleutel(r), 'widget');
  if (!lijst.length) {
    const reden = gepauzeerd ? 'gepauzeerd' : geblokkeerd ? 'apparaat-geblokkeerd' : 'niet-gekoppeld';
    await inlogAfwijzen(id, reden);
    return { id, fout: reden === 'gepauzeerd' ? 'GEPAUZEERD' : reden === 'apparaat-geblokkeerd' ? 'APPARAAT_GEBLOKKEERD' : 'NIET_GEKOPPELD', transactieId: txId, terugAdres: standaardTerug };
  }
  // Ook via het aanmeldvenster bevestigt de gebruiker in de bot (eenmalige knop): het venster bewijst wie, de knop bewijst dat hij het nu wil.
  await inlogVraagSturen(r, tg, lijst[0].k.chat_id, lijst);
  return { id, fout: '', transactieId: txId, terugAdres: standaardTerug };
}

export const hashVoorTest = (v: string): string => createHash('sha256').update(v).digest('hex');
