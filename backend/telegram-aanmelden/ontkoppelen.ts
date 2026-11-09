// TELEGRAM-AANMELDEN v1 — ontkoppelen (vanaf de site met passkey, of vanuit de bot) en koppeling aanpassen.
import { getPool } from '../../server/platform/pg';
import { koppeling as koppelingLezen, sql, standZetten } from './opslag';
import { audit, siteMelding, accountNaam } from './meldingen';
import { stuur, strook, taalVoor } from './berichten';
import { t, TEKST } from '../../shared/telegram-aanmelden/teksten';
import { isKoppelRecht, type KoppelRecht } from '../../shared/telegram-aanmelden/model';
import { NAAM_RE } from './koppelen';

/** Heeft dit account nog een andere manier om binnen te komen? (Google-identiteit of een passkey) */
export async function heeftAndereMethode(userId: string): Promise<boolean> {
  const r = await getPool('systeem').query("SELECT data->>'sub' AS sub FROM app.records WHERE tbl = 'users' AND id = $1", [userId]).catch(() => ({ rows: [] as Array<{ sub: string }> }));
  if (String(r.rows[0]?.sub || '')) return true;
  const [pk] = await sql('SELECT count(*)::int AS n FROM app.passkeys WHERE user_id = $1', [userId]).catch(() => [{ n: 0 }]);
  return Number(pk?.n || 0) > 0;
}

export async function ontkoppelen(koppelingId: string, door: { userId?: string; telegramId?: string }, bron: 'site' | 'bot' | 'beheer'): Promise<'ok' | 'onbekend' | 'laatste'> {
  const k = await koppelingLezen(koppelingId);
  if (!k || k.stand === 'uitgeschakeld') return 'onbekend';
  if (door.userId && door.userId !== k.user_id && bron !== 'beheer') return 'onbekend';
  if (door.telegramId && door.telegramId !== k.telegram_id) return 'onbekend';
  if (bron !== 'beheer' && !(await heeftAndereMethode(k.user_id))) return 'laatste';
  await standZetten(k.id, 'uitgeschakeld', bron === 'beheer' ? 'door-beheer' : 'ontkoppeld');
  await sql("UPDATE app.tg_wijzigingen SET status = 'verlopen', afgehandeld_op = now() WHERE koppeling_id = $1 AND status IN ('open','gezien')", [k.id]);
  await audit(k.user_id, `ontkoppelen.${bron}`, 'success', { koppeling: k.id, telegramId: k.telegram_id });
  await siteMelding(k.user_id, { uk: 'Telegram відв’язано', nl: 'Telegram ontkoppeld' },
    { uk: `Telegram ${k.gebruikersnaam ? `@${k.gebruikersnaam}` : k.telegram_id} відв’язано (${bron === 'bot' ? 'з бота' : bron === 'beheer' ? 'адміністратором' : 'на сайті'}). Якщо це були не ви, перевірте сеанси.`,
      nl: `Telegram ${k.gebruikersnaam ? `@${k.gebruikersnaam}` : k.telegram_id} ontkoppeld (${bron === 'bot' ? 'vanuit de bot' : bron === 'beheer' ? 'door de beheerder' : 'op de site'}). Was u dit niet, controleer dan uw sessies.` });
  if (bron !== 'bot') {
    try { const { taal } = await taalVoor(k.telegram_id); await stuur(k.chat_id, `${strook(await accountNaam(k.user_id), k.kleur, taal)}\n\n${t(TEKST.ontkoppeld, taal)}`, taal); } catch { /* extra */ }
  }
  return 'ok';
}

/** Naam en rechten van een eigen koppeling (poort 'koppeling-wijzigen'). */
export async function koppelingAanpassen(userId: string, koppelingId: string, o: { naam?: unknown; rechten?: unknown }): Promise<void> {
  const k = await koppelingLezen(koppelingId);
  if (!k || k.user_id !== userId || k.stand === 'uitgeschakeld') throw new Error('KOPPELING_ONBEKEND');
  const naam = o.naam === undefined ? k.naam : String(o.naam).trim().slice(0, 40);
  if (!NAAM_RE.test(naam)) throw new Error('NAAM_ONGELDIG');
  const rechten: KoppelRecht[] = o.rechten === undefined ? k.rechten : Array.isArray(o.rechten) ? [...new Set(o.rechten.filter(isKoppelRecht))] : k.rechten;
  if (!rechten.length) throw new Error('RECHTEN_LEEG');
  await sql('UPDATE app.tg_koppelingen SET naam = $2, rechten = $3::text[] WHERE id = $1', [k.id, naam, rechten]);
  await audit(userId, 'koppeling.aangepast', 'success', { koppeling: k.id, naam, rechten });
}
