// TELEGRAM-AANMELDEN v1 — een handeling op de site bevestigen met Telegram of met de geheime code (punt E/F).
// De site vraagt (na 403 TELEGRAM_BEVESTIGING_NODIG) een bevestiging aan; de bot stuurt een kaart met eenmalige knoppen naar
// alle koppelingen van dit account met recht «bevestigen». Een tik op «✅ Підтвердити» maakt de bevestiging geldig voor
// precies deze gebruiker + sessie + handeling, 5 minuten, één keer (beleid-poort.ts verbruik()).
import { koppelingenVanGebruiker, sql } from './opslag';
import { plaatsTekst } from '../../shared/telegram-aanmelden/plaatsnamen';
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
// TELEGRAM-002: beveiligd venster (zelfde pictogram als op de site; geheime code daar als de gebruiker er een heeft).
import { recenteJuiste, vensterAan, vensterTrekking, vensterUrl } from './venster-sleutel';
import { codeActief } from './inloggen';
import { accountBeeld, telegramBeeld, type TelegramBeeld } from './account-foto';
import { categorieVoorActie } from '../../shared/bevestig-categorie';

export type Aangevraagd = { id: string; verlooptOp: string; verstuurd: number; soort?: VasteSoort; kandidaten?: number[]; juist?: number; venster?: boolean; codeNodig?: boolean;
  /** TELEGRAM-002: naar welke Telegram(s) het verzoek ging (naam, @naam, foto) — de site toont ze naast het pictogram. */
  ontvangers?: TelegramBeeld[] };

