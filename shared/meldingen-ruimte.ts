// Meldingen per webruimte (14.10.2026): de bel in de accountruimte toont alleen wat de gebruiker zelf aangaat; de bel in de
// technische ruimte (admin.*, api.*, beheerpagina's van mcp.* met actief technisch profiel) alleen wat het sitebeheer aangaat.
// Zo verschijnt «Новий запит на доступ» niet tussen de post van de eigenaar, en «Passkey видалено» niet in het deploy-dashboard.
//
// De indeling is een eigenschap van de SOORT (kind) en van de link, nooit van de tekst: de server bepaalt beide. Onbekende
// soorten horen bij het account (veilige richting: sitebeheer krijgt niets wat niet aantoonbaar van het beheer is).
// Puur (geen React/DOM): dezelfde regel in de browser als in tests.
import { isBeheerPagina } from './beheer-paginas';
import { soortRuimte } from './melding-soorten';
import { isSfeer, meldingenVanSfeer, sfeerVanRij, type MeldingSfeer } from './meldingen-soorten';

export type MeldingRuimte = 'prive' | 'technisch';

// Welke soort technisch is, staat sinds 18.10.2026 in één tabel: shared/melding-soorten.ts (ook type, ernst en vereiste mogelijkheid).
const BEHEER_HOST = /^(admin|api)\.tarasevych\.com$/;

/** Ruimte uit de link: admin.* en api.* en beheerpagina's van mcp.* zijn technisch; al het andere zegt niets (undefined). */
export function ruimteVanLink(link: unknown): MeldingRuimte | undefined {
  if (typeof link !== 'string' || !link) return undefined;
  let u: URL; try { u = new URL(link, 'https://hub.tarasevych.com'); } catch { return undefined; }
  if (BEHEER_HOST.test(u.hostname)) return 'technisch';
  if (u.hostname === 'mcp.tarasevych.com') {
    const pagina = u.pathname.split('/').filter(Boolean)[0] || '';
    return isBeheerPagina('mcp', pagina) ? 'technisch' : undefined;
  }
  return undefined;
}

// ------------------------------------------------------------------------------------------------ de ruimte ALS GEGEVEN (20.10.2026)
// Tot 20.10.2026 was de ruimte van een melding alleen een eigenschap van de SOORT, uitgerekend in de browser. Dat scheidde de
// twee bellen, maar niet de GEGEVENS: de server leverde altijd alles, telde alles mee en «alles gelezen» raakte beide ruimtes.
// Klacht van de eigenaar: «панель сповіщень показує технічні сповіщення в особистому просторі». Daarom draagt elke melding nu
// zelf haar lade, precies zoals elke andere rij van de gescheiden gegevensruimtes (shared/ruimte-scheiding.ts):
//   • het veld heet `ruimte` (RUIMTE_VELD); ONTBREEKT het, dan is de rij PERSOONLIJK — geen bestaande melding verhuist;
//   • bij het AANMAKEN beslist de server (ruimteBijAanmaak): een technische SOORT is altijd 'technisch' (ook uit een
//     achtergrondtaak zonder tabblad), een persoonlijke soort volgt de lade van de lopende aanroep (of 'prive' zonder lade);
//   • bij het LEZEN, TELLEN en «GELEZEN» geldt alleen de live ruimte van het tabblad (backend/meldingen-ruimte.ts).
// De soort-regel hierboven blijft voor twee dingen: de keuze bij het aanmaken, en de terugval voor rijen die de server
// (nog) niet van een `ruimte` voorzag (oude clients, lokale meldingen).
export const RUIMTE_VELD = 'ruimte' as const;
/** De lade van een OPGESLAGEN melding: 'technisch' alleen als de rij dat zelf zegt; alles anders (ook ontbrekend/NULL) is 'prive'. */
export const rijRuimte = (rij: object | null | undefined): MeldingRuimte => (String((rij as { ruimte?: unknown } | null)?.ruimte ?? '') === 'technisch' ? 'technisch' : 'prive');
/** Welke lade een NIEUWE melding krijgt: technische soort → altijd technisch; anders de lade waarin zij ontstond (zonder lade: prive). */
export const ruimteBijAanmaak = (kind: unknown, ladeRuimte?: unknown): MeldingRuimte =>
  soortRuimte(kind) === 'technisch' ? 'technisch' : String(ladeRuimte ?? '') === 'technisch' ? 'technisch' : 'prive';
/**
 * Alleen de rijen van dit PANEEL (serverzijde). Sinds 22.10.2026 beslist de SFEER (shared/meldingen-soorten.ts, migratie 0107), niet de
 * lade: een oude rij van een technische soort zonder `ruimte` blijft in de persoonlijke LADE (bevriezen/overdragen/wissen, niets
 * verhuist) maar hoort in het TECHNISCHE paneel. Lade technisch ⇒ sfeer technisch, dus de technische lade blijft volledig technisch.
 * Rijen van vóór 0107 zonder etiket: dezelfde regel als de migratie (sfeerVanRij).
 */
export function meldingenInLade<T extends object>(items: readonly T[] | null | undefined, ruimte: MeldingRuimte): T[] {
  return meldingenVanSfeer(items, ruimte);
}
/** Alleen de rijen die ÉCHT in deze lade liggen (bevriezen/overdragen/wissen; «rij zonder ruimte = prive»). */
export function rijenVanLade<T extends object>(items: readonly T[] | null | undefined, ruimte: MeldingRuimte): T[] {
  return (Array.isArray(items) ? items : []).filter((m) => rijRuimte(m) === ruimte);
}

/**
 * De ruimte van een melding zoals het scherm haar ziet. Heeft de server de rij van een `ruimte` voorzien (sinds 20.10.2026
 * altijd: de effectieve lade, dus ook 'prive' voor oude rijen zonder veld), dan is DAT de waarheid — ook voor een oude rij met
 * een technische soort die in de persoonlijke lade staat: zij blijft persoonlijk, zoals elke rij van vóór de scheiding.
 * Zonder veld (lokale meldingen, oude antwoorden): de soort en de link, zoals vroeger.
 */
export function meldingRuimte(kind: unknown, link?: unknown, ruimte?: unknown, sfeer?: unknown): MeldingRuimte {
  // 22.10.2026: het etiket `sfeer` van de server (0107) is de waarheid voor het PANEEL; de lade alleen als terugval.
  if (isSfeer(sfeer)) return sfeer;
  if (ruimte === 'technisch' || ruimte === 'prive') return ruimte;
  if (soortRuimte(kind) === 'technisch') return 'technisch';
  return ruimteVanLink(link) ?? 'prive';
}

/** Alleen de meldingen van dit paneel (de bel van de andere sfeer toont ze niet, ook niet als badge). */
export function meldingenVoorRuimte<T extends object>(items: readonly T[] | null | undefined, ruimte: MeldingRuimte): T[] {
  return (Array.isArray(items) ? items : []).filter((m) => { const r = m as { kind?: unknown; link?: unknown; ruimte?: unknown; sfeer?: unknown } | null; return meldingRuimte(r?.kind, r?.link, r?.ruimte, r?.sfeer) === ruimte; });
}
/** Sfeer van een melding zoals het scherm haar toont (veld van de server, anders dezelfde regel als 0107). */
export const meldingSfeer = (m: object | null | undefined): MeldingSfeer => sfeerVanRij(m);

/** Opslagsleutel voor lokale meldingen en «gezien»-stand: per account én per ruimte, zodat ze elkaar niet raken. */
export const meldingScope = (basis: string, ruimte: MeldingRuimte) => (ruimte === 'technisch' ? `${basis}:technisch` : basis);
