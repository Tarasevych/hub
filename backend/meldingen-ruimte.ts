// MELDINGEN IN TWEE GESCHEIDEN LADEN (klacht van de eigenaar, 20.10.2026: «панель сповіщень показує технічні сповіщення, коли
// користувач в особистому просторі — сповіщення не розділені між технічною й звичайною частинами акаунта»).
//
// WAT ER WAS EN WAAROM DAT TE WEINIG WAS
//   Sinds 18.10.2026 heeft elke meldingssoort een ruimte (shared/melding-soorten.ts) en filterde de BROWSER de bel per webruimte
//   (shared/meldingen-ruimte.ts). Maar de SERVER kende geen lade: siteNotificationOverview gaf altijd alle meldingen van de mens,
//   `notifications` telde alle ongelezen (beide ruimtes in één badge) en «alles gelezen» zette ook de technische op gelezen —
//   vanuit het persoonlijke tabblad. De scheiding bestond dus alleen in het beeld, niet in de gegevens.
//
// HET MODEL — hetzelfde als voor post, hmara, agenda, bord (shared/ruimte-scheiding.ts), geen tweede waarheid:
//   • elke melding draagt `ruimte`; een rij ZONDER veld is PERSOONLIJK (rijRuimte). Geen bestaande rij verhuist;
//   • AANMAKEN: een technische SOORT (uitrol, server, SIEM, geheimen, deur, toegangsverzoeken, …) is ALTIJD 'technisch', ook
//     uit een achtergrondtaak zonder tabblad; een persoonlijke soort krijgt de lade van de lopende aanroep (de poort van post of
//     van hmara/agenda bond die in een AsyncLocalStorage) en zonder lade 'prive'. De aanroeper kan de ruimte NIET meegeven;
//   • LEZEN, TELLEN, GELEZEN ZETTEN: alleen de LIVE ruimte van dit tabblad — dezelfde berekening als de poort van elke dienst
//     (backend/ruimte-scheiding.ts → gegevensRuimteVeilig: rol, status, profiel en lopende activering uit de database; de
//     client kan haar alleen verkleinen, nooit vergroten). Persoonlijk tabblad → alleen persoonlijke meldingen; technisch
//     tabblad → alleen technische. De technische laag ziet dus nooit «Passkey видалено» en de persoonlijke bel nooit «збій
//     встановлення» — ook niet als teller;
//   • GESLOTEN OF BEVROREN: geen lopende activering, rechten weg (bevroren) of de hub-lade van deze mens bevroren → de live
//     ruimte is 'prive' en de technische meldingen zijn onzichtbaar. Zij worden wél nog aangemaakt (de achtergrond breekt niet)
//     en verschijnen zodra de technische ruimte weer open is.
//
// SFEER (22.10.2026, shared/meldingen-soorten.ts, migratie 0107) — klacht: «технічні сповіщення досі попадають у панель користувача».
//   De lade zegt WAAR een rij ligt (bevriezen/overdragen/wissen), de sfeer zegt in WELK PANEEL zij hoort. Beide bestaan naast elkaar:
//   • AANMAKEN: sfeer = technisch bij een technische soort óf een technische lade; anders prive (sfeerVoorNieuweMelding);
//   • LEZEN/TELLEN/GELEZEN: het paneel van het tabblad (prive-tabblad → alleen sfeer 'prive'; technisch tabblad → alleen 'technisch'),
//     ook voor rijen van vóór 20.10.2026 die (zonder `ruimte`) in de persoonlijke lade liggen maar een technische soort hebben:
//     die zag de eigenaar tot vandaag in zijn gewone bel. Zij blijven in hun lade — geen rij verhuist — maar het etiket (0107) zet ze
//     in het technische paneel. meldingenInLade (shared) past deze regel toe; rijenVanLade is de pure lade-filter voor de uitvoerder.
//
// WAAROM MELDINGEN GEEN EIGEN DIENST IN DEELBARE_DIENSTEN ZIJN (de vraag uit de opdracht)
//   De standen eigen/gedeeld/uit zijn een KEUZE van de mens over zijn eigen gegevens. Meldingen hebben die keuze niet: een
//   mislukte uitrol is technisch en hoort bij het technische profiel, ook als die mens «spільно» koos; een nieuw apparaat op het
//   account is persoonlijk, ook met «роздільно». De ruimte van een melding is een eigenschap van haar BRON, niet van een stand.
//   'gedeeld' zou precies de klacht terugbrengen (technische meldingen in de persoonlijke lade) en 'uit' zou een technisch
//   profiel zijn uitrolfouten onthouden. Daarom: geen rij in app.ruimte_dienst_stand en geen regel in het scherm RuimteScheiding,
//   maar wél de bestaande regels van de kern. Voor BEVRIEZEN en voor het BESLUIT van de servereigenaar (overdragen/verwijderen)
//   horen meldingen bij de HUB-lade, dienst 'bord' — dezelfde plek als de hub-notities, het bureaublad en de blokken (migratie
//   0086): één register, één besluit, en de technische meldingen gaan mee of weg met de rest van de hub.
import type { AiRuimte } from '../shared/ai-ruimte';
import type { Lade } from '../shared/ruimte-scheiding';
import { meldingenInLade, rijRuimte, ruimteBijAanmaak, type MeldingRuimte } from '../shared/meldingen-ruimte';
import { sfeerBijAanmaak, sfeerVanRij, type MeldingSfeer } from '../shared/meldingen-soorten';
import { getPool } from '../server/platform/pg';
import { gegevensRuimteVeilig, registreerLadeUitvoerder, standVan, type LadeRegel } from './ruimte-scheiding';
import { huidigeLade as mailLade } from './mail-ruimte';
import { huidigeLadeContext as cloudAgendaLade } from './ruimte-cloud-agenda';

