// TELEGRAM-AANMELDEN v1 — beheer («Способи входу» in het beheerpaneel). Alles hier vereist eigenaar/beheerder + verse toegangssleutel
// (poort 'beheer-instellingen' of 'beheer-bot-sleutel'); de route controleert dat. De botsleutel komt ALLEEN via «Налаштувати
// бота» binnen (beschermd veld), gaat rechtstreeks de kluis in en verlaat de server nooit meer; hier staat hoogstens het masker.
import { auditToevoegen } from '../../server/platform/audit';
import { getPool } from '../../server/platform/pg';
import { botAanroep, BotFout, type BotMij, type WebhookInfo } from './bot-api';
import { BOT_SLEUTEL_RE, botSleutel, botSleutelBron, botSleutelWisselen, nieuweBotSleutel, nieuweBotSleutelBewaren, nieuweBotSleutelVergeten, sleutelCacheWissen, sleutelMasker, webhookGeheim, codePeper } from './sleutels';
import { actieSoorten, instellingen, instellingenCacheWissen, sql, vlagCacheWissen, vlagHoofdschakelaar } from './opslag';
import { controleNu, publiekeStand } from './status';
import { koppelingenVanGebruiker } from './opslag';
import { stuur, taalVoor, SITE_BASIS } from './berichten';
import { ontkoppelen } from './ontkoppelen';
import { OPDRACHTEN, OPDRACHT_OMSCHRIJVING, TEKST, t } from '../../shared/telegram-aanmelden/teksten';
import { instellingenNormaliseren, type TelegramInstellingen } from '../../shared/telegram-aanmelden/model';
import { ACTIE_SLEUTEL_RE, INGEBOUWDE_ACTIES, isKeuze, minstensZoStreng, eisVan } from '../../shared/telegram-aanmelden/beleid';

export const WEBHOOK_PAD = '/api/telegram/webhook';
const auditBeheer = (door: string, actie: string, resultaat: string, details: Record<string, unknown> = {}) =>
  auditToevoegen({ ownerId: door, actorId: door, action: `telegram.beheer.${actie}`.slice(0, 120), type: 'admin', result: resultaat, details }).catch(() => undefined);

// ------------------------------------------------------------------------------------------------ overzicht
export async function overzicht() {
  const inst = await instellingen();
  const bron = await botSleutelBron();
  const stand = await publiekeStand();
  const [status] = await sql<{ oorzaak: string; laatste_controle: Date | null; reeks: Array<{ t: number; ok: boolean; ms: number }> }>("SELECT oorzaak, laatste_controle, reeks FROM app.tg_status WHERE methode = 'telegram'");
  const reeks = (status?.reeks ?? []).filter((x) => x.t > Date.now() - 24 * 3600_000);
  const cijfers = await sql<{ soort: string; ok: boolean; d1: number; d7: number; d30: number }>(`SELECT soort, ok,
      count(*) FILTER (WHERE op > now() - interval '1 day')::int AS d1, count(*) FILTER (WHERE op > now() - interval '7 days')::int AS d7, count(*)::int AS d30
    FROM app.tg_gebeurtenissen WHERE op > now() - interval '30 days' GROUP BY soort, ok`);
  const [k] = await sql<{ actief: number; gepauzeerd: number; geblokkeerd: number; accounts: number; telegrams: number }>(`SELECT
      count(*) FILTER (WHERE stand = 'actief')::int AS actief, count(*) FILTER (WHERE stand = 'gepauzeerd')::int AS gepauzeerd,
      count(*) FILTER (WHERE stand = 'geblokkeerd')::int AS geblokkeerd, count(DISTINCT user_id) FILTER (WHERE stand <> 'uitgeschakeld')::int AS accounts,
      count(DISTINCT telegram_id) FILTER (WHERE stand <> 'uitgeschakeld')::int AS telegrams FROM app.tg_koppelingen`);
  const [w] = await sql<{ open: number }>("SELECT count(*)::int AS open FROM app.tg_wijzigingen WHERE status IN ('open','gezien')");
  const [c] = await sql<{ n: number; geblokkeerd: number }>("SELECT count(*)::int AS n, count(*) FILTER (WHERE uitgeschakeld)::int AS geblokkeerd FROM app.tg_geheime_codes");
  const [vorige] = await sql<{ ongedaan_tot: Date | null }>("SELECT ongedaan_tot FROM app.tg_instellingen WHERE id = 'vorige'");
  return {
    vlagAan: await vlagHoofdschakelaar(),
    instellingen: inst,
    ongedaanTot: vorige?.ongedaan_tot && new Date(vorige.ongedaan_tot).getTime() > Date.now() ? new Date(vorige.ongedaan_tot).toISOString() : null,
    sleutel: { aanwezig: bron.aanwezig, bron: bron.bron, masker: sleutelMasker(bron.botId), wisselLoopt: bron.wisselLoopt },
    webhookGeheim: !!(await webhookGeheim(false)), peper: !!(await codePeper(false)),
    status: { ...stand, oorzaak: status?.oorzaak ?? '', laatsteControle: status?.laatste_controle ? new Date(status.laatste_controle).toISOString() : null, reeks },
    cijfers, koppelingen: k, openWijzigingen: w?.open ?? 0, codes: c,
    acties: await actieSoorten(),
    webhookUrl: `${SITE_BASIS()}${WEBHOOK_PAD}`,
  };
}

