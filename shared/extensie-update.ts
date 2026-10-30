// Updatebeleid van de browserextensie (audit 18.10.2026, punt 9). Zuiver, gedeeld door de site (ExtensieUpdateBand), het
// installatiepaneel en de tests. Eén plek voor «welke versie is nodig» en «welke is de nieuwste».
//
// Waarom zo:
//  - EXT_MIN_VERSIE: onder deze versie werkt de koppeling niet meer (oude protocolversie) → verplicht bijwerken, geen «later».
//  - De NIEUWSTE versie komt uit /downloads/extension-version.json (de build schrijft die uit extension/manifest.json); zo hoeft de
//    site niet opnieuw gebouwd te worden om een nieuwe extensie aan te kondigen.
//  - Automatisch bijwerken kan alleen als de extensie uit onze eigen CRX komt (update_url in het manifest) én er een geldige,
//    actuele CRX gepubliceerd is. «Load unpacked» kan Chrome nooit zelf bijwerken → handmatige stappen.

// Zelfde waarde als MIN_EXTENSIE_VERSIE in shared/extensie-ontgrendeling.ts (0.6.1: de extensie moet de markering en de
// diagnosestand kennen). Hier als letterlijke tekst, want scripts/bouw-extensie.mjs leest hem met een regex.
export const EXT_MIN_VERSIE = '0.6.2';
export const LATER_MS = 24 * 3600_000;

const num = (v: string) => v.split('.').map((x) => Number.parseInt(x, 10) || 0);
/** -1 / 0 / 1; ongeldige of lege versies tellen als 0.0.0. */
export function vergelijkVersie(a: string | undefined | null, b: string | undefined | null): number {
  const x = num(a || '0'), y = num(b || '0');
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

export type UpdateInvoer = {
  heeft?: string | null;            // versie die de extensie zelf meldt (PING/hello)
  nieuwste?: string | null;         // extension-version.json → version
  min?: string;                     // standaard EXT_MIN_VERSIE
  crxVersie?: string | null;        // extension-version.json → crx.version (null als er geen actuele CRX is)
  zelfGehost?: boolean;             // extensie meldt een update_url (CRX-installatie), niet «Load unpacked»
  laterTot?: number;                // «Нагадати пізніше» tot dit tijdstip (ms)
  nu?: number;
};
export type UpdateAdvies = {
  toon: boolean;                    // band tonen?
  verplicht: boolean;               // onder de minimale versie: geen «later», koppeling werkt niet
  automatisch: boolean;             // knop «Оновити автоматично» heeft zin
  van: string; naar: string;
  reden: 'actueel' | 'onbekend' | 'later' | 'verouderd' | 'te-oud';
};

export function updateAdvies(i: UpdateInvoer): UpdateAdvies {
  const min = i.min || EXT_MIN_VERSIE;
  const van = i.heeft || '', naar = i.nieuwste || min;
  const nu = i.nu ?? Date.now();
  if (!van) return { toon: false, verplicht: false, automatisch: false, van, naar, reden: 'onbekend' };
  const teOud = vergelijkVersie(van, min) < 0;
  const ouder = vergelijkVersie(van, naar) < 0;
  if (!teOud && !ouder) return { toon: false, verplicht: false, automatisch: false, van, naar, reden: 'actueel' };
  const automatisch = !!i.zelfGehost && !!i.crxVersie && vergelijkVersie(i.crxVersie, van) > 0;
  if (!teOud && i.laterTot && i.laterTot > nu) return { toon: false, verplicht: false, automatisch, van, naar, reden: 'later' };
  return { toon: true, verplicht: teOud, automatisch, van, naar: teOud && vergelijkVersie(naar, min) < 0 ? min : naar, reden: teOud ? 'te-oud' : 'verouderd' };
}

/** Is het gepubliceerde versiebestand in orde met het manifest? (build-controle, ook in tests) */
export function versieBestandKlopt(manifestVersie: string, versieJson: { version?: string; minVersion?: string; crx?: { version?: string } | null }, updatesXml?: string | null) {
  const fouten: string[] = [];
  if (versieJson.version !== manifestVersie) fouten.push(`version ${versieJson.version} ≠ manifest ${manifestVersie}`);
  if (!versieJson.minVersion || vergelijkVersie(versieJson.minVersion, manifestVersie) > 0) fouten.push('minVersion ontbreekt of is hoger dan het manifest');
  if (versieJson.crx && versieJson.crx.version !== manifestVersie) fouten.push(`crx ${versieJson.crx.version} ≠ manifest ${manifestVersie}`);
  if (versieJson.crx && !updatesXml) fouten.push('crx gepubliceerd zonder updates.xml');
  if (updatesXml) {
    const m = /version='([0-9.]+)'/.exec(updatesXml);
    if (!m || m[1] !== manifestVersie) fouten.push(`updates.xml ${m?.[1] ?? '?'} ≠ manifest ${manifestVersie}`);
    if (!versieJson.crx) fouten.push('updates.xml zonder gepubliceerde crx');
  }
  return fouten;
}