const sys = () => getPool('systeem');
export const MELDING_TABEL = 'site_notifications';

// ------------------------------------------------------------------------------------------------ aanmaken
/**
 * De lade waarin een NIEUWE melding voor `userId` terechtkomt. Technische soort → 'technisch', altijd. Persoonlijke soort → de
 * lade van de lopende aanroep als die voor dezelfde mens gebonden is (poort van post, of van hmara/agenda), anders 'prive'.
 * Nooit uit een verzoek: dit leest alleen de soort en de AsyncLocalStorage van het proces.
 */
export function ruimteVoorNieuweMelding(userId: string, kind: unknown): MeldingRuimte {
  const ctx = (() => {
    try { const m = mailLade(userId); if (m) return m.ruimte; } catch { /* geen postlade */ }
    try { const c = cloudAgendaLade(); if (c && c.lade.userId === userId) return c.lade.ruimte; } catch { /* geen hmara-/agendalade */ }
    return undefined;
  })();
  return ruimteBijAanmaak(kind, ctx);
}
/** De sfeer (paneel) van een NIEUWE melding: technische soort of technische lade → 'technisch', anders 'prive'. Nooit uit een verzoek. */
export function sfeerVoorNieuweMelding(userId: string, kind: unknown, ruimte: MeldingRuimte = ruimteVoorNieuweMelding(userId, kind)): MeldingSfeer {
  return sfeerBijAanmaak(kind, ruimte);
}

// ------------------------------------------------------------------------------------------------ lezen, tellen, gelezen
export type MeldingenLade = { lade: Lade; ruimte: AiRuimte; reden: 'prive' | 'technisch' | 'bevroren' };
/**
 * Uit welke lade mag DIT verzoek meldingen lezen (en op gelezen zetten)? De ruimte komt uit dezelfde live berekening als elke
 * dienstpoort; het tabblad kan haar alleen verkleinen. Is de hub-lade van deze mens bevroren (rechten weg, en nog geen besluit
 * van de servereigenaar), dan is de technische kant dicht: 'prive'. Elke fout: 'prive' (minste rechten).
 */