// ------------------------------------------------------------------------------------------------ «Налаштувати бота»
export type Stap = { stap: string; ok: boolean; fout?: string; info?: string };
/**
 * Eén knop: (nieuwe sleutel controleren met getMe → gebruikersnaam vergelijken met de verwachte → pas dan actief) → webhook met
 * geheim → opdrachten, naam, omschrijvingen per taal → menuknop. Elke stap eerlijk met uitkomst; een fout stopt niets wat al werkt.
 */
export async function botInstellen(door: string, o: { sleutel?: unknown; toch?: unknown }): Promise<{ stappen: Stap[]; bot?: { id: number; username: string; naam: string }; waarschuwing?: string }> {
  const stappen: Stap[] = [];
  const inst = await instellingen();
  const verwacht = inst.botGebruikersnaam;
  let sleutel = await botSleutel();
  const nieuw = typeof o.sleutel === 'string' ? o.sleutel.trim() : '';
  if (nieuw) {
    if (!BOT_SLEUTEL_RE.test(nieuw)) return { stappen: [{ stap: 'sleutel', ok: false, fout: 'SLEUTEL_VORM_ONGELDIG' }] };
    let mij: BotMij;
    try { mij = await botAanroep<BotMij>(nieuw, 'getMe'); }
    catch (e) { await auditBeheer(door, 'sleutel', 'failed', { fout: e instanceof BotFout ? e.code : 'ONBEKEND' }); return { stappen: [{ stap: 'getMe', ok: false, fout: e instanceof BotFout ? e.code : 'ONBEKEND' }] }; }
    if (!mij.is_bot) return { stappen: [{ stap: 'getMe', ok: false, fout: 'GEEN_BOT' }] };
    if (mij.username.toLowerCase() !== verwacht.toLowerCase() && o.toch !== true) {
      // Niet stilzwijgend een andere bot activeren: eerst de beheerder laten kiezen.
      await auditBeheer(door, 'sleutel', 'denied', { reden: 'ANDERE_BOT', gevonden: mij.username, verwacht });
      return { stappen: [{ stap: 'getMe', ok: false, fout: 'ANDERE_BOT', info: `@${mij.username}` }], waarschuwing: 'ANDERE_BOT', bot: { id: mij.id, username: mij.username, naam: mij.first_name } };
    }
    await nieuweBotSleutelBewaren(nieuw);
    if (await nieuweBotSleutel() !== nieuw) return { stappen: [{ stap: 'kluis', ok: false, fout: 'KLUIS_SCHRIJVEN_MISLUKT' }] };
    await botSleutelWisselen();
    sleutelCacheWissen();
    sleutel = nieuw;
    stappen.push({ stap: 'getMe', ok: true, info: `@${mij.username}` }, { stap: 'kluis', ok: true });
    await auditBeheer(door, 'sleutel', 'success', { botId: String(mij.id), username: mij.username, anders: mij.username.toLowerCase() !== verwacht.toLowerCase() });
  }
  if (!sleutel) return { stappen: [{ stap: 'sleutel', ok: false, fout: 'GEEN_SLEUTEL' }] };
  let bot: { id: number; username: string; naam: string } | undefined;
  let waarschuwing: string | undefined;
  const stap = async (naam: string, fn: () => Promise<unknown>) => {
    try { const info = await fn(); stappen.push({ stap: naam, ok: true, ...(typeof info === 'string' ? { info } : {}) }); }
    catch (e) { stappen.push({ stap: naam, ok: false, fout: e instanceof BotFout ? e.code : String((e as Error)?.message || 'ONBEKEND').slice(0, 60) }); }
  };
  if (!nieuw) await stap('getMe', async () => {
    const mij = await botAanroep<BotMij>(sleutel, 'getMe');
    bot = { id: mij.id, username: mij.username, naam: mij.first_name };
    if (mij.username.toLowerCase() !== verwacht.toLowerCase()) waarschuwing = 'ANDERE_BOT';
    return `@${mij.username}`;
  });
  const geheim = await webhookGeheim(true);
  await stap('webhook', () => botAanroep(sleutel, 'setWebhook', { url: `${SITE_BASIS()}${WEBHOOK_PAD}`, secret_token: geheim, allowed_updates: ['message', 'callback_query'], max_connections: 20 }));
  for (const taal of [...inst.bot.talen, 'standaard']) {
    const lc = taal === 'standaard' ? undefined : taal;
    const omschrijving = (k: keyof typeof OPDRACHT_OMSCHRIJVING) => taal === 'nl' ? OPDRACHT_OMSCHRIJVING[k].nl : taal === 'uk' ? OPDRACHT_OMSCHRIJVING[k].uk : `${OPDRACHT_OMSCHRIJVING[k].uk} · ${OPDRACHT_OMSCHRIJVING[k].nl}`.slice(0, 256);
    await stap(`opdrachten-${taal}`, () => botAanroep(sleutel, 'setMyCommands', { commands: OPDRACHTEN.map((c) => ({ command: c, description: omschrijving(c) })), ...(lc ? { language_code: lc } : {}) }));
    if (inst.bot.naam[taal]) await stap(`naam-${taal}`, () => botAanroep(sleutel, 'setMyName', { name: inst.bot.naam[taal], ...(lc ? { language_code: lc } : {}) }));
    if (inst.bot.omschrijving[taal]) await stap(`omschrijving-${taal}`, () => botAanroep(sleutel, 'setMyDescription', { description: inst.bot.omschrijving[taal], ...(lc ? { language_code: lc } : {}) }));
    if (inst.bot.kort[taal]) await stap(`kort-${taal}`, () => botAanroep(sleutel, 'setMyShortDescription', { short_description: inst.bot.kort[taal], ...(lc ? { language_code: lc } : {}) }));
  }
  await stap('menuknop', () => botAanroep(sleutel, 'setChatMenuButton', { menu_button: { type: 'commands' } }));
  await codePeper(true);
  await controleNu().catch(() => undefined);
  await auditBeheer(door, 'bot-instellen', stappen.every((s) => s.ok) ? 'success' : 'partial', { stappen: stappen.map((s) => `${s.stap}:${s.ok ? 'ok' : s.fout}`) });
  return { stappen, bot, waarschuwing };
}

