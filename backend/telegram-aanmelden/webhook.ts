// TELEGRAM-AANMELDEN v1 — de webhook van de bot. Publiek eindpunt; de ENIGE sleutel is de kop X-Telegram-Bot-Api-Secret-Token
// (tijdconstant vergeleken met het geheim uit de kluis). Elke update wordt één keer verwerkt (app.tg_updates), elke knop één
// keer (app.tg_knoppen: nieuw → bezig → klaar in één UPDATE), met een snelheidslimiet per Telegram-gebruiker. Antwoord altijd
// 200 na een geldige kop, zodat Telegram niet eindeloos opnieuw probeert; fouten gaan naar de statusdienst.
import { botAanroep } from './bot-api';
import { botSleutel, webhookGeheim } from './sleutels';
import { gelijk, knopHandtekeningKlopt, knopLezen, knopSleutel } from './cryptografie';
import { instellingen, koppelingenVanTelegram, sql, vlagHoofdschakelaar, gebeurtenis } from './opslag';
import { aftelRest, JA_LETTERS, bijwerken, knopAntwoord, knoppenMaken, stuur, succesTonen, taalVoor, strook, TAALKNOPPEN, type BotTaal, type Verzonden } from './berichten';
import { contactVanBot, koppelVanBot, type TgGebruiker } from './koppelen';
import { inlogGoedkeuren, inlogVanBot, inlogWeigeren } from './inloggen';
import { bevestigingVanBot } from './bevestigen';
import { wijziging, wijzigingBeantwoorden, vingerafdrukControleren } from './wijzigingen';
import { ontkoppelen } from './ontkoppelen';
import { codeInChatGezien, lijktOpCodeVan } from './code';
import { accountNaam } from './meldingen';
import { statusMelden } from './status';
import { invullen, t, TEKST } from '../../shared/telegram-aanmelden/teksten';

type Bericht = { message_id: number; chat: { id: number; type: string }; from?: TgGebruiker; text?: string; contact?: { user_id?: number; phone_number?: string }; photo?: unknown };
type KnopUpdate = { id: string; from: TgGebruiker; data?: string; message?: { message_id: number; chat: { id: number }; photo?: unknown } };
export type Update = { update_id: number; message?: Bericht; callback_query?: KnopUpdate };

export async function kopKlopt(kop: string): Promise<boolean> {
  const geheim = await webhookGeheim(false);
  return !!geheim && !!kop && gelijk(kop, geheim);
}

/** Verwerkt één update. Gooit nooit: elke fout wordt gelogd en geteld. */
export async function updateVerwerken(u: Update): Promise<void> {
  try {
    if (!(await vlagHoofdschakelaar()) || !(await instellingen()).aan) return;
    if (!Number.isSafeInteger(u?.update_id)) return;
    const nieuw = await sql('INSERT INTO app.tg_updates (update_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING update_id', [u.update_id]);
    if (!nieuw.length) return; // al verwerkt (Telegram herhaalt bij een trage 200)
    if (u.callback_query) await knopVerwerken(u.callback_query);
    else if (u.message) await berichtVerwerken(u.message);
    await statusMelden('webhook', true);
  } catch (e) {
    console.error('[telegram-aanmelden] update mislukt:', (e as Error)?.message);
    await statusMelden('webhook', false, String((e as Error)?.message || '').slice(0, 80)).catch(() => undefined);
  }
}

/** Snelheidslimiet per Telegram-gebruiker (glijdend venster van 60 s in app.tg_chats.pogingen). */
async function teSnel(telegramId: string, chatId: string): Promise<boolean> {
  const inst = await instellingen();
  const nu = Date.now();
  const [r] = await sql<{ pogingen: number[] }>(`INSERT INTO app.tg_chats (telegram_id, chat_id, laatste_op, pogingen) VALUES ($1,$2,now(),$3::jsonb)
    ON CONFLICT (telegram_id) DO UPDATE SET chat_id = EXCLUDED.chat_id, laatste_op = now(),
      pogingen = (SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) FROM jsonb_array_elements(app.tg_chats.pogingen) p WHERE (p)::bigint > $4) || $3::jsonb
    RETURNING pogingen`, [telegramId, chatId, JSON.stringify([nu]), nu - 60_000]);
  return (r?.pogingen?.length ?? 0) > inst.pogingenPerMinuut;
}

