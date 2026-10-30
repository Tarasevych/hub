// Filters van het technische meldingenpaneel (TechMeldingen.tsx). Puur, voor tests.
import { soortInfo, voorkeurVoorSoort } from '../../shared/melding-soorten';
import type { MeldingErnst, MeldingType } from '../../shared/melding-typen';
import type { CanonicalServerNotification } from '../canoniek-meldingen';

export type Gelezen = 'alle' | 'ongelezen' | 'gelezen';

/** Zichtbare technische meldingen (verborgen types weg) + filters. Puur, voor tests. */
export function filterTechMeldingen(items: readonly CanonicalServerNotification[], soorten: Parameters<typeof voorkeurVoorSoort>[1], f: { type: MeldingType | ''; ernst: MeldingErnst | ''; gelezen: Gelezen }) {
  return items.filter((m) => {
    if (!voorkeurVoorSoort(m.kind, soorten).tonen) return false;
    const s = soortInfo(m.kind);
    if (f.type && s.type !== f.type) return false;
    if (f.ernst && s.ernst !== f.ernst) return false;
    if (f.gelezen === 'ongelezen' && m.read) return false;
    if (f.gelezen === 'gelezen' && !m.read) return false;
    return true;
  });
}
export const ongelezenTech = (items: readonly CanonicalServerNotification[], soorten: Parameters<typeof voorkeurVoorSoort>[1]) =>
  items.filter((m) => !m.read && voorkeurVoorSoort(m.kind, soorten).tonen).length;
