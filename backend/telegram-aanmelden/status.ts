// TELEGRAM-AANMELDEN v1 — statusdienst (punt H). Eerlijk en voorspellend: niet «probeer over een half uur», maar wat er echt aan
// de hand is. Bronnen: elke echte Bot API-aanroep/webhook-update (statusMelden) + elke minuut een getMe-controle.
// Soorten storing:  tijdelijk (netwerk, 5xx, 429 — vanzelf opnieuw)  ·  lang (tijdelijk, maar al > 10 minuten)  ·
//                   vast (sleutel ingetrokken/ongeldig, bot geblokkeerd — opnieuw proberen helpt niet, beheerder moet iets doen).
// Bij een overgang naar storing of terug: melding aan de beheerder. Daarnaast: verlopen wijzigingen afhandelen en opruimen.
import { botAanroep, BotFout, type BotMij } from './bot-api';
import { botSleutel } from './sleutels';
import { instellingen, sql, vlagHoofdschakelaar } from './opslag';
import { beheerAlarm } from './meldingen';
import { verlopenWijzigingenAfhandelen } from './wijzigingen';

export type StatusStand = 'werkt' | 'traag' | 'storing' | 'onbekend' | 'niet-ingesteld';
export type StoringSoort = '' | 'tijdelijk' | 'lang' | 'vast';
export const LANG_NA_MS = 10 * 60_000;
export const TRAAG_MS = 3_000;

/** Pure beslisregel (getest): nieuwe stand uit de vorige + de laatste controle. */
export function volgendeStand(vorig: { stand: StatusStand; soort: StoringSoort; sinds: number }, c: { ok: boolean; duurMs: number; fout?: 'tijdelijk' | 'vast' | 'geen-sleutel' }, nu: number): { stand: StatusStand; soort: StoringSoort; sinds: number } {
  if (c.fout === 'geen-sleutel') return { stand: 'niet-ingesteld', soort: '', sinds: vorig.stand === 'niet-ingesteld' ? vorig.sinds : nu };
  if (c.ok) {
    const stand: StatusStand = c.duurMs > TRAAG_MS ? 'traag' : 'werkt';
    return { stand, soort: '', sinds: vorig.stand === stand ? vorig.sinds : nu };
  }
  if (c.fout === 'vast') return { stand: 'storing', soort: 'vast', sinds: vorig.stand === 'storing' && vorig.soort === 'vast' ? vorig.sinds : nu };
  const sinds = vorig.stand === 'storing' ? vorig.sinds : nu;
  return { stand: 'storing', soort: nu - sinds >= LANG_NA_MS ? 'lang' : 'tijdelijk', sinds };
}

async function huidig(methode = 'telegram'): Promise<{ stand: StatusStand; soort: StoringSoort; sinds: number }> {
  const [r] = await sql<{ stand: StatusStand; soort: StoringSoort; sinds: Date }>('SELECT stand, soort, sinds FROM app.tg_status WHERE methode = $1', [methode]);
  return r ? { stand: r.stand, soort: r.soort, sinds: new Date(r.sinds).getTime() } : { stand: 'onbekend', soort: '', sinds: Date.now() };
}

async function vastleggen(c: { ok: boolean; duurMs: number; fout?: 'tijdelijk' | 'vast' | 'geen-sleutel' }, oorzaak: string): Promise<void> {
  const vorig = await huidig();
  const nu = Date.now();
  const v = volgendeStand(vorig, c, nu);
  await sql(`INSERT INTO app.tg_status (methode, stand, soort, oorzaak, sinds, laatste_controle, reeks) VALUES ('telegram',$1,$2,$3,$4,now(),$5::jsonb)
    ON CONFLICT (methode) DO UPDATE SET stand = EXCLUDED.stand, soort = EXCLUDED.soort, oorzaak = EXCLUDED.oorzaak, sinds = EXCLUDED.sinds, laatste_controle = now(),
      reeks = (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (SELECT x FROM jsonb_array_elements(app.tg_status.reeks) x ORDER BY (x->>'t')::bigint DESC LIMIT 1439) s) || EXCLUDED.reeks`,
    [v.stand, v.soort, oorzaak.slice(0, 120), new Date(v.sinds), JSON.stringify([{ t: nu, ok: c.ok, ms: Math.round(c.duurMs) }])]);
  const wasStoring = vorig.stand === 'storing', isStoring = v.stand === 'storing';
  if (isStoring && (!wasStoring || vorig.soort !== v.soort) && v.soort !== 'tijdelijk') {
    await beheerAlarm(`status-${v.soort}`, { oorzaak }, v.soort === 'vast'
      ? { uk: `Вхід через Telegram не працює: ${oorzaak}. Повторні спроби не допоможуть — перевірте ключ бота в «Способи входу» → Telegram.`, nl: `Aanmelden met Telegram werkt niet: ${oorzaak}. Opnieuw proberen helpt niet — controleer de botsleutel in «Aanmeldmethoden» → Telegram.` }
      : { uk: `Вхід через Telegram не працює вже понад 10 хвилин (${oorzaak}). Користувачам показано інші способи входу.`, nl: `Aanmelden met Telegram werkt al meer dan 10 minuten niet (${oorzaak}). Gebruikers zien andere aanmeldmethoden.` });
  }
  if (wasStoring && !isStoring && v.stand !== 'niet-ingesteld') {
    await beheerAlarm('status-hersteld', {}, { uk: 'Вхід через Telegram знову працює.', nl: 'Aanmelden met Telegram werkt weer.' });
  }
}

