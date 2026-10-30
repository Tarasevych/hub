// Zuivere logica van de terugdraai-wizard (src/besluit/TerugdraaiMeester.tsx), apart zodat de eenheidstest haar zonder browser kan nakijken.
import type { BesluitStand } from '../../shared/eigenaar-besluit';
import type { PakketInfo } from '../platform/tar-lezen';

export type Release = BesluitStand['releases'][number];
export type Keuze = { naam: string; versie: string; auteur: string; agent: string; bronCommit: string; samenvatting: string; vorige: boolean };
export type TermRegel = { tijd: string; niveau: 'info' | 'warn' | 'error' | 'ok'; tekst: string; bron: 'site' | 'server' };
/** Na zoveel seconden zonder ophalen door de dienst op de server: melding met diagnosecommando's. */
export const WACHT_OPPAKKEN_S = 60;
export const MAX_KEUZES = 5;

/** De laatste vijf volledige, niet-actieve versies op de server (nieuwste eerst). */
export function vijfLaatste(releases: readonly Release[]): Keuze[] {
  return releases.filter((r) => r.bruikbaar && !r.actief).sort((a, b) => (a.naam < b.naam ? 1 : a.naam > b.naam ? -1 : 0)).slice(0, MAX_KEUZES)
    .map((r) => ({ naam: r.naam, versie: r.versie || '', auteur: r.auteur || '', agent: r.agent || '', bronCommit: r.bronCommit || r.commit || '', samenvatting: r.samenvatting || '', vorige: r.vorige }));
}

export type PakketUitkomst =
  | { ok: true; keuze: Keuze; waarschuwing?: 'COMMIT_ONBEKEND' }
  | { ok: false; code: 'PAKKET_KAPOT' | 'NIET_OP_SERVER' | 'IS_ACTIEF' | 'ONVOLLEDIG' | 'COMMIT_VERSCHILT'; naam?: string };

/**
 * Een .tar.gz van het apparaat koppelen aan een versie op de server. Root installeert geen ouder pakket (NIET_NIEUWER); terugdraaien kan
 * dus alleen naar een versie die al op de server staat. Gekoppeld op UITROL-VERSIE (of de mapnaam); de BRON-COMMIT moet dan ook kloppen.
 */
export function kiesUitPakket(info: PakketInfo, releases: readonly Release[]): PakketUitkomst {
  if (info.problemen.length || !info.versie) return { ok: false, code: 'PAKKET_KAPOT' };
  const r = releases.find((x) => x.versie === info.versie) || releases.find((x) => x.naam === info.versie);
  if (!r) return { ok: false, code: 'NIET_OP_SERVER' };
  if (r.actief) return { ok: false, code: 'IS_ACTIEF', naam: r.naam };
  if (!r.bruikbaar) return { ok: false, code: 'ONVOLLEDIG', naam: r.naam };
  const opServer = r.bronCommit || '';
  if (opServer && info.commit && opServer !== info.commit) return { ok: false, code: 'COMMIT_VERSCHILT', naam: r.naam };
  const keuze: Keuze = { naam: r.naam, versie: r.versie || info.versie, auteur: r.auteur || info.auteur, agent: r.agent || info.agent, bronCommit: opServer || info.commit, samenvatting: r.samenvatting || info.samenvatting, vorige: r.vorige };
  return opServer ? { ok: true, keuze } : { ok: true, keuze, waarschuwing: 'COMMIT_ONBEKEND' };
}

/** Regels van de site en van de server samen, op tijd, zonder dubbele. */
export function regelsSamenvoegen(lokaal: readonly TermRegel[], server: readonly TermRegel[]): TermRegel[] {
  const gezien = new Set<string>();
  return [...lokaal, ...server].filter((r) => { const k = `${r.bron}|${r.tijd}|${r.tekst}`; if (gezien.has(k)) return false; gezien.add(k); return true; })
    .sort((a, b) => (a.tijd < b.tijd ? -1 : a.tijd > b.tijd ? 1 : 0));
}

/** Moet de pagina melden dat de dienst op de server het besluit niet ophaalt? */
export const nietOpgepakt = (v: { inInbox: boolean; seconden: number } | undefined) => !!v && v.inInbox && v.seconden >= WACHT_OPPAKKEN_S;
