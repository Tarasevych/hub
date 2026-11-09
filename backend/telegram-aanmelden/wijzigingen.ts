// TELEGRAM-AANMELDEN v1 — wijzigingen in de Telegram-identiteit (punt C) toepassen op de database.
// De regels zelf staan puur en getest in shared/telegram-aanmelden/wijziging.ts; hier alleen de gevolgen:
// stand van de koppeling, historie, meldingen (site + Telegram), sessies beëindigen, apparaat blokkeren, alarm naar beheer.
import { koppeling as koppelingLezen, instellingen, sql, standZetten, vingerafdrukVan, type KoppelRij } from './opslag';
import { audit, beheerAlarm, naarTelegrams, siteMelding, tijdTekst } from './meldingen';
import { antwoordVerwerken, ernstVan, standNaWijziging, verlopenVerwerken, verschillen, snelGenoegGeweigerd, aftelVoor,
  type Antwoord, type AntwoordBron, type AntwoordGevolg, type VeldVerschil, type WijzigingErnst, type WijzigingToestand } from '../../shared/telegram-aanmelden/wijziging';
import { invullen, TEKST, VELD_NAMEN, t } from '../../shared/telegram-aanmelden/teksten';
import type { Vingerafdruk } from '../../shared/telegram-aanmelden/model';

export type SessieIntrekker = (userId: string, sessieIds: string[]) => Promise<number>;
let intrekker: SessieIntrekker = async () => 0;
/** backend/index.ts registreert hoe sessies worden ingetrokken (die logica hoort bij de sessielaag, niet hier). */
export const registreerSessieIntrekker = (fn: SessieIntrekker): void => { intrekker = fn; };

type WijzigingRij = { id: string; koppeling_id: string; user_id: string; ernst: WijzigingErnst; verschillen: VeldVerschil[]; status: WijzigingToestand['status'];
  telegram_antwoord: Antwoord | null; site_antwoord: Antwoord | null; conflict: boolean; getoond_op: Date | null; aangemaakt_op: Date; apparaat_sleutel?: string };
const toestandVan = (w: WijzigingRij): WijzigingToestand => ({ status: w.status, ernst: w.ernst, telegramAntwoord: w.telegram_antwoord, siteAntwoord: w.site_antwoord, conflict: w.conflict });

export type ControleUitkomst = { soort: 'gelijk' } | { soort: 'vervalsing' } | { soort: 'wijziging'; wijzigingId: string; ernst: WijzigingErnst; stand: KoppelRij['stand'] };

/** Vergelijkt wat Telegram nu meldt met wat bij de koppeling is opgeslagen. Elke bron (bot-update, widget, Mini App) komt hier. */
export async function vingerafdrukControleren(k: KoppelRij, nieuw: Partial<Vingerafdruk>, bron: string): Promise<ControleUitkomst> {
  const v = verschillen(vingerafdrukVan(k), nieuw);
  const ernst = ernstVan(v);
  if (!ernst) return { soort: 'gelijk' };
  if (ernst === 'vervalsing') {
    // Een ander Telegram-account dan gekoppeld: verzoek weigeren, de koppeling blijft ongemoeid.
    await audit(k.user_id, 'vervalsing', 'denied', { koppeling: k.id, bron, verwacht: k.telegram_id, gekregen: String(nieuw.telegramId || '') });
    await beheerAlarm('vervalsing', { koppeling: k.id, userId: k.user_id, bron }, { uk: `Спроба входу іншим акаунтом Telegram (${String(nieuw.telegramId || '')}) замість прив’язаного ${k.telegram_id}. Запит відхилено.`, nl: `Poging met een ander Telegram-account (${String(nieuw.telegramId || '')}) in plaats van het gekoppelde ${k.telegram_id}. Verzoek geweigerd.` });
    return { soort: 'vervalsing' };
  }
  // Is er al een open wijziging met precies dezelfde verschillen? Dan niet nog eens melden (geen spam bij elke update).
  const [open] = await sql<{ id: string; verschillen: VeldVerschil[] }>("SELECT id, verschillen FROM app.tg_wijzigingen WHERE koppeling_id = $1 AND status IN ('open','gezien') ORDER BY aangemaakt_op DESC LIMIT 1", [k.id]);
  if (open && JSON.stringify(open.verschillen) === JSON.stringify(v)) return { soort: 'wijziging', wijzigingId: open.id, ernst, stand: k.stand };
  const stand = standNaWijziging(k.stand, ernst);
  const [w] = await sql<{ id: string }>('INSERT INTO app.tg_wijzigingen (koppeling_id, user_id, ernst, verschillen) VALUES ($1,$2,$3,$4::jsonb) RETURNING id', [k.id, k.user_id, ernst, JSON.stringify(v)]);
  for (const x of v) await sql('INSERT INTO app.tg_vingerafdruk_historie (koppeling_id, veld, oud, nieuw) VALUES ($1,$2,$3,$4)', [k.id, x.veld, x.oud, x.nieuw]);
  await standZetten(k.id, stand, ernst === 'ernstig' ? 'telefoon-gewijzigd' : 'profiel-gewijzigd');
  await audit(k.user_id, 'wijziging.gezien', 'pending', { koppeling: k.id, ernst, velden: v.map((x) => x.veld), bron });
  await wijzigingMelden(k, w.id, v);
  return { soort: 'wijziging', wijzigingId: w.id, ernst, stand };
}

