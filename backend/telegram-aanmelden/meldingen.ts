// TELEGRAM-AANMELDEN v1 — meldingen naar de site (meldingencentrum) en naar alle gekoppelde Telegrams van een account, en het
// rode alarm naar de beheerder. Elke melding zegt: wie, wat, wanneer, waarom, wat het betekent en wat nu.
import { auditToevoegen } from '../../server/platform/audit';
import { meld } from '../melder';
import { eigenaarUserId } from '../integraties-kluis';
import { brusselsTijd } from '../nieuw-apparaat';
import { koppelingenVanGebruiker, sql } from './opslag';
import { knoppenMaken, SITE_BASIS, strook, stuur, taalVoor, type Knop } from './berichten';
import type { KaartSoort } from '../../shared/telegram-aanmelden/model';
import type { BotTekst } from '../../shared/telegram-aanmelden/teksten';
import { TEKST, t } from '../../shared/telegram-aanmelden/teksten';

export const tijdTekst = (taal: 'uk' | 'nl' | 'beide', ms = Date.now()): string =>
  taal === 'beide' ? `${brusselsTijd(ms, 'uk')} · ${brusselsTijd(ms, 'nl')}` : `${brusselsTijd(ms, taal)} (${taal === 'uk' ? 'Брюссель' : 'Brussel'})`;

/** Leesbare accountnaam voor de strook (naam of e-mail; nooit iets geheims). */
export async function accountNaam(userId: string): Promise<string> {
  const [r] = await sql<{ naam: string; email: string }>("SELECT data->>'name' AS naam, data->>'email' AS email FROM app.records WHERE tbl = 'users' AND id = $1", [userId]).catch(() => []);
  return String(r?.naam || r?.email || '').slice(0, 60);
}

export async function siteMelding(userId: string, titel: BotTekst, tekst: BotTekst, link = '/aanmeldmethoden'): Promise<void> {
  await meld(userId, 'security', `${titel.uk} / ${titel.nl}`, `${tekst.uk} / ${tekst.nl}`, `${SITE_BASIS()}${link}`).catch(() => undefined);
}

/** Rood alarm naar de beheerder (eigenaar van de site) + auditregel. */
export async function beheerAlarm(soort: string, details: Record<string, unknown>, tekst: BotTekst): Promise<void> {
  const eigenaar = await eigenaarUserId().catch(() => '');
  await auditToevoegen({ ownerId: eigenaar || null, action: `telegram.alarm.${soort}`.slice(0, 120), type: 'identity', result: 'alarm', details }).catch(() => undefined);
  if (eigenaar) await meld(eigenaar, 'security', '🚨 Telegram: тривога безпеки / beveiligingsalarm', `${tekst.uk} / ${tekst.nl}`, `${SITE_BASIS()}/aanmeldmethoden-beheer`).catch(() => undefined);
}

/** Kaart naar alle gekoppelde Telegrams van een account met recht «meldingen». Fouten per chat stoppen de rest niet. */
export async function naarTelegrams(userId: string, inhoud: (taal: 'uk' | 'nl' | 'beide') => string, kaart: KaartSoort, knoppen?: (telegramId: string, taal: 'uk' | 'nl' | 'beide') => Promise<Knop[][]>, alleenKoppeling?: string): Promise<number> {
  const naam = await accountNaam(userId);
  let n = 0;
  for (const k of await koppelingenVanGebruiker(userId)) {
    if (alleenKoppeling && k.id !== alleenKoppeling) continue;
    if (!k.rechten.includes('meldingen') && !alleenKoppeling) continue;
    try {
      const { taal } = await taalVoor(k.telegram_id);
      const extra = knoppen ? await knoppen(k.telegram_id, taal) : [[{ url: `${SITE_BASIS()}/aanmeldmethoden`, tekst: t(TEKST.knopOpenSite, taal) }]];
      await stuur(k.chat_id, `${strook(naam, k.kleur, taal)}\n\n${inhoud(taal)}`, taal, { kaart, knoppen: await knoppenMaken(k.telegram_id, `melding-${k.id}-${Date.now()}`, extra) });
      n++;
    } catch { /* volgende chat */ }
  }
  return n;
}

export async function audit(userId: string | null, actie: string, resultaat: string, details: Record<string, unknown> = {}): Promise<void> {
  await auditToevoegen({ ownerId: userId, actorId: userId, action: `telegram.${actie}`.slice(0, 120), type: 'identity', result: resultaat, details }).catch(() => undefined);
}