export async function meldingenLade(userId: string, herkomst: { tabContext?: unknown; rol?: string | null } = {}): Promise<MeldingenLade> {
  const prive = (reden: MeldingenLade['reden']): MeldingenLade => ({ lade: { userId, ruimte: 'prive' }, ruimte: 'prive', reden });
  if (!userId) return prive('prive');
  try {
    const tab = typeof herkomst.tabContext === 'string' ? herkomst.tabContext : '';
    const ruimte = await gegevensRuimteVeilig(userId, { tabContext: tab });
    if (ruimte !== 'technisch') return prive('prive');
    if ((await standVan(userId, 'bord')) === 'bevroren') return prive('bevroren');
    return { lade: { userId, ruimte: 'technisch' }, ruimte: 'technisch', reden: 'technisch' };
  } catch (err) {
    console.error('[meldingen-ruimte] lade onbepaalbaar, terug naar prive:', (err as Error).message);
    return prive('prive');
  }
}
/** Alleen de meldingen van dat PANEEL (sfeer = lade.ruimte); elke rij draagt haar effectieve lade (oude rij zonder veld → 'prive') én sfeer. */
export function meldingenVanLade<T extends object>(items: readonly T[], lade: Lade): Array<T & { ruimte: MeldingRuimte; sfeer: MeldingSfeer }> {
  return meldingenInLade(items, lade.ruimte).map((m) => ({ ...m, ruimte: rijRuimte(m), sfeer: sfeerVanRij(m) }));
}

// ------------------------------------------------------------------------------------------------ overdragen en wissen
/**
 * Uitvoerder in het register van de kern (backend/ruimte-scheiding.ts → registreerLadeUitvoerder), onder de HUB-lade 'bord'.
 * Raakt uitsluitend rijen die zelf 'technisch' zeggen: de persoonlijke meldingen van dezelfde mens (ook die van vóór 20.10.2026,
 * zonder veld) blijven altijd staan. Idempotent: een tweede aanroep vindt niets en meldt 0.
 *   overdragen  → naar de TECHNISCHE lade van de servereigenaar (zoals het bord doet): het zijn technische meldingen, en daar
 *                 kan hij ze lezen. Het e-mailadres gaat eraf, anders zou de oude ontvanger ze via emailMeldingen terugzien.
 *                 De sfeer gaat expliciet mee als 'technisch' (0107): technische lade ⇒ technisch paneel, ook voor een rij zonder etiket.
 *   verwijderen → weg.
 */
registreerLadeUitvoerder({
  dienst: 'bord', naam: 'meldingen',
  async overdragen({ vanUserId, naarUserId }) {
    const n = (await sys().query(
      `UPDATE app.records SET data = data || jsonb_build_object('recipientUserId', $2::text, 'recipientEmail', '', 'ruimte', 'technisch', 'sfeer', 'technisch', 'overgedragenVan', $1::text)
         WHERE tbl = $3 AND data->>'recipientUserId' = $1 AND data->>'ruimte' = 'technisch'`,
      [vanUserId, naarUserId, MELDING_TABEL])).rowCount ?? 0;
    return [{ tabel: `app.records/${MELDING_TABEL}`, rijen: n, opmerking: 'technische meldingen, naar de technische lade van de eigenaar' }] satisfies LadeRegel[];
  },
  async verwijderen({ userId }) {
    const n = (await sys().query(
      `DELETE FROM app.records WHERE tbl = $2 AND data->>'recipientUserId' = $1 AND data->>'ruimte' = 'technisch'`,
      [userId, MELDING_TABEL])).rowCount ?? 0;
    return [{ tabel: `app.records/${MELDING_TABEL}`, rijen: n }] satisfies LadeRegel[];
  },
});