/** Kaart naar de betrokken Telegram (rood) + melding op de site. Alles volledig, tot het laatste cijfer (besluit van de eigenaar). */
async function wijzigingMelden(k: KoppelRij, wijzigingId: string, v: VeldVerschil[]): Promise<void> {
  const tekstIn = (taal: 'uk' | 'nl' | 'beide') => {
    const een = (tl: 'uk' | 'nl') => invullen(TEKST.wijzigingVraag[tl], {
      account: k.naam || k.gebruikersnaam || k.telegram_id,
      veld: v.map((x) => VELD_NAMEN[x.veld][tl]).join(', '),
      oud: v.map((x) => x.oud || '—').join(' · '), nieuw: v.map((x) => x.nieuw || '—').join(' · '),
      tijd: tijdTekst(tl),
    });
    return taal === 'beide' ? `${een('uk')}\n\n${een('nl')}` : een(taal);
  };
  await naarTelegrams(k.user_id, tekstIn, 'verdacht', async (_tg, taal) => [
    [{ letter: 'w', doel: wijzigingId, tekst: t(TEKST.knopWasIk, taal === 'beide' ? 'uk' : taal) }, { letter: 'x', doel: wijzigingId, tekst: t(TEKST.knopNietIk, taal === 'beide' ? 'uk' : taal) }],
  ], k.id).catch(() => 0);
  await siteMelding(k.user_id,
    { uk: '⚠️ Зміна у вашому Telegram', nl: '⚠️ Wijziging in uw Telegram' },
    { uk: `Змінилось: ${v.map((x) => `${VELD_NAMEN[x.veld].uk}: «${x.oud || '—'}» → «${x.nieuw || '—'}»`).join('; ')}. Вхід через цей Telegram призупинено, доки ви не підтвердите зміну ключем доступу.`,
      nl: `Gewijzigd: ${v.map((x) => `${VELD_NAMEN[x.veld].nl}: «${x.oud || '—'}» → «${x.nieuw || '—'}»`).join('; ')}. Aanmelden met deze Telegram staat op pauze tot u de wijziging met uw passkey bevestigt.` },
    `/aanmeldmethoden?wijziging=${encodeURIComponent(wijzigingId)}`);
}

export async function wijziging(id: string): Promise<WijzigingRij | null> {
  return (await sql<WijzigingRij>('SELECT * FROM app.tg_wijzigingen WHERE id::text = $1', [id]))[0] ?? null;
}

/** De site zegt: de bevestigingskaart is nu getoond (start van de server-side aftelling). */
export async function wijzigingGetoond(userId: string, id: string): Promise<{ aftelSeconden: number } | null> {
  const w = await wijziging(id);
  if (!w || w.user_id !== userId) return null;
  await sql('UPDATE app.tg_wijzigingen SET getoond_op = COALESCE(getoond_op, now()) WHERE id = $1', [w.id]);
  const inst = await instellingen();
  return { aftelSeconden: aftelVoor(w.ernst, inst.aftelSeconden, inst.aftelSecondenErnstig) };
}