export async function nieuweSleutelAnnuleren(door: string): Promise<void> { await nieuweBotSleutelVergeten(); await auditBeheer(door, 'sleutel-wissel-geannuleerd', 'success'); }

export async function webhookStand(): Promise<{ url: string; wachtend: number; laatsteFout: string; laatsteFoutOp: string | null; juist: boolean }> {
  const sleutel = await botSleutel();
  if (!sleutel) return { url: '', wachtend: 0, laatsteFout: 'GEEN_SLEUTEL', laatsteFoutOp: null, juist: false };
  const w = await botAanroep<WebhookInfo>(sleutel, 'getWebhookInfo');
  return { url: w.url, wachtend: w.pending_update_count, laatsteFout: String(w.last_error_message || '').slice(0, 200), laatsteFoutOp: w.last_error_date ? new Date(w.last_error_date * 1000).toISOString() : null, juist: w.url === `${SITE_BASIS()}${WEBHOOK_PAD}` };
}

/** Proefbericht naar de eigen gekoppelde Telegram(s) van de beheerder. */
export async function proefbericht(door: string): Promise<number> {
  let n = 0;
  for (const k of await koppelingenVanGebruiker(door)) {
    try { const { taal } = await taalVoor(k.telegram_id); await stuur(k.chat_id, t(TEKST.testBericht, taal), taal, { kaart: 'gelukt' }); n++; } catch { /* volgende */ }
  }
  await auditBeheer(door, 'proefbericht', n ? 'success' : 'failed', { verstuurd: n });
  if (!n) throw new Error('GEEN_EIGEN_KOPPELING');
  return n;
}

