// TELEGRAM-AANMELDEN v1 — berichten naar Telegram: taalkeuze, accountstrook, kaarten (sendPhoto) of tekst, eenmalige knoppen,
// voetregel «Я ніколи не прошу паролів чи кодів.». Alle tekst als platte tekst (geen parse_mode): niets uit een gebruikersnaam
// of profiel kan opmaak of links injecteren.
import { botAanroep, BotFout } from './bot-api';
import { botSleutel, webhookGeheim } from './sleutels';
import { instellingen, sql } from './opslag';
import { knopLezen, knopSleutel, knopTekenen, nieuweId, type KnopLetter } from './cryptografie';
import { kaartPng, succesAnimatie } from './kaarten';
import { metVoet, t, TEKST, type BotTekst } from '../../shared/telegram-aanmelden/teksten';
import { STROOK_KLEUREN, type KaartSoort, type Taal } from '../../shared/telegram-aanmelden/model';

export type BotTaal = Taal | 'beide';
export type Knop = { letter: KnopLetter; doel: string; tekst: string } | { url: string; tekst: string } | { webApp: string; tekst: string };
export const SITE_BASIS = (): string => String(process.env.AANMELD_TERUG_BASIS || 'https://id.tarasevych.com').replace(/\/+$/, '');

/** Accountstrook bovenaan elke melding: «🔵 Мій простір · Ім'я». */
export function strook(accountNaam: string, kleur: number, taal: BotTaal): string {
  const site = taal === 'nl' ? 'Mijn Ruimte' : taal === 'beide' ? 'Мій простір · Mijn Ruimte' : 'Мій простір';
  return `${STROOK_KLEUREN[Math.max(0, Math.min(4, kleur))]} ${site}${accountNaam ? ` · ${accountNaam}` : ''}`;
}

/** Knoppen die iets TOESTAAN («Так, це я», «Підтвердити», «Це був я»): werken pas na de aftelling (op de server, zie webhook.ts). */
export const JA_LETTERS: ReadonlySet<string> = new Set(['i', 'b', 'w', 's' /* APPARAAT-001: symboolknoppen tellen als «Так» (aftelling) */]);
const AFTEL_KAARTEN: ReadonlySet<string> = new Set(['nieuwApparaat', 'verdacht']);

