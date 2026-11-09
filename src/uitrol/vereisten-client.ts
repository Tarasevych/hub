// UITROL-001 · Перевірка вимог ДО завантаження архіву (браузерна сторона).
// UITROL-001 · Vereistencontrole VÓÓR het uploaden van het archief (browserkant).
//
// Volgorde: 1) de browser beschrijft het archief (metadata, SHA-256, namen + grootte van alle migraties) → /vereisten;
// 2) staan er NIEUWE migraties in, dan stuurt de browser alleen hun SQL (≤ 1 MB) → /vereisten/proef; root probeert ze op een
// wegwerpkopie van het schema; 3) de browser vraagt de stand op tot de proef klaar is → /vereisten/stand.
// Pas daarna mag het eigenlijke uploaden beginnen: een archief dat niet past, kost dus geen megabytes verkeer meer.
// Niets hiervan vervangt de controles van root: die blijven bij de installatie ongewijzigd (SHA-256, passkey, terugrollen).
import { api } from '../platform/client';
import type { PakketInfo } from '../platform/tar-lezen';
import { PROEF_MAX_BYTES, type ArchiefBeschrijving, type VereistenAntwoord } from '../../shared/uitrol-vereisten';

const WACHT = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Hoe lang de browser maximaal op de proef wacht (de server zegt zelf na 180 s «niet beschikbaar»). */
const MAX_WACHT_MS = 200_000;

export function archiefBeschrijving(info: PakketInfo, bestand: { name: string; size: number }, leesMs: number): ArchiefBeschrijving {
  return {
    bestand: bestand.name, bytes: bestand.size, versie: info.versie, commit: info.commit, bovenmap: info.bovenmap, bestanden: info.bestanden,
    auteur: info.auteur, agent: info.agent, samenvattingTekens: info.samenvatting.replace(/\s+/g, ' ').length, manifest: !!info.manifest,
    manifestFouten: info.manifestFouten.length, installer: info.installer, basis: info.basis, migraties: info.migraties, problemen: info.problemen,
    leesMs: Math.round(leesMs),
  };
}

/** Voert de drie stappen uit en meldt elke tussenstand (voor het live overzicht). Gooit alleen bij netwerk-/serverfouten. */
export async function vereistenControleren(
  context: Record<string, unknown>,
  invoer: { info: PakketInfo; sha256: string; bestand: { name: string; size: number }; leesMs: number },
  bijwerken: (a: VereistenAntwoord) => void,
  afgebroken: () => boolean = () => false,
): Promise<VereistenAntwoord> {
  const archief = { ...archiefBeschrijving(invoer.info, invoer.bestand, invoer.leesMs), sha256: invoer.sha256, ontwikkelArchief: invoer.info.ontwikkelArchief };
  let ant = (await api.post('/api/owner/uitrol/vereisten', { ...context, archief })).data as VereistenAntwoord;
  bijwerken(ant);
  if (ant.proef.status === 'wacht-op-sql' && !afgebroken()) {
    const migraties = ant.nieuweMigraties.map((naam) => ({ naam, sql: invoer.info.migratieSql.get(naam) }));
    const ontbreekt = migraties.filter((m) => m.sql == null).map((m) => m.naam);
    const bytes = migraties.reduce((s, m) => s + new TextEncoder().encode(m.sql || '').byteLength, 0);
    // Een migratie die de browser niet kon lezen (> 512 KB) of te veel SQL: niet versturen — de server zegt dan eerlijk
    // «proef niet uitgevoerd» na zijn eigen grens; root probeert ze bij de installatie alsnog vóór npm en bouwen.
    if (ontbreekt.length || bytes > PROEF_MAX_BYTES) {
      const redenUk = ontbreekt.length ? `браузер не прочитав ${ontbreekt.join(', ')} (> 512 КБ)` : `SQL нових міграцій ${Math.round(bytes / 1024)} КБ > ${PROEF_MAX_BYTES / 1024} КБ`;
      const redenNl = ontbreekt.length ? `de browser las ${ontbreekt.join(', ')} niet (> 512 KB)` : `SQL van de nieuwe migraties ${Math.round(bytes / 1024)} KB > ${PROEF_MAX_BYTES / 1024} KB`;
      ant = { ...ant, klaar: true, proef: { status: 'niet-beschikbaar', uitslag: null },
        vereisten: ant.vereisten.map((x) => x.id !== 'migratie-proef' ? x : { ...x, niveau: 'waarschuwing' as const,
          waardeUk: `пробу не виконано: ${redenUk}; root повторить її першим кроком установлення`, waardeNl: `proef niet uitgevoerd: ${redenNl}; root herhaalt haar als eerste installatiestap` }),
        log: [...ant.log, { t: new Date().toISOString(), niveau: 'waarschuwing', tekst: `proef overgeslagen: ${redenNl}` }] };
      bijwerken(ant);
      return ant;
    }
    ant = (await api.post('/api/owner/uitrol/vereisten/proef', { ...context, id: ant.id, migraties })).data as VereistenAntwoord;
    bijwerken(ant);
  }
  const t0 = Date.now();
  let pauze = 400;
  while (ant.proef.status === 'bezig' && !afgebroken() && Date.now() - t0 < MAX_WACHT_MS) {
    await WACHT(pauze);
    pauze = Math.min(1500, Math.round(pauze * 1.25));
    ant = (await api.post('/api/owner/uitrol/vereisten/stand', { ...context, id: ant.id })).data as VereistenAntwoord;
    bijwerken(ant);
  }
  return ant;
}