// ------------------------------------------------------------------------------------------------ instellingen (met «ongedaan maken», 10 min)
export async function instellingenOpslaan(door: string, invoer: unknown): Promise<TelegramInstellingen> {
  const oud = await instellingen();
  const nieuw = instellingenNormaliseren({ ...oud, ...(invoer && typeof invoer === 'object' ? invoer : {}) });
  for (const a of nieuw.code.verplichtVoor) if (!(await actieSoorten()).some((s) => s.sleutel === a)) throw new Error('ONBEKENDE_ACTIE');
  await sql(`INSERT INTO app.tg_instellingen (id, waarde, door, ongedaan_tot) VALUES ('vorige', $1::jsonb, $2, now() + interval '10 minutes')
    ON CONFLICT (id) DO UPDATE SET waarde = EXCLUDED.waarde, door = EXCLUDED.door, gewijzigd_op = now(), ongedaan_tot = EXCLUDED.ongedaan_tot`, [JSON.stringify(oud), door]);
  await sql(`INSERT INTO app.tg_instellingen (id, waarde, door) VALUES ('actief', $1::jsonb, $2)
    ON CONFLICT (id) DO UPDATE SET waarde = EXCLUDED.waarde, door = EXCLUDED.door, gewijzigd_op = now()`, [JSON.stringify(nieuw), door]);
  instellingenCacheWissen();
  const gewijzigd = Object.keys(nieuw).filter((k) => JSON.stringify((nieuw as Record<string, unknown>)[k]) !== JSON.stringify((oud as Record<string, unknown>)[k]));
  await auditBeheer(door, 'instellingen', 'success', { gewijzigd });
  return nieuw;
}
export async function instellingenOngedaan(door: string): Promise<TelegramInstellingen> {
  const [v] = await sql<{ waarde: unknown; ongedaan_tot: Date | null }>("SELECT waarde, ongedaan_tot FROM app.tg_instellingen WHERE id = 'vorige'");
  if (!v || !v.ongedaan_tot || new Date(v.ongedaan_tot).getTime() < Date.now()) throw new Error('ONGEDAAN_VERLOPEN');
  const terug = instellingenNormaliseren(v.waarde);
  await sql("UPDATE app.tg_instellingen SET waarde = $1::jsonb, door = $2, gewijzigd_op = now() WHERE id = 'actief'", [JSON.stringify(terug), door]);
  await sql("UPDATE app.tg_instellingen SET ongedaan_tot = NULL WHERE id = 'vorige'");
  instellingenCacheWissen();
  await auditBeheer(door, 'instellingen-ongedaan', 'success');
  return terug;
}

/** Noodschakelaar: in één klik Telegram-aanmelden voor iedereen uit (of weer aan). */
export async function noodschakelaar(door: string, aan: boolean): Promise<void> {
  await instellingenOpslaan(door, { aan });
  vlagCacheWissen();
  await auditBeheer(door, aan ? 'nood-aan' : 'nood-uit', 'success');
}