/** Maakt eenmalige, ondertekende knoppen (rij per knop) en legt ze vast in app.tg_knoppen. */
export async function knoppenMaken(telegramId: string, groep: string, knoppen: Knop[][]): Promise<Array<Array<Record<string, unknown>>>> {
  const inst = await instellingen();
  const verlooptSec = Math.floor(Date.now() / 1000) + inst.knopTokenSeconden;
  const sleutel = knopSleutel(await webhookGeheim(false) || 'tg-zonder-webhook');
  const rijen: Array<Array<Record<string, unknown>>> = [];
  for (const rij of knoppen) {
    const uit: Array<Record<string, unknown>> = [];
    for (const k of rij) {
      if ('url' in k) { uit.push({ text: k.tekst, url: k.url }); continue; }
      if ('webApp' in k) { uit.push({ text: k.tekst, web_app: { url: k.webApp } }); continue; }
      const id = nieuweId();
      await sql('INSERT INTO app.tg_knoppen (id, letter, telegram_id, doel, verloopt_sec, groep, aftel_sec) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, k.letter, telegramId, k.doel, verlooptSec, groep, JA_LETTERS.has(k.letter) ? inst.aftelSeconden : 0]);
      uit.push({ text: k.tekst, callback_data: knopTekenen(sleutel, k.letter, id, telegramId, verlooptSec) });
    }
    rijen.push(uit);
  }
  return rijen;
}

export type Verzonden = { chatId: string; berichtId: number; isFoto: boolean };

/** Verstuurt een bericht; met `kaart` en afbeeldingen aan als foto met onderschrift. Voetregel komt er altijd bij. */
export async function stuur(chatId: string, tekst: string, taal: BotTaal, opties: { kaart?: KaartSoort; knoppen?: Array<Array<Record<string, unknown>>>; antwoordToetsenbord?: Record<string, unknown> } = {}): Promise<Verzonden> {
  const sleutel = await botSleutel();
  const inst = await instellingen();
  const inhoud = metVoet(tekst, taal);
  // Aftelling: «Так»-knoppen eerst met «⏳ N с ·» ervoor; na N seconden dezelfde knoppen (zelfde tokens) zonder zandloper.
  // De server weigert een tik vóór die tijd toch (webhook.ts), dus ook een snelle of automatische tik helpt niet.
  const jaIds = (opties.knoppen ?? []).flat().map((b) => knopLezen(String(b.callback_data ?? ''))).filter((k) => !!k && JA_LETTERS.has(k.letter)).map((k) => k!.id);
  const aftel = jaIds.length ? (AFTEL_KAARTEN.has(String(opties.kaart || '')) ? inst.aftelSecondenErnstig : inst.aftelSeconden) : 0;
  if (aftel > 0) await sql('UPDATE app.tg_knoppen SET aftel_sec = $2 WHERE id = ANY($1::text[])', [jaIds, aftel]);
  const eenheid = taal === 'nl' ? 's' : 'с';
  const metZandloper = aftel > 0 && opties.knoppen
    ? opties.knoppen.map((rij) => rij.map((b) => { const k = knopLezen(String(b.callback_data ?? '')); return k && JA_LETTERS.has(k.letter) ? { ...b, text: `⏳ ${aftel} ${eenheid} · ${String(b.text)}`.slice(0, 64) } : b; }))
    : opties.knoppen;
  const reply_markup = opties.antwoordToetsenbord ?? (metZandloper ? { inline_keyboard: metZandloper } : undefined);
  let v: Verzonden;
  if (opties.kaart && inst.afbeeldingen && inhoud.length <= 1000) {
    const r = await botAanroep<{ message_id: number }>(sleutel, 'sendPhoto', { chat_id: chatId, caption: inhoud, ...(reply_markup ? { reply_markup } : {}) },
      { bestand: { veld: 'photo', naam: `kaart-${opties.kaart}.png`, type: 'image/png', inhoud: kaartPng(opties.kaart) } });
    v = { chatId, berichtId: r.message_id, isFoto: true };
  } else {
    const r = await botAanroep<{ message_id: number }>(sleutel, 'sendMessage', { chat_id: chatId, text: inhoud, disable_web_page_preview: true, ...(reply_markup ? { reply_markup } : {}) });
    v = { chatId, berichtId: r.message_id, isFoto: false };
  }
  if (aftel > 0 && opties.knoppen) {
    const origineel = opties.knoppen;
    const t = setTimeout(() => {
      // Alleen als er nog niets getikt is (een «Ні» haalt de knoppen al weg).
      void sql("SELECT count(*)::int AS n FROM app.tg_knoppen WHERE id = ANY($1::text[]) AND stand = 'nieuw'", [jaIds])
        .then(([r]) => (Number(r?.n) > 0 ? botAanroep(sleutel, 'editMessageReplyMarkup', { chat_id: chatId, message_id: v.berichtId, reply_markup: { inline_keyboard: origineel } }) : undefined))
        .catch(() => undefined);
    }, aftel * 1000);
    (t as { unref?: () => void }).unref?.();
  }
  return v;
}

/** Hoeveel seconden een «Так»-knop nog moet wachten (0 = mag). Puur, getest. */
export function aftelRest(aangemaaktMs: number, aftelSec: number, nuMs: number): number {
  if (!aftelSec) return 0;
  const rest = aangemaaktMs + aftelSec * 1000 - 250 - nuMs;
  return rest > 0 ? Math.ceil(rest / 1000) : 0;
}

/** Korte animatie bij succes (alleen als de beheerder animaties aan heeft). Fouten zijn niet erg: de tekst is al verstuurd. */
export async function succesTonen(chatId: string): Promise<void> {
  const inst = await instellingen();
  if (!inst.animatie) return;
  await botAanroep(await botSleutel(), 'sendAnimation', { chat_id: chatId }, { bestand: { veld: 'animation', naam: 'gelukt.gif', type: 'image/gif', inhoud: succesAnimatie() } }).catch(() => undefined);
}

/** Bericht ter plekke bijwerken («⏳ Перевіряю» → «✅ Підтверджено»), knoppen weg of vervangen. */
export async function bijwerken(v: Verzonden, tekst: string, taal: BotTaal, knoppen?: Array<Array<Record<string, unknown>>>): Promise<void> {
  const sleutel = await botSleutel();
  const inhoud = metVoet(tekst, taal);
  const reply_markup = { inline_keyboard: knoppen ?? [] };
  try {
    if (v.isFoto) await botAanroep(sleutel, 'editMessageCaption', { chat_id: v.chatId, message_id: v.berichtId, caption: inhoud.slice(0, 1024), reply_markup });
    else await botAanroep(sleutel, 'editMessageText', { chat_id: v.chatId, message_id: v.berichtId, text: inhoud, disable_web_page_preview: true, reply_markup });
  } catch (e) { if (!(e instanceof BotFout && e.code === 'NIET_GEWIJZIGD')) throw e; }
}
export async function knoppenWeg(chatId: string, berichtId: number): Promise<void> {
  await botAanroep(await botSleutel(), 'editMessageReplyMarkup', { chat_id: chatId, message_id: berichtId, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
}
export async function typen(chatId: string): Promise<void> {
  await botAanroep(await botSleutel(), 'sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => undefined);
}
export async function knopAntwoord(id: string, tekst: string, alarm = false): Promise<void> {
  await botAanroep(await botSleutel(), 'answerCallbackQuery', { callback_query_id: id, text: tekst.slice(0, 190), show_alert: alarm }).catch(() => undefined);
}

/** Taal voor een Telegram-gebruiker: eigen keuze (/taal) > taal van de site van een gekoppeld account > language_code > tweetalig. */
export async function taalVoor(telegramId: string, languageCode?: string): Promise<{ taal: BotTaal; herkend: boolean }> {
  const [c] = await sql<{ taal: string | null }>('SELECT taal FROM app.tg_chats WHERE telegram_id = $1', [telegramId]);
  if (c?.taal === 'uk' || c?.taal === 'nl') return { taal: c.taal, herkend: false };
  const [k] = await sql<{ site_taal: string }>("SELECT site_taal FROM app.tg_koppelingen WHERE telegram_id = $1 AND stand <> 'uitgeschakeld' ORDER BY laatst_gebruikt_op DESC NULLS LAST LIMIT 1", [telegramId]);
  if (k?.site_taal === 'uk' || k?.site_taal === 'nl') return { taal: k.site_taal, herkend: false };
  const lc = String(languageCode || '').slice(0, 2).toLowerCase();
  if (lc === 'uk' || lc === 'nl') return { taal: lc, herkend: true };
  return { taal: 'beide', herkend: false };
}
export const tekst = (x: BotTekst, taal: BotTaal): string => t(x, taal);
export const TAALKNOPPEN = async (telegramId: string): Promise<Array<Array<Record<string, unknown>>>> =>
  knoppenMaken(telegramId, `taal-${telegramId}-${Date.now()}`, [[{ letter: 't', doel: 'uk', tekst: '🇺🇦 Українська' }, { letter: 'l', doel: 'nl', tekst: '🇳🇱 Nederlands' }]]);
export { TEKST };