// ------------------------------------------------------------------------------------------------ berichten
async function berichtVerwerken(m: Bericht): Promise<void> {
  const van = m.from;
  if (!van || van.is_bot) return;
  if (m.chat.type !== 'private') return; // groepen: nooit (joingroups staat uit in BotFather; dubbel zeker)
  const tg = String(van.id), chatId = String(m.chat.id);
  const { taal, herkend } = await taalVoor(tg, van.language_code);
  if (await teSnel(tg, chatId)) { await stuur(chatId, t(TEKST.teSnel, taal), taal).catch(() => undefined); return; }

  // Profielwijzigingen opmerken bij elk bericht van een gekoppelde gebruiker (naam/@nikneim). Telefoon alleen via contact.
  for (const k of await koppelingenVanTelegram(tg)) {
    if (k.stand === 'actief') await vingerafdrukControleren(k, { telegramId: tg, gebruikersnaam: van.username ?? '', voornaam: van.first_name ?? '', achternaam: van.last_name ?? '' }, 'bot-bericht');
  }

  if (m.contact) {
    const r = await contactVanBot(van, m.contact);
    if (r === 'ok') await stuur(chatId, t(TEKST.telefoonOntvangen, taal), taal, { antwoordToetsenbord: { remove_keyboard: true } });
    else if (r === 'vreemd') await stuur(chatId, t(TEKST.vreemdContact, taal), taal);
    else await stuur(chatId, t(TEKST.koppelUitleg, taal), taal, { antwoordToetsenbord: { remove_keyboard: true } });
    return;
  }
  const tekst = String(m.text || '').trim();
  const [cmd, ...rest] = tekst.split(/\s+/);
  const opdracht = cmd.startsWith('/') ? cmd.slice(1).split('@')[0].toLowerCase() : '';
  const arg = rest.join(' ');

  if (opdracht === 'start') {
    if (/^k_[A-Za-z0-9_-]{12}$/.test(arg)) {
      const r = await koppelVanBot(arg.slice(2), van, chatId);
      if (r === 'telefoon') {
        await stuur(chatId, t(TEKST.telefoonVraag, taal), taal, { kaart: 'gewoon', antwoordToetsenbord: { keyboard: [[{ text: t(TEKST.deelKnop, taal === 'nl' ? 'nl' : 'uk'), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } });
      } else if (r === 'al-gekoppeld') await stuur(chatId, taal === 'nl' ? 'ℹ️ Deze Telegram is al aan dit account gekoppeld.' : taal === 'uk' ? 'ℹ️ Цей Telegram уже прив’язано до цього облікового запису.' : 'ℹ️ Цей Telegram уже прив’язано до цього облікового запису.\n\nℹ️ Deze Telegram is al aan dit account gekoppeld.', taal);
      else if (r === 'te-veel') await stuur(chatId, taal === 'nl' ? '⛔ Deze Telegram is al aan het maximum aantal accounts gekoppeld.' : '⛔ Цей Telegram уже прив’язано до максимальної кількості облікових записів.', taal);
      else await stuur(chatId, t(TEKST.koppelVerlopen, taal), taal);
      return;
    }
    if (/^i_[A-Za-z0-9_-]{12}$/.test(arg)) {
      const r = await inlogVanBot(arg.slice(2), van, chatId);
      if (r === 'verlopen') await stuur(chatId, t(TEKST.verlopen, taal), taal);
      else if (r === 'niet-gekoppeld') await stuur(chatId, t(TEKST.nietGekoppeld, taal), taal);
      else if (r === 'apparaat-geblokkeerd') await stuur(chatId, taal === 'nl' ? '⛔ Dit apparaat is geblokkeerd voor aanmelden met Telegram (eerder tikte u «Nee, dit ben ik niet» of weigerde u een wijziging). Meld u aan met Google en hef de blokkade op bij «Aanmeldmethoden».' : '⛔ Цей пристрій заблоковано для входу через Telegram (раніше ви натиснули «Ні, це не я» або відхилили зміну). Увійдіть через Google і зніміть блокування у «Способах входу».', taal);
      else if (r === 'gepauzeerd') await stuur(chatId, taal === 'nl' ? '⏸️ Aanmelden met deze Telegram staat op pauze: bevestig eerst de wijziging op de site met uw passkey.' : '⏸️ Вхід через цей Telegram призупинено: спершу підтвердьте зміну на сайті ключем доступу.', taal);
      return;
    }
    // Gewone /start: welkom + taal.
    const [chat] = await sql<{ taal: string | null }>('SELECT taal FROM app.tg_chats WHERE telegram_id = $1', [tg]);
    if (herkend && !chat?.taal) await stuur(chatId, `${t(TEKST.welkom, taal)}\n\n${t(TEKST.taalHerkend, taal)}`, taal, { kaart: 'gewoon', knoppen: await TAALKNOPPEN(tg) });
    else await stuur(chatId, chat?.taal ? t(TEKST.welkom, taal) : `${t(TEKST.kiesTaal, 'uk')}\n\n${t(TEKST.welkom, 'beide')}`, chat?.taal ? taal : 'beide', { kaart: 'gewoon', knoppen: await TAALKNOPPEN(tg) });
    return;
  }
  if (opdracht === 'taal') { await stuur(chatId, t(TEKST.kiesTaal, 'uk'), 'beide', { knoppen: await TAALKNOPPEN(tg) }); return; }
  if (opdracht === 'hulp' || opdracht === 'help') { await stuur(chatId, t(TEKST.hulp, taal), taal); return; }
  if (opdracht === 'koppelen') { await stuur(chatId, t(TEKST.koppelUitleg, taal), taal); return; }
  if (opdracht === 'status') { await stuur(chatId, await statusTekst(tg, taal), taal); return; }
  if (opdracht === 'aanmeldingen') { await stuur(chatId, await aanmeldingenTekst(tg, taal), taal); return; }
  if (opdracht === 'ontkoppelen') {
    const lijst = (await koppelingenVanTelegram(tg)).filter((k) => k.stand !== 'uitgeschakeld');
    if (!lijst.length) { await stuur(chatId, t(TEKST.nietGekoppeld, taal), taal); return; }
    const tl: 'uk' | 'nl' = taal === 'nl' ? 'nl' : 'uk';
    const rijen = [];
    for (const k of lijst) rijen.push([{ letter: 'o' as const, doel: `vraag:${k.id}`, tekst: `${['🔵', '🟢', '🟣', '🟠', '🟤'][k.kleur] ?? '🔵'} ${(await accountNaam(k.user_id)) || k.naam}`.slice(0, 60) }]);
    rijen.push([{ letter: 'c' as const, doel: 'ontkoppelen', tekst: t(TEKST.knopAnnuleren, tl) }]);
    await stuur(chatId, tl === 'nl' ? 'Welk account ontkoppelen?' : 'Від якого облікового запису відв’язати?', taal, { knoppen: await knoppenMaken(tg, `ontkoppel-${Date.now()}`, rijen) });
    return;
  }
  if (opdracht) { await stuur(chatId, t(TEKST.onbekend, taal), taal); return; }

  // Een getypt telefoonnummer tijdens het koppelen.
  if (/^\+?[\d\s().-]{7,20}$/.test(tekst)) {
    const [wacht] = await sql("SELECT 1 FROM app.tg_koppel_verzoeken WHERE telegram_id = $1 AND stand = 'wacht-telefoon' AND verloopt_op > now()", [tg]);
    if (wacht) { await stuur(chatId, t(TEKST.getyptNummer, taal), taal); return; }
  }
  // Iets dat op een geheime code lijkt: meteen weg uit de chat.
  const accounts = (await koppelingenVanTelegram(tg)).map((k) => k.user_id);
  const eigenaarCode = accounts.length ? await lijktOpCodeVan(accounts, tekst) : null;
  const lijktGeheim = eigenaarCode || /^\s*[0-9]{6,12}\s*$/.test(tekst);
  if (lijktGeheim) {
    await botAanroep(await botSleutel(), 'deleteMessage', { chat_id: chatId, message_id: m.message_id }).catch(() => undefined);
    if (eigenaarCode) await codeInChatGezien(eigenaarCode);
    await stuur(chatId, t(TEKST.geheimVerwijderd, taal), taal);
    return;
  }
  await stuur(chatId, t(TEKST.onbekend, taal), taal);
}

async function statusTekst(tg: string, taal: BotTaal): Promise<string> {
  const lijst = await koppelingenVanTelegram(tg);
  if (!lijst.length) return t(TEKST.nietGekoppeld, taal);
  const tl: 'uk' | 'nl' = taal === 'nl' ? 'nl' : 'uk';
  const standen: Record<string, [string, string]> = { actief: ['✅ працює', '✅ werkt'], gepauzeerd: ['⏸️ призупинено — підтвердьте зміну на сайті', '⏸️ op pauze — bevestig de wijziging op de site'], geblokkeerd: ['⛔ заблоковано — прив’яжіть заново', '⛔ geblokkeerd — koppel opnieuw'], uitgeschakeld: ['— вимкнено', '— uitgeschakeld'] };
  const regels = [];
  for (const k of lijst) regels.push(`${['🔵', '🟢', '🟣', '🟠', '🟤'][k.kleur] ?? '🔵'} ${(await accountNaam(k.user_id)) || k.naam} — ${standen[k.stand]?.[tl === 'nl' ? 1 : 0] ?? k.stand}`);
  return `${tl === 'nl' ? 'Mijn koppelingen' : 'Мої прив’язки'}:\n${regels.join('\n')}`;
}
async function aanmeldingenTekst(tg: string, taal: BotTaal): Promise<string> {
  const tl: 'uk' | 'nl' = taal === 'nl' ? 'nl' : 'uk';
  const rijen = await sql<{ apparaat: string; aangemaakt_op: Date; stand: string }>("SELECT apparaat, aangemaakt_op, stand FROM app.tg_inlog_verzoeken WHERE telegram_id = $1 AND stand IN ('ingewisseld','geweigerd') ORDER BY aangemaakt_op DESC LIMIT 5", [tg]);
  if (!rijen.length) return tl === 'nl' ? 'Nog geen aanmeldingen met Telegram.' : 'Ще не було входів через Telegram.';
  const { brusselsTijd } = await import('../nieuw-apparaat');
  return `${tl === 'nl' ? 'Laatste aanmeldingen' : 'Останні входи'}:\n${rijen.map((r) => `${r.stand === 'ingewisseld' ? '✅' : '⛔'} ${brusselsTijd(new Date(r.aangemaakt_op).getTime(), tl)} · ${r.apparaat}`).join('\n')}`;
}

// ------------------------------------------------------------------------------------------------ knoppen
type KnopRij = { id: string; letter: string; telegram_id: string; doel: string; verloopt_sec: string; stand: string; groep: string; aftel_sec: number; aangemaakt_op: Date };
async function knopVerwerken(q: KnopUpdate): Promise<void> {
  const tg = String(q.from.id);
  const { taal } = await taalVoor(tg, q.from.language_code);
  const k = knopLezen(String(q.data || ''));
  if (!k) { await knopAntwoord(q.id, t(TEKST.verlopen, taal === 'beide' ? 'uk' : taal)); return; }
  const [rij] = await sql<KnopRij>('SELECT * FROM app.tg_knoppen WHERE id = $1', [k.id]);
  const sleutel = knopSleutel(await webhookGeheim(false) || 'tg-zonder-webhook');
  const tl: 'uk' | 'nl' = taal === 'nl' ? 'nl' : 'uk';
  if (!rij || rij.letter !== k.letter || rij.telegram_id !== tg || !knopHandtekeningKlopt(sleutel, k, tg, Number(rij.verloopt_sec))) { await knopAntwoord(q.id, t(TEKST.verlopen, tl), true); return; }
  if (Number(rij.verloopt_sec) * 1000 < Date.now()) { await knopAntwoord(q.id, t(TEKST.verlopen, tl), true); if (q.message) await bijwerken(bericht(q), t(TEKST.verlopen, taal), taal); return; }
  if (await teSnel(tg, String(q.message?.chat.id ?? tg))) { await knopAntwoord(q.id, t(TEKST.teSnel, tl)); return; }
  // Aftelling (server-side): een «Так» vóór de tijd telt niet — eerst de kaart lezen. «Ні» werkt altijd meteen.
  if (JA_LETTERS.has(k.letter) && rij.stand === 'nieuw') {
    const rest = aftelRest(new Date(rij.aangemaakt_op).getTime(), Number(rij.aftel_sec || 0), Date.now());
    if (rest > 0) { await knopAntwoord(q.id, tl === 'nl' ? `⏳ Nog ${rest} s — lees eerst de kaart: apparaat, plaats en tijd. Bent u het niet, tik dan «Nee».` : `⏳ Ще ${rest} с — спершу прочитайте картку: пристрій, місце і час. Якщо це не ви — натисніть «Ні».`, true); return; }
  }
  // Eén keer: nieuw → bezig (atomisch). Dertig tikken = één handeling; de rest hoort «вже виконується».
  const [claim] = await sql("UPDATE app.tg_knoppen SET stand = 'bezig' WHERE id = $1 AND stand = 'nieuw' RETURNING id", [k.id]);
  if (!claim) { await knopAntwoord(q.id, t(rij.stand === 'bezig' ? TEKST.alBezig : TEKST.alGedaan, tl)); return; }
  await knopAntwoord(q.id, t(TEKST.ontvangen, tl));
  const v = q.message ? bericht(q) : null;
  let uitkomst = '';
  try {
    uitkomst = await knopUitvoeren(k.letter, rij, tg, taal, v);
  } catch (e) {
    uitkomst = 'fout';
    await sql("UPDATE app.tg_knoppen SET stand = 'nieuw' WHERE id = $1", [k.id]); // opnieuw proberen mag na een storing
    if (v) await bijwerken(v, t(TEKST.storingTijdelijk, taal), taal).catch(() => undefined);
    throw e;
  }
  await sql("UPDATE app.tg_knoppen SET stand = 'klaar', uitkomst = $2, gebruikt_op = now() WHERE id = $1", [k.id, uitkomst.slice(0, 40)]);
  if (rij.groep) await sql("UPDATE app.tg_knoppen SET stand = 'vervallen' WHERE groep = $1 AND id <> $2 AND stand = 'nieuw'", [rij.groep, k.id]);
}
const bericht = (q: KnopUpdate): Verzonden => ({ chatId: String(q.message!.chat.id), berichtId: q.message!.message_id, isFoto: !!q.message!.photo });

async function knopUitvoeren(letter: string, rij: KnopRij, tg: string, taal: BotTaal, v: Verzonden | null): Promise<string> {
  const werk = async (tekst: string) => { if (v) await bijwerken(v, tekst, taal); };
  switch (letter) {
    case 'i': {
      const r = await inlogGoedkeuren(rij.doel, tg);
      if (r.uitkomst === 'ok') { await werk(t(TEKST.ingelogd, taal)); if (v) await succesTonen(v.chatId); }
      else if (r.uitkomst === 'code') await werk(taal === 'nl' ? '🔑 Bevestigd in Telegram. Typ nu uw geheime code op de site (nooit hier in de chat).' : taal === 'uk' ? '🔑 Підтверджено в Telegram. Тепер уведіть таємний код на сайті (ніколи тут у чаті).' : '🔑 Підтверджено в Telegram. Тепер уведіть таємний код на сайті (ніколи тут у чаті).\n\n🔑 Bevestigd in Telegram. Typ nu uw geheime code op de site (nooit hier in de chat).');
      else if (r.uitkomst === 'passkey-nodig') await werk(taal === 'nl' ? '🔐 Voor dit account (of dit nieuwe apparaat) is een passkey nodig. Meld u op de site aan met uw passkey.' : '🔐 Для цього облікового запису (або цього нового пристрою) потрібен ключ доступу. Увійдіть на сайті ключем доступу.');
      else if (r.uitkomst === 'geweigerd') await werk(t(TEKST.storingVast, taal));
      else await werk(t(TEKST.verlopen, taal));
      await gebeurtenis('knop-inloggen', r.uitkomst === 'ok' || r.uitkomst === 'code');
      return r.uitkomst;
    }
    case 'n': {
      if (rij.doel.startsWith('b:')) { const r = await bevestigingVanBot(rij.doel.slice(2), tg, false); await werk(r === 'geweigerd' ? t(TEKST.geweigerd, taal) : t(TEKST.verlopen, taal)); return r; }
      const ok = await inlogWeigeren(rij.doel, tg);
      await werk(ok ? t(TEKST.geweigerd, taal) : t(TEKST.verlopen, taal));
      return ok ? 'geweigerd' : 'verlopen';
    }
    case 'b': {
      const r = await bevestigingVanBot(rij.doel, tg, true);
      await werk(r === 'bevestigd' ? `${t(TEKST.bevestigd, taal)}\n${taal === 'nl' ? 'Ga terug naar de site; de handeling gaat vanzelf verder.' : 'Поверніться на сайт — дія продовжиться сама.'}` : t(TEKST.verlopen, taal));
      if (r === 'bevestigd' && v) await succesTonen(v.chatId);
      return r;
    }
    case 'w': case 'x': {
      const w = await wijziging(rij.doel);
      if (!w) { await werk(t(TEKST.verlopen, taal)); return 'onbekend'; }
      const r = await wijzigingBeantwoorden(w.id, letter === 'w' ? 'ja' : 'nee', { userId: w.user_id, bron: 'telegram', metPasskey: false });
      if (!r.ok) { await werk(t(TEKST.verlopen, taal)); return r.fout; }
      await werk(letter === 'w' ? t(TEKST.gezien, taal) : r.gevolg.toestand.conflict ? t(TEKST.conflict, taal) : t(TEKST.geweigerd, taal));
      return r.gevolg.toestand.status;
    }
    case 'o': {
      const [stap, id] = rij.doel.split(':');
      if (stap === 'vraag') {
        const tl: 'uk' | 'nl' = taal === 'nl' ? 'nl' : 'uk';
        const lijst = await koppelingenVanTelegram(tg);
        const k = lijst.find((x) => x.id === id);
        if (!k) { await werk(t(TEKST.verlopen, taal)); return 'onbekend'; }
        const naam = (await accountNaam(k.user_id)) || k.naam;
        const knoppen = await knoppenMaken(tg, `ontkoppel-${id}`, [[{ letter: 'o', doel: `ja:${id}`, tekst: t(TEKST.knopOntkoppelBevestig, tl) }], [{ letter: 'c', doel: 'ontkoppelen', tekst: t(TEKST.knopAnnuleren, tl) }]]);
        if (v) await bijwerken(v, `${strook(naam, k.kleur, taal)}\n\n${taal === 'beide' ? `${invullen(TEKST.ontkoppelVraag.uk, { account: naam })}\n\n${invullen(TEKST.ontkoppelVraag.nl, { account: naam })}` : invullen(TEKST.ontkoppelVraag[taal], { account: naam })}`, taal, knoppen);
        return 'gevraagd';
      }
      const r = await ontkoppelen(id, { telegramId: tg }, 'bot');
      await werk(r === 'ok' ? t(TEKST.ontkoppeld, taal) : r === 'laatste' ? t(TEKST.laatsteMethode, taal) : t(TEKST.verlopen, taal));
      return r;
    }
    case 't': case 'l': {
      const nieuw = letter === 't' ? 'uk' : 'nl';
      await sql('UPDATE app.tg_chats SET taal = $2 WHERE telegram_id = $1', [tg, nieuw]);
      await werk(t(TEKST.taalGekozen, nieuw));
      return nieuw;
    }
    case 'c': { await werk(taal === 'nl' ? 'Geannuleerd.' : taal === 'uk' ? 'Скасовано.' : 'Скасовано. · Geannuleerd.'); return 'geannuleerd'; }
    default: await werk(t(TEKST.verlopen, taal)); return 'onbekend';
  }
}