// ------------------------------------------------------------------------------------------------ handelingen in de tabel
export async function actieToevoegen(door: string, o: { sleutel?: unknown; naamUk?: unknown; naamNl?: unknown; minimum?: unknown; standaard?: unknown; gevoelig?: unknown }): Promise<void> {
  const sleutel = String(o.sleutel || '');
  if (!ACTIE_SLEUTEL_RE.test(sleutel) || INGEBOUWDE_ACTIES.some((a) => a.sleutel === sleutel)) throw new Error('SLEUTEL_ONGELDIG');
  const naamUk = String(o.naamUk || '').trim().slice(0, 80), naamNl = String(o.naamNl || '').trim().slice(0, 80);
  if (naamUk.length < 2 || naamNl.length < 2) throw new Error('NAAM_ONGELDIG');
  if (!isKeuze(o.minimum) || !isKeuze(o.standaard)) throw new Error('KEUZE_ONGELDIG');
  if (!minstensZoStreng(eisVan(o.standaard), eisVan(o.minimum))) throw new Error('STANDAARD_ZWAKKER_DAN_MINIMUM');
  const gevoelig = o.gevoelig === true;
  if (gevoelig && !eisVan(o.minimum).every((a) => a.includes('passkey'))) throw new Error('GEVOELIG_VRAAGT_PASSKEY');
  await sql(`INSERT INTO app.tg_acties (sleutel, naam_uk, naam_nl, minimum, standaard, gevoelig) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (sleutel) DO UPDATE SET naam_uk = EXCLUDED.naam_uk, naam_nl = EXCLUDED.naam_nl, minimum = EXCLUDED.minimum, standaard = EXCLUDED.standaard, gevoelig = EXCLUDED.gevoelig`,
    [sleutel, naamUk, naamNl, o.minimum, o.standaard, gevoelig]);
  await auditBeheer(door, 'actie-toegevoegd', 'success', { sleutel, minimum: o.minimum, standaard: o.standaard, gevoelig });
}
export async function actieVerwijderen(door: string, sleutel: string): Promise<void> {
  if (INGEBOUWDE_ACTIES.some((a) => a.sleutel === sleutel)) throw new Error('INGEBOUWD');
  await sql('DELETE FROM app.tg_acties WHERE sleutel = $1', [sleutel]);
  await auditBeheer(door, 'actie-verwijderd', 'success', { sleutel });
}

// ------------------------------------------------------------------------------------------------ koppelingen (alle accounts) en journaal
export async function koppelingenLijst(zoek: string): Promise<Array<Record<string, unknown>>> {
  const z = `%${String(zoek || '').trim().toLowerCase().replace(/[%_]/g, '')}%`;
  const rijen = await sql(`SELECT k.*, u.data->>'email' AS email, u.data->>'name' AS account_naam FROM app.tg_koppelingen k
      LEFT JOIN app.records u ON u.tbl = 'users' AND u.id = k.user_id
    WHERE ($1 = '%%' OR lower(coalesce(u.data->>'email','')) LIKE $1 OR lower(k.gebruikersnaam) LIKE $1 OR k.telefoon LIKE $1 OR k.telegram_id LIKE $1)
    ORDER BY k.aangemaakt_op DESC LIMIT 200`, [z]);
  return rijen.map((r) => ({ id: r.id, email: r.email, accountNaam: r.account_naam, telegramId: r.telegram_id, telefoon: r.telefoon, gebruikersnaam: r.gebruikersnaam, voornaam: r.voornaam, achternaam: r.achternaam,
    naam: r.naam, rechten: r.rechten, stand: r.stand, reden: r.reden, aangemaaktOp: r.aangemaakt_op, laatstGebruiktOp: r.laatst_gebruikt_op }));
}
export async function koppelingUitschakelen(door: string, id: string): Promise<string> {
  const r = await ontkoppelen(id, {}, 'beheer');
  await auditBeheer(door, 'koppeling-uit', r === 'ok' ? 'success' : 'failed', { koppeling: id });
  return r;
}
export async function journaal(limiet = 100): Promise<Array<Record<string, unknown>>> {
  const r = await getPool('systeem').query(`SELECT id, owner_id, actor_id, action, result, details, (extract(epoch FROM created_at) * 1000)::bigint AS ms FROM app.audit
    WHERE action LIKE 'telegram.%' ORDER BY id DESC LIMIT $1`, [Math.max(1, Math.min(500, limiet))]);
  return r.rows.map((x) => ({ id: String(x.id), ownerId: x.owner_id, actorId: x.actor_id, actie: x.action, resultaat: x.result, details: x.details, op: Number(x.ms) }));
}
