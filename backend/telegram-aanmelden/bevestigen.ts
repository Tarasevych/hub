// TELEGRAM-AANMELDEN v1 — een handeling op de site bevestigen met Telegram of met de geheime code (punt E/F).
// De site vraagt (na 403 TELEGRAM_BEVESTIGING_NODIG) een bevestiging aan; de bot stuurt een kaart met eenmalige knoppen naar
// alle koppelingen van dit account met recht «bevestigen». Een tik op «✅ Підтвердити» maakt de bevestiging geldig voor
// precies deze gebruiker + sessie + handeling, 5 minuten, één keer (beleid-poort.ts verbruik()).
import { koppelingenVanGebruiker, sql } from './opslag';
import { nieuweId } from './cryptografie';
import { BEVESTIGING_GELDIG_MS, eisVoor, soortVan } from './beleid-poort';
import { codeControleren } from './code';
import { accountNaam, audit, beheerAlarm, siteMelding, tijdTekst } from './meldingen';
import { knoppenMaken, stuur, strook, taalVoor } from './berichten';
import { invullen, t, TEKST } from '../../shared/telegram-aanmelden/teksten';
import { tekstIn } from '../../shared/telegram-aanmelden/model';

export async function bevestigingAanvragen(userId: string, sessieId: string, actie: string): Promise<{ id: string; verlooptOp: string; verstuurd: number }> {
  if (!sessieId) throw new Error('SESSIE_ONBEKEND');
  const soort = await soortVan(actie);
  if (!soort) throw new Error('ONBEKENDE_ACTIE');
  const e = await eisVoor(userId, actie);
  if (!e || !e.eis.some((a) => a.includes('telegram'))) throw new Error('TELEGRAM_NIET_GEVRAAGD');
  const [{ n }] = await sql<{ n: number }>("SELECT count(*)::int AS n FROM app.tg_bevestigingen WHERE user_id = $1 AND aangemaakt_op > now() - interval '10 minutes'", [userId]);
  if (n >= 10) throw new Error('RATE_LIMITED');
  // Eerdere open aanvragen voor dezelfde handeling in deze sessie vervallen (geen stapel kaarten).
  await sql("UPDATE app.tg_bevestigingen SET stand = 'verlopen' WHERE user_id = $1 AND sessie_id = $2 AND actie = $3 AND stand = 'wacht'", [userId, sessieId, actie]);
  const id = nieuweId();
  const verloopt = new Date(Date.now() + BEVESTIGING_GELDIG_MS);
  await sql("INSERT INTO app.tg_bevestigingen (id, user_id, sessie_id, actie, methode, verloopt_op) VALUES ($1,$2,$3,$4,'telegram',$5)", [id, userId, sessieId, actie, verloopt]);
  const naam = await accountNaam(userId);
  let verstuurd = 0;
  for (const k of await koppelingenVanGebruiker(userId)) {
    if (k.stand !== 'actief' || !k.rechten.includes('bevestigen')) continue;
    try {
      const { taal } = await taalVoor(k.telegram_id);
      const een = (tl: 'uk' | 'nl') => invullen(TEKST.bevestigVraag[tl], { account: naam, actie: tekstIn(soort.naam, tl), tijd: tijdTekst(tl) });
      const tl: 'uk' | 'nl' = taal === 'nl' ? 'nl' : 'uk';
      await stuur(k.chat_id, `${strook(naam, k.kleur, taal)}\n\n${taal === 'beide' ? `${een('uk')}\n\n${een('nl')}` : een(taal)}`, taal, {
        kaart: soort.gevoelig ? 'nieuwApparaat' : 'gewoon',
        knoppen: await knoppenMaken(k.telegram_id, `bevestig-${id}`, [[{ letter: 'b', doel: `${id}:${k.id}`, tekst: t(TEKST.knopBevestigen, tl) }], [{ letter: 'n', doel: `b:${id}:${k.id}`, tekst: t(TEKST.knopNietIk, tl) }]]),
      });
      verstuurd++;
    } catch { /* volgende koppeling */ }
  }
  if (!verstuurd) {
    await sql("UPDATE app.tg_bevestigingen SET stand = 'verlopen' WHERE id = $1", [id]);
    throw new Error('TELEGRAM_NIET_BEREIKBAAR');
  }
  await audit(userId, 'bevestigen.aangevraagd', 'pending', { actie, verstuurd });
  return { id, verlooptOp: verloopt.toISOString(), verstuurd };
}

