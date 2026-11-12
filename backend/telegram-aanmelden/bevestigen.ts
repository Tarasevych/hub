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
// APPARAAT-001: symboolknoppen in de kaart van de dienst «stap-op» (zelfde trekking als bij «ander apparaat»; de site licht er één uit).
import { instellingen as apparaatInstellingen, misluktTellen as apparaatMisluktTellen, voorkeuren as apparaatVoorkeuren } from '../apparaat-bevestiging/opslag';
import { effectieveSoort } from '../../shared/apparaat-bevestiging/model';
import { telegramKnopTekst, trek, type VasteSoort } from '../../shared/apparaat-bevestiging/symbolen';
import { randomInt } from 'node:crypto';

export type Aangevraagd = { id: string; verlooptOp: string; verstuurd: number; soort?: VasteSoort; kandidaten?: number[]; juist?: number };

export async function bevestigingAanvragen(userId: string, sessieId: string, actie: string, opties: { apparaat?: string } = {}): Promise<Aangevraagd> {
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
  // Symbolen alleen voor de klassieke step-up én als de beheerder dat aan heeft; anders de gewone «✅ Підтвердити».
  let trekking: { soort: VasteSoort; kandidaten: number[]; juist: number } | null = null;
  if (actie === 'stap-op') {
    const ai = await apparaatInstellingen().catch(() => null);
    if (ai?.telegramSymbolen) {
      const vk = await apparaatVoorkeuren(userId).catch(() => null);
      trekking = trek(vk ? effectieveSoort(ai, vk.waarde) : ai.symbolenStandaard, ai.aantalKandidaten, randomInt);
    }
  }
  await sql("INSERT INTO app.tg_bevestigingen (id, user_id, sessie_id, actie, methode, verloopt_op, soort, kandidaten, juist) VALUES ($1,$2,$3,$4,'telegram',$5,$6,$7,$8)",
    [id, userId, sessieId, actie, verloopt, trekking?.soort ?? null, trekking?.kandidaten ?? null, trekking?.juist ?? null]);
  const naam = await accountNaam(userId);
  const apparaat = String(opties.apparaat || '').slice(0, 80) || 'onbekend/onbekend';
  let verstuurd = 0;
  for (const k of await koppelingenVanGebruiker(userId)) {
    if (k.stand !== 'actief' || !k.rechten.includes('bevestigen')) continue;
    try {
      const { taal } = await taalVoor(k.telegram_id);
      const tl: 'uk' | 'nl' = taal === 'nl' ? 'nl' : 'uk';
      const een = (x: 'uk' | 'nl') => invullen((trekking ? TEKST.bevestigVraagSymbool : TEKST.bevestigVraag)[x], { account: naam, actie: tekstIn(soort.naam, x), tijd: tijdTekst(x), apparaat });
      const knoppen = trekking
        ? [trekking.kandidaten.map((_, pos) => ({ letter: 's' as const, doel: `${id}:${k.id}:${pos}`, tekst: telegramKnopTekst(trekking!.soort, trekking!.kandidaten[pos], tl) })), [{ letter: 'n' as const, doel: `b:${id}:${k.id}`, tekst: t(TEKST.knopNietIk, tl) }]]
        : [[{ letter: 'b' as const, doel: `${id}:${k.id}`, tekst: t(TEKST.knopBevestigen, tl) }], [{ letter: 'n' as const, doel: `b:${id}:${k.id}`, tekst: t(TEKST.knopNietIk, tl) }]];
      await stuur(k.chat_id, `${strook(naam, k.kleur, taal)}\n\n${taal === 'beide' ? `${een('uk')}\n\n${een('nl')}` : een(taal)}`, taal, {
        kaart: soort.gevoelig ? 'nieuwApparaat' : 'gewoon',
        knoppen: await knoppenMaken(k.telegram_id, `bevestig-${id}`, knoppen),
      });
      verstuurd++;
    } catch { /* volgende koppeling */ }
  }
  if (!verstuurd) {
    await sql("UPDATE app.tg_bevestigingen SET stand = 'verlopen' WHERE id = $1", [id]);
    throw new Error('TELEGRAM_NIET_BEREIKBAAR');
  }
  await audit(userId, 'bevestigen.aangevraagd', 'pending', { actie, verstuurd, symbolen: !!trekking });
  return { id, verlooptOp: verloopt.toISOString(), verstuurd, ...(trekking ? { soort: trekking.soort, kandidaten: trekking.kandidaten, juist: trekking.juist } : {}) };
}

/**
 * APPARAAT-001: tik op een symboolknop in Telegram. doel = «<bevestigingId>:<koppelingId>:<positie>». Het juiste symbool = «Так»;
 * een ander symbool = geweigerd (één poging) en telt mee in dezelfde teller als een verkeerd symbool op een ander apparaat.
 */
export async function bevestigingSymbool(doel: string, tg: string): Promise<'bevestigd' | 'fout-symbool' | 'geweigerd' | 'verlopen'> {
  const [id, koppelingId, posTekst] = doel.split(':');
  const pos = Number(posTekst);
  const [r] = await sql<{ id: string; user_id: string; actie: string; stand: string; verloopt_op: Date; juist: number | null; kandidaten: number[] | null }>('SELECT * FROM app.tg_bevestigingen WHERE id = $1', [id]);
  if (!r || r.stand !== 'wacht' || new Date(r.verloopt_op).getTime() < Date.now()) return 'verlopen';
  if (r.juist === null || !Array.isArray(r.kandidaten) || !Number.isInteger(pos) || pos < 0 || pos >= r.kandidaten.length) return 'verlopen';
  const k = (await koppelingenVanGebruiker(r.user_id)).find((x) => x.id === koppelingId);
  if (!k || k.telegram_id !== tg || k.stand !== 'actief' || !k.rechten.includes('bevestigen')) return 'verlopen';
  if (pos === Number(r.juist)) return bevestigingVanBot(`${id}:${koppelingId}`, tg, true);
  const upd = await sql("UPDATE app.tg_bevestigingen SET stand = 'geweigerd', koppeling_id = $2 WHERE id = $1 AND stand = 'wacht' RETURNING id", [id, k.id]);
  if (!upd.length) return 'verlopen';
  const inst = await apparaatInstellingen().catch(() => null);
  const teller = inst ? await apparaatMisluktTellen(r.user_id, inst).catch(() => null) : null;
  await audit(r.user_id, 'bevestigen.fout-symbool', 'denied', { actie: r.actie, koppeling: k.id, mislukt: teller?.mislukt ?? null, uitkomst: teller?.uitkomst ?? '' });
  if (teller?.uitkomst === 'uit') {
    await siteMelding(r.user_id, { uk: 'Підтвердження символом вимкнено', nl: 'Bevestigen met symbool uitgeschakeld' },
      { uk: `Неправильний символ обрано ${teller.mislukt} разів. Підтвердження з іншого пристрою та символом у Telegram вимкнено, доки ви не відновите його ключем доступу у «Способах входу».`, nl: `${teller.mislukt} keer een verkeerd symbool. Bevestigen vanaf een ander apparaat en met symbool in Telegram staat uit tot u het herstelt met uw toegangssleutel bij «Aanmeldmethoden».` });
    await beheerAlarm('symbool-uit', { userId: r.user_id, mislukt: teller.mislukt }, { uk: 'Підтвердження символом вимкнено після забагатьох помилок.', nl: 'Bevestigen met symbool uitgeschakeld na te veel fouten.' });
  }
  return 'fout-symbool';
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