export async function bevestigingAanvragen(userId: string, sessieId: string, actie: string, opties: { apparaat?: string; ip?: string; locatie?: string; herkenning?: { toestel: string; plaats: string; land: string } } = {}): Promise<Aangevraagd> {
  if (!sessieId) throw new Error('SESSIE_ONBEKEND');
  const soort = await soortVan(actie);
  if (!soort) throw new Error('ONBEKENDE_ACTIE');
  const e = await eisVoor(userId, actie);
  if (!e || !e.eis.some((a) => a.includes('telegram'))) throw new Error('TELEGRAM_NIET_GEVRAAGD');
  const [{ n, wacht }] = await sql<{ n: number; wacht: number | null }>(
    "SELECT count(*)::int AS n, CEIL(EXTRACT(EPOCH FROM (min(aangemaakt_op) + interval '10 minutes' - now())))::int AS wacht FROM app.tg_bevestigingen WHERE user_id = $1 AND aangemaakt_op > now() - interval '10 minutes'",
    [userId],
  );
  if (n >= 10) throw Object.assign(new Error('RATE_LIMITED'), { retryAfter: Math.max(1, Number(wacht || 60)) });
  // Eerdere open aanvragen voor dezelfde handeling in deze sessie vervallen (geen stapel kaarten).
  await sql("UPDATE app.tg_bevestigingen SET stand = 'verlopen' WHERE user_id = $1 AND sessie_id = $2 AND actie = $3 AND stand = 'wacht'", [userId, sessieId, actie]);
  const id = nieuweId();
  const verloopt = new Date(Date.now() + BEVESTIGING_GELDIG_MS);
  // Symbolen alleen voor de klassieke step-up én als de beheerder dat aan heeft; anders de gewone «✅ Підтвердити».
  let trekking: { soort: VasteSoort; kandidaten: number[]; juist: number } | null = null;
  const venster = await vensterAan();
  const codeNodig = venster ? await codeActief(userId) : false;
  if (venster) trekking = vensterTrekking(await recenteJuiste({ userId }));
  else if (actie === 'stap-op') {
    const ai = await apparaatInstellingen().catch(() => null);
    if (ai?.telegramSymbolen) {
      const vk = await apparaatVoorkeuren(userId).catch(() => null);
      trekking = trek(vk ? effectieveSoort(ai, vk.waarde) : ai.symbolenStandaard, ai.aantalKandidaten, randomInt);
    }
  }
  const h = opties.herkenning ?? { toestel: '', plaats: '', land: '' };
  await sql("INSERT INTO app.tg_bevestigingen (id, user_id, sessie_id, actie, methode, verloopt_op, soort, kandidaten, juist, venster, code_nodig, toestel, plaats, land) VALUES ($1,$2,$3,$4,'telegram',$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    [id, userId, sessieId, actie, verloopt, trekking?.soort ?? null, trekking?.kandidaten ?? null, trekking?.juist ?? null, venster, codeNodig, h.toestel.slice(0, 80), h.plaats.slice(0, 120), /^[A-Z]{2}$/.test(h.land) ? h.land : '']);
  const naam = await accountNaam(userId);
  const apparaat = (x: 'uk' | 'nl') => [opties.herkenning?.toestel || String(opties.apparaat || '').slice(0, 80) || (x === 'uk' ? 'невідомий пристрій' : 'onbekend apparaat'), plaatsTekst(h.plaats, h.land, x)].filter(Boolean).join(' · ');
  const netwerk = [String(opties.ip || '').trim(), String(opties.locatie || '').trim()].filter(Boolean).join(' · ') || '—';
  const beeld = await accountBeeld(userId).catch(() => null);
  const ontvangers: TelegramBeeld[] = [];
  let verstuurd = 0;
  for (const k of await koppelingenVanGebruiker(userId)) {
    if (k.stand !== 'actief' || !k.rechten.includes('bevestigen')) continue;
    try {
      const { taal } = await taalVoor(k.telegram_id);
      const tl: 'uk' | 'nl' = taal === 'nl' ? 'nl' : 'uk';
      const actieTitel = tekstIn(soort.naam, tl);
      const cat = categorieVoorActie(actie, '', actieTitel);
      const een = (x: 'uk' | 'nl') => invullen((venster ? TEKST.bevestigVraagVenster : trekking ? TEKST.bevestigVraagSymbool : TEKST.bevestigVraag)[x], { account: naam, actie: tekstIn(soort.naam, x), tijd: tijdTekst(x), apparaat: apparaat(x), netwerk });
      const url = venster ? await vensterUrl('b', id, k.telegram_id, verloopt, tl) : '';
      const knoppen = venster
        ? [[{ webApp: url, tekst: t(TEKST.knopVensterBevestig, tl) }], [{ url, tekst: t(TEKST.knopVensterBrowser, tl) }], [{ letter: 'n' as const, doel: `b:${id}:${k.id}`, tekst: t(TEKST.knopNietIk, tl) }]]
        : trekking
        ? [trekking.kandidaten.map((_, pos) => ({ letter: 's' as const, doel: `${id}:${k.id}:${pos}`, tekst: telegramKnopTekst(trekking!.soort, trekking!.kandidaten[pos], tl) })), [{ letter: 'n' as const, doel: `b:${id}:${k.id}`, tekst: t(TEKST.knopNietIk, tl) }]]
        : [[{ letter: 'b' as const, doel: `${id}:${k.id}`, tekst: t(TEKST.knopBevestigen, tl) }], [{ letter: 'n' as const, doel: `b:${id}:${k.id}`, tekst: t(TEKST.knopNietIk, tl) }]];
      const compactKop = `${strook(naam, k.kleur, taal)} · ${tl === 'nl' ? cat.badgeNl : cat.badgeUk}`;
      const compactTekst = venster
        ? (tl === 'nl'
          ? `${actieTitel}\n${apparaat('nl')} · ${tijdTekst('nl')}\nTik «Controleren en bevestigen» om het pictogram te kiezen.`
          : `${actieTitel}\n${apparaat('uk')} · ${tijdTekst('uk')}\nНатисніть «Перевірити й підтвердити», щоб обрати піктограму.`)
        : (taal === 'beide' ? `${een('uk')}\n\n${een('nl')}` : een(taal));
      await stuur(k.chat_id, `${compactKop}\n${compactTekst}`, taal, {
        accountFoto: venster ? beeld?.foto || undefined : undefined,
        actieKaart: {
          categorie: cat.id,
          taal: tl,
          titel: actieTitel,
          accountNaam: beeld?.naam || naam,
          accountEmail: beeld?.email || '',
          accountFoto: beeld?.foto || '',
          accountLetter: beeld?.letter,
          toestel: opties.herkenning?.toestel || String(opties.apparaat || '').slice(0, 60),
          plaats: plaatsTekst(h.plaats, h.land, tl),
          tijd: tijdTekst(tl),
          gevoelig: soort.gevoelig,
        },
        kaart: soort.gevoelig ? 'nieuwApparaat' : 'gewoon',
        knoppen: await knoppenMaken(k.telegram_id, `bevestig-${id}`, knoppen),
      });
      verstuurd++;
      if (ontvangers.length < 3) ontvangers.push(await telegramBeeld(k));
    } catch { /* volgende koppeling */ }
  }
  if (!verstuurd) {
    await sql("UPDATE app.tg_bevestigingen SET stand = 'verlopen' WHERE id = $1", [id]);
    throw new Error('TELEGRAM_NIET_BEREIKBAAR');
  }
  await audit(userId, 'bevestigen.aangevraagd', 'pending', { actie, verstuurd, symbolen: !!trekking, venster });
  return { id, verlooptOp: verloopt.toISOString(), verstuurd, ...(trekking ? { soort: trekking.soort, kandidaten: trekking.kandidaten, juist: trekking.juist } : {}), ...(venster ? { venster: true, codeNodig } : {}), ontvangers };
}

/**
 * APPARAAT-001: tik op een symboolknop in Telegram. doel = «<bevestigingId>:<koppelingId>:<positie>». Het juiste symbool = «Так»;
 * een ander symbool = geweigerd (één poging) en telt mee in dezelfde teller als een verkeerd symbool op een ander apparaat.
 */
export async function bevestigingSymbool(doel: string, tg: string, opties: { venster?: boolean } = {}): Promise<'bevestigd' | 'fout-symbool' | 'geweigerd' | 'verlopen' | 'code'> {
  const [id, koppelingId, posTekst] = doel.split(':');
  const pos = Number(posTekst);
  const [r] = await sql<{ id: string; user_id: string; actie: string; stand: string; verloopt_op: Date; juist: number | null; kandidaten: number[] | null; venster: boolean; code_nodig: boolean }>('SELECT * FROM app.tg_bevestigingen WHERE id = $1', [id]);
  if (!r || r.stand !== 'wacht' || new Date(r.verloopt_op).getTime() < Date.now()) return 'verlopen';
  if (r.venster !== !!opties.venster) return 'verlopen'; // TELEGRAM-002: vensterverzoek alleen via het venster, en omgekeerd
  if (r.juist === null || !Array.isArray(r.kandidaten) || !Number.isInteger(pos) || pos < 0 || pos >= r.kandidaten.length) return 'verlopen';
  const k = (await koppelingenVanGebruiker(r.user_id)).find((x) => x.id === koppelingId);
  if (!k || k.telegram_id !== tg || k.stand !== 'actief' || !k.rechten.includes('bevestigen')) return 'verlopen';
  if (pos === Number(r.juist)) {
    if (r.venster && r.code_nodig) {
      // Juist pictogram, nu nog de geheime code in hetzelfde venster; tot dan blijft het verzoek «wacht».
      const upd = await sql("UPDATE app.tg_bevestigingen SET symbool_ok = true, koppeling_id = $2 WHERE id = $1 AND stand = 'wacht' RETURNING id", [id, k.id]);
      return upd.length ? 'code' : 'verlopen';
    }
    return bevestigingVanBot(`${id}:${koppelingId}`, tg, true, { venster: r.venster });
  }
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
export async function bevestigingVanBot(doel: string, tg: string, ja: boolean, opties: { venster?: boolean } = {}): Promise<'bevestigd' | 'geweigerd' | 'verlopen'> {
  const [id, koppelingId] = doel.split(':');
  const [r] = await sql<{ id: string; user_id: string; actie: string; stand: string; verloopt_op: Date; venster: boolean }>('SELECT * FROM app.tg_bevestigingen WHERE id = $1', [id]);
  if (!r || r.stand !== 'wacht' || new Date(r.verloopt_op).getTime() < Date.now()) return 'verlopen';
  // TELEGRAM-002: «Так» voor een vensterverzoek alleen vanuit het venster (juist pictogram ± code); «Ні» kan altijd.
  if (ja && r.venster && !opties.venster) return 'verlopen';
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

/** TELEGRAM-002: geheime code in het venster na het juiste pictogram. Alarmcode: «gelukt» tonen, niets bevestigen. */
export async function bevestigingVensterCode(id: string, tg: string, code: string): Promise<{ ok: boolean; uitkomst: string }> {
  const [r] = await sql<{ user_id: string; stand: string; verloopt_op: Date; venster: boolean; code_nodig: boolean; symbool_ok: boolean; koppeling_id: string | null }>('SELECT * FROM app.tg_bevestigingen WHERE id = $1', [id]);
  if (!r || r.stand !== 'wacht' || new Date(r.verloopt_op).getTime() < Date.now() || !r.venster || !r.code_nodig || !r.symbool_ok || !r.koppeling_id) return { ok: false, uitkomst: 'verlopen' };
  const k = (await koppelingenVanGebruiker(r.user_id)).find((x) => x.id === r.koppeling_id);
  if (!k || k.telegram_id !== tg) return { ok: false, uitkomst: 'verlopen' };
  const u = await codeControleren(r.user_id, String(code || '').slice(0, 64));
  if (u === 'alarm') { await sql("UPDATE app.tg_bevestigingen SET stand = 'geweigerd' WHERE id = $1 AND stand = 'wacht'", [id]); return { ok: true, uitkomst: 'ok' }; }
  if (u === 'ok') { const b = await bevestigingVanBot(`${id}:${k.id}`, tg, true, { venster: true }); return { ok: b === 'bevestigd', uitkomst: b === 'bevestigd' ? 'ok' : 'verlopen' }; }
  if (u === 'pauze' || u === 'uit' || u === 'geen') await sql("UPDATE app.tg_bevestigingen SET stand = 'geweigerd' WHERE id = $1 AND stand = 'wacht'", [id]);
  return { ok: false, uitkomst: u };
}
/** TELEGRAM-002: wat het venster over een bevestiging toont (zonder het juiste pictogram). */
export async function bevestigingVoorVenster(id: string, tg: string): Promise<{ stand: string; actie: string; toestel: string; plaats: string; land: string; kandidaten: number[]; verlooptOp: string; codeNodig: boolean; symboolOk: boolean; koppelingId: string; account: string; kleur: number; userId: string } | null> {
  const [r] = await sql<{ user_id: string; actie: string; stand: string; verloopt_op: Date; venster: boolean; code_nodig: boolean; symbool_ok: boolean; kandidaten: number[] | null; toestel: string; plaats: string; land: string }>('SELECT * FROM app.tg_bevestigingen WHERE id = $1', [id]);
  if (!r || !r.venster || !r.kandidaten) return null;
  const k = (await koppelingenVanGebruiker(r.user_id)).find((x) => x.telegram_id === tg && x.stand === 'actief' && x.rechten.includes('bevestigen'));
  if (!k) return null;
  const stand = r.stand === 'wacht' && new Date(r.verloopt_op).getTime() < Date.now() ? 'verlopen' : r.stand;
  return { stand, actie: r.actie, toestel: r.toestel, plaats: r.plaats, land: r.land, kandidaten: r.kandidaten.map(Number), verlooptOp: new Date(r.verloopt_op).toISOString(), codeNodig: r.code_nodig, symboolOk: r.symbool_ok, koppelingId: k.id, account: await accountNaam(r.user_id), kleur: k.kleur, userId: r.user_id };
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