export type AntwoordContext = { userId: string; bron: AntwoordBron; metPasskey: boolean; huidigeSessieIds?: string[]; begrepen?: boolean };
export type AntwoordResultaat = { ok: true; gevolg: AntwoordGevolg } | { ok: false; fout: 'ONBEKEND' | 'TE_SNEL' | 'NIET_BEGREPEN' | 'PASSKEY_NODIG' };

/** Verwerkt één antwoord uit Telegram of van de site. «Ні» van wie dan ook wint altijd (het veiligere antwoord). */
export async function wijzigingBeantwoorden(id: string, antwoord: Antwoord, c: AntwoordContext): Promise<AntwoordResultaat> {
  const w = await wijziging(id);
  if (!w || w.user_id !== c.userId) return { ok: false, fout: 'ONBEKEND' };
  const k = await koppelingLezen(w.koppeling_id);
  if (!k) return { ok: false, fout: 'ONBEKEND' };
  if (c.bron === 'site' && antwoord === 'ja') {
    const inst = await instellingen();
    // De aftelling wordt op de server afgedwongen: te snel = automatisch geklikt, telt niet.
    if (snelGenoegGeweigerd(w.getoond_op ? new Date(w.getoond_op).getTime() : 0, Date.now(), aftelVoor(w.ernst, inst.aftelSeconden, inst.aftelSecondenErnstig))) return { ok: false, fout: 'TE_SNEL' };
    if (w.ernst === 'ernstig' && !c.begrepen) return { ok: false, fout: 'NIET_BEGREPEN' };
    if (!c.metPasskey) return { ok: false, fout: 'PASSKEY_NODIG' };
  }
  const gevolg = antwoordVerwerken(toestandVan(w), k.stand, c.bron, antwoord, c.metPasskey);
  const s = gevolg.toestand;
  await sql(`UPDATE app.tg_wijzigingen SET status = $2, telegram_antwoord = $3, site_antwoord = $4, conflict = $5,
    afgehandeld_op = CASE WHEN $2 IN ('bevestigd','geweigerd','verlopen') THEN now() ELSE afgehandeld_op END WHERE id = $1`, [w.id, s.status, s.telegramAntwoord, s.siteAntwoord, s.conflict]);
  if (gevolg.koppelStand !== k.stand) await standZetten(k.id, gevolg.koppelStand, antwoord === 'nee' ? 'niet-ik' : gevolg.acties.includes('opnieuw-koppelen-vereist') ? 'opnieuw-koppelen' : '');
  await gevolgenUitvoeren(k, w, gevolg, c);
  await audit(c.userId, `wijziging.${c.bron}.${antwoord}`, antwoord === 'nee' ? 'denied' : 'success', { wijziging: w.id, koppeling: k.id, status: s.status, conflict: s.conflict });
  return { ok: true, gevolg };
}

