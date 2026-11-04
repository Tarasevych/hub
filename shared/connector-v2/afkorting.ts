// Connector v2 — ÉÉN afkortingsschema voor hulpmiddelnamen die anders langer zijn dan 64 tekens.
//
// Volle vorm (shared/connector-v2/namen.ts):
//   <essentie, ≤5 Nederlandse woorden>_<agent>_<subdomein>_<bron>_tarasevych_com_<gebruiker|beheer>
//   bron = de externe aanbieder als die verschilt van het subdomein (gmail, gcal, gdrive, gphotos, icloud, stripe);
//          `site` als het de site zelf is (geen externe aanbieder);
//          weggelaten als de aanbieder het subdomein al is (github.tarasevych.com → één keer `github`, nooit `github_github`).
//
// Past de volle vorm niet in 64 tekens, dan worden ALLEEN woorden van de essentie vervangen door de stam hieronder
// (kort, nog Nederlands leesbaar). Agent, subdomein, bron, `tarasevych_com` en het eind `_gebruiker`/`_beheer` blijven heel.
// Langste besparing eerst, en stoppen zodra de naam past — zo blijft zoveel mogelijk van de volle vorm staan.
// Twee opties mogen nooit op dezelfde gepubliceerde naam uitkomen; de test connector-integraties weigert een botsing.
// Puur.

/** Vol woord in de essentie → kortere Nederlandse stam. Alleen a-z en cijfers. */
export const STAM: Readonly<Record<string, string>> = Object.freeze({
  annuleren: 'stop',
  creeren: 'maak',
  gezondheid: 'staat',
  voorstel: 'plan',
  verwijderen: 'wis',
  reservekopieen: 'kopie',
  schermafdruk: 'beeld',
  geschiedenis: 'hist',
  formulier: 'form',
  repositories: 'repos',
  activiteit: 'werk',
  workflow: 'wf',
  logboek: 'log',
  update: 'upd',
  functie: 'fn',
  vlaggen: 'vlag',
  genereren: 'gen',
  afbeelding: 'beeld',
  pull: 'pr',
  request: 'req',
  controleren: 'check',
  instellen: 'zet',
  uitvoeren: 'doe',
  uploaden: 'zet',
  opstellen: 'stel',
  nieuw: 'nw',
  bestand: 'best',
  belasting: 'last',
});

/**
 * Verkort de essentie tot hoogstens `budget` tekens. Woorden zonder stam blijven staan.
 * Komt de essentie er nog niet onder, dan geeft de functie de kortste vorm terug; de naamtest vangt dat (lengte > 64).
 */
export function kortEssentie(essentie: string, budget: number): string {
  const woorden = essentie.split('_');
  const lengte = () => woorden.join('_').length;
  if (lengte() <= budget) return woorden.join('_');
  const volgorde = woorden
    .map((w, i) => ({ i, winst: STAM[w] ? w.length - STAM[w].length : 0 }))
    .filter((k) => k.winst > 0)
    .sort((a, b) => b.winst - a.winst || a.i - b.i);
  for (const k of volgorde) {
    woorden[k.i] = STAM[woorden[k.i]];
    if (lengte() <= budget) break;
  }
  return woorden.join('_');
}