export async function bevestigingStatus(userId: string, sessieId: string, id: string): Promise<{ stand: string }> {
  const [r] = await sql<{ stand: string; verloopt_op: Date; sessie_id: string }>('SELECT stand, verloopt_op, sessie_id FROM app.tg_bevestigingen WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!r || r.sessie_id !== sessieId) throw new Error('VERZOEK_ONBEKEND');
  if (r.stand === 'wacht' && new Date(r.verloopt_op).getTime() < Date.now()) return { stand: 'verlopen' };
  return { stand: r.stand };
}

/** Knop in Telegram. doel = «<bevestigingId>:<koppelingId>». */
export async function bevestigingVanBot(doel: string, tg: string, ja: boolean): Promise<'bevestigd' | 'geweigerd' | 'verlopen'> {
  const [id, koppelingId] = doel.split(':');
  const [r] = await sql<{ id: string; user_id: string; actie: string; stand: string; verloopt_op: Date }>('SELECT * FROM app.tg_bevestigingen WHERE id = $1', [id]);
  if (!r || r.stand !== 'wacht' || new Date(r.verloopt_op).getTime() < Date.now()) return 'verlopen';
  const k = (await koppelingenVanGebruiker(r.user_id)).find((x) => x.id === koppelingId);
  if (!k || k.telegram_id !== tg || k.stand !== 'actief' || !k.rechten.includes('bevestigen')) return 'verlopen';
  if (ja) {
    const upd = await sql("UPDATE app.tg_bevestigingen SET stand = 'bevestigd', bevestigd_op = now(), koppeling_id = $2 WHERE id = $1 AND stand = 'wacht' RETURNING id", [id, k.id]);
    if (!upd.length) return 'verlopen';
    await sql('UPDATE app.tg_koppelingen SET laatst_gebruikt_op = now() WHERE id = $1', [k.id]);
    await audit(r.user_id, 'bevestigen.telegram', 'success', { actie: r.actie, koppeling: k.id });
    return 'bevestigd';
  }
  await sql("UPDATE app.tg_bevestigingen SET stand = 'geweigerd', koppeling_id = $2 WHERE id = $1 AND stand = 'wacht'", [id, k.id]);
  await audit(r.user_id, 'bevestigen.niet-ik', 'denied', { actie: r.actie, koppeling: k.id });
  await siteMelding(r.user_id, { uk: '⛔ Дію на сайті відхилено в Telegram', nl: '⛔ Handeling op de site geweigerd in Telegram' },
    { uk: 'У Telegram натиснули «Це не я» на запит підтвердження. Якщо ви нічого не робили на сайті, змініть ключі доступу й перевірте сеанси.', nl: 'In Telegram werd «Dit ben ik niet» getikt bij een bevestigingsverzoek. Deed u niets op de site, controleer dan uw sessies en sleutels.' }, '/sessions');
  await beheerAlarm('bevestigen-niet-ik', { userId: r.user_id, actie: r.actie }, { uk: 'Користувач відхилив у Telegram запит підтвердження дії.', nl: 'Een gebruiker weigerde in Telegram een bevestigingsverzoek.' });
  return 'geweigerd';
}

/** Geheime code op de site voor een handeling. Alarmcode: «gelukt» tonen, maar niets bevestigen (de handeling faalt daarna). */
export async function codeVoorActie(userId: string, sessieId: string, actie: string, code: string): Promise<{ ok: boolean; uitkomst: string }> {
  if (!sessieId) throw new Error('SESSIE_ONBEKEND');
  if (!(await soortVan(actie))) throw new Error('ONBEKENDE_ACTIE');
  const u = await codeControleren(userId, String(code || '').slice(0, 64));
  if (u === 'alarm') return { ok: true, uitkomst: 'ok' };
  if (u !== 'ok') return { ok: false, uitkomst: u };
  await sql("INSERT INTO app.tg_bevestigingen (id, user_id, sessie_id, actie, methode, stand, verloopt_op, bevestigd_op) VALUES ($1,$2,$3,$4,'code','bevestigd',$5,now())",
    [nieuweId(), userId, sessieId, actie, new Date(Date.now() + BEVESTIGING_GELDIG_MS)]);
  await audit(userId, 'bevestigen.code', 'success', { actie });
  return { ok: true, uitkomst: 'ok' };
}