const foutSoort = (e: unknown): 'tijdelijk' | 'vast' => (e instanceof BotFout && e.soort === 'vast' ? 'vast' : 'tijdelijk');
const oorzaakVan = (e: unknown): string => (e instanceof BotFout ? e.code : 'ONBEKEND');

/** Elke echte uitkomst telt mee (webhook verwerkt, bericht verstuurd). Alleen fouten veranderen de stand meteen. */
export async function statusMelden(_kanaal: string, ok: boolean, oorzaak = ''): Promise<void> {
  if (ok) return; // succes laat de minuutcontrole bevestigen (geen schrijfactie per update)
  await vastleggen({ ok: false, duurMs: 0, fout: 'tijdelijk' }, oorzaak || 'WEBHOOK_FOUT').catch(() => undefined);
}

/** De controle zelf (ook door de knop «Перевірити зараз» in het beheerpaneel). */
export async function controleNu(): Promise<{ stand: StatusStand; soort: StoringSoort; oorzaak: string; duurMs: number; bot?: BotMij }> {
  const sleutel = await botSleutel();
  if (!sleutel) { await vastleggen({ ok: false, duurMs: 0, fout: 'geen-sleutel' }, 'GEEN_SLEUTEL'); return { ...(await huidig()), oorzaak: 'GEEN_SLEUTEL', duurMs: 0 }; }
  const t0 = Date.now();
  try {
    const bot = await botAanroep<BotMij>(sleutel, 'getMe', {}, { tijdslimietMs: 8_000 });
    const duurMs = Date.now() - t0;
    const verwacht = (await instellingen()).botGebruikersnaam.toLowerCase();
    const oorzaak = bot.username?.toLowerCase() === verwacht ? '' : `ANDERE_BOT:${bot.username}`;
    await vastleggen({ ok: true, duurMs }, oorzaak);
    return { ...(await huidig()), oorzaak, duurMs, bot };
  } catch (e) {
    const duurMs = Date.now() - t0;
    await vastleggen({ ok: false, duurMs, fout: foutSoort(e) }, oorzaakVan(e));
    return { ...(await huidig()), oorzaak: oorzaakVan(e), duurMs };
  }
}

let bezig = false;
/** Minuutronde (server/start.ts). Doet niets zolang de vlag uit staat. */
export async function statusRonde(): Promise<void> {
  if (bezig) return;
  bezig = true;
  try {
    if (!(await vlagHoofdschakelaar())) return;
    await controleNu();
    await verlopenWijzigingenAfhandelen();
    await opruimen();
  } catch (e) {
    console.error('[telegram-aanmelden] statusronde mislukt:', (e as Error)?.message);
  } finally { bezig = false; }
}

/** Oude eenmalige gegevens weg (bewaartermijnen staan ook in BEVEILIGING-TELEGRAM.md). */
export async function opruimen(): Promise<void> {
  await sql("DELETE FROM app.tg_updates WHERE ontvangen_op < now() - interval '2 days'");
  await sql("DELETE FROM app.tg_eenmalig WHERE op < now() - interval '2 days'");
  await sql("DELETE FROM app.tg_knoppen WHERE aangemaakt_op < now() - interval '7 days'");
  await sql("UPDATE app.tg_inlog_verzoeken SET stand = 'verlopen' WHERE stand IN ('wacht','goedgekeurd') AND verloopt_op < now()");
  await sql("UPDATE app.tg_koppel_verzoeken SET stand = 'verlopen' WHERE stand IN ('wacht-bot','wacht-telefoon','wacht-widget','wacht-passkey') AND verloopt_op < now()");
  await sql("UPDATE app.tg_bevestigingen SET stand = 'verlopen' WHERE stand = 'wacht' AND verloopt_op < now()");
  await sql("DELETE FROM app.tg_inlog_verzoeken WHERE aangemaakt_op < now() - interval '90 days'");
  await sql("DELETE FROM app.tg_koppel_verzoeken WHERE aangemaakt_op < now() - interval '30 days'");
  await sql("DELETE FROM app.tg_bevestigingen WHERE aangemaakt_op < now() - interval '30 days'");
  await sql("DELETE FROM app.tg_gebeurtenissen WHERE op < now() - interval '400 days'");
}

/** Publieke stand (aanmeldscherm, gebruikerspagina): wat werkt er en wat betekent dat voor u. */
export async function publiekeStand(): Promise<{ stand: StatusStand; soort: StoringSoort; sinds: string }> {
  const h = await huidig();
  return { stand: h.stand, soort: h.soort, sinds: new Date(h.sinds).toISOString() };
}