async function gevolgenUitvoeren(k: KoppelRij, w: WijzigingRij, g: AntwoordGevolg, c: AntwoordContext): Promise<void> {
  if (g.acties.includes('vingerafdruk-opslaan')) {
    const nieuw: Record<string, string> = {};
    for (const x of w.verschillen) nieuw[x.veld] = x.nieuw;
    await sql(`UPDATE app.tg_koppelingen SET gebruikersnaam = COALESCE($2, gebruikersnaam), voornaam = COALESCE($3, voornaam), achternaam = COALESCE($4, achternaam),
      foto_id = COALESCE($5, foto_id) WHERE id = $1`, [k.id, nieuw.gebruikersnaam ?? null, nieuw.voornaam ?? null, nieuw.achternaam ?? null, nieuw.fotoId ?? null]);
    await sql("UPDATE app.tg_vingerafdruk_historie SET uitkomst = 'bevestigd' WHERE koppeling_id = $1 AND uitkomst = 'open'", [k.id]);
  }
  if (g.acties.includes('sessies-beeindigen')) {
    // Alle sessies die via DEZE koppeling zijn ontstaan (behalve de sessie van waaruit «Ні» op de site werd gegeven).
    const rijen = await sql<{ sessie_id: string }>("SELECT sessie_id FROM app.tg_inlog_verzoeken WHERE koppeling_id = $1 AND stand = 'ingewisseld' AND sessie_id IS NOT NULL", [k.id]);
    const behoud = new Set(c.huidigeSessieIds ?? []);
    await intrekker(k.user_id, rijen.map((r) => r.sessie_id).filter((s) => s && ![...behoud].some((b) => s.includes(b)))).catch(() => 0);
  }
  if (g.acties.includes('apparaat-blokkeren')) {
    const rijen = await sql<{ apparaat: string }>("SELECT DISTINCT apparaat FROM app.tg_inlog_verzoeken WHERE koppeling_id = $1 AND aangemaakt_op > now() - interval '7 days' AND apparaat <> ''", [k.id]);
    for (const r of rijen) await sql('INSERT INTO app.tg_geblokkeerd (user_id, sleutel) VALUES ($1,$2) ON CONFLICT DO NOTHING', [k.user_id, r.apparaat]);
  }
  if (g.acties.includes('opnieuw-koppelen-vereist')) await sql("UPDATE app.tg_vingerafdruk_historie SET uitkomst = 'opnieuw-koppelen' WHERE koppeling_id = $1 AND uitkomst = 'open'", [k.id]);
  if (g.toestand.conflict) {
    await naarTelegrams(k.user_id, (taal) => t(TEKST.conflict, taal), 'verdacht', undefined, k.id).catch(() => 0);
  }
  if (g.acties.includes('alarm-beheer')) {
    await beheerAlarm(g.toestand.conflict ? 'conflict' : 'niet-ik', { koppeling: k.id, userId: k.user_id, wijziging: w.id },
      g.toestand.conflict ? { uk: 'Суперечність: у Telegram підтвердили зміну, а на сайті заперечили. Прив’язку вимкнено, сеанси завершено.', nl: 'Tegenspraak: in Telegram werd de wijziging bevestigd, op de site ontkend. Koppeling uit, sessies beëindigd.' }
        : { uk: 'Користувач відповів «Це не я» на зміну Telegram. Прив’язку вимкнено, сеанси завершено.', nl: 'De gebruiker antwoordde «Dit ben ik niet» op een Telegram-wijziging. Koppeling uit, sessies beëindigd.' });
  }
  if (g.acties.includes('melden-eigenaar')) {
    await siteMelding(k.user_id, g.toestand.conflict ? { uk: '🚨 Ваш Telegram міг бути зламаний', nl: '🚨 Uw Telegram is mogelijk gekaapt' } : { uk: 'Прив’язку Telegram вимкнено', nl: 'Telegram-koppeling uitgeschakeld' },
      g.toestand.conflict ? TEKST.conflict : { uk: 'Ви відповіли «Це не я» або не підтвердили зміну вчасно. Вхід через цей Telegram вимкнено; сеанси з нього завершено. Щоб користуватися знову, прив’яжіть Telegram заново.', nl: 'U antwoordde «Dit ben ik niet» of bevestigde de wijziging niet op tijd. Aanmelden met deze Telegram staat uit; sessies ervan zijn beëindigd. Koppel de Telegram opnieuw om hem weer te gebruiken.' });
  }
}

/** Periodiek (statusdienst): onbeantwoorde wijzigingen na de termijn → koppeling uit. */
export async function verlopenWijzigingenAfhandelen(): Promise<number> {
  const inst = await instellingen();
  const open = await sql<WijzigingRij>("SELECT * FROM app.tg_wijzigingen WHERE status IN ('open','gezien') AND aangemaakt_op < now() - make_interval(hours => $1)", [inst.onbeantwoordUren]);
  let n = 0;
  for (const w of open) {
    const g = verlopenVerwerken(toestandVan(w), Date.now(), new Date(w.aangemaakt_op).getTime(), inst.onbeantwoordUren);
    if (!g) continue;
    await sql("UPDATE app.tg_wijzigingen SET status = 'verlopen', afgehandeld_op = now() WHERE id = $1 AND status IN ('open','gezien')", [w.id]);
    const k = await koppelingLezen(w.koppeling_id);
    if (k) { await standZetten(k.id, 'uitgeschakeld', 'niet-bevestigd'); await gevolgenUitvoeren(k, w, g, { userId: w.user_id, bron: 'site', metPasskey: false }); }
    await audit(w.user_id, 'wijziging.verlopen', 'denied', { wijziging: w.id });
    n++;
  }
  return n;
}
